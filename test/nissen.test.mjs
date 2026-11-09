// Unit tests for Nissen (Secret Santa): the draw is a derangement (one ring through everybody),
// it honours «ikke trekk hverandre» pairs and is the same for the same seed; a personal link holds
// only that person's name and receiver (never the draw), rejects broken or changed links, and the
// link format is pinned so links sent today still open in some weeks. Loads the kit and
// rusj/spill/nissen/spill.js in a small fake browser (node:vm) and takes the pure functions from
// the game's definition.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IDEER = JSON.parse(readFileSync(join(ROT, "rusj/spill/nissen/data/ideer.json"), "utf8"));

function lastSpill() {
  const lager = new Map();
  const location = { protocol: "http:", origin: "http://lokal", pathname: "/nissen/", hash: "" };
  const window = {
    RUSJ_SPILL: { id: "nissen", navn: "Nissen" },
    RUSJ_DATA: { ideer: IDEER },
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    location,
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
    location,
    history: { pushState() {}, replaceState() {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
    TextEncoder,
  };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/rusj.js"), "utf8"), kontekst);
  vm.runInContext(readFileSync(join(ROT, "src/qr.js"), "utf8"), kontekst);
  window.LuringenQr = kontekst.LuringenQr;
  let def = null;
  window.Rusj.start = (d) => (def = d);
  vm.runInContext(readFileSync(join(ROT, "rusj/spill/nissen/spill.js"), "utf8"), kontekst);
  assert.ok(def && def.kjerne, "spill.js skal kalle Rusj.start med kjerne-funksjonene");
  return { R: window.Rusj, K: def.kjerne, def };
}

const { R, K } = lastSpill();
// Values from the fake browser live in another realm: compare them as plain JSON.
const js = (x) => JSON.parse(JSON.stringify(x));

// Follows the ring from person 0 and returns how many people it passes before it closes.
function ringlengde(mottaker) {
  let i = 0;
  let steg = 0;
  do {
    i = mottaker[i];
    steg += 1;
  } while (i !== 0 && steg <= mottaker.length);
  return steg;
}

test("trekningen er en permutasjon der ingen trekker seg selv – og én ring gjennom alle", () => {
  for (let n = K.MIN; n <= K.MAKS; n++) {
    for (let k = 0; k < 120; k++) {
      const fro = R.heltall(0, 2 ** 22 - 1);
      const m = K.trekk(n, fro);
      assert.equal(m.length, n);
      assert.deepEqual(
        js(m).sort((a, b) => a - b),
        Array.from({ length: n }, (_, i) => i),
        `n=${n}: alle får nøyaktig én nisse`,
      );
      m.forEach((til, fra) => assert.notEqual(til, fra, `n=${n}, frø ${fro}: person ${fra} trakk seg selv`));
      assert.equal(ringlengde(m), n, `n=${n}, frø ${fro}: trekningen er ikke én ring`);
    }
  }
});

test("alle mulige ringer kan komme ut (n = 4 gir 6 ringer, omtrent like ofte)", () => {
  const telling = new Map();
  for (let fro = 0; fro < 6000; fro++) {
    const nokkel = K.trekk(4, fro).join("");
    telling.set(nokkel, (telling.get(nokkel) || 0) + 1);
  }
  assert.equal(telling.size, 6);
  for (const [ring, antall] of telling) assert.ok(antall > 800 && antall < 1200, `ringen ${ring} kom ${antall} ganger av 6000`);
});

test("par som ikke skal trekke hverandre, blir respektert", () => {
  for (let k = 0; k < 400; k++) {
    const n = R.heltall(4, K.MAKS);
    const par = [];
    const antall = R.heltall(1, Math.min(6, Math.floor(n / 2)));
    const folk = R.stokk(Array.from({ length: n }, (_, i) => i));
    for (let p = 0; p < antall; p++) par.push([folk[2 * p], folk[2 * p + 1]]);
    const fro = K.finnFro(n, par, R.heltall(0, 2 ** 22 - 1));
    assert.ok(fro >= 0, `fant ingen trekning for n=${n} med ${antall} par`);
    const m = K.trekk(n, fro);
    for (const [a, b] of par) {
      assert.notEqual(m[a], b, `${a} trakk ${b} selv om de er et par`);
      assert.notEqual(m[b], a, `${b} trakk ${a} selv om de er et par`);
    }
    assert.ok(K.holder(m, par));
    assert.ok(K.erRing(m, n));
    // Deterministic: the same seed always gives the same ring
    assert.deepEqual(js(K.trekk(n, fro)), js(m));
  }
});

test("familier som ikke skal trekke hverandre (tunge unntak) går også", () => {
  // Two families of four: everybody must give to someone in the other family.
  const par = [];
  const familier = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
  ];
  for (const f of familier) for (let a = 0; a < f.length; a++) for (let b = a + 1; b < f.length; b++) par.push([f[a], f[b]]);
  assert.equal(K.muligRing(8, par), true);
  const fro = K.finnFro(8, par, 99);
  assert.ok(fro >= 0);
  const m = K.trekk(8, fro);
  m.forEach((til, fra) => assert.notEqual(fra < 4, til < 4, `${fra} ga til ${til} i samme familie`));
});

test("umulige unntak blir oppdaget", () => {
  assert.equal(K.muligRing(3, [[0, 1]]), false, "tre personer der to ikke kan trekke hverandre");
  assert.equal(K.finnFro(3, [[0, 1]], 0, 5000), -1);
  assert.equal(K.muligRing(4, [[0, 1], [0, 2], [0, 3]]), false, "en som ikke kan trekke noen");
  assert.equal(K.muligRing(5, [[0, 1], [0, 2], [0, 3]]), false, "en som bare kan gi til én");
  assert.equal(K.muligRing(4, [[0, 1], [2, 3]]), true, "to par blant fire går fint");
  assert.equal(K.muligRing(30, []), true);
});

test("navn tåler turen gjennom lenken", () => {
  const navn = ["Bjørn", "Åse-Marie", "Ærlige Ola", "Zoë", "Kari Nordmann", "O'Neil", "A/B", "Lille_Mi", "~tilde~", "Nisse 🎅", "Ola B.", "Øyvind"];
  for (const x of navn) assert.equal(K.pakkUt(K.pakkNavn(x)), x, `«${x}» kom ikke likt tilbake`);
  for (const x of navn) assert.match(K.pakkNavn(x), /^[A-Za-z0-9._~-]*$/, `«${x}» ga tegn som ikke er trygge i en lenke`);
  assert.equal(K.pakkUt("Bj~zzrn"), null, "ødelagt escape blir avvist");
});

test("den personlige lenken har bare egen mottaker – aldri trekningen eller andres navn", () => {
  const navn = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E"];
  const m = js(K.trekk(5, 4242));
  for (let i = 0; i < 5; i++) {
    const lenke = K.lagPersonlig({ id: "ABCDE", kr: 200, dato: 12 * 32 + 19, navn: navn[i], mottaker: navn[m[i]] });
    const andre = navn.filter((x, j) => j !== i && j !== m[i]);
    for (const x of andre) assert.ok(!lenke.includes(K.pakkNavn(x)), `lenken til ${navn[i]} inneholder ${x}`);
    assert.ok(!lenke.includes("4242"), "lenken inneholder frøet");
    const lest = js(K.lesPersonlig(lenke));
    assert.deepEqual(lest, { id: "ABCDE", kr: 200, dato: 12 * 32 + 19, navn: navn[i], mottaker: navn[m[i]] });
  }
});

test("en ødelagt eller endret lenke blir avvist", () => {
  const lenke = K.lagPersonlig({ id: "Q2RS4", kr: 0, dato: 0, navn: "Bjørn", mottaker: "Åse-Marie" });
  assert.ok(K.lesPersonlig(lenke));
  // Cut off at every length (a chat app that stops the link at a strange character)
  for (let n = 0; n < lenke.length; n++) assert.equal(K.lesPersonlig(lenke.slice(0, n)), null, `avkuttet lenke (${n} tegn) ble godtatt`);
  // Another receiver typed in by hand
  const juks = lenke.replace("~c5se-Marie", "Testspiller_B");
  assert.notEqual(juks, lenke);
  assert.equal(K.lesPersonlig(juks), null, "endret mottaker ble godtatt");
  // Every single changed character is caught
  const TEGN = "0123456789ABCDEFGHJKMNPQRSTVWXYZabcxyz_~-";
  let godtatt = 0;
  for (let p = 0; p < lenke.length; p++) for (const c of TEGN) if (c !== lenke[p] && K.lesPersonlig(lenke.slice(0, p) + c + lenke.slice(p + 1))) godtatt += 1;
  assert.ok(godtatt <= 2, `${godtatt} lenker med ett endret tegn ble godtatt`);
  assert.equal(K.lesPersonlig("1/ABCD/ABCDE/0/0/Anna/Anna"), null, "kan ikke gi gave til seg selv");
  assert.equal(K.lesPersonlig("TULL"), null);
  assert.equal(K.lesPersonlig(""), null);
});

// These values are pinned on purpose: links sent today must still open in some weeks, also after
// rusj or this game is updated. If this test fails, a change has broken links people may have
// in their chats – change the code back, or add a new format version and keep reading "1/".
test("lenker laget i dag virker også om noen uker (låst format)", () => {
  const ilag = "1/CWY6/N1SSE/250/1219/Testspiller_A/Testspiller_~d8";
  assert.equal(K.lagPersonlig({ id: "N1SSE", kr: 250, dato: 12 * 32 + 19, navn: "Testspiller A", mottaker: "Testspiller Ø" }), ilag);
  assert.deepEqual(js(K.lesPersonlig(ilag)), { id: "N1SSE", kr: 250, dato: 12 * 32 + 19, navn: "Testspiller A", mottaker: "Testspiller Ø" });
  // The draw uses the game's own frozen random numbers (not the kit's, which may change)
  assert.deepEqual(js(K.trekk(5, 123456)), [4, 2, 0, 1, 3]);
  assert.deepEqual(js(K.trekk(12, 4000000)), [1, 3, 5, 2, 0, 11, 8, 4, 9, 10, 7, 6]);
});

test("en personlig lenke får plass i QR-koden, også med lange navn", () => {
  const lenke = "https://rusj.no/nissen/#" + K.lagPersonlig({ id: "ZZZZZ", kr: 1000, dato: 12 * 32 + 24, navn: "Åse-Marie Ærøy", mottaker: "Øyvind Ågesen" });
  assert.ok(K.qrSvg(lenke).includes("<svg"), "QR-koden mangler");
});

test("dato og budsjett", () => {
  assert.equal(K.datoTall("2026-12-19"), 12 * 32 + 19);
  assert.equal(K.datoTall(""), 0);
  assert.equal(K.datoTekst(12 * 32 + 19, new Date(2026, 10, 9)), "lørdag 19. desember");
  // A date long past is next year's: drawn in late December for a party on 6 January
  assert.equal(K.datoTekst(1 * 32 + 6, new Date(2026, 11, 28)), "onsdag 6. januar");
  // The countdown to the gift day
  assert.equal(K.dagerTil(12 * 32 + 19, new Date(2026, 10, 9)), 40);
  assert.equal(K.nedtelling(12 * 32 + 19, new Date(2026, 10, 9)), "40 dager til gavedagen");
  assert.equal(K.nedtelling(12 * 32 + 19, new Date(2026, 11, 18)), "Gavedag i morgen!");
  assert.equal(K.nedtelling(12 * 32 + 19, new Date(2026, 11, 19, 21, 30)), "Gavedag i dag! 🎁");
  assert.equal(K.nedtelling(12 * 32 + 19, new Date(2026, 11, 22)), "", "etter gavedagen: ingen nedtelling");
  assert.equal(K.dagerTil(1 * 32 + 6, new Date(2026, 11, 28)), 9, "over nyttår");
  assert.equal(K.bandFor(0), null);
  assert.equal(K.bandFor(100), "liten");
  assert.equal(K.bandFor(200), "mellom");
  assert.equal(K.bandFor(1000), "raus");
});

test("gaveideene: nok av dem, ingen like, korte og pent skrevet", () => {
  const alle = [];
  for (const band of ["liten", "mellom", "middels", "stor", "raus"]) {
    const liste = IDEER[band];
    assert.ok(Array.isArray(liste) && liste.length >= 30, `${band} har bare ${liste && liste.length} ideer`);
    for (const ide of liste) {
      assert.ok(typeof ide === "string" && ide.trim() === ide && ide.length >= 8 && ide.length <= 60, `«${ide}» er for kort eller for lang`);
      assert.match(ide, /^[A-ZÆØÅ«]/, `«${ide}» skal starte med stor bokstav`);
      assert.doesNotMatch(ide, /[.!]$/, `«${ide}» skal ikke slutte med punktum`);
      alle.push(ide.toLocaleLowerCase("nb"));
    }
  }
  assert.equal(new Set(alle).size, alle.length, "to like gaveideer");
});
