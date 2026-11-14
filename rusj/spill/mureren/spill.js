/* Mureren — domino logic: lay every domino on the board so each coloured region keeps its rule:
   a sum («8»), all the same («=»), all different («≠»), less than («<4») or more than («>9»).
   Every puzzle is made on the phone: a random board laid with dominoes (the hidden solution),
   regions drawn over it, rules read off the solution – and then rules tightened one by one until
   a full search finds exactly one way to lay the dominoes. «Dagens mur» uses today's date as the
   seed. The engine at the top is pure and also runs under node (test/mureren.test.mjs). */
(function () {
  "use strict";

  // ======================= Engine =======================

  const motor = (function () {
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
    function fnv(tekst) {
      let h = 0x811c9dc5;
      for (let i = 0; i < tekst.length; i++) {
        h ^= tekst.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    const stokk = (a, tilf) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(tilf() * (i + 1));
        const x = a[i];
        a[i] = a[j];
        a[j] = x;
      }
      return a;
    };

    // The double-six set: 28 dominoes [a, b] with a ≤ b.
    const SETT = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) SETT.push([a, b]);

    // A puzzle: { B, H (bounding box), celler: [cell indices on the board, i = r·B + c],
    //   brikker: [[a, b] …] (the dominoes to lay), omrader: [{ celler: [i …], regel: { t, n } }],
    //   losning: { verdi: { i: pips }, par: [[i, j] …] } }.
    // Rules t: "sum" (= n), "lik" (all equal), "ulik" (all different), "under" (sum < n),
    // "over" (sum > n). Cells in no region have no rule.

    // ---------- Rules ----------
    // Can the region still keep its rule? verdier: the pips laid in it so far; tomme: cells left.
    function kanHolde(regel, verdier, tomme) {
      const s = verdier.reduce((a, b) => a + b, 0);
      switch (regel.t) {
        case "sum":
          return s <= regel.n && s + tomme * 6 >= regel.n;
        case "lik":
          return verdier.every((v) => v === verdier[0]);
        case "ulik":
          return new Set(verdier).size === verdier.length && verdier.length + tomme <= 7;
        case "under":
          return s < regel.n;
        case "over":
          return s + tomme * 6 > regel.n;
        default:
          return true;
      }
    }
    const holder = (regel, verdier) => kanHolde(regel, verdier, 0) && (regel.t !== "sum" || verdier.reduce((a, b) => a + b, 0) === regel.n);

    // ---------- Counting solutions ----------
    // Cell by cell in board order: the first empty cell must be the first half of a domino that
    // goes right or down. Returns up to `grense` solutions as { verdi, par } – or null when a
    // search would take more than `maksSteg` steps (the maker then tries another board).
    function finn(p, grense, maksSteg) {
      grense = grense || 2;
      let stegIgjen = maksSteg || Infinity;
      const B = p.B;
      const pa = new Set(p.celler);
      const orden = p.celler.slice().sort((a, b) => a - b);
      const omradeAv = new Map();
      p.omrader.forEach((o, k) => o.celler.forEach((i) => omradeAv.set(i, k)));
      const verdi = new Map();
      const brukt = new Uint8Array(p.brikker.length);
      const par = [];
      const ut = [];
      const tomtI = p.omrader.map((o) => o.celler.length);
      // Does a neighbour of cell x now sit alone (empty, with no empty neighbour to pair with)?
      const fri = (x) => pa.has(x) && !verdi.has(x);
      const naboerAv = (x) => [x - B, x + B, x % B ? x - 1 : -1, x % B < B - 1 ? x + 1 : -1];
      const innestengt = (x) => naboerAv(x).some((n) => n >= 0 && fri(n) && !naboerAv(n).some((m) => m >= 0 && fri(m)));
      // The pips still in hand, smallest first (for tighter sum bounds).
      const igjenVerdier = () => {
        const v = [];
        p.brikker.forEach(([a, b], d) => !brukt[d] && v.push(a, b));
        return v.sort((a, b) => a - b);
      };
      const ok = (k) => {
        if (k == null) return true;
        const o = p.omrader[k];
        const v = [];
        for (const i of o.celler) if (verdi.has(i)) v.push(verdi.get(i));
        if (!kanHolde(o.regel, v, tomtI[k])) return false;
        const e = tomtI[k];
        if (!e || (o.regel.t !== "sum" && o.regel.t !== "under" && o.regel.t !== "over")) return true;
        const hand = igjenVerdier();
        if (hand.length < e) return true;
        const s = v.reduce((a, b) => a + b, 0);
        let lav = 0;
        let hoy = 0;
        for (let q = 0; q < e; q++) {
          lav += hand[q];
          hoy += hand[hand.length - 1 - q];
        }
        if (o.regel.t === "sum") return s + lav <= o.regel.n && s + hoy >= o.regel.n;
        if (o.regel.t === "under") return s + lav < o.regel.n;
        return s + hoy > o.regel.n;
      };
      (function steg(fra) {
        if (ut.length >= grense || --stegIgjen < 0) return;
        let i = -1;
        for (let k = fra; k < orden.length; k++)
          if (!verdi.has(orden[k])) {
            i = orden[k];
            fra = k;
            break;
          }
        if (i < 0) {
          ut.push({ verdi: Object.fromEntries(verdi), par: par.map((x) => x.slice()) });
          return;
        }
        const naboer = [];
        if (i % B < B - 1 && pa.has(i + 1) && !verdi.has(i + 1)) naboer.push(i + 1);
        if (pa.has(i + B) && !verdi.has(i + B)) naboer.push(i + B);
        for (const j of naboer)
          for (let d = 0; d < p.brikker.length; d++) {
            if (brukt[d]) continue;
            const [a, b] = p.brikker[d];
            for (const [x, y] of a === b ? [[a, b]] : [[a, b], [b, a]]) {
              verdi.set(i, x);
              verdi.set(j, y);
              const ki = omradeAv.get(i);
              const kj = omradeAv.get(j);
              if (ki != null) tomtI[ki]--;
              if (kj != null) tomtI[kj]--;
              brukt[d] = 1;
              if (ok(ki) && (kj === ki || ok(kj)) && !innestengt(i) && !innestengt(j)) {
                par.push([i, j]);
                steg(fra + 1);
                par.pop();
              }
              brukt[d] = 0;
              if (ki != null) tomtI[ki]++;
              if (kj != null) tomtI[kj]++;
              verdi.delete(i);
              verdi.delete(j);
              if (ut.length >= grense) return;
            }
          }
      })(0);
      return stegIgjen < 0 ? null : ut;
    }
    const tell = (p, grense) => finn(p, grense || 2).length;

    // ---------- Making a puzzle ----------
    const NIVAER = Object.freeze({ 1: 5, 2: 7, 3: 9 });
    const MAKS_SIDE = 6;

    // A board grown domino by domino from the middle, never wider or taller than 6.
    function lagForm(k, tilf) {
      const B = MAKS_SIDE;
      for (;;) {
        const opptatt = new Set();
        const par = [];
        const start = Math.floor(B / 2) * B + Math.floor(B / 2) - 1;
        const forste = tilf() < 0.5 ? [start, start + 1] : [start, start + B];
        par.push(forste);
        forste.forEach((i) => opptatt.add(i));
        let forsok = 0;
        while (par.length < k && forsok++ < 400) {
          const liste = [...opptatt];
          const fra = liste[Math.floor(tilf() * liste.length)];
          const r = Math.floor(fra / B);
          const c = fra % B;
          const nab = [];
          if (r > 0) nab.push(fra - B);
          if (r < B - 1) nab.push(fra + B);
          if (c > 0) nab.push(fra - 1);
          if (c < B - 1) nab.push(fra + 1);
          const a = nab[Math.floor(tilf() * nab.length)];
          if (opptatt.has(a)) continue;
          const ar = Math.floor(a / B);
          const ac = a % B;
          const videre = [];
          if (ar > 0) videre.push(a - B);
          if (ar < B - 1) videre.push(a + B);
          if (ac > 0) videre.push(a - 1);
          if (ac < B - 1) videre.push(a + 1);
          const fri = videre.filter((x) => !opptatt.has(x));
          if (!fri.length) continue;
          const b = fri[Math.floor(tilf() * fri.length)];
          par.push([a, b]);
          opptatt.add(a);
          opptatt.add(b);
        }
        if (par.length === k) return { B, par };
      }
    }

    // Regions: small groups of neighbouring cells (1–4), drawn over the solution. A region that
    // is all one value so far likes to take in a neighbour with the same value (an «=» region).
    function lagOmrader(B, celler, tilf, verdi) {
      const igjen = new Set(celler);
      const ut = [];
      for (const start of stokk(celler.slice(), tilf)) {
        if (!igjen.has(start)) continue;
        const mal = [1, 2, 2, 3, 3, 3, 4][Math.floor(tilf() * 7)];
        const omr = [start];
        igjen.delete(start);
        while (omr.length < mal) {
          const kant = [];
          for (const i of omr) for (const j of [i - B, i + B, i % B ? i - 1 : -1, i % B < B - 1 ? i + 1 : -1]) if (j >= 0 && igjen.has(j)) kant.push(j);
          if (!kant.length) break;
          const like = omr.every((x) => verdi[x] === verdi[start]) ? kant.filter((x) => verdi[x] === verdi[start]) : [];
          const j = like.length && tilf() < 0.85 ? like[Math.floor(tilf() * like.length)] : kant[Math.floor(tilf() * kant.length)];
          omr.push(j);
          igjen.delete(j);
        }
        ut.push(omr.sort((a, b) => a - b));
      }
      return ut;
    }

    // The loosest true rule for a region (or none), and how to tighten it a step.
    function losRegel(verdier, tilf) {
      const s = verdier.reduce((a, b) => a + b, 0);
      const n = verdier.length;
      if (n > 1 && verdier.every((v) => v === verdier[0])) return { t: "lik" };
      const valg = [{ t: "ingen" }, { t: "sum", n: s }];
      if (n > 1) valg.push({ t: "sum", n: s });
      if (n > 1 && new Set(verdier).size === n) valg.push({ t: "ulik" });
      if (s <= 6 * n - 2) valg.push({ t: "under", n: Math.min(6 * n, s + 1 + Math.floor(tilf() * 3)) });
      if (s >= 2) valg.push({ t: "over", n: Math.max(0, s - 1 - Math.floor(tilf() * 3)) });
      return valg[Math.floor(tilf() * valg.length)];
    }
    function strammere(regel, verdier) {
      const s = verdier.reduce((a, b) => a + b, 0);
      if (regel.t === "sum" || regel.t === "lik") return null;
      if (regel.t === "under" && regel.n > s + 1) return { t: "under", n: regel.n - 1 };
      if (regel.t === "over" && regel.n < s - 1) return { t: "over", n: regel.n + 1 };
      return { t: "sum", n: s };
    }

    function lagMed(k, fro) {
      const tilf = rng(fro);
      for (let forsok = 0; forsok < 200; forsok++) {
        const { B, par } = lagForm(k, tilf);
        // Trim the bounding box to the board.
        const alle = par.flat();
        const r0 = Math.min(...alle.map((i) => Math.floor(i / B)));
        const c0 = Math.min(...alle.map((i) => i % B));
        const c1 = Math.max(...alle.map((i) => i % B));
        const r1 = Math.max(...alle.map((i) => Math.floor(i / B)));
        const BB = c1 - c0 + 1;
        const flytt = (i) => (Math.floor(i / B) - r0) * BB + ((i % B) - c0);
        const parN = par.map(([a, b]) => [flytt(a), flytt(b)]);
        const celler = parN.flat().sort((a, b) => a - b);
        const brikker = stokk(SETT.slice(), tilf).slice(0, k);
        const verdi = {};
        parN.forEach(([a, b], d) => {
          const [x, y] = tilf() < 0.5 ? brikker[d] : [brikker[d][1], brikker[d][0]];
          verdi[a] = x;
          verdi[b] = y;
        });
        const omr = lagOmrader(BB, celler, tilf, verdi);
        const omrader = omr.map((o) => ({ celler: o, regel: losRegel(o.map((i) => verdi[i]), tilf) }));
        const p = { B: BB, H: r1 - r0 + 1, celler, brikker: stokk(brikker.map((x) => x.slice()), tilf), omrader, losning: { verdi, par: parN } };
        // Tighten until only one solution is left: find another solution, pick a cell where it
        // differs, and tighten that cell's region a step – or split the cell off with a rule of
        // its own. If the other solution differs only in how the dominoes pair up, start over.
        let ferdig = false;
        for (let runde = 0; runde < 80; runde++) {
          const ut = finn(p, 2, 40000);
          if (!ut) break;
          if (ut.length === 1) {
            ferdig = true;
            p.losning = ut[0];
            break;
          }
          const annen = ut.find((x) => p.celler.some((i) => x.verdi[i] !== verdi[i]));
          if (!annen) break;
          const ulike = p.celler.filter((i) => annen.verdi[i] !== verdi[i]);
          const i = ulike[Math.floor(tilf() * ulike.length)];
          const k = p.omrader.findIndex((o) => o.celler.includes(i));
          const o = p.omrader[k];
          const v = o.celler.map((j) => verdi[j]);
          const s = o.regel.t === "ingen" ? losRegel2(v, tilf) : strammere(o.regel, v);
          if (s && !(o.regel.t === "sum" && s.t === "sum")) {
            o.regel = s;
            continue;
          }
          // Split: the cell (with a neighbour or two, in a big region) gets a rule of its own,
          // the rest are connected parts with rules of their own.
          const bfs = [i];
          for (let q = 0; q < bfs.length; q++)
            for (const n of [bfs[q] - p.B, bfs[q] + p.B, bfs[q] % p.B ? bfs[q] - 1 : -1, bfs[q] % p.B < p.B - 1 ? bfs[q] + 1 : -1])
              if (o.celler.includes(n) && !bfs.includes(n)) bfs.push(n);
          const forste = bfs.slice(0, o.celler.length >= 3 && tilf() < 0.6 ? Math.floor(o.celler.length / 2) : 1);
          const rest = o.celler.filter((j) => !forste.includes(j));
          const deler = [];
          const igjen = new Set(rest);
          for (const j0 of rest) {
            if (!igjen.has(j0)) continue;
            const del = [j0];
            igjen.delete(j0);
            for (let q = 0; q < del.length; q++)
              for (const n of [del[q] - p.B, del[q] + p.B, del[q] % p.B ? del[q] - 1 : -1, del[q] % p.B < p.B - 1 ? del[q] + 1 : -1])
                if (igjen.has(n)) {
                  igjen.delete(n);
                  del.push(n);
                }
            deler.push(del.sort((a, b) => a - b));
          }
          const vi = forste.reduce((a, j) => a + verdi[j], 0);
          const va = forste.reduce((a, j) => a + annen.verdi[j], 0);
          let enRegel;
          if (forste.length > 1 && forste.every((j) => verdi[j] === verdi[i]) && !forste.every((j) => annen.verdi[j] === annen.verdi[i])) enRegel = { t: "lik" };
          else if (tilf() < 0.5 || vi === va) enRegel = { t: "sum", n: vi };
          else if (vi < va) enRegel = { t: "under", n: vi + 1 + Math.floor(tilf() * (va - vi)) };
          else enRegel = { t: "over", n: vi - 1 - Math.floor(tilf() * (vi - va)) };
          p.omrader.splice(k, 1, { celler: forste.sort((a, b) => a - b), regel: enRegel }, ...deler.map((d) => ({ celler: d, regel: losRegel(d.map((j) => verdi[j]), tilf) })));
        }
        if (ferdig) {
          // Thin out: a rule the solution doesn't need is taken away (fewer badges, more to think
          // about), as long as the wall still has only one solution.
          p.omrader = p.omrader.filter((o) => o.regel.t !== "ingen");
          for (const o of stokk(p.omrader.slice(), tilf)) {
            const gml = o.regel;
            o.regel = { t: "ingen" };
            const prov = { B: p.B, H: p.H, celler: p.celler, brikker: p.brikker, omrader: p.omrader.filter((x) => x.regel.t !== "ingen") };
            const ut = finn(prov, 2, 40000);
            if (!ut || ut.length !== 1) o.regel = gml;
          }
          p.omrader = p.omrader.filter((o) => o.regel.t !== "ingen");
          return p;
        }
      }
      throw new Error("Mureren: fant ikke en mur"); // never seen; the tests make thousands
    }
    // A rule for a region that had none: a real one this time.
    function losRegel2(verdier, tilf) {
      for (let k = 0; k < 8; k++) {
        const r = losRegel(verdier, tilf);
        if (r.t !== "ingen") return r;
      }
      return { t: "sum", n: verdier.reduce((a, b) => a + b, 0) };
    }
    const lag = (niva, fro) => lagMed(NIVAER[niva] || NIVAER[2], fro);

    // ---------- «Dagens mur» ----------
    // Few dominoes on Monday, more at the weekend (index 0 = Sunday). Frozen.
    const DAGLIG_UKE = Object.freeze([9, 5, 6, 7, 7, 8, 9]);
    const dagligAntall = (nr) => DAGLIG_UKE[(((nr + 4) % 7) + 7) % 7];
    const lagDaglig = (dato, nr) => lagMed(dagligAntall(nr), fnv("mureren:" + dato));

    // ---------- Play ----------
    // lagt: { d: domino index, a, b (cells: the first and the second half), x, y (their pips) }.
    // Is the board full and every rule kept?
    function lost(p, lagt) {
      const verdi = new Map();
      for (const l of lagt) {
        verdi.set(l.a, l.x);
        verdi.set(l.b, l.y);
      }
      if (verdi.size !== p.celler.length || !p.celler.every((i) => verdi.has(i))) return false;
      return p.omrader.every((o) => holder(o.regel, o.celler.map((i) => verdi.get(i))));
    }
    // The state of each region: "tom" (not full yet), "ok" or "feil".
    function status(p, lagt) {
      const verdi = new Map();
      for (const l of lagt) {
        verdi.set(l.a, l.x);
        verdi.set(l.b, l.y);
      }
      return p.omrader.map((o) => {
        const v = o.celler.filter((i) => verdi.has(i)).map((i) => verdi.get(i));
        if (v.length < o.celler.length) return kanHolde(o.regel, v, o.celler.length - v.length) ? "tom" : "feil";
        return holder(o.regel, v) ? "ok" : "feil";
      });
    }

    return { rng, fnv, SETT, kanHolde, holder, finn, tell, NIVAER, lagForm, lagMed, lag, DAGLIG_UKE, dagligAntall, lagDaglig, lost, status };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    if (typeof window === "object" && window) window.Mureren = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;

  const NIVAER = [1, 2, 3];
  const NIVANAVN = Object.assign(Object.create(null), { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") });
  const NIVANAVN_LITEN = Object.assign(Object.create(null), { 1: R.t("lett"), 2: R.t("middels"), 3: R.t("vanskelig") });
  const NIVATEKST = Object.assign(Object.create(null), {
    1: R.t("Fem brikker – en god start"),
    2: R.t("Sju brikker – passe utfordring"),
    3: R.t("Ni brikker – for den seige"),
  });
  const HINT = 3;
  const MAKS_ANGRE = 200;
  const FORSTE = 20770; // «nr. 1» is 13 November 2026 (R.dag().nr)
  const NAVN = () => (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || R.t("Mureren");
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/mureren/" }).href;
  // Region colours: soft paper tints (the rule and the dashed border tell regions apart too).
  const FARGER = ["#ffd6e5", "#d7f5e9", "#fff0b8", "#dcd6ff", "#cdeeff", "#ffe0c7", "#e6f7c4", "#f6d9ff"];

  let H;
  let klokkeFra = null;
  let las = false;
  let inntil = 0;
  let markor = -1; // the keyboard's cell

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
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const klokkeTekst = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const nedtellingHtml = () => `<p class="mu-nedtelling">${esc(R.t("Ny mur om {tid}")).replace("{tid}", `<b>${klokkeTekst(sekunderTilNy())}</b>`)}</p>`;
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".mu-nedtelling b");
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
  // sp: { p (the puzzle), lagt: [{ d, a, b, x, y }], valgt (a domino in hand or null), snu (0–3),
  //   angre: [lagt …], tid, hintIgjen, hintet: [cells], pause, ferdig, resultat, dagens, dagNr, niva }

  const aktiv = (S) => (S.modus === "dag" ? S.dag : S.fri);
  const iGang = (sp) => !!(sp && !sp.ferdig);
  const dagensSpill = (S) => (S.dag && S.dag.dagens === R.dag().tekst ? S.dag : null);
  const dagRekke = (S) => (S.daglig.sistNr >= R.dag().nr - 1 ? S.daglig.rekke || 0 : 0);
  const paabegynt = (sp) => sp.lagt.length > 0;

  function nyttSpill(S, dag) {
    const t0 = performance.now();
    const d = dag ? R.dag() : null;
    const niva = NIVAER.includes(S.oppsett.niva) ? S.oppsett.niva : 2;
    const p = dag ? M.lagDaglig(d.tekst, d.nr) : M.lag(niva, R.nyttFro());
    const sp = { p, niva: dag ? null : niva, lagt: [], valgt: 0, snu: 0, angre: [], tid: 0, hintIgjen: HINT, hintet: [], pause: false, ferdig: false, resultat: null, dagens: d ? d.tekst : null, dagNr: d ? d.nr : null };
    if (dag) S.dag = sp;
    else S.fri = sp;
    S.modus = dag ? "dag" : "fri";
    klokkeFra = null;
    las = false;
    markor = -1;
    R.statistikk("start", { brikker: p.brikker.length, dagens: !!dag, ms: Math.round(performance.now() - t0) });
  }

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
  function meldIGang(S) {
    const sp = dagensSpill(S);
    if (!sp || sp.ferdig || S.daglig.dager[sp.dagens] || !paabegynt(sp)) return;
    R.dagligIGang({ tekst: visTid(sp.tid) });
  }

  // ---------- Pieces ----------

  // Pips on a 1 × 1 face.
  const PIPS = {
    0: [],
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  };
  const pips = (n, dx, dy) => PIPS[n].map(([x, y]) => `<circle cx="${dx + x}" cy="${dy + y}" r="0.1"/>`).join("");
  // A domino lying flat [a|b] (the board's pieces are drawn the same way, turned by CSS).
  const brikkeSvg = (a, b, klasse) => `<svg class="${klasse}" viewBox="0 0 2 1" aria-hidden="true" focusable="false"><rect x="0.03" y="0.03" width="1.94" height="0.94" rx="0.16"/><path d="M1 0.16V0.84"/>${pips(a, 0, 0)}${pips(b, 1, 0)}</svg>`;
  const regelTekst = (r) => (r.t === "sum" ? String(r.n) : r.t === "lik" ? "=" : r.t === "ulik" ? "≠" : r.t === "under" ? `<${r.n}` : `>${r.n}`);
  const regelLes = (r) =>
    r.t === "sum" ? R.t("summen er {n}", { n: r.n }) : r.t === "lik" ? R.t("alle like") : r.t === "ulik" ? R.t("alle forskjellige") : r.t === "under" ? R.t("summen er under {n}", { n: r.n }) : R.t("summen er over {n}", { n: r.n });
  const brikkeNavn = (a, b) => R.t("brikke {a} og {b}", { a, b });
  const sted = (p, i) => R.t("Rad {r}, kolonne {k}", { r: Math.floor(i / p.B) + 1, k: (i % p.B) + 1 });

  function verdiKart(sp) {
    const v = new Map();
    for (const l of sp.lagt) {
      v.set(l.a, l.x);
      v.set(l.b, l.y);
    }
    return v;
  }

  function brettHtml(sp) {
    const p = sp.p;
    const pa = new Set(p.celler);
    const omradeAv = new Map();
    p.omrader.forEach((o, k) => o.celler.forEach((i) => omradeAv.set(i, k)));
    const status = M.status(p, sp.lagt);
    let celler = "";
    for (let i = 0; i < p.B * p.H; i++) {
      if (!pa.has(i)) {
        celler += '<i class="mu-hull" aria-hidden="true"></i>';
        continue;
      }
      const k = omradeAv.get(i);
      const kanter = [];
      const samme = (j) => pa.has(j) && omradeAv.get(j) === k && k != null;
      if (!samme(i - p.B)) kanter.push("t");
      if (!(i % p.B < p.B - 1 && samme(i + 1))) kanter.push("h");
      if (!samme(i + p.B)) kanter.push("b");
      if (!(i % p.B > 0 && samme(i - 1))) kanter.push("v");
      const o = k != null ? p.omrader[k] : null;
      const forst = o && o.celler[0] === i;
      const lese = `${sted(p, i)}${o ? `, ${regelLes(o.regel)}` : ""}`;
      celler += `<button type="button" class="mu-celle${o ? " omr" : ""}" data-h="celle" data-v="${i}" data-k="${kanter.join("")}" style="${o ? `--of:${FARGER[k % FARGER.length]};` : ""}--x:${i % p.B};--y:${Math.floor(i / p.B)}" aria-label="${esc(lese)}">${forst ? `<b class="mu-regel ${status[k]}" aria-hidden="true">${esc(regelTekst(o.regel))}</b>` : ""}</button>`;
    }
    const lagt = sp.lagt
      .map((l, n) => {
        const ra = Math.floor(l.a / p.B);
        const ca = l.a % p.B;
        const rb = Math.floor(l.b / p.B);
        const cb = l.b % p.B;
        const ligg = ra === rb;
        // Drawn as [first|second] from the top-left cell.
        const [v1, v2] = (ligg ? ca < cb : ra < rb) ? [l.x, l.y] : [l.y, l.x];
        const x = Math.min(ca, cb);
        const y = Math.min(ra, rb);
        return `<button type="button" class="mu-lagt${ligg ? "" : " staar"}${sp.hintet.includes(l.a) ? " hintet" : ""}" data-h="ta" data-v="${n}" style="--x:${x};--y:${y}" aria-label="${esc(R.t("{brikke} ligger på {sted}. Trykk for å ta den opp.", { brikke: brikkeNavn(l.x, l.y), sted: sted(p, Math.min(l.a, l.b)) }))}">${brikkeSvg(v1, v2, "mu-flate")}</button>`;
      })
      .join("");
    return `<div class="mu-ruter" style="--b:${p.B};--h:${p.H}">${celler}${lagt}</div>`;
  }

  function hand(sp) {
    const brukt = new Set(sp.lagt.map((l) => l.d));
    return sp.p.brikker
      .map(([a, b], d) => {
        if (brukt.has(d)) return "";
        const valgt = sp.valgt === d;
        return `<button type="button" class="mu-hand${valgt ? " valgt" : ""}" data-h="velg" data-v="${d}" aria-pressed="${valgt}" aria-label="${esc(valgt ? R.t("{brikke}, valgt. Trykk igjen for å snu.", { brikke: brikkeNavn(a, b) }) : brikkeNavn(a, b))}" style="--snu:${valgt ? sp.snu * 90 : 0}deg">${brikkeSvg(a, b, "mu-flate")}</button>`; // sprak-ok (class names)
      })
      .join("");
  }

  const IKON = {
    snu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>',
  };

  function hudHtml(sp) {
    return `<div class="mu-hud">
      <span class="mu-stat"><small>${esc(sp.dagens ? R.t("Dagens") : R.t("Nivå"))}</small><b>${esc(sp.dagens ? R.flertall(sp.p.brikker.length, "brikke", "brikker") : NIVANAVN[sp.niva])}</b></span>
      <button type="button" class="mu-klokke" data-h="pause" data-stille aria-label="${esc(sp.pause ? R.t("Fortsett") : R.t("Pause"))}"><span class="mu-pauseikon">${IKON.pause}</span><span class="mu-klokketekst"><small>${esc(R.t("Tid"))}</small><b id="mu-tid">${visTid(tidMs(sp))}</b></span></button>
      <span class="mu-stat"><small>${esc(R.t("Lagt"))}</small><b id="mu-antall">${sp.lagt.length}/${sp.p.brikker.length}</b></span>
    </div>`;
  }

  function verktoyHtml(sp) {
    return `<div class="mu-verktoy">
      <button type="button" class="mu-verk" data-h="snu" data-stille${sp.valgt == null ? " disabled" : ""}>${IKON.snu}<span>${esc(R.t("Snu"))}</span></button>
      <button type="button" class="mu-verk" data-h="angre" data-stille${sp.angre.length ? "" : " disabled"}>${IKON.angre}<span>${esc(R.t("Angre"))}</span></button>
      <button type="button" class="mu-verk" data-h="hint" data-stille${sp.hintIgjen > 0 ? "" : " disabled"} aria-label="${esc(R.t("Hint, {n} igjen", { n: sp.hintIgjen }))}">${IKON.hint}<span>${esc(R.t("Hint"))}</span><i class="mu-merke" aria-hidden="true">${sp.hintIgjen}</i></button>
    </div>`;
  }

  // ---------- Fitting the board ----------

  function tilpass() {
    const flate = R.$(".mu-flate-omr");
    const ruter = R.$(".mu-ruter");
    const sp = R.S && aktiv(R.S);
    if (!flate || !ruter || !sp) return;
    const c = Math.floor(Math.min((flate.clientWidth - 8) / sp.p.B, (flate.clientHeight - 8) / sp.p.H, 68));
    ruter.style.setProperty("--c", Math.max(34, c) + "px");
  }

  let meldingId = null;
  function melding(tekst) {
    const m = R.$(".mu-melding");
    if (!m) return R.toast(tekst);
    m.textContent = tekst;
    m.classList.add("vis");
    clearTimeout(meldingId);
    meldingId = setTimeout(() => {
      m.classList.remove("vis");
      meldingId = setTimeout(() => (m.textContent = ""), 300);
    }, Math.max(3000, tekst.length * 60));
  }

  // ---------- Moves ----------

  const kanSpille = (sp) => !!sp && !sp.ferdig && !sp.pause && !las;
  function endre(sp) {
    sp.angre.push(sp.lagt.map((l) => Object.assign({}, l)));
    if (sp.angre.length > MAKS_ANGRE) sp.angre.shift();
  }
  // The values of the domino in hand, first and second half, for its turn (0 [a|b], 1 a over b,
  // 2 [b|a], 3 b over a), and whether it lies flat.
  function iHand(sp) {
    const [a, b] = sp.p.brikker[sp.valgt];
    return { ligg: sp.snu % 2 === 0, x: sp.snu < 2 ? a : b, y: sp.snu < 2 ? b : a };
  }

  // Lay the domino in hand with its first half on cell i (the other half right or below), or –
  // if that is taken – with its second half on cell i.
  function legg(S, i) {
    const sp = aktiv(S);
    if (!kanSpille(sp)) return;
    if (sp.valgt == null) return melding(R.t("Velg en brikke nederst først."));
    const p = sp.p;
    const pa = new Set(p.celler);
    const opptatt = verdiKart(sp);
    const h = iHand(sp);
    const steg = h.ligg ? 1 : p.B;
    const fri = (j) => pa.has(j) && !opptatt.has(j) && (h.ligg ? Math.floor(j / p.B) === Math.floor(i / p.B) : true);
    let a = null;
    let b = null;
    if (fri(i) && fri(i + steg)) {
      a = i;
      b = i + steg;
    } else if (fri(i) && fri(i - steg)) {
      a = i - steg;
      b = i;
    }
    if (a == null) {
      R.lyd.tone(220, 0, 0.1, "triangle", 0.06, 180);
      return melding(opptatt.has(i) ? R.t("Den ruta er opptatt.") : h.ligg ? R.t("Det er ikke plass til brikka bortover her. Trykk Snu for å legge den på høykant.") : R.t("Det er ikke plass til brikka på høykant her. Trykk Snu for å legge den ned."));
    }
    endre(sp);
    sp.lagt.push({ d: sp.valgt, a, b, x: h.x, y: h.y });
    sp.hintet = [];
    // The next domino in hand, so a quick player can go on laying.
    const brukt = new Set(sp.lagt.map((l) => l.d));
    const neste = sp.p.brikker.findIndex((_, d) => !brukt.has(d));
    sp.valgt = neste < 0 ? null : neste;
    sp.snu = 0;
    R.lyd.tone(380, 0, 0.06, "square", 0.05);
    R.lyd.tone(260, 0.04, 0.08, "triangle", 0.06);
    R.vibrer(12);
    etterEndring(S, R.t("{brikke} lagt på {sted}.", { brikke: brikkeNavn(h.x, h.y), sted: sted(p, a) }));
  }

  function taOpp(S, n) {
    const sp = aktiv(S);
    if (!kanSpille(sp) || !sp.lagt[n]) return;
    endre(sp);
    const l = sp.lagt.splice(n, 1)[0];
    sp.valgt = l.d;
    const [a] = sp.p.brikker[l.d];
    const ligg = Math.floor(l.a / sp.p.B) === Math.floor(l.b / sp.p.B);
    sp.snu = (ligg ? 0 : 1) + (l.x === a ? 0 : 2);
    sp.hintet = [];
    R.lyd.tone(520, 0, 0.06, "triangle", 0.06, 420);
    etterEndring(S, R.t("{brikke} tatt opp.", { brikke: brikkeNavn(l.x, l.y) }));
  }

  function etterEndring(S, si) {
    const sp = aktiv(S);
    if (M.lost(sp.p, sp.lagt)) return vinn(S);
    const status = M.status(sp.p, sp.lagt);
    if (status.includes("feil") && sp.lagt.length === sp.p.brikker.length) melding(R.t("Alle brikkene ligger, men noen regler stemmer ikke ennå."));
    if (si) R.si(si);
    R.vis();
    R.lagre();
  }

  function angre(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp) || !sp.angre.length) return;
    sp.lagt = sp.angre.pop();
    sp.hintet = [];
    R.lyd.tone(500, 0, 0.08, "triangle", 0.08, 420);
    R.si(R.t("Angret."));
    R.vis();
    R.lagre();
  }

  // A hint: dominoes that lie wrong go back to the hand, then one more is laid right.
  function brukHint(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp)) return;
    if (sp.hintIgjen <= 0) return melding(R.t("Du har brukt alle hintene"));
    const p = sp.p;
    const L = p.losning;
    const riktig = (l) => L.par.some(([a, b]) => (a === l.a && b === l.b) || (a === l.b && b === l.a)) && L.verdi[l.a] === l.x && L.verdi[l.b] === l.y;
    endre(sp);
    const feil = sp.lagt.filter((l) => !riktig(l)).length;
    sp.lagt = sp.lagt.filter(riktig);
    const ligger = new Set(sp.lagt.flatMap((l) => [l.a, l.b]));
    const par = L.par.find(([a]) => !ligger.has(a));
    sp.hintIgjen -= 1;
    if (par) {
      const [a, b] = par;
      const x = L.verdi[a];
      const y = L.verdi[b];
      const d = p.brikker.findIndex(([u, v]) => (u === x && v === y) || (u === y && v === x));
      sp.lagt.push({ d, a, b, x, y });
      sp.hintet = [a];
      const brukt = new Set(sp.lagt.map((l) => l.d));
      const neste = p.brikker.findIndex((_, k) => !brukt.has(k));
      sp.valgt = neste < 0 ? null : neste;
      sp.snu = 0;
      melding(feil ? R.t("Brikker som lå feil, er tatt opp, og én er lagt riktig.") : R.t("Én brikke er lagt riktig for deg."));
    }
    R.lyd.tone(990, 0, 0.12, "sine", 0.12);
    R.lyd.tone(1480, 0.1, 0.22, "sine", 0.1);
    if (M.lost(p, sp.lagt)) return vinn(S);
    R.vis();
    R.lagre();
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
    R.vis();
    R.lagre();
  }

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
    const el = R.$("#mu-tid");
    if (el) el.textContent = visTid(tidMs(sp));
  }

  function vinn(S) {
    const sp = aktiv(S);
    stoppKlokke(S);
    sp.ferdig = true;
    sp.valgt = null;
    sp.hintet = [];
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const hint = HINT - sp.hintIgjen;
    const res = { sek, hint };
    if (sp.dagens) {
      const d = S.daglig;
      const forrige = d.dager[sp.dagens];
      res.dagForrige = forrige ? forrige.sek : null;
      if (!forrige) {
        d.dager[sp.dagens] = { sek, hint, n: sp.p.brikker.length };
        if (d.sistNr === sp.dagNr - 1) d.rekke += 1;
        else if (d.sistNr !== sp.dagNr) d.rekke = 1;
        d.sistNr = Math.max(d.sistNr || 0, sp.dagNr);
        d.beste = Math.max(d.beste || 0, d.rekke);
        const dager = Object.keys(d.dager).sort();
        for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete d.dager[k];
        if (sp.dagens === R.dag().tekst) R.dagligFerdig({ vunnet: true, rekke: d.rekke, res: visTid(sek * 1000) });
      }
      res.rekke = d.rekke;
    } else {
      const gml = S.rekorder[sp.niva] || null;
      res.gml = gml ? gml.tid : null;
      res.nyRekord = !!gml && sek < gml.tid;
      res.forste = !gml;
      S.rekorder[sp.niva] = { tid: gml ? Math.min(gml.tid, sek) : sek, antall: (gml ? gml.antall : 0) + 1 };
    }
    sp.angre = [];
    sp.resultat = res;
    R.statistikk("ferdig", { brikker: sp.p.brikker.length, dagens: !!sp.dagens, sek, hint });
    R.lagre();
    las = true;
    R.vis();
    R.lyd.riktig();
    R.vibrer([30, 50, 30, 50, 120]);
    const ruter = R.$(".mu-ruter");
    if (ruter && !R.rolig()) ruter.classList.add("vant");
    const fortsatt = R.vakt();
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 700 : 1600,
    );
  }

  // ---------- Keyboard ----------
  // Arrows move between cells, Enter or Space lays the domino in hand there (or picks one up),
  // 1–9 take a domino in hand, R turns it, Ctrl/Cmd+Z undo, H hint, P pause.

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
    if (!kanSpille(sp)) return;
    const p = sp.p;
    const lav = k.toLowerCase();
    const PIL = { ArrowUp: -p.B, ArrowDown: p.B, ArrowLeft: -1, ArrowRight: 1 };
    const celle = el && el.classList && el.classList.contains("mu-celle") ? Number(el.dataset.v) : null;
    if (PIL[k] && celle != null) {
      e.preventDefault();
      let j = celle;
      const pa = new Set(p.celler);
      for (let n = 0; n < Math.max(p.B, p.H); n++) {
        const ny = j + PIL[k];
        if ((k === "ArrowLeft" || k === "ArrowRight") && Math.floor(ny / p.B) !== Math.floor(celle / p.B)) break;
        if (ny < 0 || ny >= p.B * p.H) break;
        j = ny;
        if (pa.has(j)) break;
      }
      const mal = R.$(`.mu-celle[data-v="${j}"]`);
      if (mal) mal.focus();
    } else if (/^[1-9]$/.test(k)) {
      const brukt = new Set(sp.lagt.map((l) => l.d));
      const ledige = p.brikker.map((_, d) => d).filter((d) => !brukt.has(d));
      const d = ledige[Number(k) - 1];
      if (d != null) {
        e.preventDefault();
        H.velg({ dataset: { v: String(d) } }, e, S);
      }
    } else if (lav === "r") {
      e.preventDefault();
      H.snu(null, e, S);
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

  // ---------- Saved state ----------

  function gyldigSpill(sp, dag) {
    if (!sp || typeof sp !== "object" || !sp.p || typeof sp.p !== "object") return false;
    if (dag ? typeof sp.dagens !== "string" || !Number.isInteger(sp.dagNr) : sp.dagens != null || !NIVAER.includes(sp.niva)) return false;
    const p = sp.p;
    if (!Number.isInteger(p.B) || !Number.isInteger(p.H) || p.B < 1 || p.B > 6 || p.H < 1 || p.H > 6) return false;
    if (!Array.isArray(p.celler) || !Array.isArray(p.brikker) || !Array.isArray(p.omrader) || !p.losning || p.celler.length !== p.brikker.length * 2) return false;
    if (!p.celler.every((i) => Number.isInteger(i) && i >= 0 && i < p.B * p.H)) return false;
    if (!p.brikker.every((x) => Array.isArray(x) && x.length === 2 && x.every((v) => Number.isInteger(v) && v >= 0 && v <= 6))) return false;
    if (!p.omrader.every((o) => o && Array.isArray(o.celler) && o.regel && ["sum", "lik", "ulik", "under", "over"].includes(o.regel.t))) return false;
    if (!M.lost(p, p.losning.par.map(([a, b]) => ({ a, b, x: p.losning.verdi[a], y: p.losning.verdi[b] })))) return false;
    const pa = new Set(p.celler);
    const lovlig = (lagt) => {
      if (!Array.isArray(lagt)) return false;
      const brukt = new Set();
      const dekket = new Set();
      for (const l of lagt) {
        if (!l || !p.brikker[l.d] || brukt.has(l.d) || !pa.has(l.a) || !pa.has(l.b) || dekket.has(l.a) || dekket.has(l.b)) return false;
        const [u, v] = p.brikker[l.d];
        if (!((l.x === u && l.y === v) || (l.x === v && l.y === u))) return false;
        if (!(Math.abs(l.a - l.b) === p.B || (Math.abs(l.a - l.b) === 1 && Math.floor(l.a / p.B) === Math.floor(l.b / p.B)))) return false;
        brukt.add(l.d);
        dekket.add(l.a);
        dekket.add(l.b);
      }
      return true;
    };
    if (!lovlig(sp.lagt)) sp.lagt = [];
    sp.angre = Array.isArray(sp.angre) ? sp.angre.filter(lovlig).slice(-MAKS_ANGRE) : [];
    const brukt = new Set(sp.lagt.map((l) => l.d));
    if (sp.valgt != null && (!p.brikker[sp.valgt] || brukt.has(sp.valgt))) sp.valgt = null;
    sp.snu = [0, 1, 2, 3].includes(sp.snu) ? sp.snu : 0;
    sp.hintet = [];
    sp.hintIgjen = R.klamp(Number(sp.hintIgjen) || 0, 0, HINT);
    sp.tid = Math.max(0, Number(sp.tid) || 0);
    sp.pause = !!sp.pause;
    sp.ferdig = M.lost(p, sp.lagt);
    if (sp.ferdig && !sp.resultat) sp.resultat = { sek: Math.round(sp.tid / 1000), hint: HINT - sp.hintIgjen };
    return true;
  }

  const kalender = (tekst) => `<span class="mu-kal" aria-hidden="true"><small>${esc(datoFmt(tekst, { month: "short" }).replace(".", "").slice(0, 3))}</small><b>${Number(tekst.slice(8, 10))}</b></span>`;

  // ---------- Start ----------

  R.start({
    id: "mureren",
    versjon: 1,
    pagar: (S) => iGang(S.fri) || iGang(dagensSpill(S)),

    tilstand: () => ({
      oppsett: { niva: 2 },
      rekorder: {},
      daglig: { dager: {}, rekke: 0, beste: 0, sistNr: 0 },
      fri: null,
      dag: null,
      modus: "fri",
    }),

    lastet(S) {
      S.oppsett = { niva: NIVAER.includes(S.oppsett && S.oppsett.niva) ? S.oppsett.niva : 2 };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      for (const k of Object.keys(S.rekorder)) if (!NIVAER.includes(Number(k)) || !S.rekorder[k] || !(S.rekorder[k].tid > 0)) delete S.rekorder[k];
      const d = S.daglig;
      if (!d || typeof d !== "object" || !d.dager || typeof d.dager !== "object") S.daglig = { dager: {}, rekke: 0, beste: 0, sistNr: 0 };
      else {
        for (const k of Object.keys(d.dager)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d.dager[k] || !(d.dager[k].sek > 0)) delete d.dager[k];
        d.rekke = Math.max(0, Math.floor(Number(d.rekke) || 0));
        d.beste = Math.max(d.rekke, Math.floor(Number(d.beste) || 0));
        d.sistNr = Math.floor(Number(d.sistNr) || 0);
      }
      if (!gyldigSpill(S.fri, false)) S.fri = null;
      if (!gyldigSpill(S.dag, true) || S.dag.dagens !== R.dag().tekst) S.dag = null;
      if (S.modus !== "dag" && S.modus !== "fri") S.modus = "fri";
      const sp = aktiv(S);
      if (S.skjerm === "slutt" && (!sp || !sp.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!sp || sp.ferdig)) S.skjerm = sp ? "slutt" : "hjem";
      const lost = S.daglig.dager[R.dag().tekst];
      if (lost && S.daglig.sistNr === R.dag().nr) R.dagligFerdig({ vunnet: true, rekke: S.daglig.rekke, res: visTid(lost.sek * 1000) });
    },

    vedHash: (S, hash) => (hash === "dagens" ? apneDagens(S) : null),

    regler: {
      intro: R.t("Legg alle dominobrikkene på brettet, slik at hvert farget felt holder regelen sin."),
      steg: [
        [R.t("Velg og legg"), R.t("Trykk på en brikke nederst, og så på en rute. Trykk på brikka igjen, eller på Snu, for å snu den.")],
        [R.t("Les reglene"), R.t("Et tall er summen av øynene i feltet. = betyr at alle er like, ≠ at alle er forskjellige. <4 og >9 betyr at summen er under 4 eller over 9.")],
        [R.t("Hver brikke én gang"), R.t("Alle brikkene skal brukes, og hele brettet skal dekkes. Ruter uten farge har ingen regel.")],
      ],
      tips: [
        R.t("Begynn med de små feltene: en rute med 0 eller 6 sier mye."),
        R.t("En dobbel brikke (to like) passer godt i et =-felt."),
        R.t("Trykk på en brikke som ligger på brettet for å ta den opp igjen."),
        R.t("Regelen blir grønn når feltet er fullt og stemmer, og rød når det ikke kan gå."),
        R.t("Hvert brett har bare én løsning. Hint tar opp brikker som ligger feil, og legger én riktig."),
        R.t("Med tastatur: piltastene flytter mellom rutene, 1–9 velger brikke, R snur, Enter legger, H gir hint og P er pause."),
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
          const friTekst = fri ? R.t("Fortsett · {niva} · {tid}", { niva: NIVANAVN[fri.niva], tid: visTid(fri.tid) }) : R.t("Spill fritt · {niva}", { niva: NIVANAVN[S.oppsett.niva] });
          const friH = fri ? "fortsett" : "nytt";
          const bytt = R.ui.lenke(fri ? R.t("Nytt spill") : R.t("Bytt nivå"), "bytt");
          let knapper;
          if (!lost) {
            const n = M.dagligAntall(d.nr);
            const igang = dag && paabegynt(dag);
            const under = igang ? `${R.flertall(dag.p.brikker.length, "brikke", "brikker")} · ${visTid(dag.tid)}` : `${stor(ukedag(d.tekst))} · ${R.flertall(n, "brikke", "brikker")}${r > 0 ? ` · 🔥 ${R.t("{dager} på rad", { dager: R.flertall(r, "dag", "dager") })}` : ""}`;
            knapper =
              R.ui.knapp("", "dagens", { variant: "stor", tekstHtml: `${kalender(d.tekst)}<span class="mu-dagknapp"><b>${esc(igang ? R.t("Fortsett dagens") : R.t("Dagens mur"))}</b><small>${esc(under)}</small></span>` }) +
              R.ui.knapp2(friTekst, friH) +
              R.ui.lenkerad(bytt, regler);
          } else {
            knapper =
              R.ui.knapp(friTekst, friH) +
              `<p class="mu-daglinje">✓ ${esc(R.t("Dagens mur: {tid}", { tid: visTid(lost.sek * 1000) }))}${r > 1 ? ` · 🔥 ${esc(R.t("{n} dager på rad", { n: r }))}` : ""}</p>` +
              R.ui.lenkerad(R.ui.lenke(R.t("Se resultatet"), "dagens"), bytt, regler) +
              nedtellingHtml();
          }
          const rek = NIVAER.filter((n) => S.rekorder[n]).map((n) => `<li><b>${esc(NIVANAVN[n])}</b> ${visTid(S.rekorder[n].tid * 1000)}<small> · ${esc(R.flertall(S.rekorder[n].antall, "mur", "murer"))}</small></li>`);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Legg dominobrikkene på plass."))}<br><em>${esc(R.t("Hvert felt har sin regel."))}</em>`,
              knapperHtml: knapper,
              merker: [
                ["3", R.t("nivåer")],
                ["1", R.t("ny hver dag")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="mu-rekorder" aria-label="${esc(R.t("Dine beste tider"))}"><p class="etikett">${esc(R.t("Dine beste tider"))}</p><ul>${rek.join("")}</ul></section>` : "")
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
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor vanskelig?"))}</h2></div>
              ${R.ui.fliser(
                "niva",
                NIVAER.map((n) => ({ v: n, tittel: NIVANAVN[n], tekst: S.rekorder[n] ? R.t("Rekord {tid}", { tid: visTid(S.rekorder[n].tid * 1000) }) : NIVATEKST[n], ikon: `<span class="mu-ikon" aria-hidden="true">${"▮".repeat(n)}</span>` })),
                S.oppsett.niva,
              )}
              <p class="hjelp">${esc(R.t("Hver mur er ny og har bare én løsning – du trenger aldri gjette."))}</p>
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
            <h1 class="vh" id="skjerm-tittel">${esc(sp.dagens ? R.t("Dagens mur") : R.t("Mureren, {niva}", { niva: NIVANAVN[sp.niva] }))}</h1>
            <div class="mu-spill${sp.pause ? " pauset" : ""}">
              <div class="mu-topp">${hudHtml(sp)}</div>
              <div class="mu-flate-omr">
                ${brettHtml(sp)}
                ${sp.pause ? `<div class="mu-pauseboks"><div class="mu-pausekort"><p class="etikett">${esc(R.t("Pause"))}</p><p class="mu-pausetekst">${esc(R.t("Muren venter på deg."))}</p>${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}</div></div>` : ""}
              </div>
              <div class="mu-side">
                <p class="mu-melding" role="status"></p>
                <div class="mu-handrad" role="group" aria-label="${esc(R.t("Brikkene dine"))}">${hand(sp) || `<p class="mu-tomhand">${esc(R.t("Alle brikkene ligger på brettet."))}</p>`}</div>
                ${R.ui.dokk(verktoyHtml(sp))}
              </div>
            </div>`;
        },
        etter(S, rot) {
          tilpass();
          const flate = R.$(".mu-flate-omr", rot);
          if (flate && typeof ResizeObserver === "function") {
            const obs = new ResizeObserver(() => tilpass());
            obs.observe(flate);
            R.vedForlat(() => obs.disconnect());
          }
          if (markor >= 0) {
            const el = R.$(`.mu-celle[data-v="${markor}"]`, rot);
            if (el) el.setAttribute("data-fokus", "");
          }
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp || sp.ferdig) return R.gaTil(sp ? "slutt" : "hjem");
          las = false;
          inntil = performance.now();
          document.documentElement.classList.add("mu-fast");
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
          document.documentElement.classList.remove("mu-fast");
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
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const tall = `<div class="mu-resultat">
              <div class="mu-tall-boks${r.nyRekord ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>${esc(R.t("tid"))}</span>${r.nyRekord ? `<i class="mu-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="mu-tall-boks"><b>${r.hint}</b><span>${esc(R.t("hint brukt|hint brukt", { n: r.hint }))}</span></div>
            </div>`;
          const mini = `<div class="mu-mini" aria-hidden="true">${brettHtml(Object.assign({}, sp, { hintet: [] }))}</div>`;
          if (sp.dagens) {
            const idag = sp.dagens === R.dag().tekst;
            const linje = r.dagForrige ? R.t("Du la dagens mur på {tid} første gang.", { tid: visTid(r.dagForrige * 1000) }) : r.hint ? R.t("Alle i hele landet får den samme muren i dag.") : R.t("Uten hint! Alle i hele landet får den samme muren i dag.");
            return `
              ${R.ui.banner({ etikett: `${R.t("{navn} nr. {nr}", { navn: NAVN(), nr: nrFor(sp.dagNr) })} · ${datoTekst(sp.dagens)}`, tittel: R.t("Godt jobba!"), klasse: "aksent" })}
              ${tall}
              <p class="hjelp">${esc(linje)}</p>
              <div class="mu-dagboks">
                ${r.rekke ? `<p class="mu-rekke"><span aria-hidden="true">🔥</span> ${esc(R.t("{dager} på rad", { dager: R.flertall(r.rekke, "dag", "dager") }))}</p>` : ""}
                ${idag ? nedtellingHtml() : `<p class="mu-nedtelling"><b>${esc(R.t("En ny mur er klar!"))}</b></p>`}
              </div>
              ${mini}
              ${R.ui.flereSpill({ antall: 1 })}
              ${idag ? R.ui.dokk(R.ui.knapp(R.t("Del resultatet"), "del"), R.ui.lenkerad(R.ui.lenke(R.t("Spill fritt"), "fri"), alle)) : R.ui.dokk(R.ui.knapp(R.t("Dagens mur"), "dagens"), R.ui.lenkerad(alle))}`;
          }
          const niva = NIVANAVN_LITEN[sp.niva];
          let linje;
          if (r.nyRekord) linje = R.t("Ny personlig rekord på {niva}! Forrige: {tid}.", { niva, tid: visTid(r.gml * 1000) });
          else if (r.gml) linje = R.t("Rekorden din på {niva}: {tid}.", { niva, tid: visTid(Math.min(r.gml, r.sek) * 1000) });
          else linje = R.t("Første mur på {niva} – nå har du en rekord å slå!", { niva });
          return `
            ${R.ui.banner({ etikett: R.t("{niva} · ferdig", { niva: NIVANAVN[sp.niva] }), tittel: r.nyRekord ? R.t("Ny rekord!") : R.t("Godt jobba!"), klasse: "aksent", stemning: r.nyRekord || !r.hint ? "jubel" : "" })}
            ${tall}
            <p class="hjelp">${esc(linje)}</p>
            ${mini}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "bytt"), alle))}`;
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp) return;
          const r = sp.resultat || {};
          if (sp.dagens && sp.dagens === R.dag().tekst) startNedtelling();
          if (r.hint === 0 || r.nyRekord || sp.dagens || r.forste) {
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
      niva(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.niva = NIVAER.includes(n) ? n : 2;
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
      velg(el, e, S) {
        const sp = aktiv(S);
        if (!kanSpille(sp)) return;
        const d = Number(el.dataset.v);
        if (!sp.p.brikker[d]) return;
        if (sp.valgt === d) sp.snu = (sp.snu + 1) % 4;
        else {
          sp.valgt = d;
          sp.snu = 0;
        }
        R.lyd.klikk();
        const h = iHand(sp);
        R.si(R.t("{brikke}, {hvordan}.", { brikke: brikkeNavn(h.x, h.y), hvordan: h.ligg ? R.t("liggende") : R.t("på høykant") }));
        R.vis();
        R.lagre();
      },
      snu(el, e, S) {
        const sp = aktiv(S);
        if (!kanSpille(sp) || sp.valgt == null) return;
        H.velg({ dataset: { v: String(sp.valgt) } }, e, S);
      },
      celle(el, e, S) {
        const sp = aktiv(S);
        if (!sp || performance.now() - inntil < 300) return;
        const i = Number(el.dataset.v);
        markor = i;
        // A cell under a domino picks it up.
        const n = sp.lagt.findIndex((l) => l.a === i || l.b === i);
        if (n >= 0) return taOpp(S, n);
        legg(S, i);
      },
      ta: (el, e, S) => taOpp(S, Number(el.dataset.v)),
      angre: (el, e, S) => angre(S),
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
        const brikker = R.flertall(best.n || sp.p.brikker.length, "brikke", "brikker");
        const tekst = `🧱 ${tittel} · ${brikker} · ${tid} · ${hint}${dager ? ` · ${dager}` : ""}. ${R.t("Klarer du dagens mur?")}`;
        const linjer = [tid, `${brikker} · ${hint}`];
        if (dager) linjer.push(dager);
        R.del(R.t("{navn} – dagens mur", { navn: NAVN() }), tekst, ADRESSE + "#utfordring", { kort: { tittel, linjer } });
      },
    }),
  });

  window.Mureren = motor;
})();
