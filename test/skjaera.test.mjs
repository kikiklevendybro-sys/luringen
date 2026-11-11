// Skjæra: the board generator, the growing boards of «Hvor langt kommer du?», the tie-break helper
// and the Christmas season. Loads rusj/spill/skjaera/spill.js without the kit (node:vm): the file
// then only exposes its rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROT, "rusj/spill/skjaera/data/ting.json"), "utf8"));
const kontekst = { window: { RUSJ_DATA: { ting: data } }, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/skjaera/spill.js"), "utf8"), kontekst);
const { TING, VANLIGE, JUL, NIVAER, LANGT_START, LANGT_MAKS, FJAER, langtSpes, lagRunde, ledere, erJul } = kontekst.window.Skjaera;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const unike = (liste) => new Set(liste).size === liste.length;

test("the things: no picture twice among the ordinary ones, a Christmas set big enough for every board", () => {
  assert.ok(unike(VANLIGE.map((i) => TING[i].e)), "an ordinary picture is used twice");
  assert.ok(unike(VANLIGE.map((i) => TING[i].n)), "an ordinary name is used twice");
  assert.ok(unike(JUL.map((i) => TING[i].e)) && unike(JUL.map((i) => TING[i].n)), "a Christmas picture or name is used twice");
  assert.ok(JUL.length >= LANGT_MAKS, `the Christmas set has ${JUL.length} things, the biggest board ${LANGT_MAKS}`);
  // The ordinary things keep their numbers (saved games point at them): the Christmas set comes last.
  assert.equal(Math.min(...JUL), VANLIGE.length);
  for (const t of TING) assert.ok(t.e && t.n && t.n.length <= 22, `odd thing: ${JSON.stringify(t)}`);
});

test("«Hvor langt kommer du?»: four things first, two stolen from 9, shuffled from 12, three stolen from 16", () => {
  assert.equal(LANGT_START, 4);
  assert.equal(FJAER, 3);
  let forrige = 0;
  for (let n = LANGT_START; n <= LANGT_MAKS; n++) {
    const N = langtSpes(n);
    assert.equal(N.ting, n);
    assert.equal(N.stjel, n >= 16 ? 3 : n >= 9 ? 2 : 1, `stolen at ${n}`);
    assert.equal(!!N.stokk, n >= 12, `shuffle at ${n}`);
    assert.ok(N.valg > N.stjel && N.valg <= 6, `options at ${n}`);
    assert.ok(N.sek >= forrige && N.sek >= 5 && N.sek <= 12, `seconds at ${n}`);
    assert.ok(N.temaer >= 1 && N.temaer * 15 >= n, `themes at ${n}`);
    forrige = N.sek;
  }
});

function sjekkBrett(b, N, navn, jul) {
  assert.equal(b.brett.length, N.ting, `${navn}: things on the board`);
  assert.ok(unike(b.brett), `${navn}: a thing twice on the board`);
  assert.equal(b.stjalet.length, N.stjel, `${navn}: stolen`);
  assert.ok(unike(b.stjalet) && b.stjalet.every((p) => p >= 0 && p < N.ting), `${navn}: stolen positions`);
  const tatt = b.stjalet.map((p) => b.brett[p]);
  assert.equal(b.valg.length, N.valg, `${navn}: options`);
  assert.ok(unike(b.valg), `${navn}: an option twice`);
  for (const x of tatt) assert.ok(b.valg.includes(x), `${navn}: a stolen thing is not among the options`);
  // The bug that was fixed: no option may still lie on the board in plain sight.
  for (const x of b.valg) assert.ok(tatt.includes(x) || !b.brett.includes(x), `${navn}: the option ${TING[x].n} is still on the board`);
  assert.ok(unike([...b.brett, ...b.valg.filter((x) => !tatt.includes(x))].map((x) => TING[x].e)), `${navn}: the same picture twice`);
  const igjen = b.brett.filter((_, p) => !b.stjalet.includes(p));
  assert.equal(b.plass.length, N.ting, `${navn}: places`);
  assert.equal(b.plass.filter((x) => x === -1).length, N.stjel, `${navn}: gaps`);
  assert.deepEqual([...b.plass.filter((x) => x >= 0)].sort((x, y) => x - y), [...igjen].sort((x, y) => x - y), `${navn}: what is left`);
  if (!N.stokk) assert.deepEqual([...b.plass], Array.from(b.brett, (x, p) => (b.stjalet.includes(p) ? -1 : x)), `${navn}: nothing moves without a shuffle`);
  if (jul) assert.ok(b.brett.every((x) => JUL.includes(x)), `${navn}: a Christmas board with other things`);
  else assert.ok([...b.brett, ...b.valg].every((x) => VANLIGE.includes(x)), `${navn}: Christmas things outside the season`);
  assert.equal(b.fase, "se");
  assert.deepEqual([...b.gjett], []);
}

test("every level deals a fair board: the stolen things among the options, no option left on the board", () => {
  assert.equal(NIVAER.length, 12);
  for (let L = 0; L < NIVAER.length; L++)
    for (let fro = 1; fro <= 60; fro++)
      for (const jul of [false, true]) {
        const b = lagRunde(NIVAER[L], rng(fro * 977 + L), { niva: L, jul });
        sjekkBrett(b, NIVAER[L], `level ${L + 1}${jul ? " (jul)" : ""}, seed ${fro}`, jul);
        assert.equal(b.niva, L);
        assert.equal(b.e, undefined);
      }
});

test("the growing boards deal fair boards from 4 to 30 things", () => {
  for (let n = LANGT_START; n <= LANGT_MAKS; n++)
    for (let fro = 1; fro <= 40; fro++)
      for (const jul of [false, true]) {
        const N = langtSpes(n);
        const b = lagRunde(N, rng(fro * 131 + n), { e: n, jul });
        sjekkBrett(b, N, `${n} things${jul ? " (jul)" : ""}, seed ${fro}`, jul);
        assert.equal(b.e, n);
      }
});

test("easy boards take their wrong options from other themes, harder boards from the same themes", () => {
  for (let fro = 1; fro <= 40; fro++) {
    const lett = lagRunde(NIVAER[0], rng(fro), { niva: 0 });
    const paBrett = new Set(lett.brett.map((x) => TING[x].t));
    const tatt = lett.stjalet.map((p) => lett.brett[p]);
    for (const x of lett.valg) if (!tatt.includes(x)) assert.ok(!paBrett.has(TING[x].t), "level 1: a wrong option from a theme on the board");
    const vanskelig = lagRunde(NIVAER[9], rng(fro), { niva: 9 });
    const tatt2 = vanskelig.stjalet.map((p) => vanskelig.brett[p]);
    const temaer = new Set(tatt2.map((x) => TING[x].t));
    const lokke = vanskelig.valg.filter((x) => !tatt2.includes(x));
    assert.ok(lokke.some((x) => temaer.has(TING[x].t)), "level 10: no wrong option from the themes of what was stolen");
  }
});

test("who shares the lead: all of them, or only among those still in the tie-break", () => {
  assert.deepEqual([...ledere([3, 5, 5, 1])], [1, 2]);
  assert.deepEqual([...ledere([0, 0])], [0, 1]);
  assert.deepEqual([...ledere([4, 2, 3])], [0]);
  assert.deepEqual([...ledere([7, 9, 9, 8], [0, 3])], [3]);
});

test("the Christmas set is offered from 1 November to 6 January", () => {
  for (const dag of ["2026-11-01", "2026-11-10", "2026-12-24", "2026-12-31", "2027-01-01", "2027-01-06"]) assert.equal(erJul(dag), true, dag);
  for (const dag of ["2026-10-31", "2027-01-07", "2026-02-14", "2026-05-17", "2026-07-01"]) assert.equal(erJul(dag), false, dag);
});
