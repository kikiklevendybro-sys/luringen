// Kortkongen's other solitaires: Golf, Tre topper (Tri Peaks), Pyramide, FreeCell and Edderkopp (Spider).
// Each engine is compared with an independent, plain reading of the standard rules in thousands of
// random positions; dealing, winning, saving and the searches are checked, and the stored proven deals
// are played out through the rules. Loads rusj/spill/kortkongen/spill.js in node:vm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = {};
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/kortkongen/spill.js"), "utf8"), kontekst);
const V = kontekst.KortkongenVarianter;
const K = kontekst.KortkongenRegler;
const KABALER = JSON.parse(readFileSync(join(ROT, "rusj/spill/kortkongen/data/kabaler.json"), "utf8"));
const ren = (x) => JSON.parse(JSON.stringify(x));

// Cards: suit s (0 spar, 1 hjerter, 2 ruter, 3 kløver), value v (1 ess … 13 konge)
const kort = (s, v) => s * 13 + v - 1;
const verdi = (k) => (k % 13) + 1;
const sort = (k) => Math.floor(k / 13);
const rodt = (k) => sort(k) === 1 || sort(k) === 2;
const ALLE = Array.from({ length: 52 }, (_, k) => k);
const topp = (l) => l[l.length - 1];

// A random game through the engine: at every step the engine and the reference must agree on every
// move tried; then a random legal move is made, and the position must survive saving and reading.
function tilfeldigeSpill(E, forsok, referanse, antallSpill, steg, del) {
  let ja = 0;
  let nei = 0;
  for (let n = 0; n < antallSpill; n++) {
    const rng = K.tilfeldig(n * 7 + 3);
    const st = del(n);
    for (let s = 0; s < steg; s++) {
      const lov = [];
      for (const m of forsok(st)) {
        const svar = E.lovlig(st, m);
        assert.equal(svar, referanse(st, m), `uenig om ${JSON.stringify(m)} i ${E.kode(st)}`);
        if (svar) {
          lov.push(m);
          ja++;
        } else nei++;
      }
      assert.equal(E.trekk(st).length, lov.length, `trekk() gir ikke alle lovlige trekk i ${E.kode(st)}`);
      if (!lov.length) break;
      E.utfor(st, lov[Math.floor(rng() * lov.length)]);
      const kode = E.kode(st);
      assert.ok(E.fraKode(kode), `et lovlig trekk ga en ødelagt stilling: ${kode}`);
      assert.equal(E.kode(E.fraKode(kode)), kode, "lagring og lesing ga en annen stilling");
    }
  }
  return { ja, nei };
}

// Plays a solution from a search through the rules; returns the end position.
function spill(E, st, trekk) {
  for (const m of trekk) {
    assert.ok(E.lovlig(st, m), `ulovlig trekk i løsningen: ${JSON.stringify(m)}`);
    E.utfor(st, m);
  }
  return st;
}
const los = (E, st, maks) => {
  const l = E.loser(E.fraKode(E.kode(st)), maks);
  l.kjor();
  return l.resultat();
};

// ---------- Golf ----------

test("golf: sju kolonner med fem kort, ett kort på kastebunken, 16 i bunken; samme frø gir samme kabal", () => {
  for (const fro of [1, 2, 99, 4294967295]) {
    const st = V.golf.del(fro, 0);
    assert.deepEqual(ren(st.kol.map((k) => k.length)), [5, 5, 5, 5, 5, 5, 5]);
    assert.equal(st.bunke.length, 16);
    assert.equal(st.avfall.length, 1);
    assert.deepEqual([...st.kol.flat(), ...st.bunke, ...st.avfall].sort((a, b) => a - b), ALLE);
    assert.equal(V.golf.kode(V.golf.del(fro, 0)), V.golf.kode(st));
    // Another suit swap: the same values in the same places, other suits.
    const b = V.golf.del(fro, 7);
    assert.deepEqual(ren(b.kol.map((k) => k.map(verdi))), ren(st.kol.map((k) => k.map(verdi))));
    assert.notEqual(V.golf.kode(b), V.golf.kode(st));
  }
  assert.notEqual(V.golf.kode(V.golf.del(1, 0)), V.golf.kode(V.golf.del(2, 0)));
});

