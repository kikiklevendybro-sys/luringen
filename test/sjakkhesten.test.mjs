// Sjakkhesten: the chess rules and the engine. Loads rusj/spill/sjakkhesten/spill.js without the kit
// (node:vm): the file then only exposes the pure rules (Sjakk) and the engine (Motor).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/sjakkhesten/spill.js"), "utf8"), kontekst);
const { Sjakk, Motor } = kontekst.window.Sjakkhesten;

// Play moves given in UCI (e2e4, e7e8q) from a FEN; fails on an illegal move.
function parti(fen, ...trekk) {
  const p = Sjakk.nyttParti(fen);
  for (const t of trekk.flatMap((x) => x.split(" ")).filter(Boolean)) {
    const m = Sjakk.fraUci(p, t);
    assert.ok(m, `ulovlig trekk ${t} i ${Sjakk.fen(p.pos)}`);
    Sjakk.spill(p, m);
  }
  return p;
}
const uci = (p) => p.lovlige.map(Sjakk.uci).sort();
const har = (p, t) => p.lovlige.some((m) => Sjakk.uci(m) === t);
function seededRng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("perft: the standard positions give the known node counts", () => {
  const POS = [
    [Sjakk.START, [20, 400, 8902, 197281]],
    ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039, 97862, 4085603]],
    ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238, 674624]],
    ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467, 422333]],
    ["r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1", [6, 264, 9467, 422333]],
    ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379, 2103487]],
    ["r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", [46, 2079, 89890, 3894594]],
  ];
  for (const [fen, tall] of POS) {
    const pos = Sjakk.lesFen(fen);
    tall.forEach((n, i) => assert.equal(Sjakk.perft(pos, i + 1), n, `${fen} dybde ${i + 1}`));
    assert.equal(Sjakk.fen(pos), fen, "make/unmake leaves the position exactly as it was");
  }
});

test("FEN reads and writes back unchanged; the hash follows every move", () => {
  for (const fen of [Sjakk.START, "r3k2r/8/8/8/3pP3/8/8/R3K2R b KQkq e3 0 1", "8/8/8/8/8/8/8/K6k w - - 12 60"]) assert.equal(Sjakk.fen(Sjakk.lesFen(fen)), fen);
  const p = parti(Sjakk.START, "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 f1e2 e7e5 e1g1");
  const fersk = Sjakk.lesFen(Sjakk.fen(p.pos));
  assert.equal(p.pos.h1, fersk.h1);
  assert.equal(p.pos.h2, fersk.h2);
});

