// Unit tests for rusj/portal/sok.js: the front-page search. Run on the real games, exactly as the
// front page gets them (felles/spilliste*.js of a fresh build: the games' own search words, the
// words in rusj/seo*.json, the variants inside games), in all three editions; plus a few made-up
// games for the rules themselves. To check a folder that is already built:
//   RUSJ_WEB=dist/web node --test test/sok.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const F = require(join(ROT, "rusj/portal/finner.js"));
const S = require(join(ROT, "rusj/portal/sok.js"));
const ferdigBygget = process.env.RUSJ_WEB ? resolve(process.env.RUSJ_WEB) : null;
const midlertidig = ferdigBygget ? null : mkdtempSync(join(tmpdir(), "rusj-sok-"));
const WEB = ferdigBygget || join(midlertidig, "web");

const U = {}; // per edition: { spill, av (id → game), sok (the search), finn(q) → ids a visitor sees }
before(() => {
  if (!ferdigBygget) execFileSync(process.execPath, [join(ROT, "scripts/bygg.mjs"), "--ut", WEB], { cwd: ROT, stdio: "pipe" });
  for (const sprak of ["nb", "en", "da"]) {
    const t = readFileSync(join(WEB, sprak === "nb" ? "felles/spilliste.js" : `felles/spilliste.${sprak}.js`), "utf8");
    const spill = JSON.parse(t.slice(t.indexOf("=") + 1, t.indexOf(";\nwindow.RUSJ_TAGGSOK")));
    const taggsok = JSON.parse(t.slice(t.indexOf("window.RUSJ_TAGGSOK=") + "window.RUSJ_TAGGSOK=".length, t.lastIndexOf(";")));
    const sok = S.lag({ spill, taggsok, sprak, F });
    // What a visitor sees before the 18+ door: the games (and variants) found, best first.
    const finn = (q) => sok.sok(q).treff.filter((x) => !x.s.alder18).map((x) => x.n);
    // … and the game of the best match (the game itself, or the game a variant is inside).
    const forste = (q) => (finn(q)[0] || "").split("#")[0];
    U[sprak] = { spill, av: new Map(spill.map((s) => [s.id, s])), sok, finn, forste };
  }
});
after(() => {
  if (midlertidig) rmSync(midlertidig, { recursive: true, force: true });
});

const vanlige = (sprak) => U[sprak].spill.filter((s) => !s.alder18);
// The game of a hit: «pusen» for the game and for «pusen#fisk» (Fisk, inside Pusen).
const spillAv = (sprak, n) => U[sprak].av.get(n.split("#")[0]);
const ider = (liste) => liste.map((s) => s.id).sort();

test("the names people use find the game, first in the list (Norwegian)", () => {
  const forst = {
    uno: "vriatter", olsen: "vriatter", "crazy eights": "vriatter", alias: "skravla", tabu: "skravla", taboo: "skravla", codenames: "kodeknekkeren",
    wordle: "ordugla", imposter: "luringen", impostor: "luringen", spyfall: "spionen", kahoot: "bedreviteren", pictionary: "kunstneren", skribbl: "kunstneren",
    mafia: "varulven", werewolf: "varulven", boggle: "edderkoppen", connections: "firklover", strands: "sporhunden", "spelling bee": "humla", othello: "reversi",
    "heads up": "panna", "would you rather": "vinglepetter", "never have i ever": "sladrehanken", "most likely to": "pekefingeren", "truth or dare": "vaghalsen",
    mastermind: "lasesmeden", battleship: "admiralen", farkle: "lykkegrisen", mancala: "samannen", kalaha: "samannen", shithead: "narren", palace: "narren",
    "go fish": "pusen", solitaire: "kortkongen", patience: "kortkongen", minesweeper: "minesveiperen", flappy: "maneten", suika: "planeten", "candy crush": "ekornet",
    "bubble shooter": "bobla", yatzy: "terninga", yahtzee: "terninga", kabal: "kortkongen", sjakk: "sjakkhesten", ludo: "brikka", backgammon: "tavla", sudoku: "tallknuseren",
  };
  // (the game itself, or the well-known game inside it: «go fish» is Fisk in Pusen)
  for (const [q, id] of Object.entries(forst)) assert.equal(U.nb.forste(q), id, `«${q}» → ${U.nb.finn(q).slice(0, 4).join(", ") || "ingenting"}`);
  // «gartic» is both the drawing game and the chain of drawings.
  assert.ok(U.nb.finn("gartic").includes("hviskeleken"), U.nb.finn("gartic").join());
  // «sjakk»: the chess game before the games with chess in their genre.
  const sjakk = U.nb.finn("sjakk");
  assert.ok(sjakk.includes("bonden") && sjakk.includes("hopperen") && sjakk.indexOf("sjakkhesten") === 0, sjakk.join());
  // Upper case, accents and punctuation make no difference.
  assert.equal(U.nb.finn("  UNO! ")[0], "vriatter");
  assert.equal(U.nb.finn("Vri-Åtter")[0], "vriatter");
});

