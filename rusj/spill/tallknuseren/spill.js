/* Tallknuseren — Sudoku.
   Every puzzle is made on the phone in a few milliseconds: a random full grid (from a seed), clues
   taken away in pairs that mirror each other through the centre for as long as the solution stays
   unique, and then a grading that solves it the way a person would (singles → locked candidates
   and pairs → triples, X-wing, XY-wing, swordfish). A level accepts only puzzles that need exactly
   its techniques. «Dagens sudoku» uses today's date as the seed, so all of Norway gets the same one.
   The engine at the top is pure and also runs under node (test/tallknuseren.test.mjs).
   The play screen is drawn once; taps update the cells in place so input stays instant. */
(function () {
  "use strict";

  // ======================= Engine =======================

  const motor = (function () {
    const RAD = new Uint8Array(81);
    const KOL = new Uint8Array(81);
    const BOKS = new Uint8Array(81);
    for (let i = 0; i < 81; i++) {
      RAD[i] = (i / 9) | 0;
      KOL[i] = i % 9;
      BOKS[i] = ((RAD[i] / 3) | 0) * 3 + ((KOL[i] / 3) | 0);
    }
    // Units: 0–8 rows, 9–17 columns, 18–26 boxes.
    const ENHETER = [];
    for (let r = 0; r < 9; r++) ENHETER.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
    for (let c = 0; c < 9; c++) ENHETER.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
    for (let b = 0; b < 9; b++) {
      const r0 = ((b / 3) | 0) * 3;
      const c0 = (b % 3) * 3;
      ENHETER.push(Array.from({ length: 9 }, (_, k) => (r0 + ((k / 3) | 0)) * 9 + c0 + (k % 3)));
    }
    const NABOER = Array.from({ length: 81 }, (_, i) => {
      const s = new Set();
      for (const e of [ENHETER[RAD[i]], ENHETER[9 + KOL[i]], ENHETER[18 + BOKS[i]]]) for (const j of e) if (j !== i) s.add(j);
      return Array.from(s);
    });
    const ER_NABO = new Uint8Array(81 * 81);
    for (let i = 0; i < 81; i++) for (const j of NABOER[i]) ER_NABO[i * 81 + j] = 1;
    const BITS = new Uint8Array(1024);
    for (let m = 1; m < 1024; m++) BITS[m] = BITS[m >> 1] + (m & 1);
    const ALLE = 0x3fe; // candidate bits 1..9
    const siffer = (bit) => 31 - Math.clz32(bit); // one bit → its digit (or row/column index)

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

    // ---------- Solving ----------
    // Backtracking over bitmasks, always on the cell with the fewest candidates. Returns how many
    // solutions there are, counting no further than `grense`. With `ut` the first solution is
    // copied into it; with `tilf` the candidates are tried in random order (random full grids).
    function tell(rute, grense, ut, tilf) {
      grense = grense || 2;
      const r = new Int16Array(9);
      const k = new Int16Array(9);
      const b = new Int16Array(9);
      const v = Uint8Array.from(rute);
      const tomme = [];
      for (let i = 0; i < 81; i++) {
        const d = v[i];
        if (!d) {
          tomme.push(i);
          continue;
        }
        if (d > 9) return 0;
        const bit = 1 << d;
        if ((r[RAD[i]] | k[KOL[i]] | b[BOKS[i]]) & bit) return 0;
        r[RAD[i]] |= bit;
        k[KOL[i]] |= bit;
        b[BOKS[i]] |= bit;
      }
      const n = tomme.length;
      let antall = 0;
      function steg(dybde) {
        if (dybde === n) {
          antall++;
          if (ut && antall === 1) for (let i = 0; i < 81; i++) ut[i] = v[i];
          return antall >= grense;
        }
        let beste = dybde;
        let besteM = 0;
        let besteN = 10;
        for (let j = dybde; j < n; j++) {
          const i = tomme[j];
          const m = ~(r[RAD[i]] | k[KOL[i]] | b[BOKS[i]]) & ALLE;
          const c = BITS[m];
          if (c < besteN) {
            besteN = c;
            beste = j;
            besteM = m;
            if (c < 2) break;
          }
        }
        if (besteN === 0) return false;
        const i = tomme[beste];
        tomme[beste] = tomme[dybde];
        tomme[dybde] = i;
        const ri = RAD[i];
        const ki = KOL[i];
        const bi = BOKS[i];
        let biter;
        if (tilf) {
          biter = [];
          for (let m = besteM; m; m &= m - 1) biter.push(m & -m);
          stokk(biter, tilf);
        }
        let m = besteM;
        for (let x = 0; tilf ? x < biter.length : m; x++) {
          let bit;
          if (tilf) bit = biter[x];
          else {
            bit = m & -m;
            m ^= bit;
          }
          r[ri] |= bit;
          k[ki] |= bit;
          b[bi] |= bit;
          v[i] = siffer(bit);
          const stopp = steg(dybde + 1);
          r[ri] ^= bit;
          k[ki] ^= bit;
          b[bi] ^= bit;
          v[i] = 0;
          if (stopp) return true;
        }
        return false;
      }
      steg(0);
      return antall;
    }

    function los(rute) {
      const ut = new Uint8Array(81);
      return tell(rute, 1, ut) === 1 ? ut : null;
    }

    function fyltRute(tilf) {
      const ut = new Uint8Array(81);
      tell(new Uint8Array(81), 1, ut, tilf);
      return ut;
    }

    // Take clues away in pairs mirrored through the centre while the solution stays unique,
    // until `mal` clues are left (0 = as few as possible).
    function grav(losning, tilf, mal) {
      const p = Uint8Array.from(losning);
      const par = stokk(Array.from({ length: 41 }, (_, i) => i), tilf);
      let gitte = 81;
      for (const i of par) {
        if (gitte <= mal) break;
        const j = 80 - i;
        const a = p[i];
        const b = p[j];
        p[i] = 0;
        p[j] = 0;
        if (tell(p, 2) !== 1) {
          p[i] = a;
          p[j] = b;
        } else gitte -= i === j ? 1 : 2;
      }
      return p;
    }

    // ---------- Grading: solve like a person, the easiest technique first ----------
    // 1: hidden single in a box · 2: hidden single in a row/column, naked single · 3: locked
    // candidates, naked/hidden pairs · 4: triples, quads, X-wing, XY-wing, swordfish.
    // Returns { niva: the highest level needed (9 = these techniques are not enough), teknikker }.
    function grader(rute) {
      const v = Uint8Array.from(rute);
      const kand = new Uint16Array(81);
      let igjen = 0;
      for (let i = 0; i < 81; i++) {
        if (v[i]) continue;
        igjen++;
        let m = ALLE;
        for (const j of NABOER[i]) if (v[j]) m &= ~(1 << v[j]);
        kand[i] = m;
      }
      const bruk = {};
      let maks = 0;
      const sett = (i, d) => {
        v[i] = d;
        kand[i] = 0;
        igjen--;
        const bit = 1 << d;
        for (const j of NABOER[i]) kand[j] &= ~bit;
      };
      const merk = (navn, niva) => {
        bruk[navn] = (bruk[navn] || 0) + 1;
        if (niva > maks) maks = niva;
      };
      function skjult(fra, til) {
        for (let u = fra; u < til; u++) {
          const e = ENHETER[u];
          for (let d = 1; d <= 9; d++) {
            const bit = 1 << d;
            let pos = -1;
            let n = 0;
            for (const i of e) {
              if (v[i] === d) {
                n = -1;
                break;
              }
              if (kand[i] & bit) {
                n++;
                pos = i;
              }
            }
            if (n === 1) {
              sett(pos, d);
              return true;
            }
          }
        }
        return false;
      }
      function naken() {
        for (let i = 0; i < 81; i++)
          if (!v[i] && BITS[kand[i]] === 1) {
            sett(i, siffer(kand[i]));
            return true;
          }
        return false;
      }
      function laste() {
        for (let b = 0; b < 9; b++) {
          const e = ENHETER[18 + b];
          for (let d = 1; d <= 9; d++) {
            const bit = 1 << d;
            let rader = 0;
            let koler = 0;
            let n = 0;
            for (const i of e)
              if (kand[i] & bit) {
                rader |= 1 << RAD[i];
                koler |= 1 << KOL[i];
                n++;
              }
            if (n < 2) continue;
            let linje = null;
            if (BITS[rader] === 1) linje = ENHETER[siffer(rader)];
            else if (BITS[koler] === 1) linje = ENHETER[9 + siffer(koler)];
            if (!linje) continue;
            let endret = false;
            for (const i of linje)
              if (BOKS[i] !== b && kand[i] & bit) {
                kand[i] &= ~bit;
                endret = true;
              }
            if (endret) return true;
          }
        }
        for (let u = 0; u < 18; u++) {
          const e = ENHETER[u];
          for (let d = 1; d <= 9; d++) {
            const bit = 1 << d;
            let bokser = 0;
            let n = 0;
            for (const i of e)
              if (kand[i] & bit) {
                bokser |= 1 << BOKS[i];
                n++;
              }
            if (n < 2 || BITS[bokser] !== 1) continue;
            let endret = false;
            for (const i of ENHETER[18 + siffer(bokser)])
              if ((u < 9 ? RAD[i] !== u : KOL[i] !== u - 9) && kand[i] & bit) {
                kand[i] &= ~bit;
                endret = true;
              }
            if (endret) return true;
          }
        }
        return false;
      }
      function kombiner(liste, str, fn) {
        const valgt = [];
        function rek(fra) {
          if (valgt.length === str) return fn(valgt);
          for (let k = fra; k <= liste.length - (str - valgt.length); k++) {
            valgt.push(liste[k]);
            if (rek(k + 1)) return true;
            valgt.pop();
          }
          return false;
        }
        return rek(0);
      }
      function nakenGruppe(str) {
        for (let u = 0; u < 27; u++) {
          const e = ENHETER[u];
          const celler = e.filter((i) => !v[i] && BITS[kand[i]] >= 2 && BITS[kand[i]] <= str);
          if (celler.length < str) continue;
          const funnet = kombiner(celler, str, (kombo) => {
            let m = 0;
            for (const i of kombo) m |= kand[i];
            if (BITS[m] !== str) return false;
            let endret = false;
            for (const i of e)
              if (!v[i] && !kombo.includes(i) && kand[i] & m) {
                kand[i] &= ~m;
                endret = true;
              }
            return endret;
          });
          if (funnet) return true;
        }
        return false;
      }
      function skjultGruppe(str) {
        for (let u = 0; u < 27; u++) {
          const e = ENHETER[u];
          const pos = new Uint16Array(10);
          const sifre = [];
          for (let d = 1; d <= 9; d++) {
            let p = 0;
            for (let k = 0; k < 9; k++) if (kand[e[k]] & (1 << d)) p |= 1 << k;
            pos[d] = p;
            if (BITS[p] >= 2 && BITS[p] <= str) sifre.push(d);
          }
          if (sifre.length < str) continue;
          const funnet = kombiner(sifre, str, (kombo) => {
            let p = 0;
            let dm = 0;
            for (const d of kombo) {
              p |= pos[d];
              dm |= 1 << d;
            }
            if (BITS[p] !== str) return false;
            let endret = false;
            for (let k = 0; k < 9; k++)
              if (p & (1 << k) && kand[e[k]] & ~dm) {
                kand[e[k]] &= dm;
                endret = true;
              }
            return endret;
          });
          if (funnet) return true;
        }
        return false;
      }
      function fisk(str) {
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d;
          for (let retning = 0; retning < 2; retning++) {
            const linjer = [];
            for (let l = 0; l < 9; l++) {
              const e = ENHETER[retning * 9 + l];
              let p = 0;
              for (let k = 0; k < 9; k++) if (kand[e[k]] & bit) p |= 1 << k;
              if (BITS[p] >= 2 && BITS[p] <= str) linjer.push([l, p]);
            }
            if (linjer.length < str) continue;
            const funnet = kombiner(linjer, str, (kombo) => {
              let p = 0;
              for (const [, q] of kombo) p |= q;
              if (BITS[p] !== str) return false;
              let endret = false;
              for (let k = 0; k < 9; k++) {
                if (!(p & (1 << k))) continue;
                const dekk = ENHETER[(1 - retning) * 9 + k];
                for (let l = 0; l < 9; l++) {
                  if (kombo.some(([x]) => x === l)) continue;
                  const i = dekk[l];
                  if (kand[i] & bit) {
                    kand[i] &= ~bit;
                    endret = true;
                  }
                }
              }
              return endret;
            });
            if (funnet) return true;
          }
        }
        return false;
      }
      function xyVinge() {
        for (let p = 0; p < 81; p++) {
          if (v[p] || BITS[kand[p]] !== 2) continue;
          const mp = kand[p];
          const vinger = NABOER[p].filter((j) => !v[j] && BITS[kand[j]] === 2 && kand[j] !== mp && BITS[kand[j] & mp] === 1);
          for (const x of vinger)
            for (const y of vinger) {
              if (x >= y) continue;
              const cx = kand[x] & ~mp;
              if (cx !== (kand[y] & ~mp) || (kand[x] & mp) === (kand[y] & mp)) continue;
              let endret = false;
              for (const j of NABOER[x])
                if (j !== y && ER_NABO[j * 81 + y] && kand[j] & cx) {
                  kand[j] &= ~cx;
                  endret = true;
                }
              if (endret) return true;
            }
        }
        return false;
      }
      while (igjen > 0) {
        if (skjult(18, 27)) merk("boks", 1);
        else if (skjult(0, 18)) merk("linje", 2);
        else if (naken()) merk("naken", 2);
        else if (laste()) merk("laste", 3);
        else if (nakenGruppe(2)) merk("nakenPar", 3);
        else if (skjultGruppe(2)) merk("skjultPar", 3);
        else if (nakenGruppe(3)) merk("nakenTrippel", 4);
        else if (skjultGruppe(3)) merk("skjultTrippel", 4);
        else if (fisk(2)) merk("xvinge", 4);
        else if (xyVinge()) merk("xyvinge", 4);
        else if (fisk(3)) merk("sverdfisk", 4);
        else if (nakenGruppe(4)) merk("nakenKvartett", 4);
        else if (skjultGruppe(4)) merk("skjultKvartett", 4);
        else return { niva: 9, teknikker: bruk };
      }
      return { niva: maks, teknikker: bruk };
    }

    // ---------- Levels ----------
    // mal: clues to stop at (0 = as few as possible) · grad: the grading the level accepts.
    // (No prototype: an unknown name such as "__proto__" is undefined, never a level.)
    const NIVAER = Object.assign(Object.create(null), {
      lett: { mal: 36, grad: 1 },
      middels: { mal: 30, grad: 2 },
      vanskelig: { mal: 0, grad: 3 },
      ekspert: { mal: 0, grad: 4 },
    });
    const MAKS_FORSOK = 600;

    // A puzzle for a level from a seed (the same seed always gives the same puzzle).
    function lag(niva, fro) {
      return lagMed(NIVAER[niva] || NIVAER.middels, fro, MAKS_FORSOK);
    }
    function lagMed(N, fro, maks) {
      const tilf = rng(fro);
      let reserve = null;
      for (let forsok = 1; forsok <= maks; forsok++) {
        const losning = fyltRute(tilf);
        const oppgave = grav(losning, tilf, N.mal);
        const g = grader(oppgave);
        if (g.niva === N.grad) return { oppgave, losning, grad: g.niva, forsok };
        // Practically never needed: the closest solvable puzzle below the level.
        if (g.niva < N.grad && (!reserve || g.niva > reserve.grad)) reserve = { oppgave, losning, grad: g.niva, forsok };
      }
      return reserve;
    }

    // ---------- «Dagens sudoku» ----------
    // Everybody must get the same puzzle on the same day, also on phones with an older copy of the
    // game, and a day's puzzle must never change afterwards. So the daily has its own frozen rules
    // (never shared with the level settings above, which may be tuned), its own copy of the seed
    // hash, and test/tallknuseren.test.mjs pins known days.
    const DAGLIG = Object.freeze({
      lett: Object.freeze({ mal: 36, grad: 1 }),
      middels: Object.freeze({ mal: 30, grad: 2 }),
      vanskelig: Object.freeze({ mal: 0, grad: 3 }),
      ekspert: Object.freeze({ mal: 0, grad: 4 }),
    });
    const DAGLIG_FORSOK = 600;
    // Easy on Monday, expert on Sunday (index 0 = Sunday).
    const DAGLIG_UKE = Object.freeze(["ekspert", "lett", "lett", "middels", "middels", "vanskelig", "vanskelig"]);
    // FNV-1a, the same as the kit's R.hash on 9 November 2026.
    function fnv(tekst) {
      let h = 0x811c9dc5;
      for (let i = 0; i < tekst.length; i++) {
        h ^= tekst.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    // dato: "2026-11-09" (the date in Norway), nr: days since 1 January 1970 (R.dag()).
    const dagligNiva = (nr) => DAGLIG_UKE[(((nr + 4) % 7) + 7) % 7];
    function lagDaglig(dato, nr) {
      const niva = dagligNiva(nr);
      return Object.assign({ niva }, lagMed(DAGLIG[niva], fnv("tallknuseren:" + dato), DAGLIG_FORSOK));
    }

    // ---------- Hints ----------
    // The next helpful step for a player: wrong numbers first; then a single that is easy to
    // explain (the selected cell if it is one, otherwise the nearest); else the cell with the
    // fewest candidates. v: current values, losning: the solution, valgt: selected cell or -1.
    function hint(v, losning, valgt) {
      const feil = [];
      for (let i = 0; i < 81; i++) if (v[i] && v[i] !== losning[i]) feil.push(i);
      if (feil.length) return { type: "feil", celler: feil };
      const kand = new Uint16Array(81);
      const tomme = [];
      for (let i = 0; i < 81; i++) {
        if (v[i]) continue;
        tomme.push(i);
        let m = ALLE;
        for (const j of NABOER[i]) if (v[j]) m &= ~(1 << v[j]);
        kand[i] = m;
      }
      if (!tomme.length) return null;
      const eneste = (u, d) => {
        const bit = 1 << d;
        let pos = -1;
        for (const i of ENHETER[u]) {
          if (v[i] === d) return -1;
          if (kand[i] & bit) {
            if (pos >= 0) return -1;
            pos = i;
          }
        }
        return pos;
      };
      const grunner = [
        (i) => eneste(18 + BOKS[i], losning[i]) === i && "boks",
        (i) => eneste(RAD[i], losning[i]) === i && "rad",
        (i) => eneste(9 + KOL[i], losning[i]) === i && "kolonne",
        (i) => BITS[kand[i]] === 1 && "naken",
      ];
      const svar = (i, grunn) => ({ type: "tall", i, d: losning[i], grunn });
      if (valgt >= 0 && valgt < 81 && !v[valgt])
        for (const g of grunner) {
          const grunn = g(valgt);
          if (grunn) return svar(valgt, grunn);
        }
      const rekke = valgt >= 0 ? tomme.slice().sort((a, b) => avstand(a, valgt) - avstand(b, valgt)) : tomme;
      for (const g of grunner)
        for (const i of rekke) {
          const grunn = g(i);
          if (grunn) return svar(i, grunn);
        }
      let mi = rekke[0];
      for (const i of rekke) if (BITS[kand[i]] < BITS[kand[mi]]) mi = i;
      return svar(mi, "vanskelig");
    }
    const avstand = (a, b) => Math.abs(RAD[a] - RAD[b]) + Math.abs(KOL[a] - KOL[b]);

    return { RAD, KOL, BOKS, ENHETER, NABOER, BITS, rng, tell, los, fyltRute, grav, grader, NIVAER, lag, dagligNiva, lagDaglig, hint };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;
  const { RAD, KOL, BOKS, ENHETER, NABOER } = M;

  const NIVA_ID = ["lett", "middels", "vanskelig", "ekspert"];
  // Without a prototype, so a saved or typed value like "__proto__" or "constructor" is simply
  // not a level (NIVA[x] is undefined) instead of something that looks like one.
  const NIVA = Object.assign(Object.create(null), {
    lett: { navn: "Lett", tekst: "En rolig start" },
    middels: { navn: "Middels", tekst: "Litt mer å tenke på" },
    vanskelig: { navn: "Vanskelig", tekst: "Krever smarte triks" },
    ekspert: { navn: "Ekspert", tekst: "For ekte tallknusere" },
  });
  const UKEDAG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const MANED = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  const HINT = 3;
  const MAKS_ANGRE = 400;

  let H; // actions
  let klokkeFra = null; // performance.now() when the clock last started
  let las = false; // input locked while the winning wave plays
  let celler = []; // the 81 cell buttons of the current board
  let tegnet = []; // what each cell shows now (to skip unchanged ones)
  let navnet = []; // what each cell is called now (its aria-label)

  // ---------- Days ----------

  const ukedag = (nr) => (((nr + 4) % 7) + 7) % 7; // day 0 (1 Jan 1970) was a Thursday
  function dagInfo(dag) {
    const [, m, d] = dag.tekst.split("-").map(Number);
    const u = ukedag(dag.nr);
    return { tekst: dag.tekst, nr: dag.nr, niva: M.dagligNiva(dag.nr), ukedag: UKEDAG[u], dato: `${d}. ${MANED[m - 1]}` };
  }
  const idag = () => dagInfo(R.dag());

  // ---------- Countdown to the next daily sudoku (midnight in Norway) ----------

  function sekunderTilNy() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
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
  const nedtellingHtml = () => `<p class="tk-nedtelling">Ny sudoku om <b>${klokkeTekst(sekunderTilNy())}</b></p>`;
  // Ticks every second while a countdown is on the screen; at midnight the screen is drawn again.
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".tk-nedtelling b");
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
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.pause || klokkeFra != null || document.hidden || S.skjerm !== "spill") return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && S.spill;
    if (sp && klokkeFra != null) sp.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }
  function visTid(ms) {
    const s = Math.floor(ms / 1000);
    const t = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    return (t ? t + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s % 60).padStart(2, "0");
  }
  // ---------- Two puzzles at once ----------
  // Today's sudoku and a free board can both be under way. S.spill is the one on the screen; the
  // other one waits in S.annet (never two of the same kind).

  const erDag = (sp) => !!(sp && sp.dagens);
  const iGang = (sp) => !!(sp && !sp.ferdig);
  const finn = (S, dag) => (S.spill && erDag(S.spill) === dag ? S.spill : S.annet && erDag(S.annet) === dag ? S.annet : null);
  // Worth keeping while it waits: a puzzle under way, and the solved daily (its result can be shown again).
  const verdt = (sp) => !!sp && (!sp.ferdig || erDag(sp));
  // Puts the daily (dag = true) or the free board on the screen. False when there is none.
  function hent(S, dag) {
    if (S.spill && erDag(S.spill) === dag) return true;
    if (!S.annet || erDag(S.annet) !== dag) return false;
    const t = S.spill;
    S.spill = S.annet;
    S.annet = verdt(t) ? t : null;
    return true;
  }
  // Makes room for a new puzzle of one kind; a puzzle of the other kind is kept.
  function ryddFor(S, dag) {
    const andre = finn(S, !dag);
    S.annet = verdt(andre) ? andre : null;
    S.spill = null;
  }
  // A daily sudoku from another day: unfinished, it lives on as an ordinary board (when no other
  // free board is under way – else it waits until today's sudoku is started); solved, it is gone.
  function ryddGammel(S) {
    const sp = finn(S, true);
    if (!sp || sp.dagens === R.dag().tekst) return;
    const fri = finn(S, false);
    if (!sp.ferdig && iGang(fri)) return;
    if (!sp.ferdig) {
      sp.dagens = null;
      sp.dagNr = null;
      S.spill = sp;
    } else S.spill = fri;
    S.annet = null;
  }
  // Today's sudoku: the board (new, or the one under way) – or its result when it is solved.
  // Returns the screen to show.
  function apneDagens(S) {
    const d = R.dag();
    const sp = finn(S, true);
    if (sp && sp.dagens === d.tekst) {
      hent(S, true);
      return sp.ferdig ? "slutt" : "spill";
    }
    if (S.daglig.tider[d.tekst]) return "hjem";
    nyttSpill(S, "dagens");
    return "spill";
  }
  // The front page shows how far today's sudoku has come (rusj/DAGLIG.md).
  function meldIGang(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.dagens !== R.dag().tekst || S.daglig.tider[sp.dagens] || typeof R.dagligIGang !== "function") return;
    R.dagligIGang({ tekst: visTid(sp.tid) });
  }

  // ---------- A new puzzle ----------

  // valg: a level, or "dagens" for today's sudoku (made by the engine's frozen daily rules).
  function nyttSpill(S, valg) {
    let niva = NIVA[valg] ? valg : "lett";
    let dagens = null;
    let dagNr = null;
    const t0 = performance.now();
    let o;
    if (valg === "dagens") {
      const d = idag();
      o = M.lagDaglig(d.tekst, d.nr);
      niva = o.niva;
      dagens = d.tekst;
      dagNr = d.nr;
    } else {
      o = M.lag(niva, R.nyttFro());
      S.oppsett.niva = niva;
    }
    ryddFor(S, valg === "dagens");
    S.spill = {
      niva,
      dagens,
      dagNr,
      gitt: Array.from(o.oppgave).join(""),
      losning: Array.from(o.losning).join(""),
      v: Array.from(o.oppgave),
      n: new Array(81).fill(0),
      hint: [],
      angre: [],
      valgt: -1,
      uthev: 0,
      notat: false,
      tid: 0,
      hintIgjen: HINT,
      pause: false,
      ferdig: false,
      resultat: null,
    };
    klokkeFra = null;
    las = false;
    R.statistikk("start", { niva, dagens: !!dagens, ms: Math.round(performance.now() - t0) });
  }

  const losning = (sp) => sp.losning.split("").map(Number);
  const erGitt = (sp, i) => sp.gitt.charCodeAt(i) !== 48;
  const laast = (sp, i) => erGitt(sp, i) || sp.hint.includes(i);
  const tomme = (sp) => sp.v.filter((x) => !x).length;

  // Cells whose number also stands elsewhere in their row, column or box.
  function konflikter(v) {
    const ut = new Uint8Array(81);
    for (const e of ENHETER) {
      const sett = new Array(10).fill(-1);
      for (const i of e) {
        const d = v[i];
        if (!d) continue;
        if (sett[d] >= 0) {
          ut[i] = 1;
          ut[sett[d]] = 1;
        } else sett[d] = i;
      }
    }
    return ut;
  }
  const antallAv = (v, d) => v.reduce((s, x) => s + (x === d ? 1 : 0), 0);

  // ---------- Markup ----------

  const NOTE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  function innhold(sp, i, uthev) {
    const x = sp.v[i];
    if (x) return `<span class="tk-v">${x}</span>`;
    const n = sp.n[i];
    if (!n) return "";
    return `<span class="tk-not">${NOTE.map((d) => (n & (1 << d) ? `<i${d === uthev ? ' class="u"' : ""}>${d}</i>` : "<i></i>")).join("")}</span>`;
  }
  // konflikt: the number also stands elsewhere in the row, column or box (said, not only shown).
  function etikett(sp, i, konflikt) {
    const x = sp.v[i];
    const sted = `Rad ${RAD[i] + 1}, kolonne ${KOL[i] + 1}`;
    if (x) return `${sted}: ${x}${erGitt(sp, i) ? " (gitt)" : sp.hint.includes(i) ? " (hint)" : ""}${konflikt ? ", konflikt" : ""}`;
    const n = NOTE.filter((d) => sp.n[i] & (1 << d));
    return `${sted}: tom${n.length ? `, notater ${n.join(" ")}` : ""}`;
  }

  function brettHtml(sp) {
    const konf = konflikter(sp.v);
    let html = "";
    for (let b = 0; b < 9; b++) {
      html += `<div class="tk-boks">`;
      for (const i of ENHETER[18 + b]) html += `<button class="tk-celle" data-i="${i}" tabindex="-1" aria-label="${esc(etikett(sp, i, konf[i]))}">${innhold(sp, i, 0)}</button>`;
      html += `</div>`;
    }
    return html;
  }

  const IKON = {
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    visk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H9.5L4.3 14.8a1.8 1.8 0 0 1 0-2.6l8.9-8.9a1.8 1.8 0 0 1 2.6 0l4.2 4.2a1.8 1.8 0 0 1 0 2.6L12 18.2"/><path d="m8.5 9.5 6 6"/></svg>',
    notat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m14.5 5.5 3 3"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>',
  };

  function hudHtml(S) {
    const sp = S.spill;
    const rek = S.rekorder[sp.niva];
    const dag = sp.dagens ? dagInfo({ tekst: sp.dagens, nr: sp.dagNr }) : null;
    return `<div class="tk-hud">
      <span class="tk-stat"><small>${dag ? "Dagens" : "Nivå"}</small><b>${esc(NIVA[sp.niva].navn)}</b></span>
      <button class="tk-klokke" data-h="pause" aria-label="${sp.pause ? "Fortsett" : "Pause"}"><span class="tk-pauseikon">${IKON.pause}</span><span class="tk-klokketekst"><small>Tid</small><b id="tk-tid">${visTid(tidMs(sp))}</b></span></button>
      <span class="tk-stat tk-rekordchip"><small>Rekord</small><b><span class="tk-pokal" aria-hidden="true">🏆 </span>${rek ? visTid(rek.tid * 1000) : "–"}</b></span>
    </div>`;
  }

  function kontrollHtml(sp) {
    const v = sp.v;
    return `<div class="tk-verktoy">
        <button class="tk-verk" data-h="angre" id="tk-angre" aria-label="Angre"${sp.angre.length ? "" : " disabled"}>${IKON.angre}<span>Angre</span></button>
        <button class="tk-verk" data-h="visk" id="tk-visk" aria-label="Visk ut">${IKON.visk}<span>Visk ut</span></button>
        <button class="tk-verk tk-notatknapp" data-h="notater" id="tk-notater" aria-label="Notater" aria-pressed="${sp.notat}">${IKON.notat}<span>Notater</span><i class="tk-merke" aria-hidden="true">PÅ</i></button>
        <button class="tk-verk" data-h="hint" id="tk-hint"${sp.hintIgjen > 0 ? "" : " disabled"} aria-label="Hint, ${sp.hintIgjen} igjen">${IKON.hint}<span>Hint</span><i class="tk-merke" aria-hidden="true">${sp.hintIgjen}</i></button>
      </div>
      <div class="tk-tall${sp.notat ? " notat" : ""}" role="group" aria-label="Tall">
        ${NOTE.map((d) => {
          const igjen = 9 - antallAv(v, d);
          return `<button class="tk-tast${igjen <= 0 ? " ferdig" : ""}" data-h="tall" data-v="${d}" data-stille aria-label="${d}${igjen > 0 ? `, ${igjen} igjen` : ", alle er satt"}"><b>${d}</b><small aria-hidden="true">${igjen > 0 ? igjen : "✓"}</small></button>`;
        }).join("")}
      </div>`;
  }

  // ---------- Updating the board in place ----------

  function oppdater(S) {
    const sp = S.spill;
    if (!sp || !celler.length) return;
    const v = sp.v;
    const valgt = sp.valgt;
    const uthev = (valgt >= 0 && v[valgt]) || sp.uthev || 0;
    const konf = konflikter(v);
    for (let i = 0; i < 81; i++) {
      const el = celler[i];
      if (!el) continue;
      let k = "tk-celle";
      if (erGitt(sp, i)) k += " gitt";
      else if (sp.hint.includes(i)) k += " hintet";
      else if (v[i]) k += " bruker";
      if (i === valgt) k += " valgt";
      else if (valgt >= 0 && (RAD[i] === RAD[valgt] || KOL[i] === KOL[valgt] || BOKS[i] === BOKS[valgt])) k += " linje";
      if (uthev && v[i] === uthev) k += " samme";
      if (konf[i]) k += " konflikt";
      const blink = el.classList.contains("blink") ? " blink" : "";
      if (el.className !== k + blink) el.className = k + blink;
      const inn = innhold(sp, i, uthev);
      if (tegnet[i] !== inn) {
        el.innerHTML = inn;
        tegnet[i] = inn;
      }
      // The label follows the content and the conflict (which changes when another cell does).
      const navn = etikett(sp, i, konf[i]);
      if (navnet[i] !== navn) {
        el.setAttribute("aria-label", navn);
        navnet[i] = navn;
      }
      el.tabIndex = i === (valgt >= 0 ? valgt : 0) ? 0 : -1;
    }
    // Number pad: how many of each are left; tools: undo and hints.
    R.$$(".tk-tast").forEach((t) => {
      const d = Number(t.dataset.v);
      const igjen = 9 - antallAv(v, d);
      t.classList.toggle("ferdig", igjen <= 0);
      t.classList.toggle("aktiv", d === uthev);
      const s = t.querySelector("small");
      const tekst = igjen > 0 ? String(igjen) : "✓";
      if (s.textContent !== tekst) s.textContent = tekst;
      t.setAttribute("aria-label", `${d}${igjen > 0 ? `, ${igjen} igjen` : ", alle er satt"}`);
    });
    const angre = R.$("#tk-angre");
    if (angre) angre.disabled = !sp.angre.length;
    const hint = R.$("#tk-hint");
    if (hint) {
      hint.disabled = sp.hintIgjen <= 0;
      hint.setAttribute("aria-label", `Hint, ${sp.hintIgjen} igjen`);
      hint.querySelector(".tk-merke").textContent = sp.hintIgjen;
    }
    const not = R.$("#tk-notater");
    if (not) {
      not.setAttribute("aria-pressed", String(sp.notat));
    }
    const tall = R.$(".tk-tall");
    if (tall) tall.classList.toggle("notat", sp.notat);
    const spillEl = R.$(".tk-spill");
    if (spillEl) spillEl.classList.toggle("pauset", !!sp.pause);
    const pause = R.$(".tk-pauseboks");
    if (pause) pause.hidden = !sp.pause;
    const klokke = R.$(".tk-klokke");
    if (klokke) klokke.setAttribute("aria-label", sp.pause ? "Fortsett" : "Pause");
  }

  // Board size: the biggest square that fits (whole pixels per cell, so the lines stay crisp),
  // with room for the board's thick edge underneath.
  function tilpass() {
    const flate = R.$(".tk-flate");
    const brett = R.$(".tk-brett");
    if (!flate || !brett) return;
    const plass = Math.min(flate.clientWidth - 6, flate.clientHeight - 16);
    const c = Math.max(24, Math.min(58, Math.floor((plass - 20) / 9)));
    brett.style.setProperty("--c", c + "px");
  }

  function flash(indekser, ms) {
    if (R.rolig()) return;
    indekser.forEach((i, n) => {
      const el = celler[i];
      if (!el) return;
      setTimeout(() => {
        el.classList.remove("blink");
        void el.offsetWidth;
        el.classList.add("blink");
        setTimeout(() => el.classList.remove("blink"), 650);
      }, n * (ms || 32));
    });
  }

  // fokus: move the keyboard focus along (arrow keys); a tap only selects.
  function velg(S, i, fokus) {
    const sp = S.spill;
    if (!sp || i < 0 || i > 80) return;
    fjernHintmerker();
    sp.valgt = i;
    sp.uthev = 0;
    oppdater(S);
    R.lagre();
    if (fokus && celler[i]) {
      try {
        celler[i].focus({ preventScroll: true });
      } catch (e) {
        /* ignore */
      }
    }
  }

  // Short messages (hints, tips) in a bubble over the score bar, never over the board.
  let meldingId = null;
  let gjemId = null;
  function melding(tekst) {
    const m = R.$(".tk-melding");
    R.si(tekst);
    if (!m) return R.toast(tekst, { topp: true });
    m.textContent = tekst;
    // A real button while it shows: Tab reaches it, and Enter or a tap puts it away.
    clearTimeout(gjemId);
    m.hidden = false;
    m.tabIndex = 0;
    m.removeAttribute("aria-hidden");
    m.classList.remove("vis", "under");
    // Under the info row when there is room above the board; on short screens over the info
    // row instead – never over the board.
    const hud = R.$(".tk-hud");
    const brett = R.$(".tk-brett");
    if (hud && brett && brett.getBoundingClientRect().top - hud.getBoundingClientRect().bottom >= m.offsetHeight + 12) m.classList.add("under");
    void m.offsetWidth;
    m.classList.add("vis");
    clearTimeout(meldingId);
    meldingId = setTimeout(skjulMelding, Math.max(2600, tekst.length * 55));
  }
  function skjulMelding() {
    clearTimeout(meldingId);
    const m = R.$(".tk-melding");
    if (!m) return;
    m.classList.remove("vis");
    m.tabIndex = -1;
    m.setAttribute("aria-hidden", "true");
    // Out of the page once it has faded: an empty button is never left behind.
    clearTimeout(gjemId);
    gjemId = setTimeout(() => {
      if (!m.classList.contains("vis")) m.hidden = true;
    }, 260);
    // Focus never stays on a bubble that is gone: back to the selected cell.
    if (document.activeElement === m) {
      const sp = R.S && R.S.spill;
      const el = sp && celler[sp.valgt >= 0 ? sp.valgt : 0];
      if (el) el.focus({ preventScroll: true });
      else m.blur();
    }
  }

  // A hint shows what it talks about: a frame around the whole box, row or column («i denne
  // boksen …») and a pulse on the cell that got its number.
  let hintId = null;
  function fjernHintmerker() {
    clearTimeout(hintId);
    R.$$(".tk-hintramme").forEach((el) => el.remove());
    R.$$(".tk-celle.hintmal").forEach((el) => el.classList.remove("hintmal"));
  }
  function visHintmerker(enhet, i) {
    fjernHintmerker();
    const brett = R.$(".tk-brett");
    if (!brett || !celler[i]) return;
    celler[i].classList.add("hintmal");
    if (enhet != null) {
      const b = brett.getBoundingClientRect();
      const a = celler[ENHETER[enhet][0]].getBoundingClientRect();
      const z = celler[ENHETER[enhet][8]].getBoundingClientRect();
      const ramme = document.createElement("div");
      ramme.className = "tk-hintramme";
      ramme.style.left = a.left - b.left - 2 + "px";
      ramme.style.top = a.top - b.top - 2 + "px";
      ramme.style.width = z.right - a.left + 4 + "px";
      ramme.style.height = z.bottom - a.top + 4 + "px";
      brett.appendChild(ramme);
    }
    hintId = setTimeout(fjernHintmerker, 4200);
  }

  // ---------- Moves ----------

  // A change of several cells as one undo step: [[i, old value, old notes], …]
  function endre(S, endringer) {
    const sp = S.spill;
    if (!endringer.length) return;
    sp.angre.push(endringer);
    if (sp.angre.length > MAKS_ANGRE) sp.angre.shift();
  }

  const sted = (i) => `Rad ${RAD[i] + 1}, kolonne ${KOL[i] + 1}`;

  function settTall(S, d) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.pause || las) return;
    const i = sp.valgt;
    if (i < 0 || laast(sp, i)) {
      // No cell to write in: show where this number already stands.
      sp.uthev = sp.uthev === d ? 0 : d;
      if (i >= 0 && laast(sp, i)) sp.valgt = -1;
      oppdater(S);
      R.lyd.klikk();
      return;
    }
    if (sp.notat && !sp.v[i]) {
      const bit = 1 << d;
      endre(S, [[i, 0, sp.n[i]]]);
      sp.n[i] ^= bit;
      R.si(`Notat ${d} ${sp.n[i] & bit ? "lagt til" : "fjernet"}.`);
      R.lyd.tone(sp.n[i] & bit ? 1180 : 760, 0, 0.05, "triangle", 0.07);
      R.vibrer(5);
      oppdater(S);
      R.lagre();
      return;
    }
    if (sp.notat && sp.v[i]) {
      melding("Visk ut tallet først for å skrive notater");
      return;
    }
    const endringer = [[i, sp.v[i], sp.n[i]]];
    if (sp.v[i] === d) {
      // The same number again takes it away.
      sp.v[i] = 0;
      endre(S, endringer);
      R.lyd.tone(520, 0, 0.06, "triangle", 0.08, 380);
      R.si(`${sted(i)} er tom.`);
      oppdater(S);
      R.lagre();
      return;
    }
    sp.v[i] = d;
    sp.n[i] = 0;
    // Notes of this number in the row, column and box are no longer possible.
    const bit = 1 << d;
    for (const j of NABOER[i])
      if (sp.n[j] & bit) {
        endringer.push([j, sp.v[j], sp.n[j]]);
        sp.n[j] &= ~bit;
      }
    endre(S, endringer);
    etterTall(S, i, d);
  }

  // After a number is placed: conflicts, finished rows/columns/boxes, the win.
  function etterTall(S, i, d, stille) {
    const sp = S.spill;
    const konf = konflikter(sp.v);
    oppdater(S);
    if (konf[i]) {
      if (!stille) {
        R.lyd.tone(240, 0, 0.16, "triangle", 0.11, 170);
        R.vibrer([12, 40, 12]);
      }
      // Said too, not only shown in red: where the same number already stands.
      const hvor = [
        [RAD[i], "raden"],
        [9 + KOL[i], "kolonnen"],
        [18 + BOKS[i], "boksen"],
      ]
        .filter(([u]) => ENHETER[u].some((j) => j !== i && sp.v[j] === d))
        .map(([, navn]) => navn);
      R.si(`${d} i rad ${RAD[i] + 1}, kolonne ${KOL[i] + 1}. Står allerede i ${hvor.join(" og ")}.`);
      if (!tomme(sp)) melding("Brettet er fullt, men noe stemmer ikke. Se etter tallene som er merket med utropstegn.");
      const el = celler[i];
      if (el && !R.rolig()) {
        el.classList.remove("rist");
        void el.offsetWidth;
        el.classList.add("rist");
        setTimeout(() => el.classList.remove("rist"), 420);
      }
      R.lagre();
      return;
    }
    if (sp.v.every((x, k) => x === Number(sp.losning[k]))) return vinn(S, i);
    if (!stille) R.si(`${d} i rad ${RAD[i] + 1}, kolonne ${KOL[i] + 1}.`);
    if (!tomme(sp)) melding("Brettet er fullt, men noe stemmer ikke. Se etter tallene som er merket med utropstegn.");
    // A row, column or box that is now complete (and without conflicts) gets a little wave.
    const ferdige = [];
    for (const u of [RAD[i], 9 + KOL[i], 18 + BOKS[i]]) {
      const e = ENHETER[u];
      if (e.every((j) => sp.v[j] && !konf[j])) ferdige.push(e.slice().sort((a, b) => avstand(a, i) - avstand(b, i)));
    }
    const allNi = antallAv(sp.v, d) === 9 && !sp.v.some((x, k) => x === d && konf[k]);
    if (ferdige.length) {
      flash(Array.from(new Set(ferdige.flat())));
      if (!stille) {
        R.lyd.tone(880, 0, 0.12, "triangle", 0.12);
        R.lyd.tone(1320, 0.08, 0.18, "triangle", 0.1);
      }
      R.vibrer(15);
    } else if (!stille) {
      R.lyd.tone(620, 0, 0.05, "triangle", 0.1, 760);
      R.vibrer(6);
    }
    if (allNi) {
      const tast = R.$(`.tk-tast[data-v="${d}"]`);
      if (tast && !R.rolig()) {
        tast.classList.remove("pop");
        void tast.offsetWidth;
        tast.classList.add("pop");
      }
    }
    R.lagre();
  }
  const avstand = (a, b) => Math.abs(RAD[a] - RAD[b]) + Math.abs(KOL[a] - KOL[b]);

  function visk(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.pause || las) return;
    const i = sp.valgt;
    if (i < 0) return melding("Velg en rute først");
    if (laast(sp, i)) return melding(erGitt(sp, i) ? "Tallene fra start kan ikke viskes ut" : "Tall fra hint kan ikke viskes ut");
    if (!sp.v[i] && !sp.n[i]) return;
    endre(S, [[i, sp.v[i], sp.n[i]]]);
    if (sp.v[i]) sp.v[i] = 0;
    else sp.n[i] = 0;
    R.si(`${sted(i)} er tom.`);
    R.lyd.tone(420, 0, 0.08, "triangle", 0.08, 300);
    oppdater(S);
    R.lagre();
  }

  function angre(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.pause || las || !sp.angre.length) return;
    const endringer = sp.angre.pop();
    for (let k = endringer.length - 1; k >= 0; k--) {
      const [i, v, n] = endringer[k];
      sp.v[i] = v;
      sp.n[i] = n;
    }
    sp.valgt = endringer[0][0];
    sp.uthev = 0;
    R.si(`Angret. ${sted(sp.valgt)}: ${sp.v[sp.valgt] || "tom"}.`);
    R.lyd.tone(500, 0, 0.08, "triangle", 0.08, 420);
    oppdater(S);
    R.lagre();
  }

  const HINTTEKST = {
    boks: (d) => `I denne boksen er det bare én plass til ${d}.`,
    rad: (d) => `I denne raden er det bare én plass til ${d}.`,
    kolonne: (d) => `I denne kolonnen er det bare én plass til ${d}.`,
    naken: (d) => `Bare ${d} passer her. Alle andre tall står allerede i raden, kolonnen eller boksen.`,
    vanskelig: (d) => `En vrien en: Her skal det stå ${d}.`,
  };

  function brukHint(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.pause || las) return;
    if (sp.hintIgjen <= 0) return melding("Du har brukt alle hintene");
    const h = M.hint(sp.v, losning(sp), sp.valgt);
    if (!h) return;
    sp.hintIgjen -= 1;
    if (h.type === "feil") {
      for (const i of h.celler) {
        sp.v[i] = 0;
        sp.n[i] = 0;
      }
      sp.angre = sp.angre.filter((steg) => !steg.some(([i]) => h.celler.includes(i)));
      sp.valgt = h.celler[0];
      sp.uthev = 0;
      oppdater(S);
      flash(h.celler, 60);
      R.lyd.tone(330, 0, 0.14, "triangle", 0.1, 260);
      melding(h.celler.length === 1 ? "Ett tall var feil. Det er visket ut." : `${h.celler.length} tall var feil. De er visket ut.`);
      R.lagre();
      return;
    }
    const { i, d, grunn } = h;
    sp.v[i] = d;
    sp.n[i] = 0;
    sp.hint.push(i);
    const bit = 1 << d;
    for (const j of NABOER[i]) sp.n[j] &= ~bit;
    // Earlier undo steps for this cell would now fight the hint: drop them.
    sp.angre = sp.angre.filter((steg) => !steg.some(([k]) => k === i));
    sp.valgt = i;
    sp.uthev = 0;
    R.lyd.tone(990, 0, 0.12, "sine", 0.12);
    R.lyd.tone(1480, 0.1, 0.22, "sine", 0.1);
    melding(HINTTEKST[grunn](d));
    const enhet = grunn === "boks" ? 18 + BOKS[i] : grunn === "rad" ? RAD[i] : grunn === "kolonne" ? 9 + KOL[i] : null;
    etterTall(S, i, d, true);
    if (!sp.ferdig) visHintmerker(enhet, i);
  }

  function settPause(S, pa) {
    const sp = S.spill;
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
    if (!pa) {
      const b = R.$(".tk-brett");
      if (b && !R.rolig()) {
        b.classList.remove("tilbake");
        void b.offsetWidth;
        b.classList.add("tilbake");
      }
    }
  }

  // Runs four times a second on the play screen. A sheet over the board (the rules, a question)
  // stops the clock while it is open.
  let arkPause = false;
  function tikk() {
    const S = R.S;
    if (!S || !S.spill) return;
    if (R.arkApent()) {
      if (klokkeFra != null) {
        stoppKlokke(S);
        arkPause = true;
      }
    } else if (arkPause) {
      arkPause = false;
      startKlokke(S);
    }
    const el = R.$("#tk-tid");
    if (el) el.textContent = visTid(tidMs(S.spill));
  }

  // ---------- The win ----------

  function vinn(S, sist) {
    const sp = S.spill;
    stoppKlokke(S);
    sp.ferdig = true;
    sp.valgt = -1;
    sp.uthev = 0;
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const gml = S.rekorder[sp.niva] || null;
    // A daily sudoku solved a second time knows the answers already: it never sets a record.
    const igjen = !!(sp.dagens && S.daglig.tider[sp.dagens]);
    const nyRekord = !igjen && !!gml && sek < gml.tid;
    if (!igjen) S.rekorder[sp.niva] = { tid: gml ? Math.min(gml.tid, sek) : sek, antall: (gml ? gml.antall : 0) + 1 };
    const res = { sek, hint: HINT - sp.hintIgjen, gml: gml ? gml.tid : null, nyRekord, forste: !gml && !igjen };
    if (sp.dagens) {
      const d = S.daglig;
      const forrige = d.tider[sp.dagens];
      res.dagForrige = forrige || null;
      if (!forrige) {
        d.tider[sp.dagens] = sek;
        if (d.sistNr === sp.dagNr - 1) d.rekke += 1;
        else if (d.sistNr !== sp.dagNr) d.rekke = 1;
        d.sistNr = Math.max(d.sistNr || 0, sp.dagNr);
        d.beste = Math.max(d.beste || 0, d.rekke);
        // Keep the last 400 days.
        const dager = Object.keys(d.tider).sort();
        for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete d.tider[k];
        // The front page shows «✓ i dag» and the streak – only for today's puzzle (one started
        // before midnight and solved after it does not count for the new day).
        if (sp.dagens === R.dag().tekst) R.dagligFerdig({ vunnet: true, rekke: d.rekke, res: visTid(sek * 1000) });
      }
      res.rekke = d.rekke;
    }
    sp.resultat = res;
    R.statistikk("ferdig", { niva: sp.niva, dagens: !!sp.dagens, sek, hint: res.hint });
    R.lagre();
    las = true;
    oppdater(S);
    R.lyd.riktig();
    R.vibrer([30, 50, 30, 50, 120]);
    // A wave from the last number across the whole board, then the result.
    const fortsatt = R.vakt();
    const rekke = Array.from({ length: 81 }, (_, i) => i).sort((a, b) => avstand(a, sist) - avstand(b, sist));
    if (!R.rolig()) {
      const brett = R.$(".tk-brett");
      if (brett) brett.classList.add("vant");
      rekke.forEach((i) => {
        const el = celler[i];
        if (el) el.style.setProperty("--f", avstand(i, sist) * 55 + "ms");
      });
    }
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 700 : 1700,
    );
  }

  // ---------- Input on the board ----------

  function bindBrett(S, rot) {
    celler = [];
    tegnet = [];
    navnet = [];
    R.$$(".tk-celle", rot).forEach((el) => {
      const i = Number(el.dataset.i);
      celler[i] = el;
      tegnet[i] = el.innerHTML;
      navnet[i] = el.getAttribute("aria-label");
    });
    const brett = R.$(".tk-brett", rot);
    if (!brett) return;
    // Select on touch-down: instant, also when the finger slides a little.
    const ned = (e) => {
      const el = e.target.closest(".tk-celle");
      if (!el || (e.pointerType === "mouse" && e.button !== 0)) return;
      const sp = R.S.spill;
      if (!sp || sp.ferdig || sp.pause || las) return;
      e.preventDefault();
      R.lyd.lasOpp();
      velg(R.S, Number(el.dataset.i));
      R.lyd.tone(1040, 0, 0.03, "sine", 0.05);
    };
    // Keyboard (Enter/Space on a focused cell) still selects it.
    const klikk = (e) => {
      const el = e.target.closest(".tk-celle");
      if (el && e.detail === 0) velg(R.S, Number(el.dataset.i), true);
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    // Tab into the board: the cell that gets the focus is selected, so the focus is always seen.
    const fokusInn = (e) => {
      const el = e.target.closest(".tk-celle");
      const sp = R.S.spill;
      if (!el || !sp || sp.ferdig || sp.pause || las) return;
      const i = Number(el.dataset.i);
      if (sp.valgt !== i) velg(R.S, i);
    };
    brett.addEventListener("focusin", fokusInn);
    brett.addEventListener("pointerdown", ned);
    brett.addEventListener("click", klikk);
    brett.addEventListener("contextmenu", nei);
    const fast = R.$(".tk-spill", rot);
    const flere = (e) => {
      if (e.touches && e.touches.length > 1) nei(e);
    };
    if (fast) {
      fast.addEventListener("touchmove", flere, { passive: false });
      fast.addEventListener("gesturestart", nei);
    }
    R.vedForlat(() => {
      brett.removeEventListener("focusin", fokusInn);
      brett.removeEventListener("pointerdown", ned);
      brett.removeEventListener("click", klikk);
      brett.removeEventListener("contextmenu", nei);
      if (fast) {
        fast.removeEventListener("touchmove", flere, { passive: false });
        fast.removeEventListener("gesturestart", nei);
      }
    });
  }

  // Keyboard: arrows, 1–9, Backspace/Delete/0, N (notes), Ctrl/Cmd+Z, P (pause).
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || S.spill.ferdig || R.arkApent()) return;
    const el = e.target;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    const sp = S.spill;
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
    const PIL = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
    if (/^[1-9]$/.test(k)) {
      e.preventDefault();
      settTall(S, Number(k));
    } else if (k === "Backspace" || k === "Delete" || k === "0") {
      e.preventDefault();
      visk(S);
    } else if (PIL[k]) {
      e.preventDefault();
      let i = sp.valgt < 0 ? 40 : sp.valgt;
      if (k === "ArrowLeft") i = RAD[i] * 9 + ((KOL[i] + 8) % 9);
      else if (k === "ArrowRight") i = RAD[i] * 9 + ((KOL[i] + 1) % 9);
      else if (k === "ArrowUp") i = ((RAD[i] + 8) % 9) * 9 + KOL[i];
      else i = ((RAD[i] + 1) % 9) * 9 + KOL[i];
      velg(S, i, true);
    } else if (k === "n" || k === "N") {
      e.preventDefault();
      H.notater(null, e, S);
    } else if (k === "p" || k === "P") {
      settPause(S, true);
    }
  });

  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass();
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill) return;
    if (document.hidden) {
      stoppKlokke(S);
      meldIGang(S);
      R.lagre();
    } else startKlokke(S);
  });
  window.addEventListener("pagehide", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill) return;
    stoppKlokke(S);
    R.lagre();
    startKlokke(S);
  });

  // The play screen fills the phone exactly: no page scroll, rubber band or zoom.
  const fastSide = (pa) => document.documentElement.classList.toggle("tk-fast", !!pa);

  // ---------- Small pieces of the screens ----------

  // A little calendar page with today's date.
  const kalender = (d) => `<span class="tk-kal" aria-hidden="true"><small>${esc(MANED[Number(d.tekst.slice(5, 7)) - 1].slice(0, 3))}</small><b>${Number(d.tekst.slice(8, 10))}</b></span>`;

  function nivaIkon(n) {
    return `<span class="tk-styrke" aria-hidden="true">${[1, 2, 3, 4].map((k) => `<i class="${k <= n ? "pa" : ""}"></i>`).join("")}</span>`;
  }

  function dagensStatus(S) {
    const d = idag();
    const tid = S.daglig.tider[d.tekst];
    return { d, tid };
  }

  function rekke(S) {
    const d = S.daglig;
    const i = idag().nr;
    // A streak lives on until a whole day is skipped.
    return d.sistNr >= i - 1 ? d.rekke || 0 : 0;
  }

  function miniBrett(sp) {
    let html = "";
    for (let b = 0; b < 9; b++) {
      html += "<span>";
      for (const i of ENHETER[18 + b]) html += `<i class="${erGitt(sp, i) ? "g" : sp.hint.includes(i) ? "h" : ""}">${sp.v[i] || ""}</i>`;
      html += "</span>";
    }
    return `<div class="tk-mini" aria-hidden="true">${html}</div>`;
  }

  // ---------- Start ----------

  R.start({
    id: "tallknuseren",
    versjon: 1,
    pagar: (S) => iGang(S.spill) || iGang(S.annet),

    tilstand: () => ({
      oppsett: { niva: "lett" },
      rekorder: {},
      daglig: { tider: {}, rekke: 0, beste: 0, sistNr: 0 },
      spill: null,
      annet: null,
    }),

    lastet(S) {
      // The last level played (older saves kept the choice as «valg»).
      const forrigeNiva = S.oppsett && (S.oppsett.niva || S.oppsett.valg);
      S.oppsett = { niva: NIVA[forrigeNiva] ? forrigeNiva : "lett" };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      for (const k of Object.keys(S.rekorder)) {
        const r = S.rekorder[k];
        if (!NIVA[k] || !r || !(r.tid > 0)) delete S.rekorder[k];
      }
      const d = S.daglig;
      if (!d || typeof d !== "object" || typeof d.tider !== "object" || !d.tider) S.daglig = { tider: {}, rekke: 0, beste: 0, sistNr: 0 };
      // A saved puzzle must be a whole board that agrees with its own clues.
      const gyldig = (sp) => {
        if (!sp || typeof sp !== "object") return false;
        const ok =
          NIVA[sp.niva] &&
          typeof sp.gitt === "string" &&
          /^[0-9]{81}$/.test(sp.gitt) &&
          typeof sp.losning === "string" &&
          /^[1-9]{81}$/.test(sp.losning) &&
          Array.isArray(sp.v) &&
          sp.v.length === 81 &&
          sp.v.every((x) => Number.isInteger(x) && x >= 0 && x <= 9) &&
          Array.isArray(sp.n) &&
          sp.n.length === 81 &&
          sp.v.every((x, i) => sp.gitt[i] === "0" || x === Number(sp.gitt[i]));
        if (!ok) return false;
        if (!Array.isArray(sp.hint)) sp.hint = [];
        if (!Array.isArray(sp.angre)) sp.angre = [];
        // A daily puzzle is named by its date; anything else is an ordinary board.
        if (typeof sp.dagens !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sp.dagens) || !Number.isInteger(sp.dagNr)) {
          sp.dagens = null;
          sp.dagNr = null;
        }
        sp.n = sp.n.map((x) => (Number.isInteger(x) ? x & 0x3fe : 0));
        sp.valgt = Number.isInteger(sp.valgt) && sp.valgt >= -1 && sp.valgt < 81 ? sp.valgt : -1;
        sp.hintIgjen = R.klamp(Number(sp.hintIgjen) || 0, 0, HINT);
        sp.tid = Number(sp.tid) || 0;
        return true;
      };
      if (!gyldig(S.spill)) S.spill = null;
      if (!gyldig(S.annet) || (S.spill && erDag(S.spill) === erDag(S.annet))) S.annet = null;
      if (!S.spill && S.annet) {
        S.spill = S.annet;
        S.annet = null;
      }
      // A sudoku on the result screen (shown again as the home screen) is not «another day's» yet.
      if (S.skjerm !== "spill") ryddGammel(S);
      if (S.skjerm === "slutt" && (!S.spill || !S.spill.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!S.spill || S.spill.ferdig)) S.skjerm = S.spill ? "slutt" : "hjem";
      // The front page reads the daily from the kit's own key: say it again on every load, so a
      // solve that crossed midnight or an older version of the page never leaves it behind.
      const idag = R.dag();
      const tid = S.daglig.tider[idag.tekst];
      if (tid && S.daglig.sistNr === idag.nr) R.dagligFerdig({ vunnet: true, rekke: S.daglig.rekke, res: visTid(tid * 1000) });
    },

    // rusj.no/tallknuseren/#dagens (the front page's «I dag») opens today's sudoku.
    vedHash: (S, hash) => (hash === "dagens" ? apneDagens(S) : null),

    regler: {
      intro: "Fyll brettet med tall fra 1 til 9. Hvert tall skal stå nøyaktig én gang i hver rad, hver kolonne og hver boks på 3 × 3.",
      steg: [
        ["Velg en rute", "Trykk på en tom rute, og trykk på tallet som skal stå der."],
        ["Én av hver", "Samme tall kan ikke stå to ganger i en rad, en kolonne eller en boks. Står samme tall to ganger, blir begge røde og merket med et utropstegn."],
        ["Bruk notater", "Usikker? Slå på Notater og skriv små tall i ruta. De rydder seg selv når du setter et tall."],
      ],
      tips: [
        "Ta ett tall om gangen: Hvor kan 1-tallet stå i hver boks? Ofte er det bare én plass.",
        "De små tallene på tastene viser hvor mange av hvert tall som mangler. ✓ betyr at alle ni står.",
        "Står du fast? Du har tre hint per brett, og hintet forteller hvorfor tallet skal stå der.",
        "Dagens sudoku er den samme for alle i hele landet: lett på mandag, ekspert på søndag.",
        "Dagens sudoku og et vanlig brett kan være i gang samtidig – ingen av dem forsvinner når du åpner det andre.",
        "Med tastatur: piltaster, tallene 1–9, Backspace, N for notater og P for pause.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          ryddGammel(S);
          const fri = finn(S, false);
          const friAktiv = iGang(fri);
          const dagSp = finn(S, true);
          const { d, tid } = dagensStatus(S);
          const rek = NIVA_ID.filter((n) => S.rekorder[n]).map(
            (n) => `<li><b>${esc(NIVA[n].navn)}</b> ${visTid(S.rekorder[n].tid * 1000)}<small> · ${R.flertall(S.rekorder[n].antall, "brett", "brett")}</small></li>`,
          );
          const r = rekke(S);
          const niva = NIVA[S.oppsett.niva].navn.toLowerCase();
          const dagTekst = `${d.ukedag[0].toUpperCase() + d.ukedag.slice(1)} · ${NIVA[d.niva].navn.toLowerCase()}${r > 0 ? ` · 🔥 ${R.flertall(r, "dag", "dager")} på rad` : ""}`;
          const dagensIGang = iGang(dagSp) && dagSp.dagens === d.tekst;
          // The free board: go on with it, or start one at once on the last level played.
          const friKnapp = (knapp) => (friAktiv ? knapp(`Fortsett · ${NIVA[fri.niva].navn.toLowerCase()} · ${visTid(fri.tid)}`, "fortsett") : knapp(`Start spill · ${niva}`, "nytt"));
          let knapper;
          if (!tid) {
            // Today's sudoku is the main button until it is solved – also while it is under way.
            // It has its own place: a free board beside it never wipes it, and the other way round.
            knapper =
              R.ui.knapp("", "dagens", {
                variant: "stor",
                tekstHtml: `${kalender(d)}<span class="tk-dagknapp"><b>${dagensIGang ? `Fortsett dagens · ${visTid(dagSp.tid)}` : "Dagens sudoku"}</b><small>${esc(dagTekst)}</small></span>`,
              }) + friKnapp(R.ui.knapp2);
          } else knapper = friKnapp(R.ui.knapp);
          const lost = tid ? `<p class="tk-daglinje">✓ Dagens sudoku er løst på ${visTid(tid * 1000)}${r > 1 ? ` · 🔥 ${r} dager på rad` : ""}</p>${nedtellingHtml()}` : "";
          return (
            R.ui.spillhjem({
              slagordHtml: "Ett tall i hver rute.<br><em>Bare logikk – ingen regning.</em>",
              // With a free board under way, «Nytt spill» goes by the level choice.
              knapperHtml: knapper + lost + R.ui.lenkerad(R.ui.lenke(friAktiv ? "Nytt spill" : "Bytt nivå", "bytt"), R.ui.lenke("Slik spiller du", "regler")),
              merker: [
                ["4", "nivåer"],
                ["1", "ny hver dag"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="tk-rekorder" aria-label="Dine beste tider"><p class="etikett">Dine beste tider</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
        inn(S) {
          if (S.daglig.tider[R.dag().tekst]) startNedtelling();
        },
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const niva = S.oppsett.niva;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Hvor vanskelig?</h2></div>
              ${R.ui.fliser(
                "niva",
                NIVA_ID.map((n, k) => ({
                  v: n,
                  tittel: NIVA[n].navn,
                  tekst: S.rekorder[n] ? `Rekord ${visTid(S.rekorder[n].tid * 1000)}` : NIVA[n].tekst,
                  ikon: nivaIkon(k + 1),
                })),
                niva,
              )}
              <p class="hjelp">Hvert brett er nytt og har bare én løsning.</p>
            </section>
            ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.dagens ? "Dagens sudoku" : "Sudoku"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">Sudoku, ${esc(NIVA[sp.niva].navn.toLowerCase())}</h1>
            <div class="tk-spill${sp.pause ? " pauset" : ""}">
              <div class="tk-topp">${hudHtml(S)}<button type="button" class="tk-melding" data-h="skjul-melding" data-stille tabindex="-1" aria-hidden="true" hidden></button></div>
              <div class="tk-flate">
                <div class="tk-brett" role="group" aria-label="Brettet">${brettHtml(sp)}</div>
                <div class="tk-pauseboks"${sp.pause ? "" : " hidden"}>
                  <div class="tk-pausekort">
                    <p class="etikett">Pause</p>
                    <p class="tk-pausetekst">Brettet venter på deg.</p>
                    ${R.ui.knapp("Fortsett", "fortsett-spill")}
                  </div>
                </div>
              </div>
              ${R.ui.dokk(kontrollHtml(sp))}
            </div>`;
        },
        etter(S, rot) {
          bindBrett(S, rot);
          oppdater(S);
          tilpass();
          const flate = R.$(".tk-flate", rot);
          if (flate && typeof ResizeObserver === "function") {
            const obs = new ResizeObserver(() => tilpass());
            obs.observe(flate);
            R.vedForlat(() => obs.disconnect());
          }
        },
        inn(S) {
          if (!S.spill || S.spill.ferdig) return R.gaTil(S.spill ? "slutt" : "hjem");
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
          navnet = [];
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        // A solo result: the top bar says what was played ("Kåringen" is for ranked players).
        tittel: (S) => (S.spill && S.spill.dagens ? "Dagens sudoku" : S.spill && NIVA[S.spill.niva] ? `Sudoku · ${NIVA[S.spill.niva].navn.toLowerCase()}` : "Sudoku"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { sek: Math.round(sp.tid / 1000), hint: HINT - sp.hintIgjen };
          const navn = NIVA[sp.niva].navn;
          const dag = sp.dagens ? dagInfo({ tekst: sp.dagens, nr: sp.dagNr }) : null;
          const tittel = r.nyRekord ? "Ny rekord!" : "Godt jobba!";
          const etikettTekst = dag ? `Dagens sudoku · ${dag.ukedag} ${dag.dato}` : `${navn} · løst`;
          let linje;
          if (dag && r.dagForrige) linje = `Du løste dagens sudoku på ${visTid(r.dagForrige * 1000)} første gang.`;
          else if (r.nyRekord) linje = `Ny personlig rekord på ${navn.toLowerCase()}! Forrige: ${visTid(r.gml * 1000)}.`;
          else if (r.gml) linje = `Rekorden din på ${navn.toLowerCase()}: ${visTid(Math.min(r.gml, r.sek) * 1000)}.`;
          else linje = `Første brett på ${navn.toLowerCase()} – nå har du en rekord å slå!`;
          // The page may stay open past midnight: then a new daily sudoku is ready.
          const gammel = !!dag && sp.dagens !== R.dag().tekst;
          const dagBoks = dag
            ? `<div class="tk-dagboks">
                ${r.rekke ? `<p class="tk-rekke"><span aria-hidden="true">🔥</span> ${R.flertall(r.rekke, "dag", "dager")} på rad</p>` : ""}
                ${gammel ? '<p class="tk-nedtelling"><b>En ny sudoku er klar!</b></p>' : nedtellingHtml()}
              </div>`
            : "";
          // After the daily the main action is to share it; a fresh board is one tap away.
          const dokk = dag
            ? R.ui.dokk(
                gammel ? R.ui.knapp("Dagens sudoku", "dagens") : R.ui.knapp("Del resultatet", "del"),
                R.ui.lenkerad(R.ui.lenke(`Nytt brett · ${navn.toLowerCase()}`, "igjen"), '<a class="lenke" href="/">Alle spill</a>'),
              )
            : R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "bytt"), '<a class="lenke" href="/">Alle spill</a>'));
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${esc(etikettTekst)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
            </div>
            <div class="tk-resultat">
              <div class="tk-tall-boks${r.nyRekord ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>tid</span>${r.nyRekord ? '<i class="tk-ny">Rekord!</i>' : ""}</div>
              <div class="tk-tall-boks"><b>${r.hint}</b><span>hint brukt</span></div>
            </div>
            <p class="hjelp">${esc(linje)}</p>
            ${dagBoks}
            ${miniBrett(sp)}
            ${R.ui.flereSpill({ antall: 1 })}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          if (sp.dagens && sp.dagens === R.dag().tekst) startNedtelling();
          const r = sp.resultat || {};
          // Celebrate in proportion: fanfare for a clean solve, a record or the daily; warm otherwise.
          if (r.hint === 0 || r.nyRekord || sp.dagens) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
          // A solved puzzle is a calm moment for the «put rusj on your home screen» tip (max twice).
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
        },
      },
    },

    handlinger: (H = {
      // «Start spill» / «Nytt spill»: a new board at once, on the last level played.
      // Only a free board under way is lost to a new one: today's sudoku has its own place.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(finn(S, false)))) || !fortsatt()) return;
        nyttSpill(S, S.oppsett.niva);
        R.gaTil("spill");
      },
      bytt: () => R.gaTil("oppsett"),
      fortsett: (el, e, S) => R.gaTil(hent(S, false) && !S.spill.ferdig ? "spill" : "hjem"),
      // Today's sudoku: start it, go on with it, or see how it went. Nothing is lost by it.
      dagens: (el, e, S) => R.gaTil(apneDagens(S)),
      niva(el, e, S) {
        S.oppsett.niva = NIVA[el.dataset.v] ? el.dataset.v : "lett";
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(finn(S, false)))) || !fortsatt()) return;
        nyttSpill(S, S.oppsett.niva);
        R.gaTil("spill");
      },
      // After the daily too: a fresh puzzle at the same level.
      igjen(el, e, S) {
        nyttSpill(S, S.spill ? S.spill.niva : S.oppsett.niva);
        R.gaTil("spill");
      },
      tall(el, e, S) {
        settTall(S, Number(el.dataset.v));
      },
      visk: (el, e, S) => visk(S),
      angre: (el, e, S) => angre(S),
      notater(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.pause) return;
        sp.notat = !sp.notat;
        oppdater(S);
        R.lagre();
      },
      hint: (el, e, S) => brukHint(S),
      "skjul-melding": () => skjulMelding(),
      pause: (el, e, S) => settPause(S, !S.spill.pause),
      "fortsett-spill": (el, e, S) => settPause(S, false),
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.resultat) return;
        const dag = dagInfo({ tekst: sp.dagens, nr: sp.dagNr });
        const r = sp.resultat;
        const tid = visTid((r.dagForrige || r.sek) * 1000);
        const tekst = `Dagens sudoku (${dag.ukedag} ${dag.dato}, ${NIVA[sp.niva].navn.toLowerCase()}): løst på ${tid}${r.hint ? "" : " uten hint"}${r.rekke > 1 ? ` · 🔥 ${r.rekke} dager på rad` : ""}. Klarer du den?`;
        R.del("Tallknuseren – dagens sudoku", tekst, location.origin + "/tallknuseren/");
      },
    }),
  });

  // For the tests and curious minds: the engine is also reachable from the console.
  window.Tallknuseren = motor;
})();
