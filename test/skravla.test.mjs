// Skravla's forbidden-word lists (rusj/spill/skravla/data/forbudt.json) against the word bank:
// every list belongs to a word the game can draw, has three or four words, and never gives the
// word itself away.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const les = (sti) => readFileSync(new URL(sti, import.meta.url), "utf8");
const F = JSON.parse(les("../rusj/spill/skravla/data/forbudt.json"));
const lav = (s) => String(s).trim().toLocaleLowerCase("nb");

// The word bank with every occurrence of a word (a word may be in two categories; the build keeps one).
const bank = new Map();
const katIder = [];
const katMappe = new URL("../data/kategorier/", import.meta.url);
for (const fil of readdirSync(katMappe).filter((f) => f.endsWith(".json"))) {
  const kat = JSON.parse(readFileSync(new URL(fil, katMappe), "utf8"));
  katIder.push(kat.id);
  for (const e of kat.ord) {
    const k = lav(e.o);
    if (!bank.has(k)) bank.set(k, []);
    bank.get(k).push({ o: e.o.trim(), n: e.n });
  }
}
const alle = Object.entries(F).flatMap(([gruppe, ord]) => Object.entries(ord).map(([o, liste]) => ({ gruppe, o, liste })));

test("minst 300 ord med forbudsliste, spredt på mange kategorier, ingen ord to ganger", () => {
  assert.ok(alle.length >= 300, `bare ${alle.length}`);
  const grupper = Object.entries(F);
  assert.ok(grupper.length >= 20, `bare ${grupper.length} kategorier`);
  for (const [gruppe, ord] of grupper) {
    assert.ok(katIder.includes(gruppe), `ukjent kategori: ${gruppe}`);
    assert.ok(Object.keys(ord).length >= 8, `${gruppe}: bare ${Object.keys(ord).length} ord`);
  }
  const sett = new Set(alle.map((x) => lav(x.o)));
  assert.equal(sett.size, alle.length, "samme ord står to ganger");
});

test("hvert ord finnes i ordbanken på nivå 1–2, skrevet på samme måte", () => {
  for (const { o } of alle) {
    const treff = bank.get(lav(o));
    assert.ok(treff, `finnes ikke i ordbanken: ${o}`);
    assert.ok(treff.some((x) => x.o === o), `«${o}» står som «${treff[0].o}» i ordbanken`);
    assert.ok(treff.every((x) => x.n === 1 || x.n === 2), `${o}: nivå ${treff.map((x) => x.n).join(", ")}`);
  }
});

test("tre eller fire forbudte ord per ord – korte, og ingen like", () => {
  for (const { o, liste } of alle) {
    assert.ok(Array.isArray(liste) && liste.length >= 3 && liste.length <= 4, `${o}: ${liste.length} forbudte ord`);
    for (const f of liste) {
      assert.equal(typeof f, "string");
      assert.ok(f && f === f.trim(), `${o}: «${f}» har mellomrom i endene eller er tomt`);
      assert.ok(f.length <= 18 && f.split(/\s+/).length <= 3, `${o}: «${f}» er for langt til en brikke`);
    }
    assert.equal(new Set(liste.map(lav)).size, liste.length, `${o}: samme forbudte ord to ganger`);
  }
});

test("ingen forbudte ord er ordet selv, en del av det eller inneholder det", () => {
  for (const { o, liste } of alle) {
    const k = lav(o);
    const deler = k.split(/[\s-]+/).filter((d) => d.length >= 3);
    for (const f of liste) {
      const x = lav(f);
      assert.ok(x !== k && !k.includes(x) && !x.includes(k), `${o}: «${f}» er, inneholder eller er en del av ordet`);
      // …and never a whole word of a target that is several words («Pusse tenner» → not «tenner»).
      for (const fd of x.split(/[\s-]+/)) assert.ok(!deler.includes(fd), `${o}: «${f}» bruker et ord fra oppslagsordet`);
    }
  }
});

test("nok ord til alle tre nivåvalg når alle kategorier er med", () => {
  const niva = (o) => bank.get(lav(o))[0].n;
  const n1 = alle.filter((x) => niva(x.o) === 1).length;
  const n2 = alle.length - n1;
  assert.ok(n1 >= 150, `lett: bare ${n1}`); // «Lett» draws level 1
  assert.ok(n2 >= 100, `vanskelig: bare ${n2}`); // «Vanskelig» draws level 2 (level 3 has no lists)
});

test("temaet «Jul»: minst 80 ord, alle i ordbanken, og nok av dem til «Forbudte ord» på hvert nivå", () => {
  const T = JSON.parse(les("../rusj/spill/skravla/data/tema.json"));
  assert.equal(T.jul.navn, "Jul");
  assert.equal(T.jul.ikon, "🎄");
  const ord = T.jul.ord;
  assert.ok(ord.length >= 80, `bare ${ord.length}`);
  assert.equal(new Set(ord.map(lav)).size, ord.length, "samme ord står to ganger");
  for (const o of ord) {
    const treff = bank.get(lav(o));
    assert.ok(treff, `finnes ikke i ordbanken: ${o}`);
    assert.ok(treff.some((x) => x.o === o), `«${o}» står som «${treff[0].o}» i ordbanken`);
  }
  // The game closes «Forbudte ord» under 30 words: Lett draws level 1, Middels 1–2, Vanskelig 2–3.
  const medListe = new Set(alle.map((x) => lav(x.o)));
  const antall = (nivaer) => ord.filter((o) => medListe.has(lav(o)) && nivaer.includes(bank.get(lav(o))[0].n)).length;
  for (const nivaer of [[1], [1, 2], [2, 3]]) assert.ok(antall(nivaer) >= 30, `nivå ${nivaer.join("–")}: bare ${antall(nivaer)} juleord med forbudsliste`);
});

test("spillet bruker listene – ikke ordbankens hint – og sier aldri «Tabu»", () => {
  const js = les("../rusj/spill/skravla/spill.js");
  assert.ok(js.includes("RUSJ_DATA.forbudt"), "spill.js leser ikke data/forbudt.json");
  assert.ok(!/\bo\[2\]|\bo\[3\]/.test(js), "spill.js leser fortsatt ordbankens hint (o[2]) eller ligner-ord (o[3])");
  for (const fil of ["spill.js", "spill.json", "data/tekster.json", "data/forbudt.json"]) {
    assert.ok(!/Tabu/.test(les(`../rusj/spill/skravla/${fil}`)), `«Tabu» står i ${fil}`);
  }
});
