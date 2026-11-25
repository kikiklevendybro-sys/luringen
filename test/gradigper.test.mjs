// Grådigper (Ett kort til?): the rules as pure functions in rusj/spill/gradigper/spill.js, loaded in
// node:vm without the kit (window.RusjGradigper). The pack (as many of each number as the number,
// one zero, ten bonus cards); what a row is worth; the deal; every outcome of «Ett til» (a new
// number, two alike, the cheek pouch, a bonus card, seven different); «Stopp»; whose turn it is;
// counting a round and reaching the target; who begins; a seat that leaves (on the net); saved games
// that cannot be drawn; and whole games with a seeded pack where no card is ever lost or made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KILDE = readFileSync(join(ROT, "rusj/spill/gradigper/spill.js"), "utf8");
const window = {};
vm.runInNewContext(KILDE, { window, console });
const G = window.RusjGradigper;
const j = (x) => JSON.parse(JSON.stringify(x));
const sum = (l) => l.reduce((a, b) => a + b, 0);
const rng = (fro) => {
  let a = fro >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// A «chance» that makes the next card drawn this one.
const neste = (sp, kort) => () => {
  const i = sp.bunke.indexOf(kort);
  assert.ok(i >= 0, `${kort} is not in the pack`);
  return (i + 0.5) / sp.bunke.length;
};
const trekk = (sp, kort) => j(G.trekk(sp, neste(sp, kort)));
// A game where the rows are what the test says (the rest of the pack is left as dealt).
function bord(rader, o = {}) {
  const sp = G.start({ antall: rader.length, mal: o.mal || 200, forste: o.forste || 0 }, rng(o.fro || 7));
  sp.rader = rader.map((r) => r.slice());
  sp.bunke = G.kortstokk();
  for (const k of rader.flat()) sp.bunke.splice(sp.bunke.indexOf(k), 1);
  if (o.tur != null) sp.tur = o.tur;
  return sp;
}

test("the pack: one 0, as many of each number as the number itself, and ten bonus cards – 89 in all", () => {
  const k = j(G.kortstokk());
  assert.equal(k.length, 89);
  assert.equal(k.filter((x) => x === 0).length, 1);
  for (let n = 1; n <= 12; n++) assert.equal(k.filter((x) => x === n).length, n, `${n}`);
  assert.equal(k.filter((x) => typeof x === "number").length, 79);
  assert.deepEqual(k.filter((x) => typeof x === "string").sort(), ["+3", "+3", "+3", "+5", "+5", "+7", "kp", "kp", "kp", "x2"]);
  assert.ok(k.every(G.erKort));
  for (const x of [13, -1, 1.5, "+4", "x3", "", null, undefined, "12"]) assert.equal(G.erKort(x), false, String(x));
  assert.notEqual(G.kortstokk(), G.kortstokk(), "a fresh pack every time");
});

test("what a row is worth: the numbers, doubled by «x2», plus the treats, plus 15 for seven different", () => {
  const p = (rad) => G.poeng(rad);
  assert.equal(p([]), 0);
  assert.equal(p([0]), 0);
  assert.equal(p([12, 7, 3]), 22);
  assert.equal(p([12, 7, 3, "+5"]), 27);
  assert.equal(p([12, 7, 3, "x2"]), 44);
  assert.equal(p(["x2", 12, "+5", 7, 3, "+3"]), 52, "the treats are not doubled, and the order does not matter");
  assert.equal(p(["+7", "+3"]), 10, "treats alone count");
  assert.equal(p(["kp", 4]), 4, "the cheek pouch is worth nothing");
  assert.equal(p([1, 2, 3, 4, 5, 6]), 21);
  assert.equal(p([1, 2, 3, 4, 5, 6, 7]), 28 + 15);
  assert.equal(p([0, 1, 2, 3, 4, 5, 6]), 21 + 15, "the zero is one of the seven");
  assert.equal(p([0, 1, 2, 3, 4, 5, 6, "x2", "+7"]), 42 + 7 + 15, "the bonus for seven is not doubled");
  assert.equal(G.ulike([3, 7, "+5", "kp", 12]), 3);
  assert.equal(G.SJU, 7);
  assert.equal(G.SJU_BONUS, 15);
});

test("a new game: 2–8 players, a target of 100 or 200, one card each from a fresh pack", () => {
  for (let n = 2; n <= 8; n++) {
    const sp = G.start({ antall: n, mal: 200 }, rng(n));
    assert.equal(sp.antall, n);
    assert.ok(sp.rader.every((r) => r.length === 1));
    assert.equal(sp.bunke.length, 89 - n);
    assert.deepEqual(j([...sp.bunke, ...sp.rader.flat()]).map(String).sort(), j(G.kortstokk()).map(String).sort(), "the cards on the table and in the pack are the whole pack");
    assert.deepEqual([sp.runde, sp.tur, sp.starter, sp.fase, sp.steg, sp.slutt, sp.ferdig, sp.sju], [0, 0, 0, "spill", 1, false, false, -1]);
    assert.ok(sp.status.every((s) => s === "med") && sp.sum.every((p) => p === 0));
    assert.ok(G.gyldig(j(sp)));
  }
  assert.equal(G.start({ antall: 1 }, rng(1)).antall, 2);
  assert.equal(G.start({ antall: 30 }, rng(1)).antall, 8);
  assert.equal(G.start({ antall: 3, mal: 100 }, rng(1)).mal, 100);
  assert.equal(G.start({ antall: 3, mal: 150 }, rng(1)).mal, 200);
  assert.equal(G.start({ antall: 3, forste: 2 }, rng(1)).tur, 2, "the one who begins can be another seat");
  assert.equal(G.start({ antall: 3, forste: 7 }, rng(1)).tur, 1);
  // The same chance gives the same deal; another chance another deal
  assert.deepEqual(j(G.start({ antall: 5 }, rng(42)).rader), j(G.start({ antall: 5 }, rng(42)).rader));
  assert.notDeepEqual(j(G.start({ antall: 8 }, rng(42)).rader), j(G.start({ antall: 8 }, rng(43)).rader));
});

test("«Ett til»: a new number lies down and the turn passes on", () => {
  const sp = bord([[3, 7], [5], [12]]);
  const steg = sp.steg;
  assert.deepEqual(trekk(sp, 9), { i: 0, kort: 9, hva: "tall" });
  assert.deepEqual(j(sp.rader[0]), [3, 7, 9]);
  assert.deepEqual([sp.tur, sp.steg, sp.fase, sp.status[0]], [1, steg + 1, "spill", "med"]);
  assert.equal(sp.bunke.includes(9) && sp.bunke.filter((k) => k === 9).length, 8, "the card left the pack");
  assert.deepEqual(trekk(sp, 0), { i: 1, kort: 0, hva: "tall" });
  assert.equal(sp.tur, 2);
});

test("two alike: the round's points are gone, the seat draws no more – unless a cheek pouch swallows the card", () => {
  const sp = bord([[3, 7], [5, "kp"], [12]]);
  assert.deepEqual(trekk(sp, 7), { i: 0, kort: 7, hva: "like" });
  assert.deepEqual([sp.status[0], sp.like[0], sp.tur], ["ute", 7, 1]);
  assert.deepEqual(j(sp.rader[0]), [3, 7], "the row lies as it was");
  // The pouch: the number and the pouch both leave the table, the seat is still in
  assert.deepEqual(trekk(sp, 5), { i: 1, kort: 5, hva: "reddet" });
  assert.deepEqual(j(sp.rader[1]), [5]);
  assert.deepEqual([sp.status[1], sp.like[1], sp.tur], ["med", null, 2]);
  assert.ok(!sp.bunke.includes("kp") || sp.bunke.filter((k) => k === "kp").length === 2);
  G.stopp(sp); // C
  assert.equal(sp.tur, 1, "past the seat that lost the round");
  // … and the pouch saves once only
  assert.deepEqual(trekk(sp, 5), { i: 1, kort: 5, hva: "like" });
  assert.equal(sp.fase, "ferdig");
  assert.deepEqual(j(sp.logg[0].pluss), [0, 0, 12]);
  assert.deepEqual(j(sp.sum), [0, 0, 12]);
  // Two pouches save twice
  const to = bord([[4, "kp", "kp"], [1]]);
  assert.equal(trekk(to, 4).hva, "reddet");
  G.stopp(to);
  assert.equal(trekk(to, 4).hva, "reddet");
  assert.deepEqual(j(to.rader[0]), [4]);
  assert.equal(trekk(to, 4).hva, "like");
});

test("bonus cards lie down like numbers, never end a round and never count as one of the seven", () => {
  const sp = bord([[0, 1, 2, 3, 4, 5], [9]]);
  for (const k of ["+3", "x2", "kp", "+7"]) {
    sp.tur = 0;
    assert.deepEqual(trekk(sp, k), { i: 0, kort: k, hva: "bonus" });
    assert.equal(sp.fase, "spill");
  }
  assert.equal(G.ulike(sp.rader[0]), 6);
  assert.equal(G.poeng(sp.rader[0]), 15 * 2 + 10);
});

test("seven different numbers end the round at once: 15 extra, and everyone still in keeps their points", () => {
  const sp = bord([[0, 1, 2, 4, 6, 8], [11, "+3"], [5, 5], [9]], { tur: 0 });
  sp.status[2] = "ute";
  sp.status[3] = "stopp";
  assert.deepEqual(trekk(sp, 10), { i: 0, kort: 10, hva: "sju" });
  assert.deepEqual([sp.fase, sp.sju], ["ferdig", 0]);
  assert.deepEqual(j(sp.logg[0]), { pluss: [31 + 15, 14, 0, 9], status: ["med", "med", "ute", "stopp"], sju: 0 });
  assert.deepEqual(j(sp.sum), [46, 14, 0, 9]);
  assert.equal(G.trekk(sp, rng(1)), null, "no more cards this round");
  assert.equal(G.stopp(sp), null);
  // A seventh number that is one it already has is two alike, not seven
  const b = bord([[0, 1, 2, 4, 6, 8], [3]]);
  assert.equal(trekk(b, 8).hva, "like");
  assert.equal(b.sju, -1);
});

test("«Stopp» keeps the points; the last one in plays on alone; the round is counted when nobody draws", () => {
  const sp = bord([[10, 4], [6], [2, "+5"]]);
  assert.deepEqual(j(G.stopp(sp)), { i: 0, kort: null, hva: "stopp" });
  assert.deepEqual([sp.status[0], sp.tur, sp.fase], ["stopp", 1, "spill"]);
  G.stopp(sp);
  assert.equal(sp.tur, 2);
  assert.equal(trekk(sp, 8).hva, "tall");
  assert.equal(sp.tur, 2, "alone: the turn comes straight back");
  assert.equal(trekk(sp, 1).hva, "tall");
  assert.ok(G.paTur(sp));
  G.stopp(sp);
  assert.equal(sp.fase, "ferdig");
  assert.ok(!G.paTur(sp));
  assert.deepEqual(j(sp.logg[0].pluss), [14, 6, 16]);
  assert.deepEqual(j(sp.sum), [14, 6, 16]);
  assert.equal(sp.slutt, false);
});

test("the target: the round is played out, then the game is over – most points wins, level points share", () => {
  const sp = bord([[12], [5], [4]], { mal: 100 });
  sp.sum = [90, 96, 20];
  G.stopp(sp); // A: 102 – the round goes on
  assert.deepEqual([sp.fase, sp.slutt, sp.tur], ["spill", false, 1]);
  assert.equal(trekk(sp, 11).hva, "tall"); // B: 16 so far
  G.stopp(sp); // C
  G.stopp(sp); // B
  assert.deepEqual([sp.fase, sp.slutt], ["ferdig", true]);
  assert.deepEqual(j(sp.sum), [102, 112, 24]);
  assert.equal(G.nesteRunde(sp, rng(1)), false, "no more rounds");
  G.kaar(sp);
  assert.deepEqual([sp.ferdig, j(sp.vinnere)], [true, [1]], "the most points, not the first past the target");
  // Level at the top
  const likt = bord([[8], [8]], { mal: 100 });
  likt.sum = [95, 95];
  G.stopp(likt);
  G.stopp(likt);
  G.kaar(likt);
  assert.deepEqual(j(likt.vinnere), [0, 1]);
  // Nobody has a point (the game was ended early)
  const tomt = bord([[8], [8]]);
  G.kaar(tomt);
  assert.deepEqual(j(tomt.vinnere), []);
  // Below the target the game goes on
  const videre = bord([[8], [8]], { mal: 100 });
  G.stopp(videre);
  G.stopp(videre);
  assert.equal(videre.slutt, false);
  assert.equal(G.nesteRunde(videre, rng(3)), true);
});

test("the next round: a fresh pack, one card each, and the next seat begins", () => {
  const sp = G.start({ antall: 3, mal: 200 }, rng(5));
  assert.equal(G.nesteRunde(sp, rng(6)), false, "not in the middle of a round");
  for (let r = 0; r < 7; r++) {
    assert.deepEqual([sp.runde, sp.starter, sp.tur], [r, r % 3, r % 3]);
    assert.equal(sp.bunke.length, 86);
    assert.ok(sp.rader.every((x) => x.length === 1) && sp.status.every((s) => s === "med") && sp.like.every((k) => k === null));
    for (let k = 0; k < 3; k++) G.stopp(sp);
    assert.equal(sp.fase, "ferdig");
    assert.equal(sp.logg.length, r + 1);
    if (sp.slutt) break;
    const steg = sp.steg;
    assert.equal(G.nesteRunde(sp, rng(100 + r)), true);
    assert.equal(sp.steg, steg + 1);
  }
  const n = G.start({ antall: 4, forste: 3 }, rng(1));
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => G.starterFor(n, r)), [3, 0, 1, 2, 3]);
});

