// Maneten: the swimming, the cave generator and the collisions. Loads rusj/spill/maneten/spill.js
// without the kit (node:vm): the file then only exposes the pure rules (Dyp). Every cave comes from
// a fixed seed, so the runs are the same every time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/maneten/spill.js"), "utf8"), kontekst);
const D = kontekst.window.Maneten.Dyp;
const j = (x) => JSON.parse(JSON.stringify(x));
const METER = (m) => m * D.PER_METER;

// The middle of the safe passage at an obstacle (where the autopilot aims).
function passMidt(st, h) {
  const v = D.vegg(st, h.x);
  if (h.t === "stein") return h.side === "ned" ? (v.c + h.spiss) / 2 : (h.spiss + v.f) / 2;
  const y = D.bolleY(h, st.d);
  return h.side === "opp" ? (v.c + y - h.r) / 2 : (y + h.r + v.f) / 2;
}
// A simple autopilot: aim for the next passage, else the middle of the cave; hold when the
// jellyfish will soon be below the aim.
function autopilot(st) {
  const h = st.hindre.find((x) => x.x + (x.b || x.r) > st.d - D.R);
  let mal;
  if (h && h.x - st.d < 280) mal = passMidt(st, h);
  else {
    const v = D.vegg(st, st.d + 50);
    mal = (v.c + v.f) / 2;
  }
  // Never aim into the walls just ahead (the cave wanders between obstacles)
  let c = 0;
  let f = D.H;
  for (let x = st.d - D.R; x <= st.d + 70; x += 10) {
    const v = D.vegg(st, x);
    c = Math.max(c, v.c);
    f = Math.min(f, v.f);
  }
  mal = c + D.R + 14 > f - D.R - 14 ? (c + f) / 2 : Math.min(f - D.R - 14, Math.max(c + D.R + 14, mal));
  // Where it would stop if it changed its mind now (a bang-bang pilot, like a good player)
  const stopp = st.vy < 0 ? st.y - (st.vy * st.vy) / 2300 : st.y + (st.vy * st.vy) / 2700;
  return stopp + st.vy * 0.03 > mal;
}
function swim(fro, meter, pilot = autopilot) {
  const st = D.nytt(fro);
  const ut = [];
  while (!st.over && st.d < METER(meter)) ut.push(...D.steg(st, pilot(st)));
  return { st, ut };
}

test("the curves: faster, narrower and closer the further you get – and capped", () => {
  let f = 0;
  for (let d = 0; d < METER(2000); d += 100) {
    assert.ok(D.fart(d) >= f);
    f = D.fart(d);
  }
  assert.equal(D.fart(0), 120);
  assert.equal(D.fart(METER(5000)), 200);
  assert.equal(D.gap(0), 330);
  assert.equal(D.gap(METER(5000)), D.GAPMIN);
  assert.equal(D.pass(METER(5000)), D.PASSMIN);
  assert.equal(D.avstand(METER(5000)), D.AVSTMIN);
  assert.equal(D.meter(D.PER_METER * 12.9), 12);
});

test("holding swims up, letting go sinks; both speeds are capped", () => {
  const st = D.nytt(1);
  const y0 = st.y;
  for (let i = 0; i < 30; i++) D.steg(st, true);
  assert.ok(st.y < y0 - 10 && st.vy < 0, "rises while held");
  for (let i = 0; i < 300; i++) {
    D.steg(st, true);
    assert.ok(st.vy >= -390 - 1e-9);
    if (st.over) break;
  }
  const b = D.nytt(1);
  for (let i = 0; i < 60; i++) {
    D.steg(b, false);
    assert.ok(b.vy <= 430 + 1e-9);
  }
  assert.ok(b.y > D.H / 2 + 30, "sinks when let go");
});

test("the same seed makes the same cave and the same swim", () => {
  const a = swim(77, 400);
  const b = swim(77, 400);
  assert.deepEqual(j(a.st), j(b.st));
  assert.notDeepEqual(j(D.nytt(1).punkter), j(D.nytt(2).punkter));
});

