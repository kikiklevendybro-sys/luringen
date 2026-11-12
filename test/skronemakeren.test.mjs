// Skrønemakeren: the rules as pure functions loaded in node:vm without the kit — normalising and
// merging typed fakes, a fake equal to the truth (bonus, removed, the writer sits out the vote),
// the voting rules (never your own, undo), the scoring, the reveal order — and the cards: at least
// 300, six packs, no duplicates, short true answers written like a player's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/skronemakeren/spill.js"), "utf8"), { window, console });
const M = window.RusjSkrone;
const j = (x) => JSON.parse(JSON.stringify(x));
const D = JSON.parse(readFileSync(join(ROT, "rusj/spill/skronemakeren/data/kort.json"), "utf8"));
const KORT = { s: "Hva betyr «ljore»?", a: "Et røykhull i taket på gamle hus", g: ["røykhull"] };
const fast = () => 0.5; // a fixed "random" for shuffling

// Every player types in turn; returns the results.
function skrivAlle(r, tekster) {
  return tekster.map((t) => M.skriv(r, KORT, t));
}

test("nøkkelen: store bokstaver, tegn, aksenter, mellomrom og småord teller ikke", () => {
  assert.equal(M.nokkel("  En RØYKHULL i taket!! "), M.nokkel("røykhull i taket"));
  assert.equal(M.nokkel("Café-dør"), M.nokkel("cafe dør"));
  assert.notEqual(M.nokkel("ære"), M.nokkel("are"), "æ, ø og å er egne bokstaver");
  assert.equal(M.nokkel("et lite hus"), M.nokkel("lite hus"));
  assert.equal(M.nokkel("!!! ..."), "");
  assert.equal(M.nokkel("<b>hei</b>"), M.nokkel("b hei b"));
});

test("rens: én linje, ingen kontrolltegn, maks 80 tegn og aldri en halv emoji", () => {
  assert.equal(M.rens("  to\n linjer\t her "), "to linjer her");
  assert.equal(M.rens("a‮b​c"), "a b c");
  const lang = "😀".repeat(100);
  assert.equal(Array.from(M.rens(lang)).length, M.MAKS);
  assert.ok(!/[\ud800-\udbff]$/.test(M.rens("x".repeat(79) + "😀😀")));
});

test("erSann: det ekte svaret og de godtatte formene, uansett skrivemåte", () => {
  assert.ok(M.erSann("et røykhull i taket på gamle hus", KORT));
  assert.ok(M.erSann("RØYKHULL!", KORT));
  assert.ok(!M.erSann("røykhull i gulvet", KORT));
  assert.ok(!M.erSann("   ", KORT));
});

test("skriving: tom skrøne avvises, sannheten gir bonus og ny skrøne, ellers neste spiller", () => {
  const r = M.nyRunde(3, 1);
  assert.deepEqual(j(r.rekke), [1, 2, 0]);
  assert.equal(M.skriv(r, KORT, " ?! "), "tom");
  assert.equal(r.na, 0);
  assert.equal(M.skriv(r, KORT, "Røykhull"), "sann");
  assert.equal(r.na, 0, "den som skrev sannheten, skriver en skrøne til");
  assert.equal(r.sann[1], true);
  assert.equal(r.skrevet[1], null, "sannheten blir ikke en skrøne");
  assert.equal(M.skriv(r, KORT, "En gammel låve"), "ok");
  assert.equal(r.skrevet[1], "En gammel låve");
  assert.deepEqual(skrivAlle(r, ["Ei fiskegarn", "en gammel LÅVE!"]), ["ok", "ok"]);
  assert.ok(M.alleHarSkrevet(r));
});

test("like skrøner slås sammen, og sannheten blandes inn én gang", () => {
  const valg = M.byggValg(["En gammel låve", null, "en gammel LÅVE!", "Et fiskegarn"], KORT.a, fast);
  assert.equal(valg.length, 3);
  const lave = valg.find((v) => v.t === "En gammel låve");
  assert.deepEqual(j(lave.av), [0, 2], "begge forfatterne står på den sammenslåtte");
  assert.equal(valg.filter((v) => v.sann).length, 1);
  assert.equal(valg.find((v) => v.sann).t, KORT.a);
  assert.ok(!valg.some((v) => v.t === "en gammel LÅVE!"), "den første skrivemåten vises");
});

