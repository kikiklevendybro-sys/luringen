/* Vri åtter — the Norwegian classic of the Crazy Eights family, for 1–4 players: you against one
   to three phone players, or two to four people passing one phone (the hand hides behind a gate
   between turns). Follow the colour (suit) or the value; an eight goes on anything and changes the
   colour; if you can't play, draw up to three cards, then pass. First with an empty hand wins the
   round. The rules (Vri) and the phone players (Mobil) are pure functions at the top;
   test/vriatter.test.mjs loads this file without the kit. */
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
      { navn: "kløver", rod: false },
    ];
    const BOKSTAV = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const VERDINAVN = ["", "ess", "2", "3", "4", "5", "6", "7", "8", "9", "10", "knekt", "dame", "konge"];
    // «en 7-er», «et ess», «en dame»: for questions like «Har noen en 7-er?»
    const MED_ARTIKKEL = ["", "et ess", "en 2-er", "en 3-er", "en 4-er", "en 5-er", "en 6-er", "en 7-er", "en 8-er", "en 9-er", "en 10-er", "en knekt", "en dame", "en konge"];
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
  // A round: { n, hender: [[card]], stokk (draw pile, top = last), bunke (discard pile, top = last),
  //   sort (the colour to follow), tur, trukket (cards drawn this turn), toer (house rule), straff
  //   (cards the next player must draw), vinner, venter (player who must choose a colour after an
  //   eight), mangler: [[colours]] (known to be missing: a player drew on them), passRad, logg }

  const Vri = (() => {
    const sortAv = (k) => (k / 13) | 0;
    const verdiAv = (k) => (k % 13) + 1;
    const MAKS_TREKK = 3;
    const kortPer = (n) => (n === 2 ? 7 : 5);
    // Points for the cards left on a hand: eight 50, picture cards 10, ace 1, the rest face value.
    const poeng = (k) => {
      const v = verdiAv(k);
      return v === 8 ? 50 : v >= 11 ? 10 : v;
    };
    const handPoeng = (hand) => hand.reduce((s, k) => s + poeng(k), 0);

    function bland(liste, rng) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const topp = (r) => r.bunke[r.bunke.length - 1];
    const kanLegges = (k, toppKort, sort) => verdiAv(k) === 8 || sortAv(k) === sort || verdiAv(k) === verdiAv(toppKort);
    const lovlige = (r, p) => r.hender[p].filter((k) => kanLegges(k, topp(r), r.sort));
    const iTur = (r, p) => r.vinner == null && r.venter == null && r.tur === p;
    const ledige = (r) => r.stokk.length + Math.max(0, r.bunke.length - 1);
    const kanTrekke = (r, p) => iTur(r, p) && r.trukket < MAKS_TREKK && ledige(r) > 0 && !lovlige(r, p).length;
    const kanPasse = (r, p) => iTur(r, p) && !lovlige(r, p).length && !kanTrekke(r, p);

    // o: { n (2–4), start (who begins), toer }. The first card on the table is never an eight: it
    // goes back into the pile and the next one is turned.
    function nyRunde(o, rng) {
      const n = o.n;
      const stokk = bland(Array.from({ length: 52 }, (_, i) => i), rng);
      const hender = Array.from({ length: n }, () => []);
      for (let c = 0; c < kortPer(n); c++) for (let p = 0; p < n; p++) hender[p].push(stokk.pop());
      let forste = stokk.pop();
      while (verdiAv(forste) === 8) {
        stokk.splice(Math.floor(rng() * stokk.length), 0, forste);
        forste = stokk.pop();
      }
      return {
        n,
        hender,
        stokk,
        bunke: [forste],
        sort: sortAv(forste),
        tur: ((o.start || 0) % n + n) % n,
        trukket: 0,
        toer: !!o.toer,
        straff: 0,
        vinner: null,
        venter: null,
        mangler: Array.from({ length: n }, () => []),
        passRad: 0,
        lost: false,
        logg: [],
      };
    }

    // The draw pile is empty: shuffle the discards (all but the top card) into a new one.
    function fyll(r, rng) {
      if (r.stokk.length || r.bunke.length < 2) return;
      const t = r.bunke.pop();
      r.stokk = bland(r.bunke, rng);
      r.bunke = [t];
      r.logg.push({ type: "stokket" });
    }
    function trekkEtt(r, p, rng) {
      fyll(r, rng);
      if (!r.stokk.length) return null;
      const k = r.stokk.pop();
      r.hender[p].push(k);
      return k;
    }

    function neste(r, rng) {
      r.tur = (r.tur + 1) % r.n;
      r.trukket = 0;
      if (r.straff) {
        const p = r.tur;
        let n = 0;
        for (let i = 0; i < r.straff; i++) if (trekkEtt(r, p, rng) != null) n++;
        r.logg.push({ type: "straff", p, n });
        r.straff = 0;
        r.tur = (r.tur + 1) % r.n;
      }
    }

    // Play card k. An eight takes the new colour `sort` (0–3); without it the round waits for
    // velgSort. Returns false for a move that is not allowed.
    function legg(r, p, k, sort, rng) {
      if (!iTur(r, p) || !kanLegges(k, topp(r), r.sort)) return false;
      const i = r.hender[p].indexOf(k);
      if (i < 0) return false;
      r.hender[p].splice(i, 1);
      r.bunke.push(k);
      r.sort = sortAv(k);
      r.passRad = 0;
      r.mangler[p] = r.mangler[p].filter((s) => s !== sortAv(k));
      const h = { type: "legg", p, k };
      r.logg = [h];
      if (!r.hender[p].length) {
        r.vinner = p;
        return true;
      }
      if (verdiAv(k) === 8) {
        if (!(sort >= 0 && sort <= 3)) {
          r.venter = p;
          return true;
        }
        r.sort = sort;
        h.sort = sort;
      }
      if (r.toer && verdiAv(k) === 2) r.straff = 2;
      neste(r, rng);
      return true;
    }

    function velgSort(r, p, sort, rng) {
      if (r.venter !== p || r.vinner != null || !(sort >= 0 && sort <= 3)) return false;
      r.sort = sort;
      r.venter = null;
      const forrige = r.logg[0];
      r.logg = [forrige && forrige.type === "legg" && forrige.p === p ? Object.assign({}, forrige, { sort }) : { type: "vri", p, sort }];
      neste(r, rng);
      return true;
    }

    // Draw one card (only when nothing can be played, at most three a turn). Returns the card.
    function trekk(r, p, rng) {
      if (!kanTrekke(r, p)) return null;
      if (!r.mangler[p].includes(r.sort)) r.mangler[p].push(r.sort);
      r.logg = [];
      const k = trekkEtt(r, p, rng);
      r.trukket++;
      r.passRad = 0;
      r.logg.push({ type: "trekk", p, k, nr: r.trukket });
      return k;
    }

    // Pass: after three cards drawn (or with nothing left to draw) and still nothing to play.
    // If everybody passes in a row with nothing to draw, the round is locked: the fewest cards wins.
    function pass(r, p, rng) {
      if (!kanPasse(r, p)) return false;
      if (!r.mangler[p].includes(r.sort)) r.mangler[p].push(r.sort);
      r.logg = [{ type: "pass", p }];
      r.passRad = ledige(r) ? 0 : r.passRad + 1;
      if (r.passRad >= r.n) {
        let best = 0;
        for (let q = 1; q < r.n; q++) {
          const a = r.hender[q], b = r.hender[best];
          if (a.length < b.length || (a.length === b.length && handPoeng(a) < handPoeng(b))) best = q;
        }
        r.vinner = best;
        r.lost = true;
        return true;
      }
      neste(r, rng);
      return true;
    }

    // The winner's points: what is left on the other hands.
    const gevinst = (r) => (r.vinner == null ? 0 : r.hender.reduce((s, h, q) => s + (q === r.vinner ? 0 : handPoeng(h)), 0));

    // Every card exactly once (for checking a restored round).
    function hel(r) {
      if (!r || !Array.isArray(r.hender) || !Array.isArray(r.stokk) || !Array.isArray(r.bunke) || !r.bunke.length) return false;
      if (r.hender.length !== r.n || r.n < 2 || r.n > 4 || !Array.isArray(r.mangler) || r.mangler.length !== r.n) return false;
      const alle = [].concat(...r.hender, r.stokk, r.bunke);
      if (alle.length !== 52 || new Set(alle).size !== 52 || !alle.every((k) => Number.isInteger(k) && k >= 0 && k < 52)) return false;
      return Number.isInteger(r.tur) && r.tur >= 0 && r.tur < r.n && r.sort >= 0 && r.sort <= 3;
    }

    return { sortAv, verdiAv, MAKS_TREKK, kortPer, poeng, handPoeng, bland, topp, kanLegges, lovlige, iTur, ledige, kanTrekke, kanPasse, nyRunde, legg, velgSort, trekk, pass, gevinst, hel };
  })();

  // ---------- The phone players ----------
  // 1 Lett: any legal card, any colour. 2 Middels: keeps its eights for when nothing else goes,
  // plays from the colour it holds most of and turns to it. 3 Vanskelig: also counts the cards that
  // are gone, remembers which colours the others had to draw on, and blocks the next player –
  // harder still when that player is close to winning. Only what a player at the table can know
  // is used: its own hand, the discards, how many cards the others hold and who drew on what.

  const Mobil = (() => {
    const { sortAv, verdiAv, lovlige, kanTrekke, topp, poeng } = Vri;

    // Cards of each colour still unseen from p's chair (not in the discards, not on p's hand).
    function ukjente(r, p) {
      const u = [13, 13, 13, 13];
      for (const k of r.bunke) u[sortAv(k)]--;
      for (const k of r.hender[p]) u[sortAv(k)]--;
      return u;
    }

    function bestSort(r, p, rest, niva, rng) {
      if (niva <= 1) return Math.floor(rng() * 4);
      const neste = (p + 1) % r.n;
      const u = ukjente(r, p);
      let best = 0, bestV = -Infinity;
      for (let s = 0; s < 4; s++) {
        let v = rest.filter((k) => sortAv(k) === s && verdiAv(k) !== 8).length * 2;
        if (niva >= 3) {
          if (r.mangler[neste].includes(s)) v += r.hender[neste].length <= 2 ? 6 : 3;
          v += (13 - u[s]) * 0.25;
        }
        v += rng() * 0.01;
        if (v > bestV) {
          bestV = v;
          best = s;
        }
      }
      return best;
    }

    // { type: "legg", k, sort } | { type: "trekk" } | { type: "pass" } — always a legal move.
    function velg(r, p, niva, rng) {
      rng = rng || Math.random;
      const L = lovlige(r, p);
      if (!L.length) return kanTrekke(r, p) ? { type: "trekk" } : { type: "pass" };
      const hand = r.hender[p];
      const ut = (k) => ({ type: "legg", k, sort: verdiAv(k) === 8 && hand.length > 1 ? bestSort(r, p, hand.filter((x) => x !== k), niva, rng) : undefined });
      if (niva <= 1) return ut(L[Math.floor(rng() * L.length)]);
      const vanlige = L.filter((k) => verdiAv(k) !== 8);
      if (!vanlige.length) return ut(L[0]);
      const neste = (p + 1) % r.n;
      const nesteFa = r.hender[neste].length;
      const u = niva >= 3 ? ukjente(r, p) : null;
      const verdi = (k) => {
        const s = sortAv(k);
        const rest = hand.filter((x) => x !== k);
        let v = rest.filter((x) => sortAv(x) === s && verdiAv(x) !== 8).length * 2;
        v += rest.filter((x) => verdiAv(x) === verdiAv(k)).length * 0.6;
        if (niva >= 3) {
          const press = nesteFa <= 2 ? 2.5 : 1;
          if (r.mangler[neste].includes(s)) v += 4 * press;
          v += (13 - u[s]) * 0.3 * press;
          v += poeng(k) / 20;
          if (r.toer && verdiAv(k) === 2) v += 2 * press;
        }
        return v + rng() * 0.01;
      };
      // Vanskelig: the next player is about to go out and can't follow a known colour – turn to it.
      if (niva >= 3 && nesteFa === 1 && L.some((k) => verdiAv(k) === 8)) {
        const blokk = vanlige.some((k) => r.mangler[neste].includes(sortAv(k)));
        if (!blokk && r.mangler[neste].length) {
          const atter = L.find((k) => verdiAv(k) === 8);
          return { type: "legg", k: atter, sort: r.mangler[neste][0] };
        }
      }
      let best = vanlige[0], bestV = -Infinity;
      for (const k of vanlige) {
        const v = verdi(k);
        if (v > bestV) {
          bestV = v;
          best = k;
        }
      }
      return ut(best);
    }

    // Plays one whole move for p (draws until it can play or must pass). For simulations.
    function spillTur(r, p, niva, rng) {
      for (let n = 0; n < 6; n++) {
        const v = velg(r, p, niva, rng);
        if (v.type === "legg") return Vri.legg(r, p, v.k, v.sort, rng);
        if (v.type === "pass") return Vri.pass(r, p, rng);
        if (Vri.trekk(r, p, rng) == null) return false;
      }
      return false;
    }

    return { velg, spillTur, ukjente, topp };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules, the phone players and the cards.
    window.VriAtter = { Vri, Mobil, KORT };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { sortAv, verdiAv } = Vri;
  const NIVANAVN = { 1: "Lett", 2: "Middels", 3: "Vanskelig" };
  const NIVATEKST = {
    1: "Mobilen legger det som passer, helt tilfeldig. Fint for de minste.",
    2: "Mobilen sparer på åtterne og spiller fargen den har mest av.",
    3: "Mobilen teller kort, husker hva dere mangler og blokkerer. Klarer du å slå den?",
  };
  const MAL = {
    tre: { navn: "Først til 3", tekst: "Den som først vinner tre runder, vinner." },
    poeng: { navn: "100 poeng", tekst: "Vinneren av runden får poeng for kortene de andre sitter igjen med. Først til 100 vinner." },
    en: { navn: "Én runde", tekst: "Én runde – den som først blir kvitt kortene, vinner." },
  };
  const MAL_POENG = 100;
  const VERDIORD = ["", "ess", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "knekt", "dame", "konge"];
  const VERDI_EN = ["", "et ess", "en toer", "en treer", "en firer", "en femmer", "en sekser", "en sjuer", "en åtter", "en nier", "en tier", "en knekt", "en dame", "en konge"];
  const FARGENAVN = ["spar", "hjerter", "ruter", "kløver"];
  const Farge = (s) => FARGENAVN[s].charAt(0).toUpperCase() + FARGENAVN[s].slice(1);
  // «hjerter åtte», «spar dame»
  const kortnavn = (k) => `${FARGENAVN[sortAv(k)]} ${VERDIORD[verdiAv(k)]}`;
  const FART = { legg: 950, trekk: 650, start: 900 }; // ms per move of a phone player
  const DEL_URL = "https://rusj.no/vriatter/";
  let H;

  // S.spill: { id, modus ("mobil" | "flere"), niva, n, mal, toer, runde, starter, poeng [per seat],
  //   r (the round, see Vri), resultat { vinner, gevinst, rester } | null, port (hot seat: the hand
  //   waits behind «Vis kortene mine»), ferdig, registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMenneske = (sp, p) => sp.modus === "flere" || p === 0;
  const navn = (sp, p) => (sp.modus === "flere" ? R.navn(p) : p === 0 ? "Du" : sp.n === 2 ? "Mobilen" : `Mobil ${p}`);
  const avatar = (sp, p, str) => R.avatar(sp.modus === "flere" ? p : p === 0 ? 0 : 9 + p, str);
  // The seat whose hand is shown: you against the phone, or the one whose turn it is.
  const meg = (sp) => (sp.modus === "flere" ? sp.r.tur : 0);
  const rundeFerdig = (sp) => sp.r.vinner != null;
  const kampVunnet = (sp) => {
    if (sp.mal === "en") return sp.runde >= 1 && !!sp.resultat;
    const grense = sp.mal === "poeng" ? MAL_POENG : 3;
    return sp.poeng.some((x) => x >= grense);
  };
  const enhet = (sp, n) => (sp.mal === "poeng" ? R.flertall(n, "poeng", "poeng") : R.flertall(n, "seier", "seirer"));
  const rng = () => R.rng(R.nyttFro());

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.tone(520, 0, 0.06, "triangle", 0.1);
      R.lyd.stoy(0, 0.08, 0.14, 2400);
    },
    trekk: () => R.lyd.stoy(0, 0.12, 0.12, 1600),
    vri: () => {
      R.lyd.tone(392, 0, 0.12, "triangle", 0.12);
      R.lyd.tone(587, 0.1, 0.22, "triangle", 0.12);
    },
    tap: () => {
      R.lyd.tone(392, 0, 0.2, "triangle", 0.12);
      R.lyd.tone(311, 0.18, 0.4, "triangle", 0.11);
    },
  };

  // ---------- Texts from what happened ----------
  function hendelseTekst(sp, h) {
    const hvem = navn(sp, h.p);
    const du = !(sp.modus === "flere") && h.p === 0;
    switch (h.type) {
      case "legg":
        return `${hvem} la ${kortnavn(h.k)}${h.sort != null ? ` og vrir til ${FARGENAVN[h.sort]}` : ""}.`;
      case "vri":
        return `${hvem} vrir til ${FARGENAVN[h.sort]}.`;
      case "trekk":
        if (h.k == null) return `${hvem} fikk ikke trukket – bunken er tom.`;
        return du || (sp.modus === "flere" && h.p === meg(sp)) ? `${hvem} trakk ${kortnavn(h.k)}.` : `${hvem} trakk et kort.`;
      case "pass":
        return du ? "Du står over." : `${hvem} står over.`;
      case "straff":
        return `${hvem} må trekke ${R.flertall(h.n, "kort", "kort")} og står over.`;
      case "stokket":
        return "Kortene er stokket til en ny bunke.";
      default:
        return "";
    }
  }
  const sistTekst = (sp) => (sp.r.logg || []).map((h) => hendelseTekst(sp, h)).filter(Boolean).join(" ");

  // What can I play? «Legg en ruter, en femmer eller en åtter.»
  function hintTekst(sp) {
    const r = sp.r;
    const t = Vri.topp(r);
    const valg = [`en ${FARGENAVN[r.sort]}`];
    if (verdiAv(t) !== 8) valg.push(VERDI_EN[verdiAv(t)]);
    valg.push("en åtter");
    return `Legg ${valg.slice(0, -1).join(", ")} eller ${valg[valg.length - 1]}.`;
  }

  function meldingTekst(sp) {
    const r = sp.r;
    if (rundeFerdig(sp)) return "";
    const p = r.tur;
    if (r.venter != null) return erMenneske(sp, r.venter) ? "Hvilken farge vrir du til?" : `${navn(sp, r.venter)} vrir …`;
    if (!erMenneske(sp, p)) return `${navn(sp, p)} tenker …`;
    if (Vri.lovlige(r, p).length) return hintTekst(sp);
    if (Vri.kanTrekke(r, p)) return r.trukket ? `Fortsatt ingenting å legge. Trekk igjen (${r.trukket} av 3).` : "Du har ingenting å legge. Trekk et kort.";
    return r.trukket ? "Ingenting passet etter tre kort. Du må stå over." : "Ingenting å legge, og bunken er tom. Du må stå over.";
  }

  // ---------- Flow ----------

  function nyKamp(S) {
    const o = S.oppsett;
    const n = o.modus === "mobil" ? 1 + o.mobiler : R.klamp(S.antall || 2, 2, 4);
    S.spill = {
      id: R.nyttFro() % 1e9,
      modus: o.modus,
      niva: o.niva,
      n,
      mal: o.mal,
      toer: !!o.toer,
      runde: 0,
      starter: o.modus === "mobil" ? n - 1 : R.heltall(0, n - 1) - 1, // round 1: you (or someone at random) begin
      poeng: Array(n).fill(0),
      r: null,
      resultat: null,
      port: false,
      ferdig: false,
      registrert: false,
    };
    nyRunde(S);
    R.statistikk("start", { modus: o.modus, spillere: n, niva: o.modus === "mobil" ? o.niva : 0, mal: o.mal, toer: !!o.toer });
  }

  function nyRunde(S) {
    const sp = S.spill;
    sp.runde++;
    sp.starter = (sp.starter + 1) % sp.n; // who begins goes round the table
    sp.r = Vri.nyRunde({ n: sp.n, start: sp.starter, toer: sp.toer }, rng());
    sp.resultat = null;
    sp.port = sp.modus === "flere";
    nyttKort = null;
  }

  // After every move: the round may be over.
  function etterTrekk(S) {
    const sp = S.spill;
    const r = sp.r;
    if (rundeFerdig(sp) && !sp.resultat) {
      const v = r.vinner;
      const gevinst = Vri.gevinst(r);
      sp.poeng[v] += sp.mal === "poeng" ? gevinst : 1;
      sp.resultat = { vinner: v, gevinst, rester: r.hender.map((h) => Vri.handPoeng(h)) };
      sp.port = false;
      if (sp.modus === "mobil") {
        const rek = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, tap: 0 });
        if (v === 0) rek.seier++;
        else rek.tap++;
      }
      const fortsatt = R.vakt();
      setTimeout(() => {
        if (!fortsatt()) return;
        if (sp.modus === "mobil" && v !== 0) lyd.tap();
        else {
          R.lyd.riktig();
          R.vibrer([30, 50, 80]);
          if (kampVunnet(sp)) R.konfetti();
        }
      }, 420);
      return;
    }
    if (sp.modus === "flere" && r.venter == null) sp.port = true;
  }

  function avsluttKamp(S) {
    const sp = S.spill;
    stoppMobil();
    sp.ferdig = true;
    R.statistikk("ferdig", { modus: sp.modus, spillere: sp.n, niva: sp.modus === "mobil" ? sp.niva : 0, runder: sp.runde - (sp.resultat ? 0 : 1), mal: sp.mal });
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
    if (mobilId || !sp || sp.ferdig || S.skjerm !== "spill" || rundeFerdig(sp)) return;
    const p = sp.r.venter != null ? sp.r.venter : sp.r.tur;
    if (erMenneske(sp, p)) return;
    mobilId = setTimeout(mobilSteg, ms != null ? ms : FART.legg);
  }
  function mobilSteg() {
    mobilId = null;
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || rundeFerdig(sp)) return;
    const r = sp.r;
    const p = r.tur;
    if (erMenneske(sp, p) || r.venter != null) return;
    // Never behind a sheet (rules, «Avslutt?»), a countdown or a hidden tab: wait and look again.
    if (R.arkApent() || document.hidden || dra) return planleggMobil(500);
    const v = Mobil.velg(r, p, sp.niva, Math.random);
    let ok = false;
    if (v.type === "legg") {
      ok = Vri.legg(r, p, v.k, v.sort, rng());
      if (ok) {
        nyttKort = { k: v.k, fra: "topp" };
        lyd.legg();
        if (v.sort != null && !rundeFerdig(sp)) setTimeout(lyd.vri, 260);
      }
    } else if (v.type === "trekk") {
      Vri.trekk(r, p, rng());
      ok = true;
      lyd.trekk();
    } else ok = Vri.pass(r, p, rng());
    if (!ok) return;
    etterTrekk(S);
    R.vis();
    planleggMobil(v.type === "trekk" ? FART.trekk : FART.legg);
  }

  // ---------- Markup ----------

  let nyttKort = null; // { k, fra: "hand" | "topp" } — the card that lands on the pile on the next draw
  let nyIHand = null; // the card just drawn into the shown hand

  const fargeIkon = (s, str) => `<svg class="vr-ikon" viewBox="0 0 100 100" aria-hidden="true" focusable="false" style="--str:${str || 20}px"><g fill="${KORT.farge(s * 13)}">${KORT.symbol(s, 0, 0, 100)}</g></svg>`;

  // The others around the table, in the order they play after the one whose hand is shown.
  function andreHtml(sp) {
    const r = sp.r;
    const ferdig = rundeFerdig(sp);
    const vis = meg(sp);
    const seter = [];
    for (let d = 1; d <= sp.n; d++) {
      const p = (vis + d) % sp.n;
      if (p === vis && !(ferdig && sp.modus === "flere")) continue;
      seter.push(p);
    }
    const aktiv = ferdig ? -1 : r.venter != null ? r.venter : r.tur;
    return `<ul class="vr-andre" aria-label="Rundt bordet">${seter
      .map((p) => {
        const n = r.hender[p].length;
        const vant = ferdig && r.vinner === p;
        const tenker = p === aktiv && !erMenneske(sp, p);
        const rygger = Array.from({ length: Math.min(n, 7) }, (_, i) => `<i style="--i:${i}"></i>`).join("");
        const poeng = sp.mal === "en" ? "" : `<span class="vr-p">${esc(enhet(sp, sp.poeng[p]))}</span>`;
        return `<li class="vr-plass${p === aktiv ? " aktiv" : ""}${vant ? " vant" : ""}">
          <span class="vr-ava">${avatar(sp, p)}${tenker ? '<span class="vr-tenker" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}</span>
          <span class="vr-info"><b class="vr-navn">${esc(navn(sp, p))}</b><span class="vr-antall"><span class="vr-rygger" aria-hidden="true" style="--n:${Math.min(n, 7)}">${rygger}</span>${esc(R.flertall(n, "kort", "kort"))}</span>${poeng}</span>
        </li>`;
      })
      .join("")}</ul>`;
  }

  function bordHtml(sp) {
    const r = sp.r;
    const t = Vri.topp(r);
    const p = meg(sp);
    const kanTrekke = erMenneske(sp, r.tur) && Vri.kanTrekke(r, r.tur);
    const igjen = r.stokk.length;
    const ny = nyttKort && nyttKort.k === t ? nyttKort : null;
    nyttKort = null;
    const under = r.bunke.length > 1 ? KORT.html(r.bunke[r.bunke.length - 2], { opp: true, klasse: "vr-under" }) : "";
    const vridd = r.sort !== sortAv(t) || verdiAv(t) === 8;
    const velger = r.venter != null && erMenneske(sp, r.venter) && r.venter === p;
    return `<div class="vr-bord${velger ? " velger" : ""}">
      <button class="vr-stokk${kanTrekke ? " klar" : ""}" data-h="trekk" aria-label="Bunken, ${esc(R.flertall(igjen, "kort", "kort"))}${kanTrekke ? ". Trekk et kort" : ""}"${kanTrekke ? "" : ' aria-disabled="true"'}>
        ${igjen ? KORT.html(null, { klasse: "vr-stokkort" }) : '<span class="vr-tom" aria-hidden="true"></span>'}
        <span class="vr-tall" aria-hidden="true">${igjen}</span>
      </button>
      <div class="vr-haug" id="vr-haug" role="img" aria-label="Øverst ligger ${esc(kortnavn(t))}. Fargen er ${esc(FARGENAVN[r.sort])}.">
        ${under}${KORT.html(t, { opp: true, stor: true, klasse: `vr-topp${ny ? " ny fra-" + ny.fra : ""}` })}
        ${vridd && r.venter == null ? `<span class="vr-vridd" aria-hidden="true">${fargeIkon(r.sort, 22)}<b>${esc(Farge(r.sort))}</b></span>` : ""}
      </div>
      ${
        velger
          ? `<div class="vr-velg" role="group" aria-labelledby="vr-velg-t"><h2 id="vr-velg-t">Vri til</h2><div class="vr-velg-rad">${[1, 2, 0, 3]
              .map((s) => `<button class="vr-farge" data-h="farge" data-v="${s}"${s === 1 ? " data-fokus" : ""}>${fargeIkon(s, 34)}<span>${Farge(s)}</span></button>`)
              .join("")}</div></div>`
          : ""
      }
    </div>`;
  }

  // The shown hand: sorted by colour (alternating red and black) and value. Cards that can be
  // played stand up a little; the rest are marked as not playable.
  const REKKE = [0, 1, 3, 2]; // spar, hjerter, kløver, ruter
  const sorter = (hand) => hand.slice().sort((a, b) => REKKE.indexOf(sortAv(a)) - REKKE.indexOf(sortAv(b)) || verdiAv(a) - verdiAv(b));
  function handHtml(sp) {
    const r = sp.r;
    const p = meg(sp);
    const minTur = Vri.iTur(r, p) && erMenneske(sp, p);
    const lov = new Set(minTur ? Vri.lovlige(r, p) : []);
    const ny = nyIHand;
    nyIHand = null;
    const hand = sorter(r.hender[p]);
    return `<div class="vr-hand${minTur ? " min-tur" : ""}" role="group" aria-label="${sp.modus === "flere" ? esc(`Kortene til ${navn(sp, p)}`) : "Kortene dine"}" style="--n:${hand.length}">${hand
      .map((k, i) => {
        const ok = lov.has(k);
        return `<button class="vr-hk${ok ? " lovlig" : ""}${k === ny ? " ny" : ""}" data-h="legg" data-v="${k}" data-k="${k}" aria-label="${esc(kortnavn(k))}"${ok ? "" : ' aria-disabled="true"'} style="--i:${i}">${KORT.html(k, { opp: true })}</button>`;
      })
      .join("")}</div>`;
  }

  function resultatHtml(sp) {
    const r = sp.r;
    const res = sp.resultat;
    const v = res.vinner;
    const rader = [];
    for (let d = 0; d < sp.n; d++) {
      const p = (v + d) % sp.n;
      const h = sorter(r.hender[p]);
      rader.push(`<li class="${p === v ? "vant" : ""}">${avatar(sp, p)}<b>${esc(navn(sp, p))}</b>${
        p === v
          ? `<span class="vr-ut">${sp.mal === "poeng" ? `+${esc(res.gevinst)} poeng` : "Ute!"}</span>`
          : `<span class="vr-rest" aria-label="${esc(h.map(kortnavn).join(", "))}">${h.map((k) => KORT.html(k, { opp: true })).join("")}</span>${sp.mal === "poeng" ? `<span class="vr-pt">${esc(res.rester[p])}</span>` : ""}`
      }</li>`);
    }
    return `<ul class="vr-resultat" aria-label="Kortene som ble igjen">${rader.join("")}</ul>`;
  }

  function resultatTittel(sp) {
    const v = sp.resultat.vinner;
    const lost = sp.r.lost ? "Ingen kom videre – færrest kort vinner. " : "";
    if (kampVunnet(sp) && sp.mal !== "en") return lost + (sp.modus === "mobil" ? (v === 0 ? "Du vinner kampen!" : `${navn(sp, v)} vinner kampen!`) : `${navn(sp, v)} vinner kampen!`);
    if (sp.modus === "mobil") return lost + (v === 0 ? "Du ble kvitt alle kortene!" : `${navn(sp, v)} ble kvitt kortene først.`);
    return lost + `${navn(sp, v)} ble kvitt alle kortene!`;
  }

  // A small line of the score under the title of the table (not in «Én runde»).
  function stillingTekst(sp) {
    if (sp.mal === "en") return "";
    const mal = sp.mal === "poeng" ? `først til ${MAL_POENG} poeng` : "først til 3 seirer";
    return `${esc(navn(sp, meg(sp)))}: ${esc(enhet(sp, sp.poeng[meg(sp)]))} · ${mal}`;
  }

  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const ferdig = rundeFerdig(sp);
    if (sp.port && !ferdig) {
      const sist = sistTekst(sp);
      return `${sist ? `<p class="vr-sist-port" role="status">${esc(sist)}</p>` : ""}
        ${R.ui.giTil({ i: r.tur, h: "vis", knapp: "Vis kortene mine", tekst: r.logg.length ? "Gi mobilen til" : `Runde ${sp.runde} – gi mobilen til`, advarsel: "De andre ser bort", prikker: [sp.n, r.tur] })}`;
    }
    const p = meg(sp);
    const minTur = !ferdig && erMenneske(sp, r.tur) && r.venter == null;
    const kanTrekke = minTur && Vri.kanTrekke(r, r.tur);
    const kanPasse = minTur && Vri.kanPasse(r, r.tur);
    const sist = sistTekst(sp);
    const melding = ferdig ? resultatTittel(sp) : meldingTekst(sp);
    let hoved = "";
    if (ferdig) hoved = kampVunnet(sp) ? R.ui.knapp("Se kåringen", "kaaring", { ikon: "🏆" }) : R.ui.knapp("Ny runde", "runde", { ikon: "🃏" });
    else if (kanPasse) hoved = R.ui.knapp("Stå over", "pass");
    else hoved = R.ui.knapp(r.trukket && kanTrekke ? `Trekk igjen (${r.trukket} av 3)` : "Trekk et kort", "trekk", { av: !kanTrekke });
    const stilling = stillingTekst(sp);
    return `
      <h1 class="vh" id="skjerm-tittel">Vri åtter, runde ${sp.runde}</h1>
      ${ferdig ? "" : andreHtml(sp)}
      ${bordHtml(sp)}
      <div class="vr-melding${ferdig ? " ferdig" : minTur ? " din" : ""}" role="status">
        ${sist && !ferdig ? `<span class="vr-sist">${esc(sist)}</span>` : ""}
        <b>${esc(melding)}</b>
      </div>
      ${ferdig ? resultatHtml(sp) : handHtml(sp)}
      ${stilling && !ferdig ? `<p class="vr-stilling">${stilling}</p>` : ""}
      ${R.ui.dokk(hoved, R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${r.seier === 1 ? "seier" : "seirer"}</span><span><b>${r.tap}</b> tap</span>`;
  }

  // ---------- Dragging a card onto the pile ----------
  let dra = null;
  let sistDra = -1e9;
  const TERSKEL = { mouse: 5, pen: 6, touch: 8 };
  document.addEventListener("pointerdown", (e) => {
    const S = R.S;
    if (dra || !S || S.skjerm !== "spill" || !S.spill || (e.button != null && e.button > 0)) return;
    const el = e.target.closest && e.target.closest(".vr-hk.lovlig");
    if (!el) return;
    dra = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, el, kort: el.querySelector(".sk-kort"), aktiv: false };
  });
  document.addEventListener("pointermove", (e) => {
    if (!dra || e.pointerId !== dra.id) return;
    const dx = e.clientX - dra.x0;
    const dy = e.clientY - dra.y0;
    if (!dra.aktiv) {
      if (Math.hypot(dx, dy) < (TERSKEL[dra.type] || 6)) return;
      dra.aktiv = true;
      dra.el.classList.add("drar");
      try {
        dra.el.setPointerCapture(e.pointerId);
      } catch (feil) {
        /* not every pointer can be captured */
      }
      R.vibrer(6);
    }
    e.preventDefault();
    dra.kort.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-12, Math.min(12, dx / 12))}deg)`;
    const haug = R.$("#vr-haug");
    if (haug) haug.classList.toggle("mal", over(haug, e));
  });
  const over = (el, e) => {
    const b = el.getBoundingClientRect();
    const m = 24;
    return e.clientX > b.left - m && e.clientX < b.right + m && e.clientY > b.top - m && e.clientY < b.bottom + m;
  };
  function sluttDra(e, avbrutt) {
    if (!dra || e.pointerId !== dra.id) return;
    const d = dra;
    dra = null;
    if (!d.aktiv) return; // a tap: the click plays the card
    sistDra = performance.now();
    const haug = R.$("#vr-haug");
    if (haug) haug.classList.remove("mal");
    d.el.classList.remove("drar");
    if (!avbrutt && haug && over(haug, e) && spillKort(R.S, Number(d.el.dataset.k), "dra")) return;
    d.kort.style.transform = "";
    if (!avbrutt) R.lyd.feil();
  }
  document.addEventListener("pointerup", (e) => sluttDra(e, false));
  document.addEventListener("pointercancel", (e) => sluttDra(e, true));
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest && e.target.closest(".vr-hand")) e.preventDefault();
  });

  // Play card k from the shown hand. Returns true if it was played.
  function spillKort(S, k, hvordan) {
    const sp = S && S.spill;
    if (!sp || sp.ferdig || sp.port || rundeFerdig(sp)) return false;
    const r = sp.r;
    const p = meg(sp);
    if (!erMenneske(sp, p) || !Vri.iTur(r, p)) return false;
    if (!Vri.legg(r, p, k, undefined, rng())) return false;
    nyttKort = { k, fra: hvordan === "dra" ? "dra" : "hand" };
    lyd.legg();
    R.vibrer(10);
    etterTrekk(S);
    R.vis();
    planleggMobil();
    return true;
  }

  // ---------- Screens ----------

  R.start({
    id: "vriatter",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", mobiler: 1, niva: 2, mal: "tre", toer: false },
      spill: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", mobiler: 1, niva: 2, mal: "tre", toer: false }, S.oppsett));
      if (!["mobil", "flere"].includes(o.modus)) o.modus = "mobil";
      if (![1, 2, 3].includes(o.mobiler)) o.mobiler = 1;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (!MAL[o.mal]) o.mal = "tre";
      o.toer = !!o.toer;
      S.antall = R.klamp(S.antall || 2, 2, 4);
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const ok = ["mobil", "flere"].includes(sp.modus) && MAL[sp.mal] && Vri.hel(sp.r) && sp.r.n === sp.n && Array.isArray(sp.poeng) && sp.poeng.length === sp.n;
        if (!ok) S.spill = null;
        else {
          if (sp.r.vinner == null) sp.resultat = null;
          // A reload on a hot seat: whoever holds the phone now must show it is them again.
          if (sp.modus === "flere" && !sp.ferdig && sp.r.vinner == null && sp.r.venter == null) sp.port = true;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: "Bli kvitt alle kortene dine først. Alle får fem kort (sju når dere er to), og ett kort snus på bordet.",
      steg: [
        ["Følg farge eller tall", "Legg et kort i samme farge (hjerter, ruter, spar eller kløver) eller med samme tall som kortet øverst. Trykk på kortet – eller dra det til bordet."],
        ["Åtteren vrir", "En åtter kan legges på hva som helst. Da velger du hvilken farge den neste må følge."],
        ["Trekk opptil tre", "Har du ingenting å legge, trekker du ett kort om gangen – opptil tre. Passer ikke noe da heller, står du over."],
      ],
      tips: [
        "Den som først blir kvitt alle kortene sine, vinner runden.",
        "Først til 3: Den som først vinner tre runder, vinner kampen.",
        "100 poeng: Vinneren av runden får poeng for kortene de andre har igjen – åtter 50, bildekort 10, ess 1 og resten det tallet de viser. Først til 100 vinner.",
        "Spar på åtterne! De redder deg når ingenting annet passer.",
        "Snus en åtter først, stokkes den inn igjen og et nytt kort snus.",
        "Er bunken tom, stokkes kortene på bordet (unntatt det øverste) til en ny bunke.",
        "Husregel «Toer»: Legger noen en toer, må den neste trekke to kort og står over. Den er av som standard.",
        "Flere på én mobil: Kortene skjules mellom hver tur. Trykk «Vis kortene mine» når du har fått mobilen.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = [1, 2, 3].map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          return (
            R.ui.spillhjem({
              slagordHtml: "Følg farge eller tall.<br><em>Åtteren vrir alt.</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? `Fortsett · runde ${sp.runde}` : "",
                ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
              }),
              merker: [
                ["1–4", "spillere"],
                ["3", "nivåer"],
                ["0", "reklame"],
              ],
            }) +
            (rek.length ? `<section class="vr-rekorder" aria-label="Mot mobilen"><p class="etikett">Mot mobilen</p><ul>${rek.map(([n, h]) => `<li><b class="vr-niva">${NIVANAVN[n]}</b>${h}</li>`).join("")}</ul></section>` : "")
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <h2>Hvordan vil dere spille?</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: "Mot mobilen", tekst: "Du mot 1–3 mobilspillere" },
                  { v: "flere", ikon: "👥", tittel: "Flere på én mobil", tekst: "2–4 spillere sender mobilen rundt" },
                ],
                o.modus,
              )}
            </section>
            ${
              o.modus === "mobil"
                ? `<section class="seksjon">
                    <h2>Hvor mange mobilspillere?</h2>
                    ${R.ui.seg("mobiler", [[1, "1"], [2, "2"], [3, "3"]], o.mobiler, { etikett: "Antall mobilspillere" })}
                  </section>
                  <section class="seksjon">
                    <h2>Hvor flink er mobilen?</h2>
                    ${R.ui.seg("niva", [[1, "Lett"], [2, "Middels"], [3, "Vanskelig"]], o.niva, { etikett: "Nivå" })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>`
                : R.ui.spillere({ min: 2, max: 4, tittel: "Hvem spiller?", hjelp: "Kortene skjules mellom hver tur, så ingen ser de andres." })
            }
            <section class="seksjon">
              <h2>Hvor lenge?</h2>
              ${R.ui.seg("mal", Object.keys(MAL).map((m) => [m, MAL[m].navn]), o.mal, { etikett: "Hvor lenge" })}
              <p class="hjelp">${esc(MAL[o.mal].tekst)}</p>
            </section>
            <section class="seksjon">
              <h2>Husregel</h2>
              ${R.ui.bryter("toer", o.toer, "Toer: neste trekker to", "Legger noen en toer, må den neste trekke to kort og står over.")}
            </section>
            ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor", ikon: "🃏" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? `Runde ${S.spill.runde}` : ""),
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
          dra = null;
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = Array.from({ length: sp.n }, (_, p) => ({ navn: navn(sp, p), i: sp.modus === "flere" ? p : p === 0 ? 0 : 9 + p, poeng: sp.poeng[p] }));
          const topp = Math.max(...sp.poeng);
          const vinnere = rader.filter((x, p) => sp.poeng[p] === topp && topp > 0).map((x) => x.navn);
          const duVant = sp.modus === "mobil" && vinnere.length === 1 && sp.poeng[0] === topp;
          const mobilVant = sp.modus === "mobil" && topp > 0 && !duVant && sp.poeng[0] < topp;
          let tittel;
          if (!vinnere.length) tittel = "Ingen vinner denne gangen";
          else if (duVant) tittel = "Du vinner!";
          else if (sp.modus === "mobil" && vinnere.length === 1) tittel = `${vinnere[0]} vinner!`;
          else tittel = vinnere.length === 1 ? `${vinnere[0]} vinner!` : `${R.ramsOpp(vinnere)} vinner!`;
          const runder = sp.runde - (sp.resultat ? 0 : 1);
          const etikett = `${R.flertall(runder, "runde", "runder")}${sp.modus === "mobil" ? ` · ${NIVANAVN[sp.niva].toLowerCase()}` : ""}`;
          const tekst = mobilVant ? "Godt kjempa! Neste gang er åtterne på din side." : duVant ? "Godt jobba!" : "";
          const rek = sp.modus === "mobil" ? rekordHtml(S, sp.niva) : "";
          return `
            ${R.ui.banner({ tittel, etikett, tekst, stemning: mobilVant || !vinnere.length ? "lei" : "jubel" })}
            ${sp.mal !== "en" && sp.n > 2 ? R.ui.pall(rader, { enhet: sp.mal === "poeng" ? "p" : "" }) : ""}
            ${R.ui.poengliste(rader)}
            ${rek ? `<p class="vr-rekordlinje"><span class="etikett">Mot mobilen · ${NIVANAVN[sp.niva].toLowerCase()}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "flere" ? sp.n : 1 })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen", { ikon: "🃏" }), R.ui.lenkerad(R.ui.lenke("Del resultatet", "del"), R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
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
          const topp = Math.max(...sp.poeng);
          if (sp.modus === "mobil" && sp.poeng[0] < topp) lyd.tap();
          else if (topp > 0) {
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
        S.oppsett.mal = MAL[el.dataset.v] ? el.dataset.v : "tre";
        R.vis();
      },
      toer(el, e, S) {
        S.oppsett.toer = !S.oppsett.toer;
        R.vis();
      },
      start(el, e, S) {
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
      legg(el, e, S) {
        if (performance.now() - sistDra < 450) return; // the click after a drag
        const sp = S.spill;
        if (!sp || sp.port) return;
        const k = Number(el.dataset.v);
        const r = sp.r;
        const p = meg(sp);
        if (rundeFerdig(sp) || !erMenneske(sp, r.tur) || r.venter != null) return R.toast(rundeFerdig(sp) ? "Runden er over" : `Vent litt – ${navn(sp, r.tur)} tenker`);
        if (!Vri.kanLegges(k, Vri.topp(r), r.sort) || r.tur !== p) {
          R.lyd.feil();
          R.vibrer(30);
          el.classList.remove("risting");
          void el.offsetWidth;
          el.classList.add("risting");
          R.si(`${kortnavn(k)} passer ikke. ${hintTekst(sp)}`);
          return;
        }
        spillKort(S, k, "trykk");
      },
      farge(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.r.venter == null || !erMenneske(sp, sp.r.venter)) return;
        if (!Vri.velgSort(sp.r, sp.r.venter, Number(el.dataset.v), rng())) return;
        lyd.vri();
        etterTrekk(S);
        R.vis();
        planleggMobil();
      },
      trekk(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || rundeFerdig(sp)) return;
        const r = sp.r;
        if (!erMenneske(sp, r.tur) || r.venter != null) return R.toast(`Vent litt – ${navn(sp, r.tur)} tenker`);
        if (!Vri.kanTrekke(r, r.tur)) {
          if (Vri.lovlige(r, r.tur).length) R.toast("Du har et kort som passer – legg det");
          return;
        }
        const k = Vri.trekk(r, r.tur, rng());
        nyIHand = k;
        lyd.trekk();
        R.vibrer(8);
        R.vis();
      },
      pass(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || rundeFerdig(sp)) return;
        if (!erMenneske(sp, sp.r.tur) || !Vri.pass(sp.r, sp.r.tur, rng())) return;
        R.lyd.pek();
        etterTrekk(S);
        R.vis();
        planleggMobil();
      },
      runde(el, e, S) {
        const sp = S.spill;
        if (!sp || !rundeFerdig(sp)) return;
        if (kampVunnet(sp)) return avsluttKamp(S);
        nyRunde(S);
        R.lyd.snu();
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && rundeFerdig(S.spill) && kampVunnet(S.spill)) avsluttKamp(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const stilling = sp.poeng.join("–");
        let tekst;
        let linje2;
        if (sp.modus === "mobil") {
          const vant = sp.poeng[0] === Math.max(...sp.poeng) && sp.poeng.filter((x) => x === sp.poeng[0]).length === 1;
          tekst = `${vant ? "Jeg slo mobilen" : "Mobilen slo meg"} i Vri åtter (${NIVANAVN[sp.niva].toLowerCase()}), ${stilling}. Klarer du bedre?`;
          linje2 = `mot mobilen · ${NIVANAVN[sp.niva].toLowerCase()}`;
        } else {
          const topp = Math.max(...sp.poeng);
          const v = sp.poeng.map((x, p) => (x === topp ? R.navn(p) : null)).filter(Boolean);
          tekst = `${R.ramsOpp(v)} vant Vri åtter (${stilling})! Ta en runde du også.`;
          linje2 = `${R.flertall(sp.n, "spiller", "spillere")} på én mobil`;
        }
        R.del("Vri åtter", tekst, DEL_URL, { kort: { tittel: "Vri åtter", linjer: [stilling, linje2] } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        stoppMobil(); // the phone players wait while the sheet is open
        const ferdige = sp.runde - (sp.resultat ? 0 : 1);
        const ja = await R.bekreft("Avslutte spillet?", ferdige ? "Dere går til kåringen. Runden dere er midt i, teller ikke." : "Dere kan alltid starte et nytt.", "Avslutt", "Spill videre");
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return planleggMobil();
        if (!ferdige && !sp.resultat) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });
})();
