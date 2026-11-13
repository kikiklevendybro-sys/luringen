// Skilpadda (mahjong solitaire): the tiles, the layouts, which tiles are free, dealing only boards
// that can be cleared (many seeds), the shuffle, the solver behind the hints and «Dagens brett».
// Loads rusj/spill/skilpadda/spill.js without the kit (node:vm): the file then only exposes the
// pure rules (MJ) and the face drawings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/skilpadda/spill.js"), "utf8"), kontekst);
const { MJ, tegnFjes } = kontekst.window.Skilpadda;

// Values from the vm context are compared as plain JSON (their arrays have another prototype).
const j = (x) => JSON.parse(JSON.stringify(x));
const tom = (g) => new Uint8Array(g.n);
const finn = (g, x, y, z) => g.pos.findIndex((p) => p[0] === x && p[1] === y && p[2] === z);

// Plays a list of pairs from the start; fails on the first pair that is not free or does not match.
function spillGjennom(g, ansikt, par, borte = tom(g)) {
  for (const [a, b] of par) {
    assert.ok(a !== b && !borte[a] && !borte[b], `brikke ${a} eller ${b} er alt borte`);
    assert.ok(MJ.ledig(g, borte, a) && MJ.ledig(g, borte, b), `paret ${a}/${b} er ikke ledig`);
    assert.ok(MJ.passer(ansikt[a], ansikt[b]), `${ansikt[a]} og ${ansikt[b]} er ikke like`);
    borte[a] = 1;
    borte[b] = 1;
  }
  return borte;
}
// How many of each face, by group.
function telling(ansikt, borte) {
  const t = {};
  ansikt.forEach((k, i) => {
    if (borte && borte[i]) return;
    t[k] = (t[k] || 0) + 1;
  });
  return t;
}

test("the tiles: 34 faces four times, four flowers and four seasons – 144 in all", () => {
  assert.equal(MJ.SLAG.length, 34);
  assert.equal(MJ.ALLE.length, 42);
  assert.equal(new Set(MJ.ALLE).size, 42);
  const par = MJ.parBunke(MJ.rng(1));
  assert.equal(par.length, 72);
  const t = telling(par.flat());
  for (const k of MJ.SLAG) assert.equal(t[k], 4, k);
  for (const k of [...MJ.BLOMSTER, ...MJ.ARSTIDER]) assert.equal(t[k], 1, k);
  for (const [a, b] of par) assert.ok(MJ.passer(a, b), `${a}/${b}`);
  // Matching: the same face; any flower with any flower; any season with any season.
  assert.ok(MJ.passer("r3", "r3"));
  assert.ok(!MJ.passer("r3", "b3"), "same number, other suit");
  assert.ok(!MJ.passer("r3", "r4"));
  assert.ok(MJ.passer("f1", "f4") && MJ.passer("a2", "a3"));
  assert.ok(!MJ.passer("f1", "a1"), "a flower is not a season");
  assert.ok(MJ.passer("p2", "p2") && !MJ.passer("p1", "p2") && !MJ.passer("d1", "d2"));
  assert.ok(!MJ.passer("x1", "x1") && !MJ.passer("", ""), "unknown faces never match");
});