// A full round with four players: A and C write the same fake, B writes the truth first.
function runde() {
  const r = M.nyRunde(4, 0);
  assert.equal(M.skriv(r, KORT, "En gammel låve"), "ok"); // A (0)
  assert.equal(M.skriv(r, KORT, "røykhull"), "sann"); // B (1) finds the truth
  assert.equal(M.skriv(r, KORT, "Ei fiskegarn"), "ok"); // B again
  assert.equal(M.skriv(r, KORT, "en gammel låve"), "ok"); // C (2)
  assert.equal(M.skriv(r, KORT, "Et lite skap"), "ok"); // D (3)
  M.tilStemming(r, KORT.a, fast);
  return r;
}
const indeks = (r, tekst) => r.valg.findIndex((v) => v.t === tekst);

test("stemming: den som skrev sannheten står over, ingen stemmer på sin egen, angre virker", () => {
  const r = runde();
  assert.equal(r.valg.length, 4);
  assert.deepEqual(j(r.srekke), [0, 2, 3], "B fant sannheten selv og stemmer ikke");
  const lave = indeks(r, "En gammel låve");
  const sann = M.sannIndeks(r.valg);
  assert.ok(!M.kanStemme(r, 0, lave), "A kan ikke stemme på sin egen");
  assert.ok(!M.kanStemme(r, 2, lave), "C skrev det samme og kan heller ikke");
  assert.ok(!M.kanStemme(r, 1, sann), "B stemmer ikke i det hele tatt");
  assert.equal(M.stem(r, lave), false);
  assert.equal(M.stem(r, 99), false);
  assert.equal(r.sna, 0);
  assert.equal(M.stem(r, sann), true); // A finds the truth
  assert.equal(M.stem(r, indeks(r, "Et lite skap")), true); // C falls for D
  assert.ok(M.angreStemme(r));
  assert.equal(r.stemmer[2], -1);
  assert.equal(r.sna, 1);
  assert.equal(M.stem(r, indeks(r, "Ei fiskegarn")), true); // C falls for B instead
  assert.equal(M.stem(r, lave), true); // D falls for A and C
  assert.ok(M.alleHarStemt(r));
  assert.equal(M.stem(r, sann), false, "ingen flere stemmer");
  return r;
});

test("poeng: +2 for sannheten, +1 per stemme til alle forfatterne, bonus for å skrive sannheten", () => {
  const r = runde();
  const sann = M.sannIndeks(r.valg);
  M.stem(r, sann); // A
  M.stem(r, indeks(r, "Ei fiskegarn")); // C → B
  M.stem(r, indeks(r, "En gammel låve")); // D → A and C
  const u = M.regnUt(r);
  assert.deepEqual(j(u.pluss), [M.SANN + M.LURT, M.BONUS + M.LURT, M.LURT, 0]);
  assert.deepEqual(j(u.lurt), [1, 1, 1, 0]);
  assert.deepEqual(j(u.funnet), [1, 1, 0, 0]);
  // The reveal: fakes somebody fell for, fewest votes first, the truth last; unvoted fakes skipped.
  const rekke = M.avslorRekke(r);
  assert.equal(rekke[rekke.length - 1], sann);
  assert.equal(rekke.length, 3);
  assert.ok(!rekke.includes(indeks(r, "Et lite skap")));
});

