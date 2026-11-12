// The editions /en/ and /da/ (rusj/SPRAK.md): R.t in the kit and t() for the front page and the
// build give the same answers; the checker stops missing and unused keys and finds Norwegian left
// in a game; the build writes each edition with lang, hreflang, sitemap and its own data.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { lagT, lagSprak, SPRAK, SPRAK_INFO, nokler, uoversatt, sjekkTabell, sjekkSpill, sjekkSprak, merkerIUtgave } from "../scripts/sprak.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The kit in a small fake browser, as an edition: window.RUSJ_SPRAK and the tables are set first.
function lastKit(sprak, tekst, spillTekst) {
  const lager = new Map();
  const window = {
    RUSJ_SPRAK: sprak,
    RUSJ_TEKST: tekst,
    RUSJ_TEKST_SPILL: spillTekst,
    RUSJ_SPILL: { id: "testspill", navn: "Testspill" },
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    location: { protocol: "http:", origin: "http://lokal", pathname: "/testspill/", hash: "" },
  };
  window.self = window;
  window.top = window;
  const kontekst = {
    window,
    localStorage: { getItem: (k) => (lager.has(k) ? lager.get(k) : null), setItem: (k, v) => lager.set(k, String(v)), removeItem: (k) => lager.delete(k) },
    navigator: {},
    document: { addEventListener() {}, documentElement: {} },
    crypto: globalThis.crypto,
    location: window.location,
    history: { pushState() {}, replaceState() {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
    Intl,
  };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/rusj.js"), "utf8"), kontekst);
  return { R: window.Rusj, lager };
}

const TABELL = {
  "Gjør klart": "Get ready",
  "{navn} vant!": "{navn} won!",
  "{n} poeng": { one: "{n} point", other: "{n} points" },
  "{n} runde|{n} runder": { one: "{n} round", other: "{n} rounds" },
  "sekund|sekunder": { one: "second", other: "seconds" },
};

test("R.t: the key in Norwegian, the table elsewhere; values go in as text; plurals by the edition's rules", () => {
  const { R: nb } = lastKit(undefined, TABELL);
  assert.equal(nb.sprak, "nb");
  assert.equal(nb.t("Gjør klart"), "Gjør klart", "norsk skal aldri slå opp i tabellen");
  assert.equal(nb.t("{navn} vant!", { navn: "<b>A</b>" }), "<b>A</b> vant!", "verdiene settes inn som tekst (escaping er kallerens jobb)");
  assert.equal(nb.t("{n} runde|{n} runder", { n: 1 }), "1 runde");
  assert.equal(nb.t("{n} runde|{n} runder", { n: 3 }), "3 runder");
  assert.equal(nb.flertall(1, "sekund", "sekunder"), "1 sekund");
  assert.equal(nb.ramsOpp(["A", "B", "C"]), "A, B og C");

  const { R: en } = lastKit("en", TABELL);
  assert.equal(en.sprak, "en");
  assert.equal(en.lokale, "en-GB");
  assert.equal(en.forside, "/en/");
  assert.equal(en.t("Gjør klart"), "Get ready");
  assert.equal(en.t("{navn} vant!", { navn: "Testspiller A" }), "Testspiller A won!");
  assert.equal(en.t("{n} poeng", { n: 1 }), "1 point");
  assert.equal(en.t("{n} poeng", { n: 2 }), "2 points");
  assert.equal(en.t("{n} runde|{n} runder", { n: 1 }), "1 round");
  assert.equal(en.flertall(2, "sekund", "sekunder"), "2 seconds");
  assert.equal(en.t("Mangler {x}", { x: 1 }), "Mangler 1", "en nøkkel tabellen ikke har, gir den norske teksten");
  assert.equal(en.t("Står {ukjent}"), "Står {ukjent}", "uten verdier står plassholderen urørt");
  assert.equal(en.ramsOpp(["A", "B", "C"]), "A, B and C");
  assert.equal(en.tall(12345), "12,345");

  const { R: da } = lastKit("da", { "Gjør klart": "Gør klar" }, { "Gjør klart": "Gør klar!" });
  assert.equal(da.t("Gjør klart"), "Gør klar!", "spillets egen tabell går foran den felles");
  assert.equal(da.ramsOpp(["A", "B"]), "A og B");
  assert.equal(da.tall(12345), "12.345");
  assert.equal(da.lagNavn(0), "Lag Rosa", "uten oversettelse: norsk");
});

test("the kit, the front page (rusj/kit/tekst.js) and the build give the same answers", () => {
  const saker = [
    ["Gjør klart"],
    ["{navn} vant!", { navn: "A" }],
    ["{n} poeng", { n: 1 }],
    ["{n} poeng", { n: 5 }],
    ["{n} runde|{n} runder", { n: 1 }],
    ["{n} runde|{n} runder", { n: 0 }],
    ["Ukjent {x}", { x: "y" }],
  ];
  for (const sprak of ["nb", ...SPRAK]) {
    const { R } = lastKit(sprak === "nb" ? undefined : sprak, TABELL);
    const t = lagT(sprak, TABELL);
    const S = lagSprak(sprak, TABELL);
    for (const [k, v] of saker) assert.equal(R.t(k, v), t(k, v), `${sprak}: ${k}`);
    assert.equal(R.flertall(7, "sekund", "sekunder"), S.flertall(7, "sekund", "sekunder"));
    assert.equal(R.ramsOpp(["A", "B", "C"]), S.ramsOpp(["A", "B", "C"]));
    // The kit's own copy of the facts of each edition agrees with rusj/kit/tekst.js.
    assert.equal(R.lokale, SPRAK_INFO[sprak].lokale);
    assert.equal(R.tidssone, SPRAK_INFO[sprak].tidssone);
    assert.equal(R.forside, SPRAK_INFO[sprak].forside);
    assert.equal(R.merkeside, S.side("merker"));
  }
});

test("each edition keeps its own games, decks and codes; names and sound are shared; its own day", () => {
  const { R: en, lager } = lastKit("en", {});
  en.skriv("daglig", { x: 1 });
  en.lagreFelles();
  assert.ok(lager.has("rusj.en.daglig") && !lager.has("rusj.daglig"), "spilldata skal ligge under rusj.en.");
  assert.ok(lager.has("rusj.felles") && !lager.has("rusj.en.felles"), "navn og lyd deles av alle utgaver");
  const { R: nb } = lastKit(undefined, {});
  const bredder = [20, 4];
  const kode = nb.kode.lag([12345, 3], bredder, 77);
  assert.deepEqual(nb.kode.les(kode, bredder, 77), [12345, 3]);
  assert.equal(en.kode.les(kode, bredder, 77), null, "en norsk kode skal ikke kunne leses i den engelske utgaven");
  assert.deepEqual(en.kode.les(en.kode.lag([12345, 3], bredder, 77), bredder, 77), [12345, 3]);
  // 23:30 UTC on 12 November: already the 13th in Oslo and Copenhagen, still the 12th in London.
  const sent = new Date("2026-11-12T23:30:00Z");
  assert.equal(nb.dag(sent).tekst, "2026-11-13");
  assert.equal(en.dag(sent).tekst, "2026-11-12");
  assert.equal(lastKit("da", {}).R.dag(sent).tekst, "2026-11-13");
});

test("the checker reads the keys: R.t, t(), N_(), R.flertall; template keys and dynamic keys are errors", () => {
  const kilde = [
    'const a = R.t("Gjør klart");',
    "const b = R.t('Start');",
    "const c = R.t(`Avslutt`);",
    'const d = R.flertall(n, "runde", "runder");',
    'const e = t("Alle spill");',
    'const f = R.t(`Hei ${navn}`);',
    "const g = R.t(variabel);",
    '// R.t("i en kommentar")',
    'const h = U.th("{n} spill", { n: "<b>1</b>" });',
  ].join("\n");
  const n = nokler(kilde);
  assert.deepEqual([...n.funnet.keys()].sort(), ["Alle spill", "Avslutt", "Gjør klart", "Start", "runde|runder", "{n} spill"].sort());
  assert.equal(n.feil.length, 1, "en nøkkel med ${} skal være en feil");
  assert.deepEqual(n.dynamisk, [7]);
});

test("the checker flags Norwegian text that is not wrapped, and leaves code and «sprak-ok» alone", () => {
  const kilde = [
    'const a = R.t("Gjør klart");',
    'const b = "Trykk på kolonnen for å slippe";',
    "const c = `<button aria-label=\"Lukk\">×</button>`;",
    'const d = "fi-kol";',
    'R.gaTil("spill");',
    'const e = "Ferdig"; // sprak-ok: a key in our own data',
    'console.log("dette er bare for utviklere");',
    'throw new Error("Ukjent figur: " + id);',
    'const f = `<p>${esc(R.t("Alle spill"))} – og flere kommer</p>`;',
  ].join("\n");
  const funn = uoversatt(kilde).map((u) => u.linje);
  assert.deepEqual(funn, [2, 3, 9]);
});

test("the checker: a missing key, an unused key, a wrong placeholder or plural form is an error", () => {
  const krevd = new Map([
    ["Gjør klart", "spill.js:1"],
    ["{navn} vant!", "spill.js:2"],
    ["{n} poeng", "spill.js:3"],
  ]);
  const ok = { "Gjør klart": "Get ready", "{navn} vant!": "{navn} won!", "{n} poeng": { one: "{n} point", other: "{n} points" } };
  assert.deepEqual(sjekkTabell({ navn: "t", tabell: ok, krevd }), []);
  const feil = (tabell) => sjekkTabell({ navn: "t", tabell, krevd }).join("\n");
  assert.match(feil({ ...ok, "Gjør klart": undefined }), /mangler «Gjør klart»|skal være en tekst/);
  const utenGjor = { ...ok };
  delete utenGjor["Gjør klart"];
  assert.match(feil(utenGjor), /mangler «Gjør klart»/);
  assert.match(feil({ ...ok, "Gammel nøkkel": "Old key" }), /«Gammel nøkkel» brukes ikke lenger/);
  assert.match(feil({ ...ok, "{navn} vant!": "{name} won!" }), /\{name\}, som nøkkelen ikke har/);
  assert.match(feil({ ...ok, "{n} poeng": { one: "{n} point", lots: "x" } }), /ukjent flertallsform «lots»|skal være en tekst/);
  assert.match(sjekkTabell({ navn: "t", tabell: null, krevd }).join(""), /finnes ikke/);
});

test("the checker on a game: published only when spill.json, tables and data are complete", () => {
  const rot = mkdtempSync(join(tmpdir(), "rusj-sprak-"));
  try {
    const mappe = join(rot, "rusj/spill/testspill");
    mkdirSync(mappe, { recursive: true });
    mkdirSync(join(rot, "rusj/kit"), { recursive: true });
    writeFileSync(join(rot, "rusj/kit/tekst.en.json"), JSON.stringify({ Avslutt: "Quit" }));
    const i18n = { en: { navn: "Test", undertittel: "A test", kort: "Short.", beskrivelse: "Long.", slug: "test", sok: [] } };
    writeFileSync(join(mappe, "spill.json"), JSON.stringify({ id: "testspill", tagger: ["fest"], i18n }));
    writeFileSync(join(mappe, "spill.js"), 'R.t("Gjør klart"); R.t("Avslutt");');
    let r = sjekkSpill(rot, "testspill", "en");
    assert.ok(!r.publiseres && /tekst\.en\.json finnes ikke/.test(r.feil.join()), "uten tabell: ikke publisert");
    writeFileSync(join(mappe, "tekst.en.json"), JSON.stringify({ "Gjør klart": "Get ready" }));
    r = sjekkSpill(rot, "testspill", "en");
    assert.ok(r.publiseres, `komplett («Avslutt» fra den felles tabellen): ${r.feil.join("; ")}`);
    writeFileSync(join(mappe, "spill.js"), 'R.t("Gjør klart"); R.t("Avslutt"); const x = "Trykk på kortet for å se";');
    r = sjekkSpill(rot, "testspill", "en");
    assert.ok(!r.publiseres && /ikke oversatt: «Trykk på kortet for å se»/.test(r.feil.join()), "norsk tekst som ikke er pakket inn stopper spillet");
    writeFileSync(join(mappe, "spill.js"), 'R.t("Gjør klart");');
    r = sjekkSpill(rot, "testspill", "en");
    assert.ok(r.publiseres, "«Avslutt» i den felles tabellen er ikke ubrukt i spillets tabell");
    writeFileSync(join(mappe, "tekst.en.json"), JSON.stringify({ "Gjør klart": "Get ready", Borte: "Gone" }));
    r = sjekkSpill(rot, "testspill", "en");
    assert.ok(!r.publiseres && /«Borte» brukes ikke lenger/.test(r.feil.join()));
    writeFileSync(join(mappe, "tekst.en.json"), JSON.stringify({ "Gjør klart": "Get ready" }));
    mkdirSync(join(mappe, "data"));
    writeFileSync(join(mappe, "data/kort.json"), "[]");
    r = sjekkSpill(rot, "testspill", "en");
    assert.ok(!r.publiseres && r.feil.length === 0 && /data\.en\/ mangler kort\.json/.test(r.varsler.join()), "uten oversatt innhold: ikke publisert, men ingen feil");
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});

test("the checker on a word-bank game: published only where the edition has its own bank", () => {
  const rot = mkdtempSync(join(tmpdir(), "rusj-sprak-"));
  try {
    const mappe = join(rot, "rusj/spill/ordspill");
    mkdirSync(mappe, { recursive: true });
    mkdirSync(join(rot, "rusj/kit"), { recursive: true });
    writeFileSync(join(rot, "rusj/kit/tekst.en.json"), "{}");
    const i18n = { en: { navn: "Words", undertittel: "A test", kort: "Short.", beskrivelse: "Long.", slug: "words", sok: [] } };
    writeFileSync(join(mappe, "spill.json"), JSON.stringify({ id: "ordspill", ordbank: true, tagger: ["ord"], i18n }));
    writeFileSync(join(mappe, "spill.js"), 'R.t("Gjør klart");');
    writeFileSync(join(mappe, "tekst.en.json"), JSON.stringify({ "Gjør klart": "Get ready" }));
    let r = sjekkSpill(rot, "ordspill", "en");
    assert.ok(!r.publiseres && r.feil.length === 0 && /data\/kategorier\.en\/ finnes ikke/.test(r.varsler.join()), "uten engelsk ordbank: ikke publisert, men ingen feil");
    mkdirSync(join(rot, "data/kategorier.en"), { recursive: true });
    r = sjekkSpill(rot, "ordspill", "en");
    assert.ok(r.publiseres, r.feil.join("; "));
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});

test("the real tables: complete for every published game, and the pilot is published in en and da", () => {
  const r = sjekkSprak({ rot: ROT });
  assert.deepEqual(r.feil, []);
  for (const s of SPRAK) assert.ok(r.publisert[s].includes("fireren"), `Fireren er ikke publisert på ${s}`);
});

test("an edition only has the stickers its games can give", () => {
  const katalog = JSON.parse(readFileSync(join(ROT, "rusj/merker.json"), "utf8"));
  const k = merkerIUtgave(katalog, [{ id: "fireren", tagger: ["klassiker", "alene"], spillere: [1, 2] }]);
  const ider = k.merker.map((m) => m.id);
  assert.ok(ider.includes("klassiker-fireren") && ider.includes("provd-alene"));
  assert.ok(!ider.some((id) => /^(seier-|dagens-|klassiker-sjakkhesten|luke-|provd-5)/.test(id) || id === "kveld-stor"), ider.join(", "));
  assert.ok(k.grupper.every((g) => k.merker.some((m) => m.gruppe === g.id)));
});

// ---------- The build ----------

let WEB = null;
let midlertidig = null;
// A game that is still only in Norwegian (no "i18n" in its spill.json): the first one alphabetically,
// so the example moves on by itself when that game is converted.
const BARE_NORSK = readdirSync(join(ROT, "rusj/spill"))
  .sort()
  .find((id) => existsSync(join(ROT, "rusj/spill", id, "spill.json")) && !JSON.parse(readFileSync(join(ROT, "rusj/spill", id, "spill.json"), "utf8")).i18n);
// Once every game is translated there is none: the Norwegian-only checks are then skipped.
const BYGG_SPILL = BARE_NORSK ? `fireren,${BARE_NORSK}` : "fireren";
before(() => {
  midlertidig = mkdtempSync(join(tmpdir(), "rusj-sprak-bygg-"));
  WEB = join(midlertidig, "web");
  execFileSync(process.execPath, [join(ROT, "scripts/bygg.mjs"), "--ut", WEB, "--spill", BYGG_SPILL], { cwd: ROT, stdio: "pipe" });
});
after(() => {
  if (midlertidig) rmSync(midlertidig, { recursive: true, force: true });
});
const les = (sti) => readFileSync(join(WEB, sti), "utf8");
const alternativer = (html) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="https:\/\/rusj\.no([^"]+)">/g)].map((m) => `${m[1]} ${m[2]}`);

test("game pages: <html lang>, og:locale, canonical and hreflang between true equivalents", () => {
  const nb = les("fireren/index.html");
  const en = les("en/fourby/index.html");
  const da = les("da/fireren/index.html");
  const alle = ["nb /fireren/", "en /en/fourby/", "da /da/fireren/", "x-default /fireren/"];
  for (const html of [nb, en, da]) assert.deepEqual(alternativer(html), alle);
  assert.match(en, /<html lang="en"/);
  assert.match(da, /<html lang="da"/);
  assert.match(nb, /<html lang="nb"/);
  assert.match(en, /<meta property="og:locale" content="en_GB">/);
  assert.match(en, /<meta property="og:locale:alternate" content="nb_NO">/);
  assert.match(en, /<link rel="canonical" href="https:\/\/rusj\.no\/en\/fourby\/">/);
  // A game only in Norwegian: no hreflang at all.
  if (BARE_NORSK) assert.deepEqual(alternativer(les(`${BARE_NORSK}/index.html`)), []);
  // Structured data in the language, and the page in the edition's words.
  const ld = JSON.parse(en.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld["@graph"][0].inLanguage, "en");
  assert.equal(ld["@graph"][0].url, "https://rusj.no/en/fourby/");
  assert.match(en, /<h1>Fourby<\/h1>/);
  assert.match(en, /<h2 id="om-spillet-tittel">How to play Fourby<\/h2>/);
  assert.doesNotMatch(en.slice(en.indexOf('<section class="om-spillet"')), /\b(og|ikke|spill|brikka|Slik)\b/);
});

test("game pages load the edition's table before the kit, share the code, and carry their own data", () => {
  const en = les("en/fourby/index.html");
  const skript = [...en.matchAll(/<script defer src="([^"?]+)/g)].map((m) => m[1]).filter((s) => !s.endsWith("stat.js"));
  assert.deepEqual(skript, ["/felles/tekst.en.js", "/felles/gjengen.js", "/felles/merker.en.js", "/felles/rusj.js", "/en/fourby/data.js", "/fireren/spill.js"]);
  const data = les("en/fourby/data.js");
  assert.match(data, /window\.RUSJ_TEKST_SPILL=\{/);
  assert.match(data, /"slug":"fourby"/);
  assert.match(les("felles/tekst.en.js"), /^window\.RUSJ_SPRAK="en";/);
  assert.doesNotMatch(les("fireren/data.js"), /RUSJ_TEKST/, "den norske siden trenger ingen tabell");
  assert.match(les("en/fourby/index.html"), /href="\/en\/"/);
});

test("front pages: one per edition with only its games, in the sitemap with hreflang", () => {
  const en = les("en/index.html");
  const kort = [...en.matchAll(/<li class="spillkort" data-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(kort, ["fireren"]);
  assert.match(en, /<a href="\/en\/fourby\/"/);
  assert.deepEqual(alternativer(en), ["nb /", "en /en/", "da /da/", "x-default /"]);
  assert.match(en, /<nav class="sprakvalg" aria-label="Language"><a href="\/" lang="nb" hreflang="nb">Norsk<\/a><b lang="en" aria-current="page">English<\/b><a href="\/da\/" lang="da" hreflang="da">Dansk<\/a><\/nav>/);
  const liste = les("felles/spilliste.en.js");
  assert.match(liste, /"url":"\/en\/fourby\/"/);
  if (BARE_NORSK) assert.ok(!liste.includes(`"${BARE_NORSK}"`), `${BARE_NORSK} er bare på norsk og skal ikke stå i den engelske spillista`);
  const xml = les("sitemap.xml");
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  for (const sti of ["/en/", "/da/", "/en/fourby/", "/da/fireren/", "/en/privacy/", "/en/about/", "/en/stickers/", "/da/privatliv/", "/da/om/", "/da/klistermaerker/"]) {
    assert.ok(xml.includes(`<loc>https://rusj.no${sti}</loc>`), `${sti} mangler i sitemap.xml`);
  }
  const fireren = xml.match(/<url><loc>https:\/\/rusj\.no\/fireren\/<\/loc>.*?<\/url>/)[0];
  for (const l of ['hreflang="en" href="https://rusj.no/en/fourby/"', 'hreflang="da" href="https://rusj.no/da/fireren/"', 'hreflang="x-default" href="https://rusj.no/fireren/"']) assert.ok(fireren.includes(l), l);
  if (BARE_NORSK) assert.ok(!new RegExp(`<url><loc>https://rusj\\.no/${BARE_NORSK}/</loc>[^\\n]*xhtml`).test(xml), "et spill bare på norsk skal ikke ha hreflang");
});

test("the pages about rusj and the manifest exist in every edition, in its words", () => {
  for (const [sti, ord] of [
    ["en/privacy/index.html", /<h1>Privacy<\/h1>[\s\S]*GitHub Pages[\s\S]*outside the EU\/EEA[\s\S]*rusj@odkdigital\.no/],
    ["en/about/index.html", /<h1>About rusj<\/h1>/],
    ["en/stickers/index.html", /<h1>The sticker book<\/h1>/],
    ["da/privatliv/index.html", /<h1>Privatliv<\/h1>[\s\S]*uden for EU\/EØS[\s\S]*rusj@odkdigital\.no/],
    ["da/om/index.html", /<h1>Om rusj<\/h1>/],
    ["da/klistermaerker/index.html", /<h1>Klistermærkebogen<\/h1>/],
  ]) {
    assert.ok(existsSync(join(WEB, sti)), `${sti} mangler`);
    assert.match(les(sti), ord, sti);
  }
  for (const s of SPRAK) {
    const m = JSON.parse(les(`${s}/manifest.webmanifest`));
    assert.equal(m.lang, s);
    assert.equal(m.start_url, `/${s}/`);
    assert.equal(m.id, `/${s}/`);
  }
  assert.ok(!readdirSync(join(WEB, "en")).includes("luringen"), "Luringen er ikke oversatt");
  const sw = les("sw.js");
  assert.match(sw, /const FRAKOBLET = \{"\/":/);
});
