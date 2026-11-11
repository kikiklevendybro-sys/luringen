// Builds rusj.no: the front page (portal), one page per game under /<id>/, shared files under
// /felles/, offline support (sw.js), manifest, sitemap and 404 page. No dependencies.
// Called from scripts/bygg.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);

export const DOMENE = "https://rusj.no";

// Content Security Policy: only files from rusj.no itself; no inline scripts, no outside requests.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function hashTekst(tekst) {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Darker shade of an accent colour for the 3D button edge.
export function morkere(hex, mengde = 0.3) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  // Mix towards a deep purple-black so shadows stay in the night palette.
  const [mr, mg, mb] = [40, 14, 60];
  r = Math.round(r * (1 - mengde) + mr * mengde - 18 * mengde);
  g = Math.round(g * (1 - mengde) + mg * mengde - 18 * mengde);
  b = Math.round(b * (1 - mengde) + mb * mengde - 4 * mengde);
  const k = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return "#" + k(r) + k(g) + k(b);
}

// ---------- Search data (rusj/seo.json) ----------

// Other companies' game brands. They may help the front-page search find a game (as hidden
// synonyms in `sok`), but never go into a title, a description, a link preview or structured data.
const MERKER = [
  "alias", "codenames", "spyfall", "heads up", "wavelength", "just one", "herd mentality", "smart10", "timeline", "hitster",
  "kahoot", "pictionary", "skribbl", "gartic", "battleship", "connect four", "connect 4", "yahtzee", "uno", "scattergories",
  "taboo", "tabu", "trivial pursuit", "bezzerwizzer", "fia med knuff", "maxi-yatzy", "maxi yatzy", "memory",
];
export const merkeI = (tekst) => {
  const t = " " + String(tekst).toLocaleLowerCase("nb").replace(/[^a-zæøå0-9-]+/g, " ") + " ";
  return MERKER.find((m) => t.includes(" " + m + " ")) || null;
};
export const TITTEL_MAKS = 62; // with « | rusj»; search results show about 60 characters
export const BESKRIVELSE_GRENSER = [100, 160];

// Reads rusj/seo.json and stops the build on anything that would hurt in search results:
// too long or too short texts, two pages with the same title or description, a brand name.
export function lesSeo(rot) {
  const fil = join(rot, "rusj/seo.json");
  const seo = JSON.parse(readFileSync(fil, "utf8"));
  const feil = [];
  const titler = new Map();
  const beskrivelser = new Map();
  for (const [id, s] of Object.entries(seo.spill || {})) {
    for (const felt of ["tittel", "frase", "beskrivelse"]) if (!s[felt] || typeof s[felt] !== "string") feil.push(`${id}: mangler "${felt}"`);
    if (!s.tittel || !s.frase || !s.beskrivelse) continue;
    const tittel = `${s.tittel} | rusj`;
    if (tittel.length > TITTEL_MAKS) feil.push(`${id}: tittelen er ${tittel.length} tegn (maks ${TITTEL_MAKS} med « | rusj»)`);
    const [min, maks] = BESKRIVELSE_GRENSER;
    if (s.beskrivelse.length < min || s.beskrivelse.length > maks) feil.push(`${id}: beskrivelsen er ${s.beskrivelse.length} tegn (${min}–${maks})`);
    for (const felt of ["tittel", "frase", "beskrivelse"]) {
      const merke = merkeI(s[felt]);
      if (merke) feil.push(`${id}: «${merke}» er en annens merkevare og kan bare stå i "sok", ikke i "${felt}"`);
    }
    if (titler.has(s.tittel)) feil.push(`${id} og ${titler.get(s.tittel)} har samme tittel`);
    if (beskrivelser.has(s.beskrivelse)) feil.push(`${id} og ${beskrivelser.get(s.beskrivelse)} har samme beskrivelse`);
    titler.set(s.tittel, id);
    beskrivelser.set(s.beskrivelse, id);
    if (s.sok && !Array.isArray(s.sok)) feil.push(`${id}: "sok" må være en liste`);
  }
  if (feil.length) throw new Error(`${fil}:\n  ` + feil.join("\n  "));
  return seo;
}

// Title, link-preview title, search phrase and description of one game page.
export function seoFor(seo, m) {
  const s = (seo.spill || {})[m.id];
  if (!s) {
    // A game without an entry still builds (so a new game is never blocked), with the plain formula.
    console.warn(`  ⚠ ${m.id}: mangler i rusj/seo.json (tittel, frase, beskrivelse) – bruker navn og undertittel`);
    return { tittel: `${m.navn} – ${m.undertittel} | rusj`, ogTittel: `${m.navn} – ${m.undertittel}`, frase: m.undertittel, beskrivelse: m.beskrivelse || m.kort, sok: [] };
  }
  // The receiver of a link does not know the mascot: the phrase first, the name second.
  const harNavnet = s.frase.toLocaleLowerCase("nb").includes(m.navn.toLocaleLowerCase("nb"));
  const ogTittel = (harNavnet ? s.frase : `${s.frase} · ${m.navn}`) + (m.alder18 ? " (18+)" : "");
  return { tittel: `${s.tittel} | rusj`, ogTittel, frase: s.frase, beskrivelse: s.beskrivelse, sok: s.sok || [], type: s.type || null, samarbeid: !!s.samarbeid };
}

// ---------- <head>, the same for every page (also Luringen, see scripts/bygg.mjs) ----------

