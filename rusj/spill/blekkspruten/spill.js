/* Blekkspruten — nonogram: the numbers beside each row and above each column say how long the
   runs of inked squares are, in order. Ink the squares and a picture appears.
   Two kinds of puzzles: hand-made pictures (each checked to have exactly one solution that pure
   line logic reaches) and generated ones: a random blobby picture, kept only when line logic
   alone solves it – so it has exactly one solution and never needs a guess. «Dagens nonogram»
   uses today's date as the seed, so everyone gets the same one. The engine at the top is pure and
   also runs under node (test/blekkspruten.test.mjs). */
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
    function fnv(tekst) {
      let h = 0x811c9dc5;
      for (let i = 0; i < tekst.length; i++) {
        h ^= tekst.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }

    // The runs of a line (1 = inked): [1,1,0,1] → [2, 1]; an empty line → [].
    function hint(linje) {
      const ut = [];
      let n = 0;
      for (const x of linje) {
        if (x === 1) n++;
        else if (n) {
          ut.push(n);
          n = 0;
        }
      }
      if (n) ut.push(n);
      return ut;
    }
    const rad = (celler, R, C, r) => Array.from({ length: C }, (_, c) => celler[r * C + c]);
    const kolonne = (celler, R, C, c) => Array.from({ length: R }, (_, r) => celler[r * C + c]);
    // The clues of a picture: { rader: [[…]], kolonner: [[…]] }.
    function ledetrader(R, C, celler) {
      const rader = [];
      const kolonner = [];
      for (let r = 0; r < R; r++) rader.push(hint(rad(celler, R, C, r)));
      for (let c = 0; c < C; c++) kolonner.push(hint(kolonne(celler, R, C, c)));
      return { rader, kolonner };
    }

    // ---------- Line logic ----------
    // One line: ledd = its runs, linje = what is known (0 unknown, 1 inked, 2 empty). Every way to
    // place the runs that fits is counted at once (dynamic programming); a cell inked in all of them
    // is inked, a cell empty in all is empty. Returns the new line, or null when nothing fits.
    function linjeLos(ledd, linje) {
      const n = linje.length;
      const k = ledd.length;
      const K = k + 1;
      const tom = new Int16Array(n + 1);
      for (let i = 0; i < n; i++) tom[i + 1] = tom[i] + (linje[i] === 2 ? 1 : 0);
      // S[i][j]: cells i… can hold runs j… (and nothing else)
      const S = new Uint8Array((n + 2) * K);
      S[n * K + k] = 1;
      for (let i = n - 1; i >= 0; i--)
        for (let j = k; j >= 0; j--) {
          let ok = linje[i] !== 1 && S[(i + 1) * K + j];
          if (!ok && j < k) {
            const e = i + ledd[j];
            if (e <= n && tom[e] === tom[i]) ok = e === n ? j + 1 === k : linje[e] !== 1 && S[(e + 1) * K + j + 1];
          }
          S[i * K + j] = ok ? 1 : 0;
        }
      if (!S[0]) return null;
      // Walk forward through the placements that can finish, noting what each cell can be.
      const na = new Uint8Array((n + 2) * K);
      na[0] = 1;
      const kanFylt = new Uint8Array(n);
      const kanTom = new Uint8Array(n);
      for (let i = 0; i < n; i++)
        for (let j = 0; j <= k; j++) {
          if (!na[i * K + j] || !S[i * K + j]) continue;
          if (linje[i] !== 1 && S[(i + 1) * K + j]) {
            kanTom[i] = 1;
            na[(i + 1) * K + j] = 1;
          }
          if (j < k) {
            const e = i + ledd[j];
            if (e > n || tom[e] !== tom[i]) continue;
            if (e === n) {
              if (j + 1 === k) {
                for (let x = i; x < e; x++) kanFylt[x] = 1;
                na[n * K + k] = 1;
              }
            } else if (linje[e] !== 1 && S[(e + 1) * K + j + 1]) {
              for (let x = i; x < e; x++) kanFylt[x] = 1;
              kanTom[e] = 1;
              na[(e + 1) * K + j + 1] = 1;
            }
          }
        }
      const ut = linje.slice();
      for (let i = 0; i < n; i++) {
        if (kanFylt[i] && !kanTom[i]) ut[i] = 1;
        else if (kanTom[i] && !kanFylt[i]) ut[i] = 2;
      }
      return ut;
    }

    // Line logic over the whole board until nothing more follows. kjent: a start (0/1/2 per cell).
    // Returns { celler (0/1/2), ferdig, feil, runder }.
    function los(R, C, rader, kolonner, kjent) {
      const g = kjent ? Array.from(kjent) : new Array(R * C).fill(0);
      const radV = new Uint8Array(R).fill(1);
      const kolV = new Uint8Array(C).fill(1);
      let runder = 0;
      let endret = true;
      while (endret) {
        endret = false;
        runder++;
        for (let r = 0; r < R; r++) {
          if (!radV[r]) continue;
          radV[r] = 0;
          const l = rad(g, R, C, r);
          const u = linjeLos(rader[r], l);
          if (!u) return { celler: g, ferdig: false, feil: true, runder };
          for (let c = 0; c < C; c++)
            if (u[c] !== l[c]) {
              g[r * C + c] = u[c];
              kolV[c] = 1;
              endret = true;
            }
        }
        for (let c = 0; c < C; c++) {
          if (!kolV[c]) continue;
          kolV[c] = 0;
          const l = kolonne(g, R, C, c);
          const u = linjeLos(kolonner[c], l);
          if (!u) return { celler: g, ferdig: false, feil: true, runder };
          for (let r = 0; r < R; r++)
            if (u[r] !== l[r]) {
              g[r * C + c] = u[r];
              radV[r] = 1;
              endret = true;
            }
        }
      }
      return { celler: g, ferdig: g.every((x) => x !== 0), feil: false, runder };
    }
    // A picture is fair when line logic alone finds every cell: then it has exactly one solution.
    function rettferdig(R, C, celler) {
      const { rader, kolonner } = ledetrader(R, C, celler);
      const l = los(R, C, rader, kolonner);
      return l.ferdig && l.celler.every((x, i) => (x === 1) === (celler[i] === 1));
    }

    // ---------- Hand-made pictures ----------
    // "#" inked, "." empty, rows split by "/". Ordered from small to big.
    const BILDER = Object.freeze({
      hjertelite: ".#.#./#####/#####/.###./..#..",
      huslite: "..#../.###./#####/.#.#./.###.",
      pil: "..#../.###./#####/..#../..#..",
      hjerte: "........../.###..###./##########/##########/##########/.########./..######../...####.../....##..../..........",
      sol: "....#...../.#..#..#../..#####.../.#######../#########./.#######../..#####.../.#..#..#../....#...../..........",
      fisk: "........../...####.../..######.#/.#.######./#########./.#######.#/..######.#/...####.../........../..........",
      ballong: "...####.../..######../.########./.########./.########./..######../...####.../....##..../.....#..../....#.....",
      gran: "....##..../...####.../..######../...####.../..######../.########./..######../.########./##########/....##....",
      hus: "....##..../...####.#./..######../.########./##########/.#......#./.#.##.#.#./.#.##...#./.#.##...#./##########",
      stjerne: "....##..../....##..../...####.../##########/.########./..######../..######../.###..###./.##....##./..........",
      bat: "....#...../....##..../....###.../....####../....#####./....#...../##########/.########./..######../..........",
      katt: "#.......#./##.....##./#########./#.##.##.#./#########./####.####./.#######../..#####..#/..######.#/..########",
      mane: "...####.../.####...../.###....../###......./###......./###......./###......./.###....#./.######.../...####...",
      eple: ".....#..../....#.##../....###.../.###.####./##########/##########/##########/##########/.########./..##..##..",
      sopp: "...####.../.##.####../####..###./##.######./######.###/........../...####.../...####.../...####.../..######..",
      paraply: "....#...../..######../.########./##########/#.#.#.#.#./....#...../....#...../....#...../..#.#...../...#......",
      is: "...####.../..######../.###.####./.########./........../.########./..######../...####.../....##..../....##....",
      nokkel: "...####.../..##..##../..#....#../..##..##../...####.../....##..../....##..../....####../....##..../....###...",
      bil: "........../........../...####.../..#.#..#../.#..#...#./##########/##########/#..####..#/.##....##./..........",
      and: "..###...../.#####..../.##.###.../######..../..###...../..#######./.#########/.#########/..#######./...#####..",
      hund: "##......##/###....###/##########/.##.##.##./.########./.###..###./..##..##../..######../...####.../..........",
      kopp: "..#..#..../...#..#.../..#..#..../........../#######.../#######.#./#######..#/#######.#./.#####..../#########.",
      krone: "#...##...#/##.####.##/##########/##########/#.#.##.#.#/##########/##########/........../........../..........",
      rakett: "....##..../...####.../...####.../...#..#.../...#..#.../...####.../..######../.########./.#.#..#.#./...#..#...",
      spokelse: "...####.../.########./.########./##..##..##/##..##..##/##########/##########/##########/##########/#.##..##.#",
      note: "...#######/...#######/...#.....#/...#.....#/...#.....#/...#.....#/.###...###/####..####/####..####/.##....##.",
      snegl: "........../...####.../..##..##../.##.##.##./.#.#..#.#./.#.#.##.#./.#..#..##./##..####../##########/..........",
      sommerfugl: "##......##/###.##.###/####..####/####..####/.###..###./..##..##../.###..###./####..####/###....###/.#......#.",
      blekksprut: "...######.../..########../.##########./.##..##..##./.##..##..##./.##########./.####..####./..########../.##.#..#.##./#..#.##.#..#/#.#..##..#.#/.#..#..#..#.",
    });
    const BILDE_IDER = Object.freeze(Object.keys(BILDER));
    function bilde(id) {
      const kilde = BILDER[id];
      if (!kilde) return null;
      const rader = kilde.split("/");
      const R = rader.length;
      const C = rader[0].length;
      return { id, R, C, celler: rader.join("").split("").map((x) => (x === "#" ? 1 : 0)) };
    }

    // ---------- Generated pictures ----------
    const STORRELSER = Object.freeze([5, 8, 10, 12]);
    // Noise, mirrored half the time, then smoothed (each cell takes the majority of its 3 × 3
    // neighbourhood) so it looks like blobs and shapes rather than static.
    function tilfeldigBilde(R, C, tilf) {
      const p = 0.5 + tilf() * 0.12;
      const g = new Uint8Array(R * C);
      for (let i = 0; i < R * C; i++) g[i] = tilf() < p ? 1 : 0;
      if (tilf() < 0.65) for (let r = 0; r < R; r++) for (let c = 0; c < C / 2; c++) g[r * C + C - 1 - c] = g[r * C + c];
      const ut = new Array(R * C);
      for (let r = 0; r < R; r++)
        for (let c = 0; c < C; c++) {
          let s = 0;
          let n = 0;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue;
              n++;
              s += g[rr * C + cc];
            }
          ut[r * C + c] = s * 2 > n ? 1 : s * 2 < n ? 0 : g[r * C + c];
        }
      return ut;
    }
    // Not too empty, not too full, at most one blank line each way, and fair.
    function godtBilde(R, C, celler) {
      const fylt = celler.reduce((a, b) => a + b, 0) / (R * C);
      if (fylt < 0.38 || fylt > 0.72) return false;
      const { rader, kolonner } = ledetrader(R, C, celler);
      if (rader.filter((h) => !h.length).length > 1 || kolonner.filter((h) => !h.length).length > 1) return false;
      const l = los(R, C, rader, kolonner);
      return l.ferdig && (R < 8 || l.runder >= 3);
    }
    function lag(n, fro) {
      const R = STORRELSER.includes(n) ? n : 10;
      const tilf = rng(fro);
      for (let forsok = 0; forsok < 2000; forsok++) {
        const celler = tilfeldigBilde(R, R, tilf);
        if (godtBilde(R, R, celler)) return { R, C: R, celler };
      }
      throw new Error("Blekkspruten: fant ikke et brett"); // never seen; the tests run thousands
    }

    // ---------- «Dagens nonogram» ----------
    // Small on Monday, bigger at the weekend (index 0 = Sunday). Frozen: a day's puzzle never changes.
    const DAGLIG_UKE = Object.freeze([12, 8, 10, 10, 10, 10, 12]);
    const dagligStorrelse = (nr) => DAGLIG_UKE[(((nr + 4) % 7) + 7) % 7];
    const lagDaglig = (dato, nr) => lag(dagligStorrelse(nr), fnv("blekkspruten:" + dato));

    // ---------- Play ----------
    // rute: the board in play (0 blank, 1 inked, 2 crossed). Solved when the inked cells are the
    // picture's (crosses are only notes).
    const lost = (losning, rute) => losning.every((x, i) => (x === 1) === (rute[i] === 1));
    // Is a line done (its inked runs match its clue)?
    const linjeFerdig = (ledd, linje) => {
      const h = hint(linje);
      return h.length === ledd.length && h.every((x, i) => x === ledd[i]);
    };
    // A hint: first a wrong mark if there is one; else the line where logic finds the most from
    // what is on the board. Returns { feil: i } or { type: "rad" | "kolonne", nr, celler: [[i, v]] }.
    function hjelp(R, C, losning, rute) {
      for (let i = 0; i < R * C; i++) if ((rute[i] === 1 && losning[i] !== 1) || (rute[i] === 2 && losning[i] === 1)) return { feil: i };
      const { rader, kolonner } = ledetrader(R, C, losning);
      let best = null;
      const prov = (type, nr, ledd, celler) => {
        const l = celler.map((i) => rute[i]);
        const u = linjeLos(ledd, l);
        if (!u) return;
        const nye = [];
        celler.forEach((i, k) => u[k] !== l[k] && nye.push([i, u[k]]));
        if (nye.length && (!best || nye.length > best.celler.length)) best = { type, nr, celler: nye };
      };
      for (let r = 0; r < R; r++) prov("rad", r, rader[r], Array.from({ length: C }, (_, c) => r * C + c));
      for (let c = 0; c < C; c++) prov("kolonne", c, kolonner[c], Array.from({ length: R }, (_, r) => r * C + c));
      if (best) return best;
      // Logic always finds something on a fair board; this only guards a hand-edited save.
      const i = losning.findIndex((x, k) => x === 1 && rute[k] !== 1);
      return i < 0 ? null : { type: "rad", nr: Math.floor(i / C), celler: [[i, 1]] };
    }

    return { rng, fnv, hint, ledetrader, linjeLos, los, rettferdig, BILDER, BILDE_IDER, bilde, STORRELSER, tilfeldigBilde, godtBilde, lag, DAGLIG_UKE, dagligStorrelse, lagDaglig, lost, linjeFerdig, hjelp };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    if (typeof window === "object" && window) window.Blekkspruten = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;

  const STR = M.STORRELSER;
  const NIVA = Object.assign(Object.create(null), {
    5: R.t("Til oppvarming"),
    8: R.t("Litt å tenke på"),
    10: R.t("Passe utfordring"),
    12: R.t("For den tålmodige"),
  });
  // The pictures' names (the ids are only keys).
  const BILDENAVN = Object.assign(Object.create(null), {
    hjertelite: R.t("Lite hjerte"),
    huslite: R.t("Lite hus"),
    pil: R.t("Pil"),
    hjerte: R.t("Hjerte"),
    sol: R.t("Sol"),
    fisk: R.t("Fisk"),
    ballong: R.t("Ballong"),
    gran: R.t("Grantre"),
    hus: R.t("Hus"),
    stjerne: R.t("Stjerne"),
    bat: R.t("Seilbåt"),
    katt: R.t("Katt"),
    mane: R.t("Måne"),
    eple: R.t("Eple"),
    sopp: R.t("Fluesopp"),
    paraply: R.t("Paraply"),
    is: R.t("Iskrem"),
    nokkel: R.t("Nøkkel"),
    bil: R.t("Bil"),
    and: R.t("And"),
    hund: R.t("Hund"),
    kopp: R.t("Kopp"),
    krone: R.t("Krone"),
    rakett: R.t("Rakett"),
    spokelse: R.t("Spøkelse"),
    note: R.t("Noter"),
    snegl: R.t("Snegl"),
    sommerfugl: R.t("Sommerfugl"),
    blekksprut: R.t("Blekksprut"),
  });
  const storrelse = (R_, C) => `${R_} × ${C}`;
  const HINT = 3;
  const MAKS_ANGRE = 200;
  const FORSTE = 20770; // «nr. 1» is 13 November 2026 (R.dag().nr)
  const NAVN = () => (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || R.t("Blekkspruten");
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/blekkspruten/" }).href;

  let H; // actions
  let klokkeFra = null;
  let las = false;
  let inntil = 0;
  let markor = 0; // the keyboard's cell (not saved)

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
  const nedtellingHtml = () => `<p class="bs-nedtelling">${esc(R.t("Nytt nonogram om {tid}")).replace("{tid}", `<b>${klokkeTekst(sekunderTilNy())}</b>`)}</p>`;
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".bs-nedtelling b");
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
  // Today's puzzle and a free board live side by side (S.dag and S.fri); S.modus says which one is
  // on the screen. sp.losning and sp.rute are strings of digits (small to save).

  const aktiv = (S) => (S.modus === "dag" ? S.dag : S.fri);
  const iGang = (sp) => !!(sp && !sp.ferdig);
  const dagensSpill = (S) => (S.dag && S.dag.dagens === R.dag().tekst ? S.dag : null);
  const dagRekke = (S) => (S.daglig.sistNr >= R.dag().nr - 1 ? S.daglig.rekke || 0 : 0);
  const tall = (s) => Array.from(s, Number);
  const losningAv = (sp) => tall(sp.losning);
  const ruteAv = (sp) => tall(sp.rute);
  const navnPa = (sp) => (sp.bilde ? BILDENAVN[sp.bilde] : null);

  function nyttSpill(S, hva) {
    const t0 = performance.now();
    const d = hva === "dag" ? R.dag() : null;
    let o;
    let bildeId = null;
    if (d) o = M.lagDaglig(d.tekst, d.nr);
    else if (S.oppsett.modus === "bilde") {
      bildeId = M.BILDE_IDER.includes(S.oppsett.bilde) ? S.oppsett.bilde : M.BILDE_IDER[0];
      o = M.bilde(bildeId);
    } else o = M.lag(STR.includes(S.oppsett.n) ? S.oppsett.n : 10, R.nyttFro());
    const sp = {
      R: o.R,
      C: o.C,
      losning: o.celler.join(""),
      bilde: bildeId,
      dagens: d ? d.tekst : null,
      dagNr: d ? d.nr : null,
      rute: "0".repeat(o.R * o.C),
      angre: [],
      tid: 0,
      hintIgjen: HINT,
      verktoy: 1,
      pause: false,
      ferdig: false,
      resultat: null,
    };
    if (d) S.dag = sp;
    else S.fri = sp;
    S.modus = d ? "dag" : "fri";
    klokkeFra = null;
    las = false;
    markor = 0;
    R.statistikk("start", { n: sp.R, dagens: !!d, bilde: !!bildeId, ms: Math.round(performance.now() - t0) });
  }

  function apneDagens(S) {
    const sp = dagensSpill(S);
    const lostIDag = S.daglig.dager[R.dag().tekst];
    if (sp && sp.ferdig) {
      S.modus = "dag";
      return "slutt";
    }
    if (lostIDag && !sp) return "hjem";
    if (!sp) nyttSpill(S, "dag");
    S.modus = "dag";
    return "spill";
  }

  const paabegynt = (sp) => /[12]/.test(sp.rute);

  function meldIGang(S) {
    const sp = dagensSpill(S);
    if (!sp || sp.ferdig || S.daglig.dager[sp.dagens] || !paabegynt(sp)) return;
    R.dagligIGang({ tekst: visTid(sp.tid) });
  }

  // ---------- What the board shows ----------

  const ledAv = (sp) => M.ledetrader(sp.R, sp.C, losningAv(sp));
  const sted = (sp, i) => R.t("Rad {r}, kolonne {k}", { r: Math.floor(i / sp.C) + 1, k: (i % sp.C) + 1 });
  const lesHint = (h) => (h.length ? h.join(" ") : "0");
  const TILSTAND = () => [R.t("tom"), R.t("fylt"), R.t("kryss")];

  function brettHtml(sp) {
    const { rader, kolonner } = ledAv(sp);
    const kol = kolonner.map((h, c) => `<span data-k="${c}">${(h.length ? h : [0]).map((x) => `<b>${x}</b>`).join("")}</span>`).join("");
    const rad = rader.map((h, r) => `<span data-r="${r}">${(h.length ? h : [0]).map((x) => `<b>${x}</b>`).join("")}</span>`).join("");
    let celler = "";
    for (let r = 0; r < sp.R; r++)
      for (let c = 0; c < sp.C; c++) {
        const k = [];
        if (c % 5 === 4 && c < sp.C - 1) k.push("v5");
        if (r % 5 === 4 && r < sp.R - 1) k.push("u5");
        celler += `<i${k.length ? ` data-s="${k.join(" ")}"` : ""}></i>`;
      }
    return `<div class="bs-hjorne" aria-hidden="true"></div>
      <div class="bs-kolhint" aria-hidden="true">${kol}</div>
      <div class="bs-radhint" aria-hidden="true">${rad}</div>
      <div class="bs-ruter" aria-hidden="true">${celler}</div>`;
  }

  // One line per row for a screen reader: the clue, then the cells.
  function radTekst(sp, rute, r, ledd) {
    const T = TILSTAND();
    const celler = Array.from({ length: sp.C }, (_, c) => T[rute[r * sp.C + c]]);
    return R.t("Rad {r}, {hint}: {celler}", { r: r + 1, hint: lesHint(ledd), celler: celler.join(", ") });
  }

  const IKON = {
    fyll: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="fylt" x="5" y="5" width="14" height="14" rx="2.5"/></svg>',
    kryss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>',
  };

  const fyltAntall = (s) => (s.match(/1/g) || []).length;
  function hudHtml(sp) {
    return `<div class="bs-hud">
      <span class="bs-stat"><small>${esc(sp.dagens ? R.t("Dagens") : sp.bilde ? R.t("Bilde") : R.t("Størrelse"))}</small><b>${storrelse(sp.R, sp.C)}</b></span>
      <button type="button" class="bs-klokke" data-h="pause" data-stille aria-label="${esc(sp.pause ? R.t("Fortsett") : R.t("Pause"))}"><span class="bs-pauseikon">${IKON.pause}</span><span class="bs-klokketekst"><small>${esc(R.t("Tid"))}</small><b id="bs-tid">${visTid(tidMs(sp))}</b></span></button>
      <span class="bs-stat"><small>${esc(R.t("Blekk"))}</small><b id="bs-antall">${fyltAntall(sp.rute)}/${fyltAntall(sp.losning)}</b></span>
    </div>`;
  }

  function verktoyHtml(sp) {
    return `<div class="bs-verktoy">
      <div class="bs-valg" role="group" aria-label="${esc(R.t("Hva fingeren gjør"))}">
        <button type="button" class="bs-verk bs-v" data-h="verktoy" data-v="1" data-stille aria-pressed="${sp.verktoy === 1}">${IKON.fyll}<span>${esc(R.t("Blekk"))}</span></button>
        <button type="button" class="bs-verk bs-v" data-h="verktoy" data-v="2" data-stille aria-pressed="${sp.verktoy === 2}">${IKON.kryss}<span>${esc(R.t("Kryss"))}</span></button>
      </div>
      <button type="button" class="bs-verk" data-h="angre" id="bs-angre" data-stille${sp.angre.length ? "" : " disabled"}>${IKON.angre}<span>${esc(R.t("Angre"))}</span></button>
      <button type="button" class="bs-verk" data-h="hint" id="bs-hint" data-stille${sp.hintIgjen > 0 ? "" : " disabled"} aria-label="${esc(R.t("Hint, {n} igjen", { n: sp.hintIgjen }))}">${IKON.hint}<span>${esc(R.t("Hint"))}</span><i class="bs-merke" aria-hidden="true">${sp.hintIgjen}</i></button>
    </div>`;
  }

  // ---------- Updating the board in place ----------

  let ruter = [];
  let merket = null; // { celler: [i], feil } from the last hint
  function oppdater(S) {
    const sp = aktiv(S);
    const brett = R.$(".bs-brett");
    if (!sp || !brett) return;
    const rute = ruteAv(sp);
    const tast = brett.classList.contains("tast");
    ruter.forEach((el, i) => {
      const k = ["", "f", "x"][rute[i]] + (tast && i === markor ? " m" : "") + (merket && merket.celler.includes(i) ? (merket.feil ? " feil" : " h") : "");
      if (el.className !== k.trim()) el.className = k.trim();
    });
    const { rader, kolonner } = ledAv(sp);
    const mr = Math.floor(markor / sp.C);
    const mk = markor % sp.C;
    R.$$(".bs-radhint span", brett).forEach((el, r) => {
      el.classList.toggle("ok", M.linjeFerdig(rader[r], Array.from({ length: sp.C }, (_, c) => rute[r * sp.C + c])));
      el.classList.toggle("aktiv", tast && r === mr);
    });
    R.$$(".bs-kolhint span", brett).forEach((el, c) => {
      el.classList.toggle("ok", M.linjeFerdig(kolonner[c], Array.from({ length: sp.R }, (_, r) => rute[r * sp.C + c])));
      el.classList.toggle("aktiv", tast && c === mk);
    });
    const tekst = R.$("#bs-tekst");
    if (tekst) {
      const linjer = Array.from({ length: sp.R }, (_, r) => radTekst(sp, rute, r, rader[r]));
      const li = tekst.children;
      if (li.length !== sp.R) tekst.innerHTML = linjer.map((l) => `<li>${esc(l)}</li>`).join("");
      else linjer.forEach((l, r) => li[r].textContent !== l && (li[r].textContent = l));
    }
    const antall = R.$("#bs-antall");
    if (antall) antall.textContent = `${fyltAntall(sp.rute)}/${fyltAntall(sp.losning)}`;
    const angre = R.$("#bs-angre");
    if (angre) angre.disabled = !sp.angre.length;
    const hint = R.$("#bs-hint");
    if (hint) {
      hint.disabled = sp.hintIgjen <= 0;
      hint.setAttribute("aria-label", R.t("Hint, {n} igjen", { n: sp.hintIgjen }));
      hint.querySelector(".bs-merke").textContent = sp.hintIgjen;
    }
    R.$$(".bs-v").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.v) === sp.verktoy)));
    const spillEl = R.$(".bs-spill");
    if (spillEl) {
      spillEl.classList.toggle("pauset", !!sp.pause);
      spillEl.classList.toggle("tomt", !paabegynt(sp));
    }
    const pause = R.$(".bs-pauseboks");
    if (pause) pause.hidden = !sp.pause;
    const klokke = R.$(".bs-klokke");
    if (klokke) klokke.setAttribute("aria-label", sp.pause ? R.t("Fortsett") : R.t("Pause"));
  }

  // The biggest cells that fit, with the clues beside and above. --h is the size of one clue number.
  function tilpass() {
    const flate = R.$(".bs-flate");
    const brett = R.$(".bs-brett");
    const sp = R.S && aktiv(R.S);
    if (!flate || !brett || !sp) return;
    const ligg = window.matchMedia("(orientation: landscape) and (max-height: 600px) and (min-width: 560px)").matches;
    const under = R.$(".bs-under");
    const mal = R.$(ligg ? ".bs-plass" : ".bs-midt");
    if (under && mal && under.parentElement !== mal) mal.appendChild(under);
    const { rader, kolonner } = ledAv(sp);
    const lr = Math.max(1, ...rader.map((h) => h.length));
    const lk = Math.max(1, ...kolonner.map((h) => h.length));
    const W = flate.clientWidth - 8;
    const Hh = flate.clientHeight - 8 - (under && !ligg ? under.offsetHeight + 8 : 0);
    let c = 40;
    let h = 20;
    for (let k = 0; k < 3; k++) {
      h = Math.max(12, Math.round(c * 0.56));
      c = Math.floor(Math.min((W - lr * h - 8) / sp.C, (Hh - lk * h - 8) / sp.R));
    }
    c = Math.max(16, Math.min(52, c));
    h = Math.max(12, Math.min(26, Math.round(c * 0.56)));
    brett.style.setProperty("--c", c + "px");
    brett.style.setProperty("--h", h + "px");
  }

  let meldingId = null;
  function melding(tekst) {
    const m = R.$(".bs-melding");
    if (!m) return R.toast(tekst);
    m.textContent = tekst;
    m.classList.add("vis");
    clearTimeout(meldingId);
    meldingId = setTimeout(() => {
      m.classList.remove("vis");
      meldingId = setTimeout(() => (m.textContent = ""), 300);
    }, Math.max(3200, tekst.length * 60));
  }

  // ---------- Moves ----------

  const kanSpille = (sp) => !!sp && !sp.ferdig && !sp.pause && !las;
  function endre(sp, gammel) {
    sp.angre.push(gammel);
    if (sp.angre.length > MAKS_ANGRE) sp.angre.shift();
  }
  function sett(sp, i, v) {
    if (sp.rute[i] === String(v)) return false;
    sp.rute = sp.rute.slice(0, i) + v + sp.rute.slice(i + 1);
    return true;
  }
  const lyder = {
    1: () => R.lyd.tone(520, 0, 0.05, "triangle", 0.06),
    2: () => R.lyd.tone(300, 0, 0.04, "square", 0.03),
    0: () => R.lyd.tone(420, 0, 0.04, "triangle", 0.04, 340),
  };

  // After a change: the board, the screen reader and the win.
  function etterEndring(S, stille) {
    const sp = aktiv(S);
    merket = null;
    oppdater(S);
    if (M.lost(losningAv(sp), ruteAv(sp))) return vinn(S);
    if (!stille) {
      const T = TILSTAND();
      R.si(`${sted(sp, markor)}: ${T[Number(sp.rute[markor])]}.`);
    }
    R.lagre();
  }

  function angre(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp) || !sp.angre.length) return;
    sp.rute = sp.angre.pop();
    R.lyd.tone(500, 0, 0.08, "triangle", 0.08, 420);
    R.si(R.t("Angret."));
    merket = null;
    oppdater(S);
    R.lagre();
  }

  function brukHint(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp)) return;
    if (sp.hintIgjen <= 0) return melding(R.t("Du har brukt alle hintene"));
    const h = M.hjelp(sp.R, sp.C, losningAv(sp), ruteAv(sp));
    if (!h) return;
    sp.hintIgjen -= 1;
    endre(sp, sp.rute);
    R.lyd.tone(990, 0, 0.12, "sine", 0.12);
    R.lyd.tone(1480, 0.1, 0.22, "sine", 0.1);
    if (h.feil != null) {
      sett(sp, h.feil, 0);
      merket = { celler: [h.feil], feil: true };
      melding(R.t("Denne ruta var feil – den er visket ut. {sted}.", { sted: sted(sp, h.feil) }));
      oppdater(S);
      R.lagre();
      return;
    }
    for (const [i, v] of h.celler) sett(sp, i, v);
    const nr = h.nr + 1;
    melding(h.type === "rad" ? R.t("Se på rad {n}: det som må stå der, er fylt inn.", { n: nr }) : R.t("Se på kolonne {n}: det som må stå der, er fylt inn.", { n: nr }));
    oppdater(S);
    if (M.lost(losningAv(sp), ruteAv(sp))) return vinn(S);
    merket = { celler: h.celler.map(([i]) => i), feil: false };
    oppdater(S);
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
    oppdater(S);
    tikk();
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
    const el = R.$("#bs-tid");
    if (el) el.textContent = visTid(tidMs(sp));
  }

  // ---------- The win ----------

  function vinn(S) {
    const sp = aktiv(S);
    stoppKlokke(S);
    sp.ferdig = true;
    // Crosses are cleared: only the picture is left.
    sp.rute = sp.losning;
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const hint = HINT - sp.hintIgjen;
    const res = { sek, hint };
    if (sp.dagens) {
      const d = S.daglig;
      const forrige = d.dager[sp.dagens];
      res.dagForrige = forrige ? forrige.sek : null;
      if (!forrige) {
        d.dager[sp.dagens] = { sek, hint, n: sp.R };
        if (d.sistNr === sp.dagNr - 1) d.rekke += 1;
        else if (d.sistNr !== sp.dagNr) d.rekke = 1;
        d.sistNr = Math.max(d.sistNr || 0, sp.dagNr);
        d.beste = Math.max(d.beste || 0, d.rekke);
        const dager = Object.keys(d.dager).sort();
        for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete d.dager[k];
        if (sp.dagens === R.dag().tekst) R.dagligFerdig({ vunnet: true, rekke: d.rekke, res: visTid(sek * 1000) });
      }
      res.rekke = d.rekke;
    } else if (sp.bilde) {
      const gml = S.bilder[sp.bilde] || null;
      res.gml = gml ? gml.tid : null;
      res.nyRekord = !!gml && sek < gml.tid;
      res.forste = !gml;
      S.bilder[sp.bilde] = { tid: gml ? Math.min(gml.tid, sek) : sek };
    } else {
      const gml = S.rekorder[sp.R] || null;
      res.gml = gml ? gml.tid : null;
      res.nyRekord = !!gml && sek < gml.tid;
      res.forste = !gml;
      S.rekorder[sp.R] = { tid: gml ? Math.min(gml.tid, sek) : sek, antall: (gml ? gml.antall : 0) + 1 };
    }
    sp.angre = [];
    sp.resultat = res;
    R.statistikk("ferdig", { n: sp.R, dagens: !!sp.dagens, bilde: !!sp.bilde, sek, hint });
    R.lagre();
    las = true;
    merket = null;
    oppdater(S);
    R.lyd.riktig();
    R.vibrer([30, 50, 30, 50, 120]);
    const fortsatt = R.vakt();
    const brett = R.$(".bs-brett");
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
  // A press decides what the finger does (ink, cross or rub out) and a drag does the same along
  // the row or the column it started in. The keyboard has a cell of its own (arrows).

  let dra = null;
  function celleVed(x, y) {
    const el = R.$(".bs-ruter");
    const sp = R.S && aktiv(R.S);
    if (!el || !sp) return -1;
    const b = el.getBoundingClientRect();
    const c = (x - b.left) / (b.width / sp.C);
    const r = (y - b.top) / (b.height / sp.R);
    if (c < 0 || r < 0 || c >= sp.C || r >= sp.R) return -1;
    return Math.floor(r) * sp.C + Math.floor(c);
  }
  // What a press on a cell does with the tool in hand: the same mark again rubs it out.
  const malFor = (sp, i, verktoy) => (Number(sp.rute[i]) === verktoy ? 0 : verktoy);
  // May a drag that started with `mal` change this cell? Ink and crosses only go on blanks; rubbing
  // out only takes away the kind it started on.
  const kanMale = (fra, mal, start) => (mal === 0 ? fra === start : fra === 0);

  function bindBrett(S, rot) {
    ruter = R.$$(".bs-ruter i", rot);
    const brett = R.$(".bs-brett", rot);
    if (!brett) return;
    const ned = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
      const S2 = R.S;
      const sp = aktiv(S2);
      if (!kanSpille(sp) || performance.now() - inntil < 350) return;
      const i = celleVed(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      R.lyd.lasOpp();
      brett.classList.remove("tast");
      const verktoy = e.button === 2 ? 2 : sp.verktoy;
      const start = Number(sp.rute[i]);
      const mal = malFor(sp, i, verktoy);
      dra = { id: e.pointerId, gammel: sp.rute, mal, start, fra: i, akse: null, sist: i };
      markor = i;
      if (sett(sp, i, mal)) lyder[mal]();
      merket = null;
      oppdater(S2);
      try {
        brett.setPointerCapture(e.pointerId);
      } catch (x) {
        /* ignore */
      }
    };
    const flytt = (e) => {
      if (!dra || e.pointerId !== dra.id) return;
      const sp = aktiv(R.S);
      if (!kanSpille(sp)) return;
      const j = celleVed(e.clientX, e.clientY);
      if (j < 0 || j === dra.sist) return;
      const C = sp.C;
      const fr = Math.floor(dra.fra / C);
      const fc = dra.fra % C;
      if (!dra.akse) {
        const dr = Math.abs(Math.floor(j / C) - fr);
        const dc = Math.abs((j % C) - fc);
        if (!dr && !dc) return;
        dra.akse = dc >= dr ? "rad" : "kol";
      }
      // Along the row or the column of the first cell, every cell from there to the finger.
      const mal = dra.akse === "rad" ? fr * C + (j % C) : Math.floor(j / C) * C + fc;
      dra.sist = j;
      const steg = dra.akse === "rad" ? 1 : C;
      const a = Math.min(dra.fra, mal);
      const b = Math.max(dra.fra, mal);
      let endret = false;
      for (let k = a; k <= b; k += steg) if (kanMale(Number(dra.gammel[k]), dra.mal, dra.start) && sett(sp, k, dra.mal)) endret = true;
      // Cells the finger went back over get back what they had.
      for (let k = 0; k < sp.rute.length; k++) {
        const pa = dra.akse === "rad" ? Math.floor(k / C) === fr && k >= a && k <= b : k % C === fc && k >= a && k <= b;
        if (!pa && k !== dra.fra && sp.rute[k] !== dra.gammel[k]) {
          sp.rute = sp.rute.slice(0, k) + dra.gammel[k] + sp.rute.slice(k + 1);
          endret = true;
        }
      }
      if (endret) {
        lyder[dra.mal]();
        markor = mal;
        oppdater(R.S);
      }
    };
    const opp = (e) => {
      if (!dra || e.pointerId !== dra.id) return;
      const d = dra;
      dra = null;
      const S2 = R.S;
      const sp = aktiv(S2);
      if (!sp) return;
      if (d.gammel !== sp.rute) {
        endre(sp, d.gammel);
        etterEndring(S2, true);
      }
    };
    const fokus = () => {
      const sp = aktiv(R.S);
      if (sp && !sp.ferdig && !paabegynt(sp)) R.si(R.t("Piltastene flytter, mellomrom fyller, X krysser."));
    };
    const ingen = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    brett.addEventListener("pointerdown", ned);
    brett.addEventListener("pointermove", flytt);
    brett.addEventListener("pointerup", opp);
    brett.addEventListener("pointercancel", opp);
    brett.addEventListener("focus", fokus);
    brett.addEventListener("contextmenu", ingen);
    R.vedForlat(() => {
      dra = null;
      brett.removeEventListener("pointerdown", ned);
      brett.removeEventListener("pointermove", flytt);
      brett.removeEventListener("pointerup", opp);
      brett.removeEventListener("pointercancel", opp);
      brett.removeEventListener("focus", fokus);
      brett.removeEventListener("contextmenu", ingen);
    });
  }

  // Keyboard: arrows move, Space/Enter inks, X crosses, Backspace/Delete rubs out, Ctrl/Cmd+Z undo,
  // H hint, P pause.
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
    const lav = k.toLowerCase();
    const brett = R.$(".bs-brett");
    const pa = el && brett && brett.contains(el);
    const PIL = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (PIL[k] && pa) {
      e.preventDefault();
      brett.classList.add("tast");
      const r = R.klamp(Math.floor(markor / sp.C) + PIL[k][0], 0, sp.R - 1);
      const c = R.klamp((markor % sp.C) + PIL[k][1], 0, sp.C - 1);
      markor = r * sp.C + c;
      oppdater(S);
      const { rader, kolonner } = ledAv(sp);
      R.si(`${sted(sp, markor)}: ${TILSTAND()[Number(sp.rute[markor])]}. ${R.t("Rad: {a}. Kolonne: {b}.", { a: lesHint(rader[r]), b: lesHint(kolonner[c]) })}`);
    } else if (pa && (k === " " || k === "Enter" || lav === "x" || k === "Backspace" || k === "Delete")) {
      e.preventDefault();
      brett.classList.add("tast");
      const mal = k === "Backspace" || k === "Delete" ? 0 : malFor(sp, markor, lav === "x" ? 2 : 1);
      const gammel = sp.rute;
      if (sett(sp, markor, mal)) {
        lyder[mal]();
        endre(sp, gammel);
        etterEndring(S);
      }
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

  const fastSide = (pa) => document.documentElement.classList.toggle("bs-fast", !!pa);

  // ---------- Small pieces of the screens ----------

  const kalender = (tekst) => `<span class="bs-kal" aria-hidden="true"><small>${esc(datoFmt(tekst, { month: "short" }).replace(".", "").slice(0, 3))}</small><b>${Number(tekst.slice(8, 10))}</b></span>`;
  const storIkon = (n) => `<span class="bs-styrke" aria-hidden="true">${STR.map((k) => `<i class="${k <= n ? "pa" : ""}"></i>`).join("")}</span>`;
  // A picture in miniature (inked cells only).
  function mini(R_, C, celler, klasse) {
    let d = "";
    celler.forEach((x, i) => {
      if (x === 1) d += `M${i % C} ${Math.floor(i / C)}h1v1h-1z`;
    });
    return `<svg class="${klasse}" viewBox="-0.5 -0.5 ${C + 1} ${R_ + 1}" aria-hidden="true" focusable="false"><rect x="-0.5" y="-0.5" width="${C + 1}" height="${R_ + 1}" rx="0.8"/><path d="${d}"/></svg>`;
  }
  const bildeMini = (id, klasse) => {
    const b = M.bilde(id);
    return mini(b.R, b.C, b.celler, klasse);
  };

  const RUTE_RE = /^[012]+$/;
  function gyldigSpill(sp, dag) {
    if (!sp || typeof sp !== "object") return false;
    if (dag ? typeof sp.dagens !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sp.dagens) || !Number.isInteger(sp.dagNr) : sp.dagens != null) return false;
    if (!Number.isInteger(sp.R) || !Number.isInteger(sp.C) || sp.R < 5 || sp.R > 12 || sp.C < 5 || sp.C > 12) return false;
    const N = sp.R * sp.C;
    if (typeof sp.losning !== "string" || sp.losning.length !== N || !/^[01]+$/.test(sp.losning)) return false;
    if (sp.bilde != null && (dag || !M.BILDE_IDER.includes(sp.bilde))) return false;
    if (typeof sp.rute !== "string" || sp.rute.length !== N || !RUTE_RE.test(sp.rute)) sp.rute = "0".repeat(N);
    sp.angre = Array.isArray(sp.angre) ? sp.angre.filter((a) => typeof a === "string" && a.length === N && RUTE_RE.test(a)).slice(-MAKS_ANGRE) : [];
    sp.hintIgjen = R.klamp(Number(sp.hintIgjen) || 0, 0, HINT);
    sp.tid = Math.max(0, Number(sp.tid) || 0);
    sp.verktoy = sp.verktoy === 2 ? 2 : 1;
    sp.pause = !!sp.pause;
    sp.ferdig = !!sp.ferdig;
    if (sp.ferdig && !sp.resultat) sp.resultat = { sek: Math.round(sp.tid / 1000), hint: HINT - sp.hintIgjen };
    return true;
  }

  // ---------- Start ----------

  R.start({
    id: "blekkspruten",
    versjon: 1,
    pagar: (S) => iGang(S.fri) || iGang(dagensSpill(S)),

    tilstand: () => ({
      oppsett: { modus: "fri", n: 10, bilde: "hjertelite" },
      rekorder: {},
      bilder: {},
      daglig: { dager: {}, rekke: 0, beste: 0, sistNr: 0 },
      fri: null,
      dag: null,
      modus: "fri",
    }),

    lastet(S) {
      const o = S.oppsett || {};
      S.oppsett = {
        modus: o.modus === "bilde" ? "bilde" : "fri",
        n: STR.includes(o.n) ? o.n : 10,
        bilde: M.BILDE_IDER.includes(o.bilde) ? o.bilde : M.BILDE_IDER[0],
      };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      for (const k of Object.keys(S.rekorder)) if (!STR.includes(Number(k)) || !S.rekorder[k] || !(S.rekorder[k].tid > 0)) delete S.rekorder[k];
      if (!S.bilder || typeof S.bilder !== "object") S.bilder = {};
      for (const k of Object.keys(S.bilder)) if (!M.BILDE_IDER.includes(k) || !S.bilder[k] || !(S.bilder[k].tid > 0)) delete S.bilder[k];
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
      const lostIDag = S.daglig.dager[R.dag().tekst];
      if (lostIDag && S.daglig.sistNr === R.dag().nr) R.dagligFerdig({ vunnet: true, rekke: S.daglig.rekke, res: visTid(lostIDag.sek * 1000) });
    },

    vedHash: (S, hash) => (hash === "dagens" ? apneDagens(S) : null),

    regler: {
      intro: R.t("Tallene ved hver rad og over hver kolonne sier hvor lange strekene med blekk er, i riktig rekkefølge. Fyll rutene, så kommer et bilde fram."),
      steg: [
        [R.t("Les tallene"), R.t("«3 1» betyr tre fylte ruter på rad, minst én tom, og så én fylt rute. Et 0 betyr at hele linja er tom.")],
        [R.t("Fyll og kryss"), R.t("Trykk på en rute for å fylle den med blekk. Velg Kryss for å merke ruter du vet er tomme. Dra fingeren for å ta mange på en gang.")],
        [R.t("Ferdig når alt stemmer"), R.t("Når alle radene og kolonnene stemmer med tallene, er bildet ferdig. Tallene blir grå når en linje er riktig.")],
      ],
      tips: [
        R.t("Begynn med de store tallene: en strek på 8 i en rad på 10 må dekke de seks midterste rutene uansett hvor den ligger."),
        R.t("Kryssene er bare notater for deg selv, men de gjør det mye lettere å se hva som er igjen."),
        R.t("Trykk på en rute med samme merke igjen for å viske den ut."),
        R.t("Hvert brett har bare én løsning, og du trenger aldri gjette. Hint fyller inn det som må stå i én linje, eller viser en rute som er feil."),
        R.t("Dagens nonogram er det samme for alle: lite på mandag, større i helgen."),
        R.t("Med tastatur: piltastene flytter, mellomrom eller Enter fyller, X krysser, Backspace visker ut, H gir hint og P er pause."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = R.dag();
          const dag = dagensSpill(S);
          const lostIDag = S.daglig.dager[d.tekst];
          const fri = iGang(S.fri) ? S.fri : null;
          const r = dagRekke(S);
          const regler = R.ui.lenke(R.t("Slik spiller du"), "regler");
          const friTekst = fri
            ? R.t("Fortsett · {hva} · {tid}", { hva: fri.bilde ? BILDENAVN[fri.bilde] : storrelse(fri.R, fri.C), tid: visTid(fri.tid) })
            : S.oppsett.modus === "bilde"
              ? R.t("Mal et bilde · {navn}", { navn: BILDENAVN[S.oppsett.bilde] })
              : R.t("Spill fritt · {str}", { str: storrelse(S.oppsett.n, S.oppsett.n) });
          const friH = fri ? "fortsett" : "nytt";
          const bytt = R.ui.lenke(fri ? R.t("Nytt spill") : R.t("Velg brett"), "bytt");
          let knapper;
          if (!lostIDag) {
            const n = M.dagligStorrelse(d.nr);
            const igang = dag && paabegynt(dag);
            const under = igang ? `${storrelse(dag.R, dag.C)} · ${visTid(dag.tid)}` : `${stor(ukedag(d.tekst))} · ${storrelse(n, n)}${r > 0 ? ` · 🔥 ${R.t("{dager} på rad", { dager: R.flertall(r, "dag", "dager") })}` : ""}`;
            knapper =
              R.ui.knapp("", "dagens", {
                variant: "stor",
                tekstHtml: `${kalender(d.tekst)}<span class="bs-dagknapp"><b>${esc(igang ? R.t("Fortsett dagens") : R.t("Dagens nonogram"))}</b><small>${esc(under)}</small></span>`,
              }) +
              R.ui.knapp2(friTekst, friH) +
              R.ui.lenkerad(bytt, regler);
          } else {
            knapper =
              R.ui.knapp(friTekst, friH) +
              `<p class="bs-daglinje">✓ ${esc(R.t("Dagens nonogram: {tid}", { tid: visTid(lostIDag.sek * 1000) }))}${r > 1 ? ` · 🔥 ${esc(R.t("{n} dager på rad", { n: r }))}` : ""}</p>` +
              R.ui.lenkerad(R.ui.lenke(R.t("Se resultatet"), "dagens"), bytt, regler) +
              nedtellingHtml();
          }
          const rek = STR.filter((n) => S.rekorder[n]).map((n) => `<li><b>${storrelse(n, n)}</b> ${visTid(S.rekorder[n].tid * 1000)}<small> · ${esc(R.flertall(S.rekorder[n].antall, "brett", "brett"))}</small></li>`);
          const malt = M.BILDE_IDER.filter((id) => S.bilder[id]).length;
          if (malt) rek.push(`<li><b>${esc(R.t("Bilder"))}</b> ${esc(R.t("{n} av {alle}", { n: malt, alle: M.BILDE_IDER.length }))}</li>`);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Tallene sier hvor blekket skal."))}<br><em>${esc(R.t("Følg dem, så kommer bildet fram."))}</em>`,
              knapperHtml: knapper,
              merker: [
                [String(M.BILDE_IDER.length), R.t("bilder")],
                ["1", R.t("ny hver dag")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="bs-rekorder" aria-label="${esc(R.t("Dine beste tider"))}"><p class="etikett">${esc(R.t("Dine beste tider"))}</p><ul>${rek.join("")}</ul></section>` : "")
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
          const o = S.oppsett;
          const bilde = o.modus === "bilde";
          const valg = bilde
            ? `<section class="seksjon">
                <div class="seksjon-hode"><h2>${esc(R.t("Hvilket bilde?"))}</h2><span class="hjelp">${esc(R.t("{n} av {alle}", { n: M.BILDE_IDER.filter((id) => S.bilder[id]).length, alle: M.BILDE_IDER.length }))}</span></div>
                <div class="bs-galleri">${M.BILDE_IDER.map((id) => {
                  const b = M.bilde(id);
                  const ferdig = S.bilder[id];
                  return `<button type="button" class="bs-bildevalg${ferdig ? " malt" : ""}" data-h="bilde" data-v="${id}" aria-pressed="${o.bilde === id}" aria-label="${esc(ferdig ? `${BILDENAVN[id]}, ${storrelse(b.R, b.C)}, ${visTid(ferdig.tid * 1000)}` : R.t("Ukjent bilde, {str}", { str: storrelse(b.R, b.C) }))}">${ferdig ? bildeMini(id, "bs-tommel") : `<span class="bs-ukjent" aria-hidden="true">?</span>`}<small>${storrelse(b.R, b.C)}</small></button>`;
                }).join("")}</div>
                <p class="hjelp">${esc(R.t("Hva bildet forestiller, får du vite når det er ferdig."))}</p>
              </section>`
            : `<section class="seksjon">
                <div class="seksjon-hode"><h2>${esc(R.t("Hvor stort brett?"))}</h2></div>
                ${R.ui.fliser(
                  "storrelse",
                  STR.map((n) => ({
                    v: n,
                    tittel: storrelse(n, n),
                    tekst: S.rekorder[n] ? R.t("Rekord {tid}", { tid: visTid(S.rekorder[n].tid * 1000) }) : NIVA[n],
                    ikon: storIkon(n),
                  })),
                  o.n,
                )}
                <p class="hjelp">${esc(R.t("Hvert brett er nytt og har bare én løsning – du trenger aldri gjette."))}</p>
              </section>`;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hva vil du løse?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "fri", ikon: "🎲", tittel: R.t("Tilfeldig"), tekst: R.t("Et nytt mønster hver gang") },
                  { v: "bilde", ikon: "🖼️", tittel: R.t("Bilder"), tekst: R.t("{n} bilder å male fram", { n: M.BILDE_IDER.length }) },
                ],
                o.modus,
              )}
            </section>
            ${valg}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = aktiv(S);
          const tittel = sp.dagens ? R.t("Dagens nonogram") : R.t("Blekkspruten, {str}", { str: storrelse(sp.R, sp.C) });
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(tittel)}</h1>
            <div class="bs-spill${sp.pause ? " pauset" : ""}">
              <div class="bs-topp">${hudHtml(sp)}</div>
              <div class="bs-flate">
                <div class="bs-midt">
                  <div class="bs-brett" tabindex="0" role="group" aria-label="${esc(R.t("Brettet, {r} rader og {k} kolonner. Piltastene flytter, mellomrom fyller, X krysser.", { r: sp.R, k: sp.C }))}" aria-describedby="bs-tekst" style="--r:${sp.R};--k:${sp.C}">${brettHtml(sp)}</div>
                  <div class="bs-under"><p class="bs-tips" aria-hidden="true">${esc(R.t("Trykk eller dra for å fylle rutene."))}</p><p class="bs-melding" role="status"></p></div>
                </div>
                <div class="bs-pauseboks"${sp.pause ? "" : " hidden"}>
                  <div class="bs-pausekort">
                    <p class="etikett">${esc(R.t("Pause"))}</p>
                    <p class="bs-pausetekst">${esc(R.t("Brettet venter på deg."))}</p>
                    ${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}
                  </div>
                </div>
              </div>
              <ol class="vh" id="bs-tekst" aria-label="${esc(R.t("Brettet rad for rad"))}"></ol>
              <div class="bs-plass"></div>
              ${R.ui.dokk(verktoyHtml(sp))}
            </div>`;
        },
        etter(S, rot) {
          bindBrett(S, rot);
          oppdater(S);
          tilpass();
          const flate = R.$(".bs-flate", rot);
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
          merket = null;
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
          ruter = [];
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
          const str = storrelse(sp.R, sp.C);
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const tall = `<div class="bs-resultat">
              <div class="bs-tall-boks${r.nyRekord ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>${esc(R.t("tid"))}</span>${r.nyRekord ? `<i class="bs-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="bs-tall-boks"><b>${r.hint}</b><span>${esc(R.t("hint brukt|hint brukt", { n: r.hint }))}</span></div>
            </div>`;
          const bildet = `<figure class="bs-ferdig">${mini(sp.R, sp.C, losningAv(sp), "bs-mini")}${navnPa(sp) ? `<figcaption>${esc(R.t("Det ble: {navn}!", { navn: navnPa(sp) }))}</figcaption>` : ""}</figure>`;
          if (sp.dagens) {
            const idag = sp.dagens === R.dag().tekst;
            const linje = r.dagForrige ? R.t("Du løste dagens nonogram på {tid} første gang.", { tid: visTid(r.dagForrige * 1000) }) : r.hint ? R.t("Alle i hele landet får det samme brettet i dag.") : R.t("Uten hint! Alle i hele landet får det samme brettet i dag.");
            return `
              ${R.ui.banner({ etikett: `${R.t("{navn} nr. {nr}", { navn: NAVN(), nr: nrFor(sp.dagNr) })} · ${datoTekst(sp.dagens)}`, tittel: R.t("Godt jobba!"), klasse: "aksent" })}
              ${tall}
              <p class="hjelp">${esc(linje)}</p>
              <div class="bs-dagboks">
                ${r.rekke ? `<p class="bs-rekke"><span aria-hidden="true">🔥</span> ${esc(R.t("{dager} på rad", { dager: R.flertall(r.rekke, "dag", "dager") }))}</p>` : ""}
                ${idag ? nedtellingHtml() : `<p class="bs-nedtelling"><b>${esc(R.t("Et nytt nonogram er klart!"))}</b></p>`}
              </div>
              ${bildet}
              ${R.ui.flereSpill({ antall: 1 })}
              ${idag ? R.ui.dokk(R.ui.knapp(R.t("Del resultatet"), "del"), R.ui.lenkerad(R.ui.lenke(R.t("Spill fritt"), "fri"), alle)) : R.ui.dokk(R.ui.knapp(R.t("Dagens nonogram"), "dagens"), R.ui.lenkerad(alle))}`;
          }
          const hva = navnPa(sp) || str;
          let linje;
          if (r.nyRekord) linje = R.t("Ny personlig rekord på {str}! Forrige: {tid}.", { str: hva, tid: visTid(r.gml * 1000) });
          else if (r.gml) linje = R.t("Rekorden din på {str}: {tid}.", { str: hva, tid: visTid(Math.min(r.gml, r.sek) * 1000) });
          else linje = sp.bilde ? R.t("Bildet er malt fram – og havnet i samlingen din.") : R.t("Første brett på {str} – nå har du en rekord å slå!", { str });
          const neste = sp.bilde ? M.BILDE_IDER.find((id) => !S.bilder[id]) : null;
          return `
            ${R.ui.banner({ etikett: navnPa(sp) ? R.t("Bilde · {str}", { str }) : R.t("{str} · løst", { str }), tittel: r.nyRekord ? R.t("Ny rekord!") : R.t("Godt jobba!"), klasse: "aksent", stemning: r.nyRekord || !r.hint ? "jubel" : "" })}
            ${tall}
            <p class="hjelp">${esc(linje)}</p>
            ${bildet}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(sp.bilde && neste ? R.ui.knapp(R.t("Neste bilde"), "nestebilde", { v: neste }) : R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "bytt"), alle))}`;
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
        nyttSpill(S, "fri");
        R.gaTil("spill");
      },
      bytt: () => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        S.modus = "fri";
        R.gaTil(iGang(S.fri) ? "spill" : "hjem");
      },
      fri(el, e, S) {
        if (iGang(S.fri)) return H.fortsett(el, e, S);
        nyttSpill(S, "fri");
        R.gaTil("spill");
      },
      dagens: (el, e, S) => R.gaTil(apneDagens(S)),
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "bilde" ? "bilde" : "fri";
        R.vis();
      },
      storrelse(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.n = STR.includes(n) ? n : 10;
        R.vis();
      },
      bilde(el, e, S) {
        if (M.BILDE_IDER.includes(el.dataset.v)) S.oppsett.bilde = el.dataset.v;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        nyttSpill(S, "fri");
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S, "fri");
        R.gaTil("spill");
      },
      nestebilde(el, e, S) {
        if (M.BILDE_IDER.includes(el.dataset.v)) S.oppsett.bilde = el.dataset.v;
        S.oppsett.modus = "bilde";
        nyttSpill(S, "fri");
        R.gaTil("spill");
      },
      verktoy(el, e, S) {
        const sp = aktiv(S);
        if (!sp || sp.ferdig) return;
        sp.verktoy = el.dataset.v === "2" ? 2 : 1;
        R.lyd.klikk();
        oppdater(S);
        R.lagre();
      },
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
        const str = storrelse(best.n || sp.R, best.n || sp.C);
        const tekst = `🐙 ${tittel} · ${str} · ${tid} · ${hint}${dager ? ` · ${dager}` : ""}. ${R.t("Klarer du dagens nonogram?")}`;
        const linjer = [tid, `${str} · ${hint}`];
        if (dager) linjer.push(dager);
        R.del(R.t("{navn} – dagens nonogram", { navn: NAVN() }), tekst, ADRESSE + "#utfordring", { kort: { tittel, linjer } });
      },
    }),
  });

  window.Blekkspruten = motor;
})();
