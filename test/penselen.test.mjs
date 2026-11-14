// Penselen (colouring): the flood fill – fields are joined side by side only, so a thin diagonal
// line still closes a field; every pixel of a field and nothing else is painted; a tap on a line
// counts for the nearest field – the actions as short strings (round trip, rejected junk), and the
// line art itself (44 pictures, six themes, a name for each, path data inside the sheet).
// Loads rusj/spill/penselen/spill.js without the kit (node:vm). The browser check that every
// picture's fields are closed is in test/spill/penselen.e2e.mjs (it needs a canvas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KILDE = readFileSync(join(ROT, "rusj/spill/penselen/spill.js"), "utf8");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(KILDE, kontekst);
const { BILDER, TEMAER, merk, feltVed, fyll, Handling, tynn, N } = kontekst.window.Penselen;

// A wall mask from a picture of characters: "#" is a wall.
function maske(...linjer) {
  const h = linjer.length;
  const b = linjer[0].length;
  const vegg = new Uint8Array(b * h);
  linjer.forEach((l, y) => [...l].forEach((c, x) => (vegg[y * b + x] = c === "#" ? 1 : 0)));
  return { vegg, b, h };
}
const piksler = (kart, f) => Array.from(kart.piksler.slice(kart.start[f], kart.start[f + 1])).sort((a, b) => a - b);

test("a closed ring makes two fields: inside and outside", () => {
  const { vegg, b, h } = maske(
    "........",
    ".######.",
    ".#....#.",
    ".#....#.",
    ".######.",
    "........",
  );
  const k = merk(vegg, b, h);
  assert.equal(k.antall, 2);
  const inne = k.etikett[2 * b + 2];
  const ute = k.etikett[0];
  assert.notEqual(inne, ute);
  assert.equal(k.start[inne + 1] - k.start[inne], 8);
  assert.equal(k.start[ute + 1] - k.start[ute], 48 - 16 - 8);
  // Walls have no field, and every free pixel has exactly one.
  for (let i = 0; i < b * h; i++) assert.equal(k.etikett[i] < 0, vegg[i] === 1);
});

test("a thin diagonal line closes a field (no leaking across corners)", () => {
  const { vegg, b, h } = maske(
    "#....",
    ".#...",
    "..#..",
    "...#.",
    "....#",
  );
  const k = merk(vegg, b, h);
  assert.equal(k.antall, 2, "the two sides of the diagonal must be different fields");
  assert.notEqual(k.etikett[1], k.etikett[b]);
});

test("a gap in the outline joins the fields (why the outlines are drawn thick and closed)", () => {
  const { vegg, b, h } = maske(
    ".......",
    ".##.##.",
    ".#...#.",
    ".#####.",
  );
  assert.equal(merk(vegg, b, h).antall, 1);
});

test("fields list exactly their own pixels, grouped and complete", () => {
  const { vegg, b, h } = maske(
    "..#..#..",
    "..#..#..",
    "########",
    "..#..#..",
  );
  const k = merk(vegg, b, h);
  assert.equal(k.antall, 6);
  let alle = 0;
  for (let f = 0; f < k.antall; f++) {
    const p = piksler(k, f);
    alle += p.length;
    for (const i of p) assert.equal(k.etikett[i], f);
  }
  assert.equal(alle, [...vegg].filter((v) => !v).length);
});

test("filling paints every pixel of the field and nothing else", () => {
  const { vegg, b, h } = maske(
    "........",
    ".######.",
    ".#....#.",
    ".######.",
  );
  const k = merk(vegg, b, h);
  const data = new Uint8ClampedArray(b * h * 4);
  const inne = k.etikett[2 * b + 3];
  const n = fyll(data, k, inne, [10, 20, 30]);
  assert.equal(n, 4);
  for (let i = 0; i < b * h; i++) {
    const malt = data[i * 4 + 3] === 255;
    assert.equal(malt, k.etikett[i] === inne, `pixel ${i}`);
    if (malt) assert.deepEqual([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], [10, 20, 30]);
  }
  assert.equal(fyll(data, k, -1, [1, 2, 3]), 0, "no field: nothing painted");
});

