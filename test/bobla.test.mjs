// Bobla (bubble shooter): the honeycomb, where a shot lands (straight, into a bubble, off a wall,
// at the ceiling), clusters, what falls, the ceiling and new rows, the levels, the next bubble and
// the end of a run. Loads rusj/spill/bobla/spill.js without the kit (node:vm): the file then only
// exposes the pure rules (Boble).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/bobla/spill.js"), "utf8"), kontekst);
const B = kontekst.window.Bobla.Boble;
const j = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b, m) => assert.deepEqual(j(a), j(b), m);

// A board from strings, one per row: digits are kinds, "." is empty. Shifted rows (odd rows when
// forskyv is 0) have 7 cells and may be written with or without a leading space.
function brett(rader, { forskyv = 0, tak = 0 } = {}) {
  const b = B.tomt();
  b.forskyv = forskyv;
  b.tak = tak;
  rader.forEach((s, r) => {
    const celler = s.trim().replace(/\s+/g, "");
    for (let c = 0; c < celler.length; c++) b.rader[r][c] = celler[c] === "." ? 0 : Number(celler[c]);
  });
  return b;
}
const spill = (b, o = {}) => ({ modus: "brett", niva: 1, brett: b, kule: 1, neste: 1, fro: 7, poeng: 0, bom: 0, skudd: 0, sprukket: 0, falt: 0, besteFall: 0, slutt: null, vinkel: 0, ...o });
// The angle from the launcher to the centre of a cell.
const sikt = (b, r, c) => Math.atan2(B.px(b, r, c) - B.K / 2, B.SKYT_Y - B.py(b, r));

test("the honeycomb: wide rows of 8, shifted rows of 7, six neighbours that touch", () => {
  const b = B.tomt();
  assert.equal(B.K, 8);
  assert.equal(B.bredde(b, 0), 8);
  assert.equal(B.bredde(b, 1), 7);
  // Every neighbour is exactly one diameter away; nothing else is that close.
  for (let r = 0; r <= B.LINJE; r++)
    for (let c = 0; c < B.bredde(b, r); c++) {
      const nb = B.naboer(b, r, c);
      assert.ok(nb.length >= 2 && nb.length <= 6, `${r},${c}`);
      for (const [rr, cc] of nb) assert.ok(Math.abs(Math.hypot(B.px(b, r, c) - B.px(b, rr, cc), B.py(b, r) - B.py(b, rr)) - 1) < 1e-9, `${r},${c} → ${rr},${cc}`);
      for (let rr = 0; rr <= B.LINJE; rr++)
        for (let cc = 0; cc < B.bredde(b, rr); cc++) {
          const d = Math.hypot(B.px(b, r, c) - B.px(b, rr, cc), B.py(b, r) - B.py(b, rr));
          const er = nb.some(([a, z]) => a === rr && z === cc);
          if (!er && !(rr === r && cc === c)) assert.ok(d > 1.5, `${r},${c} og ${rr},${cc} er for nære uten å være naboer`);
        }
    }
  // With the parity flipped (endless pushes a row in), the shapes swap and the rule still holds.
  b.forskyv = 1;
  assert.equal(B.bredde(b, 0), 7);
  eq(B.naboer(b, 1, 0), [[1, 1], [0, 0], [2, 0]]);
});

test("attachment: straight up to the ceiling, under a bubble, beside it, and off a wall", () => {
  // Straight up on an empty board: row 0, the cell nearest the middle.
  const tom = B.tomt();
  const rett = B.bane(tom, 0);
  assert.equal(rett.r, 0);
  assert.ok([3, 4].includes(rett.c));
  eq(rett.punkter[0], [4, B.SKYT_Y]);
  // Under a bubble: it sticks right below it.
  const b = brett(["...1...."]);
  const under = B.bane(b, sikt(b, 0, 3));
  assert.equal(under.r, 1);
  assert.ok([2, 3].includes(under.c), `landet i ${under.r},${under.c}`);
  assert.ok(B.naboer(b, 1, under.c).some(([r, c]) => r === 0 && c === 3));
  // Aimed at an empty ceiling cell far from the bubble: it goes to that cell.
  const ved = B.bane(b, sikt(b, 0, 6));
  eq([ved.r, ved.c], [0, 6]);
  // The landing cell is always empty and hangs from the ceiling or a bubble.
  const tett = brett(["12121212", "2121212", "1212.212", "..1...."]);
  for (let v = -B.MAKS; v <= B.MAKS; v += 0.01) {
    const s = B.bane(tett, v);
    assert.equal(tett.rader[s.r][s.c], 0, `vinkel ${v}`);
    assert.ok(s.r === 0 || B.naboer(tett, s.r, s.c).some(([r, c]) => tett.rader[r][c]), `vinkel ${v}: fester seg ikke`);
  }
  // A bounce: the path touches the wall and mirrors; a shot aimed at the right wall lands left of
  // where a straight line would have gone out.
  const sprett = B.bane(B.tomt(), 1.2);
  assert.ok(sprett.sprett >= 1 && sprett.punkter.length >= 3);
  assert.equal(sprett.punkter[1][0], B.K - 0.5);
  assert.ok(sprett.c < B.K - 1);
  // Mirror image: the same angle to the left lands in the mirrored cell.
  const venstre = B.bane(B.tomt(), -1.2);
  assert.equal(venstre.r, sprett.r);
  assert.ok(Math.abs(B.px(B.tomt(), venstre.r, venstre.c) - (B.K - B.px(B.tomt(), sprett.r, sprett.c))) < 1e-9);
  // Aiming wider than allowed is clamped.
  eq(B.bane(B.tomt(), 9).punkter, B.bane(B.tomt(), B.MAKS).punkter);
});

