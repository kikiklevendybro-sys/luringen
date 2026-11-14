/* Ekornet — match-3 in the forest.
   An 8 × 8 board of forest things: acorns, leaves, spruces, blueberries, mushrooms and flowers –
   each with its own colour AND its own outline, so no rule needs colour vision. Swap two
   neighbours (a swipe, a tap and a tap, or the keyboard) to line up three or more alike; they are
   cleared, everything above falls down, new things drop in from the top, and new lines clear again
   (a cascade, worth more each time). Four in a line leaves an arrow piece that clears its whole row
   (or column) when it goes; five in a line, or an L or a T, leaves a star piece that clears
   everything around it. A board with no move left is shuffled at once.
   Two ways to play: «Brett» (levels made from the level number: collect the things asked for
   within the moves; no lives, try again) and «30 trekk» (thirty moves for a record).
   The rules (Match) are pure functions at the top: a move is worked out in full when it is made
   (every cascade step with the board before and after it), saved, and then only drawn.
   test/ekornet.test.mjs loads this file without the kit (node:vm) and checks them. */
(function () {
  "use strict";

  // ---------- The rules ----------

  const Match = (() => {
    const N = 8;
    // A cell: kind 1–6 in the low bits, the special piece above them; 0 = empty (only while a
    // move is being worked out).
    const RAD = 1; // arrow piece: clears its row
    const KOL = 2; // arrow piece: clears its column
    const STJERNE = 3; // star piece: clears the 3 × 3 around it
    const T = (v) => v & 7;
    const S = (v) => v >> 3;
    const lag = (t, s = 0) => t | (s << 3);
    const xy = (i) => [i % N, Math.floor(i / N)];
    const nabo = (i, j) => {
      const [a, b] = xy(i);
      const [c, d] = xy(j);
      return Math.abs(a - c) + Math.abs(b - d) === 1;
    };

    // ---------- Random numbers (the kit's generator, kept here so the levels never change) ----------
    function fnv(tekst) {
      let h = 0x811c9dc5;
      for (let i = 0; i < tekst.length; i++) {
        h ^= tekst.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    function rng(fro) {
      let a = fro >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const heltall = (tilf, n) => Math.min(n - 1, Math.floor(tilf() * n));
    function stokkListe(liste, tilf) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = heltall(tilf, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // ---------- Lines ----------

    // Every run of three or more of a kind, across and down.
    function rekker(b) {
      const ut = [];
      for (const h of [true, false])
        for (let a = 0; a < N; a++) {
          let s = 0;
          while (s < N) {
            const at = (k) => (h ? a * N + k : k * N + a);
            const t = T(b[at(s)]);
            let e = s + 1;
            while (t && e < N && T(b[at(e)]) === t) e++;
            if (t && e - s >= 3) ut.push({ h, t, celler: Array.from({ length: e - s }, (_, k) => at(s + k)) });
            s = e;
          }
        }
      return ut;
    }

    // Runs that share a cell make one group (an L, a T or a cross).
    function grupper(b) {
      const grp = [];
      for (const r of rekker(b)) {
        const ny = { t: r.t, celler: new Set(r.celler), rekker: [r] };
        for (const g of grp.filter((g) => r.celler.some((c) => g.celler.has(c)))) {
          for (const c of g.celler) ny.celler.add(c);
          ny.rekker.push(...g.rekker);
          grp.splice(grp.indexOf(g), 1);
        }
        grp.push(ny);
      }
      return grp;
    }

    // Is cell i part of a line of three?
    function iRekke(b, i) {
      const t = T(b[i]);
      if (!t) return false;
      const [x, y] = xy(i);
      let n = 1;
      for (let k = x - 1; k >= 0 && T(b[y * N + k]) === t; k--) n++;
      for (let k = x + 1; k < N && T(b[y * N + k]) === t; k++) n++;
      if (n >= 3) return true;
      n = 1;
      for (let k = y - 1; k >= 0 && T(b[k * N + x]) === t; k--) n++;
      for (let k = y + 1; k < N && T(b[k * N + x]) === t; k++) n++;
      return n >= 3;
    }

    // A swap counts when it makes a line.
    function gyldig(b, i, j) {
      if (!nabo(i, j) || !b[i] || !b[j] || T(b[i]) === T(b[j])) return false;
      [b[i], b[j]] = [b[j], b[i]];
      const ok = iRekke(b, i) || iRekke(b, j);
      [b[i], b[j]] = [b[j], b[i]];
      return ok;
    }

    // Every move on the board, as [i, j] with j to the right of or below i.
    function finnTrekk(b) {
      const ut = [];
      for (let i = 0; i < N * N; i++) {
        const [x, y] = xy(i);
        if (x < N - 1 && gyldig(b, i, i + 1)) ut.push([i, i + 1]);
        if (y < N - 1 && gyldig(b, i, i + N)) ut.push([i, i + N]);
      }
      return ut;
    }

    // ---------- New boards ----------

    // A kind for cell i that does not make a line with what is already there.
    function trygg(b, i, tilf, k) {
      const [x, y] = xy(i);
      const ikke = new Set();
      if (x >= 2 && T(b[i - 1]) && T(b[i - 1]) === T(b[i - 2])) ikke.add(T(b[i - 1]));
      if (x <= N - 3 && T(b[i + 1]) && T(b[i + 1]) === T(b[i + 2])) ikke.add(T(b[i + 1]));
      if (x >= 1 && x <= N - 2 && T(b[i - 1]) && T(b[i - 1]) === T(b[i + 1])) ikke.add(T(b[i - 1]));
      if (y >= 2 && T(b[i - N]) && T(b[i - N]) === T(b[i - 2 * N])) ikke.add(T(b[i - N]));
      if (y <= N - 3 && T(b[i + N]) && T(b[i + N]) === T(b[i + 2 * N])) ikke.add(T(b[i + N]));
      if (y >= 1 && y <= N - 2 && T(b[i - N]) && T(b[i - N]) === T(b[i + N])) ikke.add(T(b[i - N]));
      const valg = [];
      for (let t = 1; t <= k; t++) if (!ikke.has(t)) valg.push(t);
      return valg.length ? valg[heltall(tilf, valg.length)] : 1 + heltall(tilf, k);
    }

    // A board with no line on it and at least one move.
    function lagBrett(tilf, k) {
      for (let forsok = 0; forsok < 100; forsok++) {
        const b = new Array(N * N).fill(0);
        for (let i = 0; i < N * N; i++) b[i] = trygg(b, i, tilf, k);
        if (!grupper(b).length && finnTrekk(b).length) return b;
      }
      throw new Error("Ekornet: fant ikke et brett");
    }

    // Shuffle the pieces on the board (specials too) until there is no line and at least one move.
    function stokk(b, tilf, k) {
      for (let forsok = 0; forsok < 300; forsok++) {
        const ny = stokkListe(b, tilf);
        if (!grupper(ny).length && finnTrekk(ny).length) {
          for (let i = 0; i < N * N; i++) b[i] = ny[i];
          return;
        }
      }
      const ny = lagBrett(tilf, k);
      for (let i = 0; i < N * N; i++) b[i] = ny[i];
    }

    // ---------- Working out a move ----------

    // The special piece a group leaves, and where.
    function spesialFor(g) {
      const lengst = g.rekker.reduce((m, r) => (r.celler.length > m.celler.length ? r : m));
      const kryss = g.rekker.some((r) => r.h) && g.rekker.some((r) => !r.h);
      if (lengst.celler.length >= 5 || kryss) return STJERNE;
      if (lengst.celler.length === 4) return lengst.h ? RAD : KOL;
      return 0;
    }
    function plassFor(g, b, byttet) {
      const fri = (c) => g.celler.has(c) && !S(b[c]);
      if (byttet) for (const c of byttet) if (fri(c)) return c;
      // An L or a T: the crossing.
      const h = new Set(g.rekker.filter((r) => r.h).flatMap((r) => r.celler));
      for (const r of g.rekker) if (!r.h) for (const c of r.celler) if (h.has(c) && fri(c)) return c;
      const lengst = g.rekker.reduce((m, r) => (r.celler.length > m.celler.length ? r : m));
      const midt = lengst.celler[Math.floor((lengst.celler.length - 1) / 2)];
      if (fri(midt)) return midt;
      const andre = [...g.celler].filter(fri).sort((a, c) => a - c);
      return andre.length ? andre[0] : -1;
    }
    // The cells a special piece takes with it.
    function omrade(i, s) {
      const [x, y] = xy(i);
      const ut = [];
      if (s === RAD) for (let k = 0; k < N; k++) ut.push(y * N + k);
      else if (s === KOL) for (let k = 0; k < N; k++) ut.push(k * N + x);
      else if (s === STJERNE)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < N && yy < N) ut.push(yy * N + xx);
          }
      return ut;
    }

    // Everything falls down; new pieces come in at the top. fra[i]: the row the piece now in
    // cell i came from (negative: it came in from above the board).
    function fall(b, tilf, k) {
      const fra = new Array(N * N).fill(0);
      for (let x = 0; x < N; x++) {
        let skriv = N - 1;
        for (let y = N - 1; y >= 0; y--) {
          const v = b[y * N + x];
          if (!v) continue;
          b[skriv * N + x] = v;
          fra[skriv * N + x] = y;
          skriv--;
        }
        const nye = skriv + 1;
        for (let y = skriv; y >= 0; y--) {
          b[y * N + x] = 1 + heltall(tilf, k);
          fra[y * N + x] = y - nye;
        }
      }
      return fra;
    }

    // Clear lines until none are left. Changes b; returns the steps (each with the board before
    // and after it) and the shuffled board if the end had no move left.
    function los(b, tilf, k, byttet) {
      const steg = [];
      for (let kaskade = 1; kaskade <= 60; kaskade++) {
        const grp = grupper(b);
        if (!grp.length) break;
        const for1 = b.slice();
        const fjern = new Set();
        const nye = [];
        const beholdt = new Set();
        for (const g of grp) {
          for (const c of g.celler) fjern.add(c);
          const s = spesialFor(g);
          if (!s) continue;
          const p = plassFor(g, b, kaskade === 1 ? byttet : null);
          if (p >= 0 && !beholdt.has(p)) {
            beholdt.add(p);
            nye.push({ i: p, v: lag(g.t, s) });
          }
        }
        // Special pieces that go fire – and set off the ones they hit.
        const ko = [...fjern].filter((c) => S(b[c]) && !beholdt.has(c)).sort((a, c) => a - c);
        const sett = new Set(ko);
        const utlost = [];
        while (ko.length) {
          const c = ko.shift();
          utlost.push({ i: c, s: S(b[c]) });
          for (const d of omrade(c, S(b[c]))) {
            if (beholdt.has(d)) continue;
            fjern.add(d);
            if (S(b[d]) && !sett.has(d)) {
              sett.add(d);
              ko.push(d);
            }
          }
        }
        for (const c of beholdt) fjern.delete(c);
        const samlet = {};
        for (const c of fjern) samlet[T(b[c])] = (samlet[T(b[c])] || 0) + 1;
        const poeng = fjern.size * 10 * kaskade + nye.length * 20 + utlost.length * 30;
        for (const c of fjern) b[c] = 0;
        for (const n of nye) b[n.i] = n.v;
        const fra = fall(b, tilf, k);
        steg.push({ for1, fjern: [...fjern].sort((a, c) => a - c), nye, utlost, fra, etter: b.slice(), poeng, kaskade, samlet });
      }
      let stokket = null;
      if (!finnTrekk(b).length) {
        stokk(b, tilf, k);
        stokket = b.slice();
      }
      return { steg, stokket };
    }

    // ---------- Levels and games ----------

    // Level n: the kinds, what to collect and how many moves – the same on every phone.
    function niva(n) {
      const tilf = rng(fnv(`ekornet:${n}`));
      const k = n <= 4 ? 5 : 6;
      const antall = n <= 3 ? 1 : n <= 9 ? 2 : 3;
      const typer = stokkListe([1, 2, 3, 4, 5, 6].slice(0, k), tilf).slice(0, antall);
      const per = antall === 1 ? 16 + 2 * n : antall === 2 ? Math.round(12 + (n - 4) * 0.8) : Math.min(24, Math.round(13 + (n - 10) * 0.5));
      const trekk = antall === 1 ? 20 : antall === 2 ? 22 : 24;
      return { k, mal: typer.map((t) => ({ t, n: per })), trekk, fro: fnv(`ekornet-brett:${n}`) };
    }

    function nyttSpill(modus, n, fro) {
      const brett = modus === "brett";
      const o = brett ? niva(n) : { k: 6, mal: [], trekk: 30, fro };
      const b = lagBrett(rng(o.fro >>> 0), o.k);
      return { modus, niva: brett ? n : 0, k: o.k, brett: b, fro: (fro ^ 0x9e3779b9) >>> 0, poeng: 0, trekk: 0, maks: o.trekk, mal: o.mal, samlet: {}, besteKaskade: 0, spesialer: 0, slutt: null };
    }

    const igjen = (sp, t) => {
      const m = sp.mal.find((m) => m.t === t);
      return m ? Math.max(0, m.n - (sp.samlet[t] || 0)) : 0;
    };
    const malNadd = (sp) => sp.mal.length > 0 && sp.mal.every((m) => (sp.samlet[m.t] || 0) >= m.n);
    // Stars for a level: by the moves left over.
    const stjerner = (sp) => {
      const rest = (sp.maks - sp.trekk) / sp.maks;
      return rest >= 0.3 ? 3 : rest >= 0.1 ? 2 : 1;
    };

    // One move: swap i and j. Changes sp; returns what happened (for the drawing and the sounds).
    function trekk(sp, i, j) {
      const b = sp.brett;
      if (sp.slutt || !gyldig(b, i, j)) return { gyldig: false, i, j };
      const for1 = b.slice();
      [b[i], b[j]] = [b[j], b[i]];
      const tilf = rng(sp.fro);
      const r = los(b, tilf, sp.k, [i, j]);
      sp.fro = Math.floor(tilf() * 4294967296) >>> 0;
      sp.trekk += 1;
      let poeng = 0;
      for (const s of r.steg) {
        poeng += s.poeng;
        for (const t of Object.keys(s.samlet)) sp.samlet[t] = (sp.samlet[t] || 0) + s.samlet[t];
        sp.spesialer += s.nye.length;
      }
      sp.besteKaskade = Math.max(sp.besteKaskade, r.steg.length);
      sp.poeng += poeng;
      let bonus = 0;
      if (sp.modus === "brett") {
        if (malNadd(sp)) {
          sp.slutt = "vunnet";
          bonus = (sp.maks - sp.trekk) * 50;
          sp.poeng += bonus;
        } else if (sp.trekk >= sp.maks) sp.slutt = "tapt";
      } else if (sp.trekk >= sp.maks) sp.slutt = "ferdig";
      return { gyldig: true, i, j, for1, ...r, poeng, bonus, slutt: sp.slutt };
    }

    // A saved board from storage: 64 known pieces, no line on it, at least one move.
    function gyldigBrett(b, k) {
      if (!Array.isArray(b) || b.length !== N * N) return false;
      if (!b.every((v) => Number.isInteger(v) && T(v) >= 1 && T(v) <= k && S(v) >= 0 && S(v) <= STJERNE)) return false;
      return !grupper(b).length && finnTrekk(b).length > 0;
    }

    return { N, RAD, KOL, STJERNE, T, S, lag, xy, nabo, fnv, rng, rekker, grupper, iRekke, gyldig, finnTrekk, lagBrett, stokk, spesialFor, plassFor, omrade, fall, los, niva, nyttSpill, igjen, malNadd, stjerner, trekk, gyldigBrett };
  })();

  const R = window.Rusj;
  window.Ekornet = { Match, opptatt: () => !!anim || las };
  if (!R) return;
  const esc = R.esc;
  const { N, T, S } = Match;

  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  // The six kinds: a colour and an outline of their own, drawn in a 100 × 100 box. Each layer:
  // [path, fill, outline width (0 = none)].
  const BLEKK = "#170e2b";
  const SORT = [
    null,
    {
      navn: R.t("nøtt"),
      hex: "#f29b45",
      lag: [
        ["M50 18C50 12 53 8 58 5", null, 5],
        ["M24 47C26 73 40 88 50 90C60 88 74 73 76 47C62 52 38 52 24 47Z", "#f29b45", 5],
        ["M17 46C17 26 33 17 50 17C67 17 83 26 83 46C70 51 30 51 17 46Z", "#9a6532", 5],
        ["M30 29L38 43M44 23L51 43M58 23L63 41M70 29L72 40", null, 3, "rgba(23,14,43,.4)"],
        ["M34 58C34 68 38 74 43 79", null, 5, "rgba(255,255,255,.55)"],
      ],
    },
    {
      navn: R.t("blad"),
      hex: "#ffd23f",
      lag: [
        ["M50 86V97", null, 5],
        ["M50 7C79 25 87 56 67 80C60 88 55 90 50 90C45 90 40 88 33 80C13 56 21 25 50 7Z", "#ffd23f", 5],
        ["M50 17V88", null, 4],
        ["M50 40L64 30M50 40L36 30M50 57L68 45M50 57L32 45M50 73L62 65M50 73L38 65", null, 3, "rgba(23,14,43,.45)"],
      ],
    },
    {
      navn: R.t("gran"),
      hex: "#3fc46c",
      lag: [
        ["M43 80H57V95H43Z", "#9a6532", 4],
        ["M50 5L71 33H61L79 57H67L85 81H15L33 57H21L39 33H29Z", "#3fc46c", 5],
        ["M45 22L38 32M40 46L33 56M36 70L28 79", null, 4, "rgba(255,255,255,.45)"],
      ],
    },
    {
      navn: R.t("blåbær"),
      hex: "#5b88ff",
      lag: [
        ["M18 56A32 32 0 1 0 82 56A32 32 0 1 0 18 56Z", "#5b88ff", 5],
        ["M50 25l5 7 8-1-4 7 4 7-8-1-5 7-5-7-8 1 4-7-4-7 8 1Z", "#2a3d9a", 3],
        ["M29 52C29 45 33 40 39 37", null, 5, "rgba(255,255,255,.6)"],
      ],
    },
    {
      navn: R.t("sopp"),
      hex: "#ff5d62",
      lag: [
        ["M36 56C33 72 33 85 38 93H62C67 85 67 72 64 56Z", "#fff1dd", 5],
        ["M9 57C9 27 29 13 50 13C71 13 91 27 91 57C70 64 30 64 9 57Z", "#ff5d62", 5],
        ["M27 34a7 7 0 1 0 14 0a7 7 0 1 0-14 0ZM52 27a6 6 0 1 0 12 0a6 6 0 1 0-12 0ZM66 45a6 6 0 1 0 12 0a6 6 0 1 0-12 0ZM40 49a5 5 0 1 0 10 0a5 5 0 1 0-10 0ZM18 48a4 4 0 1 0 8 0a4 4 0 1 0-8 0Z", "#fff1dd", 0],
      ],
    },
    {
      navn: R.t("blomst"),
      hex: "#b983ff",
      lag: [
        [
          [0, 1, 2, 3, 4]
            .map((k) => {
              const a = ((-90 + k * 72) * Math.PI) / 180;
              const x = Math.round(50 + Math.cos(a) * 23);
              const y = Math.round(52 + Math.sin(a) * 23);
              return `M${x - 16} ${y}a16 16 0 1 0 32 0a16 16 0 1 0-32 0Z`;
            })
            .join(""),
          "#b983ff",
          5,
        ],
        ["M38 52a12 12 0 1 0 24 0a12 12 0 1 0-24 0Z", "#ffd23f", 5],
      ],
    },
  ];
  // «3 nøtter» – the plural of each kind (literal keys for the language tables).
  function antallTekst(t, n) {
    if (t === 1) return R.flertall(n, "nøtt", "nøtter");
    if (t === 2) return R.flertall(n, "blad", "blader");
    if (t === 3) return R.flertall(n, "gran", "graner");
    if (t === 4) return R.flertall(n, "blåbær", "blåbær");
    if (t === 5) return R.flertall(n, "sopp", "sopper");
    return R.flertall(n, "blomst", "blomster");
  }
  const SPESIAL = [null, R.t("pil langs raden"), R.t("pil langs kolonnen"), R.t("stjerne")];
  const brikkeNavn = (v) => (S(v) ? `${SORT[T(v)].navn} (${SPESIAL[S(v)]})` : SORT[T(v)].navn);
  const ROS = ["", "", R.t("Bra!"), R.t("Supert!"), R.t("Fantastisk!"), R.t("Helt rått!")];
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/ekornet/" }).href;
  const STJERNE = "★";
  const G = 70; // cells per second², how fast things fall

  let H; // actions
  let tegner = null;
  let anim = null; // the move being drawn
  let pauset = false;
  let pauseStart = 0;
  let las = false; // the game is over and the result is on its way
  let valgt = -1; // a selected piece (tap or keyboard)
  let markor = -1; // the keyboard cursor
  let hint = null; // { i, j, t0 }
  let hintTid = null;

  // ---------- The game state ----------

  const iGang = (sp) => !!(sp && !sp.ferdig && !sp.slutt);
  const modusTekst = (sp) => (sp.modus === "brett" ? R.t("Brett {n}", { n: sp.niva }) : R.t("30 trekk"));

  function nyttSpill(S, modus, n) {
    S.spill = Match.nyttSpill(modus, n, R.nyttFro());
    S.spill.startRekord = S.rekord || 0;
    anim = null;
    pauset = false;
    las = false;
    valgt = -1;
    markor = -1;
    R.statistikk("start", { modus, niva: S.spill.niva });
  }

  // The result, the record and the level progress; saved at once with the move.
  function ferdigstill(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || !sp.slutt) return;
    sp.ferdig = true;
    const res = { slutt: sp.slutt, poeng: sp.poeng };
    if (sp.modus === "brett") {
      if (sp.slutt === "vunnet") {
        res.stjerner = Match.stjerner(sp);
        S.stjerner[sp.niva] = Math.max(S.stjerner[sp.niva] || 0, res.stjerner);
        S.niva = Math.max(S.niva, sp.niva + 1);
        if (sp.niva >= 10) R.merke("arkade-ekornet");
      }
      S.sist = { modus: "brett", niva: sp.niva, vunnet: sp.slutt === "vunnet", stjerner: res.stjerner || 0, poeng: sp.poeng };
    } else {
      const gml = sp.startRekord || 0;
      res.gml = gml;
      res.nyRekord = sp.poeng > gml && gml > 0;
      res.forste = !gml && sp.poeng > 0;
      S.rekord = Math.max(S.rekord || 0, sp.poeng);
      S.sist = { modus: "trekk30", poeng: sp.poeng };
    }
    sp.resultat = res;
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.niva, vunnet: sp.slutt === "vunnet", poeng: sp.poeng, trekk: sp.trekk });
  }

  // ---------- Drawing ----------

  const STI = new Map();
  const sti = (d) => {
    if (!STI.has(d)) STI.set(d, new Path2D(d));
    return STI.get(d);
  };

  // A piece in a 100 × 100 box at the origin of g.
  function tegnBrikke(g, v) {
    const s = S(v);
    const k = SORT[T(v)];
    if (!k) return;
    g.lineJoin = "round";
    g.lineCap = "round";
    if (s === Match.STJERNE) {
      // A star burst behind the piece
      g.beginPath();
      for (let n = 0; n < 16; n++) {
        const r = n % 2 ? 30 : 50;
        const a = -Math.PI / 2 + (n * Math.PI) / 8;
        g.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = "#ffe27a";
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = BLEKK;
      g.stroke();
    } else if (s) {
      // A light band along the row or the column, and a ring round the piece
      g.fillStyle = "rgba(255,241,221,0.4)";
      if (s === Match.RAD) g.fillRect(0, 36, 100, 28);
      else g.fillRect(36, 0, 28, 100);
      g.lineWidth = 4;
      g.strokeStyle = "rgba(255,241,221,0.9)";
      g.beginPath();
      g.arc(50, 50, 40, 0, Math.PI * 2);
      g.stroke();
    }
    g.save();
    if (s) {
      g.translate(50, 50);
      g.scale(0.7, 0.7);
      g.translate(-50, -50);
    }
    for (const [d, fyll, w, farge] of k.lag) {
      const p = sti(d);
      if (fyll) {
        g.fillStyle = fyll;
        g.fill(p);
      }
      if (w) {
        g.lineWidth = w;
        g.strokeStyle = farge || BLEKK;
        g.stroke(p);
      }
    }
    g.restore();
    if (s === Match.RAD || s === Match.KOL) {
      // Arrow heads at both ends: the direction the piece clears (a shape, not only a colour)
      const pil = s === Match.RAD ? "M1 50L20 31V69ZM99 50L80 31V69Z" : "M50 1L31 20H69ZM50 99L31 80H69Z";
      g.fillStyle = "#fff1dd";
      g.fill(sti(pil));
      g.lineWidth = 4;
      g.strokeStyle = BLEKK;
      g.stroke(sti(pil));
    }
  }

  // The same piece as a small SVG (the goals, the rules, the result).
  function brikkeSvg(t, s = 26) {
    const k = SORT[t];
    return `<svg class="ek-ikon" width="${s}" height="${s}" viewBox="0 0 100 100" aria-hidden="true">${k.lag
      .map(([d, fyll, w, farge]) => `<path d="${d}" fill="${fyll || "none"}"${w ? ` stroke="${farge || BLEKK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"` : ""}/>`)
      .join("")}</svg>`;
  }

  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  // A rounded rectangle path (a plain one where the browser has no roundRect).
  function rundRekt(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  }
  const fallTid = (d) => (d > 0 ? Math.sqrt((2 * d) / G) : 0);

  class Tegner {
    constructor(rot) {
      this.flate = R.$(".ek-flate", rot);
      this.lerret = R.$(".ek-lerret", rot);
      this.g = this.lerret.getContext("2d");
      this.D = 0;
      this.dpr = 1;
      this.id = 0;
      this.levende = true;
      this.sprites = new Map();
      this.bakgrunn = null;
      this.partikler = [];
      this.tekster = [];
      this.straler = [];
      this.sist = performance.now();
      this.tegn = this.tegn.bind(this);
      this.tilpass();
      this.obs = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.tilpass()) : null;
      if (this.obs) this.obs.observe(this.flate);
    }
    stopp() {
      this.levende = false;
      cancelAnimationFrame(this.id);
      this.id = 0;
      if (this.obs) this.obs.disconnect();
    }
    vekk() {
      if (!this.levende || this.id) return;
      this.sist = performance.now();
      this.id = requestAnimationFrame(this.tegn);
    }
    tilpass() {
      const w = this.flate.clientWidth;
      const h = this.flate.clientHeight;
      if (!w || !h) return;
      const D = Math.max(20, Math.floor((Math.min(w, h) - 6) / N));
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      if (D === this.D && dpr === this.dpr) return this.vekk();
      this.D = D;
      this.dpr = dpr;
      this.lerret.style.width = D * N + "px";
      this.lerret.style.height = D * N + "px";
      this.lerret.width = Math.round(D * N * dpr);
      this.lerret.height = Math.round(D * N * dpr);
      this.sprites.clear();
      this.bakgrunn = null;
      this.vekk();
    }
    sprite(v) {
      if (this.sprites.has(v)) return this.sprites.get(v);
      const s = Math.ceil(this.D * this.dpr);
      const k = document.createElement("canvas");
      k.width = s;
      k.height = s;
      const g = k.getContext("2d");
      g.scale(s / 100, s / 100);
      g.translate(4, 4);
      g.scale(0.92, 0.92);
      tegnBrikke(g, v);
      this.sprites.set(v, k);
      return k;
    }
    // A piece at column x, row y (cell units, may be fractions), scaled around its middle.
    brikke(x, y, v, skala = 1, alfa = 1, vri = 0) {
      if (!v || alfa <= 0) return;
      const g = this.g;
      const D = this.D;
      const s = this.sprite(v);
      g.save();
      g.globalAlpha = Math.min(1, alfa);
      g.translate((x + 0.5) * D, (y + 0.5) * D);
      if (vri) g.rotate(vri);
      g.drawImage(s, (-D / 2) * skala, (-D / 2) * skala, D * skala, D * skala);
      g.restore();
    }
    lagBakgrunn() {
      const D = this.D;
      const k = document.createElement("canvas");
      k.width = this.lerret.width;
      k.height = this.lerret.height;
      const g = k.getContext("2d");
      g.scale(this.dpr, this.dpr);
      g.fillStyle = "#1d1340";
      g.fillRect(0, 0, N * D, N * D);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          g.fillStyle = (x + y) % 2 ? "rgba(255,241,221,0.05)" : "rgba(255,241,221,0.1)";
          rundRekt(g, x * D + 2, y * D + 2, D - 4, D - 4, D * 0.18);
          g.fill();
        }
      this.bakgrunn = k;
    }
    ring(i, farge, stiplet) {
      const g = this.g;
      const D = this.D;
      const [x, y] = Match.xy(i);
      g.save();
      if (stiplet) g.setLineDash([D * 0.14, D * 0.1]);
      g.lineWidth = Math.max(2.5, D * 0.08);
      g.strokeStyle = farge;
      rundRekt(g, x * D + 3, y * D + 3, D - 6, D - 6, D * 0.2);
      g.stroke();
      g.restore();
    }

    tegn(na) {
      this.id = 0;
      if (!this.levende || !this.D) return;
      na = na || performance.now();
      const dt = Math.min(0.05, Math.max(0, (na - this.sist) / 1000));
      this.sist = na;
      const sp = R.S && R.S.spill;
      if (!sp) return;
      const g = this.g;
      const D = this.D;
      if (!this.bakgrunn) this.lagBakgrunn();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.bakgrunn, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.save();
      g.beginPath();
      g.rect(0, 0, N * D, N * D);
      g.clip();
      const a = anim;
      let ferdig = true;
      if (a) {
        const t = (na - a.t0) / 1000;
        let fase = null;
        for (const f of a.faser)
          if (t < f.slutt) {
            fase = f;
            break;
          }
        if (fase) {
          ferdig = false;
          const tau = t - fase.start;
          if (!fase.startet) {
            fase.startet = true;
            faseStart(fase);
          }
          this.fase(fase, tau);
        }
      }
      if (ferdig) {
        if (a) {
          anim = null;
          etterAnim();
        }
        this.hvile(sp, na);
      }
      this.effekter(dt);
      g.restore();
      const liv = anim || this.partikler.length || this.tekster.length || this.straler.length || (hint && na - hint.t0 < 1800);
      if (liv && !pauset && this.levende && !this.id) this.id = requestAnimationFrame(this.tegn);
    }

    // The board at rest: the pieces, the selected one, the keyboard cursor and a hint.
    hvile(sp, na) {
      const b = sp.brett;
      for (let i = 0; i < N * N; i++) {
        const [x, y] = Match.xy(i);
        let vri = 0;
        if (hint && (i === hint.i || i === hint.j)) {
          const h = (na - hint.t0) / 1000;
          if (h < 1.6 && !R.rolig()) vri = Math.sin(h * 18) * 0.12 * (1 - h / 1.6);
        }
        this.brikke(x, y, b[i], i === valgt ? 1.08 : 1, 1, vri);
      }
      if (hint) {
        this.ring(hint.i, "rgba(255,241,221,0.8)", true);
        this.ring(hint.j, "rgba(255,241,221,0.8)", true);
      }
      if (valgt >= 0) this.ring(valgt, "#fff1dd", false);
      if (markor >= 0 && markor !== valgt) this.ring(markor, "#ffd23f", true);
    }

    fase(f, tau) {
      const p = f.varighet ? Math.min(1, tau / f.varighet) : 1;
      if (f.type === "bytt" || f.type === "nei") {
        const b = f.brett;
        const [xi, yi] = Match.xy(f.i);
        const [xj, yj] = Match.xy(f.j);
        const e = f.type === "bytt" ? ease(p) : Math.sin(Math.PI * p) * 0.55;
        for (let i = 0; i < N * N; i++) {
          if (i === f.i || i === f.j) continue;
          const [x, y] = Match.xy(i);
          this.brikke(x, y, b[i]);
        }
        this.brikke(xj + (xi - xj) * e, yj + (yi - yj) * e, b[f.j]);
        this.brikke(xi + (xj - xi) * e, yi + (yj - yi) * e, b[f.i], 1.06);
      } else if (f.type === "fjern") {
        const s = f.steg;
        const borte = new Set(s.fjern);
        const nye = new Map(s.nye.map((n) => [n.i, n.v]));
        for (let i = 0; i < N * N; i++) {
          const [x, y] = Match.xy(i);
          if (borte.has(i)) this.brikke(x, y, s.for1[i], 1 + 0.35 * p, 1 - p);
          else if (nye.has(i)) this.brikke(x, y, p < 0.45 ? s.for1[i] : nye.get(i), p < 0.45 ? 1 : 1 + 0.25 * Math.sin(Math.PI * Math.min(1, (p - 0.45) / 0.55)));
          else this.brikke(x, y, s.for1[i]);
        }
      } else if (f.type === "fall") {
        const s = f.steg;
        for (let i = 0; i < N * N; i++) {
          const [x, y] = Match.xy(i);
          const o = s.fra[i];
          const d = y - o;
          const yy = d > 0 && !R.rolig() ? Math.min(y, o + 0.5 * G * tau * tau) : y;
          if (yy > -1) this.brikke(x, yy, s.etter[i]);
        }
      } else if (f.type === "stokk") {
        const fra = f.fra;
        const til = f.til;
        for (let i = 0; i < N * N; i++) {
          const [x, y] = Match.xy(i);
          if (p < 0.5) this.brikke(x, y, fra[i], 1 - p * 2, 1, p * 6);
          else this.brikke(x, y, til[i], (p - 0.5) * 2, 1, (1 - p) * 6);
        }
      }
    }

    gnister(i, v) {
      if (R.rolig() || this.partikler.length > 220) return;
      const [x, y] = Match.xy(i);
      const farge = SORT[T(v)].hex;
      for (let n = 0; n < 5; n++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 3.5;
        this.partikler.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, liv: 0.5, farge, r: 0.05 + Math.random() * 0.06 });
      }
    }
    straale(i, s) {
      this.straler.push({ i, s, liv: 0.45 });
      this.vekk();
    }
    tekst(x, y, tekst, stor) {
      this.tekster.push({ x, y, tekst, liv: 1.1, stor });
      this.vekk();
    }
    effekter(dt) {
      const g = this.g;
      const D = this.D;
      this.straler = this.straler.filter((s) => (s.liv -= dt) > 0);
      for (const s of this.straler) {
        const [x, y] = Match.xy(s.i);
        const al = s.liv / 0.45;
        g.save();
        g.globalAlpha = al;
        g.fillStyle = "#fff1dd";
        g.shadowColor = "#ffe27a";
        g.shadowBlur = D * 0.5;
        if (s.s === Match.RAD) g.fillRect(0, (y + 0.5 - 0.18 * al) * D, N * D, 0.36 * al * D);
        else if (s.s === Match.KOL) g.fillRect((x + 0.5 - 0.18 * al) * D, 0, 0.36 * al * D, N * D);
        else {
          g.lineWidth = D * 0.2 * al;
          g.strokeStyle = "#ffe27a";
          g.beginPath();
          g.arc((x + 0.5) * D, (y + 0.5) * D, (1.6 - al) * D * 1.2, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }
      this.partikler = this.partikler.filter((p) => (p.liv -= dt) > 0);
      for (const p of this.partikler) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 14 * dt;
        g.globalAlpha = Math.min(1, p.liv * 2.5);
        g.fillStyle = p.farge;
        g.beginPath();
        g.arc(p.x * D, p.y * D, p.r * D, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      this.tekster = this.tekster.filter((t) => (t.liv -= dt) > 0);
      for (const t of this.tekster) {
        const y = Math.max(0.8, Math.min(N - 0.4, t.y)) - (1.1 - t.liv) * 0.8;
        const x = Math.min(N - 1.6, Math.max(1.6, t.x));
        g.globalAlpha = Math.min(1, t.liv * 2);
        g.font = `900 ${Math.round(D * (t.stor ? 0.62 : 0.46))}px ui-rounded, system-ui, sans-serif`;
        g.textAlign = "center";
        g.lineJoin = "round";
        g.lineWidth = 4;
        g.strokeStyle = BLEKK;
        g.strokeText(t.tekst, x * D, y * D);
        g.fillStyle = t.stor ? "#ffd23f" : "#fff1dd";
        g.fillText(t.tekst, x * D, y * D);
      }
      g.globalAlpha = 1;
    }
  }

  // Sounds and effects when a phase begins.
  function faseStart(f) {
    if (!tegner) return;
    if (f.type === "bytt") R.lyd.tone(620, 0, 0.06, "sine", 0.05, 780);
    else if (f.type === "nei") {
      R.lyd.tone(300, 0, 0.1, "sine", 0.06, 240);
      R.vibrer([8, 30, 8]);
    } else if (f.type === "fjern") {
      const s = f.steg;
      for (const i of s.fjern) tegner.gnister(i, s.for1[i]);
      for (const u of s.utlost) tegner.straale(u.i, u.s);
      const trinn = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5];
      const k = Math.min(trinn.length - 1, s.kaskade - 1);
      R.lyd.tone(trinn[k], 0, 0.1, "triangle", 0.09);
      R.lyd.tone(trinn[Math.min(trinn.length - 1, k + 2)], 0.06, 0.1, "triangle", 0.07);
      if (s.utlost.length) R.lyd.stoy(0, 0.3, 0.12, 2400);
      if (s.nye.length) setTimeout(() => R.lyd.pling(), 120);
      R.vibrer(s.utlost.length ? [14, 30, 20] : 8);
      // The points over the cleared cells, and a word for a cascade
      const xs = s.fjern.map((i) => Match.xy(i));
      const mx = xs.reduce((a, [x]) => a + x, 0) / xs.length + 0.5;
      const my = xs.reduce((a, [, y]) => a + y, 0) / xs.length + 0.5;
      tegner.tekst(mx, my, `+${R.tall(s.poeng)}`, false);
      if (ROS[Math.min(5, s.kaskade)]) tegner.tekst(N / 2, my - 1, ROS[Math.min(5, s.kaskade)], true);
    } else if (f.type === "stokk") {
      R.lyd.sveip();
      tegner.tekst(N / 2, N / 2, R.t("Ingen trekk – stokker!"), true);
      R.si(R.t("Ingen trekk igjen. Brettet stokkes."));
    }
  }

  // ---------- Moves ----------

  function prov(S, i, j) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.slutt || anim || pauset || las || R.arkApent() || !tegner) return;
    stoppHint();
    valgt = -1;
    const for1 = sp.brett.slice();
    const r = Match.trekk(sp, i, j);
    const rolig = R.rolig();
    const faser = [];
    let t = 0;
    const legg = (f, varighet) => {
      faser.push({ ...f, start: t, varighet, slutt: t + varighet });
      t += varighet;
    };
    if (!r.gyldig) {
      legg({ type: "nei", i, j, brett: for1 }, rolig ? 0.05 : 0.3);
      anim = { t0: performance.now(), faser, r };
      R.si(Match.nabo(i, j) ? R.t("Det blir ingen rad der.") : R.t("Bytt med en brikke ved siden av."));
      tegner.vekk();
      return;
    }
    legg({ type: "bytt", i, j, brett: for1 }, rolig ? 0.05 : 0.14);
    for (const s of r.steg) {
      legg({ type: "fjern", steg: s }, rolig ? 0.12 : 0.26);
      let maks = 0;
      for (let c = 0; c < N * N; c++) maks = Math.max(maks, fallTid(Match.xy(c)[1] - s.fra[c]));
      legg({ type: "fall", steg: s }, rolig ? 0.08 : maks + 0.05);
    }
    if (r.stokket) legg({ type: "stokk", fra: r.steg.length ? r.steg[r.steg.length - 1].etter : for1, til: r.stokket }, rolig ? 0.2 : 0.7);
    anim = { t0: performance.now(), faser, r };
    if (sp.slutt) {
      ferdigstill(S);
      las = true;
    }
    R.lagre();
    oppdaterHud(S);
    lesOpp(sp, r);
    tegner.vekk();
  }

  function lesOpp(sp, r) {
    const ryddet = r.steg.reduce((a, s) => a + s.fjern.length, 0);
    const deler = [R.t("{a} og {b} byttet plass.", { a: brikkeNavn(r.for1[r.i]), b: brikkeNavn(r.for1[r.j]) })];
    deler.push(R.t("{n} ryddet.", { n: ryddet }));
    if (r.steg.length > 1) deler.push(R.t("Kaskade {n}!", { n: r.steg.length }));
    const nye = r.steg.flatMap((s) => s.nye);
    for (const n of nye) deler.push(R.t("Ny brikke: {navn}.", { navn: brikkeNavn(n.v) }));
    deler.push(R.t("Pluss {n}.", { n: r.poeng + r.bonus }));
    if (!sp.slutt) {
      if (sp.modus === "brett") {
        const mangler = sp.mal.filter((m) => Match.igjen(sp, m.t) > 0).map((m) => antallTekst(m.t, Match.igjen(sp, m.t)));
        if (mangler.length) deler.push(R.t("Igjen: {liste}.", { liste: R.ramsOpp(mangler) }));
      }
      deler.push(R.t("{n} trekk igjen.", { n: sp.maks - sp.trekk }));
    }
    R.si(deler.join(" "));
  }

  function etterAnim() {
    const S = R.S;
    const sp = S.spill;
    if (!sp) return;
    oppdaterHud(S);
    oppdaterTekst(sp);
    if (sp.ferdig && las) {
      const fortsatt = R.vakt();
      if (sp.slutt === "tapt") {
        R.lyd.tone(392, 0, 0.18, "triangle", 0.08);
        R.lyd.tone(330, 0.16, 0.24, "triangle", 0.07);
      }
      R.si(sp.slutt === "vunnet" ? R.t("Alt er samlet!") : sp.slutt === "tapt" ? R.t("Trekkene er brukt opp.") : R.t("Alle 30 trekk er brukt."));
      setTimeout(() => fortsatt() && R.gaTil("slutt"), R.rolig() ? 500 : 900);
    } else startHint();
  }

  // ---------- A hint after a while ----------

  function stoppHint() {
    clearTimeout(hintTid);
    hintTid = null;
    hint = null;
  }
  function startHint() {
    stoppHint();
    hintTid = setTimeout(visHint, 7000);
  }
  function visHint() {
    const sp = R.S && R.S.spill;
    if (!sp || sp.ferdig || anim || pauset || las || R.S.skjerm !== "spill") return;
    const trekk = Match.finnTrekk(sp.brett);
    if (!trekk.length) return;
    // One that collects something still wanted, if there is one.
    const onsket = (i) => sp.mal.some((m) => m.t === T(sp.brett[i]) && Match.igjen(sp, m.t) > 0);
    const [i, j] = trekk.find(([a, b]) => onsket(a) || onsket(b)) || trekk[0];
    hint = { i, j, t0: performance.now() };
    if (tegner) tegner.vekk();
  }

  // ---------- HUD and text ----------

  function malHtml(sp) {
    return sp.mal
      .map((m) => {
        const n = Match.igjen(sp, m.t);
        return `<li class="ek-mal${n ? "" : " ferdig"}" data-t="${m.t}">${brikkeSvg(m.t, 24)}<b>${n ? n : "✓"}</b><span class="vh">${esc(n ? antallTekst(m.t, n) : R.t("{navn}: ferdig", { navn: SORT[m.t].navn }))}</span></li>`;
      })
      .join("");
  }

  function oppdaterHud(S) {
    const sp = S.spill;
    if (!sp) return;
    const p = R.$("#ek-poeng");
    if (p) p.textContent = R.tall(sp.poeng);
    const t = R.$("#ek-trekk");
    if (t) {
      const igjen = sp.maks - sp.trekk;
      t.textContent = String(igjen);
      t.closest(".ek-stat").classList.toggle("lite", igjen <= 3 && !sp.slutt);
    }
    const b = R.$("#ek-beste");
    if (b) b.textContent = R.tall(Math.max(S.rekord || 0, sp.poeng));
    const m = R.$(".ek-malliste");
    if (m) m.innerHTML = malHtml(sp);
  }

  // The board for a screen reader, one line per row.
  function oppdaterTekst(sp) {
    const el = R.$("#ek-tekst");
    if (!el) return;
    el.innerHTML = Array.from({ length: N }, (_, y) => `<li>${esc(R.t("Rad {n}: {liste}", { n: y + 1, liste: sp.brett.slice(y * N, y * N + N).map(brikkeNavn).join(", ") }))}</li>`).join("");
  }

  function siMarkor(sp) {
    if (markor < 0) return;
    const [x, y] = Match.xy(markor);
    R.si(`${R.t("Rad {rad}, kolonne {kolonne}: {navn}.", { rad: y + 1, kolonne: x + 1, navn: brikkeNavn(sp.brett[markor]) })}${markor === valgt ? " " + R.t("Valgt.") : ""}`);
  }

  // ---------- Pause ----------

  function pause(S, pa) {
    const sp = S.spill;
    if (!sp || sp.ferdig || pa === pauset) return;
    pauset = pa;
    if (pa) {
      pauseStart = performance.now();
      stoppHint();
    } else {
      // A move that was being drawn goes on from where it stopped.
      if (anim) anim.t0 += performance.now() - pauseStart;
      if (tegner) tegner.vekk();
      if (!anim) startHint();
    }
    visStatus();
  }

  function visStatus() {
    const el = R.$(".ek-status");
    const knapp = R.$('[data-h="pause"]');
    if (knapp) {
      knapp.setAttribute("aria-label", pauset ? R.t("Fortsett") : R.t("Pause"));
      knapp.classList.toggle("pauset", pauset);
    }
    if (!el) return;
    if (!pauset) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="ek-statuskort"><p class="etikett">${esc(R.t("Pause"))}</p><p class="ek-stor">${esc(R.t("Ekornet venter"))}</p>${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}</div>`;
  }

  // ---------- Pointer and keyboard ----------

  function cellePa(e) {
    const l = R.$(".ek-lerret");
    if (!l || !tegner || !tegner.D) return -1;
    const b = l.getBoundingClientRect();
    const x = Math.floor((e.clientX - b.left) / tegner.D);
    const y = Math.floor((e.clientY - b.top) / tegner.D);
    return x >= 0 && y >= 0 && x < N && y < N ? y * N + x : -1;
  }

  function trykk(S, i) {
    const sp = S.spill;
    if (!sp || sp.ferdig || anim || pauset || las) return;
    stoppHint();
    if (valgt >= 0 && valgt !== i && Match.nabo(valgt, i)) return prov(S, valgt, i);
    valgt = valgt === i ? -1 : i;
    R.lyd.tone(valgt >= 0 ? 700 : 480, 0, 0.04, "sine", 0.05);
    if (tegner) tegner.vekk();
    startHint();
  }

  function bindSpill(S, rot) {
    const ramme = R.$(".ek-ramme", rot);
    if (!ramme) return;
    let start = null;
    const ned = (e) => {
      if (e.target.closest("button") || (e.pointerType === "mouse" && e.button !== 0)) return;
      const sp = R.S.spill;
      if (!sp || sp.ferdig || pauset || las || R.arkApent()) return;
      const i = cellePa(e);
      if (i < 0) return;
      R.lyd.lasOpp();
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, i, brukt: false };
      markor = -1;
      try {
        ramme.setPointerCapture(e.pointerId);
      } catch (x) {
        /* ignore */
      }
      if (e.cancelable) e.preventDefault();
    };
    const flytt = (e) => {
      if (!start || e.pointerId !== start.id || start.brukt || !tegner) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < tegner.D * 0.32) return;
      start.brukt = true;
      const [x, y] = Match.xy(start.i);
      const [nx, ny] = Math.abs(dx) > Math.abs(dy) ? [x + Math.sign(dx), y] : [x, y + Math.sign(dy)];
      if (nx >= 0 && ny >= 0 && nx < N && ny < N) prov(R.S, start.i, ny * N + nx);
      if (e.cancelable) e.preventDefault();
    };
    const opp = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start;
      start = null;
      if (!s.brukt) trykk(R.S, s.i);
    };
    const avbryt = (e) => {
      if (start && e.pointerId === start.id) start = null;
    };
    const ingen = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    ramme.addEventListener("pointerdown", ned);
    ramme.addEventListener("pointermove", flytt);
    ramme.addEventListener("pointerup", opp);
    ramme.addEventListener("pointercancel", avbryt);
    ramme.addEventListener("touchmove", ingen, { passive: false });
    ramme.addEventListener("contextmenu", ingen);
    R.vedForlat(() => {
      ramme.removeEventListener("pointerdown", ned);
      ramme.removeEventListener("pointermove", flytt);
      ramme.removeEventListener("pointerup", opp);
      ramme.removeEventListener("pointercancel", avbryt);
      ramme.removeEventListener("touchmove", ingen, { passive: false });
      ramme.removeEventListener("contextmenu", ingen);
    });
  }

  const PILER = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    const sp = S.spill;
    const m = e.target;
    const paBrett = !!(m && m.closest && m.closest(".ek-ramme"));
    const fritt = paBrett || m === document.body || m === document.documentElement;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "Escape" && valgt >= 0) {
      e.preventDefault();
      valgt = -1;
      if (tegner) tegner.vekk();
      return R.si(R.t("Ingen brikke valgt."));
    }
    if (k === "Escape" || (k === "p" && fritt)) {
      e.preventDefault();
      return pause(S, !pauset);
    }
    if (pauset || sp.ferdig || !fritt) return;
    if (PILER[k]) {
      e.preventDefault();
      if (anim) return;
      stoppHint();
      if (markor < 0) markor = valgt >= 0 ? valgt : 27;
      const [x, y] = Match.xy(markor);
      const nx = x + PILER[k][0];
      const ny = y + PILER[k][1];
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) {
        R.lyd.tone(240, 0, 0.04, "sine", 0.04);
        return;
      }
      const ny1 = ny * N + nx;
      if (valgt >= 0) {
        const fra = valgt;
        markor = ny1;
        prov(S, fra, ny1);
      } else {
        markor = ny1;
        if (tegner) tegner.vekk();
        siMarkor(sp);
      }
      startHint();
    } else if (k === "Enter" || k === " ") {
      e.preventDefault();
      if (anim) return;
      if (markor < 0) markor = 27;
      valgt = valgt === markor ? -1 : markor;
      R.lyd.tone(valgt >= 0 ? 700 : 480, 0, 0.04, "sine", 0.05);
      if (tegner) tegner.vekk();
      siMarkor(sp);
    } else if (k === "h") {
      e.preventDefault();
      visHint();
      if (hint) {
        const [x1, y1] = Match.xy(hint.i);
        const [x2, y2] = Match.xy(hint.j);
        R.si(R.t("Tips: bytt rad {r1}, kolonne {k1} med rad {r2}, kolonne {k2}.", { r1: y1 + 1, k1: x1 + 1, r2: y2 + 1, k2: x2 + 1 }));
      }
    }
  });

  // Hidden tab, locked phone or another app: pause at once.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "spill" && !las) pause(S, true);
  });
  window.addEventListener("blur", () => {
    const S = R.S;
    if (S && S.skjerm === "spill" && !las) pause(S, true);
  });
  window.addEventListener("resize", () => {
    if (tegner) tegner.tilpass();
  });

  const fastSide = (pa) => document.documentElement.classList.toggle("ek-fast", !!pa);
  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>';
  const stjerneHtml = (n) => `<p class="ek-stjerner" role="img" aria-label="${esc(R.t("{n} av 3 stjerner", { n }))}">${[0, 1, 2].map((i) => `<i class="${i < n ? "pa" : ""}" aria-hidden="true">${STJERNE}</i>`).join("")}</p>`;

  // ---------- Start ----------

  function gyldigSpill(sp) {
    if (!sp || typeof sp !== "object") return false;
    if (sp.modus !== "brett" && sp.modus !== "trekk30") return false;
    if (sp.modus === "brett" && !(Number.isInteger(sp.niva) && sp.niva >= 1 && sp.niva <= 9999)) return false;
    if (!(sp.k === 5 || sp.k === 6)) return false;
    if (!Match.gyldigBrett(sp.brett, sp.k)) return false;
    if (!Array.isArray(sp.mal) || !sp.mal.every((m) => m && SORT[m.t] && Number.isInteger(m.n) && m.n > 0 && m.n < 100)) return false;
    if (!Number.isInteger(sp.maks) || sp.maks < 1 || sp.maks > 60) return false;
    const samlet = {};
    if (sp.samlet && typeof sp.samlet === "object") for (const t of [1, 2, 3, 4, 5, 6]) if (sp.samlet[t] > 0) samlet[t] = Math.floor(Number(sp.samlet[t]) || 0);
    sp.samlet = samlet;
    for (const k of ["poeng", "trekk", "besteKaskade", "spesialer", "startRekord"]) sp[k] = Math.max(0, Math.floor(Number(sp[k]) || 0));
    sp.trekk = Math.min(sp.trekk, sp.maks);
    sp.fro = Number(sp.fro) >>> 0;
    if (!["vunnet", "tapt", "ferdig"].includes(sp.slutt)) sp.slutt = null;
    sp.ferdig = !!sp.ferdig && !!sp.slutt;
    return true;
  }

  R.start({
    id: "ekornet",
    versjon: 1,
    pagar: (S) => iGang(S.spill) && S.spill.trekk > 0,

    tilstand: () => ({ niva: 1, stjerner: {}, rekord: 0, sist: null, spill: null }),

    lastet(S) {
      S.niva = Math.min(9999, Math.max(1, Math.floor(Number(S.niva) || 1)));
      S.rekord = Math.max(0, Math.floor(Number(S.rekord) || 0));
      const st = {};
      if (S.stjerner && typeof S.stjerner === "object") for (const k of Object.keys(S.stjerner)) if (/^\d{1,4}$/.test(k) && [1, 2, 3].includes(S.stjerner[k])) st[k] = S.stjerner[k];
      S.stjerner = st;
      if (!S.sist || typeof S.sist !== "object" || (S.sist.modus !== "brett" && S.sist.modus !== "trekk30")) S.sist = null;
      else {
        S.sist.niva = Math.max(1, Math.floor(Number(S.sist.niva) || 1));
        S.sist.stjerner = Math.min(3, Math.max(0, Math.floor(Number(S.sist.stjerner) || 0)));
        S.sist.poeng = Math.max(0, Math.floor(Number(S.sist.poeng) || 0));
      }
      if (S.spill && !gyldigSpill(S.spill)) S.spill = null;
      if (S.spill && S.spill.slutt && !S.spill.ferdig) ferdigstill(S);
      const sp = S.spill;
      if (S.skjerm === "slutt" && (!sp || !sp.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!sp || sp.ferdig)) S.skjerm = sp ? "slutt" : "hjem";
      anim = null;
      las = false;
      pauset = false;
      valgt = -1;
    },

    regler: {
      intro: R.t("Ekornet samler til vinteren. Bytt plass på to brikker som står ved siden av hverandre, så det blir tre eller flere like på rad."),
      steg: [
        [R.t("Bytt"), R.t("Sveip en brikke mot naboen, eller trykk på den ene og så på den andre. Byttet gjelder bare når det blir en rad.")],
        [R.t("Rydd og samle"), R.t("Tre eller flere like på rad forsvinner, og det over faller ned. Blir det nye rader av seg selv, får du mer for hver.")],
        [R.t("Nå målet"), R.t("På hvert brett står det hva du skal samle, og hvor mange trekk du har. Går trekkene ut, prøver du bare igjen.")],
      ],
      tips: [
        R.t("Fire på rad gir en pilbrikke. Når den ryddes, tar den med seg hele raden eller kolonnen – pilene viser hvilken vei."),
        R.t("Fem på rad, eller en L eller en T, gir en stjernebrikke som rydder alt rundt seg."),
        R.t("Lag rader langt nede på brettet: Da faller mer ned, og du får oftere flere rader på én gang."),
        R.t("Hver ting har sin egen form, så du trenger ikke skille fargene."),
        R.t("Står du fast, viser ekornet et tips etter en liten stund. Finnes det ingen trekk, stokkes brettet av seg selv."),
        R.t("Med tastatur: Piltastene flytter, Enter eller mellomrom velger, og en piltast bytter med naboen. H gir et tips og P pause."),
        R.t("30 trekk: Så mange poeng du klarer på tretti trekk – og en rekord å slå."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = iGang(sp) && sp.trekk > 0;
          const regler = R.ui.lenke(R.t("Slik spiller du"), "regler");
          const brettene = S.niva > 1 ? R.ui.lenke(R.t("Alle brett"), "brettene") : "";
          let knapper;
          if (aktiv) {
            knapper =
              R.ui.knapp(R.t("Fortsett · {hva}", { hva: `${modusTekst(sp)}, ${R.flertall(sp.poeng, "poeng", "poeng")}` }), "fortsett") +
              R.ui.knapp2(sp.modus === "brett" ? R.t("30 trekk") : R.t("Brett {n}", { n: S.niva }), sp.modus === "brett" ? "trekk30" : "brett") +
              R.ui.lenkerad(brettene, regler);
          } else {
            knapper =
              R.ui.knapp("", "brett", { variant: "stor", tekstHtml: `<span class="ek-knapp"><b>${esc(R.t("Brett {n}", { n: S.niva }))}</b><small>${esc(S.niva > 1 ? R.t("Neste brett") : R.t("Start her"))}</small></span>` }) +
              R.ui.knapp2(R.t("30 trekk"), "trekk30") +
              R.ui.lenkerad(brettene, regler);
          }
          const s = S.sist;
          const sist = s
            ? s.modus === "brett"
              ? s.vunnet
                ? R.t("Sist: brett {n} klart {stjerner}", { n: s.niva, stjerner: STJERNE.repeat(s.stjerner) })
                : R.t("Sist: brett {n} – nesten!", { n: s.niva })
              : R.t("Sist: {poeng} på 30 trekk", { poeng: R.flertall(s.poeng, "poeng", "poeng") })
            : "";
          const rekord = S.rekord && !(s && s.modus === "trekk30" && s.poeng === S.rekord) ? R.t("Rekord på 30 trekk: {poeng}", { poeng: R.flertall(S.rekord, "poeng", "poeng") }) : "";
          const linjer = [sist, rekord].filter(Boolean);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Bytt, match og samle til vinteren."))}<br><em>${esc(R.t("Tre like på rad – og det regner nøtter!"))}</em>`,
            knapperHtml: knapper + (linjer.length ? `<div class="ek-sistlinje">${linjer.map((l) => `<p>${esc(l)}</p>`).join("")}</div>` : ""),
            merker: [
              ["∞", R.t("brett")],
              ["6", R.t("skogsting")],
              ["0", R.t("reklame")],
            ],
          });
        },
      },

      brettene: {
        tittel: R.t("Alle brett"),
        tilbake: "hjem",
        vis(S) {
          const fliser = [];
          for (let n = 1; n <= S.niva; n++) {
            const st = S.stjerner[n] || 0;
            const etikett = st ? R.t("Brett {n}, {stjerner} av 3 stjerner", { n, stjerner: st }) : R.t("Brett {n}, ikke klart ennå", { n });
            fliser.push(`<button class="ek-brettflis${st ? "" : " ny"}" data-h="velg-brett" data-v="${n}" aria-label="${esc(etikett)}"><b>${n}</b><span aria-hidden="true">${st ? STJERNE.repeat(st) + "☆".repeat(3 - st) : "☆☆☆"}</span></button>`); // sprak-ok
          }
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Alle brett"))}</h1>
            <p class="ingress">${esc(R.t("Spill et brett på nytt og jakt på tre stjerner."))}</p>
            <div class="ek-brettgrid">${fliser.join("")}</div>`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? modusTekst(S.spill) : R.t("Ekornet")),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = S.spill;
          const brett = sp.modus === "brett";
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Ekornet, {hva}", { hva: modusTekst(sp) }))}</h1>
            <div class="ek-spill${brett ? " med-mal" : ""}">
              <div class="ek-hud">
                <span class="ek-stat ek-poengboks"><small>${esc(R.t("Poeng"))}</small><b id="ek-poeng">${R.tall(sp.poeng)}</b></span>
                <span class="ek-stat"><small>${esc(R.t("Trekk"))}</small><b id="ek-trekk">${sp.maks - sp.trekk}</b></span>
                ${brett ? "" : `<span class="ek-stat"><small>${esc(R.t("Rekord"))}</small><b id="ek-beste">${R.tall(Math.max(S.rekord || 0, sp.poeng))}</b></span>`}
                <button class="ek-pause${pauset ? " pauset" : ""}" data-h="pause" aria-label="${esc(pauset ? R.t("Fortsett") : R.t("Pause"))}">${PAUSE}</button>
              </div>
              ${brett ? `<div class="ek-maal"><span class="ek-maltekst">${esc(R.t("Samle"))}</span><ul class="ek-malliste" aria-label="${esc(R.t("Dette skal du samle"))}">${malHtml(sp)}</ul></div>` : ""}
              <div class="ek-flate">
                <div class="ek-ramme" tabindex="0" role="group" aria-label="${esc(R.t("Brettet, 8 ganger 8. Flytt med piltastene, velg med Enter, bytt med en piltast."))}" aria-describedby="ek-tekst">
                  <canvas class="ek-lerret" aria-hidden="true"></canvas>
                  <div class="ek-status" hidden></div>
                </div>
              </div>
              <ol class="vh" id="ek-tekst" aria-label="${esc(R.t("Brettet rad for rad"))}"></ol>
              <p class="ek-tips" aria-hidden="true"><span class="ek-finger">${esc(R.t("Sveip en brikke mot naboen"))}</span><span class="ek-tast">${esc(R.t("Piltaster flytter · Enter velger · H gir tips"))}</span></p>
            </div>`;
        },
        etter(S, rot) {
          if (tegner) tegner.stopp();
          tegner = new Tegner(rot);
          bindSpill(S, rot);
          visStatus();
          oppdaterTekst(S.spill);
          R.vedForlat(() => {
            if (tegner) tegner.stopp();
            tegner = null;
            stoppHint();
          });
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || sp.ferdig) return R.gaTil(sp ? "slutt" : "hjem");
          anim = null;
          las = false;
          valgt = -1;
          fastSide(true);
          if (tegner) tegner.tilpass();
          R.holdVaken();
          startHint();
        },
        ut() {
          anim = null;
          pauset = false;
          valgt = -1;
          markor = -1;
          stoppHint();
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.spill ? modusTekst(S.spill) : R.t("Ekornet")),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { poeng: sp.poeng };
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const tall = (verdi, tekst, ny) => `<div class="ek-tall${ny ? " ny" : ""}"><b>${verdi}</b><span>${esc(tekst)}</span>${ny ? `<i class="ek-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>`;
          if (sp.modus === "brett") {
            const vunnet = sp.slutt === "vunnet";
            const mangler = sp.mal.filter((m) => Match.igjen(sp, m.t) > 0).map((m) => antallTekst(m.t, Match.igjen(sp, m.t)));
            const tekst = vunnet ? (r.stjerner === 3 ? R.t("Tre stjerner – helt rått!") : R.t("Godt jobba! Spill igjen for flere stjerner.")) : R.t("Det manglet bare {liste}. Prøv igjen – du har så mange forsøk du vil.", { liste: R.ramsOpp(mangler) });
            return `
              ${R.ui.banner({ etikett: R.t("Brett {n}", { n: sp.niva }), tittel: vunnet ? R.t("Brettet er klart!") : R.t("Nesten!"), tekst, klasse: "aksent", stemning: vunnet ? "jubel" : "" })}
              ${vunnet ? stjerneHtml(r.stjerner || 1) : ""}
              <div class="ek-resultat">
                ${tall(R.tall(sp.poeng), R.t("poeng|poeng", { n: sp.poeng }))}
                ${tall(R.tall(sp.trekk), R.t("trekk|trekk", { n: sp.trekk }))}
                ${tall(sp.besteKaskade > 1 ? "×" + sp.besteKaskade : "–", R.t("beste kaskade"))}
              </div>
              ${R.ui.flereSpill({ antall: 1 })}
              ${R.ui.dokk(
                vunnet ? R.ui.knapp(R.t("Brett {n}", { n: sp.niva + 1 }), "neste") : R.ui.knapp(R.t("Prøv igjen"), "igjen"),
                R.ui.lenkerad(vunnet ? R.ui.lenke(R.t("Spill igjen"), "igjen") : "", vunnet ? R.ui.lenke(R.t("Del"), "del") : "", R.ui.lenke(R.t("Til Ekornet"), "tilbake"), alle),
              )}`;
          }
          const tittel = r.nyRekord ? R.t("Ny rekord!") : sp.poeng >= 3000 ? R.t("Godt jobba!") : R.t("Godt forsøk!");
          const linje = r.nyRekord ? R.t("Forrige rekord: {poeng}.", { poeng: R.flertall(r.gml, "poeng", "poeng") }) : r.forste ? R.t("Første runde – nå har du en rekord å slå!") : R.t("Rekorden din: {poeng}.", { poeng: R.flertall(S.rekord, "poeng", "poeng") });
          return `
            ${R.ui.banner({ etikett: R.t("30 trekk"), tittel, tekst: linje, klasse: "aksent", stemning: r.nyRekord || sp.poeng >= 3000 ? "jubel" : "" })}
            <div class="ek-resultat">
              ${tall(R.tall(sp.poeng), R.t("poeng|poeng", { n: sp.poeng }), r.nyRekord)}
              ${tall(sp.besteKaskade > 1 ? "×" + sp.besteKaskade : "–", R.t("beste kaskade"))}
              ${tall(R.tall(sp.spesialer), R.t("spesiell brikke|spesielle brikker", { n: sp.spesialer }))}
            </div>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Del"), "del"), R.ui.lenke(R.t("Til Ekornet"), "tilbake"), alle))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if ((sp.modus === "brett" && sp.slutt === "vunnet") || r.nyRekord || (r.forste && sp.poeng >= 3000)) {
            R.lyd.fanfare();
            if (sp.modus !== "brett" || r.stjerner >= 2) R.konfetti();
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async brett(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.spill) && S.spill.trekk > 0)) || !fortsatt()) return;
        nyttSpill(S, "brett", S.niva);
        R.gaTil("spill");
      },
      async trekk30(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.spill) && S.spill.trekk > 0)) || !fortsatt()) return;
        nyttSpill(S, "trekk30");
        R.gaTil("spill");
      },
      brettene: () => R.gaTil("brettene"),
      async "velg-brett"(el, e, S) {
        const n = Math.floor(Number(el.dataset.v));
        if (!(n >= 1 && n <= S.niva)) return;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.spill) && S.spill.trekk > 0)) || !fortsatt()) return;
        nyttSpill(S, "brett", n);
        R.gaTil("spill");
      },
      fortsett: (el, e, S) => R.gaTil(iGang(S.spill) ? "spill" : "hjem"),
      neste(el, e, S) {
        const n = S.spill && S.spill.modus === "brett" ? S.spill.niva + 1 : S.niva;
        nyttSpill(S, "brett", Math.min(n, S.niva));
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        const sp = S.spill;
        if (sp && sp.modus === "brett") nyttSpill(S, "brett", sp.niva);
        else nyttSpill(S, "trekk30");
        R.gaTil("spill");
      },
      regler(el, e, S) {
        if (S.skjerm === "spill") pause(S, true);
        R.visRegler();
      },
      pause: (el, e, S) => pause(S, !pauset),
      "fortsett-spill"(el, e, S) {
        pause(S, false);
        const r = R.$(".ek-ramme");
        if (r) r.focus({ preventScroll: true });
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const r = sp.resultat || {};
        const poeng = R.flertall(sp.poeng, "poeng", "poeng");
        if (sp.modus === "brett") {
          const st = STJERNE.repeat(r.stjerner || 0);
          const tekst = `🐿️ ${R.t("Ekornet")} · ${R.t("Brett {n}", { n: sp.niva })} ${st} · ${poeng}. ${R.t("Klarer du tre stjerner?")}`;
          R.del(R.t("Ekornet"), tekst, ADRESSE, { kort: { tittel: R.t("Brett {n}", { n: sp.niva }), linjer: [st, poeng, R.flertall(sp.trekk, "trekk", "trekk")] } });
        } else {
          const tekst = `🐿️ ${R.t("Ekornet")} · ${R.t("30 trekk")} · ${poeng}. ${R.t("Klarer du flere?")}`;
          R.del(R.t("Ekornet"), tekst, ADRESSE, { kort: { tittel: R.t("30 trekk"), linjer: [R.tall(sp.poeng), poeng, sp.besteKaskade > 1 ? R.t("Beste kaskade ×{n}", { n: sp.besteKaskade }) : ""].filter(Boolean) } });
        }
      },
    }),
  });
})();
