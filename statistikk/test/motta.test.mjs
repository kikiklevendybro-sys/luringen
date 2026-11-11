// POST /t: what is accepted, what is refused, and what ends up in the database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handter, tillattOpprinnelse, lesKropp, SQL } from "../src/index.js";
import { MAKS_BYTES, MAKS_NOKLER } from "../src/oppsett.js";
import { falskD1, post, pakke, NAA } from "./falsk-d1.mjs";

const send = (db, req, naa = NAA, env = {}) => handter(req, { DB: db, ...env }, {}, naa);

test("a batch adds 1 to each counter for today's date in Norway", async () => {
  const db = falskD1();
  const svar = await send(db, post(pakke("side.ordugla", "besok", "enhet.ny", "unik.uke", "unik.mnd")));
  assert.equal(svar.status, 204);
  assert.equal(await svar.text(), "");
  assert.deepEqual(db.somObjekt("2026-11-11"), { besok: 1, "enhet.ny": 1, "side.ordugla": 1, "unik.mnd": 1, "unik.uke": 1 });
});

test("the same counter again is an upsert: n grows, no second row", async () => {
  const db = falskD1();
  for (let i = 0; i < 3; i++) await send(db, post(pakke("side.ordugla", "start.ordugla")));
  await send(db, post(pakke("side.ordugla")));
  assert.deepEqual(db.rader(), [
    { dag: "2026-11-11", nokkel: "side.ordugla", n: 4 },
    { dag: "2026-11-11", nokkel: "start.ordugla", n: 3 },
  ]);
  assert.ok(db.logg.every((l) => l.sql === SQL.tell), "only the upsert statement is used");
});

test("a name repeated inside one batch counts once", async () => {
  const db = falskD1();
  await send(db, post(pakke("besok", "besok", "besok", "start.sauen", "start.sauen")));
  assert.deepEqual(db.somObjekt("2026-11-11"), { besok: 1, "start.sauen": 1 });
});

test("the day is the Oslo day, also around midnight and in summer time", async () => {
  const db = falskD1();
  await send(db, post(pakke("besok")), new Date("2026-11-11T22:59:59Z")); // 23:59 in Norway
  await send(db, post(pakke("besok")), new Date("2026-11-11T23:00:00Z")); // 00:00 the next day
  await send(db, post(pakke("besok")), new Date("2026-07-01T21:59:59Z")); // 23:59 summer time
  await send(db, post(pakke("besok")), new Date("2026-07-01T22:00:00Z")); // 00:00 the next day
  assert.deepEqual(db.rader().map((r) => r.dag), ["2026-07-01", "2026-07-02", "2026-11-11", "2026-11-12"]);
});

test("the client cannot choose the day or the amount", async () => {
  const db = falskD1();
  for (const kropp of ['{"v":1,"k":["besok"],"dag":"2020-01-01"}', '{"v":1,"k":["besok"],"n":1000}', '{"v":1,"k":[["besok",1000]]}', '{"v":1,"k":{"besok":1000}}']) {
    assert.equal((await send(db, post(kropp))).status, 400, kropp);
  }
  assert.deepEqual(db.rader(), []);
});

test("names outside the grammar never reach the database", async () => {
  const db = falskD1();
  const svar = await send(db, post(pakke("side.ordugla", "navn.kari", "start.ukjentspill", "kari@example.com", "side.forside'; DROP TABLE teller;--", "modus.lag", "<script>")));
  assert.equal(svar.status, 204, "the valid name is counted, the rest are dropped without comment");
  assert.deepEqual(db.rader(), [{ dag: "2026-11-11", nokkel: "side.ordugla", n: 1 }]);
  // Only garbage: the same answer, and no query at all.
  const for_ = db.logg.length;
  assert.equal((await send(db, post(pakke("navn.kari", "tull")))).status, 204);
  assert.equal(db.logg.length, for_);
});

test("an unknown page is stored as side.annet", async () => {
  const db = falskD1();
  await send(db, post(pakke("side.om", "side.personvern", "side.helt-ugyldig")));
  assert.deepEqual(db.rader(), [{ dag: "2026-11-11", nokkel: "side.annet", n: 1 }]);
});

test("malformed bodies are refused with 400 and nothing is stored", async () => {
  const db = falskD1();
  for (const kropp of ["", "besok", "{}", "[]", '{"v":1,"k":[]}', '{"v":2,"k":["besok"]}', '{"v":1,"k":["besok"],"bruker":"x"}', '{"v":1,"k":[42]}', "\u0000\u0001"]) {
    const svar = await send(db, post(kropp));
    assert.equal(svar.status, 400, JSON.stringify(kropp));
  }
  assert.deepEqual(db.rader(), []);
  assert.equal(db.logg.length, 0);
});

