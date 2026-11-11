// Unit tests for rusj/portal/daglig.js: «today» in Norway, the countdown to midnight, reading
// rusj.daglig in its old and new format (rusj/DAGLIG.md), the site streak with one rest day a
// week, the week dots and the text for «Del dagen». Fixed dates only – nothing depends on today.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = createRequire(import.meta.url)(join(ROT, "rusj/portal/daglig.js"));

// Wednesday 11 November 2026 is day 20768. That week: Monday 20766 … Sunday 20772.
const ONS = 20768;
const MAN = 20766;
const sett = (...d) => new Set(d);

test("today in Norway: the day number, the date and the weekday – also right around midnight", () => {
  const formiddag = D.dag(new Date("2026-11-11T09:00:00Z"));
  assert.deepEqual({ nr: formiddag.nr, tekst: formiddag.tekst, ukedag: formiddag.ukedag }, { nr: ONS, tekst: "2026-11-11", ukedag: 2 });
  assert.equal(D.datoTekst(formiddag), "onsdag 11. november");
  // Winter: Norway is one hour ahead of UTC. 22:59:59Z is still Tuesday, 23:00:00Z is Wednesday.
  assert.equal(D.dag(new Date("2026-11-10T22:59:59Z")).nr, ONS - 1);
  assert.equal(D.dag(new Date("2026-11-10T23:00:00Z")).nr, ONS);
  // Summer: two hours ahead.
  assert.equal(D.dag(new Date("2026-07-01T21:59:59Z")).tekst, "2026-07-01");
  assert.equal(D.dag(new Date("2026-07-01T22:00:00Z")).tekst, "2026-07-02");
  assert.equal(D.ukedag(0), 3, "day 0 (1 January 1970) was a Thursday");
  assert.equal(D.ukedag(MAN), 0);
  assert.equal(D.ukedag(MAN + 6), 6);
  assert.equal(D.uke(MAN), D.uke(MAN + 6));
  assert.notEqual(D.uke(MAN - 1), D.uke(MAN));
});

test("the countdown to the next day, also the two days a year with 23 and 25 hours", () => {
  assert.equal(D.sekunderTilMidnatt(new Date("2026-11-10T22:59:50Z")), 10);
  assert.equal(D.sekunderTilMidnatt(new Date("2026-11-10T23:00:00Z")), 86400);
  assert.equal(D.sekunderTilMidnatt(new Date("2026-11-11T11:00:00Z")), 12 * 3600);
  // 29 March 2026: the clocks go forward – the day is 23 hours long.
  assert.equal(D.sekunderTilMidnatt(new Date("2026-03-28T23:00:00Z")), 23 * 3600);
  assert.equal(D.sekunderTilMidnatt(new Date("2026-03-29T00:30:00Z")), 21.5 * 3600);
  assert.equal(D.sekunderTilMidnatt(new Date("2026-03-29T12:00:00Z")), 10 * 3600);
  // 25 October 2026: the clocks go back – the day is 25 hours long.
  assert.equal(D.sekunderTilMidnatt(new Date("2026-10-24T22:00:00Z")), 25 * 3600);
  assert.equal(D.sekunderTilMidnatt(new Date("2026-10-25T00:30:00Z")), 22.5 * 3600);
  assert.equal(D.sekunderTilMidnatt(new Date("2026-10-25T12:00:00Z")), 11 * 3600);
  assert.equal(D.klokke(7 * 3600 + 42 * 60 + 10), "07:42:10");
  assert.equal(D.klokke(59), "00:00:59");
});

test("the site streak: days in a row with a finished daily; today never breaks it while it lasts", () => {
  assert.deepEqual(D.rekke(sett(), ONS), { rekke: 0, hvile: [], spiltIDag: false });
  assert.deepEqual(D.rekke(sett(ONS), ONS), { rekke: 1, hvile: [], spiltIDag: true });
  assert.deepEqual(D.rekke(sett(ONS - 2, ONS - 1, ONS), ONS), { rekke: 3, hvile: [], spiltIDag: true });
  // Nothing finished yet today: the streak up to yesterday is still alive.
  assert.deepEqual(D.rekke(sett(ONS - 3, ONS - 2, ONS - 1), ONS), { rekke: 3, hvile: [], spiltIDag: false });
  // Long streaks are counted all the way.
  const lang = new Set(Array.from({ length: 120 }, (_, i) => ONS - i));
  assert.equal(D.rekke(lang, ONS).rekke, 120);
  // Days after today (a clock that was wrong) are simply not part of it.
  assert.equal(D.rekke(sett(ONS, ONS + 1, ONS + 2), ONS).rekke, 1);
});

