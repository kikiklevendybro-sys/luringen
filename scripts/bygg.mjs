#!/usr/bin/env node
// Builds rusj.no without any dependencies:
//   build/ord.json        merged Norwegian word list (used by the tests and several games); the
//                         English and Danish banks (data/kategorier.en, .da) go to the website only
//   dist/web/             the website: front page, /luringen/, one folder per rusj game, offline support
//   dist/luringen.html    Luringen as one page without <html>/<head> (for the Claude artifact)
// Options: --ut <dir> (build somewhere else), --spill id1,id2 (only these games),
//          --topp <file> (another «Mest spilt nå» list than rusj/topp.json; for tests),
//          --sw-av (emergency: publish a service worker that removes itself; the same happens
//          when the file rusj/SW-AV exists, so the brake can be pulled with a commit – rusj/DRIFT.md)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, readdirSync } from "node:fs";
import { byggRusj, esc, hode as lagHode, lesSeo, seoFor, spillJsonLd, DOMENE } from "./rusj.mjs";
import { ALLE_SPRAK, SPRAK_INFO, lagSprak, lesTabell } from "./sprak.mjs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { hashTekst } = require(join(ROT, "src/kjerne.js"));

// Fixed order: it decides the category bits in join codes, so new categories go at the end.
const REKKEFOLGE = [
  "mat", "frukt", "snacks", "kjokken", "dyr", "hav", "natur", "planter",
  "hjemme", "verktoy", "klaer", "kropp", "yrker", "skole", "byen", "transport",
  "sport", "hobby", "musikk", "spill", "norge", "steder", "land", "reise",
  "eventyr", "film", "hoytid", "historie", "teknologi", "rommet", "handlinger", "abstrakt",
];

// ---------- Words ----------
// One bank per edition, checked by the same rules: data/kategorier (Norwegian – also Luringen's and
// build/ord.json), data/kategorier.en and data/kategorier.da (rusj/SPRAK.md). Same ids, same order.

function lesOrdbank(mappe, lokale) {
  const kategorier = [];
  const sett = new Map();
  const duplikater = [];
  const mangler = [];
  const navn = mappe === "data/kategorier" ? "" : `${mappe}/`;
  for (const id of REKKEFOLGE) {
    const fil = join(ROT, mappe, `${id}.json`);
    if (!existsSync(fil)) {
      mangler.push(id);
      continue;
    }
    const kat = JSON.parse(readFileSync(fil, "utf8"));
    if (kat.id !== id) throw new Error(`${fil}: id "${kat.id}" matcher ikke filnavnet`);
    const ord = [];
    for (const e of kat.ord) {
      if (![1, 2, 3].includes(e.n) || !e.o || !e.h || !e.l) throw new Error(`${navn}${id}: ugyldig oppføring ${JSON.stringify(e)}`);
      const nokkel = e.o.trim().toLocaleLowerCase(lokale);
      if (sett.has(nokkel)) {
        duplikater.push(`${e.o} (${id}, beholdt i ${sett.get(nokkel)})`);
        continue;
      }
      sett.set(nokkel, id);
      ord.push([e.o.trim(), e.n, e.h.trim(), e.l.trim()]);
    }
    kategorier.push({ id: kat.id, navn: kat.navn, ikon: kat.ikon, ord });
  }
  if (!kategorier.length) throw new Error(`Fant ingen ordlister i ${mappe}`);
  const data = { hash: hashTekst(JSON.stringify(kategorier)), kategorier };
  return { data, antall: kategorier.reduce((s, k) => s + k.ord.length, 0), duplikater, mangler };
}

const { data, antall, duplikater, mangler } = lesOrdbank("data/kategorier", "nb");
const { kategorier } = data;
// The other editions' banks. An edition without its folder has no bank, and its word-bank games are
// not published there (scripts/sprak.mjs).
const ordbanker = {};
for (const [sprak, lokale] of [["en", "en-GB"], ["da", "da"]]) {
  if (existsSync(join(ROT, `data/kategorier.${sprak}`))) ordbanker[sprak] = lesOrdbank(`data/kategorier.${sprak}`, lokale);
}

mkdirSync(join(ROT, "build"), { recursive: true });
writeFileSync(join(ROT, "build/ord.json"), JSON.stringify(data));

// ---------- Page ----------

const kilde = (fil) => readFileSync(join(ROT, "src", fil), "utf8");
// The "‹ rusj" button in Luringen's top bar uses the shared wordmark.
const RusjGjengen = require(join(ROT, "rusj/kit/gjengen.js"));
const side = kilde("page.html").replace("<!--RUSJLOGO-->", RusjGjengen.logo());
const [hode, kropp] = side.split("<!--KROPP-->");
if (!kropp) throw new Error("src/page.html mangler <!--KROPP-->");

