/* Panna — «Gjett ordet på panna».
   One player holds the phone against the forehead and can't see the word; the others give clues.
   Tilt down = correct, tilt up = pass (DeviceOrientation, with the iOS permission prompt).
   Tap zones always work too: right half = correct, left half = pass.
   The round runs on a fixed full-screen stage. If the browser doesn't rotate (rotation lock on),
   the stage turns itself with the motion sensor so the word still reads the right way.
   The holder can't see the screen, and a silenced iPhone neither sounds nor vibrates — so every
   answer, the last seconds and the end of the round are shown so the OTHERS see it from across a
   table (full-screen flash with symbol and word, a trail of marks, big last seconds). Sound and
   vibration are extras.
   Decks have a record and up to three stars per round length (this phone only, «panna.rekord»). */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const STOKKER = window.RUSJ_DATA.kortstokker.kortstokker;
  const ORDBANK = (window.RUSJ_ORD && window.RUSJ_ORD.kategorier) || [];
  const TIDER = [30, 60, 90];
  const NIVAER = [
    [1, "Lett"],
    [2, "Middels"],
    [3, "Vanskelig"],
  ];
  const STANDARD = ["dyr", "mat", "yrker"];
  const GRENSE = 35; // degrees away from the calibrated neutral position that count as a tilt
  const NOYTRAL = 15; // back within this = ready for the next tilt
  // Right answers in one round for one, two and three stars (5 / 8 / 11 in 60 s, scaled).
  const TERSKLER = { 30: [3, 4, 6], 60: [5, 8, 11], 90: [8, 12, 17] };
  const SISTE = 5; // the last seconds are counted down in big digits
  let H; // the actions

  // ---------- Words ----------
  // One list for everything, so the deck remembers what has been shown (across sessions).
  // Saved games and that memory point into the list by number, so its order is fixed: the first
  // decks, then the word bank, then the decks added later («etterOrdbank» in the data). New decks
  // go last in the file with that mark; new words go last in a deck that has it.
  // Word-bank words that already exist in one of the first decks are skipped. A word-bank word
  // that a later deck also has stays in the list, but is left out while that deck is chosen (w.d).
  // Decks with their own way of giving clues («slik»: mime, sounds, voices) share words freely —
  // a dog to explain and a dog to bark are two different cards.
  const ALLE = [];
  (function () {
    const sett = new Set();
    const iBanken = new Map();
    const leggTil = (s) => s.ord.forEach((t) => ALLE.push({ k: s.id, t, x: R.normaliser(t) }));
    STOKKER.filter((s) => !s.etterOrdbank).forEach((s) => {
      s.ord.forEach((t) => sett.add(R.normaliser(t)));
      leggTil(s);
    });
    ORDBANK.forEach((kat) =>
      kat.ord.forEach((o) => {
        const nokkel = R.normaliser(o[0]);
        if (sett.has(nokkel)) return;
        sett.add(nokkel);
        iBanken.set(nokkel, ALLE.length);
        ALLE.push({ k: "ob:" + kat.id, t: o[0], n: o[1], x: nokkel });
      }),
    );
    STOKKER.filter((s) => s.etterOrdbank).forEach((s) => {
      if (!s.slik)
        s.ord.forEach((t) => {
          const w = ALLE[iBanken.get(R.normaliser(t))];
          if (w) (w.d = w.d || []).push(s.id);
        });
      leggTil(s);
    });
  })();
  const kortstokk = R.kortstokk("ord", ALLE.length);
  const stokk = (id) => STOKKER.find((s) => s.id === id);
  const obKat = (id) => ORDBANK.find((k) => k.id === id);
  const iUtvalg = (o, w) =>
    w.k.startsWith("ob:") ? o.ordbank.includes(w.k.slice(3)) && w.n <= o.nivaa && !(w.d && w.d.some((id) => o.stokker.includes(id))) : o.stokker.includes(w.k);
  const antallOrd = (o) => ALLE.reduce((n, w) => n + (iUtvalg(o, w) ? 1 : 0), 0);
  const antallOb = (id, nivaa) => ALLE.reduce((n, w) => n + (w.k === "ob:" + id && w.n <= nivaa ? 1 : 0), 0);
  function kilde(w) {
    if (w.k.startsWith("ob:")) {
      const kat = obKat(w.k.slice(3));
      return { navn: kat ? kat.navn : "Ordbanken", ikon: kat ? kat.ikon : "📚", slik: false };
    }
    const s = stokk(w.k);
    return { navn: s.navn, ikon: s.ikon, slik: !!s.slik };
  }

  // The season's deck is listed first while it is the season (1 November – 6 January), else last.
  const iDag = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const erJuletid = () => {
    const mmdd = iDag().slice(5);
    return mmdd >= "11-01" || mmdd <= "01-06";
  };
  const visteStokker = () => {
    const jul = stokk("jul");
    const andre = STOKKER.filter((s) => s !== jul);
    return !jul ? andre : erJuletid() ? [jul, ...andre] : [...andre, jul];
  };

  // What the helpers do in this round. Most decks are explained; some have their own way («slik»).
  function hjelperTekst(o) {
    const mater = new Set(o.stokker.map((id) => stokk(id)).filter(Boolean).map((s) => s.slik || ""));
    if (o.ordbank.length) mater.add("");
    if (mater.size > 1) return { tekst: "Sjekk merkelappen øverst på hvert kort.", slik: true };
    const slik = Array.from(mater)[0];
    return slik ? { tekst: slik, slik: true } : { tekst: "De andre gir hint – uten å si ordet.", slik: false };
  }

  // ---------- Records and stars (this phone only) ----------
  // { "dyr:60": 11, "miks:60": 9 }: the most right answers in one round, per deck and round length.
  // A round counts for a deck when that deck alone was chosen; everything else is «miks».
  const terskler = (tid) => TERSKLER[tid] || TERSKLER[60].map((n) => Math.max(1, Math.round((n * tid) / 60)));
  const stjerner = (n, tid) => terskler(tid).filter((t) => n >= t).length;
  function rekorder() {
    const lest = R.les("panna.rekord", {});
    const ut = {};
    if (lest && typeof lest === "object")
      for (const [k, v] of Object.entries(lest)) if (/^[a-z0-9]{1,20}:\d{1,3}$/.test(k) && Number.isInteger(v) && v > 0 && v < 1000) ut[k] = v;
    return ut;
  }
  const rekordNokkel = (o) => (o.stokker.length === 1 && !o.ordbank.length && stokk(o.stokker[0]) ? o.stokker[0] : "miks");
  const stokkStjerner = (id, alle) => TIDER.reduce((best, tid) => Math.max(best, stjerner(alle[`${id}:${tid}`] || 0, tid)), 0);
  const sumStjerner = (alle) => STOKKER.reduce((sum, s) => sum + stokkStjerner(s.id, alle), 0);
  const besteRekord = (alle) => Object.values(alle).reduce((best, n) => Math.max(best, n), 0);
  const stjerneHtml = (n, klasse) =>
    `<span class="panna-stjerner ${klasse || ""}" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= n ? ' class="pa"' : ""}>★</i>`).join("")}</span>`;
  const stjerneTekst = (n) => `${n} av 3 stjerner`;

  // ---------- Turns and points ----------
  const pagar = (S) => !!S.spill && !S.spill.ferdig; // a game that «Nytt spill» would throw away
  // The first player changes from game to game (sp.start), then the phone goes round.
  const spiller = (sp) => (sp.poeng ? ((sp.start || 0) + sp.historikk.length) % sp.antall : -1);
  const sisteRunde = (sp) => sp.poeng && sp.historikk.length >= sp.antall * sp.runder;
  const riktige = (h) => h.ord.filter((o) => o.ok).length;
  // Who has had the phone in the lap that is being played (for the progress dots).
  const ferdigeILaget = (sp) => sp.historikk.slice(Math.floor(sp.historikk.length / sp.antall) * sp.antall).map((h) => h.i);
  function poengRader(sp, pluss) {
    const sum = Array.from({ length: sp.antall }, () => 0);
    sp.historikk.forEach((h) => {
      if (h.i >= 0 && h.i < sp.antall) sum[h.i] += riktige(h);
    });
    return sum.map((poeng, i) => ({ i, poeng, pluss: pluss && pluss.i === i ? pluss.n : 0 }));
  }
  // The crowning: who won, the best single round and the total.
  function kaaring(sp) {
    const rader = poengRader(sp);
    const sortert = rader.slice().sort((a, b) => b.poeng - a.poeng);
    const topp = sortert[0] ? sortert[0].poeng : 0;
    const best = sp.historikk.reduce((b, h) => (h.i >= 0 && riktige(h) > 0 && (!b || riktige(h) > riktige(b)) ? h : b), null);
    return { rader, sortert, topp, vinnere: sortert.filter((r) => r.poeng === topp && topp > 0), best, totalt: sp.historikk.reduce((s, h) => s + riktige(h), 0) };
  }
  // The game is over (once): the evening's scoreboard and the statistics hear about it here.
  function avsluttSpill(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig) return;
    sp.ferdig = true;
    if (!sp.historikk.length) return; // (given up before the first round: nothing to tell)
    const totalt = sp.historikk.reduce((s, h) => s + riktige(h), 0);
    R.statistikk("ferdig", { poeng: !!sp.poeng, spillere: sp.antall, runder: sp.historikk.length, ord: totalt });
    if (sp.poeng) R.kveld.registrer(poengRader(sp).map((r) => ({ i: r.i, poeng: r.poeng })));
  }
  function rundeTittel(sp) {
    if (!sp) return "Panna";
    if (sp.poeng) return `Runde ${Math.min(sp.runder, Math.floor(sp.historikk.length / sp.antall) + 1)} av ${sp.runder}`;
    return `Runde ${sp.historikk.length + 1}`;
  }
  function fortsettTekst(sp) {
    if (sp.poeng && sisteRunde(sp)) return "Fortsett · til kåringen";
    if (sp.poeng) return `Fortsett · ${R.navn(spiller(sp))} står for tur`;
    return `Fortsett · runde ${sp.historikk.length + 1}`;
  }
  // Praise in proportion to the round length: seven in 30 s is something else than seven in 90 s.
  function kommentar(n, tid) {
    const per60 = (n * 60) / (tid || 60);
    if (n === 0) return "Panna tok seg en pause. Neste gang!";
    if (per60 <= 2) return "Det er lov å varme opp.";
    if (per60 <= 4) return "Ikke verst i det hele tatt!";
    if (per60 <= 6) return "Godt jobba!";
    if (per60 <= 9) return "Sterk panne!";
    if (per60 <= 12) return "Panneproff!";
    return "Er du synsk, eller?!";
  }

  // What a finished round says about records and stars. gml = the record before this round.
  function rekordInfo(h, tidStd) {
    const tid = h.tid || tidStd;
    const n = riktige(h);
    const gml = Number(h.gml) || 0;
    const s = h.rk && h.rk !== "miks" ? stokk(h.rk) : null;
    return { rk: h.rk || "", tid, n, gml, s, ny: n > gml && gml > 0, rekord: Math.max(gml, n), stjerner: s ? stjerner(n, tid) : 0, neste: s ? terskler(tid).find((t) => n < t) || 0 : 0 };
  }
  // Keep the stored record in step with the round (also when a word is corrected afterwards).
  function lagreRekord(h, tidStd) {
    if (!h || !h.rk) return;
    const alle = rekorder();
    const nokkel = `${h.rk}:${h.tid || tidStd}`;
    const ny = Math.max(Number(h.gml) || 0, riktige(h));
    if (ny > 0) alle[nokkel] = ny;
    else delete alle[nokkel];
    R.skriv("panna.rekord", alle);
  }

  // ---------- Motion sensor ----------
  // theta = how far the screen faces up (+) or down (−) in degrees, from the device's beta/gamma.
  // It doesn't depend on portrait/landscape, so it works whichever way the phone is held.
  // ux/uy = which edge of the phone points up (used to turn the stage when the browser doesn't).
  const Vipp = { status: "ukjent", theta: 0, ux: 0, uy: 0, null0: 0, armert: false, retning: null, teller: 0, prover: [], lytter: false, vakt: null };
  const harApi = () => typeof window.DeviceOrientationEvent !== "undefined";
  const maaSporre = () => harApi() && typeof window.DeviceOrientationEvent.requestPermission === "function";

  function settStatus(s) {
    if (Vipp.status === s) return;
    Vipp.status = s;
    if (R.S && R.S.skjerm === "klar") R.vis();
  }
  function lytt() {
    if (!harApi()) return settStatus("mangler");
    if (!Vipp.lytter) {
      window.addEventListener("deviceorientation", vedOrientering);
      Vipp.lytter = true;
    }
    if (Vipp.status !== "aktiv") {
      settStatus("venter");
      clearTimeout(Vipp.vakt);
      Vipp.vakt = setTimeout(() => {
        if (Vipp.status === "venter") settStatus("mangler");
      }, 1500);
    }
  }
  function forberedVipp(S) {
    if (!S.oppsett.vipp || Vipp.status !== "ukjent") return;
    if (!harApi()) settStatus("mangler");
    else if (maaSporre()) settStatus("spor");
    else lytt();
  }
  // Must run inside a tap: iOS only shows its permission prompt then. Returns a promise or null.
  function beOmVipp(provIgjen) {
    if (!harApi()) {
      settStatus("mangler");
      return null;
    }
    if (Vipp.status === "aktiv" || Vipp.status === "venter" || Vipp.status === "mangler") return null;
    if (Vipp.status === "nektet" && !provIgjen) return null;
    if (maaSporre()) {
      let svar;
      try {
        svar = window.DeviceOrientationEvent.requestPermission();
      } catch (e) {
        settStatus("nektet");
        return null;
      }
      return Promise.resolve(svar)
        .then((s) => (s === "granted" ? lytt() : settStatus("nektet")))
        .catch(() => settStatus("nektet"));
    }
    lytt();
    return null;
  }
  function vedOrientering(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = (e.beta * Math.PI) / 180;
    const g = (e.gamma * Math.PI) / 180;
    const n = Math.max(-1, Math.min(1, Math.cos(b) * Math.cos(g)));
    const theta = (Math.asin(n) * 180) / Math.PI;
    Vipp.theta = Vipp.status === "aktiv" ? Vipp.theta * 0.35 + theta * 0.65 : theta;
    Vipp.ux = -Math.sin(g) * Math.cos(b);
    Vipp.uy = Math.sin(b);
    if (Vipp.status !== "aktiv") {
      clearTimeout(Vipp.vakt);
      settStatus("aktiv");
    }
    vedVipp();
  }
  function vedVipp() {
    oppdaterRotasjon();
    const S = R.S;
    const r = S && S.skjerm === "runde" && S.spill && S.spill.runde;
    if (!r) return;
    if (r.fase === "nedtelling") {
      Vipp.prover.push(Vipp.theta);
      if (Vipp.prover.length > 40) Vipp.prover.shift();
    }
    if (r.fase !== "spill" || !S.oppsett.vipp) return;
    // While the answer flash locks input, a tilt must not build up: back to neutral first.
    if (laast) {
      Vipp.armert = false;
      Vipp.teller = 0;
      return;
    }
    const d = Vipp.theta - Vipp.null0;
    if (!Vipp.armert) {
      if (Math.abs(d) < NOYTRAL) Vipp.armert = true;
      Vipp.teller = 0;
      return;
    }
    const retning = d <= -GRENSE ? "ned" : d >= GRENSE ? "opp" : null;
    if (retning !== Vipp.retning) {
      Vipp.retning = retning;
      Vipp.teller = 0;
    }
    if (!retning) return;
    if (++Vipp.teller >= 3) {
      Vipp.armert = false;
      Vipp.teller = 0;
      svar(S, retning === "ned");
    }
  }
  // Neutral position = how the phone sat on the forehead during the countdown.
  function kalibrer() {
    const p = Vipp.prover.slice(-15).sort((a, b) => a - b);
    const m = p.length ? p[Math.floor(p.length / 2)] : 0;
    Vipp.null0 = Math.abs(m) <= 35 ? m : 0;
    Vipp.armert = false;
    Vipp.teller = 0;
    Vipp.retning = null;
  }

  // Turn the stage ±90° when the screen stays portrait but the phone is held sideways.
  const rot = { na: 0, kandidat: 0, siden: 0 };
  function oppdaterRotasjon() {
    const scene = document.getElementById("panna-scene");
    if (!scene) return;
    const portrett = window.innerHeight > window.innerWidth;
    let mal = rot.na;
    if (!portrett || Vipp.status !== "aktiv" || !R.S.oppsett.vipp) mal = 0;
    else if (Math.abs(Vipp.ux) > 0.7 && Math.abs(Vipp.ux) > Math.abs(Vipp.uy)) mal = Vipp.ux > 0 ? 90 : -90;
    else if (Math.abs(Vipp.uy) > 0.7 && Math.abs(Vipp.uy) > Math.abs(Vipp.ux)) mal = 0;
    const na = performance.now();
    if (mal === rot.na) {
      rot.kandidat = mal;
      return;
    }
    if (portrett && mal !== 0) {
      if (mal !== rot.kandidat) {
        rot.kandidat = mal;
        rot.siden = na;
        return;
      }
      if (na - rot.siden < 700) return;
    }
    rot.na = mal;
    rot.kandidat = mal;
    scene.dataset.rot = String(mal);
    tilpassOrd();
  }

  // ---------- Full screen (Android): hides the browser bars and locks landscape ----------
  function fullskjerm() {
    try {
      const el = document.documentElement;
      if (R.iRamme || document.fullscreenElement || !el.requestFullscreen) return;
      if (!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) return;
      if (navigator.userActivation && !navigator.userActivation.isActive) return;
      el.requestFullscreen({ navigationUI: "hide" })
        .then(() => (screen.orientation && screen.orientation.lock ? screen.orientation.lock("landscape") : null))
        .catch(() => {});
    } catch (e) {
      /* not supported */
    }
  }
  function forlatFullskjerm() {
    try {
      if (document.fullscreenElement && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (e) {
      /* ignore */
    }
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- The round ----------
  let klokke = null; // R.Timer while playing
  let laast = false; // ignore answers while the flash shows
  let nyStart = false; // set by «Start runden» so the round screen knows it's a fresh start
  let rafId = 0;
  let blinkId = 0;
  const planer = new Set();
  function planlegg(fn, ms) {
    const id = setTimeout(() => {
      planer.delete(id);
      fn();
    }, ms);
    planer.add(id);
  }
  function avbrytPlaner() {
    planer.forEach(clearTimeout);
    planer.clear();
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  const iRunde = (S, r) => S.skjerm === "runde" && S.spill && S.spill.runde === r;
  const gjeldende = (r) => r.ord[r.ord.length - 1];

  function trekk(S) {
    const r = S.spill.runde;
    const brukt = new Set(r.ord.map((o) => o.n));
    // (The same word from two decks — a dog to explain and a dog to bark — only once per round.)
    const tekster = new Set(r.ord.map((o) => ALLE[o.n].x));
    let i = kortstokk.neste((n) => iUtvalg(S.oppsett, ALLE[n]) && !brukt.has(n) && !tekster.has(ALLE[n].x));
    if (i < 0) i = kortstokk.neste((n) => iUtvalg(S.oppsett, ALLE[n]) && !brukt.has(n));
    if (i < 0) i = kortstokk.neste((n) => iUtvalg(S.oppsett, ALLE[n]) && n !== (gjeldende(r) || {}).n);
    // Nothing selected (old saved state): any word not shown in this round, so it never repeats.
    if (i < 0) i = kortstokk.neste((n) => !brukt.has(n));
    r.ord.push({ n: i < 0 ? 0 : i, ok: null });
  }

  // 1. "Hold the phone to your forehead": starts the countdown when the phone is held upright
  //    (or after a moment without a sensor).
  function plasser(S) {
    const r = S.spill.runde;
    r.fase = "plasser";
    R.vis();
    const t0 = performance.now();
    let oppreist = 0;
    const sjekk = () => {
      if (!iRunde(S, r) || r.fase !== "plasser") return;
      const na = performance.now();
      if (S.oppsett.vipp && Vipp.status === "aktiv") {
        if (Math.abs(Vipp.theta) < 32) oppreist = oppreist || na;
        else oppreist = 0;
        if ((na - t0 > 700 && oppreist && na - oppreist > 450) || na - t0 > 6000) return nedtelling(S);
      } else if (na - t0 > (Vipp.status === "venter" ? 1700 : 1100)) {
        return nedtelling(S);
      }
      planlegg(sjekk, 80);
    };
    planlegg(sjekk, 80);
  }

  // 2. 3 · 2 · 1 (the sensor is calibrated meanwhile)
  function nedtelling(S) {
    const r = S.spill.runde;
    r.fase = "nedtelling";
    Vipp.prover = [];
    R.vis();
    let n = 3;
    const steg = () => {
      if (!iRunde(S, r) || r.fase !== "nedtelling") return;
      if (n > 0) {
        const el = R.$("#panna-tall");
        if (el) {
          el.textContent = String(n);
          el.classList.remove("hopp");
          void el.offsetWidth;
          el.classList.add("hopp");
        }
        R.lyd.tikk();
        R.vibrer(15);
        n--;
        planlegg(steg, 800);
      } else {
        kalibrer();
        spill(S);
      }
    };
    steg();
  }

  // 3. Play: a word on the stage, the clock running.
  function spill(S) {
    const r = S.spill.runde;
    const forste = !r.ord.length;
    r.fase = "spill";
    const sist = gjeldende(r);
    if (!sist || sist.ok !== null) trekk(S);
    laast = false;
    R.vis();
    R.lyd.pling();
    R.vibrer(forste ? [40, 60, 40] : 40);
    klokke = new R.Timer({
      id: "panna-tid",
      sekunder: Math.max(0.5, r.igjen),
      visning: "sek",
      vedTikk: (sek) => {
        if (!klokke || !iRunde(S, r)) return;
        r.igjen = klokke.igjen;
        const scene = R.$("#panna-scene");
        if (scene) {
          scene.classList.toggle("lite", r.igjen <= 10);
          // The last seconds in big digits behind the word, and the frame beats once a second:
          // the others can see that time is running out, with or without sound.
          const siste = sek > 0 && sek <= SISTE;
          scene.classList.toggle("siste", siste);
          const tall = R.$("#panna-siste");
          if (tall) tall.textContent = siste ? String(sek) : "";
          if (siste) {
            scene.classList.remove("tikk");
            void scene.offsetWidth;
            scene.classList.add("tikk");
          }
        }
        R.lagre();
      },
      vedSlutt: () => tidenErUte(S, r),
    });
    klokke.start();
    const bar = () => {
      const el = document.getElementById("panna-bar");
      if (!el || !klokke || r.fase !== "spill") {
        rafId = 0;
        return;
      }
      el.style.transform = `scaleX(${Math.max(0, klokke.igjen / r.tid)})`;
      rafId = requestAnimationFrame(bar);
    };
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(bar);
  }

  function svar(S, riktig) {
    const r = S.spill && S.spill.runde;
    if (!r || r.fase !== "spill" || laast) return;
    const sist = gjeldende(r);
    if (!sist || sist.ok !== null) return;
    laast = true;
    sist.ok = riktig;
    blink(riktig);
    if (riktig) R.lyd.riktig();
    else {
      R.lyd.tone(560, 0, 0.12, "triangle", 0.14, 380);
      R.lyd.tone(380, 0.1, 0.18, "triangle", 0.12, 250);
    }
    R.vibrer(riktig ? 70 : [25, 60, 25]);
    R.si(riktig ? "Riktig" : "Pass");
    const p = R.$("#panna-poeng");
    if (p) p.textContent = "✓ " + r.ord.filter((o) => o.ok).length;
    const spor = R.$("#panna-spor");
    if (spor) spor.innerHTML = sporHtml(r, true);
    R.lagre();
    planlegg(() => {
      if (r.fase !== "spill") return;
      trekk(S);
      visOrd(S);
      R.lagre();
    }, 260);
    planlegg(() => {
      laast = false;
    }, 650);
  }

  // The answer, big enough to be seen from across a table: the whole stage in one colour with a
  // symbol and the word (a tick in a circle on green, a double arrow in a square on orange).
  // At most one flash per answer, and answers are at least 0.65 s apart.
  function blink(riktig) {
    const el = R.$("#panna-blink");
    if (!el) return;
    el.querySelector("i").textContent = riktig ? "✓" : "»";
    el.querySelector("b").textContent = riktig ? "Riktig!" : "Pass";
    el.className = "panna-blink vis " + (riktig ? "riktig" : "pass");
    clearTimeout(blinkId);
    blinkId = setTimeout(() => el.classList.remove("vis"), 560);
  }

  // The trail: one mark per answer so far in the round (the last six), newest to the right.
  // It stays on the card, so nobody has to catch the flash to know that an answer was counted.
  function sporHtml(r, ny) {
    const svart = r.ord.filter((o) => o.ok !== null);
    const vist = svart.slice(-6);
    return vist.map((o, i) => `<i class="${o.ok ? "r" : "p"}${ny && i === vist.length - 1 ? " ny" : ""}">${o.ok ? "✓" : "»"}</i>`).join("");
  }

  function visOrd(S) {
    const r = S.spill.runde;
    const w = ALLE[gjeldende(r).n];
    const el = R.$("#panna-ord");
    if (el) {
      el.textContent = w.t;
      el.classList.remove("inn");
      void el.offsetWidth;
      el.classList.add("inn");
    }
    const k = kilde(w);
    const st = R.$("#panna-kilde");
    if (st) {
      st.innerHTML = kildeHtml(k);
      st.classList.toggle("slik", k.slik);
    }
    tilpassOrd();
  }

  // The biggest font size that keeps the word on the card (whole words never break).
  function tilpassOrd() {
    const el = document.getElementById("panna-ord");
    if (!el) return;
    const boks = el.parentElement;
    const hoyde = boks.clientHeight;
    if (!boks.clientWidth || !hoyde) return;
    const passer = () => el.scrollWidth <= el.clientWidth + 1 && el.offsetHeight <= hoyde;
    let lo = 14;
    let hi = Math.max(lo, Math.min(240, hoyde * 0.9));
    el.style.fontSize = hi + "px";
    if (passer()) return;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = mid + "px";
      if (passer()) lo = mid;
      else hi = mid;
    }
    el.style.fontSize = Math.floor(lo) + "px";
  }

  function tidenErUte(S, r) {
    if (!iRunde(S, r) || r.fase !== "spill") return;
    avbrytPlaner();
    r.fase = "slutt";
    r.igjen = 0;
    laast = true;
    const sist = gjeldende(r);
    if (sist && sist.ok === null) {
      sist.ok = false;
      sist.ute = true;
    }
    // The whole stage says so, long enough for everyone to look up (the alarm is an extra).
    R.vis();
    const n = r.ord.filter((o) => o.ok).length;
    R.si(`Tiden er ute. ${n} ${n === 1 ? "riktig" : "riktige"}.`);
    planlegg(() => {
      if (!iRunde(S, r)) return;
      avsluttRunde(S);
      R.gaTil("resultat");
    }, 2600);
  }

  function pause(S) {
    const r = S.spill && S.spill.runde;
    if (!r || r.fase === "pause" || r.fase === "slutt") return;
    avbrytPlaner();
    if (klokke) {
      klokke.pause();
      r.igjen = klokke.igjen;
      klokke.stopp();
      klokke = null;
    }
    laast = false;
    r.fase = "pause";
    R.vis();
  }

  // Ends the round and records it. A round where no word was shown is dropped instead, so the
  // player keeps the turn. Returns true when the round was recorded.
  function avsluttRunde(S) {
    const sp = S.spill;
    const r = sp && sp.runde;
    if (!r) return false;
    avbrytPlaner();
    if (klokke) klokke.stopp();
    klokke = null;
    laast = false;
    sp.runde = null;
    if (!r.ord.length) return false;
    const ord = r.ord.filter((o) => o.ok !== null).map((o) => (o.ute ? { n: o.n, ok: false, ute: true } : { n: o.n, ok: !!o.ok }));
    // tid and rk say which record the round counts for; gml is that record before this round.
    const rk = typeof r.rk === "string" && (r.rk === "miks" || stokk(r.rk)) ? r.rk : "miks";
    const h = { i: spiller(sp), ord, tid: r.tid, rk, gml: rekorder()[`${rk}:${r.tid}`] || 0 };
    sp.historikk.push(h);
    lagreRekord(h, r.tid);
    R.statistikk("runde", { stokk: rk, tid: r.tid, riktige: riktige(h), pass: ord.length - riktige(h), vipp: !!(S.oppsett.vipp && Vipp.status === "aktiv") });
    return true;
  }

  // Leaving the round in any way: stop everything that runs.
  function ryddRunde() {
    document.documentElement.classList.remove("panna-pa-scenen");
    window.removeEventListener("resize", vedStorrelse);
    document.removeEventListener("visibilitychange", vedSynlighet);
    document.removeEventListener("keydown", vedTast);
    avbrytPlaner();
    clearTimeout(blinkId);
    klokke = null;
    laast = false;
    forlatFullskjerm();
  }
  function vedStorrelse() {
    oppdaterRotasjon();
    tilpassOrd();
  }
  function vedSynlighet() {
    if (document.hidden && R.S.skjerm === "runde") pause(R.S);
  }
  function vedTast(e) {
    const S = R.S;
    const r = S.spill && S.spill.runde;
    if (!r || R.arkApent() || r.fase !== "spill") return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      svar(S, true);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      svar(S, false);
    } else if (e.key === "Escape" || e.key === "p") {
      pause(S);
    }
  }

  // ---------- Pieces of markup ----------
  // The deck tiles: stars (the best round at any length) and the record at the chosen round
  // length; «Ny» on a deck that was added lately and hasn't been played yet.
  function stokkGrid(o, sisteHtml) {
    const alle = rekorder();
    const dag = iDag();
    return `<div class="panna-stokker" role="group" aria-label="Kortstokker">${visteStokker()
      .map((s) => {
        const st = stokkStjerner(s.id, alle);
        const rek = alle[`${s.id}:${o.tid}`] || 0;
        const ny = !!s.ny && dag <= s.ny && !TIDER.some((t) => alle[`${s.id}:${t}`]);
        return `<button class="panna-stokk" data-h="stokk" data-v="${s.id}" aria-pressed="${o.stokker.includes(s.id)}" title="${esc(s.tekst)}" style="--sf: var(--${s.farge}); --sf-dyp: var(--${s.farge}-dyp)">
        ${ny ? `<span class="panna-ny">Ny</span>` : ""}<span class="panna-stokk-ikon" aria-hidden="true">${s.ikon}</span><b>${esc(s.navn)}</b>${stjerneHtml(st)}<small>${rek ? `rekord ${rek}` : `${s.ord.length} ord`}</small><span class="vh">, ${stjerneTekst(st)}</span>
      </button>`;
      })
      .join("")}${sisteHtml || ""}</div>`;
  }
  function valgteStokker(o) {
    const alene = rekordNokkel(o);
    const rek = alene !== "miks" ? rekorder()[`${alene}:${o.tid}`] || 0 : 0;
    const deler = o.stokker.map((id) => stokk(id)).filter(Boolean).map((s) => `<li>${s.ikon} ${esc(s.navn)}${rek ? ` · rekord ${rek}` : ""}</li>`);
    o.ordbank.forEach((id) => {
      const k = obKat(id);
      if (k) deler.push(`<li>${k.ikon} ${esc(k.navn)}</li>`);
    });
    return `<ul class="panna-valgte" aria-label="Kortstokker i spill">${deler.join("")}</ul>`;
  }
  // One tip for the clue-givers, taking turns between the chosen decks.
  function stokkTips(S) {
    const med = S.oppsett.stokker.map((id) => stokk(id)).filter((s) => s && s.tips);
    if (!med.length) return "";
    const s = med[S.spill.historikk.length % med.length];
    return `<p class="panna-tips"><span aria-hidden="true">💡</span> <b>${esc(s.navn)}:</b> ${esc(s.tips)}</p>`;
  }
  function vippStatus(S) {
    if (!S.oppsett.vipp) return { modus: "trykk", html: `<p class="panna-status">👆 Trykkmodus – vipping er skrudd av i oppsettet</p>` };
    switch (Vipp.status) {
      case "spor":
        // «Start runden» asks for the motion sensor itself (iPhone needs a tap for that).
        return { modus: "vipp", html: `<p class="panna-status">📳 Mobilen spør om bevegelse – trykk «Tillat».</p>` };
      case "aktiv":
        return { modus: "vipp", html: `<p class="panna-status pa">📳 Vipping er på</p>` };
      case "nektet":
        return { modus: "trykk", html: `<div class="panna-status">👆 Vipping ble ikke tillatt – en av de andre trykker i stedet. ${R.ui.lenke("Prøv igjen", "tillat")}</div>` };
      case "mangler":
        return { modus: "trykk", html: `<p class="panna-status">👆 Fant ingen bevegelsessensor – en av de andre trykker i stedet.</p>` };
      default:
        return { modus: "vipp", html: `<p class="panna-status">📳 Ser etter bevegelsessensor …</p>` };
    }
  }
  const DEMO_VIPP = `<div class="panna-demo" aria-hidden="true">${R.figur()}<span class="panna-demo-merke ned">✓ Riktig</span><span class="panna-demo-merke opp">» Pass</span></div>`;
  const DEMO_TRYKK = `<div class="panna-demo trykk" aria-hidden="true"><div class="panna-mini"><span class="pass">◀<br>Pass</span><span class="riktig">Riktig<br>▶</span></div></div>`;
  const PAUSE_IKON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`;
  // A stopwatch at zero, for «Tiden er ute!»
  const KLOKKE_IKON = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="27" r="15"/><path d="M24 27V17"/><path d="M19 5h10M24 5v7M36.5 14.5l2.5-2.5"/></svg>`;

  const kildeHtml = (k) => `<span aria-hidden="true">${k.ikon}</span> <span class="panna-kilde-navn">${esc(k.navn)}</span>`;

  function visScene(S) {
    const r = S.spill.runde;
    const sist = gjeldende(r);
    const w = sist ? ALLE[sist.n] : null;
    const k = w ? kilde(w) : null;
    const antallRiktige = r.ord.filter((o) => o.ok).length;
    let lag = "";
    if (r.fase === "plasser" || r.fase === "nedtelling") {
      // While the phone is lifted: a word to the holder. During the countdown the screen faces the
      // others, so that is where they are told what to do (explain, mime, make the sound …).
      const hjelp = hjelperTekst(S.oppsett);
      lag = `<div class="panna-lag panna-klargjor">
        ${r.fase === "nedtelling" ? `<p class="panna-tall hopp" id="panna-tall" aria-live="assertive">3</p>` : `<div class="panna-plasser-figur">${R.figur()}</div>`}
        <p class="panna-beskjed">Mobilen på panna!</p>
        ${r.fase === "nedtelling" ? `<p class="panna-under${hjelp.slik ? " slik" : ""}">${esc(hjelp.tekst)}</p>` : `<p class="panna-under">Skjermen skal peke ut mot de andre.</p>`}
      </div>`;
    } else if (r.fase === "pause") {
      const startet = r.ord.length > 0;
      lag = `<div class="panna-lag panna-pause" role="dialog" aria-labelledby="panna-pause-tittel">
        <h2 id="panna-pause-tittel">Pause</h2>
        <p class="panna-under">${startet ? `${Math.ceil(r.igjen)} s igjen · ${antallRiktige} ${antallRiktige === 1 ? "riktig" : "riktige"}` : "Runden har ikke startet ennå."}</p>
        <div class="panna-pause-knapper">${R.ui.knapp2(startet ? "Avslutt runden" : "Avbryt", "avslutt-runde")}${R.ui.knapp(startet ? "Fortsett" : "Start", "fortsett-runde", { ikon: "▶" })}</div>
      </div>`;
    } else if (r.fase === "slutt") {
      lag = `<div class="panna-lag panna-ute">
        <span class="panna-ute-ikon" aria-hidden="true">${KLOKKE_IKON}</span>
        <p class="panna-ute-tekst">Tiden er ute!</p>
        <p class="panna-under">${antallRiktige} ${antallRiktige === 1 ? "riktig" : "riktige"}</p>
      </div>`;
    }
    const spilles = r.fase === "spill";
    const siste = spilles && r.igjen > 0 && r.igjen <= SISTE;
    return `
      <h1 class="vh" id="skjerm-tittel">Panna – runden er i gang</h1>
      <div class="panna-scene${r.igjen <= 10 ? " lite" : ""}${siste ? " siste" : ""}${S.oppsett.vipp && Vipp.status === "aktiv" ? " vipp" : ""}" id="panna-scene" data-fase="${r.fase}" data-rot="${rot.na}">
        <div class="panna-flate">
          <div class="panna-kort">
            <div class="panna-topp">
              <span class="panna-kilde${k && k.slik ? " slik" : ""}" id="panna-kilde">${k ? kildeHtml(k) : ""}</span>
              <span class="panna-poeng" id="panna-poeng">✓ ${antallRiktige}</span>
              <span class="panna-tid" id="panna-tid" aria-label="Sekunder igjen"><span class="timer-tid">${Math.ceil(r.igjen)}</span></span>
            </div>
            <div class="panna-ordboks">
              <span class="panna-siste" id="panna-siste" aria-hidden="true">${siste ? Math.ceil(r.igjen) : ""}</span>
              <p class="panna-ord" id="panna-ord" aria-live="polite">${w && (spilles || r.fase === "slutt") ? esc(w.t) : ""}</p>
            </div>
            <div class="panna-bunn" aria-hidden="true"><span class="pass">◀ Pass</span><span class="panna-spor" id="panna-spor">${sporHtml(r)}</span><span class="riktig">Riktig ▶</span></div>
            <div class="panna-bar"><i id="panna-bar" style="transform: scaleX(${Math.max(0, r.igjen / r.tid)})"></i></div>
          </div>
          ${
            spilles
              ? `<button class="panna-sone pass" data-h="svar" data-v="pass" data-stille aria-label="Pass – hopp over ordet"></button>
          <button class="panna-sone riktig" data-h="svar" data-v="riktig" data-stille aria-label="Riktig"></button>`
              : ""
          }
          ${r.fase !== "pause" && r.fase !== "slutt" ? `<button class="panna-pauseknapp" data-h="pause" aria-label="Pause">${PAUSE_IKON}</button>` : ""}
          <div class="panna-blink" id="panna-blink" aria-hidden="true"><div class="panna-blink-innhold"><i></i><b></b></div></div>
          ${lag}
        </div>
      </div>`;
  }

  R.start({
    id: "panna",
    versjon: 1,
    pagar, // a game is in progress (front page badge, screen kept awake)
    liggende: false, // landscape phones: this game has its own layout (a slim dock at the bottom, see spill.css)

    tilstand: () => ({
      // As many as the gang has already typed names for (in another game), else three.
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 3, 2, 20),
      oppsett: { stokker: STANDARD.slice(), ordbank: [], nivaa: 2, tid: 60, vipp: true, poeng: true, runder: 2, visOb: false },
      nesteStart: 0, // who gets the phone first in the next game with points
      spill: null,
    }),

    // A link to one deck: rusj.no/panna/#jul chooses that deck alone and opens «Gjør klart».
    // (Not while a game is running — that game comes first.)
    vedHash(S, hash) {
      const id = String(hash || "").trim().toLowerCase();
      if (pagar(S) || !/^[a-z0-9]{1,20}$/.test(id) || !stokk(id)) return null;
      S.oppsett.stokker = [id];
      S.oppsett.ordbank = [];
      return "oppsett";
    },

    lastet(S) {
      S.antall = R.klamp(Math.round(Number(S.antall)) || 3, 2, 20);
      S.nesteStart = Math.max(0, Math.round(Number(S.nesteStart)) || 0) % 20;
      const o = (S.oppsett = Object.assign({ stokker: [], ordbank: [], nivaa: 2, tid: 60, vipp: true, poeng: true, runder: 2, visOb: false }, S.oppsett));
      o.stokker = (Array.isArray(o.stokker) ? o.stokker : []).filter((id) => stokk(id));
      o.ordbank = (Array.isArray(o.ordbank) ? o.ordbank : []).filter((id) => obKat(id));
      if (!o.stokker.length && !o.ordbank.length) o.stokker = STANDARD.slice();
      if (!TIDER.includes(o.tid)) o.tid = 60;
      if (![1, 2, 3].includes(o.nivaa)) o.nivaa = 2;
      if (![1, 2, 3].includes(o.runder)) o.runder = 2;
      const sp = S.spill;
      if (sp) {
        const gyldig = (liste) => Array.isArray(liste) && liste.every((x) => x && ALLE[x.n]);
        const ok =
          Array.isArray(sp.historikk) &&
          sp.historikk.every((h) => h && gyldig(h.ord)) &&
          (!sp.poeng || (sp.antall >= 2 && sp.antall <= 20)) &&
          (!sp.runde || (gyldig(sp.runde.ord) && sp.runde.tid > 0));
        if (!ok) S.spill = null;
        // (Games saved before the first player rotated: player 1 started.)
        else sp.start = sp.poeng ? R.klamp(Math.round(Number(sp.start)) || 0, 0, sp.antall - 1) : 0;
      }
      // A reload in the middle of a round: never start the clock by itself.
      if (S.spill && S.spill.runde) {
        const r = S.spill.runde;
        if (r.fase === "slutt") {
          avsluttRunde(S);
          S.spill.skjerm = "resultat";
          if (S.skjerm === "runde") S.skjerm = "resultat";
        } else if (!r.ord.length) {
          // Interrupted before the first word: the turn isn't used up.
          S.spill.runde = null;
          S.spill.skjerm = "klar";
          if (S.skjerm === "runde") S.skjerm = "klar";
        } else {
          r.fase = "pause";
        }
      }
      // «Fortsett» must always find a screen that can be drawn.
      if (S.spill && S.spill.skjerm === "runde" && !S.spill.runde) S.spill.skjerm = "klar";
      if (!S.spill && ["klar", "runde", "resultat", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Én holder mobilen mot panna og ser ikke ordet. De andre gir hint – og du gjetter så mange ord du rekker før tiden er ute.",
      steg: [
        ["Mobilen på panna", "Snu mobilen på tvers og hold den mot panna med skjermen ut mot de andre."],
        ["De andre gir hint", "De forklarer, mimer og lager lyder – men sier aldri selve ordet."],
        ["Vipp for å svare", "Vipp ned når du har gjettet riktig, og opp for å stå over."],
      ],
      tips: [
        "Uten vipping: La en av de andre trykke – høyre side er riktig, venstre er pass.",
        "Skjermen blinker grønt for riktig og oransje for pass, så de andre ser at svaret ble talt – også når lyden er av.",
        "I «Mim det!», «Lag lyden!» og «Si det som …» gir de andre hint på én bestemt måte. Merkelappen øverst på kortet sier hvilken.",
        "Spill med én kortstokk om gangen for å samle stjerner og slå rekorden.",
        "Etter runden kan dere trykke på et ord for å rette opp en feil.",
        "På iPhone må du tillate bevegelse første gang. Trykk «Tillat» når mobilen spør.",
        "Skal bare de minste spille? Velg kortstokken «Barn».",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        liggende: true, // (the kit's landscape home: mascot left, buttons right)
        vis(S) {
          // Something to beat: the best round and the stars collected so far on this phone.
          const alle = rekorder();
          const best = besteRekord(alle);
          const st = sumStjerner(alle);
          return R.ui.spillhjem({
            slagordHtml: "Mobilen på panna. De andre gir hint.<br><em>Vipp ned når du har det!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? fortsettTekst(S.spill) : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–20", "spillere"],
              st ? [`${st} av ${STOKKER.length * 3}`, "stjerner"] : [String(STOKKER.length), "kortstokker"],
              best ? [String(best), "rekord"] : [R.tall(ALLE.length), "ord"],
            ],
          });
        },
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = antallOrd(o);
          const t = terskler(o.tid);
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Velg kortstokker</h2><span class="tall" id="ord-antall">${R.tall(n)} ord</span></div>
              ${stokkGrid(
                o,
                // (The word bank is the last tile, two tiles wide: it fills the last row of sixteen decks.)
                `<button class="panna-mer${o.ordbank.length ? " valgt" : ""}" data-h="vis-ob" aria-expanded="${!!o.visOb}">
                  <span class="panna-stokk-ikon" aria-hidden="true">📚</span><b>Flere ord fra ordbanken</b><small>${o.ordbank.length ? `${o.ordbank.length} valgt` : `${ORDBANK.length} kategorier`} <i aria-hidden="true">${o.visOb ? "▴" : "▾"}</i></small>
                </button>`,
              )}
              <p class="hjelp panna-stjernehjelp">Spill med én kortstokk for å samle stjerner: <span>★ ${t[0]}</span> · <span>★★ ${t[1]}</span> · <span>★★★ ${t[2]}</span> riktige på ${o.tid} s.</p>
              ${
                o.visOb
                  ? `<div class="boks panna-ob">
                ${R.ui.brikker(
                  "ob",
                  ORDBANK.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: antallOb(k.id, o.nivaa) })),
                  o.ordbank,
                  { alle: true, etikett: "Kategorier fra ordbanken" },
                )}
                <p class="etikett">Vanskelighet i ordbanken</p>
                ${R.ui.seg("nivaa", NIVAER, o.nivaa, { etikett: "Vanskelighet i ordbanken" })}
                <p class="hjelp">Middels tar med lette og middels ord. Vanskelig tar med alt.</p>
              </div>`
                  : ""
              }
            </section>
            <section class="seksjon">
              <h2>Tid per runde</h2>
              ${R.ui.seg(
                "tid",
                TIDER.map((t) => [t, `${t} s`]),
                o.tid,
                { etikett: "Tid per runde" },
              )}
            </section>
            ${R.ui.bryter("vipp", o.vipp, "Vipp for å svare", "Ned er riktig, opp er pass. Trykk på skjermen virker alltid.")}
            ${R.ui.bryter("poeng", o.poeng, "Tell poeng", "Ta tur med mobilen og se hvem som gjetter flest.")}
            ${
              o.poeng
                ? `${R.ui.spillere({ min: 2, max: 20, hjelp: "Navnene er valgfrie." })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Runder hver</h2><span class="tall">${R.klamp(S.antall, 2, 20) * o.runder} runder i alt</span></div>
              ${R.ui.seg(
                "runder",
                [
                  [1, "1"],
                  [2, "2"],
                  [3, "3"],
                ],
                o.runder,
                { etikett: "Runder per spiller" },
              )}
            </section>`
                : ""
            }
            ${R.ui.dokk(n ? "" : `<p class="hjelp">Velg minst én kortstokk.</p>`, R.ui.knapp("Start", "start", { av: !n }))}`;
        },
      },

      klar: {
        tittel: (S) => rundeTittel(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = spiller(sp);
          const st = vippStatus(S);
          const steg =
            st.modus === "vipp"
              ? [
                  ["📱", "Mobilen på panna", "Snu den på tvers, med skjermen ut."],
                  ["⬇️", "Vipp ned", "når du har gjettet riktig."],
                  ["⬆️", "Vipp opp", "for å stå over."],
                ]
              : [
                  ["📱", "Mobilen på panna", "Snu den på tvers, med skjermen ut."],
                  ["👆", "En av de andre trykker", "Høyre side er riktig, venstre er pass."],
                ];
          const hode = sp.poeng
            ? `${R.ui.fremdrift(sp.antall, i, ferdigeILaget(sp))}
              <div class="panna-tur">${R.avatar(i, "stor")}<div><p class="etikett">Mobilen til</p><h1 id="skjerm-tittel">${esc(R.navn(i))}</h1></div></div>`
            : `<div class="panna-tur"><div><p class="etikett">Gi mobilen til den som skal gjette</p><h1 id="skjerm-tittel">Klar for panna?</h1></div></div>`;
          return `
            <div class="panna-klar">
              <div class="panna-klar-a">${hode}${valgteStokker(S.oppsett)}${stokkTips(S)}</div>
              <div class="panna-klar-b">
                <div class="panna-forklaring">
                  ${st.modus === "vipp" ? DEMO_VIPP : DEMO_TRYKK}
                  <ol class="panna-steg">${steg.map(([ikon, b, t]) => `<li><span aria-hidden="true">${ikon}</span><p><b>${esc(b)}</b> ${esc(t)}</p></li>`).join("")}</ol>
                </div>
                ${st.html}
              </div>
            </div>
            ${R.ui.dokk(
              R.ui.knapp("Start runden", "kjor", { variant: "stor" }),
              R.ui.lenkerad(
                R.ui.lenke("Bytt kortstokk", "bytt"),
                sp.poeng && sp.historikk.length ? R.ui.lenke("Stillingen", "stilling") : "",
                R.ui.lenke("Avslutt", "avslutt"),
              ),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "klar";
          forberedVipp(S);
        },
      },

      runde: {
        tittel: "Runde",
        tilbake: async (S) => {
          const r = S.spill && S.spill.runde;
          if (!r) return "klar";
          if (r.fase !== "pause") {
            pause(S);
            return null;
          }
          // No word shown yet: back to the ready screen without using up the turn.
          if (!r.ord.length) {
            S.spill.runde = null;
            return "klar";
          }
          const fortsatt = R.vakt();
          const ja = await R.bekreft("Avslutte runden?", "Ordene dere har klart så langt, teller.", "Avslutt runden", "Spill videre");
          if (!fortsatt() || !ja || S.spill.runde !== r) return null;
          avsluttRunde(S);
          return "resultat";
        },
        vis: (S) => (S.spill && S.spill.runde ? visScene(S) : `<h1 class="vh" id="skjerm-tittel">Panna</h1>`),
        etter() {
          const scene = R.$("#panna-scene");
          if (scene) scene.dataset.rot = String(rot.na);
          tilpassOrd();
        },
        inn(S) {
          if (!S.spill || !S.spill.runde) {
            R.gaTil(S.spill ? "klar" : "hjem");
            return;
          }
          S.spill.skjerm = "runde";
          forberedVipp(S);
          // The stage covers the top bar: its buttons must not take focus from behind it
          // (pause is on the stage, and Escape pauses too).
          document.documentElement.classList.add("panna-pa-scenen");
          window.addEventListener("resize", vedStorrelse);
          document.addEventListener("visibilitychange", vedSynlighet);
          document.addEventListener("keydown", vedTast);
          R.vedForlat(ryddRunde);
          const r = S.spill.runde;
          if (nyStart) {
            nyStart = false;
            plasser(S);
          } else if (r && r.fase !== "pause") {
            pause(S);
          }
        },
      },

      resultat: {
        tittel: "Resultat",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const h = sp.historikk[sp.historikk.length - 1];
          if (!h) return `<h1 id="skjerm-tittel">Ingen runder ennå</h1>${R.ui.dokk(R.ui.knapp("Start en runde", "neste"))}`;
          const n = riktige(h);
          const pass = h.ord.length - n;
          const ferdig = sisteRunde(sp);
          const neste = ferdig
            ? R.ui.knapp("Til kåringen", "neste", { variant: "stor" })
            : R.ui.knapp(sp.poeng ? `Neste: ${R.navn(spiller(sp))}` : "Neste spiller", "neste", { variant: "stor" });
          // Record and stars: «Dyr» alone counts for Dyr; several decks count as a mix.
          const rek = rekordInfo(h, S.oppsett.tid);
          const hvor = `<span class="panna-rek-hvor">${rek.s ? `<span aria-hidden="true">${rek.s.ikon}</span> ${esc(rek.s.navn)}` : "Flere kortstokker"} · ${rek.tid} s</span>`;
          const mangler = rek.neste ? `${rek.neste - n} til for ${["én stjerne", "to stjerner", "tre stjerner"][rek.stjerner]}` : rek.s ? "Tre stjerner – full pott!" : "";
          const rekord =
            rek.rk && (rek.rekord > 0 || rek.s)
              ? `<div class="panna-rek${rek.ny ? " ny" : ""}">
                  ${rek.s ? `${stjerneHtml(rek.stjerner, "stor")}<span class="vh">${stjerneTekst(rek.stjerner)}.</span>` : ""}
                  ${rek.rekord > 0 ? `<p class="panna-rek-linje"><b>${rek.ny ? "Ny rekord!" : `Rekord ${rek.rekord}`}</b> ${hvor}</p>` : ""}
                  ${mangler ? `<p class="panna-rek-hint">${esc(mangler)}</p>` : ""}
                </div>`
              : "";
          const ordliste = h.ord.length
            ? `<ul class="panna-ordliste">${h.ord
                .map(
                  (o, k) =>
                    `<li><button class="panna-ordknapp${o.ute ? " ute" : ""}" data-h="rett" data-v="${k}" aria-pressed="${o.ok}"><span class="merke" aria-hidden="true">${o.ok ? "✓" : o.ute ? "⏱" : "✗"}</span>${esc(ALLE[o.n].t)}</button></li>`,
                )
                .join("")}</ul>`
            : `<p class="tom">Ingen ord denne gangen.</p>`;
          return `
            <div class="panna-res">
              <div class="panna-res-a">
                <div class="banner panna-banner">
                  ${h.i >= 0 ? `<p class="etikett">${R.avatar(h.i)} ${esc(R.navn(h.i))}</p>` : `<p class="etikett">${esc(`Runde ${sp.historikk.length}`)}</p>`}
                  <h1 id="skjerm-tittel"><span class="panna-stortall">${n}</span> ${n === 1 ? "riktig" : "riktige"}</h1>
                  <p class="ingress">${esc(kommentar(n, rek.tid))}${pass ? ` <span class="panna-pass-tall">${pass} pass</span>` : ""}</p>
                  ${rekord}
                </div>
                <section class="seksjon">
                  <div class="seksjon-hode"><h2>Ordene</h2><span class="tall">Trykk på et ord for å rette</span></div>
                  ${ordliste}
                  ${n > 0 ? `<div class="panna-utfordre">${R.ui.knapp2("Utfordre noen", "utfordre", { variant: "liten" })}</div>` : ""}
                </section>
              </div>
              ${
                sp.poeng
                  ? `<div class="panna-res-b"><section class="seksjon"><div class="seksjon-hode"><h2>Stillingen</h2><span class="tall">${esc(ferdig ? "Siste runde spilt" : rundeTittel(sp))}</span></div>${R.ui.poengliste(poengRader(sp, { i: h.i, n }))}</section></div>`
                  : ""
              }
            </div>
            ${R.ui.dokk(
              neste,
              R.ui.lenkerad(R.ui.lenke("Bytt kortstokk", "bytt"), ferdig ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "resultat";
          const h = S.spill.historikk[S.spill.historikk.length - 1];
          const rek = h ? rekordInfo(h, S.oppsett.tid) : null;
          const n = rek ? rek.n : 0;
          // Celebrate in proportion to the round length: the two-star line (8 in 60 s, 4 in 30 s,
          // 12 in 90 s) or a beaten record that is worth at least one star.
          if (n > 0 && (n >= terskler(rek.tid)[1] || (rek.ny && n >= terskler(rek.tid)[0]))) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (n > 0) R.lyd.pling();
          else R.lyd.pop();
          if (rek && rek.ny) R.si(`Ny rekord: ${n} riktige.`);
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = kaaring(sp);
          return `
            ${R.ui.banner({
              klasse: "aksent",
              etikett: k.vinnere.length > 1 ? "Like sterke panner" : k.vinnere.length ? "Sterkeste panne" : "Ferdig!",
              tittel: !k.vinnere.length ? "Ingen poeng denne gangen" : k.vinnere.length > 3 ? `${k.vinnere.length} spillere vinner!` : `${R.ramsOpp(k.vinnere.map((r) => R.navn(r.i)))} vinner!`,
              tekst: `${k.totalt} ord gjettet til sammen${k.best ? `. Beste runde: ${R.navn(k.best.i)} med ${riktige(k.best)} riktige.` : "."}`,
              stemning: k.vinnere.length ? "jubel" : "",
            })}
            ${R.ui.pall(k.rader)}
            ${R.ui.poengliste(k.rader)}
            ${k.vinnere.length ? R.ui.knapp2("Del kåringen", "del") : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          S.spill.skjerm = "slutt";
          R.slippVaken();
          if (poengRader(S.spill).some((r) => r.poeng > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return R.gaTil("oppsett"); // (after the crowning there is nothing to go back into)
        let mal = sp.runde ? "runde" : sp.skjerm;
        if (mal === "runde" && !sp.runde) mal = "klar"; // the round was dropped (e.g. reopened hours later)
        if (mal === "resultat" && !sp.historikk.length) mal = "klar";
        if (mal === "slutt" && !sisteRunde(sp)) mal = sp.historikk.length ? "resultat" : "klar";
        if (!["klar", "runde", "resultat", "slutt"].includes(mal)) mal = "klar";
        R.gaTil(mal);
      },

      // --- setup ---
      stokk(el, e, S) {
        const id = el.dataset.v;
        const o = S.oppsett;
        // The last deck can't be switched off: there would be no words to play with.
        if (o.stokker.length === 1 && o.stokker[0] === id && !o.ordbank.length) {
          R.toast("Velg en annen kortstokk først");
          return;
        }
        o.stokker = o.stokker.includes(id) ? o.stokker.filter((x) => x !== id) : [...o.stokker, id];
        if (el.closest("#ark")) {
          el.setAttribute("aria-pressed", String(o.stokker.includes(id)));
          const t = R.$("#bytt-antall");
          if (t) t.textContent = `${R.tall(antallOrd(o))} ord`;
          R.lagre();
          return;
        }
        R.vis();
      },
      ob(el, e, S) {
        const o = S.oppsett;
        const id = el.dataset.v;
        const forrige = o.ordbank.slice();
        if (id === "*") o.ordbank = o.ordbank.length === ORDBANK.length ? [] : ORDBANK.map((k) => k.id);
        else o.ordbank = o.ordbank.includes(id) ? o.ordbank.filter((x) => x !== id) : [...o.ordbank, id];
        if (!o.ordbank.length && !o.stokker.length) {
          o.ordbank = forrige; // never end up with nothing to play with
          R.toast("Velg en kortstokk først");
          return;
        }
        R.vis();
      },
      "vis-ob"(el, e, S) {
        S.oppsett.visOb = !S.oppsett.visOb;
        R.vis();
      },
      nivaa(el, e, S) {
        S.oppsett.nivaa = Number(el.dataset.v);
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      vipp(el, e, S) {
        S.oppsett.vipp = !S.oppsett.vipp;
        R.vis();
      },
      poeng(el, e, S) {
        S.oppsett.poeng = !S.oppsett.poeng;
        R.vis();
      },
      start(el, e, S) {
        if (!antallOrd(S.oppsett)) return;
        const o = S.oppsett;
        const antall = o.poeng ? R.klamp(S.antall, 2, 20) : 0;
        // The phone starts with a new player in every game (player 1 in the first one).
        const start = antall ? (S.nesteStart || 0) % antall : 0;
        if (antall) S.nesteStart = (start + 1) % antall;
        S.spill = { poeng: o.poeng, antall, runder: o.runder, start, historikk: [], runde: null, skjerm: "klar", ferdig: false };
        R.statistikk("start", { poeng: !!o.poeng, spillere: antall, tid: o.tid, runder: o.runder, stokker: o.stokker.length + o.ordbank.length, vipp: !!o.vipp });
        R.gaTil("klar"); // the kit keeps the screen awake while pagar(S) is true
      },

      // --- before the round ---
      tillat(el, e, S) {
        const fortsatt = R.vakt();
        const p = beOmVipp(true);
        if (p) p.then(() => fortsatt() && R.vis());
      },
      kjor(el, e, S) {
        if (!S.spill || S.spill.runde) return;
        const fortsatt = R.vakt();
        // Ask for the motion sensor and full screen right here: both need the tap.
        const p = S.oppsett.vipp ? beOmVipp(false) : null;
        fullskjerm();
        const r = (S.spill.runde = { fase: "plasser", ord: [], tid: S.oppsett.tid, igjen: S.oppsett.tid, rk: rekordNokkel(S.oppsett) });
        nyStart = true;
        Promise.resolve(p).then(() => {
          if (fortsatt() && S.spill && S.spill.runde === r) return R.gaTil("runde");
          nyStart = false;
          if (S.spill && S.spill.runde === r) S.spill.runde = null;
        });
      },

      // --- during the round ---
      svar(el, e, S) {
        svar(S, el.dataset.v === "riktig");
      },
      pause: (el, e, S) => pause(S),
      "fortsett-runde"(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r || r.fase !== "pause") return;
        const fortsatt = R.vakt();
        const p = S.oppsett.vipp ? beOmVipp(false) : null;
        fullskjerm();
        Promise.resolve(p).then(() => {
          if (!fortsatt() || !iRunde(S, r) || r.fase !== "pause") return;
          if (r.ord.length) nedtelling(S);
          else plasser(S);
        });
      },
      "avslutt-runde"(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r) return;
        if (!r.ord.length) {
          // Nothing was shown yet: cancel without using up the turn.
          S.spill.runde = null;
          R.gaTil("klar");
          return;
        }
        avsluttRunde(S);
        R.gaTil("resultat");
      },

      // --- after the round ---
      rett(el, e, S) {
        const h = S.spill.historikk[S.spill.historikk.length - 1];
        const o = h && h.ord[Number(el.dataset.v)];
        if (!o || S.spill.ferdig) return;
        o.ok = !o.ok;
        if (o.ok) R.lyd.riktig();
        lagreRekord(h, S.oppsett.tid); // the record follows the corrected round, up or down
        R.vis();
      },
      neste(el, e, S) {
        if (!pagar(S)) return;
        if (sisteRunde(S.spill)) {
          avsluttSpill(S);
          R.gaTil("slutt");
        } else R.gaTil("klar");
      },
      // «Utfordre noen»: the round as a message, with a link that opens the same deck.
      utfordre(el, e, S) {
        const sp = S.spill;
        const h = sp && sp.historikk[sp.historikk.length - 1];
        if (!h || !riktige(h)) return;
        const rek = rekordInfo(h, S.oppsett.tid);
        const hvem = h.i >= 0 ? R.navn(h.i) : "Vi";
        const hva = rek.s ? `${rek.n} i ${rek.s.ikon} ${rek.s.navn}` : `${rek.n} ${rek.n === 1 ? "riktig" : "riktige"}`;
        R.del("Panna", `${hvem} klarte ${hva} på ${rek.tid} s i Panna. Klarer du flere?`, `${location.origin}/panna/${rek.s ? "#" + rek.s.id : ""}`);
      },
      // «Del kåringen»
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.poeng) return;
        const k = kaaring(sp);
        if (!k.vinnere.length) return;
        const vinnere = k.vinnere.map((r) => R.navn(r.i));
        const andre = k.sortert.filter((r) => r.poeng < k.topp).slice(0, 5);
        const deler = [`${R.ramsOpp(vinnere)} vant Panna med ${k.topp} ${k.topp === 1 ? "riktig" : "riktige"}.`];
        if (andre.length) deler.push(`${andre.map((r) => `${R.navn(r.i)} ${r.poeng}`).join(", ")}.`);
        if (k.best) deler.push(`Beste runde: ${R.navn(k.best.i)} med ${riktige(k.best)} på ${k.best.tid || S.oppsett.tid} s.`);
        deler.push("Klarer dere flere?");
        R.del("Panna", deler.join(" "), `${location.origin}/panna/`);
      },
      bytt(el, e, S) {
        R.ark(`
          <div class="seksjon-hode"><h2 id="ark-tittel">Bytt kortstokk</h2><span class="tall" id="bytt-antall">${R.tall(antallOrd(S.oppsett))} ord</span></div>
          <p class="ingress">Velg én eller flere. Poengene beholdes.</p>
          ${stokkGrid(S.oppsett, `<p class="panna-stokkhint">Én kortstokk alene gir stjerner <span aria-hidden="true">★</span></p>`)}
          <div class="panna-ark-bunn"><button class="knapp" data-h="bytt-ferdig">Ferdig</button></div>`);
      },
      "bytt-ferdig"(el, e, S) {
        if (!antallOrd(S.oppsett)) {
          R.toast("Velg minst én kortstokk");
          return;
        }
        R.lukkArk();
        R.vis();
      },
      stilling(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">Stillingen</h2>
          <p class="ingress">${esc(rundeTittel(S.spill))}</p>
          ${R.ui.poengliste(poengRader(S.spill))}
          <button class="knapp" data-h="lukk-ark">Lukk</button>`);
      },
      // «Avslutt»: with points and at least one round played, straight to the crowning.
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        if (!pagar(S)) return;
        const medPoeng = !!(sp.poeng && sp.historikk.length);
        const ja = medPoeng
          ? await R.bekreft("Avslutte spillet?", "Dere går rett til kåringen og ser hvem som vant.", "Avslutt", "Spill videre")
          : await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || S.spill !== sp || sp.ferdig) return;
        avsluttSpill(S);
        if (medPoeng) return R.gaTil("slutt");
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
