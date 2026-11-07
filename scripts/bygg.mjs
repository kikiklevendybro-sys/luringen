#!/usr/bin/env node
// Builds Luringen without any dependencies:
//   build/ord.json        merged word list (used by the tests)
//   dist/web/             the website: index.html + manifest, icons and offline support
//   dist/luringen.html    the same game as one page without <html>/<head> (for the Claude artifact)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
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
const side = kilde("page.html");
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
writeFileSync(join(ROT, "dist/luringen.html"), fyll(hode + kropp, false));

// Website
const WEB = join(ROT, "dist/web");
rmSync(WEB, { recursive: true, force: true });
mkdirSync(WEB, { recursive: true });
const webHode = hode.replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, "");
const index = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#150c28">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Luringen">
<meta property="og:title" content="Luringen">
<meta property="og:description" content="Alle får det hemmelige ordet. Nesten alle. Norsk festspill for 3–10 spillere.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="ikon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="ikon-180.png">
${fyll(webHode, true).trim()}
</head>
<body>
${fyll(kropp, true).trim()}
</body>
</html>
`;
writeFileSync(join(WEB, "index.html"), index);

const versjon = hashTekst(index).toString(36);
writeFileSync(join(WEB, "sw.js"), kilde("sw.js").replace("__VERSJON__", versjon));
writeFileSync(
  join(WEB, "manifest.webmanifest"),
  JSON.stringify(
    {
      name: "Luringen",
      short_name: "Luringen",
      description: "Norsk festspill: alle får samme hemmelige ord – bortsett fra luringen.",
      lang: "nb",
      start_url: "./",
      scope: "./",
      display: "standalone",
      orientation: "portrait",
      background_color: "#150c28",
      theme_color: "#150c28",
      icons: [
        { src: "ikon-192.png", sizes: "192x192", type: "image/png" },
        { src: "ikon-512.png", sizes: "512x512", type: "image/png" },
        { src: "ikon-maskerbar-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "ikon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2,
  ),
);
for (const fil of ["ikon.svg", "ikon-180.png", "ikon-192.png", "ikon-512.png", "ikon-maskerbar-512.png"]) {
  const fra = join(ROT, "src/ikoner", fil);
  if (existsSync(fra)) copyFileSync(fra, join(WEB, fil));
  else console.warn(`⚠ mangler src/ikoner/${fil} (kjør node scripts/lag-ikoner.mjs)`);
}

const kb = (fil) => Math.round(readFileSync(fil).length / 1024);
console.log(`✓ ${antall} ord i ${kategorier.length} kategorier (hash ${data.hash})`);
if (duplikater.length) console.log(`  ${duplikater.length} duplikater fjernet: ${duplikater.slice(0, 12).join(", ")}${duplikater.length > 12 ? " …" : ""}`);
if (mangler.length) console.log(`  ⚠ mangler kategorier: ${mangler.join(", ")}`);
console.log(`✓ dist/web/index.html (${kb(join(WEB, "index.html"))} kB)`);
console.log(`✓ dist/luringen.html (${kb(join(ROT, "dist/luringen.html"))} kB)`);
