// From counters to the numbers the owner sees. Every figure is checked against hand sums.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sammendrag, tidsfordeling, medianFraGrupper, tall } from "../src/tall.js";
import { adminSide, tavle, stolper, akse, esc } from "../src/side.js";
import { hentSammendrag, handter } from "../src/index.js";
import { DAGER_TILBAKE } from "../src/oppsett.js";
import { flytt, dagene, ukeStart, maanedStart } from "../src/dato.js";
import { falskD1, NAA } from "./falsk-d1.mjs";
import { OPPSETT } from "./fast-oppsett.mjs";

const I_DAG = "2026-11-11"; // a Wednesday
// The summary with the fixed game list of the tests (three dailies).
const sammendragFast = (rader, iDag, valg = {}) => sammendrag(rader, iDag, { oppsett: OPPSETT, ...valg });
const rad = (dag, nokkel, n) => ({ dag, nokkel, n });
const dag = (d, tellere) => Object.entries(tellere).map(([nokkel, n]) => rad(d, nokkel, n));

// Yesterday as in the example sentence: 132 phones, 41 of them were also here the day before.
const I_GAR = dag("2026-11-10", {
  "enhet.ny": 60, "enhet.igar": 41, "enhet.uke": 17, "enhet.lenge": 14,
  "unik.uke": 80, "unik.mnd": 70, app: 9,
  besok: 150, "tid.1": 100, "tid.3": 60, "tid.10": 20, "tid.30": 5,
  "side.forside": 140, "side.annet": 6, "side.ordugla": 70, "side.sauen": 40, "side.luringen": 12,
  "start.ordugla": 50, "ferdig.ordugla": 45, "start.sauen": 30, "ferdig.sauen": 10,
  "daglig.ordugla": 44, "daglig.blyanten": 20, "daglig.tallknuseren": 9,
  "dagens.1": 48, "dagens.2": 19, "dagens.3": 6,
  "rekke.1": 20, "rekke.2": 12, "rekke.4": 8, "rekke.7": 5, "rekke.14": 2, "rekke.30": 1,
});
const FORGARS = dag("2026-11-09", { "enhet.ny": 100, "enhet.igar": 20, besok: 130, "unik.uke": 120, "unik.mnd": 90, "side.forside": 120, "start.sauen": 5 });
const I_DAG_RADER = dag(I_DAG, { "enhet.ny": 10, "enhet.igar": 13, besok: 25, "unik.uke": 12, "unik.mnd": 9, "side.forside": 30, "tid.1": 4 });

test("the sentence at the top: «I går var 132 innom, 41 av dem var også her dagen før.»", () => {
  const s = sammendragFast([...I_GAR, ...FORGARS, ...I_DAG_RADER], I_DAG);
  assert.equal(s.setning, "I går var 132 innom, 41 av dem var også her dagen før.");
  assert.equal(s.hittil, "Hittil i dag: 23 innom.");
  assert.equal(s.harTall, true);
});

test("the sentence explains itself when numbers are missing", () => {
  assert.equal(sammendragFast([], I_DAG).setning, "Ingen tall ennå. De kommer når tellingen er slått på på rusj.no.");
  assert.equal(sammendragFast([], I_DAG).hittil, "");
  assert.equal(sammendragFast(I_DAG_RADER, I_DAG).setning, "I går ble ingen talt.");
  assert.equal(sammendragFast(dag("2026-11-10", { "enhet.ny": 7 }), I_DAG).setning, "I går var 7 innom. Ingen av dem var her dagen før.");
  // Page views but no phone counts (the client runs without its note): say so instead of «0 innom».
  const bareSider = sammendragFast(dag("2026-11-10", { "side.forside": 300, "side.ordugla": 12 }), I_DAG);
  assert.equal(bareSider.setning, "I går ble 312 sider åpnet. Hvor mange som var innom, ble ikke talt.");
  assert.equal(sammendragFast(dag(I_DAG, { "side.forside": 5 }), I_DAG).hittil, "Hittil i dag: 5 sider åpnet.");
  assert.equal(sammendragFast(FORGARS, I_DAG).hittil, "Ingen er talt i dag ennå.");
  assert.equal(sammendragFast(dag("2026-11-10", { "enhet.ny": 1234, "enhet.igar": 1000 }), I_DAG).setning, "I går var 2 234 innom, 1 000 av dem var også her dagen før.");
});

