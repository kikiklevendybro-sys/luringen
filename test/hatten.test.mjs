// Hatten: the hat. Loads rusj/spill/hatten/spill.js without the kit (node:vm): the file then only
// exposes the rules (Hatt). Words come back on a pass, every round reuses the same words, the
// explainers take turns fairly — and the word list is big, clean and has no repeats.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/hatten/spill.js"), "utf8"), kontekst);
const { Hatt, RUNDER } = kontekst.window.Hatten;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A game with n words (sp.ord as the kit game has it) and these teams.
function spill(n, lag, fro = 1) {
  const sp = Hatt.nytt(n, lag, rng(fro));
  sp.ord = Array.from({ length: n }, (_, i) => `ord${i}`);
  return sp;
}
const ren = (x) => JSON.parse(JSON.stringify(x)); // arrays from the vm context compare as plain ones
const sortert = (a) => Array.from(a).sort((x, y) => x - y);
const alle = (n) => Array.from({ length: n }, (_, i) => i);

test("a new hat holds every word once, shuffled", () => {
  const sp = spill(40, [[0, 1], [2, 3]]);
  assert.deepEqual(sortert(sp.hatt), alle(40));
  assert.notDeepEqual(sp.hatt, alle(40));
  assert.equal(sp.runde, 1);
  assert.deepEqual(ren(sp.poeng), [[0, 0, 0], [0, 0, 0]]);
});

test("Riktig takes the word out of the hat; Pass puts it back at the bottom", () => {
  const sp = spill(5, [[0, 1], [2, 3]]);
  Hatt.startTur(sp);
  const t = sp.tur;
  const forste = t.ord;
  assert.equal(sp.hatt.length, 4);
  assert.ok(Hatt.pass(sp, 2));
  assert.equal(sp.hatt[sp.hatt.length - 1], forste, "passed word is at the bottom of the hat");
  assert.notEqual(t.ord, forste);
  assert.equal(t.pass, 1);
  const andre = t.ord;
  assert.ok(Hatt.riktig(sp));
  assert.deepEqual(Array.from(t.riktige, (r) => r.i), [andre]);
  assert.ok(!sp.hatt.includes(andre) && t.ord !== andre, "a correct word is out of the hat");
  // Every word is still somewhere: in the hat, on the card or among the correct ones.
  assert.deepEqual(sortert([...sp.hatt, t.ord, ...t.riktige.map((r) => r.i)]), alle(5));
});

test("the pass limit holds, and the last word in the hat can't be passed", () => {
  let sp = spill(10, [[0, 1], [2, 3]]);
  Hatt.startTur(sp);
  assert.ok(Hatt.pass(sp, 1));
  assert.ok(!Hatt.pass(sp, 1), "second pass with a limit of one");
  assert.ok(!Hatt.kanPasse(sp, 0));
  sp = spill(2, [[0, 1], [2, 3]]);
  Hatt.startTur(sp);
  Hatt.riktig(sp);
  assert.equal(sp.hatt.length, 0);
  assert.ok(!Hatt.pass(sp, 99), "the last word can't go back into an empty hat");
});

test("Angre takes back a pass and a correct word", () => {
  const sp = spill(6, [[0, 1], [2, 3]]);
  Hatt.startTur(sp);
  const t = sp.tur;
  const a = t.ord;
  const hattFor = sp.hatt.slice();
  Hatt.pass(sp, 9);
  assert.ok(Hatt.angre(sp));
  assert.equal(t.ord, a);
  assert.equal(t.pass, 0);
  assert.deepEqual(ren(sp.hatt), ren(hattFor));
  Hatt.riktig(sp);
  assert.ok(Hatt.angre(sp));
  assert.equal(t.ord, a);
  assert.equal(t.riktige.length, 0);
  assert.deepEqual(ren(sp.hatt), ren(hattFor));
  assert.ok(!Hatt.angre(sp), "only the last action");
});

test("time up: the word on the card goes back in the hat for the next team", () => {
  const sp = spill(8, [[0, 1], [2, 3]]);
  Hatt.startTur(sp);
  Hatt.riktig(sp);
  Hatt.riktig(sp);
  const paKortet = sp.tur.ord;
  Hatt.tidUte(sp);
  assert.equal(sp.tur.slutt, "tid");
  assert.ok(sp.hatt.includes(paKortet));
  const res = Hatt.avsluttTur(sp, rng(3));
  assert.equal(res.poeng, 2);
  assert.equal(res.rundeFerdig, false);
  assert.deepEqual(ren(sp.poeng[0]), [2, 0, 0]);
  assert.equal(sp.hatt.length, 6, "the words carry over to the next turn");
  assert.equal(sp.lagNr, 1, "the other team is next");
});

test("a word marked wrong after the turn goes back in the hat without a point", () => {
  const sp = spill(4, [[0, 1], [2, 3]]);
  Hatt.startTur(sp);
  Hatt.riktig(sp);
  const feil = sp.tur.riktige[0].i;
  Hatt.riktig(sp);
  Hatt.tidUte(sp);
  assert.ok(Hatt.veksle(sp, 0));
  Hatt.avsluttTur(sp, rng(5));
  assert.deepEqual(ren(sp.poeng[0]), [1, 0, 0]);
  assert.ok(sp.hatt.includes(feil));
});

