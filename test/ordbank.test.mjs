// The word banks of the other editions (data/kategorier.en, data/kategorier.da – rusj/SPRAK.md):
// the same 32 categories as the Norwegian one, each file passes scripts/sjekk-ord.mjs, no word twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const filer = (mappe) => readdirSync(join(ROT, mappe)).filter((f) => f.endsWith(".json")).sort();
const NORSK = filer("data/kategorier");
const UTGAVER = [
  ["en", "en-GB"],
  ["da", "da"],
];

for (const [sprak, lokale] of UTGAVER) {
  const mappe = `data/kategorier.${sprak}`;
  const kat = filer(mappe).map((f) => ({ f, ...JSON.parse(readFileSync(join(ROT, mappe, f), "utf8")) }));

  test(`${sprak}: the same category files and ids as the Norwegian bank`, () => {
    assert.deepEqual(kat.map((k) => k.f), NORSK);
    for (const k of kat) assert.equal(k.id, k.f.replace(/\.json$/, ""), `${mappe}/${k.f}: id «${k.id}»`);
  });

  test(`${sprak}: every file passes scripts/sjekk-ord.mjs (95+ words, o/n/h/l, hints that don't give the word away)`, () => {
    execFileSync(process.execPath, [join(ROT, "scripts/sjekk-ord.mjs"), ...kat.map((k) => join(ROT, mappe, k.f))], { stdio: "pipe" });
  });

  test(`${sprak}: no word in two categories, and every level is well stocked`, () => {
    const sett = new Map();
    const niva = { 1: 0, 2: 0, 3: 0 };
    for (const k of kat)
      for (const e of k.ord) {
        const n = e.o.trim().toLocaleLowerCase(lokale);
        assert.ok(!sett.has(n), `«${e.o}» står både i ${sett.get(n)} og ${k.id}`);
        sett.set(n, k.id);
        niva[e.n]++;
      }
    assert.ok(sett.size >= 3000, `bare ${sett.size} ord`);
    for (const n of [1, 2, 3]) assert.ok(niva[n] >= 600, `nivå ${n}: bare ${niva[n]} ord`);
  });
}
