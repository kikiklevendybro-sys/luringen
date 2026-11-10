// Unit tests for Nissen (Secret Santa): the draw is a derangement (one ring through everybody),
// it honours «ikke trekk hverandre» pairs and is the same for the same seed; a personal link holds
// only that person's name and receiver (never the draw) as one scrambled token nobody can read
// names off; broken, changed and made-up links are refused, a link never replaces a kept card
// without asking, names are cut between whole characters, and the link format is pinned so links
// sent today still open in some weeks. Loads the kit and
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

// ---------- Personal links (format 2) ----------
// The format written out once more, on its own: a change in the game's frozen helpers shows up
// here, and the tests can write links the game itself never would (to see that they are refused).
const ALFABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TOKEN = /^2[0-9A-HJKMNP-TV-Z]+$/;
const fnv = (h, bytes) => {
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
  return h >>> 0;
};
const fmix = (h) => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};
const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
const utf8 = (s) => Array.from(new TextEncoder().encode(s));
const tilTegn = (bytes) => {
  let bits = bytes.map((b) => b.toString(2).padStart(8, "0")).join("");
  while (bits.length % 5) bits += "0";
  return bits.replace(/.{5}/g, (x) => ALFABET[parseInt(x, 2)]);
};
const fraTegn = (tekst) => {
  const bits = Array.from(tekst, (c) => ALFABET.indexOf(c).toString(2).padStart(5, "0")).join("");
  const ut = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) ut.push(parseInt(bits.slice(i, i + 8), 2));
  return ut;
};
// The bytes after the check: id (25 bits), budget (14), month (4), day (5), the length of the
// giver's name, and the two names. Names may be given as bytes, to write what isn't valid text.
function innhold({ id = "N1SSE", kr = 0, mnd = 0, dag = 0, navn = "Testspiller A", mottaker = "Testspiller B", lengde } = {}) {
  let n = 0n;
  for (const c of id) n = n * 32n + BigInt(ALFABET.indexOf(c));
  n = (((n << 14n) | BigInt(kr)) << 9n) | BigInt(mnd * 32 + dag);
  const hode = Array.from({ length: 6 }, (_, i) => Number((n >> BigInt(8 * (5 - i))) & 255n));
  const g = typeof navn === "string" ? utf8(navn) : navn;
  const m = typeof mottaker === "string" ? utf8(mottaker) : mottaker;
  return [...hode, lengde == null ? g.length : lengde, ...g, ...m];
}
// Check + scrambling + characters: a link with a valid check, whatever the content.
function pakk(data) {
  const sjekk = fmix(fnv(fnv(0x811c9dc5, ascii("nissen-lenke-2:")), data));
  const t = mulberry(fnv(0x811c9dc5, ascii("nissen-slor:" + sjekk)));
  return "2" + tilTegn([sjekk >>> 24, (sjekk >>> 16) & 255, (sjekk >>> 8) & 255, sjekk & 255, ...data.map((b) => b ^ Math.floor(t() * 256))]);
}
const forfalsk = (o) => pakk(innhold(o));
const DES19 = 12 * 32 + 19;

test("navn tåler turen gjennom lenken – æøå, tegn og emoji", () => {
  const navn = ["Bjørn", "Åse-Marie", "Ærlige Ola", "Zoë", "Kari Nordmann", "O'Neil", "A/B", "Lille_Mi", "~tilde~", "Nisse 🎅", "Ola B.", "Øyvind", "Mx Claus 🧑‍🎄", "Familien 👨‍👩‍👧‍👦", "Bestemor Solvei🎅", "李小龙", "Günther #2", "<b>&\"'"];
  for (const x of navn) {
    assert.equal(K.rentNavn(x), x, `«${x}» ble endret av navnefeltet`);
    for (const o of [
      { id: "ABCDE", kr: 200, dato: DES19, navn: x, mottaker: "Testspiller B" },
      { id: "ABCDE", kr: 0, dato: 0, navn: "Testspiller B", mottaker: x },
    ]) {
      const lenke = K.lagPersonlig(o);
      assert.match(lenke, TOKEN, `«${x}» ga tegn som ikke er trygge i en lenke`);
      assert.deepEqual(js(K.lesPersonlig(lenke)), o, `«${x}» kom ikke likt tilbake`);
    }
  }
});

