// Makkeren (Amerikaner): the deal (13 each from the left of the dealer), the bidding (7–13 and
// Amerikaner, always higher, a pass is for the rest of the round, three passes after a bid end it,
// all pass → a new deal), naming the trump and the card asked for (a suit you hold, a card you do not),
// the first trick (a trump led, the card asked for must be played and shows the makker), following
// suit, who takes a trick (trumps), the points (the bid to both or minus both, one per trick to the
// others, ±52 for Amerikaner) – and the phone players: only legal bids and cards over many seeded
// rounds at every level, every card kept; Vanskelig's pair does better than Lett's.
// Loads rusj/spill/makkeren/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/makkeren/spill.js"), "utf8"), kontekst);
const { Amerikaner: A, Mobil } = kontekst.window.Makkeren;
const ut = (x) => JSON.parse(JSON.stringify(x));

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const C = (s, v) => s * 13 + v - 1; // 0 spar, 1 hjerter, 2 ruter, 3 kløver; 1 = ess

test("utdeling: 13 kort hver, den til venstre for giveren melder først", () => {
  for (let g = 0; g < 4; g++) {
    const r = A.nyRunde({ giver: g }, rng(g));
    assert.ok(A.hel(r));
    assert.ok(r.hender.every((h) => h.length === 13));
    assert.equal(r.fase, "melding");
    assert.equal(r.tur, (g + 1) % 4);
  }
});

