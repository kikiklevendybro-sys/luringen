// Dommeren: the deck and the round as pure functions with a seeded random function (node:vm,
// no kit): five cards each and never the same card twice, the phone round with undo, the judge's
// shuffled list, the point and its undo, topping up and the next judge, a pile that runs out
// (the discards come back), the end — and the cards: the same two packs in nb, en and da (the
// adult one marked), one gap per question, no card twice, nothing left in Norwegian, no brands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/dommeren/spill.js"), "utf8"), { window, console });
const M = window.RusjDommer;
const j = (x) => JSON.parse(JSON.stringify(x));
const les = (mappe) => JSON.parse(readFileSync(join(ROT, "rusj/spill/dommeren", mappe, "kort.json"), "utf8"));
const DATA = { nb: les("data"), en: les("data.en"), da: les("data.da") };
const ider = (n) => Array.from({ length: n }, (_, i) => i);

test("fyll: svaret i hullet, stor forbokstav når det starter en setning, aldri to punktum", () => {
  assert.deepEqual(j(M.fyll("Det beste med fredag er ___.", "en sur sokk")), ["Det beste med fredag er ", "en sur sokk", "."]);
  assert.equal(M.fyll("___ – det var det jeg drømte om.", "en sur sokk").join(""), "En sur sokk – det var det jeg drømte om.");
  assert.equal(M.fyll("Hva er bedre enn brus? ___.", "en sur sokk").join(""), "Hva er bedre enn brus? En sur sokk.");
  assert.equal(M.fyll("Bestemor har en hemmelighet: ___.", "en sur sokk").join(""), "Bestemor har en hemmelighet: en sur sokk.");
  assert.equal(M.fyll("Han sa ___.", "hei.").join(""), "Han sa hei.");
});

test("nytt spill: fem kort hver, ingen kort to ganger, samme stokking med samme frø", () => {
  const sp = M.nyttSpill({ pakker: ["familie"], maal: 3 }, 4, M.rngFra(7), ider(40), 3);
  assert.deepEqual(j(sp.hender.map((h) => h.length)), [5, 5, 5, 5]);
  const alle = [...sp.hender.flat(), ...sp.bunke];
  assert.equal(new Set(alle).size, 40);
  assert.equal(alle.length, 40);
  assert.deepEqual(j([sp.maal, sp.fase, sp.runde, sp.sporsmal]), [3, "kort", 1, 3]);
  const igjen = M.nyttSpill({ pakker: ["familie"], maal: 3 }, 4, M.rngFra(7), ider(40), 3);
  assert.deepEqual(j(igjen), j(sp), "deterministisk med samme frø");
  assert.equal(M.nyttSpill({ pakker: [], maal: 9 }, 3, M.rngFra(1), ider(20), 0).maal, 5, "ukjent mål blir 5");
});

test("en runde: mobilen går rundt (med angre), dommeren får en stokket liste, poeng og angre", () => {
  const rng = M.rngFra(42);
  const sp = M.nyttSpill({ pakker: ["familie"], maal: 2 }, 3, rng, ider(30), 0);
  sp.dommer = 1;
  assert.equal(M.legg(sp, 0, rng), null, "ingen kort før mobilen går rundt");
  assert.equal(M.startVelg(sp), true);
  assert.deepEqual(j(sp.rekke), [2, 0], "starter med den etter dommeren");
  assert.equal(M.paTur(sp), 2);
  const k2 = sp.hender[2][3];
  assert.equal(M.legg(sp, 3, rng), "neste");
  assert.deepEqual(j([sp.lagt[2], sp.hender[2].length, sp.na]), [k2, 4, 1]);
  assert.equal(M.angreLegg(sp), true);
  assert.deepEqual(j([sp.lagt[2], sp.hender[2].length, sp.na, M.paTur(sp)]), [-1, 5, 0, 2]);
  assert.equal(M.legg(sp, 3, rng), "neste");
  assert.equal(M.legg(sp, 7, rng), null, "kort som ikke finnes");
  const k0 = sp.hender[0][0];
  assert.equal(M.legg(sp, 0, rng), "dom");
  assert.equal(sp.fase, "dom");
  assert.deepEqual(j(sp.valg.slice().sort()), [0, 2]);
  const v0 = sp.valg.indexOf(0);
  assert.equal(M.kar(sp, 5), false);
  assert.equal(M.kar(sp, v0), true);
  assert.deepEqual(j([sp.poeng, sp.vinner, sp.fase, sp.beste]), [[1, 0, 0], 0, "resultat", [{ s: 0, a: k0, i: 0 }]]);
  assert.equal(M.angreKar(sp), true);
  assert.deepEqual(j([sp.poeng, sp.vinner, sp.fase, sp.beste]), [[0, 0, 0], -1, "dom", []]);
  M.kar(sp, v0);
  M.nesteRunde(sp, rng, 9);
  assert.deepEqual(j([sp.dommer, sp.runde, sp.sporsmal, sp.fase, sp.lagt]), [2, 2, 9, "kort", [-1, -1, -1]]);
  assert.deepEqual(j(sp.hender.map((h) => h.length)), [5, 5, 5], "alle fyller opp til fem");
  assert.equal(sp.kast.length, 2, "kortene som ble lagt, går i kasten");
  assert.equal(M.erFerdig(sp), false);
});

