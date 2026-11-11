// Nynneren's song list: no duplicates, valid levels and years, artists on ambiguous titles,
// Norwegian Disney titles, and enough newer songs (2010–2025) for «Bare nyere låter» and Jul.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = JSON.parse(readFileSync(new URL("../rusj/spill/nynneren/data/laater.json", import.meta.url), "utf8"));
const alle = L.kategorier.flatMap((k) => k.laater.map((l) => ({ k: k.id, t: l[0], n: l[1], a: l[2], y: l[3], l })));
const nye = alle.filter((l) => l.y >= 2010);

test("minst 700 låter, ingen dubletter, nivå 1–3", () => {
  assert.ok(alle.length >= 700, `bare ${alle.length}`);
  const sett = new Set();
  for (const l of alle) {
    const k = l.t.toLowerCase().replace(/[^a-zæøå0-9]/g, "");
    assert.ok(!sett.has(k), `dublett: ${l.t}`);
    sett.add(k);
    assert.ok([1, 2, 3].includes(l.n), `nivå: ${l.t}`);
  }
});

test("hver låt er [tittel, nivå, artist?, år?] med kort tittel og gyldig år", () => {
  for (const { t, a, y, l } of alle) {
    assert.ok(l.length >= 2 && l.length <= 4, JSON.stringify(l));
    assert.ok(typeof t === "string" && t === t.trim() && t.length >= 2 && t.length <= 60 && !/\s\s/.test(t), `«${t}»`);
    if (l.length >= 3) assert.ok(typeof a === "string" && a === a.trim(), `${t}: artist`);
    if (l.length === 4) assert.ok(Number.isInteger(y) && y >= 1900 && y <= 2025, `${t}: år ${y}`);
  }
});

test("minst 150 nyere låter (2010–2025), alle med artist, spredt over begge tiårene", () => {
  assert.ok(nye.length >= 150, `bare ${nye.length} fra 2010 og senere`);
  for (const l of nye) assert.ok(l.a, `${l.t} mangler artist`);
  assert.ok(nye.filter((l) => l.y >= 2020).length >= 40, "for få fra 2020-tallet");
  for (const n of [1, 2, 3]) assert.ok(nye.filter((l) => l.n === n).length >= 20, `for få nyere låter på nivå ${n}`);
});

test("kategoriene: unike id-er, nye kategorier sist, Jul med nyere julelåter", () => {
  const id = L.kategorier.map((k) => k.id);
  assert.deepEqual(id, ["barn", "jul", "norske", "allsang", "pop", "film", "hymner", "hits", "norskpop", "mgp"]);
  for (const k of L.kategorier) for (const f of ["id", "navn", "ikon"]) assert.ok(typeof k[f] === "string" && k[f], `${k.id}: ${f}`);
  assert.ok(L.kategorier.find((k) => k.id === "jul").laater.filter((l) => l[3] >= 2010).length >= 8, "for få nyere julelåter");
  for (const k of ["hits", "norskpop"]) assert.ok(L.kategorier.find((x) => x.id === k).laater.every((l) => l[3] >= 2010), `${k}: bare låter fra 2010`);
});

test("tvetydige titler har artist", () => {
  for (const t of ["Crazy", "Kiss", "Gloria", "Glow", "Faded", "Halo", "Valerie", "Smooth", "Mercy", "Jump", "Angels", "Children", "Hello", "Stay", "Heroes", "Alone", "Perfect", "Closer"]) {
    const l = alle.find((x) => x.t === t);
    assert.ok(l && l.a, `${t} mangler artist`);
  }
});

test("kategori og norske Disney-titler", () => {
  assert.equal(L.kategorier.find((k) => k.id === "film").navn, "Film, TV og spill");
  for (const t of ["A Whole New World", "Under the Sea", "Circle of Life", "We Don't Talk About Bruno", "How Far I'll Go", "Let It Go", "Kvinne min"]) assert.ok(!alle.some((l) => l.t === t), `${t} skal ikke være med`);
  for (const t of ["En helt ny verden", "Snakker ikke om Bruno", "La den gå", "Hvor langt jeg må"]) assert.ok(alle.some((l) => l.t === t), `${t} mangler`);
});
