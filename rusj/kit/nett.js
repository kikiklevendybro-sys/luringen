/* rusj/kit/nett.js — «Spill med en venn på nett»: play a rusj game with friends on their own phones,
   from different places, in real time (R.nett).

   Loaded (after the kit, before the game) only on the pages of games with "nett": true in spill.json,
   and only when the build has an address for the rooms (NETT_ADRESSE in scripts/rusj.mjs), written
   as window.RUSJ_NETT in front of this file. The rooms are the rusj-nett Worker (nett/): the protocol
   and the rules for games are in nett/KLIENT.md.

   How it fits the kit:
   - A game passes `nett: { min, maks, oppsett, oppsettTekst, start, trekk, skjerm, tur, ferdig, etter }`
     to Rusj.start. This file wraps Rusj.start: it adds the screen «nett» (joining from a link, the
     waiting room, a friendly error; the home-screen button makes a room at once), the actions
     «nett-*», the title in the top bar as the status line while online («Din tur», «Venter på …»,
     «Kobler til igjen …»), and reads #nett=<kode> from the address. Kept small on purpose.
   - While a match on the net runs, the kit plays it in a separate state (R._nettBytt): never saved,
     rebuilt from the room's moves on every reload. The game on this phone is left as it was.
   - The phone applies moves only as the room sends them back (its own too), so every phone sees the
     same order. A game's own input handlers call R.nett.send(trekk) instead of playing the move.
   - R.navn(i) returns the nickname of seat i while online, so the game's multi-player texts work.
   Stored on this phone (key «nett»): per game the room code and the seat token while a match lasts
   (and a secret the game keeps for itself, e.g. Admiralen's fleet). The nickname is the first of the
   kit's shared names; nothing more is stored for it. */
