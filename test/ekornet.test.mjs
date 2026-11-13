// Ekornet (times tables and mental maths): the question generator (the right answers, only the
// chosen tables, plus and minus inside the limit, whole answers for division, mental-maths pairs
// up to 100), rounds (the length asked for, never the same question twice in a row, no repeats
// before the pool is used up, the weak facts more often), the four answers to choose from, the level
// of a fact and the progress per table, and the stars. Loads rusj/spill/ekornet/spill.js without the kit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/ekornet/spill.js"), "utf8"), kontekst);
const { Oppgaver, TABELLER, LAERT } = kontekst.window.Ekornet;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const regn = (q) => ({ gange: q.a * q.b, deling: q.a / q.b, pluss: q.a + q.b, minus: q.a - q.b })[q.op];

test("times tables: every fact of the chosen tables once, with the right answer", () => {
  const p = Oppgaver.pulje("gange", { tabeller: [3, 7] });
  assert.equal(p.length, 20);
  assert.equal(new Set(p.map((q) => q.k)).size, 20);
  for (const q of p) {
    assert.equal(q.svar, regn(q));
    assert.ok([3, 7].includes(q.b) && q.a >= 1 && q.a <= 10);
    assert.equal(q.t, q.b);
  }
  assert.equal(Oppgaver.pulje("gange", { tabeller: TABELLER }).length, 100);
});

test("division: whole answers 1–10, divided by a chosen table", () => {
  for (const q of Oppgaver.pulje("deling", { tabeller: TABELLER })) {
    assert.equal(q.svar, regn(q));
    assert.ok(Number.isInteger(q.svar) && q.svar >= 1 && q.svar <= 10);
    assert.ok(q.a % q.b === 0);
  }
});

test("plus and minus stay inside the limit; minus never goes below zero", () => {
  for (const til of [10, 20, 100]) {
    const pluss = Oppgaver.pulje("pluss", { til });
    const minus = Oppgaver.pulje("minus", { til });
    assert.ok(pluss.length > 20 && minus.length > 20);
    for (const q of pluss) {
      assert.equal(q.svar, regn(q));
      assert.ok(q.a >= 1 && q.b >= 1 && q.svar <= til);
    }
    for (const q of minus) {
      assert.equal(q.svar, regn(q));
      assert.ok(q.svar >= 0 && q.a <= til && q.b >= 1);
    }
  }
  // Up to 100: pairs for the head, never two carries (like 47 + 38).
  for (const q of Oppgaver.pulje("pluss", { til: 100 })) assert.ok(q.a % 10 === 0 || q.b % 10 === 0 || (q.a % 10) + (q.b % 10) <= 10, `${q.a} + ${q.b}`);
  assert.equal(Oppgaver.pulje("pluss", { til: 10 }).length, 45);
});

test("a round: the length asked for, never the same question twice in a row, all of the pool before a repeat", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const r = rng(fro);
    const pulje = Oppgaver.pulje("gange", { tabeller: [2, 5] });
    const runde = Oppgaver.runde(pulje, 20, {}, r, false);
    assert.equal(runde.length, 20);
    assert.equal(new Set(runde.map((q) => q.k)).size, 20, "a repeat before the pool was used up");
    const en = Oppgaver.runde(Oppgaver.pulje("gange", { tabeller: [7] }), 20, {}, r, true);
    assert.equal(en.length, 20);
    for (let i = 1; i < en.length; i++) assert.notEqual(en[i].k, en[i - 1].k, "the same question twice in a row");
    assert.equal(new Set(en.slice(0, 10).map((q) => q.k)).size, 10, "the first pass of one table must cover all ten");
  }
});

