// Dam: the Nordic draughts rules and the engine. Loads rusj/spill/dam/spill.js without the kit
// (node:vm): the file then only exposes the pure rules (Dam) and the engine (Motor).
//
// The ladder (self-play, measured 2026-11-12 with node budgets close to what a phone manages in
// the game's time limits; two random opening moves per game, colours alternating, 20 games each):
//   Lett – Nybegynner 20–0, Middels – Lett 20–0, Vanskelig – Middels 20–0, Vanskelig – Nybegynner 20–0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/dam/spill.js"), "utf8"), kontekst);
const { Dam, Motor } = kontekst.window.Dam;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A position from rows 8 → 1 (8 characters each), then the side to move and the quiet-move count.
const stilling = (rader, side = "w", stille = 0) => `${rader.join("/")} ${side} ${stille}`;
const TOM = "........";
const trekk = (p) => [...p.lovlige.map(Dam.notasjon)].sort();
function perft(pos, d) {
  if (!d) return 1;
  let n = 0;
  for (const m of Dam.trekkListe(pos)) {
    const u = Dam.gjor(pos, m);
    n += perft(pos, d - 1);
    Dam.angre(pos, m, u);
  }
  return n;
}

test("start: 12 pieces each on the dark squares, white has seven moves; move counts and make/unmake", () => {
  const p = Dam.nyttParti();
  assert.deepEqual([...Dam.antallBrikker(p.pos)], [12, 12]);
  assert.deepEqual(trekk(p), ["a3-b4", "c3-b4", "c3-d4", "e3-d4", "e3-f4", "g3-f4", "g3-h4"]);
  // These counts are the same as for other 8×8 rule sets where men capture backwards.
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((d) => perft(p.pos, d)), [7, 49, 302, 1469, 7482, 37986]);
  assert.equal(Dam.skrivStilling(p.pos), Dam.START, "make/unmake leaves the position as it was");
  const fersk = Dam.lesStilling(Dam.skrivStilling(p.pos));
  assert.equal(fersk.h1, p.pos.h1);
});

test("capturing is mandatory, men capture backwards too, and you choose which capture", () => {
  // c3 must capture d4; the quiet move a3-b4 is not allowed
  const p = Dam.nyttParti(stilling([".......b", TOM, TOM, TOM, "...b....", "w.w.....", TOM, TOM]));
  assert.deepEqual(trekk(p), ["c3xe5"]);
  // A man captures backwards: white e5 over d4 to c3
  const q = Dam.nyttParti(stilling([".b......", TOM, TOM, "....w...", "...b....", TOM, TOM, TOM]));
  assert.deepEqual(trekk(q), ["e5xc3"]);
  // Men do not move backwards without capturing
  const r = Dam.nyttParti(stilling([".b......", TOM, TOM, "....w...", TOM, TOM, TOM, TOM]));
  assert.deepEqual(trekk(r), ["e5-d6", "e5-f6"]);
  // No rule that the biggest capture must be taken: the one-piece capture e3xg5 is allowed too
  const v = Dam.nyttParti(stilling([TOM, TOM, "...b....", TOM, ".b...b..", "w...w...", TOM, TOM]));
  assert.deepEqual(trekk(v), ["a3xc5xe7", "e3xg5"]);
});

test("multi-jumps: the capture goes on as long as it can; each choice is its own move", () => {
  const p = Dam.nyttParti(stilling([".......b", TOM, "...b.b..", TOM, "...b....", "..w.....", TOM, "w......."]));
  assert.deepEqual(trekk(p), ["c3xe5xc7", "c3xe5xg7"]);
  const m = Dam.finn(p, "c3xe5xc7");
  assert.deepEqual([...m.slag.map(Dam.navn)].sort(), ["d4", "d6"]);
  Dam.spill(p, m);
  assert.deepEqual([...Dam.antallBrikker(p.pos)], [2, 2]);
  Dam.tilbake(p);
  assert.deepEqual([...Dam.antallBrikker(p.pos)], [2, 4], "undo puts the jumped pieces back");
});

