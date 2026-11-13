// Bonden: win detection for three in a row (3 × 3) and five in a row (10 × 10 and 15 × 15), and the computer
// players. Loads rusj/spill/bonden/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/bonden/spill.js"), "utf8"), kontekst);
const { Brett, Data } = kontekst.window.Bonden;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tre = (...trekk) => Brett.spillUt("tre", trekk, 1);
const fem = (...trekk) => Brett.spillUt("fem", trekk, 1);

test("three in a row: every row, column and diagonal wins; nothing else does", () => {
  const linjer = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const l of linjer) {
    // kryss takes the line; bolle plays the first free cells outside it
    const andre = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !l.includes(i));
    const st = tre(l[0], andre[0], l[1], andre[1], l[2]);
    assert.equal(st.vunnet.spiller, 1, `linja ${l}`);
    assert.deepEqual([...st.vunnet.celler], [...l].sort((a, b) => a - b));
  }
  assert.equal(tre(0, 4, 1, 2).vunnet, null);
  // O X O / O X X / X O O, bolle first: full and no line
  const st = Brett.spillUt("tre", [0, 1, 2, 4, 3, 5, 7, 6, 8], 2);
  assert.equal(st.vunnet, null);
  assert.equal(st.fullt, true);
});

test("illegal moves are refused: a taken cell, outside the board, after a win", () => {
  assert.equal(tre(4, 4), null);
  assert.equal(tre(9), null);
  assert.equal(tre(-1), null);
  assert.equal(tre(0, 3, 1, 4, 2, 5), null);
  assert.equal(Brett.spillUt("ukjent", [0], 1), null);
});

test("five in a row: across, down, both diagonals, longer lines, but no wrapping round the edge", () => {
  let st = fem(40, 0, 41, 1, 42, 2, 43, 3, 44);
  assert.deepEqual([...st.vunnet.celler], [40, 41, 42, 43, 44]);
  st = fem(5, 0, 15, 1, 25, 2, 35, 3, 45);
  assert.deepEqual([...st.vunnet.celler], [5, 15, 25, 35, 45]);
  st = fem(0, 9, 11, 19, 22, 29, 33, 39, 44);
  assert.deepEqual([...st.vunnet.celler], [0, 11, 22, 33, 44]);
  st = fem(9, 0, 18, 1, 27, 2, 36, 3, 45);
  assert.deepEqual([...st.vunnet.celler], [9, 18, 27, 36, 45]);
  assert.equal(fem(40, 0, 41, 1, 42, 2, 43).vunnet, null, "four is not enough");
  // Six in a row (the sixth joins two pieces) counts too
  st = fem(50, 0, 51, 2, 52, 4, 54, 6, 55, 8, 53);
  assert.equal(st.vunnet.spiller, 1);
  assert.equal(st.vunnet.celler.length, 6);
  // 7, 8, 9 at the end of one row and 10, 11 at the start of the next are not a line
  assert.equal(fem(7, 50, 8, 51, 9, 52, 10, 60, 11).vunnet, null);
});

// Every way a person can play: the phone (any of its best moves) must never lose.
test("Uslåelig never loses on 3 × 3, whoever starts", () => {
  const vinner = (b) => Data.vinner3(b);
  let partier = 0;
  const utforsk = (b, tur, mobilen) => {
    const v = vinner(b);
    if (v) {
      assert.notEqual(v, 3 - mobilen, `mobilen tapte: ${b.join("")}`);
      partier++;
      return;
    }
    if (b.every((x) => x)) {
      partier++;
      return;
    }
    if (tur === mobilen) {
      for (const i of Data.beste3(b, mobilen)) {
        b[i] = mobilen;
        utforsk(b, 3 - tur, mobilen);
        b[i] = 0;
      }
    } else {
      for (let i = 0; i < 9; i++)
        if (!b[i]) {
          b[i] = tur;
          utforsk(b, 3 - tur, mobilen);
          b[i] = 0;
        }
    }
  };
  utforsk(new Array(9).fill(0), 1, 2); // you start
  utforsk(new Array(9).fill(0), 1, 1); // the phone starts
  assert.ok(partier > 1000, `bare ${partier} partier undersøkt`);
});

test("3 × 3: Middels always wins when it can and always blocks; Lett plays legal moves", () => {
  // bolle (2) to move can win at 5 (3, 4, 5)
  const b = [1, 1, 0, 2, 2, 0, 1, 0, 0];
  for (let i = 0; i < 30; i++) assert.equal(Data.tre(b.slice(), 2, 2, rng(i)), 5);
  // kryss threatens 0-1-2: bolle must block at 2
  const c = [1, 1, 0, 0, 2, 0, 0, 0, 0];
  for (let i = 0; i < 30; i++) assert.equal(Data.tre(c.slice(), 2, 2, rng(i)), 2);
  for (let i = 0; i < 50; i++) {
    const m = Data.tre(c.slice(), 2, 1, rng(i));
    assert.ok(m >= 0 && m < 9 && !c[m]);
  }
});

