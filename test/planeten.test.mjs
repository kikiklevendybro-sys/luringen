// Planeten: the physics and the merging. Loads rusj/spill/planeten/spill.js without the kit
// (node:vm): the file then only exposes the pure physics (Fys). Every game here comes from a fixed
// seed, so the runs are the same every time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/planeten/spill.js"), "utf8"), kontekst);
const F = kontekst.window.Planeten.Fys;
const j = (x) => JSON.parse(JSON.stringify(x));

const kjor = (st, steg) => {
  const ut = [];
  for (let i = 0; i < steg; i++) ut.push(...F.steg(st));
  return ut;
};
// A planet put straight into the jar (as if it had been there a while).
const legg = (st, n, x, y) => {
  const b = { id: st.nesteId++, n, x, y, px: x, py: y, vx: 0, vy: 0, a: 0, w: 0, alder: 500, vokser: 0 };
  st.b.push(b);
  return b;
};
// A small seeded generator for the tests' own choices
const lcg = (s) => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);

test("the eleven kinds grow, fit the jar, and are named in the real order by size", () => {
  assert.equal(F.RAD.length, 11);
  for (let i = 1; i < F.RAD.length; i++) assert.ok(F.RAD[i] > F.RAD[i - 1] && F.POENG[i] > F.POENG[i - 1], `kind ${i}`);
  assert.ok(2 * F.RAD[F.SIST] < F.W && F.LINJE < F.H / 4);
  assert.deepEqual(j(F.NAVN), ["Asteroide", "Månen", "Merkur", "Mars", "Venus", "Jorda", "Neptun", "Uranus", "Saturn", "Jupiter", "Sola"]);
});

test("dealing: seeded, the first four of the three smallest kinds, then the five smallest", () => {
  const a = F.nytt(42);
  const b = F.nytt(42);
  assert.deepEqual(j(a), j(b));
  const forste = [a.hold, a.neste, F.trekk(a), F.trekk(a)];
  assert.ok(forste.every((n) => n >= 0 && n <= 2), `first four: ${forste}`);
  const telt = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 5000; i++) telt[F.trekk(a)]++;
  assert.equal(telt[5], 0, "never bigger than Venus");
  assert.ok(telt.slice(0, 5).every((n) => n > 300), `all five come: ${telt}`);
  assert.ok(telt[0] > telt[4] * 2, "small planets are more common");
  assert.notDeepEqual(j(F.nytt(1)).hold + "," + j(F.nytt(1)).neste + j(F.nytt(2)).fro, j(F.nytt(1)).hold + "," + j(F.nytt(1)).neste + j(F.nytt(1)).fro);
});

test("a dropped planet falls, lands on the floor and lies still", () => {
  const st = F.nytt(7);
  const n = st.hold;
  const b = F.slipp(st, 150);
  assert.ok(b && b.n === n && b.y === F.HENG);
  assert.equal(F.slipp(st, 150), null, "no second drop before the pause is over");
  kjor(st, F.PUST);
  assert.ok(F.kanSlippe(st));
  kjor(st, 2 * F.HZ);
  assert.ok(Math.abs(b.y - (F.H - F.RAD[n])) < 0.5, `rests on the floor: ${b.y}`);
  assert.ok(Math.abs(b.vy) < 3 && Math.abs(b.vx) < 3);
  // Aiming outside the jar puts the planet just inside the wall
  const c = F.slipp(st, -50);
  assert.equal(c.x, F.RAD[c.n]);
});

