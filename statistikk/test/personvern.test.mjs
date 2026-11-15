// The privacy rules, checked against the source itself: what the Worker reads, what the database
// can hold, and that nothing is logged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { handter, SQL } from "../src/index.js";
import { falskD1, post, pakke, NAA, SKJEMA, SKJEMA_2 } from "./falsk-d1.mjs";

const mappe = new URL("../src/", import.meta.url);
const filer = readdirSync(mappe).filter((f) => f.endsWith(".js"));
const kilde = Object.fromEntries(filer.map((f) => [f, readFileSync(new URL(f, mappe), "utf8")]));
const alt = Object.values(kilde).join("\n");
// The key login's little script runs in the owner's browser, not in the Worker: it is left out of
// the checks of what the Worker reads (and checked on its own in admin.test.mjs).
const skript = kilde["side.js"].slice(kilde["side.js"].indexOf("const INN_SKRIPT = `"), kilde["side.js"].indexOf("})();`;") + 6);
const worker = alt.replace(skript, "");
// The part of index.js that receives counts from the phones.
const mottak = kilde["index.js"].slice(kilde["index.js"].indexOf("async function taImot"), kilde["index.js"].indexOf("// ---------- Admin"));

test("the Worker reads four request headers and no others", () => {
  assert.ok(skript.length > 500 && skript.includes("sessionStorage"), "found the login script");
  const lest = [...worker.matchAll(/headers\.get\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(lest, ["Content-Length", "Content-Type", "Origin", "X-Admin-Nokkel"]);
  assert.doesNotMatch(worker, /headers\.(entries|keys|values|forEach)\b|\[\.\.\.\s*request\.headers|Object\.fromEntries\(\s*request\.headers/, "headers are never read in bulk");
});

test("no address, browser name, referrer, location or cookie is touched anywhere in the Worker", () => {
  assert.doesNotMatch(alt, /cf-connecting-ip|x-forwarded-for|x-real-ip|true-client-ip|forwarded/i);
  assert.doesNotMatch(alt.replace("User-agent: *", ""), /user-agent|sec-ch-ua|accept-language/i); // (robots.txt says «User-agent: *»)
  assert.doesNotMatch(alt, /["'`]referer["'`]/i);
  assert.doesNotMatch(alt, /request\.cf\b|\.cf\.|\bcountry\b|\bcolo\b|\basn\b/i);
  assert.doesNotMatch(alt, /set-cookie|["'`]cookie["'`]|document\.cookie/i);
});

test("nothing is logged; the only request the Worker makes is the health check of the rooms Worker", () => {
  assert.doesNotMatch(alt, /console\s*\./);
  assert.doesNotMatch(alt, /XMLHttpRequest|WebSocket|sendBeacon/);
  // One fetch in the Worker: helse.js, to the fixed address in oppsett.js. None anywhere else.
  const kall = Object.entries(kilde).flatMap(([fil, k]) => [...(fil === "side.js" ? k.replace(skript, "") : k).matchAll(/[^.\w]fetch\s*\(/g)].map(() => fil));
  assert.deepEqual(kall, ["helse.js"]);
  assert.match(kilde["helse.js"], /hent = \(url, valg\) => fetch\(url, valg\)/);
  assert.match(kilde["helse.js"], /await hent\(adresse, \{ method: "GET", redirect: "manual", signal: AbortSignal\.timeout\(frist\) \}\)/, "GET with no body and no headers of our own");
  assert.match(kilde["oppsett.js"], /export const NETT_HELSE = "https:\/\/rusj-nett\.[a-z0-9-]+\.workers\.dev\/";/);
  assert.doesNotMatch(mottak, /hent|fetch|sjekkNett/, "receiving counts never makes a request");
  // The login script only ever fetches its own /admin pages.
  for (const m of skript.matchAll(/fetch\(([^,]+),/g)) assert.match(m[1], /^(url|href)$/, m[0]);
});

test("the query string is read only by the owner's pages, and only these four names", () => {
  assert.doesNotMatch(mottak, /searchParams|\.search\b|\.hash\b|url\./, "POST /t never looks at the address");
  const navn = [...worker.matchAll(/searchParams\.get\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(navn, ["fra", "p", "sort", "til"]);
  assert.doesNotMatch(worker, /searchParams\.(entries|keys|values|forEach|toString|getAll)\b|\.search\b|\.hash\b/);
});

test("a referrer, free text or anything else outside the grammar can never be stored", async () => {
  const db = falskD1();
  const ting = [
    "kilde.https://www.google.com/search?q=kari", "kilde.www.google.com", "kilde.google", "kilde.l.facebook.com", "kilde.sok.google",
    "kilde.sok ", "referrer.google", "ref.facebook", "fra.vg.no", "utgave.nb-NO", "type.iPhone 15", "type.1280x800", "feil.ordugla.TypeError: x is undefined",
    "feil.ordugla:42", "nett.rom.ordugla.ABC234", "nett.kode.ABC234", "jul.Kari", "tekst.hei på deg", "navn.kari-nordmann", "Hei, jeg heter Kari",
  ];
  let talt = 0;
  for (const k of ting) {
    const svar = await handter(post(pakke("besok", k)), { DB: db }, {}, NAA);
    // Over 40 characters: the whole batch is refused (400); otherwise the bad name is dropped (204).
    assert.equal(svar.status, k.length > 40 ? 400 : 204, k);
    if (svar.status === 204) talt++;
  }
  // Only «besok» (a valid name) was counted, once per accepted request; nothing else got in.
  assert.deepEqual(db.rader(), [{ dag: "2026-11-11", nokkel: "besok", n: talt }]);
  // A name too long for the grammar is refused as a whole.
  assert.equal((await handter(post(pakke("kilde." + "x".repeat(60))), { DB: db }, {}, NAA)).status, 400);
  // The monthly table is only ever filled from the daily one: no request can write to it.
  assert.deepEqual(db.mnd(), []);
});

test("the database is two tables of three columns: day or month, counter name, count", () => {
  const db = falskD1();
  assert.deepEqual(db.skjema(), [{ type: "table", name: "maned" }, { type: "table", name: "teller" }]);
  assert.deepEqual(db.kolonner("teller"), ["dag", "nokkel", "n"]);
  assert.deepEqual(db.kolonner("maned"), ["maned", "nokkel", "n"]);
  assert.equal(SKJEMA.match(/CREATE\s+(TABLE|INDEX|VIEW|TRIGGER)/gi).length, 1);
  assert.match(SKJEMA, /PRIMARY KEY \(dag, nokkel\)/);
  assert.equal(SKJEMA_2.match(/CREATE\s+(TABLE|INDEX|VIEW|TRIGGER)/gi).length, 1);
  assert.match(SKJEMA_2, /CREATE TABLE IF NOT EXISTS maned/);
  assert.match(SKJEMA_2, /PRIMARY KEY \(maned, nokkel\)/);
  assert.doesNotMatch(SKJEMA_2.replace(/--.*$/gm, ""), /DROP|ALTER|DELETE|UPDATE|INSERT/i);
  // The monthly table is written only from the daily one, never from a request.
  assert.doesNotMatch(kilde["index.js"].slice(kilde["index.js"].indexOf("async function taImot"), kilde["index.js"].indexOf("// ---------- Admin")), /maned/);
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
  assert.equal(sql.length, Object.keys(SQL).length);
  for (const s of sql) assert.doesNotMatch(s, /\$\{|'/, s);
  // Every statement comes from the SQL table; prepare() never gets anything else.
  for (const m of kilde["index.js"].matchAll(/\.prepare\(([^)]*)\)/g)) assert.match(m[1], /^SQL\.[a-zA-Z]+$|^sql$/, m[0]);
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
