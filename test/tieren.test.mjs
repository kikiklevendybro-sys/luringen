// Checks the Tieren question cards: every card has ten answers of the right kind, nothing is
// repeated, every category has easy cards, and the texts fit the ring on a small phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MAPPE = join(dirname(fileURLToPath(import.meta.url)), "../rusj/spill/tieren/data");
const les = (fil) => JSON.parse(readFileSync(join(MAPPE, fil), "utf8"));
const KATEGORIER = les("kategorier.json");
const FILER = readdirSync(MAPPE).filter((f) => f.startsWith("kort-") && f.endsWith(".json")).sort();
const ALLE = FILER.flatMap((f) => les(f).map((k, i) => ({ ...k, hvor: `${f} #${i + 1}` })));
const TYPER = ["ja", "tall", "gruppe", "rekke"];
// Long words carry soft hyphens (U+00AD) so they break in the right place on the ring.
const MYK = /\u00ad/g;
const synlig = (t) => String(t).replace(MYK, "");
const normal = (t) => synlig(t).toLocaleLowerCase("nb").replace(/[^a-z0-9æøåéèäöüá]+/g, " ").trim();
// The longest piece that cannot be broken: between spaces, hyphens and soft hyphens.
const lengsteBit = (t) => Math.max(...String(t).split(/[\s\-–\u00ad]+/).map((o) => o.length));

test("kategoriene har id, navn, kort navn, ikon og farge, og hver har sin egen fil", () => {
  const ider = KATEGORIER.map((k) => k.id);
  assert.equal(new Set(ider).size, ider.length, "dobbel kategori-id");
  for (const k of KATEGORIER) {
    assert.ok(k.id && k.navn && k.kort && k.ikon && k.farge, `kategori mangler felt: ${JSON.stringify(k)}`);
    assert.ok(FILER.includes(`kort-${k.id}.json`), `mangler data/kort-${k.id}.json`);
  }
  assert.equal(FILER.length, KATEGORIER.length, "en kortfil uten kategori");
});

test("minst 120 kort, nok i hver kategori og lette kort overalt", () => {
  assert.ok(ALLE.length >= 120, `bare ${ALLE.length} kort`);
  for (const k of KATEGORIER) {
    const egne = ALLE.filter((x) => x.k === k.id);
    assert.ok(egne.length >= 10, `${k.id} har bare ${egne.length} kort`);
    assert.ok(egne.filter((x) => x.n === 1).length >= 2, `${k.id} har for få lette kort (nivå 1)`);
    assert.ok(egne.some((x) => x.n >= 2), `${k.id} mangler middels eller vanskelige kort`);
  }
  for (const t of TYPER) assert.ok(ALLE.some((x) => x.t === t), `ingen kort av typen «${t}»`);
  // «Vanskelig» = nivå 2–3 in the game: enough for several long games.
  assert.ok(ALLE.filter((x) => x.n >= 2).length >= 40, "for få kort på «Vanskelig»");
});

