// The Worker in front of the rooms (src/index.js): who may open a room, the code it hands out,
// and that every room is made in the EU.
import { test } from "node:test";
import assert from "node:assert/strict";
import { falskNavnerom, FalskSokkel } from "./falsk.mjs";
import { handter, tillattOpprinnelse, nyKode } from "../src/index.js";
import { ALFABET, KODE } from "../src/oppsett.js";

const RUSJ = "https://rusj.no";
const post = (hode = {}) => new Request("https://nett.example/rom", { method: "POST", headers: { Origin: RUSJ, ...hode } });
const ws = (kode, hode = {}) => new Request(`https://nett.example/rom/${kode}`, { headers: { Upgrade: "websocket", Origin: RUSJ, ...hode } });

test("POST /rom from rusj.no gives a fresh 6-sign code, reserved in the EU", async () => {
  const ROM = falskNavnerom();
  const svar = await handter(post(), { ROM });
  assert.equal(svar.status, 201);
  assert.equal(svar.headers.get("Access-Control-Allow-Origin"), RUSJ);
  assert.equal(svar.headers.get("Cache-Control"), "no-store");
  const { kode } = await svar.json();
  assert.match(kode, KODE);
  assert.deepEqual(ROM.kall, [{ jurisdiksjon: "eu", navn: kode }]);
  const lagret = await ROM.rom.get(`eu:${kode}`).ctx.storage.get("rom");
  assert.equal(lagret.spill, null, "reserved, not set up yet");
});

test("every room is reached through jurisdiction('eu'), never the plain namespace", async () => {
  const ROM = falskNavnerom();
  const { kode } = await (await handter(post(), { ROM })).json();
  const svar = await handter(ws(kode), { ROM });
  assert.equal(svar.status, 101);
  assert.ok(svar.webSocket instanceof FalskSokkel);
  assert.ok(ROM.kall.every((k) => k.jurisdiksjon === "eu"));
  assert.equal(ROM.kall.length, 2);
});

test("a code that is taken is never handed out: the Worker draws again", async () => {
  const ROM = falskNavnerom();
  const forste = (await (await handter(post(), { ROM })).json()).kode;
  // Make the next draws collide with the first code a few times.
  const ekte = crypto.getRandomValues.bind(crypto);
  let ganger = 0;
  crypto.getRandomValues = (a) => {
    if (ganger++ < 3) {
      for (let i = 0; i < a.length; i++) a[i] = i < 6 ? ALFABET.indexOf(forste[i]) : 0;
      return a;
    }
    return ekte(a);
  };
  try {
    const andre = (await (await handter(post(), { ROM })).json()).kode;
    assert.notEqual(andre, forste);
    assert.equal(ganger, 4);
  } finally {
    crypto.getRandomValues = ekte;
  }
});

test("only https://rusj.no may open a room (localhost only with LOKAL=1)", async () => {
  const ROM = falskNavnerom();
  for (const opprinnelse of [null, "https://evil.example", "http://rusj.no", "https://rusj.no.evil.example", "null", "http://localhost:8080"]) {
    const req = new Request("https://nett.example/rom", { method: "POST", headers: opprinnelse ? { Origin: opprinnelse } : {} });
    const svar = await handter(req, { ROM });
    assert.equal(svar.status, 403, String(opprinnelse));
    assert.equal(svar.headers.get("Access-Control-Allow-Origin"), null);
  }
  assert.equal(ROM.kall.length, 0, "no room was touched");
  assert.equal((await handter(post({ Origin: "http://localhost:8080" }), { ROM, LOKAL: "1" })).status, 201);
  assert.equal((await handter(post({ Origin: "http://127.0.0.1:9" }), { ROM, LOKAL: "1" })).status, 201);
  assert.equal(tillattOpprinnelse("http://localhost:8080", { LOKAL: "0" }), false);
  assert.equal(tillattOpprinnelse("http://192.168.1.2:8080", { LOKAL: "1" }), false);
});

