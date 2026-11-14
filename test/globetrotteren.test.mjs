// Globetrotteren's engine and data (rusj/spill/globetrotteren/spill.js, data*/land.json): every
// country has a name in nb, en and da (and no two countries share a name or alias), an outline and
// a flag; distance and direction agree with an independent calculation on 3D vectors; names are
// found from what is typed (also without æ, ø, å and accents); «Dagens land» comes from the date,
// is one of the recognisable countries, never repeats within a round and never two days running,
// over more than a year.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/spill/globetrotteren/spill.js"));
const NAVN = Object.fromEntries(["data", "data.en", "data.da"].map((d) => [d, JSON.parse(readFileSync(join(ROT, "rusj/spill/globetrotteren", d, "land.json"), "utf8")).land]));

test("every country has names in nb, en and da, an outline and a flag", () => {
  assert.equal(M.IDER.length, 197);
  for (const [mappe, navn] of Object.entries(NAVN)) {
    assert.deepEqual(Object.keys(navn).sort(), M.IDER.slice().sort(), `${mappe}: ikke de samme landene`);
    const sett = new Map();
    for (const id of M.IDER) {
      assert.ok(Array.isArray(navn[id]) && navn[id].length >= 1, `${mappe}/${id}: mangler navn`);
      for (const n of navn[id]) {
        assert.ok(typeof n === "string" && n.trim() === n && n.length >= 2, `${mappe}/${id}: «${n}»`);
        const k = M.normaliser(n);
        assert.ok(!sett.has(k) || sett.get(k) === id, `${mappe}: «${n}» brukes av både ${sett.get(k)} og ${id}`);
        sett.set(k, id);
      }
    }
  }
  const stier = new Set();
  for (const id of M.IDER) {
    const o = M.omriss(id);
    assert.ok(/^M[-\d]/.test(o.d) && o.d.length > 10, `${id}: omriss`);
    assert.ok(o.w > 0 && o.h > 0 && Math.max(o.w, o.h) === 200, `${id}: størrelse ${o.w} × ${o.h}`);
    assert.ok(!stier.has(o.d), `${id}: samme omriss som et annet land`);
    stier.add(o.d);
    const p = M.punkt(id);
    assert.ok(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180, `${id}: punkt`);
    assert.ok(["af", "as", "eu", "na", "sa", "oc"].includes(M.verdensdel(id)), `${id}: verdensdel`);
    assert.ok(M.areal(id) >= 1, `${id}: areal`);
    const f = M.flaggInnhold(id);
    assert.ok(M.harFlagg(id) && /<(rect|polygon|circle|path|svg)/.test(f), `${id}: flagg`);
    assert.ok(!/NaN|undefined/.test(f), `${id}: flagget har feil tall`);
  }
  assert.deepEqual(Object.keys(M.FLAGG).sort(), M.IDER.slice().sort(), "flagg uten land");
  // A few known facts as a sanity check on the data.
  assert.equal(M.verdensdel("NOR"), "eu");
  assert.equal(M.verdensdel("BRA"), "sa");
  assert.ok(M.areal("RUS") > 15000 && M.areal("VAT") <= 1);
  assert.equal(NAVN.data.DEU[0], "Tyskland");
  assert.equal(NAVN["data.en"].DEU[0], "Germany");
  assert.equal(NAVN["data.da"].DEU[0], "Tyskland");
});

// Distance and bearing the other way: unit vectors, the angle between them, and the direction
// from the tangent plane at the start.
const RAD = Math.PI / 180;
const vektor = (lat, lon) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const kryss = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const prikk = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function selv(a, b) {
  const p = M.punkt(a);
  const q = M.punkt(b);
  const u = vektor(p.lat, p.lon);
  const v = vektor(q.lat, q.lon);
  const km = Math.atan2(Math.hypot(...kryss(u, v)), prikk(u, v)) * 6371.0088;
  const nord = [-Math.sin(p.lat * RAD) * Math.cos(p.lon * RAD), -Math.sin(p.lat * RAD) * Math.sin(p.lon * RAD), Math.cos(p.lat * RAD)];
  const ost = [-Math.sin(p.lon * RAD), Math.cos(p.lon * RAD), 0];
  const grader = ((Math.atan2(prikk(v, ost), prikk(v, nord)) / RAD) + 360) % 360;
  return { km, grader };
}

