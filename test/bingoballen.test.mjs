// Unit tests for Bingoballen: number cards follow the 75-ball rules and are the same on every
// phone for the same code and card number, different card numbers give different cards, party
// cards hold 16 different moments of the theme, lines and the host's «BINGO!» check work, and
// codes from other content are rejected. Loads the kit and the game in a fake browser (node:vm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMAER = JSON.parse(readFileSync(join(ROT, "rusj/spill/bingoballen/data/temaer.json"), "utf8"));

function lastSpill(temaer) {
  const lager = new Map();
  const location = { protocol: "http:", origin: "http://lokal", pathname: "/bingoballen/", hash: "" };
  const window = {
    RUSJ_SPILL: { id: "bingoballen", navn: "Bingoballen" },
    RUSJ_DATA: { temaer },
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
  };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/rusj.js"), "utf8"), kontekst);
  let def = null;
  window.Rusj.start = (d) => (def = d);
  vm.runInContext(readFileSync(join(ROT, "rusj/spill/bingoballen/spill.js"), "utf8"), kontekst);
  assert.ok(def && def.kjerne, "spill.js skal kalle Rusj.start med kjerne-funksjonene");
  return { R: window.Rusj, K: def.kjerne };
}

const { R, K } = lastSpill(TEMAER);
const js = (x) => JSON.parse(JSON.stringify(x));
const usynlig = (t) => t.replace(/­/g, "");

test("tallbrett følger 75-ballsreglene", () => {
  for (let k = 0; k < 500; k++) {
    const fro = R.heltall(0, 2 ** 24 - 1);
    const nr = R.heltall(100000, 999999);
    const c = js(K.tallbrett(fro, nr));
    assert.equal(c.length, 25);
    assert.equal(c[12], 0, "midtruta er fri");
    const tall = c.filter((x) => x !== 0);
    assert.equal(new Set(tall).size, 24, "ingen like tall på et brett");
    for (let r = 0; r < 5; r++) {
      for (let kol = 0; kol < 5; kol++) {
        const x = c[r * 5 + kol];
        if (x === 0) continue;
        assert.ok(x >= kol * 15 + 1 && x <= kol * 15 + 15, `${"BINGO"[kol]}-kolonnen har ${x}`);
      }
    }
    for (let kol = 0; kol < 5; kol++) {
      const kolonne = [0, 1, 2, 3, 4].map((r) => c[r * 5 + kol]).filter((x) => x !== 0);
      assert.deepEqual(kolonne, kolonne.slice().sort((a, b) => a - b), "tallene i en kolonne står i stigende rekkefølge");
    }
    assert.deepEqual(js(K.tallbrett(fro, nr)), c, "samme kode og nummer gir samme brett");
  }
});

test("brettnumrene har seks sifre og gir forskjellige brett", () => {
  const fro = 1234567;
  const sett = new Set();
  const numre = new Set();
  while (numre.size < 30000) numre.add(R.heltall(100000, 999999));
  for (const nr of numre) sett.add(K.tallbrett(fro, nr).join(","));
  assert.equal(sett.size, numre.size, "to brettnumre ga samme brett");
  // Another game (another seed) gives other cards for the same number
  assert.notEqual(K.tallbrett(fro, 4821).join(","), K.tallbrett(fro + 1, 4821).join(","));
  for (let k = 0; k < 2000; k++) {
    const nr = K.nyttNr();
    assert.ok(Number.isInteger(nr) && nr >= 100000 && nr <= 999999, `brettnummer ${nr}`);
  }
});

test("festbrett har 16 ulike øyeblikk fra temaet – likt på alle mobiler", () => {
  for (const tema of TEMAER) {
    const sett = new Set();
    for (let k = 0; k < 200; k++) {
      const fro = R.heltall(0, 2 ** 24 - 1);
      const nr = R.heltall(100000, 999999);
      const b = js(K.festbrett(fro, tema.id, nr));
      assert.equal(b.length, 16);
      assert.equal(new Set(b).size, 16, `${tema.id}: samme øyeblikk to ganger`);
      assert.ok(b.every((i) => Number.isInteger(i) && i >= 0 && i < tema.oyeblikk.length));
      assert.deepEqual(js(K.festbrett(fro, tema.id, nr)), b);
      sett.add(b.join(","));
    }
    assert.ok(sett.size > 195, `${tema.id}: for mange like brett`);
  }
});

test("rekkene: vannrett, loddrett og på skrå", () => {
  assert.equal(K.LINJER[5].length, 12);
  assert.equal(K.LINJER[4].length, 10);
  for (const n of [4, 5]) {
    const sett = new Set(K.LINJER[n].map((l) => l.join(",")));
    assert.equal(sett.size, K.LINJER[n].length, "to like rekker");
    for (const l of K.LINJER[n]) assert.equal(new Set(l).size, n);
  }
  const merket = new Set([0, 6, 12, 18, 24]);
  assert.equal(K.hele(merket, 5).length, 1, "diagonalen er en hel rekke");
  assert.equal(K.hele(new Set([0, 1, 2, 3]), 4).length, 1, "øverste rad på festbrettet");
  assert.equal(K.hele(new Set([0, 1, 2]), 4).length, 0);
});

