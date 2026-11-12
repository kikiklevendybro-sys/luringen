// Blokka: the rules and the piece generator. Loads rusj/spill/blokka/spill.js without the kit
// (node:vm): the file then only exposes the pure rules (Blokk).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/blokka/spill.js"), "utf8"), kontekst);
const { Blokk: B } = kontekst.window.Blokka;
const F = B.FORMER;
const N = B.N;

// A board from 8 strings of "." and "#".
const brett = (...rader) => rader.flatMap((r) => [...r].map((t) => (t === "#" ? 1 : 0)));
// Values from the vm context are compared as plain JSON (their arrays have another prototype).
const j = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b, m) => assert.deepEqual(j(a), j(b), m);
const vis = (b) => Array.from({ length: N }, (_, y) => b.slice(y * N, y * N + N).map((v) => (v ? "#" : ".")).join(""));

test("every shape is whole, unique, never turned by the game, and fits an empty board", () => {
  assert.equal(N, 8);
  const sett = new Set();
  for (const f of B.LISTE) {
    assert.ok(f.n >= 1 && f.n === f.celler.length, f.id);
    assert.ok(f.b <= 5 && f.h <= 5, f.id);
    assert.ok(B.finnesPlass(B.tomt(), f), `${f.id} får ikke plass på et tomt brett`);
    assert.ok(f.farge >= 1 && f.farge <= 7 && f.navn.length > 2, f.id);
    const nokkel = f.celler.map((c) => c.join(",")).sort().join(" ");
    assert.ok(!sett.has(nokkel), `${f.id} er en kopi`);
    sett.add(nokkel);
    // Connected (a polyomino)
    const sett2 = new Set([f.celler[0].join(",")]);
    const ko = [f.celler[0]];
    while (ko.length) {
      const [x, y] = ko.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (!sett2.has(k) && f.celler.some((c) => c.join(",") === k)) {
          sett2.add(k);
          ko.push([x + dx, y + dy]);
        }
      }
    }
    assert.equal(sett2.size, f.n, `${f.id} henger ikke sammen`);
  }
  // No trademark or brand names in the shape names
  assert.ok(B.LISTE.every((f) => !/tetr/i.test(f.navn)));
});

test("placement: inside the board, on empty cells only", () => {
  const b = brett("#.......", "........", "........", "........", "........", "........", "........", "........");
  assert.equal(B.passer(b, F.o4, 0, 0), false, "overlaps a block");
  assert.equal(B.passer(b, F.o4, 1, 0), true);
  assert.equal(B.passer(b, F.o4, 7, 0), false, "sticks out to the right");
  assert.equal(B.passer(b, F["5v"], 0, 4), false, "sticks out at the bottom");
  assert.equal(B.passer(b, F["5v"], 0, 1), true);
  assert.equal(B.passer(b, F.o4, -1, 0), false);
  // An L whose empty corner lies on a block
  const c = brett("##......", "#.......", "........", "........", "........", "........", "........", "........");
  assert.equal(B.passer(c, F.h3d, 0, 0), false);
  assert.equal(B.passer(brett("#.......", "........", "........", "........", "........", "........", "........", "........"), F.h3d, 0, 0), true, "the empty corner of a piece may lie on a block");
  const r = B.legg(B.tomt(), F.t4a, 2, 3);
  eq(vis(r.brett).slice(3, 5), ["..###...", "...#...."]);
  assert.equal(r.linjer, 0);
  assert.equal(B.legg(r.brett, F.o4, 3, 3), null);
});

