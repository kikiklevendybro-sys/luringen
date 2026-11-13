// Mølla: the rules of nine men's morris and the engine. Loads rusj/spill/molla/spill.js without the
// kit (node:vm): the file then only exposes the pure rules (Molle) and the engine (Motor).
// The engine is given a fake clock and a node budget, so every game here is the same on every run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/molla/spill.js"), "utf8"), kontekst);
const { Molle, Motor } = kontekst.window.Molla;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const klokke = () => 0;
const p = (...liste) => Molle.spillUt(liste);
// Arrays made inside the vm context are compared as plain data.
const js = (x) => JSON.parse(JSON.stringify(x));

test("the board: 24 points, 16 mills, every point on two mills, 32 lines between neighbours", () => {
  assert.equal(Molle.XY.length, 24);
  assert.equal(Molle.MOLLER.length, 16);
  for (let i = 0; i < 24; i++) assert.equal(Molle.LINJER[i].length, 2, Molle.navn(i));
  assert.equal(Molle.NABO.reduce((n, l) => n + l.length, 0), 64);
  assert.deepEqual([4, 10, 13, 19].map((i) => Molle.NABO[i].length), [4, 4, 4, 4]);
  assert.equal(Molle.navn(0), "a7");
  assert.equal(Molle.navn(23), "g1");
  assert.equal(Molle.punkt("d6"), 4);
  for (let i = 0; i < 24; i++) assert.equal(Molle.punkt(Molle.navn(i)), i);
});

test("placing: 24 moves at first; a mill takes a piece outside a mill; the history is saved as text", () => {
  const start = Molle.nyttParti();
  assert.equal(Molle.lovlige(start).length, 24);
  // White a7, d7 and g7 (black elsewhere): the third piece closes the top row
  const q = p("a7", "a1", "d7", "d1");
  const mill = Molle.lovlige(q).filter((m) => m[1] === Molle.punkt("g7"));
  assert.deepEqual(js(mill.map((m) => Molle.navn(m[2])).sort()), ["a1", "d1"]);
  const r = p("a7", "a1", "d7", "d1", "g7xa1");
  assert.equal(r.b[Molle.punkt("a1")], 0);
  assert.deepEqual([Molle.igjen(r, 0), Molle.igjen(r, 1)], [9, 8]);
  assert.equal(Molle.tekst(r.hist[4].m), "g7xa1");
  assert.equal(p("a7", "a7"), null, "a taken point");
  assert.equal(p("a7", "a1", "d7", "d1", "g7"), null, "a mill must take a piece");
  assert.equal(p("a7", "a1xd7"), null, "no mill, no capture");
  assert.equal(p("h9"), null);
});

test("pieces in a mill are safe, unless every piece is in one", () => {
  // Black closes a1-d1-g1 (taking b6); every black piece is in that mill, so white's mill may take any
  const q = p("a7", "a1", "d7", "d1", "b6", "g1xb6");
  const alle = Molle.lovlige(q).filter((m) => m[1] === Molle.punkt("g7") && m[2] >= 0).map((m) => Molle.navn(m[2]));
  assert.deepEqual(js(alle).sort(), ["a1", "d1", "g1"]);
  // One black piece outside the mill: only that one
  const r = p("a7", "a1", "d7", "d1", "b6", "g1xb6", "b4", "f2");
  const ta = new Set(Molle.lovlige(r).filter((m) => m[1] === Molle.punkt("g7")).map((m) => Molle.navn(m[2])));
  assert.deepEqual([...ta], ["f2"]);
  // Moving into a mill: g4 up to g7 closes a7-d7-g7
  const mur = Molle.nyttParti();
  mur.hand = [0, 0];
  mur.paBrett = [4, 3];
  for (const t of ["a1", "d1", "g1"]) mur.b[Molle.punkt(t)] = 2;
  for (const t of ["a7", "d7", "g4", "b6"]) mur.b[Molle.punkt(t)] = 1;
  const ta2 = Molle.lovlige(mur).filter((m) => m[2] >= 0);
  assert.ok(ta2.every((m) => Molle.navn(m[0]) === "g4" && Molle.navn(m[1]) === "g7"));
  assert.deepEqual(js(ta2.map((m) => Molle.navn(m[2]))).sort(), ["a1", "d1", "g1"]);
});

test("moving goes along a line to a free neighbour; three pieces fly; undo restores everything", () => {
  const q = Molle.nyttParti();
  q.hand = [0, 0];
  q.paBrett = [4, 4];
  for (const t of ["a7", "a4", "d6", "e4"]) q.b[Molle.punkt(t)] = 1;
  for (const t of ["g7", "g1", "c5", "d1"]) q.b[Molle.punkt(t)] = 2;
  const flytt = js(Molle.grunntrekk(q, 0).map(([f, t]) => Molle.navn(f) + "-" + Molle.navn(t))).sort();
  assert.deepEqual(flytt, ["a4-a1", "a4-b4", "a7-d7", "d6-b6", "d6-d5", "d6-d7", "d6-f6", "e4-e3", "e4-e5", "e4-f4"].sort());
  q.paBrett = [3, 4];
  q.b[Molle.punkt("e4")] = 0;
  assert.equal(Molle.fase(q, 0), "fly");
  assert.equal(Molle.grunntrekk(q, 0).length, 3 * 17);
  const kopi = JSON.stringify(q);
  const m = Molle.lovlige(q)[5];
  Molle.spill(q, m);
  Molle.tilbake(q);
  const etter = JSON.parse(JSON.stringify(q));
  etter.hist = [];
  const for_ = JSON.parse(kopi);
  for_.hist = [];
  assert.deepEqual(etter, for_);
});