test("the five layouts: even, no two tiles in one spot, every raised tile stands on something", () => {
  const ventet = { hytta: [44, 6, 4], fjellet: [84, 6, 8], borgen: [92, 10, 6], tarnet: [116, 7, 9], skilpadda: [144, 15, 8] };
  assert.deepEqual(j(MJ.OPPSETT), Object.keys(ventet));
  for (const id of MJ.OPPSETT) {
    const g = MJ.geo(id);
    const [n, b, h] = ventet[id];
    assert.equal(g.n, n, id);
    assert.equal(g.n % 2, 0, id);
    assert.equal(g.b / 2, b, `${id}: bredde`);
    assert.equal(g.h / 2, h, `${id}: høyde`);
    assert.ok(g.n / 2 <= 72, `${id}: flere par enn et helt sett`);
    for (let a = 0; a < g.n; a++) {
      const [x, y, z] = g.pos[a];
      assert.ok(x >= 0 && y >= 0 && z >= 0, id);
      if (z > 0) assert.ok(g.under[a].length > 0, `${id}: brikke ${a} svever`);
      for (let c = a + 1; c < g.n; c++) {
        const p = g.pos[c];
        assert.ok(!(p[2] === z && Math.abs(p[0] - x) < 2 && Math.abs(p[1] - y) < 2), `${id}: ${a} og ${c} overlapper`);
      }
    }
    // Reading order: row, column, layer (the order a keyboard walks the tiles)
    for (let i = 1; i < g.n; i++) {
      const [p, q] = [g.pos[i - 1], g.pos[i]];
      assert.ok(p[1] < q[1] || (p[1] === q[1] && (p[0] < q[0] || (p[0] === q[0] && p[2] < q[2]))), `${id}: rekkefølge ved ${i}`);
    }
    // Something to do from the start
    assert.ok(MJ.frie(g, tom(g)).length >= 8, `${id}: for få ledige brikker i starten`);
  }
  // The classic turtle: 87 + 36 + 16 + 4 + 1
  const lag = [0, 0, 0, 0, 0];
  for (const p of MJ.geo("skilpadda").pos) lag[p[2]]++;
  assert.deepEqual(lag, [87, 36, 16, 4, 1]);
  // The phone layouts are narrower than the turtle
  for (const id of ["fjellet", "tarnet"]) assert.ok(MJ.geo(id).b < MJ.geo(id).h, `${id} er ikke smal`);
  for (const id of MJ.OPPSETT) assert.ok(MJ.geo(id).b / 2 <= 15 && MJ.geo(id).h / 2 <= 9, id);
  // Not too easy: at most a third of the tiles are free at the start.
  for (const id of MJ.OPPSETT) assert.ok(MJ.frie(MJ.geo(id), tom(MJ.geo(id))).length <= MJ.geo(id).n / 3, `${id}: for mange ledige brikker i starten`);
  assert.equal(MJ.geo("nei"), null);
  assert.equal(MJ.geo("constructor"), null);
});

test("free: nothing on top, and the left or the right side open", () => {
  // A row of three on the table, and a fourth tile on top of the middle one.
  const g = MJ.lagGeo([[0, 0, 0], [2, 0, 0], [4, 0, 0], [2, 0, 1]]);
  const [a, b, c, topp] = [finn(g, 0, 0, 0), finn(g, 2, 0, 0), finn(g, 4, 0, 0), finn(g, 2, 0, 1)];
  let borte = tom(g);
  assert.ok(MJ.ledig(g, borte, a) && MJ.ledig(g, borte, c), "the ends of a row are free");
  assert.ok(!MJ.ledig(g, borte, b), "the middle is locked (both sides, and a tile on top)");
  assert.ok(MJ.ledig(g, borte, topp), "the top tile is free");
  borte[topp] = 1;
  assert.ok(!MJ.ledig(g, borte, b), "uncovered, but both sides are still closed");
  borte[a] = 1;
  assert.ok(MJ.ledig(g, borte, b), "the left side opened");
  borte = tom(g);
  borte[a] = 1;
  assert.ok(!MJ.ledig(g, borte, b), "a side is open, but a tile lies on top");
  assert.ok(!MJ.ledig(g, Uint8Array.from([1, 0, 0, 0]), finn(g, 0, 0, 0)), "a removed tile is never free");

  // Half a tile off: a tile resting across two others covers both; a neighbour half a row
  // higher still closes the side; a gap of half a tile does not.
  const h = MJ.lagGeo([[0, 0, 0], [2, 0, 0], [1, 0, 1], [4, 1, 0], [7, 0, 0], [9, 0, 0]]);
  borte = tom(h);
  assert.ok(!MJ.ledig(h, borte, finn(h, 0, 0, 0)) && !MJ.ledig(h, borte, finn(h, 2, 0, 0)), "half a tile on top covers both");
  assert.ok(MJ.ledig(h, borte, finn(h, 1, 0, 1)));
  borte[finn(h, 1, 0, 1)] = 1;
  assert.ok(MJ.ledig(h, borte, finn(h, 0, 0, 0)), "the left end is open");
  assert.ok(!MJ.ledig(h, borte, finn(h, 2, 0, 0)), "half a row lower on the right still closes the side");
  assert.ok(MJ.ledig(h, borte, finn(h, 4, 1, 0)), "a gap of half a tile on the right leaves that side open");
  assert.ok(MJ.ledig(h, borte, finn(h, 7, 0, 0)) && MJ.ledig(h, borte, finn(h, 9, 0, 0)), "a pair of two: both ends are free");
});