test("navn kuttes mellom hele tegn – aldri midt i en emoji", () => {
  // 16 characters with an emoji last: kept whole (the old cut left half of it, and two links broke)
  assert.equal(K.kutt("Bestemor Solvei🎅", K.MAKS_NAVN), "Bestemor Solvei🎅");
  assert.equal(K.kutt("Bestemor Solveig🎅", K.MAKS_NAVN), "Bestemor Solveig");
  // An emoji made of several parts goes out whole when it doesn't fit
  assert.equal(K.kutt("Bestemor Solvei🎅🏻", K.MAKS_NAVN), "Bestemor Solvei");
  assert.equal(K.kutt("Familien 👨‍👩‍👧‍👦 Hansen", K.MAKS_NAVN), "Familien 👨‍👩‍👧‍👦");
  const blandet = "A👨‍👩‍👧‍👦B🎅🏻C🇳🇴D❤️E";
  for (let n = 0; n <= 30; n++) {
    const k = K.kutt(blandet, n);
    assert.ok(blandet.startsWith(k) && Array.from(k).length <= n, `kutt til ${n} ga «${k}»`);
    assert.doesNotMatch(k, /[\ud800-\udfff]/u, `kutt til ${n} ga en halv emoji`);
    // … and never between the parts of a family, a flag, a skin tone or a red heart
    assert.doesNotMatch(k, /[\u200d\u{1f468}\u{1f469}\u{1f467}\u{1f385}\u{1f1f3}❤]$/u, `kutt til ${n} delte en sammensatt emoji: «${k}»`);
  }
  // Half an emoji left by an older cut is dropped
  assert.equal(K.kutt("Solveig\ud83c", 16), "Solveig");
  // Every name the field can give makes a link that opens – for both people it concerns
  for (const x of ["Bestemor Solvei🎅", "Bestemor Solveig🎅", "Bestemor Solvei🎅🏻", "🎅".repeat(40), "Å".repeat(40)]) {
    const navn = K.rentNavn(x);
    assert.ok(Array.from(navn).length <= K.MAKS_NAVN);
    assert.ok(K.lesPersonlig(K.lagPersonlig({ id: "ABCDE", kr: 0, dato: 0, navn, mottaker: "Testspiller B" })), `lenken til «${navn}» virker ikke`);
    assert.ok(K.lesPersonlig(K.lagPersonlig({ id: "ABCDE", kr: 0, dato: 0, navn: "Testspiller B", mottaker: navn })), `lenken til den som gir til «${navn}», virker ikke`);
  }
});

test("usynlige tegn og tegn som snur leseretningen, blir aldri en del av et navn", () => {
  assert.equal(K.rentNavn("  Testspiller\u200b \u202eA\t "), "Testspiller A");
  assert.equal(K.rentNavn("Test\u00adspiller\ufeff A\u2060"), "Testspiller A");
  assert.equal(K.rentNavn("\u200b\u2060\u200d \u3164"), "", "et usynlig navn skal telle som tomt");
  assert.equal(K.rentNavn("Testspiller A\u200d"), "Testspiller A");
  assert.equal(K.rentNavn("A\u030ase"), "Åse", "sammensatte bokstaver skal bli like uansett tastatur");
  assert.equal(K.rentNavn("Mx Claus 🧑‍🎄"), "Mx Claus 🧑‍🎄", "sammensatte emoji skal få være i fred");
});

