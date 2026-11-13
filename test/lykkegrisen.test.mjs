// Lykkegrisen (10 000): the scoring of every combination in both tables (ones, fives, three to six
// alike, a straight, three pairs, the fixed table's extra combinations, dice that don't count), empty
// rolls, the best choice for «Velg poengene», the exact odds the phone uses, and seeded phone
// players at every level: they only put aside dice that score, never stop below the entry score,
// and every game ends with the right winner. The rules are pure functions in
// rusj/spill/lykkegrisen/spill.js, loaded in node:vm without the kit (window.RusjLykkegrisen).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/lykkegrisen/spill.js"), "utf8"), { window, console });
const L = window.RusjLykkegrisen;
const j = (x) => JSON.parse(JSON.stringify(x));

// [dice, classic, fixed]
const POENG = [
  [[1], 100, 100],
  [[5], 50, 50],
  [[1, 1], 200, 200],
  [[1, 5], 150, 150],
  [[2], 0, 0],
  [[1, 2], 0, 0], // the 2 can't count
  [[2, 2, 2], 200, 200],
  [[3, 3, 3], 300, 300],
  [[6, 6, 6], 600, 600],
  [[1, 1, 1], 1000, 1000],
  [[5, 5, 5], 500, 500],
  [[2, 2, 2, 2], 400, 1000],
  [[2, 2, 2, 2, 2], 800, 2000],
  [[2, 2, 2, 2, 2, 2], 1600, 3000],
  [[1, 1, 1, 1], 2000, 1100], // fixed: three ones and a single one beats 1000
  [[5, 5, 5, 5], 1000, 1000],
  [[1, 1, 1, 5], 1050, 1050],
  [[3, 3, 3, 1, 5], 450, 450],
  [[3, 3, 3, 4], 0, 0],
  [[1, 2, 3, 4, 5, 6], 1500, 1500],
  [[2, 2, 3, 3, 4, 4], 1000, 1500],
  [[1, 1, 5, 5, 6, 6], 1000, 1500], // three pairs beats 300
  [[2, 2, 2, 3, 3, 3], 500, 2500], // two times three alike
  [[4, 4, 4, 4, 6, 6], 0, 1500], // classic: the 6s don't count
  [[4, 4, 4, 4, 1, 1], 1000, 1500],
  [[1, 1, 1, 1, 1, 1], 8000, 3000],
];

test("scoring: every combination in both tables", () => {
  for (const [t, a, b] of POENG) {
    assert.equal(L.verdi(t, "klassisk"), a, `klassisk ${t}`);
    assert.equal(L.verdi(t, "faste"), b, `faste ${t}`);
  }
});

test("empty rolls and the best choice", () => {
  assert.equal(L.harPoeng([2, 3, 4, 6, 2, 3], "klassisk"), false);
  assert.equal(L.harPoeng([2, 3], "klassisk"), false);
  assert.equal(L.harPoeng([2, 2, 2], "klassisk"), true);
  assert.equal(L.harPoeng([2, 2, 3, 3, 4, 4], "klassisk"), true, "three pairs score");
  assert.equal(L.harPoeng([5], "klassisk"), true);
  const b = L.beste([1, 5, 2, 2, 2, 3], "klassisk");
  assert.deepEqual(j(b), { idx: [0, 1, 2, 3, 4], verdi: 350 });
  assert.equal(L.beste([2, 3, 4, 6], "klassisk"), null);
  // Every scoring choice is listed, each with every die counting
  const alle = L.utvalg([1, 1, 5], "klassisk").map((u) => u.verdi).sort((x, y) => x - y);
  assert.deepEqual(j(alle), [50, 100, 100, 150, 150, 200, 250]);
});

test("the odds the phone uses are exact", () => {
  // Chance of an empty roll with n dice, counted over all 6^n rolls.
  for (const [n, p] of [[1, 0.6667], [2, 0.4444], [3, 0.2778], [4, 0.1574], [5, 0.0772], [6, 0.0231]]) {
    let tomme = 0;
    const N = 6 ** n;
    for (let k = 0; k < N; k++) {
      const t = [];
      for (let i = 0, x = k; i < n; i++, x = Math.floor(x / 6)) t.push(1 + (x % 6));
      if (!L.harPoeng(t, "klassisk")) tomme++;
    }
    assert.ok(Math.abs(tomme / N - p) < 0.0001, `${n} terninger: ${tomme / N}`);
  }
  // Vanskelig stops sooner with few dice than with many, and never with six
  assert.ok(L.grenseVanskelig(1) < L.grenseVanskelig(4));
  assert.ok(L.grenseVanskelig(3) < L.grenseVanskelig(5));
  assert.equal(L.grenseVanskelig(6), Infinity);
});

