// Minesveiperen's engine (the pure part of rusj/spill/minesveiperen/spill.js): the solver only
// draws true conclusions, «uten gjetting» boards can be cleared by it from the first tap, the first
// tap is always safe, and «Dagens minefelt» is the same board on every phone, for good.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/minesveiperen/spill.js"));
const FORMER = { lett: [9, 9, 10], tolv: [12, 12, 24], middels: [16, 16, 40], ekspert: [16, 30, 99] };
const sum = (a) => a.reduce((s, x) => s + x, 0);

test("minene legges aldri på eller rundt første rute, og et frø gir alltid samme brett", () => {
  for (const [b, h, miner] of Object.values(FORMER)) {
    for (const forste of [0, b - 1, ((h / 2) | 0) * b + ((b / 2) | 0), b * h - 1]) {
      const mine = M.legg(b, h, miner, forste, M.rng(7));
      assert.equal(mine.length, b * h);
      assert.equal(sum(mine), miner);
      assert.equal(mine[forste], 0);
      for (const j of M.naboer(b, h)[forste]) assert.equal(mine[j], 0, "en mine ved siden av første rute");
      assert.deepEqual(mine, M.legg(b, h, miner, forste, M.rng(7)));
    }
  }
});

test("løseren slutter bare det som er sant", () => {
  let slutninger = 0;
  for (let k = 0; k < 300; k++) {
    const [b, h, miner] = Object.values(FORMER)[k % 4];
    const forste = (k * 37) % (b * h);
    const mine = M.legg(b, h, miner, forste, M.rng(k + 1));
    const logg = [];
    M.losbar(b, h, mine, forste, logg);
    for (const [i, v] of logg) {
      slutninger++;
      assert.equal(v === 2, !!mine[i], `brett ${k}: rute ${i} ble kalt ${v === 2 ? "mine" : "trygg"}`);
    }
  }
  assert.ok(slutninger > 5000);
});

test("løseren kjenner de tre reglene – og gir opp der det må gjettes", () => {
  // A true coin flip (4 × 2): one mine in one of the two cells at the far end, and every number
  // sees both of them alike.
  assert.equal(M.losbar(4, 2, [0, 0, 0, 1, 0, 0, 0, 0], 0), false);
  // 3 × 3 with one mine in the middle of the bottom row: the numbers 1-1-1 above three closed
  // cells give it away only when two numbers are read together.
  assert.equal(M.losbar(3, 3, [0, 0, 0, 0, 0, 0, 0, 1, 0], 0), true);
  // 5 × 3 with mines at both sides of a safe cell in the bottom row («1 2 1 1»).
  assert.equal(M.losbar(5, 3, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0], 0), true);
  // A start on a mine is never solvable.
  assert.equal(M.losbar(3, 3, [0, 0, 0, 0, 0, 0, 0, 0, 1], 8), false);
});

test("«uten gjetting»: hvert brett kan ryddes av løseren fra første trykk, raskt nok for en gammel mobil", () => {
  for (const [navn, [b, h, miner]] of Object.entries(FORMER)) {
    const N = navn === "ekspert" ? 40 : 150;
    let forsok = 0;
    const t0 = performance.now();
    for (let k = 0; k < N; k++) {
      const forste = (k * 53 + 7) % (b * h);
      const o = M.lagTrygt(b, h, miner, forste, (k * 7919 + 13) >>> 0, 400, 0);
      assert.equal(o.trygg, true, `${navn} ${k}: fant ikke et brett uten gjetting`);
      assert.equal(sum(o.mine), miner);
      assert.equal(o.mine[forste], 0);
      assert.equal(M.losbar(b, h, o.mine, forste), true);
      forsok += o.forsok;
    }
    const ms = (performance.now() - t0) / N;
    assert.ok(ms < 25, `${navn}: ${ms.toFixed(1)} ms per brett`);
    assert.ok(forsok / N < (navn === "ekspert" ? 40 : 4), `${navn}: ${(forsok / N).toFixed(1)} forsøk per brett`);
  }
  // Without the solver the first try is the board the seed alone gives.
  const fro = 123456;
  assert.deepEqual(M.lagTrygt(9, 9, 10, 40, fro, 1, 0).mine, M.legg(9, 9, 10, 40, M.rng(fro)));
});

test("dagens minefelt: samme brett for alle, uten gjetting, større utover uka", () => {
  // Wednesday 11, Friday 13 and Sunday 15 November 2026, and Christmas Eve (a Thursday).
  const FASIT = [
    ["2026-11-11", 20768, "lett", 39, "000000000010000001001000000000001100000000000000000000000000011100000010000010000"],
    ["2026-11-13", 20770, "tolv", 90, "010110000000010000001010000000000010010010010110010000000000010000000000000000000000001010000001000000000000010000001000000000011000000001001100"],
    [
      "2026-11-15",
      20772,
      "middels",
      118,
      "0010110001000000000000101100000100000001000000001010000000011000000000000101000001100000000000001010100000000000000000000100000000111000011010000000000000000000100000000000000110010000000000001001000000000100000010000100000000000000100000000000001001000001",
    ],
    ["2026-12-24", 20811, "lett", 39, "001100000001000000000100000000001000000000000110000000001000000000000001000000100"],
  ];
  for (const [dato, nr, niva, start, miner] of FASIT) {
    const o = M.lagDaglig(dato, nr);
    assert.equal(o.niva, niva, dato);
    assert.equal(o.start, start, dato);
    assert.equal(o.mine.join(""), miner, `${dato}: dagens minefelt har endret seg`);
    assert.equal(o.trygg, true);
    assert.equal(M.losbar(o.b, o.h, o.mine, o.start), true);
  }
  // A whole year: always solvable by logic, the start in the middle third and never near a mine.
  const uke = ["lett", "lett", "lett", "lett", "tolv", "tolv", "middels"];
  for (let k = 0; k < 366; k++) {
    const nr = 20820 + k;
    const d = new Date(nr * 86400000);
    const dato = d.toISOString().slice(0, 10);
    const o = M.lagDaglig(dato, nr);
    assert.equal(o.niva, uke[(nr + 3) % 7], dato);
    assert.equal(o.trygg, true, `${dato}: må gjettes`);
    assert.equal(sum(o.mine), M.DAGLIG_FORMER[o.niva][2]);
    const x = o.start % o.b;
    const y = (o.start / o.b) | 0;
    const kant = Math.floor(o.b / 3);
    assert.ok(x >= kant && x < o.b - kant && y >= kant && y < o.h - kant, `${dato}: startruta ligger ikke midt på`);
    for (const j of [o.start, ...M.naboer(o.b, o.h)[o.start]]) assert.equal(o.mine[j], 0);
  }
});
