// Meyer: the ranking, true/false when the cup is lifted, lives, and the phone players' legality.
// Loads rusj/spill/meyer/spill.js without the kit (node:vm): the file then only exposes the rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/meyer/spill.js"), "utf8"), kontekst);
const M = kontekst.window.RusjMeyer;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ALLE = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) ALLE.push([a, b]);

// The standard order, written out by hand: Meyer, Lille Meyer, pairs 6–1, then the rest with the
// higher die first, from 65 down to 32.
const STANDARD = "21 31 66 55 44 33 22 11 65 64 63 62 61 54 53 52 51 43 42 41 32".split(" ");

test("the ranking is the standard Meyer order with 21 distinct values", () => {
  assert.deepEqual([...M.RANG], STANDARD);
  assert.equal(new Set(ALLE.map(([a, b]) => M.verdi(a, b))).size, 21);
  assert.equal(M.navn("21"), "Meyer");
  assert.equal(M.navn("31"), "Lille Meyer");
  assert.equal(M.navn("66"), "Par seksere");
  assert.equal(M.navn("65"), "65");
  assert.equal(M.verdi(1, 2), "21");
  assert.equal(M.verdi(4, 6), "64");
  assert.equal(M.verdi(1, 3), "31");
  assert.equal(M.strek("21"), "2-1");
});

test("every pair of outcomes is ordered correctly; equal values tie both ways", () => {
  const plass = (k) => STANDARD.indexOf(M.verdi(k[0], k[1]));
  for (const x of ALLE)
    for (const y of ALLE) {
      const vx = M.verdi(x[0], x[1]);
      const vy = M.verdi(y[0], y[1]);
      assert.equal(M.slar(vx, vy), plass(x) < plass(y), `${x} mot ${y}`);
      if (vx === vy) assert.ok(!M.slar(vx, vy) && !M.slar(vy, vx), `${x} og ${y} er like`);
    }
  // Meyer beats everything, Lille Meyer everything but Meyer, any pair beats 65, 32 beats nothing.
  for (const v of STANDARD) {
    if (v !== "21") assert.ok(M.slar("21", v));
    if (v !== "21" && v !== "31") assert.ok(M.slar("31", v));
    if (v !== "32") assert.ok(!M.slar("32", v));
  }
  assert.ok(M.slar("11", "65"));
  assert.ok(M.slar("41", "32"));
  assert.ok(M.slar("54", "51"));
});

test("legal announcements: strictly higher, nothing after Meyer, Fellesrunde replaces 3-2", () => {
  assert.equal(M.lovlige(null, false).length, 21);
  assert.equal(M.lovlige(null, true).length, 21); // 20 ranked + Fellesrunde
  assert.ok(!M.lovlige(null, true).includes("32") && M.lovlige(null, true).includes("F"));
  assert.deepEqual([...M.lovlige("31", false)], ["21"]);
  assert.deepEqual([...M.lovlige("31", true)], ["21", "F"]);
  assert.deepEqual([...M.lovlige("21", true)], []);
  assert.ok(!M.lovlige("54", false).includes("54"));
  assert.ok(M.lovlige("54", false).every((v) => M.slar(v, "54")));
  assert.equal(M.lovlige("11", false).length, 7);
});

test("true or bluff: the dice show at least what was said; Fellesrunde must be exactly 3-2", () => {
  assert.ok(M.erSann([6, 4], "64"));
  assert.ok(M.erSann([4, 6], "63"), "better than said is true");
  assert.ok(!M.erSann([6, 3], "64"));
  assert.ok(M.erSann([1, 2], "21") && M.erSann([2, 1], "66"));
  assert.ok(!M.erSann([3, 1], "21"));
  assert.ok(M.erSann([1, 1], "65") && !M.erSann([6, 5], "11"));
  assert.ok(M.erSann([2, 3], "F") && !M.erSann([2, 1], "F"));
  assert.ok(!M.erSann([3, 2], "41"));
  for (const k of ALLE) for (const v of STANDARD) assert.equal(M.erSann(k, v), !M.slar(v, M.verdi(k[0], k[1])));
});

function spillMed(o) {
  const sp = M.nytt(Object.assign({ antall: 3, liv: 6, felles: true }, o));
  return sp;
}

