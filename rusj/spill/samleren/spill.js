/* Samleren — rummy for 1–4: you against one to three phone players, or two to four people passing
   one phone (the hand hides behind a gate between turns). Three games in one: classic rummy (sets
   and runs, lay off on any meld, first with an empty hand wins the others' cards), 500 (the discard
   pile lies spread out and you may take deeper cards if you meld the deepest at once; every card you
   lay out scores, what is left on the hand counts against you) and gin rummy for two (no melds on the
   table: knock with ten or less in loose cards, or go gin). The rules (Rummy) and the phone players
   (Mobil) are pure functions at the top; test/samleren.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Playing cards ----------
  // The same card look in Kortkongen, Vri åtter, Bussen and Pyramiden (copied, the games share no files).
  // A card is 0–51: suit = floor(k / 13) (0 spar, 1 hjerter, 2 ruter, 3 kløver), value = k % 13 + 1.
  const KORT = (() => {
    const SORTER = [
      { navn: "spar", rod: false },
      { navn: "hjerter", rod: true },
      { navn: "ruter", rod: true },
      { navn: "kløver", rod: false }, // sprak-ok (not shown in this game)
    ];
    const BOKSTAV = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const VERDINAVN = ["", "ess", "2", "3", "4", "5", "6", "7", "8", "9", "10", "knekt", "dame", "konge"];
    // «en 7-er», «et ess», «en dame»: for questions like «Har noen en 7-er?»
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

    return { SORTER, BOKSTAV, VERDINAVN, FORM, ROD, SVART, sortAv, verdiAv, erRod, farge, navn, Navn, svg, bilde, html, symbol };
  })();

  // ---------- Rules ----------
  // A round: { v ("klassisk" | "500" | "gin"), n, hender: [[card]], stokk (top = last), bunke (the
  //   discard pile, top = last), bord: [meld], tur, fase ("tilbud" gin's first offer | "trekk" draw |
  //   "spill" meld and discard | "slutt"), tilbud (gin: how many have turned the first card down),
  //   kunStokk (gin: nobody took the first card, so draw from the stock), tatt (the card taken from the
  //   discard pile this turn: it can't be thrown straight back), maaBruke (500: the deepest card taken
  //   must be laid out at once), omstokk, turer, tatte: [[cards each seat took from the pile]] (public),
  //   resultat, logg (this turn), forrige (the last finished turn) }
  // A meld on the table: { type ("sett" | "rekke"), kort (in order), av (who laid each card), hoy (a
  //   run with the ace on top: Q-K-A, 500 only) }

  const Rummy = (() => {
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    const VARIANTER = ["klassisk", "500", "gin"]; // sprak-ok (ids)
    const esHoy = (v) => v === "500";
    const kortPer = (v, n) => (v === "gin" ? 10 : v === "500" ? (n === 2 ? 13 : 7) : n === 2 ? 10 : 7);
    const maksSpillere = (v) => (v === "gin" ? 2 : 4);
    const MAKS_OMSTOKK = 2; // classic: the discard pile is turned into a new stock at most twice
    const MAKS_TURER = 600; // a round never runs for ever
    const BANK_GRENSE = 10;
    const GIN_BONUS = 25;
    const UNDERCUT_BONUS = 25;
    const gyldig = (k) => Number.isInteger(k) && k >= 0 && k < 52;

    // A card's points. Classic and gin: ace 1, 2–10 as shown, picture cards 10. 500: the ace is 15
    // (1 when it is the low end of a run, A-2-3).
    function verdi(v, k, lavtEss) {
      const t = verdiAv(k);
      if (t === 1) return v === "500" && !lavtEss ? 15 : 1;
      return t >= 10 ? 10 : t;
    }
    const handVerdi = (v, hand) => hand.reduce((s, k) => s + verdi(v, k), 0);

    function bland(liste, rng) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // A set (3–4 of a value) or a run (3+ in a row in one suit; the ace is low, or high too in 500,
    // never both). → { type, kort (in order), hoy } | null
    function meld(kort, hoyTillatt) {
      const n = Array.isArray(kort) ? kort.length : 0;
      if (n < 3 || new Set(kort).size !== n || !kort.every(gyldig)) return null;
      const t0 = verdiAv(kort[0]);
      if (kort.every((k) => verdiAv(k) === t0)) return n <= 4 ? { type: "sett", kort: kort.slice().sort((a, b) => a - b), hoy: false } : null;
      const s0 = sortAv(kort[0]);
      if (!kort.every((k) => sortAv(k) === s0)) return null;
      const prov = (hoy) => {
        const rang = (k) => (hoy && verdiAv(k) === 1 ? 14 : verdiAv(k));
        const sortert = kort.slice().sort((a, b) => rang(a) - rang(b));
        for (let i = 1; i < n; i++) if (rang(sortert[i]) !== rang(sortert[0]) + i) return null;
        return { type: "rekke", kort: sortert, hoy };
      };
      return prov(false) || (hoyTillatt && kort.some((k) => verdiAv(k) === 1) ? prov(true) : null);
    }

    function nyttMeld(kort, p, hoyTillatt) {
      const m = meld(kort, hoyTillatt);
      return m && { type: m.type, kort: m.kort, av: m.kort.map(() => p), hoy: m.hoy };
    }
    // Meld m with the cards nye added by p (laying off). → a new meld | null
    function utvid(m, nye, p, hoyTillatt) {
      if (!m || !nye.length || nye.some((k) => m.kort.includes(k))) return null;
      const ny = meld(m.kort.concat(nye), hoyTillatt);
      if (!ny || ny.type !== m.type) return null;
      const eier = new Map(m.kort.map((k, i) => [k, m.av[i]]));
      for (const k of nye) eier.set(k, p);
      return { type: ny.type, kort: ny.kort, av: ny.kort.map((k) => eier.get(k)), hoy: ny.hoy };
    }
    const meldKortVerdi = (v, m, k) => verdi(v, k, m.type === "rekke" && !m.hoy);
    // 500: what p has laid out this round (every card p put on the table, in anybody's meld).
    function utlagt(r, p) {
      let s = 0;
      for (const m of r.bord) m.kort.forEach((k, i) => {
        if (m.av[i] === p) s += meldKortVerdi(r.v, m, k);
      });
      return s;
    }

    // Every meld that can be made from the cards (sets of 3 and 4, runs of every length).
    function kandidater(hand, hoyTillatt) {
      const ut = [];
      const perVerdi = Array.from({ length: 14 }, () => []);
      for (const k of hand) perVerdi[verdiAv(k)].push(k);
      for (let t = 1; t <= 13; t++) {
        const g = perVerdi[t];
        if (g.length === 3) ut.push(g.slice());
        if (g.length === 4) {
          ut.push(g.slice());
          for (let i = 0; i < 4; i++) ut.push(g.filter((_, j) => j !== i));
        }
      }
      const maks = hoyTillatt ? 14 : 13;
      for (let s = 0; s < 4; s++) {
        const har = new Map();
        for (const k of hand)
          if (sortAv(k) === s) {
            har.set(verdiAv(k), k);
            if (hoyTillatt && verdiAv(k) === 1) har.set(14, k);
          }
        for (let a = 1; a <= maks - 2; a++) {
          if (!har.has(a)) continue;
          const rekke = [har.get(a)];
          for (let b = a + 1; b <= maks && har.has(b); b++) {
            const k = har.get(b);
            if (rekke.includes(k)) break;
            rekke.push(k);
            if (rekke.length >= 3) ut.push(rekke.slice());
          }
        }
      }
      return ut;
    }

    // The best way to lay a hand out: melds and the cards left over. Minimises what the leftover cards
    // cost, minus (in 500) what the melds earn. → { melds: [[k]], rest: [k], kost, dod (the leftover's points) }
    function beste(hand, v) {
      const hoy = esHoy(v);
      const n = hand.length;
      const K = kandidater(hand, hoy);
      const kost = (k) => verdi(v, k);
      const gevinst = K.map((m) => {
        if (v !== "500") return 0;
        const mm = meld(m, true);
        return m.reduce((s, k) => s + verdi(v, k, mm.type === "rekke" && !mm.hoy), 0);
      });
      const svar = (melds) => {
        const brukt = new Set([].concat(...melds));
        const rest = hand.filter((k) => !brukt.has(k));
        const dod = rest.reduce((s, k) => s + kost(k), 0);
        let g = 0;
        for (const m of melds) g += gevinst[K.indexOf(m)] || 0;
        return { melds: melds.map((m) => m.slice()), rest, kost: dod - g, dod };
      };
      if (n > 30) {
        // A huge hand (500, after taking much of the pile): good enough, greedily.
        const rekkefolge = K.map((m, i) => i).sort((a, b) => gevinst[b] - gevinst[a] || K[b].length - K[a].length);
        const brukt = new Set();
        const melds = [];
        for (const i of rekkefolge)
          if (K[i].every((k) => !brukt.has(k))) {
            K[i].forEach((k) => brukt.add(k));
            melds.push(K[i]);
          }
        return svar(melds);
      }
      const idx = new Map(hand.map((k, i) => [k, i]));
      const maske = K.map((m) => m.reduce((s, k) => s | (1 << idx.get(k)), 0));
      const memo = new Map();
      const valg = new Map();
      const dfs = (mask) => {
        if (!mask) return 0;
        const husket = memo.get(mask);
        if (husket !== undefined) return husket;
        const lav = mask & -mask;
        const i = 31 - Math.clz32(lav);
        let best = kost(hand[i]) + dfs(mask & ~lav);
        let hvilket = -1;
        for (let c = 0; c < K.length; c++) {
          const m = maske[c];
          if (m & lav && (m & mask) === m) {
            const x = -gevinst[c] + dfs(mask & ~m);
            if (x < best) {
              best = x;
              hvilket = c;
            }
          }
        }
        memo.set(mask, best);
        valg.set(mask, hvilket);
        return best;
      };
      const alle = n ? (1 << n) - 1 : 0;
      dfs(alle);
      const melds = [];
      for (let mask = alle; mask; ) {
        const lav = mask & -mask;
        const c = valg.get(mask);
        if (c == null || c < 0) mask &= ~lav;
        else {
          melds.push(K[c]);
          mask &= ~maske[c];
        }
      }
      return svar(melds);
    }

    // The hand cards that let k join table meld m: [k], or k with the run cards between. → [cards] | null
    function leggTilMed(m, k, hand, hoyTillatt) {
      if (utvid(m, [k], 0, hoyTillatt)) return [k];
      if (m.type !== "rekke" || sortAv(k) !== sortAv(m.kort[0])) return null;
      const s = sortAv(k);
      const rangM = (x) => (m.hoy && verdiAv(x) === 1 ? 14 : verdiAv(x));
      const lo = rangM(m.kort[0]);
      const hi = rangM(m.kort[m.kort.length - 1]);
      for (const rk of verdiAv(k) === 1 ? (hoyTillatt ? [1, 14] : [1]) : [verdiAv(k)]) {
        const trengs = [];
        if (rk > hi) for (let t = hi + 1; t < rk; t++) trengs.push(t);
        else if (rk < lo) for (let t = rk + 1; t < lo; t++) trengs.push(t);
        else continue;
        const med = [k];
        for (const t of trengs) {
          const x = hand.find((y) => y !== k && sortAv(y) === s && verdiAv(y) === (t === 14 ? 1 : t));
          if (x == null) break;
          med.push(x);
        }
        if (med.length === trengs.length + 1 && utvid(m, med, 0, hoyTillatt)) return med;
      }
      return null;
    }
    // Can card k (already in hand) be laid out at once: in a new meld, or onto a meld on the table?
    function kanBrukes(k, hand, bord, v) {
      const hoy = esHoy(v);
      if (kandidater(hand, hoy).some((m) => m.includes(k))) return true;
      return bord.some((m) => leggTilMed(m, k, hand, hoy) != null);
    }

    // o: { v, n, start (who begins; in gin the other one deals) }
    function nyRunde(o, rng) {
      const v = VARIANTER.includes(o.v) ? o.v : "klassisk";
      const n = Math.max(2, Math.min(maksSpillere(v), o.n || 2));
      const stokk = bland(Array.from({ length: 52 }, (_, i) => i), rng);
      const hender = Array.from({ length: n }, () => []);
      for (let c = 0; c < kortPer(v, n); c++) for (let p = 0; p < n; p++) hender[p].push(stokk.pop());
      return {
        v,
        n,
        hender,
        stokk,
        bunke: [stokk.pop()],
        bord: [],
        tur: (((o.start || 0) % n) + n) % n,
        fase: v === "gin" ? "tilbud" : "trekk",
        tilbud: 0,
        kunStokk: false,
        tatt: null,
        maaBruke: null,
        omstokk: 0,
        turer: 0,
        tatte: Array.from({ length: n }, () => []),
        resultat: null,
        logg: [],
        forrige: [],
      };
    }

    const iTur = (r, p) => r.fase !== "slutt" && r.tur === p;
    const topp = (r) => r.bunke[r.bunke.length - 1];

    function avslutt(r, p, type) {
      r.fase = "slutt";
      const rester = r.hender.map((h) => handVerdi(r.v, h));
      let res;
      if (r.v === "gin") res = type === "tom" ? { type, vinner: null, poeng: [0, 0] } : ginOppgjor(r, p, type);
      else if (r.v === "500") {
        const ut = Array.from({ length: r.n }, (_, q) => utlagt(r, q));
        res = { type, vinner: type === "ute" ? p : null, utlagt: ut, poeng: ut.map((x, q) => x - rester[q]) };
      } else {
        const gevinst = type === "ute" ? rester.reduce((s, x, q) => s + (q === p ? 0 : x), 0) : 0;
        res = { type, vinner: type === "ute" ? p : null, gevinst, poeng: rester.map((x, q) => (type === "ute" && q === p ? gevinst : 0)) };
      }
      res.rester = rester;
      r.resultat = res;
      r.forrige = r.logg;
      r.logg = [];
    }

    function nesteTur(r) {
      r.forrige = r.logg;
      r.logg = [];
      r.tur = (r.tur + 1) % r.n;
      r.fase = "trekk";
      r.tatt = null;
      r.kunStokk = false;
      r.maaBruke = null;
      r.turer++;
      if (r.turer >= MAKS_TURER) return avslutt(r, null, "tom");
      // Gin: the hand is void when only two cards are left in the stock.
      if (r.v === "gin" && r.stokk.length <= 2) return avslutt(r, null, "tom");
      // Classic: an empty stock → the discard pile (all but its top card) is turned over.
      if (r.v === "klassisk" && !r.stokk.length) {
        if (r.omstokk >= MAKS_OMSTOKK || r.bunke.length < 2) return avslutt(r, null, "tom");
        const t = r.bunke.pop();
        r.stokk = r.bunke.reverse();
        r.bunke = [t];
        r.omstokk++;
        r.logg.push({ type: "snudd" });
      }
    }

    // Draw the top card of the stock. → the card | null
    function trekk(r, p) {
      if (!iTur(r, p) || r.fase !== "trekk" || !r.stokk.length) return null;
      const k = r.stokk.pop();
      r.hender[p].push(k);
      r.fase = "spill";
      r.tatt = null;
      r.logg.push({ type: "trekk", p, k });
      return k;
    }

    // Take from the discard pile: the top card, or in 500 card i and every card above it (then card i
    // must be laid out at once, so only when that is possible).
    function kanTa(r, p, i) {
      if (!iTur(r, p) || !r.bunke.length) return false;
      const siste = r.bunke.length - 1;
      if (i == null) i = siste;
      if (!Number.isInteger(i) || i < 0 || i > siste) return false;
      if (r.fase === "tilbud") return i === siste;
      if (r.fase !== "trekk" || r.kunStokk) return false;
      if (i === siste) return true;
      if (r.v !== "500") return false;
      return kanBrukes(r.bunke[i], r.hender[p].concat(r.bunke.slice(i)), r.bord, r.v);
    }
    function ta(r, p, i) {
      if (i == null) i = r.bunke.length - 1;
      if (!kanTa(r, p, i)) return false;
      const kort = r.bunke.splice(i);
      r.hender[p].push(...kort);
      r.tatte[p].push(...kort);
      r.tatt = kort[0];
      r.maaBruke = kort.length > 1 ? kort[0] : null;
      r.fase = "spill";
      r.kunStokk = false;
      r.logg.push({ type: "ta", p, kort: kort.slice() });
      return true;
    }

    // Gin, the first card: turn it down (the non-dealer first, then the dealer; then the non-dealer draws from the stock).
    function avsla(r, p) {
      if (!iTur(r, p) || r.fase !== "tilbud") return false;
      r.logg.push({ type: "avsla", p });
      r.forrige = r.logg;
      r.logg = [];
      r.tur = (r.tur + 1) % r.n;
      if (r.tilbud === 0) r.tilbud = 1;
      else {
        r.fase = "trekk";
        r.kunStokk = true;
      }
      return true;
    }

    const harAlle = (hand, kort) => Array.isArray(kort) && kort.length > 0 && new Set(kort).size === kort.length && kort.every((k) => hand.includes(k));

    // Lay out a new meld (classic and 500). While a card from deep in the pile waits, it must be in it.
    function kanLeggeUt(r, p, kort) {
      if (!iTur(r, p) || r.fase !== "spill" || r.v === "gin" || !harAlle(r.hender[p], kort)) return false;
      if (r.maaBruke != null && !kort.includes(r.maaBruke)) return false;
      return !!meld(kort, esHoy(r.v));
    }
    function legUt(r, p, kort) {
      if (!kanLeggeUt(r, p, kort)) return false;
      const m = nyttMeld(kort, p, esHoy(r.v));
      r.hender[p] = r.hender[p].filter((k) => !kort.includes(k));
      r.bord.push(m);
      if (kort.includes(r.maaBruke)) r.maaBruke = null;
      r.logg.push({ type: "meld", p, kort: m.kort.slice() });
      if (!r.hender[p].length) avslutt(r, p, "ute");
      return true;
    }
    // Lay cards off onto meld mi on the table (anybody's).
    function kanLeggeTil(r, p, kort, mi) {
      if (!iTur(r, p) || r.fase !== "spill" || r.v === "gin" || !harAlle(r.hender[p], kort) || !r.bord[mi]) return false;
      if (r.maaBruke != null && !kort.includes(r.maaBruke)) return false;
      return !!utvid(r.bord[mi], kort, p, esHoy(r.v));
    }
    function leggTil(r, p, kort, mi) {
      if (!kanLeggeTil(r, p, kort, mi)) return false;
      r.bord[mi] = utvid(r.bord[mi], kort, p, esHoy(r.v));
      r.hender[p] = r.hender[p].filter((k) => !kort.includes(k));
      if (kort.includes(r.maaBruke)) r.maaBruke = null;
      r.logg.push({ type: "til", p, kort: kort.slice(), mi });
      if (!r.hender[p].length) avslutt(r, p, "ute");
      return true;
    }

    // End the turn by throwing a card on the pile. Not the card just taken from it (unless it is the last one).
    function kanKaste(r, p, k) {
      return iTur(r, p) && r.fase === "spill" && r.maaBruke == null && r.hender[p].includes(k) && (k !== r.tatt || r.hender[p].length === 1);
    }
    function kast(r, p, k) {
      if (!kanKaste(r, p, k)) return false;
      r.hender[p].splice(r.hender[p].indexOf(k), 1);
      r.bunke.push(k);
      r.logg.push({ type: "kast", p, k });
      if (!r.hender[p].length) avslutt(r, p, "ute");
      else nesteTur(r);
      return true;
    }

    // Gin: the loose points left if p throws k. → number | null
    function bankDod(r, p, k) {
      if (r.v !== "gin" || !kanKaste(r, p, k)) return null;
      return beste(r.hender[p].filter((x) => x !== k), "gin").dod;
    }
    // Gin: knock (ten or less loose) or go gin (none) while throwing k.
    function bank(r, p, k) {
      const dod = bankDod(r, p, k);
      if (dod == null || dod > BANK_GRENSE) return false;
      r.hender[p].splice(r.hender[p].indexOf(k), 1);
      r.bunke.push(k);
      r.logg.push({ type: "bank", p, k, gin: dod === 0 });
      avslutt(r, p, dod === 0 ? "gin" : "bank");
      return true;
    }

    // 500: the stock is empty and you won't take from the pile – the round ends.
    function kanStoppe(r, p) {
      return iTur(r, p) && r.fase === "trekk" && r.v === "500" && !r.stokk.length;
    }
    function stopp(r, p) {
      if (!kanStoppe(r, p)) return false;
      r.logg.push({ type: "stopp", p });
      avslutt(r, null, "tom");
      return true;
    }

    // Gin: the defender's best answer to a knock – its own melds, then every loose card that fits the
    // knocker's melds laid off onto them. → { melds, rest, avlagt, bord, dod }
    function forsvar(hand, kMelds) {
      const K = kandidater(hand, false);
      const brukt = new Set();
      const melds = [];
      let best = null;
      const sjekk = () => {
        let igjen = hand.filter((k) => !brukt.has(k));
        const bord = kMelds.map((m) => ({ type: m.type, kort: m.kort.slice(), av: m.av.slice(), hoy: false }));
        const avlagt = [];
        for (let endret = true; endret; ) {
          endret = false;
          for (const k of igjen) {
            const i = bord.findIndex((m) => utvid(m, [k], -1, false));
            if (i < 0) continue;
            bord[i] = utvid(bord[i], [k], -1, false);
            avlagt.push(k);
            igjen = igjen.filter((x) => x !== k);
            endret = true;
            break;
          }
        }
        const dod = igjen.reduce((s, k) => s + verdi("gin", k), 0);
        if (!best || dod < best.dod) best = { melds: melds.map((m) => m.slice()), rest: igjen, avlagt, bord, dod };
      };
      const dfs = (i) => {
        if (i === hand.length) return sjekk();
        const k = hand[i];
        if (brukt.has(k)) return dfs(i + 1);
        dfs(i + 1);
        for (const m of K)
          if (m.includes(k) && m.every((x) => !brukt.has(x))) {
            m.forEach((x) => brukt.add(x));
            melds.push(m);
            dfs(i + 1);
            melds.pop();
            m.forEach((x) => brukt.delete(x));
          }
      };
      dfs(0);
      return best;
    }

    function ginOppgjor(r, p, type) {
      const d = 1 - p;
      const kb = beste(r.hender[p], "gin");
      const kMelds = kb.melds.map((m) => nyttMeld(m, p, false));
      let f;
      if (type === "gin") {
        const db = beste(r.hender[d], "gin");
        f = { melds: db.melds, rest: db.rest, avlagt: [], bord: kMelds, dod: db.dod };
      } else f = forsvar(r.hender[d], kMelds);
      const dk = kb.dod;
      const dd = f.dod;
      const poeng = [0, 0];
      let undercut = false;
      if (type === "gin") poeng[p] = dd + GIN_BONUS;
      else if (dk < dd) poeng[p] = dd - dk;
      else {
        poeng[d] = dk - dd + UNDERCUT_BONUS;
        undercut = true;
      }
      const oppstilling = [];
      oppstilling[p] = { melds: kb.melds, rest: kb.rest, dod: dk, avlagt: [] };
      oppstilling[d] = { melds: f.melds, rest: f.rest, dod: dd, avlagt: f.avlagt };
      return { type, banker: p, vinner: undercut ? d : p, undercut, poeng, oppstilling };
    }

    // Every card exactly once, melds that hold (for checking a restored round).
    function hel(r) {
      if (!r || !VARIANTER.includes(r.v) || !Number.isInteger(r.n) || r.n < 2 || r.n > maksSpillere(r.v)) return false;
      if (!Array.isArray(r.hender) || r.hender.length !== r.n || !r.hender.every(Array.isArray) || !Array.isArray(r.stokk) || !Array.isArray(r.bunke) || !Array.isArray(r.bord)) return false;
      if (!Array.isArray(r.tatte) || r.tatte.length !== r.n || !Array.isArray(r.logg) || !Array.isArray(r.forrige)) return false;
      if (!r.bord.every((m) => m && Array.isArray(m.kort) && Array.isArray(m.av) && m.av.length === m.kort.length && meld(m.kort, esHoy(r.v)))) return false;
      const alle = [].concat(...r.hender, r.stokk, r.bunke, ...r.bord.map((m) => m.kort));
      if (alle.length !== 52 || new Set(alle).size !== 52 || !alle.every(gyldig)) return false;
      if (!["tilbud", "trekk", "spill", "slutt"].includes(r.fase) || (r.fase === "slutt" && !r.resultat)) return false;
      return Number.isInteger(r.tur) && r.tur >= 0 && r.tur < r.n;
    }

    return {
      sortAv, verdiAv, VARIANTER, esHoy, kortPer, maksSpillere, BANK_GRENSE, GIN_BONUS, UNDERCUT_BONUS, verdi, handVerdi, bland, meld, nyttMeld, utvid,
      meldKortVerdi, utlagt, kandidater, beste, leggTilMed, kanBrukes, nyRunde, iTur, topp, trekk, kanTa, ta, avsla, kanLeggeUt, legUt, kanLeggeTil,
      leggTil, kanKaste, kast, bankDod, bank, kanStoppe, stopp, forsvar, hel,
    };
  })();

  // ---------- The phone players ----------
  // 1 Lett: lays out what it sees, takes the top card now and then, throws a loose card at random.
  // 2 Middels: weighs every draw and discard by the best way to lay the hand out, keeps pairs and
  // neighbours, lays off onto the table. 3 Vanskelig: also avoids feeding the next player (cards that
  // fit the table or what that player took from the pile), and in 500 digs deep in the pile when it pays.
  // Only what a player at the table can know is used: its own hand, the table, the discard pile and
  // what each player took from the pile.

  const Mobil = (() => {
    const { sortAv, verdiAv, esHoy } = Rummy;

    function naerhet(k, rest) {
      let n = 0;
      for (const x of rest) {
        if (x === k) continue;
        if (verdiAv(x) === verdiAv(k)) n += 2;
        else if (sortAv(x) === sortAv(k)) {
          const d = Math.abs(verdiAv(x) - verdiAv(k));
          if (d === 1) n += 2;
          else if (d === 2) n += 1;
        }
      }
      return Math.min(n, 4);
    }
    // Vanskelig counts the cards that could still come: a pair or two neighbours are only worth
    // something while the cards that complete them are unseen (not on the table, not in the pile,
    // not taken from the pile by somebody else, not on its own hand).
    function sett(r, p) {
      const s = new Set(r.hender[p].concat(r.bunke, ...r.bord.map((m) => m.kort)));
      for (let q = 0; q < r.n; q++) if (q !== p) for (const k of r.tatte[q]) s.add(k);
      return s;
    }
    const kortAv = (s, t) => s * 13 + ((t - 1) % 13);
    function utganger(k, rest, kjent) {
      let n = 0;
      const ukjent = (c) => !kjent.has(c);
      for (const x of rest) {
        if (x === k) continue;
        const t = verdiAv(k);
        if (verdiAv(x) === t) {
          let u = 0;
          for (let s = 0; s < 4; s++) if (s !== sortAv(k) && s !== sortAv(x) && ukjent(kortAv(s, t))) u++;
          n += u;
        } else if (sortAv(x) === sortAv(k)) {
          const lo = Math.min(t, verdiAv(x));
          const hi = Math.max(t, verdiAv(x));
          const s = sortAv(k);
          if (hi - lo === 1) n += (lo > 1 && ukjent(kortAv(s, lo - 1)) ? 1 : 0) + (hi < 13 && ukjent(kortAv(s, hi + 1)) ? 1 : 0);
          else if (hi - lo === 2) n += ukjent(kortAv(s, lo + 1)) ? 0.5 : 0;
        }
      }
      return Math.min(n, 3) * 4 / 3;
    }
    // What a hand is worth to the phone (lower is better).
    function vurder(r, p, hand, niva) {
      const b = Rummy.beste(hand, r.v);
      if (niva <= 1) return b.kost;
      let v = b.kost;
      const kjent = niva >= 3 ? sett(r, p) : null;
      if (kjent) for (const k of hand) kjent.add(k);
      for (const k of b.rest) {
        if (r.v !== "gin" && r.bord.some((m) => Rummy.utvid(m, [k], p, esHoy(r.v)))) v -= Rummy.verdi(r.v, k) * (r.v === "500" ? 2 : 1);
        else v -= (kjent ? utganger(k, b.rest, kjent) : naerhet(k, b.rest)) * (r.v === "gin" ? 0.6 : 1);
      }
      return v;
    }
    // Vanskelig: how much throwing k helps the next player.
    function fare(r, p, k) {
      const neste = (p + 1) % r.n;
      let f = 0;
      if (r.v !== "gin" && r.bord.some((m) => Rummy.utvid(m, [k], neste, esHoy(r.v)))) f += 4;
      const synlig = new Set(r.bunke.concat(...r.bord.map((m) => m.kort)));
      for (const x of r.tatte[neste]) {
        if (synlig.has(x)) continue; // laid out or thrown again: no longer on that hand
        if (verdiAv(x) === verdiAv(k)) f += 3;
        else if (sortAv(x) === sortAv(k) && Math.abs(verdiAv(x) - verdiAv(k)) <= 2) f += 2;
      }
      return f;
    }

    function velgKast(r, p, niva, rng) {
      const hand = r.hender[p];
      const lov = hand.filter((k) => Rummy.kanKaste(r, p, k));
      if (lov.length <= 1) return lov[0];
      if (niva <= 1) {
        const rest = Rummy.beste(hand, r.v).rest.filter((k) => lov.includes(k));
        const pool = rest.length ? rest : lov;
        if (rng() < 0.5) return pool.reduce((a, b) => (Rummy.verdi(r.v, b) > Rummy.verdi(r.v, a) ? b : a));
        return pool[Math.floor(rng() * pool.length)];
      }
      // Middels slips now and then: a loose card at random.
      if (niva === 2 && rng() < 0.2) {
        const rest = Rummy.beste(hand, r.v).rest.filter((k) => lov.includes(k));
        if (rest.length) return rest[Math.floor(rng() * rest.length)];
      }
      let best = lov[0];
      let bestV = Infinity;
      for (const k of lov) {
        let v = vurder(r, p, hand.filter((x) => x !== k), niva);
        if (niva >= 3) v += fare(r, p, k) * 0.35;
        v -= Rummy.verdi(r.v, k) * 0.01 - rng() * 0.001;
        if (v < bestV) {
          bestV = v;
          best = k;
        }
      }
      return best;
    }

    // Is the top card of the pile worth taking?
    function taBra(r, p, niva, rng) {
      const t = Rummy.topp(r);
      if (t == null) return false;
      const hand = r.hender[p];
      const med = hand.concat(t);
      if (niva <= 2) {
        // Lett and Middels only take a card that goes straight into a meld.
        const b = Rummy.beste(med, r.v);
        const nytte = b.melds.some((m) => m.includes(t)) || (r.v !== "gin" && r.bord.some((m) => Rummy.utvid(m, [t], p, esHoy(r.v))));
        return nytte && rng() < (niva <= 1 ? 0.7 : 1);
      }
      const etter = Math.min(...hand.map((x) => vurder(r, p, med.filter((y) => y !== x), niva)));
      const uten = Math.min(...hand.map((x) => vurder(r, p, hand.filter((y) => y !== x), niva)));
      return etter < uten - (niva >= 3 ? 0.5 : 1.5);
    }

    // { type: "trekk" } | { type: "ta", i } | { type: "avsla" } | { type: "stopp" } — always allowed.
    function velgTrekk(r, p, niva, rng) {
      rng = rng || Math.random;
      if (r.fase === "tilbud") return taBra(r, p, niva, rng) ? { type: "ta" } : { type: "avsla" };
      const hand = r.hender[p];
      if (r.v === "500" && niva >= 2 && r.bunke.length > 1) {
        const naa = vurder(r, p, hand, niva);
        let best = null;
        let bestG = niva >= 3 ? 8 : 14;
        for (let i = 0; i < r.bunke.length - 1; i++) {
          if (!Rummy.kanTa(r, p, i)) continue;
          const tatt = r.bunke.slice(i);
          const g = naa - vurder(r, p, hand.concat(tatt), niva) - tatt.length * (niva >= 3 ? 1.5 : 2.5);
          if (g > bestG) {
            bestG = g;
            best = i;
          }
        }
        if (best != null) return { type: "ta", i: best };
      }
      if (!r.kunStokk && Rummy.kanTa(r, p) && taBra(r, p, niva, rng)) return { type: "ta" };
      if (r.stokk.length) return { type: "trekk" };
      if (Rummy.kanTa(r, p) && Rummy.kanStoppe(r, p) && niva >= 2 && taBra(r, p, niva, rng)) return { type: "ta" };
      return { type: "stopp" };
    }

    // 500: the card from deep in the pile goes out first.
    function bruk(r, p, k) {
      const hand = r.hender[p];
      const b = Rummy.beste(hand, r.v);
      const nye = b.melds.filter((m) => m.includes(k)).concat(Rummy.kandidater(hand, esHoy(r.v)).filter((m) => m.includes(k)).sort((a, c) => c.length - a.length));
      for (const m of nye) if (Rummy.legUt(r, p, m)) return true;
      for (let i = 0; i < r.bord.length; i++) {
        const med = Rummy.leggTilMed(r.bord[i], k, hand, esHoy(r.v));
        if (med && Rummy.leggTil(r, p, med, i)) return true;
      }
      return false;
    }

    // Knock at once (the best plan against a counting opponent), but Lett waits for 5 or less now and then.
    function vilBanke(r, niva, dod, rng) {
      if (dod === 0 || niva >= 2) return true;
      return dod <= 5 || rng() < 0.5;
    }

    // After drawing: lay out, lay off, then throw (or knock). Returns false only on a bug.
    function spillResten(r, p, niva, rng) {
      rng = rng || Math.random;
      if (r.fase !== "spill" || r.tur !== p) return false;
      if (r.v === "gin") {
        let bankK = null;
        let bankD = Infinity;
        for (const x of r.hender[p]) {
          const d = Rummy.bankDod(r, p, x);
          if (d != null && d < bankD) {
            bankD = d;
            bankK = x;
          }
        }
        if (bankD <= Rummy.BANK_GRENSE && vilBanke(r, niva, bankD, rng)) return Rummy.bank(r, p, bankK);
        return Rummy.kast(r, p, velgKast(r, p, niva, rng));
      }
      if (r.maaBruke != null && !bruk(r, p, r.maaBruke)) return false;
      if (r.fase !== "spill") return true;
      for (const m of Rummy.beste(r.hender[p], r.v).melds) {
        if (r.fase !== "spill") return true;
        if (!Rummy.legUt(r, p, m)) return false;
      }
      if (r.fase !== "spill") return true;
      if (niva >= 2 || rng() < 0.5)
        for (let endret = true; endret && r.fase === "spill"; ) {
          endret = false;
          for (const k of r.hender[p]) {
            const i = r.bord.findIndex((m) => Rummy.utvid(m, [k], p, esHoy(r.v)));
            if (i >= 0 && Rummy.leggTil(r, p, [k], i)) {
              endret = true;
              break;
            }
          }
        }
      if (r.fase !== "spill") return true;
      return Rummy.kast(r, p, velgKast(r, p, niva, rng));
    }

    // A whole turn (for simulations). Returns false only on a bug.
    function spillTur(r, p, niva, rng) {
      for (let n = 0; n < 3 && r.tur === p && r.fase !== "slutt" && r.fase !== "spill"; n++) {
        const v = velgTrekk(r, p, niva, rng);
        let ok;
        if (v.type === "trekk") ok = Rummy.trekk(r, p) != null;
        else if (v.type === "ta") ok = Rummy.ta(r, p, v.i);
        else if (v.type === "avsla") return Rummy.avsla(r, p);
        else ok = Rummy.stopp(r, p);
        if (!ok) return false;
      }
      if (r.fase === "slutt") return true;
      return spillResten(r, p, niva, rng);
    }

    return { velgTrekk, spillResten, spillTur, velgKast, vurder };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules, the phone players and the cards.
    window.Samleren = { Rummy, Mobil, KORT };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { sortAv, verdiAv } = Rummy;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen legger ut det den ser og kaster litt på måfå. Fint for å lære."),
    2: R.t("Mobilen tenker over hvert kort den kaster, men bommer av og til."),
    3: R.t("Mobilen teller kort, husker hva dere tar, og mater ingen. Klarer du å slå den?"),
  };
  const VARIANT = {
    klassisk: { navn: R.t("Rummy"), tekst: R.t("Sett og rekker – bli kvitt kortene først"), ikon: "🃏" },
    500: { navn: "500", tekst: R.t("Alt du legger ut, gir poeng"), ikon: "🏆" },
    gin: { navn: "Gin rummy", tekst: R.t("For to – bank på med ti eller mindre"), ikon: "✊" },
  };
  const MAL = {
    klassisk: [["en", R.t("Én runde")], ["100", R.t("Først til 100")]],
    500: [["250", R.t("Først til 250")], ["500", R.t("Først til 500")]],
    gin: [["en", R.t("Én runde")], ["100", R.t("Først til 100")]],
  };
  const MAL_STANDARD = { klassisk: "100", 500: "500", gin: "100" };
  const MAL_TEKST = {
    en: R.t("Én runde – den som vinner runden, vinner."),
    100: R.t("Vinneren av hver runde får poeng. Først til 100 vinner."),
    250: R.t("Poengene fra hver runde legges sammen. Først til 250 vinner."),
    500: R.t("Poengene fra hver runde legges sammen. Først til 500 vinner."),
  };
  const VERDIORD = ["", R.t("ess"), R.t("to"), R.t("tre"), R.t("fire"), R.t("fem"), R.t("seks"), R.t("sju"), R.t("åtte"), R.t("ni"), R.t("ti"), R.t("knekt"), R.t("dame"), R.t("konge")];
  const FARGENAVN = [R.t("spar"), R.t("hjerter"), R.t("ruter"), R.t("kløver")];
  // «hjerter sju», «spar dame»
  const kortnavn = (k) => R.t("{farge} {verdi}", { farge: FARGENAVN[sortAv(k)], verdi: VERDIORD[verdiAv(k)] });
  const kortListe = (kort) => kort.map(kortnavn).join(", ");
  const FART = { trekk: 800, spill: 1100, start: 900 }; // ms per step of a phone player
  // This edition's address (rusj.no/samleren/, rusj.no/en/…)
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/samleren/" }).href;
  let H;

  // S.spill: { id, variant, modus ("mobil" | "flere"), niva, n, mal, runde, starter, poeng [per seat],
  //   seire [rounds won], r (the round, see Rummy), lagt (the round's points are counted), port (hot
  //   seat: the hand waits behind «Vis kortene mine»), valgt [selected cards], bunkeValg (500: a card
  //   picked deep in the pile), angre (the round as it was when this turn's laying out began), endret,
  //   ny [cards just drawn], ferdig, registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMenneske = (sp, p) => sp.modus === "flere" || p === 0;
  const navn = (sp, p) => (sp.modus === "flere" ? R.navn(p) : p === 0 ? R.t("Du") : sp.n === 2 ? R.t("Mobilen") : R.t("Mobil {n}", { n: p }));
  const avatarNr = (sp, p) => (sp.modus === "flere" ? p : p === 0 ? 0 : 9 + p);
  const avatar = (sp, p, str) => R.avatar(avatarNr(sp, p), str);
  // The seat whose hand is shown: you against the phone, or the one whose turn it is.
  const meg = (sp) => (sp.modus === "flere" ? sp.r.tur : 0);
  const rundeFerdig = (sp) => sp.r.fase === "slutt";
  const minTur = (sp) => !rundeFerdig(sp) && !sp.port && erMenneske(sp, sp.r.tur) && sp.r.tur === meg(sp);
  const hoy = (sp) => Rummy.esHoy(sp.variant);
  const kampFerdig = (sp) => {
    if (!sp.lagt) return false;
    if (sp.mal === "en") return sp.r.resultat.vinner != null;
    return sp.poeng.some((x) => x >= Number(sp.mal));
  };
  const rng = () => R.rng(R.nyttFro());
  const poengTekst = (n) => R.flertall(n, "poeng", "poeng");

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.tone(520, 0, 0.06, "triangle", 0.1);
      R.lyd.stoy(0, 0.08, 0.14, 2400);
    },
    trekk: () => R.lyd.stoy(0, 0.12, 0.12, 1600),
    meld: () => {
      R.lyd.tone(523, 0, 0.1, "triangle", 0.11);
      R.lyd.tone(659, 0.08, 0.12, "triangle", 0.11);
      R.lyd.tone(784, 0.16, 0.2, "triangle", 0.11);
    },
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

  // ---------- Texts from what happened ----------

  // «Mobil 1 trakk fra bunken, la ut 3 kort og kastet hjerter sju.»
  function turTekst(sp, logg) {
    if (!logg || !logg.length) return "";
    const snudd = logg.some((h) => h.type === "snudd") ? R.t("Kastebunken er snudd til en ny bunke.") : "";
    const hendelser = logg.filter((h) => h.p != null);
    if (!hendelser.length) return snudd;
    const p = hendelser[0].p;
    const hvem = navn(sp, p);
    const deler = [];
    let ut = 0;
    let til = 0;
    for (const h of hendelser) {
      if (h.type === "trekk") deler.push(R.t("{hvem} trakk fra bunken", { hvem }));
      else if (h.type === "ta") deler.push(h.kort.length === 1 ? R.t("{hvem} tok {kort}", { hvem, kort: kortnavn(h.kort[0]) }) : R.t("{hvem} tok {antall} fra kastebunken", { hvem, antall: R.flertall(h.kort.length, "kort", "kort") }));
      else if (h.type === "avsla") deler.push(R.t("{hvem} sto over", { hvem }));
      else if (h.type === "stopp") deler.push(R.t("{hvem} avsluttet runden", { hvem }));
      else if (h.type === "meld") ut += h.kort.length;
      else if (h.type === "til") til += h.kort.length;
    }
    if (ut) deler.push(R.t("la ut {antall}", { antall: R.flertall(ut, "kort", "kort") }));
    if (til) deler.push(R.t("la til {antall}", { antall: R.flertall(til, "kort", "kort") }));
    const slutt = hendelser.find((h) => h.type === "kast" || h.type === "bank");
    if (slutt && slutt.type === "kast") deler.push(R.t("kastet {kort}", { kort: kortnavn(slutt.k) }));
    if (slutt && slutt.type === "bank") deler.push(slutt.gin ? R.t("fikk gin") : R.t("banket på"));
    return [snudd, R.ramsOpp(deler) + "."].filter(Boolean).join(" ");
  }
  // What happened since the shown hand last played: the last finished turn, or this turn's own news.
  const sistTekst = (sp) => turTekst(sp, sp.r.logg.length && sp.r.logg.every((h) => h.type === "snudd") ? sp.r.forrige.concat(sp.r.logg) : sp.r.forrige);

  // The cards picked in the hand, and what they can do.
  function valgInfo(sp) {
    const r = sp.r;
    const p = meg(sp);
    const valgt = (sp.valgt || []).filter((k) => r.hender[p].includes(k));
    const info = { valgt, meld: null, mal: [], kast: false, bank: null };
    if (!minTur(sp) || r.fase !== "spill") return info;
    if (r.v !== "gin" && valgt.length >= 3 && Rummy.kanLeggeUt(r, p, valgt)) info.meld = Rummy.meld(valgt, hoy(sp));
    if (r.v !== "gin" && valgt.length) info.mal = r.bord.map((m, i) => i).filter((i) => Rummy.kanLeggeTil(r, p, valgt, i));
    if (valgt.length === 1) {
      info.kast = Rummy.kanKaste(r, p, valgt[0]);
      if (r.v === "gin") info.bank = Rummy.bankDod(r, p, valgt[0]);
    }
    return info;
  }

  function meldingTekst(sp) {
    const r = sp.r;
    const p = r.tur;
    if (!erMenneske(sp, p)) return R.t("{navn} tenker …", { navn: navn(sp, p) });
    const t = Rummy.topp(r);
    if (r.fase === "tilbud") return R.t("Vil du ha {kort}? Ellers går tilbudet videre.", { kort: kortnavn(t) });
    if (r.fase === "trekk") {
      if (r.kunStokk) return R.t("Ingen ville ha kortet. Trekk fra bunken.");
      if (sp.bunkeValg != null) return R.t("Du tar {antall} og må legge ut {kort} med en gang.", { antall: R.flertall(r.bunke.length - sp.bunkeValg, "kort", "kort"), kort: kortnavn(r.bunke[sp.bunkeValg]) });
      if (r.v === "500" && !r.stokk.length) return R.t("Bunken er tom. Ta fra kastebunken, eller avslutt runden.");
      if (r.v === "500") return R.t("Trekk fra bunken, eller ta kort fra kastebunken.");
      return R.t("Trekk fra bunken, eller ta {kort}.", { kort: kortnavn(t) });
    }
    const info = valgInfo(sp);
    const hand = r.hender[p];
    if (r.v === "gin") {
      if (info.bank != null && info.bank <= Rummy.BANK_GRENSE) return info.bank === 0 ? R.t("Kaster du {kort}, har du gin!", { kort: kortnavn(info.valgt[0]) }) : R.t("Kaster du {kort}, har du {n} løse poeng – du kan banke på.", { kort: kortnavn(info.valgt[0]), n: info.bank });
      if (info.valgt.length === 1 && !info.kast) return R.t("Kortet du nettopp tok, kan du ikke kaste.");
      return R.t("Velg kortet du vil kaste. Løse poeng nå: {n}.", { n: Rummy.beste(hand, "gin").dod });
    }
    if (r.maaBruke != null && !info.meld && !info.mal.length) return R.t("Legg ut {kort} nå – i en ny kombinasjon eller på bordet.", { kort: kortnavn(r.maaBruke) });
    if (info.meld) return info.meld.type === "sett" ? R.t("Like kort – trykk «Legg ut».") : R.t("En rekke – trykk «Legg ut».");
    if (info.mal.length) return info.kast ? R.t("Passer på bordet: trykk på det som lyser – eller kast kortet.") : R.t("Passer på bordet: trykk på det som lyser.");
    if (info.valgt.length === 1 && info.kast) return R.t("Trykk «Kast» for å avslutte turen.");
    if (info.valgt.length === 1 && info.valgt[0] === r.tatt) return R.t("Kortet du nettopp tok, kan du ikke kaste.");
    if (info.valgt.length) return R.t("Ikke en kombinasjon ennå: tre eller fire like, eller tre på rad i samme farge.");
    return R.t("Velg kort å legge ut – eller ett kort å kaste.");
  }

  function resultatTittel(sp) {
    const res = sp.r.resultat;
    const kamp = kampFerdig(sp) && sp.mal !== "en";
    const v = kamp ? kampVinnere(sp) : null;
    if (kamp && v.length === 1) return v[0] === 0 && sp.modus === "mobil" ? R.t("Du vinner kampen!") : R.t("{navn} vinner kampen!", { navn: navn(sp, v[0]) });
    if (kamp) return R.t("Uavgjort kamp!");
    if (res.type === "tom") return sp.variant === "500" ? R.t("Runden er over.") : R.t("Bunken tok slutt – ingen vinner runden.");
    const du = sp.modus === "mobil" && res.vinner === 0;
    if (res.type === "gin") return du ? R.t("Du fikk gin!") : R.t("{navn} fikk gin!", { navn: navn(sp, res.vinner) });
    if (res.type === "bank") {
      if (res.undercut) return du ? R.t("Du hadde færre løse poeng – du vinner runden!") : R.t("{navn} hadde færre løse poeng og vinner runden!", { navn: navn(sp, res.vinner) });
      return du ? R.t("Du banket på og vinner runden!") : R.t("{navn} banket på og vinner runden!", { navn: navn(sp, res.vinner) });
    }
    return du ? R.t("Du ble kvitt alle kortene!") : R.t("{navn} ble kvitt alle kortene!", { navn: navn(sp, res.vinner) });
  }

  // Who has won the match (or leads it when it ends early); nobody when nothing was scored.
  const sluttVinnere = (sp) => (sp.mal !== "en" && sp.poeng.every((x) => x === 0) ? [] : kampVinnere(sp));
  function kampVinnere(sp) {
    if (sp.mal === "en") return sp.r.resultat && sp.r.resultat.vinner != null ? [sp.r.resultat.vinner] : [];
    const topp = Math.max(...sp.poeng);
    return sp.poeng.map((x, p) => (x === topp ? p : -1)).filter((p) => p >= 0);
  }

  // ---------- Flow ----------

  function nyKamp(S) {
    const o = S.oppsett;
    const variant = o.variant;
    const n = variant === "gin" ? 2 : o.modus === "mobil" ? 1 + o.mobiler : R.klamp(S.antall || 2, 2, 4);
    S.spill = {
      id: R.nyttFro() % 1e9,
      variant,
      modus: o.modus,
      niva: o.niva,
      n,
      mal: o.mal[variant],
      runde: 0,
      starter: o.modus === "mobil" ? n - 1 : R.heltall(0, n - 1) - 1, // round 1: you (or someone at random) begin
      poeng: Array(n).fill(0),
      seire: Array(n).fill(0),
      r: null,
      lagt: false,
      port: false,
      valgt: [],
      bunkeValg: null,
      angre: null,
      endret: false,
      ny: [],
      ferdig: false,
      registrert: false,
    };
    nyRunde(S);
    R.statistikk("start", { variant, modus: o.modus, spillere: n, niva: o.modus === "mobil" ? o.niva : 0, mal: S.spill.mal });
  }

  function nyRunde(S) {
    const sp = S.spill;
    sp.runde++;
    sp.starter = (sp.starter + 1) % sp.n; // who begins goes round the table
    sp.r = Rummy.nyRunde({ v: sp.variant, n: sp.n, start: sp.starter }, rng());
    sp.lagt = false;
    sp.port = sp.modus === "flere";
    nullstillTur(sp);
  }

  function nullstillTur(sp) {
    sp.valgt = [];
    sp.bunkeValg = null;
    sp.angre = null;
    sp.endret = false;
  }

  // After every move: the round may be over, or the phone goes to the next person.
  function etterTrekk(S, forTur) {
    const sp = S.spill;
    const r = sp.r;
    if (rundeFerdig(sp) && !sp.lagt) {
      const res = r.resultat;
      sp.lagt = true;
      res.poeng.forEach((x, q) => (sp.poeng[q] += x));
      if (res.vinner != null) sp.seire[res.vinner]++;
      sp.port = false;
      nullstillTur(sp);
      const ferdig = kampFerdig(sp);
      const vinnere = ferdig ? kampVinnere(sp) : [];
      if (ferdig && sp.modus === "mobil") {
        const nokkel = `${sp.variant}-${sp.niva}`;
        const rek = S.rekord[nokkel] || (S.rekord[nokkel] = { seier: 0, tap: 0 });
        if (vinnere.includes(0)) {
          rek.seier++;
          R.merke("klassiker-samleren");
        } else rek.tap++;
      }
      const duTapte = sp.modus === "mobil" && (ferdig ? !vinnere.includes(0) : res.vinner != null && res.vinner !== 0);
      const fortsatt = R.vakt();
      setTimeout(() => {
        if (!fortsatt()) return;
        if (duTapte) lyd.tap();
        else {
          R.lyd.riktig();
          R.vibrer([30, 50, 80]);
          if (ferdig) R.konfetti();
        }
      }, 420);
      return;
    }
    if (r.tur !== forTur) {
      nullstillTur(sp);
      sp.ny = [];
      if (sp.modus === "flere") sp.port = true;
    }
  }

  function avsluttKamp(S) {
    const sp = S.spill;
    stoppMobil();
    sp.ferdig = true;
    R.statistikk("ferdig", { variant: sp.variant, modus: sp.modus, spillere: sp.n, niva: sp.modus === "mobil" ? sp.niva : 0, runder: sp.runde - (sp.lagt ? 0 : 1), mal: sp.mal });
    R.gaTil("slutt");
  }

  // ---------- The phone players' turns ----------
  let mobilId = null;
  function stoppMobil() {
    clearTimeout(mobilId);
    mobilId = null;
  }
  function planleggMobil(ms) {
    const S = R.S;
    const sp = S && S.spill;
    if (mobilId || !sp || sp.ferdig || S.skjerm !== "spill" || rundeFerdig(sp) || erMenneske(sp, sp.r.tur)) return;
    mobilId = setTimeout(mobilSteg, ms != null ? ms : sp.r.fase === "spill" ? FART.spill : FART.trekk);
  }
  function mobilSteg() {
    mobilId = null;
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || rundeFerdig(sp)) return;
    const r = sp.r;
    const p = r.tur;
    if (erMenneske(sp, p)) return;
    // Never behind a sheet (rules, «Avslutt?») or in a hidden tab: wait and look again.
    if (R.arkApent() || document.hidden) return planleggMobil(500);
    let ok;
    if (r.fase === "spill") {
      ok = Mobil.spillResten(r, p, sp.niva, Math.random);
      if (r.forrige.some((h) => h.p === p && (h.type === "meld" || h.type === "til"))) lyd.meld();
      else lyd.legg();
    } else {
      const v = Mobil.velgTrekk(r, p, sp.niva, Math.random);
      if (v.type === "trekk") ok = Rummy.trekk(r, p) != null;
      else if (v.type === "ta") ok = Rummy.ta(r, p, v.i);
      else if (v.type === "avsla") ok = Rummy.avsla(r, p);
      else ok = Rummy.stopp(r, p);
      lyd.trekk();
    }
    if (!ok) return;
    etterTrekk(S, p);
    R.vis();
    planleggMobil();
  }

  // ---------- Markup ----------

  const minikort = (kort, klasse) => kort.map((k) => KORT.html(k, { opp: true, klasse })).join("");

  // The others around the table, in the order they play after the shown hand.
  function andreHtml(sp) {
    const r = sp.r;
    const vis = meg(sp);
    const seter = [];
    for (let d = 1; d < sp.n; d++) seter.push((vis + d) % sp.n);
    return `<ul class="sa-andre" aria-label="${esc(R.t("Rundt bordet"))}">${seter
      .map((p) => {
        const n = r.hender[p].length;
        const tenker = p === r.tur && !erMenneske(sp, p);
        const rygger = Array.from({ length: Math.min(n, 7) }, (_, i) => `<i style="--i:${i}"></i>`).join("");
        return `<li class="sa-plass${p === r.tur ? " aktiv" : ""}">
          <span class="sa-ava">${avatar(sp, p)}${tenker ? '<span class="sa-tenker" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}</span>
          <span class="sa-info"><b class="sa-navn">${esc(navn(sp, p))}</b><span class="sa-antall"><span class="sa-rygger" aria-hidden="true" style="--n:${Math.min(n, 7)}">${rygger}</span>${esc(R.flertall(n, "kort", "kort"))}</span><span class="sa-p">${esc(poengTekst(sp.poeng[p]))}</span></span>
        </li>`;
      })
      .join("")}</ul>`;
  }

  function meldHtml(sp, m, i, info) {
    const mal = info.mal.includes(i);
    const navnet = m.type === "sett" ? R.t("Like kort: {kort}", { kort: kortListe(m.kort) }) : R.t("Rekke: {kort}", { kort: kortListe(m.kort) });
    return `<button class="sa-meld${mal ? " mal" : ""}${sp.nyttMeld === i ? " fersk" : ""}" data-h="tilmeld" data-v="${i}" style="--n:${m.kort.length}" aria-label="${esc(mal ? R.t("Legg til på {meld}", { meld: navnet }) : navnet)}"${mal ? " data-fokus" : ' aria-disabled="true"'}>${minikort(m.kort)}</button>`;
  }

  function bordHtml(sp) {
    const r = sp.r;
    const mitt = minTur(sp);
    const info = valgInfo(sp);
    const kanTrekke = mitt && r.fase === "trekk" && r.stokk.length > 0;
    const igjen = r.stokk.length;
    const stokk = `<button data-h="trekk" class="sa-stokk${kanTrekke ? " klar" : ""}" aria-label="${esc(R.t("Bunken, {antall}", { antall: R.flertall(igjen, "kort", "kort") }) + (kanTrekke ? ". " + R.t("Trekk et kort") : ""))}"${kanTrekke ? "" : ' aria-disabled="true"'}>
        ${igjen ? KORT.html(null, { klasse: "sa-stokkort" }) : '<span class="sa-tom" aria-hidden="true"></span>'}
        <span class="sa-tall" aria-hidden="true">${igjen}</span>
      </button>`;
    let bunke;
    const t = Rummy.topp(r);
    if (r.v === "500") {
      const fra = sp.bunkeValg;
      bunke = `<div class="sa-spredt" role="group" aria-label="${esc(R.t("Kastebunken, {antall}", { antall: R.flertall(r.bunke.length, "kort", "kort") }))}">${
        r.bunke.length
          ? r.bunke
              .map((k, i) => {
                const kan = mitt && Rummy.kanTa(r, r.tur, i);
                const valgt = fra != null && i >= fra;
                return `<button class="sa-bk${kan ? " kan" : ""}${valgt ? " valgt" : ""}" data-h="bunkekort" data-v="${i}" aria-label="${esc(kortnavn(k))}"${kan ? "" : ' aria-disabled="true"'} aria-pressed="${valgt ? "true" : "false"}">${KORT.html(k, { opp: true })}</button>`;
              })
              .join("")
          : `<span class="sa-tom liten" aria-hidden="true"></span>`
      }</div>`;
    } else {
      const kan = mitt && Rummy.kanTa(r, r.tur);
      const under = r.bunke.length > 1 ? KORT.html(r.bunke[r.bunke.length - 2], { opp: true, klasse: "sa-under" }) : "";
      bunke = `<button data-h="ta" class="sa-bunke${kan ? " klar" : ""}" aria-label="${esc(t != null ? R.t("Kastebunken: {kort}", { kort: kortnavn(t) }) + (kan ? ". " + R.t("Ta kortet") : "") : R.t("Kastebunken er tom"))}"${kan ? "" : ' aria-disabled="true"'}>
        ${t != null ? under + KORT.html(t, { opp: true, klasse: "sa-topp" }) : '<span class="sa-tom" aria-hidden="true"></span>'}
      </button>`;
    }
    const meld =
      r.v === "gin"
        ? ""
        : `<div class="sa-bordmeld" role="group" aria-label="${esc(R.t("På bordet"))}">${r.bord.length ? r.bord.map((m, i) => meldHtml(sp, m, i, info)).join("") : `<p class="sa-tomt">${esc(R.t("Ingen kombinasjoner på bordet ennå."))}</p>`}</div>`;
    return `<div class="sa-bord sa-${r.v === "500" ? "fem" : r.v}">
      <span class="sa-merke" aria-hidden="true">${esc(variantNavn(sp.variant))}</span>
      <div class="sa-hauger">${stokk}${bunke}</div>
      ${meld}
    </div>`;
  }

  // The shown hand, sorted by suit or by value; in gin grouped by its best melds.
  const REKKE = [0, 1, 3, 2]; // spar, hjerter, kløver, ruter (red and black in turn)
  const etterFarge = (a, b) => REKKE.indexOf(sortAv(a)) - REKKE.indexOf(sortAv(b)) || verdiAv(a) - verdiAv(b);
  const etterTall = (a, b) => verdiAv(a) - verdiAv(b) || REKKE.indexOf(sortAv(a)) - REKKE.indexOf(sortAv(b));
  function ordnetHand(S, sp, hand) {
    const sorter = S.sorter === "tall" ? etterTall : etterFarge;
    if (sp.variant !== "gin") return { kort: hand.slice().sort(sorter), grupper: new Map() };
    const b = Rummy.beste(hand, "gin");
    const kort = [];
    const grupper = new Map();
    for (const m of b.melds.map((x) => x.slice().sort(etterTall)).sort((x, y) => verdiAv(x[0]) - verdiAv(y[0]))) {
      m.forEach((k, i) => grupper.set(k, i === m.length - 1 ? "slutt" : "inne"));
      kort.push(...m);
    }
    kort.push(...b.rest.sort(sorter));
    return { kort, grupper };
  }

  function handHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const p = meg(sp);
    const mitt = minTur(sp) && r.fase === "spill";
    const valgt = new Set(sp.valgt || []);
    const nye = new Set(sp.ny || []);
    const { kort, grupper } = ordnetHand(S, sp, r.hender[p]);
    let topp;
    if (sp.variant === "gin") topp = R.t("Løse poeng: {n}", { n: Rummy.beste(r.hender[p], "gin").dod });
    else if (sp.variant === "500") topp = R.t("Ute: {ute} · på hånda: {hand}", { ute: Rummy.utlagt(r, p), hand: Rummy.handVerdi("500", r.hender[p]) });
    else topp = sp.modus === "flere" ? R.t("Kortene til {navn} · {antall}", { navn: navn(sp, p), antall: R.flertall(kort.length, "kort", "kort") }) : R.t("Kortene dine · {antall}", { antall: R.flertall(kort.length, "kort", "kort") });
    const sortKnapp = `<button class="sa-sorter" data-h="sorter" aria-pressed="${S.sorter === "tall" ? "true" : "false"}">${esc(R.t("Sorter etter tall"))}</button>`;
    return `<div class="sa-handramme">
      <div class="sa-handtopp"><span>${esc(topp)}</span>${sortKnapp}</div>
      <div class="sa-hand${mitt ? " min-tur" : ""}" role="group" aria-label="${esc(sp.modus === "flere" ? R.t("Kortene til {navn}", { navn: navn(sp, p) }) : R.t("Kortene dine"))}" style="--n:${kort.length}">${kort
        .map((k, i) => {
          const g = grupper.get(k);
          const kl = [valgt.has(k) && "valgt", nye.has(k) && "fersk", k === r.maaBruke && "maa", g && "i-meld"].filter(Boolean).join(" ");
          return `<button class="sa-hk${kl ? " " + kl : ""}" data-h="kortvalg" data-v="${k}" aria-pressed="${valgt.has(k) ? "true" : "false"}" aria-label="${esc(kortnavn(k))}"${mitt ? "" : ' aria-disabled="true"'} style="--i:${i}">${KORT.html(k, { opp: true })}</button>`;
        })
        .join("")}</div>
    </div>`;
  }

  // The end of a round: everybody's cards and points.
  function resultatHtml(sp) {
    const r = sp.r;
    const res = r.resultat;
    const rader = [];
    const forste = res.vinner != null ? res.vinner : 0;
    for (let d = 0; d < sp.n; d++) {
      const p = (forste + d) % sp.n;
      const vant = res.vinner === p;
      let inni;
      if (sp.variant === "gin" && res.oppstilling) {
        const o = res.oppstilling[p];
        const grupper = o.melds.map((m) => `<span class="sa-gruppe">${minikort(m.slice().sort(etterTall))}</span>`).join("");
        const avlagt = o.avlagt.length ? `<span class="sa-gruppe avlagt" aria-label="${esc(R.t("Lagt til: {kort}", { kort: kortListe(o.avlagt) }))}">${minikort(o.avlagt)}</span>` : "";
        const rest = o.rest.length ? `<span class="sa-gruppe los">${minikort(o.rest.slice().sort(etterTall))}</span>` : "";
        inni = `<span class="sa-oppstilling" aria-label="${esc(R.t("Løse kort: {kort}", { kort: o.rest.length ? kortListe(o.rest) : "–" }))}">${grupper}${avlagt}${rest}</span><span class="sa-pt">${esc(R.t("løse poeng: {n}", { n: o.dod }))}${res.poeng[p] ? ` · <b>+${res.poeng[p]}</b>` : ""}</span>`;
      } else if (sp.variant === "500") {
        const ut = res.utlagt[p];
        const rest = res.rester[p];
        inni = `<span class="sa-rest" aria-label="${esc(r.hender[p].length ? kortListe(r.hender[p]) : R.t("Ingen kort igjen"))}">${minikort(r.hender[p].slice().sort(etterFarge))}</span><span class="sa-pt">${ut} − ${rest} = <b>${res.poeng[p] > 0 ? "+" : ""}${res.poeng[p]}</b></span>`;
      } else {
        inni = vant
          ? `<span class="sa-ut">${esc(R.t("+{n} poeng", { n: res.gevinst }))}</span>`
          : `<span class="sa-rest" aria-label="${esc(kortListe(r.hender[p]))}">${minikort(r.hender[p].slice().sort(etterFarge))}</span><span class="sa-pt">${res.rester[p]}</span>`;
      }
      rader.push(`<li class="${vant ? "vant" : ""}">${avatar(sp, p)}<b>${esc(navn(sp, p))}</b>${inni}</li>`);
    }
    const stilling = sp.mal === "en" ? "" : `<p class="sa-stilling">${esc(R.t("Stillingen: {liste}", { liste: Array.from({ length: sp.n }, (_, p) => `${navn(sp, p)} ${sp.poeng[p]}`).join(" · ") }))} <span>(${esc(R.t("først til {n}", { n: sp.mal }))})</span></p>`;
    return `<div class="sa-slutt"><ul class="sa-resultat" aria-label="${esc(R.t("Kortene som ble igjen"))}">${rader.join("")}</ul>${stilling}</div>`;
  }

  function dokkHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
    if (rundeFerdig(sp)) {
      const hoved = kampFerdig(sp) ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Ny runde"), "runde", { ikon: "🃏" });
      return R.ui.dokk(hoved, R.ui.lenkerad(avslutt));
    }
    if (!minTur(sp)) return R.ui.dokk(R.ui.knapp(R.t("Trekk fra bunken"), "trekk", { av: true }), R.ui.lenkerad(avslutt));
    const t = Rummy.topp(r);
    const angre = sp.angre && sp.endret ? R.ui.lenke(R.t("Angre"), "angre") : "";
    if (r.fase === "tilbud") return R.ui.dokk(R.ui.knapp(R.t("Ta {kort}", { kort: kortnavn(t) }), "ta"), R.ui.lenkerad(R.ui.lenke(R.t("Stå over"), "avsla"), avslutt));
    if (r.fase === "trekk") {
      if (sp.bunkeValg != null) return R.ui.dokk(R.ui.knapp(R.t("Ta {antall}", { antall: R.flertall(r.bunke.length - sp.bunkeValg, "kort", "kort") }), "ta", { v: sp.bunkeValg }), R.ui.lenkerad(R.ui.lenke(R.t("Ikke likevel"), "bunkekort", { v: sp.bunkeValg }), avslutt));
      const taTopp = !r.kunStokk && t != null && Rummy.kanTa(r, r.tur) ? R.ui.lenke(R.t("Ta kortet"), "ta") : "";
      if (!r.stokk.length && r.v === "500") return R.ui.dokk(R.ui.knapp(R.t("Avslutt runden"), "stopp"), R.ui.lenkerad(taTopp, avslutt));
      return R.ui.dokk(R.ui.knapp(R.t("Trekk fra bunken"), "trekk"), R.ui.lenkerad(taTopp, avslutt));
    }
    const info = valgInfo(sp);
    if (r.v === "gin") {
      if (info.kast && info.bank != null && info.bank <= Rummy.BANK_GRENSE)
        return R.ui.dokk(`<div class="knapprad sa-knapprad">${R.ui.knapp(info.bank === 0 ? R.t("Gin!") : R.t("Bank på"), "bank", { variant: "lampe" })}${R.ui.knapp2(R.t("Bare kast"), "kast")}</div>`, R.ui.lenkerad(angre, avslutt));
      const hoved = info.kast ? R.ui.knapp(R.t("Kast {kort}", { kort: kortnavn(info.valgt[0]) }), "kast") : R.ui.knapp(R.t("Velg et kort å kaste"), "kast", { av: true });
      return R.ui.dokk(hoved, R.ui.lenkerad(angre, avslutt));
    }
    let hoved;
    if (info.meld) hoved = R.ui.knapp(R.t("Legg ut {antall}", { antall: R.flertall(info.valgt.length, "kort", "kort") }), "legut", { variant: "mynte" });
    else if (info.kast) hoved = R.ui.knapp(R.t("Kast {kort}", { kort: kortnavn(info.valgt[0]) }), "kast");
    else hoved = R.ui.knapp(r.maaBruke != null ? R.t("Legg ut {kort} først", { kort: kortnavn(r.maaBruke) }) : R.t("Velg kort"), "kast", { av: true });
    const tilEn = info.mal.length === 1 ? R.ui.lenke(R.t("Legg til"), "tilmeld", { v: info.mal[0] }) : "";
    return R.ui.dokk(hoved, R.ui.lenkerad(tilEn, angre, avslutt));
  }

  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const ferdig = rundeFerdig(sp);
    if (sp.port && !ferdig) {
      const sist = sistTekst(sp);
      return `${sist ? `<p class="sa-sist-port" role="status">${esc(sist)}</p>` : ""}
        ${R.ui.giTil({ i: r.tur, h: "vis", knapp: R.t("Vis kortene mine"), tekst: r.forrige.length || r.logg.length ? R.t("Gi mobilen til") : R.t("Runde {n} – gi mobilen til", { n: sp.runde }), advarsel: R.t("De andre ser bort"), prikker: [sp.n, r.tur] })}`;
    }
    const sist = ferdig ? "" : sistTekst(sp);
    const melding = ferdig ? resultatTittel(sp) : meldingTekst(sp);
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(R.t("{spill}, runde {n}", { spill: variantNavn(sp.variant), n: sp.runde }))}</h1>
      ${ferdig ? "" : andreHtml(sp)}
      ${bordHtml(sp)}
      <div class="sa-melding${ferdig ? " ferdig" : minTur(sp) ? " din" : ""}" role="status">
        ${sist ? `<span class="sa-sist">${esc(sist)}</span>` : ""}
        <b>${esc(melding)}</b>
      </div>
      ${ferdig ? resultatHtml(sp) : handHtml(S)}
      ${dokkHtml(S)}`;
  }

  function rekordHtml(S, nokkel) {
    const r = S.rekord[nokkel];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }
  const variantNavn = (v) => VARIANT[v].navn;

  // ---------- The hand on a phone: rows of overlapping cards that always fit ----------
  // Every card is a button as wide as the card; a negative margin lets the next one cover it, so only
  // a strip shows. The hand is laid out in as few rows as keep each strip at least 26 px wide.
  function leggUtHand() {
    for (const h of document.querySelectorAll(".sa-hand")) {
      const n = h.children.length;
      const ramme = h.parentElement;
      if (!n || !ramme) continue;
      const W = ramme.clientWidth;
      const kb = h.children[0].getBoundingClientRect().width || 56;
      const MIN = 26;
      const perRad = Math.max(1, Math.floor((W - kb) / MIN) + 1);
      const rader = Math.ceil(n / perRad);
      const iRad = Math.ceil(n / rader);
      const steg = Math.max(MIN, Math.min(kb + 6, iRad > 1 ? (W - kb) / (iRad - 1) : kb));
      h.style.setProperty("--steg", `${Math.floor(steg * 10) / 10}px`);
      h.style.setProperty("--per-rad", String(iRad));
    }
  }
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") leggUtHand();
  });

  // ---------- Screens ----------

  const STANDARD = () => ({ variant: "klassisk", modus: "mobil", mobiler: 1, niva: 2, mal: Object.assign({}, MAL_STANDARD) });

  R.start({
    id: "samleren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: STANDARD(),
      spill: null,
      rekord: {},
      sorter: "farge",
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign(STANDARD(), S.oppsett));
      if (!VARIANT[o.variant]) o.variant = "klassisk";
      if (!["mobil", "flere"].includes(o.modus)) o.modus = "mobil";
      if (![1, 2, 3].includes(o.mobiler)) o.mobiler = 1;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      o.mal = Object.assign({}, MAL_STANDARD, o.mal && typeof o.mal === "object" ? o.mal : {});
      for (const v of Object.keys(MAL)) if (!MAL[v].some(([m]) => m === o.mal[v])) o.mal[v] = MAL_STANDARD[v];
      S.antall = R.klamp(S.antall || 2, 2, 4);
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      if (S.sorter !== "tall") S.sorter = "farge";
      const sp = S.spill;
      if (sp) {
        const ok =
          VARIANT[sp.variant] && ["mobil", "flere"].includes(sp.modus) && MAL[sp.variant].some(([m]) => m === sp.mal) && Rummy.hel(sp.r) && sp.r.n === sp.n && sp.r.v === sp.variant &&
          Array.isArray(sp.poeng) && sp.poeng.length === sp.n && Array.isArray(sp.seire) && sp.seire.length === sp.n;
        if (!ok) S.spill = null;
        else {
          if (!Array.isArray(sp.valgt)) sp.valgt = [];
          if (!Array.isArray(sp.ny)) sp.ny = [];
          if (typeof sp.angre !== "string") sp.angre = null;
          if (!(Number.isInteger(sp.bunkeValg) && sp.bunkeValg >= 0 && sp.bunkeValg < sp.r.bunke.length - 1)) sp.bunkeValg = null;
          // A reload on a hot seat: whoever holds the phone now must show it is them again.
          if (sp.modus === "flere" && !sp.ferdig && !rundeFerdig(sp)) sp.port = true;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Samle kortene i sett og rekker og legg dem ut på bordet. Velg mellom vanlig rummy, 500 og gin rummy for to."),
      steg: [
        [R.t("Trekk"), R.t("Ta det øverste kortet fra bunken eller fra kastebunken.")],
        [R.t("Legg ut"), R.t("Tre eller fire like (et sett) eller tre eller flere på rad i samme farge (en rekke). Trykk på kortene og «Legg ut». Enkeltkort kan du legge til på kombinasjoner som ligger på bordet.")],
        [R.t("Kast"), R.t("Avslutt turen med å kaste ett kort. Kortet du nettopp tok fra kastebunken, kan du ikke kaste igjen med en gang.")],
      ],
      tips: [
        R.t("Rummy: To spillere får ti kort, tre eller fire får sju. Den som først blir kvitt alle kortene, får poeng for kortene de andre sitter igjen med: bildekort 10, ess 1, resten det tallet de viser."),
        R.t("Rummy: Ess er lavt (A-2-3). Tar bunken slutt, snus kastebunken til en ny."),
        R.t("500: To spillere får 13 kort, tre eller fire får sju. Kastebunken ligger spredt, og du kan ta et kort lenger ned – da får du med alle kortene over, og det nederste må du legge ut med en gang."),
        R.t("500: Alt du legger ut, gir poeng – også kort du legger til hos andre. Det du har igjen på hånda, trekkes fra. Ess 15 (1 i A-2-3), bildekort og tiere 10, resten det tallet de viser."),
        R.t("500: Ess kan være høyt (Q-K-A) eller lavt (A-2-3). Runden slutter når noen er tom for kort, eller når bunken er tom."),
        R.t("Gin rummy: To spillere, ti kort hver, og ingenting legges ut underveis. Kort som ikke er med i et sett eller en rekke, er løse."),
        R.t("Gin rummy: Har du ti eller færre løse poeng etter at du har kastet, kan du banke på. Da viser begge kortene, og den andre kan legge løse kort til på dine kombinasjoner. Laveste sum vinner differansen."),
        R.t("Gin rummy: Ingen løse kort er gin – 25 poeng ekstra. Har den andre like få eller færre løse poeng når du banker, får den differansen og 25 ekstra."),
        R.t("Flere på én mobil: Kortene skjules mellom hver tur. Trykk «Vis kortene mine» når du har fått mobilen."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = [];
          for (const v of Rummy.VARIANTER) for (const n of [1, 2, 3]) {
            const h = rekordHtml(S, `${v}-${n}`);
            if (h) rek.push(`<li><b class="sa-niva">${esc(variantNavn(v))} · ${esc(NIVANAVN[n].toLowerCase())}</b>${h}</li>`);
          }
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Samle like og på rad."))}<br><em>${esc(R.t("Rummy, 500 og gin rummy."))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · runde {n}", { n: sp.runde }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–4", R.t("spillere")],
                ["3", R.t("spill i ett")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="sa-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const gin = o.variant === "gin";
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvilket spill?"))}</h2>
              ${R.ui.fliser("variant", Rummy.VARIANTER.map((v) => ({ v, ikon: VARIANT[v].ikon, tittel: VARIANT[v].navn, tekst: VARIANT[v].tekst })), o.variant)}
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvem spiller?"))}</h2>
              ${R.ui.seg("modus", [["mobil", R.t("Mot mobilen")], ["flere", R.t("Flere på én mobil")]], o.modus, { etikett: R.t("Hvem spiller?") })}
            </section>
            ${
              o.modus === "mobil"
                ? `${gin ? "" : `<section class="seksjon">
                    <h2>${esc(R.t("Hvor mange mobilspillere?"))}</h2>
                    ${R.ui.seg("mobiler", [[1, "1"], [2, "2"], [3, "3"]], o.mobiler, { etikett: R.t("Antall mobilspillere") })}
                  </section>`}
                  <section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", [[1, NIVANAVN[1]], [2, NIVANAVN[2]], [3, NIVANAVN[3]]], o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>`
                : R.ui.spillere({ min: 2, max: gin ? 2 : 4, tittel: R.t("Navn"), hjelp: gin ? R.t("Gin rummy er for to. Kortene skjules mellom hver tur.") : R.t("Kortene skjules mellom hver tur, så ingen ser de andres.") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Hvor lenge?"))}</h2>
              ${R.ui.seg("mal", MAL[o.variant], o.mal[o.variant], { etikett: R.t("Hvor lenge?") })}
              <p class="hjelp">${esc(MAL_TEKST[o.mal[o.variant]])}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🃏" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? R.t("Runde {n}", { n: S.spill.runde }) : ""),
        tilbake: "hjem",
        vis: spillHtml,
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          planleggMobil(FART.start);
        },
        etter() {
          leggUtHand();
          planleggMobil();
        },
        ut() {
          stoppMobil();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = Array.from({ length: sp.n }, (_, p) => ({ navn: navn(sp, p), i: avatarNr(sp, p), poeng: sp.poeng[p] }));
          const vinnere = sluttVinnere(sp);
          const duVant = sp.modus === "mobil" && vinnere.length === 1 && vinnere[0] === 0;
          const mobilVant = sp.modus === "mobil" && vinnere.length && !vinnere.includes(0);
          let tittel;
          if (!vinnere.length) tittel = R.t("Ingen vinner denne gangen");
          else if (duVant) tittel = R.t("Du vinner!");
          else if (vinnere.length === 1) tittel = R.t("{navn} vinner!", { navn: navn(sp, vinnere[0]) });
          else tittel = R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((p) => navn(sp, p))), n: vinnere.length });
          const runder = sp.runde - (sp.lagt ? 0 : 1);
          const etikett = `${variantNavn(sp.variant)} · ${R.flertall(runder, "runde", "runder")}${sp.modus === "mobil" ? ` · ${NIVANAVN[sp.niva].toLowerCase()}` : ""}`;
          const tekst = mobilVant ? R.t("Godt kjempa! Neste gang går samlingen din opp.") : duVant ? R.t("Godt jobba!") : "";
          const nokkel = `${sp.variant}-${sp.niva}`;
          const rek = sp.modus === "mobil" ? rekordHtml(S, nokkel) : "";
          return `
            ${R.ui.banner({ tittel, etikett, tekst, stemning: mobilVant || !vinnere.length ? "lei" : "jubel" })}
            ${sp.n > 2 ? R.ui.pall(rader, { enhet: "p" }) : ""}
            ${R.ui.poengliste(rader)}
            ${rek ? `<p class="sa-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(variantNavn(sp.variant))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "flere" ? sp.n : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🃏" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          if (!sp.registrert) {
            sp.registrert = true;
            // «Kveldens gjeng» counts people only, never the phone players.
            const mennesker = Array.from({ length: sp.n }, (_, p) => p).filter((p) => erMenneske(sp, p));
            R.kveld.registrer(mennesker.map((p) => ({ i: p, poeng: sp.poeng[p] })));
            R.lagre();
          }
          const v = sluttVinnere(sp);
          if (sp.modus === "mobil" && v.length && !v.includes(0)) lyd.tap();
          else if (v.length) {
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
      variant(el, e, S) {
        S.oppsett.variant = VARIANT[el.dataset.v] ? el.dataset.v : "klassisk";
        R.vis();
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "flere" ? "flere" : "mobil";
        if (S.oppsett.modus === "flere") S.antall = R.klamp(S.antall || 2, 2, 4);
        R.vis();
      },
      mobiler(el, e, S) {
        S.oppsett.mobiler = R.klamp(Number(el.dataset.v) || 1, 1, 3);
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 3);
        R.vis();
      },
      mal(el, e, S) {
        const v = S.oppsett.variant;
        if (MAL[v].some(([m]) => m === el.dataset.v)) S.oppsett.mal[v] = el.dataset.v;
        R.vis();
      },
      start(el, e, S) {
        if (S.oppsett.modus === "flere" && S.oppsett.variant === "gin") S.antall = 2;
        S.antall = R.klamp(S.antall || 2, 2, 4);
        nyKamp(S);
        R.lyd.snu();
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyKamp(S);
        R.gaTil("spill");
      },
      vis(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.port) return;
        sp.port = false;
        R.lyd.snu();
        R.vis();
      },
      sorter(el, e, S) {
        S.sorter = S.sorter === "tall" ? "farge" : "tall";
        R.vis();
      },
      kortvalg(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || rundeFerdig(sp)) return;
        const r = sp.r;
        if (!minTur(sp)) return R.toast(R.t("Vent litt – {navn} tenker", { navn: navn(sp, r.tur) }));
        if (r.fase !== "spill") return R.toast(R.t("Trekk et kort først"));
        const k = Number(el.dataset.v);
        if (!r.hender[meg(sp)].includes(k)) return;
        sp.valgt = sp.valgt.includes(k) ? sp.valgt.filter((x) => x !== k) : sp.valgt.concat(k);
        if (sp.variant === "gin") sp.valgt = sp.valgt.includes(k) ? [k] : [];
        R.lyd.klikk();
        R.vis();
      },
      trekk(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || rundeFerdig(sp)) return;
        const r = sp.r;
        if (!minTur(sp)) return R.toast(R.t("Vent litt – {navn} tenker", { navn: navn(sp, r.tur) }));
        if (r.fase === "tilbud") return R.toast(R.t("Ta kortet, eller stå over"));
        if (r.fase !== "trekk") return R.toast(R.t("Du har trukket – legg ut eller kast"));
        const k = Rummy.trekk(r, r.tur);
        if (k == null) return;
        sp.ny = [k];
        sp.bunkeValg = null;
        sp.angre = JSON.stringify(r);
        sp.endret = false;
        lyd.trekk();
        R.vibrer(8);
        R.vis();
      },
      bunkekort(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || rundeFerdig(sp)) return;
        const r = sp.r;
        if (!minTur(sp) || r.fase !== "trekk") return;
        const i = Number(el.dataset.v);
        if (i === r.bunke.length - 1) return H.ta(el, e, S);
        if (sp.bunkeValg === i) {
          sp.bunkeValg = null;
          return R.vis();
        }
        if (!Rummy.kanTa(r, r.tur, i)) {
          R.lyd.feil();
          R.vibrer(30);
          return R.toast(R.t("Du kan bare ta {kort} hvis du kan legge det ut med en gang", { kort: kortnavn(r.bunke[i]) }));
        }
        sp.bunkeValg = i;
        R.lyd.klikk();
        R.vis();
      },
      ta(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || rundeFerdig(sp)) return;
        const r = sp.r;
        if (!minTur(sp)) return R.toast(R.t("Vent litt – {navn} tenker", { navn: navn(sp, r.tur) }));
        const i = el.dataset.v != null && el.dataset.v !== "" ? Number(el.dataset.v) : r.bunke.length - 1;
        if (!Rummy.kanTa(r, r.tur, i)) {
          if (r.kunStokk) R.toast(R.t("Trekk fra bunken"));
          return;
        }
        const for0 = JSON.stringify(r);
        const kort = r.bunke.slice(i);
        if (!Rummy.ta(r, r.tur, i)) return;
        sp.ny = kort;
        sp.bunkeValg = null;
        sp.angre = for0; // nothing new was seen: the take itself can be undone
        sp.endret = true;
        sp.valgt = r.maaBruke != null ? [r.maaBruke] : [];
        lyd.trekk();
        R.vibrer(8);
        R.vis();
      },
      avsla(el, e, S) {
        const sp = S.spill;
        if (!sp || !minTur(sp)) return;
        const p = sp.r.tur;
        if (!Rummy.avsla(sp.r, p)) return;
        R.lyd.pek();
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      stopp(el, e, S) {
        const sp = S.spill;
        if (!sp || !minTur(sp)) return;
        const p = sp.r.tur;
        if (!Rummy.stopp(sp.r, p)) return;
        etterTrekk(S, p);
        R.vis();
      },
      legut(el, e, S) {
        const sp = S.spill;
        if (!sp || !minTur(sp)) return;
        const r = sp.r;
        const p = r.tur;
        const forMeld = r.bord.length;
        if (!Rummy.legUt(r, p, sp.valgt.slice())) {
          R.lyd.feil();
          return R.toast(R.t("Det er ikke en kombinasjon"));
        }
        sp.nyttMeld = forMeld;
        sp.valgt = [];
        sp.endret = true;
        lyd.meld();
        R.vibrer(12);
        etterTrekk(S, p);
        R.vis();
      },
      tilmeld(el, e, S) {
        const sp = S.spill;
        if (!sp || !minTur(sp) || sp.r.fase !== "spill") return;
        const r = sp.r;
        const p = r.tur;
        const mi = Number(el.dataset.v);
        if (!sp.valgt.length) return R.toast(R.t("Velg kortene du vil legge til først"));
        if (!Rummy.leggTil(r, p, sp.valgt.slice(), mi)) {
          R.lyd.feil();
          return R.toast(R.t("Kortene passer ikke her"));
        }
        sp.nyttMeld = mi;
        sp.valgt = [];
        sp.endret = true;
        lyd.meld();
        R.vibrer(10);
        etterTrekk(S, p);
        R.vis();
      },
      kast(el, e, S) {
        const sp = S.spill;
        if (!sp || !minTur(sp) || sp.r.fase !== "spill") return;
        const r = sp.r;
        const p = r.tur;
        if (sp.valgt.length !== 1) return R.toast(R.t("Velg ett kort å kaste"));
        if (!Rummy.kast(r, p, sp.valgt[0])) {
          R.lyd.feil();
          return R.toast(r.maaBruke != null ? R.t("Legg ut {kort} først", { kort: kortnavn(r.maaBruke) }) : R.t("Kortet du nettopp tok, kan du ikke kaste"));
        }
        sp.nyttMeld = null;
        lyd.legg();
        R.vibrer(10);
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      bank(el, e, S) {
        const sp = S.spill;
        if (!sp || !minTur(sp) || sp.r.fase !== "spill" || sp.valgt.length !== 1) return;
        const p = sp.r.tur;
        if (!Rummy.bank(sp.r, p, sp.valgt[0])) return R.toast(R.t("Du har for mange løse poeng til å banke på"));
        lyd.meld();
        etterTrekk(S, p);
        R.vis();
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || !minTur(sp) || !sp.angre) return;
        try {
          const r = JSON.parse(sp.angre);
          if (!Rummy.hel(r)) return;
          sp.r = r;
        } catch (feil) {
          return;
        }
        if (sp.r.fase === "trekk") sp.angre = null;
        sp.valgt = [];
        sp.endret = false;
        sp.nyttMeld = null;
        if (sp.r.fase === "trekk") sp.ny = [];
        R.lyd.pek();
        R.vis();
      },
      runde(el, e, S) {
        const sp = S.spill;
        if (!sp || !rundeFerdig(sp)) return;
        if (kampFerdig(sp)) return avsluttKamp(S);
        nyRunde(S);
        R.lyd.snu();
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && rundeFerdig(S.spill) && kampFerdig(S.spill)) avsluttKamp(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const stilling = sp.poeng.join("–");
        const spill = variantNavn(sp.variant);
        let tekst;
        let linje2;
        if (sp.modus === "mobil") {
          const niva = NIVANAVN[sp.niva].toLowerCase();
          const v = kampVinnere(sp);
          tekst = v.length === 1 && v[0] === 0 ? R.t("Jeg slo mobilen i {spill} på Samleren ({niva}), {stilling}. Klarer du bedre?", { spill, niva, stilling }) : R.t("Mobilen slo meg i {spill} på Samleren ({niva}), {stilling}. Klarer du bedre?", { spill, niva, stilling });
          linje2 = R.t("{spill} mot mobilen · {niva}", { spill, niva });
        } else {
          const v = kampVinnere(sp).map((p) => R.navn(p));
          tekst = R.t("{navn} vant {spill} på Samleren ({stilling})! Ta en runde du også.", { navn: R.ramsOpp(v), spill, stilling });
          linje2 = R.t("{spill} · {spillere} på én mobil", { spill, spillere: R.flertall(sp.n, "spiller", "spillere") });
        }
        R.del(R.t("Samleren"), tekst, DEL_URL, { kort: { tittel: R.t("Samleren"), linjer: [stilling, linje2] } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        stoppMobil(); // the phone players wait while the sheet is open
        const ferdige = sp.runde - (sp.lagt ? 0 : 1);
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ferdige ? R.t("Dere går til kåringen. Runden dere er midt i, teller ikke.") : R.t("Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return planleggMobil();
        if (!ferdige && !sp.lagt) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });
})();