test("ingen navn kan leses ut av lenken – den er stokket, ikke bare pakket", () => {
  const navn = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E"];
  const m = js(K.trekk(5, 4242));
  const lenker = [];
  for (let i = 0; i < 5; i++) {
    const o = { id: "ABCDE", kr: 200, dato: DES19, navn: navn[i], mottaker: navn[m[i]] };
    const lenke = K.lagPersonlig(o);
    lenker.push(lenke);
    assert.match(lenke, TOKEN);
    assert.ok(lenke.length <= 70, `lenken ble lang: ${lenke.length} tegn`);
    // Not in the characters, and not in the bytes under them either (it is scrambled, not just packed)
    const bytes = Buffer.from(fraTegn(lenke.slice(1))).toString("latin1");
    for (const ord of ["Testspiller", "TESTSPILLER", "testspiller", "ABCDE"]) {
      assert.ok(!lenke.includes(ord) && !bytes.includes(ord), `«${ord}» kan leses i lenken til ${navn[i]}`);
    }
    assert.doesNotMatch(bytes, /[A-Za-z ]{8}/, "lesbar tekst i lenken");
    // … and it still opens: with this person's receiver, and nothing about anybody else
    assert.deepEqual(js(K.lesPersonlig(lenke)), o);
  }
  // Every link looks different from the others, also at the start (same draw, budget and day)
  assert.equal(new Set(lenker.map((l) => l.slice(0, 6))).size, 5);
});

test("en ødelagt eller endret lenke blir avvist", () => {
  const lenke = K.lagPersonlig({ id: "Q2RS4", kr: 0, dato: 0, navn: "Bjørn", mottaker: "Åse-Marie" });
  assert.ok(K.lesPersonlig(lenke));
  // Cut off at every length (a chat app that stops the link somewhere)
  for (let n = 0; n < lenke.length; n++) assert.equal(K.lesPersonlig(lenke.slice(0, n)), null, `avkuttet lenke (${n} tegn) ble godtatt`);
  // Every single changed character is caught, and so are two that swapped places
  for (let p = 0; p < lenke.length; p++) {
    for (const c of ALFABET + "abxyz_~-/. ") {
      if (c.toUpperCase() !== lenke[p]) assert.equal(K.lesPersonlig(lenke.slice(0, p) + c + lenke.slice(p + 1)), null, `endret tegn ${p} til «${c}» ble godtatt`);
    }
    if (p && lenke[p] !== lenke[p - 1]) assert.equal(K.lesPersonlig(lenke.slice(0, p - 1) + lenke[p] + lenke[p - 1] + lenke.slice(p + 1)), null, `ombyttede tegn ved ${p} ble godtatt`);
  }
  for (const c of ALFABET) {
    assert.equal(K.lesPersonlig(lenke + c), null, "et ekstra tegn til slutt ble godtatt");
    assert.equal(K.lesPersonlig(lenke.slice(0, 1) + c + lenke.slice(1)), null, "et ekstra tegn først ble godtatt");
  }
  // Small letters are the same link (nothing in it depends on the case)
  assert.deepEqual(js(K.lesPersonlig(lenke.toLowerCase())), js(K.lesPersonlig(lenke)));
  // The readable format from before the launch is not read
  assert.equal(K.lesPersonlig("1/9EAT/7K2QX/200/1219/Testspiller_A/Testspiller_B"), null);
  for (const tull of ["TULL", "", "2", "2" + "0".repeat(30), "2" + "Z".repeat(300), null, undefined]) assert.equal(K.lesPersonlig(tull), null);
});