test("the end: two pieces left loses, no move loses, 50 quiet moves are a draw", () => {
  const q = Molle.nyttParti();
  q.hand = [0, 0];
  q.paBrett = [3, 3];
  for (const t of ["a7", "d7", "b4"]) q.b[Molle.punkt(t)] = 1;
  for (const t of ["a1", "d1", "g4"]) q.b[Molle.punkt(t)] = 2;
  const m = Molle.lovlige(q).find((x) => Molle.navn(x[0]) === "b4" && Molle.navn(x[1]) === "g7" && x[2] >= 0);
  Molle.spill(q, m);
  assert.equal(q.slutt, true);
  assert.equal(q.vinner, 0);
  assert.equal(q.grunn, "to");
  // Black's four corner pieces: white's d2-d1 takes the last free neighbour
  const g = Molle.nyttParti();
  g.hand = [0, 0];
  g.paBrett = [5, 4];
  for (const t of ["a7", "g7", "a1", "g1"]) g.b[Molle.punkt(t)] = 2;
  for (const t of ["d7", "a4", "g4", "d2", "c5"]) g.b[Molle.punkt(t)] = 1;
  assert.ok(Molle.harTrekk(g, 1));
  const lukk = Molle.lovlige(g).find((x) => Molle.navn(x[0]) === "d2" && Molle.navn(x[1]) === "d1");
  Molle.spill(g, lukk);
  assert.equal(g.slutt, true);
  assert.equal(g.grunn, "fast");
  assert.equal(g.vinner, 0);
  Molle.tilbake(g);
  assert.equal(g.slutt, false);
  const r = Molle.nyttParti();
  r.hand = [0, 0];
  r.paBrett = [4, 4];
  for (const t of ["a7", "a1", "g7", "g1"]) r.b[Molle.punkt(t)] = 1;
  for (const t of ["b6", "b2", "f6", "f2"]) r.b[Molle.punkt(t)] = 2;
  r.rolig = Molle.REMIS - 1;
  Molle.spill(r, Molle.lovlige(r).find((x) => x[2] < 0));
  assert.equal(r.slutt, true);
  assert.equal(r.vinner, null);
  assert.equal(r.grunn, "remis");
});

// Self-play: every move the engine picks is legal, and every game ends.
function parti(a, b, fro, maks = 400) {
  const tilfeldig = rng(fro);
  const q = Molle.nyttParti();
  const liste = [];
  for (let n = 0; n < maks && !q.slutt; n++) {
    const niva = q.tur === 0 ? a : b;
    const m = Motor.velg(q, { niva, tilfeldig, klokke, noder: niva === 3 ? 4000 : 1500 });
    assert.ok(m && Molle.erLovlig(q, m), `ulovlig trekk ${m} (nivå ${niva}, parti ${fro})`);
    Molle.spill(q, m);
    liste.push(Molle.tekst(m));
  }
  return { q, liste };
}

test("self-play: only legal moves over many seeded games, and every game ends", () => {
  const vinnere = { 0: 0, 1: 0, null: 0 };
  let n = 0;
  for (const [a, b] of [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [1, 3], [2, 3], [3, 3]])
    for (let fro = 1; fro <= 5; fro++) {
      const { q, liste } = parti(a, b, fro * 31 + a * 7 + b);
      assert.ok(q.slutt, `partiet ${a}-${b} #${fro} ble ikke ferdig (${liste.length} trekk)`);
      assert.ok(Molle.spillUt(liste), "the saved moves replay");
      vinnere[q.vinner]++;
      n++;
    }
  assert.equal(n, 40);
});

test("the levels: Middels beats Lett, Vanskelig beats Middels (most games)", () => {
  const stige = (sterk, svak, antall) => {
    let seier = 0, tap = 0;
    for (let fro = 1; fro <= antall; fro++) {
      const sterkHvit = fro % 2 === 0;
      const { q } = sterkHvit ? parti(sterk, svak, 900 + fro) : parti(svak, sterk, 900 + fro);
      const sterkSide = sterkHvit ? 0 : 1;
      if (q.vinner === sterkSide) seier++;
      else if (q.vinner != null) tap++;
    }
    return { seier, tap };
  };
  const a = stige(2, 1, 10);
  assert.ok(a.seier >= 7 && a.tap <= 1, `Middels–Lett ${a.seier}–${a.tap}`);
  const b = stige(3, 2, 6);
  assert.ok(b.seier > b.tap, `Vanskelig–Middels ${b.seier}–${b.tap}`);
});

test("the engine closes a mill when it can, and blocks one", () => {
  // White to move with a7 and d7: g7 closes the mill
  const q = p("a7", "a1", "d7", "b2");
  for (const niva of [2, 3]) {
    const m = Motor.velg(q, { niva, tilfeldig: rng(5), klokke, noder: 3000 });
    assert.equal(Molle.navn(m[1]), "g7", `nivå ${niva}`);
    assert.ok(m[2] >= 0);
  }
  // Black to move: white threatens g7
  const r = p("a7", "a1", "d7");
  for (const niva of [2, 3]) {
    const m = Motor.velg(r, { niva, tilfeldig: rng(6), klokke, noder: 3000 });
    assert.equal(Molle.navn(m[1]), "g7", `nivå ${niva} blokkerer`);
  }
});