test("the four periods cover the right days", () => {
  const p = sammendragFast([], I_DAG).perioder;
  assert.deepEqual(p.map((x) => [x.id, x.navn, x.fra, x.til, x.antallDager]), [
    ["idag", "I dag", "2026-11-11", "2026-11-11", 1],
    ["igar", "I går", "2026-11-10", "2026-11-10", 1],
    ["d7", "Siste 7 dager", "2026-11-04", "2026-11-10", 7],
    ["d30", "Siste 30 dager", "2026-10-12", "2026-11-10", 30],
  ]);
  // Today is never part of «last 7/30 days»: only whole days.
  const s = sammendragFast([...I_GAR, ...I_DAG_RADER], I_DAG);
  assert.equal(s.perioder[2].besok, 150);
  assert.equal(s.perioder[0].besok, 25);
});

test("yesterday: visits, phones, new phones and pages are plain sums", () => {
  const p = sammendragFast([...I_GAR, ...FORGARS], I_DAG).perioder[1];
  assert.equal(p.enheter, 132);
  assert.equal(p.enheterPerDag, 132);
  assert.equal(p.besok, 150);
  assert.equal(p.nye, 60);
  assert.equal(p.sider, 140 + 6 + 70 + 40 + 12);
  assert.equal(p.forside, 140);
  assert.deepEqual(p.serie, [{ dag: "2026-11-10", enheter: 132, besok: 150 }]);
});

test("returning: next-day and within-a-week come straight from the phones' own categories", () => {
  const p = sammendragFast([...I_GAR, ...FORGARS], I_DAG).perioder[1];
  assert.deepEqual({ ny: p.tilbake.ny, igar: p.tilbake.igar, uke: p.tilbake.uke, lenge: p.tilbake.lenge }, { ny: 60, igar: 41, uke: 17, lenge: 14 });
  // 120 phones were here the day before; 41 of them came back: 34 %.
  assert.deepEqual(p.tilbake.nesteDag, { teller: 41, nevner: 120, prosent: 34 });
  // 41 + 17 = 58 of yesterday's 132 phones had been here during the week before: 44 %.
  assert.deepEqual(p.tilbake.innenUke, { teller: 58, nevner: 132, prosent: 44 });
});

test("returning over several days: each day is compared with the day before it", () => {
  const rader = [
    ...dag("2026-11-03", { "enhet.ny": 50 }), // the day before the 7-day period: only a denominator
    ...dag("2026-11-04", { "enhet.ny": 10, "enhet.igar": 30 }),
    ...dag("2026-11-05", { "enhet.igar": 20, "enhet.uke": 5 }),
    ...dag("2026-11-10", { "enhet.lenge": 4, "enhet.igar": 0 }),
  ];
  const p = sammendragFast(rader, I_DAG).perioder[2];
  assert.equal(p.enheter, 40 + 25 + 4);
  assert.equal(p.enheterPerDag, Math.round(69 / 7));
  // Came back the next day: 30 (of the 50 on the 3rd) + 20 (of the 40 on the 4th) + 0 (of 25 on the 5th) …
  assert.deepEqual(p.tilbake.nesteDag, { teller: 50, nevner: 50 + 40 + 25, prosent: 43 });
  assert.deepEqual(p.tilbake.innenUke, { teller: 55, nevner: 69, prosent: 80 });
});

test("a percentage is «unknown» without a denominator and never above 100", () => {
  const forste = sammendragFast(dag("2026-11-10", { "enhet.ny": 9, "enhet.igar": 3 }), I_DAG).perioder[1];
  assert.deepEqual(forste.tilbake.nesteDag, { teller: 3, nevner: 0, prosent: null });
  const rart = sammendragFast([...dag("2026-11-09", { "enhet.ny": 2 }), ...dag("2026-11-10", { "enhet.igar": 5 })], I_DAG).perioder[1];
  assert.equal(rart.tilbake.nesteDag.prosent, 100);
  assert.equal(sammendragFast([], I_DAG).perioder[1].app.prosent, null);
});