test("the site streak: one missed day a week is a rest day; a second one in the same week ends it", () => {
  // Tuesday missed, played Monday and Wednesday (and the days before Monday).
  assert.deepEqual(D.rekke(sett(MAN - 2, MAN - 1, MAN, ONS), ONS), { rekke: 4, hvile: [ONS - 1], spiltIDag: true });
  // Yesterday missed and nothing finished yet today: the rest day keeps the streak alive.
  assert.deepEqual(D.rekke(sett(MAN - 1, MAN), ONS), { rekke: 2, hvile: [ONS - 1], spiltIDag: false });
  // Two missed days in the same week (Monday and Tuesday): a new streak.
  assert.deepEqual(D.rekke(sett(MAN - 2, MAN - 1, ONS), ONS), { rekke: 1, hvile: [], spiltIDag: true });
  assert.deepEqual(D.rekke(sett(MAN - 2, MAN - 1), ONS), { rekke: 0, hvile: [], spiltIDag: false });
  // Tuesday and Thursday missed in the same week, seen from Friday. Counted backwards from today,
  // the newest missed day (Thursday) is the week's rest day; Tuesday is where the streak begins.
  const fre = MAN + 4;
  assert.deepEqual(D.rekke(sett(MAN - 1, MAN, ONS, fre), fre), { rekke: 2, hvile: [MAN + 3], spiltIDag: true });
  // …and on the Wednesday of that week, before Thursday was missed, Tuesday was the rest day.
  assert.deepEqual(D.rekke(sett(MAN - 1, MAN, ONS), ONS), { rekke: 3, hvile: [MAN + 1], spiltIDag: true });
  // One rest day in each of two weeks: Sunday last week and Tuesday this week.
  assert.deepEqual(D.rekke(sett(MAN - 3, MAN - 2, MAN, ONS), ONS), { rekke: 4, hvile: [ONS - 1, MAN - 1], spiltIDag: true });
  // …also when they are next to each other (Sunday and Monday): each week forgives its own day.
  const tir = MAN + 1;
  assert.deepEqual(D.rekke(sett(MAN - 3, MAN - 2, tir), tir), { rekke: 3, hvile: [MAN, MAN - 1], spiltIDag: true });
  // A missed day with nothing older behind it is not a rest day – it is just where the streak begins.
  assert.deepEqual(D.rekke(sett(ONS), ONS).hvile, []);
  assert.deepEqual(D.rekke(sett(MAN, ONS), ONS), { rekke: 2, hvile: [ONS - 1], spiltIDag: true });
});

test("the examples in rusj/DAGLIG.md give what the document says", () => {
  const [son, tir, tor, fre, lor] = [MAN - 1, MAN + 1, MAN + 3, MAN + 4, MAN - 2];
  const tabell = [
    [ONS, [MAN, tir], 2, []],
    [ONS, [son, MAN, ONS], 3, [tir]],
    [ONS, [son, MAN], 2, [tir]],
    [ONS, [lor, son, ONS], 1, []],
    [ONS, [lor, son], 0, []],
    [tir, [MAN - 3, lor, tir], 3, [MAN, son]],
    [fre, [son, MAN, ONS, fre], 2, [tor]],
  ];
  for (const [iDag, spilt, ventet, hvile] of tabell) {
    const r = D.rekke(new Set(spilt), iDag);
    assert.deepEqual([r.rekke, r.hvile], [ventet, hvile], `i dag ${iDag}, spilt ${spilt}`);
  }
});

