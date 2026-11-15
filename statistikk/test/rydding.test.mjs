// Retention: counters older than 25 months are deleted by the scheduled job.
import { test } from "node:test";
import assert from "node:assert/strict";
import arbeider, { ryddGamle, rullOpp, rullManed, manederSomKanRulles, natt, SQL } from "../src/index.js";
import { OPPBEVARING_MND } from "../src/oppsett.js";
import { maanederFor, flyttMnd, manedene, manedSlutt } from "../src/dato.js";
import { falskD1, SKJEMA_2 } from "./falsk-d1.mjs";

test("the limit is 25 months", () => {
  assert.equal(OPPBEVARING_MND, 25);
  assert.equal(maanederFor("2026-11-11", 25), "2024-10-11");
  assert.equal(maanederFor("2027-01-31", 25), "2024-12-31");
  assert.equal(maanederFor("2026-03-31", 25), "2024-02-31"); // not a real date, but sorts right: after 02-29, before 03-01
  assert.equal(maanederFor("2026-01-05", 1), "2025-12-05");
  assert.equal(maanederFor("2026-12-05", 12), "2025-12-05");
});

test("rows older than the limit are deleted, the limit day and newer rows are kept", async () => {
  const db = falskD1();
  for (const dag of ["2023-01-01", "2024-09-30", "2024-10-10", "2024-10-11", "2024-10-12", "2025-06-01", "2026-11-10", "2026-11-11"]) {
    db.sett(dag, "besok", 3);
    db.sett(dag, "side.ordugla", 7);
  }
  const grense = await ryddGamle(db, new Date("2026-11-11T12:00:00Z"));
  assert.equal(grense, "2024-10-11");
  assert.deepEqual([...new Set(db.rader().map((r) => r.dag))], ["2024-10-11", "2024-10-12", "2025-06-01", "2026-11-10", "2026-11-11"]);
  assert.equal(db.rader().length, 10);
  assert.deepEqual(db.logg, [{ sql: SQL.rydd, args: ["2024-10-11"] }, { sql: SQL.ryddMnd, args: ["2024-10"] }]);
  // Running it again the same day changes nothing.
  await ryddGamle(db, new Date("2026-11-11T18:00:00Z"));
  assert.equal(db.rader().length, 10);
});

test("the limit follows the Oslo date", async () => {
  const db = falskD1();
  db.sett("2024-10-11", "besok", 1);
  // 23:30 UTC on 11 November is already 12 November in Norway: 2024-10-11 is now too old.
  assert.equal(await ryddGamle(db, new Date("2026-11-11T23:30:00Z")), "2024-10-12");
  assert.deepEqual(db.rader(), []);
});

test("the scheduled handler runs the cleanup", async () => {
  const db = falskD1();
  db.sett("2020-01-01", "besok", 1);
  db.sett("2999-01-01", "besok", 1);
  const venter = [];
  arbeider.scheduled({ cron: "17 3 * * *" }, { DB: db }, { waitUntil: (p) => venter.push(p) });
  assert.equal(venter.length, 1);
  await Promise.all(venter);
  assert.deepEqual(db.rader().map((r) => r.dag), ["2999-01-01"]);
});

// ---------- Monthly totals (table maned, schema-2.sql) ----------

// Counters spread over several months, with a few names that only exist in some of them.
function fyll(db) {
  const rader = [];
  for (const dag of ["2026-08-01", "2026-08-15", "2026-08-31", "2026-09-01", "2026-09-30", "2026-10-02", "2026-10-31", "2026-11-01", "2026-11-10", "2026-11-11"]) {
    const d = Number(dag.slice(8));
    for (const [nokkel, n] of [["besok", 10 + d], ["side.ordugla", d], ["unik.mnd", 1 + (d % 3)], [dag.slice(5, 7) === "09" ? "start.sauen" : "start.ordugla", 2]]) {
      db.sett(dag, nokkel, n);
      rader.push({ dag, nokkel, n });
    }
  }
  return rader;
}
const summer = (rader, maned) => {
  const ut = {};
  for (const r of rader) if (r.dag.startsWith(maned)) ut[r.nokkel] = (ut[r.nokkel] || 0) + r.n;
  return ut;
};
const somObjekt = (mnd, maned) => Object.fromEntries(mnd.filter((r) => r.maned === maned).map((r) => [r.nokkel, r.n]));

