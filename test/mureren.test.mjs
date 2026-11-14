// Mureren's engine (the pure part of rusj/spill/mureren/spill.js): every puzzle it makes – more than
// a year of daily ones and many random seeds on each level – can be laid in exactly one way. That
// is proved here by a search of its own: first every way to cut the board into domino places, then
// every way to put the dominoes on those places, with its own rule checks – not the engine's
// cell-by-cell search. Also: the rules, the board's shape and set, the win and region status.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/mureren/spill.js"));

// Every tiling of the board by dominoes (pairs of side-by-side cells).
function tilinger(p) {
  const pa = new Set(p.celler);
  const ut = [];
  const tatt = new Set();
  const par = [];
  (function videre() {
    const i = p.celler.slice().sort((a, b) => a - b).find((x) => !tatt.has(x));
    if (i == null) return void ut.push(par.slice());
    for (const j of [i + 1, i + p.B]) {
      if (j === i + 1 && j % p.B === 0) continue;
      if (!pa.has(j) || tatt.has(j)) continue;
      tatt.add(i);
      tatt.add(j);
      par.push([i, j]);
      videre();
      par.pop();
      tatt.delete(i);
      tatt.delete(j);
    }
  })();
  return ut;
}

// A region's rule against the pips it has so far (full = no empty cells left).
function regelOk(regel, v, full) {
  const s = v.reduce((a, b) => a + b, 0);
  if (regel.t === "lik") return v.every((x) => x === v[0]);
  if (regel.t === "ulik") return new Set(v).size === v.length;
  if (regel.t === "sum") return full ? s === regel.n : s <= regel.n;
  if (regel.t === "under") return s < regel.n;
  if (regel.t === "over") return full ? s > regel.n : true;
  throw new Error("ukjent regel " + regel.t);
}

function tellSelv(p, grense = 2) {
  let antall = 0;
  for (const t of tilinger(p)) {
    const verdi = new Map();
    const brukt = new Array(p.brikker.length).fill(false);
    const sjekk = () =>
      p.omrader.every((o) => {
        const v = o.celler.filter((i) => verdi.has(i)).map((i) => verdi.get(i));
        return regelOk(o.regel, v, v.length === o.celler.length);
      });
    (function legg(k) {
      if (antall >= grense) return;
      if (k === t.length) {
        antall++;
        return;
      }
      const [i, j] = t[k];
      for (let d = 0; d < p.brikker.length; d++) {
        if (brukt[d]) continue;
        const [a, b] = p.brikker[d];
        for (const [x, y] of a === b ? [[a, b]] : [[a, b], [b, a]]) {
          verdi.set(i, x);
          verdi.set(j, y);
          brukt[d] = true;
          if (sjekk()) legg(k + 1);
          brukt[d] = false;
          verdi.delete(i);
          verdi.delete(j);
        }
      }
    })(0);
    if (antall >= grense) break;
  }
  return antall;
}

