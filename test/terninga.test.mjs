// Terninga: Scandinavian Yatzy and six-dice Yatzy scoring for every box, the bonus, totals and the
// Maxi rule that unused rolls are saved. The rules are pure functions in rusj/spill/terninga/spill.js;
// the script is loaded in node:vm without the kit, so it only defines window.RusjTerninga.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/terninga/spill.js"), "utf8"), { window, console });
const Y = window.RusjTerninga;
const p = (kat, t) => Y.poeng(kat, t);

// [box, dice, expected]
const VANLIG = [
  ["enere", [1, 1, 3, 4, 1], 3],
  ["enere", [2, 3, 4, 5, 6], 0],
  ["toere", [2, 2, 2, 5, 6], 6],
  ["treere", [3, 3, 1, 1, 1], 6],
  ["firere", [4, 4, 4, 4, 4], 20],
  ["femmere", [5, 1, 5, 2, 5], 15],
  ["seksere", [6, 6, 1, 2, 3], 12],
  ["seksere", [1, 2, 3, 4, 5], 0],

  ["par1", [3, 3, 5, 5, 6], 10], // the highest pair counts
  ["par1", [2, 2, 2, 4, 5], 4],
  ["par1", [6, 6, 6, 6, 6], 12], // a Yatzy holds a pair
  ["par1", [1, 2, 3, 4, 6], 0],

  ["par2", [3, 3, 5, 5, 6], 16],
  ["par2", [1, 1, 2, 2, 6], 6],
  ["par2", [2, 2, 3, 3, 3], 10], // a full house holds two different pairs
  ["par2", [4, 4, 4, 4, 2], 0], // four alike is not two pairs
  ["par2", [6, 6, 6, 6, 6], 0],
  ["par2", [1, 2, 3, 4, 5], 0],

  ["like3", [4, 4, 4, 2, 5], 12],
  ["like3", [4, 4, 4, 4, 5], 12], // only three of them count
  ["like3", [5, 5, 5, 5, 5], 15],
  ["like3", [2, 2, 2, 6, 6], 6],
  ["like3", [4, 4, 2, 2, 1], 0],

  ["like4", [3, 3, 3, 3, 6], 12],
  ["like4", [6, 6, 6, 6, 6], 24],
  ["like4", [3, 3, 3, 6, 6], 0],

  ["liten", [1, 2, 3, 4, 5], 15],
  ["liten", [5, 4, 3, 2, 1], 15],
  ["liten", [2, 3, 4, 5, 6], 0],
  ["liten", [1, 2, 3, 4, 4], 0],

  ["stor", [2, 3, 4, 5, 6], 20],
  ["stor", [6, 5, 4, 3, 2], 20],
  ["stor", [1, 2, 3, 4, 5], 0],
  ["stor", [2, 3, 4, 5, 5], 0],

  ["hus", [3, 3, 3, 5, 5], 19],
  ["hus", [5, 5, 3, 3, 3], 19],
  ["hus", [1, 1, 6, 6, 6], 20],
  ["hus", [6, 6, 6, 6, 6], 0], // a Yatzy is not a house in the Scandinavian rules
  ["hus", [4, 4, 4, 4, 1], 0],
  ["hus", [2, 2, 3, 3, 4], 0],

  ["sjanse", [1, 2, 3, 4, 6], 16],
  ["sjanse", [6, 6, 6, 6, 6], 30],
  ["sjanse", [1, 1, 1, 1, 1], 5],

  ["yatzy", [6, 6, 6, 6, 6], 50],
  ["yatzy", [1, 1, 1, 1, 1], 50],
  ["yatzy", [6, 6, 6, 6, 5], 0],
];

