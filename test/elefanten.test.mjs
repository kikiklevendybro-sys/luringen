// Elefanten: the elephant's brain (what it turns, what it remembers), the stars, the board sizes
// and the tie-break helpers. Loads rusj/spill/elefanten/spill.js without the kit (node:vm): the
// file then only exposes its rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/elefanten/spill.js"), "utf8"), kontekst);
const { STORRELSER, STORRELSER_TO, STYRKER, stjernerFor, ledere, omkampPar, Hjerne, erJul } = kontekst.window.Elefanten;
const TEMAER = JSON.parse(readFileSync(join(ROT, "rusj/spill/elefanten/data/temaer.json"), "utf8"));

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function stokk(liste, r) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const brett = (par, r) => stokk([...Array(par).keys(), ...Array(par).keys()], r);

// A whole game between two sides that both play with the elephant's brain: side 0 remembers with
// the chance p0, side 1 with p1. Returns the pairs of each side and what was turned.
function spill(par, p0, p1, fro) {
  const r = rng(fro);
  const kort = brett(par, r);
  const funnet = kort.map(() => -1);
  let husk = [[], []];
  const p = [p0, p1];
  const poeng = [0, 0];
  const logg = [];
  let tur = 0;
  for (let trekk = 0; trekk < 2000 && funnet.some((f) => f < 0); trekk++) {
    const a = Hjerne.velg(kort, funnet, husk[tur], -1, r);
    const kjentePar = Hjerne.kjennerPar(kort, funnet, husk[tur]);
    const b = Hjerne.velg(kort, funnet, husk[tur], a, r);
    logg.push({ tur, a, b, kjentePar, husket: husk[tur].slice(), par: kort[a] === kort[b] });
    assert.ok(a !== b && funnet[a] < 0 && funnet[b] < 0, "a card that is found, or the same card twice");
    for (const side of [0, 1]) for (const i of [a, b]) Hjerne.se(husk[side], i, p[side], r);
    if (kort[a] === kort[b]) {
      funnet[a] = funnet[b] = tur;
      poeng[tur] += 1;
      husk = husk.map((h) => Hjerne.rydd(h, funnet));
    } else tur = 1 - tur;
  }
  assert.ok(funnet.every((f) => f >= 0), "the game never ended");
  return { poeng, logg, kort };
}

test("the three strengths: the calf remembers 35 %, the elephant 65 %, the old elephant everything", () => {
  assert.deepEqual(Array.from(STYRKER, (s) => [s.id, s.husk]), [["unge", 0.35], ["voksen", 0.65], ["gammel", 1]]);
  for (const s of STYRKER) {
    const r = rng(7);
    let husket = 0;
    for (let n = 0; n < 4000; n++) {
      const husk = [];
      Hjerne.se(husk, 3, s.husk, r);
      husket += husk.length;
    }
    assert.ok(Math.abs(husket / 4000 - s.husk) < 0.03, `${s.id} remembered ${husket / 4000}`);
  }
  // A card it already remembers is not stored twice; every sighting is a new chance.
  const husk = [5];
  Hjerne.se(husk, 5, 1, rng(1));
  assert.deepEqual(husk, [5]);
});

test("a pair the elephant remembers both cards of is always taken, first of all", () => {
  const kort = [0, 1, 2, 0, 1, 2, 3, 3];
  const funnet = kort.map(() => -1);
  for (let fro = 1; fro <= 50; fro++) {
    const r = rng(fro);
    const a = Hjerne.velg(kort, funnet, [1, 6, 4], -1, r);
    assert.ok(a === 1 || a === 4, `first card ${a}`);
    assert.equal(Hjerne.velg(kort, funnet, [1, 6, 4], a, r), a === 1 ? 4 : 1);
  }
  assert.equal(Hjerne.kjennerPar(kort, funnet, [1, 6, 4]), true);
  assert.equal(Hjerne.kjennerPar(kort, funnet, [1, 6]), false);
});

test("without a known pair it turns a card it has not seen – and takes the mate if it remembers it", () => {
  const kort = [0, 1, 2, 0, 1, 2];
  const funnet = kort.map(() => -1);
  for (let fro = 1; fro <= 80; fro++) {
    const r = rng(fro);
    const husk = [0, 1]; // remembers where a 0 and a 1 are
    const a = Hjerne.velg(kort, funnet, husk, -1, r);
    assert.ok(![0, 1].includes(a), "turned a card it already knows, with no pair to take");
    const b = Hjerne.velg(kort, funnet, husk, a, r);
    if (kort[a] === 0) assert.equal(b, 0);
    else if (kort[a] === 1) assert.equal(b, 1);
    else assert.ok(b !== a && ![0, 1].includes(b), "turned a card it knows is not the mate");
  }
});