// o: tittel, ogTittel, beskrivelse, sti (leave out for a page that must not be indexed), noindex,
// kortnavn, ikon (svg), pngIkon, appleIkon, deling (share image) + delingAlt, css [], skript [],
// htmlAttr, jsonld (structured data: printed as an inline data block, which the CSP allows – it is
// not run).
// Scripts go in the <head> with `defer`, never at the end of <body>: the Content-Security-Policy
// <meta> switches off the browser's look-ahead loading for everything after it, so scripts at the
// end of the page were fetched one at a time, each waiting for the one before (a game was playable
// 1.7–2.9 s later on a slow phone link). Deferred scripts are all found at once, load side by
// side, and still run in this order after the page has been read – exactly when they ran before.
export function hode(o) {
  const url = o.sti ? `${DOMENE}${o.sti}` : null;
  const linjer = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    `<meta name="referrer" content="no-referrer">`,
    `<title>${esc(o.tittel)}</title>`,
    `<meta name="description" content="${esc(o.beskrivelse)}">`,
    `<meta name="robots" content="${o.noindex ? "noindex" : "max-image-preview:large"}">`,
    url && `<link rel="canonical" href="${url}">`,
    `<meta name="theme-color" content="#150c28">`,
    `<meta name="color-scheme" content="dark">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
    `<meta name="apple-mobile-web-app-title" content="${esc(o.kortnavn || "rusj")}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="rusj">`,
    `<meta property="og:locale" content="nb_NO">`,
    `<meta property="og:title" content="${esc(o.ogTittel || o.tittel)}">`,
    `<meta property="og:description" content="${esc(o.beskrivelse)}">`,
    url && `<meta property="og:url" content="${url}">`,
    o.deling && `<meta property="og:image" content="${DOMENE}${o.deling.split("?")[0]}">`,
    o.deling && `<meta property="og:image:width" content="1200">`,
    o.deling && `<meta property="og:image:height" content="630">`,
    o.deling && o.delingAlt && `<meta property="og:image:alt" content="${esc(o.delingAlt)}">`,
    o.deling && `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="manifest" href="/manifest.webmanifest">`,
    // PNG first, SVG last: browsers that know SVG icons take the last one, the rest take the PNG.
    o.pngIkon && `<link rel="icon" href="${o.pngIkon}" type="image/png" sizes="192x192">`,
    o.ikon && `<link rel="icon" href="${o.ikon}" type="image/svg+xml">`,
    o.appleIkon && `<link rel="apple-touch-icon" href="${o.appleIkon}">`,
    ...(o.css || []).map((c) => `<link rel="stylesheet" href="${c}">`),
    ...(o.skript || []).map((s) => `<script defer src="${s}"></script>`),
    o.jsonld && `<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, "\\u003c")}</script>`,
  ];
  return `<!doctype html>\n<html lang="nb"${o.htmlAttr || ""}>\n<head>\n${linjer.filter(Boolean).join("\n")}\n</head>`;
}

// ---------- Structured data (schema.org) ----------

const UTGIVER = { "@type": "Organization", "@id": `${DOMENE}/#utgiver`, name: "rusj", url: `${DOMENE}/`, logo: `${DOMENE}/ikon-512.png` };

// One game page: the game itself (or a tool) and the path to it from the front page.
export function spillJsonLd(m, s, bilde) {
  const [min, maks] = m.spillere;
  const url = `${DOMENE}/${m.id}/`;
  const node = {
    "@type": s.type || "VideoGame",
    "@id": `${url}#spill`,
    name: m.navn,
    alternateName: s.frase,
    url,
    description: s.beskrivelse,
    ...(bilde ? { image: `${DOMENE}${bilde.split("?")[0]}` } : {}),
    inLanguage: "nb",
    applicationCategory: s.type ? "UtilitiesApplication" : "GameApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "NOK" },
    publisher: { "@id": UTGIVER["@id"] },
  };
  if (!s.type) {
    node.gamePlatform = "Nettleser";
    node.playMode = s.samarbeid ? "CoOp" : maks === 1 ? "SinglePlayer" : min === 1 ? ["SinglePlayer", "MultiPlayer"] : "MultiPlayer";
    node.numberOfPlayers = { "@type": "QuantitativeValue", minValue: min, maxValue: maks };
  }
  if (m.alder18) node.audience = { "@type": "PeopleAudience", suggestedMinAge: 18 };
  return {
    "@context": "https://schema.org",
    "@graph": [
      node,
      UTGIVER,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "rusj", item: `${DOMENE}/` },
          { "@type": "ListItem", position: 2, name: s.frase, item: url },
        ],
      },
    ],
  };
}

// ---------- When a page last changed (for sitemap.xml) ----------

