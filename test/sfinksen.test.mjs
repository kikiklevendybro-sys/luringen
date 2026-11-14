// Sfinksen: the rules (hint boxes and first letters, reveal, a point to whoever got it first or
// «I got it» alone, undo, the end after 10 or 20, winners) as pure functions loaded in node:vm
// without the kit — and the riddles: the same three packs in nb, en and da, over 200 per language,
// a question, a short answer and maybe a «why», no riddle twice, nothing left in Norwegian, no brands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/sfinksen/spill.js"), "utf8"), { window, console });
const M = window.RusjSfinks;
const j = (x) => JSON.parse(JSON.stringify(x));
const les = (mappe) => JSON.parse(readFileSync(join(ROT, "rusj/spill/sfinksen", mappe, "gater.json"), "utf8"));
const DATA = { nb: les("data"), en: les("data.en"), da: les("data.da") };
const oppsett = (o = {}) => Object.assign({ modus: "gjengen", pakker: ["barn"], lengde: 10 }, o);

test("hintet: bokser per bokstav, tegn som seg selv, så forbokstavene", () => {
  const m1 = j(M.monster("Bæ, bæ, lille lam", 1));
  assert.equal(m1.length, 4);
  assert.deepEqual(m1[0], [{ b: "B", vis: false }, { b: "æ", vis: false }, { b: ",", tegn: true }]);
  assert.ok(m1.flat().every((x) => x.tegn || !x.vis), "nivå 1 viser ingen bokstaver");
  const m2 = j(M.monster("Bæ, bæ, lille lam", 2));
  assert.deepEqual(m2.map((o) => o.filter((x) => x.vis).map((x) => x.b).join("")), ["B", "b", "l", "l"]);
  assert.deepEqual(j(M.telling("Land's End")), { ord: 2, bokstaver: 8 });
  assert.deepEqual(j(M.forbokstaver("Det skjeve tårnet i Pisa")), ["D", "s", "t", "i", "P"]);
});

test("gjengen: hint (maks to), vis svaret, poeng til den som gjettet først, angre", () => {
  const sp = M.nyttSpill(oppsett(), 3, 7);
  assert.deepEqual(j([sp.modus, sp.antall, sp.poeng, sp.fase, sp.nr]), ["gjengen", 3, [0, 0, 0], "gjett", 1]);
  assert.equal(M.gjettet(sp, 1, 8), null, "ingen poeng før svaret er vist");
  assert.equal(M.merHint(sp), true);
  assert.equal(M.merHint(sp), true);
  assert.equal(M.merHint(sp), false, "bare to hint");
  assert.equal(M.vis(sp), true);
  assert.equal(M.merHint(sp), false, "ikke hint etter svaret");
  assert.equal(M.gjettet(sp, 1, 8), "neste");
  assert.deepEqual(j([sp.poeng, sp.nr, sp.kort, sp.fase, sp.hint, sp.spilt]), [[0, 1, 0], 2, 8, "gjett", 0, 1]);
  assert.equal(M.angre(sp), true);
  assert.deepEqual(j([sp.poeng, sp.nr, sp.kort, sp.fase, sp.hint, sp.spilt, sp.angre]), [[0, 0, 0], 1, 7, "svar", 2, 0, null]);
  assert.equal(M.angre(sp), false, "bare én angre");
  assert.equal(M.gjettet(sp, -1, 9), "neste", "ingen klarte det");
  assert.deepEqual(j(sp.poeng), [0, 0, 0]);
  assert.equal(M.gjettet(sp, 5, 10), null, "ikke i svar-fasen lenger");
});

test("alene: «Jeg klarte det» teller, «Ikke denne» ikke; ferdig etter siste gåte", () => {
  const sp = M.nyttSpill(oppsett({ modus: "alene", lengde: 10 }), 6, 0);
  assert.deepEqual(j([sp.antall, sp.poeng]), [1, [0]]);
  let n = 0;
  let svar;
  do {
    M.vis(sp);
    svar = M.gjettet(sp, n % 3 !== 0, ++n);
  } while (svar === "neste");
  assert.equal(svar, "ferdig");
  assert.deepEqual(j([n, sp.spilt, sp.riktig, sp.ferdig]), [10, 10, 6, true]);
  assert.equal(M.angre(sp), true, "siste svar kan også angres");
  assert.deepEqual(j([sp.riktig, sp.spilt, sp.ferdig, sp.fase, sp.nr]), [6, 9, false, "svar", 10]);
  const fritt = M.nyttSpill(oppsett({ lengde: 0 }), 2, 0);
  for (let i = 0; i < 40; i++) {
    M.vis(fritt);
    assert.equal(M.gjettet(fritt, i % 2, i), "neste", "«Fritt» slutter aldri av seg selv");
  }
  assert.deepEqual(j(M.vinnere(fritt)), [0, 1], "delt seier");
  assert.equal(M.nyttSpill(oppsett({ lengde: 15, modus: "x" }), 2, 0).lengde, 10);
});

