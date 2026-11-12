/* Reversi — 8 × 8, on one phone: two players, or against the phone at four levels. The rules (a
   move must flip at least one disc, pass when you can't move, the game ends when neither can) and
   the engine (random, greedy, positional, alpha-beta with mobility, corners and edges, searched in
   small slices) are pure functions at the top of this file. test/reversi.test.mjs loads the file
   without the kit and checks them. */
(function () {
  "use strict";

  // ---------- The rules ----------
  // Square s = row * 8 + column, a1 = 0 in the top left corner, h8 = 63 (rows are counted from the
  // top, as is usual for this game). A cell: 0 empty, 1 black, 2 white. Black (side 0) starts.

  const Rev = (() => {
    const SVART = 0, HVIT = 1;
    const navn = (s) => "abcdefgh"[s & 7] + ((s >> 3) + 1);
    const rute = (t) => {
      const c = String(t).charCodeAt(0) - 97, r = String(t).charCodeAt(1) - 49;
      return String(t).length === 2 && c >= 0 && c < 8 && r >= 0 && r < 8 ? r * 8 + c : -1;
    };
    const RETNING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const STRALE = [];
    for (let s = 0; s < 64; s++)
      for (const [dr, dc] of RETNING) {
        const ray = [];
        for (let r = (s >> 3) + dr, c = (s & 7) + dc; r >= 0 && r < 8 && c >= 0 && c < 8; r += dr, c += dc) ray.push(r * 8 + c);
        STRALE.push(ray);
      }

    function nyttBrett() {
      const b = new Int8Array(64);
      b[27] = 2; // d4 white
      b[36] = 2; // e5 white
      b[28] = 1; // e4 black
      b[35] = 1; // d5 black
      return b;
    }

    // The discs a move on s would flip (empty list = not a legal move).
    function snur(b, s, side, ut) {
      ut = ut || [];
      if (b[s]) return ut;
      const meg = side + 1, du = 2 - side;
      for (let d = 0; d < 8; d++) {
        const ray = STRALE[s * 8 + d];
        let i = 0;
        while (i < ray.length && b[ray[i]] === du) i++;
        if (i > 0 && i < ray.length && b[ray[i]] === meg) for (let j = 0; j < i; j++) ut.push(ray[j]);
      }
      return ut;
    }
    function kan(b, s, side) {
      if (b[s]) return false;
      const meg = side + 1, du = 2 - side;
      for (let d = 0; d < 8; d++) {
        const ray = STRALE[s * 8 + d];
        if (ray.length < 2 || b[ray[0]] !== du) continue;
        let i = 1;
        while (i < ray.length && b[ray[i]] === du) i++;
        if (i < ray.length && b[ray[i]] === meg) return true;
      }
      return false;
    }
    function lovlige(b, side) {
      const ut = [];
      for (let s = 0; s < 64; s++) if (!b[s] && kan(b, s, side)) ut.push(s);
      return ut;
    }
    function antall(b) {
      const n = [0, 0];
      for (let s = 0; s < 64; s++) if (b[s]) n[b[s] - 1]++;
      return n;
    }
    // Put a disc on s for side and flip; returns the flipped squares (for taking it back).
    function legg(b, s, side) {
      const f = snur(b, s, side);
      b[s] = side + 1;
      for (const x of f) b[x] = side + 1;
      return f;
    }
    function fjern(b, s, side, f) {
      b[s] = 0;
      for (const x of f) b[x] = 2 - side;
    }

    // A game: the board, whose turn, and the history. When the side to move has no move and the
    // other side has, the turn passes by itself (p.pass counts those passes in the history).
    function nyttParti() {
      const p = { b: nyttBrett(), tur: SVART, trekk: [], hist: [], lovlige: [], slutt: false };
      p.lovlige = lovlige(p.b, p.tur);
      return p;
    }
    function oppdater(p) {
      p.lovlige = lovlige(p.b, p.tur);
      let pass = false;
      if (!p.lovlige.length) {
        const andre = lovlige(p.b, p.tur ^ 1);
        if (andre.length) {
          p.tur ^= 1;
          p.lovlige = andre;
          pass = true;
        } else p.slutt = true;
      }
      return pass;
    }
    function spill(p, s) {
      if (p.slutt || !p.lovlige.includes(s)) return null;
      const side = p.tur;
      const f = legg(p.b, s, side);
      p.trekk.push(s);
      p.tur = side ^ 1;
      const pass = oppdater(p);
      p.hist.push({ s, side, f, pass });
      return p.hist[p.hist.length - 1];
    }
    function tilbake(p) {
      const h = p.hist.pop();
      if (!h) return null;
      p.trekk.pop();
      fjern(p.b, h.s, h.side, h.f);
      p.tur = h.side;
      p.slutt = false;
      p.lovlige = lovlige(p.b, p.tur);
      return h;
    }
    // Replay a saved list of square names; null if a move is not legal.
    function spillUt(liste) {
      const p = nyttParti();
      if (!Array.isArray(liste)) return null;
      for (const t of liste) if (!spill(p, rute(t))) return null;
      return p;
    }
    // { slutt, vinner (side | null), antall [black, white] }
    function status(p) {
      const n = antall(p.b);
      return { slutt: p.slutt, vinner: !p.slutt || n[0] === n[1] ? null : n[0] > n[1] ? SVART : HVIT, antall: n };
    }

    return { SVART, HVIT, STRALE, navn, rute, nyttBrett, snur, kan, lovlige, antall, legg, fjern, nyttParti, spill, tilbake, spillUt, status };
  })();

  // ---------- The engine ----------
  // Four ways to play: Nybegynner any legal move, Lett the move that flips the most, Middels a
  // two-move search on a table of square values, Vanskelig an alpha-beta search (iterative
  // deepening, slices) on mobility, corners, edges and square values, solving the last moves exactly.

  const Motor = (() => {
    const { lovlige, legg, fjern, kan, antall } = Rev;
    const VEKT = [
      120, -20, 20, 5, 5, 20, -20, 120,
      -20, -40, -5, -5, -5, -5, -40, -20,
      20, -5, 15, 3, 3, 15, -5, 20,
      5, -5, 3, 3, 3, 3, -5, 5,
      5, -5, 3, 3, 3, 3, -5, 5,
      20, -5, 15, 3, 3, 15, -5, 20,
      -20, -40, -5, -5, -5, -5, -40, -20,
      120, -20, 20, 5, 5, 20, -20, 120,
    ];
    const HJORNER = [0, 7, 56, 63];
    // X squares (diagonal to a corner) and C squares (beside it) are only bad while the corner is empty.
    const NABO = { 0: [9, 1, 8], 7: [14, 6, 15], 56: [49, 57, 48], 63: [54, 62, 55] };
    const VINN = 30000, UENDELIG = 32000;

    function vekter(b, side) {
      const meg = side + 1;
      let s = 0;
      for (let i = 0; i < 64; i++) if (b[i]) s += b[i] === meg ? VEKT[i] : -VEKT[i];
      return s;
    }
    function mobilitet(b, side) {
      let n = 0;
      for (let s = 0; s < 64; s++) if (!b[s] && kan(b, s, side)) n++;
      return n;
    }
    // Discs next to an empty square (the frontier): many of them give the other side moves.
    function front(b, side) {
      const meg = side + 1;
      let n = 0;
      for (let s = 0; s < 64; s++) {
        if (b[s] !== meg) continue;
        for (let d = 0; d < 8; d++) {
          const ray = Rev.STRALE[s * 8 + d];
          if (ray.length && !b[ray[0]]) {
            n++;
            break;
          }
        }
      }
      return n;
    }

    // Vanskelig's evaluation, from `side`.
    function evaluer(b, side) {
      const meg = side + 1, du = 2 - side;
      let hj = 0, nabo = 0;
      for (const c of HJORNER) {
        if (b[c] === meg) hj++;
        else if (b[c] === du) hj--;
        else {
          const [x, c1, c2] = NABO[c];
          if (b[x] === meg) nabo -= 2;
          else if (b[x] === du) nabo += 2;
          if (b[c1] === meg) nabo--;
          else if (b[c1] === du) nabo++;
          if (b[c2] === meg) nabo--;
          else if (b[c2] === du) nabo++;
        }
      }
      const m1 = mobilitet(b, side), m2 = mobilitet(b, side ^ 1);
      const mob = m1 + m2 ? (100 * (m1 - m2)) / (m1 + m2 + 2) : 0;
      const f1 = front(b, side), f2 = front(b, side ^ 1);
      const fr = f1 + f2 ? (-60 * (f1 - f2)) / (f1 + f2) : 0;
      return Math.round(hj * 300 + nabo * 40 + mob * 1.6 + fr + vekter(b, side) * 0.5);
    }
    const tomme = (b) => {
      let n = 0;
      for (let s = 0; s < 64; s++) if (!b[s]) n++;
      return n;
    };

    function lagKontekst(valg) {
      return { noder: 0, sistPause: 0, maksNoder: valg.maksNoder || 0, stopp: false, eksakt: false };
    }

    // Order: corners first, then by square value.
    const ordne = (ms) => ms.sort((a, b) => VEKT[b] - VEKT[a]);

    function* sok(b, side, dybde, alfa, beta, ctx, pass) {
      ctx.noder++;
      if (ctx.noder - ctx.sistPause >= 128) {
        ctx.sistPause = ctx.noder;
        yield;
      }
      if (ctx.stopp || (ctx.maksNoder && ctx.noder >= ctx.maksNoder)) {
        ctx.stopp = true;
        return 0;
      }
      const ms = lovlige(b, side);
      if (!ms.length) {
        if (pass) {
          const n = antall(b);
          const d = n[side] - n[side ^ 1];
          return d > 0 ? VINN + d : d < 0 ? -VINN + d : 0;
        }
        return -(yield* sok(b, side ^ 1, dybde, -beta, -alfa, ctx, true));
      }
      if (dybde <= 0) return ctx.eksakt ? 0 : evaluer(b, side);
      ordne(ms);
      let best = -UENDELIG;
      for (const s of ms) {
        const f = legg(b, s, side);
        const v = -(yield* sok(b, side ^ 1, dybde - 1, -beta, -alfa, ctx, false));
        fjern(b, s, side, f);
        if (ctx.stopp) return 0;
        if (v > best) best = v;
        if (v > alfa) alfa = v;
        if (alfa >= beta) break;
      }
      return best;
    }

    // Vanskelig: deeper and deeper; with few empty squares left, to the end of the game.
    function* rot(b, side, valg, ctx, resultat) {
      const ms = ordne(lovlige(b, side));
      resultat.trekk = ms[0];
      if (ms.length <= 1) return resultat;
      const igjen = tomme(b);
      const slutt = valg.slutt || 0;
      let rekke = ms.slice();
      for (let d = 1; d <= Math.min(valg.dybde || 30, igjen); d++) {
        ctx.eksakt = igjen <= slutt && d >= igjen;
        if (igjen <= slutt) d = igjen; // solve the end exactly straight away
        let alfa = -UENDELIG, bestS = -1, bestV = -UENDELIG;
        const poeng = new Map();
        for (const s of rekke) {
          const f = legg(b, s, side);
          const v = -(yield* sok(b, side ^ 1, d - 1, -UENDELIG, -alfa, ctx, false));
          fjern(b, s, side, f);
          if (ctx.stopp) return resultat;
          poeng.set(s, v);
          if (v > bestV) {
            bestV = v;
            bestS = s;
          }
          if (v > alfa) alfa = v;
        }
        resultat.trekk = bestS;
        resultat.verdi = bestV;
        resultat.dybde = d;
        rekke = rekke.slice().sort((a, c) => (a === bestS ? -1 : c === bestS ? 1 : (poeng.get(c) || 0) - (poeng.get(a) || 0)));
        if (ctx.eksakt) break;
      }
      return resultat;
    }

    // The quick levels, without search.
    function enkel(b, side, niva, rnd) {
      const ms = lovlige(b, side);
      if (!ms.length) return -1;
      const tilf = (liste) => liste[Math.floor(rnd() * liste.length)];
      if (niva === 1) return tilf(ms);
      if (niva === 2) {
        let best = -1, beste = [];
        for (const s of ms) {
          const n = Rev.snur(b, s, side).length;
          if (n > best) {
            best = n;
            beste = [s];
          } else if (n === best) beste.push(s);
        }
        return tilf(beste);
      }
      // Middels: two moves deep on the square values (my move, the best answer).
      let bestV = -UENDELIG, beste = [];
      for (const s of ms) {
        const f = legg(b, s, side);
        const svar = lovlige(b, side ^ 1);
        let v;
        if (!svar.length) v = vekter(b, side);
        else {
          v = UENDELIG;
          for (const t of svar) {
            const g = legg(b, t, side ^ 1);
            v = Math.min(v, vekter(b, side));
            fjern(b, t, side ^ 1, g);
          }
        }
        fjern(b, s, side, f);
        v += Math.round((rnd() * 2 - 1) * 4);
        if (v > bestV) {
          bestV = v;
          beste = [s];
        } else if (v === bestV) beste.push(s);
      }
      return tilf(beste);
    }

    function kjor(gen, valg, ferdig) {
      const start = performance.now();
      const skive = valg.skive || 12;
      const grense = start + (valg.tid || 1e9);
      let stoppet = false;
      const steg = () => {
        if (stoppet) return;
        const slutt = Math.min(performance.now() + skive, grense);
        let r;
        do r = gen.next();
        while (!r.done && performance.now() < slutt);
        if (r.done || performance.now() >= grense) {
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

    const NIVA = {
      1: { niva: 1 },
      2: { niva: 2 },
      3: { niva: 3 },
      4: { niva: 4, dybde: 30, slutt: 12, tid: 1500 },
    };

    // Think in slices (the quick levels answer at once); ferdig({ trekk, verdi, dybde, noder }).
    function tenk(p, valg, ferdig) {
      const b = Int8Array.from(p.b);
      const rnd = valg.tilfeldig || Math.random;
      if (valg.niva !== 4) {
        const id = setTimeout(() => ferdig({ trekk: enkel(b, p.tur, valg.niva, rnd), dybde: 1, noder: 0 }), 0);
        return () => clearTimeout(id);
      }
      const ctx = lagKontekst(valg);
      const resultat = { trekk: -1, verdi: 0, dybde: 0 };
      const gen = rot(b, p.tur, valg, ctx, resultat);
      return kjor(gen, valg, () => {
        resultat.noder = ctx.noder;
        ferdig(resultat);
      });
    }
    // The same without slices (tests, self-play): to the end, to maksNoder or to tid ms.
    function velg(p, valg) {
      const b = Int8Array.from(p.b);
      const rnd = valg.tilfeldig || Math.random;
      if (valg.niva !== 4) return { trekk: enkel(b, p.tur, valg.niva, rnd), dybde: 1, noder: 0 };
      const ctx = lagKontekst(valg);
      const resultat = { trekk: -1, verdi: 0, dybde: 0 };
      const gen = rot(b, p.tur, valg, ctx, resultat);
      const slutt = performance.now() + (valg.tid || 1e9);
      let r, skiver = 0;
      do {
        r = gen.next();
        skiver++;
      } while (!r.done && performance.now() < slutt);
      resultat.noder = ctx.noder;
      resultat.skiver = skiver;
      return resultat;
    }

    return { evaluer, tenk, velg, kjor, NIVA, VEKT };
  })();

  const R = window.Rusj;
  if (!R) {
    window.Reversi = { Rev, Motor };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { SVART, HVIT } = Rev;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const KLASSE = ["svart", "hvit"]; // class names // sprak-ok
  const FARGENAVN = [R.t("svart"), R.t("hvit")]; // the same, read aloud
  const STOR = [R.t("Svart"), R.t("Hvit")];
  const NIVANAVN = { 1: R.t("Nybegynner"), 2: R.t("Lett"), 3: R.t("Middels"), 4: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen legger på måfå. Fint for å lære reglene."),
    2: R.t("Mobilen snur så mange den kan – og glemmer hjørnene. Fin første motstander."),
    3: R.t("Mobilen vet hvilke ruter som er gode, og ser ett svar fram. Passe utfordring."),
    4: R.t("Mobilen tenker mange trekk fram og jakter på hjørnene. Klarer du å slå den?"),
  };
  const NIVAER = [1, 2, 3, 4];
  const MAL = [1, 3, 0];
  const MALNAVN = { 1: R.t("Ett parti"), 3: R.t("Først til {n}", { n: 3 }), 0: R.t("Uten slutt") };
  const MIN_TENK = 650;
  let H;

  // S.spill: { id, modus "mobil" | "to", niva, mal, starter (player with black this round),
  //   trekk (square names), poeng [p0, p1], uavgjort, runde, resultat { vinner (player | null),
  //   antall [black, white] } | null, ferdig (match over), registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, i) => sp.modus === "mobil" && i === 1;
  const navn = (sp, i) => (sp.modus === "mobil" ? (i === 1 ? R.t("Mobilen") : R.t("Du")) : R.navn(i));
  const spillerFor = (sp, farge) => (farge === SVART ? sp.starter : 1 - sp.starter);
  const fargeFor = (sp, i) => (i === sp.starter ? SVART : HVIT);

  let parti = null;
  let partiFor = "";
  const partiNokkel = (sp) => `${sp.id}:${sp.runde}:${sp.trekk.length}:${sp.trekk[sp.trekk.length - 1] || ""}`;
  function hentParti(S) {
    const sp = S.spill;
    const n = partiNokkel(sp);
    if (parti && partiFor === n) return parti;
    parti = Rev.spillUt(sp.trekk);
    partiFor = n;
    return parti;
  }
  const merkParti = (S) => (partiFor = partiNokkel(S.spill));
  const tur = (S) => spillerFor(S.spill, hentParti(S).tur);
  const rundeFerdig = (S) => !!S.spill.resultat;
  const kampVunnet = (sp) => !!sp.mal && Math.max(sp.poeng[0], sp.poeng[1]) >= sp.mal;

  let animer = null; // { s, f } the disc just laid and the discs it flipped
  let tenkStopp = null;
  let tenkerPa = "";
  let trekkId = null;
  let hint = -1;
  let hintStopp = null;
  let kaaringId = null;

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.stoy(0, 0.04, 0.2, 1400);
      R.lyd.tone(240, 0, 0.08, "sine", 0.16, 150);
    },
    snu: (n) => {
      for (let i = 0; i < Math.min(n, 6); i++) R.lyd.tone(520 + i * 60, 0.08 + i * 0.06, 0.05, "triangle", 0.07);
    },
    tap: () => {
      R.lyd.tone(392, 0, 0.22, "triangle", 0.13);
      R.lyd.tone(311, 0.2, 0.42, "triangle", 0.12);
    },
  };

  const telling = (n) => R.t("svart {a}, hvit {b}", { a: n[0], b: n[1] });

  // ---------- Playing ----------
  const kanLegge = (S) => {
    const sp = S.spill;
    return !!sp && !sp.ferdig && !sp.resultat && !erMaskin(sp, tur(S));
  };

  function leggBrikke(S, s) {
    const sp = S.spill;
    const p = hentParti(S);
    const hvem = spillerFor(sp, p.tur);
    stoppHint();
    const h = Rev.spill(p, s);
    if (!h) return;
    sp.trekk.push(Rev.navn(s));
    merkParti(S);
    animer = R.rolig() ? null : { s, f: h.f };
    lyd.legg();
    lyd.snu(h.f.length);
    R.vibrer(10);
    const st = Rev.status(p);
    const la = { rute: Rev.navn(s), n: h.f.length };
    let linje =
      (sp.modus === "mobil" ? (hvem === 0 ? R.t("Du la på {rute} og snudde {n}.", la) : R.t("Mobilen la på {rute} og snudde {n}.", la)) : R.t("{navn} la på {rute} og snudde {n}.", { ...la, navn: navn(sp, hvem) })) +
      " " +
      R.t("Svart {a}, hvit {b}.", { a: st.antall[0], b: st.antall[1] });
    if (st.slutt) {
      avsluttRunde(S, st);
      linje += " " + resultatLinje(S);
    } else {
      const neste = spillerFor(sp, p.tur);
      if (h.pass) {
        const andre = navn(sp, 1 - neste);
        const tekst = sp.modus === "mobil" ? (neste === 0 ? R.t("Mobilen kan ikke legge noen brikke – din tur igjen") : R.t("Du kan ikke legge noen brikke – mobilen legger igjen")) : R.t("{andre} kan ikke legge noen brikke – {navn} legger igjen", { andre, navn: navn(sp, neste) });
        R.toast(tekst);
        linje += ` ${tekst}.`;
      } else if (!erMaskin(sp, neste)) linje += " " + (sp.modus === "mobil" ? R.t("Din tur.") : R.t("{navn} sin tur.", { navn: navn(sp, neste) }));
    }
    R.si(linje);
    R.vis();
    if (!st.slutt) startTenking(S);
  }

  function resultatLinje(S) {
    const sp = S.spill;
    const r = sp.resultat;
    if (!r) return "";
    const tall = `${r.antall[0]}–${r.antall[1]}`;
    if (r.vinner == null) return R.t("Uavgjort, {tall}!", { tall });
    return sp.modus === "mobil" ? (r.vinner === 0 ? R.t("Du vinner {tall}!", { tall }) : R.t("Mobilen vinner {tall}!", { tall })) : R.t("{navn} vinner {tall}!", { navn: navn(sp, r.vinner), tall });
  }

  function avsluttRunde(S, st) {
    const sp = S.spill;
    stoppTenking();
    const vinner = st.vinner == null ? null : spillerFor(sp, st.vinner);
    sp.resultat = { vinner, antall: st.antall };
    if (vinner == null) sp.uavgjort++;
    else sp.poeng[vinner]++;
    telRekord(S, vinner);
    if (sp.modus === "mobil" && vinner === 0) R.merke("klassiker-reversi");
    const fortsatt = R.vakt();
    const runde = sp.runde;
    setTimeout(() => {
      if (!fortsatt() || !R.S.spill || R.S.spill.runde !== runde || !R.S.spill.resultat) return;
      feir(R.S);
    }, R.rolig() ? 100 : 700);
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
    stoppHint();
    if (!sp.resultat) sp.trekk = [];
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
    if ((tenkStopp || trekkId) && tenkerPa === nokkel) return;
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    const start = performance.now();
    const gjelder = () => fortsatt() && R.S.spill && !R.S.spill.resultat && partiNokkel(R.S.spill) === nokkel;
    const p = hentParti(S);
    tenkStopp = Motor.tenk(p, Object.assign({}, Motor.NIVA[sp.niva]), (svar) => {
      tenkStopp = null;
      if (!gjelder()) return;
      // Never faster than MIN_TENK (a little longer when discs are still turning), never behind a sheet.
      const spillNaa = () => {
        trekkId = null;
        if (!gjelder()) return;
        if (R.arkApent()) {
          trekkId = setTimeout(spillNaa, 300);
          return;
        }
        tenkerPa = "";
        const q = hentParti(R.S);
        leggBrikke(R.S, q.lovlige.includes(svar.trekk) ? svar.trekk : q.lovlige[0]);
      };
      trekkId = setTimeout(spillNaa, Math.max(0, MIN_TENK + (R.rolig() ? 0 : 250) - (performance.now() - start)));
    });
  }
  function stoppTenking() {
    if (tenkStopp) tenkStopp();
    tenkStopp = null;
    clearTimeout(trekkId);
    trekkId = null;
    tenkerPa = "";
  }
  function stoppHint() {
    if (hintStopp) hintStopp();
    hintStopp = null;
    hint = -1;
  }
  const hjelpVises = (S) => {
    const sp = S.spill;
    return sp.modus === "mobil" && sp.niva <= 2 && !sp.resultat && !sp.ferdig && !erMaskin(sp, tur(S));
  };

  // «Angre»: two players one move; against the phone back to before your own last move.
  function angreAntall(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const n = p.hist.length;
    if (!n) return 0;
    if (sp.modus !== "mobil") return 1;
    const meg = fargeFor(sp, 0);
    for (let i = n - 1; i >= 0; i--) if (p.hist[i].side === meg) return n - i;
    return 0;
  }

  // ---------- Markup ----------
  const skiveHtml = (farge, klasse, stil) => `<span class="rv-skive ${KLASSE[farge]}${klasse ? " " + klasse : ""}"${stil ? ` style="${stil}"` : ""} aria-hidden="true"></span>`;

  function brettHtml(S, o) {
    const sp = S.spill;
    const p = hentParti(S);
    const menneske = o.interaktiv && kanLegge(S);
    const prikker = menneske && sp.prikker;
    const mulige = new Map();
    if (menneske) for (const s of p.lovlige) mulige.set(s, Rev.snur(p.b, s, p.tur).length);
    const sist = p.trekk.length ? p.trekk[p.trekk.length - 1] : -1;
    const snudd = new Map();
    if (o.interaktiv && animer && animer.s === sist) {
      const [r0, c0] = [sist >> 3, sist & 7];
      for (const x of animer.f) snudd.set(x, Math.max(Math.abs((x >> 3) - r0), Math.abs((x & 7) - c0)));
    }
    let fokus = hint >= 0 ? hint : sist >= 0 ? sist : p.lovlige[0];
    const ruter = [];
    for (let s = 0; s < 64; s++) {
      const c = p.b[s];
      const kl = ["rv-rute"];
      if (prikker && mulige.has(s)) kl.push("mulig");
      if (s === sist) kl.push("sist");
      if (o.interaktiv && s === hint) kl.push("hint");
      let etikett = `${Rev.navn(s)}, ${c ? (c === 1 ? R.t("svart brikke") : R.t("hvit brikke")) : R.t("tom")}`;
      if (prikker && mulige.has(s)) etikett += ", " + R.t("mulig trekk, snur {n}", { n: mulige.get(s) });
      if (s === sist) etikett += ", " + R.t("sist lagt");
      if (o.interaktiv && s === hint) etikett += ", " + R.t("tips: legg her");
      const koord = (s >> 3 === 7 ? `<span class="rv-koord fil" aria-hidden="true">${"abcdefgh"[s & 7]}</span>` : "") + ((s & 7) === 0 ? `<span class="rv-koord rad" aria-hidden="true">${(s >> 3) + 1}</span>` : "");
      let innhold = koord;
      if (c) {
        const k = [];
        if (o.interaktiv && animer && s === animer.s) k.push("ny");
        if (snudd.has(s)) k.push("snu");
        innhold += skiveHtml(c - 1, k.join(" "), snudd.has(s) ? `--i:${snudd.get(s)}` : "");
      }
      ruter.push(
        o.interaktiv
          ? `<button class="${kl.join(" ")}" data-h="rute" data-v="${Rev.navn(s)}" data-stille tabindex="${s === fokus ? 0 : -1}" aria-label="${esc(etikett)}">${innhold}</button>`
          : `<span class="${kl.join(" ")}">${innhold}</span>`,
      );
    }
    if (o.interaktiv) animer = null;
    const stempel = o.stempel ? `<span class="rv-stempel" aria-hidden="true"><span class="stempel ${o.stempel.klasse}">${esc(o.stempel.tekst)}</span></span>` : "";
    return `<div class="rv-brett${o.liten ? " liten" : ""}"${o.interaktiv ? ` role="group" aria-label="${esc(R.t("Brettet"))}"` : ' aria-hidden="true"'}>${ruter.join("")}${stempel}</div>`;
  }

  const tallTekst = (sp) => [sp.mal ? esc(sp.mal === 1 ? R.t("ett parti") : R.t("først til {n}", { n: sp.mal })) : "", sp.uavgjort ? esc(R.flertall(sp.uavgjort, "uavgjort", "uavgjort")) : ""].filter(Boolean).join("<br>");

  function poengHtml(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const n = Rev.antall(p.b);
    const naa = rundeFerdig(S) ? -1 : tur(S);
    const kort = (i) => {
      const f = fargeFor(sp, i);
      return `<div class="rv-spiller${naa === i ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === i ? " vant" : ""}">
        <span class="rv-merke" aria-hidden="true">${erMaskin(sp, i) ? `<span class="rv-maskin">${R.figur()}</span>` : R.avatar(i)}</span>
        <b class="rv-navn">${esc(navn(sp, i))}</b>
        <span class="rv-antall" aria-hidden="true">${skiveHtml(f, "liten")}<b>${n[f]}</b></span>
      </div>`;
    };
    return `<div class="rv-stilling" role="group" aria-label="${esc(R.t("Stillingen: {a} {pa}, {b} {pb}.", { a: navn(sp, 0), pa: sp.poeng[0], b: navn(sp, 1), pb: sp.poeng[1] }) + " " + (sp.modus === "mobil" ? R.t("Du har {fa}, Mobilen {fb}.", { fa: FARGENAVN[fargeFor(sp, 0)], fb: FARGENAVN[fargeFor(sp, 1)] }) : R.t("{a} har {fa}, {b} {fb}.", { a: navn(sp, 0), fa: FARGENAVN[fargeFor(sp, 0)], b: navn(sp, 1), fb: FARGENAVN[fargeFor(sp, 1)] })) + " " + R.t("Brikker: {telling}.", { telling: telling(n) }))}">
      ${kort(0)}
      <div class="rv-tall" aria-hidden="true"><b>${sp.poeng[0]}</b><span>–</span><b>${sp.poeng[1]}</b>${tallTekst(sp) ? `<small>${tallTekst(sp)}</small>` : ""}</div>
      ${kort(1)}
    </div>`;
  }

  function meldingHtml(S) {
    const sp = S.spill;
    if (sp.resultat) {
      const v = sp.resultat.vinner;
      let tekst = resultatLinje(S);
      if (v != null && kampVunnet(sp) && sp.mal > 1) tekst = sp.modus === "mobil" ? (v === 0 ? R.t("Du vinner kampen – først til {n}!", { n: sp.mal }) : R.t("Mobilen vinner kampen!")) : R.t("{navn} vinner kampen!", { navn: navn(sp, v) });
      return `<p class="rv-melding ${v == null ? "remis" : "vinner"}"><span>${esc(tekst)}</span></p>`;
    }
    const i = tur(S);
    const f = fargeFor(sp, i);
    const forste = sp.trekk.length === 0;
    let tekst;
    if (erMaskin(sp, i)) tekst = `<span class="rv-tenker">${esc(forste ? R.t("Mobilen begynner") : R.t("Mobilen tenker"))}<i>.</i><i>.</i><i>.</i></span>`;
    else if (sp.modus === "mobil") tekst = esc(forste ? (sp.prikker ? R.t("Du begynner! Legg på en prikk.") : R.t("Du begynner!")) : R.t("Din tur"));
    else tekst = esc(forste ? R.t("{navn} begynner!", { navn: navn(sp, i) }) : R.t("{navn} sin tur", { navn: navn(sp, i) }));
    return `<p class="rv-melding">${skiveHtml(f, "liten")}<span>${tekst}</span></p>`;
  }

  // ---------- Board size ----------
  // Same query as the two-column layout in spill.css (wide screens and phones on their side).
  const TO_KOLONNER = "(min-width: 900px) and (min-aspect-ratio: 5/4), (orientation: landscape) and (max-height: 600px) and (min-width: 560px)";
  function tilpass() {
    const brett = R.$(".skjerm-spill .rv-brett");
    if (!brett) return;
    const ramme = brett.parentElement;
    const toKolonner = window.matchMedia && window.matchMedia(TO_KOLONNER).matches;
    let b;
    if (toKolonner) {
      // The board's column is as wide as the board: size it from the height and what the tools leave.
      const skjerm = ramme.parentElement;
      const topp = skjerm.getBoundingClientRect().top + window.scrollY;
      b = Math.min(window.innerHeight - topp - 16, skjerm.clientWidth - 254, 640);
    } else b = Math.min(ramme.clientWidth, 640);
    b = Math.floor(b / 8) * 8;
    brett.style.width = b + "px";
    for (let n = 0; n < 3; n++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || b <= 224) break;
      b = Math.max(224, Math.floor((b - over) / 8) * 8);
      brett.style.width = b + "px";
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && tilpass());
  });

  // Keyboard: arrows move between the squares.
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("rv-rute") || !el.dataset.v) return;
    const steg = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!steg) return;
    e.preventDefault();
    const s = Rev.rute(el.dataset.v);
    const r = (s >> 3) + steg[0], c = (s & 7) + steg[1];
    if (r < 0 || r > 7 || c < 0 || c > 7) return;
    const ny = R.$(`.rv-rute[data-v="${Rev.navn(r * 8 + c)}"]`);
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
    S.spill = { id: R.nyttFro() % 1e9, modus: o.modus, niva: o.niva, mal: o.mal, prikker: !!o.prikker, starter, trekk: [], poeng: [0, 0], uavgjort: 0, runde: 1, resultat: null, ferdig: false, registrert: false };
    nullstillVisning();
    R.statistikk("start", { modus: o.modus, niva: o.modus === "mobil" ? o.niva : 0, mal: o.mal, prikker: !!o.prikker });
  }
  function nyRunde(S) {
    const sp = S.spill;
    sp.runde++;
    sp.starter = 1 - sp.starter;
    sp.trekk = [];
    sp.resultat = null;
    nullstillVisning();
  }
  function nullstillVisning() {
    parti = null;
    animer = null;
    stoppTenking();
    stoppHint();
    clearTimeout(kaaringId);
  }
  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.uavgjort + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.uavgjort}</b> ${esc(R.t("uavgjort|uavgjort", { n: r.uavgjort }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }
  const IKON = '<span class="rv-knappeskive" aria-hidden="true"></span>';

  R.start({
    id: "reversi",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, mal: 3, starter: 0, prikker: true },
      spill: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, mal: 3, starter: 0, prikker: true }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!MAL.includes(o.mal)) o.mal = 3;
      o.starter = o.starter === 1 ? 1 : 0;
      o.prikker = o.prikker !== false;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const p = Array.isArray(sp.trekk) && Array.isArray(sp.poeng) && sp.poeng.length === 2 && [0, 1].includes(sp.starter) && ["mobil", "to"].includes(sp.modus) && NIVAER.includes(sp.niva) && MAL.includes(sp.mal) ? Rev.spillUt(sp.trekk) : null;
        if (!p) S.spill = null;
        else {
          sp.prikker = sp.prikker !== false;
          const st = Rev.status(p);
          if (st.slutt && !sp.resultat) {
            const v = st.vinner == null ? null : spillerFor(sp, st.vinner);
            sp.resultat = { vinner: v, antall: st.antall };
            if (v == null) sp.uavgjort++;
            else sp.poeng[v]++;
          }
          if (!st.slutt && !sp.ferdig) sp.resultat = null;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Klem motstanderens brikker inne mellom dine egne, så snus de til din farge. Den som har flest brikker når brettet er fullt, vinner."),
      steg: [
        [R.t("Legg en brikke"), R.t("Legg brikka di slik at en eller flere av motstanderens brikker står i en rett linje mellom den nye brikka og en av dine egne – bortover, oppover eller på skrå.")],
        [R.t("Snu dem"), R.t("Alle brikkene som blir klemt inne, snus til din farge. Et trekk må alltid snu minst én brikke. Prikkene viser hvor du kan legge.")],
        [R.t("Flest vinner"), R.t("Kan du ikke legge noen brikke, står du over. Når ingen av dere kan legge mer, telles brikkene – flest vinner.")],
      ],
      tips: [
        R.t("Hjørnene er gull: En brikke i hjørnet kan aldri snus igjen."),
        R.t("Pass deg for rutene på skrå inntil et ledig hjørne – de gir ofte motstanderen hjørnet."),
        R.t("Mange brikker tidlig er ikke alltid bra. Det er viktigere å ha mange steder å legge."),
        R.t("Svart begynner, og dere bytter på å begynne for hver runde. Først til 3: Den som først vinner tre partier, vinner kampen."),
        R.t("Mot mobilen på nybegynner og lett foreslår «Tips» et trekk. Trykket feil? «Angre» tar tilbake trekket."),
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
              slagordHtml: `${esc(R.t("Klem dem inne – og snu dem!"))}<br><em>${esc(R.t("Flest brikker vinner."))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? (sp.mal === 1 ? R.t("Fortsett partiet") : R.t("Fortsett · {stilling}", { stilling: `${sp.poeng[0]}–${sp.poeng[1]}` })) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–2", R.t("spillere")],
                ["4", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="rv-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="rv-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
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
                  { v: "mobil", ikon: "🤖", tittel: R.t("Mot mobilen"), tekst: R.t("Fire nivåer") },
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
              <p class="hjelp">${esc(mot ? R.t("Den som begynner, har de svarte brikkene. Du og mobilen bytter på å begynne for hver runde.") : R.t("Den som begynner, har de svarte brikkene. Dere bytter på å begynne for hver runde."))}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor lenge?"))}</h2>
              ${R.ui.seg("mal", MAL.map((m) => [m, MALNAVN[m]]), o.mal, { etikett: R.t("Hvor lenge") })}
              <p class="hjelp">${esc(o.mal === 1 ? R.t("Ett parti – den som vinner det, vinner.") : o.mal ? R.t("Den som først vinner {n} partier, vinner kampen.", { n: o.mal }) : R.t("Dere spiller så mange partier dere vil, og avslutter når dere vil."))}</p>
            </section>
            ${R.ui.bryter("prikker", o.prikker, R.t("Vis mulige trekk"), R.t("Prikker viser hvor du kan legge. Skru av for en større utfordring."))}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.mal === 1 ? (S.spill.modus === "mobil" ? R.t("Mot mobilen") : R.t("To spillere")) : R.t("Runde {n}", { n: S.spill.runde })),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = rundeFerdig(S);
          const kanAngre = angreAntall(S) > 0 && !sp.ferdig;
          const medHint = sp.modus === "mobil" && sp.niva <= 2;
          const st = ferdig ? stempelFor(sp) : null;
          const verktoy = [
            `<button class="lenke" data-h="angre"${kanAngre ? "" : " disabled"}>↶ ${esc(R.t("Angre"))}</button>`,
            !ferdig && medHint ? `<button class="lenke" data-h="hint"${hjelpVises(S) && !hintStopp ? "" : " disabled"}>${esc(R.t("💡 Tips"))}</button>` : "",
            R.ui.lenke(R.t("Avslutt"), "avslutt"),
          ];
          return `
            <h1 class="vh" id="skjerm-tittel">${esc((sp.mal === 1 ? "Reversi" : R.t("Reversi, runde {n}", { n: sp.runde })) + ": " + (ferdig ? R.t("partiet er ferdig") : erMaskin(sp, tur(S)) ? R.t("mobilen sin tur") : sp.modus === "mobil" ? R.t("din tur") : R.t("{navn} sin tur", { navn: navn(sp, tur(S)) })))}</h1>
            ${poengHtml(S)}
            ${meldingHtml(S)}
            <span class="rv-luft" aria-hidden="true"></span>
            <div class="rv-brettramme">${brettHtml(S, { interaktiv: true, stempel: st })}</div>
            <span class="rv-luft under" aria-hidden="true"></span>
            ${R.ui.dokk(ferdig ? (kampVunnet(sp) ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Ny runde"), "runde", { ikon: IKON })) : "", R.ui.lenkerad(...verktoy.filter(Boolean)))}`;
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
          stoppHint();
          clearTimeout(kaaringId);
          animer = null;
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
          const figur = vinner != null && !(sp.modus === "mobil" && vinner === 1) ? `<span class="rv-vinner">${R.avatar(vinner, "gigant")}<span class="rv-kroneemoji" aria-hidden="true">👑</span></span>` : R.figur();
          const tekst = sp.modus === "mobil" && vinner === 1 ? (sp.niva > 1 ? R.t("Godt kjempa! Prøv igjen – eller velg et lettere nivå.") : R.t("Godt kjempa! Prøv igjen.")) : vinner == null && runder > 0 ? R.t("Like mange seirer hver. Det får avgjøres neste gang!") : "";
          let rekord = "";
          if (sp.modus === "mobil") {
            const rek = rekordHtml(S, sp.niva);
            rekord = rek ? `<p class="rv-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : "";
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
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 4);
        R.vis();
      },
      starter(el, e, S) {
        S.oppsett.starter = el.dataset.v === "1" ? 1 : 0;
        R.vis();
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = MAL.includes(m) ? m : 3;
        R.vis();
      },
      prikker(el, e, S) {
        S.oppsett.prikker = !S.oppsett.prikker;
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
        if (!S.spill || !rundeFerdig(S)) return;
        if (kampVunnet(S.spill)) return avsluttKamp(S);
        nyRunde(S);
        R.lyd.snu();
        R.vis();
        startTenking(S);
      },
      rute(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        if (!kanLegge(S)) {
          R.toast(R.t("Vent litt – mobilen tenker"));
          return;
        }
        const s = Rev.rute(el.dataset.v);
        const p = hentParti(S);
        if (!p.lovlige.includes(s)) {
          R.lyd.feil();
          R.vibrer(30);
          R.toast(p.b[s] ? R.t("Her ligger det allerede en brikke") : R.t("Her snur du ingen brikker – prøv en annen rute"));
          el.classList.remove("risting");
          void el.offsetWidth;
          el.classList.add("risting");
          return;
        }
        leggBrikke(S, s);
      },
      hint(el, e, S) {
        const sp = S.spill;
        if (!sp || hintStopp || !hjelpVises(S)) return;
        const fortsatt = R.vakt();
        const nokkel = partiNokkel(sp);
        hintStopp = Motor.tenk(hentParti(S), Object.assign({}, Motor.NIVA[4], { tid: 500 }), (svar) => {
          hintStopp = null;
          if (!fortsatt() || !R.S.spill || partiNokkel(R.S.spill) !== nokkel || svar.trekk < 0) return R.vis();
          hint = svar.trekk;
          R.lyd.pling();
          R.vis();
          R.toast(R.t("Tips: legg på {rute}", { rute: Rev.navn(svar.trekk) }));
        });
        R.vis();
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const n = angreAntall(S);
        if (n <= 0) return;
        stoppTenking();
        stoppHint();
        clearTimeout(kaaringId);
        if (sp.resultat) {
          if (sp.resultat.vinner != null) sp.poeng[sp.resultat.vinner] = Math.max(0, sp.poeng[sp.resultat.vinner] - 1);
          else sp.uavgjort = Math.max(0, sp.uavgjort - 1);
          angreRekord(S, sp.resultat.vinner);
          sp.resultat = null;
        }
        const p = hentParti(S);
        for (let i = 0; i < n; i++) {
          Rev.tilbake(p);
          sp.trekk.pop();
        }
        merkParti(S);
        animer = null;
        R.lyd.snu();
        R.toast(n >= 2 ? R.t("Angret – din tur igjen") : R.t("Angret"));
        R.vis();
        startTenking(S);
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

  function stempelFor(sp) {
    const r = sp.resultat || {};
    const tall = `${r.antall[0]}–${r.antall[1]}`;
    if (r.vinner == null) return { tekst: R.t("Uavgjort {tall}", { tall }), klasse: "lampe" };
    return { tekst: fargeFor(sp, r.vinner) === SVART ? R.t("Svart vant {tall}", { tall }) : R.t("Hvit vant {tall}", { tall }), klasse: "aksent" };
  }
})();
