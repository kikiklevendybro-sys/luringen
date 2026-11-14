// Fiskeren (Kasino): the deal (four each and four on the table, four more each until the deck is
// used up), the card values (ess 1/14, spar 2 2/15, ruter 10 10/16), taking (same rank, sums,
// several groups, builds by their value), building (a new build, raising, doubling, one build at a
// time, only with a card to take it, no laying out while you own one), the tabbe, the last taker
// gets the rest, the points (most cards 1, most spades 2, store kasino 2, lille kasino 1, ess 1,
// tabbe 1; ties give nothing) – and the phone players: only legal moves over many seeded rounds
// with two, three and four players at every level, every card kept, Vanskelig beats Lett.
// Loads rusj/spill/fiskeren/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/fiskeren/spill.js"), "utf8"), kontekst);
const { Kasino: K, Mobil } = kontekst.window.Fiskeren;
const ut = (x) => JSON.parse(JSON.stringify(x));

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const C = (s, v) => s * 13 + v - 1; // 0 spar, 1 hjerter, 2 ruter, 3 kløver
const L = (k) => ({ t: "k", k });
// A round laid out by hand for seat 0; the cards nobody holds lie in the deck.
function runde({ hender, bord, antall = 2, tur = 0, bunke }) {
  const r = K.nyRunde({ antall, giver: antall - 1 }, rng(1));
  const brukt = new Set([].concat(...hender, ...bord.flatMap(K.kortI)));
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  Object.assign(r, { hender: hender.map((h) => h.slice()), bord: ut(bord), bunke: bunke ?? rest, tatt: Array.from({ length: antall }, () => []), tabber: new Array(antall).fill(0), tur, fase: "spill", sisteTaker: -1 });
  if (bunke) r.tatt[antall - 1].push(...rest);
  return r;
}

test("verdier: ess 1 på bordet og 14 på hånda, spar 2 2/15, ruter 10 10/16, knekt 11, dame 12, konge 13", () => {
  assert.equal(K.handVerdi(C(1, 1)), 14);
  assert.equal(K.bordVerdi(C(1, 1)), 1);
  assert.equal(K.handVerdi(K.LILLE), 15);
  assert.equal(K.LILLE, C(0, 2));
  assert.equal(K.handVerdi(K.STORE), 16);
  assert.equal(K.STORE, C(2, 10));
  assert.equal(K.handVerdi(C(3, 2)), 2);
  assert.equal(K.handVerdi(C(3, 10)), 10);
  assert.deepEqual([11, 12, 13].map((v) => K.handVerdi(C(3, v))), [11, 12, 13]);
});

test("utdeling: fire hver og fire på bordet; nye kort til alle når hendene er tomme", () => {
  for (const antall of [2, 3, 4]) {
    const r = K.nyRunde({ antall, giver: 0 }, rng(antall));
    assert.ok(K.hel(r));
    assert.ok(r.hender.every((h) => h.length === 4));
    assert.equal(r.bord.length, 4);
    assert.equal(r.bunke.length, 52 - 4 - 4 * antall);
    assert.equal(r.tur, 1, "den til venstre for giveren begynner");
  }
});

test("ta: samme valør, summer, flere grupper på en gang, bygg etter verdien", () => {
  const bord = [L(C(1, 7)), L(C(2, 3)), L(C(3, 4)), L(C(0, 9)), { t: "b", kort: [C(1, 2), C(1, 5)], verdi: 7, eier: 1, dobbel: false }];
  const r = runde({ hender: [[C(0, 7), C(3, 13)], [C(2, 7)]], bord });
  assert.ok(K.kanTa(r, 0, C(0, 7), [0]), "7 tar 7");
  assert.ok(K.kanTa(r, 0, C(0, 7), [1, 2]), "7 tar 3 + 4");
  assert.ok(K.kanTa(r, 0, C(0, 7), [0, 1, 2, 4]), "7 tar 7, 3 + 4 og bygg 7");
  assert.ok(!K.kanTa(r, 0, C(0, 7), [0, 1]), "7 + 3 er ikke 7");
  assert.ok(!K.kanTa(r, 0, C(0, 7), [3]), "7 tar ikke 9");
  assert.ok(!K.kanTa(r, 0, C(3, 13), [4]), "konge tar ikke bygg 7");
  assert.ok(!K.kanTa(r, 1, C(2, 7), [0]), "ikke din tur");
  assert.ok(K.ta(r, 0, C(0, 7), [0, 1, 2, 4]));
  assert.deepEqual(ut(r.bord), [L(C(0, 9))]);
  assert.equal(r.tatt[0].length, 1 + 1 + 2 + 2);
  assert.equal(r.sisteTaker, 0);
  assert.equal(r.tur, 1);
});

