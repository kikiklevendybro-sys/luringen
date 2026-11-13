// Såmannen: the rules of kalaha (Scandinavian mancala) and the engine. Loads
// rusj/spill/samannen/spill.js without the kit (node:vm): the file then only exposes the pure rules
// (Kalaha) and the engine (Motor). The engine gets a fake clock and a node budget, so every game
// here is the same on every run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/samannen/spill.js"), "utf8"), kontekst);
const { Kalaha, Motor } = kontekst.window.Samannen;

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
const sum = (b) => b.reduce((a, x) => a + x, 0);

test("the start: 4 or 6 marbles in each of the twelve pits, empty stores, side 0 to move", () => {
  for (const k of [4, 6]) {
    const p = Kalaha.nyttParti(k);
    assert.equal(sum(p.b), 12 * k);
    assert.equal(p.b[6] + p.b[13], 0);
    assert.deepEqual(js(Kalaha.lovlige(p)), [0, 1, 2, 3, 4, 5]);
  }
  assert.equal(Kalaha.spillUt(5, []), null);
});

test("sowing: one in each pit counter-clockwise, own store yes, the other's store never", () => {
  const p = Kalaha.nyttParti(4);
  // pit 2 with 4: 3, 4, 5, the store → another turn
  const h = Kalaha.spill(p, 2);
  assert.deepEqual(js(h.gang), [3, 4, 5, 6]);
  assert.equal(h.igjen, true);
  assert.equal(p.tur, 0);
  assert.deepEqual(js(p.b), [4, 4, 0, 5, 5, 5, 1, 4, 4, 4, 4, 4, 4, 0]);
  // a big pit skips the other side's store
  const q = Kalaha.nyttParti(4);
  q.b[5] = 10;
  const g = Kalaha.spill(q, 5);
  assert.ok(!g.gang.includes(13), "sådde i motstanderens kalaha");
  assert.deepEqual(js(g.gang), [6, 7, 8, 9, 10, 11, 12, 0, 1, 2]);
  // side 1 skips side 0's store
  const r = Kalaha.nyttParti(4);
  r.tur = 1;
  r.b[12] = 9;
  const f = Kalaha.spill(r, 12);
  assert.deepEqual(js(f.gang), [13, 0, 1, 2, 3, 4, 5, 7, 8]);
  assert.equal(r.tur, 0);
  assert.equal(Kalaha.spill(r, 9), null, "the other side's pit");
});

test("a capture: the last marble in an own empty pit takes the pit opposite", () => {
  const p = Kalaha.nyttParti(4);
  p.b = [1, 0, 4, 4, 4, 4, 0, 4, 4, 4, 4, 7, 4, 0];
  // pit 0 has 1: it lands in pit 1 (empty, own); opposite is pit 11 with 7
  const h = Kalaha.spill(p, 0);
  assert.deepEqual(js(h.tatt), { fra: 11, antall: 8 });
  assert.equal(p.b[6], 8);
  assert.equal(p.b[1], 0);
  assert.equal(p.b[11], 0);
  assert.equal(p.tur, 1);
  // landing in an own empty pit with nothing opposite: no capture
  const q = Kalaha.nyttParti(4);
  q.b = [1, 0, 4, 4, 4, 4, 0, 4, 4, 4, 4, 0, 4, 0];
  assert.equal(Kalaha.spill(q, 0).tatt, null);
  assert.equal(q.b[1], 1);
  // undo puts every marble back
  Kalaha.tilbake(p);
  assert.deepEqual(js(p.b), [1, 0, 4, 4, 4, 4, 0, 4, 4, 4, 4, 7, 4, 0]);
  assert.equal(p.tur, 0);
});

test("the end: an empty side ends the game; each takes what is left on their own side", () => {
  const p = Kalaha.nyttParti(4);
  p.b = [0, 0, 0, 0, 0, 1, 20, 3, 0, 2, 0, 0, 1, 21];
  const h = Kalaha.spill(p, 5);
  assert.equal(p.slutt, true);
  assert.deepEqual(js(h.rest), [0, 6]);
  assert.equal(p.b[6], 21);
  assert.equal(p.b[13], 27);
  const st = Kalaha.status(p);
  assert.equal(st.vinner, 1);
  assert.deepEqual(js(Kalaha.lovlige(p)), []);
});

function parti(kuler, a, b, fro) {
  const tilfeldig = rng(fro);
  const p = Kalaha.nyttParti(kuler);
  const liste = [];
  while (!p.slutt) {
    const niva = p.tur === 0 ? a : b;
    const i = Motor.velg(p, { niva, tilfeldig, klokke, noder: 4000 });
    assert.ok(Kalaha.lovlige(p).includes(i), `ulovlig trekk ${i} (nivå ${niva})`);
    Kalaha.spill(p, i);
    assert.equal(sum(p.b), 12 * kuler, "kuler forsvant");
    liste.push(i);
    assert.ok(liste.length < 400, "partiet sluttet aldri");
  }
  return { p, liste };
}

test("self-play: only legal moves over many seeded games, marbles are never lost, every game ends", () => {
  for (const kuler of [4, 6])
    for (const [a, b] of [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3]])
      for (let fro = 1; fro <= 4; fro++) {
        const { p, liste } = parti(kuler, a, b, fro * 17 + kuler + a * 3 + b);
        assert.ok(p.slutt);
        assert.equal(p.b[6] + p.b[13], 12 * kuler);
        assert.ok(Kalaha.spillUt(kuler, liste), "the saved moves replay");
      }
});

test("the levels: Middels beats Lett, Vanskelig beats Middels", () => {
  const stige = (sterk, svak, antall) => {
    let seier = 0, tap = 0;
    for (let fro = 1; fro <= antall; fro++) {
      const forst = fro % 2 === 0;
      const { p } = forst ? parti(4, sterk, svak, 700 + fro) : parti(4, svak, sterk, 700 + fro);
      const st = Kalaha.status(p);
      const meg = forst ? 0 : 1;
      if (st.vinner === meg) seier++;
      else if (st.vinner != null) tap++;
    }
    return { seier, tap };
  };
  const a = stige(2, 1, 20);
  assert.ok(a.seier >= 16, `Middels–Lett ${a.seier}–${a.tap}`);
  const b = stige(3, 2, 20);
  assert.ok(b.seier >= 13 && b.seier > b.tap * 2, `Vanskelig–Middels ${b.seier}–${b.tap}`);
});

test("the engine takes an extra turn and a big capture when it can", () => {
  // pit 2 with 4 ends in the store: Vanskelig plays it first
  const p = Kalaha.nyttParti(4);
  assert.equal(Motor.velg(p, { niva: 3, tilfeldig: rng(1), klokke, noder: 4000 }), 2);
  // a capture of 10 is there for the taking
  const q = Kalaha.nyttParti(4);
  q.b = [1, 0, 1, 1, 1, 2, 5, 1, 1, 1, 1, 9, 1, 9];
  for (const niva of [2, 3]) assert.equal(Motor.velg(q, { niva, tilfeldig: rng(2), klokke, noder: 4000 }), 0, `nivå ${niva}`);
});
