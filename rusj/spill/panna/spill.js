/* Panna — «Gjett ordet på panna».
   One player holds the phone against the forehead and can't see the word; the others give clues.
   Tilt down = correct, tilt up = pass (DeviceOrientation, with the iOS permission prompt).
   Tap zones always work too: right half = correct, left half = pass.
   The round runs on a fixed full-screen stage. If the browser doesn't rotate (rotation lock on),
   the stage turns itself with the motion sensor so the word still reads the right way. */
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
  let H; // the actions

  // ---------- Words ----------
  // One list for everything, so the deck remembers what has been shown (across sessions).
  // Word-bank words that already exist in a themed deck are skipped.
  const ALLE = [];
  (function () {
    const sett = new Set();
    STOKKER.forEach((s) =>
      s.ord.forEach((t) => {
        sett.add(R.normaliser(t));
        ALLE.push({ k: s.id, t });
      }),
    );
    ORDBANK.forEach((kat) =>
      kat.ord.forEach((o) => {
        const nokkel = R.normaliser(o[0]);
        if (sett.has(nokkel)) return;
        sett.add(nokkel);
        ALLE.push({ k: "ob:" + kat.id, t: o[0], n: o[1] });
      }),
    );
  })();
  const kortstokk = R.kortstokk("ord", ALLE.length);
  const stokk = (id) => STOKKER.find((s) => s.id === id);
  const obKat = (id) => ORDBANK.find((k) => k.id === id);
  const iUtvalg = (o, w) => (w.k.startsWith("ob:") ? o.ordbank.includes(w.k.slice(3)) && w.n <= o.nivaa : o.stokker.includes(w.k));
  const antallOrd = (o) => ALLE.reduce((n, w) => n + (iUtvalg(o, w) ? 1 : 0), 0);
  const antallOb = (id, nivaa) => ALLE.reduce((n, w) => n + (w.k === "ob:" + id && w.n <= nivaa ? 1 : 0), 0);
  function kilde(w) {
    if (w.k.startsWith("ob:")) {
      const kat = obKat(w.k.slice(3));
      return { navn: kat ? kat.navn : "Ordbanken", ikon: kat ? kat.ikon : "📚" };
    }
    const s = stokk(w.k);
    return { navn: s.navn, ikon: s.ikon };
  }

  // ---------- Turns and points ----------
  const pagar = (S) => !!S.spill && !S.spill.ferdig; // a game that «Nytt spill» would throw away
  const navneliste = (navn) => (navn.length < 2 ? navn.join("") : navn.slice(0, -1).join(", ") + " og " + navn[navn.length - 1]);
  const spiller = (sp) => (sp.poeng ? sp.historikk.length % sp.antall : -1);
  const sisteRunde = (sp) => sp.poeng && sp.historikk.length >= sp.antall * sp.runder;
  const riktige = (h) => h.ord.filter((o) => o.ok).length;
  function poengRader(sp, pluss) {
    const sum = Array.from({ length: sp.antall }, () => 0);
    sp.historikk.forEach((h) => {
      if (h.i >= 0 && h.i < sp.antall) sum[h.i] += riktige(h);
    });
    return sum.map((poeng, i) => ({ i, poeng, pluss: pluss && pluss.i === i ? pluss.n : 0 }));
  }
  function rundeTittel(sp) {
    if (!sp) return "Panna";
    if (sp.poeng) return `Runde ${Math.min(sp.runder, Math.floor(sp.historikk.length / sp.antall) + 1)} av ${sp.runder}`;
    return `Runde ${sp.historikk.length + 1}`;
  }
  function fortsettTekst(sp) {
    if (sp.poeng && sisteRunde(sp)) return "Fortsett · se vinneren";
    if (sp.poeng) return `Fortsett · ${R.navn(spiller(sp))} står for tur`;
    return `Fortsett · runde ${sp.historikk.length + 1}`;
  }
  function kommentar(n) {
    if (n === 0) return "Panna tok seg en pause. Neste gang!";
    if (n <= 2) return "Det er lov å varme opp.";
    if (n <= 4) return "Ikke verst i det hele tatt!";
    if (n <= 6) return "Godt jobba!";
    if (n <= 9) return "Sterk panne!";
    if (n <= 12) return "Panneproff!";
    return "Er du synsk, eller?!";
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
    let i = kortstokk.neste((n) => iUtvalg(S.oppsett, ALLE[n]) && !brukt.has(n));
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
      vedTikk: () => {
        if (!klokke || !iRunde(S, r)) return;
        r.igjen = klokke.igjen;
        const scene = R.$("#panna-scene");
        if (scene) scene.classList.toggle("lite", r.igjen <= 10);
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

  function blink(riktig) {
    const el = R.$("#panna-blink");
    if (!el) return;
    el.querySelector("i").textContent = riktig ? "✓" : "»";
    el.querySelector("b").textContent = riktig ? "Riktig!" : "Pass";
    el.className = "panna-blink vis " + (riktig ? "riktig" : "pass");
    clearTimeout(blinkId);
    blinkId = setTimeout(() => el.classList.remove("vis"), 480);
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
    if (st) st.innerHTML = kildeHtml(k);
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
    R.vis();
    planlegg(() => {
      if (!iRunde(S, r)) return;
      avsluttRunde(S);
      R.gaTil("resultat");
    }, 1900);
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
    sp.historikk.push({ i: spiller(sp), ord });
    return true;
  }

  // Leaving the round in any way: stop everything that runs.
  function ryddRunde() {
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
  function stokkGrid(o) {
    return `<div class="panna-stokker" role="group" aria-label="Kortstokker">${STOKKER.map(
      (s) => `<button class="panna-stokk" data-h="stokk" data-v="${s.id}" aria-pressed="${o.stokker.includes(s.id)}" title="${esc(s.tekst)}" style="--sf: var(--${s.farge}); --sf-dyp: var(--${s.farge}-dyp)">
        <span class="panna-stokk-ikon" aria-hidden="true">${s.ikon}</span><b>${esc(s.navn)}</b><small>${s.ord.length} ord</small>
      </button>`,
    ).join("")}</div>`;
  }
  function valgteStokker(o) {
    const deler = o.stokker.map((id) => stokk(id)).filter(Boolean).map((s) => `<li>${s.ikon} ${esc(s.navn)}</li>`);
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

  const kildeHtml = (k) => `<span aria-hidden="true">${k.ikon}</span> <span class="panna-kilde-navn">${esc(k.navn)}</span>`;

  function visScene(S) {
    const r = S.spill.runde;
    const sist = gjeldende(r);
    const w = sist ? ALLE[sist.n] : null;
    const k = w ? kilde(w) : null;
    const antallRiktige = r.ord.filter((o) => o.ok).length;
    let lag = "";
    if (r.fase === "plasser" || r.fase === "nedtelling") {
      lag = `<div class="panna-lag panna-klargjor">
        ${r.fase === "nedtelling" ? `<p class="panna-tall hopp" id="panna-tall" aria-live="assertive">3</p>` : `<div class="panna-plasser-figur">${R.figur()}</div>`}
        <p class="panna-beskjed">Mobilen på panna!</p>
        <p class="panna-under">${r.fase === "nedtelling" && r.ord.length ? "Gjør deg klar …" : "Skjermen skal peke ut mot de andre."}</p>
      </div>`;
    } else if (r.fase === "pause") {
      const startet = r.ord.length > 0;
      lag = `<div class="panna-lag panna-pause" role="dialog" aria-labelledby="panna-pause-tittel">
        <h2 id="panna-pause-tittel">Pause</h2>
        <p class="panna-under">${startet ? `${Math.ceil(r.igjen)} s igjen · ${antallRiktige} ${antallRiktige === 1 ? "riktig" : "riktige"}` : "Runden har ikke startet ennå."}</p>
        <div class="panna-pause-knapper">${R.ui.knapp2(startet ? "Avslutt runden" : "Avbryt", "avslutt-runde")}${R.ui.knapp(startet ? "Fortsett" : "Start", "fortsett-runde", { ikon: "▶" })}</div>
      </div>`;
    } else if (r.fase === "slutt") {
      lag = `<div class="panna-lag panna-ute"><p class="panna-ute-tekst">Tiden er ute!</p><p class="panna-under">${antallRiktige} ${antallRiktige === 1 ? "riktig" : "riktige"}</p></div>`;
    }
    const spilles = r.fase === "spill";
    return `
      <h1 class="vh" id="skjerm-tittel">Panna – runden er i gang</h1>
      <div class="panna-scene${r.igjen <= 10 ? " lite" : ""}${S.oppsett.vipp && Vipp.status === "aktiv" ? " vipp" : ""}" id="panna-scene" data-fase="${r.fase}" data-rot="${rot.na}">
        <div class="panna-flate">
          <div class="panna-kort">
            <div class="panna-topp">
              <span class="panna-kilde" id="panna-kilde">${k ? kildeHtml(k) : ""}</span>
              <span class="panna-poeng" id="panna-poeng">✓ ${antallRiktige}</span>
              <span class="panna-tid" id="panna-tid" aria-label="Sekunder igjen"><span class="timer-tid">${Math.ceil(r.igjen)}</span></span>
            </div>
            <div class="panna-ordboks"><p class="panna-ord" id="panna-ord" aria-live="polite">${w && (spilles || r.fase === "slutt") ? esc(w.t) : ""}</p></div>
            <div class="panna-bunn" aria-hidden="true"><span class="pass">◀ Pass</span><span class="riktig">Riktig ▶</span></div>
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

    tilstand: () => ({
      antall: 3,
      oppsett: { stokker: STANDARD.slice(), ordbank: [], nivaa: 2, tid: 60, vipp: true, poeng: true, runder: 2, visOb: false },
      spill: null,
    }),

    lastet(S) {
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
        "Etter runden kan dere trykke på et ord for å rette opp en feil.",
        "På iPhone må du tillate bevegelse første gang. Trykk «Tillat» når mobilen spør.",
        "Skal bare de minste spille? Velg kortstokken «Barn».",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Mobilen på panna. De andre gir hint.<br><em>Vipp ned når du har det!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: S.spill ? fortsettTekst(S.spill) : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–20", "spillere"],
              [String(STOKKER.length), "kortstokker"],
              [R.tall(ALLE.length), "ord"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = antallOrd(o);
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Velg kortstokker</h2><span class="tall" id="ord-antall">${R.tall(n)} ord</span></div>
              ${stokkGrid(o)}
              <button class="panna-mer" data-h="vis-ob" aria-expanded="${!!o.visOb}">
                <span aria-hidden="true">📚</span> Flere ord fra ordbanken${o.ordbank.length ? ` · ${o.ordbank.length} valgt` : ""}<i aria-hidden="true">${o.visOb ? "▴" : "▾"}</i>
              </button>
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
            ? `${R.ui.fremdrift(sp.antall, i)}
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
              R.ui.knapp("Start runden", "kjor", { variant: "stor", ikon: "▶" }),
              R.ui.lenkerad(R.ui.lenke("Bytt kortstokk", "bytt"), sp.poeng && sp.historikk.length ? R.ui.lenke("Se stillingen", "stilling") : ""),
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
            ? R.ui.knapp("Se vinneren", "neste", { variant: "stor", ikon: "🏆" })
            : R.ui.knapp(sp.poeng ? `Neste: ${R.navn(spiller(sp))}` : "Neste spiller", "neste", { variant: "stor" });
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
                  <p class="ingress">${esc(kommentar(n))}${pass ? ` <span class="panna-pass-tall">${pass} pass</span>` : ""}</p>
                </div>
                <section class="seksjon">
                  <div class="seksjon-hode"><h2>Ordene</h2><span class="tall">Trykk på et ord for å rette</span></div>
                  ${ordliste}
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
          const n = h ? riktige(h) : 0;
          if (n >= 8) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (n > 0) R.lyd.pling();
          else R.lyd.pop();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = poengRader(sp);
          const sortert = rader.slice().sort((a, b) => b.poeng - a.poeng);
          const topp = sortert[0] ? sortert[0].poeng : 0;
          const vinnere = sortert.filter((r) => r.poeng === topp && topp > 0);
          const best = sp.historikk.reduce((b, h) => (h.i >= 0 && (!b || riktige(h) > riktige(b)) ? h : b), null);
          const totalt = sp.historikk.reduce((s, h) => s + riktige(h), 0);
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${vinnere.length > 1 ? "Like sterke panner" : vinnere.length ? "Sterkeste panne" : "Ferdig!"}</p>
              <h1 id="skjerm-tittel">${vinnere.length ? `${esc(navneliste(vinnere.map((r) => R.navn(r.i))))} vinner!` : "Ingen poeng denne gangen"}</h1>
              <p class="ingress">${totalt} ord gjettet til sammen${best && riktige(best) ? `. Beste runde: ${esc(R.navn(best.i))} med ${riktige(best)} riktige.` : "."}</p>
            </div>
            ${R.ui.pall(rader)}
            ${R.ui.poengliste(rader)}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          S.spill.skjerm = "slutt";
          S.spill.ferdig = true;
          R.slippVaken();
          if (poengRader(S.spill).some((r) => r.poeng > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          }
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
        if (!sp) return R.gaTil("oppsett");
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
        S.spill = { poeng: o.poeng, antall: o.poeng ? R.klamp(S.antall, 2, 20) : 0, runder: o.runder, historikk: [], runde: null, skjerm: "klar" };
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
        const r = (S.spill.runde = { fase: "plasser", ord: [], tid: S.oppsett.tid, igjen: S.oppsett.tid });
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
        if (!o) return;
        o.ok = !o.ok;
        if (o.ok) R.lyd.riktig();
        R.vis();
      },
      neste(el, e, S) {
        if (sisteRunde(S.spill)) R.gaTil("slutt");
        else R.gaTil("klar");
      },
      bytt(el, e, S) {
        R.ark(`
          <div class="seksjon-hode"><h2 id="ark-tittel">Bytt kortstokk</h2><span class="tall" id="bytt-antall">${R.tall(antallOrd(S.oppsett))} ord</span></div>
          <p class="ingress">Velg én eller flere. Poengene beholdes.</p>
          ${stokkGrid(S.oppsett)}
          <button class="knapp" data-h="bytt-ferdig">Ferdig</button>`);
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
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const medPoeng = S.spill && S.spill.poeng;
        const ja = medPoeng
          ? await R.bekreft("Avslutte spillet?", "Dere går rett til kåringen og ser hvem som vant.", "Avslutt", "Spill videre")
          : await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || !S.spill) return;
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
