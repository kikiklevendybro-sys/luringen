// Samleren: the rules of rummy, 500 and gin rummy (melds, drawing and taking, laying off, throwing,
// going out, the points) and the phone players (only legal moves over many seeded rounds, Vanskelig
// beats Lett). Loads rusj/spill/samleren/spill.js without the kit (node:vm): only Rummy, Mobil and
// KORT are exposed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/samleren/spill.js"), "utf8"), kontekst);
const { Rummy, Mobil } = kontekst.window.Samleren;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const K = (s, v) => s * 13 + v - 1; // 0 spar, 1 hjerter, 2 ruter, 3 kløver
const sortert = (a) => [...a].sort((x, y) => x - y);
// A round laid out by hand: the stock's next cards in `stokk` (first = drawn first).
function runde({ v = "klassisk", hender, bunke, stokk = [], bord = [], fase = "trekk", tur = 0 }) {
  const brukt = new Set([].concat(...hender, bunke, stokk, ...bord.map((m) => m.kort)));
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  const r = Rummy.nyRunde({ v, n: hender.length, start: 0 }, rng(1));
  Object.assign(r, { hender: hender.map((h) => h.slice()), bunke: bunke.slice(), stokk: rest.concat(stokk.slice().reverse()), bord: bord.map((m) => ({ ...m })), tur, fase });
  r.tatte = hender.map(() => []);
  assert.ok(Rummy.hel(r), "the laid-out round is whole");
  return r;
}

test("melds: sets of 3–4, runs of 3+ in one suit; the ace is low, high too only in 500, never round the corner", () => {
  assert.equal(Rummy.meld([K(0, 5), K(1, 5), K(2, 5)], false).type, "sett");
  assert.equal(Rummy.meld([K(0, 5), K(1, 5), K(2, 5), K(3, 5)], false).type, "sett");
  assert.equal(Rummy.meld([K(0, 5), K(1, 5)], false), null, "two are not a meld");
  assert.deepEqual(Rummy.meld([K(1, 9), K(1, 7), K(1, 8)], false).kort, [K(1, 7), K(1, 8), K(1, 9)], "a run is put in order");
  assert.equal(Rummy.meld([K(1, 7), K(1, 8), K(2, 9)], false), null, "two suits");
  assert.equal(Rummy.meld([K(1, 7), K(1, 8), K(1, 10)], false), null, "a gap");
  assert.equal(Rummy.meld([K(2, 1), K(2, 2), K(2, 3)], false).hoy, false, "A-2-3");
  assert.equal(Rummy.meld([K(2, 12), K(2, 13), K(2, 1)], false), null, "Q-K-A is not a run in classic rummy");
  assert.equal(Rummy.meld([K(2, 12), K(2, 13), K(2, 1)], true).hoy, true, "Q-K-A is a run in 500");
  assert.equal(Rummy.meld([K(2, 13), K(2, 1), K(2, 2)], true), null, "K-A-2 never");
});

test("dealing: ten (two players) or seven in rummy, 13 or seven in 500, ten in gin; one card turned", () => {
  for (let fro = 0; fro < 60; fro++) {
    for (const [v, n, antall] of [["klassisk", 2, 10], ["klassisk", 3, 7], ["klassisk", 4, 7], ["500", 2, 13], ["500", 4, 7], ["gin", 2, 10]]) {
      const r = Rummy.nyRunde({ v, n, start: fro }, rng(fro));
      assert.ok(Rummy.hel(r));
      assert.ok(r.hender.every((h) => h.length === antall), `${v} for ${n}`);
      assert.equal(r.bunke.length, 1);
      assert.equal(r.fase, v === "gin" ? "tilbud" : "trekk");
      assert.equal(r.tur, fro % n);
    }
  }
});

