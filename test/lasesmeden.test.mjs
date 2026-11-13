// Låsesmeden's engine (the pure part of rusj/spill/lasesmeden/spill.js): the lock's answer (pins in
// the right place and right colour in the wrong place, also with repeated colours), codes that keep
// each level's rules and come from the seed, the list of codes that still fit, and hints that
// always fit – a player who only ever plays the hint cracks every code within the guesses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/lasesmeden/spill.js"));

// The answer worked out the slow way: right place first, then each colour's leftovers paired up.
function svarSelv(kode, gjett) {
  const k = kode.slice();
  const g = gjett.slice();
  let svart = 0;
  for (let i = 0; i < k.length; i++)
    if (k[i] === g[i]) {
      svart++;
      k[i] = -1;
      g[i] = -2;
    }
  let hvit = 0;
  for (let i = 0; i < g.length; i++) {
    const j = k.indexOf(g[i]);
    if (g[i] >= 0 && j >= 0) {
      hvit++;
      k[j] = -1;
    }
  }
  return { svart, hvit };
}

test("the lock's answer, with and without repeated colours", () => {
  assert.deepEqual(M.vurder([0, 1, 2, 3], [0, 1, 2, 3]), { svart: 4, hvit: 0 });
  assert.deepEqual(M.vurder([0, 1, 2, 3], [3, 2, 1, 0]), { svart: 0, hvit: 4 });
  assert.deepEqual(M.vurder([0, 1, 2, 3], [4, 5, 4, 5]), { svart: 0, hvit: 0 });
  assert.deepEqual(M.vurder([0, 0, 1, 1], [0, 1, 0, 2]), { svart: 1, hvit: 2 });
  // A repeated guess colour scores only as often as the code has it.
  assert.deepEqual(M.vurder([0, 1, 2, 3], [0, 0, 0, 0]), { svart: 1, hvit: 0 });
  assert.deepEqual(M.vurder([1, 0, 0, 0], [0, 1, 1, 1]), { svart: 0, hvit: 2 });
  // Against the slow way for many random pairs.
  const tilf = M.rng(5);
  for (let k = 0; k < 3000; k++) {
    const kode = Array.from({ length: 5 }, () => Math.floor(tilf() * 8));
    const gjett = Array.from({ length: 5 }, () => Math.floor(tilf() * 8));
    assert.deepEqual(M.vurder(kode, gjett), svarSelv(kode, gjett), `${kode} / ${gjett}`);
  }
});

test("codes keep each level's rules and come from the seed", () => {
  assert.equal(M.alleKoder(1).length, 6 * 5 * 4 * 3);
  assert.equal(M.alleKoder(2).length, 6 ** 4);
  assert.equal(M.alleKoder(3).length, 8 ** 5);
  for (const n of [1, 2, 3]) {
    const N = M.niva(n);
    const sett = new Set();
    for (let fro = 1; fro <= 400; fro++) {
      const k = M.lagKode(n, fro);
      assert.ok(M.gyldig(n, k), `${n}/${fro}: ${k}`);
      assert.deepEqual(M.lagKode(n, fro), k, "samme frø, samme kode");
      if (!N.like) assert.equal(new Set(k).size, k.length);
      sett.add(k.join());
    }
    // 400 draws from 360 codes give about 240 different ones; from 1296 or more, over 300.
    assert.ok(sett.size > (n === 1 ? 200 : 300), `${n}: for få forskjellige koder (${sett.size})`);
  }
  // Every colour turns up in every place.
  const sett = M.alleKoder(2).map(() => 0);
  for (let fro = 1; fro <= 2000; fro++) M.lagKode(2, fro).forEach((f, i) => (sett[i * 6 + f] = (sett[i * 6 + f] || 0) + 1));
  for (let i = 0; i < 24; i++) assert.ok(sett[i] > 200, `farge ${i % 6} på plass ${Math.floor(i / 6)}: ${sett[i]}`);
  assert.ok(!M.gyldig(1, [0, 0, 1, 2]), "lett tillater ikke like");
  assert.ok(M.gyldig(2, [0, 0, 1, 2]));
  assert.ok(!M.gyldig(2, [0, 1, 2, 6]), "farge utenfor nivået");
  assert.ok(!M.gyldig(3, [0, 1, 2, 3]), "for kort");
});

test("the codes that still fit, and hints that always fit", () => {
  const kode = [2, 0, 5, 5];
  const historikk = [];
  for (const gjett of [
    [0, 1, 2, 3],
    [4, 4, 5, 5],
    [2, 0, 4, 1],
  ]) {
    historikk.push({ gjett, ...M.vurder(kode, gjett) });
    const m = M.mulige(2, historikk);
    assert.ok(m.some((k) => k.join() === kode.join()), "den ekte koden falt ut");
    for (const k of m) for (const h of historikk) assert.deepEqual(M.vurder(k, h.gjett), { svart: h.svart, hvit: h.hvit });
    const h = M.hint(2, historikk, 99);
    assert.ok(m.some((k) => k.join() === h.join()), "hintet passer ikke");
  }
});

test("playing only the hints cracks every code within the guesses", () => {
  for (const n of [1, 2, 3]) {
    const N = M.niva(n);
    const antall = n === 3 ? 25 : 120;
    let verst = 0;
    for (let fro = 1; fro <= antall; fro++) {
      const kode = M.lagKode(n, fro * 31);
      const historikk = [];
      for (let k = 0; k < N.forsok; k++) {
        const gjett = M.hint(n, historikk, fro * 7 + k);
        const v = M.vurder(kode, gjett);
        historikk.push({ gjett, ...v });
        if (v.svart === N.lengde) break;
      }
      const sist = historikk[historikk.length - 1];
      assert.equal(sist.svart, N.lengde, `nivå ${n}, frø ${fro}: ikke knekt på ${N.forsok}`);
      verst = Math.max(verst, historikk.length);
    }
    assert.ok(verst <= N.forsok);
  }
});
