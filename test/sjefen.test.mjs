// Sjefen (task deck with the players' names, 18+): the cards in nb, en and da (same packs, known
// kinds, placeholders in order, rules that end, a choice without drinking on every «drink or do»
// card, never more than three sips), the names put into the cards (fair turns, every placeholder
// filled), and the evening's plan (water every tenth card, rules that end four to seven cards
// later, at most two at a time, all ended before the last card). Loads spill.js without the kit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/sjefen/spill.js"), "utf8"), kontekst);
const { trengs, velgSpillere, deler, fyll, planlegg, kortAv, TYPER, VANN_HVERT, MAKS_REGLER, VARIGHET } = kontekst.window.Sjefen;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const les = (mappe) => JSON.parse(readFileSync(join(ROT, "rusj/spill/sjefen", mappe, "kort.json"), "utf8"));
const SPRAK = { nb: les("data"), en: les("data.en"), da: les("data.da") };
const ELLER = { nb: /\beller\b/i, en: /\bor\b/i, da: /\beller\b/i };
// «Take four (or more) sips» in any language: a card never asks for that.
const FOR_MYE = {
  nb: /\bta[r]?\s+(fire|fem|seks|sju|åtte|ni|ti|\d+)\s+slurk/i,
  en: /\btakes?\s+(four|five|six|seven|eight|nine|ten|\d+)\s+sips/i,
  da: /\btag(er)?\s+(fire|fem|seks|syv|otte|ni|ti|\d+)\s+slurk/i,
};

test("the same packs in every language, with the same kinds of cards in the same order", () => {
  const nb = SPRAK.nb.pakker;
  for (const [sprak, d] of Object.entries(SPRAK)) {
    assert.deepEqual(d.pakker.map((p) => p.id), nb.map((p) => p.id), `${sprak}: packs`);
    d.pakker.forEach((p, i) => {
      assert.equal(p.kort.length, nb[i].kort.length, `${sprak}/${p.id}: number of cards`);
      assert.equal(!!p.av, !!nb[i].av, `${sprak}/${p.id}: off by default`);
      p.kort.forEach((k, j) => {
        const a = kortAv(k);
        const b = kortAv(nb[i].kort[j]);
        assert.equal(a.type, b.type, `${sprak}/${p.id} #${j}: kind`);
        assert.equal(trengs(a.t), trengs(b.t), `${sprak}/${p.id} #${j}: players named («${a.t}»)`);
      });
    });
    assert.ok(d.finale.length >= 3, `${sprak}: last cards`);
  }
});

test("every card is well formed: known kind, placeholders in order, rules end, a way out without drinking", () => {
  for (const [sprak, d] of Object.entries(SPRAK)) {
    const alle = d.pakker.flatMap((p) => p.kort.map(kortAv));
    assert.ok(alle.length >= 120, `${sprak}: only ${alle.length} cards`);
    assert.equal(new Set(alle.map((k) => k.t)).size, alle.length, `${sprak}: a card twice`);
    for (const k of [...alle, ...d.finale.map(kortAv)]) {
      assert.ok(TYPER.includes(k.type), `${sprak}: unknown kind ${k.type}`);
      const brukt = new Set((k.t.match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)));
      for (const x of brukt) assert.ok(["a", "b", "c"].includes(x), `${sprak}: unknown placeholder {${x}} in «${k.t}»`);
      assert.equal(brukt.size, trengs(k.t), `${sprak}: placeholders out of order in «${k.t}»`);
      assert.ok(!/[{}]/.test(k.t.replace(/\{[abc]\}/g, "")), `${sprak}: a stray brace in «${k.t}»`);
      assert.ok(!FOR_MYE[sprak].test(k.t), `${sprak}: more than three sips in «${k.t}»`);
      assert.ok(!/picolo/i.test(k.t), `${sprak}: a brand name in «${k.t}»`);
      if (k.type === "regel") {
        assert.ok(k.slutt, `${sprak}: a rule without its end: «${k.t}»`);
        assert.ok(trengs(k.slutt) <= trengs(k.t), `${sprak}: the end names someone the rule did not: «${k.slutt}»`);
      } else assert.equal(k.slutt, undefined, `${sprak}: an end on a card that is no rule: «${k.t}»`);
      if (k.type === "valg") assert.ok(ELLER[sprak].test(k.t), `${sprak}: «drink or do» without a choice: «${k.t}»`);
    }
  }
});

test("how many players a card names", () => {
  assert.equal(trengs("Alle tar en slurk."), 0);
  assert.equal(trengs("{a}, del ut to slurker."), 1);
  assert.equal(trengs("{a} og {b}: duell. {a} begynner."), 2);
  assert.equal(trengs("{a}, {b} og {c}"), 3);
});

test("names go into the card: every placeholder, the same name each time, nothing left over", () => {
  const navn = ["Testspiller A", "Testspiller B", "Testspiller C"];
  assert.equal(fyll("{a} og {b}: {a} begynner.", [2, 0], (i) => navn[i]), "Testspiller C og Testspiller A: Testspiller C begynner.");
  assert.deepEqual(Array.from(deler("{a}, skål!", [1])), [1, ", skål!"]);
  assert.deepEqual(Array.from(deler("Skål for {a}", [0])), ["Skål for ", 0]);
  for (const [sprak, d] of Object.entries(SPRAK))
    for (const k of d.pakker.flatMap((p) => p.kort.map(kortAv))) {
      const hvem = velgSpillere(3, trengs(k.t), [], rng(7));
      const ut = fyll(k.t, hvem, (i) => navn[i]);
      assert.ok(!/\{[abc]\}/.test(ut), `${sprak}: «${ut}»`);
      for (const i of hvem) assert.ok(ut.includes(navn[i]), `${sprak}: ${navn[i]} missing in «${ut}»`);
      if (k.slutt) assert.ok(!/\{[abc]\}/.test(fyll(k.slutt, hvem, (i) => navn[i])), `${sprak}: «${k.slutt}»`);
    }
});

