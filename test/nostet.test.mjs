// Nøstet's engine (the pure part of rusj/spill/nostet/spill.js): every puzzle it makes has a path
// through every cell that keeps the numbers in order and never crosses a wall, and that path is the
// only one — proved here by a depth-first search of its own, not the engine's — over more than a
// year of daily puzzles and many random seeds; a date always gives the same puzzle; the move rules
// and the hints are right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/nostet/spill.js"));

// May the thread step from a to b (side by side, no wall between)?
function apen(n, vegger, a, b) {
  const ra = Math.floor(a / n);
  const rb = Math.floor(b / n);
  if (b === a + 1 && ra === rb) return !vegger[a * 2];
  if (b === a - 1 && ra === rb) return !vegger[b * 2];
  if (b === a + n) return !vegger[a * 2 + 1];
  if (b === a - n) return !vegger[b * 2 + 1];
  return false;
}

// Depth-first search from the 1: every step to an open neighbour, numbers only in turn, the last
// number only as the very last cell; a branch stops when the cells left no longer hang together
// with the head. Counts the paths, up to `grense`.
function tellSelv(n, tall, vegger, grense = 2) {
  const N = n * n;
  const maks = Math.max(...tall);
  const start = tall.indexOf(1);
  const nab = [];
  for (let i = 0; i < N; i++) nab.push([i - n, i + n, i - 1, i + 1].filter((j) => j >= 0 && j < N && apen(n, vegger, i, j)));
  const med = new Uint8Array(N);
  med[start] = 1;
  let antall = 0;
  const henger = (hode, igjen) => {
    const sett = new Uint8Array(N);
    const ko = [hode];
    sett[hode] = 1;
    let funnet = 0;
    while (ko.length) {
      const i = ko.shift();
      for (const j of nab[i])
        if (!med[j] && !sett[j]) {
          sett[j] = 1;
          funnet++;
          ko.push(j);
        }
    }
    return funnet === igjen;
  };
  (function steg(hode, lengde, neste) {
    if (antall >= grense) return;
    if (lengde === N) {
      if (tall[hode] === maks) antall++;
      return;
    }
    if (!henger(hode, N - lengde)) return;
    for (const j of nab[hode]) {
      if (med[j]) continue;
      if (tall[j] && tall[j] !== neste) continue;
      if (tall[j] === maks && lengde !== N - 1) continue;
      med[j] = 1;
      steg(j, lengde + 1, tall[j] ? neste + 1 : neste);
      med[j] = 0;
    }
  })(start, 1, 2);
  med[start] = 0;
  return antall;
}

function sjekkOppgave(p, hva) {
  const { n, tall, vegger, losning } = p;
  const N = n * n;
  assert.equal(losning.length, N, hva);
  assert.equal(new Set(losning).size, N, `${hva}: løsningen går ikke gjennom hver rute én gang`);
  for (let k = 1; k < N; k++) assert.ok(apen(n, vegger, losning[k - 1], losning[k]), `${hva}: løsningen går gjennom en vegg eller hopper`);
  const iRekke = losning.map((i) => tall[i]).filter(Boolean);
  assert.deepEqual(iRekke, Array.from({ length: iRekke.length }, (_, k) => k + 1), `${hva}: tallene står ikke i rekkefølge langs løsningen`);
  assert.equal(tall[losning[0]], 1, hva);
  assert.equal(tall[losning[N - 1]], iRekke.length, `${hva}: løsningen slutter ikke på det høyeste tallet`);
  assert.equal(tellSelv(n, tall, vegger, 2), 1, `${hva}: ikke nøyaktig én løsning`);
  const nab = M.finn(n, tall, vegger, 2);
  assert.equal(nab.length, 1, `${hva}: motoren er uenig`);
  assert.deepEqual(Array.from(nab[0]), Array.from(losning), hva);
}

const datoFor = (nr) => new Date(nr * 86400000).toISOString().slice(0, 10);

test("the own search and the engine's agree on known boards", () => {
  // A 3 × 3 with only the start in a corner and the end in the middle: how many snakes?
  const tall = [1, 0, 0, 0, 2, 0, 0, 0, 0];
  const ingen = new Array(18).fill(0);
  assert.equal(tellSelv(3, tall, ingen, 100), M.tell(3, tall, ingen, 100));
  assert.ok(tellSelv(3, tall, ingen, 100) >= 2);
  // 1 in a corner, 2 in the far corner of a 4 × 4: the counts agree too.
  const t4 = new Array(16).fill(0);
  t4[0] = 1;
  t4[15] = 2;
  assert.equal(tellSelv(4, t4, new Array(32).fill(0), 1000), M.tell(4, t4, new Array(32).fill(0), 1000));
  // A wall that cuts a corner cell off: no path at all.
  const v = new Array(32).fill(0);
  v[0 * 2] = 1; // right of cell 0
  v[0 * 2 + 1] = 1; // below cell 0
  const t5 = new Array(16).fill(0);
  t5[5] = 1;
  t5[10] = 2;
  assert.equal(tellSelv(4, t5, v, 2), 0);
  assert.equal(M.tell(4, t5, v, 2), 0);
});

