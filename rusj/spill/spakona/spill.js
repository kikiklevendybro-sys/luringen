/* Spåkona — «Gjett kortet» (the dealer guessing game, 18+).
   One player is the dealer («giveren») and holds the phone; the others guess in turn. The phone
   draws the next card of a 52-card deck face down. The guesser names a value (ace = 1 … king = 13);
   if it is wrong, Spåkona says «higher» or «lower» and the guesser has one more try. Right on the
   first try: the dealer takes two small sips; on the second: one. Wrong twice: the guesser takes
   one to three sips, by how far off the guess was. After three wrong guessers in a row the dealer
   has done the job and hands the deck on. The cards played lie on the table (the strip under the
   card), so a sharp guesser can count. Kåringen crowns the evening's fortune teller: two points for
   a first-try hit, one for a second-try hit (a guessing score, never a drinking score).
   Responsible by design: small sips only (never more than three), alcohol-free counts the same,
   everyone may pass, and a water card comes after every twelfth card.
   The rules at the top are pure functions with a seeded rng; test/spakona.test.mjs loads this
   file without the kit. */
(function () {
  "use strict";

  // ---------- The rules (no kit needed) ----------

  const ANTALL_KORT = 52;
  const VANN_HVERT = 12; // a water card after every twelfth card
  const BOM_PA_RAD = 3; // wrong guessers in a row before the dealer hands the deck on
  const verdi = (k) => (k % 13) + 1; // ace 1 … king 13

  function bland(liste, rng) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // The answer to a guess: "riktig", or where the card is ("hoyere" / "lavere").
  const svar = (k, g) => (g === verdi(k) ? "riktig" : verdi(k) > g ? "hoyere" : "lavere");
  // Sips for a miss: one when close (1–2 off), two (3–5), three when far off (6+).
  const slurkerFor = (avstand) => (avstand <= 2 ? 1 : avstand <= 5 ? 2 : 3);
  // How many of each value lie face up on the table: index 1–13.
  function paBordet(sp) {
    const n = Array(14).fill(0);
    const synlige = sp.pos + (sp.fase === "svar" ? 1 : 0);
    for (let i = 0; i < Math.min(synlige, sp.stokk.length); i++) n[verdi(sp.stokk[i])] += 1;
    return n;
  }
  // The values still possible for the card on the table: not all four seen, and on the right side
  // of the first guess once Spåkona has said higher or lower.
  function mulige(sp) {
    const bord = paBordet(sp);
    const ut = [];
    for (let v = 1; v <= 13; v++) {
      if (bord[v] >= 4) continue;
      if (sp.fase === "gjett2" && (sp.hint === "hoyere" ? v <= sp.g1 : v >= sp.g1)) continue;
      ut.push(v);
    }
    return ut;
  }
  const nesteEtter = (antall, i) => (i + 1) % antall;
  // The next guesser after i: everyone but the dealer, round the table.
  function nesteGjetter(antall, giver, i) {
    let j = nesteEtter(antall, i);
    if (j === giver) j = nesteEtter(antall, j);
    return j;
  }

  function ny(antall, rng, giver) {
    const g = giver != null ? giver : Math.floor(rng() * antall);
    return {
      antall,
      stokk: bland(Array.from({ length: ANTALL_KORT }, (_, i) => i), rng),
      pos: 0,
      giver: g,
      gjetter: nesteGjetter(antall, g, g),
      fase: "gjett1",
      g1: null,
      g2: null,
      hint: null,
      utfall: null,
      bomRad: 0,
      byttes: null,
      poeng: Array(antall).fill(0),
      treff: Array(antall).fill(0),
      gjettet: Array(antall).fill(0),
      byttet: 0,
      vann: 0,
      ferdig: false,
    };
  }

  // A guess (value 1–13). Returns what happened: "hint" (try again), "forste", "andre" or "bom".
  function gjett(sp, g) {
    if (!(sp.fase === "gjett1" || sp.fase === "gjett2") || !Number.isInteger(g) || g < 1 || g > 13) return null;
    const k = sp.stokk[sp.pos];
    const r = svar(k, g);
    if (sp.fase === "gjett1") {
      sp.g1 = g;
      if (r !== "riktig") {
        sp.hint = r;
        sp.fase = "gjett2";
        return "hint";
      }
    } else sp.g2 = g;
    const i = sp.gjetter;
    sp.gjettet[i] += 1;
    if (r === "riktig") {
      const forste = sp.fase === "gjett1";
      sp.utfall = { type: forste ? "forste" : "andre", avstand: 0, slurker: forste ? 2 : 1 };
      sp.poeng[i] += forste ? 2 : 1;
      sp.treff[i] += 1;
      sp.bomRad = 0;
    } else {
      const avstand = Math.abs(verdi(k) - g);
      sp.utfall = { type: "bom", avstand, slurker: slurkerFor(avstand) };
      sp.bomRad += 1;
      if (sp.bomRad >= BOM_PA_RAD) sp.byttes = nesteEtter(sp.antall, sp.giver);
    }
    sp.fase = "svar";
    return sp.utfall.type;
  }

  // On to the next card (or a water card first, or the end of the deck).
  function videre(sp) {
    if (sp.fase !== "svar" && sp.fase !== "vann") return;
    if (sp.fase === "svar") {
      if (sp.pos + 1 >= sp.stokk.length) {
        sp.ferdig = true;
        return;
      }
      sp.pos += 1;
      if (sp.byttes != null) {
        sp.giver = sp.byttes;
        sp.bomRad = 0;
        sp.byttet += 1;
        sp.gjetter = nesteGjetter(sp.antall, sp.giver, sp.giver);
      } else sp.gjetter = nesteGjetter(sp.antall, sp.giver, sp.gjetter);
      Object.assign(sp, { g1: null, g2: null, hint: null, utfall: null, byttes: null });
      if (sp.pos % VANN_HVERT === 0) {
        sp.vann += 1;
        sp.fase = "vann";
        return;
      }
    }
    sp.fase = "gjett1";
  }

  const R = window.Rusj;
  if (!R) {
    window.Spakona = { verdi, svar, slurkerFor, paBordet, mulige, nesteGjetter, ny, gjett, videre, bland, ANTALL_KORT, VANN_HVERT, BOM_PA_RAD };
    return;
  }

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
    const MED_ARTIKKEL = ["", "et ess", "en 2-er", "en 3-er", "en 4-er", "en 5-er", "en 6-er", "en 7-er", "en 8-er", "en 9-er", "en 10-er", "en knekt", "en dame", "en konge"]; // sprak-ok (not shown in Spåkona)
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

  // ---------- The game ----------

  const T = window.RUSJ_DATA.tekster;
  const esc = R.esc;
  const MIN = 2;
  const MAKS = 12;
  const SIST = "spakona.sist";
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "spakona") + "/";
  // Value names for buttons and screen readers (index 1–13).
  const VERDINAVN = ["", R.t("ess"), "2", "3", "4", "5", "6", "7", "8", "9", "10", R.t("knekt"), R.t("dame"), R.t("konge")];
  const BOKSTAV = KORT.BOKSTAV;

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  // A line that changes with the card, but stays the same on a redraw.
  const velg = (liste, n) => liste[((n % liste.length) + liste.length) % liste.length];
  const slurkTekst = (n) => R.flertall(n, "slurk", "slurker");

  let H; // the actions, so one action can reuse another
  let opptatt = false; // the card is turning: ignore new guesses until it has

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS);
  }

  // A crystal ball behind the card (drawn for the dark background).
  const KULE = `<svg class="spa-kule" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs><radialGradient id="spa-glod" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="var(--aksent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--aksent)" stop-opacity="0"/></radialGradient></defs>
      <circle cx="100" cy="100" r="96" fill="url(#spa-glod)"/>
      <g class="spa-stjerner" fill="var(--lampe)"><path d="M30 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M168 56 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/><path d="M160 160 l2.5 7 7 2.5 -7 2.5 -2.5 7 -2.5 -7 -7 -2.5 7 -2.5z"/></g>
    </svg>`;

  // ---------- Pieces of the screen ----------

  function bordHtml(sp) {
    const bord = paBordet(sp);
    const kolonner = [];
    for (let v = 1; v <= 13; v++) {
      const prikker = [0, 1, 2, 3].map((n) => `<i class="${n < bord[v] ? "ute" : ""}"></i>`).join("");
      kolonner.push(`<li class="${bord[v] >= 4 ? "tom" : ""}"><b>${BOKSTAV[v]}</b><span>${prikker}</span></li>`);
    }
    const sett = bord.reduce((s, n) => s + n, 0);
    return `<div class="spa-bord">
      <p class="spa-bord-tittel"><span>${esc(R.t("På bordet"))}</span><span>${esc(R.t("{n} av 52", { n: sett }))}</span></p>
      <ol class="spa-bord-liste" aria-label="${esc(R.t("Kortene som er spilt: {liste}", { liste: bordListe(bord) }))}">${kolonner.join("")}</ol>
    </div>`;
  }
  // «ess: 1, 7: 2 …» – only the values that have been played, for screen readers.
  function bordListe(bord) {
    const deler = [];
    for (let v = 1; v <= 13; v++) if (bord[v]) deler.push(`${VERDINAVN[v]}: ${bord[v]}`);
    return deler.length ? deler.join(", ") : R.t("ingen ennå");
  }

  function tasterHtml(sp) {
    const ok = new Set(mulige(sp));
    const knapper = [];
    for (let v = 1; v <= 13; v++) {
      const forste = sp.fase === "gjett2" && v === sp.g1;
      knapper.push(
        `<button class="spa-tast${forste ? " forste" : ""}" data-h="gjett" data-v="${v}" aria-label="${esc(VERDINAVN[v])}"${ok.has(v) ? "" : " disabled"}>${BOKSTAV[v]}</button>`,
      );
    }
    return `<div class="spa-taster" role="group" aria-label="${esc(R.t("Velg en verdi"))}">${knapper.join("")}</div>`;
  }

  function hvemHtml(sp) {
    return `<div class="spa-hvem">
      ${R.avatar(sp.gjetter, "mid")}
      <div class="spa-hvem-tekst">
        <p class="etikett">${esc(R.t("Gjetter"))}</p>
        <p class="spa-navn">${esc(R.navn(sp.gjetter))}</p>
        <p class="spa-giver"><span aria-hidden="true">🃏</span> ${esc(R.t("Giver: {navn}")).replace("{navn}", `<b>${esc(R.navn(sp.giver))}</b>`)}</p>
      </div>
    </div>`;
  }

  function utfallHtml(sp) {
    const u = sp.utfall;
    const k = sp.stokk[sp.pos];
    const n = sp.pos * 7 + sp.gjetter;
    const giver = `<b>${esc(R.navn(sp.giver))}</b>`;
    const gjetter = `<b>${esc(R.navn(sp.gjetter))}</b>`;
    let stempel;
    let linje;
    let hvem;
    if (u.type === "bom") {
      stempel = `<span class="stempel">${esc(R.t("Bom!"))}</span>`;
      linje = velg(T.bom, n);
      hvem = esc(R.t("{navn} bommet med {n} – ta {slurker}.", { n: u.avstand, slurker: slurkTekst(u.slurker) })).replace("{navn}", gjetter);
    } else {
      stempel = `<span class="stempel mynte">${esc(R.t("Riktig!"))}</span>`;
      linje = velg(u.type === "forste" ? T.forste : T.andre, n);
      hvem = esc(u.type === "forste" ? R.t("Giveren {navn} tar to slurker.") : R.t("Giveren {navn} tar en slurk.")).replace("{navn}", giver);
    }
    const bytt =
      sp.byttes != null
        ? `<p class="spa-bytt"><span aria-hidden="true">🃏</span> ${esc(R.t("Tre bom på rad! {giver} gir kortstokken videre til {ny}."))
            .replace("{giver}", giver)
            .replace("{ny}", `<b>${esc(R.navn(sp.byttes))}</b>`)}</p>`
        : "";
    return `<div class="spa-utfall ${u.type === "bom" ? "bom" : "riktig"}" role="status">
        ${stempel}
        <p class="spa-kortnavn">${esc(KORT.Navn(k))}</p>
        <p class="spa-linje">${esc(linje)}</p>
        <p class="spa-hvem-drikker">${hvem}</p>
        ${bytt}
      </div>`;
  }

  function spillSkjerm(S) {
    const sp = S.spill;
    const k = sp.stokk[sp.pos];
    const svart = sp.fase === "svar";
    const fot = `<p class="spa-fot-linje"><span aria-hidden="true">🥤</span> ${esc(R.t("Alkoholfritt teller like mye · alle kan stå over"))}</p>`;
    const kortet = `<div class="spa-scene">${KULE}${KORT.html(svart ? k : null, { opp: svart, stor: true, klasse: "spa-kortet", attr: ' id="spa-kort"' })}</div>`;
    let midt;
    if (svart) midt = utfallHtml(sp);
    else if (sp.fase === "gjett2")
      midt = `<div class="spa-hint" role="status"><span class="stempel aksent">${esc(sp.hint === "hoyere" ? R.t("Høyere!") : R.t("Lavere!"))}</span><p class="spa-linje">${esc(velg(sp.hint === "hoyere" ? T.hoyere : T.lavere, sp.pos * 5 + sp.g1))}</p><p class="spa-forsok">${esc(R.t("Første gjett: {verdi}. Ett forsøk til!", { verdi: VERDINAVN[sp.g1] }))}</p></div>`;
    else midt = `<div class="spa-hint"><p class="spa-sporsmal">${esc(R.t("Hvilken verdi har kortet?"))}</p><p class="spa-forsok">${esc(R.t("Ess er 1, konge er 13."))}</p></div>`;
    const neste = nesteGjetter(sp.antall, sp.byttes != null ? sp.byttes : sp.giver, sp.byttes != null ? sp.byttes : sp.gjetter);
    const sisteKort = sp.pos + 1 >= sp.stokk.length;
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(R.t("{navn} gjetter", { navn: R.navn(sp.gjetter) }))}</h1>
      ${hvemHtml(sp)}
      <div class="spa-midt">${kortet}${midt}</div>
      ${bordHtml(sp)}
      ${svart ? fot : ""}
      ${R.ui.dokk(
        svart
          ? sisteKort
            ? R.ui.knapp(R.t("Til kåringen"), "neste", { variant: "stor", ikon: "🔮" })
            : `<p class="spa-neste-linje">${R.avatar(neste)}<span>${esc(R.t("{navn} gjetter neste")).replace("{navn}", `<b>${esc(R.navn(neste))}</b>`)}</span></p>${R.ui.knapp(R.t("Neste kort"), "neste")}`
          : tasterHtml(sp),
        R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
      )}`;
  }

  // ---------- Kåringen ----------

  function rader(sp) {
    return sp.poeng.map((p, i) => ({ i, poeng: p }));
  }
  function vinnere(sp) {
    const topp = Math.max(0, ...sp.poeng);
    return topp > 0 ? sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
  }
  function sistLinje() {
    const s = R.les(SIST, null);
    if (!s || typeof s.navn !== "string" || !s.navn || !Number.isInteger(s.poeng) || s.poeng < 1) return "";
    return R.t("Sist ble {navn} kveldens spåkone med {poeng}.", { navn: R.kutt(s.navn, 40), poeng: R.flertall(s.poeng, "poeng", "poeng") });
  }

  R.start({
    id: "spakona",
    versjon: 1,
    pagar,

    tilstand: () => ({ antall: standardAntall(), spill: null }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS);
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < n;
        const liste = (l) => Array.isArray(l) && l.length === n && l.every((x) => Number.isInteger(x) && x >= 0);
        const ok =
          Number.isInteger(n) && n >= MIN && n <= MAKS &&
          Array.isArray(sp.stokk) && sp.stokk.length === ANTALL_KORT && new Set(sp.stokk).size === ANTALL_KORT && sp.stokk.every((k) => Number.isInteger(k) && k >= 0 && k < ANTALL_KORT) &&
          Number.isInteger(sp.pos) && sp.pos >= 0 && sp.pos < ANTALL_KORT &&
          spiller(sp.giver) && spiller(sp.gjetter) && sp.giver !== sp.gjetter &&
          ["gjett1", "gjett2", "svar", "vann"].includes(sp.fase) &&
          liste(sp.poeng) && liste(sp.treff) && liste(sp.gjettet) &&
          (sp.fase !== "gjett2" || (Number.isInteger(sp.g1) && ["hoyere", "lavere"].includes(sp.hint))) &&
          (sp.fase !== "svar" || (sp.utfall && ["forste", "andre", "bom"].includes(sp.utfall.type))) &&
          (sp.byttes == null || spiller(sp.byttes));
        if (!ok) S.spill = null;
        else {
          sp.bomRad = R.klamp(Number(sp.bomRad) || 0, 0, BOM_PA_RAD);
          sp.vann = Math.max(0, Number(sp.vann) || 0);
          sp.byttet = Math.max(0, Number(sp.byttet) || 0);
        }
      }
      if (["spill", "vann"].includes(S.skjerm)) S.skjerm = pagar(S) ? (S.spill.fase === "vann" ? "vann" : "spill") : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Én er giver og holder mobilen. De andre gjetter verdien på neste kort i bunken – ess er 1, konge er 13. Bare små slurker, og alkoholfritt teller like mye."),
      steg: [
        [R.t("Gjett verdien"), R.t("Den som gjetter, sier en verdi, og giveren trykker på den. Bommer du, sier Spåkona «høyere» eller «lavere», og du får ett forsøk til.")],
        [R.t("Hvem drikker?"), R.t("Riktig på første forsøk: Giveren tar to slurker. På andre: én. Bommer du to ganger, tar du en til tre slurker – jo lenger unna, jo flere.")],
        [R.t("Tre bom på rad"), R.t("Bommer tre etter hverandre, har giveren gjort jobben sin og gir kortstokken videre.")],
      ],
      tips: [
        R.t("Alkoholfritt teller like mye, og alle kan stå over – uten å forklare seg."),
        R.t("Kortene som er spilt, ligger på bordet under kortet. Tell dem!"),
        R.t("Etter hvert tolvte kort er det vannpause for alle."),
        R.t("Kåringen gir poeng for treff: to på første forsøk, ett på andre."),
        R.t("Spis og drikk vann underveis, og sørg for trygg vei hjem."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sist = !pagar(S) ? sistLinje() : "";
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Gjett verdien på neste kort."))}<br><em>${esc(R.t("Spåkona sier høyere eller lavere."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · {n} kort igjen", { n: ANTALL_KORT - S.spill.pos }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + (sist ? `<p class="hjelp spa-sist">${esc(sist)}</p>` : ""),
            }),
            merker: [
              [`${MIN}–${MAKS}`, R.t("spillere")],
              ["52", R.t("kort")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis: () => `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Sett dere i ring i samme rekkefølge som lista. Mobilen velger hvem som er giver først.") })}
          <div class="papirboks spa-vett">
            <p class="etikett">${esc(R.t("Slik er slurkene"))}</p>
            <ul class="tips">
              <li>${esc(R.t("En slurk er en liten slurk – aldri mer."))}</li>
              <li>${esc(R.t("Aldri mer enn tre slurker om gangen."))}</li>
              <li>${esc(R.t("Alkoholfritt teller like mye, og alle kan stå over."))}</li>
              <li>${esc(R.t("Etter hvert tolvte kort tar alle en vannpause."))}</li>
            </ul>
          </div>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`,
      },

      spill: {
        tittel: (S) => R.t("Kort {n} av 52", { n: S.spill.pos + 1 }),
        tilbake: "hjem",
        vis: spillSkjerm,
        inn: () => R.holdVaken(),
      },

      vann: {
        tittel: R.t("Vannpause"),
        tilbake: "hjem",
        vis: (S) => `
          <div class="spa-vann">
            <svg class="spa-vannglass" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
              <defs><clipPath id="spa-glass-innside"><path d="M24 22 L34 132 Q35 140 44 140 H76 Q85 140 86 132 L96 22 Z"/></clipPath></defs>
              <g clip-path="url(#spa-glass-innside)">
                <path class="spa-vannflate" d="M0 70 Q15 62 30 70 T60 70 T90 70 T120 70 T150 70 V160 H0 Z" fill="var(--himmel)"/>
                <circle class="spa-boble" cx="50" cy="120" r="4" fill="#fff" opacity=".7"/>
                <circle class="spa-boble to" cx="70" cy="128" r="3" fill="#fff" opacity=".6"/>
              </g>
              <path d="M20 18 L31 133 Q32 144 44 144 H76 Q88 144 89 133 L100 18 Z" fill="none" stroke="var(--papir)" stroke-width="6" stroke-linejoin="round"/>
              <path d="M36 34 L42 112" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
            </svg>
            <p class="etikett">${esc(R.t("Etter {kort}", { kort: R.flertall(S.spill.pos, "kort", "kort") }))}</p>
            <h1 id="skjerm-tittel">${esc(R.t("Vannpause!"))}</h1>
            <p class="ingress">${esc(R.t("Alle tar en god slurk vann før neste kort. Kroppen takker – og kvelden varer lenger."))}</p>
          </div>
          ${R.ui.dokk(R.ui.knapp(R.t("Skål i vann!"), "vann-ferdig", { variant: "himmel", ikon: "💧" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`,
        inn() {
          R.lyd.pop();
          R.vibrer(20);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = vinnere(sp);
          const r = rader(sp);
          const spilt = sp.pos + 1;
          return `
            ${R.ui.banner({
              klasse: "aksent spa-banner",
              etikett: R.t("Kveldens spåkone"),
              tittel: v.length ? R.t("{navn} vinner!", { navn: R.ramsOpp(v.map((i) => R.navn(i))) }) : R.t("Kortene vant i kveld!"),
              tekst: R.t("{treff} av {kort} truffet.", { treff: sp.treff.reduce((s, n) => s + n, 0), kort: R.flertall(spilt, "kort", "kort") }),
              stemning: v.length ? "jubel" : "",
            })}
            ${R.ui.pall(r)}
            ${R.ui.poengliste(r)}
            <div class="spa-del">${R.ui.knapp2(R.t("Del kvelden"), "del")}</div>
            <p class="hjelp spa-hjem">💧 ${esc(R.t("Husk vann, mat og trygg vei hjem."))}</p>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp.talt) {
            sp.talt = true;
            R.kveld.registrer(rader(sp));
            const v = vinnere(sp);
            if (v.length) R.skriv(SIST, { navn: R.navn(v[0]), poeng: sp.poeng[v[0]] });
            R.statistikk("ferdig", { spillere: sp.antall, kort: sp.pos + 1, treff: sp.treff.reduce((s, n) => s + n, 0) });
            R.lagre();
          }
          if (vinnere(sp).length) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--lampe", "--lilla", "--himmel"]);
          } else R.lyd.pling();
          R.slippVaken();
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
      endre(el, e, S) {
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil(S.spill.fase === "vann" ? "vann" : "spill");
      },
      start(el, e, S) {
        const antall = R.klamp(S.antall || 4, MIN, MAKS);
        S.spill = ny(antall, R.rng(R.nyttFro()));
        R.statistikk("start", { spillere: antall });
        R.gaTil("spill");
      },
      async gjett(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || (sp.fase !== "gjett1" && sp.fase !== "gjett2")) return;
        const g = Number(el.dataset.v);
        if (!mulige(sp).includes(g)) return;
        const r = gjett(sp, g);
        if (!r) return;
        R.vibrer(12);
        if (r === "hint") {
          R.lyd.pling();
          R.vis();
          R.si(`${sp.hint === "hoyere" ? R.t("Høyere!") : R.t("Lavere!")} ${R.t("Første gjett: {verdi}. Ett forsøk til!", { verdi: VERDINAVN[sp.g1] })}`);
          return;
        }
        // The card turns: draw it face down first, then flip it.
        opptatt = true;
        const fortsatt = R.vakt();
        R.vis();
        const kort = R.$("#spa-kort");
        if (kort && !R.rolig()) {
          kort.classList.remove("sk-opp");
          void kort.offsetWidth;
          kort.classList.add("sk-opp");
        }
        R.lyd.snu();
        await R.vent(R.rolig() ? 0 : 380);
        opptatt = false;
        if (!fortsatt()) return;
        if (r === "bom") {
          R.lyd.feil();
          R.vibrer([30, 40, 30]);
        } else {
          R.lyd.riktig();
          R.vibrer([20, 30, 60]);
        }
        const u = sp.utfall;
        R.si(`${KORT.Navn(sp.stokk[sp.pos])}. ${r === "bom" ? R.t("{navn} bommet med {n} – ta {slurker}.", { navn: R.navn(sp.gjetter), n: u.avstand, slurker: slurkTekst(u.slurker) }) : r === "forste" ? R.t("Giveren {navn} tar to slurker.", { navn: R.navn(sp.giver) }) : R.t("Giveren {navn} tar en slurk.", { navn: R.navn(sp.giver) })}`);
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.fase !== "svar") return;
        videre(sp);
        if (sp.ferdig) {
          R.gaTil("slutt");
          return;
        }
        if (sp.fase === "vann") {
          R.gaTil("vann");
          return;
        }
        R.lyd.sveip();
        R.vis();
        window.scrollTo(0, 0);
        R.si(R.t("{navn} gjetter", { navn: R.navn(sp.gjetter) }));
      },
      "vann-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "vann") return;
        videre(sp);
        R.gaTil("spill");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = sp.pos === 0 && sp.fase !== "svar";
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ingenting ? R.t("Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (ingenting) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        // The card on the table counts only once it has been turned.
        if (sp.fase !== "svar" && sp.pos > 0) sp.pos -= 1;
        sp.ferdig = true;
        R.gaTil("slutt");
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const treff = sp.treff.reduce((s, n) => s + n, 0);
        const kort = R.flertall(sp.pos + 1, "kort", "kort");
        R.del(R.app.navn, R.t("{spill}: {treff} av {kort} truffet i kveld. Hvem av dere er mest synsk?", { spill: R.app.navn, treff, kort }), ADRESSE, {
          kort: { tittel: R.app.navn, linjer: [R.t("{treff} av {kort}", { treff, kort }), R.t("truffet i kveld")] },
        });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
