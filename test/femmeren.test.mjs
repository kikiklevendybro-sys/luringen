// Femmeren: the turn rules (judgement, streaks, the challenge bonus both ways, undo, end after
// rounds or at N points, winners) as pure functions loaded in node:vm without the kit — and the
// cards: five packs with at least 120 each, no card twice, short and well formed, KIT spellings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/femmeren/spill.js"), "utf8"), { window, console });
const M = window.RusjFemmeren;
// Arrays from the vm context have another Array prototype: compare plain copies.
const j = (x) => JSON.parse(JSON.stringify(x));
const D = JSON.parse(readFileSync(join(ROT, "rusj/spill/femmeren/data/kort.json"), "utf8"));

const oppsett = (o = {}) => Object.assign({ pakker: ["familie"], maal: "runder", runder: 2, poengMaal: 3, tid: 5, utfordre: true, giVidere: false }, o);

test("ja gir poeng og rekke, nei nullstiller rekka", () => {
  const sp = M.nyttSpill(oppsett(), 2, 0);
  assert.equal(sp.fase, "klar");
  M.dom(sp, true);
  assert.deepEqual(j([sp.poeng, sp.rekke, sp.best, sp.fase]), [[1, 0], [1, 0], [1, 0], "resultat"]);
  M.nesteTur(sp, 1);
  assert.equal(M.spiller(sp), 1);
  M.dom(sp, false);
  M.nesteTur(sp, 2);
  M.dom(sp, true); // player 0 again: two in a row
  assert.deepEqual(j([sp.rekke[0], sp.best[0]]), [2, 2]);
  M.nesteTur(sp, 3);
  M.dom(sp, false);
  M.nesteTur(sp, 4);
  M.dom(sp, false); // the streak breaks, the best stays
  assert.deepEqual(j([sp.rekke[0], sp.best[0], sp.poeng[0]]), [0, 2, 2]);
  assert.deepEqual(j(M.lengsteRekke(sp)), { n: 2, hvem: [0] });
});

test("utfordring: ja gir bonus til den som utfordret, nei til den som hadde tur", () => {
  const sp = M.nyttSpill(oppsett(), 3, 0);
  M.dom(sp, false);
  assert.equal(M.kanUtfordre(sp), false, "ingen utfordring etter nei");
  M.angre(sp);
  M.dom(sp, true);
  assert.equal(M.kanUtfordre(sp), true);
  sp.utfordrer = 2;
  sp.fase = "udom";
  M.utfordringDom(sp, true);
  assert.deepEqual(j(sp.poeng), [1, 0, 1]);
  assert.equal(M.bonusTil(sp.siste), 2);
  assert.equal(M.kanUtfordre(sp), false, "bare én utfordring per tur");
  assert.equal(sp.rekke[2], 0, "bonusen teller ikke i rekka");
  M.angre(sp);
  assert.deepEqual(j([sp.poeng, sp.fase]), [[1, 0, 0], "udom"]);
  M.utfordringDom(sp, false);
  assert.deepEqual(j(sp.poeng), [2, 0, 0]);
  assert.equal(M.bonusTil(sp.siste), 0);
  const uten = M.nyttSpill(oppsett({ utfordre: false }), 3, 0);
  M.dom(uten, true);
  assert.equal(M.kanUtfordre(uten), false, "regelen kan skrus av");
});

test("angre fører spillet tilbake til før dommen, også etter neste tur", () => {
  const sp = M.nyttSpill(oppsett(), 2, 7);
  M.dom(sp, true);
  M.nesteTur(sp, 9);
  assert.equal(M.angre(sp), true);
  assert.deepEqual(j([sp.tur, sp.kort, sp.fase, sp.poeng[0], sp.rekke[0], sp.angre]), [0, 7, "klar", 0, 0, null]);
  assert.equal(M.angre(sp), false, "ingenting mer å angre");
});