const dataJs = "window.LURINGEN_DATA=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";";
function skript(nettside) {
  const deler = [nettside ? "window.LURINGEN_WEB=true;" : "", dataJs, kilde("kjerne.js"), kilde("qr.js"), kilde("ui.js")];
  const js = deler.join("\n");
  if (/<\/script/i.test(js)) throw new Error("Skriptet inneholder </script>");
  return js;
}
const fyll = (tekst, nettside) => tekst.replace("/*STIL*/", () => kilde("style.css")).replace("/*SKRIPT*/", () => skript(nettside));

// Single page for the artifact: content only, the host adds <html>, <head> and <body>.
mkdirSync(join(ROT, "dist"), { recursive: true });
// (Skipped when building into another folder with --ut, so parallel test builds don't touch dist/.)
const tilAnnenMappe = process.argv.includes("--ut");
if (!tilAnnenMappe) writeFileSync(join(ROT, "dist/luringen.html"), fyll(hode + kropp, false));

// ---------- Website: rusj.no ----------
// Options: --ut <dir> (default dist/web), --spill id1,id2 (only these games; for tests),
// --topp <file> (instead of rusj/topp.json; for tests)
const arg = (navn) => {
  const i = process.argv.indexOf(navn);
  return i > 0 ? process.argv[i + 1] : null;
};
const WEB = arg("--ut") ? resolve(arg("--ut")) : join(ROT, "dist/web");
const utvalg = arg("--spill") ? arg("--spill").split(",").map((s) => s.trim()).filter(Boolean) : null;
const toppFil = arg("--topp") ? resolve(arg("--topp")) : undefined;
rmSync(WEB, { recursive: true, force: true });
mkdirSync(WEB, { recursive: true });

// Luringen lives at /luringen/ with its script and styles as files (allowed by the CSP).
const LUR = join(WEB, "luringen");
mkdirSync(LUR, { recursive: true });
const lurCss = kilde("style.css");
const lurJs = skript(true);
const v = (t) => hashTekst(t).toString(36);
writeFileSync(join(LUR, "luringen.css"), lurCss);
writeFileSync(join(LUR, "luringen.js"), lurJs);
for (const fil of ["ikon.svg", "ikon-180.png", "ikon-192.png", "ikon-512.png", "ikon-maskerbar-512.png"]) {
  const fra = join(ROT, "src/ikoner", fil);
  if (existsSync(fra)) copyFileSync(fra, join(LUR, fil));
  else console.warn(`⚠ mangler src/ikoner/${fil} (kjør node scripts/lag-ikoner.mjs)`);
}
const lurDeling = join(ROT, "rusj/bilder/deling-luringen.png");
if (existsSync(lurDeling)) copyFileSync(lurDeling, join(LUR, "deling.png"));
const LURINGEN_KORT = {
  id: "luringen",
  navn: "Luringen",
  undertittel: "Finn bløfferen",
  kort: "Alle får det hemmelige ordet. Nesten alle.",
  spillere: [3, 10],
  alder: 8, // the lowest recommended age, as "alder" in a game's spill.json
  minutter: [10, 40],
  mobiler: "begge",
  tagger: ["fest", "blof", "ord", "familie"],
  farge: "#ff4f8b",
  rekkefolge: 1,
  // (as in a game's spill.json: an easy address that sends on to /luringen/)
  alias: ["imposter"],
  // Words for the front-page search (generic only; rusj/seo.json adds more).
  sok: ["imposter", "finn bløfferen", "hemmelig ord", "bløff", "bløffespill", "ordlek", "selskapslek"],
};
// Luringen's page gets the same <head> as every other page (title and description from
// rusj/seo.json, link preview, icons, structured data), so the two can never drift apart.
// Everything in the <head> of src/page.html is for the single-file version only.
const hodeRest = hode
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, "")
  .replace(/<title>[^<]*<\/title>\n?/, "")
  .replace(/<meta name="description"[^>]*>\n?/, "")
  .replace("<style>/*STIL*/</style>", "")
  .trim();
