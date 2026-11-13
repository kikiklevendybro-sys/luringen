/* Narren — Idiot (in English «Palace»), for 2–4 players: you against one to three phone players,
   or two to four people passing one phone (the hand hides behind a gate between turns). Everyone
   has three hidden cards, three open cards on top of them and three on the hand. Play one or more
   equal cards as high as the top of the pile or higher, and fill the hand back up to three; a two
   goes on anything and resets, a ten burns the pile (four alike in a row too). Can't play: pick up
   the pile. With the hand and the draw pile empty you play the open cards, then the hidden ones
   blind. The last one with cards is the fool («narren»). The rules (Idiot) and the phone players
   (Mobil) are pure functions at the top; test/narren.test.mjs loads this file without the kit. */
(function () {
  "use strict";

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
      { navn: "kløver", rod: false }, // sprak-ok (not shown in this game)
    ];
    const BOKSTAV = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const VERDINAVN = ["", "ess", "2", "3", "4", "5", "6", "7", "8", "9", "10", "knekt", "dame", "konge"];
    // «en 7-er», «et ess», «en dame»: for questions like «Har noen en 7-er?»
    const MED_ARTIKKEL = ["", "et ess", "en 2-er", "en 3-er", "en 4-er", "en 5-er", "en 6-er", "en 7-er", "en 8-er", "en 9-er", "en 10-er", "en knekt", "en dame", "en konge"]; // sprak-ok (not shown in this game)
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

  // ---------- Rules ----------
  // A game: { n, giver (dealer), regler { fire, sju, atter }, hender: [[card]], opp: [[card|null] × 3]
  //   (open table cards), ned: [[card|null] × 3] (hidden table cards), stokk (draw pile, top = last),
  //   bunke (the pile in the middle, top = last), brent (burnt cards), fase ("bytte" | "spill" |
  //   "slutt"), klar (done swapping, per player), tur, igjen (the player burnt the pile and goes
  //   again), ute (players out, in order), narr (the last one), trekk (moves so far), logg }

  const Idiot = (() => {
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    // Ace is high: 3 … 14. Two and ten are the special cards.
    const rang = (k) => (verdiAv(k) === 1 ? 14 : verdiAv(k));
    const HAND = 3;
    // A game that never ends (pick-ups back and forth) stops here: the most cards left is the fool.
    const MAKS_TREKK = 1500;

    function bland(liste, rng) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // o: { n (2–4), giver, regler: { fire, sju, atter } }
    function nyRunde(o, rng) {
      const n = o.n;
      const stokk = bland(Array.from({ length: 52 }, (_, i) => i), rng);
      const ta = () => [stokk.pop(), stokk.pop(), stokk.pop()];
      const ned = [];
      const opp = [];
      const hender = [];
      for (let p = 0; p < n; p++) ned.push(ta());
      for (let p = 0; p < n; p++) opp.push(ta());
      for (let p = 0; p < n; p++) hender.push(ta());
      const g = o.regler || {};
      return {
        n,
        giver: (((o.giver || 0) % n) + n) % n,
        regler: { fire: g.fire !== false, sju: !!g.sju, atter: !!g.atter },
        hender,
        opp,
        ned,
        stokk,
        bunke: [],
        brent: [],
        fase: "bytte",
        klar: Array(n).fill(false),
        tur: ((o.giver || 0) + 1) % n,
        igjen: false,
        ute: [],
        narr: null,
        trekk: 0,
        logg: [],
      };
    }

    const erUte = (r, p) => r.ute.includes(p);
    const antallIgjen = (r, p) => r.hender[p].length + r.opp[p].filter((k) => k != null).length + r.ned[p].filter((k) => k != null).length;
    // Where p plays from now: the hand, then the open table cards, then the hidden ones.
    function kilde(r, p) {
      if (r.hender[p].length) return "hand";
      if (r.opp[p].some((k) => k != null)) return "opp";
      if (r.ned[p].some((k) => k != null)) return "ned";
      return null;
    }
    const kortFra = (r, p) => {
      const s = kilde(r, p);
      return s === "hand" ? r.hender[p].slice() : s === "opp" ? r.opp[p].filter((k) => k != null) : [];
    };
    const topp = (r) => (r.bunke.length ? r.bunke[r.bunke.length - 1] : null);
    // Does a card of rank v go on the pile now?
    function passer(r, v) {
      if (v === 2 || v === 10) return true;
      const t = topp(r);
      if (t == null) return true;
      const tv = rang(t);
      if (tv === 2) return true;
      if (r.regler.sju && tv === 7) return v <= 7;
      return v >= tv;
    }
    const iTur = (r, p) => r.fase === "spill" && r.tur === p && !erUte(r, p);
    const lovlige = (r, p) => (iTur(r, p) ? kortFra(r, p).filter((k) => passer(r, rang(k))) : []);
    const kanTa = (r, p) => iTur(r, p) && kilde(r, p) !== "ned" && r.bunke.length > 0 && !lovlige(r, p).length;
    const blindt = (r, p) => iTur(r, p) && kilde(r, p) === "ned";
    const levende = (r) => Array.from({ length: r.n }, (_, p) => p).filter((p) => !erUte(r, p));
    function nesteFra(r, p) {
      let q = p;
      for (let i = 0; i < r.n; i++) {
        q = (q + 1) % r.n;
        if (!erUte(r, q)) return q;
      }
      return p;
    }

    // ---- Before the game: swap between the hand and the open table cards ----
    function bytt(r, p, h, o) {
      if (r.fase !== "bytte" || r.klar[p]) return false;
      const hi = r.hender[p].indexOf(h);
      const oi = r.opp[p].indexOf(o);
      if (hi < 0 || oi < 0 || o == null || h == null) return false;
      r.hender[p][hi] = o;
      r.opp[p][oi] = h;
      return true;
    }
    // The lowest card on a hand begins (twos and tens don't count); ties: the first after the dealer.
    function starter(r) {
      let best = null;
      let bestV = 99;
      for (let d = 1; d <= r.n; d++) {
        const p = (r.giver + d) % r.n;
        for (const k of r.hender[p]) {
          const v = rang(k);
          if (v !== 2 && v !== 10 && v < bestV) {
            bestV = v;
            best = p;
          }
        }
      }
      return best == null ? (r.giver + 1) % r.n : best;
    }
    function ferdigBytte(r, p) {
      if (r.fase !== "bytte" || r.klar[p]) return false;
      r.klar[p] = true;
      if (r.klar.every(Boolean)) {
        r.fase = "spill";
        r.tur = starter(r);
        r.logg = [{ type: "start", p: r.tur }];
      }
      return true;
    }
    // Who swaps next (the first not done, from the left of the dealer).
    function bytter(r) {
      for (let d = 1; d <= r.n; d++) {
        const p = (r.giver + d) % r.n;
        if (!r.klar[p]) return p;
      }
      return null;
    }

    // ---- Playing ----
    function stopp(r) {
      const igjen = levende(r);
      if (igjen.length > 1) {
        // Too long (a safety net): the fewest cards go out first, the most cards is the fool.
        igjen.sort((a, b) => antallIgjen(r, a) - antallIgjen(r, b) || a - b);
        r.ute.push(...igjen.slice(0, -1));
        r.narr = igjen[igjen.length - 1];
        r.logg.push({ type: "stopp" });
      } else r.narr = igjen.length ? igjen[0] : null;
      r.fase = "slutt";
      r.igjen = false;
    }
    function neste(r, hopp) {
      r.igjen = false;
      if (r.trekk >= MAKS_TREKK) return stopp(r);
      let p = r.tur;
      const hoppet = [];
      for (let s = 0; s <= hopp; s++) {
        p = nesteFra(r, p);
        if (s < hopp && !hoppet.includes(p)) hoppet.push(p);
      }
      if (hoppet.length) r.logg.push({ type: "hopp", p: hoppet });
      r.tur = p;
    }
    function brenner(r, v) {
      if (v === 10) return true;
      const b = r.bunke;
      const n = b.length;
      return !!r.regler.fire && n >= 4 && [1, 2, 3, 4].every((i) => rang(b[n - i]) === v);
    }
    function etterLegg(r, p, v, antall) {
      r.trekk++;
      const brent = brenner(r, v);
      if (brent) {
        r.brent.push(...r.bunke);
        r.logg.push({ type: "brent", p, n: r.bunke.length, ti: v === 10 });
        r.bunke = [];
      }
      if (!antallIgjen(r, p)) {
        r.ute.push(p);
        r.logg.push({ type: "ute", p, plass: r.ute.length });
        if (levende(r).length <= 1) return stopp(r);
        return neste(r, 0);
      }
      if (brent) {
        r.igjen = true;
        return;
      }
      neste(r, r.regler.atter && v === 8 ? antall : 0);
    }

    // Play `kort` (one or more cards of one rank) from the hand or the open table cards.
    function legg(r, p, kort) {
      if (!iTur(r, p) || !Array.isArray(kort) || !kort.length || new Set(kort).size !== kort.length) return false;
      const s = kilde(r, p);
      if (s !== "hand" && s !== "opp") return false;
      const v = rang(kort[0]);
      const fra = s === "hand" ? r.hender[p] : r.opp[p];
      if (!kort.every((k) => Number.isInteger(k) && rang(k) === v && fra.includes(k)) || !passer(r, v)) return false;
      if (s === "hand") r.hender[p] = r.hender[p].filter((k) => !kort.includes(k));
      else r.opp[p] = r.opp[p].map((k) => (kort.includes(k) ? null : k));
      r.bunke.push(...kort);
      r.logg = [{ type: "legg", p, kort: kort.slice(), fra: s }];
      if (s === "hand") while (r.hender[p].length < HAND && r.stokk.length) r.hender[p].push(r.stokk.pop());
      etterLegg(r, p, v, kort.length);
      return true;
    }

    // Turn hidden card i: if it fits, it is played; if not, the pile and the card go to the hand.
    function blind(r, p, i) {
      if (!blindt(r, p) || !(i >= 0 && i < 3) || r.ned[p][i] == null) return false;
      const k = r.ned[p][i];
      r.ned[p][i] = null;
      const v = rang(k);
      if (passer(r, v)) {
        r.bunke.push(k);
        r.logg = [{ type: "blind", p, k, ok: true }];
        etterLegg(r, p, v, 1);
      } else {
        const n = r.bunke.length + 1;
        r.hender[p].push(...r.bunke, k);
        r.bunke = [];
        r.logg = [{ type: "blind", p, k, ok: false, n }];
        r.trekk++;
        neste(r, 0);
      }
      return true;
    }

    // Nothing fits: the whole pile goes to the hand, and the turn goes on.
    function taOpp(r, p) {
      if (!kanTa(r, p)) return false;
      const n = r.bunke.length;
      r.hender[p].push(...r.bunke);
      r.bunke = [];
      r.logg = [{ type: "ta", p, n }];
      r.trekk++;
      neste(r, 0);
      return true;
    }

    // How many cards of rank v lie on top of the pile in a row.
    function paToppen(r, v) {
      let n = 0;
      for (let i = r.bunke.length - 1; i >= 0 && rang(r.bunke[i]) === v; i--) n++;
      return n;
    }

    // Every card exactly once (for checking a restored game).
    function hel(r) {
      if (!r || !Number.isInteger(r.n) || r.n < 2 || r.n > 4) return false;
      for (const f of ["hender", "opp", "ned", "klar"]) if (!Array.isArray(r[f]) || r[f].length !== r.n) return false;
      if (!Array.isArray(r.stokk) || !Array.isArray(r.bunke) || !Array.isArray(r.brent) || !Array.isArray(r.ute) || !r.regler) return false;
      if (!r.opp.every((a) => Array.isArray(a) && a.length === 3) || !r.ned.every((a) => Array.isArray(a) && a.length === 3) || !r.hender.every(Array.isArray)) return false;
      const alle = [].concat(...r.hender, ...r.opp.map((a) => a.filter((k) => k != null)), ...r.ned.map((a) => a.filter((k) => k != null)), r.stokk, r.bunke, r.brent);
      if (alle.length !== 52 || new Set(alle).size !== 52 || !alle.every((k) => Number.isInteger(k) && k >= 0 && k < 52)) return false;
      if (!["bytte", "spill", "slutt"].includes(r.fase)) return false;
      return Number.isInteger(r.tur) && r.tur >= 0 && r.tur < r.n && (r.fase !== "spill" || !erUte(r, r.tur));
    }

    return { sortAv, verdiAv, rang, HAND, MAKS_TREKK, bland, nyRunde, erUte, antallIgjen, kilde, kortFra, topp, passer, iTur, lovlige, kanTa, blindt, levende, nesteFra, bytt, starter, ferdigBytte, bytter, legg, blind, taOpp, paToppen, hel };
  })();

  // ---------- The phone players ----------
  // 1 Lett: any card that fits, any number of them; keeps the deal as it is. 2 Middels: puts its
  // strongest cards open before the game, plays the lowest card that fits (all of that rank) and
  // saves twos and tens for when nothing else goes. 3 Vanskelig: also burns big piles, finishes four
  // alike, and when the next player is close to going out it plays high, or a seven or an eight when
  // those house rules are on. Only what a player at the table can see is used.

  const Mobil = (() => {
    const { rang } = Idiot;
    const styrke = (k) => {
      const v = rang(k);
      return v === 10 ? 16 : v === 2 ? 15 : v;
    };

    // Before the game: the three strongest of hand + open cards are put open.
    function bytt(r, p, niva) {
      if (niva <= 1) return;
      const alle = r.hender[p].concat(r.opp[p]).sort((a, b) => styrke(b) - styrke(a));
      const apne = alle.slice(0, 3);
      for (const k of apne) {
        if (r.opp[p].includes(k)) continue;
        const ut = r.opp[p].find((o) => !apne.includes(o));
        Idiot.bytt(r, p, k, ut);
      }
    }

    // { type: "legg", kort } | { type: "blind", i } | { type: "ta" } — always a legal move.
    function velg(r, p, niva, rng) {
      rng = rng || Math.random;
      if (Idiot.blindt(r, p)) {
        const ix = [0, 1, 2].filter((i) => r.ned[p][i] != null);
        return { type: "blind", i: ix[Math.floor(rng() * ix.length)] };
      }
      const L = Idiot.lovlige(r, p);
      if (!L.length) return { type: "ta" };
      const grupper = new Map();
      for (const k of L.slice().sort((a, b) => a - b)) {
        const v = rang(k);
        if (!grupper.has(v)) grupper.set(v, []);
        grupper.get(v).push(k);
      }
      const ranger = Array.from(grupper.keys());
      if (niva <= 1) {
        const g = grupper.get(ranger[Math.floor(rng() * ranger.length)]);
        return { type: "legg", kort: g.slice(0, 1 + Math.floor(rng() * g.length)) };
      }
      const ut = (v, n) => ({ type: "legg", kort: grupper.get(v).slice(0, n || grupper.get(v).length) });
      const spesial = (v) => v === 2 || v === 10;
      const vanlige = ranger.filter((v) => !spesial(v)).sort((a, b) => a - b);
      const stor = r.bunke.length;
      const neste = Idiot.nesteFra(r, p);
      const nesteN = Idiot.antallIgjen(r, neste);
      if (niva >= 3) {
        // A big pile: burn it with a ten (and play again).
        if (grupper.has(10) && stor >= 6 && (!vanlige.length || stor >= 9 || vanlige[0] >= 11)) return ut(10, 1);
        // Finish four alike on the pile.
        if (r.regler.fire)
          for (const v of vanlige) {
            const pa = Idiot.paToppen(r, v);
            if (pa && pa + grupper.get(v).length >= 4) return ut(v);
          }
        // The next player is close to going out: shut the door.
        if (nesteN <= 3 && neste !== p) {
          if (r.regler.atter && grupper.has(8)) return ut(8);
          if (r.regler.sju && grupper.has(7)) return ut(7);
          if (vanlige.length) return ut(vanlige[vanlige.length - 1]);
        }
        // Keep the aces and kings on the hand while the draw pile lasts, if anything lower goes.
        const lave = vanlige.filter((v) => v < 13);
        if (r.stokk.length && lave.length) return ut(lave[0]);
      }
      if (vanlige.length) return ut(vanlige[0]);
      // Only twos and tens: a two resets a small pile, a ten burns a big one.
      if (grupper.has(2) && (stor < 5 || !grupper.has(10))) return ut(2, 1);
      return ut(grupper.has(10) ? 10 : 2, 1);
    }

    // Plays p's whole turn (also again after a burn). For simulations.
    function spillTur(r, p, niva, rng) {
      for (let n = 0; n < 12 && Idiot.iTur(r, p); n++) {
        const v = velg(r, p, niva, rng);
        const ok = v.type === "legg" ? Idiot.legg(r, p, v.kort) : v.type === "blind" ? Idiot.blind(r, p, v.i) : Idiot.taOpp(r, p);
        if (!ok) return false;
      }
      return true;
    }

    return { velg, bytt, spillTur, styrke };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules, the phone players and the cards.
    window.Narren = { Idiot, Mobil, KORT };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { rang, verdiAv, sortAv } = Idiot;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen legger et tilfeldig kort som passer. Fint for de minste."),
    2: R.t("Mobilen legger lavest mulig og sparer toere og tiere til den trenger dem."),
    3: R.t("Mobilen brenner store bunker og stenger veien når du nesten er ute. Klarer du å slå den?"),
  };
  const VERDIORD = ["", R.t("ess"), R.t("to"), R.t("tre"), R.t("fire"), R.t("fem"), R.t("seks"), R.t("sju"), R.t("åtte"), R.t("ni"), R.t("ti"), R.t("knekt"), R.t("dame"), R.t("konge")];
  const VERDI_EN = ["", R.t("et ess"), R.t("en toer"), R.t("en treer"), R.t("en firer"), R.t("en femmer"), R.t("en sekser"), R.t("en sjuer"), R.t("en åtter"), R.t("en nier"), R.t("en tier"), R.t("en knekt"), R.t("en dame"), R.t("en konge")];
  // «2 sjuere», «3 damer»
  const ANTALL = [
    null,
    (n) => R.t("{n} ess|{n} ess", { n }),
    (n) => R.t("{n} toer|{n} toere", { n }),
    (n) => R.t("{n} treer|{n} treere", { n }),
    (n) => R.t("{n} firer|{n} firere", { n }),
    (n) => R.t("{n} femmer|{n} femmere", { n }),
    (n) => R.t("{n} sekser|{n} seksere", { n }),
    (n) => R.t("{n} sjuer|{n} sjuere", { n }),
    (n) => R.t("{n} åtter|{n} åttere", { n }),
    (n) => R.t("{n} nier|{n} niere", { n }),
    (n) => R.t("{n} tier|{n} tiere", { n }),
    (n) => R.t("{n} knekt|{n} knekter", { n }),
    (n) => R.t("{n} dame|{n} damer", { n }),
    (n) => R.t("{n} konge|{n} konger", { n }),
  ];
  const FARGENAVN = [R.t("spar"), R.t("hjerter"), R.t("ruter"), R.t("kløver")];
  // «hjerter sju», «spar dame»
  const kortnavn = (k) => R.t("{farge} {verdi}", { farge: FARGENAVN[sortAv(k)], verdi: VERDIORD[verdiAv(k)] });
  const kortTekst = (kort) => (kort.length === 1 ? kortnavn(kort[0]) : ANTALL[verdiAv(kort[0])](kort.length));
  const FART = { legg: 1000, ta: 900, start: 900 }; // ms per move of a phone player
  // This edition's address (rusj.no/narren/, rusj.no/en/…)
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/narren/" }).href;
  let H;

  // S.spill: { id, modus ("mobil" | "flere"), niva, n, regler, r (see Idiot), port (hot seat: the
  //   hand waits behind «Vis kortene mine»), valgt (the cards picked to play), bytte (the card picked
  //   to swap), telt (the result is counted), ferdig, registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMenneske = (sp, p) => sp.modus === "flere" || p === 0;
  const navn = (sp, p) => (sp.modus === "flere" ? R.navn(p) : p === 0 ? R.t("Du") : sp.n === 2 ? R.t("Mobilen") : R.t("Mobil {n}", { n: p }));
  const avatarNr = (sp, p) => (sp.modus === "flere" ? p : p === 0 ? 0 : 9 + p);
  const avatar = (sp, p, str) => R.avatar(avatarNr(sp, p), str);
  const erDu = (sp, p) => sp.modus === "mobil" && p === 0;
  // The seat whose cards are shown: you against the phone, or the one who swaps or plays.
  const meg = (sp) => (sp.modus === "mobil" ? 0 : sp.r.fase === "bytte" ? Idiot.bytter(sp.r) : sp.r.tur);
  const rng = () => R.rng(R.nyttFro());
  const plassering = (r) => (r.narr == null ? r.ute.slice() : r.ute.concat(r.narr));

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.tone(520, 0, 0.06, "triangle", 0.1);
      R.lyd.stoy(0, 0.08, 0.14, 2400);
    },
    brenn: () => {
      R.lyd.stoy(0, 0.55, 0.22, 900);
      R.lyd.tone(220, 0.05, 0.4, "sawtooth", 0.05, 660);
    },
    ta: () => {
      R.lyd.stoy(0, 0.2, 0.14, 1200);
      R.lyd.tone(330, 0.08, 0.22, "triangle", 0.08, 220);
    },
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

  // ---------- Texts from what happened ----------
  function hendelseTekst(sp, h) {
    const hvem = navn(sp, h.p);
    const du = erDu(sp, h.p);
    switch (h.type) {
      case "start":
        return du ? R.t("Du har lavest kort og begynner.") : R.t("{hvem} har lavest kort og begynner.", { hvem });
      case "legg":
        return h.kort.length === 1 ? R.t("{hvem} la {kort}.", { hvem, kort: kortnavn(h.kort[0]) }) : R.t("{hvem} la {antall}.", { hvem, antall: kortTekst(h.kort) });
      case "blind":
        return h.ok ? R.t("{hvem} snudde {kort} – og det passet!", { hvem, kort: kortnavn(h.k) }) : R.t("{hvem} snudde {kort}, som ikke passet, og tok opp bunken.", { hvem, kort: kortnavn(h.k) });
      case "ta":
        return R.t("{hvem} tok opp bunken ({antall}).", { hvem, antall: R.flertall(h.n, "kort", "kort") });
      case "brent":
        return du ? R.t("Bunken brenner! Du legger igjen.") : R.t("Bunken brenner! {hvem} legger igjen.", { hvem });
      case "hopp": {
        const hvemListe = h.p.slice().sort((a, b) => a - b).map((q) => navn(sp, q));
        return h.p.length === 1 && erDu(sp, h.p[0]) ? R.t("Du blir hoppet over.") : R.t("{hvem} blir hoppet over.|{hvem} blir hoppet over.", { hvem: R.ramsOpp(hvemListe), n: h.p.length });
      }
      case "ute":
        return du ? R.t("Du er ute!") : R.t("{hvem} er ute!", { hvem });
      case "stopp":
        return R.t("Spillet sto fast – færrest kort kom best ut.");
      default:
        return "";
    }
  }
  // The burn line is told by itself (the player plays again); «ute» after a burn too.
  const sistTekst = (sp) =>
    (sp.r.logg || [])
      .filter((h, i, a) => !(h.type === "brent" && a.some((x) => x.type === "ute" && x.p === h.p)))
      .map((h) => hendelseTekst(sp, h))
      .filter(Boolean)
      .join(" ");

  // What goes on the pile now?
  function hintTekst(sp) {
    const r = sp.r;
    const t = Idiot.topp(r);
    if (t == null) return R.t("Bunken er tom – legg hva du vil.");
    const v = rang(t);
    if (v === 2) return R.t("Toeren ligger øverst – legg hva du vil.");
    if (r.regler.sju && v === 7) return R.t("Sjueren ligger øverst: legg sju eller lavere.");
    if (v === 14) return R.t("Bare ess, toer eller tier passer nå.");
    return R.t("Legg {kort} eller høyere.", { kort: VERDI_EN[verdiAv(t)] });
  }

  function meldingTekst(sp) {
    const r = sp.r;
    if (r.fase === "slutt") return "";
    if (r.fase === "bytte") return R.t("Trykk på et kort på hånda og så på et åpent kort for å bytte dem. Sterke kort er gode å ha liggende åpent.");
    const p = r.tur;
    if (!erMenneske(sp, p)) return R.t("{navn} tenker …", { navn: navn(sp, p) });
    const kilde = Idiot.kilde(r, p);
    if (kilde === "ned") return R.t("Nå går det blindt: snu ett av de skjulte kortene dine.");
    if (!Idiot.lovlige(r, p).length) return R.t("Ingenting passer. Du må ta opp bunken.");
    const fra = kilde === "opp" ? R.t("Hånda er tom – spill fra de åpne kortene.") + " " : "";
    return fra + hintTekst(sp);
  }

  // ---------- Flow ----------

  function nyttSpill(S) {
    const o = S.oppsett;
    const n = o.modus === "mobil" ? 1 + o.mobiler : R.klamp(S.antall || 2, 2, 4);
    const regler = { fire: !!o.fire, sju: !!o.sju, atter: !!o.atter };
    // Against the phone the last phone player deals, so you swap first and sit first in line.
    const giver = o.modus === "mobil" ? n - 1 : R.heltall(0, n - 1);
    const r = Idiot.nyRunde({ n, giver, regler }, rng());
    S.spill = {
      id: R.nyttFro() % 1e9,
      modus: o.modus,
      niva: o.niva,
      n,
      regler,
      r,
      port: o.modus === "flere",
      valgt: [],
      bytte: null,
      telt: false,
      ferdig: false,
      registrert: false,
    };
    if (o.modus === "mobil")
      for (let p = 1; p < n; p++) {
        Mobil.bytt(r, p, o.niva);
        Idiot.ferdigBytte(r, p);
      }
    nyttKort = null;
    R.statistikk("start", { modus: o.modus, spillere: n, niva: o.modus === "mobil" ? o.niva : 0, fire: regler.fire, sju: regler.sju, atter: regler.atter });
  }

  // After every move by p.
  function etterTrekk(S, p) {
    const sp = S.spill;
    const r = sp.r;
    sp.valgt = [];
    // You are out against the phone: the phone players play the rest at once.
    if (sp.modus === "mobil" && r.fase === "spill" && Idiot.erUte(r, 0)) {
      const tilfeldig = rng();
      for (let n = 0; n < 4000 && r.fase === "spill"; n++) if (!Mobil.spillTur(r, r.tur, sp.niva, tilfeldig)) break;
      r.logg = [{ type: "ute", p: 0, plass: r.ute.indexOf(0) + 1 }];
    }
    if (r.fase === "slutt") return ferdig(S);
    if (sp.modus === "flere" && r.tur !== p) sp.port = true;
  }

  // The game is over: count it, celebrate in proportion.
  function ferdig(S) {
    const sp = S.spill;
    const r = sp.r;
    sp.port = false;
    if (sp.telt) return;
    sp.telt = true;
    const forst = plassering(r)[0];
    if (sp.modus === "mobil") {
      const rek = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, tap: 0 });
      if (forst === 0) {
        rek.seier++;
        R.merke("klassiker-narren");
      } else rek.tap++;
    }
    const fortsatt = R.vakt();
    setTimeout(() => {
      if (!fortsatt()) return;
      if (sp.modus === "mobil" && r.narr === 0) lyd.tap();
      else {
        R.lyd.riktig();
        R.vibrer([30, 50, 80]);
      }
    }, 420);
  }

  function avsluttSpill(S) {
    const sp = S.spill;
    stoppMobil();
    sp.ferdig = true;
    R.statistikk("ferdig", { modus: sp.modus, spillere: sp.n, niva: sp.modus === "mobil" ? sp.niva : 0, trekk: sp.r.trekk });
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
    if (mobilId || !sp || sp.ferdig || S.skjerm !== "spill" || sp.r.fase !== "spill") return;
    if (erMenneske(sp, sp.r.tur)) return;
    mobilId = setTimeout(mobilSteg, ms != null ? ms : FART.legg);
  }
  function mobilSteg() {
    mobilId = null;
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || sp.r.fase !== "spill") return;
    const r = sp.r;
    const p = r.tur;
    if (erMenneske(sp, p)) return;
    // Never behind a sheet (rules, «Avslutt?») or in a hidden tab: wait and look again.
    if (R.arkApent() || document.hidden) return planleggMobil(500);
    const v = Mobil.velg(r, p, sp.niva, Math.random);
    let ok = false;
    if (v.type === "legg") {
      ok = Idiot.legg(r, p, v.kort);
      if (ok) nyttKort = { k: v.kort[v.kort.length - 1], fra: "topp" };
    } else if (v.type === "blind") {
      ok = Idiot.blind(r, p, v.i);
      if (ok && r.logg[0] && r.logg[0].ok) nyttKort = { k: r.logg[0].k, fra: "topp" };
    } else ok = Idiot.taOpp(r, p);
    if (!ok) return;
    lydFor(r);
    etterTrekk(S, p);
    R.vis();
    planleggMobil(v.type === "ta" ? FART.ta : FART.legg);
  }
  function lydFor(r) {
    const typer = (r.logg || []).map((h) => h.type);
    if (typer.includes("brent")) {
      lyd.brenn();
      R.vibrer([20, 40, 60]);
    } else if (typer.includes("ta") || (r.logg[0] && r.logg[0].type === "blind" && !r.logg[0].ok)) lyd.ta();
    else lyd.legg();
    if (typer.includes("ute")) setTimeout(() => R.lyd.pling(), 300);
  }

  // ---------- Markup ----------

  let nyttKort = null; // { k, fra: "hand" | "topp" } — the card that lands on the pile on the next draw

  // Hand order: low to high, the special twos and tens last.
  const sorter = (hand) => hand.slice().sort((a, b) => Mobil.styrke(a) - Mobil.styrke(b) || sortAv(a) - sortAv(b));

  // A player's three table cards: the hidden one with the open one on top.
  // o: { knapper: "opp" | "ned" | "bytte" | "", valgt: [cards], lovlig: Set, liten }
  function bordkort(sp, p, o = {}) {
    const r = sp.r;
    return [0, 1, 2]
      .map((i) => {
        const ned = r.ned[p][i];
        const opp = r.opp[p][i];
        let innhold = "";
        if (ned != null) {
          const knapp = o.knapper === "ned";
          innhold += knapp
            ? `<button class="nr-ned" data-h="blind" data-v="${i}" aria-label="${esc(R.t("Skjult kort {n}", { n: i + 1 }))}">${KORT.html(null)}</button>`
            : `<span class="nr-ned">${KORT.html(null)}</span>`;
        }
        if (opp != null) {
          const knapp = o.knapper === "opp" || o.knapper === "bytte";
          const valgt = (o.valgt || []).includes(opp);
          const lov = !o.lovlig || o.lovlig.has(opp);
          innhold += knapp
            ? `<button class="nr-opp${valgt ? " valgt" : ""}${lov ? " lovlig" : ""}" data-h="kort" data-v="${opp}" aria-label="${esc(kortnavn(opp))}" aria-pressed="${valgt}"${lov ? "" : ' aria-disabled="true"'}>${KORT.html(opp, { opp: true })}</button>`
            : `<span class="nr-opp">${KORT.html(opp, { opp: true })}</span>`;
        }
        return `<span class="nr-spor${ned == null && opp == null ? " nr-tomt" : ""}">${innhold}</span>`;
      })
      .join("");
  }
  // What the table cards say for a screen reader.
  function bordTekst(sp, p) {
    const r = sp.r;
    const apne = r.opp[p].filter((k) => k != null);
    const skjulte = r.ned[p].filter((k) => k != null).length;
    const deler = [];
    if (apne.length) deler.push(R.t("Åpne kort: {kort}.", { kort: apne.map(kortnavn).join(", ") }));
    if (skjulte) deler.push(R.t("{n} skjult.|{n} skjulte.", { n: skjulte }));
    return deler.join(" ");
  }

  // The others around the table, in the order they play after the one whose cards are shown.
  function andreHtml(sp) {
    const r = sp.r;
    const vis = meg(sp);
    const aktiv = r.fase === "spill" ? r.tur : -1;
    const seter = [];
    for (let d = 1; d < sp.n; d++) seter.push((vis + d) % sp.n);
    return `<ul class="nr-andre seter-${seter.length}" aria-label="${esc(R.t("Rundt bordet"))}" style="--seter:${seter.length}">${seter
      .map((p) => {
        const n = r.hender[p].length;
        const ute = Idiot.erUte(r, p);
        const tenker = p === aktiv && !erMenneske(sp, p);
        const rygger = Array.from({ length: Math.min(n, 6) }, (_, i) => `<i style="--i:${i}"></i>`).join("");
        const status = ute ? `<span class="nr-uteMerke">${esc(R.t("Ute · {plass}. plass", { plass: r.ute.indexOf(p) + 1 }))}</span>` : `<span class="nr-antall"><span class="nr-rygger" aria-hidden="true" style="--n:${Math.min(n, 6)}">${rygger}</span><span class="nr-lang">${esc(R.t("{antall} på hånda", { antall: R.flertall(n, "kort", "kort") }))}</span><span class="nr-kort">${esc(R.flertall(n, "kort", "kort"))}</span></span>`;
        return `<li class="nr-plass${p === aktiv ? " aktiv" : ""}${ute ? " ute" : ""}">
          <span class="nr-topp"><span class="nr-ava">${avatar(sp, p)}${tenker ? '<span class="nr-tenker" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}</span>
          <span class="nr-info"><b class="nr-navn">${esc(navn(sp, p))}</b>${status}</span></span>
          <span class="nr-mini" role="img" aria-label="${esc(bordTekst(sp, p) || R.t("Ingen kort på bordet."))}">${bordkort(sp, p)}</span>
        </li>`;
      })
      .join("")}</ul>`;
  }

  function bunkeHtml(sp) {
    const r = sp.r;
    const t = Idiot.topp(r);
    const ny = nyttKort && nyttKort.k === t ? nyttKort : null;
    nyttKort = null;
    const sisteBrent = (r.logg || []).some((h) => h.type === "brent");
    const p = meg(sp);
    const kanLegge = r.fase === "spill" && erMenneske(sp, r.tur) && r.tur === p && sp.valgt.length > 0;
    const under = r.bunke.length > 1 ? KORT.html(r.bunke[r.bunke.length - 2], { opp: true, klasse: "nr-under" }) : "";
    const under2 = r.bunke.length > 2 ? KORT.html(r.bunke[r.bunke.length - 3], { opp: true, klasse: "nr-under2" }) : "";
    const toppKlasse = `nr-toppkort${ny ? " ny fra-" + ny.fra : ""}`; // sprak-ok
    const merke = t == null ? "" : rang(t) === 2 ? R.t("Alt går") : r.regler.sju && rang(t) === 7 ? R.t("Sju eller lavere") : "";
    const haugEtikett = t == null ? R.t("Bunken er tom.") : R.t("Øverst i bunken ligger {kort}. {antall} i bunken.", { kort: kortnavn(t), antall: R.flertall(r.bunke.length, "kort", "kort") });
    const haug = `${under2}${under}${t == null ? `<span class="nr-tomhaug${sisteBrent ? " brent" : ""}" aria-hidden="true">${sisteBrent ? "🔥" : ""}</span>` : KORT.html(t, { opp: true, stor: true, klasse: toppKlasse })}
        ${r.bunke.length ? `<span class="nr-tall" aria-hidden="true">${r.bunke.length}</span>` : ""}
        ${merke ? `<span class="nr-merke" aria-hidden="true">${esc(merke)}</span>` : ""}`;
    return `<div class="nr-bord">
      <div class="nr-stokk" role="img" aria-label="${esc(R.t("Trekkbunken: {antall}", { antall: R.flertall(r.stokk.length, "kort", "kort") }))}">
        ${r.stokk.length ? KORT.html(null, { klasse: "nr-stokkort" }) : '<span class="nr-tom" aria-hidden="true"></span>'}
        <span class="nr-tall" aria-hidden="true">${r.stokk.length}</span>
      </div>
      ${
        kanLegge
          ? `<button class="nr-haug klar" id="nr-haug" data-h="legg" aria-label="${esc(haugEtikett + " " + R.t("Legg {kort}", { kort: kortTekst(sp.valgt) }))}">${haug}</button>`
          : `<div class="nr-haug" id="nr-haug" role="img" aria-label="${esc(haugEtikett)}">${haug}</div>`
      }
      <div class="nr-brent" role="img" aria-label="${esc(R.t("Brent: {antall}", { antall: R.flertall(r.brent.length, "kort", "kort") }))}"><span aria-hidden="true">🔥</span><b aria-hidden="true">${r.brent.length}</b></div>
    </div>`;
  }

  // The shown player's own table cards and hand.
  function minSideHtml(sp) {
    const r = sp.r;
    const p = meg(sp);
    const bytte = r.fase === "bytte";
    const minTur = r.fase === "spill" && r.tur === p && erMenneske(sp, p);
    const kilde = minTur ? Idiot.kilde(r, p) : null;
    const lov = new Set(minTur ? Idiot.lovlige(r, p) : []);
    const valgt = bytte ? (sp.bytte != null ? [sp.bytte] : []) : sp.valgt;
    const bordValg = bytte ? { knapper: "bytte", valgt } : kilde === "opp" ? { knapper: "opp", valgt, lovlig: lov } : kilde === "ned" ? { knapper: "ned" } : {};
    const hand = sorter(r.hender[p]);
    const handAktiv = bytte || kilde === "hand";
    // A big hand (after picking up the pile) goes in two or three rows.
    const rader = hand.length <= 10 ? 1 : hand.length <= 22 ? 2 : 3;
    const perRad = Math.ceil(hand.length / rader);
    const radHtml = [];
    for (let i = 0; i < rader; i++) {
      const del = hand.slice(i * perRad, (i + 1) * perRad);
      radHtml.push(
        `<div class="nr-rad" style="--n:${del.length}">${del
          .map((k, j) => {
            const v = valgt.includes(k);
            const ok = bytte || !minTur || kilde !== "hand" || lov.has(k);
            return handAktiv
              ? `<button class="nr-hk${ok ? " lovlig" : ""}${v ? " valgt" : ""}" data-h="kort" data-v="${k}" aria-label="${esc(kortnavn(k))}" aria-pressed="${v}"${ok ? "" : ' aria-disabled="true"'} style="--i:${j}">${KORT.html(k, { opp: true })}</button>`
              : `<span class="nr-hk" style="--i:${j}">${KORT.html(k, { opp: true })}</span>`;
          })
          .join("")}</div>`,
      );
    }
    const handEtikett = sp.modus === "flere" ? R.t("Kortene til {navn}", { navn: navn(sp, p) }) : R.t("Kortene dine");
    return `<div class="nr-meg${minTur || bytte ? " min-tur" : ""} kilde-${kilde || "ingen"}">
      <div class="nr-mittbord" role="group" aria-label="${esc(R.t("Bordkortene dine"))}">${bordkort(sp, p, bordValg)}</div>
      <div class="nr-hand${rader > 1 ? " rader" : ""}" style="--per:${Math.max(perRad, 1)}" role="group" aria-label="${esc(handEtikett)}">${hand.length ? radHtml.join("") : `<p class="nr-tomhand">${esc(R.t("Ingen kort på hånda"))}</p>`}</div>
    </div>`;
  }

  function resultatHtml(sp) {
    const r = sp.r;
    const rekke = plassering(r);
    return `<ol class="nr-plasser" aria-label="${esc(R.t("Rekkefølgen"))}">${rekke
      .map((p, i) => {
        const narr = p === r.narr;
        const merke = narr ? R.t("Narren") : i === 0 ? R.t("Ute først") : R.t("{plass}. plass", { plass: i + 1 });
        return `<li class="${i === 0 ? "forst" : ""}${narr ? " narr" : ""}"><span class="nr-nr">${narr ? "🃏" : i + 1}</span>${avatar(sp, p)}<b>${esc(navn(sp, p))}</b><span class="nr-plassmerke">${esc(merke)}</span></li>`;
      })
      .join("")}</ol>`;
  }

  function resultatTittel(sp) {
    const r = sp.r;
    const forst = plassering(r)[0];
    if (sp.modus === "mobil") {
      if (forst === 0) return R.t("Du ble kvitt alle kortene først!");
      if (r.narr === 0) return R.t("Du ble narren denne gangen.");
      return R.t("{navn} ble kvitt kortene først.", { navn: navn(sp, forst) });
    }
    return R.t("{navn} er narren!", { navn: navn(sp, r.narr) });
  }

  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const slutt = r.fase === "slutt";
    if (sp.port && !slutt) {
      const sist = r.fase === "spill" ? sistTekst(sp) : "";
      const i = meg(sp);
      return `${sist ? `<p class="nr-sist-port" role="status">${esc(sist)}</p>` : ""}
        ${R.ui.giTil({ i, h: "vis", knapp: R.t("Vis kortene mine"), tekst: r.fase === "bytte" ? R.t("Bytt kort – gi mobilen til") : R.t("Gi mobilen til"), advarsel: R.t("De andre ser bort"), prikker: [sp.n, i] })}`;
    }
    const p = meg(sp);
    const minTur = r.fase === "spill" && r.tur === p && erMenneske(sp, p);
    const sist = r.fase === "spill" ? sistTekst(sp) : "";
    const melding = slutt ? resultatTittel(sp) : meldingTekst(sp);
    let hoved;
    if (slutt) hoved = R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" });
    else if (r.fase === "bytte") hoved = R.ui.knapp(R.t("Ferdig – start spillet"), "byttferdig");
    else if (minTur && Idiot.blindt(r, p)) hoved = R.ui.knapp(R.t("Snu et skjult kort"), "blind");
    else if (minTur && Idiot.kanTa(r, p)) hoved = R.ui.knapp(R.t("Ta opp bunken"), "ta", { variant: "rod" });
    else hoved = R.ui.knapp(sp.valgt.length && minTur ? R.t("Legg {kort}", { kort: kortTekst(sp.valgt) }) : R.t("Legg"), "legg", { av: !minTur || !sp.valgt.length });
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(r.fase === "bytte" ? R.t("Bytt kort før spillet") : R.t("Narren"))}</h1>
      ${andreHtml(sp)}
      ${bunkeHtml(sp)}
      <div class="nr-melding${slutt ? " ferdig" : minTur || r.fase === "bytte" ? " din" : ""}" role="status">
        ${sist && !slutt ? `<span class="nr-sist">${esc(sist)}</span>` : ""}
        <b>${esc(melding)}</b>
      </div>
      ${slutt ? resultatHtml(sp) : minSideHtml(sp)}
      ${R.ui.dokk(hoved, R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }

  // Shake a card that can't be played, and say why.
  function rist(el) {
    R.lyd.feil();
    R.vibrer(30);
    el.classList.remove("risting");
    void el.offsetWidth;
    el.classList.add("risting");
  }

  // ---------- Screens ----------

  R.start({
    id: "narren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", mobiler: 1, niva: 2, fire: true, sju: false, atter: false },
      spill: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", mobiler: 1, niva: 2, fire: true, sju: false, atter: false }, S.oppsett));
      if (!["mobil", "flere"].includes(o.modus)) o.modus = "mobil";
      if (![1, 2, 3].includes(o.mobiler)) o.mobiler = 1;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      for (const k of ["fire", "sju", "atter"]) o[k] = !!o[k];
      S.antall = R.klamp(S.antall || 2, 2, 4);
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const ok = ["mobil", "flere"].includes(sp.modus) && [1, 2, 3].includes(sp.niva) && Idiot.hel(sp.r) && sp.r.n === sp.n;
        if (!ok) S.spill = null;
        else {
          if (!Array.isArray(sp.valgt)) sp.valgt = [];
          sp.valgt = sp.valgt.filter((k) => Idiot.kortFra(sp.r, meg(sp)).includes(k));
          if (sp.bytte != null && !(sp.r.hender[meg(sp)] || []).concat(sp.r.opp[meg(sp)] || []).includes(sp.bytte)) sp.bytte = null;
          // A reload on a hot seat: whoever holds the phone now must show it is them again.
          if (sp.modus === "flere" && !sp.ferdig && sp.r.fase !== "slutt") sp.port = true;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Bli kvitt alle kortene dine – den som sitter igjen med kort til slutt, er narren. Alle får tre skjulte kort, tre åpne kort oppå dem og tre kort på hånda."),
      steg: [
        [R.t("Likt eller høyere"), R.t("Legg ett eller flere like kort som er like høye som eller høyere enn kortet øverst i bunken. Ess er høyest. Så lenge trekkbunken varer, fyller du hånda opp til tre kort.")],
        [R.t("Toeren og tieren"), R.t("En toer kan legges på alt, og etter den går alt. En tier brenner bunken: den tas ut av spillet, og du legger igjen. Kan du ikke legge noe, tar du opp hele bunken.")],
        [R.t("Bordkortene til slutt"), R.t("Er hånda og trekkbunken tomme, spiller du fra de åpne kortene dine og så fra de skjulte – blindt, ett om gangen. Passer ikke det skjulte kortet, tar du opp bunken.")],
      ],
      tips: [
        R.t("Før spillet starter, kan du bytte kort mellom hånda og de åpne kortene dine. Legg sterke kort – toere, tiere og ess – åpent."),
        R.t("Den som har lavest kort på hånda (toere og tiere teller ikke), begynner."),
        R.t("Fire like på rad i bunken brenner den også. Den regelen kan slås av."),
        R.t("Husregel «Sjueren»: Etter en sjuer må neste legge sju eller lavere. Toere og tiere går alltid."),
        R.t("Husregel «Åtteren»: En åtter hopper over neste spiller – én spiller for hver åtter."),
        R.t("Den som blir kvitt alle kortene først, vinner. Spillet går videre til bare én har kort igjen."),
        R.t("Flere på én mobil: Kortene skjules mellom hver tur. Trykk «Vis kortene mine» når du har fått mobilen."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const aktiv = pagar(S);
          const rek = [1, 2, 3].map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Likt eller høyere."))}<br><em>${esc(R.t("Bare ikke bli narren!"))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett spillet") : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–4", R.t("spillere")],
                ["3", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) +
            (rek.length ? `<section class="nr-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="nr-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan vil dere spille?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: R.t("Mot mobilen"), tekst: R.t("Du mot 1–3 mobilspillere") },
                  { v: "flere", ikon: "👥", tittel: R.t("Flere på én mobil"), tekst: R.t("2–4 spillere sender mobilen rundt") },
                ],
                o.modus,
              )}
            </section>
            ${
              o.modus === "mobil"
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Hvor mange mobilspillere?"))}</h2>
                    ${R.ui.seg("mobiler", [[1, "1"], [2, "2"], [3, "3"]], o.mobiler, { etikett: R.t("Antall mobilspillere") })}
                  </section>
                  <section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", [[1, NIVANAVN[1]], [2, NIVANAVN[2]], [3, NIVANAVN[3]]], o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>`
                : R.ui.spillere({ min: 2, max: 4, tittel: R.t("Hvem spiller?"), hjelp: R.t("Kortene skjules mellom hver tur, så ingen ser de andres.") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Husregler"))}</h2>
              ${R.ui.bryter("fire", o.fire, R.t("Fire like brenner bunken"), R.t("Fire like kort på rad i bunken brenner den, akkurat som en tier."))}
              ${R.ui.bryter("sju", o.sju, R.t("Sjueren: neste må gå under"), R.t("Etter en sjuer må neste legge sju eller lavere."))}
              ${R.ui.bryter("atter", o.atter, R.t("Åtteren hopper over"), R.t("En åtter hopper over neste spiller."))}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🃏" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill && S.spill.r.fase === "bytte" ? R.t("Bytt kort") : R.t("Narren")),
        tilbake: "hjem",
        vis: spillHtml,
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          planleggMobil(FART.start);
        },
        etter() {
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
          const r = sp.r;
          const rekke = plassering(r);
          const forst = rekke[0];
          let tittel;
          let tekst = "";
          let stemning = "jubel";
          if (sp.modus === "mobil") {
            if (forst === 0) {
              tittel = R.t("Du vinner!");
              tekst = R.t("Godt jobba! Du ble kvitt kortene først.");
            } else if (r.narr === 0) {
              tittel = R.t("Du ble narren!");
              tekst = R.t("Godt kjempa! Neste gang er det mobilens tur.");
              stemning = "lei";
            } else {
              tittel = R.t("{navn} vinner!", { navn: navn(sp, forst) });
              tekst = R.t("Du kom på {plass}. plass – og slapp unna narrehatten.", { plass: rekke.indexOf(0) + 1 });
              stemning = "";
            }
          } else {
            tittel = forst == null ? R.t("Ingen vinner denne gangen") : R.t("{navn} vinner!", { navn: navn(sp, forst) });
            tekst = r.narr != null ? R.t("{navn} ble narren.", { navn: navn(sp, r.narr) }) : "";
          }
          const etikett = `${R.flertall(sp.n, "spiller", "spillere")}${sp.modus === "mobil" ? ` · ${NIVANAVN[sp.niva].toLowerCase()}` : ""}`;
          const rek = sp.modus === "mobil" ? rekordHtml(S, sp.niva) : "";
          return `
            ${R.ui.banner({ tittel, etikett, tekst, stemning })}
            ${resultatHtml(sp)}
            ${rek ? `<p class="nr-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "flere" ? sp.n : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🃏" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const r = sp.r;
          const rekke = plassering(r);
          if (!sp.registrert) {
            sp.registrert = true;
            // «Kveldens gjeng» counts people only, never the phone players: first out gets the most.
            const mennesker = rekke.filter((p) => erMenneske(sp, p));
            R.kveld.registrer(mennesker.map((p) => ({ i: p, poeng: sp.n - 1 - rekke.indexOf(p) })));
            R.lagre();
          }
          if (sp.modus === "mobil" && r.narr === 0) lyd.tap();
          else if (sp.modus === "mobil" && rekke[0] !== 0) R.lyd.pling();
          else {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          }
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
      fire(el, e, S) {
        S.oppsett.fire = !S.oppsett.fire;
        R.vis();
      },
      sju(el, e, S) {
        S.oppsett.sju = !S.oppsett.sju;
        R.vis();
      },
      atter(el, e, S) {
        S.oppsett.atter = !S.oppsett.atter;
        R.vis();
      },
      start(el, e, S) {
        S.antall = R.klamp(S.antall || 2, 2, 4);
        nyttSpill(S);
        R.lyd.snu();
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      vis(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.port) return;
        sp.port = false;
        R.lyd.snu();
        R.vis();
      },
      // A card on the hand or an open table card: pick it (to play or to swap).
      kort(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port) return;
        const r = sp.r;
        const k = Number(el.dataset.v);
        const p = meg(sp);
        if (r.fase === "bytte") {
          if (!erMenneske(sp, p) || r.klar[p]) return;
          const paHand = (x) => r.hender[p].includes(x);
          if (sp.bytte == null || sp.bytte === k) sp.bytte = sp.bytte === k ? null : k;
          else if (paHand(sp.bytte) !== paHand(k)) {
            const [h, o] = paHand(k) ? [k, sp.bytte] : [sp.bytte, k];
            if (Idiot.bytt(r, p, h, o)) {
              sp.bytte = null;
              R.lyd.snu();
              R.vibrer(8);
            }
          } else sp.bytte = k;
          return R.vis();
        }
        if (r.fase !== "spill") return;
        if (!erMenneske(sp, r.tur) || r.tur !== p) return R.toast(R.t("Vent litt – {navn} tenker", { navn: navn(sp, r.tur) }));
        const fra = Idiot.kortFra(r, p);
        if (!fra.includes(k)) return R.toast(R.t("Spill hånda først – de åpne kortene kommer etterpå"));
        if (!Idiot.passer(r, rang(k))) {
          rist(el);
          R.si(`${R.t("{kort} passer ikke.", { kort: kortnavn(k) })} ${hintTekst(sp)}`);
          return;
        }
        const like = (x) => rang(x) === rang(k);
        if (sp.valgt.includes(k)) sp.valgt = sp.valgt.filter((x) => x !== k);
        else if (sp.valgt.length && like(sp.valgt[0])) sp.valgt = sp.valgt.concat(k);
        else sp.valgt = fra.filter(like); // all of that rank at once; tap one to leave it out
        R.lyd.klikk();
        R.vis();
      },
      legg(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port) return;
        const r = sp.r;
        const p = meg(sp);
        if (r.fase !== "spill" || r.tur !== p || !erMenneske(sp, p) || !sp.valgt.length) return;
        const kort = sp.valgt.slice();
        if (!Idiot.legg(r, p, kort)) {
          sp.valgt = [];
          return R.vis();
        }
        nyttKort = { k: kort[kort.length - 1], fra: "hand" };
        lydFor(r);
        R.vibrer(10);
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      ta(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port) return;
        const r = sp.r;
        const p = meg(sp);
        if (r.tur !== p || !erMenneske(sp, p)) return;
        if (!Idiot.taOpp(r, p)) {
          if (Idiot.lovlige(r, p).length) R.toast(R.t("Du har et kort som passer – legg det"));
          return;
        }
        lyd.ta();
        R.vibrer([20, 30]);
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      // A hidden table card (data-v = which; none = the first that is left).
      blind(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port) return;
        const r = sp.r;
        const p = meg(sp);
        if (!Idiot.blindt(r, p) || !erMenneske(sp, p)) return;
        const i = el.dataset.v != null ? Number(el.dataset.v) : r.ned[p].findIndex((k) => k != null);
        if (!Idiot.blind(r, p, i)) return;
        const h = r.logg[0];
        if (h && h.ok) nyttKort = { k: h.k, fra: "hand" };
        lydFor(r);
        R.vibrer(h && h.ok ? 10 : [30, 40]);
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      byttferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || sp.r.fase !== "bytte") return;
        const p = meg(sp);
        if (!Idiot.ferdigBytte(sp.r, p)) return;
        sp.bytte = null;
        R.lyd.snu();
        if (sp.modus === "flere" && (sp.r.fase === "bytte" || sp.r.tur !== p)) sp.port = true;
        R.vis();
        planleggMobil(FART.start);
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && S.spill.r.fase === "slutt") avsluttSpill(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const r = sp.r;
        const rekke = plassering(r);
        let tekst;
        let linje1;
        let linje2;
        if (sp.modus === "mobil") {
          const niva = NIVANAVN[sp.niva].toLowerCase();
          const plass = rekke.indexOf(0) + 1;
          tekst = plass === 1 ? R.t("Jeg ble kvitt kortene først i Narren ({niva}). Klarer du det samme?", { niva }) : r.narr === 0 ? R.t("Jeg ble narren i Narren ({niva}). Klarer du bedre?", { niva }) : R.t("Jeg kom på {plass}. plass i Narren ({niva}). Klarer du bedre?", { plass, niva });
          linje1 = plass === 1 ? R.t("Ute først!") : r.narr === 0 ? R.t("Narren") : R.t("{plass}. plass", { plass });
          linje2 = R.t("mot mobilen · {niva}", { niva });
        } else {
          const forst = R.navn(rekke[0]);
          tekst = r.narr != null ? R.t("{navn} vant Narren, og {narr} ble narren! Ta en runde du også.", { navn: forst, narr: R.navn(r.narr) }) : R.t("{navn} vant Narren! Ta en runde du også.", { navn: forst });
          linje1 = R.t("{navn} vinner!", { navn: forst });
          linje2 = R.t("{spillere} på én mobil", { spillere: R.flertall(sp.n, "spiller", "spillere") });
        }
        R.del(R.t("Narren"), tekst, DEL_URL, { kort: { tittel: R.t("Narren"), linjer: [linje1, linje2] } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        if (sp.r.fase === "slutt") return avsluttSpill(S);
        const fortsatt = R.vakt();
        stoppMobil(); // the phone players wait while the sheet is open
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Spillet blir ikke ferdig, og ingen blir narren denne gangen."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return planleggMobil();
        R.statistikk("ferdig", { modus: sp.modus, spillere: sp.n, niva: sp.modus === "mobil" ? sp.niva : 0, trekk: sp.r.trekk, avbrutt: true });
        S.spill = null;
        R.gaTil("hjem");
      },
    }),
  });
})();