test("the same in the English and the Danish edition", () => {
  const en = { uno: "vriatter", alias: "skravla", taboo: "skravla", codenames: "kodeknekkeren", wordle: "ordugla", kahoot: "bedreviteren", mafia: "varulven", yahtzee: "terninga", chess: "sjakkhesten", boggle: "edderkoppen", othello: "reversi", mastermind: "lasesmeden", "candy crush": "ekornet", patience: "kortkongen", "never have i ever": "sladrehanken", battleships: "admiralen", "go fish": "pusen" };
  for (const [q, id] of Object.entries(en)) assert.equal(U.en.forste(q), id, `en «${q}» → ${U.en.finn(q).slice(0, 4).join(", ") || "nothing"}`);
  const da = { uno: "vriatter", olsen: "vriatter", alias: "skravla", tabu: "skravla", codenames: "kodeknekkeren", wordle: "ordugla", kahoot: "bedreviteren", mafia: "varulven", yatzy: "terninga", skak: "sjakkhesten", boggle: "edderkoppen", othello: "reversi", kabale: "kortkongen", "jeg har aldrig": "sladrehanken", "sænke slagskibe": "admiralen" };
  for (const [q, id] of Object.entries(da)) assert.equal(U.da.forste(q), id, `da «${q}» → ${U.da.finn(q).slice(0, 4).join(", ") || "ingenting"}`);
});

test("a typo is put right from our own words, and the search says which word it shows", () => {
  for (const [q, ord, id] of [["yatsy", "yatzy", "terninga"], ["sudoko", "sudoku", "tallknuseren"], ["codnames", "codenames", "kodeknekkeren"], ["luddo", "ludo", "brikka"], ["kabel", "kabal", "kortkongen"], ["bakgammon", "backgammon", "tavla"]]) {
    const r = U.nb.sok.sok(q);
    assert.equal(r.rettet, ord, `«${q}» ble rettet til «${r.rettet}»`);
    assert.equal(r.treff[0].n, id, `«${q}» → ${r.treff.slice(0, 3).map((x) => x.n).join(", ")}`);
  }
  assert.equal(U.da.sok.sok("yatsy").rettet, "yatzy");
  assert.equal(U.en.sok.sok("yahtzea").rettet, "yahtzee");
  // No correction when the word is found as it is, for short words, or far from everything we know.
  for (const q of ["yatzy", "uno", "xyzzy", "qqqqqqqq", "abc"]) assert.equal(U.nb.sok.sok(q).rettet, "", `«${q}» ble rettet`);
  // The distance: one edit for 4–7 letters, two for 8 or more (neighbours swapped count as one).
  assert.equal(S.avstand("yatsy", "yatzy", 2), 1);
  assert.equal(S.avstand("yazty", "yatzy", 2), 1);
  assert.equal(S.avstand("codnamse", "codenames", 2), 2);
  assert.ok(S.avstand("yahtze", "yatzy", 1) > 1);
  const liten = S.lag({ spill: [{ id: "a", navn: "Kodeknekkeren", undertittel: "Kodeord", kort: "", sok: ["mastermind"], tagger: [], spillere: [1, 2], minutter: [5, 10], mobiler: "en", rekkefolge: 1 }], taggsok: {}, sprak: "nb", F });
  assert.equal(liten.sok("mastermnid").rettet, "mastermind"); // 10 letters, one swap
  assert.equal(liten.sok("mostermund").rettet, "mastermind"); // 10 letters, two edits
  assert.equal(liten.sok("mostermunt").rettet, ""); // three edits: no
  assert.equal(liten.sok("kodeort").rettet, "kodeord"); // 7 letters, one edit
  assert.equal(liten.sok("kadeort").rettet, ""); // 7 letters, two edits: no
});