test("a seat that leaves (on the net): its cards go, it is skipped and not ranked; under two the match is over", () => {
  // It leaves on its own turn: the turn passes on
  const sp = bord([[10, 4], [6], [2]], { tur: 1 });
  sp.sum = [30, 80, 10];
  assert.equal(G.forlat(sp, 1), true);
  assert.deepEqual([sp.status[1], j(sp.rader[1]), sp.tur, j(sp.ute)], ["borte", [], 2, [1]]);
  assert.equal(G.forlat(sp, 1), false, "it can only leave once");
  for (const feil of [-1, 3, 1.5, "0", null]) assert.equal(G.forlat(sp, feil), false, String(feil));
  G.stopp(sp); // C
  assert.equal(sp.tur, 0, "past the empty seat");
  G.stopp(sp); // A
  assert.deepEqual([sp.fase, j(sp.logg[0].pluss)], ["ferdig", [14, 0, 2]]);
  assert.deepEqual(j(sp.sum), [44, 80, 12], "the points it had stay on the sheet …");
  assert.deepEqual(j(G.inne(sp)), [0, 2]);
  G.kaar(sp);
  assert.deepEqual(j(sp.vinnere), [0], "… but it cannot win");
  // The next round is begun by the next seat still in, and nobody deals to the one who left
  const b = bord([[1], [2], [3], [4]]);
  for (let k = 0; k < 4; k++) G.stopp(b);
  G.forlat(b, 1); // between rounds: the one who would begin
  assert.equal(G.starterFor(b, 1), 2);
  G.nesteRunde(b, rng(9));
  assert.deepEqual([b.tur, b.status[1], b.rader[1].length, b.bunke.length], [2, "borte", 0, 86]);
  // A seat that had stopped leaves: its points of the round are void
  const c = bord([[10], [9], [8]]);
  G.stopp(c);
  G.forlat(c, 0);
  G.stopp(c);
  G.stopp(c);
  assert.deepEqual(j(c.logg[0].pluss), [0, 9, 8]);
  // The last one drawing leaves: the round is counted for those who stopped
  const d = bord([[10], [9], [8]]);
  G.stopp(d);
  G.stopp(d);
  G.forlat(d, 2);
  assert.deepEqual([d.fase, j(d.logg[0].pluss)], ["ferdig", [10, 9, 0]]);
  // Fewer than two left: the match is over, and the one left has the points it stopped on
  const e = bord([[10], [9], [8]]);
  G.stopp(e);
  G.forlat(e, 1);
  assert.equal(e.ferdig, false);
  G.forlat(e, 2);
  assert.deepEqual([e.ferdig, e.slutt, e.fase, j(e.vinnere), j(e.sum)], [true, true, "ferdig", [0], [10, 0, 0]]);
  assert.equal(G.forlat(e, 0), false, "nothing more happens in a finished match");
  // Two players: the one who stays wins what lies in front of it
  const f = bord([[7], [3]]);
  G.forlat(f, 0);
  assert.deepEqual([f.ferdig, j(f.vinnere), j(f.sum)], [true, [1], [0, 3]]);
});

