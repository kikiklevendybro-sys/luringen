// The privacy rules, checked against the source itself: what the Worker and the room read, what
// a room can hold, that nothing is logged, and that a seat's token only goes to its own phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { falskNavnerom, koble, romMedVert } from "./falsk.mjs";
import { handter } from "../src/index.js";

const mappe = new URL("../src/", import.meta.url);
const filer = readdirSync(mappe).filter((f) => f.endsWith(".js"));
const kilde = Object.fromEntries(filer.map((f) => [f, readFileSync(new URL(f, mappe), "utf8")]));
const alt = Object.values(kilde).join("\n");

test("the Worker reads two request headers and no others", () => {
  const lest = [...new Set([...alt.matchAll(/headers\.get\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(lest, ["Origin", "Upgrade"]);
  assert.doesNotMatch(alt, /headers\.(entries|keys|values|forEach|has)\b|\[\.\.\.\s*request\.headers|Object\.fromEntries\(\s*request\.headers/, "headers are never read in bulk");
});

test("no address, browser name, referrer, location or cookie is touched anywhere", () => {
  assert.doesNotMatch(alt, /cf-connecting-ip|x-forwarded-for|x-real-ip|true-client-ip|forwarded/i);
  assert.doesNotMatch(alt.replace("User-agent: *", ""), /user-agent|sec-ch-ua|accept-language/i); // (robots.txt says «User-agent: *»)
  assert.doesNotMatch(alt, /["'`]referer["'`]/i);
  assert.doesNotMatch(alt, /request\.cf\b|\.cf\.|\bcountry\b|\bcolo\b|\basn\b/i);
  assert.doesNotMatch(alt, /set-cookie|["'`]cookie["'`]|document\.cookie/i);
});

test("nothing is logged, and no request leaves the Worker except to its own rooms", () => {
  assert.doesNotMatch(alt, /console\s*\./);
  assert.doesNotMatch(alt, /XMLHttpRequest|sendBeacon|new WebSocket\(/);
  // The only calls out are to a room stub (romFor: always in the EU); the room's own `fetch` is
  // the handler the Worker calls.
  assert.deepEqual([...alt.matchAll(/([\w$]+\([^()]*\))\.fetch\(/g)].map((m) => m[1]).sort(), ["romFor(env, kode)", "romFor(env, m[1])"]);
  const resten = alt.replace(/romFor\(env, (kode|m\[1\])\)\.fetch\(/g, "").replace(/async fetch\(request\) \{/g, "");
  assert.doesNotMatch(resten, /\bfetch\s*\(/);
});

test("the query string and the hash are never read", () => {
  assert.doesNotMatch(alt, /searchParams|\.search\b|\.hash\b/);
});

test("a room stores the game, setup, seed, seats (token + nickname) and the moves – nothing else", async () => {
  const r = await romMedVert("terninga", { oppsett: { variant: "vanlig" }, fro: 9 });
  const b = await koble(r, { "User-Agent": "HemmeligNettleser/1.0", "CF-Connecting-IP": "203.0.113.77", Cookie: "kari=1" });
  await b.send({ h: "bli", navn: "Testspiller B" });
  await r.vert.send({ h: "start" });
  await r.vert.send({ h: "trekk", n: 0, t: { kast: [0, 0, 0, 0, 0] } });
  await b.send({ h: "reaksjon", e: 2 });
  const nokler = [...r.ctx.storage.data.keys()].sort();
  assert.deepEqual(nokler, ["rom", "t:0000"]);
  const rom = r.ctx.storage.data.get("rom");
  assert.deepEqual(Object.keys(rom).sort(), ["ferdig", "fro", "kamp", "laget", "n", "oppsett", "seter", "sist", "spill", "startet", "v"]);
  for (const s of rom.seter) assert.deepEqual(Object.keys(s).sort(), ["navn", "token"]);
  const spor = JSON.stringify([...r.ctx.storage.data]);
  assert.doesNotMatch(spor, /203\.0\.113|HemmeligNettleser|kari|😀/);
});

test("a seat's token goes only to its own phone, never to the others", async () => {
  const r = await romMedVert("terninga");
  const b = await koble(r);
  await b.send({ h: "bli", navn: "Testspiller B" });
  const c = await koble(r);
  await c.send({ h: "bli", navn: "Testspiller C" });
  const tokens = r.ctx.storage.data.get("rom").seter.map((s) => s.token);
  for (const [i, p] of [r.vert, b, c].entries()) {
    const fremmede = tokens.filter((_, j) => j !== i);
    const sett = JSON.stringify(p.mottatt);
    for (const t of fremmede) assert.equal(sett.includes(t), false, `phone ${i} saw another seat's token`);
  }
});

test("the answers set no cookie and reveal nothing about the caller", async () => {
  const ROM = falskNavnerom();
  const svar = [
    await handter(new Request("https://nett.example/rom", { method: "POST", headers: { Origin: "https://rusj.no" } }), { ROM }),
    await handter(new Request("https://nett.example/"), { ROM }),
    await handter(new Request("https://nett.example/rom", { method: "POST", headers: { Origin: "https://evil.example" } }), { ROM }),
  ];
  for (const s of svar) {
    assert.equal(s.headers.get("Set-Cookie"), null);
    assert.equal(s.headers.get("Cache-Control"), "no-store");
    assert.equal(s.headers.get("X-Robots-Tag"), "noindex, nofollow");
  }
});

test("wrangler.toml: Cloudflare's request logs are off, and the room class is SQLite-backed", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(toml, /\[observability\]\s*\nenabled = false/);
  assert.match(toml, /new_sqlite_classes = \["Rom"\]/);
  assert.doesNotMatch(toml, /new_classes/);
  assert.match(toml, /class_name = "Rom"/);
});
