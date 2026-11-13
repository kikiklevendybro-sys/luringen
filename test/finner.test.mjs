// Unit tests for rusj/portal/finner.js: the choice behind «Hva skal vi spille?» on the front page.
// Played on the real games (rusj/spill/*/spill.json and Luringen's card), so a new game or a new age
// is checked too; plus a few made-up games for the rules themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = createRequire(import.meta.url)(join(ROT, "rusj/portal/finner.js"));

// The front page's game list (felles/spilliste.js) has these fields; Luringen's card lives in
// scripts/bygg.mjs (a script that builds when imported), so its facts are read from the file.
const lurKilde = readFileSync(join(ROT, "scripts/bygg.mjs"), "utf8");
const lur = lurKilde.slice(lurKilde.indexOf("const LURINGEN_KORT"), lurKilde.indexOf("};", lurKilde.indexOf("const LURINGEN_KORT")));
const tall = (navn) => JSON.parse(new RegExp(`\\n  ${navn}: (\\[[^\\]]*\\]|\\d+)`).exec(lur)[1]);
const SPILL = [
  { id: "luringen", spillere: tall("spillere"), alder: tall("alder"), minutter: tall("minutter"), mobiler: "begge", tagger: ["fest", "blof", "ord", "familie"], rekkefolge: 1 },
];
for (const id of readdirSync(join(ROT, "rusj/spill"))) {
  const fil = join(ROT, "rusj/spill", id, "spill.json");
  if (!existsSync(fil)) continue;
  const m = JSON.parse(readFileSync(fil, "utf8"));
  SPILL.push({ id, spillere: m.spillere, alder: m.alder, minutter: m.minutter, mobiler: m.mobiler, tagger: m.tagger, rekkefolge: m.rekkefolge, ...(m.alder18 ? { alder18: true } : {}), ...(m.motMobilen ? { motMobilen: true } : {}) });
}
SPILL.sort((a, b) => a.rekkefolge - b.rekkefolge);
const NOVEMBER = { maned: 11 };
const kortliste = (liste) => liste.slice(0, 6);
const slagAv = (liste) => liste.map((s) => F.slag(s));
const flestAvEtSlag = (liste) => Math.max(...Object.values(slagAv(liste).reduce((n, s) => ((n[s] = (n[s] || 0) + 1), n), {})));

test("the example: three of you, the youngest is 7 – only games for 7 and up to three players, no 18+, mixed", () => {
  const liste = F.finn(SPILL, { antall: "3-4", yngst: 7, lyst: "alt" }, NOVEMBER);
  assert.ok(liste.length >= 6, `bare ${liste.length} spill`);
  for (const s of liste) {
    assert.ok(s.alder <= 7, `${s.id} er fra ${s.alder} år`);
    assert.ok(s.spillere[0] <= 3 && s.spillere[1] >= 3, `${s.id} er for ${s.spillere.join("–")}`);
    assert.ok(s.spillere[1] >= 4, `${s.id} passer ikke for fire (3–4)`);
    assert.ok(!s.alder18, `${s.id} er 18+`);
    assert.ok(!s.tagger.includes("verktoy"), `${s.id} er et verktøy`);
  }
  const kort = kortliste(liste);
  assert.ok(flestAvEtSlag(kort) <= 2, `mer enn to av samme slag: ${kort.map((s) => `${s.id} (${F.slag(s)})`).join(", ")}`);
  assert.ok(new Set(slagAv(kort)).size >= 4, `for lite blanding: ${slagAv(kort).join(", ")}`);
  // A board or card game, a word game and an active game in the short list.
  for (const slag of [["brett", "kort", "huske"], ["ord", "quiz"], ["mime", "lag", "prat", "fest", "blof"]]) assert.ok(kort.some((s) => slag.includes(F.slag(s))), `ingen av ${slag.join("/")} blant ${kort.map((s) => s.id).join(", ")}`);
});