// ---------- The riddles ----------

const NORSKE = {
  en: new Set("og ikke er på med som har kan vil det et av du dere deg din ditt dine jeg meg hva når nå igjen spill spillet spiller spillere mobilen runde runder trekk poeng vinner avslutt fortsett angre lukk tilbake ferdig neste velg trykk spill".split(" ")),
  da: new Set("spill trykk velg igjen noe fortsett avslutt lukk uavgjort brettet deg meg dere hva gjør ble brikka".split(" ")),
};
const norskOrd = (sprak, tekst) => (sprak === "en" && /[æøå]/i.test(tekst) ? ["æøå"] : []).concat((tekst.toLocaleLowerCase("nb").match(/[a-zæøå]+/g) || []).filter((o) => NORSKE[sprak].has(o)));
const nokkel = (t) => t.toLocaleLowerCase("nb").replace(/[^a-zæøå0-9]+/g, "");
const MERKER = /\b(lego|disney|pokemon|pokémon|barbie|mcdonald|coca|pepsi|nike|adidas|ikea|tivoli|legoland|harry potter|star wars)\b/i;

test("samme tre pakker i alle språk, over 200 gåter i hvert", () => {
  const ider = (d) => d.pakker.map((p) => p.id).join();
  for (const sprak of ["nb", "en", "da"]) {
    const d = DATA[sprak];
    assert.equal(Object.keys(d).join(), "pakker", sprak);
    assert.equal(ider(d), "barn,lure,hjerne", sprak);
    for (const p of d.pakker) {
      for (const f of ["navn", "ikon", "tekst"]) assert.ok(typeof p[f] === "string" && p[f].trim(), `${sprak}/${p.id}: mangler ${f}`);
      assert.equal(p.ikon, DATA.nb.pakker.find((x) => x.id === p.id).ikon, `${sprak}/${p.id}: annet ikon`);
      assert.ok(p.kort.length >= 65, `${sprak}/${p.id}: bare ${p.kort.length}`);
    }
    assert.ok(d.pakker.reduce((n, p) => n + p.kort.length, 0) >= 200, sprak);
  }
  assert.equal(DATA.nb.pakker[0].tekst, "For de minste");
});

test("hver gåte: et spørsmål, et kort svar og kanskje en forklaring; ingen dobbelt, ingen norsk i en/da, ingen merkenavn", () => {
  for (const sprak of ["nb", "en", "da"]) {
    const sett = new Map();
    for (const p of DATA[sprak].pakker)
      for (const k of p.kort) {
        const felt = Object.keys(k).sort().join();
        assert.ok(felt === "a,s" || felt === "a,f,s", `${sprak}/${p.id}: felt ${felt}`);
        assert.ok(k.s === k.s.trim() && k.s.length >= 15 && k.s.length <= 200 && /[?.!]$/.test(k.s) && !/\s{2}/.test(k.s), `${sprak}: gåten «${k.s}»`);
        assert.ok(k.a && k.a === k.a.trim() && k.a.length <= 60, `${sprak}: svaret «${k.a}»`);
        if (k.f != null) assert.ok(k.f.trim() && k.f.length <= 170 && /[.!?»”’)…]$/.test(k.f), `${sprak}: forklaringen «${k.f}»`);
        const n = nokkel(k.s);
        assert.ok(!sett.has(n), `${sprak}: «${k.s}» to ganger (${p.id} og ${sett.get(n)})`);
        sett.set(n, p.id);
        for (const t of [k.s, k.a, k.f || ""]) {
          assert.ok(!MERKER.test(t), `${sprak}: merkenavn i «${t}»`);
          if (sprak !== "nb") assert.deepEqual(norskOrd(sprak, t), [], `${sprak}: norsk i «${t}»`);
        }
      }
  }
});
