// The admin page and its JSON: closed unless Cloudflare Access or the admin key says otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handter, adminInnlogging, likTid, nokkelPaa } from "../src/index.js";
import { falskD1, NAA } from "./falsk-d1.mjs";

const NOKKEL = "Zr8mK2vQ9xT4bN7cW1yH6dJ3fL5gP0sAeUiOqRtYzXw="; // made up for the tests, 44 characters
const AUD = "4714c1358e65fe4b408ad6d432a5f878f08194bdb4752441fd56faefa9b2b6f2"; // made up
const RUTER = ["/admin", "/admin/data.json"];

const hent = (sti, hode = {}, env = {}, ctx = {}, method = "GET") => handter(new Request("https://stat.example" + sti, { method, headers: hode }), { DB: falskD1(), ...env }, ctx, NAA);

test("no key → 401 on both admin routes, and no numbers in the answer", async () => {
  for (const sti of RUTER) {
    const svar = await hent(sti, {}, { ADMIN_NOKKEL: NOKKEL });
    assert.equal(svar.status, 401, sti);
    const tekst = await svar.text();
    assert.doesNotMatch(tekst, /"perioder"|"kalender"|class="panel|class="setning|Hvor mange (var innom|bruker rusj)/, sti);
  }
});

test("wrong key → 401", async () => {
  const feil = [NOKKEL.slice(0, -1), NOKKEL + "x", NOKKEL.toLowerCase(), NOKKEL.slice(1), " " + NOKKEL.slice(1), "x".repeat(44), "x", "undefined", "null"];
  for (const sti of RUTER) for (const gitt of feil) assert.equal((await hent(sti, { "X-Admin-Nokkel": gitt }, { ADMIN_NOKKEL: NOKKEL })).status, 401, `${sti} ${gitt}`);
});

test("the right key in the header → 200", async () => {
  const side = await hent("/admin", { "X-Admin-Nokkel": NOKKEL }, { ADMIN_NOKKEL: NOKKEL });
  assert.equal(side.status, 200);
  assert.match(await side.text(), /Hvor mange bruker rusj\?/);
  const data = await hent("/admin/data.json", { "X-Admin-Nokkel": NOKKEL }, { ADMIN_NOKKEL: NOKKEL });
  assert.equal(data.status, 200);
  assert.equal(data.headers.get("Content-Type"), "application/json; charset=utf-8");
  const json = await data.json();
  assert.equal(json.iDag, "2026-11-11");
  assert.deepEqual(json.perioder.map((p) => p.id), ["idag", "igar", "d7", "d30"]);
});

test("the key is never accepted from the address, a cookie or another header", async () => {
  const env = { ADMIN_NOKKEL: NOKKEL };
  const k = encodeURIComponent(NOKKEL);
  for (const sti of RUTER) {
    assert.equal((await hent(`${sti}?nokkel=${k}`, {}, env)).status, 401);
    assert.equal((await hent(`${sti}?X-Admin-Nokkel=${k}&key=${k}&ADMIN_NOKKEL=${k}`, {}, env)).status, 401);
    assert.equal((await hent(sti, { Cookie: `nokkel=${NOKKEL}; X-Admin-Nokkel=${NOKKEL}` }, env)).status, 401);
    assert.equal((await hent(sti, { Authorization: `Bearer ${NOKKEL}` }, env)).status, 401);
  }
});

test("closed when no key is configured, or the configured key is too short", async () => {
  for (const env of [{}, { ADMIN_NOKKEL: "" }, { ADMIN_NOKKEL: "kort" }, { ADMIN_NOKKEL: "x".repeat(31) }, { ADMIN_NOKKEL: 12345678901234567890123456789012 }]) {
    assert.equal(nokkelPaa(env), false);
    for (const sti of RUTER) {
      for (const gitt of [undefined, "", "kort", "x".repeat(31), String(env.ADMIN_NOKKEL)]) {
        const hode = gitt === undefined ? {} : { "X-Admin-Nokkel": gitt };
        assert.equal((await hent(sti, hode, env)).status, 401, `${sti} ${JSON.stringify(env)} ${gitt}`);
      }
    }
  }
  const side = await (await hent("/admin", {}, {})).text();
  assert.match(side, /Innlogging er ikke satt opp ennå/);
  assert.doesNotMatch(side, /<form/);
});