test("Løgn! both ways: wrong caller or caught bluffer loses a life and starts the next round", () => {
  // A says 64 with 6-4 (true): B calls and loses one.
  let sp = spillMed({});
  assert.ok(M.rull(sp, [6, 4]));
  assert.ok(!M.meld(sp, "32"), "3-2 is Fellesrunde when the rule is on");
  assert.ok(M.meld(sp, "64"));
  assert.equal(M.svarer(sp), 1);
  assert.ok(M.loft(sp));
  assert.deepEqual([...sp.liv], [6, 5, 6]);
  assert.equal(sp.utfall.sann, true);
  assert.equal(sp.utfall.taper, 1);
  assert.ok(M.nyRunde(sp));
  assert.equal(sp.tur, 1, "the loser starts");
  assert.equal(sp.melding, null);
  // B says 55 with 4-3 (bluff): C calls, B loses one.
  M.rull(sp, [4, 3]);
  M.meld(sp, "55");
  assert.equal(sp.tall[1].blof, 1);
  M.loft(sp);
  assert.deepEqual([...sp.liv], [6, 4, 6]);
  assert.equal(sp.utfall.sann, false);
  assert.equal(sp.tall[2].treff, 1);
  assert.equal(sp.tall[1].avslort, 1);
});

test("believing passes the cup on and the next must beat it; a believed bluff counts as «gikk hjem»", () => {
  const sp = spillMed({});
  M.rull(sp, [2, 2]);
  M.meld(sp, "33"); // bluff
  assert.ok(M.tro(sp));
  assert.equal(sp.tall[0].hjem, 1);
  assert.equal(sp.tur, 1);
  assert.equal(sp.fase, "rist");
  assert.equal(sp.kast, null);
  assert.ok(!M.meld(sp, "65"), "no announcement before rolling");
  M.rull(sp, [5, 5]);
  assert.ok(!M.meld(sp, "22"), "must beat 33");
  assert.ok(M.meld(sp, "55"));
  assert.equal(M.svarer(sp), 2);
});

test("Meyer: the loser of a lift loses two lives; «godta» costs one; nothing can be believed", () => {
  let sp = spillMed({});
  M.rull(sp, [3, 1]);
  M.meld(sp, "21"); // bluff
  assert.ok(!M.tro(sp));
  M.loft(sp);
  assert.deepEqual([...sp.liv], [4, 6, 6]);
  assert.equal(sp.utfall.tap, 2);

  sp = spillMed({});
  M.rull(sp, [2, 1]);
  M.meld(sp, "21"); // true
  M.loft(sp);
  assert.deepEqual([...sp.liv], [6, 4, 6]);

  sp = spillMed({});
  M.rull(sp, [5, 1]);
  M.meld(sp, "21");
  assert.ok(M.godta(sp));
  assert.deepEqual([...sp.liv], [6, 5, 6]);
  assert.equal(sp.tall[0].hjem, 1);
  assert.equal(sp.starter, 1);
  // godta only after Meyer
  sp = spillMed({});
  M.rull(sp, [5, 1]);
  M.meld(sp, "51");
  assert.ok(!M.godta(sp));
});

test("Fellesrunde: believed, nobody loses; lifted, it is true only on 3-2; off, 3-2 is just the lowest", () => {
  let sp = spillMed({});
  M.rull(sp, [3, 2]);
  M.meld(sp, "F");
  M.tro(sp);
  assert.equal(sp.utfall.type, "felles");
  assert.deepEqual([...sp.liv], [6, 6, 6]);
  assert.ok(M.nyRunde(sp));
  assert.equal(sp.tur, 1);

  sp = spillMed({});
  M.rull(sp, [6, 6]);
  M.meld(sp, "F");
  M.loft(sp);
  assert.deepEqual([...sp.liv], [5, 6, 6]);

  sp = spillMed({ felles: false });
  M.rull(sp, [3, 2]);
  assert.ok(!M.meld(sp, "F"));
  assert.ok(M.meld(sp, "32"));
});