if (hodeRest) throw new Error("src/page.html: <head> har noe nettsiden ikke tar med: " + hodeRest.slice(0, 80));
const lurSeo = seoFor(lesSeo(ROT), LURINGEN_KORT);
const lurBilde = existsSync(lurDeling) ? "/luringen/deling.png" : null;
// Something to read before the script has drawn the home screen (and for those who never run it):
// the name as a heading and one sentence about the game. The script replaces it at once.
const tomHjem = '<section class="skjerm" id="s-hjem" aria-labelledby="t-hjem"></section>';
if (!kropp.includes(tomHjem) || !kropp.includes("<script>/*SKRIPT*/</script>")) throw new Error("Fant ikke plassholderne i src/page.html");
const webKropp = kropp
  .replace(tomHjem, () => `<section class="skjerm" id="s-hjem" aria-labelledby="t-hjem"><h1 id="t-hjem">Luringen</h1><p>${esc(lurSeo.beskrivelse)}</p></section>`)
  .replace("<script>/*SKRIPT*/</script>", ""); // on the website the script is a file, deferred in the <head> (see hode() in rusj.mjs)
const index = `${lagHode({
  tittel: lurSeo.tittel,
  ogTittel: lurSeo.ogTittel,
  beskrivelse: lurSeo.beskrivelse,
  sti: "/luringen/",
  kortnavn: "Luringen",
  ikon: "/luringen/ikon.svg",
  pngIkon: "/luringen/ikon-192.png",
  appleIkon: "/luringen/ikon-180.png",
  deling: lurBilde,
  delingAlt: `Luringen – ${lurSeo.frase}. Gratis på rusj.no`,
  css: [`/luringen/luringen.css?v=${v(lurCss)}`],
  skript: [`/luringen/luringen.js?v=${v(lurJs)}`],
  jsonld: spillJsonLd(LURINGEN_KORT, lurSeo, lurBilde),
})}
<body>
${webKropp.trim()}
</body>
</html>
`;
writeFileSync(join(LUR, "index.html"), index);

const rusj = byggRusj({ ROT, WEB, ordData: data, ordbanker: Object.fromEntries(Object.entries(ordbanker).map(([s, b]) => [s, b.data])), utvalg, luringen: utvalg && !utvalg.includes("luringen") ? null : LURINGEN_KORT, topp: toppFil });

// ---------- Offline support: one service worker at the root (rusj/kit/sw.js) ----------
// The worker gets three things from the build:
//   SIDER   every page with a hash of its content, the front page first, then the games in
//           front-page order. The worker stores the front page at once, the page being visited,
//           and the rest when the phone is idle (not on Save-Data or 2G). Which files a page needs
//           it reads from the page itself (every address with ?v=<content hash>).
//   EKSTRA  the few other files without a hash in their address (manifest, Luringen's icons).
//   VERSJON a hash of every published file. It is what makes sw.js differ from the last build, and
//           that difference is what makes browsers install the new worker (they compare the bytes
//           of sw.js on every visit). The hashes in SIDER then tell the worker exactly which pages
//           changed – only those are fetched again.
// Hashes are FNV-1a over the bytes of the file; the worker computes the same over what it fetched.
const innholdHash = (sti) => hashTekst(readFileSync(join(WEB, sti.endsWith("/") ? sti + "index.html" : sti)).toString("latin1")).toString(36);
const medHash = (stier) => stier.filter((sti) => existsSync(join(WEB, sti.endsWith("/") ? sti + "index.html" : sti))).map((sti) => [sti, innholdHash(sti)]);
const swSider = medHash([...new Set([...rusj.sider, "/luringen/"])]);
const swEkstra = medHash([...new Set(["/manifest.webmanifest", ...(rusj.manifester || []), "/luringen/ikon.svg", "/luringen/ikon-180.png"])]);

// The page the worker shows when a page is neither stored nor reachable. It travels inside sw.js as
// a string, so it needs no stored file and no request: styles inline, no script, no images. One per
// edition ({ "/": …, "/en/": … }), in its own words (rusj/kit/tekst.<lang>.json).
const frakobletFor = (sprak) => {
  const t = lagSprak(sprak, lesTabell(join(ROT, `rusj/kit/tekst.${sprak}.json`)) || {}).t;
  return `<!doctype html>
<html lang="${sprak}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#150c28">
<meta name="color-scheme" content="dark">
<title>${esc(t("Uten nett"))} | rusj</title>
<style>
html{height:100%;background:#150c28;color:#fff1dd;font:400 1.05rem/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
body{min-height:100%;margin:0;display:flex;align-items:center;justify-content:center;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));box-sizing:border-box;text-align:center}
main{max-width:26rem}
h1{margin:0 0 .4em;font:900 2rem/1.15 ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold",system-ui,sans-serif;letter-spacing:-.02em}
p{margin:0 0 1.4em;color:#cdbce9}
a{color:#ffd23f;font-weight:700}
a.knapp{display:inline-block;padding:14px 26px;border-radius:18px;background:#ffd23f;box-shadow:0 5px 0 #c4930f;color:#170e2b;font:900 1.1rem/1.2 ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold",system-ui,sans-serif;text-decoration:none}
a:focus-visible{outline:3px solid #ffd23f;outline-offset:3px}
</style>
</head>
<body>
<main>
<h1>${esc(t("Du er uten nett"))}</h1>
<p>${esc(t("Denne siden er ikke lagret på enheten ennå. Spill du har åpnet før, virker fortsatt."))}</p>
<p><a class="knapp" href="${SPRAK_INFO[sprak].forside}">${esc(t("Til forsiden"))}</a></p>
<p><a href="">${esc(t("Prøv igjen"))}</a></p>
</main>
</body>
</html>
`;
};
const frakoblet = Object.fromEntries(ALLE_SPRAK.map((s) => [SPRAK_INFO[s].forside, frakobletFor(s)]));