test("the comparison is the timing-safe one, and it is only reached with a key to compare", async () => {
  const kall = [];
  const spion = async (a, b) => (kall.push([a, b]), likTid(a, b));
  const req = (hode) => new Request("https://stat.example/admin", { headers: hode });
  assert.equal(await adminInnlogging(req({ "X-Admin-Nokkel": "feil-nokkel" }), { ADMIN_NOKKEL: NOKKEL }, {}, spion), null);
  assert.equal(await adminInnlogging(req({ "X-Admin-Nokkel": NOKKEL }), { ADMIN_NOKKEL: NOKKEL }, {}, spion), "nokkel");
  assert.deepEqual(kall, [["feil-nokkel", NOKKEL], [NOKKEL, NOKKEL]]);
  // No header, or no configured key: nothing to compare, and closed.
  assert.equal(await adminInnlogging(req({}), { ADMIN_NOKKEL: NOKKEL }, {}, spion), null);
  assert.equal(await adminInnlogging(req({ "X-Admin-Nokkel": NOKKEL }), {}, {}, spion), null);
  assert.equal(await adminInnlogging(req({ "X-Admin-Nokkel": "x".repeat(201) }), { ADMIN_NOKKEL: NOKKEL }, {}, spion), null);
  assert.equal(kall.length, 2);
  // The default comparer is likTid (a wrong key fails, the right one passes).
  assert.equal(await adminInnlogging(req({ "X-Admin-Nokkel": NOKKEL }), { ADMIN_NOKKEL: NOKKEL }, {}), "nokkel");
});

test("likTid compares whole texts of any length", async () => {
  assert.equal(await likTid("abc", "abc"), true);
  assert.equal(await likTid(NOKKEL, NOKKEL), true);
  assert.equal(await likTid("abc", "abd"), false);
  assert.equal(await likTid("abc", "abcd"), false);
  assert.equal(await likTid("", "abc"), false);
  assert.equal(await likTid("æøå", "æøå"), true);
  assert.equal(await likTid("a".repeat(1000), "a".repeat(999) + "b"), false);
  const kilde = likTid.toString();
  assert.match(kilde, /SHA-256/, "both sides are hashed to the same length first");
  assert.match(kilde, /\|=/, "differences are collected, not returned early");
  assert.doesNotMatch(kilde, /===\s*b\b|a\s*===\s*b|return false/, "no early exit on the first difference");
});

test("Cloudflare Access: accepted only for the configured application", async () => {
  const med = (ctx, env) => hent("/admin", {}, env, ctx);
  assert.equal((await med({ access: { aud: AUD } }, { ACCESS_AUD: AUD })).status, 200);
  assert.equal((await med({ access: { aud: [AUD] } }, { ACCESS_AUD: AUD })).status, 200);
  assert.equal((await hent("/admin/data.json", {}, { ACCESS_AUD: AUD }, { access: { aud: AUD } })).status, 200);
  // Another application, no application configured, or no Access at all.
  assert.equal((await med({ access: { aud: "f".repeat(64) } }, { ACCESS_AUD: AUD })).status, 401);
  assert.equal((await med({ access: { aud: AUD } }, {})).status, 401);
  assert.equal((await med({ access: { aud: "" } }, { ACCESS_AUD: "" })).status, 401);
  assert.equal((await med({ access: {} }, { ACCESS_AUD: AUD })).status, 401);
  assert.equal((await med({}, { ACCESS_AUD: AUD })).status, 401);
  assert.equal((await med(undefined, { ACCESS_AUD: AUD })).status, 401);
  // A header that looks like Access is not Access: only Cloudflare can set ctx.access.
  assert.equal((await hent("/admin", { "Cf-Access-Jwt-Assertion": "a.b.c", "Cf-Access-Authenticated-User-Email": "eier@example.com" }, { ACCESS_AUD: AUD })).status, 401);
});

test("Access login gets a plain logout link; key login gets the logout button", async () => {
  const access = await (await hent("/admin", {}, { ACCESS_AUD: AUD }, { access: { aud: AUD } })).text();
  assert.match(access, /href="\/cdn-cgi\/access\/logout"/);
  const nokkel = await (await hent("/admin", { "X-Admin-Nokkel": NOKKEL }, { ADMIN_NOKKEL: NOKKEL })).text();
  assert.match(nokkel, /data-logg-ut/);
});

