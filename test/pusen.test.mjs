// Pusen (children's card games): the animal deck; Svarteper (pairs go away, a card from the next
// hand, the one left with the cat), Fisk (asking, fishing, sets of four, the phone players'
// memory and that they only ask for what they have), Størst vinner (the bigger animal wins, equal
// animals go on, everybody keeps their own when it cannot), Snapp (more pairs than chance, the
// right snaps, the reaction times per level). Whole games over many seeds always end, and the cards
// add up. Loads rusj/spill/pusen/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/pusen/spill.js"), "utf8"), kontekst);
const { KATT, art, verdi, Svarte, Fisk, Krig, Snap, Mobil } = kontekst.window.Pusen;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const kopi = (x) => JSON.parse(JSON.stringify(x));

test("the deck: ten animals worth 1–10 in four colours, and the cat", () => {
  assert.equal(KATT, 40);
  assert.deepEqual(Array.from({ length: 40 }, (_, k) => verdi(k)).filter((v) => v === 1).length, 4);
  assert.equal(verdi(9), 10);
  assert.equal(art(37), 7);
});

// ---------- Svarteper ----------

test("Svarteper: ten pairs and the cat for two, fifteen pairs for three or four", () => {
  assert.equal(Svarte.kortstokk(2).length, 21);
  assert.equal(Svarte.kortstokk(4).length, 31);
  for (const n of [2, 3, 4]) {
    const k = Svarte.kortstokk(n);
    assert.equal(k.filter((x) => x === KATT).length, 1);
    for (let a = 0; a < 10; a++) assert.equal(k.filter((x) => x !== KATT && art(x) === a).length % 2, 0, "an animal without a mate");
  }
});

test("Svarteper: pairs go away at once; no hand keeps two of an animal", () => {
  const { hand, par } = Svarte.kastPar([0, 10, 3, KATT, 13, 23, 5]);
  assert.deepEqual(Array.from(par).sort(), [0, 3]);
  assert.deepEqual(Array.from(hand).sort((a, b) => a - b), [5, 23, KATT].sort((a, b) => a - b));
  for (let fro = 1; fro <= 50; fro++)
    for (const n of [2, 3, 4]) {
      const r = Svarte.ny(n, rng(fro));
      for (const h of r.hender) {
        const arter = h.filter((k) => k !== KATT).map(art);
        assert.equal(new Set(arter).size, arter.length, "two of an animal left in a hand");
      }
    }
});

test("Svarteper: a draw takes a card from the next hand; a pair goes away; the turn moves on", () => {
  const r = { n: 3, hender: [[1, 2], [11, KATT], [5]], par: [[], [], []], ute: [], tur: 0, taper: null };
  const t = Svarte.trekk(r, 0); // player 0 takes 11 (a rabbit) from player 1: a pair
  assert.equal(t.q, 1);
  assert.equal(t.kort, 11);
  assert.equal(t.par, 1);
  assert.deepEqual(Array.from(r.hender[0]), [2]);
  assert.equal(r.tur, 1);
  // Player 1 draws from player 2 (the five), which empties player 2's hand: out.
  Svarte.trekk(r, 0);
  assert.deepEqual(Array.from(r.ute), [2]);
  assert.equal(r.tur, 0, "the turn skips the player who is out");
});

test("Svarteper: whole games always end with exactly one player left – holding the cat", () => {
  for (let fro = 1; fro <= 400; fro++)
    for (const n of [2, 3, 4]) {
      const t = rng(fro * 7 + n);
      const r = Svarte.ny(n, t, fro % n);
      let trekk = 0;
      while (r.taper == null) {
        const q = Svarte.fra(r, r.tur);
        assert.ok(q >= 0 && q !== r.tur);
        assert.ok(Svarte.trekk(r, Mobil.svarte(r.hender[q].length, t)));
        assert.ok(++trekk < 500, "a game that never ends");
      }
      assert.ok(r.taper >= 0);
      assert.deepEqual(Array.from(r.hender[r.taper]), [KATT]);
      assert.equal(r.hender.flat().length, 1);
      assert.equal(r.par.flat().length, n === 2 ? 10 : 15);
      const plasser = Svarte.plasser(r);
      assert.equal(plasser.length, n);
      assert.equal(plasser[n - 1], r.taper);
    }
});

test("Svarteper: mixing the hand after each draw means even always taking the first card ends", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const t = rng(fro);
    const r = Svarte.ny(3, t);
    let trekk = 0;
    while (r.taper == null) {
      Svarte.trekk(r, 0, t);
      assert.ok(++trekk < 1000, "always the first card went round in a circle");
    }
  }
});