test("fair caves: wide enough gaps, every obstacle leaves a passage, obstacles never too close (a year of seeds)", () => {
  for (let fro = 1; fro <= 365; fro++) {
    const st = D.nytt(fro * 2654435761);
    let forrige = null;
    let sett = new Set();
    // The cave is made ahead of the jellyfish: walk the camera forwards without swimming.
    for (let d = 0; d < METER(fro <= 40 ? 900 : 300); d += 30) {
      st.d = d;
      D.generer(st);
      for (const p of st.punkter) {
        assert.ok(p.c >= 0 && p.f <= D.H && p.f - p.c >= D.gap(p.x) - 1e-9, `seed ${fro}: gap at ${p.x}`);
      }
      for (const h of st.hindre) {
        if (sett.has(h.id)) continue;
        sett.add(h.id);
        assert.ok(h.x >= D.FORSTE, "nothing in the calm water at the start");
        if (forrige) assert.ok(h.x - forrige.x >= D.AVSTMIN - 1e-9, `seed ${fro}: two obstacles ${h.x - forrige.x} apart`);
        forrige = h;
        const v = D.vegg(st, h.x);
        const p = D.pass(h.x) - 1e-9;
        if (h.t === "stein") {
          const fri = h.side === "ned" ? h.spiss - v.c : v.f - h.spiss;
          assert.ok(fri >= p, `seed ${fro}: a rock leaves ${fri}`);
          assert.ok(h.side === "ned" ? h.spiss < v.f - 30 : h.spiss > v.c + 30, `seed ${fro}: a rock too small to see`);
        } else {
          // A bobbing urchin leaves the passage above itself wherever it is
          for (const t of [0, 1, 2, 3, 4, 5, 6]) {
            const y = h.y0 + h.a * Math.sin(t);
            const fri = h.side === "opp" ? y - h.r - v.c : v.f - (y + h.r);
            assert.ok(fri >= p, `seed ${fro}: an urchin leaves ${fri}`);
            assert.ok(y + h.r <= v.f + 1 && y - h.r >= v.c - 1, `seed ${fro}: an urchin inside the wall`);
          }
        }
      }
    }
  }
});

test("an autopilot swims 1 000 m through the caves of 40 seeds – the cave is always passable", () => {
  for (let fro = 1; fro <= 40; fro++) {
    const { st } = swim(fro * 7919, 1000);
    assert.ok(!st.over, `seed ${fro}: crashed (${st.krasj}) at ${D.meter(st.d)} m`);
  }
});

test("doing nothing hits the floor, holding hits the ceiling – and a crash ends the run", () => {
  const ned = swim(5, 1000, () => false);
  assert.ok(ned.st.over && ned.st.krasj === "vegg" && ned.st.y > D.H / 2);
  assert.ok(ned.ut.some((h) => h.type === "krasj"));
  const opp = swim(5, 1000, () => true);
  assert.ok(opp.st.over && opp.st.krasj === "vegg" && opp.st.y < D.H / 2);
  const d = opp.st.d;
  assert.deepEqual(j(D.steg(opp.st, true)), [], "nothing happens after the crash");
  assert.equal(opp.st.d, d);
});

test("collisions: a rock, an urchin, the walls; a pearl is collected once", () => {
  const st = D.nytt(9);
  st.hindre = [];
  st.perleliste = [];
  const v = D.vegg(st, 200);
  const midt = (v.c + v.f) / 2;
  assert.equal(D.treff(st, 200, midt), null, "free water");
  assert.equal(D.treff(st, 200, v.c + D.R - 2), "vegg");
  assert.equal(D.treff(st, 200, v.f - D.R + 2), "vegg");
  st.hindre.push({ t: "stein", side: "ned", x: 200, b: 30, spiss: midt - 20, fot: [v.f + 8, v.f + 8], id: 1 });
  assert.equal(D.treff(st, 200, midt), "stein", "on the rock");
  assert.equal(D.treff(st, 200, midt - 20 - D.R - 1), null, "just above its tip");
  assert.equal(D.treff(st, 200 - 30 - D.R - 1, v.f - D.R - 10), null, "beside its foot");
  st.hindre = [{ t: "bolle", side: "opp", x: 300, r: 16, y0: midt, a: 0, fase: 0, id: 2 }];
  assert.equal(D.treff(st, 300, midt + 16 + D.R - 4), "bolle");
  assert.equal(D.treff(st, 300, midt + 16 + D.R), null, "the spikes are forgiving");
  // A pearl right ahead
  const p = D.nytt(9);
  p.hindre = [];
  p.perleliste = [{ id: 99, x: 30, y: p.y, tatt: false }];
  p.nesteHinder = 1e9;
  let tatt = 0;
  for (let i = 0; i < 60; i++) tatt += D.steg(p, p.vy > 0).filter((h) => h.type === "perle").length;
  assert.equal(tatt, 1);
  assert.equal(p.perler, 1);
});

test("milestones every 100 m, and the saved cave stays small", () => {
  const { st, ut } = swim(3, 450);
  assert.deepEqual(
    ut.filter((h) => h.type === "milepel").map((h) => h.m),
    [100, 200, 300, 400],
  );
  assert.ok(st.punkter.length < 30 && st.hindre.length < 12 && JSON.stringify(st).length < 8000, `${JSON.stringify(st).length} bytes`);
});

test("frame rate does not matter: 30, 60 and 144 frames a second give the same swim", () => {
  const med = (fps) => {
    const st = D.nytt(21);
    const k = { akk: 0 };
    let steg = 0;
    for (let f = 0; f < fps * 3; f++) {
      const n = D.stegFor(k, 1000 / fps);
      // the finger: down during the second second (by game time: steps)
      for (let i = 0; i < n; i++, steg++) D.steg(st, steg >= D.HZ && steg < 2 * D.HZ);
    }
    return { steg, st: j(st) };
  };
  const a = med(60);
  assert.equal(a.steg, 3 * D.HZ);
  for (const fps of [30, 144]) assert.deepEqual(med(fps), a, `${fps} fps`);
});
