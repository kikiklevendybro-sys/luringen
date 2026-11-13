// Stjernekikkeren's engine (the pure part of rusj/spill/stjernekikkeren/spill.js): every puzzle it
// makes is a fair sky (whole patches, one star in each) with exactly one solution — proved here by a
// plain brute-force solver of its own, not the engine's — over more than a year of daily puzzles
// and many random seeds; a date always gives the same puzzle; the rules and the hints are right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/stjernekikkeren/spill.js"));

// Brute force, row by row: a column and a patch not used yet, not touching the star above.
// Counts the solutions, up to `grense`.
function tellSelv(n, felt, grense = 2) {
  let antall = 0;
  const kol = [];
  const brukteK = new Set();
  const brukteF = new Set();
  (function steg(r) {
    if (antall >= grense) return;
    if (r === n) {
      antall++;
      return;
    }
    for (let c = 0; c < n; c++) {
      const g = felt[r * n + c];
      if (brukteK.has(c) || brukteF.has(g) || (r > 0 && Math.abs(kol[r - 1] - c) < 2)) continue;
      brukteK.add(c);
      brukteF.add(g);
      kol[r] = c;
      steg(r + 1);
      brukteK.delete(c);
      brukteF.delete(g);
    }
  })(0);
  return antall;
}

// A fair sky: n patches, each in one piece; the solution has one star per row, column and patch,
// and no two stars touch.
function sjekkHimmel(p, hva) {
  const { n, felt, losning } = p;
  assert.equal(felt.length, n * n, hva);
  assert.equal(losning.length, n, hva);
  assert.equal(new Set(losning).size, n, `${hva}: to stjerner i samme kolonne`);
  for (let r = 1; r < n; r++) assert.ok(Math.abs(losning[r] - losning[r - 1]) >= 2, `${hva}: stjernene rører hverandre`);
  assert.equal(new Set(losning.map((c, r) => felt[r * n + c])).size, n, `${hva}: to stjerner i samme felt`);
  for (let g = 0; g < n; g++) {
    const celler = [];
    for (let i = 0; i < n * n; i++) if (felt[i] === g) celler.push(i);
    assert.ok(celler.length > 0, `${hva}: felt ${g} er tomt`);
    const sett = new Set([celler[0]]);
    const ko = [celler[0]];
    while (ko.length) {
      const i = ko.pop();
      for (const j of M.sider(n, i)) if (felt[j] === g && !sett.has(j)) sett.add(j) && ko.push(j);
    }
    assert.equal(sett.size, celler.length, `${hva}: felt ${g} henger ikke sammen`);
  }
}

const datoFor = (nr) => new Date(nr * 86400000).toISOString().slice(0, 10);

test("the solver counts right on a known sky", () => {
  // 5 × 5: rows of patches, so many solutions; then the classic one-solution layout.
  const rader = Array.from({ length: 25 }, (_, i) => Math.floor(i / 5));
  assert.equal(M.tell(5, rader, 50), tellSelv(5, rader, 50));
  assert.ok(M.tell(5, rader, 50) > 1);
  const p = M.lag(6, 12345);
  assert.equal(M.tell(p.n, p.felt, 2), 1);
  assert.deepEqual(Array.from(M.finn(p.n, p.felt, 2)[0]), Array.from(p.losning));
});

test("every daily puzzle for more than a year has exactly one solution (own brute-force solver)", () => {
  const start = 20770; // 13 November 2026
  const storrelser = {};
  for (let nr = start; nr < start + 400; nr++) {
    const dato = datoFor(nr);
    const p = M.lagDaglig(dato, nr);
    assert.ok(p, `${dato}: ingen oppgave`);
    assert.equal(p.n, M.dagligStorrelse(nr), dato);
    sjekkHimmel(p, dato);
    assert.equal(tellSelv(p.n, p.felt, 2), 1, `${dato}: ikke nøyaktig én løsning`);
    assert.ok(M.los(p.n, p.felt, 5).lost, `${dato}: kan ikke løses uten å gjette`);
    storrelser[p.n] = (storrelser[p.n] || 0) + 1;
  }
  assert.deepEqual(Object.keys(storrelser).map(Number).sort((a, b) => a - b), [6, 7, 8, 9]);
});

test("random boards of every size have exactly one solution and need no guessing", () => {
  for (const n of M.STORRELSER) {
    for (let s = 1; s <= 40; s++) {
      const fro = (s * 2654435761 + n) >>> 0;
      const p = M.lag(n, fro);
      const hva = `${n}×${n}, frø ${fro}`;
      assert.ok(p, hva);
      assert.equal(p.n, n, hva);
      sjekkHimmel(p, hva);
      assert.equal(tellSelv(n, p.felt, 2), 1, `${hva}: ikke nøyaktig én løsning`);
      const l = M.los(n, p.felt, M.NIVAER[n].maks);
      assert.ok(l.lost, `${hva}: kan ikke løses uten å gjette`);
      assert.equal(l.grad, p.grad, hva);
    }
  }
});