test("stopping: the entry score, reaching the target, the last round", () => {
  const ctx = { tur: 300, n: 3, total: 0, mal: 10000, inngang: 500, inne: false, leder: 0, sisteRunde: false };
  for (const niva of ["lett", "middels", "vanskelig"]) {
    assert.equal(L.skalStoppe(ctx, niva, () => 0), false, `${niva} stopper under inngangen`);
    assert.equal(L.skalStoppe({ ...ctx, total: 9800, inne: true }, niva, () => 0.9), true, `${niva} stopper ikke når målet er nådd`);
    assert.equal(L.skalStoppe({ ...ctx, inne: true, total: 9000, leder: 10200, sisteRunde: true, tur: 1000 }, niva, () => 0), false, `${niva} gir seg før lederen er slått`);
    assert.equal(L.skalStoppe({ ...ctx, inne: true, total: 9000, leder: 10200, sisteRunde: true, tur: 1250 }, niva, () => 0), true);
  }
  assert.equal(L.skalStoppe({ ...ctx, inngang: 0, tur: 2500, n: 6 }, "middels", () => 0), false, "six dice: always roll");
  assert.equal(L.skalStoppe({ ...ctx, inngang: 0, tur: 450, n: 2 }, "middels", () => 0), true);
});

test("seeded phone players at every level: only scoring dice, every game ends", () => {
  const oppsett = [
    { mal: 10000, tabell: "klassisk" },
    { mal: 5000, tabell: "faste", inngang: 500 },
    { mal: 10000, tabell: "klassisk", inngang: 1000, straff: true },
  ];
  let spill = 0;
  for (const o of oppsett)
    for (const nivaer of [["lett", "lett"], ["middels", "vanskelig", "lett"], ["vanskelig", "vanskelig"], ["middels"]])
      for (let fro = 1; fro <= 5; fro++) {
        let valg = 0;
        const r = L.parti(fro * 7919 + nivaer.length, nivaer, {
          ...o,
          sjekk(t, u) {
            valg++;
            assert.ok(u && u.idx.length >= 1, "a choice without dice");
            assert.equal(new Set(u.idx).size, u.idx.length);
            assert.ok(u.idx.every((i) => Number.isInteger(i) && i >= 0 && i < t.length), "a die that isn't in the roll");
            assert.equal(L.verdi(u.idx.map((i) => t[i]), o.tabell), u.verdi);
            assert.ok(u.verdi > 0, `put aside dice that don't score: ${u.idx.map((i) => t[i])}`);
          },
        });
        assert.ok(r.ferdig, `game ${fro} (${nivaer}) never reached the target in ${r.turer} turns`);
        assert.ok(r.turer < 600, `game ${fro} took ${r.turer} turns`);
        assert.ok(Math.max(...r.totaler) >= o.mal);
        assert.ok(r.vinnere.length >= 1 && r.vinnere.every((i) => r.totaler[i] === Math.max(...r.totaler)));
        assert.ok(r.totaler.every((t) => t % 50 === 0 && t >= 0));
        assert.ok(valg > 0);
        spill++;
      }
  assert.equal(spill, 60);
});

test("seeded: the same seed gives the same game; Vanskelig beats Lett most of the time", () => {
  assert.deepEqual(j(L.parti(42, ["middels", "vanskelig"])), j(L.parti(42, ["middels", "vanskelig"])));
  let seier = 0;
  for (let fro = 1; fro <= 60; fro++) {
    const nivaer = fro % 2 ? ["vanskelig", "lett"] : ["lett", "vanskelig"];
    const r = L.parti(fro * 104729, nivaer);
    if (r.vinnere.length === 1 && nivaer[r.vinnere[0]] === "vanskelig") seier++;
  }
  assert.ok(seier >= 33, `Vanskelig vant bare ${seier} av 60 mot Lett`);
});
