// Spåkona (the dealer guessing game, 18+): the answer to a guess (right, higher, lower), the sips
// for a miss (one to three by distance, never more), the values still possible after a hint and
// with cards on the table, the turn order (never the dealer, round the table), the dealer handing
// the deck on after exactly three misses in a row, water every twelfth card, points (two on the
// first try, one on the second), and whole games over many seeds. The texts in nb, en and da.
// Loads rusj/spill/spakona/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/spakona/spill.js"), "utf8"), kontekst);
const { verdi, svar, slurkerFor, paBordet, mulige, nesteGjetter, ny, gjett, videre, ANTALL_KORT, VANN_HVERT, BOM_PA_RAD } = kontekst.window.Spakona;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const kopi = (x) => JSON.parse(JSON.stringify(x));
// A game where the card on the table is known: card k at the current place.
function medKort(antall, k, fro = 1) {
  const sp = ny(antall, rng(fro), 0);
  const i = sp.stokk.indexOf(k);
  [sp.stokk[0], sp.stokk[i]] = [sp.stokk[i], sp.stokk[0]];
  return sp;
}

test("the deck: 52 different cards, ace 1 … king 13, four of each value", () => {
  const sp = ny(4, rng(5));
  assert.equal(sp.stokk.length, ANTALL_KORT);
  assert.equal(new Set(sp.stokk).size, 52);
  assert.equal(verdi(0), 1);
  assert.equal(verdi(12), 13);
  assert.equal(verdi(13), 1);
  for (let v = 1; v <= 13; v++) assert.equal(sp.stokk.filter((k) => verdi(k) === v).length, 4);
});

test("the answer to a guess: right, higher or lower", () => {
  assert.equal(svar(6, 7), "riktig"); // the 7 of spades
  assert.equal(svar(6, 3), "hoyere");
  assert.equal(svar(6, 12), "lavere");
  assert.equal(svar(12, 1), "hoyere");
  assert.equal(svar(0, 13), "lavere");
});

test("sips for a miss: one when close, two, three when far off – never more", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 12].map(slurkerFor), [1, 1, 2, 2, 2, 3, 3, 3]);
  for (let a = 1; a <= 12; a++) assert.ok(slurkerFor(a) >= 1 && slurkerFor(a) <= 3);
});

test("a right first guess: the dealer takes two, the guesser gets two points", () => {
  const sp = medKort(4, 6);
  const g = sp.gjetter;
  assert.equal(gjett(sp, 7), "forste");
  assert.equal(sp.fase, "svar");
  assert.deepEqual(kopi(sp.utfall), { type: "forste", avstand: 0, slurker: 2 });
  assert.equal(sp.poeng[g], 2);
  assert.equal(sp.treff[g], 1);
  assert.equal(sp.bomRad, 0);
  assert.equal(gjett(sp, 7), null, "a guess after the answer");
});

