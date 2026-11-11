/* Pyramiden — a drinking game for 3–10 players (18+).
   Everyone gets four secret cards (pass the phone, hold to look – once). Fifteen cards lie face down
   in a pyramid and are turned one by one from the bottom row. Whoever has a card of the same value may
   hand out sips (row 1 = 1 sip … the top = 5) – once per player per card. The one who gets them
   accepts, passes – or calls bluff: the app knows every hand. The loser of that duel takes two extra
   (never more than 5 sips at a time) and the winner gets a point, so a wrong call costs in the
   standings, not only in the glass. A card shown as proof is swapped for a new secret card. Nobody can
   be handed sips more than twice on the same card. Full-screen water breaks before row 3 and before
   the top card. At the end everyone tries to remember their four cards. Points are for bluffing well,
   never for drinking; the app keeps track of who gave to whom (no sip counts per person). */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const T = window.RUSJ_DATA.tekster;

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

  const ANTALL_I_RAD = [5, 4, 3, 2, 1]; // row 1 (bottom) … row 5 (top)
  const FORSTE_I_RAD = [0, 5, 9, 12, 14];
  const ALLE = 15;
  const STRAFF = 2; // extra sips for the loser of a bluff duel …
  const MAKS = 5; // … but never more than 5 sips at a time
  const MAKS_FATT = 2; // nobody is handed sips more than twice on the same pyramid card
  const RESERVE = 8; // spare cards for swapping proven cards; fewer left → two decks
  const VANN_FOR = [9, 14]; // a water break before these cards: the first of row 3 and the top card
  const VIS_KRAV = 2; // the pyramid screen lists the latest hand-outs on the card; «Hvem ga hva» has all
  const straff = (rad) => Math.min(MAKS, rad + STRAFF);
  const radFor = (n) => (n >= 14 ? 5 : n >= 12 ? 4 : n >= 9 ? 3 : n >= 5 ? 2 : 1);
  const toStokker = (n) => n * 4 + ALLE + RESERVE > 52;
  // One hand-out per player per pyramid card.
  const harDeltUt = (sp, n, i) => sp.logg.some((x) => x.kort === n && x.fra === i);
  // Guard against ganging up: handed sips (as the target) twice on this card → can't be picked again.
  const skjermet = (sp, n, i) => sp.logg.filter((x) => x.kort === n && x.til === i && x.taker === i && x.slurker > 0).length >= MAKS_FATT;
  const slurkTekst = (n) => R.flertall(n, "slurk", "slurker");
  const art = (k) => KORT.MED_ARTIKKEL[KORT.verdiAv(k)]; // «en 7-er», «et ess»
  const uten = (k) => KORT.MED_ARTIKKEL[KORT.verdiAv(k)].replace(/^(en|et) /, ""); // «7-er», «ess»
  const harVerdi = (hand, k) => hand.some((x) => KORT.verdiAv(x) === KORT.verdiAv(k));
  const velg = (liste, n) => liste[Math.abs(n) % liste.length];
  const pagar = (S) => !!(S.spill && S.spill.fase !== "ferdig");
  const SKJERM = { del: "vis", pyramide: "pyramide", krav: "krav", nytt: "nytt", vann: "vann", finale: "finale", ferdig: "slutt" };

  let H; // the actions, so one can call another
  let snuNa = []; // ids of cards that should flip in on the next draw
  let spenning = false; // the bluff check is being revealed

  const nyStokk = (antall) => R.stokk(Array.from({ length: antall }, (_, i) => i % 52), R.rng(R.nyttFro()));

  function nyttSpill(S) {
    const n = R.klamp(S.antall || 4, 3, 10);
    const doble = toStokker(n); // eight or more players: two decks
    const stokk = nyStokk(doble ? 104 : 52);
    const hender = Array.from({ length: n }, (_, i) => stokk.slice(i * 4, i * 4 + 4));
    S.spill = {
      antall: n,
      finale: !!S.oppsett.finale,
      doble,
      hender,
      pyramide: stokk.slice(n * 4, n * 4 + ALLE),
      bunke: stokk.slice(n * 4 + ALLE), // spare cards: a proven card is swapped for one of these
      snudd: 0,
      fase: "del",
      del: { i: 0, sett: false },
      logg: [],
      krav: null,
      nytt: null, // { i, plass, sett }: a swapped-in card its owner has yet to see
      vann: [], // the water breaks taken (see VANN_FOR)
      angre: false,
      fin: { i: 0, steg: "spor", husket: [] },
      nr: R.heltall(0, 99),
      talt: false,
    };
    R.statistikk("start", { spillere: n, finale: !!S.oppsett.finale });
  }

  // A new secret card from the spare pile (a fresh deck if it ever runs out).
  function trekkNytt(sp) {
    if (!sp.bunke.length) sp.bunke = nyStokk(52);
    return sp.bunke.pop();
  }

  // Points from the log – for bluffing well, never for drinking (no sip counts per person):
  // 1 for each bluff nobody caught, 1 for each bluff you caught, and 1 each time you told the truth
  // and were called a bluffer anyway.
  function regnskap(sp) {
    const t = Array.from({ length: sp.antall }, () => ({ bloff: 0, avslort: 0, mistrodd: 0, poeng: 0 }));
    for (const x of sp.logg) {
      if (!x.sant && !x.ropte) t[x.fra].bloff += 1;
      if (!x.sant && x.ropte) t[x.til].avslort += 1;
      if (x.sant && x.ropte) t[x.fra].mistrodd += 1;
    }
    t.forEach((x) => (x.poeng = x.bloff + x.avslort + x.mistrodd));
    return t;
  }

  // Take the last hand-out off the log; a card swapped as proof goes back where it was.
  function trekkTilbake(sp) {
    const x = sp.logg.pop();
    if (x && x.bytte) {
      sp.hender[x.fra][x.bytte.plass] = x.bytte.gammelt;
      sp.bunke.push(x.bytte.nytt);
    }
    sp.nytt = null;
    return x;
  }

  // ---------- Markup ----------

  function pyramideHtml(sp) {
    let rader = "";
    for (let r = 5; r >= 1; r--) {
      rader += `<div class="py-rad" style="--r:${r}">`;
      for (let j = 0; j < ANTALL_I_RAD[r - 1]; j++) {
        const n = FORSTE_I_RAD[r - 1] + j;
        const opp = n < sp.snudd;
        const na = n === sp.snudd - 1;
        const etikett = opp ? `${KORT.Navn(sp.pyramide[n])}, rad ${r}` : `Rad ${r}, ikke snudd`;
        rader += KORT.html(opp ? sp.pyramide[n] : null, {
          opp,
          klasse: `py-kort${na ? " na" : ""}${opp && !na ? " brukt" : ""}`,
          attr: ` id="py-k${n}" role="img" aria-label="${esc(etikett)}"`,
        });
      }
      rader += "</div>";
    }
    return `<div class="py-pyramide" aria-label="Pyramiden">${rader}</div>`;
  }

  // One line per hand-out: who gave to whom, and how a bluff duel ended. Never how much anyone drank.
  function kravLinje(sp, x) {
    const fra = esc(R.navn(x.fra));
    const til = esc(R.navn(x.til));
    if (!x.ropte) return `<li>${fra} <span aria-hidden="true">→</span><span class="vh">delte ut til</span> ${til}</li>`;
    if (x.sant) return `<li>${til} ropte bløff – men ${fra} hadde kortet. +1 poeng til ${fra}.</li>`;
    return `<li class="avslort">${fra} ble tatt i bløff av ${til}. +1 poeng til ${til}.</li>`;
  }

  // The glass on the water break.
  const VANNGLASS = `<svg class="py-vannglass" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
    <defs><clipPath id="py-glass-innside"><path d="M24 22 L34 132 Q35 140 44 140 H76 Q85 140 86 132 L96 22 Z"/></clipPath></defs>
    <g clip-path="url(#py-glass-innside)">
      <path class="py-vannflate" d="M-60 66 Q-45 58 -30 66 T0 66 T30 66 T60 66 T90 66 T120 66 T150 66 T180 66 V160 H-60 Z" fill="var(--himmel)"/>
      <circle class="py-boble" cx="48" cy="122" r="4" fill="#fff" opacity=".7"/>
      <circle class="py-boble to" cx="70" cy="130" r="3" fill="#fff" opacity=".6"/>
    </g>
    <path d="M20 18 L31 133 Q32 144 44 144 H76 Q88 144 89 133 L100 18 Z" fill="none" stroke="var(--papir)" stroke-width="6" stroke-linejoin="round"/>
    <path d="M36 34 L42 112" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
  </svg>`;

  // Everything that happened so far, card by card («Hvem ga hva»).
  function loggHtml(sp) {
    if (!sp.logg.length) return `<p class="hjelp">Ingen har delt ut noe ennå.</p>`;
    const kort = [...new Set(sp.logg.map((x) => x.kort))];
    return `<ol class="py-logg">${kort
      .map((n) => `<li><b>Rad ${radFor(n)} · ${esc(KORT.Navn(sp.pyramide[n]))}</b><ul>${sp.logg.filter((x) => x.kort === n).map((x) => kravLinje(sp, x)).join("")}</ul></li>`)
      .join("")}</ol>`;
  }

  function prisHtml(ikon, tittel, hvem, tekst, farge) {
    return `<li class="py-pris" style="--vf: ${farge}">
      <span class="py-pris-ikon" aria-hidden="true">${ikon}</span>
      <span class="py-pris-tekst"><span class="etikett">${esc(tittel)}</span><b>${esc(hvem)}</b><span>${esc(tekst)}</span></span>
    </li>`;
  }

  const flipp = (rot) => {
    for (const id of snuNa) {
      const el = document.getElementById(id);
      if (!el || R.rolig()) continue;
      el.classList.remove("sk-opp");
      void el.offsetWidth;
      el.classList.add("sk-opp");
    }
    snuNa = [];
  };

  // After a card has been turned: sound, a word for screen readers, the question in view.
  function etterSnu(S) {
    const sp = S.spill;
    R.lyd.snu();
    R.vibrer(12);
    const k = sp.pyramide[sp.snudd - 1];
    R.si(`Rad ${radFor(sp.snudd - 1)}: ${KORT.Navn(k)}. Har noen ${art(k)}?`);
    const h = R.$("#skjerm-tittel");
    if (h) h.scrollIntoView({ block: "nearest", behavior: R.rolig() ? "auto" : "smooth" });
  }

  // ---------- The game ----------

  R.start({
    id: "pyramiden",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: Math.max(3, Math.min(10, R.felles.navn.filter((n) => String(n || "").trim()).length || 4)),
      oppsett: { finale: true },
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ finale: true }, S.oppsett || {});
      S.antall = R.klamp(Number(S.antall) || 4, 3, 10);
      const sp = S.spill;
      if (sp) {
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= 3 && sp.antall <= 10 &&
          Array.isArray(sp.hender) && sp.hender.length === sp.antall && sp.hender.every((h) => Array.isArray(h) && h.length === 4) &&
          Array.isArray(sp.pyramide) && sp.pyramide.length === ALLE &&
          Number.isInteger(sp.snudd) && sp.snudd >= 0 && sp.snudd <= ALLE &&
          Array.isArray(sp.logg) && SKJERM[sp.fase] && sp.fin && Array.isArray(sp.fin.husket);
        if (!ok) S.spill = null;
        else {
          sp.logg = sp.logg.filter((x) => x && x.fra < sp.antall && x.til < sp.antall && x.taker < sp.antall && x.kort < sp.snudd);
          // Games saved before cards could be swapped and before the water breaks were screens.
          // The spare pile such a game never had: the cards of its deck(s) that are not in play.
          if (!Array.isArray(sp.bunke)) {
            const igjen = Array.from({ length: sp.doble ? 104 : 52 }, (_, i) => i % 52);
            for (const k of [...sp.hender.flat(), ...sp.pyramide]) {
              const p = igjen.indexOf(k);
              if (p >= 0) igjen.splice(p, 1);
            }
            sp.bunke = R.stokk(igjen, R.rng(R.nyttFro()));
          }
          if (!Array.isArray(sp.vann)) sp.vann = [];
          const ny = sp.nytt;
          if (!(ny && Number.isInteger(ny.i) && ny.i < sp.antall && ny.plass >= 0 && ny.plass < 4)) sp.nytt = null;
          if (sp.fase === "krav" && !(sp.krav && sp.snudd > 0)) {
            sp.fase = "pyramide";
            sp.krav = null;
          }
          if (sp.fase === "krav" && sp.krav.steg === "resultat" && !sp.logg.length) {
            sp.fase = "pyramide";
            sp.krav = null;
          }
          if (sp.fase === "nytt" && !sp.nytt) sp.fase = "pyramide";
          if (sp.fase === "pyramide" && sp.nytt) sp.fase = "nytt"; // a swapped-in card is never skipped
          if (sp.fase === "vann" && !(sp.snudd > 0 && sp.snudd < ALLE)) sp.fase = "pyramide";
        }
      }
      if (["vis", "pyramide", "krav", "nytt", "vann", "finale", "slutt"].includes(S.skjerm)) S.skjerm = S.spill ? SKJERM[S.spill.fase] : "hjem";
    },

    regler: {
      intro: "Fire hemmelige kort hver, femten kort i en pyramide – og en god porsjon bløff.",
      steg: [
        ["Se kortene dine", "Mobilen går rundt. Hold fingeren på kortet og husk de fire kortene dine – du får ikke se dem igjen før finalen."],
        ["Snu pyramiden", "Kortene snus ett og ett nedenfra. Har du samme verdi, deler du ut slurker: 1 på nederste rad, 5 på toppen. Hver spiller kan dele ut én gang per kort."],
        ["Godta eller rop bløff", "Den som får slurkene, kan rope bløff – mobilen vet alt. Taperen av duellen tar to slurker ekstra, og vinneren får 1 poeng. Et kort som vises som bevis, byttes mot et nytt hemmelig kort."],
      ],
      tips: [
        "Du kan bløffe selv om du ikke har kortet. Slipper du unna, får du 1 poeng – det avsløres først på kåringen.",
        "Roper du bløff og tar feil, får den andre poenget. Tenk deg om!",
        "Aldri mer enn 5 slurker om gangen, og ingen kan få slurker fra mer enn to spillere på samme kort.",
        "Små slurker. Vann, brus og alkoholfritt teller like mye, og alle kan stå over.",
        "Før rad 3 og før toppkortet er det vannpause for alle.",
        "«Hvem ga hva» viser alt som har skjedd, og «Angre» tar tilbake siste utdeling.",
        "I finalen sier alle kortene sine høyt. Hvert kort du har glemt, gir 1 slurk.",
      ],
    },

    hemmelig: {
      innhold(S, id) {
        const i = Number(String(id).slice(1));
        const hand = (S.spill && S.spill.hender[i]) || [];
        // "n…": the one new card a player got after proving a claim.
        if (String(id).charAt(0) === "n") {
          const ny = S.spill && S.spill.nytt;
          if (!ny || ny.i !== i) return { html: "" };
          return {
            html: `<span class="kort-etikett">Nytt kort til ${esc(R.navn(i))}</span>
              <span class="py-hand py-hand-ett">${KORT.html(hand[ny.plass], { opp: true, stor: true })}</span>
              <span class="py-husk">Husk det!</span>`,
          };
        }
        return {
          // Two layouts: four big classic cards (2 × 2), or one row of compact cards on short screens.
          html: `<span class="kort-etikett">Kortene til ${esc(R.navn(i))}</span>
            <span class="py-hand py-hand-stor">${hand.map((k) => KORT.html(k, { opp: true, stor: true })).join("")}</span>
            <span class="py-hand py-hand-liten">${hand.map((k) => KORT.html(k, { opp: true })).join("")}</span>
            <span class="py-husk">Husk dem!</span>`,
        };
      },
      sett(S, id) {
        const sp = S.spill;
        if (!sp) return;
        if (S.skjerm === "nytt" && sp.nytt && id === "n" + sp.nytt.i && !sp.nytt.sett) {
          sp.nytt.sett = true;
          sp.angre = false; // the new card has been seen: the hand-out stands
          R.vis();
          const ferdig = R.$('[data-h="nyttferdig"]');
          if (ferdig) ferdig.classList.add("pop");
          return;
        }
        if (S.skjerm !== "vis" || id !== "p" + sp.del.i || sp.del.sett) return;
        sp.del.sett = true;
        R.vis();
        const knapp = R.$('[data-h="vist"]');
        if (knapp) knapp.classList.add("pop");
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Fire hemmelige kort. Femten i pyramiden.<br><em>Bløff deg gjennom pyramiden!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? (S.spill.fase === "del" ? "Fortsett · utdelingen" : S.spill.fase === "finale" ? "Fortsett · finalen" : `Fortsett · ${S.spill.snudd} av ${ALLE} kort`) : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–10", "spillere"],
              ["15", "kort i pyramiden"],
              ["🥤", "alkoholfritt teller"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          ${R.ui.spillere({ min: 3, max: 10, hjelp: toStokker(R.klamp(S.antall || 4, 3, 10)) ? "Med åtte eller flere bruker vi to kortstokker." : "Alle trenger et navn – mobilen holder styr på hvem som har hvilke kort." })}
          ${R.ui.bryter("finale", S.oppsett.finale, "Hukommelsesfinale", "Til slutt sier alle kortene sine høyt. Hvert glemte kort gir 1 slurk.")}
          <p class="hjelp">Små slurker. Vann, brus og alkoholfritt teller like mye – og alle kan stå over.</p>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`,
      },

      // Pass the phone: everyone holds to see their four cards, once.
      vis: {
        tittel: "Del ut kortene",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.del.i;
          const siste = i === sp.antall - 1;
          return `
            ${R.ui.fremdrift(sp.antall, i)}
            <div class="py-mottaker">
              <p class="etikett">Gi mobilen til</p>
              <h1 id="skjerm-tittel" class="spillernavn">${R.avatar(i, "stor")}<span>${esc(R.navn(i))}</span></h1>
            </div>
            ${R.ui.mappe({ id: "p" + i, etikett: "Dine fire kort", tekst: "Hold fingeren på kortet for å se", etikettAria: `Hold fingeren på kortet for å se kortene til ${R.navn(i)}` })}
            <p class="hjelp">${sp.del.sett ? "Husket alle fire? Trykk «Ferdig» og gi mobilen videre." : `Bare ${esc(R.navn(i))} skal se. ${esc(velg(T.husk, i))}`}</p>
            ${R.ui.dokk(R.ui.knapp(siste ? "Alle har sett – til pyramiden!" : `Ferdig – gi til ${R.navn(i + 1)}`, "vist", { av: !sp.del.sett }))}`;
        },
      },

      pyramide: {
        tittel: (S) => (S.spill.snudd ? `Rad ${radFor(S.spill.snudd - 1)} av 5` : "Pyramiden"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = sp.snudd - 1;
          let info;
          let dokk;
          const lenker = R.ui.lenkerad(sp.angre ? R.ui.lenke("Angre", "angre") : "", sp.logg.length ? R.ui.lenke("Hvem ga hva", "logg") : "", R.ui.lenke("Avslutt", "avslutt"));
          if (n < 0) {
            info = `<div class="py-info">
              <h1 id="skjerm-tittel">Klar for pyramiden?</h1>
              <p class="hjelp">Kortene snus ett og ett, nederste rad først. Har du samme verdi på hånda – del ut slurker! Eller bløff.</p>
            </div>`;
            dokk = R.ui.dokk(R.ui.knapp("Snu første kort", "snu", { variant: "stor" }), lenker);
          } else {
            const k = sp.pyramide[n];
            const rad = radFor(n);
            const krav = sp.logg.filter((x) => x.kort === n);
            // One hand-out per player per card: when everyone has had theirs, the card is done.
            const alleHar = Array.from({ length: sp.antall }, (_, i) => i).every((i) => harDeltUt(sp, n, i));
            // The latest hand-outs on this card (the rest are in «Hvem ga hva»); short and landscape
            // screens get one line instead of the list, so the buttons never push the question away.
            const flere = krav.length - VIS_KRAV;
            const status = alleHar
              ? `<p class="hjelp py-status">Alle har delt ut på dette kortet.</p>`
              : krav.length
                ? `<p class="hjelp py-status py-sum">${krav.length} av ${sp.antall} har delt ut på dette kortet.</p>`
                : "";
            info = `<div class="py-info" aria-live="polite">
              <p class="etikett">Rad ${rad} · ${esc(slurkTekst(rad))}</p>
              <h1 id="skjerm-tittel">Har noen ${esc(art(k))}?</h1>
              ${status}
              ${
                krav.length
                  ? `<ul class="py-krav">${krav.slice(-VIS_KRAV).map((x) => kravLinje(sp, x)).join("")}</ul>${flere > 0 ? `<p class="hjelp py-flere">Og ${flere} til – se «Hvem ga hva».</p>` : ""}`
                  : `<p class="hjelp">${esc(velg(T.sporsmal, n + sp.nr))}</p>`
              }
            </div>`;
            const videre = n === ALLE - 1 ? R.ui.knapp(sp.finale ? "Til finalen" : "Til kåringen", "ferdig") : R.ui.knapp("Snu neste", "snu");
            dokk = R.ui.dokk(`<div class="knapprad py-valg">${R.ui.knapp(`Jeg har ${art(k)}!`, "krav", { variant: "lilla", ikon: "🙋", av: alleHar })}${videre}</div>`, lenker);
          }
          return `${pyramideHtml(sp)}${info}${dokk}`;
        },
        etter: flipp,
      },

      // Someone claims the card: who, to whom, accept / pass / bluff, and how it ended.
      krav: {
        tittel: (S) => `Rad ${radFor(S.spill.snudd - 1)} · ${slurkTekst(radFor(S.spill.snudd - 1))}`,
        tilbake: (S) => {
          const sp = S.spill;
          spenning = false;
          // A swapped-in card must be seen by its owner before the game goes on: from that verdict,
          // back leads out to the game's home, and «Fortsett» comes back to the verdict.
          if (sp.nytt && !sp.nytt.sett) return "hjem";
          sp.krav = null;
          sp.fase = "pyramide";
          return "pyramide";
        },
        vis(S) {
          const sp = S.spill;
          const kr = sp.krav;
          const n = sp.snudd - 1;
          const k = sp.pyramide[n];
          const rad = radFor(n);
          const kortet = `<div class="py-krav-kort">${KORT.html(k, { opp: true, stor: true })}</div>`;
          const alle = Array.from({ length: sp.antall }, (_, i) => i);
          const navn = (liste) => R.ramsOpp(liste.map((i) => R.navn(i)));
          if (kr.steg === "hvem") {
            // One hand-out per player per card.
            const brukt = alle.filter((i) => harDeltUt(sp, n, i));
            return `
              <div class="py-krav-topp">${kortet}<div><p class="etikett">Rad ${rad} · ${esc(slurkTekst(rad))}</p><h1 id="skjerm-tittel">Hvem har ${esc(art(k))}?</h1></div></div>
              ${R.ui.velgere("fra", alle, null, { av: (i) => harDeltUt(sp, n, i) })}
              ${brukt.length ? `<p class="hjelp py-regel">${esc(navn(brukt))} har delt ut på dette kortet. Én gang hver!</p>` : ""}
              ${R.ui.dokk(R.ui.lenkerad(R.ui.lenke("Avbryt", "avbryt")))}`;
          }
          if (kr.steg === "til") {
            // Nobody is handed sips more than twice on the same card.
            const andre = alle.filter((i) => i !== kr.fra);
            const fulle = andre.filter((i) => skjermet(sp, n, i));
            return `
              <div class="py-krav-topp">${kortet}<div><p class="etikett">${esc(R.navn(kr.fra))} deler ut</p><h1 id="skjerm-tittel">${esc(slurkTekst(rad))} – til hvem?</h1></div></div>
              ${R.ui.velgere("til", andre, null, { av: (i) => skjermet(sp, n, i) })}
              ${fulle.length ? `<p class="hjelp py-regel">${esc(navn(fulle))} har fått slurker to ganger på dette kortet. Velg en annen!</p>` : ""}
              ${R.ui.dokk(R.ui.lenkerad(R.ui.lenke("Tilbake", "kravtilbake"), R.ui.lenke("Avbryt", "avbryt")))}`;
          }
          if (kr.steg === "svar")
            return `
              <div class="py-krav-topp">${kortet}<div><p class="etikett">${esc(R.navn(kr.til))}, tror du på det?</p><h1 id="skjerm-tittel">${esc(R.navn(kr.fra))} sier: «Jeg har ${esc(art(k))}!»</h1></div></div>
              <div class="py-duell">
                <p><b>Godta:</b> ${esc(R.navn(kr.til))} tar ${esc(slurkTekst(rad))}.</p>
                <p><b>Rop bløff:</b> Mobilen sjekker kortene. Taperen tar ${esc(slurkTekst(straff(rad)))}, og vinneren får 1 poeng.</p>
              </div>
              ${R.ui.dokk(
                `<div class="knapprad py-valg">${R.ui.knapp("Jeg tror det", "godta", { variant: "mynte", ikon: "🤝" })}${R.ui.knapp("Bløff!", "bloff", { variant: "rosa", ikon: "🕵️" })}</div>`,
                R.ui.lenkerad(R.ui.lenke("Står over", "staover"), R.ui.lenke("Tilbake", "kravtilbake"), R.ui.lenke("Avbryt", "avbryt")),
              )}`;
          // Result
          const x = sp.logg[sp.logg.length - 1];
          if (spenning)
            return `
              <div class="py-sjekk">
                <p class="etikett">Mobilen sjekker kortene til ${esc(R.navn(x.fra))} …</p>
                <h1 id="skjerm-tittel">Har ${esc(R.navn(x.fra))} ${esc(art(k))}?</h1>
                <div class="py-hand py-hand-skjult" aria-hidden="true">${sp.hender[x.fra].map(() => KORT.html(null)).join("")}</div>
              </div>
              ${R.ui.dokk("")}`;
          const fraNavn = R.navn(x.fra);
          const tilNavn = R.navn(x.til);
          let stempel;
          let tekst;
          let bevisHtml = "";
          let bytteHtml = "";
          let poeng = "";
          if (x.over) {
            stempel = `<span class="stempel lampe">Står over</span>`;
            tekst = `${tilNavn} står over – helt greit. Ingen slurker denne gangen.`;
          } else if (!x.ropte) {
            stempel = `<span class="stempel mynte">Skål!</span>`;
            tekst = `${velg(T.godtatt, n + sp.nr)} ${tilNavn} tar ${slurkTekst(x.slurker)}.`;
          } else if (x.sant) {
            // The duel was lost by the caller: the proof is shown, and that card leaves the hand.
            stempel = `<span class="stempel lampe">Sant!</span>`;
            tekst = `${velg(T.sant, n + sp.nr)} ${tilNavn} tar ${slurkTekst(x.slurker)}.`;
            poeng = `+1 poeng til ${fraNavn}`;
            const bevis = x.bytte ? x.bytte.gammelt : sp.hender[x.fra].find((y) => KORT.verdiAv(y) === KORT.verdiAv(k));
            bevisHtml = bevis == null ? "" : `<div class="py-hand py-bevis">${KORT.html(bevis, { opp: true, stor: true, attr: ' id="py-bevis0"' })}</div>`;
            bytteHtml = x.bytte ? `<p class="py-bytte">Kortet er brukt. ${esc(fraNavn)} får et nytt hemmelig kort.</p>` : "";
          } else {
            stempel = `<span class="stempel">Bløff!</span>`;
            tekst = `${velg(T.bloff, n + sp.nr)} ${fraNavn} har ingen ${uten(k)} og tar ${slurkTekst(x.slurker)} selv.`;
            poeng = `+1 poeng til ${tilNavn}`;
          }
          const venter = sp.nytt && !sp.nytt.sett;
          return `
            <div class="py-krav-topp">${kortet}<div><p class="etikett">Rad ${rad} · ${esc(KORT.Navn(k))}</p>
              <p class="py-par"><span class="py-person">${R.avatar(x.fra)}<span>${esc(fraNavn)}</span></span><b aria-label="delte ut til">→</b><span class="py-person">${R.avatar(x.til)}<span>${esc(tilNavn)}</span></span></p></div></div>
            <div class="py-resultat" role="status">
              <h1 class="vh" id="skjerm-tittel">${esc(tekst)}${poeng ? ` ${esc(poeng)}.` : ""}</h1>
              <div class="stempel-sted">${stempel}</div>
              ${bevisHtml}
              <p class="py-resultat-tekst">${esc(tekst)}</p>
              ${poeng ? `<p class="py-poeng">${esc(poeng)}</p>` : ""}
              ${bytteHtml}
              ${x.over || poeng ? "" : `<p class="py-fot">${esc(velg(T.fot, n + sp.nr))}</p>`}
            </div>
            ${R.ui.dokk(
              venter ? R.ui.knapp(`Gi mobilen til ${fraNavn}`, "tilnytt", { variant: "stor" }) : R.ui.knapp("Tilbake til pyramiden", "tilpyramiden", { variant: "stor" }),
              sp.angre ? R.ui.lenkerad(R.ui.lenke("Angre", "angre")) : "",
            )}`;
        },
        etter: flipp,
      },

      // After a proven claim: the owner alone sees the card that replaced the one shown as proof.
      nytt: {
        tittel: "Nytt kort",
        // Not seen yet: back to the verdict, where «Angre» is. Seen: the hand-out stands.
        tilbake: (S) => {
          const sp = S.spill;
          const x = sp.logg[sp.logg.length - 1];
          if (!sp.nytt || sp.nytt.sett || !sp.angre || !x) return "hjem";
          spenning = false;
          sp.krav = { steg: "resultat", fra: x.fra, til: x.til };
          sp.fase = "krav";
          return "krav";
        },
        vis(S) {
          const sp = S.spill;
          const ny = sp.nytt;
          const i = ny.i;
          return `
            <div class="py-mottaker">
              <p class="etikett">Gi mobilen til</p>
              <h1 id="skjerm-tittel" class="spillernavn">${R.avatar(i, "stor")}<span>${esc(R.navn(i))}</span></h1>
            </div>
            ${R.ui.mappe({ id: "n" + i, etikett: "Ditt nye kort", tekst: "Hold fingeren på kortet for å se", etikettAria: `Hold fingeren på kortet for å se det nye kortet til ${R.navn(i)}` })}
            <p class="hjelp">${ny.sett ? "Husket det? Kortet du viste fram, er ute av spillet." : `Bare ${esc(R.navn(i))} skal se. Kortet som ble vist fram, er byttet ut.`}</p>
            ${R.ui.dokk(R.ui.knapp("Ferdig – til pyramiden", "nyttferdig", { av: !ny.sett }))}`;
        },
      },

      // A real pause: water for everyone before row 3 and before the top card.
      vann: {
        tittel: "Vannpause",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const topp = sp.snudd >= ALLE - 1;
          return `
            <div class="py-vannpause">
              ${VANNGLASS}
              <div class="py-vanntekst">
                <p class="etikett">${topp ? "Før toppkortet" : `Før rad ${radFor(sp.snudd)}`}</p>
                <h1 id="skjerm-tittel">Vannpause!</h1>
                <p class="ingress">${esc(velg(topp ? T.vannTopp : T.vann, sp.nr))}</p>
              </div>
            </div>
            ${R.ui.dokk(R.ui.knapp("Skål i vann!", "vannferdig", { variant: "himmel" }), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn() {
          R.lyd.pop();
          R.vibrer(20);
        },
      },

      // Memory finale: everyone says their four cards out loud, then the cards are turned.
      finale: {
        tittel: "Finalen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const f = sp.fin;
          const i = f.i;
          const hand = sp.hender[i];
          const opp = f.steg !== "spor";
          const kort = `<div class="py-hand py-finale-hand">${hand.map((k, n) => KORT.html(k, { opp, stor: true, attr: ` id="py-f${n}"` })).join("")}</div>`;
          const topp = `${R.ui.fremdrift(sp.antall, i)}<div class="py-hvem">${R.avatar(i, "mid")}<div><p class="etikett">Husker du kortene dine?</p><h1 id="skjerm-tittel">${esc(R.navn(i))}</h1></div></div>`;
          if (f.steg === "spor")
            return `${topp}
              ${kort}
              <p class="ingress py-midt">Si alle fire kortene høyt – så snur vi dem. Hvert glemte kort gir 1 slurk.</p>
              ${R.ui.dokk(R.ui.knapp(`Snu kortene til ${R.navn(i)}`, "visfasit", { variant: "stor" }), i === 0 ? R.ui.lenkerad(R.ui.lenke("Hopp over finalen", "kaaring")) : "")}`;
          if (f.steg === "vis")
            return `${topp}
              ${kort}
              <h2 class="py-midt">Hvor mange husket ${esc(R.navn(i))}?</h2>
              ${R.ui.dokk(`<div class="py-tall">${[0, 1, 2, 3, 4].map((t) => `<button class="knapp-2" data-h="husket" data-v="${t}" aria-label="${t} av 4">${t}</button>`).join("")}</div>`)}`;
          const h = f.husket[i];
          const siste = i === sp.antall - 1;
          return `${topp}
            ${kort}
            <div class="py-resultat" role="status">
              <div class="stempel-sted"><span class="stempel ${h === 4 ? "mynte" : "lampe"}">${h} av 4</span></div>
              <p class="py-resultat-tekst">${esc(h === 4 ? velg(T.elefant, i + sp.nr) : `${R.navn(i)} glemte ${4 - h} – ta ${slurkTekst(4 - h)}.`)}</p>
            </div>
            ${R.ui.dokk(R.ui.knapp(siste ? "Til kåringen" : `Neste: ${R.navn(i + 1)}`, "nestefinale", { variant: "stor" }), R.ui.lenkerad(R.ui.lenke("Angre", "angrefinale")))}`;
        },
        etter: flipp,
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = regnskap(sp);
          const rader = t.map((x, i) => ({ i, poeng: x.poeng }));
          const best = Math.max(...rader.map((r) => r.poeng));
          const vinnere = rader.filter((r) => r.poeng === best && best > 0).map((r) => r.i);
          const topp = (felt) => {
            const maks = Math.max(0, ...t.map((x) => x[felt]));
            return maks ? { maks, hvem: t.map((x, i) => (x[felt] === maks ? i : -1)).filter((i) => i >= 0) } : null;
          };
          const bloff = topp("bloff");
          const avslort = topp("avslort");
          const mistrodd = topp("mistrodd");
          const navn = (liste) => R.ramsOpp(liste.map((i) => R.navn(i)));
          const priser = [
            bloff
              ? prisHtml("🎭", "Bløffmester", navn(bloff.hvem), `Bløffet ${bloff.maks === 1 ? "én gang" : `${bloff.maks} ganger`} uten å bli tatt. Nå vet dere det!`, "var(--lilla)")
              : prisHtml("🎭", "Bløffmester", "Ingen", "Ingen slapp unna med en bløff i kveld. For en ærlig gjeng!", "var(--lilla)"),
            avslort
              ? prisHtml("🔍", "Skarpeste øye", navn(avslort.hvem), `Avslørte ${avslort.maks === 1 ? "én bløff" : `${avslort.maks} bløffer`}.`, "var(--himmel)")
              : "",
            mistrodd
              ? prisHtml("😇", "Uskyldig dømt", navn(mistrodd.hvem), `Ble kalt bløffmaker ${mistrodd.maks === 1 ? "én gang" : `${mistrodd.maks} ganger`} – og hadde kortet.`, "var(--lampe)")
              : "",
          ];
          const husket = sp.fin.husket.map((h, i) => (typeof h === "number" ? { h, i } : null)).filter(Boolean);
          if (husket.length) {
            const maks = Math.max(...husket.map((x) => x.h));
            const hvem = husket.filter((x) => x.h === maks).map((x) => x.i);
            priser.push(prisHtml("🐘", "Elefanthukommelse", navn(hvem), maks === 4 ? "Husket alle fire kortene sine." : `Husket ${maks} av 4 kort.`, "var(--mynte)"));
          }
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">Flest poeng${best ? ` · ${best}` : ""}</p>
              <h1 id="skjerm-tittel">${vinnere.length ? esc(`${R.ramsOpp(vinnere.map((i) => R.navn(i)))} vinner!`) : "Ingen vinner denne gangen"}</h1>
              ${vinnere.length ? "" : `<p class="ingress">Ingen bløffet seg unna, og ingen ropte bløff. For en ærlig gjeng!</p>`}
            </div>
            ${R.ui.pall(rader)}
            <ul class="py-priser">${priser.join("")}</ul>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Poeng</h2></div>
              <p class="hjelp">1 poeng for hver bløff som slapp unna, hver bløff du avslørte, og hver gang du ble kalt bløffmaker uten grunn.</p>
              ${R.ui.poengliste(rader)}
              ${sp.logg.length ? R.ui.lenke("Se hvem som ga hva", "logg") : ""}
            </section>
            <div class="py-vann"><span aria-hidden="true">💧</span><p>Drikk et glass vann før neste spill!</p></div>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          const rader = regnskap(sp).map((x, i) => ({ i, poeng: x.poeng }));
          if (!sp.talt) {
            sp.talt = true;
            R.kveld.registrer(rader);
            R.statistikk("ferdig", { spillere: sp.antall, krav: sp.logg.length, finale: sp.fin.husket.length > 0 });
            R.lagre();
          }
          if (rader.some((r) => r.poeng > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil(SKJERM[S.spill.fase]);
      },
      finale(el, e, S) {
        S.oppsett.finale = !S.oppsett.finale;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("vis");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("vis");
      },
      endre: () => R.gaTil("oppsett"),
      vist(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "del" || !sp.del.sett) return;
        if (sp.del.i < sp.antall - 1) {
          sp.del = { i: sp.del.i + 1, sett: false };
          R.gaTil("vis");
          return;
        }
        sp.fase = "pyramide";
        R.gaTil("pyramide");
      },
      // Turn the next card – after the water break when one is due (before row 3 and the top card).
      snu(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "pyramide" || sp.snudd >= ALLE) return;
        sp.angre = false;
        if (VANN_FOR.includes(sp.snudd) && !sp.vann.includes(sp.snudd)) {
          sp.fase = "vann";
          R.gaTil("vann");
          return;
        }
        sp.snudd += 1;
        snuNa = ["py-k" + (sp.snudd - 1)];
        R.vis();
        etterSnu(S);
      },
      // «Skål i vann!»: the break is over, and the card that was asked for is turned.
      vannferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "vann") return;
        if (!sp.vann.includes(sp.snudd)) sp.vann.push(sp.snudd);
        sp.fase = "pyramide";
        if (sp.snudd < ALLE) {
          sp.snudd += 1;
          snuNa = ["py-k" + (sp.snudd - 1)];
        }
        R.gaTil("pyramide");
        etterSnu(S);
      },
      krav(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "pyramide" || !sp.snudd) return;
        const n = sp.snudd - 1;
        if (Array.from({ length: sp.antall }, (_, i) => i).every((i) => harDeltUt(sp, n, i))) return;
        sp.angre = false;
        sp.krav = { steg: "hvem", fra: null, til: null };
        sp.fase = "krav";
        R.lyd.pop();
        R.gaTil("krav");
      },
      fra(el, e, S) {
        const sp = S.spill;
        const kr = sp.krav;
        if (!kr || kr.steg !== "hvem") return;
        const fra = Number(el.dataset.v);
        if (!(fra >= 0 && fra < sp.antall) || harDeltUt(sp, sp.snudd - 1, fra)) return; // one hand-out per card
        kr.fra = fra;
        kr.steg = "til";
        R.gaTil("krav");
      },
      til(el, e, S) {
        const sp = S.spill;
        const kr = sp.krav;
        if (!kr || kr.steg !== "til") return;
        const til = Number(el.dataset.v);
        if (!(til >= 0 && til < sp.antall) || til === kr.fra || skjermet(sp, sp.snudd - 1, til)) return; // no ganging up
        kr.til = til;
        kr.steg = "svar";
        R.gaTil("krav");
      },
      kravtilbake(el, e, S) {
        const kr = S.spill.krav;
        if (!kr || kr.steg === "resultat") return;
        kr.steg = kr.steg === "svar" ? "til" : "hvem";
        R.gaTil("krav");
      },
      avbryt(el, e, S) {
        const sp = S.spill;
        if (sp.krav && sp.krav.steg === "resultat") return;
        sp.krav = null;
        sp.fase = "pyramide";
        R.gaTil("pyramide");
      },
      // Accept (take the row's sips) or pass (no sips): either way the claim stands unchecked, so a
      // bluff that slipped through stays secret until the crowning.
      godta(el, e, S, over) {
        const sp = S.spill;
        const kr = sp.krav;
        if (!kr || kr.steg !== "svar") return;
        const n = sp.snudd - 1;
        const rad = radFor(n);
        const sant = harVerdi(sp.hender[kr.fra], sp.pyramide[n]);
        sp.logg.push({ kort: n, rad, fra: kr.fra, til: kr.til, sant, ropte: false, over: over === true, slurker: over === true ? 0 : rad, taker: kr.til, bytte: null });
        sp.angre = true;
        kr.steg = "resultat";
        if (over === true) R.lyd.pop();
        else R.lyd.riktig();
        R.vibrer(20);
        R.gaTil("krav");
      },
      staover: (el, e, S) => H.godta(el, e, S, true),
      // Call the bluff: a little suspense, then the truth (decided and saved at once). The loser takes
      // the sips (two extra, never more than five) and the winner gets a point. A card shown as proof
      // is swapped for a new secret card straight away.
      async bloff(el, e, S) {
        const sp = S.spill;
        const kr = sp.krav;
        if (!kr || kr.steg !== "svar") return;
        const n = sp.snudd - 1;
        const rad = radFor(n);
        const hand = sp.hender[kr.fra];
        const plass = hand.findIndex((y) => KORT.verdiAv(y) === KORT.verdiAv(sp.pyramide[n]));
        const sant = plass >= 0;
        let bytte = null;
        if (sant) {
          bytte = { plass, gammelt: hand[plass], nytt: trekkNytt(sp) };
          hand[plass] = bytte.nytt;
          sp.nytt = { i: kr.fra, plass, sett: false };
        }
        sp.logg.push({ kort: n, rad, fra: kr.fra, til: kr.til, sant, ropte: true, over: false, slurker: straff(rad), taker: sant ? kr.til : kr.fra, bytte });
        sp.angre = true;
        kr.steg = "resultat";
        spenning = !R.rolig();
        R.gaTil("krav");
        if (spenning) {
          const fortsatt = R.vakt();
          R.lyd.trommevirvel(1.1);
          await R.vent(1250);
          spenning = false;
          if (!fortsatt()) return;
          if (sant) snuNa = ["py-bevis0"];
          R.vis();
        }
        if (sant) R.lyd.riktig();
        else R.lyd.latter();
        R.vibrer([30, 50, 90]);
        const x = sp.logg[sp.logg.length - 1];
        R.si(
          sant
            ? `${R.navn(x.fra)} hadde kortet. ${R.navn(x.til)} tar ${slurkTekst(x.slurker)}, og ${R.navn(x.fra)} får 1 poeng og et nytt hemmelig kort.`
            : `Bløff! ${R.navn(x.fra)} tar ${slurkTekst(x.slurker)}, og ${R.navn(x.til)} får 1 poeng.`,
        );
      },
      // To the hold-to-see screen for the swapped-in card.
      tilnytt(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.nytt) return H.tilpyramiden(el, e, S);
        spenning = false;
        sp.krav = null;
        sp.fase = "nytt";
        R.gaTil("nytt");
      },
      nyttferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "nytt" || !sp.nytt || !sp.nytt.sett) return;
        sp.nytt = null;
        sp.fase = "pyramide";
        R.gaTil("pyramide");
      },
      tilpyramiden(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        if (sp.nytt && !sp.nytt.sett) return H.tilnytt(el, e, S);
        spenning = false;
        sp.krav = null;
        sp.fase = "pyramide";
        R.gaTil("pyramide");
      },
      // Take back the last hand-out (until the next card is turned, a new claim starts or a swapped-in
      // card has been seen). A card swapped as proof goes back in the hand.
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.angre || !sp.logg.length) return;
        trekkTilbake(sp);
        sp.angre = false;
        spenning = false;
        sp.krav = null;
        sp.fase = "pyramide";
        R.toast("Angret – utdelingen er tatt bort");
        R.gaTil("pyramide");
      },
      logg(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">Hvem ga hva</h2>
          ${loggHtml(S.spill)}
          <button class="knapp" data-h="lukk-ark">Lukk</button>`);
      },
      ferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.snudd < ALLE) return;
        sp.angre = false;
        if (sp.finale) {
          sp.fase = "finale";
          sp.fin = { i: 0, steg: "spor", husket: [] };
          R.gaTil("finale");
        } else H.kaaring(el, e, S);
      },
      visfasit(el, e, S) {
        const f = S.spill.fin;
        if (f.steg !== "spor") return;
        f.steg = "vis";
        snuNa = [0, 1, 2, 3].map((n) => "py-f" + n);
        R.vis();
        R.lyd.snu();
      },
      husket(el, e, S) {
        const f = S.spill.fin;
        if (f.steg !== "vis") return;
        const h = R.klamp(Number(el.dataset.v) || 0, 0, 4);
        f.husket[f.i] = h;
        f.steg = "talt";
        R.vis();
        if (h === 4) {
          R.lyd.riktig();
          R.vibrer([20, 40, 20]);
        } else R.lyd.pop();
      },
      angrefinale(el, e, S) {
        const f = S.spill.fin;
        if (f.steg !== "talt") return;
        f.husket[f.i] = null;
        f.steg = "vis";
        R.vis();
      },
      nestefinale(el, e, S) {
        const sp = S.spill;
        const f = sp.fin;
        if (f.steg !== "talt") return;
        if (f.i < sp.antall - 1) {
          sp.fin = { i: f.i + 1, steg: "spor", husket: f.husket };
          R.gaTil("finale");
        } else H.kaaring(el, e, S);
      },
      kaaring(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        sp.fase = "ferdig";
        sp.krav = null;
        R.gaTil("slutt");
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", "Dere går rett til kåringen med stillingen så langt.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || !S.spill) return;
        H.kaaring(el, e, S);
      },
    }),
  });
})();
