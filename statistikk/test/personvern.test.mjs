// The privacy rules, checked against the source itself: what the Worker reads, what the database
// can hold, and that nothing is logged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { handter } from "../src/index.js";
import { falskD1, post, pakke, NAA, SKJEMA } from "./falsk-d1.mjs";

const mappe = new URL("../src/", import.meta.url);
const filer = readdirSync(mappe).filter((f) => f.endsWith(".js"));
const kilde = Object.fromEntries(filer.map((f) => [f, readFileSync(new URL(f, mappe), "utf8")]));
const alt = Object.values(kilde).join("\n");

test("the Worker reads four request headers and no others", () => {
  const lest = [...alt.matchAll(/headers\.get\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(lest, ["Content-Length", "Content-Type", "Origin", "X-Admin-Nokkel"]);
  assert.doesNotMatch(alt, /headers\.(entries|keys|values|forEach)\b|\[\.\.\.\s*request\.headers|Object\.fromEntries\(\s*request\.headers/, "headers are never read in bulk");
});

test("no address, browser name, referrer, location or cookie is touched anywhere in the Worker", () => {
  assert.doesNotMatch(alt, /cf-connecting-ip|x-forwarded-for|x-real-ip|true-client-ip|forwarded/i);
  assert.doesNotMatch(alt.replace("User-agent: *", ""), /user-agent|sec-ch-ua|accept-language/i); // (robots.txt says «User-agent: *»)
  assert.doesNotMatch(alt, /["'`]referer["'`]/i);
  assert.doesNotMatch(alt, /request\.cf\b|\.cf\.|\bcountry\b|\bcolo\b|\basn\b/i);
  assert.doesNotMatch(alt, /set-cookie|["'`]cookie["'`]|document\.cookie/i);
});

test("nothing is logged, and no request leaves the Worker", () => {
  assert.doesNotMatch(alt, /console\s*\./);
  assert.doesNotMatch(alt, /\bfetch\s*\(\s*["'`]https?:|\bfetch\s*\(\s*new\b|\bfetch\s*\(\s*request\b|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(alt.replace(/fetch\("\/admin"/g, ""), /[^.\w]fetch\s*\(/, "the only fetch is the login page calling its own /admin");
});

test("the query string is never read", () => {
  assert.doesNotMatch(alt, /searchParams|\.search\b|\.hash\b/);
});

test("the database is one table with three columns: day, counter name, count", () => {
  const db = falskD1();
  assert.deepEqual(db.skjema(), [{ type: "table", name: "teller" }]);
  assert.deepEqual(db.kolonner("teller"), ["dag", "nokkel", "n"]);
  assert.equal(SKJEMA.match(/CREATE\s+(TABLE|INDEX|VIEW|TRIGGER)/gi).length, 1);
  assert.match(SKJEMA, /PRIMARY KEY \(dag, nokkel\)/);
});

test("the schema itself refuses rows that are not a day, a short name and a positive count", () => {
  const db = falskD1();
  db.sett("2026-11-11", "besok", 1);
  for (const [dag, nokkel, n] of [["2026-11-11T12:00:00Z", "besok", 1], ["i dag", "besok", 1], ["", "besok", 1], ["2026-11-11", "", 1], ["2026-11-11", "x".repeat(41), 1], ["2026-11-11", "tid.1", 0], ["2026-11-11", "tid.1", -1], [null, "besok", 1], ["2026-11-11", null, 1], ["2026-11-11", "tid.3", null]]) {
    assert.throws(() => db.sett(dag, nokkel, n), /constraint/i, JSON.stringify([dag, nokkel, n]));
  }
  assert.throws(() => db.sett("2026-11-11", "besok", 1), /constraint/i, "one row per day and name");
  assert.equal(db.rader().length, 1);
});

test("every statement the Worker runs uses bound values, never text pasted into SQL", () => {
  const sql = [...kilde["index.js"].matchAll(/"((?:INSERT|SELECT|DELETE|UPDATE|CREATE|DROP|ALTER)[^"]*)"/g)].map((m) => m[1]);
  assert.equal(sql.length, 4);
  for (const s of sql) assert.doesNotMatch(s, /\$\{|'/, s);
  assert.equal(kilde["index.js"].match(/\.prepare\(/g).length, 4);
  assert.doesNotMatch(alt, /\.exec\(\s*[`"']|prepare\(\s*`/);
  assert.doesNotMatch(alt, /\b(DROP|ALTER|UPDATE teller|TRUNCATE)\b/);
});

test("a request full of personal-looking data leaves nothing behind but the counter", async () => {
  const db = falskD1();
  const req = post(pakke("side.ordugla", "navn.kari-nordmann", "kari@example.com", "+4799999999"), {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) HemmeligNettleser/1.0",
    Referer: "https://rusj.no/ordugla/?venn=kari&kode=HEMMELIG",
    Cookie: "sesjon=abc123; bruker=kari",
    "CF-Connecting-IP": "203.0.113.77",
    "X-Forwarded-For": "203.0.113.77, 198.51.100.4",
    "Accept-Language": "nb-NO,nb;q=0.9",
  }, "https://stat.example/t?bruker=kari&id=abc123");
  const svar = await handter(req, { DB: db }, {}, NAA);
  assert.equal(svar.status, 204);
  assert.deepEqual(db.rader(), [{ dag: "2026-11-11", nokkel: "side.ordugla", n: 1 }]);
  const spor = JSON.stringify([db.rader(), db.logg, [...svar.headers]]);
  assert.doesNotMatch(spor, /203\.0\.113|198\.51|HemmeligNettleser|iPhone|kari|HEMMELIG|abc123|nb-NO|4799999999/i);
});

test("the answers set no cookie and reveal nothing about the caller", async () => {
  const db = falskD1();
  const svar = [
    await handter(post(pakke("besok")), { DB: db }, {}, NAA),
    await handter(new Request("https://stat.example/"), { DB: db }, {}, NAA),
    await handter(new Request("https://stat.example/admin"), { DB: db }, {}, NAA),
    await handter(new Request("https://stat.example/admin/data.json"), { DB: db }, {}, NAA),
  ];
  for (const s of svar) {
    assert.equal(s.headers.get("Set-Cookie"), null);
    assert.equal(s.headers.get("Cache-Control"), "no-store");
    assert.equal(s.headers.get("X-Robots-Tag"), "noindex, nofollow");
  }
});
