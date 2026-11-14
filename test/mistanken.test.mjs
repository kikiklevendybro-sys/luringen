// Mistanken (Paranoia, 18+): the questions in nb, en and da (same packs, kind wording, {a} only
// as a name), the player put into a question (never the one answering, everyone in turn), pointing
// (never at yourself, only after reading), the choice of the one pointed at (a sip, a kind word or
// let it be – only the first two throw the coin, about half come out), the phone going round,
// water every tenth round, and whole evenings over many seeds. Loads spill.js without the kit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/mistanken/spill.js"), "utf8"), kontekst);
const { VANN_HVERT, VALG, velgAnnen, harAnnen, deler, ny, pek, velg, videre } = kontekst.window.Mistanken;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const les = (m) => JSON.parse(readFileSync(join(ROT, "rusj/spill/mistanken", m, "sporsmal.json"), "utf8"));
const SPRAK = { nb: les("data"), en: les("data.en"), da: les("data.da") };
const START = { nb: /^Hvem her\b/, en: /^Who here\b/, da: /^Hvem her\b/ };
const SLUTT = /\?$/;

test("the questions: the same packs in every language, each a «Who here …?» question", () => {
  const nb = SPRAK.nb.pakker;
  for (const [sprak, d] of Object.entries(SPRAK)) {
    assert.deepEqual(d.pakker.map((p) => p.id), nb.map((p) => p.id), `${sprak}: packs`);
    d.pakker.forEach((p, i) => {
      assert.equal(p.sporsmal.length, nb[i].sporsmal.length, `${sprak}/${p.id}: number of questions`);
      assert.equal(!!p.av, !!nb[i].av, `${sprak}/${p.id}: off by default`);
      p.sporsmal.forEach((t, j) => {
        assert.ok(START[sprak].test(t) && SLUTT.test(t), `${sprak}: «${t}»`);
        assert.equal(harAnnen(t), harAnnen(nb[i].sporsmal[j]), `${sprak}/${p.id} #${j}: {a} in one language only`);
        assert.ok(!/[{}]/.test(t.replace(/\{a\}/g, "")), `${sprak}: a stray brace in «${t}»`);
      });
    });
    const alle = d.pakker.flatMap((p) => p.sporsmal);
    assert.ok(alle.length >= 100, `${sprak}: only ${alle.length} questions`);
    assert.equal(new Set(alle).size, alle.length, `${sprak}: a question twice`);
  }
});

test("a name in the question: {a} becomes another player, everyone in turn", () => {
  assert.deepEqual(Array.from(deler("Hvem her ville {a} ringt?", 2)), ["Hvem her ville ", 2, " ringt?"]);
  assert.deepEqual(Array.from(deler("Hvem her ler best?", 1)), ["Hvem her ler best?"]);
  for (const antall of [3, 5, 16]) {
    const telling = Array(antall).fill(0);
    const r = rng(antall);
    for (let n = 0; n < 120; n++) {
      const svarer = n % antall;
      const a = velgAnnen(antall, svarer, telling, r);
      assert.notEqual(a, svarer, "the one answering named in the question");
      assert.ok(a >= 0 && a < antall);
      telling[a] += 1;
    }
    assert.ok(Math.max(...telling) - Math.min(...telling) <= 2, `uneven: ${telling.join(" ")}`);
  }
});

test("pointing: only after reading, never at yourself", () => {
  const sp = ny(4, 1);
  sp.fase = "les";
  assert.equal(pek(sp, 2), false, "before the question was seen");
  sp.sett = true;
  assert.equal(pek(sp, 1), false, "at yourself");
  assert.equal(pek(sp, 4), false, "not a player");
  assert.equal(pek(sp, 3), true);
  assert.equal(sp.pekt, 3);
  assert.equal(sp.pektPa[3], 1);
  assert.equal(sp.fase, "pekt");
  assert.equal(pek(sp, 2), false, "twice");
});

test("the choice: a sip or a kind word throws the coin; letting it be keeps the secret", () => {
  for (const valg of VALG) {
    const sp = ny(3, 0);
    Object.assign(sp, { fase: "les", sett: true });
    pek(sp, 2);
    assert.equal(velg(sp, valg, () => 0.1, 7), true);
    assert.equal(sp.fase, "mynt");
    assert.equal(sp.valgt, valg);
    if (valg === "la") {
      assert.equal(sp.mynt, null);
      assert.equal(sp.avslort.length, 0);
    } else {
      assert.equal(sp.mynt, true);
      assert.deepEqual(JSON.parse(JSON.stringify(sp.avslort)), [{ k: 7, a: null, svarer: 0, pekt: 2 }]);
    }
  }
  const sp = ny(3, 0);
  Object.assign(sp, { fase: "les", sett: true });
  pek(sp, 1);
  assert.equal(velg(sp, "drikk", () => 0.1, 1), false, "an unknown choice");
  assert.equal(velg(sp, "slurk", () => 0.9, 1), true);
  assert.equal(sp.mynt, false);
  assert.equal(sp.avslort.length, 0);
});

test("the coin: about half of the questions come out", () => {
  const r = rng(11);
  let ute = 0;
  for (let n = 0; n < 2000; n++) {
    const sp = ny(3, 0);
    Object.assign(sp, { fase: "les", sett: true });
    pek(sp, 1);
    velg(sp, "snill", r, 0);
    if (sp.mynt) ute += 1;
  }
  assert.ok(ute > 900 && ute < 1100, `${ute} of 2000`);
});

test("whole evenings: the phone goes round, water every tenth round, the counts add up", () => {
  for (let fro = 1; fro <= 100; fro++) {
    const r = rng(fro);
    const antall = 3 + (fro % 14);
    const sp = ny(antall, fro % antall);
    let svar = 0;
    let vann = 0;
    let avslort = 0;
    const svarere = [];
    while (sp.runde < 40) {
      if (sp.fase === "vann") {
        vann += 1;
        assert.equal(sp.runde % VANN_HVERT, 0);
        assert.equal(videre(sp), "gi");
        continue;
      }
      assert.equal(sp.fase, "gi");
      svarere.push(sp.svarer);
      Object.assign(sp, { fase: "les", sett: true });
      const andre = Array.from({ length: antall }, (_, i) => i).filter((i) => i !== sp.svarer);
      assert.ok(pek(sp, andre[Math.floor(r() * andre.length)]));
      velg(sp, VALG[Math.floor(r() * 3)], r, svar);
      if (sp.mynt) avslort += 1;
      svar += 1;
      videre(sp);
    }
    assert.equal(sp.pektPa.reduce((s, n) => s + n, 0), svar);
    assert.equal(sp.avslort.length, avslort);
    assert.equal(sp.vann, 4, "water after rounds 10, 20, 30 and 40");
    assert.equal(sp.fase, "vann", "the fortieth round ends in water");
    assert.equal(vann, 3, "three water breaks passed on the way");
    // Round the table, one after the other.
    svarere.forEach((x, n) => n && assert.equal(x, (svarere[n - 1] + 1) % antall));
  }
});
