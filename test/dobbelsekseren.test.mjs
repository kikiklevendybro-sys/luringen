// Dobbelsekseren (dominoes): the 28 tiles, dealing for the block and the draw game, who opens the
// first round, which ends a tile fits and how it is turned, a blocked round, scoring, and seeded
// phone players at every level playing whole rounds: every tile they lay fits, they only draw or
// pass when nothing fits, no tile is lost, and every round ends. The rules are pure functions in
// rusj/spill/dobbelsekseren/spill.js, loaded in node:vm without the kit (window.RusjDobbelsekseren).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/dobbelsekseren/spill.js"), "utf8"), { window, console });
const D = window.RusjDobbelsekseren;
const j = (x) => JSON.parse(JSON.stringify(x));
const nokkel = (t) => Math.min(t[0], t[1]) * 7 + Math.max(t[0], t[1]);

test("the set: 28 different tiles from 0-0 to 6-6, 168 pips", () => {
  assert.equal(D.ALLE.length, 28);
  assert.equal(new Set(D.ALLE.map(nokkel)).size, 28);
  assert.equal(D.pips(D.ALLE), 168);
  assert.equal(D.ALLE.filter(D.dobbel).length, 7);
});

test("dealing: 7 each in the block game; in the draw game 7 for two, 5 for three or four", () => {
  const rnd = D.rng(3);
  for (const [variant, n, k] of [["blokk", 2, 7], ["blokk", 4, 7], ["trekk", 2, 7], ["trekk", 3, 5], ["trekk", 4, 5]]) {
    const { hender, bunke } = D.del(rnd, n, variant);
    assert.equal(hender.length, n);
    assert.ok(hender.every((h) => h.length === k), `${variant} ${n}`);
    assert.equal(hender.flat().length + bunke.length, 28);
    assert.equal(new Set(hender.flat().concat(bunke).map(nokkel)).size, 28);
  }
});

test("opening: the highest double starts; no double: the heaviest tile", () => {
  assert.deepEqual(j(D.apning([[[1, 2], [3, 3]], [[5, 5], [0, 6]], [[6, 6]]])), { v: 100 + 24 + 0.6, spiller: 2, brikke: [6, 6] });
  const a = D.apning([[[1, 2], [3, 4]], [[5, 6], [0, 1]]]);
  assert.equal(a.spiller, 1);
  assert.deepEqual(j(a.brikke), [5, 6]);
  // The forced tile is the only legal first move
  assert.deepEqual(j(D.trekk([[1, 2], [6, 6]], [], [6, 6])), [{ i: 1, side: "s" }]);
});

test("fitting and turning: left, right, both; the line's ends move", () => {
  const rekke = [];
  D.legg(rekke, [3, 5], "s");
  assert.deepEqual(j(D.ender(rekke)), [3, 5]);
  assert.deepEqual(j(D.sider([5, 6], rekke)), ["h"]);
  assert.deepEqual(j(D.sider([1, 3], rekke)), ["v"]);
  assert.deepEqual(j(D.sider([3, 5], rekke)), ["v", "h"]);
  assert.deepEqual(j(D.sider([2, 4], rekke)), []);
  assert.deepEqual(j(D.legg(rekke, [5, 6], "h")), [5, 6]);
  assert.deepEqual(j(D.legg(rekke, [1, 3], "v")), [1, 3]);
  assert.deepEqual(j(D.legg(rekke, [6, 6], "h")), [6, 6]);
  assert.deepEqual(j(D.legg(rekke, [0, 1], "v")), [0, 1]);
  assert.deepEqual(j(D.legg(rekke, [2, 6], "h")), [6, 2], "turned so the 6 meets the 6");
  assert.deepEqual(j(rekke), [[0, 1], [1, 3], [3, 5], [5, 6], [6, 6], [6, 2]]);
  for (let k = 1; k < rekke.length; k++) assert.equal(rekke[k - 1][1], rekke[k][0], "neighbours must match");
  // Equal ends: one choice only
  assert.deepEqual(j(D.sider([4, 2], [[4, 1], [1, 4]])), ["v"]);
  assert.deepEqual(j(D.nyeEnder([[4, 1], [1, 2]], [2, 5], "h")), [4, 5]);
  assert.deepEqual(j(D.nyeEnder([[4, 1], [1, 2]], [4, 0], "v")), [0, 2]);
});

