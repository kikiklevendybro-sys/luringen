// Hermegåsa (follow the pattern): every pad has its own shape, colour and tone; the row from a seed
// is the same every time, uses every pad and never has three alike in a row; a tap is right, ends
// the round or is a slip; the tempo grows quicker but never too quick; the levels.
// Loads rusj/spill/hermegasa/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/hermegasa/spill.js"), "utf8"), kontekst);
const { BRIKKER, NIVAER, Regler, MAKS } = kontekst.window.Hermegasa;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("six pads: each its own shape, colour, tone and name (colour-blind safe: the shapes differ)", () => {
  assert.equal(BRIKKER.length, 6);
  for (const felt of ["id", "farge", "tone", "navn"]) assert.equal(new Set(BRIKKER.map((b) => b[felt])).size, 6, felt);
  // The tones rise from pad to pad, so the order can be heard.
  for (let i = 1; i < 6; i++) assert.ok(BRIKKER[i].tone > BRIKKER[i - 1].tone);
});

test("the levels: four, four and six pads; fewer chances and quicker as it gets harder", () => {
  assert.deepEqual([1, 2, 3].map((n) => NIVAER[n].brikker), [4, 4, 6]);
  assert.ok(NIVAER[1].sjanser > NIVAER[2].sjanser && NIVAER[2].sjanser > NIVAER[3].sjanser && NIVAER[3].sjanser === 0);
  assert.ok(NIVAER[1].pa > NIVAER[2].pa && NIVAER[2].pa > NIVAER[3].pa);
});

test("a row: the same seed gives the same row, only the level's pads, never three alike in a row", () => {
  for (const n of [4, 6])
    for (let fro = 1; fro <= 300; fro++) {
      const a = Regler.rekke(n, rng(fro));
      assert.deepEqual(Array.from(a), Array.from(Regler.rekke(n, rng(fro))));
      assert.equal(a.length, MAKS);
      for (let i = 0; i < a.length; i++) {
        assert.ok(Number.isInteger(a[i]) && a[i] >= 0 && a[i] < n, `pad ${a[i]} on a board of ${n}`);
        if (i >= 2) assert.ok(!(a[i] === a[i - 1] && a[i] === a[i - 2]), `three alike in a row (seed ${fro}, place ${i})`);
      }
    }
});

test("rows use every pad about as often", () => {
  for (const n of [4, 6]) {
    const tall = Array(n).fill(0);
    for (let fro = 1; fro <= 200; fro++) for (const b of Regler.rekke(n, rng(fro))) tall[b]++;
    const snitt = (200 * MAKS) / n;
    for (const t of tall) assert.ok(Math.abs(t - snitt) / snitt < 0.08, `uneven: ${tall}`);
  }
});

test("a tap: right goes on, the last right one ends the round, a wrong one is a slip", () => {
  const rad = [2, 0, 3, 1];
  assert.equal(Regler.trykk(rad, 1, 0, 2), "runde");
  assert.equal(Regler.trykk(rad, 3, 0, 2), "riktig");
  assert.equal(Regler.trykk(rad, 3, 1, 0), "riktig");
  assert.equal(Regler.trykk(rad, 3, 2, 3), "runde");
  assert.equal(Regler.trykk(rad, 3, 1, 3), "feil");
  assert.equal(Regler.trykk(rad, 1, 0, 0), "feil");
});

test("copying a whole game: every round of a row is copied with its own pads", () => {
  const rad = Regler.rekke(4, rng(7));
  for (let runde = 1; runde <= 20; runde++)
    for (let steg = 0; steg < runde; steg++) assert.equal(Regler.trykk(rad, runde, steg, rad[steg]), steg === runde - 1 ? "runde" : "riktig");
});

test("the tempo: quicker as the row grows, never below the level's floor", () => {
  for (const n of [1, 2, 3]) {
    let forrige = Infinity;
    for (let runde = 1; runde <= MAKS; runde++) {
      const { pa, av } = Regler.fart(n, runde);
      assert.ok(pa <= forrige, "slower again");
      assert.ok(pa >= NIVAER[n].min && av >= 80, `too quick at round ${runde}: ${pa}/${av}`);
      forrige = pa;
    }
    assert.equal(Regler.fart(n, 1).pa, NIVAER[n].pa);
  }
});
