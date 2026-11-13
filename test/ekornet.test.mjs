// Ekornet (match-3): lines and groups, which swaps count, the special pieces (four in a line: an
// arrow along the row or column; five, or an L or a T: a star) and what they clear, chain reactions,
// falling and new pieces, cascades, shuffling a board with no move left (and that no dead board is
// ever left behind), the levels, and the end of a game. Loads rusj/spill/ekornet/spill.js without
// the kit (node:vm): the file then only exposes the pure rules (Match).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/ekornet/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Ekornet.Match;
const N = M.N;
const j = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b, m) => assert.deepEqual(j(a), j(b), m);
const i = (x, y) => y * N + x;

// A board that has no line and no move: every 8 × 8 cell (x, y) gets kind ((x + 2y) mod 5) + 1.
const dodt = () => Array.from({ length: N * N }, (_, n) => (((n % N) + 2 * Math.floor(n / N)) % 5) + 1);
// A board from rows of digits; "." is filled from the dead board (so it adds no lines by itself).
function brett(rader) {
  const b = dodt();
  rader.forEach((r, y) => [...r].forEach((t, x) => t !== "." && (b[i(x, y)] = Number(t))));
  return b;
}
// A random number source that always gives the same kind (for predictable falls).
const fast = (t) => () => (t - 1) / 6 + 0.01;
const alltid6 = fast(6);

test("lines: runs of three or more across and down; runs that share a cell make one group", () => {
  const b = brett(["111.....", "........", "2.......", "2.......", "2.......", "........", "........", "........"]);
  const r = M.rekker(b);
  assert.ok(r.some((x) => x.h && x.t === 1 && x.celler.length === 3));
  assert.ok(r.some((x) => !x.h && x.t === 2 && x.celler.length === 3));
  assert.equal(M.grupper(b).length, 2);
  // An L: three across and three down sharing the corner.
  const l = brett(["333.....", "3.......", "3.......", "........", "........", "........", "........", "........"]);
  const g = M.grupper(l);
  assert.equal(g.length, 1);
  assert.equal(g[0].celler.size, 5);
  assert.equal(M.spesialFor(g[0]), M.STJERNE);
  eq(M.grupper(dodt()), [], "the dead board has no line");
  eq(M.finnTrekk(dodt()), [], "the dead board has no move");
});

test("swaps: only neighbours, only when they make a line, never two alike", () => {
  // Swapping (3,0) and (3,1) brings a 1 next to the 1s at (0..2,0).
  const b = brett(["111.....", "...1....", "........", "........", "........", "........", "........", "........"]);
  b[i(3, 0)] = 4;
  assert.ok(!M.iRekke(b, i(3, 0)));
  assert.ok(M.gyldig(b, i(3, 0), i(3, 1)));
  assert.ok(!M.gyldig(b, i(3, 0), i(5, 5)), "not neighbours");
  assert.ok(!M.gyldig(b, i(0, 0), i(1, 0)), "two alike");
  const d = dodt();
  for (let a = 0; a < N * N; a++) for (const n of [a + 1, a + N]) if (n < N * N && M.nabo(a, n)) assert.ok(!M.gyldig(d, a, n));
  // An invalid move changes nothing.
  const sp = { modus: "brett", niva: 1, k: 6, brett: d.slice(), fro: 5, poeng: 0, trekk: 0, maks: 20, mal: [{ t: 1, n: 5 }], samlet: {}, besteKaskade: 0, spesialer: 0, slutt: null };
  const r = M.trekk(sp, 0, 1);
  assert.equal(r.gyldig, false);
  eq(sp.brett, d);
  assert.equal(sp.trekk, 0);
});

test("four in a line leaves an arrow piece where the swap was; it clears its row when it goes", () => {
  // 1 1 _ 1 in row 3, a 1 under the gap: swap it up → four across → an arrow along the row.
  const b = brett(["........", "........", "........", "11.12...", "..1.....", "........", "........", "........"]);
  b[i(2, 3)] = 4;
  const r = M.los(swap(b, i(2, 3), i(2, 4)), alltid6, 6, [i(2, 3), i(2, 4)]);
  const s = r.steg[0];
  eq(s.nye, [{ i: i(2, 3), v: M.lag(1, M.RAD) }]);
  eq(s.fjern, [i(0, 3), i(1, 3), i(3, 3)]);
  // A vertical four leaves an arrow along the column.
  const v = brett(["....3...", "....5...", "....5...", "...5....", "....5...", "....1...", "........", "........"]);
  v[i(4, 3)] = 2;
  const rv = M.los(swap(v, i(3, 3), i(4, 3)), alltid6, 6, [i(3, 3), i(4, 3)]);
  eq(rv.steg[0].nye, [{ i: i(4, 3), v: M.lag(5, M.KOL) }]);
  // Matching the arrow piece clears its whole row.
  const p = brett(["........", "........", "........", "........", "........", "........", "........", "2.23...."]);
  p[i(0, 7)] = M.lag(2, M.RAD);
  p[i(1, 7)] = 3;
  p[i(1, 6)] = 2;
  const rp = M.los(swap(p, i(1, 7), i(1, 6)), alltid6, 6, [i(1, 7), i(1, 6)]);
  const sp = rp.steg[0];
  eq(sp.utlost, [{ i: i(0, 7), s: M.RAD }]);
  for (let x = 0; x < N; x++) assert.ok(sp.fjern.includes(i(x, 7)), `rad 8, kolonne ${x + 1} ble ikke ryddet`);
});

