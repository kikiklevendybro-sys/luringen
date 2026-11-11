// Retention: counters older than 25 months are deleted by the scheduled job.
import { test } from "node:test";
import assert from "node:assert/strict";
import arbeider, { ryddGamle, SQL } from "../src/index.js";
import { OPPBEVARING_MND } from "../src/oppsett.js";
import { maanederFor } from "../src/dato.js";
import { falskD1 } from "./falsk-d1.mjs";

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
  assert.deepEqual(db.logg, [{ sql: SQL.rydd, args: ["2024-10-11"] }]);
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