test("every daily puzzle for more than a year has exactly one solution (own search)", () => {
  const start = 20770; // 13 November 2026
  const storrelser = {};
  for (let nr = start; nr < start + 400; nr++) {
    const dato = datoFor(nr);
    const p = M.lagDaglig(dato, nr);
    assert.equal(p.n, M.dagligStorrelse(nr), dato);
    sjekkOppgave(p, dato);
    storrelser[p.n] = (storrelser[p.n] || 0) + 1;
  }
  assert.deepEqual(Object.keys(storrelser).map(Number).sort((a, b) => a - b), [5, 6, 7]);
});

test("random boards of every size have exactly one solution", () => {
  for (const n of M.STORRELSER)
    for (let s = 1; s <= 30; s++) {
      const fro = (s * 2654435761 + n) >>> 0;
      const p = M.lag(n, fro);
      assert.equal(p.n, n);
      sjekkOppgave(p, `${n}×${n}, frø ${fro}`);
    }
});

test("the same date gives the same puzzle, and known days never change", () => {
  const a = M.lagDaglig("2026-11-13", 20770);
  assert.deepEqual(a, M.lagDaglig("2026-11-13", 20770));
  assert.notDeepEqual(M.lagDaglig("2026-11-14", 20771).tall, a.tall);
  assert.equal(`${a.n}:${a.tall.join(",")}:${a.vegger.join("")}`, PINNET_1);
  const c = M.lagDaglig("2027-01-03", 20821);
  assert.equal(`${c.n}:${c.tall.join(",")}:${c.vegger.join("")}`, PINNET_2);
  assert.equal(M.dagligStorrelse(20766), 5); // Monday
  assert.equal(M.dagligStorrelse(20772), 7); // Sunday
});

test("puzzles are made fast enough for a phone", () => {
  for (const n of M.STORRELSER) {
    const t0 = performance.now();
    for (let s = 1; s <= 8; s++) M.lag(n, s * 31 + n);
    const ms = (performance.now() - t0) / 8;
    assert.ok(ms < 150, `${n}×${n}: ${ms.toFixed(1)} ms per brett`);
  }
});

test("move rules: next door only, no walls, no crossing, numbers in turn, the last number last", () => {
  // 3 × 3: 1 top left, 2 top right, 3 bottom right; a wall below the middle of the top row.
  const n = 3;
  const tall = [1, 0, 2, 0, 0, 0, 0, 0, 3];
  const vegger = new Array(18).fill(0);
  vegger[1 * 2 + 1] = 1;
  assert.equal(M.kanGaa(n, tall, vegger, [0], 1), null);
  assert.equal(M.kanGaa(n, tall, vegger, [0], 4).hvorfor, "avstand");
  assert.equal(M.kanGaa(n, tall, vegger, [0, 1], 4).hvorfor, "vegg");
  assert.equal(M.kanGaa(n, tall, vegger, [0, 3, 4, 1], 0).hvorfor, "krysser");
  assert.equal(M.kanGaa(n, tall, vegger, [0, 1, 2, 5], 8).hvorfor, "slutt");
  const tall2 = [1, 3, 0, 2, 0, 0, 0, 0, 4];
  const r = M.kanGaa(n, tall2, new Array(18).fill(0), [0], 1);
  assert.equal(r.hvorfor, "rekkefolge");
  assert.equal(r.neste, 2);
  assert.equal(M.nesteTall(tall2, [0, 3]), 3);
  assert.ok(M.ferdig(n, tall, [0, 3, 6, 7, 4, 1, 2, 5, 8]));
  assert.ok(!M.ferdig(n, tall, [0, 3, 6, 7, 4, 1, 2, 5]));
});

test("hints: cut back to where the thread went wrong, then on to the next number", () => {
  const p = M.lag(6, 2024);
  const L = p.losning;
  // From the start: on to the first number after at least two steps.
  let h = M.hint(p.n, p.tall, L, [L[0]]);
  assert.equal(h.kutt, 0);
  assert.deepEqual(Array.from(h.sti), L.slice(0, h.sti.length));
  assert.ok(p.tall[h.sti[h.sti.length - 1]] > 1 && h.sti.length >= 3);
  // A wrong turn after 4 right cells: cut back to those 4.
  const feil = L.slice(0, 4);
  const avvik = M.naboer(p.n, p.vegger, L[3]).find((j) => j !== L[4] && !feil.includes(j));
  if (avvik != null) {
    h = M.hint(p.n, p.tall, L, [...feil, avvik]);
    assert.equal(h.kutt, 1);
    assert.deepEqual(Array.from(h.sti), L.slice(0, h.sti.length));
  }
  // Hint after hint ends with the whole path.
  let sti = [L[0]];
  for (let k = 0; k < L.length && sti.length < L.length; k++) sti = Array.from(M.hint(p.n, p.tall, L, sti).sti);
  assert.deepEqual(sti, L);
});

// Known days (rusj/DAGLIG.md: a day's puzzle never changes).
const PINNET_1 = "7:5,0,0,4,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,3,0,0,1,0,0,0,0,7,0,0,0,0,0,0,0,0,0,2,0,0,9,0,0,0,0,0,0,0,8:00000000000000000000000000000000000010000000000000000000000000000000000000000000010000000000000000";
const PINNET_2 = "7:0,0,0,0,0,0,4,0,5,0,0,0,0,0,0,0,0,6,0,3,0,0,0,8,1,0,0,0,0,0,0,7,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,2,0:00000100000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000";