// The date of the last commit that touched each source folder, from one git call. Without git
// (or for files not committed yet) the caller falls back to today.
function sistEndret(rot) {
  const datoer = new Map(); // first path segment(s) -> YYYY-MM-DD
  try {
    const ut = execFileSync("git", ["log", "-n", "500", "--format=@%cs", "--name-only", "--", "rusj/spill", "rusj/portal", "rusj/seo.json", "src", "data"], {
      cwd: rot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let dato = null;
    for (const linje of ut.split("\n")) {
      if (linje.startsWith("@")) dato = linje.slice(1).trim();
      else if (linje && dato) {
        const d = linje.split("/");
        const nokkel = d[0] === "rusj" && d[1] === "spill" ? d.slice(0, 3).join("/") : d[0] === "rusj" ? d.slice(0, 2).join("/") : d[0];
        if (!datoer.has(nokkel)) datoer.set(nokkel, dato); // newest first
      }
    }
  } catch (e) {
    /* no git, or not a repository: every page gets today's date */
  }
  return datoer;
}

const PAKREVD = ["id", "navn", "undertittel", "beskrivelse", "kort", "spillere", "minutter", "mobiler", "tagger", "rekkefolge"];
export const TAGGER = {
  fest: "Fest",
  familie: "Familie",
  barn: "Barn",
  blof: "Bløff",
  ord: "Ord",
  lag: "Lag mot lag",
  quiz: "Quiz",
  tegning: "Tegning",
  hukommelse: "Hukommelse",
  sporsmal: "Prat",
  klassiker: "Klassikere",
  daglig: "Dagens",
  tenke: "Hjernetrim",
  alene: "Alene",
  kort: "Kortspill",
  verktoy: "Verktøy",
  drikke: "Drikkespill 18+",
};

const varslet = new Set();
export function lesSpill(rot, utvalg) {
  const mappe = join(rot, "rusj/spill");
  const G = require(join(rot, "rusj/kit/gjengen.js"));
  const spill = [];
  for (const id of readdirSync(mappe)) {
    const fil = join(mappe, id, "spill.json");
    if (!existsSync(fil)) continue;
    const m = JSON.parse(readFileSync(fil, "utf8"));
    for (const felt of PAKREVD) if (m[felt] == null) throw new Error(`${fil}: mangler "${felt}"`);
    if (m.id !== id) throw new Error(`${fil}: id "${m.id}" matcher ikke mappenavnet`);
    if (!G.finnes(id)) throw new Error(`${fil}: ingen figur for "${id}" i rusj/kit/gjengen.js`);
    if (!["en", "hver", "begge"].includes(m.mobiler)) throw new Error(`${fil}: mobiler må være en, hver eller begge`);
    for (const t of m.tagger) if (!TAGGER[t]) throw new Error(`${fil}: ukjent tagg "${t}"`);
    if (m.beskrivelse.length > 170) console.warn(`  ⚠ ${id}: beskrivelse er ${m.beskrivelse.length} tegn (bør være under 160)`);
    // These three are shown on the front page and on the game's own page.
    for (const felt of ["navn", "undertittel", "kort"]) {
      const merke = merkeI(m[felt]);
      const varsel = merke && `  ⚠ ${id}: «${merke}» i "${felt}" er en annens merkevare – bruk et allment ord (merkenavn bare i "sok")`;
      if (varsel && !varslet.has(varsel) && !(utvalg && !utvalg.includes(id))) {
        varslet.add(varsel); // the games are read more than once per build
        console.warn(varsel);
      }
    }
    m.farge = m.farge || G.farge(id);
    m.mappe = join(mappe, id);
    if (utvalg && !utvalg.includes(id)) continue;
    spill.push(m);
  }
  spill.sort((a, b) => a.rekkefolge - b.rekkefolge);
  return spill;
}

export function spillereTekst(m) {
  const [a, b] = m.spillere;
  return a === b ? `${a}` : `${a}–${b}`;
}
export function tidTekst(m) {
  const [a, b] = m.minutter;
  return a === b ? `${a} min` : `${a}–${b} min`;
}

export function byggRusj({ ROT, WEB, ordData, utvalg, luringen }) {
  const G = require(join(ROT, "rusj/kit/gjengen.js"));
  const kilde = (sti) => readFileSync(join(ROT, sti), "utf8");
  const filer = []; // every published path, for the service worker
  const skriv = (sti, innhold) => {
    const fil = join(WEB, sti);
    mkdirSync(join(fil, ".."), { recursive: true });
    writeFileSync(fil, innhold);
    filer.push("/" + sti);
    return "/" + sti + "?v=" + hashTekst(typeof innhold === "string" ? innhold : innhold.toString("base64"));
  };
  const kopier = (fra, til) => {
    if (!existsSync(fra)) return null;
    return skriv(til, readFileSync(fra));
  };

  // ---------- Shared files ----------
  const felles = {
    css: skriv("felles/rusj.css", kilde("rusj/kit/rusj.css")),
    gjengen: skriv("felles/gjengen.js", kilde("rusj/kit/gjengen.js")),
    js: skriv("felles/rusj.js", kilde("rusj/kit/rusj.js")),
    qr: skriv("felles/qr.js", kilde("src/qr.js")),
    ord: skriv("felles/ord.js", "window.RUSJ_ORD=" + JSON.stringify(ordData).replace(/</g, "\\u003c") + ";"),
  };

  // Icons and share images (drawn by scripts/lag-bilder.mjs, committed in rusj/bilder)
  const BILDER = join(ROT, "rusj/bilder");
  const bilde = (navn) => (existsSync(join(BILDER, navn)) ? kopier(join(BILDER, navn), navn) : null);
  const ikoner = {
    svg: bilde("ikon.svg"),
    p180: bilde("ikon-180.png"),
    p192: bilde("ikon-192.png"),
    p512: bilde("ikon-512.png"),
    maske: bilde("ikon-maskerbar-512.png"),
    deling: bilde("deling.png"),
  };
  for (const [k, v] of Object.entries(ikoner)) if (!v) console.warn(`  ⚠ mangler rusj/bilder for ${k} (kjør node scripts/lag-bilder.mjs)`);

  const spill = lesSpill(ROT, utvalg);
  const LOGO = G.logo();
  // Every game can suggest the others (also those not built in a partial test build).
  const alleSpillKort = [...(luringen ? [luringen] : []), ...lesSpill(ROT, null)].sort((a, b) => a.rekkefolge - b.rekkefolge);

  const seo = lesSeo(ROT);
  const seoAv = new Map(); // one lookup per game (and one warning, if a game has no entry yet)
  const sokedata = (m) => {
    if (!seoAv.has(m.id)) seoAv.set(m.id, seoFor(seo, m));
    return seoAv.get(m.id);
  };
  const hodeMed = (o) => hode({ pngIkon: ikoner.p192, appleIkon: ikoner.p180, ...o });

  const STEMPEL_FILTER = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="stempel-ruff" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="stoy"/><feDisplacementMap in="SourceGraphic" in2="stoy" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`;

  // ---------- One page per game ----------
  for (const m of spill) {
    const id = m.id;
    const js = join(m.mappe, "spill.js");
    if (!existsSync(js)) throw new Error(`rusj/spill/${id}/spill.js mangler`);
    const spillJs = readFileSync(js, "utf8");
    if (/<\/script/i.test(spillJs)) throw new Error(`${id}: spill.js inneholder </script>`);

    const data = {};
    const dataMappe = join(m.mappe, "data");
    if (existsSync(dataMappe)) {
      for (const f of readdirSync(dataMappe).sort()) {
        if (!f.endsWith(".json")) continue;
        try {
          data[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dataMappe, f), "utf8"));
        } catch (e) {
          throw new Error(`rusj/spill/${id}/data/${f}: ugyldig JSON (${e.message})`);
        }
      }
    }
    const meta = {
      id,
      navn: m.navn,
      undertittel: m.undertittel,
      kort: m.kort,
      spillere: m.spillere,
      minutter: m.minutter,
      farge: m.farge,
      alder18: !!m.alder18,
    };
    // Drinking games only suggest each other; other games never suggest a drinking game.
    // Other games to suggest on the end screen: never drinking games from an ordinary game; a drinking
    // game also suggests ordinary ones (the kit mixes in at least one «pause» from the rest).
    const andre = alleSpillKort
      .filter((g) => g.id !== id && (m.alder18 || !g.alder18))
      .map((g) => ({ id: g.id, navn: g.navn, undertittel: g.undertittel, spillere: g.spillere, farge: g.farge, ...(g.alder18 ? { alder18: true } : {}) }));
    const dataJs =
      "window.RUSJ_SPILL=" + JSON.stringify(meta) + ";\nwindow.RUSJ_ANDRE=" + JSON.stringify(andre).replace(/</g, "\\u003c") + ";\nwindow.RUSJ_DATA=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";\n";
    const dataSti = skriv(`${id}/data.js`, dataJs);
    const spillSti = skriv(`${id}/spill.js`, spillJs);
    const css = [felles.css];
    if (existsSync(join(m.mappe, "spill.css"))) css.push(skriv(`${id}/spill.css`, readFileSync(join(m.mappe, "spill.css"), "utf8")));
    const ikon = skriv(`${id}/ikon.svg`, ikonSvg(G, id));
    const deling = existsSync(join(BILDER, `deling-${id}.png`)) ? kopier(join(BILDER, `deling-${id}.png`), `${id}/deling.png`) : ikoner.deling;

    const skript = [felles.gjengen, felles.js];
    if (m.qr) skript.push(felles.qr);
    if (m.ordbank) skript.push(felles.ord);
    skript.push(dataSti, spillSti);

    const dyp = m.fargeDyp || morkere(m.farge);
    // Title, description and link preview come from rusj/seo.json: the words people search for
    // first, the mascot second. The mascot stays the name on the page itself.
    const sd = sokedata(m);
    const side = `${hodeMed({
      tittel: sd.tittel,
      ogTittel: sd.ogTittel,
      beskrivelse: sd.beskrivelse,
      sti: `/${id}/`,
      kortnavn: m.navn,
      ikon,
      deling,
      delingAlt: `${m.navn} – ${sd.frase}. Gratis på rusj.no`,
      css,
      skript,
      htmlAttr: ` data-spill="${id}" style="--aksent: ${m.farge}; --aksent-dyp: ${dyp}"`,
      jsonld: spillJsonLd(m, sd, deling),
    })}
<body>
<div class="scene" aria-hidden="true"></div>
<div class="app">
  <header class="topp">
    <a class="topp-merke" id="tilportal" href="/" aria-label="Alle spill på rusj.no"><svg class="pil" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>${LOGO}</a>
    <button class="ikonknapp" id="tilbake" data-h="tilbake" aria-label="Tilbake" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
    <span class="topp-tittel" id="topp-tittel"></span>
    <div class="topp-hoyre">
      <button class="ikonknapp" id="reglerknapp" data-h="regler" aria-label="Slik spiller du"><span class="sporsmal" aria-hidden="true">?</span></button>
      <button class="ikonknapp" id="lydknapp" data-h="lyd" aria-label="Lyd" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="fylt" d="M4 9h4l5-4v14l-5-4H4z"/><path class="bolge" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="kryss" d="M17 9l5 6M22 9l-5 6"/></svg></button>
    </div>
  </header>
  <main id="hoved">
    <section class="skjerm" id="skjerm">
      <div class="spillhjem">
        <span class="figur-ramme">${G.svg(id)}</span>
        <h1>${esc(m.navn)}</h1>
        <span class="undertittel">${esc(m.undertittel)}</span>
        <p class="slagord">${esc(sd.beskrivelse)}</p>
      </div>
      <noscript><p class="personvern">${esc(m.navn)} trenger JavaScript for å kjøre.</p></noscript>
    </section>
  </main>
</div>
<div class="ark-bakgrunn" id="ark" hidden><div class="ark" role="dialog" aria-modal="true" aria-labelledby="ark-tittel" id="ark-innhold"></div></div>
<div class="nedtelling" id="nedtelling" hidden aria-live="assertive"></div>
<canvas class="konfetti" id="konfetti" aria-hidden="true"></canvas>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="vh" id="si" aria-live="polite"></div>
${STEMPEL_FILTER}
</body>
</html>
`;
    skriv(`${id}/index.html`, side);
  }

  // ---------- Front page ----------
  const alleKort = [];
  if (luringen) alleKort.push(luringen);
  alleKort.push(...spill);
  alleKort.sort((a, b) => a.rekkefolge - b.rekkefolge);

  const portalCss = skriv("felles/portal.css", kilde("rusj/portal/portal.css"));
  const portalJs = skriv("felles/portal.js", kilde("rusj/portal/portal.js"));
  const spillData = alleKort.map((m) => ({
    id: m.id,
    navn: m.navn,
    undertittel: m.undertittel,
    kort: m.kort,
    spillere: m.spillere,
    minutter: m.minutter,
    tagger: m.tagger,
    mobiler: m.mobiler,
    farge: m.farge,
    alder18: !!m.alder18,
    // The game's own search words plus the ones in rusj/seo.json (what people call the game).
    sok: [...new Set([...(Array.isArray(m.sok) ? m.sok : []), ...sokedata(m).sok])],
  }));
  // RUSJ_TAGGSOK: words people type for a whole kind of game («selskapsleker», «vors», «bursdag»).
  const somData = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
  const portalData = skriv("felles/spilliste.js", "window.RUSJ_SPILLISTE=" + somData(spillData) + ";\nwindow.RUSJ_TAGGSOK=" + somData(seo.tagger || {}) + ";");
  const siderJs = skriv("felles/sider.js", kilde("rusj/portal/sider.js"));
  // One card per game. «Alle spill» shows it as a compact row; portal.js copies it into the
  // shelves (as a bigger tile), the «Fortsett» row, the parade and «Overrask meg».
  const spillereLang = (m) => (m.spillere[1] === 1 ? "For én spiller." : `${spillereTekst(m)} spillere.`);
  const kort = alleKort
    .map(
      (m) => `<li class="spillkort" data-id="${m.id}"${m.alder18 ? " data-alder18" : ""} style="--kf: ${m.farge}">
        <a href="/${m.id}/" aria-label="${esc(`${m.navn}: ${m.undertittel}. ${m.kort} ${spillereLang(m)}`)}">
          <span class="kort-figur">${G.svg(m.id)}${m.alder18 ? '<span class="kort-18" aria-hidden="true">18+</span>' : ""}</span>
          <span class="kort-tekst">
            <span class="kort-sjanger">${esc(m.undertittel)}</span>
            <span class="kort-navn">${esc(m.navn)}</span>
            <span class="kort-linje">${esc(m.kort)}</span>
          </span>
          <span class="kort-spillere"><span aria-hidden="true">👥</span> ${spillereTekst(m)}</span>
        </a>
      </li>`,
    )
    .join("\n");
  const brukteTagger = Object.keys(TAGGER).filter((t) => alleKort.some((m) => m.tagger.includes(t)));
  const antall18 = alleKort.filter((m) => m.alder18).length;
  const forsideTittel = seo.forside.tittel;
  const forsideBeskrivelse = seo.forside.beskrivelse.replace("{antall}", alleKort.length);
  if (forsideTittel.length > TITTEL_MAKS || forsideBeskrivelse.length > BESKRIVELSE_GRENSER[1]) throw new Error("rusj/seo.json: forsidens tittel eller beskrivelse er for lang");
  // The footer is the same on the front page and the pages about rusj. The sentence is exact on
  // purpose: what is typed stays in the browser – the page itself is of course fetched from a host.
  const bunn = (medHjem) => `<footer class="bunn">
  <p class="bunn-logo">${G.logo()}</p>
  <p><b>Ingen konto. Ingen sporing. Ingen reklame.</b><br>Det dere skriver inn, lagres bare i nettleseren på denne enheten. Vi har ingen server som tar imot det.</p>
  <nav class="bunn-lenker" aria-label="Om rusj">${medHjem ? '<a href="/">Alle spill</a>' : ""}<a href="/om/">Om rusj</a><a href="/personvern/">Personvern</a></nav>
  <p class="bunn-liten">rusj.no · laget i Norge</p>
</footer>`;
  const portalSide = `${hodeMed({
    tittel: forsideTittel,
    beskrivelse: forsideBeskrivelse,
    sti: "/",
    ikon: ikoner.svg,
    deling: ikoner.deling,
    delingAlt: "rusj – gratis spill og selskapsleker på norsk",
    css: [felles.css, portalCss],
    skript: [portalData, portalJs],
    jsonld: {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": `${DOMENE}/#nettsted`, name: "rusj", alternateName: "rusj.no", url: `${DOMENE}/`, inLanguage: "nb", description: forsideBeskrivelse, publisher: { "@id": UTGIVER["@id"] } },
        UTGIVER,
        {
          "@type": "ItemList",
          name: "Alle spill på rusj",
          numberOfItems: alleKort.length,
          itemListElement: alleKort.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: sokedata(m).frase.includes(m.navn) ? sokedata(m).frase : `${m.navn} – ${sokedata(m).frase}`, url: `${DOMENE}/${m.id}/` })),
        },
      ],
    },
  })}
