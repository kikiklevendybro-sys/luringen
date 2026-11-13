// Golfballen (card golf): points (pairs in a column count 0, the two house rule), six cards (turn two
// first, draw or take, swap or throw, the last card face up gives the others one more turn), four
// cards (look at the bottom two, new cards face down, knocking), the house rule «turn after a
// throw», and the phone players (always legal over many seeded holes, every hole ends, Vanskelig
// beats Lett). Loads rusj/spill/golfballen/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/golfballen/spill.js"), "utf8"), kontekst);
const { Golf, Mobil } = kontekst.window.Golfballen;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Card number: suit 0 spar, 1 hjerter, 2 ruter, 3 kløver; value 1 (ess) … 13 (konge).
const K = (s, v) => s * 13 + v - 1;
// A hole laid out by hand: grids (card numbers; face up where `opp` says so), the discards (top last)
// and the next cards of the draw pile (first = drawn first).
function hull({ var: v = "seks", nett, opp, kast = [], stokk = [], tur = 0, regler = {}, klar = true }) {
  const n = nett.length;
  const brukt = new Set([].concat(...nett, kast, stokk));
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  const r = Golf.nyRunde({ n, var: v, regler, giver: n - 1 }, rng(1));
  Object.assign(r, {
    rutenett: nett.map((g, p) => g.map((k, i) => ({ k, opp: !!(opp && opp[p] && opp[p][i]) }))),
    stokk: rest.concat(stokk.slice().reverse()),
    kast: kast.slice(),
    tur,
    startSnudd: Array(n).fill(klar ? 2 : 0),
    tittet: Array(n).fill(klar),
  });
  r.kjent = r.rutenett.map((g) => g.map((c) => c.opp));
  assert.ok(Golf.hel(r), "the laid-out hole is whole");
  return r;
}

test("points: ace 1, two −2 (or 2), jack and queen 10, king 0; a pair in a column counts 0", () => {
  const R0 = { toer: true };
  assert.equal(Golf.verdi(K(0, 1), R0), 1);
  assert.equal(Golf.verdi(K(1, 2), R0), -2);
  assert.equal(Golf.verdi(K(1, 2), { toer: false }), 2);
  assert.equal(Golf.verdi(K(2, 7), R0), 7);
  assert.equal(Golf.verdi(K(2, 11), R0), 10);
  assert.equal(Golf.verdi(K(2, 12), R0), 10);
  assert.equal(Golf.verdi(K(3, 13), R0), 0);
  // Columns: (0,3) (1,4) (2,5). A pair of sevens and a pair of twos count 0.
  const g = [K(0, 7), K(0, 2), K(0, 12), K(1, 7), K(1, 2), K(1, 1)].map((k) => ({ k, opp: true }));
  assert.equal(Golf.poengFor(g, 3, R0, true), 0 + 0 + 10 + 1);
  // Face up only: a hidden card doesn't count, and a pair needs both face up
  const g2 = g.map((c, i) => ({ k: c.k, opp: i !== 3 }));
  assert.equal(Golf.poengFor(g2, 3, R0, false), 7 + 0 + 11);
  // Four cards: columns (0,2) (1,3)
  const g4 = [K(0, 13), K(0, 5), K(1, 13), K(1, 9)].map((k) => ({ k, opp: true }));
  assert.equal(Golf.poengFor(g4, 2, R0, true), 0 + 14);
});

test("dealing: six or four cards each, all face down, one card on the discards", () => {
  for (let fro = 0; fro < 120; fro++) {
    const n = 2 + (fro % 3);
    const v = fro % 2 ? "fire" : "seks";
    const r = Golf.nyRunde({ n, var: v, giver: fro % n }, rng(fro));
    assert.ok(Golf.hel(r));
    assert.ok(r.rutenett.every((g) => g.length === (v === "fire" ? 4 : 6) && g.every((c) => !c.opp)));
    assert.equal(r.kast.length, 1);
    assert.equal(r.tur, ((fro % n) + 1) % n);
    assert.deepEqual({ ...r.regler }, { toer: true, snu: false }, "two −2 by default, no turning");
  }
  const r = Golf.nyRunde({ n: 2, var: "fire", regler: { snu: true } }, rng(1));
  assert.equal(r.regler.snu, false, "turning after a throw is a six-card rule");
});