test("blocked: the lightest hand wins the others' pips; a tie gives nobody anything", () => {
  const hender = [[[1, 1]], [[6, 6], [0, 1]], [[2, 3]]];
  assert.equal(D.blokkVinner(hender), 0);
  assert.equal(D.poengFor(hender, 0), 13 + 5);
  assert.equal(D.blokkVinner([[[1, 2]], [[0, 3]]]), null);
});

test("seeded phone players at every level: only tiles that fit, every round ends, no tile lost", () => {
  let runder = 0;
  for (const variant of ["trekk", "blokk"])
    for (const nivaer of [["lett", "lett"], ["middels", "vanskelig"], ["vanskelig", "lett", "middels"], ["lett", "middels", "vanskelig", "vanskelig"]])
      for (let fro = 1; fro <= 12; fro++) {
        let lagt = 0;
        const r = D.runde(fro * 7919 + nivaer.length, nivaer, {
          variant,
          apning: fro % 3 !== 0,
          starter: fro % nivaer.length,
          sjekk(hva, d) {
            if (hva === "legg") {
              lagt++;
              const t = d.t;
              assert.ok(d.hand.some((x) => nokkel(x) === nokkel(t)), "laid a tile it doesn't have");
              const e = D.ender(d.rekke);
              if (!e) {
                assert.equal(d.m.side, "s");
                if (d.krav) assert.equal(nokkel(t), nokkel(d.krav), "the opening tile was not the forced one");
              } else assert.ok(d.m.side === "v" ? t.includes(e[0]) : t.includes(e[1]), `laid ${t} at ${d.m.side} on ends ${e}`);
            } else {
              // Nothing to lay: really nothing fits
              assert.equal(D.trekk(d.hand, d.rekke, d.krav).length, 0, "drew or passed with a tile that fits");
            }
          },
        });
        assert.ok(!r.uendelig, `round ${fro} (${variant}, ${nivaer}) never ended`);
        assert.equal(r.hender.flat().length + r.rekke.length + r.bunke.length, 28, "a tile was lost");
        for (let k = 1; k < r.rekke.length; k++) assert.equal(r.rekke[k - 1][1], r.rekke[k][0]);
        if (!r.blokkert) assert.equal(r.hender[r.vinner].length, 0);
        else if (variant === "trekk") assert.equal(r.bunke.length, 0, "blocked with tiles left to draw");
        if (r.vinner != null) assert.equal(r.poeng, D.poengFor(r.hender, r.vinner));
        assert.equal(lagt, r.rekke.length);
        runder++;
      }
  assert.equal(runder, 96);
});

test("seeded: the same seed gives the same round; Vanskelig beats Lett most of the time", () => {
  assert.deepEqual(j(D.runde(99, ["middels", "vanskelig"])), j(D.runde(99, ["middels", "vanskelig"])));
  let poeng = [0, 0];
  for (let fro = 1; fro <= 200; fro++) {
    const nivaer = fro % 2 ? ["vanskelig", "lett"] : ["lett", "vanskelig"];
    const r = D.runde(fro * 104729, nivaer, { variant: "blokk" });
    if (r.vinner != null) poeng[nivaer[r.vinner] === "vanskelig" ? 0 : 1] += r.poeng;
  }
  assert.ok(poeng[0] > poeng[1] * 1.2, `Vanskelig ${poeng[0]} poeng, Lett ${poeng[1]}`);
});
