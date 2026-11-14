// Blekkspruten's engine (the pure part of rusj/spill/blekkspruten/spill.js): every hand-made picture
// and every generated puzzle – more than a year of daily ones and many random seeds – has exactly
// one solution, proved by a search of its own (every row pattern that fits its clue, rows tried top
// to bottom while each column can still be finished), not by the engine's line logic; a date
// always gives the same puzzle; the line logic, the win and the hints are right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/blekkspruten/spill.js"));

const runs = (linje) => {
  const ut = [];
  let n = 0;
  for (const x of linje) {
    if (x) n++;
    else if (n) {
      ut.push(n);
      n = 0;
    }
  }
  if (n) ut.push(n);
  return ut;
};

// Every way to lay the runs in a line of n cells (arrays of 0/1).
function monstre(ledd, n) {
  const ut = [];
  (function legg(i, j, linje) {
    if (j === ledd.length) {
      ut.push(linje.concat(new Array(n - linje.length).fill(0)));
      return;
    }
    const rest = ledd.slice(j).reduce((a, b) => a + b, 0) + (ledd.length - j - 1);
    for (let s = i; s + rest <= n; s++) {
      const ny = linje.concat(new Array(s - linje.length).fill(0), new Array(ledd[j]).fill(1));
      if (j < ledd.length - 1) ny.push(0);
      legg(ny.length, j + 1, ny);
    }
  })(0, 0, []);
  return ut;
}

// Counts the pictures that fit all clues (up to `grense`): rows top to bottom, and a column
// prefix is kept only while it can still become that column's clue.
function tellSelv(R, C, rader, kolonner, grense = 2) {
  const valg = rader.map((h) => monstre(h, C));
  const kol = Array.from({ length: C }, () => []);
  let antall = 0;
  const kanBli = (c) => {
    const pre = kol[c];
    const h = kolonner[c];
    // The runs so far: all but the last must match exactly; the open one must not be too long.
    const r = runs(pre);
    const apen = pre.length && pre[pre.length - 1] === 1;
    const lukket = apen ? r.slice(0, -1) : r;
    if (lukket.length > h.length) return false;
    for (let k = 0; k < lukket.length; k++) if (lukket[k] !== h[k]) return false;
    if (apen) {
      const k = r.length - 1;
      if (k >= h.length || r[k] > h[k]) return false;
    }
    // Room left for the rest.
    const brukt = apen ? r.length - 1 : r.length;
    const igjen = h.slice(brukt);
    const trengs = igjen.reduce((a, b) => a + b, 0) + Math.max(0, igjen.length - 1) - (apen ? r[r.length - 1] : 0);
    return trengs <= R - pre.length;
  };
  (function rad(r) {
    if (antall >= grense) return;
    if (r === R) {
      for (let c = 0; c < C; c++) if (runs(kol[c]).join() !== kolonner[c].join()) return;
      antall++;
      return;
    }
    for (const m of valg[r]) {
      let ok = true;
      for (let c = 0; c < C; c++) {
        kol[c].push(m[c]);
        if (ok && !kanBli(c)) ok = false;
      }
      if (ok) rad(r + 1);
      for (let c = 0; c < C; c++) kol[c].pop();
      if (antall >= grense) return;
    }
  })(0);
  return antall;
}

function sjekk(R, C, celler, hva) {
  assert.equal(celler.length, R * C, hva);
  const { rader, kolonner } = M.ledetrader(R, C, celler);
  assert.equal(tellSelv(R, C, rader, kolonner), 1, `${hva}: ikke nøyaktig én løsning`);
  assert.ok(M.rettferdig(R, C, celler), `${hva}: linjelogikk løser det ikke alene`);
}

const dato = (nr) => new Date(nr * 86400000).toISOString().slice(0, 10);

test("monstre and tellSelv agree with a brute force on small boards", () => {
  assert.deepEqual(monstre([2, 1], 5).map((m) => m.join("")).sort(), ["11010", "11001", "01101"].sort());
  // A 2 × 2 checker has two solutions; the brute force count says the same.
  assert.equal(tellSelv(2, 2, [[1], [1]], [[1], [1]]), 2);
  assert.equal(tellSelv(2, 2, [[2], [1]], [[2], [1]]), 1);
});

test("the line logic finds what every placement agrees on", () => {
  assert.deepEqual(M.linjeLos([8], new Array(10).fill(0)), [0, 0, 1, 1, 1, 1, 1, 1, 0, 0]);
  assert.deepEqual(M.linjeLos([], [0, 0, 0]), [2, 2, 2]);
  assert.deepEqual(M.linjeLos([3], [0, 1, 0, 0, 0]), [0, 1, 1, 0, 2]);
  assert.deepEqual(M.linjeLos([1, 1], [0, 0, 0]), [1, 2, 1]);
  assert.equal(M.linjeLos([3], [0, 2, 0, 0]), null, "no room for 3");
  assert.equal(M.linjeLos([1], [1, 2, 1]), null, "two inked cells for one run");
  assert.deepEqual(M.hint([1, 1, 0, 1, 0, 0, 1, 1, 1]), [2, 1, 3]);
  assert.deepEqual(M.hint([0, 0]), []);
});