test("the chance of two alike follows the cards left in the pack", () => {
  const sp = bord([[12], [0]]);
  assert.equal(G.risiko(sp, 0), 11 / 87, "eleven 12s left among 87 cards");
  assert.equal(G.risiko(sp, 1), 0, "there is only one zero");
  sp.rader[0] = [12, 11, 10];
  assert.equal(G.risiko(sp, 0), (11 + 11 + 10) / 87);
});

test("a saved game that cannot be drawn is refused", () => {
  const ok = () => j(bord([[3, 7, "+5"], [5], [12, "kp"]]));
  assert.ok(G.gyldig(ok()));
  const feil = [
    (s) => (s.antall = 1),
    (s) => (s.antall = 9),
    (s) => (s.mal = 150),
    (s) => (s.rader = "x"),
    (s) => s.rader.pop(),
    (s) => (s.rader[0] = [13]),
    (s) => (s.rader[0] = ["jokeren"]),
    (s) => (s.sum[0] = -1),
    (s) => (s.status[1] = "tull"),
    (s) => (s.status[0] = "stopp"), // the seat on turn must be drawing
    (s) => (s.tur = 3),
    (s) => (s.fase = "tull"),
    (s) => (s.bunke = Array(90).fill(1)),
    (s) => (s.bunke[0] = "x"),
    (s) => (s.like[0] = 99),
    (s) => (s.logg = [{ pluss: [1] }]),
    (s) => (s.siste = { i: 7, hva: "tall", kort: 1 }),
    (s) => (s.steg = -1),
    (s) => delete s.ute,
  ];
  for (const [n, f] of feil.entries()) {
    const s = ok();
    f(s);
    assert.equal(G.gyldig(s), false, `damage ${n}`);
  }
  for (const x of [null, undefined, "x", 5, [], {}]) assert.equal(G.gyldig(x), false);
});