test("a shot is the same as its aim line: the result lands where the path ends", () => {
  const b = B.nivaBrett(5);
  for (const v of [-1.1, -0.6, -0.2, 0, 0.3, 0.7, 1.3]) {
    const ba = B.bane(b, v);
    const sp = spill(B.kopi(b), { niva: 5, kule: 1, neste: 2 });
    const h = B.skyt(sp, v);
    eq([h.r, h.c], [ba.r, ba.c]);
    eq(h.bane, ba.punkter);
  }
});

test("clusters: three or more of the same kind pop, two do not", () => {
  const b = brett(["11.22..."]);
  const sp = spill(b, { kule: 1 });
  // Shoot a 1 into (0, 2): with (0, 0) and (0, 1) that makes three.
  const h = B.skyt(sp, sikt(b, 0, 2));
  eq([h.r, h.c], [0, 2]);
  assert.equal(h.pop.length, 3);
  assert.ok(h.pop.every((p) => p.f === 1));
  assert.equal(sp.brett.rader[0][0] + sp.brett.rader[0][1] + sp.brett.rader[0][2], 0);
  assert.equal(sp.bom, 0);
  assert.equal(h.poeng, 30);
  // Two of a kind stay, and count as a miss.
  const b2 = brett(["2.......", "......."]);
  const sp2 = spill(b2, { kule: 2 });
  const h2 = B.skyt(sp2, sikt(b2, 0, 1));
  assert.equal(h2.pop.length, 0);
  assert.equal(sp2.bom, 1);
  assert.equal(sp2.brett.rader[0][1], 2);
  // A cluster follows the honeycomb, also across shifted rows.
  const b3 = brett(["1.......", "1......", ".1......"]);
  eq(B.klynge(b3, 0, 0).length, 3);
  eq(B.klynge(b3, 2, 1).length, 3);
});

test("falling: what no longer hangs from the ceiling drops, with double points from six", () => {
  // A column of 2s hangs from one 1 at the top; popping the 1s drops the 2s.
  const b = brett(["11......", "2......", "2.......", "2......"]);
  eq(B.flytende(b), []);
  const sp = spill(b, { kule: 1 });
  const h = B.skyt(sp, sikt(b, 0, 2));
  assert.equal(h.pop.length, 3);
  assert.equal(h.fall.length, 3);
  assert.ok(h.fall.every((p) => p.f === 2));
  assert.equal(h.poeng, 3 * 10 + 3 * 20);
  assert.equal(B.antall(sp.brett), 0);
  // Six or more falling: double.
  const stor = brett(["11......", "2......", "2.......", "2......", "2.......", "2......", "2......."]);
  const sp2 = spill(stor, { kule: 1 });
  const h2 = B.skyt(sp2, sikt(stor, 0, 2));
  assert.equal(h2.fall.length, 6);
  assert.equal(h2.poeng, 30 + 6 * 40);
  // Something still held by another bubble does not fall: take the 1s away by hand.
  const holdt = brett(["11.....3", "2.....3", "22222222"]);
  holdt.rader[0][0] = holdt.rader[0][1] = 0;
  eq(B.flytende(holdt), [], "row 2 still hangs on the 3s at the right");
  holdt.rader[1][6] = 0;
  eq(B.flytende(holdt).length, 9, "without the 3 the whole lower part falls");
});

