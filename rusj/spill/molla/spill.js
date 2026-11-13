/* Mølla — nine men's morris («mølle») on one phone: two players, or against the phone at three
   levels. 24 points on three squares; nine pieces each; place them, then move along the lines; three
   in a row along a line is a mill and takes one of the other side's pieces. With three pieces left a
   player may jump. Two pieces left, or no move, loses; 50 moves without a capture is a draw.
   The rules (Molle) and the engine (Motor: random with a taste for mills, a two-move search, an
   alpha-beta search with iterative deepening) are pure functions at the top of this file;
   test/molla.test.mjs loads the file without the kit. */
(function () {
  "use strict";

  // ---------- The rules ----------
  // A point is 0–23, row by row on a 7 × 7 grid (XY). A cell: 0 empty, 1 white (side 0), 2 black
  // (side 1). White starts. A move is [fra, til, ta]: fra −1 while placing, ta −1 without a mill.

  const Molle = (() => {
    const XY = [[0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6]];
    const MOLLER = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
      [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
    ];
    const NABO = XY.map(() => []);
    for (const [a, b, c] of MOLLER) {
      NABO[a].push(b);
      NABO[b].push(a, c);
      NABO[c].push(b);
    }
    const LINJER = XY.map((_, i) => MOLLER.filter((m) => m.includes(i)));
    const BRIKKER = 9;
    const REMIS = 50; // moves in a row without a capture, once every piece is on the board
    // Names as on a chess board: columns a–g from the left, rows 1–7 from the bottom.
    const navn = (i) => "abcdefg"[XY[i][0]] + (7 - XY[i][1]);
    const PUNKT = new Map(XY.map((_, i) => [navn(i), i]));
    const punkt = (t) => (PUNKT.has(t) ? PUNKT.get(t) : -1);

    function nyttParti() {
      return { b: new Array(24).fill(0), tur: 0, hand: [BRIKKER, BRIKKER], paBrett: [0, 0], rolig: 0, slutt: false, vinner: null, grunn: "", hist: [] };
    }
    const igjen = (p, s) => p.hand[s] + p.paBrett[s];
    const fase = (p, s) => (p.hand[s] > 0 ? "sett" : p.paBrett[s] <= 3 ? "fly" : "flytt");

    function iMolle(b, i) {
      const v = b[i];
      if (!v) return false;
      for (const [a, c, d] of LINJER[i]) if (b[a] === v && b[c] === v && b[d] === v) return true;
      return false;
    }
    // Would side s close a mill by going fra → til (fra is left empty)?
    function lagerMolle(b, fra, til, s) {
      const v = s + 1;
      for (const l of LINJER[til]) {
        let ok = true;
        for (const x of l) if (x !== til && (x === fra || b[x] !== v)) ok = false;
        if (ok) return true;
      }
      return false;
    }
    // The other side's pieces that s may take: those outside a mill, or any when all are in mills.
    function kanTa(b, s) {
      const v = 2 - s;
      const alle = [], fri = [];
      for (let i = 0; i < 24; i++)
        if (b[i] === v) {
          alle.push(i);
          if (!iMolle(b, i)) fri.push(i);
        }
      return fri.length ? fri : alle;
    }
    // Where may s go: [fra, til] pairs (fra −1 while placing).
    function grunntrekk(p, s) {
      const ut = [];
      const f = fase(p, s);
      if (f === "sett") {
        for (let i = 0; i < 24; i++) if (!p.b[i]) ut.push([-1, i]);
        return ut;
      }
      const v = s + 1;
      for (let i = 0; i < 24; i++) {
        if (p.b[i] !== v) continue;
        if (f === "fly") {
          for (let j = 0; j < 24; j++) if (!p.b[j]) ut.push([i, j]);
        } else for (const j of NABO[i]) if (!p.b[j]) ut.push([i, j]);
      }
      return ut;
    }
    function harTrekk(p, s) {
      const f = fase(p, s);
      if (f !== "flytt") return p.b.includes(0);
      const v = s + 1;
      for (let i = 0; i < 24; i++) if (p.b[i] === v) for (const j of NABO[i]) if (!p.b[j]) return true;
      return false;
    }
    function lovlige(p) {
      if (p.slutt) return [];
      const ut = [];
      const s = p.tur;
      let ta = null;
      for (const [fra, til] of grunntrekk(p, s)) {
        if (lagerMolle(p.b, fra, til, s)) {
          ta = ta || kanTa(p.b, s);
          for (const t of ta) ut.push([fra, til, t]);
        } else ut.push([fra, til, -1]);
      }
      return ut;
    }
    const lik = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const erLovlig = (p, m) => lovlige(p).some((x) => lik(x, m));

    // Play a legal move (the caller checks); returns the entry in the history.
    function spill(p, m) {
      const s = p.tur;
      const h = { m, s, rolig: p.rolig, slutt: p.slutt, vinner: p.vinner, grunn: p.grunn };
      if (m[0] < 0) {
        p.hand[s]--;
        p.paBrett[s]++;
      } else p.b[m[0]] = 0;
      p.b[m[1]] = s + 1;
      const o = 1 - s;
      if (m[2] >= 0) {
        p.b[m[2]] = 0;
        p.paBrett[o]--;
        p.rolig = 0;
      } else if (!p.hand[0] && !p.hand[1]) p.rolig++;
      p.tur = o;
      if (igjen(p, o) < 3) Object.assign(p, { slutt: true, vinner: s, grunn: "to" });
      else if (!harTrekk(p, o)) Object.assign(p, { slutt: true, vinner: s, grunn: "fast" });
      else if (p.rolig >= REMIS) Object.assign(p, { slutt: true, vinner: null, grunn: "remis" });
      p.hist.push(h);
      return h;
    }
    function tilbake(p) {
      const h = p.hist.pop();
      if (!h) return null;
      const { m, s } = h;
      if (m[2] >= 0) {
        p.b[m[2]] = 2 - s;
        p.paBrett[1 - s]++;
      }
      p.b[m[1]] = 0;
      if (m[0] < 0) {
        p.hand[s]++;
        p.paBrett[s]--;
      } else p.b[m[0]] = s + 1;
      Object.assign(p, { tur: s, rolig: h.rolig, slutt: h.slutt, vinner: h.vinner, grunn: h.grunn });
      return h;
    }

    // Saved as text: «d6» (placed), «d6-d5» (moved), «…xa1» (and took a1).
    const tekst = (m) => (m[0] >= 0 ? navn(m[0]) + "-" : "") + navn(m[1]) + (m[2] >= 0 ? "x" + navn(m[2]) : "");
    function fraTekst(t) {
      const r = /^(?:([a-g][1-7])-)?([a-g][1-7])(?:x([a-g][1-7]))?$/.exec(String(t));
      if (!r) return null;
      const m = [r[1] ? punkt(r[1]) : -1, punkt(r[2]), r[3] ? punkt(r[3]) : -1];
      return m[1] < 0 || (r[1] && m[0] < 0) || (r[3] && m[2] < 0) ? null : m;
    }
    function spillUt(liste) {
      const p = nyttParti();
      if (!Array.isArray(liste)) return null;
      for (const t of liste) {
        const m = fraTekst(t);
        if (!m || !erLovlig(p, m)) return null;
        spill(p, m);
      }
      return p;
    }

    return { XY, MOLLER, NABO, LINJER, BRIKKER, REMIS, navn, punkt, nyttParti, igjen, fase, iMolle, lagerMolle, kanTa, grunntrekk, harTrekk, lovlige, lik, erLovlig, spill, tilbake, tekst, fraTekst, spillUt };
  })();

  // ---------- The engine ----------
  // Lett: any move, but often takes a mill or blocks one. Middels: a two-move search. Vanskelig:
  // alpha-beta with iterative deepening on pieces, mills, open twos and mobility, within a budget.

  const Motor = (() => {
    const { MOLLER, NABO, lovlige, spill, tilbake, igjen, lagerMolle } = Molle;
    const VINN = 100000;
    const NIVA = {
      1: { dybde: 0 },
      2: { dybde: 2, noder: 6000, ms: 120 },
      3: { dybde: 7, noder: 90000, ms: 420 },
    };

    function mobilitet(p, s) {
      if (p.hand[s] > 0 || p.paBrett[s] <= 3) return 8;
      const v = s + 1;
      let n = 0;
      for (let i = 0; i < 24; i++) if (p.b[i] === v) for (const j of NABO[i]) if (!p.b[j]) n++;
      return n;
    }
    // From the side to move.
    function evaluer(p, ply) {
      const s = p.tur;
      if (p.slutt) return p.vinner == null ? 0 : p.vinner === s ? VINN - ply : -VINN + ply;
      const meg = s + 1;
      let v = 130 * (igjen(p, s) - igjen(p, 1 - s));
      for (const l of MOLLER) {
        let a = 0, d = 0;
        for (const x of l) {
          if (p.b[x] === meg) a++;
          else if (p.b[x]) d++;
        }
        if (a === 3) v += 12;
        else if (d === 3) v -= 12;
        else if (a === 2 && !d) v += 10;
        else if (d === 2 && !a) v -= 10;
      }
      // The four-way points are worth a little while placing.
      for (const i of [4, 10, 13, 19]) if (p.b[i]) v += p.b[i] === meg ? 3 : -3;
      if (!p.hand[0] && !p.hand[1]) v += 5 * (mobilitet(p, s) - mobilitet(p, 1 - s));
      return v;
    }
    // Captures first, then closing or blocking a mill.
    function ordne(p, liste, tilfeldig) {
      const s = p.tur;
      return liste
        .map((m) => ({ m, v: (m[2] >= 0 ? 1000 : 0) + (lagerMolle(p.b, -1, m[1], 1 - s) ? 400 : 0) + tilfeldig() * 10 }))
        .sort((a, b) => b.v - a.v)
        .map((x) => x.m);
    }

    // The search is a generator that yields every 128 nodes, so the page can run it in small slices
    // (tenk) and the tests can run it to the end at once (velg).
    function* sok(p, dybde, alfa, beta, ply, k) {
      if (p.slutt || dybde === 0) return evaluer(p, ply);
      if (++k.noder > k.maks || ((k.noder & 127) === 0 && k.klokke() > k.slutt)) {
        k.stopp = true;
        return 0;
      }
      if ((k.noder & 127) === 0) yield;
      let best = -Infinity;
      for (const m of ordne(p, lovlige(p), k.tilfeldig)) {
        spill(p, m);
        const v = -(yield* sok(p, dybde - 1, -beta, -alfa, ply + 1, k));
        tilbake(p);
        if (k.stopp) return 0;
        if (v > best) best = v;
        if (v > alfa) alfa = v;
        if (alfa >= beta) break;
      }
      return best;
    }

    // The phone's move. o: { niva, tilfeldig, klokke, ms, noder } (klokke and the budget make tests
    // deterministic: pass a fake clock and a node budget).
    function* finn(p, o) {
      const tilfeldig = o.tilfeldig || Math.random;
      const liste = lovlige(p);
      if (!liste.length) return null;
      const niva = NIVA[o.niva] ? o.niva : 2;
      if (niva === 1) {
        const tar = liste.filter((m) => m[2] >= 0);
        if (tar.length && tilfeldig() < 0.6) return tar[Math.floor(tilfeldig() * tar.length)];
        const blokk = liste.filter((m) => m[2] < 0 && lagerMolle(p.b, -1, m[1], 1 - p.tur));
        if (blokk.length && tilfeldig() < 0.35) return blokk[Math.floor(tilfeldig() * blokk.length)];
        return liste[Math.floor(tilfeldig() * liste.length)];
      }
      const def = NIVA[niva];
      const klokke = o.klokke || (() => performance.now());
      const k = { noder: 0, maks: o.noder || def.noder, slutt: klokke() + (o.ms || def.ms), klokke, stopp: false, tilfeldig };
      let rot = ordne(p, liste, tilfeldig);
      let best = rot[0];
      for (let d = 1; d <= def.dybde; d++) {
        const verdier = [];
        let alfa = -Infinity;
        for (const m of rot) {
          spill(p, m);
          const v = -(yield* sok(p, d - 1, -Infinity, -alfa + (niva === 2 ? 6 : 0), 1, k));
          tilbake(p);
          if (k.stopp) break;
          verdier.push({ m, v });
          if (v > alfa) alfa = v;
        }
        // A capture now is worth a little more than the same capture later (the horizon).
        for (const x of verdier) if (x.m[2] >= 0) x.v += 8;
        verdier.sort((a, b) => b.v - a.v);
        if (k.stopp) {
          // Out of budget in the middle of a depth: the first move searched was the last depth's
          // best, so a move that beat it here is better.
          if (verdier.length) best = verdier[0].m;
          break;
        }
        // Middels picks among the moves close to the best; Vanskelig the best (ties at random,
        // as the order was shuffled).
        const topp = niva === 2 ? verdier.filter((x) => x.v >= verdier[0].v - 6) : [verdier[0]];
        best = topp[Math.floor(tilfeldig() * topp.length)].m;
        rot = [best, ...verdier.map((x) => x.m).filter((m) => m !== best)];
        if (Math.abs(verdier[0].v) > VINN / 2) break;
      }
      return best;
    }
    function velg(p, o) {
      const it = finn(p, o);
      let r = it.next();
      while (!r.done) r = it.next();
      return r.value;
    }
    // In the page: slices of about 10 ms; returns a function that stops the search.
    function tenk(p, o, ferdig) {
      const it = finn(p, o);
      let stopp = false;
      let id = null;
      const steg = () => {
        if (stopp) return;
        const slutt = performance.now() + 10;
        let r = it.next();
        while (!r.done && performance.now() < slutt) r = it.next();
        if (r.done) ferdig(r.value);
        else id = setTimeout(steg, 0);
      };
      id = setTimeout(steg, 0);
      return () => {
        stopp = true;
        clearTimeout(id);
      };
    }

    return { NIVA, VINN, evaluer, velg, tenk };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules and the engine.
    window.Molla = { Molle, Motor };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const KLASSE = ["hvit", "svart"]; // class names // sprak-ok
  const FARGENAVN = [R.t("hvit"), R.t("svart")];
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen flytter litt på måfå. Fint for å lære reglene."),
    2: R.t("Mobilen ser ett trekk fram og stopper de fleste møllene dine."),
    3: R.t("Mobilen tenker mange trekk fram. Klarer du å slå den?"),
  };
  const NIVAER = [1, 2, 3];
  const MAL = [1, 3, 0];
  const MALNAVN = { 1: R.t("Ett parti"), 3: R.t("Først til {n}", { n: 3 }), 0: R.t("Uten slutt") };
  const MIN_TENK = 600;
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "molla") + "/";
  let H;

  // S.spill: { id, modus "mobil" | "to", niva, mal, starter (player with white this round),
  //   trekk (move texts), venter [fra, til] (a mill waiting for its capture) | null, poeng [p0, p1],
  //   uavgjort, runde, resultat { vinner (player | null), grunn } | null, ferdig, registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, i) => sp.modus === "mobil" && i === 1;
  const navn = (sp, i) => (sp.modus === "mobil" ? (i === 1 ? R.t("Mobilen") : R.t("Du")) : R.navn(i));
  const spillerFor = (sp, side) => (side === 0 ? sp.starter : 1 - sp.starter);
  const sideFor = (sp, i) => (i === sp.starter ? 0 : 1);

  let parti = null;
  let partiFor = "";
  const partiNokkel = (sp) => `${sp.id}:${sp.runde}:${sp.trekk.length}:${sp.trekk[sp.trekk.length - 1] || ""}`;
  function hentParti(S) {
    const sp = S.spill;
    const n = partiNokkel(sp);
    if (parti && partiFor === n) return parti;
    parti = Molle.spillUt(sp.trekk);
    partiFor = n;
    return parti;
  }
  const merkParti = (S) => (partiFor = partiNokkel(S.spill));
  const tur = (S) => spillerFor(S.spill, hentParti(S).tur);
  const kampVunnet = (sp) => !!sp.mal && Math.max(sp.poeng[0], sp.poeng[1]) >= sp.mal;

  let valgt = -1; // the piece picked up (moving phase)
  let animer = null; // { m } the move just played (the piece glides, the taken one fades)
  let tenkId = null;
  let tenkStopp = null;
  let tenkerPa = "";
  let kaaringId = null;

  // ---------- Sounds ----------
  const lyd = {
    sett: () => {
      R.lyd.stoy(0, 0.05, 0.2, 1100);
      R.lyd.tone(200, 0, 0.09, "sine", 0.16, 130);
    },
    molle: () => {
      R.lyd.tone(523, 0, 0.12, "triangle", 0.13);
      R.lyd.tone(659, 0.1, 0.12, "triangle", 0.13);
      R.lyd.tone(784, 0.2, 0.22, "triangle", 0.14);
    },
    ta: () => R.lyd.stoy(0, 0.18, 0.16, 700),
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

  // ---------- Playing ----------
  const kanSpille = (S) => {
    const sp = S.spill;
    return !!sp && !sp.ferdig && !sp.resultat && !erMaskin(sp, tur(S));
  };

  function spillTrekk(S, m) {
    const sp = S.spill;
    const p = hentParti(S);
    if (!Molle.erLovlig(p, m)) return;
    const hvem = spillerFor(sp, p.tur);
    Molle.spill(p, m);
    sp.trekk.push(Molle.tekst(m));
    sp.venter = null;
    valgt = -1;
    merkParti(S);
    animer = R.rolig() ? null : { m };
    lyd.sett();
    if (m[2] >= 0) {
      lyd.molle();
      setTimeout(lyd.ta, 260);
      R.vibrer([20, 40, 30]);
    } else R.vibrer(10);
    const hvor = { til: Molle.navn(m[1]), fra: m[0] >= 0 ? Molle.navn(m[0]) : "", ta: m[2] >= 0 ? Molle.navn(m[2]) : "" };
    const mobil = sp.modus === "mobil";
    let linje;
    if (m[0] < 0) linje = mobil ? (hvem === 0 ? R.t("Du satte en brikke på {til}.", hvor) : R.t("Mobilen satte en brikke på {til}.", hvor)) : R.t("{navn} satte en brikke på {til}.", { ...hvor, navn: navn(sp, hvem) });
    else linje = mobil ? (hvem === 0 ? R.t("Du flyttet fra {fra} til {til}.", hvor) : R.t("Mobilen flyttet fra {fra} til {til}.", hvor)) : R.t("{navn} flyttet fra {fra} til {til}.", { ...hvor, navn: navn(sp, hvem) });
    if (m[2] >= 0) linje += " " + R.t("Mølle! Brikka på {ta} er tatt.", hvor);
    if (p.slutt) {
      avsluttRunde(S, p);
      linje += " " + resultatLinje(S);
    } else if (!erMaskin(sp, spillerFor(sp, p.tur))) linje += " " + (mobil ? R.t("Din tur.") : R.t("{navn} sin tur.", { navn: navn(sp, spillerFor(sp, p.tur)) }));
    R.si(linje);
    R.vis();
    if (!p.slutt) startTenking(S);
  }

  function resultatLinje(S) {
    const sp = S.spill;
    const r = sp.resultat;
    if (!r) return "";
    if (r.vinner == null) return R.t("Uavgjort – ingen har tatt en brikke på {n} trekk.", { n: Molle.REMIS });
    const mobil = sp.modus === "mobil";
    return mobil ? (r.vinner === 0 ? R.t("Du vinner!") : R.t("Mobilen vinner!")) : R.t("{navn} vinner!", { navn: navn(sp, r.vinner) });
  }
  // Why the round ended, about the loser.
  function grunnLinje(sp) {
    const r = sp.resultat;
    if (!r || r.vinner == null) return R.t("{n} trekk uten at noen tok en brikke.", { n: Molle.REMIS });
    const taper = 1 - r.vinner;
    const mobil = sp.modus === "mobil";
    if (r.grunn === "fast") return mobil ? (taper === 0 ? R.t("Du kan ikke flytte noen brikke.") : R.t("Mobilen kan ikke flytte noen brikke.")) : R.t("{navn} kan ikke flytte noen brikke.", { navn: navn(sp, taper) });
    return mobil ? (taper === 0 ? R.t("Du har bare to brikker igjen.") : R.t("Mobilen har bare to brikker igjen.")) : R.t("{navn} har bare to brikker igjen.", { navn: navn(sp, taper) });
  }

  function avsluttRunde(S, p) {
    const sp = S.spill;
    stoppTenking();
    const vinner = p.vinner == null ? null : spillerFor(sp, p.vinner);
    sp.resultat = { vinner, grunn: p.grunn };
    if (vinner == null) sp.uavgjort++;
    else sp.poeng[vinner]++;
    telRekord(S, vinner, 1);
    if (sp.modus === "mobil" && vinner === 0) R.merke("klassiker-molla");
    const fortsatt = R.vakt();
    const runde = sp.runde;
    setTimeout(() => {
      if (!fortsatt() || !R.S.spill || R.S.spill.runde !== runde || !R.S.spill.resultat) return;
      feir(R.S);
    }, R.rolig() ? 100 : 750);
    if (kampVunnet(sp)) tilKaaringOm(S, 2800);
  }
  function feir(S) {
    const sp = S.spill;
    const v = sp.resultat.vinner;
    if (v == null) return R.lyd.pling();
    if (sp.modus === "mobil" && v === 1) return lyd.tap();
    R.lyd.fanfare();
    R.vibrer([40, 60, 120]);
    R.konfetti();
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
      if (fortsatt() && sp && sp.id === id && !sp.ferdig && kampVunnet(sp) && R.S.skjerm === "spill" && !R.arkApent()) avsluttKamp(R.S);
    }, R.rolig() ? Math.min(ms, 1500) : ms);
  }
  function avsluttKamp(S) {
    const sp = S.spill;
    clearTimeout(kaaringId);
    stoppTenking();
    if (!sp.resultat) sp.trekk = [];
    sp.venter = null;
    sp.ferdig = true;
    parti = null;
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.modus === "mobil" ? sp.niva : 0, runder: sp.poeng[0] + sp.poeng[1] + sp.uavgjort, uavgjort: sp.uavgjort, mal: sp.mal || 0 });
    R.gaTil("slutt");
  }

  // ---------- The phone's turn ----------
  function startTenking(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.resultat || S.skjerm !== "spill" || !erMaskin(sp, tur(S))) return;
    const nokkel = partiNokkel(sp);
    if ((tenkStopp || tenkId) && tenkerPa === nokkel) return;
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    const gjelder = () => fortsatt() && R.S.spill && !R.S.spill.resultat && partiNokkel(R.S.spill) === nokkel;
    const start = performance.now();
    // The search runs in slices of about 10 ms (the page stays responsive); the phone never
    // moves faster than MIN_TENK, and never behind a sheet.
    tenkStopp = Motor.tenk(Molle.spillUt(sp.trekk), { niva: sp.niva }, (m) => {
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
        if (m) spillTrekk(R.S, m);
      };
      tenkId = setTimeout(spillNaa, Math.max(0, MIN_TENK + (R.rolig() ? 0 : 200) - (performance.now() - start)));
    });
  }
  function stoppTenking() {
    if (tenkStopp) tenkStopp();
    tenkStopp = null;
    clearTimeout(tenkId);
    tenkId = null;
    tenkerPa = "";
  }

  // «Angre»: two players one move; against the phone back to before your own last move.
  function angreAntall(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const n = p.hist.length;
    if (!n) return 0;
    if (sp.modus !== "mobil") return 1;
    const meg = sideFor(sp, 0);
    for (let i = n - 1; i >= 0; i--) if (p.hist[i].s === meg) return n - i;
    return 0;
  }

  // ---------- What the player may do now ----------
  // { fase, flytt: Map(piece → targets), sett: Set(points), ta: Set(pieces) } for the human on turn.
  function muligheter(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const ut = { fase: Molle.fase(p, p.tur), flytt: new Map(), sett: new Set(), ta: new Set() };
    if (!kanSpille(S)) return ut;
    if (sp.venter) {
      for (const m of Molle.lovlige(p)) if (m[0] === sp.venter[0] && m[1] === sp.venter[1] && m[2] >= 0) ut.ta.add(m[2]);
      return ut;
    }
    for (const [fra, til] of Molle.grunntrekk(p, p.tur)) {
      if (fra < 0) ut.sett.add(til);
      else {
        if (!ut.flytt.has(fra)) ut.flytt.set(fra, []);
        ut.flytt.get(fra).push(til);
      }
    }
    return ut;
  }

  // ---------- Markup ----------
  const skiveHtml = (side, klasse, stil) => `<span class="ml-skive ${KLASSE[side]}${klasse ? " " + klasse : ""}"${stil ? ` style="${stil}"` : ""} aria-hidden="true"></span>`;
  const pos = (i) => [8 + Molle.XY[i][0] * 14, 8 + Molle.XY[i][1] * 14];

  function brettHtml(S, o) {
    const sp = S.spill;
    const p = hentParti(S);
    const mu = o.interaktiv ? muligheter(S) : { fase: "", flytt: new Map(), sett: new Set(), ta: new Set() };
    // A mill waiting for its capture: show the piece where it went.
    const b = p.b.slice();
    if (o.interaktiv && sp.venter) {
      if (sp.venter[0] >= 0) b[sp.venter[0]] = 0;
      b[sp.venter[1]] = p.tur + 1;
    }
    const sist = p.hist.length ? p.hist[p.hist.length - 1].m : null;
    const mal = valgt >= 0 && mu.flytt.has(valgt) ? new Set(mu.flytt.get(valgt)) : new Set();
    const ferdig = !!sp.resultat;
    const vinnerSide = ferdig && sp.resultat.vinner != null ? sideFor(sp, sp.resultat.vinner) : -1;
    const fokus = valgt >= 0 ? valgt : sp.venter ? sp.venter[1] : sist ? sist[1] : 4;
    const punkter = [];
    for (let i = 0; i < 24; i++) {
      const c = b[i];
      const kl = ["ml-punkt"];
      let etikett = Molle.navn(i) + ", " + (c ? (c === 1 ? R.t("hvit brikke") : R.t("svart brikke")) : R.t("tom"));
      if (mu.sett.has(i)) {
        kl.push("mulig");
        etikett += ", " + R.t("du kan sette her");
      }
      if (mu.flytt.has(i)) {
        kl.push("kan");
        etikett += ", " + R.t("kan flyttes");
      }
      if (i === valgt) {
        kl.push("valgt");
        etikett += ", " + R.t("valgt");
      }
      if (mal.has(i)) {
        kl.push("mulig");
        etikett += ", " + R.t("du kan flytte hit");
      }
      if (mu.ta.has(i)) {
        kl.push("ta");
        etikett += ", " + R.t("kan tas");
      }
      if (sist && (i === sist[1] || i === sist[0]) && !sp.venter) kl.push(i === sist[1] ? "sist" : "fra");
      if (sp.venter && i === sp.venter[1]) kl.push("sist");
      if (o.interaktiv && i === fokus) kl.push("fokus");
      const [x, y] = pos(i);
      let innhold = "";
      if (c) {
        const k = [];
        if (o.interaktiv && animer && i === animer.m[1]) k.push(animer.m[0] >= 0 ? "glid" : "ny");
        if (ferdig && c - 1 === vinnerSide) k.push("vant");
        let stil = "";
        if (k.includes("glid")) {
          const [x0, y0] = pos(animer.m[0]);
          stil = `--dx:${x0 - x};--dy:${y0 - y}`;
        }
        innhold = skiveHtml(c - 1, k.join(" "), stil);
      } else if (o.interaktiv && animer && animer.m[2] === i) innhold = skiveHtml(p.tur, "tatt");
      const stilPunkt = `left:${x}%;top:${y}%`;
      punkter.push(
        o.interaktiv
          ? `<button class="${kl.join(" ")}" style="${stilPunkt}" data-h="punkt" data-v="${Molle.navn(i)}" data-stille tabindex="${i === fokus ? 0 : -1}" aria-label="${esc(etikett)}">${innhold}</button>`
          : `<span class="${kl.join(" ")}" style="${stilPunkt}">${innhold}</span>`,
      );
    }
    if (o.interaktiv) animer = null;
    // The board: three squares and the four lines between them.
    const ruter = [8, 22, 36].map((a) => `<rect x="${a}" y="${a}" width="${100 - 2 * a}" height="${100 - 2 * a}"/>`).join("");
    const linjer = '<path d="M50 8V36M50 64V92M8 50H36M64 50H92"/>';
    const stempel = o.stempel ? `<span class="ml-stempel" aria-hidden="true"><span class="stempel ${o.stempel.klasse}">${esc(o.stempel.tekst)}</span></span>` : "";
    return `<div class="ml-brett${o.liten ? " liten" : ""}"${o.interaktiv ? ` role="group" aria-label="${esc(R.t("Brettet"))}"` : ' aria-hidden="true"'}>
      <svg class="ml-linjer" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${ruter}${linjer}</svg>
      ${punkter.join("")}${stempel}
    </div>`;
  }

  const tallTekst = (sp) => [sp.mal ? esc(sp.mal === 1 ? R.t("ett parti") : R.t("først til {n}", { n: sp.mal })) : "", sp.uavgjort ? esc(R.flertall(sp.uavgjort, "uavgjort", "uavgjort")) : ""].filter(Boolean).join("<br>");

  function poengHtml(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const naa = sp.resultat ? -1 : tur(S);
    const kort = (i) => {
      const s = sideFor(sp, i);
      const hand = p.hand[s];
      return `<div class="ml-spiller${naa === i ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === i ? " vant" : ""}">
        <span class="ml-merke" aria-hidden="true">${erMaskin(sp, i) ? `<span class="ml-maskin">${R.figur()}</span>` : R.avatar(i)}</span>
        <b class="ml-navn">${esc(navn(sp, i))}</b>
        <span class="ml-antall" aria-hidden="true">${skiveHtml(s, "liten")}<b>${Molle.igjen(p, s)}</b>${hand ? `<small>${esc(R.t("{n} å sette", { n: hand }))}</small>` : ""}</span>
      </div>`;
    };
    const om = (i) => R.t("{navn}: {farge}, {n} brikker, {h} å sette.", { navn: navn(sp, i), farge: FARGENAVN[sideFor(sp, i)], n: Molle.igjen(p, sideFor(sp, i)), h: p.hand[sideFor(sp, i)] });
    return `<div class="ml-stilling" role="group" aria-label="${esc(R.t("Stillingen: {a} {pa}, {b} {pb}.", { a: navn(sp, 0), pa: sp.poeng[0], b: navn(sp, 1), pb: sp.poeng[1] }) + " " + om(0) + " " + om(1))}">
      ${kort(0)}
      <div class="ml-tall" aria-hidden="true"><b>${sp.poeng[0]}</b><span>–</span><b>${sp.poeng[1]}</b>${tallTekst(sp) ? `<small>${tallTekst(sp)}</small>` : ""}</div>
      ${kort(1)}
    </div>`;
  }

  function meldingHtml(S) {
    const sp = S.spill;
    if (sp.resultat) {
      const v = sp.resultat.vinner;
      let tekst = resultatLinje(S);
      if (v != null && kampVunnet(sp) && sp.mal > 1) tekst = sp.modus === "mobil" ? (v === 0 ? R.t("Du vinner kampen – først til {n}!", { n: sp.mal }) : R.t("Mobilen vinner kampen!")) : R.t("{navn} vinner kampen!", { navn: navn(sp, v) });
      if (v == null) tekst = R.t("Uavgjort!");
      return `<p class="ml-melding ${v == null ? "remis" : "vinner"}"><span>${esc(tekst)}<small>${esc(grunnLinje(sp))}</small></span></p>`;
    }
    const p = hentParti(S);
    const i = tur(S);
    const s = p.tur;
    const mobil = sp.modus === "mobil";
    let tekst;
    let klasse = "";
    if (erMaskin(sp, i)) tekst = `<span class="ml-tenker">${esc(sp.trekk.length ? R.t("Mobilen tenker") : R.t("Mobilen begynner"))}<i>.</i><i>.</i><i>.</i></span>`;
    else if (sp.venter) {
      klasse = " molle";
      tekst = esc(mobil ? R.t("Mølle! Ta en av mobilens brikker") : R.t("Mølle! Ta en av {navn} sine brikker", { navn: navn(sp, 1 - i) }));
    } else {
      const f = Molle.fase(p, s);
      const n = { navn: navn(sp, i) };
      if (f === "sett") tekst = mobil ? R.t("Din tur – sett en brikke") : R.t("{navn}: sett en brikke", n);
      else if (valgt >= 0) tekst = mobil ? R.t("Flytt til en prikk") : R.t("{navn}: flytt til en prikk", n);
      else if (f === "fly") {
        klasse = " fly";
        tekst = mobil ? R.t("Du har tre igjen – hopp hvor du vil!") : R.t("{navn}: tre igjen – hopp hvor du vil!", n);
      } else tekst = mobil ? R.t("Din tur – flytt en brikke") : R.t("{navn}: flytt en brikke", n);
      tekst = esc(tekst);
    }
    return `<p class="ml-melding${klasse}">${skiveHtml(s, "liten")}<span>${tekst}</span></p>`;
  }

  // ---------- Board size ----------
  const TO_KOLONNER = "(min-width: 900px) and (min-aspect-ratio: 5/4), (orientation: landscape) and (max-height: 600px) and (min-width: 560px)";
  function tilpass() {
    const brett = R.$(".skjerm-spill .ml-brett");
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
    for (let n = 0; n < 3; n++) {
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

  // Keyboard: the arrows go to the nearest point in that direction.
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("ml-punkt") || !el.dataset.v) return;
    const steg = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!steg) return;
    e.preventDefault();
    const i = Molle.punkt(el.dataset.v);
    const [x0, y0] = Molle.XY[i];
    let best = -1, bestD = Infinity;
    for (let j = 0; j < 24; j++) {
      const [x, y] = Molle.XY[j];
      const fram = (x - x0) * steg[0] + (y - y0) * steg[1];
      if (fram <= 0) continue;
      const d = fram + 2.5 * Math.abs((x - x0) * steg[1] + (y - y0) * steg[0]);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    const ny = best >= 0 && R.$(`.ml-punkt[data-v="${Molle.navn(best)}"]`);
    if (ny) {
      el.tabIndex = -1;
      ny.tabIndex = 0;
      ny.focus();
    }
  });

  // ---------- Setup and flow ----------
  function nyKamp(S) {
    const o = S.oppsett;
    const starter = o.starter === 1 ? 1 : 0;
    o.starter = 1 - starter; // the next match is opened by the other one, unless changed
    S.spill = { id: R.nyttFro() % 1e9, modus: o.modus, niva: o.niva, mal: o.mal, starter, trekk: [], venter: null, poeng: [0, 0], uavgjort: 0, runde: 1, resultat: null, ferdig: false, registrert: false };
    nullstillVisning();
    R.statistikk("start", { modus: o.modus, niva: o.modus === "mobil" ? o.niva : 0, mal: o.mal });
  }
  function nyRunde(S) {
    const sp = S.spill;
    sp.runde++;
    sp.starter = 1 - sp.starter;
    sp.trekk = [];
    sp.venter = null;
    sp.resultat = null;
    nullstillVisning();
  }
  function nullstillVisning() {
    parti = null;
    animer = null;
    valgt = -1;
    stoppTenking();
    clearTimeout(kaaringId);
  }
  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.uavgjort + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.uavgjort}</b> ${esc(R.t("uavgjort|uavgjort", { n: r.uavgjort }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }
  const IKON = '<span class="ml-knappeikon" aria-hidden="true"></span>';

  function stempelFor(sp) {
    const r = sp.resultat || {};
    if (r.vinner == null) return { tekst: R.t("Uavgjort"), klasse: "lampe" };
    return { tekst: sideFor(sp, r.vinner) === 0 ? R.t("Hvit vant") : R.t("Svart vant"), klasse: "aksent" };
  }

  function delTekst(sp) {
    const [a, b] = sp.poeng;
    const tall = `${a}–${b}`;
    if (sp.modus === "mobil") {
      const niva = NIVANAVN[sp.niva].toLowerCase();
      if (a > b) return R.t("Jeg slo mobilen {tall} i mølle på {niva}! Klarer du det?", { tall, niva });
      if (a === b) return R.t("Uavgjort {tall} mot mobilen i mølle på {niva}. Klarer du bedre?", { tall, niva });
      return R.t("Mobilen slo meg {tall} i mølle på {niva}. Klarer du bedre?", { tall, niva });
    }
    const v = a === b ? null : a > b ? 0 : 1;
    if (v == null) return R.t("Uavgjort {tall} i mølle!", { tall });
    return R.t("{navn} vant {tall} i mølle!", { navn: R.kutt(navn(sp, v), 16), tall });
  }

  R.start({
    id: "molla",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, mal: 1, starter: 0 },
      spill: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, mal: 1, starter: 0 }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!MAL.includes(o.mal)) o.mal = 1;
      o.starter = o.starter === 1 ? 1 : 0;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const p = Array.isArray(sp.trekk) && Array.isArray(sp.poeng) && sp.poeng.length === 2 && [0, 1].includes(sp.starter) && ["mobil", "to"].includes(sp.modus) && NIVAER.includes(sp.niva) && MAL.includes(sp.mal) ? Molle.spillUt(sp.trekk) : null;
        if (!p) S.spill = null;
        else {
          // A mill waiting for its capture must still be one.
          const v = sp.venter;
          if (v && !(Array.isArray(v) && Molle.lovlige(p).some((m) => m[0] === v[0] && m[1] === v[1] && m[2] >= 0))) sp.venter = null;
          if (p.slutt && !sp.resultat) {
            const vinner = p.vinner == null ? null : spillerFor(sp, p.vinner);
            sp.resultat = { vinner, grunn: p.grunn };
            if (vinner == null) sp.uavgjort++;
            else sp.poeng[vinner]++;
          }
          if (!p.slutt && !sp.ferdig) sp.resultat = null;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Mølle er et gammelt brettspill for to. Få tre brikker på rad – en mølle – og ta en av motstanderens brikker."),
      steg: [
        [R.t("Sett ut brikkene"), R.t("Dere har ni brikker hver og setter dem ut på prikkene, én om gangen. Hvit begynner.")],
        [R.t("Flytt og lag mølle"), R.t("Når alle brikkene står på brettet, flytter dere én brikke langs en strek til en ledig nabo-prikk. Tre på rad langs en strek er en mølle: Da tar du en av motstanderens brikker.")],
        [R.t("Vinn"), R.t("Den som bare har to brikker igjen, eller ikke kan flytte, har tapt. Med tre brikker igjen kan du hoppe til hvilken som helst ledig prikk.")],
      ],
      tips: [
        R.t("Brikker i en mølle kan ikke tas – med mindre alle motstanderens brikker står i møller."),
        R.t("Flytt en brikke ut av en mølle og tilbake igjen, så får du en ny mølle."),
        R.t("Prikkene midt på sidene har fire naboer. Der kan brikkene flytte mest."),
        R.t("Har ingen tatt en brikke på 50 trekk, blir det uavgjort."),
        R.t("Dere bytter på å begynne. Trykket feil? «Angre» tar tilbake trekket."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = NIVAER.map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Tre på rad er en mølle –"))}<br><em>${esc(R.t("og en brikke mindre for den andre!"))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? (sp.mal === 1 ? R.t("Fortsett partiet") : R.t("Fortsett · {stilling}", { stilling: `${sp.poeng[0]}–${sp.poeng[1]}` })) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–2", R.t("spillere")],
                ["3", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="ml-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="ml-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
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
              <h2>${esc(R.t("Hvem begynner?"))}</h2>
              ${R.ui.seg("starter", hvem, o.starter, { etikett: R.t("Hvem begynner") })}
              <p class="hjelp">${esc(mot ? R.t("Den som begynner, har de hvite brikkene. Du og mobilen bytter på å begynne for hver runde.") : R.t("Den som begynner, har de hvite brikkene. Dere bytter på å begynne for hver runde."))}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor lenge?"))}</h2>
              ${R.ui.seg("mal", MAL.map((m) => [m, MALNAVN[m]]), o.mal, { etikett: R.t("Hvor lenge") })}
              <p class="hjelp">${esc(o.mal === 1 ? R.t("Ett parti – den som vinner det, vinner.") : o.mal ? R.t("Den som først vinner {n} partier, vinner kampen.", { n: o.mal }) : R.t("Dere spiller så mange partier dere vil, og avslutter når dere vil."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.mal === 1 ? (S.spill.modus === "mobil" ? R.t("Mot mobilen") : R.t("To spillere")) : R.t("Runde {n}", { n: S.spill.runde })),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = !!sp.resultat;
          const kanAngre = (sp.venter || angreAntall(S) > 0) && !sp.ferdig;
          const st = ferdig ? stempelFor(sp) : null;
          const tittel = (sp.mal === 1 ? R.t("Mølle") : R.t("Mølle, runde {n}", { n: sp.runde })) + ": " + (ferdig ? R.t("partiet er ferdig") : erMaskin(sp, tur(S)) ? R.t("mobilen sin tur") : sp.modus === "mobil" ? R.t("din tur") : R.t("{navn} sin tur", { navn: navn(sp, tur(S)) }));
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(tittel)}</h1>
            ${poengHtml(S)}
            ${meldingHtml(S)}
            <span class="ml-luft" aria-hidden="true"></span>
            <div class="ml-brettramme">${brettHtml(S, { interaktiv: true, stempel: st })}</div>
            <span class="ml-luft under" aria-hidden="true"></span>
            ${R.ui.dokk(
              ferdig ? (kampVunnet(sp) ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Ny runde"), "runde", { ikon: IKON })) : "",
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
          if (kampVunnet(S.spill) && S.spill.resultat) tilKaaringOm(S, 1800);
        },
        ut() {
          stoppTenking();
          clearTimeout(kaaringId);
          animer = null;
          valgt = -1;
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
          if (vinner == null) tittel = a === 0 && !sp.uavgjort ? R.t("Ingen vinner denne gangen") : R.t("Uavgjort!");
          else if (sp.modus === "mobil") tittel = vinner === 0 ? R.t("Du vinner!") : R.t("Mobilen vinner!");
          else tittel = R.t("{navn} vinner!", { navn: navn(sp, vinner) });
          const runder = a + b + sp.uavgjort;
          const etikett = `${R.flertall(runder, "parti", "partier")}${sp.uavgjort ? ` · ${R.flertall(sp.uavgjort, "uavgjort", "uavgjort")}` : ""}`;
          const figur = vinner != null && !(sp.modus === "mobil" && vinner === 1) ? `<span class="ml-vinner">${R.avatar(vinner, "gigant")}<span class="ml-kroneemoji" aria-hidden="true">👑</span></span>` : R.figur();
          const tekst = sp.modus === "mobil" && vinner === 1 ? (sp.niva > 1 ? R.t("Godt kjempa! Prøv igjen – eller velg et lettere nivå.") : R.t("Godt kjempa! Prøv igjen.")) : vinner == null && runder > 0 ? R.t("Like mange seirer hver. Det får avgjøres neste gang!") : "";
          let rekord = "";
          if (sp.modus === "mobil") {
            const rek = rekordHtml(S, sp.niva);
            rekord = rek ? `<p class="ml-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : "";
          }
          return `
            <div class="banner ${sp.modus === "mobil" && vinner === 1 ? "" : "aksent"}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>
            ${R.ui.poengliste(rader)}
            ${rekord}
            ${runder ? `<div class="ml-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "to" ? 2 : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: IKON }), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
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
      starter(el, e, S) {
        S.oppsett.starter = el.dataset.v === "1" ? 1 : 0;
        R.vis();
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = MAL.includes(m) ? m : 1;
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
      runde(el, e, S) {
        if (!S.spill || !S.spill.resultat) return;
        if (kampVunnet(S.spill)) return avsluttKamp(S);
        nyRunde(S);
        R.lyd.snu();
        R.vis();
        startTenking(S);
      },
      punkt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        if (!kanSpille(S)) {
          R.toast(R.t("Vent litt – mobilen tenker"));
          return;
        }
        const i = Molle.punkt(el.dataset.v);
        if (i < 0) return;
        const p = hentParti(S);
        const mu = muligheter(S);
        const nei = (tekst) => {
          R.lyd.feil();
          R.vibrer(30);
          R.toast(tekst);
          el.classList.remove("risting");
          void el.offsetWidth;
          el.classList.add("risting");
        };
        // 1. A mill: take one of the other side's pieces.
        if (sp.venter) {
          if (mu.ta.has(i)) return spillTrekk(S, [sp.venter[0], sp.venter[1], i]);
          return nei(p.b[i] === 2 - p.tur && Molle.iMolle(p.b, i) ? R.t("Den står i en mølle – ta en annen") : R.t("Ta en av brikkene som blinker"));
        }
        // 2. Place, or pick up and move.
        let fra = -1, til = -1;
        if (mu.fase === "sett") {
          if (!mu.sett.has(i)) return nei(R.t("Her står det allerede en brikke"));
          til = i;
        } else if (p.b[i] === p.tur + 1) {
          if (!mu.flytt.has(i)) return nei(R.t("Den brikka kan ikke flytte nå"));
          valgt = valgt === i ? -1 : i;
          R.lyd.klikk();
          R.vis();
          return;
        } else if (valgt >= 0 && (mu.flytt.get(valgt) || []).includes(i)) {
          fra = valgt;
          til = i;
        } else if (p.b[i]) return nei(R.t("Det er ikke din brikke"));
        else if (valgt < 0) {
          // A single piece that can go here: move it at once.
          const kan = [...mu.flytt].filter(([, mal]) => mal.includes(i)).map(([f]) => f);
          if (kan.length !== 1) return nei(kan.length ? R.t("Velg først hvilken brikke som skal flytte") : R.t("Ingen av brikkene dine kan flytte hit"));
          fra = kan[0];
          til = i;
        } else return nei(mu.fase === "fly" ? R.t("Velg en ledig prikk") : R.t("Dit kan den ikke flytte – bare langs en strek til en ledig nabo"));
        if (Molle.lagerMolle(p.b, fra, til, p.tur)) {
          sp.venter = [fra, til];
          valgt = -1;
          lyd.sett();
          lyd.molle();
          R.vibrer([20, 40, 30]);
          R.si(sp.modus === "mobil" ? R.t("Mølle! Ta en av mobilens brikker.") : R.t("Mølle! Ta en av {navn} sine brikker.", { navn: navn(sp, 1 - tur(S)) }));
          R.vis();
          return;
        }
        spillTrekk(S, [fra, til, -1]);
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        if (sp.venter) {
          sp.venter = null;
          valgt = -1;
          R.lyd.snu();
          R.toast(R.t("Angret"));
          R.vis();
          return;
        }
        const n = angreAntall(S);
        if (n <= 0) return;
        stoppTenking();
        clearTimeout(kaaringId);
        if (sp.resultat) {
          if (sp.resultat.vinner != null) sp.poeng[sp.resultat.vinner] = Math.max(0, sp.poeng[sp.resultat.vinner] - 1);
          else sp.uavgjort = Math.max(0, sp.uavgjort - 1);
          telRekord(S, sp.resultat.vinner, -1);
          sp.resultat = null;
        }
        const p = hentParti(S);
        for (let k = 0; k < n; k++) {
          Molle.tilbake(p);
          sp.trekk.pop();
        }
        merkParti(S);
        animer = null;
        valgt = -1;
        R.lyd.snu();
        R.toast(n >= 2 ? R.t("Angret – din tur igjen") : R.t("Angret"));
        R.vis();
        startTenking(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const [a, b] = sp.poeng;
        const linjer = [`${a}–${b}`, sp.modus === "mobil" ? R.t("Mot mobilen · {niva}", { niva: NIVANAVN[sp.niva].toLowerCase() }) : `${R.kutt(navn(sp, 0), 16)} – ${R.kutt(navn(sp, 1), 16)}`];
        R.del(R.app.navn, delTekst(sp), ADRESSE, { kort: { tittel: R.app.navn, linjer } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        const runder = sp.poeng[0] + sp.poeng[1] + sp.uavgjort;
        stoppTenking();
        const ja = await R.bekreft(
          R.t("Avslutte spillet?"),
          runder ? R.t("Dere går til kåringen. Stillingen er {stilling}. Et parti som ikke er ferdig, teller ikke.", { stilling: `${sp.poeng[0]}–${sp.poeng[1]}` }) : R.t("Partiet som er i gang, teller ikke. Dere kan alltid starte et nytt."),
          R.t("Avslutt"),
          R.t("Spill videre"),
        );
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return startTenking(S);
        if (!runder) {
          S.spill = null;
          nullstillVisning();
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });
})();