test("ess tar ess og summer til 14; spar 2 og ruter 10 tar sin valør og 15 og 16", () => {
  const r = runde({ hender: [[C(0, 1), K.LILLE, K.STORE]], bord: [L(C(1, 1)), L(C(1, 13)), L(C(2, 2)), L(C(3, 6)), L(C(3, 10)), L(C(1, 9))] });
  assert.ok(K.kanTa(r, 0, C(0, 1), [0]), "ess på ess");
  assert.ok(K.kanTa(r, 0, C(0, 1), [0, 1]), "ess + konge = 14");
  assert.ok(!K.kanTa(r, 0, C(0, 1), [1]), "konge alene er ikke 14");
  assert.ok(K.kanTa(r, 0, K.LILLE, [2]), "spar 2 tar en 2-er");
  assert.ok(K.kanTa(r, 0, K.LILLE, [3, 1, 2].slice(0, 1).concat([5])), "spar 2 tar 6 + 9 = 15");
  assert.ok(K.kanTa(r, 0, K.STORE, [4]), "ruter 10 tar en 10-er");
  assert.ok(K.kanTa(r, 0, K.STORE, [3, 4]), "ruter 10 tar 6 + 10 = 16");
});

test("tabbe: å ta hele bordet gir en tabbe", () => {
  const r = runde({ hender: [[C(0, 9), C(0, 3)], [C(1, 4), C(1, 5)]], bord: [L(C(1, 5)), L(C(2, 4))] });
  assert.ok(K.ta(r, 0, C(0, 9), [0, 1]));
  assert.equal(r.tabber[0], 1);
  assert.equal(r.bord.length, 0);
  assert.ok(r.sist.tabbe);
});

test("bygge: ny sum, bygge videre, dobbel – bare med et kort å ta det med, ett bygg om gangen", () => {
  const r = runde({ hender: [[C(0, 3), C(1, 8), C(2, 5), C(3, 5)], [C(1, 10), C(2, 2), C(3, 13), C(3, 1)]], bord: [L(C(1, 5)), L(C(2, 4)), L(C(3, 3))] });
  assert.deepEqual(ut(K.byggValg(r, 0, C(0, 3), [0])), [{ verdi: 8, dobbel: false }], "3 på 5 = bygg 8 (har en 8-er)");
  assert.deepEqual(ut(K.byggValg(r, 0, C(0, 3), [1])), [], "3 på 4 = 7, men ingen 7-er");
  assert.deepEqual(ut(K.byggValg(r, 0, C(2, 5), [0])), [{ verdi: 5, dobbel: true }], "5 på 5: dobbel 5 (har en 5-er til), ikke 10");
  assert.deepEqual(ut(K.byggValg(r, 0, C(0, 3), [])), [], "et bygg trenger kort på bordet");
  assert.ok(K.bygg(r, 0, C(0, 3), [0], { verdi: 8, dobbel: false }));
  const b = r.bord.find((x) => x.t === "b");
  assert.deepEqual([b.verdi, b.eier, b.dobbel, b.kort.length], [8, 0, false, 2]);
  assert.ok(K.hel(r));
  // Mobil 1 raises it to 10 with a 2 (it holds a 10), and owns it then.
  const i = r.bord.indexOf(b);
  assert.deepEqual(ut(K.byggValg(r, 1, C(2, 2), [i])), [{ verdi: 10, dobbel: false }]);
  assert.ok(K.bygg(r, 1, C(2, 2), [i], { verdi: 10, dobbel: false }));
  const b2 = r.bord.find((x) => x.t === "b");
  assert.deepEqual([b2.verdi, b2.eier], [10, 1]);
  // Seat 0 owns no build now and may lay out; seat 1 owns one and may not.
  assert.ok(K.kanLeggeUt(r, 0, C(1, 8)));
  r.tur = 1;
  assert.ok(!K.kanLeggeUt(r, 1, C(3, 13)), "ikke legge ut med et bygg på bordet");
});

test("bygget må kunne tas: ikke bruke det siste kortet med verdien til noe annet", () => {
  const r = runde({ hender: [[C(0, 8), C(1, 2)], [C(1, 9)]], bord: [{ t: "b", kort: [C(2, 5), C(3, 3)], verdi: 8, eier: 0, dobbel: false }, L(C(2, 8))] });
  assert.ok(!K.kanTa(r, 0, C(0, 8), [1]), "8-eren må ta bygget, ikke bare den løse 8-eren");
  assert.ok(K.kanTa(r, 0, C(0, 8), [0, 1]), "8-eren tar bygget og 8-eren");
  assert.ok(!K.kanLeggeUt(r, 0, C(1, 2)), "ikke legge ut med eget bygg");
  assert.deepEqual(ut(K.byggValg(r, 0, C(1, 2), [1])), [], "bare ett bygg om gangen");
});

