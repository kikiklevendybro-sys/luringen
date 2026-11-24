// Builds rusj.no: the front page (portal), one page per game under /<id>/, shared files under
// /felles/, offline support (sw.js), manifest, sitemap and 404 page. No dependencies.
// Called from scripts/bygg.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { lesRegler, eksemplerFor, omSpilletHtml, RUSINFO } from "./om-spillet.mjs";
import { lesSamlinger, samlingInnhold, samlingJsonLd } from "./samlinger.mjs";
import { SPRAK, ALLE_SPRAK, SPRAK_INFO, lagSprak, lesTabell, sjekkSprak, merkerIUtgave } from "./sprak.mjs";

const require = createRequire(import.meta.url);

export const DOMENE = "https://rusj.no";

// Renamed games: old id → new id. The build writes /<old>/ as a page that sends visitors on.
export const OMDOPT = { besserwisseren: "bedreviteren" };

// Addresses that are pages of their own (or folders the build fills): an alias may never take one.
export const FASTE_STIER = ["om", "personvern", "merker", "felles", "luringen", "404", "index", "sitemap", "robots", "manifest", "favicon", "sw", "admin", "lab"];

// Alias addresses (`alias` in spill.json): /jeg-har-aldri/ → /sladrehanken/. Easy to say and type
// at a party, and spelled the way people search. Returns Map(alias → game id) and stops the build
// on an address that is taken (a game, a collection, a page, an old address or another alias), on
// a malformed one, and on another company's brand: an address is visible use.
// o: { spill: [{ id, alias }], opptatt: [addresses already in use], merke: (text) → brand | null }
export function aliasKart(o) {
  const feil = [];
  const opptatt = new Map(o.opptatt.map((a) => [a, "en side"]));
  for (const g of o.spill) opptatt.set(g.id, `spillet ${g.id}`);
  const kart = new Map();
  for (const g of o.spill) {
    if (g.alias == null) continue;
    if (!Array.isArray(g.alias)) {
      feil.push(`${g.id}: "alias" må være en liste`);
      continue;
    }
    for (const a of g.alias) {
      if (typeof a !== "string" || !/^[a-z0-9æøå]+(-[a-z0-9æøå]+)*$/.test(a)) feil.push(`${g.id}: aliaset «${a}» kan bare ha små bokstaver, tall og bindestrek`);
      else if (opptatt.has(a)) feil.push(`${g.id}: aliaset «${a}» er allerede ${opptatt.get(a)}`);
      else if (kart.has(a)) feil.push(`${g.id}: aliaset «${a}» brukes også av ${kart.get(a)}`);
      else if (o.merke(a.replace(/-/g, " "))) feil.push(`${g.id}: aliaset «${a}» er en annens merkevare («${o.merke(a.replace(/-/g, " "))}»)`);
      else kart.set(a, g.id);
    }
  }
  if (feil.length) throw new Error("Alias-adressene har feil:\n  " + feil.join("\n  "));
  return kart;
}

// A tiny page that sends the visitor on: meta refresh (no script under the CSP), noindex, and the
// canonical address for search engines. Never in the sitemap or the offline list.
function videresendSide(m, tekst) {
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="robots" content="noindex">
<title>${esc(m.navn)} | rusj</title>
<link rel="canonical" href="${DOMENE}/${m.id}/">
<meta http-equiv="refresh" content="0; url=/${m.id}/">
<style>body{background:#150c28;color:#fff1dd;font:1.1rem/1.5 system-ui,sans-serif;text-align:center;padding:3rem 1rem}a{color:#ffd23f}</style>
</head>
<body>
${tekst ? `<p>${esc(tekst)}</p>\n` : ""}<p><a href="/${m.id}/">Gå til ${esc(m.navn)}</a></p>
</body>
</html>
`;
}

// Anonymous statistics (see statistikk/README.md and statistikk/KLIENT.md). The address of the
// statistics Worker, e.g. "https://rusj-statistikk.<konto>.workers.dev". Empty = switched off:
// then nothing is sent, the CSP is unchanged and the privacy texts say what they always said.
// When set, the build adds the address to connect-src, publishes /felles/stat.js (which sets
// window.RUSJ_STAT) on every page, and the footer and /personvern/ describe the counting.
export const STAT_ADRESSE = "https://rusj-statistikk.kikiklevendybro.workers.dev";

// «Spill med en venn på nett» (see nett/README.md and nett/KLIENT.md): the address of the rooms
// Worker, e.g. "https://rusj-nett.<konto>.workers.dev". Empty = switched off: no button, nothing is
// sent, the CSP and the privacy page are as before. When set, the build adds the address to
// connect-src (as https: and wss:), publishes /felles/nett.js (which sets window.RUSJ_NETT) and
// /felles/nett.css on the pages of games with "nett": true, and /personvern/ gets «Spill på nett».
// A test build may point it elsewhere with the environment variable RUSJ_NETT_ADRESSE
// (http://127.0.0.1:<port> for a local `wrangler dev`).
export const NETT_ADRESSE = "https://rusj-nett.kikiklevendybro.workers.dev";

// «Spander en kaffe»: per edition, the owner's payment link and the price shown on the button.
// An empty link = off in that edition. When set, that edition's game pages carry them as
// <html data-kaffe data-kaffe-pris>, and the kit asks for a coffee after every 20th finished game
// until the link is tapped once (rusj/kit/rusj.js, «Spander en kaffe»).
export const KAFFE = {
  nb: { lenke: "", pris: "39 kr" },
  en: { lenke: "", pris: "" },
  da: { lenke: "", pris: "" },
};
for (const [s, k] of Object.entries(KAFFE)) if (k.lenke && !/^https:\/\/[^\s"<>]+$/.test(k.lenke)) throw new Error(`KAFFE.${s}.lenke må være en vanlig https-adresse`);

// Checks the address and returns its origin ("" when off). Throws on anything that is not a plain
// https origin (or http://localhost / 127.0.0.1 for tests), so a typo cannot reach the CSP.
export function statOpprinnelse(adresse = STAT_ADRESSE, navn = "STAT_ADRESSE") {
  if (!adresse) return "";
  const u = new URL(adresse);
  const lokal = u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  if ((u.protocol !== "https:" && !lokal) || u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) {
    throw new Error(`${navn} må være bare en adresse som https://navn.workers.dev, ikke «${adresse}»`);
  }
  return u.origin;
}

// The rooms for playing on the net: the same rules as the statistics address.
export const nettOpprinnelse = (adresse = process.env.RUSJ_NETT_ADRESSE ?? NETT_ADRESSE) => statOpprinnelse(adresse, "NETT_ADRESSE");
// connect-src for the rooms: the address and its WebSocket twin (https → wss, http → ws for tests).
export const nettKilder = (nett) => (nett ? [nett, nett.replace(/^http/, "ws")] : []);

// Content Security Policy: only files from rusj.no itself; no inline scripts. The only outside
// requests ever allowed are to the statistics Worker (when STAT_ADRESSE is set) and to the rooms
// for playing on the net (when NETT_ADRESSE is set).
export const lagCsp = (stat = statOpprinnelse(), nett = nettOpprinnelse()) => [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  ["connect-src 'self'", ...(stat ? [stat] : []), ...nettKilder(nett)].join(" "),
  "media-src 'self' data: blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
export const CSP = lagCsp();

// /felles/stat.js: the address, then the sender from the kit. Made here (not in byggRusj) because
// Luringen's page head is written before the rest of the site, and every page names this file.
export function statFil(rot, stat = statOpprinnelse()) {
  if (!stat) return null;
  const innhold = `window.RUSJ_STAT=${JSON.stringify(stat)};\n` + readFileSync(join(rot, "rusj/kit/stat.js"), "utf8");
  return { innhold, sti: "/felles/stat.js?v=" + hashTekst(innhold) };
}
const STAT_FIL = statFil(join(dirname(fileURLToPath(import.meta.url)), ".."));
const NETT = nettOpprinnelse();

// rusj.no/admin/ (and /en/admin/, /da/admin/): an easy address for the owner's numbers. A tiny
// page that sends the visitor on to the statistics Worker's /admin, where Cloudflare Access asks
// who it is. No script, not indexed, not in the sitemap, the game lists or the offline list.
// Written only when STAT_ADRESSE is set (statistikk/README.md).
export function adminVideresending(stat = statOpprinnelse()) {
  const mal = `${stat}/admin`;
  // (Norwegian only: the page is for the owner.)
  const tittel = "Tallene | rusj"; // sprak-ok
  const tekst = "Tallene for rusj.no ligger hos statistikktjenesten. Du må logge inn."; // sprak-ok
  const lenke = "Gå til tallene"; // sprak-ok
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(tittel)}</title>
<meta http-equiv="refresh" content="0; url=${esc(mal)}">
<style>body{background:#150c28;color:#fff1dd;font:1.1rem/1.5 system-ui,sans-serif;text-align:center;padding:3rem 1rem}a{color:#ffd23f}</style>
</head>
<body>
<p>${esc(tekst)}</p>
<p><a href="${esc(mal)}" rel="noreferrer">${esc(lenke)}</a></p>
</body>
</html>
`;
}

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
const finnMerke = (liste, tekst) => {
  const t = " " + String(tekst).toLocaleLowerCase("nb").replace(/[^a-zæøå0-9-]+/g, " ") + " ";
  return liste.find((m) => t.includes(" " + m.replace(/[^a-zæøå0-9-]+/g, " ") + " ")) || null;
};
export const merkeI = (tekst) => finnMerke(MERKER, tekst);
// Text the build writes itself (the «Slik spiller dere» block, collection pages, alias addresses)
// is held to a stricter list: also game names that sound generic but belong to someone.
const MERKER_SYNLIG = [...MERKER, "ring of fire", "wordle", "time's up", "times up", "codenames"];
export const merkeSynlig = (tekst) => finnMerke(MERKER_SYNLIG, tekst);
export const TITTEL_MAKS = 62; // with « | rusj»; search results show about 60 characters
export const BESKRIVELSE_GRENSER = [100, 160];

// Reads rusj/seo.json (rusj/seo.<lang>.json for another edition, the same rules) and stops the
// build on anything that would hurt in search results: too long or too short texts, two pages with
// the same title or description, a brand name.
export function lesSeo(rot, sprak = "nb") {
  const fil = join(rot, sprak === "nb" ? "rusj/seo.json" : `rusj/seo.${sprak}.json`);
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
  // (" (18+)" reads the same in every edition)
  const ogTittel = (harNavnet ? s.frase : `${s.frase} · ${m.navn}`) + (m.alder18 ? " (18+)" : "");
  return { tittel: `${s.tittel} | rusj`, ogTittel, frase: s.frase, beskrivelse: s.beskrivelse, sok: s.sok || [], type: s.type || null, samarbeid: !!s.samarbeid };
}

// ---------- <head>, the same for every page (also Luringen, see scripts/bygg.mjs) ----------

// o: tittel, ogTittel, beskrivelse, sti (leave out for a page that must not be indexed), noindex,
// kortnavn, ikon (svg), pngIkon, appleIkon, deling (share image) + delingAlt, css [], skript [],
// htmlAttr, jsonld (structured data: printed as an inline data block, which the CSP allows – it is
// not run), sprak ("nb" | "en" | "da", default "nb"), alternativer ([[hreflang, path]] – the same
// page in the other editions, x-default included; see rusj/SPRAK.md).
// Scripts go in the <head> with `defer`, never at the end of <body>: the Content-Security-Policy
// <meta> switches off the browser's look-ahead loading for everything after it, so scripts at the
// end of the page were fetched one at a time, each waiting for the one before (a game was playable
// 1.7–2.9 s later on a slow phone link). Deferred scripts are all found at once, load side by
// side, and still run in this order after the page has been read – exactly when they ran before.
export function hode(o) {
  const url = o.sti ? `${DOMENE}${o.sti}` : null;
  const sprak = o.sprak || "nb";
  const info = SPRAK_INFO[sprak];
  const linjer = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    `<meta name="referrer" content="no-referrer">`,
    `<title>${esc(o.tittel)}</title>`,
    `<meta name="description" content="${esc(o.beskrivelse)}">`,
    `<meta name="robots" content="${o.noindex ? "noindex" : "max-image-preview:large"}">`,
    url && `<link rel="canonical" href="${url}">`,
    ...(url ? o.alternativer || [] : []).map(([l, sti]) => `<link rel="alternate" hreflang="${l}" href="${DOMENE}${sti}">`),
    `<meta name="theme-color" content="#150c28">`,
    `<meta name="color-scheme" content="dark">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
    `<meta name="apple-mobile-web-app-title" content="${esc(o.kortnavn || "rusj")}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="rusj">`,
    `<meta property="og:locale" content="${info.og}">`,
    ...(url ? o.alternativer || [] : []).filter(([l]) => l !== sprak && l !== "x-default").map(([l]) => `<meta property="og:locale:alternate" content="${SPRAK_INFO[l].og}">`),
    `<meta property="og:title" content="${esc(o.ogTittel || o.tittel)}">`,
    `<meta property="og:description" content="${esc(o.beskrivelse)}">`,
    url && `<meta property="og:url" content="${url}">`,
    o.deling && `<meta property="og:image" content="${DOMENE}${o.deling.split("?")[0]}">`,
    o.deling && `<meta property="og:image:width" content="1200">`,
    o.deling && `<meta property="og:image:height" content="630">`,
    o.deling && o.delingAlt && `<meta property="og:image:alt" content="${esc(o.delingAlt)}">`,
    o.deling && `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="manifest" href="${info.forside}manifest.webmanifest">`,
    // PNG first, SVG last: browsers that know SVG icons take the last one, the rest take the PNG.
    o.pngIkon && `<link rel="icon" href="${o.pngIkon}" type="image/png" sizes="192x192">`,
    o.ikon && `<link rel="icon" href="${o.ikon}" type="image/svg+xml">`,
    o.appleIkon && `<link rel="apple-touch-icon" href="${o.appleIkon}">`,
    ...(o.css || []).map((c) => `<link rel="stylesheet" href="${c}">`),
    ...[...(STAT_FIL ? [STAT_FIL.sti] : []), ...(o.skript || [])].map((s) => `<script defer src="${s}"></script>`),
    o.jsonld && `<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, "\\u003c")}</script>`,
  ];
  return `<!doctype html>\n<html lang="${sprak}"${o.htmlAttr || ""}>\n<head>\n${linjer.filter(Boolean).join("\n")}\n</head>`;
}