test("rummy: draw, lay out, lay off on any meld, never throw back the card just taken, go out", () => {
  const r = runde({ hender: [[K(1, 7), K(1, 8), K(1, 9), K(0, 5), K(1, 5), K(2, 5), K(3, 13)], [K(3, 1), K(3, 2), K(0, 9), K(2, 12)]], bunke: [K(0, 2), K(1, 10)], stokk: [K(3, 3)] });
  assert.ok(!Rummy.legUt(r, 0, [K(1, 7), K(1, 8), K(1, 9)]), "nothing before drawing");
  assert.ok(!Rummy.kanTa(r, 0, 0), "only the top card");
  assert.ok(Rummy.ta(r, 0));
  assert.equal(r.tatt, K(1, 10));
  assert.ok(!Rummy.kast(r, 0, K(1, 10)), "the card just taken can't be thrown back");
  assert.ok(!Rummy.legUt(r, 0, [K(1, 7), K(1, 8)]), "two cards");
  assert.ok(Rummy.legUt(r, 0, [K(1, 7), K(1, 8), K(1, 9)]));
  assert.ok(Rummy.leggTil(r, 0, [K(1, 10)], 0), "hjerter ti onto the run");
  assert.deepEqual(r.bord[0].kort, [K(1, 7), K(1, 8), K(1, 9), K(1, 10)]);
  assert.ok(Rummy.legUt(r, 0, [K(0, 5), K(1, 5), K(2, 5)]));
  assert.ok(Rummy.kast(r, 0, K(3, 13)), "throwing the last card goes out");
  assert.equal(r.fase, "slutt");
  assert.equal(r.resultat.vinner, 0);
  // Ace 1, picture cards 10, the rest as shown: 1 + 2 + 9 + 10
  assert.equal(r.resultat.gevinst, 22);
  assert.deepEqual([...r.resultat.poeng], [22, 0]);
});

test("rummy: the other player lays off onto your meld; an empty stock turns the pile over, twice at most", () => {
  const r = runde({ hender: [[K(1, 7), K(1, 8), K(1, 9), K(0, 2)], [K(1, 6), K(3, 3), K(0, 12)]], bunke: [K(2, 2)], stokk: [K(3, 4), K(3, 5)] });
  assert.ok(Rummy.trekk(r, 0) === K(3, 4));
  assert.ok(Rummy.legUt(r, 0, [K(1, 7), K(1, 8), K(1, 9)]));
  assert.ok(Rummy.kast(r, 0, K(0, 2)));
  assert.equal(r.tur, 1);
  assert.ok(Rummy.trekk(r, 1) === K(3, 5));
  assert.ok(Rummy.leggTil(r, 1, [K(1, 6)], 0), "lay off onto the other player's run");
  assert.deepEqual([...r.bord[0].av], [1, 0, 0, 0]);
  // Run the stock dry: the pile turns over without being shuffled, then the round ends without a winner.
  const t = runde({ hender: [[K(0, 2), K(1, 4)], [K(2, 6), K(3, 8)]], bunke: [K(0, 13)] });
  t.stokk = [K(1, 13)];
  t.bunke = [].concat(Array.from({ length: 52 }, (_, k) => k).filter((k) => ![K(0, 2), K(1, 4), K(2, 6), K(3, 8), K(1, 13)].includes(k)));
  assert.ok(Rummy.hel(t));
  const forBunke = t.bunke.slice(0, -1);
  assert.ok(Rummy.trekk(t, 0) === K(1, 13));
  assert.ok(Rummy.kast(t, 0, K(0, 2)));
  assert.equal(t.omstokk, 1);
  assert.equal(t.bunke.length, 1);
  assert.equal(t.stokk[t.stokk.length - 1], forBunke[0], "the bottom card of the pile is now on top of the stock");
  let n = 0;
  while (t.fase !== "slutt" && n++ < 200) {
    const p = t.tur;
    assert.ok(Rummy.trekk(t, p) != null);
    assert.ok(Rummy.kast(t, p, t.hender[p].find((k) => k !== t.tatt)));
  }
  assert.equal(t.fase, "slutt");
  assert.equal(t.resultat.type, "tom");
  assert.equal(t.resultat.vinner, null);
  assert.equal(t.omstokk, 2);
});

