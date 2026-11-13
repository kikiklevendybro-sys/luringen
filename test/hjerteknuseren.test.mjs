// Hjerteknuseren: the rules of hearts (passing left, right, across and not at all; kløver to opens;
// follow suit; no points in the first trick; hearts must be broken before they are led; who takes a
// trick; the points and shooting the moon) and the phone players (only legal moves over many seeded
// rounds; Vanskelig takes fewer points than Lett). Loads rusj/spill/hjerteknuseren/spill.js without
// the kit (node:vm): only Hjerter, Mobil and KORT are exposed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/hjerteknuseren/spill.js"), "utf8"), kontekst);
const { Hjerter, Mobil } = kontekst.window.Hjerteknuseren;

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
// A round in play laid out by hand; the cards nobody holds are counted as taken by seat 3.
function runde({ hender, stikkNr = 0, tur = 0, brutt = false, stikk = [] }) {
  const r = Hjerter.nyRunde({ nr: 3 }, rng(1));
  const brukt = new Set([].concat(...hender, stikk.map((s) => s.k)));
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  Object.assign(r, { hender: hender.map((h) => h.slice()), tatt: [[], [], [], rest], stikkNr, tur, brutt, stikk: stikk.slice(), fase: "spill", spilt: [] });
  return r;
}

test("dealing: 13 each; passing goes left, right, across, then nobody passes", () => {
  for (let nr = 0; nr < 8; nr++) {
    const r = Hjerter.nyRunde({ nr }, rng(nr));
    assert.ok(Hjerter.hel(r));
    assert.ok(r.hender.every((h) => h.length === 13));
    assert.equal(r.retning, nr % 4);
    assert.equal(r.fase, nr % 4 === 3 ? "spill" : "gi");
  }
  assert.equal(Hjerter.mottakerAv({ retning: 0 }, 0), 1, "left");
  assert.equal(Hjerter.mottakerAv({ retning: 1 }, 0), 3, "right");
  assert.equal(Hjerter.mottakerAv({ retning: 2 }, 0), 2, "across");
});

test("passing: three different cards from the hand; they move when all four have chosen; kløver to opens", () => {
  const r = Hjerter.nyRunde({ nr: 0 }, rng(7));
  const forHender = r.hender.map((h) => h.slice());
  assert.ok(!Hjerter.gi(r, 0, forHender[0].slice(0, 2)), "two cards");
  assert.ok(!Hjerter.gi(r, 0, [forHender[0][0], forHender[0][0], forHender[0][1]]), "the same card twice");
  assert.ok(!Hjerter.gi(r, 0, [forHender[1][0], forHender[0][1], forHender[0][2]]), "somebody else's card");
  for (let p = 0; p < 4; p++) {
    assert.equal(r.fase, "gi");
    assert.ok(Hjerter.gi(r, p, forHender[p].slice(0, 3)));
    assert.ok(!Hjerter.gi(r, p, forHender[p].slice(3, 6)), "only once");
  }
  assert.equal(r.fase, "spill");
  for (let p = 0; p < 4; p++) {
    const fra = (p + 3) % 4; // passed to the left: p gets from the right-hand neighbour
    assert.deepEqual(sortert(r.mottatt[p]), sortert(forHender[fra].slice(0, 3)));
    assert.ok(r.hender[p].length === 13 && r.mottatt[p].every((k) => r.hender[p].includes(k)));
  }
  assert.ok(Hjerter.hel(r));
  assert.ok(r.hender[r.tur].includes(K(3, 2)), "kløver to begins");
  assert.deepEqual([...Hjerter.lovlige(r, r.tur)], [K(3, 2)]);
});

test("follow suit; out of the suit anything goes, but no points in the first trick", () => {
  const r = runde({
    hender: [[K(3, 2), K(0, 5)], [K(3, 9), K(1, 4), K(0, 12)], [K(1, 6), K(0, 12 - 10), K(2, 4)], [K(1, 8), K(1, 9)]],
  });
  assert.ok(Hjerter.legg(r, 0, K(3, 2)));
  assert.deepEqual([...Hjerter.lovlige(r, 1)], [K(3, 9)], "follow kløver");
  assert.ok(!Hjerter.legg(r, 1, K(1, 4)), "a heart while holding kløver");
  assert.ok(Hjerter.legg(r, 1, K(3, 9)));
  assert.deepEqual(sortert(Hjerter.lovlige(r, 2)), sortert([K(0, 2), K(2, 4)]), "no hjerter in the first trick");
  assert.ok(Hjerter.legg(r, 2, K(2, 4)));
  assert.deepEqual(sortert(Hjerter.lovlige(r, 3)), sortert([K(1, 8), K(1, 9)]), "only hearts: then a heart is allowed");
  assert.ok(Hjerter.legg(r, 3, K(1, 8)));
  assert.equal(r.stikkNr, 1);
  assert.equal(r.tur, 1, "kløver ni takes the trick and leads");
  assert.ok(r.brutt, "a heart was played: hearts are broken");
  assert.equal(Hjerter.poengTatt(r, 1), 1);
});

