// Nissen («Mandelen i grøten»): the elf's questions in nb, en and da, the bowl going round (everyone
// sees theirs once, exactly one almond, then everyone turns away to pop it in), the elf never asking the same player twice in a row, the
// reveal (caught → everyone else 1 point, got away → 3 points to the holder), undo, the rounds and
// the end, and the hand-off of old Secret Santa links. Loads spill.js without the kit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KILDE = readFileSync(join(ROT, "rusj/spill/nissen/spill.js"), "utf8");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(KILDE, kontekst);
const N = kontekst.window.Nissen;
// Arrays made inside the vm come from another realm: compare them as plain data.
const js = (x) => JSON.parse(JSON.stringify(x));

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const les = (m) => JSON.parse(readFileSync(join(ROT, "rusj/spill/nissen", m, "sporsmal.json"), "utf8"));
const SPRAK = { nb: les("data"), en: les("data.en"), da: les("data.da") };

test("the elf's questions: the same number in every language, no duplicates, short and ending well", () => {
  for (const [sprak, liste] of Object.entries(SPRAK)) {
    assert.ok(liste.length >= 40, `${sprak}: at least 40 questions`);
    assert.equal(liste.length, SPRAK.nb.length, `${sprak}: as many questions as Norwegian`);
    assert.equal(new Set(liste.map((t) => t.toLowerCase())).size, liste.length, `${sprak}: a duplicate`);
    for (const t of liste) {
      assert.ok(t.length >= 10 && t.length <= 90, `${sprak}: length of «${t}»`);
      assert.ok(/[.?!][»«’]?$/.test(t), `${sprak}: «${t}» should end with . ? or !`);
      assert.ok(!/[{}]/.test(t), `${sprak}: a brace in «${t}»`);
    }
  }
  // Danish Christmas has the almond in the risalamande, not the porridge.
  assert.ok(!SPRAK.da.some((t) => /grød/i.test(t)), "da: no porridge, it's risalamande");
});

test("the bowl goes round: everyone sees theirs once, then the elf", () => {
  for (let fro = 1; fro <= 50; fro++) {
    const r = rng(fro);
    const n = 3 + (fro % 10);
    const sp = N.ny(n, 5, r);
    assert.ok(sp.mandel >= 0 && sp.mandel < n, "the almond goes to a player");
    const sett = [];
    while (sp.fase !== "munn") {
      assert.equal(sp.fase, "gi");
      sp.fase = "se";
      assert.equal(N.videre(sp), null, "you can't pass on before you've looked");
      sett.push(N.tur(sp));
      assert.ok(N.sett(sp));
      N.videre(sp);
    }
    assert.deepEqual(sett.slice().sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i), "everyone looks exactly once");
    assert.equal(N.imunnen(sp), "prat", "everyone turns back round: over to the elf");
    assert.equal(N.imunnen(sp), null, "only once");
  }
});

test("the elf never asks the same player twice in a row, and asks everyone over time", () => {
  const sp = N.ny(4, 3, rng(9));
  const r = rng(77);
  const spurt = new Set();
  let forrige = null;
  for (let i = 0; i < 200; i++) {
    sp.spurt = N.nesteSpurt(sp, r);
    assert.ok(sp.spurt >= 0 && sp.spurt < 4);
    assert.notEqual(sp.spurt, forrige);
    forrige = sp.spurt;
    spurt.add(sp.spurt);
  }
  assert.equal(spurt.size, 4);
});

test("the reveal: caught gives everyone else 1 point, getting away gives the holder 3", () => {
  const sp = N.ny(5, 3, rng(3));
  sp.mandel = 2;
  sp.fase = "pek";
  const r = N.avgjor(sp, [2, 4]);
  assert.ok(r.fanget);
  assert.deepEqual(js(sp.poeng), [1, 1, 0, 1, 1]);
  assert.equal(sp.fase, "fasit");
  // Undo takes it all back, and the players can point again.
  assert.ok(N.angre(sp));
  assert.deepEqual(js(sp.poeng), [0, 0, 0, 0, 0]);
  assert.equal(sp.fase, "pek");
  const r2 = N.avgjor(sp, [1]);
  assert.ok(!r2.fanget);
  assert.deepEqual(js(sp.poeng), [0, 0, 3, 0, 0]);
  assert.deepEqual(js(sp.slapp), [0, 0, 1, 0, 0]);
  assert.ok(N.angre(sp));
  assert.deepEqual(js(sp.slapp), [0, 0, 0, 0, 0]);
  // Nobody pointed out: the holder gets away with it. Bad indexes are ignored.
  const r3 = N.avgjor(sp, [-1, 9, 1.5]);
  assert.ok(!r3.fanget);
  assert.deepEqual(js(sp.pekt), []);
  assert.equal(N.avgjor(sp, [2]), null, "only once per round");
});

test("rounds: a new almond and the next player starts, then the end", () => {
  const r = rng(12);
  const sp = N.ny(4, 3, r);
  for (let runde = 0; runde < 3; runde++) {
    assert.equal(sp.start, runde % 4);
    sp.fase = "pek";
    N.avgjor(sp, []);
    const hvor = N.nesteRunde(sp, r);
    assert.equal(hvor, runde < 2 ? "gi" : "slutt");
  }
  assert.ok(sp.ferdig);
  assert.equal(sp.runde, 3);
  assert.equal(sp.poeng.reduce((s, p) => s + p, 0), 9, "nobody caught: 3 points a round");
});

test("whole games over many seeds: points always add up", () => {
  for (let fro = 1; fro <= 200; fro++) {
    const r = rng(fro);
    const n = 3 + (fro % 10);
    const runder = N.RUNDER[fro % 3];
    const sp = N.ny(n, runder, r);
    let ventet = 0;
    while (!sp.ferdig) {
      while (sp.fase !== "munn") {
        sp.fase = "se";
        N.sett(sp);
        N.videre(sp);
      }
      N.imunnen(sp);
      sp.fase = "pek";
      const pekt = r() < 0.5 ? [sp.mandel] : [(sp.mandel + 1) % n];
      const res = N.avgjor(sp, pekt);
      ventet += res.fanget ? n - 1 : 3;
      N.nesteRunde(sp, r);
    }
    assert.equal(sp.poeng.reduce((s, p) => s + p, 0), ventet);
    assert.equal(sp.runde, runder);
  }
});

test("old Secret Santa links are recognised and handed on with the hash", () => {
  assert.ok(N.TREKNINGSLENKE.test("2K7QZZZZ0000ABCD"));
  assert.ok(!N.TREKNINGSLENKE.test("utfordring"));
  assert.ok(!N.TREKNINGSLENKE.test("3ABC"));
  // In a browser with the kit: /nissen/#2… goes to the draw's address in the same edition.
  for (const [andre, ventet] of [
    [undefined, "/nissetrekning/#2ABCDEF"],
    [[{ id: "nissetrekning", url: "/da/nissetraekning/" }], "/da/nissetraekning/#2ABCDEF"],
  ]) {
    let til = null;
    const k = { window: { Rusj: {}, RUSJ_ANDRE: andre, location: { hash: "#2ABCDEF", replace: (u) => (til = u) } }, console };
    vm.createContext(k);
    vm.runInContext(KILDE, k);
    assert.equal(til, ventet);
  }
});
