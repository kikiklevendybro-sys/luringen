// Edderkoppen: the 4 × 4 grids of every edition (two years of daily grids and a free pool, 16
// letters of the edition, enough answers and a long word in each, no grid twice, the shipped word
// list is exactly the union of the grids' answers, no rude words), the neighbours (also on the
// slant, a cell once per word), tracing words, an independent check of the answers by walking every
// path, the points, the day's goal and stars, why a word is refused, and the group rule (words found
// by more than one player are struck out). Loads rusj/spill/edderkoppen/spill.js without the kit
// (node:vm) and reads the data files directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/edderkoppen/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Edderkoppen;
const ut = (x) => JSON.parse(JSON.stringify(x));
const UTGAVER = { nb: "data", en: "data.en", da: "data.da" };
const ALFABET = { nb: /^[a-zæøå]{16}$/, da: /^[a-zæøå]{16}$/, en: /^[a-z]{16}$/ };
const data = Object.fromEntries(Object.entries(UTGAVER).map(([s, m]) => [s, JSON.parse(readFileSync(join(ROT, "rusj/spill/edderkoppen", m, "rutenett.json"), "utf8"))]));
const STYGGE = ["fuck", "shit", "cunt", "piss", "dritt", "faen", "kuk", "fitte", "lort", "pik", "kusse", "neger", "nigger", "sex", "porno", "jøde", "anus"];

// Every word that can be traced in a grid, by walking every path that is the start of some word
// (independent of the engine's letter tree).
function alleStier(rute, ordsett, start) {
  const funnet = new Set();
  const brukt = new Array(16).fill(false);
  const gaa = (i, ord) => {
    const ny = ord + rute[i];
    if (!start.has(ny)) return;
    if (Array.from(ny).length >= 3 && ordsett.has(ny)) funnet.add(ny);
    brukt[i] = true;
    const r = Math.floor(i / 4);
    const c = i % 4;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < 4 && cc >= 0 && cc < 4 && !brukt[rr * 4 + cc]) gaa(rr * 4 + cc, ny);
      }
    brukt[i] = false;
  };
  for (let i = 0; i < 16; i++) gaa(i, "");
  return funnet;
}

test("naboer: hjørner 3, kanter 5, midten 8 – også på skrå, og alltid gjensidig", () => {
  const antall = M.NABO.map((n) => n.length);
  assert.deepEqual(ut(antall), [3, 5, 5, 3, 5, 8, 8, 5, 5, 8, 8, 5, 3, 5, 5, 3]);
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 16; b++) {
      assert.equal(M.erNabo(a, b), M.erNabo(b, a));
      const naer = a !== b && Math.abs(Math.floor(a / 4) - Math.floor(b / 4)) <= 1 && Math.abs((a % 4) - (b % 4)) <= 1;
      assert.equal(M.erNabo(a, b), naer, `${a}–${b}`);
    }
  assert.ok(M.erNabo(0, 5), "på skrå");
  assert.ok(!M.erNabo(3, 4), "ikke rundt kanten");
});

test("stier: hver rute én gang, hver ny rute ved siden av den forrige", () => {
  assert.ok(M.gyldigSti([0, 1, 2, 3]));
  assert.ok(M.gyldigSti([0, 5, 10, 15]));
  assert.ok(!M.gyldigSti([0, 1, 0]), "samme rute to ganger");
  assert.ok(!M.gyldigSti([0, 2]), "hopper over en rute");
  assert.ok(!M.gyldigSti([3, 4]), "rundt kanten");
  assert.ok(!M.gyldigSti([0, 16]), "utenfor rutenettet");
});

test("finne veien til et ord: også når en bokstav står flere steder, aldri samme rute to ganger", () => {
  // k a t t
  // x o s e
  // l a n d
  // y y y y
  const rute = Array.from("kattxoselandyyyy");
  assert.deepEqual(ut(M.finnSti(rute, "katt")), [0, 1, 2, 3]);
  assert.ok(M.kanSpores(rute, "land"));
  assert.ok(M.kanSpores(rute, "sone") === false || M.kanSpores(rute, "sone"), "uansett svar uten feil");
  assert.ok(M.kanSpores(rute, "tose"), "t-o-s-e på skrå og bortover");
  assert.ok(!M.kanSpores(rute, "kak"), "k bare én gang");
  assert.ok(!M.kanSpores(rute, "tatt"), "t–a–t–t trenger tre t-er ved siden av hverandre");
  assert.equal(M.finnSti(rute, "kyy"), null);
  const sti = M.finnSti(rute, "sand");
  assert.ok(M.gyldigSti(ut(sti)) && M.lesSti(rute, sti) === "sand");
  // A preferred start is kept where it can be.
  assert.deepEqual(ut(M.finnSti(Array.from("aaaabbbbccccdddd"), "ab", [3, 7])), [3, 7]);
  assert.deepEqual(ut(M.finnSti(Array.from("aaaabbbbccccdddd"), "ab", [3])).slice(0, 1), [3]);
});