(function () {
  "use strict";
  const R = window.Rusj;
  const ADR = typeof window.RUSJ_NETT === "string" && /^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/.test(window.RUSJ_NETT) ? window.RUSJ_NETT : "";
  if (!R || typeof R.start !== "function" || !ADR || typeof R._nettBytt !== "function") return;
  const esc = R.esc;
  const $ = (s) => document.querySelector(s);
  const WS_ADR = ADR.replace(/^http/, "ws");
  const KODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
  const LEVETID = 24 * 60 * 60 * 1000; // a room lives a day after its last move
  const GJENOPPTA = 3 * 60 * 60 * 1000; // a reload within 3 hours goes straight back into the match
  const SLUTTKODER = new Set([1000, 4000, 4001, 4003, 4004, 4008]); // closed on purpose: no reconnect
  // The six preset reactions (the room only ever sees their number).
  const REAKSJONER = [
    ["👍", R.t("Tommel opp")],
    ["😂", R.t("Ler")],
    ["😮", R.t("Wow")],
    ["😅", R.t("Puh")],
    ["👏", R.t("Applaus")],
    ["🎉", R.t("Feiring")],
  ];

  let APP = null; // the game's definition
  let DEF = null; // its nett block
  let ekteNavn = null; // R.navn on this phone (restored when leaving)
  const N = {
    fase: null, // "bli" | "kobler" | "vent" | "spill" | "feil"
    feil: null, // why the error screen shows
    kode: null,
    token: null,
    du: -1, // my seat
    navn: "", // my nickname
    rom: null, // { spill, oppsett, fro, kamp, min, maks, startet, ferdig, seter }
    logg: [], // the moves applied, [[seat, move]]
    oppsett: null, // the host's setup, before the room has it
    fro: 0,
    ws: null,
    tilkoblet: false,
    forsok: 0,
    igjenId: null,
    pingId: null,
    sist: 0,
    sendt: null, // place of the move in flight
    ferdigSendt: false,
    slutt: false, // leaving on purpose: no reconnect
    vert: false, // this phone made the room
    status: "", // "med" | "borte": the line, as last said
    borteVist: new Set(), // seats whose leaving was shown
  };

  // ---------- Stored on this phone ----------
  const lesLager = () => {
    const v = R.les("nett", null);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  };
  const okter = () => {
    const l = lesLager();
    return l.okter && typeof l.okter === "object" ? l.okter : {};
  };
  function hentOkt(id) {
    const o = okter()[id || (APP && APP.id)];
    if (!o || !KODE.test(o.kode) || typeof o.token !== "string" || !(Date.now() - o.tid < LEVETID)) return null;
    return o;
  }
  function skrivOkt(endring) {
    const l = lesLager();
    const alle = okter();
    // Old sessions (rooms that are deleted by now) go.
    for (const [id, o] of Object.entries(alle)) if (!o || !(Date.now() - o.tid < LEVETID)) delete alle[id];
    if (endring === null) delete alle[APP.id];
    else alle[APP.id] = Object.assign({}, alle[APP.id] || {}, endring, { tid: Date.now() });
    l.okter = alle;
    R.skriv("nett", l);
  }
  const lagreOkt = () => N.kode && N.token && skrivOkt({ kode: N.kode, token: N.token });
  const glemOkt = () => skrivOkt(null);
  // The nickname: the first of the names this phone already uses in the games (the kit's shared
  // names), and only what the player sees in the field. Nothing extra is stored for it.
  const fellesNavn = () => R.kutt(String((R.felles && R.felles.navn && R.felles.navn[0]) || "").replace(/\s+/g, " ").trim(), 16);

  // ---------- Names and seats ----------
  const seter = () => (N.rom && N.rom.seter) || [];
  const seteNavn = (i) => {
    const s = seter()[i];
    return (s && s.navn) || R.t("Spiller {n}", { n: i + 1 });
  };
  const lenke = () => location.origin + location.pathname + "#nett=" + N.kode;
  const spillNavn = () => (APP && APP.navn) || "";

  // ---------- The connection ----------
  function sendRaa(m) {
    const ws = N.ws;
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(typeof m === "string" ? m : JSON.stringify(m));
      return true;
    } catch (e) {
      return false;
    }
  }
  function stoppTidtakere() {
    clearTimeout(N.igjenId);
    clearInterval(N.pingId);
    N.igjenId = null;
    N.pingId = null;
  }
  function stengWs() {
    stoppTidtakere();
    const ws = N.ws;
    N.ws = null;
    N.tilkoblet = false;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(1000);
      } catch (e) {
        /* already closed */
      }
    }
  }
  function kobl(forst) {
    stengWs();
    N.slutt = false;
    let ws;
    try {
      ws = new WebSocket(WS_ADR + "/rom/" + N.kode);
    } catch (e) {
      return mistet();
    }
    N.ws = ws;
    ws.onopen = () => {
      if (N.ws !== ws) return;
      N.sist = Date.now();
      if (forst === "lag") sendRaa({ h: "lag", spill: APP.id, oppsett: N.oppsett, fro: N.fro, navn: N.navn });
      else sendRaa({ h: "bli", navn: N.navn, ...(N.token ? { token: N.token } : {}) });
      // Keep the line open, and notice a line that died quietly (a phone that slept).
      N.pingId = setInterval(() => {
        if (Date.now() - N.sist > 70000) {
          try {
            ws.close();
          } catch (e) {
            /* ignore */
          }
          return mistet();
        }
        sendRaa("ping");
      }, 25000);
    };
    ws.onmessage = (e) => {
      if (N.ws !== ws) return;
      N.sist = Date.now();
      if (e.data === "pong") return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (feil) {
        return;
      }
      if (m && typeof m === "object") motta(m);
    };
    ws.onclose = (e) => {
      if (N.ws !== ws) return;
      N.ws = null;
      N.tilkoblet = false;
      clearInterval(N.pingId);
      if (N.slutt || SLUTTKODER.has(e.code)) {
        // The room closed us on purpose; a message about why came first (or this is «erstattet»).
        if (e.code === 4000 && R.paNett()) visFeil("erstattet");
        return;
      }
      mistet();
    };
    ws.onerror = () => {}; // the close event follows
  }
  // The line is gone: try again, more and more calmly. Without a network we wait for one.
  function mistet() {
    stengWs();
    if (!R.paNett() || N.slutt) return;
    oppdaterStatus();
    // Never connected yet (creating or joining): a few tries, then say so.
    if (!N.rom && N.forsok >= 3) return visFeil(navigator.onLine === false ? "frakoblet" : "nett");
    if (navigator.onLine === false) return;
    const ms = Math.min(10000, 700 * 2 ** N.forsok);
    N.forsok++;
    N.igjenId = setTimeout(() => kobl(N.token ? "bli" : N.vert && !N.rom ? "lag" : "bli"), ms);
  }
  window.addEventListener("online", () => {
    if (R.paNett() && !N.ws && N.kode && !N.slutt && N.fase !== "feil") {
      N.forsok = 0;
      kobl(N.token || N.rom ? "bli" : N.vert ? "lag" : "bli");
    }
  });
  window.addEventListener("offline", () => {
    if (R.paNett() && N.ws) oppdaterStatus();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && R.paNett() && !N.ws && N.kode && !N.slutt && N.fase !== "feil") {
      N.forsok = 0;
      kobl("bli");
    }
  });

  // ---------- Messages from the room ----------
  function motta(m) {
    if (m.h === "rom") return vedRom(m);
    if (m.h === "seter") return vedSeter(m.seter);
    if (m.h === "start") return vedStart();
    if (m.h === "trekk") return vedTrekk(m);
    if (m.h === "reaksjon") return visReaksjon(m.s, m.e);
    if (m.h === "feil") return vedFeil(m);
    if (m.h === "slettet") return vedSlettet(m.grunn);
  }

  const somTekst = (x) => JSON.stringify(x);
  function vedRom(m) {
    if (!m.spill || m.spill !== APP.id || !Array.isArray(m.seter) || !Array.isArray(m.logg)) return visFeil("ukjent");
    const forrige = N.rom;
    const forrigeLogg = N.logg;
    N.rom = { spill: m.spill, oppsett: m.oppsett || {}, fro: m.fro >>> 0, kamp: m.kamp, min: m.min, maks: m.maks, startet: !!m.startet, ferdig: !!m.ferdig, seter: m.seter };
    N.du = Number.isInteger(m.du) ? m.du : -1;
    if (m.token) N.token = m.token;
    N.tilkoblet = true;
    N.forsok = 0;
    if (N.du < 0) {
      glemOkt();
      return visFeil("borte");
    }
    lagreOkt();
    N.borteVist = new Set(m.seter.map((s, i) => (s.borte ? i : -1)).filter((i) => i >= 0));
    if (!N.rom.startet) {
      N.logg = [];
      N.fase = "vent";
      tilSkjerm("nett");
      // The host has just made the room: the invite comes up at once.
      if (!forrige && N.vert && N.du === 0 && m.seter.length === 1) invitasjonArk();
      return;
    }
    // The same match, and what this phone has is the start of the room's list: only what it
    // missed is played. Anything else (a new match, a reload): the whole match is rebuilt.
    const samme = forrige && N.fase === "spill" && forrige.kamp === m.kamp && forrige.fro === N.rom.fro && forrigeLogg.length <= m.logg.length && forrigeLogg.every((x, i) => somTekst(x) === somTekst(m.logg[i]));
    if (samme) {
      if (N.sendt != null && N.sendt < m.logg.length) N.sendt = null;
      if (m.logg.length > forrigeLogg.length) {
        for (let i = forrigeLogg.length; i < m.logg.length; i++) bruk(m.logg[i][0], m.logg[i][1], i, true);
        etterGjenspill(true);
      } else oppdaterStatus();
      return;
    }
    bygg(m.logg);
  }

  function vedSeter(liste) {
    if (!N.rom || !Array.isArray(liste)) return;
    N.rom.seter = liste;
    oppdaterStatus();
    if (N.fase === "vent" && R.S && R.S.skjerm === "nett") R.vis();
    // Someone left the match on purpose: it is over for everyone.
    liste.forEach((s, i) => {
      if (!s.borte || N.borteVist.has(i)) return;
      N.borteVist.add(i);
      if (N.fase === "spill" && i !== N.du) {
        N.rom.ferdig = true;
        visForlatt(i);
      }
    });
  }

  function vedStart() {
    if (!N.rom || N.rom.startet) return;
    N.rom.startet = true;
    R.statistikk("start", { nett: 1 });
    if (N.du === 0) R.statistikk("nett.start");
    bygg([]);
  }

  function vedTrekk(m) {
    if (N.fase !== "spill" || !Number.isInteger(m.n)) return;
    if (m.n < N.logg.length) return; // had it already
    if (m.n > N.logg.length) return sendRaa({ h: "bli", token: N.token }); // missed one: everything again
    bruk(m.s, m.t, m.n, false);
  }

  function vedFeil(m) {
    const k = m.kode;
    if (k === "utdatert") {
      // Another move got there first: ours is dropped, and the board shows what really happened.
      N.sendt = null;
      if (Number.isInteger(m.n) && m.n > N.logg.length) sendRaa({ h: "bli", token: N.token });
      else if (R.S && R.S.skjerm !== "nett") {
        R.vis();
        // A move the game sends by itself (an answer, a pass) may be owed still: let it look again.
        if (N.fase === "spill" && DEF.etter) {
          try {
            DEF.etter(R.S, okt(null, false));
          } catch (e) {
            console.warn("rusj nett: etter", e);
          }
        }
      }
      return;
    }
    if (k === "fort") {
      // The room dropped the message: a move of ours is not on its way any more (tap again).
      if (N.sendt != null) {
        N.sendt = null;
        if (R.S && R.S.skjerm !== "nett") R.vis();
      }
      return R.toast(R.t("Rolig nå – vent et øyeblikk."));
    }
    if (k === "logg") return R.toast(R.t("Kampen har blitt for lang til å spilles videre på nett."));
    if (k === "opptatt") return visFeil("nett");
    if (k === "ukjent" || k === "full" || k === "startet") {
      N.slutt = true;
      glemOkt();
      return visFeil(k);
    }
    if (k === "sete" && N.token) sendRaa({ h: "bli", token: N.token });
  }

  function vedSlettet(grunn) {
    N.slutt = true;
    glemOkt();
    if (grunn === "ferdig" && N.fase === "spill") return; // the match was over: stay on the result
    visFeil(grunn === "verten" ? "verten" : "slettet");
  }

  // ---------- Playing the moves ----------
  // Dice and other chance for the move at place n: the same on every phone (seed + place).
  const tilfeldig = (fro, n) => R.rng(((fro >>> 0) ^ R.hash("nett:" + n)) >>> 0);
  const rngFor = (n) => tilfeldig(N.rom.fro, n);
  const okt = (n, gjenspill) => ({
    n,
    gjenspill: !!gjenspill,
    meg: N.du,
    kamp: N.rom ? N.rom.kamp : 1,
    fro: N.rom ? N.rom.fro : 0,
    oppsett: N.rom ? N.rom.oppsett : {},
    antall: seter().length,
    rng: n == null ? null : rngFor(n),
  });

  function bruk(s, t, n, gjenspill) {
    N.logg.push([s, t]);
    if (N.sendt != null && N.sendt <= n) N.sendt = null;
    if (!Number.isInteger(s) || s < 0 || s >= seter().length) return;
    try {
      DEF.trekk(R.S, t, s, okt(n, gjenspill));
    } catch (e) {
      // A move the rules cannot read is ignored the same way on every phone.
      console.warn("rusj nett: trekk", n, e);
    }
    if (!gjenspill) etterTrekk();
  }
  function etterTrekk() {
    if (DEF.etter) {
      try {
        DEF.etter(R.S, okt(null, false));
      } catch (e) {
        console.warn("rusj nett: etter", e);
      }
    }
    sjekkFerdig();
    oppdaterStatus();
  }
  function sjekkFerdig() {
    if (N.ferdigSendt || !DEF.ferdig || !DEF.ferdig(R.S)) return;
    N.ferdigSendt = true;
    N.rom.ferdig = true;
    sendRaa({ h: "ferdig" });
    R.statistikk("ferdig", { nett: 1 });
    if (N.du === 0) R.statistikk("nett.ferdig");
  }

  // A fresh match from the room's seed, then every move in the list, silently; then the screen.
  function bygg(logg) {
    N.logg = [];
    N.sendt = null;
    N.ferdigSendt = !!N.rom.ferdig;
    N.fase = "spill";
    try {
      DEF.start(R.S, okt(null, true));
    } catch (e) {
      console.error(e);
      return visFeil("nett");
    }
    for (let i = 0; i < logg.length; i++) bruk(logg[i][0], logg[i][1], i, true);
    etterGjenspill(false);
  }
  function etterGjenspill(sammeSkjerm) {
    const skjerm = (DEF.skjerm && DEF.skjerm(R.S)) || "spill";
    if (sammeSkjerm && R.S.skjerm === skjerm) R.vis();
    else tilSkjerm(skjerm);
    if (DEF.etter) {
      try {
        DEF.etter(R.S, okt(null, false));
      } catch (e) {
        console.warn("rusj nett: etter", e);
      }
    }
    // A match that ended while this phone was away: tell the room (it may then be deleted).
    if (DEF.ferdig && DEF.ferdig(R.S)) N.ferdigSendt = true;
    oppdaterStatus();
  }

  // ---------- Online mode on and off ----------
  function inn() {
    if (R.paNett()) return;
    R._nettBytt(true);
    ekteNavn = R.navn;
    R.navn = seteNavn;
    leggTilTopp();
  }
  function ut(til) {
    N.slutt = true;
    stengWs();
    fjernTopp();
    N.fase = null;
    N.rom = null;
    N.logg = [];
    N.kode = null;
    N.token = null;
    N.du = -1;
    N.vert = false;
    if (ekteNavn) R.navn = ekteNavn;
    if (R.paNett()) R._nettBytt(false);
    R.gaTil(til || APP.hjem || "hjem");
  }
  function tilSkjerm(navn) {
    if (!R.S) return;
    if (R.S.skjerm === navn) R.vis();
    else R.gaTil(navn);
  }
  function visFeil(hva) {
    stengWs();
    N.slutt = true;
    N.fase = "feil";
    N.feil = hva;
    if (R.paNett()) tilSkjerm("nett");
  }

  // Into a room by its code (an invite link, or this phone's own session).
  function bliMed(kode, egen) {
    inn();
    N.kode = kode;
    N.token = egen ? egen.token : null;
    N.rom = null;
    N.logg = [];
    N.forsok = 0;
    N.vert = false;
    N.navn = fellesNavn();
    if (egen) {
      N.fase = "kobler";
      tilSkjerm("nett");
      kobl("bli");
    } else {
      N.fase = "bli";
      tilSkjerm("nett");
    }
  }

  // Straight from the button on the game's home screen: no screen of settings first.
  async function lagRom() {
    N.fase = "kobler";
    N.vert = true;
    N.forsok = 0;
    tilSkjerm("nett");
    const fortsatt = R.vakt();
    let kode = null;
    try {
      const svar = await fetch(ADR + "/rom", { method: "POST", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      if (svar.ok) kode = ((await svar.json()) || {}).kode;
    } catch (e) {
      kode = null;
    }
    if (!fortsatt() || !R.paNett()) return;
    if (!KODE.test(kode || "")) return visFeil(navigator.onLine === false ? "frakoblet" : "nett");
    // Anonymous counting (rusj/kit/stat.js): only the phone that made the room counts the room, its
    // matches and their ends, so each is counted once. Nothing about the room is sent.
    R.statistikk("nett.rom");
    N.kode = kode;
    N.fro = R.nyttFro();
    kobl("lag");
  }

  // ---------- Leaving and a new match ----------
  async function forlat() {
    const iKamp = N.fase === "spill" && N.rom && !N.rom.ferdig && !(DEF.ferdig && DEF.ferdig(R.S));
    if (iKamp) {
      const fortsatt = R.vakt();
      const ja = await R.bekreft(R.t("Forlate kampen?"), R.t("Kampen stopper for alle, og du kan ikke komme tilbake til den."), R.t("Forlat"), R.t("Spill videre"));
      if (!ja || !fortsatt()) return;
    } else if (N.fase === "vent" && N.du === 0) {
      const fortsatt = R.vakt();
      const ja = await R.bekreft(R.t("Lukke rommet?"), R.t("De som har kommet inn, blir sendt ut."), R.t("Lukk rommet"), R.t("Avbryt"));
      if (!ja || !fortsatt()) return;
    }
    if (N.ws && N.du >= 0) sendRaa({ h: "forlat" });
    glemOkt();
    R.lukkArk();
    ut();
  }

  // A game may allow «Ny kamp» before its rules call the match over (DEF.kanNy: Admiralen while the
  // fleets are still being shown).
  const kanNy = () => !!N.rom && (N.rom.ferdig || (DEF.kanNy ? DEF.kanNy(R.S) : !!(DEF.ferdig && DEF.ferdig(R.S))));
  function nyKamp() {
    if (!kanNy()) return;
    if (!N.tilkoblet) return R.toast(R.t("Ikke tilkoblet – vent litt, så kobler vi til igjen."));
    if (!N.rom.ferdig) {
      N.rom.ferdig = true;
      sendRaa({ h: "ferdig" });
    }
    sendRaa({ h: "ny", fro: R.nyttFro() });
  }

  function visForlatt(i) {
    const igjen = seter().filter((s) => !s.borte).length;
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("{navn} forlot kampen", { navn: seteNavn(i) }))}</h2>
      <p class="ingress">${esc(igjen >= (N.rom.min || 2) ? R.t("Kampen er over. Dere som er igjen, kan starte en ny.") : R.t("Kampen er over."))}</p>
      <div class="stabel">
        ${igjen >= (N.rom.min || 2) ? R.ui.knapp(R.t("Ny kamp"), "nett-ny", { ikon: "🔁" }) : ""}
        ${R.ui.knapp2(R.t("Til {spill}", { spill: spillNavn() }), "nett-forlat")}
        <button class="lenke" data-h="lukk-ark">${esc(R.t("Se brettet"))}</button>
      </div>`);
  }

  // ---------- The top bar: whose turn, the connection, reactions ----------
  function leggTilTopp() {
    if ($("#nett-rom")) return;
    const hoyre = $(".topp-hoyre");
    if (!hoyre) return;
    hoyre.insertAdjacentHTML("afterbegin", `<button class="ikonknapp nett-rom" id="nett-rom" data-h="nett-reaksjoner" aria-label="${esc(R.t("Send en reaksjon"))}" hidden><span aria-hidden="true">😀</span><i class="nett-prikk" aria-hidden="true"></i></button>`);
  }
  function fjernTopp() {
    const k = $("#nett-rom");
    if (k) k.remove();
    document.documentElement.removeAttribute("data-nett");
    document.documentElement.removeAttribute("data-nett-tur");
    N.status = "";
    const b = $("#nett-boble");
    if (b) b.remove();
  }
  // While online the title is the status line: «Din tur», «Venter på Kari …» or «Kobler til igjen …».
  function tittelNett(S) {
    if (!R.paNett() || N.fase !== "spill" || !S || S !== R.S) return null;
    if (!N.tilkoblet) return R.t("Kobler til igjen …");
    if (N.rom.ferdig || (DEF.ferdig && DEF.ferdig(S))) return R.t("Kampen er ferdig");
    const t = DEF.tur ? DEF.tur(S) : null;
    if (t === N.du) return R.t("Din tur");
    if (Number.isInteger(t) && t >= 0) return R.t("Venter på {navn} …", { navn: seteNavn(t) });
    return null;
  }
  function oppdaterStatus() {
    const knapp = $("#nett-rom");
    const iSpill = R.paNett() && N.fase === "spill";
    if (knapp) {
      knapp.hidden = !iSpill;
      knapp.classList.toggle("borte", !N.tilkoblet);
    }
    const rot = document.documentElement;
    rot.setAttribute("data-nett", iSpill ? (N.tilkoblet ? "med" : "borte") : "");
    let tur = null;
    try {
      tur = iSpill && DEF.tur && !N.rom.ferdig ? DEF.tur(R.S) : null;
    } catch (e) {
      tur = null;
    }
    rot.setAttribute("data-nett-tur", iSpill && N.tilkoblet && tur === N.du ? "meg" : "");
    if (!iSpill) return;
    const tittel = tittelNett(R.S);
    const el = $("#topp-tittel");
    if (el && tittel) el.textContent = tittel;
    // The line going and coming is said once each time.
    const status = N.tilkoblet ? "med" : "borte";
    if (status !== N.status) {
      if (status === "borte" && N.status) R.toast(R.t("Mistet nettet – kobler til igjen …"));
      else if (status === "med" && N.status === "borte") R.si(R.t("Tilkoblet igjen."));
      N.status = status;
    }
  }

  function visReaksjon(s, e) {
    const r = REAKSJONER[e];
    if (!r || !R.paNett() || N.fase !== "spill") return;
    const navn = s === N.du ? R.t("Du") : seteNavn(s);
    const gml = $("#nett-boble");
    if (gml) gml.remove();
    document.body.insertAdjacentHTML("beforeend", `<div class="nett-boble${R.rolig() ? " rolig" : ""}" id="nett-boble" aria-hidden="true"><span class="nett-boble-emoji">${r[0]}</span><b>${esc(navn)}</b></div>`);
    const boble = $("#nett-boble");
    setTimeout(() => boble && boble.remove(), 2600);
    if (s !== N.du) {
      R.si(R.t("{navn}: {reaksjon}", { navn, reaksjon: r[1] }));
      R.vibrer(12);
    }
  }

  // The six reactions: one small row, nothing else.
  function reaksjonArk() {
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("Send en reaksjon"))}</h2>
      <div class="nett-reaksjoner">${REAKSJONER.map(([e, navn], i) => `<button class="nett-reaksjon" data-h="nett-reaksjon" data-v="${i}" aria-label="${esc(navn)}"><span aria-hidden="true">${e}</span></button>`).join("")}</div>`);
  }

  function invitasjonArk() {
    const url = lenke();
    const qr = R.kode && R.kode.qr ? R.kode.qr(url) : "";
    const vis = url.replace(/^https?:\/\//, "");
    R.ark(`
      <h2 id="ark-tittel">${esc(R.t("Inviter en venn"))}</h2>
      <p class="ingress">${esc(qr ? R.t("Send lenken – eller la vennen skanne koden med mobilen sin.") : R.t("Send lenken til den du vil spille med."))}</p>
      <div class="kodekort nett-invitasjon">
        <span class="etikett">${esc(R.t("Rom {kode}", { kode: N.kode }))}</span>
        ${qr ? `<div class="qr">${qr}</div>` : ""}
        <p class="nett-lenke" data-utenfor-ok>${esc(vis)}</p>
        <div class="knapprad">${R.ui.knapp2(R.t("Del lenken"), "nett-del", { variant: "liten" })}${R.ui.knapp2(R.t("Kopier"), "nett-kopier", { variant: "liten" })}</div>
      </div>
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Ferdig"))}</button>`);
  }

  // ---------- The screen «nett» ----------
  const navnFelt = () => `
    <label class="nett-felt-etikett" for="nett-navn">${esc(R.t("Kallenavn (valgfritt)"))}</label>
    <input class="tekstfelt" id="nett-navn" data-felt="nett-navn" value="${esc(N.navn)}" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="${esc(R.t("For eksempel Kaptein Kaos"))}" aria-describedby="nett-navn-hjelp">
    <p class="hjelp" id="nett-navn-hjelp">${esc(R.t("Vises for de andre i rommet. Bare tekst, høyst 16 tegn."))}</p>`;
  const personvernLinje = () => `<p class="hjelp nett-personvern">${esc(R.t("Bare trekkene og kallenavnet går via rusj, og rommet slettes etter et døgn. Ingen chat og ingen konto."))}</p>`;
  const avbryt = (tekst) => R.ui.lenkerad(R.ui.lenke(tekst || R.t("Avbryt"), "nett-forlat"));

  const FEIL = {
    full: [R.t("Rommet er fullt"), R.t("Alle plassene er tatt. Be om en ny lenke, eller start et eget rom.")],
    startet: [R.t("Kampen har begynt"), R.t("De andre har startet uten deg. Be om en ny lenke til neste kamp.")],
    ukjent: [R.t("Fant ikke rommet"), R.t("Lenken kan være gammel – et rom slettes et døgn etter siste trekk. Be om en ny lenke.")],
    slettet: [R.t("Rommet er slettet"), R.t("Rommet var tomt for trekk et helt døgn, eller kampen var ferdig. Start et nytt rom.")],
    verten: [R.t("Rommet er lukket"), R.t("Den som laget rommet, gikk ut før kampen begynte.")],
    borte: [R.t("Du er ikke med lenger"), R.t("Plassen din i rommet finnes ikke lenger.")],
    erstattet: [R.t("Kampen er åpnet et annet sted"), R.t("Den samme plassen ble åpnet i en annen fane eller på en annen mobil. Fortsett der.")],
    frakoblet: [R.t("Du er ikke på nett"), R.t("Å spille med en venn på nett trenger internett. Alt annet i spillet virker uten.")],
    nett: [R.t("Fikk ikke kontakt"), R.t("Vi fikk ikke kontakt med rusj sin tjener. Sjekk nettet og prøv igjen om litt.")],
  };

  function visNett() {
    const f = N.fase;
    if (f === "bli") {
      return `
        <h1 id="skjerm-tittel">${esc(R.t("Bli med på nett"))}</h1>
        <p class="ingress">${esc(R.t("Du er invitert til {spill} i rom {kode}.", { spill: spillNavn(), kode: N.kode }))}</p>
        <section class="seksjon nett-navn">${navnFelt()}</section>
        ${personvernLinje()}
        ${R.ui.dokk(R.ui.knapp(R.t("Bli med"), "nett-bli", { ikon: "👋" }), avbryt())}`;
    }
    if (f === "kobler") {
      return `
        <div class="nett-midt">
          ${R.figur()}
          <h1 id="skjerm-tittel">${esc(R.t("Kobler til …"))}</h1>
          <p class="nett-laster${R.rolig() ? " rolig" : ""}" aria-hidden="true"><i></i><i></i><i></i></p>
        </div>
        ${R.ui.dokk(avbryt())}`;
    }
    if (f === "vent") {
      const liste = seter();
      const maks = N.rom.maks;
      const min = N.rom.min;
      const vert = N.du === 0;
      const rader = [];
      liste.forEach((s, i) => rader.push(`<li class="${s.med ? "med" : "av"}">${R.avatar(i)}<b>${esc(seteNavn(i))}</b><span>${esc(i === N.du ? R.t("deg") : s.med ? R.t("er her") : R.t("ikke tilkoblet"))}</span></li>`));
      // One row for the free seats, however many (the count is in the heading).
      if (liste.length < maks) rader.push(`<li class="ledig"><span class="avatar" aria-hidden="true"></span><b>${esc(R.t("Ledig plass"))}</b></li>`);
      const mangler = Math.max(0, min - liste.length);
      const tittel = mangler ? R.t("Venter på en venn …") : liste.length < maks ? R.t("Klare til å starte") : R.t("Alle er her!");
      const o = DEF.oppsettTekst ? DEF.oppsettTekst(N.rom.oppsett) : "";
      const kanStarte = vert && liste.length >= min && liste.length < maks;
      const hovud = kanStarte
        ? R.ui.knapp(R.t("Start med {n} spillere", { n: liste.length }), "nett-start", { ikon: "▶️" }) + R.ui.knapp2(R.t("Inviter flere"), "nett-inviter", { ikon: "🔗" })
        : vert
          ? R.ui.knapp(R.t("Inviter en venn"), "nett-inviter", { ikon: "🔗" })
          : R.ui.knapp2(R.t("Inviter flere"), "nett-inviter", { ikon: "🔗" });
      return `
        <h1 id="skjerm-tittel">${esc(tittel)}</h1>
        <p class="ingress" data-si>${esc(vert ? (mangler ? R.t("Send lenken til den du vil spille med. Kampen starter når noen kommer inn.") : R.t("Start når alle er her – eller vent på flere.")) : R.t("Venter på at {navn} starter kampen.", { navn: seteNavn(0) }))}</p>
        <section class="seksjon">
          <div class="seksjon-hode"><h2>${esc(R.t("Spillerne"))}</h2><span class="tall">${esc(R.t("{n} av {maks}", { n: liste.length, maks }))}</span></div>
          <ul class="nett-seter">${rader.join("")}</ul>
          ${o ? `<p class="hjelp"><span aria-hidden="true">⚙️</span> ${esc(o)}</p>` : ""}
        </section>
        ${personvernLinje()}
        ${R.ui.dokk(hovud, avbryt(vert ? R.t("Lukk rommet") : R.t("Forlat rommet")))}`;
    }
    if (f === "spill") {
      return `
        <div class="nett-midt">
          ${R.figur()}
          <h1 id="skjerm-tittel">${esc(R.t("Kampen pågår"))}</h1>
        </div>
        ${R.ui.dokk(R.ui.knapp(R.t("Tilbake til kampen"), "nett-til-kamp"), avbryt(R.t("Forlat kampen")))}`;
    }
    const [tittel, tekst] = FEIL[N.feil] || FEIL.nett;
    const igjen = N.feil === "nett" || N.feil === "frakoblet";
    return `
      <div class="nett-midt">
        ${R.ui.figur(null, { stemning: "lei" })}
        <h1 id="skjerm-tittel">${esc(tittel)}</h1>
        <p class="ingress">${esc(tekst)}</p>
      </div>
      ${R.ui.dokk(igjen ? R.ui.knapp(R.t("Prøv igjen"), "nett-igjen") : "", R.ui.lenkerad(R.ui.lenke(R.t("Til {spill}", { spill: spillNavn() }), "nett-ut")))}`;
  }

  // ---------- Wrapping Rusj.start ----------
  const lesLenke = () => {
    const m = /^#nett=([A-Za-z0-9]{6})$/.exec(location.hash || "");
    return m && KODE.test(m[1].toUpperCase()) ? m[1].toUpperCase() : null;
  };
  const tomAdresse = () => {
    try {
      history.replaceState(history.state, "", location.pathname + location.search);
    } catch (e) {
      /* ignore */
    }
  };

  function kobleInn(def) {
    APP = def;
    DEF = def.nett;
    const hjem = def.hjem || "hjem";
    // While online: the title tells whose turn it is; «back» means leaving the match.
    for (const [navn, sk] of Object.entries(def.skjermer)) {
      const tittel = sk.tittel;
      sk.tittel = (S) => {
        const n = tittelNett(S);
        if (n) return n;
        return typeof tittel === "function" ? tittel(S) : tittel;
      };
      if (navn === hjem) {
        // The game's home screen is never shown with the online state: there is the lobby.
        const inn0 = sk.inn;
        sk.inn = (S) => {
          if (R.paNett()) return setTimeout(() => R.paNett() && R.S.skjerm === hjem && R.gaTil("nett"), 0);
          if (inn0) return inn0(S);
        };
        continue;
      }
      const tilbake = sk.tilbake;
      sk.tilbake = async (S) => {
        if (R.paNett()) {
          await forlat();
          return null;
        }
        return typeof tilbake === "function" ? tilbake(S) : tilbake;
      };
    }
    def.skjermer.nett = {
      tittel: () => R.t("På nett"),
      tilbake: async () => {
        await forlat();
        return null;
      },
      gjenoppta: false,
      vis: visNett,
      inn() {
        oppdaterStatus();
        if (N.fase === "bli") {
          const f = $("#nett-navn");
          if (f && !N.navn && !matchMedia("(pointer: coarse)").matches) f.focus();
        }
      },
    };
    def.felt = Object.assign({}, def.felt, {
      "nett-navn": (S, el) => {
        N.navn = R.kutt(String(el.value || "").replace(/\s+/g, " "), 16).trim();
      },
    });
    const egne = (def.handlinger = def.handlinger || {});
    // The game's «Avslutt» leaves the match while online.
    for (const h of DEF.forlatVia || ["avslutt"]) {
      const orig = egne[h];
      if (!orig) continue;
      egne[h] = (el, e, S) => (R.paNett() ? forlat() : orig(el, e, S));
    }
    Object.assign(egne, {
      "nett-apne": () => {
        const egen = hentOkt();
        if (egen) return bliMed(egen.kode, egen);
        if (navigator.onLine === false) {
          return R.ark(`
            <h2 id="ark-tittel">${esc(FEIL.frakoblet[0])}</h2>
            <p class="ingress">${esc(FEIL.frakoblet[1])}</p>
            <button class="knapp" data-h="lukk-ark">${esc(R.t("Skjønner!"))}</button>`);
        }
        const offline = R.S;
        let oppsett = {};
        try {
          oppsett = (DEF.oppsett && DEF.oppsett(offline)) || {};
        } catch (e) {
          oppsett = {};
        }
        inn();
        N.oppsett = oppsett;
        N.kode = null;
        N.token = null;
        N.rom = null;
        N.du = -1;
        N.navn = ""; // the host sends no name it has not typed: it shows as «Spiller 1» (privacy)
        return lagRom();
      },
      "nett-bli": () => {
        if (N.fase !== "bli") return;
        N.fase = "kobler";
        R.vis();
        kobl("bli");
      },
      "nett-start": () => {
        if (N.fase === "vent" && N.du === 0) sendRaa({ h: "start" });
      },
      "nett-inviter": () => invitasjonArk(),
      "nett-del": () => R.del(R.t("Spill {spill} med meg", { spill: spillNavn() }), R.t("Bli med på {spill} på rusj.no – trykk på lenken:", { spill: spillNavn() }), lenke()),
      "nett-kopier": () => R.kopier(lenke()),
      "nett-forlat": () => forlat(),
      "nett-ut": () => {
        glemOkt();
        ut();
      },
      "nett-igjen": () => {
        N.forsok = 0;
        N.slutt = false;
        if (N.kode && (N.token || N.rom)) {
          N.fase = "kobler";
          R.vis();
          kobl("bli");
        } else if (N.vert || !N.kode) {
          return lagRom();
        } else {
          N.fase = "bli";
          R.vis();
        }
      },
      "nett-reaksjoner": () => reaksjonArk(),
      "nett-reaksjon": (el) => {
        const e = Number(el.dataset.v);
        if (!(e >= 0 && e < REAKSJONER.length)) return;
        R.lukkArk();
        if (sendRaa({ h: "reaksjon", e })) visReaksjon(N.du, e);
      },
      "nett-ny": () => {
        R.lukkArk();
        nyKamp();
      },
      "nett-til-kamp": () => {
        if (N.fase === "spill") tilSkjerm((DEF.skjerm && DEF.skjerm(R.S)) || "spill");
      },
    });
  }

  const ekteStart = R.start;
  R.start = (def) => {
    const brukes = !!(def && def.nett && typeof def.nett.start === "function" && typeof def.nett.trekk === "function");
    let fraLenke = null;
    if (brukes) {
      kobleInn(def);
      fraLenke = lesLenke();
      if (fraLenke) tomAdresse();
    }
    ekteStart(def);
    if (!brukes) return;
    // A link opened while the page is open (pasted in the same tab).
    window.addEventListener("hashchange", () => {
      const kode = lesLenke();
      if (!kode) return;
      tomAdresse();
      if (R.paNett() && N.kode === kode) return;
      if (R.paNett()) return R.toast(R.t("Forlat kampen du er i først."));
      const egen = hentOkt();
      bliMed(kode, egen && egen.kode === kode ? egen : null);
    });
    // Opened from an invite link: into that room (as oneself, when this phone already has a seat).
    const egen = hentOkt();
    if (fraLenke) return bliMed(fraLenke, egen && egen.kode === fraLenke ? egen : null);
    // A reload in the middle of a match: straight back in.
    if (egen && Date.now() - egen.tid < GJENOPPTA) bliMed(egen.kode, egen);
  };

  // ---------- For the games ----------
  R.nett = {
    // Is a match on the net running on this page (the online state is in use)?
    aktiv: () => R.paNett() && N.fase === "spill",
    // My seat (0, 1, …), −1 when none.
    meg: () => N.du,
    erMeg: (i) => R.paNett() && i === N.du,
    navn: seteNavn,
    antall: () => seter().length,
    // Send a move. It is played when the room sends it back (to every phone in the same order).
    // false when it cannot go now (no line, or the last move is still on its way).
    send(t) {
      if (!R.paNett() || N.fase !== "spill") return false;
      if (!N.tilkoblet || !N.ws || N.ws.readyState !== 1) {
        R.toast(R.t("Ikke tilkoblet – vent litt, så kobler vi til igjen."));
        return false;
      }
      if (N.sendt != null) return false;
      N.sendt = N.logg.length;
      if (!sendRaa({ h: "trekk", n: N.sendt, t })) {
        N.sendt = null;
        return false;
      }
      return true;
    },
    // A move of mine is on its way (lock the board until it comes back).
    venter: () => N.sendt != null,
    tilkoblet: () => N.tilkoblet,
    kamp: () => (N.rom ? N.rom.kamp : 1),
    // The chance of the move at place n in a room with this seed (what okt.rng is; for the tests).
    tilfeldig,
    // A secret this phone keeps for the match (Admiralen's fleet). Never sent.
    hemmelig(verdi) {
      if (verdi === undefined) {
        const o = hentOkt();
        return o && o.kamp === (N.rom && N.rom.kamp) ? o.hemmelig : undefined;
      }
      skrivOkt({ kode: N.kode, token: N.token, kamp: N.rom && N.rom.kamp, hemmelig: verdi });
    },
    // The home-screen button.
    knapp: () => R.ui.knapp2(hentOkt() ? R.t("Tilbake til nettkampen") : R.t("Spill med en venn på nett"), "nett-apne", { ikon: "🌐" }),
    // The end of a match: «Ny kamp» and «Forlat».
    sluttDokk: () => R.ui.dokk(R.ui.knapp(R.t("Ny kamp"), "nett-ny", { ikon: "🔁", av: !N.tilkoblet }), R.ui.lenkerad(R.ui.lenke(R.t("Forlat"), "nett-forlat"))),
    forlat,
    nyKamp,
  };
})();
