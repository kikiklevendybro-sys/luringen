// Unit tests for the pure parts of the rusj kit (join codes, answer matching, decks, randomness).
// Loads rusj/kit/rusj.js in a small fake browser (node:vm) — no DOM needed for these functions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");

function lastKit() {
  const lager = new Map();
  const window = {
    RUSJ_SPILL: { id: "testspill", navn: "Testspill" },
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    location: { protocol: "http:", origin: "http://lokal", pathname: "/testspill/", hash: "" },
  };
  window.self = window;
  window.top = window;
  const kontekst = {
    window,
    localStorage: {
      getItem: (k) => (lager.has(k) ? lager.get(k) : null),
      setItem: (k, v) => lager.set(k, String(v)),
      removeItem: (k) => lager.delete(k),
    },
    navigator: {},
    document: { addEventListener() {}, documentElement: {} },
    crypto: globalThis.crypto,
    location: window.location,
    history: { pushState() {}, replaceState() {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
  };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/rusj.js"), "utf8"), kontekst);
  return { R: window.Rusj, lager };
}

test("join codes round-trip and reject wrong salt or typos", () => {
  const { R } = lastKit();
  const bredder = [25, 4, 2, 1];
  const tilf = R.rng(2026); // fixed seed: the counts below are the same on every run
  let annetSalt = 0;
  let annetSalt2 = 0;
  for (let i = 0; i < 300; i++) {
    const verdier = [R.heltall(0, 2 ** 25 - 1, tilf), R.heltall(0, 15, tilf), R.heltall(0, 3, tilf), R.heltall(0, 1, tilf)];
    const kode = R.kode.lag(verdier, bredder, 12345);
    assert.equal(kode.length, R.kode.lengde(bredder));
    assert.deepEqual(R.kode.les(kode, bredder, 12345), verdier);
    assert.deepEqual(R.kode.les(R.kode.formater(kode).toLowerCase(), bredder, 12345), verdier, "case and spaces don't matter");
    if (R.kode.les(kode, bredder, 999) !== null) annetSalt++;
    if (R.kode.les(R.kode.lag(verdier, bredder, 12345, 2), bredder, 999, 2) !== null) annetSalt2++;
  }
  // One check symbol lets about 1 in 32 through by chance; two symbols about 1 in 1024.
  assert.ok(annetSalt <= 24, `another salt accepted ${annetSalt}/300 with one check symbol`);
  assert.ok(annetSalt2 <= 2, `another salt accepted ${annetSalt2}/300 with two check symbols`);
  const kode = R.kode.lag([123456, 7, 2, 1], bredder, 1);
  let avvist = 0;
  for (let p = 0; p < kode.length; p++) {
    const feil = kode.slice(0, p) + (kode[p] === "7" ? "8" : "7") + kode.slice(p + 1);
    if (R.kode.les(feil, bredder, 1) === null) avvist++;
  }
  assert.ok(avvist >= kode.length - 1, `most single typos are caught (${avvist}/${kode.length})`);
  assert.equal(R.kode.les("ABC", bredder, 1), null);
  assert.throws(() => R.kode.lag([16], [4], 0));
});

test("two check symbols catch (nearly) every typo and keep one-symbol codes unchanged", () => {
  const { R } = lastKit();
  const bredder = [25, 4, 2, 1];
  const verdier = [987654, 9, 1, 0];
  const en = R.kode.lag(verdier, bredder, 77);
  const to = R.kode.lag(verdier, bredder, 77, 2);
  assert.equal(to.length, en.length + 1);
  assert.equal(to.slice(0, en.length), en, "the first check symbol is the same as before");
  assert.deepEqual(R.kode.les(to, bredder, 77, 2), verdier);
  assert.equal(R.kode.les(en, bredder, 77, 2), null, "a one-symbol code isn't read as a two-symbol code");
  let godtatt = 0;
  for (let i = 0; i < 20000; i++) {
    const tilfeldig = Array.from({ length: to.length }, () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)]).join("");
    if (R.kode.les(tilfeldig, bredder, 77, 2)) godtatt++;
  }
  assert.ok(godtatt < 60, `random codes accepted: ${godtatt} of 20000 (should be ~0.1 %)`);
});

