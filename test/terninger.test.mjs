// R.terninger (rusj/kit/terninger.js): the dice physics, in Node without a DOM. 1000 seeded throws for
// every number of dice from 1 to 6, in trays as small and as large as the kit makes them: every
// throw is at rest within 2.5 s, stays inside the tray, ends with no two dice overlapping and every
// die flat, and after relabelling the face on top is the value the game asked for, opposite faces
// sum to 7 and the labels are a real die's (one of the 24 rotations).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/kit/terninger.js"), "utf8"), { window, console });
const F = window.RusjTerninger.fysikk;

const KAST = 1000;
const RUND = 0.1; // the rounded skin the dice collide with (the cube's corners sit 0.4 from its centre)

// A tray as the kit lays it out for n dice: at least max(5.8, n + 2) × 2 dice of felt.
function brett(rnd, n) {
  const wMin = Math.max(5.8, n + 2);
  return { W: wMin + rnd() * (11 - wMin), H: 2 + rnd() * 2.8 };
}

// Where the last throw left them: anywhere on the felt, apart — or, in a tray too tight for that,
// the loose row the kit lays them in before a turn.
function liggende(rnd, n, W, H) {
  for (let forsok = 0; forsok < 50; forsok++) {
    const ut = [];
    for (let i = 0; i < n && ut.length === i; i++) {
      for (let k = 0; k < 200; k++) {
        const d = { x: 0.75 + rnd() * (W - 1.5), y: 0.75 + rnd() * (H - 1.5), q: F.qGir(rnd() * 6.283), kast: true };
        if (ut.every((o) => Math.hypot(o.x - d.x, o.y - d.y) > 1.45)) {
          ut.push(d);
          break;
        }
      }
    }
    if (ut.length === n) return ut;
  }
  const steg = Math.min(1.55, (W - 2.1) / Math.max(1, n - 1));
  return Array.from({ length: n }, (_, i) => ({ x: W / 2 + (i - (n - 1) / 2) * steg, y: H / 2 + (rnd() - 0.5) * 0.2, q: F.qGir((rnd() - 0.5) * 0.4), kast: true }));
}

// The die's rounded corners: how far outside the walls it reaches (≤ 0 is inside).
function utenfor(x, y, q, W, H) {
  const m = F.matrise(q, new Array(9));
  let verst = -Infinity;
  for (const sx of [-0.4, 0.4])
    for (const sy of [-0.4, 0.4])
      for (const sz of [-0.4, 0.4]) {
        const cx = x + m[0] * sx + m[1] * sy + m[2] * sz;
        const cy = y + m[3] * sx + m[4] * sy + m[5] * sz;
        verst = Math.max(verst, RUND - cx, cx - (W - RUND), RUND - cy, cy - (H - RUND));
      }
  return verst;
}

const qFra = (sim, f, i) => {
  const b = (f * sim.n + i) * 7;
  return [sim.spor[b + 3], sim.spor[b + 4], sim.spor[b + 5], sim.spor[b + 6]];
};

test("the labels: 24 rotations of one die, opposite faces sum to 7, all different", () => {
  assert.equal(F.MERKINGER.length, 24);
  const sett = new Set(F.MERKINGER.map((f) => f.join("")));
  assert.equal(sett.size, 24, "two rotations give the same labels");
  for (const f of F.MERKINGER) {
    assert.deepEqual([...f].sort(), [1, 2, 3, 4, 5, 6]);
    for (let a = 0; a < 6; a += 2) assert.equal(f[a] + f[a + 1], 7, `opposite faces in ${f}`);
  }
  // every value can be on top in 4 ways (a turn about the vertical)
  for (let v = 1; v <= 6; v++) assert.equal(F.MERKINGER.filter((f) => f[4] === v).length, 4);
});

test("the same seed gives the same throw", () => {
  const o = () => ({ bredde: 7.4, hoyde: 3.2, terninger: [0, 1, 2, 3, 4].map((i) => ({ x: 1 + i * 1.3, y: 2, q: F.qGir(i * 0.3), kast: true })), retning: [0.2, -1], styrke: 0.6, fro: 4242 });
  const a = F.simuler(o());
  const b = F.simuler(o());
  assert.equal(a.rammer, b.rammer);
  assert.deepEqual(Array.from(a.spor), Array.from(b.spor));
  assert.notDeepEqual(Array.from(F.simuler({ ...o(), fro: 4243 }).spor), Array.from(a.spor));
});