<body class="portal">
<div class="scene" aria-hidden="true"></div>
<header class="helt">
  <h1 class="helt-logo"><span class="vh">${esc(forsideTittel)}</span>${G.logo({ klasse: "tegnes" })}</h1>
  <div class="helt-tekst">
    <p class="helt-slagord">Spill for hele gjengen. <br><em>Rett i nettleseren.</em></p>
    <ul class="helt-fakta" aria-label="Om rusj">
      <li><b id="helt-antall">${alleKort.length}</b> spill</li><li><b>0</b> kr</li><li><b>0</b> reklame</li><li><b>Ingen</b> konto</li>
    </ul>
    <div class="helt-knapper">
      <a class="knapp" href="#spill">Finn et spill</a>
      <button class="knapp-2" id="overrask" type="button" aria-haspopup="dialog"><span aria-hidden="true">🎲</span> Overrask meg</button>
    </div>
  </div>
</header>
<div class="parade" aria-hidden="true"><div class="parade-spor" id="parade"></div></div>
<main class="portal-hoved">
  <section class="fortsett" id="fortsett" hidden aria-labelledby="fortsett-tittel">
    <h2 id="fortsett-tittel">Fortsett der dere slapp</h2>
    <ul class="fortsett-rad" id="fortsett-rad"></ul>
  </section>
  <div class="installtips" id="installtips" hidden>
    <span class="installtips-ikon" aria-hidden="true">📲</span>
    <span class="installtips-tekst"><b>Ha rusj som app</b><span class="installtips-mer"> – starter fra hjemskjermen og virker uten nett</span></span>
    <button type="button" class="installtips-vis" id="installtips-vis" aria-label="Vis meg hvordan rusj blir en app">Vis meg</button>
    <button type="button" class="installtips-lukk" id="installtips-lukk" aria-label="Skjul tipset">×</button>
  </div>
  <section class="kveld" id="kveld" hidden aria-labelledby="kveld-tittel">
    <div class="kveld-topp"><h2 id="kveld-tittel">🏆 Kveldens gjeng</h2><span class="kveld-antall" id="kveld-antall"></span></div>
    <ol class="kveld-liste" id="kveld-liste"></ol>
    <div class="kveld-knapper">
      <button type="button" class="kveld-alle" id="kveld-alle" aria-expanded="false" aria-controls="kveld-liste" hidden>Vis alle</button>
      <button type="button" class="lenke" id="kveld-nullstill">Start en ny kveld</button>
    </div>
    <p class="kveld-fot">3 poeng for seier, 2 for andreplass og 1 for tredjeplass – i alle spillene dere spiller i kveld.</p>
  </section>
  <h2 class="filter-overskrift" id="spill" tabindex="-1">Hva skal vi spille?</h2>
  <div class="filter" id="filter" role="search">
    <div class="sok">
      <span class="sok-ikon" aria-hidden="true">🔎</span>
      <input type="search" id="sok" placeholder="Søk etter spill" aria-label="Søk etter spill" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <button type="button" class="sok-tom" id="sok-tom" aria-label="Tøm søket" hidden>×</button>
    </div>
    <button type="button" class="filter-knapp" id="filter-knapp" aria-controls="filtre"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.3"/><circle cx="9" cy="17" r="2.3"/></svg><span>Filter</span><span class="filter-antall" id="filter-antall" hidden></span></button>
  </div>
  <div class="filtre" id="filtre" role="group" aria-label="Filter">
    <div class="antall" role="group" aria-label="Hvor mange spillere er dere?">
      <span class="antall-tekst">Spillere</span>
      <button type="button" class="antall-knapp" data-antall="-1" aria-label="Færre spillere">−</button>
      <output id="antall" aria-live="polite">alle</output>
      <button type="button" class="antall-knapp" data-antall="1" aria-label="Flere spillere">+</button>
    </div>
    <div class="brikker" id="tagger" role="group" aria-label="Type spill">
      <button type="button" class="brikke alle" data-tagg="" aria-pressed="true">Alle</button>
      ${brukteTagger.map((t) => `<button type="button" class="brikke" data-tagg="${t}" aria-pressed="false">${esc(TAGGER[t])}</button>`).join("")}
    </div>
  </div>
  <p class="treff" id="treff" aria-live="polite"></p>
  <div class="hyller" id="hyller"></div>
  <h2 class="alle-tittel" id="alle-tittel">Alle spill</h2>
  <ul class="spillgrid" id="spillgrid">