// Codes, links and daily puzzles are computed on every phone from these functions; a change would
// make codes in use invalid, give Nissen links other recipients, or a different «dagens» puzzle.
// If one of these values changes on purpose, it is a breaking change for everyone mid-game.
test("codes, hashes, seeded randomness and the daily date never change", () => {
  const { R } = lastKit();
  assert.equal(R.kode.lag([123456, 7, 2, 1], [25, 4, 2, 1], 1), "03RJ0F8R");
  assert.equal(R.kode.lag([987654, 9, 1, 0], [25, 4, 2, 1], 77, 2), "0Y4G6JGC1");
  assert.equal(R.hash("rusj.no"), 1140757162);
  const r = R.rng(42);
  assert.deepEqual([r(), r(), r()], [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  assert.deepEqual(R.stokk([1, 2, 3, 4, 5, 6, 7, 8], R.rng(7)), [5, 7, 2, 3, 4, 6, 8, 1]);
  // Oslo time: past midnight in Norway is already the next day, in winter and in summer.
  assert.deepEqual({ ...R.dag(new Date("2026-11-09T23:30:00Z")) }, { tekst: "2026-11-10", nr: 20767 });
  assert.deepEqual({ ...R.dag(new Date("2026-07-01T21:59:00Z")) }, { tekst: "2026-07-01", nr: 20635 });
  assert.deepEqual({ ...R.dag(new Date("2026-07-01T22:01:00Z")) }, { tekst: "2026-07-02", nr: 20636 });
});

test("code normalisation forgives look-alike letters", () => {
  const { R } = lastKit();
  assert.equal(R.kode.normaliser("o0 iI lL-u"), "001111V");
  assert.equal(R.kode.formater("ABCDEFGH"), "ABCD EFGH");
});

test("normaliser compares typed answers fairly", () => {
  const { R } = lastKit();
  assert.equal(R.normaliser("  Blåbær!! "), "blåbær");
  assert.equal(R.normaliser("CAFÉ"), "cafe");
  assert.equal(R.normaliser("Ærlig-Øl"), "ærlig øl");
  assert.equal(R.normaliser("To   ord"), "to ord");
  assert.notEqual(R.normaliser("bær"), R.normaliser("bar"), "æ/ø/å are real letters");
});

test("seeded randomness is repeatable", () => {
  const { R } = lastKit();
  const a = R.rng(42);
  const b = R.rng(42);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  assert.deepEqual(R.stokk([1, 2, 3, 4, 5, 6], R.rng(7)), R.stokk([1, 2, 3, 4, 5, 6], R.rng(7)));
  assert.deepEqual(R.stokk([1, 2, 3, 4, 5, 6]).sort(), [1, 2, 3, 4, 5, 6]);
});

test("deck shows every card before repeating and remembers across loads", () => {
  const { R, lager } = lastKit();
  const stokk = R.kortstokk("kort", 10);
  const sett = new Set();
  for (let i = 0; i < 10; i++) sett.add(stokk.neste());
  assert.equal(sett.size, 10, "all ten before any repeat");
  const forrige = stokk.neste();
  assert.ok(forrige >= 0 && forrige < 10);
  assert.ok([...lager.keys()].includes("rusj.testspill.brukt.kort"));

  const filtrert = R.kortstokk("partall", 20);
  for (let i = 0; i < 30; i++) assert.equal(filtrert.neste((n) => n % 2 === 0) % 2, 0);
  assert.equal(filtrert.neste(() => false), -1, "empty filter gives -1");
});

test("time formatting", () => {
  const { R } = lastKit();
  assert.equal(R.formaterTid(0), "0:00");
  assert.equal(R.formaterTid(59.2), "1:00");
  assert.equal(R.formaterTid(125), "2:05");
});
