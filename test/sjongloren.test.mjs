// Sjongløren: the letter sets of every edition (enough sets of six and seven letters, each with
// 10–70 answers and at least one helord – the word the set was made from –, no set twice, the shipped
// word list is exactly the union of the sets' answers, every answer made of the set's letters, no
// rude words) and the engine (each letter at most as often as it is in the air, points and the helord
// bonus, why a word is refused, the progress per length, which tiles a typed word takes).
// Loads rusj/spill/sjongloren/spill.js without the kit (node:vm) and reads the data files directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/sjongloren/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Sjongloren;
const ut = (x) => JSON.parse(JSON.stringify(x));
const UTGAVER = { nb: "data", en: "data.en", da: "data.da" };
const ALFABET = { nb: /^[a-zæøå]+$/, da: /^[a-zæøå]+$/, en: /^[a-z]+$/ };
const data = Object.fromEntries(Object.entries(UTGAVER).map(([s, m]) => [s, JSON.parse(readFileSync(join(ROT, "rusj/spill/sjongloren", m, "bokstaver.json"), "utf8"))]));
const STYGGE = ["fuck", "shit", "cunt", "piss", "dritt", "faen", "kuk", "fitte", "lort", "pik", "kusse", "neger", "nigger", "sex", "porno", "anus"];
const nokkel = (o) => Array.from(o).sort().join("");

test("bokstavene: hver bokstav høyst så mange ganger som den er i lufta", () => {
  assert.ok(M.passer("katt", "takket"));
  assert.ok(!M.passer("katt", "kater"), "bare én t");
  assert.ok(M.passer("øre", "frøken") && !M.passer("ører", "frøken"), "æ, ø og å er vanlige bokstaver");
  assert.ok(M.passer("ære", "æresord"));
  assert.ok(M.passer("", "abc"), "et tomt ord passer");
  assert.deepEqual(ut(M.svarFor("takket", ["tak", "katt", "takket", "kake", "ta", "tekst"])), ["tak", "katt", "takket", "kake"]);
  assert.ok(M.erHelord("takket", "kettak") && !M.erHelord("katt", "takket"));
  assert.deepEqual(ut(M.helordFor("rose", ["eros", "rose", "ros", "sore"])), ["eros", "rose", "sore"]);
});

test("poeng: én per bokstav over to, helordet gir 10 ekstra", () => {
  assert.equal(M.poeng("tak", "takket"), 1);
  assert.equal(M.poeng("katt", "takket"), 2);
  assert.equal(M.poeng("takke", "takket"), 3);
  assert.equal(M.poeng("takket", "takket"), 14);
  assert.equal(M.poeng("rosende", "endrose"), 15);
  assert.equal(M.sumPoeng(["tak", "katt"], "takket"), 3);
  assert.deepEqual(ut(M.PLAN), [6, 6, 7, 7, 7]);
});

test("et ord som ikke godtas: for kort, feil bokstaver, funnet før, ikke i lista", () => {
  const svar = ["tak", "katt", "takket"];
  assert.equal(M.vurder("ta", "takket", svar, []), "kort");
  assert.equal(M.vurder("tekst", "takket", svar, []), "bokstav");
  assert.equal(M.vurder("katt", "takket", svar, ["katt"]), "funnet");
  assert.equal(M.vurder("ekt", "takket", svar, []), "ukjent");
  assert.equal(M.vurder("katt", "takket", svar, []), "");
});

test("framgang per lengde og hvilke brikker et skrevet ord tar", () => {
  const per = M.perLengde(["tak", "kat", "katt", "takket"], ["tak", "takket"]);
  assert.deepEqual(ut(per), { 3: { alle: 2, funnet: 1 }, 4: { alle: 1, funnet: 0 }, 6: { alle: 1, funnet: 1 } });
  assert.deepEqual(ut(M.brikkerFor("tak", "takket")), [0, 1, 2]);
  assert.deepEqual(ut(M.brikkerFor("kk", "takket")), [2, 3]);
  assert.equal(M.brikkerFor("kkk", "takket"), null);
});

for (const [sprak, d] of Object.entries(data)) {
  const liste = d.ord.split(" ");
  const ordsett = new Set(liste);
  const alle = d.seks.concat(d.sju);
  const svar = alle.map((s) => M.svarFor(s, liste));

  test(`${sprak}: nok sett av seks og sju bokstaver, ingen to like, kilder og lisens oppgitt`, () => {
    assert.ok(d.seks.length >= 300 && d.sju.length >= 400, `${d.seks.length} + ${d.sju.length} sett`);
    assert.ok(d.seks.every((s) => Array.from(s).length === 6) && d.sju.every((s) => Array.from(s).length === 7));
    assert.equal(new Set(alle.map(nokkel)).size, alle.length, "to sett har de samme bokstavene");
    assert.match(d.kilder, sprak === "nb" ? /Norsk ordbank.*CC BY 4\.0/ : sprak === "en" ? /ENABLE.*public domain.*12dicts/ : /COR.*CC0/);
  });

  test(`${sprak}: hvert sett har 10–70 svar, et helord og bare ord av sine egne bokstaver`, () => {
    alle.forEach((s, i) => {
      assert.ok(ALFABET[sprak].test(s), `«${s}»`);
      assert.deepEqual(ut(M.sjekkSett(s, liste)), [], `«${s}»`);
      assert.ok(svar[i].length >= 10 && svar[i].length <= 70, `«${s}»: ${svar[i].length} svar`);
      assert.ok(svar[i].includes(s), `«${s}» er ikke sitt eget helord`);
      for (const o of svar[i]) assert.ok(M.passer(o, s) && Array.from(o).length >= 3, `«${o}» i «${s}»`);
    });
  });

  test(`${sprak}: ordlista er nøyaktig alle svarene til settene – ingen hel ordbok`, () => {
    const union = new Set(svar.flat());
    assert.equal(liste.length, ordsett.size, "et ord står to ganger");
    assert.equal(union.size, ordsett.size, `${ordsett.size - union.size} ord er ikke svar i noe sett`);
    assert.ok(liste.length < 8000, `${liste.length} ord`);
  });

  test(`${sprak}: ingen stygge ord`, () => {
    for (const s of STYGGE) assert.ok(!ordsett.has(s), `«${s}»`);
  });
}
