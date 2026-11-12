// Stigespillet (ladders and slides): the back-and-forth numbering, ladders and slides, the exact
// finish rule, the extra roll on a six, the ranking, and that every board is valid (nothing starts
// on 1 or 100 or where something else ends, no loops). Pure functions from
// rusj/spill/stigespillet/spill.js, loaded in node:vm without the kit (window.RusjStige).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/stigespillet/spill.js"), "utf8"), { window, console });
const F = window.RusjStige;
const ren = (x) => JSON.parse(JSON.stringify(x));
const LITE = { stiger: [[3, 22], [80, 99]], sklier: [[47, 26], [98, 79]] };

test("boustrophedon: 1 bottom left, 10 bottom right, 11 above 10, 100 top left", () => {
  assert.deepEqual(ren(F.rute(1)), { kol: 0, rad: 0 });
  assert.deepEqual(ren(F.rute(10)), { kol: 9, rad: 0 });
  assert.deepEqual(ren(F.rute(11)), { kol: 9, rad: 1 });
  assert.deepEqual(ren(F.rute(20)), { kol: 0, rad: 1 });
  assert.deepEqual(ren(F.rute(21)), { kol: 0, rad: 2 });
  assert.deepEqual(ren(F.rute(55)), { kol: 5, rad: 5 });
  assert.deepEqual(ren(F.rute(91)), { kol: 9, rad: 9 });
  assert.deepEqual(ren(F.rute(100)), { kol: 0, rad: 9 });
  assert.deepEqual(ren(F.midt(1)), [0.5, 9.5]);
  assert.deepEqual(ren(F.midt(100)), [0.5, 0.5]);
  // every square exactly once, and neighbours always touch
  const sett = new Set();
  for (let n = 1; n <= 100; n++) {
    const { kol, rad } = F.rute(n);
    sett.add(`${kol},${rad}`);
    if (n > 1) {
      const a = F.rute(n - 1);
      assert.equal(Math.abs(a.kol - kol) + Math.abs(a.rad - rad), 1, `${n - 1} and ${n} are neighbours`);
    }
  }
  assert.equal(sett.size, 100);
});

test("a plain roll walks forward", () => {
  const t = F.trekk(1, 4, LITE, { seks: true });
  assert.equal(t.mal, 5);
  assert.equal(t.til, 5);
  assert.equal(t.via, null);
  assert.equal(t.vant, false);
  assert.equal(t.ekstra, false);
});

test("the foot of a ladder takes you up, the top of a slide down", () => {
  const opp = F.trekk(1, 2, LITE, {});
  assert.deepEqual([opp.mal, opp.til, opp.via], [3, 22, "stige"]);
  const ned = F.trekk(44, 3, LITE, {});
  assert.deepEqual([ned.mal, ned.til, ned.via], [47, 26, "skli"]);
  // passing over a ladder or slide does nothing
  assert.equal(F.trekk(1, 3, LITE, {}).til, 4);
  assert.equal(F.trekk(45, 4, LITE, {}).til, 49);
  // the top of a ladder and the bottom of a slide are ordinary squares
  assert.equal(F.trekk(20, 2, LITE, {}).via, null);
  assert.equal(F.trekk(24, 2, LITE, {}).via, null);
});

test("a ladder to 99 and a six: no win; landing on 100 wins", () => {
  assert.equal(F.trekk(74, 6, LITE, { seks: true }).til, 99);
  const v = F.trekk(96, 4, LITE, { seks: true });
  assert.equal(v.til, 100);
  assert.equal(v.vant, true);
});

test("exact finish: too much stands still; without it, going past 100 is home", () => {
  const eksakt = F.trekk(97, 5, LITE, { eksakt: true });
  assert.equal(eksakt.forLangt, true);
  assert.equal(eksakt.til, 97);
  assert.equal(eksakt.vant, false);
  assert.equal(F.trekk(97, 3, LITE, { eksakt: true }).vant, true);
  const fri = F.trekk(97, 5, LITE, { eksakt: false });
  assert.equal(fri.forLangt, false);
  assert.equal(fri.til, 100);
  assert.equal(fri.vant, true);
  // 98 is a slide top: exact rule from 95 with 3 lands on it
  assert.equal(F.trekk(95, 3, LITE, { eksakt: true }).til, 79);
});

