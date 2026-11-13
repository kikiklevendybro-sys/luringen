// Narren (Idiot): the rules (equal or higher, twos reset, tens and four alike burn, refill to three,
// pick up the pile, open then hidden table cards, the fool) and the phone players (always legal over
// many seeded games, every game ends, Vanskelig beats Lett).
// Loads rusj/spill/narren/spill.js without the kit (node:vm): only Idiot, Mobil and KORT are exposed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/narren/spill.js"), "utf8"), kontekst);
const { Idiot, Mobil } = kontekst.window.Narren;

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
// A game laid out by hand, already playing; the draw pile's next cards in `stokk` (first = drawn first).
function spill({ hender, opp, ned, bunke = [], stokk = [], tur = 0, regler = {} }) {
  const n = hender.length;
  opp = opp || hender.map(() => [null, null, null]);
  ned = ned || hender.map(() => [null, null, null]);
  const brukt = new Set([].concat(...hender, ...opp.map((a) => a.filter((k) => k != null)), ...ned.map((a) => a.filter((k) => k != null)), bunke, stokk));
  const brent = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) brent.push(k);
  const r = Idiot.nyRunde({ n, giver: n - 1, regler }, rng(1));
  Object.assign(r, { hender: hender.map((h) => h.slice()), opp: opp.map((a) => a.slice()), ned: ned.map((a) => a.slice()), bunke: bunke.slice(), stokk: stokk.slice().reverse(), brent, fase: "spill", klar: Array(n).fill(true), tur, logg: [] });
  assert.ok(Idiot.hel(r), "the laid-out game is whole");
  return r;
}

test("dealing: three hidden, three open and three on the hand each; every card once", () => {
  for (let fro = 0; fro < 200; fro++) {
    const n = 2 + (fro % 3);
    const r = Idiot.nyRunde({ n, giver: fro % n }, rng(fro));
    assert.ok(Idiot.hel(r));
    assert.equal(r.fase, "bytte");
    for (let p = 0; p < n; p++) {
      assert.equal(r.hender[p].length, 3);
      assert.equal(r.opp[p].filter((k) => k != null).length, 3);
      assert.equal(r.ned[p].filter((k) => k != null).length, 3);
    }
    assert.equal(r.stokk.length, 52 - 9 * n);
    assert.deepEqual({ ...r.regler }, { fire: true, sju: false, atter: false }, "four alike burns by default");
  }
});

test("swapping before the game, and the lowest card begins", () => {
  const r = Idiot.nyRunde({ n: 3, giver: 2 }, rng(5));
  const h = r.hender[0][0];
  const o = r.opp[0][1];
  assert.ok(Idiot.bytt(r, 0, h, o));
  assert.ok(r.hender[0].includes(o) && r.opp[0][1] === h);
  assert.ok(!Idiot.bytt(r, 0, 999, o), "a card that isn't there");
  assert.ok(!Idiot.legg(r, 0, [r.hender[0][0]]), "no playing while swapping");
  // Lay out the hands: player 1 has a three, player 2 a two (doesn't count) and a three too.
  r.hender = [[K(0, 5), K(0, 9), K(0, 12)], [K(1, 3), K(1, 11), K(1, 13)], [K(2, 2), K(2, 3), K(2, 10)]];
  r.opp = [[K(3, 4), K(3, 5), K(3, 6)], [K(3, 7), K(3, 8), K(3, 9)], [K(3, 11), K(3, 12), K(3, 13)]];
  r.ned = [[K(0, 1), K(0, 2), K(0, 3)], [K(0, 4), K(0, 6), K(0, 7)], [K(0, 8), K(0, 10), K(0, 11)]];
  const brukt = new Set([].concat(...r.hender, ...r.opp, ...r.ned));
  r.stokk = Array.from({ length: 52 }, (_, i) => i).filter((k) => !brukt.has(k));
  assert.ok(Idiot.hel(r));
  for (const p of [0, 1]) assert.ok(Idiot.ferdigBytte(r, p));
  assert.equal(r.fase, "bytte");
  assert.ok(!Idiot.ferdigBytte(r, 0), "only once");
  assert.ok(Idiot.ferdigBytte(r, 2));
  assert.equal(r.fase, "spill");
  assert.equal(r.tur, 1, "1 and 2 both hold a three; 1 comes first after the dealer (2)");
  assert.equal(Idiot.starter(Object.assign({}, r, { giver: 2 })), 1);
  assert.equal(Idiot.starter(Object.assign({}, r, { giver: 1 })), 2);
});

