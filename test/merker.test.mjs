// Unit tests for «Klistremerkeboka»: the rules in rusj/kit/merker.js against the catalogue in
// rusj/merker.json (streaks, days, the evening, games tried), adding to the book (idempotent,
// unknown ids ignored), and R.merke / the automatic checks in the kit. Fixed day numbers only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(join(ROT, "rusj/kit/merker.js"));
const KATALOG = JSON.parse(readFileSync(join(ROT, "rusj/merker.json"), "utf8"));
const K = {
  ...KATALOG,
  alle: Array.from({ length: 40 }, (_, i) => `spill${i}`).concat(["ordugla", "blyanten", "kunstneren"]),
  daglige: ["ordugla", "blyanten"],
  tagger: { kunstneren: ["tegning", "fest"], ordugla: ["daglig", "ord", "alene"] },
};
const ONS = 20768; // Wednesday 11 November 2026; that week is Monday 20766 … Sunday 20772
const logg = (...dager) => ({ _: { v: 1, dager: Object.fromEntries(dager.map((d) => [d, ["ordugla"]])) } });
const har = (kilde) => M.utled(K, { iDag: ONS, naa: 0, ...kilde });

test("the catalogue: 36–120 stickers (new games add more), unique ids, known groups, a line on how to get each", () => {
  const ids = KATALOG.merker.map((m) => m.id);
  assert.ok(ids.length >= 36 && ids.length <= 120, `${ids.length} merker`);
  assert.equal(new Set(ids).size, ids.length);
  const grupper = new Set(KATALOG.grupper.map((g) => g.id));
  for (const m of KATALOG.merker) {
    assert.ok(grupper.has(m.gruppe), m.id);
    assert.ok(m.navn && m.hvordan && (m.figur || m.emoji), m.id);
    assert.ok(!/drikk|shot|øl\b|alkohol/i.test(m.navn + m.hvordan), `${m.id} handler om drikking`);
  }
});

test("streaks: days in a row with one rest day a week, also an earlier run", () => {
  assert.equal(M.rekke(logg(ONS, ONS - 1, ONS - 2), ONS), 3);
  assert.equal(M.rekke(logg(ONS - 1, ONS - 2), ONS), 2, "today not played yet: counts from yesterday");
  // Monday 20766 missed, the rest of last week and this week played: one rest day is forgiven.
  const uke = logg(ONS, ONS - 1, ONS - 3, ONS - 4, ONS - 5, ONS - 6, ONS - 7, ONS - 8);
  assert.equal(M.rekke(uke, ONS), 8);
  assert.ok(har({ daglig: uke }).has("dagens-rekke-7"));
  assert.ok(!har({ daglig: logg(ONS, ONS - 1) }).has("dagens-rekke-3"));
  // A run of 3 a month ago still earns «Tre på rad», even if the streak is broken today.
  const gml = logg(ONS - 40, ONS - 39, ONS - 38);
  assert.equal(M.rekke(gml, ONS), 0);
  assert.ok(har({ daglig: gml }).has("dagens-rekke-3"));
  // A game's own streak counts too (older phones without the site log).
  assert.ok(har({ daglig: { ordugla: { nr: ONS, vunnet: true, rekke: 14 } } }).has("dagens-rekke-14"));
});

test("dailies: first day, days in total, all of today's, each game's first win", () => {
  assert.equal(har({}).size, 0, "nothing stored: no stickers");
  assert.ok(har({ daglig: logg(ONS - 300) }).has("dagens-forste"));
  const ti = logg(...Array.from({ length: 10 }, (_, i) => ONS - i * 3));
  assert.ok(har({ daglig: ti }).has("dagens-dager-10"));
  assert.ok(!har({ daglig: ti }).has("dagens-dager-50"));
  const begge = { _: { v: 1, dager: { [ONS - 5]: ["blyanten", "ordugla"] } } };
  assert.ok(har({ daglig: begge }).has("dagens-alle"));
  assert.ok(!har({ daglig: logg(ONS) }).has("dagens-alle"));
  assert.ok(har({ daglig: { ordugla: { nr: ONS, vunnet: true, rekke: 1 } } }).has("seier-ordugla"));
  assert.ok(!har({ daglig: { ordugla: { nr: ONS, vunnet: false, rekke: 0 } } }).has("seier-ordugla"));
});

test("the evening: first game, three and five games, eight players, one clear winner", () => {
  const rad = (navn, plass) => ({ navn, plass });
  const spill = (...r) => ({ id: "x", tid: 0, resultat: r });
  const kveld = (...s) => ({ start: 0, spill: s });
  assert.ok(har({ kveld: kveld(spill(rad("A", 1), rad("B", 2))) }).has("kveld-forste"));
  const tre = kveld(spill(rad("A", 1), rad("B", 2)), spill(rad("A", 1), rad("B", 2)), spill(rad("B", 1), rad("A", 2)));
  const t = har({ kveld: tre });
  assert.ok(t.has("kveld-tre") && t.has("kveld-kronet") && !t.has("kveld-fem"));
  const likt = kveld(spill(rad("A", 1), rad("B", 2)), spill(rad("B", 1), rad("A", 2)), spill(rad("A", 0), rad("B", 0)));
  assert.ok(!har({ kveld: likt }).has("kveld-kronet"), "a tie at the top is nobody crowned");
  const atte = kveld(spill(...Array.from({ length: 8 }, (_, i) => rad("Testspiller " + i, i + 1))));
  assert.ok(har({ kveld: atte }).has("kveld-stor"));
  assert.ok(!har({ kveld: atte, naa: 13 * 3600 * 1000 }).has("kveld-forste"), "an evening older than 12 hours is gone");
});