test("head counts: «2 spillere», «to spillere», «for to», «par» give the games two can play", () => {
  const forTo = ider(vanlige("nb").filter((s) => s.spillere[0] <= 2 && s.spillere[1] >= 2));
  assert.ok(forTo.length > 30 && forTo.length < vanlige("nb").length);
  for (const q of ["2 spillere", "to spillere", "for to", "for 2", "2 stk", "to stykker", "vi er to", "vi er 2", "par", "date", "kjæresten", "2 personer", "spill for to", "spill for 2 personer"]) {
    const r = U.nb.sok.sok(q);
    assert.equal(r.antall, "2", `«${q}» ble ikke lest som to spillere`);
    assert.deepEqual(U.nb.finn(q).slice().sort(), forTo, `«${q}»`);
    assert.equal(r.tekst, false, `«${q}»: ordene skal ikke også søkes etter som tekst`);
  }
  // The other counts land in the finder's bands: a game fits when the whole band can play it.
  for (const [q, band] of [["vi er 5", "5-8"], ["8 personer", "5-8"], ["fire spillere", "3-4"], ["tre stk", "3-4"], ["12 personer", "9+"], ["tolv stykker", "9+"], ["for en", "1"], ["3-4 spillere", "3-4"]]) {
    const r = U.nb.sok.sok(q);
    assert.equal(r.antall, band, `«${q}» → ${r.antall}`);
    const [a, b] = F.SPILLERE[band];
    assert.deepEqual(U.nb.finn(q).slice().sort(), ider(vanlige("nb").filter((s) => s.spillere[0] <= a && s.spillere[1] >= b)), `«${q}»`);
  }
  // A count and words together.
  const kort = U.nb.finn("kortspill for to");
  assert.ok(kort.length >= 4 && kort.every((n) => spillAv("nb", n).spillere[0] <= 2 && spillAv("nb", n).spillere[1] >= 2 && spillAv("nb", n).tagger.includes("kort")), kort.join());
  // A number that is not a head count is left alone.
  assert.equal(U.nb.finn("20 spørsmål")[0], "detektiven");
  assert.equal(U.nb.finn("2048")[0], "dobleren");
  assert.equal(U.nb.sok.sok("fire på rad").antall, "");
  assert.equal(U.nb.finn("fire på rad")[0], "fireren");
  assert.equal(U.nb.sok.sok("spill for 5 åringer").antall, "", "«for 5 åringer» er en alder, ikke et antall");
  // English and Danish have their own number words and nouns.
  for (const q of ["2 players", "two players", "for two", "we are 2", "couple", "date night", "2 people", "two of us"]) assert.equal(U.en.sok.sok(q).antall, "2", `en «${q}»`);
  for (const q of ["2 spillere", "to spillere", "for to", "til to", "vi er to", "par", "kæresten", "2 personer"]) assert.equal(U.da.sok.sok(q).antall, "2", `da «${q}»`);
  assert.equal(U.en.sok.sok("we are 5").antall, "5-8");
  assert.equal(U.da.sok.sok("otte personer").antall, "5-8");
  const enForTo = ider(vanlige("en").filter((s) => s.spillere[0] <= 2 && s.spillere[1] >= 2));
  assert.deepEqual(U.en.finn("for two").slice().sort(), enForTo);
});

