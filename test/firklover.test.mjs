// Firkløveren: the puzzle bank (shape, sixteen distinct words, no repeats) and the grading engine
// (a right group, «Én unna!», mistakes, the end, the share rows). Loads rusj/spill/firklover/spill.js
// without the kit (node:vm) and reads data/klovere.json directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/firklover/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Firklover;
const DATA = JSON.parse(readFileSync(join(ROT, "rusj/spill/firklover/data/klovere.json"), "utf8"));
const KLOVERE = DATA.dagens;
// Plain arrays from the vm context compare badly with deepEqual: copy through JSON.
const ut = (x) => JSON.parse(JSON.stringify(x));

test("minst 120 kløvere (fire måneder)", () => {
  assert.ok(KLOVERE.length >= 120, `bare ${KLOVERE.length} kløvere`);
});

test("hver kløver: fire grupper på fire, et tema hver, seksten ulike ord", () => {
  KLOVERE.forEach((k, n) => {
    assert.deepEqual(ut(M.sjekkKlover(k)), [], `kløver nr. ${n + 1}`);
    assert.equal(k.length, 4, `kløver nr. ${n + 1}: fire grupper`);
    for (const g of k) {
      assert.equal(g.o.length, 4, `kløver nr. ${n + 1}, «${g.t}»: fire ord`);
      assert.deepEqual(Object.keys(g).sort(), ["o", "t"], `kløver nr. ${n + 1}: ukjente felt`);
    }
    const ord = k.flatMap((g) => g.o.map(M.normaliser));
    assert.equal(new Set(ord).size, 16, `kløver nr. ${n + 1}: et ord går igjen (${ord.filter((o, i) => ord.indexOf(o) !== i)})`);
  });
});

test("normaliseringen skiller ikke på store bokstaver og aksenter, men på æ, ø og å", () => {
  assert.equal(M.normaliser("Armé"), "arme");
  assert.equal(M.normaliser("  Kupé "), "kupe");
  assert.equal(M.normaliser("Tromsø"), "tromsø");
  assert.notEqual(M.normaliser("sær"), M.normaliser("sar"));
  assert.notEqual(M.normaliser("bål"), M.normaliser("bal"));
});

test("sjekkKlover finner feil: like ord, feil antall, tomt tema", () => {
  const god = KLOVERE[0];
  const dobbel = ut(god);
  dobbel[3].o[0] = god[0].o[0].toUpperCase();
  assert.ok(M.sjekkKlover(dobbel).some((f) => /går igjen/.test(f)));
  const tre = ut(god);
  tre[1].o.pop();
  assert.ok(M.sjekkKlover(tre).some((f) => /fire ord/.test(f)));
  const utenTema = ut(god);
  utenTema[2].t = " ";
  assert.ok(M.sjekkKlover(utenTema).some((f) => /tema/.test(f)));
  assert.deepEqual(ut(M.sjekkKlover(god.slice(0, 3))), ["må ha fire grupper"]);
});

test("ingen tema og ingen ord går igjen i samme kløver, og temaene er korte", () => {
  KLOVERE.forEach((k, n) => {
    const temaer = k.map((g) => g.t.toLowerCase());
    assert.equal(new Set(temaer).size, 4, `kløver nr. ${n + 1}: to like temaer`);
    for (const g of k) assert.ok(g.t.length <= 40, `kløver nr. ${n + 1}: «${g.t}» er for langt`);
  });
});

test("vurder: fire fra samme gruppe er riktig, tre av fire er «én unna»", () => {
  assert.deepEqual(ut(M.vurder([0, 1, 2, 3])), { gruppe: 0, enUnna: false });
  assert.deepEqual(ut(M.vurder([15, 12, 14, 13])), { gruppe: 3, enUnna: false });
  assert.deepEqual(ut(M.vurder([4, 5, 6, 0])), { gruppe: -1, enUnna: true });
  assert.deepEqual(ut(M.vurder([0, 4, 8, 12])), { gruppe: -1, enUnna: false });
  assert.deepEqual(ut(M.vurder([0, 1, 4, 5])), { gruppe: -1, enUnna: false });
});

