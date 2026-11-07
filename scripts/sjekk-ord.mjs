#!/usr/bin/env node
// Validates Luringen word category files.
// Usage: node scripts/sjekk-ord.mjs data/kategorier/mat.json [more files...]
// Exit code 1 if any file has errors (✗). Warnings (⚠) are printed but do not fail.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node scripts/sjekk-ord.mjs <file.json> ...");
  process.exit(2);
}

const norm = (s) => s.trim().toLocaleLowerCase("nb");
const sharedPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

const seenAcrossFiles = new Map(); // normalized word -> "file#index"
let failed = false;

for (const file of files) {
  const errors = [];
  const warnings = [];
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.log(`✗ ${file}: invalid JSON (${e.message})`);
    failed = true;
    continue;
  }

  const id = basename(file, ".json");
  if (data.id !== id) errors.push(`id "${data.id}" does not match filename "${id}"`);
  if (typeof data.navn !== "string" || !data.navn.trim()) errors.push("missing navn");
  if (typeof data.ikon !== "string" || !data.ikon.trim()) errors.push("missing ikon");
  const ord = Array.isArray(data.ord) ? data.ord : [];
  if (!Array.isArray(data.ord)) errors.push("ord is not an array");
  if (ord.length < 95) errors.push(`only ${ord.length} words (need at least 95)`);
  if (ord.length > 110) warnings.push(`${ord.length} words (aim for about 100)`);

  const seen = new Map();
  const dist = { 1: 0, 2: 0, 3: 0 };
  const categoryName = typeof data.navn === "string" ? norm(data.navn) : "";

  ord.forEach((e, i) => {
    const where = `#${i + 1} ${JSON.stringify(e && e.o)}`;
    if (!e || typeof e !== "object") {
      errors.push(`${where}: not an object`);
      return;
    }
    const keys = Object.keys(e).sort().join(",");
    if (keys !== "h,l,n,o") errors.push(`${where}: keys must be exactly o, n, h, l (got ${keys})`);
    for (const k of ["o", "h", "l"]) {
      if (typeof e[k] !== "string" || !e[k].trim()) {
        errors.push(`${where}: ${k} must be a non-empty string`);
        return;
      }
      if (e[k] !== e[k].trim()) errors.push(`${where}: ${k} has leading/trailing spaces`);
      if (e[k].length > 24) errors.push(`${where}: ${k} is longer than 24 characters`);
      if (/\s{2,}/.test(e[k])) errors.push(`${where}: ${k} has double spaces`);
    }
    if (![1, 2, 3].includes(e.n)) errors.push(`${where}: n must be 1, 2 or 3`);
    else dist[e.n]++;

    if (/^[a-zæøå]/.test(e.o)) errors.push(`${where}: o must start with a capital letter`);
    if (/[!?;:"]$/.test(e.o)) errors.push(`${where}: o ends with punctuation`);

    const o = norm(e.o);
    const h = norm(e.h);
    const l = norm(e.l);

    if (seen.has(o)) errors.push(`${where}: duplicate of #${seen.get(o)}`);
    else seen.set(o, i + 1);

    if (seenAcrossFiles.has(o)) warnings.push(`${where}: also in ${seenAcrossFiles.get(o)}`);
    else seenAcrossFiles.set(o, `${id}#${i + 1}`);

    if (h === o) errors.push(`${where}: hint equals the word`);
    if (l === o) errors.push(`${where}: similar word equals the word`);
    if (h === l) warnings.push(`${where}: hint equals the similar word`);
    if (o.length >= 3 && h.length >= 3 && (h.includes(o) || o.includes(h)))
      errors.push(`${where}: hint "${e.h}" overlaps the word`);
    else if (sharedPrefix(o, h) >= 5) warnings.push(`${where}: hint "${e.h}" shares a long prefix with the word`);
    if (o.length >= 3 && l.length >= 3 && (l.includes(o) || o.includes(l)))
      errors.push(`${where}: similar word "${e.l}" is a variant of the word`);
    if (categoryName && h === categoryName) errors.push(`${where}: hint equals the category name`);
  });

  const total = ord.length || 1;
  const pct = (n) => Math.round((dist[n] / total) * 100);
  const head = `${errors.length ? "✗" : "✓"} ${id}: ${ord.length} words, n1 ${dist[1]} (${pct(1)}%), n2 ${dist[2]} (${pct(2)}%), n3 ${dist[3]} (${pct(3)}%)`;
  console.log(head);
  for (const msg of errors) console.log(`  ✗ ${msg}`);
  for (const msg of warnings) console.log(`  ⚠ ${msg}`);
  if (errors.length) failed = true;
}

process.exit(failed ? 1 : 0);