test("vertens sjekk: rekke, to rekker og fullt brett", () => {
  const fro = 424242;
  const nr = 482137;
  const c = js(K.tallbrett(fro, nr));
  // Nothing drawn: only the free centre
  let r = K.sjekkBrett(fro, nr, []);
  assert.equal(r.merket.size, 1);
  assert.equal(r.linjer.length, 0);
  assert.equal(K.oppfyller(r, "rekke"), false);
  // The middle row needs only four numbers (the centre is free)
  const midt = [10, 11, 13, 14].map((i) => c[i]);
  r = K.sjekkBrett(fro, nr, [...midt, 75]);
  assert.equal(r.linjer.length, 1);
  assert.ok(K.oppfyller(r, "rekke"));
  assert.ok(!K.oppfyller(r, "to"));
  // Plus the top row: two lines
  r = K.sjekkBrett(fro, nr, [...midt, ...c.slice(0, 5)]);
  assert.ok(r.linjer.length >= 2);
  assert.ok(K.oppfyller(r, "to"));
  assert.ok(!K.oppfyller(r, "full"));
  // Every ball drawn: a full card
  r = K.sjekkBrett(fro, nr, Array.from({ length: 75 }, (_, i) => i + 1));
  assert.ok(r.full && K.oppfyller(r, "full"));
  assert.equal(r.linjer.length, 12);
  // Another card number does not get the first card's bingo
  const annen = K.sjekkBrett(fro, 482138, [...midt]);
  assert.ok(annen.linjer.length === 0 || js(K.tallbrett(fro, 482138)).join() !== c.join());
});

test("koden: samme spill på alle mobiler, to kontrolltegn", () => {
  assert.equal(K.KODELENGDE, 8);
  for (let k = 0; k < 300; k++) {
    const o = { modus: R.velg(["tall", "fest"]), tema: R.velg(TEMAER).id, fro: R.heltall(0, 2 ** 24 - 1) };
    const kode = K.lagKode(o);
    assert.equal(kode.length, 8);
    const lest = K.lesKode(R.kode.formater(kode).toLowerCase());
    assert.deepEqual({ modus: lest.modus, fro: lest.fro }, { modus: o.modus, fro: o.fro });
    if (o.modus === "fest") assert.equal(lest.tema, o.tema);
  }
  const ALFABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let godtatt = 0;
  let prov = 0;
  for (let k = 0; k < 40; k++) {
    const kode = K.lagKode({ modus: "tall", tema: "julebord", fro: R.heltall(0, 2 ** 24 - 1) });
    for (let p = 0; p < kode.length; p++) {
      for (const c of ALFABET) {
        if (c === kode[p]) continue;
        prov += 1;
        if (K.lesKode(kode.slice(0, p) + c + kode.slice(p + 1))) godtatt += 1;
      }
    }
  }
  assert.ok(godtatt / prov < 0.005, `${godtatt} av ${prov} koder med én skrivefeil ble godtatt`);
});

test("festbingo avviser koder fra annet innhold – tallbingo bryr seg ikke om temaene", () => {
  const endret = JSON.parse(JSON.stringify(TEMAER));
  endret[0].oyeblikk[0][1] = "Noen gjør noe helt annet";
  const annen = lastSpill(endret).K;
  let avvist = 0;
  for (let k = 0; k < 200; k++) {
    const kode = K.lagKode({ modus: "fest", tema: "julebord", fro: R.heltall(0, 2 ** 24 - 1) });
    if (!annen.lesKode(kode)) avvist += 1;
    // A number game started on one version still opens on the other
    const fro = R.heltall(0, 2 ** 24 - 1);
    const tall = annen.lesKode(K.lagKode({ modus: "tall", tema: "julebord", fro }));
    assert.ok(tall && tall.modus === "tall" && tall.fro === fro, "en tallbingo-kode ble avvist fordi temaene var endret");
  }
  assert.ok(avvist > 190, `bare ${avvist} av 200 koder ble avvist med annet innhold`);
  // The two kinds never mix up
  for (let k = 0; k < 300; k++) {
    const fro = R.heltall(0, 2 ** 24 - 1);
    assert.equal(K.lesKode(K.lagKode({ modus: "tall", tema: "bryllup", fro })).modus, "tall");
    assert.equal(K.lesKode(K.lagKode({ modus: "fest", tema: "bryllup", fro })).modus, "fest");
  }
});

test("festøyeblikkene: nok, ingen like, korte og med ikon", () => {
  assert.ok(TEMAER.length >= 6 && TEMAER.length <= 8, "6–8 temaer (koden har plass til 8)");
  assert.equal(new Set(TEMAER.map((t) => t.id)).size, TEMAER.length);
  for (const t of TEMAER) {
    assert.ok(t.id && t.navn && t.ikon && t.tekst, `${t.id}: mangler felt`);
    assert.ok(t.oyeblikk.length >= 40, `${t.id} har bare ${t.oyeblikk.length} øyeblikk`);
    const tekster = t.oyeblikk.map(([, x]) => usynlig(x).toLocaleLowerCase("nb"));
    assert.equal(new Set(tekster).size, tekster.length, `${t.id}: to like øyeblikk`);
    for (const [ikon, tekst] of t.oyeblikk) {
      const ren = usynlig(tekst);
      assert.ok(typeof ikon === "string" && ikon.length >= 1 && ikon.length <= 8 && !/[A-Za-zÆØÅæøå]/.test(ikon), `${t.id}: «${ren}» mangler ikon`);
      assert.ok(ren.length >= 8 && ren.length <= 35, `${t.id}: «${ren}» er ${ren.length} tegn (8–35)`);
      assert.match(ren, /^[A-ZÆØÅ«0-9]/, `${t.id}: «${ren}» skal starte med stor bokstav`);
      assert.doesNotMatch(ren, /\bstod\b|\bfrem\b|\bfingre\b/, `${t.id}: «${ren}» bryter rusj-skrivemåten`);
      // Long words carry a soft hyphen, so they can break in a narrow cell
      for (const ord of tekst.split(/[\s«»!?,.…–]+/)) assert.ok(usynlig(ord).length < 12 || ord.includes("­"), `${t.id}: «${usynlig(ord)}» trenger en myk bindestrek`);
    }
  }
});