test("six cards: turn two first; draw, swap face up, the old card on the discards", () => {
  const r = Golf.nyRunde({ n: 2, var: "seks", giver: 1 }, rng(7));
  assert.ok(!Golf.trekk(r, 0, rng(1)), "no drawing before two are turned");
  assert.ok(!Golf.startSnu(r, 1, 0), "only in your turn");
  assert.ok(Golf.startSnu(r, 0, 0));
  assert.ok(!Golf.startSnu(r, 0, 0), "not the same card twice");
  assert.ok(Golf.startSnu(r, 0, 4));
  assert.ok(!Golf.startSnu(r, 0, 1), "only two");
  assert.ok(Golf.startKlar(r, 0));
  const topp = r.stokk[r.stokk.length - 1];
  assert.ok(Golf.trekk(r, 0, rng(1)));
  assert.equal(r.hand, topp);
  assert.ok(!Golf.trekk(r, 0, rng(1)), "one card at a time");
  assert.ok(!Golf.ta(r, 0), "no taking with a card in hand");
  const gammel = r.rutenett[0][2].k;
  assert.ok(Golf.bytt(r, 0, 2));
  assert.equal(r.rutenett[0][2].k, topp);
  assert.ok(r.rutenett[0][2].opp, "the new card lies face up");
  assert.equal(r.kast[r.kast.length - 1], gammel);
  assert.equal(r.tur, 1);
  assert.equal(r.hand, null);
});

test("taking a discard means swapping; a drawn card may be thrown away", () => {
  const r = hull({ nett: [[K(0, 1), K(0, 2), K(0, 3), K(0, 4), K(0, 5), K(0, 6)], [K(1, 1), K(1, 2), K(1, 3), K(1, 4), K(1, 5), K(1, 6)]], kast: [K(2, 9)], stokk: [K(2, 13)] });
  assert.ok(Golf.ta(r, 0));
  assert.equal(r.fra, "kast");
  assert.ok(!Golf.kast(r, 0), "a discard can't go straight back");
  assert.ok(Golf.bytt(r, 0, 0));
  assert.equal(r.kast[r.kast.length - 1], K(0, 1));
  assert.ok(Golf.trekk(r, 1, rng(1)));
  assert.equal(r.hand, K(2, 13));
  assert.ok(Golf.kast(r, 1));
  assert.equal(r.kast[r.kast.length - 1], K(2, 13));
  assert.equal(r.tur, 0);
  assert.ok(r.rutenett[1].every((c) => !c.opp), "nothing turned without the house rule");
});

test("house rule: after throwing a drawn card away, turn one of your hidden cards", () => {
  const r = hull({ nett: [[K(0, 1), K(0, 2), K(0, 3), K(0, 4), K(0, 5), K(0, 6)], [K(1, 1), K(1, 2), K(1, 3), K(1, 4), K(1, 5), K(1, 6)]], kast: [K(2, 9)], stokk: [K(2, 13)], regler: { snu: true } });
  assert.ok(Golf.trekk(r, 0, rng(1)));
  assert.ok(Golf.kast(r, 0));
  assert.ok(r.maaSnu);
  assert.equal(r.tur, 0, "the turn waits for the turned card");
  assert.ok(!Golf.trekk(r, 0, rng(1)), "no drawing while a card must be turned");
  assert.ok(Golf.snu(r, 0, 3));
  assert.ok(r.rutenett[0][3].opp && !r.maaSnu);
  assert.equal(r.tur, 1);
});