test("the ceiling: every 7th miss on a level brings it down a row; stars by how far it came", () => {
  const b = brett(["12121212", "2121212"]);
  const sp = spill(b, { kule: 3, neste: 3 });
  // Six misses (a 3 that touches no other 3) leave the ceiling where it is …
  const mal = [[2, 0], [2, 2], [2, 4], [2, 6], [3, 1], [3, 5]];
  for (const [r, c] of mal) {
    sp.kule = 3 + ((r + c) % 3);
    const h = B.skyt(sp, sikt(sp.brett, r, c));
    assert.ok(!h.senket && !h.pop.length, `skudd mot ${r},${c}`);
  }
  assert.equal(sp.bom, 6);
  assert.equal(sp.brett.tak, 0);
  // … the seventh brings it down.
  sp.kule = 6;
  const h7 = B.skyt(sp, sikt(sp.brett, 3, 3));
  assert.ok(h7.senket && !h7.pop.length);
  assert.equal(sp.brett.tak, 1);
  assert.equal(sp.bom, 0);
  // The rows keep their places on the ceiling; only their height on screen changes.
  assert.equal(sp.brett.rader[0][0], 1);
  assert.equal(B.py(sp.brett, 0), 0.5 + B.RH);
  assert.equal(B.stjerner(0), 3);
  assert.equal(B.stjerner(1), 3);
  assert.equal(B.stjerner(2), 2);
  assert.equal(B.stjerner(4), 1);
});

test("endless: a new row pushes in from the top, keeps the honeycomb, and comes every few misses", () => {
  const tilf = B.rng(42);
  const b = B.startBrett(tilf);
  const for1 = j(b.rader);
  B.nyRad(b, tilf, 4);
  assert.equal(b.forskyv, 1);
  assert.equal(B.bredde(b, 0), 7);
  eq(b.rader.slice(1, 6), for1.slice(0, 5), "the old rows move down one");
  assert.ok(b.rader[0].slice(0, 7).every((v) => v >= 1 && v <= 4) && b.rader[0][7] === 0);
  eq(B.flytende(b), [], "nothing floats after a push");
  assert.ok(B.gyldigBrett(b));
  // Every neighbour pair is still one diameter apart after the push.
  for (const [r, c] of B.alle(b)) for (const [rr, cc] of B.naboer(b, r, c)) assert.ok(Math.abs(Math.hypot(B.px(b, r, c) - B.px(b, rr, cc), B.py(b, r) - B.py(b, rr)) - 1) < 1e-9);
  // In play: six misses, then a row.
  const sp = B.nyttSpill("uendelig", 0, 99);
  assert.equal(B.bomGrense(sp), 6);
  const rader = (s) => s.brett.rader.filter((r) => r.some(Boolean)).length;
  const n0 = rader(sp);
  let nye = 0;
  for (let i = 0; i < 40 && !nye && !sp.slutt; i++) {
    const kule = sp.kule;
    // Shoot each bubble somewhere it cannot pop: next to a different kind at the edge if we can.
    const h = B.skyt(sp, (i % 2 ? 1 : -1) * 1.3);
    nye += h.nyeRader;
    if (h.pop.length) assert.ok(h.pop.every((p) => p.f === kule));
  }
  assert.ok(nye >= 1 || sp.slutt, "no new row after many shots");
  if (nye) assert.ok(rader(sp) >= n0);
  assert.equal(B.bomGrense({ modus: "uendelig", poeng: 2500 }), 5);
  assert.equal(B.bomGrense({ modus: "uendelig", poeng: 9000 }), 4);
});

test("the end: a bubble in the row under the line ends the run; an empty board wins the level", () => {
  // A long column that reaches row 10; one more miss below it ends the run.
  const rader = ["1......."];
  for (let r = 1; r <= 10; r++) rader.push(r % 2 ? "1......" : "1.......");
  const b = brett(rader);
  assert.equal(B.nederst(b), 10);
  assert.ok(!B.overLinja(b));
  const sp = spill(b, { kule: 2, neste: 2 });
  const h = B.skyt(sp, sikt(b, 11, 0));
  assert.equal(h.r, 11);
  assert.equal(h.slutt, "tapt");
  assert.equal(sp.slutt, "tapt");
  // The ceiling coming down can end it too.
  const lav = brett(["12121212", "2121212"], { tak: 9 });
  const sp2 = spill(lav, { kule: 3, neste: 3, bom: 6 });
  const h2 = B.skyt(sp2, 0.2);
  assert.ok(h2.senket);
  assert.equal(h2.slutt, "tapt");
  // Popping the last bubbles wins, with a bonus by the stars.
  const sist = brett(["11......"]);
  const sp3 = spill(sist, { kule: 1 });
  const h3 = B.skyt(sp3, sikt(sist, 0, 2));
  assert.equal(h3.slutt, "vunnet");
  assert.ok(h3.rent);
  assert.equal(h3.bonus, 300);
  assert.equal(sp3.poeng, 30 + 300);
  // Endless never ends on an empty board: bonus and four new rows.
  const sp4 = spill(brett(["11......"]), { modus: "uendelig", niva: 0, kule: 1 });
  const h4 = B.skyt(sp4, sikt(sp4.brett, 0, 2));
  assert.equal(h4.slutt, null);
  assert.equal(h4.nyeRader, 4);
  assert.equal(h4.bonus, 500);
  assert.ok(B.antall(sp4.brett) >= 4 * 7);
});

