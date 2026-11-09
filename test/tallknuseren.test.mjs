// Tallknuseren's sudoku engine (the pure part of rusj/spill/tallknuseren/spill.js): every puzzle it
// makes has exactly one solution and the right difficulty, a seed always gives the same puzzle
// («Dagens sudoku» is the same on every phone), every level is made fast, and the hints are right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/tallknuseren/spill.js"));
const NIVAER = ["lett", "middels", "vanskelig", "ekspert"];
const fraTekst = (s) => Uint8Array.from(s.replace(/\./g, "0"), Number);

// A complete grid is valid when every row, column and box holds 1–9 once.
function gyldigLosning(l) {
  if (l.length !== 81) return false;
  return M.ENHETER.every((e) => new Set(e.map((i) => l[i])).size === 9 && e.every((i) => l[i] >= 1 && l[i] <= 9));
}

test("løser et kjent brett og teller løsninger riktig", () => {
  const oppgave = fraTekst("53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79");
  const fasit = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
  assert.equal(M.tell(oppgave, 2), 1);
  assert.equal(Array.from(M.los(oppgave)).join(""), fasit);
  assert.equal(M.tell(new Uint8Array(81), 2), 2, "et tomt brett har mange løsninger");
  const ugyldig = oppgave.slice();
  ugyldig[2] = 5; // two fives in the first row
  assert.equal(M.tell(ugyldig, 2), 0);
  assert.equal(M.los(ugyldig), null);
});

for (const [n, niva] of NIVAER.entries()) {
  test(`${niva}: hvert brett har nøyaktig én løsning og riktig vanskelighet`, () => {
    for (let fro = 1; fro <= 60; fro++) {
      const o = M.lag(niva, fro * 7919 + n);
      const gitt = Array.from(o.oppgave);
      assert.equal(M.tell(o.oppgave, 2), 1, `fro ${fro}: ikke nøyaktig én løsning`);
      assert.ok(gyldigLosning(Array.from(o.losning)), `fro ${fro}: løsningen er ikke en gyldig sudoku`);
      assert.deepEqual(Array.from(M.los(o.oppgave)), Array.from(o.losning), `fro ${fro}: feil fasit`);
      gitt.forEach((x, i) => assert.ok(!x || x === o.losning[i], `fro ${fro}: et gitt tall stemmer ikke med fasiten`));
      gitt.forEach((x, i) => assert.equal(!x, !gitt[80 - i], `fro ${fro}: tallene står ikke speilvendt om midten`));
      assert.equal(M.grader(o.oppgave).niva, n + 1, `fro ${fro}: feil vanskelighet`);
      const antall = gitt.filter((x) => x).length;
      if (niva === "lett") assert.ok(antall >= 35, `lett med bare ${antall} tall`);
      if (niva === "middels") assert.ok(antall >= 29 && antall <= 34, `middels med ${antall} tall`);
      if (niva === "vanskelig" || niva === "ekspert") assert.ok(antall <= 34, `${niva} med ${antall} tall`);
    }
  });
}

test("samme frø gir samme brett (dagens sudoku er lik for alle)", () => {
  for (const niva of NIVAER) {
    const a = M.lag(niva, 20261109);
    const b = M.lag(niva, 20261109);
    const c = M.lag(niva, 20261110);
    assert.deepEqual(Array.from(a.oppgave), Array.from(b.oppgave));
    assert.notDeepEqual(Array.from(a.oppgave), Array.from(c.oppgave));
  }
});

// «Dagens sudoku» must never change after the fact (everyone compares the same puzzle, also with an
// older offline copy). These days were made by the version of 9 November 2026: if this test fails,
// the daily generator has changed – put its old rules back instead of updating the answers.
const KJENTE_DAGER = {
  "2026-11-09": ["lett", "000019072749002030000000800054007308090845020207300140005000000010900786830270000"],
  "2026-11-13": ["vanskelig", "000000000007508010860102900004050020700803004020010700001207035070901400000000000"],
  "2026-11-15": ["ekspert", "000005000090604007000070500740006103030000050602300074009050000200701060000200000"],
  "2026-12-24": ["middels", "608000073000850901000300000087004002010030090300200780000001000806072000740000809"],
};
const dagNr = (dato) => {
  const [a, m, d] = dato.split("-").map(Number);
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
};

test("dagens sudoku er frosset: kjente dager gir alltid de samme brettene", () => {
  for (const [dato, [niva, gitt]] of Object.entries(KJENTE_DAGER)) {
    const o = M.lagDaglig(dato, dagNr(dato));
    assert.equal(o.niva, niva, `${dato}: feil nivå for ukedagen`);
    assert.equal(Array.from(o.oppgave).join(""), gitt, `dagens sudoku for ${dato} har endret seg`);
    assert.equal(M.tell(o.oppgave, 2), 1);
  }
});

test("dagens sudoku påvirkes ikke når nivåinnstillingene justeres", () => {
  const gml = JSON.parse(JSON.stringify(M.NIVAER));
  try {
    for (const n of Object.values(M.NIVAER)) {
      n.mal += 3;
      n.grad = Math.min(4, n.grad + 1);
    }
    for (const [dato, [, gitt]] of Object.entries(KJENTE_DAGER)) assert.equal(Array.from(M.lagDaglig(dato, dagNr(dato)).oppgave).join(""), gitt);
  } finally {
    for (const [k, v] of Object.entries(gml)) Object.assign(M.NIVAER[k], v);
  }
});

test("hvert nivå lages raskt, også ekspert", () => {
  for (const niva of NIVAER) {
    const tider = [];
    for (let fro = 1; fro <= 40; fro++) {
      const t0 = performance.now();
      M.lag(niva, fro * 104729);
      tider.push(performance.now() - t0);
    }
    const snitt = tider.reduce((s, t) => s + t, 0) / tider.length;
    const verst = Math.max(...tider);
    // Generous limits: about a tenth of a second on an old phone that is ten times slower.
    assert.ok(snitt < 25, `${niva}: ${snitt.toFixed(1)} ms i snitt`);
    assert.ok(verst < 250, `${niva}: ${verst.toFixed(1)} ms på det tregeste`);
  }
});

test("hint: feil tall først, så et riktig tall med en enkel grunn", () => {
  const o = M.lag("middels", 4242);
  const v = Array.from(o.oppgave);
  const losning = Array.from(o.losning);
  const tom = v.findIndex((x) => !x);
  // A wrong number is pointed out before anything else.
  const feil = v.slice();
  feil[tom] = (losning[tom] % 9) + 1;
  assert.deepEqual(M.hint(feil, losning, -1), { type: "feil", celler: [tom] });
  // Otherwise: the right number, preferably in the selected cell, with a reason.
  for (let k = 0; k < 30; k++) {
    const h = M.hint(v, losning, tom);
    assert.equal(h.type, "tall");
    assert.equal(h.d, losning[h.i]);
    assert.ok(["boks", "rad", "kolonne", "naken", "vanskelig"].includes(h.grunn));
    v[h.i] = h.d;
  }
  // A full board needs no hint.
  assert.equal(M.hint(losning, losning, 0), null);
});
