// Reversi: the rules and the engine. Loads rusj/spill/reversi/spill.js without the kit (node:vm):
// the file then only exposes the pure rules (Rev) and the engine (Motor).
//
// The ladder (self-play, measured 2026-11-12; two random opening moves per game, colours
// alternating, Vanskelig with a budget of 200 000 nodes a move ≈ the game's 1.5 s on a phone):
//   Lett – Nybegynner 64–33 (3 draws, 100 games), Middels – Lett 87–9 (4 draws, 100 games),
//   Vanskelig – Middels 30–0 (30 games), Vanskelig – Nybegynner 30–0 (30 games).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/reversi/spill.js"), "utf8"), kontekst);
const { Rev, Motor } = kontekst.window.Reversi;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const navn = (liste) => [...liste].map(Rev.navn).sort();
// A full legal game with a pass in it (black's last move ends it). Also used by the e2e test.
const PASS_PARTI = ["f5","f6","e6","f4","g4","d6","c5","c6","g7","b6","a6","f7","f3","h8","b5","c7","g8","f8","c8","h4","d3","a5","g3","c4","b3","d8","c3","d7","b8","a2","g5","c2","a4","f2","d2","e2","g2","b7","e7","e8","e1","h6","e3","h2","c1","b4","h3","b1","g1","d1","f1","b2","a3","g6","a8","h5","a7","h1","h7","a1"];

test("start: four discs in the middle, black has four moves; the known move counts", () => {
  const p = Rev.nyttParti();
  assert.deepEqual([...Rev.antall(p.b)], [2, 2]);
  assert.deepEqual(navn(p.lovlige), ["c4", "d3", "e6", "f5"]);
  const perft = (b, side, d, pass) => {
    if (!d) return 1;
    const ms = Rev.lovlige(b, side);
    if (!ms.length) return pass ? 1 : perft(b, side ^ 1, d - 1, true);
    let n = 0;
    for (const s of ms) {
      const f = Rev.legg(b, s, side);
      n += perft(b, side ^ 1, d - 1, false);
      Rev.fjern(b, s, side, f);
    }
    return n;
  };
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((d) => perft(p.b, 0, d, false)), [4, 12, 56, 244, 1396, 8200, 55092]);
});

test("a move flips in all eight directions at once, and only lines closed by an own disc", () => {
  const b = new Int8Array(64);
  const s = Rev.rute("d4");
  // Around d4: a white disc in every direction with a black one behind it
  for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    b[(3 + dr) * 8 + 3 + dc] = 2;
    b[(3 + 2 * dr) * 8 + 3 + 2 * dc] = 1;
  }
  const f = Rev.snur(b, s, 0);
  assert.equal(f.length, 8);
  Rev.legg(b, s, 0);
  assert.deepEqual([...Rev.antall(b)], [17, 0]);
  // An open line (white discs up to the edge) flips nothing
  const c = new Int8Array(64);
  c[Rev.rute("b1")] = 2;
  c[Rev.rute("c1")] = 2;
  assert.equal(Rev.snur(c, Rev.rute("a1"), 0).length, 0);
  assert.equal(Rev.kan(c, Rev.rute("a1"), 0), false);
});

test("illegal moves are refused: occupied squares and squares that flip nothing", () => {
  const p = Rev.nyttParti();
  assert.equal(Rev.spill(p, Rev.rute("d4")), null);
  assert.equal(Rev.spill(p, Rev.rute("a1")), null);
  assert.equal(Rev.spillUt(["d3", "d3"]), null);
  assert.equal(Rev.spillUt(["d3", "c3", "c4"]).trekk.length, 3);
});