test("equal or higher; several equal cards at once; ace is high; refill to three", () => {
  const r = spill({ hender: [[K(0, 5), K(1, 5), K(2, 9)], [K(3, 4), K(3, 7)]], bunke: [K(1, 6)], stokk: [K(2, 12), K(3, 12)] });
  assert.ok(!Idiot.legg(r, 0, [K(0, 5)]), "five on six is too low");
  assert.ok(!Idiot.legg(r, 0, [K(2, 9), K(0, 5)]), "two ranks at once");
  assert.ok(!Idiot.legg(r, 1, [K(3, 7)]), "out of turn");
  assert.deepEqual([...Idiot.lovlige(r, 0)], [K(2, 9)]);
  assert.ok(Idiot.legg(r, 0, [K(2, 9)]));
  assert.equal(r.hender[0].length, 3, "the hand is back at three");
  assert.ok(r.hender[0].includes(K(2, 12)), "the top of the draw pile came in");
  assert.equal(r.tur, 1);
  assert.ok(!Idiot.legg(r, 1, [K(3, 7)]), "seven on nine is too low");
  assert.ok(Idiot.kanTa(r, 1));
  assert.ok(Idiot.taOpp(r, 1));
  assert.equal(r.hender[1].length, 4, "the pile went to the hand");
  assert.equal(r.bunke.length, 0);
  assert.equal(r.tur, 0);
  // Two fives at once on an empty pile
  assert.ok(Idiot.legg(r, 0, [K(0, 5), K(1, 5)]));
  assert.deepEqual([...r.bunke.slice(-2)], [K(0, 5), K(1, 5)]);
  // Ace is high: only ace, two or ten go on it
  const r2 = spill({ hender: [[K(0, 13), K(0, 2)], [K(1, 1)]], bunke: [K(2, 1)] });
  assert.ok(!Idiot.legg(r2, 0, [K(0, 13)]), "king on ace");
  assert.ok(Idiot.legg(r2, 0, [K(0, 2)]), "two on ace");
});

test("a two resets; a ten burns and the same player goes again", () => {
  const r = spill({ hender: [[K(0, 2), K(0, 10), K(0, 4), K(1, 4)], [K(1, 3), K(1, 9)]], bunke: [K(2, 13)] });
  assert.ok(Idiot.legg(r, 0, [K(0, 2)]));
  assert.equal(r.tur, 1);
  assert.ok(Idiot.passer(r, 3), "anything goes on a two");
  assert.ok(Idiot.legg(r, 1, [K(1, 3)]));
  assert.ok(Idiot.legg(r, 0, [K(0, 10)]));
  assert.equal(r.bunke.length, 0, "the pile burnt");
  assert.equal(r.brent.length >= 3, true);
  assert.equal(r.tur, 0, "the burner goes again");
  assert.ok(r.igjen);
  assert.ok(r.logg.some((h) => h.type === "brent" && h.ti));
  assert.ok(Idiot.legg(r, 0, [K(0, 4)]));
  assert.equal(r.tur, 1);
});

test("four alike in a row burn the pile (a house rule that can be off)", () => {
  const lag = (fire) => spill({ hender: [[K(0, 6), K(1, 6), K(0, 9)], [K(2, 6), K(3, 6), K(1, 9)]], bunke: [K(2, 5)], regler: { fire } });
  const r = lag(true);
  assert.ok(Idiot.legg(r, 0, [K(0, 6), K(1, 6)]));
  assert.ok(Idiot.legg(r, 1, [K(2, 6), K(3, 6)]));
  assert.equal(r.bunke.length, 0, "four sixes burn");
  assert.equal(r.tur, 1, "the one who made four alike goes again");
  const r2 = lag(false);
  assert.ok(Idiot.legg(r2, 0, [K(0, 6), K(1, 6)]));
  assert.ok(Idiot.legg(r2, 1, [K(2, 6), K(3, 6)]));
  assert.equal(r2.bunke.length, 5, "no burn with the rule off");
  assert.equal(r2.tur, 0);
});

