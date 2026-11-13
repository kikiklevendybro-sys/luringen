// Tavla (backgammon): the start position, single moves (blocked points, hits, the bar first,
// bearing off with exact and bigger dice), the rules for a whole roll (use both dice if you can,
// else the larger; doubles four times), gammon and backgammon, the pip count, the shot counter, and
// seeded phone players at every level playing whole games against each other: every play is legal
// and every game ends, with and without the doubling cube. The rules are pure functions in
// rusj/spill/tavla/spill.js, loaded in node:vm without the kit (window.RusjTavla).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/tavla/spill.js"), "utf8"), { window, console });
const T = window.RusjTavla;

// A position from { side0: { point: count }, side1: { … } } in each side's own numbering
// (25 = bar, 0 = off); the rest of the fifteen are put off the board.
function stilling(a, b) {
  const p = new Int8Array(52);
  for (const [o, m] of [[0, a], [26, b]]) {
    let n = 0;
    for (const [i, c] of Object.entries(m)) {
      p[o + Number(i)] = c;
      n += c;
    }
    p[o] += 15 - n;
  }
  return p;
}
const nokkel = (p) => Array.from(p).join(",");
const j = (x) => JSON.parse(JSON.stringify(x)); // arrays made inside the vm, compared out here

test("start: 2 on 24, 5 on 13, 3 on 8 and 5 on 6 for both, 167 pips each", () => {
  const p = T.start();
  assert.ok(T.gyldig(Array.from(p)));
  for (const s of [0, 1]) {
    assert.equal(T.pip(p, s), 167);
    assert.equal(T.ute(p, s), 0);
  }
  assert.ok(T.kontakt(p));
});

test("single moves: blocked points, hitting a blot, the bar first", () => {
  const p = T.start();
  // Side 0 from 24 with a 5 lands on 19 = side 1's 6-point (five checkers): blocked.
  assert.equal(T.steg(p, 0, 24, 5), -1);
  assert.equal(T.steg(p, 0, 24, 6), 18, "side 1's bar point is open");
  assert.equal(T.steg(p, 0, 13, 1), -1, "12 is side 1's own 13 (five checkers)");
  assert.equal(T.steg(p, 0, 13, 3), 10);
  assert.equal(T.steg(p, 0, 6, 1), 5);
  assert.equal(T.steg(p, 0, 6, 6), -1, "can't bear off before all are home");
  // A blot is hit and goes to the bar
  const q = stilling({ 13: 1, 6: 14 }, { 15: 1, 1: 14 }); // side 1's 15 = side 0's 10
  assert.equal(T.steg(q, 0, 13, 3), 10);
  const slo = T.gjor(q, 0, 13, 10);
  assert.ok(slo);
  assert.equal(q[26 + 25], 1, "the hit checker is on the bar");
  assert.equal(q[26 + 15], 0);
  // Side 1 must enter first: nothing else moves
  assert.equal(T.steg(q, 1, 1, 1), -1);
  assert.equal(T.steg(q, 1, 25, 3), 22);
  T.angre(q, 0, 13, 10, true);
  assert.equal(nokkel(q), nokkel(stilling({ 13: 1, 6: 14 }, { 15: 1, 1: 14 })));
});

test("bearing off: exact die, a bigger die only from the highest point", () => {
  const p = stilling({ 5: 1, 3: 2 }, { 13: 3 });
  assert.equal(T.steg(p, 0, 5, 5), 0);
  assert.equal(T.steg(p, 0, 5, 6), 0, "6 takes the highest checker off");
  assert.equal(T.steg(p, 0, 3, 6), -1, "not while a checker stands higher");
  assert.equal(T.steg(p, 0, 3, 4), -1);
  assert.equal(T.steg(p, 0, 3, 2), 1);
  const q = stilling({ 7: 1, 3: 2 }, { 13: 3 });
  assert.equal(T.steg(q, 0, 3, 3), -1, "not until all are home");
});

