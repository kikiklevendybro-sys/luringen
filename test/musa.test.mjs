// Musa (maze): the generator gives a perfect maze (every cell reachable, no loops, walls agree on
// both sides), so the cheese can always be reached and there is exactly one way; the same seed gives
// the same maze; a swipe runs along the corridor to the next crossing; the trail of crumbs is the
// way from the start. Loads rusj/spill/musa/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/musa/spill.js"), "utf8"), kontekst);
const { Labyrint, RETNINGER, STORRELSER } = kontekst.window.Musa;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every passage once (from the cell above or to the left).
function passasjer(lab) {
  let n = 0;
  for (let c = 0; c < lab.celler.length; c++) {
    if (lab.celler[c] & 2) n++;
    if (lab.celler[c] & 4) n++;
  }
  return n;
}

test("the four sizes are square and grow", () => {
  assert.deepEqual(Array.from(STORRELSER), [5, 7, 10, 14]);
});

test("every maze is perfect: walls agree, nothing opens to the outside, all cells reachable, no loops", () => {
  for (const str of STORRELSER)
    for (let fro = 1; fro <= 400; fro++) {
      const lab = Labyrint.lag(str, str, rng(fro * 977 + str));
      const { b, h, celler } = lab;
      assert.equal(celler.length, b * h);
      for (let c = 0; c < celler.length; c++) {
        const x = c % b;
        const y = Math.floor(c / b);
        assert.ok(celler[c] > 0, `cell ${c} is closed on all sides`);
        if (y === 0) assert.equal(celler[c] & 1, 0, "open to the outside at the top");
        if (y === h - 1) assert.equal(celler[c] & 4, 0, "open to the outside at the bottom");
        if (x === 0) assert.equal(celler[c] & 8, 0, "open to the outside on the left");
        if (x === b - 1) assert.equal(celler[c] & 2, 0, "open to the outside on the right");
        if (x < b - 1) assert.equal(!!(celler[c] & 2), !!(celler[c + 1] & 8), "the two sides of a wall disagree");
        if (y < h - 1) assert.equal(!!(celler[c] & 4), !!(celler[c + b] & 1), "the two sides of a wall disagree");
      }
      // A spanning tree: connected with exactly cells − 1 passages, so there is no loop.
      const avst = Labyrint.avstander(lab, 0);
      assert.ok(avst.every((d) => d >= 0), `str ${str} fro ${fro}: a cell cannot be reached`);
      assert.equal(passasjer(lab), b * h - 1, `str ${str} fro ${fro}: not a tree`);
      // The cheese can always be reached, and the way found is a real walk.
      const vei = Labyrint.vei(lab, 0, b * h - 1);
      assert.equal(vei.length, avst[b * h - 1]);
      let c = 0;
      for (const m of vei) {
        assert.ok(Labyrint.retning(lab, c, m), "the way goes through a wall");
        c = m;
      }
      assert.equal(c, b * h - 1);
    }
});

test("the same seed gives the same maze; another seed another", () => {
  const a = Labyrint.lag(10, 10, rng(42));
  const b = Labyrint.lag(10, 10, rng(42));
  const c = Labyrint.lag(10, 10, rng(43));
  assert.deepEqual(Array.from(a.celler), Array.from(b.celler));
  assert.notDeepEqual(Array.from(a.celler), Array.from(c.celler));
});

test("mazes differ: a thousand seeds give (almost) a thousand mazes", () => {
  const sett = new Set();
  for (let fro = 0; fro < 1000; fro++) sett.add(Labyrint.lag(7, 7, rng(fro)).celler.join(""));
  assert.ok(sett.size >= 995, `${sett.size} different`);
});

