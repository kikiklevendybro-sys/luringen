// Murbrekkeren: the ball, the bricks, the paddle and the levels. Loads
// rusj/spill/murbrekkeren/spill.js without the kit (node:vm): the file then only exposes the pure
// rules (Mur). Every game here comes from a fixed seed, so the runs are the same every time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/murbrekkeren/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Murbrekkeren.Mur;
const j = (x) => JSON.parse(JSON.stringify(x));
const lcg = (s) => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);

// A bare level: no bricks except the ones a test puts in, the ball already flying.
function tomt(fro = 1) {
  const st = M.nytt(fro, 1);
  st.steiner = [{ k: 0, r: 0, x: -400, y: -400, type: "vanlig", hp: 1, farge: 1, kraft: null }]; // out of reach: keeps the level going
  st.venter = false;
  return st;
}
const stein = (x, y, type = "vanlig", kraft = null) => ({ k: 0, r: 0, x, y, type, hp: type === "hard" ? 2 : type === "stal" ? -1 : 1, farge: 2, kraft });

// An autopilot: the paddle waits where the falling ball will come down, a little to one side
// (chosen at random after every paddle hit, so the angles vary like a player's).
function lagPilot(t) {
  let del = null;
  return (st) => {
    const fallende = st.baller.filter((b) => b.vy > 0).sort((a, b) => b.y - a.y)[0];
    if (fallende) {
      if (del == null) del = (t() * 2 - 1) * 0.8;
      let x = fallende.x + (fallende.vx * (M.PY - M.BR - fallende.y)) / fallende.vy;
      const span = M.W - 2 * M.BR;
      x -= M.BR;
      x = ((x % (2 * span)) + 2 * span) % (2 * span);
      if (x > span) x = 2 * span - x;
      x += M.BR;
      M.styr(st, x - del * (st.padW / 2));
    }
    const ut = M.steg(st);
    if (ut.some((h) => h.type === "racket")) del = null;
    return ut;
  };
}

test("twelve levels: ten wide, at most nine rows, known bricks, enough to break, and named", () => {
  assert.equal(M.BRETT.length, 12);
  const navn = new Set();
  for (const [n, rader] of M.BRETT) {
    assert.ok(n && !navn.has(n), n);
    navn.add(n);
    assert.ok(rader.length >= 3 && rader.length <= 9, n);
    for (const r of rader) assert.match(r, /^[.1-6HS+]{10}$/, `${n}: ${r}`);
    const st = M.nytt(1, M.BRETT.findIndex((b) => b[0] === n) + 1);
    assert.ok(M.igjen(st) >= 12, `${n}: ${M.igjen(st)} bricks`);
    for (const s of st.steiner) assert.ok(s.x >= 0 && s.x + M.BW <= M.W && s.y + M.BH < M.PY - 120, `${n}: a brick too low`);
    assert.ok(st.steiner.some((s) => s.kraft), `${n}: no capsule`);
  }
});

test("every breakable brick can be reached: no steel walls closed all round", () => {
  for (const [n, rader] of M.BRETT) {
    const H = rader.length + 1;
    const fri = (k, r) => r === rader.length || rader[r][k] !== "S";
    const sett = new Set();
    const ko = [];
    for (let k = 0; k < 10; k++) {
      sett.add(`${k},${rader.length}`);
      ko.push([k, rader.length]);
    }
    while (ko.length) {
      const [k, r] = ko.pop();
      for (const [dk, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = k + dk;
        const b = r + dr;
        if (a < 0 || a > 9 || b < 0 || b >= H || sett.has(`${a},${b}`) || !fri(a, b)) continue;
        sett.add(`${a},${b}`);
        ko.push([a, b]);
      }
    }
    rader.forEach((rad, r) => [...rad].forEach((c, k) => c !== "." && c !== "S" && assert.ok(sett.has(`${k},${r}`), `${n}: the brick at ${k},${r} is shut in`)));
  }
});

test("the speed: each level a little faster, never so fast that a step is longer than the ball's radius", () => {
  for (let nr = 1; nr < 40; nr++) {
    assert.ok(M.grunnfart(nr + 1) >= M.grunnfart(nr));
    assert.ok((M.toppfart(nr) * M.DT) < M.BR, `level ${nr}`);
  }
  assert.equal(M.grunnfart(1), 215);
  assert.equal(M.grunnfart(99), 300);
});

test("the paddle: the middle sends the ball straight up, the ends up to 60°; it only bounces from above", () => {
  for (const [del, vinkel] of [[0, 0], [1, 60], [-1, -60], [0.5, 30]]) {
    const st = tomt();
    st.padX = 150;
    const x = 150 + del * (st.padW / 2 + M.BR);
    st.baller = [{ x, y: M.PY - M.BR - 1, px: x, py: M.PY - M.BR - 1, vx: 0, vy: 200 }];
    const ut = M.steg(st);
    const b = st.baller[0];
    assert.ok(ut.some((h) => h.type === "racket"), `del ${del}`);
    assert.ok(Math.abs((Math.atan2(b.vx, -b.vy) * 180) / Math.PI - vinkel) < 1e-6, `del ${del}: ${b.vx}, ${b.vy}`);
    assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - st.fart) < 1e-9);
  }
  // Rising through the paddle (it came from the side) does nothing
  const st = tomt();
  st.baller = [{ x: 150, y: M.PY + 2, px: 150, py: M.PY + 2, vx: 0, vy: -200 }];
  assert.ok(!M.steg(st).some((h) => h.type === "racket"));
});

