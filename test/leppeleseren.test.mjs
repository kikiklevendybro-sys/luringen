// Leppeleseren («Les leppene»): the phrases in nb, en and da, the rotation (player i reads to
// i + 1, everyone reads and listens once per round), scoring for pairs and teams, «Angre» and the
// check list, the end, and the music: the pattern maker, a schedule that never drifts, and the
// volume cap. Loads spill.js without the kit (no audio, no browser).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAPPE = join(ROT, "rusj/spill/leppeleseren");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(MAPPE, "spill.js"), "utf8"), kontekst);
const L = kontekst.window.Leppeleseren;
const js = (x) => JSON.parse(JSON.stringify(x));

const les = (m) => JSON.parse(readFileSync(join(MAPPE, m, "fraser.json"), "utf8"));
const SPRAK = { nb: les("data"), en: les("data.en"), da: les("data.da") };

// A deck that just counts up.
const teller = () => {
  let k = 0;
  return () => k++ % 80;
};

test("the phrases: at least 80, as many in every language, 2–6 words, no duplicates", () => {
  for (const [sprak, liste] of Object.entries(SPRAK)) {
    assert.ok(liste.length >= 80, `${sprak}: at least 80 phrases`);
    assert.equal(liste.length, SPRAK.nb.length, `${sprak}: as many phrases as Norwegian`);
    assert.equal(new Set(liste.map((t) => t.toLowerCase())).size, liste.length, `${sprak}: a duplicate`);
    for (const t of liste) {
      const ord = t.trim().split(/\s+/).length;
      assert.ok(ord >= 2 && ord <= 6, `${sprak}: «${t}» has ${ord} words`);
      assert.ok(t.length <= 36, `${sprak}: «${t}» is too long for the card`);
      assert.ok(/^\p{Lu}/u.test(t) && !/[.!?{}<>]/.test(t), `${sprak}: «${t}» should start with a capital and have no end mark`);
    }
  }
  assert.ok(!SPRAK.en.some((t) => /[æøå]/i.test(t)), "en: Norwegian letters");
});

test("rotation: player i reads to i + 1, everyone reads and listens once per round", () => {
  for (const n of [2, 3, 5, 12]) {
    const sp = L.ny({ modus: "par", antall: n, lag: 2, runder: 2 }, 1);
    assert.equal(sp.turer, 2 * n);
    const lest = Array(n).fill(0);
    const lyttet = Array(n).fill(0);
    let turer = 0;
    for (;;) {
      const a = L.leser(sp);
      const b = L.lytter(sp);
      assert.notEqual(a, b, "nobody reads to themselves");
      assert.equal(b, (a + 1) % n, "the listener is the next player");
      lest[a] += 1;
      lyttet[b] += 1;
      turer += 1;
      L.startTur(sp, teller());
      L.tidUte(sp);
      if (L.neste(sp) === "slutt") break;
    }
    assert.equal(turer, 2 * n);
    assert.deepEqual(lest, Array(n).fill(2), `${n} players: everyone reads twice`);
    assert.deepEqual(lyttet, Array(n).fill(2), `${n} players: everyone listens twice`);
    assert.ok(sp.ferdig);
  }
  // The first reader rotates from game to game.
  assert.equal(L.leser(L.ny({ modus: "par", antall: 4, runder: 1 }, 5)), 1);
});