test("«par» is two players – not 54 party games; «lag» is not «slag»; «poker» is not «pokerfjes»", () => {
  const par = U.nb.finn("par");
  assert.ok(par.every((id) => U.nb.av.get(id).spillere[0] <= 2 && U.nb.av.get(id).spillere[1] >= 2));
  const spill = [
    { id: "a", navn: "Slaget", undertittel: "Partyspill", kort: "Et slag om gangen.", sok: ["pokerfjes", "kortspill"], tagger: [], spillere: [3, 8], minutter: [5, 10], mobiler: "en", rekkefolge: 1 },
    { id: "b", navn: "Laget", undertittel: "Lag mot lag", kort: "", sok: ["spill"], tagger: [], spillere: [4, 8], minutter: [5, 10], mobiler: "en", rekkefolge: 2 },
  ];
  const s = S.lag({ spill, taggsok: {}, sprak: "nb", F });
  const finn = (q) => s.sok(q).treff.map((x) => x.n);
  assert.deepEqual(finn("lag"), ["b"], "«lag» fant «slag»");
  assert.deepEqual(finn("par"), [], "«par» fant «partyspill»");
  assert.deepEqual(finn("party"), ["a"], "starten av et ord skal finne det");
  assert.deepEqual(finn("spill"), ["b", "a"], "«spill» skal finne «kortspill» – etter et helt ord");
  assert.deepEqual(finn("arty"), [], "«arty» er midt i et ord");
  assert.deepEqual(finn("fjes"), ["a"], "slutten av et sammensatt ord (fire bokstaver eller mer)");
  assert.deepEqual(finn("jes"), [], "tre bokstaver finner ikke slutten av et ord");
  assert.deepEqual(finn("poker"), [], "«poker» fant «pokerfjes»");
  assert.equal(s.sok("poker").ikkeEnna.nr, S.IKKE_ENNA.findIndex((x) => x.ord.includes("poker")));
  assert.equal(S.mote("lag", "slag", true), -1);
  assert.equal(S.mote("spill", "kortspill", true), 2);
  assert.equal(S.mote("kort", "kortspill", true), 1);
  assert.equal(S.mote("kort", "kortspill", false), -1);
  assert.equal(S.mote("kort", "kort", false), 0);
});

test("ranking: the game that IS the query first, then name, genre, its own words, the kind of game", () => {
  const jul = U.nb.finn("jul");
  for (const id of ["nissen", "julekalenderen", "nissetrekning"]) assert.ok(jul.indexOf(id) >= 0 && jul.indexOf(id) < 5, `«jul»: ${id} er nummer ${jul.indexOf(id) + 1} (${jul.slice(0, 6).join(", ")})`);
  assert.ok(jul.length > 20, "«jul» skal også gi familiespillene");
  const spill = [
    { id: "merke", navn: "Hesten", undertittel: "Brettspill", kort: "", sok: [], tagger: ["x"], spillere: [1, 2], minutter: [5, 10], mobiler: "en", rekkefolge: 1 },
    { id: "egne", navn: "Bonden", undertittel: "Tre på rad", kort: "Litt sjakk i den.", sok: [], tagger: [], spillere: [1, 2], minutter: [5, 10], mobiler: "en", rekkefolge: 2 },
    { id: "sjanger", navn: "Hopperen", undertittel: "Sjakk for flere", kort: "", sok: [], tagger: [], spillere: [1, 6], minutter: [5, 10], mobiler: "en", rekkefolge: 3 },
    { id: "navn", navn: "Sjakk og matt", undertittel: "Brettspill", kort: "", sok: [], tagger: [], spillere: [1, 2], minutter: [5, 10], mobiler: "en", rekkefolge: 4 },
    { id: "hele", navn: "Kongen", undertittel: "Brettspill", kort: "", sok: ["sjakk"], tagger: [], spillere: [1, 2], minutter: [5, 10], mobiler: "en", rekkefolge: 5, topp: 2 },
    { id: "hele2", navn: "Dronninga", undertittel: "Sjakk", kort: "", sok: [], tagger: [], spillere: [1, 2], minutter: [5, 10], mobiler: "en", rekkefolge: 6, topp: 1 },
  ];
  const s = S.lag({ spill, taggsok: { x: ["sjakk"] }, sprak: "nb", F });
  // (the two whose genre or search word is exactly «sjakk»: the most played first)
  assert.deepEqual(s.sok("sjakk").treff.map((x) => x.n), ["hele2", "hele", "navn", "sjanger", "egne", "merke"]);
  // Only facts: «Mest spilt nå», then the site's order.
  assert.deepEqual(s.sok("for to").treff.map((x) => x.n), ["hele2", "hele", "merke", "egne", "sjanger", "navn"]);
  assert.deepEqual(s.sok("").treff.map((x) => x.n), ["merke", "egne", "sjanger", "navn", "hele", "hele2"], "et tomt søk gir alt, i spillistas rekkefølge");
});