test("500: a card deep in the pile comes with every card above it and must be laid out at once", () => {
  const r = runde({ v: "500", hender: [[K(0, 4), K(0, 5), K(2, 13), K(3, 9), K(1, 2), K(2, 3), K(3, 12)], [K(1, 6), K(1, 7), K(2, 7), K(2, 9), K(3, 1), K(3, 6), K(0, 13)]], bunke: [K(1, 3), K(0, 6), K(3, 7), K(2, 8)] });
  assert.ok(!Rummy.kanTa(r, 0, 0), "hjerter tre can't be used");
  assert.ok(Rummy.kanTa(r, 0, 1), "spar seks makes 4–5–6");
  assert.ok(Rummy.ta(r, 0, 1));
  assert.deepEqual(sortert(r.bunke), [K(1, 3)]);
  assert.equal(r.hender[0].length, 10);
  assert.equal(r.maaBruke, K(0, 6));
  assert.ok(!Rummy.kast(r, 0, K(3, 12)), "no throwing before spar seks is out");
  assert.ok(!Rummy.legUt(r, 0, [K(2, 3), K(2, 13), K(3, 9)]), "and no other meld first");
  assert.ok(Rummy.legUt(r, 0, [K(0, 4), K(0, 5), K(0, 6)]));
  assert.equal(r.maaBruke, null);
  assert.ok(Rummy.kast(r, 0, K(3, 12)));
  // Taking only the top card is free.
  assert.ok(Rummy.kanTa(r, 1));
});

test("500: every card laid out scores for whoever laid it, the hand counts against; the ace is 15, or 1 at the bottom of a run", () => {
  const r = runde({ v: "500", hender: [[K(2, 1), K(2, 2), K(2, 3), K(1, 12), K(1, 13), K(1, 1), K(0, 9)], [K(1, 11), K(3, 4), K(0, 1)]], bunke: [K(3, 8)], stokk: [K(0, 2)] });
  assert.ok(Rummy.trekk(r, 0) === K(0, 2));
  assert.ok(Rummy.legUt(r, 0, [K(2, 1), K(2, 2), K(2, 3)]), "A-2-3: 1 + 2 + 3");
  assert.ok(Rummy.legUt(r, 0, [K(1, 12), K(1, 13), K(1, 1)]), "Q-K-A: 10 + 10 + 15");
  assert.equal(Rummy.utlagt(r, 0), 6 + 35);
  assert.ok(Rummy.kast(r, 0, K(0, 9)));
  assert.ok(Rummy.trekk(r, 1) != null);
  assert.ok(Rummy.leggTil(r, 1, [K(1, 11)], 1), "hjerter knekt under Q-K-A makes J-Q-K-A");
  assert.ok(!Rummy.leggTil(r, 1, [K(0, 1)], 1), "nothing above the ace");
  assert.equal(Rummy.utlagt(r, 1), 10, "the knekt scores for the one who laid it off");
  assert.equal(Rummy.utlagt(r, 0), 41);
  // The stock runs out: the player in turn won't take from the pile, and the round ends.
  r.bunke = r.stokk.concat(r.bunke);
  r.stokk = [];
  assert.ok(Rummy.hel(r));
  assert.ok(Rummy.kast(r, 1, r.hender[1].find((x) => x !== r.tatt)));
  assert.ok(Rummy.kanStoppe(r, 0));
  assert.ok(Rummy.stopp(r, 0));
  assert.equal(r.resultat.type, "tom");
  assert.equal(r.resultat.poeng[0], 41 - 2, "laid out 41, spar to left on the hand");
  assert.equal(r.resultat.poeng[1], 10 - Rummy.handVerdi("500", r.hender[1]));
});

