// Hopperen: the rules of Chinese checkers on the 121-hole star and the engine. Loads
// rusj/spill/hopperen/spill.js without the kit (node:vm): the file then only exposes the pure rules
// (Stjerne) and the engine (Motor). Every game here is seeded, so it is the same on every run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/hopperen/spill.js"), "utf8"), kontekst);
const { Stjerne, Motor } = kontekst.window.Hopperen;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const js = (x) => JSON.parse(JSON.stringify(x));
const h = (q, r) => Stjerne.finn(q, r);

test("the star: 121 holes, six points of ten, rows of 1-2-3-4-13-12-11-10-9-10-11-12-13-4-3-2-1", () => {
  assert.equal(Stjerne.N, 121);
  for (let k = 0; k < 6; k++) assert.equal(Stjerne.SPISS[k].length, 10, `spiss ${k}`);
  const rader = [];
  for (let r = -8; r <= 8; r++) rader.push(Stjerne.HULL.filter(([, r2]) => r2 === r).length);
  assert.deepEqual(js(rader), [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1]);
  // every hole has 2 to 6 neighbours, and neighbours are mutual
  for (let i = 0; i < 121; i++) {
    const n = Stjerne.NABO[i].filter((x) => x >= 0);
    assert.ok(n.length >= 2 && n.length <= 6);
    for (const x of n) assert.ok(Stjerne.NABO[x].includes(i));
  }
  // the goal of every point is the one straight across
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(Stjerne.mal), [3, 4, 5, 0, 1, 2]);
  // the tip of each goal is 0 steps away and the full goal sums to 20
  for (let k = 0; k < 6; k++) assert.equal(Stjerne.SPISS[k].reduce((s, i) => s + Stjerne.TIL[k][i], 0), 20);
});

test("seats: 2 → across, 3 → every other point, 4 → two pairs, 6 → all", () => {
  for (const [n, seter] of [[2, [0, 3]], [3, [0, 2, 4]], [4, [0, 1, 3, 4]], [6, [0, 1, 2, 3, 4, 5]]]) {
    const p = Stjerne.nyttParti(n);
    assert.deepEqual(js(p.seter), seter);
    for (let s = 0; s < n; s++) assert.equal([...p.b].filter((x) => x === s).length, 10);
  }
  assert.equal(Stjerne.nyttParti(5), null);
});

test("moves: a step to a free neighbour, jumps over one peg, chains of jumps, never two pegs", () => {
  const p = Stjerne.nyttParti(2);
  p.b.fill(-1);
  const a = h(-4, 0);
  p.b[a] = 0;
  // alone at the left end of the middle row: steps only
  const alene = Stjerne.maal(p, a);
  assert.ok(alene.size >= 4 && [...alene.keys()].every((t) => Stjerne.NABO[a].includes(t)));
  // a peg to the right: the step there is gone, a jump over it lands two to the right
  p.b[h(-3, 0)] = 1;
  let m = Stjerne.maal(p, a);
  assert.ok(!m.has(h(-3, 0)) && m.has(h(-2, 0)));
  // a ladder: pegs at (−1,0) and (1,0) let it go on to (0,0) and (2,0) in the same move
  p.b[h(-1, 0)] = 1;
  p.b[h(1, 0)] = 0;
  m = Stjerne.maal(p, a);
  assert.ok(m.has(h(0, 0)) && m.has(h(2, 0)));
  assert.deepEqual(js(Stjerne.vei(a, m, h(2, 0))), [a, h(-2, 0), h(0, 0), h(2, 0)]);
  // two pegs in a row can't be jumped
  p.b[h(-4, 1)] = 1;
  p.b[h(-4, 2)] = 1;
  m = Stjerne.maal(p, a);
  assert.ok(!m.has(h(-4, 3)) && !m.has(h(-4, 2)));
  // the move itself, and undo
  p.tur = 0;
  const g = Stjerne.spill(p, a, h(2, 0));
  assert.equal(g.vei.length, 4);
  assert.equal(p.b[a], -1);
  assert.equal(p.b[h(2, 0)], 0);
  assert.equal(p.tur, 1);
  Stjerne.tilbake(p);
  assert.equal(p.b[a], 0);
  assert.equal(p.tur, 0);
  assert.equal(Stjerne.spill(p, a, h(-4, 3)), null);
  assert.equal(Stjerne.spill(p, h(-3, 0), h(-3, 1)), null, "not the other side's peg");
});