test("hele spillet: poengene legges til én gang per runde, og vinnere/priser regnes ut", () => {
  const sp = M.nyttSpill({ runder: 3, pakker: ["ord"] }, 4, 0, 0);
  sp.r = runde();
  const sann = M.sannIndeks(sp.r.valg);
  M.stem(sp.r, sann);
  M.stem(sp.r, sann);
  M.stem(sp.r, indeks(sp.r, "En gammel låve"));
  M.fullfor(sp);
  assert.deepEqual(j(sp.poeng), [2 + 1, 3, 2 + 1, 0]);
  assert.deepEqual(j(sp.lurt), [1, 0, 1, 0]);
  assert.deepEqual(j(sp.funnet), [1, 1, 1, 0]);
  assert.equal(sp.spilt, 1);
  assert.equal(sp.bonuser, 1);
  assert.deepEqual(j(M.vinnere(sp)), [0, 1, 2]);
  assert.deepEqual(j(M.toppen([0, 0, 0])), [], "ingen vinner uten poeng");
  assert.equal(M.sisteRunde(sp), false);
  sp.rn = 2;
  assert.equal(M.sisteRunde(sp), true);
  assert.equal(M.nyttSpill({ runder: 4, pakker: [] }, 3, 0, 0).runder, 5, "bare 3, 5 eller 8 runder");
});

test("alle skrev sannheten: ingen stemmer, bare sannheten avsløres", () => {
  const r = M.nyRunde(3, 0);
  for (let n = 0; n < 3; n++) {
    assert.equal(M.skriv(r, KORT, "røykhull"), "sann");
    assert.equal(M.skriv(r, KORT, `Skrøne ${n}`), "ok");
  }
  M.tilStemming(r, KORT.a, fast);
  assert.equal(r.srekke.length, 0);
  assert.ok(M.alleHarStemt(r));
  assert.deepEqual(j(M.avslorRekke(r)), [M.sannIndeks(r.valg)]);
  assert.deepEqual(j(M.regnUt(r).pluss), [M.BONUS, M.BONUS, M.BONUS]);
});

// ---------- The cards ----------

const PAKKER = ["ord", "fakta", "steder", "dyr", "oppfinnelser", "barn"];
const alle = D.pakker.flatMap((p) => p.kort.map((k) => ({ ...k, p: p.id })));

test("kortene: minst 300, seks pakker med navn og ikon, minst 35 i hver", () => {
  assert.ok(alle.length >= 300, `bare ${alle.length} kort`);
  assert.deepEqual(D.pakker.map((p) => p.id), PAKKER);
  for (const p of D.pakker) {
    assert.ok(p.navn && p.ikon && p.tekst, `${p.id} mangler navn, ikon eller tekst`);
    assert.ok(p.kort.length >= 35, `${p.id} har bare ${p.kort.length} kort`);
  }
  assert.equal(D.pakker.find((p) => p.id === "barn").tekst, "For de minste");
});

test("kortene: ingen like spørsmål, og svarene er korte og ser ut som en spillers", () => {
  const sett = new Map();
  for (const k of alle) {
    const n = M.nokkel(k.s);
    assert.ok(!sett.has(n), `samme kort to ganger: «${k.s}»`);
    sett.set(n, k);
    assert.ok(typeof k.s === "string" && k.s.length >= 12 && k.s.length <= 140, `rart spørsmål: «${k.s}»`);
    assert.ok(/[?…]/.test(k.s), `spørsmålet mangler ? eller …: «${k.s}»`);
    assert.ok(typeof k.a === "string" && k.a.trim() === k.a && Array.from(k.a).length <= 60, `svaret er for langt: «${k.a}»`);
    assert.equal(M.rens(k.a), k.a, `svaret må overleve rens(): «${k.a}»`);
    assert.ok(M.nokkel(k.a), `tomt svar: «${k.s}»`);
    assert.ok(/^[A-ZÆØÅ0-9«]/.test(k.a), `svaret skal starte med stor bokstav: «${k.a}»`);
    assert.ok(!/[.!]$/.test(k.a), `ikke punktum til slutt – spillerne skriver sjelden det: «${k.a}»`);
    if (k.g) {
      assert.ok(Array.isArray(k.g) && k.g.every((x) => typeof x === "string" && M.nokkel(x)), `rare godtatte svar: «${k.s}»`);
    }
    assert.ok(!/<|>|&/.test(k.s + k.a), `markup i kortet: «${k.s}»`);
  }
});