test("lenker med innhold spillet selv aldri lager, blir avvist – selv med riktig kontrollsum", () => {
  // The stand-alone writer above makes the very same links as the game …
  const o = { id: "N1SSE", kr: 250, dato: DES19, navn: "Testspiller A", mottaker: "Testspiller Ø" };
  assert.equal(forfalsk({ kr: 250, mnd: 12, dag: 19, mottaker: "Testspiller Ø" }), K.lagPersonlig(o));
  assert.deepEqual(js(K.lesPersonlig(forfalsk({ kr: 250, mnd: 12, dag: 19, mottaker: "Testspiller Ø" }))), o);
  // … whatever is on the card: 300 random ones
  const tegn = ["A", "b", "ø", "Å", " ", "-", "7", "é", "🎅", "李", "'", "."];
  const etNavn = () => K.rentNavn(Array.from({ length: R.heltall(1, 16) }, () => tegn[R.heltall(0, tegn.length - 1)]).join("")) || "x";
  for (let k = 0; k < 300; k++) {
    const navn = etNavn();
    let mottaker = etNavn();
    if (mottaker.toLowerCase() === navn.toLowerCase()) mottaker = navn === "y" ? "z" : "y";
    const id = Array.from({ length: 5 }, () => ALFABET[R.heltall(0, 31)]).join("");
    const mnd = R.heltall(0, 12);
    const dag = mnd ? R.heltall(1, [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mnd - 1]) : 0;
    const kort = { id, kr: R.heltall(0, 10000), dato: mnd * 32 + dag, navn, mottaker };
    assert.equal(forfalsk({ id, kr: kort.kr, mnd, dag, navn, mottaker }), K.lagPersonlig(kort), JSON.stringify(kort));
    assert.deepEqual(js(K.lesPersonlig(K.lagPersonlig(kort))), kort);
  }
  const avvist = (hva, felt) => assert.equal(K.lesPersonlig(forfalsk(felt)), null, `${hva} ble godtatt`);
  const godtatt = (hva, felt) => assert.ok(K.lesPersonlig(forfalsk(felt)), `${hva} ble avvist`);

  // Names: no longer than the name field allows, so no messages dressed up as a card
  godtatt("et navn på 16 tegn", { navn: "Ø".repeat(16) });
  avvist("et navn på 17 tegn", { navn: "A".repeat(17) });
  avvist("en hel setning som mottaker", { mottaker: "Vipps 500 kr til 4xx xx xxx for premien" });
  avvist("17 emoji", { mottaker: "🎅".repeat(17) });
  avvist("tomt navn", { navn: "" });
  avvist("tom mottaker", { mottaker: "" });
  avvist("samme giver og mottaker", { navn: "Testspiller A", mottaker: "testspiller a" });
  // Nothing invisible, nothing that turns the reading direction, no stray spaces
  const snik = ["\u202e", "\u202d", "\u2066", "\u200e", "\u200f", "\u200b", "\u2060", "\ufeff", "\u00ad", "\u061c", "\u3164", "\u0000", "\u0007", "\u001b", "\u007f", "\u0085", "\n", "\t", "\u00a0", "\u2028", "  "];
  for (const tegn of snik) {
    const kode = Array.from(tegn, (c) => "U+" + c.codePointAt(0).toString(16).padStart(4, "0")).join(" ");
    avvist(`${kode} midt i et navn`, { navn: "Test" + tegn + "A" });
    avvist(`${kode} midt i en mottaker`, { mottaker: "Test" + tegn + "B" });
  }
  for (const [hva, navn] of [["mellomrom først", " Test"], ["mellomrom sist", "Test "], ["limetegn sist", "Test\u200d"], ["limetegn først", "\u200dTest"]]) avvist(hva, { navn });
  godtatt("en sammensatt emoji", { navn: "Mx Claus 🧑‍🎄" });
  // Bytes that are not proper text
  for (const [hva, bytes] of [["0xff", [0x41, 0xff]], ["en avkuttet bokstav", [0x41, 0xc3]], ["overlang koding", [0xc1, 0x81]], ["overlang nul", [0x41, 0xc0, 0x80]], ["en halv emoji", [0xed, 0xa0, 0xbc]], ["over U+10FFFF", [0xf4, 0x90, 0x80, 0x80]], ["løs fortsettelsesbyte", [0x41, 0x80]]]) {
    avvist(`${hva} i navnet`, { navn: bytes });
    avvist(`${hva} i mottakeren`, { mottaker: bytes });
  }
  avvist("navnelengde forbi slutten", { lengde: 200 });
  avvist("navnelengde som tar hele resten", { navn: "Test", mottaker: "A", lengde: 5 });
  // Budget: whole kroner from 0 to 10 000
  godtatt("0 kr", { kr: 0 });
  godtatt("137 kr", { kr: 137 });
  godtatt("10 000 kr", { kr: 10000 });
  avvist("10 001 kr", { kr: 10001 });
  avvist("16 383 kr", { kr: 16383 });
  assert.equal(K.lagPersonlig({ ...o, kr: 999999 }), "", "spillet skrev en lenke med et umulig budsjett");
  assert.equal(K.lagPersonlig({ ...o, kr: 99.5 }), "");
  // The gift day: a real date, or none
  godtatt("29. februar", { mnd: 2, dag: 29 });
  godtatt("31. desember", { mnd: 12, dag: 31 });
  for (const [mnd, dag] of [[13, 1], [15, 31], [2, 30], [4, 31], [0, 5], [12, 0], [6, 0]]) avvist(`datoen ${dag}.${mnd}.`, { mnd, dag });
  assert.equal(K.lagPersonlig({ ...o, dato: 2 * 32 + 30 }), "");
  assert.equal(K.lagPersonlig({ ...o, id: "abcde" }), "");
  // Spare bits after the last byte must be zero, and nothing may follow
  const hel = forfalsk({});
  const siste = ALFABET.indexOf(hel[hel.length - 1]);
  assert.ok(((hel.length - 1) * 5) % 8 > 0 && (siste & 1) === 0, "eksempelet skal ha ledige biter til slutt");
  assert.equal(K.lesPersonlig(hel.slice(0, -1) + ALFABET[siste | 1]), null, "en lenke med løse biter ble godtatt");
});