test("a tap on a line counts for the nearest field; far from any field it is nothing", () => {
  const { vegg, b, h } = maske(
    "##########",
    "##########",
    "##......##",
    "##########",
    "##########",
  );
  const k = merk(vegg, b, h);
  assert.equal(feltVed(k, 4, 2), 0);
  assert.equal(feltVed(k, 4, 1, 2), 0, "one pixel above the field");
  assert.equal(feltVed(k, 0, 0, 1), -1, "too far from any field");
  assert.equal(feltVed(k, -5, 2), -1, "outside the sheet");
});

test("actions are short strings that read back the same", () => {
  const f = Handling.fyll(3, 512.4, 999);
  assert.deepEqual({ ...Handling.les(f) }, { t: "f", farge: 3, x: 512, y: 999 });
  const p = Handling.strek(13, 1, [0, 0, 1023, 1023, 300, 700]);
  const l = Handling.les(p);
  assert.equal(l.t, "p");
  assert.equal(l.farge, 13);
  assert.equal(l.s, 1);
  assert.deepEqual(Array.from(l.p), [0, 0, 1023, 1023, 300, 700]);
  assert.equal(Handling.les(Handling.tom()).t, "c");
  // Coordinates outside the sheet are clamped; junk is refused.
  assert.deepEqual({ ...Handling.les(Handling.fyll(0, -40, 5000)) }, { t: "f", farge: 0, x: 0, y: 1023 });
  for (const s of ["", "x", "fz0000", "fa00", "pa20000", "pa1000", "pa1zz00", null, 7, "c2"]) assert.equal(Handling.les(s), null, JSON.stringify(s));
});

test("strokes keep their first and last point and drop points that are too close", () => {
  const p = [0, 0, 1, 1, 2, 2, 10, 0, 11, 0, 30, 0];
  const ut = tynn(p, 4);
  assert.deepEqual(ut.slice(0, 2), [0, 0]);
  assert.deepEqual(ut.slice(-2), [30, 0]);
  assert.ok(ut.length < p.length);
});

test("44 pictures in six themes, at least six each, with unique ids", () => {
  assert.equal(BILDER.length, 44);
  assert.deepEqual(Array.from(TEMAER), ["dyr", "kjoretoy", "rom", "arstider", "norden", "hav"]);
  assert.equal(new Set(BILDER.map((b) => b.id)).size, BILDER.length);
  for (const t of TEMAER) assert.ok(BILDER.filter((b) => b.tema === t).length >= 6, t);
  for (const b of BILDER) assert.ok(TEMAER.includes(b.tema), b.id);
});

test("every picture has a name for the edition tables (a literal R.t key)", () => {
  for (const b of BILDER) assert.match(KILDE, new RegExp(`\\n\\s+${b.id}: R\\.t\\("[^"]+"\\),`), `${b.id} has no name`);
});

test("the path data is valid and stays on the sheet", () => {
  const tall = /-?\d+(\.\d+)?/g;
  for (const b of BILDER) {
    assert.ok(b.s.length >= 3, `${b.id}: too few outlines`);
    for (const d of [...b.s, ...(b.f || [])]) {
      assert.match(d, /^M/, `${b.id}: a path starts with M`);
      assert.match(d, /^[MLHVQTACZmlhvqtacz0-9.\s-]+$/, `${b.id}: unknown command in «${d.slice(0, 40)}»`);
      // Absolute coordinates (after M, L, H, V, Q, T) stay within a margin of the sheet.
      for (const m of d.matchAll(/([MLHVQT])([^MLHVQTACZmlhvqtacz]*)/g)) {
        for (const n of (m[2].match(tall) || []).map(Number)) assert.ok(n >= -4 && n <= 204, `${b.id}: ${m[1]}${n} is off the sheet`);
      }
    }
  }
});

test("the sheet is 1000 pixels, and fills on it address every pixel", () => {
  assert.equal(N, 1000);
  assert.ok(Handling.les(Handling.fyll(0, 999, 999)).x === 999);
});