test("kortene: husets skrivemåter, ingen varemerker og ingen sjangernavn fra andre spill", () => {
  const tekst = JSON.stringify(D);
  for (const [feil, rett] of [["fingre ", "fingrer"], ["frem ", "fram"], ["ferge", "ferje"], ["stod ", "sto"], ["rommet", "verdensrommet"]]) {
    assert.ok(!tekst.toLowerCase().includes(feil) || (feil === "rommet" && !/[^s]rommet/.test(tekst.replace(/verdensrommet/g, ""))), `skriv «${rett}», ikke «${feil.trim()}»`);
  }
  assert.ok(!/balderdash|fibbage|thermos|velcro|post-it/i.test(tekst));
  const barn = D.pakker.find((p) => p.id === "barn");
  assert.ok(!/brennevin|sprit|\bøl\b|\bvin\b|drikke|\bdød/i.test(JSON.stringify(barn)), "Barn-pakken skal være for de minste");
});

// ---------- The English and Danish editions ----------

test("småordene følger utgavens språk (a/an/the på engelsk, en/et/den på dansk)", () => {
  const lastMed = (sprak) => {
    // The rules read the edition (two reads); after that the kit is "missing", so only the rules load.
    let lest = 0;
    const w = {};
    Object.defineProperty(w, "Rusj", { get: () => (lest++ < 2 ? { sprak } : undefined) });
    vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/skronemakeren/spill.js"), "utf8"), { window: w, console });
    return w.RusjSkrone;
  };
  const en = lastMed("en");
  assert.equal(en.nokkel("A towel"), en.nokkel("towel"));
  assert.equal(en.nokkel("The kind of jaw"), en.nokkel("jaw"));
  const da = lastMed("da");
  assert.equal(da.nokkel("Et håndklæde"), da.nokkel("håndklæde"));
  assert.equal(da.nokkel("Noget fnug"), da.nokkel("fnug"));
  // Norwegian is unchanged when the kit says nb.
  assert.equal(lastMed("nb").nokkel("en slags kjeve"), M.nokkel("kjeve"));
});

for (const mappe of ["data.en", "data.da"]) {
  const fil = join(ROT, "rusj/spill/skronemakeren", mappe, "kort.json");
  if (!existsSync(fil)) continue;
  const U = JSON.parse(readFileSync(fil, "utf8"));
  test(`kortene (${mappe}): de samme seks pakkene, minst 30 i hver, korte svar og ingen like spørsmål`, () => {
    assert.deepEqual(U.pakker.map((p) => p.id), PAKKER);
    const sett = new Set();
    for (const p of U.pakker) {
      assert.ok(p.navn && p.ikon && p.tekst, `${p.id} mangler navn, ikon eller tekst`);
      assert.ok(p.kort.length >= 30, `${p.id} har bare ${p.kort.length} kort`);
      for (const k of p.kort) {
        assert.deepEqual(Object.keys(k).filter((n) => !["s", "a", "g"].includes(n)), [], `ukjent felt: «${k.s}»`);
        const n = M.nokkel(k.s);
        assert.ok(!sett.has(n), `samme kort to ganger: «${k.s}»`);
        sett.add(n);
        assert.ok(typeof k.s === "string" && k.s.length >= 12 && k.s.length <= 140 && /[?…]/.test(k.s), `rart spørsmål: «${k.s}»`);
        assert.ok(typeof k.a === "string" && k.a.trim() === k.a && Array.from(k.a).length <= 60, `svaret er for langt: «${k.a}»`);
        assert.equal(M.rens(k.a), k.a, `svaret må overleve rens(): «${k.a}»`);
        assert.ok(/^[A-ZÆØÅ0-9]/.test(k.a) && !/[.!]$/.test(k.a), `svaret skal starte med stor bokstav og ikke slutte med punktum: «${k.a}»`);
        if (k.g) assert.ok(Array.isArray(k.g) && k.g.every((x) => typeof x === "string" && M.nokkel(x)), `rare godtatte svar: «${k.s}»`);
        assert.ok(!/<|>|&/.test(k.s + k.a), `markup i kortet: «${k.s}»`);
      }
    }
    assert.ok(!/balderdash|fibbage|thermos|velcro|post-it|bubble wrap/i.test(JSON.stringify(U)), "varemerke i kortene");
    if (mappe === "data.en") assert.ok(!/[æøå]/i.test(JSON.stringify(U)), "æ, ø eller å i den engelske kortstokken");
  });
}