test("gin: the first card is offered to both, then the stock; knock with ten or less, gin, undercut, lay-offs", () => {
  const hand0 = [K(0, 3), K(0, 4), K(0, 5), K(0, 13), K(1, 13), K(2, 13), K(2, 7), K(2, 8), K(2, 9), K(3, 7)];
  const hand1 = [K(1, 2), K(1, 3), K(1, 9), K(3, 2), K(3, 5), K(3, 9), K(3, 11), K(0, 8), K(0, 10), K(2, 6)];
  // Offer: both turn it down → the first player draws from the stock and may not take the card.
  let r = runde({ v: "gin", hender: [hand0, hand1], bunke: [K(2, 1)], fase: "tilbud" });
  assert.ok(!Rummy.trekk(r, 0), "no drawing from the stock during the offer");
  assert.ok(Rummy.avsla(r, 0));
  assert.equal(r.tur, 1);
  assert.ok(Rummy.avsla(r, 1));
  assert.equal(r.tur, 0);
  assert.equal(r.fase, "trekk");
  assert.ok(!Rummy.kanTa(r, 0), "the card nobody wanted can't be taken now");
  assert.ok(Rummy.trekk(r, 0) != null);
  // Knock: take ruter ess, throw kløver sju → one loose point; the other lays ruter seks onto 7–9 ruter.
  r = runde({ v: "gin", hender: [hand0, hand1], bunke: [K(2, 1)], fase: "tilbud" });
  assert.ok(Rummy.ta(r, 0));
  assert.equal(Rummy.bankDod(r, 0, K(2, 1)), null, "not with the card just taken");
  assert.equal(Rummy.bankDod(r, 0, K(3, 7)), 1);
  assert.ok(!Rummy.legUt(r, 0, [K(0, 3), K(0, 4), K(0, 5)]), "nothing is laid out in gin");
  assert.ok(Rummy.bank(r, 0, K(3, 7)));
  const res = r.resultat;
  assert.equal(res.type, "bank");
  assert.deepEqual([...res.oppstilling[1].avlagt], [K(2, 6)], "ruter seks is laid off onto 7–8–9");
  // The defender: 2–3 hjerter, 9 hjerter, 2/5/9/J kløver, 8/10 spar = 2+3+9+2+5+9+10+8+10 = 58
  assert.equal(res.oppstilling[1].dod, 58);
  assert.deepEqual([...res.poeng], [57, 0]);
  // Undercut: the knocker has 8, the defender 7 or less → defender gets the difference + 25.
  const u = runde({ v: "gin", hender: [[K(0, 3), K(0, 4), K(0, 5), K(0, 13), K(1, 13), K(2, 13), K(2, 7), K(2, 8), K(2, 9), K(3, 8)], [K(1, 2), K(1, 3), K(1, 4), K(3, 2), K(3, 3), K(3, 4), K(0, 9), K(0, 10), K(0, 11), K(3, 5)]], bunke: [K(2, 12)], fase: "trekk", stokk: [K(1, 1)] });
  assert.ok(Rummy.trekk(u, 0) === K(1, 1));
  assert.ok(Rummy.bank(u, 0, K(3, 8)), "one loose point (hjerter ess)");
  assert.equal(u.resultat.oppstilling[1].dod, 0, "kløver 2–5 and the rest in melds");
  assert.ok(u.resultat.undercut);
  assert.deepEqual([...u.resultat.poeng], [0, 1 + 25]);
  // Gin: no loose cards → 25 extra, and no laying off.
  const g = runde({ v: "gin", hender: [[K(0, 3), K(0, 4), K(0, 5), K(0, 13), K(1, 13), K(2, 13), K(2, 7), K(2, 8), K(2, 9), K(3, 7)], [K(2, 6), K(3, 1), K(1, 2), K(1, 5), K(3, 9), K(3, 11), K(0, 8), K(0, 10), K(1, 9), K(3, 3)]], bunke: [K(1, 7)], fase: "trekk", stokk: [K(0, 6)] });
  assert.ok(Rummy.trekk(g, 0) === K(0, 6));
  assert.equal(Rummy.bankDod(g, 0, K(3, 7)), 0);
  assert.ok(Rummy.bank(g, 0, K(3, 7)));
  assert.equal(g.resultat.type, "gin");
  assert.deepEqual([...g.resultat.oppstilling[1].avlagt], []);
  assert.equal(g.resultat.poeng[0], g.resultat.oppstilling[1].dod + 25);
  // Too many loose points: no knock.
  const n = runde({ v: "gin", hender: [hand1, hand0], bunke: [K(2, 1)], fase: "trekk", stokk: [K(1, 12)] });
  assert.ok(Rummy.trekk(n, 0) != null);
  assert.ok(!Rummy.bank(n, 0, K(1, 12)));
});