test("a six gives an extra roll (when the rule is on), but not after winning", () => {
  assert.equal(F.trekk(10, 6, LITE, { seks: true }).ekstra, true);
  assert.equal(F.trekk(10, 6, LITE, { seks: false }).ekstra, false);
  assert.equal(F.trekk(10, 5, LITE, { seks: true }).ekstra, false);
  assert.equal(F.trekk(94, 6, LITE, { seks: true }).ekstra, false, "a win ends the game");
  assert.equal(F.trekk(97, 6, LITE, { seks: true, eksakt: true }).ekstra, true, "standing still on a six still rolls again");
  assert.equal(F.trekk(41, 6, LITE, { seks: true }).via, "skli");
  assert.equal(F.trekk(41, 6, LITE, { seks: true }).ekstra, true);
});

test("every board is valid", () => {
  assert.ok(F.BRETTLISTE.length >= 3);
  for (const id of F.BRETTLISTE) {
    const b = F.BRETT[id];
    assert.deepEqual(ren(F.sjekkBrett(b)), [], `${id} has problems`);
    assert.ok(b.stiger.length >= 5 && b.sklier.length >= 5, `${id} has enough ladders and slides`);
    const starter = [...b.stiger, ...b.sklier].map(([f]) => f);
    const ender = [...b.stiger, ...b.sklier].map(([, t]) => t);
    assert.ok(!starter.includes(1) && !starter.includes(100), `${id}: nothing starts on 1 or 100`);
    assert.ok(starter.every((s) => !ender.includes(s)), `${id}: nothing starts where something ends`);
    assert.equal(new Set(ender).size, ender.length, `${id}: two things end on the same square`);
    for (const n of Object.keys(b.pynt)) assert.ok(Number(n) >= 2 && Number(n) <= 99 && !starter.includes(Number(n)) && !ender.includes(Number(n)), `${id}: decoration on ${n} hides a ladder or slide end`);
    // slide curves stay on the board
    b.sklier.forEach(([f, t], nr) => {
      const k = F.skliKurve(f, t, nr);
      for (let s = 0; s <= 20; s++) {
        const [x, y] = F.punkt(k, s / 20);
        assert.ok(x >= 0 && x <= 10 && y >= 0 && y <= 10, `${id}: slide ${f}→${t} leaves the board`);
      }
      assert.deepEqual(ren(F.punkt(k, 0)), ren(F.midt(f)));
      assert.deepEqual(ren(F.punkt(k, 1)).map((v) => Math.round(v * 1e9) / 1e9), ren(F.midt(t)));
    });
  }
});

test("the board checker finds the mistakes", () => {
  const feil = (b) => F.sjekkBrett(b).length > 0;
  assert.ok(feil({ stiger: [[1, 20]], sklier: [] }), "start on 1");
  assert.ok(feil({ stiger: [], sklier: [[100, 20]] }), "start on 100");
  assert.ok(feil({ stiger: [[5, 30]], sklier: [[30, 12]] }), "a slide starts where a ladder ends");
  assert.ok(feil({ stiger: [[5, 30]], sklier: [[45, 5]] }), "a slide ends on a ladder foot (a loop)");
  assert.ok(feil({ stiger: [[30, 5]], sklier: [] }), "a ladder going down");
  assert.ok(feil({ stiger: [], sklier: [[5, 30]] }), "a slide going up");
  assert.ok(feil({ stiger: [[12, 15]], sklier: [] }), "on one row");
  assert.ok(feil({ stiger: [[5, 30]], sklier: [[5, 2]] }), "two things on one square");
  assert.ok(!feil(LITE));
});

test("ranking: the winner first, then by square, equal squares share a place", () => {
  const r = F.rangering([100, 40, 55, 40], [0, 1, 2, 3], 0);
  assert.deepEqual(r.map((x) => [x.sete, x.plass]), [[0, 1], [2, 2], [1, 3], [3, 3]]);
  const avsluttet = F.rangering([30, 62, 62], [0, 1, 2], null);
  assert.deepEqual(avsluttet.map((x) => x.plass), [1, 1, 3]);
});

test("a full game always ends (random dice, every board, both rules)", () => {
  let fro = 7;
  const tern = () => {
    fro = (fro * 1103515245 + 12345) % 2147483648;
    return 1 + (fro % 6);
  };
  for (const id of F.BRETTLISTE)
    for (const eksakt of [false, true]) {
      const pos = [1, 1, 1];
      let tur = 0;
      let n = 0;
      for (; n < 5000; n++) {
        const t = F.trekk(pos[tur], tern(), F.BRETT[id], { seks: true, eksakt });
        assert.ok(t.til >= 1 && t.til <= 100);
        pos[tur] = t.til;
        if (t.vant) break;
        if (!t.ekstra) tur = (tur + 1) % pos.length;
      }
      assert.ok(n < 5000, `${id} never ended`);
    }
});
