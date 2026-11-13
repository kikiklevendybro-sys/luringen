// The six games that moved to the kit's dice (R.terninger) still play exactly as before: their rules
// are loaded in node:vm without the kit and run with fixed seeds, and what comes out (whole phone
// games, every ranking, every legal move, every team draw) is compared with a fingerprint taken from
// the code before the switch. The dice only changed how they look; a different fingerprint means a
// rule, a score or a phone decision changed. (Terninga has its own scoring tests.)
// GULL=1 node test/terninger-spill.test.mjs prints the fingerprints.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const last = (id) => {
  const window = {};
  vm.runInNewContext(readFileSync(join(ROT, `rusj/spill/${id}/spill.js`), "utf8"), { window, console });
  return window;
};
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FNV-1a over the JSON of everything a game produced.
function avtrykk(x) {
  const s = JSON.stringify(x);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16) + ":" + s.length;
}
const terning = (rnd) => 1 + Math.floor(rnd() * 6);

const SPILL = {
  meyer() {
    const M = last("meyer").RusjMeyer;
    const ut = [];
    const par = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) par.push([a, b]);
    // the ranking, truth when the cup is lifted, and what may be said after what
    for (const k of par) ut.push(M.verdi(k[0], k[1]), M.styrke(M.verdi(k[0], k[1])), M.RANG.map((v) => M.erSann(k, v)));
    for (const felles of [true, false]) for (const f of [null, ...M.RANG]) ut.push(M.lovlige(f, felles));
    // the phone's calls and answers at every level, seeded
    const rnd = mulberry32(2024);
    for (const nivaa of M.NIVAER)
      for (let n = 0; n < 400; n++) {
        const k = [terning(rnd), terning(rnd)];
        const f = rnd() < 0.3 ? null : M.RANG[Math.floor(rnd() * M.RANG.length)];
        const felles = rnd() < 0.5;
        const lov = M.lovlige(f, felles);
        ut.push(M.robotMelding(k, f, felles, nivaa, rnd));
        if (lov.length) ut.push(M.robotSvar(lov[Math.floor(rnd() * lov.length)], f, felles, nivaa, rnd));
      }
    return ut;
  },
  brikka() {
    const B = last("brikka").RusjBrikka;
    const ut = [];
    // whole seeded games between phone players (2–4 seats, both finish rules)
    for (let spill = 0; spill < 40; spill++) {
      const rnd = mulberry32(700 + spill);
      const seter = [2, 3, 4][spill % 3];
      const regler = { eksakt: spill % 2 === 0 };
      let brikker = [0, 1, 2, 3].map((s) => (s < seter ? [B.HJEMME, B.HJEMME, B.HJEMME, B.HJEMME] : null));
      let tur = 0;
      for (let steg = 0; steg < 3000 && !brikker.some((b, s) => b && B.ferdig(brikker, s)); steg++) {
        let forsok = B.forsokPerTur(brikker, tur);
        let flyttet = false;
        while (forsok-- > 0 && !flyttet) {
          const kast = terning(rnd);
          const liste = B.trekk(brikker, tur, kast, regler);
          ut.push(kast, liste.length);
          if (liste.length) {
            const t = B.robotVelg(brikker, tur, liste, rnd);
            ut.push([t.brikke, t.fra, t.til, t.slaar.length]);
            brikker = B.utfor(brikker, t);
            flyttet = true;
          }
        }
        tur = (tur + 1) % seter;
      }
      ut.push(brikker, brikker.map((b, s) => (b ? B.iMal(brikker, s) : null)));
    }
    return ut;
  },
  stigespillet() {
    const S = last("stigespillet").RusjStige;
    const ut = [S.BRETTLISTE, S.BRETTLISTE.map((b) => S.sjekkBrett(S.BRETT[b]))];
    // seeded walks on every board with every rule combination
    for (const navn of S.BRETTLISTE)
      for (const regler of [{}, { seks: true }, { eksakt: true }, { seks: true, eksakt: true }]) {
        const rnd = mulberry32(navn.length * 97 + (regler.seks ? 1 : 0) + (regler.eksakt ? 2 : 0));
        const pos = [S.START, S.START, S.START];
        for (let steg = 0, tur = 0; steg < 600; steg++) {
          const t = S.trekk(pos[tur], terning(rnd), S.BRETT[navn], regler);
          ut.push([t.til, t.via, t.forLangt, t.vant, t.ekstra]);
          pos[tur] = t.til;
          if (t.vant) {
            ut.push(S.rangering(pos, [0, 1, 2], tur));
            break;
          }
          if (!t.ekstra) tur = (tur + 1) % 3;
        }
      }
    return ut;
  },
  verktoykassa() {
    const V = last("verktoykassa").RusjVerktoy;
    const ut = [];
    const rnd = mulberry32(55);
    for (let n = 2; n <= 20; n++) for (let lag = 2; lag <= Math.min(4, n); lag++) ut.push(V.delLag(n, lag, rnd), V.fingerLag(n, lag, rnd));
    for (let n = 1; n <= 20; n++) ut.push(V.rekkefolge(n, rnd), V.stokk(Array.from({ length: n }, (_, i) => i), rnd));
    const trukket = [];
    for (let n = 0; n < 60; n++) {
      const t = V.trekkTall(1, 50, trukket, n % 2 === 0, rnd);
      ut.push(t);
      if (n % 2 === 0) trukket.push(t);
    }
    for (const a of ["stein", "saks", "papir"]) for (const b of ["stein", "saks", "papir"]) ut.push(V.sspVinner(a, b));
    for (const ms of [0, 999, 61234, 3600000]) ut.push(V.stoppetid(ms));
    return ut;
  },
  tavla() {
    const T = last("tavla").RusjTavla;
    const ut = [];
    for (let fro = 1; fro <= 12; fro++) {
      const r = T.parti(fro * 7919, [(fro % 3) + 1, ((fro + 1) % 3) + 1], { kube: fro % 2 === 0 });
      ut.push([r.vinner, r.type, r.kube, r.oppgitt, r.turer]);
    }
    return ut;
  },
  lykkegrisen() {
    const L = last("lykkegrisen").RusjLykkegrisen;
    const ut = [];
    for (let fro = 1; fro <= 10; fro++) {
      const r = L.parti(fro * 104729, fro % 2 ? [1, 2, 3] : [3, 2], { mal: fro % 3 ? 10000 : 5000 });
      ut.push(r);
    }
    const rnd = mulberry32(9);
    for (const tabell of Object.keys(L.TABELLER))
      for (let n = 0; n < 300; n++) {
        const t = Array.from({ length: 1 + (n % 6) }, () => terning(rnd));
        ut.push(L.verdi(t, tabell), L.harPoeng(t, tabell), L.beste(t, tabell));
      }
    return ut;
  },
};

// The fingerprints of the code before the switch to R.terninger.
const GULL = {
  meyer: "c94ed017:20583",
  brikka: "8f4e97b6:149392",
  stigespillet: "b51c4db1:21257",
  verktoykassa: "416c42b4:4450",
  tavla: "c28ee877:204",
  lykkegrisen: "e67fc47e:17223",
};

if (process.env.GULL) for (const [id, fn] of Object.entries(SPILL)) console.log(`  ${id}: "${avtrykk(fn())}",`);

for (const [id, fn] of Object.entries(SPILL)) {
  test(`${id}: the rules, scores and phone players give exactly what they gave before the new dice`, () => {
    assert.equal(avtrykk(fn()), GULL[id]);
  });
}