const MAXI = [
  ["enere", [1, 1, 1, 1, 1, 1], 6],
  ["seksere", [6, 6, 6, 6, 6, 6], 36],
  ["par1", [6, 6, 5, 5, 4, 4], 12],
  ["par1", [1, 2, 3, 4, 5, 6], 0],
  ["par2", [6, 6, 5, 5, 4, 4], 22], // the two highest pairs
  ["par2", [3, 3, 3, 3, 2, 1], 0],
  ["par2", [3, 3, 3, 3, 2, 2], 10],
  ["par3", [6, 6, 5, 5, 4, 4], 30],
  ["par3", [1, 1, 2, 2, 3, 3], 12],
  ["par3", [3, 3, 3, 3, 2, 2], 0], // three pairs must be three different numbers
  ["par3", [4, 4, 4, 5, 5, 5], 0],
  ["like3", [5, 5, 5, 5, 5, 1], 15],
  ["like4", [5, 5, 5, 5, 5, 1], 20],
  ["like5", [5, 5, 5, 5, 5, 1], 25],
  ["like5", [5, 5, 5, 5, 1, 1], 0],
  ["like5", [2, 2, 2, 2, 2, 2], 10],
  ["liten", [1, 2, 3, 4, 5, 5], 15],
  ["liten", [1, 2, 3, 4, 5, 6], 15],
  ["liten", [2, 3, 4, 5, 6, 6], 0],
  ["stor", [2, 3, 4, 5, 6, 6], 20],
  ["stor", [1, 2, 3, 4, 5, 6], 20],
  ["stor", [1, 2, 3, 4, 5, 5], 0],
  ["full", [1, 2, 3, 4, 5, 6], 21],
  ["full", [6, 5, 4, 3, 2, 1], 21],
  ["full", [1, 2, 3, 4, 5, 5], 0],
  ["hus", [6, 6, 6, 5, 5, 1], 28],
  ["hus", [6, 6, 6, 5, 5, 5], 28], // the best way to split it
  ["hus", [6, 6, 6, 6, 5, 5], 28],
  ["hus", [2, 2, 2, 1, 1, 1], 8],
  ["hus", [6, 6, 6, 6, 6, 5], 0],
  ["hus", [6, 6, 6, 6, 6, 6], 0],
  ["villa", [2, 2, 2, 5, 5, 5], 21],
  ["villa", [5, 5, 5, 5, 2, 2], 0],
  ["villa", [3, 3, 3, 3, 3, 3], 0],
  ["taarn", [4, 4, 4, 4, 6, 6], 28],
  ["taarn", [2, 2, 2, 2, 1, 1], 10],
  ["taarn", [4, 4, 4, 4, 4, 6], 0],
  ["taarn", [6, 6, 6, 6, 6, 6], 0],
  ["sjanse", [1, 2, 3, 4, 5, 6], 21],
  ["sjanse", [6, 6, 6, 6, 6, 6], 36],
  ["yatzy", [3, 3, 3, 3, 3, 3], 100],
  ["yatzy", [3, 3, 3, 3, 3, 2], 0],
];

test("every box in Yatzy scores by the Scandinavian rules", () => {
  for (const [kat, t, ventet] of VANLIG) assert.equal(p(kat, t), ventet, `${kat} ${t.join(",")}`);
  for (const kat of Y.VARIANTER.vanlig.alle) assert.ok(VANLIG.some(([k]) => k === kat), `no test for ${kat}`);
});

test("every box in six-dice Yatzy scores right", () => {
  for (const [kat, t, ventet] of MAXI) assert.equal(p(kat, t), ventet, `${kat} ${t.join(",")}`);
  for (const kat of Y.VARIANTER.maxi.alle) assert.ok(MAXI.some(([k]) => k === kat) || VANLIG.some(([k]) => k === kat), `no test for ${kat}`);
});

test("the two pads have the right boxes in the right order", () => {
  assert.deepEqual([...Y.VARIANTER.vanlig.alle], ["enere", "toere", "treere", "firere", "femmere", "seksere", "par1", "par2", "like3", "like4", "liten", "stor", "hus", "sjanse", "yatzy"]);
  assert.equal(Y.VARIANTER.vanlig.alle.length, 15);
  assert.equal(Y.VARIANTER.maxi.alle.length, 20);
  assert.deepEqual([Y.VARIANTER.vanlig.terninger, Y.VARIANTER.vanlig.grense, Y.VARIANTER.vanlig.bonus], [5, 63, 50]);
  assert.deepEqual([Y.VARIANTER.maxi.terninger, Y.VARIANTER.maxi.grense, Y.VARIANTER.maxi.bonus], [6, 84, 100]);
  for (const k of Y.VARIANTER.maxi.alle) assert.ok(Y.KAT[k] && Y.KAT[k].navn, `${k} needs a name`);
});