test("whole rolls: both dice when possible, else the larger; doubles four times", () => {
  // From the start, 3-1 can be played in many ways, all with two moves; making the 5-point is one.
  const alle = T.sekvenser(T.start(), 0, [3, 1]);
  assert.ok(alle.length > 5);
  assert.ok(alle.every((x) => x.trekk.length === 2));
  assert.ok(alle.some((x) => nokkel(x.pos) === nokkel(stilling({ 24: 2, 13: 5, 8: 2, 6: 4, 5: 2 }, { 24: 2, 13: 5, 8: 3, 6: 5 }))));
  assert.ok(T.sekvenser(T.start(), 0, [6, 6, 6, 6]).every((x) => x.trekk.length === 4), "doubles: four moves");
  // Nothing at all: one checker on 8, side 1 holds side 0's 2 and 3 (its own 23 and 22); 6-5.
  const ingen = stilling({ 8: 1 }, { 23: 2, 22: 2, 1: 11 });
  assert.deepEqual(j(T.sekvenser(ingen, 0, [6, 5]).map((x) => x.trekk.length)), [0]);
  assert.deepEqual(j(T.lovligeSteg(ingen, 0, [6, 5])), []);
  // Only the small die can be played: 6-1 from 8 with side 0's 1 and 2 held; 8-1 = 7, then 7-6 = 1 is held.
  const liten = stilling({ 8: 1 }, { 24: 2, 23: 2, 1: 11 });
  assert.deepEqual(j(T.sekvenser(liten, 0, [6, 1]).map((x) => x.trekk.map((m) => m.d))), [[1]]);
  // Each die alone, never both: the larger must be used. From 9 with 3, 5 and 7 held, 5-1:
  // 9-5 = 4 then 4-1 = 3 held; 9-1 = 8 then 8-5 = 3 held.
  const valg = stilling({ 9: 1 }, { 22: 2, 20: 2, 18: 2, 1: 9 });
  assert.deepEqual(j(T.sekvenser(valg, 0, [5, 1]).map((x) => x.trekk.map((m) => m.d))), [[5]]);
  assert.deepEqual(j(T.lovligeSteg(valg, 0, [5, 1]).map((x) => [x.f, x.d])), [[9, 5]]);
  // Both dice must be used if any order allows it: from 9 with 4 held, 5-1 only works as 1 then 5.
  const rekke = stilling({ 9: 1 }, { 21: 2, 1: 13 });
  assert.deepEqual(j(T.sekvenser(rekke, 0, [5, 1]).map((x) => x.trekk.map((m) => m.d))), [[1, 5]]);
  assert.deepEqual(j(T.lovligeSteg(rekke, 0, [5, 1]).map((x) => [x.f, x.d])), [[9, 1]], "the 5 first would leave the 1 unplayable");
});

test("legal single steps are exactly the first moves of full plays", () => {
  const rnd = T.rng(7);
  for (let n = 0; n < 200; n++) {
    // Random positions reached by random play.
    const p = T.start();
    let s = 0;
    const turer = Math.floor(rnd() * 30);
    for (let k = 0; k < turer; k++) {
      const rest = T.terningerFor([T.terning(rnd), T.terning(rnd)]);
      const alle = T.sekvenser(p, s, rest);
      const valgt = alle[Math.floor(rnd() * alle.length)];
      for (const m of valgt.trekk) T.gjor(p, s, m.f, m.t);
      if (T.ute(p, s) === 15) break;
      s = 1 - s;
    }
    if (T.ute(p, 0) === 15 || T.ute(p, 1) === 15) continue;
    const rest = T.terningerFor([T.terning(rnd), T.terning(rnd)]);
    const steg = T.lovligeSteg(p, s, rest);
    const alle = T.sekvenser(p, s, rest);
    const maks = alle[0].trekk.length;
    // Every legal step is followed by a full play of the right length; every full play's resulting
    // position can be reached by legal steps only.
    for (const x of steg) {
      const q = Int8Array.from(p);
      T.gjor(q, s, x.f, x.t);
      const igjen = rest.slice();
      igjen.splice(igjen.indexOf(x.d), 1);
      const videre = igjen.length ? T.sekvenser(q, s, igjen)[0].trekk.length : 0;
      assert.equal(1 + videre, maks);
    }
    assert.equal(steg.length === 0, maks === 0);
  }
});