test("found cards are forgotten and never turned again; the last two cards are always a pair", () => {
  const kort = [0, 1, 0, 1];
  const funnet = [0, -1, 0, -1];
  assert.deepEqual(Array.from(Hjerne.rydd([0, 1, 2], funnet)), [1]);
  for (let fro = 1; fro <= 20; fro++) {
    const r = rng(fro);
    const a = Hjerne.velg(kort, funnet, [], -1, r);
    const b = Hjerne.velg(kort, funnet, [], a, r);
    assert.deepEqual([a, b].sort(), [1, 3]);
  }
});

test("the old elephant never misses a pair it has seen; whole games end, and memory wins games", () => {
  const seire = { gammel: 0, unge: 0 };
  let parGammel = 0;
  let parUnge = 0;
  for (let fro = 1; fro <= 300; fro++) {
    const par = [7, 9, 11, 13, 15][fro % 5];
    const { poeng, logg } = spill(par, 1, 0.35, fro);
    assert.equal(poeng[0] + poeng[1], par);
    // Side 0 forgets nothing: whenever it knew a whole pair, it took one; and it never turned
    // two cards it remembered as different.
    for (const t of logg.filter((x) => x.tur === 0)) {
      if (t.kjentePar) assert.ok(t.par, `seed ${fro}: the old elephant knew a pair and missed`);
      if (!t.par) assert.ok(!(t.husket.includes(t.a) && t.husket.includes(t.b)), `seed ${fro}: turned two cards it knew were different`);
    }
    if (poeng[0] > poeng[1]) seire.gammel += 1;
    else seire.unge += 1; // (an odd number of pairs: never level)
    parGammel += poeng[0];
    parUnge += poeng[1];
  }
  assert.ok(seire.gammel > seire.unge * 2, `the old elephant won ${seire.gammel} of 300 against the calf`);
  assert.ok(parGammel > parUnge, "more memory gave fewer pairs");
  // The elephant in the middle sits between the two.
  let midt = 0;
  for (let fro = 1; fro <= 300; fro++) if (spill(9, 0.65, 0.35, fro).poeng[0] > 4) midt += 1;
  assert.ok(midt > 150 && midt < seire.gammel + 40, `the elephant won ${midt} of 300 against the calf`);
});

test("stars alone: three within 1.9 moves per pair, two within 2.6", () => {
  assert.equal(stjernerFor(15, 8), 3); // 1.875
  assert.equal(stjernerFor(16, 8), 2); // 2.0
  assert.equal(stjernerFor(20, 8), 2); // 2.5
  assert.equal(stjernerFor(21, 8), 1); // 2.625
  assert.equal(stjernerFor(8, 8), 3);
  assert.equal(stjernerFor(28, 15), 3); // 1.87 on the biggest board
  assert.equal(stjernerFor(29, 15), 2);
});

test("two sides always get an odd number of pairs; the tie-break boards can always decide", () => {
  assert.equal(STORRELSER.length, STORRELSER_TO.length);
  for (const n of STORRELSER) assert.equal(n % 2, 0);
  for (const n of STORRELSER_TO) assert.equal((n / 2) % 2, 1, `${n} cards is an even number of pairs`);
  STORRELSER_TO.forEach((n, i) => assert.ok(n >= STORRELSER[i] && n - STORRELSER[i] <= 2, "the two-sided board is not the size next to the ordinary one"));
  assert.equal(omkampPar(2), 3);
  assert.equal(omkampPar(3), 5);
  assert.equal(omkampPar(4), 5);
  // Three or four cannot all end level on five pairs, and two cannot end level on three.
  assert.ok(5 % 3 !== 0 && 5 % 4 !== 0 && 3 % 2 !== 0);
  assert.deepEqual(Array.from(ledere([3, 3, 2])), [0, 1]);
  assert.deepEqual(Array.from(ledere([4, 2, 3])), [0]);
  assert.deepEqual(Array.from(ledere([5, 6, 6, 1], [1, 2])), [1, 2]);
});

test("the pictures: every theme has enough for the biggest board, and the Christmas set is in season from 1 November to 6 January", () => {
  for (const t of TEMAER.temaer.filter((x) => x.ting)) {
    assert.ok(t.ting.length >= 15, `${t.id} has ${t.ting.length} pictures, 30 cards need 15`);
    assert.equal(new Set(t.ting.map((x) => x[0])).size, t.ting.length, `${t.id}: a picture twice`);
    assert.equal(new Set(t.ting.map((x) => x[1])).size, t.ting.length, `${t.id}: a name twice`);
  }
  assert.ok(TEMAER.temaer.some((t) => t.id === "jul"));
  for (const dag of ["2026-11-01", "2026-12-24", "2027-01-06"]) assert.equal(erJul(dag), true, dag);
  for (const dag of ["2026-10-31", "2027-01-07", "2026-06-15"]) assert.equal(erJul(dag), false, dag);
  // Never the word the game must not use, anywhere a player can read it.
  const synlig = readFileSync(join(ROT, "rusj/spill/elefanten/spill.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/memory/i.test(synlig) && !/memory/i.test(JSON.stringify(TEMAER)), "«memory» in visible text");
});