test("strict headers on the admin page", async () => {
  for (const [hode, env] of [[{}, { ADMIN_NOKKEL: NOKKEL }], [{ "X-Admin-Nokkel": NOKKEL }, { ADMIN_NOKKEL: NOKKEL }]]) {
    const svar = await hent("/admin", hode, env);
    const csp = svar.headers.get("Content-Security-Policy");
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /base-uri 'none'/);
    assert.match(csp, /form-action 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*|https?:/);
    assert.equal(svar.headers.get("Cache-Control"), "no-store");
    assert.equal(svar.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(svar.headers.get("X-Frame-Options"), "DENY");
    assert.equal(svar.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(svar.headers.get("Referrer-Policy"), "no-referrer");
    assert.equal(svar.headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.equal(svar.headers.get("Set-Cookie"), null);
    assert.equal(svar.headers.get("Access-Control-Allow-Origin"), null);
    const html = await svar.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    // The nonce in the header is the one on the page, and it is new for every answer.
    const nonce = /style-src 'nonce-([^']+)'/.exec(csp)[1];
    assert.ok(html.includes(`<style nonce="${nonce}">`));
    const igjen = (await hent("/admin", hode, env)).headers.get("Content-Security-Policy");
    assert.notEqual(/style-src 'nonce-([^']+)'/.exec(igjen)[1], nonce);
  }
  const json = await hent("/admin/data.json", {}, { ADMIN_NOKKEL: NOKKEL });
  assert.equal(json.headers.get("Cache-Control"), "no-store");
  assert.equal(json.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(json.headers.get("X-Robots-Tag"), "noindex, nofollow");
});

test("the dashboard has no script; the login page has exactly one, with the nonce", async () => {
  const inne = await hent("/admin", { "X-Admin-Nokkel": NOKKEL }, { ADMIN_NOKKEL: NOKKEL });
  assert.doesNotMatch(inne.headers.get("Content-Security-Policy"), /script-src|connect-src/);
  assert.doesNotMatch(await inne.text(), /<script/);
  const ute = await hent("/admin", {}, { ADMIN_NOKKEL: NOKKEL });
  const csp = ute.headers.get("Content-Security-Policy");
  const nonce = /script-src 'nonce-([^']+)'/.exec(csp)[1];
  assert.match(csp, /connect-src 'self'/);
  const html = await ute.text();
  assert.equal(html.match(/<script/g).length, 1);
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  // The key goes into sessionStorage and a header; never into the address or a cookie.
  assert.match(html, /sessionStorage/);
  assert.match(html, /"X-Admin-Nokkel":nokkel/);
  assert.doesNotMatch(html, /localStorage|document\.cookie|location\.(href|search|hash)\s*=|\?nokkel=/);
  assert.match(html, /<form id="inn" method="post"/, "if the script fails, a submit can never put the key in the address");
  assert.match(html, /type="password"/);
});

test("the admin page loads nothing from anywhere else", async () => {
  for (const hode of [{}, { "X-Admin-Nokkel": NOKKEL }]) {
    const html = await (await hent("/admin", hode, { ADMIN_NOKKEL: NOKKEL })).text();
    assert.doesNotMatch(html, /(src|href|action|srcset|poster|data)\s*=\s*["']?\s*(https?:)?\/\//i);
    assert.doesNotMatch(html, /<link|<img|<iframe|<object|<embed|@import|url\(/i);
    assert.doesNotMatch(html, /\sstyle="/, "no inline style attributes (the policy would block them)");
    for (const lenke of html.matchAll(/(?:href|action)="([^"]*)"/g)) assert.match(lenke[1], /^\/(admin|cdn-cgi\/access\/logout)$/);
  }
});

test("only GET and HEAD on the admin routes", async () => {
  for (const sti of RUTER) {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      assert.equal((await hent(sti, { "X-Admin-Nokkel": NOKKEL }, { ADMIN_NOKKEL: NOKKEL }, {}, method)).status, 405, `${method} ${sti}`);
    }
  }
  const hode = await hent("/admin", { "X-Admin-Nokkel": NOKKEL }, { ADMIN_NOKKEL: NOKKEL }, {}, "HEAD");
  assert.equal(hode.status, 200);
  assert.equal(await hode.text(), "");
});

test("admin never writes to the database", async () => {
  const db = falskD1();
  db.sett("2026-11-10", "besok", 5);
  await handter(new Request("https://stat.example/admin", { headers: { "X-Admin-Nokkel": NOKKEL } }), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA);
  await handter(new Request("https://stat.example/admin/data.json", { headers: { "X-Admin-Nokkel": NOKKEL } }), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA);
  assert.ok(db.logg.length >= 2);
  assert.ok(db.logg.every((l) => /^SELECT/.test(l.sql)));
  assert.deepEqual(db.rader(), [{ dag: "2026-11-10", nokkel: "besok", n: 5 }]);
  // Not logged in: no query at all.
  const for_ = db.logg.length;
  await handter(new Request("https://stat.example/admin"), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA);
  await handter(new Request("https://stat.example/admin/data.json"), { DB: db, ADMIN_NOKKEL: NOKKEL }, {}, NAA);
  assert.equal(db.logg.length, for_);
});
