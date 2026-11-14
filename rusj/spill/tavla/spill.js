/* Tavla — backgammon on one phone: against the phone at three levels, or two players passing the
   phone. Standard rules (use both dice if you can, else the larger; enter from the bar first; bear
   off when all fifteen are home; gammon and backgammon), an optional doubling cube with the
   Crawford rule, and matches to 1, 3 or 5 points. The rules and the phone players are pure
   functions at the top (window.RusjTavla when loaded without the kit); test/tavla.test.mjs checks
   them and lets seeded phone players play whole games against each other. */
(function () {
  "use strict";

  // ---------- The rules (pure: no DOM, no kit) ----------
  // A position is 52 numbers: side s owns p[s * 26 + i], its own point numbering i = 24 … 1 in the
  // direction it moves, 25 = the bar, 0 = borne off. Point i of one side is point 25 − i of the other.
  // Side 0 is drawn with its home in the bottom right.

  const T = (() => {
    const BAR = 25;
    const rng = (fro) => {
      let a = fro >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const terning = (rnd) => 1 + Math.floor(rnd() * 6);
    // The moves the dice give: doubles are played four times.
    const terningerFor = (kast) => (kast[0] === kast[1] ? [kast[0], kast[0], kast[0], kast[0]] : [kast[0], kast[1]]);

    function start() {
      const p = new Int8Array(52);
      for (const o of [0, 26]) {
        p[o + 24] = 2;
        p[o + 13] = 5;
        p[o + 8] = 3;
        p[o + 6] = 5;
      }
      return p;
    }

    const hjemme = (p, s) => {
      for (let i = 7; i <= BAR; i++) if (p[s * 26 + i]) return false;
      return true;
    };

    // Where a checker of side s on own point f lands with die d (0 = borne off), or −1 if it can't.
    function steg(p, s, f, d) {
      const o = s * 26;
      const a = (1 - s) * 26;
      if (f < 1 || f > BAR || p[o + f] <= 0) return -1;
      if (f !== BAR && p[o + BAR] > 0) return -1; // the bar first
      const t = f - d;
      if (t >= 1) return p[a + 25 - t] >= 2 ? -1 : t;
      if (!hjemme(p, s)) return -1;
      if (t === 0) return 0;
      for (let i = f + 1; i <= 6; i++) if (p[o + i]) return -1; // a bigger die only from the highest point
      return 0;
    }
    // Move one checker; returns true when it hit a lone checker (sent to the bar).
    function gjor(p, s, f, t) {
      const o = s * 26;
      const a = (1 - s) * 26;
      p[o + f]--;
      if (t === 0) {
        p[o]++;
        return false;
      }
      p[o + t]++;
      if (p[a + 25 - t] === 1) {
        p[a + 25 - t] = 0;
        p[a + BAR]++;
        return true;
      }
      return false;
    }
    function angre(p, s, f, t, slo) {
      const o = s * 26;
      const a = (1 - s) * 26;
      if (slo) {
        p[a + BAR]--;
        p[a + 25 - t] = 1;
      }
      if (t === 0) p[o]--;
      else p[o + t]--;
      p[o + f]++;
    }

    // Every way to play the dice in `rest` as the rules demand (as many dice as possible; when only
    // one of two different dice can be used, the larger if it can), one entry per resulting
    // position: [{ trekk: [{ f, t, d, slo }], pos }]. No legal move: one entry with no moves.
    function sekvenser(p0, s, rest) {
      const p = Int8Array.from(p0);
      const like = rest.length > 1 && rest.every((d) => d === rest[0]);
      const ut = new Map();
      let maks = 0;
      const sti = [];
      const rec = (igjen, minF) => {
        let videre = false;
        const provd = [];
        for (let k = 0; k < igjen.length; k++) {
          const d = igjen[k];
          if (provd.includes(d)) continue;
          provd.push(d);
          const ny = igjen.slice(0, k).concat(igjen.slice(k + 1));
          // With doubles the order doesn't matter: take the checkers from the back forward.
          for (let f = like ? minF : BAR; f >= 1; f--) {
            const t = steg(p, s, f, d);
            if (t < 0) continue;
            videre = true;
            const slo = gjor(p, s, f, t);
            sti.push({ f, t, d, slo });
            rec(ny, f);
            sti.pop();
            angre(p, s, f, t, slo);
          }
        }
        if (videre || sti.length < maks) return;
        if (sti.length > maks) {
          maks = sti.length;
          ut.clear();
        }
        const k = p.join(",");
        if (!ut.has(k)) ut.set(k, { trekk: sti.slice(), pos: Int8Array.from(p) });
      };
      rec(rest, BAR);
      let liste = [...ut.values()];
      if (rest.length === 2 && rest[0] !== rest[1] && maks === 1) {
        const stor = Math.max(rest[0], rest[1]);
        if (liste.some((x) => x.trekk[0].d === stor)) liste = liste.filter((x) => x.trekk[0].d === stor);
      }
      return liste;
    }
    const maksLengde = (p, s, rest) => (rest.length ? sekvenser(p, s, rest)[0].trekk.length : 0);

    // The single checker moves a player may make now (each is the start of a full legal play).
    function lovligeSteg(p0, s, rest) {
      const p = Int8Array.from(p0);
      const maks = maksLengde(p, s, rest);
      if (!maks) return [];
      const ut = [];
      const provd = [];
      for (let k = 0; k < rest.length; k++) {
        const d = rest[k];
        if (provd.includes(d)) continue;
        provd.push(d);
        const ny = rest.slice(0, k).concat(rest.slice(k + 1));
        for (let f = BAR; f >= 1; f--) {
          const t = steg(p, s, f, d);
          if (t < 0) continue;
          const slo = gjor(p, s, f, t);
          const ok = 1 + maksLengde(p, s, ny) === maks;
          angre(p, s, f, t, slo);
          if (ok) ut.push({ f, t, d, slo });
        }
      }
      if (rest.length === 2 && rest[0] !== rest[1] && maks === 1) {
        const stor = Math.max(rest[0], rest[1]);
        if (ut.some((x) => x.d === stor)) return ut.filter((x) => x.d === stor);
      }
      return ut;
    }

    // Pips left (the distance every checker must still travel).
    const pip = (p, s) => {
      let n = 0;
      for (let i = 1; i <= BAR; i++) n += i * p[s * 26 + i];
      return n;
    };
    const ute = (p, s) => p[s * 26];
    const bakerst = (p, s) => {
      for (let i = BAR; i >= 1; i--) if (p[s * 26 + i]) return i;
      return 0;
    };
    // Can the two sides still meet? (Otherwise it is a pure race.)
    const kontakt = (p) => bakerst(p, 0) + bakerst(p, 1) > 25;
    // 1 single game, 2 gammon (the loser has borne off none), 3 backgammon (… and still has a
    // checker on the bar or in the winner's home).
    function resultatType(p, vinner) {
      const l = (1 - vinner) * 26;
      if (p[l] > 0) return 1;
      for (let i = 19; i <= BAR; i++) if (p[l + i]) return 3;
      return 2;
    }
    const gyldig = (p) => p.length === 52 && [0, 26].every((o) => Array.from(p).slice(o, o + 26).every((n) => Number.isInteger(n) && n >= 0) && Array.from(p).slice(o, o + 26).reduce((a, b) => a + b, 0) === 15) && Array.from({ length: 24 }, (_, i) => i + 1).every((i) => !(p[i] && p[26 + 25 - i]));

    // ---------- The phone as a player ----------
    // Lett plays a random legal move half the time and otherwise a rough best one. Middels weighs
    // pips, made points, primes, blots that can be hit and checkers on the bar. Vanskelig counts
    // exactly how many of the 36 rolls hit each blot and plays the race by the pip count.

    // How many of the 36 rolls let the other side hit a lone checker of side s on own point i.
    function skudd(p, s, i) {
      const A = (1 - s) * 26;
      const o = s * 26;
      const mal = 25 - i;
      const kilder = [];
      for (let j = BAR; j > mal; j--) if (p[A + j]) kilder.push(j);
      if (!kilder.length) return 0;
      const apen = (j) => j < 1 || p[o + 25 - j] < 2;
      let n = 0;
      for (let x = 1; x <= 6; x++)
        for (let y = 1; y <= 6; y++) {
          let treff = false;
          for (const j of kilder) {
            const dist = j - mal;
            if (x === y) {
              if (dist % x === 0 && dist / x <= 4) {
                treff = true;
                for (let k = 1; k < dist / x; k++) if (!apen(j - x * k)) treff = false;
              }
            } else if (dist === x || dist === y) treff = true;
            else if (dist === x + y && (apen(j - x) || apen(j - y))) treff = true;
            if (treff) break;
          }
          if (treff) n++;
        }
      return n;
    }

    // Own point weights: the home board and the bar point, and anchors deep in the other's home.
    const PUNKT = [0, 1, 1.5, 2.5, 4, 5, 4.5, 4, 2, 1.5, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 3.5, 3, 2, 1.5, 1.5];
    const PRIME = [0, 0, 0.5, 2, 5, 9, 14];
    function sideVerdi(p, s, fin, risikoVekt) {
      const o = s * 26;
      const a = (1 - s) * 26;
      let v = 0;
      let rekke = 0;
      let lengst = 0;
      for (let i = 1; i <= 24; i++) {
        const n = p[o + i];
        if (n >= 2) {
          v += PUNKT[i];
          if (n > 3) v -= (n - 3) * 0.5;
          rekke++;
          lengst = Math.max(lengst, rekke);
        } else {
          rekke = 0;
          if (n === 1) {
            let risiko;
            if (fin) risiko = skudd(p, s, i) / 36;
            else {
              risiko = 0;
              for (let j = BAR; j > 25 - i; j--) if (p[a + j]) risiko = 0.33;
            }
            v -= risikoVekt * risiko * (3 + (25 - i) * 0.3);
          }
        }
      }
      v += PRIME[Math.min(lengst, 6)];
      v += p[o] * 1.5;
      v -= p[o + BAR] * 3;
      return v;
    }
    const hjemmepunkter = (p, s) => {
      let n = 0;
      for (let i = 1; i <= 6; i++) if (p[s * 26 + i] >= 2) n++;
      return n;
    };
    // How good the position is for side s, which has just moved (higher is better).
    function evaluer(p, s, fin) {
      if (ute(p, s) === 15) return 1e4;
      if (ute(p, 1 - s) === 15) return -1e4;
      const ps = pip(p, s);
      const pa = pip(p, 1 - s);
      if (!kontakt(p)) {
        let v = pa - ps + (ute(p, s) - ute(p, 1 - s)) * 2;
        // In the race home, spread the checkers (fewer wasted pips when bearing off).
        for (let i = 1; i <= 6; i++) if (p[s * 26 + i]) v += 0.4;
        return v;
      }
      let v = (pa - ps) * 0.35 + sideVerdi(p, s, fin, 1) - sideVerdi(p, 1 - s, false, 0.25);
      v += p[(1 - s) * 26 + BAR] * hjemmepunkter(p, s) * 0.8;
      v -= p[s * 26 + BAR] * hjemmepunkter(p, 1 - s) * 0.8;
      return v;
    }

    function velgTrekk(p, s, rest, niva, rnd) {
      const alle = sekvenser(p, s, rest);
      if (alle.length === 1) return alle[0].trekk;
      if (niva <= 1 && rnd() < 0.5) return alle[Math.floor(rnd() * alle.length)].trekk;
      const fin = niva >= 3;
      let best = alle[0];
      let bv = -Infinity;
      for (const x of alle) {
        const v = evaluer(x.pos, s, fin) + (niva <= 1 ? rnd() * 6 : rnd() * 0.01);
        if (v > bv) {
          bv = v;
          best = x;
        }
      }
      return best.trekk;
    }

    // Rough chance that side s wins when it is about to roll.
    function vinnSjanse(p, s) {
      const ps = pip(p, s) - 4;
      const pa = pip(p, 1 - s);
      if (!kontakt(p)) return 1 / (1 + Math.exp(-((pa - ps) / Math.max(ps, 20)) * 11));
      return 1 / (1 + Math.exp(-(evaluer(p, s, true) + 3) / 22));
    }
    // Offer a double now? Lett never does. In a race there is no gammon, so no «too good to double».
    function skalDoble(p, s, niva) {
      if (niva <= 1) return false;
      const v = vinnSjanse(p, s);
      const fra = niva === 2 ? 0.74 : 0.7;
      return v >= fra && (!kontakt(p) || v < (niva === 2 ? 0.93 : 0.9));
    }
    // Take a double offered by the other side (who is about to roll)?
    const skalTa = (p, s, niva) => 1 - vinnSjanse(p, 1 - s) >= (niva <= 1 ? 0.1 : niva === 2 ? 0.22 : 0.25);

    // A whole game between two phone players (tests): { vinner, type, kube, oppgitt, turer }.
    // valg: { kube: true, sjekk(pos, side, rest, trekk) } – sjekk sees every play before it is made.
    function parti(fro, nivaer, valg = {}) {
      const rnd = rng(fro);
      const p = start();
      let a;
      let b;
      do {
        a = terning(rnd);
        b = terning(rnd);
      } while (a === b);
      let tur = a > b ? 0 : 1;
      let kast = [a, b];
      let kube = 1;
      let eier = -1;
      for (let turer = 1; turer <= 3000; turer++) {
        if (!kast) {
          if (valg.kube && (eier === -1 || eier === tur) && kube < 64 && skalDoble(p, tur, nivaer[tur])) {
            if (!skalTa(p, 1 - tur, nivaer[1 - tur])) return { vinner: tur, type: 1, kube, oppgitt: true, turer };
            kube *= 2;
            eier = 1 - tur;
          }
          kast = [terning(rnd), terning(rnd)];
        }
        const rest = terningerFor(kast);
        const trekk = velgTrekk(p, tur, rest, nivaer[tur], rnd);
        if (valg.sjekk) valg.sjekk(Int8Array.from(p), tur, rest, trekk);
        for (const m of trekk) gjor(p, tur, m.f, m.t);
        if (ute(p, tur) === 15) return { vinner: tur, type: resultatType(p, tur), kube, oppgitt: false, turer, pos: p };
        tur = 1 - tur;
        kast = null;
      }
      return { vinner: -1, turer: 3000 };
    }

    return { BAR, rng, terning, terningerFor, start, hjemme, steg, gjor, angre, sekvenser, lovligeSteg, pip, ute, kontakt, resultatType, gyldig, skudd, evaluer, velgTrekk, vinnSjanse, skalDoble, skalTa, parti };
  })();

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") {
    window.RusjTavla = T;
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const NIVAER = [1, 2, 3];
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen flytter litt på måfå. Fin for å lære reglene."),
    2: R.t("Mobilen bygger punkter og passer på brikkene sine. Passe utfordring."),
    3: R.t("Mobilen regner på hvert kast og dobler når den bør. Klarer du å slå den?"),
  };
  const MAL = [1, 3, 5];
  const MALNAVN = { 1: R.t("Ett spill"), 3: R.t("Først til {n}", { n: 3 }), 5: R.t("Først til {n}", { n: 5 }) };
  const FARGE = [R.t("hvit"), R.t("svart")];
  const TYPENAVN = { 1: "", 2: R.t("Gammon!"), 3: R.t("Backgammon!") };
  // This edition's address (rusj.no/tavla/, rusj.no/en/…)
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/tavla/" }).href;
  let H;

  // S.spill: { id, modus "mobil" | "to", niva, mal, kube (cube in use), poeng [p0, p1], runde,
  //   crawford (no doubling this game), crawfordBrukt, pos [52], tur, kast [a, b] | null, rest [dice
  //   left], steg [{ f, t, d, slo }] this turn, apning (first roll of the game, one die each),
  //   kubeVerdi, kubeEier (−1 middle), tilbud (side offering a double, −1 none), sist { side, steg },
  //   valgt (selected own point), resultat { vinner, type, poeng, oppgitt } | null, angre (state
  //   before the result), ferdig (match over), registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, i) => sp.modus === "mobil" && i === 1;
  const navn = (sp, i) => (sp.modus === "mobil" ? (i === 1 ? R.t("Mobilen") : R.t("Du")) : R.navn(i));
  const tilfeldig = () => R.nyttFro() / 4294967296;
  const P = (sp) => Int8Array.from(sp.pos);
  const kampVunnet = (sp) => Math.max(sp.poeng[0], sp.poeng[1]) >= sp.mal;
  const fase = (sp) => (sp.resultat ? "slutt" : sp.tilbud >= 0 ? "tilbud" : !sp.kast ? "kast" : "flytt");
  // Own point of side s ↔ the point number drawn on the board (side 0's numbering).
  const egen = (s, punkt) => (s === 0 ? punkt : 25 - punkt);
  const kanDoble = (sp, s) => sp.kube && !sp.crawford && !sp.resultat && !sp.kast && sp.tilbud < 0 && (sp.kubeEier === -1 || sp.kubeEier === s) && sp.kubeVerdi < 64;

  let lovligeCache = { nokkel: "", liste: [] };
  function lovlige(sp) {
    const nokkel = `${sp.pos.join(",")}|${sp.tur}|${sp.rest.join(",")}`;
    if (lovligeCache.nokkel !== nokkel) lovligeCache = { nokkel, liste: T.lovligeSteg(P(sp), sp.tur, sp.rest) };
    return lovligeCache.liste;
  }
  const kanFlytte = (sp) => !sp.resultat && sp.kast && !erMaskin(sp, sp.tur) && !ruller;

  let ruller = false; // dice in the air
  let robotId = null;
  let hopp = false; // «Hopp over»: the phone's turn without waiting

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.stoy(0, 0.035, 0.22, 1500);
      R.lyd.tone(210, 0, 0.07, "triangle", 0.14, 140);
    },
    slag: () => {
      R.lyd.stoy(0, 0.06, 0.3, 900);
      R.lyd.tone(140, 0, 0.18, "square", 0.08, 70);
    },
    ut: () => R.lyd.tone(660, 0, 0.12, "sine", 0.14, 880),
    tap: () => {
      R.lyd.tone(392, 0, 0.22, "triangle", 0.13);
      R.lyd.tone(311, 0.2, 0.42, "triangle", 0.12);
    },
  };

  // ---------- Dice ----------
  // Two real 3D dice that roll along the bar (a central band of the board on a phone on its side),
  // thrown with a simulated throw (R.terninger, rusj/kit/terninger.js). The game decides the numbers;
  // the kit lands the dice on them. A die that is used up is dimmed; a double shows on each die how
  // many moves it still gives. The doubling cube is a small 3D cube with its value on top.
  const BRETT = "tv-kast";
  let tegnForKast = null; // the dice about to be thrown while the screen is drawn before the throw
  function terningerHtml(sp) {
    if (!sp.kast || sp.resultat) return "";
    const apning = sp.apning && !sp.steg.length && sp.rest.length === 2;
    const dobbel = sp.kast[0] === sp.kast[1];
    const r = sp.rest.length;
    // what each die still gives: a double counts twice per die (die 0 is used first)
    const igjen = dobbel ? [Math.max(0, r - 2), Math.min(2, r)] : sp.kast.map((d) => (sp.rest.includes(d) ? 1 : 0));
    return R.terninger.html({
      id: BRETT,
      klasse: "tv-terninger",
      verdier: sp.kast,
      flate: false,
      hold: false,
      knapper: false,
      sveip: false,
      hoyde: liggende() ? 2.2 : 1.5,
      klasser: [0, 1].map((k) => `${apning ? "s" + k : "s" + sp.tur}${!apning && !igjen[k] && !tegnForKast ? " brukt" : ""}`),
      merker: dobbel && !tegnForKast ? igjen.map((n) => (n ? `×${n}` : "")) : null,
      forKast: tegnForKast,
    });
  }
  const kubeHtml = (sp) =>
    sp.kube ? `<span class="tv-kube${sp.kubeEier >= 0 ? " eid s" + sp.kubeEier : ""}">${R.terninger.dobling(sp.kubeEier < 0 && sp.kubeVerdi === 1 ? 64 : sp.kubeVerdi, { s: liggende() ? 30 : 24, vri: -8 })}</span>` : "";

  // ---------- The board ----------
  // One grid, drawn on its side in landscape: point (row, column) in landscape is (column, row) in
  // portrait. Landscape: 13–18 | bar | 19–24 | off on top, 12–7 | bar | 6–1 | off below.
  const plass = (pt) => (pt >= 13 ? [1, pt <= 18 ? pt - 12 : pt - 11] : [2, pt >= 7 ? 13 - pt : 14 - pt]);
  const LIGGENDE = "(orientation: landscape) and (max-height: 500px), (min-width: 700px) and (min-aspect-ratio: 6/5)";
  const liggende = () => !!(window.matchMedia && window.matchMedia(LIGGENDE).matches);

  function stabel(side, n, o = {}) {
    if (!n) return "";
    const vis = Math.min(n, 5);
    let html = "";
    for (let k = 0; k < vis; k++) {
      const topp = k === vis - 1;
      const kl = ["tv-b", "s" + side];
      if (topp && o.loft) kl.push("loft");
      if (topp && o.ny) kl.push("ny");
      html += `<i class="${kl.join(" ")}">${topp && n > 5 ? n : ""}</i>`;
    }
    return html;
  }
  const antallTekst = (side, n) => (side === 0 ? R.t("{n} hvit|{n} hvite", { n }) : R.t("{n} svart|{n} svarte", { n }));

  function brettHtml(sp) {
    const s = sp.tur;
    const menneske = kanFlytte(sp);
    const steg = menneske ? lovlige(sp) : [];
    const fra = new Set(steg.map((x) => x.f));
    const valgt = menneske && fra.has(sp.valgt) ? sp.valgt : fra.size === 1 && menneske ? [...fra][0] : -1;
    const mal = new Map();
    if (valgt >= 0) for (const x of steg) if (x.f === valgt && (!mal.has(x.t) || x.d < mal.get(x.t))) mal.set(x.t, x.d);
    // The other side's last move: where it went from and to (drawn points).
    const sistTil = new Set();
    const sistFra = new Set();
    if (sp.sist && sp.sist.side !== s && !sp.steg.length && !erMaskin(sp, s))
      for (const m of sp.sist.steg) {
        if (m.f !== 25) sistFra.add(egen(sp.sist.side, m.f));
        if (m.t > 0) sistTil.add(egen(sp.sist.side, m.t));
      }
    const p = sp.pos;
    const celler = [];
    let fokus = valgt >= 0 ? (mal.size ? [...mal.keys()][0] : valgt) : fra.size ? [...fra][0] : -1;
    for (let pt = 1; pt <= 24; pt++) {
      const n0 = p[pt];
      const n1 = p[26 + 25 - pt];
      const hvem = n0 ? 0 : n1 ? 1 : -1;
      const n = n0 || n1;
      const e = egen(s, pt);
      const [r, k] = plass(pt);
      const kl = ["tv-celle", "tv-p", pt >= 13 ? "ovre" : "nedre", pt % 2 ? "a" : "b"];
      let etikett = R.t("Punkt {n}", { n: sp.modus === "mobil" ? pt : e }) + ": " + (n ? antallTekst(hvem, n) : R.t("tomt"));
      if (fra.has(e) && menneske) {
        kl.push("kan");
        etikett += ", " + R.t("kan flyttes");
      }
      if (e === valgt) {
        kl.push("valgt");
        etikett += ", " + R.t("valgt");
      }
      if (mal.has(e)) {
        kl.push("mal");
        etikett += ", " + R.t("flytt hit med {d}", { d: mal.get(e) });
      }
      if (sistTil.has(pt)) kl.push("sist");
      if (sistFra.has(pt)) kl.push("sist-fra");
      const merke = mal.has(e) ? `<b class="tv-dmerke" aria-hidden="true">${mal.get(e)}</b>` : "";
      celler.push(
        `<button class="${kl.join(" ")}" data-h="punkt" data-v="${pt}" data-stille style="--r:${r};--k:${k}" tabindex="${e === fokus ? 0 : -1}" aria-label="${esc(etikett)}"><span class="tv-stabel">${stabel(hvem, n, { loft: e === valgt, ny: sistTil.has(pt) })}</span>${merke}</button>`,
      );
    }
    for (const q of [1, 0]) {
      const n = p[q * 26 + 25];
      const kan = menneske && q === s && fra.has(25);
      const kl = ["tv-celle", "tv-bar", "s" + q];
      if (kan) kl.push("kan");
      if (kan && valgt === 25) kl.push("valgt");
      const etikett = R.t("Baren") + ": " + (n ? antallTekst(q, n) : R.t("tom")) + (kan ? ", " + R.t("kan flyttes") : "");
      celler.push(
        `<button class="${kl.join(" ")}" data-h="punkt" data-v="bar" data-side="${q}" data-stille style="--r:${q === 1 ? 1 : 2};--k:7" tabindex="${kan && fokus === 25 ? 0 : -1}" aria-label="${esc(etikett)}"${kan ? "" : ' aria-disabled="true"'}><span class="tv-stabel">${stabel(q, n, { loft: kan && valgt === 25 })}</span></button>`,
      );
      const ut = p[q * 26];
      const malHer = q === s && mal.has(0);
      const ukl = ["tv-celle", "tv-ut", "s" + q];
      if (malHer) ukl.push("mal");
      const uetikett = R.t("Ute: {n} av 15", { n: ut }) + (malHer ? ", " + R.t("ta ut med {d}", { d: mal.get(0) }) : "");
      celler.push(
        `<button class="${ukl.join(" ")}" data-h="ut" data-side="${q}" data-stille style="--r:${q === 1 ? 1 : 2};--k:14" tabindex="${malHer && fokus === 0 ? 0 : -1}" aria-label="${esc(uetikett)}"${malHer ? "" : ' aria-disabled="true"'}><span class="tv-utstabel" aria-hidden="true">${Array.from({ length: ut }, () => `<i class="s${q}"></i>`).join("")}</span>${malHer ? `<b class="tv-dmerke">${esc(R.t("Ut"))}</b>` : ut ? `<b class="tv-uttall">${ut}</b>` : ""}</button>`,
      );
    }
    return `<div class="tv-brett${liggende() ? " ligg" : ""}${menneske ? " din" : ""}" role="group" aria-label="${esc(R.t("Brettet"))}">
      ${celler.join("")}
      <div class="tv-midt${s === 1 ? " venstre" : ""}" id="tv-terninger" aria-hidden="true">${kubeHtml(sp)}${terningerHtml(sp)}</div>
    </div>`;
  }

  // ---------- Header and message ----------
  const avatarFor = (sp, i) => (erMaskin(sp, i) ? `<span class="avatar tv-robot" aria-hidden="true">🤖</span>` : R.avatar(i));
  function stillingHtml(sp) {
    const aktiv = sp.resultat ? -1 : fase(sp) === "tilbud" ? 1 - sp.tilbud : sp.tur;
    const kort = (i) => `<div class="tv-spiller s${i}${aktiv === i ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === i ? " vant" : ""}">
        ${avatarFor(sp, i)}
        <span class="tv-info"><b class="tv-navn">${esc(navn(sp, i))}</b><span class="tv-pip"><i class="tv-b s${i}" aria-hidden="true"></i>${T.pip(P(sp), i)}</span></span>
      </div>`;
    const etikett = R.t("{a} har {fa} og {pa} pips igjen, {b} har {fb} og {pb} pips igjen.", { a: navn(sp, 0), fa: FARGE[0], pa: T.pip(P(sp), 0), b: navn(sp, 1), fb: FARGE[1], pb: T.pip(P(sp), 1) }) + (sp.mal > 1 ? " " + R.t("Stillingen er {a}–{b}.", { a: sp.poeng[0], b: sp.poeng[1] }) : "");
    const midt = sp.mal > 1 ? `<div class="tv-tall"><b>${sp.poeng[0]}</b><span>–</span><b>${sp.poeng[1]}</b><small>${esc(R.t("til {n}", { n: sp.mal }))}</small></div>` : `<div class="tv-tall en"><span>${esc(R.t("mot"))}</span></div>`;
    return `<div class="tv-stilling" role="group" aria-label="${esc(etikett)}">${kort(0)}${midt}${kort(1)}</div>`;
  }

  const rest = (sp) => R.ramsOpp(sp.rest.map(String));
  function meldingTekst(sp) {
    const s = sp.tur;
    const f = fase(sp);
    if (f === "slutt") return resultatTekst(sp);
    if (f === "tilbud") {
      const ny = sp.kubeVerdi * 2;
      if (erMaskin(sp, sp.tilbud)) return R.t("Mobilen vil doble til {n}. Tar du imot?", { n: ny });
      if (erMaskin(sp, 1 - sp.tilbud)) return R.t("Mobilen tenker på doblingen …");
      return R.t("{navn} vil doble til {n}. {annen}, tar du imot?", { navn: navn(sp, sp.tilbud), n: ny, annen: navn(sp, 1 - sp.tilbud) });
    }
    if (erMaskin(sp, s)) return f === "kast" ? R.t("Mobilen sin tur") : R.t("Mobilen flytter {terninger}", { terninger: R.ramsOpp(T.terningerFor(sp.kast).map(String)) });
    const hvem = sp.modus === "mobil" ? "" : navn(sp, s) + ": ";
    if (f === "kast") {
      if (sp.crawford && sp.kube) return hvem + R.t("Kast terningene (ingen dobling i dette spillet)");
      return hvem + (sp.modus === "mobil" ? R.t("Din tur – kast terningene") : R.t("kast terningene"));
    }
    if (ruller) return R.t("Terningene ruller …");
    const steg = lovlige(sp);
    if (!steg.length) return sp.steg.length ? hvem + R.t("Ferdig? Trykk «Ferdig».") : hvem + R.t("Ingen lovlige trekk med {terninger}", { terninger: R.ramsOpp(T.terningerFor(sp.kast).map(String)) });
    if (sp.apning && !sp.steg.length) {
      const a = sp.kast[0];
      const b = sp.kast[1];
      if (sp.modus === "mobil") return a > b ? R.t("Du slo {a}, mobilen {b} – du begynner!", { a, b }) : R.t("Mobilen slo {b}, du {a} – mobilen begynner.", { a, b });
      return R.t("{navn} slo høyest og begynner med {a} og {b}", { navn: navn(sp, s), a: Math.max(a, b), b: Math.min(a, b) });
    }
    if (P(sp)[s * 26 + 25] > 0) return hvem + R.t("Få brikken inn fra baren: {terninger}", { terninger: rest(sp) });
    return hvem + R.t("Flytt {terninger}", { terninger: rest(sp) });
  }
  function resultatTekst(sp) {
    const r = sp.resultat;
    const v = r.vinner;
    const poeng = R.flertall(r.poeng, "poeng", "poeng");
    if (r.oppgitt) return sp.modus === "mobil" ? (v === 0 ? R.t("Mobilen ga opp – du får {poeng}!", { poeng }) : R.t("Du ga opp – mobilen får {poeng}.", { poeng })) : R.t("{navn} ga opp – {vinner} får {poeng}.", { navn: navn(sp, 1 - v), vinner: navn(sp, v), poeng });
    const type = TYPENAVN[r.type] ? TYPENAVN[r.type] + " " : "";
    return type + (sp.modus === "mobil" ? (v === 0 ? R.t("Du vinner {poeng}!", { poeng }) : R.t("Mobilen vinner {poeng}.", { poeng })) : R.t("{navn} vinner {poeng}!", { navn: navn(sp, v), poeng }));
  }

  // ---------- Board size ----------
  function tilpass() {
    const brett = R.$(".skjerm-spill .tv-brett");
    if (!brett) return;
    const ligg = brett.classList.contains("ligg");
    if (ligg !== liggende()) return R.vis();
    const ramme = brett.parentElement;
    const w = Math.min(ramme.clientWidth, ligg ? 760 : 480);
    brett.style.width = w + "px";
    // As tall as the screen allows (the points get bigger), never beyond these shapes.
    let h = Math.round(ligg ? w * 0.62 : w * 1.6);
    const min = ligg ? 200 : 280;
    brett.style.height = h + "px";
    for (let n = 0; n < 4; n++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || h <= min) break;
      h = Math.max(min, h - over);
      brett.style.height = h + "px";
    }
    const stil = getComputedStyle(brett);
    const bar = parseFloat(stil.getPropertyValue("--bar")) || 28;
    const ut = parseFloat(stil.getPropertyValue("--ut")) || 26;
    const kant = 12;
    const c = ligg ? Math.min(((w - bar - ut - kant) / 12) * 0.9, (h - kant) / 2 / 5.4) : Math.min(((h - bar - ut - kant) / 12) * 0.88, (w - kant) / 2 / 5.6);
    brett.style.setProperty("--c", Math.max(12, Math.floor(c)) + "px");
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && tilpass());
  });

  // ---------- Playing ----------
  function nyttParti(sp) {
    sp.pos = Array.from(T.start());
    sp.kubeVerdi = 1;
    sp.kubeEier = -1;
    sp.tilbud = -1;
    sp.resultat = null;
    sp.angre = null;
    sp.sist = null;
    sp.steg = [];
    sp.valgt = -1;
    let a;
    let b;
    do {
      a = 1 + Math.floor(tilfeldig() * 6);
      b = 1 + Math.floor(tilfeldig() * 6);
    } while (a === b);
    sp.kast = [a, b];
    sp.rest = [a, b];
    sp.tur = a > b ? 0 : 1;
    sp.apning = true;
  }
  function nyKamp(S) {
    const o = S.oppsett;
    S.spill = { id: R.nyttFro() % 1e9, modus: o.modus, niva: o.niva, mal: o.mal, kube: !!o.kube, poeng: [0, 0], runde: 1, crawford: false, crawfordBrukt: false, ferdig: false, registrert: false };
    nyttParti(S.spill);
    stoppRobot();
    hopp = false;
    R.statistikk("start", { modus: o.modus, niva: o.modus === "mobil" ? o.niva : 0, mal: o.mal, kube: !!o.kube });
  }

  async function kast(S) {
    const sp = S.spill;
    if (!sp || fase(sp) !== "kast" || ruller) return;
    sp.apning = false;
    sp.kast = [1 + Math.floor(tilfeldig() * 6), 1 + Math.floor(tilfeldig() * 6)];
    sp.rest = T.terningerFor(sp.kast);
    sp.steg = [];
    sp.valgt = -1;
    ruller = true;
    R.lagre();
    tegnForKast = [0, 1];
    R.vis();
    tegnForKast = null;
    const fortsatt = R.vakt();
    // along the lane: thrown from one end towards the other
    const retning = [Math.random() < 0.5 ? -1 : 1, (Math.random() - 0.5) * 0.5];
    await R.terninger.kast(BRETT, { verdier: sp.kast, indekser: [0, 1], retning, styrke: 0.45 + Math.random() * 0.35, rolig: hopp, lyd: !hopp });
    ruller = false;
    if (!fortsatt() || R.S.spill !== sp) return;
    R.vis();
    const verdier = R.ramsOpp(sp.kast.map(String));
    const ingen = !lovlige(sp).length;
    R.si((erMaskin(sp, sp.tur) ? R.t("Mobilen slo {terninger}.", { terninger: verdier }) : sp.modus === "mobil" ? R.t("Du slo {terninger}.", { terninger: verdier }) : R.t("{navn} slo {terninger}.", { navn: navn(sp, sp.tur), terninger: verdier })) + (ingen ? " " + R.t("Ingen lovlige trekk.") : ""));
    driv();
  }

  function flytt(S, f, t, d) {
    const sp = S.spill;
    const p = P(sp);
    if (T.steg(p, sp.tur, f, d) !== t) return;
    const slo = T.gjor(p, sp.tur, f, t);
    sp.pos = Array.from(p);
    sp.steg.push({ f, t, d, slo });
    sp.rest.splice(sp.rest.indexOf(d), 1);
    sp.valgt = -1;
    if (slo) {
      lyd.slag();
      R.vibrer([20, 40, 30]);
    } else if (t === 0) lyd.ut();
    else lyd.legg();
    R.vibrer(8);
    const hvem = erMaskin(sp, sp.tur) ? R.t("Mobilen") : sp.modus === "mobil" ? R.t("Du") : navn(sp, sp.tur);
    // Point numbers as the listener sees them: the drawn ones against the phone, each player's own otherwise.
    const nr = (x) => String(sp.modus === "mobil" ? egen(sp.tur, x) : x);
    const tilTekst = t === 0 ? R.t("ut") : nr(t);
    const fraTekst = f === 25 ? R.t("baren") : nr(f);
    R.si(R.t("{hvem} flyttet fra {fra} til {til}.", { hvem, fra: fraTekst, til: tilTekst }) + (slo ? " " + R.t("Slått ut!") : ""));
    R.vis();
    if (slo) R.toast(erMaskin(sp, sp.tur) ? R.t("Au! Mobilen slo ut en brikke") : R.t("Slått ut!"));
  }

  function ferdigTur(S) {
    const sp = S.spill;
    if (!sp || sp.resultat || !sp.kast || lovlige(sp).length || ruller) return;
    const p = P(sp);
    if (T.ute(p, sp.tur) === 15) {
      const vinner = sp.tur;
      sp.angre = erMaskin(sp, vinner) ? null : JSON.stringify({ pos: sp.pos, steg: sp.steg, rest: sp.rest, kast: sp.kast, tur: sp.tur, apning: sp.apning });
      return avsluttParti(S, vinner, T.resultatType(p, vinner), false);
    }
    sp.sist = { side: sp.tur, steg: sp.steg };
    sp.tur = 1 - sp.tur;
    sp.kast = null;
    sp.rest = [];
    sp.steg = [];
    sp.valgt = -1;
    sp.apning = false;
    sp.angre = null;
    if (!erMaskin(sp, sp.tur)) hopp = false;
    R.lyd.pop();
    R.vis();
    if (!erMaskin(sp, sp.tur) && sp.modus === "to") R.si(R.t("{navn} sin tur.", { navn: navn(sp, sp.tur) }));
    driv();
  }

  function avsluttParti(S, vinner, type, oppgitt) {
    const sp = S.spill;
    stoppRobot();
    const poeng = oppgitt ? sp.kubeVerdi : type * sp.kubeVerdi;
    sp.poeng[vinner] += poeng;
    sp.resultat = { vinner, type, poeng, oppgitt };
    sp.kast = null;
    sp.rest = [];
    sp.steg = [];
    sp.valgt = -1;
    R.si(resultatTekst(sp));
    R.vis();
    const fortsatt = R.vakt();
    setTimeout(() => {
      if (!fortsatt() || !R.S.spill || R.S.spill.resultat !== sp.resultat) return;
      if (sp.modus === "mobil" && vinner === 1) lyd.tap();
      else {
        R.lyd.fanfare();
        R.vibrer([40, 60, 120]);
        if (kampVunnet(sp) || type > 1) R.konfetti();
      }
    }, R.rolig() ? 80 : 300);
  }

  function angreResultat(S) {
    const sp = S.spill;
    const r = sp.resultat;
    if (!r || !sp.angre) return;
    sp.poeng[r.vinner] = Math.max(0, sp.poeng[r.vinner] - r.poeng);
    const a = JSON.parse(sp.angre);
    if (r.oppgitt) {
      sp.tilbud = a.tilbud;
    } else {
      Object.assign(sp, { pos: a.pos, steg: a.steg, rest: a.rest, kast: a.kast, tur: a.tur, apning: a.apning });
      // Back to before the last checker went out: take the last move back too.
      const m = sp.steg.pop();
      if (m) {
        const p = P(sp);
        T.angre(p, sp.tur, m.f, m.t, m.slo);
        sp.pos = Array.from(p);
        sp.rest.push(m.d);
        sp.rest.sort((x, y) => y - x);
      }
    }
    sp.resultat = null;
    sp.angre = null;
    R.lyd.snu();
    R.toast(R.t("Angret"));
    R.vis();
  }

  function nesteParti(S) {
    const sp = S.spill;
    if (!sp || !sp.resultat || kampVunnet(sp)) return;
    if (sp.crawford) sp.crawfordBrukt = true;
    sp.crawford = !!(sp.kube && !sp.crawfordBrukt && sp.mal > 1 && sp.poeng.some((x) => x === sp.mal - 1));
    sp.runde++;
    nyttParti(sp);
    R.lyd.snu();
    R.vis();
    if (sp.crawford) R.toast(R.t("Crawford-spill: ingen kan doble i dette spillet"));
    driv();
  }

  function tilby(S) {
    const sp = S.spill;
    if (!sp || !kanDoble(sp, sp.tur)) return;
    sp.tilbud = sp.tur;
    R.lyd.pling();
    R.vis();
    R.si(meldingTekst(sp));
    driv();
  }
  function svar(S, ja) {
    const sp = S.spill;
    if (!sp || sp.tilbud < 0) return;
    const doblet = sp.tilbud;
    if (ja) {
      sp.kubeVerdi *= 2;
      sp.kubeEier = 1 - doblet;
      sp.tilbud = -1;
      R.lyd.riktig();
      R.toast(erMaskin(sp, 1 - doblet) ? R.t("Mobilen tar imot – nå står det om {n}", { n: sp.kubeVerdi }) : R.t("Tatt imot – nå står det om {n}", { n: sp.kubeVerdi }));
      R.vis();
      driv();
      return;
    }
    sp.angre = erMaskin(sp, 1 - doblet) ? null : JSON.stringify({ tilbud: doblet });
    sp.tilbud = -1;
    avsluttParti(S, doblet, 1, true);
  }

  // ---------- The phone's turn ----------
  // One step at a time from the saved state (a reload simply carries on); never behind a sheet.
  function stoppRobot() {
    clearTimeout(robotId);
    robotId = null;
  }
  function driv() {
    stoppRobot();
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || sp.resultat || ruller || sp.modus !== "mobil") return;
    if (R.arkApent()) {
      robotId = setTimeout(driv, 400);
      return;
    }
    const pause = (ms) => (R.rolig() || hopp ? 120 : ms);
    const f = fase(sp);
    if (f === "tilbud") {
      if (!erMaskin(sp, 1 - sp.tilbud)) return;
      robotId = setTimeout(() => svar(R.S, T.skalTa(P(sp), 1 - sp.tilbud, sp.niva)), pause(1300));
      return;
    }
    if (!erMaskin(sp, sp.tur)) return;
    if (f === "kast") {
      if (kanDoble(sp, sp.tur) && T.skalDoble(P(sp), sp.tur, sp.niva)) robotId = setTimeout(() => tilby(R.S), pause(800));
      else robotId = setTimeout(() => kast(R.S), pause(sp.sist ? 900 : 600));
      return;
    }
    const plan = T.velgTrekk(P(sp), sp.tur, sp.rest, sp.niva, tilfeldig);
    if (!plan.length) {
      robotId = setTimeout(() => ferdigTur(R.S), pause(sp.steg.length ? 600 : 1300));
      return;
    }
    robotId = setTimeout(() => {
      robotId = null;
      const m = plan[0];
      flytt(R.S, m.f, m.t, m.d);
      driv();
    }, pause(sp.steg.length ? 620 : 800));
  }

  // ---------- Records ----------
  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }
  function sistTekst(sp) {
    const [a, b] = sp.poeng;
    const stilling = `${a}–${b}`;
    if (sp.modus === "mobil") return a > b ? R.t("Du slo mobilen {stilling} ({niva}).", { stilling, niva: NIVANAVN[sp.niva].toLowerCase() }) : R.t("Mobilen vant {stilling} ({niva}).", { stilling: `${b}–${a}`, niva: NIVANAVN[sp.niva].toLowerCase() });
    const v = a > b ? 0 : 1;
    return R.t("{navn} vant {stilling}.", { navn: R.kutt(navn(sp, v), 16), stilling: `${Math.max(a, b)}–${Math.min(a, b)}` });
  }
  function avsluttKamp(S) {
    const sp = S.spill;
    stoppRobot();
    sp.ferdig = true;
    sp.angre = null;
    const [a, b] = sp.poeng;
    if (a !== b) {
      if (sp.modus === "mobil") {
        const r = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, tap: 0 });
        if (a > b) r.seier++;
        else r.tap++;
        if (a > b) R.merke("klassiker-tavla");
      }
      S.sist = { tekst: sistTekst(sp) };
    }
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.modus === "mobil" ? sp.niva : 0, mal: sp.mal, kube: sp.kube, spill: sp.runde - (sp.resultat ? 0 : 1) });
    R.gaTil("slutt");
  }

  // ---------- Screens ----------
  function dokkHtml(sp) {
    const f = fase(sp);
    const lenker = [];
    const kanAngre = (f === "flytt" && sp.steg.length && !erMaskin(sp, sp.tur) && !ruller) || (f === "slutt" && sp.angre && !sp.ferdig);
    lenker.push(`<button class="lenke" data-h="angre"${kanAngre ? "" : " disabled"}>↶ ${esc(R.t("Angre"))}</button>`);
    // One button and a row of links, so the board keeps its height on the smallest phones.
    let hoved = "";
    if (f === "slutt") hoved = kampVunnet(sp) ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Neste spill"), "neste", { ikon: "🎲" });
    else if (f === "tilbud") {
      if (erMaskin(sp, 1 - sp.tilbud)) hoved = R.ui.knapp(R.t("Mobilen tenker …"), "vent", { av: true, ikon: "🤖" });
      else {
        hoved = R.ui.knapp(R.t("Ta imot – spill om {n}", { n: sp.kubeVerdi * 2 }), "ta");
        lenker.splice(0, 1, R.ui.lenke(R.t("Gi opp ({poeng})", { poeng: R.flertall(sp.kubeVerdi, "poeng", "poeng") }), "slipp"));
      }
    } else if (erMaskin(sp, sp.tur)) {
      hoved = R.ui.knapp(R.t("Mobilen spiller …"), "vent", { av: true, ikon: "🤖" });
      if (!hopp && !R.rolig()) lenker.push(R.ui.lenke(R.t("Hopp over"), "hopp"));
    } else if (f === "kast") {
      hoved = R.ui.knapp(R.t("Kast terningene"), "kast", { ikon: "🎲" });
      if (kanDoble(sp, sp.tur)) lenker.push(R.ui.lenke(R.t("Doble til {n}", { n: sp.kubeVerdi * 2 }), "doble"));
    } else {
      const ferdig = !ruller && !lovlige(sp).length;
      hoved = R.ui.knapp(sp.steg.length || !ferdig ? R.t("Ferdig") : R.t("Videre"), "ferdig", { av: !ferdig, ikon: "✓" });
    }
    lenker.push(R.ui.lenke(R.t("Avslutt"), "avslutt"));
    return R.ui.dokk(hoved, R.ui.lenkerad(...lenker));
  }

  R.start({
    id: "tavla",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, mal: 1, kube: false },
      rekord: {},
      sist: null,
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, mal: 1, kube: false }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!MAL.includes(o.mal)) o.mal = 1;
      o.kube = !!o.kube;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      if (S.sist && typeof S.sist.tekst !== "string") S.sist = null;
      const sp = S.spill;
      if (sp) {
        const ok =
          ["mobil", "to"].includes(sp.modus) && NIVAER.includes(sp.niva) && MAL.includes(sp.mal) &&
          Array.isArray(sp.pos) && T.gyldig(sp.pos) && Array.isArray(sp.poeng) && sp.poeng.length === 2 &&
          [0, 1].includes(sp.tur) && Array.isArray(sp.rest) && Array.isArray(sp.steg) &&
          (sp.kast === null || (Array.isArray(sp.kast) && sp.kast.length === 2 && sp.kast.every((d) => d >= 1 && d <= 6))) &&
          sp.rest.every((d) => Number.isInteger(d) && d >= 1 && d <= 6) && [1, 2, 4, 8, 16, 32, 64].includes(sp.kubeVerdi) && [-1, 0, 1].includes(sp.kubeEier) && [-1, 0, 1].includes(sp.tilbud);
        if (!ok) S.spill = null;
        else if (sp.valgt == null) sp.valgt = -1;
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Flytt alle de 15 brikkene dine rundt brettet og hjem – og ta dem ut før motstanderen gjør det."),
      steg: [
        [R.t("Kast og flytt"), R.t("Flytt én brikke for hver terning, mot hjemmet ditt. Trykk på en brikke og så på et lysende punkt. Like terninger gir fire trekk.")],
        [R.t("Slå ut"), R.t("Du kan ikke lande der motstanderen har to eller flere brikker. Lander du på en brikke som står alene, slås den ut på baren og må begynne på nytt.")],
        [R.t("Ta ut"), R.t("Når alle brikkene dine er i hjemmet (de seks siste punktene), tar du dem ut av brettet. Den som først har tatt ut alle 15, vinner.")],
      ],
      tips: [
        R.t("Du må bruke begge terningene hvis du kan. Går bare én av dem, må du bruke den største."),
        R.t("Står en brikke på baren, må den inn igjen før du flytter noe annet."),
        R.t("Gammon: Har taperen ikke fått ut en eneste brikke, teller seieren dobbelt. Backgammon: Står taperen i tillegg på baren eller i vinnerens hjem, teller den tre ganger."),
        R.t("Doblingskuben: Før du kaster, kan du doble det dere spiller om. Den andre tar imot og får kuben – eller gir opp og taper det som sto."),
        R.t("Crawford-regelen: Når noen mangler ett poeng på å vinne kampen, kan ingen doble i det neste spillet."),
        R.t("Tallet ved hver spiller er pips: hvor langt alle brikkene har igjen. Lavest ligger foran."),
        R.t("Trykket feil? «Angre» tar tilbake ett trekk om gangen, helt til du trykker «Ferdig»."),
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
              slagordHtml: `${esc(R.t("Kast, flytt og slå ut."))}<br><em>${esc(R.t("Først hjem vinner."))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? (sp.mal === 1 ? R.t("Fortsett spillet") : R.t("Fortsett · {stilling}", { stilling: `${sp.poeng[0]}–${sp.poeng[1]}` })) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–2", R.t("spillere")],
                ["3", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) +
            (rek.length || S.sist
              ? `<section class="tv-rekorder" aria-label="${esc(R.t("Mot mobilen"))}">${rek.length ? `<p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="tv-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul>` : ""}${S.sist ? `<p class="tv-sistlinje"><b>${esc(R.t("Sist:"))}</b> ${esc(S.sist.tekst)}</p>` : ""}</section>`
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
          const mot = o.modus === "mobil";
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
                : R.ui.spillere({ min: 2, max: 2, tittel: R.t("Spillerne"), hjelp: R.t("Den første har de hvite brikkene, den andre de svarte.") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Hvor lenge?"))}</h2>
              ${R.ui.seg("mal", MAL.map((m) => [m, MALNAVN[m]]), o.mal, { etikett: R.t("Hvor lenge") })}
              <p class="hjelp">${esc(o.mal === 1 ? R.t("Ett spill – den som først får ut alle brikkene, vinner.") : R.t("Spill flere spill. Den som først når {n} poeng, vinner kampen.", { n: o.mal }))}</p>
            </section>
            ${R.ui.bryter("kube", o.kube, R.t("Doblingskube"), R.t("Doble det dere spiller om før du kaster. Den andre tar imot eller gir opp."))}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🎲" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.mal === 1 ? (S.spill.modus === "mobil" ? R.t("Mot mobilen") : R.t("To spillere")) : R.t("Spill {n}", { n: S.spill.runde })),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const f = fase(sp);
          const tittel = f === "slutt" ? R.t("spillet er ferdig") : erMaskin(sp, sp.tur) ? R.t("mobilen sin tur") : sp.modus === "mobil" ? R.t("din tur") : R.t("{navn} sin tur", { navn: navn(sp, sp.tur) });
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Tavla, spill {n}", { n: sp.runde }) + ": " + tittel)}</h1>
            ${stillingHtml(sp)}
            <p class="tv-melding${f === "slutt" ? " slutt" : f === "tilbud" ? " tilbud" : ""}" role="status">${esc(meldingTekst(sp))}</p>
            <div class="tv-ramme">${brettHtml(sp)}</div>
            ${dokkHtml(sp)}`;
        },
        etter() {
          tilpass();
          R.terninger.koble(BRETT);
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          // Once more when the fonts are in (the first drawing may have measured fallback text).
          if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => R.S && R.S.skjerm === "spill" && tilpass());
          setTimeout(() => R.S && R.S.skjerm === "spill" && tilpass(), 400);
          ruller = false;
          R.holdVaken();
          R.vedForlat(stoppRobot);
          driv();
        },
        ut() {
          stoppRobot();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const [a, b] = sp.poeng;
          const vinner = a === b ? null : a > b ? 0 : 1;
          let tittel;
          if (vinner == null) tittel = R.t("Ingen vinner denne gangen");
          else if (sp.modus === "mobil") tittel = vinner === 0 ? R.t("Du vinner!") : R.t("Mobilen vinner!");
          else tittel = R.t("{navn} vinner!", { navn: navn(sp, vinner) });
          const spilt = sp.runde - (sp.resultat ? 0 : 1);
          const etikett = `${R.flertall(spilt, "spill", "spill")}${sp.modus === "mobil" ? ` · ${NIVANAVN[sp.niva].toLowerCase()}` : ""}`;
          const mobilVant = sp.modus === "mobil" && vinner === 1;
          const tekst = mobilVant ? (sp.niva > 1 ? R.t("Godt kjempa! Prøv igjen – eller velg et lettere nivå.") : R.t("Godt kjempa! Prøv igjen.")) : vinner != null ? R.t("Godt jobba!") : "";
          const rader = [0, 1].map((i) => ({ navn: navn(sp, i), i: erMaskin(sp, i) ? 9 : i, poeng: sp.poeng[i] }));
          const rek = sp.modus === "mobil" ? rekordHtml(S, sp.niva) : "";
          return `
            ${R.ui.banner({ tittel, etikett, tekst, klasse: mobilVant ? "" : "aksent", stemning: mobilVant || vinner == null ? "lei" : "jubel" })}
            ${R.ui.poengliste(rader)}
            ${rek ? `<p class="tv-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "to" ? 2 : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🎲" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
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
          if (sp.modus === "mobil" && b > a) lyd.tap();
          else if (a !== b) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else R.lyd.pling();
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
      endre: () => R.gaTil("oppsett"),
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "to" ? "to" : "mobil";
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 3);
        R.vis();
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = MAL.includes(m) ? m : 1;
        R.vis();
      },
      kube(el, e, S) {
        S.oppsett.kube = !S.oppsett.kube;
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
      vent() {},
      kast(el, e, S) {
        const sp = S.spill;
        if (!sp || erMaskin(sp, sp.tur)) return;
        kast(S);
      },
      doble(el, e, S) {
        const sp = S.spill;
        if (!sp || erMaskin(sp, sp.tur)) return;
        tilby(S);
      },
      ta(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.tilbud < 0 || erMaskin(sp, 1 - sp.tilbud)) return;
        svar(S, true);
      },
      slipp(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.tilbud < 0 || erMaskin(sp, 1 - sp.tilbud)) return;
        svar(S, false);
      },
      hopp(el, e, S) {
        if (!S.spill || !erMaskin(S.spill, S.spill.tur)) return;
        hopp = true;
        el.remove();
        driv();
      },
      punkt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.resultat) return;
        if (!kanFlytte(sp)) {
          if (erMaskin(sp, sp.tur) && !sp.resultat) R.toast(R.t("Vent litt – mobilen spiller"));
          else if (!sp.kast && sp.tilbud < 0) R.toast(R.t("Kast terningene først"));
          return;
        }
        const s = sp.tur;
        const e2 = el.dataset.v === "bar" ? 25 : egen(s, Number(el.dataset.v));
        const steg = lovlige(sp);
        const fra = new Set(steg.map((x) => x.f));
        const valgt = fra.has(sp.valgt) ? sp.valgt : fra.size === 1 ? [...fra][0] : -1;
        if (valgt >= 0 && e2 !== valgt) {
          const mulige = steg.filter((x) => x.f === valgt && x.t === e2).sort((x, y) => x.d - y.d);
          if (mulige.length) return flytt(S, valgt, e2, mulige[0].d);
        }
        if (fra.has(e2)) {
          sp.valgt = sp.valgt === e2 && fra.size > 1 ? -1 : e2;
          R.lyd.klikk();
          R.vibrer(6);
          R.vis();
          return;
        }
        R.lyd.feil();
        R.vibrer(25);
        if (!steg.length) R.toast(sp.steg.length ? R.t("Ferdig – trykk «Ferdig»") : R.t("Ingen lovlige trekk – trykk «Videre»"));
        else if (P(sp)[s * 26 + 25] > 0) R.toast(R.t("Brikken på baren må inn først"));
        else R.toast(valgt >= 0 ? R.t("Dit kan den ikke flytte – velg et lysende punkt") : R.t("Velg en av brikkene som lyser"));
        el.classList.remove("risting");
        void el.offsetWidth;
        el.classList.add("risting");
      },
      ut(el, e, S) {
        const sp = S.spill;
        if (!sp || !kanFlytte(sp)) return;
        const steg = lovlige(sp);
        const fra = new Set(steg.map((x) => x.f));
        const valgt = fra.has(sp.valgt) ? sp.valgt : fra.size === 1 ? [...fra][0] : -1;
        const mulige = steg.filter((x) => x.f === valgt && x.t === 0).sort((x, y) => x.d - y.d);
        if (mulige.length) return flytt(S, valgt, 0, mulige[0].d);
        R.lyd.feil();
        R.toast(T.hjemme(P(sp), sp.tur) ? R.t("Velg først en brikke som kan tas ut") : R.t("Alle brikkene må være hjemme før du kan ta dem ut"));
      },
      ferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || erMaskin(sp, sp.tur)) return;
        ferdigTur(S);
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        if (sp.resultat) return angreResultat(S);
        if (!sp.steg.length || erMaskin(sp, sp.tur) || ruller) return;
        const m = sp.steg.pop();
        const p = P(sp);
        T.angre(p, sp.tur, m.f, m.t, m.slo);
        sp.pos = Array.from(p);
        sp.rest.push(m.d);
        sp.rest.sort((x, y) => y - x);
        sp.valgt = -1;
        R.lyd.snu();
        R.vis();
      },
      neste(el, e, S) {
        nesteParti(S);
      },
      kaaring(el, e, S) {
        if (S.spill && kampVunnet(S.spill) && !S.spill.ferdig) avsluttKamp(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const [a, b] = sp.poeng;
        const stilling = `${a}–${b}`;
        let tekst;
        let linje2;
        if (sp.modus === "mobil") {
          const niva = NIVANAVN[sp.niva].toLowerCase();
          tekst = a > b ? R.t("Jeg slo mobilen i backgammon ({niva}), {stilling}. Klarer du det?", { niva, stilling }) : R.t("Mobilen slo meg i backgammon ({niva}), {stilling}. Klarer du bedre?", { niva, stilling });
          linje2 = R.t("mot mobilen · {niva}", { niva });
        } else {
          const v = a >= b ? 0 : 1;
          tekst = R.t("{navn} vant backgammon {stilling}! Ta et spill du også.", { navn: navn(sp, v), stilling });
          linje2 = R.t("to spillere på én mobil");
        }
        R.del(R.t("Tavla"), tekst, DEL_URL, { kort: { tittel: R.t("Tavla"), linjer: [stilling, linje2] } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        stoppRobot();
        const ferdige = sp.poeng[0] + sp.poeng[1] > 0;
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ferdige ? R.t("Dere går til kåringen med poengene så langt. Spillet som er i gang, teller ikke.") : R.t("Spillet som er i gang, teller ikke. Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return driv();
        if (!ferdige) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });
})();