// ---------- Fisk ----------

test("Fisk: seven cards each for two, five for three or four; the rest in the pond", () => {
  const to = Fisk.ny(2, rng(1));
  assert.ok(to.hender.every((h) => h.length + to.sett.flat().length * 0 <= 7));
  assert.equal(to.hender.flat().length + to.dam.length + to.sett.flat().length * 4, 40);
  const fire = Fisk.ny(4, rng(2));
  assert.equal(fire.hender.flat().length + fire.dam.length + fire.sett.flat().length * 4, 40);
  assert.equal(fire.dam.length, 20);
});

test("Fisk: asking gives all the cards of that animal and another turn; else fish from the pond", () => {
  const r = { n: 2, hender: [[0, 1], [10, 20, 5]], dam: [7, 3], sett: [[], []], tur: 0, minne: [[], []] };
  assert.equal(Fisk.sporr(r, 1, 3), null, "may only ask for an animal one has");
  const a = Fisk.sporr(r, 1, 0);
  assert.equal(a.fikk, 2);
  assert.ok(a.igjen);
  assert.equal(r.tur, 0);
  assert.deepEqual(Array.from(r.hender[1]), [5]);
  assert.ok(r.minne[0].includes(0) && !r.minne[1].includes(0));
  // No rabbit at player 1: fish – and the card from the pond is a rabbit (3? no: 3 is a fox).
  const b = Fisk.sporr(r, 1, 1);
  assert.equal(b.fikk, 0);
  assert.equal(b.trakk, 3);
  assert.ok(!b.heldig && !b.igjen);
  assert.equal(r.tur, 1, "the turn passes after fishing the wrong animal");
});

test("Fisk: fishing the animal asked for gives another turn; four alike become a set", () => {
  const r = { n: 2, hender: [[2, 12, 22], [5]], dam: [9, 32], sett: [[], []], tur: 0, minne: [[], [2]] };
  const t = Fisk.sporr(r, 1, 2);
  assert.equal(t.trakk, 32);
  assert.ok(t.heldig && t.igjen);
  assert.deepEqual(Array.from(t.sett), [2]);
  assert.deepEqual(Array.from(r.sett[0]), [2]);
  assert.ok(!r.minne[1].includes(2), "a finished set is forgotten");
  // The hand became empty: it takes a card from the pond.
  assert.deepEqual(Array.from(r.hender[0]), [9]);
});

test("Fisk: the phone players only ask for animals they have, and only players with cards", () => {
  for (let fro = 1; fro <= 300; fro++) {
    const t = rng(fro);
    const r = Fisk.ny(3, t);
    for (let i = 0; i < 400 && !Fisk.ferdig(r); i++) {
      const p = r.tur;
      const v = Mobil.fisk(r, p, (fro % 3) + 1, t);
      assert.ok(v, "no move");
      assert.ok(Fisk.lovlig(r, p, v.q, v.a), `illegal ask ${JSON.stringify(v)}`);
      Fisk.sporr(r, v.q, v.a);
    }
  }
});

test("Fisk: Vanskelig asks the player it has seen ask for an animal it holds", () => {
  const r = { n: 3, hender: [[4, 7], [14, 1], [6, 8]], dam: [], sett: [[], [], []], tur: 0, minne: [[], [4], []] };
  for (let fro = 1; fro <= 30; fro++) assert.deepEqual({ ...Mobil.fisk(r, 0, 3, rng(fro)) }, { q: 1, a: 4 });
  // Lett asks at random: sometimes something else.
  const valg = new Set();
  for (let fro = 1; fro <= 60; fro++) valg.add(JSON.stringify(Mobil.fisk(r, 0, 1, rng(fro))));
  assert.ok(valg.size > 1);
});

test("Fisk: whole games end with all ten sets laid, and Vanskelig beats Lett more often than not", () => {
  let vanskelig = 0;
  let lett = 0;
  for (let fro = 1; fro <= 300; fro++) {
    const t = rng(fro);
    const r = Fisk.ny(2, t, fro % 2);
    let trekk = 0;
    while (!Fisk.ferdig(r)) {
      const p = r.tur;
      const v = Mobil.fisk(r, p, p === 0 ? 3 : 1, t);
      Fisk.sporr(r, v.q, v.a);
      assert.ok(++trekk < 1000, "a game that never ends");
      assert.equal(r.hender.flat().length + r.dam.length + r.sett.flat().length * 4, 40, "cards lost or made");
    }
    assert.equal(r.sett.flat().length, 10);
    if (r.sett[0].length > r.sett[1].length) vanskelig++;
    if (r.sett[1].length > r.sett[0].length) lett++;
  }
  assert.ok(vanskelig > lett, `Vanskelig ${vanskelig}, Lett ${lett}`);
});