test("a peg in the goal stays in it; filling the goal wins", () => {
  const p = Stjerne.nyttParti(2);
  p.b.fill(-1);
  // side 0 (the bottom point) goes to the top point (3). Nine pegs are in; one edge hole is free.
  const mal = Stjerne.SPISS[3];
  const kant = mal.filter((i) => Stjerne.TIL[3][i] === 3);
  const fri = kant[1];
  for (const i of mal) if (i !== fri) p.b[i] = 0;
  const utenfor = Stjerne.NABO[fri].find((n) => n >= 0 && Stjerne.SPISS_AV[n] !== 3);
  p.b[utenfor] = 0;
  p.tur = 0;
  // an edge peg of the goal can't step out of it
  for (const i of kant.filter((x) => x !== fri)) for (const t of Stjerne.maal(p, i).keys()) assert.equal(Stjerne.SPISS_AV[t], 3, "en brikke forlot målet");
  assert.equal(Stjerne.iMalet(p, 0), 9);
  const g = Stjerne.spill(p, utenfor, fri);
  assert.ok(g);
  assert.equal(p.slutt, true);
  assert.equal(p.vinner, 0);
  assert.equal(p.grunn, "mal");
  assert.deepEqual(js(Stjerne.rangering(p)), [0, 1]);
});

// Self-play: every move is legal and every game ends.
function parti(antall, nivaer, fro) {
  const tilfeldig = rng(fro);
  const p = Stjerne.nyttParti(antall, fro % antall);
  let n = 0;
  while (!p.slutt) {
    const niva = nivaer[p.tur];
    const m = Motor.velg(p, { niva, tilfeldig });
    assert.ok(m, "ingen trekk");
    assert.ok(Stjerne.maal(p, m[0]).has(m[1]) && p.b[m[0]] === p.tur, `ulovlig trekk ${m}`);
    Stjerne.spill(p, m[0], m[1]);
    n++;
  }
  return { p, n };
}

test("self-play with 2, 3, 4 and 6 seats: only legal moves, and every game ends", () => {
  const avRunder = { 1: 0, 2: 0, 3: 0 };
  for (const antall of [2, 3, 4, 6])
    for (const niva of [1, 2, 3])
      for (let fro = 1; fro <= 3; fro++) {
        const { p } = parti(antall, Array(antall).fill(niva), fro * 11 + antall + niva);
        assert.ok(p.slutt);
        assert.ok(p.vinner >= 0 && p.vinner < antall);
        if (p.grunn === "runder") avRunder[niva]++;
      }
  // Middels and Vanskelig always fill their goal; Lett may need the round limit now and then
  assert.equal(avRunder[2], 0, "Middels fylte ikke målet");
  assert.equal(avRunder[3], 0, "Vanskelig fylte ikke målet");
});

test("the levels: Middels beats Lett, Vanskelig beats Middels (two seats)", () => {
  const stige = (sterk, svak, antall) => {
    let seier = 0;
    for (let fro = 1; fro <= antall; fro++) {
      const nivaer = fro % 2 ? [sterk, svak] : [svak, sterk];
      const { p } = parti(2, nivaer, 300 + fro);
      if (nivaer[p.vinner] === sterk) seier++;
    }
    return seier;
  };
  assert.ok(stige(2, 1, 10) >= 9, "Middels–Lett");
  assert.ok(stige(3, 2, 10) >= 7, "Vanskelig–Middels");
});

test("saved games replay; a broken list is refused", () => {
  const { p } = parti(3, [2, 2, 2], 42);
  const liste = p.hist.map((x) => [x.fra, x.til]);
  const q = Stjerne.spillUt(3, 42 % 3, liste);
  assert.ok(q && q.slutt && q.vinner === p.vinner);
  assert.equal(Stjerne.spillUt(3, 0, [[0, 0]]), null);
  assert.equal(Stjerne.spillUt(5, 0, []), null);
});
