// Sporhunden: the daily grids of every edition (a year and more; every grid fully used by its
// theme words, the key word from side to side, no crossings, no word of the theme there by
// accident, at most two words that can also be traced elsewhere), the hint words (only words that
// can be traced in the grids, no rude ones), the grid generator, the classic word search generator
// (over many seeds and every level: each word exactly once, in the level's directions) and the day
// numbers. Loads rusj/spill/sporhunden/spill.js without the kit (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/sporhunden/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Sporhunden;
const ut = (x) => JSON.parse(JSON.stringify(x));
const UTGAVER = { nb: "data", en: "data.en", da: "data.da" };
const ALFABET = { nb: "abcdefghijklmnopqrstuvwxyzæøå", da: "abcdefghijklmnopqrstuvwxyzæøå", en: "abcdefghijklmnopqrstuvwxyz" };
const les = (s, f) => JSON.parse(readFileSync(join(ROT, "rusj/spill/sporhunden", UTGAVER[s], f), "utf8"));
const STYGT = /fuck|shit|cunt|porn|dritt|jævl|helvet|lort|helved|neger|nigger|kusse/;
const STYGGE_ORD = new Set("faen fitte pisse fisse kuk pikk hore luder rape whore bitch damn crap".split(" "));
// FROZEN: the first days of each edition.
const FAST = { nb: ["Søtt og sunt", "Bak trærne", "Under taket"], en: ["Five a day", "In the woods", "Pots and pans"], da: ["Sødt og sundt", "I skoven", "Gryder og pander"] };

const tilSpor = (d) => ({ celler: Array.from(d.r), ord: d.o.map((x) => x.split(":")[0]), stier: d.o.map((x) => ut(M.tilSti(x.split(":")[1]))) });

for (const sprak of Object.keys(UTGAVER)) {
  const data = les(sprak, "spor.json");
  const temaer = les(sprak, "temaer.json").temaer;

  test(`${sprak}: minst et år med daglige spor, kilder oppgitt`, () => {
    assert.ok(data.dagens.length >= 365, `bare ${data.dagens.length} dager`);
    assert.ok(temaer.length >= data.dagens.length);
    assert.match(data.kilder, sprak === "nb" ? /Norsk ordbank.*CC BY 4\.0/ : sprak === "en" ? /ENABLE.*public domain/ : /COR.*CC0/);
  });

  test(`${sprak}: hvert rutenett er fylt helt av temaordene, uten feil`, () => {
    const t = new Set();
    data.dagens.forEach((d, i) => {
      const spor = tilSpor(d);
      assert.equal(spor.celler.length, M.N, `dag ${i + 1}`);
      assert.ok(spor.celler.every((b) => ALFABET[sprak].includes(b)), `dag ${i + 1}: rare tegn`);
      const tema = temaer.find((x) => x.t === d.t);
      assert.ok(tema, `dag ${i + 1}: temaet «${d.t}» finnes ikke`);
      const pulje = [...tema.k, ...tema.o].map((x) => M.rens(x));
      assert.deepEqual(ut(M.sjekkSpor(spor, pulje)), [], `dag ${i + 1} «${d.t}»`);
      assert.ok(M.tvetydige(spor) <= M.MAKS_TVETYDIGE, `dag ${i + 1}: for mange ord kan spores flere steder`);
      assert.ok(tema.k.map((k) => M.rens(k)).includes(spor.ord[0]), `dag ${i + 1}: nøkkelordet står ikke først`);
      assert.ok(spor.ord.length >= 5 && spor.ord.length <= 11, `dag ${i + 1}: ${spor.ord.length} ord`);
      assert.ok(!t.has(d.t.toLowerCase()), `ledetråden «${d.t}» går igjen`);
      t.add(d.t.toLowerCase());
      for (const o of spor.ord) assert.ok(!STYGT.test(o) && !STYGGE_ORD.has(o), `«${o}»`);
    });
  });

  test(`${sprak}: ekstraordene er vanlige ord som kan spores i minst ett rutenett`, () => {
    const ekstra = data.ekstra.split(" ");
    assert.ok(ekstra.length > 500 && ekstra.length < 15000, `${ekstra.length} ekstraord`);
    assert.equal(new Set(ekstra).size, ekstra.length);
    for (const o of ekstra) {
      assert.ok(new RegExp(`^[${ALFABET[sprak]}]{4,7}$`).test(o), `«${o}»`);
      assert.ok(!STYGT.test(o) && !STYGGE_ORD.has(o), `«${o}» er stygt`);
    }
    const rutenett = data.dagens.map((d) => Array.from(d.r));
    for (let i = 0; i < ekstra.length; i += Math.ceil(ekstra.length / 150)) assert.ok(rutenett.some((c) => M.antallStier(c, ekstra[i], 1) > 0), `«${ekstra[i]}» kan ikke spores noe sted`);
  });

  test(`${sprak}: dagene følger datoen, og et helt år får hvert sitt spor`, () => {
    const forste = Math.floor(Date.UTC(2026, 10, 13) / 86400000);
    const n = data.dagens.length;
    const brukt = new Set();
    for (let nr = forste; nr < forste + 365; nr++) brukt.add(M.indeksFor(nr, n));
    assert.equal(brukt.size, 365);
    for (let i = 0; i < 3; i++) assert.equal(data.dagens[M.indeksFor(forste + i, n)].t, FAST[sprak][i], `dag ${i + 1}`);
  });

  test(`${sprak}: ordletingen lager gyldige brett for alle nivåer og mange frø`, () => {
    const AB = ALFABET[sprak];
    for (const niva of ["lett", "middels", "vrien"]) {
      const str = M.STORRELSE[niva];
      const lov = ut(M.RETNINGER[niva]).map((r) => r.join(","));
      const passer = temaer.filter((t) => M.passerLeting(t, niva) >= 5);
      assert.ok(passer.length > temaer.length / 2, `${niva}: for få temaer passer`);
      for (let fro = 1; fro <= 60; fro++) {
        const tema = passer[(fro * 37) % passer.length];
        const l = M.lagLeting([...tema.k.map((k) => M.rens(k)), ...tema.o], niva, M.mulberry32(fro), AB);
        assert.ok(l, `${niva}, frø ${fro}, «${tema.t}»: intet brett`);
        assert.equal(l.celler.length, str * str);
        assert.ok(l.celler.every((b) => AB.includes(b)));
        assert.ok(l.plass.length >= 3, `${niva}, frø ${fro}: bare ${l.plass.length} ord`);
        for (const p of l.plass) {
          const celler = ut(M.linje(p.a, p.b, str));
          assert.ok(celler, `«${p.o}» står ikke på en rett linje`);
          assert.equal(celler.map((c) => l.celler[c]).join(""), p.o, `«${p.o}» står ikke der den skal`);
          const dr = Math.sign(Math.floor(p.b / str) - Math.floor(p.a / str));
          const dc = Math.sign((p.b % str) - (p.a % str));
          assert.ok(lov.includes(`${dr},${dc}`), `«${p.o}» går en retning nivået ${niva} ikke har`);
          assert.equal(M.forekomster(l.celler, p.o, str), 1, `«${p.o}» står mer enn ett sted`);
        }
      }
    }
  });
}