test("the socket upgrade checks the origin too", async () => {
  const ROM = falskNavnerom();
  const { kode } = await (await handter(post(), { ROM })).json();
  assert.equal((await handter(ws(kode, { Origin: "https://evil.example" }), { ROM })).status, 403);
  const uten = new Request(`https://nett.example/rom/${kode}`, { headers: { Upgrade: "websocket" } });
  assert.equal((await handter(uten, { ROM })).status, 403);
  assert.equal((await handter(ws(kode, { Origin: "http://localhost:1234" }), { ROM, LOKAL: "1" })).status, 101);
});

test("GET /rom/<kode>: a socket only, and only for a well-formed code", async () => {
  const ROM = falskNavnerom();
  assert.equal((await handter(new Request("https://nett.example/rom/ABCDEF", { headers: { Origin: RUSJ } }), { ROM })).status, 426);
  for (const kode of ["abcdef", "ABCDE", "ABCDEFG", "ABCDE0", "ABCDEI", "ABC%20F", "reserver"]) assert.equal((await handter(ws(kode), { ROM })).status, 404, kode);
  assert.equal((await handter(new Request("https://nett.example/rom/ABCDEF", { method: "POST", headers: { Origin: RUSJ } }), { ROM })).status, 405);
  assert.equal(ROM.kall.length, 0);
});

test("other methods and paths", async () => {
  const ROM = falskNavnerom();
  assert.equal((await handter(new Request("https://nett.example/rom", { headers: { Origin: RUSJ } }), { ROM })).status, 405);
  const pre = await handter(new Request("https://nett.example/rom", { method: "OPTIONS", headers: { Origin: RUSJ } }), { ROM });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("Access-Control-Allow-Origin"), RUSJ);
  assert.equal((await handter(new Request("https://nett.example/rom", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), { ROM })).status, 403);
  const helse = await handter(new Request("https://nett.example/"), { ROM });
  assert.equal(await helse.text(), "rusj-nett: ok\n");
  assert.equal((await handter(new Request("https://nett.example/robots.txt"), { ROM })).status, 200);
  assert.equal((await handter(new Request("https://nett.example/admin"), { ROM })).status, 404);
});

test("the optional brake on POST /rom counts the endpoint, not the caller", async () => {
  const ROM = falskNavnerom();
  const nokler = [];
  const FART = { limit: async ({ key }) => (nokler.push(key), { success: nokler.length <= 2 }) };
  assert.equal((await handter(post(), { ROM, FART })).status, 201);
  assert.equal((await handter(post(), { ROM, FART })).status, 201);
  assert.equal((await handter(post(), { ROM, FART })).status, 429);
  assert.deepEqual(nokler, ["rom", "rom", "rom"]);
});

test("codes: six signs from the alphabet, every sign used, no look-alikes", () => {
  assert.equal(ALFABET.length, 31);
  assert.doesNotMatch(ALFABET, /[01OIL]/);
  const sett = new Map();
  for (let i = 0; i < 4000; i++) {
    const k = nyKode();
    assert.match(k, KODE);
    for (const c of k) sett.set(c, (sett.get(c) || 0) + 1);
  }
  assert.equal(sett.size, 31);
  // Roughly even: 24 000 signs / 31 ≈ 774 each.
  for (const [c, n] of sett) assert.ok(n > 600 && n < 960, `${c}: ${n}`);
});

test("without jurisdictions (the local simulator) rooms work only with LOKAL=1; otherwise nothing is made", async () => {
  const kast = () => {
    throw new Error("Jurisdiction restrictions are not implemented in workerd.");
  };
  let brukt = 0;
  const vanlig = falskNavnerom();
  const utenEu = { jurisdiction: kast, idFromName: (navn) => (brukt++, { jurisdiksjon: "lokal", navn }), get: (id) => vanlig.jurisdiction("lokal").get(id) };
  assert.equal((await handter(post(), { ROM: utenEu })).status, 503);
  assert.equal(brukt, 0, "the plain namespace is never used outside local testing");
  assert.equal((await handter(post({ Origin: "http://localhost:8787" }), { ROM: utenEu, LOKAL: "1" })).status, 201);
  assert.equal(brukt, 1);
});
