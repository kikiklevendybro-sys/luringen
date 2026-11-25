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

import { MERKER, merkeI } from "../scripts/rusj.mjs";
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
    // What a visitor sees before the 18+ door: the games (and variants) found, best first. (The
        // search itself leaves the 18+ games out while the door is closed – nothing is filtered here.)
    const finn = (q) => sok.sok(q).treff.map((x) => x.n);
    // … and the game of the best match (the game itself, or the game a variant is inside).
    const forste = (q) => (finn(q)[0] || "").split("#")[0];
    U[sprak] = { spill, taggsok, av: new Map(spill.map((s) => [s.id, s])), sok, finn, forste };
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
  for (const [q, ord, id] of [["yatsy", "yatzy", "terninga"], ["sudoko", "sudoku", "tallknuseren"], ["luddo", "ludo", "brikka"], ["kabel", "kabal", "kortkongen"], ["bakgammon", "backgammon", "tavla"]]) {
    const r = U.nb.sok.sok(q);
    assert.equal(r.rettet, ord, `«${q}» ble rettet til «${r.rettet}»`);
    assert.equal(r.treff[0].n, id, `«${q}» → ${r.treff.slice(0, 3).map((x) => x.n).join(", ")}`);
  }
  // A word that is only a search word (it may be somebody's brand) finds the game, but is never
  // written out on the page.
  const merke = U.nb.sok.sok("codnames");
  assert.deepEqual([merke.treff[0].n, merke.rettet], ["kodeknekkeren", ""]);
  for (const sprak of ["nb", "en", "da"]) {
    // (a name on the list that is also an ordinary word the edition itself uses – «memory» in English – is not hidden)
    for (const m of MERKER) {
      if (m.split(/[ -]/).every((d) => U[sprak].sok.viser(d))) continue;
      for (let i = 1; i < m.length; i++) {
        const feil = m.slice(0, i) + m.slice(i + 1); // one letter dropped
        const r = U[sprak].sok.sok(feil).rettet;
        assert.equal(merkeI(r), null, `${sprak} «${feil}» skriver ut «${r}»`);
      }
    }
  }
  assert.equal(U.da.sok.sok("yatsy").rettet, "yatzy");
  const merkeEn = U.en.sok.sok("yahtzea");
  assert.deepEqual([merkeEn.treff[0].n, merkeEn.rettet], ["terninga", ""]);
  // No correction when the word is found as it is, for short words, or far from everything we know –
  // and never to a word of three letters («fifa» is not «fia») or, for a short word, to the start of
  // a longer one («dans» is not «damspill», «lego» is not «legger»).
  for (const q of ["yatzy", "uno", "xyzzy", "qqqqqqqq", "abc", "fifa", "dans", "lego", "unoo"]) assert.equal(U.nb.sok.sok(q).rettet, "", `«${q}» ble rettet til «${U.nb.sok.sok(q).rettet}»`);
  // A real word is never turned into another game: none of these is put right (each one was, to the
  // word after the arrow, before the rules were made strict). A word of 4–5 letters is only put
  // right to a whole name or genre; the first letter always stands; two edits need ten letters; a
  // compound («…spill») is measured in its first part; and only a whole name, genre, search word or
  // word for a kind of game is ever the answer.
  const IKKE = {
    nb: ["hest → helst", "hestespill → hermespill", "jentespill → vendespill", "guttespill → mattespill", "skytespill → skuespill", "fyllespill → møllespill", "pong → poeng", "dart → dare", "dobble → dobbel", "scrabb → scramble", "scrabbl → scramble", "mono → moon", "monop → moon", "jigs → pigs", "vitser → vitsegåter"],
    en: ["horse → house", "drunk → drink", "pong → song", "scrabb → scramble", "scrabbl → scramble", "scrabble → scramble", "mono → moon", "monop → moon", "monopol → moon", "monopoly → moon", "jigs → pigs", "jigsa → pigs", "jigsaw → pigs"],
    da: ["pigespil → stigespil", "snyd → skyd", "hest → helst", "dart → dare"],
  };
  for (const [sprak, par] of Object.entries(IKKE)) {
    for (const p of par) {
      const q = p.split(" → ")[0];
      for (const over18 of [false, true]) {
        const r = U[sprak].sok.sok(q, { over18 });
        assert.deepEqual([r.rettet, r.treff.length], ["", 0], `${sprak} «${p}»: rettet til «${r.rettet}», ${r.treff.length} treff (${r.treff.slice(0, 3).map((x) => x.n).join(", ")})`);
      }
    }
  }
  // A name on its way in is never taken for another word: every start of these, in every edition.
  for (const sprak of ["nb", "en", "da"]) {
    for (const navn of ["scrabble", "monopoly", "jigsaw", "hestespill", "skytespill", "pigespil", "dobble"]) {
      for (let i = 3; i <= navn.length; i++) {
        const r = U[sprak].sok.sok(navn.slice(0, i));
        assert.equal(r.rettet, "", `${sprak} «${navn.slice(0, i)}» (på vei til «${navn}») ble rettet til «${r.rettet}»`);
      }
    }
  }
  // … and these still are.
  for (const [sprak, q, ord] of [["nb", "yatsy", "yatzy"], ["nb", "sudoko", "sudoku"], ["nb", "luddo", "ludo"], ["nb", "kabel", "kabal"], ["nb", "bakgammon", "backgammon"], ["da", "yatsy", "yatzy"], ["en", "dicye", "dicey"]]) assert.equal(U[sprak].sok.sok(q).rettet, ord, `${sprak} «${q}»`);
  // From seven letters, a word still being typed is put right against the start of a longer one.
  assert.match(U.nb.sok.sok("selksap").rettet, /^selskapslek/);
  assert.ok(U.nb.sok.sok("selksap").treff.length > 20);
  assert.equal(U.nb.sok.sok("selksap quiz").rettet, "", "only the word being typed (the last one) is read as a start");
  // The distance (neighbours swapped count as one).
  assert.equal(S.avstand("yatsy", "yatzy", 2), 1);
  assert.equal(S.avstand("yazty", "yatzy", 2), 1);
  assert.equal(S.avstand("codnamse", "codenames", 2), 2);
  assert.ok(S.avstand("yahtze", "yatzy", 1) > 1);
  const liten = S.lag({ spill: [{ id: "a", navn: "Kodeknekkeren", undertittel: "Kodeord", kort: "", sok: ["mastermind"], tagger: [], spillere: [1, 2], minutter: [5, 10], mobiler: "en", rekkefolge: 1 }], taggsok: {}, sprak: "nb", F });
  assert.deepEqual([liten.sok("mastermnid").treff.length, liten.sok("mastermnid").rettet], [1, ""]); // 10 letters, one swap (a search word: found, not shown)
  assert.equal(liten.sok("mostermund").treff.length, 1); // 10 letters, two edits
  assert.equal(liten.sok("mostermunt").treff.length, 0); // three edits: no
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
  // A count is the number itself: the games that many can play (the finder's band is only kept
  // for its suggestions). «12 spillere» is not «99 spillere», and «varulv 4 spillere» finds
  // Varulven (4–12), which the band 3–4 would not.
  const kanSpilles = (n) => ider(vanlige("nb").filter((s) => s.spillere[0] <= n && n <= s.spillere[1]));
  for (const [q, n, band] of [["vi er 5", 5, "5-8"], ["8 personer", 8, "5-8"], ["fire spillere", 4, "3-4"], ["tre stk", 3, "3-4"], ["12 personer", 12, "9+"], ["tolv stykker", 12, "9+"], ["for 1", 1, "1"], ["en person", 1, "1"], ["ett stk", 1, "1"], ["på 8", 8, "5-8"], ["20 spillere", 20, "9+"]]) {
    const r = U.nb.sok.sok(q);
    assert.deepEqual([r.n, r.antall], [n, band], `«${q}» → ${r.n} (${r.antall})`);
    assert.deepEqual(U.nb.finn(q).slice().sort(), kanSpilles(n), `«${q}»`);
  }
  assert.notDeepEqual(kanSpilles(5), kanSpilles(8));
  assert.notDeepEqual(kanSpilles(12), kanSpilles(20));
  assert.deepEqual(U.nb.finn("99 spillere"), [], "ingen spill er for 99");
  assert.deepEqual(U.nb.finn("varulv 4 spillere").slice(0, 1), ["varulven"]);
  assert.deepEqual(U.nb.finn("en natt for 12"), ["varulven"], "«Én natt» er for 4–10: for tolv er det bare det klassiske spillet");
  assert.ok(U.nb.finn("en natt for 8").includes("varulven#en"));
  // «3–4 spillere»: both three and four can play.
  assert.deepEqual(U.nb.finn("3-4 spillere").slice().sort(), ider(vanlige("nb").filter((s) => s.spillere[0] <= 3 && s.spillere[1] >= 4)));
  // Nought is no head count: nothing is asked.
  assert.deepEqual([U.nb.sok.sok("0 spillere").n, U.nb.finn("0 spillere").length], [0, vanlige("nb").length]);
  // «en/et/ett» is an article, not «one» – unless a people noun follows («én spiller», «en person»).
  for (const [a, b] of [["leker til en fest", "leker til fest"], ["leker til ett selskap", "leker til selskap"], ["spill for en gjeng", "spill for gjeng"], ["vi er en stor gjeng", "stor gjeng"]]) {
    assert.equal(U.nb.sok.sok(a).n, 0, `«${a}» ble lest som ${U.nb.sok.sok(a).n} spiller`);
    assert.deepEqual(U.nb.finn(a), U.nb.finn(b), `«${a}» gir ikke det samme som «${b}»`);
    assert.ok(U.nb.finn(a).length > 20 && !U.nb.finn(a).every((n) => spillAv("nb", n).spillere[0] === 1), `«${a}» → ${U.nb.finn(a).length} spill`);
  }
  const gjeng = U.nb.sok.sok("vi er en gjeng på 8");
  assert.equal(gjeng.n, 8);
  assert.ok(gjeng.treff.length > 10 && gjeng.treff.every((x) => x.s.spillere[0] <= 8 && x.s.spillere[1] >= 8 && x.s.tagger.includes("fest")));
  for (const [sprak, q] of [["da", "til en fest"], ["da", "til et selskab"], ["da", "vi er en flok"], ["en", "we are one big group"]]) {
    assert.equal(U[sprak].sok.sok(q).n, 0, `${sprak} «${q}»`);
    assert.ok(U[sprak].finn(q).length > 20, `${sprak} «${q}» → ${U[sprak].finn(q).length} spill`);
  }
  // «for/til + number» is a head count only when the number ends the query (or a people noun
  // follows): a date, a number of teams, a birthday and a number of hours are not.
  for (const [sprak, q, tagg] of [["nb", "leker til 17. mai", "familie"], ["nb", "for 2 lag", "lag"], ["nb", "leker til 50-årsdag", "fest"], ["nb", "leker til 30-årsdag", "fest"], ["da", "til 2 hold", "lag"], ["en", "for 2 teams", "lag"], ["en", "for 2 hours", ""]]) {
    const r = U[sprak].sok.sok(q);
    assert.equal(r.n, 0, `${sprak} «${q}» ble lest som ${r.n} spillere`);
    if (tagg) assert.ok(r.treff.length >= 5 && vanlige(sprak).filter((s) => s.tagger.includes(tagg)).every((s) => r.av.has(s.id)), `${sprak} «${q}» fant ${r.treff.length} spill, ventet dem med «${tagg}»`);
  }
  for (const q of ["leker for 4", "kortspill til 3", "quiz for 6 personer"]) assert.ok(U.nb.sok.sok(q).n > 0, `«${q}»`);
  // A count and words together.
  const kort = U.nb.finn("kortspill for to");
  assert.ok(kort.length >= 4 && kort.every((n) => spillAv("nb", n).spillere[0] <= 2 && spillAv("nb", n).spillere[1] >= 2 && spillAv("nb", n).tagger.includes("kort")), kort.join());
  // A number that is not a head count is left alone.
  assert.equal(U.nb.finn("20 spørsmål")[0], "detektiven");
  assert.equal(U.nb.finn("2048")[0], "dobleren");
  assert.equal(U.nb.sok.sok("fire på rad").antall, "");
  assert.equal(U.nb.finn("fire på rad")[0], "fireren");
  assert.equal(U.nb.sok.sok("spill for 5 åringer").antall, "", "«for 5 åringer» er en alder, ikke et antall");
  // «to» alone is the two of us – not the solitaire whose name starts with it.
  assert.deepEqual([U.nb.sok.sok("to").n, U.nb.finn("to").slice().sort()], [2, forTo]);
  // English and Danish have their own number words and nouns – and every phrase on the lists is
  // read whole: «date night» is not «date» and a word «night» to look for.
  for (const [sprak, sporsmal] of [["en", ["2 players", "two players", "for two", "we are 2", "couple", "date night", "games for date night", "2 people", "two of us", "two"]], ["da", ["2 spillere", "to spillere", "for to", "til to", "vi er to", "par", "kæresten", "2 personer", "date night", "to"]]]) {
    const toKan = ider(vanlige(sprak).filter((s) => s.spillere[0] <= 2 && s.spillere[1] >= 2));
    for (const q of sporsmal) {
      const r = U[sprak].sok.sok(q);
      assert.deepEqual([r.n, r.tekst], [2, false], `${sprak} «${q}» → ${r.n}${r.tekst ? ", og ord å lete etter" : ""}`);
      assert.deepEqual(U[sprak].finn(q).slice().sort(), toKan, `${sprak} «${q}»`);
    }
  }
  assert.deepEqual([U.en.sok.sok("we are 5").n, U.en.sok.sok("we are 5").antall], [5, "5-8"]);
  assert.deepEqual([U.da.sok.sok("otte personer").n, U.da.sok.sok("otte personer").antall], [8, "5-8"]);
  // The alternatives of a rule are tried the longest first, whatever order they are written in.
  assert.equal(S.lengstForst("date|date night|(?:a|bb) x|kort tid"), "date night|(?:a|bb) x|kort tid|date");
  for (const R of Object.values(S.REGLER)) {
    for (const felt of ["folk", "vi", "til", "to", "kjapt", "min", "nett", "hver", "alene"]) {
      const sortert = S.lengstForst(R[felt]).split("|");
      for (let i = 0; i < sortert.length; i++) for (let j = i + 1; j < sortert.length; j++) assert.ok(!sortert[j].startsWith(sortert[i] + " "), `«${sortert[i]}» står foran «${sortert[j]}»`);
    }
  }
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
  for (const q of ["quick", "short on time", "in a hurry", "5 minutes", "5 minute games"]) assert.deepEqual(U.en.finn(q).slice().sort(), ider(vanlige("en").filter((s) => s.minutter[0] < 10)), `en «${q}»`);
  for (const q of ["5 minutters spill", "5 min", "fem minutter", "korte runder"]) assert.deepEqual(U.nb.finn(q).slice().sort(), ider(alle.filter((s) => s.minutter[0] < 10)), `«${q}»`);
  assert.deepEqual(U.da.finn("mod computeren").slice().sort(), ider(vanlige("da").filter((s) => s.motMobilen)));
  assert.deepEqual(U.da.finn("hurtigt").slice().sort(), ider(vanlige("da").filter((s) => s.minutter[0] < 10)));
  // A fact and a word together.
  assert.equal(U.nb.finn("yatzy mot data")[0], "terninga");
  assert.ok(U.nb.finn("kortspill alene").every((n) => spillAv("nb", n).spillere[0] === 1));
});