${kort}
    <li class="atten-dor" id="atten-dor" hidden><button type="button" data-vis18><span class="atten-dor-ikon" aria-hidden="true">🔞</span><span class="atten-dor-tekst"><b>Drikkespill (18+)</b><span id="atten-dor-antall"></span></span></button></li>
  </ul>
  <p class="ingen-treff" id="ingen-treff" hidden>Ingen spill passer akkurat det. Prøv et annet søkeord, et annet antall eller en annen type.</p>
  <dialog class="dialog" id="dialog" aria-labelledby="dialog-tittel"></dialog>
  <dialog class="dialog automat" id="automat" aria-labelledby="automat-tittel"></dialog>

  <section class="slik" aria-labelledby="slik-tittel">
    <h2 id="slik-tittel">Så enkelt er det</h2>
    <ol class="slik-steg">
      <li><b>Velg et spill</b><span>Alt er gratis og klart med en gang.</span></li>
      <li><b>Skriv inn navnene</b><span>Én gang. Alle spillene husker gjengen din.</span></li>
      <li><b>Send mobilen rundt</b><span>Eller bruk hver sin mobil i spillene som har det.</span></li>
    </ol>
  </section>

  <section class="installer" id="installer" aria-labelledby="installer-tittel">
    <span class="installer-figur" aria-hidden="true">${G.svg("panna")}</span>
    <div>
      <h2 id="installer-tittel">Ha rusj på hjemskjermen</h2>
      <p id="installer-tekst">Åpne delingsmenyen i nettleseren og velg «Legg til på Hjem-skjerm». Da starter rusj som en app – og spillene virker uten nett.</p>
      <button class="knapp-2 liten" id="installer-knapp" type="button" hidden>Installer rusj</button>
    </div>
  </section>
