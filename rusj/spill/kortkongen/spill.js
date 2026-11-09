/* Kortkongen — «Kabal» (Klondike solitaire) for one player.
   Tap a card to send it to the best place, or drag it. Draw one or three cards, undo without limit,
   hints from a small solver, auto-finish, timer and moves, statistics and a bouncing-card victory.
   The rules engine at the top is pure (no DOM) and is also loaded by test/kortkongen.test.mjs. */
(function () {
  "use strict";

  // ---------- Rules engine ----------
  // A card is a number 0–51: suit = floor(k / 13) (0 spar, 1 hjerter, 2 ruter, 3 kløver),
  // value = k % 13 + 1 (1 = ess … 13 = konge). Hjerter and ruter are red.
  // State: { bunke (stock, top = last), avfall (waste, top = last), vifte (waste cards fanned),
  //          grunn (foundation height per suit), bord (7 columns, bottom first),
  //          skjult (face-down cards at the bottom of each column), modus (draw 1 or 3) }
  // A move: { fra: "s" } (draw / turn the waste) or { fra: "a" | "g" | "b", i, p, til: "g" | "b", j }
  //   fra "a" = top of the waste, "g" = foundation of suit i, "b" = column i from position p.
  const KABAL = (() => {
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    const rod = (k) => {
      const s = (k / 13) | 0;
      return s === 1 || s === 2;
    };

    // The kit's mulberry32, copied so a deal is the same in the browser and in node.
    function tilfeldig(fro) {
      let a = fro >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // The eight ways to rename the suits that keep the colours apart: a solvable deal stays solvable.
    const BYTTER = [
      [0, 1, 2, 3],
      [3, 1, 2, 0],
      [0, 2, 1, 3],
      [3, 2, 1, 0],
      [1, 0, 3, 2],
      [2, 0, 3, 1],
      [1, 3, 0, 2],
      [2, 3, 0, 1],
    ];

    function del(fro, variant, modus) {
      const t = tilfeldig(fro);
      const kort = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) {
        const j = Math.floor(t() * (i + 1));
        [kort[i], kort[j]] = [kort[j], kort[i]];
      }
      const m = BYTTER[(variant || 0) & 7];
      const k2 = kort.map((k) => m[sortAv(k)] * 13 + (k % 13));
      const bord = [];
      let n = 0;
      for (let c = 0; c < 7; c++) {
        bord.push(k2.slice(n, n + c + 1));
        n += c + 1;
      }
      return { bunke: k2.slice(n), avfall: [], vifte: 0, grunn: [0, 0, 0, 0], bord, skjult: [0, 1, 2, 3, 4, 5, 6], modus: modus === 3 ? 3 : 1 };
    }

    const kopi = (st) => ({
      bunke: st.bunke.slice(),
      avfall: st.avfall.slice(),
      vifte: st.vifte,
      grunn: st.grunn.slice(),
      bord: st.bord.map((k) => k.slice()),
      skjult: st.skjult.slice(),
      modus: st.modus,
    });

    // Can card k lie on card under in a column? (under == null: an empty column takes only a king)
    const kanPaBord = (k, under) => (under == null ? verdiAv(k) === 13 : verdiAv(k) === verdiAv(under) - 1 && rod(k) !== rod(under));
    const kanPaGrunn = (st, k) => st.grunn[sortAv(k)] === verdiAv(k) - 1;
    const topp = (liste) => (liste.length ? liste[liste.length - 1] : null);

    // The cards a move lifts from its source, or null when the source can't give them.
    function loft(st, t) {
      if (t.fra === "a") return st.avfall.length ? [topp(st.avfall)] : null;
      if (t.fra === "g") {
        if (!(t.i >= 0 && t.i < 4)) return null;
        const v = st.grunn[t.i];
        return v > 0 ? [t.i * 13 + v - 1] : null;
      }
      if (t.fra === "b") {
        const kol = st.bord[t.i];
        if (!kol || !Number.isInteger(t.p) || t.p < st.skjult[t.i] || t.p >= kol.length) return null;
        const rekke = kol.slice(t.p);
        for (let n = 1; n < rekke.length; n++) if (!kanPaBord(rekke[n], rekke[n - 1])) return null;
        return rekke;
      }
      return null;
    }

    function lovlig(st, t) {
      if (!t) return false;
      if (t.fra === "s") return st.bunke.length > 0 || st.avfall.length > 0;
      if (!["a", "g", "b"].includes(t.fra)) return false;
      const rekke = loft(st, t);
      if (!rekke) return false;
      if (t.til === "g") return t.fra !== "g" && rekke.length === 1 && t.j === sortAv(rekke[0]) && kanPaGrunn(st, rekke[0]);
      if (t.til === "b") {
        if (!(Number.isInteger(t.j) && t.j >= 0 && t.j < 7) || (t.fra === "b" && t.j === t.i)) return false;
        const kol = st.bord[t.j];
        if (kol.length && kol.length <= st.skjult[t.j]) return false; // never onto a face-down card
        return kanPaBord(rekke[0], topp(kol));
      }
      return false;
    }

    // Carries out a legal move (check with lovlig first). Returns { snudd: true } when a face-down card was turned.
    function utfor(st, t) {
      if (t.fra === "s") {
        if (st.bunke.length) {
          const n = Math.min(st.modus, st.bunke.length);
          for (let k = 0; k < n; k++) st.avfall.push(st.bunke.pop());
          st.vifte = n;
        } else {
          st.bunke = st.avfall.reverse();
          st.avfall = [];
          st.vifte = 0;
        }
        return { snudd: false };
      }
      const rekke = loft(st, t);
      if (t.fra === "a") {
        st.avfall.pop();
        st.vifte = st.avfall.length ? Math.max(1, st.vifte - 1) : 0;
      } else if (t.fra === "g") st.grunn[t.i] -= 1;
      else st.bord[t.i].length = t.p;
      let snudd = false;
      if (t.fra === "b") {
        const kol = st.bord[t.i];
        if (kol.length && kol.length <= st.skjult[t.i]) {
          st.skjult[t.i] = kol.length - 1;
          snudd = true;
        }
      }
      if (t.til === "g") st.grunn[t.j] += 1;
      else st.bord[t.j].push(...rekke);
      return { snudd };
    }

    const vunnet = (st) => st.grunn.every((v) => v === 13);
    const alleOppe = (st) => st.skjult.every((n) => n === 0);

    // Compact text form of a position (for undo and saving): every card is one letter.
    const TEGN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const tilTegn = (liste) => liste.map((k) => TEGN[k]).join("");
    const fraTegn = (s) => Array.from(s, (c) => TEGN.indexOf(c));
    const kode = (st) => [tilTegn(st.bunke), tilTegn(st.avfall), st.grunn.join(","), st.vifte, st.skjult.join(""), st.bord.map(tilTegn).join(","), st.modus].join(".");
    function fraKode(s) {
      const d = String(s).split(".");
      if (d.length !== 7) return null;
      const st = {
        bunke: fraTegn(d[0]),
        avfall: fraTegn(d[1]),
        grunn: d[2].split(",").map(Number),
        vifte: Number(d[3]),
        skjult: Array.from(d[4], Number),
        bord: d[5].split(",").map(fraTegn),
        modus: Number(d[6]) === 3 ? 3 : 1,
      };
      return gyldig(st) ? st : null;
    }

    // A position is sound: 52 different cards, foundations built from the ace, face-up cards in order.
    function gyldig(st) {
      try {
        if (st.bord.length !== 7 || st.skjult.length !== 7 || st.grunn.length !== 4) return false;
        const sett = new Set();
        const legg = (k) => {
          if (!(Number.isInteger(k) && k >= 0 && k < 52) || sett.has(k)) throw new Error("kort");
          sett.add(k);
        };
        st.bunke.forEach(legg);
        st.avfall.forEach(legg);
        st.grunn.forEach((v, s) => {
          if (!(Number.isInteger(v) && v >= 0 && v <= 13)) throw new Error("grunn");
          for (let n = 0; n < v; n++) legg(s * 13 + n);
        });
        st.bord.forEach((kol, i) => {
          kol.forEach(legg);
          const h = st.skjult[i];
          if (!(Number.isInteger(h) && h >= 0 && (kol.length ? h < kol.length : h === 0))) throw new Error("skjult");
          for (let n = h + 1; n < kol.length; n++) if (!kanPaBord(kol[n], kol[n - 1])) throw new Error("rekke");
        });
        return sett.size === 52 && st.vifte >= 0 && st.vifte <= 3;
      } catch (e) {
        return false;
      }
    }

    // ---------- Where should a tapped card go? ----------
    // fra: { fra: "a" } | { fra: "g", i } | { fra: "b", i, p }. Foundation first (single cards),
    // then a column where it builds, then an empty column for a king that has something under it.
    function besteMal(st, fra) {
      const rekke = loft(st, fra);
      if (!rekke) return null;
      const forste = rekke[0];
      if (rekke.length === 1 && fra.fra !== "g") {
        const t = { ...fra, til: "g", j: sortAv(forste) };
        if (lovlig(st, t)) return t;
      }
      let tom = null;
      for (let j = 0; j < 7; j++) {
        if (fra.fra === "b" && j === fra.i) continue;
        const t = { ...fra, til: "b", j };
        if (!lovlig(st, t)) continue;
        if (st.bord[j].length) return t;
        if (tom == null) tom = t;
      }
      // A king alone in its column gains nothing from an empty column.
      if (tom && !(fra.fra === "b" && fra.p === 0)) return tom;
      return null;
    }

    // Which talon cards can be played without changing anything else? The talon in drawing order has
    // L cards, the first p are in the waste. Draw 1: all of them (the stock can be turned forever).
    // Draw 3: the waste top, every third card further on in this pass, and every third after a turn.
    function naabare(L, p, modus) {
      if (!L) return [];
      if (modus !== 3) return Array.from({ length: L }, (_, i) => i);
      const ut = new Set();
      if (p > 0) ut.add(p - 1);
      for (const fra of [p, 0]) {
        for (let q = fra + 2; ; q += 3) {
          if (q >= L - 1) {
            ut.add(L - 1);
            break;
          }
          ut.add(q);
        }
      }
      return Array.from(ut);
    }

    // ---------- Solver ----------
    // Depth-first search with sensible move ordering, safe automatic foundation moves and a memory of
    // positions already seen. Draw 1: every stock card can be reached. Draw 3: only every third card
    // in the current pass (and in the next ones). Returns the list of moves or null within `maks` nodes.
    // Solver moves: { t: "gb", i } column→foundation, { t: "tg", q } talon→foundation,
    // { t: "bb", i, p, j } column→column, { t: "tb", q, j } talon→column, { t: "gb2", s, j } foundation→column.
    function los(st0, maks) {
      maks = maks || 60000;
      const modus = st0.modus;
      const start = {
        D: st0.avfall.concat(st0.bunke.slice().reverse()), // the talon in drawing order
        p: st0.avfall.length, // cards of D in the waste (top = D[p - 1])
        grunn: st0.grunn.slice(),
        bord: st0.bord.map((k) => k.slice()),
        skjult: st0.skjult.slice(),
      };
      const sett = new Set();
      const sti = [];
      let noder = 0;
      let losning = null;
      const kopiN = (n) => ({ D: n.D.slice(), p: n.p, grunn: n.grunn.slice(), bord: n.bord.map((k) => k.slice()), skjult: n.skjult.slice() });

      function nokkel(n) {
        const kol = n.bord.map((k, i) => n.skjult[i] + tilTegn(k)).sort().join(",");
        const talong = modus === 1 ? tilTegn(n.D.slice().sort((a, b) => a - b)) : tilTegn(n.D) + n.p;
        return n.grunn.join("") + "|" + talong + "|" + kol;
      }

      const nabare = (n) => naabare(n.D.length, n.p, modus);

      const trygg = (n, k) => {
        const v = verdiAv(k);
        if (v <= 2) return true;
        const mot = rod(k) ? [0, 3] : [1, 2];
        return n.grunn[mot[0]] >= v - 1 && n.grunn[mot[1]] >= v - 1;
      };

      function taFraTalong(n, q) {
        const k = n.D[q];
        n.D.splice(q, 1);
        n.p = q;
        return k;
      }
      function fjernFraKolonne(n, i, p) {
        n.bord[i].length = p;
        if (n.bord[i].length && n.bord[i].length <= n.skjult[i]) n.skjult[i] = n.bord[i].length - 1;
      }

      // Safe foundation moves, done at once (they never hurt). Returns how many were done.
      function auto(n) {
        let antall = 0;
        let igjen = true;
        while (igjen) {
          igjen = false;
          for (let i = 0; i < 7; i++) {
            const kol = n.bord[i];
            if (!kol.length) continue;
            const k = kol[kol.length - 1];
            if (n.grunn[sortAv(k)] === verdiAv(k) - 1 && trygg(n, k)) {
              fjernFraKolonne(n, i, kol.length - 1);
              n.grunn[sortAv(k)] += 1;
              sti.push({ t: "gb", i });
              antall++;
              igjen = true;
            }
          }
          const plasser = modus === 1 ? nabare(n) : n.p > 0 ? [n.p - 1] : [];
          for (const q of plasser) {
            const k = n.D[q];
            if (n.grunn[sortAv(k)] === verdiAv(k) - 1 && trygg(n, k)) {
              taFraTalong(n, q);
              n.grunn[sortAv(k)] += 1;
              sti.push({ t: "tg", q });
              antall++;
              igjen = true;
              break;
            }
          }
        }
        return antall;
      }

      function trekkListe(n) {
        const ut = [];
        const nab = nabare(n);
        // Is there a king that could use an empty column? (in the talon, or with cards under it)
        const kongeVenter =
          nab.some((q) => verdiAv(n.D[q]) === 13) || n.bord.some((kol, i) => kol.some((k, p) => p >= n.skjult[i] && p > 0 && verdiAv(k) === 13));
        for (let i = 0; i < 7; i++) {
          const kol = n.bord[i];
          if (!kol.length) continue;
          const k = kol[kol.length - 1];
          if (n.grunn[sortAv(k)] === verdiAv(k) - 1) ut.push({ t: "gb", i, pri: 100 + (kol.length - 1 === n.skjult[i] && n.skjult[i] > 0 ? 20 : 0) });
        }
        for (const q of nab) {
          const k = n.D[q];
          if (n.grunn[sortAv(k)] === verdiAv(k) - 1) ut.push({ t: "tg", q, pri: 70 });
        }
        for (let i = 0; i < 7; i++) {
          const kol = n.bord[i];
          const h = n.skjult[i];
          for (let p = h; p < kol.length; p++) {
            const k = kol[p];
            const hel = p === h; // the whole face-up run
            if (!hel) {
              // Splitting a run only helps when the card left behind can go home.
              const under = kol[p - 1];
              if (n.grunn[sortAv(under)] !== verdiAv(under) - 1) continue;
            }
            for (let j = 0; j < 7; j++) {
              if (j === i) continue;
              const mal = n.bord[j];
              if (!kanPaBord(k, mal.length ? mal[mal.length - 1] : null)) continue;
              if (!mal.length) {
                if (p === 0) continue; // king from an empty base to an empty base
                if (n.bord.findIndex((x) => !x.length) !== j) continue; // all empty columns are alike
              } else if (hel && p === 0 && !kongeVenter) continue; // emptying a column nobody needs
              ut.push({ t: "bb", i, p, j, pri: hel && h > 0 ? 80 + h : hel && p === 0 ? 40 : 60 });
            }
          }
        }
        for (const q of nab) {
          const k = n.D[q];
          let tomBrukt = false;
          for (let j = 0; j < 7; j++) {
            const mal = n.bord[j];
            if (!kanPaBord(k, mal.length ? mal[mal.length - 1] : null)) continue;
            if (!mal.length) {
              if (tomBrukt) continue;
              tomBrukt = true;
            }
            ut.push({ t: "tb", q, j, pri: 50 + (verdiAv(k) === 13 ? 5 : 0) });
          }
        }
        // Foundation back to a column: only when some reachable card could then lie on it.
        for (let s = 0; s < 4; s++) {
          const v = n.grunn[s];
          if (v < 3) continue;
          const k = s * 13 + v - 1;
          const trengs = nab.some((q) => verdiAv(n.D[q]) === v - 1 && rod(n.D[q]) !== rod(k));
          if (!trengs) continue;
          for (let j = 0; j < 7; j++) {
            const mal = n.bord[j];
            if (mal.length && kanPaBord(k, mal[mal.length - 1])) ut.push({ t: "gb2", s, j, pri: 10 });
          }
        }
        return ut.sort((a, b) => b.pri - a.pri);
      }

      function bruk(n, m) {
        if (m.t === "gb") {
          const kol = n.bord[m.i];
          const k = kol[kol.length - 1];
          fjernFraKolonne(n, m.i, kol.length - 1);
          n.grunn[sortAv(k)] += 1;
        } else if (m.t === "tg") {
          const k = taFraTalong(n, m.q);
          n.grunn[sortAv(k)] += 1;
        } else if (m.t === "bb") {
          const rekke = n.bord[m.i].slice(m.p);
          fjernFraKolonne(n, m.i, m.p);
          n.bord[m.j].push(...rekke);
        } else if (m.t === "tb") {
          n.bord[m.j].push(taFraTalong(n, m.q));
        } else if (m.t === "gb2") {
          n.grunn[m.s] -= 1;
          n.bord[m.j].push(m.s * 13 + n.grunn[m.s]);
        }
      }

      function dfs(n) {
        if (++noder > maks) return false;
        const auto0 = auto(n);
        if (n.grunn.every((v) => v === 13) || (!n.D.length && n.skjult.every((h) => h === 0))) {
          losning = sti.slice();
          return true;
        }
        const k = nokkel(n);
        if (!sett.has(k)) {
          sett.add(k);
          for (const m of trekkListe(n)) {
            const c = kopiN(n);
            bruk(c, m);
            sti.push(m);
            if (dfs(c)) return true;
            sti.pop();
            if (noder > maks) break;
          }
        }
        sti.length -= auto0;
        return false;
      }

      dfs(kopiN(start));
      return losning ? { trekk: losning, noder } : { trekk: null, noder };
    }

    // The first step of a solver move, said as a UI move: draw from the stock, or a real move.
    function forsteSteg(st, m) {
      const D = st.avfall.concat(st.bunke.slice().reverse());
      const p = st.avfall.length;
      if (m.t === "tg" || m.t === "tb") {
        if (m.q !== p - 1) return { fra: "s" };
        const k = D[m.q];
        return m.t === "tg" ? { fra: "a", til: "g", j: sortAv(k) } : { fra: "a", til: "b", j: m.j };
      }
      if (m.t === "gb") {
        const kol = st.bord[m.i];
        return { fra: "b", i: m.i, p: kol.length - 1, til: "g", j: sortAv(kol[kol.length - 1]) };
      }
      if (m.t === "bb") return { fra: "b", i: m.i, p: m.p, til: "b", j: m.j };
      if (m.t === "gb2") return { fra: "g", i: m.s, til: "b", j: m.j };
      return null;
    }

    // Column moves that change something: uncover a face-down card, free a column for a waiting
    // king, or let the card left behind go home. (Shuffling a run between two equal places doesn't.)
    function nyttigeFlytt(st) {
      const ut = [];
      const D = st.avfall.concat(st.bunke.slice().reverse());
      const kongeVenter =
        naabare(D.length, st.avfall.length, st.modus).some((q) => verdiAv(D[q]) === 13) ||
        st.bord.some((kol, i) => st.skjult[i] > 0 && kol.length > st.skjult[i] && verdiAv(kol[st.skjult[i]]) === 13);
      for (let i = 0; i < 7; i++) {
        const kol = st.bord[i];
        const h = st.skjult[i];
        for (let p = h; p < kol.length; p++) {
          const nyttig = p === h ? h > 0 || kongeVenter : kanPaGrunn(st, kol[p - 1]);
          if (!nyttig) continue;
          for (let j = 0; j < 7; j++) {
            const t = { fra: "b", i, p, til: "b", j };
            if (!lovlig(st, t)) continue;
            if (!st.bord[j].length && p === 0) continue;
            ut.push({ t, skjult: p === h ? h : -1 });
          }
        }
      }
      return ut;
    }

    // A quick, sensible hint without searching: home, uncover, waste, draw.
    function enkeltHint(st) {
      for (let i = 0; i < 7; i++) {
        const kol = st.bord[i];
        if (!kol.length) continue;
        const t = { fra: "b", i, p: kol.length - 1, til: "g", j: sortAv(topp(kol)) };
        if (lovlig(st, t)) return t;
      }
      if (st.avfall.length) {
        const t = { fra: "a", til: "g", j: sortAv(topp(st.avfall)) };
        if (lovlig(st, t)) return t;
      }
      const flytt = nyttigeFlytt(st).sort((a, b) => b.skjult - a.skjult);
      if (flytt.length && flytt[0].skjult > 0) return flytt[0].t;
      if (st.avfall.length) {
        const t = besteMal(st, { fra: "a" });
        if (t) return t;
      }
      if (flytt.length) return flytt[0].t;
      if (st.bunke.length || st.avfall.length) return { fra: "s" };
      return null;
    }

    // Has the game run dry? No useful column move, nothing can go home, no talon card fits anywhere.
    function fast(st) {
      if (vunnet(st)) return false;
      const D = st.avfall.concat(st.bunke.slice().reverse());
      for (const q of naabare(D.length, st.avfall.length, st.modus)) {
        const k = D[q];
        if (kanPaGrunn(st, k)) return false;
        for (let j = 0; j < 7; j++) if (kanPaBord(k, topp(st.bord[j]))) return false;
      }
      for (let i = 0; i < 7; i++) if (st.bord[i].length && kanPaGrunn(st, topp(st.bord[i]))) return false;
      return nyttigeFlytt(st).length === 0;
    }

    return { naabare, nyttigeFlytt, sortAv, verdiAv, rod, tilfeldig, del, kopi, kanPaBord, kanPaGrunn, loft, lovlig, utfor, vunnet, alleOppe, kode, fraKode, gyldig, besteMal, los, forsteSteg, enkeltHint, fast };
  })();

  // node:test loads this file without the kit: hand over the rules and stop.
  if (typeof window === "undefined" || !window.Rusj) {
    (typeof globalThis !== "undefined" ? globalThis : this).KortkongenRegler = KABAL;
    return;
  }

  const R = window.Rusj;
  const esc = R.esc;
  const DATA = window.RUSJ_DATA || {};
  const LOSBARE = DATA.losbare || { tre: [], en: [] };

  // ---------- Playing cards ----------
  // The same card look in Kortkongen, Bussen and Pyramiden (copied, the games share no files).
  // A card is 0–51: suit = floor(k / 13) (0 spar, 1 hjerter, 2 ruter, 3 kløver), value = k % 13 + 1.
  // KORT.html(k, { opp, stor, klasse, stil, attr, tag }) gives a flippable card; the face is an SVG
  // that scales with the card's width (--kb). "stor" = classic face with pips and portraits; without
  // it the compact face for small cards: a big index on top, one big symbol below.
  const KORT = (() => {
    const SORTER = [
      { navn: "spar", rod: false },
      { navn: "hjerter", rod: true },
      { navn: "ruter", rod: true },
      { navn: "kløver", rod: false },
    ];
    const BOKSTAV = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const VERDINAVN = ["", "ess", "2", "3", "4", "5", "6", "7", "8", "9", "10", "knekt", "dame", "konge"];
    // «en 7-er», «et ess», «en dame»: for questions like «Har noen en 7-er?»
    const MED_ARTIKKEL = ["", "et ess", "en 2-er", "en 3-er", "en 4-er", "en 5-er", "en 6-er", "en 7-er", "en 8-er", "en 9-er", "en 10-er", "en knekt", "en dame", "en konge"];
    // Suit outlines in a 100 × 100 box. Every part runs clockwise, so they fill the same everywhere.
    const FORM = [
      "M50 6C62 24 92 38 92 62C92 76 81 84 70 84C62 84 56 80 53 74C54 83 58 89 66 95L34 95C42 89 46 83 47 74C44 80 38 84 30 84C19 84 8 76 8 62C8 38 38 24 50 6Z",
      "M50 90C47 87 8 62 8 34C8 19 19 9 32 9C40 9 46 13 50 20C54 13 60 9 68 9C81 9 92 19 92 34C92 62 53 87 50 90Z",
      "M50 5C58 20 70 36 86 50C70 64 58 80 50 95C42 80 30 64 14 50C30 36 42 20 50 5Z",
      "M31 29A19 19 0 1 1 69 29A19 19 0 1 1 31 29ZM10 59A19 19 0 1 1 48 59A19 19 0 1 1 10 59ZM52 59A19 19 0 1 1 90 59A19 19 0 1 1 52 59ZM38 40L62 40L62 64L38 64ZM46 62L54 62C54 78 58 87 67 95L33 95C42 87 46 78 46 62Z",
    ];
    const ROD = "#dc2440";
    const SVART = "#1b1230";
    const BLEKK = "#1b1230";
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    const erRod = (k) => SORTER[sortAv(k)].rod;
    const farge = (k) => (erRod(k) ? ROD : SVART);
    const navn = (k) => `${SORTER[sortAv(k)].navn} ${VERDINAVN[verdiAv(k)]}`;
    const Navn = (k) => navn(k).charAt(0).toUpperCase() + navn(k).slice(1);

    // A suit symbol of size str with its top-left corner at (x, y); upside down when snu.
    const symbol = (s, x, y, str, snu) =>
      `<path d="${FORM[s]}" transform="${snu ? `rotate(180 ${x + str / 2} ${y + str / 2}) ` : ""}translate(${x} ${y}) scale(${str / 100})"/>`;

    // Court portraits in a 100 × 100 box: konge (crown and beard), dame (hair and tiara), knekt (cap and feather).
    function portrett(v, f) {
      const strek = `stroke="${BLEKK}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"`;
      const gull = "#ffc93c";
      const kropp = `<path d="M13 100C13 80 30 70 50 70C70 70 87 80 87 100Z" fill="${f}" ${strek}/><path d="M42 72L50 84L58 72" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      const hode = `<circle cx="50" cy="50" r="20" fill="#ffd9b6" ${strek}/>`;
      const ansikt = `<circle cx="43" cy="49" r="2.7" fill="${BLEKK}"/><circle cx="57" cy="49" r="2.7" fill="${BLEKK}"/><circle cx="38.5" cy="56" r="3.6" fill="#ff7f97" opacity=".55"/><circle cx="61.5" cy="56" r="3.6" fill="#ff7f97" opacity=".55"/>`;
      const smil = `<path d="M44.5 57.5Q50 62.5 55.5 57.5" fill="none" stroke="${BLEKK}" stroke-width="2.6" stroke-linecap="round"/>`;
      if (v === 13)
        return `${kropp}${hode}<path d="M33 55C33 71 42 79 50 79C58 79 67 71 67 55C63 62 57 64 50 64C43 64 37 62 33 55Z" fill="${f}" ${strek}/>${ansikt}<path d="M44 58Q50 61 56 58" fill="none" stroke="${BLEKK}" stroke-width="2.6" stroke-linecap="round"/><path d="M30 35L31 14L41 25L50 9L59 25L69 14L70 35Z" fill="${gull}" ${strek}/><circle cx="50" cy="27" r="3" fill="#fff"/>`;
      if (v === 12)
        return `<path d="M27 54C25 31 35 22 50 22C65 22 75 31 73 54C73 66 77 73 82 80L18 80C23 73 27 66 27 54Z" fill="${f}" ${strek}/>${kropp}${hode}${ansikt}${smil}<path d="M35 33L39 22L45 29L50 17L55 29L61 22L65 33Z" fill="${gull}" ${strek}/>`;
      return `${kropp}${hode}${ansikt}${smil}<path d="M28 42C26 27 38 21 51 21C65 21 76 27 76 39C67 33 42 34 28 42Z" fill="${f}" ${strek}/><path d="M65 27C70 15 80 9 92 6C89 16 82 25 70 31Z" fill="${gull}" ${strek}/>`;
    }

    // Classic positions of the pips (centres in a 100 × 140 card); pips below the middle are upside down.
    const PL = 35;
    const PM = 50;
    const PH = 65;
    const PIPS = {
      2: [[PM, 30], [PM, 110]],
      3: [[PM, 30], [PM, 70], [PM, 110]],
      4: [[PL, 30], [PH, 30], [PL, 110], [PH, 110]],
      5: [[PL, 30], [PH, 30], [PM, 70], [PL, 110], [PH, 110]],
      6: [[PL, 30], [PH, 30], [PL, 70], [PH, 70], [PL, 110], [PH, 110]],
      7: [[PL, 30], [PH, 30], [PM, 50], [PL, 70], [PH, 70], [PL, 110], [PH, 110]],
      8: [[PL, 30], [PH, 30], [PM, 50], [PL, 70], [PH, 70], [PM, 90], [PL, 110], [PH, 110]],
      9: [[PL, 30], [PH, 30], [PL, 56.7], [PH, 56.7], [PM, 70], [PL, 83.3], [PH, 83.3], [PL, 110], [PH, 110]],
      10: [[PL, 30], [PH, 30], [PM, 43.3], [PL, 56.7], [PH, 56.7], [PL, 83.3], [PH, 83.3], [PM, 96.7], [PL, 110], [PH, 110]],
    };

    const cache = {};
    function svg(k, stor) {
      const nokkel = (stor ? "s" : "l") + k;
      if (cache[nokkel]) return cache[nokkel];
      const s = sortAv(k);
      const v = verdiAv(k);
      const f = farge(k);
      const b = BOKSTAV[v];
      let inni = "";
      if (stor) {
        const hjorne = `<text x="12" y="22" text-anchor="middle" font-size="${v === 10 ? 16 : 19}" letter-spacing="${v === 10 ? -1.4 : 0}">${b}</text>${symbol(s, 5.5, 26, 13)}`;
        inni = `<g fill="${f}">${hjorne}<g transform="rotate(180 50 70)">${hjorne}</g>`;
        if (v === 1) inni += symbol(s, 24, 44, 52);
        else if (v <= 10) inni += PIPS[v].map(([x, y]) => symbol(s, x - 8, y - 8, 16, y > 70)).join("");
        inni += "</g>";
        if (v > 10)
          inni += `<rect x="23" y="12" width="54" height="116" rx="7" fill="${f}" fill-opacity=".07" stroke="${f}" stroke-width="1.6"/><g fill="${f}">${symbol(s, 27, 16, 10)}${symbol(s, 63, 114, 10, true)}</g><g transform="translate(20 40) scale(.6)">${portrett(v, f)}</g>`;
      } else {
        inni = `<g fill="${f}"><text x="${v === 10 ? 5 : 8}" y="35" font-size="37" letter-spacing="${v === 10 ? -2.5 : 0}">${b}</text>${symbol(s, 65, 9, 26)}`;
        if (v === 1) inni += symbol(s, 20, 50, 60);
        else if (v <= 10) inni += symbol(s, 27, 58, 46);
        inni += "</g>";
        if (v > 10) inni += `<g transform="translate(17 52) scale(.66)">${portrett(v, f)}</g>`;
      }
      cache[nokkel] = `<svg class="sk-ansikt" viewBox="0 0 100 140" aria-hidden="true" focusable="false">${inni}</svg>`;
      return cache[nokkel];
    }

    // The face as a standalone picture (for drawing on a canvas): paper, rim, fonts written out.
    function bilde(k, stor) {
      const inni = svg(k, stor).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" width="200" height="280"><rect x=".8" y=".8" width="98.4" height="138.4" rx="10" fill="#fffaf1" stroke="#1b1230" stroke-opacity=".22" stroke-width="1.6"/><g font-family="ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', Nunito, system-ui, sans-serif" font-weight="900">${inni}</g></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    }

    // o: { opp (face up), stor, klasse, stil (inline style), attr (extra attributes), tag ("span" | "button") }
    function html(k, o = {}) {
      const tag = o.tag || "span";
      return `<${tag} class="sk-kort${o.stor ? " sk-stor" : ""}${o.opp ? " sk-opp" : ""}${o.klasse ? " " + o.klasse : ""}"${o.stil ? ` style="${o.stil}"` : ""}${o.attr || ""}><span class="sk-indre"><span class="sk-side sk-bak"></span><span class="sk-side sk-for">${k == null ? "" : svg(k, o.stor)}</span></span></${tag}>`;
    }

    return { SORTER, BOKSTAV, VERDINAVN, MED_ARTIKKEL, FORM, ROD, SVART, sortAv, verdiAv, erRod, farge, navn, Navn, svg, bilde, html, symbol };
  })();

  // ---------- Game state ----------

  const MODUS = {
    1: { navn: "Ett kort", kort: "ett kort", tekst: "Trekk ett kort fra bunken. Roligere – flere kabaler går opp." },
    3: { navn: "Tre kort", kort: "tre kort", tekst: "Trekk tre kort om gangen. Klassisk og mer vrient." },
  };
  const MAKS_ANGRE = 1500;
  const tomStat = () => ({ spilt: 0, vunnet: 0, rekke: 0, besteRekke: 0, besteTid: 0, faerrest: 0 });
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  let H; // the actions, so one can call another
  let st = null; // the position being played (parsed from S.spill.kode)
  let L = null; // board measurements
  let laast = false; // dealing, auto-finish or victory: no input
  let klokkeFra = null; // performance.now() when the clock last started
  let nyDeling = false; // deal with an animation on the next draw of the board
  let hintId = null;
  let fastVist = null; // the position where «no more moves» was last shown
  let nettoppSnudd = { k: -1, tid: -1e9 }; // the card a move just turned face up
  const forFersk = (k) => k === nettoppSnudd.k && performance.now() - nettoppSnudd.tid < 380;

  const tidMs = (sp) => sp.tid + (klokkeFra != null ? performance.now() - klokkeFra : 0);
  const visTid = (ms) => R.formaterTid(Math.floor(ms / 1000));
  function startKlokke(S) {
    const sp = S && S.spill;
    if (!sp || sp.ferdig || !sp.startet || klokkeFra != null || document.hidden || S.skjerm !== "spill") return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && S.spill;
    if (sp && klokkeFra != null) sp.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }

  // A new deal. «Bare løsbare»: a deal from the list the solver has proven (in one of eight suit
  // swaps), without repeats on this phone. Otherwise any random deal.
  function nyttSpill(S, samme) {
    const o = S.oppsett;
    let fro;
    let variant = 0;
    let losbar = false;
    if (samme && S.spill) {
      fro = S.spill.fro;
      variant = S.spill.variant;
      losbar = S.spill.losbar;
    } else if (o.losbar) {
      const liste = o.modus === 3 ? LOSBARE.tre : LOSBARE.tre.concat(LOSBARE.en);
      if (liste.length) {
        const i = R.kortstokk(o.modus === 3 ? "losbare-tre" : "losbare-en", liste.length).neste();
        fro = liste[Math.max(0, i)];
        variant = R.heltall(0, 7);
        losbar = true;
      }
    }
    if (fro == null) fro = R.nyttFro();
    const modus = samme && S.spill ? S.spill.modus : o.modus;
    st = KABAL.del(fro, variant, modus);
    const kode = KABAL.kode(st);
    S.spill = { fro, variant, modus, losbar, kode, start: kode, angre: [], trekk: 0, tid: 0, hint: 0, startet: false, ferdig: false, vunnet: false, talt: false, resultat: null };
    klokkeFra = null;
    nyDeling = true;
    fastVist = null;
    R.statistikk("start", { modus: modus === 3 ? "tre" : "en", losbar });
  }

  // Count a game in the statistics (once): a win, or a started game that was given up.
  function registrer(S, vant) {
    const sp = S.spill;
    if (!sp || sp.talt || (!vant && !sp.startet)) return null;
    sp.talt = true;
    const s = (S.stat[sp.modus] = Object.assign(tomStat(), S.stat[sp.modus] || {}));
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const res = { vunnet: vant, sek, trekk: sp.trekk, hjem: st ? st.grunn.reduce((a, b) => a + b, 0) : 0, nyTid: false, nyTrekk: false, forrigeTid: s.besteTid, forrigeTrekk: s.faerrest };
    s.spilt += 1;
    if (vant) {
      s.vunnet += 1;
      s.rekke += 1;
      s.besteRekke = Math.max(s.besteRekke, s.rekke);
      res.nyTid = !!s.besteTid && sek < s.besteTid;
      res.nyTrekk = !!s.faerrest && sp.trekk < s.faerrest;
      s.besteTid = s.besteTid ? Math.min(s.besteTid, sek) : sek;
      s.faerrest = s.faerrest ? Math.min(s.faerrest, sp.trekk) : sp.trekk;
    } else s.rekke = 0;
    res.rekke = s.rekke;
    sp.resultat = res;
    R.statistikk("ferdig", { vunnet: vant, sek, trekk: sp.trekk, modus: sp.modus === 3 ? "tre" : "en", hint: sp.hint });
    return res;
  }

  // ---------- Board measurements and positions ----------

  function maal() {
    const brett = R.$("#kk-brett");
    if (!brett) return null;
    const W = brett.clientWidth;
    const topp = brett.getBoundingClientRect().top + window.scrollY;
    const skjerm = R.$("#skjerm");
    const mellom = skjerm ? parseFloat(getComputedStyle(skjerm).rowGap) || 0 : 0;
    const dokk = R.$("#skjerm .dokk");
    const H = Math.max(200, Math.floor(window.innerHeight - topp - mellom - (dokk ? dokk.offsetHeight : 0) - 2));
    const gap = W < 330 ? 4 : W < 430 ? 5 : 8;
    // As wide as the screen allows, but not so tall that a long column can't fit (landscape phones).
    const fraHoyde = Math.floor((H - 18) / 4.75 / 1.4);
    const cw = Math.max(26, Math.min(Math.floor((W - gap * 6) / 7), fraHoyde, 104));
    const ch = Math.round(cw * 1.4);
    const rad = Math.max(8, Math.round(ch * 0.15));
    const venstre = Math.floor((W - (cw * 7 + gap * 6)) / 2);
    return { W, H, cw, ch, gap, x: Array.from({ length: 7 }, (_, i) => venstre + i * (cw + gap)), yBord: ch + rad };
  }

  // Steps down a column: face-down cards close together, face-up cards far enough apart to read the
  // index; squeezed when a long column wouldn't fit above the dock.
  function steg(antall, skjult) {
    const plass = L.H - L.yBord;
    const oppe = Math.max(0, antall - skjult - 1);
    const passer = (dn, opp) => skjult * dn + oppe * opp + L.ch <= plass;
    let dn = Math.max(4, Math.round(L.ch * 0.12));
    let opp = Math.round(L.ch * 0.3);
    if (passer(dn, opp)) return { dn, opp };
    // First the face-down cards (a sliver is enough), then the face-up ones down to a fully readable
    // index, and only as a last resort a little tighter still.
    if (skjult) dn = Math.max(3, Math.floor((plass - L.ch - oppe * opp) / skjult));
    if (passer(dn, opp) || !oppe) return { dn, opp };
    opp = Math.max(Math.ceil(L.ch * 0.26), Math.floor((plass - L.ch - skjult * dn) / oppe));
    if (passer(dn, opp)) return { dn, opp };
    opp = Math.max(Math.round(L.ch * 0.19), Math.floor((plass - L.ch - skjult * dn) / oppe));
    return { dn, opp };
  }

  // Where every card lies now: { x, y, z, opp (face up), aktiv (can be picked up), hvor }
  function posisjoner() {
    const ut = new Array(52);
    const { cw, x, yBord } = L;
    st.bunke.forEach((k, n) => (ut[k] = { x: x[6], y: 0, z: 10 + n, opp: false, aktiv: false, hvor: "bunke" }));
    const vis = st.avfall.length ? Math.min(3, Math.max(1, st.vifte), st.avfall.length) : 0;
    const forste = st.avfall.length - vis;
    const vifte = Math.round(cw * 0.34);
    st.avfall.forEach((k, n) => (ut[k] = { x: x[4] + Math.max(0, n - forste) * vifte, y: 0, z: 10 + n, opp: true, aktiv: n === st.avfall.length - 1, hvor: "avfall" }));
    st.grunn.forEach((v, s) => {
      for (let n = 0; n < v; n++) ut[s * 13 + n] = { x: x[s], y: 0, z: 10 + n, opp: true, aktiv: n === v - 1, hvor: "grunn" };
    });
    st.bord.forEach((kol, i) => {
      const h = st.skjult[i];
      const { dn, opp } = steg(kol.length, h);
      let y = yBord;
      kol.forEach((k, n) => {
        ut[k] = { x: x[i], y, z: 100 + n, opp: n >= h, aktiv: n >= h, hvor: "bord", i, p: n };
        y += n < h ? dn : opp;
      });
    });
    return ut;
  }

  const kortEl = (k) => document.getElementById("kk-k" + k);
  let sistPos = [];
  const plassert = new Map(); // card → "x,y" where it was last put (to see which cards move)

  function etikett(k, p) {
    if (!p.opp) return "Kort med baksiden opp";
    const navn = KORT.Navn(k);
    if (p.hvor === "bord") return `${navn}, kolonne ${p.i + 1}`;
    if (p.hvor === "avfall") return `${navn}, trukket fra bunken`;
    return `${navn}, lagt hjem`;
  }

  // Puts every card where it belongs. animer: slide (moved cards fly above the others).
  function plasser(o = {}) {
    const brett = R.$("#kk-brett");
    if (!brett || !L || !st) return;
    if (!o.animer) brett.classList.add("kk-stille");
    const pos = posisjoner();
    sistPos = pos;
    pos.forEach((p, k) => {
      const el = kortEl(k);
      if (!el) return;
      const nokkel = p.x + "," + p.y;
      const flyttet = plassert.get(k) !== nokkel;
      plassert.set(k, nokkel);
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      clearTimeout(el._z);
      if (flyttet && o.animer) {
        el.style.zIndex = String(600 + p.z);
        el._z = setTimeout(() => (el.style.zIndex = String(p.z)), 300);
      } else el.style.zIndex = String(p.z);
      el.classList.toggle("sk-opp", p.opp);
      el.classList.toggle("kk-av", !p.aktiv);
      el.tabIndex = p.aktiv ? 0 : -1;
      el.setAttribute("aria-label", etikett(k, p));
      if (p.aktiv) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", "true");
    });
    // Empty places
    for (let s = 0; s < 4; s++) plassEl("kk-g" + s, L.x[s], 0);
    plassEl("kk-avfall", L.x[4], 0);
    for (let i = 0; i < 7; i++) plassEl("kk-b" + i, L.x[i], L.yBord);
    const bunke = R.$("#kk-bunke");
    if (bunke) {
      bunke.style.transform = `translate3d(${L.x[6]}px, 0, 0)`;
      bunke.classList.toggle("tom", !st.bunke.length);
      bunke.classList.toggle("snu", !st.bunke.length && st.avfall.length > 0);
      bunke.setAttribute("aria-label", st.bunke.length ? `Bunken, ${R.flertall(st.bunke.length, "kort", "kort")} igjen. Trykk for å trekke ${MODUS[st.modus].kort}.` : st.avfall.length ? "Bunken er tom. Trykk for å legge kortene tilbake." : "Bunken er tom");
      bunke.disabled = !st.bunke.length && !st.avfall.length;
    }
    const antall = R.$("#kk-antall");
    if (antall) {
      antall.textContent = st.bunke.length;
      antall.hidden = !st.bunke.length;
      antall.style.transform = `translate3d(${L.x[6] + L.cw - 24}px, ${L.ch - 14}px, 0)`;
    }
    brett.style.height = L.H + "px";
    oppdaterHud();
    if (!o.animer) {
      void brett.offsetWidth;
      brett.classList.remove("kk-stille");
    }
  }
  function plassEl(id, x, y) {
    const el = document.getElementById(id);
    if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function oppdaterHud() {
    const sp = R.S.spill;
    if (!sp) return;
    const trekk = R.$("#kk-trekk");
    if (trekk) trekk.textContent = sp.trekk;
    R.$$('#skjerm [data-h="angre"]').forEach((b) => (b.disabled = !sp.angre.length || laast));
    const tid = R.$("#kk-tid");
    if (tid) tid.textContent = visTid(tidMs(sp));
  }

  function tilpass(animer) {
    if (!R.$("#kk-brett") || !st) return;
    L = maal();
    const brett = R.$("#kk-brett");
    brett.style.setProperty("--kortbredde", L.cw + "px");
    plasser({ animer });
  }

  // ---------- Sounds ----------

  const lyd = {
    legg: () => {
      R.lyd.stoy(0, 0.045, 0.1, 2800);
      R.lyd.tone(300, 0, 0.06, "triangle", 0.05, 220);
    },
    hjem: (v) => {
      R.lyd.tone(520 + v * 38, 0, 0.13, "sine", 0.11);
      R.lyd.tone(780 + v * 57, 0.05, 0.12, "triangle", 0.05);
    },
    trekk: () => R.lyd.stoy(0, 0.09, 0.09, 3400),
    nei: () => {
      R.lyd.tone(330, 0, 0.12, "triangle", 0.09, 220);
      R.lyd.tone(250, 0.1, 0.16, "triangle", 0.08, 170);
    },
  };

  // ---------- Moves ----------

  function huskAngre(sp) {
    sp.angre.push(sp.kode + "|" + sp.trekk);
    if (sp.angre.length > MAKS_ANGRE) sp.angre.splice(0, sp.angre.length - MAKS_ANGRE);
  }

  // Carries out a move from the player (or from auto-finish). Returns true when it was legal.
  function gjor(t, o = {}) {
    const S = R.S;
    const sp = S.spill;
    if (!sp || sp.ferdig || !KABAL.lovlig(st, t)) return false;
    skjulHint();
    if (!o.auto) huskAngre(sp);
    const flyttet = t.fra === "s" ? [] : KABAL.loft(st, t);
    const res = KABAL.utfor(st, t);
    sp.trekk += o.auto ? 0 : 1;
    sp.kode = KABAL.kode(st);
    if (!sp.startet) {
      sp.startet = true;
      startKlokke(S);
    }
    plasser({ animer: true });
    if (t.fra === "s") lyd.trekk();
    else if (t.til === "g") {
      lyd.hjem(KABAL.verdiAv(flyttet[0]));
      R.vibrer(10);
    } else lyd.legg();
    if (res.snudd) {
      setTimeout(() => R.lyd.snu(), 120);
      // The second tap of a quick double tap must not move the card that was just turned (unseen).
      const kol = st.bord[t.i];
      nettoppSnudd = { k: kol[kol.length - 1], tid: performance.now() };
    }
    R.lagre();
    if (!o.auto) etterTrekk(S);
    return true;
  }

  // After every move: won? solved (everything face up)? or out of moves?
  function etterTrekk(S) {
    if (KABAL.vunnet(st)) return vinn(S);
    const plan = fullforPlan(st);
    if (plan) return autoFullfor(S, plan);
    const fastNa = KABAL.fast(st);
    visFast(fastNa);
  }

  // Everything face up: the moves that take all cards home (drawing from the stock as needed).
  function fullforPlan(st0) {
    if (!KABAL.alleOppe(st0)) return null;
    const s = KABAL.kopi(st0);
    const plan = [];
    let vakt = 0;
    while (!KABAL.vunnet(s)) {
      if (++vakt > 400) return null;
      let gjort = false;
      for (let i = 0; i < 7 && !gjort; i++) {
        const kol = s.bord[i];
        if (!kol.length) continue;
        const t = { fra: "b", i, p: kol.length - 1, til: "g", j: KABAL.sortAv(kol[kol.length - 1]) };
        if (KABAL.lovlig(s, t)) {
          KABAL.utfor(s, t);
          plan.push(t);
          gjort = true;
        }
      }
      if (gjort) continue;
      if (s.avfall.length) {
        const t = { fra: "a", til: "g", j: KABAL.sortAv(s.avfall[s.avfall.length - 1]) };
        if (KABAL.lovlig(s, t)) {
          KABAL.utfor(s, t);
          plan.push(t);
          continue;
        }
      }
      if (!s.bunke.length && !s.avfall.length) return null;
      // Draw until something fits, at most two rounds of the stock.
      let n = 0;
      let funnet = false;
      while (n++ < 2 * 52) {
        KABAL.utfor(s, { fra: "s" });
        plan.push({ fra: "s" });
        const topp = s.avfall[s.avfall.length - 1];
        if (topp != null && KABAL.kanPaGrunn(s, topp)) {
          funnet = true;
          break;
        }
      }
      if (!funnet) return null;
    }
    return plan;
  }

  async function autoFullfor(S, plan) {
    laast = true;
    oppdaterHud();
    R.toast("Løst! Kortene går hjem av seg selv.");
    R.si("Kabalen er løst. Kortene går hjem av seg selv.");
    const fortsatt = R.vakt();
    await R.vent(R.rolig() ? 100 : 450);
    for (const t of plan) {
      if (!fortsatt()) return;
      gjor(t, { auto: true });
      await R.vent(R.rolig() ? 15 : t.fra === "s" ? 70 : 95);
    }
    if (!fortsatt()) return;
    laast = false;
    if (KABAL.vunnet(st)) vinn(S);
  }

  function trykkPa(fra) {
    if (laast || !st) return;
    const t = KABAL.besteMal(st, fra);
    if (t) {
      gjor(t);
      return;
    }
    // Nowhere to go: a little shake.
    const rekke = KABAL.loft(st, fra) || [];
    for (const k of rekke) {
      const el = kortEl(k);
      if (!el || R.rolig()) continue;
      el.classList.remove("kk-nei");
      void el.offsetWidth;
      el.classList.add("kk-nei");
      setTimeout(() => el.classList.remove("kk-nei"), 420);
    }
    lyd.nei();
    if (rekke.length) R.si(`${KORT.Navn(rekke[0])} kan ikke flyttes nå`);
  }

  // The source a card belongs to, or null when it can't be picked up.
  function kildeFor(k) {
    for (let i = 0; i < 7; i++) {
      const p = st.bord[i].indexOf(k);
      if (p >= 0) return p >= st.skjult[i] ? { fra: "b", i, p } : null;
    }
    if (st.avfall.length && st.avfall[st.avfall.length - 1] === k) return { fra: "a" };
    const s = KABAL.sortAv(k);
    if (st.grunn[s] > 0 && st.grunn[s] - 1 === k % 13) return { fra: "g", i: s };
    return null;
  }

  // ---------- Hints and «no more moves» ----------

  function skjulHint() {
    clearTimeout(hintId);
    R.$$("#kk-brett .kk-hint").forEach((el) => el.classList.remove("kk-hint"));
  }

  function malEl(t) {
    if (t.til === "g") {
      const v = st.grunn[t.j];
      return v ? kortEl(t.j * 13 + v - 1) : document.getElementById("kk-g" + t.j);
    }
    const kol = st.bord[t.j];
    return kol.length ? kortEl(kol[kol.length - 1]) : document.getElementById("kk-b" + t.j);
  }

  function visHint(S) {
    if (laast || !st) return;
    skjulHint();
    const r = KABAL.los(st, 20000);
    let t = r.trekk && r.trekk.length ? KABAL.forsteSteg(st, r.trekk[0]) : null;
    if (t && !KABAL.lovlig(st, t)) t = null;
    if (!t) t = KABAL.enkeltHint(st);
    if (!t) {
      R.toast("Ingen flere trekk. Angre, eller start en ny kabal.");
      return;
    }
    S.spill.hint += 1;
    const el = [];
    let tekst;
    if (t.fra === "s") {
      el.push(R.$("#kk-bunke"));
      tekst = st.bunke.length ? "Trekk fra bunken" : "Legg kortene tilbake i bunken";
    } else {
      const rekke = KABAL.loft(st, t);
      rekke.forEach((k) => el.push(kortEl(k)));
      el.push(malEl(t));
      const hvor = t.til === "g" ? "hjem" : st.bord[t.j].length ? `til ${KORT.navn(st.bord[t.j][st.bord[t.j].length - 1])}` : "til den tomme plassen";
      tekst = `Flytt ${KORT.navn(rekke[0])} ${hvor}`;
    }
    el.filter(Boolean).forEach((e) => e.classList.add("kk-hint"));
    R.toast(tekst.charAt(0).toUpperCase() + tekst.slice(1));
    R.si(tekst);
    R.lyd.pling();
    hintId = setTimeout(skjulHint, 2600);
    R.lagre();
  }

  function visFast(fast) {
    const el = R.$("#kk-fast");
    if (!el) return;
    if (fast && fastVist !== R.S.spill.kode) {
      fastVist = R.S.spill.kode;
      el.hidden = false;
      R.si("Ser ut som det er tomt for trekk. Angre, eller start en ny kabal.");
    } else if (!fast) el.hidden = true;
  }

  // ---------- Dragging ----------

  let dra = null;
  let sistPeker = -1e9; // a pointer tap was just handled: ignore the click that follows
  const TERSKEL = { mouse: 5, pen: 6, touch: 8 };
  const paBrettet = () => R.S && R.S.skjerm === "spill" && R.S.spill && !R.S.spill.ferdig && st && L;

  document.addEventListener("pointerdown", (e) => {
    if (dra || !paBrettet() || laast || (e.button != null && e.button > 0)) return;
    const el = e.target.closest && e.target.closest(".kk-kort");
    if (!el || el.classList.contains("kk-av") || forFersk(Number(el.dataset.k))) return;
    const fra = kildeFor(Number(el.dataset.k));
    const kort = fra && KABAL.loft(st, fra);
    if (!kort) return;
    skjulHint();
    dra = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, fra, kort, aktiv: false, mal: null };
    try {
      R.$("#kk-brett").setPointerCapture(e.pointerId);
    } catch (feil) {
      /* not every pointer can be captured */
    }
  });

  document.addEventListener("pointermove", (e) => {
    if (!dra || e.pointerId !== dra.id) return;
    const dx = e.clientX - dra.x0;
    const dy = e.clientY - dra.y0;
    if (!dra.aktiv) {
      if (Math.hypot(dx, dy) < (TERSKEL[dra.type] || 6)) return;
      dra.aktiv = true;
      dra.el = dra.kort.map(kortEl);
      dra.base = dra.kort.map((k) => sistPos[k]);
      dra.el.forEach((el, n) => {
        clearTimeout(el._z);
        el.classList.add("kk-drar");
        el.style.zIndex = String(1000 + n);
      });
      R.vibrer(6);
    }
    e.preventDefault();
    dra.el.forEach((el, n) => {
      const b = dra.base[n];
      el.style.transform = `translate3d(${b.x + dx}px, ${b.y + dy}px, 0)`;
    });
    const mal = finnMal(dx, dy);
    if (!same(mal, dra.mal)) {
      R.$$("#kk-brett .kk-mal").forEach((x) => x.classList.remove("kk-mal"));
      if (mal) {
        const m = malEl(mal);
        if (m) m.classList.add("kk-mal");
      }
      dra.mal = mal;
    }
  });
  const same = (a, b) => (!a && !b) || (a && b && a.til === b.til && a.j === b.j);

  function sluttDra(e, avbrutt) {
    if (!dra || e.pointerId !== dra.id) return;
    const d = dra;
    dra = null;
    sistPeker = performance.now();
    if (!d.aktiv) {
      if (!avbrutt) trykkPa(d.fra);
      return;
    }
    R.$$("#kk-brett .kk-mal").forEach((x) => x.classList.remove("kk-mal"));
    d.el.forEach((el) => el.classList.remove("kk-drar"));
    if (!avbrutt && d.mal && gjor(d.mal)) return;
    plasser({ animer: true }); // back where they came from
    if (!avbrutt) lyd.nei();
  }
  document.addEventListener("pointerup", (e) => sluttDra(e, false));
  document.addEventListener("pointercancel", (e) => sluttDra(e, true));

  // Keyboard (Enter/space on a card) and other clicks without a pointer: the same as a tap.
  document.addEventListener("click", (e) => {
    if (!paBrettet() || laast) return;
    const el = e.target.closest && e.target.closest(".kk-kort");
    if (!el || performance.now() - sistPeker < 600) return;
    const fra = kildeFor(Number(el.dataset.k));
    if (fra) trykkPa(fra);
  });
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest && e.target.closest("#kk-brett")) e.preventDefault();
  });

  // The legal place the dragged cards overlap most (foundation or column), or null.
  function finnMal(dx, dy) {
    const b = dra.base[0];
    const r = { x: b.x + dx, y: b.y + dy, w: L.cw, h: L.ch };
    const min = L.cw * L.ch * 0.12;
    let best = null;
    let bestA = min;
    const prov = (t, f) => {
      const a = Math.max(0, Math.min(r.x + r.w, f.x + f.w) - Math.max(r.x, f.x)) * Math.max(0, Math.min(r.y + r.h, f.y + f.h) - Math.max(r.y, f.y));
      if (a > bestA && KABAL.lovlig(st, t)) {
        bestA = a;
        best = t;
      }
    };
    if (dra.kort.length === 1 && dra.fra.fra !== "g") {
      const j = KABAL.sortAv(dra.kort[0]);
      for (let s = 0; s < 4; s++) prov({ ...dra.fra, til: "g", j }, { x: L.x[s], y: 0, w: L.cw, h: L.ch });
    }
    for (let j = 0; j < 7; j++) {
      const kol = st.bord[j];
      const bunn = kol.length ? sistPos[kol[kol.length - 1]].y + L.ch : L.yBord + L.ch;
      prov({ ...dra.fra, til: "b", j }, { x: L.x[j], y: L.yBord, w: L.cw, h: bunn - L.yBord + L.ch * 0.5 });
    }
    return best;
  }

  // ---------- The end ----------

  function vinn(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig) return;
    stoppKlokke(S);
    laast = true;
    sp.ferdig = true;
    sp.vunnet = true;
    registrer(S, true);
    R.lagre();
    oppdaterHud();
    R.lyd.fanfare();
    R.vibrer([40, 60, 120]);
    const fortsatt = R.vakt();
    kaskade(fortsatt).then(() => {
      laast = false;
      if (fortsatt()) R.gaTil("slutt");
    });
  }

  // The classic victory: the cards jump off the foundations and bounce across the screen, leaving
  // trails. A tap skips it. Skipped entirely with reduced motion.
  function kaskade(fortsatt) {
    return new Promise((ferdig) => {
      if (R.rolig() || !L) return setTimeout(ferdig, 600);
      const brett = R.$("#kk-brett");
      const b = brett.getBoundingClientRect();
      const lerret = document.createElement("canvas");
      lerret.className = "kk-kaskade";
      lerret.setAttribute("aria-hidden", "true");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth;
      const Hh = window.innerHeight;
      lerret.width = W * dpr;
      lerret.height = Hh * dpr;
      document.body.appendChild(lerret);
      const ctx = lerret.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = L.cw;
      const ch = L.ch;
      const rekke = [];
      for (let v = 13; v >= 1; v--) for (let s = 0; s < 4; s++) rekke.push(s * 13 + v - 1);
      const bilder = {};
      let slutt = false;
      let id = 0;
      const avslutt = () => {
        if (slutt) return;
        slutt = true;
        cancelAnimationFrame(id);
        lerret.classList.add("borte");
        setTimeout(() => lerret.remove(), 350);
        document.removeEventListener("pointerdown", avslutt, true);
        ferdig();
      };
      document.addEventListener("pointerdown", avslutt, true);
      Promise.all(
        rekke.map(
          (k) =>
            new Promise((klar) => {
              const img = new Image();
              img.onload = img.onerror = () => klar();
              img.src = KORT.bilde(k, false);
              bilder[k] = img;
            }),
        ),
      ).then(() => {
        if (slutt) return;
        const flygende = [];
        let neste = 0;
        let sist = -1e9;
        const t0 = performance.now();
        const ramme = (na) => {
          if (slutt) return;
          if (!fortsatt()) return avslutt();
          if (neste < rekke.length && na - sist > 140) {
            const k = rekke[neste++];
            const s = KABAL.sortAv(k);
            flygende.push({ k, x: b.left + L.x[s], y: b.top, vx: (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 3.4), vy: -Math.random() * 7 - 1 });
            sist = na;
          }
          for (const f of flygende) {
            f.vy += 0.55;
            f.x += f.vx;
            f.y += f.vy;
            if (f.y + ch > Hh) {
              f.y = Hh - ch;
              f.vy = -f.vy * 0.78;
            }
            const img = bilder[f.k];
            if (img && img.complete && img.naturalWidth) ctx.drawImage(img, f.x, f.y, cw, ch);
          }
          for (let n = flygende.length - 1; n >= 0; n--) if (flygende[n].x < -cw - 4 || flygende[n].x > W + 4) flygende.splice(n, 1);
          if ((neste >= rekke.length && !flygende.length) || na - t0 > 9000) return avslutt();
          id = requestAnimationFrame(ramme);
        };
        id = requestAnimationFrame(ramme);
      });
    });
  }

  // ---------- Screens ----------

  const IKON = {
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
    ny: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/></svg>',
    slutt: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    klokke: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>',
    snu: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/></svg>',
    hake: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  // Small fanned cards for the mode tiles.
  const miniKort = (antall) =>
    `<span class="kk-mini kk-mini-${antall}">${[25, 11, 35].slice(0, antall).map((k, n) => KORT.html(k, { opp: true, klasse: "kk-mini-kort", stil: `--n:${n}` })).join("")}</span>`;

  function statLinje(s) {
    if (!s || !s.spilt) return "";
    const pst = Math.round((s.vunnet / s.spilt) * 100);
    return `Vunnet ${R.tall(s.vunnet)} av ${R.tall(s.spilt)} (${pst} %)${s.besteTid ? ` · beste tid ${visTid(s.besteTid * 1000)}` : ""}`;
  }

  // Both modes side by side.
  function statTabell(S) {
    const s = [1, 3].map((m) => Object.assign(tomStat(), S.stat[m] || {}));
    const rad = (navn, f) => `<tr><th scope="row">${esc(navn)}</th>${s.map((x) => `<td>${f(x)}</td>`).join("")}</tr>`;
    return `<table class="kk-tabell">
      <thead><tr><td></td><th scope="col">${esc(MODUS[1].navn)}</th><th scope="col">${esc(MODUS[3].navn)}</th></tr></thead>
      <tbody>
        ${rad("Spilt", (x) => R.tall(x.spilt))}
        ${rad("Vunnet", (x) => (x.spilt ? `${R.tall(x.vunnet)} <small>${Math.round((x.vunnet / x.spilt) * 100)} %</small>` : "–"))}
        ${rad("På rad nå", (x) => R.tall(x.rekke))}
        ${rad("Flest på rad", (x) => R.tall(x.besteRekke))}
        ${rad("Beste tid", (x) => (x.besteTid ? visTid(x.besteTid * 1000) : "–"))}
        ${rad("Færrest trekk", (x) => (x.faerrest ? R.tall(x.faerrest) : "–"))}
      </tbody>
    </table>`;
  }

  function brettHtml(S) {
    const sp = S.spill;
    const kort = Array.from({ length: 52 }, (_, k) => KORT.html(k, { tag: "button", klasse: "kk-kort kk-av", attr: ` id="kk-k${k}" data-k="${k}" type="button" tabindex="-1" aria-hidden="true"` })).join("");
    const grunn = [0, 1, 2, 3]
      .map((s) => `<span class="kk-plass kk-grunn" id="kk-g${s}" style="--sf:${KORT.SORTER[s].rod ? KORT.ROD : "#f4e9ff"}" aria-hidden="true"><svg viewBox="0 0 100 100">${KORT.symbol(s, 18, 18, 64)}</svg></span>`)
      .join("");
    const bord = Array.from({ length: 7 }, (_, i) => `<span class="kk-plass kk-tom" id="kk-b${i}" aria-hidden="true"><b>K</b></span>`).join("");
    return `<div class="kk-brett" id="kk-brett" role="group" aria-label="Kabalen" data-modus="${sp.modus}">
      ${grunn}<span class="kk-plass kk-avfall-plass" id="kk-avfall" aria-hidden="true"></span>${bord}
      <button class="kk-plass kk-bunke" id="kk-bunke" type="button" data-h="trekk" data-stille>${IKON.snu}</button>
      ${kort}
      <span class="kk-antall" id="kk-antall" aria-hidden="true"></span>
      <div class="kk-fast" id="kk-fast" hidden role="status">
        <span>Ser ut som det er tomt for trekk.</span>
        <span class="kk-fast-knapper">${R.ui.knapp2("Angre", "angre", { variant: "liten" })}${R.ui.knapp2("Ny kabal", "ny", { variant: "liten" })}</span>
      </div>
    </div>`;
  }

  R.start({
    id: "kortkongen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      oppsett: { modus: 1, losbar: true },
      stat: {},
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ modus: 1, losbar: true }, S.oppsett || {});
      if (![1, 3].includes(S.oppsett.modus)) S.oppsett.modus = 1;
      S.oppsett.losbar = S.oppsett.losbar !== false;
      if (!S.stat || typeof S.stat !== "object") S.stat = {};
      for (const m of [1, 3]) if (S.stat[m]) S.stat[m] = Object.assign(tomStat(), S.stat[m]);
      const sp = S.spill;
      st = null;
      if (sp) {
        st = KABAL.fraKode(sp.kode);
        if (!st || !Array.isArray(sp.angre) || ![1, 3].includes(sp.modus)) {
          S.spill = null;
          st = null;
        } else {
          // Undo steps that can't be read any more are dropped (never a broken position).
          sp.angre = sp.angre.filter((a) => typeof a === "string" && KABAL.fraKode(a.split("|")[0]));
          sp.trekk = Number(sp.trekk) || 0;
          sp.tid = Number(sp.tid) || 0;
          sp.hint = Number(sp.hint) || 0;
        }
      }
      if (S.skjerm === "spill" && !(S.spill && !S.spill.ferdig)) S.skjerm = S.spill ? "slutt" : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Få alle kortene hjem i fire bunker – én for hver sort, fra ess til konge.",
      steg: [
        ["Bygg nedover på bordet", "Legg kortene i synkende rekkefølge, annenhver rød og svart: svart 8 på rød 9, rød 7 på svart 8."],
        ["Trykk eller dra", "Trykk på et kort, så flytter det seg til beste plass. Eller dra det dit du vil – flere kort kan flyttes samtidig."],
        ["Fra ess til konge", "Essene går hjem øverst til venstre. Bygg videre med samme sort: 2, 3, 4 … helt til kongen."],
      ],
      tips: [
        "Står du fast? Trykk på bunken for å trekke nye kort. Når den er tom, legges kortene tilbake.",
        "Bare en konge kan legges på en tom plass.",
        "Snu kortene med baksiden opp så fort du kan – de skjuler ofte nøkkelen.",
        "«Hint» viser et lurt trekk, og «Angre» tar tilbake så mange trekk du vil.",
        "Når alle kortene ligger med bildet opp, går resten hjem av seg selv.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const linje = statLinje(S.stat[S.oppsett.modus]);
          return (
            R.ui.spillhjem({
              slagordHtml: "Ess til konge, rødt på svart.<br><em>Går kabalen opp?</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? `Fortsett · ${R.flertall(sp.trekk, "trekk", "trekk")}` : "",
                nyTekst: "Ny kabal",
                startTekst: "Ny kabal",
                ekstraHtml: R.ui.lenkerad(R.ui.lenke("Slik spiller du", "regler"), S.stat[1] || S.stat[3] ? R.ui.lenke("Statistikk", "statistikk") : ""),
              }),
              merker: [
                ["1", "spiller"],
                [R.tall((LOSBARE.tre.length + LOSBARE.en.length) * 8), "løsbare kabaler"],
                ["0", "reklame"],
              ],
            }) + (linje ? `<p class="kk-hjemstat">${esc(MODUS[S.oppsett.modus].navn)}: ${esc(linje)}</p>` : "")
          );
        },
      },

      oppsett: {
        tittel: "Ny kabal",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <h2>Hvor mange kort trekker du?</h2>
            ${R.ui.fliser(
              "modus",
              [1, 3].map((m) => ({ v: m, tittel: MODUS[m].navn, tekst: MODUS[m].tekst, ikon: miniKort(m) })),
              S.oppsett.modus,
            )}
          </section>
          ${R.ui.bryter("losbar", S.oppsett.losbar, "Bare løsbare kabaler", "Hver kabal er sjekket på forhånd: den kan gå opp – hvis du spiller lurt.")}
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`,
      },

      spill: {
        tittel: (S) => (S.spill ? MODUS[S.spill.modus].navn : "Kabal"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">Kabal</h1>
            <div class="kk-hud">
              <span class="kk-stat" aria-label="Tid">${IKON.klokke}<b id="kk-tid">${visTid(tidMs(sp))}</b></span>
              <span class="kk-stat"><b id="kk-trekk">${sp.trekk}</b> trekk</span>
              ${sp.losbar ? `<span class="kk-stat kk-losbar" title="Denne kabalen kan gå opp">${IKON.hake}Løsbar</span>` : ""}
            </div>
            ${brettHtml(S)}
            ${R.ui.dokk(`<div class="kk-verktoy">
              <button class="kk-knapp" id="kk-angre" data-h="angre" ${sp.angre.length ? "" : "disabled"}>${IKON.angre}<span>Angre</span></button>
              <button class="kk-knapp" data-h="hint">${IKON.hint}<span>Hint</span></button>
              <button class="kk-knapp" data-h="ny">${IKON.ny}<span>Ny kabal</span></button>
              <button class="kk-knapp" data-h="avslutt">${IKON.slutt}<span>Avslutt</span></button>
            </div>`)}`;
        },
        etter(S) {
          L = null;
          plassert.clear();
          if (!S.spill) return;
          st = st || KABAL.fraKode(S.spill.kode);
          L = maal();
          R.$("#kk-brett").style.setProperty("--kortbredde", L.cw + "px");
          if (nyDeling && !R.rolig()) {
            nyDeling = false;
            // Deal: every card starts on the stock, face down, and flies out one by one.
            const brett = R.$("#kk-brett");
            brett.classList.add("kk-stille");
            for (let k = 0; k < 52; k++) {
              const el = kortEl(k);
              el.style.transform = `translate3d(${L.x[6]}px, 0, 0)`;
              el.style.zIndex = "1";
              plassert.set(k, L.x[6] + ",0");
            }
            void brett.offsetWidth;
            brett.classList.remove("kk-stille");
            const rekkefolge = [];
            for (let rad = 0; rad < 7; rad++) for (let i = rad; i < 7; i++) rekkefolge.push(st.bord[i][rad]);
            const STEG = 34;
            rekkefolge.forEach((k, n) => {
              const el = kortEl(k);
              el.style.transitionDelay = `${n * STEG}ms`;
              el.querySelector(".sk-indre").style.transitionDelay = `${n * STEG + 230}ms`;
              R.lyd.stoy(n * (STEG / 1000), 0.03, 0.06, 3200);
            });
            laast = true;
            plasser({ animer: true });
            const fortsatt = R.vakt();
            setTimeout(() => {
              rekkefolge.forEach((k) => {
                const el = kortEl(k);
                if (!el) return;
                el.style.transitionDelay = "";
                el.querySelector(".sk-indre").style.transitionDelay = "";
              });
              if (!fortsatt()) return;
              laast = false;
              plasser({ animer: false });
            }, rekkefolge.length * STEG + 700);
          } else {
            nyDeling = false;
            plasser({ animer: false });
          }
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          startKlokke(S);
          const id = setInterval(() => {
            const el = R.$("#kk-tid");
            if (el && R.S.spill) el.textContent = visTid(tidMs(R.S.spill));
          }, 500);
          R.vedForlat(() => clearInterval(id));
          if (S.spill.startet && st && !KABAL.vunnet(st)) {
            const plan = fullforPlan(st);
            if (plan) setTimeout(() => R.S.skjerm === "spill" && autoFullfor(R.S, plan), 500);
            else visFast(KABAL.fast(st));
          }
        },
        ut(S) {
          stoppKlokke(S);
          skjulHint();
          dra = null;
          laast = false;
          R.$$(".kk-kaskade").forEach((el) => el.remove());
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { vunnet: sp.vunnet, sek: Math.round(sp.tid / 1000), trekk: sp.trekk, hjem: 0 };
          const s = Object.assign(tomStat(), S.stat[sp.modus] || {});
          const dokk =
            R.ui.flereSpill({ antall: 1 }) +
            R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), '<a class="lenke" href="/">Alle spill</a>'));
          const statHtml = `<p class="kk-sluttstat">${esc(MODUS[sp.modus].navn)}: vunnet ${R.tall(s.vunnet)} av ${R.tall(s.spilt)}${s.rekke > 1 ? ` · ${R.tall(s.rekke)} på rad` : ""}${s.besteRekke > 1 ? ` · rekord ${R.tall(s.besteRekke)} på rad` : ""}</p>`;
          if (r.vunnet) {
            const rekord = r.nyTid || r.nyTrekk;
            return `
              <div class="banner aksent">
                ${R.figur()}
                <p class="etikett">${esc(MODUS[sp.modus].navn)}${sp.losbar ? " · løsbar" : ""}</p>
                <h1 id="skjerm-tittel">Kabalen gikk opp!</h1>
                <p class="ingress">Godt jobba!${r.rekke > 1 ? ` Det er ${R.tall(r.rekke)} på rad.` : ""}</p>
              </div>
              <div class="kk-resultat">
                <div class="kk-tall-kort${r.nyTid ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>tid</span>${r.nyTid ? '<i class="kk-ny">Rekord!</i>' : ""}</div>
                <div class="kk-tall-kort${r.nyTrekk ? " ny" : ""}"><b>${R.tall(r.trekk)}</b><span>trekk</span>${r.nyTrekk ? '<i class="kk-ny">Rekord!</i>' : ""}</div>
              </div>
              <p class="hjelp">${
                rekord
                  ? `Ny personlig rekord! Forrige: ${r.forrigeTid ? visTid(r.forrigeTid * 1000) : "–"} · ${r.forrigeTrekk ? R.tall(r.forrigeTrekk) + " trekk" : "–"}`
                  : r.forrigeTid
                    ? `Rekordene dine: ${visTid(s.besteTid * 1000)} · ${R.tall(s.faerrest)} trekk`
                    : "Første kabal i boks – nå har du rekorder å slå!"
              }</p>
              ${statHtml}
              ${dokk}`;
          }
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${esc(MODUS[sp.modus].navn)}${sp.losbar ? " · løsbar" : ""}</p>
              <h1 id="skjerm-tittel">Den var vrien!</h1>
              <p class="ingress">${r.hjem ? `Du fikk ${R.tall(r.hjem)} av 52 kort hjem.` : "Ingen kort kom hjem denne gangen."} Neste kabal kan være din.</p>
            </div>
            ${r.hjem ? `<div class="kk-fremgang" aria-hidden="true"><span style="width:${Math.round((r.hjem / 52) * 100)}%"></span></div>` : ""}
            ${statHtml}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp && sp.vunnet) {
            R.konfetti();
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 1800);
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        if (pagar(S)) registrer(S, false);
        // The old game is over now (counted once): never resume it.
        S.spill = null;
        st = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil("spill");
      },
      statistikk(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">Statistikk</h2>
          <div class="kk-stat-ark">${statTabell(S)}</div>
          <p class="hjelp">Statistikken ligger bare på denne mobilen.</p>
          <button class="knapp" data-h="lukk-ark">Lukk</button>
          ${R.ui.lenke("Nullstill statistikk", "nullstill")}`);
      },
      async nullstill(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Nullstille statistikken?", "Alle seirer, rekker og rekorder slettes fra denne mobilen.", "Nullstill", "Avbryt");
        if (!ja || !fortsatt()) return;
        S.stat = {};
        R.vis();
        R.toast("Statistikken er nullstilt");
      },
      modus(el, e, S) {
        S.oppsett.modus = Number(el.dataset.v) === 3 ? 3 : 1;
        R.vis();
      },
      losbar(el, e, S) {
        S.oppsett.losbar = !S.oppsett.losbar;
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
      endre: () => R.gaTil("oppsett"),
      trekk(el, e, S) {
        if (laast || !st || !S.spill || S.spill.ferdig) return;
        gjor({ fra: "s" });
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (laast || !sp || sp.ferdig || !sp.angre.length) return;
        skjulHint();
        const [kode, trekk] = sp.angre.pop().split("|");
        const ny = KABAL.fraKode(kode);
        if (!ny) {
          sp.angre = [];
          oppdaterHud();
          return;
        }
        st = ny;
        sp.kode = kode;
        sp.trekk = Number(trekk) || 0;
        plasser({ animer: true });
        R.lyd.tone(600, 0, 0.08, "triangle", 0.07, 420);
        R.lagre();
        visFast(false);
        R.si("Angret");
      },
      hint: (el, e, S) => visHint(S),
      async ny(el, e, S) {
        if (laast) return;
        const sp = S.spill;
        const fortsatt = R.vakt();
        const valg = await R.velgIArk(
          "Ny kabal?",
          [
            { v: "ny", tekst: "Del ut en ny kabal" },
            { v: "igjen", tekst: "Start denne kabalen på nytt" },
          ],
          sp && sp.startet ? "Kabalen du holder på med, teller som tapt i statistikken." : "",
        );
        if (!valg || !fortsatt() || !S.spill) return;
        registrer(S, false);
        nyttSpill(S, valg === "igjen");
        R.gaTil("spill");
      },
      async avslutt(el, e, S) {
        if (laast) return;
        const sp = S.spill;
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte kabalen?", sp.startet ? "Den teller som tapt i statistikken." : "Du kan alltid starte en ny.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || !S.spill) return;
        if (S.spill.startet) {
          stoppKlokke(S);
          registrer(S, false);
          S.spill.ferdig = true;
          R.gaTil("slutt");
        } else {
          S.spill = null;
          st = null;
          R.gaTil("hjem");
        }
      },
    }),
  });

  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill" && !dra) tilpass(false);
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill") return;
    if (document.hidden) {
      stoppKlokke(S);
      R.lagre();
    } else startKlokke(S);
  });
})();