test("every hand-made picture has exactly one solution, found by logic alone", () => {
  assert.ok(M.BILDE_IDER.length >= 25);
  for (const id of M.BILDE_IDER) {
    const b = M.bilde(id);
    assert.ok([5, 10, 12].includes(b.R) && b.R === b.C, `${id}: størrelse`);
    sjekk(b.R, b.C, b.celler, id);
  }
});

test("random puzzles: every size, many seeds, exactly one solution", () => {
  for (const n of M.STORRELSER)
    for (let fro = 1; fro <= 60; fro++) {
      const o = M.lag(n, fro * 7919);
      assert.equal(o.R, n);
      const fylt = o.celler.reduce((a, b) => a + b, 0) / (n * n);
      assert.ok(fylt >= 0.38 && fylt <= 0.72, `${n}/${fro}: ${fylt}`);
      sjekk(n, n, o.celler, `${n} × ${n}, frø ${fro}`);
    }
});

test("a year and a day of daily puzzles: one solution each, the size of the weekday", () => {
  const start = 20770; // 13 November 2026, a Friday
  const sett = new Set();
  for (let nr = start; nr < start + 400; nr++) {
    const d = dato(nr);
    const o = M.lagDaglig(d, nr);
    const ukedag = new Date(d + "T12:00:00Z").getUTCDay();
    assert.equal(o.R, M.DAGLIG_UKE[ukedag], d);
    assert.equal(o.R, M.dagligStorrelse(nr));
    sjekk(o.R, o.C, o.celler, d);
    sett.add(o.celler.join(""));
  }
  assert.equal(sett.size, 400, "two days got the same puzzle");
  // Monday is small, the weekend is big.
  assert.equal(M.dagligStorrelse(20773), 8); // Monday 16 November 2026
  assert.equal(M.dagligStorrelse(20771), 12); // Saturday
});

test("a date always gives the same puzzle (pinned)", () => {
  const a = M.lagDaglig("2026-11-13", 20770);
  const b = M.lagDaglig("2026-11-13", 20770);
  assert.deepEqual(a, b);
  assert.equal(a.celler.join(""), "1100000011110000001101000000101000110001111011011111111111111110110111001000010001111111101111111111");
});

test("solved means the inked cells are the picture's; crosses don't count", () => {
  const b = M.bilde("pil");
  const rute = b.celler.map((x) => (x ? 1 : 2));
  assert.ok(M.lost(b.celler, rute));
  assert.ok(M.lost(b.celler, b.celler.slice()));
  const feil = b.celler.slice();
  feil[0] = 1;
  assert.ok(!M.lost(b.celler, feil));
  assert.ok(M.linjeFerdig([2, 1], [1, 1, 2, 1, 0]));
  assert.ok(!M.linjeFerdig([2, 1], [1, 1, 1, 0, 0]));
  assert.ok(M.linjeFerdig([], [2, 0, 0]));
});

test("hints: a wrong mark first, else a line that logic can fill, always progress", () => {
  const b = M.bilde("hjerte");
  const N = b.R * b.C;
  // A wrong ink and a wrong cross are pointed out.
  const r1 = new Array(N).fill(0);
  r1[0] = 1; // the top row is empty in the heart
  assert.deepEqual(M.hjelp(b.R, b.C, b.celler, r1), { feil: 0 });
  const r2 = new Array(N).fill(0);
  r2[b.celler.indexOf(1)] = 2;
  assert.deepEqual(M.hjelp(b.R, b.C, b.celler, r2), { feil: b.celler.indexOf(1) });
  // From an empty board, hints alone solve the picture, each one right and each one new.
  for (const id of M.BILDE_IDER) {
    const p = M.bilde(id);
    const rute = new Array(p.R * p.C).fill(0);
    for (let k = 0; k < 400 && !M.lost(p.celler, rute); k++) {
      const h = M.hjelp(p.R, p.C, p.celler, rute);
      assert.ok(h && h.celler && h.celler.length, `${id}: hintet ga ingenting`);
      for (const [i, v] of h.celler) {
        assert.equal(rute[i], 0, `${id}: hintet endret en kjent rute`);
        assert.equal(v === 1, p.celler[i] === 1, `${id}: hintet tok feil`);
        rute[i] = v;
      }
    }
    assert.ok(M.lost(p.celler, rute), `${id}: hintene løste ikke bildet`);
  }
});