test("hearts can't be led before they are broken, unless the hand has nothing else; the highest of the suit led wins", () => {
  const r = runde({ hender: [[K(1, 2), K(0, 3)], [K(0, 13)], [K(0, 1)], [K(1, 1)]], stikkNr: 12 - 1, tur: 0 });
  r.hender[1].push(K(2, 2));
  r.hender[2].push(K(2, 3));
  r.hender[3].push(K(2, 5));
  assert.deepEqual([...Hjerter.lovlige(r, 0)], [K(0, 3)]);
  assert.ok(Hjerter.legg(r, 0, K(0, 3)));
  assert.ok(Hjerter.legg(r, 1, K(0, 13)));
  assert.ok(Hjerter.legg(r, 2, K(0, 1)), "spar ess");
  assert.deepEqual(sortert(Hjerter.lovlige(r, 3)), sortert([K(1, 1), K(2, 5)]));
  assert.ok(Hjerter.legg(r, 3, K(2, 5)));
  assert.equal(r.tur, 2, "the ace is high");
  const bare = runde({ hender: [[K(1, 2), K(1, 3)], [K(0, 2), K(0, 3)], [K(0, 4), K(0, 5)], [K(0, 6), K(0, 7)]], stikkNr: 11 });
  assert.deepEqual(sortert(Hjerter.lovlige(bare, 0)), sortert([K(1, 2), K(1, 3)]), "only hearts left: may lead one");
});

test("the points: a heart is one, spar dame 13; all 26 → 26 to everybody else", () => {
  const r = { tatt: [[K(1, 1), K(1, 2), K(0, 12)], [K(2, 5)], [K(1, 3)], []] };
  assert.deepEqual([...Hjerter.oppgjor({ ...r, tatt: r.tatt }).poeng], [15, 0, 1, 0]);
  const alle = Array.from({ length: 13 }, (_, i) => K(1, i + 1)).concat(K(0, 12), K(2, 2));
  const maane = Hjerter.oppgjor({ tatt: [[], alle, [], []] });
  assert.equal(maane.maane, 1);
  assert.deepEqual([...maane.poeng], [26, 0, 26, 26]);
});

function spillRunde(nivaer, fro) {
  const R0 = rng(fro);
  const r = Hjerter.nyRunde({ nr: fro }, R0);
  if (r.fase === "gi") for (let p = 0; p < 4; p++) assert.ok(Hjerter.gi(r, p, Mobil.velgGi(r, p, nivaer[p], R0)), `passing (seed ${fro})`);
  let n = 0;
  while (r.fase === "spill") {
    const p = r.tur;
    const k = Mobil.velgKort(r, p, nivaer[p], R0);
    assert.ok(Hjerter.lovlige(r, p).includes(k), `level ${nivaer[p]} chose an illegal card (seed ${fro})`);
    assert.ok(Hjerter.legg(r, p, k));
    assert.ok(Hjerter.hel(r), `the round is not whole (seed ${fro})`);
    assert.ok(++n <= 52);
  }
  assert.equal(n, 52);
  const sum = r.resultat.poeng.reduce((a, b) => a + b, 0);
  assert.ok(sum === 26 || sum === 78);
  return r;
}

test("the phone players only make legal moves, at every level", () => {
  for (let fro = 0; fro < 300; fro++) spillRunde([1 + (fro % 3), 1 + ((fro + 1) % 3), 1 + ((fro + 2) % 3), 1 + (fro % 2)], 100 + fro);
});

test("Vanskelig takes fewer points than Middels, and Middels fewer than Lett", () => {
  const snitt = (sterk, svak) => {
    let s = 0;
    let a = 0;
    for (let fro = 0; fro < 400; fro++) {
      const plass = fro % 4;
      const nivaer = [svak, svak, svak, svak];
      nivaer[plass] = sterk;
      const r = spillRunde(nivaer, 9000 + fro);
      s += r.resultat.poeng[plass];
      a += r.resultat.poeng.reduce((x, y) => x + y, 0) - r.resultat.poeng[plass];
    }
    return { sterk: s / 400, andre: a / 1200 };
  };
  const m = snitt(2, 1);
  assert.ok(m.sterk < m.andre, `Middels ${m.sterk.toFixed(2)} vs Lett ${m.andre.toFixed(2)}`);
  const v = snitt(3, 2);
  assert.ok(v.sterk < v.andre, `Vanskelig ${v.sterk.toFixed(2)} vs Middels ${v.andre.toFixed(2)}`);
});