test("status: vunnet med fire grupper, tapt etter fire feil, ingenting telles etter slutt", () => {
  const perfekt = M.status([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]]);
  assert.deepEqual(ut(perfekt), { funnet: [0, 1, 2, 3], feil: 0, vunnet: true, ferdig: true });
  assert.equal(M.resTekst(perfekt), "Perfekt");
  const toFeil = M.status([[0, 4, 8, 12], [12, 13, 14, 15], [0, 1, 2, 4], [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]]);
  assert.deepEqual(ut(toFeil), { funnet: [3, 0, 1, 2], feil: 2, vunnet: true, ferdig: true });
  assert.equal(M.resTekst(toFeil), "2 feil");
  const tapt = M.status([[0, 1, 2, 3], [4, 8, 12, 5], [4, 8, 12, 6], [4, 8, 12, 7], [5, 9, 13, 6], [4, 5, 6, 7]]);
  assert.deepEqual(ut(tapt), { funnet: [0], feil: 4, vunnet: false, ferdig: true });
  assert.equal(M.resTekst(tapt), "Ikke løst");
  const underveis = M.status([[8, 9, 10, 11], [0, 1, 2, 4]]);
  assert.deepEqual(ut(underveis), { funnet: [2], feil: 1, vunnet: false, ferdig: false });
  assert.equal(M.resTekst(underveis), "1 av 4");
  for (const st of [perfekt, toFeil, tapt, underveis]) assert.ok([...M.resTekst(st)].length <= 14);
});

test("delRader: ett hjerte per ord i gruppens farge, aldri ordene", () => {
  assert.deepEqual(ut(M.delRader([[0, 1, 2, 3], [4, 8, 12, 5], [15, 14, 13, 12]])), ["💚💚💚💚", "💙💛💗💙", "💗💗💗💗"]);
});

test("nokkel og gyldigGjett: rekkefølgen teller ikke, ugyldige gjett avvises", () => {
  assert.equal(M.nokkel([3, 1, 2, 0]), M.nokkel([0, 1, 2, 3]));
  assert.ok(M.gyldigGjett([0, 5, 9, 15]));
  assert.ok(!M.gyldigGjett([0, 0, 1, 2]));
  assert.ok(!M.gyldigGjett([0, 1, 2]));
  assert.ok(!M.gyldigGjett([0, 1, 2, 16]));
});

test("dagene: nr. 1 er 1. november 2026, samme startrekkefølge for alle, ingen gruppe på én rad", () => {
  const forste = Math.floor(Date.UTC(2026, 10, 1) / 86400000);
  assert.equal(M.FORSTE, forste);
  assert.equal(M.nrFor(forste), 1);
  assert.equal(M.indeksFor(forste, 126), 0);
  assert.equal(M.indeksFor(forste + 126, 126), 0);
  assert.equal(M.indeksFor(forste - 1, 126), 125);
  for (let nr = forste; nr < forste + 200; nr++) {
    const o = ut(M.startRekkefolge(nr));
    assert.deepEqual(o.slice().sort((a, b) => a - b), [...Array(16).keys()]);
    assert.deepEqual(o, ut(M.startRekkefolge(nr)), "rekkefølgen må være lik hver gang");
    for (let r = 0; r < 4; r++) assert.ok(new Set(o.slice(r * 4, r * 4 + 4).map(M.gruppeAv)).size > 1, `dag ${nr}: en hel gruppe på rad ${r + 1}`);
  }
  assert.notDeepEqual(ut(M.startRekkefolge(forste)), ut(M.startRekkefolge(forste + 1)));
});

test("den faste rekkefølgen: de første kløverne endres ikke", () => {
  assert.equal(KLOVERE[0][0].t, "Bær");
  assert.equal(KLOVERE[1][1].t, "Kortfarger");
  assert.equal(KLOVERE[11][0].t, "Måneder");
  assert.equal(KLOVERE[12][0].t, "Lyskilder");
});

// The English and Danish editions have their own clovers (data.en/, data.da/): the same rules.
for (const [sprak, forste] of [
  ["en", ["Fruit", "Card games", "Before ‘bell’", "Hides a rat"]],
  ["da", ["Bær", "Kortfarver", "Ord foran »-klokke«", "Skjuler en mus"]],
]) {
  test(`${sprak}: at least 100 clovers, four groups of four, sixteen different words, short themes, a fixed order`, () => {
    const k = JSON.parse(readFileSync(join(ROT, `rusj/spill/firklover/data.${sprak}/klovere.json`), "utf8")).dagens;
    assert.ok(k.length >= 100, `bare ${k.length} kløvere`);
    k.forEach((kl, n) => {
      assert.deepEqual(ut(M.sjekkKlover(kl)), [], `${sprak} nr. ${n + 1}`);
      for (const g of kl) assert.deepEqual(Object.keys(g).sort(), ["o", "t"], `${sprak} nr. ${n + 1}: ukjente felt`);
      assert.equal(new Set(kl.map((g) => g.t.toLowerCase())).size, 4, `${sprak} nr. ${n + 1}: to like temaer`);
    });
    // The same four words twice anywhere in the list is a mistake.
    const sett = new Set();
    for (const kl of k)
      for (const g of kl) {
        const nk = g.o.map(M.normaliser).sort().join(",");
        assert.ok(!sett.has(nk), `${sprak}: gruppen «${g.t}» går igjen`);
        sett.add(nk);
      }
    assert.deepEqual([k[0][0].t, k[1][1].t, k[50][2].t, k[99][3].t], forste, "rekkefølgen er endret");
  });
}