test("line clears: a row and a column at once, the crossing cell counted once", () => {
  const b = brett(
    "###.####",
    "...#....",
    "...#....",
    "...#....",
    "........",
    "...#....",
    "...#....",
    "...#....",
  );
  // A 1 × 1 at (3, 0) fills row 1 – and with (3, 4) also column 4? No: (3, 4) is still empty.
  let r = B.legg(b, F["1"], 3, 0);
  eq([r.rader, r.kolonner], [[0], []]);
  // Fill (3, 4) first: then the dot at (3, 0) completes row 1 and column 4 together.
  const b2 = B.legg(b, F["1"], 3, 4).brett;
  r = B.legg(b2, F["1"], 3, 0);
  eq([r.rader, r.kolonner], [[0], [3]]);
  assert.equal(r.linjer, 2);
  assert.equal(r.ryddet.length, 15, "8 + 8 − the shared cell");
  assert.ok(r.ryddet.every((c) => c.farge > 0));
  assert.equal(B.fylte(r.brett), 0 + B.fylte(b2) + 1 - 15);
  // Two rows and two columns with one 2 × 2
  const k = brett(
    "......##",
    "......##",
    "........",
    "........",
    "........",
    "........",
    "........",
    "........",
  ).map((v, i) => (Math.floor(i / N) < 2 || i % N < 2 ? 1 : v));
  for (const i of [0, 1, 8, 9]) k[i] = 0;
  const r4 = B.legg(k, F.o4, 0, 0);
  eq([r4.rader, r4.kolonner, r4.linjer], [[0, 1], [0, 1], 4]);
  assert.equal(B.fylte(r4.brett), 0, "the board is empty after the combo");
});

test("scoring: cells, combos, streaks and an empty board", () => {
  eq([1, 2, 3, 4, 5, 6].map(B.linjepoeng), [10, 30, 60, 100, 150, 210]);
  assert.equal(B.poeng(4, 0, 0, false).sum, 4);
  assert.equal(B.poeng(4, 1, 1, false).sum, 14);
  assert.equal(B.poeng(4, 2, 1, false).sum, 34, "a double: 30 for the lines");
  assert.equal(B.poeng(4, 2, 2, false).sum, 4 + 45, "streak 2 multiplies the lines by 1.5");
  assert.equal(B.poeng(5, 3, 3, false).sum, 5 + 120, "streak 3: × 2");
  assert.equal(B.poeng(4, 4, 1, true).sum, 4 + 100 + 300, "an empty board after a clear gives 300");
  assert.equal(B.poeng(4, 0, 3, true).sum, 4, "no lines: no bonus at all");
  // The streak: lives across two pieces without a clear, ends at the third.
  let s = { rekke: 0, siden: 0 };
  s = B.nyRekke(s.rekke, s.siden, 1);
  eq({ ...s }, { rekke: 1, siden: 0 });
  s = B.nyRekke(s.rekke, s.siden, 0);
  s = B.nyRekke(s.rekke, s.siden, 0);
  assert.equal(s.rekke, 1);
  s = B.nyRekke(s.rekke, s.siden, 2);
  eq({ ...s }, { rekke: 2, siden: 0 });
  s = B.nyRekke(s.rekke, s.siden, 1);
  assert.equal(s.rekke, 3);
  for (let i = 0; i < 3; i++) s = B.nyRekke(s.rekke, s.siden, 0);
  assert.equal(s.rekke, 0, "three pieces without a clear end the streak");
  s = B.nyRekke(s.rekke, s.siden, 1);
  assert.equal(s.rekke, 1);
});

test("game over: none of the pieces left fits; used pieces don't count", () => {
  // A checkerboard: only single cells fit.
  const sjakk = Array.from({ length: N * N }, (_, i) => ((i % N) + Math.floor(i / N)) % 2);
  assert.equal(B.erOver(sjakk, ["o4", "2h", "3v"]), true);
  assert.equal(B.erOver(sjakk, ["o4", "1", "3v"]), false);
  assert.equal(B.erOver(sjakk, [null, null, "2v"]), true);
  assert.equal(B.erOver(sjakk, [null, null, null]), false, "an empty tray is a new set, not game over");
  assert.equal(B.erOver(B.tomt(), ["o9", "5h", "5v"]), false);
  // Only the last column is free: a vertical 5 fits, a horizontal one doesn't.
  const kol = Array.from({ length: N * N }, (_, i) => (i % N === 7 ? 0 : 1));
  assert.equal(B.erOver(kol, ["5h", "o4"]), true);
  assert.equal(B.erOver(kol, ["5h", "5v"]), false);
});

test("Dagens blokk: the same sequence for a date, always – and a new one each day", () => {
  const a = Array.from({ length: 20 }, (_, k) => B.dagSett("2026-11-12", k));
  const b = Array.from({ length: 20 }, (_, k) => B.dagSett("2026-11-12", k));
  eq(a, b);
  // Pinned: a change to the generator must never change a day that has been played.
  eq([...a[0]], ["t4a", "r6h", "o4"]);
  eq([...a[1]], ["4h", "r6h", "1"]);
  eq([...B.dagSett("2026-11-13", 0)], ["2v", "r6v", "3h"]);
  assert.notDeepEqual(j(a), j(Array.from({ length: 20 }, (_, k) => B.dagSett("2026-11-13", k))));
  // Every piece is a real shape; the sequence varies (not one shape over and over).
  const alle = a.flat();
  assert.ok(alle.every((id) => !!F[id]));
  assert.ok(new Set(alle).size >= 15);
  // It does not depend on anything but the date and the set number.
  eq([...B.dagSett("2026-11-12", 7)], [...a[7]]);
});

