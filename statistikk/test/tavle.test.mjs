// The dashboard for a chosen period: periods and comparisons, long periods from monthly totals,
// what is read from the database, the games table and its sparklines, new games, the groups, the
// health check and the page itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PERIODER, SORTERINGER, lesValg, periodeFor, vinduStart, planlegg, slaSammen, lagLager, byggTavle, endring, unike, sparkUker, nyeKandidater } from "../src/tavle.js";
import { hentTavle, handter, rullOpp, SQL } from "../src/index.js";
import { sjekkNett } from "../src/helse.js";
import { tavle, adminSide, spark, endringTekst } from "../src/side.js";
import { sammendrag } from "../src/tall.js";
import { NETT_HELSE, HELSE_FRIST_MS, DAGER_TILBAKE } from "../src/oppsett.js";
import { flytt, dagene, dagNr, manedene } from "../src/dato.js";
import { falskD1, falskHent, hentLogg, NAA } from "./falsk-d1.mjs";
import { OPPSETT } from "./fast-oppsett.mjs";

const I_DAG = "2026-11-11"; // a Wednesday; NAA is 13:00 that day
const rad = (dag, nokkel, n) => ({ dag, nokkel, n });
const dag = (d, tellere) => Object.entries(tellere).map(([nokkel, n]) => rad(d, nokkel, n));
const NOKKEL = "x".repeat(40);

// Made-up counters for every day from `fra` to `til`, the same each run: a few games, visits,
// phones, «first this week/month», and the new kinds of counters.
function mange(fra, til, { spill = ["ordugla", "sauen", "blyanten"], nye = true } = {}) {
  const ut = [];
  for (const d of dagene(fra, til)) {
    const x = dagNr(d);
    const t = { besok: 20 + (x % 7) * 3, "enhet.ny": 5 + (x % 3), "enhet.igar": 4 + (x % 5), "unik.uke": 2 + (x % 4), "unik.mnd": 1 + (x % 2), "side.forside": 30 + (x % 9) };
    for (const [i, id] of spill.entries()) {
      t["side." + id] = 3 + ((x + i) % 6);
      t["start." + id] = 2 + ((x * (i + 1)) % 5);
      t["ferdig." + id] = 1 + ((x + i) % 3);
    }
    if (nye) Object.assign(t, { "utgave.nb": 15, "utgave.en": 2, "type.mobil": 12, "type.pc": 5, "kilde.sok": 6, "kilde.direkte": 11, "app.ny": 1 + (x % 2) });
    ut.push(...dag(d, t));
  }
  return ut;
}
const fyll = (db, rader) => rader.forEach((r) => db.sett(r.dag, r.nokkel, r.n));
// The plain truth: every counter added up straight from the daily rows.
const sann = (rader, fra, til, nokkel) => rader.filter((r) => r.dag >= fra && r.dag <= til && (typeof nokkel === "string" ? r.nokkel === nokkel : nokkel.test(r.nokkel))).reduce((s, r) => s + r.n, 0);
const figur = (t, id) => t.nokkeltall.find((k) => k.id === id);

// ---------- Periods and comparisons ----------

test("the periods: whole days up to yesterday, and the same number of days just before", () => {
  assert.deepEqual(PERIODER.map((p) => p.id), ["7", "30", "90", "365", "alt"]);
  const p7 = periodeFor("7", I_DAG, "2025-01-01");
  assert.deepEqual([p7.fra, p7.til, p7.antallDager, p7.forrige], ["2026-11-04", "2026-11-10", 7, { fra: "2026-10-28", til: "2026-11-03" }]);
  const p30 = periodeFor("30", I_DAG, "2025-01-01");
  assert.deepEqual([p30.fra, p30.til, p30.forrige.fra, p30.forrige.til], ["2026-10-12", "2026-11-10", "2026-09-12", "2026-10-11"]);
  const p90 = periodeFor("90", I_DAG, "2025-01-01");
  assert.deepEqual([p90.fra, p90.forrige.fra, p90.forrige.til], ["2026-08-13", "2026-05-15", "2026-08-12"]);
  const p365 = periodeFor("365", I_DAG, "2025-01-01");
  assert.deepEqual([p365.fra, p365.til, p365.forrige.fra, p365.forrige.til], ["2025-11-11", "2026-11-10", "2024-11-11", "2025-11-10"]);
  for (const p of [p7, p30, p90, p365]) assert.equal(dagNr(p.forrige.til) - dagNr(p.forrige.fra) + 1, p.antallDager);
  // «Alt»: from the first day with counters, nothing to compare with.
  const alt = periodeFor("alt", I_DAG, "2026-03-02");
  assert.deepEqual([alt.fra, alt.til, alt.antallDager, alt.forrige], ["2026-03-02", "2026-11-10", dagNr("2026-11-10") - dagNr("2026-03-02") + 1, null]);
  assert.deepEqual([periodeFor("alt", I_DAG, null).fra, periodeFor("alt", I_DAG, I_DAG).fra], ["2026-11-10", "2026-11-10"]);
});

