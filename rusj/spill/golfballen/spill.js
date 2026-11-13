/* Golfballen — the card game golf, for 2–4 players: you against one to three phone players, or two
   to four people on one phone. Everyone has a grid of six cards face down (two rows of three; or four
   in a square). On your turn draw from the pile or take the top discard, and swap it with a card in
   your grid (the old one is discarded) – or throw a drawn card away. Two equal cards in a column
   score nothing. Six cards: turn two at the start; when someone has all cards face up, the others
   get one more turn. Four cards: look at the bottom two once, new cards go face down, and you knock
   to end the hole. Lowest total after the last hole wins. The rules (Golf) and the phone players
   (Mobil) are pure functions at the top; test/golfballen.test.mjs loads this file without the kit. */
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
  // A hole: { n, var ("seks" | "fire"), regler { toer (two = −2), snu (flip after a discard, six
  //   cards) }, giver, tur, rutenett: [[{ k, opp }]] (positions 0…c−1 the top row, c…2c−1 the bottom
  //   row), kjent: [[bool]] (what each player knows of their own grid), offentlig: [[bool]] (face down
  //   but known to all: taken from the discards), stokk (top = last), kast (discards, top = last),
  //   hand (the card drawn this turn) and fra ("stokk" | "kast"), maaSnu (must turn a card after a
  //   discard), startSnudd (six cards: turned at the start), tittet (four cards: looked at the bottom
  //   two), slutt (who ended it: all face up or knocked), igjen (turns left for the others), turer
  //   (turns per player), fase ("spill" | "ferdig"), resultat (points per player), logg }

  const Golf = (() => {
    const verdiAv = (k) => (k % 13) + 1;
    const ANTALL = { seks: 6, fire: 4 };
    const KOLONNER = { seks: 3, fire: 2 };
    // A hole nobody ends stops by itself after this many turns each (the others get one more).
    const MAKS_TURER = 30;

    // Ace 1, two −2 (or 2 without the house rule), 3–10 face value, jack and queen 10, king 0.
    const verdi = (k, regler) => {
      const v = verdiAv(k);
      if (v === 2) return regler && regler.toer === false ? 2 : -2;
      if (v === 13) return 0;
      return v >= 11 ? 10 : v;
    };
    const kolonner = (r) => KOLONNER[r.var];
    const makker = (r, i) => (i < kolonner(r) ? i + kolonner(r) : i - kolonner(r));

    function bland(liste, rng) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // Points of a grid: two equal cards in a column count 0. alle: every card (end of the hole);
    // else only the face-up ones.
    function poengFor(g, c, regler, alle) {
      let sum = 0;
      for (let x = 0; x < c; x++) {
        const a = g[x];
        const b = g[x + c];
        const sa = alle || a.opp;
        const sb = alle || b.opp;
        if (sa && sb && verdiAv(a.k) === verdiAv(b.k)) continue;
        if (sa) sum += verdi(a.k, regler);
        if (sb) sum += verdi(b.k, regler);
      }
      return sum;
    }
    const poeng = (r, p, alle) => poengFor(r.rutenett[p], kolonner(r), r.regler, alle);
    // Column pairs that already count 0 (both face up and equal).
    const par = (r, p) => {
      const g = r.rutenett[p];
      const c = kolonner(r);
      const ut = [];
      for (let x = 0; x < c; x++) if (g[x].opp && g[x + c].opp && verdiAv(g[x].k) === verdiAv(g[x + c].k)) ut.push(x, x + c);
      return ut;
    };

    // o: { n (2–4), var, regler: { toer, snu }, giver }
    function nyRunde(o, rng) {
      const n = o.n;
      const v = o.var === "fire" ? "fire" : "seks";
      const m = ANTALL[v];
      const stokk = bland(Array.from({ length: 52 }, (_, i) => i), rng);
      const rutenett = Array.from({ length: n }, () => []);
      for (let i = 0; i < m; i++) for (let p = 0; p < n; p++) rutenett[p].push({ k: stokk.pop(), opp: false });
      const g = o.regler || {};
      const giver = (((o.giver || 0) % n) + n) % n;
      return {
        n,
        var: v,
        regler: { toer: g.toer !== false, snu: v === "seks" && !!g.snu },
        giver,
        tur: (giver + 1) % n,
        rutenett,
        kjent: Array.from({ length: n }, () => Array(m).fill(false)),
        offentlig: Array.from({ length: n }, () => Array(m).fill(false)),
        stokk,
        kast: [stokk.pop()],
        hand: null,
        fra: null,
        maaSnu: false,
        startSnudd: Array(n).fill(0),
        tittet: Array(n).fill(false),
        slutt: null,
        igjen: 0,
        turer: Array(n).fill(0),
        fase: "spill",
        resultat: null,
        logg: [],
      };
    }

    const iTur = (r, p) => r.fase === "spill" && r.tur === p;
    const startKlar = (r, p) => (r.var === "seks" ? r.startSnudd[p] >= 2 || r.rutenett[p].every((c) => c.opp) : r.tittet[p]);
    const klar = (r, p) => iTur(r, p) && r.hand == null && !r.maaSnu && startKlar(r, p);
    const kanTrekke = (r, p) => klar(r, p) && r.stokk.length + r.kast.length > 1;
    const kanTa = (r, p) => klar(r, p) && r.kast.length > 0;
    const kanBanke = (r, p) => klar(r, p) && r.var === "fire" && r.slutt == null;
    const kanKaste = (r, p) => iTur(r, p) && r.hand != null && r.fra === "stokk";
    const gyldig = (r, p, i) => Number.isInteger(i) && i >= 0 && i < r.rutenett[p].length;
    const kanBytte = (r, p, i) => iTur(r, p) && r.hand != null && gyldig(r, p, i);
    const kanSnu = (r, p, i) => iTur(r, p) && r.maaSnu && gyldig(r, p, i) && !r.rutenett[p][i].opp;
    const kanStartSnu = (r, p, i) => iTur(r, p) && r.var === "seks" && r.startSnudd[p] < 2 && r.hand == null && gyldig(r, p, i) && !r.rutenett[p][i].opp;
    const kanTitte = (r, p) => iTur(r, p) && r.var === "fire" && !r.tittet[p];

    // The draw pile is empty: shuffle the discards (all but the top card) into a new one.
    function fyll(r, rng) {
      if (r.stokk.length || r.kast.length < 2) return;
      const t = r.kast.pop();
      r.stokk = bland(r.kast, rng);
      r.kast = [t];
      r.logg.push({ type: "stokket" });
    }

    function avslutt(r) {
      r.fase = "ferdig";
      r.hand = null;
      r.fra = null;
      r.maaSnu = false;
      for (const g of r.rutenett) for (const c of g) c.opp = true;
      r.resultat = Array.from({ length: r.n }, (_, p) => poeng(r, p, true));
      r.logg.push({ type: "ferdig" });
    }

    // The end of a turn: all face up (six cards) ends the hole for the others' last turns.
    function slutten(r, p) {
      r.turer[p]++;
      if (r.slutt == null) {
        if (r.var === "seks" && r.rutenett[p].every((c) => c.opp)) {
          r.slutt = p;
          r.igjen = r.n - 1;
          r.logg.push({ type: "alleopp", p });
        } else if (r.turer.every((t) => t >= MAKS_TURER)) {
          r.slutt = p;
          r.igjen = r.n - 1;
          r.logg.push({ type: "stopp" });
        }
      } else if (--r.igjen <= 0) return avslutt(r);
      r.tur = (r.tur + 1) % r.n;
    }

    // Six cards: turn one of your cards before your first turn (two in all).
    function startSnu(r, p, i) {
      if (!kanStartSnu(r, p, i)) return false;
      r.rutenett[p][i].opp = true;
      r.kjent[p][i] = true;
      r.startSnudd[p]++;
      if (r.startSnudd[p] === 1) r.logg = [];
      r.logg.push({ type: "startsnu", p, i, k: r.rutenett[p][i].k });
      return true;
    }
    // Four cards: look at the bottom two, once.
    function titt(r, p) {
      if (!kanTitte(r, p)) return false;
      r.tittet[p] = true;
      const c = kolonner(r);
      for (let i = c; i < 2 * c; i++) r.kjent[p][i] = true;
      return true;
    }
    function trekk(r, p, rng) {
      if (!kanTrekke(r, p)) return false;
      r.logg = [];
      fyll(r, rng);
      r.hand = r.stokk.pop();
      r.fra = "stokk";
      r.logg.push({ type: "trekk", p });
      return true;
    }
    function ta(r, p) {
      if (!kanTa(r, p)) return false;
      r.logg = [];
      r.hand = r.kast.pop();
      r.fra = "kast";
      r.logg.push({ type: "ta", p, k: r.hand });
      return true;
    }
    // Put the card in hand at position i; the old card goes face up on the discards.
    function bytt(r, p, i) {
      if (!kanBytte(r, p, i)) return false;
      const gammel = r.rutenett[p][i];
      r.rutenett[p][i] = { k: r.hand, opp: r.var === "seks" };
      r.kjent[p][i] = true;
      r.offentlig[p][i] = r.fra === "kast";
      r.kast.push(gammel.k);
      r.logg.push({ type: "bytt", p, i, k: r.hand, ut: gammel.k, fra: r.fra, synlig: r.var === "seks" || r.fra === "kast" });
      r.hand = null;
      r.fra = null;
      slutten(r, p);
      return true;
    }
    // Throw away the card drawn from the pile (with the house rule: then turn a card).
    function kast(r, p) {
      if (!kanKaste(r, p)) return false;
      r.kast.push(r.hand);
      r.logg.push({ type: "kast", p, k: r.hand });
      r.hand = null;
      r.fra = null;
      if (r.regler.snu && r.rutenett[p].some((c) => !c.opp)) {
        r.maaSnu = true;
        return true;
      }
      slutten(r, p);
      return true;
    }
    function snu(r, p, i) {
      if (!kanSnu(r, p, i)) return false;
      r.rutenett[p][i].opp = true;
      r.kjent[p][i] = true;
      r.maaSnu = false;
      r.logg.push({ type: "snu", p, i, k: r.rutenett[p][i].k });
      slutten(r, p);
      return true;
    }
    // Four cards: knock instead of drawing; everybody else gets one more turn.
    function bank(r, p) {
      if (!kanBanke(r, p)) return false;
      r.logg = [{ type: "bank", p }];
      r.slutt = p;
      r.igjen = r.n - 1;
      r.turer[p]++;
      r.tur = (r.tur + 1) % r.n;
      return true;
    }

    // Every card exactly once (for checking a restored hole).
    function hel(r) {
      if (!r || !Number.isInteger(r.n) || r.n < 2 || r.n > 4 || !ANTALL[r.var] || !r.regler) return false;
      const m = ANTALL[r.var];
      for (const f of ["rutenett", "kjent", "offentlig"]) if (!Array.isArray(r[f]) || r[f].length !== r.n || !r[f].every((a) => Array.isArray(a) && a.length === m)) return false;
      if (!Array.isArray(r.stokk) || !Array.isArray(r.kast) || !Array.isArray(r.turer) || !Array.isArray(r.startSnudd) || !Array.isArray(r.tittet)) return false;
      if (!r.rutenett.every((g) => g.every((c) => c && Number.isInteger(c.k)))) return false;
      const alle = [].concat(...r.rutenett.map((g) => g.map((c) => c.k)), r.stokk, r.kast, r.hand != null ? [r.hand] : []);
      if (alle.length !== 52 || new Set(alle).size !== 52 || !alle.every((k) => Number.isInteger(k) && k >= 0 && k < 52)) return false;
      if (!["spill", "ferdig"].includes(r.fase)) return false;
      return Number.isInteger(r.tur) && r.tur >= 0 && r.tur < r.n;
    }

    return { verdiAv, ANTALL, KOLONNER, MAKS_TURER, verdi, kolonner, makker, bland, poengFor, poeng, par, nyRunde, iTur, startKlar, klar, kanTrekke, kanTa, kanBanke, kanKaste, kanBytte, kanSnu, kanStartSnu, kanTitte, startSnu, titt, trekk, ta, bytt, kast, snu, bank, hel };
  })();

  // ---------- The phone players ----------
  // 1 Lett: takes a low discard now and then, keeps low cards and throws high ones, anywhere.
  // 2 Middels: works out what a card is worth in each place (pairs in a column count 0, an unknown
  // card counts as the average of the cards not yet seen) and plays the best swap; knocks at 6 or
  // less. 3 Vanskelig: also waits to turn its last card until it leads, takes discards more often
  // (six cards), and keeps or holds back cards the next player could use.
  // Only what a player at the table can know is used: its own known cards, all cards face up, the
  // discards, and the cards the others took from the discards.

  const Mobil = (() => {
    const { verdi, verdiAv, kolonner } = Golf;

    // The average value of the cards p hasn't seen.
    function snitt(r, p) {
      const sett = new Set(r.kast);
      r.rutenett.forEach((g, q) => g.forEach((c, i) => (c.opp || (q === p && r.kjent[p][i]) || (q !== p && r.offentlig[q][i])) && sett.add(c.k)));
      if (r.hand != null && r.tur === p) sett.add(r.hand);
      let sum = 0;
      let n = 0;
      for (let k = 0; k < 52; k++)
        if (!sett.has(k)) {
          sum += verdi(k, r.regler);
          n++;
        }
      return n ? sum / n : 5;
    }

    // What p expects a grid to score: known cards count, unknown ones the average.
    function forventet(r, g, vet, E) {
      const c = kolonner(r);
      let sum = 0;
      for (let x = 0; x < c; x++) {
        const a = vet(x) ? g[x].k : null;
        const b = vet(x + c) ? g[x + c].k : null;
        if (a != null && b != null) sum += verdiAv(a) === verdiAv(b) ? 0 : verdi(a, r.regler) + verdi(b, r.regler);
        else if (a != null) sum += verdi(a, r.regler) + E;
        else if (b != null) sum += verdi(b, r.regler) + E;
        else sum += 2 * E;
      }
      return sum;
    }
    const minVet = (r, p) => (i) => r.rutenett[p][i].opp || r.kjent[p][i];
    const egenForventet = (r, p, E) => forventet(r, r.rutenett[p], minVet(r, p), E);
    // The others as p sees them (face up or taken from the discards).
    // With four cards the others' swaps are hidden; every turn they have had, has likely helped them.
    const andreForventet = (r, q, E) => forventet(r, r.rutenett[q], (i) => r.rutenett[q][i].opp || r.offentlig[q][i], E) - (r.var === "fire" ? 1.2 * Math.min(r.turer[q], 4) : 0);

    // How much better p's grid gets with card k at i (negative: worse). ut: would it turn the last card?
    function gevinst(r, p, k, i, E) {
      const g = r.rutenett[p];
      const vet = minVet(r, p);
      const for_ = forventet(r, g, vet, E);
      const ny = g.slice();
      ny[i] = { k, opp: true };
      const etter = forventet(r, ny, (j) => j === i || vet(j), E);
      const sisteSkjulte = r.var === "seks" && !g[i].opp && g.filter((c) => !c.opp).length === 1;
      return { verdi: for_ - etter, etter, ut: sisteSkjulte };
    }

    // Would turning the last card now (ending at `etter`) be wise? Vanskelig waits unless it leads.
    function godSlutt(r, p, etter, E) {
      let best = Infinity;
      for (let q = 0; q < r.n; q++) if (q !== p) best = Math.min(best, andreForventet(r, q, E));
      return etter <= best - 1 || etter <= 2;
    }

    // What card k on the discards would be worth to the next player, as far as p can see.
    function gave(r, p, k, E) {
      const q = (p + 1) % r.n;
      const g = r.rutenett[q];
      const vet = (i) => g[i].opp || r.offentlig[q][i];
      const for_ = forventet(r, g, vet, E);
      let best = 0;
      for (let i = 0; i < g.length; i++) {
        const ny = g.slice();
        ny[i] = { k, opp: true };
        best = Math.max(best, for_ - forventet(r, ny, (j) => j === i || vet(j), E));
      }
      return best;
    }

    function besteSted(r, p, k, niva, E) {
      let best = null;
      for (let i = 0; i < r.rutenett[p].length; i++) {
        const g = gevinst(r, p, k, i, E);
        let v = g.verdi;
        if (niva >= 3 && g.ut && !godSlutt(r, p, g.etter, E)) v -= 50;
        // Vanskelig: the card that goes out lands on the discards for the next player.
        const ut = r.rutenett[p][i];
        if (niva >= 3 && (ut.opp || r.kjent[p][i])) v -= 0.5 * gave(r, p, ut.k, E);
        if (!best || v > best.v) best = { i, v };
      }
      return best;
    }

    const tilfeldig = (liste, rng) => liste[Math.floor(rng() * liste.length)];

    // One action: { type: "startsnu" | "titt" | "snu" | "trekk" | "ta" | "bank" | "bytt" | "kast", i }.
    function velg(r, p, niva, rng) {
      rng = rng || Math.random;
      const g = r.rutenett[p];
      const skjulte = g.map((c, i) => (c.opp ? -1 : i)).filter((i) => i >= 0);
      if (r.var === "seks" && r.startSnudd[p] < 2 && r.hand == null && skjulte.length && !g.every((c) => c.opp)) {
        if (niva >= 3) {
          // Two in different columns
          const brukt = g.map((c, i) => (c.opp ? i % kolonner(r) : -1));
          const andre = skjulte.filter((i) => !brukt.includes(i % kolonner(r)));
          if (andre.length) return { type: "startsnu", i: tilfeldig(andre, rng) };
        }
        return { type: "startsnu", i: tilfeldig(skjulte, rng) };
      }
      if (r.var === "fire" && !r.tittet[p]) return { type: "titt" };
      if (r.maaSnu) return { type: "snu", i: tilfeldig(skjulte, rng) };
      const E = snitt(r, p);
      const lang = r.turer[p] >= 12; // a long hole: take what helps a little, end it
      if (r.hand == null) {
        const d = r.kast[r.kast.length - 1];
        if (niva <= 1) {
          if (r.var === "fire" && r.slutt == null && r.turer[p] >= 5 && rng() < 0.3) return { type: "bank" };
          return d != null && verdi(d, r.regler) <= 2 && rng() < 0.7 ? { type: "ta" } : { type: "trekk" };
        }
        if (r.var === "fire" && r.slutt == null) {
          const meg = egenForventet(r, p, E);
          let andre = Infinity;
          for (let q = 0; q < r.n; q++) if (q !== p) andre = Math.min(andre, andreForventet(r, q, E));
          if (niva === 2 ? meg <= 6 || (lang && meg <= 12) : meg <= 6 || (meg <= 8 && r.turer[p] <= 1) || (lang && meg <= 12)) return { type: "bank" };
        }
        if (d != null) {
          const b = besteSted(r, p, d, niva, E);
          if (b && b.v >= (niva >= 3 && r.var === "seks" ? 1.5 : 2.5)) return { type: "ta" };
        }
        return { type: "trekk" };
      }
      const k = r.hand;
      if (niva <= 1) {
        const ukjente = g.map((c, i) => (c.opp || r.kjent[p][i] ? -1 : i)).filter((i) => i >= 0);
        if (r.fra === "kast" || verdi(k, r.regler) <= 4) {
          const kjenteHoye = g.map((c, i) => ((c.opp || r.kjent[p][i]) && verdi(c.k, r.regler) > verdi(k, r.regler) ? i : -1)).filter((i) => i >= 0);
          return { type: "bytt", i: ukjente.length ? tilfeldig(ukjente, rng) : kjenteHoye.length ? tilfeldig(kjenteHoye, rng) : tilfeldig(g.map((c, i) => i), rng) };
        }
        return { type: "kast" };
      }
      const b = besteSted(r, p, k, niva, E);
      if (r.fra === "kast" || b.v > (lang ? -1 : niva >= 3 && r.var === "seks" ? 0 : 0.5)) return { type: "bytt", i: b.i };
      // Vanskelig keeps a card the next player is waiting for, if it costs little.
      if (niva >= 3) {
        const gaven = gave(r, p, k, E);
        if (gaven >= 3 && b.v > -gaven / 2) return { type: "bytt", i: b.i };
      }
      return { type: "kast" };
    }

    // Plays p's whole turn. For simulations.
    function spillTur(r, p, niva, rng) {
      for (let n = 0; n < 8 && r.fase === "spill" && r.tur === p; n++) {
        const v = velg(r, p, niva, rng);
        const ok = utfor(r, p, v, rng);
        if (!ok) return false;
      }
      return true;
    }
    function utfor(r, p, v, rng) {
      switch (v.type) {
        case "startsnu":
          return Golf.startSnu(r, p, v.i);
        case "titt":
          return Golf.titt(r, p);
        case "snu":
          return Golf.snu(r, p, v.i);
        case "trekk":
          return Golf.trekk(r, p, rng);
        case "ta":
          return Golf.ta(r, p);
        case "bank":
          return Golf.bank(r, p);
        case "bytt":
          return Golf.bytt(r, p, v.i);
        case "kast":
          return Golf.kast(r, p);
        default:
          return false;
      }
    }

    return { velg, spillTur, utfor, snitt, forventet };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules, the phone players and the cards.
    window.Golfballen = { Golf, Mobil, KORT };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { verdiAv } = Golf;
  const sortAv = (k) => (k / 13) | 0;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const NIVANAVN = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen beholder lave kort og kaster høye, uten mye plan. Fint for de minste."),
    2: R.t("Mobilen regner ut hvor hvert kort gjør mest nytte, og ser etter like par."),
    3: R.t("Mobilen regner, holder på kort du venter på, og går ikke ut før den leder. Klarer du å slå den?"),
  };
  const HULL = [1, 5, 9];
  const VERDIORD = ["", R.t("ess"), R.t("to"), R.t("tre"), R.t("fire"), R.t("fem"), R.t("seks"), R.t("sju"), R.t("åtte"), R.t("ni"), R.t("ti"), R.t("knekt"), R.t("dame"), R.t("konge")];
  const FARGENAVN = [R.t("spar"), R.t("hjerter"), R.t("ruter"), R.t("kløver")];
  // «hjerter sju», «spar dame»
  const kortnavn = (k) => R.t("{farge} {verdi}", { farge: FARGENAVN[sortAv(k)], verdi: VERDIORD[verdiAv(k)] });
  const FART = { trekk: 850, legg: 1050, start: 900 }; // ms per step of a phone player
  // This edition's address (rusj.no/golfballen/, rusj.no/en/…)
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/golfballen/" }).href;
  let H;

  // S.spill: { id, modus ("mobil" | "flere"), niva, n, var, regler, hull (holes in all), hullNr,
  //   poeng: [[points per hole] per player], r (the hole, see Golf), port (four cards on one phone:
  //   the grid waits behind «Vis kortene mine»), viser (looking at the bottom two), telt, ferdig,
  //   registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMenneske = (sp, p) => sp.modus === "flere" || p === 0;
  const navn = (sp, p) => (sp.modus === "flere" ? R.navn(p) : p === 0 ? R.t("Du") : sp.n === 2 ? R.t("Mobilen") : R.t("Mobil {n}", { n: p }));
  const avatarNr = (sp, p) => (sp.modus === "flere" ? p : p === 0 ? 0 : 9 + p);
  const avatar = (sp, p, str) => R.avatar(avatarNr(sp, p), str);
  const erDu = (sp, p) => sp.modus === "mobil" && p === 0;
  // The grid shown at the bottom: yours against the phone, or the one whose turn it is.
  const meg = (sp) => (sp.modus === "mobil" ? 0 : sp.r.tur);
  const sum = (sp, p) => sp.poeng[p].reduce((a, b) => a + b, 0);
  const hullFerdig = (sp) => sp.r.fase === "ferdig";
  const kampFerdig = (sp) => hullFerdig(sp) && sp.poeng[0].length >= sp.hull;
  const rng = () => R.rng(R.nyttFro());
  const medFortegn = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
  // A hot seat is only needed with four cards: what you looked at must stay yours.
  const trengerPort = (sp) => sp.modus === "flere" && sp.var === "fire";

  // ---------- Sounds ----------
  const lyd = {
    legg: () => {
      R.lyd.tone(520, 0, 0.06, "triangle", 0.1);
      R.lyd.stoy(0, 0.08, 0.14, 2400);
    },
    trekk: () => R.lyd.stoy(0, 0.12, 0.12, 1600),
    snu: () => R.lyd.snu(),
    bank: () => {
      R.lyd.tone(180, 0, 0.08, "square", 0.1);
      R.lyd.tone(180, 0.16, 0.08, "square", 0.1);
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
      case "startsnu":
        return R.t("{hvem} snudde {kort}.", { hvem, kort: kortnavn(h.k) });
      case "trekk":
        return du ? R.t("Du trakk et kort.") : R.t("{hvem} trakk et kort.", { hvem });
      case "ta":
        return R.t("{hvem} tok {kort} fra kastebunken.", { hvem, kort: kortnavn(h.k) });
      case "bytt":
        return h.synlig ? R.t("{hvem} la inn {kort} og kastet {ut}.", { hvem, kort: kortnavn(h.k), ut: kortnavn(h.ut) }) : R.t("{hvem} byttet et skjult kort og kastet {ut}.", { hvem, ut: kortnavn(h.ut) });
      case "kast":
        return R.t("{hvem} kastet {kort}.", { hvem, kort: kortnavn(h.k) });
      case "snu":
        return R.t("{hvem} snudde {kort}.", { hvem, kort: kortnavn(h.k) });
      case "bank":
        return du ? R.t("Du banket på! De andre får én tur til.") : R.t("{hvem} banket på! De andre får én tur til.", { hvem });
      case "alleopp":
        return du ? R.t("Alle kortene dine ligger åpne! De andre får én tur til.") : R.t("{hvem} har alle kortene åpne! De andre får én tur til.", { hvem });
      case "stopp":
        return R.t("Hullet har vart lenge – de andre får én tur til.");
      case "stokket":
        return R.t("Kastebunken er stokket til en ny bunke.");
      default:
        return "";
    }
  }
  // «Drew a card» and «took the five» are left out when the same turn says where the card went.
  const sistTekst = (sp) =>
    (sp.r.logg || [])
      .filter((h, i, a) => !((h.type === "trekk" || h.type === "ta") && a.some((x) => (x.type === "bytt" || x.type === "kast") && x.p === h.p)))
      .map((h) => hendelseTekst(sp, h))
      .filter(Boolean)
      .join(" ");

  function meldingTekst(sp) {
    const r = sp.r;
    if (hullFerdig(sp)) return "";
    const p = r.tur;
    if (!erMenneske(sp, p)) return R.t("{navn} tenker …", { navn: navn(sp, p) });
    const sist = r.slutt != null && r.slutt !== p ? R.t("Siste tur!") + " " : "";
    if (r.var === "seks" && !Golf.startKlar(r, p)) return r.startSnudd[p] ? R.t("Snu ett kort til.") : R.t("Snu to av kortene dine for å begynne.");
    if (r.var === "fire" && !r.tittet[p]) return R.t("Se på de to nederste kortene dine – og husk dem.");
    if (sp.viser != null) return R.t("Husk de to nederste kortene! De snus igjen når du er klar.");
    if (r.maaSnu) return R.t("Snu ett av de skjulte kortene dine.");
    if (r.hand != null) return sist + (r.fra === "kast" ? R.t("Trykk på kortet i rutenettet du vil bytte ut.") : R.t("Bytt med et kort i rutenettet – eller kast det."));
    return sist + (r.var === "fire" && r.slutt == null ? R.t("Trekk et kort, ta det øverste fra kastebunken – eller bank på.") : R.t("Trekk et kort, eller ta det øverste fra kastebunken."));
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
      var: o.var,
      regler: { toer: !!o.toer, snu: o.var === "seks" && !!o.snu },
      hull: o.hull,
      hullNr: 0,
      // Against the phone you begin the first hole; then who begins goes round the table.
      giver: o.modus === "mobil" ? n - 2 : R.heltall(0, n - 1) - 1,
      poeng: Array.from({ length: n }, () => []),
      r: null,
      port: false,
      viser: null,
      telt: false,
      ferdig: false,
      registrert: false,
    };
    nyttHull(S);
    R.statistikk("start", { modus: o.modus, spillere: n, niva: o.modus === "mobil" ? o.niva : 0, kort: o.var === "fire" ? 4 : 6, hull: o.hull, toer: !!o.toer, snu: !!o.snu });
  }

  function nyttHull(S) {
    const sp = S.spill;
    sp.hullNr++;
    sp.giver = (sp.giver + 1 + sp.n) % sp.n;
    sp.r = Golf.nyRunde({ n: sp.n, var: sp.var, regler: sp.regler, giver: sp.giver }, rng());
    sp.port = trengerPort(sp);
    sp.viser = null;
    sp.telt = false;
    nyttKast = null;
  }

  // After every step by p.
  function etterTrekk(S, p) {
    const sp = S.spill;
    const r = sp.r;
    if (hullFerdig(sp)) return ferdigHull(S);
    if (trengerPort(sp) && r.tur !== p) sp.port = true;
  }

  // The hole is over: write the points, count the record after the last hole.
  function ferdigHull(S) {
    const sp = S.spill;
    if (sp.telt) return;
    sp.telt = true;
    sp.port = false;
    sp.viser = null;
    const r = sp.r;
    r.resultat.forEach((x, p) => sp.poeng[p].push(x));
    const fortsatt = R.vakt();
    if (kampFerdig(sp) && sp.modus === "mobil") {
      const rek = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, tap: 0, uavgjort: 0 });
      const mine = sum(sp, 0);
      const best = Math.min(...Array.from({ length: sp.n }, (_, q) => (q === 0 ? Infinity : sum(sp, q))));
      if (mine < best) {
        rek.seier++;
        R.merke("klassiker-golfballen");
      } else if (mine === best) rek.uavgjort = (rek.uavgjort || 0) + 1;
      else rek.tap++;
    }
    setTimeout(() => {
      if (!fortsatt()) return;
      const minst = Math.min(...r.resultat);
      if (sp.modus === "mobil" && r.resultat[0] > minst) lyd.tap();
      else {
        R.lyd.riktig();
        R.vibrer([30, 50, 80]);
      }
    }, 420);
  }

  function avsluttKamp(S) {
    const sp = S.spill;
    stoppMobil();
    sp.ferdig = true;
    R.statistikk("ferdig", { modus: sp.modus, spillere: sp.n, niva: sp.modus === "mobil" ? sp.niva : 0, hull: sp.poeng[0].length, kort: sp.var === "fire" ? 4 : 6 });
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
    if (mobilId || !sp || sp.ferdig || S.skjerm !== "spill" || hullFerdig(sp)) return;
    if (erMenneske(sp, sp.r.tur)) return;
    mobilId = setTimeout(mobilSteg, ms != null ? ms : FART.legg);
  }
  function mobilSteg() {
    mobilId = null;
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || hullFerdig(sp)) return;
    const r = sp.r;
    const p = r.tur;
    if (erMenneske(sp, p)) return;
    // Never behind a sheet (rules, «Avslutt?») or in a hidden tab: wait and look again.
    if (R.arkApent() || document.hidden) return planleggMobil(500);
    const v = Mobil.velg(r, p, sp.niva, Math.random);
    if (!Mobil.utfor(r, p, v, rng())) return;
    lydFor(v.type);
    if (v.type === "bytt" || v.type === "kast") nyttKast = r.kast[r.kast.length - 1];
    etterTrekk(S, p);
    R.vis();
    planleggMobil(v.type === "trekk" || v.type === "ta" ? FART.trekk : v.type === "startsnu" || v.type === "titt" ? 450 : FART.legg);
  }
  function lydFor(type) {
    if (type === "trekk" || type === "ta") lyd.trekk();
    else if (type === "bank") lyd.bank();
    else if (type === "bytt" || type === "kast") lyd.legg();
    else if (type === "startsnu" || type === "snu") lyd.snu();
  }

  // ---------- Markup ----------

  let nyttKast = null; // the card that just landed on the discards (animated once)

  // A grid of cards. o: { knapper: fn(i) → action | null, vis: fn(i) → face up?, liten, par: [i] }
  function rutenettHtml(sp, p, o = {}) {
    const r = sp.r;
    const c = Golf.kolonner(r);
    const g = r.rutenett[p];
    const par = new Set(o.par || []);
    return `<div class="gb-nett k${c}${o.liten ? " liten" : ""}">${g
      .map((kort, i) => {
        const opp = o.vis ? o.vis(i) : kort.opp;
        const h = o.knapper ? o.knapper(i) : null;
        const kl = `gb-plass${par.has(i) ? " par" : ""}${h ? " aktiv" : ""}`;
        const etikett = opp ? kortnavn(kort.k) : R.t("Skjult kort, {rad}, {kolonne}", { rad: i < c ? R.t("øverst") : R.t("nederst"), kolonne: R.t("kolonne {n}", { n: (i % c) + 1 }) });
        const innhold = KORT.html(opp ? kort.k : null, { opp });
        return h ? `<button class="${kl}" data-h="${h}" data-v="${i}" aria-label="${esc(etikett)}">${innhold}</button>` : `<span class="${kl}">${innhold}</span>`;
      })
      .join("")}</div>`;
  }

  // The others: name, points so far and their grid, small.
  function andreHtml(sp) {
    const r = sp.r;
    const vis = meg(sp);
    const ferdig = hullFerdig(sp);
    const seter = [];
    for (let d = 1; d < sp.n; d++) seter.push((vis + d) % sp.n);
    return `<ul class="gb-andre seter-${seter.length}" aria-label="${esc(R.t("Rundt bordet"))}">${seter
      .map((p) => {
        const aktiv = !ferdig && p === r.tur;
        const tenker = aktiv && !erMenneske(sp, p);
        const synlig = Golf.poeng(r, p, ferdig);
        const linje = ferdig ? R.t("Hullet: {n}", { n: medFortegn(synlig) }) : r.var === "seks" ? R.t("Synlig: {n}", { n: medFortegn(synlig) }) : R.t("Totalt: {n}", { n: sum(sp, p) });
        const apne = r.rutenett[p].filter((x) => x.opp).length;
        const etikett = r.var === "seks" || ferdig ? R.t("{navn}: {apne} av {alle} kort åpne, {poeng} poeng synlig.", { navn: navn(sp, p), apne, alle: r.rutenett[p].length, poeng: synlig }) : R.t("{navn}: alle kortene ligger skjult.", { navn: navn(sp, p) });
        return `<li class="gb-sete${aktiv ? " aktiv" : ""}${r.slutt === p ? " ute" : ""}">
          <span class="gb-hode"><span class="gb-ava">${avatar(sp, p)}${tenker ? '<span class="gb-tenker" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}</span>
          <span class="gb-info"><b class="gb-navn">${esc(navn(sp, p))}</b><span class="gb-linje">${esc(linje)}</span></span></span>
          <span class="gb-mini" role="img" aria-label="${esc(etikett)}">${rutenettHtml(sp, p, { liten: true, par: Golf.par(r, p) })}</span>
        </li>`;
      })
      .join("")}</ul>`;
  }

  // The pile, the card in hand and the discards.
  function bordHtml(sp) {
    const r = sp.r;
    const p = meg(sp);
    const minTur = !hullFerdig(sp) && erMenneske(sp, r.tur) && r.tur === p && sp.viser == null;
    const kanTrekke = minTur && Golf.kanTrekke(r, p);
    const kanTa = minTur && Golf.kanTa(r, p);
    const kanKaste = minTur && Golf.kanKaste(r, p);
    const topp = r.kast.length ? r.kast[r.kast.length - 1] : null;
    const ny = nyttKast != null && nyttKast === topp;
    nyttKast = null;
    const under = r.kast.length > 1 ? KORT.html(r.kast[r.kast.length - 2], { opp: true, klasse: "gb-under" }) : "";
    const kastInnhold = `${under}${topp != null ? KORT.html(topp, { opp: true, stor: true, klasse: `gb-toppkort${ny ? " ny" : ""}` }) : '<span class="gb-tom" aria-hidden="true"></span>'}`; // sprak-ok
    const kastEtikett = topp != null ? R.t("Kastebunken: {kort}", { kort: kortnavn(topp) }) : R.t("Kastebunken er tom");
    let kastHtml;
    if (kanTa) kastHtml = `<button class="gb-kast klar" data-h="ta" aria-label="${esc(kastEtikett + ". " + R.t("Ta kortet"))}">${kastInnhold}</button>`;
    else if (kanKaste) kastHtml = `<button class="gb-kast klar" data-h="kast" aria-label="${esc(kastEtikett + ". " + R.t("Kast kortet du trakk"))}">${kastInnhold}</button>`;
    else kastHtml = `<div class="gb-kast" role="img" aria-label="${esc(kastEtikett)}">${kastInnhold}</div>`;
    // The phone's drawn card stays hidden until it is placed or thrown; a taken discard is known.
    const handOpp = r.hand != null && (r.fra === "kast" || erMenneske(sp, r.tur));
    return `<div class="gb-bord">
      <button data-h="trekk" class="gb-stokk${kanTrekke ? " klar" : ""}" aria-label="${esc(R.t("Bunken, {antall}", { antall: R.flertall(r.stokk.length, "kort", "kort") }) + (kanTrekke ? ". " + R.t("Trekk et kort") : ""))}"${kanTrekke ? "" : ' aria-disabled="true"'}>
        ${r.stokk.length ? KORT.html(null, { klasse: "gb-stokkort" }) : '<span class="gb-tom" aria-hidden="true"></span>'}
        <span class="gb-tall" aria-hidden="true">${r.stokk.length}</span>
      </button>
      <div class="gb-hand${r.hand != null ? " full" : ""}" ${r.hand != null ? `role="img" aria-label="${esc(handOpp ? R.t("I hånda: {kort}", { kort: kortnavn(r.hand) }) : R.t("{navn} har et kort i hånda", { navn: navn(sp, r.tur) }))}"` : 'aria-hidden="true"'}>
        ${r.hand != null ? KORT.html(handOpp ? r.hand : null, { opp: handOpp, stor: handOpp, klasse: "gb-handkort" }) : ""}
      </div>
      ${kastHtml}
    </div>`;
  }

  // Your grid (or the player's whose turn it is), with the actions that fit the moment.
  function minHtml(sp) {
    const r = sp.r;
    const p = meg(sp);
    const ferdig = hullFerdig(sp);
    const minTur = !ferdig && erMenneske(sp, r.tur) && r.tur === p;
    let knapper = null;
    if (minTur && sp.viser == null) {
      if (r.var === "seks" && !Golf.startKlar(r, p)) knapper = (i) => (r.rutenett[p][i].opp ? null : "startsnu");
      else if (r.maaSnu) knapper = (i) => (r.rutenett[p][i].opp ? null : "snukort");
      else if (r.hand != null) knapper = () => "bytt";
    }
    const c = Golf.kolonner(r);
    const vis = sp.viser === p ? (i) => r.rutenett[p][i].opp || i >= c : null;
    const synlig = Golf.poeng(r, p, ferdig);
    const linje = ferdig ? R.t("Hullet: {n}", { n: medFortegn(synlig) }) : r.var === "seks" ? R.t("Synlig: {n}", { n: medFortegn(synlig) }) : "";
    const totalt = R.t("Totalt: {n}", { n: sum(sp, p) });
    return `<section class="gb-meg${minTur ? " min-tur" : ""}${r.hand != null && minTur ? " bytter" : ""}" aria-label="${esc(sp.modus === "flere" ? R.t("Kortene til {navn}", { navn: navn(sp, p) }) : R.t("Kortene dine"))}">
      ${rutenettHtml(sp, p, { knapper, vis, par: Golf.par(r, p) })}
      <p class="gb-status">${sp.modus === "flere" ? `<b>${esc(navn(sp, p))}</b> · ` : ""}${linje ? `${esc(linje)} · ` : ""}${esc(totalt)}</p>
    </section>`;
  }

  // The end of a hole: everybody's points.
  function hullResultatHtml(sp) {
    const r = sp.r;
    const rekke = Array.from({ length: sp.n }, (_, p) => p).sort((a, b) => r.resultat[a] - r.resultat[b] || sum(sp, a) - sum(sp, b));
    const best = Math.min(...r.resultat);
    return `<ol class="gb-hullres" aria-label="${esc(R.t("Poeng for hullet"))}">${rekke
      .map((p) => `<li class="${r.resultat[p] === best ? "best" : ""}">${avatar(sp, p)}<b>${esc(navn(sp, p))}</b><span class="gb-hp">${esc(medFortegn(r.resultat[p]))}</span><span class="gb-sum">${esc(R.t("Totalt: {n}", { n: sum(sp, p) }))}</span></li>`)
      .join("")}</ol>`;
  }

  function hullTittel(sp) {
    const r = sp.r;
    const best = Math.min(...r.resultat);
    const beste = Array.from({ length: sp.n }, (_, p) => p).filter((p) => r.resultat[p] === best);
    if (beste.length > 1) return R.t("Delt beste hull: {navn}.", { navn: R.ramsOpp(beste.map((p) => navn(sp, p))) });
    return erDu(sp, beste[0]) ? R.t("Du vant hullet med {n}!", { n: medFortegn(best) }) : R.t("{navn} vant hullet med {n}.", { navn: navn(sp, beste[0]), n: medFortegn(best) });
  }

  function spillHtml(S) {
    const sp = S.spill;
    const r = sp.r;
    const ferdig = hullFerdig(sp);
    if (sp.port && !ferdig) {
      const sist = sistTekst(sp);
      return `${sist ? `<p class="gb-sist-port" role="status">${esc(sist)}</p>` : ""}
        ${R.ui.giTil({ i: r.tur, h: "vis", knapp: R.t("Vis kortene mine"), tekst: r.turer.every((t) => t === 0) ? R.t("Hull {n} – gi mobilen til", { n: sp.hullNr }) : R.t("Gi mobilen til"), advarsel: R.t("De andre ser bort"), prikker: [sp.n, r.tur] })}`;
    }
    const p = meg(sp);
    const minTur = !ferdig && erMenneske(sp, r.tur) && r.tur === p;
    const sist = ferdig ? "" : sistTekst(sp);
    // Six cards on one phone has no gate: say whose turn it is.
    const melding = ferdig ? hullTittel(sp) : sp.modus === "flere" && minTur && !trengerPort(sp) ? R.t("{navn}, din tur!", { navn: navn(sp, p) }) + " " + meldingTekst(sp) : meldingTekst(sp);
    let hoved;
    const lenker = [];
    if (ferdig) hoved = kampFerdig(sp) ? R.ui.knapp(R.t("Se kåringen"), "kaaring", { ikon: "🏆" }) : R.ui.knapp(R.t("Neste hull ({n} av {av})", { n: sp.hullNr + 1, av: sp.hull }), "neste", { ikon: "⛳" });
    else if (minTur && r.var === "fire" && !r.tittet[p]) hoved = R.ui.knapp(R.t("Se de to nederste"), "titt");
    else if (minTur && sp.viser != null) hoved = R.ui.knapp(R.t("Jeg husker dem"), "husker");
    else if (minTur && r.var === "seks" && !Golf.startKlar(r, p)) hoved = R.ui.knapp(R.t("Snu tilfeldig"), "startsnu");
    else if (minTur && r.maaSnu) hoved = R.ui.knapp(R.t("Snu et kort"), "snukort", { av: true });
    else if (minTur && r.hand != null) hoved = r.fra === "stokk" ? R.ui.knapp(R.t("Kast kortet"), "kast", { variant: "papir" }) : R.ui.knapp(R.t("Velg et kort å bytte"), "bytt", { av: true });
    else {
      hoved = R.ui.knapp(R.t("Trekk et kort"), "trekk", { av: !(minTur && Golf.kanTrekke(r, p)) });
      if (minTur && Golf.kanBanke(r, p)) lenker.push(R.ui.lenke(R.t("Bank på"), "bank"));
    }
    lenker.push(R.ui.lenke(R.t("Avslutt"), "avslutt"));
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(R.t("Golfballen, hull {n}", { n: sp.hullNr }))}</h1>
      ${andreHtml(sp)}
      ${bordHtml(sp)}
      <div class="gb-melding${ferdig ? " ferdig" : minTur ? " din" : ""}" role="status">
        ${sist ? `<span class="gb-sist">${esc(sist)}</span>` : ""}
        <b>${esc(melding)}</b>
      </div>
      ${ferdig ? hullResultatHtml(sp) : ""}
      ${minHtml(sp)}
      ${R.ui.dokk(hoved, R.ui.lenkerad(...lenker))}`;
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.tap + (r.uavgjort || 0))) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span>${r.uavgjort ? `<span><b>${r.uavgjort}</b> ${esc(R.t("uavgjort|uavgjort", { n: r.uavgjort }))}</span>` : ""}<span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }

  // The score card: a row per player, a column per hole.
  function scorekortHtml(sp) {
    const hull = sp.poeng[0].length;
    const rekke = Array.from({ length: sp.n }, (_, p) => p).sort((a, b) => sum(sp, a) - sum(sp, b));
    return `<div class="gb-kortwrap"><table class="gb-scorekort">
      <caption class="vh">${esc(R.t("Scorekortet"))}</caption>
      <thead><tr><th scope="col">${esc(R.t("Spiller"))}</th>${Array.from({ length: hull }, (_, h) => `<th scope="col">${h + 1}</th>`).join("")}<th scope="col">${esc(R.t("Sum"))}</th></tr></thead>
      <tbody>${rekke.map((p) => `<tr><th scope="row">${esc(navn(sp, p))}</th>${sp.poeng[p].map((x) => `<td>${esc(medFortegn(x))}</td>`).join("")}<td class="gb-tot">${esc(medFortegn(sum(sp, p)))}</td></tr>`).join("")}</tbody>
    </table></div>`;
  }

  // ---------- Screens ----------

  R.start({
    id: "golfballen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", mobiler: 1, niva: 2, var: "seks", hull: 9, toer: true, snu: false },
      spill: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", mobiler: 1, niva: 2, var: "seks", hull: 9, toer: true, snu: false }, S.oppsett));
      if (!["mobil", "flere"].includes(o.modus)) o.modus = "mobil";
      if (![1, 2, 3].includes(o.mobiler)) o.mobiler = 1;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (!["seks", "fire"].includes(o.var)) o.var = "seks";
      if (!HULL.includes(o.hull)) o.hull = 9;
      o.toer = !!o.toer;
      o.snu = !!o.snu;
      S.antall = R.klamp(S.antall || 2, 2, 4);
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const ok = ["mobil", "flere"].includes(sp.modus) && [1, 2, 3].includes(sp.niva) && HULL.includes(sp.hull) && Golf.hel(sp.r) && sp.r.n === sp.n && sp.r.var === sp.var && Array.isArray(sp.poeng) && sp.poeng.length === sp.n;
        if (!ok) S.spill = null;
        else {
          // Four cards on one phone: back behind the gate (looking at the bottom two goes on after it).
          if (sp.viser != null && sp.viser !== sp.r.tur) sp.viser = null;
          if (trengerPort(sp) && !sp.ferdig && !hullFerdig(sp)) sp.port = true;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Få lavest mulig sum. Alle har seks kort med bildet ned i to rader (eller fire i en firkant) og bytter seg fram til lavere kort, hull for hull."),
      steg: [
        [R.t("Trekk eller ta"), R.t("Trekk det øverste kortet fra bunken, eller ta det øverste kortet i kastebunken.")],
        [R.t("Bytt eller kast"), R.t("Bytt kortet med ett av kortene dine – det gamle går i kastebunken. Et kort du trakk fra bunken, kan du også bare kaste.")],
        [R.t("Lavest sum vinner"), R.t("Når noen har alle kortene åpne, får de andre én tur til, og hullet telles. Etter siste hull vinner den med lavest sum.")],
      ],
      tips: [
        R.t("Poeng: ess 1, toer minus 2, tre til ti det de viser, knekt og dame 10, konge 0."),
        R.t("To like kort i samme kolonne – det ene over det andre – teller 0."),
        R.t("Seks kort: Snu to av kortene dine før din første tur."),
        R.t("Fire kort: Se på de to nederste kortene dine én gang før din første tur – og husk dem. Nye kort legges med bildet ned. Synes du summen er lav nok, banker du på i stedet for å trekke; da får de andre én tur til."),
        R.t("Husregel «Toer minus to»: Slår du den av, teller toeren 2."),
        R.t("Husregel «Snu når du kaster» (seks kort): Kaster du kortet du trakk, snur du ett av de skjulte kortene dine."),
        R.t("Flere på én mobil: Med seks kort er alt åpent, så dere sender bare mobilen videre. Med fire kort skjules kortene mellom hver tur."),
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
              slagordHtml: `${esc(R.t("Bytt deg ned til lavest sum."))}<br><em>${esc(R.t("Like par teller null."))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · hull {n}", { n: sp.hullNr }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–4", R.t("spillere")],
                ["3", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) +
            (rek.length ? `<section class="gb-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="gb-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
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
                : R.ui.spillere({ min: 2, max: 4, tittel: R.t("Hvem spiller?") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Hvor mange kort?"))}</h2>
              ${R.ui.seg("var", [["seks", R.t("6 kort")], ["fire", R.t("4 kort")]], o.var, { etikett: R.t("Antall kort") })}
              <p class="hjelp">${esc(o.var === "fire" ? R.t("Fire kort med bildet ned: se på de to nederste én gang, husk dem – og bank på når du leder.") : R.t("Seks kort i to rader. Snu to – resten finner du ut av underveis."))}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor mange hull?"))}</h2>
              ${R.ui.seg("hull", HULL.map((h) => [h, String(h)]), o.hull, { etikett: R.t("Antall hull") })}
              <p class="hjelp">${esc(o.hull === 9 ? R.t("Ni hull er en hel runde. Lavest sum til slutt vinner.") : o.hull === 1 ? R.t("Ett hull – en rask runde.") : R.t("Fem hull – en kort runde."))}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Husregler"))}</h2>
              ${R.ui.bryter("toer", o.toer, R.t("Toer minus to"), R.t("En toer gir minus 2 poeng. Av: toeren teller 2."))}
              ${o.var === "seks" ? R.ui.bryter("snu", o.snu, R.t("Snu når du kaster"), R.t("Kaster du kortet du trakk, snur du ett av de skjulte kortene dine.")) : ""}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "⛳" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? R.t("Hull {n} av {av}", { n: S.spill.hullNr, av: S.spill.hull }) : ""),
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
          const hull = sp.poeng[0].length;
          const summer = Array.from({ length: sp.n }, (_, p) => sum(sp, p));
          const best = Math.min(...summer);
          const vinnere = summer.map((x, p) => (x === best ? p : -1)).filter((p) => p >= 0);
          const duVant = sp.modus === "mobil" && vinnere.length === 1 && vinnere[0] === 0;
          const mobilVant = sp.modus === "mobil" && !vinnere.includes(0);
          let tittel;
          if (!hull) tittel = R.t("Ingen vinner denne gangen");
          else if (duVant) tittel = R.t("Du vinner!");
          else if (vinnere.length === 1) tittel = R.t("{navn} vinner!", { navn: navn(sp, vinnere[0]) });
          else tittel = R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((p) => navn(sp, p))), n: vinnere.length });
          const etikett = `${R.flertall(hull, "hull", "hull")}${sp.modus === "mobil" ? ` · ${NIVANAVN[sp.niva].toLowerCase()}` : ""}`;
          const tekst = !hull ? "" : mobilVant ? R.t("Godt kjempa! Neste gang triller ballen din vei.") : duVant ? R.t("Godt jobba! Lavest sum: {n}.", { n: medFortegn(best) }) : R.t("Lavest sum: {n}.", { n: medFortegn(best) });
          const rek = sp.modus === "mobil" ? rekordHtml(S, sp.niva) : "";
          const rader = Array.from({ length: sp.n }, (_, p) => p).sort((a, b) => summer[a] - summer[b]);
          return `
            ${R.ui.banner({ tittel, etikett, tekst, stemning: mobilVant || !hull ? "lei" : "jubel" })}
            <ol class="gb-plasser" aria-label="${esc(R.t("Resultatet"))}">${rader
              .map((p) => `<li class="${summer[p] === best && hull ? "best" : ""}"><span class="gb-nr">${1 + summer.filter((x) => x < summer[p]).length}</span>${avatar(sp, p)}<b>${esc(navn(sp, p))}</b><span class="gb-sum">${esc(medFortegn(summer[p]))}</span></li>`)
              .join("")}</ol>
            ${hull > 1 ? scorekortHtml(sp) : ""}
            ${rek ? `<p class="gb-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen"))} · ${esc(NIVANAVN[sp.niva].toLowerCase())}</span>${rek}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.modus === "flere" ? sp.n : 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "⛳" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const summer = Array.from({ length: sp.n }, (_, p) => sum(sp, p));
          if (!sp.registrert) {
            sp.registrert = true;
            // «Kveldens gjeng» counts people only (higher is better there, so the sums turn round).
            const mennesker = Array.from({ length: sp.n }, (_, p) => p).filter((p) => erMenneske(sp, p));
            if (sp.poeng[0].length) R.kveld.registrer(mennesker.map((p) => ({ i: p, poeng: -summer[p] })));
            R.lagre();
          }
          const best = Math.min(...summer);
          if (sp.modus === "mobil" && summer[0] > best) lyd.tap();
          else if (sp.poeng[0].length) {
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
      var(el, e, S) {
        S.oppsett.var = el.dataset.v === "fire" ? "fire" : "seks";
        R.vis();
      },
      hull(el, e, S) {
        const h = Number(el.dataset.v);
        S.oppsett.hull = HULL.includes(h) ? h : 9;
        R.vis();
      },
      toer(el, e, S) {
        S.oppsett.toer = !S.oppsett.toer;
        R.vis();
      },
      snu(el, e, S) {
        S.oppsett.snu = !S.oppsett.snu;
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
      // Turn a card at the start (data-v = which; none = one at random).
      startsnu(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port) return;
        const r = sp.r;
        const p = meg(sp);
        if (!erMenneske(sp, p) || r.tur !== p) return;
        const skjulte = r.rutenett[p].map((c, i) => (c.opp ? -1 : i)).filter((i) => i >= 0);
        const i = el.dataset.v != null ? Number(el.dataset.v) : skjulte[Math.floor(Math.random() * skjulte.length)];
        if (!Golf.startSnu(r, p, i)) return;
        // The button turns both at once.
        if (el.dataset.v == null && !Golf.startKlar(r, p)) {
          const rest = r.rutenett[p].map((c, j) => (c.opp ? -1 : j)).filter((j) => j >= 0);
          Golf.startSnu(r, p, rest[Math.floor(Math.random() * rest.length)]);
        }
        lyd.snu();
        R.vibrer(8);
        R.vis();
      },
      titt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port) return;
        const p = meg(sp);
        if (!erMenneske(sp, p) || !Golf.titt(sp.r, p)) return;
        sp.viser = p;
        lyd.snu();
        R.vis();
      },
      husker(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.viser == null) return;
        sp.viser = null;
        lyd.snu();
        R.vis();
      },
      trekk(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || sp.viser != null) return;
        const r = sp.r;
        const p = meg(sp);
        if (hullFerdig(sp) || !erMenneske(sp, r.tur) || r.tur !== p) return R.toast(hullFerdig(sp) ? R.t("Hullet er ferdig") : R.t("Vent litt – {navn} tenker", { navn: navn(sp, r.tur) }));
        if (!Golf.trekk(r, p, rng())) {
          if (r.hand != null) R.toast(R.t("Bytt eller kast kortet du har"));
          return;
        }
        lyd.trekk();
        R.vibrer(8);
        R.vis();
      },
      ta(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || sp.viser != null) return;
        const r = sp.r;
        const p = meg(sp);
        if (!erMenneske(sp, r.tur) || r.tur !== p || !Golf.ta(r, p)) return;
        lyd.trekk();
        R.vibrer(8);
        R.vis();
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || el.dataset.v == null) return;
        const r = sp.r;
        const p = meg(sp);
        if (!erMenneske(sp, r.tur) || r.tur !== p || !Golf.bytt(r, p, Number(el.dataset.v))) return;
        nyttKast = r.kast[r.kast.length - 1];
        lyd.legg();
        R.vibrer(10);
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      kast(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port) return;
        const r = sp.r;
        const p = meg(sp);
        if (!erMenneske(sp, r.tur) || r.tur !== p || !Golf.kast(r, p)) return;
        nyttKast = r.kast[r.kast.length - 1];
        lyd.legg();
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      // Turn a hidden card after throwing one away (house rule; data-v = which).
      snukort(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port || el.dataset.v == null) return;
        const r = sp.r;
        const p = meg(sp);
        if (!erMenneske(sp, r.tur) || r.tur !== p || !Golf.snu(r, p, Number(el.dataset.v))) return;
        lyd.snu();
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      async bank(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.port) return;
        const r = sp.r;
        const p = meg(sp);
        if (!erMenneske(sp, r.tur) || r.tur !== p || !Golf.kanBanke(r, p)) return;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Banke på?"), R.t("De andre får én tur hver, og så telles hullet."), R.t("Bank på"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp || !Golf.bank(r, p)) return;
        lyd.bank();
        R.vibrer([20, 60, 20]);
        etterTrekk(S, p);
        R.vis();
        planleggMobil();
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || !hullFerdig(sp)) return;
        if (kampFerdig(sp)) return avsluttKamp(S);
        nyttHull(S);
        R.lyd.snu();
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && kampFerdig(S.spill)) avsluttKamp(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const summer = Array.from({ length: sp.n }, (_, p) => sum(sp, p));
        const best = Math.min(...summer);
        const hull = R.flertall(sp.poeng[0].length, "hull", "hull");
        let tekst;
        let linje1;
        let linje2;
        if (sp.modus === "mobil") {
          const niva = NIVANAVN[sp.niva].toLowerCase();
          const mobil = Math.min(...summer.slice(1));
          const mine = medFortegn(summer[0]);
          tekst = summer[0] < mobil ? R.t("Jeg slo mobilen i Golfballen ({niva}) med {mine} mot {mobil} på {hull}. Klarer du lavere?", { niva, mine, mobil: medFortegn(mobil), hull }) : R.t("Mobilen slo meg i Golfballen ({niva}): {mine} mot {mobil} på {hull}. Klarer du lavere?", { niva, mine, mobil: medFortegn(mobil), hull });
          linje2 = R.t("mot mobilen · {niva}", { niva });
          linje1 = `${mine} – ${medFortegn(mobil)}`;
        } else {
          const v = summer.map((x, p) => (x === best ? R.navn(p) : null)).filter(Boolean);
          tekst = R.t("{navn} vant Golfballen med {sum} på {hull}! Ta en runde du også.", { navn: R.ramsOpp(v), sum: medFortegn(best), hull });
          linje2 = R.t("{spillere} på én mobil", { spillere: R.flertall(sp.n, "spiller", "spillere") });
          linje1 = medFortegn(best);
        }
        R.del(R.t("Golfballen"), tekst, DEL_URL, { kort: { tittel: R.t("Golfballen"), linjer: [linje1, linje2, hull] } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        stoppMobil(); // the phone players wait while the sheet is open
        const ferdige = sp.poeng[0].length;
        const tekst = !ferdige ? R.t("Dere kan alltid starte et nytt.") : hullFerdig(sp) ? R.t("Dere går til kåringen.") : R.t("Dere går til kåringen. Hullet dere er midt i, teller ikke.");
        const ja = await R.bekreft(R.t("Avslutte spillet?"), tekst, R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return planleggMobil();
        if (!ferdige) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });
})();
