// Sebraen's engine (the pure part of rusj/spill/sebraen/spill.js): every puzzle it makes keeps the
// rules and has exactly one solution — proved here by a plain brute-force solver of its own, not
// the engine's — over more than a year of daily puzzles and many random seeds; a date always gives
// the same puzzle; the rule check and the hints are right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/sebraen/spill.js"));

// Is a full board right? No three alike in a line, half of each in every line, every sign kept.
function gyldig(n, v, tegn) {
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (v[i] !== 1 && v[i] !== 2) return false;
      if (c >= 2 && v[i] === v[i - 1] && v[i] === v[i - 2]) return false;
      if (r >= 2 && v[i] === v[i - n] && v[i] === v[i - 2 * n]) return false;
      if (c < n - 1 && tegn[i * 2] && (tegn[i * 2] === 1) !== (v[i] === v[i + 1])) return false;
      if (r < n - 1 && tegn[i * 2 + 1] && (tegn[i * 2 + 1] === 1) !== (v[i] === v[i + n])) return false;
    }
  for (let k = 0; k < n; k++) {
    let rad = 0;
    let kol = 0;
    for (let j = 0; j < n; j++) {
      rad += v[k * n + j] === 1;
      kol += v[j * n + k] === 1;
    }
    if (rad !== n / 2 || kol !== n / 2) return false;
  }
  return true;
}

// Brute force (independent of the engine): try both colours in every empty cell in reading order,
// and check every rule against all cells that are set (placed so far, and the givens further on).
function tellSelv(n, gitt, tegn, grense = 2) {
  const v = Int8Array.from(gitt);
  const halv = n / 2;
  const N = n * n;
  // Colour counts per row and column (index: line * 3 + colour).
  const rad = new Int8Array(n * 3);
  const kol = new Int8Array(n * 3);
  for (let i = 0; i < N; i++)
    if (v[i]) {
      rad[Math.floor(i / n) * 3 + v[i]]++;
      kol[(i % n) * 3 + v[i]]++;
    }
  const tre = (a, b, c, x) => v[a] === x && v[b] === x && v[c] === x;
  const ok = (i, x) => {
    const r = Math.floor(i / n);
    const c = i % n;
    if (rad[r * 3 + x] >= halv || kol[c * 3 + x] >= halv) return false;
    v[i] = x;
    let god = true;
    if (c >= 2 && tre(i - 2, i - 1, i, x)) god = false;
    else if (c >= 1 && c + 1 < n && tre(i - 1, i, i + 1, x)) god = false;
    else if (c + 2 < n && tre(i, i + 1, i + 2, x)) god = false;
    else if (r >= 2 && tre(i - 2 * n, i - n, i, x)) god = false;
    else if (r >= 1 && r + 1 < n && tre(i - n, i, i + n, x)) god = false;
    else if (r + 2 < n && tre(i, i + n, i + 2 * n, x)) god = false;
    else if (c >= 1 && tegn[(i - 1) * 2] && v[i - 1] && (tegn[(i - 1) * 2] === 1) !== (v[i - 1] === x)) god = false;
    else if (c < n - 1 && tegn[i * 2] && v[i + 1] && (tegn[i * 2] === 1) !== (v[i + 1] === x)) god = false;
    else if (r >= 1 && tegn[(i - n) * 2 + 1] && v[i - n] && (tegn[(i - n) * 2 + 1] === 1) !== (v[i - n] === x)) god = false;
    else if (r < n - 1 && tegn[i * 2 + 1] && v[i + n] && (tegn[i * 2 + 1] === 1) !== (v[i + n] === x)) god = false;
    v[i] = 0;
    return god;
  };
  // The givens must keep the rules among themselves.
  for (let i = 0; i < N; i++) {
    if (!gitt[i]) continue;
    const x = v[i];
    v[i] = 0;
    rad[Math.floor(i / n) * 3 + x]--;
    kol[(i % n) * 3 + x]--;
    const g = ok(i, x);
    v[i] = x;
    rad[Math.floor(i / n) * 3 + x]++;
    kol[(i % n) * 3 + x]++;
    if (!g) return 0;
  }
  const tomme = [];
  for (let i = 0; i < N; i++) if (!v[i]) tomme.push(i);
  let antall = 0;
  (function steg(k) {
    if (antall >= grense) return;
    if (k === tomme.length) {
      antall++;
      return;
    }
    const i = tomme[k];
    const r = Math.floor(i / n);
    const c = i % n;
    for (let x = 1; x <= 2; x++) {
      if (!ok(i, x)) continue;
      v[i] = x;
      rad[r * 3 + x]++;
      kol[c * 3 + x]++;
      steg(k + 1);
      rad[r * 3 + x]--;
      kol[c * 3 + x]--;
      v[i] = 0;
    }
  })(0);
  return antall;
}