test("the bonus comes at 63 (Maxi: 84) and sums add up", () => {
  const tre = { enere: 3, toere: 6, treere: 9, firere: 12, femmere: 15, seksere: 18 };
  let s = Y.summer("vanlig", tre);
  assert.deepEqual([s.over, s.bonus, s.total, s.overFull, s.bonusTapt], [63, 50, 113, true, false]);
  s = Y.summer("vanlig", { ...tre, enere: 2 });
  assert.deepEqual([s.over, s.bonus, s.bonusTapt], [62, 0, true]);
  s = Y.summer("vanlig", { seksere: 30, femmere: 25, firere: 8 }); // bonus as soon as 63 is reached
  assert.deepEqual([s.over, s.bonus, s.overFull, s.bonusTapt], [63, 50, false, false]);
  s = Y.summer("vanlig", { treere: 9, sjanse: 22, yatzy: 50, par2: 0 });
  assert.deepEqual([s.over, s.under, s.total], [9, 72, 81]);
  const fire = { enere: 4, toere: 8, treere: 12, firere: 16, femmere: 20, seksere: 24 };
  assert.equal(Y.summer("maxi", fire).bonus, 100);
  assert.equal(Y.summer("maxi", { ...fire, enere: 3 }).bonus, 0);
  assert.equal(Y.fullt("vanlig", tre), false);
});

test("the best possible pad gives 374 in Yatzy and 649 with six dice", () => {
  const best = (variant, beste) => {
    const kort = {};
    for (const k of Y.VARIANTER[variant].alle) kort[k] = Math.max(...beste.map((t) => p(k, t)));
    assert.equal(Y.fullt(variant, kort), true);
    return Y.summer(variant, kort).total;
  };
  const fem = [1, 2, 3, 4, 5, 6].map((v) => Array(5).fill(v));
  assert.equal(best("vanlig", [...fem, [6, 6, 5, 5, 4], [6, 6, 6, 5, 5], [1, 2, 3, 4, 5], [2, 3, 4, 5, 6]]), 374);
  const seks = [1, 2, 3, 4, 5, 6].map((v) => Array(6).fill(v));
  const maxi = [...seks, [6, 6, 5, 5, 4, 4], [6, 6, 6, 5, 5, 5], [6, 6, 6, 6, 5, 5], [6, 6, 6, 6, 6, 5], [1, 2, 3, 4, 5, 6], [6, 6, 6, 5, 5, 1]];
  assert.equal(best("maxi", maxi), 649);
});

test("rolls per turn, and Maxi saves the rolls you don't use", () => {
  assert.equal(Y.kastIgjen("vanlig", 0, 0), 3);
  assert.equal(Y.kastIgjen("vanlig", 2, 0), 1);
  assert.equal(Y.kastIgjen("vanlig", 3, 5), 0, "plain Yatzy never uses saved rolls");
  assert.equal(Y.kastIgjen("maxi", 3, 2), 2);
  assert.equal(Y.kastIgjen("maxi", 1, 1), 3);
  assert.equal(Y.sparesVed("maxi", 1), 2);
  assert.equal(Y.sparesVed("maxi", 3), 0);
  assert.equal(Y.sparesVed("maxi", 5), 0);
  assert.equal(Y.sparesVed("vanlig", 1), 0);
});

test("random rolls: every score is consistent with the dice", () => {
  const rng = (() => {
    let a = 12345;
    return () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  })();
  for (let n = 0; n < 4000; n++) {
    const antall = n % 2 ? 6 : 5;
    const t = Array.from({ length: antall }, () => 1 + Math.floor(rng() * 6));
    const sum = t.reduce((a, b) => a + b, 0);
    const c = Y.tell(t);
    for (const k of Y.VARIANTER[antall === 6 ? "maxi" : "vanlig"].alle) {
      const v = p(k, t);
      assert.ok(Number.isInteger(v) && v >= 0, `${k} ${t}`);
      if (k !== "yatzy" && !["liten", "stor", "full"].includes(k)) assert.ok(v <= sum, `${k} more than the sum: ${t}`);
    }
    if (antall === 5) {
      const hus = p("hus", t);
      assert.ok(hus === 0 || hus === sum, `a house counts all five dice: ${t}`);
      assert.equal(hus > 0, c.includes(3) && c.includes(2), `house ⇔ 3 + 2: ${t}`);
    }
    if (p("yatzy", t)) assert.equal(p("like4", t), 4 * t[0]);
    assert.ok(p("par2", t) === 0 || p("par2", t) > p("par1", t), `two pairs beat one pair: ${t}`);
  }
});

