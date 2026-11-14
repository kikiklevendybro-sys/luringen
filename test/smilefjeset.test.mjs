// Smilefjeset: the rules (hint boxes and first letters, reveal, a point to whoever guessed first or
// «I got it» alone, undo, the end after 10 or 20, winners) as pure functions loaded in node:vm
// without the kit — and the riddles: the same six packs in nb, en and da, over 300 per language,
// emojis only on the card, no riddle or answer twice, nothing left in Norwegian, no brands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/smilefjeset/spill.js"), "utf8"), { window, console });
const M = window.RusjSmilefjes;
const j = (x) => JSON.parse(JSON.stringify(x));
const les = (mappe) => JSON.parse(readFileSync(join(ROT, "rusj/spill/smilefjeset", mappe, "gater.json"), "utf8"));
const DATA = { nb: les("data"), en: les("data.en"), da: les("data.da") };
const oppsett = (o = {}) => Object.assign({ modus: "gjengen", pakker: ["ting"], lengde: 10 }, o);

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
const MERKER = /\b(lego|disney|pokemon|pokémon|barbie|mcdonald|coca|pepsi|nike|adidas|ikea|tivoli|legoland|harry potter|star wars|frozen)\b/i;

test("samme seks pakker i alle språk, over 300 gåter i hvert", () => {
  const ider = (d) => d.pakker.map((p) => p.id).join();
  for (const sprak of ["nb", "en", "da"]) {
    const d = DATA[sprak];
    assert.equal(Object.keys(d).join(), "pakker", sprak);
    assert.equal(ider(d), "ordtak,ting,steder,dyr,yrker,sanger", sprak);
    for (const p of d.pakker) {
      for (const f of ["navn", "ikon", "tekst"]) assert.ok(typeof p[f] === "string" && p[f].trim(), `${sprak}/${p.id}: mangler ${f}`);
      assert.equal(p.ikon, DATA.nb.pakker.find((x) => x.id === p.id).ikon, `${sprak}/${p.id}: annet ikon`);
      assert.ok(p.kort.length >= 36, `${sprak}/${p.id}: bare ${p.kort.length}`);
    }
    assert.ok(d.pakker.reduce((n, p) => n + p.kort.length, 0) >= 300, sprak);
  }
});

test("hver gåte: bare emojier på kortet, et kort svar, ingen dobbelt, ingen norsk i en/da, ingen merkenavn", () => {
  for (const sprak of ["nb", "en", "da"]) {
    const svar = new Map();
    const emoji = new Map();
    for (const p of DATA[sprak].pakker)
      for (const k of p.kort) {
        assert.deepEqual(Object.keys(k).sort(), ["e", "s"], `${sprak}/${p.id}: felt`);
        assert.ok(k.e && !/[\p{L}]/u.test(k.e.replace(/[\u2139\u{1F1E6}-\u{1F1FF}]/gu, "")) && !/\s/.test(k.e), `${sprak}: bokstaver eller mellomrom i emojiene «${k.e}»`);
        assert.ok(Array.from(k.e).length >= 2, `${sprak}: for få emojier «${k.e}» (${k.s})`);
        assert.ok(k.s && k.s === k.s.trim() && k.s.length <= 50 && !/\s{2}/.test(k.s), `${sprak}: svaret «${k.s}»`);
        assert.ok(!svar.has(nokkel(k.s)), `${sprak}: «${k.s}» to ganger (${p.id} og ${svar.get(nokkel(k.s))})`);
        svar.set(nokkel(k.s), p.id);
        assert.ok(!emoji.has(k.e), `${sprak}: samme emojier «${k.e}» for «${k.s}» og «${emoji.get(k.e)}»`);
        emoji.set(k.e, k.s);
        assert.ok(!MERKER.test(k.s), `${sprak}: merkenavn i «${k.s}»`);
        if (sprak !== "nb") assert.deepEqual(norskOrd(sprak, k.s), [], `${sprak}: norsk i «${k.s}»`);
      }
  }
});
