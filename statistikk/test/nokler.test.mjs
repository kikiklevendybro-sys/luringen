// The grammar of counter names: what is counted, and that nothing else can be.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renNokkel, tolkPakke, gyldigeNokler, alleNokler, fasteNokler, SPILL_ID } from "../src/nokler.js";
import { SPILL, DAGLIGE, MAKS_NOKLER, MAKS_NOKKEL_LENGDE } from "../src/oppsett.js";
import { OPPSETT } from "./fast-oppsett.mjs";

test("every name in the vocabulary is accepted unchanged", () => {
  const alle = alleNokler();
  assert.equal(new Set(alle).size, alle.length, "no name twice");
  for (const k of alle) assert.equal(renNokkel(k), k, k);
  // every game × (side, start, ferdig, daglig) + forside + annet + the fixed names
  assert.equal(alle.length, Object.keys(SPILL).length * 4 + 2 + fasteNokler().length);
});

test("dailies: «dagens» goes from 1 to 9, and «daglig» takes any game on the list", () => {
  for (let n = 1; n <= 9; n++) assert.equal(renNokkel("dagens." + n), "dagens." + n);
  for (const n of [0, 10, 11, 99, -1, "01", "1.5", "x"]) assert.equal(renNokkel("dagens." + n), null, String(n));
  for (const id of DAGLIGE) assert.equal(renNokkel("daglig." + id), "daglig." + id);
  // Which games are dailies changes on the site; a new one is counted from day one.
  assert.equal(renNokkel("daglig.sauen", OPPSETT), "daglig.sauen");
  assert.equal(renNokkel("daglig.ukjentspill", OPPSETT), null);
});

test("the fixed names are exactly these", () => {
  assert.deepEqual(fasteNokler(), [
    "besok",
    "enhet.ny", "enhet.igar", "enhet.uke", "enhet.lenge",
    "unik.uke", "unik.mnd",
    "app",
    "tid.1", "tid.3", "tid.10", "tid.30",
    "dagens.1", "dagens.2", "dagens.3", "dagens.4", "dagens.5", "dagens.6", "dagens.7", "dagens.8", "dagens.9",
    "rekke.1", "rekke.2", "rekke.4", "rekke.7", "rekke.14", "rekke.30",
  ]);
});

test("every name fits the size limit and game ids fit the id pattern", () => {
  for (const k of alleNokler()) assert.ok(k.length <= MAKS_NOKKEL_LENGDE, k);
  for (const id of Object.keys(SPILL)) assert.match(id, SPILL_ID);
  for (const id of DAGLIGE) assert.ok(Object.hasOwn(SPILL, id), id);
});

test("names outside the grammar are rejected", () => {
  const ugyldige = [
    "", " ", "besok ", " besok", "Besok", "BESOK", "besøk", "besok.1", "visning", "start", "side", "side.", ".ordugla",
    "enhet", "enhet.", "enhet.na", "enhet.NY", "unik.dag", "unik.aar", "tid.0", "tid.2", "tid.5", "tid.60", "tid.-1", "tid.1.0",
    "dagens.0", "dagens.10", "dagens.1.1", "rekke.3", "rekke.0", "rekke.31", "app.1",
    "start.ukjentspill", "ferdig.ukjentspill", "daglig.ukjent", "start.forside", "ferdig.annet", "daglig.forside",
    "start.Ordugla", "start.ordugla ", "start. ordugla", "start.ordugla.2", "start..ordugla", "start.ord ugla", "start.ordugla\n",
    "start.o", "start." + "a".repeat(25), "side." + "a".repeat(25), "side.a", "side.om-oss", "side.om_oss", "side.OM", "side.æøå",
    "modus.lag", "spillere.4", "navn.kari", "epost.kari", "ip.127001", "id.a1b2c3d4", "bruker.1", "sesjon.abc123",
    "start.constructor", "ferdig.toString", "daglig.__proto__", "start.hasownproperty", "start.valueof", "__proto__", "constructor",
    "side.forside'; DROP TABLE teller;--", "<script>alert(1)</script>", "side.<b>", "kari@example.com", "https://example.com/?a=b", "🙂", "side.🙂",
    "a".repeat(41),
  ];
  for (const k of ugyldige) assert.equal(renNokkel(k, OPPSETT), null, JSON.stringify(k));
  for (const k of [null, undefined, 1, true, {}, [], ["besok"], { nokkel: "besok" }]) assert.equal(renNokkel(k, OPPSETT), null, String(k));
  // With the real game list too (whatever it holds today): nothing here is a game or a counter.
  for (const k of ugyldige) assert.equal(renNokkel(k), null, JSON.stringify(k));
});

test("an unknown page is counted as «annet», and the unknown word is not kept", () => {
  assert.equal(renNokkel("side.om"), "side.annet");
  assert.equal(renNokkel("side.personvern"), "side.annet");
  assert.equal(renNokkel("side.nyttspill2027"), "side.annet");
  assert.equal(renNokkel("side.constructor"), "side.annet");
  assert.equal(renNokkel("side.ordugla"), "side.ordugla");
  assert.equal(renNokkel("side.forside"), "side.forside");
});

test("a batch counts each valid name once and drops the rest", () => {
  assert.deepEqual(gyldigeNokler(["side.ordugla", "besok", "side.ordugla", "tull", "start.ukjent", "side.om", "side.personvern"], OPPSETT), ["side.ordugla", "besok", "side.annet"]);
  assert.deepEqual(gyldigeNokler(["tull", "start.ukjent"], OPPSETT), []);
  assert.deepEqual(gyldigeNokler(["side.ordugla", "tull"]), ["side.ordugla"], "the real game list is the default");
});

test("the envelope must be exactly {v:1,k:[…]}", () => {
  const ok = (t) => tolkPakke(t, MAKS_NOKLER);
  assert.deepEqual(ok('{"v":1,"k":["besok"]}'), ["besok"]);
  assert.deepEqual(ok('{"k":["a","b"],"v":1}'), ["a", "b"]);
  const feil = [
    "", "besok", "null", "1", '"besok"', "[]", '["besok"]', "{}", '{"v":1}', '{"k":["besok"]}', '{"v":2,"k":["besok"]}', '{"v":"1","k":["besok"]}',
    '{"v":1,"k":"besok"}', '{"v":1,"k":[]}', '{"v":1,"k":[1]}', '{"v":1,"k":[null]}', '{"v":1,"k":[["besok"]]}', '{"v":1,"k":[{"a":1}]}',
    '{"v":1,"k":["besok"],"id":"abc"}', '{"v":1,"k":["besok"],"t":1731326400000}', '{"v":1,"k":["besok"]', "{v:1,k:['besok']}",
    JSON.stringify({ v: 1, k: Array(MAKS_NOKLER + 1).fill("besok") }),
    JSON.stringify({ v: 1, k: ["a".repeat(MAKS_NOKKEL_LENGDE + 1)] }),
  ];
  for (const t of feil) assert.equal(ok(t), null, t.slice(0, 60));
  assert.equal(ok(JSON.stringify({ v: 1, k: Array(MAKS_NOKLER).fill("besok") })).length, MAKS_NOKLER);
});