test("whole games with a seeded pack: no card is lost or made, no row ever holds two alike, somebody wins", () => {
  let sjuere = 0;
  let reddet = 0;
  for (let fro = 1; fro <= 80; fro++) {
    const r = rng(fro);
    const antall = 2 + (fro % 7);
    const sp = G.start({ antall, mal: fro % 2 ? 100 : 200, forste: fro % antall }, r);
    // How bold each seat is: it stops when the chance of two alike is above this, or at 25–45
    // points; every third seat goes for seven different and stops only when the odds are bad.
    const mot = Array.from({ length: antall }, (_, i) => 0.08 + 0.05 * ((i + fro) % 5));
    const modig = (i) => (i + fro) % 3 === 0;
    let ute = 0; // cards that left the table (two alike, and what the pouch swallowed)
    for (let steg = 0; !sp.slutt; steg++) {
      assert.ok(steg < 20000, "the game never ends");
      if (sp.fase === "ferdig") {
        assert.equal(G.nesteRunde(sp, r), true);
        ute = 0;
        continue;
      }
      const i = sp.tur;
      assert.equal(sp.status[i], "med");
      const for_ = sp.steg;
      if (modig(i) ? G.risiko(sp, i) > 0.55 : G.risiko(sp, i) > mot[i] || G.poeng(sp.rader[i]) >= 25 + 10 * (i % 3)) assert.ok(G.stopp(sp));
      else {
        const h = G.trekk(sp, r);
        if (h.hva === "like") ute += 1;
        if (h.hva === "reddet") {
          ute += 2;
          reddet++;
        }
        if (h.hva === "sju") sjuere++;
      }
      assert.equal(sp.steg, for_ + 1, "every action is one step");
      for (const rad of sp.rader) {
        const tall = G.tallene(rad);
        assert.equal(new Set(tall).size, tall.length, "two alike in a row");
        assert.ok(tall.length <= 7);
      }
      assert.equal(sp.bunke.length + sp.rader.flat().length + ute, 89, "the cards of the round add up to the pack");
      assert.ok(G.gyldig(j(sp)));
    }
    const siste = sp.logg[sp.logg.length - 1];
    assert.deepEqual(j(sp.sum), sp.logg.reduce((s, l) => s.map((p, i) => p + l.pluss[i]), Array(antall).fill(0)), "the totals are the sum of the rounds");
    assert.ok(Math.max(...sp.sum) >= sp.mal);
    assert.ok(sp.sum.map((p, i) => p - siste.pluss[i]).every((p) => p < sp.mal), "the game ended in the round the target was reached");
    for (const l of sp.logg) l.status.forEach((s, i) => assert.ok(s !== "ute" || l.pluss[i] === 0, "two alike gives nothing"));
    G.kaar(sp);
    assert.ok(sp.vinnere.length >= 1 && sp.vinnere.every((i) => sp.sum[i] === Math.max(...sp.sum)));
  }
  assert.ok(sjuere > 0 && reddet > 0, `too little happened: ${sjuere} sevens, ${reddet} saved`);
});

