// Brevduen («Hvem skrev det?»): the questions in nb, en and da, cleaning typed answers, the phone
// going round (everyone writes once, empty answers refused), the shuffled reveal order, scoring
// (1 per right guess, 1 to the author per player fooled), undo, wiping answers as the game moves
// on, rounds and the end. Loads spill.js without the kit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KILDE = readFileSync(join(ROT, "rusj/spill/brevduen/spill.js"), "utf8");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(KILDE, kontekst);
const B = kontekst.window.Brevduen;
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
const les = (m, f) => JSON.parse(readFileSync(join(ROT, "rusj/spill/brevduen", m, f + ".json"), "utf8"));
const MAPPER = { nb: "data", en: "data.en", da: "data.da" };

test("the questions: the same number in every language, no duplicates, well formed", () => {
  for (const pakke of ["familie", "voksen"]) {
    const nb = les("data", pakke);
    for (const [sprak, mappe] of Object.entries(MAPPER)) {
      const liste = les(mappe, pakke);
      assert.ok(liste.length >= (pakke === "familie" ? 60 : 20), `${sprak}/${pakke}: enough questions`);
      assert.equal(liste.length, nb.length, `${sprak}/${pakke}: as many as Norwegian`);
      assert.equal(new Set(liste.map((t) => t.toLowerCase())).size, liste.length, `${sprak}/${pakke}: a duplicate`);
      for (const t of liste) {
        assert.equal(typeof t, "string");
        assert.ok(t.length >= 12 && t.length <= 90, `${sprak}: length of «${t}»`);
        assert.ok(/[.?!…]$/.test(t), `${sprak}: «${t}» should end with . ? ! or …`);
        assert.ok(!/[{}<>]/.test(t), `${sprak}: markup in «${t}»`);
        assert.equal(t, t.trim(), `${sprak}: spaces around «${t}»`);
      }
    }
  }
  // No duplicates across the packs either, and British spelling in English.
  for (const mappe of Object.values(MAPPER)) {
    const alle = [...les(mappe, "familie"), ...les(mappe, "voksen")];
    assert.equal(new Set(alle).size, alle.length, `${mappe}: a question in both packs`);
  }
  const en = [...les("data.en", "familie"), ...les("data.en", "voksen")].join(" ");
  assert.ok(!/\b(favorite|color|candy|vacation|mom)\b/i.test(en), "en: British English");
  assert.ok(!/[æøå]/i.test(en), "en: no Norwegian letters");
});

test("answers are cleaned: one line, trimmed, at most 80 characters, never half an emoji", () => {
  assert.equal(B.rens("  hei   på\n deg  "), "hei på deg");
  assert.equal(B.rens(""), "");
  assert.equal(B.rens("   \n\t "), "");
  assert.equal(B.rens(null), "");
  assert.equal(Array.from(B.rens("x".repeat(200))).length, B.MAKS);
  const emoji = "😀".repeat(100);
  assert.equal(Array.from(B.rens(emoji)).length, B.MAKS);
  assert.ok(B.rens(emoji).endsWith("😀"));
});

test("shuffling keeps every player exactly once and is not always the same", () => {
  const sett = new Set();
  for (let fro = 1; fro <= 40; fro++) {
    const l = js(B.stokk([0, 1, 2, 3, 4, 5], rng(fro)));
    assert.deepEqual([...l].sort(), [0, 1, 2, 3, 4, 5]);
    sett.add(l.join());
  }
  assert.ok(sett.size > 20, "the order varies");
});

// Plays one round where everyone writes; returns the answers by player.
function skrivAlle(sp, r) {
  assert.ok(B.begynn(sp));
  const skrevet = [];
  while (sp.fase !== "les") {
    assert.equal(sp.fase, "gi");
    assert.equal(B.skriv(sp, "x", r), null, "nobody writes before «Jeg er …»");
    assert.ok(B.jegEr(sp));
    const i = B.skriver(sp);
    assert.ok(!skrevet.includes(i), "nobody writes twice");
    assert.equal(B.skriv(sp, "   ", r), "tom", "an empty answer is refused");
    assert.equal(sp.fase, "skriv");
    B.skriv(sp, `Svar fra ${i}`, r);
    skrevet.push(i);
  }
  return skrevet;
}

test("the phone goes round: everyone writes once, starting one seat later each round", () => {
  for (let fro = 1; fro <= 30; fro++) {
    const r = rng(fro);
    const n = 3 + (fro % 10);
    const sp = B.ny(n, 3, 0);
    const skrevet = skrivAlle(sp, r);
    assert.equal(skrevet.length, n);
    assert.equal(skrevet[0], 0);
    assert.deepEqual(js(sp.r.rekke).sort((a, b) => a - b), [...Array(n).keys()], "every answer is shown once");
    assert.ok(sp.r.svar.every((t, i) => t === `Svar fra ${i}`));
  }
  // The second round starts with player 1.
  const sp = B.ny(4, 3, 0);
  const r = rng(7);
  skrivAlle(sp, r);
  for (let k = 0; k < 4; k++) {
    B.avslor(sp);
    B.avgjor(sp, []);
    B.neste(sp, () => 5);
  }
  assert.equal(sp.fase, "sporsmal");
  assert.equal(sp.runde, 1);
  assert.equal(sp.r.k, 5);
  assert.equal(B.skriver(sp), 1);
});