test("five in a row: the phone completes five, blocks a four, and stops an open three", () => {
  const b = new Array(100).fill(0);
  [44, 45, 46, 47].forEach((i) => (b[i] = 2));
  [0, 1, 2, 3].forEach((i) => (b[i] = 1));
  for (const niva of [2, 3]) assert.ok([43, 48].includes(Data.fem(b.slice(), 2, niva, rng(niva))), "bolle tar femmeren");
  // kryss (1) must stop bolle's four
  const c = new Array(100).fill(0);
  [44, 45, 46, 47].forEach((i) => (c[i] = 2));
  [11, 12].forEach((i) => (c[i] = 1));
  for (const niva of [2, 3]) assert.ok([43, 48].includes(Data.fem(c.slice(), 1, niva, rng(niva))), `nivå ${niva} stopper fireren`);
  // an open three (_ X X X _) must be answered at one of its ends by Vanskelig
  const d = new Array(100).fill(0);
  [44, 45, 46].forEach((i) => (d[i] = 2));
  [0, 99].forEach((i) => (d[i] = 1));
  const svar = Data.fem(d.slice(), 1, 3, rng(1));
  assert.ok([42, 43, 47, 48].includes(svar), `Vanskelig svarte ${svar} på en åpen treer`);
});

test("five in a row: the first move is in the middle, every move is on a free cell", () => {
  for (let i = 0; i < 10; i++) assert.ok([44, 45, 54, 55].includes(Data.fem(new Array(100).fill(0), 1, 3, rng(i))));
  const r = rng(42);
  const b = new Array(100).fill(0);
  let s = 1;
  for (let n = 0; n < 60; n++) {
    const i = Data.fem(b.slice(), s, 1 + (n % 3), r);
    assert.ok(i >= 0 && i < 100 && !b[i], `trekk ${n}: ${i}`);
    b[i] = s;
    s = 3 - s;
  }
});

function femKamp(sterkNiva, svakNiva, fro, sterk) {
  const r = rng(fro);
  const liste = [];
  let st = Brett.spillUt("fem", liste, 1);
  while (!st.vunnet && !st.fullt) {
    liste.push(Data.fem(st.b.slice(), st.tur, st.tur === sterk ? sterkNiva : svakNiva, r));
    st = Brett.spillUt("fem", liste, 1);
  }
  return st.vunnet ? (st.vunnet.spiller === sterk ? "sterk" : "svak") : "uavgjort";
}

test("five in a row: each level beats the one below it", () => {
  for (let g = 0; g < 6; g++) assert.equal(femKamp(3, 1, 300 + g, 1 + (g % 2)), "sterk", `Vanskelig mot Lett, parti ${g}`);
  for (let g = 0; g < 6; g++) assert.equal(femKamp(2, 1, 400 + g, 1 + (g % 2)), "sterk", `Middels mot Lett, parti ${g}`);
  // On a 10 × 10 board good defence often ends in a full board; Vanskelig must never lose.
  let seire = 0;
  for (let g = 0; g < 10; g++) {
    const res = femKamp(3, 2, 1000 + g, 1 + (g % 2));
    assert.notEqual(res, "svak", `Vanskelig tapte mot Middels i parti ${g}`);
    if (res === "sterk") seire++;
  }
  assert.ok(seire >= 2, `Vanskelig vant bare ${seire} av 10 mot Middels`);
});

test("five in a row: a forced win is found and carried through against the best defence", () => {
  // kryss has 33 34 35 (row 3, blocked at 32) and 46 56 66 (column 6): 36 makes two fours at once.
  const b = new Array(100).fill(0);
  [33, 34, 35, 46, 56, 66].forEach((i) => (b[i] = 1));
  [0, 9, 90, 99, 32, 23].forEach((i) => (b[i] = 2));
  let s = 1;
  for (let n = 0; n < 9; n++) {
    const m = Data.fem(b.slice(), s, 3, rng(n));
    assert.ok(m >= 0 && !b[m], "a legal move");
    b[m] = s;
    const linje = Brett.linje(b, 10, 5, m);
    if (linje) {
      assert.equal(s, 1, "kryss, who had the forced win, gets five");
      return;
    }
    s = 3 - s;
  }
  assert.fail("no five within nine moves");
});

// ---------- The big board (15 × 15) and the boards that were there before it ----------

