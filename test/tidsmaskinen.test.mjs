// Checks the Tidsmaskinen event cards: shape of every event, valid years, no duplicates, enough of
// each category and difficulty, and that the filters in the game always leave plenty of cards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MAPPE = join(dirname(fileURLToPath(import.meta.url)), "../rusj/spill/tidsmaskinen/data");
const les = (fil) => JSON.parse(readFileSync(join(MAPPE, fil), "utf8"));
const KATEGORIER = les("kategorier.json");
const FILER = readdirSync(MAPPE).filter((f) => f.startsWith("hendelser-") && f.endsWith(".json")).sort();
const ALLE = FILER.flatMap((f) => les(f).map((h, i) => ({ ...h, hvor: `${f} #${i + 1}` })));
const normal = (t) => String(t).toLocaleLowerCase("nb").replace(/[^a-z0-9æøåéèäöü]+/g, " ").trim();
// Facts must be settled: nothing after the last full year (the deck was extended to 2025 in November 2026).
const SISTE_AAR = 2025;

test("kategoriene har id, navn, kort navn, ikon og farge, og hver har sin egen fil", () => {
  const ider = KATEGORIER.map((k) => k.id);
  assert.equal(new Set(ider).size, ider.length, "dobbel kategori-id");
  for (const k of KATEGORIER) {
    assert.ok(k.id && k.navn && k.kort && k.ikon && k.farge, `kategori mangler felt: ${JSON.stringify(k)}`);
    assert.ok(FILER.includes(`hendelser-${k.id}.json`), `mangler data/hendelser-${k.id}.json`);
  }
  assert.equal(FILER.length, KATEGORIER.length, "en hendelsesfil uten kategori");
});

test("minst 400 hendelser, og hver kategori har nok på hvert nivå", () => {
  assert.ok(ALLE.length >= 400, `bare ${ALLE.length} hendelser`);
  for (const k of KATEGORIER) {
    const egne = ALLE.filter((h) => h.k === k.id);
    assert.ok(egne.length >= 50, `${k.id} har bare ${egne.length} hendelser`);
    for (const n of [1, 2, 3]) assert.ok(egne.some((h) => h.n === n), `${k.id} mangler nivå ${n}`);
    assert.ok(egne.filter((h) => h.n <= 2).length >= 8, `${k.id} har for få lette hendelser`);
  }
});

test("hver hendelse har riktig form og et gyldig årstall", () => {
  const ider = new Set(KATEGORIER.map((k) => k.id));
  for (const h of ALLE) {
    const fil = h.hvor.split(" ")[0];
    assert.deepEqual(Object.keys(h).filter((n) => n !== "hvor").sort(), ["a", "k", "n", "t"], `${h.hvor}: feil felt`);
    assert.ok(ider.has(h.k), `${h.hvor}: ukjent kategori «${h.k}»`);
    assert.equal(fil, `hendelser-${h.k}.json`, `${h.hvor}: ligger i feil fil`);
    assert.ok([1, 2, 3].includes(h.n), `${h.hvor}: vanskelighet må være 1, 2 eller 3`);
    assert.ok(Number.isInteger(h.a) && h.a !== 0, `${h.hvor}: årstallet må være et heltall (og det finnes ikke noe år 0)`);
    assert.ok(h.a >= -3000 && h.a <= SISTE_AAR, `${h.hvor}: årstallet ${h.a} er utenfor ${-3000}–${SISTE_AAR}`);
    assert.ok(typeof h.t === "string" && h.t.trim() === h.t && h.t.length >= 8, `${h.hvor}: mangler tekst`);
    assert.ok(h.t.length <= 70, `${h.hvor}: teksten er for lang (${h.t.length} tegn)`);
    assert.ok(!/[.!?]$/.test(h.t), `${h.hvor}: teksten skal ikke slutte med punktum`);
    assert.ok(!new RegExp(`(^|\\D)${Math.abs(h.a)}(\\D|$)`).test(h.t), `${h.hvor}: teksten avslører årstallet: «${h.t}»`);
    assert.ok(/^[A-ZÆØÅ«0-9]/.test(h.t), `${h.hvor}: teksten skal starte med stor bokstav`);
    assert.ok(!/ {2}|\s,|„|"/.test(h.t), `${h.hvor}: dobbelt mellomrom, mellomrom før komma eller feil anførselstegn`);
  }
});

test("ingen hendelse kommer to ganger", () => {
  const sett = new Map();
  for (const h of ALLE) {
    const nokkel = normal(h.t);
    assert.ok(!sett.has(nokkel), `${h.hvor} er lik ${sett.get(nokkel)}: «${h.t}»`);
    sett.set(nokkel, h.hvor);
  }
});

test("årstallene er spredt, og filtrene i spillet gir alltid nok kort", () => {
  const aar = new Set(ALLE.map((h) => h.a));
  assert.ok(aar.size >= 200, `bare ${aar.size} forskjellige årstall`);
  // No single year may dominate: equal years are allowed in the game (both places count), but rare.
  const telling = new Map();
  for (const h of ALLE) telling.set(h.a, (telling.get(h.a) || 0) + 1);
  for (const [a, n] of telling) assert.ok(n <= 8, `${n} hendelser i ${a}`);
  const eldre = ALLE.filter((h) => h.a < 1800).length;
  assert.ok(eldre >= 60, `bare ${eldre} hendelser før 1800`);
  const nyere = ALLE.filter((h) => h.a >= 2000).length;
  assert.ok(nyere <= 150, `${nyere} hendelser etter 2000 – hold dem få nok og helt sikre`);
  // Lett = nivå 1–2, Vanskelig = nivå 3 (as in spill.js). A 10-player game to 10 cards needs well over 100.
  assert.ok(ALLE.filter((h) => h.n <= 2).length >= 100, "for få hendelser på «Lett»");
  assert.ok(ALLE.filter((h) => h.n === 3).length >= 250, "for få hendelser på «Vanskelig»");
});