test("hvert kort har riktig form", () => {
  const ider = new Set(KATEGORIER.map((k) => k.id));
  for (const k of ALLE) {
    const fil = k.hvor.split(" ")[0];
    const felt = Object.keys(k).filter((n) => n !== "hvor").sort();
    assert.deepEqual(felt, k.t === "gruppe" ? ["a", "k", "n", "s", "t", "v"] : ["a", "k", "n", "s", "t"], `${k.hvor}: feil felt`);
    assert.ok(ider.has(k.k), `${k.hvor}: ukjent kategori «${k.k}»`);
    assert.equal(fil, `kort-${k.k}.json`, `${k.hvor}: ligger i feil fil`);
    assert.ok([1, 2, 3].includes(k.n), `${k.hvor}: vanskelighet må være 1, 2 eller 3`);
    assert.ok(TYPER.includes(k.t), `${k.hvor}: ukjent type «${k.t}»`);
    assert.ok(typeof k.s === "string" && k.s.trim() === k.s && k.s.length >= 12 && k.s.length <= 90, `${k.hvor}: spørsmålet mangler eller er for langt`);
    assert.ok(k.s.endsWith("?"), `${k.hvor}: spørsmålet skal slutte med ?`);
    assert.ok(Array.isArray(k.a) && k.a.length === 10, `${k.hvor}: må ha nøyaktig ti svar`);
    for (const svar of k.a) {
      assert.ok(Array.isArray(svar) && svar.length === 2, `${k.hvor}: svar må være [tekst, fasit]`);
      const [tekst] = svar;
      assert.ok(typeof tekst === "string" && tekst.trim() === tekst && tekst.length > 0, `${k.hvor}: tomt eller utrimmet svar`);
      assert.ok(synlig(tekst).length <= 24, `${k.hvor}: «${synlig(tekst)}» er for langt for ringen`);
      // Every answer has the same size on the ring, so a long word needs a soft hyphen (U+00AD) to break at.
      assert.ok(lengsteBit(tekst) <= 11, `${k.hvor}: «${synlig(tekst)}» har et ord over 11 tegn uten myk bindestrek (\\u00ad)`);
      assert.ok(!/^\u00ad|\u00ad$|\u00ad[\s\-–]|[\s\-–]\u00ad|\u00ad\u00ad/.test(tekst), `${k.hvor}: «${synlig(tekst)}» har en myk bindestrek på feil sted`);
    }
    assert.equal(new Set(k.a.map(([t]) => normal(t))).size, 10, `${k.hvor}: to like svar`);
    const fasit = k.a.map(([, f]) => f);
    if (k.t === "ja") {
      assert.ok(fasit.every((f) => typeof f === "boolean"), `${k.hvor}: ja/nei-kort må ha true/false`);
      const ja = fasit.filter(Boolean).length;
      assert.ok(ja >= 3 && ja <= 7, `${k.hvor}: ${ja} av 10 er «ja» – blandingen skal være mellom 3 og 7`);
    }
    if (k.t === "tall") {
      assert.ok(fasit.every((f) => Number.isInteger(f) && f >= 0), `${k.hvor}: tallkort må ha hele tall`);
      const ulike = new Set(fasit).size;
      assert.ok(ulike >= 3 && ulike <= 10, `${k.hvor}: ${ulike} ulike tall gir for få eller for mange knapper`);
    }
    if (k.t === "gruppe") {
      assert.ok(Array.isArray(k.v) && k.v.length >= 2 && k.v.length <= 6, `${k.hvor}: gruppekort trenger 2–6 grupper`);
      assert.equal(new Set(k.v).size, k.v.length, `${k.hvor}: to like grupper`);
      for (const g of k.v) assert.ok(typeof g === "string" && synlig(g).length <= 18 && lengsteBit(g) <= 11, `${k.hvor}: gruppenavnet «${g}» er for langt`);
      for (const f of fasit) assert.ok(k.v.includes(f), `${k.hvor}: fasiten «${f}» er ingen av gruppene`);
      for (const g of k.v) assert.ok(fasit.includes(g), `${k.hvor}: ingen svar hører til gruppen «${g}»`);
    }
    if (k.t === "rekke") {
      assert.deepEqual(fasit.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], `${k.hvor}: rekkefølgen må bruke 1–10 nøyaktig én gang`);
      assert.ok(/\(1\)|rekkefølge|regnet fra/.test(k.s), `${k.hvor}: spørsmålet må si hva som er nummer 1`);
    }
  }
});

test("ingen kort kommer to ganger", () => {
  const sett = new Map();
  for (const k of ALLE) {
    const nokkel = normal(k.s) + "|" + k.a.map(([t]) => normal(t)).sort().join(",");
    assert.ok(!sett.has(nokkel), `${k.hvor} er lik ${sett.get(nokkel)}: «${k.s}»`);
    sett.set(nokkel, k.hvor);
  }
  const sporsmal = new Map();
  for (const k of ALLE) {
    const s = normal(k.s);
    assert.ok(!sporsmal.has(s) || sporsmal.get(s).k !== k.k, `${k.hvor}: samme spørsmål som ${sporsmal.get(s) && sporsmal.get(s).hvor} i samme kategori`);
    sporsmal.set(s, k);
  }
});

test("samme svar har samme fasit på tvers av kort med samme spørsmål", () => {
  // e.g. «Island» must be an island on every card that asks whether something is an island.
  const fasit = new Map();
  for (const k of ALLE) {
    for (const [tekst, f] of k.a) {
      const nokkel = normal(k.s) + "|" + normal(tekst);
      if (fasit.has(nokkel)) assert.equal(fasit.get(nokkel), f, `${k.hvor}: «${tekst}» har ulik fasit på like spørsmål`);
      fasit.set(nokkel, f);
    }
  }
});