test("the draw is fair: every card left is as likely as any other", () => {
  // The first card of seat 0 over many deals: a 12 twelve times as often as a 1, a bonus card 10 in 89.
  const tall = new Map();
  const N = 40000;
  const r = rng(113);
  for (let k = 0; k < N; k++) {
    const kort = G.start({ antall: 2 }, r).rader[0][0];
    tall.set(kort, (tall.get(kort) || 0) + 1);
  }
  for (let n = 1; n <= 12; n++) {
    const ventet = (N * n) / 89;
    assert.ok(Math.abs(tall.get(n) - ventet) < 5 * Math.sqrt(ventet) + 5, `${n}: ${tall.get(n)} of about ${Math.round(ventet)}`);
  }
  assert.ok(Math.abs(tall.get(0) - N / 89) < 5 * Math.sqrt(N / 89) + 5);
  const bonus = sum(["+3", "+5", "+7", "x2", "kp"].map((k) => tall.get(k) || 0));
  assert.ok(Math.abs(bonus - (N * 10) / 89) < 5 * Math.sqrt((N * 10) / 89), `bonus cards: ${bonus}`);
  // The edge of the chance (just below 1) never reaches past the end of the pack
  const sp = G.start({ antall: 2 }, rng(1));
  assert.ok(G.trekk(sp, () => 0.9999999999999999));
  assert.match(KILDE, /const tilfeldig = \(\) => R\.nyttFro\(\) \/ 4294967296;/, "on one phone the chance is the kit's real randomness");
});

