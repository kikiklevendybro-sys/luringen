#!/usr/bin/env node
// Merges a newly built game's side files into the shared files (rusj/SPILL3.md):
//   rusj/spill/<id>/maskot.js  → the FIGURER table in rusj/kit/gjengen.js (placeholder colour updated)
//   rusj/spill/<id>/seo.json   → rusj/seo.json («spill.<id>»)
// Both side files are removed afterwards. Usage: node scripts/flett-nytt-spill.mjs <id> [--fjern-sok "ord"]
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (!/^[a-z0-9]{2,24}$/.test(id || "")) throw new Error("Bruk: node scripts/flett-nytt-spill.mjs <id>");
const fjern = [];
for (let i = 3; i < process.argv.length; i++) if (process.argv[i] === "--fjern-sok") fjern.push(process.argv[++i]);
const mappe = join(ROT, "rusj/spill", id);

// ---- Mascot ----
const maskotFil = join(mappe, "maskot.js");
if (existsSync(maskotFil)) {
  const maskot = readFileSync(maskotFil, "utf8");
  const alias = maskot.match(/\/\/\s*alias:\s*\[\s*"(#[0-9a-fA-F]{3,8})"\s*,\s*"([^"]+)"\s*\]/);
  const kropp = maskot.replace(/^\/\/\s*alias:.*$/m, "").trimEnd();
  if (!new RegExp(`^\\s*${id}:\\s*\\{`, "m").test(kropp)) throw new Error(`${maskotFil}: fant ikke «${id}: {»`);
  const gfil = join(ROT, "rusj/kit/gjengen.js");
  let g = readFileSync(gfil, "utf8");
  if (new RegExp(`\\n\\s{4}${id}:\\s*\\{\\n`).test(g)) throw new Error(`${id} finnes allerede i FIGURER`);
  const slutt = "    },  };\n\n  // Fallback for a game whose mascot is not drawn yet";
  if (!g.includes(slutt)) throw new Error("fant ikke slutten av FIGURER i gjengen.js");
  g = g.replace(slutt, `    },\n\n${kropp}\n  };\n\n  // Fallback for a game whose mascot is not drawn yet`);
  if (alias) g = g.replace(new RegExp(`(\\n\\s+${id}: \\[)"#[0-9a-fA-F]{3,8}", "[^"]*"(\\])`), `$1"${alias[1]}", "${alias[2]}"$2`);
  writeFileSync(gfil, g);
  rmSync(maskotFil);
  console.log(`✓ figur for ${id} flettet inn i rusj/kit/gjengen.js`);
}

// ---- SEO ----
const seoFil = join(mappe, "seo.json");
if (existsSync(seoFil)) {
  const ny = JSON.parse(readFileSync(seoFil, "utf8"));
  if (Array.isArray(ny.sok)) ny.sok = ny.sok.filter((s) => !fjern.includes(s));
  const sfil = join(ROT, "rusj/seo.json");
  const seo = JSON.parse(readFileSync(sfil, "utf8"));
  seo.spill = seo.spill || {};
  seo.spill[id] = Object.assign({}, seo.spill[id], ny);
  writeFileSync(sfil, JSON.stringify(seo, null, 2) + "\n");
  rmSync(seoFil);
  console.log(`✓ SEO-tekst for ${id} flettet inn i rusj/seo.json`);
}