test("the facts in whole phrases: one phone, several, a phone each, alone, against the phone, quick", () => {
  const alle = vanlige("nb");
  const fakta = {
    "én mobil": (s) => s.mobiler !== "hver",
    "en mobil": (s) => s.mobiler !== "hver",
    "flere mobiler": (s) => s.mobiler !== "en",
    "hver sin mobil": (s) => !!s.nett || s.mobiler !== "en",
    alene: (s) => s.spillere[0] === 1,
    "1 spiller": (s) => s.spillere[0] === 1,
    "mot mobilen": (s) => !!s.motMobilen,
    "mot datamaskinen": (s) => !!s.motMobilen,
    kjapt: (s) => s.minutter[0] < 10,
    raskt: (s) => s.minutter[0] < 10,
    "kort tid": (s) => s.minutter[0] < 10,
    "5 minutter": (s) => s.minutter[0] < 10,
    "20 min": (s) => s.minutter[0] <= 20,
  };
  for (const [q, passer] of Object.entries(fakta)) assert.deepEqual(U.nb.finn(q).slice().sort(), ider(alle.filter(passer)), `«${q}»`);
  assert.deepEqual(U.en.finn("against the computer").slice().sort(), ider(vanlige("en").filter((s) => s.motMobilen)));
  assert.deepEqual(U.en.finn("quick").slice().sort(), ider(vanlige("en").filter((s) => s.minutter[0] < 10)));
  assert.deepEqual(U.da.finn("mod computeren").slice().sort(), ider(vanlige("da").filter((s) => s.motMobilen)));
  assert.deepEqual(U.da.finn("hurtigt").slice().sort(), ider(vanlige("da").filter((s) => s.minutter[0] < 10)));
  // A fact and a word together.
  assert.equal(U.nb.finn("yatzy mot data")[0], "terninga");
  assert.ok(U.nb.finn("kortspill alene").every((n) => spillAv("nb", n).spillere[0] === 1));
});

test("«på nett» finds exactly the games that can be played online", () => {
  for (const [sprak, sporsmal] of [["nb", ["på nett", "online", "nettspill", "spill på nett", "på nettet"]], ["en", ["online", "online games", "remote"]], ["da", ["online", "på nettet", "spil online"]]]) {
    const nett = ider(vanlige(sprak).filter((s) => s.nett));
    assert.ok(nett.length >= 30, `${sprak}: bare ${nett.length} spill på nett`);
    assert.deepEqual(ider(vanlige(sprak).filter((s) => F.iRom(s, "nett"))), nett, `${sprak}: rommet «På nett» og søket er ikke de samme spillene`);
    for (const q of sporsmal) assert.deepEqual(U[sprak].finn(q).slice().sort(), nett, `${sprak} «${q}»`);
    // No game carries the bare words as a search word of its own (it would join the list).
    for (const s of U[sprak].spill) for (const q of sporsmal) assert.ok(![s.navn, s.undertittel, ...s.sok].map(S.ren).includes(S.ren(q)), `${sprak} ${s.id}: «${q}» er et eget søkeord`);
  }
  // «på nett» is also how people say «in the browser»: a game that carries the whole phrase is
  // found, and when nothing online fits, the word is let go.
  assert.equal(U.nb.finn("kabal på nett")[0], "kortkongen");
  assert.ok(!U.nb.av.get("kortkongen").nett);
  assert.ok(U.nb.finn("quiz på nett").includes("bedreviteren"));
  assert.ok(U.nb.finn("quiz på nett").filter((id) => id !== "bedreviteren").every((id) => U.nb.av.get(id).nett));
  assert.equal(U.nb.finn("kabal online")[0], "kortkongen");
  assert.equal(U.nb.finn("ludo på nett")[0], "brikka");
});