test("the same date gives the same puzzle, and known days never change", () => {
  const a = M.lagDaglig("2026-11-13", 20770);
  const b = M.lagDaglig("2026-11-13", 20770);
  assert.deepEqual(a, b);
  assert.notDeepEqual(M.lagDaglig("2026-11-14", 20771).felt, a.felt);
  // Pinned: a daily puzzle may never change once it has been played.
  assert.equal(`${a.n}:${a.felt.join("")}:${a.losning.join("")}`, PINNET_1);
  const c = M.lagDaglig("2027-01-03", 20821);
  assert.equal(`${c.n}:${c.felt.join("")}:${c.losning.join("")}`, PINNET_2);
  // Small on Monday, big at the weekend.
  assert.equal(M.dagligStorrelse(20769 - 3), 6); // Monday 9 November 2026
  assert.equal(M.dagligStorrelse(20772), 9); // Sunday 15 November 2026
});

test("puzzles are made fast enough for a phone", () => {
  for (const n of M.STORRELSER) {
    const t0 = performance.now();
    for (let s = 1; s <= 10; s++) M.lag(n, s * 7 + n);
    const ms = (performance.now() - t0) / 10;
    assert.ok(ms < 150, `${n}×${n}: ${ms.toFixed(1)} ms per brett`);
  }
});

test("rules on the board: two stars in a row, a column, a patch or touching are conflicts", () => {
  const n = 6;
  const felt = Array.from({ length: 36 }, (_, i) => (i % 6 < 3 ? 0 : 1) + (i >= 18 ? 2 : 0)).map((g, i) => (i === 35 ? 4 : i === 34 ? 5 : g));
  const m = (stjerner) => {
    const a = new Uint8Array(36);
    for (const i of stjerner) a[i] = 2;
    return a;
  };
  const k = (stjerner) => M.konflikter(n, felt, m(stjerner));
  assert.deepEqual(Array.from(k([0, 4]).ut).reduce((s, v, i) => (v ? [...s, i] : s), []), [0, 4]);
  assert.deepEqual(k([0, 4]).grunn[0], ["rad"]);
  assert.deepEqual(k([0, 30]).grunn[0], ["kolonne"]);
  assert.deepEqual(k([0, 14]).grunn[0], ["felt"]);
  assert.deepEqual(k([0, 7]).grunn[0], ["nabo"]);
  assert.equal(k([0, 15]).ut.reduce((s, v) => s + v, 0), 0, "no conflict between (0,0) and (2,3)");
  // A dot is never a conflict.
  const prikker = new Uint8Array(36).fill(1);
  assert.equal(M.konflikter(n, felt, prikker).ut.reduce((s, v) => s + v, 0), 0);
});

test("hints: wrong stars first, then dots on a star's cell, then a star that follows", () => {
  const p = M.lag(8, 99);
  const n = p.n;
  const rett = p.losning.map((c, r) => r * n + c);
  const m = new Uint8Array(n * n);
  // A wrong star
  const feil = [...Array(n * n).keys()].find((i) => !rett.includes(i));
  m[feil] = 2;
  let h = M.hint(n, p.felt, p.losning, m);
  assert.equal(h.type, "feil");
  assert.deepEqual(Array.from(h.celler), [feil]);
  m[feil] = 0;
  // A dot where a star belongs
  m[rett[3]] = 1;
  h = M.hint(n, p.felt, p.losning, m);
  assert.equal(h.type, "prikk");
  assert.deepEqual(Array.from(h.celler), [rett[3]]);
  m[rett[3]] = 0;
  // From an empty board, hint after hint solves it, and every hint is a star of the solution.
  for (let k = 0; k < n; k++) {
    h = M.hint(n, p.felt, p.losning, m);
    assert.equal(h.type, "stjerne");
    assert.ok(rett.includes(h.i), "the hint is a star of the solution");
    assert.notEqual(m[h.i], 2, "the hint is a new star");
    assert.ok(["rad", "kolonne", "felt", "logikk", "vanskelig"].includes(h.grunn));
    m[h.i] = 2;
  }
  assert.equal(M.hint(n, p.felt, p.losning, m), null, "nothing left to hint on a solved board");
});

// Known days (rusj/DAGLIG.md: a day's puzzle never changes).
const PINNET_1 = "8:0011111101111211011612310666633346666663555677335556673355666773:13570246";
const PINNET_2 = "9:222000111200011133222433333244435355222445555624455557688877577887777777887777777:352647081";
