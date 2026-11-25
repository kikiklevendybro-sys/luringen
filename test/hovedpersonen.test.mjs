// Hovedpersonen: the turn rules (everyone once in the chair, the reader is the next one round the
// table, the star toggle, skipping, the end and the winners) as pure functions loaded in node:vm
// without the kit — and the questions: the same five packs in nb, en and da with the same number
// of cards, no question twice, short, ending in a question mark, nothing left in Norwegian. The
// teen pack («Ungdom», 13–16) came last: the four packs before it draw exactly as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { ungdomTester } from "./kortpakker.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
vm.runInNewContext(readFileSync(join(ROT, "rusj/spill/hovedpersonen/spill.js"), "utf8"), { window, console });
const M = window.RusjHovedperson;
const j = (x) => JSON.parse(JSON.stringify(x));
const les = (mappe) => JSON.parse(readFileSync(join(ROT, "rusj/spill/hovedpersonen", mappe, "sporsmal.json"), "utf8"));
const DATA = { nb: les("data"), en: les("data.en"), da: les("data.da") };
const oppsett = (o = {}) => Object.assign({ pakker: ["familie"], per: 3, stjerner: true }, o);

test("alle får stolen én gang, med start hos den mobilen valgte; leseren er nestemann", () => {
  const sp = M.nyttSpill(oppsett(), 4, 2, 10);
  assert.deepEqual(j(sp.rekke), [2, 3, 0, 1]);
  assert.equal(M.iStolen(sp), 2);
  assert.equal(M.leser(sp), 3);
  assert.equal(sp.fase, "stol");
  sp.na = 3;
  assert.equal(M.iStolen(sp), 1);
  assert.equal(M.leser(sp), 2, "leseren går rundt bordet");
  assert.equal(M.nyttSpill(oppsett({ per: 7 }), 3, 0, 0).per, 5, "ukjent antall spørsmål blir 5");
});

test("svar: tre spørsmål, så neste i stolen; stjerna teller bare når den står på ved «Neste»", () => {
  const sp = M.nyttSpill(oppsett(), 3, 0, 1);
  sp.fase = "sporsmal";
  assert.equal(M.veksleStjerne(sp), true);
  assert.equal(M.veksleStjerne(sp), true, "trykk igjen tar stjerna bort");
  assert.equal(sp.stjerne, false);
  assert.equal(M.svart(sp, 2), "neste");
  assert.deepEqual(j([sp.nr, sp.kort, sp.poeng]), [2, 2, [0, 0, 0]]);
  M.veksleStjerne(sp);
  assert.equal(M.svart(sp, 3), "neste");
  assert.deepEqual(j([sp.poeng, sp.tur, sp.stjerne]), [[1, 0, 0], 1, false]);
  M.veksleStjerne(sp);
  assert.equal(M.svart(sp, 4), "bytt");
  assert.deepEqual(j([sp.na, sp.nr, sp.fase, sp.poeng, sp.tur, sp.besvart, sp.satt]), [1, 1, "stol", [2, 0, 0], 0, 3, 1]);
  assert.deepEqual(j(sp.forrige), { i: 0, stjerner: 2, besvart: 3 });
});

test("uten stjerner kan ingen få stjerne", () => {
  const sp = M.nyttSpill(oppsett({ stjerner: false }), 2, 0, 0);
  sp.fase = "sporsmal";
  assert.equal(M.veksleStjerne(sp), false);
  M.svart(sp, 1);
  assert.deepEqual(j(sp.poeng), [0, 0]);
  assert.deepEqual(j(M.vinnere(sp)), []);
});

test("stå over: resten av turen går til nestemann, stjerner som er gitt blir stående", () => {
  const sp = M.nyttSpill(oppsett(), 3, 0, 0);
  assert.equal(M.staOver(sp, 5), "bytt", "stå over før første spørsmål");
  assert.deepEqual(j([sp.na, sp.satt, sp.forrige]), [1, 0, { i: 0, stjerner: 0, besvart: 0 }]);
  sp.fase = "sporsmal";
  M.veksleStjerne(sp);
  M.svart(sp, 6);
  M.veksleStjerne(sp); // a star on the table, then the player skips: that star is not given
  assert.equal(M.staOver(sp, 7), "bytt");
  assert.deepEqual(j([sp.poeng, sp.forrige]), [[0, 1, 0], { i: 1, stjerner: 1, besvart: 1 }]);
  assert.equal(M.staOver(sp, 8), "ferdig", "den siste som står over, avslutter spillet");
  assert.equal(sp.ferdig, true);
});

test("hele spillet: ferdig etter siste spørsmål til siste spiller; vinnere og delt seier", () => {
  const sp = M.nyttSpill(oppsett({ per: 3 }), 3, 1, 0);
  let svar;
  let n = 0;
  do {
    if (sp.fase === "stol") sp.fase = "sporsmal";
    if (M.iStolen(sp) !== 0 && sp.nr === 1) M.veksleStjerne(sp);
    svar = M.svart(sp, ++n);
  } while (svar !== "ferdig" && n < 20);
  assert.equal(svar, "ferdig");
  assert.equal(n, 9, "tre spillere × tre spørsmål");
  assert.deepEqual(j([sp.besvart, sp.satt, sp.poeng]), [9, 3, [0, 1, 1]]);
  assert.deepEqual(j(M.vinnere(sp)), [1, 2]);
  assert.deepEqual(j(M.rader(sp)), [{ i: 0, poeng: 0 }, { i: 1, poeng: 1 }, { i: 2, poeng: 1 }]);
});