test("the week dots: Monday to Sunday, with rest days, and words that only say what was done", () => {
  const dager = sett(MAN - 1, MAN, ONS);
  const r = D.rekke(dager, ONS);
  const prikker = D.ukeprikker(dager, r.hvile, ONS);
  assert.equal(prikker.length, 7);
  assert.deepEqual(prikker.map((p) => p.tilstand), ["spilt", "hvile", "spilt", "kommer", "kommer", "kommer", "kommer"]);
  assert.deepEqual(prikker.map((p) => p.iDag), [false, false, true, false, false, false, false]);
  assert.equal(prikker[0].nr, MAN);
  assert.equal(D.ukeTekst(prikker), "Denne uka: spilt mandag og onsdag. Hviledag tirsdag.");
  // A missed day that is not a rest day is just an empty dot – and is not mentioned.
  const tomme = D.ukeprikker(sett(ONS), [], ONS);
  assert.deepEqual(tomme.map((p) => p.tilstand).slice(0, 3), ["tom", "tom", "spilt"]);
  assert.equal(D.ukeTekst(tomme), "Denne uka: spilt onsdag.");
  assert.equal(D.ukeTekst(D.ukeprikker(sett(), [], MAN)), "Denne uka: ingen dager ennå.");
  assert.equal(D.ukeTekst(D.ukeprikker(sett(MAN, MAN + 1, ONS), [], ONS)), "Denne uka: spilt mandag, tirsdag og onsdag.");
});

const IDER = ["ordugla", "blyanten", "tallknuseren"];

test("reading rusj.daglig, old format: finished today or not, and the days the games' own streaks tell of", () => {
  const st = D.status({ ordugla: { nr: ONS, vunnet: true, rekke: 3 }, blyanten: { nr: ONS - 1, vunnet: true, rekke: 5 }, tallknuseren: { nr: ONS - 9, vunnet: true, rekke: 2 } }, IDER, ONS);
  assert.deepEqual(st.spill.map((s) => s.tilstand), ["ferdig", "ny", "ny"]);
  assert.deepEqual([st.antall, st.ferdige, st.pagar, st.noenGang], [3, 1, 0, true]);
  assert.deepEqual(st.spill[0], { id: "ordugla", tilstand: "ferdig", vunnet: true, res: "", tekst: "", rekke: 3 });
  assert.equal(st.spill[1].rekke, 5, "a game's streak is alive when it was finished yesterday");
  assert.equal(st.spill[2].rekke, 0);
  // Ordugla: three days ending today. Blyanten: five days ending yesterday. Tallknuseren: two, long ago.
  assert.deepEqual([...st.dager].sort((a, b) => a - b), [ONS - 10, ONS - 9, ONS - 5, ONS - 4, ONS - 3, ONS - 2, ONS - 1, ONS]);
  assert.equal(D.rekke(st.dager, ONS).rekke, 6);
  // A lost daily (rekke 0) still counts as a day played.
  assert.deepEqual([...D.status({ ordugla: { nr: ONS, vunnet: false, rekke: 0 } }, IDER, ONS).dager], [ONS]);
});