test("a batch with too many names is refused as a whole", async () => {
  const db = falskD1();
  const mange = Array.from({ length: MAKS_NOKLER + 1 }, () => "besok");
  assert.equal((await send(db, post(pakke(...mange)))).status, 400);
  assert.deepEqual(db.rader(), []);
  // Exactly the limit is fine (and still counts each name once).
  assert.equal((await send(db, post(pakke(...mange.slice(1))))).status, 204);
  assert.deepEqual(db.somObjekt("2026-11-11"), { besok: 1 });
});

test("a body that is too large is refused before it is read", async () => {
  const db = falskD1();
  const stor = JSON.stringify({ v: 1, k: ["besok"], fyll: "x".repeat(MAKS_BYTES) });
  const req = (hode) => new Request("https://stat.example/t", { method: "POST", headers: { Origin: "https://rusj.no", "Content-Type": "text/plain", ...hode }, body: stor });
  const prov = async (hode, status) => {
    const r = req(hode);
    assert.equal((await send(db, r)).status, status, JSON.stringify(hode));
    assert.equal(r.bodyUsed, false, "the body was not touched");
  };
  await prov({ "Content-Length": String(stor.length) }, 413);
  await prov({ "Content-Length": "999999999" }, 413);
  // No Content-Length (a body of unknown size), or one that is not a plain number: refused unread.
  await prov({}, 411);
  for (const lengde of ["", "abc", "-1", "1e3", "1.5", "0x10", "1".repeat(10)]) await prov({ "Content-Length": lengde }, 411);
  assert.deepEqual(db.rader(), []);
});

test("a Content-Length that lies does not help: reading stops at the limit", async () => {
  const db = falskD1();
  let biter = 0;
  const strom = new ReadableStream({
    pull(c) {
      biter++;
      c.enqueue(new TextEncoder().encode("x".repeat(512)));
      if (biter > 1000) c.close();
    },
  });
  const req = new Request("https://stat.example/t", { method: "POST", headers: { Origin: "https://rusj.no", "Content-Type": "text/plain", "Content-Length": "10" }, body: strom, duplex: "half" });
  assert.equal((await send(db, req)).status, 413);
  assert.ok(biter < 20, `stopped reading early (read ${biter} chunks)`);
  assert.deepEqual(db.rader(), []);
});

test("lesKropp: exact limit is fine, one byte more is not, broken UTF-8 is not", async () => {
  const req = (kropp) => new Request("https://stat.example/t", { method: "POST", body: kropp });
  assert.equal(await lesKropp(req("a".repeat(MAKS_BYTES)), MAKS_BYTES), "a".repeat(MAKS_BYTES));
  assert.equal(await lesKropp(req("a".repeat(MAKS_BYTES + 1)), MAKS_BYTES), null);
  assert.equal(await lesKropp(req(new Uint8Array([0xff, 0xfe, 0xfd])), MAKS_BYTES), null);
  assert.equal(await lesKropp(new Request("https://stat.example/t", { method: "POST" }), MAKS_BYTES), "");
});

test("only https://rusj.no may send", async () => {
  const db = falskD1();
  const andre = ["https://evil.example", "https://rusj.no.evil.example", "https://www.rusj.no", "http://rusj.no", "https://rusj.no:8443", "https://xrusj.no", "null", "", "http://localhost:3000", "http://127.0.0.1:8080"];
  for (const opprinnelse of andre) {
    const svar = await send(db, post(pakke("besok"), { Origin: opprinnelse }));
    assert.equal(svar.status, 403, opprinnelse);
    assert.equal(svar.headers.get("Access-Control-Allow-Origin"), null, opprinnelse);
  }
  // No Origin header at all (curl, a server, a script).
  const uten = new Request("https://stat.example/t", { method: "POST", headers: { "Content-Type": "text/plain", "Content-Length": "21" }, body: JSON.stringify(pakke("besok")) });
  assert.equal((await send(db, uten)).status, 403);
  assert.deepEqual(db.rader(), []);

  const svar = await send(db, post(pakke("besok")));
  assert.equal(svar.status, 204);
  assert.equal(svar.headers.get("Access-Control-Allow-Origin"), "https://rusj.no");
  assert.equal(svar.headers.get("Access-Control-Allow-Credentials"), null);
  assert.equal(svar.headers.get("Vary"), "Origin");
});

