// Shared by the card-deck tests (vinglepetter, pekefingeren, sladrehanken, hovedpersonen): load a
// game's spill.js on the real kit in a small fake browser (node:vm, as in kit.test.mjs), draw cards
// through the game's own «start» with a seeded Math.random, and fingerprint what came out — so a
// new pack added last can be proved not to change the existing packs, saved games or remembered
// decks. Also the words no teen card may contain. Not a test file itself (no .test in the name).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import vm from "node:vm";

export const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SPRAK = ["nb", "en", "da"];
const MAPPE = { nb: "data", en: "data.en", da: "data.da" };

export const lesData = (id, fil, sprak) => JSON.parse(readFileSync(join(ROT, "rusj/spill", id, MAPPE[sprak], fil + ".json"), "utf8"));

// The game on the kit, with the data of one edition. The kit itself runs in Norwegian (R.t returns
// the key); only the cards matter here. Screen changes, statistics and the wake lock are no-ops.
export function lastSpill(id, fil, sprak) {
  const lager = new Map();
  const data = lesData(id, fil, sprak);
  const window = {
    RUSJ_SPILL: { id, navn: id },
    RUSJ_DATA: { [fil]: data },
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    scrollTo() {},
    location: { protocol: "http:", origin: "http://lokal", pathname: `/${id}/`, hash: "" },
  };
  window.self = window;
  window.top = window;
  const kontekst = {
    window,
    localStorage: {
      getItem: (k) => (lager.has(k) ? lager.get(k) : null),
      setItem: (k, v) => lager.set(k, String(v)),
      removeItem: (k) => lager.delete(k),
    },
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
  };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/rusj.js"), "utf8"), kontekst);
  const R = window.Rusj;
  let cfg = null;
  Object.assign(R, { start: (c) => (cfg = c), gaTil() {}, vis() {}, statistikk() {}, holdVaken() {}, slippVaken() {}, si() {} });
  vm.runInContext(readFileSync(join(ROT, "rusj/spill", id, "spill.js"), "utf8"), kontekst);
  if (!cfg) throw new Error(`${id}: spill.js kalte ikke Rusj.start`);
  // From here on every random number comes from a fixed seed (mulberry32, as R.rng).
  const seed = (fro) => vm.runInContext(`Math.random = Rusj.rng(${fro >>> 0});`, Object.assign(kontekst, { Rusj: R }));
  const S = cfg.tilstand();
  return { R, cfg, data, S, seed };
}

// Every card of a data file in the game's order (pack by pack, as the games build ALLE): the index is
// what saved games and remembered decks store.
export const alleKort = (data, felt) => data.pakker.flatMap((p) => p[felt].map((k) => ({ p: p.id, k: Array.isArray(k) ? k.join(" | ") : k })));

const kort = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);

// The fingerprint of an edition's existing packs:
// - kart: every existing card in index order (a saved game or a remembered deck finds the same card);
// - trekk: cards drawn through the game's own «start» with a fixed seed — from the default packs,
//   from each existing pack alone and from all of them together (the same cards in the same order).
// `gamle`: the pack ids that existed before (in data order); `felt`: "dilemmaer" | "utsagn" | "kort".
export function fingeravtrykk(spill, gamle, felt, { kortFra = (S) => S.spill.kort } = {}) {
  const { cfg, data, S, seed } = spill;
  const alle = alleKort(data, felt);
  const antall = data.pakker.filter((p) => gamle.includes(p.id)).reduce((n, p) => n + p[felt].length, 0);
  const trukket = [];
  const trekk = (navn, pakker, n) => {
    S.oppsett.pakker = pakker.slice();
    for (let i = 0; i < n; i++) {
      cfg.handlinger.start(null, null, S);
      const nr = kortFra(S);
      trukket.push([navn, nr, alle[nr] ? alle[nr].p : null, alle[nr] ? alle[nr].k : null]);
    }
  };
  seed(20261114);
  const standard = [...cfg.tilstand().oppsett.pakker]; // (an array of this realm, not the vm's)
  trekk("standard", standard, 40);
  for (const id of gamle) trekk(id, [id], 15);
  trekk("alle", gamle, 40);
  return { standard, antall, kart: kort(alle.slice(0, antall)), trekk: kort(trukket), trukket };
}