test("castling: rights, empty squares and no castling out of, through or into check", () => {
  const fri = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
  let p = parti(fri);
  assert.ok(har(p, "e1g1") && har(p, "e1c1"), "both castlings with free squares");
  p = parti(fri, "e1f1 e8f8 f1e1 f8e8");
  assert.ok(!har(p, "e1g1") && !har(p, "e1c1"), "a king that has moved can't castle");
  p = parti(fri, "h1g1 a8b8 g1h1 b8a8");
  assert.ok(!har(p, "e1g1") && har(p, "e1c1"), "the moved rook's side is lost, the other kept");
  p = parti("rn2k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "a1a8");
  assert.equal(p.pos.rokade, 1 | 4, "a captured rook takes its castling right with it (and the moved one too)");
  assert.ok(har(p, "e8g8"), "the other side's short castling is still there");
  assert.ok(!har(parti("4k3/8/8/8/8/8/8/R3K2r w Q - 0 1"), "e1c1"), "no castling out of check");
  assert.ok(!har(parti("3rk3/8/8/8/8/8/8/R3K3 w Q - 0 1"), "e1c1"), "no castling through an attacked square (d1)");
  assert.ok(!har(parti("2r1k3/8/8/8/8/8/8/R3K3 w Q - 0 1"), "e1c1"), "no castling into check (c1)");
  assert.ok(har(parti("1r2k3/8/8/8/8/8/8/R3K3 w Q - 0 1"), "e1c1"), "b1 may be attacked in long castling");
  assert.ok(!har(parti("4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1"), "e1c1"), "every square between king and rook must be empty");
  p = parti(fri, "e1g1");
  assert.equal(Sjakk.fen(p.pos).split(" ")[0], "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1", "the rook jumps over the king");
  assert.equal(p.san[0], "O-O");
  p = parti(fri, "e1g1 e8c8");
  assert.equal(p.san[1], "O-O-O");
  Sjakk.tilbake(p);
  Sjakk.tilbake(p);
  assert.equal(Sjakk.fen(p.pos), fri, "taking castling back restores rook, king and rights");
});

test("en passant: only right after the double step, never into check", () => {
  let p = parti(Sjakk.START, "e2e4 a7a6 e4e5 d7d5");
  assert.ok(har(p, "e5d6"), "en passant right after d7–d5");
  const ep = p.lovlige.find((m) => Sjakk.uci(m) === "e5d6");
  assert.equal(Sjakk.san(p.pos, ep, p.lovlige), "exd6");
  Sjakk.spill(p, ep);
  assert.equal(Sjakk.fen(p.pos).split(" ")[0], "rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR", "the passed pawn is removed");
  p = parti(Sjakk.START, "e2e4 a7a6 e4e5 d7d5 g1f3 h7h6");
  assert.ok(!har(p, "e5d6"), "one move later it is too late");
  // Both pawns leave the fifth rank: the rook would give check along it, so not allowed.
  p = parti("8/8/8/K1pP3r/8/8/8/7k w - c6 0 2");
  assert.ok(!har(p, "d5c6"), "en passant that uncovers check is illegal");
  p = parti("8/8/8/2pP4/8/8/8/K6k w - c6 0 2");
  assert.ok(har(p, "d5c6"), "the same capture without the pin is fine");
});

test("promotion: four choices, also when capturing; notation with the Norwegian letter", () => {
  const p = parti("1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1");
  assert.deepEqual([...p.lovlige.map(Sjakk.uci).filter((t) => t.startsWith("a7")).sort()], ["a7a8b", "a7a8n", "a7a8q", "a7a8r", "a7b8b", "a7b8n", "a7b8q", "a7b8r"]);
  const m = Sjakk.fraUci(p, "a7b8q");
  assert.equal(Sjakk.san(p.pos, m, p.lovlige), "axb8=D+");
  Sjakk.spill(p, m);
  assert.equal(Sjakk.fen(p.pos).split(" ")[0], "1Q2k3/8/8/8/8/8/8/4K3");
  Sjakk.tilbake(p);
  assert.equal(Sjakk.fen(p.pos).split(" ")[0], "1n2k3/P7/8/8/8/8/8/4K3", "taking it back gives the pawn back");
});

test("check: only moves that end the check are legal; a pinned piece can't move off the line", () => {
  // The knight on d3 gives check and also covers f2: only four king moves are left.
  let p = parti("4k3/8/8/8/8/3n4/8/R3K3 w Q - 0 1");
  assert.ok(Sjakk.status(p).sjakk);
  assert.deepEqual([...uci(p)], ["e1d1", "e1d2", "e1e2", "e1f1"]);
  assert.ok(!har(p, "a1a8") && !har(p, "e1c1"), "no rook move or castling while in check from the knight");
  p = parti("4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1");
  assert.ok(!p.lovlige.some((m) => Sjakk.uci(m).startsWith("e2")), "the pinned bishop can't move");
});

test("game end: mate, stalemate, three repetitions, 50 moves and dead positions", () => {
  let p = parti(Sjakk.START, "f2f3 e7e5 g2g4 d8h4");
  assert.deepEqual({ ...Sjakk.status(p) }, { slutt: true, vinner: Sjakk.SVART, grunn: "matt", sjakk: true });
  assert.equal(p.san[3], "Dh4#");
  // Sam Loyd's ten-move stalemate
  p = parti(Sjakk.START, "e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6");
  assert.equal(Sjakk.status(p).grunn, "patt");
  assert.equal(Sjakk.status(p).vinner, null);
  // Repetition: the start position a second time is not enough, the third time is a draw.
  p = parti(Sjakk.START, "g1f3 g8f6 f3g1 f6g8");
  assert.equal(Sjakk.status(p).slutt, false);
  p = parti(Sjakk.START, "g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8");
  assert.equal(Sjakk.status(p).grunn, "gjentakelse");
  // Same placement, but a possible en passant capture makes it another position
  p = parti("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1", "e2e4 e8d8 e1d1 d8e8 d1e1 e8d8 e1d1 d8e8 d1e1");
  assert.equal(Sjakk.status(p).slutt, false, "the first time had an en passant possibility");
  // 50-move rule, but a mate on the 100th half-move counts as mate
  p = parti("7k/8/8/8/8/8/8/K5R1 w - - 99 80", "a1b1");
  assert.equal(Sjakk.status(p).grunn, "femti");
  p = parti("7k/8/6K1/8/8/8/8/R7 w - - 99 80", "a1a8");
  assert.equal(Sjakk.status(p).grunn, "matt");
  // Dead positions
  for (const [fen, dod] of [
    ["8/8/4k3/8/8/3K4/8/8 w - - 0 1", true],
    ["8/8/4k3/8/8/3KB3/8/8 w - - 0 1", true],
    ["8/8/4k3/8/8/3KN3/8/8 w - - 0 1", true],
    ["8/2b5/4k3/8/8/3KB3/8/8 w - - 0 1", true],
    ["8/3b4/4k3/8/8/3KB3/8/8 w - - 0 1", false],
    ["8/8/4k3/8/8/3KNN2/8/8 w - - 0 1", false],
    ["8/8/4k3/8/8/3KP3/8/8 w - - 0 1", false],
    ["8/8/4k3/8/8/3KR3/8/8 w - - 0 1", false],
  ])
    assert.equal(Sjakk.forLiteMateriell(Sjakk.lesFen(fen)), dod, fen);
  assert.equal(Sjakk.status(parti("8/8/4k3/8/8/3KB3/8/8 w - - 0 1")).grunn, "materiell");
});

test("time running out: a loss, unless the other side can't mate at all", () => {
  const kan = (fen, side) => Sjakk.kanSetteMatt(Sjakk.lesFen(fen), side);
  assert.equal(kan("8/8/4k3/8/8/3K4/8/8 w - - 0 1", 0), false, "a lone king can't mate");
  assert.equal(kan("8/8/4k3/8/8/3KB3/8/8 w - - 0 1", 0), false, "king and bishop against a lone king");
  assert.equal(kan("8/8/4k3/4p3/8/3KB3/8/8 w - - 0 1", 0), true, "with a black pawn on the board a mate is possible");
  assert.equal(kan("8/8/4k3/8/8/3KR3/8/8 w - - 0 1", 0), true);
});

test("notation: Norwegian letters and disambiguation", () => {
  let p = parti("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1");
  assert.equal(Sjakk.san(p.pos, Sjakk.fraUci(p, "b1d2"), p.lovlige), "Sbd2");
  assert.equal(Sjakk.san(p.pos, Sjakk.fraUci(p, "f1d2"), p.lovlige), "Sfd2");
  p = parti("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1");
  assert.equal(Sjakk.san(p.pos, Sjakk.fraUci(p, "a1a3"), p.lovlige), "T1a3");
  p = parti(Sjakk.START, "e2e4 d7d5 e4d5 d8d5 b1c3");
  assert.deepEqual([...p.san], ["e4", "d5", "exd5", "Dxd5", "Sc3"]);
});

test("saved games replay from UCI and refuse illegal lists", () => {
  const p = Sjakk.lastParti(Sjakk.START, ["e2e4", "e7e5", "g1f3"]);
  assert.equal(p.trekk.length, 3);
  assert.equal(Sjakk.lastParti(Sjakk.START, ["e2e5"]), null);
  assert.equal(Sjakk.lastParti(Sjakk.START, ["e2e4", "e2e4"]), null);
});

test("engine: finds mate in one and takes a free queen at every level", () => {
  const matt = parti("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
  for (const n of [2, 3]) {
    const r = Motor.velg(matt, { ...Motor.valgFor(n, matt), tilfeldig: seededRng(n), tid: 3000 });
    assert.equal(Sjakk.uci(r.trekk), "a1a8", `nivå ${n} ser matt i ett`);
  }
  const dronning = parti("4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1");
  for (const n of [1, 2, 3]) {
    const r = Motor.velg(dronning, { ...Motor.valgFor(n, dronning), tilfeldig: seededRng(7), tid: 3000 });
    assert.equal(Sjakk.uci(r.trekk), "d1d5", `nivå ${n} tar dronningen`);
  }
  // Doesn't take a guarded pawn with the queen at Middels and Vanskelig
  const felle = parti("4k3/2p5/3p4/8/8/8/8/3QK3 w - - 0 1");
  for (const n of [2, 3]) {
    const r = Motor.velg(felle, { ...Motor.valgFor(n, felle), tilfeldig: seededRng(3), tid: 3000 });
    assert.notEqual(Sjakk.uci(r.trekk), "d1d6", `nivå ${n} slår ikke en dekket bonde med dronningen`);
  }
});

test("engine: mates with king and queen instead of stalemating", () => {
  const p = parti("8/8/8/4k3/8/8/8/3QK3 w - - 0 1");
  for (let n = 0; n < 60 && !Sjakk.status(p).slutt; n++) {
    const r = Motor.velg(p, { ...Motor.valgFor(3, p), tid: 250 });
    assert.ok(p.lovlige.includes(r.trekk), "the engine only plays legal moves");
    Sjakk.spill(p, r.trekk);
    if (Sjakk.status(p).slutt) break;
    // The lone king runs: any legal move
    Sjakk.spill(p, p.lovlige[n % p.lovlige.length]);
  }
  assert.equal(Sjakk.status(p).grunn, "matt", `ender med ${Sjakk.status(p).grunn} etter ${p.trekk.length} halvtrekk`);
});

test("engine: the search yields often (time slices) and each slice is short", () => {
  const p = parti("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
  Motor.nullstill();
  const r = Motor.velg(p, { dybde: 4, qsok: true });
  assert.ok(r.skiver > 20, `bare ${r.skiver} skiver for ${r.noder} noder`);
  assert.ok(r.noder / r.skiver < 2000, "a slice is a few hundred nodes, not the whole search");
});

test("engine: tenk() runs in slices with setTimeout and answers within its time budget", async () => {
  const p = parti(Sjakk.START, "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6");
  let pauser = 0;
  let sist = performance.now();
  let lengst = 0;
  const vakt = setInterval(() => {
    const na = performance.now();
    lengst = Math.max(lengst, na - sist);
    sist = na;
    pauser++;
  }, 1);
  const t0 = performance.now();
  const svar = await new Promise((ok) => Motor.tenk(p, { ...Motor.NIVA[3], tid: 700 }, ok));
  const brukt = performance.now() - t0;
  clearInterval(vakt);
  assert.ok(p.lovlige.includes(svar.trekk), "a legal move");
  assert.ok(brukt < 1000, `answered after ${Math.round(brukt)} ms (budget 700)`);
  assert.ok(pauser > 10 && lengst < 80, `the event loop got ${pauser} turns, longest wait ${Math.round(lengst)} ms`);
});

test("engine: stopping a search means no answer", async () => {
  const p = parti(Sjakk.START);
  let svart = false;
  const stopp = Motor.tenk(p, { ...Motor.NIVA[3], tid: 400 }, () => (svart = true));
  stopp();
  await new Promise((ok) => setTimeout(ok, 600));
  assert.equal(svart, false);
});
