// Telleren (count to 21, the rules grow, 18+): the free numbers, a new rule of every kind (only
// on free numbers, a swap on two, words from the lists never used twice), the suggestions (up to
// three, of different kinds, on different numbers), what fits on the board, the sentences in nb,
// en and da, the board 1–21, and the rules growing until the board is full. Loads
// rusj/spill/telleren/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/telleren/spill.js"), "utf8"), kontekst);
const { TALL, TYPER, LISTE, brukte, frie, lagRegel, forslag, passer, tekst, tavla } = kontekst.window.Telleren;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const les = (m) => JSON.parse(readFileSync(join(ROT, "rusj/spill/telleren", m, "regler.json"), "utf8"));
const SPRAK = { nb: les("data"), en: les("data.en"), da: les("data.da") };
const D = SPRAK.nb;
const kopi = (x) => JSON.parse(JSON.stringify(x));

test("the data: a template for every kind, the same lists in every language", () => {
  for (const [sprak, d] of Object.entries(SPRAK)) {
    for (const type of TYPER) assert.equal(typeof d.maler[type], "string", `${sprak}: no template for ${type}`);
    for (const type of TYPER) {
      const m = d.maler[type];
      if (type === "bytt") assert.ok(m.includes("{a}") && m.includes("{b}"), `${sprak}: ${type}`);
      else assert.ok(m.includes("{tall}"), `${sprak}: ${type} has no {tall}`);
      assert.equal(m.includes("{ting}"), !!LISTE[type], `${sprak}: ${type} and {ting}`);
    }
    for (const liste of Object.values(LISTE)) {
      assert.equal(d[liste].length, D[liste].length, `${sprak}: ${liste} has another length`);
      const tekster = d[liste].map((x) => (typeof x === "string" ? x : x.t));
      assert.equal(new Set(tekster).size, tekster.length, `${sprak}: ${liste} has an entry twice`);
      if (liste !== "ord") assert.ok(d[liste].every((x) => x.ikon && x.t), `${sprak}: ${liste} without an icon`);
    }
  }
});

test("free numbers: 1–20 to start with, and those with a rule are taken", () => {
  assert.equal(frie([]).length, TALL);
  assert.deepEqual(Array.from(frie([{ type: "bytt", tall: [3, 19] }, { type: "hopp", tall: [7] }])).slice(0, 6), [1, 2, 4, 5, 6, 8]);
  assert.equal(frie([{ type: "hopp", tall: [7] }]).includes(21), false, "21 is never a rule");
  assert.deepEqual(Array.from(brukte([{ type: "bytt", tall: [3, 19] }])).sort((a, b) => a - b), [3, 19]);
});

test("a new rule of every kind goes on free numbers, a swap on two different ones", () => {
  const regler = [{ type: "hopp", tall: [5] }, { type: "ord", tall: [9], ting: 0 }];
  for (let fro = 1; fro <= 200; fro++) {
    const r = rng(fro);
    for (const type of TYPER) {
      const x = lagRegel(type, regler, D, r);
      assert.ok(x && passer(regler, x), `${type}: ${JSON.stringify(x)}`);
      assert.equal(x.tall.length, type === "bytt" ? 2 : 1);
      assert.ok(x.tall.every((t) => t >= 1 && t <= TALL && t !== 5 && t !== 9));
      if (type === "bytt") assert.ok(x.tall[0] < x.tall[1]);
      if (type === "ord") assert.notEqual(x.ting, 0, "a word used twice");
    }
  }
  assert.equal(lagRegel("bytt", Array.from({ length: 19 }, (_, i) => ({ type: "hopp", tall: [i + 1] })), D, rng(1)), null, "a swap needs two free numbers");
  assert.equal(lagRegel("ukjent", [], D, rng(1)), null);
});