const golfRef = (st, m) => {
  if (m.fra === "s") return st.bunke.length > 0;
  if (m.fra !== "b" || !(m.i >= 0 && m.i < 7) || !st.kol[m.i].length) return false;
  const a = topp(st.avfall);
  const k = topp(st.kol[m.i]);
  if (verdi(a) === 13) return false; // nothing on a king
  return Math.abs(verdi(k) - verdi(a)) === 1; // no wrapping: ace and king are not neighbours
};
const golfForsok = () => [{ fra: "s" }, ...[-1, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ fra: "b", i }))];

test("golf: ett opp eller ett ned, uansett sort – ingenting på en konge, ess og konge er ikke naboer", () => {
  const st = { kol: [[kort(0, 5)], [kort(1, 7)], [kort(2, 13)], [kort(3, 1)], [kort(0, 12)], [], []], bunke: [kort(1, 2)], avfall: [kort(2, 6)] };
  const resten = ALLE.filter((k) => ![...st.kol.flat(), ...st.bunke, ...st.avfall].includes(k));
  st.avfall.unshift(...resten);
  assert.ok(V.golf.fraKode(V.golf.kode(st)));
  assert.equal(V.golf.lovlig(st, { fra: "b", i: 0 }), true, "5 på 6");
  assert.equal(V.golf.lovlig(st, { fra: "b", i: 1 }), true, "7 på 6");
  assert.equal(V.golf.lovlig(st, { fra: "b", i: 2 }), false, "konge på 6");
  assert.equal(V.golf.lovlig(st, { fra: "b", i: 5 }), false, "tom kolonne");
  st.avfall.push(kort(1, 13)); // a king on top
  st.kol[4] = [];
  assert.equal(V.golf.lovlig(st, { fra: "b", i: 3 }), false, "ess på konge (ikke rundt hjørnet)");
  st.avfall.pop();
  st.kol[4] = [kort(0, 12)];
  st.avfall.push(kort(1, 1)); // an ace on top: a king can't follow
  st.kol[2] = [kort(2, 13)];
  assert.equal(V.golf.lovlig(st, { fra: "b", i: 2 }), false, "konge på ess");
});

test("golf: motoren sier ja og nei nøyaktig som reglene i tilfeldige spill", () => {
  const r = tilfeldigeSpill(V.golf, golfForsok, golfRef, 200, 60, (n) => V.golf.del(n + 1, n % 24));
  assert.ok(r.ja > 2000 && r.nei > 10000, `for få tilfeller: ${r.ja} / ${r.nei}`);
});

test("golf: vunnet når kolonnene er tomme – også med kort igjen i bunken", () => {
  const st = { kol: [[kort(0, 5)], [], [], [], [], [], []], bunke: [kort(3, 9)], avfall: ALLE.filter((k) => k !== kort(0, 5) && k !== kort(3, 9) && k !== kort(1, 4)).concat([kort(1, 4)]) };
  assert.ok(V.golf.fraKode(V.golf.kode(st)));
  assert.equal(V.golf.vunnet(st), false);
  V.golf.utfor(st, { fra: "b", i: 0 });
  assert.equal(V.golf.vunnet(st), true);
  assert.deepEqual(ren(V.golf.fremgang(st)), { n: 35, av: 35 });
});

// ---------- Tre topper ----------

// The three peaks described another way: bottom row B0–B9, then M0–M8 (Mj under Bj and Bj+1), then
// two cards per peak (U2p under M3p and M3p+1, U2p+1 under M3p+1 and M3p+2), and the tops Tp.
const TOPP_DEKKER = (() => {
  const B = (i) => 18 + i;
  const M = (j) => 9 + j;
  const U = (u) => 3 + u;
  const d = Array.from({ length: 28 }, () => []);
  for (let j = 0; j < 9; j++) d[M(j)] = [B(j), B(j + 1)];
  for (let p = 0; p < 3; p++) {
    d[U(2 * p)] = [M(3 * p), M(3 * p + 1)];
    d[U(2 * p + 1)] = [M(3 * p + 1), M(3 * p + 2)];
    d[p] = [U(2 * p), U(2 * p + 1)];
  }
  return d;
})();
const topperRef = (st, m) => {
  if (m.fra === "s") return st.bunke.length > 0;
  if (m.fra !== "b" || !(m.i >= 0 && m.i < 28) || st.bord[m.i] < 0) return false;
  if (TOPP_DEKKER[m.i].some((j) => st.bord[j] >= 0)) return false;
  const d = Math.abs(verdi(st.bord[m.i]) - verdi(topp(st.avfall)));
  return d === 1 || d === 12; // round the corner
};