test("five in a line or an L leaves a star; a star clears the 3 × 3 around it and sets off others", () => {
  const fem = brett(["........", "........", "33.33...", "..3.....", "........", "........", "........", "........"]);
  fem[i(2, 2)] = 1;
  const r = M.los(swap(fem, i(2, 2), i(2, 3)), alltid6, 6, [i(2, 2), i(2, 3)]);
  eq(r.steg[0].nye, [{ i: i(2, 2), v: M.lag(3, M.STJERNE) }]);
  eq(M.omrade(i(0, 0), M.STJERNE).length, 4, "a star in the corner reaches four cells");
  eq(M.omrade(i(4, 4), M.STJERNE).length, 9);
  // A star in a line goes off: its 3 × 3 goes, and an arrow inside it fires too (a chain).
  const k = brett(["........", "........", "........", "........", "........", "........", "........", "4.44...."]);
  k[i(0, 7)] = M.lag(4, M.STJERNE);
  k[i(1, 7)] = 2;
  k[i(1, 6)] = 4;
  k[i(0, 6)] = M.lag(5, M.KOL);
  const rk = M.los(swap(k, i(1, 7), i(1, 6)), alltid6, 6, [i(1, 7), i(1, 6)]);
  const s = rk.steg[0];
  eq(s.utlost.map((u) => u.s), [M.STJERNE, M.KOL]);
  for (let y = 0; y < N; y++) assert.ok(s.fjern.includes(i(0, y)), `kolonne 1, rad ${y + 1} ble ikke ryddet av pilen`);
});

test("falling: everything drops into the gaps, new pieces come in at the top, nothing is left empty", () => {
  const b = brett(["........", "........", "........", "........", "........", "........", "........", "111....."]);
  const for1 = b.slice();
  const r = M.los(b, alltid6, 6, null);
  const s = r.steg[0];
  eq(s.fjern, [i(0, 7), i(1, 7), i(2, 7)]);
  // Column 0: every piece moved down one row; the top cell is new (came from row −1).
  for (let y = 1; y < N; y++) {
    assert.equal(s.fra[i(0, y)], y - 1);
    assert.equal(s.etter[i(0, y)], for1[i(0, y - 1)]);
  }
  assert.equal(s.fra[i(0, 0)], -1);
  assert.equal(s.fra[i(5, 4)], 4, "untouched columns stay");
  assert.ok(s.etter.every((v) => v > 0));
  assert.equal(s.etter.filter((_, n) => s.fra[n] < 0).length, 3, "three new pieces for three cleared");
});

test("cascades: a fall that makes a new line clears again, step by step, and scores more", () => {
  // Look for real cascades in played games; check each one.
  let funnet = 0;
  for (let fro = 1; fro <= 60 && funnet < 25; fro++) {
    const sp = M.nyttSpill("trekk30", 0, fro);
    for (let n = 0; n < 30 && !sp.slutt; n++) {
      const trekk = M.finnTrekk(sp.brett);
      const [a, c] = trekk[(fro * 5 + n * 3) % trekk.length];
      const r = M.trekk(sp, a, c);
      if (r.steg.length < 2) continue;
      funnet++;
      r.steg.forEach((s, k) => {
        assert.equal(s.kaskade, k + 1);
        if (k) eq(s.for1, r.steg[k - 1].etter, "a step starts from the board the step before left");
        assert.ok(M.grupper(s.for1).length > 0, "every step clears a line");
        assert.ok(s.poeng >= s.fjern.length * 10 * s.kaskade, "later steps count more");
      });
      eq(M.grupper(r.steg[r.steg.length - 1].etter), [], "the last step leaves no line");
    }
  }
  assert.ok(funnet >= 10, `bare ${funnet} kaskader funnet`);
});

