// Flinkisen: the letters of each edition, how answers are compared and judged (10 / 5 / 0, the
// majority of the others strikes an answer), the categories of a round, the category packs in the
// three languages, and a whole match on one phone step by step.
// Loads rusj/spill/flinkisen/spill.js without the kit (node:vm): the file then only exposes the rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/flinkisen/spill.js"), "utf8"), kontekst);
const F = kontekst.window.RusjFlinkisen;
const somJson = (x) => JSON.parse(JSON.stringify(x));
const pakker = (mappe) => JSON.parse(readFileSync(join(ROT, "rusj/spill/flinkisen", mappe, "pakker.json"), "utf8")).pakker;

function rng(fro) {
  return () => {
    fro = (fro + 0x6d2b79f5) | 0;
    let t = Math.imul(fro ^ (fro >>> 15), 1 | fro);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("the letters: no C, Q, W, X or Z in Norwegian and Danish (Æ, Ø, Å only when asked for), no Q, X or Z in English", () => {
  for (const sprak of ["nb", "da"]) {
    const vanlige = F.bokstaver(sprak, false);
    assert.equal(vanlige.length, 21);
    for (const b of "CQWXZÆØÅ") assert.ok(!vanlige.includes(b), `${sprak}: ${b}`);
    const alle = F.bokstaver(sprak, true);
    assert.equal(alle.length, 24);
    for (const b of "ÆØÅ") assert.ok(alle.includes(b), `${sprak}: ${b}`);
    assert.ok(F.harEkstra(sprak));
  }
  const en = F.bokstaver("en", true);
  assert.equal(en.length, 23);
  for (const b of "QXZÆØÅ") assert.ok(!en.includes(b), `en: ${b}`);
  assert.ok(en.includes("C") && en.includes("W"));
  assert.ok(!F.harEkstra("en"));
  assert.deepEqual(somJson(F.bokstaver("finnes-ikke", false)), somJson(F.bokstaver("nb", false)));
});

test("answers are compared without case, accents, spaces and punctuation – æ, ø and å stay letters of their own", () => {
  assert.equal(F.norm("  Blå-Bær!  "), "blåbær");
  assert.equal(F.norm("Éclair"), "eclair");
  assert.equal(F.norm("ISLAND"), "island", "a fixed locale: I is i on every phone");
  assert.equal(F.norm("Ørret"), "ørret");
  assert.equal(F.norm("Örebro"), "orebro");
  assert.equal(F.norm("…"), "");
  assert.equal(F.norm(null), "");
  assert.ok(F.passer("Bjørn", "B") && F.passer("  bjørn", "B") && F.passer("«Bergen»", "B"));
  assert.ok(!F.passer("en bjørn", "B"), "the article counts as the first word");
  assert.ok(F.passer("Ålesund", "Å") && !F.passer("Ålesund", "A") && !F.passer("Alta", "Å"));
  assert.ok(!F.passer("", "B") && !F.passer("Bjørn", ""));
});

test("an answer is kept as one line of at most 30 characters, never half of an emoji", () => {
  assert.equal(F.rens("  Bananer \n i\tpyjamas  "), "Bananer i pyjamas");
  assert.equal(Array.from(F.rens("x".repeat(80))).length, 30);
  assert.equal(Array.from(F.rens("🍌".repeat(40))).length, 30);
  assert.equal(F.rens("\ud83c"), "", "half of a pair goes");
  assert.equal(F.rens(null), "");
  assert.equal(F.MAKS_TEGN, 30);
});

test("one category: empty 0, wrong letter 0, struck 0, alone 10, shared 5 – compared normalised", () => {
  const inne = [0, 1, 2, 3, 4];
  const d = F.domKategori(["Bjørn", "bjørn!", "Bever", "", "Elg"], "B", inne, () => false, 5);
  assert.deepEqual(somJson(d.status), ["delt", "delt", "alene", "tom", "feil"]);
  assert.deepEqual(somJson(d.poeng), [5, 5, 10, 0, 0]);
  // A struck answer is no longer shared with anyone.
  const e = F.domKategori(["Bjørn", "bjørn", "Bever", null, "Bie"], "B", inne, (i) => i === 1, 5);
  assert.deepEqual(somJson(e.status), ["alene", "strok", "alene", "tom", "alene"]);
  assert.deepEqual(somJson(e.poeng), [10, 0, 10, 0, 10]);
  // A seat that is out is not judged, and its answer is shared with nobody.
  const f = F.domKategori(["Bjørn", "Bjørn", "Bever"], "B", [0, 2], () => false, 3);
  assert.deepEqual(somJson(f.status), ["alene", "ute", "alene"]);
  assert.deepEqual(somJson(f.poeng), [10, 0, 10]);
});

test("«teller ikke»: more than half of the other players still in", () => {
  assert.equal(F.strok([1], 0, [0, 1]), true, "two players: the other one decides");
  assert.equal(F.strok([1], 0, [0, 1, 2]), false, "three: one of two is not a majority");
  assert.equal(F.strok([1, 2], 0, [0, 1, 2]), true);
  assert.equal(F.strok([1, 2], 0, [0, 1, 2, 3, 4]), false, "five: two of four is not a majority");
  assert.equal(F.strok([1, 2, 4], 0, [0, 1, 2, 3, 4]), true);
  assert.equal(F.strok([0, 1], 0, [0, 1, 2]), false, "one's own mark never counts");
  assert.equal(F.strok([1, 2], 0, [0, 1, 3]), false, "a mark from a seat that left does not count");
  assert.equal(F.strok([2], 0, [0, 2]), true, "…and the majority is of those still in");
  assert.equal(F.strok(undefined, 0, [0, 1]), false);
  assert.deepEqual([2, 3, 4, 5, 10].map((n) => F.kravTil(Array.from({ length: n }, (_, i) => i))), [1, 2, 2, 3, 5]);
});

test("the categories of a round: a fixed pack plays the same ones, the others deal new ones round after round", () => {
  const fast = { fast: true, k: ["a", "b", "c", "d", "e", "f"] };
  assert.deepEqual(somJson(F.kategorierFor(fast, 5, 0, [5, 4, 3, 2, 1, 0])), [0, 1, 2, 3, 4]);
  assert.deepEqual(somJson(F.kategorierFor(fast, 6, 3, [5, 4, 3, 2, 1, 0])), [0, 1, 2, 3, 4, 5]);
  const fri = { k: Array.from({ length: 15 }, (_, i) => "k" + i) };
  const rekke = F.stokk(fri.k.map((_, i) => i), rng(7));
  const sett = [];
  for (let runde = 0; runde < 7; runde++) {
    const k = F.kategorierFor(fri, 6, runde, rekke);
    assert.equal(new Set(k).size, 6, `round ${runde}: six different categories`);
    sett.push(k);
  }
  assert.equal(new Set([...sett[0], ...sett[1]]).size, 12, "two rounds in a row share nothing");
  assert.deepEqual(somJson(F.toppen([10, 30, 30], [0, 1, 2])), [1, 2]);
  assert.deepEqual(somJson(F.toppen([40, 30, 30], [1, 2])), [1, 2], "a seat that is out is not ranked");
  assert.deepEqual(somJson(F.toppen([0, 0], [0, 1])), []);
});

test("the packs: classic, children, party and Christmas in three languages, the same shape", () => {
  const nb = pakker("data");
  assert.deepEqual(nb.map((p) => p.id), ["klassisk", "barn", "fest", "jul"]);
  for (const mappe of ["data", "data.en", "data.da"]) {
    const liste = pakker(mappe);
    assert.deepEqual(liste.map((p) => p.id), nb.map((p) => p.id), mappe);
    for (const [n, p] of liste.entries()) {
      assert.ok(p.navn && p.ikon && p.tekst, `${mappe}/${p.id}: navn, ikon, tekst`);
      assert.equal(p.ikon, nb[n].ikon, `${mappe}/${p.id}: the same icon`);
      assert.equal(p.k.length, nb[n].k.length, `${mappe}/${p.id}: as many categories as the Norwegian pack`);
      assert.ok(p.k.length >= 6, `${mappe}/${p.id}: at least six categories`);
      assert.equal(new Set(p.k.map((k) => k.toLowerCase())).size, p.k.length, `${mappe}/${p.id}: no category twice`);
      for (const k of p.k) assert.ok(typeof k === "string" && k.trim() === k && k.length >= 2 && k.length <= 48, `${mappe}/${p.id}: «${k}»`);
      assert.equal(!!p.fast, p.id === "klassisk", `${mappe}/${p.id}: only the classic pack is fixed`);
    }
    assert.ok(/18\+/.test(liste.find((p) => p.id === "fest").tekst), `${mappe}: the party pack says 18+`);
  }
  assert.deepEqual(nb[0].k.slice(0, 5), ["Navn", "By", "Land", "Dyr", "Mat"]);
});

test("a match on one phone: letter, stop, scoring category by category, the points taken back, the end", () => {
  const pakke = pakker("data")[1];
  const sp = F.ny({ antall: 3, pakke, runder: 3, kat: 5, tid: 60, ekstra: false, sprak: "nb", rng: rng(11) });
  assert.equal(sp.modus, "en");
  assert.equal(sp.bokstaver.length, 3);
  assert.equal(new Set(sp.bokstaver).size, 3);
  assert.ok(sp.bokstaver.every((b) => F.bokstaver("nb", false).includes(b)));
  assert.equal(sp.r.fase, "klar");
  assert.equal(sp.r.b, sp.bokstaver[0]);
  assert.equal(sp.r.k.length, 5);
  assert.equal(sp.r.igjen, 60);
  // Nothing out of order.
  assert.equal(F.siStopp(sp), false);
  assert.equal(F.settPoeng(sp, 0, 10), false);
  assert.equal(F.katNeste(sp), null);
  assert.ok(F.trekk(sp) && !F.trekk(sp));
  assert.equal(sp.r.fase, "trekk");
  assert.ok(F.begynn(sp) && !F.begynn(sp));
  assert.ok(F.siStopp(sp) && !F.siStopp(sp));
  assert.equal(sp.r.fase, "stopp");
  assert.equal(sp.r.ned, F.NEDTELLING);
  assert.ok(F.blyanterNed(sp) && !F.blyanterNed(sp));
  assert.equal(sp.r.fase, "dom");
  // Nobody is left without points in a category.
  assert.equal(F.katNeste(sp), "mangler");
  assert.equal(sp.r.mangler, true);
  assert.equal(F.settPoeng(sp, 0, 7), false, "only 0, 5 and 10");
  assert.equal(F.settPoeng(sp, 9, 10), false);
  assert.ok(F.settPoeng(sp, 0, 10) && F.settPoeng(sp, 1, 5) && F.settPoeng(sp, 2, 5));
  assert.ok(F.settPoeng(sp, 2, 5), "the same value again takes it back");
  assert.equal(sp.r.score[2][0], null);
  assert.equal(F.katNeste(sp), "mangler");
  F.settPoeng(sp, 2, 0);
  assert.equal(F.katNeste(sp), "dom");
  assert.equal(sp.r.nr, 1);
  assert.ok(F.katForrige(sp));
  assert.equal(sp.r.nr, 0);
  assert.equal(F.katForrige(sp), false);
  F.katNeste(sp);
  for (let k = 1; k < 5; k++) {
    for (let i = 0; i < 3; i++) F.settPoeng(sp, i, [10, 0, 5][i]);
    assert.equal(F.katNeste(sp), k < 4 ? "dom" : "ferdig");
  }
  assert.deepEqual(somJson(sp.poeng), [50, 5, 20]);
  assert.deepEqual(somJson(sp.r.pluss), [50, 5, 20]);
  assert.equal(sp.spilt, 1);
  // «Endre poengene»: the round's points are taken back, the last category is on the screen.
  assert.ok(F.endrePoeng(sp) && !F.endrePoeng(sp));
  assert.deepEqual(somJson(sp.poeng), [0, 0, 0]);
  assert.equal(sp.spilt, 0);
  assert.equal(sp.r.nr, 4);
  F.settPoeng(sp, 1, 10);
  assert.equal(F.katNeste(sp), "ferdig");
  assert.deepEqual(somJson(sp.poeng), [50, 15, 20]);
  // Two more rounds: new letters, new categories.
  const forste = sp.r.k.slice();
  assert.equal(F.nesteRunde(sp, pakke), "klar");
  assert.equal(sp.runde, 1);
  assert.equal(sp.r.b, sp.bokstaver[1]);
  assert.equal(new Set([...forste, ...sp.r.k]).size, 10);
  assert.equal(F.nesteRunde(sp, pakke), null, "not before the round is scored");
  for (let runde = 1; runde < 3; runde++) {
    F.trekk(sp);
    F.begynn(sp);
    assert.ok(F.blyanterNed(sp), "the round's own clock can end the writing too");
    for (let k = 0; k < 5; k++) {
      for (let i = 0; i < 3; i++) F.settPoeng(sp, i, 5);
      F.katNeste(sp);
    }
    assert.equal(F.nesteRunde(sp, pakke), runde < 2 ? "klar" : "slutt");
  }
  assert.ok(sp.ferdig);
  assert.deepEqual(somJson(sp.poeng), [100, 65, 70]);
  assert.deepEqual(somJson(F.toppen(sp.poeng, [0, 1, 2])), [0]);
  // The setup is kept inside what the game offers.
  const rar = F.ny({ antall: 99, pakke: pakker("data")[0], runder: 4, kat: 9, tid: 7, ekstra: true, sprak: "en", rng: rng(3) });
  assert.deepEqual([rar.antall, rar.runder, rar.kat, rar.tid, rar.ekstra], [10, 5, 5, 0, false]);
  assert.deepEqual(somJson(rar.r.k), [0, 1, 2, 3, 4], "the classic pack: the same five every round");
});
