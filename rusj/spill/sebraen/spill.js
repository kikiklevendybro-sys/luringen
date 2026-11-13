/* Sebraen — black and white: never three alike in a row, and as many of each in every row and
   column. Some neighbours carry a sign: «=» the two are alike, «×» they differ.
   Every puzzle is made on the phone: a random full board that keeps the rules, a few signs taken
   from it, and then clues taken away one by one for as long as reasoning alone (no guessing) still
   solves it — so the answer is the only one. «Dagens sebra» uses today's date as the seed, so
   everyone gets the same one. The engine at the top is pure and also runs under node
   (test/sebraen.test.mjs). */
(function () {
  "use strict";

  // ======================= Engine =======================

  const motor = (function () {
    // The kit's generator (mulberry32), so a seed gives the same puzzle in node and on every phone.
    function rng(fro) {
      let a = fro >>> 0;
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function stokk(a, tilf) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(tilf() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a;
    }
    const STORRELSER = [6, 8, 10];
    const LIK = 1; // «=»
    const ULIK = 2; // «×»

    // A board: n (even), and for every cell 0 (empty), 1 (black) or 2 (white). Signs: tegn[i] is
    // [sign to the cell on the right, sign to the cell below] (0 = none, 1 = «=», 2 = «×»).
    // The lines: rows, then columns, as lists of cells; and the sign between neighbours in a line.
    const linjeCache = {};
    function linjer(n) {
      if (linjeCache[n]) return linjeCache[n];
      const ut = [];
      for (let r = 0; r < n; r++) ut.push({ type: "rad", nr: r, celler: Array.from({ length: n }, (_, c) => r * n + c), retning: 0 });
      for (let c = 0; c < n; c++) ut.push({ type: "kolonne", nr: c, celler: Array.from({ length: n }, (_, r) => r * n + c), retning: 1 });
      return (linjeCache[n] = ut);
    }
    const motsatt = (v) => 3 - v;

    // ---------- A random full board ----------
    function fyll(n, tilf) {
      const v = new Int8Array(n * n);
      const halv = n / 2;
      const rad = Array.from({ length: n }, () => [0, 0, 0]);
      const kol = Array.from({ length: n }, () => [0, 0, 0]);
      const steg = (i) => {
        if (i === n * n) return true;
        const r = (i / n) | 0;
        const c = i % n;
        for (const x of tilf() < 0.5 ? [1, 2] : [2, 1]) {
          if (rad[r][x] >= halv || kol[c][x] >= halv) continue;
          if (c >= 2 && v[i - 1] === x && v[i - 2] === x) continue;
          if (r >= 2 && v[i - n] === x && v[i - 2 * n] === x) continue;
          v[i] = x;
          rad[r][x]++;
          kol[c][x]++;
          if (steg(i + 1)) return true;
          rad[r][x]--;
          kol[c][x]--;
          v[i] = 0;
        }
        return false;
      };
      steg(0);
      return v;
    }

    // ---------- Reasoning ----------
    // Techniques, easiest first (the number is the difficulty):
    // 1 two alike side by side → the cells on either side are the other colour («par»); one between
    //   two alike is the other colour («klemme»); a sign with one side known («tegn»); a line that
    //   has half of one colour gets the other colour in the rest («full»).
    // 2 all the ways a whole line can still be filled agree on a cell («linje»).
    // 3 trying a colour in a cell leads, by the simple steps (1), to three alike, too many of one
    //   colour or a broken sign («prov»).
    const tegnMellom = (n, tegn, a, b) => (b === a + 1 ? tegn[a * 2] : tegn[a * 2 + 1]);

    // Every way to fill line L (given v and the signs); for each position: can it be 1, can it be 2.
    // Returns null when there is no way at all.
    function linjeValg(n, v, tegn, L) {
      const c = L.celler;
      const halv = n / 2;
      const kan = new Uint8Array(n); // bit 1: black possible, bit 2: white possible
      const verdi = new Int8Array(n);
      let finnes = false;
      const steg = (k, svarte, hvite) => {
        if (k === n) {
          finnes = true;
          for (let j = 0; j < n; j++) kan[j] |= verdi[j];
          return;
        }
        const fast = v[c[k]];
        for (const x of fast ? [fast] : [1, 2]) {
          if (x === 1 ? svarte >= halv : hvite >= halv) continue;
          if (k >= 2 && verdi[k - 1] === x && verdi[k - 2] === x) continue;
          if (k >= 1) {
            const s = tegnMellom(n, tegn, c[k - 1], c[k]);
            if ((s === LIK && verdi[k - 1] !== x) || (s === ULIK && verdi[k - 1] === x)) continue;
          }
          verdi[k] = x;
          steg(k + 1, svarte + (x === 1), hvite + (x === 2));
        }
        verdi[k] = 0;
      };
      steg(0, 0, 0);
      return finnes ? kan : null;
    }

    // One step. Returns { niva, type, i, v, linje } or { type: "motsigelse" } or null.
    function etSteg(n, v, tegn, maks) {
      const L = linjer(n);
      const halv = n / 2;
      // 1: the simple patterns.
      for (const l of L) {
        const c = l.celler;
        let svarte = 0;
        let hvite = 0;
        for (const i of c) {
          if (v[i] === 1) svarte++;
          else if (v[i] === 2) hvite++;
        }
        if (svarte > halv || hvite > halv) return { type: "motsigelse" };
        for (let k = 0; k < n; k++) {
          const a = v[c[k]];
          if (k + 2 < n && a && a === v[c[k + 1]] && a === v[c[k + 2]]) return { type: "motsigelse" };
          if (k + 1 < n) {
            const b = v[c[k + 1]];
            const s = tegnMellom(n, tegn, c[k], c[k + 1]);
            if (a && b && ((s === LIK && a !== b) || (s === ULIK && a === b))) return { type: "motsigelse" };
            if (s && a && !b) return { niva: 1, type: "tegn", i: c[k + 1], v: s === LIK ? a : motsatt(a), linje: l, fra: c[k] };
            if (s && b && !a) return { niva: 1, type: "tegn", i: c[k], v: s === LIK ? b : motsatt(b), linje: l, fra: c[k + 1] };
          }
        }
      }
      for (const l of L) {
        const c = l.celler;
        for (let k = 0; k < n; k++) {
          if (v[c[k]]) continue;
          // par: xx_ or _xx
          if (k >= 2 && v[c[k - 1]] && v[c[k - 1]] === v[c[k - 2]]) return { niva: 1, type: "par", i: c[k], v: motsatt(v[c[k - 1]]), linje: l };
          if (k + 2 < n && v[c[k + 1]] && v[c[k + 1]] === v[c[k + 2]]) return { niva: 1, type: "par", i: c[k], v: motsatt(v[c[k + 1]]), linje: l };
          // klemme: x_x
          if (k >= 1 && k + 1 < n && v[c[k - 1]] && v[c[k - 1]] === v[c[k + 1]]) return { niva: 1, type: "klemme", i: c[k], v: motsatt(v[c[k - 1]]), linje: l };
        }
      }
      for (const l of L) {
        const c = l.celler;
        let svarte = 0;
        let hvite = 0;
        let tom = -1;
        for (const i of c) {
          if (v[i] === 1) svarte++;
          else if (v[i] === 2) hvite++;
          else tom = i;
        }
        if (tom < 0) continue;
        if (svarte === halv) return { niva: 1, type: "full", i: tom, v: 2, linje: l };
        if (hvite === halv) return { niva: 1, type: "full", i: tom, v: 1, linje: l };
      }
      if (maks < 2) return null;
      // 2: what every way to fill a line agrees on.
      for (const l of L) {
        if (!l.celler.some((i) => !v[i])) continue;
        const kan = linjeValg(n, v, tegn, l);
        if (!kan) return { type: "motsigelse" };
        for (let k = 0; k < n; k++) {
          const i = l.celler[k];
          if (!v[i] && (kan[k] === 1 || kan[k] === 2)) return { niva: 2, type: "linje", i, v: kan[k], linje: l };
          if (!v[i] && !kan[k]) return { type: "motsigelse" };
        }
      }
      if (maks < 3) return null;
      // 3: a colour that leads to a dead end.
      for (let i = 0; i < n * n; i++) {
        if (v[i]) continue;
        for (const x of [1, 2]) {
          const kopi = Int8Array.from(v);
          kopi[i] = x;
          let dod = false;
          for (let runde = 0; runde < n * n; runde++) {
            const s = etSteg(n, kopi, tegn, 1);
            if (!s) break;
            if (s.type === "motsigelse") {
              dod = true;
              break;
            }
            kopi[s.i] = s.v;
          }
          if (dod) return { niva: 3, type: "prov", i, v: motsatt(x) };
        }
      }
      return null;
    }

    // The same reasoning, faster (for making puzzles): every line at a time, each step to the end
    // before a harder one is tried. Changes v. Returns the hardest step used, or -1 on a dead end.
    function propager(n, v, tegn, maks) {
      const L = linjer(n);
      const halv = n / 2;
      let grad = 0;
      for (;;) {
        // 1 until nothing more follows.
        let endret = true;
        while (endret) {
          endret = false;
          for (const l of L) {
            const c = l.celler;
            let svarte = 0;
            let hvite = 0;
            for (let k = 0; k < n; k++) {
              const a = v[c[k]];
              if (a === 1) svarte++;
              else if (a === 2) hvite++;
              if (k + 2 < n && a && a === v[c[k + 1]] && a === v[c[k + 2]]) return -1;
              if (k + 1 < n) {
                const b = v[c[k + 1]];
                const s = tegnMellom(n, tegn, c[k], c[k + 1]);
                if (s && a && b && ((s === LIK) !== (a === b))) return -1;
                if (s && a && !b) {
                  v[c[k + 1]] = s === LIK ? a : motsatt(a);
                  endret = true;
                } else if (s && b && !a) {
                  v[c[k]] = s === LIK ? b : motsatt(b);
                  endret = true;
                }
              }
            }
            if (svarte > halv || hvite > halv) return -1;
            for (let k = 0; k < n; k++) {
              const i = c[k];
              if (v[i]) continue;
              let x = 0;
              if (k >= 2 && v[c[k - 1]] && v[c[k - 1]] === v[c[k - 2]]) x = motsatt(v[c[k - 1]]);
              else if (k + 2 < n && v[c[k + 1]] && v[c[k + 1]] === v[c[k + 2]]) x = motsatt(v[c[k + 1]]);
              else if (k >= 1 && k + 1 < n && v[c[k - 1]] && v[c[k - 1]] === v[c[k + 1]]) x = motsatt(v[c[k - 1]]);
              else if (svarte === halv) x = 2;
              else if (hvite === halv) x = 1;
              if (x) {
                v[i] = x;
                if (x === 1) svarte++;
                else hvite++;
                endret = true;
              }
            }
          }
        }
        if (v.every(Boolean)) return grad;
        if (maks < 2) return grad;
        // 2: every line, all it can tell.
        let fant = false;
        for (const l of L) {
          if (!l.celler.some((i) => !v[i])) continue;
          const kan = linjeValg(n, v, tegn, l);
          if (!kan) return -1;
          for (let k = 0; k < n; k++) {
            const i = l.celler[k];
            if (v[i]) continue;
            if (!kan[k]) return -1;
            if (kan[k] !== 3) {
              v[i] = kan[k];
              fant = true;
            }
          }
        }
        if (fant) {
          grad = Math.max(grad, 2);
          continue;
        }
        if (maks < 3) return grad;
        // 3: the first colour that leads to a dead end.
        let prov = false;
        for (let i = 0; i < n * n && !prov; i++) {
          if (v[i]) continue;
          for (const x of [1, 2]) {
            const kopi = Int8Array.from(v);
            kopi[i] = x;
            if (propager(n, kopi, tegn, 1) < 0) {
              v[i] = motsatt(x);
              prov = true;
              break;
            }
          }
        }
        if (!prov) return grad;
        grad = 3;
      }
    }

    // Solves as far as reasoning goes. Returns { lost, grad, v }.
    function los(n, gitt, tegn, maks) {
      const v = Int8Array.from(gitt);
      const g = propager(n, v, tegn, maks || 3);
      if (g < 0) return { lost: false, grad: 0, v, motsigelse: true };
      let grad = g;
      // A board solved with steps 1 alone is level 1 (the loop above counts from 0).
      if (!grad) grad = 1;
      return { lost: v.every(Boolean), grad, v };
    }

    // ---------- Counting solutions (for the tests and as a safety net) ----------
    function tell(n, gitt, tegn, grense) {
      grense = grense || 2;
      const v = Int8Array.from(gitt);
      const halv = n / 2;
      let antall = 0;
      const ok = (i, x) => {
        const r = (i / n) | 0;
        const c = i % n;
        let sr = 0;
        let sk = 0;
        for (let k = 0; k < n; k++) {
          if (v[r * n + k] === x) sr++;
          if (v[k * n + c] === x) sk++;
        }
        if (sr >= halv || sk >= halv) return false;
        if (c >= 2 && v[i - 1] === x && v[i - 2] === x) return false;
        if (c >= 1 && c + 1 < n && v[i - 1] === x && v[i + 1] === x) return false;
        if (c + 2 < n && v[i + 1] === x && v[i + 2] === x) return false;
        if (r >= 2 && v[i - n] === x && v[i - 2 * n] === x) return false;
        if (r >= 1 && r + 1 < n && v[i - n] === x && v[i + n] === x) return false;
        if (r + 2 < n && v[i + n] === x && v[i + 2 * n] === x) return false;
        const sjekk = (j, s) => !s || !v[j] || (s === LIK ? v[j] === x : v[j] !== x);
        if (c >= 1 && !sjekk(i - 1, tegn[(i - 1) * 2])) return false;
        if (c + 1 < n && !sjekk(i + 1, tegn[i * 2])) return false;
        if (r >= 1 && !sjekk(i - n, tegn[(i - n) * 2 + 1])) return false;
        if (r + 1 < n && !sjekk(i + n, tegn[i * 2 + 1])) return false;
        return true;
      };
      const tomme = [];
      for (let i = 0; i < n * n; i++) if (!v[i]) tomme.push(i);
      const steg = (k) => {
        if (antall >= grense) return;
        if (k === tomme.length) {
          antall++;
          return;
        }
        const i = tomme[k];
        for (const x of [1, 2]) {
          if (!ok(i, x)) continue;
          v[i] = x;
          steg(k + 1);
          v[i] = 0;
        }
      };
      // The givens themselves must keep the rules.
      for (let i = 0; i < n * n; i++) {
        if (!v[i]) continue;
        const x = v[i];
        v[i] = 0;
        const g = ok(i, x);
        v[i] = x;
        if (!g) return 0;
      }
      steg(0);
      return antall;
    }

    // ---------- Making a puzzle ----------
    // N: { n, tegn: share of neighbour pairs that get a sign, maks: hardest step allowed, min: wanted }
    const NIVAER = Object.freeze({
      6: { n: 6, tegn: 0.22, maks: 2, min: 1 },
      8: { n: 8, tegn: 0.12, maks: 3, min: 2 },
      10: { n: 10, tegn: 0.06, maks: 3, min: 2 },
    });

    function lagEn(N, tilf) {
      const n = N.n;
      const losning = fyll(n, tilf);
      const tegn = new Int8Array(n * n * 2);
      const par = [];
      for (let i = 0; i < n * n; i++) {
        if (i % n < n - 1) par.push(i * 2);
        if (i < n * (n - 1)) par.push(i * 2 + 1);
      }
      for (const p of stokk(par, tilf)) {
        if (tilf() >= N.tegn) continue;
        const i = p >> 1;
        const j = p & 1 ? i + n : i + 1;
        tegn[p] = losning[i] === losning[j] ? LIK : ULIK;
      }
      const gitt = Int8Array.from(losning);
      // Take clues away while reasoning still solves the board: cells first, then signs.
      for (const i of stokk(Array.from({ length: n * n }, (_, k) => k), tilf)) {
        const x = gitt[i];
        gitt[i] = 0;
        if (!los(n, gitt, tegn, N.maks).lost) gitt[i] = x;
      }
      for (const p of stokk(par.filter((p) => tegn[p]), tilf)) {
        const s = tegn[p];
        tegn[p] = 0;
        if (!los(n, gitt, tegn, N.maks).lost) tegn[p] = s;
      }
      const l = los(n, gitt, tegn, N.maks);
      return { n, gitt: Array.from(gitt), tegn: Array.from(tegn), losning: Array.from(losning), grad: l.grad };
    }

    function lagMed(N, fro, maksForsok) {
      const tilf = rng(fro);
      let reserve = null;
      for (let forsok = 1; forsok <= maksForsok; forsok++) {
        const p = lagEn(N, tilf);
        p.forsok = forsok;
        if (p.grad >= N.min) return p;
        if (!reserve || p.grad > reserve.grad) reserve = p;
      }
      return reserve;
    }
    const lag = (n, fro) => lagMed(NIVAER[n] || NIVAER[6], fro, 8);

    // ---------- «Dagens sebra» ----------
    // The daily has its own frozen rules and seed hash, so a day's puzzle never changes
    // (test/sebraen.test.mjs pins known days).
    const DAGLIG = Object.freeze({
      6: Object.freeze({ n: 6, tegn: 0.22, maks: 2, min: 1 }),
      8: Object.freeze({ n: 8, tegn: 0.12, maks: 3, min: 2 }),
      10: Object.freeze({ n: 10, tegn: 0.06, maks: 3, min: 2 }),
    });
    // 6 × 6 at the start of the week, 10 × 10 at the weekend (index 0 = Sunday).
    const DAGLIG_UKE = Object.freeze([10, 6, 6, 6, 8, 8, 10]);
    function fnv(tekst) {
      let h = 0x811c9dc5;
      for (let i = 0; i < tekst.length; i++) {
        h ^= tekst.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    const dagligStorrelse = (nr) => DAGLIG_UKE[(((nr + 4) % 7) + 7) % 7];
    const lagDaglig = (dato, nr) => lagMed(DAGLIG[dagligStorrelse(nr)], fnv("sebraen:" + dato), 8);

    // ---------- Rules on a board in play ----------
    // Cells that break a rule, and the signs that are broken. Returns { celler: Uint8Array,
    // tegn: Set of sign indexes, grunn: { cell: [why] } } – «tre» (three alike), «mange» (more than
    // half of one colour in a line), «tegn» (a sign not kept).
    function brudd(n, v, tegn) {
      const celler = new Uint8Array(n * n);
      const brutt = new Set();
      const grunn = {};
      const merk = (i, g) => {
        celler[i] = 1;
        (grunn[i] = grunn[i] || []).includes(g) || grunn[i].push(g);
      };
      for (const l of linjer(n)) {
        const c = l.celler;
        for (const x of [1, 2]) {
          const har = c.filter((i) => v[i] === x);
          if (har.length > n / 2) for (const i of har) merk(i, "mange");
        }
        for (let k = 0; k + 2 < n; k++) if (v[c[k]] && v[c[k]] === v[c[k + 1]] && v[c[k]] === v[c[k + 2]]) for (const i of [c[k], c[k + 1], c[k + 2]]) merk(i, "tre");
      }
      for (let p = 0; p < tegn.length; p++) {
        const s = tegn[p];
        if (!s) continue;
        const i = p >> 1;
        const j = p & 1 ? i + n : i + 1;
        if (v[i] && v[j] && ((s === LIK) !== (v[i] === v[j]))) {
          brutt.add(p);
          merk(i, "tegn");
          merk(j, "tegn");
        }
      }
      return { celler, tegn: brutt, grunn };
    }

    // The next helpful step: wrong cells first, then a cell that follows (with the reason).
    function hint(n, gitt, tegn, losning, v) {
      const feil = [];
      for (let i = 0; i < n * n; i++) if (v[i] && v[i] !== losning[i]) feil.push(i);
      if (feil.length) return { type: "feil", celler: feil };
      const kopi = Int8Array.from(v);
      for (let i = 0; i < n * n; i++) if (gitt[i]) kopi[i] = gitt[i];
      const s = etSteg(n, kopi, tegn, 3);
      if (s && s.type !== "motsigelse") return { type: "celle", i: s.i, v: s.v, grunn: s.type, linje: s.linje ? s.linje.type : null };
      for (let i = 0; i < n * n; i++) if (!kopi[i]) return { type: "celle", i, v: losning[i], grunn: "vanskelig", linje: null };
      return null;
    }

    return { rng, fnv, linjer, LIK, ULIK, STORRELSER, fyll, linjeValg, etSteg, los, tell, NIVAER, lagEn, lagMed, lag, DAGLIG, dagligStorrelse, lagDaglig, brudd, hint };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    if (typeof window === "object" && window) window.Sebraen = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;

  const STR = M.STORRELSER;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const NIVA = Object.assign(Object.create(null), {
    6: R.t("Rolig start, mange tegn"),
    8: R.t("Passe utfordring"),
    10: R.t("Stort og vrient"),
  });
  const storrelse = (n) => `${n} × ${n}`;
  const FARGE = { 1: R.t("svart"), 2: R.t("hvit") };
  const HINT = 3;
  const MAKS_ANGRE = 400;
  const FORSTE = 20770; // «nr. 1» is 13 November 2026 (R.dag().nr)
  const NAVN = () => (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || R.t("Sebraen");
  // This edition's address (rusj.no/sebraen/, rusj.no/en/zebra/ …)
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/sebraen/" }).href;

  let H; // actions
  let klokkeFra = null; // performance.now() when the clock last started
  let las = false; // input locked while the win plays
  let celler = []; // the cell buttons of the board on the screen
  let tegnet = []; // what each cell shows now (to skip unchanged ones)
  let inntil = 0; // performance.now() when the play screen opened (the second half of a double tap is ignored)

  // ---------- Days ----------

  const iDato = (tekst) => new Date(tekst + "T12:00:00Z");
  const datoFmt = (tekst, o) => new Intl.DateTimeFormat(R.lokale, Object.assign({ timeZone: "UTC" }, o)).format(iDato(tekst));
  const ukedag = (tekst) => datoFmt(tekst, { weekday: "long" });
  const datoTekst = (tekst) => datoFmt(tekst, { weekday: "long", day: "numeric", month: "long" });
  const nrFor = (dagNr) => dagNr - FORSTE + 1;
  const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function sekunderTilNy() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: R.tidssone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(na))
      .forEach((p) => (deler[p.type] = Number(p.value)));
    let igjen = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const dag = R.dag(new Date(na)).nr;
    // The two nights a year the clocks change, the day is 23 or 25 hours long.
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const klokkeTekst = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const nedtellingHtml = () => `<p class="sb-nedtelling">${esc(R.t("Ny sebra om {tid}")).replace("{tid}", `<b>${klokkeTekst(sekunderTilNy())}</b>`)}</p>`;
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".sb-nedtelling b");
      if (!el) return clearInterval(nedtellingId);
      if (R.dag().nr !== dag) {
        clearInterval(nedtellingId);
        return R.vis();
      }
      el.textContent = klokkeTekst(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(nedtellingId));
  }

  // ---------- Clock ----------

  const tidMs = (sp) => sp.tid + (klokkeFra != null ? performance.now() - klokkeFra : 0);
  function startKlokke(S) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || sp.pause || klokkeFra != null || document.hidden || S.skjerm !== "spill") return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && aktiv(S);
    if (sp && klokkeFra != null) sp.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }
  function visTid(ms) {
    const s = Math.floor(ms / 1000);
    const t = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    return (t ? t + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s % 60).padStart(2, "0");
  }

  // ---------- The game state ----------
  // Today's puzzle and a free board live side by side (S.dag and S.fri); S.modus says which one
  // is on the screen. Neither is ever lost by opening the other.

  const aktiv = (S) => (S.modus === "dag" ? S.dag : S.fri);
  const iGang = (sp) => !!(sp && !sp.ferdig);
  const dagensSpill = (S) => (S.dag && S.dag.dagens === R.dag().tekst ? S.dag : null);
  const dagRekke = (S) => (S.daglig.sistNr >= R.dag().nr - 1 ? S.daglig.rekke || 0 : 0);

  function nyttSpill(S, dag) {
    const t0 = performance.now();
    const d = dag ? R.dag() : null;
    const n = STR.includes(S.oppsett.n) ? S.oppsett.n : 6;
    const o = dag ? M.lagDaglig(d.tekst, d.nr) : M.lag(n, R.nyttFro());
    const sp = {
      n: o.n,
      gitt: o.gitt,
      tegn: o.tegn,
      losning: o.losning,
      grad: o.grad,
      dagens: d ? d.tekst : null,
      dagNr: d ? d.nr : null,
      v: o.gitt.slice(),
      hint: [],
      angre: [],
      valgt: 0,
      tid: 0,
      hintIgjen: HINT,
      pause: false,
      ferdig: false,
      resultat: null,
    };
    if (dag) S.dag = sp;
    else S.fri = sp;
    S.modus = dag ? "dag" : "fri";
    klokkeFra = null;
    las = false;
    R.statistikk("start", { n: sp.n, dagens: !!dag, ms: Math.round(performance.now() - t0) });
  }

  // Today's puzzle: the board (new or under way) – or the result once it is solved.
  function apneDagens(S) {
    const sp = dagensSpill(S);
    const lost = S.daglig.dager[R.dag().tekst];
    if (sp && sp.ferdig) {
      S.modus = "dag";
      return "slutt";
    }
    if (lost && !sp) return "hjem";
    if (!sp) nyttSpill(S, true);
    S.modus = "dag";
    return "spill";
  }

  const fylt = (sp) => sp.v.filter(Boolean).length;
  const paabegynt = (sp) => sp.v.some((x, i) => x && !sp.gitt[i]);

  // The front page shows how far today's puzzle has come (rusj/DAGLIG.md).
  function meldIGang(S) {
    const sp = dagensSpill(S);
    if (!sp || sp.ferdig || S.daglig.dager[sp.dagens] || !paabegynt(sp)) return;
    R.dagligIGang({ tekst: visTid(sp.tid) });
  }

  // ---------- What the board shows ----------

  const radAv = (sp, i) => (i / sp.n) | 0;
  const kolAv = (sp, i) => i % sp.n;
  const laast = (sp, i) => !!sp.gitt[i] || sp.hint.includes(i);

  const PRIKK = { 1: '<i class="sb-prikk svart" aria-hidden="true"></i>', 2: '<i class="sb-prikk hvit" aria-hidden="true"></i>' };
  const innhold = (sp, i) => PRIKK[sp.v[i]] || "";

  // The signs around a cell, said in its name («like the cell on the right»).
  function tegnRundt(sp, i) {
    const n = sp.n;
    const r = radAv(sp, i);
    const c = kolAv(sp, i);
    const ut = [];
    const legg = (s, lik, ulik) => s && ut.push(s === M.LIK ? lik : ulik);
    if (c < n - 1) legg(sp.tegn[i * 2], R.t("lik til høyre"), R.t("ulik til høyre"));
    if (c > 0) legg(sp.tegn[(i - 1) * 2], R.t("lik til venstre"), R.t("ulik til venstre"));
    if (r > 0) legg(sp.tegn[(i - n) * 2 + 1], R.t("lik over"), R.t("ulik over"));
    if (r < n - 1) legg(sp.tegn[i * 2 + 1], R.t("lik under"), R.t("ulik under"));
    return ut;
  }

  function etikett(sp, i, feil) {
    const sted = R.t("Rad {r}, kolonne {k}", { r: radAv(sp, i) + 1, k: kolAv(sp, i) + 1 });
    const x = sp.v[i];
    let hva = x ? FARGE[x] : R.t("tom");
    if (x && sp.gitt[i]) hva = R.t("{farge}, gitt", { farge: hva });
    else if (x && sp.hint.includes(i)) hva = R.t("{farge}, fra hint", { farge: hva });
    if (feil) hva = R.t("{hva}, bryter reglene", { hva });
    const t = tegnRundt(sp, i);
    return `${sted}: ${hva}${t.length ? ` (${t.join(", ")})` : ""}`;
  }

  function brettHtml(sp) {
    const n = sp.n;
    let html = "";
    for (let i = 0; i < n * n; i++) html += `<button type="button" class="sb-celle${sp.gitt[i] ? " gitt" : ""}" data-i="${i}" tabindex="-1" aria-label="${esc(etikett(sp, i, false))}">${innhold(sp, i)}</button>`;
    // The signs sit on the line between two cells.
    let tegn = "";
    for (let p = 0; p < sp.tegn.length; p++) {
      const s = sp.tegn[p];
      if (!s) continue;
      const i = p >> 1;
      const x = kolAv(sp, i) + (p & 1 ? 0.5 : 1);
      const y = radAv(sp, i) + (p & 1 ? 1 : 0.5);
      tegn += `<i class="sb-tegn ${s === M.LIK ? "lik" : "ulik"}" data-p="${p}" style="--x:${x};--y:${y}">${s === M.LIK ? "=" : "×"}</i>`;
    }
    return `${html}<span class="sb-tegnlag" aria-hidden="true">${tegn}</span>`;
  }

  const IKON = {
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    tom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>',
  };

  function hudHtml(S, sp) {
    return `<div class="sb-hud">
      <span class="sb-stat"><small>${esc(sp.dagens ? R.t("Dagens") : R.t("Størrelse"))}</small><b>${storrelse(sp.n)}</b></span>
      <button type="button" class="sb-klokke" data-h="pause" data-stille aria-label="${esc(sp.pause ? R.t("Fortsett") : R.t("Pause"))}"><span class="sb-pauseikon">${IKON.pause}</span><span class="sb-klokketekst"><small>${esc(R.t("Tid"))}</small><b id="sb-tid">${visTid(tidMs(sp))}</b></span></button>
      <span class="sb-stat"><small>${esc(R.t("Fylt"))}</small><b id="sb-antall">${fylt(sp)}/${sp.n * sp.n}</b></span>
    </div>`;
  }

  function verktoyHtml(sp) {
    return `<div class="sb-verktoy">
      <button type="button" class="sb-verk" data-h="angre" id="sb-angre" data-stille${sp.angre.length ? "" : " disabled"}>${IKON.angre}<span>${esc(R.t("Angre"))}</span></button>
      <button type="button" class="sb-verk" data-h="tom" id="sb-tom" data-stille>${IKON.tom}<span>${esc(R.t("Tøm"))}</span></button>
      <button type="button" class="sb-verk" data-h="hint" id="sb-hint" data-stille${sp.hintIgjen > 0 ? "" : " disabled"} aria-label="${esc(R.t("Hint, {n} igjen", { n: sp.hintIgjen }))}">${IKON.hint}<span>${esc(R.t("Hint"))}</span><i class="sb-merke" aria-hidden="true">${sp.hintIgjen}</i></button>
    </div>`;
  }

  // ---------- Updating the board in place ----------

  function oppdater(S) {
    const sp = aktiv(S);
    if (!sp || !celler.length) return;
    const n = sp.n;
    const b = M.brudd(n, sp.v, sp.tegn);
    for (let i = 0; i < n * n; i++) {
      const el = celler[i];
      if (!el) continue;
      let k = "sb-celle";
      if (sp.gitt[i]) k += " gitt";
      else if (sp.hint.includes(i)) k += " hintet";
      if (b.celler[i]) k += " konflikt";
      if (i === sp.valgt) k += " valgt";
      for (const x of ["blink", "rist", "hintmal", "bolge"]) if (el.classList.contains(x)) k += " " + x;
      if (el.className !== k) el.className = k;
      const inn = innhold(sp, i);
      if (tegnet[i] !== inn) {
        el.innerHTML = inn;
        tegnet[i] = inn;
      }
      const navn = etikett(sp, i, b.celler[i]);
      if (el.getAttribute("aria-label") !== navn) el.setAttribute("aria-label", navn);
      el.tabIndex = i === sp.valgt ? 0 : -1;
    }
    R.$$(".sb-tegn").forEach((t) => t.classList.toggle("brutt", b.tegn.has(Number(t.dataset.p))));
    const antall = R.$("#sb-antall");
    if (antall) antall.textContent = `${fylt(sp)}/${n * n}`;
    const angre = R.$("#sb-angre");
    if (angre) angre.disabled = !sp.angre.length;
    const hint = R.$("#sb-hint");
    if (hint) {
      hint.disabled = sp.hintIgjen <= 0;
      hint.setAttribute("aria-label", R.t("Hint, {n} igjen", { n: sp.hintIgjen }));
      hint.querySelector(".sb-merke").textContent = sp.hintIgjen;
    }
    const spillEl = R.$(".sb-spill");
    if (spillEl) {
      spillEl.classList.toggle("pauset", !!sp.pause);
      spillEl.classList.toggle("tomt", !paabegynt(sp));
    }
    const pause = R.$(".sb-pauseboks");
    if (pause) pause.hidden = !sp.pause;
    const klokke = R.$(".sb-klokke");
    if (klokke) klokke.setAttribute("aria-label", sp.pause ? R.t("Fortsett") : R.t("Pause"));
  }

  // Board size: the biggest square that fits, in whole pixels per cell. Landscape: the message line
  // goes to the right column; portrait: right under the board.
  function tilpass() {
    const flate = R.$(".sb-flate");
    const brett = R.$(".sb-brett");
    const sp = R.S && aktiv(R.S);
    if (!flate || !brett || !sp) return;
    const ligg = window.matchMedia("(orientation: landscape) and (max-height: 600px) and (min-width: 560px)").matches;
    const under = R.$(".sb-under");
    const mal = R.$(ligg ? ".sb-plass" : ".sb-midt");
    if (under && mal && under.parentElement !== mal) mal.appendChild(under);
    const plass = Math.min(flate.clientWidth - 4, flate.clientHeight - 4 - (under && !ligg ? under.offsetHeight + 10 : 0));
    const c = Math.max(26, Math.min(66, Math.floor((plass - 8) / sp.n)));
    brett.style.setProperty("--c", c + "px");
  }

  function effekt(indekser, klasse, ms) {
    if (R.rolig()) return;
    indekser.forEach((i, k) => {
      const el = celler[i];
      if (!el) return;
      setTimeout(() => {
        el.classList.remove(klasse);
        void el.offsetWidth;
        el.classList.add(klasse);
        setTimeout(() => el.classList.remove(klasse), 700);
      }, k * (ms || 0));
    });
  }

  // A short line under the board: hints and what is wrong (also read out by the kit).
  let meldingId = null;
  function melding(tekst) {
    const m = R.$(".sb-melding");
    if (!m) return R.toast(tekst);
    m.textContent = tekst;
    m.classList.add("vis");
    clearTimeout(meldingId);
    meldingId = setTimeout(() => {
      m.classList.remove("vis");
      // Emptied once it has faded, so the same message later is news again (and read out again).
      meldingId = setTimeout(() => (m.textContent = ""), 300);
    }, Math.max(3200, tekst.length * 60));
  }

  // ---------- Moves ----------

  function endre(sp, endringer) {
    if (!endringer.length) return;
    sp.angre.push(endringer);
    if (sp.angre.length > MAKS_ANGRE) sp.angre.shift();
  }

  const sted = (sp, i) => R.t("Rad {r}, kolonne {k}", { r: radAv(sp, i) + 1, k: kolAv(sp, i) + 1 });
  const kanSpille = (sp) => !!sp && !sp.ferdig && !sp.pause && !las;

  // Sets one cell (0 empty, 1 black, 2 white) as its own undo step.
  function sett(S, i, verdi) {
    const sp = aktiv(S);
    if (!kanSpille(sp) || i < 0 || i >= sp.n * sp.n) return;
    sp.valgt = i;
    if (laast(sp, i)) {
      oppdater(S);
      melding(sp.gitt[i] ? R.t("Rutene fra start står fast.") : R.t("Ruter fra hint står fast."));
      return;
    }
    if (sp.v[i] === verdi) return;
    endre(sp, [[i, sp.v[i]]]);
    sp.v[i] = verdi;
    etterEndring(S, i);
  }
  // A tap: empty → black → white → empty.
  const syklus = (S, i) => {
    const sp = aktiv(S);
    if (!sp) return;
    sett(S, i, (sp.v[i] + 1) % 3);
  };

  const BRUDD = () => ({ tre: R.t("Tre like på rad."), mange: R.t("For mange av samme farge i raden eller kolonnen."), tegn: R.t("Tegnet stemmer ikke.") });

  function etterEndring(S, i, stille) {
    const sp = aktiv(S);
    const b = M.brudd(sp.n, sp.v, sp.tegn);
    oppdater(S);
    const x = sp.v[i];
    if (x && b.celler[i]) {
      if (!stille) {
        R.lyd.tone(240, 0, 0.16, "triangle", 0.11, 170);
        R.vibrer([12, 40, 12]);
      }
      const T = BRUDD();
      R.si(`${R.t("{farge} i {sted}.", { farge: stor(FARGE[x]), sted: sted(sp, i).toLowerCase() })} ${(b.grunn[i] || []).map((g) => T[g]).join(" ")}`);
      effekt([i], "rist");
    } else {
      if (sp.v.every((y, k) => y === sp.losning[k])) return vinn(S, i);
      if (!stille) {
        if (x) R.lyd.tone(x === 1 ? 660 : 880, 0, 0.05, "triangle", 0.09, x === 1 ? 620 : 940);
        else R.lyd.tone(480, 0, 0.04, "triangle", 0.07, 380);
        R.vibrer(6);
        R.si(x ? R.t("{farge} i {sted}.", { farge: stor(FARGE[x]), sted: sted(sp, i).toLowerCase() }) : R.t("{sted} er tom.", { sted: sted(sp, i) }));
      }
    }
    if (sp.v.every(Boolean) && b.celler.some(Boolean)) melding(R.t("Brettet er fullt, men noe stemmer ikke. Se etter utropstegnene."));
    R.lagre();
  }

  function angre(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp) || !sp.angre.length) return;
    const endringer = sp.angre.pop();
    for (let k = endringer.length - 1; k >= 0; k--) {
      const [i, v] = endringer[k];
      sp.v[i] = v;
    }
    sp.valgt = endringer[0][0];
    R.si(endringer.length > 1 ? R.t("Angret {n} ruter.", { n: endringer.length }) : R.t("Angret. {sted}.", { sted: sted(sp, sp.valgt) }));
    R.lyd.tone(500, 0, 0.08, "triangle", 0.08, 420);
    oppdater(S);
    R.lagre();
  }

  function tom(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp)) return;
    const endringer = [];
    for (let i = 0; i < sp.v.length; i++) if (sp.v[i] && !laast(sp, i)) endringer.push([i, sp.v[i]]);
    if (!endringer.length) return melding(R.t("Brettet er allerede tomt."));
    endre(sp, endringer);
    for (const [i] of endringer) sp.v[i] = 0;
    R.lyd.sveip();
    oppdater(S);
    melding(R.t("Brettet er tømt. Angre henter det tilbake."));
    R.lagre();
  }

  const HINTTEKST = {
    par: () => R.t("To like ved siden av hverandre – da må naboen være den andre."),
    klemme: () => R.t("Mellom to like må det være den andre."),
    tegn: () => R.t("Tegnet bestemmer: = betyr like, × betyr ulike."),
    full: (l) => (l === "kolonne" ? R.t("Kolonnen har allerede halvparten av den ene fargen. Resten er den andre.") : R.t("Raden har allerede halvparten av den ene fargen. Resten er den andre.")),
    linje: (l) => (l === "kolonne" ? R.t("Bare denne fargen lar hele kolonnen gå opp.") : R.t("Bare denne fargen lar hele raden gå opp.")),
    prov: () => R.t("Med den andre fargen her blir det snart tre på rad eller for mange av én."),
    vanskelig: () => R.t("En vrien en: Her skal det stå denne fargen."),
  };

  function brukHint(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp)) return;
    if (sp.hintIgjen <= 0) return melding(R.t("Du har brukt alle hintene"));
    const h = M.hint(sp.n, sp.gitt, sp.tegn, sp.losning, sp.v);
    if (!h) return;
    sp.hintIgjen -= 1;
    if (h.type === "feil") {
      for (const i of h.celler) sp.v[i] = 0;
      sp.angre = sp.angre.filter((steg) => !steg.some(([i]) => h.celler.includes(i)));
      sp.valgt = h.celler[0];
      oppdater(S);
      effekt(h.celler, "blink", 60);
      R.lyd.tone(330, 0, 0.14, "triangle", 0.1, 260);
      melding(h.celler.length === 1 ? R.t("Én rute var feil. Den er tømt.") : R.t("{n} ruter var feil. De er tømt.", { n: h.celler.length }));
      R.lagre();
      return;
    }
    const i = h.i;
    sp.v[i] = h.v;
    sp.hint.push(i);
    sp.angre = sp.angre.filter((steg) => !steg.some(([k]) => k === i));
    sp.valgt = i;
    R.lyd.tone(990, 0, 0.12, "sine", 0.12);
    R.lyd.tone(1480, 0.1, 0.22, "sine", 0.1);
    melding((HINTTEKST[h.grunn] || HINTTEKST.vanskelig)(h.linje));
    etterEndring(S, i, true);
    if (!sp.ferdig) effekt([i], "hintmal");
  }

  function settPause(S, pa) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig) return;
    if (pa) {
      stoppKlokke(S);
      sp.pause = true;
    } else {
      sp.pause = false;
      startKlokke(S);
    }
    oppdater(S);
    tikk();
    R.lagre();
  }

  // Runs four times a second on the play screen; a sheet over the board stops the clock.
  let arkPause = false;
  function tikk() {
    const S = R.S;
    const sp = S && aktiv(S);
    if (!sp) return;
    if (R.arkApent()) {
      if (klokkeFra != null) {
        stoppKlokke(S);
        arkPause = true;
      }
    } else if (arkPause) {
      arkPause = false;
      startKlokke(S);
    }
    const el = R.$("#sb-tid");
    if (el) el.textContent = visTid(tidMs(sp));
  }

  // ---------- The win ----------

  function vinn(S, sist) {
    const sp = aktiv(S);
    stoppKlokke(S);
    sp.ferdig = true;
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const hint = HINT - sp.hintIgjen;
    const res = { sek, hint };
    if (sp.dagens) {
      const d = S.daglig;
      const forrige = d.dager[sp.dagens];
      res.dagForrige = forrige ? forrige.sek : null;
      if (!forrige) {
        d.dager[sp.dagens] = { sek, hint, n: sp.n };
        if (d.sistNr === sp.dagNr - 1) d.rekke += 1;
        else if (d.sistNr !== sp.dagNr) d.rekke = 1;
        d.sistNr = Math.max(d.sistNr || 0, sp.dagNr);
        d.beste = Math.max(d.beste || 0, d.rekke);
        const dager = Object.keys(d.dager).sort();
        for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete d.dager[k];
        // Only today's puzzle counts on the front page (one started before midnight does not).
        if (sp.dagens === R.dag().tekst) R.dagligFerdig({ vunnet: true, rekke: d.rekke, res: visTid(sek * 1000) });
      }
      res.rekke = d.rekke;
    } else {
      const gml = S.rekorder[sp.n] || null;
      res.gml = gml ? gml.tid : null;
      res.nyRekord = !!gml && sek < gml.tid;
      res.forste = !gml;
      S.rekorder[sp.n] = { tid: gml ? Math.min(gml.tid, sek) : sek, antall: (gml ? gml.antall : 0) + 1 };
    }
    sp.resultat = res;
    R.statistikk("ferdig", { n: sp.n, dagens: !!sp.dagens, sek, hint });
    R.lagre();
    las = true;
    oppdater(S);
    R.lyd.riktig();
    R.vibrer([30, 50, 30, 50, 120]);
    // A wave of stripes from the last cell across the board, then the result.
    const fortsatt = R.vakt();
    const avst = (a) => Math.abs(radAv(sp, a) - radAv(sp, sist)) + Math.abs(kolAv(sp, a) - kolAv(sp, sist));
    if (!R.rolig()) celler.forEach((el, i) => el && el.style.setProperty("--f", avst(i) * 50 + "ms"));
    const brett = R.$(".sb-brett");
    if (brett && !R.rolig()) brett.classList.add("vant");
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 700 : 1600,
    );
  }

  // ---------- Input on the board ----------

  function bindBrett(S, rot) {
    celler = [];
    tegnet = [];
    R.$$(".sb-celle", rot).forEach((el) => {
      const i = Number(el.dataset.i);
      celler[i] = el;
      tegnet[i] = el.innerHTML;
    });
    const brett = R.$(".sb-brett", rot);
    if (!brett) return;
    // Change on touch-down: instant, also when the finger slides a little.
    const ned = (e) => {
      const el = e.target.closest(".sb-celle");
      if (!el || (e.pointerType === "mouse" && e.button !== 0)) return;
      const sp = aktiv(R.S);
      if (!kanSpille(sp) || performance.now() - inntil < 350) return;
      e.preventDefault();
      R.lyd.lasOpp();
      syklus(R.S, Number(el.dataset.i));
    };
    // Keyboard (Enter/Space on a focused cell) cycles it too.
    const klikk = (e) => {
      const el = e.target.closest(".sb-celle");
      if (el && e.detail === 0) syklus(R.S, Number(el.dataset.i));
    };
    const fokusInn = (e) => {
      const el = e.target.closest(".sb-celle");
      const sp = aktiv(R.S);
      if (!el || !sp || sp.ferdig) return;
      const i = Number(el.dataset.i);
      if (sp.valgt !== i) {
        sp.valgt = i;
        oppdater(R.S);
      }
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    brett.addEventListener("pointerdown", ned);
    brett.addEventListener("click", klikk);
    brett.addEventListener("focusin", fokusInn);
    brett.addEventListener("contextmenu", nei);
    R.vedForlat(() => {
      brett.removeEventListener("pointerdown", ned);
      brett.removeEventListener("click", klikk);
      brett.removeEventListener("focusin", fokusInn);
      brett.removeEventListener("contextmenu", nei);
    });
  }

  // Keyboard: arrows move, Space/Enter cycle, 1 black, 2 white, Backspace/Delete/0 empty,
  // Ctrl/Cmd+Z undo, H hint, P pause.
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    const sp = S && aktiv(S);
    if (!S || S.skjerm !== "spill" || !sp || sp.ferdig || R.arkApent()) return;
    const el = e.target;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    const k = e.key;
    if (e.ctrlKey || e.metaKey) {
      if (k.toLowerCase() === "z") {
        e.preventDefault();
        angre(S);
      }
      return;
    }
    if (e.altKey) return;
    if (sp.pause) {
      if (k === "p" || k === "P") settPause(S, false);
      return;
    }
    const n = sp.n;
    const PIL = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const lav = k.toLowerCase();
    if (PIL[k]) {
      e.preventDefault();
      const i = sp.valgt >= 0 ? sp.valgt : 0;
      const r = (radAv(sp, i) + PIL[k][0] + n) % n;
      const c = (kolAv(sp, i) + PIL[k][1] + n) % n;
      sp.valgt = r * n + c;
      oppdater(S);
      R.lagre();
      if (celler[sp.valgt]) celler[sp.valgt].focus({ preventScroll: true });
    } else if (k === "1" || k === "2") {
      e.preventDefault();
      sett(S, sp.valgt, Number(k));
    } else if (k === "Backspace" || k === "Delete" || k === "0") {
      e.preventDefault();
      sett(S, sp.valgt, 0);
    } else if (lav === "h") {
      e.preventDefault();
      brukHint(S);
    } else if (lav === "p") settPause(S, true);
  });

  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass();
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !aktiv(S)) return;
    if (document.hidden) {
      stoppKlokke(S);
      meldIGang(S);
      R.lagre();
    } else startKlokke(S);
  });
  window.addEventListener("pagehide", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !aktiv(S)) return;
    stoppKlokke(S);
    R.lagre();
    startKlokke(S);
  });

  // The play screen fills the phone exactly: no page scroll, rubber band or zoom.
  const fastSide = (pa) => document.documentElement.classList.toggle("sb-fast", !!pa);

  // ---------- Small pieces of the screens ----------

  const kalender = (tekst) => `<span class="sb-kal" aria-hidden="true"><small>${esc(datoFmt(tekst, { month: "short" }).replace(".", "").slice(0, 3))}</small><b>${Number(tekst.slice(8, 10))}</b></span>`;
  const storIkon = (n) => `<span class="sb-mal" aria-hidden="true" style="--n:${n / 2}">${Array.from({ length: (n / 2) * (n / 2) }, (_, k) => `<i class="${(k + Math.floor(k / (n / 2))) % 2 ? "h" : "s"}"></i>`).join("")}</span>`;
  function miniBrett(sp) {
    return `<div class="sb-mini" aria-hidden="true" style="--n:${sp.n}">${sp.v.map((x, i) => `<i class="${x === 1 ? "s" : "h"}${sp.gitt[i] ? " g" : ""}"></i>`).join("")}</div>`;
  }

  function gyldigSpill(sp, dag) {
    if (!sp || typeof sp !== "object") return false;
    if (dag ? typeof sp.dagens !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sp.dagens) || !Number.isInteger(sp.dagNr) : sp.dagens != null) return false;
    const n = sp.n;
    if (!STR.includes(n)) return false;
    const celle = (x) => x === 0 || x === 1 || x === 2;
    if (!Array.isArray(sp.losning) || sp.losning.length !== n * n || !sp.losning.every((x) => x === 1 || x === 2)) return false;
    if (!Array.isArray(sp.gitt) || sp.gitt.length !== n * n || !sp.gitt.every((x, i) => x === 0 || x === sp.losning[i])) return false;
    if (!Array.isArray(sp.tegn) || sp.tegn.length !== n * n * 2 || !sp.tegn.every(celle)) return false;
    if (!Array.isArray(sp.v) || sp.v.length !== n * n || !sp.v.every(celle)) return false;
    sp.v = sp.v.map((x, i) => (sp.gitt[i] ? sp.gitt[i] : x));
    sp.hint = Array.isArray(sp.hint) ? sp.hint.filter((i) => Number.isInteger(i) && sp.v[i] === sp.losning[i]) : [];
    sp.angre = Array.isArray(sp.angre) ? sp.angre.filter((s) => Array.isArray(s) && s.every((x) => Array.isArray(x) && Number.isInteger(x[0]) && x[0] >= 0 && x[0] < n * n && !sp.gitt[x[0]])) : [];
    sp.valgt = Number.isInteger(sp.valgt) && sp.valgt >= 0 && sp.valgt < n * n ? sp.valgt : 0;
    sp.hintIgjen = R.klamp(Number(sp.hintIgjen) || 0, 0, HINT);
    sp.tid = Math.max(0, Number(sp.tid) || 0);
    sp.pause = !!sp.pause;
    sp.ferdig = !!sp.ferdig;
    if (sp.ferdig && !sp.resultat) sp.resultat = { sek: Math.round(sp.tid / 1000), hint: HINT - sp.hintIgjen };
    return true;
  }

  // ---------- Start ----------

  R.start({
    id: "sebraen",
    versjon: 1,
    pagar: (S) => iGang(S.fri) || iGang(dagensSpill(S)),

    tilstand: () => ({
      oppsett: { n: 6 },
      rekorder: {},
      daglig: { dager: {}, rekke: 0, beste: 0, sistNr: 0 },
      fri: null,
      dag: null,
      modus: "fri",
    }),

    lastet(S) {
      S.oppsett = { n: STR.includes(S.oppsett && S.oppsett.n) ? S.oppsett.n : 6 };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      for (const k of Object.keys(S.rekorder)) if (!STR.includes(Number(k)) || !S.rekorder[k] || !(S.rekorder[k].tid > 0)) delete S.rekorder[k];
      const d = S.daglig;
      if (!d || typeof d !== "object" || !d.dager || typeof d.dager !== "object") S.daglig = { dager: {}, rekke: 0, beste: 0, sistNr: 0 };
      else {
        for (const k of Object.keys(d.dager)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d.dager[k] || !(d.dager[k].sek > 0)) delete d.dager[k];
        d.rekke = Math.max(0, Math.floor(Number(d.rekke) || 0));
        d.beste = Math.max(d.rekke, Math.floor(Number(d.beste) || 0));
        d.sistNr = Math.floor(Number(d.sistNr) || 0);
      }
      if (!gyldigSpill(S.fri, false)) S.fri = null;
      // Only today's puzzle is kept (an older one is in the log already).
      if (!gyldigSpill(S.dag, true) || S.dag.dagens !== R.dag().tekst) S.dag = null;
      if (S.modus !== "dag" && S.modus !== "fri") S.modus = "fri";
      const sp = aktiv(S);
      if (S.skjerm === "slutt" && (!sp || !sp.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!sp || sp.ferdig)) S.skjerm = sp ? "slutt" : "hjem";
      // The front page reads the daily from the kit's own key: say it again on every load.
      const lost = S.daglig.dager[R.dag().tekst];
      if (lost && S.daglig.sistNr === R.dag().nr) R.dagligFerdig({ vunnet: true, rekke: S.daglig.rekke, res: visTid(lost.sek * 1000) });
    },

    // rusj.no/sebraen/#dagens (the front page's «I dag») opens today's puzzle – or its result.
    vedHash: (S, hash) => (hash === "dagens" ? apneDagens(S) : null),

    regler: {
      intro: R.t("Fyll brettet med svarte og hvite prikker. Aldri tre like etter hverandre, og like mange av hver i hver rad og hver kolonne."),
      steg: [
        [R.t("Trykk for å fylle"), R.t("Ett trykk gir svart, neste gir hvit, og det tredje tømmer ruta.")],
        [R.t("Aldri tre på rad"), R.t("Tre like etter hverandre – bortover eller nedover – blir merket med et utropstegn. Det samme gjør for mange av én farge i en rad eller kolonne.")],
        [R.t("Tegnene mellom rutene"), R.t("= betyr at de to rutene er like. × betyr at de er ulike.")],
      ],
      tips: [
        R.t("To like ved siden av hverandre? Da må rutene på hver side være den andre fargen."),
        R.t("Mellom to like er det alltid den andre: svart, hvit, svart."),
        R.t("Når en rad har fått halvparten av én farge, er resten den andre."),
        R.t("Prikkene har ulik form – fylt og hul – så du ser forskjellen uten å skille farger."),
        R.t("Står du fast? Du har tre hint per brett. Hvert brett har bare én løsning, så du trenger aldri gjette."),
        R.t("Dagens sebra er den samme for alle: 6 × 6 i starten av uka, 10 × 10 i helgen."),
        R.t("Med tastatur: piltaster flytter, mellomrom fyller, 1 gir svart, 2 gir hvit, Backspace tømmer, H gir hint og P er pause."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = R.dag();
          const dag = dagensSpill(S);
          const lost = S.daglig.dager[d.tekst];
          const fri = iGang(S.fri) ? S.fri : null;
          const r = dagRekke(S);
          const regler = R.ui.lenke(R.t("Slik spiller du"), "regler");
          const friTekst = fri ? R.t("Fortsett · {str} · {tid}", { str: storrelse(fri.n), tid: visTid(fri.tid) }) : R.t("Spill fritt · {str}", { str: storrelse(S.oppsett.n) });
          const friH = fri ? "fortsett" : "nytt";
          const bytt = R.ui.lenke(fri ? R.t("Nytt spill") : R.t("Bytt størrelse"), "bytt");
          let knapper;
          if (!lost) {
            const n = M.dagligStorrelse(d.nr);
            const igang = dag && paabegynt(dag);
            const under = igang ? `${storrelse(dag.n)} · ${visTid(dag.tid)}` : `${stor(ukedag(d.tekst))} · ${storrelse(n)}${r > 0 ? ` · 🔥 ${R.t("{dager} på rad", { dager: R.flertall(r, "dag", "dager") })}` : ""}`;
            knapper =
              R.ui.knapp("", "dagens", {
                variant: "stor",
                tekstHtml: `${kalender(d.tekst)}<span class="sb-dagknapp"><b>${esc(igang ? R.t("Fortsett dagens") : R.t("Dagens sebra"))}</b><small>${esc(under)}</small></span>`,
              }) +
              R.ui.knapp2(friTekst, friH) +
              R.ui.lenkerad(bytt, regler);
          } else {
            knapper =
              R.ui.knapp(friTekst, friH) +
              `<p class="sb-daglinje">✓ ${esc(R.t("Dagens sebra: {tid}", { tid: visTid(lost.sek * 1000) }))}${r > 1 ? ` · 🔥 ${esc(R.t("{n} dager på rad", { n: r }))}` : ""}</p>` +
              R.ui.lenkerad(R.ui.lenke(R.t("Se resultatet"), "dagens"), bytt, regler) +
              nedtellingHtml();
          }
          const rek = STR.filter((n) => S.rekorder[n]).map((n) => `<li><b>${storrelse(n)}</b> ${visTid(S.rekorder[n].tid * 1000)}<small> · ${esc(R.flertall(S.rekorder[n].antall, "brett", "brett"))}</small></li>`);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Svart og hvitt – aldri tre på rad."))}<br><em>${esc(R.t("Like mange av hver i hver rad og kolonne."))}</em>`,
              knapperHtml: knapper,
              merker: [
                ["6–10", R.t("størrelser")],
                ["1", R.t("ny hver dag")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="sb-rekorder" aria-label="${esc(R.t("Dine beste tider"))}"><p class="etikett">${esc(R.t("Dine beste tider"))}</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
        inn(S) {
          if (S.daglig.dager[R.dag().tekst]) startNedtelling();
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor stort brett?"))}</h2></div>
              ${R.ui.fliser(
                "storrelse",
                STR.map((n) => ({
                  v: n,
                  tittel: storrelse(n),
                  tekst: S.rekorder[n] ? R.t("Rekord {tid}", { tid: visTid(S.rekorder[n].tid * 1000) }) : NIVA[n],
                  ikon: storIkon(n),
                })),
                S.oppsett.n,
              )}
              <p class="hjelp">${esc(R.t("Hvert brett er nytt og har bare én løsning – du trenger aldri gjette."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = aktiv(S);
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(sp.dagens ? R.t("Dagens sebra") : R.t("Sebraen, {str}", { str: storrelse(sp.n) }))}</h1>
            <div class="sb-spill${sp.pause ? " pauset" : ""}">
              <div class="sb-topp">${hudHtml(S, sp)}</div>
              <div class="sb-flate">
                <div class="sb-midt">
                  <div class="sb-brett" role="group" aria-label="${esc(R.t("Brettet, {n} ganger {n} ruter", { n: sp.n }))}" style="--n:${sp.n}">${brettHtml(sp)}</div>
                  <div class="sb-under"><p class="sb-tips" aria-hidden="true">${esc(R.t("Trykk én gang for svart, to ganger for hvit."))}</p><p class="sb-melding" role="status"></p></div>
                </div>
                <div class="sb-pauseboks"${sp.pause ? "" : " hidden"}>
                  <div class="sb-pausekort">
                    <p class="etikett">${esc(R.t("Pause"))}</p>
                    <p class="sb-pausetekst">${esc(R.t("Brettet venter på deg."))}</p>
                    ${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}
                  </div>
                </div>
              </div>
              <div class="sb-plass"></div>
              ${R.ui.dokk(verktoyHtml(sp))}
            </div>`;
        },
        etter(S, rot) {
          bindBrett(S, rot);
          oppdater(S);
          tilpass();
          const flate = R.$(".sb-flate", rot);
          if (flate && typeof ResizeObserver === "function") {
            const obs = new ResizeObserver(() => tilpass());
            obs.observe(flate);
            R.vedForlat(() => obs.disconnect());
          }
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp || sp.ferdig) return R.gaTil(sp ? "slutt" : "hjem");
          las = false;
          inntil = performance.now();
          fastSide(true);
          tilpass();
          R.holdVaken();
          startKlokke(S);
          const id = setInterval(tikk, 250);
          R.vedForlat(() => clearInterval(id));
        },
        ut(S) {
          stoppKlokke(S);
          meldIGang(S);
          arkPause = false;
          las = false;
          celler = [];
          tegnet = [];
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const r = sp.resultat || { sek: Math.round(sp.tid / 1000), hint: HINT - sp.hintIgjen };
          const str = storrelse(sp.n);
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const tall = `<div class="sb-resultat">
              <div class="sb-tall-boks${r.nyRekord ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>${esc(R.t("tid"))}</span>${r.nyRekord ? `<i class="sb-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="sb-tall-boks"><b>${r.hint}</b><span>${esc(R.t("hint brukt|hint brukt", { n: r.hint }))}</span></div>
            </div>`;
          if (sp.dagens) {
            const idag = sp.dagens === R.dag().tekst;
            const linje = r.dagForrige ? R.t("Du løste dagens sebra på {tid} første gang.", { tid: visTid(r.dagForrige * 1000) }) : r.hint ? R.t("Alle i hele landet får det samme brettet i dag.") : R.t("Uten hint! Alle i hele landet får det samme brettet i dag.");
            return `
              ${R.ui.banner({ etikett: `${R.t("{navn} nr. {nr}", { navn: NAVN(), nr: nrFor(sp.dagNr) })} · ${datoTekst(sp.dagens)}`, tittel: R.t("Godt jobba!"), klasse: "aksent" })}
              ${tall}
              <p class="hjelp">${esc(linje)}</p>
              <div class="sb-dagboks">
                ${r.rekke ? `<p class="sb-rekke"><span aria-hidden="true">🔥</span> ${esc(R.t("{dager} på rad", { dager: R.flertall(r.rekke, "dag", "dager") }))}</p>` : ""}
                ${idag ? nedtellingHtml() : `<p class="sb-nedtelling"><b>${esc(R.t("En ny sebra er klar!"))}</b></p>`}
              </div>
              ${miniBrett(sp)}
              ${R.ui.flereSpill({ antall: 1 })}
              ${idag ? R.ui.dokk(R.ui.knapp(R.t("Del resultatet"), "del"), R.ui.lenkerad(R.ui.lenke(R.t("Spill fritt"), "fri"), alle)) : R.ui.dokk(R.ui.knapp(R.t("Dagens sebra"), "dagens"), R.ui.lenkerad(alle))}`;
          }
          let linje;
          if (r.nyRekord) linje = R.t("Ny personlig rekord på {str}! Forrige: {tid}.", { str, tid: visTid(r.gml * 1000) });
          else if (r.gml) linje = R.t("Rekorden din på {str}: {tid}.", { str, tid: visTid(Math.min(r.gml, r.sek) * 1000) });
          else linje = R.t("Første brett på {str} – nå har du en rekord å slå!", { str });
          return `
            ${R.ui.banner({ etikett: R.t("{str} · løst", { str }), tittel: r.nyRekord ? R.t("Ny rekord!") : R.t("Godt jobba!"), klasse: "aksent", stemning: r.nyRekord || !r.hint ? "jubel" : "" })}
            ${tall}
            <p class="hjelp">${esc(linje)}</p>
            ${miniBrett(sp)}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "bytt"), alle))}`;
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp) return;
          const r = sp.resultat || {};
          if (sp.dagens && sp.dagens === R.dag().tekst) startNedtelling();
          // Celebrate in proportion: fanfare for a clean solve, a record or the daily; warm otherwise.
          if (r.hint === 0 || r.nyRekord || sp.dagens) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
        },
      },
    },

    handlinger: (H = {
      // «Spill fritt»: a new board at once, at the last size played.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      bytt: () => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        S.modus = "fri";
        R.gaTil(iGang(S.fri) ? "spill" : "hjem");
      },
      fri(el, e, S) {
        if (iGang(S.fri)) return H.fortsett(el, e, S);
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      dagens: (el, e, S) => R.gaTil(apneDagens(S)),
      storrelse(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.n = STR.includes(n) ? n : 6;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      angre: (el, e, S) => angre(S),
      tom: (el, e, S) => tom(S),
      hint: (el, e, S) => brukHint(S),
      pause: (el, e, S) => settPause(S, !aktiv(S).pause),
      "fortsett-spill": (el, e, S) => settPause(S, false),
      del(el, e, S) {
        const sp = S.dag;
        const best = sp && sp.dagens && S.daglig.dager[sp.dagens];
        if (!best) return;
        const rekke = (sp.resultat && sp.resultat.rekke) || 0;
        const tid = visTid(best.sek * 1000);
        const tittel = R.t("{navn} nr. {nr}", { navn: NAVN(), nr: nrFor(sp.dagNr) });
        const hint = best.hint ? R.t("{n} hint", { n: best.hint }) : R.t("uten hint");
        const dager = rekke > 1 ? `🔥 ${R.t("{n} dager på rad", { n: rekke })}` : "";
        const tekst = `🦓 ${tittel} · ${storrelse(best.n || sp.n)} · ${tid} · ${hint}${dager ? ` · ${dager}` : ""}. ${R.t("Klarer du dagens sebra?")}`;
        const linjer = [tid, `${storrelse(best.n || sp.n)} · ${hint}`];
        if (dager) linjer.push(dager);
        R.del(R.t("{navn} – dagens sebra", { navn: NAVN() }), tekst, ADRESSE + "#utfordring", { kort: { tittel, linjer } });
      },
    }),
  });

  // For the tests and curious minds: the engine is also reachable from the console.
  window.Sebraen = motor;
})();