test("practice weighs the facts you know least: they come up more often", () => {
  const pulje = Oppgaver.pulje("gange", { tabeller: [6, 8] });
  // Everything of the 6-table is learnt; the 8-table is new.
  const fakta = {};
  for (let f = 1; f <= 10; f++) fakta[`g6x${f}`] = 3;
  let seks = 0;
  let atte = 0;
  for (let fro = 1; fro <= 400; fro++) {
    for (const q of Oppgaver.runde(pulje, 10, fakta, rng(fro), true)) q.b === 6 ? seks++ : atte++;
  }
  assert.ok(atte > seks * 2.5, `8-gangen ${atte}, 6-gangen ${seks}`);
  // Without weights the two come about as often.
  seks = atte = 0;
  for (let fro = 1; fro <= 400; fro++) for (const q of Oppgaver.runde(pulje, 10, fakta, rng(fro), false)) q.b === 6 ? seks++ : atte++;
  assert.ok(Math.abs(seks - atte) < 400, `${seks} / ${atte}`);
});

test("four answers: the right one among three near ones, all different, none negative, sorted", () => {
  for (const [art, o] of [["gange", { tabeller: TABELLER }], ["deling", { tabeller: TABELLER }], ["pluss", { til: 20 }], ["minus", { til: 10 }], ["pluss", { til: 100 }]]) {
    const r = rng(art.length + o.til || 3);
    for (const q of Oppgaver.pulje(art, o)) {
      const v = Oppgaver.valg(q, r);
      assert.equal(v.length, 4);
      assert.equal(new Set(v).size, 4);
      assert.ok(v.includes(q.svar));
      assert.ok(v.every((x) => Number.isInteger(x) && x >= 0));
      assert.deepEqual(Array.from(v), Array.from(v).slice().sort((a, b) => a - b));
      // Near: within ten of the answer or a table step away.
      assert.ok(v.every((x) => Math.abs(x - q.svar) <= Math.max(10, q.a, q.b, 3) || String(x) === String(q.svar).split("").reverse().join("")), `${JSON.stringify(q)} → ${v}`);
    }
  }
});

test("the right answer is not always in the same place", () => {
  const steder = new Set();
  const r = rng(5);
  for (const q of Oppgaver.pulje("gange", { tabeller: [4, 6, 9] })) steder.add(Oppgaver.valg(q, r).indexOf(q.svar));
  assert.equal(steder.size, 4);
});

test("the level of a fact: right +1 up to 3, wrong −1 down to 0; learnt from level 2", () => {
  assert.equal(Oppgaver.niva(undefined, true), 1);
  assert.equal(Oppgaver.niva(1, true), 2);
  assert.equal(Oppgaver.niva(3, true), 3);
  assert.equal(Oppgaver.niva(2, false), 1);
  assert.equal(Oppgaver.niva(0, false), 0);
  assert.equal(LAERT, 2);
  const fakta = { g7x1: 2, g7x2: 3, g7x3: 1, d7_x: 3, "d7:4": 2 };
  assert.equal(Oppgaver.tabell(fakta, "gange", 7), 2);
  assert.equal(Oppgaver.tabell(fakta, "deling", 7), 1);
  assert.equal(Oppgaver.tabell({}, "gange", 3), 0);
  const alle = {};
  for (let f = 1; f <= 10; f++) alle[`g9x${f}`] = 2;
  assert.equal(Oppgaver.tabell(alle, "gange", 9), 10);
  // The ring fills a little with every right answer: half when every fact is right once.
  const en = {};
  for (let f = 1; f <= 10; f++) en[`g4x${f}`] = 1;
  assert.equal(Oppgaver.andel(en, "gange", 4), 0.5);
  assert.equal(Oppgaver.andel(alle, "gange", 9), 1);
  assert.equal(Oppgaver.andel({ g9x1: 3 }, "gange", 9), 0.1);
});

test("stars for a challenge: 20 three, 16 two, 10 one, fewer none", () => {
  assert.equal(Oppgaver.stjerner(20, 20), 3);
  assert.equal(Oppgaver.stjerner(19, 20), 2);
  assert.equal(Oppgaver.stjerner(16, 20), 2);
  assert.equal(Oppgaver.stjerner(15, 20), 1);
  assert.equal(Oppgaver.stjerner(10, 20), 1);
  assert.equal(Oppgaver.stjerner(9, 20), 0);
});
