// The Worker's game list against the games in the repository (rusj/spill/ + Luringen).
// A game that is missing in src/spilliste.js is only counted as «andre sider», so this test says
// so as soon as a game is added, renamed or tagged as a daily.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { SPILL, DAGLIGE, OPPRINNELSER, MAKS_BYTES, MAKS_NOKLER, MAKS_NOKKEL_LENGDE, MIN_ADMIN_NOKKEL } from "../src/oppsett.js";
import { SPILL_ID, alleNokler } from "../src/nokler.js";
import { lesSpill, somFil } from "../oppdater-spilliste.mjs";

const spillmappe = new URL("../../rusj/spill/", import.meta.url);

test("the game list matches rusj/spill/ (ids, names, dailies)", { skip: !existsSync(spillmappe) && "rusj/spill/ is not here" }, () => {
  const fraRepo = { luringen: "Luringen" }; // Luringen lives in src/, not in rusj/spill/
  const daglige = [];
  for (const mappe of readdirSync(spillmappe, { withFileTypes: true })) {
    const fil = new URL(`${mappe.name}/spill.json`, spillmappe);
    if (!mappe.isDirectory() || !existsSync(fil)) continue;
    const fakta = JSON.parse(readFileSync(fil, "utf8"));
    fraRepo[fakta.id] = fakta.navn;
    if ((fakta.tagger || []).includes("daglig")) daglige.push(fakta.id);
  }
  const sortert = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  const hjelp = "run `node statistikk/oppdater-spilliste.mjs` and deploy the Worker again";
  assert.deepEqual(sortert(SPILL), sortert(fraRepo), hjelp);
  assert.deepEqual([...DAGLIGE].sort(), daglige.sort(), hjelp);
  assert.equal(readFileSync(new URL("../src/spilliste.js", import.meta.url), "utf8"), somFil(lesSpill()), hjelp);
});

test("the config is consistent with the grammar and the limits", () => {
  assert.deepEqual(OPPRINNELSER, ["https://rusj.no"]);
  for (const id of Object.keys(SPILL)) {
    assert.match(id, SPILL_ID);
    assert.ok(!["forside", "annet"].includes(id), id);
    assert.equal(typeof SPILL[id], "string");
  }
  // The largest batch the client may send fits in the body limit with room to spare.
  const lengste = alleNokler().sort((a, b) => b.length - a.length).slice(0, MAKS_NOKLER);
  assert.ok(JSON.stringify({ v: 1, k: lengste }).length < MAKS_BYTES);
  assert.ok(JSON.stringify({ v: 1, k: Array(MAKS_NOKLER).fill("x".repeat(MAKS_NOKKEL_LENGDE)) }).length < MAKS_BYTES);
  assert.ok(MIN_ADMIN_NOKKEL >= 32);
});
