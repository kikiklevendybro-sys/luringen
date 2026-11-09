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
  for (let i = 0; i < 300; i++) {
    const verdier = [R.heltall(0, 2 ** 25 - 1), R.heltall(0, 15), R.heltall(0, 3), R.heltall(0, 1)];
    const kode = R.kode.lag(verdier, bredder, 12345);
    assert.equal(kode.length, R.kode.lengde(bredder));
    assert.deepEqual(R.kode.les(kode, bredder, 12345), verdier);
    assert.deepEqual(R.kode.les(R.kode.formater(kode).toLowerCase(), bredder, 12345), verdier, "case and spaces don't matter");
    assert.equal(R.kode.les(kode, bredder, 999), null, "another salt (other content) is rejected");
  }
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