test("three rounds with the same words, then the game is over", () => {
  const sp = spill(12, [[0, 1, 2], [3, 4], [5, 6]], 9);
  const sett = [];
  let runder = 0;
  for (let n = 0; n < 200 && !sp.ferdig; n++) {
    const forRunde = sp.runde;
    Hatt.startTur(sp);
    // Two right, one pass, two right — or until the hat is empty.
    for (const svar of [1, 1, 0, 1, 1]) {
      if (sp.tur.slutt) break;
      if (svar) Hatt.riktig(sp);
      else Hatt.pass(sp, 1);
    }
    if (!sp.tur.slutt) Hatt.tidUte(sp);
    const t = sp.tur;
    if (t.slutt === "tom") sett.push(sortert(t.riktige.map((r) => r.i)));
    const res = Hatt.avsluttTur(sp, rng(n + 1));
    if (res.rundeFerdig) {
      runder++;
      assert.equal(res.runde, forRunde);
      if (!sp.ferdig) {
        assert.equal(sp.runde, forRunde + 1);
        assert.deepEqual(sortert(sp.hatt), alle(12), "the next round starts with the full hat");
      }
    }
  }
  assert.ok(sp.ferdig);
  assert.equal(runder, 3);
  assert.equal(sp.runde, 3);
  // Every round hands out exactly one point per word.
  for (let k = 0; k < 3; k++) assert.equal(sp.poeng.reduce((s, p) => s + p[k], 0), 12, `runde ${k + 1}`);
  assert.equal(RUNDER.length, 3);
});

test("the teams take turns, and every player explains equally often", () => {
  const lag = [[0, 1, 2], [3, 4], [5, 6, 7, 8]];
  const sp = spill(600, lag);
  sp.lagNr = 1; // the starting team rotates from game to game
  const ganger = new Map();
  const rekke = [];
  for (let n = 0; n < 36; n++) {
    const f = Hatt.forklarer(sp);
    rekke.push(f.lag);
    ganger.set(f.spiller, (ganger.get(f.spiller) || 0) + 1);
    Hatt.startTur(sp);
    Hatt.riktig(sp);
    Hatt.tidUte(sp);
    Hatt.avsluttTur(sp, rng(n));
  }
  assert.deepEqual(rekke.slice(0, 6), [1, 2, 0, 1, 2, 0]);
  // 12 turns per team: 4 each in a team of three, 6 each in a team of two, 3 each in a team of four.
  for (const i of lag[0]) assert.equal(ganger.get(i), 4);
  for (const i of lag[1]) assert.equal(ganger.get(i), 6);
  for (const i of lag[2]) assert.equal(ganger.get(i), 3);
  // Never the same player twice in a row within a team.
  const sp2 = spill(50, [[0, 1], [2, 3]]);
  let forrige = [-1, -1];
  for (let n = 0; n < 10; n++) {
    const f = Hatt.forklarer(sp2);
    assert.notEqual(f.spiller, forrige[f.lag]);
    forrige[f.lag] = f.spiller;
    Hatt.startTur(sp2);
    Hatt.tidUte(sp2);
    Hatt.avsluttTur(sp2, rng(n));
  }
});

test("the hat empties mid-turn: the turn ends at once", () => {
  const sp = spill(3, [[0, 1], [2, 3]]);
  Hatt.startTur(sp);
  Hatt.riktig(sp);
  Hatt.riktig(sp);
  Hatt.riktig(sp);
  assert.equal(sp.tur.slutt, "tom");
  assert.equal(sp.tur.ord, null);
  assert.ok(!Hatt.riktig(sp) && !Hatt.angre(sp));
  const res = Hatt.avsluttTur(sp, rng(1));
  assert.ok(res.rundeFerdig);
  assert.equal(sp.runde, 2);
});

// ---------- The word list ----------

const D = JSON.parse(readFileSync(join(ROT, "rusj/spill/hatten/data/ord.json"), "utf8"));
const ordene = D.kategorier.flatMap((k) => k.ord);

test("at least 400 words, no repeats, tidy spelling", () => {
  assert.ok(ordene.length >= 400, `bare ${ordene.length}`);
  const sett = new Set();
  for (const o of ordene) {
    assert.equal(typeof o, "string");
    assert.ok(o === o.trim() && o.length >= 2 && o.length <= 30 && !/\s\s/.test(o), `«${o}»`);
    assert.match(o, /^[A-ZÆØÅ0-9]/, `«${o}» skal ha stor forbokstav`);
    const k = o.toLocaleLowerCase("nb");
    assert.ok(!sett.has(k), `dublett: ${o}`);
    sett.add(k);
  }
  for (const k of D.kategorier) {
    for (const felt of ["id", "navn", "ikon"]) assert.ok(typeof k[felt] === "string" && k[felt], `${k.id}: ${felt}`);
    assert.ok(k.ord.length >= 30, `${k.id}: bare ${k.ord.length}`);
  }
});