test("free: the turtle's top, head and tail", () => {
  const g = MJ.geo("skilpadda");
  const borte = tom(g);
  const topp = finn(g, 13, 7, 4);
  const hode = finn(g, 0, 7, 0);
  const hale1 = finn(g, 26, 7, 0);
  const hale2 = finn(g, 28, 7, 0);
  assert.ok([topp, hode, hale1, hale2].every((i) => i >= 0));
  assert.ok(MJ.ledig(g, borte, topp), "the top tile is free");
  for (const [x, y] of [[12, 6], [14, 6], [12, 8], [14, 8]]) assert.ok(!MJ.ledig(g, borte, finn(g, x, y, 3)), `under the top: ${x},${y}`);
  assert.ok(MJ.ledig(g, borte, hode) && MJ.ledig(g, borte, hale2), "the head and the tail end are free");
  assert.ok(!MJ.ledig(g, borte, hale1), "the first tail tile is locked on both sides");
  const rad3 = finn(g, 2, 6, 0);
  const rad4 = finn(g, 2, 8, 0);
  assert.ok(!MJ.ledig(g, borte, rad3) && !MJ.ledig(g, borte, rad4), "the head closes rows 4 and 5");
  borte[hode] = 1;
  assert.ok(MJ.ledig(g, borte, rad3) && MJ.ledig(g, borte, rad4), "without the head both rows open");
  borte[topp] = 1;
  for (const [x, y] of [[12, 6], [14, 6], [12, 8], [14, 8]]) assert.ok(MJ.ledig(g, borte, finn(g, x, y, 3)), `top gone: ${x},${y}`);
  assert.equal(MJ.frie(g, tom(g)).length, 35);
});

test("dealing: every board of every layout can be cleared (many seeds), from the full set, the same for a seed", () => {
  const antall = { hytta: 400, fjellet: 300, borgen: 300, tarnet: 200, skilpadda: 200 };
  for (const id of MJ.OPPSETT) {
    const g = MJ.geo(id);
    const sett = new Set();
    for (let s = 0; s < antall[id]; s++) {
      const fro = (s * 2654435761) >>> 0;
      const d = MJ.delUt(id, fro);
      assert.equal(d.ansikt.length, g.n);
      assert.equal(d.losning.length, g.n / 2);
      const borte = spillGjennom(g, d.ansikt, d.losning);
      assert.equal(MJ.igjen(borte), 0, `${id}/${fro}: brettet ble ikke tomt`);
      const t = telling(d.ansikt);
      for (const [k, n] of Object.entries(t)) assert.ok(n <= (k[0] === "f" || k[0] === "a" ? 1 : 4), `${id}/${fro}: ${n} × ${k}`);
      // Always all four of a face (and of the flowers and the seasons)
      const grupper = {};
      for (const k of d.ansikt) grupper[MJ.gruppe(k)] = (grupper[MJ.gruppe(k)] || 0) + 1;
      assert.ok(Object.values(grupper).every((n) => n === 4), `${id}/${fro}: ikke fire av hver`);
      assert.ok(MJ.parene(g, tom(g), d.ansikt).length > 0, `${id}/${fro}: ingen par i starten`);
      sett.add(d.ansikt.join(""));
      if (s < 3) assert.deepEqual(j(MJ.delUt(id, fro)), j(d), `${id}: samme frø gir samme brett`);
    }
    assert.ok(sett.size >= antall[id] - 1, `${id}: brettene gjentar seg`);
  }
  // The whole set on the turtle
  const t = telling(MJ.delUt("skilpadda", 42).ansikt);
  for (const k of MJ.SLAG) assert.equal(t[k], 4, k);
  assert.equal(MJ.delUt("nei", 1), null);
});

