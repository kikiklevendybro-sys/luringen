// Steinfjeset: the pair rotation (every player is clown and stone face once per round, new pairs
// each round, never against oneself), the scoring in both modes, undo, standing over, the end of
// the game and the winners – as pure functions loaded in node:vm without the kit. And the tasks:
// the same number per kind in nb, en and da, no duplicates, short and well formed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/steinfjeset/spill.js"), "utf8"), { window, console, document: { addEventListener() {} } });
const M = window.RusjSteinfjeset;
const j = (x) => JSON.parse(JSON.stringify(x));
const spill = (o = {}, antall = 4, start = 0) => {
  const sp = M.nyttSpill(Object.assign({ modus: "klassisk", tid: 30, runder: 1 }, o), antall, start);
  M.nyTur(sp, 0);
  return sp;
};

test("every round: everyone is clown once and stone face once, never against oneself", () => {
  for (let n = 2; n <= 12; n++) {
    for (const start of [0, n - 1]) {
      for (let runde = 0; runde < 3; runde++) {
        const klovn = Array(n).fill(0);
        const stein = Array(n).fill(0);
        for (let k = 0; k < n; k++) {
          const [a, b] = M.par(n, start, runde * n + k);
          assert.notEqual(a, b, `n=${n} runde=${runde}: against oneself`);
          assert.ok(a >= 0 && a < n && b >= 0 && b < n);
          klovn[a] += 1;
          stein[b] += 1;
        }
        assert.deepEqual(klovn, Array(n).fill(1), `n=${n}: clown counts`);
        assert.deepEqual(stein, Array(n).fill(1), `n=${n}: stone counts`);
      }
    }
  }
});

test("new pairs each round when there are enough players", () => {
  const n = 5;
  const parI = (runde) => new Set(Array.from({ length: n }, (_, k) => M.par(n, 0, runde * n + k).join("-")));
  const r1 = parI(0);
  const r2 = parI(1);
  for (const p of r2) assert.ok(!r1.has(p), `pair ${p} met twice`);
  // Two players simply swap roles each turn.
  assert.deepEqual(j([M.par(2, 0, 0), M.par(2, 0, 1), M.par(2, 0, 2)]), [[0, 1], [1, 0], [0, 1]]);
});

test("classic: a laugh gives the clown the point, holding gives the stone face the point", () => {
  const sp = spill();
  const { klovn, stein } = sp.na;
  assert.equal(M.dom(sp, klovn), null, "the clown can't be the one who laughed in classic");
  const l = M.dom(sp, stein, 12.5);
  assert.deepEqual(j(l.til), [klovn]);
  assert.equal(sp.poeng[klovn], 1);
  assert.equal(M.dom(sp, -1), null, "no second verdict on the same turn");
  assert.ok(M.neste(sp));
  M.nyTur(sp, 1);
  M.dom(sp, -1, 0);
  assert.equal(sp.poeng[sp.na.stein], 1);
  assert.deepEqual(j(M.tellinger(sp)), { latter: [1, 0, 0, 0], holdt: [0, 0, 1, 0] });
});

test("dobbel trøbbel: whoever laughs first gives the other the point, nobody laughing gives both", () => {
  const sp = spill({ modus: "dobbel" }, 3);
  const { klovn: a, stein: b } = sp.na;
  M.dom(sp, a, 5);
  assert.deepEqual(j(sp.poeng), [0, 1, 0]);
  M.angre(sp);
  M.dom(sp, b, 5);
  assert.deepEqual(j(sp.poeng), [1, 0, 0]);
  M.angre(sp);
  M.dom(sp, -1, 0);
  assert.deepEqual(j(sp.poeng), [1, 1, 0]);
  assert.equal(M.dom(sp, 2), null);
});