test("most played: ranked by rounds started, then by pages opened; names from the config", () => {
  const p = sammendragFast([...I_GAR, ...FORGARS], I_DAG).perioder[1];
  assert.deepEqual(p.spill, [
    { id: "ordugla", navn: "Ordugla", startet: 50, ferdig: 45, apnet: 70 },
    { id: "sauen", navn: "Sauen", startet: 30, ferdig: 10, apnet: 40 },
    { id: "luringen", navn: "Luringen", startet: 0, ferdig: 0, apnet: 12 },
  ]);
  // Across days the counters are added; a game with nothing in the period is not listed.
  const uke = sammendragFast([...I_GAR, ...FORGARS], I_DAG).perioder[2];
  assert.equal(uke.spill.find((s) => s.id === "sauen").startet, 35);
  assert.equal(uke.spill.length, 3);
  // An id that is no longer in the config is shown by its id rather than hidden.
  const gammelt = sammendragFast(dag("2026-11-10", { "start.nedlagt": 3 }), I_DAG).perioder[1];
  assert.deepEqual(gammelt.spill, [{ id: "nedlagt", navn: "nedlagt", startet: 3, ferdig: 0, apnet: 0 }]);
});

test("time: groups are differences between the steps, and they add up to the visits", () => {
  const t = sammendragFast(I_GAR, I_DAG).perioder[1].tid;
  // 150 visits; 100 passed 1 min, 60 passed 3, 20 passed 10, 5 passed 30.
  assert.deepEqual(t.grupper.map((g) => [g.navn, g.antall, g.prosent]), [
    ["Under 1 minutt", 50, 33],
    ["1–3 minutter", 40, 27],
    ["3–10 minutter", 40, 27],
    ["10–30 minutter", 15, 10],
    ["Over 30 minutter", 5, 3],
  ]);
  assert.equal(t.totalt, 150);
  // The middle visit is number 75: the 25th of the 40 in «1–3 minutes» → 1 + 25/40 × 2 = 2.25 → 2.3.
  assert.deepEqual(t.median, { minutter: 2.3 });
});

test("the median estimate from groups", () => {
  assert.equal(medianFraGrupper([0, 0, 0, 0, 0]), null);
  assert.deepEqual(medianFraGrupper([10, 0, 0, 0, 0]), { minutter: 0.5 });
  assert.deepEqual(medianFraGrupper([0, 10, 0, 0, 0]), { minutter: 2 });
  assert.deepEqual(medianFraGrupper([0, 0, 10, 0, 0]), { minutter: 6.5 });
  assert.deepEqual(medianFraGrupper([0, 0, 0, 10, 0]), { minutter: 20 });
  assert.deepEqual(medianFraGrupper([0, 0, 0, 0, 10]), { over: 30 }, "the open group has no upper end: only «over 30»");
  assert.deepEqual(medianFraGrupper([1, 0, 0, 0, 3]), { over: 30 });
  assert.deepEqual(medianFraGrupper([5, 5, 0, 0, 0]), { minutter: 1 });
  assert.deepEqual(medianFraGrupper([1, 1, 1, 1, 1]), { minutter: 6.5 });
});

test("time: lost messages never give negative groups", () => {
  const t = tidsfordeling(10, [12, 3, 5, 1]);
  assert.deepEqual(t.grupper.map((g) => g.antall), [0, 9, 0, 4, 1]);
  assert.equal(t.totalt, 14);
  assert.deepEqual(tidsfordeling(0, [0, 0, 0, 0]), { totalt: 0, grupper: t.grupper.map((g) => ({ ...g, antall: 0, prosent: null })), median: null });
});

test("daily puzzles: finished per game, how many of today's, and streak groups", () => {
  const d = sammendragFast(I_GAR, I_DAG).perioder[1].daglig;
  assert.equal(d.antallDaglige, 3);
  assert.deepEqual(d.spill, [
    { id: "ordugla", navn: "Ordugla", fullfort: 44 },
    { id: "blyanten", navn: "Blyanten", fullfort: 20 },
    { id: "tallknuseren", navn: "Tallknuseren", fullfort: 9 },
  ]);
  assert.deepEqual(d.minst, [{ n: 1, antall: 48 }, { n: 2, antall: 19 }, { n: 3, antall: 6 }]);
  assert.equal(d.minstEn, 48);
  assert.equal(d.alle, 6, "«did all of today's» is the counter for the last one");
  assert.deepEqual(d.rekker.map((r) => [r.navn, r.antall]), [["1 dag", 20], ["2–3 dager", 12], ["4–6 dager", 8], ["7–13 dager", 5], ["14–29 dager", 2], ["30 dager eller mer", 1]]);
  assert.equal(d.rekker.reduce((s, r) => s + r.antall, 0), d.minstEn, "everyone who finished at least one has one streak group");
});