test("lives: never below zero, the out are skipped, the last one standing wins (no ties)", () => {
  const sp = spillMed({ liv: 1 });
  M.rull(sp, [3, 1]);
  M.meld(sp, "21");
  M.loft(sp); // A bluffed Meyer: loses two, but only has one
  assert.deepEqual([...sp.liv], [0, 1, 1]);
  assert.deepEqual([...sp.ute], [0]);
  assert.equal(sp.vinner, null);
  assert.equal(sp.starter, 1, "next after the one who went out");
  M.nyRunde(sp);
  M.rull(sp, [6, 5]);
  M.meld(sp, "65");
  assert.equal(M.svarer(sp), 2);
  M.tro(sp);
  M.rull(sp, [1, 1]);
  M.meld(sp, "11");
  assert.equal(M.svarer(sp), 1, "A is out and skipped");
  M.loft(sp); // true: B loses
  assert.equal(sp.vinner, 2);
  assert.ok(!M.nyRunde(sp));
  const rang = M.rangering(sp).map((r) => r.i);
  assert.deepEqual([...rang], [2, 1, 0]);
});

test("phone players only ever do legal things, and whole games end with one winner", () => {
  for (const nivaa of M.NIVAER)
    for (let g = 0; g < 150; g++) {
      const rnd = rng(g * 7919 + nivaa.length);
      const antall = 2 + (g % 9);
      const sp = M.nytt({ antall, mennesker: 0, liv: g % 2 ? 6 : 3, felles: g % 3 !== 0, nivaa, starter: g % antall });
      let n = 0;
      while (sp.vinner == null) {
        assert.ok(++n < 5000, "the game never ended");
        if (sp.fase === "rist") assert.ok(M.rull(sp, [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)]));
        else if (sp.fase === "skjult") {
          const forrige = sp.melding ? sp.melding.v : null;
          const v = M.robotMelding(sp.kast, forrige, sp.felles, nivaa, rnd);
          assert.ok(M.lovlige(forrige, sp.felles).includes(v), `${nivaa}: ulovlig melding ${v} etter ${forrige}`);
          if (M.erSann(sp.kast, v) === false && M.lovlige(forrige, sp.felles).includes(sp.felles && M.verdi(...sp.kast) === "32" ? "F" : M.verdi(...sp.kast))) {
            // a bluff although the truth was legal: allowed, but never below what was rolled
            assert.ok(v === "F" || M.slar(v, M.verdi(...sp.kast)));
          }
          assert.ok(M.meld(sp, v));
        } else if (sp.fase === "svar") {
          const k = sp.kjede;
          const valg = M.robotSvar(sp.melding.v, k.length > 1 ? k[k.length - 2].v : null, sp.felles, nivaa, rnd);
          assert.ok(["tro", "loft", "godta"].includes(valg));
          if (sp.melding.v === "21") assert.notEqual(valg, "tro", "believing Meyer is impossible");
          else assert.notEqual(valg, "godta", "godta only after Meyer");
          const ok = valg === "tro" ? M.tro(sp) : valg === "godta" ? M.godta(sp) : M.loft(sp);
          assert.ok(ok);
        } else if (sp.fase === "resultat") {
          if (sp.vinner == null) assert.ok(M.nyRunde(sp));
        }
        assert.ok(sp.liv.every((l) => l >= 0 && l <= sp.maksLiv));
      }
      assert.equal(sp.liv.filter((l) => l > 0).length, 1);
      assert.equal(sp.liv[sp.vinner] > 0, true);
      assert.equal(sp.ute.length, antall - 1);
    }
});

test("the phone's doubts make sense: it lifts unlikely values more than likely ones", () => {
  for (const nivaa of ["middels", "vanskelig"]) {
    const rnd = rng(42);
    const loft = (v, forrige) => {
      let n = 0;
      for (let i = 0; i < 400; i++) if (M.robotSvar(v, forrige, true, nivaa, rnd) === "loft") n++;
      return n;
    };
    assert.ok(loft("66", "65") > loft("51", null) + 100, `${nivaa}: par seksere etter 65 bør løftes oftere enn 51 som første melding`);
    assert.ok(loft("31", "65") > loft("43", "42") + 100, `${nivaa}: Lille Meyer etter 65 bør løftes oftere enn 43 etter 42`);
    assert.ok(loft("21", "31") > 200, `${nivaa}: Meyer etter Lille Meyer bør oftest løftes`);
  }
  assert.ok(M.pMinst("32") === 1 && Math.abs(M.pMinst("21") - 2 / 36) < 1e-9);
});