test("«på nett» finds exactly the games that can be played online", () => {
  for (const [sprak, sporsmal] of [["nb", ["på nett", "online", "nettspill", "spill på nett", "på nettet", "nett", "pa nett", "paa nett", "PÅ NETT"]], ["en", ["online", "online games", "remote"]], ["da", ["online", "på nettet", "spil online", "pa nettet"]]]) {
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
  for (const q of ["venner", "vennekveld", "nachspiel", "hjemmefest", "vors", "klassetur", "kollegaer", "nyttårsaften", "halloween", "utdrikningslag", "bursdagsfest"]) med("nb", q, "fest");
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
  // Nothing typed: everything, in the list's order (the 18+ games only with the door open).
  const tomt = U.nb.sok.sok("  ");
  assert.equal(tomt.tom, true);
  assert.deepEqual(tomt.treff.map((x) => x.n), vanlige("nb").map((s) => s.id));
  assert.deepEqual(U.nb.sok.sok("  ", { over18: true }).treff.map((x) => x.n), U.nb.spill.map((s) => s.id));
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
  assert.equal(U.nb.sok.sok("", { over18: true }).treff.length, U.nb.spill.length);
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

test("the 18+ games: never in the list while the door is closed, whatever is typed", () => {
  for (const sprak of ["nb", "en", "da"]) {
    const atten = U[sprak].spill.filter((s) => s.alder18);
    assert.ok(atten.length >= 5);
    // Their names, genres and every search word of theirs, the words for drinking games and for a
    // party, facts, nothing at all, and nonsense.
    const sporsmal = ["", "spill", "games", "spil", "for to", "for two", "kjapt", "quick", "vors", "pre-drinks", "forfest", "kort", "cards", "fest", "party", "xyzzy", ...(U[sprak].sok.sok("drikk").drikke ? ["drikk"] : []), ...atten.flatMap((s) => [s.navn, s.undertittel, ...s.sok])];
    for (const q of sporsmal) {
      const r = U[sprak].sok.sok(q);
      assert.ok(r.treff.every((x) => !x.s.alder18), `${sprak} «${q}»: ${r.treff.filter((x) => x.s.alder18).map((x) => x.n).join(", ")} står i lista før aldersdøra`);
      assert.ok(r.voksne.every((s) => s.alder18));
      // … and with the door open they are rows like the others.
      const apen = U[sprak].sok.sok(q, { over18: true });
      assert.equal(apen.voksne.length, 0, `${sprak} «${q}»: noe bak en åpen dør`);
      for (const s of r.voksne) assert.ok(apen.av.has(s.id), `${sprak} «${q}»: ${s.id} er bak døra, men ikke i lista når den er åpen`);
    }
    // Asked for by name: behind the door, and first in the list once it is open.
    for (const s of atten) {
      assert.ok(U[sprak].sok.sok(s.navn).voksne.includes(s), `${sprak}: «${s.navn}» er ikke bak døra`);
      assert.equal(U[sprak].sok.sok(s.navn, { over18: true }).treff[0].n, s.id, `${sprak}: «${s.navn}» med åpen dør`);
    }
  }
  // The family game answers «never have i ever»; its 18+ twin is a row only with the door open.
  assert.deepEqual(U.nb.sok.sok("never have i ever").treff.map((x) => x.n), ["sladrehanken"]);
  assert.deepEqual(U.nb.sok.sok("never have i ever", { over18: true }).treff.map((x) => x.n), ["sladrehanken", "torsten"]);
});

test("the 18+ door in a search: only for a drinking game's own words – never for an occasion, a fact, a room or a child's age", () => {
  const dor = (sprak, q, o) => S.bakDora(U[sprak].sok.sok(q), Object.assign({ over18: false, rom: "", yngst: "voksen" }, o));
  const alle18 = (sprak) => U[sprak].spill.filter((s) => s.alder18).length;
  // Occasions and kinds of game: the drinking games carry none of those words.
  const ANLEDNING = {
    nb: ["klassetur", "bursdag", "bursdagsfest", "fadderuke", "venner", "vennekveld", "julebord", "russ", "ungdom", "skole", "familiespill", "barnebursdag", "hytta", "selskapsleker", "festleker", "fest", "kollegaer", "halloween", "nyttår", "17. mai"],
    en: ["school trip", "birthday party", "freshers", "friends", "party games", "kids games", "family games", "school", "game night", "halloween"],
    da: ["lejrskole", "rustur", "fødselsdagsfest", "venner", "selskabslege", "børnefødselsdag", "klassefest", "skole", "familiespil"],
  };
  for (const [sprak, sporsmal] of Object.entries(ANLEDNING)) for (const q of sporsmal) assert.equal(dor(sprak, q), 0, `${sprak} «${q}»: døra sier + ${dor(sprak, q)} for voksne`);
  // … and so for every word of every kind of game but the drinking games, in every edition –
  // alone, and with a head count after it.
  for (const sprak of ["nb", "en", "da"]) {
    // (the words for a pre-party are words for drinking games too: «vors», «pre-drinks», «forfest»)
    const ord = Object.entries(U[sprak].taggsok).flatMap(([tagg, liste]) => (tagg === "drikke" ? [] : liste)).filter((q) => !U[sprak].taggsok.drikke.includes(q));
    assert.ok(ord.length >= 100, `${sprak}: bare ${ord.length} ord for typene`);
    const apner = ord.flatMap((q) => [q, `${q} ${{ nb: "for 4", en: "for 4", da: "til 4" }[sprak]}`]).filter((q) => dor(sprak, q) > 0);
    assert.deepEqual(apner, [], `${sprak}: disse ordene for en type spill henter fram aldersdøra`);
  }
  // Facts alone, and the little words.
  for (const q of ["for to", "2 spillere", "vi er 5", "kjapt", "på nett", "én mobil", "alene", "5 minutter", "spill", "spill for to", ""]) assert.equal(dor("nb", q), 0, `«${q}»: døra sier + ${dor("nb", q)}`);
  for (const q of ["for two", "2 players", "quick", "online", "games"]) assert.equal(dor("en", q), 0, `en «${q}»`);
  // A drinking game by its name – or, when no ordinary game answers the words, by the start of its
  // name, its genre or one of its own search words: that game.
  for (const [q, id] of [["tørsten", "torsten"], ["bussen", "bussen"], ["buss", "bussen"], ["hjul", "hjulet"], ["lykkehjul", "hjulet"], ["rød eller svart", "bussen"], ["høyere eller lavere", "spakona"], ["21", "telleren"], ["paranoia", "mistanken"], ["pyramiden", "pyramiden"], ["ring of fire", "ringen"]]) {
    const r = U.nb.sok.sok(q);
    assert.ok(r.voksne.some((s) => s.id === id) && r.voksne.length <= 3, `«${q}» → bak døra: ${r.voksne.map((s) => s.id).join(", ") || "ingen"}`);
    assert.equal(dor("nb", q), r.voksne.length);
  }
  // A word a drinking game shares with ordinary games – in its genre («Gjett kortet»), in a search
  // word («festlek kort», «bløff», «hviskeleken», «jeg har aldri») – finds the ordinary games, and
  // the door stays out of it.
  for (const [sprak, sporsmal] of [["nb", ["kort", "gjett", "bløff", "fest", "festlek", "hviskeleken", "jeg har aldri", "never have i ever", "spørsmål", "navn", "pyramide", "pyramidekabal"]], ["en", ["party", "party games", "guess", "cards", "truth or dare", "never have i ever", "whisper game", "names"]], ["da", ["fest", "gæt", "kort", "hviskelegen", "jeg har aldrig", "bluff"]]]) {
    for (const q of sporsmal) {
      assert.ok(U[sprak].finn(q).length > 0, `${sprak} «${q}» finner ingen vanlige spill`);
      assert.equal(dor(sprak, q), 0, `${sprak} «${q}»: døra sier + ${dor(sprak, q)} for voksne`);
    }
  }
  // The words for drinking games as such: all of them (as before the door ever knew about names).
  for (const [sprak, sporsmal] of [["nb", ["drikkeleker", "drikkespill", "drikkelek", "vors", "vorspiel", "nachspiel", "drikkeleker med kort", "drikk"]], ["en", ["drinking games", "drinking game", "pre-drinks"]], ["da", ["drukspil", "drukleg", "forfest"]]]) {
    for (const q of sporsmal) {
      assert.equal(dor(sprak, q), alle18(sprak), `${sprak} «${q}»: døra sier + ${dor(sprak, q)}`);
      assert.equal(U[sprak].sok.sok(q).drikke, true);
    }
  }
  assert.equal(U.nb.sok.sok("bursdag").drikke, false);
  // The whole name always finds the door, also beside ordinary games: «Party Bus» in English.
  assert.deepEqual(U.en.sok.sok("party bus").voksne.map((s) => s.id), ["bussen"]);
  // … but never in a room, with «Med barna» or with any age chosen for the youngest – and not
  // behind a door that is open.
  for (const q of ["drikkeleker", "tørsten", "hjul", "vors", "bursdag"]) {
    assert.equal(dor("nb", q, { yngst: F.HURTIG.barn().yngst }), 0, `«${q}» med «Med barna»`);
    for (const yngst of [3, 10, 17]) assert.equal(dor("nb", q, { yngst }), 0, `«${q}» med yngste ${yngst} år`);
    for (const rom of ["barn", "familie", "fest", "nett"]) assert.equal(dor("nb", q, { rom }), 0, `«${q}» i rommet ${rom}`);
    assert.equal(dor("nb", q, { over18: true }), 0);
  }
  assert.equal(S.bakDora(null, { over18: false, rom: "", yngst: "voksen" }), 0);
});

test("a typo is never put right towards a word only an 18+ game carries, while the door is closed", () => {
  // (each of these named a drinking game, or drinking games, to a visitor behind the door)
  for (const q of ["torsten", "spåkone", "drikkspill", "drikkelekr", "busen", "hjulett", "sjeffen", "mistankn"]) {
    const r = U.nb.sok.sok(q);
    assert.deepEqual([r.rettet, r.treff.length, r.voksne.length], ["", 0, 0], `«${q}»: rettet til «${r.rettet}», ${r.treff.length} rader, ${r.voksne.length} bak døra`);
  }
  // (a slip that is also near an ordinary word is put right to that one: «Pyramidekabal» is a solitaire)
  assert.equal(U.nb.sok.sok("pyramidn").rettet, "pyramide");
  assert.equal(U.nb.sok.sok("pyramidn").treff[0].n, "kortkongen#pyramide");
  for (const [sprak, q] of [["en", "drinkng games"], ["en", "drinking gmes"], ["da", "drukspill"], ["da", "drukleeg"]]) {
    const r = U[sprak].sok.sok(q);
    assert.deepEqual([r.rettet, r.voksne.length], ["", 0], `${sprak} «${q}»`);
  }
  // No word that only the 18+ games carry is ever in the line «Viser treff for …» for any one-letter
  // slip in their names, genres and search words.
  const kun18 = new Set();
  const andre = new Set([...vanlige("nb").flatMap((s) => [s.navn, s.undertittel, s.kort, ...s.sok, ...(s.varianter || []).flatMap((v) => [v.navn, v.undertittel || "", ...v.sok])]), ...Object.entries(U.nb.taggsok).flatMap(([tagg, ord]) => (tagg === "drikke" ? [] : ord))].flatMap((x) => S.ren(x).split(" ")));
  for (const s of U.nb.spill.filter((x) => x.alder18)) for (const x of [s.navn, s.undertittel, ...s.sok].flatMap((y) => S.ren(y).split(" "))) if (x.length >= 4 && !andre.has(x)) kun18.add(x);
  assert.ok(kun18.size >= 10, `bare ${kun18.size} ord som bare 18+-spillene har`);
  for (const ord of kun18) {
    for (let i = 1; i < ord.length; i++) {
      const r = U.nb.sok.sok(ord.slice(0, i) + ord.slice(i + 1));
      assert.ok(!r.rettet.split(" ").includes(ord), `«${ord.slice(0, i) + ord.slice(i + 1)}» viser «${r.rettet}»`);
    }
  }
  // With the door open, a slip in a drinking game's name is put right like any other.
  const apen = U.nb.sok.sok("spåkone", { over18: true });
  assert.deepEqual([apen.rettet, apen.treff[0].n], ["spåkona", "spakona"]);
  // The line is only said with a row to show for it.
  for (const q of ["yatsy", "sudoko", "torsten", "xyzzy", "kabel"]) {
    const r = U.nb.sok.sok(q);
    assert.ok(!r.rettet || r.treff.length > 0, `«${q}»: «Viser treff for «${r.rettet}»» uten en eneste rad`);
  }
});

test("the text is cleaned once, the same way for what is typed and what is looked in", () => {
  assert.equal(S.ren("  Vri-ÅTTER!  "), "vri åtter");
  assert.equal(S.ren("på nett"), "på nett", "an «å» typed as a + ring is the same letter");
  assert.equal(S.ren("Café – crème brûlée"), "cafe creme brulee");
  assert.equal(S.ren("a\u0001b\u0002c\u0003d"), "a b c d", "control characters are not letters");
  assert.equal(S.ren("17. mai, 50-årsdag & 4x4"), "17 mai 50 årsdag 4x4");
  for (const q of ["", "   ", "!!!", "🎲", ".*", "«»", "\u0001\u0002", "– – –", "???"]) {
    assert.equal(S.ren(q), "", JSON.stringify(q));
    // Nothing to look for is not a search: everything, as before a word was typed.
    const r = U.nb.sok.sok(q);
    assert.deepEqual([r.tom, r.treff.length, r.voksne.length, r.rettet, r.ikkeEnna], [true, vanlige("nb").length, 0, "", null], JSON.stringify(q));
  }
  assert.equal(U.nb.finn("på nett").length, U.nb.finn("på nett").length);
  assert.equal(S.flat("på nett gåter kjæreste spørsmål paa gaater"), "pa nett gater kjaereste sporsmal pa gater");
});

test("without a Nordic keyboard: a, o, ae and aa find what å, ø and æ find", () => {
  for (const [uten, med] of [["pa nett", "på nett"], ["paa nett", "på nett"], ["sjakk pa nett", "sjakk på nett"], ["gaater", "gåter"], ["gater", "gåter"], ["vri aatter", "vri åtter"], ["vri atter", "vri åtter"], ["sporsmal", "spørsmål"], ["kjaeresten", "kjæresten"], ["tre pa rad", "tre på rad"], ["bloff", "bløff"], ["kryssord pa nett", "kryssord på nett"], ["en natt", "én natt"]]) {
    assert.ok(U.nb.finn(med).length > 0, `«${med}» finner ingenting`);
    assert.deepEqual(U.nb.finn(uten), U.nb.finn(med), `«${uten}» gir ikke det samme som «${med}»`);
    assert.equal(U.nb.sok.sok(uten).rettet, "", `«${uten}» er ikke en skrivefeil å si fra om`);
  }
  for (const [uten, med] of [["gaet ordet", "gæt ordet"], ["pa nettet", "på nettet"], ["sorte per", "sorte per"], ["spoergsmal", "spørgsmål"]].slice(0, 3)) assert.deepEqual(U.da.finn(uten), U.da.finn(med), `da «${uten}»`);
  // A word that is one of ours as it stands is left alone, also while it is being typed.
  assert.ok(U.nb.finn("pa").some((n) => /^pa/.test(S.ren(spillAv("nb", n).navn))), "«pa» (på vei til «panna») ble lest som «på»");
  assert.equal(U.nb.forste("dam"), "dam");
});

test("a game inside a game is held against its own facts, in the rooms and the finder too", () => {
  const pusen = U.nb.av.get("pusen");
  const snap = S.somVariant(pusen, pusen.varianter.find((v) => v.id === "snap"));
  assert.deepEqual([F.iRom(pusen, "nett"), F.iRom(snap, "nett"), F.iRom(snap, "kort")], [true, false, true], "Snapp spilles ikke på nett");
  const samleren = U.nb.av.get("samleren");
  const gin = S.somVariant(samleren, samleren.varianter.find((v) => v.id === "gin"));
  const svar = (antall) => ({ antall, yngst: "voksen", lyst: "alt" });
  assert.deepEqual([F.passer(samleren, svar("3-4"), {}), F.passer(gin, svar("3-4"), {}), F.passer(gin, svar("2"), {})], [true, false, true], "Gin rummy er for to");
  const varulven = U.nb.av.get("varulven");
  const natt = S.somVariant(varulven, varulven.varianter.find((v) => v.id === "en"));
  assert.deepEqual([natt.spillere, natt.minutter, varulven.spillere], [[4, 10], [7, 10], [4, 12]]);
  // Never «ny oppgave hver dag»: the daily is the game's own (and the room «Dagens» the game's).
  const kk = U.nb.av.get("kortkongen");
  const freecell = S.somVariant(kk, kk.varianter[1]);
  assert.deepEqual([kk.tagger.includes("daglig"), freecell.tagger.includes("daglig"), F.iRom(kk, "dagens"), F.iRom(freecell, "dagens")], [true, false, true, false]);
  assert.equal(freecell.id, "kortkongen");
  assert.ok(kk.tagger.includes("daglig"), "the game itself is untouched");
});