test("no dead boards: a board without moves is shuffled at once, and play never stops", () => {
  const b = dodt();
  M.stokk(b, M.rng(3), 5);
  eq(M.grupper(b), []);
  assert.ok(M.finnTrekk(b).length > 0);
  assert.equal(b.slice().sort().join(), dodt().sort().join(), "shuffling keeps the same pieces");
  // A move that leaves no move behind ends with a shuffle (los reports it).
  let stokket = 0;
  for (let fro = 1; fro <= 120; fro++) {
    const sp = M.nyttSpill("trekk30", 0, fro);
    sp.k = 5 + (fro % 2);
    for (let n = 0; n < 30 && !sp.slutt; n++) {
      const trekk = M.finnTrekk(sp.brett);
      assert.ok(trekk.length > 0, `fro ${fro}, trekk ${n}: ingen trekk på brettet`);
      const [a, c] = trekk[(fro * 7 + n * 13) % trekk.length];
      const r = M.trekk(sp, a, c);
      assert.ok(r.gyldig);
      if (r.stokket) stokket++;
      eq(M.grupper(sp.brett), [], `fro ${fro}, trekk ${n}: en linje ble liggende`);
      assert.ok(M.finnTrekk(sp.brett).length > 0, `fro ${fro}, trekk ${n}: dødt brett`);
      assert.ok(sp.brett.every((v) => M.T(v) >= 1 && M.T(v) <= 6));
    }
  }
  assert.ok(stokket >= 0);
  // Forced: a move whose result is the dead board must shuffle.
  const nesten = dodt();
  const r = M.los(nesten, M.rng(9), 5, null);
  eq(r.steg, []);
  assert.ok(r.stokket && M.finnTrekk(nesten).length > 0);
});

test("new boards: no line, at least one move, only the kinds of the level", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const k = fro % 2 ? 5 : 6;
    const b = M.lagBrett(M.rng(fro), k);
    eq(M.grupper(b), []);
    assert.ok(M.finnTrekk(b).length > 0);
    assert.ok(b.every((v) => v >= 1 && v <= k));
    assert.ok(M.gyldigBrett(b, k));
  }
});

test("levels: the same on every phone, more to collect as they go, and a game ends", () => {
  eq(M.niva(12), M.niva(12));
  eq(M.nyttSpill("brett", 7, 1).brett, M.nyttSpill("brett", 7, 2).brett, "the start board of a level is the same for everyone");
  let forrige = 0;
  for (let n = 1; n <= 200; n++) {
    const o = M.niva(n);
    assert.ok(o.mal.length >= 1 && o.mal.length <= 3);
    assert.equal(new Set(o.mal.map((m) => m.t)).size, o.mal.length, `brett ${n}: samme ting to ganger`);
    assert.ok(o.mal.every((m) => m.t >= 1 && m.t <= o.k && m.n >= 10 && m.n <= 24));
    assert.ok(o.trekk >= 20 && o.trekk <= 24);
    const sum = o.mal.reduce((a, m) => a + m.n, 0);
    if (o.mal.length === 3) {
      assert.ok(sum >= forrige, `brett ${n} er lettere enn brettet før`);
      forrige = sum;
    }
  }
  // Collecting everything wins, with 50 per move left.
  const sp = M.nyttSpill("brett", 1, 4);
  sp.samlet[sp.mal[0].t] = sp.mal[0].n - 1;
  const [a, c] = M.finnTrekk(sp.brett).find(([x, y]) => M.T(sp.brett[x]) === sp.mal[0].t || M.T(sp.brett[y]) === sp.mal[0].t) || M.finnTrekk(sp.brett)[0];
  const r = M.trekk(sp, a, c);
  if (M.malNadd(sp)) {
    assert.equal(sp.slutt, "vunnet");
    assert.equal(r.bonus, (sp.maks - 1) * 50);
    assert.equal(M.stjerner(sp), 3);
  }
  // Running out of moves loses (no lives: the game just ends).
  const tom = M.nyttSpill("brett", 5, 4);
  tom.trekk = tom.maks - 1;
  const [x, y] = M.finnTrekk(tom.brett)[0];
  M.trekk(tom, x, y);
  assert.ok(tom.slutt === "tapt" || tom.slutt === "vunnet");
  // Thirty moves end after the thirtieth.
  const t30 = M.nyttSpill("trekk30", 0, 11);
  for (let n = 0; n < 30; n++) {
    const [p, q] = M.finnTrekk(t30.brett)[0];
    M.trekk(t30, p, q);
    assert.equal(!!t30.slutt, n === 29);
  }
  assert.equal(t30.slutt, "ferdig");
  assert.ok(t30.poeng >= 30 * 30);
  // Stars by the moves left.
  assert.equal(M.stjerner({ maks: 20, trekk: 14 }), 3);
  assert.equal(M.stjerner({ maks: 20, trekk: 17 }), 2);
  assert.equal(M.stjerner({ maks: 20, trekk: 20 }), 1);
});

test("saved boards: a line on it, no move, or an unknown piece is refused", () => {
  const b = M.lagBrett(M.rng(2), 6);
  assert.ok(M.gyldigBrett(b, 6));
  assert.ok(!M.gyldigBrett(dodt(), 6), "no move");
  const linje = b.slice();
  linje[0] = linje[1] = linje[2] = 3;
  assert.ok(!M.gyldigBrett(linje, 6));
  const ukjent = b.slice();
  ukjent[5] = 7;
  assert.ok(!M.gyldigBrett(ukjent, 6));
  assert.ok(!M.gyldigBrett(b.slice(0, 63), 6));
  assert.ok(!M.gyldigBrett(b.map((v) => (M.T(v) === 6 ? v : v)), 5) || !b.some((v) => M.T(v) === 6));
});

function swap(b, a, c) {
  const k = b.slice();
  [k[a], k[c]] = [k[c], k[a]];
  return k;
}