function sjekkMur(p, hva) {
  const n = p.brikker.length;
  assert.equal(p.celler.length, 2 * n, `${hva}: celler`);
  assert.equal(new Set(p.celler).size, 2 * n, `${hva}: like celler`);
  assert.ok(p.B >= 1 && p.B <= 6 && p.H >= 1 && p.H <= 6, `${hva}: for stort brett (${p.B} × ${p.H})`);
  for (const i of p.celler) assert.ok(i >= 0 && i < p.B * p.H, `${hva}: celle utenfor`);
  // Dominoes: from the double-six set, never the same twice.
  const sett = new Set(p.brikker.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  assert.equal(sett.size, n, `${hva}: samme brikke to ganger`);
  for (const [a, b] of p.brikker) assert.ok(a >= 0 && a <= 6 && b >= 0 && b <= 6);
  // Regions: inside the board, no cell in two, each connected.
  const brukt = new Set();
  for (const o of p.omrader) {
    assert.ok(["sum", "lik", "ulik", "under", "over"].includes(o.regel.t), `${hva}: regel ${o.regel.t}`);
    for (const i of o.celler) {
      assert.ok(p.celler.includes(i), `${hva}: område utenfor brettet`);
      assert.ok(!brukt.has(i), `${hva}: celle i to områder`);
      brukt.add(i);
    }
    const sett2 = new Set([o.celler[0]]);
    for (let k = 0; k < o.celler.length; k++)
      for (const i of [...sett2]) for (const j of o.celler) if ((Math.abs(i - j) === p.B || (Math.abs(i - j) === 1 && Math.floor(i / p.B) === Math.floor(j / p.B))) && !sett2.has(j)) sett2.add(j);
    assert.equal(sett2.size, o.celler.length, `${hva}: et område henger ikke sammen`);
  }
  // The stored solution is a real one, and the only one.
  const lagt = p.losning.par.map(([a, b]) => ({ a, b, x: p.losning.verdi[a], y: p.losning.verdi[b] }));
  assert.ok(M.lost(p, lagt), `${hva}: løsningen holder ikke reglene`);
  assert.equal(tellSelv(p), 1, `${hva}: ikke nøyaktig én løsning`);
}

const dato = (nr) => new Date(nr * 86400000).toISOString().slice(0, 10);

test("the rules", () => {
  assert.ok(M.holder({ t: "sum", n: 8 }, [3, 5]));
  assert.ok(!M.holder({ t: "sum", n: 8 }, [3, 4]));
  assert.ok(M.holder({ t: "lik" }, [4, 4, 4]));
  assert.ok(!M.holder({ t: "lik" }, [4, 4, 3]));
  assert.ok(M.holder({ t: "ulik" }, [1, 2, 3]));
  assert.ok(!M.holder({ t: "ulik" }, [1, 2, 1]));
  assert.ok(M.holder({ t: "under", n: 4 }, [1, 2]));
  assert.ok(!M.holder({ t: "under", n: 4 }, [2, 2]));
  assert.ok(M.holder({ t: "over", n: 9 }, [5, 5]));
  assert.ok(!M.holder({ t: "over", n: 9 }, [4, 5]));
  // While a region is filling up
  assert.ok(M.kanHolde({ t: "sum", n: 12 }, [6], 1));
  assert.ok(!M.kanHolde({ t: "sum", n: 13 }, [6], 1));
  assert.ok(!M.kanHolde({ t: "sum", n: 3 }, [4], 1));
  assert.ok(M.kanHolde({ t: "over", n: 9 }, [4], 1));
  assert.ok(!M.kanHolde({ t: "over", n: 10 }, [4], 1));
  assert.equal(M.SETT.length, 28);
});

test("the search of its own agrees on tiny boards", () => {
  // Two cells, one domino: one way. Four cells in a row with two dominoes and no rules: 2 ways
  // per orientation choice – the counts must match the engine's.
  const en = { B: 2, H: 1, celler: [0, 1], brikker: [[2, 5]], omrader: [{ celler: [0], regel: { t: "sum", n: 2 } }] };
  assert.equal(tellSelv(en, 5), 1);
  assert.equal(M.tell(en, 5), 1);
  const fri = { B: 2, H: 2, celler: [0, 1, 2, 3], brikker: [[0, 1], [2, 3]], omrader: [] };
  assert.equal(tellSelv(fri, 100), M.tell(fri, 100));
  assert.equal(tellSelv(fri, 100), 16); // 2 tilings × 2 orders × 2 × 2 turns
});

test("free walls: every level, many seeds, exactly one way to lay them", () => {
  for (const niva of [1, 2, 3])
    for (let fro = 1; fro <= 40; fro++) {
      const p = M.lag(niva, fro * 4099);
      assert.equal(p.brikker.length, M.NIVAER[niva]);
      sjekkMur(p, `nivå ${niva}, frø ${fro}`);
    }
});

test("a year and a day of daily walls: one solution each, the size of the weekday, from the date", () => {
  const start = 20770; // 13 November 2026, a Friday
  const sett = new Set();
  for (let nr = start; nr < start + 370; nr++) {
    const d = dato(nr);
    const p = M.lagDaglig(d, nr);
    const ukedag = new Date(d + "T12:00:00Z").getUTCDay();
    assert.equal(p.brikker.length, M.DAGLIG_UKE[ukedag], d);
    sjekkMur(p, d);
    sett.add(JSON.stringify(p.omrader));
  }
  assert.equal(sett.size, 370, "to dager fikk samme mur");
  assert.deepEqual(M.lagDaglig("2026-11-13", 20770), M.lagDaglig("2026-11-13", 20770));
  assert.equal(M.dagligAntall(20773), 5, "mandag er minst");
});

test("solved, and the state of each region while laying", () => {
  const p = M.lagDaglig("2026-11-16", 20773);
  const alle = p.losning.par.map(([a, b]) => {
    const x = p.losning.verdi[a];
    const y = p.losning.verdi[b];
    const d = p.brikker.findIndex(([u, v]) => (u === x && v === y) || (u === y && v === x));
    return { d, a, b, x, y };
  });
  assert.ok(M.lost(p, alle));
  assert.ok(!M.lost(p, alle.slice(1)), "ikke ferdig uten alle brikkene");
  assert.ok(M.status(p, alle).every((s) => s === "ok"));
  assert.ok(M.status(p, []).every((s) => s === "tom"));
  // The same dominoes turned the wrong way round somewhere break a rule (or the board is symmetric).
  const snudd = alle.map((l, k) => (k === 0 && l.x !== l.y ? Object.assign({}, l, { x: l.y, y: l.x }) : l));
  if (snudd[0].x !== alle[0].x) assert.ok(!M.lost(p, snudd));
});