test("bunken tar slutt: kasten stokkes inn igjen, og ingen kort finnes to steder", () => {
  const rng = M.rngFra(3);
  const sp = M.nyttSpill({ pakker: ["familie"], maal: 7 }, 3, rng, ider(16), 0);
  for (let runde = 0; runde < 60; runde++) {
    M.startVelg(sp);
    while (sp.fase === "velg") M.legg(sp, 0, rng);
    M.kar(sp, 0);
    if (M.erFerdig(sp)) break;
    M.nesteRunde(sp, rng, runde);
    const alle = [...sp.hender.flat(), ...sp.bunke, ...sp.kast];
    assert.equal(new Set(alle).size, alle.length, `runde ${runde}: et kort to steder`);
    assert.equal(alle.length, 16, `runde ${runde}: kort forsvant`);
    assert.ok(sp.hender.every((h) => h.length === 5));
  }
  assert.equal(M.erFerdig(sp), true);
  assert.equal(M.vinnere(sp).length, 1);
  assert.equal(Math.max(...sp.poeng), 7);
});

// ---------- The cards ----------

const NORSKE = {
  en: new Set("og ikke er på med som har kan vil det et av du dere deg din ditt dine jeg meg hva når nå igjen spill spillet spiller spillere mobilen runde runder trekk poeng vinner avslutt fortsett angre lukk tilbake ferdig neste velg trykk spill".split(" ")),
  da: new Set("spill trykk velg igjen noe fortsett avslutt lukk uavgjort brettet deg meg dere hva gjør ble brikka".split(" ")),
};
const norskOrd = (sprak, tekst) => (sprak === "en" && /[æøå]/i.test(tekst) ? ["æøå"] : []).concat((tekst.toLocaleLowerCase("nb").match(/[a-zæøå]+/g) || []).filter((o) => NORSKE[sprak].has(o)));
const nokkel = (t) => t.toLocaleLowerCase("nb").replace(/[^a-zæøå0-9]+/g, "");
const MERKER = /\b(lego|disney|pokemon|barbie|mcdonald|coca|pepsi|nike|adidas|ikea|ipad|iphone|tinder|netto|rema|kiwi|tesco|facebook|instagram|snapchat|tiktok|netflix)\b/i;

test("samme to pakker i alle språk, voksenpakken merket, like mange kort – over 300 i familiepakken", () => {
  for (const sprak of ["nb", "en", "da"]) {
    const d = DATA[sprak];
    assert.equal(Object.keys(d).join(), "pakker");
    assert.equal(d.pakker.map((p) => p.id).join(), "familie,voksen", sprak);
    for (const p of d.pakker) {
      const nb = DATA.nb.pakker.find((x) => x.id === p.id);
      for (const f of ["navn", "ikon", "tekst"]) assert.ok(typeof p[f] === "string" && p[f].trim(), `${sprak}/${p.id}: ${f}`);
      assert.equal(!!p.voksen, p.id === "voksen", `${sprak}/${p.id}: voksen-merket`);
      assert.equal(p.ikon, nb.ikon);
      assert.equal(p.sporsmal.length, nb.sporsmal.length, `${sprak}/${p.id}: antall spørsmål`);
      assert.equal(p.svar.length, nb.svar.length, `${sprak}/${p.id}: antall svar`);
      assert.ok(p.svar.length >= 2 * p.sporsmal.length, `${sprak}/${p.id}: for få svar`);
    }
    const fam = d.pakker[0];
    assert.ok(fam.sporsmal.length >= 90 && fam.svar.length >= 220 && fam.sporsmal.length + fam.svar.length >= 300, sprak);
    assert.ok(d.pakker[1].tekst.includes("18+"), `${sprak}: voksenpakken sier 18+`);
  }
});

test("hvert kort: ett hull per spørsmål, svar uten hull og sluttpunktum, ingen dobbelt, ingen norsk i en/da, ingen merkenavn", () => {
  for (const sprak of ["nb", "en", "da"]) {
    const sett = new Map();
    for (const p of DATA[sprak].pakker) {
      for (const s of p.sporsmal) {
        assert.equal(s.split("___").length, 2, `${sprak}: ikke ett hull i «${s}»`);
        assert.ok(!/_{4,}/.test(s) && s.length <= 120 && /[.?!»«’]$/.test(s), `${sprak}: «${s}»`);
      }
      for (const a of p.svar) {
        assert.ok(a && a === a.trim() && !a.includes("_") && !/[.!?]$/.test(a) && a.length <= 60, `${sprak}: svaret «${a}»`);
      }
      for (const t of [...p.sporsmal, ...p.svar]) {
        const n = nokkel(t);
        assert.ok(!sett.has(n), `${sprak}: «${t}» to ganger`);
        sett.set(n, p.id);
        assert.ok(!MERKER.test(t), `${sprak}: merkenavn i «${t}»`);
        if (sprak !== "nb") assert.deepEqual(norskOrd(sprak, t), [], `${sprak}: norsk i «${t}»`);
      }
    }
  }
});