test("house rules: the seven (next goes under) and the eight (skips)", () => {
  const r = spill({ hender: [[K(0, 7), K(0, 3)], [K(1, 9), K(1, 5), K(1, 10)]], bunke: [K(2, 4)], regler: { sju: true } });
  assert.ok(Idiot.legg(r, 0, [K(0, 7)]));
  assert.ok(!Idiot.legg(r, 1, [K(1, 9)]), "nine on seven with the seven rule");
  assert.ok(Idiot.passer(r, 10) && Idiot.passer(r, 2) && Idiot.passer(r, 7) && !Idiot.passer(r, 8));
  assert.ok(Idiot.legg(r, 1, [K(1, 5)]));
  // The eight skips the next player: with three, the third goes; two eights skip two.
  const r2 = spill({ hender: [[K(0, 8), K(1, 8), K(0, 3)], [K(1, 9), K(1, 11)], [K(2, 12), K(2, 13)]], bunke: [K(2, 4)], regler: { atter: true } });
  assert.ok(Idiot.legg(r2, 0, [K(0, 8)]));
  assert.equal(r2.tur, 2, "one eight skips one player");
  assert.ok(r2.logg.some((h) => h.type === "hopp" && h.p.includes(1)));
  const r3 = spill({ hender: [[K(0, 8), K(1, 8), K(0, 3)], [K(1, 9), K(1, 11)], [K(2, 12), K(2, 13)]], bunke: [K(2, 4)], regler: { atter: true } });
  assert.ok(Idiot.legg(r3, 0, [K(0, 8), K(1, 8)]));
  assert.equal(r3.tur, 0, "two eights skip both others");
  const r4 = spill({ hender: [[K(0, 8), K(0, 3)], [K(1, 9)]], bunke: [K(2, 4)] });
  assert.ok(Idiot.legg(r4, 0, [K(0, 8)]));
  assert.equal(r4.tur, 1, "without the rule an eight is an eight");
});

test("the open table cards after the hand, then the hidden ones blind", () => {
  const r = spill({
    hender: [[K(0, 9)], [K(1, 3), K(1, 4)]],
    opp: [[K(0, 11), K(1, 11), null], [null, null, null]],
    ned: [[K(0, 5), K(0, 12), null], [K(2, 3), null, null]],
    bunke: [K(2, 8)],
  });
  assert.equal(Idiot.kilde(r, 0), "hand");
  assert.ok(!Idiot.legg(r, 0, [K(0, 11)]), "open cards wait for the hand");
  assert.ok(Idiot.legg(r, 0, [K(0, 9)]));
  assert.equal(Idiot.kilde(r, 0), "opp");
  assert.ok(Idiot.taOpp(r, 1));
  r.bunke = [];
  r.hender[1] = [K(1, 3), K(1, 4), K(2, 8), K(0, 9)];
  assert.ok(Idiot.hel(r));
  assert.ok(Idiot.legg(r, 0, [K(0, 11), K(1, 11)]), "two open jacks at once");
  assert.deepEqual([...r.opp[0]], [null, null, null]);
  assert.equal(Idiot.kilde(r, 0), "ned");
  assert.ok(!Idiot.legg(r, 1, [K(1, 3)]), "three on jacks");
  assert.ok(Idiot.taOpp(r, 1));
  assert.ok(Idiot.blindt(r, 0));
  assert.ok(!Idiot.blind(r, 0, 2), "an empty spot");
  // Hidden queen on an empty pile: it fits
  assert.ok(Idiot.blind(r, 0, 1));
  assert.ok(r.logg[0].ok);
  assert.equal(Idiot.topp(r), K(0, 12));
  // Player 1 can't go on the queen and picks up; then the hidden five fits on the empty pile
  assert.equal(r.tur, 1);
  r.hender[1] = r.hender[1].filter((k) => k !== K(0, 9));
  r.brent.push(K(0, 9));
  assert.ok(Idiot.hel(r));
  const ingen = Idiot.lovlige(r, 1).length === 0;
  assert.ok(ingen, "nothing on a queen for player 1");
  assert.ok(Idiot.taOpp(r, 1));
  // Hidden five on an empty pile fits, and that was player 0's last card: out, and 1 is the fool
  assert.ok(Idiot.blind(r, 0, 0));
  assert.equal(r.fase, "slutt");
  assert.deepEqual([...r.ute], [0]);
  assert.equal(r.narr, 1);
});

test("a hidden card that doesn't fit: the pile and the card go to the hand", () => {
  const r = spill({ hender: [[], [K(1, 3), K(1, 4)]], ned: [[K(0, 4), K(0, 6), null], [null, null, null]], bunke: [K(2, 9), K(2, 12)] });
  assert.ok(Idiot.blind(r, 0, 0));
  assert.equal(r.logg[0].ok, false);
  assert.equal(r.hender[0].length, 3, "two from the pile and the hidden four");
  assert.equal(r.bunke.length, 0);
  assert.equal(r.tur, 1);
  assert.equal(Idiot.kilde(r, 0), "hand");
});