test("gammon and backgammon", () => {
  assert.equal(T.resultatType(stilling({}, { 1: 10 }), 0), 1, "the loser has some off: single");
  const g = stilling({}, { 7: 15 });
  g[26] = 0;
  assert.equal(T.resultatType(g, 0), 2);
  const b = stilling({}, { 7: 14, 25: 1 });
  b[26] = 0;
  assert.equal(T.resultatType(b, 0), 3, "on the bar");
  const c = stilling({}, { 20: 1, 7: 14 });
  c[26] = 0;
  assert.equal(T.resultatType(c, 0), 3, "in the winner's home");
});

test("shots: a blot six away is hit by 17 of 36 rolls, one away by 11", () => {
  // Side 0 blot on own 10; side 1 checker on own 21 (= side 0's 4)… distance from side 1's view:
  // side 1 at own j hits side 0's own i when j − (25 − i) is rolled.
  const seks = stilling({ 10: 1, 1: 14 }, { 21: 1, 1: 14 }); // 21 − 15 = 6
  assert.equal(T.skudd(seks, 0, 10), 17);
  const en = stilling({ 10: 1, 1: 14 }, { 16: 1, 1: 14 }); // 16 − 15 = 1
  assert.equal(T.skudd(en, 0, 10), 11);
  const ingen = stilling({ 10: 1, 1: 14 }, { 14: 1, 1: 14 }); // already past
  assert.equal(T.skudd(ingen, 0, 10), 0);
});

test("the phone at every level plays only legal moves, and every game ends", () => {
  const nivaer = [[1, 1], [2, 2], [3, 3], [1, 3], [3, 2]];
  let n = 0;
  for (const par of nivaer)
    for (let fro = 1; fro <= 8; fro++) {
      const r = T.parti(fro * 7919 + par[0] * 31 + par[1], par, {
        kube: fro % 2 === 0,
        sjekk(p, s, rest, trekk) {
          const lovlig = T.sekvenser(p, s, rest).map((x) => nokkel(x.pos));
          const q = Int8Array.from(p);
          for (const m of trekk) {
            assert.equal(T.steg(q, s, m.f, m.d), m.t, "an illegal step");
            T.gjor(q, s, m.f, m.t);
          }
          assert.ok(lovlig.includes(nokkel(q)), "a play that breaks the rules for the whole roll");
        },
      });
      assert.ok(r.vinner === 0 || r.vinner === 1, `game ${fro} (${par}) did not end`);
      assert.ok(r.turer < 400, `game ${fro} (${par}) took ${r.turer} turns`);
      assert.ok([1, 2, 3].includes(r.type));
      assert.ok([1, 2, 4, 8, 16, 32, 64].includes(r.kube));
      n++;
    }
  assert.equal(n, 40);
});

test("seeded: the same seed gives the same game", () => {
  const a = T.parti(12345, [2, 3], { kube: true });
  const b = T.parti(12345, [2, 3], { kube: true });
  assert.deepEqual({ ...a, pos: null }, { ...b, pos: null });
});

test("the levels differ: Vanskelig beats Lett most of the time", () => {
  let seier = 0;
  for (let fro = 1; fro <= 30; fro++) {
    const r = T.parti(fro * 104729, fro % 2 ? [3, 1] : [1, 3]);
    if (r.vinner === (fro % 2 ? 0 : 1)) seier++;
  }
  assert.ok(seier >= 20, `Vanskelig vant bare ${seier} av 30 mot Lett`);
});

test("doubling: Lett never doubles; nobody doubles or takes a hopeless race", () => {
  // Side 0 far ahead in a race (no contact), about to roll.
  const foran = stilling({ 3: 5, 2: 5 }, { 6: 5, 5: 5, 4: 5 });
  assert.equal(T.kontakt(foran), false);
  assert.ok(T.vinnSjanse(foran, 0) > 0.9);
  assert.equal(T.skalDoble(foran, 0, 1), false);
  assert.equal(T.skalDoble(foran, 0, 3), true, "in a race a big lead is doubled");
  assert.equal(T.skalTa(foran, 1, 3), false, "and dropped");
  // An even start: no double
  assert.equal(T.skalDoble(T.start(), 0, 3), false);
  assert.equal(T.skalTa(T.start(), 1, 2), true);
});