test("a piece is jumped only once, and jumped pieces stay on the board until the capture is done", () => {
  // A ring of four black men around e4/e6: the white man goes round and ends on its own start square.
  const p = Dam.nyttParti(stilling([".b......", TOM, "...b.b..", TOM, "...b.b..", "....w...", TOM, TOM]));
  const lengste = Math.max(...p.lovlige.map((m) => m.slag.length));
  assert.equal(lengste, 4);
  assert.ok(trekk(p).includes("e3xc5xe7xg5xe3"));
  assert.ok(p.lovlige.every((m) => new Set(m.slag).size === m.slag.length), "no piece is captured twice");
});

test("promotion: ending on the far row makes a king; passing it mid-capture does not", () => {
  let p = Dam.nyttParti(stilling([TOM, "......w.", ".b......", TOM, TOM, TOM, TOM, TOM]));
  const m = Dam.finn(p, "g7-h8");
  assert.ok(m && m.blir);
  Dam.spill(p, m);
  assert.equal(p.pos.b[Dam.rute("h8")], 2, "a white king on h8");
  // b6 over c7 to d8, then on over e7 back down to f6: still a man
  p = Dam.nyttParti(stilling([TOM, "..b.b...", ".w......", TOM, TOM, TOM, TOM, "w......."]));
  assert.deepEqual(trekk(p), ["b6xd8xf6"]);
  Dam.spill(p, p.lovlige[0]);
  assert.equal(p.pos.b[Dam.rute("f6")], 1, "the man that passed d8 is still a man");
  // Without e7 the capture ends on d8: a king
  p = Dam.nyttParti(stilling([TOM, "..b.....", ".w......", TOM, TOM, TOM, TOM, "w......."]));
  assert.deepEqual(trekk(p), ["b6xd8"]);
  assert.ok(p.lovlige[0].blir);
});

test("flying kings: any distance, capture from afar, land on any empty square beyond", () => {
  const p = Dam.nyttParti(stilling([TOM, TOM, TOM, TOM, "...b....", TOM, TOM, "W......."]));
  assert.deepEqual(trekk(p), ["a1xe5", "a1xf6", "a1xg7", "a1xh8"]);
  // Without anything to capture the king glides the whole diagonal
  const q = Dam.nyttParti(stilling([".......b", TOM, TOM, TOM, TOM, TOM, TOM, "W......."]));
  assert.deepEqual(trekk(q), ["a1-b2", "a1-c3", "a1-d4", "a1-e5", "a1-f6", "a1-g7"]);
  // Two pieces in a row cannot be jumped; a king continues capturing after landing
  const r = Dam.nyttParti(stilling([TOM, TOM, ".....b..", TOM, "...b....", "..b.....", TOM, "W......."]));
  assert.deepEqual(trekk(r), ["a1-b2"], "c3 and d4 next to each other cannot be jumped");
  const k = Dam.nyttParti(stilling([TOM, "....b...", TOM, TOM, "...b....", TOM, TOM, "W......."]));
  assert.ok(trekk(k).includes("a1xf6xd8"), "after landing on f6 the king captures e7 and lands on d8");
});

test("the end: no pieces or no moves loses; repetition and 40 quiet moves are draws", () => {
  let p = Dam.nyttParti(stilling([TOM, TOM, ".b......", "..w.....", TOM, TOM, TOM, TOM]));
  Dam.spill(p, Dam.finn(p, "c5xa7"));
  assert.deepEqual({ ...Dam.status(p) }, { slutt: true, vinner: 0, grunn: "tom" });
  p = Dam.nyttParti(stilling([".....b.b", "......w.", TOM, TOM, TOM, TOM, TOM, TOM]));
  assert.deepEqual({ ...Dam.status(p) }, { slutt: true, vinner: 1, grunn: "fast" }, "a blocked man: white cannot move and loses");
  // Kings shuffling: the start position comes back a third time
  p = Dam.nyttParti(stilling([TOM, TOM, TOM, TOM, TOM, TOM, ".......B", "W......."]));
  for (const t of ["a1-b2", "h2-g1", "b2-a1", "g1-h2", "a1-b2", "h2-g1", "b2-a1"]) {
    assert.equal(Dam.status(p).slutt, false);
    Dam.spill(p, Dam.finn(p, t));
  }
  Dam.spill(p, Dam.finn(p, "g1-h2"));
  assert.equal(Dam.status(p).grunn, "gjentakelse");
  // 40 moves without a capture or a man moving
  p = Dam.nyttParti(stilling([TOM, TOM, TOM, TOM, TOM, TOM, ".......B", "W......."], "w", 39));
  Dam.spill(p, Dam.finn(p, "a1-b2"));
  assert.equal(Dam.status(p).grunn, "stille");
  // A man move resets the count
  p = Dam.nyttParti(stilling([TOM, TOM, TOM, TOM, TOM, "w.......", ".......B", TOM], "w", 39));
  Dam.spill(p, Dam.finn(p, "a3-b4"));
  assert.equal(p.pos.stille, 0);
  assert.equal(Dam.status(p).slutt, false);
});