test("walls and the ceiling turn the ball and keep its speed; a ball under the paddle is lost", () => {
  const st = tomt();
  st.baller = [{ x: 8, y: 200, px: 8, py: 200, vx: -240, vy: -100 }];
  for (let i = 0; i < 5; i++) M.steg(st);
  assert.ok(st.baller[0].vx > 0 && Math.abs(Math.hypot(st.baller[0].vx, st.baller[0].vy) - Math.hypot(240, 100)) < 1e-9);
  st.baller = [{ x: 150, y: 8, px: 150, py: 8, vx: 50, vy: -240 }];
  for (let i = 0; i < 5; i++) M.steg(st);
  assert.ok(st.baller[0].vy > 0);
  // Lost: the paddle far away
  st.padX = 30;
  st.baller = [{ x: 250, y: M.PY + 20, px: 250, py: M.PY + 20, vx: 0, vy: 240 }];
  const liv = st.liv;
  let ut = [];
  for (let i = 0; i < 60; i++) ut.push(...M.steg(st));
  assert.equal(st.liv, liv - 1);
  assert.ok(st.venter && st.baller.length === 1 && ut.some((h) => h.type === "liv"));
  assert.ok(M.skyt(st) && !st.venter && st.baller[0].vy < 0, "the next ball is sent off");
  assert.equal(M.skyt(st), false, "only once");
});

test("bricks: an ordinary one breaks, a hard one needs two hits, steel never breaks; points", () => {
  const st = tomt();
  st.steiner.push(stein(136, 100), stein(136, 160, "hard"), stein(136, 220, "stal"));
  const skyt = (y) => {
    st.baller = [{ x: 150, y, px: 150, py: y, vx: 0, vy: -240 }];
    const ut = [];
    for (let i = 0; i < 30; i++) ut.push(...M.steg(st));
    return ut;
  };
  let ut = skyt(250);
  assert.ok(ut.some((h) => h.type === "stal") && st.steiner[3].hp === -1 && st.poeng === 0, "steel");
  st.steiner[3].hp = 0; // out of the way
  ut = skyt(190);
  assert.ok(ut.some((h) => h.type === "sprekk") && st.steiner[2].hp === 1 && st.poeng === 10, "hard, first hit");
  ut = skyt(190);
  assert.ok(ut.some((h) => h.type === "knust" && h.hard) && st.steiner[2].hp === 0 && st.poeng === 30, "hard, second hit");
  ut = skyt(130);
  assert.ok(ut.some((h) => h.type === "knust") && st.steiner[1].hp === 0 && st.poeng === 40 && st.knust === 2, "ordinary");
  assert.ok(st.baller[0].vy > 0, "the ball turned");
  // Two bricks side by side, hit at the seam: both break, the ball turns once
  const to = tomt();
  to.steiner.push(stein(120, 100), stein(150, 100));
  to.baller = [{ x: 149, y: 130, px: 149, py: 130, vx: 0, vy: -240 }];
  for (let i = 0; i < 30; i++) M.steg(to);
  assert.equal(to.knust, 2);
  assert.ok(to.baller[0].vy > 0);
});