test("dailies follow the config, and a daily that is newer than the config still shows", () => {
  const rader = dag("2026-11-10", { "daglig.ordugla": 5, "daglig.sauen": 2, "dagens.1": 6, "dagens.2": 1, "dagens.4": 1, "rekke.1": 6 });
  const d = sammendragFast(rader, I_DAG).perioder[1].daglig;
  assert.deepEqual(d.spill.map((s) => [s.id, s.fullfort]), [["ordugla", 5], ["blyanten", 0], ["tallknuseren", 0], ["sauen", 2]]);
  assert.deepEqual(d.minst, [{ n: 1, antall: 6 }, { n: 2, antall: 1 }, { n: 3, antall: 0 }, { n: 4, antall: 1 }]);
  assert.equal(d.alle, 0, "«all» is the config's number of dailies: three here");
  const seks = sammendrag(rader, I_DAG, { oppsett: { SPILL: OPPSETT.SPILL, DAGLIGE: ["ordugla", "sauen"] } }).perioder[1].daglig;
  assert.equal(seks.alle, 1);
  assert.equal(seks.antallDaglige, 2);
});

test("installed: share of the day's phones that ran rusj from the home screen", () => {
  assert.deepEqual(sammendragFast(I_GAR, I_DAG).perioder[1].app, { antall: 9, av: 132, prosent: 7 });
});

test("week and month: different phones, added up from «first time this week/month»", () => {
  const rader = [
    ...dag("2026-10-01", { "unik.mnd": 500, "unik.uke": 300 }),
    ...dag("2026-10-31", { "unik.mnd": 40, "unik.uke": 20 }),
    ...dag("2026-11-01", { "unik.mnd": 200, "unik.uke": 15 }), // a Sunday: last day of the week before last
    ...dag("2026-11-02", { "unik.mnd": 100, "unik.uke": 150 }), // Monday of last week
    ...dag("2026-11-08", { "unik.mnd": 10, "unik.uke": 30 }), // Sunday of last week
    ...dag("2026-11-09", { "unik.mnd": 5, "unik.uke": 90 }), // Monday of this week
    ...dag("2026-11-11", { "unik.mnd": 1, "unik.uke": 12 }),
  ];
  const k = sammendragFast(rader, I_DAG).kalender;
  assert.deepEqual(k.map((x) => [x.id, x.navn, x.fra, x.til, x.enheter]), [
    ["uka", "Denne uka (hittil)", "2026-11-09", "2026-11-11", 102],
    ["forrigeUke", "Forrige uke", "2026-11-02", "2026-11-08", 180],
    ["maaneden", "November (hittil)", "2026-11-01", "2026-11-11", 316],
    ["forrigeMaaned", "Oktober", "2026-10-01", "2026-10-31", 540],
  ]);
  // Over the turn of the year.
  const jan = sammendragFast([], "2027-01-01").kalender;
  assert.deepEqual([jan[2].navn, jan[3].navn, jan[3].fra, jan[3].til], ["Januar (hittil)", "Desember", "2026-12-01", "2026-12-31"]);
  assert.deepEqual([jan[0].fra, jan[1].fra, jan[1].til], ["2026-12-28", "2026-12-21", "2026-12-27"]);
});

test("the window the Worker reads is wide enough for every period on the page", () => {
  for (const d of dagene("2026-01-01", "2027-03-01")) {
    const eldste = [flytt(d, -31), flytt(ukeStart(d), -7), maanedStart(flytt(maanedStart(d), -1))].sort()[0];
    assert.ok(flytt(d, -DAGER_TILBAKE) <= eldste, d);
  }
});

test("rows for the same counter are added, and text numbers are read as numbers", () => {
  const s = sammendragFast([rad("2026-11-10", "besok", 2), rad("2026-11-10", "besok", "3"), rad("2026-11-10", "enhet.ny", 1)], I_DAG);
  assert.equal(s.perioder[1].besok, 5);
});

test("numbers are written the Norwegian way", () => {
  assert.equal(tall(0), "0");
  assert.equal(tall(999), "999");
  assert.equal(tall(1000), "1 000");
  assert.equal(tall(1234567), "1 234 567");
  assert.equal(tall(12.6), "13");
  assert.equal(tall(undefined), "0");
});

// ---------- From the database to the page ----------

test("the Worker reads the last 62 days and the oldest day, and nothing else", async () => {
  const db = falskD1();
  for (const r of [...I_GAR, ...FORGARS, ...I_DAG_RADER]) db.sett(r.dag, r.nokkel, r.n);
  db.sett("2025-03-01", "besok", 999); // far outside the window: only its date is used
  const s = await hentSammendrag(db, NAA);
  assert.equal(s.iDag, I_DAG);
  assert.equal(s.forsteDag, "2025-03-01");
  assert.equal(s.setning, "I går var 132 innom, 41 av dem var også her dagen før.");
  assert.deepEqual(db.logg.map((l) => l.args), [["2026-09-10", "2026-11-11"], []]);
  assert.equal((await hentSammendrag(falskD1(), NAA)).forsteDag, null);
});

