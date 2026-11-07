// Unit tests for the game core. Run: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const K = require("../src/kjerne.js");

// Synthetic word data: 32 categories × 100 words, difficulty cycling 1,2,3.
function lagTestdata(antallKat = 32, perKat = 100) {
  const kategorier = [];
  for (let k = 0; k < antallKat; k++) {
    const ord = [];
    for (let i = 0; i < perKat; i++) ord.push([`Ord ${k}-${i}`, (i % 3) + 1, `Hint ${k}-${i}`, `Likt ${k}-${i}`]);
    kategorier.push({ id: `kat${k}`, navn: `Kategori ${k}`, ikon: "★", ord });
  }
  return { hash: 123456789, kategorier };
}
const DATA = lagTestdata();

test("rng is deterministic and in [0, 1)", () => {
  const a = K.rng(42);
  const b = K.rng(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test("stokk returns a permutation", () => {
  const liste = Array.from({ length: 50 }, (_, i) => i);
  const stokket = K.stokk(liste.slice(), K.rng(7));
  assert.deepEqual([...stokket].sort((a, b) => a - b), liste);
  assert.notDeepEqual(stokket, liste);
});

test("maksLuringer follows the player count", () => {
  assert.deepEqual(
    [3, 4, 5, 6, 7, 8, 9, 10].map(K.maksLuringer),
    [1, 1, 1, 2, 2, 2, 3, 3],
  );
});

test("byggPott respects level difficulty", () => {
  const lett = K.byggPott(DATA, null, 0);
  assert.ok(lett.every((p) => K.hentOrd(DATA, p).vanske === 1));
  const vanskelig = K.byggPott(DATA, null, 2);
  assert.ok(vanskelig.every((p) => K.hentOrd(DATA, p).vanske >= 2));
  // i % 3 + 1 over 100 words → 34 × n1, 33 × n2, 33 × n3 per category
  assert.equal(K.byggPott(DATA, null, 1).length, 32 * (34 + 33));
});

test("byggPott limits to chosen categories and falls back when too few words", () => {
  const pott = K.byggPott(DATA, ["kat3", "kat7"], 0);
  assert.ok(pott.every((p) => ["kat3", "kat7"].includes(K.hentOrd(DATA, p).kategori.id)));
  const liten = lagTestdata(2, 10); // 10 words per category → under MIN_POTT for one difficulty
  const fallback = K.byggPott(liten, ["kat0"], 0);
  assert.equal(fallback.length, 10);
});

test("same seed and round give the same word and roles on every device", () => {
  const oppsett = { spillere: 7, luringer: 2, niva: 1, kategorier: null, seed: 98765 };
  for (let runde = 1; runde <= 20; runde++) {
    const a = K.lagRunde(DATA, oppsett, runde);
    const b = K.lagRunde(DATA, oppsett, runde);
    assert.deepEqual(a, b);
    assert.equal(a.luringer.length, 2);
    assert.equal(new Set(a.luringer).size, 2);
    assert.ok(a.luringer.every((p) => p >= 0 && p < 7));
    assert.ok(a.starter >= 0 && a.starter < 7);
  }
});

test("no repeated words within a game until the pot is used up", () => {
  const oppsett = { spillere: 5, luringer: 1, niva: 1, kategorier: null, seed: 4242 };
  const rekkefolge = K.ordRekkefolge(DATA, oppsett);
  const sett = new Set();
  for (let runde = 1; runde <= 200; runde++) sett.add(K.lagRunde(DATA, oppsett, runde, { rekkefolge }).nokkel);
  assert.equal(sett.size, 200);
});

test("unnga skips recently used words", () => {
  const oppsett = { spillere: 5, luringer: 1, niva: 0, kategorier: null, seed: 1 };
  const forste = K.lagRunde(DATA, oppsett, 1);
  const neste = K.lagRunde(DATA, oppsett, 1, { unnga: new Set([forste.nokkel]) });
  assert.notEqual(neste.nokkel, forste.nokkel);
  assert.equal(neste.posisjon, forste.posisjon + 1);
});

test("imposters are spread evenly over seats", () => {
  const telling = new Array(10).fill(0);
  const runder = 20000;
  for (let r = 1; r <= runder; r++) {
    const { luringer } = K.fordelRoller({ spillere: 10, luringer: 1, seed: 777 }, r);
    telling[luringer[0]]++;
  }
  const forventet = runder / 10;
  for (const n of telling) assert.ok(Math.abs(n - forventet) < forventet * 0.1, `skjev fordeling: ${telling}`);
});

test("kortFor shows the right card per level", () => {
  const oppsett = { spillere: 4, luringer: 1, niva: 0, kategorier: null, seed: 5 };
  const runde = K.lagRunde(DATA, oppsett, 1);
  const luring = runde.luringer[0];
  const vanlig = (luring + 1) % 4;

  assert.deepEqual(K.kortFor(runde, oppsett, vanlig), { type: "ord", ord: runde.ord, kategori: runde.kategori });
  assert.deepEqual(K.kortFor(runde, { ...oppsett, niva: 0 }, luring), { type: "luring", kategori: runde.kategori, hint: runde.hint });
  assert.deepEqual(K.kortFor(runde, { ...oppsett, niva: 1 }, luring), { type: "luring", kategori: runde.kategori, hint: null });
  assert.deepEqual(K.kortFor(runde, { ...oppsett, niva: 2 }, luring), { type: "luring", kategori: null, hint: null });
  assert.deepEqual(K.kortFor(runde, { ...oppsett, niva: 3 }, luring), { type: "ord", ord: runde.lignende, kategori: runde.kategori, kaos: true });
});

test("poengForRunde gives 2 to winning imposters and 1 to the winning group", () => {
  assert.deepEqual(K.poengForRunde(5, [1, 3], true), [0, 2, 0, 2, 0]);
  assert.deepEqual(K.poengForRunde(5, [1, 3], false), [1, 0, 1, 0, 1]);
});

test("join code round-trips all settings", () => {
  const tilfeldig = K.rng(2024);
  for (let i = 0; i < 2000; i++) {
    const spillere = 3 + Math.floor(tilfeldig() * 8);
    const luringer = 1 + Math.floor(tilfeldig() * K.maksLuringer(spillere));
    const niva = Math.floor(tilfeldig() * 4);
    const alle = tilfeldig() < 0.5;
    const kategorier = alle ? null : DATA.kategorier.filter(() => tilfeldig() < 0.3).map((k) => k.id);
    const oppsett = { spillere, luringer, niva, kategorier: kategorier && kategorier.length ? kategorier : ["kat0"], seed: Math.floor(tilfeldig() * 0x2000000) };
    if (alle) oppsett.kategorier = null;
    const kode = K.lagKode(oppsett, DATA);
    assert.equal(kode.length, alle ? 8 : 15);
    const lest = K.lesKode(K.formaterKode(kode).toLowerCase(), DATA);
    assert.ok(lest.ok, `kunne ikke lese ${kode}: ${lest.feil}`);
    assert.deepEqual(lest.oppsett, oppsett);
  }
});

test("join code detects typos and other word-list versions", () => {
  const oppsett = { spillere: 6, luringer: 2, niva: 2, kategorier: null, seed: 31337 };
  const kode = K.lagKode(oppsett, DATA);
  let oppdaget = 0;
  let totalt = 0;
  const alfabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  for (let pos = 0; pos < kode.length; pos++) {
    for (const c of alfabet) {
      if (c === kode[pos]) continue;
      totalt++;
      const feil = kode.slice(0, pos) + c + kode.slice(pos + 1);
      if (!K.lesKode(feil, DATA).ok) oppdaget++;
    }
  }
  assert.ok(oppdaget / totalt > 0.9, `bare ${oppdaget}/${totalt} skrivefeil oppdaget`);
  assert.equal(K.lesKode(kode, { ...DATA, hash: 1 }).ok, false);
  assert.equal(K.lesKode("", DATA).feil, "tom");
  assert.equal(K.lesKode("ABC", DATA).feil, "kort");
});

test("normaliserKode handles look-alike characters", () => {
  assert.equal(K.normaliserKode(" ab-cd o1 il u "), "ABCD0111V");
  assert.equal(K.formaterKode("abcd1234"), "ABCD-1234");
});

// Checks against the real word list once it has been built (node scripts/bygg.mjs).
const ordFil = new URL("../build/ord.json", import.meta.url);
test("real word list: every level has words and codes round-trip", { skip: !existsSync(ordFil) }, () => {
  const data = JSON.parse(readFileSync(ordFil, "utf8"));
  assert.ok(data.kategorier.length >= 1);
  for (let niva = 0; niva < 4; niva++) assert.ok(K.antallOrd(data, null, niva) >= 100, `nivå ${niva} har for få ord`);
  const oppsett = { spillere: 10, luringer: 3, niva: 3, kategorier: [data.kategorier[0].id], seed: 99 };
  const lest = K.lesKode(K.lagKode(oppsett, data), data);
  assert.ok(lest.ok);
  assert.deepEqual(lest.oppsett, oppsett);
});
