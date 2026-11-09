// Verktøykassa: the pure parts – fair teams, rock-paper-scissors, random numbers without repeats,
// the order and teams of «Hvem starter?» and the stopwatch format. Loaded in node:vm without the
// kit (window.RusjVerktoy).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/verktoykassa/spill.js"), "utf8"), { window, console });
const V = window.RusjVerktoy;
const rng = (fro) => {
  let a = fro;
  return () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
};

test("teams are fair: everyone once, sizes differ by at most one", () => {
  const r = rng(1);
  for (let n = 2; n <= 20; n++) {
    for (let lag = 2; lag <= Math.min(4, n); lag++) {
      const fordeling = V.delLag(n, lag, r);
      assert.equal(fordeling.length, lag);
      const alle = [...fordeling.flat()].sort((a, b) => a - b); // copied into this realm for deepEqual
      assert.deepEqual(alle, Array.from({ length: n }, (_, i) => i), `${n} players in ${lag} teams`);
      const storrelser = fordeling.map((l) => l.length);
      assert.ok(Math.max(...storrelser) - Math.min(...storrelser) <= 1, `uneven teams: ${storrelser}`);
    }
  }
});

test("teams are random, and the bigger team is not always the same", () => {
  const r = rng(7);
  const sett = new Set();
  const forst = new Set();
  for (let k = 0; k < 200; k++) {
    const f = V.delLag(5, 2, r);
    sett.add(JSON.stringify(f.map((l) => l.slice().sort((a, b) => a - b))));
    forst.add(f[0].length);
  }
  assert.ok(sett.size > 10, "the same few splits keep coming back");
  assert.deepEqual([...forst].sort(), [2, 3], "with five players either team can get the third");
});

test("rock, paper, scissors", () => {
  const S = "stein";
  const K = "saks";
  const P = "papir";
  assert.equal(V.sspVinner(S, K), 1);
  assert.equal(V.sspVinner(K, P), 1);
  assert.equal(V.sspVinner(P, S), 1);
  assert.equal(V.sspVinner(K, S), 2);
  assert.equal(V.sspVinner(P, K), 2);
  assert.equal(V.sspVinner(S, P), 2);
  for (const x of [S, K, P]) assert.equal(V.sspVinner(x, x), 0);
});

test("random numbers stay in range, also when from > to", () => {
  const r = rng(3);
  const sett = new Set();
  for (let k = 0; k < 2000; k++) {
    const n = V.trekkTall(1, 6, [], false, r);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 6);
    sett.add(n);
    const m = V.trekkTall(10, -10, [], false, r);
    assert.ok(m >= -10 && m <= 10);
  }
  assert.equal(sett.size, 6, "every number comes up");
});

test("without repeats every number comes exactly once, then null", () => {
  const r = rng(11);
  const trukket = [];
  for (let k = 0; k < 20; k++) {
    const n = V.trekkTall(1, 20, trukket, true, r);
    assert.ok(n >= 1 && n <= 20 && !trukket.includes(n), `repeat or out of range: ${n}`);
    trukket.push(n);
  }
  assert.equal(V.trekkTall(1, 20, trukket, true, r), null);
  assert.equal(V.trekkTall(20, 1, trukket, true, r), null, "the order of from/to doesn't matter");
  const stor = [];
  for (let k = 0; k < 300; k++) stor.push(V.trekkTall(1, 1000000, stor, true, r));
  assert.equal(new Set(stor).size, 300, "big ranges never repeat either");
});

test("«Hvem starter?»: an order is 1…n once each, teams are balanced", () => {
  const r = rng(5);
  for (let n = 2; n <= 10; n++) {
    assert.deepEqual([...V.rekkefolge(n, r)].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i + 1));
    const lag = V.fingerLag(n, 2, r);
    assert.equal(lag.length, n);
    const a = lag.filter((x) => x === 0).length;
    assert.ok(Math.abs(a - (n - a)) <= 1, `teams of ${a} and ${n - a}`);
  }
});

test("stopwatch format", () => {
  assert.equal(V.stoppetid(0), "0:00,0");
  assert.equal(V.stoppetid(1234), "0:01,2");
  assert.equal(V.stoppetid(61999), "1:01,9");
  assert.equal(V.stoppetid(3725000), "62:05,0");
});