test("«1» gives games one can play alone; «2» games for two", () => {
  for (const yngst of [7, 11, "voksen"]) {
    const liste = F.finn(SPILL, { antall: "1", yngst, lyst: "alt" }, NOVEMBER);
    assert.ok(liste.length >= 6, `${yngst}: bare ${liste.length} spill alene`);
    for (const s of liste) assert.equal(s.spillere[0], 1, `${s.id} kan ikke spilles alene`);
    // The games made for one (or against the phone) first.
    assert.ok(liste.slice(0, 3).every((s) => s.tagger.includes("alene") || s.motMobilen), `${yngst}: ${kortliste(liste).map((s) => s.id).join(", ")}`);
  }
  for (const s of F.finn(SPILL, { antall: "2", yngst: "voksen", lyst: "alt" }, NOVEMBER)) assert.ok(s.spillere[0] <= 2 && s.spillere[1] >= 2, s.id);
  for (const s of F.finn(SPILL, { antall: "9+", yngst: "voksen", lyst: "alt" }, NOVEMBER)) assert.ok(s.spillere[1] >= 10, s.id);
});

test("18+ only when «Voksen fest (18+)» is chosen – and that choice only behind the 18+ door", () => {
  const atten = SPILL.filter((s) => s.alder18);
  assert.ok(atten.length > 0, "fant ingen 18+-spill å teste med");
  for (const antall of ["", "1", "2", "3-4", "5-8", "9+"])
    for (const yngst of [3, 7, 12, 17, "voksen"])
      for (const lyst of Object.keys(F.LYST)) {
        const liste = F.finn(SPILL, { antall, yngst, lyst }, NOVEMBER);
        assert.ok(!liste.some((s) => s.alder18), `18+ for ${JSON.stringify({ antall, yngst, lyst })}`);
      }
  const fest = F.finn(SPILL, { antall: "3-4", yngst: "fest", lyst: "alt" }, NOVEMBER);
  assert.ok(kortliste(fest).some((s) => s.alder18), "«Voksen fest (18+)» viser ingen drikkespill blant de første");
  assert.ok(kortliste(fest).filter((s) => s.alder18).length <= 2, "mer enn to drikkespill blant de første");
  // The answer is only kept while the door is open.
  assert.equal(F.normaliser({ yngst: "fest" }, false).yngst, "voksen");
  assert.equal(F.normaliser({ yngst: "fest" }, true).yngst, "fest");
  assert.deepEqual(F.alderTrinn(false).slice(-2), [17, "voksen"]);
  assert.deepEqual(F.alderTrinn(true).slice(-2), ["voksen", "fest"]);
  assert.equal(F.alderTrinn(false)[0], 3);
});

test("the age is the youngest one's: every game fits from that age, and the list follows the age", () => {
  for (let yngst = F.ALDER_MIN; yngst <= F.ALDER_MAKS; yngst++) {
    const liste = F.finn(SPILL, { antall: "", yngst, lyst: "alt" }, NOVEMBER);
    assert.ok(liste.length > 0, `ingen spill for ${yngst} år`);
    for (const s of liste) assert.ok(s.alder <= yngst, `${s.id} (fra ${s.alder}) for ${yngst} år`);
  }
  // Older children and adults get no games made for toddlers first.
  const voksne = kortliste(F.finn(SPILL, { antall: "3-4", yngst: "voksen", lyst: "alt" }, NOVEMBER));
  assert.ok(voksne.every((s) => s.alder >= 6), `småbarnsspill for voksne: ${voksne.map((s) => `${s.id} (${s.alder})`).join(", ")}`);
  // Small children seldom have a phone each.
  const smaa = kortliste(F.finn(SPILL, { antall: "5-8", yngst: 6, lyst: "alt" }, NOVEMBER));
  assert.ok(smaa.every((s) => s.mobiler !== "hver"), `hver sin mobil for seksåringer: ${smaa.map((s) => s.id).join(", ")}`);
});