test("two alike that touch merge into the next kind, at their midpoint, with points", () => {
  const st = F.nytt(1);
  st.b = [];
  const r = F.RAD[2];
  legg(st, 2, 100, F.H - r);
  legg(st, 2, 100 + 2 * r - 0.2, F.H - r);
  const ut = F.steg(st);
  assert.equal(st.b.length, 1);
  const ny = st.b[0];
  assert.equal(ny.n, 3);
  assert.ok(Math.abs(ny.x - (100 + r - 0.1)) < 1, `midpoint ${ny.x}`);
  assert.equal(st.poeng, F.POENG[3]);
  assert.equal(st.storst, 3);
  assert.equal(st.slatt, 1);
  assert.ok(ut.some((h) => h.type === "slatt" && h.n === 3 && h.poeng === F.POENG[3]));
  // It grows to its size over a few steps, then lies on the floor
  assert.ok(F.radius(ny) < F.RAD[3]);
  kjor(st, F.HZ);
  assert.equal(F.radius(ny), F.RAD[3]);
  assert.ok(Math.abs(ny.y - (F.H - F.RAD[3])) < 0.5);
});

test("different kinds never merge: they stack", () => {
  const st = F.nytt(1);
  st.b = [];
  const a = legg(st, 4, 150, F.H - F.RAD[4]);
  const c = legg(st, 3, 150, F.H - 2 * F.RAD[4] - F.RAD[3] - 5);
  kjor(st, 3 * F.HZ);
  assert.equal(st.b.length, 2);
  assert.equal(st.poeng, 0);
  const d = Math.hypot(a.x - c.x, a.y - c.y);
  assert.ok(d > F.RAD[3] + F.RAD[4] - 1, `no deep overlap: ${d}`);
});

test("a chain: the new planet merges again with its twin", () => {
  const st = F.nytt(1);
  st.b = [];
  const r1 = F.RAD[1];
  const r2 = F.RAD[2];
  // A Mercury on the floor with two moons stacked on it: the moons make a Mercury, which falls
  // onto the first one and makes Mars.
  legg(st, 2, 150, F.H - r2);
  legg(st, 1, 150, F.H - 2 * r2 - r1);
  legg(st, 1, 150, F.H - 2 * r2 - 3 * r1 + 0.2);
  kjor(st, F.HZ);
  assert.equal(st.b.length, 1, JSON.stringify(st.b.map((b) => b.n)));
  assert.equal(st.b[0].n, 3);
  assert.equal(st.poeng, F.POENG[2] + F.POENG[3]);
});

test("two suns go supernova: both vanish, 150 points", () => {
  const st = F.nytt(1);
  st.b = [];
  const r = F.RAD[F.SIST];
  legg(st, F.SIST, r, F.H - r);
  legg(st, F.SIST, 3 * r - 0.3, F.H - r);
  const ut = kjor(st, 2);
  assert.equal(st.b.length, 0);
  assert.equal(st.poeng, F.SUPERNOVA);
  assert.equal(st.soler, 1);
  assert.ok(ut.some((h) => h.type === "nova"));
});

test("a full game from a seed: nothing leaves the jar, nothing overlaps much, no NaN, and it ends", () => {
  const st = F.nytt(2026);
  const t = lcg(99);
  let ferdig = false;
  let fareFor = 0;
  for (let slipp = 0; slipp < 600 && !ferdig; slipp++) {
    F.slipp(st, 20 + t() * 260);
    for (let i = 0; i < F.PUST + 6 && !ferdig; i++) {
      fareFor = st.fare;
      for (const h of F.steg(st)) if (h.type === "over") ferdig = true;
      for (const b of st.b) {
        const r = F.radius(b);
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy), "NaN");
        assert.ok(b.x >= r - 0.01 && b.x <= F.W - r + 0.01 && b.y <= F.H - r + 0.01, `outside the jar: ${b.n} at ${b.x},${b.y}`);
      }
    }
  }
  assert.ok(ferdig && st.over, "the jar fills up in the end");
  assert.equal(fareFor, F.FARE - 1, "it ends only after 2.5 s above the line");
  assert.ok(st.b.some((b) => b.y - F.radius(b) < F.LINJE));
  assert.ok(st.slatt > 20 && st.poeng > 100, `merged ${st.slatt}, ${st.poeng} points`);
  assert.equal(F.slipp(st, 150), null, "no drops after the end");
  // Let the pile settle: the planets lie on each other, not in each other
  st.over = false;
  st.fare = -1e9;
  kjor(st, 3 * F.HZ);
  let dypest = 0;
  for (let i = 0; i < st.b.length; i++)
    for (let k = i + 1; k < st.b.length; k++) {
      const a = st.b[i];
      const c = st.b[k];
      dypest = Math.max(dypest, F.radius(a) + F.radius(c) - Math.hypot(a.x - c.x, a.y - c.y));
    }
  assert.ok(dypest < 2, `deepest overlap ${dypest.toFixed(2)}`);
});

