#!/usr/bin/env node
// Draws the app icons (SVG) and renders PNG versions with headless Google Chrome.
// Usage: node scripts/lag-ikoner.mjs
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UT = join(ROT, "src/ikoner");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(UT, { recursive: true });

const maskot = `
  <circle cx="60" cy="64" r="48" fill="#ff4f8b" stroke="#170e2b" stroke-width="5"/>
  <circle cx="40" cy="54" r="12.5" fill="#fff1dd"/><circle cx="80" cy="54" r="12.5" fill="#fff1dd"/>
  <circle cx="44" cy="56" r="5.5" fill="#170e2b"/><circle cx="84" cy="56" r="5.5" fill="#170e2b"/>
  <g fill="none" stroke="#170e2b" stroke-linecap="round">
    <circle cx="40" cy="54" r="15" stroke-width="6"/><circle cx="80" cy="54" r="15" stroke-width="6"/>
    <path d="M55 52 Q60 47 65 52" stroke-width="5"/>
    <path d="M24 32 Q37 18 53 29" stroke-width="7"/><path d="M67 36 Q80 31 96 36" stroke-width="7"/>
    <path d="M57 99 Q69 104 79 95" stroke-width="4.5"/>
  </g>
  <ellipse cx="60" cy="74" rx="11" ry="9" fill="#ffb08a" stroke="#170e2b" stroke-width="4"/>
  <path d="M60 82 C53 78 42 79 36 86 C32 90 26 90 23 86 C25 96 41 99 51 91 C55 88 58 87 60 87 C62 87 65 88 69 91 C79 99 95 96 97 86 C94 90 88 90 84 86 C78 79 67 78 60 82 Z" fill="#170e2b"/>`;

const bakgrunn = `
  <defs><radialGradient id="g" cx="50%" cy="18%" r="80%"><stop offset="0" stop-color="#4a2b80"/><stop offset=".55" stop-color="#21143d"/><stop offset="1" stop-color="#150c28"/></radialGradient></defs>`;

// Rounded icon (browser tab, Android) and a full-bleed one with a safe zone (maskable, iOS).
const ikon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bakgrunn}
  <rect width="512" height="512" rx="116" fill="url(#g)"/>
  <g transform="translate(70 60) scale(3.1)">${maskot}</g></svg>`;
const fullflate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bakgrunn}
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(106 98) scale(2.5)">${maskot}</g></svg>`;

writeFileSync(join(UT, "ikon.svg"), ikon);
writeFileSync(join(UT, "ikon-fullflate.svg"), fullflate);

const tmp = join(tmpdir(), `luringen-ikoner-${process.pid}`);
mkdirSync(tmp, { recursive: true });

function render(svgFil, storrelse, utFil) {
  const html = join(tmp, `ikon-${storrelse}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><body style="margin:0;background:transparent"><img src="${pathToFileURL(join(UT, svgFil)).href}" width="${storrelse}" height="${storrelse}" style="display:block"></body></html>`,
  );
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--default-background-color=00000000",
    `--user-data-dir=${join(tmp, "profil")}`,
    `--window-size=${storrelse},${storrelse}`,
    `--screenshot=${join(UT, utFil)}`,
    pathToFileURL(html).href,
  ], { stdio: "ignore" });
  console.log(`✓ ${utFil}`);
}

render("ikon.svg", 192, "ikon-192.png");
render("ikon.svg", 512, "ikon-512.png");
render("ikon-fullflate.svg", 512, "ikon-maskerbar-512.png");
render("ikon-fullflate.svg", 180, "ikon-180.png");
rmSync(tmp, { recursive: true, force: true });
