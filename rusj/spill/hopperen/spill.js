/* Hopperen — Chinese checkers («kinasjakk») on a six-pointed star of 121 holes, for 2, 3, 4 or 6
   seats. Every seat has ten pegs in its own point of the star and must move them all into the
   point straight across. A move is a step to a free neighbouring hole, or one or more jumps over
   a single peg (anyone's) into the free hole behind it. A peg that has reached the goal stays in
   it. The first to fill the goal wins. People share the phone; empty seats are played by the phone
   (three levels). The rules (Stjerne) and the engine (Motor) are pure functions at the top;
   test/hopperen.test.mjs loads the file without the kit. */
(function () {
  "use strict";

  // ---------- The rules ----------
  // Holes in axial coordinates (q, r), cube x = q, z = r, y = −q − r. The star is the union of two
  // big triangles: every coordinate ≥ −4, or every coordinate ≤ 4. The six points of the star
  // (10 holes each), clockwise from the bottom: 0 bottom (z ≥ 5), 1 lower left (x ≤ −5), 2 upper
  // left (y ≥ 5), 3 top (z ≤ −5), 4 upper right (x ≥ 5), 5 lower right (y ≤ −5). The goal of
  // point k is point (k + 3) % 6. Holes are numbered row by row from the top.

  const Stjerne = (() => {
    const HULL = [];
    for (let r = -8; r <= 8; r++)
      for (let q = -8; q <= 8; q++) {
        const x = q, z = r, y = -q - r;
        if ((x >= -4 && y >= -4 && z >= -4) || (x <= 4 && y <= 4 && z <= 4)) HULL.push([q, r]);
      }
    const N = HULL.length; // 121
    const INDEKS = new Map(HULL.map(([q, r], i) => [q + "," + r, i]));
    const finn = (q, r) => (INDEKS.has(q + "," + r) ? INDEKS.get(q + "," + r) : -1);
    const RETNINGER = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    const NABO = HULL.map(([q, r]) => RETNINGER.map(([dq, dr]) => finn(q + dq, r + dr)));
    const HOPP = HULL.map(([q, r]) => RETNINGER.map(([dq, dr]) => finn(q + 2 * dq, r + 2 * dr)));
    const spiss = [[-4, 8], [-8, 4], [-4, -4], [4, -8], [8, -4], [4, 4]]; // the tip of each point (q, r)
    function iSpiss(k, q, r) {
      const x = q, z = r, y = -q - r;
      return [z >= 5, x <= -5, y >= 5, z <= -5, x >= 5, y <= -5][k];
    }
    const SPISS = [0, 1, 2, 3, 4, 5].map((k) => HULL.map(([q, r], i) => (iSpiss(k, q, r) ? i : -1)).filter((i) => i >= 0));
    const SPISS_AV = HULL.map(([q, r]) => [0, 1, 2, 3, 4, 5].find((k) => iSpiss(k, q, r)) ?? -1);
    const mal = (k) => (k + 3) % 6;
    const avstand = (a, [q2, r2]) => {
      const [q1, r1] = HULL[a];
      const dq = q1 - q2, dr = r1 - r2;
      return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    };
    // Steps to the tip of each point, per hole: the engine's measure of how far a peg has left.
    const TIL = [0, 1, 2, 3, 4, 5].map((k) => HULL.map((_, i) => avstand(i, spiss[k])));
    const SETER = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
    const MAKS_RUNDER = 150; // a safety net: after this many rounds the one who has come furthest wins

    // A game: seats (points of the star, in turn order), the board (seat index per hole or −1),
    // whose turn (index into seats).
    function nyttParti(antall, forste = 0) {
      const seter = SETER[antall];
      if (!seter) return null;
      const b = new Int8Array(N).fill(-1);
      seter.forEach((k, s) => SPISS[k].forEach((i) => (b[i] = s)));
      return { antall, seter, b, tur: forste % antall, hist: [], vinner: null, slutt: false, grunn: "" };
    }
    // Where can the peg in hole a go? Map target → previous hole on the way (for the path).
    function maal(p, a) {
      const ut = new Map();
      const s = p.b[a];
      if (s < 0) return ut;
      const malSpiss = mal(p.seter[s]);
      const iMal = SPISS_AV[a] === malSpiss;
      for (let d = 0; d < 6; d++) {
        const n = NABO[a][d];
        if (n >= 0 && p.b[n] < 0) ut.set(n, a);
      }
      // jumps, as far as they go (the hole it left counts as free)
      const ko = [a];
      const sett = new Set([a]);
      while (ko.length) {
        const h = ko.shift();
        for (let d = 0; d < 6; d++) {
          const over = NABO[h][d], til = HOPP[h][d];
          if (over < 0 || til < 0 || sett.has(til)) continue;
          if (p.b[over] < 0 || over === a) continue;
          if (p.b[til] >= 0 && til !== a) continue;
          sett.add(til);
          if (til !== a && !ut.has(til)) ut.set(til, h);
          ko.push(til);
        }
      }
      if (iMal) for (const t of [...ut.keys()]) if (SPISS_AV[t] !== malSpiss) ut.delete(t);
      return ut;
    }
    // The way from a to t (a list of holes), from the map maal gave.
    function vei(fra, kart, t) {
      const ut = [t];
      for (let h = t; h !== fra; ) {
        h = kart.get(h);
        if (h == null || ut.length > 60) break;
        ut.unshift(h);
      }
      return ut;
    }
    // Every legal move of the side on turn: [from, to].
    function lovlige(p) {
      if (p.slutt) return [];
      const ut = [];
      for (let i = 0; i < N; i++) if (p.b[i] === p.tur) for (const t of maal(p, i).keys()) ut.push([i, t]);
      return ut;
    }
    const iMalet = (p, s) => {
      const m = mal(p.seter[s]);
      let n = 0;
      for (const i of SPISS[m]) if (p.b[i] === s) n++;
      return n;
    };
    // The sum of steps from the side's pegs to its goal's tip (20 when the goal is full).
    function rest(p, s) {
      const t = TIL[mal(p.seter[s])];
      let sum = 0;
      for (let i = 0; i < N; i++) if (p.b[i] === s) sum += t[i];
      return sum;
    }
    // Places when the game ends: the winner first, then most pegs in the goal, then the shortest way.
    function rangering(p) {
      const s = [...Array(p.antall).keys()];
      return s.sort((a, b) => (b === p.vinner) - (a === p.vinner) || iMalet(p, b) - iMalet(p, a) || rest(p, a) - rest(p, b) || a - b);
    }
    function spill(p, fra, til) {
      if (p.slutt || p.b[fra] !== p.tur) return null;
      const kart = maal(p, fra);
      if (!kart.has(til)) return null;
      const s = p.tur;
      const veien = vei(fra, kart, til);
      p.b[fra] = -1;
      p.b[til] = s;
      const h = { fra, til, s, vei: veien };
      p.hist.push(h);
      p.tur = (s + 1) % p.antall;
      if (iMalet(p, s) === 10) Object.assign(p, { slutt: true, vinner: s, grunn: "mal" });
      else if (p.hist.length >= MAKS_RUNDER * p.antall) {
        p.slutt = true;
        p.grunn = "runder";
        p.vinner = rangering(p)[0];
      }
      return h;
    }
    function tilbake(p) {
      const h = p.hist.pop();
      if (!h) return null;
      p.b[h.til] = -1;
      p.b[h.fra] = h.s;
      p.tur = h.s;
      Object.assign(p, { slutt: false, vinner: null, grunn: "" });
      return h;
    }
    function spillUt(antall, forste, liste) {
      const p = nyttParti(antall, forste);
      if (!p || !Array.isArray(liste)) return null;
      for (const m of liste) if (!Array.isArray(m) || !spill(p, m[0], m[1])) return null;
      return p;
    }

    return { HULL, N, NABO, HOPP, SPISS, SPISS_AV, TIL, SETER, MAKS_RUNDER, finn, mal, nyttParti, maal, vei, lovlige, iMalet, rest, rangering, spill, tilbake, spillUt };
  })();

  // ---------- The engine ----------
  // Every level measures a move by how much nearer it brings the peg to the goal's tip. Lett: often
  // a good move, often any forward one. Middels: the best single move, the last pegs first.
  // Vanskelig: also looks at its own next move from there (long jump chains), keeps no stragglers
  // and leaves its home point early, so the others are not blocked.

  const Motor = (() => {
    const { TIL, SPISS_AV, mal, lovlige, spill, tilbake, maal } = Stjerne;

    function poeng(p, s, fra, til, niva) {
      const t = TIL[mal(p.seter[s])];
      let v = t[fra] - t[til];
      if (niva >= 2) {
        // the furthest-behind pegs first (no stragglers), and out of the home point early
        let bak = 0;
        for (let i = 0; i < Stjerne.N; i++) if (p.b[i] === s && t[i] > bak) bak = t[i];
        if (t[fra] >= bak - 1) v += 0.35;
        if (SPISS_AV[fra] === p.seter[s]) v += 0.25;
        // inside the goal: deeper is better, but a peg that is in shouldn't wander
        if (SPISS_AV[til] === mal(p.seter[s]) && SPISS_AV[fra] !== mal(p.seter[s])) v += 0.5;
      }
      return v;
    }

    // The phone's move [from, to]. o: { niva, tilfeldig }.
    function velg(p, o) {
      const r = o.tilfeldig || Math.random;
      const niva = [1, 2, 3].includes(o.niva) ? o.niva : 2;
      const s = p.tur;
      const liste = lovlige(p);
      if (!liste.length) return null;
      const sist = (() => {
        for (let i = p.hist.length - 1; i >= 0; i--) if (p.hist[i].s === s) return p.hist[i];
        return null;
      })();
      const vurdert = liste.map(([fra, til]) => {
        let v = poeng(p, s, fra, til, niva);
        // never straight back where it came from
        if (sist && sist.til === fra && sist.fra === til) v -= 3;
        if (niva === 3) {
          // and the best own move after it (the others may change the board, but jump ladders often stay)
          spill(p, fra, til);
          p.tur = s;
          let neste = 0;
          for (let i = 0; i < Stjerne.N; i++) {
            if (p.b[i] !== s) continue;
            for (const t of maal(p, i).keys()) neste = Math.max(neste, TIL[mal(p.seter[s])][i] - TIL[mal(p.seter[s])][t]);
          }
          const vant = p.slutt;
          tilbake(p);
          v += 0.55 * neste + (vant ? 100 : 0);
        }
        return { fra, til, v: v + r() * (niva === 1 ? 2.5 : 0.01) };
      });
      vurdert.sort((a, b) => b.v - a.v);
      if (niva === 1 && r() < 0.3) {
        const fram = vurdert.filter((x) => TIL[mal(p.seter[s])][x.fra] >= TIL[mal(p.seter[s])][x.til]);
        const x = (fram.length ? fram : vurdert)[Math.floor(r() * (fram.length || vurdert.length))];
        return [x.fra, x.til];
      }
      return [vurdert[0].fra, vurdert[0].til];
    }

    return { velg };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules and the engine.
    window.Hopperen = { Stjerne, Motor };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const FARGE = ["hp-rosa", "hp-gul", "hp-bla", "hp-gronn", "hp-lilla", "hp-oransje"]; // class names per point // sprak-ok
  const FARGENAVN = [R.t("rosa"), R.t("gul"), R.t("blå"), R.t("grønn"), R.t("lilla"), R.t("oransje")];
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen flytter litt hulter til bulter. Fint for de minste."),
    2: R.t("Mobilen tar det lengste hoppet den ser."),
    3: R.t("Mobilen planlegger hoppstiger og lar ingen brikker bli igjen. Klarer du å slå den?"),
  };
  const NIVAER = [1, 2, 3];
  const PLASSER = [2, 3, 4, 6];
  const MIN_TENK = 520;
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "hopperen") + "/";
  const ROT3 = Math.sqrt(3) / 2;
  let H;

  // S.spill: { id, modus "mobil" | "flere", niva, plasser (2/3/4/6), folk (people; the first seats),
  //   forste (seat that starts), trekk [[from, to]], resultat { vinner (seat), grunn, plass [seats] }
  //   | null, ferdig, registrert }. Seat i is the i-th entry of Stjerne.SETER[plasser]: seat 0 is
  //   always the bottom point (player 1 / you).
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, s) => s >= sp.folk;
  const antallMaskiner = (sp) => sp.plasser - sp.folk;
  function navn(sp, s) {
    if (erMaskin(sp, s)) return antallMaskiner(sp) === 1 ? R.t("Mobilen") : R.t("Mobil {n}", { n: s - sp.folk + 1 });
    return sp.modus === "mobil" ? R.t("Du") : R.navn(s);
  }
  const fargeFor = (sp, s) => Stjerne.SETER[sp.plasser][s];

  let parti = null;
  let partiFor = "";
  const partiNokkel = (sp) => `${sp.id}:${sp.trekk.length}:${(sp.trekk[sp.trekk.length - 1] || []).join("-")}`;
  function hentParti(S) {
    const sp = S.spill;
    const k = partiNokkel(sp);
    if (parti && partiFor === k) return parti;
    parti = Stjerne.spillUt(sp.plasser, sp.forste, sp.trekk);
    partiFor = k;
    return parti;
  }
  const merkParti = (S) => (partiFor = partiNokkel(S.spill));
  const tur = (S) => hentParti(S).tur;

  let valgt = -1; // the peg picked up
  let animer = false; // the last move's path is drawn on the next render
  let tenkId = null;
  let tenkerPa = "";
  let kaaringId = null;

  // ---------- Sounds ----------
  const lyd = {
    hopp: (n) => {
      for (let k = 0; k < n; k++) R.lyd.tone(520 + k * 90, k * 0.09, 0.08, "triangle", 0.11);
    },
    steg: () => R.lyd.stoy(0, 0.05, 0.16, 1500),
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

  // ---------- Playing ----------
  const kanFlytte = (S) => {
    const sp = S.spill;
    return !!sp && !sp.ferdig && !sp.resultat && !erMaskin(sp, tur(S));
  };

  function flytt(S, fra, til) {
    const sp = S.spill;
    const p = hentParti(S);
    const s = p.tur;
    const h = Stjerne.spill(p, fra, til);
    if (!h) return;
    sp.trekk.push([fra, til]);
    merkParti(S);
    valgt = -1;
    animer = !R.rolig();
    const hopp = h.vei.length - 1;
    const erHopp = hopp > 1 || Stjerne.NABO[fra].indexOf(til) < 0;
    if (erHopp) lyd.hopp(hopp);
    else lyd.steg();
    R.vibrer(erHopp ? [8, 30, 8] : 8);
    const n = { navn: navn(sp, s), hopp };
    let linje = erHopp ? (sp.modus === "mobil" && s === 0 ? R.t("Du hoppet {hopp} gang.|Du hoppet {hopp} ganger.", { hopp, n: hopp }) : R.t("{navn} hoppet {hopp} gang.|{navn} hoppet {hopp} ganger.", { ...n, n: hopp })) : sp.modus === "mobil" && s === 0 ? R.t("Du flyttet ett steg.") : R.t("{navn} flyttet ett steg.", n);
    if (p.slutt) {
      avsluttRunde(S, p);
      linje += " " + resultatLinje(S);
    } else if (!erMaskin(sp, p.tur)) linje += " " + (sp.modus === "mobil" ? R.t("Din tur.") : R.t("{navn} sin tur.", { navn: navn(sp, p.tur) }));
    R.si(linje);
    R.vis();
    if (!p.slutt) startTenking(S);
  }

  function resultatLinje(S) {
    const sp = S.spill;
    const r = sp.resultat;
    if (!r) return "";
    if (r.grunn === "runder") return R.t("{n} runder er spilt – {navn} har kommet lengst!", { n: Stjerne.MAKS_RUNDER, navn: navn(sp, r.vinner) });
    return sp.modus === "mobil" && r.vinner === 0 ? R.t("Du vinner – alle brikkene i mål!") : R.t("{navn} vinner – alle brikkene i mål!", { navn: navn(sp, r.vinner) });
  }

  function avsluttRunde(S, p) {
    const sp = S.spill;
    stoppTenking();
    sp.resultat = { vinner: p.vinner, grunn: p.grunn, plass: Stjerne.rangering(p), iMal: [...Array(sp.plasser).keys()].map((s) => Stjerne.iMalet(p, s)) };
    if (sp.modus === "mobil") {
      const k = `${sp.plasser}-${sp.niva}`;
      const r = S.rekord[k] || (S.rekord[k] = { seier: 0, tap: 0 });
      if (p.vinner === 0) r.seier++;
      else r.tap++;
      if (p.vinner === 0) R.merke("klassiker-hopperen");
    }
    const fortsatt = R.vakt();
    const id = sp.id;
    setTimeout(() => fortsatt() && R.S.spill && R.S.spill.id === id && R.S.spill.resultat && feir(R.S), R.rolig() ? 100 : 700);
    tilKaaringOm(S, 3000);
  }
  function feir(S) {
    const sp = S.spill;
    if (erMaskin(sp, sp.resultat.vinner)) return lyd.tap();
    R.lyd.fanfare();
    R.vibrer([40, 60, 120]);
    R.konfetti();
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
    R.statistikk("ferdig", { modus: sp.modus, plasser: sp.plasser, folk: sp.folk, niva: antallMaskiner(sp) ? sp.niva : 0, trekk: sp.trekk.length, vinner: sp.resultat ? sp.resultat.vinner : -1 });
    R.gaTil("slutt");
  }

  // ---------- The phones' turns ----------
  function startTenking(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.resultat || S.skjerm !== "spill" || !erMaskin(sp, tur(S))) return;
    const nokkel = partiNokkel(sp);
    if (tenkId && tenkerPa === nokkel) return;
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    const gjelder = () => fortsatt() && R.S.spill && !R.S.spill.resultat && partiNokkel(R.S.spill) === nokkel;
    // A short pause (a little longer after a long jump, so it can be followed)
    const forrige = hentParti(S).hist;
    const vent = MIN_TENK + (forrige.length ? Math.min(forrige[forrige.length - 1].vei.length - 1, 6) * 90 : 0);
    const spillNaa = () => {
      tenkId = null;
      if (!gjelder()) return;
      if (R.arkApent()) {
        tenkId = setTimeout(spillNaa, 300);
        return;
      }
      tenkerPa = "";
      const m = Motor.velg(Stjerne.spillUt(sp.plasser, sp.forste, sp.trekk), { niva: sp.niva });
      if (m) flytt(R.S, m[0], m[1]);
    };
    tenkId = setTimeout(spillNaa, R.rolig() ? Math.min(vent, 400) : vent);
  }
  function stoppTenking() {
    clearTimeout(tenkId);
    tenkId = null;
    tenkerPa = "";
  }

  // «Angre»: back to before the last move of a person (and the phones' moves after it).
  function angreAntall(S) {
    const sp = S.spill;
    const p = hentParti(S);
    for (let i = p.hist.length - 1; i >= 0; i--) if (!erMaskin(sp, p.hist[i].s)) return p.hist.length - i;
    return 0;
  }

  // ---------- Markup ----------
  // Hole centres in board units: x = q + r/2 (−6…6), y = r·√3/2. The board is 13 × 14.86 units.
  const BREDDE = 13;
  const HOYDE = 16 * ROT3 + 1;
  const xy = (i) => {
    const [q, r] = Stjerne.HULL[i];
    return [((q + r / 2 + 6.5) / BREDDE) * 100, ((r * ROT3 + HOYDE / 2) / HOYDE) * 100];
  };
  const hullNavn = (i) => {
    const [q, r] = Stjerne.HULL[i];
    const rad = r + 9;
    const iRad = Stjerne.HULL.filter(([, r2]) => r2 === r);
    const nr = iRad.findIndex(([q2]) => q2 === q) + 1;
    return R.t("rad {rad}, hull {nr}", { rad, nr });
  };

  function brettHtml(S, o) {
    const sp = S.spill;
    const p = hentParti(S);
    const fri = o.interaktiv && kanFlytte(S);
    const meg = p.tur;
    const flyttbare = new Set();
    if (fri) for (let i = 0; i < Stjerne.N; i++) if (p.b[i] === meg && Stjerne.maal(p, i).size) flyttbare.add(i);
    if (valgt >= 0 && !flyttbare.has(valgt)) valgt = -1;
    const kart = fri && valgt >= 0 ? Stjerne.maal(p, valgt) : new Map();
    const sist = p.hist.length ? p.hist[p.hist.length - 1] : null;
    const hull = [];
    for (let i = 0; i < Stjerne.N; i++) {
      const [x, y] = xy(i);
      const s = p.b[i];
      const spiss = Stjerne.SPISS_AV[i];
      const kl = ["hp-hull"];
      if (spiss >= 0) kl.push("spiss-" + FARGE[spiss]);
      if (flyttbare.has(i)) kl.push("kan");
      if (i === valgt) kl.push("valgt");
      if (kart.has(i)) kl.push("mal");
      if (sist && i === sist.til) kl.push("sist");
      if (sist && i === sist.fra) kl.push("fra");
      let etikett = hullNavn(i) + ", " + (s >= 0 ? R.t("{farge} brikke", { farge: FARGENAVN[fargeFor(sp, s)] }) : R.t("tomt"));
      if (flyttbare.has(i)) etikett += ", " + R.t("kan flyttes");
      if (i === valgt) etikett += ", " + R.t("valgt");
      if (kart.has(i)) etikett += ", " + R.t("du kan flytte hit");
      const brikke = s >= 0 ? `<span class="hp-brikke ${FARGE[fargeFor(sp, s)]}${o.interaktiv && animer && sist && i === sist.til ? " ny" : ""}"></span>` : "";
      const stil = `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%`;
      hull.push(
        o.interaktiv
          ? `<button class="${kl.join(" ")}" style="${stil}" data-h="hull" data-v="${i}" data-stille tabindex="${i === (valgt >= 0 ? valgt : [...flyttbare][0] ?? 60) ? 0 : -1}" aria-label="${esc(etikett)}">${brikke}</button>`
          : `<span class="${kl.join(" ")}" style="${stil}">${brikke}</span>`,
      );
    }
    // The last move's way, as a dotted line
    let veiSvg = "";
    if (sist && sist.vei.length > 1) {
      const pkt = sist.vei.map((i) => xy(i).map((v, k) => (k ? (v * HOYDE) / 100 : (v * BREDDE) / 100).toFixed(2)).join(",")).join(" ");
      veiSvg = `<polyline class="hp-vei ${FARGE[fargeFor(sp, sist.s)]}${o.interaktiv && animer ? " ny" : ""}" points="${pkt}"/>`;
    }
    if (o.interaktiv) animer = false;
    // The star itself, drawn as two triangles
    const pt = (q, r) => `${(q + r / 2 + 6.5).toFixed(2)},${(r * ROT3 + HOYDE / 2).toFixed(2)}`;
    const t1 = [pt(-4.32, 8.64), pt(8.64, -4.32), pt(-4.32, -4.32)].join(" ");
    const t2 = [pt(4.32, -8.64), pt(-8.64, 4.32), pt(4.32, 4.32)].join(" ");
    const stempel = o.stempel ? `<span class="hp-stempel" aria-hidden="true"><span class="stempel ${o.stempel.klasse}">${esc(o.stempel.tekst)}</span></span>` : "";
    return `<div class="hp-brett${fri ? " fri" : ""}"${o.interaktiv ? ` role="group" aria-label="${esc(R.t("Stjernebrettet"))}" data-h="hull" data-stille` : ' aria-hidden="true"'}>
      <svg class="hp-stjerne" viewBox="0 0 ${BREDDE} ${HOYDE.toFixed(2)}" aria-hidden="true" focusable="false"><polygon points="${t1}"/><polygon points="${t2}"/>${veiSvg}</svg>
      ${hull.join("")}${stempel}
    </div>`;
  }

  function seterHtml(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const naa = sp.resultat ? -1 : p.tur;
    const rader = [];
    for (let k = 0; k < sp.plasser; k++) {
      const s = k; // seat order (= turn order); you are always first
      const f = FARGE[fargeFor(sp, s)];
      const figur = erMaskin(sp, s) ? `<span class="hp-maskin">${R.figur()}</span>` : R.avatar(s);
      rader.push(`<li class="hp-sete ${f}${naa === s ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === s ? " vant" : ""}">
        <span class="hp-setefigur" aria-hidden="true">${figur}<i class="hp-prikk ${f}"></i></span>
        <span class="hp-setenavn">${esc(navn(sp, s))}</span>
        <b class="hp-imal" aria-hidden="true">${Stjerne.iMalet(p, s)}<small>/10</small></b>
      </li>`);
    }
    const tekst = [...Array(sp.plasser).keys()].map((s) => R.t("{navn} ({farge}): {n} av 10 i mål", { navn: navn(sp, s), farge: FARGENAVN[fargeFor(sp, s)], n: Stjerne.iMalet(p, s) })).join(". ");
    return `<ul class="hp-seter n${sp.plasser}" aria-label="${esc(tekst)}">${rader.join("")}</ul>`;
  }

  function meldingHtml(S) {
    const sp = S.spill;
    if (sp.resultat) return `<p class="hp-melding vinner"><span>${esc(resultatLinje(S))}</span></p>`;
    const s = tur(S);
    const f = FARGE[fargeFor(sp, s)];
    let tekst;
    if (erMaskin(sp, s)) tekst = `<span class="hp-tenker">${esc(R.t("{navn} tenker", { navn: navn(sp, s) }))}<i>.</i><i>.</i><i>.</i></span>`;
    else if (valgt >= 0) tekst = esc(sp.modus === "mobil" ? R.t("Velg hvor den skal") : R.t("{navn}: velg hvor den skal", { navn: navn(sp, s) }));
    else tekst = esc(sp.modus === "mobil" ? R.t("Din tur – velg en brikke") : R.t("{navn}: velg en brikke", { navn: navn(sp, s) }));
    return `<p class="hp-melding ${f}"><i class="hp-prikk ${f}" aria-hidden="true"></i><span>${tekst}</span></p>`;
  }

  // ---------- Board size ----------
  const TO_KOLONNER = "(min-width: 900px) and (min-aspect-ratio: 5/4), (orientation: landscape) and (max-height: 600px) and (min-width: 560px)";
  function tilpass() {
    const brett = R.$(".skjerm-spill .hp-brett");
    if (!brett) return;
    const ramme = brett.parentElement;
    const toKolonner = window.matchMedia && window.matchMedia(TO_KOLONNER).matches;
    let b;
    if (toKolonner) {
      const skjerm = ramme.parentElement;
      const topp = skjerm.getBoundingClientRect().top + window.scrollY;
      b = Math.min(((window.innerHeight - topp - 8) * BREDDE) / HOYDE, skjerm.clientWidth - 250, 640);
    } else b = Math.min(ramme.clientWidth, 600);
    b = Math.floor(b);
    brett.style.width = b + "px";
    for (let k = 0; k < 3; k++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || b <= 250) break;
      b = Math.max(250, Math.floor(b - (over * BREDDE) / HOYDE - 1));
      brett.style.width = b + "px";
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && tilpass());
  });

  // A finger covers several holes: a tap goes to the nearest hole that means something now (a peg
  // that can move, or a place the picked-up peg can go), within one hole's distance.
  function naermeste(el, e) {
    const egen = el.dataset.v != null ? Number(el.dataset.v) : -1;
    const brett = el.closest(".hp-brett");
    if (!brett || !e || !(e.detail > 0) || !Number.isFinite(e.clientX)) return egen;
    const p = hentParti(R.S);
    const kandidater = [];
    for (let i = 0; i < Stjerne.N; i++) if (p.b[i] === p.tur && Stjerne.maal(p, i).size) kandidater.push(i);
    if (valgt >= 0) kandidater.push(...Stjerne.maal(p, valgt).keys());
    const rekt = brett.getBoundingClientRect();
    const enhet = rekt.width / BREDDE;
    let best = egen, bestD = Infinity;
    for (const i of kandidater) {
      const [x, y] = xy(i);
      const d = Math.hypot(rekt.left + (x / 100) * rekt.width - e.clientX, rekt.top + (y / 100) * rekt.height - e.clientY) / enhet;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD <= 0.95 ? best : egen;
  }

  // Keyboard: the arrows go to the nearest hole in that direction.
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("hp-hull") || !el.dataset.v) return;
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    const [x0, y0] = xy(Number(el.dataset.v));
    let best = -1, bestD = Infinity;
    for (let i = 0; i < Stjerne.N; i++) {
      const [x, y] = xy(i);
      const fram = (x - x0) * d[0] + (y - y0) * d[1];
      if (fram <= 0.5) continue;
      const a = fram + 2.2 * Math.abs((x - x0) * d[1] + (y - y0) * d[0]);
      if (a < bestD) {
        bestD = a;
        best = i;
      }
    }
    const ny = best >= 0 && R.$(`.hp-hull[data-v="${best}"]`);
    if (ny) {
      el.tabIndex = -1;
      ny.tabIndex = 0;
      ny.focus();
    }
  });

  // ---------- Setup and flow ----------
  function nyttSpill(S) {
    const o = S.oppsett;
    const folk = o.modus === "mobil" ? 1 : R.klamp(S.antall, 2, o.plasser);
    const forste = (o.neste || 0) % o.plasser;
    o.neste = forste + 1; // the next game is started by the next seat
    S.spill = { id: R.nyttFro() % 1e9, modus: o.modus, niva: o.niva, plasser: o.plasser, folk, forste, trekk: [], resultat: null, ferdig: false, registrert: false };
    nullstillVisning();
    R.statistikk("start", { modus: o.modus, plasser: o.plasser, folk, niva: o.plasser > folk ? o.niva : 0 });
  }
  function nullstillVisning() {
    parti = null;
    valgt = -1;
    animer = false;
    stoppTenking();
    clearTimeout(kaaringId);
  }
  function rekordHtml(S, k) {
    const r = S.rekord[k];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }
  const IKON = '<span class="hp-knappeikon" aria-hidden="true"></span>';

  function delTekst(sp) {
    const r = sp.resultat;
    const n = r.iMal[0];
    if (sp.modus === "mobil") {
      const niva = NIVANAVN[sp.niva].toLowerCase();
      if (r.vinner === 0) return R.t("Jeg fikk alle brikkene i mål før {n} mobil i kinasjakk på {niva}! Klarer du det?|Jeg fikk alle brikkene i mål før {n} mobiler i kinasjakk på {niva}! Klarer du det?", { n: sp.plasser - 1, niva });
      return R.t("Jeg fikk {k} av 10 brikker i mål mot {n} mobil i kinasjakk på {niva}. Klarer du bedre?|Jeg fikk {k} av 10 brikker i mål mot {n} mobiler i kinasjakk på {niva}. Klarer du bedre?", { k: n, n: sp.plasser - 1, niva });
    }
    return R.t("{navn} vant kinasjakk med {m} spillere!", { navn: R.kutt(navn(sp, r.vinner), 16), m: sp.plasser });
  }

  R.start({
    id: "hopperen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, plasser: 2, neste: 0 },
      spill: null,
      rekord: {},
      sist: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, plasser: 2, neste: 0 }, S.oppsett));
      if (!["mobil", "flere"].includes(o.modus)) o.modus = "mobil";
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!PLASSER.includes(o.plasser)) o.plasser = 2;
      if (!Number.isInteger(o.neste) || o.neste < 0) o.neste = 0;
      S.antall = R.klamp(Number(S.antall) || 2, 2, 6);
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      if (S.sist && !(typeof S.sist.tekst === "string" && typeof S.sist.navn === "string")) S.sist = null;
      const sp = S.spill;
      if (sp) {
        const ok = ["mobil", "flere"].includes(sp.modus) && PLASSER.includes(sp.plasser) && Number.isInteger(sp.folk) && sp.folk >= 1 && sp.folk <= sp.plasser && NIVAER.includes(sp.niva) && Number.isInteger(sp.forste);
        const p = ok ? Stjerne.spillUt(sp.plasser, sp.forste, sp.trekk) : null;
        if (!p) S.spill = null;
        else if (p.slutt && !sp.resultat) sp.resultat = { vinner: p.vinner, grunn: p.grunn, plass: Stjerne.rangering(p), iMal: [...Array(sp.plasser).keys()].map((s) => Stjerne.iMalet(p, s)) };
        else if (!p.slutt) {
          sp.resultat = null;
          sp.ferdig = false;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    vedSpillere(S) {
      // More people than seats: take the next number of seats that fits.
      const o = S.oppsett;
      if (o.modus === "flere" && S.antall > o.plasser) o.plasser = PLASSER.find((n) => n >= S.antall) || 6;
    },

    regler: {
      intro: R.t("Kinasjakk: Flytt alle de ti brikkene dine over stjerna og inn i spissen rett overfor. Den som først fyller spissen, vinner."),
      steg: [
        [R.t("Ett steg"), R.t("Flytt en brikke til et ledig hull ved siden av – i hvilken som helst av de seks retningene.")],
        [R.t("Eller hopp"), R.t("Hopp over én brikke (din egen eller en annens) til det ledige hullet rett bak. Kan du hoppe videre derfra, gjør du det – så langt du vil, i samme trekk.")],
        [R.t("Fyll spissen"), R.t("Få alle ti brikkene inn i spissen rett overfor. En brikke som har kommet i mål, blir der. Først i mål vinner.")],
      ],
      tips: [
        R.t("Lag hoppstiger: Brikker med ett hull mellom seg er en motorvei over brettet."),
        R.t("Ikke glem de bakerste brikkene – én brikke igjen hjemme kan koste seieren."),
        R.t("Trykk på en brikke, så viser prikkene hvor den kan gå. Du kan trykke litt ved siden av et hull – det nærmeste som passer, blir valgt."),
        R.t("Mobilene spiller de tomme plassene. Med 2, 3, 4 eller 6 plasser er det alltid noen å slå."),
        R.t("Etter 150 runder vinner den som har kommet lengst. Trykket feil? «Angre» tar tilbake trekket ditt."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const aktiv = pagar(S);
          const rek = [];
          for (const pl of PLASSER) for (const n of NIVAER) if (rekordHtml(S, `${pl}-${n}`)) rek.push([pl, n, rekordHtml(S, `${pl}-${n}`)]);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Hopp over stjerna –"))}<br><em>${esc(R.t("først i mål vinner!"))}</em>`,
              knapperHtml: R.ui.startKnapper({ pagar: aktiv, fortsettTekst: aktiv ? R.t("Fortsett spillet") : "", ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") }),
              merker: [
                ["2–6", R.t("plasser")],
                ["3", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) +
            (S.sist ? `<p class="hp-sist"><span class="etikett">${esc(R.t("Sist"))}</span> ${esc(S.sist.tekst)} <b>${esc(R.t("{navn} vant", { navn: S.sist.navn }))}</b></p>` : "") +
            (rek.length ? `<section class="hp-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([pl, n, h]) => `<li><b class="hp-niva">${esc(R.t("{n} plasser", { n: pl }))} · ${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
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
          const folk = mot ? 1 : R.klamp(S.antall, 2, 6);
          const maskiner = o.plasser - folk;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan vil du spille?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: R.t("Mot mobilen"), tekst: R.t("Du mot 1–5 mobiler") },
                  { v: "flere", ikon: "👥", tittel: R.t("Flere spillere"), tekst: R.t("2–6 på samme mobil") },
                ],
                o.modus,
              )}
            </section>
            ${mot ? "" : R.ui.spillere({ min: 2, max: 6, tittel: R.t("Spillerne"), hjelp: R.t("Dere sender mobilen rundt. Tomme plasser spilles av mobilen.") })}
            <section class="seksjon">
              <h2>${esc(R.t("Hvor mange plasser?"))}</h2>
              ${R.ui.seg("plasser", PLASSER.map((n) => [n, String(n)]), o.plasser, { etikett: R.t("Plasser på brettet"), av: (n) => n < folk })}
              <p class="hjelp">${esc(maskiner ? (mot ? R.t("Du mot {n} mobil.|Du mot {n} mobiler.", { n: maskiner }) : R.t("Mobilen spiller {n} plass.|Mobilen spiller {n} plasser.", { n: maskiner })) : R.t("Alle plassene har en spiller."))}</p>
            </section>
            ${
              maskiner
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>`
                : ""
            }
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.modus === "mobil" ? R.t("Mot mobilen") : R.t("{n} spillere", { n: S.spill.plasser })),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = !!sp.resultat;
          const kanAngre = angreAntall(S) > 0 && !ferdig;
          const s = tur(S);
          const tittel = R.t("Kinasjakk") + ": " + (ferdig ? R.t("spillet er ferdig") : erMaskin(sp, s) ? R.t("{navn} sin tur", { navn: navn(sp, s) }) : sp.modus === "mobil" ? R.t("din tur") : R.t("{navn} sin tur", { navn: navn(sp, s) }));
          const stempel = ferdig ? { tekst: R.t("{navn} vant", { navn: R.kutt(navn(sp, sp.resultat.vinner), 12) }), klasse: "aksent" } : null;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(tittel)}</h1>
            ${seterHtml(S)}
            ${meldingHtml(S)}
            <div class="hp-brettramme">${brettHtml(S, { interaktiv: true, stempel })}</div>
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
          valgt = -1;
          animer = false;
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat;
          if (!r) return `<h1 id="skjerm-tittel">${esc(R.t("Ingen vinner denne gangen"))}</h1>${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: IKON }))}`;
          const v = r.vinner;
          const tittel = sp.modus === "mobil" ? (v === 0 ? R.t("Du vinner!") : R.t("{navn} vinner!", { navn: navn(sp, v) })) : R.t("{navn} vinner!", { navn: navn(sp, v) });
          const figur = !erMaskin(sp, v) ? `<span class="hp-vinner">${R.avatar(v, "gigant")}<span class="hp-kroneemoji" aria-hidden="true">👑</span></span>` : R.figur();
          const tekst = sp.modus === "mobil" && v !== 0 ? R.t("Du fikk {n} av 10 i mål. Godt kjempa – prøv igjen!", { n: r.iMal[0] }) : r.grunn === "runder" ? R.t("Ingen fikk alle i mål på {n} runder.", { n: Stjerne.MAKS_RUNDER }) : "";
          const rader = r.plass.map((s) => ({ navn: navn(sp, s), i: s, poeng: r.iMal[s] }));
          let rekord = "";
          if (sp.modus === "mobil") {
            const rek = rekordHtml(S, `${sp.plasser}-${sp.niva}`);
            rekord = rek ? `<p class="hp-rekordlinje"><span class="etikett">${esc(R.t("{n} plasser", { n: sp.plasser }))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : "";
          }
          return `
            <div class="banner ${erMaskin(sp, v) ? "" : "aksent"}">
              ${figur}
              <p class="etikett">${esc(R.t("Brikker i mål"))}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>
            ${R.ui.poengliste(rader)}
            ${rekord}
            <div class="hp-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>
            ${R.ui.flereSpill({ antall: sp.folk })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: IKON }), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const r = sp.resultat;
          if (r && !sp.registrert) {
            sp.registrert = true;
            if (sp.folk >= 2) R.kveld.registrer([...Array(sp.folk).keys()].map((s) => ({ i: s, poeng: r.iMal[s] })));
            S.sist = { tekst: sp.modus === "mobil" ? R.t("Du mot {n} mobil ({niva})|Du mot {n} mobiler ({niva})", { n: sp.plasser - 1, niva: NIVANAVN[sp.niva].toLowerCase() }) : R.t("{n} spillere", { n: sp.plasser }), navn: R.kutt(navn(sp, r.vinner), 16) };
            R.lagre();
          }
          if (r && !erMaskin(sp, r.vinner)) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else lyd.tap();
          R.slippVaken();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), !!S.spill && S.spill.folk === 1)) || !fortsatt()) return;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (S.spill) R.gaTil(S.spill.ferdig ? "slutt" : "spill");
      },
      modus(el, e, S) {
        const o = S.oppsett;
        o.modus = el.dataset.v === "flere" ? "flere" : "mobil";
        if (o.modus === "flere" && S.antall > o.plasser) o.plasser = PLASSER.find((n) => n >= S.antall) || 6;
        R.vis();
      },
      plasser(el, e, S) {
        const n = Number(el.dataset.v);
        if (PLASSER.includes(n)) S.oppsett.plasser = n;
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 3);
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
      hull(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        if (!kanFlytte(S)) {
          if (el.dataset.v != null) R.toast(R.t("Vent litt – mobilen tenker"));
          return;
        }
        const i = naermeste(el, e);
        if (i < 0) return;
        const p = hentParti(S);
        const nei = (tekst) => {
          R.lyd.feil();
          R.vibrer(30);
          R.toast(tekst);
        };
        if (p.b[i] === p.tur) {
          if (!Stjerne.maal(p, i).size) return nei(R.t("Den brikka kan ikke flytte nå"));
          valgt = valgt === i ? -1 : i;
          R.lyd.klikk();
          R.vis();
          return;
        }
        if (valgt >= 0 && Stjerne.maal(p, valgt).has(i)) return flytt(S, valgt, i);
        if (p.b[i] >= 0) return nei(R.t("Det er ikke din brikke"));
        if (valgt < 0) return nei(R.t("Velg først en av brikkene dine"));
        nei(R.t("Dit kommer den ikke – velg et hull med prikk"));
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat) return;
        const n = angreAntall(S);
        if (n <= 0) return;
        stoppTenking();
        const p = hentParti(S);
        for (let k = 0; k < n; k++) {
          Stjerne.tilbake(p);
          sp.trekk.pop();
        }
        merkParti(S);
        valgt = -1;
        animer = false;
        R.lyd.snu();
        R.toast(R.t("Angret"));
        R.vis();
        startTenking(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.resultat) return;
        const r = sp.resultat;
        const linjer = [R.t("{navn} vant", { navn: R.kutt(navn(sp, r.vinner), 16) }), ...r.plass.slice(0, 3).map((s) => `${R.kutt(navn(sp, s), 16)}: ${r.iMal[s]}/10`)];
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