test("melding: minst 7, alltid høyere, pass gjelder resten av runden, tre pass avslutter", () => {
  const r = A.nyRunde({ giver: 3 }, rng(5));
  assert.deepEqual(ut(A.lovligeBud(r, 0)), [0, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.ok(!A.meld(r, 1, 8), "ikke din tur");
  assert.ok(!A.meld(r, 0, 6), "for lavt");
  assert.ok(A.meld(r, 0, 8));
  assert.deepEqual(ut(A.lovligeBud(r, 1)), [0, 9, 10, 11, 12, 13, 14]);
  assert.ok(A.meld(r, 1, 0));
  assert.ok(A.meld(r, 2, 9));
  assert.ok(A.meld(r, 3, 0));
  assert.equal(r.tur, 0, "seat 1 has passed and is skipped");
  assert.ok(A.meld(r, 0, 10));
  assert.equal(r.tur, 2);
  assert.ok(A.meld(r, 2, 0));
  assert.equal(r.fase, "velg");
  assert.equal(r.spillforer, 0);
  assert.equal(r.bud, 10);
  assert.equal(r.tur, 0);
});

test("alle passer: nye kort; Amerikaner avslutter meldingen med en gang", () => {
  const r = A.nyRunde({ giver: 0 }, rng(9));
  for (const p of [1, 2, 3, 0]) assert.ok(A.meld(r, p, 0));
  assert.equal(r.fase, "omgjort");
  const r2 = A.nyRunde({ giver: 0 }, rng(9));
  assert.ok(A.meld(r2, 1, 7));
  assert.ok(A.meld(r2, 2, A.AMERIKANER));
  assert.equal(r2.fase, "spill");
  assert.equal(r2.spillforer, 2);
  assert.equal(r2.trumf, null);
  assert.equal(r2.makker, null);
  assert.equal(r2.tur, 2);
});

// A round bid by seat 0 (10 in hearts), the card asked for given by hand.
function spillRunde(hender, trumf, spurt, bud = 10) {
  const r = A.nyRunde({ giver: 3 }, rng(1));
  r.hender = hender.map((h) => h.slice());
  A.meld(r, 0, bud);
  A.meld(r, 1, 0);
  A.meld(r, 2, 0);
  A.meld(r, 3, 0);
  assert.equal(r.fase, "velg");
  assert.ok(A.velg(r, 0, trumf, spurt));
  return r;
}
// Hands dealt in order by suit: seat 0 all spades but one, and so on (a fixed, readable deal).
function hender() {
  const h = [[], [], [], []];
  // seat 0: hjerter 2–10, spar ess, spar konge, ruter ess, kløver ess
  for (let v = 2; v <= 10; v++) h[0].push(C(1, v));
  h[0].push(C(0, 1), C(0, 13), C(2, 1), C(3, 1));
  // seat 2: hjerter ess, knekt, dame, konge + 9 low spades
  h[2].push(C(1, 1), C(1, 11), C(1, 12), C(1, 13));
  for (let v = 2; v <= 10; v++) h[2].push(C(0, v));
  // seats 1 and 3: the rest
  const brukt = new Set([...h[0], ...h[2]]);
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  h[1] = rest.slice(0, 13);
  h[3] = rest.slice(13);
  return h;
}

test("trumf og spurt kort: en farge du har, et kort du ikke har; den som har kortet blir makker", () => {
  const r = A.nyRunde({ giver: 3 }, rng(1));
  r.hender = hender();
  A.meld(r, 0, 9);
  for (const p of [1, 2, 3]) A.meld(r, p, 0);
  assert.ok(!A.velg(r, 0, 1, C(1, 5)), "et kort du har selv");
  assert.ok(!A.velg(r, 0, 1, C(0, 4)), "et kort i en annen farge");
  assert.ok(!A.kanVelgeTrumf(r, 0, 0) === false, "spar er lov – du har spar");
  assert.deepEqual(ut(A.kanSporres(r, 0, 1).slice(0, 3)), [C(1, 1), C(1, 13), C(1, 12)], "høyest først");
  assert.ok(A.velg(r, 0, 1, C(1, 1)));
  assert.equal(r.makker, 2);
  assert.equal(r.avslort, false);
});

test("første stikk: spillføreren spiller ut trumf, makkeren må legge det spurte kortet", () => {
  const r = spillRunde(hender(), 1, C(1, 1));
  assert.ok(A.lovlige(r, 0).every((k) => A.sortAv(k) === 1), "bare trumf i første utspill");
  assert.ok(A.legg(r, 0, C(1, 2)));
  assert.ok(A.legg(r, 1, A.lovlige(r, 1)[0]));
  assert.deepEqual(ut(A.lovlige(r, 2)), [C(1, 1)], "makkeren må legge hjerter ess");
  assert.ok(A.legg(r, 2, C(1, 1)));
  assert.ok(r.avslort);
  assert.ok(A.legg(r, 3, A.lovlige(r, 3)[0]));
  assert.equal(r.spilt[0].vinner, 2, "hjerter ess tar stikket");
  assert.equal(r.tur, 2);
});

test("stikk: følg farge; trumf slår; høyeste i fargen ellers", () => {
  assert.equal(A.vinnerAv([{ p: 0, k: C(0, 5) }, { p: 1, k: C(0, 13) }, { p: 2, k: C(1, 2) }, { p: 3, k: C(0, 1) }], 1), 2, "lav trumf slår spar ess");
  assert.equal(A.vinnerAv([{ p: 0, k: C(0, 5) }, { p: 1, k: C(0, 13) }, { p: 2, k: C(2, 1) }, { p: 3, k: C(0, 1) }], 1), 3, "ess høyest, ruter teller ikke");
  assert.equal(A.vinnerAv([{ p: 0, k: C(0, 5) }, { p: 1, k: C(1, 13) }, { p: 2, k: C(1, 1) }, { p: 3, k: C(0, 1) }], null), 3, "uten trumf: høyeste spar");
  const r = spillRunde(hender(), 1, C(1, 1));
  A.legg(r, 0, C(1, 2));
  const lov = A.lovlige(r, 1);
  assert.ok(lov.length && lov.every((k) => A.sortAv(k) === 1) || r.hender[1].every((k) => A.sortAv(k) !== 1), "følg farge");
});

test("poeng: meldingen holdt gir budet til begge, bet gir minus til begge, de andre får ett per stikk; Amerikaner ±52", () => {
  const r = { spillforer: 0, makker: 2, bud: 9, tatt: [5, 2, 4, 2] };
  assert.deepEqual(ut(A.oppgjor(r).poeng), [9, 2, 9, 2]);
  r.tatt = [4, 3, 4, 2];
  assert.deepEqual(ut(A.oppgjor(r).poeng), [-9, 3, -9, 2]);
  assert.deepEqual(ut(A.oppgjor({ spillforer: 1, makker: null, bud: 14, tatt: [0, 13, 0, 0] }).poeng), [0, 52, 0, 0]);
  assert.deepEqual(ut(A.oppgjor({ spillforer: 1, makker: null, bud: 14, tatt: [1, 12, 0, 0] }).poeng), [1, -52, 0, 0]);
});

// A whole round by the phone players: every bid and card legal, every card kept.
function heleRunden(niva, fro) {
  const tilf = rng(fro);
  let r = A.nyRunde({ giver: fro % 4 }, tilf);
  let nye = 0;
  for (;;) {
    while (r.fase === "melding") {
      const p = r.tur;
      const bud = Mobil.velgBud(r, p, Array.isArray(niva) ? niva[p] : niva, tilf);
      assert.ok(A.lovligeBud(r, p).includes(bud), `ulovlig bud ${bud}`);
      assert.ok(A.meld(r, p, bud));
    }
    if (r.fase !== "omgjort") break;
    assert.ok(++nye < 50);
    r = A.nyRunde({ giver: (fro + nye) % 4 }, tilf);
  }
  if (r.fase === "velg") {
    const v = Mobil.velgTrumfOgKort(r, r.spillforer);
    assert.ok(A.velg(r, r.spillforer, v.trumf, v.spurt), "ulovlig trumf eller kort");
  }
  let n = 0;
  while (r.fase === "spill") {
    const p = r.tur;
    const k = Mobil.velgKort(r, p, Array.isArray(niva) ? niva[p] : niva, tilf);
    assert.ok(A.lovlige(r, p).includes(k), `ulovlig kort ${k}`);
    assert.ok(A.legg(r, p, k));
    assert.ok(A.hel(r));
    assert.ok(++n <= 52);
  }
  assert.equal(n, 52);
  assert.equal(r.tatt.reduce((a, b) => a + b, 0), 13);
  if (r.makker != null) assert.ok(r.avslort && r.spilt[0].kort.some((x) => x.k === r.spurt), "det spurte kortet kom ikke i første stikk");
  return r;
}

test("mobilene gjør bare lovlige meldinger og trekk: alle nivåer, mange runder", () => {
  for (const niva of [1, 2, 3]) for (let fro = 1; fro <= 40; fro++) heleRunden(niva, fro * 13 + niva);
});

test("vanskelige mobiler får flere poeng enn lette ved samme bord, og meldingene deres holder som regel", () => {
  let v = 0;
  let l = 0;
  let holdt = 0;
  let meldt = 0;
  for (let fro = 1; fro <= 120; fro++) {
    const niva = fro % 2 ? [3, 1, 3, 1] : [1, 3, 1, 3];
    const r = heleRunden(niva, 7000 + fro);
    r.resultat.poeng.forEach((x, p) => (niva[p] === 3 ? (v += x) : (l += x)));
    if (niva[r.spillforer] === 3) {
      meldt++;
      if (r.resultat.klart) holdt++;
    }
  }
  assert.ok(v > l, `vanskelig ${v} mot lett ${l}`);
  assert.ok(holdt / meldt >= 0.5, `vanskelig holder bare ${holdt} av ${meldt}`);
});
