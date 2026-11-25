// Lurendreieren: counting dice (wild ones), which bids are higher, the call and who loses a die,
// going out and winning, a seat that leaves mid-round, and whole games with random play.
// Loads rusj/spill/lurendreieren/spill.js without the kit (node:vm): the file then only exposes the rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/lurendreieren/spill.js"), "utf8"), kontekst);
const L = kontekst.window.RusjLurendreieren;
const somJson = (x) => JSON.parse(JSON.stringify(x));

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// The dice of a round, written out: faste([[…seat 0…], […seat 1…]]) for nyRunde.
const faste = (kast) => (sete, n) => kast[sete].slice(0, n);

test("counting: a one counts as anything when ones are wild, and only as a one when they are not", () => {
  const kast = [[1, 5, 5, 2, 6], [5, 1, 3, 3, 4], []];
  assert.equal(L.tell(kast, 5, true), 5, "three fives and two wild ones");
  assert.equal(L.tell(kast, 5, false), 3);
  assert.equal(L.tell(kast, 1, false), 2);
  assert.equal(L.tell(kast, 6, true), 3);
  assert.equal(L.tell(kast, 4, false), 1);
  assert.equal(L.tell(null, 4, true), 0);
  assert.deepEqual(somJson(L.flater(true)), [2, 3, 4, 5, 6], "with wild ones nobody bids on ones");
  assert.deepEqual(somJson(L.flater(false)), [1, 2, 3, 4, 5, 6]);
});

test("a bid must be strictly higher: more dice, or as many of a higher face – never more dice than lie on the table", () => {
  const sp = L.nytt({ antall: 2, terninger: 3, joker: true, starter: 0 });
  assert.equal(sp.fase, "ny");
  assert.equal(L.lovlig(sp, 1, 2), false, "nothing is thrown yet");
  assert.ok(L.nyRunde(sp, faste([[2, 2, 3], [4, 5, 6]])));
  assert.equal(L.total(sp), 6);
  assert.deepEqual(somJson(L.lavesteBud(sp)), { n: 1, x: 2 });
  assert.equal(L.lovlig(sp, 1, 1), false, "ones are wild: no bid on ones");
  assert.equal(L.lovlig(sp, 0, 3), false);
  assert.equal(L.lovlig(sp, 7, 3), false, "six dice on the table");
  assert.equal(L.lovlig(sp, 2.5, 3), false);
  assert.equal(L.lovlig(sp, 2, 7), false);
  assert.ok(L.by(sp, 2, 4));
  assert.equal(sp.tur, 1);
  assert.deepEqual(somJson(sp.bud), { n: 2, x: 4, av: 0 });
  assert.equal(L.lovlig(sp, 2, 4), false, "the same bid");
  assert.equal(L.lovlig(sp, 2, 3), false, "as many of a lower face");
  assert.equal(L.lovlig(sp, 1, 6), false, "fewer dice");
  assert.equal(L.lovlig(sp, 2, 5), true, "as many of a higher face");
  assert.equal(L.lovlig(sp, 3, 2), true, "more dice, any face");
  assert.deepEqual([2, 3, 4, 5, 6].map((x) => L.minste(sp, x)), [3, 3, 3, 2, 2]);
  assert.deepEqual(somJson(L.lavesteBud(sp)), { n: 2, x: 5 });
  assert.equal(L.by(sp, 2, 3), false);
  assert.equal(sp.tur, 1, "a bid that is refused changes nothing");
  // The highest bid there is: nothing is left but to call.
  assert.ok(L.by(sp, 6, 6));
  assert.equal(L.kanBy(sp), false);
  assert.equal(L.lavesteBud(sp), null);
  assert.equal(L.by(sp, 7, 2), false);
  // Six of the lower faces can still be raised to six of a higher one.
  const sp2 = L.nytt({ antall: 2, terninger: 3, joker: false, starter: 1 });
  L.nyRunde(sp2, faste([[1, 1, 1], [1, 1, 1]]));
  assert.equal(sp2.tur, 1, "the starter begins");
  assert.deepEqual(somJson(L.lavesteBud(sp2)), { n: 1, x: 1 }, "without wild ones a one is a face of its own");
  L.by(sp2, 6, 5);
  assert.deepEqual(somJson(L.lavesteBud(sp2)), { n: 6, x: 6 });
});