// Words no card in a teen pack may contain: sex, alcohol, drugs and tobacco (and brand names, which
// rusj never shows). Whole words, case-insensitive; a word ending in * also matches longer words.
export const FORBUDT = {
  nb: "sex* sexy naken nakne nakenbilde* nudes kline* kyss* kåt pupp* porno* kondom* alkohol* øl ølen vin vinen sprit* fylla fyllik* fyllesyk* full fulle bakfull* vors* nach* shot shots drikkelek* beruset brisen dop dopet hasj* narko* piller røyk* røyke* sigarett* snus* vape* e-sigarett*".split(" "),
  en: "sex* sexy naked nude* snog* kiss* horny porn* condom* boob* alcohol* beer* wine* vodka* drunk* hungover hangover* shot shots pub pubs booze* cider* lager* tipsy smoke* smoking cigarette* vape* vaping weed drug* stoned pills".split(" "),
  da: "sex* sexet nøgen nøgne nøgenbille* nudes kysse* kys kyssede liderlig porno* kondom* bryster* alkohol* øl øllen bajer* vin vinen sprut* fuld fulde tømmermænd druk* shot shots beruset ryge* rygning smøg* cigaret* snus* vape* hash* joint* narko* piller".split(" "),
  merker: "tiktok snapchat snap instagram insta youtube youtuber* minecraft fortnite fifa roblox netflix spotify playstation xbox iphone google* discord twitch nintendo pokémon pokemon lego".split(" "),
};
// The banned words found in a text (lists for the edition and the brand names).
export function forbudteOrd(sprak, tekst) {
  const ord = tekst.toLocaleLowerCase(sprak === "en" ? "en" : sprak).replace(/[’']/g, "'");
  const funn = [];
  for (const f of [...FORBUDT[sprak], ...FORBUDT.merker]) {
    const stamme = f.replace(/\*$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-zæøåéü])${stamme}${f.endsWith("*") ? "" : "(?![a-zæøåéü])"}`, "u");
    if (re.test(ord)) funn.push(f);
  }
  return funn;
}

// A card's key for finding near-duplicates: lower case, letters and digits only.
export const nokkel = (t) => t.toLocaleLowerCase("nb").replace(/[^a-zæøåäöüé0-9]+/g, " ").trim();

// The words the e2e runner treats as Norwegian left in another edition (test/rusj-e2e.mjs).
const NORSKE = {
  en: new Set("og ikke er på med som har kan vil det et av du dere deg din ditt dine jeg meg hva når nå igjen spill spillet spiller spillere mobilen runde runder trekk poeng vinner avslutt fortsett angre lukk tilbake ferdig neste velg trykk spill".split(" ")),
  da: new Set("spill trykk velg igjen noe fortsett avslutt lukk uavgjort brettet deg meg dere hva gjør ble brikka".split(" ")),
};
export const norskOrd = (sprak, tekst) =>
  (sprak === "en" && /[æøå]/i.test(tekst) ? ["æøå"] : []).concat((tekst.toLocaleLowerCase("nb").match(/[a-zæøå]+/g) || []).filter((o) => NORSKE[sprak].has(o)));

// ---------- The teen pack («Ungdom» / «Teens» / «Unge», id "ungdom", 13–16) ----------

const NAVN = { nb: "Ungdom", en: "Teens", da: "Unge" };
const tekster = (k) => (Array.isArray(k) ? k : [k]);

// The tests every game with a teen pack runs. o: { id, fil, felt, gamle (the pack ids before, in
// order), avtrykk ({ nb, en, da }: what fingeravtrykk gave before the teen pack came), maks (longest
// text), skjerm + vist (the screen that shows the card on the table, and the texts of a card it must
// contain), forbered (S → ready for that screen), kort (extra checks of one card: (k, sprak)) }.
export function ungdomTester(o) {
  const { id, fil, felt, gamle } = o;
  const DATA = Object.fromEntries(SPRAK.map((s) => [s, lesData(id, fil, s)]));
  const ungdom = (sprak) => DATA[sprak].pakker.find((p) => p.id === "ungdom");
  // The card on the table as the game draws it, and the screen that shows it.
  const viser = (spill, sprak) => {
    const { cfg, S } = spill;
    if (o.forbered) o.forbered(S);
    const html = cfg.skjermer[o.skjerm].vis(S);
    let i = S.spill.kort;
    const p = DATA[sprak].pakker.find((x) => (i < x[felt].length ? true : ((i -= x[felt].length), false)));
    return { html, kort: p[felt][i], p: p.id };
  };

  test(`${id}: de gamle pakkene trekker nøyaktig som før – lagrede spill, husket kortstokk og standardvalg er uendret`, () => {
    for (const sprak of SPRAK) {
      const spill = lastSpill(id, fil, sprak);
      assert.deepEqual(spill.data.pakker.map((p) => p.id), [...gamle, "ungdom"], `${sprak}: ungdomspakken skal stå sist, etter de gamle pakkene i samme rekkefølge`);
      const f = fingeravtrykk(spill, gamle, felt);
      assert.deepEqual({ standard: f.standard, antall: f.antall, kart: f.kart, trekk: f.trekk }, o.avtrykk[sprak], `${sprak}: fingeravtrykket av de gamle pakkene er endret`);
      assert.ok(!f.standard.includes("ungdom"), `${sprak}: ungdomspakken skal ikke være valgt fra start`);
      // The game itself shows the card the fingerprint's index points at.
      const { html, kort } = viser(spill, sprak);
      assert.ok(o.vist(kort).every((t) => html.includes(spill.R.esc(t))), `${sprak}: skjermen viser ikke kortet som indeksen peker på`);
    }
  });

  test(`${id}: ungdomspakken – samme oppbygning i nb, en og da, ca. 60 kort, ikke 18+`, () => {
    const nb = ungdom("nb");
    for (const sprak of SPRAK) {
      const p = ungdom(sprak);
      assert.ok(p, `${sprak}: mangler pakken «ungdom»`);
      assert.deepEqual(Object.keys(p), ["id", "navn", "ikon", "tekst", felt], `${sprak}: feltene skal være id, navn, ikon, tekst og ${felt} – ikke voksen eller sesong`);
      assert.equal(p.navn, NAVN[sprak], `${sprak}: pakkenavnet`);
      assert.equal(p.ikon, nb.ikon, `${sprak}: annet ikon enn på norsk`);
      assert.ok(/13–16/.test(p.tekst) && !/18/.test(p.tekst), `${sprak}: beskrivelsen skal si 13–16, ikke 18+ («${p.tekst}»)`);
      assert.ok(p[felt].length >= 55 && p[felt].length <= 70, `${sprak}: ${p[felt].length} kort`);
      assert.equal(p[felt].length, nb[felt].length, `${sprak}: ikke like mange kort som på norsk`);
      for (const k of p[felt]) assert.equal(tekster(k).length, tekster(nb[felt][0]).length, `${sprak}: annen form enn på norsk («${tekster(k).join(" | ")}»)`);
    }
  });

  test(`${id}: ungdomspakken – ingen like kort, ingen sex, alkohol, rus eller merkenavn, ingen norsk i en/da`, () => {
    for (const sprak of SPRAK) {
      // Every card the game already has, so the new pack repeats none of them either.
      const sett = new Map();
      for (const p of DATA[sprak].pakker) if (p.id !== "ungdom") for (const k of p[felt]) sett.set(nokkel(tekster(k).join(" ")), p.id);
      for (const k of ungdom(sprak)[felt]) {
        for (const t of tekster(k)) {
          assert.equal(typeof t, "string", `${sprak}: ikke tekst`);
          assert.ok(t === t.trim() && !/\s{2}/.test(t), `${sprak}: mellomrom i «${t}»`);
          assert.ok(t.length >= 2 && t.length <= o.maks, `${sprak}: lengde ${t.length} «${t}»`);
          assert.ok(!/[<>{}|]/.test(t), `${sprak}: tegn som ikke hører hjemme i «${t}»`);
          assert.deepEqual(forbudteOrd(sprak, t), [], `${sprak}: forbudt ord i «${t}»`);
          if (sprak !== "nb") assert.deepEqual(norskOrd(sprak, t), [], `${sprak}: norsk i «${t}»`);
          if (sprak === "nb") assert.ok(!/\bfrem\b|\bstod\b|\bfingre\b/.test(t), `nb: KIT-skrivemåter (fram, sto, fingrer) i «${t}»`);
        }
        const n = nokkel(tekster(k).join(" "));
        assert.ok(!sett.has(n), `${sprak}: «${tekster(k).join(" | ")}» finnes fra før (${sett.get(n)})`);
        sett.set(n, "ungdom");
        if (o.kort) o.kort(k, sprak);
      }
    }
  });

  test(`${id}: med bare ungdomspakken valgt kommer hvert kort derfra – og skjermen viser det`, () => {
    for (const sprak of SPRAK) {
      const spill = lastSpill(id, fil, sprak);
      spill.seed(7);
      const p = ungdom(sprak);
      const sett = new Set();
      for (let i = 0; i < p[felt].length; i++) {
        spill.S.oppsett.pakker = ["ungdom"];
        spill.cfg.handlinger.start(null, null, spill.S);
        const { html, kort, p: pid } = viser(spill, sprak);
        assert.equal(pid, "ungdom", `${sprak}: et kort fra ${pid}`);
        assert.ok(o.vist(kort).every((t) => html.includes(spill.R.esc(t))), `${sprak}: skjermen viser ikke «${tekster(kort).join(" | ")}»`);
        assert.ok(html.includes(spill.R.esc(`${p.ikon} ${p.navn}`)), `${sprak}: kortet viser ikke pakkenavnet`);
        sett.add(spill.S.spill.kort);
      }
      assert.equal(sett.size, p[felt].length, `${sprak}: kortstokken skal gå gjennom hele pakken før noe kommer igjen`);
    }
  });
}
