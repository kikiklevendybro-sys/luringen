// Brikka (ludo): which moves are legal, knock-outs, star squares, exact finish, the
// three tries for a six, winning, and that the phone's choices are sensible. The rules are pure
// functions in rusj/spill/brikka/spill.js, loaded in node:vm without the kit (window.RusjBrikka).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/brikka/spill.js"), "utf8"), { window, console });
const F = window.RusjBrikka;
const H = F.HJEMME;
const EKSAKT = { eksakt: true };
const FRI = { eksakt: false };
// Plain objects from this realm, so deepEqual compares values only.
const ren = (x) => JSON.parse(JSON.stringify(x));
const brett = (...seter) => [0, 1, 2, 3].map((s) => (seter[s] === undefined ? null : seter[s]));
// Relative position for seat `s` that lands on absolute square `a`.
const rel = (s, a) => (a - F.START[s] + F.SPOR) % F.SPOR;

test("the board: 40 squares, four starts ten apart, four star squares", () => {
  assert.equal(F.SPOR, 40);
  assert.equal(F.MAL, 44);
  assert.deepEqual(ren(F.START), [0, 10, 20, 30]);
  assert.equal(new Set(F.TRYGG).size, 4);
  for (const t of F.TRYGG) assert.ok(!F.START.includes(t), "a star square is not a start square");
  assert.equal(F.abs(1, 0), 10);
  assert.equal(F.abs(3, 15), 5, "positions wrap round the board");
  assert.equal(F.abs(0, 40), -1, "the own colour is not on the shared track");
  assert.equal(F.abs(0, H), -1);
});

test("you need a six to come out, and every piece at home gives the same move", () => {
  const b = brett([H, H, H, H], undefined, [H, H, H, H]);
  for (const kast of [1, 2, 3, 4, 5]) assert.equal(F.trekk(b, 0, kast, EKSAKT).length, 0, `${kast} must not bring a piece out`);
  const seks = F.trekk(b, 0, 6, EKSAKT);
  assert.equal(seks.length, 4);
  assert.ok(seks.every((t) => t.ut && t.fra === H && t.til === 0));
  assert.equal(F.distinkte(seks).length, 1, "four pieces at home are one choice");
});

test("a six lets you choose between coming out and moving", () => {
  const b = brett([H, 7, H, H], undefined, [H, H, H, H]);
  const liste = F.trekk(b, 0, 6, EKSAKT);
  assert.equal(F.distinkte(liste).length, 2);
  assert.ok(liste.some((t) => t.ut));
  assert.ok(liste.some((t) => t.fra === 7 && t.til === 13));
});

test("landing on an opponent knocks it home – all of them on that square", () => {
  // Seat 2 (start 20) sits on absolute square 12 with two pieces; seat 0 is three behind.
  const b = brett([9, H, H, H], undefined, [rel(2, 12), rel(2, 12), H, H]);
  const [t] = F.trekk(b, 0, 3, EKSAKT);
  assert.equal(t.til, 12);
  assert.deepEqual(ren(t.slaar), [{ sete: 2, brikke: 0 }, { sete: 2, brikke: 1 }]);
  const etter = F.utfor(b, t);
  assert.deepEqual(ren(etter[2]), [H, H, H, H]);
  assert.equal(etter[0][0], 12);
  assert.deepEqual(ren(b[2]), [rel(2, 12), rel(2, 12), H, H], "utfor doesn't change the old position");
});

test("nobody is knocked home on a star square", () => {
  const stjerne = F.TRYGG[1]; // 14
  const b = brett([stjerne - 2, H, H, H], undefined, [rel(2, stjerne), H, H, H]);
  const [t] = F.trekk(b, 0, 2, EKSAKT);
  assert.equal(F.abs(0, t.til), stjerne);
  assert.equal(t.slaar.length, 0);
  assert.equal(F.utfor(b, t)[2][0], rel(2, stjerne), "both stay on the star");
});

test("coming out onto your start square knocks an opponent sitting there", () => {
  const b = brett([H, H, H, H], [rel(1, 0), H, H, H]);
  const [t] = F.trekk(b, 0, 6, EKSAKT);
  assert.deepEqual(ren(t.slaar), [{ sete: 1, brikke: 0 }]);
});

test("own pieces stack, and your own colour is safe from everyone", () => {
  const b = brett([10, 13, H, H], undefined, [H, H, H, H]);
  const t = F.trekk(b, 0, 3, EKSAKT).find((x) => x.fra === 10);
  assert.equal(t.til, 13);
  assert.equal(t.slaar.length, 0);
  // Seat 1's piece up its own colour is never on the shared track
  const c = brett([36, H, H, H], [41, H, H, H]);
  for (const kast of [1, 2, 3, 4, 5, 6]) for (const x of F.trekk(c, 0, kast, EKSAKT)) assert.equal(x.slaar.length, 0);
});