test("data.json carries exactly the numbers of the summary", async () => {
  const db = falskD1();
  for (const r of [...I_GAR, ...FORGARS]) db.sett(r.dag, r.nokkel, r.n);
  const NOKKEL = "x".repeat(40);
  const svar = await handter(new Request("https://stat.example/admin/data.json", { headers: { "X-Admin-Nokkel": NOKKEL } }), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA);
  const json = await svar.json();
  const { hentet, oppbevaringMaaneder, ...resten } = json;
  assert.equal(hentet, NAA.toISOString());
  assert.equal(oppbevaringMaaneder, 25);
  assert.deepEqual(resten, JSON.parse(JSON.stringify(sammendrag([...I_GAR, ...FORGARS], I_DAG, { forsteDag: "2026-11-09" }))));
});

test("the page shows the numbers from the counters", () => {
  const data = sammendragFast([...I_GAR, ...FORGARS, ...I_DAG_RADER], I_DAG, { forsteDag: "2026-11-09" });
  const html = tavle(data, { klokke: "13:00", innlogging: "nokkel" });
  const igar = /<div class="panel panel-igar">([\s\S]*?)<div class="panel panel-d7">/.exec(html)[1].replace(/ /g, " ");
  assert.match(html, /I går var <b>132<\/b> innom, <b>41<\/b> av dem var også her dagen før\./);
  assert.match(html, /Hittil i dag: 23 innom\./);
  assert.match(html, /Tellingen har tall fra og med 9\. november 2026\./);
  assert.match(igar, /<dt>Enheter innom<\/dt><dd>132<small>anslag<\/small>/);
  assert.match(igar, /<dt>Besøk<\/dt><dd>150</);
  assert.match(igar, /<dt>Nye enheter<\/dt><dd>60</);
  assert.match(igar, /<dt>Sider åpnet<\/dt><dd>268</);
  assert.match(igar, /<dt>Tilbake dagen etter<\/dt><dd>34 %<small>41 av 120 som var her dagen før/);
  assert.match(igar, /<dt>Var her uka før<\/dt><dd>44 %<small>58 av 132 enheter/);
  assert.match(igar, /Ordugla<\/span><span class="rad-tall">50<small>startet<\/small><\/span><progress max="50" value="50"/);
  assert.match(igar, /Sauen<\/span><span class="rad-tall">30<small>startet<\/small><\/span><progress max="50" value="30"/);
  assert.match(igar, /åpnet 70 · spilt ferdig 45/);
  assert.match(igar, /Forsiden ble åpnet 140 ganger\./);
  assert.match(igar, /Et typisk besøk varer<\/dt><dd>ca\. 2,3 minutter<small>anslag/);
  assert.match(igar, /1–3 minutter<\/span><span class="rad-tall">40<small>27 %<\/small>/);
  assert.match(igar, /Fullførte alle tre<\/span><span class="rad-tall">6</);
  assert.match(igar, /Fullførte minst én<\/span><span class="rad-tall">48</);
  assert.match(igar, /7–13 dager<\/span><span class="rad-tall">5</);
  assert.match(igar, /<b>9 av 132<\/b> enheter \(7 %\) åpnet rusj fra hjemskjermen/);
  // Four tabs, the 7-day one chosen, and every period present.
  assert.equal(html.match(/<div class="panel panel-/g).length, 4);
  assert.match(html, /id="p-d7" checked/);
});

test("empty states explain themselves", () => {
  const html = adminSide({ data: sammendragFast([], I_DAG), nonce: "n", klokke: "13:00", innlogging: "nokkel", nokkelPaa: true });
  for (const tekst of [
    "Ingen tall ennå. De kommer når tellingen er slått på på rusj.no.",
    "Ingen enheter er talt ennå. Tallene for uke og måned kommer her.",
    "Ingen er talt i denne perioden.",
    "Ingen tall ennå. Dette fylles ut når enheter har vært innom",
    "Ingen spill er åpnet eller startet i denne perioden.",
    "Ingen besøk er talt i denne perioden.",
    "Ingen har fullført en av dagens oppgaver i denne perioden.",
    "Ingen enheter er talt i denne perioden.",
    "Slik leser du tallene",
    "Tall som er eldre enn 25 måneder, slettes automatisk.",
  ]) {
    assert.ok(html.includes(tekst), tekst);
  }
  assert.doesNotMatch(html, /NaN|undefined|null|Infinity/);
  assert.doesNotMatch(html, /<svg/, "no chart without numbers");
});

test("a percentage that cannot be worked out is shown as a dash, with the reason", () => {
  const data = sammendragFast(dag("2026-11-10", { "enhet.ny": 9, besok: 9 }), I_DAG);
  const html = tavle(data, { klokke: "13:00", innlogging: "nokkel" });
  assert.match(html, /<dt>Tilbake dagen etter<\/dt><dd>–<small>ingen ble talt dagen før/);
  assert.doesNotMatch(html, /NaN|undefined|null %/);
});

test("the bar chart: one bar per day, heights in proportion, labels on the tallest and the last", () => {
  const serie = dagene("2026-11-04", "2026-11-10").map((d, i) => ({ dag: d, enheter: [10, 20, 80, 40, 0, 30, 50][i] }));
  const svg = stolper(serie, "enheter", "s-enheter", "Enheter innom per dag");
  assert.equal(svg.match(/<g class="s-stolpe">/g).length, 7);
  assert.equal(svg.match(/<path class="s-enheter"/g).length, 6, "a day with 0 draws no bar");
  assert.match(svg, /aria-label="Enheter innom per dag, 4\. nov til 10\. nov\. Høyest: 80 \(fre 6\. nov\)\."/);
  assert.match(svg, /<title>fre 6\. nov: 80<\/title>/);
  assert.deepEqual([...svg.matchAll(/class="s-verdi"[^>]*>([^<]+)</g)].map((m) => m[1]), ["80", "50"]);
  assert.deepEqual([...svg.matchAll(/class="s-akse"[^>]*text-anchor="middle">([^<]+)</g)].map((m) => m[1]), ["ons", "tor", "fre", "lør", "søn", "man", "tir"]);
  // Bar heights: the plot is 112 units tall and the axis tops at 80.
  const hoyder = [...svg.matchAll(/<path class="s-enheter" d="M[\d.]+ ([\d.]+)V[\d.]+Q[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]) - Number(m[2]));
  assert.deepEqual(hoyder.map((h) => Math.round(h * 10) / 10), [14, 28, 112, 56, 42, 70]);
  assert.match(stolper(serie.map((d) => ({ ...d, enheter: 0 })), "enheter", "s-enheter", "x"), /Ingen tall for disse dagene ennå/);
  // 30 days: thin bars, three date labels.
  const lang = dagene("2026-10-12", "2026-11-10").map((d, i) => ({ dag: d, enheter: 100 + i }));
  const svg30 = stolper(lang, "enheter", "s-enheter", "x");
  assert.equal(svg30.match(/<g class="s-stolpe">/g).length, 30);
  assert.deepEqual([...svg30.matchAll(/class="s-akse"[^>]*text-anchor="(?:start|middle|end)">([^<]+)</g)].map((m) => m[1]).slice(-3), ["12. okt", "26. okt", "10. nov"]);
});

test("the axis tops at a round number at or above the largest value", () => {
  for (const [maks, topp, steg] of [[1, 1, 1], [3, 3, 1], [4, 4, 1], [5, 6, 2], [7, 8, 2], [12, 15, 5], [48, 60, 20], [100, 100, 50], [132, 150, 50], [950, 1000, 500], [1200, 1500, 500], [70000, 80000, 20000]]) {
    assert.deepEqual(akse(maks), { topp, steg }, String(maks));
  }
  for (let m = 1; m < 3000; m += 7) {
    const a = akse(m);
    assert.ok(a.topp >= m && a.topp / a.steg <= 5 && Number.isInteger(a.topp / a.steg), String(m));
  }
});

test("everything from the counters is escaped on the page", () => {
  assert.equal(esc(`<b a="1" b='2'>&`), "&lt;b a=&quot;1&quot; b=&#39;2&#39;&gt;&amp;");
  const oppsett = { SPILL: { ordugla: '<img src=x onerror="alert(1)">' }, DAGLIGE: ["ordugla"] };
  const data = sammendrag(dag("2026-11-10", { "start.ordugla": 3, "enhet.ny": 2, "daglig.ordugla": 1, "dagens.1": 1, "start.<script>": 1 }), I_DAG, { oppsett });
  const html = tavle(data, { klokke: "13:00", innlogging: "nokkel" });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});