test("a hint, then a right second guess: one sip for the dealer, one point", () => {
  const sp = medKort(4, 6);
  const g = sp.gjetter;
  assert.equal(gjett(sp, 3), "hint");
  assert.equal(sp.fase, "gjett2");
  assert.equal(sp.hint, "hoyere");
  assert.deepEqual(Array.from(mulige(sp)), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(gjett(sp, 7), "andre");
  assert.deepEqual(kopi(sp.utfall), { type: "andre", avstand: 0, slurker: 1 });
  assert.equal(sp.poeng[g], 1);
});

test("two misses: the guesser drinks by how far off the second guess was", () => {
  const sp = medKort(4, 6); // a seven
  const g = sp.gjetter;
  assert.equal(gjett(sp, 12), "hint");
  assert.equal(sp.hint, "lavere");
  assert.deepEqual(Array.from(mulige(sp)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(gjett(sp, 1), "bom");
  assert.deepEqual(kopi(sp.utfall), { type: "bom", avstand: 6, slurker: 3 });
  assert.equal(sp.poeng[g], 0);
  assert.equal(sp.bomRad, 1);
  assert.equal(gjett(sp, 7), null);
});

test("values all four of which lie on the table cannot be guessed", () => {
  const sp = ny(3, rng(9), 0);
  // Put all four aces first and turn them.
  const ess = sp.stokk.filter((k) => verdi(k) === 1);
  sp.stokk = [...ess, ...sp.stokk.filter((k) => verdi(k) !== 1)];
  sp.pos = 4;
  assert.equal(paBordet(sp)[1], 4);
  assert.ok(!mulige(sp).includes(1));
  assert.equal(mulige(sp).length, 12);
  sp.fase = "svar";
  assert.equal(paBordet(sp).reduce((s, n) => s + n, 0), 5, "the turned card counts on the table");
});

test("the turn order: everyone but the dealer, round the table", () => {
  assert.equal(nesteGjetter(4, 0, 0), 1);
  assert.equal(nesteGjetter(4, 0, 3), 1);
  assert.equal(nesteGjetter(4, 2, 1), 3);
  assert.equal(nesteGjetter(2, 0, 1), 1, "two players: the other one guesses every time");
  for (let antall = 2; antall <= 12; antall++)
    for (let giver = 0; giver < antall; giver++) {
      let i = giver;
      const sett = new Set();
      for (let n = 0; n < antall - 1; n++) {
        i = nesteGjetter(antall, giver, i);
        assert.notEqual(i, giver);
        sett.add(i);
      }
      assert.equal(sett.size, antall - 1, "someone was skipped");
    }
});

// Plays one card: a random first guess, and a random allowed second guess when needed.
function spillKort(sp, r) {
  const valg = () => {
    const m = mulige(sp);
    return m[Math.floor(r() * m.length)];
  };
  if (gjett(sp, valg()) === "hint") gjett(sp, valg());
}

test("three misses in a row hand the deck on to the next player; a hit resets the count", () => {
  const sp = ny(4, rng(3), 1);
  for (let n = 0; n < BOM_PA_RAD; n++) {
    const v = verdi(sp.stokk[sp.pos]);
    const feil = v === 13 ? 1 : 13; // the hint, then a wrong value on the right side
    gjett(sp, feil);
    const m = mulige(sp).filter((x) => x !== v);
    gjett(sp, m[0]);
    assert.equal(sp.utfall.type, "bom");
    if (n < BOM_PA_RAD - 1) {
      assert.equal(sp.byttes, null);
      videre(sp);
    }
  }
  assert.equal(sp.byttes, 2, "the deck goes to the player after the dealer");
  videre(sp);
  assert.equal(sp.giver, 2);
  assert.equal(sp.gjetter, 3, "the player after the new dealer guesses first");
  assert.equal(sp.bomRad, 0);
  assert.equal(sp.byttet, 1);
  // A hit in between: the count starts again.
  const sp2 = medKort(4, 6, 4); // a seven
  assert.equal(gjett(sp2, 1), "hint");
  assert.equal(gjett(sp2, 2), "bom");
  assert.equal(sp2.bomRad, 1);
  videre(sp2);
  gjett(sp2, verdi(sp2.stokk[sp2.pos]));
  assert.equal(sp2.bomRad, 0);
});

test("whole games: 52 cards, water every twelfth, the dealer never guesses, points add up", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const r = rng(fro);
    const antall = 2 + (fro % 11);
    const sp = ny(antall, r);
    let kort = 0;
    let vann = 0;
    let bomRad = 0;
    let forsteTreff = 0;
    let andreTreff = 0;
    while (!sp.ferdig) {
      if (sp.fase === "vann") {
        vann += 1;
        assert.equal(sp.pos % VANN_HVERT, 0, `water at card ${sp.pos}`);
        videre(sp);
        continue;
      }
      assert.notEqual(sp.gjetter, sp.giver, "the dealer is guessing");
      const giver = sp.giver;
      spillKort(sp, r);
      kort += 1;
      const u = sp.utfall.type;
      if (u === "forste") forsteTreff += 1;
      if (u === "andre") andreTreff += 1;
      bomRad = u === "bom" ? bomRad + 1 : 0;
      assert.ok(sp.utfall.slurker >= 1 && sp.utfall.slurker <= 3);
      assert.equal(sp.byttes != null, bomRad === BOM_PA_RAD, "the deck moved at the wrong time");
      const byttes = sp.byttes;
      if (bomRad === BOM_PA_RAD) bomRad = 0;
      videre(sp);
      if (!sp.ferdig) assert.equal(sp.giver, byttes != null ? byttes : giver);
    }
    assert.equal(kort, ANTALL_KORT, `seed ${fro}: ${kort} cards played`);
    assert.equal(vann, Math.floor((ANTALL_KORT - 1) / VANN_HVERT));
    assert.equal(sp.vann, vann);
    assert.equal(sp.poeng.reduce((s, n) => s + n, 0), 2 * forsteTreff + andreTreff);
    assert.equal(sp.treff.reduce((s, n) => s + n, 0), forsteTreff + andreTreff);
    assert.equal(sp.gjettet.reduce((s, n) => s + n, 0), ANTALL_KORT);
  }
});

test("the same seed deals the same deck", () => {
  assert.deepEqual(Array.from(ny(5, rng(77)).stokk), Array.from(ny(5, rng(77)).stokk));
  assert.notDeepEqual(Array.from(ny(5, rng(77)).stokk), Array.from(ny(5, rng(78)).stokk));
});

test("what Spåkona says: the same kinds of lines in nb, en and da", () => {
  const les = (m) => JSON.parse(readFileSync(join(ROT, "rusj/spill/spakona", m, "tekster.json"), "utf8"));
  const nb = les("data");
  for (const m of ["data", "data.en", "data.da"]) {
    const d = les(m);
    for (const k of ["hoyere", "lavere", "forste", "andre", "bom"]) {
      assert.ok(Array.isArray(d[k]) && d[k].length >= 6, `${m}: ${k}`);
      assert.equal(d[k].length, nb[k].length, `${m}: ${k} has another number of lines`);
      assert.equal(new Set(d[k]).size, d[k].length, `${m}: ${k} has a line twice`);
    }
  }
});