test("undo: the point goes back, the turn reopens paused with the time it had", () => {
  const sp = spill();
  assert.equal(M.kanAngre(sp), false);
  M.dom(sp, sp.na.stein, 17.2);
  assert.ok(M.kanAngre(sp));
  const l = M.angre(sp);
  assert.ok(l);
  assert.deepEqual(j(sp.poeng), [0, 0, 0, 0]);
  assert.deepEqual(j([sp.na.ferdig, sp.na.pause, sp.na.igjen, sp.logg.length]), [false, true, 17.2, 0]);
  assert.equal(M.angre(sp), null, "nothing more to undo");
  // A skipped turn can't be undone, and neither can last turn's verdict once play moved on.
  M.dom(sp, -1, 0);
  M.neste(sp);
  M.nyTur(sp, 2);
  assert.equal(M.kanAngre(sp), false);
  M.staOver(sp);
  assert.equal(M.kanAngre(sp), false);
});

test("the game ends after rounds × players turns; winners and ties", () => {
  const sp = spill({ runder: 2 }, 3);
  assert.equal(sp.turer, 6);
  let turer = 1;
  while (true) {
    M.dom(sp, sp.na.stein === 2 ? -1 : sp.na.stein); // player 2 never laughs
    if (!M.neste(sp)) break;
    M.nyTur(sp, turer);
    turer += 1;
  }
  assert.equal(turer, 6);
  assert.ok(sp.ferdig);
  assert.equal(sp.poeng.reduce((a, b) => a + b, 0), 6);
  const v = j(M.vinnere(sp));
  const maks = Math.max(...sp.poeng);
  assert.deepEqual(v, j(sp.poeng).map((p, i) => (p === maks ? i : -1)).filter((i) => i >= 0));
  assert.deepEqual(j(M.vinnere(spill())), [], "no points, no winner");
});

test("bad settings fall back to the defaults", () => {
  const sp = M.nyttSpill({ modus: "x", tid: 7, runder: 9 }, 2, 5);
  assert.deepEqual(j([sp.modus, sp.tid, sp.runder, sp.turer, sp.start]), ["klassisk", 30, 1, 2, 1]);
});

// ---------- The tasks ----------

const les = (mappe) => JSON.parse(readFileSync(join(ROT, `rusj/spill/steinfjeset/${mappe}/oppgaver.json`), "utf8"));
const DATA = { nb: les("data"), en: les("data.en"), da: les("data.da") };

test("the same kinds and the same number of tasks in every edition, at least 60", () => {
  const nb = DATA.nb;
  assert.deepEqual(Object.keys(nb), ["si", "fjes", "lat"]);
  const total = Object.values(nb).flat().length;
  assert.ok(total >= 60, `only ${total} tasks`);
  for (const sprak of ["en", "da"]) {
    assert.deepEqual(Object.keys(DATA[sprak]), Object.keys(nb), sprak);
    for (const k of Object.keys(nb)) assert.equal(DATA[sprak][k].length, nb[k].length, `${sprak}.${k}`);
  }
});

for (const [sprak, d] of Object.entries(DATA)) {
  test(`${sprak}: no duplicates, short, well formed`, () => {
    const alle = Object.values(d).flat();
    const lav = alle.map((t) => t.toLowerCase());
    assert.equal(new Set(lav).size, lav.length, "duplicates");
    for (const t of alle) {
      assert.ok(typeof t === "string" && t.trim() === t && t.length >= 12 && t.length <= 70, `length: «${t}»`);
      assert.ok(!/[.]$/.test(t), `ends with a full stop: «${t}»`);
      assert.ok(/^\p{Lu}/u.test(t), `starts lower case: «${t}»`);
      assert.ok(!/\s{2}|\{|\}/.test(t), `odd spacing or placeholder: «${t}»`);
    }
    // Quotes in each edition's own style.
    if (sprak === "nb") assert.ok(alle.every((t) => !/"|‘|»[^«]*«/.test(t)));
    if (sprak === "da") assert.ok(alle.every((t) => !/"|«[^»]*»/.test(t)));
    if (sprak === "en") assert.ok(alle.every((t) => !/[«»"]/.test(t)));
  });
}
