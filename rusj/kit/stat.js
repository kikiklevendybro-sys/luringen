/* rusj — anonymous statistics client. The sender described in statistikk/KLIENT.md.

   A classic script with no dependencies, meant to be published as /felles/stat.js and loaded
   (defer) on every page, before the kit. It tells the statistics Worker a few counter names from
   a fixed vocabulary ("side.ordugla", "besok", "enhet.igar", "tid.3" …) and nothing else: no id
   of any kind, no free text, no clock time, no settings, no score.

   «New or returning» is worked out here, on the phone, from one small note in localStorage
   (rusj.stat: the day number of the last visit and the length of the visit in progress). The
   note never leaves the phone; only the resulting category does.

   It sends nothing at all when window.RUSJ_STAT is not set, when the visitor has asked not to be
   tracked (Do Not Track, Global Privacy Control), when data saving is on, inside a frame, and in
   automated browsers. It never retries, never waits for an answer and never throws. */
(function (w) {
  "use strict";
  var doc = w.document;
  var nav = w.navigator || {};
  var MAL = typeof w.RUSJ_STAT === "string" ? w.RUSJ_STAT.replace(/\/+$/, "") : "";
  // false: never read or write localStorage for statistics (then only page views, starts,
  // finishes and finished dailies are sent — no visits, no new/returning, no time).
  var LAGRING = w.RUSJ_STAT_LAGRING !== false;
  var LAGER = "rusj.stat";
  var PAUSE = 30 * 60 * 1000; // this long without rusj on screen ends a visit
  var TRINN = [1, 3, 10, 30]; // minutes on screen that are reported
  var REKKER = [30, 14, 7, 4, 2, 1]; // streak groups, by their first day
  var MAKS_NOKLER = 16; // names in one request (the Worker's limit)
  var MAKS_SENDINGER = 40; // requests from one page load, whatever happens
  var VENT = 1500; // ms to collect names before sending
  var PULS = 30000; // ms between time checks while on screen
  var MAKS_SPRANG = 60000; // one time check never adds more than this (a sleeping phone)

  function stille() {
    if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i.test(MAL)) return true;
    if (nav.doNotTrack === "1" || w.doNotTrack === "1" || nav.msDoNotTrack === "1") return true;
    if (nav.globalPrivacyControl === true) return true;
    if (nav.connection && nav.connection.saveData === true) return true;
    if (nav.webdriver === true) return true;
    try {
      if (w.self !== w.top) return true;
    } catch (e) {
      return true;
    }
    return false;
  }

  var ingenting = function () {};
  if (!doc || stille()) {
    w.RusjStat = { hendelse: ingenting, daglig: ingenting, av: true };
    return;
  }

  // ---------- Small helpers ----------

  // Today's day number in Norway (days since 1970) — the same as R.dag().nr in the kit.
  function dagNr(naa) {
    var a, m, d;
    try {
      var deler = {};
      var liste = new w.Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(naa);
      for (var i = 0; i < liste.length; i++) deler[liste[i].type] = Number(liste[i].value);
      a = deler.year;
      m = deler.month;
      d = deler.day;
    } catch (e) {
      /* fall through */
    }
    if (!(a > 0 && m > 0 && d > 0)) {
      a = naa.getFullYear();
      m = naa.getMonth() + 1;
      d = naa.getDate();
    }
    return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
  }
  var ukeAv = function (nr) {
    return Math.floor((nr + 3) / 7); // weeks run Monday–Sunday
  };
  var mndAv = function (nr) {
    var d = new Date(nr * 86400000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };

  // "forside", a game id (the first part of the address), or "annet".
  function side() {
    var deler = String((w.location && w.location.pathname) || "/").split("/");
    var del = deler[1] || "";
    // /en/… and /da/…: the same games under their own names; count them by the game's id.
    if (del === "en" || del === "da") {
      var spill = w.document && w.document.documentElement && w.document.documentElement.getAttribute("data-spill");
      if (spill) return /^[a-z0-9]{2,24}$/.test(spill) ? spill : "annet";
      del = deler[2] || "";
      if (del === "" || del === "index.html") return "forside";
      return "annet";
    }
    if (del === "" || del === "index.html") return "forside";
    return /^[a-z0-9]{2,24}$/.test(del) ? del : "annet";
  }

  function installert() {
    try {
      return !!((w.matchMedia && w.matchMedia("(display-mode: standalone)").matches) || nav.standalone);
    } catch (e) {
      return false;
    }
  }

  // The note on this phone: { v: 1, dag, sist, tid, trinn }.
  //   dag    day number of the last day this phone was counted
  //   sist   when rusj was last on screen (ms)
  //   tid    time on screen in the visit in progress (ms)
  //   trinn  how many of TRINN are already reported for this visit
  function les() {
    try {
      var s = JSON.parse(w.localStorage.getItem(LAGER));
      return s && typeof s === "object" && typeof s.dag === "number" ? s : null;
    } catch (e) {
      return null;
    }
  }
  function skriv(s) {
    try {
      var tekst = JSON.stringify(s);
      w.localStorage.setItem(LAGER, tekst);
      return w.localStorage.getItem(LAGER) === tekst;
    } catch (e) {
      return false;
    }
  }

  // ---------- Sending ----------

  var ko = [];
  var venter = null;
  var sendinger = 0;

  function send() {
    if (venter !== null) {
      w.clearTimeout(venter);
      venter = null;
    }
    if (!ko.length) return;
    var kropp = JSON.stringify({ v: 1, k: ko });
    ko = [];
    if (sendinger >= MAKS_SENDINGER) return;
    sendinger++;
    try {
      // text/plain needs no preflight. keepalive lets the request finish while the page closes.
      // (Not sendBeacon: with the site's no-referrer policy it would say «Origin: null».)
      var p = w.fetch(MAL + "/t", { method: "POST", body: kropp, headers: { "Content-Type": "text/plain" }, mode: "cors", credentials: "omit", cache: "no-store", keepalive: true, referrerPolicy: "no-referrer" });
      if (p && p.catch) p.catch(ingenting);
    } catch (e) {
      /* dropped: statistics must never disturb a game */
    }
  }

  function meld(nokkel) {
    if (ko.indexOf(nokkel) < 0 && ko.length < MAKS_NOKLER) ko.push(nokkel);
    if (venter === null) venter = w.setTimeout(send, VENT);
  }

  // ---------- Visits, new/returning and time ----------

  var kanLagre = false; // the note could be written: visits and time may be reported
  var synligFra = null; // when the current stretch on screen began (ms), or null

  // rusj came on screen (page load, or back from the background).
  function aktiv(naa) {
    if (!LAGRING) return;
    var idag = dagNr(new Date(naa));
    var s = les();
    var forrige = s ? s.dag : null;
    if (!s) s = { v: 1, dag: idag, sist: 0, tid: 0, trinn: 0 };
    var siden = naa - (Number(s.sist) || 0);
    var nyttBesok = !(siden >= 0 && siden < PAUSE);
    var dager = forrige === null ? null : idag - forrige;
    var nar = dager === null ? "ny" : dager === 1 ? "igar" : dager >= 2 && dager <= 7 ? "uke" : dager >= 8 ? "lenge" : null;
    if (nyttBesok) {
      s.tid = 0;
      s.trinn = 0;
    }
    s.v = 1;
    s.dag = idag; // (also heals a note from a phone whose clock was ahead)
    s.sist = naa;
    kanLagre = skriv(s);
    synligFra = naa;
    // A phone that cannot remember would look new on every page: then say nothing about it.
    if (!kanLagre) return;
    if (nyttBesok) meld("besok");
    if (nar) {
      meld("enhet." + nar);
      if (forrige === null || ukeAv(forrige) !== ukeAv(idag)) meld("unik.uke");
      if (forrige === null || mndAv(forrige) !== mndAv(idag)) meld("unik.mnd");
      if (installert()) meld("app");
    }
  }

  // Adds the time on screen since the last check and reports the steps the visit has passed.
  function tikk(naa) {
    if (!kanLagre || synligFra === null) return;
    var s = les();
    if (!s) return;
    var sprang = Math.max(0, Math.min(MAKS_SPRANG, naa - synligFra));
    synligFra = naa;
    s.tid = (Number(s.tid) || 0) + sprang;
    s.sist = naa;
    var trinn = Math.max(0, Math.min(TRINN.length, Math.floor(Number(s.trinn) || 0)));
    while (trinn < TRINN.length && s.tid >= TRINN[trinn] * 60000) {
      meld("tid." + TRINN[trinn]);
      trinn++;
    }
    s.trinn = trinn;
    skriv(s);
  }

  function borte(naa) {
    tikk(naa);
    synligFra = null;
    send();
  }

  // ---------- What the kit calls ----------

  // From R.statistikk: only "start" and "ferdig" are counted, per game. The data object the games
  // pass along (mode, players, level …) is never sent.
  function hendelse(navn) {
    var id = side();
    if ((navn !== "start" && navn !== "ferdig") || id === "forside" || id === "annet") return;
    meld(navn + "." + id);
  }

  // From R.dagligFerdig, the first time today's daily puzzle in this game is finished.
  //   antall  how many of today's dailies this phone has now finished (1, 2, 3 …)
  //   rekke   the site streak in days, this day included (1 or more)
  function daglig(antall, rekke) {
    var id = side();
    if (id === "forside" || id === "annet") return;
    meld("daglig." + id);
    if (!LAGRING) return;
    antall = Math.floor(Number(antall));
    if (!(antall >= 1 && antall <= 9)) return;
    meld("dagens." + antall);
    if (antall !== 1) return;
    rekke = Math.max(1, Math.floor(Number(rekke)) || 1);
    for (var i = 0; i < REKKER.length; i++) {
      if (rekke >= REKKER[i]) {
        meld("rekke." + REKKER[i]);
        break;
      }
    }
  }

  w.RusjStat = { hendelse: hendelse, daglig: daglig, av: false };

  // ---------- Start ----------

  var startet = false;
  function start() {
    startet = true;
    meld("side." + side());
    aktiv(Date.now());
  }

  if (doc.visibilityState !== "hidden") start(); // a page opened in the background waits
  doc.addEventListener("visibilitychange", function () {
    var naa = Date.now();
    if (doc.visibilityState === "hidden") borte(naa);
    else if (!startet) start();
    else aktiv(naa);
  });
  w.addEventListener("pagehide", function () {
    borte(Date.now());
  });
  // Back/forward can bring a page back without loading it again: that is a page view too.
  w.addEventListener("pageshow", function (e) {
    if (e && e.persisted && startet) {
      meld("side." + side());
      aktiv(Date.now());
    }
  });
  w.setInterval(function () {
    if (synligFra !== null) tikk(Date.now());
  }, PULS);
})(window);