test("slutt etter runder eller ved poengmålet; vinnere og uavgjort", () => {
  const sp = M.nyttSpill(oppsett({ runder: 2 }), 3, 0);
  for (let n = 0; n < 5; n++) {
    M.dom(sp, n % 2 === 0);
    assert.equal(M.erFerdig(sp), false, `tur ${n + 1}`);
    M.nesteTur(sp, n + 1);
  }
  M.dom(sp, true);
  assert.equal(M.erFerdig(sp), true, "seks turer = to runder for tre");
  assert.equal(M.runde(sp), 2);
  assert.deepEqual(j(sp.poeng), [1, 1, 2]);
  assert.deepEqual(j(M.vinnere(sp)), [2]);

  const p = M.nyttSpill(oppsett({ maal: "poeng", poengMaal: 3 }), 2, 0);
  let turer = 0;
  while (!M.erFerdig(p)) {
    M.dom(p, M.spiller(p) === 1);
    if (!M.erFerdig(p)) M.nesteTur(p, 0);
    turer++;
  }
  assert.deepEqual(j([p.poeng, turer]), [[0, 3], 6]);
  assert.deepEqual(j(M.vinnere(p)), [1]);
  assert.deepEqual(j(M.vinnere(M.nyttSpill(oppsett(), 4, 0))), [], "ingen poeng, ingen vinner");
});

test("gi mobilen videre starter hver tur på «gi»", () => {
  const sp = M.nyttSpill(oppsett({ giVidere: true }), 2, 0);
  assert.equal(sp.fase, "gi");
  M.dom(sp, true);
  M.nesteTur(sp, 1);
  assert.equal(sp.fase, "gi");
  assert.equal(M.nyttSpill(oppsett({ tid: 7 }), 2, 0).tid, 5, "ukjent tid blir 5 s");
});

const PAKKER = D.pakker;
const nokkel = (t) => t.toLocaleLowerCase("nb").replace(/[^a-zæøå0-9]+/g, " ").trim();

test("fem pakker med navn, ikon og tekst; Jul sist; minst 120 kort i hver og 600 i alt", () => {
  assert.equal(D.prefiks, "Nevn tre");
  assert.deepEqual(j(PAKKER.map((p) => p.id)), ["familie", "norge", "fest", "vanskelig", "jul"]);
  for (const p of PAKKER) {
    for (const f of ["navn", "ikon", "tekst"]) assert.ok(typeof p[f] === "string" && p[f], `${p.id}: mangler ${f}`);
    assert.ok(p.kort.length >= 120, `${p.id}: bare ${p.kort.length} kort`);
  }
  assert.equal(PAKKER.find((p) => p.id === "familie").tekst, "For alle aldre");
  assert.equal(PAKKER.find((p) => p.id === "fest").tekst, "Litt mer på kanten (18+)");
  assert.ok(PAKKER.reduce((n, p) => n + p.kort.length, 0) >= 600);
});

test("ingen kort står to ganger, og alle er korte og velformede", () => {
  const sett = new Map();
  for (const p of PAKKER)
    for (const k of p.kort) {
      assert.ok(typeof k === "string" && k === k.trim() && k.length >= 4 && k.length <= 60 && !/\s\s/.test(k), `${p.id}: «${k}»`);
      assert.ok(!/[.!?:;]$/.test(k), `${p.id}: «${k}» slutter med skilletegn`);
      assert.ok(!/^nevn/i.test(k), `${p.id}: «${k}» gjentar «Nevn tre»`);
      assert.ok(!sett.has(nokkel(k)), `«${k}» står i både ${sett.get(nokkel(k))} og ${p.id}`);
      sett.set(nokkel(k), p.id);
    }
});

test("felles skrivemåter (KIT) og ingen voksentema utenfor Fest", () => {
  for (const p of PAKKER)
    for (const k of p.kort) {
      assert.ok(!/(^|[^a-zæøå])(fingre|spaghetti|frem|giraff|stod|ferge|diskotek)($|[^a-zæøå])/i.test(k), `«${k}»`);
      if (p.id !== "fest") assert.ok(!/(^|\s)(drinker?|bakfull|tømmermenn|fyll\w*|øl|vin|vorspiel|nachspiel|date|sjekke\w*|eks|baren?)($|\s)/i.test(k), `${p.id}: «${k}»`);
    }
});