test("distance and direction agree with vector maths", () => {
  const tilf = M.rng(7);
  for (let k = 0; k < 3000; k++) {
    const a = M.IDER[Math.floor(tilf() * M.IDER.length)];
    const b = M.IDER[Math.floor(tilf() * M.IDER.length)];
    const s = selv(a, b);
    assert.ok(Math.abs(M.avstand(a, b) - s.km) < 0.5, `${a}–${b}: ${M.avstand(a, b)} / ${s.km}`);
    if (a !== b && s.km > 1) {
      const d = Math.abs(((M.retning(a, b) - s.grader + 540) % 360) - 180);
      assert.ok(d < 0.01, `${a}→${b}: ${M.retning(a, b)} / ${s.grader}`);
    }
    assert.equal(M.avstand(a, b).toFixed(6), M.avstand(b, a).toFixed(6));
  }
  assert.equal(M.avstand("NOR", "NOR"), 0);
  // Oslo-ish to Stockholm-ish is a few hundred km, roughly east; Norway to New Zealand is far.
  assert.ok(M.avstand("NOR", "SWE") > 200 && M.avstand("NOR", "SWE") < 800);
  assert.equal(M.kompass(M.retning("PRT", "ESP")), 2, "Spania ligger øst for Portugal");
  assert.equal(M.kompass(M.retning("EGY", "SDN")), 4, "Sudan ligger sør for Egypt");
  assert.equal(M.kompass(M.retning("DEU", "DNK")), 0, "Danmark ligger nord for Tyskland");
  assert.equal(M.kompass(M.retning("ESP", "MAR")), 4, "Marokko ligger sør for Spania");
  assert.ok(M.avstand("NOR", "NZL") > 16000);
  assert.deepEqual([0, 22, 23, 44, 90, 135, 180, 225, 270, 315, 338, 359].map(M.kompass), [0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 0, 0]);
  assert.equal(M.naerhet(0), 100);
  assert.equal(M.naerhet(20015.1), 0);
  assert.ok(M.naerhet(M.avstand("NOR", "SWE")) >= 97);
});

test("names are found from what is typed, in every language", () => {
  const nb = NAVN.data;
  const en = NAVN["data.en"];
  const da = NAVN["data.da"];
  assert.equal(M.forslag(nb, "nor")[0], "NOR");
  assert.deepEqual(M.forslag(nb, "korea").sort(), ["KOR", "PRK"]);
  assert.equal(M.forslag(nb, "sor-afr")[0], "ZAF");
  assert.equal(M.forslag(nb, "osterr")[0], "AUT");
  assert.equal(M.forslag(nb, "ØSTERRIKE")[0], "AUT");
  assert.equal(M.finn(nb, "holland"), "NLD");
  assert.equal(M.finn(nb, "sao tome og principe"), "STP");
  assert.equal(M.finn(en, "UK"), "GBR");
  assert.equal(M.finn(en, "cote d'ivoire"), "CIV");
  assert.equal(M.finn(da, "Grækenland"), "GRC");
  assert.equal(M.finn(da, "graekenland"), "GRC");
  assert.equal(M.finn(nb, "Atlantis"), null);
  assert.deepEqual(M.forslag(nb, ""), []);
  assert.ok(M.forslag(en, "guinea").slice(0, 1)[0] === "GIN", "the exact name comes first");
  assert.ok(M.forslag(en, "s", 6).length === 6);
  // Every name and alias finds its own country, in every language.
  for (const navn of [nb, en, da]) for (const id of M.IDER) for (const n of navn[id]) assert.equal(M.finn(navn, n), id, n);
});

test("«Dagens land»: from the date, recognisable, no repeats within a round, over a year and more", () => {
  const L = M.STORE.length;
  assert.ok(L >= 120 && L <= 170, `${L} land i dagens utvalg`);
  for (const id of M.STORE) assert.ok(M.areal(id) >= 25);
  const start = M.FORSTE;
  const dager = [];
  for (let nr = start; nr < start + 2 * L + 40; nr++) dager.push(M.dagens(nr));
  for (const id of dager) assert.ok(M.STORE.includes(id), id);
  for (let i = 1; i < dager.length; i++) assert.notEqual(dager[i], dager[i - 1], `samme land to dager på rad (dag ${i})`);
  // The first round has every country once.
  assert.equal(new Set(dager.slice(0, L)).size, L);
  // Over 366 days: no country more than three times, and the same date always gives the same one.
  const teller = {};
  for (const id of dager.slice(0, 366)) teller[id] = (teller[id] || 0) + 1;
  assert.ok(Math.max(...Object.values(teller)) <= 3);
  assert.equal(M.dagens(start + 100), dager[100]);
  // Free play: outlines from the recognisable ones, flags from all, never the same twice in a row.
  for (let fro = 1; fro < 300; fro++) {
    assert.ok(M.STORE.includes(M.tilfeldig("omriss", fro)));
    assert.ok(M.IDER.includes(M.tilfeldig("flagg", fro)));
    const a = M.tilfeldig("omriss", fro);
    assert.notEqual(M.tilfeldig("omriss", fro, a), a);
  }
});