test("six cards: the last card face up gives everyone else one more turn, then the hole is counted", () => {
  const nett = [
    [K(0, 5), K(0, 13), K(0, 4), K(1, 5), K(1, 13), K(0, 9)],
    [K(2, 1), K(2, 2), K(2, 3), K(2, 4), K(2, 6), K(2, 7)],
    [K(3, 1), K(3, 2), K(3, 3), K(3, 4), K(3, 6), K(3, 7)],
  ];
  const opp = [[true, true, true, true, true, false], [true, true, false, false, false, false], [true, true, false, false, false, false]];
  const r = hull({ nett, opp, kast: [K(1, 10)], stokk: [K(1, 4), K(2, 13), K(3, 13)] });
  assert.ok(Golf.trekk(r, 0, rng(1)));
  assert.ok(Golf.bytt(r, 0, 5), "the four of hearts on the last hidden card: a pair of fours");
  assert.equal(r.slutt, 0);
  assert.equal(r.igjen, 2);
  assert.ok(r.logg.some((h) => h.type === "alleopp"));
  assert.equal(r.fase, "spill");
  assert.ok(Golf.trekk(r, 1, rng(1)));
  assert.ok(Golf.kast(r, 1));
  assert.equal(r.fase, "spill");
  assert.ok(Golf.trekk(r, 2, rng(1)));
  assert.ok(Golf.bytt(r, 2, 5));
  assert.equal(r.fase, "ferdig", "after the last of the others");
  assert.ok(r.rutenett.every((g) => g.every((c) => c.opp)), "everything is turned at the end");
  assert.equal(r.resultat[0], 0 + 0 + 0, "pairs of fives, kings and fours");
  assert.equal(r.resultat[1], 1 + 4 + -2 + 6 + 3 + 7);
  assert.equal(r.resultat[2], 1 + 4 + -2 + 6 + 3 + 0);
});

test("four cards: look at the bottom two once; new cards face down; knock to end", () => {
  const r = Golf.nyRunde({ n: 2, var: "fire", giver: 1 }, rng(3));
  assert.ok(!Golf.trekk(r, 0, rng(1)), "look first");
  assert.ok(!Golf.bank(r, 0), "and no knocking before that");
  assert.ok(Golf.titt(r, 0));
  assert.deepEqual([...r.kjent[0]], [false, false, true, true]);
  assert.ok(!Golf.titt(r, 0), "only once");
  assert.ok(Golf.trekk(r, 0, rng(1)));
  const k = r.hand;
  assert.ok(Golf.bytt(r, 0, 1));
  assert.equal(r.rutenett[0][1].k, k);
  assert.equal(r.rutenett[0][1].opp, false, "the new card goes face down");
  assert.ok(r.kjent[0][1], "but you know it");
  assert.ok(!r.offentlig[0][1], "the others don't");
  assert.ok(Golf.titt(r, 1));
  assert.ok(Golf.ta(r, 1));
  assert.ok(Golf.bytt(r, 1, 0));
  assert.ok(r.offentlig[1][0], "a card from the discards is known to all");
  assert.ok(Golf.bank(r, 0));
  assert.equal(r.slutt, 0);
  assert.equal(r.tur, 1);
  assert.ok(!Golf.bank(r, 1), "only one knock");
  assert.ok(Golf.trekk(r, 1, rng(1)));
  assert.ok(Golf.kast(r, 1));
  assert.equal(r.fase, "ferdig");
  assert.equal(r.resultat.length, 2);
  assert.equal(r.resultat[0], Golf.poeng(r, 0, true));
});

test("an empty draw pile is made from the discards; a hole nobody ends stops by itself", () => {
  const r = hull({ nett: [[K(0, 1), K(0, 2), K(0, 3), K(0, 4), K(0, 5), K(0, 6)], [K(1, 1), K(1, 2), K(1, 3), K(1, 4), K(1, 5), K(1, 6)]], kast: [K(2, 9)] });
  // Everything else to the discards
  r.kast = r.stokk.concat(r.kast);
  r.stokk = [];
  assert.ok(Golf.hel(r));
  const topp = r.kast[r.kast.length - 1];
  assert.ok(Golf.trekk(r, 0, rng(2)));
  assert.equal(r.kast.length, 1);
  assert.equal(r.kast[0], topp, "the top discard stays");
  assert.ok(r.logg.some((h) => h.type === "stokket"));
  assert.ok(Golf.kast(r, 0));
  // Throwing forever: the hole stops after MAKS_TURER turns each
  for (let n = 0; n < 400 && r.fase === "spill"; n++) {
    const p = r.tur;
    assert.ok(Golf.trekk(r, p, rng(n)));
    assert.ok(Golf.kast(r, p));
  }
  assert.equal(r.fase, "ferdig");
  assert.ok(r.turer.every((t) => t >= Golf.MAKS_TURER));
});

