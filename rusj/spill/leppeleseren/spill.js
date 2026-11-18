/* Leppeleseren — «Les leppene» (the headphone lip-reading game).
   The listener wears headphones plugged into this phone, and the phone plays loud party music made
   right here (Web Audio: drums, bass, chords and a hook, plus an optional layer of noise). The phone
   lies between the two with the screen towards the reader, who says the phrase on the screen with
   big mouth movements. The listener guesses aloud. One tap per phrase («Riktig!» or «Hopp over»)
   for 60 s; then a check list where a wrong tap is corrected.
   Alle mot alle: player i reads to player i + 1, round and round; the reader and the listener both
   get a point for every phrase guessed. Lag mot lag: the teams take turns, the team gets the points.
   The rules and the music's pattern maker at the top are pure (no kit, no audio);
   test/leppeleseren.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- The rules (no kit needed) ----------

  const TID = 60; // seconds per turn
  const MIN = 2;
  const MAKS = 12;
  const MODUSER = ["par", "lag"];
  const RUNDER = { par: [1, 2, 3], lag: [2, 3, 5] };
  const LAG = [2, 3, 4];
  const stdRunder = (modus, antall) => (modus === "lag" ? 3 : antall <= 4 ? 2 : 1);

  // A new game. o: { modus, antall, lag, runder }; start: who reads first (rotates from game to game).
  function ny(o, start) {
    const modus = MODUSER.includes(o.modus) ? o.modus : "par";
    const n = modus === "lag" ? o.lag : o.antall;
    return {
      modus,
      antall: o.antall,
      lag: o.lag,
      n,
      runder: o.runder,
      turer: o.runder * n,
      tur: 0,
      start: ((start || 0) % n + n) % n,
      poeng: Array(n).fill(0),
      runde: null, // the turn being played: { ord: [{ k, s, u }], ute }
      igjen: TID,
      pause: false,
      talt: -1, // the last turn whose points are counted
      logg: [],
      ferdig: false,
    };
  }
  // Par: the reader and the listener of the turn (the listener is the next player round the table).
  // Lag: lagNa is the team whose turn it is.
  const leser = (sp) => (sp.start + sp.tur) % sp.n;
  const lytter = (sp) => (sp.start + sp.tur + 1) % sp.n;
  const lagNa = leser;
  const nesteLeser = (sp) => (sp.start + sp.tur + 1) % sp.n;
  const nesteLytter = (sp) => (sp.start + sp.tur + 2) % sp.n;
  const rundeNr = (sp) => Math.floor(sp.tur / sp.n) + 1;
  const sisteTur = (sp) => sp.tur + 1 >= sp.turer;
  // The phrase on screen (not answered yet), if any.
  const ubesvart = (r) => {
    const w = r && r.ord[r.ord.length - 1];
    return w && w.s === null ? w : null;
  };
  const riktige = (sp) => (sp.runde ? sp.runde.ord.filter((w) => w.s === 1).length : 0);

  // The clock starts: the first phrase goes on the screen. trekk() gives a phrase index.
  function startTur(sp, trekk) {
    if (sp.ferdig) return false;
    if (!sp.runde) {
      sp.runde = { ord: [{ k: trekk(), s: null }], ute: false };
      sp.igjen = TID;
    }
    sp.pause = false;
    return true;
  }
  // One phrase answered; the next one is on the screen at once.
  function svar(sp, riktig, trekk) {
    const r = sp.runde;
    const w = ubesvart(r);
    if (!r || r.ute || !w) return false;
    w.s = riktig ? 1 : 0;
    r.ord.push({ k: trekk(), s: null });
    return true;
  }
  // «Angre»: the last answer is taken back, and its phrase is on the screen again.
  function angre(sp) {
    const r = sp.runde;
    if (!r || r.ute || r.ord.length < 2 || !ubesvart(r)) return false;
    r.ord.pop();
    const w = r.ord[r.ord.length - 1];
    w.s = null;
    delete w.u;
    return true;
  }
  const kanAngre = (sp) => !!(sp.runde && !sp.runde.ute && sp.runde.ord.length > 1);
  // Time is up: the phrase on screen was not guessed (the check list can still say it was).
  function tidUte(sp) {
    const r = sp.runde;
    if (!r || r.ute) return false;
    const w = ubesvart(r);
    if (w) {
      w.s = 0;
      w.u = true;
    }
    r.ute = true;
    sp.igjen = 0;
    sp.pause = false;
    return true;
  }
  // The check list: a wrong tap is corrected (until the turn is counted).
  function veksle(sp, i) {
    const r = sp.runde;
    if (!r || !r.ute || sp.talt === sp.tur) return false;
    const w = r.ord[i];
    if (!w || w.s === null) return false;
    w.s = w.s === 1 ? 0 : 1;
    return true;
  }
  // Who gets what for the turn on screen: [[index, points], …]. Counted when the turn is left.
  function turPluss(sp) {
    const n = riktige(sp);
    if (!n) return [];
    return sp.modus === "lag" ? [[lagNa(sp), n]] : [[leser(sp), n], [lytter(sp), n]];
  }
  function fullforTur(sp) {
    if (!sp.runde || sp.talt === sp.tur) return false;
    turPluss(sp).forEach(([i, p]) => (sp.poeng[i] += p));
    sp.logg.push(sp.modus === "lag" ? { lag: lagNa(sp), riktige: riktige(sp) } : { leser: leser(sp), lytter: lytter(sp), riktige: riktige(sp) });
    sp.logg = sp.logg.slice(-60);
    sp.talt = sp.tur;
    return true;
  }
  // The next turn, or the end.
  function neste(sp) {
    if (!sp.runde || !sp.runde.ute) return null;
    fullforTur(sp);
    if (sisteTur(sp)) {
      sp.ferdig = true;
      return "slutt";
    }
    sp.tur += 1;
    sp.runde = null;
    sp.igjen = TID;
    sp.pause = false;
    return "klar";
  }
  // Score rows (as R.ui.poengliste wants them); medTur adds the turn on screen as «+n».
  function rader(sp, medTur) {
    const pluss = {};
    if (medTur && sp.talt !== sp.tur) turPluss(sp).forEach(([i, p]) => (pluss[i] = p));
    return sp.poeng.map((poeng, i) => {
      const p = pluss[i] || 0;
      const rad = sp.modus === "lag" ? { lag: i } : { i };
      rad.poeng = poeng + p;
      if (p) rad.pluss = p;
      return rad;
    });
  }
  const toppen = (sp) => {
    const best = Math.max(...sp.poeng);
    return best > 0 ? sp.poeng.map((p, i) => (p === best ? i : -1)).filter((i) => i >= 0) : [];
  };
  const besteTur = (sp) => sp.logg.reduce((a, l) => (l.riktige > 0 && (!a || l.riktige > a.riktige) ? l : a), null);

  // ---------- The music: patterns (pure) ----------
  // Every style is a loop of four bars of sixteen steps in A minor (Am – F – C – G). hendelser()
  // says what plays on a step; the player turns that into sound. Times are always computed from
  // the start time and the step number (never added up), so the beat cannot drift.

  const BARER = 4;
  const STEG = 16;
  const AKKORDER = [
    [57, 60, 64], // Am
    [57, 60, 65], // F
    [55, 60, 64], // C
    [55, 59, 62], // G
  ];
  const BASS = [45, 41, 48, 43]; // A, F, C, G
  const STILER = {
    disko: {
      bpm: 118,
      kick: "x...x...x...x...",
      snare: "....x.......x...",
      hatt: "c.o.c.o.c.o.c.o.",
      bass: "r.o.r.o.r.o.r.o.",
      akkord: "..x...x...x...x.",
      akkordLengde: 1,
      melodi: [
        [[0, 76, 2], [3, 74, 1], [4, 72, 2], [6, 74, 2], [8, 76, 3], [12, 79, 2], [14, 76, 2]],
        [[0, 77, 2], [3, 76, 1], [4, 74, 2], [6, 72, 2], [8, 69, 4], [14, 72, 2]],
        [[0, 72, 2], [3, 74, 1], [4, 76, 2], [6, 79, 2], [8, 76, 3], [12, 74, 2], [14, 72, 2]],
        [[0, 74, 2], [2, 71, 2], [4, 74, 2], [6, 76, 2], [8, 74, 6]],
      ],
    },
    rock: {
      bpm: 136,
      kick: "x.....x.x.....x.",
      snare: "....x.......x...",
      hatt: "c.c.c.c.c.c.c.c.",
      bass: "r.r.r.r.r.r.r.rr",
      akkord: "x.......x.......",
      akkordLengde: 8,
      kraft: true, // power chords: root and fifth, gritty
      melodi: [
        [[0, 69, 3], [3, 72, 3], [6, 74, 2], [8, 76, 4], [12, 74, 2], [14, 72, 2]],
        [[0, 72, 3], [3, 69, 3], [6, 72, 2], [8, 77, 4], [12, 76, 4]],
        [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 74, 4], [12, 72, 4]],
        [[0, 74, 3], [3, 71, 3], [6, 67, 2], [8, 71, 8]],
      ],
    },
    turbo: {
      bpm: 128,
      kick: "x...x...x...x...",
      snare: "....x.......x...",
      hatt: "ccocccocccocccoc",
      bass: "..r...r...r...r.",
      akkord: "x...............",
      akkordLengde: 16,
      arpeggio: true, // a sixteenth-note arpeggio over the chord
      melodi: null,
    },
  };
  const STIL_IDER = Object.keys(STILER);
  const stegSek = (stil) => 60 / STILER[stil].bpm / 4;
  // When step n sounds, for a loop that started at t0.
  const stegTid = (stil, t0, n) => t0 + n * stegSek(stil);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // What plays on step n (any n ≥ 0; the loop repeats every 64 steps).
  function hendelser(stil, n) {
    const s = STILER[stil] || STILER.disko;
    const bar = Math.floor(n / STEG) % BARER;
    const i = ((n % STEG) + STEG) % STEG;
    const ut = [];
    if (s.kick[i] === "x") ut.push({ i: "kick" });
    if (s.snare[i] === "x") ut.push({ i: s.arpeggio ? "klapp" : "snare" });
    if (s.hatt[i] === "c" || s.hatt[i] === "o") ut.push({ i: "hatt", apen: s.hatt[i] === "o" });
    if (s.bass[i] === "r" || s.bass[i] === "o") ut.push({ i: "bass", m: BASS[bar] + (s.bass[i] === "o" ? 12 : 0), l: 1.6 });
    if (s.akkord[i] === "x") {
      const a = AKKORDER[bar];
      ut.push({ i: "akkord", m: s.kraft ? [BASS[bar] + 12, BASS[bar] + 19, BASS[bar] + 24] : a, l: s.akkordLengde, kraft: !!s.kraft });
    }
    if (s.arpeggio) {
      const a = AKKORDER[bar];
      ut.push({ i: "melodi", m: a[i % 3] + (i % 6 < 3 ? 12 : 24), l: 0.7, arp: true });
    }
    if (s.melodi) for (const [steg, m, l] of s.melodi[bar]) if (steg === i) ut.push({ i: "melodi", m, l });
    return ut;
  }
  // Everything due before tid, from step fra on: { liste: [{ t, n, i, … }], neste }.
  function planlegg(stil, t0, fra, til) {
    const liste = [];
    let n = fra;
    while (stegTid(stil, t0, n) < til) {
      const t = stegTid(stil, t0, n);
      for (const e of hendelser(stil, n)) liste.push(Object.assign({ t, n }, e));
      n += 1;
    }
    return { liste, neste: n };
  }

  // The volume: the slider gives 0–100; the gain never goes above MAKS_GAIN, after a compressor and
  // a limiter, whatever the slider or the saved state says.
  const MAKS_GAIN = 0.8;
  const STD_VOLUM = 60;
  function trygtVolum(v) {
    const x = Number(v);
    const andel = Number.isFinite(x) ? Math.min(1, Math.max(0, x / 100)) : STD_VOLUM / 100;
    return MAKS_GAIN * Math.pow(andel, 1.5);
  }
  // Pink noise (Paul Kellet's filter) for the optional «sus» layer; rng gives 0…1.
  function rosaStoy(lengde, rng) {
    const ut = new Float32Array(lengde);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < lengde; i++) {
      const w = rng() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      ut[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    let topp = 0;
    for (let i = 0; i < lengde; i++) topp = Math.max(topp, Math.abs(ut[i]));
    if (topp > 0.95) for (let i = 0; i < lengde; i++) ut[i] *= 0.95 / topp;
    return ut;
  }

  const R = window.Rusj;
  if (!R) {
    window.Leppeleseren = {
      TID, MIN, MAKS, RUNDER, LAG, stdRunder, ny, leser, lytter, lagNa, nesteLeser, nesteLytter, rundeNr, sisteTur, ubesvart, riktige,
      startTur, svar, angre, kanAngre, tidUte, veksle, turPluss, fullforTur, neste, rader, toppen, besteTur,
      STILER, STIL_IDER, BARER, STEG, stegSek, stegTid, mtof, hendelser, planlegg, MAKS_GAIN, STD_VOLUM, trygtVolum, rosaStoy,
    };
    return;
  }

  // ---------- The music player (the game's own AudioContext) ----------
  // Not the kit's R.lyd: the kit's sound switch must not silence the music this game needs. The
  // game's own «Musikk» choice decides. Started only from a tap (iPhone), stopped on every way out.

  const Musikk = (() => {
    let ac = null;
    let utgang = null; // compressor → limiter → master (≤ MAKS_GAIN) → speakers/headphones
    let master = null;
    let buss = null; // one bus per run: stopping disconnects it, so nothing scheduled plays later
    let stoyLag = null;
    let hvit = null;
    let rosa = null;
    let intervall = null;
    let stil = "disko";
    let t0 = 0;
    let n = 0;
    let pa = false;

    function flagg() {
      const h = document.documentElement;
      h.dataset.lpMusikk = pa ? "pa" : "av";
      h.dataset.lpAc = ac ? ac.state : "ingen";
    }
    function kontekst() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          try {
            if (navigator.audioSession) navigator.audioSession.type = "playback"; // iPhone: past the silent switch
          } catch (e) {
            /* not supported */
          }
          ac = new AC();
          const komp = ac.createDynamicsCompressor();
          komp.threshold.value = -20;
          komp.knee.value = 8;
          komp.ratio.value = 4;
          komp.attack.value = 0.005;
          komp.release.value = 0.15;
          const grense = ac.createDynamicsCompressor();
          grense.threshold.value = -6;
          grense.knee.value = 0;
          grense.ratio.value = 20;
          grense.attack.value = 0.001;
          grense.release.value = 0.08;
          master = ac.createGain();
          master.gain.value = 0;
          komp.connect(grense).connect(master).connect(ac.destination);
          utgang = komp;
          hvit = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
          const d = hvit.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          ac.onstatechange = flagg;
        }
        if (ac.state !== "running") ac.resume().catch(() => {});
        return ac;
      } catch (e) {
        return null;
      }
    }

    // ---- Instruments ----
    function env(g, t, topp, a, slipp) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(topp, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + slipp);
    }
    function stoyKilde(t, varighet) {
      const k = ac.createBufferSource();
      k.buffer = hvit;
      k.start(t, Math.random() * 0.5);
      k.stop(t + varighet);
      return k;
    }
    function osc(type, f, t, varighet, detune) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (detune) o.detune.setValueAtTime(detune, t);
      o.start(t);
      o.stop(t + varighet + 0.05);
      return o;
    }
    function spill(e, t, steg) {
      const b = buss;
      switch (e.i) {
        case "kick": {
          const o = osc("sine", 160, t, 0.34);
          o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
          const g = ac.createGain();
          env(g, t, 0.95, 0.003, 0.3);
          o.connect(g).connect(b);
          break;
        }
        case "snare":
        case "klapp": {
          const k = stoyKilde(t, 0.22);
          const f = ac.createBiquadFilter();
          f.type = e.i === "klapp" ? "bandpass" : "highpass";
          f.frequency.value = e.i === "klapp" ? 1400 : 1600;
          const g = ac.createGain();
          env(g, t, e.i === "klapp" ? 0.6 : 0.45, 0.002, e.i === "klapp" ? 0.14 : 0.17);
          k.connect(f).connect(g).connect(b);
          if (e.i === "snare") {
            const o = osc("triangle", 190, t, 0.1);
            const g2 = ac.createGain();
            env(g2, t, 0.25, 0.002, 0.08);
            o.connect(g2).connect(b);
          }
          break;
        }
        case "hatt": {
          const lang = e.apen ? 0.18 : 0.035;
          const k = stoyKilde(t, lang + 0.02);
          const f = ac.createBiquadFilter();
          f.type = "highpass";
          f.frequency.value = 7500;
          const g = ac.createGain();
          env(g, t, e.apen ? 0.12 : 0.15, 0.001, lang);
          k.connect(f).connect(g).connect(b);
          break;
        }
        case "bass": {
          const lengde = e.l * steg;
          const o = osc("sawtooth", mtof(e.m), t, lengde);
          const f = ac.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.setValueAtTime(900, t);
          f.frequency.exponentialRampToValueAtTime(260, t + lengde);
          const g = ac.createGain();
          env(g, t, 0.34, 0.004, lengde);
          o.connect(f).connect(g).connect(b);
          break;
        }
        case "akkord": {
          const lengde = e.l * steg;
          const f = ac.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.value = e.kraft ? 1800 : 2600;
          const g = ac.createGain();
          env(g, t, e.kraft ? 0.12 : 0.09, 0.006, lengde);
          f.connect(g).connect(b);
          for (const m of e.m) {
            osc(e.kraft ? "square" : "sawtooth", mtof(m), t, lengde, -7).connect(f);
            osc("sawtooth", mtof(m), t, lengde, 7).connect(f);
          }
          break;
        }
        case "melodi": {
          const lengde = e.l * steg;
          const o = osc(e.arp ? "triangle" : "square", mtof(e.m), t, lengde);
          const f = ac.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.value = 3200;
          const g = ac.createGain();
          env(g, t, e.arp ? 0.1 : 0.085, 0.004, lengde);
          o.connect(f).connect(g).connect(b);
          break;
        }
      }
    }
    // Look-ahead scheduling: every 25 ms, put everything due in the next 150 ms on the clock.
    function plan() {
      if (!pa || !ac) return;
      const ut = planlegg(stil, t0, n, ac.currentTime + 0.15);
      const s = stegSek(stil);
      for (const e of ut.liste) {
        if (e.t < ac.currentTime - 0.02) continue; // late (the tab was throttled): skip, don't pile up
        try {
          spill(e, e.t, s);
        } catch (feil) {
          /* one note less */
        }
      }
      n = ut.neste;
    }
    function stoy(paa) {
      if (!ac || !buss) return;
      if (stoyLag) {
        try {
          stoyLag.stop();
        } catch (e) {
          /* already stopped */
        }
        stoyLag = null;
      }
      if (!paa) return;
      if (!rosa) {
        rosa = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
        rosa.getChannelData(0).set(rosaStoy(rosa.length, Math.random));
      }
      const k = ac.createBufferSource();
      k.buffer = rosa;
      k.loop = true;
      const g = ac.createGain();
      g.gain.value = 0.35;
      k.connect(g).connect(buss);
      k.start();
      stoyLag = k;
    }
    return {
      // From a tap only (iPhone).
      start(nyStil, volum, medStoy) {
        const c = kontekst();
        if (!c) return false;
        stil = STILER[nyStil] ? nyStil : "disko";
        if (pa) {
          this.volum(volum);
          stoy(medStoy);
          return true;
        }
        buss = c.createGain();
        buss.connect(utgang);
        master.gain.cancelScheduledValues(c.currentTime);
        master.gain.setValueAtTime(0.0001, c.currentTime);
        master.gain.linearRampToValueAtTime(trygtVolum(volum), c.currentTime + 0.25);
        t0 = c.currentTime + 0.08;
        n = 0;
        pa = true;
        stoy(medStoy);
        clearInterval(intervall);
        intervall = setInterval(plan, 25);
        plan();
        flagg();
        return true;
      },
      stopp() {
        if (!pa) return;
        pa = false;
        clearInterval(intervall);
        intervall = null;
        stoy(false);
        const b = buss;
        buss = null;
        if (ac && master) {
          const na = ac.currentTime;
          master.gain.cancelScheduledValues(na);
          master.gain.setValueAtTime(master.gain.value, na);
          master.gain.linearRampToValueAtTime(0, na + 0.06);
        }
        setTimeout(() => {
          try {
            if (b) b.disconnect();
          } catch (e) {
            /* gone */
          }
        }, 90);
        flagg();
      },
      volum(v) {
        if (!ac || !master || !pa) return;
        const na = ac.currentTime;
        master.gain.cancelScheduledValues(na);
        master.gain.setTargetAtTime(trygtVolum(v), na, 0.05);
      },
      stil(nyStil) {
        if (!STILER[nyStil] || nyStil === stil) return;
        stil = nyStil;
        if (pa && ac) {
          // The new style starts on the next step in time with the clock.
          t0 = ac.currentTime + 0.05;
          n = 0;
        }
      },
      stoy,
      get spiller() {
        return pa;
      },
    };
  })();

  // ---------- The game ----------

  const FRASER = window.RUSJ_DATA.fraser;
  const esc = R.esc;
  const stokk = R.kortstokk("fraser", FRASER.length);
  const trekk = () => {
    const k = stokk.neste();
    return k >= 0 && FRASER[k] ? k : R.heltall(0, FRASER.length - 1);
  };
  const STIL_NAVN = { disko: R.t("Disko"), rock: R.t("Rock"), turbo: R.t("Turbo") };
  const LAGDYP = ["var(--rosa-dyp)", "var(--lampe-dyp)", "var(--himmel-dyp)", "var(--mynte-dyp)"];
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const navn = (sp, i) => (sp.modus === "lag" ? R.lagNavn(i) : R.navn(i));
  const turTittel = (S) => R.t("Tur {n} av {av}", { n: S.spill.tur + 1, av: S.spill.turer });
  const fet = (tekst, verdier) => esc(tekst).replace(/\{(\w+)\}/g, (_, k) => `<b>${esc(verdier[k])}</b>`);

  let H; // the actions, so one action can reuse another
  let startetNa = false; // the turn screen was entered from the countdown: start the clock
  let tilSpill = false; // klar → spill: keep the music going across the screen change
  let opptatt = false; // the countdown runs
  let blink = ""; // flash the card on the next draw ("riktig" | "hopp")
  let sistSvar = -1e9;
  let feire = false;
  let rekordTur = -1; // the turn whose new record has had its confetti

  function standardAntall() {
    const lagret = R.felles.navn.filter((x) => String(x || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS);
  }
  const runderNa = (S) => (S.runder && S.runder[S.modus] != null ? S.runder[S.modus] : stdRunder(S.modus, S.antall));
  const deltakereNa = (S) => (S.modus === "lag" ? S.lag : R.klamp(S.antall, MIN, MAKS));
  function estimat(S) {
    const turer = runderNa(S) * deltakereNa(S);
    return R.t("{turer} · ca. {n} min", { turer: R.flertall(turer, "tur", "turer"), n: Math.max(2, Math.round((turer * (TID + 45)) / 60)) });
  }

  // ---------- Record (this phone) ----------
  const lesRekord = () => {
    const r = R.les("leppeleseren.rekord", {}) || {};
    return Number(r.beste) > 0 ? Math.floor(Number(r.beste)) : 0;
  };
  function lagreRekord(n) {
    if (n > lesRekord()) R.skriv("leppeleseren.rekord", { beste: n });
  }

  // ---------- Music on/off ----------
  const musikkPa = (S) => S.musikk !== false;
  function startMusikk(S) {
    if (musikkPa(S)) Musikk.start(S.stil, S.volum, S.stoy);
  }

  // ---------- The clock ----------
  const klokke = () => R.timer("lp-tid");
  function lagKlokke(S) {
    const sp = S.spill;
    const tur = sp.tur;
    const gjelder = () => S.spill === sp && sp.tur === tur && sp.runde && !sp.runde.ute;
    const t = new R.Timer({
      id: "lp-tid",
      sekunder: Math.max(1, sp.igjen),
      visning: "sek",
      vedTikk: (sek) => {
        if (gjelder()) {
          sp.igjen = sek;
          R.lagre();
        }
      },
      vedSlutt: () => {
        if (!gjelder()) return;
        Musikk.stopp();
        tidUte(sp);
        R.gaTil("sjekk");
      },
    });
    t.total = TID;
    return t;
  }
  function pauseTur(S) {
    const sp = S.spill;
    Musikk.stopp();
    if (!sp || !sp.runde || sp.runde.ute || sp.pause) return;
    const t = klokke();
    if (t) {
      t.pause();
      sp.igjen = Math.max(1, Math.ceil(t.igjen));
    }
    sp.pause = true;
    if (S.skjerm === "spill") R.vis();
  }
  // A phone that is locked or switches app: the music stops, a turn pauses.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    const S = R.S;
    if (S && S.skjerm === "spill") pauseTur(S);
    else Musikk.stopp();
  });
  window.addEventListener("pagehide", () => Musikk.stopp());

  // «Riktig!» or «Hopp over» during the turn.
  function svarTrykk(S, ok) {
    const sp = S.spill;
    if (!pagar(S) || sp.pause) return;
    const na = performance.now();
    if (na - sistSvar < 350) return; // a nervous double tap must not burn the next phrase
    if (!svar(sp, ok, trekk)) return;
    sistSvar = na;
    if (ok) {
      R.lyd.riktig();
      R.vibrer(25);
    } else {
      R.lyd.sveip();
      R.vibrer(10);
    }
    blink = ok ? "riktig" : "hopp";
    R.vis();
  }

  // Once per game, when it is over: statistics and the evening's scoreboard.
  function avsluttSpill(S) {
    const sp = S.spill;
    Musikk.stopp();
    if (!sp || sp.avsluttet) return;
    if (sp.runde) {
      tidUte(sp);
      fullforTur(sp);
    }
    sp.ferdig = true;
    sp.avsluttet = true;
    feire = true;
    R.slippVaken();
    R.statistikk("ferdig", { modus: sp.modus, deltakere: sp.n, turer: sp.logg.length, riktige: sp.logg.reduce((s, l) => s + l.riktige, 0) });
    if (sp.logg.length) R.kveld.registrer(rader(sp).map((r) => (sp.modus === "lag" ? { lag: r.lag, poeng: r.poeng } : { i: r.i, poeng: r.poeng })));
  }

  // ---------- Pieces ----------

  function lagFigur(i) {
    return `<span class="lp-lagfigur" style="--lf: ${R.LAG[i % 4].farge}; --lf-dyp: ${LAGDYP[i % 4]}">${R.figur(null, "")}</span>`;
  }
  // Who reads and who listens this turn (or which team).
  function hvemHtml(sp, stor) {
    if (sp.modus === "lag") {
      const l = lagNa(sp);
      return `<div class="lp-hvem lag">${lagFigur(l)}<p><b>${esc(R.lagNavn(l))}</b><span>${esc(R.t("Én leser, én lytter. Bytt på!"))}</span></p></div>`;
    }
    const a = leser(sp);
    const b = lytter(sp);
    return `<div class="lp-hvem${stor ? " stor" : ""}">
      <div class="lp-rolle">${R.avatar(a, stor ? "stor" : "mid")}<p><span class="lp-rolle-ikon" aria-hidden="true">👄</span><b>${esc(R.navn(a))}</b><span>${esc(R.t("leser"))}</span></p></div>
      <div class="lp-rolle lytter">${R.avatar(b, stor ? "stor" : "mid")}<p><span class="lp-rolle-ikon" aria-hidden="true">🎧</span><b>${esc(R.navn(b))}</b><span>${esc(R.t("lytter"))}</span></p></div>
    </div>`;
  }
  const varsel = () => `<p class="lp-varsel" role="note"><span aria-hidden="true">⚠️</span> <span>${esc(R.t("Skru ned hvis det gjør vondt – musikken skal bare overdøve."))}</span></p>`;
  const trengerHtml = () => `<p class="papirboks lp-trenger"><span aria-hidden="true">🎧</span> <span>${fet(R.t("Dere trenger: {ting}"), { ting: R.t("hodetelefoner til mobilen") })} ${esc(R.t("Med ledning eller Bluetooth."))}</span></p>`;
  const musikkPille = (S) =>
    `<button class="lp-pille${musikkPa(S) ? " pa" : ""}" data-h="musikk" aria-pressed="${musikkPa(S)}"><span class="lp-eq" aria-hidden="true"><i></i><i></i><i></i></span>${esc(musikkPa(S) ? R.t("Musikk på") : R.t("Musikk av"))}</button>`;
  function volumHtml(S) {
    return `<div class="lp-volum">
      <label for="lp-volum">${esc(R.t("Volum"))}</label>
      <input type="range" id="lp-volum" data-felt="volum" min="0" max="100" step="5" value="${esc(S.volum)}">
      <output for="lp-volum" id="lp-volum-tall" aria-hidden="true">${esc(S.volum)}</output>
    </div>`;
  }

  R.start({
    id: "leppeleseren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: standardAntall(),
      modus: "par",
      lag: 2,
      runder: { par: null, lag: null }, // null: the default for the group's size
      stil: "disko",
      volum: STD_VOLUM,
      stoy: false,
      musikk: true,
      start: 0,
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS);
      if (!MODUSER.includes(S.modus)) S.modus = "par";
      if (!LAG.includes(S.lag)) S.lag = 2;
      if (!S.runder || typeof S.runder !== "object") S.runder = { par: null, lag: null };
      for (const m of MODUSER) if (S.runder[m] != null && !RUNDER[m].includes(S.runder[m])) S.runder[m] = null;
      if (!STILER[S.stil]) S.stil = "disko";
      S.volum = Number.isFinite(Number(S.volum)) ? R.klamp(Math.round(Number(S.volum)), 0, 100) : STD_VOLUM;
      S.stoy = !!S.stoy;
      S.musikk = S.musikk !== false;
      S.start = Number.isInteger(S.start) ? S.start : 0;
      const sp = S.spill;
      if (sp) {
        const n = sp.n;
        const liste = (l) => Array.isArray(l) && l.length === n && l.every((x) => Number.isInteger(x) && x >= 0);
        const ordOk = (r) => r && Array.isArray(r.ord) && r.ord.length > 0 && r.ord.every((w) => w && Number.isInteger(w.k) && w.k >= 0 && w.k < FRASER.length && (w.s === null || w.s === 0 || w.s === 1));
        const ok =
          MODUSER.includes(sp.modus) && Number.isInteger(n) && n >= MIN && n <= MAKS && (sp.modus !== "lag" || LAG.includes(n)) &&
          RUNDER[sp.modus].includes(sp.runder) && sp.turer === sp.runder * n &&
          Number.isInteger(sp.tur) && sp.tur >= 0 && sp.tur < sp.turer && Number.isInteger(sp.start) && sp.start >= 0 && sp.start < n &&
          liste(sp.poeng) && Array.isArray(sp.logg) && (sp.runde === null || ordOk(sp.runde));
        if (!ok) S.spill = null;
      }
      const spillSkjerm = ["klar", "spill", "sjekk"];
      if (spillSkjerm.includes(S.skjerm) && !pagar(S)) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
      if (pagar(S)) {
        const r = S.spill.runde;
        if (S.skjerm === "spill" && !r) S.skjerm = "klar";
        if (S.skjerm === "sjekk" && !(r && r.ute)) S.skjerm = r ? "spill" : "klar";
        if (S.skjerm === "klar" && r) S.skjerm = r.ute ? "sjekk" : "spill";
        // The music never survives a reload (the phone needs a tap first): a running turn pauses.
        if (r && !r.ute) S.spill.pause = true;
      }
    },

    regler: {
      intro: R.t("Én har hodetelefoner med høy musikk fra mobilen – og må lese leppene dine. Dere trenger: hodetelefoner til mobilen (med ledning eller Bluetooth)."),
      steg: [
        [R.t("Ta på hodetelefonene"), R.t("Lytteren kobler hodetelefonene til mobilen og tar dem på. Mobilen spiller høy festmusikk som overdøver alt. Skru ned hvis det gjør vondt – musikken skal bare overdøve.")],
        [R.t("Si frasen"), R.t("Leseren ser frasen på skjermen og sier den med store, tydelige munnbevegelser. Høyt er lov – musikken overdøver det. Ingen fakter og ingen bokstaver i lufta!")],
        [R.t("Gjett høyt"), R.t("Lytteren gjetter høyt. Trykk «Riktig!» når frasen er gjettet, eller «Hopp over». Dere har 60 s på å klare så mange som mulig.")],
        [R.t("Bytt roller"), R.t("Alle mot alle: Leseren og lytteren får ett poeng hver for hver frase. Så blir lytteren leser for nestemann. Lag mot lag: laget får poengene, og dere bytter selv på hvem som leser.")],
      ],
      tips: [
        R.t("Start med lav lyd og skru opp til lytteren ikke hører stemmen din – ikke mer."),
        R.t("Legg mobilen mellom dere med skjermen mot leseren."),
        R.t("Sa noen nesten riktig? Dere bestemmer selv hva som er godt nok."),
        R.t("Bruker dere egen musikk? Slå av musikken i spillet."),
      ],
    },

    felt: {
      volum(S, el) {
        S.volum = R.klamp(Math.round(Number(el.value) || 0), 0, 100);
        Musikk.volum(S.volum);
        const tall = document.getElementById("lp-volum-tall");
        if (tall) tall.textContent = String(S.volum);
        R.lagre();
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const rekord = lesRekord();
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Den ene hører bare musikk."))}<br><em>${esc(R.t("Klarer lytteren å lese leppene dine?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · tur {n} av {av}", { n: S.spill.tur + 1, av: S.spill.turer }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              [R.t("Hodetelefoner"), R.t("til mobilen")],
              [`${MIN}–${MAKS}`, R.t("spillere")],
              [String(FRASER.length), R.t("fraser")],
              rekord ? [String(rekord), R.t("rekord på 60 s")] : ["0", R.t("reklame")],
            ],
          });
        },
        inn() {
          Musikk.stopp();
          R.slippVaken();
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const lag = `<section class="seksjon">
              <h2>${esc(R.t("Hvor mange lag?"))}</h2>
              ${R.ui.seg("lag", LAG.map((x) => [x, R.t("{n} lag", { n: x })]), S.lag, { etikett: R.t("Antall lag") })}
              <div class="lp-lagrad">${Array.from({ length: S.lag }, (_, i) => R.ui.lagmerke(i)).join("")}</div>
              <p class="hjelp">${esc(R.t("Del dere i lag på minst to. Lagene bytter på å lese og lytte."))}</p>
            </section>`;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${trengerHtml()}
            <section class="seksjon">
              <h2>${esc(R.t("Hvem mot hvem?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "par", tittel: R.t("Alle mot alle"), tekst: R.t("Leser og lytter får poeng sammen"), ikon: "👄" },
                  { v: "lag", tittel: R.t("Lag mot lag"), tekst: R.t("Laget får poengene"), ikon: "🎧" },
                ],
                S.modus,
              )}
            </section>
            ${S.modus === "par" ? R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Hver leser leser for nestemann på lista.") }) : lag}
            <section class="seksjon">
              <h2>${esc(R.t("Runder"))}</h2>
              ${R.ui.seg("runder", RUNDER[S.modus].map((r) => [r, String(r)]), runderNa(S), { etikett: R.t("Antall runder") })}
              <p class="hjelp">${esc(S.modus === "par" ? R.t("Alle leser og lytter én gang hver runde.") : R.t("Hvert lag har én tur hver runde."))}</p>
            </section>
            ${R.ui.bryter("stoy", S.stoy, R.t("Ekstra sus"), R.t("Et lag med sus under musikken – overdøver enda bedre."))}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"), `<p class="hjelp lp-estimat">${esc(estimat(S))}</p>`)}`;
        },
      },

      // Before every turn: who reads and listens, the hearing warning, the volume and the style.
      klar: {
        tittel: turTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const valg = [...STIL_IDER.map((id) => [id, STIL_NAVN[id]]), ["av", R.t("Av")]];
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(sp.modus === "lag" ? R.t("{lag} sin tur", { lag: R.lagNavn(lagNa(sp)) }) : R.t("{leser} leser for {lytter}", { leser: R.navn(leser(sp)), lytter: R.navn(lytter(sp)) }))}</h1>
            ${hvemHtml(sp, true)}
            <p class="lp-ingress">${esc(sp.modus === "lag" ? R.t("Lytteren tar på hodetelefonene. Legg mobilen mellom dere, med skjermen mot leseren.") : R.t("{lytter} tar på hodetelefonene. Legg mobilen mellom dere, med skjermen mot {leser}.", { lytter: R.navn(lytter(sp)), leser: R.navn(leser(sp)) }))}</p>
            <section class="seksjon lp-musikk">
              <div class="seksjon-hode"><h2>${esc(R.t("Musikk"))}</h2></div>
              ${R.ui.seg("stil", valg, musikkPa(S) ? S.stil : "av", { etikett: R.t("Musikk") })}
              ${musikkPa(S)
                ? `${volumHtml(S)}
                   ${varsel()}
                   ${R.ui.knapp2(Musikk.spiller ? R.t("Stopp musikken") : R.t("Prøv musikken"), "prov", { ikon: Musikk.spiller ? "⏹" : "▶" })}`
                : `<p class="hjelp">${esc(R.t("Musikken er av. Bruk egen musikk i hodetelefonene, eller velg en stil."))}</p>`}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start-tur", { variant: "rosa" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn() {
          R.holdVaken();
          tilSpill = false;
          R.vedForlat(() => {
            if (!tilSpill) Musikk.stopp();
            tilSpill = false;
          });
        },
      },

      // The turn: the phrase for the reader, one tap per phrase.
      spill: {
        tittel: turTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const n = riktige(sp);
          const hvem =
            sp.modus === "lag"
              ? `<b>${esc(R.lagNavn(lagNa(sp)))}</b>`
              : `<b><span aria-hidden="true">👄</span> ${esc(R.navn(leser(sp)))}</b><b><span aria-hidden="true">🎧</span> ${esc(R.navn(lytter(sp)))}</b>`;
          const status = `<div class="lp-status">
              ${R.ui.timer({ id: "lp-tid", sekunder: sp.igjen, visning: "sek" })}
              <p class="lp-par">${hvem}</p>
              <div class="lp-teller${blink === "riktig" ? " popp" : ""}" role="img" aria-label="${esc(R.flertall(n, "riktig", "riktige"))}"><b>${n}</b><small>${esc(R.t("riktige"))}</small></div>
            </div>`;
          const w = ubesvart(r);
          if (sp.pause || !w) {
            return `${status}
              <div class="lp-kort pause">
                ${musikkPille(S)}
                ${R.figur()}
                <h1 id="skjerm-tittel">${esc(R.t("Pause"))}</h1>
                <p>${esc(R.t("Frasen er skjult. Fortsett når dere er klare."))}</p>
              </div>
              ${R.ui.dokk(R.ui.knapp(R.t("Fortsett"), "fortsett-tur"), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
          }
          const tekst = FRASER[w.k];
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("{navn} leser", { navn: sp.modus === "lag" ? R.lagNavn(lagNa(sp)) : R.navn(leser(sp)) }))}</h1>
            ${status}
            <div class="lp-kort${blink ? " blink-" + blink : ""}">
              ${musikkPille(S)}
              <span class="lp-etikett">${esc(R.t("Si det med store munnbevegelser"))}</span>
              <span class="lp-frase ${R.lengdeKlasse(tekst)}">${esc(tekst)}</span>
            </div>
            ${R.ui.dokk(
              `<button class="knapp mynte lp-riktig" data-h="riktig" data-stille>${esc(R.t("Riktig!"))}</button>`,
              `<button class="knapp-2 lp-hopp" data-h="hopp" data-stille>${esc(R.t("Hopp over"))}</button>`,
              R.ui.lenkerad(kanAngre(sp) ? R.ui.lenke(R.t("Angre"), "angre") : "", R.ui.lenke(R.t("Pause"), "pause"), R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        etter() {
          blink = "";
          const t = klokke();
          if (t) t.tegn();
        },
        inn(S) {
          const sp = S.spill;
          const fersk = startetNa;
          startetNa = false;
          R.vedForlat(() => Musikk.stopp());
          if (!sp.runde || sp.runde.ute) return;
          const t = lagKlokke(S);
          if (fersk && !sp.pause) {
            t.start();
            R.holdVaken();
          } else {
            Musikk.stopp();
            sp.pause = true;
            R.vis();
          }
        },
        ut(S) {
          const sp = S.spill;
          const t = klokke();
          if (sp && sp.runde && !sp.runde.ute && t) {
            sp.igjen = Math.max(1, Math.ceil(t.igjen));
            sp.pause = true;
          }
        },
      },

      // After the turn: fix mistakes, see the standings, the next pair.
      sjekk: {
        tittel: turTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = riktige(sp);
          const hvem = sp.modus === "lag" ? R.t("{lag} fikk", { lag: R.lagNavn(lagNa(sp)) }) : R.t("{leser} og {lytter} fikk", { leser: R.navn(leser(sp)), lytter: R.navn(lytter(sp)) });
          const rekord = lesRekord();
          const nesteTekst = sisteTur(sp)
            ? R.t("Til kåringen")
            : sp.modus === "lag"
              ? R.t("Neste: {lag}", { lag: R.lagNavn(nesteLeser(sp)) })
              : R.t("Neste: {leser} leser for {lytter}", { leser: R.navn(nesteLeser(sp)), lytter: R.navn(nesteLytter(sp)) });
          return `
            <div class="lp-resultat">
              <div class="stempel-sted"><p class="stempel rosa" aria-hidden="true">${esc(R.t("Tiden er ute!"))}</p></div>
              <p class="etikett">${esc(hvem)}</p>
              <h1 id="skjerm-tittel"><b>${n > 0 ? "+" : ""}${n}</b> ${esc(R.t("poeng|poeng", { n }))}</h1>
              ${sp.modus === "par" && n ? `<p class="lp-dom">${esc(R.t("Til hver av dere."))}</p>` : ""}
              ${rekord > 0 && n > rekord ? `<p class="lp-dom rekord">${esc(R.t("Ny rekord! Den gamle var {n}.", { n: rekord }))}</p>` : ""}
            </div>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Frasene"))}</h2><span class="tall">${esc(R.t("Trykk for å rette"))}</span></div>
              <ul class="lp-ordliste">${sp.runde.ord
                .map((w, i) =>
                  w.s === null
                    ? ""
                    : `<li><button class="lp-ord" data-h="veksle" data-v="${i}" aria-pressed="${w.s === 1}"><i aria-hidden="true">${w.s === 1 ? "✓" : "↷"}</i><span>${esc(FRASER[w.k])}</span><small>${w.s === 1 ? "+1" : esc(w.u ? R.t("rakk ikke") : R.t("hoppet over"))}</small></button></li>`,
                )
                .join("")}</ul>
            </section>
            <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Stillingen"))}</h2></div>${R.ui.poengliste(rader(sp, true))}</section>
            ${R.ui.dokk(R.ui.knapp(nesteTekst, "neste"), R.ui.lenkerad(sisteTur(sp) ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          Musikk.stopp();
          const sp = S.spill;
          const n = riktige(sp);
          const gml = lesRekord();
          if (sp.talt !== sp.tur && rekordTur !== sp.tur && n > 0 && gml > 0 && n > gml) {
            rekordTur = sp.tur;
            R.konfetti();
          }
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const topp = toppen(sp);
          const best = besteTur(sp);
          const banner = topp.length
            ? R.ui.banner({
                tittel: R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(topp.map((i) => navn(sp, i))), n: topp.length }),
                tekst: R.t("{poeng} etter {turer}", { poeng: R.flertall(sp.poeng[topp[0]], "poeng", "poeng"), turer: R.flertall(sp.logg.length, "tur", "turer") }),
                klasse: "aksent",
              })
            : R.ui.banner({ tittel: R.t("Ingen poeng denne gangen"), tekst: R.t("Skru opp musikken og prøv igjen!"), klasse: "aksent", stemning: "" });
          const bestLinje = best
            ? sp.modus === "lag"
              ? R.t("Beste tur: {lag} med {n}.", { lag: R.lagNavn(best.lag), n: R.flertall(best.riktige, "riktig", "riktige") })
              : R.t("Beste par: {leser} og {lytter} med {n}.", { leser: R.navn(best.leser), lytter: R.navn(best.lytter), n: R.flertall(best.riktige, "riktig", "riktige") })
            : "";
          return `
            ${banner}
            ${topp.length ? R.ui.pall(rader(sp)) : ""}
            ${sp.logg.length ? R.ui.poengliste(rader(sp)) : ""}
            ${bestLinje ? `<p class="papirboks lp-best">👄 ${esc(bestLinje)}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "lag" ? sp.n * 2 : sp.n })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          Musikk.stopp();
          R.slippVaken();
          if (!feire) return;
          feire = false;
          if (toppen(S.spill).length) {
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
        R.gaTil("oppsett");
      },
      endre(el, e, S) {
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        const r = S.spill.runde;
        R.gaTil(!r ? "klar" : r.ute ? "sjekk" : "spill");
      },
      modus(el, e, S) {
        if (MODUSER.includes(el.dataset.v)) S.modus = el.dataset.v;
        R.vis();
      },
      lag(el, e, S) {
        const n = Number(el.dataset.v);
        if (LAG.includes(n)) S.lag = n;
        R.vis();
      },
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        if (RUNDER[S.modus].includes(n)) S.runder[S.modus] = n;
        R.vis();
      },
      stoy(el, e, S) {
        S.stoy = !S.stoy;
        Musikk.stoy(S.stoy);
        R.vis();
      },
      start(el, e, S) {
        const o = { modus: S.modus, antall: R.klamp(S.antall, MIN, MAKS), lag: S.lag, runder: runderNa(S) };
        S.spill = ny(o, S.start);
        S.start = (S.start || 0) + 1; // the next game starts with the next player
        R.statistikk("start", { modus: o.modus, deltakere: S.spill.n, runder: o.runder });
        R.gaTil("klar");
      },
      stil(el, e, S) {
        const v = el.dataset.v;
        if (v === "av") {
          S.musikk = false;
          Musikk.stopp();
        } else if (STILER[v]) {
          S.musikk = true;
          S.stil = v;
          Musikk.stil(v);
        }
        R.vis();
      },
      prov(el, e, S) {
        if (Musikk.spiller) Musikk.stopp();
        else startMusikk(S);
        R.vis();
      },
      async "start-tur"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.runde || opptatt) return;
        startMusikk(S); // from the tap, so the phone lets it play
        opptatt = true;
        let ferdig = false;
        try {
          ferdig = await R.nedtelling(["3", "2", "1", R.t("LES!")], 700);
        } finally {
          opptatt = false;
        }
        if (!ferdig || S.spill !== sp || sp.runde) return;
        startTur(sp, trekk);
        startetNa = true;
        tilSpill = true;
        R.gaTil("spill");
      },
      "fortsett-tur"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !sp.runde || sp.runde.ute) return;
        sp.pause = false;
        startMusikk(S);
        const t = klokke() || lagKlokke(S);
        R.vis();
        t.start();
        R.holdVaken();
      },
      pause(el, e, S) {
        pauseTur(S);
      },
      musikk(el, e, S) {
        S.musikk = !musikkPa(S);
        if (S.musikk && !(S.spill && S.spill.pause)) startMusikk(S);
        else Musikk.stopp();
        R.vis();
      },
      riktig(el, e, S) {
        svarTrykk(S, true);
      },
      hopp(el, e, S) {
        svarTrykk(S, false);
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.pause || !angre(sp)) return;
        R.lyd.sveip();
        R.vis();
        R.si(R.t("Angret – frasen er tilbake"));
      },
      veksle(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !veksle(sp, Number(el.dataset.v))) return;
        R.lyd.klikk();
        R.vis();
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        lagreRekord(riktige(sp));
        const hvor = neste(sp);
        if (!hvor) return;
        if (hvor === "slutt") {
          avsluttSpill(S);
          R.gaTil("slutt");
          return;
        }
        R.gaTil("klar");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = !sp.logg.length && riktige(sp) === 0;
        if (S.skjerm === "spill") pauseTur(S);
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ingenting ? R.t("Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        Musikk.stopp();
        if (ingenting) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        if (sp.runde && riktige(sp)) lagreRekord(riktige(sp));
        avsluttSpill(S);
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