test("explorer: games tried are counted once, unknown and drinking games ignored, tags", () => {
  const fem = ["spill1", "spill2", "spill3", "spill4", "spill4", "bussen", "spill5"];
  assert.ok(!har({ spilt: fem.slice(0, 5) }).has("provd-5"), "four distinct + a repeat is four");
  assert.ok(har({ spilt: fem }).has("provd-5"));
  assert.ok(!har({ spilt: K.alle.slice(1) }).has("provd-alle"));
  const alle = har({ spilt: K.alle });
  assert.ok(alle.has("provd-alle") && alle.has("provd-30") && alle.has("provd-tegning") && alle.has("provd-ord") && alle.has("provd-alene"));
  assert.ok(!alle.has("provd-quiz"));
});

test("the book: idempotent, keeps the first day, ignores unknown ids and junk", () => {
  const a = M.tildel({}, ["dagens-forste", "finnes-ikke", 42, "dagens-forste"], K, ONS);
  assert.deepEqual(a.lagret, { "dagens-forste": ONS });
  assert.deepEqual(a.nye, ["dagens-forste"]);
  const b = M.tildel(a.lagret, ["dagens-forste", "luke-1"], K, ONS + 3);
  assert.deepEqual(b.lagret, { "dagens-forste": ONS, "luke-1": ONS + 3 });
  assert.deepEqual(b.nye, ["luke-1"]);
  assert.deepEqual(M.tildel(b.lagret, ["luke-1"], K, ONS + 9).nye, []);
  assert.deepEqual(M.rens({ "luke-1": ONS, x: 1, "luke-12": "i går", "luke-24": -3 }, K), { "luke-1": ONS });
  assert.deepEqual(M.rens([1, 2], K), {});
});

test("a sticker is drawn with the mascot or an emoji, a number badge, and escaped", () => {
  const G = { svg: (id) => `<svg class="figur-${id}"></svg>`, finnes: () => true };
  assert.match(M.tegn({ figur: "fireren", farge: "#ffcf3f" }, G), /figur-fireren/);
  const e = M.tegn({ emoji: "<b>", tall: 7 }, G);
  assert.match(e, /&lt;b&gt;/);
  assert.match(e, /klistre-tall">7</);
});

// The kit: R.merke and the automatic checks after a daily, an evening and a game start.
function lastKit() {
  const lager = new Map();
  const window = {
    RUSJ_SPILL: { id: "ordugla", navn: "Ordugla" },
    RUSJ_MERKER: K,
    RusjMerker: M,
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    location: { protocol: "http:", origin: "http://lokal", pathname: "/ordugla/", hash: "" },
  };
  window.self = window;
  window.top = window;
  const kontekst = {
    window,
    localStorage: { getItem: (k) => (lager.has(k) ? lager.get(k) : null), setItem: (k, v) => lager.set(k, String(v)), removeItem: (k) => lager.delete(k) },
    navigator: {},
    document: { addEventListener() {}, documentElement: {}, hidden: true },
    crypto: globalThis.crypto,
    location: window.location,
    history: { pushState() {}, replaceState() {} },
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval,
    clearInterval,
    performance,
  };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/rusj.js"), "utf8"), kontekst);
  const json = (k) => JSON.parse(lager.get("rusj." + k) || "null");
  return { R: window.Rusj, json };
}

test("kit: R.merke stores once with today's day, unknown ids leave nothing", () => {
  const { R, json } = lastKit();
  R.merke("finnes-ikke");
  assert.equal(json("merker"), null);
  R.merke("klassiker-fireren");
  R.merke("klassiker-fireren");
  assert.deepEqual(json("merker"), { "klassiker-fireren": R.dag().nr });
  assert.deepEqual(json("merkerNye"), ["klassiker-fireren"], "waits to be celebrated once");
});

test("kit: a finished daily, a game start and an evening give the derived stickers", () => {
  const { R, json } = lastKit();
  R.dagligFerdig({ vunnet: true, rekke: 1, res: "3/6" });
  assert.ok(json("merker")["dagens-forste"] && json("merker")["seier-ordugla"]);
  R.statistikk("start", {});
  assert.deepEqual(json("spilt"), ["ordugla"]);
  R.statistikk("start", {});
  assert.deepEqual(json("spilt"), ["ordugla"], "a game is counted once");
  assert.ok(json("merker")["provd-ord"]);
  R.kveld.registrer([{ i: 0, poeng: 3 }, { i: 1, poeng: 1 }]);
  assert.ok(json("merker")["kveld-forste"]);
});