test("capsules: a wider paddle for 12 s, three balls, a slower ball, an extra ball (at most five)", () => {
  const st = tomt();
  st.baller = [{ x: 150, y: 200, px: 150, py: 200, vx: 60, vy: -200 }];
  M.ta(st, "bred");
  assert.equal(st.padW, M.PB_BRED);
  for (let i = 0; i < 12 * M.HZ; i++) {
    st.baller = [{ x: 150, y: 200, px: 150, py: 200, vx: 0, vy: 0 }];
    M.steg(st);
  }
  assert.equal(st.padW, M.PB);
  st.baller = [{ x: 150, y: 200, px: 150, py: 200, vx: 60, vy: -200 }];
  M.ta(st, "multi");
  assert.equal(st.baller.length, 3);
  for (const b of st.baller) assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - Math.hypot(60, 200)) < 1e-9 && b.vy < 0);
  st.baller = [{ x: 150, y: 200, px: 150, py: 200, vx: 0, vy: -240 }];
  M.ta(st, "sakte");
  M.steg(st);
  assert.ok(Math.abs(200 - st.baller[0].y - 240 * 0.68 * M.DT) < 1e-9, "slower");
  for (let i = 0; i < 6; i++) M.ta(st, "liv");
  assert.equal(st.liv, M.LIV_MAKS);
  // A capsule falls from its brick and is caught by the paddle
  const k = tomt();
  k.steiner.push(stein(136, 100, "vanlig", "liv"));
  k.liv = 2;
  k.padX = 150;
  k.baller = [{ x: 150, y: 130, px: 150, py: 130, vx: 0, vy: -240 }];
  const ut = [];
  for (let i = 0; i < 6 * M.HZ && !ut.some((h) => h.type === "kraft"); i++) {
    k.baller = k.baller.length ? k.baller : [{ x: 150, y: 50, px: 150, py: 50, vx: 0, vy: -1 }];
    ut.push(...M.steg(k));
  }
  assert.ok(ut.some((h) => h.type === "kraft" && h.kraft === "liv") && k.liv === 3);
});

test("three lost balls end the game", () => {
  const st = M.nytt(4, 1);
  const ut = [];
  for (let liv = 0; liv < 3; liv++) {
    M.skyt(st);
    st.padX = 30;
    st.baller[0].vx = 0;
    st.baller[0].vy = 280;
    st.baller[0].x = st.baller[0].px = 280;
    for (let i = 0; i < 400 && !st.over && !st.venter; i++) ut.push(...M.steg(st));
  }
  assert.ok(st.over && st.liv === 0 && ut.some((h) => h.type === "over"));
  assert.equal(M.skyt(st), false);
  assert.deepEqual(j(M.steg(st)), []);
});

test("an autopilot clears all twelve levels; the ball never ends up in a brick or outside the board", () => {
  const t = lcg(2026);
  for (let nr = 1; nr <= 12; nr++) {
    const st = M.nytt(nr * 31, nr);
    const pilot = lagPilot(t);
    let steg = 0;
    while (!st.klart && steg < 15 * 60 * M.HZ) {
      if (st.venter) {
        M.styr(st, 60 + t() * 180);
        M.skyt(st);
      }
      pilot(st);
      steg++;
      if (st.over) {
        st.over = false;
        st.liv = 3;
        st.baller = [{ x: st.padX, y: M.PY - M.BR - 0.5, px: st.padX, py: M.PY - M.BR - 0.5, vx: 0, vy: 0 }];
        st.venter = true;
      }
      for (const b of st.baller) {
        assert.ok(b.x >= M.BR - 1e-9 && b.x <= M.W - M.BR + 1e-9 && b.y >= M.BR - 1e-9, `level ${nr}: the ball left the board`);
        assert.ok(!st.steiner.some((s) => s.hp !== 0 && M.overlapp(b, s)), `level ${nr}: the ball is inside a brick`);
        assert.ok(Math.hypot(b.x - b.px, b.y - b.py) < M.BR, `level ${nr}: a step longer than the radius`);
      }
    }
    assert.ok(st.klart, `level ${nr} (${M.BRETT[nr - 1][0]}) not cleared: ${M.igjen(st)} bricks left after ${Math.round(steg / M.HZ)} s`);
    assert.ok(st.poeng > 0);
    // The next level comes with the same score and lives
    const { poeng, liv } = st;
    assert.ok(M.neste(st) && st.brett === nr + 1 && st.poeng === poeng && st.liv === liv && st.venter && !st.klart);
  }
});

test("the same seed and the same moves give the same game; frame rate does not matter", () => {
  const spill = (fps) => {
    const st = M.nytt(9, 3);
    const pilot = lagPilot(lcg(5));
    const k = { akk: 0 };
    for (let f = 0; f < fps * 20; f++) {
      const n = M.stegFor(k, 1000 / fps);
      for (let i = 0; i < n; i++) {
        if (st.venter) M.skyt(st);
        pilot(st);
      }
    }
    return j(st);
  };
  const a = spill(60);
  assert.ok(a.knust > 0);
  assert.deepEqual(spill(60), a);
  assert.deepEqual(spill(30), a);
  assert.deepEqual(spill(144), a);
});
