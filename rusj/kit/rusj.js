/* rusj kit — the shared runtime for every game on rusj.no (window.Rusj).
   A game is one call to Rusj.start({...}) with screens that return HTML and actions bound
   through data-h attributes. See rusj/KIT.md for the full guide.
   Depends on window.RusjGjengen (mascots + logo). Everything stays on the device: no network,
   no cookies; localStorage only, under keys that start with "rusj.". */
(function () {
  "use strict";

  const R = (window.Rusj = {});
  const G = window.RusjGjengen;
  // Game facts from spill.json, written by the build in <id>/data.js (loaded after this file).
  const meta = () => window.RUSJ_SPILL || {};

  // ---------- Helpers ----------

  const $ = (sel, rot) => (rot || document).querySelector(sel);
  const $$ = (sel, rot) => Array.from((rot || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  R.$ = $;
  R.$$ = $$;
  R.esc = esc;
  R.tall = (n) => Number(n).toLocaleString("nb-NO");
  R.vent = (ms) => new Promise((r) => setTimeout(r, ms));
  R.rolig = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  R.klamp = (n, min, max) => Math.min(max, Math.max(min, n));
  // "1 sekund", "2 sekunder": R.flertall(n, "sekund", "sekunder")
  R.flertall = (n, entall, flertall) => `${R.tall(n)} ${Number(n) === 1 ? entall : flertall}`;
  // "A", "A og B", "A, B og C"
  R.ramsOpp = (liste) => {
    const l = (liste || []).map(String);
    return l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " og " + l[l.length - 1];
  };
  R.formaterTid = (sek) => {
    sek = Math.max(0, Math.ceil(sek));
    return Math.floor(sek / 60) + ":" + String(sek % 60).padStart(2, "0");
  };
  // Size class for big words on cards: "", "lang" or "ekstra-lang".
  R.lengdeKlasse = (tekst) => {
    tekst = String(tekst);
    const lengste = Math.max(...tekst.split(/\s+/).map((d) => d.length));
    if (lengste > 13 || tekst.length > 20) return "ekstra-lang";
    if (lengste > 9 || tekst.length > 14) return "lang";
    return "";
  };
  // For comparing typed answers: lower case, no accents (æ, ø, å kept), no punctuation, single spaces.
  R.normaliser = (tekst) =>
    String(tekst || "")
      .toLocaleLowerCase("nb")
      .replace(/[æøå]/g, (c) => ({ æ: "\u0001", ø: "\u0002", å: "\u0003" })[c])
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[\u0001-\u0003]/g, (c) => ({ "\u0001": "æ", "\u0002": "ø", "\u0003": "å" })[c])
      .replace(/[^a-z0-9æøå ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  R.iRamme = (() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  // ---------- Randomness ----------

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  R.rng = (fro) => mulberry32(fro >>> 0);
  R.nyttFro = () => {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0];
    } catch (e) {
      return Math.floor(Math.random() * 4294967296);
    }
  };
  R.stokk = (liste, tilfeldig) => {
    const t = tilfeldig || Math.random;
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(t() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  R.velg = (liste, tilfeldig) => liste[Math.floor((tilfeldig || Math.random)() * liste.length)];
  R.heltall = (min, max, tilfeldig) => min + Math.floor((tilfeldig || Math.random)() * (max - min + 1));
  R.hash = (tekst) => {
    let h = 0x811c9dc5;
    tekst = String(tekst);
    for (let i = 0; i < tekst.length; i++) {
      h ^= tekst.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  // ---------- Storage (this device only) ----------

  const PREFIKS = "rusj.";
  R.les = (nokkel, standard) => {
    try {
      const v = localStorage.getItem(PREFIKS + nokkel);
      return v == null ? standard : JSON.parse(v);
    } catch (e) {
      return standard;
    }
  };
  // A browser that will not save (private mode, storage switched off, or full): the game still
  // works, it just forgets. That is said once, calmly, when a game is on the screen — see
  // meldLagring. Returns true when the value was saved.
  let lagringFeilet = false;
  let lagringMeldt = false;
  let spillVises = false; // true from the game's first screen: before that there is no toast to show it in
  const LAGRING_TEKST = "Nettleseren lar oss ikke lagre – spillet virker, men huskes ikke";
  function meldLagring() {
    if (!lagringFeilet || lagringMeldt || !spillVises) return;
    lagringMeldt = true;
    try {
      R.toast(LAGRING_TEKST);
    } catch (e) {
      lagringMeldt = false;
    }
  }
  R.skriv = (nokkel, verdi) => {
    try {
      localStorage.setItem(PREFIKS + nokkel, JSON.stringify(verdi));
      return true;
    } catch (e) {
      lagringFeilet = true;
      meldLagring();
      return false;
    }
  };
  R.fjern = (nokkel) => {
    try {
      localStorage.removeItem(PREFIKS + nokkel);
    } catch (e) {
      /* ignore */
    }
  };

  // The first n characters of a text, never half of one: whole graphemes where Intl.Segmenter
  // exists (an emoji with a skin tone, a flag or a family is one character), else whole code points.
  // A plain slice() counts UTF-16 units and can leave half an emoji behind.
  let segmenter;
  R.kutt = (tekst, n) => {
    tekst = String(tekst == null ? "" : tekst);
    if (tekst.length <= n) return tekst;
    try {
      if (segmenter === undefined) segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("nb", { granularity: "grapheme" }) : null;
      if (segmenter) {
        let ut = "";
        let antall = 0;
        for (const del of segmenter.segment(tekst)) {
          // (also a ceiling in code units, so sixteen "characters" of stacked accents can't get huge)
          if (antall >= n || ut.length + del.segment.length > n * 4) break;
          ut += del.segment;
          antall++;
        }
        return ut;
      }
    } catch (e) {
      /* fall through */
    }
    return Array.from(tekst).slice(0, n).join("");
  };

  // Shared across all games: sound on/off and the player names (the same friends play several games).
  R.felles = Object.assign({ lyd: true, navn: [] }, R.les("felles", {}));
  if (!Array.isArray(R.felles.navn)) R.felles.navn = [];
  // over18 is read back from storage unless it is the thing being changed: the front page or
  // another tab may have changed it since this page loaded, and an old copy must not undo that.
  R.lagreFelles = (endring) => {
    const lagret = R.les("felles", {}) || {};
    R.felles.over18 = endring && "over18" in endring ? !!endring.over18 : !!lagret.over18;
    R.skriv("felles", {
      lyd: !!R.felles.lyd,
      navn: R.felles.navn.slice(0, 24).map((n) => R.kutt(n || "", 16)),
      over18: R.felles.over18,
      installTips: Number(R.felles.installTips) || 0,
    });
  };

  // ---------- Daily puzzles ----------
  // The same "today" for everyone in Norway: { tekst: "2026-11-10", nr: days since 1970 }.
  // Read with formatToParts (not a locale's date format, which a browser may lack), and fall back
  // to the phone's own date if the time zone is unknown.
  R.dag = (dato) => {
    const naa = dato || new Date();
    let a, m, d;
    try {
      const deler = {};
      for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(naa)) deler[p.type] = Number(p.value);
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
    const to = (n) => String(n).padStart(2, "0");
    return { tekst: `${a}-${to(m)}-${to(d)}`, nr: Math.floor(Date.UTC(a, m - 1, d) / 86400000) };
  };

  // Daily puzzles report to the front page's «I dag» strip (format: rusj/DAGLIG.md). This phone only.
  // R.dagligFerdig({ vunnet, rekke, res }) when today's puzzle is finished (won, lost or given up);
  // R.dagligIGang({ tekst }) when it has progress but is not finished. Both are safe to call again
  // with the same values (games call them on every load).
  const dagligKort = (v) => (typeof v === "string" ? Array.from(v.trim()).slice(0, 14).join("") : "");
  const dagligLes = () => {
    const alle = R.les("daglig", {});
    return alle && typeof alle === "object" && !Array.isArray(alle) ? alle : {};
  };
  R.dagligFerdig = (info) => {
    try {
      const id = (APP && APP.id) || meta().id;
      const nr = R.dag().nr;
      const alle = dagligLes();
      const ny = { nr, vunnet: !!(info && info.vunnet), rekke: Math.max(0, Math.min(9999, Math.floor(Number(info && info.rekke) || 0))) };
      const res = dagligKort(info && info.res);
      if (res) ny.res = res;
      const gml = alle[id] && typeof alle[id] === "object" ? alle[id] : {};
      const rest = {};
      for (const k of Object.keys(gml)) if (!["nr", "vunnet", "rekke", "res", "pagar"].includes(k)) rest[k] = gml[k]; // fields from later versions
      alle[id] = Object.assign(rest, ny);
      // The site log: which daily games were finished on which day (the 400 newest days).
      const logg = alle._ && typeof alle._ === "object" ? alle._ : (alle._ = { v: 1, dager: {} });
      if (!logg.dager || typeof logg.dager !== "object") logg.dager = {};
      logg.v = 1;
      const liste = Array.isArray(logg.dager[nr]) ? logg.dager[nr] : (logg.dager[nr] = []);
      const forsteGang = !liste.includes(id);
      if (forsteGang) liste.push(id);
      const dager = Object.keys(logg.dager).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b);
      for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete logg.dager[k];
      R.skriv("daglig", alle);
      merkerSjekk();
      // Anonymous statistics: once per game and day — how many of today's dailies this phone has
      // finished, and the site streak (stat.js turns it into a coarse group).
      if (forsteGang && window.RusjStat) window.RusjStat.daglig(liste.length, dagligRekke(alle, nr));
    } catch (e) {
      /* never break a game for this */
    }
  };
  // The site streak, the same rule as rekke() in rusj/portal/daglig.js (see rusj/DAGLIG.md): days in a
  // row with a finished daily, one missed day per week (Monday–Sunday) forgiven.
  const dagligRekke = (alle, iDag) => {
    const spilt = new Set();
    const logg = alle._ && alle._.dager && typeof alle._.dager === "object" ? alle._.dager : {};
    for (const k of Object.keys(logg)) if (/^\d+$/.test(k) && Array.isArray(logg[k]) && logg[k].length) spilt.add(Number(k));
    for (const k of Object.keys(alle)) {
      const e = alle[k];
      if (k === "_" || !e || typeof e !== "object" || !Number.isInteger(e.nr)) continue;
      for (let i = 0; i < Math.min(4000, Math.max(1, Number(e.rekke) || 0)); i++) spilt.add(e.nr - i);
    }
    const uke = (d) => Math.floor((d + 3) / 7);
    const bruktUke = new Set();
    let n = 0;
    for (let d = spilt.has(iDag) ? iDag : iDag - 1, i = 0; d > 0 && i < 4000; d--, i++) {
      if (spilt.has(d)) n++;
      else if (bruktUke.has(uke(d))) break;
      else bruktUke.add(uke(d));
    }
    return n;
  };
  R.dagligIGang = (info) => {
    try {
      const id = (APP && APP.id) || meta().id;
      const nr = R.dag().nr;
      const alle = dagligLes();
      const gml = alle[id] && typeof alle[id] === "object" ? alle[id] : {};
      if (gml.nr === nr) return; // already finished today
      alle[id] = Object.assign({}, gml, { pagar: { nr, tekst: dagligKort(info && info.tekst) } });
      R.skriv("daglig", alle);
    } catch (e) {
      /* never break a game for this */
    }
  };

  // ---------- Statistics (anonymous) ----------
  // Games report a few events: R.statistikk("start", { modus: "lag" }) when a game starts,
  // R.statistikk("ferdig", { runder: 3 }) when it ends. No names, no free text, nothing personal.
  // Only the event name of "start" and "ferdig" ever leaves the phone, through /felles/stat.js
  // (rusj/kit/stat.js), which also counts page views and time on screen. That file is only on the
  // page when the site is built with STAT_ADRESSE (scripts/rusj.mjs); until then nothing is sent.
  const statKo = [];
  R.statistikk = (hendelse, data) => {
    if (typeof hendelse !== "string" || hendelse.length > 24) return;
    const ren = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (Object.keys(ren).length >= 6) break;
      if (typeof v === "number" && Number.isFinite(v)) ren[k.slice(0, 16)] = Math.round(v * 10) / 10;
      else if (typeof v === "boolean") ren[k.slice(0, 16)] = v;
      else if (typeof v === "string" && /^[a-z0-9_-]{1,20}$/i.test(v)) ren[k.slice(0, 16)] = v; // ids only, never names
    }
    if (hendelse === "start") {
      try {
        merkeSpilt();
      } catch (e) {
        /* ignore */
      }
    }
    statKo.push({ h: hendelse, d: ren, t: Date.now() });
    if (statKo.length > 50) statKo.shift();
    try {
      if (window.RusjStat) window.RusjStat.hendelse(hendelse);
    } catch (e) {
      /* statistics never break a game */
    }
  };
  R._statKo = statKo;

  // ---------- The evening's scoreboard («Kveldens gjeng») ----------
  // At the end of a game: R.kveld.registrer(rader) with the same rows as R.ui.poengliste.
  // Places 1/2/3 give 3/2/1 evening points (ties share). Kept on this phone only, for 12 hours.
  R.kveld = {
    les() {
      const k = R.les("kveld", null);
      if (!k || !Array.isArray(k.spill) || Date.now() - (k.start || 0) > 12 * 3600 * 1000) return { start: Date.now(), spill: [] };
      return k;
    },
    registrer(rader, valg) {
      try {
        const id = (APP && APP.id) || meta().id;
        const navn = (r) => (r.navn != null ? String(r.navn) : r.lag != null ? "Lag " + R.LAG[r.lag % R.LAG.length].navn : R.navn(r.i || 0));
        const med = (rader || []).filter((r) => typeof r.poeng === "number");
        if (med.length < 2 && !(valg && valg.solo)) return;
        const sortert = med.slice().sort((a, b) => b.poeng - a.poeng);
        // Nobody scored: the game counts for the evening, but nobody is placed (plass 0 gives no
        // evening points) — otherwise everyone would share first place and get three points each.
        const ingenPoeng = sortert.every((r) => r.poeng === 0);
        const resultat = sortert.map((r) => ({ navn: R.kutt(navn(r), 30), plass: ingenPoeng ? 0 : 1 + sortert.filter((x) => x.poeng > r.poeng).length }));
        const k = R.kveld.les();
        k.spill.push({ id, tid: Date.now(), resultat });
        k.spill = k.spill.slice(-60);
        R.skriv("kveld", k);
        R.statistikk("kveld", { spillere: resultat.length });
        merkerSjekk();
        // A calm moment on the end screen. Games often register just before R.gaTil("slutt"), so the
        // screen is read on the next tick; the tip only shows if the player is still there 1.8 s later.
        setTimeout(() => {
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && R.visInstallTips(), 1800);
        }, 0);
      } catch (e) {
        /* never break a game for the scoreboard */
      }
    },
    tavle() {
      const poeng = new Map();
      for (const s of R.kveld.les().spill)
        for (const r of s.resultat) {
          const p = r.plass === 1 ? 3 : r.plass === 2 ? 2 : r.plass === 3 ? 1 : 0;
          poeng.set(r.navn, (poeng.get(r.navn) || 0) + p);
        }
      return Array.from(poeng, ([navn, p]) => ({ navn, poeng: p })).sort((a, b) => b.poeng - a.poeng);
    },
  };

  // ---------- «Klistremerkeboka» (stickers, /merker/) ----------
  // The catalogue and the rules are in /felles/merker.js (rusj/merker.json + rusj/kit/merker.js).
  // rusj.merker = { <id>: day number earned }; rusj.spilt = ids of the games started on this phone
  // (for «tried 5 games»); rusj.merkerNye = earned stickers not yet celebrated. This phone only.
  const merkeKat = () => (window.RusjMerker && window.RUSJ_MERKER ? window.RUSJ_MERKER : null);
  const merkeListe = (nokkel) => {
    const l = R.les(nokkel, []);
    return Array.isArray(l) ? l.filter((x) => typeof x === "string").slice(0, 200) : [];
  };
  function merkerGi(ids) {
    const K = merkeKat();
    if (!K || !ids.length) return;
    const { lagret, nye } = window.RusjMerker.tildel(window.RusjMerker.rens(R.les("merker", {}), K), ids, K, R.dag().nr);
    if (!nye.length || !R.skriv("merker", lagret)) return;
    R.skriv("merkerNye", Array.from(new Set(merkeListe("merkerNye").concat(nye))));
    feirMerkerSnart(1600); // let the game's own celebration land first
  }
  // A game gives an explicit sticker (e.g. the first win against the phone). Safe to call again.
  R.merke = (id) => {
    try {
      merkerGi([id]);
    } catch (e) {
      /* a sticker never breaks a game */
    }
  };
  // The stickers that follow from what is already stored (dailies, the evening, games tried).
  function merkerSjekk() {
    try {
      const K = merkeKat();
      if (!K) return;
      const kilde = { daglig: R.les("daglig", {}), kveld: R.les("kveld", null), spilt: merkeListe("spilt"), iDag: R.dag().nr, naa: Date.now() };
      merkerGi(Array.from(window.RusjMerker.utled(K, kilde)));
    } catch (e) {
      /* ignore */
    }
  }
  R._merkerSjekk = merkerSjekk;
  function merkeSpilt() {
    const K = merkeKat();
    const id = (APP && APP.id) || meta().id;
    if (!K || !K.alle.includes(id)) return; // drinking games are never counted
    const spilt = merkeListe("spilt");
    if (!spilt.includes(id)) R.skriv("spilt", spilt.concat(id));
    merkerSjekk();
  }
  // The celebration waits for a calm screen: never during a countdown, over a sheet, while a timer
  // runs or while a secret card is on the screen. It tries again a little later until it can.
  let merkeTid = null;
  function merkeRolig() {
    if (!spillVises || document.hidden) return false;
    if (R.arkApent()) return false;
    const ned = $("#nedtelling");
    if (ned && !ned.hidden) return false;
    if (apenMappe || $("#skjerm .mappe, #skjerm [data-mappe]")) return false;
    for (const t of aktiveTimere) if (t.kjorer) return false;
    return true;
  }
  function feirMerkerSnart(ms) {
    clearTimeout(merkeTid);
    merkeTid = setTimeout(feirMerker, ms == null ? 1500 : ms);
  }
  function feirMerker() {
    const K = merkeKat();
    if (!K) return;
    const ids = merkeListe("merkerNye").filter((id) => K.merker.some((m) => m.id === id));
    if (!ids.length) return;
    if (!merkeRolig()) return feirMerkerSnart(1500);
    R.fjern("merkerNye");
    const merker = ids.map((id) => K.merker.find((m) => m.id === id));
    const navn = R.ramsOpp(merker.map((m) => m.navn));
    const etikett = merker.length === 1 ? "Nytt klistremerke:" : `${merker.length} nye klistremerker:`;
    let pop = $("#merke-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.className = "merke-pop";
      pop.id = "merke-pop";
      document.body.appendChild(pop);
    }
    pop.innerHTML = `<div class="merke-pop-inn">
      <span class="merke-pop-merker">${merker.slice(0, 3).map((m) => window.RusjMerker.tegn(m, G)).join("")}</span>
      <span class="merke-pop-tekst"><span class="merke-pop-etikett">${esc(etikett)}</span> <b>${esc(navn)}</b></span>
      <a class="merke-pop-lenke" href="/merker/">Se boka</a>
    </div>`;
    pop.classList.toggle("flere", merker.length > 1);
    pop.classList.remove("vis");
    void pop.offsetWidth;
    pop.classList.add("vis");
    siKit(`${etikett} ${navn}.`);
    R.lyd.pling();
    clearTimeout(pop._tid);
    pop._tid = setTimeout(skjulMerkePop, 5200);
  }
  function skjulMerkePop() {
    const pop = $("#merke-pop");
    if (pop) pop.classList.remove("vis");
  }

  // ---------- "Install as an app" tip ----------
  let installHendelse = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installHendelse = e;
  });
  R.erInstallert = () => !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone);
  // Shown at most twice per phone, at a calm moment (after a finished game).
  R.visInstallTips = (tving) => {
    if (R.iRamme || R.erInstallert()) return;
    if (!tving && (Number(R.felles.installTips) || 0) >= 2) return;
    if (R.arkApent && R.arkApent()) return;
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    R.felles.installTips = (Number(R.felles.installTips) || 0) + 1;
    R.lagreFelles();
    const tekst = installHendelse
      ? "Legg rusj på hjemskjermen, så starter spillene som en app – og de virker uten nett."
      : ios
        ? "Trykk på Del-knappen <b>⬆︎</b> nederst i Safari og velg «Legg til på Hjem-skjerm». Da starter rusj som en app – og spillene virker uten nett."
        : "Åpne menyen i nettleseren (⋮) og velg «Installer app» eller «Legg til på startsiden». Da starter rusj som en app – og spillene virker uten nett.";
    R.ark(`
      <h2 id="ark-tittel">Ha rusj som app</h2>
      <p class="ingress">${tekst}</p>
      ${installHendelse ? '<button class="knapp" data-h="installer-app">Installer rusj</button>' : ""}
      <button class="${installHendelse ? "lenke" : "knapp-2"}" data-h="lukk-ark">${installHendelse ? "Ikke nå" : "Skjønner!"}</button>`);
  };
  R._installer = async () => {
    if (!installHendelse) return R.lukkArk();
    installHendelse.prompt();
    try {
      await installHendelse.userChoice;
    } catch (e) {
      /* ignore */
    }
    installHendelse = null;
    R.lukkArk();
  };

  R.DYR = ["🦊", "🐸", "🐼", "🐙", "🦄", "🐯", "🐧", "🦉", "🐢", "🐳", "🦁", "🐨", "🐰", "🐝", "🦖", "🐷", "🐵", "🦜", "🐻", "🐞"];
  R.MAKS_SPILLERE = 20;
  R.navn = (i) => String(R.felles.navn[i] || "").trim() || `Spiller ${i + 1}`;
  R.avatar = (i, storrelse) =>
    `<span class="avatar ${storrelse || ""}" style="--pf: var(--p${(i % 20) + 1})" aria-hidden="true">${R.DYR[i % 20]}</span>`;
  R.LAG = [
    { navn: "Rosa", farge: "var(--rosa)" },
    { navn: "Gul", farge: "var(--lampe)" },
    { navn: "Blå", farge: "var(--himmel)" },
    { navn: "Grønn", farge: "var(--mynte)" },
  ];

  // ---------- Sound (synthesised, no files) ----------

  // The «Vanndråpe» palette (chosen by the owner 2026-11-11): every note is a water drop — a quick
  // chirp up, a ringing surface and a smaller drop after it — through a little warmth and a short
  // room. Nothing is identical twice (pitch, level and timing vary slightly), which is what keeps
  // synthesised sound from feeling digital. R.lyd.tone and R.lyd.stoy keep their signatures, so the
  // games' own melodies move to the new sound without changes.
  R.lyd = (() => {
    let ctx = null;
    let hoved = null;
    const litt = (x, andel) => x * (1 + (Math.random() - 0.5) * 2 * andel);
    function sikre() {
      if (!R.felles.lyd) return null;
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          // Play like media: on iPhone the sound then follows the volume buttons (where supported).
          try {
            if (navigator.audioSession) navigator.audioSession.type = "playback";
          } catch (e) {
            /* not supported */
          }
          ctx = new AC();
          const metning = ctx.createWaveShaper();
          const kurve = new Float32Array(1024);
          for (let i = 0; i < 1024; i++) kurve[i] = Math.tanh(1.6 * (i / 511.5 - 1)) / Math.tanh(1.6);
          metning.curve = kurve;
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 8200;
          const komp = ctx.createDynamicsCompressor();
          komp.threshold.value = -16;
          komp.ratio.value = 3;
          komp.attack.value = 0.004;
          komp.release.value = 0.2;
          hoved = ctx.createGain();
          hoved.gain.value = 0.8;
          hoved.connect(metning).connect(lp).connect(komp).connect(ctx.destination);
          const rom = ctx.createConvolver();
          const n = Math.floor(ctx.sampleRate * 1.1);
          const ir = ctx.createBuffer(2, n, ctx.sampleRate);
          for (let k = 0; k < 2; k++) {
            const d = ir.getChannelData(k);
            for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
          }
          rom.buffer = ir;
          const send = ctx.createGain();
          send.gain.value = 0.16;
          hoved.connect(send).connect(rom).connect(komp);
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
      } catch (e) {
        return null;
      }
    }
    let stoyBuffer = null;
    function stoyKilde(c) {
      if (!stoyBuffer) {
        stoyBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const d = stoyBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = c.createBufferSource();
      s.buffer = stoyBuffer;
      return s;
    }
    // A plain sine with a soft attack, optionally gliding (bubbles, thumps, low tones).
    function sinus(c, f, t0, varighet, styrke, tilF, glid, angrep) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(f, t0);
      if (tilF) o.frequency.exponentialRampToValueAtTime(tilF, t0 + (glid || Math.min(varighet, 0.12)));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(styrke, t0 + (angrep || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + varighet);
      o.connect(g).connect(hoved);
      o.start(t0);
      o.stop(t0 + varighet + 0.05);
    }
    // A struck surface: a tiny burst of noise rings a narrow filter.
    function slag(c, f, t0, styrke, q, varighet) {
      const s = stoyKilde(c);
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = f;
      filter.Q.value = q;
      const inn = c.createGain();
      inn.gain.setValueAtTime(1, t0);
      inn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.006);
      const g = c.createGain();
      g.gain.setValueAtTime(styrke * q * 0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + varighet);
      s.connect(inn).connect(filter).connect(g).connect(hoved);
      s.start(t0, Math.random() * 0.4);
      s.stop(t0 + 0.03);
    }
    // One water drop at pitch f.
    function drape(c, f, t0, varighet, styrke) {
      f = litt(f, 0.01);
      styrke = litt(styrke, 0.1);
      const l = Math.max(varighet * 1.8, 0.2);
      sinus(c, f * 0.55, t0, l, styrke, f * 1.06, 0.045, 0.004);
      slag(c, Math.min(f * 2.1, 9000), t0 + 0.002, styrke * 0.5, 28, 0.16);
      sinus(c, f * 0.9, t0 + litt(0.07, 0.2), 0.07, styrke * 0.22, f * 1.6, 0.03, 0.003);
    }
    // tone(frequency, start, duration, type, level, toFrequency) — kept for the games' own melodies.
    // Notes become drops; glides become soft bubbles; low notes stay round sine thumps; the harsh
    // waveforms (square, sawtooth) are never used any more.
    function tone(frekvens, start, varighet, type, styrke, tilFrekvens) {
      const c = sikre();
      if (!c || !(frekvens > 0)) return;
      const t0 = c.currentTime + Math.max(0, start || 0);
      const v = styrke || 0.2;
      const harde = type === "square" || type === "sawtooth";
      if (frekvens < 220 || varighet > 0.8) sinus(c, frekvens, t0, varighet, v * (harde ? 0.8 : 1), tilFrekvens, varighet, 0.01);
      else if (tilFrekvens) sinus(c, frekvens, t0, Math.max(varighet, 0.08), v * (harde ? 0.9 : 1.1), tilFrekvens, varighet * 0.8, 0.006);
      else drape(c, frekvens, t0, varighet, v * (harde ? 1.4 : 1.2));
    }
    function stoy(start, varighet, styrke, filterFrekvens, type) {
      const c = sikre();
      if (!c) return;
      const t0 = c.currentTime + Math.max(0, start || 0);
      const kilde = stoyKilde(c);
      const f = c.createBiquadFilter();
      f.type = type || "bandpass";
      f.frequency.value = litt(filterFrekvens || 1800, 0.06);
      f.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(styrke || 0.3, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + varighet);
      kilde.connect(f).connect(g).connect(hoved);
      kilde.start(t0, Math.random() * 0.4);
      kilde.stop(t0 + varighet + 0.05);
    }
    const C5 = 523.25;
    const E5 = 659.25;
    const G5 = 783.99;
    const A5 = 880;
    const C6 = 1046.5;
    const E6 = 1318.5;
    const G6 = 1568;
    // Runs a sound only when audio is on; d(f, t, length, level) plays a drop t seconds from now.
    const spill = (fn) => () => {
      const c = sikre();
      if (!c) return;
      const n = c.currentTime + 0.01;
      fn((f, t, l, s) => drape(c, f, n + t, l, s), c, n);
    };
    return {
      lasOpp: sikre,
      tone: tone,
      stoy: stoy,
      klikk: spill((d, c, n) => {
        sinus(c, litt(820, 0.08), n, 0.05, 0.16, 1500, 0.03, 0.003);
        slag(c, litt(2600, 0.08), n, 0.1, 22, 0.07);
      }),
      pop: spill((d, c, n) => sinus(c, litt(330, 0.05), n, 0.14, 0.26, 640, 0.05, 0.004)),
      snu: spill((d, c, n) => {
        stoy(0, 0.13, 0.11, 1600);
        d(G5 / 2, 0.09, 0.08, 0.16);
      }),
      sveip: () => stoy(0, 0.24, 0.13, 1800),
      tikk: spill((d) => d(A5, 0, 0.06, 0.14)),
      takk: spill((d) => d(E5, 0, 0.06, 0.12)),
      pek: spill((d, c, n) => {
        sinus(c, 220, n, 0.32, 0.22, 440, 0.25, 0.01);
        d(A5, 0.24, 0.12, 0.2);
      }),
      riktig: spill((d) => {
        d(E5, 0, 0.12, 0.26);
        d(A5, 0.11, 0.18, 0.28);
      }),
      feil: spill((d, c, n) => {
        sinus(c, 300, n, 0.3, 0.2, 165, 0.18, 0.008);
        sinus(c, 235, n + 0.17, 0.36, 0.2, 125, 0.2, 0.008);
        slag(c, 420, n, 0.08, 10, 0.12);
      }),
      pling: spill((d) => {
        d(C6, 0, 0.16, 0.24);
        d(G6, 0.06, 0.12, 0.1);
      }),
      trommevirvel: (sekunder) => {
        const c = sikre();
        if (!c) return;
        const n = c.currentTime + 0.01;
        let t = 0;
        let avstand = 0.07;
        while (t < sekunder) {
          stoy(t, 0.05, litt(0.1 + (t / sekunder) * 0.18, 0.2), 900);
          sinus(c, litt(170, 0.05), n + t, 0.06, 0.09, 130, 0.04);
          t += litt(avstand, 0.08);
          avstand = Math.max(0.035, avstand * 0.97);
        }
        stoy(sekunder, 0.4, 0.22, 2000);
        drape(c, C5, n + sekunder, 0.4, 0.26);
        drape(c, G5, n + sekunder + 0.01, 0.4, 0.2);
      },
      fanfare: spill((d) => {
        [C5, E5, G5, C6].forEach((f, i) => d(f, i * 0.105 + (i % 2) * 0.012, 0.14, 0.24));
        [C5, E5, G5, C6, E6].forEach((f, i) => d(f, 0.5 + i * 0.012, 0.5, 0.17));
        [G6, E6, G6].forEach((f, i) => d(f, 0.74 + i * 0.1, 0.1, 0.09));
      }),
      buu: spill((d, c, n) => {
        sinus(c, 392, n, 0.32, 0.16, 370, 0.3, 0.02);
        sinus(c, 370, n + 0.34, 0.32, 0.16, 349, 0.3, 0.02);
        sinus(c, 349, n + 0.68, 0.7, 0.16, 262, 0.6, 0.02);
      }),
      latter: spill((d) => [0, 0.12, 0.24, 0.36].forEach((t, i) => d(G5 - i * 40, t, 0.08, 0.16))),
      alarm: spill((d) => [0, 0.22, 0.44].forEach((t) => d(C6, t, 0.1, 0.24))),
      bom: spill((d, c, n) => {
        stoy(0, 1.1, 0.5, 400, "lowpass");
        sinus(c, 110, n, 0.9, 0.5, 40, 0.8, 0.01);
      }),
      hjerteslag: spill((d, c, n) => {
        sinus(c, 70, n, 0.14, 0.5, 50, 0.12, 0.01);
        sinus(c, 70, n + 0.16, 0.14, 0.4, 50, 0.12, 0.01);
      }),
    };
  })();

  R.vibrer = (monster) => {
    try {
      if (R.felles.lyd && navigator.vibrate) navigator.vibrate(monster);
    } catch (e) {
      /* not supported */
    }
  };

  // Keep the screen awake during a game (re-acquired when the tab comes back).
  // Only one lock at a time, also when holdVaken is called again while a request is on its way.
  let vekkLas = null;
  let vekkVenter = null;
  let vilVaere = false;
  R.holdVaken = async () => {
    vilVaere = true;
    if (vekkLas || vekkVenter || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      vekkVenter = navigator.wakeLock.request("screen");
      const las = await vekkVenter;
      vekkVenter = null;
      if (!vilVaere) {
        las.release().catch(() => {});
        return;
      }
      vekkLas = las;
      las.addEventListener("release", () => {
        if (vekkLas === las) vekkLas = null;
      });
    } catch (e) {
      vekkVenter = null;
      vekkLas = null;
    }
  };
  R.slippVaken = () => {
    vilVaere = false;
    const las = vekkLas;
    vekkLas = null;
    if (las) las.release().catch(() => {});
  };

  // ---------- Live announcements for screen readers ----------
  // One polite region (#si, in the page from the start, never redrawn) is the kit's only voice.
  // Every message is a line of its own in it: two messages in a row are both spoken, and a line
  // is taken away again when a screen reader has had time to read it.

  const siNorm = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
  let siITur = false; // the game spoke for itself in this turn of the event loop
  let siSagt = []; // what was said in the last second and a half: [text, time, by the kit itself?]
  const siNylig = (tekst, avKit) => {
    const na = performance.now();
    siSagt = siSagt.filter((s) => na - s[1] < 1500);
    return siSagt.some((s) => s[0] === tekst && (avKit == null || s[2] === avKit));
  };
  // varig: the line stays until the caller removes it (the back of a secret card, while it shows).
  function siLinje(tekst, varig) {
    const el = $("#si");
    tekst = siNorm(tekst);
    if (!el || !tekst) return null;
    const p = document.createElement("p");
    p.textContent = tekst;
    el.appendChild(p);
    while (el.children.length > 8) el.firstElementChild.remove();
    if (!varig) setTimeout(() => p.remove(), Math.min(15000, 4000 + 70 * tekst.length));
    return p;
  }
  R.si = (tekst) => {
    tekst = siNorm(tekst);
    if (!tekst) {
      // R.si("") takes back what was said (a secret that is hidden again must not stay readable).
      const el = $("#si");
      if (el) el.textContent = "";
      return;
    }
    siITur = true;
    setTimeout(() => {
      siITur = false;
    }, 0);
    // The kit said the very same thing a moment ago (a status line, a toast): once is enough.
    if (siNylig(tekst, true)) return;
    siSagt.push([tekst, performance.now(), false]);
    // (A moment later: a message said just before a change of screen is for the new screen, and
    // R.gaTil empties #si as it leaves the old one.)
    setTimeout(() => siLinje(tekst), 30);
  };
  // The kit's own messages (status lines, toasts): never twice, and not on top of the game's own words.
  function siKit(tekst) {
    tekst = siNorm(tekst);
    if (!tekst || siNylig(tekst)) return null;
    siSagt.push([tekst, performance.now(), true]);
    return siLinje(tekst);
  }

  // ---------- Status lines: one voice ----------
  // A status line inside the screen (aria-live="polite", role="status", <output>, or data-si) is
  // made anew by every redraw, and a live region that arrives with its text already in it is not
  // read by most screen readers. So the kit reads them out itself: it switches the regions off
  // (aria-live="off", so nothing is ever said twice), remembers what each one said, and says what
  // changed through #si. Assertive regions and role="alert" are left as the game made them.
  // A game that says something itself with R.si during the same action is not talked over.

  const STATUS = '[aria-live="polite"], [role="status"]:not([aria-live]), output:not([aria-live]), [data-si]:not([aria-live])';
  const statusMinne = new Map(); // key → what that line says now
  const statusLinje = new Map(); // key → its line in #si, so a newer text replaces an unread older one
  let statusVenter = 0;
  let statusStille = false;
  const statusRotter = () => [$("#skjerm"), $("#ark-innhold")].filter(Boolean);
  // The regions that have come since last time: off for the screen reader, marked as the kit's.
  function statusOverta() {
    for (const rot of statusRotter())
      for (const el of rot.querySelectorAll(STATUS)) {
        el.setAttribute("aria-live", "off");
        el.setAttribute("data-si", "");
      }
  }
  function statusLes() {
    const ut = [];
    statusOverta();
    for (const rot of statusRotter()) {
      const sett = new Map();
      for (const el of rot.querySelectorAll("[data-si]")) {
        if (el.closest('[hidden], [aria-hidden="true"]')) continue;
        const slag = rot.id + " " + (el.id ? "#" + el.id : el.tagName + "." + (el.classList[0] || ""));
        const nr = (sett.get(slag) || 0) + 1;
        sett.set(slag, nr);
        ut.push([slag + " " + nr, siNorm(el.textContent)]);
      }
    }
    return ut;
  }
  // stille: only remember what the lines say (a new screen or sheet: its heading gets focus and is
  // read; what is on it from the start is not news).
  function statusSjekk(stille) {
    clearTimeout(statusVenter);
    statusVenter = 0;
    const hopp = stille || statusStille;
    statusStille = false;
    const na = statusLes();
    const nytt = hopp ? [] : na.filter(([nokkel, tekst]) => tekst && statusMinne.get(nokkel) !== tekst);
    statusMinne.clear();
    for (const [nokkel, tekst] of na) statusMinne.set(nokkel, tekst);
    for (const [nokkel, tekst] of nytt) {
      const forrige = statusLinje.get(nokkel);
      if (forrige) forrige.remove();
      const linje = siKit(tekst);
      if (linje) statusLinje.set(nokkel, linje);
      else statusLinje.delete(nokkel);
    }
  }
  // Something in the screen changed. Wait a moment, so a row of quick changes (several redraws in
  // one action, a number counting up) is read once, as it ended.
  function statusEndret() {
    if (siITur) statusStille = true;
    if (!statusVenter) statusVenter = setTimeout(() => statusSjekk(false), 120);
  }

  // ---------- Focus that survives ----------
  // A redraw replaces the control that had focus, and the browser then drops focus to <body>: a
  // screen-reader user is thrown to the top of the page, a keyboard user tabs from the start.
  // The kit puts focus back: on the same control when it is still there, else where the game
  // points (data-fokus on the natural next control), else on a control of the same kind, else on
  // the screen's heading. It only does so when focus was in the screen and was lost — never when
  // nothing had focus, or when it was put down on purpose.

  let sistFokus = null; // the control that last had focus inside the screen or the sheet
  const iBruk = (el) => !!el && el.isConnected && !el.disabled && !el.closest("[inert], [hidden]");
  const kanFokuseres = (el) => iBruk(el) && el.getClientRects().length > 0;
  function beskrivFokus(el) {
    const rot = el && el.closest ? el.closest("#ark-innhold, #skjerm") : null;
    if (!rot) return null;
    const d = el.dataset || {};
    // (Its kind — tag and first class — and its number among those, for controls with no name.)
    const slag = el.tagName.toLowerCase() + (el.classList && el.classList[0] ? "." + CSS.escape(el.classList[0]) : "");
    const like = $$(slag, rot);
    return {
      el,
      rot: rot.id,
      id: el.id,
      h: d.h,
      data: Object.keys(d).map((k) => [k, d[k]]),
      nr: d.h != null ? $$(`[data-h="${CSS.escape(d.h)}"]`, rot).indexOf(el) : -1,
      slag,
      slagNr: like.indexOf(el),
      slagAntall: like.length,
    };
  }
  // The same control in the screen as it is now (after a redraw), or null.
  function finnIgjen(f) {
    const rot = f && document.getElementById(f.rot);
    if (!rot) return null;
    const ok = (el) => (el && rot.contains(el) && kanFokuseres(el) ? el : null);
    let ny = f.id ? ok(document.getElementById(f.id)) : null;
    if (!ny && f.h != null) {
      const like = $$(`[data-h="${CSS.escape(f.h)}"]`, rot);
      ny = ok(like.find((k) => Object.keys(k.dataset).length === f.data.length && f.data.every(([n, v]) => k.dataset[n] === v)));
      const v = f.data.find(([n]) => n === "v");
      if (!ny && v) ny = ok(like.find((k) => k.dataset.v === v[1]));
    }
    if (!ny && f.h == null) {
      // A secret card, a name field, a field of the game's own: found again by what it is for.
      const egen = f.data.find(([n]) => n === "mappe" || n === "navn" || n === "felt");
      if (egen) ny = ok(rot.querySelector(`[data-${egen[0]}="${CSS.escape(egen[1])}"]`));
      // A control the game handles itself: the same one of its kind, when there are as many as before.
      if (!ny && !egen && f.slagNr >= 0) {
        const like = $$(f.slag, rot);
        if (like.length === f.slagAntall) ny = ok(like[f.slagNr]);
      }
    }
    return ny;
  }
  // Where focus goes when the control is gone (f may be null: then the game's wish or the heading).
  function fokusReserve(f, rotId) {
    const rot = document.getElementById((f && f.rot) || rotId || "skjerm");
    if (!rot || rot.closest("[inert], [hidden]")) return null;
    let ny = $$("[data-fokus]", rot).find(kanFokuseres) || null;
    if (!ny && f && f.h != null && f.nr >= 0) {
      const like = $$(`[data-h="${CSS.escape(f.h)}"]`, rot).filter(kanFokuseres);
      ny = like[Math.min(f.nr, like.length - 1)] || null;
    }
    return ny || rot.querySelector("h1, h2") || rot;
  }
  function fokuser(el) {
    if (!el) return;
    try {
      // (A heading or the screen itself takes focus from a script, never from the Tab key.)
      if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    } catch (e) {
      /* ignore */
    }
  }
  const utenFokus = () => {
    const a = document.activeElement;
    return !a || a === document.body || a === document.documentElement || !iBruk(a);
  };
  // Called after every change in the screen: give focus back if the change took it away.
  function reddFokus() {
    const f = sistFokus;
    if (!f || !utenFokus() || nedteller) return; // (the countdown gives focus back itself)
    if (iBruk(f.el)) return; // still there: focus was put down on purpose
    fokuser(finnIgjen(f) || fokusReserve(f));
  }
  document.addEventListener(
    "focusin",
    (e) => {
      sistFokus = beskrivFokus(e.target);
      fokusring(e.target);
    },
    true,
  );

  // ---------- A focus ring that shows on any ground ----------
  // The ring is the game's accent colour, made for the dark page (rusj.css adds a band of ink
  // inside it). On a paper card or a coloured board the accent can vanish: yellow on cream, blue
  // on blue. So when a control takes keyboard focus, the kit looks at the colour behind it, and
  // where the accent does not stand out (3:1) the ring is drawn in ink or in cream instead,
  // whichever shows best. A surface can also say it itself in CSS: --fokus (and --fokus-2).
  function lesFarge(tekst) {
    // "rgb(21, 12, 40)", "rgba(33, 20, 61, 0.6)" or — from color-mix() — "color(srgb 0.2 0.1 0.3 / 0.5)"
    const m = /^(rgba?|color)\(([^)]*)\)/.exec(String(tekst || "").trim());
    if (!m) return null;
    const d = m[2].replace(/^srgb\s+/, "").split(/[\s,/]+/).filter(Boolean).map(Number);
    if (d.length < 3 || d.some((v) => !isFinite(v))) return null;
    const f = m[1] === "color" ? 255 : 1;
    return [d[0] * f, d[1] * f, d[2] * f, d.length > 3 ? d[3] : 1];
  }
  const lys = (c) => {
    const l = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * l(c[0]) + 0.7152 * l(c[1]) + 0.0722 * l(c[2]);
  };
  const kontrast = (a, b) => (Math.max(lys(a), lys(b)) + 0.05) / (Math.min(lys(a), lys(b)) + 0.05);
  // The colour behind an element: the backgrounds of its ancestors laid on top of each other, down
  // to the page. null when a picture or a gradient without a colour under it is in the way.
  function grunnfarge(el) {
    const lag = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      const f = lesFarge(s.backgroundColor);
      if (f && f[3] > 0.02) {
        lag.push(f);
        if (f[3] >= 0.98) break;
      } else if (s.backgroundImage && s.backgroundImage !== "none" && e !== document.body && e !== document.documentElement) return null;
    }
    let farge = [21, 12, 40]; // --natt, the page
    for (let i = lag.length - 1; i >= 0; i--) farge = farge.map((v, k) => lag[i][k] * lag[i][3] + v * (1 - lag[i][3]));
    return farge;
  }
  const BLEKK = [23, 14, 43];
  const PAPIR = [255, 241, 221];
  const ringSatt = typeof WeakSet !== "undefined" ? new WeakSet() : null; // controls whose ring colour the kit has set
  function fokusring(el) {
    try {
      if (!ringSatt || !el || !el.matches || !el.matches(":focus-visible")) return;
      if (ringSatt.has(el)) {
        el.style.removeProperty("outline-color"); // judged anew every time
        ringSatt.delete(el);
      }
      const s = getComputedStyle(el);
      if (s.outlineStyle === "none" || !(parseFloat(s.outlineWidth) > 0)) return; // no ring: the control shows focus its own way
      const ring = lesFarge(s.outlineColor);
      // The ring is drawn outside the control (on what is behind it) unless it is pulled inside.
      const bak = grunnfarge(parseFloat(s.outlineOffset) < 0 ? el : el.parentElement);
      if (!ring || !bak || kontrast(ring, bak) >= 3) return;
      el.style.outlineColor = kontrast(BLEKK, bak) >= kontrast(PAPIR, bak) ? "#170e2b" : "#fff1dd";
      ringSatt.add(el);
    } catch (e) {
      /* the ring stays as the stylesheet made it */
    }
  }
  document.addEventListener(
    "focusout",
    (e) => {
      // Put down on purpose (blur(), a tap beside the buttons): nothing to give back later. Looked
      // at a moment after, because a control that is being removed loses focus the same way —
      // and that is the loss to mend.
      const el = e.target;
      if (e.relatedTarget) return;
      setTimeout(() => {
        if (sistFokus && sistFokus.el === el && iBruk(el)) sistFokus = null;
      }, 0);
    },
    true,
  );

  // ---------- Sheet, confirm, toast ----------

  // While a sheet or the countdown covers the page, the page behind it is out of reach for
  // everyone: no tabbing into it, and a screen reader cannot wander out of the dialog (TalkBack
  // does not stop at aria-modal). The toast, #si and the sheet itself are outside .app.
  let nedteller = false; // the countdown overlay is up
  function settInert() {
    const app = $(".app");
    if (app) app.inert = nedteller || R.arkApent();
  }

  let arkSvar = null;
  let arkFokus = null;
  R.ark = (html) => {
    if (arkSvar) {
      const s = arkSvar;
      arkSvar = null;
      s(false);
    }
    const aktiv = document.activeElement;
    if (aktiv && aktiv !== document.body && !aktiv.closest("#ark")) {
      // Remember the element and how to find it again if the screen is redrawn meanwhile.
      arkFokus = { el: aktiv, id: aktiv.id, f: beskrivFokus(aktiv) };
    }
    if (apenMappe && apenMappe.closest("#ark")) lukkMappe(true); // a card in the sheet that is being replaced
    $("#ark-innhold").innerHTML = html;
    $("#ark").hidden = false;
    settInert();
    flyttToast();
    statusSjekk(true);
    const forste = $("#ark-innhold h2") || $("#ark-innhold button, #ark-innhold input");
    if (forste) {
      if (forste.tagName === "H2") forste.setAttribute("tabindex", "-1");
      forste.focus({ preventScroll: true });
    }
  };
  R.lukkArk = () => {
    const ark = $("#ark");
    if (!ark || ark.hidden) return;
    if (apenMappe && apenMappe.closest("#ark")) lukkMappe(true); // a secret card in the sheet goes with it
    ark.hidden = true;
    $("#ark-innhold").innerHTML = "";
    settInert();
    const husk = arkFokus;
    arkFokus = null;
    if (husk) {
      // Back to where the sheet was opened from — or, when that control is gone, as after a redraw.
      let mal = kanFokuseres(husk.el) ? husk.el : null;
      if (!mal && husk.id) mal = document.getElementById(husk.id);
      if (!mal || !kanFokuseres(mal)) mal = husk.f ? finnIgjen(husk.f) || fokusReserve(husk.f) : null;
      fokuser(mal);
    }
    if (arkSvar) {
      const svar = arkSvar;
      arkSvar = null;
      svar(false);
    }
  };
  // Keep keyboard focus inside an open sheet (it is a modal dialog).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !R.arkApent()) return;
    const fokuserbare = $$("#ark-innhold button:not([disabled]), #ark-innhold a[href], #ark-innhold input:not([disabled]), #ark-innhold textarea").filter((el) => el.offsetParent !== null);
    if (!fokuserbare.length) return;
    const forste = fokuserbare[0];
    const siste = fokuserbare[fokuserbare.length - 1];
    if (!$("#ark-innhold").contains(document.activeElement)) {
      e.preventDefault();
      forste.focus();
    } else if (e.shiftKey && (document.activeElement === forste || document.activeElement.tagName === "H2")) {
      // (Backwards from the first control — or from the heading, where focus starts — is the last one.)
      e.preventDefault();
      siste.focus();
    } else if (!e.shiftKey && document.activeElement === siste) {
      e.preventDefault();
      forste.focus();
    }
  });
  R.arkApent = () => !$("#ark").hidden;
  R.bekreft = (tittel, tekst, ja, nei) =>
    new Promise((resolve) => {
      R.ark(`
        <h2 id="ark-tittel">${esc(tittel)}</h2>
        ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
        <div class="knapprad">
          <button class="knapp-2" data-h="ark-svar" data-v="nei">${esc(nei || "Avbryt")}</button>
          <button class="knapp rosa" data-h="ark-svar" data-v="ja">${esc(ja || "Ja")}</button>
        </div>`);
      arkSvar = resolve;
    });
  // Choose one of several options in a sheet. valg: [{ v, tekst }]. Resolves to v or null.
  // Ask before a new game replaces one in progress. Resolves true right away if nothing is running.
  // solo: talk to one person («du»). Defaults to true for one-player games; pass it for games
  // that can be played alone or together (e.g. sp.antall === 1).
  R.bekreftNytt = (pagar, solo) => {
    if (!pagar) return Promise.resolve(true);
    const alene = solo != null ? !!solo : !!(meta().spillere && meta().spillere[1] === 1);
    return R.bekreft("Starte et nytt spill?", alene ? "Spillet du holder på med, forsvinner." : "Spillet dere holder på med, og stillingen forsvinner.", "Start nytt", "Avbryt");
  };
  R.velgIArk = (tittel, valg, tekst) =>
    new Promise((resolve) => {
      R.ark(`
        <h2 id="ark-tittel">${esc(tittel)}</h2>
        ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
        <div class="stabel">${valg.map((o, i) => `<button class="knapp-2" data-h="ark-svar" data-v="${i}">${esc(o.tekst)}</button>`).join("")}</div>
        <button class="lenke" data-h="lukk-ark">Avbryt</button>`);
      arkSvar = (svar) => resolve(svar === false || svar == null ? null : valg[Number(svar)].v);
    });

  let toastId = null;
  let toastValg = null;
  let toastVist = 0; // when the toast that is showing came up
  // A toast stays long enough to be read: 2.2 s for a word or two, longer for a sentence
  // (about 70 ms a character), at most 8 s.
  const toastTid = (tekst) => Math.min(8000, Math.max(2200, 1500 + 70 * String(tekst).length));
  R._toastTid = toastTid;
  // The note about saving was cut short (a new screen, another toast): let it come once more.
  const toastSlutt = (t) => {
    if (t && t.textContent === LAGRING_TEKST && performance.now() - toastVist < 2500) lagringMeldt = false;
  };
  R.skjulToast = () => {
    clearTimeout(toastId);
    toastValg = null;
    const t = $("#toast");
    if (!t || !t.classList.contains("vis")) return;
    toastSlutt(t);
    t.classList.remove("vis");
    t.setAttribute("aria-hidden", "true"); // gone for the eye, so gone for a screen reader too
  };
  // Is something of the screen (text, a button, a board, a card) painted inside this box?
  function opptatt(f) {
    const skjerm = $("#skjerm");
    if (!skjerm) return false;
    for (const el of skjerm.querySelectorAll("*")) {
      const svg = el.closest("svg");
      if ((svg && svg !== el) || el.closest(".dokk")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= f.topp || r.top >= f.bunn || r.right <= f.venstre || r.left >= f.hoyre) continue;
      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (svg || /^(BUTTON|INPUT|SELECT|TEXTAREA|CANVAS|IMG)$/.test(el.tagName)) return true;
      if (Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim())) return true;
      const stil = getComputedStyle(el);
      if (stil.backgroundImage !== "none" || !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(stil.backgroundColor) || parseFloat(stil.borderTopWidth) > 0) return true;
    }
    return false;
  }
  // The toast sits just above the action area when that spot is empty (near the thumb, never over
  // the buttons). When the board, a helper line or a list reaches down there — or a sheet is open
  // — it goes to the top, under the top bar, instead.
  function plasserToast() {
    const t = $("#toast");
    if (!t) return;
    t.style.top = "";
    t.style.bottom = "";
    t.style.left = "";
    t.style.right = "";
    t.style.maxWidth = "";
    if ((toastValg && toastValg.topp) || R.arkApent()) return;
    const dokk = $("#skjerm .dokk");
    if (dokk && R.liggende() === "side") {
      // Landscape phones: the dock is a column on the right. The toast goes above the buttons
      // there when it fits; otherwise it stays at the top.
      const d = dokk.getBoundingClientRect();
      t.style.left = Math.round(d.left) + "px";
      t.style.right = Math.round(window.innerWidth - d.right) + "px";
      t.style.maxWidth = Math.round(d.width) + "px";
      const h = t.offsetHeight || 48;
      const tak = ($(".topp") ? $(".topp").getBoundingClientRect().bottom : 0) + 4;
      if (d.top - h - 10 >= Math.max(tak, 4)) {
        t.style.top = "auto";
        t.style.bottom = Math.round(window.innerHeight - d.top + 6) + "px";
      } else {
        t.style.left = "";
        t.style.right = "";
        t.style.maxWidth = "";
      }
      return;
    }
    const topp = dokk ? dokk.getBoundingClientRect().top : 0;
    if (!dokk || topp <= 120 || topp >= window.innerHeight) return;
    const h = t.offsetHeight || 48;
    const b = t.offsetWidth || 220;
    if (opptatt({ topp: topp - 14 - h, bunn: topp - 6, venstre: (window.innerWidth - b) / 2 - 4, hoyre: (window.innerWidth + b) / 2 + 4 })) return;
    t.style.top = "auto";
    t.style.bottom = Math.round(window.innerHeight - topp + 10) + "px";
  }
  // R.toast(tekst) or R.toast(tekst, { topp: true }) to always show it at the top.
  R.toast = (tekst, valg) => {
    const t = $("#toast");
    if (!t) return;
    if (t.classList.contains("vis")) toastSlutt(t);
    // The toast is for the eye. A screen reader gets the text through #si like everything else:
    // one voice, and a toast that comes again later is said again.
    if (t.getAttribute("aria-live") !== "off") {
      t.setAttribute("aria-live", "off");
      t.removeAttribute("role");
    }
    t.removeAttribute("aria-hidden");
    t.textContent = tekst;
    toastValg = valg || {};
    toastVist = performance.now();
    plasserToast();
    t.classList.add("vis");
    clearTimeout(toastId);
    toastId = setTimeout(R.skjulToast, toastTid(tekst));
    siKit(tekst);
  };
  // A redraw or a sheet may have moved things under a toast that is showing: place it again.
  const flyttToast = () => {
    const t = $("#toast");
    if (t && toastValg && t.classList.contains("vis")) plasserToast();
  };

  R.kopier = async (tekst) => {
    try {
      await navigator.clipboard.writeText(tekst);
      R.toast("Kopiert!");
      return true;
    } catch (e) {
      R.toast("Kunne ikke kopiere – marker teksten selv");
      return false;
    }
  };

  // Share a link with the phone's share sheet, or copy it.
  // valg.kort = { tittel, linjer }: when the phone can share files, the share carries a picture of
  // the result too (see R.delKort). Only results go on the card: never an answer, never typed text.
  R.del = async (tittel, tekst, url, valg) => {
    const kort = valg && valg.kort;
    if (kort && kanDeleBilde()) {
      const fil = await kortFil(Object.assign({ url }, kort)).catch(() => null);
      if (fil && navigator.canShare({ files: [fil] })) {
        // With a file, the link goes in the text: several apps drop the url field next to a file.
        const data = { files: [fil], title: tittel, text: [tekst, url].filter(Boolean).join("\n") };
        try {
          await navigator.share(data);
          return;
        } catch (e) {
          if (e && e.name === "AbortError") return;
          // Drawing took longer than the browser lets a tap count: one more tap shares the same picture.
          if (e && e.name === "NotAllowedError") return visDelArk(data);
        }
      }
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: tittel, text: tekst, url: url });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    // No share sheet: copy the whole thing (e.g. a result with coloured squares), not just the link.
    R.kopier([tekst, url].filter(Boolean).join("\n"));
  };

  // ---------- Share card (a picture of the result) ----------
  // R.delKort({ tittel, linjer, id, url, tekst }): draws a 1080×1350 card – dark night, a paper card
  // with the game's mascot, the result in big letters, the rusj logo and «rusj.no/<id>» – and shares
  // it as a PNG with the text and link. Falls back to R.del's text share when files can't be shared.
  // linjer[0] is the big result line («4/6»); the rest are smaller (squares, streak). First names at
  // most: never an answer and never other text a player typed.
  const KORT_B = 1080;
  const KORT_H = 1350;
  const KORT_FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  const KORT_FARGER = { natt: "#150c28", natt2: "#2e1e52", papir: "#fff1dd", blekk: "#170e2b", blekk2: "#4a3a66", lampe: "#ffd23f" };
  // The paper card and the text column inside it.
  const KORT_RAMME = { x: 90, y: 370, b: 900, h: 800, tekstB: 780 };

  // «https://rusj.no/ordugla/#utfordring» → «rusj.no/ordugla».
  const kortAdresse = (url, id) => {
    const fra = String(url || "").replace(/^[a-z]+:\/\//i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (/^rusj\.no(\/[\w-]+)?$/.test(fra)) return fra;
    return id ? `rusj.no/${id}` : "rusj.no";
  };

  // Pure layout: what is written where. mal(tekst, px) measures a line at that font size (the
  // canvas in the browser, a fake in the tests). Long lines shrink, then end in «…»; lines that
  // don't fit the card are left out.
  function kortOppsett(o, mal) {
    const ren = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, 80);
    const W = KORT_RAMME.tekstB;
    const pass = (tekst, start, min) => {
      let px = start;
      while (px > min && mal(tekst, px) > W) px -= 2;
      let t = tekst;
      while (t.length > 1 && mal(t, px) > W) t = Array.from(t).slice(0, -2).join("") + "…";
      return { tekst: t, px };
    };
    const linjer = (Array.isArray(o.linjer) ? o.linjer : [o.linjer]).map(ren).filter(Boolean).slice(0, 8);
    const ut = { tittel: null, linjer: [], adresse: kortAdresse(o.url, o.id || meta().id) };
    const topp = KORT_RAMME.y + 170; // under the mascot
    let y = topp;
    const bunn = KORT_RAMME.y + KORT_RAMME.h - 50;
    if (ren(o.tittel)) {
      ut.tittel = pass(ren(o.tittel), 64, 34);
      y += ut.tittel.px;
      ut.tittel.y = y;
      y += 30;
    }
    // Room left for the rest: the big line gets up to 150 px, the others share what is left.
    linjer.forEach((t, i) => {
      const stor = i === 0;
      const igjen = linjer.length - i;
      const plass = bunn - y;
      const maks = stor ? Math.min(150, Math.floor(plass / (1 + Math.max(0, igjen - 1) * 0.45) / 1.15)) : Math.min(64, Math.floor(plass / igjen / 1.25));
      if (maks < 24) return;
      const l = pass(t, maks, stor ? 48 : 24);
      if (y + l.px * (stor ? 1.05 : 1.2) > bunn + 1) return;
      y += l.px * (stor ? 1.05 : 1.2);
      l.y = Math.round(y);
      l.stor = stor;
      ut.linjer.push(l);
      if (stor) y += 24;
    });
    // Centre the block in the room under the mascot.
    const slakk = Math.max(0, Math.floor((bunn - y) / 2));
    if (ut.tittel) ut.tittel.y += slakk;
    for (const l of ut.linjer) l.y += slakk;
    return ut;
  }

  // An SVG string as a drawable image (data: URL – allowed by the CSP), or null after 1.5 s.
  function svgBilde(svg, b, h) {
    return new Promise((ok) => {
      const img = new Image();
      const t = setTimeout(() => ok(null), 1500);
      img.onload = () => {
        clearTimeout(t);
        ok(img);
      };
      img.onerror = () => {
        clearTimeout(t);
        ok(null);
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", `<svg width="${b}" height="${h}" `));
    });
  }

  function rundRekt(ctx, x, y, b, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + b, y, x + b, y + h, r);
    ctx.arcTo(x + b, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + b, y, r);
    ctx.closePath();
  }

  // Draws the card; resolves to a PNG Blob (or null when the browser can't).
  async function tegnKort(o) {
    const id = o.id || meta().id;
    const F = KORT_FARGER;
    const fargeId = G && G.farge && id ? G.farge(id) : "";
    const farge = /^#[0-9a-f]{6}$/i.test(fargeId) ? fargeId : "#ff4f8b";
    const lerret = document.createElement("canvas");
    lerret.width = KORT_B;
    lerret.height = KORT_H;
    const ctx = lerret.getContext("2d");
    if (!ctx) return null;
    // Both pictures load at the same time; a missing one leaves its place empty.
    const logoSvg = G && G.logo ? G.logo({ fil: true }) : "";
    const vb = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(logoSvg);
    const logoB = 250;
    const logoH = vb ? Math.round((logoB * Number(vb[2])) / Number(vb[1])) : 120;
    const [figur, logo] = await Promise.all([
      G && id && G.finnes && G.finnes(id) ? svgBilde(G.fil(id), 512, 512) : null,
      logoSvg ? svgBilde(logoSvg, logoB * 2, logoH * 2) : null,
    ]);

    // Night with a glow in the game's colour.
    ctx.fillStyle = F.natt;
    ctx.fillRect(0, 0, KORT_B, KORT_H);
    const glod = ctx.createRadialGradient(KORT_B / 2, 520, 40, KORT_B / 2, 520, 820);
    glod.addColorStop(0, farge + "66");
    glod.addColorStop(1, farge + "00");
    ctx.fillStyle = glod;
    ctx.fillRect(0, 0, KORT_B, KORT_H);
    if (logo) ctx.drawImage(logo, (KORT_B - logoB) / 2, 40, logoB, logoH);

    // The paper card with the ink outline and a 3D edge in the game's colour.
    const R_ = KORT_RAMME;
    rundRekt(ctx, R_.x, R_.y + 18, R_.b, R_.h, 48);
    ctx.fillStyle = F.blekk;
    ctx.fill();
    rundRekt(ctx, R_.x, R_.y, R_.b, R_.h, 48);
    ctx.fillStyle = F.papir;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = F.blekk;
    ctx.stroke();
    if (figur) ctx.drawImage(figur, (KORT_B - 280) / 2, R_.y - 130, 280, 280);

    const oppsett = kortOppsett(o, (t, px) => {
      ctx.font = `900 ${px}px ${KORT_FONT}`;
      return ctx.measureText(t).width;
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (oppsett.tittel) {
      ctx.font = `900 ${oppsett.tittel.px}px ${KORT_FONT}`;
      ctx.fillStyle = F.blekk2;
      ctx.fillText(oppsett.tittel.tekst, KORT_B / 2, oppsett.tittel.y);
    }
    for (const l of oppsett.linjer) {
      ctx.font = `900 ${l.px}px ${KORT_FONT}`;
      ctx.fillStyle = F.blekk;
      ctx.fillText(l.tekst, KORT_B / 2, l.y);
    }
    // The address under the card, in lamp yellow.
    ctx.font = `900 64px ${KORT_FONT}`;
    ctx.fillStyle = F.lampe;
    ctx.fillText(oppsett.adresse, KORT_B / 2, KORT_H - 70);

    return new Promise((ok) => {
      try {
        lerret.toBlob((b) => ok(b), "image/png");
      } catch (e) {
        ok(null); // a tainted or unsupported canvas: the text share takes over
      }
    });
  }

  // One drawing per card: a second tap shares the same file without drawing again.
  const kortLager = new Map();
  function kortFil(o) {
    const nokkel = JSON.stringify([o.tittel, o.linjer, o.id, o.url]);
    if (!kortLager.has(nokkel)) {
      const navn = `rusj-${(o.id || meta().id || "resultat").replace(/[^\w-]/g, "")}.png`;
      kortLager.set(
        nokkel,
        tegnKort(o).then((b) => (b ? new File([b], navn, { type: "image/png" }) : null)),
      );
    }
    return kortLager.get(nokkel);
  }
  function kanDeleBilde() {
    try {
      return !!(navigator.canShare && navigator.share && typeof File === "function" && navigator.canShare({ files: [new File(["x"], "x.png", { type: "image/png" })] }));
    } catch (e) {
      return false;
    }
  }
  let ventendeDeling = null;
  function visDelArk(data) {
    ventendeDeling = data;
    R.ark(`
      <h2 id="ark-tittel">Bildet er klart</h2>
      <p class="ingress">Trykk for å dele resultatet som bilde.</p>
      <div class="stabel">
        <button class="knapp" data-h="del-bilde">Del bildet</button>
        <button class="lenke" data-h="lukk-ark">Avbryt</button>
      </div>`);
  }
  async function delVentende() {
    const data = ventendeDeling;
    R.lukkArk();
    ventendeDeling = null;
    if (!data) return;
    try {
      await navigator.share(data);
    } catch (e) {
      if (!e || e.name !== "AbortError") R.kopier(data.text);
    }
  }

  R.delKort = (o) => {
    o = o || {};
    const navn = meta().navn || "rusj";
    const tekst = o.tekst || [o.tittel, ...(o.linjer || [])].filter(Boolean).join("\n");
    return R.del(o.delTittel || navn, tekst, o.url, { kort: { tittel: o.tittel, linjer: o.linjer, id: o.id } });
  };
  R.delKort.oppsett = kortOppsett; // for the tests
  R.delKort.adresse = kortAdresse;
  R.delKort.tegn = tegnKort; // → Promise<Blob | null>

  // ---------- Countdown overlay ----------

  // Resolves true when the countdown finished, false when the screen changed during it — so:
  //   if (!(await R.nedtelling())) return;
  R.nedtelling = async (liste, ms) => {
    liste = liste || ["3", "2", "1"];
    ms = ms || 800;
    const fortsatt = R.vakt();
    const el = $("#nedtelling");
    // Where focus is now: it comes back there when the countdown is over.
    const fokus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    const husk = fokus ? { el: fokus, f: beskrivFokus(fokus) } : null;
    el.hidden = false;
    nedteller = true;
    settInert(); // no tabbing to anything behind the countdown, the top bar included
    if (fokus && fokus.blur) fokus.blur(); // Enter/space must not re-trigger the button meanwhile
    for (let i = 0; i < liste.length; i++) {
      if (!fortsatt()) return false; // the screen changed: R.gaTil already hid the overlay
      const t = String(liste[i]);
      el.innerHTML = `<span class="${t.length > 2 ? "ord" : ""}">${esc(t)}</span>`;
      if (i < liste.length - 1 || /^\d+$/.test(t)) R.lyd.tikk();
      else R.lyd.pling();
      R.vibrer(20);
      // (The same pace with «reduce motion»: the numbers are also spoken, and that takes its time.)
      await R.vent(ms);
    }
    if (!fortsatt()) return false; // don't hide a newer countdown on the new screen
    el.hidden = true;
    el.innerHTML = "";
    nedteller = false;
    settInert();
    if (husk && utenFokus()) fokuser(kanFokuseres(husk.el) ? husk.el : husk.f ? finnIgjen(husk.f) || fokusReserve(husk.f) : null);
    return true;
  };

  // ---------- Confetti ----------

  let konfettiNr = 0;
  R.stoppKonfetti = () => {
    konfettiNr++;
    const lerret = $("#konfetti");
    const ctx = lerret && lerret.getContext && lerret.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, lerret.width, lerret.height);
  };
  R.konfetti = (fargeTokens) => {
    if (R.rolig()) return;
    const mitt = ++konfettiNr;
    const lerret = $("#konfetti");
    const ctx = lerret && lerret.getContext && lerret.getContext("2d");
    if (!ctx) return;
    const stil = getComputedStyle(document.documentElement);
    const farger = (fargeTokens || ["--aksent", "--rosa", "--mynte", "--lampe", "--himmel", "--lilla"])
      .map((t) => (t.startsWith("--") ? stil.getPropertyValue(t).trim() : t))
      .filter(Boolean);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const b = window.innerWidth;
    const h = window.innerHeight;
    lerret.width = b * dpr;
    lerret.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const biter = Array.from({ length: 150 }, () => ({
      x: b / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.32,
      vx: (Math.random() - 0.5) * 13,
      vy: -Math.random() * 13 - 5,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 9,
      f: farger[Math.floor(Math.random() * farger.length)],
    }));
    const start = performance.now();
    function ramme(na) {
      if (mitt !== konfettiNr) return; // stopped or replaced by a newer burst
      const t = na - start;
      ctx.clearRect(0, 0, b, h);
      for (const p of biter) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - t / 3200);
        ctx.fillStyle = p.f;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (t < 3200) requestAnimationFrame(ramme);
      else ctx.clearRect(0, 0, b, h);
    }
    requestAnimationFrame(ramme);
  };

  // ---------- Timer ----------
  // new R.Timer({ id, sekunder, vedTikk(igjen), vedSlutt(), tikk: true, visning: "mm:ss" | "sek" })
  // Draws into the R.ui.timer() markup with the same id. Timers stop automatically when the
  // screen changes, unless { overlev: true }.

  const aktiveTimere = new Set();
  class Timer {
    constructor(valg) {
      this.id = valg.id || "timer";
      this.total = valg.sekunder;
      this.igjenMs = valg.sekunder * 1000;
      this.vedTikk = valg.vedTikk || null;
      this.vedSlutt = valg.vedSlutt || null;
      this.tikk = valg.tikk !== false;
      this.overlev = !!valg.overlev;
      this.visning = valg.visning || "mm:ss"; // "sek" shows only whole seconds
      this.alarm = valg.alarm !== false; // false: no alarm sound/vibration when time is up
      this.kjorer = false;
      this.ferdig = false;
      this.sisteSek = null;
      this.intervall = null;
      aktiveTimere.add(this);
    }
    get igjen() {
      const ms = this.kjorer ? this.slutt - performance.now() : this.igjenMs;
      return Math.max(0, ms / 1000);
    }
    start() {
      if (this.kjorer || this.ferdig) return this;
      this.slutt = performance.now() + this.igjenMs;
      this.kjorer = true;
      clearInterval(this.intervall);
      this.intervall = setInterval(() => this.steg(), 200);
      this.steg();
      return this;
    }
    pause() {
      if (!this.kjorer) return this;
      this.igjenMs = Math.max(0, this.slutt - performance.now());
      this.kjorer = false;
      clearInterval(this.intervall);
      this.tegn();
      return this;
    }
    fortsett() {
      return this.start();
    }
    veksle() {
      return this.kjorer ? this.pause() : this.start();
    }
    leggTil(sek) {
      if (this.ferdig) {
        this.ferdig = false;
        this.igjenMs = sek * 1000;
        this.total = Math.max(this.total, sek);
        return this.start();
      }
      if (this.kjorer) this.slutt += sek * 1000;
      else this.igjenMs += sek * 1000;
      this.total = Math.max(this.total, this.igjen);
      this.tegn();
      return this;
    }
    stopp() {
      if (this.kjorer) this.igjenMs = Math.max(0, this.slutt - performance.now());
      clearInterval(this.intervall);
      this.kjorer = false;
      aktiveTimere.delete(this);
      return this;
    }
    steg() {
      const igjen = this.igjen;
      const sek = Math.ceil(igjen);
      if (sek !== this.sisteSek) {
        this.sisteSek = sek;
        if (this.tikk && sek > 0 && sek <= 5 && this.kjorer) {
          R.lyd.tikk();
          R.vibrer(10);
        }
        if (this.vedTikk) this.vedTikk(sek);
      }
      this.tegn();
      if (igjen <= 0 && this.kjorer) {
        this.kjorer = false;
        this.igjenMs = 0; // show 0:00, not the starting time
        this.ferdig = true;
        clearInterval(this.intervall);
        this.tegn();
        if (this.alarm) {
          R.lyd.alarm();
          R.vibrer([200, 100, 200]);
        }
        if (this.vedSlutt) this.vedSlutt();
      }
    }
    tegn() {
      const el = document.getElementById(this.id);
      if (!el) return;
      const igjen = this.igjen;
      const fyll = el.querySelector(".fyll");
      if (fyll) {
        const omkrets = 2 * Math.PI * 54;
        const andel = this.total > 0 ? igjen / this.total : 0;
        fyll.style.strokeDasharray = String(omkrets);
        fyll.style.strokeDashoffset = String(omkrets * (1 - andel));
      }
      const tid = el.querySelector(".timer-tid");
      if (tid) tid.textContent = this.visning === "sek" ? String(Math.ceil(igjen)) : R.formaterTid(igjen);
      el.classList.toggle("lite", igjen <= 10 && igjen > 0);
      el.classList.toggle("ferdig", this.ferdig);
      el.classList.toggle("pause", !this.kjorer && !this.ferdig);
      const pauseKnapp = el.querySelector("[data-timer-pause]");
      if (pauseKnapp) pauseKnapp.textContent = this.kjorer ? "Pause" : this.ferdig ? "Ferdig" : "Fortsett";
    }
  }
  R.Timer = Timer;
  // The running (or paused) timer with this id, if any.
  R.timer = (id) => Array.from(aktiveTimere).reverse().find((t) => t.id === (id || "timer")) || null;
  function stoppTimere(alle) {
    for (const t of Array.from(aktiveTimere)) if (alle || !t.overlev) t.stopp();
  }
  R.stoppTimere = () => stoppTimere(true);

  // ---------- Join codes (for "each on their own phone" games) ----------
  // Values are packed into bits, written in Crockford base32 and closed with a check symbol that
  // also depends on `salt` (for example a hash of the game's word list), so a code from another
  // version of the content is rejected instead of giving different cards.

  const ALFABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  // sjekk = number of check symbols (default 1; 2 catches almost every typo, at one extra character).
  // FNV alone mixes a change near the end of the text into only a few bits, so the hash is run
  // through a finaliser (murmur3's fmix32) first: every typo or swapped pair then changes each
  // check symbol at random — one symbol misses 1 in 32, two symbols about 1 in 1000.
  const bland = (h) => {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const sjekksymboler = (symboler, salt, sjekk) =>
    Array.from({ length: sjekk || 1 }, (_, k) => bland(R.hash((salt || 0) + (k ? ":" + (k + 1) : "") + ":" + symboler.join(","))) >>> 27);
  R.kode = {
    lag(verdier, bredder, salt, sjekk) {
      const bits = [];
      verdier.forEach((v, i) => {
        const b = bredder[i];
        if (v < 0 || v >= 2 ** b) throw new Error(`Verdi ${v} passer ikke i ${b} bit`);
        for (let j = b - 1; j >= 0; j--) bits.push(Math.floor(v / 2 ** j) % 2);
      });
      while (bits.length % 5) bits.push(0);
      const symboler = [];
      for (let i = 0; i < bits.length; i += 5) symboler.push(bits.slice(i, i + 5).reduce((s, b) => s * 2 + b, 0));
      symboler.push(...sjekksymboler(symboler, salt, sjekk));
      return symboler.map((s) => ALFABET[s]).join("");
    },
    les(tekst, bredder, salt, sjekk) {
      const n = sjekk || 1;
      const kode = R.kode.normaliser(tekst);
      const totalBits = bredder.reduce((s, b) => s + b, 0);
      const lengde = Math.ceil(totalBits / 5) + n;
      if (kode.length !== lengde) return null;
      const symboler = kode.split("").map((c) => ALFABET.indexOf(c));
      const sum = symboler.splice(symboler.length - n, n);
      if (sjekksymboler(symboler, salt, n).join(",") !== sum.join(",")) return null;
      const bits = [];
      symboler.forEach((s) => {
        for (let i = 4; i >= 0; i--) bits.push((s >> i) & 1);
      });
      let p = 0;
      return bredder.map((b) => {
        let v = 0;
        for (let i = 0; i < b; i++) v = v * 2 + (bits[p++] || 0);
        return v;
      });
    },
    lengde: (bredder, sjekk) => Math.ceil(bredder.reduce((s, b) => s + b, 0) / 5) + (sjekk || 1),
    normaliser: (tekst) =>
      String(tekst || "")
        .toUpperCase()
        .replace(/O/g, "0")
        .replace(/[IL]/g, "1")
        .replace(/U/g, "V")
        .replace(/[^0-9A-Z]/g, "")
        .split("")
        .filter((c) => ALFABET.includes(c))
        .join(""),
    formater: (kode) => String(kode).replace(/(.{4})(?=.)/g, "$1 "),
    lenke: (kode) => location.origin + location.pathname + "#" + kode,
    // nivå: error correction "M" (default) or "L" for long links (more data fits).
    qr(tekst, nivå) {
      const Q = window.LuringenQr;
      if (!Q) return "";
      try {
        return Q.qrSvg(Q.lagQr(tekst, nivå || "M"), { mork: "var(--blekk)", lys: "var(--papir)", etikett: "QR-kode som åpner spillet med koden" });
      } catch (e) {
        return "";
      }
    },
  };

  // ---------- Deck without repeats ----------
  // const stokk = R.kortstokk("sporsmal", liste.length); const i = stokk.neste(i => filter);
  // Remembers which cards were shown (on this device) so the same card doesn't come back until
  // the whole deck (within the filter) has been used.

  R.kortstokk = (navn, antall) => {
    const nokkel = (APP ? APP.id : meta().id || "spill") + ".brukt." + navn;
    let brukt = new Set((R.les(nokkel, []) || []).filter((i) => Number.isInteger(i) && i >= 0 && i < antall));
    let forrige = -1;
    const lagre = () => R.skriv(nokkel, Array.from(brukt));
    return {
      neste(filter) {
        const ok = filter || (() => true);
        let kandidater = [];
        for (let i = 0; i < antall; i++) if (!brukt.has(i) && ok(i)) kandidater.push(i);
        if (!kandidater.length) {
          for (const i of Array.from(brukt)) if (ok(i)) brukt.delete(i);
          for (let i = 0; i < antall; i++) if (!brukt.has(i) && ok(i) && i !== forrige) kandidater.push(i);
          if (!kandidater.length && forrige >= 0 && ok(forrige)) kandidater.push(forrige);
        }
        if (!kandidater.length) return -1;
        const i = R.velg(kandidater);
        brukt.add(i);
        forrige = i;
        lagre();
        return i;
      },
      igjen(filter) {
        const ok = filter || (() => true);
        let n = 0;
        for (let i = 0; i < antall; i++) if (!brukt.has(i) && ok(i)) n++;
        return n;
      },
      nullstill() {
        brukt = new Set();
        lagre();
      },
    };
  };

  // ---------- Graphics ----------

  R.figur = (id, klasse, valg) => `<span class="figur-ramme ${klasse || ""}">${G.svg(id || (APP && APP.id) || meta().id, valg)}</span>`;
  R.logo = (valg) => G.logo(valg);
  const FINGER =
    '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M13 40c-2-4-3-9-3-14 0-8 6-14 14-14s14 6 14 14c0 3-1 5-2 7"/><path d="M18.5 42c-2-5-3-10-3-16 0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5c0 6-2 11-4.5 15"/><path d="M24 26c0 6-1.2 11.5-4 17"/><path d="M29 28.5c0 5-1 9-3 13"/><path d="M9.5 17.5C12.5 11 17.8 7.5 24 7.5c5 0 9.4 2 12.4 5.4"/><path d="M38.6 17c1 2.5 1.6 5.4 1.6 9"/></svg>';

  // ---------- HTML building blocks ----------
  // Text parameters are escaped. Parameters whose name ends in "Html" are inserted as-is.

  const attr = (navn, v) => (v == null || v === false ? "" : ` ${navn}="${esc(v)}"`);
  const ui = (R.ui = {});

  // Button. variant: "" (accent), "rosa", "mynte", "lampe", "lilla", "himmel", "rod", "papir"; plus "liten"/"stor".
  // o: { v, id, av (disabled), ikon, etikett (aria-label), stille (no click sound), tekstHtml }
  ui.knapp = (tekst, h, o = {}) =>
    `<button class="knapp ${o.variant || ""}"${attr("data-h", h)}${attr("data-v", o.v)}${attr("id", o.id)}${o.av ? " disabled" : ""}${o.stille ? " data-stille" : ""}${attr("aria-label", o.etikett)}>${o.ikon ? `<span class="ikon" aria-hidden="true">${o.ikon}</span>` : ""}${o.tekstHtml || esc(tekst)}</button>`;
  ui.knapp2 = (tekst, h, o = {}) =>
    `<button class="knapp-2 ${o.variant || ""}"${attr("data-h", h)}${attr("data-v", o.v)}${attr("id", o.id)}${o.av ? " disabled" : ""}${o.stille ? " data-stille" : ""}${attr("aria-label", o.etikett)}>${o.ikon ? `<span class="ikon" aria-hidden="true">${o.ikon}</span>` : ""}${o.tekstHtml || esc(tekst)}</button>`;
  ui.lenke = (tekst, h, o = {}) => `<button class="lenke"${attr("data-h", h)}${attr("data-v", o.v)}${attr("id", o.id)}>${esc(tekst)}</button>`;
  ui.dokk = (...deler) => `<div class="dokk">${deler.filter(Boolean).join("")}</div>`;
  ui.lenkerad = (...deler) => `<div class="lenkerad">${deler.filter(Boolean).join("")}</div>`;

  // A challenge link (…/#utfordring, see «Slå meg» in KIT.md) shows this once, above the main button.
  const UTFORDRING_HTML = `<p class="utfordring"><span aria-hidden="true">⚔️</span> Noen utfordret deg på dagens oppgave – klarer du det bedre?</p>`;
  R.utfordret = false;

  // Standard game home: mascot, name, genre label, slogan, buttons and facts.
  ui.spillhjem = (o = {}) => {
    const navn = o.navn || (APP && APP.navn) || meta().navn;
    const under = o.undertittel || (APP && APP.undertittel) || meta().undertittel;
    const merker = o.merker || [];
    return `
      <div class="spillhjem">
        ${R.figur(o.figur)}
        <h1 id="skjerm-tittel">${esc(navn)}</h1>
        ${under ? `<span class="undertittel">${esc(under)}</span>` : ""}
        ${o.slagordHtml ? `<p class="slagord">${o.slagordHtml}</p>` : ""}
      </div>
      <div class="hjem-knapper">${R.utfordret ? UTFORDRING_HTML : ""}${o.knapperHtml || ""}</div>
      ${merker.length ? `<ul class="merker" aria-label="Om spillet">${merker.map(([b, t]) => `<li><b>${esc(b)}</b> ${esc(t)}</li>`).join("")}</ul>` : ""}`;
  };

  // Home-screen buttons. While a game is running, "Fortsett" is the main action and starting
  // over is secondary (pair it with R.bekreftNytt in the handler).
  // o: { pagar (bool), fortsettTekst, startTekst, nyH ("nytt"), fortsettH ("fortsett"), ekstraHtml }
  ui.startKnapper = (o = {}) =>
    (o.pagar
      ? ui.knapp(o.fortsettTekst || "Fortsett spillet", o.fortsettH || "fortsett") + ui.knapp2(o.nyTekst || "Nytt spill", o.nyH || "nytt")
      : ui.knapp(o.startTekst || "Start spill", o.nyH || "nytt")) + (o.ekstraHtml || "");

  // Segmented choice: valg = [[verdi, tekst], ...]
  ui.seg = (h, valg, aktiv, o = {}) =>
    `<div class="seg" role="group"${attr("aria-label", o.etikett)}>${valg
      .map(([v, t]) => `<button data-h="${esc(h)}" data-v="${esc(v)}" aria-pressed="${String(v) === String(aktiv)}"${o.av && o.av(v) ? " disabled" : ""}>${esc(t)}</button>`)
      .join("")}</div>`;

  // Number stepper: buttons send data-v "-1" / "1".
  ui.teller = (h, verdi, min, max, o = {}) =>
    `<div class="teller"${attr("id", o.id)}>
      <button data-h="${esc(h)}" data-v="-1" aria-label="${esc(o.minus || "Færre")}"${verdi <= min ? " disabled" : ""}>−</button>
      <output aria-live="polite">${esc(o.vis ? o.vis(verdi) : verdi)}${o.enhet ? ` <small>${esc(o.enhet)}</small>` : ""}</output>
      <button data-h="${esc(h)}" data-v="1" aria-label="${esc(o.pluss || "Flere")}"${verdi >= max ? " disabled" : ""}>+</button>
    </div>`;

  // Tiles: valg = [{ v, tittel, tekst, ikon }]
  // With an array as aktiv the tiles are a multi-select: each gets a check mark.
  ui.fliser = (h, valg, aktiv, o = {}) =>
    `<div class="fliser ${o.en ? "en" : ""} ${Array.isArray(aktiv) ? "flervalg" : ""}">${valg
      .map(
        (f) => `<button class="flis" data-h="${esc(h)}" data-v="${esc(f.v)}" aria-pressed="${String(f.v) === String(aktiv) || (Array.isArray(aktiv) && aktiv.includes(f.v))}"${f.farge ? ` style="--nf: ${esc(f.farge)}"` : ""}${f.av ? " disabled" : ""}>
          ${f.ikon ? `<span class="flis-ikon" aria-hidden="true">${f.ikon}</span>` : ""}<b>${esc(f.tittel)}</b>${f.tekst ? `<span>${esc(f.tekst)}</span>` : ""}
        </button>`,
      )
      .join("")}</div>`;

  // Multi-select chips: valg = [{ v, tekst, ikon, antall }]; valgt = array of v
  ui.brikker = (h, valg, valgt, o = {}) =>
    `<div class="brikker" role="group"${attr("aria-label", o.etikett)}>${
      o.alle ? `<button class="brikke alle" data-h="${esc(h)}" data-v="*" aria-pressed="${valgt.length === valg.length}">Alle</button>` : ""
    }${valg
      .map(
        (b) =>
          `<button class="brikke" data-h="${esc(h)}" data-v="${esc(b.v)}" aria-pressed="${valgt.includes(b.v)}">${b.ikon ? `<span aria-hidden="true">${b.ikon}</span>` : ""}${esc(b.tekst)}${
            b.antall != null ? ` <span class="antall">${esc(b.antall)}</span>` : ""
          }</button>`,
      )
      .join("")}</div>`;

  // On/off switch
  ui.bryter = (h, pa, tittel, tekst) =>
    `<button class="bryter" data-h="${esc(h)}" aria-pressed="${!!pa}"><span><b>${esc(tittel)}</b>${tekst ? `<small>${esc(tekst)}</small>` : ""}</span><i aria-hidden="true"></i></button>`;

  // Player list with names (shared between games). Uses S.antall as the count.
  ui.spillere = (o = {}) => {
    const S = R.S;
    const min = o.min || 2;
    const max = Math.min(o.max || 10, R.MAKS_SPILLERE);
    const antall = R.klamp(S.antall || min, min, max);
    const rader = [];
    for (let i = 0; i < antall; i++) {
      rader.push(`<div class="spiller" style="--pf: var(--p${i + 1})">
        ${R.avatar(i)}
        <input id="navn-${i}" data-navn="${i}" value="${esc(R.felles.navn[i] || "")}" placeholder="Spiller ${i + 1}" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="next" aria-label="Navn på spiller ${i + 1}">
        ${antall > min ? `<button class="fjern" data-h="spiller-fjern" data-v="${i}" aria-label="Fjern ${esc(R.navn(i))}">×</button>` : ""}
      </div>`);
    }
    return `<section class="seksjon" id="spillerboks" data-min="${min}" data-max="${max}">
      <div class="seksjon-hode"><h2>${esc(o.tittel || "Hvem spiller?")}</h2><span class="tall">${antall} ${antall === 1 ? "spiller" : "spillere"}</span></div>
      <div class="spillere">${rader.join("")}</div>
      ${min === max ? "" : `<button class="legg-til" data-h="spiller-legg-til"${antall >= max ? " disabled" : ""}>+ Legg til spiller${antall >= max ? ` (maks ${max})` : ""}</button>`}
      ${o.hjelp ? `<p class="hjelp">${esc(o.hjelp)}</p>` : ""}
    </section>`;
  };

  // Pick a player: buttons with avatar and name. valgt = index or array; av = fn(i) → disabled.
  ui.velgere = (h, indekser, valgt, o = {}) =>
    `<div class="velgere">${indekser
      .map(
        (i) =>
          `<button class="velger" data-h="${esc(h)}" data-v="${i}" aria-pressed="${Array.isArray(valgt) ? valgt.includes(i) : valgt === i}"${o.av && o.av(i) ? " disabled" : ""}>${R.avatar(i)}<span>${esc(R.navn(i))}</span></button>`,
      )
      .join("")}</div>`;

  ui.lagmerke = (i, tekst) => `<span class="lagmerke" style="--lf: ${R.LAG[i % R.LAG.length].farge}"><i aria-hidden="true"></i>${esc(tekst || "Lag " + R.LAG[i % R.LAG.length].navn)}</span>`;

  // "Give the phone to …" screen.
  // o: { i, h (button action), v, tekst, knapp, advarsel, ikon (default 🙈, "" for none),
  //      merkeHtml (badge on the avatar), prikker: [antall, na] }
  ui.giTil = (o) => `
    ${o.prikker ? ui.fremdrift(o.prikker[0], o.prikker[1]) : ""}
    <div class="gi-til">
      <span class="gi-til-avatar">${R.avatar(o.i, "gigant")}${o.merkeHtml ? `<span class="gi-til-merke">${o.merkeHtml}</span>` : ""}</span>
      <p class="etikett">${esc(o.tekst || "Gi mobilen til")}</p>
      <h1 id="skjerm-tittel">${esc(R.navn(o.i))}</h1>
      ${o.advarsel === "" ? "" : `<p class="ikke-se">${o.ikon === "" ? "" : esc(o.ikon || "🙈") + " "}${esc(o.advarsel || "De andre ser bort")}</p>`}
    </div>
    ${ui.dokk(ui.knapp(o.knapp || `Jeg er ${R.navn(o.i)}`, o.h, { v: o.v != null ? o.v : o.i }))}`;

  // Progress dots: antall players, na = current index (−1 for none), ferdige = set/array of done indexes
  ui.fremdrift = (antall, na, ferdige) => {
    const f = new Set(ferdige || Array.from({ length: Math.max(0, na) }, (_, i) => i));
    return `<div class="fremdrift" aria-hidden="true">${Array.from(
      { length: antall },
      (_, i) => `<span class="prikk ${i === na ? "na" : f.has(i) ? "ferdig" : ""}" style="--pf: var(--p${(i % 20) + 1})"></span>`,
    ).join("")}</div>`;
  };

  // Hold-to-reveal card. The back is filled by def.hemmelig.innhold(S, id) while it shows.
  // A finger holds it; a keyboard, a screen reader or a switch shows it with one press and hides
  // it with the next (see «Hold-to-reveal» below). The back is never part of the button for a
  // screen reader: what is on it is read out through #si, only while it shows.
  ui.mappe = (o = {}) => {
    const etikett = o.etikett || "Hemmelig";
    const tekst = o.tekst || "Hold inne for å se";
    // The name a screen reader says. The words printed on the card are part of it (so «trykk
    // Topphemmelig» works with voice control): they are put in front when the game's own name
    // for the card (etikettAria) leaves them out.
    let navn = o.etikettAria || (o.etikett || o.tekst ? tekst : "Hold inne for å se det hemmelige kortet");
    for (const del of [tekst, etikett]) if (!R.normaliser(navn).includes(R.normaliser(del))) navn = del + (/[.!?]$/.test(del) ? " " : ". ") + navn;
    return `
    <button class="mappe" data-mappe="${esc(o.id != null ? o.id : "kort")}" aria-expanded="false" aria-describedby="mappe-hint" aria-label="${esc(navn)}">
      <span class="mappe-indre">
        <span class="mappe-forside">
          <span class="mappe-etikett">${esc(etikett)}</span>
          ${R.figur(o.figur)}
          <span class="mappe-finger">${FINGER}<span>${esc(tekst)}</span></span>
        </span>
        <span class="mappe-bakside" aria-hidden="true"></span>
      </span>
    </button>`;
  };

  // Big card for question decks. o: { tekst | tekstHtml, etikett, nr, fot, klasse, sveip, kompakt }
  ui.storkort = (o = {}) => {
    const tekst = o.tekstHtml || esc(o.tekst || "");
    // Size by the visible statement only: markup and a small .prefiks lead-in don't count.
    const synlig = o.tekst != null ? o.tekst : String(o.tekstHtml || "").replace(/<span class="prefiks">[\s\S]*?<\/span>/g, "").replace(/<[^>]*>/g, "");
    const lang = (o.lengde != null ? o.lengde : synlig.length) > 90 ? "lang" : "";
    return `<div class="bunke${o.kompakt ? " kompakt" : ""}"><article class="storkort ${o.klasse || ""}"${attr("data-sveip", o.sveip)}${attr("id", o.id)}>
      ${o.etikett || o.nr ? `<div class="storkort-topp">${o.etikett ? `<span class="storkort-etikett">${esc(o.etikett)}</span>` : "<span></span>"}${o.nr ? `<span class="storkort-nr">${esc(o.nr)}</span>` : ""}</div>` : ""}
      <p class="storkort-tekst ${lang}" aria-live="polite">${tekst}</p>
      ${o.fotHtml || o.fot ? `<p class="storkort-fot">${o.fotHtml || esc(o.fot)}</p>` : ""}
    </article></div>`;
  };

  // Countdown ring. Use with new R.Timer({ id }).
  ui.timer = (o = {}) => `
    <div class="timer ${o.stor ? "stor alene" : ""} ${o.alene ? "alene" : ""}" id="${esc(o.id || "timer")}" role="timer" aria-live="off">
      <div class="timer-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="spor" cx="60" cy="60" r="54"/><circle class="fyll" cx="60" cy="60" r="54"/></svg>
        <span class="timer-tid">${o.visning === "sek" ? Math.ceil(o.sekunder || 0) : R.formaterTid(o.sekunder || 0)}</span>
      </div>
      ${o.kontrollHtml ? `<div class="timer-kontroll">${o.kontrollHtml}</div>` : ""}
    </div>`;

  // Scoreboard. rader: [{ navn, i (avatar index) | lag (team index), poeng, pluss }]
  ui.poengliste = (rader, o = {}) => {
    const sortert = rader.slice().sort((a, b) => b.poeng - a.poeng);
    const topp = sortert.length ? sortert[0].poeng : 0;
    return `<ol class="poengliste">${sortert
      .map((r, n) => {
        const merke = r.lag != null ? `<span class="avatar" style="--pf: ${R.LAG[r.lag % R.LAG.length].farge}" aria-hidden="true"></span>` : R.avatar(r.i || 0);
        const navn = r.navn != null ? r.navn : r.lag != null ? "Lag " + R.LAG[r.lag % R.LAG.length].navn : R.navn(r.i);
        return `<li class="${r.poeng === topp && topp > 0 && !o.utenLeder ? "leder" : ""}"><span class="plass-nr">${n + 1}</span>${merke}<span class="navn">${esc(navn)}</span>${
          r.pluss ? `<span class="pluss">+${esc(r.pluss)}</span>` : ""
        }<span class="sum">${esc(r.poeng)}</span></li>`;
      })
      .join("")}</ol>`;
  };

  // Podium for the top three. rader as in poengliste. Equal points share a place (1, 1, 3).
  ui.pall = (rader, o = {}) => {
    const alle = rader.filter((r) => r.poeng > 0).sort((a, b) => b.poeng - a.poeng);
    if (alle.length < 2) return "";
    const s = alle.slice(0, 3);
    const rang = (r) => 1 + alle.filter((x) => x.poeng > r.poeng).length;
    const plass = (r) => {
      if (!r) return "<div></div>";
      const n = rang(r);
      const navn = r.navn != null ? r.navn : r.lag != null ? "Lag " + R.LAG[r.lag % R.LAG.length].navn : R.navn(r.i);
      const merke = r.lag != null ? `<span class="avatar stor" style="--pf: ${R.LAG[r.lag % R.LAG.length].farge}" aria-hidden="true"></span>` : R.avatar(r.i || 0, "stor");
      return `<div class="pall-plass p${Math.min(n, 3)}">${merke}<span class="navn">${esc(navn)}</span><span class="poeng">${esc(r.poeng)} ${esc(o.enhet || "p")}</span><span class="blokk">${n}</span></div>`;
    };
    // Two places: only those two, centred (no empty third column).
    if (s.length < 3) return `<div class="pall to" aria-label="Pallen">${plass(s[1])}${plass(s[0])}</div>`;
    return `<div class="pall" aria-label="Pallen">${plass(s[1])}${plass(s[0])}${plass(s[2])}</div>`;
  };

  // A mascot with a mood, for result screens: R.ui.figur(id?, { stemning: "jubel" | "lei" }).
  // "jubel" hops and sparkles (a win, a great result); "lei" droops, tilts and loses colour (a loss).
  // The same classes work on any .figur-ramme: R.figur(null, "jubel"). o: { stemning, klasse, tittel }
  const STEMNINGER = { jubel: "jubel", lei: "lei" };
  ui.figur = (id, o = {}) =>
    R.figur(id, [o.klasse, STEMNINGER[o.stemning]].filter(Boolean).join(" "), o.tittel ? { tittel: o.tittel } : undefined);

  // Result banner (the top of «Kåringen»): mascot, small label, headline and one line of text.
  // The mascot celebrates unless told otherwise: stemning "lei" for a loss, "" for neither.
  // o: { tittel | tittelHtml, etikett, tekst | tekstHtml, klasse ("aksent" | "rosa" | "mynte"),
  //      stemning, figur (mascot id), utenFigur }
  ui.banner = (o = {}) => `<div class="banner ${esc(o.klasse || "")}">
      ${o.utenFigur ? "" : ui.figur(o.figur, { stemning: o.stemning == null ? "jubel" : o.stemning })}
      ${o.etikett ? `<p class="etikett">${esc(o.etikett)}</p>` : ""}
      <h1 id="skjerm-tittel">${o.tittelHtml || esc(o.tittel || "")}</h1>
      ${o.tekstHtml || o.tekst ? `<p class="ingress">${o.tekstHtml || esc(o.tekst)}</p>` : ""}
    </div>`;

  // Suggest other rusj games that fit the group (window.RUSJ_ANDRE is written by the build).
  // o: { antall, tittel, maks }. With antall 1 the heading becomes «Flere spill du kan spille alene».
  ui.flereSpill = (o = {}) => {
    const andre = (window.RUSJ_ANDRE || []).filter((g) => !o.antall || (o.antall >= g.spillere[0] && o.antall <= g.spillere[1]));
    if (!andre.length) return "";
    const dag = new Date();
    const fro = R.hash(((APP && APP.id) || "") + dag.getFullYear() + "-" + dag.getMonth() + "-" + dag.getDate());
    const maks = o.maks || 3;
    const r = R.rng(fro);
    // After a drinking game: at most two other drinking games, the rest ordinary games (a pause).
    const utvalg = meta().alder18
      ? (() => {
          const drikke = R.stokk(andre.filter((g) => g.alder18), r).slice(0, Math.min(2, maks - 1));
          return [...drikke, ...R.stokk(andre.filter((g) => !g.alder18), r).slice(0, maks - drikke.length)];
        })()
      : R.stokk(andre, r).slice(0, maks);
    return `<section class="seksjon flere-spill" aria-labelledby="flere-tittel">
      <h2 id="flere-tittel">${esc(o.tittel || (o.antall === 1 ? "Flere spill du kan spille alene" : "Spill noe annet med samme gjeng"))}</h2>
      <div class="flere-liste">${utvalg
        .map(
          (g) => `<a class="flere-kort" href="/${esc(g.id)}/" style="--kf: ${esc(g.farge)}">
            <span class="flere-figur">${G.svg(g.id)}</span>
            <span class="flere-tekst"><b>${esc(g.navn)}</b><small>${esc(g.undertittel)}</small></span>
          </a>`,
        )
        .join("")}</div>
      <a class="lenke" href="/">Se alle spillene på rusj.no</a>
    </section>`;
  };

  ui.merker = (merker) => `<ul class="merker">${merker.map(([b, t]) => `<li><b>${esc(b)}</b> ${esc(t)}</li>`).join("")}</ul>`;

  // ---------- The app ----------

  let APP = null;
  let S = null;
  let NOKKEL = "";
  let ryddere = [];

  // Counts screen changes. R.vakt() gives a check that is false once the screen has changed —
  // use it after every await in an action so a late timer can't drag the player back:
  //   const fortsatt = R.vakt(); await R.vent(800); if (!fortsatt()) return;
  let skjermNr = 0;
  let sisteSkjermbytte = -1e9;
  let sisteOmtegning = -1e9;
  let sisteKlikk = null;
  let sisteKlikkPos = null;
  R.vakt = () => {
    const nr = skjermNr;
    return () => nr === skjermNr;
  };

  R.vedForlat = (fn) => {
    ryddere.push(fn);
  };
  function rydd() {
    stoppTimere(false);
    const fns = ryddere;
    ryddere = [];
    fns.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  }

  let startesPaNytt = false; // «Start spillet på nytt» was pressed: nothing is saved on the way out
  R.lagre = () => {
    if (!APP || startesPaNytt) return;
    S._tid = Date.now();
    // For the front page's «Fortsett» badge: is a game in progress? (APP.pagar decides if given.)
    try {
      S._aktiv = APP.pagar ? !!APP.pagar(S) : S.skjerm !== (APP.hjem || "hjem");
    } catch (e) {
      S._aktiv = false;
    }
    const data = APP.lagre ? APP.lagre(S) : S;
    R.skriv(NOKKEL, data);
  };

  function skjermDef(navn) {
    const sk = APP.skjermer[navn];
    if (!sk) throw new Error("Ukjent skjerm: " + navn);
    return sk;
  }

  function oppdaterTopp() {
    const sk = skjermDef(S.skjerm);
    const hjem = S.skjerm === (APP.hjem || "hjem");
    $("#tilportal").hidden = !hjem;
    $("#tilbake").hidden = hjem;
    const tittel = typeof sk.tittel === "function" ? sk.tittel(S) : sk.tittel;
    $("#topp-tittel").textContent = tittel == null ? (hjem ? "" : APP.navn) : tittel;
    $("#reglerknapp").hidden = !APP.regler || S.skjerm === "regler" || S.skjerm === "alder"; // no content before the 18+ answer
    const lyd = $("#lydknapp");
    lyd.setAttribute("aria-pressed", R.felles.lyd ? "true" : "false");
    lyd.setAttribute("aria-label", R.felles.lyd ? "Skru av lyd" : "Skru på lyd");
  }

  // ---------- Landscape phones ----------
  // On a phone on its side (see LIGGENDE) the kit lays every screen out for the low height and says
  // how on <html data-liggende="…">; rusj.css does the rest:
  //   "side"  the screen has a dock of the kit's own buttons and links → content in a left column,
  //           the dock as a column on the right
  //   "bunn"  the dock has the game's own things in it (a toolbar, a keyboard), or there are
  //           several docks → one column as in portrait, the dock stays at the bottom, slimmer
  //   "hjem"  the game's home screen → mascot on the left, name and buttons on the right
  //   "uten"  a screen without a dock → one centred column as in portrait
  //   (none)  portrait — or a screen the game lays out itself; then only the top bar is slimmer
  // The kit steps aside when the game's own CSS has taken the dock out of the kit's hands
  // (position other than the kit's sticky, e.g. `position: static` in the game's landscape rules),
  // or when the game sets the width of .app itself on a one-column screen.
  // A game can also decide, on a screen (skjermer.x.liggende) or for the whole game
  // (R.start({ liggende })): "side" | "bunn" forces one of the two, false = hands off, and
  // true = the side column also for a dock with the game's own things in it (up to 8 buttons).
  const LIGGENDE = "(orientation: landscape) and (max-height: 500px)";
  const erLiggende = () => !!(window.matchMedia && window.matchMedia(LIGGENDE).matches);
  function merkLiggende() {
    const rot = document.documentElement;
    const el = document.getElementById && document.getElementById("skjerm");
    if (!el || !rot || !rot.setAttribute) return;
    let modus = "";
    if (erLiggende()) {
      const sk = APP && S && S.skjerm && APP.skjermer[S.skjerm];
      const onske = sk && sk.liggende !== undefined ? sk.liggende : APP ? APP.liggende : undefined;
      const dokker = Array.from(el.querySelectorAll(".dokk")).filter((d) => d.getClientRects().length);
      if (onske === false) modus = "";
      else if (dokker.length) {
        // Measured without the kit's own landscape layout: only the game's CSS can have moved the dock.
        rot.removeAttribute("data-liggende");
        if (dokker.some((d) => getComputedStyle(d).position !== "sticky")) modus = "";
        else if (onske === "side" || onske === "bunn") modus = onske;
        else {
          // To the side by itself: one dock made only of the kit's own buttons, links and rows
          // (and lines of text). A dock with the game's own things in it (a toolbar, a keyboard)
          // is the game's design and stays at the bottom, unless the game says `liggende: true` —
          // and a keyboard (more than 8 buttons) never fits a narrow column.
          const d = dokker[0];
          const kitsEgen = Array.from(d.children).every((b) => b.tagName === "P" || b.matches(".knapp, .knapp-2, .lenke, .lenkerad, .knapprad"));
          const fa = d.querySelectorAll("button, a[href], input, select, textarea").length <= 8;
          modus = dokker.length === 1 && fa && (kitsEgen || onske === true) ? "side" : "bunn";
        }
      } else modus = Array.from(el.children).some((b) => b.classList.contains("spillhjem")) ? "hjem" : "uten";
      if (modus === "uten" || modus === "bunn") {
        // One column: the kit keeps the portrait column inside a wider app. If the game's CSS sets
        // the app's width on this screen (a wide board), that must stay as the game made it.
        rot.setAttribute("data-liggende", modus);
        const app = el.closest(".app");
        const kit = getComputedStyle(rot).getPropertyValue("--app-liggende").trim();
        if (app && kit && getComputedStyle(app).maxWidth !== kit) modus = "";
      }
    }
    if (modus) rot.setAttribute("data-liggende", modus);
    else rot.removeAttribute("data-liggende");
  }
  // "side" | "bunn" | "hjem" | "uten" — how the kit has laid out the current screen on a landscape
  // phone; "" in portrait and on screens the game lays out itself.
  R.liggende = () => (document.documentElement && document.documentElement.getAttribute && document.documentElement.getAttribute("data-liggende")) || "";
  // Registered before any game's own resize handler, so games that measure the screen there see
  // the right layout after the phone is turned.
  window.addEventListener("resize", () => {
    merkLiggende();
    maalDokk();
    flyttToast();
  });
  merkLiggende(); // the page's first paint (the home screen in the HTML), before the game starts
  // The screen's entrance animation is done: drop the class, so turning the phone (which changes
  // the animation's name, see rusj.css) can never play it again in the middle of a game.
  document.addEventListener("animationend", (e) => {
    if (e.target && e.target.id === "skjerm") e.target.classList.remove("inn");
  });

  // ---------- The dock never hides what has focus ----------
  // The action area sticks to the bottom of the screen, on top of the page. The browser is told
  // how much it covers (scroll-padding-bottom on <html>, see rusj.css), so a control that takes
  // focus — Tab, a screen reader, a switch — is scrolled clear of it. Nothing is added when the
  // dock is a column beside the content (landscape phones) or does not float at all.
  let dokkVakt = null;
  function maalDokk() {
    const rot = document.documentElement;
    const el = document.getElementById && document.getElementById("skjerm");
    if (!el || !rot || !rot.style) return;
    let h = 0;
    if (R.liggende() !== "side") {
      for (const d of el.querySelectorAll(".dokk")) {
        const pos = getComputedStyle(d).position;
        if (pos !== "sticky" && pos !== "fixed") continue;
        const r = d.getBoundingClientRect();
        if (r.width >= window.innerWidth * 0.6) h = Math.max(h, Math.round(r.height));
      }
    }
    rot.style.setProperty("--dokk-h", h + "px");
  }
  // The dock of the screen that was just drawn: measured now, and again whenever it changes size.
  let sisteDokk = null;
  function folgDokk(el) {
    sisteDokk = el.querySelector(".dokk");
    maalDokk();
    if (typeof ResizeObserver === "undefined") return;
    if (!dokkVakt) dokkVakt = new ResizeObserver(maalDokk);
    dokkVakt.disconnect();
    for (const d of el.querySelectorAll(".dokk")) dokkVakt.observe(d);
  }
  // (A game that swaps the dock itself, outside a redraw: follow the new one.)
  function finnDokk() {
    const el = $("#skjerm");
    if (el && el.querySelector(".dokk") !== sisteDokk) folgDokk(el);
  }

  function tegn(valg) {
    const sk = skjermDef(S.skjerm);
    const el = $("#skjerm");
    el.innerHTML = sk.vis(S);
    el.className = "skjerm skjerm-" + S.skjerm;
    // Which screen is showing, on <html>: the «Slik spiller dere …» text under the page (written by
    // the build, outside #skjerm) is shown on the home screen and the age gate only, so a game in
    // progress never scrolls into it (rusj.css, «.om-spillet»).
    document.documentElement.setAttribute("data-skjerm", S.skjerm === (APP.hjem || "hjem") ? "hjem" : S.skjerm);
    statusOverta(); // the status lines of the screen are the kit's to read out
    merkLiggende(); // before sk.etter: games measure the screen there
    if (valg.animer) {
      void el.offsetWidth;
      el.classList.add("inn");
    }
    oppdaterTopp();
    if (sk.etter) {
      sk.etter(S, el);
      merkIgjen();
    }
    mappeEtterTegn(el);
    folgDokk(el);
    flyttToast();
  }
  // A game hook (etter, inn) may have switched the game's own layout on or off (a class on <html>).
  // Look again; if that changed the kit's landscape layout, let the game measure once more —
  // games that size boards in JS listen to resize for that. (Better: say `liggende: false` on
  // such a screen, then the layout is right before the hook runs.)
  function merkIgjen() {
    if (!erLiggende()) return;
    const forrige = R.liggende();
    merkLiggende();
    if (R.liggende() !== forrige) {
      try {
        window.dispatchEvent(new Event("resize"));
      } catch (e) {
        /* old browsers: the layout is right, only a JS-sized board may be a little off */
      }
    }
  }

  R.gaTil = (navn) => {
    if (S.skjerm && APP.skjermer[S.skjerm] && APP.skjermer[S.skjerm].ut) APP.skjermer[S.skjerm].ut(S);
    skjermNr++;
    rydd();
    lukkMappe(true);
    R.lukkArk();
    R.skjulToast();
    R.stoppKonfetti();
    const ned = $("#nedtelling");
    if (ned && !ned.hidden) {
      ned.hidden = true;
      ned.innerHTML = "";
    }
    nedteller = false;
    settInert();
    const si = $("#si");
    if (si) si.textContent = ""; // a screen-reader message (maybe a secret) must not outlive its screen
    statusLinje.clear();
    skjermDef(navn);
    if (navn !== (APP.hjem || "hjem")) R.utfordret = false; // the challenge banner shows once
    S.skjerm = navn;
    sisteSkjermbytte = performance.now(); // see the ghost-tap guard in the click handler
    // Back on the game's home screen: drop our extra history entry, so the phone's back button
    // leaves the game with one press.
    if (navn === (APP.hjem || "hjem") && harHistorikk && !R.iRamme) {
      harHistorikk = false;
      ignorerPop = true;
      try {
        history.back();
      } catch (e) {
        ignorerPop = false;
      }
    }
    tegn({ animer: true });
    window.scrollTo(0, 0);
    // A new screen is read from its heading (or from its top, on a screen without one).
    const h = $("#skjerm h1, #skjerm h2") || $("#skjerm");
    if (h) {
      h.setAttribute("tabindex", "-1");
      try {
        h.focus({ preventScroll: true });
      } catch (e) {
        h.focus();
      }
    }
    const sk = skjermDef(navn);
    if (sk.inn) {
      sk.inn(S);
      merkIgjen();
      maalDokk();
    }
    statusSjekk(true); // what the new screen says from the start is not news
    sikreHistorikk();
    R.lagre();
    // Keep the screen on while a game is in progress; let it sleep on the home screen.
    try {
      if (navn === (APP.hjem || "hjem")) R.slippVaken();
      else if (APP.pagar && APP.pagar(S)) R.holdVaken();
    } catch (e) {
      /* ignore */
    }
  };

  // Re-draw the current screen in place (after a state change), keeping scroll and focus.
  R.vis = () => {
    sisteOmtegning = performance.now();
    // The control that has focus is made anew by the redraw: remember what it is, and where the
    // text cursor is in a field.
    const aktiv = document.activeElement;
    const f = aktiv && aktiv !== document.body ? beskrivFokus(aktiv) : null;
    let merket = null;
    if (f && f.rot === "skjerm" && typeof aktiv.selectionStart === "number") {
      try {
        merket = [aktiv.selectionStart, aktiv.selectionEnd];
      } catch (e) {
        /* a field without a text cursor */
      }
    }
    const y = window.scrollY;
    tegn({ animer: false });
    window.scrollTo(0, y);
    if (f && f.rot === "skjerm") {
      const ny = finnIgjen(f);
      fokuser(ny || fokusReserve(f));
      if (ny && merket && ny !== aktiv) {
        try {
          ny.setSelectionRange(merket[0], merket[1]);
        } catch (e) {
          /* ignore */
        }
      }
    }
    R.lagre();
  };

  async function tilbake() {
    if (R.arkApent()) {
      R.lukkArk();
      return;
    }
    const sk = skjermDef(S.skjerm);
    let mal = sk.tilbake;
    if (typeof mal === "function") mal = await mal(S);
    if (mal === undefined) mal = APP.hjem || "hjem";
    if (mal === null) return;
    if (mal === "portal") {
      if (S.skjerm === "alder") location.replace("/"); // never back into the 18+ gate
      else location.href = "/";
      return;
    }
    R.gaTil(mal);
  }
  R.tilbake = tilbake;

  // Android back button: one history entry while away from the game's home screen.
  let harHistorikk = false;
  let ignorerPop = false;
  function sikreHistorikk() {
    if (!APP) return;
    // The 18+ gate counts as home: an extra entry there made the back button bounce between the
    // front page and the gate forever.
    const hjem = S.skjerm === (APP.hjem || "hjem") || S.skjerm === "alder";
    if (!hjem && !harHistorikk && !R.iRamme) {
      try {
        history.pushState({ rusj: 1 }, "");
        harHistorikk = true;
      } catch (e) {
        /* ignore */
      }
    }
  }
  window.addEventListener("popstate", () => {
    if (ignorerPop) {
      ignorerPop = false;
      return;
    }
    if (location.hash) return; // a join link (#code) changed the address: hashchange handles it
    if (!harHistorikk) return;
    harHistorikk = false;
    if (S && S.skjerm !== (APP.hjem || "hjem")) {
      const p = tilbake();
      // Re-arm at once: if tilbake waits for a confirm sheet, the next back press must close the
      // sheet, not leave the game.
      sikreHistorikk();
      Promise.resolve(p).then(sikreHistorikk);
    }
  });

  R.visRegler = () => {
    const r = APP.regler;
    if (!r) return;
    R.ark(`
      <h2 id="ark-tittel">Slik spiller du ${esc(APP.navn)}</h2>
      ${r.intro ? `<p class="ingress">${esc(r.intro)}</p>` : ""}
      ${r.steg ? `<ol class="steg">${r.steg.map(([t, x]) => `<li><b>${esc(t)}</b><span>${esc(x)}</span></li>`).join("")}</ol>` : ""}
      ${r.tips && r.tips.length ? `<h3>Tips</h3><ul class="tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${r.ekstraHtml || ""}
      <p class="personvern">${window.RUSJ_STAT ? "Det dere skriver inn, blir på denne mobilen. Ingen konto og ingen reklame. Vi teller bare anonymt hvor mange som spiller." : "Alt skjer på denne mobilen. Ingen konto, ingen reklame, og ingenting sendes noe sted."}</p>
      <button class="knapp" data-h="lukk-ark">Skjønner!</button>`);
  };

  // Built-in actions (a game may override any of them).
  const INNEBYGD = {
    tilbake: () => tilbake(),
    lyd: () => {
      R.felles.lyd = !R.felles.lyd;
      R.lagreFelles();
      oppdaterTopp();
      if (R.felles.lyd) R.lyd.klikk();
    },
    regler: () => R.visRegler(),
    "lukk-ark": () => R.lukkArk(),
    "del-bilde": () => delVentende(),
    "installer-app": () => R._installer(),
    // The 18+ gate in front of drinking games (spill.json "alder18": true)
    "alder-ja": () => {
      R.lagreFelles({ over18: true });
      R.statistikk("alder18");
      R.gaTil(APP.hjem || "hjem");
    },
    "alder-nei": () => {
      // Replace, so «back» on the front page doesn't return to the gate.
      location.replace("/");
    },
    // The way out after an error (see «Last resort»): forget this game's saved state — names and
    // sound are kept — and load the page again.
    "start-pa-nytt": () => {
      startesPaNytt = true;
      R.fjern(NOKKEL);
      location.reload();
    },
    "ark-svar": (el) => {
      const svar = arkSvar;
      arkSvar = null;
      R.lukkArk();
      if (svar) svar(el.dataset.v === "ja" ? true : el.dataset.v === "nei" ? false : el.dataset.v);
    },
    // <button data-h="timer-veksle" data-v="timer" data-timer-pause>Pause</button>
    "timer-veksle": (el) => {
      const t = R.timer(el.dataset.v);
      if (t) t.veksle();
    },
    // <button data-h="timer-pluss" data-v="timer">+30 s</button>  (data-sek to change the 30)
    "timer-pluss": (el) => {
      const t = R.timer(el.dataset.v);
      if (t) t.leggTil(Number(el.dataset.sek) || 30);
    },
    "spiller-legg-til": () => {
      const boks = $("#spillerboks");
      const max = Number(boks && boks.dataset.max) || 10;
      if ((S.antall || 0) >= max) return;
      S.antall = (S.antall || 0) + 1;
      if (APP.vedSpillere) APP.vedSpillere(S);
      R.vis();
      const ny = $(`#navn-${S.antall - 1}`);
      if (ny) ny.focus();
    },
    "spiller-fjern": (el) => {
      const boks = $("#spillerboks");
      const min = Number(boks && boks.dataset.min) || 2;
      if ((S.antall || 0) <= min) return;
      const i = Number(el.dataset.v);
      R.felles.navn.splice(i, 1);
      R.lagreFelles();
      S.antall -= 1;
      if (APP.vedSpillere) APP.vedSpillere(S, { fjernet: i });
      R.vis();
    },
  };

  function handling(navn) {
    return (APP.handlinger && APP.handlinger[navn]) || INNEBYGD[navn];
  }

  // ---------- Hold-to-reveal ----------
  // A finger holds the card to see its back and lets go to hide it, so a secret never stays on
  // the table. Everything that is not a finger — Enter or Space, the press of a screen reader,
  // a switch or voice control — shows the card with one press and hides it with the next: no
  // holding and no timing. A card shown that way is also hidden by Escape, when focus leaves it,
  // and by any touch on the screen.
  // While the back shows, what is on it is a line in #si: the player's own screen reader reads
  // it, and it is taken out the moment the card is hidden. It is never part of the button.

  let apenMappe = null;
  let apnetTid = 0;
  let apenMed = ""; // "hold": a finger is on it · "trykk": shown until the next press
  let hemmeligLinje = null; // the back's text in #si, while it shows
  let mappePeker = null; // the pointer that went down on a card: { id, tid }
  let mappeSlipp = -1e9; // when it was lifted: the click that follows belongs to it
  let mappeTast = -1e9; // when a key press on a card was handled: likewise
  const SKJUL_HINT = "Trykk en gang til for å skjule kortet.";
  // What is on the back, as sentences: one for each line of the card, in the words as they were
  // written (a label set in capitals by the stylesheet is not spelled out letter by letter).
  function kortTekst(bak) {
    const linjer = [""];
    const ga = (n) => {
      if (n.nodeType === 3) linjer[linjer.length - 1] += n.nodeValue;
      if (n.nodeType !== 1 || n.hidden || n.getAttribute("aria-hidden") === "true" || /^svg$/i.test(n.tagName)) return;
      if (n.tagName === "IMG") linjer[linjer.length - 1] += " " + (n.getAttribute("alt") || "");
      const egenLinje = n.tagName === "BR" || !/^(inline|contents)/.test(getComputedStyle(n).display);
      if (egenLinje) linjer.push("");
      n.childNodes.forEach(ga);
      if (egenLinje) linjer.push("");
    };
    bak.childNodes.forEach(ga);
    return linjer
      .map(siNorm)
      .filter(Boolean)
      .map((l) => (/[.!?:…]$/.test(l) ? l : l + "."))
      .join(" ");
  }
  function fyllMappe(m) {
    const kort = APP.hemmelig.innhold(S, m.dataset.mappe) || {};
    const bak = m.querySelector(".mappe-bakside");
    bak.className = "mappe-bakside" + (kort.klasse ? " " + kort.klasse : "");
    bak.innerHTML = kort.html || "";
    m.classList.add("apen");
    m.setAttribute("aria-expanded", "true");
    return kort.si != null ? siNorm(kort.si) : kortTekst(bak);
  }
  function apneMappe(m, med) {
    if (apenMappe || !APP.hemmelig) return;
    const tekst = fyllMappe(m);
    apenMappe = m;
    apenMed = med === "trykk" ? "trykk" : "hold";
    // Shown with a press, it counts as seen whenever it is hidden; held, after a moment's look.
    apnetTid = apenMed === "trykk" ? -1e9 : performance.now();
    hemmeligLinje = siLinje(tekst + (apenMed === "trykk" ? " " + SKJUL_HINT : ""), true);
    R.lyd.snu();
    R.vibrer(15);
  }
  function lukkMappe(stille) {
    const m = apenMappe;
    if (!m) return;
    apenMappe = null;
    apenMed = "";
    m.classList.remove("apen");
    m.setAttribute("aria-expanded", "false");
    if (hemmeligLinje) hemmeligLinje.remove();
    hemmeligLinje = null;
    const holdt = performance.now() - apnetTid;
    setTimeout(() => {
      if (!m.classList.contains("apen")) {
        const bak = m.querySelector(".mappe-bakside");
        if (bak) {
          bak.innerHTML = "";
          bak.className = "mappe-bakside";
        }
      }
    }, 450);
    if (stille) return;
    if (holdt < 350) {
      R.toast("Hold litt lenger for å lese");
      return;
    }
    if (APP.hemmelig && APP.hemmelig.sett) APP.hemmelig.sett(S, m.dataset.mappe, m);
  }
  // One press (a key, or a click that no finger made): show the card, or hide it again.
  function veksleMappe(m) {
    if (apenMappe === m) {
      lukkMappe();
      return;
    }
    if (apenMappe) lukkMappe();
    if (!m.isConnected) return; // the game redrew the screen when the other card was hidden
    apneMappe(m, "trykk");
    if (apenMappe === m && document.activeElement !== m) fokuser(m); // so that leaving it hides it
  }
  // A card that was held still shows, but no finger is on it (see pointerup): keep it until the next press.
  function beholdMappe() {
    if (!apenMappe) return;
    apenMed = "trykk";
    apnetTid = -1e9;
    siLinje(SKJUL_HINT);
    if (document.activeElement !== apenMappe) fokuser(apenMappe);
  }
  // The screen was redrawn in place while a card showed. Shown with a press, it stays shown (the
  // new copy of it); held, it is as before: the finger's release hides and counts it.
  function mappeEtterTegn(el) {
    const gammel = apenMappe;
    if (!gammel || gammel.isConnected || apenMed !== "trykk") return;
    const ny = Array.from(el.querySelectorAll(".mappe")).find((k) => k.dataset.mappe === gammel.dataset.mappe);
    if (!ny || !APP.hemmelig) {
      lukkMappe(true);
      return;
    }
    fyllMappe(ny);
    apenMappe = ny;
  }
  // A press from a screen reader comes as pointer events too, but without a finger's size
  // (VoiceOver on iOS: no width or height; on Android a finger's size may itself be reported as
  // nothing, so nothing is concluded there — see the same test in React Aria).
  const kunstigPeker = (e) => e.width === 0 && e.height === 0 && !/Android/i.test(navigator.userAgent || "");

  // ---------- Swipe cards ----------

  let sveip = null;
  function sveipStart(e, kort) {
    sveip = { kort, x: e.clientX, y: e.clientY, dx: 0, aktiv: false, id: e.pointerId };
  }
  function sveipFlytt(e) {
    if (!sveip || e.pointerId !== sveip.id) return;
    const dx = e.clientX - sveip.x;
    const dy = e.clientY - sveip.y;
    if (!sveip.aktiv) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) {
        if (Math.abs(dy) > 14) sveip = null;
        return;
      }
      sveip.aktiv = true;
      sveip.kort.classList.add("drar");
      try {
        sveip.kort.setPointerCapture(e.pointerId);
      } catch (feil) {
        /* ignore */
      }
    }
    sveip.dx = dx;
    sveip.kort.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
  }
  function sveipSlutt(e) {
    if (!sveip || (e && e.pointerId !== sveip.id)) return;
    const s = sveip;
    sveip = null;
    if (!s.aktiv) return;
    s.kort.classList.remove("drar");
    if (Math.abs(s.dx) > 90) {
      const retning = s.dx > 0 ? 1 : -1;
      s.kort.style.transform = "";
      s.kort.style.setProperty("--ut", retning * 130 + "%");
      s.kort.style.setProperty("--ut-rot", retning * 14 + "deg");
      s.kort.classList.add("ut");
      R.lyd.sveip();
      s.kort.dataset.retning = retning > 0 ? "hoyre" : "venstre";
      const h = handling(s.kort.dataset.sveip);
      setTimeout(() => h && h(s.kort, null, S), 200);
    } else {
      s.kort.style.transform = "";
    }
  }
  // Fly the current card out (used by "Next" buttons, so tapping looks like swiping).
  R.kastKort = (retning) =>
    new Promise((resolve) => {
      const kort = $("#skjerm .storkort");
      if (!kort || R.rolig()) return resolve();
      const r = retning || -1;
      kort.style.setProperty("--ut", r * 130 + "%");
      kort.style.setProperty("--ut-rot", r * 14 + "deg");
      kort.classList.add("ut");
      R.lyd.sveip();
      setTimeout(resolve, 200);
    });

  // ---------- Last resort ----------
  // An exception in a game after its first screen must not leave a dead page: the player gets a
  // calm sheet with a way on and a way out. At most one sheet for each thing the player does.
  let feilMeldt = false;
  const erNekt = (feil) => typeof DOMException !== "undefined" && feil instanceof DOMException;
  function vedFeil() {
    if (!APP || !spillVises || feilMeldt || startesPaNytt) return;
    feilMeldt = true;
    try {
      R.ark(`
        <h2 id="ark-tittel">Oi, her gikk noe galt</h2>
        <p class="ingress">Spillet snublet. Prøv en gang til. Står det fast, kan dere starte spillet på nytt – navnene huskes, men denne omgangen blir borte.</p>
        <div class="stabel">
          <button class="knapp" data-h="lukk-ark">Prøv videre</button>
          <button class="knapp-2" data-h="start-pa-nytt">Start spillet på nytt</button>
        </div>`);
    } catch (e) {
      /* not even the sheet can be shown: nothing more to do */
    }
  }
  window.addEventListener("error", (e) => {
    // Only what the game's own code threw: not a picture that failed to load, not the trouble of
    // a script from somewhere else (a browser extension).
    if (e && e.error && String(e.filename || "").startsWith(location.origin)) vedFeil();
  });
  window.addEventListener("unhandledrejection", (e) => {
    // A promise the game left alone. What the browser refuses (sharing was cancelled, sound or
    // the clipboard is not allowed) is a DOMException, and no fault in the game.
    if (e && e.reason instanceof Error && !erNekt(e.reason)) vedFeil();
  });

  // ---------- Start ----------

  R.start = (def) => {
    if (APP) throw new Error("Rusj.start kan bare kalles én gang");
    APP = def;
    APP.navn = APP.navn || meta().navn;
    APP.undertittel = APP.undertittel || meta().undertittel;
    APP.id = APP.id || meta().id;
    NOKKEL = APP.id + ".v" + (APP.versjon || 1);
    S = Object.assign({ skjerm: null }, def.tilstand ? def.tilstand() : {});
    const lagret = R.les(NOKKEL, null);
    if (lagret && typeof lagret === "object") Object.assign(S, lagret);
    R.S = S;
    R.app = APP;
    if (APP.lastet) {
      try {
        APP.lastet(S);
      } catch (e) {
        console.error(e);
        S = Object.assign({ skjerm: null }, def.tilstand ? def.tilstand() : {});
        R.S = S;
      }
    }

    document.documentElement.lang = "nb";

    // What a screen reader says about every secret card, after its name (aria-describedby).
    if (!$("#mappe-hint")) document.body.insertAdjacentHTML("beforeend", '<p id="mappe-hint" hidden>Trykk for å vise kortet, og en gang til for å skjule det.</p>');

    // Every change inside the screen or the sheet — the kit's redraws and a game's own — is looked
    // at once: focus that the change took away is given back, new status lines are taken over and
    // changed ones read out, and the dock is found again.
    if (typeof MutationObserver !== "undefined") {
      const vakt = new MutationObserver(() => {
        reddFokus();
        statusOverta();
        statusEndret();
        finnDokk();
      });
      for (const rot of statusRotter()) vakt.observe(rot, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "hidden"] });
    }

    // A double tap must not run the same async action twice (skip two cards, start two countdowns).
    // The same action is ignored while it is still running, for at most 0.6 s; other actions and
    // sheets are never blocked.
    let opptatt = null;
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-h]");
      if (!el || el.disabled) return;
      const navn = el.dataset.h;
      const h = handling(navn);
      if (!h) return;
      const iArk = !!el.closest("#ark");
      if (!iArk && opptatt === navn) return;
      // Ghost-tap guard: the second tap of a double tap lands on whatever button the NEW screen
      // has in the same spot (e.g. the next player's secret). Real taps within 350 ms of a
      // screen change are ignored. (Scripted clicks in tests are not "trusted" and pass.)
      if (!iArk && e.isTrusted && performance.now() - sisteSkjermbytte < 350) return;
      // Same after an in-place redraw (R.vis): a different button may now sit under the finger —
      // but only where the finger just was. Repeating the same action stays quick (steppers,
      // flipping cards), and a deliberate tap elsewhere (a square, then «Fyr!») always counts.
      const naer = sisteKlikkPos && e.detail > 0 && Math.hypot(e.clientX - sisteKlikkPos.x, e.clientY - sisteKlikkPos.y) < 40;
      if (!iArk && e.isTrusted && performance.now() - sisteOmtegning < 350 && navn !== sisteKlikk && naer) return;
      sisteKlikk = navn;
      sisteKlikkPos = e.detail > 0 ? { x: e.clientX, y: e.clientY } : null;
      if (!el.hasAttribute("data-stille")) R.lyd.klikk();
      if (!iArk) feilMeldt = false; // a new thing is tried: if it fails too, the player is told again
      const svar = h(el, e, S);
      if (svar && typeof svar.then === "function" && !iArk) {
        opptatt = navn;
        const slipp = () => {
          if (opptatt === navn) opptatt = null;
        };
        setTimeout(slipp, 600);
        svar.then(slipp, (feil) => {
          slipp();
          console.error(feil);
          if (!erNekt(feil)) vedFeil();
        });
      }
    });
    document.addEventListener("click", (e) => {
      if (e.target.id === "ark") R.lukkArk();
    });
    document.addEventListener("input", (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.navn != null) {
        const i = Number(el.dataset.navn);
        while (R.felles.navn.length < i) R.felles.navn.push("");
        R.felles.navn[i] = R.kutt(el.value, 16);
        R.lagreFelles();
        const fjern = el.parentElement && el.parentElement.querySelector(".fjern");
        if (fjern) fjern.setAttribute("aria-label", "Fjern " + R.navn(i));
      }
      if (el.dataset && el.dataset.felt && APP.felt && APP.felt[el.dataset.felt]) APP.felt[el.dataset.felt](S, el, e);
    });
    document.addEventListener("keydown", (e) => {
      const el = e.target;
      if (e.key === "Enter" && el.dataset && el.dataset.navn != null) {
        e.preventDefault();
        const neste = $(`#navn-${Number(el.dataset.navn) + 1}`);
        if (neste) neste.focus();
        else el.blur();
      }
      // Escape hides a secret card that is showing; otherwise it closes the sheet.
      if (e.key === "Escape" && apenMappe) {
        e.preventDefault();
        lukkMappe();
      } else if (e.key === "Escape" && R.arkApent()) R.lukkArk();
      // Enter or Space on a secret card: one press shows it, the next hides it. However long the
      // key is held makes no difference (and the browser's own click for the key is not wanted).
      if ((e.key === " " || e.key === "Enter") && el.classList && el.classList.contains("mappe")) {
        e.preventDefault();
        mappeTast = performance.now();
        if (!e.repeat) veksleMappe(el);
      }
    });
    document.addEventListener("keyup", (e) => {
      if ((e.key === " " || e.key === "Enter") && e.target.classList && e.target.classList.contains("mappe")) {
        e.preventDefault();
        mappeTast = performance.now();
      }
    });
    // A click on a secret card that no finger made — a screen reader's double tap, a switch, voice
    // control, a script: the same as a key press. (A finger's hold or tap ends in a click too:
    // that one belongs to the pointer and is left alone.)
    document.addEventListener("click", (e) => {
      const m = e.target.closest ? e.target.closest(".mappe") : null;
      if (!m || mappePeker) return;
      const na = performance.now();
      if (na - mappeSlipp < 500 || na - mappeTast < 100) return;
      if (e.isTrusted && na - sisteSkjermbytte < 350) return; // the second press of a double press, on a new screen
      veksleMappe(m);
    });
    // A press anywhere else hides a card that was shown with a press — before the press does its
    // own thing (capture), so the secret is gone and the game has counted it as seen.
    document.addEventListener(
      "click",
      (e) => {
        if (apenMappe && apenMed === "trykk" && !(e.target.closest && e.target.closest(".mappe"))) lukkMappe();
      },
      true,
    );
    // Focus left a card that was shown with a press: hide it. (When focus has landed, so that a
    // redraw in the game's `sett` can keep it where it went.)
    document.addEventListener("focusout", (e) => {
      const m = apenMappe;
      if (!m || apenMed !== "trykk" || e.target !== m) return;
      setTimeout(() => {
        if (apenMappe === m && apenMed === "trykk" && document.activeElement !== m) lukkMappe();
      }, 0);
    });
    document.addEventListener("submit", (e) => {
      const f = e.target;
      e.preventDefault();
      if (f.dataset && f.dataset.skjema && APP.skjema && APP.skjema[f.dataset.skjema]) APP.skjema[f.dataset.skjema](S, f, e);
    });

    document.addEventListener("pointerdown", (e) => {
      R.lyd.lasOpp();
      const m = e.target.closest(".mappe");
      if (m && kunstigPeker(e)) return; // a screen reader's press: the click that follows does it
      if (m) {
        e.preventDefault();
        // A card that was shown with a press: a finger on a card hides it, and that is all this
        // touch does (its click must not show the card again).
        const vist = !!apenMappe && apenMed === "trykk";
        if (vist) lukkMappe();
        mappePeker = { id: e.pointerId, tid: e.timeStamp, brukt: vist };
        if (vist || !m.isConnected) return;
        try {
          m.setPointerCapture(e.pointerId);
        } catch (feil) {
          /* not all pointers can be captured */
        }
        apneMappe(m, "hold");
        return;
      }
      const kort = e.target.closest(".storkort[data-sveip]");
      if (kort && !e.target.closest("button, a, input")) sveipStart(e, kort);
    });
    document.addEventListener("pointermove", sveipFlytt);
    ["pointerup", "pointercancel"].forEach((t) =>
      document.addEventListener(t, (e) => {
        const p = mappePeker && mappePeker.id === e.pointerId ? mappePeker : null;
        if (p) {
          mappePeker = null;
          mappeSlipp = performance.now();
        }
        // Down and up in the same instant is no finger: assistive technology pressed the card.
        // It stays shown until the next press. Otherwise, as always: letting go hides the card.
        if (p && !p.brukt && t === "pointerup" && apenMed === "hold" && e.timeStamp - p.tid < 3) beholdMappe();
        else if (apenMed === "hold") lukkMappe();
        sveipSlutt(e);
      }),
    );
    window.addEventListener("blur", () => lukkMappe());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) lukkMappe();
      else if (vilVaere) R.holdVaken();
    });
    document.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".mappe, .storkort")) e.preventDefault();
    });

    // Drinking games: confirm age first (once per phone). The gate is a built-in screen.
    if (meta().alder18) {
      APP.skjermer.alder = {
        tittel: "18+",
        tilbake: "portal",
        gjenoppta: false,
        // The game's name is the heading (five drinking games must not be five identical pages to
        // a search engine or a screen reader); the question has the front page's wording.
        vis: () => `
          <div class="spillhjem alder-port">
            ${R.figur()}
            <h1 id="skjerm-tittel">${esc(APP.navn)} <span class="undertittel">Drikkespill · 18+</span></h1>
            <h2 class="alder-spor">Er du 18 år eller eldre?</h2>
            <p class="slagord">Dette spillet er bare for voksne.</p>
          </div>
          <div class="papirboks alder-boks">
            <p class="etikett">Drikk med vett</p>
            <ul class="tips">
              <li>Alkoholfritt teller like mye – vann, brus og alkoholfritt er alltid lov.</li>
              <li>Ta små slurker. Ingen skal presses, og alle kan stå over.</li>
              <li>Spis, drikk vann, og sørg for trygg vei hjem.</li>
            </ul>
          </div>
          ${R.ui.dokk(R.ui.knapp("Ja, jeg er 18 eller eldre", "alder-ja"), R.ui.lenkerad(R.ui.lenke("Nei, ta meg tilbake", "alder-nei")))}`,
      };
    }

    // First screen: a join link (#code), the screen we were on (if recent), or home.
    let forste = APP.hjem || "hjem";
    const hash = (location.hash || "").slice(1);
    let fraHash = null;
    // Join links are codes (or a short list of names); anything huge or malformed is cut or ignored.
    const lesHash = (h) => {
      try {
        return decodeURIComponent(h).slice(0, 2000);
      } catch (e) {
        return "";
      }
    };
    // After a reload on a game screen our history entry is still there — don't add another.
    try {
      harHistorikk = !!(history.state && history.state.rusj);
    } catch (e) {
      harHistorikk = false;
    }
    if (hash === "utfordring") {
      // A challenge link: no data in it, just «someone dared you» on the home screen.
      R.utfordret = true;
      try {
        history.replaceState(history.state, "", location.pathname + location.search);
      } catch (e) {
        /* ignore */
      }
    } else if (hash && APP.vedHash) {
      try {
        fraHash = APP.vedHash(S, lesHash(hash));
      } catch (e) {
        fraHash = null;
      }
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {
        /* ignore */
      }
    }
    const nylig = S._tid && Date.now() - S._tid < 3 * 60 * 60 * 1000;
    const forrige = S.skjerm && APP.skjermer[S.skjerm];
    if (R.utfordret) forste = APP.hjem || "hjem";
    else if (fraHash && APP.skjermer[fraHash]) forste = fraHash;
    // gjenoppta: "skjerm" redirects (e.g. away from a screen that shows a secret); older than
    // 3 hours, every game starts on its home screen (with «Fortsett» there).
    else if (nylig && forrige && typeof forrige.gjenoppta === "string" && APP.skjermer[forrige.gjenoppta]) forste = forrige.gjenoppta;
    else if (nylig && forrige && forrige.gjenoppta !== false && typeof forrige.gjenoppta !== "string") forste = S.skjerm;
    if (meta().alder18 && !R.felles.over18) forste = "alder"; // the age gate comes before everything
    S.skjerm = null;
    R.statistikk("visning");
    try {
      R.gaTil(forste);
    } catch (e) {
      // A saved screen that can't be drawn any more (old or broken state): start from home.
      console.warn("rusj: kunne ikke gjenoppta", forste, e);
      try {
        S.skjerm = null;
        R.gaTil(APP.hjem || "hjem");
      } catch (e2) {
        // Last resort: the saved game can't even draw the home screen. Drop this game's saved
        // state (names and sound are kept) and start fresh, instead of a blank page on every visit.
        console.warn("rusj: lagret tilstand kan ikke tegnes – nullstiller", e2);
        R.fjern(NOKKEL);
        S = Object.assign({ skjerm: null }, def.tilstand ? def.tilstand() : {});
        R.S = S;
        if (APP.lastet) {
          try {
            APP.lastet(S);
          } catch (e3) {
            console.error(e3);
          }
        }
        R.gaTil(APP.hjem || "hjem");
        R.toast("Det lagrede spillet kunne ikke åpnes. Vi startet på nytt.", { topp: true });
      }
    }
    // The first screen is up: from here on a save that fails is said (once), and an exception
    // gets the «Last resort» sheet.
    spillVises = true;
    meldLagring();
    // Stickers that follow from what is stored already, and any earned but not yet celebrated.
    merkerSjekk();
    feirMerkerSnart(1200);

    window.addEventListener("hashchange", () => {
      const h = (location.hash || "").slice(1);
      if (h === "utfordring") {
        try {
          history.replaceState(history.state, "", location.pathname + location.search);
        } catch (e) {
          /* ignore */
        }
        R.utfordret = true;
        if (S.skjerm === (APP.hjem || "hjem")) tegn({});
        else R.gaTil(APP.hjem || "hjem");
        return;
      }
      if (!h || !APP.vedHash) return;
      let sk = null;
      try {
        sk = APP.vedHash(S, lesHash(h));
      } catch (e) {
        sk = null;
      }
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {
        /* ignore */
      }
      if (sk && APP.skjermer[sk]) R.gaTil(sk);
    });

    if ("serviceWorker" in navigator && location.protocol === "https:" && !R.iRamme) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  };
})();
