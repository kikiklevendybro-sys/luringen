/* Bonden — «Bondesjakk»: three in a row on 3 × 3, and «Fem på rad» on a 10 × 10 board of squared
   paper. Two players on one phone or against the phone (Lett, Middels, Uslåelig — Vanskelig for
   five in a row). Quick rounds drawn with a pen, a running score, and who starts alternates.
   The rules and both computer players are pure functions at the top; test/bonden.test.mjs loads
   this file without the kit. */
(function () {
  "use strict";

  // ---------- Rules ----------
  // A board is an array of cells (0 empty, 1 kryss, 2 bolle), row by row.

  const Brett = (() => {
    const VARIANT = {
      tre: { n: 3, rad: 3 },
      fem: { n: 10, rad: 5 },
    };
    const RETNINGER = [[1, 0], [0, 1], [1, 1], [1, -1]];

    // The line of `rad` or more through cell i, as a list of cells (all of it), or null.
    function linje(b, n, rad, i) {
      const s = b[i];
      if (!s) return null;
      const x0 = i % n, y0 = Math.floor(i / n);
      for (const [dx, dy] of RETNINGER) {
        const celler = [i];
        for (let t = -1; t <= 1; t += 2) {
          let x = x0 + dx * t, y = y0 + dy * t;
          while (x >= 0 && x < n && y >= 0 && y < n && b[y * n + x] === s) {
            celler.push(y * n + x);
            x += dx * t;
            y += dy * t;
          }
        }
        if (celler.length >= rad) return celler.sort((a, c) => a - c);
      }
      return null;
    }

    // Replay a list of cells; the first mark is `forste` (1 or 2). Null if a move is impossible.
    function spillUt(variant, liste, forste) {
      const v = VARIANT[variant];
      if (!v) return null;
      const b = new Array(v.n * v.n).fill(0);
      let s = forste || 1;
      let vunnet = null;
      for (const i of liste || []) {
        if (vunnet || !Number.isInteger(i) || i < 0 || i >= b.length || b[i]) return null;
        b[i] = s;
        const l = linje(b, v.n, v.rad, i);
        if (l) vunnet = { spiller: s, celler: l };
        s = 3 - s;
      }
      return { b, n: v.n, rad: v.rad, tur: s, vunnet, fullt: !vunnet && b.every((x) => x) };
    }

    return { VARIANT, linje, spillUt };
  })();

  // ---------- Computer players ----------

  const Data = (() => {
    const LINJER3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const vinner3 = (b) => {
      for (const [a, c, d] of LINJER3) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
      return 0;
    };
    // Perfect play on 3 × 3: +10 − moves for a win, −10 + moves for a loss, 0 for a draw.
    const minne = new Map();
    function verdi(b, s) {
      const nokkel = b.join("") + s;
      if (minne.has(nokkel)) return minne.get(nokkel);
      const v = vinner3(b);
      let svar;
      if (v) svar = v === s ? 10 - b.filter((x) => x).length : -10 + b.filter((x) => x).length;
      else if (b.every((x) => x)) svar = 0;
      else {
        svar = -Infinity;
        for (let i = 0; i < 9; i++)
          if (!b[i]) {
            b[i] = s;
            svar = Math.max(svar, -verdi(b, 3 - s));
            b[i] = 0;
          }
      }
      minne.set(nokkel, svar);
      return svar;
    }
    // The best moves for s (all of them, so the phone doesn't always play the same).
    function beste3(b, s) {
      let best = -Infinity;
      let ut = [];
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = s;
        const v = vinner3(b) === s ? 100 : -verdi(b, 3 - s);
        b[i] = 0;
        if (v > best) {
          best = v;
          ut = [i];
        } else if (v === best) ut.push(i);
      }
      return ut;
    }
    function vinnerTrekk3(b, s) {
      const ut = [];
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = s;
        if (vinner3(b) === s) ut.push(i);
        b[i] = 0;
      }
      return ut;
    }

    // Lett: often takes a win, sometimes blocks, else anywhere. Middels: always wins and blocks,
    // likes the middle and the corners, but doesn't see forks. Uslåelig: perfect.
    function tre(b, s, niva, tilfeldig) {
      const tomme = b.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
      const velg = (liste) => liste[Math.floor(tilfeldig() * liste.length)];
      if (niva >= 3) return velg(beste3(b, s));
      const vinn = vinnerTrekk3(b, s);
      const blokk = vinnerTrekk3(b, 3 - s);
      if (niva === 2) {
        if (vinn.length) return velg(vinn);
        if (blokk.length) return velg(blokk);
        if (!b[4] && tilfeldig() < 0.7) return 4;
        const hjorner = [0, 2, 6, 8].filter((i) => !b[i]);
        if (hjorner.length && tilfeldig() < 0.6) return velg(hjorner);
        return velg(tomme);
      }
      if (vinn.length && tilfeldig() < 0.6) return velg(vinn);
      if (blokk.length && tilfeldig() < 0.35) return velg(blokk);
      return velg(tomme);
    }

    // ----- Five in a row: every candidate cell gets a score for attack and defence -----
    // Lines are judged by windows of five: a window with no opposing mark and k own marks is one
    // step closer to five for each mark. Two different windows that are one move from five make
    // an open four (can't be stopped); several windows with three make an open three.
    const FEM = 10;
    function monster(b, i, s) {
      const n = FEM;
      const x0 = i % n, y0 = Math.floor(i / n);
      const o = 3 - s;
      let fem = 0, apneFire = 0, fire = 0, apneTre = 0, tre = 0, to = 0, poeng = 0;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        let maks = 0;
        let vinduer = 0;
        const tommeFire = new Set();
        for (let start = -4; start <= 0; start++) {
          let k = 0, ok = true;
          let tom = -1;
          for (let j = 0; j < 5; j++) {
            const x = x0 + dx * (start + j), y = y0 + dy * (start + j);
            if (x < 0 || x >= n || y < 0 || y >= n) {
              ok = false;
              break;
            }
            const c = y * n + x;
            const v = c === i ? s : b[c];
            if (v === o) {
              ok = false;
              break;
            }
            if (v === s) k++;
            else tom = c;
          }
          if (!ok) continue;
          if (k > maks) {
            maks = k;
            vinduer = 1;
          } else if (k === maks) vinduer++;
          if (k === 4) tommeFire.add(tom);
          poeng += k * k;
        }
        if (maks === 5) fem++;
        else if (maks === 4) {
          if (tommeFire.size >= 2) apneFire++;
          else fire++;
        } else if (maks === 3) {
          if (vinduer >= 2) apneTre++;
          else tre++;
        } else if (maks === 2) to++;
      }
      let v = poeng;
      if (fem) v += 1e7;
      v += apneFire * 1e6 + fire * 6e4 + apneTre * 8e3 + tre * 600 + to * 90;
      if (fire >= 2 || (fire && apneTre)) v += 4e5; // two threats at once: the other can only stop one
      else if (apneTre >= 2) v += 1.5e5;
      return v;
    }

    function kandidater(b) {
      const n = FEM;
      const ut = [];
      let noe = false;
      for (let i = 0; i < b.length; i++) {
        if (b[i]) {
          noe = true;
          continue;
        }
        const x0 = i % n, y0 = Math.floor(i / n);
        let nabo = false;
        for (let dy = -2; dy <= 2 && !nabo; dy++)
          for (let dx = -2; dx <= 2 && !nabo; dx++) {
            const x = x0 + dx, y = y0 + dy;
            if ((dx || dy) && x >= 0 && x < n && y >= 0 && y < n && b[y * n + x]) nabo = true;
          }
        if (nabo) ut.push(i);
      }
      if (!noe) return [44, 45, 54, 55];
      return ut;
    }

    function vurder(b, s) {
      return kandidater(b)
        .map((i) => {
          const angrep = monster(b, i, s);
          const forsvar = monster(b, i, 3 - s);
          return { i, angrep, forsvar, v: angrep + forsvar * 0.92 };
        })
        .sort((a, c) => c.v - a.v);
    }

    // Every window of five cells on the 10 × 10 board.
    const VINDU5 = [];
    for (let y = 0; y < FEM; y++)
      for (let x = 0; x < FEM; x++)
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const ex = x + 4 * dx, ey = y + 4 * dy;
          if (ex < 0 || ex >= FEM || ey < 0 || ey >= FEM) continue;
          VINDU5.push([0, 1, 2, 3, 4].map((k) => (y + k * dy) * FEM + (x + k * dx)));
        }
    // Cells where s makes five at once, and cells where s makes a four (a threat of five).
    function trusler(b, s) {
      const fem = new Set(), fire = new Set();
      for (const w of VINDU5) {
        let a = 0, m = 0;
        for (const c of w) {
          if (b[c] === s) a++;
          else if (b[c]) m++;
        }
        if (m || a < 3) continue;
        for (const c of w) if (!b[c]) (a === 4 ? fem : fire).add(c);
      }
      return { fem, fire };
    }
    // Victory by continuous fours: a chain of fours (each forces the one block) that ends in two
    // threats of five at once. Returns the first move of such a chain, or −1.
    // teller: one budget shared by every search for this move ({ n, slutt }): at most 3000 nodes
    // and ~25 ms, so even a rare, tangled position never holds up the page.
    function vcf(b, s, dybde, teller) {
      if (dybde <= 0 || teller.n++ > 3000) return -1;
      if ((teller.n & 31) === 0 && performance.now() > teller.slutt) teller.n = 1e9;
      const o = 3 - s;
      const egne = trusler(b, s);
      if (egne.fem.size) return egne.fem.values().next().value;
      if (trusler(b, o).fem.size) return -1; // the other side threatens five: no time for fours
      for (const c of egne.fire) {
        b[c] = s;
        const etter = trusler(b, s).fem;
        let vinn = false;
        if (etter.size >= 2) vinn = true;
        else if (etter.size === 1) {
          const blokk = etter.values().next().value;
          b[blokk] = o;
          vinn = vcf(b, s, dybde - 1, teller) >= 0;
          b[blokk] = 0;
        }
        b[c] = 0;
        if (vinn) return c;
      }
      return -1;
    }

    function fem(b, s, niva, tilfeldig) {
      const liste = vurder(b, s);
      if (!liste.length) return b.indexOf(0);
      const vinn = liste.find((x) => x.angrep >= 1e7);
      if (niva === 1) {
        if (vinn && tilfeldig() < 0.75) return vinn.i;
        const blokk = liste.find((x) => x.forsvar >= 1e7);
        if (blokk && tilfeldig() < 0.6) return blokk.i;
        const topp = liste.slice(0, 8);
        return topp[Math.floor(tilfeldig() * topp.length)].i;
      }
      if (vinn) return vinn.i;
      if (niva === 2) {
        // Middels: the best few, a little at random (it may miss a quiet threat)
        const best = liste[0].v;
        const nesten = liste.filter((x) => x.v >= best * 0.8).slice(0, 3);
        return nesten[Math.floor(tilfeldig() * nesten.length)].i;
      }
      // Vanskelig: block a five; play a forced win if there is one; take away the other side's
      // forced win; otherwise the best cell for attack and defence together.
      const o = 3 - s;
      const motFem = trusler(b, o).fem;
      if (motFem.size) return motFem.values().next().value;
      const budsjett = () => ({ n: 0, slutt: performance.now() + 12 });
      const egen = vcf(b, s, 10, budsjett());
      if (egen >= 0) return egen;
      const deres = vcf(b, o, 8, budsjett());
      if (deres >= 0) {
        const felles = { n: 0, slutt: performance.now() + 12 };
        for (const kand of [{ i: deres }, ...liste.slice(0, 6)]) {
          if (felles.n > 3000 || performance.now() > felles.slutt) break; // out of time: block the start
          b[kand.i] = s;
          const fortsatt = vcf(b, o, 8, { n: 0, slutt: felles.slutt }) >= 0;
          felles.n += 400;
          b[kand.i] = 0;
          if (!fortsatt) return kand.i;
        }
        return deres;
      }
      return toTrekk(b, s, liste);
    }

    // Two moves deep: for each of our best cells, the other side's best answers, and the board's
    // potential after them (open windows of five; the other side's count a little more).
    const VEKT5 = [0, 2, 12, 90, 900, 1e6];
    function potensial(b, s) {
      let v = 0;
      for (const w of VINDU5) {
        let a = 0, m = 0;
        for (const c of w) {
          if (b[c] === s) a++;
          else if (b[c]) m++;
        }
        if (a && !m) v += VEKT5[a];
        else if (m && !a) v -= VEKT5[m] * 1.2;
      }
      return v;
    }
    function toTrekk(b, s, liste) {
      const o = 3 - s;
      let best = null;
      for (const k of liste.slice(0, 8)) {
        b[k.i] = s;
        const svar = vurder(b, o);
        let verst = Infinity;
        if (svar.length && svar[0].angrep >= 1e7) verst = -1e9;
        else
          for (const r of svar.slice(0, 6)) {
            b[r.i] = o;
            verst = Math.min(verst, potensial(b, s));
            b[r.i] = 0;
          }
        b[k.i] = 0;
        if (!best || verst > best.v) best = { i: k.i, v: verst };
      }
      return best.i;
    }

    return { tre, fem, beste3, verdi, vinner3, monster, vurder };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules and the computer players.
    window.Bonden = { Brett, Data };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const MERKE = ["kryss", "bolle"]; // class names // sprak-ok
  const MERKENAVN = [R.t("Kryss"), R.t("Bolle")];
  // The mark as the object of «tegn …» / «tegnet …» (English «a cross», Danish «et kryds»).
  const MERKE_TEGN = [R.t("kryss"), R.t("bolle")];
  // «tre/fem på rad» as one phrase (English «three in a row», Danish «tre på stribe»).
  const PA_RAD = { tre: R.t("tre på rad"), fem: R.t("fem på rad") };
  const NIVANAVN = { tre: { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Uslåelig") }, fem: { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") } };
  const NIVATEKST = {
    tre: { 1: R.t("Mobilen tegner litt hvor som helst. Fint for de minste."), 2: R.t("Mobilen stopper deg – men kan lures."), 3: R.t("Mobilen taper aldri. Klarer du uavgjort?") },
    fem: { 1: R.t("Mobilen tegner litt hvor som helst. Fint for å lære."), 2: R.t("Mobilen stopper det meste. Passe utfordring."), 3: R.t("Mobilen ser trusler før du gjør det. Lykke til!") },
  };
  const MIN_TENK = 520;
  const MAL = [3, 5, 0]; // «Først til 3», «Først til 5», «Uten slutt»
  const LIGGENDE = "(orientation: landscape) and (max-height: 600px) and (min-width: 560px)"; // phones on their side
  let H;

  // S.spill: { id, modus, variant, niva, starter (player who starts this round), trekk (cells),
  //   poeng [p0, p1], uavgjort, runde, resultat { vinner, celler } (this round), ferdig }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, i) => sp.modus === "mobil" && i === 1;
  const navn = (sp, i) => (sp.modus === "mobil" ? (i === 1 ? R.t("Mobilen") : R.t("Du")) : R.navn(i));
  // Player 0 always draws kryss, player 1 bolle; mark number m (1 = the one who started).
  const spillerFor = (sp, m) => (m === 1 ? sp.starter : 1 - sp.starter);

  let stilling = null;
  let stillingFor = "";
  function hentStilling(S) {
    const sp = S.spill;
    const n = sp.id + ":" + sp.runde + ":" + sp.trekk.join(",");
    if (stilling && stillingFor === n) return stilling;
    stilling = Brett.spillUt(sp.variant, sp.trekk, 1);
    stillingFor = n;
    return stilling;
  }
  const tur = (S) => spillerFor(S.spill, hentStilling(S).tur);

  let nyCelle = -1; // the cell to draw with the pen on the next render
  let forslag = -1; // small cells: the cell tapped once (a faint mark waits for the second tap)
  const SMAA_RUTER = 38; // px: below this, a mark needs two taps
  let nyttRutenett = false; // draw the 3 × 3 grid with the pen (new round)
  let tenkId = null;
  let tenkerPa = "";

  // ---------- Sounds: a pen on paper ----------
  const lyd = {
    kryss: () => {
      R.lyd.stoy(0, 0.1, 0.16, 3600);
      R.lyd.stoy(0.16, 0.1, 0.16, 3300);
    },
    bolle: () => R.lyd.stoy(0, 0.3, 0.14, 3000),
    strek: () => R.lyd.stoy(0, 0.35, 0.18, 2600),
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

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
    R.statistikk("ferdig", { modus: sp.modus, variant: sp.variant, niva: sp.modus === "mobil" ? sp.niva : 0, runder: sp.poeng[0] + sp.poeng[1] + sp.uavgjort, uavgjort: sp.uavgjort, mal: sp.mal || 0 });
    R.gaTil("slutt");
  }
  const tallTekst = (sp) => [sp.mal ? esc(R.t("først til {n}", { n: sp.mal })) : "", sp.uavgjort ? esc(R.flertall(sp.uavgjort, "uavgjort", "uavgjort")) : ""].filter(Boolean).join("<br>");

  function settMerke(S, i) {
    const sp = S.spill;
    const st = hentStilling(S);
    if (sp.resultat || st.b[i]) return;
    forslag = -1;
    const merke = st.tur;
    const hvem = spillerFor(sp, merke);
    sp.trekk.push(i);
    const ny = hentStilling(S);
    nyCelle = i;
    (hvem === 0 ? lyd.kryss : lyd.bolle)();
    R.vibrer(10);
    const fortsatt = R.vakt();
    const runde = sp.runde;
    if (ny.vunnet) {
      sp.resultat = { vinner: hvem, celler: ny.vunnet.celler };
      sp.poeng[hvem]++;
      telRekord(S, hvem);
      if (sp.modus === "mobil" && hvem === 0) R.merke("klassiker-bonden");
      const mobil = sp.modus === "mobil";
      const rad = PA_RAD[sp.variant === "tre" ? "tre" : "fem"];
      R.si(
        (mobil ? (hvem === 0 ? R.t("Du får {rad}!", { rad }) : R.t("Mobilen får {rad}!", { rad })) : R.t("{navn} får {rad}!", { navn: navn(sp, hvem), rad })) +
          (kampVunnet(sp) ? " " + (mobil ? (hvem === 0 ? R.t("Du vinner kampen.") : R.t("Mobilen vinner kampen.")) : R.t("{navn} vinner kampen.", { navn: navn(sp, hvem) })) : ""),
      );
      setTimeout(() => fortsatt() && R.S.spill && R.S.spill.runde === runde && R.S.spill.resultat && lyd.strek(), 380);
      setTimeout(() => fortsatt() && R.S.spill && R.S.spill.runde === runde && R.S.spill.resultat && feir(R.S), 780);
      if (kampVunnet(sp)) tilKaaringOm(S, 3000);
    } else if (ny.fullt) {
      sp.resultat = { vinner: null, celler: [] };
      sp.uavgjort++;
      telRekord(S, null);
      R.si(R.t("Uavgjort!"));
      setTimeout(() => fortsatt() && R.lyd.pling(), 450);
    } else {
      const merke = MERKE_TEGN[hvem === 0 ? 0 : 1];
      const la = sp.modus === "mobil" ? (hvem === 0 ? R.t("Du tegnet {merke}.", { merke }) : R.t("Mobilen tegnet {merke}.", { merke })) : R.t("{navn} tegnet {merke}.", { navn: navn(sp, hvem), merke });
      const neste = sp.modus === "mobil" ? (tur(S) === 0 ? R.t("Din tur.") : R.t("Mobilen sin tur.")) : R.t("{navn} sin tur.", { navn: navn(sp, tur(S)) });
      R.si(`${la} ${neste}`);
    }
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
    R.lyd.fanfare();
    R.vibrer([40, 60, 120]);
    R.konfetti(v === 0 ? ["--rosa", "--papir", "--lampe"] : ["--himmel", "--papir", "--mynte"]);
  }


  const rekordNokkel = (sp) => `${sp.variant}-${sp.niva}`;
  function telRekord(S, vinner, minus) {
    const sp = S.spill;
    if (sp.modus !== "mobil") return;
    const r = S.rekord[rekordNokkel(sp)] || (S.rekord[rekordNokkel(sp)] = { seier: 0, uavgjort: 0, tap: 0 });
    const felt = vinner == null ? "uavgjort" : vinner === 0 ? "seier" : "tap";
    r[felt] = Math.max(0, r[felt] + (minus ? -1 : 1));
  }

  // ---------- The phone's turn ----------
  function startTenking(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.resultat || S.skjerm !== "spill" || !erMaskin(sp, tur(S))) return;
    const nokkel = sp.id + ":" + sp.runde + ":" + sp.trekk.length;
    if (tenkId && tenkerPa === nokkel) return;
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    // A short, natural pause; the move itself takes a few milliseconds.
    tenkId = setTimeout(() => {
      tenkId = null;
      tenkerPa = "";
      if (!fortsatt() || !R.S.spill || R.S.spill.resultat || R.S.spill.id + ":" + R.S.spill.runde + ":" + R.S.spill.trekk.length !== nokkel) return;
      const st = hentStilling(R.S);
      const b = st.b.slice();
      const i = R.S.spill.variant === "tre" ? Data.tre(b, st.tur, R.S.spill.niva, Math.random) : Data.fem(b, st.tur, R.S.spill.niva, Math.random);
      settMerke(R.S, i >= 0 && !st.b[i] ? i : st.b.indexOf(0));
    }, MIN_TENK + (sp.variant === "fem" ? 150 : 0));
  }
  function stoppTenking() {
    clearTimeout(tenkId);
    tenkId = null;
    tenkerPa = "";
  }

  // ---------- Markup ----------

  // Hand-drawn marks (pathLength 1, so the pen animation is the same for every size).
  const KRYSS = '<path pathLength="1" d="M25 27C38 40 55 57 75 75"/><path class="to" pathLength="1" d="M74 25C59 41 43 58 26 75"/>';
  const BOLLE = '<path pathLength="1" d="M49 21C67 20 80 33 80 50C80 68 66 80 49 80C31 80 20 67 20 50C20 34 31 22 47 21"/>';
  const merkeSvg = (i, ny) => `<svg class="bo-merke ${MERKE[i]}${ny ? " ny" : ""}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${i === 0 ? KRYSS : BOLLE}</svg>`;

  function poengHtml(S) {
    const sp = S.spill;
    const naa = sp.resultat ? -1 : tur(S);
    // The player's own mark, drawn in coloured ink next to the name (no badge on the avatar).
    const kort = (i) => `<div class="bo-spiller ${MERKE[i]}${naa === i ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === i ? " vant" : ""}">
        <span class="bo-figur" aria-hidden="true">${figurFor(sp, i)}</span>
        <b class="bo-navn"><span class="bo-navnetegn" aria-hidden="true">${merkeSvg(i, false)}</span><span class="bo-navnetekst">${esc(navn(sp, i))}</span></b>
      </div>`;
    return `<div class="bo-stilling" role="group" aria-label="${esc(R.t("Stillingen: {a} (kryss) {pa}, {b} (bolle) {pb}", { a: navn(sp, 0), pa: sp.poeng[0], b: navn(sp, 1), pb: sp.poeng[1] }))}">
      ${kort(0)}
      <div class="bo-tall" aria-hidden="true"><b>${sp.poeng[0]}</b><span>–</span><b>${sp.poeng[1]}</b>${tallTekst(sp) ? `<small>${tallTekst(sp)}</small>` : ""}</div>
      ${kort(1)}
    </div>`;
  }
  const figurFor = (sp, i) => (erMaskin(sp, i) ? `<span class="bo-maskin">${R.figur()}</span>` : R.avatar(i));

  function meldingHtml(S) {
    const sp = S.spill;
    if (sp.resultat) {
      const v = sp.resultat.vinner;
      if (v == null) return `<p class="bo-melding uavgjort"><span>${esc(R.t("Uavgjort! Ingen fikk {rad}.", { rad: PA_RAD[sp.variant === "tre" ? "tre" : "fem"] }))}</span></p>`;
      let tekst = sp.modus === "mobil" ? (v === 0 ? R.t("Du vinner!") : R.t("Mobilen vinner denne gangen!")) : R.t("{navn} vinner!", { navn: navn(sp, v) });
      if (kampVunnet(sp)) tekst = sp.modus === "mobil" ? (v === 0 ? R.t("Du vinner kampen – først til {n}!", { n: sp.mal }) : R.t("Mobilen vinner kampen!")) : R.t("{navn} vinner kampen!", { navn: navn(sp, v) });
      return `<p class="bo-melding vinner ${MERKE[v]}"><span>${esc(tekst)}</span></p>`;
    }
    const i = tur(S);
    const forste = sp.trekk.length === 0;
    const merke = MERKE_TEGN[i === 0 ? 0 : 1];
    let tekst;
    if (erMaskin(sp, i)) tekst = `<span class="bo-tenker">${esc(forste ? R.t("Mobilen begynner") : R.t("Mobilen tenker"))}<i>.</i><i>.</i><i>.</i></span>`;
    else if (forslag >= 0) tekst = esc(R.t("Trykk en gang til for å tegne"));
    else if (sp.modus === "mobil") tekst = esc(forste ? R.t("Du begynner – tegn {merke}!", { merke }) : R.t("Din tur – tegn {merke}", { merke }));
    else tekst = esc(forste ? R.t("{navn} begynner med {merke}!", { navn: navn(sp, i), merke }) : R.t("{navn} sin tur", { navn: navn(sp, i) }));
    return `<p class="bo-melding ${MERKE[i]}"><span class="bo-meldingsfigur" aria-hidden="true">${figurFor(sp, i)}</span><span>${tekst}</span></p>`;
  }

  function brettHtml(S, o) {
    const sp = S.spill;
    const st = hentStilling(S);
    const n = st.n;
    const vinnende = new Set(sp.resultat ? sp.resultat.celler : []);
    const kanTrykke = o.interaktiv && !sp.resultat && !erMaskin(sp, tur(S));
    const sist = sp.trekk.length ? sp.trekk[sp.trekk.length - 1] : -1;
    const celler = st.b
      .map((m, i) => {
        const hvem = m ? spillerFor(sp, m) : -1;
        const ny = o.interaktiv && i === nyCelle && !R.rolig();
        const k = ["bo-celle"];
        if (vinnende.has(i)) k.push("vinn");
        if (i === sist && n > 3 && !sp.resultat) k.push("sist");
        // Small cells: the first tap shows a faint mark, the second one draws it.
        const skisse = kanTrykke && !m && i === forslag;
        if (skisse) k.push("forslag");
        const etikett = esc(R.t("Rad {r}, kolonne {k}", { r: Math.floor(i / n) + 1, k: (i % n) + 1 }) + (m ? `: ${MERKENAVN[hvem].toLowerCase()}` : skisse ? ", " + R.t("valgt – trykk igjen for å tegne") : ", " + R.t("tom")));
        const innhold = hvem >= 0 ? merkeSvg(hvem, ny) : skisse ? merkeSvg(tur(S), false) : "";
        return o.interaktiv
          ? `<button class="${k.join(" ")}" data-h="merk" data-v="${i}" data-stille aria-label="${etikett}"${m || !kanTrykke ? ' aria-disabled="true"' : ""}>${innhold}</button>`
          : `<span class="${k.join(" ")}">${innhold}</span>`;
      })
      .join("");
    if (o.interaktiv) nyCelle = -1;
    const tegnRutenett = o.interaktiv && nyttRutenett && !R.rolig();
    if (o.interaktiv) nyttRutenett = false;
    // The 3 × 3 grid is drawn by hand; the big board is squared paper.
    const rutenett =
      n === 3
        ? `<svg class="bo-rutenett${tegnRutenett ? " tegn" : ""}" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M101 12C99 90 102 190 100 288"/><path pathLength="1" d="M200 10C202 100 199 200 201 290"/><path pathLength="1" d="M12 100C90 102 200 98 288 101"/><path pathLength="1" d="M10 200C100 198 190 202 290 199"/></svg>`
        : "";
    let strek = "";
    let penn = "";
    if (sp.resultat && sp.resultat.celler.length) {
      const c = sp.resultat.celler;
      const a = c[0], z = c[c.length - 1];
      const midt = (i) => [((i % n) + 0.5) * (300 / n), (Math.floor(i / n) + 0.5) * (300 / n)];
      let [x1, y1] = midt(a);
      let [x2, y2] = midt(z);
      // a little past both ends, like a real pen stroke
      const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ut = (300 / n) * 0.32;
      x1 -= (dx / l) * ut;
      y1 -= (dy / l) * ut;
      x2 += (dx / l) * ut;
      y2 += (dy / l) * ut;
      const d = `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
      // A highlighter under the marks, then the pen stroke through them.
      penn = `<svg class="bo-penn" viewBox="0 0 300 300" aria-hidden="true"><path pathLength="1" d="${d}" style="stroke-width:${((300 / n) * 0.46).toFixed(1)}"/></svg>`;
      strek = `<svg class="bo-strek ${MERKE[sp.resultat.vinner]}" viewBox="0 0 300 300" aria-hidden="true"><path pathLength="1" d="${d}"/></svg>`;
    }
    return `<div class="bo-papir ${n === 3 ? "tre" : "fem"}${o.liten ? " liten" : ""}">
      <div class="bo-brett" style="--n:${n}"${o.interaktiv ? ` role="group" aria-label="${esc(R.t("Brettet, {n} ganger {n} ruter", { n }))}"` : ' aria-hidden="true"'}>
        ${rutenett}
        ${penn}
        <div class="bo-celler">${celler}</div>
        ${strek}
      </div>
    </div>`;
  }

  // ---------- Setup and flow ----------

  function forsteStarter(S) {
    const i = S.nesteStarter === 0 || S.nesteStarter === 1 ? S.nesteStarter : R.nyttFro() % 2;
    S.nesteStarter = 1 - i;
    return i;
  }

  function nyKamp(S) {
    const o = S.oppsett;
    S.spill = {
      id: R.nyttFro() % 1e9,
      modus: o.modus,
      variant: o.variant,
      niva: o.niva,
      mal: o.mal,
      // Who opens round 1 takes turns from match to match (the first time: chance), so nobody
      // always gets three of five openings in «Først til 3».
      starter: forsteStarter(S),
      trekk: [],
      poeng: [0, 0],
      uavgjort: 0,
      runde: 1,
      resultat: null,
      ferdig: false,
      registrert: false,
    };
    stilling = null;
    nyCelle = -1;
    forslag = -1;
    nyttRutenett = true;
    stoppTenking();
    R.statistikk("start", { modus: o.modus, variant: o.variant, niva: o.modus === "mobil" ? o.niva : 0, mal: o.mal });
  }

  function nyRunde(S) {
    const sp = S.spill;
    sp.runde++;
    sp.starter = 1 - sp.starter;
    sp.trekk = [];
    sp.resultat = null;
    stilling = null;
    nyCelle = -1;
    forslag = -1;
    nyttRutenett = true;
    stoppTenking();
  }

  function rekordHtml(S, nokkel) {
    const r = S.rekord[nokkel];
    if (!r || !(r.seier + r.uavgjort + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.uavgjort}</b> ${esc(R.t("uavgjort|uavgjort", { n: r.uavgjort }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }

  // The game's icon on buttons: a little kryss and bolle drawn side by side.
  const XO_IKON = `<svg class="bo-knappetegn" viewBox="0 0 200 100" aria-hidden="true" focusable="false"><path class="x" d="M22 26C34 40 50 57 70 74"/><path class="x" d="M69 25C55 41 40 58 23 75"/><path class="o" d="M149 22C167 21 179 34 179 50C179 67 166 79 149 79C132 79 120 67 120 50C120 35 131 23 147 22"/></svg>`;

  R.start({
    id: "bonden",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", variant: "tre", niva: 2, mal: 3 },
      spill: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", variant: "tre", niva: 2, mal: 3 }, S.oppsett));
      if (!MAL.includes(o.mal)) o.mal = 3;
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!Brett.VARIANT[o.variant]) o.variant = "tre";
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const st = Array.isArray(sp.trekk) && Brett.VARIANT[sp.variant] && Array.isArray(sp.poeng) && [0, 1].includes(sp.starter) ? Brett.spillUt(sp.variant, sp.trekk, 1) : null;
        if (!st) S.spill = null;
        else {
          if (!MAL.includes(sp.mal)) sp.mal = 0; // saved before «Først til 3»: no end
          if (st.vunnet && !sp.resultat) sp.resultat = { vinner: spillerFor(sp, st.vunnet.spiller), celler: st.vunnet.celler };
          if (!st.vunnet && !st.fullt) sp.resultat = null;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Kryss og bolle: Få tre på rad før motstanderen gjør det. Eller prøv fem på rad på det store brettet."),
      steg: [
        [R.t("Tegn merket ditt"), R.t("Trykk på en tom rute. Den ene tegner kryss, den andre bolle.")],
        [R.t("Tre på rad"), R.t("Få tre like etter hverandre – bortover, nedover eller på skrå. På det store brettet trengs fem.")],
        [R.t("Stopp motstanderen"), R.t("Har den andre to på rad og en ledig rute? Ta ruta før det er for sent!")],
      ],
      tips: [
        R.t("Midten er sterk, og hjørnene er nesten like gode."),
        R.t("Lag to trusler på en gang, så klarer ikke motstanderen å stoppe begge."),
        R.t("Fem på rad: Fire på rad med ledig plass i begge ender kan ikke stoppes."),
        R.t("Dere bytter på å begynne."),
        R.t("Først til 3: Den som først vinner tre runder, vinner kampen. Velg «Uten slutt» hvis dere bare vil spille videre."),
        R.t("Fem på rad på en liten skjerm: Trykk én gang for å se merket svakt, og én gang til for å tegne det."),
        R.t("Uslåelig-nivået taper aldri. Klarer du uavgjort?"),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = ["tre", "fem"].flatMap((v) => [1, 2, 3].map((n) => [v, n, rekordHtml(S, `${v}-${n}`)])).filter(([, , h]) => h);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Kryss eller bolle?"))}<br><em>${esc(R.t("Tre på rad vinner!"))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · {stilling}", { stilling: `${sp.poeng[0]}–${sp.poeng[1]}` }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–2", R.t("spillere")],
                ["2", R.t("brett")],
                ["0", R.t("reklame")],
              ],
            }) +
            (rek.length
              ? `<section class="bo-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([v, n, h]) => `<li><b class="bo-niva">${esc(v === "tre" ? R.t("Tre på rad") : R.t("Fem på rad"))} · ${esc(NIVANAVN[v][n])}</b>${h}</li>`).join("")}</ul></section>`
              : "")
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan vil du spille?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: R.t("Mot mobilen"), tekst: R.t("Tre nivåer") },
                  { v: "to", ikon: "👥", tittel: R.t("To spillere"), tekst: R.t("På samme mobil") },
                ],
                o.modus,
              )}
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Brettet"))}</h2>
              ${R.ui.seg(
                "variant",
                [
                  ["tre", R.t("Tre på rad · 3 × 3")],
                  ["fem", R.t("Fem på rad · 10 × 10")],
                ],
                o.variant,
                { etikett: R.t("Brettet") },
              )}
            </section>
            ${
              o.modus === "mobil"
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", [1, 2, 3].map((n) => [n, NIVANAVN[o.variant][n]]), o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(NIVATEKST[o.variant][o.niva])}</p>
                  </section>
                  <p class="hjelp">${esc(R.t("Du tegner kryss. Du og mobilen bytter på å begynne."))}</p>`
                : R.ui.spillere({ min: 2, max: 2, tittel: R.t("Spillerne"), hjelp: R.t("Spiller 1 tegner kryss, spiller 2 bolle. Dere bytter på å begynne.") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Hvor lenge?"))}</h2>
              ${R.ui.seg("mal", MAL.map((m) => [m, m ? R.t("Først til {n}", { n: m }) : R.t("Uten slutt")]), o.mal, { etikett: R.t("Hvor lenge") })}
              <p class="hjelp">${esc(o.mal ? R.t("Den som først vinner {n} runder, vinner kampen.", { n: o.mal }) : R.t("Dere spiller så mange runder dere vil, og avslutter når dere vil."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: XO_IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.runde }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = !!sp.resultat;
          const kanAngre = sp.trekk.length > 0 && !(sp.modus === "mobil" && sp.starter === 1 && sp.trekk.length === 1 && !ferdig);
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(sp.variant === "tre" ? R.t("Tre på rad, runde {n}", { n: sp.runde }) : R.t("Fem på rad, runde {n}", { n: sp.runde }))}</h1>
            ${poengHtml(S)}
            ${meldingHtml(S)}
            <span class="bo-luft" aria-hidden="true"></span>
            ${brettHtml(S, { interaktiv: true })}
            <span class="bo-luft under" aria-hidden="true"></span>
            ${R.ui.dokk(
              ferdig ? (kampVunnet(sp) ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Ny runde"), "runde", { ikon: XO_IKON })) : "",
              R.ui.lenkerad(`<button class="lenke" data-h="angre"${kanAngre ? "" : " disabled"}>↶ ${esc(R.t("Angre"))}</button>`, R.ui.lenke(R.t("Avslutt"), "avslutt")),
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
          nyCelle = -1;
          forslag = -1;
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = [0, 1].map((i) => ({ navn: navn(sp, i), i, poeng: sp.poeng[i] }));
          const [a, b] = sp.poeng;
          const vinner = a === b ? null : a > b ? 0 : 1;
          let tittel;
          if (vinner == null) tittel = a === 0 ? R.t("Ingen vinner denne gangen") : R.t("Uavgjort!");
          else if (sp.modus === "mobil") tittel = vinner === 0 ? R.t("Du vinner!") : R.t("Mobilen vinner!");
          else tittel = R.t("{navn} vinner!", { navn: navn(sp, vinner) });
          const runder = a + b + sp.uavgjort;
          const etikett = `${R.flertall(runder, "runde", "runder")}${sp.uavgjort ? ` · ${R.flertall(sp.uavgjort, "uavgjort", "uavgjort")}` : ""}`;
          const figur = vinner != null && !(sp.modus === "mobil" && vinner === 1) ? `<span class="bo-vinner">${R.avatar(vinner, "gigant")}<span class="bo-krone" aria-hidden="true">👑</span></span>` : R.figur();
          let tekst = "";
          if (sp.modus === "mobil" && vinner === 1) tekst = sp.niva === 3 && sp.variant === "tre" ? R.t("Uslåelig er uslåelig! Men uavgjort er også en bragd.") : R.t("Godt kjempa! Prøv igjen – du blir bedre for hver runde.");
          else if (sp.modus === "mobil" && vinner == null && sp.niva === 3 && sp.variant === "tre" && sp.uavgjort) tekst = R.t("Uavgjort mot Uslåelig – det er så godt det går an!");
          else if (vinner == null && a > 0) tekst = R.t("Like mange seirer hver. Det får avgjøres neste gang!");
          return `
            <div class="banner ${sp.modus === "mobil" && vinner === 1 ? "" : "aksent"}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>
            ${R.ui.poengliste(rader)}
            ${R.ui.flereSpill({ antall: sp.modus === "to" ? 2 : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: XO_IKON }), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
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
      variant(el, e, S) {
        S.oppsett.variant = Brett.VARIANT[el.dataset.v] ? el.dataset.v : "tre";
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
        if (!S.spill || !S.spill.resultat) return;
        if (kampVunnet(S.spill)) return avsluttKamp(S);
        nyRunde(S);
        R.vis();
        startTenking(S);
      },
      merk(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        if (erMaskin(sp, tur(S))) {
          R.toast(R.t("Vent litt – mobilen tenker"));
          return;
        }
        const i = Number(el.dataset.v);
        if (hentStilling(S).b[i]) return;
        // Small cells, touched with a finger (not the keyboard): first a faint mark, then the real one.
        const liten = el.getBoundingClientRect().width < SMAA_RUTER;
        if (liten && e && e.detail > 0 && forslag !== i) {
          forslag = i;
          R.lyd.tone(1500, 0, 0.04, "sine", 0.06);
          R.vis();
          return;
        }
        settMerke(S, i);
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || !sp.trekk.length) return;
        // Decided before anything is stopped: with nothing to take back, the phone thinks on.
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
          telRekord(S, sp.resultat.vinner, true);
          sp.resultat = null;
        }
        sp.trekk.splice(sp.trekk.length - n, n);
        stilling = null;
        nyCelle = -1;
        forslag = -1;
        R.lyd.snu();
        R.toast(n === 2 ? R.t("Angret – din tur igjen") : R.t("Angret"));
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
          R.t("Avslutte spillet?"),
          runder ? R.t("Dere går til kåringen. Stillingen er {stilling}.", { stilling: `${sp.poeng[0]}–${sp.poeng[1]}` }) : R.t("Dere kan alltid starte et nytt."),
          R.t("Avslutt"),
          R.t("Spill videre"),
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
    const papir = rot && rot.querySelector(".bo-papir");
    if (!papir) return;
    // Phones on their side: the board on the left, the score and the buttons to the right of it.
    const liggende = window.matchMedia && window.matchMedia(LIGGENDE).matches;
    let b = Math.min(papir.parentElement.clientWidth - (liggende ? 270 : 0), 560);
    papir.style.width = b + "px";
    for (let n = 0; n < 3; n++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || b <= 240) break;
      b = Math.max(240, b - over - 1);
      papir.style.width = Math.floor(b) + "px";
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && tilpass(R.$("#skjerm")));
  });
})();
