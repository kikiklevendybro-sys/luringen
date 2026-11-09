// Papegøyen's questions: enough of them, all yes/no questions, no negative traps, follow-ups kept out of the deck.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const P = JSON.parse(readFileSync(new URL("../rusj/spill/papegoyen/data/sporsmal.json", import.meta.url), "utf8"));
const alle = P.pakker.flatMap((p) => p.sporsmal);

test("minst 300 spørsmål uten dubletter, alle med spørsmålstegn", () => {
  assert.ok(alle.length >= 300, `bare ${alle.length}`);
  assert.equal(new Set(alle).size, alle.length);
  for (const s of alle) assert.match(s, /\?$/);
});
test("ingen nektende spørsmål og ingen oppfølgere i bunken", () => {
  for (const s of alle) assert.ok(!/^\S+ (du )?(ikke|aldri)\b|^\S+ ikke du\b/i.test(s), `nektende: ${s}`);
  for (const o of P.oppfolgere) assert.ok(!alle.includes(o), `oppfølger i bunken: ${o}`);
  assert.ok(P.oppfolgere.length >= 6);
});
test("pakkenavn fra KIT", () => {
  assert.deepEqual(P.pakker.map((p) => p.navn), ["Barn", "Familie", "Venner"]);
});