test("reading rusj.daglig, new format: the result, a daily in progress and the kit's day log", () => {
  const raa = {
    ordugla: { nr: ONS, vunnet: true, rekke: 2, res: "4/6" },
    blyanten: { nr: ONS - 1, vunnet: true, rekke: 1, res: "0:52", pagar: { nr: ONS, tekst: "5 av 8 ord" } },
    tallknuseren: { pagar: { nr: ONS - 1, tekst: "4:12" } }, // started yesterday, never finished: new today
    _: { v: 1, dager: { [ONS]: ["ordugla"], [ONS - 1]: ["ordugla", "blyanten"], [ONS - 3]: ["tallknuseren"], [ONS - 4]: [] }, best: 9 },
  };
  const st = D.status(raa, IDER, ONS);
  assert.deepEqual(st.spill, [
    { id: "ordugla", tilstand: "ferdig", vunnet: true, res: "4/6", tekst: "", rekke: 2 },
    { id: "blyanten", tilstand: "pagar", vunnet: false, res: "", tekst: "5 av 8 ord", rekke: 1 },
    { id: "tallknuseren", tilstand: "ny", vunnet: false, res: "", tekst: "", rekke: 0 },
  ]);
  assert.deepEqual([st.ferdige, st.pagar, st.noenGang], [1, 1, true]);
  assert.deepEqual([...st.dager].sort((a, b) => a - b), [ONS - 3, ONS - 1, ONS], "a day with an empty list was not played");
  assert.deepEqual(D.rekke(st.dager, ONS), { rekke: 3, hvile: [ONS - 2], spiltIDag: true });
  // «pagar» is ignored once the daily is finished the same day.
  assert.equal(D.status({ ordugla: { nr: ONS, vunnet: true, rekke: 1, res: "3/6", pagar: { nr: ONS, tekst: "2/6" } } }, IDER, ONS).spill[0].tilstand, "ferdig");
  // Only a daily in progress: not «has finished one», but in progress today.
  const bare = D.status({ ordugla: { pagar: { nr: ONS, tekst: "2/6" } } }, IDER, ONS);
  assert.deepEqual([bare.noenGang, bare.pagar, bare.ferdige], [false, 1, 0]);
  // The log alone (a game that is no longer on the page) still says «has played before».
  assert.equal(D.status({ _: { dager: { [ONS - 20]: ["gammelt"] } } }, IDER, ONS).noenGang, true);
});

test("reading rusj.daglig: nothing in storage is trusted", () => {
  const tom = { spill: IDER.map((id) => ({ id, tilstand: "ny", vunnet: false, res: "", tekst: "", rekke: 0 })), antall: 3, ferdige: 0, pagar: 0, noenGang: false };
  for (const raa of [null, undefined, 7, "tekst", [], [1, 2], { ordugla: null, blyanten: "x", tallknuseren: [1] }, { ordugla: { nr: "20768" } }, { ordugla: { nr: 1.5 } }, { ordugla: { nr: -3 } }, { _: null }, { _: { dager: "x" } }, { _: { dager: { abc: ["x"], "-4": ["x"], 1.5: ["x"] } } }]) {
    const { dager, ...rest } = D.status(raa, IDER, ONS);
    assert.deepEqual(rest, tom, JSON.stringify(raa));
    assert.equal(dager.size, 0, JSON.stringify(raa));
  }
  // A day in the future (the clock was wrong once) is neither «today» nor a played day.
  const frem = D.status({ ordugla: { nr: ONS + 2, vunnet: true, rekke: 4 }, _: { dager: { [ONS + 2]: ["ordugla"] } } }, IDER, ONS);
  assert.deepEqual([frem.spill[0].tilstand, frem.dager.size, frem.noenGang], ["ny", 0, false]);
  // Texts are cut to 14 characters, emoji whole, and line breaks become spaces; odd types are dropped.
  const lang = D.status({ ordugla: { nr: ONS, vunnet: true, rekke: 99999, res: "  et veldig\nlangt resultat  " }, blyanten: { pagar: { nr: ONS, tekst: "🦉🦉🦉🦉🦉🦉🦉🦉🦉🦉🦉🦉🦉🦉🦉🦉" } }, tallknuseren: { nr: ONS, res: { a: 1 } } }, IDER, ONS);
  assert.equal(lang.spill[0].res, "et veldig lang");
  assert.equal(lang.spill[0].rekke, 9999);
  assert.equal(Array.from(lang.spill[1].tekst).length, 14);
  assert.equal(lang.spill[2].res, "");
  // An absurd streak number does not make the page count for ever.
  assert.equal(lang.dager.size, D.MAKS_DAGER);
  // Names like «constructor» in the list of games do not find anything by accident.
  assert.equal(D.status({}, ["constructor", "toString"], ONS).ferdige, 0);
  // The log may also be a plain list of day numbers.
  assert.deepEqual([...D.status({ _: { dager: [ONS, ONS - 1, "x", ONS + 5] } }, IDER, ONS).dager].sort(), [ONS - 1, ONS]);
});