// ---------- Structured data (schema.org) ----------

const UTGIVER = { "@type": "Organization", "@id": `${DOMENE}/#utgiver`, name: "rusj", url: `${DOMENE}/`, logo: `${DOMENE}/ikon-512.png` };

// One game page: the game itself (or a tool) and the path to it from the front page.
// U: the edition (from byggRusj); left out = Norwegian.
export function spillJsonLd(m, s, bilde, U = null) {
  const [min, maks] = m.spillere;
  const sprak = U ? U.sprak : "nb";
  const t = U ? U.t : (k) => k;
  const url = `${DOMENE}${m.url || `/${m.id}/`}`;
  const node = {
    "@type": s.type || "VideoGame",
    "@id": `${url}#spill`,
    name: m.navn,
    alternateName: s.frase,
    url,
    description: s.beskrivelse,
    ...(bilde ? { image: `${DOMENE}${bilde.split("?")[0]}` } : {}),
    inLanguage: sprak,
    applicationCategory: s.type ? "UtilitiesApplication" : "GameApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: { nb: "NOK", en: "GBP", da: "DKK" }[sprak] },
    publisher: { "@id": UTGIVER["@id"] },
  };
  if (!s.type) {
    node.gamePlatform = t("Nettleser");
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
          { "@type": "ListItem", position: 1, name: "rusj", item: `${DOMENE}${SPRAK_INFO[sprak].forside}` },
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
    const ut = execFileSync("git", ["log", "-n", "500", "--format=@%cs", "--name-only", "--", "rusj/spill", "rusj/portal", "rusj/seo.json", "rusj/samlinger", "src", "data"], {
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

const PAKREVD = ["id", "navn", "undertittel", "beskrivelse", "kort", "spillere", "alder", "minutter", "mobiler", "tagger", "rekkefolge"];

// "alder": the lowest recommended age of a game (reading, rules, content; the children's version
// where the game has one), a whole number from 3 to 18. Every 18+ game has 18. The front-page finder
// («Hva skal vi spille?») shows a game when its age is at most the youngest player's.
export const ALDER_GRENSER = [3, 18];
export function sjekkAlder(m, hvor) {
  const [min, maks] = ALDER_GRENSER;
  if (m.alder == null) throw new Error(`${hvor}: mangler "alder" – den laveste anbefalte alderen (et helt tall fra ${min} til ${maks}; 18 for 18+-spill). Se rusj/SPILL4.md.`);
  if (!Number.isInteger(m.alder) || m.alder < min || m.alder > maks) throw new Error(`${hvor}: "alder" må være et helt tall fra ${min} til ${maks}, ikke ${JSON.stringify(m.alder)}`);
  if (m.alder18 && m.alder !== 18) throw new Error(`${hvor}: et 18+-spill skal ha "alder": 18, ikke ${m.alder}`);
}
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
  arkade: "Arkade",
};

// The tag names in an edition (literal keys, so scripts/sprak.mjs can check the tables).
export const taggerPa = (t) => ({
  fest: t("Fest"),
  familie: t("Familie"),
  barn: t("Barn"),
  blof: t("Bløff"),
  ord: t("Ord"),
  lag: t("Lag mot lag"),
  quiz: t("Quiz"),
  tegning: t("Tegning"),
  hukommelse: t("Hukommelse"),
  sporsmal: t("Prat"),
  klassiker: t("Klassikere"),
  daglig: t("Dagens"),
  tenke: t("Hjernetrim"),
  alene: t("Alene"),
  kort: t("Kortspill"),
  verktoy: t("Verktøy"),
  drikke: t("Drikkespill 18+"),
  arkade: t("Arkade"),
});

const varslet = new Set();
export function lesSpill(rot, utvalg) {
  const mappe = join(rot, "rusj/spill");
  const G = require(join(rot, "rusj/kit/gjengen.js"));
  const spill = [];
  for (const id of readdirSync(mappe)) {
    const fil = join(mappe, id, "spill.json");
    if (!existsSync(fil)) continue;
    const m = JSON.parse(readFileSync(fil, "utf8"));
    sjekkAlder(m, fil);
    for (const felt of PAKREVD) if (m[felt] == null) throw new Error(`${fil}: mangler "${felt}"`);
    if (m.id !== id) throw new Error(`${fil}: id "${m.id}" matcher ikke mappenavnet`);
    if (!G.finnes(id)) throw new Error(`${fil}: ingen figur for "${id}" i rusj/kit/gjengen.js`);
    if (!["en", "hver", "begge"].includes(m.mobiler)) throw new Error(`${fil}: mobiler må være en, hver eller begge`);
    for (const t of m.tagger) if (!TAGGER[t]) throw new Error(`${fil}: ukjent tagg "${t}"`);
    const lang = m.beskrivelse.length > 170 && `  ⚠ ${id}: beskrivelse er ${m.beskrivelse.length} tegn (bør være under 160)`;
    if (lang && !varslet.has(lang)) {
      varslet.add(lang); // (the games are read more than once per build)
      console.warn(lang);
    }
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

// ---------- «Mest spilt nå»: rusj/topp.json, written by scripts/topp.mjs ----------
// { "oppdatert": "YYYY-MM-DD", "spill": [up to 10 game ids, the most started first] } – ids only,
// never a number. No file: no row. A file that is not like that stops the build.
export const TOPP_ANTALL = 5; // cards in the row
export const TOPP_MINST = 3; // fewer games left for an edition: no row
export function lesTopp(fil) {
  if (!existsSync(fil)) return null;
  let topp;
  try {
    topp = JSON.parse(readFileSync(fil, "utf8"));
  } catch (e) {
    throw new Error(`${fil}: ugyldig JSON (${e.message})`);
  }
  const ok = topp && typeof topp === "object" && Array.isArray(topp.spill) && topp.spill.length <= 10 && topp.spill.every((id) => typeof id === "string" && /^[a-z0-9]{1,30}$/.test(id));
  if (!ok || (topp.oppdatert != null && !/^\d{4}-\d{2}-\d{2}$/.test(topp.oppdatert))) throw new Error(`${fil}: skal være { "oppdatert": "ÅÅÅÅ-MM-DD", "spill": [opptil 10 spill-id-er] } (lag den med node scripts/topp.mjs)`);
  return { oppdatert: topp.oppdatert || null, spill: [...new Set(topp.spill)] };
}
// The games of the row in one edition: those of the list the edition has, never an 18+ game, in the
// list's order, at most five. Fewer than three: [] (no row). liste: the edition's games.
export function toppSpill(topp, liste) {
  if (!topp) return [];
  const av = new Map(liste.map((m) => [m.id, m]));
  const ut = topp.spill.map((id) => av.get(id)).filter((m) => m && !m.alder18).slice(0, TOPP_ANTALL);
  return ut.length >= TOPP_MINST ? ut : [];
}

// How many phones a game needs, from «mobiler» in spill.json: on a list row (tekst), on the small
// shelf tile (kort) and read aloud (lest).
export const mobilerPa = (t) => ({
  en: { tekst: t("1 mobil"), kort: "1", lest: t("én mobil") },
  hver: { tekst: t("Hver sin mobil"), kort: t("flere"), lest: t("hver sin mobil") },
  begge: { tekst: t("1 eller flere mobiler"), kort: "1+", lest: t("én eller flere mobiler") },
});
export const MOBILER = mobilerPa((k) => k);
// The facts of a game as one sentence for screen readers:
// «3 til 10 spillere, én mobil, 10 til 20 minutter» (+ what the badges say). t: the edition's.
export function faktaLest(m, motMobilen, t = (k, v) => (v ? k.replace(/\{(\w+)\}/g, (h, n) => String(v[n])) : k)) {
  const [a, b] = m.spillere;
  const [fra, til] = m.minutter;
  return [
    a === b ? (a === 1 ? t("én spiller") : t("{n} spillere", { n: a })) : t("{a} til {b} spillere", { a, b }),
    mobilerPa(t)[m.mobiler].lest,
    fra === til ? t("{n} minutter", { n: fra }) : t("{a} til {b} minutter", { a: fra, b: til }),
    m.tagger.includes("daglig") && t("ny oppgave hver dag"),
    motMobilen && t("kan spilles mot mobilen"),
    m.nett && t("kan spilles på nett"),
    m.alder18 && t("for voksne over 18 år"),
  ]
    .filter(Boolean)
    .join(", ");
}

export function byggRusj({ ROT, WEB, ordData, ordbanker = {}, utvalg, luringen, topp: toppFil = join(ROT, "rusj/topp.json") }) {
  if (luringen) sjekkAlder(luringen, "scripts/bygg.mjs (LURINGEN_KORT)");
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
  const somData = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

  // ---------- Editions (rusj/SPRAK.md) ----------
  // Norwegian at the root, every other edition under /<lang>/, from the same templates: every text
  // goes through t() (the key is the Norwegian text, so Norwegian is unchanged). The tables are
  // checked first: a missing or unused key stops the build (node scripts/sprak.mjs says the same).
  const sjekk = sjekkSprak({ rot: ROT, spill: utvalg ? utvalg.filter((id) => id !== "luringen") : null, bygg: true });
  if (sjekk.feil.length) throw new Error("Språktabellene har feil (node scripts/sprak.mjs viser dem):\n  " + sjekk.feil.join("\n  "));
  for (const v of sjekk.varsler) console.warn("  ⚠ " + v);
  const kitTabell = Object.fromEntries(SPRAK.map((s) => [s, lesTabell(join(ROT, `rusj/kit/tekst.${s}.json`)) || {}]));
  const UTGAVE = {};
  for (const sprak of ALLE_SPRAK) {
    const S = lagSprak(sprak, ...(sprak === "nb" ? [] : [kitTabell[sprak]]));
    UTGAVE[sprak] = {
      ...S,
      info: SPRAK_INFO[sprak],
      // A sentence with markup in it: the text is escaped, then the {places} get the markup.
      // verdier: plain values (and n, which picks the plural form).
      th: (nokkel, html, verdier) => esc(S.t(nokkel, verdier)).replace(/\{(\w+)\}/g, (hele, n) => (n in html ? html[n] : hele)),
      stor: (tekst) => tekst.charAt(0).toLocaleUpperCase(SPRAK_INFO[sprak].lokale) + tekst.slice(1),
    };
  }
  const NB = UTGAVE.nb;

  // ---------- Shared files ----------
  const felles = {
    css: skriv("felles/rusj.css", kilde("rusj/kit/rusj.css")),
    gjengen: skriv("felles/gjengen.js", kilde("rusj/kit/gjengen.js")),
    js: skriv("felles/rusj.js", kilde("rusj/kit/rusj.js")),
    stat: STAT_FIL && skriv("felles/stat.js", STAT_FIL.innhold),
    qr: skriv("felles/qr.js", kilde("src/qr.js")),
    // 3D dice in a tray (R.terninger): only for games with "terninger": true in spill.json
    terninger: skriv("felles/terninger.js", kilde("rusj/kit/terninger.js")),
    terningerCss: skriv("felles/terninger.css", kilde("rusj/kit/terninger.css")),
    // Playing on the net (R.nett): only for games with "nett": true, and only with NETT_ADRESSE
    nett: NETT && skriv("felles/nett.js", `window.RUSJ_NETT=${JSON.stringify(NETT)};\n` + kilde("rusj/kit/nett.js")),
    nettCss: NETT && skriv("felles/nett.css", kilde("rusj/kit/nett.css")),
    ord: skriv("felles/ord.js", "window.RUSJ_ORD=" + JSON.stringify(ordData).replace(/</g, "\\u003c") + ";"),
    // t() for the front page and the pages about rusj (the kit has its own copy)
    tekst: skriv("felles/tekst.js", kilde("rusj/kit/tekst.js")),
  };
  // The table of every other edition: loaded first on its pages, before the kit and the front page.
  const tekstFil = { nb: null };
  for (const s of SPRAK) tekstFil[s] = skriv(`felles/tekst.${s}.js`, `window.RUSJ_SPRAK=${JSON.stringify(s)};\nwindow.RUSJ_TEKST=${somData(kitTabell[s])};\n`);
  const forTekst = (U) => (tekstFil[U.sprak] ? [tekstFil[U.sprak]] : []);
  // The word bank of each edition (felles/ord.js is Norwegian; felles/ord.<lang>.js the others, from
  // data/kategorier.<lang>). A game with "ordbank" loads its own edition's bank as window.RUSJ_ORD.
  const ordFor = { nb: { data: ordData, fil: felles.ord } };
  for (const s of SPRAK) if (ordbanker[s]) ordFor[s] = { data: ordbanker[s], fil: skriv(`felles/ord.${s}.js`, "window.RUSJ_ORD=" + somData(ordbanker[s]) + ";") };

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
  // The share images carry Norwegian words. Another edition uses rusj/bilder/deling.<lang>.png and
  // deling-<id>.<lang>.png when they exist, and no picture until then.
  const delingFor = (U) => (U.sprak === "nb" ? ikoner.deling : bilde(`deling.${U.sprak}.png`));

  const spill = lesSpill(ROT, utvalg);
  const LOGO = G.logo();
  // Every game can suggest the others (also those not built in a partial test build).
  const alleSpillKort = [...(luringen ? [luringen] : []), ...lesSpill(ROT, null)].sort((a, b) => a.rekkefolge - b.rekkefolge);

  // A game as an edition shows it: name, texts and address in that language.
  const lokal = (m, U) => {
    if (U.sprak === "nb") return { ...m, slug: m.id, url: `/${m.id}/` };
    const i = m.i18n[U.sprak];
    return { ...m, navn: i.navn, undertittel: i.undertittel, kort: i.kort, beskrivelse: i.beskrivelse, sok: i.sok, tagger: i.tagger || m.tagger, slug: i.slug, url: `/${U.sprak}/${i.slug}/` };
  };
  const iUtgave = (liste, U) => (U.sprak === "nb" ? liste : liste.filter((m) => (sjekk.publisert[U.sprak] || []).includes(m.id))).map((m) => lokal(m, U));
  for (const U of Object.values(UTGAVE)) {
    U.spill = iUtgave(spill, U); // built here
    U.alle = U.sprak === "nb" ? alleSpillKort.map((m) => lokal(m, U)) : iUtgave(lesSpill(ROT, null), U); // every game of the edition
  }
  // The same page in every edition that has it: [[hreflang, path]] with x-default (Norwegian), or []
  // when only Norwegian has it. finn(U) → the path in that edition, or null.
  const alternativer = (finn) => {
    const ut = ALLE_SPRAK.map((s) => [s, finn(UTGAVE[s])]).filter(([, sti]) => sti);
    return ut.length > 1 ? [...ut, ["x-default", ut.find(([s]) => s === "nb")[1]]] : [];
  };
  const spillSti = (id) => (U) => (U.sprak === "nb" ? (spill.some((m) => m.id === id) ? `/${id}/` : null) : (U.spill.find((m) => m.id === id) || {}).url || null);
  const sideSti = (navn) => (U) => U.side(navn);
  // «Norsk · English · Dansk» under every page: the same page in that edition, else its front page.
  // (The dots between them are drawn by the stylesheet, so a screen reader hears three names.)
  const sprakvalg = (U, finn) => `<nav class="sprakvalg" aria-label="${esc(U.t("Språk"))}">${ALLE_SPRAK.map((s) => {
    const V = UTGAVE[s];
    const navn = SPRAK_INFO[s].navn;
    if (s === U.sprak) return `<b lang="${s}" aria-current="page">${navn}</b>`;
    return `<a href="${esc((finn && finn(V)) || V.forside)}" lang="${s}" hreflang="${s}">${navn}</a>`;
  }).join("")}</nav>`;
  // The language picker at the top of the front page and the pages about rusj: a globe and the
  // language code that open the three editions (the same page where it exists), each with its flag. A <details>, so it works
  // without script; portal.js closes it on a tap outside or Escape. The flags are drawn once per
  // page (FLAGG) and used by id.
  const SPRAKKODE = { nb: "NO", en: "EN", da: "DA" };
  const FLAGG = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="flagg-nb" viewBox="0 0 22 16" preserveAspectRatio="xMidYMid slice"><rect width="22" height="16" fill="#ba0c2f"/><path d="M6 0h4v16H6zM0 6h22v4H0z" fill="#fff"/><path d="M7 0h2v16H7zM0 7h22v2H0z" fill="#00205b"/></symbol>
  <symbol id="flagg-en" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice"><clipPath id="flagg-en-kryss"><path d="M30 15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><rect width="60" height="30" fill="#012169"/><path d="M0 0l60 30M60 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30M60 0L0 30" clip-path="url(#flagg-en-kryss)" stroke="#c8102e" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#c8102e" stroke-width="6"/></symbol>
  <symbol id="flagg-da" viewBox="0 0 37 28" preserveAspectRatio="xMidYMid slice"><rect width="37" height="28" fill="#c8102e"/><path d="M12 0h4v28h-4zM0 12h37v4H0z" fill="#fff"/></symbol>
</svg>`;
  const flagg = (s) => `<svg class="flagg" aria-hidden="true" focusable="false"><use href="#flagg-${s}"/></svg>`;
  const sprakvelger = (U, finn) => `<details class="sprakvelger">
  <summary aria-label="${esc(U.t("Velg språk"))}"><svg class="sprakvelger-globus" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg><span class="sprakvelger-kode">${SPRAKKODE[U.sprak]}</span><svg class="sprakvelger-pil" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10l5 5 5-5"/></svg></summary>
  <ul class="sprakvelger-liste">${ALLE_SPRAK.map((s) => {
    const V = UTGAVE[s];
    const navn = SPRAK_INFO[s].navn;
    if (s === U.sprak) return `<li><b lang="${s}" aria-current="page">${flagg(s)}${navn}</b></li>`;
    return `<li><a href="${esc((finn && finn(V)) || V.forside)}" lang="${s}" hreflang="${s}">${flagg(s)}${navn}</a></li>`;
  }).join("")}</ul>
</details>`;

  // ---------- «Klistremerkeboka»: the catalogue (rusj/merker.json) and its rules (rusj/kit/merker.js) ----------
  // Built from every game (also in a partial build): «tried all» counts the games without an age
  // gate that run on the kit. Never a sticker for a drinking game. Another edition has the stickers
  // its games can give, in its own words.
  const merkeKatalog = JSON.parse(kilde("rusj/merker.json"));
  const merkeGruppe = new Map(merkeKatalog.grupper.map((g) => [g.id, g]));
  for (const mk of merkeKatalog.merker) {
    if (!merkeGruppe.has(mk.gruppe)) throw new Error(`rusj/merker.json: ${mk.id} har ukjent gruppe «${mk.gruppe}»`);
    // A mascot that is not in this build (a game on its way) falls back to the sticker's emoji.
    if (mk.figur && !G.finnes(mk.figur)) {
      if (!mk.emoji) throw new Error(`rusj/merker.json: ${mk.id} har ukjent figur «${mk.figur}» og ingen emoji`);
      delete mk.figur;
    }
    mk.farge = mk.figur ? G.farge(mk.figur) : merkeGruppe.get(mk.gruppe).farge;
  }
  if (new Set(merkeKatalog.merker.map((mk) => mk.id)).size !== merkeKatalog.merker.length) throw new Error("rusj/merker.json: to merker har samme id");
  const RusjMerkerTegn = (mk) => require(join(ROT, "rusj/kit/merker.js")).tegn(mk, G);
  for (const U of Object.values(UTGAVE)) {
    const merkeSpill = (U.sprak === "nb" ? lesSpill(ROT, null) : U.alle).filter((g) => !g.alder18);
    const t = U.t;
    const kat =
      U.sprak === "nb"
        ? merkeKatalog
        : (() => {
            const k = merkerIUtgave(merkeKatalog, merkeSpill);
            return {
              ...k,
              grupper: k.grupper.map((g) => ({ ...g, navn: t(g.navn), tekst: t(g.tekst) })),
              merker: k.merker.map((mk) => ({ ...mk, navn: t(mk.navn), hvordan: t(mk.hvordan), ...(mk.tekst ? { tekst: t(mk.tekst) } : {}) })),
            };
          })();
    U.merker = kat;
    const merkeData = {
      ...kat,
      alle: merkeSpill.map((g) => g.id),
      daglige: merkeSpill.filter((g) => g.tagger.includes("daglig")).map((g) => g.id),
      tagger: Object.fromEntries(merkeSpill.map((g) => [g.id, g.tagger])),
    };
    U.merkerJs = skriv(U.sprak === "nb" ? "felles/merker.js" : `felles/merker.${U.sprak}.js`, "window.RUSJ_MERKER=" + somData(merkeData) + ";\n" + kilde("rusj/kit/merker.js"));
  }

  // Search data: rusj/seo.json, and rusj/seo.<lang>.json for each other edition.
  for (const U of Object.values(UTGAVE)) {
    U.seo = lesSeo(ROT, U.sprak);
    const av = new Map(); // one lookup per game (and one warning, if a game has no entry yet)
    U.sokedata = (m) => {
      if (!av.has(m.id)) av.set(m.id, seoFor(U.seo, m));
      return av.get(m.id);
    };
  }
  const sokedata = (m) => NB.sokedata(m);
  const seo = NB.seo;
  // Collection pages (rusj/samlinger/*.json, Norwegian only): read before the games, so every game
  // page can link to the collections it is in. Checked against every game, also those left out of a test build.
  const samlinger = lesSamlinger({
    rot: ROT,
    spillIder: ["luringen", ...alleSpillKort.map((g) => g.id)],
    atten: alleSpillKort.filter((g) => g.alder18).map((g) => g.id),
    tittelMaks: TITTEL_MAKS,
    beskrivelse: BESKRIVELSE_GRENSER,
    merke: merkeSynlig,
  });
  const samlingerMed = (id) => samlinger.filter((s) => s.spill.some(([x]) => x === id)).map((s) => [`/${s.slug}/`, s.navn]);
  const hodeMed = (o) => hode({ pngIkon: ikoner.p192, appleIkon: ikoner.p180, ...o });

  const STEMPEL_FILTER = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="stempel-ruff" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="stoy"/><feDisplacementMap in="SourceGraphic" in2="stoy" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`;

  // ---------- One page per game (and per edition that has it) ----------
  const lesData = (m, mappe) => {
    const data = {};
    const dataMappe = join(m.mappe, mappe);
    if (existsSync(dataMappe)) {
      for (const f of readdirSync(dataMappe).sort()) {
        if (!f.endsWith(".json")) continue;
        try {
          data[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dataMappe, f), "utf8"));
        } catch (e) {
          throw new Error(`rusj/spill/${m.id}/${mappe}/${f}: ugyldig JSON (${e.message})`);
        }
      }
    }
    return data;
  };
  const spillFiler = new Map(); // id → { js, css }: the code is the same in every edition, cached once
  for (const nm of spill) {
    const id = nm.id;
    const js = join(nm.mappe, "spill.js");
    if (!existsSync(js)) throw new Error(`rusj/spill/${id}/spill.js mangler`);
    const spillJs = readFileSync(js, "utf8");
    if (/<\/script/i.test(spillJs)) throw new Error(`${id}: spill.js inneholder </script>`);
    spillFiler.set(id, {
      kode: spillJs,
      js: skriv(`${id}/spill.js`, spillJs),
      css: existsSync(join(nm.mappe, "spill.css")) ? skriv(`${id}/spill.css`, readFileSync(join(nm.mappe, "spill.css"), "utf8")) : null,
    });
  }
  for (const U of Object.values(UTGAVE)) {
    const t = U.t;
    const deling0 = delingFor(U);
    for (const m of U.spill) {
      const id = m.id;
      const mappe = m.url.slice(1); // "fireren/" or "en/four-in-a-row/"
      const { kode: spillJs, js: jsSti, css: spillCss } = spillFiler.get(id);
      const data = lesData(m, U.sprak === "nb" ? "data" : `data.${U.sprak}`);
      const spillTabell = U.sprak === "nb" ? null : lesTabell(join(m.mappe, `tekst.${U.sprak}.json`)) || {};
      const meta = {
        id,
        navn: m.navn,
        undertittel: m.undertittel,
        kort: m.kort,
        spillere: m.spillere,
        minutter: m.minutter,
        farge: m.farge,
        alder18: !!m.alder18,
        ...(U.sprak === "nb" ? {} : { slug: m.slug }),
      };
      // Other games to suggest on the end screen: never drinking games from an ordinary game; a drinking
      // game also suggests ordinary ones (the kit mixes in at least one «pause» from the rest).
      const andre = U.alle
        .filter((g) => g.id !== id && (m.alder18 || !g.alder18))
        .map((g) => ({ id: g.id, navn: g.navn, undertittel: g.undertittel, spillere: g.spillere, farge: g.farge, ...(g.alder18 ? { alder18: true } : {}), ...(U.sprak === "nb" ? {} : { url: g.url }) }));
      const dataJs =
        "window.RUSJ_SPILL=" + JSON.stringify(meta) + ";\nwindow.RUSJ_ANDRE=" + somData(andre) + ";\nwindow.RUSJ_DATA=" + somData(data) + ";\n" + (spillTabell ? "window.RUSJ_TEKST_SPILL=" + somData(spillTabell) + ";\n" : "");
      const dataSti = skriv(`${mappe}data.js`, dataJs);
      const paNett = !!(m.nett && felles.nett);
      const css = [felles.css, ...(m.terninger ? [felles.terningerCss] : []), ...(paNett ? [felles.nettCss] : []), ...(spillCss ? [spillCss] : [])];
      const ikon = skriv(`${mappe}ikon.svg`, ikonSvg(G, id, U.sprak === "nb" ? undefined : U.sprak));
      const egenDeling = U.sprak === "nb" ? `deling-${id}.png` : `deling-${id}.${U.sprak}.png`;
      const deling = existsSync(join(BILDER, egenDeling)) ? kopier(join(BILDER, egenDeling), `${mappe}deling.png`) : deling0;

      const skript = [...forTekst(U), felles.gjengen, U.merkerJs, felles.js];
      if (m.qr || paNett) skript.push(felles.qr); // the invite sheet has a QR code
      if (m.terninger) skript.push(felles.terninger);
      if (paNett) skript.push(felles.nett); // after the kit, before the game: it wraps Rusj.start
      if (m.ordbank && ordFor[U.sprak]) skript.push(ordFor[U.sprak].fil);
      skript.push(dataSti, jsSti);

      const dyp = m.fargeDyp || morkere(m.farge);
      // Title, description and link preview come from rusj/seo.json: the words people search for
      // first, the mascot second. The mascot stays the name on the page itself.
      const sd = U.sokedata(m);
      // «Slik spiller dere …» under the app (scripts/om-spillet.mjs): the rules from the game's own
      // Rusj.start() – through the edition's tables – and for ordinary Norwegian games real examples
      // from its data. Outside #skjerm, so the kit never draws over it; the kit hides it on every
      // screen but the home screen and the age gate.
      const spraket = U.sprak === "nb" ? null : lagSprak(U.sprak, spillTabell, kitTabell[U.sprak]);
      const lest = lesRegler({ m, spillJs, data, ordData: (ordFor[U.sprak] || {}).data, G, sprak: spraket });
      if (lest.feil) console.warn(`  ⚠ ${id}${U.sprak === "nb" ? "" : ` (${U.sprak})`}: ${lest.feil} – siden får ingen «Slik spiller dere»-blokk`);
      const alt = alternativer(spillSti(id));
      const omHtml = lest.regler
        ? omSpilletHtml(m, {
            regler: lest.regler,
            eksempler: U.sprak === "nb" ? eksemplerFor(m, data) : null,
            frase: merkeSynlig(sd.frase) ? m.undertittel : sd.frase,
            lenker: U.sprak === "nb" ? samlingerMed(id) : [],
            sprak: U,
            sprakvalg: sprakvalg(U, spillSti(id)),
            nett: paNett,
          })
        : "";
      const side = `${hodeMed({
        sprak: U.sprak,
        alternativer: alt,
        tittel: sd.tittel,
        ogTittel: sd.ogTittel,
        beskrivelse: sd.beskrivelse,
        sti: m.url,
        kortnavn: m.navn,
        ikon,
        deling,
        delingAlt: t("{navn} – {frase}. Gratis på rusj.no", { navn: m.navn, frase: sd.frase }),
        css,
        skript,
        htmlAttr: ` data-spill="${id}"${KAFFE[U.sprak] && KAFFE[U.sprak].lenke ? ` data-kaffe="${esc(KAFFE[U.sprak].lenke)}" data-kaffe-pris="${esc(KAFFE[U.sprak].pris || "")}"` : ""} style="--aksent: ${m.farge}; --aksent-dyp: ${dyp}"`,
        jsonld: spillJsonLd(m, sd, deling, U),
      })}
<body>
<div class="scene" aria-hidden="true"></div>
<div class="app">
  <header class="topp">
    <a class="topp-merke" id="tilportal" href="${U.forside}" aria-label="${esc(t("Alle spill på rusj.no"))}"><svg class="pil" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>${LOGO}</a>
    <button class="ikonknapp" id="tilbake" data-h="tilbake" aria-label="${esc(t("Tilbake"))}" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
    <span class="topp-tittel" id="topp-tittel"></span>
    <div class="topp-hoyre">
      <button class="ikonknapp" id="reglerknapp" data-h="regler" aria-label="${esc(t("Slik spiller du"))}"><span class="sporsmal" aria-hidden="true">?</span></button>
      <button class="ikonknapp" id="lydknapp" data-h="lyd" aria-label="${esc(t("Lyd"))}" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="fylt" d="M4 9h4l5-4v14l-5-4H4z"/><path class="bolge" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="kryss" d="M17 9l5 6M22 9l-5 6"/></svg></button>
    </div>
  </header>
  <main id="hoved">
    <section class="skjerm" id="skjerm">
      <div class="spillhjem">
        <span class="figur-ramme">${G.svg(id, U.sprak === "nb" ? undefined : { sprak: U.sprak })}</span>
        <h1>${esc(m.navn)}</h1>
        <span class="undertittel">${esc(m.undertittel)}</span>
        <p class="slagord">${esc(sd.beskrivelse)}</p>
      </div>
      <noscript><p class="personvern">${esc(t("{navn} trenger JavaScript for å kjøre.", { navn: m.navn }))}</p></noscript>
    </section>
  </main>
</div>
${omHtml}
<div class="ark-bakgrunn" id="ark" hidden><div class="ark" role="dialog" aria-modal="true" aria-labelledby="ark-tittel" id="ark-innhold"></div></div>
<div class="nedtelling" id="nedtelling" hidden aria-live="assertive"></div>
<canvas class="konfetti" id="konfetti" aria-hidden="true"></canvas>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="vh" id="si" aria-live="polite"></div>
${STEMPEL_FILTER}
</body>
</html>
`;
      skriv(`${mappe}index.html`, side);
    }
  }

  // ---------- Front page (one per edition) ----------
  const alleKort = [];
  if (luringen) alleKort.push(luringen);
  alleKort.push(...spill);
  alleKort.sort((a, b) => a.rekkefolge - b.rekkefolge);
  NB.kort = alleKort.map((m) => lokal(m, NB));
  for (const U of Object.values(UTGAVE)) if (U.sprak !== "nb") U.kort = U.spill.slice().sort((a, b) => a.rekkefolge - b.rekkefolge);

  // One player against the phone? The game's own spill.json decides; until the games say it
  // themselves, rusj/seo.json does. (It cannot be read from the number of players: a quiz or a
  // memory game for 1–4 is played alone, but not against anyone.)
  const motMobilen = (m) => (typeof m.motMobilen === "boolean" ? m.motMobilen : !!(seo.spill[m.id] || {}).motMobilen);
  const portalCss = skriv("felles/portal.css", kilde("rusj/portal/portal.css"));
  const portalJs = skriv("felles/portal.js", kilde("rusj/portal/portal.js"));
  const dagligJs = skriv("felles/daglig.js", kilde("rusj/portal/daglig.js")); // «Dagens rusj»: see rusj/DAGLIG.md
  const finnerJs = skriv("felles/finner.js", kilde("rusj/portal/finner.js")); // «Hva skal vi spille?»: the finder's choice
  const Finner = require(join(ROT, "rusj/portal/finner.js")); // its chips and age steps, for the markup
  // «Mest spilt nå» (rusj/topp.json): a row under the hero, and a place in the finder's ranking.
  const topp = lesTopp(toppFil);
  const siderJs = skriv("felles/sider.js", kilde("rusj/portal/sider.js"));
  // Small line icons in the text colour (drawn once, used by every card): emoji phones and
  // stopwatches are dark on some phones and would disappear on the night background.
  const IKONER = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="i-spillere" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17.2" cy="9.2" r="2.4"/><path d="M17 14.2c2.3.3 3.7 1.7 4.1 4.3"/></symbol>
  <symbol id="i-mobil" viewBox="0 0 24 24"><rect x="7" y="2.8" width="10" height="18.4" rx="2.6"/><path d="M11 17.6h2"/></symbol>
  <symbol id="i-tid" viewBox="0 0 24 24"><circle cx="12" cy="13" r="7.6"/><path d="M12 9v4.2l2.7 1.7M9.8 2.8h4.4"/></symbol>
  <symbol id="i-nett" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.3 2.4 3.5 5.3 3.5 8.6s-1.2 6.2-3.5 8.6c-2.3-2.4-3.5-5.3-3.5-8.6s1.2-6.2 3.5-8.6z"/></symbol>
</svg>`;
  const ikon = (navn) => `<svg class="fakta-ikon" aria-hidden="true" focusable="false"><use href="#i-${navn}"/></svg>`;
  // The page's own scripts after the edition's table and t() (the front page and the pages about rusj).
  const portalSkript = (U, ...egne) => [...forTekst(U), felles.tekst, ...egne];
  // The footer is the same on the front page and the pages about rusj. The sentence is exact on
  // purpose: what is typed stays in the browser – the page itself is of course fetched from a host.
  const bunn = (U, medHjem, finn) => `<footer class="bunn">
  <p class="bunn-logo">${G.logo()}</p>
  <p><b>${esc(U.t("Ingen konto. Ingen sporing. Ingen reklame."))}</b><br>${esc(
    STAT_FIL
      ? U.t("Det dere skriver inn, lagres bare i nettleseren på denne enheten. Spiller dere på nett, sendes bare trekk og kallenavn, og de slettes etter et døgn. Vi teller bare anonymt hvor mange som er innom og hvilke spill som åpnes – uten informasjonskapsler og uten personopplysninger.")
      : U.t("Det dere skriver inn, lagres bare i nettleseren på denne enheten. Spiller dere på nett, sendes bare trekk og kallenavn, og de slettes etter et døgn."),
  )}</p>
  <nav class="bunn-lenker" aria-label="${esc(U.t("Om rusj"))}">${medHjem ? `<a href="${U.forside}">${esc(U.t("Alle spill"))}</a>` : ""}<a href="${U.side("merker")}">${esc(U.t("Klistremerkeboka"))}</a><a href="${U.side("om")}">${esc(U.t("Om rusj"))}</a><a href="${U.side("personvern")}">${esc(U.t("Personvern"))}</a></nav>
  ${sprakvalg(U, finn)}
  <p class="bunn-liten">${esc(U.t("rusj.no · laget i Norge"))}</p>
</footer>`;
  // The mascot as a picture of its own, per edition (/<id>/figur.svg, /en/<slug>/figur.svg: some
  // mascots carry words in the edition's language). The front page shows most mascots that way, as
  // <img loading="lazy">, so a first visit draws only what is on the first screen.
  for (const U of Object.values(UTGAVE)) U.fig = new Map(U.kort.map((m) => [m.id, skriv(`${m.url.slice(1)}figur.svg`, figurSvg(G, m.id, U.sprak === "nb" ? undefined : U.sprak))]));
  // The rooms on the front page (Finner.ROMMENE: the same filters as portal.js): an emoji, a colour
  // and the mascots of the collage – the first two of these that are in the room in this edition.
  const ROM_UTSEENDE = {
    dagens: { ikon: "📅", farge: "#ffd23f", figurer: ["ordugla", "blyanten", "kortkongen", "tallknuseren"] },
    fest: { ikon: "🎉", farge: "#ff4f8b", figurer: ["luringen", "spionen", "sladrehanken", "skravla"] },
    familie: { ikon: "🏡", farge: "#ff8a3d", figurer: ["detektiven", "brikka", "terninga", "kunstneren"] },
    barn: { ikon: "🧸", farge: "#3de3b0", figurer: ["elefanten", "bokstavtrollet", "ballongen", "penselen"] },
    alene: { ikon: "🙋", farge: "#59b9ff", figurer: ["maneten", "ekornet", "sjakkhesten", "humla"] },
    klassikere: { ikon: "👑", farge: "#a47bff", figurer: ["sjakkhesten", "terninga", "fireren", "tavla"] },
    kort: { ikon: "🃏", farge: "#ff5a4e", figurer: ["kortkongen", "narren", "vriatter", "hjerteknuseren"] },
    ord: { ikon: "💡", farge: "#6f8bff", figurer: ["bedreviteren", "ordugla", "tidsmaskinen", "skravla"] },
    arkade: { ikon: "🕹️", farge: "#9be15d", figurer: ["slangen", "bobla", "murbrekkeren", "planeten"] },
    voksen: { ikon: "🔞", farge: "#ff4f8b", figurer: [] }, // (drawn by portal.js behind the door)
  };
  // The shortcuts (Finner.HURTIG: each one a set of answers to the three questions).
  const HURTIG_UTSEENDE = { barn: ["🧸", "#3de3b0"], vors: ["🍻", "#ff4f8b"], buss: ["🚌", "#59b9ff"], to: ["👫", "#a47bff"], stor: ["🙌", "#ff8a3d"], fem: ["⏱️", "#ffd23f"] };
  for (const id of [...Finner.ROMMENE, ...Object.keys(Finner.HURTIG)]) if (!ROM_UTSEENDE[id] && !HURTIG_UTSEENDE[id]) throw new Error(`rusj/portal/finner.js: «${id}» mangler utseende i scripts/rusj.mjs`);
  for (const U of Object.values(UTGAVE)) {
    const t = U.t;
    const kortListe = U.kort;
    // The names of the rooms and the shortcuts in this edition (literal keys for scripts/sprak.mjs).
    const ROM_NAVN = {
      dagens: [t("Dagens"), t("Dagens utfordringer")],
      fest: [t("Fest"), t("Til festen")],
      familie: [t("Familie"), t("Hele familien")],
      barn: [t("Barn"), t("For barna")],
      alene: [t("Alene"), t("Spill alene")],
      klassikere: [t("Klassikere"), t("Klassikere")],
      kort: [t("Kort"), t("Kortspill")],
      ord: [t("Ord og quiz"), t("Ord og quiz")],
      arkade: [t("Arkade"), t("Arkade")],
      voksen: ["18+", t("Drikkespill 18+")],
    };
    const HURTIG_NAVN = { barn: t("Med barna"), vors: t("Vorspiel"), buss: t("Alene på bussen"), to: t("To stykker"), stor: t("Stor gjeng"), fem: t("5 minutter") };
    // The place of each of the edition's games in «Mest spilt nå» (1 = most played), for the finder.
    const toppPlass = new Map((topp ? topp.spill : []).filter((id) => kortListe.some((m) => m.id === id)).map((id, i) => [id, i + 1]));
    const spillData = kortListe.map((m) => ({
      id: m.id,
      navn: m.navn,
      undertittel: m.undertittel,
      kort: m.kort,
      spillere: m.spillere,
      alder: m.alder,
      minutter: m.minutter,
      tagger: m.tagger,
      mobiler: m.mobiler,
      farge: m.farge,
      rekkefolge: m.rekkefolge,
      ...(toppPlass.has(m.id) ? { topp: toppPlass.get(m.id) } : {}),
      alder18: !!m.alder18,
      ...(motMobilen(m) ? { motMobilen: true } : {}),
      // Can be played with friends on their own phones online (R.nett): for the badge «På nett».
      ...(m.nett && NETT ? { nett: true } : {}),
      // The game's own search words plus the ones in rusj/seo.json (what people call the game).
      sok: [...new Set([...(Array.isArray(m.sok) ? m.sok : []), ...U.sokedata(m).sok])],
      // Can be played online, each on their own phone (spill.json "nett"): a badge on the cards.
      ...(m.nett ? { nett: true } : {}),
      fig: U.fig.get(m.id),
      ...(U.sprak === "nb" ? {} : { url: m.url }),
    }));
    // RUSJ_TAGGSOK: words people type for a whole kind of game: its names in the edition («Kortspill»,
    // «Quiz og kunnskap») and the words in rusj/seo.json («selskapsleker», «vors», «bursdag»).
    const TAGG = taggerPa(t);
    const SLAGNAVN = { fest: t("Til festen"), familie: t("Hele familien"), barn: t("For barna"), daglig: t("Dagens utfordringer"), alene: t("Spill alene"), quiz: t("Quiz og kunnskap"), verktoy: t("Nyttige verktøy") };
    const taggsok = Object.fromEntries(Object.keys(TAGGER).map((tg) => [tg, [TAGG[tg], ...(SLAGNAVN[tg] ? [SLAGNAVN[tg]] : []), ...((U.seo.tagger || {})[tg] || [])]]));
    const portalData = skriv(U.sprak === "nb" ? "felles/spilliste.js" : `felles/spilliste.${U.sprak}.js`, "window.RUSJ_SPILLISTE=" + somData(spillData) + ";\nwindow.RUSJ_TAGGSOK=" + somData(taggsok) + ";");
    const svgFor = (id) => G.svg(id, U.sprak === "nb" ? undefined : { sprak: U.sprak });
    // A mascot further down the page: its picture, fetched when it comes near (inline when a partial
    // build has no picture of it).
    const bilde = (id) => (U.fig.has(id) ? `<img src="${U.fig.get(id)}" alt="" loading="lazy" decoding="async">` : svgFor(id));
    // Before the 18+ door the page holds no drinking game at all: not in the list, not in the rows,
    // not in the structured data. portal.js adds them from the game list once someone is 18.
    const vanlige = kortListe.filter((m) => !m.alder18);
    U.antall18 = kortListe.length - vanlige.length;
    // What a screen reader hears for a game: name, genre, one-liner and the facts in one sentence.
    const lest = (m) => `${m.navn}: ${m.undertittel}. ${m.kort} ${U.stor(faktaLest(m, motMobilen(m), t))}.`;
    // «Ny» on the eight newest games (their place in the site's order), «📅» on the daily ones.
    const nyeste = vanlige.slice().sort((a, b) => b.rekkefolge - a.rekkefolge);
    const NYE = new Set(nyeste.slice(0, 8).map((m) => m.id));
    const merke = (m) => (m.tagger.includes("daglig") ? '<span class="flis-merke dagens" aria-hidden="true">📅</span>' : NYE.has(m.id) ? `<span class="flis-merke ny" aria-hidden="true">${esc(t("Ny"))}</span>` : "");
    // «På nett»: the game can be played online, each on their own phone (spill.json "nett").
    const nettMerke = `<span class="nett-merke" aria-hidden="true">${ikon("nett")}${esc(t("På nett"))}</span>`;
    // A game as a small tile (the A–Å list, «Nytt»): the mascot and the name; the link says the rest.
    const flis = (m) => `<a class="spillflis" href="${m.url}" style="--kf: ${m.farge}" aria-label="${esc(lest(m))}"><span class="spillflis-bilde">${bilde(m.id)}${merke(m)}${m.nett ? nettMerke : ""}</span><span class="spillflis-navn">${esc(m.navn)}</span></a>`;
    // The badges on a card with facts («Mest spilt nå»): «Dagens», «Mot mobilen», «På nett».
    const kortMerker = (m) => {
      const ut = [
        m.tagger.includes("daglig") && `<span class="kort-merke dagens">${esc(t("Dagens"))}</span>`,
        motMobilen(m) && `<span class="kort-merke">${esc(t("Mot mobilen"))}</span>`,
        m.nett && `<span class="kort-merke nett">${ikon("nett")}${esc(t("På nett"))}</span>`,
      ].filter(Boolean);
      return ut.length ? `<span class="kort-merker" aria-hidden="true">${ut.join("")}</span>` : "";
    };

    // «Alle spill A–Å»: every game as a plain link, sorted by name in the edition's language, the
    // first of each letter marked. The search, the shortcuts, the rooms and the questions filter it.
    const aa = vanlige.slice().sort((a, b) => a.navn.localeCompare(b.navn, U.lokale));
    let forrige = "";
    const aaHtml = aa
      .map((m) => {
        const b = m.navn.charAt(0).toLocaleUpperCase(U.lokale);
        const forste = b !== forrige;
        forrige = b;
        return `<li data-id="${m.id}" data-b="${esc(b)}"${forste ? ' class="forste"' : ""}>${flis(m)}</li>`;
      })
      .join("\n");
    const dorHtml = U.antall18
      ? `\n<li class="dor-celle" id="dor-celle"><button type="button" class="dor" data-atten><span class="dor-ikon" aria-hidden="true">🔞</span><span class="dor-tekst"><b id="dor-tittel">${esc(t("Drikkespill (18+)"))}</b><span id="dor-under">${esc(t("{n} spill for voksne – trykk for å vise", { n: U.antall18 }))}</span></span></button></li>`
      : "";

    // The rooms: small tiles with two mascots and a count. 18+ is a door until someone is 18.
    const romHtml = Finner.ROMMENE.map((id) => {
      const r = ROM_UTSEENDE[id];
      const [navn, lang] = ROM_NAVN[id];
      if (id === "voksen")
        return U.antall18
          ? `<li class="rom-bred"><button type="button" class="rom rom-laast" data-rom="voksen" data-ikon="${r.ikon}" data-navn="${esc(navn)}" style="--rf: ${r.farge}"><span class="rom-las" aria-hidden="true">18+</span><span class="rom-tekst"><span class="rom-navn">${esc(t("Drikkespill"))}</span><span class="rom-under">${esc(t("{n} spill bak aldersdøra", { n: U.antall18 }))}</span></span></button></li>`
          : "";
      const iRommet = vanlige.filter((m) => Finner.iRom(m, id));
      if (!iRommet.length) return "";
      const figurer = [...r.figurer.filter((f) => iRommet.some((m) => m.id === f)), ...iRommet.map((m) => m.id)].filter((f, i, a) => a.indexOf(f) === i).slice(0, 2);
      return `<li><button type="button" class="rom" data-rom="${id}" data-ikon="${r.ikon}" data-navn="${esc(navn)}" aria-pressed="false" style="--rf: ${r.farge}" aria-label="${esc(`${lang}: ${t("{antall} spill", { antall: iRommet.length, n: iRommet.length })}`)}"><span class="rom-navn">${esc(navn)}</span><span class="rom-antall" aria-hidden="true">${iRommet.length}</span><span class="rom-gjeng" aria-hidden="true">${figurer.map(svgFor).join("")}</span></button></li>`;
    }).join("\n      ");

    // «Mest spilt nå» (rusj/topp.json): three to five numbered cards, never 18+.
    const toppRad = toppSpill(topp, kortListe);
    const toppKort = (m, nr) =>
      `<li class="toppkort" data-id="${m.id}"><a href="${m.url}" style="--kf: ${m.farge}" aria-label="${esc(`${t("Nummer {n}.", { n: nr })} ${lest(m)}`)}"><span class="toppkort-bilde"><span class="topp-nr" aria-hidden="true">${nr}</span>${svgFor(m.id)}</span><span class="toppkort-tekst"><span class="toppkort-sjanger">${esc(m.undertittel)}</span><span class="toppkort-navn">${esc(m.navn)}</span></span>${kortMerker(m)}<span class="toppkort-fakta"><span>${ikon("spillere")}${spillereTekst(m)}</span><span>${ikon("tid")}${tidTekst(m)}</span></span></a></li>`;
    const toppHtml = toppRad.length
      ? `<section class="forside-del topp5" id="topp5" aria-labelledby="topp5-t">
      <div class="del-topp"><h2 id="topp5-t"><span aria-hidden="true">🔥</span> ${esc(t("Mest spilt nå"))}</h2><span class="del-under">${esc(t("Etter anonym telling"))}</span></div>
      <ol class="topp-rad">
${toppRad.map((m, i) => "        " + toppKort(m, i + 1)).join("\n")}
      </ol>
    </section>`
      : "";
    // «Dagens»: today's daily game is chosen in the browser (the same for everyone that day).
    const daglige = vanlige.filter((m) => m.tagger.includes("daglig"));
    const dagensHtml = daglige.length
      ? `<section class="forside-del dagens" id="dagens" aria-labelledby="dagens-t">
      <div class="del-topp"><h2 id="dagens-t"><span aria-hidden="true">📅</span> ${esc(t("Dagens"))}</h2><span class="del-under" id="dagens-dato"></span></div>
      <div class="dagens-plass"><a class="dagens-kort" id="dagens-kort" href="${daglige[0].url}#dagens" hidden><span class="dagens-bilde"></span><span class="dagens-tekst"><span class="dagens-merke">${esc(t("Dagens utfordring"))}</span><b class="dagens-navn"></b><small class="dagens-linje"></small></span></a></div>
      <div class="dagens-flere"><button type="button" class="brikke" data-til-rom="dagens" aria-label="${esc(t("Se alle: {hylle}", { hylle: t("Dagens utfordringer") }))}">${esc(t("Se alle"))} <span class="brikke-tall">${daglige.length}</span></button><span class="dagens-status" id="dagens-status"></span></div>
    </section>`
      : "";
    const forsideTittel = U.seo.forside.tittel;
    const forsideBeskrivelse = U.seo.forside.beskrivelse.replace("{antall}", kortListe.length);
    U.forsideTittel = forsideTittel;
    if (forsideTittel.length > TITTEL_MAKS || forsideBeskrivelse.length > BESKRIVELSE_GRENSER[1]) throw new Error(`rusj/seo${U.sprak === "nb" ? "" : "." + U.sprak}.json: forsidens tittel eller beskrivelse er for lang`);
    const portalSide = `${hodeMed({
      sprak: U.sprak,
      alternativer: alternativer((V) => V.forside),
      tittel: forsideTittel,
      beskrivelse: forsideBeskrivelse,
      sti: U.forside,
      ikon: ikoner.svg,
      deling: delingFor(U),
      delingAlt: t("rusj – gratis spill og selskapsleker på norsk"),
      css: [felles.css, portalCss],
      skript: portalSkript(U, portalData, dagligJs, finnerJs, portalJs),
      jsonld: {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", "@id": `${DOMENE}${U.forside}#nettsted`, name: "rusj", alternateName: "rusj.no", url: `${DOMENE}${U.forside}`, inLanguage: U.sprak, description: forsideBeskrivelse, publisher: { "@id": UTGIVER["@id"] } },
          UTGIVER,
          {
            "@type": "ItemList",
            name: t("Alle spill på rusj"),
            numberOfItems: vanlige.length,
            itemListElement: vanlige.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: U.sokedata(m).frase.includes(m.navn) ? U.sokedata(m).frase : `${m.navn} – ${U.sokedata(m).frase}`, url: `${DOMENE}${m.url}` })),
          },
        ],
      },
    })}