test("occasions: the words for an evening find the kind of game", () => {
  const med = (sprak, q, tagg) => {
    const funnet = U[sprak].finn(q);
    const ventet = vanlige(sprak).filter((s) => s.tagger.includes(tagg));
    assert.ok(funnet.length >= ventet.length && ventet.every((s) => funnet.includes(s.id)), `${sprak} «${q}» fant ${funnet.length} spill, ventet de ${ventet.length} med «${tagg}»`);
  };
  for (const q of ["hytta", "hyttetur", "klassetur"]) med("nb", q, "familie");
  for (const q of ["venner", "vennekveld", "nachspiel", "hjemmefest", "vors", "klassetur", "kollegaer"]) med("nb", q, "fest");
  for (const q of ["teambuilding", "jobb", "kollegaer"]) med("nb", q, "lag");
  for (const q of ["eldre", "besteforeldre"]) med("nb", q, "klassiker");
  assert.ok(U.nb.finn("eldre").length < 50, "«eldre» skal ikke finne alle familiespillene (via «besteforeldre»)");
  for (const [q, tagg] of [["friends", "fest"], ["game night", "fest"], ["house party", "fest"], ["cabin", "familie"], ["grandparents", "klassiker"], ["colleagues", "lag"], ["team building", "lag"], ["school trip", "familie"]]) med("en", q, tagg);
  for (const [q, tagg] of [["venner", "fest"], ["spilleaften", "fest"], ["hjemmefest", "fest"], ["sommerhus", "familie"], ["bedsteforældre", "klassiker"], ["kolleger", "lag"], ["lejrskole", "familie"]]) med("da", q, tagg);
});

test("never a dead end: a well-known game that is not here says «not yet» and points to the nearest", () => {
  for (const sprak of ["nb", "en", "da"]) {
    for (const q of ["poker", "monopoly", "scrabble", "wordfeud", "risk", "catan", "sims", "fortnite", "roblox", "minecraft", "among us", "geoguessr", "bridge", "tetris"]) {
      const r = U[sprak].sok.sok(q);
      assert.equal(r.treff.length, 0, `${sprak} «${q}» gir treff: ${r.treff.map((x) => x.n).join(", ")}`);
      assert.ok(r.ikkeEnna && r.ikkeEnna.nr >= 0, `${sprak} «${q}» sier ikke «ikke ennå»`);
      assert.ok(r.ikkeEnna.spill.every((s) => U[sprak].av.has(s.id)));
    }
  }
  assert.equal(U.nb.sok.sok("monopol").ikkeEnna.nr, 0);
  assert.equal(U.nb.sok.sok("spille poker på nett").ikkeEnna.rom, "kort");
  assert.deepEqual(U.nb.sok.sok("tetris").ikkeEnna.spill.map((s) => s.id), ["blokka"]);
  assert.deepEqual(U.nb.sok.sok("among us").ikkeEnna.spill.map((s) => s.id), ["luringen", "spionen", "varulven"]);
  assert.deepEqual(U.en.sok.sok("among us").ikkeEnna.spill.map((s) => s.id), ["spionen", "varulven"], "Luringen is Norwegian only");
  // The list: every nearest game and room exists, and no game carries one of the names as its own.
  for (const x of S.IKKE_ENNA) {
    assert.ok(!x.rom || F.ROMMENE.includes(x.rom), `ukjent rom «${x.rom}»`);
    for (const id of x.spill || []) assert.ok(U.nb.av.has(id), `ukjent spill «${id}» i IKKE_ENNA`);
    for (const sprak of ["nb", "en", "da"]) for (const s of U[sprak].spill) for (const navn of x.ord) assert.ok(![s.navn, s.undertittel, ...s.sok].map(S.ren).includes(navn), `${sprak} ${s.id} har «${navn}» som eget søkeord`);
  }
  // Nonsense: nothing, and nothing claimed.
  const tull = U.nb.sok.sok("xyzzy");
  assert.deepEqual([tull.treff.length, tull.rettet, tull.ikkeEnna, tull.tom], [0, "", null, false]);
  // Nothing typed: everything, in the list's order.
  const tomt = U.nb.sok.sok("  ");
  assert.equal(tomt.tom, true);
  assert.deepEqual(tomt.treff.map((x) => x.n), U.nb.spill.map((s) => s.id));
});