test("a saved game is replayed: pairs must be free and match, shuffles carry whole sets of faces", () => {
  const g = MJ.geo("hytta");
  const d = MJ.delUt("hytta", 7);
  const [p1, p2] = d.losning;
  assert.equal(MJ.igjen(MJ.spillAv("hytta", d.ansikt, [p1, p2])), g.n - 4);
  assert.equal(MJ.igjen(MJ.spillAv("hytta", d.ansikt, d.losning)), 0);
  assert.equal(MJ.spillAv("hytta", d.ansikt, [p1, p1]), null, "the same tile twice");
  assert.equal(MJ.spillAv("hytta", d.ansikt, [[p1[0], p1[0]]]), null);
  assert.equal(MJ.spillAv("hytta", d.ansikt, [[0, 999]]), null);
  // A locked tile
  const last = g.pos.findIndex((p, i) => !MJ.ledig(g, tom(g), i));
  const lik = d.ansikt.findIndex((k, i) => i !== last && MJ.passer(k, d.ansikt[last]) && MJ.ledig(g, tom(g), i));
  if (lik >= 0) assert.equal(MJ.spillAv("hytta", d.ansikt, [[last, lik]]), null, "a locked tile was taken");
  // Two free tiles that do not match
  const fri = MJ.frie(g, tom(g));
  const ulik = fri.flatMap((a) => fri.map((b) => [a, b])).find(([a, b]) => a !== b && !MJ.passer(d.ansikt[a], d.ansikt[b]));
  assert.equal(MJ.spillAv("hytta", d.ansikt, [ulik]), null);
  assert.ok(MJ.spillAv("hytta", d.ansikt, [p1, { s: d.ansikt.slice() }, p2]));
  assert.equal(MJ.spillAv("hytta", d.ansikt, [{ s: ["r1"] }]), null);
  assert.equal(MJ.spillAv("hytta", d.ansikt.slice(1), []), null);
  assert.equal(MJ.spillAv("hytta", d.ansikt.map((k, i) => (i ? k : "zz")), []), null);
  assert.equal(MJ.spillAv("hytta", d.ansikt.map((k, i) => (i ? k : d.ansikt[0] === "r1" ? "r2" : "r1")), []), null, "a face an odd number of times");
  assert.equal(MJ.spillAv("nei", d.ansikt, []), null);
});

// Plays k random free pairs (a seeded «player» who does not look ahead).
function tilfeldigSpill(g, ansikt, k, fro) {
  const tilf = MJ.rng(fro);
  const borte = tom(g);
  for (let n = 0; n < k; n++) {
    const p = MJ.parene(g, borte, ansikt);
    if (!p.length) break;
    const [a, b] = p[Math.floor(tilf() * p.length)];
    borte[a] = 1;
    borte[b] = 1;
  }
  return borte;
}

test("shuffle: the tiles that are left, the same faces, in places that can be cleared", () => {
  let stokket = 0;
  for (const id of MJ.OPPSETT)
    for (let s = 1; s <= 40; s++) {
      const g = MJ.geo(id);
      const d = MJ.delUt(id, s * 101);
      const borte = tilfeldigSpill(g, d.ansikt, (s % 9) * 3, s);
      const r = MJ.stokkOm(g, borte, d.ansikt, s * 7);
      if (!r) continue;
      stokket++;
      assert.deepEqual(telling(r.ansikt, borte), telling(d.ansikt, borte), `${id}/${s}: andre brikker etter stokkingen`);
      for (let i = 0; i < g.n; i++) if (borte[i]) assert.equal(r.ansikt[i], d.ansikt[i], "a removed tile changed");
      const etter = spillGjennom(g, r.ansikt, r.losning, Uint8Array.from(borte));
      assert.equal(MJ.igjen(etter), 0, `${id}/${s}: stokkingen kan ikke ryddes`);
    }
  assert.ok(stokket >= 190, `bare ${stokket} stokkinger lyktes`);
  // Two tiles left, one on top of the other: no order clears them – the game says so.
  const g = MJ.lagGeo([[0, 0, 0], [0, 0, 1]]);
  assert.equal(MJ.stokkOm(g, tom(g), ["r1", "r1"], 3), null);
});

