// Humla: the daily flowers of every edition (two years and more, seven different letters, 20–60
// answers with at least one «blomsterord», the shipped word list is exactly the union of the days'
// answers, no rude words) and the engine (points, ranks, why a word is refused, the day numbers).
// Loads rusj/spill/humla/spill.js without the kit (node:vm) and reads the data files directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/humla/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Humla;
const ut = (x) => JSON.parse(JSON.stringify(x));
const UTGAVER = { nb: "data", en: "data.en", da: "data.da" };
const ALFABET = { nb: /^[a-zæøå]+$/, da: /^[a-zæøå]+$/, en: /^[a-z]+$/ };
const data = Object.fromEntries(Object.entries(UTGAVER).map(([s, m]) => [s, JSON.parse(readFileSync(join(ROT, "rusj/spill/humla", m, "blomster.json"), "utf8"))]));

for (const [sprak, d] of Object.entries(data)) {
  const liste = d.ord.split(" ");
  const svar = d.dagens.map((dag) => M.svarFor(dag, liste));

  test(`${sprak}: minst to år med blomster, kilder og lisens oppgitt`, () => {
    assert.ok(d.dagens.length >= 731, `bare ${d.dagens.length} dager`);
    assert.ok(typeof d.om === "string" && typeof d.kilder === "string");
    assert.match(d.kilder, sprak === "nb" ? /Norsk ordbank.*CC BY 4\.0/ : sprak === "en" ? /ENABLE.*public domain/ : /COR.*CC0/);
  });

  test(`${sprak}: hver dag har sju ulike bokstaver, 20–60 svar og minst ett blomsterord`, () => {
    d.dagens.forEach((dag, i) => {
      assert.ok(ALFABET[sprak].test(dag), `dag ${i + 1}: «${dag}»`);
      assert.deepEqual(ut(M.sjekkDag(dag, liste)), [], `dag ${i + 1}: «${dag}»`);
      for (const o of svar[i]) {
        assert.ok(o.includes(dag[0]), `dag ${i + 1}: «${o}» mangler midtbokstaven`);
        assert.ok(o.length >= 4);
      }
    });
    const antall = svar.map((s) => s.length);
    const snitt = antall.reduce((a, b) => a + b) / antall.length;
    assert.ok(snitt >= 25 && snitt <= 45, `snittet er ${snitt}`);
  });

  test(`${sprak}: ingen bokstavsett går igjen, og aldri samme midtbokstav to dager på rad`, () => {
    const sett = d.dagens.map((dag) => [...dag].sort().join(""));
    assert.equal(new Set(sett).size, sett.length);
    for (let i = 1; i < d.dagens.length; i++) assert.notEqual(d.dagens[i][0], d.dagens[i - 1][0], `dag ${i} og ${i + 1}`);
    if (sprak === "en") assert.ok(d.dagens.every((dag) => !dag.includes("s")), "engelske blomster har aldri s");
  });

  test(`${sprak}: ordlista er nøyaktig alle dagenes svar – ingen hel ordbok`, () => {
    assert.equal(new Set(liste).size, liste.length, "ord går igjen i lista");
    const union = new Set(svar.flat());
    assert.equal(union.size, liste.length);
    for (const o of liste) {
      assert.ok(ALFABET[sprak].test(o) && o.length >= 4, `«${o}»`);
      assert.ok(union.has(o), `«${o}» er ikke svar på noen dag`);
    }
    assert.ok(liste.length < 12000, `${liste.length} ord`);
  });

  test(`${sprak}: ingen stygge ord`, () => {
    const stygge = {
      nb: ["faen", "fitte", "kuken", "hore", "horer", "dritt", "pisse", "porno", "neger", "drept", "mord", "voldtekt", "bordell", "sexy"],
      en: ["fuck", "shit", "cunt", "whore", "bitch", "porn", "rape", "raped", "nigger", "penis", "murder", "suicide", "damn", "hell", "crap", "orgy", "pimp"],
      da: ["fanden", "lort", "kusse", "fisse", "luder", "porno", "neger", "perker", "voldtægt", "mord", "morder", "liderlig", "pikken"],
    }[sprak];
    const sett = new Set(liste);
    for (const o of stygge) assert.ok(!sett.has(o), `«${o}» er med`);
    for (const o of liste) assert.ok(!/fuck|shit|cunt|porn|faen|dritt|jævl|helvet|lort|helved|pisse|neger|nigger/.test(o), `«${o}»`);
  });

  test(`${sprak}: dagene følger datoen, og de første blomstene endres ikke`, () => {
    const forste = Math.floor(Date.UTC(2026, 10, 13) / 86400000);
    const fast = { nb: ["ødefmor", "igkorst", "pakmrst"], en: ["iablnot", "pabehlt", "laginry"], da: ["pegirst", "deghilm", "habdeln"] }[sprak];
    const n = d.dagens.length;
    for (let i = 0; i < fast.length; i++) assert.equal(d.dagens[M.indeksFor(forste + i, n)], fast[i], `dag ${i + 1}`);
    // The first two years: every day its own flower.
    const brukt = new Set();
    for (let nr = forste; nr < forste + 731; nr++) brukt.add(M.indeksFor(nr, n));
    assert.equal(brukt.size, 731);
  });
}