test("after one round you turn up your own colour; the goal needs the exact number", () => {
  const b = brett([38, H, H, H], undefined, [H, H, H, H]);
  const [inn] = F.trekk(b, 0, 3, EKSAKT);
  assert.equal(inn.til, 41, "39 → 40 → 41: up the own colour, not round again");
  assert.equal(F.abs(0, inn.til), -1);
  const c = brett([42, H, H, H]);
  assert.equal(F.trekk(c, 0, 3, EKSAKT).length, 0, "42 + 3 overshoots the goal");
  const [akkurat] = F.trekk(c, 0, 2, EKSAKT);
  assert.ok(akkurat.mal && akkurat.til === 44);
  const [fri] = F.trekk(c, 0, 5, FRI);
  assert.ok(fri.mal && fri.til === 44, "without the exact rule a big roll goes into the goal");
  assert.equal(F.trekk(brett([44, 44, H, H]), 0, 6, EKSAKT).filter((t) => t.fra === 44).length, 0, "pieces in the goal never move");
});

test("three tries for a six only when nothing is out", () => {
  assert.equal(F.forsokPerTur(brett([H, H, H, H]), 0), 3);
  assert.equal(F.forsokPerTur(brett([44, 44, H, H]), 0), 3, "pieces in the goal are not out");
  assert.equal(F.forsokPerTur(brett([5, H, H, H]), 0), 1);
  assert.equal(F.forsokPerTur(brett([41, H, H, H]), 0), 1, "a piece up the own colour is out");
});

test("winning: every piece in the goal (also with two pieces each)", () => {
  assert.equal(F.ferdig(brett([44, 44, 44, 43]), 0), false);
  assert.equal(F.ferdig(brett([44, 44, 44, 44]), 0), true);
  assert.equal(F.ferdig(brett([44, 44]), 0), true);
  assert.equal(F.iMal(brett([44, 12, 44, H]), 0), 2);
  assert.ok(F.fremdrift(brett([44, 12, H, H]), 0) > F.fremdrift(brett([20, 12, H, H]), 0));
});

test("a full game between four random players always ends with a winner", () => {
  let a = 7;
  const rng = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let spill = 0; spill < 30; spill++) {
    let b = brett([H, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]);
    let tur = spill % 4;
    let vinner = -1;
    for (let n = 0; n < 5000 && vinner < 0; n++) {
      const kast = 1 + Math.floor(rng() * 6);
      const liste = F.trekk(b, tur, kast, spill % 2 ? FRI : EKSAKT);
      if (liste.length) {
        const t = spill % 3 ? F.robotVelg(b, tur, liste, rng) : liste[Math.floor(rng() * liste.length)];
        b = F.utfor(b, t);
        for (const s of [0, 1, 2, 3]) for (const p of b[s]) assert.ok(p >= H && p <= F.MAL, `position out of range: ${p}`);
        if (F.ferdig(b, tur)) vinner = tur;
      }
      if (kast !== 6) tur = (tur + 1) % 4;
    }
    assert.ok(vinner >= 0, `game ${spill} never ended`);
  }
});

test("the phone finishes, knocks and comes out when it can", () => {
  const ingen = () => 0;
  // finishing beats everything
  let b = brett([42, 9, H, H], undefined, [rel(2, 11), H, H, H]);
  let valg = F.robotVelg(b, 0, F.trekk(b, 0, 2, EKSAKT), ingen);
  assert.ok(valg.mal, "should go into the goal");
  // knocking beats a plain move
  b = brett([5, 20, H, H], undefined, [rel(2, 8), H, H, H]);
  valg = F.robotVelg(b, 0, F.trekk(b, 0, 3, EKSAKT), ingen);
  assert.equal(valg.fra, 5, "should knock the piece on square 8");
  assert.equal(valg.slaar.length, 1);
  // coming out with a six beats a small step forward
  b = brett([H, 3, H, H], undefined, [H, H, H, H]);
  valg = F.robotVelg(b, 0, F.trekk(b, 0, 6, EKSAKT), ingen);
  assert.ok(valg.ut, "should bring a new piece out");
  // getting away from a piece right behind you, onto the star square
  b = brett([13, 2, H, H], undefined, [rel(2, 11), H, H, H]);
  valg = F.robotVelg(b, 0, F.trekk(b, 0, 1, EKSAKT), ingen);
  assert.equal(valg.fra, 13, "should move the piece that is in danger");
  // and not step right in front of an opponent when there is a calmer move
  b = brett([17, 1, H, H], [rel(1, 18), H, H, H]);
  valg = F.robotVelg(b, 0, F.trekk(b, 0, 2, EKSAKT), ingen);
  assert.equal(valg.fra, 1, "should not walk into reach (just in front of an opponent)");
  assert.equal(F.trusler(b, 0, 19), 1, "the piece on 18 can reach 19");
  // Seat 2 at relative 38 (absolute 18) turns into its own colour after two more squares
  assert.equal(F.trusler(brett([H], undefined, [38]), 0, 19), 1);
  assert.equal(F.trusler(brett([H], undefined, [38]), 0, 21), 0, "a piece about to turn into its own colour is no threat further on");
});