// The existing modes must play exactly as before the big board came: 30 seeded games between the
// levels on 3 × 3 and 10 × 10 (a fake clock, so only the node budgets limit the search) give the same
// moves and winners, move for move, as the version without it (fingerprint taken from it).
test("three in a row and five in a row on 10 × 10 play exactly as before the 15 × 15 board", async () => {
  const { createHash } = await import("node:crypto");
  const k = { window: {}, performance: { now: () => 0 }, console, setTimeout, clearTimeout };
  vm.createContext(k);
  vm.runInContext(readFileSync(join(ROT, "rusj/spill/bonden/spill.js"), "utf8"), k);
  const B = k.window.Bonden;
  const ut = [];
  for (const variant of ["tre", "fem"])
    for (const [a, b] of [[1, 1], [1, 2], [2, 3], [3, 3], [3, 1]])
      for (let fro = 1; fro <= 3; fro++) {
        const r = rng(fro * 97 + a * 7 + b);
        const trekk = [];
        for (;;) {
          const st = B.Brett.spillUt(variant, trekk, 1);
          if (st.vunnet || st.fullt) {
            ut.push([variant, a, b, fro, trekk.join(","), st.vunnet ? st.vunnet.spiller : 0]);
            break;
          }
          const niva = st.tur === 1 ? a : b;
          trekk.push(variant === "tre" ? B.Data.tre(st.b.slice(), st.tur, niva, r) : B.Data.fem(st.b.slice(), st.tur, niva, r));
        }
      }
  assert.equal(createHash("sha256").update(JSON.stringify(ut)).digest("hex"), "1be280de84e617f98d4bd733699e1c04e286e5eb2dc623e1b14950cc6c643432");
  // the old boards keep their sizes, and a saved 10 × 10 game still replays
  assert.deepEqual(JSON.parse(JSON.stringify(Brett.VARIANT.tre)), { n: 3, rad: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(Brett.VARIANT.fem)), { n: 10, rad: 5 });
  assert.equal(fem(40, 0, 41, 1, 42, 2, 43, 3, 44).vunnet.spiller, 1);
});

const stor = (...trekk) => Brett.spillUt("stor", trekk, 1);

test("15 × 15: five in a row anywhere, also along the edges, but never round the edge", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Brett.VARIANT.stor)), { n: 15, rad: 5 });
  // the right edge of row 0: 10–14
  let st = stor(10, 30, 11, 31, 12, 32, 13, 33, 14);
  assert.deepEqual([...st.vunnet.celler], [10, 11, 12, 13, 14]);
  // 12, 13, 14 and then 15, 16 (the next row) is no line
  assert.equal(stor(12, 60, 13, 61, 14, 62, 15, 63, 16).vunnet, null);
  // the bottom-left to top-right diagonal through the middle
  st = stor(112, 0, 98, 1, 84, 2, 126, 3, 140);
  assert.deepEqual([...st.vunnet.celler], [84, 98, 112, 126, 140]);
  assert.equal(stor(225), null);
  assert.equal(stor(-1), null);
});

test("15 × 15: the first move is in the middle; the phone takes five and blocks a four", () => {
  for (let i = 0; i < 5; i++) assert.equal(Data.stor(new Array(225).fill(0), 1, 3, rng(i)), 112);
  const b = new Array(225).fill(0);
  [112, 113, 114, 115].forEach((i) => (b[i] = 2));
  [0, 1, 2, 3].forEach((i) => (b[i] = 1));
  for (const niva of [2, 3]) assert.ok([111, 116].includes(Data.stor(b.slice(), 2, niva, rng(niva))), `nivå ${niva} tar femmeren`);
  // kryss (1) has two of its own, bolle four: kryss must stop it
  const c = new Array(225).fill(0);
  [112, 113, 114, 115].forEach((i) => (c[i] = 2));
  [30, 31].forEach((i) => (c[i] = 1));
  for (const niva of [2, 3]) assert.ok([111, 116].includes(Data.stor(c.slice(), 1, niva, rng(niva))), `nivå ${niva} stopper fireren`);
});

test("15 × 15: only legal moves over many seeded games, and every game ends", () => {
  let vunnet = 0;
  for (const [a, b] of [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3]])
    for (let fro = 1; fro <= 2; fro++) {
      const r = rng(fro * 31 + a * 5 + b);
      const trekk = [];
      let st = Brett.spillUt("stor", trekk, 1);
      while (!st.vunnet && !st.fullt) {
        const i = Data.stor(st.b.slice(), st.tur, st.tur === 1 ? a : b, r);
        assert.ok(i >= 0 && i < 225 && !st.b[i], `ulovlig trekk ${i}`);
        trekk.push(i);
        st = Brett.spillUt("stor", trekk, 1);
        assert.ok(st && trekk.length <= 225);
      }
      if (st.vunnet) vunnet++;
    }
  assert.ok(vunnet >= 12, `bare ${vunnet} av 18 partier fikk fem på rad`);
});