// ---------- The questions ----------

// The words the e2e runner treats as Norwegian left in another edition (test/rusj-e2e.mjs).
const NORSKE = {
  en: new Set("og ikke er på med som har kan vil det et av du dere deg din ditt dine jeg meg hva når nå igjen spill spillet spiller spillere mobilen runde runder trekk poeng vinner avslutt fortsett angre lukk tilbake ferdig neste velg trykk spill".split(" ")),
  da: new Set("spill trykk velg igjen noe fortsett avslutt lukk uavgjort brettet deg meg dere hva gjør ble brikka".split(" ")),
};
const norskOrd = (sprak, tekst) => (sprak === "en" && /[æøå]/i.test(tekst) ? ["æøå"] : []).concat((tekst.toLocaleLowerCase("nb").match(/[a-zæøå]+/g) || []).filter((o) => NORSKE[sprak].has(o)));
const nokkel = (t) => t.toLocaleLowerCase("nb").replace(/[^a-zæøå0-9]+/g, " ").trim();

test("samme fem pakker i alle språk, med like mange spørsmål – over 300 i hvert språk", () => {
  const ider = (d) => d.pakker.map((p) => p.id).join();
  for (const sprak of ["nb", "en", "da"]) {
    const d = DATA[sprak];
    assert.equal(ider(d), "familie,venner,fantasi,dypt,ungdom", sprak);
    for (const p of d.pakker) {
      for (const f of ["navn", "ikon", "tekst"]) assert.ok(typeof p[f] === "string" && p[f].trim(), `${sprak}/${p.id}: mangler ${f}`);
      assert.ok(p.kort.length >= (p.id === "ungdom" ? 55 : 75), `${sprak}/${p.id}: bare ${p.kort.length}`);
      assert.equal(p.kort.length, DATA.nb.pakker.find((x) => x.id === p.id).kort.length, `${sprak}/${p.id}: ikke like mange som på norsk`);
      assert.equal(p.ikon, DATA.nb.pakker.find((x) => x.id === p.id).ikon, `${sprak}/${p.id}: annet ikon`);
    }
    assert.ok(d.pakker.reduce((n, p) => n + p.kort.length, 0) >= 300, sprak);
    assert.equal(Object.keys(d).join(), "pakker", `${sprak}: bare «pakker» på toppnivå`);
  }
  assert.equal(DATA.nb.pakker[0].tekst, "For alle aldre");
});

test("hvert spørsmål: unikt, kort, ett spørsmålstegn til slutt, ingen norske ord i en/da", () => {
  for (const sprak of ["nb", "en", "da"]) {
    const sett = new Map();
    for (const p of DATA[sprak].pakker)
      for (const k of p.kort) {
        assert.equal(typeof k, "string");
        assert.ok(k === k.trim() && !/\s{2}/.test(k), `${sprak}: mellomrom i «${k}»`);
        assert.ok(k.length >= 15 && k.length <= 130, `${sprak}: lengde ${k.length} «${k}»`);
        assert.ok(/\?$/.test(k), `${sprak}: slutter ikke med ? «${k}»`);
        assert.ok(!/[<>{}]/.test(k), `${sprak}: tegn som ikke hører hjemme «${k}»`);
        const n = nokkel(k);
        assert.ok(!sett.has(n), `${sprak}: to like spørsmål «${k}» (${p.id} og ${sett.get(n)})`);
        sett.set(n, p.id);
        if (sprak !== "nb") assert.deepEqual(norskOrd(sprak, k), [], `${sprak}: norsk i «${k}»`);
      }
  }
  const nb = DATA.nb.pakker.flatMap((p) => p.kort).join(" ");
  assert.ok(!/\bfrem\b|\bstod\b|\bfingre\b/.test(nb), "KIT-skrivemåter: fram, sto, fingrer");
});

// ---------- The teen pack ----------
// The fingerprints were taken before the pack was added. If you change an existing question on
// purpose, run the same draws again and update them here.
ungdomTester({
  id: "hovedpersonen",
  fil: "sporsmal",
  felt: "kort",
  gamle: ["familie", "venner", "fantasi", "dypt"],
  avtrykk: {
    nb: { standard: ["familie", "venner"], antall: 329, kart: "9c57cb570087a53b", trekk: "1e9be3ac87cf48f7" },
    en: { standard: ["familie", "venner"], antall: 329, kart: "a8c61bfd69698cb9", trekk: "beeb67cecb3821ec" },
    da: { standard: ["familie", "venner"], antall: 329, kart: "0a757b701fe40014", trekk: "0ad3366c203418dd" },
  },
  maks: 130,
  // «Start» shows the chair first; the card is on the question screen.
  skjerm: "sporsmal",
  forbered: (S) => (S.spill.fase = "sporsmal"),
  vist: (k) => [k],
});
