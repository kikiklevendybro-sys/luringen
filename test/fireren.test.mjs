// Fireren: win detection on the 7 × 6 board and the engine. Loads rusj/spill/fireren/spill.js
// without the kit (node:vm): the file then only exposes the rules (Fire) and the engine (Motor).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, performance, console, setTimeout, clearTimeout };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/fireren/spill.js"), "utf8"), kontekst);
const { Fire, Motor } = kontekst.window.Fireren;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const spill = (...kolonner) => Fire.spillUt(kolonner, 1);
const celler = (st) => st.vunnet.linjer.map((l) => l.celler.map(([k, r]) => `${k}${r}`).join(" "));

test("four in a row wins: across, up and both diagonals", () => {
  let st = spill(0, 0, 1, 1, 2, 2, 3);
  assert.equal(st.vunnet.spiller, 1);
  assert.deepEqual([...celler(st)], ["00 10 20 30"]);
  st = spill(6, 5, 6, 5, 6, 5, 6);
  assert.deepEqual([...celler(st)], ["60 61 62 63"]);
  // Rising diagonal 00–11–22–33 for player 1
  st = spill(0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3);
  assert.equal(st.vunnet.spiller, 1);
  assert.deepEqual([...celler(st)], ["00 11 22 33"]);
  // Falling diagonal 03–12–21–30 for player 1
  st = spill(3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0);
  assert.equal(st.vunnet.spiller, 1);
  assert.deepEqual([...celler(st)], ["03 12 21 30"]);
});

test("three is not enough; a line of five counts as one line; two lines at once are both found", () => {
  assert.equal(spill(0, 0, 1, 1, 2).vunnet, null);
  let st = spill(0, 0, 1, 1, 3, 3, 4, 4, 2);
  assert.deepEqual([...celler(st)], ["00 10 20 30 40"]);
  // The last disc completes a row and a column together: both lines are found
  const b = Fire.nytt();
  for (const k of [0, 1, 2]) for (let r = 0; r < 3; r++) Fire.slipp(b, k, 2);
  for (const k of [0, 1, 2, 3, 3, 3]) Fire.slipp(b, k, 1);
  const rad = Fire.slipp(b, 3, 1);
  const linjer = Fire.linjer(b, 3, rad).map((l) => l.celler.map(([k, r]) => `${k}${r}`).join(" "));
  assert.deepEqual([...linjer].sort(), ["03 13 23 33", "30 31 32 33"]);
});

test("moves into a full column, or after the game is won, are refused", () => {
  assert.equal(spill(0, 0, 0, 0, 0, 0, 0), null);
  assert.equal(spill(0, 1, 0, 1, 0, 1, 0, 1), null, "no disc after four in a row");
  assert.equal(spill(7), null);
  assert.equal(spill(-1), null);
});

test("a full board without four in a row is a draw", () => {
  const kol = ["112211", "221122", "112211", "221122", "112211", "221122", "112212"];
  const h = [0, 0, 0, 0, 0, 0, 0];
  const rekke = [];
  const dfs = (tur) => {
    if (rekke.length === 42) return true;
    for (let k = 0; k < 7; k++)
      if (h[k] < 6 && Number(kol[k][h[k]]) === tur) {
        h[k]++;
        rekke.push(k);
        if (dfs(3 - tur)) return true;
        rekke.pop();
        h[k]--;
      }
    return false;
  };
  assert.ok(dfs(1));
  const st = Fire.spillUt(rekke, 1);
  assert.equal(st.vunnet, null);
  assert.equal(st.fullt, true);
});

test("vinnerVed sees a winning column before the disc is dropped", () => {
  const st = spill(0, 6, 1, 6, 2);
  assert.equal(Fire.vinnerVed(st.b, 3, 1), true);
  assert.equal(Fire.vinnerVed(st.b, 3, 2), false);
  assert.equal(Fire.vinnerVed(st.b, 4, 1), false);
});