test("scoring: the reader and the listener both get a point per phrase; teams get them for the team", () => {
  const sp = L.ny({ modus: "par", antall: 4, lag: 2, runder: 1 }, 0);
  const trekk = teller();
  L.startTur(sp, trekk);
  assert.equal(js(sp.runde.ord).length, 1, "one phrase on the screen when the clock starts");
  L.svar(sp, true, trekk);
  L.svar(sp, false, trekk);
  L.svar(sp, true, trekk);
  L.svar(sp, true, trekk);
  assert.equal(L.riktige(sp), 3);
  assert.deepEqual(js(L.turPluss(sp)), [[0, 3], [1, 3]]);
  // Nothing is counted before the turn is left …
  assert.deepEqual(js(sp.poeng), [0, 0, 0, 0]);
  assert.deepEqual(js(L.rader(sp, true)).map((r) => r.poeng), [3, 3, 0, 0], "the score list shows the turn as +n");
  L.tidUte(sp);
  const sist = sp.runde.ord[sp.runde.ord.length - 1];
  assert.ok(sist.s === 0 && sist.u, "the phrase on screen when the time ran out is «rakk ikke»");
  assert.equal(L.neste(sp), "klar");
  assert.deepEqual(js(sp.poeng), [3, 3, 0, 0]);
  // … and never twice.
  assert.equal(L.fullforTur(sp), false);

  const lag = L.ny({ modus: "lag", antall: 8, lag: 3, runder: 2 }, 0);
  assert.equal(lag.n, 3);
  assert.equal(lag.turer, 6);
  L.startTur(lag, trekk);
  L.svar(lag, true, trekk);
  L.svar(lag, true, trekk);
  assert.deepEqual(js(L.turPluss(lag)), [[0, 2]]);
  L.tidUte(lag);
  L.neste(lag);
  assert.deepEqual(js(lag.poeng), [2, 0, 0]);
  assert.equal(L.lagNa(lag), 1, "the next team's turn");
  assert.deepEqual(js(L.rader(lag)), [{ lag: 0, poeng: 2 }, { lag: 1, poeng: 0 }, { lag: 2, poeng: 0 }]);
});

test("«Angre» takes the last answer back; the check list corrects a wrong tap", () => {
  const sp = L.ny({ modus: "par", antall: 3, runder: 1 }, 0);
  const trekk = teller();
  L.startTur(sp, trekk);
  assert.equal(L.kanAngre(sp), false, "nothing to undo before the first answer");
  assert.equal(L.angre(sp), false);
  const forste = sp.runde.ord[0].k;
  L.svar(sp, true, trekk);
  assert.equal(L.riktige(sp), 1);
  assert.ok(L.angre(sp));
  assert.equal(L.riktige(sp), 0);
  assert.equal(sp.runde.ord.length, 1);
  assert.equal(L.ubesvart(sp.runde).k, forste, "the undone phrase is on the screen again");
  L.svar(sp, false, trekk);
  L.svar(sp, true, trekk);
  assert.equal(L.veksle(sp, 0), false, "no correcting while the clock runs");
  L.tidUte(sp);
  assert.equal(L.angre(sp), false, "no undo after the time is up");
  assert.ok(L.veksle(sp, 0));
  assert.equal(L.riktige(sp), 2);
  assert.ok(L.veksle(sp, 2), "«rakk ikke» can be marked right too");
  assert.equal(L.riktige(sp), 3);
  assert.ok(L.veksle(sp, 2));
  L.neste(sp);
  assert.deepEqual(js(sp.poeng), [2, 2, 0]);
  assert.equal(L.veksle(sp, 0), false, "a counted turn can't be changed");
  // Answers after the time is up are ignored.
  L.startTur(sp, trekk);
  L.tidUte(sp);
  assert.equal(L.svar(sp, true, trekk), false);
});

test("the end: winners, the best pair, the defaults", () => {
  const sp = L.ny({ modus: "par", antall: 2, runder: 1 }, 0);
  const trekk = teller();
  L.startTur(sp, trekk);
  L.svar(sp, true, trekk);
  L.tidUte(sp);
  L.neste(sp);
  L.startTur(sp, trekk);
  L.svar(sp, true, trekk);
  L.svar(sp, true, trekk);
  L.tidUte(sp);
  assert.equal(L.neste(sp), "slutt");
  assert.ok(sp.ferdig);
  assert.deepEqual(js(sp.poeng), [3, 3]);
  assert.deepEqual(js(L.toppen(sp)), [0, 1], "a shared win");
  assert.deepEqual(js(L.besteTur(sp)), { leser: 1, lytter: 0, riktige: 2 });
  assert.equal(L.stdRunder("par", 3), 2);
  assert.equal(L.stdRunder("par", 8), 1);
  assert.equal(L.stdRunder("lag", 8), 3);
  assert.deepEqual(js(L.toppen(L.ny({ modus: "par", antall: 3, runder: 1 }, 0))), [], "nobody wins with no points");
});