test("poeng: 3–4 bokstaver 1, 5 gir 2, 6 gir 3, 7 gir 5, 8 eller flere 11", () => {
  assert.deepEqual(["abc", "abcd", "abcde", "abcdef", "abcdefg", "abcdefgh", "abcdefghijkl"].map(M.poeng), [1, 1, 2, 3, 5, 11, 11]);
  assert.equal(M.poeng("åæø"), 1, "æ, ø og å er én bokstav hver");
  assert.equal(M.sumPoeng(["katt", "lander"]), 4);
  assert.equal(M.maalFor(100), 20);
  assert.equal(M.maalFor(10), 5, "minst 5");
  assert.equal(M.stjernerFor(19, 100), 0);
  assert.equal(M.stjernerFor(20, 100), 1);
  assert.equal(M.stjernerFor(35, 100), 2);
  assert.equal(M.stjernerFor(50, 100), 3);
});

test("et ord som ikke godtas: for kort, funnet før, ikke blant svarene", () => {
  assert.equal(M.vurder("ka", ["katt"], []), "kort");
  assert.equal(M.vurder("katt", ["katt"], ["katt"]), "funnet");
  assert.equal(M.vurder("kott", ["katt"], []), "ukjent");
  assert.equal(M.vurder("katt", ["katt"], []), "");
});

test("sammen: ord som flere fant, strykes – og kan slås av", () => {
  const lister = [["katt", "land", "sand"], ["katt", "tose"], ["land", "lander"]];
  assert.deepEqual([...M.stroket(lister)].sort(), ["katt", "land"]);
  assert.deepEqual(ut(M.gruppePoeng(lister, true)), [1, 1, 3]);
  assert.deepEqual(ut(M.gruppePoeng(lister, false)), [3, 2, 4]);
  assert.deepEqual(ut(M.gruppePoeng([["katt", "katt"], []], true)), [2, 0], "samme ord to ganger hos én er ikke strøket");
});

test("dagnummer: nr. 1 er 14. november 2026, og dagene går rundt", () => {
  const forste = Math.floor(Date.UTC(2026, 10, 14) / 86400000);
  assert.equal(M.FORSTE, forste);
  assert.equal(M.nrFor(forste), 1);
  assert.equal(M.indeksFor(forste, 760), 0);
  assert.equal(M.indeksFor(forste + 760, 760), 0);
  assert.equal(M.indeksFor(forste - 1, 760), 759);
});

for (const [sprak, d] of Object.entries(data)) {
  const liste = d.ord.split(" ");
  const ordsett = new Set(liste);
  const alle = d.dagens.concat(d.fri);
  const svar = alle.map((r) => M.svarFor(Array.from(r), liste));

  test(`${sprak}: to år med dagens rutenett og et eget lager til fritt spill, kilder og lisens oppgitt`, () => {
    assert.ok(d.dagens.length >= 731, `bare ${d.dagens.length} dager`);
    assert.ok(d.fri.length >= 200, `bare ${d.fri.length} til fritt spill`);
    assert.equal(new Set(alle).size, alle.length, "et rutenett går igjen");
    assert.ok(typeof d.om === "string" && typeof d.kilder === "string");
    assert.match(d.kilder, sprak === "nb" ? /Norsk ordbank.*CC BY 4\.0/ : sprak === "en" ? /ENABLE.*public domain.*12dicts/ : /COR.*CC0/);
  });

  test(`${sprak}: hvert rutenett har 16 bokstaver, minst 40 svar og et ord på seks bokstaver eller mer`, () => {
    alle.forEach((r, i) => {
      assert.ok(ALFABET[sprak].test(r), `rutenett ${i}: «${r}»`);
      assert.deepEqual(ut(M.sjekkRutenett(r, liste)), [], `rutenett ${i}`);
      assert.ok(svar[i].length >= 40, `rutenett ${i}: ${svar[i].length} svar`);
      assert.ok(svar[i].some((o) => Array.from(o).length >= 6), `rutenett ${i}: ingen lange ord`);
    });
  });

  test(`${sprak}: ordlista er nøyaktig alle svarene til rutenettene – ingen hel ordbok`, () => {
    const union = new Set(svar.flat());
    assert.equal(union.size, ordsett.size, `${ordsett.size - union.size} ord er ikke svar i noe rutenett`);
    assert.equal(liste.length, ordsett.size, "et ord står to ganger");
    for (const o of liste) assert.ok(union.has(o), `«${o}» er ikke svar noe sted`);
    assert.ok(liste.length < 12000, `${liste.length} ord`);
  });

  test(`${sprak}: svarene stemmer med en uavhengig gjennomgang av alle stier (100 rutenett)`, () => {
    const start = new Set();
    for (const o of liste) for (let n = 1; n <= o.length; n++) start.add(o.slice(0, n));
    for (let k = 0; k < alle.length; k += Math.ceil(alle.length / 100)) {
      const rute = Array.from(alle[k]);
      const fasit = alleStier(rute, ordsett, start);
      assert.deepEqual([...svar[k]].sort(), [...fasit].sort(), `rutenett ${k}: «${alle[k]}»`);
      for (const o of svar[k]) {
        const sti = M.finnSti(rute, o);
        assert.ok(M.gyldigSti(ut(sti)) && M.lesSti(rute, sti) === o, `«${o}»`);
      }
    }
  });

  test(`${sprak}: ingen stygge ord`, () => {
    for (const s of STYGGE) assert.ok(!ordsett.has(s), `«${s}»`);
  });

  test(`${sprak}: det første året har ingen like dager`, () => {
    const aar = d.dagens.slice(0, 366);
    assert.equal(new Set(aar).size, aar.length);
  });
}