test("generatoren: et tema gir et gyldig, fullt rutenett, og samme frø gir samme rutenett", () => {
  const tema = { k: ["fruktkurv"], o: "eple pære banan appelsin plomme kiwi mango ananas sitron drue fersken aprikos melon kirsebær".split(" ") };
  const a = M.lagSpor(tema, 42);
  const b = M.lagSpor(tema, 42);
  assert.ok(a);
  assert.deepEqual(ut(a), ut(b));
  assert.deepEqual(ut(M.sjekkSpor(a, [...tema.k, ...tema.o])), []);
  assert.equal(a.ord[0], "fruktkurv");
  assert.equal(a.stier.flat().length, M.N);
});

test("sjekkSpor finner feil: en celle brukt to ganger, en bokstav feil, nøkkelord som ikke spenner", () => {
  const tema = { k: ["verdensrommet"], o: "sola romskip planet jorda saturn stjerne komet galakse månen meteor venus jupiter".split(" ") };
  const s = ut(M.lagSpor(tema, 7));
  const feilBokstav = ut(s);
  feilBokstav.celler[feilBokstav.stier[1][0]] = "x";
  assert.ok(M.sjekkSpor(feilBokstav).some((f) => /stemmer ikke/.test(f)));
  const dobbel = ut(s);
  dobbel.stier[2][0] = dobbel.stier[1][0];
  assert.ok(M.sjekkSpor(dobbel).some((f) => /nøyaktig én gang|stemmer ikke|naboer/.test(f)));
});

test("finnTemaord: eget spor, samme celler i annen rekkefølge, og samme ord andre steder", () => {
  const spor = { celler: Array.from("abcdefghijklmnopqrstuvwxyzæøåabcdefghijklm"), ord: ["abc"], stier: [[0, 1, 2]] };
  assert.equal(M.finnTemaord(spor, [0, 1, 2]), 0);
  assert.equal(M.finnTemaord(spor, [2, 1, 0]), -1); // «cba»
  const spor2 = { celler: spor.celler, ord: ["abc"], stier: [[29, 30, 31]] };
  assert.equal(M.finnTemaord(spor2, [0, 1, 2]), 0, "riktig ord over andre celler teller");
  assert.equal(M.finnTemaord(spor2, [0, 1, 2], [0]), -1, "et ord som er funnet, telles ikke igjen");
});

test("antallStier teller steder, ikke rekkefølger; kanFordele og velgUtvalg", () => {
  const celler = Array.from("aab" + "x".repeat(39));
  assert.equal(M.antallStier(celler, "ab"), 1); // only the second a touches the b
  assert.ok(M.kanFordele([10, 8], [6, 4, 8]));
  assert.ok(!M.kanFordele([10, 8], [6, 6, 6]));
  assert.ok(!M.kanFordele([3, 15], [5, 5, 4, 4]));
  const u = ut(M.velgUtvalg(["eple", "banan", "appelsin", "kiwi", "plomme", "sitron", "mango"], 21, M.mulberry32(3)));
  assert.equal(u.join("").length, 21);
});

test("linje og forekomster", () => {
  assert.deepEqual(ut(M.linje(0, 3, 4)), [0, 1, 2, 3]);
  assert.deepEqual(ut(M.linje(0, 15, 4)), [0, 5, 10, 15]);
  assert.deepEqual(ut(M.linje(3, 12, 4)), [3, 6, 9, 12]);
  assert.equal(M.linje(0, 6, 4), null);
  assert.equal(M.forekomster(Array.from("katt" + "x".repeat(12)), "katt", 4), 1);
  assert.equal(M.forekomster(Array.from("tatt" + "x".repeat(12)), "ttat", 4), 1); // backwards counts
});

test("Sporhunden nr. 1 er 13. november 2026", () => {
  const forste = Math.floor(Date.UTC(2026, 10, 13) / 86400000);
  assert.equal(M.FORSTE, forste);
  assert.equal(M.nrFor(forste), 1);
  assert.equal(M.indeksFor(forste - 1, 400), 399);
  assert.equal(M.BREDDE * M.HOYDE, M.N);
});
