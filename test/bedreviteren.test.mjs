// Checks the Bedreviteren question bank: shape of every question, no duplicates, enough of each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MAPPE = join(dirname(fileURLToPath(import.meta.url)), "../rusj/spill/bedreviteren/data");
const les = (fil) => JSON.parse(readFileSync(join(MAPPE, fil), "utf8"));
const KATEGORIER = les("kategorier.json");
const FILER = readdirSync(MAPPE).filter((f) => f.startsWith("sporsmal-") && f.endsWith(".json")).sort();
const ALLE = FILER.flatMap((f) => les(f).map((q, i) => ({ ...q, hvor: `${f} #${i + 1}` })));
const normal = (t) => String(t).toLocaleLowerCase("nb").replace(/[^a-z0-9æøåéè]+/g, " ").trim();

test("kategoriene har id, navn og ikon, og hver har sin egen fil", () => {
  const ider = KATEGORIER.map((k) => k.id);
  assert.equal(new Set(ider).size, ider.length, "dobbel kategori-id");
  for (const k of KATEGORIER) {
    assert.ok(k.id && k.navn && k.ikon, `kategori mangler felt: ${JSON.stringify(k)}`);
    assert.ok(FILER.includes(`sporsmal-${k.id}.json`), `mangler data/sporsmal-${k.id}.json`);
  }
});

test("minst 500 spørsmål, og hver kategori har nok", () => {
  assert.ok(ALLE.length >= 500, `bare ${ALLE.length} spørsmål`);
  for (const k of KATEGORIER) {
    const egne = ALLE.filter((q) => q.k === k.id);
    assert.ok(egne.length >= 40, `${k.id} har bare ${egne.length} spørsmål`);
    const nivaer = k.id === "barn" ? [1] : [1, 2, 3];
    for (const n of nivaer) assert.ok(egne.some((q) => q.n === n), `${k.id} mangler nivå ${n}`);
  }
});

test("hvert spørsmål har riktig form", () => {
  const ider = new Set(KATEGORIER.map((k) => k.id));
  for (const q of ALLE) {
    const fil = q.hvor.split(" ")[0];
    assert.ok(ider.has(q.k), `${q.hvor}: ukjent kategori «${q.k}»`);
    assert.equal(fil, `sporsmal-${q.k}.json`, `${q.hvor}: ligger i feil fil`);
    assert.ok([1, 2, 3].includes(q.n), `${q.hvor}: vanskelighet må være 1, 2 eller 3`);
    assert.ok(typeof q.s === "string" && q.s.trim().length >= 10, `${q.hvor}: mangler spørsmålstekst`);
    assert.ok(/[?…]$/.test(q.s), `${q.hvor}: spørsmålet skal slutte med ? eller …`);
    assert.ok(q.s.length <= 130, `${q.hvor}: spørsmålet er for langt (${q.s.length} tegn)`);
    assert.ok(Array.isArray(q.a) && q.a.length === 4, `${q.hvor}: må ha nøyaktig fire svar`);
    for (const a of q.a) {
      assert.ok(typeof a === "string" && a.trim() === a && a.length > 0, `${q.hvor}: tomt eller utrimmet svar`);
      assert.ok(a.length <= 50, `${q.hvor}: svaret «${a}» er for langt`);
      assert.ok(!/alle (de )?over|ingen av (dem|disse)/i.test(a), `${q.hvor}: svar som avhenger av rekkefølgen («${a}»)`);
    }
    assert.equal(new Set(q.a.map((x) => x.toLocaleLowerCase("nb"))).size, 4, `${q.hvor}: to like svar`);
    assert.ok(Number.isInteger(q.r) && q.r >= 0 && q.r <= 3, `${q.hvor}: ugyldig fasit-indeks ${q.r}`);
    assert.ok(typeof q.fakta === "string" && q.fakta.length >= 15, `${q.hvor}: mangler fakta`);
    assert.ok(q.fakta.length <= 170, `${q.hvor}: fakta er for lang (${q.fakta.length} tegn)`);
    assert.ok(/[.!»]$/.test(q.fakta), `${q.hvor}: fakta skal være en hel setning`);
    assert.deepEqual(Object.keys(q).filter((n) => n !== "hvor").sort(), ["a", "fakta", "k", "n", "r", "s"], `${q.hvor}: ukjente felt`);
  }
});

test("ingen spørsmål kommer to ganger", () => {
  const sett = new Map();
  for (const q of ALLE) {
    const nokkel = normal(q.s) + "|" + normal(q.a[q.r]);
    assert.ok(!sett.has(nokkel), `${q.hvor} er lik ${sett.get(nokkel)}: «${q.s}»`);
    sett.set(nokkel, q.hvor);
  }
  const tekster = new Map();
  for (const q of ALLE) {
    const t = normal(q.s);
    if (tekster.has(t)) assert.notEqual(normal(q.a[q.r]), normal(tekster.get(t).a[tekster.get(t).r]), `${q.hvor}: samme spørsmål og svar som ${tekster.get(t).hvor}`);
    tekster.set(t, q);
  }
});

test("fasiten er spredt på alle fire plasser i dataene", () => {
  const telling = [0, 0, 0, 0];
  for (const q of ALLE) telling[q.r] += 1;
  for (const n of telling) assert.ok(n >= ALLE.length * 0.15, `fasit-plassene er skjevt fordelt: ${telling.join("/")}`);
});

test("«Dagens fem» har nok spørsmål til minst 110 dager uten gjentakelse", () => {
  // The daily round uses every question except the children's ones, once per cycle of
  // floor(n / 5) days (see dagensSporsmal in spill.js).
  const voksne = ALLE.filter((q) => q.k !== "barn");
  const dager = Math.floor(voksne.length / 5);
  assert.ok(dager >= 110, `bare ${dager} dager`);
  // A day goes from easy to hard: at least one easy and (nearly always) one hard question a day.
  assert.ok(voksne.filter((q) => q.n === 1).length >= dager, "for få lette spørsmål");
  assert.ok(voksne.filter((q) => q.n === 3).length >= dager * 0.8, "for få vanskelige spørsmål");
});