test("the wishes: words and quizzes, drawing and miming, quick, laughs, thinking", () => {
  const med = (lyst, yngst = "voksen", antall = "3-4") => F.finn(SPILL, { antall, yngst, lyst }, NOVEMBER);
  for (const s of med("ord")) assert.ok(s.tagger.includes("ord") || s.tagger.includes("quiz"), s.id);
  for (const s of med("kjapt")) assert.ok(s.minutter[0] < 10, `${s.id} tar ${s.minutter.join("–")} min`);
  assert.deepEqual(med("tegne").map((s) => s.id).sort(), ["kunstneren", "mimen"]);
  assert.ok(med("tegne", "voksen", "5-8").some((s) => s.id === "hatten"), "Hatten (mim i tredje runde) mangler under «Tegne og mime»");
  for (const s of med("tull")) assert.ok(s.tagger.some((t) => ["fest", "blof", "sporsmal", "tegning", "lag"].includes(t)), s.id);
  for (const s of med("tenke")) assert.ok(s.tagger.some((t) => ["tenke", "klassiker", "kort", "hukommelse"].includes(t)), s.id);
  // The game's main thing first: a quiz before a party game that also has questions.
  assert.ok(["quiz", "ord"].includes(F.slag(med("ord")[0])), med("ord")[0].id);
});

test("never a tool, and the Christmas calendar only in December", () => {
  const alle = (maned) => F.finn(SPILL, { antall: "", yngst: "voksen", lyst: "alt" }, { maned });
  assert.ok(!alle(11).some((s) => s.tagger.includes("verktoy")), "et verktøy blant forslagene");
  assert.ok(!alle(11).some((s) => s.id === "julekalenderen"), "julekalenderen i november");
  assert.ok(alle(12).some((s) => s.id === "julekalenderen"), "julekalenderen mangler i desember");
});

test("ranking: the place in «Mest spilt nå» goes before the site's order, and fit before both", () => {
  const spill = [
    { id: "a", spillere: [2, 8], alder: 8, minutter: [10, 20], mobiler: "en", tagger: ["fest"], rekkefolge: 1 },
    { id: "b", spillere: [2, 8], alder: 8, minutter: [10, 20], mobiler: "en", tagger: ["fest"], rekkefolge: 2, topp: 2 },
    { id: "c", spillere: [2, 8], alder: 8, minutter: [10, 20], mobiler: "en", tagger: ["fest"], rekkefolge: 3, topp: 1 },
    { id: "d", spillere: [2, 8], alder: 8, minutter: [10, 20], mobiler: "en", tagger: ["quiz", "fest"], rekkefolge: 4 },
  ];
  const ids = (valg) => F.finn(spill, valg, NOVEMBER).map((s) => s.id);
  // Same fit: the top list first (c, b), then the order; the quiz is another kind and comes in early.
  assert.deepEqual(ids({ antall: "3-4", yngst: "voksen", lyst: "alt" }), ["c", "d", "b", "a"]);
  // «Ord og quiz»: only the quiz fits.
  assert.deepEqual(ids({ antall: "3-4", yngst: "voksen", lyst: "ord" }), ["d"]);
  // Nine or more: none of them.
  assert.deepEqual(ids({ antall: "9+", yngst: "voksen", lyst: "alt" }), []);
});

test("stored answers are made safe", () => {
  assert.deepEqual(F.normaliser(null, false), { antall: "", yngst: "voksen", lyst: "alt" });
  assert.deepEqual(F.normaliser({ antall: "3-4", yngst: "7", lyst: "ord" }, false), { antall: "3-4", yngst: 7, lyst: "ord" });
  assert.deepEqual(F.normaliser({ antall: "17", yngst: 2, lyst: "<b>" }, false), { antall: "", yngst: "voksen", lyst: "alt" });
  assert.deepEqual(F.normaliser({ antall: ["1"], yngst: 18, lyst: "constructor" }, true), { antall: "", yngst: "voksen", lyst: "alt" });
  assert.equal(F.normaliser({ yngst: 17 }, false).yngst, 17);
});
