// Vri åtter: the rules (follow colour or value, the eight changes the colour, draw up to three,
// pass, end of the round, points) and the phone players (always legal, Vanskelig beats Lett).
// Loads rusj/spill/vriatter/spill.js without the kit (node:vm): only Vri, Mobil and KORT are exposed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/vriatter/spill.js"), "utf8"), kontekst);
const { Vri, Mobil } = kontekst.window.VriAtter;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const K = (s, v) => s * 13 + v - 1; // 0 spar, 1 hjerter, 2 ruter, 3 kløver
// A round laid out by hand: the draw pile's next cards in `stokk` (first = drawn first).
function runde({ hender, bunke, stokk = [], sort, tur = 0, toer = false }) {
  const brukt = new Set([].concat(...hender, bunke, stokk));
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  const r = Vri.nyRunde({ n: hender.length, start: 0, toer }, rng(1));
  Object.assign(r, { hender: hender.map((h) => h.slice()), bunke: bunke.slice(), stokk: rest.concat(stokk.slice().reverse()), tur });
  r.sort = sort != null ? sort : Vri.sortAv(bunke[bunke.length - 1]);
  r.mangler = hender.map(() => []);
  assert.ok(Vri.hel(r));
  return r;
}

test("dealing: five cards each, seven with two players, never an eight to start", () => {
  for (let fro = 0; fro < 300; fro++) {
    const n = 2 + (fro % 3);
    const r = Vri.nyRunde({ n, start: fro }, rng(fro));
    assert.ok(Vri.hel(r));
    assert.ok(r.hender.every((h) => h.length === (n === 2 ? 7 : 5)));
    assert.notEqual(Vri.verdiAv(r.bunke[0]), 8);
    assert.equal(r.tur, fro % n);
  }
});

test("follow colour or value; an eight goes on anything", () => {
  const top = K(0, 5); // spar fem
  assert.ok(Vri.kanLegges(K(0, 12), top, 0), "same colour");
  assert.ok(Vri.kanLegges(K(1, 5), top, 0), "same value");
  assert.ok(Vri.kanLegges(K(3, 8), top, 0), "an eight");
  assert.ok(!Vri.kanLegges(K(1, 6), top, 0), "neither");
  const r = runde({ hender: [[K(1, 6), K(1, 5), K(2, 8)], [K(3, 1), K(3, 2)]], bunke: [top] });
  assert.deepEqual([...Vri.lovlige(r, 0)].sort(), [K(1, 5), K(2, 8)].sort());
  assert.ok(!Vri.legg(r, 0, K(1, 6), undefined, rng(2)), "an illegal card is refused");
  assert.ok(!Vri.legg(r, 1, K(3, 1), undefined, rng(2)), "out of turn is refused");
  assert.ok(!Vri.trekk(r, 0, rng(2)), "no drawing with a card that fits");
  assert.ok(Vri.legg(r, 0, K(1, 5), undefined, rng(2)));
  assert.equal(r.sort, 1);
  assert.equal(r.tur, 1);
});

test("the eight changes the colour; without a choice the round waits for it", () => {
  const r = runde({ hender: [[K(1, 8), K(2, 3)], [K(0, 6), K(2, 9)]], bunke: [K(0, 5)] });
  assert.ok(Vri.legg(r, 0, K(1, 8), undefined, rng(3)));
  assert.equal(r.venter, 0);
  assert.equal(r.tur, 0);
  assert.ok(!Vri.legg(r, 0, K(2, 3), undefined, rng(3)), "nothing else while choosing");
  assert.ok(!Vri.velgSort(r, 1, 2, rng(3)), "only the one who played the eight chooses");
  assert.ok(Vri.velgSort(r, 0, 2, rng(3)));
  assert.equal(r.sort, 2);
  assert.equal(r.tur, 1);
  assert.deepEqual([...Vri.lovlige(r, 1)], [K(2, 9)], "spar six no longer fits; ruter nine does");
  // With the colour given at once (the phone players)
  const r2 = runde({ hender: [[K(1, 8), K(2, 3)], [K(0, 6)]], bunke: [K(0, 5)] });
  assert.ok(Vri.legg(r2, 0, K(1, 8), 3, rng(3)));
  assert.equal(r2.sort, 3);
  assert.equal(r2.venter, null);
  assert.equal(r2.tur, 1);
});

test("nothing to play: draw up to three, then pass; a fitting card ends the drawing", () => {
  const r = runde({ hender: [[K(1, 3), K(2, 9)], [K(3, 1), K(3, 2)]], bunke: [K(0, 2)], stokk: [K(2, 5), K(1, 10), K(2, 7), K(0, 9)] });
  assert.ok(!Vri.kanPasse(r, 0), "no pass before drawing");
  for (let i = 0; i < 3; i++) assert.notEqual(Vri.trekk(r, 0, rng(4)), null);
  assert.equal(r.hender[0].length, 5);
  assert.equal(Vri.trekk(r, 0, rng(4)), null, "never a fourth card");
  assert.ok(Vri.kanPasse(r, 0));
  assert.ok(Vri.pass(r, 0, rng(4)));
  assert.equal(r.tur, 1);
  assert.deepEqual([...r.mangler[0]], [0], "everyone saw that spar was missing");

  const r2 = runde({ hender: [[K(1, 3)], [K(3, 1)]], bunke: [K(0, 2)], stokk: [K(2, 5), K(0, 9)] });
  Vri.trekk(r2, 0, rng(5));
  assert.ok(Vri.kanTrekke(r2, 0));
  Vri.trekk(r2, 0, rng(5));
  assert.ok(!Vri.kanTrekke(r2, 0) && !Vri.kanPasse(r2, 0), "spar nine fits: play it");
  assert.ok(Vri.legg(r2, 0, K(0, 9), undefined, rng(5)));
});