test("dobbel: flere grupper med samme sum låses", () => {
  const r = runde({ hender: [[C(0, 4), C(1, 9)], [C(2, 9), C(2, 2)]], bord: [L(C(1, 5)), L(C(2, 9)), L(C(3, 1))] });
  const valg = ut(K.byggValg(r, 0, C(0, 4), [0, 1]));
  assert.ok(valg.some((v) => v.verdi === 9 && v.dobbel), "4 + 5 og 9: dobbel 9");
  assert.ok(K.bygg(r, 0, C(0, 4), [0, 1], { verdi: 9, dobbel: true }));
  const i = r.bord.findIndex((x) => x.t === "b");
  assert.deepEqual(ut(K.byggValg(r, 1, C(2, 2), [i])), [], "en dobbel kan ikke bygges videre");
  assert.ok(K.kanTa(r, 1, C(2, 9), [i]), "men den kan tas");
});

test("slutten: den som tok sist, får resten; poengene fordeles riktig; uavgjort gir ingen poeng", () => {
  const r = runde({ hender: [[C(0, 13)], [C(1, 6)]], bord: [L(C(2, 13)), L(C(3, 1)), L(C(0, 5))], bunke: [] });
  // The rest of the deck lies with seat 1 (runde puts it there); move a few to seat 0.
  for (const k of [C(0, 1), K.STORE, C(0, 3), C(0, 4)]) r.tatt[0].push(...r.tatt[1].splice(r.tatt[1].indexOf(k), 1));
  assert.ok(K.hel(r));
  assert.ok(K.ta(r, 0, C(0, 13), [0]));
  assert.ok(K.leggUt(r, 1, C(1, 6)));
  assert.equal(r.fase, "ferdig");
  assert.equal(r.restTil, 0);
  assert.ok(r.tatt[0].includes(C(3, 1)) && r.tatt[0].includes(C(1, 6)), "resten til den som tok sist");
  const res = r.resultat;
  const sum = res.poeng.reduce((a, b) => a + b, 0);
  assert.equal(sum, 10 - (res.flestKort < 0 ? 1 : 0) - (res.flestSpar < 0 ? 2 : 0) + r.tabber.reduce((a, b) => a + b, 0));
  assert.equal(res.rader[0].store, 2);
  assert.equal(res.rader[1].lille, 1);
  const lik = K.oppgjor({ antall: 2, tatt: [[C(0, 2), C(1, 3)], [C(0, 3), C(1, 4)]], tabber: [0, 0] });
  assert.equal(lik.flestKort, -1);
  assert.equal(lik.flestSpar, -1);
  assert.deepEqual(ut(lik.poeng), [1, 0], "bare lille kasino");
});

// A whole round by the phone players: every move legal, every card kept, 10 + tabber points.
function spillRunde(antall, niva, fro) {
  const tilf = rng(fro);
  const r = K.nyRunde({ antall, giver: fro % antall }, tilf);
  let trekk = 0;
  while (r.fase === "spill") {
    const p = r.tur;
    const t = Mobil.velgTrekk(r, p, Array.isArray(niva) ? niva[p] : niva, tilf, []);
    assert.ok(K.erLovlig(r, p, t), `ulovlig trekk: ${JSON.stringify(t)}`);
    assert.ok(K.utfor(r, p, t));
    assert.ok(K.hel(r), "et kort forsvant eller ble doblet");
    for (let q = 0; q < antall; q++) {
      const b = K.eierBygg(r, q);
      if (b >= 0) assert.ok(r.hender[q].some((k) => K.handVerdi(k) === r.bord[b].verdi) || r.hender[q].length === 0, "et bygg uten kort å ta det med");
    }
    assert.ok(++trekk <= 52);
  }
  assert.equal(trekk, 52 - 4);
  const res = r.resultat;
  const sum = res.poeng.reduce((a, b) => a + b, 0);
  assert.equal(sum, 10 - (res.flestKort < 0 ? 1 : 0) - (res.flestSpar < 0 ? 2 : 0) + r.tabber.reduce((a, b) => a + b, 0));
  assert.equal(r.tatt.reduce((s, t) => s + t.length, 0), 52);
  return r;
}

test("mobilene gjør bare lovlige trekk: 2, 3 og 4 spillere, alle nivåer, mange runder", () => {
  let n = 0;
  for (const antall of [2, 3, 4])
    for (const niva of [1, 2, 3])
      for (let fro = 1; fro <= (niva === 3 ? 8 : 15); fro++) {
        spillRunde(antall, niva, fro * 31 + antall * 7 + niva);
        n++;
      }
  assert.ok(n > 100);
});

test("vanskelig slår lett over mange runder", () => {
  let v = 0;
  let l = 0;
  for (let fro = 1; fro <= 30; fro++) {
    const r = spillRunde(2, fro % 2 ? [3, 1] : [1, 3], 900 + fro);
    const [a, b] = r.resultat.poeng;
    if (fro % 2) (v += a, l += b);
    else (v += b, l += a);
  }
  assert.ok(v > l * 1.3, `vanskelig ${v} mot lett ${l}`);
});
