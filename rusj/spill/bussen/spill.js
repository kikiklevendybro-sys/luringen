/* Bussen — «Rød eller svart?» (ride the bus), a drinking game for 2–10 players (18+).
   Four rounds, one card each per player: rød eller svart, høyere eller lavere, innenfor eller
   utenfor, sort. A wrong guess means sips – small ones, anything in the glass counts and anyone can
   pass. The one with the most wrong guesses takes «bussturen»: five stops of higher or lower, back to
   the start on a miss, and after three misses the driver gives up. Water breaks come along the way. */
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
      { navn: R.t("spar"), rod: false },
      { navn: R.t("hjerter"), rod: true },
      { navn: R.t("ruter"), rod: true },
      { navn: R.t("kløver"), rod: false },
    ];
    const BOKSTAV = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const VERDINAVN = ["", R.t("ess"), "2", "3", "4", "5", "6", "7", "8", "9", "10", R.t("knekt"), R.t("dame"), R.t("konge")];
    // «en 7-er», «et ess», «en dame»: for questions like «Har noen en 7-er?»
    const MED_ARTIKKEL = ["", "et ess", "en 2-er", "en 3-er", "en 4-er", "en 5-er", "en 6-er", "en 7-er", "en 8-er", "en 9-er", "en 10-er", "en knekt", "en dame", "en konge"]; // sprak-ok (not shown in Bussen)
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
    const navn = (k) => R.t("{sort} {verdi}", { sort: SORTER[sortAv(k)].navn, verdi: VERDINAVN[verdiAv(k)] });
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

  const RUNDER = [
    { navn: R.t("Rød eller svart?"), kort: R.t("Farge"), forklaring: R.t("Gjett fargen på kortet du får."), hjelp: R.t("Hjerter og ruter er røde, spar og kløver svarte.") },
    { navn: R.t("Høyere eller lavere?"), kort: R.t("Høyere?"), forklaring: R.t("Blir det nye kortet høyere eller lavere enn det første kortet ditt?"), hjelp: R.t("Ess er høyest. Likt teller som riktig.") },
    { navn: R.t("Innenfor eller utenfor?"), kort: R.t("Innenfor?"), forklaring: R.t("Havner det nye kortet mellom de to første kortene dine – eller utenfor?"), hjelp: R.t("Likt med et av dem teller som riktig.") },
    { navn: R.t("Hvilken sort?"), kort: R.t("Sort"), forklaring: R.t("Hjerter, ruter, spar eller kløver? Den vanskeligste av dem alle."), hjelp: R.t("Én av fire – lykke til!") },
  ];
  const NIVA = {
    rolig: { navn: R.t("Rolig"), tekst: R.t("1 slurk for hvert feil svar."), ikon: "🙂" },
    klassisk: { navn: R.t("Klassisk"), tekst: R.t("1, 2, 3 og 4 slurker – én mer for hver runde."), ikon: "🃏" },
  };
  const STOPP = 5; // stops on the bus ride
  const MAKS_BOM = 3; // misses before the driver gives up
  const verdi = (k) => (KORT.verdiAv(k) === 1 ? 14 : KORT.verdiAv(k)); // ess er høyest
  const VERDI_ORD = ["", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", R.t("knekt"), R.t("dame"), R.t("konge"), R.t("ess")];
  const slurker = (sp, runde) => (sp.niva === "klassisk" ? runde + 1 : 1);
  const bussSlurker = (sp) => (sp.niva === "klassisk" ? 2 : 1);
  const slurkTekst = (n) => R.flertall(n, "slurk", "slurker");
  const pagar = (S) => !!(S.spill && S.spill.fase !== "ferdig");
  const kopi = (x) => JSON.parse(JSON.stringify(x));
  const velg = (liste, n) => liste[Math.abs(n) % liste.length];

  let H; // the actions, so one can call another
  let snuNa = null; // id of the card that should flip in on the next draw
  let bussFra = null; // the stop the bus drives from on the next draw
  let laast = false; // a guess is being shown: ignore taps for a moment

  const nyStokk = () => R.stokk(Array.from({ length: 52 }, (_, i) => i), R.rng(R.nyttFro()));
  function trekkKort(sp) {
    if (!sp.stokk.length) sp.stokk = nyStokk();
    return sp.stokk.pop();
  }

  // Is the guess right? «Likt» (same value, or on the edge) always counts as right.
  function vurder(hand, runde, gjett, k) {
    if (runde === 0) return { riktig: gjett === (KORT.erRod(k) ? "rod" : "svart"), likt: false };
    if (runde === 1) {
      const a = verdi(hand[0]);
      const b = verdi(k);
      if (a === b) return { riktig: true, likt: true };
      return { riktig: (b > a) === (gjett === "hoyere"), likt: false };
    }
    if (runde === 2) {
      const lo = Math.min(verdi(hand[0]), verdi(hand[1]));
      const hi = Math.max(verdi(hand[0]), verdi(hand[1]));
      const v = verdi(k);
      if (v === lo || v === hi) return { riktig: true, likt: true };
      return { riktig: (v > lo && v < hi) === (gjett === "innenfor"), likt: false };
    }
    return { riktig: Number(gjett) === KORT.sortAv(k), likt: false };
  }

  const turFor = (sp) => (sp.forste + sp.teller) % sp.antall;
  const feilFor = (sp, i) => sp.svar[i].filter((s) => !s.riktig).length;
  const riktigFor = (sp, i) => sp.svar[i].filter((s) => s.riktig).length;

  function nyttSpill(S) {
    const n = R.klamp(S.antall || 4, 2, 10);
    S.spill = {
      antall: n,
      niva: S.oppsett.niva,
      stokk: nyStokk(),
      hender: Array.from({ length: n }, () => []),
      svar: Array.from({ length: n }, () => []),
      runde: 0,
      forste: R.heltall(0, n - 1),
      teller: 0,
      fase: "intro",
      sist: null,
      angre: null,
      buss: null,
      nr: R.heltall(0, 99),
      talt: false,
    };
    R.statistikk("start", { spillere: n, niva: S.oppsett.niva });
  }

  // ---------- Bus ----------

  function velgPassasjer(sp) {
    const feil = sp.svar.map((_, i) => feilFor(sp, i));
    const maks = Math.max(...feil);
    if (maks === 0) {
      sp.buss = { hvem: null, kandidater: [], maks: 0 };
      return;
    }
    const kandidater = feil.map((f, i) => (f === maks ? i : -1)).filter((i) => i >= 0);
    sp.buss = { hvem: R.velg(kandidater), kandidater, maks, rute: [], pos: 0, vist: 0, forsok: 0, bom: 0, slurker: 0, fase: "klar", utfall: null, sist: null, angre: null };
  }

  function nyRute(sp) {
    const b = sp.buss;
    b.rute = Array.from({ length: STOPP + 1 }, () => trekkKort(sp));
    b.pos = 0;
    b.vist = 0;
    b.forsok += 1;
    b.fase = "gjett";
    b.sist = null;
    b.angre = null;
  }

  // ---------- Pieces of markup ----------

  const SORT_IKON = (s, str) => `<svg class="bu-sort" viewBox="0 0 100 100" aria-hidden="true" focusable="false" style="--str:${str || 22}px"><g fill="${KORT.farge(s * 13)}">${KORT.symbol(s, 0, 0, 100)}</g></svg>`;

  const BUSS_SVG = `<svg class="bu-buss-svg" viewBox="0 0 76 46" aria-hidden="true" focusable="false">
    <path d="M6 33V12C6 7 9 4 14 4H62C67 4 71 8 71 13V33Z" fill="var(--aksent)" stroke="#1b1230" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M6 26H71" stroke="#1b1230" stroke-width="3" stroke-opacity=".25"/>
    <rect x="12" y="9" width="11" height="10" rx="2.5" fill="#d9f2ff" stroke="#1b1230" stroke-width="2.5"/>
    <rect x="27" y="9" width="11" height="10" rx="2.5" fill="#d9f2ff" stroke="#1b1230" stroke-width="2.5"/>
    <rect x="42" y="9" width="11" height="10" rx="2.5" fill="#d9f2ff" stroke="#1b1230" stroke-width="2.5"/>
    <path d="M57 9H63C65 9 66 10 66 12V19H57Z" fill="#d9f2ff" stroke="#1b1230" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="68" cy="28" r="2.4" fill="#ffd23f"/>
    <circle cx="20" cy="34" r="7" fill="#1b1230"/><circle cx="20" cy="34" r="2.6" fill="#fff8ec"/>
    <circle cx="57" cy="34" r="7" fill="#1b1230"/><circle cx="57" cy="34" r="2.6" fill="#fff8ec"/>
    <path d="M14 13.5Q15.5 11 18 11" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`;

  // A player's four cards: earlier rounds face up, this round's card face down (or just turned),
  // later rounds as empty places with what they are about.
  function handHtml(sp, i, aktiv) {
    const hand = sp.hender[i];
    return `<div class="bu-hand" role="list" aria-label="${esc(R.t("Kortene til {navn}", { navn: R.navn(i) }))}">${RUNDER.map((r, n) => {
      let innhold;
      if (n < hand.length) innhold = KORT.html(hand[n], { opp: true, stor: true, attr: ` id="bu-k${n}"` });
      else if (aktiv && n === sp.runde) innhold = KORT.html(null, { klasse: "bu-ny", attr: ` id="bu-k${n}"` });
      else innhold = `<span class="bu-tom" aria-hidden="true">${n + 1}</span>`;
      const tekst = n < hand.length ? KORT.Navn(hand[n]) : n === sp.runde && aktiv ? R.t("Kortet ditt – ikke snudd ennå") : R.t("Runde {n}", { n: n + 1 });
      return `<div class="bu-plass${n === sp.runde && aktiv ? " na" : ""}" role="listitem" aria-label="${esc(tekst)}">${innhold}<span class="bu-tekst" aria-hidden="true">${esc(r.kort)}</span></div>`;
    }).join("")}</div>`;
  }

  // The question for this round, with the cards it is about.
  function sporsmal(sp, i) {
    const hand = sp.hender[i];
    const r = sp.runde;
    if (r === 1) return { tittel: R.t("Høyere eller lavere enn {kort}?", { kort: VERDI_ORD[verdi(hand[0])] }), hjelp: RUNDER[1].hjelp };
    if (r === 2) {
      const [a, b] = [verdi(hand[0]), verdi(hand[1])].sort((x, y) => x - y);
      return a === b ? { tittel: R.t("Innenfor eller utenfor {kort}?", { kort: VERDI_ORD[a] }), hjelp: R.t("Begge kortene er {kort} – bare en {kort} til teller som innenfor.", { kort: VERDI_ORD[a] }) } : { tittel: R.t("Innenfor eller utenfor {a} og {b}?", { a: VERDI_ORD[a], b: VERDI_ORD[b] }), hjelp: RUNDER[2].hjelp };
    }
    return { tittel: RUNDER[r].navn, hjelp: RUNDER[r].hjelp };
  }

  function svarKnapper(r) {
    if (r === 0)
      return `<div class="knapprad bu-svar">
        <button class="knapp bu-rod" data-h="gjett" data-v="rod">${SORT_IKON(1, 20)}${esc(R.t("Rød"))}</button>
        <button class="knapp bu-svart" data-h="gjett" data-v="svart">${SORT_IKON(0, 20).replace(KORT.SVART, "#fff8ec")}${esc(R.t("Svart"))}</button>
      </div>`;
    if (r === 1)
      return `<div class="knapprad bu-svar">
        <button class="knapp lilla" data-h="gjett" data-v="hoyere"><span class="bu-pil" aria-hidden="true">▲</span>${esc(R.t("Høyere"))}</button>
        <button class="knapp himmel" data-h="gjett" data-v="lavere"><span class="bu-pil" aria-hidden="true">▼</span>${esc(R.t("Lavere"))}</button>
      </div>`;
    if (r === 2)
      return `<div class="knapprad bu-svar">
        <button class="knapp mynte" data-h="gjett" data-v="innenfor"><span class="bu-pil" aria-hidden="true">→←</span>${esc(R.t("Innenfor"))}</button>
        <button class="knapp lampe" data-h="gjett" data-v="utenfor"><span class="bu-pil" aria-hidden="true">←→</span>${esc(R.t("Utenfor"))}</button>
      </div>`;
    return `<div class="bu-sorter">${[1, 2, 0, 3].map((s) => `<button class="bu-sortknapp" data-h="gjett" data-v="${s}">${SORT_IKON(s, 30)}<span>${esc(KORT.SORTER[s].navn.charAt(0).toUpperCase() + KORT.SORTER[s].navn.slice(1))}</span></button>`).join("")}</div>`;
  }

  // ---------- Screens ----------

  R.start({
    id: "bussen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: Math.max(2, Math.min(10, R.felles.navn.filter((n) => String(n || "").trim()).length || 4)),
      oppsett: { niva: "rolig" },
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ niva: "rolig" }, S.oppsett || {});
      if (!NIVA[S.oppsett.niva]) S.oppsett.niva = "rolig";
      S.antall = R.klamp(Number(S.antall) || 4, 2, 10);
      const sp = S.spill;
      if (sp) {
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= 2 && sp.antall <= 10 &&
          Array.isArray(sp.hender) && sp.hender.length === sp.antall &&
          Array.isArray(sp.svar) && sp.svar.length === sp.antall &&
          Array.isArray(sp.stokk) && sp.runde >= 0 && sp.runde <= 4 &&
          ["intro", "gjett", "svar", "bussvalg", "buss", "ferdig"].includes(sp.fase) && NIVA[sp.niva];
        if (!ok) S.spill = null;
      }
      const fase = S.spill && S.spill.fase;
      const skjermFor = { intro: "intro", gjett: "tur", svar: "tur", bussvalg: "bussvalg", buss: "buss", ferdig: "slutt" };
      if (["intro", "tur", "bussvalg", "buss", "slutt"].includes(S.skjerm)) S.skjerm = fase ? skjermFor[fase] : "hjem";
    },

    regler: {
      intro: R.t("Fire runder med kort – og feil svar gir slurker. Den som bommer mest, tar bussen til slutt."),
      steg: [
        [R.t("Gjett kortet ditt"), R.t("Rød eller svart? Høyere eller lavere? Innenfor eller utenfor? Og til slutt: hvilken sort? Alle svarer etter tur, ett kort hver runde.")],
        [R.t("Feil svar gir slurker"), R.t("Små slurker – eller ingen. Brus, vann og alkoholfritt teller like mye, og alle kan stå over.")],
        [R.t("Bussturen"), R.t("Den med flest feil tar bussen: fem holdeplasser med høyere eller lavere. Bom betyr ny tur – men etter tre bom gir sjåføren seg.")],
      ],
      tips: [
        R.t("Ess er høyest. Likt teller alltid som riktig."),
        R.t("Trykket feil? «Angre – nytt kort» stokker kortet inn i bunken igjen, så du får et nytt."),
        R.t("Velg «Rolig» hvis dere vil ta det med ro: 1 slurk per feil."),
        R.t("Drikk vann mellom rundene, spis noe – og planlegg trygg vei hjem."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Rød eller svart? Høyere eller lavere?"))}<br><em>${esc(R.t("Den som bommer mest, tar bussen."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? (S.spill.fase === "buss" || S.spill.fase === "bussvalg" ? R.t("Fortsett · bussturen") : R.t("Fortsett · runde {n}", { n: Math.min(4, S.spill.runde + 1) })) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["2–10", R.t("spillere")],
              ["4", R.t("runder")],
              ["🥤", R.t("alkoholfritt teller")],
            ],
          }),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvor mange slurker?"))}</h2>
            ${R.ui.fliser(
              "niva",
              Object.entries(NIVA).map(([v, n]) => ({ v, tittel: n.navn, tekst: n.tekst, ikon: n.ikon })),
              S.oppsett.niva,
            )}
            <p class="hjelp">${esc(R.t("Små slurker. Vann, brus og alkoholfritt teller like mye – og alle kan stå over."))}</p>
          </section>
          ${R.ui.spillere({ min: 2, max: 10, hjelp: R.t("Dere svarer etter tur, så legg gjerne mobilen midt på bordet.") })}
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`,
      },

      intro: {
        tittel: (S) => R.t("Runde {n} av 4", { n: S.spill.runde + 1 }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const n = slurker(sp, r);
          const vann = r === 2 ? `<div class="bu-vann"><span aria-hidden="true">💧</span><p>${esc(velg(T.vann, sp.nr))}</p></div>` : "";
          const bilde = [
            `${KORT.html(13 + 7, { opp: true, stor: true })}${KORT.html(10, { opp: true, stor: true })}`,
            `${KORT.html(26 + 6, { opp: true, stor: true })}<span class="bu-tegn" aria-hidden="true">▲<br>▼</span>${KORT.html(null)}`,
            `${KORT.html(39 + 3, { opp: true, stor: true })}${KORT.html(null)}${KORT.html(13 + 9, { opp: true, stor: true })}`,
            `<span class="bu-fire">${[1, 2, 0, 3].map((s) => SORT_IKON(s, 40)).join("")}</span>`,
          ][r];
          return `
            ${R.ui.fremdrift(4, r)}
            <div class="bu-intro">
              <h1 id="skjerm-tittel">${esc(RUNDER[r].navn)}</h1>
              <div class="bu-illustrasjon bu-ill-${r}" aria-hidden="true">${bilde}</div>
              <p class="ingress">${esc(RUNDER[r].forklaring)} ${esc(RUNDER[r].hjelp)}</p>
              <p class="bu-pris">${esc(R.t("Feil svar: {slurker}")).replace("{slurker}", `<b>${esc(slurkTekst(n))}</b>`)}</p>
              <p class="bu-forst">${R.avatar(sp.forste)}<span>${esc(R.t("{navn} begynner")).replace("{navn}", `<b>${esc(R.navn(sp.forste))}</b>`)}</span></p>
            </div>
            ${vann}
            ${R.ui.dokk(R.ui.knapp(R.t("Start runde {n}", { n: r + 1 }), "runde", { variant: "stor" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn() {
          R.lyd.pop();
        },
      },

      tur: {
        tittel: (S) => `${R.t("Runde {n}", { n: S.spill.runde + 1 })} · ${RUNDER[Math.min(3, S.spill.runde)].kort}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = turFor(sp);
          const svart = sp.fase === "svar";
          const sist = sp.sist;
          let midt;
          if (svart && sist) {
            const tekst = sist.riktig ? (sist.likt ? velg(T.likt, sp.nr) : velg(T.riktig, sp.nr)) : velg(T.feil, sp.nr);
            midt = `<div class="bu-utfall ${sist.riktig ? "riktig" : "feil"}" role="status">
              <span class="stempel ${sist.riktig ? "mynte" : ""}">${esc(sist.riktig ? R.t("Riktig") : R.t("Feil"))}</span>
              <p class="bu-utfall-tekst">${esc(tekst)}</p>
              ${sist.riktig ? `<p class="bu-slurk-info">${esc(R.t("Ingen slurker på deg – skål for flaksen!"))}</p>` : `<p class="bu-slurk">${esc(R.t("Ta {slurker}", { slurker: slurkTekst(sist.slurker) }))}</p><p class="bu-fot">${esc(velg(T.fot, sp.nr))}</p>`}
            </div>`;
          } else {
            const q = sporsmal(sp, i);
            midt = `<div class="bu-sporsmal">
              <h2>${esc(q.tittel)}</h2>
              <p class="hjelp">${esc(q.hjelp)}</p>
              <p class="bu-pris">${esc(R.t("Feil: {slurker}", { slurker: slurkTekst(slurker(sp, sp.runde)) }))}</p>
            </div>`;
          }
          const sisteIRunden = sp.teller === sp.antall - 1;
          const neste = sisteIRunden ? (sp.runde === 3 ? R.t("Til bussen!") : R.t("Videre til runde {n}", { n: sp.runde + 2 })) : R.t("Neste: {navn}", { navn: R.navn((i + 1) % sp.antall) });
          const dokk = svart
            ? R.ui.dokk(R.ui.knapp(neste, "neste", { variant: "stor" }), R.ui.lenkerad(sp.angre ? R.ui.lenke(R.t("Angre – nytt kort"), "angre") : "", R.ui.lenke(R.t("Avslutt"), "avslutt")))
            : R.ui.dokk(svarKnapper(sp.runde), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")));
          return `
            ${R.ui.fremdrift(sp.antall, i, Array.from({ length: sp.teller }, (_, n) => (sp.forste + n) % sp.antall))}
            <div class="bu-hvem">${R.avatar(i, "mid")}<div><p class="etikett">${esc(svart ? R.t("Svaret ditt") : R.t("Din tur"))}</p><h1 id="skjerm-tittel">${esc(R.navn(i))}</h1></div></div>
            ${handHtml(sp, i, true)}
            ${midt}
            ${dokk}`;
        },
        etter() {
          if (snuNa) {
            const el = document.getElementById(snuNa);
            snuNa = null;
            if (el && !R.rolig()) {
              el.classList.remove("sk-opp");
              void el.offsetWidth;
              el.classList.add("sk-opp", "bu-snur");
            }
          }
        },
      },

      bussvalg: {
        tittel: R.t("Bussturen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const b = sp.buss;
          if (!b || b.hvem == null)
            return `
              <div class="banner aksent">
                <span class="bu-stor-buss">${BUSS_SVG}</span>
                <p class="etikett">${esc(R.t("Bussturen"))}</p>
                <h1 id="skjerm-tittel">${esc(R.t("Bussen kjører tom!"))}</h1>
                <p class="ingress">${esc(R.t("Ingen svarte feil en eneste gang. Det har vi aldri sett før!"))}</p>
              </div>
              ${R.ui.dokk(R.ui.knapp(R.t("Til kåringen"), "kaaring", { variant: "stor" }))}`;
          const delt = b.kandidater.length > 1;
          return `
            <div class="banner aksent bu-billett">
              <span class="bu-stor-buss">${BUSS_SVG}</span>
              <p class="etikett">${esc(delt ? R.t("Delt førsteplass i bom – mobilen trakk") : R.t("Flest feil svar"))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("{navn} tar bussen!", { navn: R.navn(b.hvem) }))}</h1>
              <p class="ingress">${esc(R.t("{feil} i fire runder. Nå venter {n} holdeplasser.", { feil: R.flertall(b.maks, "feil svar", "feil svar"), n: STOPP }))}</p>
            </div>
            <div class="papirboks bu-regelboks">
              <p class="etikett">${esc(R.t("Slik kjører bussen"))}</p>
              <ul class="tips">
                <li>${esc(R.t("Gjett om neste kort er høyere eller lavere. Riktig: én holdeplass fram."))}</li>
                <li>${esc(R.t("Bom: {slurker} og tilbake til start med nye kort.", { slurker: slurkTekst(bussSlurker(sp)) }))}</li>
                <li>${esc(R.t("Etter {n} bom gir sjåføren seg – da er du framme likevel.", { n: MAKS_BOM }))}</li>
              </ul>
            </div>
            <div class="bu-vann"><span aria-hidden="true">💧</span><p>${esc(velg(T.vannBuss, sp.nr))}</p></div>
            ${R.ui.dokk(R.ui.knapp(R.t("Kjør bussen!"), "kjor", { variant: "stor" }), R.ui.lenkerad(R.ui.lenke(R.t("Hopp over bussen"), "kaaring")))}`;
        },
        inn(S) {
          if (S.spill.buss && S.spill.buss.hvem != null) {
            R.lyd.trommevirvel(0.8);
            R.vibrer([30, 60, 90]);
          } else R.lyd.fanfare();
        },
      },

      buss: {
        tittel: R.t("Bussturen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const b = sp.buss;
          const kort = b.rute
            .map((k, n) => {
              const opp = n <= b.pos || n === b.vist;
              const bom = n === b.vist && n > b.pos;
              return `<div class="bu-stopp${n === 0 ? " start" : ""}${n <= b.pos ? " passert" : ""}${bom ? " bom" : ""}">${KORT.html(k, { opp, stor: true, attr: ` id="bu-r${n}"` })}<span class="bu-tekst" aria-hidden="true">${n === 0 ? esc(R.t("Start")) : n}</span></div>`;
            })
            .join("");
          let midt;
          let dokk;
          if (b.fase === "framme" || b.fase === "sjafor") {
            midt = `<div class="bu-utfall ${b.fase === "framme" ? "riktig" : ""}" role="status">
              <span class="stempel ${b.fase === "framme" ? "mynte" : "lampe"}">${esc(b.fase === "framme" ? R.t("Framme!") : R.t("Ferdig!"))}</span>
              <p class="bu-utfall-tekst">${esc(velg(b.fase === "framme" ? T.framme : T.sjafor, sp.nr))}</p>
            </div>`;
            dokk = R.ui.dokk(R.ui.knapp(R.t("Til kåringen"), "kaaring", { variant: "stor" }));
          } else if (b.fase === "bom") {
            midt = `<div class="bu-utfall feil" role="status">
              <span class="stempel">${esc(R.t("Bom"))}</span>
              <p class="bu-utfall-tekst">${esc(velg(T.feil, sp.nr))} ${esc(R.t("Tilbake til start."))}</p>
              <p class="bu-slurk">${esc(R.t("Ta {slurker}", { slurker: slurkTekst(bussSlurker(sp)) }))}</p>
              <p class="bu-fot">${esc(MAKS_BOM - b.bom === 1 ? R.t("Siste tur – sjåføren begynner å bli lei.") : R.t("{n} turer igjen før sjåføren gir seg.", { n: MAKS_BOM - b.bom }))}</p>
            </div>`;
            dokk = R.ui.dokk(R.ui.knapp(R.t("Ny tur med nye kort"), "nytur", { variant: "stor" }), R.ui.lenkerad(b.angre ? R.ui.lenke(R.t("Angre – nytt kort"), "bussangre") : "", R.ui.lenke(R.t("Gå av bussen"), "gaav")));
          } else {
            midt = `<div class="bu-sporsmal">
              <h2>${esc(R.t("Høyere eller lavere enn {kort}?", { kort: VERDI_ORD[verdi(b.rute[b.pos])] }))}</h2>
              <p class="hjelp">${esc(R.t("Holdeplass {n} av {alle}. Ess er høyest, likt teller som riktig.", { n: b.pos + 1, alle: STOPP }))}</p>
            </div>`;
            dokk = R.ui.dokk(
              `<div class="knapprad bu-svar">
                <button class="knapp lilla" data-h="buss" data-v="hoyere"><span class="bu-pil" aria-hidden="true">▲</span>${esc(R.t("Høyere"))}</button>
                <button class="knapp himmel" data-h="buss" data-v="lavere"><span class="bu-pil" aria-hidden="true">▼</span>${esc(R.t("Lavere"))}</button>
              </div>`,
              R.ui.lenkerad(R.ui.lenke(R.t("Gå av bussen"), "gaav")),
            );
          }
          return `
            <div class="bu-hvem">${R.avatar(b.hvem, "mid")}<div><p class="etikett">${esc(R.t("På bussen · tur {n} av {alle}", { n: b.forsok, alle: MAKS_BOM }))}</p><h1 id="skjerm-tittel">${esc(R.navn(b.hvem))}</h1></div></div>
            <div class="bu-vei">
              <span class="bu-buss" id="bu-buss" style="--pos:${b.pos}">${BUSS_SVG}</span>
              <div class="bu-rute" style="--pos:${b.pos}">${kort}</div>
            </div>
            <p class="bu-bom" aria-label="${esc(R.t("{n} av {alle} bom", { n: b.bom, alle: MAKS_BOM }))}"><span class="bu-bom-tekst" aria-hidden="true">${esc(R.t("Bom"))}</span>${Array.from({ length: MAKS_BOM }, (_, n) => `<i class="${n < b.bom ? "brukt" : ""}"></i>`).join("")}</p>
            ${midt}
            ${dokk}`;
        },
        etter(S) {
          const b = S.spill.buss;
          if (snuNa) {
            const el = document.getElementById(snuNa);
            snuNa = null;
            if (el && !R.rolig()) {
              el.classList.remove("sk-opp");
              void el.offsetWidth;
              el.classList.add("sk-opp");
            }
          }
          const buss = R.$("#bu-buss");
          if (buss && bussFra != null && bussFra !== b.pos && !R.rolig()) {
            buss.style.transition = "none";
            buss.style.setProperty("--pos", bussFra);
            void buss.offsetWidth;
            buss.style.transition = "";
            buss.style.setProperty("--pos", b.pos);
          }
          bussFra = null;
        },
        inn(S) {
          if (S.spill.buss.fase === "gjett") R.lyd.tone(140, 0, 0.5, "sawtooth", 0.05, 220);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = sp.svar.map((_, i) => ({ i, poeng: riktigFor(sp, i) }));
          const best = Math.max(...rader.map((r) => r.poeng));
          const vinnere = rader.filter((r) => r.poeng === best && best > 0).map((r) => r.i);
          const b = sp.buss;
          const synske = rader.filter((x) => x.poeng === 4).map((x) => x.i); // four of four: a small award
          let buss = "";
          if (b && b.hvem != null) {
            const navn = esc(R.navn(b.hvem));
            const hva =
              b.utfall === "framme"
                ? b.forsok === 1
                  ? R.t("{navn} kom seg gjennom alle holdeplassene på første forsøk. Imponerende!")
                  : b.forsok === 2
                    ? R.t("{navn} kom seg av på andre forsøk.")
                    : b.forsok === 3
                      ? R.t("{navn} kom seg av på tredje forsøk.")
                      : R.t("{navn} kom seg av på {n}. forsøk.", { n: b.forsok })
                : b.utfall === "sjafor"
                  ? R.t("{navn} kjørte til sjåføren ga seg. Framme likevel!")
                  : b.utfall === "gikk-av"
                    ? R.t("{navn} gikk av bussen – helt greit!")
                    : R.t("{navn} slapp bussen denne gangen.");
            buss = `<div class="bu-oppsummering"><span class="bu-liten-buss">${BUSS_SVG}</span><p>${esc(hva).replace("{navn}", `<b>${navn}</b>`)}</p></div>`;
          }
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${esc(R.t("Flest riktige svar"))}${best ? ` · ${esc(R.t("{n} av 4", { n: best }))}` : ""}</p>
              <h1 id="skjerm-tittel">${vinnere.length ? esc(R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((i) => R.navn(i))), n: vinnere.length })) : esc(R.t("Kortene vant i kveld!"))}</h1>
            </div>
            ${R.ui.pall(rader)}
            ${synske.length ? `<div class="bu-oppsummering bu-synsk"><span class="bu-synsk-ikon" aria-hidden="true">🔮</span><p><b>${esc(R.t("Synsk:"))}</b> ${esc(R.t("{navn} svarte riktig på alle fire.", { navn: R.ramsOpp(synske.map((i) => R.navn(i))) }))}</p></div>` : ""}
            ${R.ui.poengliste(rader)}
            ${buss}
            <div class="bu-vann"><span aria-hidden="true">💧</span><p>${esc(R.t("Drikk et glass vann før neste spill!"))}</p></div>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          const rader = sp.svar.map((_, i) => ({ i, poeng: riktigFor(sp, i) }));
          if (!sp.talt) {
            sp.talt = true;
            R.kveld.registrer(rader);
            R.statistikk("ferdig", { spillere: sp.antall, buss: !!(sp.buss && sp.buss.hvem != null), utfall: (sp.buss && sp.buss.utfall) || "ingen" });
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
        const fase = S.spill && S.spill.fase;
        if (!fase || fase === "ferdig") return;
        R.gaTil({ intro: "intro", gjett: "tur", svar: "tur", bussvalg: "bussvalg", buss: "buss" }[fase]);
      },
      niva(el, e, S) {
        S.oppsett.niva = NIVA[el.dataset.v] ? el.dataset.v : "rolig";
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("intro");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("intro");
      },
      endre: () => R.gaTil("oppsett"),
      runde(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "intro") return;
        sp.fase = "gjett";
        R.gaTil("tur");
      },
      gjett(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "gjett" || laast) return;
        const i = turFor(sp);
        const angre = kopi(Object.assign({}, sp, { angre: null }));
        const k = trekkKort(sp);
        const gjett = el.dataset.v;
        const { riktig, likt } = vurder(sp.hender[i], sp.runde, gjett, k);
        const n = riktig ? 0 : slurker(sp, sp.runde);
        sp.hender[i].push(k);
        sp.svar[i].push({ gjett, riktig, likt, slurker: n });
        sp.sist = { i, k, gjett, riktig, likt, slurker: n };
        sp.angre = angre;
        sp.fase = "svar";
        sp.nr += 1;
        snuNa = "bu-k" + sp.runde;
        R.vis();
        R.lyd.snu();
        setTimeout(() => {
          if (riktig) {
            R.lyd.riktig();
            R.vibrer(25);
          } else {
            R.lyd.tone(330, 0, 0.14, "triangle", 0.1, 230);
            R.lyd.tone(240, 0.12, 0.2, "triangle", 0.09, 160);
            R.vibrer([20, 40, 20]);
          }
        }, 260);
        R.si(`${KORT.Navn(k)}. ${riktig ? R.t("Riktig!") : R.t("Feil. Ta {slurker}.", { slurker: slurkTekst(n) })}`);
      },
      // Take back the last guess: the card goes back into the deck, which is shuffled again.
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "svar" || !sp.angre) return;
        const gammel = sp.angre;
        gammel.stokk = R.stokk(gammel.stokk, R.rng(R.nyttFro()));
        gammel.nr = sp.nr;
        S.spill = gammel;
        R.toast(R.t("Angret – kortet er stokket inn i bunken igjen"));
        R.lyd.snu();
        R.vis();
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "svar") return;
        sp.angre = null;
        sp.sist = null;
        sp.teller += 1;
        if (sp.teller < sp.antall) {
          sp.fase = "gjett";
          R.gaTil("tur");
          return;
        }
        sp.teller = 0;
        sp.runde += 1;
        if (sp.runde < 4) {
          sp.fase = "intro";
          R.gaTil("intro");
          return;
        }
        velgPassasjer(sp);
        sp.fase = "bussvalg";
        R.gaTil("bussvalg");
      },
      kjor(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "bussvalg" || !sp.buss || sp.buss.hvem == null) return;
        nyRute(sp);
        sp.fase = "buss";
        R.gaTil("buss");
      },
      buss(el, e, S) {
        const sp = S.spill;
        const b = sp && sp.buss;
        if (!b || sp.fase !== "buss" || b.fase !== "gjett" || laast) return;
        const gjett = el.dataset.v;
        const a = b.rute[b.pos];
        const k = b.rute[b.pos + 1];
        const likt = verdi(a) === verdi(k);
        const riktig = likt || (verdi(k) > verdi(a)) === (gjett === "hoyere");
        b.angre = kopi(Object.assign({}, b, { angre: null }));
        b.sist = { gjett, riktig, likt };
        b.vist = b.pos + 1;
        sp.nr += 1;
        snuNa = "bu-r" + b.vist;
        R.lyd.snu();
        if (riktig) {
          bussFra = b.pos;
          b.pos += 1;
          b.angre = null;
          if (b.pos === STOPP) {
            b.fase = "framme";
            b.utfall = "framme";
          }
          laast = true;
          R.vis();
          setTimeout(() => {
            laast = false;
            if (b.fase === "framme") {
              R.lyd.fanfare();
              R.konfetti();
              R.vibrer([40, 60, 120]);
            } else {
              R.lyd.riktig();
              R.vibrer(20);
            }
          }, 420);
          R.si(`${KORT.Navn(k)}. ${R.t("Riktig!")}${b.fase === "framme" ? ` ${R.t("Du er framme!")}` : ""}`);
          return;
        }
        b.bom += 1;
        b.slurker += bussSlurker(sp);
        if (b.bom >= MAKS_BOM) {
          b.fase = "sjafor";
          b.utfall = "sjafor";
        } else b.fase = "bom";
        R.vis();
        setTimeout(() => {
          R.lyd.tone(330, 0, 0.14, "triangle", 0.1, 230);
          R.lyd.tone(240, 0.12, 0.2, "triangle", 0.09, 160);
          R.vibrer([20, 40, 20]);
        }, 300);
        R.si(`${KORT.Navn(k)}. ${R.t("Bom! Ta {slurker}.", { slurker: slurkTekst(bussSlurker(sp)) })}`);
      },
      // Take back the last miss: the card at that stop is swapped for a fresh one from the deck.
      bussangre(el, e, S) {
        const sp = S.spill;
        const b = sp && sp.buss;
        if (!b || b.fase !== "bom" || !b.angre) return;
        const gammel = b.angre;
        const plass = b.vist;
        sp.stokk.push(gammel.rute[plass]);
        sp.stokk = R.stokk(sp.stokk, R.rng(R.nyttFro()));
        gammel.rute[plass] = trekkKort(sp);
        sp.buss = gammel;
        R.toast(R.t("Angret – du får et nytt kort på den holdeplassen"));
        R.vis();
      },
      nytur(el, e, S) {
        const sp = S.spill;
        if (!sp.buss || sp.buss.fase !== "bom") return;
        nyRute(sp);
        R.lyd.stoy(0, 0.25, 0.12, 2600);
        R.gaTil("buss");
      },
      async gaav(el, e, S) {
        const sp = S.spill;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Gå av bussen?"), R.t("Helt greit! Dere går rett til kåringen."), R.t("Gå av"), R.t("Kjør videre"));
        if (!ja || !fortsatt() || !sp.buss) return;
        sp.buss.utfall = "gikk-av";
        H.kaaring(el, e, S);
      },
      kaaring(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        if (sp.buss && sp.buss.hvem != null && !sp.buss.utfall) sp.buss.utfall = "hoppet-over";
        sp.fase = "ferdig";
        R.gaTil("slutt");
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere går rett til kåringen med stillingen så langt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !S.spill) return;
        S.spill.fase = "ferdig";
        R.gaTil("slutt");
      },
    }),
  });
})();
