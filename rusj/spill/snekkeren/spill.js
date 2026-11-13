/* Snekkeren — dots and boxes («prikker og bokser») on squared paper: draw a line between two dots;
   the one who closes a box owns it and draws again. Most boxes wins. Boards from 3 × 3 to 6 × 6
   boxes; two players on one phone, or against the phone at three levels.
   The rules (Boks) and the engine (Motor: Lett takes boxes now and then, Middels never gives a box
   away while it can help it and then gives the fewest, Vanskelig also plays the chain endgame:
   it counts the chains, keeps control by leaving the last two boxes of a chain, and searches the
   last safe moves for the right parity) are pure functions at the top of this file;
   test/snekkeren.test.mjs loads the file without the kit. */
(function () {
  "use strict";

  // ---------- The rules ----------
  // n × n boxes, (n + 1) × (n + 1) dots. Lines: first the horizontal ones, row by row (r 0…n,
  // c 0…n−1: id r·n + c), then the vertical ones (r 0…n−1, c 0…n: id n(n+1) + r(n+1) + c).
  // Box b = r·n + c. Player 0 starts (the page decides who that is).

  const Boks = (() => {
    const STORRELSER = [3, 4, 5, 6];
    const geo = new Map();
    function geometri(n) {
      if (geo.has(n)) return geo.get(n);
      const H = n * (n + 1);
      const L = 2 * H;
      const linjeBokser = [];
      const boksLinjer = [];
      for (let b = 0; b < n * n; b++) {
        const r = Math.floor(b / n), c = b % n;
        boksLinjer.push([r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1]);
      }
      for (let l = 0; l < L; l++) linjeBokser.push([]);
      boksLinjer.forEach((ls, b) => ls.forEach((l) => linjeBokser[l].push(b)));
      // The two dots of each line: [r1, c1, r2, c2]
      const ender = [];
      for (let l = 0; l < L; l++) {
        if (l < H) {
          const r = Math.floor(l / n), c = l % n;
          ender.push([r, c, r, c + 1]);
        } else {
          const k = l - H;
          const r = Math.floor(k / (n + 1)), c = k % (n + 1);
          ender.push([r, c, r + 1, c]);
        }
      }
      const g = { n, H, L, linjeBokser, boksLinjer, ender };
      geo.set(n, g);
      return g;
    }

    function nyttParti(n) {
      const g = geometri(n);
      return { n, g, linjer: new Uint8Array(g.L), sider: new Uint8Array(n * n), eier: new Int8Array(n * n).fill(-1), tur: 0, poeng: [0, 0], hist: [], slutt: false };
    }
    const kan = (p, l) => Number.isInteger(l) && l >= 0 && l < p.g.L && !p.linjer[l] && !p.slutt;
    function lovlige(p) {
      const ut = [];
      if (p.slutt) return ut;
      for (let l = 0; l < p.g.L; l++) if (!p.linjer[l]) ut.push(l);
      return ut;
    }
    // Draw line l; returns { l, tur, tatt: [boxes] } or null.
    function spill(p, l) {
      if (!kan(p, l)) return null;
      p.linjer[l] = 1;
      const tatt = [];
      for (const b of p.g.linjeBokser[l])
        if (++p.sider[b] === 4) {
          p.eier[b] = p.tur;
          tatt.push(b);
        }
      const h = { l, tur: p.tur, tatt };
      p.poeng[p.tur] += tatt.length;
      if (!tatt.length) p.tur = 1 - p.tur;
      p.hist.push(h);
      p.slutt = p.hist.length === p.g.L;
      return h;
    }
    function tilbake(p) {
      const h = p.hist.pop();
      if (!h) return null;
      p.linjer[h.l] = 0;
      for (const b of p.g.linjeBokser[h.l]) {
        if (p.sider[b] === 4) p.eier[b] = -1;
        p.sider[b]--;
      }
      p.poeng[h.tur] -= h.tatt.length;
      p.tur = h.tur;
      p.slutt = false;
      return h;
    }
    function spillUt(n, liste) {
      if (!STORRELSER.includes(n) || !Array.isArray(liste)) return null;
      const p = nyttParti(n);
      for (const l of liste) if (!spill(p, l)) return null;
      return p;
    }
    // { slutt, vinner (0 | 1 | null), poeng }
    function status(p) {
      return { slutt: p.slutt, vinner: !p.slutt || p.poeng[0] === p.poeng[1] ? null : p.poeng[0] > p.poeng[1] ? 0 : 1, poeng: p.poeng.slice() };
    }
    // Lines that close a box now; lines that give the other side a box (a third side).
    const lukker = (p, l) => p.g.linjeBokser[l].some((b) => p.sider[b] === 3);
    const gir = (p, l) => p.g.linjeBokser[l].some((b) => p.sider[b] === 2);

    return { STORRELSER, geometri, nyttParti, kan, lovlige, spill, tilbake, spillUt, status, lukker, gir };
  })();

  // ---------- The engine ----------

  const Motor = (() => {
    const { lovlige, spill, tilbake, lukker, gir } = Boks;
    const NIVA = { 1: {}, 2: {}, 3: { noder: 120000, ms: 600 } };
    const tilf = (liste, r) => liste[Math.floor(r() * liste.length)];

    // How many boxes the side to move would collect by taking every box it can, one after another
    // (undone afterwards).
    function gratis(p) {
      let n = 0, k = 0;
      for (;;) {
        let l = -1;
        for (let i = 0; i < p.g.L; i++) if (!p.linjer[i] && lukker(p, i)) {
          l = i;
          break;
        }
        if (l < 0) break;
        n += spill(p, l).tatt.length;
        k++;
      }
      for (let i = 0; i < k; i++) tilbake(p);
      return n;
    }

    // The chains and loops left when every line gives a box away: the boxes that are not taken,
    // joined by undrawn lines. A loop: every box has two open sides, both inside the group.
    function grupper(p) {
      const { n, g } = p;
      const sett = new Int16Array(n * n).fill(-1);
      const ut = [];
      for (let s = 0; s < n * n; s++) {
        if (p.eier[s] >= 0 || sett[s] >= 0) continue;
        const bokser = [s];
        sett[s] = ut.length;
        let lokke = true;
        for (let i = 0; i < bokser.length; i++) {
          const b = bokser[i];
          let apne = 0;
          for (const l of g.boksLinjer[b]) {
            if (p.linjer[l]) continue;
            apne++;
            const andre = g.linjeBokser[l].find((x) => x !== b);
            if (andre == null) lokke = false;
            else if (sett[andre] < 0) {
              sett[andre] = ut.length;
              bokser.push(andre);
            }
          }
          if (apne !== 2) lokke = false;
        }
        ut.push({ bokser, lokke: lokke && bokser.length >= 4 });
      }
      return ut;
    }

    // The value (boxes, for the side to move) of the endgame where every move opens a chain or a
    // loop: the opener gives it away; the other side takes it all and must open the next, or takes
    // all but two (four in a loop) and makes the opener open the next.
    const minne = new Map();
    function verdi(deler) {
      if (!deler.length) return 0;
      const nokkel = deler.join(",");
      if (minne.has(nokkel)) return minne.get(nokkel);
      let best = -Infinity;
      const sett = new Set();
      for (let i = 0; i < deler.length; i++) {
        if (sett.has(deler[i])) continue;
        sett.add(deler[i]);
        const resten = deler.slice(0, i).concat(deler.slice(i + 1));
        const f = verdi(resten);
        const lokke = deler[i] < 0;
        const s = Math.abs(deler[i]);
        let motpart = s + f; // takes everything, then opens the next
        if (resten.length && ((lokke && s >= 4) || (!lokke && s >= 3))) motpart = Math.max(motpart, lokke ? s - 8 - f : s - 4 - f);
        best = Math.max(best, -motpart);
      }
      best = best || 0; // never −0
      minne.set(nokkel, best);
      return best;
    }
    // Chains as positive sizes, loops as negative ones, sorted (the memo key).
    const deler = (p) => grupper(p).map((x) => (x.lokke ? -x.bokser.length : x.bokser.length)).sort((a, b) => a - b);

    // Search the safe moves (moves that give nothing away) for the best way into the endgame.
    function sikre(p) {
      const ut = [];
      for (let l = 0; l < p.g.L; l++) if (!p.linjer[l] && !gir(p, l) && !lukker(p, l)) ut.push(l);
      return ut;
    }
    // A generator that yields every 256 nodes, so the page can run it in slices (tenk).
    function* trygtSok(p, k, memo) {
      const s = sikre(p);
      if (!s.length) return verdi(deler(p));
      const nokkel = p.linjer.join("");
      if (memo.has(nokkel)) return memo.get(nokkel);
      if (++k.noder > k.maks || ((k.noder & 63) === 0 && k.klokke() > k.slutt)) {
        k.stopp = true;
        return 0;
      }
      if ((k.noder & 255) === 0) yield;
      let best = -Infinity;
      for (const l of s) {
        spill(p, l);
        const v = -(yield* trygtSok(p, k, memo));
        tilbake(p);
        if (k.stopp) return 0;
        if (v > best) best = v;
      }
      memo.set(nokkel, best);
      return best;
    }

    // A box that may be taken whose last box after it is a «domino»: X (three sides) shares its
    // open line with Y (two sides), and Y's other open line leads nowhere (the edge, or a box that
    // is not part of the chain). Returns { lx, ly } or null.
    function domino(p) {
      const { g } = p;
      let funnet = null;
      for (let b = 0; b < p.n * p.n; b++) {
        if (p.sider[b] !== 3) continue;
        const lx = g.boksLinjer[b].find((l) => !p.linjer[l]);
        const y = g.linjeBokser[lx].find((x) => x !== b);
        if (y == null || p.sider[y] !== 2) return null; // a box to take that is not a domino end
        const ly = g.boksLinjer[y].find((l) => l !== lx && !p.linjer[l]);
        const z = g.linjeBokser[ly].find((x) => x !== y);
        if (z != null && p.sider[z] === 2) return null; // the chain goes on
        if (funnet) return null; // more than one box to take
        funnet = { lx, ly };
      }
      return funnet;
    }

    // The phone's line. o: { niva, tilfeldig, klokke, noder, ms }.
    function* finn(p, o) {
      const r = o.tilfeldig || Math.random;
      const alle = lovlige(p);
      if (!alle.length) return -1;
      const niva = NIVA[o.niva] ? o.niva : 2;
      const fang = alle.filter((l) => lukker(p, l));
      const trygge = alle.filter((l) => !lukker(p, l) && !gir(p, l));
      if (niva === 1) {
        if (fang.length && r() < 0.75) return tilf(fang, r);
        if (trygge.length && r() < 0.5) return tilf(trygge, r);
        return tilf(alle, r);
      }
      if (fang.length) {
        if (niva === 3) {
          const d = domino(p);
          if (d) {
            // Take both and open the next yourself, or give the two away and keep control.
            spill(p, d.lx);
            const etter = p.hist.length;
            const ekstra = p.slutt ? null : (spill(p, d.ly), true);
            let velgLy = false;
            if (ekstra && !p.slutt && !sikre(p).length && !lovlige(p).some((l) => lukker(p, l))) {
              const f = verdi(deler(p));
              velgLy = -2 - f > 2 + f;
            }
            while (p.hist.length > etter - 1) tilbake(p);
            if (velgLy) return d.ly;
            return d.lx;
          }
        }
        // Take a box.
        return fang[0];
      }
      if (trygge.length) {
        if (niva === 3 && trygge.length <= 22) {
          const klokke = o.klokke || (() => performance.now());
          const k = { noder: 0, maks: o.noder || NIVA[3].noder, slutt: klokke() + (o.ms || NIVA[3].ms), klokke, stopp: false };
          const memo = new Map();
          let best = -Infinity, valg = [];
          for (const l of trygge) {
            spill(p, l);
            const v = -(yield* trygtSok(p, k, memo));
            tilbake(p);
            if (k.stopp) break;
            if (v > best) {
              best = v;
              valg = [l];
            } else if (v === best) valg.push(l);
          }
          if (!k.stopp && valg.length) return tilf(valg, r);
        }
        return tilf(trygge, r);
      }
      // Every line gives something away: give as little as possible.
      if (niva === 3) {
        const grp = grupper(p);
        let best = -Infinity, valg = null;
        const alleDeler = grp.map((x) => (x.lokke ? -x.bokser.length : x.bokser.length));
        grp.forEach((x, i) => {
          const resten = alleDeler.filter((_, j) => j !== i).sort((a, b) => a - b);
          const f = verdi(resten);
          const s = x.bokser.length;
          let motpart = s + f;
          if (resten.length && ((x.lokke && s >= 4) || (!x.lokke && s >= 3))) motpart = Math.max(motpart, x.lokke ? s - 8 - f : s - 4 - f);
          const v = -motpart;
          if (v > best || (v === best && s < valg.bokser.length)) {
            best = v;
            valg = x;
          }
        });
        if (valg) {
          const inni = new Set(valg.bokser);
          const linjer = alle.filter((l) => p.g.linjeBokser[l].some((b) => inni.has(b)));
          // Two boxes: the line between them, so the other side can't hand them back.
          if (valg.bokser.length === 2 && !valg.lokke) {
            const midt = linjer.find((l) => p.g.linjeBokser[l].length === 2 && p.g.linjeBokser[l].every((b) => inni.has(b)));
            if (midt != null) return midt;
          }
          if (linjer.length) return tilf(linjer, r);
        }
      }
      let minst = Infinity, valg = [];
      for (const l of alle) {
        spill(p, l);
        const n = gratis(p);
        tilbake(p);
        if (n < minst) {
          minst = n;
          valg = [l];
        } else if (n === minst) valg.push(l);
      }
      return tilf(valg, r);
    }

    function velg(p, o) {
      const it = finn(p, o);
      let x = it.next();
      while (!x.done) x = it.next();
      return x.value;
    }
    // In the page: slices of about 10 ms; returns a function that stops the search.
    function tenk(p, o, ferdig) {
      const it = finn(p, o);
      let stopp = false;
      let id = null;
      const steg = () => {
        if (stopp) return;
        const slutt = performance.now() + 10;
        let x = it.next();
        while (!x.done && performance.now() < slutt) x = it.next();
        if (x.done) ferdig(x.value);
        else id = setTimeout(steg, 0);
      };
      id = setTimeout(steg, 0);
      return () => {
        stopp = true;
        clearTimeout(id);
      };
    }

    return { NIVA, velg, tenk, gratis, grupper, verdi, domino };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules and the engine.
    window.Snekkeren = { Boks, Motor };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const KLASSE = ["rosa", "bla"]; // class names // sprak-ok
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen tegner litt hvor som helst og glemmer å ta bokser. Fint for de minste."),
    2: R.t("Mobilen gir deg ingen bokser gratis – så lenge den kan unngå det."),
    3: R.t("Mobilen teller kjedene og ofrer to bokser for å vinne flere. Klarer du å slå den?"),
  };
  const NIVAER = [1, 2, 3];
  const MIN_TENK = 650;
  const NESTE_STREK = 420; // the phone's next line in the same turn
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "snekkeren") + "/";
  let H;

  // S.spill: { id, modus "mobil" | "to", niva, n, starter (player who draws first), trekk (line ids),
  //   resultat { vinner (player | null), bokser [p0, p1] } | null, ferdig, registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, i) => sp.modus === "mobil" && i === 1;
  const navn = (sp, i) => (sp.modus === "mobil" ? (i === 1 ? R.t("Mobilen") : R.t("Du")) : R.navn(i));
  // The rules' player 0 is the one who starts.
  const spillerFor = (sp, side) => (side === 0 ? sp.starter : 1 - sp.starter);
  const sideFor = (sp, i) => (i === sp.starter ? 0 : 1);

  let parti = null;
  let partiFor = "";
  const partiNokkel = (sp) => `${sp.id}:${sp.n}:${sp.trekk.length}:${sp.trekk[sp.trekk.length - 1]}`;
  function hentParti(S) {
    const sp = S.spill;
    const k = partiNokkel(sp);
    if (parti && partiFor === k) return parti;
    parti = Boks.spillUt(sp.n, sp.trekk);
    partiFor = k;
    return parti;
  }
  const merkParti = (S) => (partiFor = partiNokkel(S.spill));
  const tur = (S) => spillerFor(S.spill, hentParti(S).tur);
  const bokser = (sp, p, i) => p.poeng[sideFor(sp, i)];

  let ny = -1; // the line just drawn (drawn with the pen on the next render)
  let nyeBokser = []; // boxes just closed
  let tenkId = null;
  let tenkStopp = null;
  let tenkerPa = "";
  let kaaringId = null;

  // ---------- Sounds ----------
  const lyd = {
    strek: () => R.lyd.stoy(0, 0.12, 0.15, 3400),
    boks: (n) => {
      for (let k = 0; k < n; k++) R.lyd.tone(660 + k * 110, k * 0.09, 0.14, "triangle", 0.13);
    },
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

  // ---------- Playing ----------
  const kanTegne = (S) => {
    const sp = S.spill;
    return !!sp && !sp.ferdig && !sp.resultat && !erMaskin(sp, tur(S));
  };

  function tegn(S, l) {
    const sp = S.spill;
    const p = hentParti(S);
    const hvem = spillerFor(sp, p.tur);
    const h = Boks.spill(p, l);
    if (!h) return;
    sp.trekk.push(l);
    merkParti(S);
    ny = R.rolig() ? -1 : l;
    nyeBokser = h.tatt.slice();
    lyd.strek();
    const mobil = sp.modus === "mobil";
    let linje = "";
    if (h.tatt.length) {
      setTimeout(() => lyd.boks(h.tatt.length), 120);
      R.vibrer([15, 40, 25]);
      const n = h.tatt.length;
      linje = mobil ? (hvem === 0 ? R.t("Du tok {n} boks!|Du tok {n} bokser!", { n }) : R.t("Mobilen tok {n} boks.|Mobilen tok {n} bokser.", { n })) : R.t("{navn} tok {n} boks!|{navn} tok {n} bokser!", { navn: navn(sp, hvem), n });
    } else R.vibrer(8);
    const st = Boks.status(p);
    if (st.slutt) {
      avsluttRunde(S, p);
      linje += " " + resultatLinje(S);
    } else {
      const neste = spillerFor(sp, p.tur);
      if (!erMaskin(sp, neste)) linje += " " + (mobil ? (h.tatt.length ? R.t("Tegn en strek til.") : R.t("Din tur.")) : h.tatt.length ? R.t("{navn} tegner igjen.", { navn: navn(sp, neste) }) : R.t("{navn} sin tur.", { navn: navn(sp, neste) }));
    }
    if (linje.trim()) R.si(linje.trim());
    R.vis();
    if (!st.slutt) startTenking(S, h.tatt.length > 0);
  }

  function resultatLinje(S) {
    const sp = S.spill;
    const r = sp.resultat;
    if (!r) return "";
    const tall = `${r.bokser[0]}–${r.bokser[1]}`;
    if (r.vinner == null) return R.t("Uavgjort, {tall}!", { tall });
    return sp.modus === "mobil" ? (r.vinner === 0 ? R.t("Du vinner {tall}!", { tall }) : R.t("Mobilen vinner {tall}!", { tall })) : R.t("{navn} vinner {tall}!", { navn: navn(sp, r.vinner), tall });
  }

  function avsluttRunde(S, p) {
    const sp = S.spill;
    stoppTenking();
    const b = [bokser(sp, p, 0), bokser(sp, p, 1)];
    const vinner = b[0] === b[1] ? null : b[0] > b[1] ? 0 : 1;
    sp.resultat = { vinner, bokser: b };
    telRekord(S, vinner, 1);
    if (sp.modus === "mobil" && vinner === 0) R.merke("klassiker-snekkeren");
    const fortsatt = R.vakt();
    const id = sp.id;
    setTimeout(() => fortsatt() && R.S.spill && R.S.spill.id === id && R.S.spill.resultat && feir(R.S), R.rolig() ? 100 : 700);
    tilKaaringOm(S, 2800);
  }
  function feir(S) {
    const sp = S.spill;
    const v = sp.resultat.vinner;
    if (v == null) return R.lyd.pling();
    if (sp.modus === "mobil" && v === 1) return lyd.tap();
    R.lyd.fanfare();
    R.vibrer([40, 60, 120]);
    R.konfetti(v === 0 ? ["--rosa", "--papir", "--lampe"] : ["--himmel", "--papir", "--mynte"]);
  }
  function telRekord(S, vinner, d) {
    const sp = S.spill;
    if (sp.modus !== "mobil") return;
    const r = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, uavgjort: 0, tap: 0 });
    const felt = vinner == null ? "uavgjort" : vinner === 0 ? "seier" : "tap";
    r[felt] = Math.max(0, r[felt] + d);
  }
  function tilKaaringOm(S, ms) {
    clearTimeout(kaaringId);
    const fortsatt = R.vakt();
    const id = S.spill.id;
    kaaringId = setTimeout(() => {
      kaaringId = null;
      const sp = R.S.spill;
      if (fortsatt() && sp && sp.id === id && !sp.ferdig && sp.resultat && R.S.skjerm === "spill" && !R.arkApent()) avsluttKamp(R.S);
    }, R.rolig() ? Math.min(ms, 1500) : ms);
  }
  function avsluttKamp(S) {
    const sp = S.spill;
    clearTimeout(kaaringId);
    stoppTenking();
    sp.ferdig = true;
    parti = null;
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.modus === "mobil" ? sp.niva : 0, n: sp.n, vinner: sp.resultat ? (sp.resultat.vinner == null ? -1 : sp.resultat.vinner) : -2 });
    R.gaTil("slutt");
  }

  // ---------- The phone's turn ----------
  function startTenking(S, igjen) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.resultat || S.skjerm !== "spill" || !erMaskin(sp, tur(S))) return;
    const nokkel = partiNokkel(sp);
    if ((tenkStopp || tenkId) && tenkerPa === nokkel) return;
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    const gjelder = () => fortsatt() && R.S.spill && !R.S.spill.resultat && partiNokkel(R.S.spill) === nokkel;
    const vent = igjen ? NESTE_STREK : MIN_TENK;
    const start = performance.now();
    // The search runs in slices of about 10 ms, so the page stays responsive.
    tenkStopp = Motor.tenk(Boks.spillUt(sp.n, sp.trekk), { niva: sp.niva }, (l) => {
      tenkStopp = null;
      if (!gjelder()) return;
      const spillNaa = () => {
        tenkId = null;
        if (!gjelder()) return;
        if (R.arkApent()) {
          tenkId = setTimeout(spillNaa, 300);
          return;
        }
        tenkerPa = "";
        if (l >= 0) tegn(R.S, l);
      };
      tenkId = setTimeout(spillNaa, Math.max(0, vent - (performance.now() - start)));
    });
  }
  function stoppTenking() {
    if (tenkStopp) tenkStopp();
    tenkStopp = null;
    clearTimeout(tenkId);
    tenkId = null;
    tenkerPa = "";
  }

  // «Angre»: two players one line; against the phone back to before your own last line.
  function angreAntall(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const n = p.hist.length;
    if (!n) return 0;
    if (sp.modus !== "mobil") return 1;
    const meg = sideFor(sp, 0);
    for (let i = n - 1; i >= 0; i--) if (p.hist[i].tur === meg) return n - i;
    return 0;
  }

  // ---------- Markup ----------
  // The board is drawn in a 0…100 square: dots at M + c·S.
  const MARG = 6;
  const steg = (n) => (100 - 2 * MARG) / n;
  const prikk = (n, r, c) => [MARG + c * steg(n), MARG + r * steg(n)];

  function linjeNavn(p, l) {
    const [r1, c1, r2, c2] = p.g.ender[l];
    return r1 === r2 ? R.t("Vannrett strek, rad {r}, mellom kolonne {a} og {b}", { r: r1 + 1, a: c1 + 1, b: c2 + 1 }) : R.t("Loddrett strek, kolonne {k}, mellom rad {a} og {b}", { k: c1 + 1, a: r1 + 1, b: r2 + 1 });
  }

  // The lines drawn in the last turn (the phone may draw several in a row).
  function sisteTur(p) {
    const ut = new Set();
    if (!p.hist.length) return ut;
    const hvem = p.hist[p.hist.length - 1].tur;
    for (let i = p.hist.length - 1; i >= 0 && p.hist[i].tur === hvem; i--) {
      ut.add(p.hist[i].l);
      if (i < p.hist.length - 1 && !p.hist[i].tatt.length) break;
    }
    return ut;
  }

  function brettHtml(S, o) {
    const sp = S.spill;
    const p = hentParti(S);
    const n = p.n;
    const s = steg(n);
    const fri = o.interaktiv && kanTegne(S);
    const sist = sisteTur(p);
    const hvemTegnet = new Map(p.hist.map((h) => [h.l, spillerFor(sp, h.tur)]));
    // Boxes
    const ruter = [];
    for (let b = 0; b < n * n; b++) {
      const e = p.eier[b];
      if (e < 0) continue;
      const hvem = spillerFor(sp, e);
      const r = Math.floor(b / n), c = b % n;
      const [x, y] = prikk(n, r, c);
      ruter.push(`<span class="sn-boks ${KLASSE[hvem]}${o.interaktiv && nyeBokser.includes(b) && !R.rolig() ? " ny" : ""}" style="left:${x}%;top:${y}%;width:${s}%;height:${s}%"><span class="sn-boksmerke">${erMaskin(sp, hvem) ? "🤖" : R.DYR[hvem % 20]}</span></span>`);
    }
    // Drawn lines (SVG) and the undrawn ones as buttons
    const streker = [];
    const knapper = [];
    for (let l = 0; l < p.g.L; l++) {
      const [r1, c1, r2, c2] = p.g.ender[l];
      const [x1, y1] = prikk(n, r1, c1);
      const [x2, y2] = prikk(n, r2, c2);
      if (p.linjer[l]) {
        const hvem = hvemTegnet.get(l);
        const k = ["sn-strek", KLASSE[hvem]];
        if (sist.has(l)) k.push("sist");
        if (o.interaktiv && l === ny) k.push("ny");
        streker.push(`<line class="${k.join(" ")}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" pathLength="1"/>`);
      } else if (o.interaktiv) {
        // The tap area: the middle 80 % of the line, half a box thick.
        const vannrett = r1 === r2;
        const f = (v) => +v.toFixed(3);
        const stil = vannrett ? `left:${f(x1 + s * 0.1)}%;top:${f(y1 - s * 0.25)}%;width:${f(s * 0.8)}%;height:${f(s * 0.5)}%` : `left:${f(x1 - s * 0.25)}%;top:${f(y1 + s * 0.1)}%;width:${f(s * 0.5)}%;height:${f(s * 0.8)}%`;
        knapper.push(`<button class="sn-linje ${vannrett ? "v" : "l"}" style="${stil}" data-h="strek" data-v="${l}" data-stille${fri ? "" : ' aria-disabled="true"'} tabindex="${l === fokusLinje(p) ? 0 : -1}" aria-label="${esc(linjeNavn(p, l))}"></button>`);
      } else streker.push(`<line class="sn-tom" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    }
    if (o.interaktiv) {
      ny = -1;
      nyeBokser = [];
    }
    const prikker = [];
    for (let r = 0; r <= n; r++)
      for (let c = 0; c <= n; c++) {
        const [x, y] = prikk(n, r, c);
        prikker.push(`<circle cx="${x}" cy="${y}" r="${n >= 6 ? 1.35 : 1.6}"/>`);
      }
    const stempel = o.stempel ? `<span class="sn-stempel" aria-hidden="true"><span class="stempel ${o.stempel.klasse}">${esc(o.stempel.tekst)}</span></span>` : "";
    return `<div class="sn-brett n${n}${fri ? " fri" : ""}"${o.interaktiv ? ` role="group" aria-label="${esc(R.t("Brettet, {n} ganger {n} bokser", { n }))}" data-h="strek" data-stille` : ' aria-hidden="true"'} style="--s:${s}">
      ${ruter.join("")}
      <svg class="sn-tegning" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${streker.join("")}<g class="sn-prikker">${prikker.join("")}</g></svg>
      ${knapper.join("")}${stempel}
    </div>`;
  }
  // Keyboard focus: the line after the last one drawn, or the first free one.
  function fokusLinje(p) {
    const sist = p.hist.length ? p.hist[p.hist.length - 1].l : -1;
    for (let k = 1; k <= p.g.L; k++) {
      const l = (sist + k) % p.g.L;
      if (!p.linjer[l]) return l;
    }
    return -1;
  }

  function poengHtml(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const naa = sp.resultat ? -1 : tur(S);
    const kort = (i) => `<div class="sn-spiller ${KLASSE[i]}${naa === i ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === i ? " vant" : ""}">
        <span class="sn-merke" aria-hidden="true">${erMaskin(sp, i) ? `<span class="sn-maskin">${R.figur()}</span>` : R.avatar(i)}</span>
        <b class="sn-navn">${esc(navn(sp, i))}</b>
      </div>`;
    const tekst = R.t("Bokser: {a} {pa}, {b} {pb}.", { a: navn(sp, 0), pa: bokser(sp, p, 0), b: navn(sp, 1), pb: bokser(sp, p, 1) });
    return `<div class="sn-stilling" role="group" aria-label="${esc(tekst)}">
      ${kort(0)}
      <div class="sn-tall" aria-hidden="true"><b class="rosa">${bokser(sp, p, 0)}</b><span>–</span><b class="bla">${bokser(sp, p, 1)}</b><small>${esc(R.t("{n} igjen", { n: p.n * p.n - p.poeng[0] - p.poeng[1] }))}</small></div>
      ${kort(1)}
    </div>`;
  }

  function meldingHtml(S) {
    const sp = S.spill;
    if (sp.resultat) {
      const v = sp.resultat.vinner;
      return `<p class="sn-melding ${v == null ? "remis" : "vinner"}"><span>${esc(resultatLinje(S))}</span></p>`;
    }
    const p = hentParti(S);
    const i = tur(S);
    const igjen = p.hist.length && p.hist[p.hist.length - 1].tatt.length > 0;
    let tekst;
    if (erMaskin(sp, i)) tekst = `<span class="sn-tenker">${esc(igjen ? R.t("Mobilen tegner igjen") : p.hist.length ? R.t("Mobilen tenker") : R.t("Mobilen begynner"))}<i>.</i><i>.</i><i>.</i></span>`;
    else if (sp.modus === "mobil") tekst = esc(igjen ? R.t("Boks! Tegn en strek til") : p.hist.length ? R.t("Din tur – tegn en strek") : R.t("Du begynner – tegn en strek"));
    else tekst = esc(igjen ? R.t("Boks! {navn} tegner igjen", { navn: navn(sp, i) }) : R.t("{navn} sin tur", { navn: navn(sp, i) }));
    return `<p class="sn-melding ${KLASSE[i]}${igjen ? " igjen" : ""}"><span class="sn-meldingsmerke" aria-hidden="true">${erMaskin(sp, i) ? `<span class="sn-maskin">${R.figur()}</span>` : R.avatar(i)}</span><span>${tekst}</span></p>`;
  }

  // ---------- Board size ----------
  const TO_KOLONNER = "(min-width: 900px) and (min-aspect-ratio: 5/4), (orientation: landscape) and (max-height: 600px) and (min-width: 560px)";
  function tilpass() {
    const brett = R.$(".skjerm-spill .sn-brett");
    if (!brett) return;
    const ramme = brett.parentElement;
    const toKolonner = window.matchMedia && window.matchMedia(TO_KOLONNER).matches;
    let b;
    if (toKolonner) {
      const skjerm = ramme.parentElement;
      const topp = skjerm.getBoundingClientRect().top + window.scrollY;
      b = Math.min(window.innerHeight - topp - 14, skjerm.clientWidth - 254, 600);
    } else b = Math.min(ramme.clientWidth, 560);
    b = Math.floor(b);
    brett.style.width = b + "px";
    for (let k = 0; k < 3; k++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || b <= 232) break;
      b = Math.max(232, Math.floor(b - over));
      brett.style.width = b + "px";
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && tilpass());
  });

  // A finger is wider than a line: a tap (on a line or anywhere on the board) goes to the nearest
  // free line within half a box. Keyboard presses keep their own line. −1: nothing near.
  function naermeste(el, e) {
    const brett = el.closest(".sn-brett");
    const sp = R.S.spill;
    const egen = el.dataset.v != null ? Number(el.dataset.v) : -1;
    if (!brett || !e || !(e.detail > 0) || !Number.isFinite(e.clientX)) return egen;
    const p = hentParti(R.S);
    const rekt = brett.getBoundingClientRect();
    const x = ((e.clientX - rekt.left) / rekt.width) * 100;
    const y = ((e.clientY - rekt.top) / rekt.height) * 100;
    let best = egen, bestD = Infinity;
    for (let l = 0; l < p.g.L; l++) {
      if (p.linjer[l]) continue;
      const [r1, c1, r2, c2] = p.g.ender[l];
      const [x1, y1] = prikk(sp.n, r1, c1);
      const [x2, y2] = prikk(sp.n, r2, c2);
      // distance to the segment, the ends pulled in a little (a tap on a dot is ambiguous)
      const t = Math.max(0.15, Math.min(0.85, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
      const d = Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1)));
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return bestD <= steg(sp.n) * 0.5 ? best : egen;
  }

  // Keyboard: the arrows go to the nearest free line in that direction.
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("sn-linje")) return;
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    const sp = R.S.spill;
    const p = hentParti(R.S);
    const midt = (l) => {
      const [r1, c1, r2, c2] = p.g.ender[l];
      return [(c1 + c2) / 2, (r1 + r2) / 2];
    };
    const [x0, y0] = midt(Number(el.dataset.v));
    let best = -1, bestD = Infinity;
    for (let l = 0; l < p.g.L; l++) {
      if (p.linjer[l]) continue;
      const [x, y] = midt(l);
      const fram = (x - x0) * d[0] + (y - y0) * d[1];
      if (fram <= 0) continue;
      const avstand = fram + 2 * Math.abs((x - x0) * d[1] + (y - y0) * d[0]);
      if (avstand < bestD) {
        bestD = avstand;
        best = l;
      }
    }
    const nyEl = best >= 0 && R.$(`.sn-linje[data-v="${best}"]`);
    if (nyEl && sp) {
      el.tabIndex = -1;
      nyEl.tabIndex = 0;
      nyEl.focus();
    }
  });

  // ---------- Setup and flow ----------
  function nyttSpill(S) {
    const o = S.oppsett;
    const starter = o.starter === 1 ? 1 : 0;
    o.starter = 1 - starter; // the next game is opened by the other one, unless changed
    S.spill = { id: R.nyttFro() % 1e9, modus: o.modus, niva: o.niva, n: o.n, starter, trekk: [], resultat: null, ferdig: false, registrert: false };
    nullstillVisning();
    R.statistikk("start", { modus: o.modus, niva: o.modus === "mobil" ? o.niva : 0, n: o.n });
  }
  function nullstillVisning() {
    parti = null;
    ny = -1;
    nyeBokser = [];
    stoppTenking();
    clearTimeout(kaaringId);
  }
  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.uavgjort + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.uavgjort}</b> ${esc(R.t("uavgjort|uavgjort", { n: r.uavgjort }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }
  const IKON = '<span class="sn-knappeikon" aria-hidden="true"></span>';
  const storrelse = (n) => `${n} × ${n}`;

  function stempelFor(sp) {
    const r = sp.resultat;
    const tall = `${r.bokser[0]}–${r.bokser[1]}`;
    if (r.vinner == null) return { tekst: R.t("Uavgjort {tall}", { tall }), klasse: "lampe" };
    return { tekst: tall, klasse: "aksent" };
  }

  function delTekst(sp) {
    const r = sp.resultat;
    const tall = `${r.bokser[0]}–${r.bokser[1]}`;
    const brett = storrelse(sp.n);
    if (sp.modus === "mobil") {
      const niva = NIVANAVN[sp.niva].toLowerCase();
      if (r.vinner === 0) return R.t("Jeg slo mobilen {tall} i prikker og bokser ({brett}, {niva})! Klarer du det?", { tall, brett, niva });
      if (r.vinner == null) return R.t("Uavgjort {tall} mot mobilen i prikker og bokser ({brett}, {niva}). Klarer du bedre?", { tall, brett, niva });
      return R.t("Mobilen slo meg {tall} i prikker og bokser ({brett}, {niva}). Klarer du bedre?", { tall, brett, niva });
    }
    if (r.vinner == null) return R.t("Uavgjort {tall} i prikker og bokser!", { tall });
    return R.t("{navn} vant {tall} i prikker og bokser!", { navn: R.kutt(navn(sp, r.vinner), 16), tall });
  }

  R.start({
    id: "snekkeren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, n: 4, starter: 0 },
      spill: null,
      rekord: {},
      sist: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, n: 4, starter: 0 }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!Boks.STORRELSER.includes(o.n)) o.n = 4;
      o.starter = o.starter === 1 ? 1 : 0;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      if (S.sist && !(Array.isArray(S.sist.bokser) && typeof S.sist.tekst === "string")) S.sist = null;
      const sp = S.spill;
      if (sp) {
        const p = Array.isArray(sp.trekk) && [0, 1].includes(sp.starter) && ["mobil", "to"].includes(sp.modus) && NIVAER.includes(sp.niva) ? Boks.spillUt(sp.n, sp.trekk) : null;
        if (!p) S.spill = null;
        else if (p.slutt && !sp.resultat) {
          const b = [p.poeng[sideFor(sp, 0)], p.poeng[sideFor(sp, 1)]];
          sp.resultat = { vinner: b[0] === b[1] ? null : b[0] > b[1] ? 0 : 1, bokser: b };
        } else if (!p.slutt) {
          sp.resultat = null;
          sp.ferdig = false;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Prikker og bokser: Tegn streker mellom prikkene. Den som lukker en boks, får den – og flest bokser vinner."),
      steg: [
        [R.t("Tegn en strek"), R.t("Dere bytter på å tegne én strek mellom to prikker som står ved siden av hverandre – bortover eller nedover.")],
        [R.t("Lukk en boks"), R.t("Tegner du den fjerde siden av en boks, er boksen din. Da tegner du en strek til.")],
        [R.t("Flest vinner"), R.t("Når alle strekene er tegnet, teller dere boksene. Den som har flest, vinner.")],
      ],
      tips: [
        R.t("Ikke tegn den tredje siden av en boks – da får motstanderen den gratis."),
        R.t("Til slutt må noen gi bort en hel rekke bokser. Gi bort den korteste."),
        R.t("Proff-triks: Ta alle boksene i en lang rekke unntatt de to siste. Gi dem bort, så må motstanderen åpne neste rekke."),
        R.t("Du kan trykke litt ved siden av en strek – den nærmeste ledige streken blir tegnet."),
        R.t("Dere bytter på å begynne. Trykket feil? «Angre» tar tilbake streken."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = NIVAER.map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          let fort = "";
          if (aktiv) {
            const p = Boks.spillUt(sp.n, sp.trekk);
            fort = R.t("Fortsett · {stilling}", { stilling: `${bokser(sp, p, 0)}–${bokser(sp, p, 1)}` });
          }
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Én strek om gangen –"))}<br><em>${esc(R.t("lukk boksen, og den er din!"))}</em>`,
              knapperHtml: R.ui.startKnapper({ pagar: aktiv, fortsettTekst: fort, ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") }),
              merker: [
                ["1–2", R.t("spillere")],
                ["4", R.t("brett")],
                ["0", R.t("reklame")],
              ],
            }) +
            (S.sist ? `<p class="sn-sist"><span class="etikett">${esc(R.t("Sist"))}</span> ${esc(S.sist.tekst)} <b>${S.sist.bokser[0]}–${S.sist.bokser[1]}</b></p>` : "") +
            (rek.length ? `<section class="sn-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="sn-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const mot = o.modus === "mobil";
          const hvem = mot ? [[0, R.t("Du")], [1, R.t("Mobilen")]] : [[0, R.kutt(R.navn(0), 14)], [1, R.kutt(R.navn(1), 14)]];
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
            ${
              mot
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>`
                : R.ui.spillere({ min: 2, max: 2, tittel: R.t("Spillerne") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Brettet"))}</h2>
              ${R.ui.seg("n", Boks.STORRELSER.map((n) => [n, storrelse(n)]), o.n, { etikett: R.t("Brettet") })}
              <p class="hjelp">${esc(R.t("{n} bokser. Jo større brett, jo lengre spill.", { n: o.n * o.n }))}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvem begynner?"))}</h2>
              ${R.ui.seg("starter", hvem, o.starter, { etikett: R.t("Hvem begynner") })}
              <p class="hjelp">${esc(mot ? R.t("Du og mobilen bytter på å begynne.") : R.t("Dere bytter på å begynne."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.modus === "mobil" ? R.t("Mot mobilen") : R.t("To spillere")),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = !!sp.resultat;
          const kanAngre = angreAntall(S) > 0 && !ferdig;
          const tittel = R.t("Prikker og bokser") + ": " + (ferdig ? R.t("spillet er ferdig") : erMaskin(sp, tur(S)) ? R.t("mobilen sin tur") : sp.modus === "mobil" ? R.t("din tur") : R.t("{navn} sin tur", { navn: navn(sp, tur(S)) }));
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(tittel)}</h1>
            ${poengHtml(S)}
            ${meldingHtml(S)}
            <span class="sn-luft" aria-hidden="true"></span>
            <div class="sn-brettramme">${brettHtml(S, { interaktiv: true, stempel: ferdig ? stempelFor(sp) : null })}</div>
            <span class="sn-luft under" aria-hidden="true"></span>
            ${R.ui.dokk(
              ferdig ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : "",
              R.ui.lenkerad(`<button class="lenke" data-h="angre"${kanAngre ? "" : " disabled"}>↶ ${esc(R.t("Angre"))}</button>`, R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        etter() {
          tilpass();
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          startTenking(S);
          if (S.spill.resultat) tilKaaringOm(S, 1800);
        },
        ut() {
          stoppTenking();
          clearTimeout(kaaringId);
          ny = -1;
          nyeBokser = [];
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { vinner: null, bokser: [0, 0] };
          const rader = [0, 1].map((i) => ({ navn: navn(sp, i), i, poeng: r.bokser[i] }));
          const v = r.vinner;
          let tittel;
          if (!sp.resultat) tittel = R.t("Ingen vinner denne gangen");
          else if (v == null) tittel = R.t("Uavgjort!");
          else if (sp.modus === "mobil") tittel = v === 0 ? R.t("Du vinner!") : R.t("Mobilen vinner!");
          else tittel = R.t("{navn} vinner!", { navn: navn(sp, v) });
          const etikett = `${storrelse(sp.n)} · ${R.flertall(sp.n * sp.n, "boks", "bokser")}`;
          const figur = v != null && !(sp.modus === "mobil" && v === 1) ? `<span class="sn-vinner">${R.avatar(v, "gigant")}<span class="sn-kroneemoji" aria-hidden="true">👑</span></span>` : R.figur();
          const tekst = sp.modus === "mobil" && v === 1 ? (sp.niva > 1 ? R.t("Godt kjempa! Tips: Gi bort den korteste rekka til slutt.") : R.t("Godt kjempa! Prøv igjen.")) : "";
          let rekord = "";
          if (sp.modus === "mobil") {
            const rek = rekordHtml(S, sp.niva);
            rekord = rek ? `<p class="sn-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : "";
          }
          return `
            <div class="banner ${sp.modus === "mobil" && v === 1 ? "" : "aksent"}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>
            ${R.ui.poengliste(rader)}
            ${rekord}
            ${sp.resultat ? `<div class="sn-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "to" ? 2 : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: IKON }), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const r = sp.resultat;
          if (r && !sp.registrert) {
            sp.registrert = true;
            if (sp.modus === "to") R.kveld.registrer([0, 1].map((i) => ({ i, poeng: r.bokser[i] })));
            const hvem = sp.modus === "mobil" ? R.t("Du mot mobilen ({niva}, {brett})", { niva: NIVANAVN[sp.niva].toLowerCase(), brett: storrelse(sp.n) }) : R.t("{a} mot {b} ({brett})", { a: R.kutt(navn(sp, 0), 14), b: R.kutt(navn(sp, 1), 14), brett: storrelse(sp.n) });
            S.sist = { tekst: hvem, bokser: r.bokser.slice() };
            R.lagre();
          }
          if (r && r.vinner != null && !(sp.modus === "mobil" && r.vinner === 1)) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else if (r && sp.modus === "mobil" && r.vinner === 1) lyd.tap();
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
      n(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.n = Boks.STORRELSER.includes(n) ? n : 4;
        R.vis();
      },
      starter(el, e, S) {
        S.oppsett.starter = el.dataset.v === "1" ? 1 : 0;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && S.spill.resultat) avsluttKamp(S);
      },
      strek(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        if (!kanTegne(S)) {
          R.toast(R.t("Vent litt – mobilen tenker"));
          return;
        }
        const l = naermeste(el, e);
        if (!Boks.kan(hentParti(S), l)) return;
        tegn(S, l);
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        const n = angreAntall(S);
        if (n <= 0) return;
        stoppTenking();
        const p = hentParti(S);
        for (let k = 0; k < n; k++) {
          Boks.tilbake(p);
          sp.trekk.pop();
        }
        merkParti(S);
        ny = -1;
        nyeBokser = [];
        R.lyd.snu();
        R.toast(n >= 2 ? R.t("Angret – din tur igjen") : R.t("Angret"));
        R.vis();
        startTenking(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.resultat) return;
        const r = sp.resultat;
        const linjer = [`${r.bokser[0]}–${r.bokser[1]}`, sp.modus === "mobil" ? R.t("Mot mobilen · {niva}", { niva: NIVANAVN[sp.niva].toLowerCase() }) : `${R.kutt(navn(sp, 0), 16)} – ${R.kutt(navn(sp, 1), 16)}`, `${storrelse(sp.n)} · ${R.flertall(sp.n * sp.n, "boks", "bokser")}`];
        R.del(R.app.navn, delTekst(sp), ADRESSE, { kort: { tittel: R.app.navn, linjer } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        stoppTenking();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Spillet som er i gang, teller ikke. Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return startTenking(S);
        S.spill = null;
        nullstillVisning();
        R.gaTil("hjem");
      },
    }),
  });
})();