test("the next bubble: always a kind that is still on the board", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const sp = B.nyttSpill("brett", 1 + (fro % 20), fro);
    for (let i = 0; i < 25 && !sp.slutt; i++) {
      const h = B.skyt(sp, -1.3 + ((i * 0.37 + fro * 0.11) % 2.6));
      if (sp.slutt) break;
      const finnes = B.farger(sp.brett);
      assert.ok(finnes.includes(sp.kule), `fro ${fro}, skudd ${i}: ${sp.kule} er ikke på brettet (${finnes})`);
      assert.ok(finnes.includes(sp.neste), `fro ${fro}, skudd ${i}: neste ${sp.neste} er ikke på brettet`);
      assert.ok(h.pop.length === 0 || h.pop.length >= 3);
      eq(B.flytende(sp.brett), [], "nothing floats after a shot");
    }
  }
  // Swapping is free and changes nothing else.
  const sp = spill(brett(["12......"]), { kule: 1, neste: 2 });
  B.bytt(sp);
  eq([sp.kule, sp.neste], [2, 1]);
});

test("levels: the same board every time, more kinds and rows as they go, nothing floating", () => {
  eq(B.nivaBrett(7), B.nivaBrett(7));
  assert.notDeepEqual(j(B.nivaBrett(7)), j(B.nivaBrett(8)));
  for (let n = 1; n <= 300; n++) {
    const b = B.nivaBrett(n);
    const k = B.nivaFarger(n);
    assert.ok(B.gyldigBrett(b), `brett ${n} er ugyldig`);
    eq(B.flytende(b), [], `brett ${n} har flytende bobler`);
    const f = B.farger(b);
    assert.ok(f.length >= 2 && f.length <= k, `brett ${n}: ${f.length} sorter, ventet opptil ${k}`);
    assert.ok(B.antall(b) >= 16, `brett ${n} har bare ${B.antall(b)} bobler`);
    assert.ok(B.nederst(b) <= B.nivaRader(n) - 1 && B.nederst(b) < B.LINJE - 3, `brett ${n} starter for nær streken`);
    assert.ok(b.rader[0].slice(0, 8).filter(Boolean).length >= 4, `brett ${n} henger i for få bobler`);
  }
  assert.equal(B.nivaFarger(1), 3);
  assert.equal(B.nivaFarger(20), 6);
  // The first level: three kinds, four rows.
  assert.equal(B.nivaRader(1), 4);
});

test("a game can be played to the end: levels are winnable by aiming at matches", () => {
  // A simple player: aim at the landing cell that pops the most; else the shot that lands highest.
  // No level should take more than 200 shots; most end in a win.
  let vunnet = 0;
  for (let n = 1; n <= 18; n++) {
    const sp = B.nyttSpill("brett", n, 1000 + n);
    let i = 0;
    while (!sp.slutt && i++ < 200) {
      let best = null;
      for (let v = -1.36; v <= 1.36; v += 0.04) {
        const ba = B.bane(sp.brett, v);
        const kopi = B.kopi(sp.brett);
        kopi.rader[ba.r][ba.c] = sp.kule;
        const kl = B.klynge(kopi, ba.r, ba.c).length;
        const verdi = (kl >= 3 ? 100 + kl : kl) - ba.r * 0.01;
        if (!best || verdi > best.verdi) best = { v, verdi };
      }
      B.skyt(sp, best.v);
    }
    assert.ok(sp.slutt, `brett ${n} ble aldri ferdig`);
    if (sp.slutt === "vunnet") vunnet++;
  }
  assert.ok(vunnet >= 15, `bare ${vunnet} av 18 brett vunnet av den enkle spilleren`);
});

test("saved boards: wrong shapes, unknown kinds and floating bubbles are refused", () => {
  assert.ok(B.gyldigBrett(B.nivaBrett(3)));
  const b = B.nivaBrett(3);
  b.rader[5][7] = 2; // a shifted row's missing cell
  assert.ok(!B.gyldigBrett(b));
  const c = B.nivaBrett(3);
  c.rader[9][0] = 1; // floating
  assert.ok(!B.gyldigBrett(c));
  const d = B.nivaBrett(3);
  d.rader[0][0] = 9;
  assert.ok(!B.gyldigBrett(d));
  assert.ok(!B.gyldigBrett({ rader: [], forskyv: 0, tak: 0 }));
  assert.ok(!B.gyldigBrett(null));
});