test("tre topper: 28 kort i tre topper (3, 6, 9, 10), bare bunnraden opp, 23 i bunken – og hvem som ligger på hvem", () => {
  const st = V.topper.del(42, 3);
  assert.equal(st.bord.length, 28);
  assert.equal(st.bunke.length, 23);
  assert.equal(st.avfall.length, 1);
  assert.deepEqual([...st.bord, ...st.bunke, ...st.avfall].sort((a, b) => a - b), ALLE);
  assert.deepEqual(ren(V.topper.DEKKER.map((d) => d.slice().sort((a, b) => a - b))), TOPP_DEKKER.map((d) => d.slice().sort((a, b) => a - b)));
  const frie = st.bord.map((_, i) => V.topper.fri(st, i));
  assert.deepEqual(
    ren(frie.map((f, i) => (f ? i : -1)).filter((i) => i >= 0)),
    [18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    "bare bunnraden er fri fra start",
  );
});

test("tre topper: ett opp eller ned rundt hjørnet, bare ledige kort – som reglene i tilfeldige spill", () => {
  const st = { bord: Array(28).fill(-1), bunke: [], avfall: [] };
  st.bord[18] = kort(0, 1);
  st.bord[19] = kort(1, 12);
  st.bord[9] = kort(2, 2); // under 18 and 19
  st.avfall = ALLE.filter((k) => ![kort(0, 1), kort(1, 12), kort(2, 2), kort(3, 13)].includes(k)).concat([kort(3, 13)]);
  assert.ok(V.topper.fraKode(V.topper.kode(st)));
  assert.equal(V.topper.lovlig(st, { fra: "b", i: 18 }), true, "ess på konge");
  assert.equal(V.topper.lovlig(st, { fra: "b", i: 19 }), true, "dame på konge");
  assert.equal(V.topper.lovlig(st, { fra: "b", i: 9 }), false, "et kort med kort over seg");
  const r = tilfeldigeSpill(V.topper, () => [{ fra: "s" }, ...Array.from({ length: 30 }, (_, i) => ({ fra: "b", i: i - 1 }))], topperRef, 200, 60, (n) => V.topper.del(n + 1, n % 24));
  assert.ok(r.ja > 2000 && r.nei > 20000, `for få tilfeller: ${r.ja} / ${r.nei}`);
});

test("tre topper: vunnet når alle tre toppene er ryddet", () => {
  const st = { bord: Array(28).fill(-1), bunke: [], avfall: ALLE.filter((k) => k !== 4 && k !== 16).concat([16]) };
  st.bord[0] = 4;
  assert.equal(V.topper.vunnet(st), false);
  V.topper.utfor(st, { fra: "b", i: 0 });
  assert.equal(V.topper.vunnet(st), true);
});

// ---------- Pyramide ----------

const PLASS = []; // place → [row, column]
for (let r = 0; r < 7; r++) for (let c = 0; c <= r; c++) PLASS.push([r, c]);
const pyrKort = (st, a) => {
  if (a >= 0 && a < 28) {
    const [r, c] = PLASS[a];
    if (st.bord[a] < 0) return -1;
    if (r < 6 && (st.bord[PLASS.findIndex(([x, y]) => x === r + 1 && y === c)] >= 0 || st.bord[PLASS.findIndex(([x, y]) => x === r + 1 && y === c + 1)] >= 0)) return -1;
    return st.bord[a];
  }
  if (a === 28) return st.trukket;
  if (a === 29) return st.avfall.length ? topp(st.avfall) : -1;
  return -1;
};
const pyrRef = (st, m) => {
  if (m.fra === "s") return st.bunke.length > 0;
  if (m.fra === "k") return pyrKort(st, m.a) >= 0 && verdi(pyrKort(st, m.a)) === 13;
  if (m.fra === "p") return m.a !== m.b && pyrKort(st, m.a) >= 0 && pyrKort(st, m.b) >= 0 && verdi(pyrKort(st, m.a)) + verdi(pyrKort(st, m.b)) === 13;
  return false;
};
const pyrForsok = () => {
  const ut = [{ fra: "s" }];
  for (let a = 0; a < 30; a++) ut.push({ fra: "k", a });
  for (let a = 0; a < 30; a++) for (let b = a + 1; b < 30; b++) ut.push({ fra: "p", a, b });
  return ut;
};

test("pyramide: sju rader (28 kort), 24 i bunken; par som blir 13, kongen alene, bare ledige kort", () => {
  const st = V.pyramide.del(5, 11);
  assert.equal(st.bord.length, 28);
  assert.equal(st.bunke.length, 24);
  assert.deepEqual([...st.bord, ...st.bunke].sort((a, b) => a - b), ALLE);
  const p = { bord: Array(28).fill(-1), bunke: [], trukket: kort(1, 6), avfall: [kort(2, 13), kort(3, 7)], kast: [] };
  p.bord[27] = kort(0, 6);
  p.bord[26] = kort(0, 12);
  p.bord[20] = kort(1, 1); // lies on 26 and 27
  p.kast = ALLE.filter((k) => ![...p.bord, p.trukket, ...p.avfall].includes(k));
  assert.ok(V.pyramide.fraKode(V.pyramide.kode(p)));
  assert.equal(V.pyramide.lovlig(p, { fra: "p", a: 27, b: 29 }), true, "6 og 7 (øverst på kastebunken)");
  assert.equal(V.pyramide.lovlig(p, { fra: "p", a: 28, b: 29 }), true, "trukket 6 og 7 på kastebunken");
  assert.equal(V.pyramide.lovlig(p, { fra: "p", a: 26, b: 20 }), false, "dame og ess – men esset ligger under");
  assert.equal(V.pyramide.lovlig(p, { fra: "p", a: 27, b: 28 }), false, "6 og 6");
  assert.equal(V.pyramide.lovlig(p, { fra: "k", a: 29 }), false, "kongen under 7-eren på kastebunken");
  V.pyramide.utfor(p, { fra: "p", a: 28, b: 29 });
  assert.equal(p.trukket, -1);
  assert.equal(topp(p.avfall), kort(2, 13));
  assert.equal(V.pyramide.lovlig(p, { fra: "k", a: 29 }), true, "nå er kongen øverst");
  // Drawing: the card drawn before goes onto the waste
  const d = V.pyramide.del(9, 0);
  V.pyramide.utfor(d, { fra: "s" });
  const forste = d.trukket;
  V.pyramide.utfor(d, { fra: "s" });
  assert.equal(topp(d.avfall), forste);
  assert.equal(d.bunke.length, 22);
});

test("pyramide: motoren sier ja og nei nøyaktig som reglene i tilfeldige spill", () => {
  const r = tilfeldigeSpill(V.pyramide, pyrForsok, pyrRef, 60, 50, (n) => V.pyramide.del(n + 1, n % 24));
  assert.ok(r.ja > 800 && r.nei > 100000, `for få tilfeller: ${r.ja} / ${r.nei}`);
});

test("pyramide: vunnet først når alle 52 kort er ute – og «låst» bare når det er sant", () => {
  const p = { bord: Array(28).fill(-1), bunke: [], trukket: -1, avfall: [kort(0, 6)], kast: [] };
  p.bord[0] = kort(1, 7);
  p.kast = ALLE.filter((k) => k !== kort(1, 7) && k !== kort(0, 6));
  assert.equal(V.pyramide.vunnet(p), false);
  V.pyramide.utfor(p, { fra: "p", a: 0, b: 29 });
  assert.equal(V.pyramide.vunnet(p), true);
  // Spar 6 (row 2) and hjerter 7 under it; ruter 6 drawn and kløver 7 on the waste: it comes out.
  const l = { bord: Array(28).fill(-1), bunke: [], trukket: kort(2, 6), avfall: [kort(3, 7)], kast: [] };
  l.bord[1] = kort(0, 6);
  l.bord[3] = kort(1, 7);
  l.kast = ALLE.filter((k) => !l.bord.includes(k) && k !== l.trukket && k !== kort(3, 7));
  assert.ok(V.pyramide.fraKode(V.pyramide.kode(l)));
  assert.equal(V.pyramide.laast(l), false, "kløver 7 er ikke under spar 6");
  assert.ok(los(V.pyramide, l, 1000).trekk);
  // Both 7s under spar 6: ruter 6 takes one, and the other can never meet spar 6.
  l.avfall = [];
  l.bord[4] = kort(3, 7);
  assert.ok(V.pyramide.fraKode(V.pyramide.kode(l)));
  assert.equal(V.pyramide.laast(l), true);
  assert.equal(los(V.pyramide, l, 1000).uttomt, true, "søket bekrefter at den er låst");
});

// ---------- FreeCell ----------

const fcLoft = (st, m) => {
  if (m.fra === "c") return m.i >= 0 && m.i < 4 && st.celle[m.i] >= 0 ? [st.celle[m.i]] : null;
  const kol = st.bord[m.i];
  if (!kol || !(m.p >= 0 && m.p < kol.length)) return null;
  const r = kol.slice(m.p);
  for (let n = 1; n < r.length; n++) if (verdi(r[n]) !== verdi(r[n - 1]) - 1 || rodt(r[n]) === rodt(r[n - 1])) return null;
  return r;
};
const fcRef = (st, m) => {
  const r = fcLoft(st, m);
  if (!r) return false;
  const frie = st.celle.filter((k) => k < 0).length;
  const tomme = st.bord.filter((k) => !k.length).length;
  if (m.til === "g") return r.length === 1 && m.j === sort(r[0]) && st.grunn[m.j] === verdi(r[0]) - 1;
  if (m.til === "c") return m.fra === "b" && r.length === 1 && m.j >= 0 && m.j < 4 && st.celle[m.j] < 0;
  if (m.til !== "b" || !(m.j >= 0 && m.j < 8) || (m.fra === "b" && m.i === m.j)) return false;
  const mal = st.bord[m.j];
  if (!mal.length) return r.length <= (frie + 1) * 2 ** (tomme - 1);
  const t = topp(mal);
  return r.length <= (frie + 1) * 2 ** tomme && verdi(r[0]) === verdi(t) - 1 && rodt(r[0]) !== rodt(t);
};
const fcForsok = (st) => {
  const kilder = [0, 1, 2, 3].map((i) => ({ fra: "c", i }));
  st.bord.forEach((kol, i) => kol.forEach((_, p) => kilder.push({ fra: "b", i, p })));
  const ut = [];
  for (const k of kilder) {
    for (let j = 0; j < 4; j++) ut.push({ ...k, til: "g", j }, { ...k, til: "c", j });
    for (let j = 0; j < 8; j++) ut.push({ ...k, til: "b", j });
  }
  return ut;
};

test("freecell: åtte kolonner (7, 7, 7, 7, 6, 6, 6, 6) med alle kortene opp, fire tomme celler", () => {
  const st = V.freecell.del(1234, 0);
  const hjem = st.grunn.reduce((a, b) => a + b, 0);
  assert.equal(st.bord.reduce((a, k) => a + k.length, 0) + hjem, 52);
  assert.deepEqual(ren(st.celle), [-1, -1, -1, -1]);
  // Before the aces that lie on top go home by themselves, the columns are 7, 7, 7, 7, 6, 6, 6, 6.
  const rå = V.stokk(52, 1234);
  for (let i = 0; i < 8; i++) assert.equal(rå.filter((_, n) => n % 8 === i).length, i < 4 ? 7 : 6);
});

test("freecell: annenhver farge nedover, én i hver celle, og flere kort bare når det er plass til å flytte dem ett og ett", () => {
  const st = { bord: [[kort(0, 10), kort(1, 9), kort(3, 8)], [kort(2, 11)], [], [kort(0, 9)], [], [], [], []], celle: [kort(0, 1), kort(0, 2), -1, -1], grunn: [0, 0, 0, 0] };
  const brukt = new Set([...st.bord.flat(), ...st.celle]);
  st.bord[7] = ALLE.filter((k) => !brukt.has(k));
  st.bord[4] = st.bord[7].splice(0, 10);
  st.bord[5] = st.bord[7].splice(0, 10);
  st.bord[6] = st.bord[7].splice(0, 10);
  assert.ok(V.freecell.fraKode(V.freecell.kode(st)));
  // 2 free cells, 1 empty column: (2 + 1) × 2 = 6 onto a column, (2 + 1) × 1 = 3 into the empty one
  assert.equal(V.freecell.kapasitet(st, false), 6);
  assert.equal(V.freecell.kapasitet(st, true), 3);
  assert.equal(V.freecell.lovlig(st, { fra: "b", i: 0, p: 0, til: "b", j: 1 }), true, "10-9-8 på knekt");
  assert.equal(V.freecell.lovlig(st, { fra: "b", i: 3, p: 0, til: "b", j: 0 }), false, "svart 9 på … 8");
  assert.equal(V.freecell.lovlig(st, { fra: "c", i: 0, til: "g", j: 0 }), true, "esset hjem");
  assert.equal(V.freecell.lovlig(st, { fra: "c", i: 1, til: "g", j: 0 }), false, "2-eren før esset");
  assert.equal(V.freecell.lovlig(st, { fra: "b", i: 0, p: 1, til: "c", j: 2 }), false, "to kort i en celle");
  assert.equal(V.freecell.lovlig(st, { fra: "c", i: 0, til: "c", j: 2 }), false, "fra celle til celle");
  // All cells full and one empty column: two cards onto a column, one into the empty column.
  st.celle = [kort(0, 1), kort(0, 2), st.bord[4].pop(), st.bord[5].pop()];
  assert.ok(V.freecell.fraKode(V.freecell.kode(st)));
  assert.equal(V.freecell.kapasitet(st, false), 2);
  assert.equal(V.freecell.kapasitet(st, true), 1);
  assert.equal(V.freecell.lovlig(st, { fra: "b", i: 0, p: 0, til: "b", j: 1 }), false, "tre kort er for mange nå");
  assert.equal(V.freecell.lovlig(st, { fra: "b", i: 0, p: 1, til: "b", j: 2 }), false, "to kort til den tomme kolonnen er for mange");
  assert.equal(V.freecell.lovlig(st, { fra: "b", i: 0, p: 2, til: "b", j: 2 }), true, "ett kort til den tomme kolonnen");
  const r = tilfeldigeSpill(V.freecell, fcForsok, fcRef, 80, 60, (n) => V.freecell.del(n + 1, n % 8));
  assert.ok(r.ja > 5000 && r.nei > 200000, `for få tilfeller: ${r.ja} / ${r.nei}`);
});

test("freecell: kort som ingen kan trenge lenger, går hjem av seg selv – andre blir liggende", () => {
  const st = { bord: [[kort(1, 3)], [kort(0, 2)], [kort(1, 2)], [], [], [], [], []], celle: [-1, -1, -1, -1], grunn: [1, 1, 0, 0] };
  const brukt = new Set([...st.bord.flat(), kort(0, 1), kort(1, 1)]);
  st.bord[7] = ALLE.filter((k) => !brukt.has(k));
  assert.ok(V.freecell.fraKode(V.freecell.kode(st)));
  const auto = V.freecell.autoHjem(st);
  assert.deepEqual(ren(auto.map((a) => a.k).sort((a, b) => a - b)), [kort(0, 2), kort(1, 2)], "2-erne går hjem");
  assert.deepEqual(ren(st.bord[0]), [kort(1, 3)], "hjerter 3 blir liggende: kløver 2 kan fortsatt trenge den");
  // Won: everything home
  const v = { bord: [[kort(0, 13)], [], [], [], [], [], [], []], celle: [-1, -1, -1, -1], grunn: [12, 13, 13, 13] };
  assert.equal(V.freecell.vunnet(v), false);
  V.freecell.utfor(v, { fra: "b", i: 0, p: 0, til: "g", j: 0 });
  assert.equal(V.freecell.vunnet(v), true);
});

// ---------- Edderkopp ----------

const edFlate = (st, p) => V.edderkopp.ANSIKT(p, st.sorter);
const edRef = (st, m) => {
  if (m.fra === "s") return st.bunke.length > 0 && st.bord.every((k) => k.length);
  const kol = st.bord[m.i];
  if (!kol || !(m.p >= st.skjult[m.i] && m.p < kol.length)) return false;
  const r = kol.slice(m.p).map((p) => edFlate(st, p));
  for (let n = 1; n < r.length; n++) if (sort(r[n]) !== sort(r[0]) || verdi(r[n]) !== verdi(r[n - 1]) - 1) return false;
  if (!(m.j >= 0 && m.j < 10) || m.j === m.i) return false;
  const mal = st.bord[m.j];
  return !mal.length || verdi(edFlate(st, topp(mal))) === verdi(r[0]) + 1;
};
const edForsok = (st) => {
  const ut = [{ fra: "s" }];
  st.bord.forEach((kol, i) => kol.forEach((_, p) => {
    for (let j = 0; j < 10; j++) ut.push({ fra: "b", i, p, til: "b", j });
  }));
  return ut;
};

test("edderkopp: 104 kort, ti kolonner (6, 6, 6, 6, 5 …) med det øverste opp, 50 i bunken – én, to eller fire sorter", () => {
  for (const sorter of [1, 2, 4]) {
    const st = V.edderkopp.del(77, sorter);
    assert.deepEqual(ren(st.bord.map((k) => k.length)), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    assert.deepEqual(ren(st.skjult), [5, 5, 5, 5, 4, 4, 4, 4, 4, 4]);
    assert.equal(st.bunke.length, 50);
    const alle = [...st.bord.flat(), ...st.bunke];
    assert.equal(new Set(alle).size, 104);
    const flater = alle.map((p) => edFlate(st, p));
    const sortene = new Set(flater.map(sort));
    assert.equal(sortene.size, sorter, `${sorter} sorter`);
    for (const s of sortene) assert.equal(flater.filter((k) => sort(k) === s).length, 104 / sorter, "like mange kort i hver sort");
    for (let v = 1; v <= 13; v++) assert.equal(flater.filter((k) => verdi(k) === v).length, 8, "åtte av hver verdi");
  }
});

test("edderkopp: ned på ett høyere uansett sort, bare rekker i samme sort flyttes, ingen utdeling på en tom kolonne", () => {
  const r = tilfeldigeSpill(V.edderkopp, edForsok, edRef, 40, 80, (n) => V.edderkopp.del(n + 1, [1, 2, 4][n % 3]));
  assert.ok(r.ja > 2000 && r.nei > 200000, `for få tilfeller: ${r.ja} / ${r.nei}`);
  const st = V.edderkopp.del(3, 4);
  const ekstra = st.bord[9].splice(0);
  st.bord[8].push(...ekstra);
  st.skjult[9] = 0;
  assert.equal(V.edderkopp.lovlig(st, { fra: "s" }), false, "en tom kolonne stopper utdelingen");
  st.bord[9].push(st.bord[8].pop());
  assert.equal(V.edderkopp.lovlig(st, { fra: "s" }), true);
  const for0 = st.bord.map((k) => k.length);
  const info = V.edderkopp.utfor(st, { fra: "s" });
  assert.deepEqual(ren(st.bord.map((k) => k.length)), ren(for0.map((n) => n + 1)), "ett kort på hver kolonne");
  assert.equal(st.bunke.length, 40);
  assert.deepEqual(ren(info.ferdig), []);
});

test("edderkopp: en hel rekke fra konge til ess i én sort går hjem av seg selv, kortet under snus – og åtte rekker vinner", () => {
  const bord = Array.from({ length: 10 }, () => []);
  bord[0] = [50, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]; // a face-down card, then K … 2 of spades
  bord[1] = [0]; // the ace
  const hjem = [];
  for (let c = 1; c < 8; c++) if (c !== 3) for (let v = 12; v >= 0; v--) hjem.push(c * 13 + v);
  const brukt = new Set([...bord.flat(), ...hjem]);
  bord[2] = Array.from({ length: 104 }, (_, p) => p).filter((p) => !brukt.has(p));
  const st = { bord, skjult: [1, 0, bord[2].length - 1, 0, 0, 0, 0, 0, 0, 0], bunke: [], hjem, sorter: 1 };
  assert.ok(V.edderkopp.fraKode(V.edderkopp.kode(st)), "teststillingen er ugyldig");
  const info = V.edderkopp.utfor(st, { fra: "b", i: 1, p: 0, til: "b", j: 0 });
  assert.equal(info.ferdig.length, 1);
  assert.equal(st.hjem.length, 91);
  assert.deepEqual(ren(st.bord[0]), [50]);
  assert.equal(st.skjult[0], 0, "kortet under ble snudd");
  assert.equal(V.edderkopp.vunnet(st), false);
  assert.ok(V.edderkopp.fraKode(V.edderkopp.kode(st)));
});

test("edderkopp: et hint er alltid et lovlig trekk, og det fullfører en rekke når det kan", () => {
  for (let n = 0; n < 30; n++) {
    const st = V.edderkopp.del(n + 100, [1, 2, 4][n % 3]);
    for (let s = 0; s < 120; s++) {
      const h = V.edderkopp.hint(st);
      if (!h) break;
      assert.ok(V.edderkopp.lovlig(st, h), `hintet ${JSON.stringify(h)} er ulovlig`);
      V.edderkopp.utfor(st, h);
    }
  }
});

// ---------- Saving ----------

test("ødelagte eller juksede lagringer avvises i alle fem", () => {
  for (const [E, st] of [
    [V.golf, V.golf.del(1, 0)],
    [V.topper, V.topper.del(1, 0)],
    [V.pyramide, V.pyramide.del(1, 0)],
    [V.freecell, V.freecell.del(1, 0)],
    [V.edderkopp, V.edderkopp.del(1, 2)],
  ]) {
    const kode = E.kode(st);
    assert.ok(E.fraKode(kode), E.id);
    assert.equal(E.fraKode("tull"), null, E.id);
    assert.equal(E.fraKode(kode.replace(/^(.)/, "$1$1")), null, `${E.id}: samme kort to ganger`);
    assert.equal(E.fraKode(kode.slice(1)), null, `${E.id}: et kort mangler`);
  }
  // Edderkopp: a «finished» run at home that isn't one (two cards swapped)
  const bord = Array.from({ length: 10 }, (_, i) => [i]);
  const hjem = [];
  for (let c = 0; c < 7; c++) for (let v = 12; v >= 0; v--) hjem.push(13 + c * 13 + v);
  const ed = { bord, skjult: Array(10).fill(0), bunke: [], hjem, sorter: 1 };
  bord[9].push(10, 11, 12);
  assert.ok(V.edderkopp.fraKode(V.edderkopp.kode(ed)), "teststillingen er ugyldig");
  [ed.hjem[1], ed.hjem[2]] = [ed.hjem[2], ed.hjem[1]];
  assert.equal(V.edderkopp.fraKode(V.edderkopp.kode(ed)), null, "konge, knekt, dame … er ikke en hel rekke");
});

// ---------- The searches and the proven deals ----------

test("søkene i små steg gir samme svar som i ett strekk", () => {
  for (const [E, st, maks] of [
    [V.golf, V.golf.del(KABALER.golf[0], 3), 300000],
    [V.topper, V.topper.del(KABALER.topper[0], 5), 300000],
    [V.freecell, V.freecell.del(KABALER.freecell[0], 2), 40000],
  ]) {
    const hel = los(E, st, maks);
    const l = E.loser(E.fraKode(E.kode(st)), maks);
    let runder = 0;
    while (!l.kjor(97)) assert.ok(++runder < 1e6);
    assert.deepEqual(ren(l.resultat().trekk), ren(hel.trekk), E.id);
  }
});

test("de lagrede løsbare kabalene kan faktisk løses – også med andre sorter (stikkprøve, spilt helt ut etter reglene)", () => {
  assert.ok(KABALER.golf.length >= 300 && KABALER.topper.length >= 500 && KABALER.pyramide.length >= 200 && KABALER.freecell.length >= 1000, "for få løsbare kabaler");
  for (const id of ["golf", "topper", "pyramide", "freecell"]) {
    const E = V[id];
    assert.equal(new Set(KABALER[id]).size, KABALER[id].length, `${id}: samme kabal to ganger i listen`);
    const prove = [KABALER[id][0], KABALER[id][KABALER[id].length - 1], KABALER[id][Math.floor(KABALER[id].length / 2)]];
    prove.forEach((fro, n) => {
      const bytte = id === "freecell" ? (n * 3 + 1) % 8 : (n * 7 + 5) % 24;
      const st = E.del(fro, bytte);
      const r = los(E, st, id === "freecell" ? 200000 : 400000);
      assert.ok(r.trekk, `${id} ${fro} (bytte ${bytte}) ble ikke løst`);
      assert.ok(E.vunnet(spill(E, st, r.trekk)), `${id} ${fro}: løsningen vant ikke`);
    });
  }
});

test("et tomt søk er et bevis: en stilling uten trekk er låst i golf, tre topper og pyramide", () => {
  const g = { kol: [[kort(0, 3)], [], [], [], [], [], []], bunke: [], avfall: ALLE.filter((k) => k !== kort(0, 3) && k !== kort(1, 9)).concat([kort(1, 9)]) };
  assert.deepEqual(ren(V.golf.trekk(g)), []);
  assert.equal(los(V.golf, g, 1000).uttomt, true);
  const t = { bord: Array(28).fill(-1), bunke: [], avfall: ALLE.filter((k) => k !== 4 && k !== kort(1, 9)).concat([kort(1, 9)]) };
  t.bord[0] = 4;
  assert.equal(los(V.topper, t, 1000).uttomt, true);
  // A FreeCell search that gives up is never a proof
  const f = los(V.freecell, V.freecell.del(KABALER.freecell[0], 0), 3);
  assert.equal(f.trekk, null);
  assert.equal(f.uttomt, false);
});

test("Klondike-motoren er den samme: de nye kabalene bruker sin egen utdeling", () => {
  // The other solitaires shuffle with the same mulberry32 as Klondike, but never change KABAL.del.
  assert.equal(K.kode(K.del(974, 0, 1)), K.kode(K.del(974, 0, 1)));
  assert.notEqual(V.golf.kode(V.golf.del(974, 0)), K.kode(K.del(974, 0, 1)));
});
