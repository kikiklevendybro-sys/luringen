// The pure parts of the protocol (src/protokoll.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lesMelding, rensNavn, erFro, kjentSpill, gyldigOppsett, gyldigTrekk, gyldigReaksjon, nyttToken, erToken, HENDELSER } from "../src/protokoll.js";

test("a message is a JSON object with a known kind, at most 2 KB", () => {
  assert.deepEqual(lesMelding('{"h":"trekk","n":0,"t":1}'), { m: { h: "trekk", n: 0, t: 1 } });
  assert.deepEqual([...HENDELSER].sort(), ["bli", "ferdig", "forlat", "lag", "ny", "reaksjon", "start", "trekk"]);
  for (const x of ['"tekst"', "1", "[]", "{}", '{"h":"tull"}', '{"h":"constructor"}', "{", null, 5, new ArrayBuffer(2)]) assert.deepEqual(lesMelding(x), { feil: "ugyldig" }, String(x));
  assert.deepEqual(lesMelding(JSON.stringify({ h: "trekk", t: "x".repeat(2040) })), { feil: "stor" });
});

test("nicknames", () => {
  assert.equal(rensNavn("  Testspiller   A  "), "Testspiller A");
  assert.equal(rensNavn("A\u202eB\u200bC\u2066D\u0007E"), "ABCDE");
  assert.equal(rensNavn("👩‍🚀 ❤️"), "👩‍🚀 ❤️", "emoji with joiners and variation selectors survive");
  assert.equal(rensNavn("x".repeat(500)).length, 16);
  assert.equal(rensNavn(undefined), "");
  assert.equal(rensNavn(12), "");
  assert.equal(rensNavn("\n\t "), "");
});

test("seeds, games, setups, moves and reactions", () => {
  assert.ok(erFro(0) && erFro(0xffffffff) && !erFro(-1) && !erFro(2 ** 32) && !erFro("1") && !erFro(1.2));
  assert.ok(kjentSpill("brikka") && !kjentSpill("luringen") && !kjentSpill("toString") && !kjentSpill(null));
  assert.ok(gyldigOppsett({}) && gyldigOppsett({ variant: "maxi" }) && !gyldigOppsett(null) && !gyldigOppsett([1]) && !gyldigOppsett("x") && !gyldigOppsett({ x: "y".repeat(600) }));
  assert.ok(gyldigTrekk(0) && gyldigTrekk(null) && gyldigTrekk({ k: 3 }) && !gyldigTrekk(undefined) && !gyldigTrekk("x".repeat(1100)));
  const sirkel = {};
  sirkel.selv = sirkel;
  assert.equal(gyldigTrekk(sirkel), false);
  assert.ok([0, 1, 2, 3, 4, 5].every(gyldigReaksjon) && !gyldigReaksjon(6) && !gyldigReaksjon("0") && !gyldigReaksjon(-1));
});

test("seat tokens: 22 random base64url signs", () => {
  const sett = new Set(Array.from({ length: 200 }, nyttToken));
  assert.equal(sett.size, 200);
  for (const t of sett) assert.ok(erToken(t), t);
  assert.ok(!erToken("kort") && !erToken("A".repeat(21) + "=") && !erToken(null));
});