// The version follows the content of every published file (a change of the same length counts too).
const swVersjon = hashTekst(
  readdirSync(WEB, { recursive: true })
    .map(String)
    .filter((f) => f !== "sw.js")
    .sort()
    .map((f) => {
      try {
        const innhold = readFileSync(join(WEB, f));
        return f + ":" + hashTekst(innhold.toString("latin1"));
      } catch (e) {
        return f; // a folder
      }
    })
    .join("|"),
).toString(36);

// Emergency brake (--sw-av, or a file rusj/SW-AV in the repository): a worker that deletes what rusj
// has stored for offline use and removes itself. Publish it when a faulty worker is out; publish a
// normal build again afterwards. The procedure is in rusj/DRIFT.md.
const swAv = process.argv.includes("--sw-av") || existsSync(join(ROT, "rusj/SW-AV"));
const SW_AV = `// rusj: emergency worker (built ${new Date().toISOString().slice(0, 10)} with --sw-av). It deletes the offline copy and removes
// itself; the pages then load straight from ${DOMENE}. See rusj/DRIFT.md.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const lagre = await caches.keys();
      for (const navn of lagre) await caches.delete(navn);
      const sider = await self.clients.matchAll({ type: "window" });
      await self.registration.unregister();
      // Pages that ran on the stored copy are reloaded once, so they get their files from the host.
      // Only when there was a copy to delete: every page registers /sw.js again when it loads, and
      // that must never become a reload loop.
      if (lagre.length) for (const k of sider) k.navigate(k.url).catch(() => {});
    })(),
  );
});
`;
const swKilde = kilde("../rusj/kit/sw.js");
for (const merke of ["__VERSJON__", "__SIDER__", "__EKSTRA__", "__FRAKOBLET__"]) if (swKilde.split(merke).length !== 2) throw new Error(`rusj/kit/sw.js: ${merke} skal stå nøyaktig én gang`);
const sw = swAv
  ? SW_AV
  : swKilde
      .replace("__VERSJON__", () => swVersjon)
      .replace("__SIDER__", () => JSON.stringify(swSider))
      .replace("__EKSTRA__", () => JSON.stringify(swEkstra))
      .replace("__FRAKOBLET__", () => JSON.stringify(frakoblet));
writeFileSync(join(WEB, "sw.js"), sw);
if (swAv) console.log("⚠ sw.js er NØDBREMSEN: den sletter kopien for bruk uten nett og fjerner seg selv (rusj/DRIFT.md)");

const kb = (fil) => Math.round(readFileSync(fil).length / 1024);
console.log(`✓ ${antall} ord i ${kategorier.length} kategorier (hash ${data.hash})`);
if (duplikater.length) console.log(`  ${duplikater.length} duplikater fjernet: ${duplikater.slice(0, 12).join(", ")}${duplikater.length > 12 ? " …" : ""}`);
if (mangler.length) console.log(`  ⚠ mangler kategorier: ${mangler.join(", ")}`);
for (const [sprak, b] of Object.entries(ordbanker)) {
  console.log(`✓ ${sprak}: ${b.antall} ord i ${b.data.kategorier.length} kategorier (hash ${b.data.hash})`);
  if (b.duplikater.length) console.log(`  ${b.duplikater.length} duplikater fjernet: ${b.duplikater.slice(0, 12).join(", ")}${b.duplikater.length > 12 ? " …" : ""}`);
  if (b.mangler.length) console.log(`  ⚠ mangler kategorier: ${b.mangler.join(", ")}`);
}
console.log(`✓ ${rusj.spill.length} rusj-spill + Luringen i ${WEB.replace(ROT + "/", "")} (forside ${kb(join(WEB, "index.html"))} kB, Luringen ${kb(join(LUR, "luringen.js"))} kB)`);
if (!tilAnnenMappe) console.log(`✓ dist/luringen.html (${kb(join(ROT, "dist/luringen.html"))} kB)`);
