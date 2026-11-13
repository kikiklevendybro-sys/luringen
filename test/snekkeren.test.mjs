// Snekkeren: the rules of dots and boxes and the engine. Loads rusj/spill/snekkeren/spill.js without
// the kit (node:vm): the file then only exposes the pure rules (Boks) and the engine (Motor).
// The engine gets a fake clock and a node budget, so every game here is the same on every run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/snekkeren/spill.js"), "utf8"), kontekst);
const { Boks, Motor } = kontekst.window.Snekkeren;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const klokke = () => 0;
const js = (x) => JSON.parse(JSON.stringify(x));

test("the board: 2n(n+1) lines, four per box, one or two boxes per line", () => {
  for (const n of Boks.STORRELSER) {
    const g = Boks.geometri(n);
    assert.equal(g.L, 2 * n * (n + 1));
    assert.ok(g.boksLinjer.every((l) => new Set(l).size === 4));
    const per = g.linjeBokser.map((b) => b.length);
    assert.equal(per.filter((x) => x === 1).length, 4 * n, "the edge lines");
    assert.equal(per.filter((x) => x === 2).length, g.L - 4 * n);
    // every line joins two neighbouring dots
    for (const [r1, c1, r2, c2] of g.ender) assert.equal(Math.abs(r1 - r2) + Math.abs(c1 - c2), 1);
  }
});

test("closing a box gives it to the one who drew the fourth side, who draws again", () => {
  const n = 3;
  const g = Boks.geometri(n);
  const [a, b, c, d] = g.boksLinjer[0];
  const p = Boks.spillUt(n, [a, b, c]);
  assert.equal(p.tur, 1, "no box: the turn passes after each line");
  const h = Boks.spill(p, d);
  assert.deepEqual(js(h.tatt), [0]);
  assert.equal(p.eier[0], 1);
  assert.deepEqual(js(p.poeng), [0, 1]);
  assert.equal(p.tur, 1, "the one who closed a box draws again");
  // one line closing two boxes at once
  const [, , , hoyre0] = g.boksLinjer[0];
  const q = Boks.nyttParti(n);
  for (const l of [...g.boksLinjer[0], ...g.boksLinjer[1]]) if (l !== hoyre0) Boks.spill(q, l);
  const to = Boks.spill(q, hoyre0);
  assert.equal(to.tatt.length, 2);
  // undo restores everything
  Boks.tilbake(q);
  assert.equal(q.eier[0], -1);
  assert.equal(q.eier[1], -1);
  assert.equal(q.linjer[hoyre0], 0);
  assert.equal(Boks.spill(q, g.boksLinjer[0][0]), null, "a drawn line can't be drawn again");
  assert.equal(Boks.spillUt(n, [0, 0]), null);
  assert.equal(Boks.spillUt(7, []), null);
  assert.equal(Boks.spillUt(n, [g.L]), null);
});

function parti(n, a, b, fro) {
  const tilfeldig = rng(fro);
  const p = Boks.nyttParti(n);
  const liste = [];
  while (!p.slutt) {
    const niva = p.tur === 0 ? a : b;
    const l = Motor.velg(p, { niva, tilfeldig, klokke, noder: 3000 });
    assert.ok(Boks.kan(p, l), `ulovlig strek ${l} (nivå ${niva})`);
    Boks.spill(p, l);
    liste.push(l);
    assert.ok(liste.length <= p.g.L);
  }
  return { p, liste };
}

test("self-play: only legal lines over many seeded games; every game ends with every box owned", () => {
  for (const n of Boks.STORRELSER)
    for (const [a, b] of [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2], [2, 3], [3, 3]])
      for (let fro = 1; fro <= 3; fro++) {
        const { p, liste } = parti(n, a, b, fro * 13 + n * 7 + a + b);
        assert.equal(liste.length, p.g.L);
        assert.equal(p.poeng[0] + p.poeng[1], n * n);
        assert.ok([...p.eier].every((e) => e === 0 || e === 1));
        assert.ok(Boks.spillUt(n, liste), "the saved lines replay");
      }
});