test("well-known games inside games are entries of their own: «spider», «freecell», «fem på rad», «gin rummy», «svarteper»", () => {
  const forst = {
    spider: "kortkongen#edderkopp", "spider kabal": "kortkongen#edderkopp", edderkoppkabal: "kortkongen#edderkopp", freecell: "kortkongen#freecell", "free cell": "kortkongen#freecell",
    pyramidekabal: "kortkongen#pyramide", "tre topper": "kortkongen#topper", "tri peaks": "kortkongen#topper", golfkabal: "kortkongen#golf",
    "fem på rad": "bonden#fem", gomoku: "bonden#fem", "gin rummy": "samleren#gin", 500: "samleren#500", femhundre: "samleren#500",
    svarteper: "pusen#svarte", "go fish": "pusen#fisk", krig: "pusen#krig", snapp: "pusen#snap", "én natt": "varulven#en", "one night": "varulven#en",
  };
  for (const [q, n] of Object.entries(forst)) assert.equal(U.nb.finn(q)[0], n, `«${q}» → ${U.nb.finn(q).slice(0, 4).join(", ") || "ingenting"}`);
  for (const [q, n] of Object.entries({ spider: "kortkongen#edderkopp", "spider solitaire": "kortkongen#edderkopp", freecell: "kortkongen#freecell", "five in a row": "bonden#fem", "gin rummy": "samleren#gin", "old maid": "pusen#svarte", "go fish": "pusen#fisk", "one night": "varulven#en" })) assert.equal(U.en.finn(q)[0], n, `en «${q}» → ${U.en.finn(q).slice(0, 4).join(", ")}`);
  for (const [q, n] of Object.entries({ spider: "kortkongen#edderkopp", freecell: "kortkongen#freecell", "fem på stribe": "bonden#fem", "gin rummy": "samleren#gin", "sorte per": "pusen#svarte", "én nat": "varulven#en" })) assert.equal(U.da.finn(q)[0], n, `da «${q}» → ${U.da.finn(q).slice(0, 4).join(", ")}`);
  // «spider» and «freecell» are the solitaires inside Kortkongen and nothing else.
  assert.deepEqual(U.nb.finn("spider"), ["kortkongen#edderkopp"]);
  assert.deepEqual(U.nb.finn("freecell"), ["kortkongen#freecell"]);
  // The genre finds the game first, then the games inside it; a game named for the word before a variant.
  const kabal = U.nb.finn("kabal");
  assert.equal(kabal[0], "kortkongen");
  for (const v of ["edderkopp", "freecell", "pyramide", "topper", "golf"]) assert.ok(kabal.includes(`kortkongen#${v}`), `«kabal» mangler ${v}: ${kabal.join(", ")}`);
  assert.deepEqual(U.nb.finn("golf").slice(0, 2), ["golfballen", "kortkongen#golf"]);
  // A hit carries the game and the variant (the page links to /<game>/#variant=<id>).
  const treff = U.nb.sok.sok("freecell").treff[0];
  assert.equal(treff.s.id, "kortkongen");
  assert.deepEqual([treff.v.id, treff.v.navn], ["freecell", "FreeCell"]);
  // Never counted as games: not in an empty search, and not found by facts alone.
  for (const q of ["", "for to", "på nett", "alene", "kjapt"]) assert.ok(U.nb.sok.sok(q).treff.every((x) => !x.v), `«${q}» lister varianter`);
  assert.equal(U.nb.sok.sok("").treff.length, U.nb.spill.length);
  // A variant's own facts count where it has them: gin rummy is for two, Snapp is not played online.
  assert.equal(U.nb.finn("gin rummy for to")[0], "samleren#gin");
  assert.ok(!U.nb.finn("gin rummy for fire").includes("samleren#gin"), "gin rummy for fire");
  assert.ok(!U.nb.finn("snapp på nett").includes("pusen#snap"), "Snapp spilles ikke på nett");
  assert.ok(U.nb.finn("svarteper på nett").includes("pusen#svarte"));
  // The five games, and every variant with a name in all three editions.
  const med = U.nb.spill.filter((s) => s.varianter);
  assert.deepEqual(med.map((s) => s.id).sort(), ["bonden", "kortkongen", "pusen", "samleren", "varulven"]);
  for (const sprak of ["en", "da"]) for (const s of med) assert.deepEqual((U[sprak].av.get(s.id).varianter || []).map((v) => v.id), s.varianter.map((v) => v.id), `${sprak} ${s.id}: variantene`);
});

test("the 18+ games are found like the others (the page keeps them behind the door)", () => {
  const r = U.nb.sok.sok("never have i ever");
  assert.deepEqual(r.treff.map((x) => x.n), ["sladrehanken", "torsten"]);
  assert.equal(U.nb.finn("drikkeleker").length, 0);
  assert.equal(U.nb.sok.sok("drikkeleker").treff.length, U.nb.spill.filter((s) => s.alder18).length);
});