for (let n = 1; n <= 6; n++) {
  test(`${KAST} seeded throws with ${n} ${n === 1 ? "die" : "dice"}: at rest in 2.5 s, inside, apart, flat, the asked value on top`, () => {
    const rnd = F.mulberry32(9000 + n);
    let lengst = 0;
    let styrt = 0;
    for (let k = 0; k < KAST; k++) {
      const { W, H } = brett(rnd, n);
      const terninger = liggende(rnd, n, W, H);
      const fra = terninger.map(() => F.MERKINGER[Math.floor(rnd() * 24)]);
      const verdier = terninger.map(() => 1 + Math.floor(rnd() * 6));
      const vinkel = rnd() * Math.PI * 2;
      const hva = `kast ${k} (W ${W.toFixed(2)}, H ${H.toFixed(2)})`;
      const sim = F.simuler({ bredde: W, hoyde: H, terninger, retning: [Math.cos(vinkel), Math.sin(vinkel)], styrke: rnd(), fro: Math.floor(rnd() * 4294967296) });

      // at rest within 2.5 s
      assert.ok(sim.sov, `${hva}: not at rest`);
      const tid = (sim.rammer - 1) / sim.hz;
      assert.ok(tid <= 2.5 + 1e-9, `${hva}: took ${tid.toFixed(2)} s`);
      lengst = Math.max(lengst, tid);
      // the safety net: a die not at rest by 2.12 s glides to its rest; count it when that shows
      const f0 = Math.round(2.12 * sim.hz);
      if (sim.rammer - 1 > f0) {
        let synlig = false;
        for (let i = 0; i < n; i++) {
          const a = (f0 * n + i) * 7;
          const b = ((sim.rammer - 1) * n + i) * 7;
          const d = Math.abs(sim.spor[a + 3] * sim.spor[b + 3] + sim.spor[a + 4] * sim.spor[b + 4] + sim.spor[a + 5] * sim.spor[b + 5] + sim.spor[a + 6] * sim.spor[b + 6]);
          const grader = (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
          if (Math.hypot(sim.spor[a] - sim.spor[b], sim.spor[a + 1] - sim.spor[b + 1]) > 0.3 || grader > 25) synlig = true;
        }
        if (synlig) styrt++;
      }

      // inside the tray on every frame (a hair of give while the solver pushes it back) and fully at rest
      for (let f = 0; f < sim.rammer; f++)
        for (let i = 0; i < n; i++) {
          const b = (f * n + i) * 7;
          const ut = utenfor(sim.spor[b], sim.spor[b + 1], qFra(sim, f, i), W, H);
          assert.ok(ut <= 0.02, `${hva}: die ${i} is ${ut.toFixed(3)} outside the tray at frame ${f}`);
          assert.ok(sim.spor[b + 2] >= 0.5 - 0.06, `${hva}: die ${i} sank into the felt at frame ${f}`);
        }
      for (let i = 0; i < n; i++) {
        const s = sim.slutt[i];
        assert.ok(utenfor(s.x, s.y, s.q, W, H) <= 1e-6, `${hva}: die ${i} rests outside the tray`);
        // flat: one axis exactly vertical
        const m = F.matrise(s.q, new Array(9));
        assert.ok(Math.max(Math.abs(m[6]), Math.abs(m[7]), Math.abs(m[8])) > 0.99999, `${hva}: die ${i} is not flat`);
        // the last frame is where it rests
        const b = ((sim.rammer - 1) * n + i) * 7;
        assert.ok(Math.abs(sim.spor[b] - s.x) < 1e-5 && Math.abs(sim.spor[b + 1] - s.y) < 1e-5 && Math.abs(sim.spor[b + 2] - 0.5) < 1e-6, `${hva}: the track does not end where die ${i} rests`);
      }
      // no overlap at rest
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const o = F.overlappFlat(sim.slutt[i], sim.slutt[j]);
          assert.ok(o <= 1e-6, `${hva}: dice ${i} and ${j} overlap by ${o.toFixed(4)}`);
        }

      // relabelled: the asked value on top, a real die, painted on while it spins (never at the start)
      for (let i = 0; i < n; i++) {
        const r = F.ommerk(sim, i, verdier[i], fra[i]);
        const opp = F.oppAkse(sim.slutt[i].q);
        assert.equal(r.flater[opp], verdier[i], `${hva}: die ${i} shows ${r.flater[opp]}, asked ${verdier[i]}`);
        for (let a = 0; a < 6; a += 2) assert.equal(r.flater[a] + r.flater[a + 1], 7, `${hva}: opposite faces of die ${i}`);
        assert.ok(F.MERKINGER.some((f) => f.join("") === r.flater.join("")), `${hva}: die ${i} has labels no die has (${r.flater})`);
        if (r.bytt < 0) assert.deepEqual(r.flater, fra[i], `${hva}: die ${i} changed labels without a switch frame`);
        else {
          assert.ok(r.bytt >= 2 && r.bytt < sim.rammer - 1, `${hva}: die ${i} switches labels at frame ${r.bytt}`);
          assert.ok(sim.fart[r.bytt * n + i] >= 3, `${hva}: die ${i} switches labels while it hardly turns`);
        }
      }
    }
    // a glide you can see in the last moments is rare
    assert.ok(styrt <= KAST * 0.01, `${styrt} of ${KAST} throws ended with a visible glide`);
    assert.ok(lengst <= 2.5);
  });
}

test("dice lying still are obstacles, and only move when knocked hard", () => {
  const rnd = F.mulberry32(77);
  let rort = 0;
  for (let k = 0; k < 200; k++) {
    const terninger = liggende(rnd, 5, 8, 3.4).map((t, i) => ({ ...t, kast: i < 2 }));
    const sim = F.simuler({ bredde: 8, hoyde: 3.4, terninger, retning: [rnd() - 0.5, rnd() - 0.5], styrke: rnd(), fro: k + 1 });
    assert.ok(sim.sov);
    for (let i = 2; i < 5; i++) {
      const s = sim.slutt[i];
      if (Math.hypot(s.x - terninger[i].x, s.y - terninger[i].y) > 1e-9) rort++;
    }
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.ok(F.overlappFlat(sim.slutt[i], sim.slutt[j]) <= 1e-6);
  }
  assert.ok(rort < 200 * 3, "every die that lay still was moved");
});