test("saved games replay from notation and refuse illegal lists", () => {
  assert.equal(Dam.lastParti(Dam.START, ["c3-d4", "b6-c5", "d4xb6"]).trekk.length, 3);
  assert.equal(Dam.lastParti(Dam.START, ["c3-d4", "b6-c5", "e3-f4"]), null, "ignoring a capture is illegal");
  assert.equal(Dam.lastParti(Dam.START, ["c3-c4"]), null);
  assert.equal(Dam.lesStilling("nonsense"), null);
});

test("engine: the phone's moves are always legal, at every level", () => {
  const rnd = rng(11);
  for (const niva of [1, 2, 3, 4]) {
    const p = Dam.nyttParti();
    for (let n = 0; n < 60 && !Dam.status(p).slutt; n++) {
      const r = Motor.velg(p, { ...Motor.valgFor(niva, p), tid: 1e9, maksNoder: 4000, tilfeldig: rnd });
      assert.ok(p.lovlige.includes(r.trekk), `nivå ${niva} spilte et ulovlig trekk`);
      Dam.spill(p, r.trekk);
    }
  }
});

test("engine: takes the free piece and the multi-jump; Vanskelig beats Nybegynner with a fixed node budget", () => {
  const p = Dam.nyttParti(stilling([".......b", TOM, "...b.b..", TOM, "...b....", "..w.....", TOM, "w......."]));
  const r = Motor.velg(p, { ...Motor.valgFor(4, p), tid: 1e9, maksNoder: 20000 });
  assert.ok(["c3xe5xc7", "c3xe5xg7"].includes(Dam.notasjon(r.trekk)));
  const rnd = rng(5);
  let seire = 0;
  const N = 6;
  for (let g = 0; g < N; g++) {
    const sterk = g % 2; // the colour of Vanskelig
    const q = Dam.nyttParti();
    for (let n = 0; n < 200 && !Dam.status(q).slutt; n++) {
      const niva = q.pos.side === sterk ? 4 : 1;
      Motor.nullstill();
      const m = Motor.velg(q, { ...Motor.valgFor(niva, q), tid: 1e9, maksNoder: niva === 4 ? 15000 : 2000, tilfeldig: rnd });
      Dam.spill(q, m.trekk);
    }
    if (Dam.status(q).vinner === sterk) seire++;
  }
  assert.ok(seire >= N - 1, `Vanskelig vant bare ${seire} av ${N}`);
});

test("engine: tenk() works in slices and can be stopped", async () => {
  const p = Dam.nyttParti();
  Motor.nullstill();
  const r = Motor.velg(p, { dybde: 6 });
  assert.ok(r.skiver > 10 && r.noder / r.skiver < 1000, `bare ${r.skiver} skiver for ${r.noder} noder`);
  const svar = await new Promise((ok) => Motor.tenk(p, { ...Motor.NIVA[4], tid: 300 }, ok));
  assert.ok(p.lovlige.includes(svar.trekk));
  let svart = false;
  const stopp = Motor.tenk(p, { ...Motor.NIVA[4], tid: 300 }, () => (svart = true));
  stopp();
  await new Promise((ok) => setTimeout(ok, 450));
  assert.equal(svart, false);
});