test("generator: fair on any board – at least one of the three fits", () => {
  const tilf = B.rng(42);
  let fro = 7;
  for (let n = 0; n < 3000; n++) {
    // Random boards from empty to almost full (no full lines: those would have been cleared).
    const fyll = tilf() * 0.92;
    const b = Array.from({ length: N * N }, () => (tilf() < fyll ? 1 : 0));
    for (let y = 0; y < N; y++) if (b.slice(y * N, y * N + N).every(Boolean)) b[y * N + Math.floor(tilf() * N)] = 0;
    if (b.every(Boolean)) continue;
    const d = B.delUt(b, fro);
    fro = d.fro;
    assert.equal(d.ids.length, 3);
    assert.ok(d.ids.every((id) => !!F[id]));
    assert.ok(
      d.ids.some((id) => B.finnesPlass(b, F[id])),
      `ingen av ${d.ids.join(", ")} passer på\n${vis(b).join("\n")}`,
    );
  }
});

test("generator: the same seed and board give the same set (an undo can't fish for luck)", () => {
  const b = B.legg(B.tomt(), F.o9, 2, 2).brett;
  eq(B.delUt(b, 1234), B.delUt(b, 1234));
  assert.notEqual(B.delUt(b, 1234).fro, 1234);
});

test("generator: the fuller the board, the smaller the pieces", () => {
  const snitt = (fyll) => {
    const tilf = B.rng(99);
    let sum = 0;
    let n = 0;
    let fro = 5;
    for (let k = 0; k < 600; k++) {
      const b = Array.from({ length: N * N }, (_, i) => (i < Math.round(fyll * N * N) ? 1 : 0));
      // Shuffle the filled cells, keep every row open.
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(tilf() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
      }
      for (let y = 0; y < N; y++) if (b.slice(y * N, y * N + N).every(Boolean)) b[y * N] = 0;
      const d = B.delUt(b, fro);
      fro = d.fro;
      for (const id of d.ids) {
        sum += F[id].n;
        n++;
      }
    }
    return sum / n;
  };
  const tom = snitt(0);
  const halv = snitt(0.5);
  const full = snitt(0.75);
  assert.ok(tom > halv + 0.3 && halv > full, `snittstørrelse ${tom.toFixed(2)} → ${halv.toFixed(2)} → ${full.toFixed(2)}`);
  // The weights themselves: small pieces up, big pieces down.
  const v0 = B.vekter(0);
  const v1 = B.vekter(0.8);
  assert.ok(v1[1] > v0[1] && v1[3] > v0[3] && v1[4] === v0[4] && v1[5] < v0[5] && v1[9] < v0[9] && v1[9] > 0);
});

test("a whole game with a simple player ends, and scores add up", () => {
  let b = B.tomt();
  let fro = 2026;
  let poeng = 0;
  let rekke = 0;
  let siden = 0;
  let lagt = 0;
  for (let runde = 0; runde < 500; runde++) {
    const d = B.delUt(b, fro);
    fro = d.fro;
    const t = d.ids.slice();
    if (B.erOver(b, t)) break;
    let stopp = false;
    for (let k = 0; k < 3; k++) {
      const i = t.findIndex((id) => id && B.finnesPlass(b, F[id]));
      if (i < 0) {
        stopp = true;
        break;
      }
      const p = B.plasser1(b, F[t[i]]);
      const r = B.legg(b, F[t[i]], p.x, p.y);
      const rk = B.nyRekke(rekke, siden, r.linjer);
      rekke = rk.rekke;
      siden = rk.siden;
      poeng += B.poeng(F[t[i]].n, r.linjer, rekke, B.fylte(r.brett) === 0).sum;
      b = r.brett;
      t[i] = null;
      lagt++;
    }
    if (stopp) break;
  }
  assert.ok(lagt > 6 && poeng >= lagt);
});