test("picking players: different people, everyone in range, and fair turns over an evening", () => {
  for (const antall of [3, 4, 7, 16]) {
    const telling = Array(antall).fill(0);
    const r = rng(antall);
    for (let n = 0; n < 200; n++) {
      const k = 1 + (n % 3);
      const hvem = Array.from(velgSpillere(antall, k, telling, r));
      assert.equal(hvem.length, Math.min(k, antall));
      assert.equal(new Set(hvem).size, hvem.length, "the same player twice on a card");
      for (const i of hvem) {
        assert.ok(Number.isInteger(i) && i >= 0 && i < antall);
        telling[i] += 1;
      }
      assert.ok(Math.max(...telling) - Math.min(...telling) <= 1, `uneven turns: ${telling.join(" ")}`);
    }
  }
  // The order is random, not always the least named first.
  const forste = new Set();
  for (let f = 1; f <= 30; f++) forste.add(velgSpillere(4, 2, [0, 0, 0, 0], rng(f))[0]);
  assert.ok(forste.size >= 3);
});

// A deck of n cards where every fifth card starts a rule.
const erRegel = (k) => k % 5 === 2;
function sjekkPlan(plan, kort, strengt = true) {
  const [kortest, lengst] = VARIGHET;
  assert.ok(plan[plan.length - 1].f === 1, "the last step is not the last card");
  assert.equal(plan.filter((x) => x.f).length, 1);
  let n = 0;
  const startet = new Map(); // step → card count when it started
  const aktive = new Set();
  const sett = [];
  plan.forEach((x, j) => {
    if (x.k != null) {
      n += 1;
      sett.push(x.k);
      if (erRegel(x.k)) {
        startet.set(j, n);
        aktive.add(j);
        assert.ok(aktive.size <= MAKS_REGLER, `${aktive.size} rules at once`);
      }
    } else if (x.s != null) {
      assert.ok(aktive.has(x.s), `an end for a rule that is not running (step ${x.s})`);
      aktive.delete(x.s);
      const varte = n - startet.get(x.s);
      if (strengt && !plan.slice(j).every((y) => y.s != null || y.f)) assert.ok(varte >= kortest && varte <= lengst, `a rule lasted ${varte} cards`);
    } else if (x.v) {
      assert.equal(n % VANN_HVERT, 0, `a water card after ${n} cards`);
      assert.ok(plan[j - 1].k != null, "a water card not right after a card");
    }
  });
  assert.equal(aktive.size, 0, "a rule still running at the end");
  assert.equal(new Set(sett).size, sett.length, "a card twice");
  for (const k of kort) if (!erRegel(k)) assert.ok(sett.includes(k), `card ${k} left out`);
  return n;
}

test("the plan: water every tenth card, rules end four to seven cards later, at most two at a time", () => {
  for (let fro = 1; fro <= 300; fro++) {
    const r = rng(fro);
    const lengde = [30, 50, 80][fro % 3];
    const kort = Array.from({ length: lengde }, (_, i) => i);
    for (let i = kort.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [kort[i], kort[j]] = [kort[j], kort[i]];
    }
    const plan = planlegg(kort, { erRegel, rng: r });
    const n = sjekkPlan(plan, kort);
    assert.ok(n >= lengde - 4, `only ${n} of ${lengde} cards`);
    assert.equal(plan.filter((x) => x.v).length, Math.floor((n - 1) / VANN_HVERT), "water cards");
  }
});

test("the plan keeps every card of a real deck: rules near the end move earlier", () => {
  const ekte = (k) => k % 10 === 3; // about one card in ten is a rule, as in the packs
  for (let fro = 1; fro <= 300; fro++) {
    const r = rng(fro);
    const lengde = [30, 50, 80][fro % 3];
    const kort = Array.from({ length: lengde }, (_, i) => (i * 7 + fro) % 100);
    const plan = planlegg(kort, { erRegel: ekte, rng: r });
    assert.equal(plan.filter((x) => x.k != null).length, lengde, `seed ${fro}: a card was dropped`);
  }
});

test("the plan with nothing but rules, and with very few cards", () => {
  const regler = Array.from({ length: 12 }, (_, i) => i * 5 + 2);
  // Only rules: the oldest gives way early so the next can start (never more than two at a time).
  const plan = planlegg(regler, { erRegel, rng: rng(3) });
  sjekkPlan(plan, regler, false);
  assert.ok(plan.filter((x) => x.k != null).length >= 5, "the rules were thrown away");
  assert.deepEqual(JSON.parse(JSON.stringify(planlegg([], { erRegel, rng: rng(1) }))), [{ f: 1 }]);
  const tre = planlegg([0, 1, 2], { erRegel, rng: rng(1) });
  assert.deepEqual(JSON.parse(JSON.stringify(tre)), [{ k: 0 }, { k: 1 }, { f: 1 }], "a rule this late cannot last");
});

test("the plan is the same for the same seed", () => {
  const kort = Array.from({ length: 50 }, (_, i) => i);
  assert.deepEqual(JSON.stringify(planlegg(kort, { erRegel, rng: rng(42) })), JSON.stringify(planlegg(kort, { erRegel, rng: rng(42) })));
});