test("month helpers: next and previous month, a list of months, the last day", () => {
  assert.equal(flyttMnd("2026-11", 1), "2026-12");
  assert.equal(flyttMnd("2026-12", 1), "2027-01");
  assert.equal(flyttMnd("2026-01", -1), "2025-12");
  assert.equal(flyttMnd("2026-11", -25), "2024-10");
  assert.deepEqual(manedene("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(manedene("2026-11", "2026-10"), []);
  assert.equal(manedSlutt("2026-02"), "2026-02-28");
  assert.equal(manedSlutt("2028-02"), "2028-02-29");
  assert.equal(manedSlutt("2026-12"), "2026-12-31");
});

test("the months that can be added up: complete, and every day still kept", () => {
  const m = manederSomKanRulles("2026-11-11");
  assert.equal(m[0], "2024-11", "October 2024 has lost its first ten days: not added up");
  assert.equal(m.at(-1), "2026-10", "November is not over");
  assert.equal(m.length, 24);
  // When the limit is the 1st, its own month is still whole.
  assert.equal(manederSomKanRulles("2027-02-01")[0], "2025-01");
  assert.equal(manederSomKanRulles("2027-02-01").at(-1), "2027-01");
});

test("roll-up: each complete month's totals equal the sums of its days", async () => {
  const db = falskD1();
  const rader = fyll(db);
  const rullet = await rullOpp(db, new Date("2026-11-11T12:00:00Z"));
  assert.deepEqual(rullet.filter((m) => m >= "2026-08"), ["2026-08", "2026-09", "2026-10"]);
  const mnd = db.mnd();
  for (const maned of ["2026-08", "2026-09", "2026-10"]) assert.deepEqual(somObjekt(mnd, maned), summer(rader, maned), maned);
  assert.deepEqual(somObjekt(mnd, "2026-11"), {}, "the month in progress is never added up");
  assert.ok(mnd.every((r) => r.maned < "2026-11"));
  // The daily counters are left as they were.
  assert.equal(db.rader().length, rader.length);
});

test("roll-up is idempotent: a month that is done is skipped, and doing it again gives the same rows", async () => {
  const db = falskD1();
  fyll(db);
  await rullOpp(db, new Date("2026-11-11T12:00:00Z"));
  const for_ = db.mnd();
  const logg = db.logg.length;
  assert.deepEqual(await rullOpp(db, new Date("2026-11-12T12:00:00Z")), manederSomKanRulles("2026-11-12").filter((m) => m < "2026-08"), "only empty months are looked at again");
  assert.deepEqual(db.mnd(), for_);
  // The second night only asked which months are there and added up the empty ones (which read nothing).
  assert.ok(db.logg.slice(logg).every((l) => l.sql === SQL.mndFinnes || (l.sql === SQL.rull && l.args[2] < "2026-08")));
  // Forced again: the same totals, not doubled.
  await rullManed(db, "2026-09");
  await rullManed(db, "2026-09");
  assert.deepEqual(db.mnd(), for_);
});

test("roll-up on the first night of a month adds up the month that just ended (Oslo time)", async () => {
  const db = falskD1();
  fyll(db);
  // 03:17 UTC on 1 December is 04:17 in Norway: November is over.
  const rullet = await rullOpp(db, new Date("2026-12-01T03:17:00Z"));
  assert.ok(rullet.includes("2026-11"));
  assert.deepEqual(somObjekt(db.mnd(), "2026-11"), summer(fyll(falskD1()), "2026-11"));
  // 22:30 UTC on 30 November is still November in Norway: not added up yet.
  const db2 = falskD1();
  fyll(db2);
  assert.ok(!(await rullOpp(db2, new Date("2026-11-30T22:30:00Z"))).includes("2026-11"));
});

test("retention deletes monthly totals whose whole month is older than 25 months", async () => {
  const db = falskD1();
  for (const m of ["2024-08", "2024-09", "2024-10", "2024-11", "2026-10"]) db.settMnd(m, "besok", 5);
  await ryddGamle(db, new Date("2026-11-11T12:00:00Z")); // the limit is 2024-10-11
  assert.deepEqual(db.mnd().map((r) => r.maned), ["2024-10", "2024-11", "2026-10"], "October 2024 still has days newer than the limit");
});

test("without table maned (schema-2.sql not run yet): retention still works, roll-up waits", async () => {
  const db = falskD1({ utenManed: true });
  db.sett("2020-01-01", "besok", 1);
  db.sett("2026-10-05", "besok", 2);
  const ut = await natt(db, new Date("2026-11-11T12:00:00Z"));
  assert.equal(ut.grense, "2024-10-11");
  assert.equal(ut.rullet, null);
  assert.deepEqual(db.rader().map((r) => r.dag), ["2026-10-05"]);
});

test("schema-2.sql can be run twice and adds exactly one table of three columns", () => {
  const db = falskD1();
  db.kjorSql(SKJEMA_2);
  db.kjorSql(SKJEMA_2);
  assert.deepEqual(db.skjema(), [{ type: "table", name: "maned" }, { type: "table", name: "teller" }]);
  assert.deepEqual(db.kolonner("maned"), ["maned", "nokkel", "n"]);
  for (const [m, k, n] of [["2026-11-01", "besok", 1], ["nov", "besok", 1], ["2026-11", "", 1], ["2026-11", "x".repeat(41), 1], ["2026-11", "besok", 0]]) {
    assert.throws(() => db.settMnd(m, k, n), /constraint/i, JSON.stringify([m, k, n]));
  }
});

test("the roll-up reads one month by the day index, and looking for done months reads one row each", () => {
  const db = falskD1();
  assert.ok(db.plan(SQL.rull, ["2026-10-01", "2026-10-31", "2026-10"]).some((l) => /SEARCH teller USING PRIMARY KEY \(dag>\? AND dag<\?\)/.test(l)));
  assert.ok(db.plan(SQL.mndFinnes, ["[]"]).some((l) => /SEARCH maned .*USING PRIMARY KEY \(maned=\?\)/.test(l)));
});