test("gin: the hand is void when only two cards are left in the stock", () => {
  const r = runde({ v: "gin", hender: [[K(0, 2), K(1, 5), K(2, 8), K(3, 11), K(0, 13), K(1, 1), K(2, 4), K(3, 6), K(0, 9), K(1, 12)], [K(2, 2), K(3, 5), K(0, 8), K(1, 11), K(2, 13), K(3, 1), K(0, 4), K(1, 6), K(2, 9), K(3, 12)]], bunke: [K(0, 1)], fase: "trekk" });
  r.bunke = r.bunke.concat(r.stokk.splice(0, r.stokk.length - 3));
  assert.ok(Rummy.hel(r));
  assert.ok(Rummy.trekk(r, 0) != null);
  assert.ok(Rummy.kast(r, 0, r.hender[0][0]));
  assert.equal(r.fase, "slutt");
  assert.equal(r.resultat.type, "tom");
  assert.deepEqual([...r.resultat.poeng], [0, 0]);
});

test("the best way to lay out a hand: the fewest loose points", () => {
  // 4–5–6–7 spar and three sevens share spar sju: 4–5–6 spar and the three sevens leave only the king.
  const b = Rummy.beste([K(0, 4), K(0, 5), K(0, 6), K(0, 7), K(1, 7), K(2, 7), K(3, 13)], "gin");
  assert.equal(b.dod, 10);
  assert.equal(b.melds.length, 2);
  assert.equal(Rummy.beste([K(0, 1), K(1, 1), K(2, 1), K(3, 1)], "gin").dod, 0);
  // 500 counts what melds earn too: Q-K-A beats leaving the ace.
  const f = Rummy.beste([K(1, 12), K(1, 13), K(1, 1)], "500");
  assert.equal(f.dod, 0);
  assert.equal(f.kost, -35);
});

function simuler(v, nivaer, fro) {
  const n = nivaer.length;
  const R0 = rng(fro);
  const r = Rummy.nyRunde({ v, n, start: fro % n }, R0);
  for (let g = 0; r.fase !== "slutt"; g++) {
    assert.ok(g < 3000, "the round ends");
    const p = r.tur;
    assert.ok(Mobil.spillTur(r, p, nivaer[p], R0), `${v}: an illegal move by level ${nivaer[p]} (seed ${fro}, turn ${g})`);
    assert.ok(Rummy.hel(r), `${v}: the round is not whole (seed ${fro}, turn ${g})`);
  }
  return r;
}

test("the phone players only make legal moves, in every game and at every level", () => {
  for (const v of Rummy.VARIANTER)
    for (let fro = 0; fro < 90; fro++) {
      const n = v === "gin" ? 2 : 2 + (fro % 3);
      const nivaer = Array.from({ length: n }, (_, p) => 1 + ((fro + p) % 3));
      const r = simuler(v, nivaer, 1000 + fro);
      const sum = r.resultat.poeng.reduce((a, b) => a + b, 0);
      if (v !== "500") assert.ok(r.resultat.poeng.every((x) => x >= 0) && (r.resultat.vinner == null ? sum === 0 : sum > 0 || r.resultat.type === "ute"));
    }
});

test("Vanskelig beats Lett more often than not (rummy and gin, two players)", () => {
  for (const v of ["klassisk", "gin"]) {
    let vunnet = 0;
    let spilt = 0;
    for (let fro = 0; fro < 120; fro++) {
      const sterk = fro % 2;
      const nivaer = sterk === 0 ? [3, 1] : [1, 3];
      const r = simuler(v, nivaer, 5000 + fro);
      if (r.resultat.vinner == null) continue;
      spilt++;
      if (r.resultat.vinner === sterk) vunnet++;
    }
    assert.ok(vunnet > spilt * 0.55, `${v}: Vanskelig won ${vunnet} of ${spilt}`);
  }
});