test("«Løgn!»: the bid held – the caller loses a die; a bluff – the bidder does; the loser begins the next round", () => {
  const sp = L.nytt({ antall: 3, terninger: 5, joker: true, starter: 0 });
  assert.equal(L.lyv(sp), false);
  L.nyRunde(sp, faste([[5, 5, 1, 2, 3], [5, 6, 6, 2, 2], [1, 4, 4, 3, 3]]));
  assert.equal(L.lyv(sp), false, "no bid to call");
  L.by(sp, 2, 6); // seat 0: a bluff of its own (none in hand) that nobody calls – but the table holds it
  L.by(sp, 5, 5); // seat 1: three fives and two ones: exactly five
  assert.equal(sp.tur, 2);
  assert.ok(L.lyv(sp));
  assert.deepEqual(somJson(sp.utfall), { type: "lyv", roper: 2, av: 1, n: 5, x: 5, antall: 5, holdt: true, taper: 2, mistet: true, ute: false });
  assert.deepEqual(somJson(sp.ant), [5, 5, 4]);
  assert.equal(sp.fase, "avslort");
  assert.equal(sp.starter, 2, "the loser begins");
  assert.equal(sp.tall[2].rop, 1);
  assert.equal(sp.tall[2].treff, 0);
  assert.equal(sp.tall[0].hjem, 0, "two sixes was true on the table (two sixes and two wild ones)");
  assert.equal(L.by(sp, 6, 6), false, "no bids during the reveal");
  assert.equal(L.lyv(sp), false);
  // Round 2: a bluff is caught, and an earlier bluff got through.
  L.nyRunde(sp, faste([[2, 2, 3, 3, 4], [2, 3, 4, 4, 6], [2, 3, 4, 6]]));
  assert.equal(sp.runde, 2);
  assert.equal(sp.tur, 2);
  assert.deepEqual(somJson(sp.kast[2]), [2, 3, 4, 6], "four dice for the one who lost one");
  L.by(sp, 3, 6); // seat 2: only two sixes lie there – nobody calls it
  L.by(sp, 4, 6); // seat 0
  assert.ok(L.lyv(sp)); // seat 1 calls
  assert.equal(sp.utfall.antall, 2);
  assert.equal(sp.utfall.holdt, false);
  assert.equal(sp.utfall.taper, 0);
  assert.deepEqual(somJson(sp.ant), [4, 5, 4]);
  assert.equal(sp.starter, 0);
  assert.deepEqual(somJson(sp.tall.map((t) => [t.rop, t.treff, t.avslort, t.hjem])), [[0, 0, 1, 0], [1, 1, 0, 0], [1, 0, 0, 1]]);
});

test("without dice you are out, the next one begins, and the last one with dice wins", () => {
  const sp = L.nytt({ antall: 3, terninger: 3, joker: false, starter: 1 });
  sp.ant = [1, 1, 2];
  L.nyRunde(sp, faste([[6], [2], [3, 3]]));
  assert.equal(sp.tur, 1);
  L.by(sp, 4, 6); // seat 1 bluffs
  assert.ok(L.lyv(sp)); // seat 2 calls
  assert.deepEqual(somJson(sp.ant), [1, 0, 2]);
  assert.equal(sp.utfall.ute, true);
  assert.deepEqual(somJson(sp.ute), [1]);
  assert.equal(sp.uteRunde[1], 1);
  assert.equal(sp.vinner, null);
  assert.equal(sp.starter, 2, "the loser is out: the next seat with dice begins");
  L.nyRunde(sp, faste([[6], [], [3, 3]]));
  assert.deepEqual(somJson(sp.kast[1]), [], "no dice for the one who is out");
  assert.equal(L.total(sp), 3);
  L.by(sp, 2, 3); // seat 2: true
  assert.equal(sp.tur, 0, "the seat without dice is skipped");
  L.lyv(sp); // seat 0 calls and is wrong
  assert.deepEqual(somJson(sp.ant), [0, 0, 2]);
  assert.equal(sp.vinner, 2);
  assert.equal(L.nyRunde(sp, faste([[], [], [1, 1]])), false, "no round after the end");
  assert.deepEqual(somJson(L.rangering(sp).map((r) => r.i)), [2, 0, 1], "the winner, then the last to go out first");
});