test("a step goes through openings only", () => {
  // 2 × 2 by hand: 0 ─ 1
  //                     │
  //                2 ─ 3
  const lab = { b: 2, h: 2, celler: [2, 8 | 4, 2, 8 | 1] };
  assert.equal(Labyrint.steg(lab, 0, "hoyre"), 1);
  assert.equal(Labyrint.steg(lab, 0, "ned"), -1);
  assert.equal(Labyrint.steg(lab, 1, "ned"), 3);
  assert.equal(Labyrint.steg(lab, 3, "venstre"), 2);
  assert.equal(Labyrint.steg(lab, 2, "opp"), -1);
  assert.equal(Labyrint.retning(lab, 1, 3), "ned");
  assert.equal(Labyrint.retning(lab, 0, 2), null);
  assert.deepEqual(Array.from(Labyrint.vei(lab, 0, 2)), [1, 3, 2]);
  assert.deepEqual(Array.from(Labyrint.vei(lab, 2, 2)), []);
});

test("a swipe runs along the corridor, round the corners, and stops at a crossing, a dead end or the cheese", () => {
  // 3 × 3:  0 ─ 1 ─ 2
  //                 │
  //         3 ─ 4 ─ 5
  //         │
  //         6 ─ 7 ─ 8      (cell 4 also opens down? no: a pure snake)
  const lab = { b: 3, h: 3, celler: [2, 2 | 8, 8 | 4, 2 | 4, 2 | 8, 1 | 8, 1 | 2, 2 | 8, 8] };
  // From the start the whole snake is one corridor: the mouse runs all the way to the cheese.
  assert.deepEqual(Array.from(Labyrint.glid(lab, 0, "hoyre", 8)), [1, 2, 5, 4, 3, 6, 7, 8]);
  // It stops at the goal even if the corridor went on.
  assert.deepEqual(Array.from(Labyrint.glid(lab, 0, "hoyre", 4)), [1, 2, 5, 4]);
  // Behind a wall nothing happens.
  assert.deepEqual(Array.from(Labyrint.glid(lab, 0, "ned", 8)), []);
  // Backwards from the middle: back to the dead end at the start.
  assert.deepEqual(Array.from(Labyrint.glid(lab, 4, "hoyre", 8)), [5, 2, 1, 0]);

  // A crossing: 4 opens to all four sides in a plus shape.
  const pluss = { b: 3, h: 3, celler: [0, 4, 0, 2, 15, 8, 0, 1, 0] };
  assert.deepEqual(Array.from(Labyrint.glid(pluss, 3, "hoyre", 8)), [4]);
  assert.deepEqual(Array.from(Labyrint.glid(pluss, 4, "opp", 8)), [1]);
});

test("every swipe in a generated maze is a walk through openings that ends where a choice is", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const lab = Labyrint.lag(10, 10, rng(fro));
    const mal = 99;
    for (let c = 0; c < 100; c += 7)
      for (const r of Object.keys(RETNINGER)) {
        const vei = Labyrint.glid(lab, c, r, mal);
        if (Labyrint.steg(lab, c, r) < 0) {
          assert.equal(vei.length, 0);
          continue;
        }
        let a = c;
        for (const m of vei) {
          assert.ok(Labyrint.retning(lab, a, m));
          a = m;
        }
        const slutt = vei[vei.length - 1];
        assert.ok(slutt === mal || Labyrint.utganger(lab, slutt) !== 2, "the run stopped in the middle of a corridor");
        assert.equal(new Set(vei).size, vei.length, "the run went in a circle");
      }
  }
});

test("the crumbs are always the way from the start to the mouse, also after going back", () => {
  for (let fro = 1; fro <= 100; fro++) {
    const r = rng(fro);
    const lab = Labyrint.lag(7, 7, r);
    const spor = [0];
    let pos = 0;
    for (let i = 0; i < 300; i++) {
      const apne = Object.keys(RETNINGER).filter((x) => Labyrint.steg(lab, pos, x) >= 0);
      pos = Labyrint.steg(lab, pos, apne[Math.floor(r() * apne.length)]);
      Labyrint.spor(spor, pos);
      assert.deepEqual(spor, [0, ...Labyrint.vei(lab, 0, pos)]);
    }
  }
});