function sjekkOppgave(p, hva) {
  const { n, gitt, tegn, losning } = p;
  assert.equal(gitt.length, n * n, hva);
  assert.equal(tegn.length, n * n * 2, hva);
  assert.ok(gyldig(n, losning, tegn), `${hva}: løsningen bryter reglene`);
  assert.ok(gitt.every((x, i) => !x || x === losning[i]), `${hva}: en gitt rute er ikke i løsningen`);
  for (let i = 0; i < n * n; i++) {
    if (i % n === n - 1) assert.equal(tegn[i * 2], 0, `${hva}: tegn ut av brettet`);
    if (i >= n * (n - 1)) assert.equal(tegn[i * 2 + 1], 0, `${hva}: tegn ut av brettet`);
  }
  assert.equal(tellSelv(n, gitt, tegn, 2), 1, `${hva}: ikke nøyaktig én løsning`);
  assert.ok(M.los(n, gitt, tegn, 3).lost, `${hva}: kan ikke løses uten å gjette`);
}

const datoFor = (nr) => new Date(nr * 86400000).toISOString().slice(0, 10);

test("the own solver and the engine's agree on known boards", () => {
  // An empty 4 × 4 has 90 solutions (two of each in every line), an empty 6 × 6 has 11 222.
  assert.equal(tellSelv(4, new Array(16).fill(0), new Array(32).fill(0), 1000), 90);
  assert.equal(M.tell(4, new Array(16).fill(0), new Array(32).fill(0), 1000), 90);
  assert.equal(tellSelv(6, new Array(36).fill(0), new Array(72).fill(0), 100000), 11222);
  assert.equal(M.tell(6, new Array(36).fill(0), new Array(72).fill(0), 100000), 11222);
  const p = M.lag(6, 777);
  assert.equal(tellSelv(6, p.gitt, p.tegn, 5), 1);
  assert.equal(M.tell(6, p.gitt, p.tegn, 5), 1);
  // Three givens in a row: no solution at all.
  const feil = new Array(36).fill(0);
  feil[0] = feil[1] = feil[2] = 1;
  assert.equal(tellSelv(6, feil, new Array(72).fill(0), 2), 0);
  assert.equal(M.tell(6, feil, new Array(72).fill(0), 2), 0);
});

test("every daily puzzle for more than a year has exactly one solution (own brute-force solver)", () => {
  const start = 20770; // 13 November 2026
  const storrelser = {};
  for (let nr = start; nr < start + 400; nr++) {
    const dato = datoFor(nr);
    const p = M.lagDaglig(dato, nr);
    assert.equal(p.n, M.dagligStorrelse(nr), dato);
    sjekkOppgave(p, dato);
    storrelser[p.n] = (storrelser[p.n] || 0) + 1;
  }
  assert.deepEqual(Object.keys(storrelser).map(Number).sort((a, b) => a - b), [6, 8, 10]);
});

test("random boards of every size have exactly one solution and need no guessing", () => {
  for (const n of M.STORRELSER)
    for (let s = 1; s <= 40; s++) {
      const fro = (s * 2654435761 + n) >>> 0;
      const p = M.lag(n, fro);
      assert.equal(p.n, n);
      sjekkOppgave(p, `${n}×${n}, frø ${fro}`);
    }
});

test("6 × 6 boards lean on signs, bigger ones on givens", () => {
  let tegn6 = 0;
  for (let s = 1; s <= 20; s++) tegn6 += M.lag(6, s).tegn.filter(Boolean).length;
  assert.ok(tegn6 / 20 >= 4, `6 × 6 har bare ${tegn6 / 20} tegn i snitt`);
});