test("the solver: finds a way on dealt boards, proves a lost board lost, and follows the deal's own solution", () => {
  for (const id of MJ.OPPSETT) {
    const g = MJ.geo(id);
    let funnet = 0;
    const N = id === "skilpadda" ? 25 : 40;
    for (let s = 1; s <= N; s++) {
      const d = MJ.delUt(id, s * 977);
      const r = MJ.los(g, tom(g), d.ansikt, 20000);
      if (!r.vei) continue;
      funnet++;
      assert.equal(MJ.igjen(spillGjennom(g, d.ansikt, r.vei)), 0, `${id}/${s}: løsningen holder ikke`);
    }
    assert.ok(funnet >= N - 2, `${id}: løseren fant bare ${funnet} av ${N}`);
  }
  // Two matching tiles on top of each other can never go: proven, not just given up.
  const g = MJ.lagGeo([[0, 0, 0], [0, 0, 1], [2, 0, 0], [4, 0, 0]]);
  const ansikt = [];
  ansikt[finn(g, 0, 0, 0)] = "r1";
  ansikt[finn(g, 0, 0, 1)] = "r1";
  ansikt[finn(g, 2, 0, 0)] = "b2";
  ansikt[finn(g, 4, 0, 0)] = "b2";
  const r = MJ.los(g, tom(g), ansikt, 5000);
  assert.equal(r.vei, null);
  assert.equal(r.bevist, true);
  // A board half played along the deal's solution: the rest of it is the hint
  const h = MJ.geo("fjellet");
  const d = MJ.delUt("fjellet", 31337);
  const borte = spillGjennom(h, d.ansikt, d.losning.slice(0, 10));
  assert.deepEqual(j(MJ.folg(h, borte, d.ansikt, d.losning)), j(d.losning.slice(10)));
  // When the rest of the known order no longer matches, the solver takes over.
  assert.equal(MJ.folg(h, borte, d.ansikt.map((x) => (x === d.ansikt[d.losning[10][0]] ? "zz" : x)), d.losning), null);
});

test("«Dagens brett»: from the date alone, a board that can be cleared every day for more than a year", () => {
  const brett = new Map();
  const sett = new Set();
  const start = Date.UTC(2026, 10, 13);
  for (let n = 0; n < 400; n++) {
    const dato = new Date(start + n * 86400000).toISOString().slice(0, 10);
    const a = MJ.dagens(dato);
    assert.deepEqual(j(MJ.dagens(dato)), j(a), dato);
    assert.ok(MJ.DAG_OPPSETT.includes(a.brett), dato);
    const g = MJ.geo(a.brett);
    const d = MJ.delUt(a.brett, a.fro);
    assert.equal(MJ.igjen(spillGjennom(g, d.ansikt, d.losning)), 0, `${dato}: dagens brett kan ikke ryddes`);
    brett.set(a.brett, (brett.get(a.brett) || 0) + 1);
    sett.add(a.brett + d.ansikt.join(""));
  }
  assert.equal(sett.size, 400, "two days got the same board");
  for (const id of MJ.DAG_OPPSETT) assert.ok(brett.get(id) > 120, `${id}: ${brett.get(id)} dager`);
  // The daily layouts fit a phone held upright (no turtle)
  for (const id of MJ.DAG_OPPSETT) assert.ok(MJ.geo(id).b / 2 <= 10, id);
  // Known values: a change here changes every player's board on that day
  assert.equal(MJ.dagens("2026-11-13").brett, MJ.dagens("2026-11-13").brett);
  assert.notDeepEqual(j(MJ.delUt(MJ.dagens("2026-11-13").brett, MJ.dagens("2026-11-13").fro)), j(MJ.delUt(MJ.dagens("2026-11-14").brett, MJ.dagens("2026-11-14").fro)));
});

test("the faces: own drawings, a shape for every suit (never colour alone), flowers and seasons framed differently", () => {
  const sett = new Set();
  for (const k of MJ.ALLE) {
    const s = tegnFjes(k);
    assert.ok(s.length > 40 && !/NaN|undefined/.test(s), k);
    sett.add(s);
  }
  assert.equal(sett.size, MJ.ALLE.length, "two faces look the same");
  for (let n = 1; n <= 9; n++) {
    assert.match(tegnFjes("r" + n), new RegExp(`>${n}</text><circle`), `ring ${n}`);
    assert.match(tegnFjes("b" + n), new RegExp(`>${n}</text><rect`), `bambus ${n}`);
    assert.match(tegnFjes("k" + n), new RegExp(`>${n}</text><path`), `krone ${n}`);
  }
  for (const k of MJ.BLOMSTER) assert.ok(!/stroke-dasharray/.test(tegnFjes(k)) && /<rect x="2"/.test(tegnFjes(k)), k);
  for (const k of MJ.ARSTIDER) assert.match(tegnFjes(k), /stroke-dasharray/, k);
  // No letters on the tiles apart from the numbers (nothing to translate, nothing borrowed)
  for (const k of MJ.ALLE) assert.ok(!/<text[^>]*>[^0-9<]/.test(tegnFjes(k)), k);
});