test("out in order; the game goes on until one has cards; the burn after the last card", () => {
  const r = spill({ hender: [[K(0, 10)], [K(1, 3)], [K(2, 4), K(2, 5)]], bunke: [K(3, 9)] });
  assert.ok(Idiot.legg(r, 0, [K(0, 10)]));
  assert.deepEqual([...r.ute], [0], "out with a burning ten");
  assert.equal(r.tur, 1, "the next one plays on the empty pile");
  assert.equal(r.fase, "spill");
  assert.ok(Idiot.legg(r, 1, [K(1, 3)]));
  assert.deepEqual([...r.ute], [0, 1]);
  assert.equal(r.fase, "slutt");
  assert.equal(r.narr, 2);
  assert.ok(!Idiot.legg(r, 2, [K(2, 4)]), "nothing after the end");
});

test("hel() refuses a broken game", () => {
  const r = Idiot.nyRunde({ n: 2, giver: 0 }, rng(3));
  assert.ok(Idiot.hel(r));
  const kopi = JSON.parse(JSON.stringify(r));
  kopi.hender[0].push(kopi.stokk[0]);
  assert.ok(!Idiot.hel(kopi), "a card twice");
  assert.ok(!Idiot.hel(Object.assign(JSON.parse(JSON.stringify(r)), { fase: "noe" })));
  assert.ok(!Idiot.hel(null));
});

// A whole game between phone players, every move checked.
function simuler(n, nivaer, fro, regler) {
  const R = rng(fro);
  const r = Idiot.nyRunde({ n, giver: fro % n, regler }, R);
  for (let p = 0; p < n; p++) {
    Mobil.bytt(r, p, nivaer[p], R);
    Idiot.ferdigBytte(r, p);
  }
  let trekk = 0;
  while (r.fase === "spill" && trekk < 5000) {
    const p = r.tur;
    const v = Mobil.velg(r, p, nivaer[p], R);
    const lov = Idiot.lovlige(r, p);
    let ok;
    if (v.type === "legg") {
      assert.ok(v.kort.every((k) => lov.includes(k)), `level ${nivaer[p]} played a card that doesn't fit`);
      ok = Idiot.legg(r, p, v.kort);
    } else if (v.type === "blind") ok = Idiot.blind(r, p, v.i);
    else {
      assert.equal(lov.length, 0, `level ${nivaer[p]} picked up the pile with a card that fits`);
      ok = Idiot.taOpp(r, p);
    }
    assert.ok(ok, `level ${nivaer[p]} made an illegal move: ${JSON.stringify(v)}`);
    assert.ok(Idiot.hel(r));
    trekk++;
  }
  return r;
}

test("the phone players only make legal moves, and every game ends", () => {
  let stopp = 0;
  let spilt = 0;
  for (let fro = 1; fro <= 240; fro++) {
    const n = 2 + (fro % 3);
    const nivaer = Array.from({ length: n }, (_, p) => 1 + ((fro + p) % 3));
    const regler = { fire: fro % 2 === 0, sju: fro % 3 === 0, atter: fro % 5 === 0 };
    const r = simuler(n, nivaer, fro, regler);
    assert.equal(r.fase, "slutt", `game ${fro} did not end`);
    assert.equal(r.ute.length + 1, n, "everybody but the fool is out");
    assert.ok(r.narr != null && !r.ute.includes(r.narr));
    if (r.logg.some((h) => h.type === "stopp")) stopp++;
    spilt++;
  }
  assert.ok(stopp <= spilt * 0.02, `too many games stopped by the safety net: ${stopp}`);
});

test("Vanskelig beats Lett, and Middels beats Lett", () => {
  const seire = (a, b) => {
    let v = 0;
    const N = 300;
    for (let fro = 1; fro <= N; fro++) {
      const forst = fro % 2;
      const nivaer = forst ? [a, b] : [b, a];
      const r = simuler(2, nivaer, 1000 + fro, {});
      const vinner = r.ute[0];
      if (nivaer[vinner] === a) v++;
    }
    return v / N;
  };
  const vl = seire(3, 1);
  const ml = seire(2, 1);
  assert.ok(vl > 0.6, `Vanskelig won only ${Math.round(vl * 100)} % against Lett`);
  assert.ok(ml > 0.55, `Middels won only ${Math.round(ml * 100)} % against Lett`);
});