test("no casino words in the game's texts", () => {
  const tekster = [KILDE, ...["tekst.en.json", "tekst.da.json", "spill.json"].map((f) => readFileSync(join(ROT, "rusj/spill/gradigper", f), "utf8"))].join("\n").toLowerCase();
  const sok = JSON.parse(readFileSync(join(ROT, "rusj/spill/gradigper/spill.json"), "utf8"));
  for (const ord of ["bust", "sjetong", "jetong", "innsats", "casino", "kasino", "blackjack", "poker chip", "croupier", "dealer", "jackpot"]) assert.ok(!new RegExp(`\\b${ord}`).test(tekster.replace(/"_om":[^\n]*/g, "")), `«${ord}» står i spillets tekster`);
  assert.ok(!/\bbank(en|s)?\b/.test(tekster.replace(/"_om":[^\n]*/g, "")), "«bank» står i spillets tekster");
  // The brand of the game that made the genre known is a search word only – never a name or a text.
  for (const felt of ["navn", "undertittel", "kort", "beskrivelse"]) for (const m of [sok, sok.i18n.en, sok.i18n.da]) assert.ok(!/flip/i.test(m[felt]), `${felt}: ${m[felt]}`);
  assert.ok(!/flip\s*(7|seven)/i.test(KILDE));
});