test("what fits: free numbers only, no word twice, your own rule needs a text", () => {
  const regler = [{ type: "ord", tall: [4], ting: 2 }];
  assert.ok(passer(regler, { type: "ord", tall: [6], ting: 3 }));
  assert.ok(!passer(regler, { type: "ord", tall: [6], ting: 2 }), "the same word");
  assert.ok(!passer(regler, { type: "hopp", tall: [4] }), "a number taken");
  assert.ok(!passer(regler, { type: "hopp", tall: [21] }), "21");
  assert.ok(!passer(regler, { type: "bytt", tall: [6, 6] }), "a swap with itself");
  assert.ok(!passer(regler, { type: "bytt", tall: [6] }), "a swap with one number");
  assert.ok(passer(regler, { type: "egen", tall: [12], tekst: "Bjeff som en hund" }));
  assert.ok(!passer(regler, { type: "egen", tall: [12], tekst: "   " }));
  assert.ok(!passer(regler, null));
});

test("suggestions: up to three, of different kinds, on different free numbers", () => {
  for (let fro = 1; fro <= 300; fro++) {
    const r = rng(fro);
    const regler = [];
    for (let n = 0; n < fro % 9; n++) regler.push(forslag(regler, D, r)[0]);
    const f = forslag(regler, D, r);
    assert.equal(f.length, 3);
    assert.equal(new Set(f.map((x) => x.type)).size, 3, "two suggestions of the same kind");
    const tall = f.flatMap((x) => x.tall);
    assert.equal(new Set(tall).size, tall.length, "two suggestions on the same number");
    for (const x of f) assert.ok(passer(regler, x));
  }
});

test("the rules grow one by one until the board is full", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const r = rng(fro);
    const regler = [];
    let runder = 0;
    while (true) {
      const f = forslag(regler, D, r);
      if (!f.length) break;
      const valgt = f[Math.floor(r() * f.length)];
      assert.ok(passer(regler, valgt));
      const for_ = frie(regler).length;
      regler.push(valgt);
      assert.equal(frie(regler).length, for_ - valgt.tall.length, "the board did not grow by the rule's numbers");
      runder += 1;
      assert.ok(runder <= TALL, "more rules than numbers");
    }
    assert.equal(frie(regler).length, 0, `seed ${fro}: numbers left but no suggestion`);
    assert.equal(brukte(regler).size, TALL);
    for (const type of Object.keys(LISTE)) {
      const ting = regler.filter((x) => x.type === type).map((x) => x.ting);
      assert.equal(new Set(ting).size, ting.length, `seed ${fro}: a ${type} used twice`);
    }
  }
});

test("the sentences fill in the number, the swap and the word – in every language", () => {
  assert.equal(tekst({ type: "ord", tall: [7], ting: 0 }, SPRAK.nb), "Si «banan» i stedet for 7.");
  assert.equal(tekst({ type: "bytt", tall: [4, 15] }, SPRAK.en), "4 and 15 swap places: say 15 instead of 4 – and 4 instead of 15.");
  assert.equal(tekst({ type: "handling", tall: [12], ting: 0 }, SPRAK.da), "Ved 12: klap i hænderne i stedet for at sige tallet.");
  assert.equal(tekst({ type: "egen", tall: [3], tekst: "Bjeff" }, SPRAK.nb), "Bjeff");
  for (const [sprak, d] of Object.entries(SPRAK))
    for (const type of TYPER) {
      const x = lagRegel(type, [], d, rng(9));
      const s = tekst(x, d);
      assert.ok(!/[{}]/.test(s) && s.includes(String(x.tall[0])), `${sprak}: «${s}»`);
    }
});

test("the board: 1–21 with the index of each number's rule", () => {
  const b = tavla([{ type: "hopp", tall: [7] }, { type: "bytt", tall: [2, 20] }]);
  assert.equal(b.length, 21);
  assert.deepEqual(kopi(b[6]), { tall: 7, regel: 0 });
  assert.equal(b[1].regel, 1);
  assert.equal(b[19].regel, 1);
  assert.equal(b[20].tall, 21);
  assert.equal(b[20].regel, -1);
  assert.equal(b.filter((x) => x.regel >= 0).length, 3);
});