test("the same date gives the same puzzle, and known days never change", () => {
  const a = M.lagDaglig("2026-11-13", 20770);
  assert.deepEqual(a, M.lagDaglig("2026-11-13", 20770));
  assert.notDeepEqual(M.lagDaglig("2026-11-14", 20771).gitt, a.gitt);
  assert.equal(`${a.n}:${a.gitt.join("")}:${a.tegn.join("")}`, PINNET_1);
  const c = M.lagDaglig("2027-01-03", 20821);
  assert.equal(`${c.n}:${c.gitt.join("")}:${c.tegn.join("")}`, PINNET_2);
  assert.equal(M.dagligStorrelse(20766), 6); // Monday
  assert.equal(M.dagligStorrelse(20770), 8); // Friday
  assert.equal(M.dagligStorrelse(20772), 10); // Sunday
});

test("puzzles are made fast enough for a phone", () => {
  for (const n of M.STORRELSER) {
    const t0 = performance.now();
    for (let s = 1; s <= 8; s++) M.lag(n, s * 13 + n);
    const ms = (performance.now() - t0) / 8;
    assert.ok(ms < 120, `${n}×${n}: ${ms.toFixed(1)} ms per brett`);
  }
});

test("the rule check finds three alike, too many of one colour and broken signs", () => {
  const n = 6;
  const tom = () => new Array(36).fill(0);
  const tegn = new Array(72).fill(0);
  let v = tom();
  v[0] = v[1] = v[2] = 1;
  let b = M.brudd(n, v, tegn);
  assert.deepEqual([0, 1, 2].map((i) => b.celler[i]), [1, 1, 1]);
  assert.deepEqual(b.grunn[1], ["tre"]);
  v = tom();
  for (const c of [0, 2, 3, 5]) v[c] = 2;
  b = M.brudd(n, v, tegn);
  assert.ok(b.grunn[0].includes("mange") && !b.celler[1]);
  v = tom();
  v[0] = 1;
  v[1] = 2;
  const t2 = tegn.slice();
  t2[0] = M.LIK; // «=» between cell 0 and cell 1
  b = M.brudd(n, v, t2);
  assert.ok(b.tegn.has(0) && b.celler[0] && b.celler[1] && b.grunn[0].includes("tegn"));
  v[1] = 1;
  assert.equal(M.brudd(n, v, t2).celler.reduce((s, x) => s + x, 0), 0);
});

test("hints: wrong cells first, then a cell that follows, until the board is solved", () => {
  const p = M.lag(8, 4242);
  const n = p.n;
  const v = p.gitt.slice();
  const feil = v.findIndex((x) => !x);
  v[feil] = 3 - p.losning[feil];
  let h = M.hint(n, p.gitt, p.tegn, p.losning, v);
  assert.equal(h.type, "feil");
  assert.deepEqual(Array.from(h.celler), [feil]);
  v[feil] = 0;
  const grunner = new Set();
  for (let k = 0; k < n * n && v.some((x) => !x); k++) {
    h = M.hint(n, p.gitt, p.tegn, p.losning, v);
    assert.equal(h.type, "celle");
    assert.equal(v[h.i], 0, "the hint is an empty cell");
    assert.equal(h.v, p.losning[h.i], "the hint is right");
    grunner.add(h.grunn);
    v[h.i] = h.v;
  }
  assert.deepEqual(v, p.losning);
  assert.equal(M.hint(n, p.gitt, p.tegn, p.losning, v), null);
  assert.ok(grunner.has("par") || grunner.has("klemme") || grunner.has("full"));
});

// Known days (rusj/DAGLIG.md: a day's puzzle never changes).
const PINNET_1 = "8:0000000002000002000002020001000000000000020200000000000000020000:01000001000000000000002000000000000000000000000000000000000000020000100000001000000000000000000002000000000000000010000000000000";
const PINNET_2 = "10:0000100000200200000000000000000100000000000000000000100000200000200000100001000002000000000200001022:00000000000000000000000000000000000000000001020000000000000000000020000000000000000000000000010000000200000000200020000100000001000000000000000000000002000000000000000000000000000000000000000000000000";
