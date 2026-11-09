#!/usr/bin/env node
// Builds rusj.no without any dependencies:
//   build/ord.json        merged word list (used by the tests and several games)
//   dist/web/             the website: front page, /luringen/, one folder per rusj game, offline support
//   dist/luringen.html    Luringen as one page without <html>/<head> (for the Claude artifact)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, readdirSync } from "node:fs";
import { byggRusj, CSP, DOMENE } from "./rusj.mjs";
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

const kategorier = [];
const sett = new Map();
const duplikater = [];
const mangler = [];

for (const id of REKKEFOLGE) {
  const fil = join(ROT, "data/kategorier", `${id}.json`);
  if (!existsSync(fil)) {
    mangler.push(id);
    continue;
  }
  const kat = JSON.parse(readFileSync(fil, "utf8"));
  if (kat.id !== id) throw new Error(`${fil}: id "${kat.id}" matcher ikke filnavnet`);
  const ord = [];
  for (const e of kat.ord) {
    if (![1, 2, 3].includes(e.n) || !e.o || !e.h || !e.l) throw new Error(`${id}: ugyldig oppføring ${JSON.stringify(e)}`);
    const nokkel = e.o.trim().toLocaleLowerCase("nb");
    if (sett.has(nokkel)) {
      duplikater.push(`${e.o} (${id}, beholdt i ${sett.get(nokkel)})`);
      continue;
    }
    sett.set(nokkel, id);
    ord.push([e.o.trim(), e.n, e.h.trim(), e.l.trim()]);
  }
  kategorier.push({ id: kat.id, navn: kat.navn, ikon: kat.ikon, ord });
}

if (!kategorier.length) throw new Error("Fant ingen ordlister i data/kategorier");
const data = { hash: hashTekst(JSON.stringify(kategorier)), kategorier };
const antall = kategorier.reduce((s, k) => s + k.ord.length, 0);

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
// Options: --ut <dir> (default dist/web), --spill id1,id2 (only these games; for tests)
const arg = (navn) => {
  const i = process.argv.indexOf(navn);
  return i > 0 ? process.argv[i + 1] : null;
};
const WEB = arg("--ut") ? resolve(arg("--ut")) : join(ROT, "dist/web");
const utvalg = arg("--spill") ? arg("--spill").split(",").map((s) => s.trim()).filter(Boolean) : null;
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
const webHode = hode
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, "")
  .replace("<title>Luringen</title>", "<title>Luringen – finn bløfferen | rusj</title>")
  .replace("<style>/*STIL*/</style>", `<link rel="stylesheet" href="/luringen/luringen.css?v=${v(lurCss)}">`);
const webKropp = kropp.replace("<script>/*SKRIPT*/</script>", `<script src="/luringen/luringen.js?v=${v(lurJs)}"></script>`);
if (webHode.includes("/*STIL*/") || webKropp.includes("/*SKRIPT*/")) throw new Error("Fant ikke plassholderne i src/page.html");
const index = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<link rel="canonical" href="${DOMENE}/luringen/">
<meta name="theme-color" content="#150c28">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Luringen">
<meta property="og:type" content="website">
<meta property="og:site_name" content="rusj">
<meta property="og:locale" content="nb_NO">
<meta property="og:title" content="Luringen – finn bløfferen">
<meta property="og:description" content="Alle får det hemmelige ordet. Nesten alle. Norsk festspill for 3–10 spillere.">
<meta property="og:url" content="${DOMENE}/luringen/">
${existsSync(lurDeling) ? `<meta property="og:image" content="${DOMENE}/luringen/deling.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/luringen/ikon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/luringen/ikon-180.png">
${webHode.trim()}
</head>
<body>
${webKropp.trim()}
</body>
</html>
`;
writeFileSync(join(LUR, "index.html"), index);

const LURINGEN_KORT = {
  id: "luringen",
  navn: "Luringen",
  undertittel: "Finn bløfferen",
  kort: "Alle får det hemmelige ordet. Nesten alle.",
  spillere: [3, 10],
  minutter: [10, 40],
  mobiler: "begge",
  tagger: ["fest", "blof", "ord", "familie"],
  farge: "#ff4f8b",
  rekkefolge: 1,
};
const rusj = byggRusj({ ROT, WEB, ordData: data, utvalg, luringen: utvalg && !utvalg.includes("luringen") ? null : LURINGEN_KORT });

// Offline support for the whole site (one service worker at the root).
// Every page and file is stored on install, so all games work offline — also ones never opened.
const swFiler = [
  "/",
  "/manifest.webmanifest",
  ...rusj.forhand,
  "/luringen/",
  `/luringen/luringen.css?v=${v(lurCss)}`,
  `/luringen/luringen.js?v=${v(lurJs)}`,
  "/luringen/ikon.svg",
  "/luringen/ikon-180.png",
];
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
writeFileSync(join(WEB, "sw.js"), kilde("../rusj/kit/sw.js").replace("__VERSJON__", swVersjon).replace("__FILER__", JSON.stringify(swFiler)));

const kb = (fil) => Math.round(readFileSync(fil).length / 1024);
console.log(`✓ ${antall} ord i ${kategorier.length} kategorier (hash ${data.hash})`);
if (duplikater.length) console.log(`  ${duplikater.length} duplikater fjernet: ${duplikater.slice(0, 12).join(", ")}${duplikater.length > 12 ? " …" : ""}`);
if (mangler.length) console.log(`  ⚠ mangler kategorier: ${mangler.join(", ")}`);
console.log(`✓ ${rusj.spill.length} rusj-spill + Luringen i ${WEB.replace(ROT + "/", "")} (forside ${kb(join(WEB, "index.html"))} kB, Luringen ${kb(join(LUR, "luringen.js"))} kB)`);
if (!tilAnnenMappe) console.log(`✓ dist/luringen.html (${kb(join(ROT, "dist/luringen.html"))} kB)`);