test("engine: every level takes a win and the two upper levels always block", () => {
  const vinn = spill(0, 6, 1, 6, 2, 5); // player 1 to move: column 3 wins
  for (const n of [2, 3]) assert.equal(Motor.velg(vinn.b, 1, n, rng(n), 2000), 3, `nivå ${n} tar seieren`);
  let tatt = 0;
  for (let i = 0; i < 200; i++) if (Motor.velg(vinn.b, 1, 1, rng(i)) === 3) tatt++;
  assert.ok(tatt > 120, `Lett tok seieren ${tatt} av 200 ganger`);
  const trussel = spill(0, 6, 1, 6, 2); // player 2 to move: must block column 3
  for (const n of [2, 3]) assert.equal(Motor.velg(trussel.b, 2, n, rng(n), 2000), 3, `nivå ${n} blokkerer`);
});

test("engine: never picks a full column", () => {
  const st = spill(3, 3, 3, 3, 3, 3);
  for (const n of [1, 2, 3]) for (let i = 0; i < 5; i++) assert.notEqual(Motor.velg(st.b, 1, n, rng(i), 200), 3);
});

test("engine: Vanskelig beats a random player every time and Middels most of the time", () => {
  const kamp = (niva, fro, mobilenForst) => {
    const r = rng(fro);
    const b = Fire.nytt();
    let s = 1;
    const mobilen = mobilenForst ? 1 : 2;
    for (let n = 0; n < 42; n++) {
      const k = s === mobilen ? Motor.velg(b, s, niva, r, 150) : [0, 1, 2, 3, 4, 5, 6].filter((x) => Fire.kan(b, x))[Math.floor(r() * 7) % [0, 1, 2, 3, 4, 5, 6].filter((x) => Fire.kan(b, x)).length];
      const rad = Fire.slipp(b, k, s);
      if (Fire.linjer(b, k, rad).length) return s === mobilen ? "mobilen" : "tilfeldig";
      s = 3 - s;
    }
    return "uavgjort";
  };
  for (let i = 0; i < 12; i++) assert.equal(kamp(3, i, i % 2 === 0), "mobilen", `parti ${i}`);
  let middels = 0;
  for (let i = 0; i < 12; i++) if (kamp(2, 100 + i, i % 2 === 0) === "mobilen") middels++;
  assert.ok(middels >= 10, `Middels vant ${middels} av 12 mot tilfeldige trekk`);
});

// With its real time budget Vanskelig won 8 of 8 against Middels in a longer run; here two games
// (once as the first player, once as the second) keep the test reasonably quick.
test("engine: Vanskelig beats Middels, as first and as second player", () => {
  for (const sterk of [1, 2]) {
    const r = rng(900 + sterk);
    const b = Fire.nytt();
    let s = 1;
    let vinner = 0;
    for (let n = 0; n < 42 && !vinner; n++) {
      // A fixed node budget (about 0.6 s of thinking on a laptop) instead of the clock.
      const k = Motor.velg(b, s, s === sterk ? 3 : 2, r, 1e9, s === sterk ? 800000 : 0);
      const rad = Fire.slipp(b, k, s);
      if (Fire.linjer(b, k, rad).length) vinner = s;
      s = 3 - s;
    }
    assert.equal(vinner, sterk, `Vanskelig som spiller ${sterk} vant ikke`);
  }
});

test("engine: the deep search yields many times (time slices)", () => {
  const b = Fire.nytt();
  const resultat = {};
  const gen = Motor.rot(b, 1, { dybde: 10 }, resultat);
  let pauser = 0;
  while (!gen.next().done) pauser++;
  assert.ok(pauser > 5, `bare ${pauser} pauser`);
  assert.ok(Fire.kan(b, resultat.kolonne));
  assert.equal(b.n, 0, "the board is left as it was");
});

test("engine: tenk() answers within its budget and lets the event loop run", async () => {
  const st = spill(3, 3, 2, 4);
  let lengst = 0, sist = performance.now();
  const vakt = setInterval(() => {
    const na = performance.now();
    lengst = Math.max(lengst, na - sist);
    sist = na;
  }, 1);
  const t0 = performance.now();
  const k = await new Promise((ok) => Motor.tenk(st.b, 1, 3, ok));
  const brukt = performance.now() - t0;
  clearInterval(vakt);
  assert.ok(Fire.kan(st.b, k));
  assert.ok(brukt < 1600, `svarte etter ${Math.round(brukt)} ms`);
  assert.ok(lengst < 80, `lengste pause for resten av siden: ${Math.round(lengst)} ms`);
});