test("words: results read aloud, the state of a daily, the line under the week", () => {
  assert.equal(D.lesbart("4/6"), "4 av 6");
  assert.equal(D.lesbart("3:42"), "3 minutter og 42 sekunder");
  assert.equal(D.lesbart("0:52"), "52 sekunder");
  assert.equal(D.lesbart("1:00"), "1 minutt");
  assert.equal(D.lesbart("1:01"), "1 minutt og 1 sekund");
  assert.equal(D.lesbart("5 av 8 ord"), "5 av 8 ord");
  assert.deepEqual(D.tilstandTekst({ tilstand: "ferdig", vunnet: true, res: "4/6" }), { kort: "4/6", lang: "løst, 4 av 6" });
  assert.deepEqual(D.tilstandTekst({ tilstand: "ferdig", vunnet: true, res: "" }), { kort: "Løst", lang: "løst" });
  assert.deepEqual(D.tilstandTekst({ tilstand: "ferdig", vunnet: false, res: "" }), { kort: "Ferdig", lang: "ferdig" });
  assert.deepEqual(D.tilstandTekst({ tilstand: "pagar", tekst: "2/6" }), { kort: "I gang · 2/6", lang: "i gang, 2 av 6" });
  assert.deepEqual(D.tilstandTekst({ tilstand: "pagar", tekst: "" }), { kort: "I gang", lang: "i gang" });
  assert.deepEqual(D.tilstandTekst({ tilstand: "ny" }), { kort: "Ny", lang: "ny" });
  assert.equal(D.tallord(1), "én");
  assert.equal(D.tallord(3), "tre");
  assert.equal(D.tallord(13), "13");

  const st = (ferdige, antall = 3) => ({ antall, ferdige });
  assert.deepEqual(D.statuslinje(st(3), { rekke: 5, spiltIDag: true }), { tekst: "Nye oppgaver om", klokke: true });
  assert.deepEqual(D.statuslinje(st(1), { rekke: 5, spiltIDag: true }), { tekst: "To igjen i dag.", klokke: false });
  assert.deepEqual(D.statuslinje(st(2), { rekke: 1, spiltIDag: true }), { tekst: "Én igjen i dag.", klokke: false });
  assert.equal(D.statuslinje(st(0), { rekke: 5, spiltIDag: false }).tekst, "Én oppgave i dag holder rekka i gang.");
  assert.equal(D.statuslinje(st(0), { rekke: 1, spiltIDag: false }).tekst, "Én oppgave i dag, så er det to dager på rad.");
  // A broken streak is a new start – nothing about what was lost.
  assert.equal(D.statuslinje(st(0), { rekke: 0, spiltIDag: false }).tekst, "Ny rekke starter i dag.");
});

test("«Del dagen»: results without answers, the count, and the streak when there is one", () => {
  const iDag = D.dag(new Date("2026-11-11T09:00:00Z"));
  const alle = [
    { navn: "Dagens ord", tilstand: "ferdig", vunnet: true, res: "4/6" },
    { navn: "Minikryss", tilstand: "ferdig", vunnet: true, res: "0:52" },
    { navn: "Sudoku", tilstand: "ferdig", vunnet: true, res: "" },
  ];
  assert.equal(D.delTekst({ iDag, linjer: alle, rekke: 12 }), "rusj i dag · onsdag 11. november\nDagens ord: 4/6\nMinikryss: 0:52\nSudoku: løst\nDagen er i boks – 3 av 3 · 🔥 12 dager på rad");
  const noen = [alle[0], { navn: "Minikryss", tilstand: "pagar", vunnet: false, res: "" }, { navn: "Sudoku", tilstand: "ny", vunnet: false, res: "" }];
  assert.equal(D.delTekst({ iDag, linjer: noen, rekke: 1 }), "rusj i dag · onsdag 11. november\nDagens ord: 4/6\n1 av 3 i dag");
  assert.equal(D.delTekst({ iDag, linjer: [{ navn: "Dagens ord", tilstand: "ferdig", vunnet: false, res: "" }], rekke: 0 }), "rusj i dag · onsdag 11. november\nDagens ord: ferdig\nDagen er i boks – 1 av 1");
});
