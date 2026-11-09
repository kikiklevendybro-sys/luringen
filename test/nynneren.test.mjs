// Nynneren's song list: no duplicates, valid levels, artists on ambiguous titles, Norwegian Disney titles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = JSON.parse(readFileSync(new URL("../rusj/spill/nynneren/data/laater.json", import.meta.url), "utf8"));
const alle = L.kategorier.flatMap((k) => k.laater.map((l) => ({ k: k.id, t: l[0], n: l[1], a: l[2] })));

test("minst 400 låter, ingen dubletter, nivå 1–3", () => {
  assert.ok(alle.length >= 400, `bare ${alle.length}`);
  const sett = new Set();
  for (const l of alle) {
    const k = l.t.toLowerCase().replace(/[^a-zæøå0-9]/g, "");
    assert.ok(!sett.has(k), `dublett: ${l.t}`);
    sett.add(k);
    assert.ok([1, 2, 3].includes(l.n), `nivå: ${l.t}`);
  }
});
test("tvetydige titler har artist", () => {
  for (const t of ["Crazy", "Kiss", "Gloria", "Glow", "Faded", "Halo", "Valerie", "Smooth", "Mercy", "Jump", "Angels", "Children"]) {
    const l = alle.find((x) => x.t === t);
    assert.ok(l && l.a, `${t} mangler artist`);
  }
});
test("kategori og norske Disney-titler", () => {
  assert.equal(L.kategorier.find((k) => k.id === "film").navn, "Film, TV og spill");
  for (const t of ["A Whole New World", "Under the Sea", "Circle of Life", "We Don't Talk About Bruno", "Kvinne min"]) assert.ok(!alle.some((l) => l.t === t), `${t} skal ikke være med`);
  for (const t of ["En helt ny verden", "Snakker ikke om Bruno", "La den gå"]) assert.ok(alle.some((l) => l.t === t), `${t} mangler`);
});