<body class="portal forside">
<a class="hopp" href="#alle">${esc(t("Hopp til alle spill A–Å"))}</a>
<div class="scene" aria-hidden="true"></div>
${IKONER}
${FLAGG}
<header class="linje" id="linje">
  <div class="linje-inn">
    <a class="linje-logo" href="${U.forside}" aria-label="${esc(t("rusj – til alle spillene"))}">${LOGO}</a>
    <div class="sokefelt" role="search" aria-label="${esc(t("Finn et spill"))}">
      <svg class="sok-ikon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/></svg>
      <input type="search" id="sok" placeholder="${esc(t("Søk i {n} spill", { n: kortListe.length }))}" aria-label="${esc(t("Søk etter spill"))}" aria-controls="alle-liste" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <button type="button" class="sok-tom" id="sok-tom" aria-label="${esc(t("Tøm søket"))}" hidden>×</button>
    </div>
    <button type="button" class="terning-knapp" id="overrask" aria-haspopup="dialog"><span class="terning" aria-hidden="true">🎲</span><span class="terning-tekst">${esc(t("Overrask meg"))}</span></button>
  </div>
</header>
<main class="forside-hoved" id="hoved">
  <section class="start" aria-labelledby="spill">
    <div class="start-topp">
      <h1 id="spill" tabindex="-1"><span class="vh">${esc(forsideTittel)}. </span>${esc(t("Hva skal vi spille?"))}</h1>
      ${sprakvelger(U, (V) => V.forside)}
      <p class="start-linje">${U.th("{antall} gratis spill · ingen konto · ingen reklame", { antall: `<b>${kortListe.length}</b>` })}</p>
    </div>
    <div class="hurtig" role="group" aria-label="${esc(t("Snarveier"))}" id="hurtig">
      ${Object.keys(Finner.HURTIG)
        .map((id) => {
          const [ik, farge] = HURTIG_UTSEENDE[id];
          return `<button type="button" class="brikke hurtig-brikke" data-hurtig="${id}" data-ikon="${ik}" data-navn="${esc(HURTIG_NAVN[id])}" aria-pressed="false" style="--hf: ${farge}"><span aria-hidden="true">${ik}</span> ${esc(HURTIG_NAVN[id])}</button>`;
        })
        .join("")}<button type="button" class="brikke hurtig-brikke flere" id="flere" aria-expanded="false" aria-controls="finner"><span aria-hidden="true">🧭</span> ${esc(t("Flere valg"))}</button>
    </div>
    <div class="finner" id="finner" role="group" aria-label="${esc(t("Filter"))}" hidden>
      <div class="finner-sporsmal" role="group" aria-labelledby="finner-antall-tittel">
        <span class="finner-tittel" id="finner-antall-tittel"><span class="finner-nr" aria-hidden="true">1</span>${esc(t("Hvor mange er dere?"))}</span>
        <div class="brikker finner-brikker">${Object.keys(Finner.SPILLERE).map((v) => `<button type="button" class="brikke" data-finn-antall="${v}" aria-pressed="false">${v.replace("-", "–")}</button>`).join("")}</div>
      </div>
      <div class="finner-sporsmal finner-alder" role="group" aria-labelledby="finner-alder-tittel">
        <label class="finner-tittel" id="finner-alder-tittel" for="finner-yngst"><span class="finner-nr" aria-hidden="true">2</span>${esc(t("Yngste"))}</label>
        <div class="finner-steg">
          <button type="button" class="finner-steg-knapp" data-finn-yngst="-1" aria-label="${esc(t("Yngre"))}">−</button>
          <select id="finner-yngst">${Finner.alderTrinn(false).map((v) => `<option value="${v}"${v === "voksen" ? " selected" : ""}>${esc(v === "voksen" ? t("Voksen") : t("{n} år", { n: v }))}</option>`).join("")}</select>
          <button type="button" class="finner-steg-knapp" data-finn-yngst="1" aria-label="${esc(t("Eldre"))}">+</button>
        </div>
      </div>
      <div class="finner-sporsmal" role="group" aria-labelledby="finner-lyst-tittel">
        <span class="finner-tittel" id="finner-lyst-tittel"><span class="finner-nr" aria-hidden="true">3</span>${esc(t("Hva har dere lyst på?"))}</span>
        <div class="brikker finner-brikker">${[
          ["alt", t("Litt av alt")],
          ["tull", t("Le og tulle")],
          ["tenke", t("Tenke og vinne")],
          ["ord", t("Ord og quiz")],
          ["tegne", t("Tegne og mime")],
          ["kjapt", t("Kjapt (<10 min)")],
        ]
          .map(([v, navn]) => `<button type="button" class="brikke" data-finn-lyst="${v}" aria-pressed="${v === "alt"}">${esc(navn)}</button>`)
          .join("")}</div>
      </div>
      <button type="button" class="knapp-2 liten finner-vis" id="finner-vis"><span id="finner-treff"></span> <span aria-hidden="true">↓</span></button>
    </div>
    <nav class="rom-nav" aria-label="${esc(t("Type spill"))}">
      <ul class="rommene" id="rommene">
      ${romHtml}
      </ul>
    </nav>
  </section>
  <div class="installtips" id="installtips" hidden>
    <span class="installtips-ikon" aria-hidden="true">📲</span>
    <span class="installtips-tekst"><b>${esc(t("Ha rusj som app"))}</b><span class="installtips-mer"> – ${esc(t("starter fra hjemskjermen og virker uten nett"))}</span></span>
    <button type="button" class="installtips-vis" id="installtips-vis" aria-label="${esc(t("Vis meg hvordan rusj blir en app"))}">${esc(t("Vis meg"))}</button>
    <button type="button" class="installtips-lukk" id="installtips-lukk" aria-label="${esc(t("Skjul tipset"))}">×</button>
  </div>
  <section class="forside-del fortsett" id="fortsett" hidden aria-labelledby="fortsett-tittel">
    <div class="del-topp"><h2 id="fortsett-tittel">${esc(t("Fortsett der dere slapp"))}</h2></div>
    <ul class="forside-rad" id="fortsett-rad"></ul>
  </section>
  <section class="kveld" id="kveld" hidden aria-labelledby="kveld-tittel">
    <div class="kveld-topp"><h2 id="kveld-tittel">🏆 ${esc(t("Kveldens gjeng"))}</h2><span class="kveld-antall" id="kveld-antall"></span></div>
    <ol class="kveld-liste" id="kveld-liste"></ol>
    <div class="kveld-knapper">
      <button type="button" class="kveld-alle" id="kveld-alle" aria-expanded="false" aria-controls="kveld-liste" hidden>${esc(t("Vis alle"))}</button>
      <button type="button" class="lenke" id="kveld-nullstill">${esc(t("Start en ny kveld"))}</button>
    </div>
    <a class="kveld-merker" href="${U.side("merker")}"><span aria-hidden="true">📒</span> ${esc(t("Klistremerkeboka"))}<span class="kveld-merker-pil" aria-hidden="true">›</span></a>
    <p class="kveld-fot">${esc(t("3 poeng for seier, 2 for andreplass og 1 for tredjeplass – i alle spillene dere spiller i kveld."))}</p>
  </section>
  ${toppHtml || dagensHtml ? `<div class="naa">\n    ${[toppHtml, dagensHtml].filter(Boolean).join("\n    ")}\n  </div>` : ""}
  <section class="forside-del nytt" id="nytt" aria-labelledby="nytt-t">
    <div class="del-topp"><h2 id="nytt-t"><span aria-hidden="true">✨</span> ${esc(t("Nytt"))}</h2></div>
    <ul class="forside-rad" id="nytt-rad">