test("en lenke erstatter aldri et kort uten å spørre", () => {
  const ny = lastSpill();
  const gikkTil = [];
  ny.R.gaTil = (skjerm) => gikkTil.push(skjerm);
  const { def } = ny;
  const S = js(def.tilstand());
  const kort = { id: "N1SSE", kr: 200, dato: DES19, navn: "Testspiller A", mottaker: "Testspiller B" };
  // An empty phone: the card opens at once
  assert.equal(def.vedHash(S, K.lagPersonlig(kort)), "gjest");
  assert.deepEqual(js(S.gjest), kort);
  // The same link again: still that card, no question
  assert.equal(def.vedHash(S, K.lagPersonlig(kort)), "gjest");
  assert.equal(S.nyttKort, null);
  // Another card – the same person with another receiver (a link somebody made up, or a new draw)
  const annet = { ...kort, mottaker: "Testspiller C" };
  assert.equal(def.vedHash(S, K.lagPersonlig(annet)), "nyttkort");
  assert.deepEqual(js(S.gjest), kort, "kortet ble byttet uten spørsmål");
  assert.deepEqual(js(S.nyttKort), annet);
  // «Behold det gamle»: nothing changes
  def.handlinger["behold-kort"](null, null, S);
  assert.deepEqual(js(S.gjest), kort);
  assert.equal(S.nyttKort, null);
  assert.equal(gikkTil.pop(), "gjest");
  // «Åpne det nye kortet»: now it is replaced
  assert.equal(def.vedHash(S, K.lagPersonlig({ ...kort, id: "ABCDE" })), "nyttkort", "et kort fra en annen trekning ble byttet inn uten spørsmål");
  def.handlinger["apne-nytt"](null, null, S);
  assert.deepEqual(js(S.gjest), { ...kort, id: "ABCDE" });
  assert.equal(S.nyttKort, null);
  assert.equal(gikkTil.pop(), "gjest");
  // A broken link never touches the card
  assert.equal(def.vedHash(S, K.lagPersonlig(annet).slice(0, -2)), "lenkefeil");
  assert.deepEqual(js(S.gjest), { ...kort, id: "ABCDE" });
  assert.ok(S.lenkefeil);
  // A phone with a draw of its own asks too – until the draw is finished
  S.gjest = null;
  S.spill = { ferdig: false };
  assert.equal(def.vedHash(S, K.lagPersonlig(kort)), "nyttkort");
  assert.equal(S.gjest, null);
  S.spill.ferdig = true;
  assert.equal(def.vedHash(S, K.lagPersonlig(kort)), "gjest");
  assert.deepEqual(js(S.gjest), kort);
  // What is kept on the phone goes through the same rules as a link when the page loads
  const lagret = Object.assign(js(def.tilstand()), { navn: ["A", "B", "C"], gjest: { ...kort, mottaker: "Vipps 500 kr til 4xx xx xxx for premien" }, nyttKort: { ...kort, navn: "Test\u202eA" }, skjerm: "nyttkort" });
  def.lastet(lagret);
  assert.equal(lagret.gjest, null);
  assert.equal(lagret.nyttKort, null);
  assert.equal(lagret.skjerm, "hjem");
});