test("music patterns: every style loops in 64 steps with a beat on the one", () => {
  for (const stil of L.STIL_IDER) {
    const s = L.STILER[stil];
    assert.ok(s.bpm >= 100 && s.bpm <= 150, `${stil}: a party tempo`);
    for (const k of ["kick", "snare", "hatt", "bass", "akkord"]) assert.equal(s[k].length, L.STEG, `${stil}.${k}: 16 steps`);
    const steg = L.BARER * L.STEG;
    for (let n = 0; n < steg; n++) assert.deepEqual(js(L.hendelser(stil, n)), js(L.hendelser(stil, n + steg * 7)), `${stil}: step ${n} repeats`);
    assert.ok(L.hendelser(stil, 0).some((e) => e.i === "kick"), `${stil}: kick on the one`);
    let toner = 0;
    for (let n = 0; n < steg; n++)
      for (const e of L.hendelser(stil, n)) {
        if (e.m == null) continue;
        for (const m of [].concat(e.m)) {
          assert.ok(m >= 28 && m <= 100, `${stil}: note ${m} in range`);
          toner += 1;
        }
      }
    assert.ok(toner > 30, `${stil}: has bass, chords and a tune`);
  }
  assert.equal(Math.round(L.mtof(69)), 440);
  assert.equal(Math.round(L.mtof(57)), 220);
});

test("the scheduler: times come from the step number, so a long session never drifts", () => {
  for (const stil of L.STIL_IDER) {
    const t0 = 12.345;
    const d = L.stegSek(stil);
    let fra = 0;
    let sist = -1;
    let antall = 0;
    // Like the browser: every 25 ms, look 150 ms ahead — for 10 minutes.
    for (let na = t0; na < t0 + 600; na += 0.025) {
      const p = L.planlegg(stil, t0, fra, na + 0.15);
      for (const e of p.liste) {
        assert.ok(e.t >= sist, "in order");
        assert.ok(e.t < na + 0.15);
        assert.ok(Math.abs(e.t - (t0 + e.n * d)) < 1e-9, "on the grid");
        sist = e.t;
        antall += 1;
      }
      assert.ok(p.neste >= fra);
      fra = p.neste;
    }
    const venter = Math.ceil((600.15 - 0.025) / d);
    assert.ok(Math.abs(fra - venter) <= 2, `${stil}: ${fra} steps planned in 10 min (expected about ${venter})`);
    assert.ok(Math.abs(L.stegTid(stil, t0, fra) - (t0 + fra * d)) < 1e-9, `${stil}: no drift after 10 min`);
    assert.ok(antall > fra, "every step has something on it");
  }
  // A late start (the tab was asleep) plans everything due, never more.
  const p = L.planlegg("disko", 0, 0, 1);
  assert.equal(p.neste, Math.ceil(1 / L.stegSek("disko")));
});

test("the volume is capped whatever the slider or the saved state says", () => {
  assert.ok(L.MAKS_GAIN > 0 && L.MAKS_GAIN <= 0.8);
  assert.equal(L.trygtVolum(100), L.MAKS_GAIN);
  for (const v of [101, 150, 1e9, Infinity]) assert.ok(L.trygtVolum(v) <= L.MAKS_GAIN, `${v}`);
  assert.equal(L.trygtVolum(0), 0);
  assert.equal(L.trygtVolum(-50), 0);
  assert.equal(L.trygtVolum("tull"), L.trygtVolum(L.STD_VOLUM), "nonsense gives the default");
  assert.equal(L.trygtVolum(NaN), L.trygtVolum(L.STD_VOLUM));
  let forrige = -1;
  for (let v = 0; v <= 100; v += 5) {
    const g = L.trygtVolum(v);
    assert.ok(g >= forrige, "louder as the slider goes up");
    forrige = g;
  }
  assert.ok(L.trygtVolum(L.STD_VOLUM) < L.MAKS_GAIN * 0.6, "the default is well below the cap");
});

test("pink noise stays below full scale", () => {
  let fro = 7;
  const rng = () => {
    fro = (fro * 16807) % 2147483647;
    return fro / 2147483647;
  };
  const x = L.rosaStoy(48000, rng);
  let topp = 0;
  let sum = 0;
  for (const v of x) {
    topp = Math.max(topp, Math.abs(v));
    sum += v * v;
  }
  assert.ok(topp <= 0.95 && topp > 0.1, `peak ${topp}`);
  assert.ok(Math.sqrt(sum / x.length) > 0.02, "not silent");
});