</main>
${bunn(false)}
</body>
</html>
`;
  skriv("index.html", portalSide);

  // ---------- Pages about rusj: /personvern/ and /om/ ----------
  const SIDER_OPPDATERT = "2026-11-10";
  const datoTekst = (iso) => `${Number(iso.slice(8))}. ${["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  // The public contact details, confirmed by the owner 2026-11-10. With an empty KONTAKT the pages
  // leave the contact line out.
  const KONTAKT = "rusj@odkdigital.no";
  const POSTADRESSE = ""; // the owner wants only the e-mail address shown
  const omSide = (o) => `${hodeMed({ tittel: o.tittel, ogTittel: o.ogTittel, beskrivelse: o.beskrivelse, sti: o.sti, ikon: ikoner.svg, deling: ikoner.deling, delingAlt: "rusj – gratis spill og selskapsleker på norsk", css: [felles.css, portalCss], skript: o.skript ? [o.skript] : [] })}
<body class="portal">
<div class="scene" aria-hidden="true"></div>
<header class="side-topp"><a class="side-hjem" href="/" aria-label="rusj – til alle spillene">${G.logo()}</a></header>
<main class="side">
  <p class="side-sti"><a href="/">Alle spill</a> <span aria-hidden="true">›</span> ${esc(o.navn)}</p>
${o.innhold}
</main>
${bunn(true)}
</body>
</html>
`;
  skriv(
    "personvern/index.html",
    omSide({
      sti: "/personvern/",
      navn: "Personvern",
      tittel: "Personvern – hva rusj lagrer på enheten din | rusj",
      ogTittel: "Personvern på rusj",
      beskrivelse: "rusj har ingen konto, ingen informasjonskapsler, ingen sporing og ingen reklame. Se nøyaktig hva som lagres i nettleseren din – og slett alt med ett trykk.",
      skript: siderJs,
      innhold: `  <h1>Personvern</h1>
  <p class="side-ingress">Kort sagt: rusj har ingen konto, ingen informasjonskapsler, ingen sporing og ingen reklame. Det dere skriver inn i spillene, blir i nettleseren på enheten deres.</p>

  <section aria-labelledby="pv-lagres">
    <h2 id="pv-lagres">Dette lagres i nettleseren din</h2>
    <p>For at spillene skal virke, bruker rusj nettleserens egen lagring på enheten (<span lang="en">localStorage</span>). Det er ikke informasjonskapsler, og ingenting av det sendes til oss:</p>
    <ul>
      <li><b>Navn</b> dere skriver inn, så dere slipper å skrive dem på nytt i neste spill.</li>
      <li><b>Innstillinger:</b> lyd av eller på, filteret du valgte på forsiden, svaret på «18 år eller eldre?» og om du har sett eller lukket et tips.</li>
      <li><b>Spill:</b> runden dere holder på med, så dere kan fortsette der dere slapp – også det dere har skrevet eller tegnet underveis, egne regler og en nissetrekning. I tillegg hvilke kort som er brukt, rekorder, hvilke av dagens oppgaver du har løst, og kveldens poengtavle.</li>
    </ul>
    <p>Alt dette ligger bare i denne nettleseren på denne enheten. Vi har ingen server som tar imot det, og vi kan ikke se det.</p>
  </section>

  <section aria-labelledby="pv-nett">
    <h2 id="pv-nett">Spillene lastes ned for bruk uten nett</h2>
    <p>Når du åpner rusj, lagrer nettleseren en kopi av siden du er på. Resten av spillene lastes ned litt etter litt mens mobilen står i ro (ikke på svært tregt nett eller med datasparing på), slik at de virker også uten nett. Kopien byttes ut når spillene oppdateres.</p>
  </section>

  <section aria-labelledby="pv-vert">
    <h2 id="pv-vert">Dette ser nettverten</h2>
    <p>rusj.no ligger hos GitHub Pages, en tjeneste fra det amerikanske selskapet GitHub. Som hos alle nettsteder får nettverten vanlige forespørselslogger når en side hentes: IP-adressen din, tidspunktet, hvilken side det gjaldt og hva slags nettleser du bruker. Dette behandles utenfor EU/EØS. Vi har ikke tilgang til loggene og bruker dem ikke til noe.</p>
  </section>

  <section aria-labelledby="pv-ikke">
    <h2 id="pv-ikke">Dette finnes ikke på rusj</h2>
    <ul>
      <li>Ingen konto og ingen innlogging.</li>
      <li>Ingen informasjonskapsler (cookies).</li>
      <li>Ingen sporing, statistikk eller måling av hva du gjør.</li>
      <li>Ingen reklame, og ingenting som hentes fra andre nettsteder.</li>
    </ul>
  </section>

  <section aria-labelledby="pv-deler">
    <h2 id="pv-deler">Det du deler selv</h2>
    <p>Noen spill lar deg dele en kode, en lenke eller et resultat. Det sendes bare dit du selv sender det, i den appen du velger. En invitasjon inneholder det mottakeren trenger for å bli med – i en nisselenke også navn fra trekningen.</p>
  </section>

  <section class="side-slett" aria-labelledby="pv-slett">
    <h2 id="pv-slett">Slett alt</h2>
    <p>Knappen fjerner alt rusj har lagret i denne nettleseren: navn, innstillinger, spill som pågår, rekorder og den nedlastede kopien av spillene. Det kan ikke angres.</p>
    <p class="side-status" id="slett-status" role="status" aria-live="polite"></p>
    <button type="button" class="knapp rod" id="slett-alt">Slett alt rusj har lagret på denne enheten</button>
    <noscript><p class="side-liten">Knappen trenger JavaScript.</p></noscript>
    <p class="side-liten">Du kan også slette nettstedsdata for rusj.no i innstillingene til nettleseren. Bruker du rusj igjen etterpå, lagres det som trengs på nytt – også kopien av spillene for bruk uten nett.</p>
  </section>

  <section aria-labelledby="pv-kontakt">
    <h2 id="pv-kontakt">Spørsmål?</h2>
    ${KONTAKT ? `<p>Kontakt: <a href="mailto:${KONTAKT}">${KONTAKT}</a>${POSTADRESSE ? ` eller rusj, ${esc(POSTADRESSE)}` : ""}. Skriver du til oss, bruker vi e-postadressen din bare til å svare deg.</p>` : ""}
    <p class="side-liten">Sist oppdatert ${datoTekst(SIDER_OPPDATERT)}.</p>
  </section>
  <dialog class="dialog" id="dialog" aria-labelledby="dialog-tittel"></dialog>`,
    }),
  );
  skriv(
    "om/index.html",
    omSide({
      sti: "/om/",
      navn: "Om rusj",
      tittel: "Om rusj – hva det er, hvem det er for, og kontakt | rusj",
      ogTittel: "Om rusj",
      beskrivelse: `rusj er ${alleKort.length} gratis spill og selskapsleker på norsk, rett i nettleseren – for venner, familier og klasser. Uten app, konto og reklame. Slik når du oss.`,
      innhold: `  <h1>Om rusj</h1>
  <p class="side-ingress">rusj er ${alleKort.length} gratis spill og selskapsleker på norsk, rett i nettleseren. Ingen app å laste ned, ingen konto og ingen reklame.</p>

  <section aria-labelledby="om-hva">
    <h2 id="om-hva">Hva er rusj?</h2>
    <p>En samling spill for kvelder med folk rundt bordet: selskapsleker som går på rundgang på én mobil, quiz, tegneleker og ordspill – og klassikere som sudoku, kabal, yatzy og dagens ord når du er alene. Alt er på norsk, laget for mobilen, og virker uten nett når spillene først er lastet ned.</p>
  </section>

  <section aria-labelledby="om-hvem">
    <h2 id="om-hvem">Hvem er det for?</h2>
    <p>Venner, familier, kolleger og klasser. De fleste spillene passer for alle aldre, og flere er laget for barn. Skriv inn navnene én gang, så husker spillene gjengen.</p>
    <p>For foreldre og lærere: rusj har ingen konto, ingen reklame og ingen chat, og det barna skriver inn, blir på enheten. Les mer under <a href="/personvern/">personvern</a>.</p>
  </section>
${
        antall18
          ? `
  <section aria-labelledby="om-18">
    <h2 id="om-18">Drikkelekene (18+)</h2>
    <p>${antall18} av spillene er drikkeleker for voksne. De er skjult til noen har bekreftet at de er 18 år eller eldre, og kan skjules igjen fra forsiden.</p>
    <p>Drikk med vett: alkoholfritt teller like mye, ingen skal presses, og vann er alltid lov. Pass på hverandre – og ring 113 hvis noen trenger akutt hjelp.</p>
  </section>
`
          : ""
      }
  <section aria-labelledby="om-kontakt">
    <h2 id="om-kontakt">Kontakt</h2>
    ${KONTAKT ? `<p>Kontakt: <a href="mailto:${KONTAKT}">${KONTAKT}</a>${POSTADRESSE ? ` eller rusj, ${esc(POSTADRESSE)}` : ""}. Si gjerne fra om feil, eller foreslå et spill.</p>` : ""}
  </section>`,
    }),
  );

  // ---------- 404 (never indexed: no canonical address) ----------
  skriv(
    "404.html",
    `${hodeMed({ tittel: "Fant ikke siden | rusj", beskrivelse: "Denne siden finnes ikke. Gå til rusj.no for alle spillene.", noindex: true, ikon: ikoner.svg, css: [felles.css, portalCss] })}
<body class="portal">
<div class="scene" aria-hidden="true"></div>
<main class="borte">
  <span class="borte-figur">${G.svg("detektiven")}</span>
  <h1>Her var det tomt.</h1>
  <p>Detektiven har lett overalt, men denne siden finnes ikke.</p>
  <a class="knapp" href="/">Til alle spillene</a>
</main>
</body>
</html>
`,
  );

  // ---------- Manifest, favicon, robots, sitemap ----------
  // Shortcuts (long press on the app icon): the three daily puzzles and «Overrask meg». Only games
  // that are in this build. No `orientation`: the games lay themselves out on a phone on its side.
  // (No `screenshots` yet: they need images made for the purpose and committed in rusj/bilder.)
  const snarvei = (navn, beskrivelse, url, ikon) => ({ name: navn, description: beskrivelse, url, icons: [{ src: ikon, sizes: "any", type: "image/svg+xml" }] });
  const harSpill = (id) => spill.some((m) => m.id === id);
  const snarveier = [
    harSpill("ordugla") && snarvei("Dagens ord", "Gjett dagens ord på fem bokstaver", "/ordugla/", "/ordugla/ikon.svg"),
    harSpill("blyanten") && snarvei("Dagens kryss", "Løs dagens lille kryssord", "/blyanten/", "/blyanten/ikon.svg"),
    harSpill("tallknuseren") && snarvei("Sudoku", "Dagens sudoku, eller så mange du vil", "/tallknuseren/", "/tallknuseren/ikon.svg"),
    ikoner.svg && snarvei("Overrask meg", "La rusj velge et spill", "/#overrask", ikoner.svg.split("?")[0]),
  ].filter(Boolean);
  skriv(
    "manifest.webmanifest",
    JSON.stringify(
      {
        id: "/",
        name: "rusj – spill for hele gjengen",
        short_name: "rusj",
        description: "Gratis spill og selskapsleker på norsk, rett i nettleseren.",
        lang: "nb",
        dir: "ltr",
        categories: ["games", "entertainment"],
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#150c28",
        theme_color: "#150c28",
        shortcuts: snarveier,
        icons: [
          ikoner.p192 && { src: ikoner.p192.split("?")[0], sizes: "192x192", type: "image/png" },
          ikoner.p512 && { src: ikoner.p512.split("?")[0], sizes: "512x512", type: "image/png" },
          ikoner.maske && { src: ikoner.maske.split("?")[0], sizes: "512x512", type: "image/png", purpose: "maskable" },
          ikoner.svg && { src: ikoner.svg.split("?")[0], sizes: "any", type: "image/svg+xml" },
        ].filter(Boolean),
      },
      null,
      2,
    ),
  );
  // /favicon.ico: asked for by older browsers and by crawlers that ignore SVG icons. An .ico file
  // may simply wrap a PNG, so the 192 px app icon is reused (no image tools needed in the build).
  const png192 = join(BILDER, "ikon-192.png");
  if (existsSync(png192)) {
    const png = readFileSync(png192);
    const ico = Buffer.alloc(22);
    ico.writeUInt16LE(1, 2); // type: icon
    ico.writeUInt16LE(1, 4); // one image
    ico.writeUInt8(192, 6); // width
    ico.writeUInt8(192, 7); // height
    ico.writeUInt16LE(1, 10); // colour planes
    ico.writeUInt16LE(32, 12); // bits per pixel
    ico.writeUInt32LE(png.length, 14);
    ico.writeUInt32LE(22, 18); // the image starts right after this header
    skriv("favicon.ico", Buffer.concat([ico, png]));
  }
  skriv("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${DOMENE}/sitemap.xml\n`);
  // sitemap.xml: every page with the date it last changed (the last commit that touched its source).
  const datoer = sistEndret(ROT);
  const iDag = new Date().toISOString().slice(0, 10);
  const nyeste = (...d) => d.filter(Boolean).sort().pop() || iDag;
  const spillDato = (m) => (m.id === "luringen" ? nyeste(datoer.get("src"), datoer.get("data")) : nyeste(datoer.get(`rusj/spill/${m.id}`)));
  const sider = [
    ["/", nyeste(datoer.get("rusj/portal"), datoer.get("rusj/seo.json"), ...alleKort.map(spillDato))],
    ...alleKort.map((m) => [`/${m.id}/`, spillDato(m)]),
    ["/om/", SIDER_OPPDATERT],
    ["/personvern/", SIDER_OPPDATERT],
  ];
  skriv(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sider.map(([sti, dato]) => `  <url><loc>${DOMENE}${sti}</loc><lastmod>${dato}</lastmod></url>`).join("\n")}\n</urlset>\n`,
  );

  return {
    spill,
    filer,
    // What the service worker keeps for playing without a connection: every page, the front page
    // first, then the games in front-page order. Which files a page needs, the worker reads from
    // the page itself (every address with ?v=), so there is no second list to keep in step.
    sider: ["/", ...alleKort.map((m) => `/${m.id}/`), "/om/", "/personvern/"],
  };
}

// Square icon with the game's mascot on the night background.
export function ikonSvg(G, id) {
  const fig = G.svg(id).replace(/^<svg [^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><radialGradient id="g" cx="50%" cy="18%" r="80%"><stop offset="0" stop-color="#4a2b80"/><stop offset=".55" stop-color="#21143d"/><stop offset="1" stop-color="#150c28"/></radialGradient></defs><rect width="512" height="512" rx="116" fill="url(#g)"/><g transform="translate(85 96) scale(2.85)">${fig}</g></svg>`;
}
