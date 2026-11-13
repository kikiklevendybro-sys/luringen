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

    // Every place a picked-up card (or run) may go, best first: home, each column where it builds,
    // and one empty column (they are all alike; none for a king that already stands alone).
    function alleMal(st, fra) {
      const rekke = loft(st, fra);
      if (!rekke) return [];
      const ut = [];
      if (rekke.length === 1 && fra.fra !== "g") {
        const t = { ...fra, til: "g", j: sortAv(rekke[0]) };
        if (lovlig(st, t)) ut.push(t);
      }
      let tom = null;
      for (let j = 0; j < 7; j++) {
        if (fra.fra === "b" && j === fra.i) continue;
        const t = { ...fra, til: "b", j };
        if (!lovlig(st, t)) continue;
        if (st.bord[j].length) ut.push(t);
        else if (tom == null) tom = t;
      }
      if (tom && !(fra.fra === "b" && fra.p === 0)) ut.push(tom);
      return ut;
    }

    // Is home always the right place for this card? (Nothing that could lie on it is left in play.)
    function tryggHjem(st, k) {
      const v = verdiAv(k);
      if (v <= 2) return true;
      const mot = rod(k) ? [0, 3] : [1, 2];
      return st.grunn[mot[0]] >= v - 1 && st.grunn[mot[1]] >= v - 1;
    }

    // «Dagens kabal»: the same proven deal for everyone on a date ("2026-11-11"). FROZEN – the first
    // 1 742 seeds of the «tre» list (solvable drawing three, so also drawing one) in the order they
    // have: the list may grow at the end, but these are never moved or removed.
    // The day number steps through the list in strides of 1 009 (shares no factor with 1 742), and
    // the suit swap follows the day too: no deal comes back for nineteen years.
    const DAGLIGE = 1742;
    function dagens(dato, liste) {
      const [a, m, d] = String(dato).split("-").map(Number);
      const nr = Math.round(Date.UTC(a, m - 1, d) / 86400000);
      const n = Math.min(DAGLIGE, liste.length);
      return { fro: liste[(nr * 1009 + 311) % n], variant: nr % 8 };
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
    //
    // The search runs in steps, so the board never freezes: loser(st, maks, o) → { kjor(noder) → true
    // when it is over, resultat() → { trekk | null, noder, uttomt } }. «uttomt»: the search ended
    // without a solution and without reaching `maks`. The quick search skips lines that rarely help
    // (splitting a run, emptying a column nobody waits for, taking cards back down), so only with
    // o.full – every line that could matter – is an empty search proof that the position is lost.
    function loser(st0, maks, o) {
      maks = maks || 60000;
      const full = !!(o && o.full);
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
          // (Drawing three: playing a talon card changes which cards come up later, so the full search decides.)
          const plasser = modus === 1 ? nabare(n) : full ? [] : n.p > 0 ? [n.p - 1] : [];
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
            if (!hel && !full) {
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
              } else if (hel && p === 0 && !kongeVenter && !full) continue; // emptying a column nobody needs
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
        // Foundation back to a column: only when some reachable card could then lie on it
        // (full: when a card that could lie on it is still in play).
        for (let s = 0; s < 4; s++) {
          const v = n.grunn[s];
          if (v < 3) continue;
          const k = s * 13 + v - 1;
          const mot = rod(k) ? [0, 3] : [1, 2];
          const trengs = full ? n.grunn[mot[0]] < v - 1 || n.grunn[mot[1]] < v - 1 : nab.some((q) => verdiAv(n.D[q]) === v - 1 && rod(n.D[q]) !== rod(k));
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

      // Depth first with its own stack (one frame per position on the current line).
      const stakk = [];
      const INGEN = [];
      let startet = false;
      let over = false; // the search has ended
      let taket = false; // … because it reached `maks`

      // Enters a position: true when it is solved, otherwise a frame with the moves to try.
      function inn(n) {
        if (++noder > maks) {
          taket = true;
          return false;
        }
        const base = sti.length;
        auto(n);
        if (n.grunn.every((v) => v === 13) || (!n.D.length && n.skjult.every((h) => h === 0))) {
          losning = sti.slice();
          return true;
        }
        const k = nokkel(n);
        let trekk = INGEN;
        if (!sett.has(k)) {
          sett.add(k);
          trekk = trekkListe(n);
        }
        stakk.push({ n, trekk, i: 0, base });
        return false;
      }

      function kjor(antall) {
        if (over) return true;
        let igjen = antall == null ? Infinity : antall;
        if (!startet) {
          startet = true;
          if (inn(kopiN(start))) return (over = true);
        }
        while (stakk.length && !taket) {
          if (igjen-- <= 0) return false;
          const f = stakk[stakk.length - 1];
          if (f.i >= f.trekk.length) {
            // Nothing more to try here: back up (the automatic moves, then the move that led here).
            sti.length = f.base;
            stakk.pop();
            if (stakk.length) sti.pop();
            continue;
          }
          const m = f.trekk[f.i++];
          const c = kopiN(f.n);
          bruk(c, m);
          sti.push(m);
          if (inn(c)) return (over = true);
        }
        stakk.length = 0;
        return (over = true);
      }

      return { kjor, resultat: () => ({ trekk: losning, noder, uttomt: over && !losning && !taket }) };
    }

    function los(st0, maks, o) {
      const l = loser(st0, maks, o);
      l.kjor();
      return l.resultat();
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

    return { naabare, nyttigeFlytt, sortAv, verdiAv, rod, tilfeldig, del, kopi, kanPaBord, kanPaGrunn, loft, lovlig, utfor, vunnet, alleOppe, kode, fraKode, gyldig, besteMal, alleMal, tryggHjem, dagens, los, loser, forsteSteg, enkeltHint, fast };
  })();

  // ---------- More solitaires: Golf, Tre topper, Pyramide, FreeCell and Edderkopp ----------
  // Pure engines like KABAL (no DOM), also loaded by test/kortkongen-varianter.test.mjs. KABAL above
  // is not touched by them. Every engine has: del(fro, valg) → st, lovlig(st, m), utfor(st, m) → what
  // happened, trekk(st) → every legal move, vunnet(st), kode(st) / fraKode(tekst) (null when unsound),
  // fremgang(st) → { n, av } (cards done), and a search loser(st, maks) → { kjor, resultat } like
  // KABAL.loser. A move always has `fra`; { fra: "s" } turns the stock.
  const VARIANTER = (() => {
    const { tilfeldig, sortAv, verdiAv, rod, kanPaBord } = KABAL;
    const topp = (l) => (l.length ? l[l.length - 1] : null);
    const heltall = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

    // The shuffle of KABAL.del, for n cards (Edderkopp plays with two decks).
    function stokk(n, fro) {
      const t = tilfeldig(fro);
      const kort = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(t() * (i + 1));
        [kort[i], kort[j]] = [kort[j], kort[i]];
      }
      return kort;
    }

    // Renaming the suits keeps a deal as solvable as it was: in Golf, Tre topper and Pyramide any of the
    // 24 ways (suits don't matter there), in FreeCell the eight that keep the colours (KABAL's).
    const ALLE = [];
    for (const a of [0, 1, 2, 3]) for (const b of [0, 1, 2, 3]) for (const c of [0, 1, 2, 3]) for (const d of [0, 1, 2, 3]) if (new Set([a, b, c, d]).size === 4) ALLE.push([a, b, c, d]);
    const FARGEBYTTER = [
      [0, 1, 2, 3],
      [3, 1, 2, 0],
      [0, 2, 1, 3],
      [3, 2, 1, 0],
      [1, 0, 3, 2],
      [2, 0, 3, 1],
      [1, 3, 0, 2],
      [2, 3, 0, 1],
    ];
    const bytt = (kort, m) => kort.map((k) => m[sortAv(k)] * 13 + (k % 13));
    // A shuffled deck of 52 with the suits renamed (bytte: 0–23, or 0–7 with farger).
    const stokk52 = (fro, bytte, farger) => bytt(stokk(52, fro), farger ? FARGEBYTTER[(bytte || 0) & 7] : ALLE[((bytte || 0) % 24 + 24) % 24]);

    // A position as text: one character per card (up to 124 cards), "-" for an empty place.
    let ekstra = "";
    for (let c = 0xc0; c <= 0xff; c++) if (c !== 0xd7 && c !== 0xf7) ekstra += String.fromCharCode(c);
    const TEGN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" + ekstra;
    const tilTegn = (l) => l.map((k) => (k < 0 ? "-" : TEGN[k])).join("");
    const fraTegn = (s) => Array.from(s, (c) => (c === "-" ? -1 : TEGN.indexOf(c)));
    // Every card exactly once: the cards in the lists (an empty place, -1, only where tomOk) are 0 … n − 1.
    function hele(lister, n, tomOk) {
      const sett = new Set();
      for (const l of lister)
        for (const k of l) {
          if (k === -1 && tomOk) continue;
          if (!heltall(k, 0, n - 1) || sett.has(k)) return false;
          sett.add(k);
        }
      return sett.size === n;
    }

    // Depth first with a memory of positions already seen, in steps like KABAL.loser. o: barn(n) → the
    // moves to try, best first; bruk(n, m) → the next position; nokkel(n); ferdig(n). It tries every
    // line, so a search that runs dry («uttomt») proves that the position can't be won.
    function dybde(start, o, maks) {
      const sett = new Set();
      const stakk = [];
      const sti = [];
      let noder = 0;
      let losning = null;
      let startet = false;
      let over = false;
      let taket = false;
      function inn(n) {
        if (++noder > maks) {
          taket = true;
          return false;
        }
        if (o.ferdig(n)) {
          losning = sti.slice();
          return true;
        }
        const k = o.nokkel(n);
        const ny = !sett.has(k);
        if (ny) sett.add(k);
        stakk.push({ n, trekk: ny ? o.barn(n) : [], i: 0 });
        return false;
      }
      function kjor(antall) {
        if (over) return true;
        let igjen = antall == null ? Infinity : antall;
        if (!startet) {
          startet = true;
          if (inn(start)) return (over = true);
        }
        while (stakk.length && !taket) {
          if (igjen-- <= 0) return false;
          const f = stakk[stakk.length - 1];
          if (f.i >= f.trekk.length) {
            stakk.pop();
            if (stakk.length) sti.pop();
            continue;
          }
          const m = f.trekk[f.i++];
          sti.push(m);
          if (inn(o.bruk(f.n, m))) return (over = true);
        }
        stakk.length = 0;
        return (over = true);
      }
      return { kjor, resultat: () => ({ trekk: losning, noder, uttomt: over && !losning && !taket }) };
    }

    // Best first (the position that looks closest to the end, o.h(n): lower is better) – for FreeCell,
    // where a plain depth-first search gets lost. It never proves anything; it finds a way or gives up.
    function beste(start, o, maks) {
      const noder = [{ n: start, far: -1, m: null }];
      const sett = new Set([o.nokkel(start)]);
      const ko = []; // a binary heap of [h, nr]
      const opp = (i) => {
        while (i > 0) {
          const f = (i - 1) >> 1;
          if (ko[f][0] < ko[i][0] || (ko[f][0] === ko[i][0] && ko[f][1] < ko[i][1])) break;
          [ko[f], ko[i]] = [ko[i], ko[f]];
          i = f;
        }
      };
      const ned = () => {
        let i = 0;
        for (;;) {
          const a = 2 * i + 1;
          const b = a + 1;
          let m = i;
          const mindre = (x, y) => ko[x][0] < ko[y][0] || (ko[x][0] === ko[y][0] && ko[x][1] < ko[y][1]);
          if (a < ko.length && mindre(a, m)) m = a;
          if (b < ko.length && mindre(b, m)) m = b;
          if (m === i) return;
          [ko[m], ko[i]] = [ko[i], ko[m]];
          i = m;
        }
      };
      const legg = (h, nr) => {
        ko.push([h, nr]);
        opp(ko.length - 1);
      };
      const ta = () => {
        const forste = ko[0];
        const siste = ko.pop();
        if (ko.length) {
          ko[0] = siste;
          ned();
        }
        return forste;
      };
      let losning = null;
      let over = false;
      let taket = false;
      let antallNoder = 0;
      const vei = (nr) => {
        const ut = [];
        for (let i = nr; noder[i].far >= 0; i = noder[i].far) ut.push(noder[i].m);
        return ut.reverse();
      };
      if (o.ferdig(start)) {
        losning = [];
        over = true;
      } else legg(o.h(start), 0);
      function kjor(antall) {
        if (over) return true;
        let igjen = antall == null ? Infinity : antall;
        while (ko.length) {
          if (igjen-- <= 0) return false;
          if (++antallNoder > maks) {
            taket = true;
            break;
          }
          const [, nr] = ta();
          const n = noder[nr].n;
          for (const m of o.barn(n)) {
            const c = o.bruk(n, m);
            const k = o.nokkel(c);
            if (sett.has(k)) continue;
            sett.add(k);
            noder.push({ n: c, far: nr, m });
            if (o.ferdig(c)) {
              losning = vei(noder.length - 1);
              return (over = true);
            }
            legg(o.h(c), noder.length - 1);
          }
        }
        return (over = true);
      }
      return { kjor, resultat: () => ({ trekk: losning, noder: antallNoder, uttomt: over && !losning && !taket }) };
    }

    // ---------- Golf ----------
    // Seven columns of five, all face up; one card starts the waste, 16 in the stock. The top card of a
    // column may go to the waste when it is one higher or lower, any suit. Ace and king are not
    // neighbours, and nothing may go on a king. The stock is gone through once. Won: the columns are empty.
    // Moves: { fra: "s" } (stock → waste), { fra: "b", i } (top of column i → waste).
    const golf = (() => {
      const passer = (k, a) => a != null && a >= 0 && verdiAv(a) !== 13 && Math.abs(verdiAv(k) - verdiAv(a)) === 1;
      function del(fro, bytte) {
        const k = stokk52(fro, bytte);
        const kol = [];
        for (let c = 0; c < 7; c++) kol.push(k.slice(c * 5, c * 5 + 5));
        const bunke = k.slice(35);
        return { kol, bunke, avfall: [bunke.pop()] };
      }
      const kopi = (st) => ({ kol: st.kol.map((k) => k.slice()), bunke: st.bunke.slice(), avfall: st.avfall.slice() });
      function lovlig(st, m) {
        if (!m) return false;
        if (m.fra === "s") return st.bunke.length > 0;
        return m.fra === "b" && heltall(m.i, 0, 6) && st.kol[m.i].length > 0 && passer(topp(st.kol[m.i]), topp(st.avfall));
      }
      function utfor(st, m) {
        st.avfall.push(m.fra === "s" ? st.bunke.pop() : st.kol[m.i].pop());
        return {};
      }
      function trekk(st) {
        const ut = [];
        for (let i = 0; i < 7; i++) if (lovlig(st, { fra: "b", i })) ut.push({ fra: "b", i });
        if (st.bunke.length) ut.push({ fra: "s" });
        return ut;
      }
      const igjen = (st) => st.kol.reduce((s, k) => s + k.length, 0);
      const vunnet = (st) => igjen(st) === 0;
      const kode = (st) => [st.kol.map(tilTegn).join(","), tilTegn(st.bunke), tilTegn(st.avfall)].join(".");
      function fraKode(s) {
        const d = String(s).split(".");
        if (d.length !== 3) return null;
        const st = { kol: d[0].split(",").map(fraTegn), bunke: fraTegn(d[1]), avfall: fraTegn(d[2]) };
        const ok = st.kol.length === 7 && st.kol.every((k) => k.length <= 5) && st.bunke.length <= 16 && st.avfall.length >= 1 && hele([...st.kol, st.bunke, st.avfall], 52);
        return ok ? st : null;
      }
      function loser(st0, maks) {
        return dybde(
          kopi(st0),
          {
            ferdig: vunnet,
            // (Only the rank of the waste's top card matters.)
            nokkel: (n) => n.kol.map((k) => k.length).join("") + "|" + n.bunke.length + "|" + verdiAv(topp(n.avfall)),
            // The card that leaves the most to play next first, then the tallest column (it hides the most).
            barn: (n) => {
              const t = trekk(n);
              const vekt = (m) => {
                if (m.fra === "s") return -1;
                const k = topp(n.kol[m.i]);
                let v = n.kol[m.i].length;
                n.kol.forEach((kol, j) => {
                  const under = j === m.i ? kol[kol.length - 2] : topp(kol);
                  if (under != null && passer(under, k)) v += 10;
                });
                return v;
              };
              const w = new Map(t.map((m) => [m, vekt(m)]));
              return t.sort((a, b) => w.get(b) - w.get(a));
            },
            bruk: (n, m) => {
              const c = kopi(n);
              utfor(c, m);
              return c;
            },
          },
          maks || 300000,
        );
      }
      return { id: "golf", antall: 52, passer, del, kopi, lovlig, utfor, trekk, igjen, vunnet, kode, fraKode, loser, fremgang: (st) => ({ n: 35 - igjen(st), av: 35 }) };
    })();

    // ---------- Tre topper (Tri Peaks) ----------
    // 28 cards in three peaks (rows of 3, 6, 9 and 10; only the bottom row face up), one card starts the
    // waste, 23 in the stock. A card with nothing on it may go to the waste when it is one higher or
    // lower, any suit – round the corner (ace on king, king on ace). A card turns face up when it is
    // uncovered. The stock is gone through once. Won: all three peaks are cleared.
    // Moves: { fra: "s" }, { fra: "b", i } (place i, 0–27, top row first → waste).
    const topper = (() => {
      // Where each place lies, in half cards from the left; the row (0 top … 3 bottom).
      const X = [3, 9, 15, 2, 4, 8, 10, 14, 16, 1, 3, 5, 7, 9, 11, 13, 15, 17, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18];
      const RAD = X.map((_, i) => (i < 3 ? 0 : i < 9 ? 1 : i < 18 ? 2 : 3));
      // The cards that lie on each place (half a card to the left and right in the row below).
      const DEKKER = X.map((x, i) => X.map((_, j) => j).filter((j) => RAD[j] === RAD[i] + 1 && Math.abs(X[j] - x) === 1));
      const passer = (k, a) => {
        if (a == null || a < 0) return false;
        const d = Math.abs(verdiAv(k) - verdiAv(a));
        return d === 1 || d === 12;
      };
      function del(fro, bytte) {
        const k = stokk52(fro, bytte);
        const bunke = k.slice(28);
        return { bord: k.slice(0, 28), bunke, avfall: [bunke.pop()] };
      }
      const kopi = (st) => ({ bord: st.bord.slice(), bunke: st.bunke.slice(), avfall: st.avfall.slice() });
      const fri = (st, i) => st.bord[i] >= 0 && DEKKER[i].every((j) => st.bord[j] < 0);
      function lovlig(st, m) {
        if (!m) return false;
        if (m.fra === "s") return st.bunke.length > 0;
        return m.fra === "b" && heltall(m.i, 0, 27) && fri(st, m.i) && passer(st.bord[m.i], topp(st.avfall));
      }
      function utfor(st, m) {
        if (m.fra === "s") st.avfall.push(st.bunke.pop());
        else {
          st.avfall.push(st.bord[m.i]);
          st.bord[m.i] = -1;
        }
        return {};
      }
      function trekk(st) {
        const ut = [];
        for (let i = 0; i < 28; i++) if (lovlig(st, { fra: "b", i })) ut.push({ fra: "b", i });
        if (st.bunke.length) ut.push({ fra: "s" });
        return ut;
      }
      const igjen = (st) => st.bord.filter((k) => k >= 0).length;
      const vunnet = (st) => igjen(st) === 0;
      const kode = (st) => [tilTegn(st.bord), tilTegn(st.bunke), tilTegn(st.avfall)].join(".");
      function fraKode(s) {
        const d = String(s).split(".");
        if (d.length !== 3) return null;
        const st = { bord: fraTegn(d[0]), bunke: fraTegn(d[1]), avfall: fraTegn(d[2]) };
        const ok = st.bord.length === 28 && st.bunke.length <= 23 && st.avfall.length >= 1 && !st.bunke.includes(-1) && !st.avfall.includes(-1) && hele([st.bord, st.bunke, st.avfall], 52, true);
        return ok ? st : null;
      }
      // How many cards a move uncovers (they turn face up).
      const apner = (st, i) => X.reduce((n, _, j) => n + (DEKKER[j].includes(i) && st.bord[j] >= 0 && DEKKER[j].every((x) => x === i || st.bord[x] < 0) ? 1 : 0), 0);
      function loser(st0, maks) {
        return dybde(
          kopi(st0),
          {
            ferdig: vunnet,
            nokkel: (n) => n.bord.map((k) => (k >= 0 ? 1 : 0)).join("") + "|" + n.bunke.length + "|" + verdiAv(topp(n.avfall)),
            barn: (n) => trekk(n).sort((a, b) => (b.fra === "b" ? 1 + apner(n, b.i) : 0) - (a.fra === "b" ? 1 + apner(n, a.i) : 0)),
            bruk: (n, m) => {
              const c = kopi(n);
              utfor(c, m);
              return c;
            },
          },
          maks || 300000,
        );
      }
      return { id: "topper", antall: 52, X, RAD, DEKKER, passer, del, kopi, fri, lovlig, utfor, trekk, igjen, vunnet, kode, fraKode, loser, fremgang: (st) => ({ n: 28 - igjen(st), av: 28 }) };
    })();

    // ---------- Pyramide ----------
    // 28 cards in a pyramid of seven rows, all face up; 24 in the stock. Two free cards that make 13
    // (ace 1, jack 11, queen 12) are taken out together; a king (13) goes alone. A card is free when
    // nothing lies on it. Turning the stock puts its top card face up beside it («trukket»); the card
    // drawn before goes onto the waste. The card drawn and the top of the waste can be used too. The
    // stock is gone through once. Won: all 52 cards are out (the pyramid, the stock and the waste).
    // Places: 0–27 the pyramid (row by row from the top), 28 the card drawn, 29 the top of the waste.
    // Moves: { fra: "s" }, { fra: "k", a } (a king), { fra: "p", a, b } (a pair, a < b).
    const pyramide = (() => {
      const RAD = [];
      for (let r = 0; r < 7; r++) for (let c = 0; c <= r; c++) RAD.push(r);
      const DEKKER = RAD.map((r, i) => (r < 6 ? [i + r + 1, i + r + 2] : []));
      // Every place that must be cleared before place i is free (all the cards below it, in a triangle).
      const UNDER = RAD.map((r, i) => {
        const c = i - (r * (r + 1)) / 2;
        const ut = [];
        for (let r2 = r + 1; r2 < 7; r2++) for (let c2 = c; c2 <= c + r2 - r; c2++) ut.push((r2 * (r2 + 1)) / 2 + c2);
        return ut;
      });
      const TRUKKET = 28;
      const AVFALL = 29;
      function del(fro, bytte) {
        const k = stokk52(fro, bytte);
        return { bord: k.slice(0, 28), bunke: k.slice(28), trukket: -1, avfall: [], kast: [] };
      }
      // Lost for certain: a pyramid card whose every partner still in play lies below it. Those must go
      // (each with another card of its own rank) before it is free – and then none is left for it.
      function laast(st) {
        const igjen = new Array(14).fill(0);
        const tell = (k) => k >= 0 && igjen[verdiAv(k)]++;
        st.bord.forEach(tell);
        st.bunke.forEach(tell);
        st.avfall.forEach(tell);
        tell(st.trukket);
        for (let i = 0; i < 28; i++) {
          const k = st.bord[i];
          if (k < 0 || verdiAv(k) === 13) continue;
          const mot = 13 - verdiAv(k);
          let under = 0;
          for (const j of UNDER[i]) if (st.bord[j] >= 0 && verdiAv(st.bord[j]) === mot) under++;
          if (under && under === igjen[mot]) return true;
        }
        return false;
      }
      const kopi = (st) => ({ bord: st.bord.slice(), bunke: st.bunke.slice(), trukket: st.trukket, avfall: st.avfall.slice(), kast: st.kast.slice() });
      const fri = (st, i) => st.bord[i] >= 0 && DEKKER[i].every((j) => st.bord[j] < 0);
      // The card that can be taken from a place, or -1.
      function kortPa(st, a) {
        if (heltall(a, 0, 27)) return fri(st, a) ? st.bord[a] : -1;
        if (a === TRUKKET) return st.trukket;
        if (a === AVFALL) return st.avfall.length ? topp(st.avfall) : -1;
        return -1;
      }
      // Every place that has a card to take now.
      const ledige = (st) => [...Array.from({ length: 28 }, (_, i) => i), TRUKKET, AVFALL].filter((a) => kortPa(st, a) >= 0);
      function lovlig(st, m) {
        if (!m) return false;
        if (m.fra === "s") return st.bunke.length > 0;
        if (m.fra === "k") {
          const k = kortPa(st, m.a);
          return k >= 0 && verdiAv(k) === 13;
        }
        if (m.fra === "p") {
          if (m.a === m.b) return false;
          const a = kortPa(st, m.a);
          const b = kortPa(st, m.b);
          return a >= 0 && b >= 0 && verdiAv(a) + verdiAv(b) === 13;
        }
        return false;
      }
      function ta(st, a) {
        const k = kortPa(st, a);
        if (a < 28) st.bord[a] = -1;
        else if (a === TRUKKET) st.trukket = -1;
        else st.avfall.pop();
        st.kast.push(k);
        return k;
      }
      function utfor(st, m) {
        if (m.fra === "s") {
          if (st.trukket >= 0) st.avfall.push(st.trukket);
          st.trukket = st.bunke.pop();
          return {};
        }
        // (The higher place first: taking the drawn card never changes which card is on the waste.)
        if (m.fra === "k") return { kort: [ta(st, m.a)] };
        const [x, y] = m.a > m.b ? [m.a, m.b] : [m.b, m.a];
        return { kort: [ta(st, x), ta(st, y)] };
      }
      function trekk(st) {
        const ut = [];
        const fri = ledige(st);
        for (const a of fri) if (verdiAv(kortPa(st, a)) === 13) ut.push({ fra: "k", a });
        for (let x = 0; x < fri.length; x++)
          for (let y = x + 1; y < fri.length; y++) {
            const m = { fra: "p", a: fri[x], b: fri[y] };
            if (lovlig(st, m)) ut.push(m);
          }
        if (st.bunke.length) ut.push({ fra: "s" });
        return ut;
      }
      const vunnet = (st) => st.kast.length === 52;
      const kode = (st) => [tilTegn(st.bord), tilTegn(st.bunke), tilTegn([st.trukket]), tilTegn(st.avfall), tilTegn(st.kast)].join(".");
      function fraKode(s) {
        const d = String(s).split(".");
        if (d.length !== 5 || d[2].length !== 1) return null;
        const st = { bord: fraTegn(d[0]), bunke: fraTegn(d[1]), trukket: fraTegn(d[2])[0], avfall: fraTegn(d[3]), kast: fraTegn(d[4]) };
        const ok = st.bord.length === 28 && st.bunke.length <= 24 && !st.bunke.includes(-1) && !st.avfall.includes(-1) && !st.kast.includes(-1) && hele([st.bord, st.bunke, [st.trukket], st.avfall, st.kast], 52, true);
        return ok ? st : null;
      }
      function loser(st0, maks) {
        return dybde(
          kopi(st0),
          {
            ferdig: vunnet,
            // (Only the ranks of the drawn card and the waste matter.)
            nokkel: (n) => n.bord.map((k) => (k >= 0 ? 1 : 0)).join("") + "|" + n.bunke.length + "|" + (n.trukket >= 0 ? verdiAv(n.trukket) : 0) + "|" + n.avfall.map((k) => TEGN[verdiAv(k)]).join(""),
            barn: (n) => {
              if (laast(n)) return [];
              const t = trekk(n);
              // A king never needs a partner: taking it at once is never worse.
              const konge = t.find((m) => m.fra === "k");
              if (konge) return [konge];
              const vekt = (m) => (m.fra === "s" ? 0 : (m.a < 28 ? 2 : 1) + (m.b < 28 ? 2 : 1));
              return t.sort((a, b) => vekt(b) - vekt(a));
            },
            bruk: (n, m) => {
              const c = kopi(n);
              utfor(c, m);
              return c;
            },
          },
          maks || 300000,
        );
      }
      return { id: "pyramide", antall: 52, RAD, DEKKER, UNDER, TRUKKET, AVFALL, laast, del, kopi, fri, kortPa, ledige, lovlig, utfor, trekk, vunnet, kode, fraKode, loser, fremgang: (st) => ({ n: st.kast.length, av: 52 }) };
    })();

    // ---------- FreeCell ----------
    // All 52 cards face up in eight columns (7, 7, 7, 7, 6, 6, 6, 6), four free cells, four foundations.
    // Build down in alternating colours; a free cell holds one card; an empty column takes any card.
    // Several cards move at once when there is room to move them one by one: (free cells + 1) ×
    // 2^(empty columns). Cards nothing can need any more go home by themselves.
    // Sources: { fra: "b", i, p } (column i from position p), { fra: "c", i } (free cell i).
    // Moves: a source + { til: "g" | "c" | "b", j }.
    const freecell = (() => {
      const trygg = (st, k) => {
        const v = verdiAv(k);
        if (v <= 2) return true;
        const mot = rod(k) ? [0, 3] : [1, 2];
        return st.grunn[mot[0]] >= v - 1 && st.grunn[mot[1]] >= v - 1;
      };
      const kanPaGrunn = (st, k) => st.grunn[sortAv(k)] === verdiAv(k) - 1;
      const kopi = (st) => ({ bord: st.bord.map((k) => k.slice()), celle: st.celle.slice(), grunn: st.grunn.slice() });
      const frie = (st) => st.celle.filter((k) => k < 0).length;
      const tomme = (st) => st.bord.filter((k) => !k.length).length;
      const kapasitet = (st, tilTom) => (frie(st) + 1) * 2 ** Math.max(0, tomme(st) - (tilTom ? 1 : 0));
      function loft(st, f) {
        if (!f) return null;
        if (f.fra === "c") return heltall(f.i, 0, 3) && st.celle[f.i] >= 0 ? [st.celle[f.i]] : null;
        if (f.fra !== "b" || !heltall(f.i, 0, 7)) return null;
        const kol = st.bord[f.i];
        if (!heltall(f.p, 0, kol.length - 1)) return null;
        const rekke = kol.slice(f.p);
        for (let n = 1; n < rekke.length; n++) if (!kanPaBord(rekke[n], rekke[n - 1])) return null;
        return rekke;
      }
      function lovlig(st, m) {
        const rekke = loft(st, m);
        if (!rekke) return false;
        if (m.til === "g") return rekke.length === 1 && m.j === sortAv(rekke[0]) && kanPaGrunn(st, rekke[0]);
        if (m.til === "c") return m.fra === "b" && rekke.length === 1 && heltall(m.j, 0, 3) && st.celle[m.j] < 0;
        if (m.til === "b") {
          if (!heltall(m.j, 0, 7) || (m.fra === "b" && m.j === m.i)) return false;
          const kol = st.bord[m.j];
          if (!kol.length) return rekke.length <= kapasitet(st, true);
          return rekke.length <= kapasitet(st, false) && kanPaBord(rekke[0], topp(kol));
        }
        return false;
      }
      function flytt(st, m) {
        const rekke = loft(st, m);
        if (m.fra === "c") st.celle[m.i] = -1;
        else st.bord[m.i].length = m.p;
        if (m.til === "g") st.grunn[m.j] += 1;
        else if (m.til === "c") st.celle[m.j] = rekke[0];
        else st.bord[m.j].push(...rekke);
        return rekke;
      }
      // The cards nothing can need any more go home, again and again. → [{ fra, i, k }]
      function autoHjem(st) {
        const ut = [];
        for (let igjen = true; igjen; ) {
          igjen = false;
          for (let i = 0; i < 4; i++) {
            const k = st.celle[i];
            if (k >= 0 && kanPaGrunn(st, k) && trygg(st, k)) {
              flytt(st, { fra: "c", i, til: "g", j: sortAv(k) });
              ut.push({ fra: "c", i, k });
              igjen = true;
            }
          }
          for (let i = 0; i < 8; i++) {
            const kol = st.bord[i];
            const k = topp(kol);
            if (k != null && kanPaGrunn(st, k) && trygg(st, k)) {
              flytt(st, { fra: "b", i, p: kol.length - 1, til: "g", j: sortAv(k) });
              ut.push({ fra: "b", i, k });
              igjen = true;
            }
          }
        }
        return ut;
      }
      function del(fro, bytte) {
        const k = stokk52(fro, bytte, true);
        const bord = [[], [], [], [], [], [], [], []];
        k.forEach((x, n) => bord[n % 8].push(x));
        const st = { bord, celle: [-1, -1, -1, -1], grunn: [0, 0, 0, 0] };
        autoHjem(st);
        return st;
      }
      // o.auto === false: only the move itself (the tests compare the bare rules).
      function utfor(st, m, o) {
        const kort = flytt(st, m);
        return { kort, auto: o && o.auto === false ? [] : autoHjem(st) };
      }
      // Every source with cards that may be lifted.
      function kilder(st) {
        const ut = [];
        for (let i = 0; i < 4; i++) if (st.celle[i] >= 0) ut.push({ fra: "c", i });
        st.bord.forEach((kol, i) => {
          for (let p = kol.length - 1; p >= 0; p--) {
            ut.push({ fra: "b", i, p });
            if (p > 0 && !kanPaBord(kol[p], kol[p - 1])) break;
          }
        });
        return ut;
      }
      function trekk(st) {
        const ut = [];
        for (const f of kilder(st)) {
          for (let j = 0; j < 4; j++) for (const til of ["g", "c"]) if (lovlig(st, { ...f, til, j })) ut.push({ ...f, til, j });
          for (let j = 0; j < 8; j++) if (lovlig(st, { ...f, til: "b", j })) ut.push({ ...f, til: "b", j });
        }
        return ut;
      }
      const hjem = (st) => st.grunn.reduce((a, b) => a + b, 0);
      const vunnet = (st) => hjem(st) === 52;
      const kode = (st) => [st.bord.map(tilTegn).join(","), tilTegn(st.celle), st.grunn.join(",")].join(".");
      function fraKode(s) {
        const d = String(s).split(".");
        if (d.length !== 3) return null;
        const st = { bord: d[0].split(",").map(fraTegn), celle: fraTegn(d[1]), grunn: d[2].split(",").map(Number) };
        if (st.bord.length !== 8 || st.celle.length !== 4 || st.grunn.length !== 4 || !st.grunn.every((v) => heltall(v, 0, 13)) || st.bord.some((k) => k.includes(-1))) return null;
        const grunn = st.grunn.map((v, s) => Array.from({ length: v }, (_, n) => s * 13 + n));
        return hele([...st.bord, st.celle, ...grunn], 52, true) ? st : null;
      }
      // The search: the moves a good player would think of (a free cell or an empty column only once,
      // whole runs onto a column), the safe cards home after each, and how near the end it looks.
      function barn(n) {
        const ut = [];
        const prov = (m) => lovlig(n, m) && ut.push(m);
        for (let i = 0; i < 4; i++) if (n.celle[i] >= 0) prov({ fra: "c", i, til: "g", j: sortAv(n.celle[i]) });
        n.bord.forEach((kol, i) => kol.length && prov({ fra: "b", i, p: kol.length - 1, til: "g", j: sortAv(topp(kol)) }));
        const tom = n.bord.findIndex((k) => !k.length);
        const celle = n.celle.indexOf(-1);
        n.bord.forEach((kol, i) => {
          if (!kol.length) return;
          let p0 = kol.length - 1;
          while (p0 > 0 && kanPaBord(kol[p0], kol[p0 - 1])) p0--;
          for (let j = 0; j < 8; j++) {
            if (j === i || !n.bord[j].length) continue;
            const t = topp(n.bord[j]);
            for (let p = p0; p < kol.length; p++) if (kanPaBord(kol[p], t)) prov({ fra: "b", i, p, til: "b", j });
          }
          if (tom >= 0 && p0 > 0) {
            const lengst = Math.max(p0, kol.length - kapasitet(n, true));
            prov({ fra: "b", i, p: lengst, til: "b", j: tom });
            if (lengst !== kol.length - 1) prov({ fra: "b", i, p: kol.length - 1, til: "b", j: tom });
          }
        });
        for (let i = 0; i < 4; i++) {
          const k = n.celle[i];
          if (k < 0) continue;
          for (let j = 0; j < 8; j++) if (n.bord[j].length) prov({ fra: "c", i, til: "b", j });
          if (tom >= 0) prov({ fra: "c", i, til: "b", j: tom });
        }
        if (celle >= 0) n.bord.forEach((kol, i) => kol.length && prov({ fra: "b", i, p: kol.length - 1, til: "c", j: celle }));
        return ut;
      }
      function h(n) {
        let dyp = 0;
        for (let s = 0; s < 4; s++) {
          if (n.grunn[s] === 13) continue;
          const k = s * 13 + n.grunn[s];
          for (const kol of n.bord) {
            const p = kol.indexOf(k);
            if (p >= 0) dyp += kol.length - 1 - p;
          }
        }
        let brudd = 0;
        for (const kol of n.bord) for (let p = 1; p < kol.length; p++) if (!kanPaBord(kol[p], kol[p - 1])) brudd++;
        return (52 - hjem(n)) * 5 + dyp * 3 + brudd * 2 + (4 - frie(n)) * 2 - tomme(n) * 3;
      }
      const nokkel = (n) => n.grunn.join("") + "|" + tilTegn(n.celle.slice().sort((a, b) => a - b)) + "|" + n.bord.map(tilTegn).sort().join(",");
      function loser(st0, maks) {
        return beste(
          kopi(st0),
          {
            ferdig: vunnet,
            nokkel,
            h,
            barn,
            bruk: (n, m) => {
              const c = kopi(n);
              utfor(c, m);
              return c;
            },
          },
          maks || 40000,
        );
      }
      return { id: "freecell", antall: 52, trygg, kanPaGrunn, kopi, kapasitet, loft, lovlig, utfor, autoHjem, del, kilder, trekk, hjem, vunnet, kode, fraKode, loser, fremgang: (st) => ({ n: hjem(st), av: 52 }) };
    })();

    // ---------- Edderkopp (Spider) ----------
    // Two decks, 104 cards: 54 in ten columns (6, 6, 6, 6, 5 …), only the top card face up; 50 in the
    // stock. A card goes on a card one higher, any suit; only a run in one suit moves together; an
    // empty column takes any card or run. The stock deals one card face up on every column – never
    // while a column is empty. A run from king to ace in one suit goes home by itself. Won: eight runs.
    // With 1 suit every card is a spade, with 2 spades and hearts. A card is its place in the two
    // decks, 0–103; ansikt(st, p) is the face (0–51 as in KABAL).
    // Moves: { fra: "s" }, { fra: "b", i, p, til: "b", j }.
    const edderkopp = (() => {
      const ANSIKT = (p, sorter) => (sorter === 1 ? p % 13 : sorter === 2 ? (((p / 13) | 0) % 2) * 13 + (p % 13) : p % 52);
      const ansikt = (st, p) => ANSIKT(p, st.sorter);
      function del(fro, sorter) {
        const s = [1, 2, 4].includes(sorter) ? sorter : 1;
        const k = stokk(104, fro);
        const bord = Array.from({ length: 10 }, () => []);
        for (let n = 0; n < 54; n++) bord[n % 10].push(k[n]);
        return { bord, skjult: bord.map((kol) => kol.length - 1), bunke: k.slice(54), hjem: [], sorter: s };
      }
      const kopi = (st) => ({ bord: st.bord.map((k) => k.slice()), skjult: st.skjult.slice(), bunke: st.bunke.slice(), hjem: st.hjem.slice(), sorter: st.sorter });
      // b lies on a in a run that moves together: face up, the same suit, one lower.
      const iRekke = (st, a, b) => sortAv(ansikt(st, a)) === sortAv(ansikt(st, b)) && verdiAv(ansikt(st, b)) === verdiAv(ansikt(st, a)) - 1;
      function loft(st, f) {
        if (!f || f.fra !== "b" || !heltall(f.i, 0, 9)) return null;
        const kol = st.bord[f.i];
        if (!heltall(f.p, st.skjult[f.i], kol.length - 1)) return null;
        for (let n = f.p + 1; n < kol.length; n++) if (!iRekke(st, kol[n - 1], kol[n])) return null;
        return kol.slice(f.p);
      }
      const kanDele = (st) => st.bunke.length > 0 && st.bord.every((k) => k.length > 0);
      function lovlig(st, m) {
        if (!m) return false;
        if (m.fra === "s") return kanDele(st);
        const rekke = loft(st, m);
        if (!rekke || m.til !== "b" || !heltall(m.j, 0, 9) || m.j === m.i) return false;
        const kol = st.bord[m.j];
        return !kol.length || verdiAv(ansikt(st, topp(kol))) === verdiAv(ansikt(st, rekke[0])) + 1;
      }
      // Does column i end in a whole run, king to ace in one suit?
      function hel(st, i) {
        const kol = st.bord[i];
        const n = kol.length;
        if (n < 13 || n - 13 < st.skjult[i] || verdiAv(ansikt(st, kol[n - 13])) !== 13) return false;
        for (let x = n - 12; x < n; x++) if (!iRekke(st, kol[x - 1], kol[x])) return false;
        return true;
      }
      function utfor(st, m) {
        const info = { snudd: [], ferdig: [] };
        const snu = (i) => {
          const kol = st.bord[i];
          if (!kol.length) st.skjult[i] = 0;
          else if (kol.length <= st.skjult[i]) {
            st.skjult[i] = kol.length - 1;
            info.snudd.push(i);
          }
        };
        const sjekk = (i) => {
          if (!hel(st, i)) return;
          const rekke = st.bord[i].splice(-13);
          st.hjem.push(...rekke);
          info.ferdig.push({ i, kort: rekke });
          snu(i);
        };
        if (m.fra === "s") {
          for (let i = 0; i < 10; i++) st.bord[i].push(st.bunke.pop());
          for (let i = 0; i < 10; i++) sjekk(i);
          return info;
        }
        const rekke = st.bord[m.i].splice(m.p);
        st.bord[m.j].push(...rekke);
        snu(m.i);
        sjekk(m.j);
        return info;
      }
      function trekk(st) {
        const ut = [];
        st.bord.forEach((kol, i) => {
          for (let p = kol.length - 1; p >= st.skjult[i]; p--) {
            if (p < kol.length - 1 && !iRekke(st, kol[p], kol[p + 1])) break;
            for (let j = 0; j < 10; j++) if (lovlig(st, { fra: "b", i, p, til: "b", j })) ut.push({ fra: "b", i, p, til: "b", j });
          }
        });
        if (kanDele(st)) ut.push({ fra: "s" });
        return ut;
      }
      const vunnet = (st) => st.hjem.length === 104;
      const kode = (st) => [st.bord.map(tilTegn).join(","), st.skjult.join(","), tilTegn(st.bunke), tilTegn(st.hjem), st.sorter].join(".");
      function fraKode(s) {
        const d = String(s).split(".");
        if (d.length !== 5) return null;
        const st = { bord: d[0].split(",").map(fraTegn), skjult: d[1].split(",").map(Number), bunke: fraTegn(d[2]), hjem: fraTegn(d[3]), sorter: Number(d[4]) };
        if (st.bord.length !== 10 || st.skjult.length !== 10 || ![1, 2, 4].includes(st.sorter) || st.bunke.length % 10 || st.hjem.length % 13) return null;
        if (!st.skjult.every((h, i) => heltall(h, 0, 103) && (st.bord[i].length ? h < st.bord[i].length : h === 0))) return null;
        if (!hele([...st.bord, st.bunke, st.hjem], 104)) return null;
        // Every run at home is whole.
        for (let n = 0; n < st.hjem.length; n += 13) {
          const r = st.hjem.slice(n, n + 13);
          if (verdiAv(ansikt(st, r[0])) !== 13 || r.some((k, x) => x > 0 && !iRekke(st, r[x - 1], k))) return null;
        }
        return st;
      }
      // A sensible next move without searching: a run home, a card turned, a run in one suit made
      // longer, an empty column put to use; else deal; else anything that is not just a shuffle.
      function hint(st) {
        let best = null;
        let bestP = 0;
        let reserve = null;
        for (const m of trekk(st)) {
          if (m.fra === "s") continue;
          const kol = st.bord[m.i];
          const forste = ansikt(st, kol[m.p]);
          const mal = st.bord[m.j];
          const under = m.p > 0 ? kol[m.p - 1] : null;
          const underOpp = under != null && m.p - 1 >= st.skjult[m.i];
          const avdekker = m.p > 0 && m.p === st.skjult[m.i];
          const sitter = underOpp && verdiAv(ansikt(st, under)) === verdiAv(forste) + 1;
          const sitterSamme = sitter && sortAv(ansikt(st, under)) === sortAv(forste);
          let p;
          if (!mal.length) {
            if (m.p === 0 || sitter) continue; // a whole column to an empty one, or off a good card
            p = avdekker ? 45 : 0;
            if (!reserve || kol.length - m.p < reserve.n) reserve = { m, n: kol.length - m.p };
            if (!p) continue;
          } else {
            const samme = sortAv(ansikt(st, topp(mal))) === sortAv(forste);
            if (sitterSamme || (sitter && !samme)) continue; // breaks a run, or only moves it sideways
            p = 20 + (samme ? 40 : 0) + (avdekker ? 50 : 0) + (m.p === 0 ? 30 : 0) + (kol.length - m.p);
            if (samme) {
              const c = kopi(st);
              if (utfor(c, m).ferdig.length) p += 500;
            }
          }
          if (p > bestP) {
            bestP = p;
            best = m;
          }
        }
        if (best) return best;
        if (kanDele(st)) return { fra: "s" };
        return reserve ? reserve.m : null;
      }
      return { id: "edderkopp", antall: 104, ANSIKT, ansikt, del, kopi, iRekke, loft, kanDele, lovlig, hel, utfor, trekk, vunnet, kode, fraKode, hint, fremgang: (st) => ({ n: st.hjem.length / 13, av: 8 }) };
    })();

    return { stokk, TEGN, tilTegn, fraTegn, golf, topper, pyramide, freecell, edderkopp };
  })();

  // node:test loads this file without the kit: hand over the rules and stop.
  if (typeof window === "undefined" || !window.Rusj) {
    const g = typeof globalThis !== "undefined" ? globalThis : this;
    g.KortkongenRegler = KABAL;
    g.KortkongenVarianter = VARIANTER;
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
    // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
    const SORTER = [
      { navn: R.t("spar"), rod: false },
      { navn: R.t("hjerter"), rod: true },
      { navn: R.t("ruter"), rod: true },
      { navn: R.t("kløver"), rod: false },
    ];
    const BOKSTAV = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const VERDINAVN = ["", R.t("ess"), "2", "3", "4", "5", "6", "7", "8", "9", "10", R.t("knekt"), R.t("dame"), R.t("konge")];
    // «en 7-er», «et ess», «en dame»: for questions like «Har noen en 7-er?» (not used in Kortkongen,
    // so it stays Norwegian here).
    const MED_ARTIKKEL = ["", "et ess", "en 2-er", "en 3-er", "en 4-er", "en 5-er", "en 6-er", "en 7-er", "en 8-er", "en 9-er", "en 10-er", "en knekt", "en dame", "en konge"]; // sprak-ok
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
    // «spar 7», «hjerter dame» (English «7 of spades», «queen of hearts»)
    const navn = (k) => R.t("{sort} {verdi}", { sort: SORTER[sortAv(k)].navn, verdi: VERDINAVN[verdiAv(k)] });
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
    1: { navn: R.t("Ett kort"), kort: R.t("ett kort"), tekst: R.t("Trekk ett kort fra bunken. Roligere – flere kabaler går opp.") },
    3: { navn: R.t("Tre kort"), kort: R.t("tre kort"), tekst: R.t("Trekk tre kort om gangen. Klassisk og mer vrient.") },
  };
  const MAKS_ANGRE = 1500;
  const tomStat = () => ({ spilt: 0, vunnet: 0, rekke: 0, besteRekke: 0, besteTid: 0, faerrest: 0 });
  const tomDagstat = () => ({ rekke: 0, sist: 0, beste: 0, lost: 0 }); // «Dagens kabal»: days in a row, the last day solved

  // Two games can be going at once and never share a slot: S.spill is the one on the table, S.annet
  // waits beside it. «Dagens kabal» has `dag` (R.dag().nr) and `dato`; free play has neither.
  const iDag = () => R.dag().nr;
  const erDagens = (sp) => !!(sp && sp.dag != null);
  const dagensSpill = (S) => [S.spill, S.annet].find((x) => x && x.dag === iDag()) || null;
  const frittSpill = (S) => [S.spill, S.annet].find((x) => x && x.dag == null) || null;
  const iGang = (sp) => !!(sp && !sp.ferdig);
  const pagar = (S) => iGang(frittSpill(S)) || !!(iGang(dagensSpill(S)) && dagensSpill(S).startet);
  // Days in a row with the daily solved, as it stands today (yesterday's streak still lives).
  const dagrekke = (S) => (S.dstat && (S.dstat.sist === iDag() || S.dstat.sist === iDag() - 1) ? S.dstat.rekke : 0);

  let H; // the actions, so one can call another
  let st = null; // the position being played (parsed from S.spill.kode)
  let L = null; // board measurements
  let laast = false; // dealing, auto-finish or victory: no input
  let klokkeFra = null; // performance.now() when the clock last started
  let nyDeling = false; // deal with an animation on the next draw of the board
  let hintId = null;
  let laastVist = null; // the lost position the note «kan ikke gå opp herfra» was last shown for
  let valgt = null; // a card picked with a tap that has more than one place to go: { fra, mal, kort }
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
    if (samme && erDagens(S.spill)) return nyDagens(S, true);
    leggFram(S, "fri");
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
    S.spill = delUt(fro, variant, modus, losbar);
    R.statistikk("start", { modus: modus === 3 ? "tre" : "en", losbar });
  }

  // A fresh game object, and its position in `st`. `ok` / `dod`: how many moves into the game the
  // newest position known to be solvable / the first one proven lost lies (−1: not known). A deal
  // from the proven list can be solved from the start.
  function delUt(fro, variant, modus, losbar, ekstra) {
    st = KABAL.del(fro, variant, modus);
    const kode = KABAL.kode(st);
    klokkeFra = null;
    nyDeling = true;
    laastVist = null;
    return Object.assign(
      { fro, variant, modus, losbar, kode, start: kode, angre: [], trekk: 0, tid: 0, hint: 0, spolt: 0, ok: losbar ? 0 : -1, dod: -1, startet: false, ferdig: false, vunnet: false, talt: false, resultat: null },
      ekstra || {},
    );
  }

  // Puts free play ("fri") or today's daily ("dag") on the table; the other one waits beside it.
  // A daily from another day is dropped here. Returns the game now on the table (or null).
  function leggFram(S, hva) {
    const fri = frittSpill(S);
    const dag = dagensSpill(S);
    const frem = hva === "dag" ? dag : fri;
    if (S.spill !== frem) {
      stoppKlokke(S);
      st = null;
      laastVist = null;
    }
    S.spill = frem;
    S.annet = hva === "dag" ? fri : dag;
    if (S.spill && !st) st = KABAL.fraKode(S.spill.kode);
    return S.spill;
  }

  // «Dagens kabal» dealt fresh: the first time today, or «start på nytt» (the same cards and the
  // same number of cards drawn).
  function nyDagens(S, bevarModus) {
    const dag = R.dag();
    const gammel = dagensSpill(S);
    const fri = frittSpill(S);
    const { fro, variant } = KABAL.dagens(dag.tekst, LOSBARE.tre);
    const modus = bevarModus && gammel ? gammel.modus : S.oppsett.modus;
    stoppKlokke(S);
    S.annet = fri;
    S.spill = delUt(fro, variant, modus, true, { dag: dag.nr, dato: dag.tekst });
    R.statistikk("start", { modus: modus === 3 ? "tre" : "en", losbar: true, dagens: true });
  }

  // Today's daily on the table – dealt if this is the first visit today. Returns the screen to show.
  function tilDagens(S) {
    const d = dagensSpill(S);
    // Not begun yet: it follows the setup (one or three cards).
    if (!d || (!d.startet && !d.ferdig && d.modus !== S.oppsett.modus)) nyDagens(S);
    else leggFram(S, "dag");
    return S.spill.ferdig ? "slutt" : "spill";
  }

  // The front page's «I dag» strip (rusj/DAGLIG.md): solved today, or how far the daily has come.
  const kortHjem = (kode) => kode.split(".")[2].split(",").reduce((a, b) => a + Number(b), 0);
  function meldDagens(S) {
    const d = dagensSpill(S);
    if (!d) return;
    if (d.ferdig && d.vunnet) R.dagligFerdig({ vunnet: true, rekke: dagrekke(S), res: visTid(((d.resultat && d.resultat.sek) || Math.round(d.tid / 1000)) * 1000) });
    else if (d.startet && typeof R.dagligIGang === "function") R.dagligIGang({ tekst: R.t("{n} av 52 hjem", { n: kortHjem(d.kode) }) });
  }

  // Count a game in the statistics (once): a win, or a started free game that was given up.
  // (The daily can be tried again until midnight, so only solving it counts.)
  function registrer(S, vant) {
    const sp = S.spill;
    if (!sp || sp.talt || (!vant && (!sp.startet || erDagens(sp)))) return null;
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
    if (vant && erDagens(sp)) {
      // Days in a row: yesterday's streak goes on, anything older starts again at 1.
      const d = (S.dstat = Object.assign(tomDagstat(), S.dstat || {}));
      if (d.sist !== sp.dag) {
        d.rekke = d.sist === sp.dag - 1 ? d.rekke + 1 : 1;
        d.sist = sp.dag;
        d.lost += 1;
        d.beste = Math.max(d.beste, d.rekke);
      }
      res.dagrekke = d.rekke;
      meldDagens(S);
    }
    R.statistikk("ferdig", { vunnet: vant, sek, trekk: sp.trekk, modus: sp.modus === 3 ? "tre" : "en", hint: sp.hint, dagens: erDagens(sp) });
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
    // A phone on its side (see spill.css): the toolbar stands beside the table, not under it.
    const under = dokk && getComputedStyle(dokk).position === "static" ? 10 : mellom + (dokk ? dokk.offsetHeight : 0);
    const H = Math.max(200, Math.floor(window.innerHeight - topp - under - 2));
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
    if (!p.opp) return R.t("Kort med baksiden opp");
    const navn = KORT.Navn(k);
    if (p.hvor === "bord") return R.t("{kort}, kolonne {n}", { kort: navn, n: p.i + 1 });
    if (p.hvor === "avfall") return R.t("{kort}, trukket fra bunken", { kort: navn });
    return R.t("{kort}, lagt hjem", { kort: navn });
  }

  // The cards and the stock in the order of the table – foundations, waste, stock, then the columns
  // from the left, each from the top – so the keyboard and screen readers walk the table as it looks.
  // Done when the cards have come to rest (moving an element stops its slide).
  let ordneId = null;
  function ordneSnart() {
    clearTimeout(ordneId);
    ordneId = setTimeout(ordne, 420);
  }
  function ordne() {
    const brett = R.$("#kk-brett");
    if (!brett || !st) return;
    if (dra || laast) return ordneSnart();
    const rekke = [];
    st.grunn.forEach((v, s) => {
      for (let n = 0; n < v; n++) rekke.push(kortEl(s * 13 + n));
    });
    st.avfall.forEach((k) => rekke.push(kortEl(k)));
    rekke.push(R.$("#kk-bunke"));
    st.bunke.forEach((k) => rekke.push(kortEl(k)));
    st.bord.forEach((kol) => kol.forEach((k) => rekke.push(kortEl(k))));
    const fokus = document.activeElement;
    let forrige = R.$("#kk-b6");
    for (const el of rekke) {
      if (!el || !forrige) continue;
      if (forrige.nextElementSibling !== el) forrige.after(el);
      forrige = el;
    }
    if (fokus && fokus !== document.activeElement && brett.contains(fokus)) fokus.focus({ preventScroll: true });
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
      bunke.setAttribute("aria-label", st.bunke.length ? R.t("Bunken, {antall} igjen. Trykk for å trekke {kort}.", { antall: R.flertall(st.bunke.length, "kort", "kort"), kort: MODUS[st.modus].kort }) : st.avfall.length ? R.t("Bunken er tom. Trykk for å legge kortene tilbake.") : R.t("Bunken er tom"));
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
    ordneSnart();
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
    const forMange = sp.angre.length - MAKS_ANGRE;
    if (forMange > 0) {
      sp.angre.splice(0, forMange);
      // The oldest steps are gone: what is known about the game moves with the list.
      sp.ok = sp.ok >= forMange ? sp.ok - forMange : -1;
      sp.dod = sp.dod < 0 ? -1 : Math.max(0, sp.dod - forMange);
    }
  }

  // A move said aloud for screen readers: «Spar 7 til kolonne 3», «Trakk ruter 9».
  function siTrekk(t, flyttet, snudd) {
    if (t.fra === "s") return R.si(st.avfall.length ? R.t("Trakk {kort}", { kort: KORT.navn(st.avfall[st.avfall.length - 1]) }) : R.t("Kortene er lagt tilbake i bunken"));
    const kol = t.fra === "b" ? st.bord[t.i] : null;
    const under = snudd && kol && kol.length ? `. ${R.t("{kort} ble snudd", { kort: KORT.Navn(kol[kol.length - 1]) })}` : "";
    R.si(`${KORT.Navn(flyttet[0])}${flyttet.length > 1 ? ` ${R.t("og {antall} til", { antall: R.flertall(flyttet.length - 1, "kort", "kort") })}` : ""} ${t.til === "g" ? R.t("hjem") : R.t("til kolonne {n}", { n: t.j + 1 })}${under}`);
  }

  // Carries out a move from the player (or from auto-finish). Returns true when it was legal.
  function gjor(t, o = {}) {
    const S = R.S;
    const sp = S.spill;
    if (!sp || sp.ferdig || !KABAL.lovlig(st, t)) return false;
    skjulHint();
    opphevValg();
    visLaast(false);
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
    if (!o.auto) siTrekk(t, flyttet, res.snudd);
    R.lagre();
    if (!o.auto) etterTrekk(S);
    return true;
  }

  // After every move: won? solved (everything face up)? Otherwise: can it still be solved?
  function etterTrekk(S) {
    if (KABAL.vunnet(st)) return vinn(S);
    const plan = fullforPlan(st);
    if (plan) return autoFullfor(S, plan);
    sjekkSnart(S);
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
    R.toast(R.t("Løst! Kortene går hjem av seg selv."));
    R.si(R.t("Kabalen er løst. Kortene går hjem av seg selv."));
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

  // A tap (or Enter) on a card. One place to go: it moves at once. Several: the card is picked, the
  // places light up, and the next tap chooses – a place, or the card again for the best one.
  function trykkPa(fra) {
    if (laast || !st) return;
    if (valgt) {
      const v = valgt;
      const sammeKort = v.fra.fra === fra.fra && v.fra.i === fra.i && v.fra.p === fra.p;
      // A tap on a card in a lit-up column (or on a lit-up foundation) puts the picked card there.
      const her = fra.fra === "a" ? "a" : fra.fra + fra.i;
      const dit = sammeKort ? v.mal[0] : v.mal.find((m) => m.til + m.j === her);
      opphevValg();
      if (dit) return void gjor(dit);
    }
    const mal = KABAL.alleMal(st, fra);
    const rekke = KABAL.loft(st, fra) || [];
    // (Home is not a choice when nothing could ever need to lie on the card.)
    if (mal.length === 1 || (mal.length && mal[0].til === "g" && KABAL.tryggHjem(st, rekke[0]))) return void gjor(mal[0]);
    if (mal.length) return velg(fra, mal, rekke);
    // Nowhere to go: a little shake.
    for (const k of rekke) {
      const el = kortEl(k);
      if (!el || R.rolig()) continue;
      el.classList.remove("kk-nei");
      void el.offsetWidth;
      el.classList.add("kk-nei");
      setTimeout(() => el.classList.remove("kk-nei"), 420);
    }
    lyd.nei();
    if (rekke.length) R.si(R.t("{kort} kan ikke flyttes nå", { kort: KORT.Navn(rekke[0]) }));
  }

  // Picks a card that has more than one place to go and lights the places up (an empty place is a
  // button while it is lit).
  function velg(fra, mal, rekke) {
    valgt = { fra, mal, kort: rekke };
    rekke.forEach((k) => kortEl(k) && kortEl(k).classList.add("kk-valgt"));
    const steder = mal.map((m) => {
      const el = malEl(m);
      if (el) {
        el.classList.add("kk-mal", "kk-velg");
        if (el.classList.contains("kk-plass")) {
          el.disabled = false;
          el.tabIndex = 0;
          el.removeAttribute("aria-hidden");
        }
      }
      const kol = st.bord[m.j];
      return m.til === "g" ? R.t("hjem") : kol.length ? R.t("på {kort}", { kort: KORT.navn(kol[kol.length - 1]) }) : R.t("på den tomme plassen");
    });
    R.lyd.klikk();
    const hvor = steder.length > 1 ? `${steder.slice(0, -1).join(", ")} ${R.t("eller")} ${steder[steder.length - 1]}` : steder[0];
    const kort = KORT.Navn(rekke[0]);
    R.si(rekke.length > 1 ? R.t("{kort} er valgt. Trykk der kortene skal ligge: {hvor}. Eller trykk på kortet igjen.", { kort, hvor }) : R.t("{kort} er valgt. Trykk der kortet skal ligge: {hvor}. Eller trykk på kortet igjen.", { kort, hvor }));
    const S = R.S;
    if ((S.valgtips || 0) < 3) {
      S.valgtips = (S.valgtips || 0) + 1;
      R.toast(R.t("Trykk der kortet skal ligge – eller på kortet igjen"));
    }
  }
  function opphevValg() {
    if (!valgt) return;
    valgt = null;
    R.$$("#kk-brett .kk-valgt").forEach((el) => el.classList.remove("kk-valgt"));
    R.$$("#kk-brett .kk-velg").forEach((el) => {
      el.classList.remove("kk-mal", "kk-velg");
      if (el.classList.contains("kk-plass")) {
        el.disabled = true;
        el.tabIndex = -1;
        el.setAttribute("aria-hidden", "true");
      }
    });
  }
  // A tap on a lit-up empty place.
  function velgPlass(el) {
    if (!valgt || laast) return;
    const dit = valgt.mal.find((m) => "kk-" + m.til + m.j === el.id);
    opphevValg();
    if (dit) gjor(dit);
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

  // ---------- Hints and «can it still be solved?» ----------

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

  // The solver answers for one position at a time, a few milliseconds per turn of the event loop, so
  // the board never freezes: first the quick search; if that finds nothing, the full one, which can
  // prove that the position is lost. → { s: "ok" | "dod" | "uviss", trekk } (null: overtaken)
  const TAK_RASK = 20000;
  const TAK_FULL = 150000;
  const kjent = new Map(); // position code → answer (the newest 300)
  let jobb = null;
  function analyser(kode) {
    if (kjent.has(kode)) return Promise.resolve(kjent.get(kode));
    if (jobb && jobb.kode === kode && !jobb.avbrutt) return jobb.svar;
    if (jobb) jobb.avbrutt = true;
    const j = (jobb = { kode, avbrutt: false, svar: null });
    j.svar = new Promise((ferdig) => {
      const fra = KABAL.fraKode(kode);
      if (!fra) return ferdig(null);
      // Drawing one: a way to the end found with the stricter three-card rules holds here too, and
      // the quick search often finds that one when its own order of moves leads it astray.
      const sok = [
        () => KABAL.loser(fra, fra.modus === 3 ? TAK_RASK * 3 : TAK_RASK),
        fra.modus === 1 ? () => KABAL.loser(Object.assign(KABAL.kopi(fra), { modus: 3 }), TAK_RASK * 2) : null,
        () => KABAL.loser(fra, TAK_FULL, { full: true }),
      ].filter(Boolean);
      let l = sok.shift()();
      const steg = () => {
        if (j.avbrutt) return ferdig(null);
        const t0 = performance.now();
        let over = false;
        while (!over && performance.now() - t0 < 7) over = l.kjor(300);
        if (!over) return setTimeout(steg, 0);
        const r = l.resultat();
        if (!r.trekk && sok.length) {
          l = sok.shift()();
          return setTimeout(steg, 0);
        }
        // (Only the last search, the full one, can say «lost».)
        const svar = { s: r.trekk ? "ok" : r.uttomt ? "dod" : "uviss", trekk: r.trekk };
        kjent.set(kode, svar);
        if (kjent.size > 300) kjent.delete(kjent.keys().next().value);
        if (jobb === j) jobb = null;
        ferdig(svar);
      };
      setTimeout(steg, 0);
    });
    return j.svar;
  }

  // «Kan fortsatt gå opp?» – asked a moment after every move. Along one line of play the answer can
  // only go from yes to no, so a game that is proven lost stays lost until moves are taken back.
  let sjekkId = null;
  function sjekkSnart(S, ms) {
    clearTimeout(sjekkId);
    sjekkId = setTimeout(() => sjekkStilling(R.S), ms == null ? 240 : ms);
  }
  function sjekkStilling(S) {
    const sp = S && S.spill;
    if (!sp || sp.ferdig || !st || S.skjerm !== "spill") return;
    const kode = sp.kode;
    const bruk = (svar) => {
      if (!svar || R.S.spill !== sp || sp.kode !== kode || sp.ferdig || R.S.skjerm !== "spill") return;
      const n = sp.angre.length;
      if (svar.s === "ok") {
        sp.ok = n;
        sp.dod = -1;
      } else if (svar.s === "dod" && (sp.dod < 0 || sp.dod > n)) sp.dod = n;
      visStatus(svar.s);
      if (svar.s === "dod") meldLaast(S);
    };
    const n = sp.angre.length;
    if (sp.dod >= 0 && n >= sp.dod) return bruk({ s: "dod" });
    if (sp.ok === n) return visStatus("ok");
    analyser(kode).then(bruk);
  }

  // The chip in the top row: «Kan gå opp», «Låst» (a button: shows the note again) or «Uvisst».
  function visStatus(s) {
    const el = R.$("#kk-status");
    if (!el || el.dataset.s === s) return;
    el.dataset.s = s;
    el.innerHTML =
      s === "ok"
        ? `<span class="kk-stat kk-losbar" title="${esc(R.t("Kabalen kan fortsatt gå opp"))}">${IKON.hake}${esc(R.t("Kan gå opp"))}</span>`
        : s === "dod"
          ? `<button class="kk-stat kk-laast" type="button" data-h="laast" aria-label="${esc(R.t("Låst: kabalen kan ikke gå opp herfra. Vis hva du kan gjøre."))}">${IKON.las}${esc(R.t("Låst"))}</button>`
          : s === "uviss"
            ? `<span class="kk-stat kk-uviss" title="${esc(R.t("Vanskelig å si om kabalen kan gå opp herfra"))}">${esc(R.t("Uvisst"))}</span>`
            : "";
  }

  // The note over the bottom of the table: the game is proven lost from here.
  function visLaast(vis) {
    const el = R.$("#kk-fast");
    if (!el) return;
    const sp = R.S.spill;
    if (!vis || !sp) {
      el.hidden = true;
      return;
    }
    const fraStart = sp.dod === 0; // lost before the first move: nothing to go back to
    R.$("#kk-fast-tekst").textContent = fraStart ? R.t("Denne kabalen kan ikke gå opp.") : R.t("Herfra kan ikke kabalen gå opp.");
    R.$("#kk-spol").hidden = fraStart;
    el.hidden = false;
  }
  function meldLaast(S) {
    const sp = S.spill;
    const merke = sp.start + "|" + sp.dod;
    if (laastVist === merke) return;
    laastVist = merke;
    visLaast(true);
    lyd.nei();
    R.si(sp.dod === 0 ? R.t("Denne kabalen kan ikke gå opp.") : R.t("Herfra kan ikke kabalen gå opp. Du kan spole tilbake til siste stilling som kan gå opp."));
  }

  // Back to the newest position that can still be solved. The answer along a line of play only goes
  // from yes to no, so the place is found by halving between the last known «yes» and the «no».
  async function spolTilbake(S) {
    const sp = S.spill;
    if (laast || !sp || sp.ferdig || !st) return;
    const n = sp.angre.length;
    const kodeVed = (i) => (i >= n ? sp.kode : sp.angre[i].split("|")[0]);
    const fortsatt = R.vakt();
    const venter = (pa) => {
      const knapp = R.$("#kk-spol");
      if (knapp) knapp.classList.toggle("venter", pa);
      laast = pa;
      oppdaterHud();
    };
    let avbrutt = false;
    const kan = async (i) => {
      const svar = await analyser(kodeVed(i));
      if (!svar || !fortsatt() || R.S.spill !== sp) avbrutt = true;
      return !!svar && svar.s === "ok";
    };
    clearTimeout(sjekkId);
    opphevValg();
    skjulHint();
    venter(true);
    let lo = Math.min(sp.ok, n);
    let hi = sp.dod >= 0 ? Math.min(sp.dod, n) : n;
    if (lo < 0 && hi > 0 && (await kan(0))) lo = 0;
    while (!avbrutt && lo >= 0 && hi - lo > 1) {
      const midt = (lo + hi) >> 1;
      if (await kan(midt)) lo = midt;
      else hi = midt;
    }
    if (avbrutt) {
      if (R.S.spill === sp) venter(false);
      return;
    }
    venter(false);
    const ny = lo >= 0 && lo < n ? KABAL.fraKode(kodeVed(lo)) : null;
    if (!ny) {
      R.toast(R.t("Fant ingen stilling som kan gå opp. Prøv en ny kabal."));
      return;
    }
    const tekst = R.t("Spolt tilbake {trekk}. Herfra kan kabalen gå opp.", { trekk: R.flertall(n - lo, "trekk", "trekk") });
    st = ny;
    sp.kode = kodeVed(lo);
    sp.trekk = Number(sp.angre[lo].split("|")[1]) || 0;
    sp.angre.length = lo;
    sp.ok = lo;
    sp.dod = -1;
    sp.spolt = (sp.spolt || 0) + 1;
    laastVist = null;
    visLaast(false);
    plasser({ animer: true });
    visStatus("ok");
    R.lyd.tone(600, 0, 0.08, "triangle", 0.07, 420);
    R.lyd.tone(450, 0.09, 0.1, "triangle", 0.07, 320);
    R.lagre();
    R.toast(tekst);
    R.si(tekst);
  }

  // A hint: the first move of a way to the end, from what the solver knows about this position.
  // If it has not looked yet, it thinks in small steps while the button shows that it is working.
  let hinter = false;
  async function visHint(S) {
    const sp = S.spill;
    if (laast || !st || !sp || hinter) return;
    skjulHint();
    opphevValg();
    const kode = sp.kode;
    let svar = kjent.get(kode);
    if (!svar) {
      const knapp = () => R.$('#skjerm [data-h="hint"]');
      hinter = true;
      if (knapp()) knapp().classList.add("venter");
      svar = await analyser(kode);
      hinter = false;
      if (knapp()) knapp().classList.remove("venter");
      if (!svar || R.S.spill !== sp || sp.kode !== kode || R.S.skjerm !== "spill" || laast) return;
    }
    if (svar.s === "dod") {
      // No way to the end from here: say so instead of pointing at a move that leads nowhere.
      if (sp.dod < 0 || sp.dod > sp.angre.length) sp.dod = sp.angre.length;
      visStatus("dod");
      laastVist = sp.start + "|" + sp.dod;
      visLaast(true);
      R.toast(sp.dod === 0 ? R.t("Denne kabalen kan ikke gå opp.") : R.t("Herfra kan ikke kabalen gå opp. Spol tilbake, så får du hint derfra."));
      return;
    }
    let t = svar.trekk && svar.trekk.length ? KABAL.forsteSteg(st, svar.trekk[0]) : null;
    if (t && !KABAL.lovlig(st, t)) t = null;
    if (!t) t = KABAL.enkeltHint(st);
    if (!t) {
      R.toast(R.t("Ingen flere trekk. Angre, eller start en ny kabal."));
      return;
    }
    sp.hint += 1;
    const el = [];
    let tekst;
    if (t.fra === "s") {
      el.push(R.$("#kk-bunke"));
      tekst = st.bunke.length ? R.t("Trekk fra bunken") : R.t("Legg kortene tilbake i bunken");
    } else {
      const rekke = KABAL.loft(st, t);
      rekke.forEach((k) => el.push(kortEl(k)));
      el.push(malEl(t));
      const hvor = t.til === "g" ? R.t("hjem") : st.bord[t.j].length ? R.t("til {kort}", { kort: KORT.navn(st.bord[t.j][st.bord[t.j].length - 1]) }) : R.t("til den tomme plassen");
      tekst = R.t("Flytt {kort} {hvor}", { kort: KORT.navn(rekke[0]), hvor });
    }
    el.filter(Boolean).forEach((e) => e.classList.add("kk-hint"));
    R.toast(tekst.charAt(0).toUpperCase() + tekst.slice(1));
    R.si(tekst);
    R.lyd.pling();
    hintId = setTimeout(skjulHint, 2600);
    R.lagre();
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
      opphevValg();
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
    if (!paBrettet() || laast || !e.target.closest) return;
    // A lit-up empty place takes the picked card; a tap beside the cards lets it go.
    const plass = e.target.closest(".kk-plass.kk-velg");
    if (plass) return velgPlass(plass);
    const el = e.target.closest(".kk-kort");
    if (!el) {
      if (valgt && e.target.closest("#kk-brett") && !e.target.closest("[data-h]")) opphevValg();
      return;
    }
    if (performance.now() - sistPeker < 600) return;
    const fra = kildeFor(Number(el.dataset.k));
    if (fra) trykkPa(fra);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !valgt || !paBrettet()) return;
    opphevValg();
    R.si(R.t("Kortet er sluppet"));
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
    las: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    spol: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 7l-6 5 6 5zM20 7l-6 5 6 5z"/></svg>',
  };

  // ---------- «Dagens kabal»: the date, the countdown to the next one, the text to share ----------

  // Norwegian dates by hand (as before); the other editions ask Intl in their own language.
  const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]; // sprak-ok
  const datoLang = (dato) =>
    R.sprak === "nb" ? `${Number(dato.slice(8))}. ${MND[Number(dato.slice(5, 7)) - 1] || ""}` : new Intl.DateTimeFormat(R.lokale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(dato + "T12:00:00Z")); // "2026-11-11" → «11. november» / «11 November»
  const datoKort = (dato) => R.t("{dag}.{maned}.", { dag: Number(dato.slice(8)), maned: Number(dato.slice(5, 7)) }); // → «11.11.» (English «11/11»)
  // The game's name and address in this edition.
  const delNavn = () => (window.RUSJ_SPILL || {}).navn || "Kortkongen";
  const DEL_URL = `https://rusj.no${R.forside}${(window.RUSJ_SPILL || {}).slug || "kortkongen"}/`;

  // Seconds until midnight in the edition's country (the two nights a year the clocks change, the day is 23 or 25 hours).
  function tilMidnatt() {
    if (typeof R.tilMidnatt === "function") return R.tilMidnatt();
    const na = Date.now();
    const d = {};
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: R.tidssone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(na)).forEach((p) => (d[p.type] = Number(p.value)));
    } catch (e) {
      const n = new Date(na);
      Object.assign(d, { hour: n.getHours(), minute: n.getMinutes(), second: n.getSeconds() });
    }
    let igjen = 86400 - ((d.hour % 24) * 3600 + d.minute * 60 + d.second);
    const dag = R.dag(new Date(na)).nr;
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const to = (n) => String(n).padStart(2, "0");
  const klokke = (s) => `${to(Math.floor(s / 3600))}:${to(Math.floor((s % 3600) / 60))}:${to(s % 60)}`; // HH:MM:SS
  const nedtellingHtml = () => `<span class="kk-nedtelling">${esc(R.t("Ny kabal om {tid}")).replace("{tid}", `<b>${klokke(tilMidnatt())}</b>`)}</span>`;
  // Keeps every countdown on the screen alive; at midnight the screen is drawn again (a new daily).
  function startNedtelling() {
    const dag = iDag();
    const id = setInterval(() => {
      const el = R.$$("#skjerm .kk-nedtelling b");
      if (iDag() !== dag) {
        clearInterval(id);
        return R.vis();
      }
      const tekst = klokke(tilMidnatt());
      el.forEach((b) => (b.textContent = tekst));
    }, 1000);
    R.vedForlat(() => clearInterval(id));
  }

  // «Kortkongen 11.11. · gikk opp på 3:41 · 112 trekk» (R.del adds the link).
  function delTekst(S, sp) {
    const r = sp.resultat || { sek: Math.round(sp.tid / 1000), trekk: sp.trekk };
    const rekke = dagrekke(S);
    return `${delNavn()} ${datoKort(sp.dato)} · ${R.t("gikk opp på {tid}", { tid: visTid(r.sek * 1000) })} · ${R.t("{n} trekk", { n: R.tall(r.trekk) })}${sp.modus === 3 ? ` · ${R.t("tre kort")}` : ""}${rekke > 1 ? `\n🔥 ${R.t("{n} dager på rad", { n: rekke })}` : ""}`;
  }

  // Small fanned cards for the mode tiles.
  const miniKort = (antall) =>
    `<span class="kk-mini kk-mini-${antall}">${[25, 11, 35].slice(0, antall).map((k, n) => KORT.html(k, { opp: true, klasse: "kk-mini-kort", stil: `--n:${n}` })).join("")}</span>`;

  function statLinje(s) {
    if (!s || !s.spilt) return "";
    const pst = Math.round((s.vunnet / s.spilt) * 100);
    return `${R.t("Vunnet {v} av {n} ({pst} %)", { v: R.tall(s.vunnet), n: R.tall(s.spilt), pst })}${s.besteTid ? ` · ${R.t("beste tid {tid}", { tid: visTid(s.besteTid * 1000) })}` : ""}`;
  }

  // Both modes side by side.
  function statTabell(S) {
    const s = [1, 3].map((m) => Object.assign(tomStat(), S.stat[m] || {}));
    const rad = (navn, f) => `<tr><th scope="row">${esc(navn)}</th>${s.map((x) => `<td>${f(x)}</td>`).join("")}</tr>`;
    return `<table class="kk-tabell">
      <thead><tr><td></td><th scope="col">${esc(MODUS[1].navn)}</th><th scope="col">${esc(MODUS[3].navn)}</th></tr></thead>
      <tbody>
        ${rad(R.t("Spilt"), (x) => R.tall(x.spilt))}
        ${rad(R.t("Vunnet"), (x) => (x.spilt ? `${R.tall(x.vunnet)} <small>${Math.round((x.vunnet / x.spilt) * 100)} %</small>` : "–"))}
        ${rad(R.t("På rad nå"), (x) => R.tall(x.rekke))}
        ${rad(R.t("Flest på rad"), (x) => R.tall(x.besteRekke))}
        ${rad(R.t("Beste tid"), (x) => (x.besteTid ? visTid(x.besteTid * 1000) : "–"))}
        ${rad(R.t("Færrest trekk"), (x) => (x.faerrest ? R.tall(x.faerrest) : "–"))}
      </tbody>
    </table>`;
  }

  function brettHtml(S) {
    const sp = S.spill;
    // class names // sprak-ok
    const kort = Array.from({ length: 52 }, (_, k) => KORT.html(k, { tag: "button", klasse: "kk-kort kk-av", attr: ` id="kk-k${k}" data-k="${k}" type="button" tabindex="-1" aria-hidden="true"` })).join("");
    // The empty places are buttons that sleep (disabled, hidden from screen readers) until a picked
    // card can be put there.
    const sov = 'type="button" disabled tabindex="-1" aria-hidden="true"';
    const grunn = [0, 1, 2, 3]
      .map(
        (s) =>
          `<button class="kk-plass kk-grunn" id="kk-g${s}" ${sov} aria-label="${esc(R.t("Hjem, {sort}", { sort: KORT.SORTER[s].navn }))}" style="--sf:${KORT.SORTER[s].rod ? KORT.ROD : "#f4e9ff"}"><svg viewBox="0 0 100 100" aria-hidden="true">${KORT.symbol(s, 18, 18, 64)}</svg></button>`,
      )
      .join("");
    const bord = Array.from({ length: 7 }, (_, i) => `<button class="kk-plass kk-tom" id="kk-b${i}" ${sov} aria-label="${esc(R.t("Tom plass, kolonne {n}", { n: i + 1 }))}"><b aria-hidden="true">K</b></button>`).join("");
    return `<div class="kk-brett" id="kk-brett" role="group" aria-label="${esc(R.t("Kabalen"))}" data-modus="${sp.modus}">
      ${grunn}<span class="kk-plass kk-avfall-plass" id="kk-avfall" aria-hidden="true"></span>${bord}
      <button class="kk-plass kk-bunke" id="kk-bunke" type="button" data-h="trekk" data-stille>${IKON.snu}</button>
      ${kort}
      <span class="kk-antall" id="kk-antall" aria-hidden="true"></span>
      <div class="kk-fast" id="kk-fast" hidden role="status">
        <span id="kk-fast-tekst">${esc(R.t("Herfra kan ikke kabalen gå opp."))}</span>
        <span class="kk-fast-knapper">${R.ui.knapp2(R.t("Spol tilbake"), "spol", { variant: "liten", id: "kk-spol" })}${R.ui.knapp2(erDagens(sp) ? R.t("Start på nytt") : R.t("Ny kabal"), "ny", { variant: "liten" })}</span>
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
      const d = Object.assign(tomDagstat(), S.dstat && typeof S.dstat === "object" ? S.dstat : {});
      for (const felt of Object.keys(tomDagstat())) d[felt] = Math.max(0, Math.floor(Number(d[felt]) || 0));
      S.dstat = d;
      // One saved game: sound, or gone. Fields that came later are filled in.
      const les = (sp) => {
        if (!sp || typeof sp !== "object" || !KABAL.fraKode(sp.kode) || !Array.isArray(sp.angre) || ![1, 3].includes(sp.modus)) return null;
        // Undo steps that can't be read any more are dropped (never a broken position).
        const antall = sp.angre.length;
        sp.angre = sp.angre.filter((a) => typeof a === "string" && KABAL.fraKode(a.split("|")[0]));
        sp.trekk = Number(sp.trekk) || 0;
        sp.tid = Number(sp.tid) || 0;
        sp.hint = Number(sp.hint) || 0;
        sp.spolt = Number(sp.spolt) || 0;
        const hel = sp.angre.length === antall;
        const indeks = (v) => (hel && Number.isInteger(v) && v >= 0 && v <= sp.angre.length ? v : -1);
        // A game from before the board knew: a proven deal can be solved from its first position.
        sp.ok = sp.ok == null && hel && sp.losbar && sp.angre.length < MAKS_ANGRE ? 0 : indeks(sp.ok);
        sp.dod = indeks(sp.dod);
        if (sp.dag != null && !(Number.isInteger(sp.dag) && typeof sp.dato === "string" && /^\d{4}-\d\d-\d\d$/.test(sp.dato))) return null;
        return sp;
      };
      // Today's daily and free play each keep their slot; the one that was on the table stays there.
      const a = les(S.spill);
      const alle = [a, les(S.annet)].filter(Boolean);
      const dag = alle.find((x) => x.dag === iDag()) || null;
      const fri = alle.find((x) => x.dag == null) || null;
      if (a && a === dag) {
        S.spill = dag;
        S.annet = fri;
      } else {
        S.spill = fri;
        S.annet = dag;
      }
      st = S.spill ? KABAL.fraKode(S.spill.kode) : null;
      if (S.skjerm === "spill" && !(S.spill && !S.spill.ferdig)) S.skjerm = S.spill ? "slutt" : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
      meldDagens(S);
    },

    // rusj.no/kortkongen/#dagens (the front page's «I dag» strip): straight to today's daily.
    vedHash(S, hash) {
      return String(hash).toLowerCase() === "dagens" ? tilDagens(S) : null;
    },

    regler: {
      intro: R.t("Få alle kortene hjem i fire bunker – én for hver sort, fra ess til konge."),
      steg: [
        [R.t("Bygg nedover på bordet"), R.t("Legg kortene i synkende rekkefølge, annenhver rød og svart: svart 8 på rød 9, rød 7 på svart 8.")],
        [R.t("Trykk eller dra"), R.t("Trykk på et kort, så flytter det seg dit det kan ligge. Kan det ligge flere steder, lyser plassene: trykk på den du vil ha – eller på kortet igjen for beste plass. Du kan også dra kortene.")],
        [R.t("Fra ess til konge"), R.t("Essene går hjem øverst til venstre. Bygg videre med samme sort: 2, 3, 4 … helt til kongen.")],
      ],
      tips: [
        R.t("Står du fast? Trykk på bunken for å trekke nye kort. Når den er tom, legges kortene tilbake."),
        R.t("Bare en konge kan legges på en tom plass."),
        R.t("Snu kortene med baksiden opp så fort du kan – de skjuler ofte nøkkelen."),
        R.t("«Hint» viser et lurt trekk, og «Angre» tar tilbake så mange trekk du vil."),
        R.t("Merket øverst sier om kabalen fortsatt kan gå opp. Står det «Låst», kan du spole tilbake til siste stilling som kan gå opp."),
        R.t("Dagens kabal er den samme for alle og kan alltid gå opp. Den kan prøves så mange ganger du vil – en ny kommer ved midnatt."),
        R.t("Når alle kortene ligger med bildet opp, går resten hjem av seg selv."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const fri = iGang(frittSpill(S)) ? frittSpill(S) : null;
          const dag = dagensSpill(S);
          const lost = !!(dag && dag.ferdig && dag.vunnet);
          const rekke = dagrekke(S);
          const linje = statLinje(S.stat[S.oppsett.modus]);
          // «Dagens kabal» is the main button until it is solved; then free play takes over, and the
          // daily becomes a note with the result and the countdown to the next one.
          const friKnapp = (hoved) => (hoved ? R.ui.knapp : R.ui.knapp2)(fri ? R.t("Fortsett · {trekk}", { trekk: R.flertall(fri.trekk, "trekk", "trekk") }) : R.t("Ny kabal · {modus}", { modus: MODUS[S.oppsett.modus].kort }), fri ? "fortsett" : "nytt");
          const dagKnapp = () =>
            dag && dag.startet ? R.ui.knapp(R.t("Fortsett dagens kabal · {trekk}", { trekk: R.flertall(dag.trekk, "trekk", "trekk") }), "dagens") : R.ui.knapp(R.t("Dagens kabal"), "dagens", { variant: "stor" });
          const r = lost ? dag.resultat || { sek: Math.round(dag.tid / 1000), trekk: dag.trekk } : null;
          const dagLinje = lost
            ? `<div class="kk-dagboks">
                <p><span class="kk-dag-hake" aria-hidden="true">${IKON.hake}</span><b>${esc(R.t("Dagens kabal gikk opp"))}</b> · ${visTid(r.sek * 1000)} · ${esc(R.t("{n} trekk", { n: R.tall(r.trekk) }))}</p>
                <p class="kk-dag-under">${rekke > 1 ? `🔥 ${esc(R.t("{n} dager på rad", { n: R.tall(rekke) }))} · ` : ""}${nedtellingHtml()}</p>
                ${R.ui.lenke(R.t("Se resultatet"), "dagens")}
              </div>`
            : rekke > 0
              ? `<p class="kk-hjemstat">🔥 ${esc(R.t("{dager} på rad med dagens kabal – i dag også?", { dager: rekke === 1 ? R.t("Én dag") : R.t("{n} dager", { n: R.tall(rekke) }) }))}</p>`
              : "";
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Ess til konge, rødt på svart."))}<br><em>${esc(R.t("Går kabalen opp?"))}</em>`,
              knapperHtml:
                (lost ? friKnapp(true) : dagKnapp() + friKnapp(false)) +
                R.ui.lenkerad(fri ? R.ui.lenke(R.t("Ny kabal"), "nytt") : "", R.ui.lenke(R.t("Bytt oppsett"), "endre"), R.ui.lenke(R.t("Slik spiller du"), "regler"), S.stat[1] || S.stat[3] ? R.ui.lenke(R.t("Statistikk"), "statistikk") : "") +
                dagLinje,
              merker: [
                ["📅", R.t("ny kabal hver dag")],
                [R.tall((S.oppsett.modus === 3 ? LOSBARE.tre.length : LOSBARE.tre.length + LOSBARE.en.length) * 8), R.t("løsbare kabaler")],
                ["0", R.t("reklame")],
              ],
            }) +
            (linje ? `<p class="kk-hjemstat">${esc(MODUS[S.oppsett.modus].navn)}: ${esc(linje)}</p>` : "")
          );
        },
        inn: () => startNedtelling(),
      },

      oppsett: {
        tittel: R.t("Ny kabal"),
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvor mange kort trekker du?"))}</h2>
            ${R.ui.fliser(
              "modus",
              [1, 3].map((m) => ({ v: m, tittel: MODUS[m].navn, tekst: MODUS[m].tekst, ikon: miniKort(m) })),
              S.oppsett.modus,
            )}
          </section>
          ${R.ui.bryter("losbar", S.oppsett.losbar, R.t("Bare løsbare kabaler"), R.t("Hver kabal er sjekket på forhånd: den kan gå opp – hvis du spiller lurt."))}
          <p class="hjelp">${esc(dagensSpill(S) && dagensSpill(S).startet ? R.t("Dagens kabal er i gang og beholder kortene sine.") : R.t("Valget gjelder også dagens kabal."))}</p>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "nytt", { variant: "stor" }))}`,
      },

      spill: {
        tittel: (S) => (!S.spill ? R.t("Kabal") : erDagens(S.spill) ? R.t("Dagens kabal") : MODUS[S.spill.modus].navn),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(erDagens(sp) ? R.t("Dagens kabal, {dato}", { dato: datoLang(sp.dato) }) : R.t("Kabal"))}</h1>
            <div class="kk-hud">
              <span class="kk-stat" aria-label="${esc(R.t("Tid"))}">${IKON.klokke}<b id="kk-tid">${visTid(tidMs(sp))}</b></span>
              <span class="kk-stat"><b id="kk-trekk">${sp.trekk}</b> ${esc(R.t("trekk"))}</span>
              <span class="kk-status" id="kk-status" aria-live="polite"></span>
            </div>
            ${brettHtml(S)}
            ${R.ui.dokk(`<div class="kk-verktoy">
              <button class="kk-knapp" id="kk-angre" data-h="angre" ${sp.angre.length ? "" : "disabled"}>${IKON.angre}<span>${esc(R.t("Angre"))}</span></button>
              <button class="kk-knapp" data-h="hint">${IKON.hint}<span>${esc(R.t("Hint"))}</span></button>
              <button class="kk-knapp" data-h="ny">${IKON.ny}<span>${esc(erDagens(sp) ? R.t("På nytt") : R.t("Ny kabal"))}</span></button>
              <button class="kk-knapp" data-h="avslutt">${IKON.slutt}<span>${esc(R.t("Avslutt"))}</span></button>
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
          sjekkSnart(S, 80);
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          startKlokke(S);
          const id = setInterval(() => {
            const el = R.$("#kk-tid");
            if (el && R.S.spill) el.textContent = visTid(tidMs(R.S.spill));
          }, 500);
          R.vedForlat(() => clearInterval(id));
          const plan = S.spill.startet && st && !KABAL.vunnet(st) ? fullforPlan(st) : null;
          if (plan) setTimeout(() => R.S.skjerm === "spill" && autoFullfor(R.S, plan), 500);
        },
        ut(S) {
          stoppKlokke(S);
          skjulHint();
          opphevValg();
          clearTimeout(sjekkId);
          clearTimeout(ordneId);
          if (jobb) jobb.avbrutt = true;
          hinter = false;
          dra = null;
          laast = false;
          R.$$(".kk-kaskade").forEach((el) => el.remove());
          meldDagens(S);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { vunnet: sp.vunnet, sek: Math.round(sp.tid / 1000), trekk: sp.trekk, hjem: 0 };
          const s = Object.assign(tomStat(), S.stat[sp.modus] || {});
          const dagLost = !!(dagensSpill(S) && dagensSpill(S).ferdig);
          const dokk =
            R.ui.flereSpill({ antall: 1 }) +
            R.ui.dokk(
              R.ui.knapp(R.t("Spill igjen"), "igjen"),
              R.ui.lenkerad(dagLost ? "" : R.ui.lenke(R.t("Dagens kabal"), "dagens"), R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
            );
          const statHtml = `<p class="kk-sluttstat">${esc(MODUS[sp.modus].navn)}: ${esc(R.t("vunnet {v} av {n}", { v: R.tall(s.vunnet), n: R.tall(s.spilt) }))}${s.rekke > 1 ? ` · ${esc(R.t("{n} på rad", { n: R.tall(s.rekke) }))}` : ""}${s.besteRekke > 1 ? ` · ${esc(R.t("rekord {n} på rad", { n: R.tall(s.besteRekke) }))}` : ""}</p>`;
          const rekordMerke = `<i class="kk-ny">${esc(R.t("Rekord!"))}</i>`;
          const tallHtml = `<div class="kk-resultat">
                <div class="kk-tall-kort${r.nyTid ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>${esc(R.t("tid"))}</span>${r.nyTid ? rekordMerke : ""}</div>
                <div class="kk-tall-kort${r.nyTrekk ? " ny" : ""}"><b>${R.tall(r.trekk)}</b><span>${esc(R.t("trekk|trekk", { n: r.trekk }))}</span>${r.nyTrekk ? rekordMerke : ""}</div>
              </div>`;
          if (erDagens(sp)) {
            // «Dagens kabal» is solved: the result, the days in a row, something to share – and
            // when the next one comes (or that it is here, if midnight has passed).
            const rekke = dagrekke(S);
            const gammel = sp.dag !== iDag();
            return `
              <div class="banner aksent">
                ${R.figur(null, "jubel")}
                <p class="etikett">${esc(R.t("Dagens kabal · {dato}", { dato: datoLang(sp.dato) }))}</p>
                <h1 id="skjerm-tittel">${esc(R.t("Dagens kabal gikk opp!"))}</h1>
                <p class="ingress">${esc(rekke > 1 ? `🔥 ${R.t("{n} dager på rad!", { n: R.tall(rekke) })}` : R.t("Første dag i en ny rekke – kom tilbake i morgen."))}</p>
              </div>
              ${tallHtml}
              <p class="kk-neste">${gammel ? `<b>${esc(R.t("En ny kabal er klar!"))}</b>` : nedtellingHtml()}</p>
              <p class="kk-sluttstat">${esc(MODUS[sp.modus].navn)}${S.dstat.lost > 1 ? ` · ${esc(R.t("{n} dagskabaler løst", { n: R.tall(S.dstat.lost) }))}` : ""}${S.dstat.beste > 1 ? ` · ${esc(R.t("lengste rekke {n} dager", { n: R.tall(S.dstat.beste) }))}` : ""}</p>
              ${R.ui.flereSpill({ antall: 1 })}
              ${R.ui.dokk(
                gammel ? R.ui.knapp(R.t("Dagens kabal"), "dagens") : R.ui.knapp(R.t("Del resultatet"), "del"),
                R.ui.lenkerad(R.ui.lenke(iGang(frittSpill(S)) ? R.t("Fortsett kabalen") : R.t("Ny kabal"), iGang(frittSpill(S)) ? "fortsett" : "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
              )}`;
          }
          if (r.vunnet) {
            const rekord = r.nyTid || r.nyTrekk;
            return `
              <div class="banner aksent">
                ${R.figur()}
                <p class="etikett">${esc(MODUS[sp.modus].navn)}${sp.losbar ? ` · ${esc(R.t("løsbar"))}` : ""}</p>
                <h1 id="skjerm-tittel">${esc(R.t("Kabalen gikk opp!"))}</h1>
                <p class="ingress">${esc(R.t("Godt jobba!"))}${r.rekke > 1 ? ` ${esc(R.t("Det er {n} på rad.", { n: R.tall(r.rekke) }))}` : ""}</p>
              </div>
              ${tallHtml}
              <p class="hjelp">${esc(
                rekord
                  ? R.t("Ny personlig rekord! Forrige: {tid} · {trekk}", { tid: r.forrigeTid ? visTid(r.forrigeTid * 1000) : "–", trekk: r.forrigeTrekk ? R.t("{n} trekk", { n: R.tall(r.forrigeTrekk) }) : "–" })
                  : r.forrigeTid
                    ? R.t("Rekordene dine: {tid} · {trekk}", { tid: visTid(s.besteTid * 1000), trekk: R.t("{n} trekk", { n: R.tall(s.faerrest) }) })
                    : R.t("Første kabal i boks – nå har du rekorder å slå!"),
              )}</p>
              ${statHtml}
              ${dokk}`;
          }
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${esc(MODUS[sp.modus].navn)}${sp.losbar ? ` · ${esc(R.t("løsbar"))}` : ""}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Den var vrien!"))}</h1>
              <p class="ingress">${esc(r.hjem ? R.t("Du fikk {n} av 52 kort hjem.", { n: R.tall(r.hjem) }) : R.t("Ingen kort kom hjem denne gangen."))} ${esc(R.t("Neste kabal kan være din."))}</p>
            </div>
            ${r.hjem ? `<div class="kk-fremgang" aria-hidden="true"><span style="width:${Math.round((r.hjem / 52) * 100)}%"></span></div>` : ""}
            ${statHtml}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          startNedtelling();
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
      // A new free game, dealt at once with the setup from last time («Bytt oppsett» changes it).
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(frittSpill(S)), true)) || !fortsatt()) return;
        leggFram(S, "fri");
        if (iGang(S.spill)) registrer(S, false); // the old game is over now (counted once)
        nyttSpill(S);
        R.gaTil("spill");
      },
      fortsett(el, e, S) {
        if (iGang(leggFram(S, "fri"))) R.gaTil("spill");
      },
      dagens: (el, e, S) => R.gaTil(tilDagens(S)),
      del(el, e, S) {
        const sp = S.spill;
        if (erDagens(sp) && sp.vunnet) R.del(delNavn(), delTekst(S, sp), DEL_URL, { kort: { tittel: R.t("Dagens kabal {dato}", { dato: datoKort(sp.dato) }), linjer: [R.t("Gikk opp på {tid}", { tid: visTid(((sp.resultat && sp.resultat.sek) || Math.round(sp.tid / 1000)) * 1000) }), R.t("{n} trekk", { n: R.tall((sp.resultat && sp.resultat.trekk) || sp.trekk) })] } });
      },
      spol: (el, e, S) => spolTilbake(S),
      laast() {
        const el = R.$("#kk-fast");
        if (el) visLaast(el.hidden);
      },
      statistikk(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Statistikk"))}</h2>
          <div class="kk-stat-ark">${statTabell(S)}</div>
          <p class="hjelp">${esc(R.t("Statistikken ligger bare på denne mobilen."))}</p>
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>
          ${R.ui.lenke(R.t("Nullstill statistikk"), "nullstill")}`);
      },
      async nullstill(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Nullstille statistikken?"), R.t("Alle seirer, rekker og rekorder slettes fra denne mobilen."), R.t("Nullstill"), R.t("Avbryt"));
        if (!ja || !fortsatt()) return;
        S.stat = {};
        R.vis();
        R.toast(R.t("Statistikken er nullstilt"));
      },
      modus(el, e, S) {
        S.oppsett.modus = Number(el.dataset.v) === 3 ? 3 : 1;
        R.vis();
      },
      losbar(el, e, S) {
        S.oppsett.losbar = !S.oppsett.losbar;
        R.vis();
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
        const n = sp.angre.length;
        if (sp.ok > n) sp.ok = n; // what led to a position that can be solved, can be solved
        if (sp.dod > n) {
          sp.dod = -1;
          laastVist = null;
        }
        opphevValg();
        visLaast(false);
        plasser({ animer: true });
        R.lyd.tone(600, 0, 0.08, "triangle", 0.07, 420);
        R.lagre();
        R.si(R.t("Angret"));
        sjekkSnart(S);
      },
      hint: (el, e, S) => visHint(S),
      async ny(el, e, S) {
        if (laast) return;
        const sp = S.spill;
        const fortsatt = R.vakt();
        if (erDagens(sp)) {
          // The daily is the same cards all day: it can only be started again.
          const ja = await R.bekreft(R.t("Starte dagens kabal på nytt?"), R.t("Kortene er de samme. Tid og trekk begynner på null."), R.t("Start på nytt"), R.t("Spill videre"));
          if (!ja || !fortsatt() || S.spill !== sp) return;
          nyDagens(S, true);
          R.gaTil("spill");
          return;
        }
        const valg = await R.velgIArk(
          R.t("Ny kabal?"),
          [
            { v: "ny", tekst: R.t("Del ut en ny kabal") },
            { v: "igjen", tekst: R.t("Start denne kabalen på nytt") },
          ],
          sp && sp.startet ? R.t("Kabalen du holder på med, teller som tapt i statistikken.") : "",
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
        if (erDagens(sp)) {
          // Nothing is lost: the daily waits where it was left, and can be solved until midnight.
          const bort = await R.bekreft(R.t("Legge bort dagens kabal?"), R.t("Den ligger klar der du slapp – helt til midnatt."), R.t("Legg bort"), R.t("Spill videre"));
          if (bort && fortsatt()) R.gaTil("hjem");
          return;
        }
        const ja = await R.bekreft(R.t("Avslutte kabalen?"), sp.startet ? R.t("Den teller som tapt i statistikken.") : R.t("Du kan alltid starte en ny."), R.t("Avslutt"), R.t("Spill videre"));
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