${nyeste
  .slice(0, 10)
  .map((m) => `      <li data-id="${m.id}">${flis(m)}</li>`)
  .join("\n")}
    </ul>
  </section>
  <section class="alle-spill" id="alle" aria-labelledby="alle-t" tabindex="-1">
    <div class="resultat-topp" id="resultat-topp">
      <div class="resultat-linje"><h2 id="alle-t" tabindex="-1">${esc(t("Alle spill A–Å"))}</h2><button type="button" class="nullstill" id="nullstill" hidden>${esc(t("Nullstill"))}</button></div>
      <div class="aktive" id="aktive" role="group" hidden></div>
    </div>
    <p class="vh" id="si" aria-live="polite"></p>
    <div class="beste" id="beste" hidden></div>
    <ul class="alle-liste" id="alle-liste">
${aaHtml}${dorHtml}
    </ul>
    <p class="ingen-treff" id="ingen-treff" hidden>${esc(t("Ingen spill passer akkurat det. Prøv et annet søkeord, et annet antall eller en annen type."))}</p>
  </section>
  <dialog class="dialog" id="dialog" aria-labelledby="dialog-tittel"></dialog>
  <dialog class="dialog automat" id="automat" aria-labelledby="automat-tittel"></dialog>

  <section class="slik" aria-labelledby="slik-tittel">
    <h2 id="slik-tittel">${esc(t("Så enkelt er det"))}</h2>
    <p class="slik-slagord">${esc(t("Spill for hele gjengen."))} <em>${esc(t("Rett i nettleseren."))}</em></p>
    <ul class="slik-fakta" aria-label="${esc(t("Om rusj"))}">
      <li>${U.th("{antall} spill", { antall: `<b>${kortListe.length}</b>` }, { n: kortListe.length })}</li><li>${U.th("{null} kr", { null: "<b>0</b>" })}</li><li>${U.th("{null} reklame", { null: "<b>0</b>" })}</li><li>${U.th("{ingen} konto", { ingen: `<b>${esc(t("Ingen"))}</b>` })}</li>
    </ul>
    <ol class="slik-steg">
      <li><b>${esc(t("Velg et spill"))}</b><span>${esc(t("Alt er gratis og klart med en gang."))}</span></li>
      <li><b>${esc(t("Skriv inn navnene"))}</b><span>${esc(t("Én gang. Alle spillene husker gjengen din."))}</span></li>
      <li><b>${esc(t("Send mobilen rundt"))}</b><span>${esc(t("Eller bruk hver sin mobil i spillene som har det."))}</span></li>
    </ol>
  </section>

  <section class="gjengen" id="gjengen" aria-labelledby="gjengen-tittel">
    <span class="gjengen-figur" aria-hidden="true">${bilde("skravla")}</span>
    <div>
      <h2 id="gjengen-tittel">${esc(t("Få med gjengen"))}</h2>
      <p>${esc(t("Vis QR-koden på mobilen din, så er alle med på sekunder."))}</p>
      <button class="knapp-2 liten" id="send-rusj" type="button" aria-haspopup="dialog" data-qr="${felles.qr}"><span aria-hidden="true">📣</span> ${esc(t("Send rusj til gjengen"))}</button>
    </div>
  </section>

  <section class="installer" id="installer" aria-labelledby="installer-tittel">
    <span class="installer-figur" aria-hidden="true">${bilde("panna")}</span>
    <div>
      <h2 id="installer-tittel">${esc(t("Ha rusj på hjemskjermen"))}</h2>
      <p id="installer-tekst">${esc(t("Åpne delingsmenyen i nettleseren og velg «Legg til på Hjem-skjerm». Da starter rusj som en app – og spillene virker uten nett."))}</p>
      <button class="knapp-2 liten" id="installer-knapp" type="button" hidden>${esc(t("Installer rusj"))}</button>
    </div>
  </section>