// ---------- The phone as a player ----------

function spillMed(variant, nivaa, fro) {
  let a = fro;
  const rng = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  const V = Y.VARIANTER[variant];
  const kort = {};
  let spart = 0;
  let treigest = 0;
  while (!Y.fullt(variant, kort)) {
    let t = Array.from({ length: V.terninger }, () => 1 + Math.floor(rng() * 6));
    let kast = 1;
    for (;;) {
      const igjen = Y.kastIgjen(variant, kast, spart);
      const start = performance.now();
      const valg = Y.robotValg(variant, t, kort, igjen, nivaa, rng);
      treigest = Math.max(treigest, performance.now() - start);
      if (valg.felt) {
        assert.ok(V.alle.includes(valg.felt) && kort[valg.felt] == null, `${nivaa} chose a filled or unknown box: ${valg.felt}`);
        kort[valg.felt] = Y.poeng(valg.felt, t);
        spart += Y.sparesVed(variant, kast);
        break;
      }
      assert.ok(igjen > 0, `${nivaa} wanted to roll with no rolls left`);
      assert.equal(valg.hold.length, t.length);
      assert.ok(!valg.hold.every(Boolean), "holding every die is not a roll");
      if (kast >= 3) spart -= 1;
      kast += 1;
      t = t.map((x, i) => (valg.hold[i] ? x : 1 + Math.floor(rng() * 6)));
    }
  }
  return { total: Y.summer(variant, kort).total, treigest };
}

for (const variant of ["vanlig", "maxi"]) {
  test(`the phone (${variant}): legal decisions, Vanskelig clearly beats Lett, decisions are quick`, () => {
    const snitt = {};
    let treigest = 0;
    for (const nivaa of Y.NIVAER) {
      let sum = 0;
      const n = 60;
      for (let k = 0; k < n; k++) {
        const r = spillMed(variant, nivaa, 1000 + k);
        sum += r.total;
        treigest = Math.max(treigest, r.treigest);
      }
      snitt[nivaa] = sum / n;
    }
    assert.ok(snitt.vanskelig > snitt.lett + 40, `Vanskelig ${snitt.vanskelig.toFixed(0)} vs Lett ${snitt.lett.toFixed(0)}`);
    assert.ok(snitt.middels > snitt.lett + 25, `Middels ${snitt.middels.toFixed(0)} vs Lett ${snitt.lett.toFixed(0)}`);
    // (over 150+ games Vanskelig is 5–20 ahead of Middels; 60 games is too noisy to demand more)
    assert.ok(snitt.vanskelig >= snitt.middels - 25, `Vanskelig ${snitt.vanskelig.toFixed(0)} vs Middels ${snitt.middels.toFixed(0)}`);
    assert.ok(treigest < 60, `slowest decision ${treigest.toFixed(1)} ms (an old phone is ~4× slower; the budget there is 150 ms)`);
  });
}

test("the phone keeps the obvious and fills the right box", () => {
  const ingen = () => 0.5;
  // Five sixes: score it as Yatzy straight away (every level).
  for (const nivaa of Y.NIVAER) assert.deepEqual(JSON.parse(JSON.stringify(Y.robotValg("vanlig", [6, 6, 6, 6, 6], {}, 2, nivaa, ingen))), { felt: "yatzy" });
  // A large straight on the first roll is taken by Middels and Vanskelig.
  for (const nivaa of ["middels", "vanskelig"]) assert.equal(Y.robotValg("vanlig", [2, 3, 4, 5, 6], {}, 2, nivaa, ingen).felt, "stor");
  // Four of a kind with two rolls left: keep the four, roll the odd one.
  const v = Y.robotValg("vanlig", [5, 5, 1, 5, 5], {}, 2, "vanskelig", ingen);
  assert.deepEqual([...v.hold], [true, true, false, true, true]);
  // No rolls left: always a free box.
  assert.ok(Y.robotValg("vanlig", [1, 2, 2, 4, 6], { yatzy: 0 }, 0, "lett", ingen).felt !== "yatzy");
});