test("an empty draw pile: the discards are shuffled back, the top card stays", () => {
  const r = runde({ hender: [[K(1, 3)], [K(3, 1)]], bunke: [K(2, 2), K(2, 4), K(0, 2)] });
  const andre = r.stokk.slice();
  r.hender[1].push(...andre);
  r.stokk = [];
  assert.ok(Vri.hel(r));
  assert.notEqual(Vri.trekk(r, 0, rng(6)), null);
  assert.deepEqual([...r.bunke], [K(0, 2)]);
  assert.equal(r.stokk.length, 1);
  assert.ok(Vri.hel(r));
});

test("first with an empty hand wins the round and gets the others' cards as points", () => {
  const r = runde({ hender: [[K(1, 3)], [K(3, 8), K(3, 13), K(3, 1), K(3, 5)], [K(0, 11), K(2, 10)]], bunke: [K(1, 9)] });
  assert.ok(Vri.legg(r, 0, K(1, 3), undefined, rng(7)));
  assert.equal(r.vinner, 0);
  assert.equal(Vri.gevinst(r), 50 + 10 + 1 + 5 + 10 + 10);
  assert.ok(!Vri.legg(r, 1, K(3, 5), undefined, rng(7)), "no moves after the round");
  assert.equal(Vri.poeng(K(2, 8)), 50);
  assert.equal(Vri.poeng(K(2, 12)), 10);
  assert.equal(Vri.poeng(K(2, 1)), 1);
  assert.equal(Vri.poeng(K(2, 7)), 7);
  // An eight as the last card wins without a choice of colour
  const r2 = runde({ hender: [[K(1, 8)], [K(3, 2)]], bunke: [K(0, 4)] });
  assert.ok(Vri.legg(r2, 0, K(1, 8), undefined, rng(7)));
  assert.equal(r2.vinner, 0);
  assert.equal(r2.venter, null);
});

test("house rule «Toer»: the next player draws two and is skipped", () => {
  const r = runde({ hender: [[K(1, 2), K(1, 4)], [K(1, 5)], [K(1, 6)]], bunke: [K(1, 9)], toer: true });
  assert.ok(Vri.legg(r, 0, K(1, 2), undefined, rng(8)));
  assert.equal(r.hender[1].length, 3);
  assert.equal(r.tur, 2);
  const uten = runde({ hender: [[K(1, 2), K(1, 4)], [K(1, 5)], [K(1, 6)]], bunke: [K(1, 9)] });
  Vri.legg(uten, 0, K(1, 2), undefined, rng(8));
  assert.equal(uten.hender[1].length, 1);
  assert.equal(uten.tur, 1);
});

function spillUt(nivaer, fro, toer) {
  const t = rng(fro);
  const r = Vri.nyRunde({ n: nivaer.length, start: fro % nivaer.length, toer }, t);
  for (let g = 0; g < 3000 && r.vinner == null; g++) {
    const p = r.tur;
    const v = Mobil.velg(r, p, nivaer[p], t);
    if (v.type === "legg") {
      assert.ok(Vri.lovlige(r, p).includes(v.k), "the phone picked a card that doesn't fit");
      if (Vri.verdiAv(v.k) === 8 && r.hender[p].length > 1) assert.ok(v.sort >= 0 && v.sort <= 3);
      assert.ok(Vri.legg(r, p, v.k, v.sort, t));
    } else if (v.type === "trekk") assert.notEqual(Vri.trekk(r, p, t), null);
    else assert.ok(Vri.pass(r, p, t));
    assert.ok(Vri.hel(r));
  }
  assert.notEqual(r.vinner, null, "a round never ended");
  return r.vinner;
}

test("the phone players only make legal moves, at every level, 2–4 players, with and without «Toer»", () => {
  let n = 0;
  for (let fro = 0; fro < 600; fro++) {
    const antall = 2 + (fro % 3);
    const nivaer = Array.from({ length: antall }, (_, i) => 1 + ((fro + i) % 3));
    spillUt(nivaer, fro, fro % 2 === 1);
    n++;
  }
  assert.equal(n, 600);
});

test("Vanskelig beats Lett over a fixed set of deals", () => {
  const seire = [0, 0];
  for (let fro = 0; fro < 1000; fro++) seire[spillUt([3, 1], 5000 + fro, false)]++;
  assert.ok(seire[0] > 560, `Vanskelig vant bare ${seire[0]} av 1000`);
  const mid = [0, 0];
  for (let fro = 0; fro < 1000; fro++) mid[spillUt([2, 1], 9000 + fro, false)]++;
  assert.ok(mid[0] > 530, `Middels vant bare ${mid[0]} av 1000 mot Lett`);
});
