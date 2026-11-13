/* Sporhunden — «Dagens spor»: a 6 × 7 grid of letters hides the day's theme words. They fill the
   grid completely, never share a letter and never cross each other. One of them, the «nøkkelord»,
   names the theme and reaches from one side of the grid to the other. Trace a word through
   neighbouring letters (sideways, up, down and on the slant) by dragging a finger, by tapping the
   letters one by one (tap the last one again, or «Prøv»), or with the keyboard. Other real words of
   four letters or more are not theme words, but every third one earns a hint.
   «Ordleting» is the classic word search for the family: a theme, a list of words, and the words
   hidden in straight lines among random letters.
   The daily grids are made and checked in advance (data/spor.json, build/sporhunden/lag-spor.mjs,
   using the engine below): every theme word fits along exactly one path, the grid is fully used,
   and no other word of the theme can be traced by accident. The words that earn hints are listed
   in data/spor.json («ekstra»): the dictionary words that can be traced in at least one daily grid,
   never a whole dictionary. The themes are written by hand per edition (data/temaer.json).
   The engine at the top has no kit and no data of its own, so test/sporhunden.test.mjs and the
   build script can load this file in node:vm (window.Sporhunden). */
(function () {
  "use strict";

  // ---------- Engine (pure) ----------

  const Rt = { t: (s, v) => (typeof window !== "undefined" && window.Rusj && window.Rusj.t ? window.Rusj.t(s, v) : String(s).replace(/\{(\w+)\}/g, (h, k) => (v && k in v ? String(v[k]) : h))) };

  // FROZEN: «Sporhunden nr. 1» is 13 November 2026 (data/spor.json «dagens»[0]).
  const FORSTE = Math.floor(Date.UTC(2026, 10, 13) / 86400000);
  const BREDDE = 6;
  const HOYDE = 7;
  const N = BREDDE * HOYDE;
  const TEGN = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL"; // a cell index as one character
  const MIN_ORD = 4;
  const HINT_PER = 3; // extra words per hint

  const indeksFor = (nr, antall) => ((((nr - FORSTE) % antall) + antall) % antall);
  const nrFor = (nr) => nr - FORSTE + 1;
  const bokstaver = (o) => Array.from(String(o || ""));
  const rens = (o) => bokstaver(String(o).toLocaleLowerCase("nb")).filter((b) => /\p{L}/u.test(b)).join("");
  const tilSti = (s) => Array.from(s).map((t) => TEGN.indexOf(t));
  const fraSti = (sti) => sti.map((i) => TEGN[i]).join("");

  function naboer(i, b = BREDDE, h = HOYDE) {
    const r = Math.floor(i / b);
    const c = i % b;
    const ut = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < h && cc >= 0 && cc < b) ut.push(rr * b + cc);
      }
    return ut;
  }
  const NABO = Array.from({ length: N }, (_, i) => naboer(i));
  const erNabo = (a, b, br = BREDDE) => a !== b && Math.abs(Math.floor(a / br) - Math.floor(b / br)) <= 1 && Math.abs((a % br) - (b % br)) <= 1;
  const lenke = (a, b) => (a < b ? a + "-" + b : b + "-" + a);
  // A slanting step a→b crosses the other diagonal of the same 2 × 2 square.
  function krysser(a, b, lenker, br = BREDDE) {
    const ra = Math.floor(a / br);
    const ca = a % br;
    const rb = Math.floor(b / br);
    const cb = b % br;
    if (ra === rb || ca === cb) return false;
    return lenker.has(lenke(ra * br + cb, rb * br + ca));
  }

  function mulberry32(a) {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stokk(liste, tilf) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(tilf() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // In how many places a word can be traced in a grid: paths over the same cells in another order
  // count as one place (the player marks the same letters). Stops at «maks».
  function antallStier(celler, ord, maks = 2, br = BREDDE, h = HOYDE) {
    const b = bokstaver(ord);
    const nab = br === BREDDE && h === HOYDE ? NABO : Array.from({ length: br * h }, (_, i) => naboer(i, br, h));
    const steder = new Set();
    const sti = [];
    const brukt = new Uint8Array(celler.length);
    const gaa = (i, k) => {
      if (steder.size >= maks) return;
      sti.push(i);
      if (k === b.length - 1) steder.add(sti.slice().sort((x, y) => x - y).join(","));
      else {
        brukt[i] = 1;
        for (const j of nab[i]) if (!brukt[j] && celler[j] === b[k + 1]) gaa(j, k + 1);
        brukt[i] = 0;
      }
      sti.pop();
    };
    for (let i = 0; i < celler.length && steder.size < maks; i++) if (celler[i] === b[0]) gaa(i, 0);
    return steder.size;
  }
  const sammeCeller = (a, b) => a.length === b.length && a.slice().sort((x, y) => x - y).join(",") === b.slice().sort((x, y) => x - y).join(",");

  // Can the empty regions be filled exactly by the remaining word lengths?
  function regioner(grid) {
    const sett = new Int16Array(N).fill(-1);
    const st = [];
    for (let i = 0; i < N; i++) {
      if (grid[i] !== -1 || sett[i] !== -1) continue;
      let n = 0;
      const ko = [i];
      sett[i] = st.length;
      while (ko.length) {
        const x = ko.pop();
        n++;
        for (const y of NABO[x]) if (grid[y] === -1 && sett[y] === -1) (sett[y] = st.length), ko.push(y);
      }
      st.push(n);
    }
    return st;
  }
  function kanFordele(storrelser, lengder) {
    if (!lengder.length) return storrelser.every((s) => s === 0);
    const min = Math.min(...lengder);
    if (storrelser.some((s) => s > 0 && s < min)) return false;
    const l = lengder.slice().sort((a, b) => b - a);
    const cap = storrelser.slice();
    const gaa = (k) => {
      if (k === l.length) return cap.every((c) => c === 0);
      const sett = new Set();
      for (let r = 0; r < cap.length; r++) {
        if (cap[r] < l[k] || sett.has(cap[r])) continue;
        sett.add(cap[r]);
        cap[r] -= l[k];
        const ok = (cap[r] === 0 || cap[r] >= l[l.length - 1]) && gaa(k + 1);
        cap[r] += l[k];
        if (ok) return true;
      }
      return false;
    };
    return gaa(0);
  }

  // A random subset of the theme's words whose letters add up to «sum» exactly.
  function velgUtvalg(pulje, sum, tilf, min = 4, maks = 10) {
    const kand = stokk(pulje.filter((o) => bokstaver(o).length >= MIN_ORD && bokstaver(o).length <= 9), tilf);
    const valgt = [];
    let noder = 0;
    const gaa = (fra, rest) => {
      if (++noder > 4000) return false;
      if (rest === 0) return valgt.length >= min;
      if (valgt.length >= maks) return false;
      for (let i = fra; i < kand.length; i++) {
        const n = bokstaver(kand[i]).length;
        if (n > rest || (rest - n > 0 && rest - n < MIN_ORD)) continue;
        if (valgt.some((v) => v.includes(kand[i]) || kand[i].includes(v))) continue; // never one word inside another
        valgt.push(kand[i]);
        if (gaa(i + 1, rest - n)) return true;
        valgt.pop();
      }
      return false;
    };
    return gaa(0, sum) ? valgt.slice() : null;
  }

  // Lay the key word out from one side of the grid to the other, then fill the rest.
  function plasser(nokkel, ordene, tilf, noderMaks = 30000) {
    const grid = new Int16Array(N).fill(-1); // which word owns a cell
    const celler = new Array(N).fill("");
    const lenker = new Set();
    const stier = [];
    let noder = 0;
    const legg = (w, sti, b) => {
      sti.forEach((c, k) => {
        grid[c] = w;
        celler[c] = b[k];
        if (k) lenker.add(lenke(sti[k - 1], c));
      });
      stier[w] = sti;
    };
    const ta = (w, sti) => {
      sti.forEach((c, k) => {
        grid[c] = -1;
        celler[c] = "";
        if (k) lenker.delete(lenke(sti[k - 1], c));
      });
      stier[w] = null;
    };
    // Random self-avoiding paths of length L from cell «fra» through empty cells, never crossing.
    function stierFra(fra, L, antall, krav) {
      const ut = [];
      const sti = [fra];
      const egne = new Set();
      let bud = 400;
      const gaa = () => {
        if (ut.length >= antall || --bud < 0) return;
        if (sti.length === L) {
          if (!krav || krav(sti)) ut.push(sti.slice());
          return;
        }
        const siste = sti[sti.length - 1];
        for (const j of stokk(NABO[siste], tilf)) {
          if (grid[j] !== -1 || sti.includes(j)) continue;
          if (krysser(siste, j, lenker) || krysser(siste, j, egne)) continue;
          if (krav && krav.underveis && !krav.underveis(sti, j, L)) continue;
          sti.push(j);
          egne.add(lenke(siste, j));
          gaa();
          egne.delete(lenke(siste, j));
          sti.pop();
          if (ut.length >= antall) return;
        }
      };
      if (grid[fra] === -1) gaa();
      return ut;
    }
    // The key word: across (touching the left and right sides) or, when long enough, down.
    const K = bokstaver(nokkel);
    const ned = K.length >= HOYDE && tilf() < 0.4;
    const akse = (i) => (ned ? Math.floor(i / BREDDE) : i % BREDDE);
    const ende = ned ? HOYDE - 1 : BREDDE - 1;
    const krav = (sti) => sti.some((i) => akse(i) === ende);
    krav.underveis = (sti, j, L) => {
      const naadd = sti.some((i) => akse(i) === ende) || akse(j) === ende;
      return naadd || ende - akse(j) <= L - sti.length - 1;
    };
    const starter = stokk(Array.from({ length: N }, (_, i) => i).filter((i) => akse(i) === 0), tilf);
    let nokkelSti = null;
    for (const s of starter) {
      const kand = stierFra(s, K.length, 3, krav);
      for (const sti of kand) {
        const lest = tilf() < 0.5 ? sti : sti.slice().reverse();
        legg(0, lest, K);
        if (kanFordele(regioner(grid), ordene.map((o) => bokstaver(o).length))) {
          nokkelSti = lest;
          break;
        }
        ta(0, lest);
      }
      if (nokkelSti) break;
    }
    if (!nokkelSti) return null;
    const rest = ordene.map((o, i) => i + 1);
    const B = [null, ...ordene.map(bokstaver)];
    function fyll(igjen) {
      if (!igjen.length) return true;
      if (++noder > noderMaks) return false;
      let best = -1;
      let bestN = 99;
      for (let i = 0; i < N; i++) {
        if (grid[i] !== -1) continue;
        let n = 0;
        for (const j of NABO[i]) if (grid[j] === -1) n++;
        if (n < bestN || (n === bestN && tilf() < 0.3)) (best = i), (bestN = n);
      }
      const provd = new Set();
      for (const w of stokk(igjen, tilf)) {
        const L = B[w].length;
        if (provd.has(B[w].join(""))) continue;
        provd.add(B[w].join(""));
        const andre = igjen.filter((x) => x !== w);
        for (const sti of stierFra(best, L, 6)) {
          const lest = tilf() < 0.5 ? sti : sti.slice().reverse();
          legg(w, lest, B[w]);
          if (kanFordele(regioner(grid), andre.map((x) => B[x].length)) && fyll(andre)) return true;
          ta(w, lest);
          if (noder > noderMaks) return false;
        }
      }
      return false;
    }
    if (!fyll(rest)) return null;
    return { celler: celler.slice(), ord: [nokkel, ...ordene], stier: stier.map((s) => s.slice()) };
  }

  // What is wrong with one finished grid (an empty list when it is fine).
  function sjekkSpor(spor, pulje = []) {
    const feil = [];
    const { celler, ord, stier } = spor;
    if (!Array.isArray(celler) || celler.length !== N || celler.some((b) => bokstaver(b).length !== 1)) return ["rutenettet er ikke 6 × 7 bokstaver"]; // sprak-ok (the unit test's own words)
    const brukt = new Array(N).fill(0);
    ord.forEach((o, w) => {
      const sti = stier[w];
      const b = bokstaver(o);
      if (!sti || sti.length !== b.length) return feil.push(`«${o}» har feil lengde på stien`); // sprak-ok
      if (b.length < MIN_ORD) feil.push(`«${o}» er kortere enn fire bokstaver`); // sprak-ok
      sti.forEach((c, k) => {
        brukt[c]++;
        if (celler[c] !== b[k]) feil.push(`«${o}»: bokstav ${k + 1} stemmer ikke`); // sprak-ok
        if (k && !erNabo(sti[k - 1], c)) feil.push(`«${o}»: bokstav ${k} og ${k + 1} er ikke naboer`); // sprak-ok
      });
    });
    if (brukt.some((n) => n !== 1)) feil.push("ikke alle ruter er brukt nøyaktig én gang"); // sprak-ok
    // No two paths cross on the slant.
    const lenker = new Set();
    stier.forEach((sti) => sti.forEach((c, k) => k && lenker.add(lenke(sti[k - 1], c))));
    stier.forEach((sti, w) => sti.forEach((c, k) => k && krysser(sti[k - 1], c, lenker) && feil.push(`«${ord[w]}» krysser et annet ord`))); // sprak-ok
    // The key word reaches across or down.
    const k0 = stier[0] || [];
    const tvers = k0.some((i) => i % BREDDE === 0) && k0.some((i) => i % BREDDE === BREDDE - 1);
    const ned = k0.some((i) => i < BREDDE) && k0.some((i) => i >= N - BREDDE);
    if (!tvers && !ned) feil.push(`nøkkelordet «${ord[0]}» går ikke fra side til side`); // sprak-ok
    const med = new Set(ord.map(rens));
    for (const o of pulje) if (!med.has(rens(o)) && bokstaver(rens(o)).length > MIN_ORD && !ord.some((x) => x.includes(rens(o)) || rens(o).includes(x)) && antallStier(celler, rens(o), 1) > 0) feil.push(`temaordet «${o}» kan spores ved et uhell`); // sprak-ok
    return feil;
  }
  // How many of the words can also be traced over other cells (the game still counts such a word
  // and lights up its own cells; the build keeps this as low as it can, at most two).
  const tvetydige = (spor) => spor.ord.filter((o) => antallStier(spor.celler, o) > 1).length;
  const MAKS_TVETYDIGE = 2;

  // Makes one checked grid for a theme (the build script). tema: { k: [key words], o: [words] }.
  function lagSpor(tema, fro, forsok = 80) {
    const tilf = mulberry32(fro);
    const nokler = tema.k.map(rens).filter((k) => bokstaver(k).length >= BREDDE && bokstaver(k).length <= 16);
    if (!nokler.length) return null;
    const pulje = [...new Set(tema.o.map(rens))].filter((o) => !nokler.includes(o));
    const alle = [...tema.k, ...tema.o].map(rens);
    let best = null;
    for (let n = 0; n < forsok; n++) {
      const nokkel = nokler[n % nokler.length];
      const ingen = pulje.filter((o) => !o.includes(nokkel) && !nokkel.includes(o));
      const utvalg = velgUtvalg(ingen, N - bokstaver(nokkel).length, tilf);
      if (!utvalg) continue;
      const spor = plasser(nokkel, utvalg, tilf);
      if (!spor) continue;
      // The same paths, each word read one way or the other: often one of them has no second
      // way to trace any word.
      const k = spor.ord.length;
      const masker = stokk(Array.from({ length: Math.min(1 << k, 512) }, (_, i) => i), tilf);
      for (const m of masker) {
        const stier = spor.stier.map((s, w) => ((m >> w) & 1 ? s.slice().reverse() : s.slice()));
        const celler = new Array(N).fill("");
        stier.forEach((s, w) => s.forEach((c, i) => (celler[c] = bokstaver(spor.ord[w])[i])));
        const variant = { celler, ord: spor.ord, stier };
        if (sjekkSpor(variant, alle).length) continue;
        const t = tvetydige(variant);
        if (!best || t < best.t) best = { t, variant };
        if (t === 0) return variant;
      }
      if (best && best.t <= 1) return best.variant;
    }
    return best && best.t <= MAKS_TVETYDIGE ? best.variant : null;
  }

  // A traced path: the word it spells, and whether it is one of the theme words (its index).
  // A theme word counts when the traced letters spell it over its own cells (in any order of them).
  const lesSti = (celler, sti) => sti.map((i) => celler[i]).join("");
  function finnTemaord(spor, sti, funnet = []) {
    const tekst = lesSti(spor.celler, sti);
    const egen = spor.stier.findIndex((s, w) => spor.ord[w] === tekst && sammeCeller(s, sti));
    if (egen >= 0) return egen;
    // The right word over other cells: the dog follows the scent to the word's own cells.
    return spor.ord.findIndex((o, w) => o === tekst && !funnet.includes(w));
  }

  // ---------- The classic word search ----------

  const RETNINGER = {
    lett: [[0, 1], [1, 0]],
    middels: [[0, 1], [1, 0], [1, 1], [-1, 1]],
    vrien: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]],
  };
  const STORRELSE = { lett: 8, middels: 9, vrien: 10 };
  const ANTALL = { lett: 7, middels: 9, vrien: 11 };

  // The cells from a to b when they are on one straight line (any of the eight directions).
  function linje(a, b, str) {
    const ra = Math.floor(a / str);
    const ca = a % str;
    const rb = Math.floor(b / str);
    const cb = b % str;
    const dr = Math.sign(rb - ra);
    const dc = Math.sign(cb - ca);
    if (a === b) return [a];
    if (ra !== rb && ca !== cb && Math.abs(rb - ra) !== Math.abs(cb - ca)) return null;
    const ut = [];
    for (let r = ra, c = ca; ; r += dr, c += dc) {
      ut.push(r * str + c);
      if (r === rb && c === cb) break;
    }
    return ut;
  }
  // How many times a word stands in a straight line (both ways) in a square grid.
  function forekomster(celler, ord, str) {
    const b = bokstaver(ord);
    let n = 0;
    for (let i = 0; i < celler.length; i++) {
      if (celler[i] !== b[0]) continue;
      for (const [dr, dc] of RETNINGER.vrien) {
        let ok = true;
        for (let k = 1; k < b.length && ok; k++) {
          const r = Math.floor(i / str) + dr * k;
          const c = (i % str) + dc * k;
          ok = r >= 0 && r < str && c >= 0 && c < str && celler[r * str + c] === b[k];
        }
        if (ok) n++;
      }
    }
    // A palindrome is found twice in the same place.
    return b.join("") === b.slice().reverse().join("") ? n / 2 : n;
  }

  // A word search: the words in straight lines, the other cells filled with letters of the
  // theme's own words (so the filler looks like the words). Every placed word stands there once.
  function lagLeting(ordene, niva, tilf, alfabet) {
    const str = STORRELSE[niva];
    const retn = RETNINGER[niva];
    const kand = [...new Set(ordene.map(rens))].filter((o) => bokstaver(o).length >= 3 && bokstaver(o).length <= str);
    // Never a word inside another one (it would be found twice).
    const ok = kand.filter((o) => !kand.some((x) => x !== o && (x.includes(o) || x.includes(bokstaver(o).reverse().join("")))));
    const valgt = stokk(ok, tilf).slice(0, ANTALL[niva]).sort((a, b) => bokstaver(b).length - bokstaver(a).length);
    for (let forsok = 0; forsok < 40; forsok++) {
      const celler = new Array(str * str).fill("");
      const plass = [];
      for (const o of valgt) {
        const b = bokstaver(o);
        let lagt = false;
        for (let n = 0; n < 300 && !lagt; n++) {
          const [dr, dc] = retn[Math.floor(tilf() * retn.length)];
          const r0 = Math.floor(tilf() * str);
          const c0 = Math.floor(tilf() * str);
          const r1 = r0 + dr * (b.length - 1);
          const c1 = c0 + dc * (b.length - 1);
          if (r1 < 0 || r1 >= str || c1 < 0 || c1 >= str) continue;
          let passer = true;
          for (let k = 0; k < b.length && passer; k++) {
            const x = celler[(r0 + dr * k) * str + c0 + dc * k];
            passer = !x || x === b[k];
          }
          if (!passer) continue;
          for (let k = 0; k < b.length; k++) celler[(r0 + dr * k) * str + c0 + dc * k] = b[k];
          plass.push({ o, a: r0 * str + c0, b: r1 * str + c1 });
          lagt = true;
        }
      }
      const fyllbok = bokstaver(valgt.join("") + alfabet);
      for (let f = 0; f < 8; f++) {
        const fylt = celler.map((x) => x || fyllbok[Math.floor(tilf() * fyllbok.length)]);
        if (plass.every((p) => forekomster(fylt, p.o, str) === 1) && plass.length >= Math.min(valgt.length, ANTALL[niva] - 2)) return { str, niva, celler: fylt, plass };
      }
    }
    return null;
  }

  // How many of a theme's words fit a word search of this level (none inside another one).
  function passerLeting(tema, niva) {
    const str = STORRELSE[niva];
    const kand = [...new Set([...tema.k, ...tema.o].map(rens))].filter((o) => bokstaver(o).length >= 3 && bokstaver(o).length <= str);
    return kand.filter((o) => !kand.some((x) => x !== o && (x.includes(o) || x.includes(bokstaver(o).reverse().join(""))))).length;
  }

  const MOTOR = { passerLeting, FORSTE, BREDDE, HOYDE, N, TEGN, MIN_ORD, HINT_PER, STORRELSE, ANTALL, RETNINGER, indeksFor, nrFor, rens, tilSti, fraSti, naboer, erNabo, krysser, antallStier, sammeCeller, tvetydige, MAKS_TVETYDIGE, regioner, kanFordele, velgUtvalg, plasser, sjekkSpor, lagSpor, lesSti, finnTemaord, linje, forekomster, lagLeting, mulberry32, stokk };

  const R = typeof window !== "undefined" ? window.Rusj : null;
  if (!R) {
    window.Sporhunden = MOTOR;
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const D = window.RUSJ_DATA;
  const DAGER = D.spor.dagens;
  const ANTALL_DAGER = DAGER.length;
  const EKSTRA = new Set(D.spor.ekstra.split(" "));
  const TEMAER = D.temaer.temaer;
  const NAVN = (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Sporhunden"; // sprak-ok
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "sporhunden") + "/";
  const ALFABET = R.sprak === "en" ? "abcdefghijklmnopqrstuvwxyz" : "abcdefghijklmnopqrstuvwxyzæøå"; // sprak-ok (letters)
  const stor = (o) => String(o).toLocaleUpperCase(R.lokale || "nb");
  const NIVANAVN = { lett: R.t("Lett"), middels: R.t("Middels"), vrien: R.t("Vrien") };
  const FARGER = ["mynte", "himmel", "lampe", "lilla", "oransje", "rosa"];

  let H;
  let valg = []; // the cells being traced (not saved)
  let melding = null;
  let meldingId = null;
  let tikker = null;
  let nyFeiring = false;
  let opptatt = false;
  let peker = null; // a finger or a mouse on the grid: { start, beveget, id }
  let sistPeker = 0; // when the last pointer gesture ended (its click is not a second tap)
  let letStart = -1; // the word search: the first cell of a tap selection
  let letKlokke = null;

  const iDag = () => R.dag().nr;
  const sporFor = (nr) => {
    const d = DAGER[indeksFor(nr, ANTALL_DAGER)];
    const ord = d.o.map((x) => x.split(":")[0]);
    return { t: d.t, n: d.n || null, celler: Array.from(d.r), ord, stier: d.o.map((x) => tilSti(x.split(":")[1])) };
  };
  const aktiv = (S) => (S.modus === "ov" ? S.ov : S.dag);
  const ferdig = (sp) => !!(sp && (sp.lukket || sp.funnet.length === sporFor(sp.nr).ord.length));
  const iGang = (sp) => !!(sp && (sp.funnet.length || sp.ekstra.length) && !ferdig(sp));
  const pagar = (S) => (iGang(S.dag) && S.dag.nr === iDag()) || iGang(S.ov) || !!(S.leting && !S.leting.ferdig);
  const nyttSpill = (nr) => ({ nr, funnet: [], ekstra: [], hint: null, hintBrukt: 0, logg: [], lukket: false });
  const hintIgjen = (sp) => Math.floor(sp.ekstra.length / HINT_PER) - sp.hintBrukt;
  const hintMaler = (sp) => sp.ekstra.length - (sp.hintBrukt + hintIgjen(sp)) * HINT_PER; // 0–2 towards the next
  function nyttDagspill(S) {
    S.dag = nyttSpill(iDag());
    R.statistikk("start", { modus: "dag" });
  }
  function eldre() {
    const d = iDag();
    const liste = [];
    for (let nr = d - 1; nr >= Math.max(FORSTE, d - ANTALL_DAGER + 1); nr--) liste.push(nr);
    return liste;
  }
  // The theme's name in the word search: its first key word, with a capital letter.
  const temaNavn = (t) => {
    const k = t.k[0] || "";
    return k.charAt(0).toLocaleUpperCase(R.lokale || "nb") + k.slice(1);
  };

  // ---------- Statistics ----------

  const tall = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);
  const tomStat = () => ({ spilt: 0, vunnet: 0, utenHint: 0, rekke: 0, best: 0, sistVunnet: null, sistSpilt: null });
  const resTekst = (sp) => (!ferdig(sp) ? R.t("{n} av {av}", { n: sp.funnet.length, av: sporFor(sp.nr).ord.length }) : sp.lukket && sp.funnet.length < sporFor(sp.nr).ord.length ? R.t("Ikke funnet") : sp.hintBrukt ? R.t("{n} hint", { n: sp.hintBrukt }) : R.t("Uten hint"));
  function registrerDag(S, sp) {
    const st = S.stat;
    if (st.sistSpilt === sp.nr) return;
    const vunnet = !sp.lukket;
    st.sistSpilt = sp.nr;
    st.spilt += 1;
    if (vunnet) {
      st.vunnet += 1;
      if (!sp.hintBrukt) st.utenHint += 1;
      st.rekke = st.sistVunnet === sp.nr - 1 ? st.rekke + 1 : 1;
      st.sistVunnet = sp.nr;
      st.best = Math.max(st.best, st.rekke);
    } else st.rekke = 0;
    if (sp.nr === iDag()) R.dagligFerdig({ vunnet, rekke: vunnet ? st.rekke : 0, res: resTekst(sp) });
  }
  const rekkeNa = (S) => (S.stat.sistVunnet != null && S.stat.sistVunnet >= iDag() - 1 ? S.stat.rekke : 0);

  // ---------- Countdown to the next trail ----------

  function sekunderTilNy() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: R.tidssone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(na))
      .forEach((p) => (deler[p.type] = Number(p.value)));
    let igjen = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const dag = R.dag(new Date(na)).nr;
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const to = (n) => String(n).padStart(2, "0");
  const klokke = (s) => `${to(Math.floor(s / 3600))}:${to(Math.floor((s % 3600) / 60))}:${to(s % 60)}`;
  const nedtellingHtml = () => `<p class="sh-nedtelling">${esc(R.t("Nytt spor om"))} <b>${klokke(sekunderTilNy())}</b></p>`;
  function startNedtelling() {
    clearInterval(tikker);
    const dag = iDag();
    tikker = setInterval(() => {
      const el = R.$(".sh-nedtelling b");
      if (!el) return clearInterval(tikker);
      if (iDag() !== dag) {
        clearInterval(tikker);
        return R.vis();
      }
      el.textContent = klokke(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(tikker));
  }

  // ---------- The trail board ----------

  const senter = (i, br) => [(i % br) * 100 + 50, Math.floor(i / br) * 100 + 50];
  const linjeSvg = (sti, br, klasse) => (sti.length > 1 ? `<polyline class="${klasse}" points="${sti.map((i) => senter(i, br).join(",")).join(" ")}"/>` : sti.length === 1 ? `<circle class="${klasse}" cx="${senter(sti[0], br)[0]}" cy="${senter(sti[0], br)[1]}" r="1"/>` : "");

  // The traced word and its letters as one line («F R U K T», or the help text).
  function valgTekst(sp) {
    const sp2 = sporFor(sp.nr);
    if (!valg.length) return `<span class="sh-hjelpetekst">${esc(R.t("Dra eller trykk på bokstavene"))}</span>`;
    return `<span class="sh-ordet">${esc(stor(lesSti(sp2.celler, valg)))}</span>`;
  }
  function meldingHtml() {
    return melding ? `<span class="sh-varsel ${melding.klasse || ""}">${esc(melding.tekst)}</span>` : "";
  }
  function cellerFunnet(sp, spor) {
    const eier = new Array(N).fill(-1);
    for (const w of sp.funnet) spor.stier[w].forEach((c) => (eier[c] = w));
    if (sp.lukket) spor.stier.forEach((s, w) => !sp.funnet.includes(w) && s.forEach((c) => (eier[c] = w + 100)));
    return eier;
  }
  function brettHtml(S, sp) {
    const spor = sporFor(sp.nr);
    const eier = cellerFunnet(sp, spor);
    const hint = sp.hint && !sp.funnet.includes(sp.hint.w) ? spor.stier[sp.hint.w] : [];
    const knapper = spor.celler
      .map((b, i) => {
        const w = eier[i];
        const klasse = ["sh-celle", w === 0 || w === 100 ? "nokkel" : "", w >= 0 ? "funnet" : "", w >= 100 ? "avslort" : "", valg.includes(i) ? "valgt" : "", hint.includes(i) ? "hint" : ""].filter(Boolean).join(" ");
        const nr = sp.hint && sp.hint.rekke && hint.includes(i) ? hint.indexOf(i) + 1 : 0;
        const etikett = stor(b) + (w >= 0 ? ", " + (w === 0 || w === 100 ? R.t("nøkkelord") : R.t("funnet")) : valg.includes(i) ? ", " + R.t("valgt") : hint.includes(i) ? ", " + R.t("hint") : "");
        return `<button class="${klasse}" data-i="${i}" tabindex="${i === 0 ? 0 : -1}" aria-label="${esc(etikett)}"${w >= 0 ? ' aria-disabled="true"' : ""}><span>${esc(stor(b))}</span>${nr ? `<i aria-hidden="true">${nr}</i>` : ""}</button>`;
      })
      .join("");
    const linjer = sp.funnet.map((w) => linjeSvg(spor.stier[w], BREDDE, w === 0 ? "nokkel" : "funnet")).join("") + (sp.lukket ? spor.stier.map((s, w) => (sp.funnet.includes(w) ? "" : linjeSvg(s, BREDDE, "avslort"))).join("") : "") + `<g class="sh-valglinje">${linjeSvg(valg, BREDDE, "valgt")}</g>`;
    return `<div class="sh-rute" role="grid" aria-label="${esc(R.t("Bokstavene, seks ganger sju"))}" style="--br:${BREDDE};--ho:${HOYDE}">
        <svg class="sh-linjer" viewBox="0 0 ${BREDDE * 100} ${HOYDE * 100}" aria-hidden="true" focusable="false">${linjer}</svg>
        ${knapper}
      </div>`;
  }
  function temaHtml(sp) {
    const spor = sporFor(sp.nr);
    return `<div class="sh-tema">
        <span class="etikett">${esc(R.t("Dagens tema"))}</span>
        <b>${esc(spor.t)}</b>
        <span class="sh-fremdrift">${esc(R.t("{n} av {av} temaord", { n: sp.funnet.length, av: spor.ord.length }))}</span>
      </div>`;
  }
  function hintKnapp(sp) {
    const igjen = hintIgjen(sp);
    const aktivHint = sp.hint && !sp.funnet.includes(sp.hint.w);
    const kan = igjen > 0 && !(aktivHint && sp.hint.rekke);
    const tekst = aktivHint && !sp.hint.rekke ? R.t("Vis rekkefølgen") : R.t("Hint");
    const maler = hintMaler(sp);
    const merke = igjen > 0 ? `<b class="sh-hintantall">${igjen}</b>` : `<span class="sh-maler" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i < maler ? "fylt" : ""}"></i>`).join("")}</span>`;
    const etikett = igjen > 0 ? R.t("{tekst}: {n} klar", { tekst, n: igjen }) : R.t("Hint: {n} av {av} ekstraord til neste", { n: maler, av: HINT_PER });
    return `<button class="knapp-2 sh-hint" data-h="hint" aria-label="${esc(etikett)}"${kan ? "" : " disabled"}><span aria-hidden="true">💡</span> ${esc(R.t("Hint"))} ${merke}</button>`;
  }
  function oppdaterValg(S) {
    const sp = aktiv(S);
    if (!sp) return;
    const el = R.$(".sh-valg");
    if (el) el.innerHTML = valgTekst(sp);
    document.querySelectorAll(".sh-rute .sh-celle").forEach((k) => {
      const i = Number(k.dataset.i);
      k.classList.toggle("valgt", valg.includes(i));
    });
    const g = R.$(".sh-rute .sh-valglinje");
    if (g) g.innerHTML = linjeSvg(valg, BREDDE, "valgt");
    const prov = R.$("#sh-prov");
    if (prov) prov.disabled = valg.length < 2 || opptatt;
  }
  function visMelding(tekst, klasse, ms) {
    clearTimeout(meldingId);
    melding = { tekst, klasse };
    const el = R.$(".sh-melding");
    if (el) el.innerHTML = meldingHtml();
    meldingId = setTimeout(() => {
      melding = null;
      meldingId = null;
      const e2 = R.$(".sh-melding");
      if (e2) e2.innerHTML = "";
    }, ms || 2200);
  }

  const lyd = {
    tast: (n) => R.lyd.tone(520 + n * 40, 0, 0.04, "sine", 0.05),
    nei: () => R.lyd.tone(220, 0, 0.16, "triangle", 0.14, 170),
    ekstra: () => R.lyd.tone(700, 0, 0.1, "triangle", 0.08),
    ord: () => [587, 784, 988].forEach((f, i) => R.lyd.tone(f, i * 0.07, 0.13, "triangle", 0.1)),
    nokkel: () => [523, 659, 784, 1047, 1319].forEach((f, i) => R.lyd.tone(f, i * 0.08, 0.16, "triangle", 0.1)),
  };

  // A tap on a cell of the trail: start, go on, go back, or try the word (the last letter again).
  function trykkSpor(S, i) {
    const sp = aktiv(S);
    if (!sp || ferdig(sp) || opptatt) return;
    const spor = sporFor(sp.nr);
    if (cellerFunnet(sp, spor)[i] >= 0) return;
    const siste = valg[valg.length - 1];
    if (!valg.length) valg = [i];
    else if (i === siste) return provOrd(S, valg.slice());
    else if (valg.includes(i)) valg = valg.slice(0, valg.indexOf(i) + 1);
    else if (erNabo(siste, i)) valg.push(i);
    else valg = [i];
    lyd.tast(valg.length);
    oppdaterValg(S);
  }

  function provOrd(S, sti) {
    const sp = aktiv(S);
    const spor = sporFor(sp.nr);
    valg = [];
    if (sti.length < 2) return oppdaterValg(S);
    const tekst = lesSti(spor.celler, sti);
    const w = finnTemaord(spor, sti, sp.funnet);
    const dag = S.modus === "dag";
    if (w >= 0) {
      sp.funnet.push(w);
      sp.logg.push(w === 0 ? "n" : "o");
      if (sp.hint && sp.hint.w === w) sp.hint = null;
      const alle = sp.funnet.length === spor.ord.length;
      if (alle) {
        if (dag) registrerDag(S, sp);
        else S.ovLost[sp.nr] = 1;
        R.statistikk("ferdig", { modus: S.modus, hint: sp.hintBrukt, ekstra: sp.ekstra.length });
      } else if (dag && sp.nr === iDag()) R.dagligIGang({ tekst: resTekst(sp) });
      R.lagre();
      if (w === 0) lyd.nokkel();
      else lyd.ord();
      R.vibrer(w === 0 ? [30, 40, 30] : 30);
      melding = { tekst: w === 0 ? R.t("Nøkkelordet! {ord}", { ord: stor(spor.n || tekst) }) : R.t("Temaord! {ord}", { ord: stor(tekst) }), klasse: w === 0 ? "nokkel" : "ok" };
      R.vis();
      R.si(w === 0 ? R.t("Du fant nøkkelordet {ord}. {n} av {av} temaord.", { ord: stor(spor.n || tekst), n: sp.funnet.length, av: spor.ord.length }) : R.t("Du fant temaordet {ord}. {n} av {av} temaord.", { ord: stor(tekst), n: sp.funnet.length, av: spor.ord.length }));
      clearTimeout(meldingId);
      meldingId = setTimeout(() => {
        melding = null;
        const el = R.$(".sh-melding");
        if (el) el.innerHTML = "";
      }, 2200);
      if (alle) feir(S);
      return;
    }
    let tekst2;
    if (bokstaver(tekst).length < MIN_ORD) tekst2 = R.t("For kort – minst fire bokstaver");
    else if (EKSTRA.has(tekst)) {
      if (sp.ekstra.includes(tekst)) tekst2 = R.t("{ord} har du funnet før", { ord: stor(tekst) });
      else {
        const for_ = hintIgjen(sp);
        sp.ekstra.push(tekst);
        R.lagre();
        lyd.ekstra();
        const nytt = hintIgjen(sp) > for_;
        if (nytt) {
          R.vis();
          visMelding(R.t("{ord} – et nytt hint er klart!", { ord: stor(tekst) }), "hint", 2600);
        } else {
          const knapp = R.$(".sh-hint");
          if (knapp) knapp.outerHTML = hintKnapp(sp);
          visMelding(R.t("{ord} er ikke temaord, men gir {n} av {av} til et hint", { ord: stor(tekst), n: hintMaler(sp), av: HINT_PER }), "ekstra", 2600);
        }
        R.si(nytt ? R.t("{ord} – et nytt hint er klart!", { ord: stor(tekst) }) : R.t("{ord} er ikke temaord, men gir {n} av {av} til et hint", { ord: stor(tekst), n: hintMaler(sp), av: HINT_PER }));
        oppdaterValg(S);
        return;
      }
    } else tekst2 = R.t("{ord} er ikke i ordlista", { ord: stor(tekst) });
    lyd.nei();
    R.vibrer(40);
    oppdaterValg(S);
    visMelding(tekst2, "feil", 2000);
    R.si(tekst2);
  }

  function brukHint(S) {
    const sp = aktiv(S);
    if (!sp || ferdig(sp) || hintIgjen(sp) <= 0) return;
    const spor = sporFor(sp.nr);
    if (sp.hint && !sp.funnet.includes(sp.hint.w)) {
      if (sp.hint.rekke) return;
      sp.hint.rekke = true;
    } else {
      // The first theme word not found yet (the key word last).
      const w = [...spor.ord.keys()].slice(1).concat(0).find((x) => !sp.funnet.includes(x));
      sp.hint = { w, rekke: false };
    }
    sp.hintBrukt += 1;
    sp.logg.push("h");
    R.lagre();
    R.lyd.tone(880, 0, 0.12, "sine", 0.08);
    R.vis();
    R.si(sp.hint.rekke ? R.t("Hintet viser rekkefølgen på bokstavene.") : R.t("Bokstavene i ett temaord har fått en stiplet ring."));
  }

  function feir(S) {
    const fortsatt = R.vakt();
    opptatt = true;
    nyFeiring = true;
    setTimeout(() => {
      opptatt = false;
      if (fortsatt()) R.gaTil("resultat");
    }, R.rolig() ? 500 : 1400);
  }

  async function lukkDagen(S) {
    const sp = aktiv(S);
    if (!sp || ferdig(sp)) return;
    const ok = await R.bekreft(R.t("Vis svarene?"), R.t("Da ser du alle temaordene, og sporet er over for denne gangen."), R.t("Vis svarene"), R.t("Spill videre"));
    if (!ok) return;
    sp.lukket = true;
    valg = [];
    if (S.modus === "dag") registrerDag(S, sp);
    else S.ovLost[sp.nr] = S.ovLost[sp.nr] === 1 ? 1 : 0;
    R.statistikk("ferdig", { modus: S.modus, lukket: true });
    R.lagre();
    R.gaTil("resultat");
  }

  // ---------- The word search ----------

  function nyLeting(S) {
    const o = S.oppsett;
    // A random theme: one with at least five words that fit the level.
    const passer = TEMAER.map((t, i) => i).filter((i) => passerLeting(TEMAER[i], o.niva) >= 5);
    let temaNr = o.tema >= 0 && o.tema < TEMAER.length ? o.tema : R.velg(passer.length ? passer : TEMAER.map((t, i) => i));
    let fro = R.nyttFro();
    let l = lagLeting([...TEMAER[temaNr].k.map(rens), ...TEMAER[temaNr].o], o.niva, mulberry32(fro), ALFABET);
    for (let n = 0; n < 30 && (!l || l.plass.length < 3); n++) {
      // A chosen theme that does not fit this level gives way to a random one after a few tries.
      if (o.tema < 0 || n >= 10) temaNr = R.velg(passer);
      fro = R.nyttFro();
      l = lagLeting([...TEMAER[temaNr].k.map(rens), ...TEMAER[temaNr].o], o.niva, mulberry32(fro), ALFABET);
    }
    S.leting = { tema: temaNr, niva: o.niva, fro, celler: l.celler.join(""), plass: l.plass, funnet: [], start: Date.now(), tid: 0, ferdig: false, lukket: false };
    R.statistikk("start", { modus: "leting", niva: o.niva });
  }
  const letStr = (L) => STORRELSE[L.niva] || 8;
  function letingHtml(S) {
    const L = S.leting;
    const str = letStr(L);
    const celler = Array.from(L.celler);
    const eier = new Array(celler.length).fill(-1);
    const vis = L.lukket ? L.plass.map((p, i) => i) : L.funnet;
    for (const p of vis) for (const c of linje(L.plass[p].a, L.plass[p].b, str)) eier[c] = p;
    const knapper = celler
      .map((b, i) => `<button class="sh-celle${eier[i] >= 0 ? " funnet" : ""}${i === letStart || valg.includes(i) ? " valgt" : ""}" data-i="${i}" tabindex="${i === 0 ? 0 : -1}" aria-label="${esc(stor(b) + (i === letStart ? ", " + R.t("start") : ""))}"><span>${esc(stor(b))}</span></button>`)
      .join("");
    const linjer = vis.map((p) => linjeSvg(linje(L.plass[p].a, L.plass[p].b, str), str, `funnet f-${FARGER[p % FARGER.length]}${L.lukket && !L.funnet.includes(p) ? " avslort" : ""}`)).join("") + `<g class="sh-valglinje">${linjeSvg(valg, str, "valgt")}</g>`;
    const ordliste = L.plass
      .slice()
      .map((p, i) => ({ o: p.o, i }))
      .sort((a, b) => a.o.localeCompare(b.o, R.lokale))
      .map(({ o, i }) => `<li class="${L.funnet.includes(i) ? "funnet" : ""}">${esc(stor(o))}${L.funnet.includes(i) ? `<span class="vh"> ${esc(R.t("(funnet)"))}</span>` : ""}</li>`)
      .join("");
    return `<div class="sh-rute sh-let" role="grid" aria-label="${esc(R.t("Bokstavene, {n} ganger {n}", { n: str }))}" style="--br:${str};--ho:${str}">
        <svg class="sh-linjer" viewBox="0 0 ${str * 100} ${str * 100}" aria-hidden="true" focusable="false">${linjer}</svg>
        ${knapper}
      </div>
      <ul class="sh-ordliste" aria-label="${esc(R.t("Ordene du skal finne"))}">${ordliste}</ul>`;
  }
  function oppdaterLetValg() {
    document.querySelectorAll(".sh-let .sh-celle").forEach((k) => {
      const i = Number(k.dataset.i);
      k.classList.toggle("valgt", i === letStart || valg.includes(i));
    });
    const g = R.$(".sh-let .sh-valglinje");
    if (g && R.S && R.S.leting) g.innerHTML = linjeSvg(valg, letStr(R.S.leting), "valgt");
  }
  // The straight line from a towards b (snapped to the nearest of the eight directions).
  function retteLinje(a, b, str) {
    const ra = Math.floor(a / str);
    const ca = a % str;
    let dr = Math.floor(b / str) - ra;
    let dc = (b % str) - ca;
    const n = Math.max(Math.abs(dr), Math.abs(dc));
    if (!n) return [a];
    const vinkel = Math.round(Math.atan2(dr, dc) / (Math.PI / 4));
    const sdr = Math.round(Math.sin((vinkel * Math.PI) / 4));
    const sdc = Math.round(Math.cos((vinkel * Math.PI) / 4));
    const ut = [];
    for (let k = 0; k <= n; k++) {
      const r = ra + sdr * k;
      const c = ca + sdc * k;
      if (r < 0 || r >= str || c < 0 || c >= str) break;
      ut.push(r * str + c);
    }
    return ut;
  }
  function provLinje(S, celler) {
    const L = S.leting;
    const str = letStr(L);
    valg = [];
    letStart = -1;
    if (celler.length < 2) return oppdaterLetValg();
    const a = celler[0];
    const b = celler[celler.length - 1];
    const p = L.plass.findIndex((x, i) => !L.funnet.includes(i) && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    if (p < 0) {
      lyd.nei();
      oppdaterLetValg();
      const tekst = R.t("{ord} er ikke på lista", { ord: stor(celler.map((c) => L.celler[c] ? Array.from(L.celler)[c] : "").join("")) });
      visMelding(tekst, "feil", 1800);
      R.si(tekst);
      return;
    }
    L.funnet.push(p);
    lyd.ord();
    R.vibrer(30);
    const alle = L.funnet.length === L.plass.length;
    if (alle) {
      L.ferdig = true;
      L.tid = Math.round((Date.now() - L.start) / 1000);
      R.statistikk("ferdig", { modus: "leting", niva: L.niva, tid: L.tid });
    }
    R.lagre();
    R.vis();
    R.si(R.t("Du fant {ord}. {n} av {av}.", { ord: stor(L.plass[p].o), n: L.funnet.length, av: L.plass.length }));
    if (alle) {
      const fortsatt = R.vakt();
      nyFeiring = true;
      setTimeout(() => fortsatt() && R.gaTil("letferdig"), R.rolig() ? 400 : 1100);
    }
    void str;
  }
  function trykkLeting(S, i) {
    const L = S.leting;
    if (!L || L.ferdig || L.lukket) return;
    const str = letStr(L);
    if (letStart < 0) {
      letStart = i;
      valg = [i];
    } else if (i === letStart) {
      letStart = -1;
      valg = [];
    } else {
      const rett = linje(letStart, i, str);
      if (rett) return provLinje(S, rett);
      letStart = i;
      valg = [i];
    }
    lyd.tast(1);
    oppdaterLetValg();
  }

  // ---------- Fingers, mouse and keyboard on a grid ----------

  // The cell under a point, only when the point is well inside it (so a slanting drag does not
  // catch the cells beside the line).
  function celleVed(x, y, raus) {
    const el = document.elementFromPoint(x, y);
    const k = el && el.closest && el.closest(".sh-rute .sh-celle");
    if (!k) return -1;
    const r = k.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    return raus || Math.hypot(dx, dy) <= r.width * 0.42 ? Number(k.dataset.i) : -1;
  }
  document.addEventListener("pointerdown", (e) => {
    const S = R.S;
    const k = e.target && e.target.closest && e.target.closest(".sh-rute .sh-celle");
    if (!S || !k || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (S.skjerm !== "brett" && S.skjerm !== "leting") return;
    if (k.hasPointerCapture && k.hasPointerCapture(e.pointerId)) k.releasePointerCapture(e.pointerId);
    peker = { start: Number(k.dataset.i), beveget: false, id: e.pointerId, gammelValg: valg.slice() };
  });
  document.addEventListener("pointermove", (e) => {
    const S = R.S;
    if (!peker || !S || e.pointerId !== peker.id) return;
    const i = celleVed(e.clientX, e.clientY, false);
    if (i < 0) return;
    if (S.skjerm === "brett") {
      const sp = aktiv(S);
      if (!sp || ferdig(sp) || opptatt) return;
      const eier = cellerFunnet(sp, sporFor(sp.nr));
      if (!peker.beveget) {
        if (i === peker.start || eier[peker.start] >= 0) return;
        peker.beveget = true;
        valg = [peker.start];
      }
      if (eier[i] >= 0) return;
      const siste = valg[valg.length - 1];
      if (i === siste) return;
      if (valg.length > 1 && i === valg[valg.length - 2]) valg.pop();
      else if (!valg.includes(i) && erNabo(siste, i)) valg.push(i);
      else return;
      lyd.tast(valg.length);
      oppdaterValg(S);
    } else if (S.skjerm === "leting" && S.leting && !S.leting.ferdig) {
      if (!peker.beveget && i === peker.start) return;
      peker.beveget = true;
      letStart = -1;
      const ny = retteLinje(peker.start, i, letStr(S.leting));
      if (ny.join() === valg.join()) return;
      valg = ny;
      oppdaterLetValg();
    }
    e.preventDefault();
  });
  function pekerSlutt(e) {
    const S = R.S;
    if (!peker || !S || (e && e.pointerId !== peker.id)) return;
    const p = peker;
    peker = null;
    sistPeker = Date.now();
    if (S.skjerm === "brett") {
      if (p.beveget) provOrd(S, valg.slice());
      else trykkSpor(S, p.start);
    } else if (S.skjerm === "leting") {
      if (p.beveget) provLinje(S, valg.slice());
      else trykkLeting(S, p.start);
    }
  }
  document.addEventListener("pointerup", pekerSlutt);
  document.addEventListener("pointercancel", () => {
    peker = null;
  });
  // A click without a pointer gesture: the keyboard, a switch, a screen reader.
  document.addEventListener("click", (e) => {
    const S = R.S;
    const k = e.target && e.target.closest && e.target.closest(".sh-rute .sh-celle");
    if (!S || !k || Date.now() - sistPeker < 700) return;
    const i = Number(k.dataset.i);
    if (S.skjerm === "brett") trykkSpor(S, i);
    else if (S.skjerm === "leting") trykkLeting(S, i);
  });
  // Arrow keys move between the cells; Escape lets go of the word; Backspace takes a letter back.
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    const k = e.target && e.target.closest && e.target.closest(".sh-rute .sh-celle");
    if (!S || (R.arkApent && R.arkApent())) return;
    if (e.key === "Escape" && valg.length) {
      valg = [];
      letStart = -1;
      if (S.skjerm === "brett") oppdaterValg(S);
      else oppdaterLetValg();
      return;
    }
    if (e.key === "Backspace" && S.skjerm === "brett" && valg.length) {
      e.preventDefault();
      valg.pop();
      return oppdaterValg(S);
    }
    if (!k) return;
    const rute = k.closest(".sh-rute");
    const br = Number(getComputedStyle(rute).getPropertyValue("--br")) || BREDDE;
    const alle = Array.from(rute.querySelectorAll(".sh-celle"));
    const i = Number(k.dataset.i);
    const flytt = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -br, ArrowDown: br }[e.key];
    if (flytt == null) return;
    e.preventDefault();
    let j = i + flytt;
    if ((e.key === "ArrowLeft" && i % br === 0) || (e.key === "ArrowRight" && i % br === br - 1) || j < 0 || j >= alle.length) j = i;
    alle.forEach((x) => (x.tabIndex = -1));
    alle[j].tabIndex = 0;
    alle[j].focus();
  });

  // ---------- Sharing (paws and bones, never the words) ----------

  const IKON = { o: "🐾", n: "🦴", h: "💡" };
  function delTekst(S) {
    const sp = S.dag;
    const spor = sporFor(sp.nr);
    const rekke = rekkeNa(S);
    const hode = `${R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) })} · ${resTekst(sp)}${!sp.lukket && rekke > 1 ? ` · 🔥 ${R.t("{n} på rad", { n: rekke })}` : ""}`;
    return `${hode}\n«${spor.t}»\n${sp.logg.map((x) => IKON[x]).join("")}\n`;
  }
  function delKort(S) {
    const sp = S.dag;
    const spor = sporFor(sp.nr);
    const rekke = rekkeNa(S);
    const rad = sp.logg.map((x) => IKON[x]).join("");
    return { tittel: R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) }), linjer: [resTekst(sp), `«${spor.t}»`, rad.slice(0, 40), !sp.lukket && rekke > 1 ? `🔥 ${R.t("{n} på rad", { n: rekke })}` : ""].filter(Boolean) };
  }

  function tallHtml(S) {
    const st = S.stat;
    return `<div class="sh-tall">
        <div><b>${R.tall(st.spilt)}</b><span>${esc(R.t("spilt"))}</span></div>
        <div><b>${R.tall(st.utenHint)}</b><span>${esc(R.t("uten hint"))}</span></div>
        <div><b>${R.tall(rekkeNa(S))}</b><span>${esc(R.t("på rad"))}</span></div>
        <div><b>${R.tall(st.best)}</b><span>${esc(R.t("beste rekke"))}</span></div>
      </div>`;
  }
  function statistikkArk(S) {
    return `<h2 id="ark-tittel">${esc(R.t("Statistikk"))}</h2>
      ${S.stat.spilt ? tallHtml(S) + `<p class="hjelp">${esc(R.t("Spor funnet: {n} av {av}.", { n: R.tall(S.stat.vunnet), av: R.tall(S.stat.spilt) }))}</p>` : `<p class="ingress">${esc(R.t("Du har ikke spilt dagens spor ennå. Gjør det, så dukker statistikken opp her."))}</p>`}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }
  // The words of a trail on the result screen.
  function ordeneHtml(sp) {
    const spor = sporFor(sp.nr);
    return `<ul class="sh-funnetliste">${spor.ord
      .map((o, w) => {
        const fant = sp.funnet.includes(w);
        const tekst = w === 0 ? stor(spor.n || o) : stor(o);
        return `<li class="${w === 0 ? "nokkel" : ""}${fant ? "" : " glemt"}">${w === 0 ? '<span aria-hidden="true">🦴</span> ' : ""}${esc(tekst)}${fant ? "" : `<span class="vh"> ${esc(R.t("(ikke funnet)"))}</span>`}</li>`;
      })
      .join("")}</ul>`;
  }
  const DATO = new Intl.DateTimeFormat(R.lokale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const datoFor = (nr) => DATO.format(new Date(nr * 86400000 + 12 * 3600000)).replace(/\.$/, "");
  const minSek = (s) => `${Math.floor(s / 60)}:${to(s % 60)}`;

  R.start({
    id: "sporhunden",
    versjon: 1,
    pagar,
    _motor: MOTOR,
    _spor: (nr) => sporFor(nr),

    tilstand: () => ({
      modus: "dag",
      dag: null, // { nr, funnet: [word index], ekstra: [words], hint: { w, rekke } | null, hintBrukt, logg: ["o"|"n"|"h"], lukket }
      ov: null,
      stat: tomStat(),
      ovLost: {},
      oppsett: { niva: "lett", tema: -1 },
      leting: null, // { tema, niva, fro, celler, plass: [{ o, a, b }], funnet: [], start, tid, ferdig, lukket }
    }),

    lastet(S) {
      const ok = (sp) => {
        if (!sp || !Number.isInteger(sp.nr) || !Array.isArray(sp.funnet) || !Array.isArray(sp.ekstra) || !Array.isArray(sp.logg)) return false;
        const n = sporFor(sp.nr).ord.length;
        return sp.funnet.every((w) => Number.isInteger(w) && w >= 0 && w < n) && sp.ekstra.every((o) => typeof o === "string") && sp.ekstra.length <= 400 && sp.logg.length <= 60;
      };
      for (const k of ["dag", "ov"]) {
        if (!ok(S[k])) S[k] = null;
        else {
          const sp = S[k];
          sp.funnet = sp.funnet.filter((w, i, a) => a.indexOf(w) === i);
          sp.ekstra = sp.ekstra.filter((o, i, a) => EKSTRA.has(o) && a.indexOf(o) === i);
          sp.hintBrukt = Math.min(tall(sp.hintBrukt), Math.floor(sp.ekstra.length / HINT_PER));
          sp.logg = sp.logg.filter((x) => x === "o" || x === "n" || x === "h");
          sp.lukket = !!sp.lukket;
          const n = sporFor(sp.nr).ord.length;
          sp.hint = sp.hint && Number.isInteger(sp.hint.w) && sp.hint.w >= 0 && sp.hint.w < n ? { w: sp.hint.w, rekke: !!sp.hint.rekke } : null;
        }
      }
      if (S.modus !== "ov") S.modus = "dag";
      const st = S.stat && typeof S.stat === "object" ? S.stat : {};
      S.stat = { spilt: tall(st.spilt), vunnet: tall(st.vunnet), utenHint: tall(st.utenHint), rekke: tall(st.rekke), best: tall(st.best), sistVunnet: Number.isInteger(st.sistVunnet) ? st.sistVunnet : null, sistSpilt: Number.isInteger(st.sistSpilt) ? st.sistSpilt : null };
      const ovl = S.ovLost && typeof S.ovLost === "object" && !Array.isArray(S.ovLost) ? S.ovLost : {};
      S.ovLost = {};
      for (const k of Object.keys(ovl)) if (/^\d+$/.test(k) && (ovl[k] === 0 || ovl[k] === 1)) S.ovLost[k] = ovl[k];
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      S.oppsett = { niva: STORRELSE[o.niva] ? o.niva : "lett", tema: Number.isInteger(o.tema) && o.tema >= -1 && o.tema < TEMAER.length ? o.tema : -1 };
      const L = S.leting;
      const okL =
        L &&
        STORRELSE[L.niva] &&
        typeof L.celler === "string" &&
        Array.from(L.celler).length === STORRELSE[L.niva] ** 2 &&
        Array.isArray(L.plass) &&
        L.plass.every((p) => p && typeof p.o === "string" && Number.isInteger(p.a) && Number.isInteger(p.b) && linje(p.a, p.b, STORRELSE[L.niva])) &&
        Array.isArray(L.funnet) &&
        L.funnet.every((i) => Number.isInteger(i) && i >= 0 && i < L.plass.length);
      if (!okL) S.leting = null;
      if (S.dag && ferdig(S.dag) && S.stat.sistSpilt !== S.dag.nr) registrerDag(S, S.dag);
      else if (S.dag && ferdig(S.dag) && S.dag.nr === iDag()) {
        const sp = S.dag;
        R.dagligFerdig({ vunnet: !sp.lukket, rekke: !sp.lukket ? S.stat.rekke : 0, res: resTekst(sp) });
      }
      const sp = aktiv(S);
      if ((S.skjerm === "brett" || S.skjerm === "resultat") && !sp) S.skjerm = "hjem";
      if (S.skjerm === "brett" && sp && ferdig(sp)) S.skjerm = "resultat";
      if ((S.skjerm === "leting" || S.skjerm === "letferdig") && !S.leting) S.skjerm = "hjem";
      if (S.skjerm === "leting" && S.leting && S.leting.ferdig) S.skjerm = "letferdig";
    },

    regler: {
      intro: R.t("Bokstavene skjuler dagens temaord. De fyller hele rutenettet, og ingen bokstav brukes to ganger. Nøkkelordet sier hva temaet er, og strekker seg fra én side til den andre."),
      steg: [
        [R.t("Spor et ord"), R.t("Dra fingeren over bokstaver som ligger inntil hverandre – bortover, opp, ned eller på skrå. Eller trykk dem én etter én, og trykk den siste en gang til.")],
        [R.t("Finn temaordene"), R.t("Et temaord blir liggende med et spor. Finn alle, også nøkkelordet, så er dagens spor løst.")],
        [R.t("Hint"), R.t("Andre ord på fire bokstaver eller mer er ikke temaord, men hvert tredje gir deg et hint. Et hint ringer inn bokstavene i ett temaord.")],
      ],
      tips: [
        R.t("Les ledetråden: den sier noe om temaet, men sjelden rett ut."),
        R.t("Begynn i et hjørne – bokstavene der har færrest naboer."),
        R.t("Bruker du et hint på et ord som alt er ringet inn, får du se rekkefølgen."),
        R.t("Ordleting er den klassiske utgaven for hele familien: finn ordene på lista i rette linjer."),
        R.t("Alle får samme spor. Et nytt kommer ved midnatt."),
        R.t("Temaene er skrevet for rusj. Ordene som gir hint, kommer fra Norsk ordbank – bokmål 2005 fra Språkbanken ved Nasjonalbiblioteket (CC BY 4.0)."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = S.dag && S.dag.nr === iDag() ? S.dag : null;
          const fe = !!(d && ferdig(d));
          const iGangD = !!(d && iGang(d));
          const hoved = fe
            ? R.ui.knapp(R.t("Se dagens resultat"), "se-resultat")
            : R.ui.knapp(iGangD ? R.t("Fortsett dagens spor · {res}", { res: resTekst(d) }) : R.t("Dagens spor"), "dag", { variant: iGangD ? "" : "stor" });
          const rekke = rekkeNa(S);
          const leting = S.leting && !S.leting.ferdig ? R.ui.knapp2(R.t("Fortsett ordletingen"), "fortsett-leting") : R.ui.knapp2(R.t("Ordleting"), "leting-oppsett");
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Følg sporet til dagens ord."))}<br><em>${esc(R.t("Nytt tema hver dag."))}</em>`,
            knapperHtml:
              hoved +
              (fe ? nedtellingHtml() : "") +
              leting +
              (eldre().length ? R.ui.knapp2(iGang(S.ov) ? R.t("Fortsett øvingen") : R.t("Eldre spor"), "ov") : "") +
              R.ui.lenkerad(R.ui.lenke(R.t("Statistikk"), "statistikk"), R.ui.lenke(R.t("Slik spiller du"), "regler")),
            merker: [["6×8", R.t("bokstaver")], ["🦴", R.t("ett nøkkelord")], rekke ? [`🔥 ${rekke}`, rekke === 1 ? R.t("dag på rad") : R.t("dager på rad")] : ["💡", R.t("hint for ekstraord")]],
          });
        },
        inn(S) {
          if (S.dag && S.dag.nr === iDag() && ferdig(S.dag)) startNedtelling();
        },
      },

      brett: {
        tittel: (S) => (S.modus === "ov" ? R.t("Øving · nr. {nr}", { nr: nrFor(S.ov.nr) }) : R.t("Dagens spor")),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const ov = S.modus === "ov";
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(ov ? R.t("Øving: {navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) }) : R.t("Dagens spor"))}</h1>
            <div class="sh-topp">
              ${temaHtml(sp)}
              <p class="sh-valg">${valgTekst(sp)}</p>
              <p class="sh-melding">${meldingHtml()}</p>
            </div>
            ${brettHtml(S, sp)}
            ${R.ui.dokk(`<div class="knapprad sh-knapper">${hintKnapp(sp)}${R.ui.knapp(R.t("Prøv ordet"), "prov", { av: valg.length < 2, id: "sh-prov" })}</div>`, R.ui.lenkerad(R.ui.lenke(R.t("Vis svarene"), "vis-svar")))}`;
        },
        inn() {
          opptatt = false;
          valg = [];
          melding = null;
        },
        ut() {
          opptatt = false;
          valg = [];
          melding = null;
          peker = null;
          clearTimeout(meldingId);
        },
      },

      arkiv: {
        tittel: R.t("Eldre spor"),
        tilbake: "hjem",
        vis(S) {
          const rader = eldre()
            .map((nr) => {
              const lost = S.ovLost[nr];
              const paGang = S.ov && S.ov.nr === nr && iGang(S.ov);
              const merke = lost === 1 ? ["✓", R.t("løst")] : lost === 0 ? ["✗", R.t("ikke løst")] : paGang ? ["…", R.t("påbegynt")] : ["", R.t("ny")];
              const ovH = 'data-h="spill-ov"'; // sprak-ok (an action name)
              return `<li><button class="sh-arkivrad${lost === 1 ? " lost" : ""}" ${ovH} data-v="${nr}" aria-label="${esc(R.t("Nr. {nr}, {dato}, {status}", { nr: nrFor(nr), dato: datoFor(nr), status: merke[1] }))}">
                <b>${esc(R.t("Nr. {nr}", { nr: nrFor(nr) }))}</b><span>${esc(datoFor(nr))}</span><i aria-hidden="true">${merke[0]}</i></button></li>`;
            })
            .join("");
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Eldre spor"))}</h1>
            <p class="ingress">${esc(R.t("Spill sporene fra dagene før. Øving teller ikke i statistikken."))}</p>
            <ul class="sh-arkiv">${rader}</ul>
            ${R.ui.dokk(R.ui.knapp(R.t("Tilfeldig spor"), "tilfeldig"), R.ui.lenkerad(R.ui.lenke(R.t("Til {navn}", { navn: NAVN }), "hjem")))}`;
        },
      },

      resultat: {
        tittel: (S) => (S.modus === "ov" ? R.t("Øving · nr. {nr}", { nr: nrFor(S.ov.nr) }) : R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(S.dag.nr) })),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const spor = sporFor(sp.nr);
          const ov = S.modus === "ov";
          const gammel = !ov && sp.nr !== iDag();
          const lost = !sp.lukket;
          const banner = R.ui.banner({
            etikett: lost ? (sp.hintBrukt ? R.t("Godt jobba!") : R.t("Uten et eneste hint!")) : R.t("Ikke denne gangen"),
            tittel: lost ? R.t("Du fant sporet!") : R.t("Du fant {n} av {av} temaord", { n: sp.funnet.length, av: spor.ord.length }),
            tekst: `«${spor.t}» · ${stor(spor.n || spor.ord[0])}`,
            klasse: "sh-banner",
            stemning: lost ? (sp.hintBrukt <= 1 ? "jubel" : "") : "lei",
          });
          const ordene = `<section class="seksjon sh-ordene" aria-labelledby="sh-ordene-tittel"><h2 id="sh-ordene-tittel">${esc(R.t("Temaordene"))}</h2>${ordeneHtml(sp)}
            <p class="hjelp">${esc(R.t("Ekstraord: {n} · hint brukt: {h}", { n: sp.ekstra.length, h: sp.hintBrukt }))}</p></section>`;
          const rute = `<div class="sh-ferdigrute">${brettHtml(S, sp)}</div>`;
          if (ov) {
            return `${banner}${rute}${ordene}
              ${R.ui.flereSpill({ antall: 1 })}
              ${R.ui.dokk(R.ui.knapp(R.t("Flere spor"), "arkiv"), R.ui.lenkerad(R.ui.lenke(R.t("Til {navn}", { navn: NAVN }), "hjem"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
          }
          return `${banner}
            ${gammel ? `<p class="sh-nedtelling"><b>${esc(R.t("Et nytt spor er klart!"))}</b></p>` : nedtellingHtml()}
            ${rute}${ordene}
            <section class="seksjon sh-stat" aria-labelledby="sh-stat-tittel"><h2 id="sh-stat-tittel">${esc(R.t("Statistikk"))}</h2>${tallHtml(S)}</section>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(
              gammel ? R.ui.knapp(R.t("Spill dagens spor"), "dag") : R.ui.knapp(R.t("Del resultatet"), "del"),
              R.ui.lenkerad(R.ui.lenke(R.t("Eldre spor"), "arkiv"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
            )}`;
        },
        inn(S) {
          R.slippVaken();
          const sp = aktiv(S);
          if (S.modus === "dag" && sp.nr === iDag()) startNedtelling();
          if (!nyFeiring) return;
          nyFeiring = false;
          if (!sp.lukket) {
            if (sp.hintBrukt <= 1) {
              R.lyd.fanfare();
              R.konfetti();
            } else R.lyd.pling();
          }
          if (S.modus === "dag") {
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 3000);
          }
        },
      },

      oppsett: {
        tittel: R.t("Gjør klart"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const tema = o.tema >= 0 ? temaNavn(TEMAER[o.tema]) : R.t("Tilfeldig tema");
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2 class="seksjon-hode">${esc(R.t("Hvor vanskelig?"))}</h2>
              ${R.ui.fliser("niva", [
                { v: "lett", tittel: NIVANAVN.lett, tekst: R.t("8 × 8 · bortover og nedover"), ikon: "🐾" },
                { v: "middels", tittel: NIVANAVN.middels, tekst: R.t("9 × 9 · også på skrå"), ikon: "🐕" },
                { v: "vrien", tittel: NIVANAVN.vrien, tekst: R.t("10 × 10 · alle veier, også baklengs"), ikon: "🦴" },
              ], o.niva)}
            </section>
            <section class="seksjon">
              <h2 class="seksjon-hode">${esc(R.t("Tema"))}</h2>
              <div class="sh-temavalg"><b>${esc(tema)}</b>${R.ui.knapp2(R.t("Velg tema"), "velg-tema")}${o.tema >= 0 ? R.ui.lenke(R.t("Tilfeldig tema"), "tilfeldig-tema") : ""}</div>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start-leting"))}`;
        },
      },

      leting: {
        tittel: (S) => (S.leting ? temaNavn(TEMAER[S.leting.tema]) : R.t("Ordleting")),
        tilbake: "hjem",
        vis(S) {
          const L = S.leting;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Ordleting: {tema}", { tema: temaNavn(TEMAER[L.tema]) }))}</h1>
            <div class="sh-lettopp"><span>${esc(R.t("{n} av {av} ord", { n: L.funnet.length, av: L.plass.length }))}</span><span>${esc(NIVANAVN[L.niva])}</span></div>
            <p class="sh-melding">${meldingHtml()}</p>
            ${letingHtml(S)}
            ${R.ui.dokk(R.ui.lenkerad(R.ui.lenke(R.t("Vis svarene"), "leting-svar"), R.ui.lenke(R.t("Avslutt"), "avslutt-leting")))}`;
        },
        inn() {
          valg = [];
          letStart = -1;
          melding = null;
          R.holdVaken();
        },
        ut() {
          valg = [];
          letStart = -1;
          peker = null;
          clearInterval(letKlokke);
        },
      },

      letferdig: {
        tittel: R.t("Ordleting"),
        tilbake: "hjem",
        vis(S) {
          const L = S.leting;
          const banner = R.ui.banner({
            etikett: L.lukket ? R.t("Svarene") : R.t("Godt jobba!"),
            tittel: L.lukket ? R.t("Du fant {n} av {av} ord", { n: L.funnet.length, av: L.plass.length }) : R.t("Alle ordene er funnet!"),
            tekst: L.lukket ? temaNavn(TEMAER[L.tema]) : R.t("{tema} · {niva} · {tid}", { tema: temaNavn(TEMAER[L.tema]), niva: NIVANAVN[L.niva], tid: minSek(L.tid) }),
            klasse: "sh-banner",
            stemning: L.lukket ? "" : "jubel",
          });
          return `${banner}
            <div class="sh-ferdigrute">${letingHtml(S)}</div>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "start-leting"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "leting-oppsett"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          R.slippVaken();
          if (!nyFeiring) return;
          nyFeiring = false;
          if (S.leting && !S.leting.lukket) {
            R.lyd.fanfare();
            R.konfetti();
          }
        },
      },
    },

    // rusj.no/sporhunden/#dagens: today's trail, or its result when it is done.
    vedHash(S, hash) {
      if (hash !== "dagens") return null;
      if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
      S.modus = "dag";
      return ferdig(S.dag) ? "resultat" : "brett";
    },

    handlinger: (H = {
      dag(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
        S.modus = "dag";
        R.gaTil(ferdig(S.dag) ? "resultat" : "brett");
      },
      "se-resultat"(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag() || !ferdig(S.dag)) return H.dag(el, e, S);
        S.modus = "dag";
        R.gaTil("resultat");
      },
      ov(el, e, S) {
        if (iGang(S.ov) && eldre().includes(S.ov.nr)) {
          S.modus = "ov";
          return R.gaTil("brett");
        }
        R.gaTil("arkiv");
      },
      arkiv() {
        R.gaTil("arkiv");
      },
      "spill-ov"(el, e, S) {
        const nr = Number(el.dataset.v);
        if (!eldre().includes(nr)) return;
        if (!S.ov || S.ov.nr !== nr || ferdig(S.ov)) {
          S.ov = nyttSpill(nr);
          R.statistikk("start", { modus: "ov" });
        }
        S.modus = "ov";
        R.gaTil("brett");
      },
      tilfeldig(el, e, S) {
        const liste = eldre();
        const nye = liste.filter((nr) => S.ovLost[nr] == null);
        S.ov = nyttSpill(R.velg(nye.length ? nye : liste));
        S.modus = "ov";
        R.statistikk("start", { modus: "ov" });
        R.gaTil("brett");
      },
      hjem() {
        R.gaTil("hjem");
      },
      prov(el, e, S) {
        if (valg.length >= 2) provOrd(S, valg.slice());
      },
      hint(el, e, S) {
        brukHint(S);
      },
      "vis-svar"(el, e, S) {
        lukkDagen(S);
      },
      statistikk(el, e, S) {
        R.ark(statistikkArk(S));
      },
      del(el, e, S) {
        if (S.dag && ferdig(S.dag)) return R.del(NAVN, delTekst(S), DEL_URL + "#utfordring", { kort: delKort(S) });
      },
      "leting-oppsett"() {
        R.gaTil("oppsett");
      },
      "fortsett-leting"(el, e, S) {
        if (S.leting && !S.leting.ferdig) R.gaTil("leting");
      },
      niva(el, e, S) {
        if (STORRELSE[el.dataset.v]) S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      "velg-tema"(el, e, S) {
        const liste = TEMAER.map((t, i) => ({ v: String(i), tekst: temaNavn(t) })).sort((a, b) => a.tekst.localeCompare(b.tekst, R.lokale));
        R.velgIArk(R.t("Velg tema"), liste).then((v) => {
          if (v == null || !R.S || R.S.skjerm !== "oppsett") return;
          R.S.oppsett.tema = Number(v);
          R.vis();
        });
      },
      "tilfeldig-tema"(el, e, S) {
        S.oppsett.tema = -1;
        R.vis();
      },
      async "start-leting"(el, e, S) {
        if (S.leting && !S.leting.ferdig && !(await R.bekreftNytt(true))) return;
        if (!R.S) return;
        nyLeting(R.S);
        R.gaTil("leting");
      },
      "leting-svar"(el, e, S) {
        R.bekreft(R.t("Vis svarene?"), R.t("Da ser du hvor alle ordene står, og runden er over."), R.t("Vis svarene"), R.t("Spill videre")).then((ok) => {
          if (!ok || !R.S || !R.S.leting) return;
          R.S.leting.lukket = true;
          R.S.leting.ferdig = true;
          R.S.leting.tid = Math.round((Date.now() - R.S.leting.start) / 1000);
          R.statistikk("ferdig", { modus: "leting", lukket: true });
          R.gaTil("letferdig");
        });
      },
      "avslutt-leting"(el, e, S) {
        R.bekreft(R.t("Avslutt"), R.t("Ordletingen blir lagret, så du kan fortsette senere."), R.t("Avslutt"), R.t("Spill videre")).then((ok) => ok && R.gaTil("hjem"));
      },
    }),
  });
})();
