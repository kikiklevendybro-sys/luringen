/* Fireren — four in a row on a 7 × 6 board. Two players on one phone, or against the phone at
   three levels (random-ish, decent, strong). Rounds are quick: the result shows on the board, the
   score runs across rounds, and who starts alternates. The rules and the engine (negamax with
   alpha-beta, searched in small slices so the page never freezes) are pure functions at the top;
   test/fireren.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Rules ----------

  const Fire = (() => {
    const KOL = 7, RAD = 6;
    // Cell index = column * 6 + row; row 0 is the bottom. Players are 1 and 2 (0 = empty).
    const RETNINGER = [[1, 0], [0, 1], [1, 1], [1, -1]];
    const REKKE = [3, 2, 4, 1, 5, 0, 6]; // the middle first: the best moves are usually there

    let fro = 0x6a09e667;
    const tall32 = () => {
      fro ^= fro << 13;
      fro ^= fro >>> 17;
      fro ^= fro << 5;
      return fro | 0;
    };
    const Z1 = Int32Array.from({ length: 84 }, tall32);
    const Z2 = Int32Array.from({ length: 84 }, tall32);

    const nytt = () => ({ c: new Int8Array(42), h: new Int8Array(KOL), n: 0, h1: 0, h2: 0 });
    const kan = (b, k) => k >= 0 && k < KOL && b.h[k] < RAD;

    function slipp(b, k, s) {
      const r = b.h[k]++;
      const i = k * RAD + r;
      b.c[i] = s;
      b.n++;
      b.h1 ^= Z1[i * 2 + s - 1];
      b.h2 ^= Z2[i * 2 + s - 1];
      return r;
    }
    function loft(b, k) {
      const r = --b.h[k];
      const i = k * RAD + r;
      const s = b.c[i];
      b.c[i] = 0;
      b.n--;
      b.h1 ^= Z1[i * 2 + s - 1];
      b.h2 ^= Z2[i * 2 + s - 1];
    }

    // How many discs of player s in a row through (k, r) in direction (dk, dr), (k, r) counted.
    function rekke(b, k, r, dk, dr, s) {
      let n = 1;
      for (let t = -1; t <= 1; t += 2) {
        let kk = k + dk * t, rr = r + dr * t;
        while (kk >= 0 && kk < KOL && rr >= 0 && rr < RAD && b.c[kk * RAD + rr] === s) {
          n++;
          kk += dk * t;
          rr += dr * t;
        }
      }
      return n;
    }

    // Would a disc of player s in column k make four (or more) in a row?
    function vinnerVed(b, k, s) {
      const r = b.h[k];
      if (r >= RAD) return false;
      for (let i = 0; i < 4; i++) if (rekke(b, k, r, RETNINGER[i][0], RETNINGER[i][1], s) >= 4) return true;
      return false;
    }

    // Every line of four or more through the disc at (k, r): [{ celler: [[k, r], ...] }], or [].
    function linjer(b, k, r) {
      const s = b.c[k * RAD + r];
      const ut = [];
      if (!s) return ut;
      for (const [dk, dr] of RETNINGER) {
        const celler = [[k, r]];
        for (let t = -1; t <= 1; t += 2) {
          let kk = k + dk * t, rr = r + dr * t;
          while (kk >= 0 && kk < KOL && rr >= 0 && rr < RAD && b.c[kk * RAD + rr] === s) {
            celler.push([kk, rr]);
            kk += dk * t;
            rr += dr * t;
          }
        }
        if (celler.length >= 4) ut.push({ celler: celler.sort((a, c) => a[0] - c[0] || a[1] - c[1]) });
      }
      return ut;
    }

    // Replay a list of columns; the first disc is player `forste` (1 or 2). Returns null if a move
    // is not possible (full column, or play after a win).
    function spillUt(liste, forste) {
      const b = nytt();
      let s = forste || 1;
      let vunnet = null;
      for (const k of liste || []) {
        if (vunnet || !Number.isInteger(k) || !kan(b, k)) return null;
        const r = slipp(b, k, s);
        const l = linjer(b, k, r);
        if (l.length) vunnet = { spiller: s, linjer: l };
        s = 3 - s;
      }
      return { b, tur: s, vunnet, fullt: !vunnet && b.n === KOL * RAD };
    }

    return { KOL, RAD, REKKE, nytt, kan, slipp, loft, rekke, vinnerVed, linjer, spillUt };
  })();

  // ---------- Engine ----------

  const Motor = (() => {
    const { KOL, RAD, REKKE, kan, slipp, loft, vinnerVed } = Fire;
    const VINN = 100000;

    // All 69 windows of four cells.
    const VINDUER = [];
    for (let k = 0; k < KOL; k++)
      for (let r = 0; r < RAD; r++)
        for (const [dk, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const ek = k + 3 * dk, er = r + 3 * dr;
          if (ek < 0 || ek >= KOL || er < 0 || er >= RAD) continue;
          VINDUER.push([0, 1, 2, 3].map((i) => (k + i * dk) * RAD + (r + i * dr)));
        }
    const V = Int8Array.from(VINDUER.flat());
    const VEKT = [0, 1, 6, 0];
    const trussel = new Int8Array(42); // bit 1: a threat for disc 1 here, bit 2: for disc 2
    const merket = new Int8Array(42);

    // Static value for player s. Open windows with one or two own discs count a little. A window
    // with three discs makes its empty cell a threat; threats count much more, and most on the
    // rows that decide the endgame: the player who started (disc 1) wants threats on odd rows
    // (1, 3, 5 from the bottom), the other player on even rows.
    function evaluer(b, s) {
      const c = b.c;
      const o = 3 - s;
      let v = 0;
      let n = 0;
      for (let w = 0; w < V.length; w += 4) {
        let a = 0, m = 0, tom = -1;
        for (let j = 0; j < 4; j++) {
          const i = V[w + j];
          const x = c[i];
          if (x === s) a++;
          else if (x === o) m++;
          else tom = i;
        }
        if (a && !m) {
          if (a === 3) {
            if (!trussel[tom]) merket[n++] = tom;
            trussel[tom] |= s;
          } else v += VEKT[a];
        } else if (m && !a) {
          if (m === 3) {
            if (!trussel[tom]) merket[n++] = tom;
            trussel[tom] |= o;
          } else v -= VEKT[m];
        }
      }
      for (let j = 0; j < n; j++) {
        const i = merket[j];
        const t = trussel[i];
        trussel[i] = 0;
        const rad = i % RAD;
        for (let d = 1; d <= 2; d++) {
          if (!(t & d)) continue;
          const riktigRad = (rad % 2 === 0) === (d === 1); // odd row (1-based) for disc 1, even for disc 2
          const verdi = riktigRad ? 70 : 30;
          v += d === s ? verdi : -verdi;
        }
      }
      for (let r = 0; r < RAD; r++) {
        const x = c[3 * RAD + r];
        if (x === s) v += 4;
        else if (x === o) v -= 4;
      }
      return v;
    }

    const TT = 1 << 18;
    let tt = null;
    const lagTt = () => ({ sjekk: new Int32Array(TT), verdi: new Int32Array(TT), dybde: new Int8Array(TT), flagg: new Int8Array(TT), trekk: new Int8Array(TT) });

    // Moves to try: a forced block first; otherwise the remembered best, then the middle.
    function kandidater(b, s, ttTrekk) {
      const o = 3 - s;
      let tvunget = -1;
      for (const k of REKKE)
        if (b.h[k] < RAD && vinnerVed(b, k, o)) {
          if (tvunget >= 0) return null; // two threats: can't block both
          tvunget = k;
        }
      if (tvunget >= 0) return [tvunget];
      const ut = [];
      if (ttTrekk >= 0 && kan(b, ttTrekk)) ut.push(ttTrekk);
      for (const k of REKKE) if (k !== ttTrekk && b.h[k] < RAD) ut.push(k);
      return ut;
    }

    // One node of the search. `under` searches the children (flat or as a generator).
    function forbered(b, s, dybde, alfa, beta, ctx) {
      for (const k of REKKE) if (b.h[k] < RAD && vinnerVed(b, k, s)) return { verdi: VINN - b.n };
      if (b.n >= KOL * RAD - 1) return { verdi: 0 }; // the last disc can't win (checked above): draw
      if (dybde <= 0) return { verdi: evaluer(b, s) };
      const idx = b.h1 & (TT - 1);
      let ttTrekk = -1;
      if (tt.flagg[idx] && tt.sjekk[idx] === b.h2) {
        ttTrekk = tt.trekk[idx];
        if (tt.dybde[idx] >= dybde) {
          const v = tt.verdi[idx], fl = tt.flagg[idx];
          if (fl === 1 || (fl === 2 && v >= beta) || (fl === 3 && v <= alfa)) return { verdi: v };
        }
      }
      const ms = kandidater(b, s, ttTrekk);
      if (!ms) return { verdi: -(VINN - b.n - 1) };
      return { ms, idx };
    }
    function lagre(b, idx, dybde, best, bestK, alfa0, beta) {
      tt.sjekk[idx] = b.h2;
      tt.verdi[idx] = best;
      tt.dybde[idx] = dybde;
      tt.flagg[idx] = best <= alfa0 ? 3 : best >= beta ? 2 : 1;
      tt.trekk[idx] = bestK;
    }

    function flat(b, s, dybde, alfa, beta, ctx) {
      ctx.noder++;
      const f = forbered(b, s, dybde, alfa, beta, ctx);
      if (!f.ms) return f.verdi;
      const alfa0 = alfa;
      let best = -Infinity, bestK = f.ms[0];
      for (const k of f.ms) {
        slipp(b, k, s);
        const v = -flat(b, 3 - s, dybde - 1, -beta, -alfa, ctx);
        loft(b, k);
        if (v > best) {
          best = v;
          bestK = k;
        }
        if (v > alfa) alfa = v;
        if (alfa >= beta) break;
      }
      lagre(b, f.idx, dybde, best, bestK, alfa0, beta);
      return best;
    }

    function* sok(b, s, dybde, alfa, beta, ctx) {
      if (dybde <= 5) return flat(b, s, dybde, alfa, beta, ctx);
      ctx.noder++;
      if (ctx.noder - ctx.pause >= 1500) {
        ctx.pause = ctx.noder;
        yield;
      }
      const f = forbered(b, s, dybde, alfa, beta, ctx);
      if (!f.ms) return f.verdi;
      const alfa0 = alfa;
      let best = -Infinity, bestK = f.ms[0];
      for (const k of f.ms) {
        slipp(b, k, s);
        const v = -(yield* sok(b, 3 - s, dybde - 1, -beta, -alfa, ctx));
        loft(b, k);
        if (v > best) {
          best = v;
          bestK = k;
        }
        if (v > alfa) alfa = v;
        if (alfa >= beta) break;
      }
      lagre(b, f.idx, dybde, best, bestK, alfa0, beta);
      return best;
    }

    // Iterative deepening at the root; `resultat` always holds the best column so far.
    function* rot(b, s, valg, resultat) {
      if (!tt) tt = lagTt();
      const ctx = { noder: 0, pause: 0 };
      const tilfeldig = valg.tilfeldig || Math.random;
      const ms = REKKE.filter((k) => kan(b, k));
      resultat.kolonne = ms[0];
      resultat.dybde = 0;
      if (ms.length === 1) return resultat;
      for (const k of ms)
        if (vinnerVed(b, k, s)) {
          resultat.kolonne = k;
          resultat.verdi = VINN;
          return resultat;
        }
      const rekke = ms.map((k) => ({ k, v: 0, stoy: valg.stoy ? (tilfeldig() * 2 - 1) * valg.stoy : 0 }));
      const maks = Math.min(valg.dybde || 42, KOL * RAD - b.n);
      for (let d = 1; d <= maks; d++) {
        let alfa = -Infinity;
        let beste = null;
        for (const r of rekke) {
          slipp(b, r.k, s);
          const v = -(yield* sok(b, 3 - s, d - 1, -Infinity, valg.fullVindu ? Infinity : -alfa, ctx));
          loft(b, r.k);
          r.v = v + r.stoy;
          if (!beste || r.v > beste.v) beste = r;
          if (v > alfa) alfa = v;
          resultat.kolonne = beste.k;
          resultat.verdi = beste.v;
        }
        rekke.sort((a, c) => (a === beste ? -1 : c === beste ? 1 : c.v - a.v));
        resultat.dybde = d;
        resultat.noder = ctx.noder;
        if (Math.abs(beste.v) > VINN / 2) break; // a forced win or loss is found
      }
      return resultat;
    }

    // Random-ish (level 1): often takes a win, sometimes blocks, otherwise a random column that
    // leans towards the middle.
    function lett(b, s, tilfeldig) {
      const ms = REKKE.filter((k) => kan(b, k));
      const vinn = ms.filter((k) => vinnerVed(b, k, s));
      if (vinn.length && tilfeldig() < 0.7) return vinn[0];
      const blokk = ms.filter((k) => vinnerVed(b, k, 3 - s));
      if (blokk.length && tilfeldig() < 0.45) return blokk[0];
      const vekt = ms.map((k) => 4 - Math.abs(3 - k));
      let x = tilfeldig() * vekt.reduce((a, c) => a + c, 0);
      for (let i = 0; i < ms.length; i++) if ((x -= vekt[i]) < 0) return ms[i];
      return ms[ms.length - 1];
    }

    const NIVA = {
      1: { lett: true },
      2: { dybde: 4, stoy: 6, fullVindu: true, tid: 800 },
      3: { dybde: 42, tid: 1200 },
    };

    function kjor(gen, valg, ferdig) {
      const start = performance.now();
      let stoppet = false;
      const steg = () => {
        if (stoppet) return;
        const slutt = Math.min(performance.now() + (valg.skive || 12), start + (valg.tid || 1e9));
        let r;
        do r = gen.next();
        while (!r.done && performance.now() < slutt);
        if (r.done || performance.now() >= start + (valg.tid || 1e9)) {
          stoppet = true;
          ferdig();
          return;
        }
        setTimeout(steg, 0);
      };
      setTimeout(steg, 0);
      return () => {
        stoppet = true;
      };
    }

    // The phone's column for player s on board b (a copy is searched). Answers via ferdig(k).
    function tenk(b, s, niva, ferdig, tilfeldig) {
      const valg = Object.assign({ tilfeldig }, NIVA[niva] || NIVA[2]);
      if (valg.lett) {
        const id = setTimeout(() => ferdig(lett(b, s, tilfeldig || Math.random)), 0);
        return () => clearTimeout(id);
      }
      const kopi = { c: Int8Array.from(b.c), h: Int8Array.from(b.h), n: b.n, h1: b.h1, h2: b.h2 };
      const resultat = {};
      return kjor(rot(kopi, s, valg, resultat), valg, () => ferdig(resultat.kolonne, resultat));
    }

    // Without slices (tests): to the end, or until `tid` ms.
    function velg(b, s, niva, tilfeldig, tid) {
      const valg = Object.assign({ tilfeldig }, NIVA[niva] || NIVA[2]);
      if (valg.lett) return lett(b, s, tilfeldig || Math.random);
      const kopi = { c: Int8Array.from(b.c), h: Int8Array.from(b.h), n: b.n, h1: b.h1, h2: b.h2 };
      const resultat = {};
      const gen = rot(kopi, s, valg, resultat);
      const slutt = performance.now() + (tid || valg.tid);
      let r;
      let skiver = 0;
      do {
        r = gen.next();
        skiver++;
      } while (!r.done && performance.now() < slutt);
      resultat.skiver = skiver;
      return resultat.kolonne;
    }

    return { evaluer, tenk, velg, rot, NIVA, VINN };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules and the engine.
    window.Fireren = { Fire, Motor };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { KOL, RAD } = Fire;
  const NIVANAVN = { 1: "Lett", 2: "Middels", 3: "Vanskelig" };
  const MAL = [3, 5, 0]; // «Først til 3», «Først til 5», «Uten slutt»
  const LIGGENDE = "(orientation: landscape) and (max-height: 600px) and (min-width: 560px)"; // phones on their side
  const NIVATEKST = {
    1: "Mobilen legger litt hulter til bulter. Fint for de minste.",
    2: "Mobilen ser noen trekk fram. Passe utfordring.",
    3: "Mobilen tenker dypt. Klarer du å slå den?",
  };
  const FARGE = ["rosa", "gul"];
  const MIN_TENK = 650;
  let H;

  // S.spill: { id, modus, niva, starter (player who starts this round), trekk (columns),
  //   poeng [p0, p1], uavgjort, runde, resultat (this round) { vinner, linjer }, ferdig (match over) }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, i) => sp.modus === "mobil" && i === 1;
  const navn = (sp, i) => (sp.modus === "mobil" ? (i === 1 ? "Mobilen" : "Du") : R.navn(i));
  // Player index (0/1) of the disc number d (1 = the one who started).
  const spillerFor = (sp, d) => (d === 1 ? sp.starter : 1 - sp.starter);
  const discFor = (sp, i) => (i === sp.starter ? 1 : 2);

  let stilling = null;
  let stillingFor = "";
  function hentStilling(S) {
    const sp = S.spill;
    const n = sp.id + ":" + sp.runde + ":" + sp.trekk.join("");
    if (stilling && stillingFor === n) return stilling;
    stilling = Fire.spillUt(sp.trekk, 1);
    stillingFor = n;
    return stilling;
  }
  const tur = (S) => spillerFor(S.spill, hentStilling(S).tur);
  const rundeFerdig = (S) => !!S.spill.resultat;

  let nyBrikke = null; // { k, r } that should fall on the next draw
  let tenkStopp = null;
  let tenkerPa = "";
  let lasTil = 0; // input locked until (performance.now()) while a disc falls

  // ---------- Sounds ----------
  const lyd = {
    klonk: (r) => {
      R.lyd.tone(210 - r * 12, 0, 0.09, "triangle", 0.22, 120);
      R.lyd.stoy(0, 0.07, 0.18, 900);
    },
    vinn: () => {
      R.lyd.fanfare();
    },
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

  const fallTid = (r) => Math.round(260 + (RAD - r) * 55);

  // «Først til 3»: the match is over when someone reaches the goal (mal 0 = no end).
  const kampVunnet = (sp) => !!sp.mal && Math.max(sp.poeng[0], sp.poeng[1]) >= sp.mal;
  let kaaringId = null;
  function tilKaaringOm(S, ms) {
    clearTimeout(kaaringId);
    const fortsatt = R.vakt();
    const id = S.spill.id;
    kaaringId = setTimeout(() => {
      kaaringId = null;
      const sp = R.S.spill;
      if (fortsatt() && sp && sp.id === id && !sp.ferdig && kampVunnet(sp) && R.S.skjerm === "spill") avsluttKamp(R.S);
    }, R.rolig() ? Math.min(ms, 1500) : ms);
  }
  // The match ends: to «Kåringen» (an unfinished round doesn't count).
  function avsluttKamp(S) {
    const sp = S.spill;
    clearTimeout(kaaringId);
    stoppTenking();
    if (!sp.resultat) sp.trekk = [];
    sp.ferdig = true;
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.modus === "mobil" ? sp.niva : 0, runder: sp.poeng[0] + sp.poeng[1] + sp.uavgjort, uavgjort: sp.uavgjort, mal: sp.mal || 0 });
    R.gaTil("slutt");
  }

  function leggBrikke(S, k) {
    const sp = S.spill;
    const st = hentStilling(S);
    if (!Fire.kan(st.b, k) || rundeFerdig(S)) return;
    const disc = st.tur;
    sp.trekk.push(k);
    const ny = hentStilling(S);
    const r = ny.b.h[k] - 1;
    nyBrikke = { k, r };
    const tid = R.rolig() ? 0 : fallTid(r);
    // No new disc until this one has landed — and never within 350 ms (a double tap must not
    // drop a disc for the other player), also with reduced motion.
    lasTil = performance.now() + Math.max(350, tid * 0.75);
    const fortsatt = R.vakt();
    const runde = sp.runde;
    setTimeout(() => {
      if (!fortsatt()) return;
      lyd.klonk(r);
      R.vibrer(14);
    }, tid * 0.72);
    const hvem = spillerFor(sp, disc);
    if (ny.vunnet) {
      sp.resultat = { vinner: hvem, linjer: ny.vunnet.linjer.map((l) => l.celler) };
      sp.poeng[hvem]++;
      telRekord(S, hvem);
      R.si(`${navn(sp, hvem)} får fire på rad!${kampVunnet(sp) ? ` ${navn(sp, hvem)} vinner kampen.` : ""}`);
      setTimeout(() => {
        if (!fortsatt() || !R.S.spill || R.S.spill.runde !== runde || !R.S.spill.resultat) return;
        feir(R.S);
      }, tid + 120);
      if (kampVunnet(sp)) tilKaaringOm(S, tid + 2600);
    } else if (ny.fullt) {
      sp.resultat = { vinner: null, linjer: [] };
      sp.uavgjort++;
      telRekord(S, null);
      R.si("Brettet er fullt. Uavgjort!");
      setTimeout(() => fortsatt() && R.lyd.pling(), tid + 120);
    } else R.si(`${navn(sp, hvem)} la i kolonne ${k + 1}. ${navn(sp, tur(S))} sin tur.`);
    R.vis();
    if (!sp.resultat) startTenking(S);
  }

  function feir(S) {
    const sp = S.spill;
    const v = sp.resultat.vinner;
    if (sp.modus === "mobil" && v === 1) {
      lyd.tap();
      return;
    }
    lyd.vinn();
    R.vibrer([40, 60, 120]);
    R.konfetti(v === 0 ? ["--rosa", "--papir", "--lilla"] : ["--lampe", "--papir", "--oransje"]);
  }

  function telRekord(S, vinner) {
    const sp = S.spill;
    if (sp.modus !== "mobil") return;
    const r = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, uavgjort: 0, tap: 0 });
    if (vinner == null) r.uavgjort++;
    else if (vinner === 0) r.seier++;
    else r.tap++;
  }
  function angreRekord(S, vinner) {
    const sp = S.spill;
    const r = sp.modus === "mobil" && S.rekord[sp.niva];
    if (!r) return;
    if (vinner == null) r.uavgjort = Math.max(0, r.uavgjort - 1);
    else if (vinner === 0) r.seier = Math.max(0, r.seier - 1);
    else r.tap = Math.max(0, r.tap - 1);
  }

  // ---------- The phone's turn ----------
  function startTenking(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.resultat || S.skjerm !== "spill" || !erMaskin(sp, tur(S))) return;
    const nokkel = sp.id + ":" + sp.runde + ":" + sp.trekk.length;
    if ((tenkStopp || trekkId) && tenkerPa === nokkel) return;
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    const start = performance.now();
    const gjelder = () => fortsatt() && R.S.spill && !R.S.spill.resultat && R.S.spill.id + ":" + R.S.spill.runde + ":" + R.S.spill.trekk.length === nokkel;
    const st = hentStilling(S);
    tenkStopp = Motor.tenk(st.b, st.tur, sp.niva, (k) => {
      tenkStopp = null;
      if (!gjelder()) return;
      trekkId = setTimeout(() => {
        trekkId = null;
        if (!gjelder()) return;
        tenkerPa = "";
        const b = hentStilling(R.S).b;
        leggBrikke(R.S, Fire.kan(b, k) ? k : Fire.REKKE.find((x) => Fire.kan(b, x)));
      }, Math.max(0, MIN_TENK - (performance.now() - start)));
    });
  }
  let trekkId = null;
  function stoppTenking() {
    if (tenkStopp) tenkStopp();
    tenkStopp = null;
    clearTimeout(trekkId);
    trekkId = null;
    tenkerPa = "";
  }

  // ---------- Markup ----------

  // Under the score: the goal of the match and the draws so far.
  const tallTekst = (sp) => [sp.mal ? `først til ${sp.mal}` : "", sp.uavgjort ? R.flertall(sp.uavgjort, "uavgjort", "uavgjort") : ""].filter(Boolean).join(" · ");

  function poengHtml(S) {
    const sp = S.spill;
    const naa = rundeFerdig(S) ? -1 : tur(S);
    const kort = (i) => `<div class="fi-spiller ${FARGE[i]}${naa === i ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === i ? " vant" : ""}">
        <span class="fi-merke" aria-hidden="true">${erMaskin(sp, i) ? `<span class="fi-maskin">${R.figur()}</span>` : R.avatar(i)}<i class="fi-disk ${FARGE[i]}"></i></span>
        <b class="fi-navn">${esc(navn(sp, i))}</b>
      </div>`;
    return `<div class="fi-stilling" role="group" aria-label="Stillingen: ${esc(navn(sp, 0))} ${sp.poeng[0]}, ${esc(navn(sp, 1))} ${sp.poeng[1]}">
      ${kort(0)}
      <div class="fi-tall" aria-hidden="true"><b>${sp.poeng[0]}</b><span>–</span><b>${sp.poeng[1]}</b>${tallTekst(sp) ? `<small>${tallTekst(sp)}</small>` : ""}</div>
      ${kort(1)}
    </div>`;
  }

  function meldingHtml(S) {
    const sp = S.spill;
    if (sp.resultat) {
      const v = sp.resultat.vinner;
      if (v == null) return `<p class="fi-melding uavgjort"><span>Brettet er fullt – uavgjort!</span></p>`;
      let tekst = sp.modus === "mobil" ? (v === 0 ? "Du vinner! Fire på rad!" : "Mobilen vinner denne gangen!") : `${navn(sp, v)} vinner!`;
      if (kampVunnet(sp)) tekst = sp.modus === "mobil" ? (v === 0 ? `Du vinner kampen – først til ${sp.mal}!` : "Mobilen vinner kampen!") : `${navn(sp, v)} vinner kampen!`;
      return `<p class="fi-melding vinner ${FARGE[v]}"><span>${esc(tekst)}</span></p>`;
    }
    const i = tur(S);
    const forste = sp.trekk.length === 0;
    let tekst;
    if (erMaskin(sp, i)) tekst = `<span class="fi-tenker">Mobilen tenker<i>.</i><i>.</i><i>.</i></span>`;
    else if (sp.modus === "mobil") tekst = forste ? "Du begynner! Trykk på en kolonne." : "Din tur";
    else tekst = esc(`${navn(sp, i)} ${forste ? "begynner!" : "sin tur"}`);
    return `<p class="fi-melding ${FARGE[i]}"><i class="fi-disk ${FARGE[i]}" aria-hidden="true"></i><span>${tekst}</span></p>`;
  }

  function brettHtml(S, o) {
    const sp = S.spill;
    const st = hentStilling(S);
    const b = st.b;
    const vinnende = new Set();
    if (sp.resultat) for (const l of sp.resultat.linjer) for (const [k, r] of l) vinnende.add(k * RAD + r);
    const sist = sp.trekk.length ? sp.trekk[sp.trekk.length - 1] : -1;
    const brikker = [];
    for (let k = 0; k < KOL; k++)
      for (let r = 0; r < b.h[k]; r++) {
        const i = spillerFor(sp, b.c[k * RAD + r]);
        const faller = o.interaktiv && nyBrikke && nyBrikke.k === k && nyBrikke.r === r && !R.rolig();
        const k2 = ["fi-brikke", FARGE[i]];
        if (faller) k2.push("fall");
        if (vinnende.has(k * RAD + r)) k2.push("vinn");
        else if (sp.resultat && sp.resultat.vinner != null) k2.push("dempet");
        if (k === sist && r === b.h[k] - 1 && !sp.resultat) k2.push("sist");
        brikker.push(`<span class="${k2.join(" ")}" style="--k:${k};--r:${r}${faller ? `;--fra:${RAD - r + 0.15};--tid:${fallTid(r)}ms` : ""}"></span>`);
      }
    if (o.interaktiv) nyBrikke = null;
    const strek = sp.resultat
      ? sp.resultat.linjer
          .map((l) => {
            const [a, z] = [l[0], l[l.length - 1]];
            const x = (k) => k * 100 + 50, y = (r) => (RAD - 1 - r) * 100 + 50;
            return `<line x1="${x(a[0])}" y1="${y(a[1])}" x2="${x(z[0])}" y2="${y(z[1])}"/>`;
          })
          .join("")
      : "";
    const kanTrykke = o.interaktiv && !sp.resultat && !erMaskin(sp, tur(S));
    const naa = sp.resultat ? 0 : tur(S);
    const kolonner = o.interaktiv
      ? `<div class="fi-kolonner${kanTrykke ? "" : " venter"}" role="group" aria-label="Kolonnene">${Array.from({ length: KOL }, (_, k) => {
          const ledige = RAD - b.h[k];
          return `<button class="fi-kol" data-h="slipp" data-v="${k}" data-stille aria-label="Kolonne ${k + 1}${ledige ? `, ${ledige} ledige` : ", full"}"${ledige && kanTrykke ? "" : ' aria-disabled="true"'}><i class="fi-sikte ${FARGE[naa]}" aria-hidden="true"></i></button>`;
        }).join("")}</div>`
      : "";
    return `<div class="fi-ramme${o.liten ? " liten" : ""}">
      <div class="fi-brett${sp.resultat && sp.resultat.vinner != null ? " ferdig" : ""}"${o.interaktiv ? "" : ' aria-hidden="true"'}>
        <div class="fi-lag">${brikker.join("")}</div>
        <div class="fi-panel" aria-hidden="true"></div>
        ${strek ? `<svg class="fi-strek" viewBox="0 0 700 600" preserveAspectRatio="none" aria-hidden="true">${strek}</svg>` : ""}
        ${kolonner}
      </div>
    </div>`;
  }

  // ---------- Setup and flow ----------

  function nyKamp(S) {
    const o = S.oppsett;
    S.spill = {
      id: R.nyttFro() % 1e9,
      modus: o.modus,
      niva: o.niva,
      mal: o.mal,
      starter: 0,
      trekk: [],
      poeng: [0, 0],
      uavgjort: 0,
      runde: 1,
      resultat: null,
      ferdig: false,
      registrert: false,
    };
    stilling = null;
    nyBrikke = null;
    stoppTenking();
    R.statistikk("start", { modus: o.modus, niva: o.modus === "mobil" ? o.niva : 0, mal: o.mal });
  }

  function nyRunde(S) {
    const sp = S.spill;
    sp.runde++;
    sp.starter = 1 - sp.starter; // who starts alternates
    sp.trekk = [];
    sp.resultat = null;
    stilling = null;
    nyBrikke = null;
    stoppTenking();
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.uavgjort + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${r.seier === 1 ? "seier" : "seirer"}</span><span><b>${r.uavgjort}</b> uavgjort</span><span><b>${r.tap}</b> tap</span>`;
  }

  const DISK_IKON = '<span class="fi-knappedisk" aria-hidden="true"></span>';

  R.start({
    id: "fireren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, mal: 3 },
      spill: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, mal: 3 }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!MAL.includes(o.mal)) o.mal = 3;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const ok = Array.isArray(sp.trekk) && Array.isArray(sp.poeng) && sp.poeng.length === 2 && [0, 1].includes(sp.starter) && ["mobil", "to"].includes(sp.modus) && Fire.spillUt(sp.trekk, 1);
        if (!ok) S.spill = null;
        else {
          if (!MAL.includes(sp.mal)) sp.mal = 0; // saved before «Først til 3»: no end
          // A round result must match the board (e.g. after an old save).
          const st = Fire.spillUt(sp.trekk, 1);
          if (st.vunnet && !sp.resultat) sp.resultat = { vinner: spillerFor(sp, st.vunnet.spiller), linjer: st.vunnet.linjer.map((l) => l.celler) };
          if (!st.vunnet && !st.fullt) sp.resultat = null;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: "Slipp brikkene ned i brettet. Den som først får fire på rad, vinner runden.",
      steg: [
        ["Slipp en brikke", "Trykk på en kolonne. Brikka faller ned til den nederste ledige plassen."],
        ["Fire på rad", "Få fire brikker etter hverandre – bortover, oppover eller på skrå."],
        ["Stopp motstanderen", "Har den andre tre på rad med en ledig plass? Legg brikka di der før det er for sent!"],
      ],
      tips: [
        "Midten er gull: Den midterste kolonnen er med i flest mulige rekker.",
        "Dere bytter på å begynne.",
        "Først til 3: Den som først vinner tre runder, vinner kampen. Velg «Uten slutt» hvis dere bare vil spille videre.",
        "Lag to trusler samtidig, så klarer ikke motstanderen å stoppe begge.",
        "Trykket feil? «Angre» tar tilbake brikka.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = [1, 2, 3].map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          return (
            R.ui.spillhjem({
              slagordHtml: "Slipp brikka. Klonk!<br><em>Først til fire på rad vinner.</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? `Fortsett · ${sp.poeng[0]}–${sp.poeng[1]}` : "",
                ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
              }),
              merker: [
                ["1–2", "spillere"],
                ["3", "nivåer"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="fi-rekorder" aria-label="Mot mobilen"><p class="etikett">Mot mobilen</p><ul>${rek.map(([n, h]) => `<li><b class="fi-niva">${NIVANAVN[n]}</b>${h}</li>`).join("")}</ul></section>` : "")
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <h2>Hvordan vil du spille?</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: "Mot mobilen", tekst: "Tre nivåer" },
                  { v: "to", ikon: "👥", tittel: "To spillere", tekst: "På samme mobil" },
                ],
                o.modus,
              )}
            </section>
            ${
              o.modus === "mobil"
                ? `<section class="seksjon">
                    <h2>Hvor flink er mobilen?</h2>
                    ${R.ui.seg("niva", [[1, "Lett"], [2, "Middels"], [3, "Vanskelig"]], o.niva, { etikett: "Nivå" })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>
                  <p class="hjelp">Du har de rosa brikkene. Du og mobilen bytter på å begynne.</p>`
                : `${R.ui.spillere({ min: 2, max: 2, tittel: "Spillerne", hjelp: "Spiller 1 har rosa, spiller 2 gul. Dere bytter på å begynne." })}`
            }
            <section class="seksjon">
              <h2>Hvor lenge?</h2>
              ${R.ui.seg("mal", MAL.map((m) => [m, m ? `Først til ${m}` : "Uten slutt"]), o.mal, { etikett: "Hvor lenge" })}
              <p class="hjelp">${o.mal ? `Den som først vinner ${o.mal} runder, vinner kampen.` : "Dere spiller så mange runder dere vil, og avslutter når dere vil."}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor", ikon: DISK_IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = rundeFerdig(S);
          const kanAngre = sp.trekk.length > 0 && !(sp.modus === "mobil" && sp.starter === 1 && sp.trekk.length === 1 && !ferdig);
          return `
            <h1 class="vh" id="skjerm-tittel">Fire på rad, runde ${sp.runde}</h1>
            ${poengHtml(S)}
            ${meldingHtml(S)}
            <span class="fi-luft" aria-hidden="true"></span>
            ${brettHtml(S, { interaktiv: true })}
            <span class="fi-luft under" aria-hidden="true"></span>
            ${R.ui.dokk(
              ferdig ? (kampVunnet(sp) ? R.ui.knapp("Se kåringen", "kaaring", { ikon: "🏆" }) : R.ui.knapp("Ny runde", "runde", { ikon: DISK_IKON })) : "",
              R.ui.lenkerad(
                `<button class="lenke" data-h="angre"${kanAngre ? "" : " disabled"}>↶ Angre</button>`,
                R.ui.lenke("Avslutt", "avslutt"),
              ),
            )}`;
        },
        etter(S, rot) {
          tilpass(rot);
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          startTenking(S);
          if (kampVunnet(S.spill)) tilKaaringOm(S, 1800);
        },
        ut() {
          stoppTenking();
          clearTimeout(kaaringId);
          nyBrikke = null;
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = [0, 1].map((i) => ({ navn: navn(sp, i), i, poeng: sp.poeng[i] }));
          const [a, b] = sp.poeng;
          const vinner = a === b ? null : a > b ? 0 : 1;
          let tittel;
          if (vinner == null) tittel = a === 0 ? "Ingen vinner denne gangen" : "Uavgjort!";
          else if (sp.modus === "mobil") tittel = vinner === 0 ? "Du vinner!" : "Mobilen vinner!";
          else tittel = `${navn(sp, vinner)} vinner!`;
          const runder = a + b + sp.uavgjort;
          const etikett = `${R.flertall(runder, "runde", "runder")}${sp.uavgjort ? ` · ${sp.uavgjort} uavgjort` : ""}`;
          const figur = vinner != null && !(sp.modus === "mobil" && vinner === 1) ? `<span class="fi-vinner">${R.avatar(vinner, "gigant")}<span class="fi-krone" aria-hidden="true">👑</span></span>` : R.figur();
          const tekst =
            sp.modus === "mobil" && vinner === 1 ? "Godt kjempa! Prøv igjen – du blir bedre for hver runde." : vinner == null && a > 0 ? "Like mange seirer hver. Det får avgjøres neste gang!" : "";
          return `
            <div class="banner ${sp.modus === "mobil" && vinner === 1 ? "" : "aksent"}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>
            ${R.ui.poengliste(rader)}
            ${R.ui.flereSpill({ antall: sp.modus === "to" ? 2 : 1 })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen", { ikon: DISK_IKON }), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const [a, b] = sp.poeng;
          if (sp.modus === "to" && !sp.registrert) {
            sp.registrert = true;
            R.kveld.registrer([0, 1].map((i) => ({ i, poeng: sp.poeng[i] })));
            R.lagre();
          }
          if (a !== b && !(sp.modus === "mobil" && b > a)) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else if (sp.modus === "mobil" && b > a) lyd.tap();
          else R.lyd.pling();
          R.slippVaken();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), !!S.spill && S.spill.modus === "mobil")) || !fortsatt()) return;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (S.spill) R.gaTil(S.spill.ferdig ? "slutt" : "spill");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "to" ? "to" : "mobil";
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 3);
        R.vis();
      },
      start(el, e, S) {
        nyKamp(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyKamp(S);
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && kampVunnet(S.spill)) avsluttKamp(S);
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = MAL.includes(m) ? m : 3;
        R.vis();
      },
      runde(el, e, S) {
        if (!S.spill || !rundeFerdig(S)) return;
        if (kampVunnet(S.spill)) return avsluttKamp(S);
        nyRunde(S);
        R.lyd.snu();
        R.vis();
        startTenking(S);
      },
      slipp(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || rundeFerdig(S)) return;
        if (erMaskin(sp, tur(S))) {
          R.toast("Vent litt – mobilen tenker");
          return;
        }
        if (performance.now() < lasTil) return; // the last disc is still falling
        const k = Number(el.dataset.v);
        if (!Fire.kan(hentStilling(S).b, k)) {
          R.lyd.feil();
          R.vibrer(30);
          const kol = el;
          kol.classList.remove("risting");
          void kol.offsetWidth;
          kol.classList.add("risting");
          return;
        }
        leggBrikke(S, k);
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || !sp.trekk.length) return;
        // Against the phone: take back its disc and yours, so it is your turn again. Decided
        // before anything is stopped: with nothing to take back, the phone just thinks on.
        let n = 1;
        if (sp.modus === "mobil") {
          n = erMaskin(sp, tur(S)) ? 1 : 2;
          if (sp.starter === 1) n = Math.min(n, sp.trekk.length - 1);
        }
        n = Math.min(n, sp.trekk.length);
        if (n <= 0) return;
        stoppTenking();
        clearTimeout(kaaringId);
        if (sp.resultat) {
          if (sp.resultat.vinner != null) sp.poeng[sp.resultat.vinner] = Math.max(0, sp.poeng[sp.resultat.vinner] - 1);
          else sp.uavgjort = Math.max(0, sp.uavgjort - 1);
          angreRekord(S, sp.resultat.vinner);
          sp.resultat = null;
        }
        sp.trekk.splice(sp.trekk.length - n, n);
        stilling = null;
        nyBrikke = null;
        R.lyd.snu();
        R.toast(n === 2 ? "Angret – din tur igjen" : "Angret");
        R.vis();
        startTenking(S);
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        const runder = sp.poeng[0] + sp.poeng[1] + sp.uavgjort;
        // The phone waits while the sheet is open (it must not decide a round behind it).
        stoppTenking();
        const ja = await R.bekreft(
          "Avslutte spillet?",
          runder ? `Dere går til kåringen. Stillingen er ${sp.poeng[0]}–${sp.poeng[1]}.` : "Dere kan alltid starte et nytt.",
          "Avslutt",
          "Spill videre",
        );
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return startTenking(S); // «Spill videre»: the phone thinks on
        if (!runder) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });

  // ---------- Board size: the whole board above the dock ----------
  function tilpass(rot) {
    const ramme = rot && rot.querySelector(".fi-ramme");
    if (!ramme) return;
    const rand = parseFloat(getComputedStyle(ramme).getPropertyValue("--rand")) || 10;
    const sett = (b) => {
      ramme.style.width = Math.floor(b) + "px";
      ramme.style.setProperty("--celle", ((Math.floor(b) - 2 * rand) / 7).toFixed(2) + "px");
    };
    // Phones on their side: the board on the left, the score and the buttons to the right of it.
    const liggende = window.matchMedia && window.matchMedia(LIGGENDE).matches;
    let b = Math.min(ramme.parentElement.clientWidth - (liggende ? 270 : 0), 560);
    sett(b);
    for (let n = 0; n < 3; n++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || b <= 240) break;
      // Height = width · 6/7 plus one cell above: shrinking the width by x saves about x.
      b = Math.max(240, b - over - 1);
      sett(b);
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && tilpass(R.$("#skjerm")));
  });

  // Keyboard: the number keys 1–7 drop a disc in that column.
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || R.arkApent() || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = Number(e.key) - 1;
    if (!(k >= 0 && k < KOL)) return;
    const knapp = R.$(`.fi-kol[data-v="${k}"]`);
    if (knapp) knapp.click();
  });
})();
