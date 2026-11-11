// Mimen's tasks: well-formed, no task twice, the Jul category complete — and last in the file, so
// the numbers the deck has remembered on people's phones keep pointing at the same tasks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync(new URL("../rusj/spill/mimen/data/oppgaver.json", import.meta.url), "utf8"));
const KAT = D.kategorier;
const alle = KAT.flatMap((k) => k.oppgaver.map(([t, n]) => ({ k: k.id, t, n })));
const nokkel = (t) => t.trim().toLocaleLowerCase("nb");

test("kategoriene har id, navn, ikon, tekst og oppgaver", () => {
  assert.equal(new Set(KAT.map((k) => k.id)).size, KAT.length);
  for (const k of KAT) {
    for (const felt of ["id", "navn", "ikon", "tekst"]) assert.ok(typeof k[felt] === "string" && k[felt].trim() === k[felt] && k[felt], `${k.id}: mangler ${felt}`);
    assert.match(k.id, /^[a-z]+$/);
    assert.ok(k.oppgaver.length >= 55, `${k.id}: bare ${k.oppgaver.length} oppgaver`);
  }
});

test("hver oppgave er en kort tekst med nivå 1–3, uten punktum", () => {
  for (const k of KAT)
    for (const o of k.oppgaver) {
      assert.ok(Array.isArray(o) && o.length === 2, `${k.id}: ${JSON.stringify(o)}`);
      const [t, n] = o;
      assert.ok(typeof t === "string" && t === t.trim() && t.length >= 2 && t.length <= 42 && !/\s\s/.test(t), `${k.id}: «${t}»`);
      assert.ok(!/[.!?:;]$/.test(t), `${k.id}: «${t}» slutter med skilletegn`);
      assert.match(t, /^[A-ZÆØÅ]/, `${k.id}: «${t}» skal ha stor forbokstav`);
      assert.ok([1, 2, 3].includes(n), `${k.id}: «${t}» har nivå ${n}`);
    }
});

test("ingen oppgave står to ganger (heller ikke i to kategorier)", () => {
  const sett = new Map();
  for (const o of alle) {
    assert.ok(!sett.has(nokkel(o.t)), `«${o.t}» står i både ${sett.get(nokkel(o.t))} og ${o.k}`);
    sett.set(nokkel(o.t), o.k);
  }
  assert.ok(alle.length >= 600, `bare ${alle.length} oppgaver`);
});

test("Jul: seksti oppgaver på alle tre nivåer, sist i fila, med pakkenavn fra KIT", () => {
  const jul = KAT[KAT.length - 1];
  assert.equal(jul.id, "jul");
  assert.deepEqual([jul.navn, jul.ikon, jul.tekst], ["Jul", "🎄", "Jul og julebord"]);
  assert.equal(jul.oppgaver.length, 60);
  for (const n of [1, 2, 3]) assert.ok(jul.oppgaver.filter((o) => o[1] === n).length >= 15, `for få julenivå ${n}`);
  // The order of the older categories is what the saved decks count by.
  assert.deepEqual(KAT.map((k) => k.id), ["dyr", "yrker", "sport", "hverdag", "folelser", "eventyr", "handlinger", "situasjoner", "barn", "jul"]);
});

test("felles skrivemåter (KIT)", () => {
  for (const o of alle) assert.ok(!/(^|[^a-zæøå])(fingre|spaghetti|frem|giraff|stod|ferge|diskotek)($|[^a-zæøå])/i.test(o.t), `«${o.t}»`);
});