test("a new question only before anyone has written", () => {
  const sp = B.ny(4, 3, 0);
  assert.ok(B.byttSporsmal(sp, 3));
  assert.equal(sp.r.k, 3);
  B.begynn(sp);
  assert.ok(B.byttSporsmal(sp, 4), "still allowed at the first «Gi mobilen til»");
  B.jegEr(sp);
  B.skriv(sp, "Noe", rng(1));
  assert.ok(!B.byttSporsmal(sp, 6));
  assert.equal(sp.r.k, 4);
});

test("scoring: 1 per right guess, 1 to the author per player fooled; the sums always add up", () => {
  for (let fro = 1; fro <= 60; fro++) {
    const r = rng(fro);
    const n = 3 + (fro % 10);
    const sp = B.ny(n, 3, 0);
    skrivAlle(sp, r);
    let sum = 0;
    let lurt = 0;
    while (sp.fase === "les") {
      const a = B.forfatter(sp);
      assert.ok(B.avslor(sp));
      // A random set of right guesses, sometimes with the author and junk in it (ignored).
      const riktige = [...Array(n).keys()].filter(() => r() < 0.5).concat([a, -1, n, 1.5]);
      const s = B.avgjor(sp, riktige);
      const ekte = riktige.filter((i) => Number.isInteger(i) && i >= 0 && i < n && i !== a);
      const unike = new Set(ekte).size;
      assert.equal(s.riktige.length, unike);
      assert.ok(!s.riktige.includes(a));
      assert.equal(s.lurte, n - 1 - unike);
      assert.equal(s.pluss[a], s.lurte * B.POENG_LURT);
      for (const i of s.riktige) assert.equal(s.pluss[i], B.POENG_RIKTIG);
      // Every other player either pointed right (they score) or was fooled (the author scores).
      assert.equal(s.pluss.reduce((x, y) => x + y, 0), n - 1);
      sum += n - 1;
      lurt += s.lurte;
      assert.equal(sp.poeng.reduce((x, y) => x + y, 0), sum);
      assert.equal(sp.lurt.reduce((x, y) => x + y, 0), lurt);
      B.neste(sp, () => 1);
    }
    assert.equal(sp.vist, n);
  }
});

test("examples: fooled everyone, caught by everyone, a mix", () => {
  const sp = B.ny(4, 3, 0);
  skrivAlle(sp, rng(3));
  const a = B.forfatter(sp);
  const andre = [0, 1, 2, 3].filter((i) => i !== a);
  B.avslor(sp);
  let s = B.avgjor(sp, []);
  assert.equal(s.lurte, 3);
  assert.equal(sp.poeng[a], 3);
  // Undo, then everyone guessed right.
  assert.ok(B.angre(sp));
  assert.equal(sp.fase, "hvem");
  assert.deepEqual(js(sp.poeng), [0, 0, 0, 0]);
  assert.equal(sp.lurt[a], 0);
  assert.equal(sp.vist, 0);
  assert.ok(!B.angre(sp), "nothing more to undo");
  s = B.avgjor(sp, andre);
  assert.equal(s.lurte, 0);
  assert.equal(sp.poeng[a], 0);
  assert.ok(andre.every((i) => sp.poeng[i] === 1));
  // Undo again, then two of three.
  B.angre(sp);
  s = B.avgjor(sp, andre.slice(0, 2));
  assert.equal(s.lurte, 1);
  assert.equal(sp.poeng[a], 1);
  assert.equal(sp.poeng[andre[2]], 0);
  assert.equal(sp.lurt[a], 1);
});

test("answers are wiped as soon as the next one is shown, and when the round or game ends", () => {
  const sp = B.ny(3, 3, 0);
  skrivAlle(sp, rng(11));
  assert.equal(B.igjen(sp), 3);
  for (let k = 0; k < 3; k++) {
    const a = B.forfatter(sp);
    B.avslor(sp);
    B.avgjor(sp, []);
    assert.equal(typeof sp.r.svar[a], "string", "the answer stays while its points can be undone");
    const hvor = B.neste(sp, () => 2);
    if (k < 2) {
      assert.equal(hvor, "les");
      assert.equal(B.igjen(sp), 2 - k);
      assert.equal(sp.r.svar[a], null);
    } else {
      assert.equal(hvor, "sporsmal");
      assert.equal(B.igjen(sp), 0);
      assert.ok(sp.r.svar.every((t) => t === null));
      assert.deepEqual(js(sp.r.rekke), []);
    }
  }
  assert.ok(!JSON.stringify(sp).includes("Svar fra"), "no answer text left in the state");
});

test("rounds and the end; actions out of turn do nothing", () => {
  for (const runder of B.RUNDER) {
    const sp = B.ny(3, runder, 0);
    for (let rn = 0; rn < runder; rn++) {
      assert.equal(sp.fase, "sporsmal");
      assert.equal(B.avslor(sp), false);
      assert.equal(B.avgjor(sp, []), null);
      assert.equal(B.neste(sp, () => 0), null);
      skrivAlle(sp, rng(rn + 1));
      assert.equal(B.jegEr(sp), false);
      for (let k = 0; k < 3; k++) {
        assert.equal(B.avgjor(sp, []), null, "no points before the reveal");
        B.avslor(sp);
        assert.equal(B.avslor(sp), false);
        B.avgjor(sp, [0]);
        assert.equal(B.avgjor(sp, [0]), null, "no points twice");
        B.neste(sp, () => 0);
      }
    }
    assert.ok(sp.ferdig);
    assert.equal(sp.runde, runder);
    assert.equal(sp.r, null);
    assert.equal(sp.vist, runder * 3);
  }
});