test("poeng: fire bokstaver gir 1, lengre ord ett per bokstav, blomsterord 7 ekstra", () => {
  const dag = "aklnrst"; // centre a
  assert.equal(M.poeng("land", dag), 1);
  assert.equal(M.poeng("lands", dag), 5);
  assert.equal(M.poeng("transkl", dag), 14);
  assert.ok(M.erBlomsterord("klartns", dag));
  assert.ok(!M.erBlomsterord("lands", dag));
  assert.equal(M.sumPoeng(["land", "lands"], dag), 6);
});

test("rang: ni trinn etter andel av maks, honning er nr. 7, alle ord gir toppen", () => {
  assert.equal(M.GRENSER.length, 9);
  assert.equal(M.MAAL, 6);
  assert.equal(M.rang(0, 100), 0);
  assert.equal(M.rang(3, 100), 1);
  assert.equal(M.rang(39, 100), 5);
  assert.equal(M.rang(40, 100), 6);
  assert.equal(M.rang(99, 100), 7);
  assert.equal(M.rang(100, 100), 8);
  for (let i = 1; i < 9; i++) assert.ok(M.grenseFor(i, 157) >= M.grenseFor(i - 1, 157));
});

test("vurder: for kort, uten midtbokstav, fremmed bokstav, funnet før, ukjent, godkjent", () => {
  const dag = "abdeiln";
  const svar = ["blad", "bladene", "ballade"];
  assert.equal(M.vurder("bad", dag, svar, []), "kort");
  assert.equal(M.vurder("lind", dag, svar, []), "midt");
  assert.equal(M.vurder("blads", dag, svar, []), "bokstav");
  assert.equal(M.vurder("blad", dag, svar, ["blad"]), "funnet");
  assert.equal(M.vurder("aldi", dag, svar, []), "ukjent");
  assert.equal(M.vurder("blad", dag, svar, []), "");
});

test("svarFor plukker bare ord av dagens bokstaver med midtbokstaven", () => {
  const liste = ["blad", "bladene", "land", "lind", "ballade", "bil", "dele", "badet"];
  assert.deepEqual(ut(M.svarFor("abdeiln", liste)), ["blad", "bladene", "land", "ballade"]);
});

test("Humla nr. 1 er 13. november 2026", () => {
  const forste = Math.floor(Date.UTC(2026, 10, 13) / 86400000);
  assert.equal(M.FORSTE, forste);
  assert.equal(M.nrFor(forste), 1);
  assert.equal(M.indeksFor(forste - 1, 760), 759);
});