test("a seat that leaves: its dice stay in this round's count, the bid stands, the turn passes; gone from the next round", () => {
  const sp = L.nytt({ antall: 4, terninger: 3, joker: false, starter: 0 });
  L.nyRunde(sp, faste([[4, 4, 1], [4, 2, 2], [4, 6, 6], [5, 5, 5]]));
  L.by(sp, 3, 4); // seat 0
  assert.equal(sp.tur, 1);
  assert.ok(L.forlat(sp, 1)); // on its turn: the turn passes
  assert.equal(L.forlat(sp, 1), false, "once");
  assert.equal(sp.tur, 2);
  assert.deepEqual(somJson(sp.bud), { n: 3, x: 4, av: 0 }, "the bid stands");
  assert.deepEqual(somJson(sp.ant), [3, 0, 3, 3]);
  assert.equal(L.total(sp), 12, "its dice are still on the table this round");
  assert.equal(L.lovlig(sp, 12, 6), true);
  L.lyv(sp); // seat 2 calls: four fours with the one that left – the bid held
  assert.equal(sp.utfall.antall, 4);
  assert.equal(sp.utfall.holdt, true);
  assert.deepEqual(somJson(sp.ant), [3, 0, 2, 3]);
  // The next round: nine dice minus one, and none for the seat that left.
  L.nyRunde(sp, faste([[1, 1, 1], [9, 9, 9], [2, 2], [3, 3, 3]]));
  assert.deepEqual(somJson(sp.kast[1]), []);
  assert.equal(L.total(sp), 8);
  assert.equal(sp.tur, 2);
  // The bidder leaves, the bid is called and was a bluff: nobody has a die to lose.
  L.by(sp, 5, 3); // seat 2
  assert.equal(sp.tur, 3);
  L.forlat(sp, 2);
  assert.equal(sp.tur, 3, "not its turn: the turn stays");
  assert.ok(L.lyv(sp)); // seat 3 calls
  assert.deepEqual([sp.utfall.holdt, sp.utfall.taper, sp.utfall.mistet, sp.utfall.ute], [false, 2, false, false]);
  assert.deepEqual(somJson(sp.ant), [3, 0, 0, 3]);
  assert.equal(sp.starter, 3, "the next seat with dice after the one that left begins");
  assert.deepEqual(somJson(sp.forlot), [1, 2]);
  // During the reveal the one who was to begin leaves: one seat is left, and wins.
  L.forlat(sp, 3);
  assert.equal(sp.vinner, 0);
  assert.equal(sp.utfall.type, "lyv", "the reveal on the screen stays");
  // The last opponent leaves during the bidding: the round ends at once.
  const to = L.nytt({ antall: 2, terninger: 5, starter: 0 });
  L.nyRunde(to, faste([[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]));
  L.by(to, 2, 2);
  L.forlat(to, 1);
  assert.equal(to.vinner, 0);
  assert.equal(to.fase, "avslort");
  assert.deepEqual(somJson(to.utfall), { type: "borte", av: 1 });
  assert.deepEqual(somJson(L.rangering(to).map((r) => r.i)), [0, 1]);
});

test("a reveal to count up: only after «Løgn!» – not while the bidding goes on, and not when the others left", () => {
  const sp = L.nytt({ antall: 3, terninger: 3, joker: true, starter: 0 });
  assert.equal(L.tellbar(sp), false, "before the first round");
  L.nyRunde(sp, faste([[2, 2, 3], [4, 5, 6], [1, 6, 6]]));
  assert.equal(L.tellbar(sp), false, "the bidding");
  assert.ok(L.by(sp, 2, 2));
  assert.equal(L.tellbar(sp), false);
  assert.ok(L.lyv(sp));
  assert.equal(L.tellbar(sp), true, "every die face up, with an outcome to count to");
  assert.equal(sp.utfall.antall, 3);
  // A seat leaves during the reveal: it is still the same reveal.
  assert.ok(L.forlat(sp, 0));
  assert.equal(L.tellbar(sp), true);
  // The next round: nothing to count (the outcome is gone).
  assert.ok(L.nyRunde(sp, faste([[], [4, 5, 6], [1, 6, 6]])));
  assert.equal(sp.utfall, null);
  assert.equal(L.tellbar(sp), false);
  // The last opponent leaves during the bidding: the match is over with no dice to count.
  assert.ok(L.forlat(sp, 1));
  assert.equal(sp.fase, "avslort");
  assert.equal(sp.utfall.type, "borte");
  assert.equal(L.tellbar(sp), false);
  assert.equal(L.tellbar(null), false);
});

test("whole games with random play: one die goes per round, every bid is higher than the last, one winner", () => {
  for (let fro = 1; fro <= 60; fro++) {
    const r = rng(fro);
    const antall = 2 + Math.floor(r() * 7);
    const sp = L.nytt({ antall, terninger: r() < 0.5 ? 3 : 5, joker: r() < 0.5, starter: Math.floor(r() * antall) });
    const terning = (sete, n) => Array.from({ length: n }, () => 1 + Math.floor(r() * 6));
    let runder = 0;
    L.nyRunde(sp, terning);
    while (sp.vinner == null && runder < 200) {
      const forRunden = sp.ant.reduce((a, b) => a + b, 0);
      assert.equal(L.total(sp), forRunden);
      let sist = null;
      for (let trekk = 0; trekk < 100 && sp.fase === "bud"; trekk++) {
        const lav = L.lavesteBud(sp);
        if (sp.bud && (!lav || r() < 0.35)) {
          assert.ok(L.lyv(sp));
          break;
        }
        // The lowest bid, or a jump.
        const x = r() < 0.5 ? lav.x : L.flater(sp.joker).filter((f) => L.minste(sp, f) <= L.total(sp))[0];
        const n = Math.min(L.total(sp), Math.max(L.minste(sp, x), lav.n + (r() < 0.3 ? 1 : 0)));
        const tur = sp.tur;
        assert.ok(L.by(sp, n, x), `fro ${fro}: ${n} × ${x} after ${JSON.stringify(sist)}`);
        if (sist) assert.ok(n > sist.n || (n === sist.n && x > sist.x));
        assert.notEqual(sp.tur, tur);
        assert.ok(L.inne(sp, sp.tur));
        sist = { n, x };
      }
      assert.equal(sp.fase, "avslort", `fro ${fro}: the round never ended`);
      assert.equal(sp.ant.reduce((a, b) => a + b, 0), forRunden - 1, "exactly one die goes per round");
      assert.equal(sp.utfall.antall, L.tell(sp.kast, sp.utfall.x, sp.joker));
      runder++;
      if (sp.vinner == null) assert.ok(L.nyRunde(sp, terning));
    }
    assert.ok(sp.vinner != null, `fro ${fro}: no winner`);
    assert.deepEqual(somJson(L.igjen(sp)), [sp.vinner]);
    assert.equal(sp.ute.length, antall - 1);
    assert.equal(L.rangering(sp)[0].i, sp.vinner);
    assert.equal(new Set(L.rangering(sp).map((x) => x.i)).size, antall);
  }
});