test("the levels: Middels beats Lett, Vanskelig beats Middels", () => {
  const stige = (n, sterk, svak, antall) => {
    let seier = 0, tap = 0;
    for (let fro = 1; fro <= antall; fro++) {
      const forst = fro % 2 === 0;
      const { p } = forst ? parti(n, sterk, svak, 500 + fro) : parti(n, svak, sterk, 500 + fro);
      const meg = forst ? 0 : 1;
      if (p.poeng[meg] > p.poeng[1 - meg]) seier++;
      else if (p.poeng[meg] < p.poeng[1 - meg]) tap++;
    }
    return { seier, tap };
  };
  const a = stige(4, 2, 1, 20);
  assert.ok(a.seier >= 16, `Middels–Lett ${a.seier}–${a.tap}`);
  const b = stige(5, 3, 2, 20);
  assert.ok(b.seier >= 13, `Vanskelig–Middels ${b.seier}–${b.tap}`);
});

test("the engine takes a box, never gives one away while it can help it, and then gives the fewest", () => {
  const n = 3;
  const g = Boks.geometri(n);
  // Box 0 has three sides: every level from Middels takes it
  const [a, b, c, d] = g.boksLinjer[0];
  for (const niva of [2, 3]) {
    const p = Boks.spillUt(n, [a, b, c]);
    assert.equal(Motor.velg(p, { niva, tilfeldig: rng(1), klokke }), d);
  }
  // A position with safe lines: Middels and Vanskelig draw one of them
  const q = Boks.spillUt(n, [a, b]);
  for (const niva of [2, 3])
    for (let fro = 0; fro < 10; fro++) {
      const l = Motor.velg(q, { niva, tilfeldig: rng(fro), klokke, noder: 3000 });
      assert.ok(!Boks.gir(q, l), `nivå ${niva} gir bort en boks`);
    }
  // No safe line: a single box in the corner and a snake of the other eight. Every box has two
  // sides; opening the single box costs one, the snake eight.
  const r = Boks.nyttParti(n);
  const apne = new Set([12, 13, 14, 5, 18, 17, 6, 21, 10, 11, 23]);
  for (let l = 0; l < g.L; l++) if (!apne.has(l)) Boks.spill(r, l);
  assert.ok([...r.sider].every((s) => s === 2));
  assert.deepEqual(js(Motor.grupper(r).map((x) => x.bokser.length).sort((x, y) => x - y)), [1, 8]);
  const gratis = (l) => {
    Boks.spill(r, l);
    const x = Motor.gratis(r);
    Boks.tilbake(r);
    return x;
  };
  for (const niva of [2, 3])
    for (let fro = 0; fro < 6; fro++) {
      const valgt = Motor.velg(r, { niva, tilfeldig: rng(fro), klokke, noder: 3000 });
      assert.ok([11, 23].includes(valgt), `nivå ${niva} åpnet slangen (${valgt})`);
      assert.equal(gratis(valgt), 1);
    }
});

test("the chain endgame: the values of a few known positions", () => {
  // One chain: the opener gives it all away
  assert.equal(Motor.verdi([3]), -3);
  // Two chains of 3: the other side takes all but two of the first, the opener must open the second
  // (−1 − 3 = −4 for the opener: gets 2, gives 1 and 3)
  assert.equal(Motor.verdi([3, 3]), -2);
  // Short chains are given away one by one
  assert.equal(Motor.verdi([1, 1]), 0);
  assert.equal(Motor.verdi([1, 1, 1]), -1);
  // A loop of four next to a chain of three
  assert.ok(Number.isFinite(Motor.verdi([-4, 3])));
});

test("Vanskelig keeps control: it leaves the last two boxes of a chain when that wins more", () => {
  // 4 × 1 strips are not a board here; build it on 4 × 4: two long chains left, one opened.
  let funnet = 0;
  for (let fro = 1; fro <= 40 && funnet < 3; fro++) {
    const tilfeldig = rng(fro);
    const p = Boks.nyttParti(5);
    while (!p.slutt) {
      const d = Motor.domino(p);
      const niva = p.tur === 0 ? 3 : 2;
      const l = Motor.velg(p, { niva, tilfeldig, klokke, noder: 3000 });
      if (d && niva === 3 && l === d.ly) {
        // A double deal: no box is closed by it
        const h = Boks.spill(p, l);
        assert.equal(h.tatt.length, 0);
        funnet++;
        continue;
      }
      Boks.spill(p, l);
    }
  }
  assert.ok(funnet >= 1, "Vanskelig ofret aldri to bokser for å beholde kontrollen");
});