test("localhost may send only when LOKAL=1 (local testing)", async () => {
  assert.equal(tillattOpprinnelse("http://localhost:3000", {}), false);
  assert.equal(tillattOpprinnelse("http://localhost:3000", { LOKAL: "0" }), false);
  assert.equal(tillattOpprinnelse("http://localhost:3000", { LOKAL: "1" }), true);
  assert.equal(tillattOpprinnelse("http://localhost", { LOKAL: "1" }), true);
  assert.equal(tillattOpprinnelse("http://127.0.0.1:8787", { LOKAL: "1" }), true);
  assert.equal(tillattOpprinnelse("https://localhost:3000", { LOKAL: "1" }), false);
  assert.equal(tillattOpprinnelse("http://localhost.evil.example", { LOKAL: "1" }), false);
  assert.equal(tillattOpprinnelse("http://localhost:3000@evil.example", { LOKAL: "1" }), false);
  assert.equal(tillattOpprinnelse("https://evil.example", { LOKAL: "1" }), false);
  assert.equal(tillattOpprinnelse(null, { LOKAL: "1" }), false);
  const db = falskD1();
  const svar = await send(db, post(pakke("besok"), { Origin: "http://localhost:3000" }), NAA, { LOKAL: "1" });
  assert.equal(svar.status, 204);
  assert.equal(svar.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000");
});

test("GET, PUT and DELETE to /t are refused", async () => {
  const db = falskD1();
  for (const method of ["GET", "HEAD", "PUT", "DELETE", "PATCH"]) {
    const svar = await send(db, new Request("https://stat.example/t?k=besok", { method, headers: { Origin: "https://rusj.no" } }));
    assert.equal(svar.status, 405, method);
    assert.equal(svar.headers.get("Allow"), "POST, OPTIONS");
  }
  assert.deepEqual(db.rader(), []);
});

test("only text/plain bodies are read", async () => {
  const db = falskD1();
  for (const type of ["application/json", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "text/html", ""]) {
    const svar = await send(db, post(pakke("besok"), { "Content-Type": type }));
    assert.equal(svar.status, 415, type);
  }
  assert.equal((await send(db, post(pakke("besok"), { "Content-Type": "text/plain" }))).status, 204);
  assert.equal((await send(db, post(pakke("besok"), { "Content-Type": "TEXT/PLAIN; charset=utf-8" }))).status, 204);
  assert.deepEqual(db.somObjekt("2026-11-11"), { besok: 2 });
});

test("preflight is answered for rusj.no only", async () => {
  const db = falskD1();
  const opt = (opprinnelse) => send(db, new Request("https://stat.example/t", { method: "OPTIONS", headers: { Origin: opprinnelse, "Access-Control-Request-Method": "POST" } }));
  const ja = await opt("https://rusj.no");
  assert.equal(ja.status, 204);
  assert.equal(ja.headers.get("Access-Control-Allow-Origin"), "https://rusj.no");
  assert.equal(ja.headers.get("Access-Control-Allow-Methods"), "POST");
  assert.equal((await opt("https://evil.example")).status, 403);
});

test("the optional brake: over the limit gives 429 and nothing is stored; the key is a constant", async () => {
  const db = falskD1();
  const kall = [];
  let igjen = 2;
  const FART = { limit: async (valg) => (kall.push(valg), { success: igjen-- > 0 }) };
  const statuser = [];
  for (let i = 0; i < 4; i++) statuser.push((await send(db, post(pakke("besok")), NAA, { FART })).status);
  assert.deepEqual(statuser, [204, 204, 429, 429]);
  assert.deepEqual(db.somObjekt("2026-11-11"), { besok: 2 });
  assert.deepEqual(kall, Array(4).fill({ key: "t" }), "the same key for everyone: requests are counted, not senders");
  // A request from the wrong origin does not use up the budget.
  await send(db, post(pakke("besok"), { Origin: "https://evil.example" }), NAA, { FART });
  assert.equal(kall.length, 4);
});

test("a database error gives 503 and no detail", async () => {
  const db = falskD1();
  db.tilstand.feil = true;
  const svar = await send(db, post(pakke("besok")));
  assert.equal(svar.status, 503);
  assert.doesNotMatch(await svar.text(), /D1|SQL|teller/);
});

test("every answer from /t is uncacheable and unsniffable", async () => {
  const db = falskD1();
  for (const req of [post(pakke("besok")), post("tull"), post(pakke("besok"), { Origin: "https://evil.example" })]) {
    const svar = await send(db, req);
    assert.equal(svar.headers.get("Cache-Control"), "no-store");
    assert.equal(svar.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(svar.headers.get("Set-Cookie"), null);
  }
});

test("health text, robots and unknown paths", async () => {
  const db = falskD1();
  const hent = (sti) => send(db, new Request("https://stat.example" + sti));
  const rot = await hent("/");
  assert.equal(rot.status, 200);
  assert.equal(await rot.text(), "rusj-statistikk: ok\n");
  assert.match(await (await hent("/robots.txt")).text(), /Disallow: \//);
  for (const sti of ["/t/", "/T", "/admin/", "/admin/annet", "/favicon.ico", "/.env", "/t/../admin"]) {
    const svar = await hent(sti);
    assert.ok([404, 405, 401].includes(svar.status), `${sti} → ${svar.status}`);
  }
  assert.equal((await hent("/finnes-ikke")).status, 404);
  assert.equal(db.logg.length, 0);
});