test("hel() refuses a broken hole", () => {
  const r = Golf.nyRunde({ n: 3, var: "seks" }, rng(9));
  assert.ok(Golf.hel(r));
  const kopi = JSON.parse(JSON.stringify(r));
  kopi.kast.push(kopi.stokk[0]);
  assert.ok(!Golf.hel(kopi));
  assert.ok(!Golf.hel(Object.assign(JSON.parse(JSON.stringify(r)), { var: "sju" })));
  assert.ok(!Golf.hel(null));
});

// A whole hole between phone players, every move checked by the rules.
function simuler(n, nivaer, fro, v, regler) {
  const R = rng(fro);
  const r = Golf.nyRunde({ n, var: v, regler, giver: fro % n }, R);
  for (let steg = 0; steg < 6000 && r.fase === "spill"; steg++) {
    const p = r.tur;
    const valg = Mobil.velg(r, p, nivaer[p], R);
    assert.ok(Mobil.utfor(r, p, valg, R), `level ${nivaer[p]} made an illegal move: ${JSON.stringify(valg)} (hand ${r.hand}, maaSnu ${r.maaSnu})`);
    assert.ok(Golf.hel(r));
  }
  return r;
}

test("the phone players only make legal moves, and every hole ends", () => {
  let stopp = 0;
  let antall = 0;
  for (let fro = 1; fro <= 300; fro++) {
    const n = 2 + (fro % 3);
    const v = fro % 2 ? "fire" : "seks";
    const nivaer = Array.from({ length: n }, (_, p) => 1 + ((fro + p) % 3));
    const regler = { toer: fro % 4 !== 0, snu: fro % 3 === 0 };
    const r = simuler(n, nivaer, fro, v, regler);
    assert.equal(r.fase, "ferdig", `hole ${fro} did not end`);
    assert.equal(r.resultat.length, n);
    if (r.logg.some((h) => h.type === "stopp") || r.turer.some((t) => t >= Golf.MAKS_TURER)) stopp++;
    antall++;
  }
  assert.ok(stopp <= antall * 0.05, `too many holes stopped by the safety net: ${stopp}`);
});

test("Vanskelig beats Lett, and Middels beats Lett, over nine holes", () => {
  const vinn = (a, b, v) => {
    let seire = 0;
    const N = 60;
    for (let kamp = 0; kamp < N; kamp++) {
      const nivaer = kamp % 2 ? [a, b] : [b, a];
      const sum = [0, 0];
      for (let h = 0; h < 9; h++) {
        const r = simuler(2, nivaer, 5000 + kamp * 9 + h, v, {});
        sum[0] += r.resultat[0];
        sum[1] += r.resultat[1];
      }
      const meg = nivaer[0] === a ? 0 : 1;
      if (sum[meg] < sum[1 - meg]) seire++;
    }
    return seire / N;
  };
  for (const v of ["seks", "fire"]) {
    const vl = vinn(3, 1, v);
    const ml = vinn(2, 1, v);
    assert.ok(vl > 0.65, `${v}: Vanskelig won only ${Math.round(vl * 100)} % against Lett`);
    assert.ok(ml > 0.6, `${v}: Middels won only ${Math.round(ml * 100)} % against Lett`);
  }
  // Six cards: Vanskelig also beats Middels (four cards is mostly memory, where both are perfect).
  const vm6 = vinn(3, 2, "seks");
  assert.ok(vm6 > 0.55, `Vanskelig won only ${Math.round(vm6 * 100)} % against Middels with six cards`);
});