test("the same seed and the same drops give exactly the same game", () => {
  const spill = () => {
    const st = F.nytt(5);
    const t = lcg(3);
    for (let i = 0; i < 40; i++) {
      F.slipp(st, 30 + t() * 240);
      kjor(st, 60);
    }
    return j(st);
  };
  assert.deepEqual(spill(), spill());
});

test("frame rate does not matter: 30, 60, 120 and 144 frames a second give the same steps and the same game", () => {
  const etter = (fps) => {
    const st = F.nytt(11);
    for (let i = 0; i < 8; i++) {
      legg(st, i % 5, 30 + i * 33, 100 + (i % 3) * 40);
    }
    const k = { akk: 0 };
    let steg = 0;
    for (let f = 0; f < fps * 2; f++) {
      const n = F.stegFor(k, 1000 / fps);
      for (let i = 0; i < n; i++) F.steg(st);
      steg += n;
    }
    return { steg, st: j(st) };
  };
  const a = etter(60);
  assert.equal(a.steg, 2 * F.HZ);
  for (const fps of [30, 120, 144]) {
    const b = etter(fps);
    assert.equal(b.steg, a.steg, `${fps} fps`);
    assert.deepEqual(b.st, a.st, `${fps} fps`);
  }
  // A long stall (a slow phone, a breakpoint) is cut to 250 ms: no burst of hundreds of steps
  assert.equal(F.stegFor({ akk: 0 }, 5000), 30);
});

test("the line: a fresh planet may hang above it; a planet that stays there ends the game", () => {
  const st = F.nytt(3);
  st.b = [];
  const b = legg(st, 2, 150, F.HENG);
  b.alder = 0;
  F.steg(st);
  assert.equal(st.fare, 0, "a new planet is not counted");
  // Held above the line (as if it lay on a full jar): counted every step, over after FARE steps
  b.alder = F.NAADE + 1;
  let over = false;
  for (let i = 0; i < F.FARE + 200 && !over; i++) {
    b.y = b.py = 40;
    b.vy = 0;
    over = F.steg(st).some((h) => h.type === "over");
    if (!over) assert.ok(i < F.FARE, "still going after FARE steps");
  }
  assert.ok(over && st.over);
  // Dipping back under the line lets the count fall again
  const st2 = F.nytt(3);
  st2.b = [];
  const c = legg(st2, 2, 150, 40);
  for (let i = 0; i < 100; i++) {
    c.y = c.py = 40;
    c.vy = 0;
    F.steg(st2);
  }
  assert.equal(st2.fare, 100);
  c.y = c.py = 300;
  F.steg(st2);
  assert.equal(st2.fare, 97);
});

test("the landing guide: the floor in an empty jar, on top of a planet below", () => {
  const st = F.nytt(4);
  st.hold = 2;
  assert.equal(F.lander(st, 150), F.H - F.RAD[2]);
  const b = legg(st, 5, 150, F.H - F.RAD[5]);
  assert.ok(Math.abs(F.lander(st, 150) - (b.y - F.RAD[5] - F.RAD[2])) < 1e-9);
  assert.equal(F.lander(st, 150 + F.RAD[5] + F.RAD[2] + 1), F.H - F.RAD[2], "beside it: the floor");
});