// These values are pinned on purpose: links sent today must still open in some weeks, also after
// rusj or this game is updated. If this test fails, a change has broken links people have in
// their chats – change the code back, or add a new format number and keep reading "2".
test("lenker laget i dag virker også om noen uker (låst format)", () => {
  const laast = [
    ["2CRDN0HW4K7QCY93K8QYRJA6V37DP0X1N1VG7RN09E79TN15F1416PKJC57T9G", { id: "N1SSE", kr: 250, dato: DES19, navn: "Testspiller A", mottaker: "Testspiller Ø" }],
    ["20WDA3GYRPKZ0QTYCZDWPGWWNK5WZ7117PV39DC3QM4FBB82WK4", { id: "Q2RS4", kr: 0, dato: 0, navn: "Nisse 🎅", mottaker: "Åse-Marie" }],
    ["2QWH2GVZMCEYAAEE6VNETR", { id: "00000", kr: 0, dato: 0, navn: "a", mottaker: "b" }],
  ];
  for (const [lenke, o] of laast) {
    assert.equal(K.lagPersonlig(o), lenke);
    assert.deepEqual(js(K.lesPersonlig(lenke)), o);
    // … and the format as it is written out in this file gives the very same link
    assert.equal(forfalsk({ id: o.id, kr: o.kr, mnd: o.dato >> 5, dag: o.dato & 31, navn: o.navn, mottaker: o.mottaker }), lenke);
  }
  // The draw uses the game's own frozen random numbers (not the kit's, which may change)
  assert.deepEqual(js(K.trekk(5, 123456)), [4, 2, 0, 1, 3]);
  assert.deepEqual(js(K.trekk(12, 4000000)), [1, 3, 5, 2, 0, 11, 8, 4, 9, 10, 7, 6]);
});

test("en personlig lenke får plass i QR-koden, også med de lengste navnene", () => {
  const lenke = "https://rusj.no/nissen/#" + K.lagPersonlig({ id: "ZZZZZ", kr: 1000, dato: 12 * 32 + 24, navn: "Åse-Marie Ærøy", mottaker: "Øyvind Ågesen" });
  assert.ok(K.qrSvg(lenke).includes("<svg"), "QR-koden mangler");
  const lengst = "https://rusj.no/nissen/#" + K.lagPersonlig({ id: "ZZZZZ", kr: 10000, dato: 12 * 32 + 31, navn: "😀".repeat(16), mottaker: "🎄".repeat(16) });
  assert.equal(lengst.length, 24 + 224);
  assert.ok(K.lesPersonlig(lengst.split("#")[1]), "den lengste lenken virker ikke");
  assert.ok(K.qrSvg(lengst).includes("<svg"), "QR-koden mangler for den lengste lenken");
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
