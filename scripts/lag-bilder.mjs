#!/usr/bin/env node
// Draws the rusj app icons and the share images (1200×630, shown when a link is shared) for the
// front page and every game, and renders them to PNG with headless Google Chrome.
// Output goes to rusj/bilder/ (committed, so the build itself never needs Chrome).
// Usage: node scripts/lag-bilder.mjs [id ...]
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { lesSpill } from "./rusj.mjs";
import { startChrome } from "../test/chrome.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const G = require(join(ROT, "rusj/kit/gjengen.js"));
const UT = join(ROT, "rusj/bilder");
mkdirSync(UT, { recursive: true });
const tmp = join(tmpdir(), `rusj-bilder-${process.pid}`);
mkdirSync(tmp, { recursive: true });
const bare = process.argv.slice(2);

// One Chrome per image size; exact pixels via the DevTools Protocol (the --screenshot flag
// leaves a stripe at the bottom in new headless mode).
const chromer = new Map();
async function chrome(b, h) {
  const n = `${b}x${h}`;
  if (!chromer.has(n)) {
    const c = await startChrome({ bredde: b, hoyde: h, skala: 1, mobil: false, gjennomsiktig: true });
    // Warm-up: the first screenshot of a fresh browser can come out tiled/garbled, so take one
    // throwaway shot before the real images.
    await c.lastSide("data:text/html,<body style='margin:0;background:%23150c28'></body>");
    await c.sov(300);
    await c.skjermbilde(join(tmp, `oppvarming-${n}.png`), { klipp: { x: 0, y: 0, width: b, height: h } });
    chromer.set(n, c);
  }
  return chromer.get(n);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const FONT = `ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif`;

async function render(html, bredde, hoyde, utFil) {
  const fil = join(tmp, `side-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(fil, html);
  const c = await chrome(bredde, hoyde);
  await c.lastSide(pathToFileURL(fil).href);
  // Let layout and painting settle (the first frame of a fresh browser can be garbled).
  await c.js("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  await c.sov(400);
  await c.skjermbilde(utFil, { klipp: { x: 0, y: 0, width: bredde, height: hoyde } });
  console.log(`✓ ${utFil.replace(ROT + "/", "")}`);
}

const side = (kropp, b, h) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${b}px;height:${h}px;overflow:hidden;background:transparent}
  svg{display:block;overflow:visible}
</style></head><body>${kropp}</body></html>`;

// ---------- App icon: the wordmark on the night background ----------
const bakgrunn = `<defs><radialGradient id="g" cx="50%" cy="18%" r="80%"><stop offset="0" stop-color="#4a2b80"/><stop offset=".55" stop-color="#21143d"/><stop offset="1" stop-color="#150c28"/></radialGradient></defs>`;
const logoInnhold = G.logo({ fil: true }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const logoBoks = G.logo({ fil: true }).match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
function ikonMedLogo(fullflate) {
  const [vx, vy, vb, vh] = logoBoks;
  const maal = fullflate ? 300 : 360;
  const s = maal / vb;
  const tx = (512 - vb * s) / 2 - vx * s;
  const ty = (512 - vh * s) / 2 - vy * s + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bakgrunn}<rect width="512" height="512" ${fullflate ? "" : 'rx="116"'} fill="url(#g)"/><g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(4)})">${logoInnhold}</g></svg>`;
}

if (!bare.length) {
  const ikon = ikonMedLogo(false);
  const fullflate = ikonMedLogo(true);
  writeFileSync(join(UT, "ikon.svg"), ikon);
  writeFileSync(join(UT, "ikon-fullflate.svg"), fullflate);
  const img = (svgFil, s) => side(`<img src="${pathToFileURL(join(UT, svgFil)).href}" width="${s}" height="${s}" style="display:block">`, s, s);
  await render(img("ikon.svg", 192), 192, 192, join(UT, "ikon-192.png"));
  await render(img("ikon.svg", 512), 512, 512, join(UT, "ikon-512.png"));
  await render(img("ikon-fullflate.svg", 512), 512, 512, join(UT, "ikon-maskerbar-512.png"));
  await render(img("ikon-fullflate.svg", 180), 180, 180, join(UT, "ikon-180.png"));
}

// ---------- Share images ----------
const scene = `background:
  radial-gradient(ellipse 60% 50% at 30% 0%, rgba(255,210,63,.22), transparent 70%),
  radial-gradient(ellipse 50% 60% at 100% 100%, rgba(255,79,139,.2), transparent 70%),
  #150c28;`;

if (!bare.length) {
  // A bold row of eleven well-known faces (old and new, no 18+ games) reads better in a small link
  // preview than all the mascots shrunk to dots. The row is wider than the image, so it bleeds off.
  const utvalg = ["bokstavtrollet", "varulven", "ordugla", "sauen", "nissen", "luringen", "sjakkhesten", "kunstneren", "spionen", "terninga", "mimen"].filter((id) => G.alle.includes(id));
  const figurer = utvalg.map((id, n) => `<div style="width:118px;flex:none;transform:translateY(${n % 2 ? 14 : -6}px) rotate(${(n % 3) * 4 - 4}deg)">${G.svg(id)}</div>`).join("");
  await render(
    side(
      `<div style="width:1200px;height:630px;${scene};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;font-family:${FONT};color:#fff1dd;overflow:hidden">
        <div style="width:420px">${G.logo()}</div>
        <div style="font-weight:900;font-size:56px;letter-spacing:-1px">Spill for hele gjengen. <span style="color:#3de3b0">Rett i nettleseren.</span></div>
        <div style="display:flex;gap:10px;width:1400px;justify-content:center;flex-wrap:nowrap">${figurer}</div>
      </div>`,
      1200,
      630,
    ),
    1200,
    630,
    join(UT, "deling.png"),
  );
}

const spill = lesSpill(ROT, null);
const luringen = { id: "luringen", navn: "Luringen", undertittel: "Finn bløfferen", kort: "Alle får det hemmelige ordet. Nesten alle.", farge: "#ff4f8b", spillere: [3, 10] };
for (const m of [luringen, ...spill]) {
  if (bare.length && !bare.includes(m.id)) continue;
  await render(
    side(
      `<div style="width:1200px;height:630px;${scene};display:grid;grid-template-columns:470px 1fr;align-items:center;gap:40px;padding:0 70px;box-sizing:border-box;font-family:${FONT};color:#fff1dd">
        <div style="width:440px;filter:drop-shadow(0 30px 40px rgba(0,0,0,.5))">${G.svg(m.id)}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:20px">
          <div style="background:${m.farge};color:#170e2b;font-weight:900;font-size:34px;padding:10px 22px;border-radius:999px;transform:rotate(-2deg)">${esc(m.undertittel)}</div>
          <div style="font-weight:900;font-size:${Math.min(116, Math.floor(560 / (m.navn.length * 0.6)))}px;line-height:.95;letter-spacing:-2px;white-space:nowrap">${esc(m.navn)}</div>
          <div style="font-weight:700;font-size:34px;color:#cdbce9;max-width:600px;line-height:1.25;text-wrap:pretty">${esc(m.kort)}</div>
          <div style="display:flex;align-items:center;gap:18px;margin-top:10px"><div style="width:150px">${G.logo()}</div><div style="font-weight:800;font-size:30px;color:#a08cc8">Gratis på rusj.no</div></div>
        </div>
      </div>`,
      1200,
      630,
    ),
    1200,
    630,
    join(UT, `deling-${m.id}.png`),
  );
}

// Luringen's own icons (src/ikoner) had the same stripe; redraw them from their SVGs.
if (!bare.length || bare.includes("luringen")) {
  const L = join(ROT, "src/ikoner");
  const img = (svgFil, s) => side(`<img src="${pathToFileURL(join(L, svgFil)).href}" width="${s}" height="${s}" style="display:block">`, s, s);
  await render(img("ikon.svg", 192), 192, 192, join(L, "ikon-192.png"));
  await render(img("ikon.svg", 512), 512, 512, join(L, "ikon-512.png"));
  await render(img("ikon-fullflate.svg", 512), 512, 512, join(L, "ikon-maskerbar-512.png"));
  await render(img("ikon-fullflate.svg", 180), 180, 180, join(L, "ikon-180.png"));
}

for (const c of chromer.values()) await c.lukk();
rmSync(tmp, { recursive: true, force: true });
