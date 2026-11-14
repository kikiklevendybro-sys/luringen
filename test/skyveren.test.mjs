// Skyveren's engine (the pure part of rusj/spill/skyveren/spill.js): the parity rule that says
// whether a board can be solved is checked against every position a breadth-first search reaches
// from the solved board (3 × 3, and the even widths 2 × 2, 2 × 4 and 4 × 2); every shuffle of every
// size, over many seeds, is solvable, shuffled and from its seed; and the slide rules are right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/skyveren/spill.js"));

// Every position reachable from the solved board by single slides.
function naa(R, C) {
  const start = M.ferdigBrett(R, C);
  const sett = new Set([start.join()]);
  const ko = [start];
  while (ko.length) {
    const b = ko.pop();
    const tom = b.indexOf(0);
    const r = Math.floor(tom / C);
    const c = tom % C;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue;
      const ny = b.slice();
      ny[tom] = ny[rr * C + cc];
      ny[rr * C + cc] = 0;
      const k = ny.join();
      if (!sett.has(k)) {
        sett.add(k);
        ko.push(ny);
      }
    }
  }
  return sett;
}
function* permutasjoner(a) {
  const c = new Array(a.length).fill(0);
  const x = a.slice();
  yield x.slice();
  let i = 0;
  while (i < x.length) {
    if (c[i] < i) {
      const j = i % 2 ? c[i] : 0;
      [x[j], x[i]] = [x[i], x[j]];
      yield x.slice();
      c[i]++;
      i = 0;
    } else c[i++] = 0;
  }
}

test("the parity rule matches what can really be reached", () => {
  for (const [R, C] of [[2, 2], [3, 3], [2, 4], [4, 2]]) {
    const nas = naa(R, C);
    let fakultet = 1;
    for (let k = 2; k <= R * C; k++) fakultet *= k;
    assert.equal(nas.size, fakultet / 2, `${R} × ${C}: halvparten skal kunne nås`);
    for (const p of permutasjoner(M.ferdigBrett(R, C))) assert.equal(M.losbar(R, C, p), nas.has(p.join()), `${R} × ${C}: ${p}`);
  }
});

test("every shuffle is solvable, shuffled and from its seed", () => {
  for (const n of M.STORRELSER)
    for (let fro = 1; fro <= 500; fro++) {
      const b = M.stokk(n, n, fro);
      assert.equal(b.length, n * n);
      assert.equal(new Set(b).size, n * n);
      assert.ok(M.losbar(n, n, b), `${n}/${fro}: kan ikke løses`);
      assert.ok(!M.lost(b), `${n}/${fro}: allerede løst`);
      assert.ok(b.filter((x, i) => x && x === i + 1).length <= Math.floor((n * n - 1) / 3), `${n}/${fro}: for mange på plass`);
      assert.deepEqual(M.stokk(n, n, fro), b);
    }
  // On 3 × 3 the search above proves it outright.
  const nas = naa(3, 3);
  for (let fro = 1; fro <= 500; fro++) assert.ok(nas.has(M.stokk(3, 3, fro).join()));
});

test("slides: a whole line toward the empty square, nothing across", () => {
  // 1 2 3 / 4 5 6 / 7 8 _
  const b = M.ferdigBrett(3, 3);
  assert.ok(M.lost(b));
  assert.deepEqual(M.flytt(3, 3, b, 7), [1, 2, 3, 4, 5, 6, 7, 0, 8]);
  assert.deepEqual(M.flytt(3, 3, b, 6), [1, 2, 3, 4, 5, 6, 0, 7, 8]); // two tiles slide
  assert.deepEqual(M.flytt(3, 3, b, 2), [1, 2, 0, 4, 5, 3, 7, 8, 6]); // up the column
  assert.equal(M.flytt(3, 3, b, 4), null, "not in line");
  assert.equal(M.flytt(3, 3, b, 8), null, "the empty square itself");
  assert.equal(M.antallFlyttet(3, b, 6), 2);
  assert.equal(M.antallFlyttet(3, b, 2), 2);
  // Arrows: up moves the tile below the empty square up (none here), down the one above it.
  assert.equal(M.pilPlass(3, 3, b, "opp"), -1);
  assert.equal(M.pilPlass(3, 3, b, "ned"), 5);
  assert.equal(M.pilPlass(3, 3, b, "hoyre"), 7);
  assert.equal(M.pilPlass(3, 3, b, "venstre"), -1);
  // A slide keeps the board solvable and is undone by sliding back.
  let x = M.stokk(4, 4, 42);
  const tilf = M.rng(1);
  for (let k = 0; k < 500; k++) {
    const p = Math.floor(tilf() * 16);
    const ny = M.flytt(4, 4, x, p);
    if (!ny) continue;
    assert.ok(M.losbar(4, 4, ny));
    const tilbake = M.flytt(4, 4, ny, x.indexOf(0));
    assert.deepEqual(tilbake, x);
    x = ny;
  }
  assert.equal(M.avstand(3, 3, b), 0);
  assert.equal(M.avstand(3, 3, [1, 2, 3, 4, 5, 6, 7, 0, 8]), 1);
});