</main>
${bunn(U, false, (V) => V.forside)}
</body>
</html>
`;
    skriv(U.sprak === "nb" ? "index.html" : `${U.sprak}/index.html`, portalSide);
  }

  // ---------- Pages about rusj: /personvern/ and /om/ (in every edition) ----------
  const SIDER_OPPDATERT = "2026-11-16";
  const merkebokJs = skriv("felles/merkebok.js", kilde("rusj/portal/merkebok.js"));
  const datoTekst = (iso, U) =>
    U.sprak === "nb"
      ? `${Number(iso.slice(8))}. ${["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
      : new Intl.DateTimeFormat(U.lokale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
  // The public contact details, confirmed by the owner 2026-11-10. With an empty KONTAKT the pages
  // leave the contact line out.
  const KONTAKT = "rusj@odkdigital.no";
  const POSTADRESSE = ""; // the owner wants only the e-mail address shown
  const epost = KONTAKT ? `<a href="mailto:${KONTAKT}">${KONTAKT}</a>` : "";
  const omSide = (U, o) => `${hodeMed({ sprak: U.sprak, alternativer: o.finn ? alternativer(o.finn) : [], tittel: o.tittel, ogTittel: o.ogTittel, beskrivelse: o.beskrivelse, sti: o.sti, ikon: ikoner.svg, deling: delingFor(U), delingAlt: U.t("rusj – gratis spill og selskapsleker på norsk"), css: [felles.css, portalCss, ...(o.css || [])], skript: o.skript ? [].concat(o.skript) : [], jsonld: o.jsonld })}
<body class="portal${o.klasse ? " " + o.klasse : ""}">
<div class="scene" aria-hidden="true"></div>
${FLAGG}
<header class="side-topp"><a class="side-hjem" href="${U.forside}" aria-label="${esc(U.t("rusj – til alle spillene"))}">${G.logo()}</a>${sprakvelger(U, o.finn)}</header>
<main class="side">
  <p class="side-sti"><a href="${U.forside}">${esc(U.t("Alle spill"))}</a> <span aria-hidden="true">›</span> ${esc(o.navn)}</p>
${o.innhold}
</main>
${bunn(U, true, o.finn)}
</body>
</html>
`;
  for (const U of Object.values(UTGAVE)) {
    const t = U.t;
    const th = U.th;
    const lokal_ = (s) => `<span lang="en">${s}</span>`;
    const pvTelling = `

  <section aria-labelledby="pv-telling">
    <h2 id="pv-telling">${esc(t("Anonym telling"))}</h2>
    <p>${esc(t("For å vite om rusj blir brukt, teller vi anonymt. Nettleseren sender noen korte ord fra en fast liste, for eksempel «en side ble åpnet: Ordugla», «et spill ble startet» eller «var her også i går». Vi lagrer bare summen per dag, for eksempel «i går ble Ordugla startet 214 ganger»."))}</p>
    <ul>
      <li>${th("{tittel} hvilke sider og spill som åpnes, startes og spilles ferdig, om nettleseren var innom i går, siste uke, lenger siden eller aldri før, om rusj er åpnet fra hjemskjermen, omtrent hvor lenge et besøk varer (under 1, 1–3, 3–10, 10–30 eller over 30 minutter), og hvor mange av dagens oppgaver som er løst og hvor mange dager på rad (i grupper).", { tittel: `<b>${esc(t("Det som telles:"))}</b>` })}</li>
      <li>${th("{tittel} hvilken utgave av rusj som brukes (norsk, engelsk eller dansk), om det er en mobil, et nettbrett eller en PC, og om besøket kom fra en søkemotor, et sosialt medium, en annen nettside eller uten lenke – bare gruppen, aldri adressen du kom fra. Nettleseren avgjør dette selv og sender bare ordet. Vi teller også når et spill får en feil (bare hvilket spill), første gang rusj åpnes fra hjemskjermen, rom og kamper når dere spiller på nett (på mobilen som lager rommet), og knappene i julekalenderen (skriv ut, påminnelse og juletreet).", { tittel: `<b>${esc(t("Også telles, som summer per dag:"))}</b>` })}</li>
      <li>${th("{tittel} navn, det dere skriver, svar, poeng, klokkeslett, adressen du kom fra eller detaljer om enheten din (bare om det er en mobil, et nettbrett eller en PC). Det finnes ingen ID, ingen informasjonskapsler og ingen måte å følge én person fra dag til dag.", { tittel: `<b>${esc(t("Det som ikke telles:"))}</b>` })}</li>
      <li>${th("{tittel} tallene lagres hos Cloudflare, i en database som ligger i EU. Når nettleseren sender, ser Cloudflare IP-adressen din, slik alle nettsteder gjør, men vi lagrer den ikke og har slått av loggene. Tall eldre enn 25 måneder slettes.", { tittel: `<b>${esc(t("Hvor:"))}</b>` })}</li>
      <li>${th("{tittel} har du slått på «Ikke spor» ({dnt} eller {gpc}) eller datasparing i nettleseren, sender rusj ingenting.", { tittel: `<b>${esc(t("Slik slår du det av:"))}</b>`, dnt: lokal_("Do Not Track"), gpc: lokal_("Global Privacy Control") })}</li>
    </ul>
  </section>`;
    // «Spill på nett» (nett/README.md): only when NETT_ADRESSE is set.
    const pvSpillNett = `

  <section aria-labelledby="pv-spill-nett">
    <h2 id="pv-spill-nett">${esc(t("Spill på nett"))}</h2>
    <p>${esc(t("Noen spill kan dere spille sammen på hver deres mobil, fra hvert deres sted: én lager et rom og sender en lenke. Da går trekkene gjennom en liten tjeneste vi har laget, slik at alle mobilene får dem i samme rekkefølge. Det skjer bare når dere selv velger «Spill med en venn på nett»."))}</p>
    <ul>
      <li>${th("{tittel} trekkene dere gjør, et kallenavn (det første navnet som er skrevet inn i spillene på mobilen din, om det finnes – du kan endre det når du blir med), koden til rommet og et tilfeldig plassmerke, så mobilen din kommer inn igjen hvis nettet faller ut. Reaksjonene er seks faste emojier. I spillene der dere skriver egne svar, kan et trekk også være et kort svar eller hint (høyst 60 tegn) – de andre i rommet ser det, så skriv ikke noe privat.", { tittel: `<b>${esc(t("Det som sendes:"))}</b>` })}</li>
      <li>${th("{tittel} hos Cloudflare. Rommene er låst til EU, og innholdet deres lagres bare der. Cloudflare skriver rommets tilfeldige ID i sine logger for fakturering, også utenfor EU; ID-en sier ingenting om hvem som spiller.", { tittel: `<b>${esc(t("Hvor:"))}</b>` })}</li>
      <li>${th("{tittel} alt i rommet slettes 24 timer etter siste trekk, og med én gang når alle har gått fra en ferdig kamp.", { tittel: `<b>${esc(t("Hvor lenge:"))}</b>` })}</li>
      <li>${th("{tittel} ingen konto, ingen chat og ingen fritekst utenom kallenavnet og de korte svarene og hintene i spillene der dere skriver selv, og vi logger ikke IP-adressen din. Når mobilen kobler til, ser Cloudflare IP-adressen i det øyeblikket, slik alle nettsteder gjør, men vi lagrer den ikke og har slått av loggene.", { tittel: `<b>${esc(t("Det som ikke finnes:"))}</b>` })}</li>
    </ul>
    <p>${esc(t("På mobilen din lagres koden til rommet og plassmerket mens kampen varer. I Admiralen blir skipene dine på din mobil: den andre får bare vite «bom», «treff» eller «senket», og ser hele flåten først når kampen er slutt."))}</p>
  </section>`;
    skriv(
      `${U.side("personvern").slice(1)}index.html`,
      omSide(U, {
        sti: U.side("personvern"),
        finn: sideSti("personvern"),
        navn: t("Personvern"),
        tittel: t("Personvern – hva rusj lagrer på enheten din") + " | rusj",
        ogTittel: t("Personvern på rusj"),
        beskrivelse: t("rusj har ingen konto, ingen informasjonskapsler, ingen sporing og ingen reklame. Se nøyaktig hva som lagres i nettleseren din – og slett alt med ett trykk."),
        skript: portalSkript(U, siderJs),
        innhold: `  <h1>${esc(t("Personvern"))}</h1>
  <p class="side-ingress">${esc(t("Kort sagt: rusj har ingen konto, ingen informasjonskapsler, ingen sporing og ingen reklame. Det dere skriver inn i spillene, blir i nettleseren på enheten deres."))}${STAT_FIL ? " " + esc(t("Vi teller bare anonymt hvor mange som bruker rusj, og hvilke spill som åpnes.")) : ""}${NETT ? " " + esc(t("Spiller dere sammen på nett, går bare trekkene og et kallenavn dere velger selv via rusj (se «Spill på nett»).")) : ""}</p>

  <section aria-labelledby="pv-lagres">
    <h2 id="pv-lagres">${esc(t("Dette lagres i nettleseren din"))}</h2>
    <p>${th("For at spillene skal virke, bruker rusj nettleserens egen lagring på enheten ({ls}). Det er ikke informasjonskapsler, og ingenting av det sendes til oss:", { ls: lokal_("localStorage") })}</p>
    <ul>
      <li>${th("{tittel} dere skriver inn, så dere slipper å skrive dem på nytt i neste spill.", { tittel: `<b>${esc(t("Navn"))}</b>` })}</li>
      <li>${th("{tittel} lyd av eller på, filteret du valgte på forsiden, svaret på «18 år eller eldre?» og om du har sett eller lukket et tips.", { tittel: `<b>${esc(t("Innstillinger:"))}</b>` })}</li>
      <li>${th("{tittel} runden dere holder på med, så dere kan fortsette der dere slapp – også det dere har skrevet eller tegnet underveis, egne regler og en nissetrekning. I tillegg hvilke kort som er brukt, rekorder, hvilke av dagens oppgaver du har løst, og kveldens poengtavle.", { tittel: `<b>${esc(t("Spill:"))}</b>` })}</li>${
          STAT_FIL
            ? `
      <li>${th("{tittel} hvilken dag du sist var innom og hvor lenge besøket har vart. Da kan nettleseren selv si «var her i går» uten at vi får vite hvem du er.", { tittel: `<b>${esc(t("Telling:"))}</b>` })}</li>`
            : ""
        }
      <li>${th("{tittel} hvilke klistremerker du har samlet og hvilken dag, og hvilke spill du har prøvd – så boka vet hva som mangler.", { tittel: `<b>${esc(t("Klistremerker:"))}</b>` })}</li>${
        KAFFE[U.sprak] && KAFFE[U.sprak].lenke
          ? `
      <li>${th("{tittel} hvor mange spill du har spilt ferdig, og om du har trykket «Spander en kaffe» – så spørsmålet kommer bare hvert 20. spill, og aldri igjen etter at du har spandert.", { tittel: `<b>${esc(t("Kaffe:"))}</b>` })}</li>`
          : ""
      }
    </ul>
    <p>${esc(t("Alt dette ligger bare i denne nettleseren på denne enheten."))} ${esc(STAT_FIL ? t("Ingenting av det sendes til oss, og vi kan ikke se det.") : t("Vi har ingen server som tar imot det, og vi kan ikke se det."))}</p>
  </section>${STAT_FIL ? pvTelling : ""}${NETT ? pvSpillNett : ""}

  <section aria-labelledby="pv-mikrofon">
    <h2 id="pv-mikrofon">${esc(t("Mikrofonen"))}</h2>
    <p>${esc(t("Noen spill, som Kassetten, tar opp stemmen din et lite øyeblikk. Mobilen spør om lov først, og bare når du trykker «Ta opp». Opptaket ligger bare i minnet på mobilen mens turen varer, og slettes etter turen og når du lukker siden. Det lagres aldri og sendes ingen steder – heller ikke til oss."))}</p>
  </section>

  <section aria-labelledby="pv-nett">
    <h2 id="pv-nett">${esc(t("Spillene lastes ned for bruk uten nett"))}</h2>
    <p>${esc(t("Når du åpner rusj, lagrer nettleseren en kopi av siden du er på. Resten av spillene lastes ned litt etter litt mens mobilen står i ro (ikke på svært tregt nett eller med datasparing på), slik at de virker også uten nett. Kopien byttes ut når spillene oppdateres."))}</p>
  </section>

  <section aria-labelledby="pv-vert">
    <h2 id="pv-vert">${esc(t("Dette ser nettverten"))}</h2>
    <p>${esc(t("rusj.no ligger hos GitHub Pages, en tjeneste fra det amerikanske selskapet GitHub. Som hos alle nettsteder får nettverten vanlige forespørselslogger når en side hentes: IP-adressen din, tidspunktet, hvilken side det gjaldt og hva slags nettleser du bruker. Dette behandles utenfor EU/EØS. Vi har ikke tilgang til loggene og bruker dem ikke til noe."))}</p>
  </section>

  <section aria-labelledby="pv-ikke">
    <h2 id="pv-ikke">${esc(t("Dette finnes ikke på rusj"))}</h2>
    <ul>
      <li>${esc(t("Ingen konto og ingen innlogging."))}</li>
      <li>${esc(t("Ingen informasjonskapsler (cookies)."))}</li>
      <li>${esc(STAT_FIL ? t("Ingen sporing av enkeltpersoner. Vi teller bare anonyme tall per dag (se «Anonym telling»).") : t("Ingen sporing, statistikk eller måling av hva du gjør."))}</li>
      <li>${esc(t("Ingen reklame, og ingenting som hentes fra andre nettsteder."))}</li>
    </ul>
  </section>

  <section aria-labelledby="pv-deler">
    <h2 id="pv-deler">${esc(t("Det du deler selv"))}</h2>
    <p>${esc(t("Noen spill lar deg dele en kode, en lenke eller et resultat. Det sendes bare dit du selv sender det, i den appen du velger. En invitasjon inneholder det mottakeren trenger for å bli med – i en nisselenke også navn fra trekningen."))}</p>
  </section>

  <section class="side-slett" aria-labelledby="pv-slett">
    <h2 id="pv-slett">${esc(t("Slett alt"))}</h2>
    <p>${esc(t("Knappen fjerner alt rusj har lagret i denne nettleseren: navn, innstillinger, spill som pågår, rekorder og den nedlastede kopien av spillene. Det kan ikke angres."))}</p>
    <p class="side-status" id="slett-status" role="status" aria-live="polite"></p>
    <button type="button" class="knapp rod" id="slett-alt">${esc(t("Slett alt rusj har lagret på denne enheten"))}</button>
    <noscript><p class="side-liten">${esc(t("Knappen trenger JavaScript."))}</p></noscript>
    <p class="side-liten">${esc(t("Du kan også slette nettstedsdata for rusj.no i innstillingene til nettleseren. Bruker du rusj igjen etterpå, lagres det som trengs på nytt – også kopien av spillene for bruk uten nett."))}</p>
  </section>

  <section aria-labelledby="pv-kontakt">
    <h2 id="pv-kontakt">${esc(t("Spørsmål?"))}</h2>
    ${KONTAKT ? `<p>${th("Kontakt: {epost}.", { epost: epost + (POSTADRESSE ? ` eller rusj, ${esc(POSTADRESSE)}` : "") })} ${esc(t("Skriver du til oss, bruker vi e-postadressen din bare til å svare deg."))}</p>` : ""}
    <p class="side-liten">${esc(t("Sist oppdatert {dato}.", { dato: datoTekst(SIDER_OPPDATERT, U) }))}</p>
  </section>
  <dialog class="dialog" id="dialog" aria-labelledby="dialog-tittel"></dialog>`,
      }),
    );
    const antallKort = U.kort.length;
    skriv(
      `${U.side("om").slice(1)}index.html`,
      omSide(U, {
        sti: U.side("om"),
        finn: sideSti("om"),
        navn: t("Om rusj"),
        tittel: t("Om rusj – hva det er, hvem det er for, og kontakt") + " | rusj",
        ogTittel: t("Om rusj"),
        beskrivelse: t("rusj er {n} gratis spill og selskapsleker på norsk, rett i nettleseren – for venner, familier og klasser. Uten app, konto og reklame. Slik når du oss.", { n: antallKort }),
        innhold: `  <h1>${esc(t("Om rusj"))}</h1>
  <p class="side-ingress">${esc(t("rusj er {n} gratis spill og selskapsleker på norsk, rett i nettleseren. Ingen app å laste ned, ingen konto og ingen reklame.", { n: antallKort }))}</p>

  <section aria-labelledby="om-hva">
    <h2 id="om-hva">${esc(t("Hva er rusj?"))}</h2>
    <p>${esc(
      U.sprak === "nb"
        ? "En samling spill for kvelder med folk rundt bordet: selskapsleker som går på rundgang på én mobil, quiz, tegneleker og ordspill – og klassikere som sudoku, kabal, yatzy og dagens ord når du er alene. Alt er på norsk, laget for mobilen, og virker uten nett når spillene først er lastet ned." // sprak-ok: names the Norwegian games
        : t("Spill for kvelder med folk rundt bordet og for stunder alene, laget for mobilen. rusj er laget i Norge; her er spillene som allerede finnes på dette språket, og flere kommer. Når spillene først er lastet ned, virker de uten nett."),
    )}</p>
  </section>

  <section aria-labelledby="om-hvem">
    <h2 id="om-hvem">${esc(t("Hvem er det for?"))}</h2>
    <p>${esc(t("Venner, familier, kolleger og klasser. De fleste spillene passer for alle aldre, og flere er laget for barn. Skriv inn navnene én gang, så husker spillene gjengen."))}</p>
    <p>${th("For foreldre og lærere: rusj har ingen konto, ingen reklame og ingen chat, og det barna skriver inn, blir på enheten. Les mer under {lenke}.", { lenke: `<a href="${U.side("personvern")}">${esc(t("personvern"))}</a>` })}</p>
  </section>
${
  U.antall18
    ? `
  <section aria-labelledby="om-18">
    <h2 id="om-18">${esc(t("Drikkelekene (18+)"))}</h2>
    <p>${esc(t("{n} av spillene er drikkeleker for voksne. De er skjult til noen har bekreftet at de er 18 år eller eldre, og kan skjules igjen fra forsiden.", { n: U.antall18 }))}</p>
    <p>${esc(t("Drikk med vett: alkoholfritt teller like mye, ingen skal presses, og vann er alltid lov. Pass på hverandre – og ring 113 hvis noen trenger akutt hjelp."))}</p>
  </section>
`
    : ""
}
  <section aria-labelledby="om-kontakt">
    <h2 id="om-kontakt">${esc(t("Kontakt"))}</h2>
    ${KONTAKT ? `<p>${th("Kontakt: {epost}.", { epost: epost + (POSTADRESSE ? ` eller rusj, ${esc(POSTADRESSE)}` : "") })} ${esc(t("Si gjerne fra om feil, eller foreslå et spill."))}</p>` : ""}
  </section>`,
      }),
    );

    // ---------- «Klistremerkeboka»: /merker/ ----------
    // The whole album is drawn here: every sticker as a soft silhouette with how to get it.
    // /felles/merkebok.js colours the ones this phone has earned (rusj.merker) and adds the dates.
    const VRI = [-5, 4, -2, 6, -6, 3, -3, 5];
    const kat = U.merker;
    const antallMerker = kat.merker.length;
    const album = kat.grupper
      .map((g) => {
        const liste = kat.merker.filter((mk) => mk.gruppe === g.id);
        return `  <section class="bok-gruppe" aria-labelledby="bok-${g.id}" style="--gf: ${g.farge}">
    <div class="bok-gruppe-topp"><h2 id="bok-${g.id}">${esc(g.navn)}</h2><span class="bok-gruppe-antall" data-gruppe="${g.id}">${liste.length}</span></div>
    <p class="bok-gruppe-tekst">${esc(g.tekst)}</p>
    <ul class="bok-ark">
${liste
  .map(
    (mk, i) => `      <li class="bok-merke" data-merke="${mk.id}" style="--vri: ${VRI[i % VRI.length]}deg">
        ${RusjMerkerTegn(mk)}
        <span class="bok-navn">${esc(mk.navn)}</span>
        <span class="bok-hvordan">${esc(mk.hvordan)}</span>
        <span class="bok-dato" hidden></span>
      </li>`,
  )
  .join("\n")}
    </ul>
  </section>`;
      })
      .join("\n");
    skriv(
      `${U.side("merker").slice(1)}index.html`,
      omSide(U, {
        sti: U.side("merker"),
        finn: sideSti("merker"),
        navn: t("Klistremerkeboka"),
        tittel: t("Klistremerkeboka – samle klistremerker på rusj") + " | rusj",
        ogTittel: t("Klistremerkeboka på rusj"),
        beskrivelse:
          U.sprak === "nb"
            ? `${antallMerker} klistremerker å samle på rusj: for dagens oppgaver, spillekvelder, nye spill og seier mot mobilen. Boka lagres bare på enheten din.` // sprak-ok: the Norwegian book has the daily puzzles
            : t("Samle klistremerker på rusj: for spillekvelder, nye spill og seier mot mobilen – {n} så langt. Boka lagres bare på enheten din, og ingen konto trengs.", { n: antallMerker }),
        skript: portalSkript(U, U.merkerJs, merkebokJs),
        klasse: "bok",
        innhold: `  <h1>${esc(t("Klistremerkeboka"))}</h1>
  <p class="side-ingress">${esc(t("Et klistremerke for hver ting du har klart. Det er ingen hast – samle i ditt eget tempo."))}</p>
  <div class="bok-status">
    <p class="bok-telling">${th("{antall} av {alle} {ord}", { antall: '<b id="bok-antall">0</b>', alle: String(antallMerker), ord: `<span>${esc(t("klistremerker"))}</span>` })}</p>
    <div class="bok-mal" role="progressbar" aria-label="${esc(t("Klistremerker samlet"))}" aria-valuemin="0" aria-valuemax="${antallMerker}" aria-valuenow="0" id="bok-mal"><i id="bok-mal-fyll"></i></div>
    <p class="bok-tom" id="bok-tom">${esc(t("Boka er tom ennå. Spill et spill, så kommer det første klistremerket."))}</p>
    <button type="button" class="knapp-2 liten" id="bok-del"><span aria-hidden="true">📣</span> ${esc(t("Del boka"))}</button>
    <p class="bok-delt" id="bok-delt" role="status" aria-live="polite"></p>
  </div>
${album}
  <p class="side-liten bok-fot">${esc(t("Klistremerkene lagres bare i nettleseren på denne enheten. Ingen ser dem uten at du deler."))}</p>`,
      }),
    );
  }

  // ---------- Collections: /julebordleker/, /spill-for-to/ … (rusj/samlinger, scripts/samlinger.mjs) ----------
  // A hand-written page per occasion or kind of game, with the games that fit and why. The 18+ hub
  // only names the drinking games and links to their rules; every game keeps its own age gate.
  // Norwegian only (rusj/SPRAK.md).
  const samlingCss = samlinger.length ? skriv("felles/samling.css", kilde("rusj/samlinger/samling.css")) : null;
  const spillAv = new Map(alleSpillKort.map((g) => [g.id, g]));
  const fraseAv = (g) => {
    const f = sokedata(g).frase;
    return merkeSynlig(f) ? g.undertittel : f;
  };
  for (const s of samlinger) {
    skriv(
      `${s.slug}/index.html`,
      omSide(NB, {
        sti: `/${s.slug}/`,
        navn: s.navn,
        tittel: `${s.tittel} | rusj`,
        ogTittel: s.alder18 && !s.h1.includes("18+") ? `${s.h1} (18+)` : s.h1,
        beskrivelse: s.beskrivelse,
        css: [samlingCss],
        klasse: "samling",
        jsonld: samlingJsonLd(s, { domene: DOMENE, spill: spillAv, utgiver: UTGIVER }),
        innhold: samlingInnhold(s, { spill: spillAv, frase: fraseAv, figur: (id) => G.svg(id), naboer: (n) => samlinger.find((x) => x.slug === n), rusinfo: RUSINFO }),
      }),
    );
  }

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
  ${sprakvalg(NB, null)}
</main>
</body>
</html>
`,
  );

  // ---------- Old addresses of renamed games ----------
  // A tiny page that sends the visitor on (meta refresh, no script under the CSP), points search
  // engines to the new address and is left out of the sitemap and the offline list.
  for (const [gammel, ny] of Object.entries(OMDOPT)) {
    const m = spill.find((x) => x.id === ny);
    if (!m) continue;
    skriv(`${gammel}/index.html`, videresendSide(m, `Spillet heter nå ${m.navn}.`));
  }

  // ---------- Alias addresses: /jeg-har-aldri/ → /sladrehanken/ (`alias` in spill.json) ----------
  // Checked against every game, collection and page (also in a partial build); written for the
  // games in this build. The same small page as above, out of the sitemap and the offline list.
  const alias = aliasKart({
    spill: alleSpillKort, // (Luringen's aliases are checked whenever Luringen is in the build)
    opptatt: [...FASTE_STIER, ...SPRAK, ...Object.keys(OMDOPT), ...samlinger.map((x) => x.slug)],
    merke: merkeSynlig,
  });
  const iBygget = new Map([...(luringen ? [luringen] : []), ...spill].map((g) => [g.id, g]));
  for (const [a, id] of alias) if (iBygget.has(id)) skriv(`${a}/index.html`, videresendSide(iBygget.get(id), ""));

  // ---------- /admin/: on to the owner's numbers (only with the statistics switched on) ----------
  if (STAT_FIL) for (const forran of ["", ...SPRAK.map((s) => s + "/")]) skriv(`${forran}admin/index.html`, adminVideresending());

  // ---------- /lab/baklengs/: the owner's test of recording a word and playing it backwards ----------
  // Under the same Content-Security-Policy as the games, so the test tells the truth. Not linked,
  // not indexed, not in the sitemap or the offline list. The recording never leaves the phone.
  if (existsSync(join(ROT, "rusj/lab/baklengs.html"))) {
    const skript = kopier(join(ROT, "rusj/lab/baklengs.js"), "lab/baklengs/baklengs.js");
    skriv("lab/baklengs/index.html", kilde("rusj/lab/baklengs.html").replace("%CSP%", CSP).replace("%SKRIPT%", skript));
  }

  // ---------- Manifest (one per edition), favicon, robots, sitemap ----------
  // Shortcuts (long press on the app icon): the three daily puzzles and «Overrask meg». Only games
  // that are in this build. No `orientation`: the games lay themselves out on a phone on its side.
  // (No `screenshots` yet: they need images made for the purpose and committed in rusj/bilder.)
  const snarvei = (navn, beskrivelse, url, ikon) => ({ name: navn, description: beskrivelse, url, icons: [{ src: ikon, sizes: "any", type: "image/svg+xml" }] });
  for (const U of Object.values(UTGAVE)) {
    const t = U.t;
    const finnSpill = (id) => U.spill.find((m) => m.id === id);
    const snarveier = [
      finnSpill("ordugla") && snarvei(t("Dagens ord"), t("Gjett dagens ord på fem bokstaver"), finnSpill("ordugla").url, `${finnSpill("ordugla").url}ikon.svg`),
      finnSpill("blyanten") && snarvei(t("Dagens kryss"), t("Løs dagens lille kryssord"), finnSpill("blyanten").url, `${finnSpill("blyanten").url}ikon.svg`),
      finnSpill("tallknuseren") && snarvei(t("Sudoku"), t("Dagens sudoku, eller så mange du vil"), finnSpill("tallknuseren").url, `${finnSpill("tallknuseren").url}ikon.svg`),
      ikoner.svg && snarvei(t("Overrask meg"), t("La rusj velge et spill"), `${U.forside}#overrask`, ikoner.svg.split("?")[0]),
    ].filter(Boolean);
    skriv(
      U.sprak === "nb" ? "manifest.webmanifest" : `${U.sprak}/manifest.webmanifest`,
      JSON.stringify(
        {
          id: U.forside,
          name: t("rusj – spill for hele gjengen"),
          short_name: "rusj",
          description: t("Gratis spill og selskapsleker på norsk, rett i nettleseren."),
          lang: U.sprak,
          dir: "ltr",
          categories: ["games", "entertainment"],
          start_url: U.forside,
          scope: U.forside,
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
  }
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
  // sitemap.xml: every page with the date it last changed (the last commit that touched its source),
  // and the same page in the other editions (hreflang), as in the page's own <head>.
  const datoer = sistEndret(ROT);
  const iDag = new Date().toISOString().slice(0, 10);
  const nyeste = (...d) => d.filter(Boolean).sort().pop() || iDag;
  const spillDato = (m) => (m.id === "luringen" ? nyeste(datoer.get("src"), datoer.get("data")) : nyeste(datoer.get(`rusj/spill/${m.id}`)));
  const sprakDato = (U) => (U.sprak === "nb" ? null : nyeste(datoer.get(`rusj/kit`), datoer.get(`rusj/seo.${U.sprak}.json`)));
  const sider = []; // [path, date, alternatives]
  for (const U of Object.values(UTGAVE)) {
    sider.push([U.forside, nyeste(datoer.get("rusj/portal"), datoer.get("rusj/seo.json"), sprakDato(U), ...U.kort.map(spillDato)), alternativer((V) => V.forside)]);
    for (const m of U.kort) sider.push([m.url, nyeste(spillDato(m), sprakDato(U)), m.id === "luringen" ? [] : alternativer(spillSti(m.id))]);
    sider.push([U.side("om"), nyeste(SIDER_OPPDATERT, sprakDato(U)), alternativer(sideSti("om"))]);
    sider.push([U.side("personvern"), nyeste(SIDER_OPPDATERT, sprakDato(U)), alternativer(sideSti("personvern"))]);
    sider.push([U.side("merker"), nyeste(datoer.get("rusj/merker.json"), sprakDato(U)), alternativer(sideSti("merker"))]);
    if (U.sprak === "nb") sider.push(...samlinger.map((s) => [`/${s.slug}/`, nyeste(datoer.get("rusj/samlinger"), ...s.spill.map(([id]) => spillAv.get(id)).filter(Boolean).map(spillDato)), []]));
  }
  const medAlt = sider.some(([, , a]) => a.length);
  skriv(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${medAlt ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ""}>\n${sider
      .map(([sti, dato, alt]) => `  <url><loc>${DOMENE}${sti}</loc><lastmod>${dato}</lastmod>${alt.map(([l, a]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${DOMENE}${a}"/>`).join("")}</url>`)
      .join("\n")}\n</urlset>\n`,
  );

  return {
    spill,
    filer,
    // What the service worker keeps for playing without a connection: every page, the front page
    // first, then the games in front-page order (Norwegian first, then each edition). Which files a
    // page needs, the worker reads from the page itself (every address with ?v=), so there is no
    // second list to keep in step. It fetches ahead only the pages of the editions a visitor uses.
    sider: Object.values(UTGAVE).flatMap((U) => [U.forside, ...U.kort.map((m) => m.url), U.side("om"), U.side("personvern"), U.side("merker"), ...(U.sprak === "nb" ? samlinger.map((s) => `/${s.slug}/`) : [])]),
    manifester: Object.values(UTGAVE).map((U) => `${U.forside}manifest.webmanifest`),
  };
}

// The mascot alone, as an SVG file of its own (sprak: the words in the drawing). Self-contained: the
// mascots draw with attributes only, never with the page's styles.
export function figurSvg(G, id, sprak) {
  const svg = G.svg(id, sprak ? { sprak } : undefined).replace(/>\s+</g, "><");
  const boks = /^<svg [^>]*?(viewBox="[^"]+")[^>]*>/.exec(svg);
  if (!boks) throw new Error(`gjengen.js: figuren «${id}» har ingen viewBox`);
  return `<svg xmlns="http://www.w3.org/2000/svg" ${boks[1]}>` + svg.slice(boks[0].length) + "\n";
}

// Square icon with the game's mascot on the night background (sprak: the words in the drawing).
export function ikonSvg(G, id, sprak) {
  const fig = G.svg(id, sprak ? { sprak } : undefined).replace(/^<svg [^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><radialGradient id="g" cx="50%" cy="18%" r="80%"><stop offset="0" stop-color="#4a2b80"/><stop offset=".55" stop-color="#21143d"/><stop offset="1" stop-color="#150c28"/></radialGradient></defs><rect width="512" height="512" rx="116" fill="url(#g)"/><g transform="translate(85 96) scale(2.85)">${fig}</g></svg>`;
}