test("the address can only pick from the fixed lists", () => {
  assert.deepEqual(lesValg("30", "ferdig"), { periode: "30", sort: "ferdig" });
  for (const p of [null, "", "8", "365 ", "ALT", "-1", "<script>", "30;DROP"]) assert.equal(lesValg(p, null).periode, "7", String(p));
  for (const s of [null, "", "x", "startet desc", "__proto__"]) assert.equal(lesValg("7", s).sort, "startet", String(s));
  assert.deepEqual(SORTERINGER, ["startet", "ferdig", "prosent", "endring", "navn"]);
});

test("the change from the period before: +/− %, «ny» from nothing, and none without a period before", () => {
  assert.deepEqual(endring(120, 100), { ny: false, prosent: 20 });
  assert.deepEqual(endring(80, 100), { ny: false, prosent: -20 });
  assert.deepEqual(endring(5, 0), { ny: true, prosent: null });
  assert.deepEqual(endring(0, 0), { ny: false, prosent: 0 });
  assert.equal(endring(5, null), null);
  assert.deepEqual([endringTekst({ ny: false, prosent: 12 }), endringTekst({ ny: false, prosent: -5 }), endringTekst({ ny: true }), endringTekst({ ny: false, prosent: 0 }), endringTekst(null)], ["+12\u00a0%", "−5\u00a0%", "ny", "±0\u00a0%", ""]);
});

test("key figures and their comparison: plain sums over the two periods", () => {
  const rader = mange("2026-10-01", I_DAG);
  const lager = lagLager({ dagRader: rader, dagOmrader: [["2026-10-01", I_DAG]], forste: "2026-10-01" });
  const periode = periodeFor("7", I_DAG, "2026-10-01");
  const t = byggTavle(lager, { iDag: I_DAG, periode, W: vinduStart(periode, I_DAG), oppsett: OPPSETT });
  const sjekk = (id, nokkel) => {
    const f = figur(t, id);
    assert.equal(f.verdi, sann(rader, "2026-11-04", "2026-11-10", nokkel), id);
    assert.equal(f.forrige, sann(rader, "2026-10-28", "2026-11-03", nokkel), id);
    assert.deepEqual(f.endring, endring(f.verdi, f.forrige), id);
  };
  sjekk("besok", "besok");
  sjekk("unike", "unik.uke");
  sjekk("nye", "enhet.ny");
  sjekk("startet", /^start\./);
  sjekk("ferdig", /^ferdig\./);
  sjekk("installert", "app.ny");
  assert.equal(t.periode.kanSammenligne, true);
  // Counting began inside the period before: no comparison at all, rather than a misleading one.
  const ny = lagLager({ dagRader: rader.filter((r) => r.dag >= "2026-11-01"), dagOmrader: [["2026-10-01", I_DAG]], forste: "2026-11-01" });
  const t2 = byggTavle(ny, { iDag: I_DAG, periode: periodeFor("7", I_DAG, "2026-11-01"), W: "2026-09-10", oppsett: OPPSETT });
  assert.equal(t2.periode.kanSammenligne, false);
  assert.ok(t2.nokkeltall.every((k) => k.forrige === null && k.endring === null));
  assert.equal(t2.stiger.length + t2.faller.length, 0);
});

test("different phones: the weekly counter over 7 days, the monthly over 30, a monthly average beyond", () => {
  const S = new Map([["unik.uke", 70], ["unik.mnd", 300]]);
  assert.equal(unike(S, { dager: 7, antallDager: 7 }), 70);
  assert.equal(unike(S, { dager: 30, antallDager: 30 }), 300);
  assert.equal(unike(S, { dager: 90, antallDager: 90 }), Math.round(300 / (90 / 30.44)));
  assert.equal(unike(S, { dager: 365, antallDager: 365 }), Math.round(300 / (365 / 30.44)));
  assert.equal(unike(S, { dager: null, antallDager: 5 }), 300, "a few days of «alt» is not stretched to a month");
});

// ---------- Long periods: monthly totals plus the odd days ----------

