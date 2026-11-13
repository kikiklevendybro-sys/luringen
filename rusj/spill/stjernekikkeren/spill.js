/* Stjernekikkeren — one star per row, per column and per patch of sky; no two stars touch.
   Every puzzle is made on the phone in a few milliseconds: a random set of stars that never touch,
   patches of sky grown out from them, and then the patches are nudged, cell by cell, until the
   stars are the only answer. A puzzle is kept only when it can be solved by reasoning alone (no
   guessing), and its difficulty is the hardest step that reasoning needs. «Dagens stjernehimmel»
   uses today's date as the seed, so everyone gets the same one. The engine at the top is pure and
   also runs under node (test/stjernekikkeren.test.mjs). */
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
    const BITS = (m) => {
      let n = 0;
      for (; m; m &= m - 1) n++;
      return n;
    };
    const STORRELSER = [6, 7, 8, 9, 10];

    // The eight neighbours of every cell, per size.
    const naboCache = {};
    function naboer(n) {
      if (naboCache[n]) return naboCache[n];
      const ut = [];
      for (let i = 0; i < n * n; i++) {
        const r = (i / n) | 0;
        const c = i % n;
        const liste = [];
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < n && cc >= 0 && cc < n) liste.push(rr * n + cc);
          }
        ut.push(liste);
      }
      return (naboCache[n] = ut);
    }
    // Cells side by side (patches of sky are connected through sides, not corners).
    function sider(n, i) {
      const r = (i / n) | 0;
      const c = i % n;
      const ut = [];
      if (r > 0) ut.push(i - n);
      if (r < n - 1) ut.push(i + n);
      if (c > 0) ut.push(i - 1);
      if (c < n - 1) ut.push(i + 1);
      return ut;
    }

    // ---------- Counting solutions ----------
    // Row by row: a column not used yet, a patch not used yet, never next to the star in the row
    // above. Prunes when a patch that still needs its star has no free cell left below.
    // Returns up to `grense` solutions, each as the star's column per row.
    function finn(n, felt, grense) {
      const maske = []; // maske[g][r]: the columns of patch g in row r
      for (let g = 0; g < n; g++) maske.push(new Array(n).fill(0));
      for (let i = 0; i < n * n; i++) maske[felt[i]][(i / n) | 0] |= 1 << i % n;
      const ut = [];
      const kol = new Array(n);
      function steg(r, brukteK, brukteF, forrige) {
        if (r === n) {
          ut.push(kol.slice());
          return ut.length >= grense;
        }
        for (let c = 0; c < n; c++) {
          if (brukteK & (1 << c)) continue;
          if (forrige >= 0 && c >= forrige - 1 && c <= forrige + 1) continue;
          const g = felt[r * n + c];
          if (brukteF & (1 << g)) continue;
          const k2 = brukteK | (1 << c);
          const f2 = brukteF | (1 << g);
          const nesteFri = ~(k2 | (7 << c >> 1)) & ((1 << n) - 1);
          let mulig = true;
          for (let h = 0; h < n && mulig; h++) {
            if (f2 & (1 << h)) continue;
            let har = false;
            for (let rr = r + 1; rr < n && !har; rr++) if (maske[h][rr] & (rr === r + 1 ? nesteFri : ~k2)) har = true;
            if (!har) mulig = false;
          }
          if (!mulig) continue;
          kol[r] = c;
          if (steg(r + 1, k2, f2, c)) return true;
        }
        return false;
      }
      steg(0, 0, 0, -1);
      return ut;
    }
    const tell = (n, felt, grense) => finn(n, felt, grense || 2).length;

    // ---------- Solving like a person ----------
    // Techniques, easiest first (the number is the difficulty):
    // 1 a row, column or patch with one free cell left gets the star; a star rules out its row,
    //   column, patch and the eight cells around it.
    // 2 a patch that lies in one row (or column) has the star of that row; and the other way round.
    // 3 the same for groups: k patches inside k rows (or columns), k rows inside k patches …
    // 4 a cell that touches or shares a line with every free cell of a row, column or patch.
    // 5 trying a cell: if a star there leaves some row, column or patch with no room (after the
    //   steps above), it can't be a star.
    // tilstand: Uint8Array(n*n), 0 = ruled out, 1 = free, 2 = star. Changed in place.
    function lagEnheter(n, felt) {
      const enheter = [];
      for (let r = 0; r < n; r++) enheter.push({ type: "rad", nr: r, celler: Array.from({ length: n }, (_, c) => r * n + c) });
      for (let c = 0; c < n; c++) enheter.push({ type: "kolonne", nr: c, celler: Array.from({ length: n }, (_, r) => r * n + c) });
      for (let g = 0; g < n; g++) enheter.push({ type: "felt", nr: g, celler: [] });
      for (let i = 0; i < n * n; i++) enheter[2 * n + felt[i]].celler.push(i);
      return enheter;
    }

    function settStjerne(n, felt, t, i) {
      const r = (i / n) | 0;
      const c = i % n;
      t[i] = 2;
      for (let k = 0; k < n; k++) {
        if (t[r * n + k] === 1) t[r * n + k] = 0;
        if (t[k * n + c] === 1) t[k * n + c] = 0;
      }
      for (let j = 0; j < n * n; j++) if (felt[j] === felt[i] && t[j] === 1) t[j] = 0;
      for (const j of naboer(n)[i]) if (t[j] === 1) t[j] = 0;
    }

    // One step of reasoning. Returns { niva, type, i (a star), fjern: [cells ruled out], enhet } or
    // null when nothing more can be found. «motsigelse» when a unit has no room left.
    function etSteg(n, felt, t, enheter, maks) {
      // A unit with no star and no free cell: the position is impossible.
      for (const e of enheter) {
        let fri = 0;
        let stj = 0;
        for (const i of e.celler) {
          if (t[i] === 1) fri++;
          else if (t[i] === 2) stj++;
        }
        if (stj > 1 || (!stj && !fri)) return { type: "motsigelse" };
      }
      // 1: the only free cell of a unit.
      for (const e of enheter) {
        let fri = -1;
        let antall = 0;
        let stj = false;
        for (const i of e.celler) {
          if (t[i] === 2) stj = true;
          else if (t[i] === 1) {
            antall++;
            fri = i;
          }
        }
        if (!stj && antall === 1) return { niva: 1, type: "eneste", i: fri, enhet: e };
      }
      if (maks < 2) return null;
      // 2 and 3: k units of one kind whose free cells lie inside k units of another kind.
      const radAv = (i) => (i / n) | 0;
      const kolAv = (i) => i % n;
      const feltAv = (i) => felt[i];
      const slag = [
        [feltAv, radAv],
        [feltAv, kolAv],
        [radAv, feltAv],
        [kolAv, feltAv],
      ];
      const masker = (a, b) => {
        // For every unit of kind a without a star: the units of kind b its free cells touch.
        const m = new Array(n).fill(0);
        const ferdig = new Array(n).fill(false);
        for (let i = 0; i < n * n; i++) {
          if (t[i] === 2) ferdig[a(i)] = true;
          else if (t[i] === 1) m[a(i)] |= 1 << b(i);
        }
        return { m, ferdig };
      };
      for (let k = 1; k <= (maks >= 3 ? n - 1 : 1); k++) {
        for (const [a, b] of slag) {
          const { m, ferdig } = masker(a, b);
          const apne = [];
          for (let x = 0; x < n; x++) if (!ferdig[x]) apne.push(x);
          if (apne.length <= k) continue;
          // Every group of k open units of kind a.
          const valg = [];
          const prov = (fra) => {
            if (valg.length === k) {
              let union = 0;
              let inni = 0;
              for (const x of valg) {
                union |= m[x];
                inni |= 1 << x;
              }
              if (BITS(union) !== k) return null;
              const fjern = [];
              for (let i = 0; i < n * n; i++) if (t[i] === 1 && union & (1 << b(i)) && !(inni & (1 << a(i)))) fjern.push(i);
              return fjern.length ? fjern : null;
            }
            for (let x = fra; x < apne.length; x++) {
              valg.push(apne[x]);
              const svar = prov(x + 1);
              valg.pop();
              if (svar) return svar;
            }
            return null;
          };
          // Groups of up to 4 are enough (bigger ones are the mirror of smaller ones).
          if (k > 4) continue;
          const fjern = prov(0);
          if (fjern) return { niva: k === 1 ? 2 : 3, type: "inni", fjern, k };
        }
      }
      if (maks < 4) return null;
      // 4: a free cell that would rule out every free cell of some other unit.
      const nab = naboer(n);
      for (let i = 0; i < n * n; i++) {
        if (t[i] !== 1) continue;
        const ser = new Set(nab[i]);
        const r = radAv(i);
        const c = kolAv(i);
        for (let j = 0; j < n * n; j++) if (t[j] === 1 && (radAv(j) === r || kolAv(j) === c || felt[j] === felt[i])) ser.add(j);
        for (const e of enheter) {
          if (e.celler.includes(i)) continue;
          let stj = false;
          let fri = 0;
          let alleSett = true;
          for (const j of e.celler) {
            if (t[j] === 2) stj = true;
            else if (t[j] === 1) {
              fri++;
              if (!ser.has(j)) alleSett = false;
            }
          }
          if (!stj && fri && alleSett) return { niva: 4, type: "dekker", fjern: [i], enhet: e };
        }
      }
      if (maks < 5) return null;
      // 5: try a star in a free cell and reason with steps 1–4; a dead end rules the cell out.
      for (let i = 0; i < n * n; i++) {
        if (t[i] !== 1) continue;
        const kopi = Uint8Array.from(t);
        settStjerne(n, felt, kopi, i);
        for (let runde = 0; runde < n * n; runde++) {
          const s = etSteg(n, felt, kopi, enheter, 4);
          if (!s) break;
          if (s.type === "motsigelse") return { niva: 5, type: "prov", fjern: [i] };
          bruk(n, felt, kopi, s);
        }
      }
      return null;
    }
    function bruk(n, felt, t, s) {
      if (s.i != null) settStjerne(n, felt, t, s.i);
      if (s.fjern) for (const j of s.fjern) if (t[j] === 1) t[j] = 0;
    }

    // Solves as far as reasoning goes. Returns { lost, grad (the hardest step), t }.
    function los(n, felt, maks, start) {
      const enheter = lagEnheter(n, felt);
      const t = start ? Uint8Array.from(start) : new Uint8Array(n * n).fill(1);
      let grad = 0;
      for (let runde = 0; runde < 4 * n * n; runde++) {
        const s = etSteg(n, felt, t, enheter, maks || 5);
        if (!s) break;
        if (s.type === "motsigelse") return { lost: false, grad, t, motsigelse: true };
        grad = Math.max(grad, s.niva);
        bruk(n, felt, t, s);
      }
      let stjerner = 0;
      for (let i = 0; i < n * n; i++) if (t[i] === 2) stjerner++;
      return { lost: stjerner === n, grad, t };
    }

    // ---------- Making a puzzle ----------

    // Stars that never share a row or column and never touch: a random column per row.
    function stjerner(n, tilf) {
      const kol = new Array(n);
      const brukt = new Array(n).fill(false);
      const steg = (r) => {
        if (r === n) return true;
        for (const c of stokk(Array.from({ length: n }, (_, k) => k), tilf)) {
          if (brukt[c] || (r > 0 && Math.abs(c - kol[r - 1]) < 2)) continue;
          brukt[c] = true;
          kol[r] = c;
          if (steg(r + 1)) return true;
          brukt[c] = false;
        }
        return false;
      };
      steg(0);
      return kol;
    }

    // Patches grown out from the stars: a random patch that can still grow takes a free cell next
    // to it, one at a time (so the patches stay of a similar size, but never the same shape).
    function gro(n, kol, tilf) {
      const felt = new Int8Array(n * n).fill(-1);
      const celler = [];
      for (let r = 0; r < n; r++) {
        felt[r * n + kol[r]] = r;
        celler.push([r * n + kol[r]]);
      }
      let igjen = n * n - n;
      while (igjen > 0) {
        const g = Math.floor(tilf() * n);
        const frie = [];
        for (const i of celler[g]) for (const j of sider(n, i)) if (felt[j] < 0 && !frie.includes(j)) frie.push(j);
        if (!frie.length) continue;
        const j = frie[Math.floor(tilf() * frie.length)];
        felt[j] = g;
        celler[g].push(j);
        igjen--;
      }
      return Uint8Array.from(felt);
    }

    // Is patch g still in one piece without cell x?
    function helUten(n, felt, g, x) {
      let start = -1;
      let antall = 0;
      for (let i = 0; i < n * n; i++)
        if (felt[i] === g && i !== x) {
          antall++;
          if (start < 0) start = i;
        }
      if (!antall) return false;
      const sett = new Uint8Array(n * n);
      sett[start] = 1;
      const ko = [start];
      let funnet = 1;
      while (ko.length) {
        const i = ko.pop();
        for (const j of sider(n, i))
          if (!sett[j] && j !== x && felt[j] === g) {
            sett[j] = 1;
            funnet++;
            ko.push(j);
          }
      }
      return funnet === antall;
    }

    // Nudges the patches until the stars are the only answer: a star of another answer that is
    // not one of ours moves to a neighbouring patch (which breaks that answer).
    function snevre(n, felt, kol, tilf, maksSteg) {
      const stjerne = new Uint8Array(n * n);
      for (let r = 0; r < n; r++) stjerne[r * n + kol[r]] = 1;
      const GRENSE = 40;
      let losninger = finn(n, felt, GRENSE);
      for (let s = 0; s < maksSteg && losninger.length > 1; s++) {
        const andre = losninger.find((l) => l.some((c, r) => c !== kol[r]));
        const kandidater = [];
        for (let r = 0; r < n; r++) if (andre[r] !== kol[r]) kandidater.push(r * n + andre[r]);
        stokk(kandidater, tilf);
        let flyttet = false;
        for (const x of kandidater) {
          if (stjerne[x]) continue;
          const mal = stokk(sider(n, x).map((j) => felt[j]).filter((g, k, a) => g !== felt[x] && a.indexOf(g) === k), tilf);
          if (!mal.length || !helUten(n, felt, felt[x], x)) continue;
          const gml = felt[x];
          felt[x] = mal[0];
          const nye = finn(n, felt, GRENSE);
          // Keep the move when it does not add answers (now and then also when it does, to get out of a rut).
          if (nye.length <= losninger.length || tilf() < 0.15) {
            losninger = nye;
            flyttet = true;
            break;
          }
          felt[x] = gml;
        }
        if (!flyttet) {
          // Stuck: move a random free border cell instead.
          const x = Math.floor(tilf() * n * n);
          if (stjerne[x]) continue;
          const mal = sider(n, x).map((j) => felt[j]).filter((g) => g !== felt[x]);
          if (!mal.length || !helUten(n, felt, felt[x], x)) continue;
          felt[x] = mal[Math.floor(tilf() * mal.length)];
          losninger = finn(n, felt, GRENSE);
        }
      }
      return losninger.length === 1;
    }

    // Difficulty per level: the size, and the hardest reasoning step allowed (and wanted).
    const NIVAER = Object.freeze({
      5: { n: 5, min: 1, maks: 3 },
      6: { n: 6, min: 1, maks: 4 },
      7: { n: 7, min: 2, maks: 5 },
      8: { n: 8, min: 2, maks: 5 },
      9: { n: 9, min: 3, maks: 5 },
      10: { n: 10, min: 3, maks: 5 },
    });

    function lagMed(N, fro, maksForsok) {
      const tilf = rng(fro);
      const n = N.n;
      let reserve = null;
      for (let forsok = 1; forsok <= maksForsok; forsok++) {
        const kol = stjerner(n, tilf);
        const felt = gro(n, kol, tilf);
        if (!snevre(n, felt, kol, tilf, 30 * n)) continue;
        const l = los(n, felt, N.maks);
        if (!l.lost) continue;
        const svar = { n, felt: Array.from(felt), losning: kol.slice(), grad: l.grad, forsok };
        if (l.grad >= N.min) return svar;
        if (!reserve) reserve = svar;
      }
      return reserve;
    }
    function lag(n, fro) {
      return lagMed(NIVAER[n] || NIVAER[8], fro, 200);
    }

    // ---------- «Dagens stjernehimmel» ----------
    // Everyone must get the same puzzle on the same day, also on phones with an older copy of the
    // game, and a day's puzzle must never change afterwards: the daily has its own frozen rules and
    // its own copy of the seed hash; test/stjernekikkeren.test.mjs pins known days.
    const DAGLIG = Object.freeze({
      6: Object.freeze({ n: 6, min: 1, maks: 4 }),
      7: Object.freeze({ n: 7, min: 2, maks: 5 }),
      8: Object.freeze({ n: 8, min: 2, maks: 5 }),
      9: Object.freeze({ n: 9, min: 3, maks: 5 }),
    });
    // Small on Monday, big at the weekend (index 0 = Sunday).
    const DAGLIG_UKE = Object.freeze([9, 6, 7, 7, 8, 8, 9]);
    function fnv(tekst) {
      let h = 0x811c9dc5;
      for (let i = 0; i < tekst.length; i++) {
        h ^= tekst.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    const dagligStorrelse = (nr) => DAGLIG_UKE[(((nr + 4) % 7) + 7) % 7];
    // dato: "2026-11-13" (the date in the edition's country), nr: R.dag().nr.
    function lagDaglig(dato, nr) {
      return lagMed(DAGLIG[dagligStorrelse(nr)], fnv("stjernekikkeren:" + dato), 400);
    }

    // ---------- Rules on a board in play ----------
    // merker: Uint8Array(n*n), 0 = empty, 1 = dot, 2 = star. Returns the stars that break a rule,
    // and why (said out loud and shown, never by colour alone).
    function konflikter(n, felt, merker) {
      const ut = new Uint8Array(n * n);
      const grunn = {};
      const stj = [];
      for (let i = 0; i < n * n; i++) if (merker[i] === 2) stj.push(i);
      for (let a = 0; a < stj.length; a++)
        for (let b = a + 1; b < stj.length; b++) {
          const i = stj[a];
          const j = stj[b];
          const ri = (i / n) | 0;
          const rj = (j / n) | 0;
          const ci = i % n;
          const cj = j % n;
          let hvorfor = null;
          if (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1) hvorfor = "nabo";
          else if (ri === rj) hvorfor = "rad";
          else if (ci === cj) hvorfor = "kolonne";
          else if (felt[i] === felt[j]) hvorfor = "felt";
          if (hvorfor) {
            ut[i] = ut[j] = 1;
            (grunn[i] = grunn[i] || []).push(hvorfor);
            (grunn[j] = grunn[j] || []).push(hvorfor);
          }
        }
      return { ut, grunn };
    }

    // The next helpful step for a player. merker: the board; losning: column per row.
    // Wrong stars first, then dots where a star belongs; then a star that follows from the stars
    // already right (with the reason, when it is a simple one).
    function hint(n, felt, losning, merker) {
      const rett = new Uint8Array(n * n);
      for (let r = 0; r < n; r++) rett[r * n + losning[r]] = 1;
      const feil = [];
      for (let i = 0; i < n * n; i++) if (merker[i] === 2 && !rett[i]) feil.push(i);
      if (feil.length) return { type: "feil", celler: feil };
      const prikker = [];
      for (let i = 0; i < n * n; i++) if (merker[i] === 1 && rett[i]) prikker.push(i);
      if (prikker.length) return { type: "prikk", celler: prikker };
      const t = new Uint8Array(n * n).fill(1);
      for (let i = 0; i < n * n; i++) if (merker[i] === 2) settStjerne(n, felt, t, i);
      const enheter = lagEnheter(n, felt);
      let hardest = 0;
      for (let runde = 0; runde < 4 * n * n; runde++) {
        const s = etSteg(n, felt, t, enheter, 5);
        if (!s || s.type === "motsigelse") break;
        if (s.i != null && runde === 0) return { type: "stjerne", i: s.i, grunn: s.enhet.type };
        if (s.i != null) return { type: "stjerne", i: s.i, grunn: Math.max(hardest, s.niva) >= 4 ? "vanskelig" : "logikk" };
        hardest = Math.max(hardest, s.niva);
        bruk(n, felt, t, s);
      }
      // Practically never: the first star still missing.
      for (let r = 0; r < n; r++) if (merker[r * n + losning[r]] !== 2) return { type: "stjerne", i: r * n + losning[r], grunn: "vanskelig" };
      return null;
    }

    return { rng, fnv, naboer, sider, finn, tell, los, lagEnheter, stjerner, gro, snevre, NIVAER, STORRELSER, lag, lagMed, DAGLIG, dagligStorrelse, lagDaglig, konflikter, hint };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    if (typeof window === "object" && window) window.Stjernekikkeren = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;

  const STR = M.STORRELSER;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const NIVA = Object.assign(Object.create(null), {
    6: R.t("En rolig start"),
    7: R.t("Litt å tenke på"),
    8: R.t("Passe utfordring"),
    9: R.t("For viderekomne"),
    10: R.t("Hele himmelen"),
  });
  const storrelse = (n) => `${n} × ${n}`;
  const BOKSTAV = "ABCDEFGHIJ";
  const HINT = 3;
  const MAKS_ANGRE = 400;
  const FORSTE = 20770; // «nr. 1» is 13 November 2026 (R.dag().nr)
  const NAVN = () => (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || R.t("Stjernekikkeren");
  // This edition's address (rusj.no/stjernekikkeren/, rusj.no/en/stargazer/ …)
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/stjernekikkeren/" }).href;

  let H; // actions
  let klokkeFra = null; // performance.now() when the clock last started
  let las = false; // input locked while the win plays
  let celler = []; // the cell buttons of the board on the screen
  let tegnet = []; // what each cell shows now (to skip unchanged ones)
  let dra = null; // a finger or mouse drawing dots
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
  const nedtellingHtml = () => `<p class="sk-nedtelling">${esc(R.t("Ny stjernehimmel om {tid}")).replace("{tid}", `<b>${klokkeTekst(sekunderTilNy())}</b>`)}</p>`;
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".sk-nedtelling b");
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
    const n = dag ? M.dagligStorrelse(d.nr) : STR.includes(S.oppsett.n) ? S.oppsett.n : 8;
    const o = dag ? M.lagDaglig(d.tekst, d.nr) : M.lag(n, R.nyttFro());
    const sp = {
      n: o.n,
      felt: o.felt,
      losning: o.losning,
      grad: o.grad,
      dagens: d ? d.tekst : null,
      dagNr: d ? d.nr : null,
      m: new Array(o.n * o.n).fill(0),
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

  // The front page shows how far today's puzzle has come (rusj/DAGLIG.md).
  function meldIGang(S) {
    const sp = dagensSpill(S);
    if (!sp || sp.ferdig || S.daglig.dager[sp.dagens] || !sp.m.some(Boolean)) return;
    R.dagligIGang({ tekst: visTid(sp.tid) });
  }

  // ---------- What the board shows ----------

  const radAv = (sp, i) => (i / sp.n) | 0;
  const kolAv = (sp, i) => i % sp.n;
  const erHint = (sp, i) => sp.hint.includes(i);
  const antallStjerner = (sp) => sp.m.filter((v) => v === 2).length;

  // Cells ruled out by the stars on the board (shown as faint dots when «Autoprikk» is on).
  function utelukket(sp) {
    const n = sp.n;
    const ut = new Uint8Array(n * n);
    const nab = M.naboer(n);
    for (let i = 0; i < n * n; i++) {
      if (sp.m[i] !== 2) continue;
      for (let j = 0; j < n * n; j++) if (radAv(sp, j) === radAv(sp, i) || kolAv(sp, j) === kolAv(sp, i) || sp.felt[j] === sp.felt[i]) ut[j] = 1;
      for (const j of nab[i]) ut[j] = 1;
    }
    for (let i = 0; i < n * n; i++) if (sp.m[i] === 2) ut[i] = 0;
    return ut;
  }

  // Region edges: a thick line where the next cell belongs to another patch of sky.
  function kanter(sp, i) {
    const n = sp.n;
    const r = radAv(sp, i);
    const c = kolAv(sp, i);
    const f = sp.felt[i];
    let k = "";
    if (r > 0 && sp.felt[i - n] !== f) k += " kt";
    if (r < n - 1 && sp.felt[i + n] !== f) k += " kb";
    if (c > 0 && sp.felt[i - 1] !== f) k += " kl";
    if (c < n - 1 && sp.felt[i + 1] !== f) k += " kr";
    return k;
  }

  const STJERNE = '<svg class="sk-stjerne" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.75 5.9 6.45.75-4.78 4.4 1.28 6.37L12 16.8l-5.7 3.22 1.28-6.37L2.8 9.25l6.45-.75z"/></svg>';
  function innhold(sp, i) {
    const v = sp.m[i];
    if (v === 2) return STJERNE;
    if (v === 1) return '<i class="sk-prikk" aria-hidden="true"></i>';
    return "";
  }

  function etikett(sp, i, konf, ute) {
    const sted = R.t("Rad {r}, kolonne {k}, felt {f}", { r: radAv(sp, i) + 1, k: kolAv(sp, i) + 1, f: BOKSTAV[sp.felt[i]] });
    const v = sp.m[i];
    let hva;
    if (v === 2) hva = erHint(sp, i) ? R.t("stjerne fra hint") : konf ? R.t("stjerne, bryter reglene") : R.t("stjerne");
    else if (v === 1) hva = R.t("prikk");
    else hva = ute ? R.t("tom, utelukket") : R.t("tom");
    return `${sted}: ${hva}`;
  }

  function brettHtml(sp) {
    const n = sp.n;
    let html = "";
    for (let i = 0; i < n * n; i++) html += `<button type="button" class="sk-celle sk-f${sp.felt[i]}${kanter(sp, i)}" data-i="${i}" tabindex="-1" aria-label="${esc(etikett(sp, i, false, false))}">${innhold(sp, i)}</button>`;
    return html;
  }

  const IKON = {
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    tom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/></svg>',
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><path d="m15.5 13.2 1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.3-2.2 1.3.4-2.5-1.8-1.7 2.5-.3z"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>',
  };

  function hudHtml(S, sp) {
    return `<div class="sk-hud">
      <span class="sk-stat"><small>${esc(sp.dagens ? R.t("Dagens") : R.t("Størrelse"))}</small><b>${storrelse(sp.n)}</b></span>
      <button type="button" class="sk-klokke" data-h="pause" data-stille aria-label="${esc(sp.pause ? R.t("Fortsett") : R.t("Pause"))}"><span class="sk-pauseikon">${IKON.pause}</span><span class="sk-klokketekst"><small>${esc(R.t("Tid"))}</small><b id="sk-tid">${visTid(tidMs(sp))}</b></span></button>
      <span class="sk-stat"><small>${esc(R.t("Stjerner"))}</small><b id="sk-antall">${antallStjerner(sp)}/${sp.n}</b></span>
    </div>`;
  }

  function verktoyHtml(S, sp) {
    return `<div class="sk-verktoy">
      <button type="button" class="sk-verk" data-h="angre" id="sk-angre" data-stille${sp.angre.length ? "" : " disabled"}>${IKON.angre}<span>${esc(R.t("Angre"))}</span></button>
      <button type="button" class="sk-verk" data-h="tom" id="sk-tom" data-stille>${IKON.tom}<span>${esc(R.t("Tøm"))}</span></button>
      <button type="button" class="sk-verk" data-h="auto" id="sk-auto" data-stille aria-pressed="${!!S.autoPrikk}">${IKON.auto}<span>${esc(R.t("Autoprikk"))}</span><i class="sk-merke" aria-hidden="true">${esc(S.autoPrikk ? R.t("PÅ") : R.t("AV"))}</i></button>
      <button type="button" class="sk-verk" data-h="hint" id="sk-hint" data-stille${sp.hintIgjen > 0 ? "" : " disabled"} aria-label="${esc(R.t("Hint, {n} igjen", { n: sp.hintIgjen }))}">${IKON.hint}<span>${esc(R.t("Hint"))}</span><i class="sk-merke" aria-hidden="true">${sp.hintIgjen}</i></button>
    </div>`;
  }

  // ---------- Updating the board in place ----------

  function oppdater(S) {
    const sp = aktiv(S);
    if (!sp || !celler.length) return;
    const n = sp.n;
    const { ut: konf } = M.konflikter(n, sp.felt, sp.m);
    const ute = S.autoPrikk ? utelukket(sp) : new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const el = celler[i];
      if (!el) continue;
      const v = sp.m[i];
      let k = `sk-celle sk-f${sp.felt[i]}${kanter(sp, i)}`;
      if (v === 2) k += erHint(sp, i) ? " stjerne hintet" : " stjerne";
      else if (v === 1) k += " prikket";
      else if (ute[i]) k += " ute";
      if (konf[i]) k += " konflikt";
      if (i === sp.valgt) k += " valgt";
      for (const x of ["blink", "rist", "hintmal"]) if (el.classList.contains(x)) k += " " + x;
      if (el.className !== k) el.className = k;
      const inn = innhold(sp, i);
      if (tegnet[i] !== inn) {
        el.innerHTML = inn;
        tegnet[i] = inn;
      }
      const navn = etikett(sp, i, konf[i], ute[i]);
      if (el.getAttribute("aria-label") !== navn) el.setAttribute("aria-label", navn);
      el.tabIndex = i === sp.valgt ? 0 : -1;
    }
    const antall = R.$("#sk-antall");
    if (antall) antall.textContent = `${antallStjerner(sp)}/${n}`;
    const angre = R.$("#sk-angre");
    if (angre) angre.disabled = !sp.angre.length;
    const hint = R.$("#sk-hint");
    if (hint) {
      hint.disabled = sp.hintIgjen <= 0;
      hint.setAttribute("aria-label", R.t("Hint, {n} igjen", { n: sp.hintIgjen }));
      hint.querySelector(".sk-merke").textContent = sp.hintIgjen;
    }
    const auto = R.$("#sk-auto");
    if (auto) {
      auto.setAttribute("aria-pressed", String(!!S.autoPrikk));
      auto.querySelector(".sk-merke").textContent = S.autoPrikk ? R.t("PÅ") : R.t("AV");
    }
    const spillEl = R.$(".sk-spill");
    if (spillEl) {
      spillEl.classList.toggle("pauset", !!sp.pause);
      spillEl.classList.toggle("tomt", !sp.m.some(Boolean));
    }
    const pause = R.$(".sk-pauseboks");
    if (pause) pause.hidden = !sp.pause;
    const klokke = R.$(".sk-klokke");
    if (klokke) klokke.setAttribute("aria-label", sp.pause ? R.t("Fortsett") : R.t("Pause"));
  }

  // Board size: the biggest square that fits, in whole pixels per cell.
  function tilpass() {
    const flate = R.$(".sk-flate");
    const brett = R.$(".sk-brett");
    const sp = R.S && aktiv(R.S);
    if (!flate || !brett || !sp) return;
    // Landscape: the message line goes to the right column; portrait: right under the sky.
    const ligg = window.matchMedia("(orientation: landscape) and (max-height: 600px) and (min-width: 560px)").matches;
    const under = R.$(".sk-under");
    const mal = R.$(ligg ? ".sk-plass" : ".sk-midt");
    if (under && mal && under.parentElement !== mal) mal.appendChild(under);
    const plass = Math.min(flate.clientWidth - 4, flate.clientHeight - 4 - (under && !ligg ? under.offsetHeight + 10 : 0));
    const c = Math.max(26, Math.min(64, Math.floor((plass - 8) / sp.n)));
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
    const m = R.$(".sk-melding");
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

  // One undo step: [[cell, old value], …]
  function endre(sp, endringer) {
    if (!endringer.length) return;
    sp.angre.push(endringer);
    if (sp.angre.length > MAKS_ANGRE) sp.angre.shift();
  }

  const sted = (sp, i) => R.t("Rad {r}, kolonne {k}", { r: radAv(sp, i) + 1, k: kolAv(sp, i) + 1 });
  const kanSpille = (sp) => !!sp && !sp.ferdig && !sp.pause && !las;

  // Sets one cell (0 empty, 1 dot, 2 star) as its own undo step.
  function sett(S, i, verdi) {
    const sp = aktiv(S);
    if (!kanSpille(sp) || i < 0 || i >= sp.n * sp.n) return;
    if (erHint(sp, i)) {
      melding(R.t("Stjerner fra hint står fast."));
      return;
    }
    if (sp.m[i] === verdi) return;
    endre(sp, [[i, sp.m[i]]]);
    sp.m[i] = verdi;
    sp.valgt = i;
    etterEndring(S, i);
  }
  // A tap: empty → dot → star → empty.
  const syklus = (S, i) => {
    const sp = aktiv(S);
    if (!sp) return;
    sett(S, i, (sp.m[i] + 1) % 3);
  };

  // After a change: conflicts are said, the win is checked, sounds.
  function etterEndring(S, i, stille) {
    const sp = aktiv(S);
    const { ut: konf, grunn } = M.konflikter(sp.n, sp.felt, sp.m);
    oppdater(S);
    const v = sp.m[i];
    if (v === 2 && konf[i]) {
      if (!stille) {
        R.lyd.tone(240, 0, 0.16, "triangle", 0.11, 170);
        R.vibrer([12, 40, 12]);
      }
      const TEKST = { rad: R.t("To stjerner i samme rad."), kolonne: R.t("To stjerner i samme kolonne."), felt: R.t("To stjerner i samme felt."), nabo: R.t("To stjerner rører hverandre.") };
      const hvorfor = Array.from(new Set(grunn[i] || [])).map((g) => TEKST[g]);
      R.si(`${R.t("Stjerne i {sted}.", { sted: sted(sp, i).toLowerCase() })} ${hvorfor.join(" ")}`);
      effekt([i], "rist");
    } else {
      if (v === 2 && antallStjerner(sp) === sp.n && !konf.some(Boolean) && sp.m.every((x, k) => (x === 2) === (sp.losning[(k / sp.n) | 0] === k % sp.n))) return vinn(S, i);
      if (!stille) {
        if (v === 2) {
          R.lyd.tone(880, 0, 0.09, "sine", 0.1);
          R.lyd.tone(1320, 0.06, 0.14, "sine", 0.08);
          R.vibrer(8);
        } else R.lyd.tone(v === 1 ? 700 : 480, 0, 0.04, "triangle", 0.07, v === 1 ? 760 : 380);
        R.si(v === 2 ? R.t("Stjerne i {sted}.", { sted: sted(sp, i).toLowerCase() }) : v === 1 ? R.t("Prikk i {sted}.", { sted: sted(sp, i).toLowerCase() }) : R.t("{sted} er tom.", { sted: sted(sp, i) }));
      }
    }
    if (antallStjerner(sp) === sp.n && konf.some(Boolean)) melding(R.t("Alle stjernene står, men noen bryter reglene. Se etter utropstegnene."));
    R.lagre();
  }

  function angre(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp) || !sp.angre.length) return;
    const endringer = sp.angre.pop();
    for (let k = endringer.length - 1; k >= 0; k--) {
      const [i, v] = endringer[k];
      sp.m[i] = v;
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
    for (let i = 0; i < sp.m.length; i++) if (sp.m[i] && !erHint(sp, i)) endringer.push([i, sp.m[i]]);
    if (!endringer.length) return melding(R.t("Brettet er allerede tomt."));
    endre(sp, endringer);
    for (const [i] of endringer) sp.m[i] = 0;
    R.lyd.sveip();
    oppdater(S);
    melding(R.t("Brettet er tømt. Angre henter det tilbake."));
    R.lagre();
  }

  const HINTTEKST = {
    rad: () => R.t("Det er bare én plass igjen i denne raden."),
    kolonne: () => R.t("Det er bare én plass igjen i denne kolonnen."),
    felt: () => R.t("Det er bare én plass igjen i dette feltet."),
    logikk: () => R.t("Her må det stå en stjerne – se hvor de andre stjernene stenger."),
    vanskelig: () => R.t("En vrien en: Her skal det stå en stjerne."),
  };

  function brukHint(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp)) return;
    if (sp.hintIgjen <= 0) return melding(R.t("Du har brukt alle hintene"));
    const h = M.hint(sp.n, sp.felt, sp.losning, sp.m);
    if (!h) return;
    sp.hintIgjen -= 1;
    if (h.type === "feil" || h.type === "prikk") {
      for (const i of h.celler) sp.m[i] = 0;
      sp.angre = sp.angre.filter((steg) => !steg.some(([i]) => h.celler.includes(i)));
      sp.valgt = h.celler[0];
      oppdater(S);
      effekt(h.celler, "blink", 60);
      R.lyd.tone(330, 0, 0.14, "triangle", 0.1, 260);
      if (h.type === "feil") melding(h.celler.length === 1 ? R.t("Den stjernen stod feil. Den er fjernet.") : R.t("{n} stjerner stod feil. De er fjernet.", { n: h.celler.length }));
      else melding(h.celler.length === 1 ? R.t("Der du satte prikk, skal det stå en stjerne. Prikken er fjernet.") : R.t("Det skal stå stjerner der du satte {n} av prikkene. De er fjernet.", { n: h.celler.length }));
      R.lagre();
      return;
    }
    const i = h.i;
    sp.m[i] = 2;
    sp.hint.push(i);
    sp.angre = sp.angre.filter((steg) => !steg.some(([k]) => k === i));
    sp.valgt = i;
    R.lyd.tone(990, 0, 0.12, "sine", 0.12);
    R.lyd.tone(1480, 0.1, 0.22, "sine", 0.1);
    melding(HINTTEKST[h.grunn] ? HINTTEKST[h.grunn]() : HINTTEKST.vanskelig());
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
    const el = R.$("#sk-tid");
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
    // The stars light up one by one from the last one placed, then the result.
    const fortsatt = R.vakt();
    const stj = [];
    for (let i = 0; i < sp.n * sp.n; i++) if (sp.m[i] === 2) stj.push(i);
    const avst = (a) => Math.abs(radAv(sp, a) - radAv(sp, sist)) + Math.abs(kolAv(sp, a) - kolAv(sp, sist));
    stj.sort((a, b) => avst(a) - avst(b));
    const brett = R.$(".sk-brett");
    if (brett && !R.rolig()) brett.classList.add("vant");
    effekt(stj, "lys", 110);
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 700 : 900 + stj.length * 110,
    );
  }

  // ---------- Input on the board ----------

  const celleUnder = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest && el.closest(".sk-celle");
    return c ? Number(c.dataset.i) : -1;
  };

  function bindBrett(S, rot) {
    celler = [];
    tegnet = [];
    R.$$(".sk-celle", rot).forEach((el) => {
      const i = Number(el.dataset.i);
      celler[i] = el;
      tegnet[i] = el.innerHTML;
    });
    const brett = R.$(".sk-brett", rot);
    if (!brett) return;
    // A tap cycles the cell; a drag paints dots on empty cells (or wipes dots, when it starts on one).
    const ned = (e) => {
      const el = e.target.closest(".sk-celle");
      if (!el || (e.pointerType === "mouse" && e.button !== 0)) return;
      const sp = aktiv(R.S);
      if (!kanSpille(sp) || performance.now() - inntil < 350) return;
      e.preventDefault();
      R.lyd.lasOpp();
      const i = Number(el.dataset.i);
      dra = { id: e.pointerId, start: i, maler: false, verdi: sp.m[i] === 1 ? 0 : 1, endringer: [], sett: new Set([i]) };
      try {
        brett.setPointerCapture(e.pointerId);
      } catch (x) {
        /* ignore */
      }
    };
    const mal = (sp, i) => {
      if (dra.sett.has(i) && i !== dra.start) return;
      dra.sett.add(i);
      if (sp.m[i] === 2 || sp.m[i] === dra.verdi || (dra.verdi === 1 && sp.m[i] !== 0)) return;
      dra.endringer.push([i, sp.m[i]]);
      sp.m[i] = dra.verdi;
    };
    const flytt = (e) => {
      if (!dra || e.pointerId !== dra.id) return;
      const sp = aktiv(R.S);
      if (!kanSpille(sp)) return;
      const i = celleUnder(e.clientX, e.clientY);
      if (i < 0 || (i === dra.start && !dra.maler) || (dra.sett.has(i) && i !== dra.start)) return;
      if (!dra.maler) {
        dra.maler = true;
        mal(sp, dra.start);
      }
      mal(sp, i);
      sp.valgt = i;
      R.lyd.tone(dra.verdi ? 760 : 520, 0, 0.03, "triangle", 0.05);
      oppdater(R.S);
    };
    const opp = (e) => {
      if (!dra || e.pointerId !== dra.id) return;
      const d = dra;
      dra = null;
      const S2 = R.S;
      const sp = aktiv(S2);
      if (!sp) return;
      if (d.maler) {
        endre(sp, d.endringer);
        if (d.endringer.length) R.si(d.verdi ? R.t("{n} prikk satt.|{n} prikker satt.", { n: d.endringer.length }) : R.t("{n} prikk fjernet.|{n} prikker fjernet.", { n: d.endringer.length }));
        oppdater(S2);
        R.lagre();
      } else if (e.type === "pointerup") syklus(S2, d.start);
    };
    const avbryt = (e) => {
      if (dra && dra.maler && e.pointerId === dra.id) opp(e);
      dra = null;
    };
    // Keyboard (Enter/Space on a focused cell) cycles it too.
    const klikk = (e) => {
      const el = e.target.closest(".sk-celle");
      if (el && e.detail === 0) syklus(R.S, Number(el.dataset.i));
    };
    const fokusInn = (e) => {
      const el = e.target.closest(".sk-celle");
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
    brett.addEventListener("pointermove", flytt);
    brett.addEventListener("pointerup", opp);
    brett.addEventListener("pointercancel", avbryt);
    brett.addEventListener("click", klikk);
    brett.addEventListener("focusin", fokusInn);
    brett.addEventListener("contextmenu", nei);
    R.vedForlat(() => {
      dra = null;
      brett.removeEventListener("pointerdown", ned);
      brett.removeEventListener("pointermove", flytt);
      brett.removeEventListener("pointerup", opp);
      brett.removeEventListener("pointercancel", avbryt);
      brett.removeEventListener("click", klikk);
      brett.removeEventListener("focusin", fokusInn);
      brett.removeEventListener("contextmenu", nei);
    });
  }

  // Keyboard: arrows move, Space/Enter cycle, S star, X dot, Backspace/Delete clear,
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
    } else if (lav === "s") {
      e.preventDefault();
      sett(S, sp.valgt, sp.m[sp.valgt] === 2 ? 0 : 2);
    } else if (lav === "x" || k === ".") {
      e.preventDefault();
      sett(S, sp.valgt, sp.m[sp.valgt] === 1 ? 0 : 1);
    } else if (k === "Backspace" || k === "Delete") {
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
  const fastSide = (pa) => document.documentElement.classList.toggle("sk-fast", !!pa);

  // ---------- Small pieces of the screens ----------

  const kalender = (tekst) => `<span class="sk-kal" aria-hidden="true"><small>${esc(datoFmt(tekst, { month: "short" }).replace(".", "").slice(0, 3))}</small><b>${Number(tekst.slice(8, 10))}</b></span>`;
  const storIkon = (n) => `<span class="sk-styrke" aria-hidden="true">${[6, 7, 8, 9, 10].map((k) => `<i class="${k <= n ? "pa" : ""}"></i>`).join("")}</span>`;
  function miniBrett(sp) {
    let html = "";
    for (let i = 0; i < sp.n * sp.n; i++) html += `<i class="sk-f${sp.felt[i]}${kanter(sp, i)}">${sp.m[i] === 2 ? "★" : ""}</i>`;
    return `<div class="sk-mini" aria-hidden="true" style="--n:${sp.n}">${html}</div>`;
  }

  function gyldigSpill(sp, dag) {
    if (!sp || typeof sp !== "object") return false;
    if (dag ? typeof sp.dagens !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sp.dagens) || !Number.isInteger(sp.dagNr) : sp.dagens != null) return false;
    const n = sp.n;
    if (!STR.includes(n) && !(dag && M.DAGLIG[n])) return false;
    if (!Array.isArray(sp.felt) || sp.felt.length !== n * n || !sp.felt.every((g) => Number.isInteger(g) && g >= 0 && g < n)) return false;
    if (!Array.isArray(sp.losning) || sp.losning.length !== n || !sp.losning.every((c) => Number.isInteger(c) && c >= 0 && c < n)) return false;
    if (!Array.isArray(sp.m) || sp.m.length !== n * n) return false;
    sp.m = sp.m.map((v) => (v === 1 || v === 2 ? v : 0));
    sp.hint = Array.isArray(sp.hint) ? sp.hint.filter((i) => Number.isInteger(i) && sp.m[i] === 2) : [];
    sp.angre = Array.isArray(sp.angre) ? sp.angre.filter((s) => Array.isArray(s) && s.every((x) => Array.isArray(x) && Number.isInteger(x[0]) && x[0] >= 0 && x[0] < n * n)) : [];
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
    id: "stjernekikkeren",
    versjon: 1,
    pagar: (S) => iGang(S.fri) || iGang(dagensSpill(S)),

    tilstand: () => ({
      oppsett: { n: 8 },
      autoPrikk: true,
      rekorder: {},
      daglig: { dager: {}, rekke: 0, beste: 0, sistNr: 0 },
      fri: null,
      dag: null,
      modus: "fri",
    }),

    lastet(S) {
      S.oppsett = { n: STR.includes(S.oppsett && S.oppsett.n) ? S.oppsett.n : 8 };
      S.autoPrikk = S.autoPrikk !== false;
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

    // rusj.no/stjernekikkeren/#dagens (the front page's «I dag») opens today's puzzle – or its result.
    vedHash: (S, hash) => (hash === "dagens" ? apneDagens(S) : null),

    regler: {
      intro: R.t("Sett én stjerne i hver rad, hver kolonne og hvert felt på himmelen. Stjernene får ikke røre hverandre – heller ikke på skrå."),
      steg: [
        [R.t("Trykk for å merke"), R.t("Ett trykk setter en prikk der det ikke kan stå en stjerne. Neste trykk setter en stjerne, og det tredje tømmer ruta.")],
        [R.t("Dra for prikker"), R.t("Dra fingeren over flere ruter for å prikke dem ut på én gang.")],
        [R.t("Ingen naboer"), R.t("To stjerner i samme rad, kolonne eller felt – eller som rører hverandre – blir merket med et utropstegn.")],
      ],
      tips: [
        R.t("Begynn med de minste feltene. Der er det færrest plasser å velge mellom."),
        R.t("Ligger et helt felt i én rad, må radens stjerne stå i det feltet. Da kan du prikke ut resten av raden."),
        R.t("Med Autoprikk på viser brettet selv, med svake prikker, hvor stjernene dine stenger for andre stjerner."),
        R.t("Feltene har egen farge, eget mønster og tykke kanter, så du ser dem uten å skille fargene."),
        R.t("Står du fast? Du har tre hint per brett. Hvert brett har bare én løsning, så du trenger aldri gjette."),
        R.t("Dagens stjernehimmel er den samme for alle: liten på mandag, stor i helgen."),
        R.t("Med tastatur: piltaster flytter, mellomrom merker, S setter stjerne, X setter prikk, Backspace tømmer, H gir hint og P er pause."),
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
          const lenker = R.ui.lenkerad(R.ui.lenke(fri ? R.t("Nytt spill") : R.t("Bytt størrelse"), "bytt"), regler);
          let knapper;
          if (!lost) {
            const n = M.dagligStorrelse(d.nr);
            const under = dag && dag.m.some(Boolean) ? `${storrelse(dag.n)} · ${visTid(dag.tid)}` : `${stor(ukedag(d.tekst))} · ${storrelse(n)}${r > 0 ? ` · 🔥 ${R.t("{dager} på rad", { dager: R.flertall(r, "dag", "dager") })}` : ""}`;
            knapper =
              R.ui.knapp("", "dagens", {
                variant: "stor",
                tekstHtml: `${kalender(d.tekst)}<span class="sk-dagknapp"><b>${esc(dag && dag.m.some(Boolean) ? R.t("Fortsett dagens") : R.t("Dagens stjernehimmel"))}</b><small>${esc(under)}</small></span>`,
              }) +
              R.ui.knapp2(friTekst, friH) +
              lenker;
          } else {
            knapper =
              R.ui.knapp(friTekst, friH) +
              `<p class="sk-daglinje">✓ ${esc(R.t("Dagens stjernehimmel: {tid}", { tid: visTid(lost.sek * 1000) }))}${r > 1 ? ` · 🔥 ${esc(R.t("{n} dager på rad", { n: r }))}` : ""}</p>` +
              R.ui.lenkerad(R.ui.lenke(R.t("Se resultatet"), "dagens"), R.ui.lenke(fri ? R.t("Nytt spill") : R.t("Bytt størrelse"), "bytt"), regler) +
              nedtellingHtml();
          }
          const rek = STR.filter((n) => S.rekorder[n]).map((n) => `<li><b>${storrelse(n)}</b> ${visTid(S.rekorder[n].tid * 1000)}<small> · ${esc(R.flertall(S.rekorder[n].antall, "brett", "brett"))}</small></li>`);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Én stjerne i hver rad, kolonne og felt."))}<br><em>${esc(R.t("Og ingen stjerner rører hverandre."))}</em>`,
              knapperHtml: knapper,
              merker: [
                ["6–10", R.t("størrelser")],
                ["1", R.t("ny hver dag")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="sk-rekorder" aria-label="${esc(R.t("Dine beste tider"))}"><p class="etikett">${esc(R.t("Dine beste tider"))}</p><ul>${rek.join("")}</ul></section>` : "")
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
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor stor himmel?"))}</h2></div>
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
            <h1 class="vh" id="skjerm-tittel">${esc(sp.dagens ? R.t("Dagens stjernehimmel") : R.t("Stjernekikkeren, {str}", { str: storrelse(sp.n) }))}</h1>
            <div class="sk-spill${sp.pause ? " pauset" : ""}">
              <div class="sk-topp">${hudHtml(S, sp)}</div>
              <div class="sk-flate">
                <div class="sk-midt">
                  <div class="sk-brett" role="group" aria-label="${esc(R.t("Himmelen, {n} ganger {n} ruter", { n: sp.n }))}" style="--n:${sp.n}">${brettHtml(sp)}</div>
                  <div class="sk-under"><p class="sk-tips" aria-hidden="true">${esc(R.t("Trykk én gang for prikk, to ganger for stjerne."))}</p><p class="sk-melding" role="status"></p></div>
                </div>
                <div class="sk-pauseboks"${sp.pause ? "" : " hidden"}>
                  <div class="sk-pausekort">
                    <p class="etikett">${esc(R.t("Pause"))}</p>
                    <p class="sk-pausetekst">${esc(R.t("Himmelen venter på deg."))}</p>
                    ${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}
                  </div>
                </div>
              </div>
              <div class="sk-plass"></div>
              ${R.ui.dokk(verktoyHtml(S, sp))}
            </div>`;
        },
        etter(S, rot) {
          bindBrett(S, rot);
          oppdater(S);
          tilpass();
          const flate = R.$(".sk-flate", rot);
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
          const tall = `<div class="sk-resultat">
              <div class="sk-tall-boks${r.nyRekord ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>${esc(R.t("tid"))}</span>${r.nyRekord ? `<i class="sk-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="sk-tall-boks"><b>${r.hint}</b><span>${esc(R.t("hint brukt|hint brukt", { n: r.hint }))}</span></div>
            </div>`;
          if (sp.dagens) {
            const idag = sp.dagens === R.dag().tekst;
            const linje = r.dagForrige ? R.t("Du løste dagens stjernehimmel på {tid} første gang.", { tid: visTid(r.dagForrige * 1000) }) : r.hint ? R.t("Alle i hele landet får den samme himmelen i dag.") : R.t("Uten hint! Alle i hele landet får den samme himmelen i dag.");
            return `
              ${R.ui.banner({ etikett: `${R.t("{navn} nr. {nr}", { navn: NAVN(), nr: nrFor(sp.dagNr) })} · ${datoTekst(sp.dagens)}`, tittel: R.t("Godt jobba!"), klasse: "aksent" })}
              ${tall}
              <p class="hjelp">${esc(linje)}</p>
              <div class="sk-dagboks">
                ${r.rekke ? `<p class="sk-rekke"><span aria-hidden="true">🔥</span> ${esc(R.t("{dager} på rad", { dager: R.flertall(r.rekke, "dag", "dager") }))}</p>` : ""}
                ${idag ? nedtellingHtml() : `<p class="sk-nedtelling"><b>${esc(R.t("En ny stjernehimmel er klar!"))}</b></p>`}
              </div>
              ${miniBrett(sp)}
              ${R.ui.flereSpill({ antall: 1 })}
              ${idag ? R.ui.dokk(R.ui.knapp(R.t("Del resultatet"), "del"), R.ui.lenkerad(R.ui.lenke(R.t("Spill fritt"), "fri"), alle)) : R.ui.dokk(R.ui.knapp(R.t("Dagens stjernehimmel"), "dagens"), R.ui.lenkerad(alle))}`;
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
        S.oppsett.n = STR.includes(n) ? n : 8;
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
      auto(el, e, S) {
        S.autoPrikk = !S.autoPrikk;
        R.lyd.klikk();
        oppdater(S);
        R.si(S.autoPrikk ? R.t("Autoprikk er på.") : R.t("Autoprikk er av."));
        R.lagre();
      },
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
        const tekst = `⭐ ${tittel} · ${storrelse(best.n || sp.n)} · ${tid} · ${hint}${dager ? ` · ${dager}` : ""}. ${R.t("Klarer du dagens stjernehimmel?")}`;
        const linjer = [tid, `${storrelse(best.n || sp.n)} · ${hint}`];
        if (dager) linjer.push(dager);
        R.del(R.t("{navn} – dagens stjernehimmel", { navn: NAVN() }), tekst, ADRESSE + "#utfordring", { kort: { tittel, linjer } });
      },
    }),
  });

  // For the tests and curious minds: the engine is also reachable from the console.
  window.Stjernekikkeren = motor;
})();