test("pass: a side without a move stands over; the game ends when neither can move", () => {
  const p = Rev.spillUt(PASS_PARTI);
  assert.ok(p, "the game replays");
  assert.ok(p.hist.some((h) => h.pass), "somebody had to pass");
  const i = p.hist.findIndex((h) => h.pass);
  assert.equal(p.hist[i + 1].side, p.hist[i].side, "after a pass the same side moves again");
  const st = Rev.status(p);
  assert.equal(st.slutt, true);
  assert.equal(Rev.lovlige(p.b, 0).length + Rev.lovlige(p.b, 1).length, 0);
  assert.equal(st.vinner, st.antall[0] > st.antall[1] ? 0 : 1);
  // The shortest win: no white discs left, the game is over at once
  const kort = Rev.spillUt(["d3", "c3", "b3", "d2", "e1", "d6", "d7", "e3", "f4"]);
  assert.deepEqual({ ...Rev.status(kort), antall: [...Rev.status(kort).antall] }, { slutt: true, vinner: 0, antall: [13, 0] });
  // Undo goes back over the end
  Rev.tilbake(kort);
  assert.equal(kort.slutt, false);
  assert.equal(kort.tur, 0);
});

test("engine: the phone's moves are always legal, at every level", () => {
  const rnd = rng(3);
  for (const niva of [1, 2, 3, 4]) {
    const p = Rev.nyttParti();
    while (!p.slutt) {
      const r = Motor.velg(p, { ...Motor.NIVA[niva], tid: 1e9, maksNoder: 3000, tilfeldig: rnd });
      assert.ok(p.lovlige.includes(r.trekk), `nivå ${niva} spilte et ulovlig trekk`);
      Rev.spill(p, r.trekk);
    }
  }
});

test("engine: Lett flips the most, Vanskelig takes a corner, and beats Nybegynner with a fixed node budget", () => {
  // Lett: d3 c3 → black's options; the greedy choice flips the most
  const p = Rev.spillUt(["d3", "c5"]);
  const r = Motor.velg(p, { ...Motor.NIVA[2], tilfeldig: rng(1) });
  const mest = Math.max(...p.lovlige.map((s) => Rev.snur(p.b, s, p.tur).length));
  assert.equal(Rev.snur(p.b, r.trekk, p.tur).length, mest);
  // A corner for free
  const q = Rev.spillUt(PASS_PARTI.slice(0, 12));
  if (q.lovlige.some((s) => [0, 7, 56, 63].includes(s))) assert.ok([0, 7, 56, 63].includes(Motor.velg(q, { ...Motor.NIVA[4], tid: 1e9, maksNoder: 20000 }).trekk));
  const rnd = rng(9);
  let seire = 0;
  const N = 6;
  for (let g = 0; g < N; g++) {
    const sterk = g % 2;
    const s = Rev.nyttParti();
    while (!s.slutt) {
      const niva = s.tur === sterk ? 4 : 1;
      Rev.spill(s, Motor.velg(s, { ...Motor.NIVA[niva], tid: 1e9, maksNoder: 8000, tilfeldig: rnd }).trekk);
    }
    if (Rev.status(s).vinner === sterk) seire++;
  }
  assert.ok(seire >= N - 1, `Vanskelig vant bare ${seire} av ${N}`);
});

test("engine: the last moves are solved exactly", () => {
  // From a position with few empty squares the search reaches the end (exact score, not a guess).
  const p = Rev.spillUt(PASS_PARTI.slice(0, 52));
  const r = Motor.velg(p, { ...Motor.NIVA[4], tid: 1e9 });
  assert.ok(p.lovlige.includes(r.trekk));
  assert.ok(Math.abs(r.verdi) >= 30000 || r.verdi === 0, `ikke løst til slutt: ${r.verdi}`);
});

test("engine: tenk() works in slices and can be stopped", async () => {
  const p = Rev.nyttParti();
  const r = Motor.velg(p, { ...Motor.NIVA[4], tid: 1e9, maksNoder: 30000 });
  assert.ok(r.skiver > 20 && r.noder / r.skiver < 500, `bare ${r.skiver} skiver for ${r.noder} noder`);
  const svar = await new Promise((ok) => Motor.tenk(p, { ...Motor.NIVA[4], tid: 300 }, ok));
  assert.ok(p.lovlige.includes(svar.trekk));
  let svart = false;
  const stopp = Motor.tenk(p, { ...Motor.NIVA[4], tid: 300 }, () => (svart = true));
  stopp();
  await new Promise((ok) => setTimeout(ok, 450));
  assert.equal(svart, false);
});