test("what is read for a long period: whole months from table maned, the odd days from teller", () => {
  const periode = periodeFor("365", I_DAG, "2024-01-01");
  const W = vinduStart(periode, I_DAG);
  assert.equal(W, flytt(I_DAG, -DAGER_TILBAKE));
  const plan = planlegg([periode, periode.forrige], W, "2024-01-01", I_DAG);
  // Now: 11 Nov 2025 → 10 Nov 2026. Before: 11 Nov 2024 → 10 Nov 2025. The window starts 10 Sep 2026.
  assert.deepEqual(plan.maneder, manedene("2024-12", "2025-10").concat(manedene("2025-12", "2026-08")));
  assert.deepEqual(plan.dager, [["2024-11-11", "2024-11-30"], ["2025-11-01", "2025-11-30"], ["2026-09-01", "2026-09-09"]]);
  // A month counts as whole from the first day with counters.
  const alt = periodeFor("alt", I_DAG, "2026-03-17");
  assert.deepEqual(planlegg([alt], W, "2026-03-17", I_DAG), { dager: [["2026-09-01", "2026-09-09"]], maneder: ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"] });
  // Short periods are all inside the window: nothing extra.
  const p30 = periodeFor("30", I_DAG, "2024-01-01");
  assert.deepEqual(planlegg([p30, p30.forrige], vinduStart(p30, I_DAG), "2024-01-01", I_DAG), { dager: [], maneder: [] });
  assert.equal(vinduStart(periodeFor("90", I_DAG, null), I_DAG), flytt(I_DAG, -90), "90 days: every day of the day chart");
  assert.deepEqual(slaSammen([["2026-01-05", "2026-01-09"], ["2026-01-01", "2026-01-04"], ["2026-02-01", "2026-02-02"], ["2026-01-08", "2026-01-20"]]), [["2026-01-01", "2026-01-20"], ["2026-02-01", "2026-02-02"]]);
});

test("365 days and «alt»: the numbers from monthly totals equal the plain daily sums", async () => {
  const db = falskD1();
  const rader = mange("2025-06-17", I_DAG);
  fyll(db, rader);
  await rullOpp(db, NAA);
  for (const p of ["365", "alt", "90", "30", "7"]) {
    db.logg.length = 0;
    const { tavle: t } = await hentTavle(db, NAA, { periode: p });
    const { fra, til, forrige } = t.periode;
    assert.equal(figur(t, "besok").verdi, sann(rader, fra, til, "besok"), `${p} besok`);
    assert.equal(figur(t, "startet").verdi, sann(rader, fra, til, /^start\./), `${p} startet`);
    assert.equal(t.spill.find((s) => s.id === "sauen").ferdig, sann(rader, fra, til, "ferdig.sauen"), `${p} sauen`);
    assert.equal(t.vanlig.tilbake.nesteDag.nevner, sann(rader, flytt(fra, -1), flytt(til, -1), /^enhet\./), `${p} the day before`);
    if (forrige && forrige.fra >= "2025-06-17") assert.equal(figur(t, "besok").forrige, sann(rader, forrige.fra, forrige.til, "besok"), `${p} before`);
    if (p === "365" || p === "alt") assert.ok(db.logg.some((l) => l.sql === SQL.lesMnd), `${p}: monthly totals are used`);
  }
});

test("a month without totals yet (the nightly job has not run): its days are read instead", async () => {
  const db = falskD1();
  const rader = mange("2025-06-17", I_DAG);
  fyll(db, rader);
  // Only some months are added up.
  await rullOpp(db, new Date("2026-03-15T12:00:00Z"));
  const { tavle: t, drift } = await hentTavle(db, NAA, { periode: "365" });
  assert.equal(figur(t, "besok").verdi, sann(rader, t.periode.fra, t.periode.til, "besok"));
  assert.equal(drift.sisteRull, "2026-02");
  assert.ok(drift.manglerMnd.includes("2026-10"), "the owner is told October is not added up yet");
});

test("before schema-2.sql has been run: everything from the daily counters, and the page says so", async () => {
  const db = falskD1({ utenManed: true });
  const rader = mange("2026-01-01", I_DAG);
  fyll(db, rader);
  for (const p of ["7", "365", "alt"]) {
    const data = await hentTavle(db, NAA, { periode: p });
    assert.equal(figur(data.tavle, "besok").verdi, sann(rader, data.tavle.periode.fra, data.tavle.periode.til, "besok"), p);
    assert.equal(data.drift.manedTabell, false);
    if (p === "7") assert.match(tavle(data, { klokke: "13:00", innlogging: "access" }), /Tabellen for månedstall finnes ikke ennå\. Kjør schema-2\.sql/);
  }
});

test("rows read per page: the window of days, a few odd days and the monthly totals – far below the free limit", async () => {
  // 25 months of 300 different counters a day: more than rusj will have for a long time.
  const db = falskD1();
  const spill = Object.keys(OPPSETT.SPILL);
  for (const d of dagene("2024-10-12", I_DAG)) for (let i = 0; i < 300; i++) db.sett(d, i < 5 ? ["besok", "unik.uke", "unik.mnd", "enhet.ny", "app.ny"][i] : `start.${spill[i % spill.length]}${i}`.slice(0, 40), 1 + (i % 4));
  await rullOpp(db, NAA);
  const lest = {};
  for (const p of ["7", "30", "90", "365", "alt"]) lest[p] = (await hentTavle(db, NAA, { periode: p })).drift.db.rader;
  // The window (63 days × 300) plus the month chart (2 names × ≤ 25 months) plus MIN/MAX.
  assert.ok(lest["7"] <= 63 * 300 + 2 * 25 + 10, JSON.stringify(lest));
  assert.equal(lest["7"], lest["30"]);
  // 90 days: every day of the period, and the period before as two odd ends and whole months.
  assert.ok(lest["90"] <= (91 + 62) * 300 + 3 * 300 + 2 * 25 + 10, JSON.stringify(lest));
  // 365 days: the window, the odd days at three edges (≤ 3 months of days) and ≤ 24 months of totals.
  assert.ok(lest["365"] <= (63 + 93) * 300 + 24 * 300 + 10, JSON.stringify(lest));
  assert.ok(lest["alt"] <= (63 + 31) * 300 + 25 * 300 + 10, JSON.stringify(lest));
  // At 5 million rows a day for free, that is hundreds of page loads a day even in this case.
  for (const p of Object.keys(lest)) assert.ok(5_000_000 / lest[p] > 50, `${p}: ${lest[p]} rows`);
});

test("every read uses the primary key: a range of days, a range or list of months, one row for MIN/MAX", () => {
  const db = falskD1();
  for (const s of [SQL.les, SQL.eksport]) assert.ok(db.plan(s, ["a", "b"]).some((l) => /SEARCH teller USING PRIMARY KEY \(dag>\? AND dag<\?\)/.test(l)), s);
  assert.ok(db.plan(SQL.lesMnd, ["a", "b"]).some((l) => /SEARCH maned USING PRIMARY KEY \(maned>\? AND maned<\?\)/.test(l)));
  assert.ok(db.plan(SQL.lesMndNokler, ["[]", "[]"]).some((l) => /SEARCH maned USING PRIMARY KEY \(maned=\? AND nokkel=\?\)/.test(l)));
  for (const s of [SQL.forste, SQL.siste, SQL.forsteMnd, SQL.sisteMnd]) assert.deepEqual(db.plan(s).filter((l) => /SCAN/.test(l)), [], s);
});

// ---------- The games ----------

test("the games table: starts, finishes, share finished, change and 8 weeks of starts", () => {
  const rader = [
    ...dag("2026-11-10", { "start.ordugla": 10, "ferdig.ordugla": 8, "side.ordugla": 12, "start.sauen": 4, "ferdig.sauen": 9, "side.luringen": 3 }),
    ...dag("2026-11-04", { "start.ordugla": 2 }),
    ...dag("2026-11-03", { "start.ordugla": 5, "start.sauen": 10 }), // the period before
    ...dag("2026-09-20", { "start.ordugla": 7 }), // 8 weeks back: the first week of the sparkline
    ...dag("2026-09-15", { "start.ordugla": 99 }), // 57 days back: outside it
  ];
  const lager = lagLager({ dagRader: rader, dagOmrader: [["2026-09-01", I_DAG]], forste: "2026-09-01" });
  const periode = periodeFor("7", I_DAG, "2026-09-01");
  const bygg = (sort) => byggTavle(lager, { iDag: I_DAG, periode, W: "2026-09-10", sort, oppsett: OPPSETT });
  const t = bygg();
  const o = t.spill.find((s) => s.id === "ordugla");
  assert.deepEqual({ startet: o.startet, ferdig: o.ferdig, apnet: o.apnet, prosent: o.prosent, forrige: o.forrige, endring: o.endring }, { startet: 12, ferdig: 8, apnet: 12, prosent: 67, forrige: 5, endring: { ny: false, prosent: 140 } });
  assert.equal(t.spill.find((s) => s.id === "sauen").prosent, 100, "never over 100 %");
  assert.equal(t.spill.find((s) => s.id === "luringen").prosent, null);
  // Sparkline: 8 weeks of 7 days, the last ending yesterday, oldest first.
  assert.deepEqual(sparkUker(I_DAG).map((u) => [u.fra, u.til]), [
    ["2026-09-16", "2026-09-22"], ["2026-09-23", "2026-09-29"], ["2026-09-30", "2026-10-06"], ["2026-10-07", "2026-10-13"],
    ["2026-10-14", "2026-10-20"], ["2026-10-21", "2026-10-27"], ["2026-10-28", "2026-11-03"], ["2026-11-04", "2026-11-10"],
  ]);
  assert.deepEqual(o.spark, [7, 0, 0, 0, 0, 0, 5, 12]);
  assert.deepEqual(t.spill.find((s) => s.id === "sauen").spark, [0, 0, 0, 0, 0, 0, 10, 4]);
  // Sorting.
  const rekke = (sort) => bygg(sort).spill.map((s) => s.id);
  assert.deepEqual(rekke("startet"), ["ordugla", "sauen", "luringen"]);
  assert.deepEqual(rekke("ferdig"), ["sauen", "ordugla", "luringen"]);
  assert.deepEqual(rekke("prosent"), ["sauen", "ordugla", "luringen"]);
  assert.deepEqual(rekke("endring"), ["ordugla", "luringen", "sauen"]);
  assert.deepEqual(rekke("navn"), ["luringen", "ordugla", "sauen"]);
  assert.deepEqual(rekke("tull"), rekke("startet"));
  // Rising and falling (at least 3 starts in one of the periods).
  assert.deepEqual(t.stiger.map((r) => [r.id, r.forskjell]), [["ordugla", 7]]);
  assert.deepEqual(t.faller.map((r) => [r.id, r.forskjell]), [["sauen", -6]]);
});

test("the sparkline is drawn to scale, with an empty week as a thin line", () => {
  const svg = spark([0, 2, 4, 8, 0, 0, 1, 8]);
  assert.equal(svg.match(/<rect/g).length, 8);
  assert.equal(svg.match(/class="s-tom"/g).length, 3);
  assert.match(svg, /aria-label="Startet per uke, siste 8 uker: 0, 2, 4, 8, 0, 0, 1, 8"/);
  assert.match(svg, /<rect x="21" y="2" width="5" height="16"\/>/);
  assert.match(svg, /<rect x="14" y="10" width="5" height="8"\/>/);
});

test("new games: the first day with counters, and their first four weeks", async () => {
  const db = falskD1();
  const rader = [
    ...mange("2026-05-01", I_DAG, { spill: ["ordugla"], nye: false }),
    // Sauen is new on 20 October; Blyanten was quiet for months but had counters in June.
    ...dagene("2026-10-20", I_DAG).flatMap((d) => dag(d, { "side.sauen": 4, "start.sauen": 3, "ferdig.sauen": 1 })),
    ...dag("2026-06-03", { "side.blyanten": 1 }),
    ...dagene("2026-10-25", I_DAG).flatMap((d) => dag(d, { "start.blyanten": 2 })),
  ];
  fyll(db, rader);
  await rullOpp(db, NAA);
  const { tavle: t } = await hentTavle(db, NAA, { periode: "30" });
  assert.deepEqual(t.nyeSpill.map((s) => [s.id, s.forsteDag]), [["sauen", "2026-10-20"]]);
  const s = t.nyeSpill[0];
  assert.deepEqual(s.uker.map((u) => [u.fra, u.startet, !!u.delvis, u.framtid]), [
    ["2026-10-20", 21, false, false],
    ["2026-10-27", 21, false, false],
    ["2026-11-03", 21, false, false],
    ["2026-11-10", 6, true, false],
  ]);
  assert.deepEqual([s.startet, s.apnet, s.ferdig], [69, 92, 23]);
  // Counting that just began makes nothing «new»: every game appears in the first days.
  const lager = lagLager({ dagRader: mange("2026-11-01", I_DAG), dagOmrader: [["2026-09-01", I_DAG]], forste: "2026-11-01" });
  assert.deepEqual(nyeKandidater(lager, { iDag: I_DAG, W: "2026-09-10", forste: "2026-11-01" }), []);
});

// ---------- Groups, the calendar, online play, errors ----------

test("edition, device type and source: counts, shares and changes", () => {
  const rader = [
    ...dag("2026-11-10", { "utgave.nb": 80, "utgave.en": 15, "utgave.da": 5, "type.mobil": 70, "type.nettbrett": 10, "type.pc": 20, "kilde.sok": 40, "kilde.sosial": 10, "kilde.direkte": 45, "kilde.annen": 5 }),
    ...dag("2026-11-01", { "utgave.nb": 40, "kilde.sok": 20 }),
    ...dag("2026-10-15", { besok: 1 }),
  ];
  const lager = lagLager({ dagRader: rader, dagOmrader: [["2026-09-01", I_DAG]], forste: "2026-10-15" });
  const t = byggTavle(lager, { iDag: I_DAG, periode: periodeFor("7", I_DAG, "2026-10-15"), W: "2026-09-10", oppsett: OPPSETT });
  assert.deepEqual(t.utgaver.rader.map((r) => [r.id, r.antall, r.andel, r.endring]), [["nb", 80, 80, { ny: false, prosent: 100 }], ["en", 15, 15, { ny: true, prosent: null }], ["da", 5, 5, { ny: true, prosent: null }]]);
  assert.equal(t.typer.total, 100);
  assert.deepEqual(t.kilder.rader.map((r) => r.navn), ["Søkemotor", "Sosiale medier", "Direkte (ingen lenke)", "Andre nettsider"]);
  assert.deepEqual(t.kilder.rader.map((r) => r.andel), [40, 10, 45, 5]);
});

test("the Christmas calendar, online play and errors per game", () => {
  const rader = dag("2026-11-10", {
    "side.julekalenderen": 50, "start.julekalenderen": 20, "ferdig.julekalenderen": 9, "jul.utskrift": 4, "jul.paminnelse": 7, "jul.tre": 2,
    "nett.rom.sauen": 5, "nett.start.sauen": 4, "nett.ferdig.sauen": 3, "nett.rom.ordugla": 1,
    "feil.sauen": 3, "side.sauen": 200, "feil.ordugla": 1,
  });
  const oppsett = { SPILL: { ...OPPSETT.SPILL, julekalenderen: "Julekalenderen" }, DAGLIGE: OPPSETT.DAGLIGE };
  const t = byggTavle(lagLager({ dagRader: rader, dagOmrader: [["2026-09-01", I_DAG]], forste: "2026-11-10" }), { iDag: I_DAG, periode: periodeFor("7", I_DAG, "2026-11-10"), W: "2026-09-10", oppsett });
  assert.deepEqual(Object.fromEntries(Object.entries(t.jul).map(([k, v]) => [k, v.antall])), { apnet: 50, luker: 20, ferdig: 9, utskrift: 4, paminnelse: 7, tre: 2 });
  assert.deepEqual([t.nett.rom, t.nett.startet, t.nett.ferdig], [6, 4, 3]);
  assert.deepEqual(t.nett.rader.map((r) => [r.id, r.rom, r.startet, r.ferdig]), [["sauen", 5, 4, 3], ["ordugla", 1, 0, 0]]);
  assert.deepEqual(t.feil.map((f) => [f.id, f.antall, f.per100]), [["sauen", 3, 1.5], ["ordugla", 1, null]]);
  assert.equal(t.feilTotalt, 4);
  // The funnel.
  assert.deepEqual(t.trakt, { besok: 0, startet: 20, ferdig: 9, perBesok: null, ferdigAndel: 45 });
});

// ---------- Health ----------

test("health of the rooms Worker: GET to the fixed address, «rusj-nett: ok» within the time limit", async () => {
  const kall = [];
  let t = 0;
  const klokke = () => (t += 40);
  const svar = (status, tekst) => async (url, valg) => (kall.push({ url, valg }), new Response(tekst, { status }));
  assert.deepEqual(await sjekkNett({ hent: svar(200, "rusj-nett: ok\n"), klokke }), { ok: true, ms: 40 });
  assert.equal(kall[0].url, NETT_HELSE);
  assert.equal(NETT_HELSE, "https://rusj-nett.kikiklevendybro.workers.dev/");
  assert.deepEqual(Object.keys(kall[0].valg).sort(), ["method", "redirect", "signal"], "no body, no headers, no credentials");
  assert.equal(kall[0].valg.method, "GET");
  assert.ok(kall[0].valg.signal instanceof AbortSignal);
  assert.ok(HELSE_FRIST_MS <= 3000);
  assert.deepEqual(await sjekkNett({ hent: svar(200, "noe annet"), klokke }), { ok: false, ms: 40, status: 200, grunn: "svarte noe annet (status 200)" });
  assert.equal((await sjekkNett({ hent: svar(503, "rusj-nett: ok"), klokke })).ok, false);
  assert.equal((await sjekkNett({ hent: svar(302, ""), klokke })).grunn, "svarte noe annet (status 302)");
  const tidsfrist = async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  };
  assert.deepEqual(await sjekkNett({ hent: tidsfrist, klokke }), { ok: false, ms: 40, grunn: "svarte ikke innen 2,5 sekunder" });
  const nede = async () => {
    throw new TypeError("fetch failed");
  };
  assert.deepEqual(await sjekkNett({ hent: nede, klokke }), { ok: false, ms: 40, grunn: "kom ikke fram" });
  assert.deepEqual(await sjekkNett({ hent: svar(200, ""), adresse: "" }), { av: true });
  // A real time limit: a check that never answers is given up.
  const aldri = (url, valg) => new Promise((_, nei) => valg.signal.addEventListener("abort", () => nei(valg.signal.reason)));
  assert.equal((await sjekkNett({ hent: aldri, frist: 30 })).grunn, "svarte ikke innen 0,03 sekunder");
});

test("the dashboard checks the rooms Worker each time it is opened, and only then", async () => {
  const db = falskD1();
  hentLogg.length = 0;
  await handter(new Request("https://stat.example/t", { method: "POST", headers: { Origin: "https://rusj.no", "Content-Type": "text/plain", "Content-Length": "19" }, body: '{"v":1,"k":["besok"]}'.slice(0, 19) }), { DB: db }, {}, NAA);
  await handter(new Request("https://stat.example/admin"), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA);
  assert.equal(hentLogg.length, 0, "not for counting, and not for the login page");
  const ok = await (await handter(new Request("https://stat.example/admin", { headers: { "X-Admin-Nokkel": NOKKEL } }), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA)).text();
  assert.equal(hentLogg.length, 1);
  assert.equal(hentLogg[0].url, NETT_HELSE);
  assert.match(ok, /Spill på nett \(rusj-nett\)<\/b><span>Svarer \(\d+ ms\)\./);
  const for_ = falskHent.svar;
  falskHent.svar = () => new Response("Fant ikke siden.", { status: 404 });
  try {
    const nede = await (await handter(new Request("https://stat.example/admin", { headers: { "X-Admin-Nokkel": NOKKEL } }), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA)).text();
    assert.match(nede, /merkelapp feil">Feil<\/span><b>Spill på nett \(rusj-nett\)<\/b><span>Svarer ikke som det skal: svarte noe annet \(status 404\)\./);
  } finally {
    falskHent.svar = for_;
  }
});

// ---------- The page ----------

// The dashboard's data straight from rows (the made-up game list of the tests, no database).
function data(rader, { p = "7", iDag = I_DAG, drift = {} } = {}) {
  const forste = rader.map((r) => r.dag).sort()[0] || null;
  const periode = periodeFor(p, iDag, forste);
  const lager = lagLager({ dagRader: rader, dagOmrader: [["2000-01-01", iDag]], forste });
  return {
    sammendrag: sammendrag(rader, iDag, { forsteDag: forste, oppsett: OPPSETT }),
    tavle: byggTavle(lager, { iDag, periode, W: vinduStart(periode, iDag), oppsett: OPPSETT }),
    drift: { db: { ok: true, ms: 12, rader: 345 }, manedTabell: true, sisteRull: "2026-10", manglerMnd: [], sisteDag: iDag, iDag: 77, nett: { ok: true, ms: 30 }, ...drift },
  };
}

test("the page: period links, key figures with changes, charts, the games table and the health", () => {
  const rader = mange("2026-09-01", I_DAG);
  const html = tavle(data(rader, { p: "30" }), { klokke: "13:00", innlogging: "access" });
  // The period selector: plain links, the chosen one marked.
  assert.deepEqual([...html.matchAll(/<a href="(\/admin\?p=[^"]+)"( aria-current="page")?>([^<]+)<\/a>/g)].slice(0, 5).map((m) => [m[1], !!m[2], m[3]]), [
    ["/admin?p=7", false, "7 dager"], ["/admin?p=30", true, "30 dager"], ["/admin?p=90", false, "90 dager"], ["/admin?p=365", false, "365 dager"], ["/admin?p=alt", false, "Alt"],
  ]);
  const besok = sann(rader, "2026-10-12", "2026-11-10", "besok");
  const for_ = sann(rader, "2026-09-12", "2026-10-11", "besok");
  const pst = Math.round(((besok - for_) / for_) * 100);
  const tall = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  assert.ok(html.includes(`<dt>Besøk</dt><dd>${tall(besok)}<span class="endring ${pst > 0 ? "opp" : pst < 0 ? "ned" : "lik"}" title="Endring fra perioden før">${pst > 0 ? "+" : pst < 0 ? "−" : "±"}${Math.abs(pst)} %</span><small>økter på rusj · før: ${tall(for_)}</small>`), "Besøk with its change");
  assert.match(html, /Endringene sammenligner med 12\. sep til 11\. okt\./);
  // Charts per day (30 bars), per week and per month.
  assert.match(html, /<figcaption>Enheter innom per dag<\/figcaption><svg[^>]*aria-label="Enheter innom per dag, 12\. okt til 10\. nov\./);
  assert.match(html, /<figcaption>Ulike enheter per uke<\/figcaption><svg/);
  assert.match(html, /<figcaption>Besøk per måned<\/figcaption><svg[^>]*aria-label="Besøk per måned, september 2026 til november 2026\./);
  // The games table with sort links, the share finished, the change and the sparkline.
  assert.match(html, /<th scope="col" aria-sort="descending"><a href="\/admin\?p=30&amp;sort=startet">Startet<\/a><\/th>|<th scope="col" aria-sort="descending"><a href="\/admin\?p=30">Startet<\/a><\/th>/);
  assert.match(html, /<a href="\/admin\?p=30&amp;sort=prosent" title="Sorter etter andelen fullført">%<\/a>/);
  assert.equal((html.match(/<svg class="s-spark"/g) || []).length, 3);
  // Health, CSV links.
  assert.match(html, /Statistikk-tjenesten<\/b><span>Svarer\. Databasen brukte 12 ms og leste 345 rader for denne siden\./);
  assert.match(html, /Lagt sammen til og med oktober 2026\./);
  assert.match(html, /I dag: 77 tellinger så langt\. Klokkeslett lagres ikke, bare datoen\./);
  assert.match(html, /<a href="\/admin\/eksport\.csv\?fra=2026-10-12&amp;til=2026-11-10" data-eksport>Denne perioden<\/a>/);
  assert.match(html, /<a href="\/admin\/eksport\.csv\?fra=2026-10-13&amp;til=2026-11-11" data-eksport>Siste 30 dager<\/a>/);
  assert.match(html, /<a href="\/admin\/eksport\.csv\?fra=2026-09-01&amp;til=2026-11-11" data-eksport>Alt<\/a>/);
  assert.match(html, /href="\/cdn-cgi\/access\/logout"/);
  assert.doesNotMatch(html, /NaN|undefined|Infinity/);
  // Sorted by name: the link keeps the period, and the column is marked.
  const navn = tavle({ ...data(rader, { p: "90" }), tavle: { ...data(rader, { p: "90" }).tavle, sort: "navn" } }, { klokke: "13:00", innlogging: "access" });
  assert.match(navn, /<th scope="col" aria-sort="ascending"><a href="\/admin\?p=90&amp;sort=navn">Spill<\/a><\/th>/);
  assert.match(navn, /<a href="\/admin\?p=7&amp;sort=navn">7 dager<\/a>/);
});

test("the old numbers are still there: the sentence, this week and month, returning, time, dailies", () => {
  const rader = [
    ...dag("2026-11-10", { "enhet.ny": 60, "enhet.igar": 41, "enhet.uke": 17, "enhet.lenge": 14, "unik.uke": 80, "unik.mnd": 70, app: 9, besok: 150, "tid.1": 100, "tid.3": 60, "tid.10": 20, "tid.30": 5, "side.forside": 140, "start.ordugla": 50, "ferdig.ordugla": 45, "daglig.ordugla": 44, "dagens.1": 48, "dagens.3": 6, "rekke.7": 5 }),
    ...dag("2026-11-09", { "enhet.ny": 100, "enhet.igar": 20, besok: 130, "unik.uke": 120, "unik.mnd": 90 }),
    ...dag(I_DAG, { "enhet.ny": 10, "enhet.igar": 13, besok: 25 }),
  ];
  const html = tavle(data(rader), { klokke: "13:00", innlogging: "nokkel" }).replace(/ /g, " ");
  assert.match(html, /I går var <b>132<\/b> innom, <b>41<\/b> av dem var også her dagen før\./);
  assert.match(html, /Hittil i dag: 23 innom\./);
  assert.match(html, /Tellingen har tall fra og med 9\. november 2026\./);
  assert.match(html, /<dt>Denne uka \(hittil\)<\/dt><dd>200</);
  // Returning over the 7 days: 61 came back the next day, of 120 the day before.
  assert.match(html, /<dt>Tilbake dagen etter<\/dt><dd>51 %<small>61 av 120 som var her dagen før/);
  assert.match(html, /Et typisk besøk varer<\/dt><dd>(ca\. [\d,]+ minutter|under 1 minutt)</);
  assert.match(html, /Fullførte alle tre<\/span><span class="rad-tall">6</);
  assert.match(html, /7–13 dager<\/span><span class="rad-tall">5</);
  assert.match(html, /data-logg-ut/);
});

test("empty states explain themselves", async () => {
  const html = adminSide({ data: await hentTavle(falskD1(), NAA, {}), nonce: "n", klokke: "13:00", innlogging: "nokkel", nokkelPaa: true });
  for (const tekst of [
    "Ingen tall ennå. De kommer når tellingen er slått på på rusj.no.",
    "Ingen enheter er talt ennå. Tallene for uke og måned kommer her.",
    "Ingen spill er åpnet eller startet i denne perioden.",
    "Ingen besøk er talt i denne perioden.",
    "Ingen tall ennå. Dette fylles ut når enheter har vært innom",
    "Ingen har fullført en av dagens oppgaver i denne perioden.",
    "Ingen nye spill de siste åtte ukene.",
    "Ingen tall ennå. Denne tellingen er ny.",
    "Ingen har brukt julekalenderen i denne perioden.",
    "Ingen rom er laget i denne perioden.",
    "Ingen feil er meldt i denne perioden.",
    "Ingen tellinger er kommet ennå.",
    "Ingen sammenligning: perioden før ble ikke talt hele.",
    "Slik leser du tallene",
    "Tall som er eldre enn 25 måneder, slettes automatisk.",
  ]) {
    assert.ok(html.includes(tekst), tekst);
  }
  assert.doesNotMatch(html, /NaN|undefined|null|Infinity/);
  assert.doesNotMatch(html, /<svg/, "no chart without numbers");
});

test("a percentage that cannot be worked out is shown as a dash, with the reason", () => {
  const html = tavle(data(dag("2026-11-10", { "enhet.ny": 9, besok: 9 })), { klokke: "13:00", innlogging: "nokkel" });
  assert.match(html, /<dt>Tilbake dagen etter<\/dt><dd>–<small>ingen ble talt dagen før/);
  assert.doesNotMatch(html, /NaN|undefined|null %/);
});

test("everything from the counters and the config is escaped on the page", () => {
  const ondt = '<img src=x onerror="alert(1)">';
  const oppsett = { SPILL: { ordugla: ondt, sauen: "Sauen" }, DAGLIGE: ["ordugla"] };
  const rader = [...dag("2026-11-10", { "start.ordugla": 3, "enhet.ny": 2, "daglig.ordugla": 1, "dagens.1": 1, "start.<script>": 1, "feil.ordugla": 1, "nett.rom.ordugla": 1 }), ...dag("2026-11-03", { "start.ordugla": 1 })];
  const lager = lagLager({ dagRader: rader, dagOmrader: [["2026-09-01", I_DAG]], forste: "2026-09-01" });
  const periode = periodeFor("7", I_DAG, "2026-09-01");
  const d = {
    sammendrag: sammendrag(rader, I_DAG, { oppsett }),
    tavle: byggTavle(lager, { iDag: I_DAG, periode, W: "2026-09-10", oppsett }),
    drift: { db: { ok: true, ms: 1, rader: 1 }, manedTabell: true, sisteRull: null, manglerMnd: [], sisteDag: I_DAG, iDag: 1, nett: { ok: false, ms: 1, grunn: "<b>ond</b>" } },
  };
  const html = tavle(d, { klokke: "13:00", innlogging: "nokkel" });
  assert.doesNotMatch(html, /<img|<script|<b>ond/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("GET /admin?p=…&sort=…: the period and the order from the address, through the Worker", async () => {
  const db = falskD1();
  fyll(db, mange("2026-01-01", I_DAG));
  const hent = (q) => handter(new Request("https://stat.example/admin" + q, { headers: { "X-Admin-Nokkel": NOKKEL } }), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA);
  const html = await (await hent("?p=90&sort=navn")).text();
  assert.match(html, /<a href="\/admin\?p=90&amp;sort=navn" aria-current="page">90 dager<\/a>/);
  assert.match(html, /aria-sort="ascending"><a href="\/admin\?p=90&amp;sort=navn">Spill</);
  for (const q of ["?p=tull", "?p=", "", "?p=7&sort=tull", "?sort=%3Cscript%3E"]) assert.match(await (await hent(q)).text(), /<a href="\/admin\?p=7" aria-current="page">7 dager<\/a>/, q);
  const svar = await hent("?p=alt");
  assert.match(svar.headers.get("Content-Security-Policy"), /img-src 'self'; manifest-src 'self'/);
  const json = await (await handter(new Request("https://stat.example/admin/data.json?p=365", { headers: { "X-Admin-Nokkel": NOKKEL } }), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA)).json();
  assert.equal(json.tavle.periode.id, "365");
  assert.equal(json.drift.nett.ok, true);
  assert.equal(json.iDag, I_DAG);
});

test("a database that does not answer gives a short message, not a broken page", async () => {
  const db = falskD1();
  db.tilstand.feil = true;
  const svar = await handter(new Request("https://stat.example/admin", { headers: { "X-Admin-Nokkel": NOKKEL } }), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA);
  assert.equal(svar.status, 503);
  assert.match(await svar.text(), /Databasen svarer ikke/);
});