// ---------- Størst vinner ----------

test("Størst vinner: the bigger animal takes both cards", () => {
  const r = { hender: [[0, 9], [3, 2]], vunnet: [0, 0] };
  const a = Krig.slag(r); // 9 (elephant) against 2 (fox)
  assert.equal(a.vinner, 0);
  assert.equal(r.vunnet[0], 2);
  const b = Krig.slag(r); // 0 (mouse) against 3 (dog)
  assert.equal(b.vinner, 1);
  assert.ok(Krig.ferdig(r));
});

test("Størst vinner: equal animals – one face down, the next face up decides and takes all", () => {
  // Top is last: both turn a pig (4, 14), lay 1 and 11 face down, then 9 against 2.
  const r = { hender: [[5, 9, 1, 4], [6, 2, 11, 14]], vunnet: [0, 0] };
  const s = Krig.slag(r);
  assert.equal(s.vinner, 0);
  assert.equal(s.runder.length, 2);
  assert.equal(s.antall, 6);
  assert.deepEqual(Array.from(r.vunnet), [6, 0]);
  // Equal at the very end: everybody keeps their own.
  const t = { hender: [[3], [13]], vunnet: [0, 0] };
  const u = Krig.slag(t);
  assert.equal(u.vinner, null);
  assert.deepEqual(Array.from(t.vunnet), [1, 1]);
});

test("Størst vinner: whole games use every card", () => {
  for (const per of [10, 20])
    for (let fro = 1; fro <= 200; fro++) {
      const r = Krig.ny(per, rng(fro));
      while (!Krig.ferdig(r)) assert.ok(Krig.slag(r));
      assert.equal(r.vunnet[0] + r.vunnet[1], per * 2);
    }
});

// ---------- Snapp ----------

const parIRad = (rad) => rad.slice(1).filter((k, i) => art(k) === art(rad[i])).length;

test("Snapp: the shuffle keeps every card and gives far more pairs than chance", () => {
  let lur = 0;
  let vanlig = 0;
  for (let fro = 1; fro <= 300; fro++) {
    const kort = Array.from({ length: 40 }, (_, i) => i);
    const a = Snap.stokk(kort, rng(fro), 0.3);
    assert.deepEqual(Array.from(a).sort((x, y) => x - y), kort);
    lur += parIRad(a);
    vanlig += parIRad(Snap.stokk(kort, rng(fro), 0));
  }
  assert.ok(lur > vanlig * 3, `pairs: ${lur} against ${vanlig}`);
  assert.ok(lur / 300 >= 6 && lur / 300 <= 14, `${lur / 300} pairs a game`);
});

test("Snapp: cards are turned in turn; a snap on a pair wins the pile, a snap without one does nothing", () => {
  const r = { hender: [[0, 5], [10, 7]], pos: [0, 0], midt: [], vunnet: [0, 0], tur: 0 };
  assert.equal(Snap.snu(r).kort, 0);
  assert.equal(r.tur, 1);
  assert.equal(Snap.snapp(r, 1), false);
  assert.equal(Snap.snu(r).kort, 10);
  assert.ok(Snap.like(r));
  assert.equal(Snap.snapp(r, 1), true);
  assert.equal(r.vunnet[1], 2);
  assert.equal(r.midt.length, 0);
  Snap.snu(r);
  Snap.snu(r);
  assert.ok(Snap.tomt(r));
});

test("Snapp: whole games turn every card and the snapped cards are never more than the deck", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const t = rng(fro);
    const r = Snap.ny(20, t, 0.3);
    while (!Snap.tomt(r)) {
      Snap.snu(r);
      if (Snap.like(r)) Snap.snapp(r, t() < 0.5 ? 0 : 1);
    }
    assert.ok(r.vunnet[0] + r.vunnet[1] + r.midt.length === 40);
  }
});

test("Snapp: the phone is slower and misses more on Lett than on Vanskelig", () => {
  const snitt = (niva) => {
    let ms = 0;
    let bom = 0;
    for (let fro = 1; fro <= 500; fro++) {
      const x = Mobil.reaksjon(niva, rng(fro));
      ms += x.ms;
      bom += x.bom ? 1 : 0;
    }
    return { ms: ms / 500, bom };
  };
  const [l, m, v] = [snitt(1), snitt(2), snitt(3)];
  assert.ok(l.ms > m.ms && m.ms > v.ms);
  assert.ok(l.bom > m.bom && v.bom === 0);
  assert.ok(v.ms >= 500, "faster than a child can be");
});
