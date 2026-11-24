// «Spill med en venn på nett»: the build switch (NETT_ADRESSE, CSP), the contract between the five
// games and the rooms Worker, the kit module (rusj/kit/nett.js) and each game's online rules – two
// «phones» (separate copies of the kit and the game, in node:vm) that replay the same list of moves
// must end in exactly the same state, and moves that break the rules are ignored on both alike.
// The Worker's own tests: nett/test (npm test in nett/); they run here too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { lagCsp, nettOpprinnelse, nettKilder, NETT_ADRESSE, statOpprinnelse } from "../scripts/rusj.mjs";
import { SPILL, FORTSETT } from "../nett/src/oppsett.js";
import "../nett/test/rom.test.mjs";
import "../nett/test/worker.test.mjs";
import "../nett/test/protokoll.test.mjs";
import "../nett/test/personvern.test.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADR = "https://rusj-nett.eksempel.workers.dev";

// ---------- The switch in the build ----------

test("NETT_ADRESSE: a bare https origin; the CSP gets it as https: and wss:", () => {
  assert.match(NETT_ADRESSE, /^https:\/\/rusj-nett\.[a-z0-9-]+\.workers\.dev$/);
  assert.equal(nettOpprinnelse(""), "");
  assert.equal(nettOpprinnelse(ADR + "/"), ADR);
  assert.deepEqual(nettKilder(ADR), [ADR, "wss://rusj-nett.eksempel.workers.dev"]);
  assert.deepEqual(nettKilder("http://127.0.0.1:8799"), ["http://127.0.0.1:8799", "ws://127.0.0.1:8799"]);
  for (const feil of ["http://rusj-nett.eksempel.workers.dev", ADR + "/rom", ADR + "/?x=1", "wss://rusj-nett.eksempel.workers.dev", "javascript:alert(1)"]) assert.throws(() => nettOpprinnelse(feil), feil);
  const stat = statOpprinnelse("https://rusj-statistikk.eksempel.workers.dev");
  assert.match(lagCsp(stat, ADR), /connect-src 'self' https:\/\/rusj-statistikk\.eksempel\.workers\.dev https:\/\/rusj-nett\.eksempel\.workers\.dev wss:\/\/rusj-nett\.eksempel\.workers\.dev;/);
  // Switched off: the CSP is exactly what it was before online play existed.
  assert.equal(lagCsp(stat, ""), lagCsp(stat, "").replace(/ wss?:\/\/\S+/g, ""));
  assert.match(lagCsp("", ""), /connect-src 'self';/);
  assert.doesNotMatch(lagCsp(stat, ""), /wss:|rusj-nett/);
});

test("a test build can point the rooms elsewhere (RUSJ_NETT_ADRESSE), checked the same way", () => {
  const for_ = process.env.RUSJ_NETT_ADRESSE;
  try {
    process.env.RUSJ_NETT_ADRESSE = "http://127.0.0.1:8799";
    assert.equal(nettOpprinnelse(), "http://127.0.0.1:8799");
    process.env.RUSJ_NETT_ADRESSE = "http://192.168.0.2:8799";
    assert.throws(() => nettOpprinnelse());
  } finally {
    if (for_ === undefined) delete process.env.RUSJ_NETT_ADRESSE;
    else process.env.RUSJ_NETT_ADRESSE = for_;
  }
});

// ---------- The contract: the games on the net and the rooms ----------

const spillJson = (id) => JSON.parse(readFileSync(join(ROT, "rusj/spill", id, "spill.json"), "utf8"));
const PAANETT = readdirSync(join(ROT, "rusj/spill")).filter((id) => existsSync(join(ROT, "rusj/spill", id, "spill.json")) && spillJson(id).nett === true);

test("the games with \"nett\": true are exactly the rooms' games, with the same seats", () => {
  assert.deepEqual(PAANETT.sort(), Object.keys(SPILL).sort());
  for (const id of PAANETT) {
    const { def } = telefon(id, 0);
    assert.ok(def.nett, `${id} has no nett block`);
    assert.deepEqual([def.nett.min, def.nett.maks], SPILL[id], id);
    for (const f of ["oppsett", "start", "trekk", "skjerm", "tur", "ferdig"]) assert.equal(typeof def.nett[f], "function", `${id}: nett.${f}`);
    // A play-on game (FORTSETT) must know how to take a seat out.
    if (FORTSETT.has(id)) assert.equal(typeof def.nett.borte, "function", `${id}: nett.borte`);
  }
});

// ---------- A phone in node:vm ----------

// The game's data/ as the build gives it (window.RUSJ_DATA: one key per file, Norwegian).
function spillData(id) {
  const mappe = join(ROT, "rusj/spill", id, "data");
  const data = {};
  if (existsSync(mappe)) for (const f of readdirSync(mappe).sort()) if (f.endsWith(".json")) data[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(mappe, f), "utf8"));
  return data;
}
// The Norwegian word bank for games with "ordbank" (window.RUSJ_ORD, as felles/ord.js has it).
let ORDBANK = null;
function ordbank() {
  if (ORDBANK) return ORDBANK;
  const mappe = join(ROT, "data/kategorier");
  const kategorier = readdirSync(mappe)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(mappe, f), "utf8")))
    .map((k) => ({ id: k.id, navn: k.navn, ikon: k.ikon, ord: k.ord.map((e) => [e.o.trim(), e.n, e.h.trim(), e.l.trim()]) }));
  return (ORDBANK = { hash: 1, kategorier });
}

function telefon(id, meg, valg = {}) {
  const lager = new Map();
  const location = { protocol: "https:", origin: "https://rusj.no", pathname: `/${id}/`, hash: "", search: "" };
  const window = {
    RUSJ_SPILL: { id, navn: id },
    RUSJ_DATA: spillData(id),
    ...(existsSync(join(ROT, "rusj/spill", id, "spill.json")) && spillJson(id).ordbank ? { RUSJ_ORD: ordbank() } : {}),
    RUSJ_NETT: valg.adresse === undefined ? ADR : valg.adresse,
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>", alle: ["luringen", "elefanten"] },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    location,
  };
  window.self = window;
  window.top = window;
  const kontekst = {
    window,
    localStorage: { getItem: (k) => (lager.has(k) ? lager.get(k) : null), setItem: (k, v) => lager.set(k, String(v)), removeItem: (k) => lager.delete(k) },
    navigator: { onLine: true },
    document: { addEventListener() {}, documentElement: { setAttribute() {}, removeAttribute() {} }, querySelector: () => null, querySelectorAll: () => [] },
    crypto: globalThis.crypto,
    TextEncoder,
    location,
    history: { pushState() {}, replaceState() {}, state: null },
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
  let def = null;
  R.start = (d) => (def = d);
  R._nettBytt = () => R.S; // (the state swap needs the whole kit; here the test holds S itself)
  R.paNett = () => true;
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/nett.js"), "utf8"), kontekst);
  if (valg.utenSpill) return { R, window };
  vm.runInContext(readFileSync(join(ROT, "rusj/spill", id, "spill.js"), "utf8"), kontekst);
  const S = Object.assign({ skjerm: "spill" }, def.tilstand());
  def.lastet && def.lastet(S);
  R.S = S;
  // R.nett as the kit has it during a match: this phone's seat, nothing to send.
  // The seats that left a play-on match, as the kit keeps them (from the «borte» moves).
  const ute = new Set();
  if (R.nett) {
    R.nett.meg = () => meg;
    R.nett.erMeg = (i) => i === meg;
    R.nett.aktiv = () => true;
    R.nett.ute = () => [...ute];
    R.nett.erUte = (i) => ute.has(i);
    R.nett.neste = (fra, antall = valg.antall || 2) => {
      for (let k = 1; k <= antall; k++) if (!ute.has((fra + k) % antall)) return (fra + k) % antall;
      return fra;
    };
    R.nett.alleHar = (svar, antall = valg.antall || 2) => !!svar && Array.from({ length: antall }, (_, i) => i).every((i) => ute.has(i) || svar[i] != null);
  }
  return { R, def, S, meg, lager, window, ute };
}

// The room's part: a list of moves, each played on every phone in the same order.
// A move { $: "borte" } (the room adds it when a seat leaves a play-on match) goes to nett.borte,
// as in the kit.
function rom(id, antall, oppsett, fro = 20261115, kamp = 1) {
  const tlf = Array.from({ length: antall }, (_, i) => telefon(id, i, { antall }));
  const logg = [];
  const okt = (p, n, gjenspill = true) => ({ n, gjenspill, meg: p.meg, kamp, fro, oppsett, antall, ute: [...p.ute], rng: n == null ? null : p.R.nett.tilfeldig(fro, n) });
  const spill = (p, s, t, n) => {
    if (t && t.$ === "borte") {
      if (p.ute.has(s)) return;
      p.ute.add(s);
      if (p.def.nett.borte) p.def.nett.borte(p.S, s, okt(p, n));
      return;
    }
    p.def.nett.trekk(p.S, JSON.parse(JSON.stringify(t)), s, okt(p, n));
  };
  for (const p of tlf) p.def.nett.start(p.S, okt(p, null));
  return {
    tlf,
    logg,
    trekk(sete, t) {
      const n = logg.length;
      logg.push([sete, t]);
      for (const p of tlf) spill(p, sete, t, n);
    },
    // The seat leaves a play-on match (what the room does on «forlat»).
    borte(sete) {
      this.trekk(sete, { $: "borte" });
    },
    // A late phone: a fresh copy that replays the whole list.
    sen(meg) {
      const p = telefon(id, meg, { antall });
      p.def.nett.start(p.S, okt(p, null));
      logg.forEach(([s, t], n) => spill(p, s, t, n));
      return p;
    },
  };
}
// (As JSON: the two phones are two separate worlds, so their objects never share a prototype.)
const somJson = (x) => JSON.parse(JSON.stringify(x));
const likt = (a, b, felt) => assert.deepEqual(somJson(felt ? felt(a.S.spill) : a.S.spill), somJson(felt ? felt(b.S.spill) : b.S.spill));

test("the kit module: only with a valid address; the move chance is the same everywhere and differs per move", () => {
  assert.equal(telefon("fireren", 0, { utenSpill: true, adresse: "" }).R.nett, undefined);
  assert.equal(telefon("fireren", 0, { utenSpill: true, adresse: "https://evil.example/x" }).R.nett, undefined);
  assert.equal(telefon("fireren", 0, { utenSpill: true, adresse: "javascript:alert(1)" }).R.nett, undefined);
  const a = telefon("fireren", 0, { utenSpill: true }).R;
  const b = telefon("fireren", 1, { utenSpill: true }).R;
  assert.equal(typeof a.nett.send, "function");
  const kast = (R, fro, n) => Array.from({ length: 5 }, () => 1 + Math.floor(R.nett.tilfeldig(fro, n)() * 6));
  for (let n = 0; n < 50; n++) assert.deepEqual(kast(a, 7, n), kast(b, 7, n));
  assert.notDeepEqual(kast(a, 7, 1), kast(a, 7, 2));
  assert.notDeepEqual(kast(a, 7, 1), kast(a, 8, 1));
  // Over many moves the dice are fair enough: every face shows up, none more than twice as often as another.
  const tall = [0, 0, 0, 0, 0, 0];
  for (let n = 0; n < 6000; n++) tall[Math.floor(a.nett.tilfeldig(99, n)() * 6)]++;
  assert.ok(Math.max(...tall) < 2 * Math.min(...tall), tall.join());
});

test("Fireren: a match «først til 3» on two phones, out-of-turn and impossible moves ignored", () => {
  const r = rom("fireren", 2, { mal: 3 });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  for (let steg = 0; steg < 200 && !sp().ferdig && !(Math.max(...sp().poeng) >= 3); steg++) {
    if (sp().resultat) {
      r.trekk(steg % 2, { runde: 1 });
      continue;
    }
    const tur = a.def.nett.tur(a.S);
    r.trekk(1 - tur, { k: 6 }); // not your turn: nothing happens
    r.trekk(tur, { k: 9 }); // no such column
    r.trekk(tur, { k: sp().starter === tur ? 0 : 1 });
  }
  assert.equal(Math.max(...sp().poeng), 3);
  assert.ok(a.def.nett.ferdig(a.S));
  likt(a, b);
  likt(a, r.sen(1));
});

test("Sjakkhesten: the quickest mate, the colours swap with «Ny kamp», resigning, illegal moves ignored", () => {
  const r = rom("sjakkhesten", 2, {});
  const [a, b] = r.tlf;
  assert.notEqual(a.S.spill.meg, b.S.spill.meg, "one white, one black");
  const hvit = a.S.spill.hvit;
  r.trekk(1 - hvit, { m: "e7e5" }); // black first: ignored
  r.trekk(hvit, { m: "e2e5" }); // impossible: ignored
  r.trekk(hvit, { m: "f2f3" });
  r.trekk(1 - hvit, { m: "e7e5" });
  r.trekk(hvit, { m: "g2g4" });
  r.trekk(1 - hvit, { m: "d8h4" });
  assert.deepEqual(somJson(a.S.spill.trekk), ["f2f3", "e7e5", "g2g4", "d8h4"]);
  assert.equal(a.S.spill.resultat.grunn, "matt");
  assert.equal(a.S.spill.resultat.vinner, 1, "black wins");
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  const utenFarge = (sp) => ({ ...sp, meg: null }); // (each phone knows its own colour)
  likt(a, b, utenFarge);
  likt(a, r.sen(0), utenFarge);
  const r2 = rom("sjakkhesten", 2, {}, 20261115, 2);
  assert.notEqual(r2.tlf[0].S.spill.hvit, hvit, "match 2: the other seat has white");
  r2.trekk(1 - r2.tlf[0].S.spill.hvit, { gi: 1 });
  assert.deepEqual(somJson(r2.tlf[1].S.spill.resultat), { vinner: 0, grunn: "oppgitt", flagg: null });
});

test("Brikka: a whole game for three on three phones – the same dice, the same board", () => {
  const r = rom("brikka", 3, { seks: true, eksakt: false, kjapt: true });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  const regler = a.window.RusjBrikka; // the pure rules of the game
  for (let steg = 0; steg < 5000 && !sp().ferdig; steg++) {
    const sete = a.def.nett.tur(a.S);
    if (sp().kast == null) {
      r.trekk((sete + 1) % 3, { kast: 1 }); // not your turn
      r.trekk(sete, { kast: 1 });
      continue;
    }
    const liste = regler.trekk(sp().brikker, sp().tur, sp().kast, sp().regler);
    if (liste.length) r.trekk(sete, { flytt: `${liste[0].sete}:${liste[0].brikke}` });
    else r.trekk(sete, { videre: 1 });
  }
  assert.ok(sp().ferdig, "nobody finished");
  assert.ok(sp().stat.kast > 20);
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(2));
});

test("Terninga: a full pad for two – the same throws, held dice keep their numbers", () => {
  const r = rom("terninga", 2, { variant: "vanlig" });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  let holdtSjekk = false;
  for (let steg = 0; steg < 500 && !a.def.nett.ferdig(a.S); steg++) {
    const sete = sp().tur;
    r.trekk(1 - sete, { kast: [0, 0, 0, 0, 0] }); // not your turn
    r.trekk(sete, { kast: [0, 0, 0, 0, 0] });
    if (!holdtSjekk) {
      holdtSjekk = true;
      const for_ = sp().terninger.slice();
      r.trekk(sete, { kast: [1, 1, 0, 0, 0] });
      assert.deepEqual(somJson(sp().terninger.slice(0, 2)), somJson(for_.slice(0, 2)));
      assert.deepEqual(somJson(sp().holdt), [true, true, false, false, false]);
      assert.equal(sp().kast, 2);
    }
    r.trekk(sete, { sett: "tull" }); // no such box
    const apen = a.window.RusjTerninga.VARIANTER.vanlig.alle.find((k) => sp().kort[sete][k] == null);
    r.trekk(sete, { sett: apen });
  }
  assert.ok(a.def.nett.ferdig(a.S));
  assert.ok(sp().kort.every((k) => Object.keys(k).length === 15));
  likt(a, b);
  likt(a, r.sen(0));
});

test("Admiralen: the fleets stay on their phones until the end; shots, answers and the reveal", async () => {
  const r = rom("admiralen", 2, { brett: 8, ekstra: false });
  const [a, b] = r.tlf;
  const K = a.def.kjerne;
  assert.equal(a.S.spill.flate[1], null, "A does not know B's fleet");
  assert.equal(b.S.spill.flate[0], null, "B does not know A's fleet");
  const fl = [a.S.spill.flate[0], b.S.spill.flate[1]];
  // (What «Klar!» keeps on each phone: in the game it comes with the commitment.)
  a.S.spill.salt = "salt";
  b.S.spill.salt = "salt";
  const hash = "a".repeat(64);
  r.trekk(0, { klar: hash });
  r.trekk(1, { klar: "b".repeat(64) });
  r.trekk(0, { klar: "c".repeat(64) }); // only once
  assert.equal(a.S.spill.hash[0], hash);
  assert.equal(a.S.spill.tur, a.S.spill.starter);
  // Play: the seat to move fires at the next cell of the other fleet (A) or at its first free cell (B);
  // the defender's answer is what its own phone computes.
  const n = 8;
  let steg = 0;
  while (a.S.spill.vinner == null && steg++ < 300) {
    const s = a.S.spill.tur;
    const mot = 1 - s;
    const egen = [a, b][mot].S.spill;
    const mal = s === 0 ? fl[1].flatMap((x) => K.celler(x, n)) : Array.from({ length: n * n }, (_, i) => i);
    const i = mal.find((c) => !a.S.spill.skudd[s].includes(c));
    r.trekk(mot, { skudd: i }); // not your turn: ignored
    r.trekk(s, { skudd: i });
    assert.deepEqual(somJson(a.S.spill.venter), { s, i, n: r.logg.length - 1 });
    r.trekk(s, { skudd: i + 1 }); // waiting for the answer: ignored
    const { t, senket, eier } = K.tavle(egen.flate[mot], egen.skudd[s], n);
    const svar = { svar: i, r: t[i] === 3 ? 3 : t[i] === 2 ? 2 : 1 };
    if (svar.r === 3) svar.skip = { id: egen.flate[mot][eier.get(i)].id, c: K.celler(egen.flate[mot][eier.get(i)], n) };
    if (senket.every(Boolean)) svar.alle = 1;
    r.trekk(s, svar); // the shooter cannot answer for the defender
    r.trekk(mot, svar);
    assert.equal(a.S.spill.venter, null);
  }
  assert.equal(a.S.spill.vinner, 0);
  assert.equal(a.S.spill.flate[1], null, "still secret until revealed");
  assert.equal(a.def.nett.ferdig(a.S), false, "not over before both fleets are shown");
  assert.ok(a.def.nett.kanNy(a.S), "«Ny kamp» already allowed");
  r.trekk(1, { avslor: { flate: fl[1], salt: "salt" } });
  r.trekk(0, { avslor: { flate: fl[0], salt: "salt" } });
  r.trekk(0, { avslor: { flate: K.tilfeldigFlate(n), salt: "x" } }); // only once
  assert.deepEqual(somJson(a.S.spill.avslort[1].flate), somJson(fl[1]));
  assert.ok(a.def.nett.ferdig(a.S));
  likt(a, b, (sp) => [sp.skudd, sp.svar, sp.klar, sp.hash, sp.tur, sp.vinner, sp.avslort]);
  likt(a, r.sen(1), (sp) => [sp.skudd, sp.svar, sp.vinner, sp.avslort]);
});

// Tries every square name in order until the seat's move is played (the rest are ignored alike).
const forsokRuter = (r, sete, navn, lagt) => {
  for (const s of navn) {
    r.trekk(sete, s);
    if (lagt()) return true;
  }
  return false;
};
const RUTENAVN = Array.from({ length: 64 }, (_, s) => "abcdefgh"[s & 7] + ((s >> 3) + 1));

test("Reversi: a whole game on two phones, out-of-turn and illegal discs ignored, black alternates per match", () => {
  const r = rom("reversi", 2, { mal: 1, prikker: true });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  assert.equal(sp().starter, 0, "the host has black in match 1");
  r.trekk(1, { s: "d3" }); // white first: ignored
  r.trekk(0, { s: "a1" }); // flips nothing: ignored
  r.trekk(0, { s: "zz" });
  r.trekk(0, { runde: 1 }); // the game is not over: ignored
  assert.equal(sp().trekk.length, 0);
  for (let steg = 0; steg < 100 && !sp().resultat; steg++) {
    const tur = a.def.nett.tur(a.S);
    const n = sp().trekk.length;
    assert.ok(forsokRuter(r, tur, RUTENAVN.map((s) => ({ s })), () => sp().trekk.length > n), "no legal square");
  }
  assert.ok(sp().resultat, "the game did not end");
  assert.ok(a.def.nett.ferdig(a.S), "«Ett parti»: the match is over");
  assert.equal(a.def.nett.tur(a.S), null);
  assert.equal(sp().poeng[0] + sp().poeng[1] + sp().uavgjort, 1);
  likt(a, b);
  const sen = r.sen(1);
  likt(a, sen);
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt", "a finished match, replayed: the result");
  assert.equal(rom("reversi", 2, { mal: 1 }, 20261115, 2).tlf[0].S.spill.starter, 1, "match 2: the guest has black");
  const r3 = rom("reversi", 2, { mal: 3 });
  assert.equal(r3.tlf[0].S.spill.mal, 3);
});

// A game's pure rules, loaded without the kit (the file exports them as window[navn] then).
function regler(id, navn) {
  const window = {};
  const kontekst = { window, performance, setTimeout, clearTimeout, console };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/spill", id, "spill.js"), "utf8"), kontekst);
  return window[navn];
}

test("Bonden: «først til 3» on two phones, taken cells and out-of-turn marks ignored, the opener alternates", () => {
  const r = rom("bonden", 2, { variant: "tre", mal: 3 });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  assert.equal(sp().starter, 0);
  for (let steg = 0; steg < 200 && !a.def.nett.ferdig(a.S); steg++) {
    if (sp().resultat) {
      r.trekk(steg % 2, { runde: 1 });
      continue;
    }
    const tur = a.def.nett.tur(a.S);
    const fri = sp().trekk.length ? [0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => !sp().trekk.includes(i)) : 0;
    r.trekk(1 - tur, { i: fri }); // not your turn
    r.trekk(tur, { i: 9 }); // no such cell
    if (sp().trekk.length) r.trekk(tur, { i: sp().trekk[0] }); // taken
    r.trekk(tur, { i: "1" });
    r.trekk(tur, { i: fri });
  }
  assert.equal(Math.max(...sp().poeng), 3);
  assert.ok(a.def.nett.ferdig(a.S));
  likt(a, b);
  likt(a, r.sen(1));
  const r2 = rom("bonden", 2, { variant: "stor", mal: 0 }, 20261115, 2);
  assert.equal(r2.tlf[0].S.spill.starter, 1, "match 2: the guest opens");
  assert.equal(r2.tlf[0].S.spill.variant, "stor");
  r2.trekk(1, { i: 224 });
  r2.trekk(0, { i: 225 }); // off the 15 × 15 board
  assert.deepEqual(somJson(r2.tlf[1].S.spill.trekk), [224]);
});

test("Mølla: a whole game on two phones – mills and captures as one move, illegal moves ignored", () => {
  const { Molle } = regler("molla", "Molla");
  const r = rom("molla", 2, { mal: 1 });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().mal, 1);
  r.trekk(1, { m: "a1" }); // black first: ignored
  r.trekk(0, { m: "a1-a4" }); // nothing to move yet: ignored
  r.trekk(0, { m: "x9" });
  r.trekk(0, { m: 5 });
  assert.equal(sp().trekk.length, 0);
  let molle = false;
  for (let steg = 0; steg < 600 && !sp().resultat; steg++) {
    const tur = a.def.nett.tur(a.S);
    const lov = Molle.lovlige(Molle.spillUt(sp().trekk));
    const m = lov.find((x) => x[2] >= 0) || lov[0];
    if (m[2] >= 0) {
      molle = true;
      r.trekk(tur, { m: Molle.tekst([m[0], m[1], -1]) }); // a mill must take a piece: ignored
    }
    r.trekk(1 - tur, { m: Molle.tekst(m) }); // not your turn
    const n = sp().trekk.length;
    r.trekk(tur, { m: Molle.tekst(m) });
    assert.equal(sp().trekk.length, n + 1);
  }
  assert.ok(molle, "no mill was made");
  assert.ok(sp().resultat, "the game did not end");
  assert.ok(a.def.nett.ferdig(a.S));
  likt(a, b);
  likt(a, r.sen(0));
  assert.equal(rom("molla", 2, {}, 20261115, 2).tlf[1].S.spill.starter, 1, "match 2: the guest has white");
});

test("Såmannen: a whole game of kalaha on two phones – extra turns, captures, empty and foreign pits ignored", () => {
  const { Kalaha } = regler("samannen", "Samannen");
  const r = rom("samannen", 2, { kuler: 6 });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().kuler, 6);
  let igjen = false;
  for (let steg = 0; steg < 400 && !sp().resultat; steg++) {
    const tur = a.def.nett.tur(a.S);
    const p = Kalaha.spillUt(sp().kuler, sp().trekk);
    const lov = Kalaha.lovlige(p);
    r.trekk(1 - tur, { i: lov[0] }); // not your turn
    r.trekk(tur, { i: lov[0] < 7 ? 8 : 1 }); // the other side's pit
    r.trekk(tur, { i: 6 }); // a store
    const n = sp().trekk.length;
    r.trekk(tur, { i: lov[lov.length - 1] });
    assert.equal(sp().trekk.length, n + 1);
    if (a.def.nett.tur(a.S) === tur && !sp().resultat) igjen = true;
  }
  assert.ok(igjen, "no extra turn");
  assert.ok(sp().resultat && a.def.nett.ferdig(a.S));
  assert.equal(sp().resultat.lager[0] + sp().resultat.lager[1], 72);
  likt(a, b);
  const sen = r.sen(1);
  likt(a, sen);
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt");
  assert.equal(rom("samannen", 2, {}, 20261115, 2).tlf[0].S.spill.starter, 1, "match 2: the guest opens");
});

test("Snekkeren: a whole 3 × 3 game on two phones – a box gives another line, drawn and foreign lines ignored", () => {
  const { Boks } = regler("snekkeren", "Snekkeren");
  const r = rom("snekkeren", 2, { n: 3 });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().n, 3);
  let igjen = false;
  for (let steg = 0; steg < 100 && !sp().resultat; steg++) {
    const tur = a.def.nett.tur(a.S);
    const lov = Boks.lovlige(Boks.spillUt(sp().n, sp().trekk));
    r.trekk(1 - tur, { l: lov[0] }); // not your turn
    if (sp().trekk.length) r.trekk(tur, { l: sp().trekk[0] }); // drawn already
    r.trekk(tur, { l: 24 }); // no such line on 3 × 3
    r.trekk(tur, { l: "0" });
    const n = sp().trekk.length;
    r.trekk(tur, { l: lov[0] });
    assert.equal(sp().trekk.length, n + 1);
    if (a.def.nett.tur(a.S) === tur && !sp().resultat) igjen = true;
  }
  assert.ok(igjen, "no box was closed");
  assert.equal(sp().trekk.length, 24);
  assert.equal(sp().resultat.bokser[0] + sp().resultat.bokser[1], 9);
  assert.ok(a.def.nett.ferdig(a.S));
  likt(a, b);
  likt(a, r.sen(0));
  assert.equal(rom("snekkeren", 2, { n: 9 }, 20261115, 2).tlf[0].S.spill.n, 4, "an unknown size: 4 × 4");
  assert.equal(rom("snekkeren", 2, {}, 20261115, 2).tlf[1].S.spill.starter, 1, "match 2: the guest opens");
});

test("Dam: a whole game on two phones – forced captures, multi-jumps as one move, illegal moves ignored", () => {
  const { Dam } = regler("dam", "Dam");
  const r = rom("dam", 2, { mal: 1 });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().starter, 0, "the host has white in match 1");
  r.trekk(1, { m: "b6-a5" }); // black first: ignored
  r.trekk(0, { m: "a1-b2" }); // occupied: ignored
  r.trekk(0, { m: "c3-c4" }); // not diagonal: ignored
  r.trekk(0, { m: 12 });
  assert.equal(sp().trekk.length, 0);
  let slag = false;
  for (let steg = 0; steg < 400 && !sp().resultat; steg++) {
    const tur = a.def.nett.tur(a.S);
    const p = Dam.lastParti(Dam.START, sp().trekk);
    // The longest capture there is, else the first move (so the game ends in a win, not a draw).
    const m = p.lovlige.slice().sort((x, y) => y.slag.length - x.slag.length)[0];
    if (m.slag.length) {
      slag = true;
      // A capture is mandatory: the same piece stepping to the first square it jumps to is ignored.
      r.trekk(tur, { m: `${Dam.navn(m.fra)}-${Dam.navn(m.sti[0])}` });
    }
    r.trekk(1 - tur, { m: Dam.notasjon(m) }); // not your turn
    const n = sp().trekk.length;
    r.trekk(tur, { m: Dam.notasjon(m) });
    assert.equal(sp().trekk.length, n + 1);
  }
  assert.ok(slag, "no capture");
  assert.ok(sp().resultat, "the game did not end");
  assert.ok(a.def.nett.ferdig(a.S));
  likt(a, b);
  const sen = r.sen(1);
  likt(a, sen);
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt");
  const r2 = rom("dam", 2, { mal: 3 }, 20261115, 2);
  assert.equal(r2.tlf[0].S.spill.starter, 1, "match 2: the guest has white");
  assert.equal(r2.tlf[0].S.spill.mal, 3);
});

test("Stigespillet: a whole game for three on three phones – the same dice, out-of-turn throws ignored", () => {
  const r = rom("stigespillet", 3, { brett: "jul", seks: true, eksakt: true });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().seter.length, 3);
  assert.equal(sp().brett, "jul");
  assert.equal(sp().tur, 0, "the host begins match 1");
  let seks = false;
  let stige = false;
  for (let steg = 0; steg < 3000 && !sp().ferdig; steg++) {
    const tur = sp().tur;
    r.trekk((tur + 1) % 3, { kast: 1 }); // not your turn
    r.trekk(tur, { kast: 2 });
    r.trekk(tur, { flytt: 1 });
    const n = sp().stat.kast;
    r.trekk(tur, { kast: 1 });
    assert.equal(sp().stat.kast, n + 1);
    if (sp().terning === 6 && !sp().ferdig) {
      seks = true;
      assert.equal(sp().tur, tur, "a six: the same one again");
    }
    if (sp().siste.via === "stige") stige = true;
  }
  assert.ok(sp().ferdig && sp().pos[sp().vinner] === 100, "nobody reached 100");
  assert.ok(seks && stige);
  assert.ok(a.def.nett.ferdig(a.S));
  r.trekk(sp().tur, { kast: 1 }); // after the end: ignored
  likt(a, b);
  likt(a, c);
  const sen = r.sen(2);
  likt(a, sen);
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt");
  assert.equal(rom("stigespillet", 3, {}, 20261115, 2).tlf[0].S.spill.tur, 1, "match 2: the next seat begins");
  assert.equal(rom("stigespillet", 2, {}, 20261115, 4).tlf[0].S.spill.tur, 1);
});

test("Lykkegrisen: a whole game to 5000 for three on three phones – every roll, die and «Stopp» a move", () => {
  const L = regler("lykkegrisen", "RusjLykkegrisen");
  const r = rom("lykkegrisen", 3, { mal: 5000, tabell: "faste", inngang: 500, straff: true });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().antall, 3);
  assert.equal(sp().mal, 5000);
  assert.equal(sp().tur, 0, "the host begins match 1");
  r.trekk(0, { stopp: 1 }); // nothing to write down yet
  r.trekk(1, { kast: 1 }); // not your turn
  assert.equal(sp().terninger.length, 0);
  let tomt = false;
  let inngang = false;
  for (let steg = 0; steg < 20000 && !a.def.nett.ferdig(a.S); steg++) {
    const tur = sp().tur;
    if (sp().status === "kast") {
      r.trekk((tur + 1) % 3, { kast: 1 }); // not your turn
      r.trekk(tur, { kast: 1 });
      continue;
    }
    if (sp().status === "tomt") {
      tomt = true;
      r.trekk(tur, { kast: 1 }); // the turn is lost: no more rolls
      r.trekk(tur, { neste: 1 });
      continue;
    }
    // Choose: first one die by hand (and back), then the best; stop at 600 (or the entry score).
    r.trekk(tur, { velg: 99 });
    r.trekk(tur, { velg: 0 });
    r.trekk(tur, { velg: 0 });
    assert.ok(!sp().valgt[0]);
    r.trekk(tur, { beste: 1 });
    const v = L.verdi(sp().terninger.filter((_, i) => sp().valgt[i]), sp().tabell);
    const poeng = sp().turPoeng + v;
    if (!sp().inne[tur] && poeng < 500) {
      const n = sp().logg[tur].length;
      r.trekk(tur, { stopp: 1 }); // below the entry score: ignored
      assert.equal(sp().logg[tur].length, n);
      inngang = true;
    }
    if (poeng >= 600 && (sp().inne[tur] || poeng >= 500)) r.trekk(tur, { stopp: 1 });
    else r.trekk(tur, { kast: 1 });
  }
  assert.ok(sp().klar, "the last round did not end");
  assert.ok(a.def.nett.ferdig(a.S));
  assert.ok(Math.max(...sp().totaler) >= 5000);
  assert.ok(tomt && inngang);
  likt(a, b);
  likt(a, c);
  const sen = r.sen(1);
  likt(a, sen, (x) => ({ ...x, ferdig: true, resultat: null }));
  assert.ok(sen.S.spill.ferdig && sen.def.nett.skjerm(sen.S) === "slutt", "a finished match, replayed: the result");
  assert.equal(rom("lykkegrisen", 3, {}, 20261115, 2).tlf[0].S.spill.tur, 1, "match 2: the next seat begins");
});

test("Låsesmeden: two secret codes, guesses in turn answered by the owner's phone, the fair rule, the reveal", async () => {
  const { createHash } = await import("node:crypto");
  const hash = (kode, salt) => createHash("sha256").update(JSON.stringify({ kode, salt })).digest("hex");
  const sov = () => new Promise((ok) => setTimeout(ok, 30));
  // One match: each seat guesses by its own plan (from its history); svarFeil: B's lock lies once.
  const kamp = (koder, plan, o = {}) => {
    const r = rom("lasesmeden", 2, { niva: 2 }, 20261115, o.kamp || 1);
    const [a, b] = r.tlf;
    const M = a.window.Lasesmeden;
    // (What «Lås koden» keeps on each phone: the code and its salt.)
    for (const [p, i] of [[a, 0], [b, 1]]) Object.assign(p.S.spill, { egen: koder[i].slice(), salt: "salt" + i });
    assert.equal(a.def.nett.skjerm(a.S), "lag");
    r.trekk(0, { gjett: [0, 0, 0, 0] }); // nobody is ready: ignored
    r.trekk(0, { klar: hash(koder[0], "salt0") });
    r.trekk(0, { klar: "f".repeat(64) }); // only once
    assert.equal(a.S.spill.hash[0], hash(koder[0], "salt0"));
    assert.equal(a.def.nett.skjerm(a.S), "spill");
    assert.equal(b.def.nett.skjerm(b.S), "lag", "B is still making its code");
    assert.equal(a.def.nett.tur(a.S), null);
    r.trekk(1, { klar: hash(koder[1], "salt1") });
    assert.equal(a.def.nett.tur(a.S), a.S.spill.starter);
    for (let steg = 0; steg < 40 && !a.S.spill.resultat; steg++) {
      const s = a.def.nett.tur(a.S);
      const eier = 1 - s;
      const k = a.S.spill.runder[s].gjett.length;
      const g = somJson(plan[s](a.S.spill.runder[s].gjett, M));
      r.trekk(eier, { gjett: g }); // not your turn
      r.trekk(s, { gjett: [9, 0, 0, 0] }); // no such colour
      r.trekk(s, { gjett: g });
      assert.deepEqual(somJson(a.S.spill.venter), { s, k, gjett: g });
      assert.equal(a.def.nett.tur(a.S), null, "nobody's turn while the lock answers");
      r.trekk(s, { gjett: g }); // waiting for the answer
      const v = M.vurder(koder[eier], g);
      const svar = o.svarFeil && eier === 1 && k === 0 ? { svar: k, s: v.svart === 0 ? 1 : 0, h: 0 } : { svar: k, s: v.svart, h: v.hvit };
      r.trekk(s, svar); // the guesser cannot answer for the owner
      r.trekk(eier, { ...svar, svar: k + 1 }); // another guess's number
      r.trekk(eier, { svar: k, s: 3, h: 1 }); // impossible
      assert.equal(a.S.spill.runder[s].gjett.length, k);
      r.trekk(eier, svar);
      assert.equal(a.S.spill.runder[s].gjett.length, k + 1);
    }
    return { r, a, b, M };
  };
  const kodene = [[0, 1, 2, 3], [5, 5, 4, 4]];
  const smart = (hist, M) => M.mulige(2, hist)[0] || [0, 0, 0, 0]; // (after a lie nothing fits)
  const dum = (hist) => [hist.length % 6, 0, 0, 0];
  // A (the host, first) cracks the code; B gets its guess of the same number and misses: A wins.
  const { r, a, b } = kamp(kodene, [smart, dum]);
  const sp = () => a.S.spill;
  assert.equal(sp().resultat.vinner, 0);
  assert.equal(sp().runder[0].gjett.length, sp().runder[1].gjett.length, "the same number of guesses");
  assert.ok(sp().runder[0].lost && !sp().runder[1].lost);
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  assert.equal(b.S.spill.egen.join(), "5,5,4,4");
  assert.equal(a.S.spill.avslort[1], null, "A does not know B's code before the reveal");
  assert.ok(!a.def.nett.ferdig(a.S) && a.def.nett.kanNy(a.S));
  r.trekk(1, { avslor: { kode: [5, 5, 4, 4], salt: "salt1" } });
  r.trekk(0, { avslor: { kode: [0, 1, 2, 3], salt: "salt0" } });
  r.trekk(0, { avslor: { kode: [1, 1, 1, 1], salt: "x" } }); // only once
  assert.ok(a.def.nett.ferdig(a.S));
  likt(a, b, (x) => [x.klar, x.hash, x.runder.map((y) => [y.gjett, y.lost]), x.tur, x.resultat, x.avslort]);
  const sen = r.sen(1);
  likt(a, sen, (x) => [x.klar, x.hash, x.runder.map((y) => y.gjett), x.resultat, x.avslort]);
  assert.ok(sen.S.spill.mistet, "a phone without its code knows it");
  a.def.nett.etter(a.S, {});
  await sov();
  assert.match(a.def.skjermer.slutt.vis(a.S), /✓/, "A checks B's code against every answer");
  // B cracks with the same number of guesses: a draw. Only B cracks: B wins (also when B began).
  assert.equal(kamp([[1, 2, 3, 4], [1, 2, 3, 4]], [smart, smart]).a.S.spill.resultat.vinner, null);
  assert.equal(kamp([[0, 0, 0, 0], [5, 4, 3, 2]], [dum, smart]).a.S.spill.resultat.vinner, 1);
  const k2 = kamp(kodene, [dum, smart], { kamp: 2 });
  assert.equal(k2.a.S.spill.starter, 1, "match 2: the guest guesses first");
  assert.equal(k2.a.S.spill.resultat.vinner, 1);
  // Nobody cracks within the ten guesses: a draw.
  const ingen = kamp(kodene, [dum, dum]).a.S.spill;
  assert.ok(ingen.resultat.vinner === null && ingen.runder.every((x) => x.gjett.length === 10 && !x.lost));
  // A lock that lied about one answer is caught at the reveal.
  const l = kamp(kodene, [smart, dum], { svarFeil: true });
  for (const i of [1, 0]) l.r.trekk(i, { avslor: { kode: kodene[i], salt: "salt" + i } });
  l.a.def.nett.etter(l.a.S, {});
  await sov();
  assert.match(l.a.def.skjermer.slutt.vis(l.a.S), /⚠/);
});

test("Tavla: a match to 3 with the cube on two phones – the same dice, whole turns checked, doubles taken and dropped", () => {
  const T = regler("tavla", "RusjTavla");
  const r = rom("tavla", 2, { mal: 3, kube: true });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  assert.equal(sp().mal, 3);
  assert.ok(sp().apning && sp().kast[0] !== sp().kast[1], "the opening roll: one die each");
  assert.equal(sp().tur, sp().kast[0] > sp().kast[1] ? 0 : 1);
  const rnd = T.rng(7);
  let doblinger = 0;
  let delvis = false;
  for (let steg = 0; steg < 4000 && !a.def.nett.ferdig(a.S); steg++) {
    const s = sp().tur;
    if (sp().resultat) {
      r.trekk(steg % 2, { kast: 1 }); // the game is over: no rolls
      r.trekk(steg % 2, { neste: 1 });
      continue;
    }
    if (sp().tilbud >= 0) {
      const d = sp().tilbud;
      assert.equal(a.def.nett.tur(a.S), 1 - d, "the one who must answer has the turn");
      r.trekk(d, { ta: 1 }); // the one who offered cannot answer
      assert.equal(sp().tilbud, d);
      r.trekk(1 - d, doblinger === 1 ? { ta: 1 } : { slipp: 1 });
      continue;
    }
    if (!sp().kast) {
      r.trekk(1 - s, { kast: 1 }); // not your turn
      r.trekk(s, { spill: [] }); // no dice yet
      const kan = sp().kube && !sp().crawford && (sp().kubeEier === -1 || sp().kubeEier === s);
      if (doblinger < 2 && kan && steg > 20 * (doblinger + 1)) {
        doblinger++;
        r.trekk(s, { doble: 1 });
        assert.equal(sp().tilbud, s);
        continue;
      }
      r.trekk(s, { kast: 1 });
      continue;
    }
    const liste = T.velgTrekk(Int8Array.from(sp().pos), s, sp().rest, 2, rnd).map((m) => [m.f, m.t, m.d]);
    if (liste.length) {
      const n = sp().tur;
      r.trekk(s, { spill: liste.slice(0, -1) }); // not the whole play
      r.trekk(s, { spill: [[25, 1, 1]] }); // nonsense
      r.trekk(1 - s, { spill: liste }); // not your turn
      assert.ok(sp().kast && sp().tur === n);
      delvis = true;
    }
    r.trekk(s, { spill: liste });
  }
  assert.ok(a.def.nett.ferdig(a.S), "the match did not end");
  assert.ok(Math.max(...sp().poeng) >= 3);
  assert.equal(doblinger, 2, "one double taken, one dropped");
  assert.ok(delvis);
  likt(a, b);
  const sen = r.sen(1);
  likt(a, sen, (x) => ({ ...x, ferdig: true }));
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt", "a finished match, replayed: the result");
  const r2 = rom("tavla", 2, { mal: 9 }, 20261115, 2);
  assert.equal(r2.tlf[0].S.spill.mal, 1, "an unknown length: one game");
  likt(r2.tlf[0], r2.tlf[1]);
});

// A seeded chance for the phone players the tests let move.
const tilfeldigFra = (fro) => {
  let x = fro;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
};

test("Hopperen: three phones, one leaves – its pegs go, its turns are skipped – the other two play to the end", () => {
  const { Stjerne, Motor } = regler("hopperen", "Hopperen");
  const r = rom("hopperen", 3, {});
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  const parti = () => Stjerne.spillUt(sp().plasser, sp().forste, sp().trekk, sp().seter);
  assert.equal(sp().plasser, 3);
  assert.deepEqual(somJson(sp().seter), [0, 2, 4]);
  assert.equal(a.def.nett.tur(a.S), 0, "the host begins match 1");
  const forste = Motor.velg(parti(), { niva: 2, tilfeldig: tilfeldigFra(1) });
  r.trekk(1, { m: forste }); // not your turn (and not your peg)
  r.trekk(0, { m: [forste[0], forste[0]] }); // nowhere
  r.trekk(0, { m: "x" });
  r.trekk(0, { m: [forste[0], 200] });
  assert.equal(sp().trekk.length, 0);
  const rnd = tilfeldigFra(7);
  let ute = false;
  for (let steg = 0; steg < 3000 && !a.def.nett.ferdig(a.S); steg++) {
    const p = parti();
    const s = p.tur;
    if (!ute && sp().trekk.length >= 12 && s === 1) {
      r.trekk(1, { $: "borte" }); // seat 1 leaves in the middle of its turn
      r.trekk(1, { $: "borte" }); // (only once)
      ute = true;
      const q = parti();
      assert.equal(Array.from(q.b).filter((x) => x === 1).length, 0, "its pegs are off the board");
      assert.equal(q.tur, 2, "its turn is skipped");
      assert.equal(a.def.nett.tur(a.S), 2);
      continue;
    }
    const m = Motor.velg(p, { niva: 2, tilfeldig: rnd });
    if (ute) r.trekk(1, { m }); // a seat that left plays no more
    const n = sp().trekk.length;
    r.trekk(s, { m });
    assert.equal(sp().trekk.length, n + 1);
    if (ute) assert.notEqual(parti().tur, 1);
  }
  assert.ok(ute && a.def.nett.ferdig(a.S), "the match did not end");
  assert.ok([0, 2].includes(sp().resultat.vinner));
  assert.equal(sp().resultat.grunn, "mal");
  assert.equal(sp().resultat.plass[2], 1, "the seat that left is last");
  likt(a, b);
  likt(a, c);
  const sen = r.sen(2);
  likt(a, sen, (x) => ({ ...x, ferdig: true }));
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt", "a finished match, replayed: the result");
  // Five players: the top point stays empty. Two of three leave: the last one wins.
  assert.deepEqual(somJson(rom("hopperen", 5, {}).tlf[0].S.spill.seter), [0, 1, 2, 4, 5]);
  const r3 = rom("hopperen", 3, {});
  r3.trekk(2, { $: "borte" });
  r3.trekk(0, { $: "borte" });
  assert.deepEqual(somJson(r3.tlf[1].S.spill.resultat), { vinner: 1, grunn: "borte", plass: [1, 0, 2], iMal: [0, 0, 0] });
  assert.ok(r3.tlf[1].def.nett.ferdig(r3.tlf[1].S));
  assert.equal(rom("hopperen", 3, {}, 20261115, 2).tlf[0].S.spill.forste, 1, "match 2: the next seat begins");
});

test("Dobbelsekseren: draw dominoes to 50 for three phones, one leaves mid-round – its tiles go – the others play on", () => {
  const D = regler("dobbelsekseren", "RusjDobbelsekseren");
  const r = rom("dobbelsekseren", 3, { mal: 50, variant: "trekk" });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().n, 3);
  assert.equal(sp().mal, 50);
  assert.deepEqual(somJson(sp().r.hender.map((h) => h.length)), [5, 5, 5], "draw game for three: five each");
  assert.ok(sp().r.krav, "the first round opens with the highest double");
  // One move by the rules, as a player would: the first tile that fits, else draw, else pass.
  const trekk = () => {
    const x = sp().r;
    const lov = D.trekk(x.hender[x.tur], x.rekke, x.krav);
    if (lov.length) return { legg: somJson(x.hender[x.tur][lov[0].i]), side: lov[0].side };
    return sp().variant === "trekk" && x.bunke.length ? { trekk: 1 } : { pass: 1 };
  };
  const t0 = trekk();
  r.trekk((sp().r.tur + 1) % 3, t0); // not your turn
  r.trekk(sp().r.tur, { legg: [7, 7], side: "s" }); // no such tile
  r.trekk(sp().r.tur, { pass: 1 }); // a tile fits: no passing
  r.trekk(sp().r.tur, { trekk: 1 }); // … and no drawing
  r.trekk(sp().r.tur, { runde: 1 }); // the round is not over
  assert.equal(sp().r.logg.length, 0);
  let ute = false;
  let trukket = false;
  for (let steg = 0; steg < 3000 && !a.def.nett.ferdig(a.S); steg++) {
    if (sp().r.resultat) {
      r.trekk(steg % 3, { runde: 1 });
      continue;
    }
    if (!ute && sp().runde === 1 && sp().r.logg.length >= 4) {
      const s = sp().r.tur;
      const i = sp().r.hender[s].length;
      r.trekk(s, { $: "borte" }); // the seat on turn leaves
      ute = true;
      assert.equal(sp().r.hender[s].length, 0);
      assert.equal(sp().r.vekk.length, i, "its tiles left the game");
      assert.notEqual(sp().r.tur, s, "its turn is skipped");
      continue;
    }
    const t = trekk();
    if (t.trekk) trukket = true;
    r.trekk(sp().r.tur, t);
  }
  assert.ok(ute && trukket);
  assert.ok(a.def.nett.ferdig(a.S), "the match did not end");
  assert.ok(Math.max(...sp().poeng) >= 50);
  likt(a, b);
  likt(a, c);
  const sen = r.sen(1);
  likt(a, sen, (x) => ({ ...x, ferdig: true }));
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt", "a finished match, replayed: the result");
  // Block dominoes to 100 for three: the opener leaves at once (any tile opens then); the next
  // round is dealt to the two left, seven each (one round of two cannot reach 100).
  const r4 = rom("dobbelsekseren", 3, { mal: 100, variant: "blokk" });
  const x4 = () => r4.tlf[0].S.spill;
  const aapner = x4().r.tur;
  r4.trekk(aapner, { $: "borte" });
  assert.equal(x4().r.krav, null);
  for (let steg = 0; steg < 200 && !x4().r.resultat; steg++) {
    const x = x4().r;
    const lov = D.trekk(x.hender[x.tur], x.rekke, x.krav);
    assert.notEqual(x.tur, aapner);
    r4.trekk(x.tur, lov.length ? { legg: somJson(x.hender[x.tur][lov[0].i]), side: lov[0].side } : { pass: 1 });
  }
  assert.ok(x4().r.resultat && x4().r.resultat.vinner !== aapner);
  r4.trekk(aapner, { runde: 1 }); // a seat that left taps nothing
  assert.equal(x4().runde, 1);
  r4.trekk((aapner + 1) % 3, { runde: 1 });
  assert.equal(x4().runde, 2);
  assert.deepEqual(somJson(x4().r.hender.map((h) => h.length)), [0, 1, 2].map((s) => (s === aapner ? 0 : 7)));
  likt(r4.tlf[0], r4.tlf[1]);
  likt(r4.tlf[0], r4.sen(2));
  // Block dominoes for two: seven each; a blocked round goes to the lightest hand.
  const r2 = rom("dobbelsekseren", 2, { mal: "en", variant: "blokk" }, 20261115, 2);
  assert.deepEqual(somJson(r2.tlf[0].S.spill.r.hender.map((h) => h.length)), [7, 7]);
  for (let steg = 0; steg < 200 && !r2.tlf[0].def.nett.ferdig(r2.tlf[0].S); steg++) {
    const x = r2.tlf[0].S.spill.r;
    const lov = D.trekk(x.hender[x.tur], x.rekke, x.krav);
    r2.trekk(x.tur, lov.length ? { legg: somJson(x.hender[x.tur][lov[0].i]), side: lov[0].side } : { pass: 1 });
  }
  assert.ok(r2.tlf[0].def.nett.ferdig(r2.tlf[0].S) && r2.tlf[0].S.spill.r.resultat, "«Én runde»: the match is over");
  likt(r2.tlf[0], r2.tlf[1]);
});

test("Meyer: a whole match for three on three phones – the roll is a move, the claim and the answer too; out-of-turn and impossible moves ignored", () => {
  const M = regler("meyer", "RusjMeyer");
  const r = rom("meyer", 3, { liv: 3, felles: true });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  assert.deepEqual(somJson(sp().liv), [3, 3, 3]);
  assert.equal(sp().tur, 0, "the host begins match 1");
  r.trekk(1, { rist: 1 }); // not your turn
  r.trekk(0, { meld: "64" }); // nothing rolled yet
  assert.equal(sp().fase, "rist");
  let loftet = 0;
  let trodd = 0;
  for (let steg = 0; steg < 2000 && sp().vinner == null; steg++) {
    const s = sp();
    if (s.fase === "rist") {
      r.trekk(s.tur, { rist: 1 });
      assert.equal(s.fase, "skjult");
      assert.ok(s.kast.every((x) => x >= 1 && x <= 6));
      continue;
    }
    if (s.fase === "skjult") {
      const lov = M.lovlige(s.melding && s.melding.v, s.felles);
      const ekte = M.verdi(s.kast[0], s.kast[1]);
      r.trekk(s.tur, { meld: "99" }); // no such value
      r.trekk((s.tur + 1) % 3, { meld: lov[0] }); // not yours to say
      r.trekk(s.tur, { meld: lov.includes(ekte) ? ekte : lov.filter((v) => v !== M.FELLES).at(-1) || lov[0] });
      assert.equal(s.fase, "svar");
      continue;
    }
    if (s.fase === "svar") {
      const sv = M.svarer(s);
      r.trekk(s.tur, { svar: "loft" }); // the claimer cannot answer
      if (s.melding.v === M.MEYER) r.trekk(sv, { svar: "tro" }); // Meyer cannot be believed
      const valg = s.melding.v === M.MEYER ? "godta" : steg % 3 === 0 ? "tro" : "loft";
      r.trekk(sv, { svar: valg });
      if (valg === "loft") loftet++;
      if (valg === "tro") trodd++;
      continue;
    }
    r.trekk((s.starter + 1) % 3, { runde: 1 }); // only the one who begins
    r.trekk(s.starter, { runde: 1 });
  }
  assert.ok(sp().vinner != null, "nobody won");
  assert.ok(loftet && trodd);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.tur(a.S), null);
  r.trekk(sp().tur, { rist: 1 }); // after the end: ignored
  likt(a, b, (x) => ({ ...x, valgt: null }));
  likt(a, c, (x) => ({ ...x, valgt: null }));
  const sen = r.sen(1);
  likt(a, sen, (x) => ({ ...x, ferdig: true, valgt: null }));
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt", "a finished match, replayed: the result");
  assert.equal(rom("meyer", 3, {}, 20261115, 2).tlf[0].S.spill.tur, 1, "match 2: the next seat begins");
  assert.equal(rom("meyer", 2, {}).tlf[0].S.spill.maksLiv, 6);
});

test("Meyer: a seat that leaves is out, the next one takes the cup, and the last one standing wins", () => {
  const r = rom("meyer", 3, { liv: 6 });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  r.trekk(0, { rist: 1 });
  r.trekk(0, { meld: "41" });
  r.trekk(1, { svar: "tro" });
  r.trekk(1, { rist: 1 });
  assert.equal(sp().tur, 1);
  assert.equal(sp().fase, "skjult");
  r.borte(1); // B leaves with the dice under its cup: C must beat 41 from a fresh roll
  assert.equal(sp().liv[1], 0);
  assert.equal(sp().tur, 2);
  assert.equal(sp().fase, "rist");
  assert.equal(sp().melding.v, "41");
  assert.equal(a.def.nett.tur(a.S), 2);
  r.trekk(1, { rist: 1 }); // gone: ignored
  assert.equal(sp().fase, "rist");
  r.trekk(2, { rist: 1 });
  r.trekk(2, { meld: "21" });
  assert.equal(a.def.nett.tur(a.S), 0, "A answers C, past B");
  likt(a, c, (x) => ({ ...x, valgt: null }));
  r.borte(2); // one left: A wins
  assert.equal(sp().vinner, 0);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.deepEqual(somJson(sp().forlot), [1, 2]);
  const sen = r.sen(0);
  likt(a, sen, (x) => ({ ...x, ferdig: true, valgt: null }));
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt");
});

// Elefanten's player: turns the first card it has not seen, then its mate – or, every third move, a
// card that is not the mate (a miss). Returns false when nothing was turned.
function elefantTrekk(r, steg, p = r.tlf[0]) {
  const sp = p.S.spill;
  const tur = sp.tur;
  const fri = sp.kort.map((_, i) => i).filter((i) => sp.funnet[i] < 0 && !sp.opp.includes(i));
  if (!sp.opp.length) {
    r.trekk(tur, { snu: fri[0] });
    return true;
  }
  const a = sp.opp[0];
  const make = fri.find((i) => sp.kort[i] === sp.kort[a]);
  const bom = fri.find((i) => sp.kort[i] !== sp.kort[a]);
  r.trekk(tur, { snu: steg % 3 === 0 && bom != null ? bom : make });
  return true;
}

test("Elefanten: a whole board for two on two phones – the same deal, a pair gives another turn, taken and foreign cards ignored", () => {
  const r = rom("elefanten", 2, { tema: "dyr", kort: 12, kikk: false });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  assert.equal(sp().kort.length, 14, "two players: an odd number of pairs (12 → 14 cards)");
  assert.deepEqual(somJson(sp().kort), somJson(b.S.spill.kort), "the same deal on both phones");
  assert.equal(sp().tur, 0);
  r.trekk(1, { snu: 0 }); // not your turn
  r.trekk(0, { snu: 14 }); // no such card
  r.trekk(0, { snu: "1" });
  assert.equal(sp().opp.length, 0);
  let ekstra = false;
  let bom = false;
  for (let steg = 0; steg < 200 && !sp().ferdig; steg++) {
    const tur = sp().tur;
    const par = sp().poeng.reduce((s, p) => s + p, 0);
    if (sp().opp.length) r.trekk(tur, { snu: sp().opp[0] }); // the card already up
    elefantTrekk(r, steg);
    if (sp().poeng.reduce((s, p) => s + p, 0) > par && sp().tur === tur) ekstra = true;
    if (sp().tur !== tur) bom = true;
  }
  assert.ok(sp().ferdig, "the board was not cleared");
  assert.ok(ekstra && bom);
  assert.equal(sp().poeng[0] + sp().poeng[1], 7);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  likt(a, b);
  likt(a, r.sen(1));
  const r2 = rom("elefanten", 2, { tema: "dyr", kort: 12 }, 20261115, 2);
  assert.equal(r2.tlf[0].S.spill.tur, 1, "match 2: the guest begins");
  assert.notDeepEqual(somJson(rom("elefanten", 2, { tema: "dyr", kort: 12 }, 7).tlf[0].S.spill.kort), somJson(sp().kort), "another seed, another deal");
  assert.equal(rom("elefanten", 4, { tema: "mat", kort: 24 }).tlf[0].S.spill.kort.length, 24);
});

test("Elefanten: level at the top – a tie-break board from the room's chance; a seat that leaves is skipped and cannot win", () => {
  const r = rom("elefanten", 3, { tema: "dyr", kort: 12 });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().kort.length, 12);
  // A finds three pairs, misses; B finds three pairs: level at 3 – 3 – 0, a tie-break for A and B.
  const finn = (sete) => {
    const s = sp();
    const i = s.kort.findIndex((k, n) => s.funnet[n] < 0);
    const j = s.kort.findIndex((k, n) => n !== i && s.funnet[n] < 0 && k === s.kort[i]);
    r.trekk(sete, { snu: i });
    r.trekk(sete, { snu: j });
  };
  const bom = (sete) => {
    const s = sp();
    const i = s.kort.findIndex((k, n) => s.funnet[n] < 0);
    const j = s.kort.findIndex((k, n) => s.funnet[n] < 0 && k !== s.kort[i]);
    r.trekk(sete, { snu: i });
    r.trekk(sete, { snu: j });
  };
  finn(0);
  finn(0);
  finn(0);
  bom(0);
  assert.equal(sp().tur, 1);
  finn(1);
  finn(1);
  const forBrett = somJson(sp().kort);
  finn(1);
  assert.equal(sp().omkamp, 1, "level at the top: a tie-break");
  assert.deepEqual(somJson(sp().med), [0, 1]);
  assert.equal(sp().kort.length, 6, "two share the lead: three new pairs");
  assert.notDeepEqual(somJson(sp().kort), forBrett);
  assert.equal(a.def.nett.skjerm(a.S), "omkamp");
  likt(a, b);
  likt(a, c);
  r.trekk(2, { snu: 0 }); // C is not in the tie-break
  assert.equal(sp().opp.length, 0);
  r.trekk(0, { snu: 0 });
  assert.equal(a.def.nett.skjerm(a.S), "spill");
  r.borte(0); // A leaves the tie-break: B is the last one in it, and wins
  assert.ok(b.S.spill.ferdig);
  assert.deepEqual(somJson(b.S.spill.ute), [0]);
  likt(b, c);
  likt(b, r.sen(2));

  // Three play on after one leaves: the turn skips the seat.
  const r3 = rom("elefanten", 3, { tema: "dyr", kort: 12 });
  const s3 = () => r3.tlf[1].S.spill; // (B: A leaves)
  r3.trekk(0, { snu: 0 });
  r3.borte(0); // A leaves with a card up: it goes back, B's turn
  assert.equal(s3().tur, 1);
  assert.equal(s3().opp.length, 0);
  assert.ok(!s3().ferdig);
  r3.trekk(0, { snu: 1 }); // gone: ignored
  assert.equal(s3().opp.length, 0);
  for (let steg = 0; steg < 200 && !s3().ferdig; steg++) {
    assert.notEqual(s3().tur, 0, "the seat that left got the turn");
    if (s3().omkamp && s3().med) assert.ok(!s3().med.includes(0));
    elefantTrekk(r3, steg, r3.tlf[1]);
  }
  assert.ok(s3().ferdig);
  likt(r3.tlf[1], r3.tlf[2]);
  likt(r3.tlf[1], r3.sen(2));
});

// Tidsmaskinen's events in the game's order (files in name order), to know where a card belongs.
const HENDELSER = (() => {
  const d = spillData("tidsmaskinen");
  return Object.keys(d)
    .filter((n) => n.startsWith("hendelser-"))
    .sort()
    .flatMap((n) => d[n]);
})();
// The gaps of the timeline where a card fits (as the game's luker).
const riktigeLuker = (linje, kort) => {
  const a = HENDELSER[kort].a;
  const ut = [];
  for (let g = 0; g <= linje.length; g++) if ((g === 0 || HENDELSER[linje[g - 1]].a <= a) && (g === linje.length || HENDELSER[linje[g]].a >= a)) ut.push(g);
  return ut;
};

test("Tidsmaskinen: first to 5 for three on three phones – the same deck, «Sjekk året» and «Neste» are moves, the last round is played out", () => {
  const r = rom("tidsmaskinen", 3, { kategorier: ["sport", "kultur"], niva: "blandet", mal: 5 });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().mal, 5);
  assert.deepEqual(somJson(sp().filter.kategorier), ["sport", "kultur"]);
  assert.ok(sp().linjer.every((l) => l.length === 1));
  assert.deepEqual(somJson(sp().linjer), somJson(b.S.spill.linjer), "the same first cards on every phone");
  assert.ok([...sp().brukt].every((k) => ["sport", "kultur"].includes(HENDELSER[k].k)));
  assert.equal(sp().tur, 0);
  r.trekk(1, { sjekk: 0 }); // not your turn
  r.trekk(0, { sjekk: 5 }); // no such gap
  r.trekk(0, { neste: 1 }); // the year is not checked yet
  assert.equal(sp().fase, "plasser");
  let feil = false;
  for (let steg = 0; steg < 400 && !sp().ferdig; steg++) {
    const s = sp();
    const tur = s.tur;
    const lov = riktigeLuker(s.linjer[tur], s.kort);
    const galt = Array.from({ length: s.linjer[tur].length + 1 }, (_, g) => g).find((g) => !lov.includes(g));
    const g = steg % 4 === 3 && galt != null ? galt : lov[0];
    r.trekk(tur, { sjekk: g });
    assert.equal(s.fase, "svar");
    assert.equal(s.svar.riktig, lov.includes(g));
    if (!s.svar.riktig) feil = true;
    r.trekk(tur, { sjekk: g }); // only once
    r.trekk((tur + 1) % 3, { neste: 1 }); // not yours
    r.trekk(tur, { neste: 1 });
  }
  assert.ok(sp().ferdig, "nobody reached 5");
  assert.ok(feil);
  assert.ok(sp().vinnere.length && sp().vinnere.every((i) => sp().linjer[i].length >= 5));
  assert.equal(new Set(sp().forsok).size, 1, "the round was played to the end: everyone had as many tries");
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  likt(a, b, (x) => ({ ...x, plass: null }));
  likt(a, c, (x) => ({ ...x, plass: null }));
  likt(a, r.sen(2), (x) => ({ ...x, plass: null }));
  const r2 = rom("tidsmaskinen", 3, { mal: 7 }, 20261115, 2);
  assert.equal(r2.tlf[0].S.spill.tur, 1, "match 2: the next seat begins");
  assert.equal(r2.tlf[0].S.spill.mal, 7);
  assert.equal(r2.tlf[0].S.spill.filter.kategorier.length, a.S.spill.filter.kategorier.length + 4, "no categories given: all of them");
});

test("Tidsmaskinen: a seat that leaves is skipped (its card is put aside), and is not ranked", () => {
  const r = rom("tidsmaskinen", 4, { mal: 5 });
  const [, b, , d] = r.tlf;
  const sp = () => b.S.spill;
  const riktig = (sete) => r.trekk(sete, { sjekk: riktigeLuker(sp().linjer[sete], sp().kort)[0] });
  riktig(0);
  r.trekk(0, { neste: 1 });
  assert.equal(sp().tur, 1);
  const kort = sp().kort;
  r.borte(0); // A leaves, not on its turn: nothing else changes
  assert.equal(sp().tur, 1);
  assert.equal(sp().kort, kort);
  riktig(1);
  r.trekk(1, { neste: 1 });
  assert.equal(sp().tur, 2);
  const cKort = sp().kort;
  r.borte(2); // C leaves on its turn: its card is put aside, D draws
  assert.equal(sp().tur, 3);
  assert.notEqual(sp().kort, cKort);
  assert.ok(sp().brukt.includes(cKort));
  assert.equal(sp().fase, "plasser");
  riktig(3);
  r.trekk(3, { neste: 1 });
  assert.equal(sp().tur, 1, "past A");
  assert.equal(sp().runde, 2);
  r.trekk(0, { sjekk: 0 }); // gone: ignored
  assert.equal(sp().fase, "plasser");
  likt(b, d, (x) => ({ ...x, plass: null }));
  likt(b, r.sen(3), (x) => ({ ...x, plass: null }));
  r.borte(3); // one left: the match is over, B wins (A and C are not ranked)
  assert.ok(sp().ferdig);
  assert.deepEqual(somJson(sp().vinnere), [1]);
  assert.equal(b.def.nett.ferdig(b.S), true);
});

// Tieren's cards in the game's order, and one player's move: the right answer for the first open
// item – wrong every fifth time, and «Stopp» with two in the pot.
const TIKORT = (() => {
  const d = spillData("tieren");
  return Object.keys(d)
    .filter((n) => n.startsWith("kort-"))
    .sort()
    .flatMap((n) => d[n]);
})();
function tierTrekk(r, steg, p = r.tlf[0]) {
  const sp = p.S.spill;
  const tur = sp.tur;
  if (sp.pott[tur] >= 2) return r.trekk(tur, { stopp: 1 });
  const kort = TIKORT[sp.kort[sp.runde]];
  const pos = sp.apne.findIndex((x) => !x);
  const fasit = String(kort.a[sp.ring[pos]][1]);
  const valg = kort.t === "ja" ? ["true", "false"] : kort.t === "gruppe" ? kort.v : kort.t === "rekke" ? kort.a.map((_, n) => String(n + 1)) : [...new Set(kort.a.map((x) => String(x[1])))];
  const feil = valg.find((v) => v !== fasit);
  r.trekk(tur, { pos, svar: steg % 5 === 4 && feil ? feil : fasit });
}

test("Tieren: three rounds for three on three phones – the same cards and rings, answers and «Stopp» are moves, the last round ends the match", () => {
  const r = rom("tieren", 3, { kategorier: ["mat", "sport"], niva: "blandet", runder: 3 });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().runder, 3);
  assert.ok(sp().kort.every((k) => ["mat", "sport"].includes(TIKORT[k].k)));
  assert.deepEqual(somJson(sp().ring), somJson(c.S.spill.ring), "the same ring on every phone");
  assert.equal(sp().tur, 0);
  r.trekk(1, { pos: 0, svar: "true" }); // not your turn
  r.trekk(0, { pos: 10, svar: "true" }); // no such place
  r.trekk(0, { pos: 0, svar: "tull" }); // no such answer
  r.trekk(0, { stopp: 1 }); // nothing in the pot
  assert.ok(sp().apne.every((x) => !x));
  let rok = false;
  let stoppet = false;
  for (let steg = 0; steg < 400 && !a.def.nett.ferdig(a.S); steg++) {
    if (sp().fase === "ferdig") {
      const neste = a.def.nett.tur(a.S);
      assert.equal(neste, (sp().runde + 1) % 3, "the next seat begins the next round");
      r.trekk((neste + 1) % 3, { runde: sp().runde + 1 }); // not the one who begins
      r.trekk(neste, { runde: sp().runde + 5 }); // not the next round
      assert.equal(sp().fase, "ferdig");
      r.trekk(neste, { runde: sp().runde + 1 });
      assert.equal(sp().fase, "velg");
      assert.equal(sp().tur, neste);
      continue;
    }
    const st = sp().status.slice();
    tierTrekk(r, steg);
    if (sp().status.some((s, i) => s === "ute" && st[i] !== "ute")) rok = true;
    if (sp().status.some((s, i) => s === "stopp" && st[i] !== "stopp")) stoppet = true;
  }
  assert.ok(a.def.nett.ferdig(a.S));
  assert.ok(rok && stoppet);
  assert.equal(sp().logg.length, 3);
  assert.equal(a.def.nett.tur(a.S), null);
  assert.equal(a.def.nett.skjerm(a.S), "slutt", "(replayed: the result; live, the last answers show first, then «Til kåringen»)");
  likt(a, b, (x) => ({ ...x, valgt: null }));
  likt(a, c, (x) => ({ ...x, valgt: null }));
  const sen = r.sen(1);
  assert.ok(sen.S.spill.ferdig && sen.def.nett.skjerm(sen.S) === "slutt", "a finished match, replayed: the result");
  const topp = Math.max(...sen.S.spill.sum);
  assert.deepEqual(somJson(sen.S.spill.vinnere), somJson(sen.S.spill.sum.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0)));
  assert.equal(rom("tieren", 3, {}, 20261115, 2).tlf[0].S.spill.tur, 1, "match 2: the next seat begins");
});

test("Tieren: a seat that leaves loses its pot, is skipped in this round and the next, and is not ranked", () => {
  const r = rom("tieren", 3, { runder: 3 });
  const [a, b, c] = r.tlf;
  const sp = () => b.S.spill;
  tierTrekk(r, 0, b); // A answers right: 1 in the pot, B's turn
  assert.equal(sp().pott[0], 1);
  assert.equal(sp().tur, 1);
  r.borte(0);
  assert.equal(sp().status[0], "borte");
  assert.equal(sp().pott[0], 0);
  tierTrekk(r, 0, b); // B
  assert.equal(sp().tur, 2);
  tierTrekk(r, 0, b); // C
  assert.equal(sp().tur, 1, "past A");
  r.trekk(0, { stopp: 1 }); // gone: ignored
  likt(b, c, (x) => ({ ...x, valgt: null }));
  r.borte(1); // B leaves on its turn: one left, the match is over (C's points count, A's and B's not)
  assert.ok(c.S.spill.ferdig);
  assert.ok(c.S.spill.vinnere.every((i) => i === 2));
  // Four seats: one leaves between rounds, the round after skips it.
  const r4 = rom("tieren", 4, { runder: 3 });
  const s4 = () => r4.tlf[2].S.spill;
  for (let steg = 0; steg < 100 && s4().fase === "velg"; steg++) tierTrekk(r4, steg, r4.tlf[2]);
  assert.equal(s4().fase, "ferdig");
  r4.borte(1); // the one who begins round 2
  assert.equal(r4.tlf[2].def.nett.tur(r4.tlf[2].S), 2, "round 2 begins with the next seat still in");
  r4.trekk(2, { runde: 1 });
  assert.equal(s4().status[1], "borte");
  for (let steg = 0; steg < 400 && !r4.tlf[2].def.nett.ferdig(r4.tlf[2].S); steg++) {
    if (s4().fase === "ferdig") {
      r4.trekk(r4.tlf[2].def.nett.tur(r4.tlf[2].S), { runde: s4().runde + 1 });
      continue;
    }
    assert.notEqual(s4().tur, 1);
    tierTrekk(r4, steg, r4.tlf[2]);
  }
  likt(r4.tlf[0], r4.tlf[2], (x) => ({ ...x, valgt: null }));
  const sen = r4.sen(3);
  assert.ok(sen.S.spill.ferdig);
  assert.ok(!sen.S.spill.vinnere.includes(1), "the seat that left is not ranked");
  assert.ok(sen.S.spill.status.every((s, i) => i !== 1 || s === "borte"));
});

test("Vri åtter: a whole match «først til 3» on two phones, then three where one leaves – the same cards everywhere", () => {
  const { Vri, Mobil } = regler("vriatter", "VriAtter");
  // One move for the seat whose turn it is, as a player would choose it (the phone's own player).
  const steg = (r, sp) => {
    const rr = sp.r;
    const p = rr.venter != null ? rr.venter : rr.tur;
    if (rr.venter != null) return r.trekk(p, { s: 1 });
    const v = Mobil.velg(rr, p, 2, () => 0.5);
    if (v.type === "legg") return r.trekk(p, { k: v.k });
    return r.trekk(p, v.type === "trekk" ? { trekk: 1 } : { pass: 1 });
  };
  const r = rom("vriatter", 2, { mal: "tre", toer: true });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().n, 2);
  assert.equal(sp().toer, true);
  assert.equal(sp().r.tur, 0, "the host begins match 1");
  assert.equal(sp().r.hender[0].length, 7);
  assert.deepEqual(somJson(a.S.spill.r.hender), somJson(b.S.spill.r.hender), "the same deal on both phones");
  const hand = sp().r.hender[0].slice();
  r.trekk(1, { trekk: 1 }); // not your turn
  r.trekk(0, { k: sp().r.hender[1][0] }); // not your card
  r.trekk(0, { k: 52 });
  r.trekk(0, { s: 2 }); // no eight to turn
  r.trekk(0, { runde: 2 }); // the round is not over
  r.trekk(0, "legg");
  assert.deepEqual(sp().r.hender[0], hand);
  assert.equal(sp().r.tur, 0);
  let atter = false;
  let runder = 0;
  for (let i = 0; i < 4000 && !a.def.nett.ferdig(a.S); i++) {
    if (sp().r.vinner != null) {
      runder++;
      r.trekk(1, { runde: sp().runde + 2 }); // the wrong round
      const n = sp().runde;
      r.trekk(1, { runde: n + 1 });
      r.trekk(0, { runde: n + 1 }); // the second one: ignored
      assert.equal(sp().runde, n + 1);
      continue;
    }
    if (sp().r.venter != null) atter = true;
    steg(r, sp());
  }
  assert.ok(a.def.nett.ferdig(a.S), "the match did not end");
  assert.ok(Math.max(...sp().poeng) === 3 && runder >= 2, "first to three rounds");
  assert.ok(atter, "no eight was played");
  likt(a, b);
  const sen = r.sen(1);
  likt(a, sen, (x) => ({ ...x, ferdig: false }));
  assert.ok(sen.S.spill.ferdig && sen.def.nett.skjerm(sen.S) === "slutt", "a finished match, replayed: the result");
  r.trekk(0, { runde: sp().runde + 1 }); // after the end: ignored
  assert.equal(sp().runde, sen.S.spill.runde);
  assert.equal(rom("vriatter", 3, {}, 20261115, 2).tlf[0].S.spill.r.tur, 1, "match 2: the next seat begins");

  // Three phones; the second seat leaves mid-round (on its own turn): its cards go under the
  // pile, the turn passes on, it is skipped and dealt no more; the other two play to the end.
  const r3 = rom("vriatter", 3, { mal: "poeng" });
  const [x, y, z] = r3.tlf;
  const sp3 = () => x.S.spill;
  assert.equal(sp3().r.hender[1].length, 5);
  for (let i = 0; i < 200 && sp3().r.tur !== 1; i++) steg(r3, sp3());
  const igjen = sp3().r.hender[1].length;
  const bunke = sp3().r.bunke.length;
  r3.borte(1);
  assert.deepEqual(somJson(sp3().ute), [1]);
  assert.equal(sp3().r.hender[1].length, 0);
  assert.equal(sp3().r.bunke.length, bunke + igjen, "the hand went under the top card");
  assert.notEqual(sp3().r.tur, 1, "the turn passed on");
  r3.trekk(1, { trekk: 1 }); // a seat that left: ignored
  r3.borte(1); // twice: nothing more
  for (let i = 0; i < 8000 && !x.def.nett.ferdig(x.S); i++) {
    if (sp3().r.vinner != null) {
      assert.notEqual(sp3().r.vinner, 1);
      r3.trekk(2, { runde: sp3().runde + 1 });
      assert.equal(sp3().r.hender[1].length, 0, "no cards for a seat that left");
      assert.equal(sp3().r.hender[0].length, 7, "two left: seven each");
      continue;
    }
    assert.notEqual(x.def.nett.tur(x.S), 1, "a seat that left never has the turn");
    steg(r3, sp3());
  }
  assert.ok(x.def.nett.ferdig(x.S) && Math.max(...sp3().poeng) >= 100, "the two did not finish");
  assert.equal(new Set([].concat(...sp3().r.hender, sp3().r.stokk, sp3().r.bunke)).size, 52, "every card still once");
  likt(x, y);
  likt(x, z);
  likt(x, r3.sen(2), (s) => ({ ...s, ferdig: false }));
  assert.ok(typeof Vri.nesteSete === "function");
});

test("Narren: a whole game for two on two phones – swaps, plays, pick-ups and blind cards as moves, the rest ignored", () => {
  const { Idiot, Mobil } = regler("narren", "Narren");
  // The phone player's choice as a move ({ l: cards } | { ned: i } | { ta: 1 }).
  const narrTrekk = (Mobil, r, p) => {
    const v = Mobil.velg(r, p, 2, () => 0);
    return v.type === "legg" ? { l: v.kort } : v.type === "blind" ? { ned: v.i } : { ta: 1 };
  };
  const r = rom("narren", 2, { fire: true, sju: false, atter: true });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  const g = () => sp().r;
  assert.equal(sp().modus, "nett");
  assert.deepEqual(somJson(g().regler), { fire: true, sju: false, atter: true });
  assert.equal(g().giver, 1, "match 1: the guest deals, the host sits first");
  assert.equal(g().fase, "bytte");
  assert.equal(a.def.nett.tur(a.S), 0, "while swapping it is everyone's turn at once");
  assert.equal(b.def.nett.tur(b.S), 1);
  likt(a, b);
  // Swapping: one's own hand and open cards only, and only until done.
  const [h, o] = [g().hender[0][0], g().opp[0][0]];
  r.trekk(0, { b: [g().hender[1][0], o] }); // not on seat 0's hand
  r.trekk(0, { b: [h, g().ned[0][0]] }); // a hidden card
  r.trekk(0, { b: [h] });
  r.trekk(0, { l: [h] }); // no playing before everyone is done
  assert.equal(g().hender[0][0], h);
  r.trekk(0, { b: [h, o] });
  assert.ok(g().opp[0].includes(h) && g().hender[0].includes(o), "the swap");
  r.trekk(0, { klar: 1 });
  r.trekk(0, { b: [o, h] }); // done: no more swaps
  assert.ok(g().opp[0].includes(h));
  assert.equal(a.def.nett.tur(a.S), 1, "the host waits for the guest");
  r.trekk(1, { klar: 1 });
  assert.equal(g().fase, "spill");
  assert.equal(g().tur, Idiot.starter(g()), "the lowest card begins");
  const sett = new Set();
  for (let steg = 0; steg < 600 && g().fase === "spill"; steg++) {
    const tur = g().tur;
    const t = narrTrekk(Mobil, somJson(g()), tur);
    const n = g().trekk;
    r.trekk(1 - tur, t); // not your turn
    r.trekk(tur, { l: [g().hender[1 - tur][0] ?? 99] }); // not your card
    r.trekk(tur, { ned: 3 });
    r.trekk(tur, { l: "7" });
    if (!t.ta) r.trekk(tur, { ta: 1 }); // something fits: no picking up
    assert.equal(g().trekk, n, "an illegal move was played");
    r.trekk(tur, t);
    assert.equal(g().trekk, n + 1);
    for (const x of g().logg) sett.add(x.type);
    if (t.ta) sett.add("ta");
    if (t.ned != null) sett.add("blind");
  }
  assert.equal(g().fase, "slutt", "the game did not end");
  assert.ok(sett.has("ta") && sett.has("blind") && sett.has("brent"), [...sett].join());
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.tur(a.S), null);
  assert.ok(g().narr === 0 || g().narr === 1);
  assert.ok(Idiot.hel(g()));
  r.trekk(g().tur, { ta: 1 }); // after the end: ignored
  likt(a, b);
  const sen = r.sen(1);
  likt(a, sen);
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt");
  const r2 = rom("narren", 2, {}, 20261115, 2);
  assert.equal(r2.tlf[0].S.spill.r.giver, 0, "match 2: the dealer moves one seat on");
  assert.equal(r2.tlf[0].S.spill.r.regler.fire, true, "four alike burns by default");
  assert.notDeepEqual(somJson(r2.tlf[0].S.spill.r.hender), somJson(rom("narren", 2, {}, 20261116, 2).tlf[0].S.spill.r.hender), "another seed, another deal");
});

test("Narren: three phones – a seat that leaves is skipped and its cards go out of play; the two others play on", () => {
  const { Idiot, Mobil } = regler("narren", "Narren");
  const narrTrekk = (Mobil, r, p) => {
    const v = Mobil.velg(r, p, 2, () => 0);
    return v.type === "legg" ? { l: v.kort } : v.type === "blind" ? { ned: v.i } : { ta: 1 };
  };
  const r = rom("narren", 3, { fire: true, sju: true, atter: false });
  const [a, b, c] = r.tlf;
  const g = () => a.S.spill.r;
  for (const s of [0, 1, 2]) r.trekk(s, { klar: 1 });
  for (let steg = 0; steg < 12; steg++) r.trekk(g().tur, narrTrekk(Mobil, somJson(g()), g().tur));
  assert.equal(g().fase, "spill");
  // The seat whose turn it is leaves: the turn passes on, its cards are out of play.
  const borte = g().tur;
  const hadde = Idiot.antallIgjen(g(), borte);
  const brent = g().brent.length;
  r.borte(borte);
  assert.deepEqual(somJson(g().borte), [borte]);
  assert.notEqual(g().tur, borte);
  assert.equal(Idiot.antallIgjen(g(), borte), 0);
  assert.equal(g().brent.length, brent + hadde);
  assert.ok(Idiot.hel(g()), "every card still once");
  r.borte(borte); // twice: nothing more
  for (let steg = 0; steg < 600 && g().fase === "spill"; steg++) {
    const tur = g().tur;
    assert.notEqual(tur, borte, "the seat that left got a turn");
    const n = g().trekk;
    r.trekk(borte, { ta: 1 }); // the seat that left: ignored
    r.trekk(borte, narrTrekk(Mobil, somJson(g()), tur));
    assert.equal(g().trekk, n);
    r.trekk(tur, narrTrekk(Mobil, somJson(g()), tur));
  }
  assert.equal(g().fase, "slutt");
  assert.ok(!g().ute.includes(borte) && g().narr !== borte, "the seat that left is not placed");
  assert.equal(g().ute.length + 1, 3 - 1);
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(0));

  // Leaving while the others swap: the seat counts as done.
  const r2 = rom("narren", 3, {});
  r2.trekk(0, { klar: 1 });
  r2.borte(1);
  assert.equal(r2.tlf[0].S.spill.r.fase, "bytte");
  r2.trekk(2, { klar: 1 });
  assert.equal(r2.tlf[0].S.spill.r.fase, "spill");
  assert.notEqual(r2.tlf[0].S.spill.r.tur, 1);
  likt(r2.tlf[0], r2.tlf[2]);

  // One is out already and one of the two left leaves: the game is over, nobody is the fool.
  const r3 = rom("narren", 3, {});
  const g3 = () => r3.tlf[0].S.spill.r;
  for (const s of [0, 1, 2]) r3.trekk(s, { klar: 1 });
  for (let steg = 0; steg < 600 && !g3().ute.length; steg++) r3.trekk(g3().tur, narrTrekk(Mobil, somJson(g3()), g3().tur));
  assert.equal(g3().ute.length, 1);
  const igjen = Idiot.levende(g3());
  r3.borte(igjen[0]);
  assert.equal(g3().fase, "slutt");
  assert.equal(g3().narr, null);
  assert.deepEqual(somJson(g3().ute.slice(1)), [igjen[1]]);
  assert.ok(r3.tlf[1].def.nett.ferdig(r3.tlf[1].S));
  likt(r3.tlf[0], r3.tlf[1]);
  likt(r3.tlf[0], r3.sen(2));
});

// Samleren: one whole turn of seat p as moves, chosen by the game's own phone player (Middels) on a
// copy of the round: { trekk } / { ta } / { avsla } / { stopp }, then { ut } / { til, m } / { kast } / { bank }.
function samlerenTur(Mobil, sp, rng) {
  const r = JSON.parse(JSON.stringify(sp.r));
  const p = r.tur;
  if (r.fase !== "spill") {
    const v = Mobil.velgTrekk(r, p, 2, rng);
    if (v.type === "trekk") return [{ trekk: 1 }];
    if (v.type === "ta") return [{ ta: v.i == null ? r.bunke.length - 1 : v.i }];
    return [{ [v.type]: 1 }];
  }
  const logg = r.logg; // the turn's own list (kept even when the round ends on an empty stock)
  const gjort = logg.length; // (what this turn did already)
  assert.ok(Mobil.spillResten(r, p, 2, rng), "the phone player found no way to finish the turn");
  const ut = [];
  for (const h of logg.slice(gjort)) {
    if (h.type === "meld") ut.push({ ut: h.kort });
    else if (h.type === "til") ut.push({ til: h.kort, m: h.mi });
    else if (h.type === "kast") ut.push({ kast: h.k });
    else if (h.type === "bank") ut.push({ bank: h.k });
  }
  return ut;
}
// Plays the match in room r to the end (or until stopp(sp) says so); every move must change the state.
function samlerenKamp(r, Mobil, { stopp, sjekk } = {}) {
  const a = r.tlf[0];
  const sp = () => a.S.spill;
  let x = 1;
  const rng = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let steg = 0; steg < 4000 && !a.def.nett.ferdig(a.S); steg++) {
    if (stopp && stopp(sp())) return;
    if (sp().r.fase === "slutt") {
      r.trekk(0, { runde: sp().runde + 2 }); // not the next round: ignored
      r.trekk(sp().ute.includes(1) ? 2 : 1, { runde: sp().runde + 1 });
      continue;
    }
    const tur = sp().r.tur;
    if (sjekk) sjekk(sp());
    for (const t of samlerenTur(Mobil, somJson(sp()), rng)) {
      const for_ = JSON.stringify(sp());
      r.trekk(tur, t);
      assert.notEqual(JSON.stringify(sp()), for_, `a legal move was ignored: ${JSON.stringify(t)}`);
      if (sp().r.fase === "slutt") break;
    }
  }
}

test("Samleren: classic rummy to 100 for three phones – the same deal everywhere, illegal moves ignored", () => {
  const { Rummy, Mobil } = regler("samleren", "Samleren");
  const r = rom("samleren", 3, { variant: "klassisk", mal: "100" });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().n, 3);
  assert.equal(sp().variant, "klassisk");
  assert.equal(sp().mal, "100");
  assert.equal(sp().r.tur, 0, "the host begins match 1");
  assert.equal(sp().r.hender[0].length, 7);
  assert.ok(Rummy.hel(sp().r));
  likt(a, b);
  const uendret = (sete, t) => {
    const for_ = JSON.stringify(sp());
    r.trekk(sete, t);
    assert.equal(JSON.stringify(sp()), for_, `ignored: ${sete} ${JSON.stringify(t)}`);
  };
  uendret(1, { trekk: 1 }); // not your turn
  uendret(0, { kast: sp().r.hender[0][0] }); // draw first
  uendret(0, { ta: 1 }); // no such card in the pile
  uendret(0, { ta: -1 });
  uendret(0, { runde: 2 }); // the round is not over
  uendret(0, { trekk: "1" });
  uendret(0, [1]);
  uendret(9, { trekk: 1 });
  r.trekk(0, { trekk: 1 });
  const hand = sp().r.hender[0];
  uendret(0, { trekk: 1 }); // drawn already
  uendret(0, { ut: hand.slice(0, 3).concat(99) });
  uendret(0, { kast: sp().r.hender[1][0] }); // not in this hand
  uendret(0, { til: [hand[0]], m: 7 }); // no such meld
  uendret(0, { bank: hand[0] }); // not gin
  let runder = 0;
  samlerenKamp(r, Mobil, { sjekk: (x) => (runder = x.runde) });
  assert.ok(a.def.nett.ferdig(a.S), "the match did not end");
  assert.ok(Math.max(...sp().poeng) >= 100);
  assert.ok(runder >= 2, "only one round");
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(1));
  assert.equal(rom("samleren", 3, {}, 20261115, 2).tlf[0].S.spill.r.tur, 1, "match 2: the next seat begins");
});

test("Samleren: gin rummy for two and 500 – knocks, the deep pile, the same state on a late phone", () => {
  const { Mobil } = regler("samleren", "Samleren");
  const gin = rom("samleren", 2, { variant: "gin", mal: "100" });
  assert.equal(gin.tlf[0].S.spill.variant, "gin");
  assert.equal(gin.tlf[0].S.spill.r.fase, "tilbud");
  samlerenKamp(gin, Mobil);
  const g = gin.tlf[0].S.spill;
  assert.ok(gin.tlf[0].def.nett.ferdig(gin.tlf[0].S));
  assert.ok(Math.max(...g.poeng) >= 100);
  likt(gin.tlf[0], gin.tlf[1]);
  likt(gin.tlf[0], gin.sen(0));
  // Gin is for two: with three it is classic rummy (and the lobby says so).
  const tre = rom("samleren", 3, { variant: "gin", mal: "100" }).tlf[0];
  assert.equal(tre.S.spill.variant, "klassisk");
  assert.equal(tre.S.spill.r.hender[2].length, 7);
  assert.match(tre.def.nett.oppsettTekst({ variant: "gin", mal: "100" }), /Gin rummy · Først til 100 · Med flere enn to/);
  assert.equal(rom("samleren", 2, { variant: "x", mal: "999" }).tlf[0].S.spill.variant, "klassisk", "an unknown variant: classic");
  const fem = rom("samleren", 2, { variant: "500", mal: "250" });
  let dypt = false;
  samlerenKamp(fem, Mobil, { sjekk: (x) => (dypt = dypt || x.r.tatte.some((t) => t.length > 1)) });
  assert.ok(fem.tlf[0].def.nett.ferdig(fem.tlf[0].S));
  assert.ok(Math.max(...fem.tlf[0].S.spill.poeng) >= 250);
  assert.ok(dypt, "nobody took from deep in the pile");
  likt(fem.tlf[0], fem.tlf[1]);
  likt(fem.tlf[0], fem.sen(1));
});

test("Samleren: a phone leaves a match for three mid-turn – its cards go under the stock, the other two finish", () => {
  const { Rummy, Mobil } = regler("samleren", "Samleren");
  const r = rom("samleren", 3, { variant: "klassisk", mal: "100" });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  // Play until seat 1 has drawn in its second turn, then it leaves.
  samlerenKamp(r, Mobil, { stopp: (x) => x.r.turer >= 4 && x.r.tur === 1 });
  r.trekk(1, { trekk: 1 });
  assert.equal(sp().r.fase, "spill");
  const kort = sp().r.hender[1].length;
  const stokk = sp().r.stokk.length;
  const poeng = sp().poeng[1];
  r.borte(1);
  assert.deepEqual(somJson(sp().ute), [1]);
  assert.equal(sp().r.hender[1].length, 0);
  assert.equal(sp().r.stokk.length, stokk + kort, "its hand went under the stock");
  assert.equal(sp().r.tur, 2, "the turn went on");
  assert.equal(sp().r.fase, "trekk");
  assert.ok(Rummy.hel(sp().r), "every card is still there once");
  r.borte(1); // twice: nothing more
  const for_ = JSON.stringify(sp());
  r.trekk(1, { trekk: 1 });
  r.trekk(1, { runde: sp().runde + 1 });
  assert.equal(JSON.stringify(sp()), for_, "a seat that left cannot move");
  samlerenKamp(r, Mobil, { sjekk: (x) => assert.notEqual(x.r.tur, 1, "the seat that left got a turn") });
  assert.ok(a.def.nett.ferdig(a.S), "the two did not finish");
  assert.equal(sp().poeng[1], poeng, "its points stay as they were");
  assert.ok(sp().runde >= 2 && sp().r.hender[1].length === 0, "a new round dealt it no cards");
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(2));
  // Leaving when it is not one's turn: only the hand goes.
  const r2 = rom("samleren", 4, { variant: "500", mal: "500" });
  r2.borte(3);
  assert.equal(r2.tlf[0].S.spill.r.tur, 0);
  assert.equal(r2.tlf[0].S.spill.r.hender[3].length, 0);
  likt(r2.tlf[0], r2.sen(3));
});

// (Pusen: the state each phone keeps, without what only one phone sees: the line about the last
// move is said from each seat, «Du» on its own phone.)
const pusenFelt = (x) => ({ ...x, logg: null, valgt: -1 });
const pusenKort = (sp) => sp.r.hender.flat().length + 2 * sp.r.par.flat().length;

test("Pusen: Svarteper for two and three on as many phones – a card from the next hand is the move, the cat ends it", () => {
  const { KATT, Svarte } = regler("pusen", "Pusen");
  for (const antall of [2, 3]) {
    const r = rom("pusen", antall, { modus: "svarte" });
    const [a, b] = r.tlf;
    const sp = () => a.S.spill;
    assert.equal(sp().modus, "svarte");
    assert.equal(sp().n, antall);
    assert.equal(sp().mot, "nett");
    const kort = pusenKort(sp());
    assert.equal(kort, Svarte.kortstokk(antall).length, "the whole deck is dealt");
    for (let steg = 0; steg < 400 && !sp().ferdig; steg++) {
      const tur = a.def.nett.tur(a.S);
      assert.equal(tur, sp().r.tur);
      const q = Svarte.fra(sp().r, tur);
      const for_ = JSON.stringify(sp().r);
      r.trekk((tur + 1) % antall, { k: 0 }); // not your turn
      r.trekk(tur, { k: sp().r.hender[q].length }); // no such card
      r.trekk(tur, { k: "0" });
      r.trekk(tur, { k: -1 });
      r.trekk(tur, { kort: 0 });
      assert.equal(JSON.stringify(sp().r), for_, "an illegal draw changed the table");
      r.trekk(tur, { k: steg % sp().r.hender[q].length });
      assert.notEqual(JSON.stringify(sp().r), for_);
      assert.equal(pusenKort(sp()), kort, "the cards add up");
    }
    assert.ok(sp().ferdig && a.def.nett.ferdig(a.S), "the game did not end");
    const taper = sp().r.taper;
    assert.deepEqual(somJson(sp().r.hender[taper]), [KATT], "the last one holds the cat");
    assert.equal(sp().resultat.plass.at(-1), taper);
    assert.equal(sp().resultat.plass.length, antall);
    assert.equal(a.def.nett.tur(a.S), null);
    assert.equal(a.def.nett.skjerm(a.S), "slutt");
    r.trekk(taper, { k: 0 }); // after the end: ignored
    for (const p of r.tlf.slice(1)) likt(a, p, pusenFelt);
    const sen = r.sen(1);
    likt(b, sen);
    assert.equal(sen.def.nett.skjerm(sen.S), "slutt");
  }
  assert.equal(rom("pusen", 3, { modus: "svarte" }, 20261115, 2).tlf[0].S.spill.r.tur, 1, "match 2: the next seat begins");
});

test("Pusen: Fisk for two and three – asking is the move, the answer follows from the cards; foreign and impossible questions ignored", () => {
  const { art, Fisk } = regler("pusen", "Pusen");
  for (const antall of [2, 3]) {
    const r = rom("pusen", antall, { modus: "fisk" }, 20261116);
    const [a, b] = r.tlf;
    const sp = () => a.S.spill;
    assert.equal(sp().modus, "fisk");
    let fikk = false;
    let fisket = false;
    for (let steg = 0; steg < 600 && !sp().ferdig; steg++) {
      const p = a.def.nett.tur(a.S);
      const rr = sp().r;
      const hand = rr.hender[p];
      const andre = rr.hender.map((h, i) => i).filter((i) => i !== p && rr.hender[i].length);
      // Half the time a question the other one can answer, else the first animal at hand.
      const treff = andre.flatMap((q) => hand.filter((k) => rr.hender[q].some((x) => art(x) === art(k))).map((k) => ({ q, a: art(k) })));
      const v = steg % 2 && treff.length ? treff[0] : { q: andre[0], a: art(hand[0]) };
      const mangler = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((x) => !hand.some((k) => art(k) === x));
      const for_ = JSON.stringify(rr);
      r.trekk(v.q, { q: p, a: v.a }); // not your turn
      r.trekk(p, { q: p, a: v.a }); // yourself
      r.trekk(p, { q: antall, a: v.a }); // no such seat
      if (mangler != null) r.trekk(p, { q: v.q, a: mangler }); // an animal you don't hold
      r.trekk(p, { q: v.q, a: String(v.a) });
      assert.equal(JSON.stringify(sp().r), for_, "an illegal question changed the table");
      r.trekk(p, v);
      assert.notEqual(JSON.stringify(sp().r), for_);
      if (sp().sistSpurt.fikk) fikk = true;
      else fisket = true;
      const alleKort = sp().r.hender.flat().length + sp().r.dam.length + 4 * sp().r.sett.flat().length;
      assert.equal(alleKort, 40, "the cards add up");
    }
    assert.ok(sp().ferdig && a.def.nett.ferdig(a.S), "the game did not end");
    assert.ok(fikk && fisket);
    assert.ok(Fisk.ferdig(sp().r) || Fisk.fast(sp().r));
    assert.deepEqual(somJson(sp().resultat.poeng), somJson(sp().r.sett.map((x) => x.length)));
    for (const p of r.tlf.slice(1)) likt(a, p, pusenFelt);
    likt(b, r.sen(1));
  }
});

test("Pusen: Størst vinner for two – both tap «Snu!», then the cards turn; with three seats it is Svarteper", () => {
  const r = rom("pusen", 2, { modus: "krig", lengde: "lang" });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "krig");
  assert.equal(sp().r.hender[0].length + sp().r.hender[1].length, 40, "«20 kort hver» from the host's settings");
  let like = false;
  for (let steg = 0; steg < 200 && !sp().ferdig; steg++) {
    const for_ = JSON.stringify(sp().r);
    const forste = steg % 2;
    r.trekk(forste, { snu: 1 });
    assert.equal(a.def.nett.tur(a.S), 1 - forste, "the one who has not tapped");
    assert.equal(b.def.nett.tur(b.S), 1 - forste);
    r.trekk(forste, { snu: 1 }); // once is enough
    r.trekk(forste, { snu: 2 });
    assert.equal(JSON.stringify(sp().r), for_, "the cards turned before both had tapped");
    r.trekk(1 - forste, { snu: 1 });
    assert.notEqual(JSON.stringify(sp().r), for_);
    assert.deepEqual(somJson(sp().klar), [false, false]);
    if (sp().r.sist.runder.length > 1) like = true;
    assert.equal(sp().r.hender[0].length + sp().r.hender[1].length + sp().r.vunnet[0] + sp().r.vunnet[1], 40);
  }
  assert.ok(sp().ferdig && a.def.nett.ferdig(a.S), "the game did not end");
  assert.ok(like, "never the same size");
  r.trekk(0, { snu: 1 }); // after the end: ignored
  likt(a, b, pusenFelt);
  likt(b, r.sen(1));
  assert.equal(rom("pusen", 2, { modus: "krig" }).tlf[0].S.spill.r.hender[0].length, 10, "«10 kort hver»");
  assert.equal(rom("pusen", 3, { modus: "krig" }).tlf[0].S.spill.modus, "svarte", "Størst vinner is for two");
});

test("Pusen: Snapp is never played on the net – the room plays Svarteper and the lobby says so", () => {
  for (const modus of ["snap", "tull", undefined]) assert.equal(rom("pusen", 2, { modus }).tlf[0].S.spill.modus, "svarte", String(modus));
  const { def, S } = telefon("pusen", 0);
  S.oppsett.modus = "snap";
  assert.deepEqual(somJson(def.nett.oppsett(S)), { modus: "snap", lengde: "kort" });
  assert.match(def.nett.oppsettTekst({ modus: "snap" }), /Svarteper.*Snapp kan ikke spilles på nett/);
  assert.equal(def.nett.oppsettTekst({ modus: "fisk" }), "Fisk");
  assert.match(def.nett.oppsettTekst({ modus: "krig", lengde: "lang" }), /Størst vinner · 20 kort hver/);
  S.oppsett.modus = "fisk";
  assert.deepEqual(somJson(def.nett.oppsett(S)), { modus: "fisk", lengde: "kort" }, "the host's game only – no level, no phone players");
});

test("Pusen: a player leaves Svarteper for three – the cards go to the next one still in, the cat stays, the two finish", () => {
  const { KATT, Svarte } = regler("pusen", "Pusen");
  const r = rom("pusen", 3, { modus: "svarte" }, 20261117);
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  const kort = pusenKort(sp());
  for (let i = 0; i < 3; i++) r.trekk(sp().r.tur, { k: 0 });
  // The seat whose turn it is leaves: the turn goes on, its cards to the next one still in.
  const borte = sp().r.tur;
  const hand = sp().r.hender[borte].length;
  assert.ok(hand > 0);
  r.borte(borte);
  assert.deepEqual(somJson(sp().borte), [borte]);
  assert.equal(sp().r.hender[borte].length, 0);
  assert.equal(pusenKort(sp()), kort, "no card is lost");
  assert.ok(sp().r.hender.some((h) => h.includes(KATT)), "the cat is still in the game");
  assert.notEqual(sp().r.tur, borte);
  assert.ok(!sp().ferdig);
  r.borte(borte); // twice: nothing more
  assert.deepEqual(somJson(sp().borte), [borte]);
  for (let steg = 0; steg < 300 && !sp().ferdig; steg++) {
    const tur = sp().r.tur;
    assert.notEqual(tur, borte, "the one who left got a turn");
    const for_ = JSON.stringify(sp().r);
    r.trekk(borte, { k: 0 }); // from the seat that left: ignored
    assert.equal(JSON.stringify(sp().r), for_);
    r.trekk(tur, { k: 0 });
    assert.equal(sp().r.hender[borte].length, 0);
  }
  assert.ok(sp().ferdig, "the two did not finish");
  assert.deepEqual(somJson(sp().resultat.plass).sort(), [0, 1, 2].filter((i) => i !== borte), "the one who left is not ranked");
  assert.ok(sp().r.taper !== borte && sp().r.hender[sp().r.taper].includes(KATT));
  likt(a, b, pusenFelt);
  likt(a, c, pusenFelt);
  likt(b, r.sen(1));

  // One left with cards when another leaves: the match is over, and the one with the cat has it.
  const r2 = rom("pusen", 3, { modus: "svarte" }, 20261118);
  const sp2 = () => r2.tlf[0].S.spill;
  for (let steg = 0; steg < 300 && !sp2().ferdig && Svarte.aktive(sp2().r).length > 2; steg++) r2.trekk(sp2().r.tur, { k: 0 });
  assert.equal(Svarte.aktive(sp2().r).length, 2, "nobody got out");
  const [x, y] = Svarte.aktive(sp2().r);
  r2.borte(x);
  assert.ok(sp2().ferdig, "a game of one went on");
  assert.equal(sp2().r.taper, y);
  assert.deepEqual(somJson(sp2().r.hender[y]), [KATT]);
  assert.ok(!sp2().resultat.plass.includes(x));
  likt(r2.tlf[1], r2.sen(1));
});

test("Pusen: a player leaves Fisk for three – the cards go back into the pond, nobody deals to the empty seat, the two finish", () => {
  const { art } = regler("pusen", "Pusen");
  const r = rom("pusen", 3, { modus: "fisk" }, 20261119);
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  const alleKort = () => sp().r.hender.flat().length + sp().r.dam.length + 4 * sp().r.sett.flat().length;
  const spor = () => {
    const rr = sp().r;
    const p = rr.tur;
    const q = rr.hender.map((h, i) => i).find((i) => i !== p && rr.hender[i].length);
    r.trekk(p, { q, a: art(rr.hender[p][0]) });
  };
  for (let i = 0; i < 4; i++) spor();
  const borte = (sp().r.tur + 1) % 3;
  const for_ = sp().r.dam.length + sp().r.hender[borte].length;
  r.borte(borte);
  assert.equal(sp().r.hender[borte].length, 0);
  assert.equal(sp().r.dam.length, for_, "the cards went back into the pond");
  assert.equal(alleKort(), 40);
  for (let steg = 0; steg < 600 && !sp().ferdig; steg++) {
    assert.notEqual(sp().r.tur, borte, "the one who left got a turn");
    const naa = JSON.stringify(sp().r);
    r.trekk(sp().r.tur, { q: borte, a: art(sp().r.hender[sp().r.tur][0]) }); // asking the one who left: ignored
    assert.equal(JSON.stringify(sp().r), naa);
    spor();
    assert.equal(sp().r.hender[borte].length, 0, "the empty seat was dealt a card");
    assert.equal(alleKort(), 40);
  }
  assert.ok(sp().ferdig, "the two did not finish");
  likt(a, b, pusenFelt);
  likt(a, c, pusenFelt);
  likt(a, r.sen(0));
  assert.equal(rom("pusen", 3, { modus: "fisk" }, 20261115, 3).tlf[0].S.spill.r.tur, 2, "match 3: the third seat begins");
});

// Golfballen: the phone player's choice for the seat whose turn it is, as a move on the net.
function golfTrekk(Mobil, sp, rnd) {
  const r = sp.r;
  const v = Mobil.velg(somJson(r), r.tur, 2, rnd);
  if (v.type === "startsnu") return { start: [v.i] };
  if (["bytt", "snu"].includes(v.type)) return { [v.type]: v.i };
  return { [v.type]: 1 };
}

test("Golfballen: five holes of six-card golf on two phones – the same deal, out-of-turn and impossible moves ignored", () => {
  const { Mobil } = regler("golfballen", "Golfballen");
  const r = rom("golfballen", 2, { var: "seks", hull: 5, toer: false, snu: true });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  assert.equal(sp().n, 2);
  assert.equal(sp().hull, 5);
  assert.deepEqual(somJson(sp().regler), { toer: false, snu: true });
  assert.equal(sp().r.tur, 0, "the host begins match 1");
  assert.deepEqual(somJson(a.S.spill.r.rutenett), somJson(b.S.spill.r.rutenett), "the same deal on both phones");
  const uendret = (sete, t, hva) => {
    const for_ = JSON.stringify(sp());
    r.trekk(sete, t);
    assert.equal(JSON.stringify(sp()), for_, hva);
  };
  uendret(0, { trekk: 1 }, "draw before turning two cards");
  uendret(0, { start: [0, 0] }, "the same card twice");
  uendret(0, { start: [0, 1, 2] }, "three cards");
  uendret(1, { start: [0] }, "not your turn");
  uendret(0, { hull: 2 }, "the next hole in the middle of one");
  uendret(0, "trekk", "not an object");
  r.trekk(0, { start: [0, 4] });
  assert.equal(sp().r.startSnudd[0], 2, "two cards turned in one move");
  uendret(0, { start: [1] }, "a third card at the start");
  let rnd = 7;
  const tilf = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  let hull = 0;
  let snu = false;
  for (let steg = 0; steg < 4000 && !a.def.nett.ferdig(a.S); steg++) {
    const tur = a.def.nett.tur(a.S);
    if (tur == null) {
      // The hole is over: whoever taps first deals the next one; a second tap is ignored.
      hull++;
      r.trekk(1, { hull: sp().hullNr + 1 });
      uendret(0, { hull: sp().hullNr }, "the same hole dealt twice");
      continue;
    }
    uendret(1 - tur, { trekk: 1 }, "not your turn");
    uendret(tur, { bytt: 6 }, "no position 6");
    if (sp().r.hand == null) uendret(tur, { kast: 1 }, "nothing to throw");
    const t = golfTrekk(Mobil, sp(), tilf);
    if (t.snu != null) snu = true;
    const for_ = JSON.stringify(sp().r);
    r.trekk(tur, t);
    assert.notEqual(JSON.stringify(sp().r), for_, `the robot's move ${JSON.stringify(t)} was refused`);
  }
  assert.ok(a.def.nett.ferdig(a.S), "the match did not end");
  assert.equal(hull, 4);
  assert.ok(sp().poeng.every((x) => x.length === 5));
  assert.ok(snu, "the house rule «turn after a throw» was never used");
  uendret(0, { hull: 6 }, "after the last hole");
  likt(a, b);
  const sen = r.sen(1);
  likt(a, sen);
  assert.equal(sen.def.nett.skjerm(sen.S), "slutt");
  assert.equal(rom("golfballen", 2, {}, 20261115, 2).tlf[0].S.spill.r.tur, 1, "match 2: the guest begins");
  assert.equal(rom("golfballen", 2, { hull: 4 }).tlf[0].S.spill.hull, 9, "an unknown number of holes: nine");
});

test("Golfballen: four-card golf for three phones – one leaves mid-turn, the other two play the match out", () => {
  const { Mobil } = regler("golfballen", "Golfballen");
  const r = rom("golfballen", 3, { var: "fire", hull: 5, toer: true });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().var, "fire");
  let rnd = 11;
  const tilf = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  let borte = false;
  for (let steg = 0; steg < 6000 && !a.def.nett.ferdig(a.S); steg++) {
    const tur = a.def.nett.tur(a.S);
    if (tur == null) {
      r.trekk(borte ? 0 : 2, { hull: sp().hullNr + 1 });
      continue;
    }
    if (borte) assert.notEqual(tur, 2, "the seat that left got a turn");
    if (!borte && sp().hullNr === 2 && tur === 2 && sp().r.tittet[2] && sp().r.hand == null) {
      r.trekk(2, { trekk: 1 });
      const kort = sp().r.hand;
      assert.ok(kort != null);
      r.borte(2);
      borte = true;
      assert.deepEqual(somJson(sp().ute), [2]);
      assert.equal(sp().r.hand, null, "the card in hand stays with the seat that left");
      assert.equal(sp().r.kast.at(-1), kort, "the card in hand goes on the discards");
      assert.ok(sp().r.fase === "ferdig" || sp().r.tur === 0, "the turn did not pass on");
      const for_ = JSON.stringify(sp());
      r.trekk(2, { trekk: 1 });
      r.trekk(2, { hull: 3 });
      assert.equal(JSON.stringify(sp()), for_, "a move from the seat that left is ignored");
      continue;
    }
    r.trekk(tur, golfTrekk(Mobil, sp(), tilf));
  }
  assert.ok(borte, "nobody left");
  assert.ok(a.def.nett.ferdig(a.S), "the match did not end");
  assert.ok(sp().poeng.every((x) => x.length === 5));
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(0));

  // Leaving during «one more turn each»: the knock still ends the hole after the turns that are left.
  const r2 = rom("golfballen", 3, { var: "fire", hull: 1 });
  const sp2 = () => r2.tlf[0].S.spill;
  r2.trekk(0, { titt: 1 });
  r2.trekk(0, { bank: 1 });
  assert.equal(sp2().r.tur, 1);
  r2.borte(1);
  assert.equal(sp2().r.tur, 2, "the knock: the seat that left is skipped");
  r2.trekk(2, { titt: 1 });
  r2.trekk(2, { trekk: 1 });
  r2.trekk(2, { kast: 1 });
  assert.equal(sp2().r.fase, "ferdig", "the hole ends after the last one still in");
  assert.ok(r2.tlf[0].def.nett.ferdig(r2.tlf[0].S));
  assert.deepEqual(somJson(sp2().poeng.map((x) => x.length)), [1, 1, 1]);
  likt(r2.tlf[0], r2.tlf[2]);
  likt(r2.tlf[0], r2.sen(2));
  // Fewer than two left (the room ends such a match itself): over on every phone.
  const r3 = rom("golfballen", 3, { var: "seks", hull: 5 });
  r3.borte(2);
  r3.borte(1);
  assert.ok(r3.tlf[0].S.spill.ferdig && r3.tlf[0].def.nett.ferdig(r3.tlf[0].S));
});

// ---------- The free-text games: everyone writes on their own phone ----------

// What R.nett.tekst makes of a long answer with control and direction characters.
const SKITTEN = "Bananer\u0000 i‮ pyjamas\n " + "x".repeat(80);
const REN = "Bananer i pyjamas " + "x".repeat(42);
const SKRIPT = "<script>window.__x=1</script>";
const BILDE = '<img src=x onerror="window.__x=2">';

test("Brevduen: three phones – answers cleaned and hidden until all are in, the room's order, everyone points, the leader goes on; illegal moves ignored", () => {
  const r = rom("brevduen", 3, { runder: 3 });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  assert.equal(sp().fase, "skriv");
  assert.equal(sp().r.leder, 0, "the host leads match 1");
  assert.equal(a.def.nett.skjerm(a.S), "n-skriv");
  const k0 = sp().r.k;
  r.trekk(1, { bytt: 1 }); // only the leader takes another question
  assert.equal(sp().r.k, k0);
  r.trekk(0, { bytt: 1 });
  assert.notEqual(sp().r.k, k0);
  const k = sp().r.k;
  r.trekk(0, { svar: SKITTEN, k });
  assert.equal(sp().r.svar[0], REN, "cleaned when it is played");
  r.trekk(0, { svar: "igjen", k }); // twice
  r.trekk(0, { bytt: 1 }); // someone has written: no other question now
  r.trekk(1, { svar: " \u0007 ", k }); // nothing left after cleaning
  r.trekk(1, { svar: "gammelt", k: k0 }); // the question before
  r.trekk(1, { svar: 42, k }); // not text
  r.trekk(7, { svar: "x", k }); // no such seat
  r.trekk(1, { pek: 0, v: 0 }); // not the time for pointing
  assert.equal(sp().r.k, k);
  assert.deepEqual(somJson(sp().r.svar), [REN, null, null]);
  assert.equal(b.def.nett.tur(b.S), 1, "my turn while I haven't written");
  r.trekk(1, { svar: SKRIPT, k });
  assert.equal(sp().fase, "skriv", "not shown before everyone is in");
  r.trekk(2, { svar: BILDE, k });
  assert.equal(sp().fase, "pek");
  assert.deepEqual(somJson(sp().r.svar), [REN, SKRIPT, BILDE], "kept as text: the screens escape it");
  assert.deepEqual(somJson(sp().r.rekke.slice().sort()), [0, 1, 2]);
  let runder = 1;
  let lurt = 0;
  let riktig = 0;
  for (let steg = 0; steg < 200 && !sp().ferdig; steg++) {
    const s = sp();
    if (s.fase === "skriv") {
      if (s.r.svar.every((x) => x == null)) {
        runder++;
        assert.equal(s.r.leder, s.runde % 3, "one seat on per round");
      }
      for (let i = 0; i < 3; i++) r.trekk(i, { svar: `Svar ${s.runde}-${i}`, k: s.r.k });
      continue;
    }
    if (s.fase === "pek") {
      const v = s.r.vis;
      const forfatter = s.r.rekke[v];
      r.trekk(0, { pek: 0, v }); // never myself
      r.trekk(1, { pek: 0, v: v + 1 }); // another answer
      r.trekk(1, { pek: 9, v }); // no such seat
      assert.equal(s.fase, "pek");
      for (let i = 0; i < 3; i++) {
        const andre = [0, 1, 2].filter((x) => x !== i);
        const gjett = i !== forfatter && (steg + i) % 2 === 0 ? forfatter : andre.find((x) => x !== forfatter);
        r.trekk(i, { pek: gjett, v });
        if (i < 2) assert.equal(s.fase, "pek", "the author stays hidden until everyone has pointed");
      }
      assert.equal(s.fase, "fasit");
      assert.equal(s.r.siste.forfatter, forfatter);
      if (s.r.siste.riktige.length) riktig++;
      if (s.r.siste.lurte) lurt++;
      continue;
    }
    const leder = s.r.leder;
    r.trekk((leder + 1) % 3, { neste: s.steg }); // only the leader goes on
    r.trekk(leder, { neste: s.steg + 1 }); // an old tap
    assert.equal(s.fase, "fasit");
    r.trekk(leder, { neste: s.steg });
  }
  assert.ok(sp().ferdig && a.def.nett.ferdig(a.S));
  assert.equal(runder, 3);
  assert.equal(sp().vist, 9, "every answer of every round was shown");
  assert.ok(riktig && lurt, `riktig ${riktig}, lurt ${lurt}`);
  assert.equal(sp().poeng.reduce((x, y) => x + y, 0), 9 * 2, "each answer gives out one point per other player");
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  assert.equal(a.def.nett.tur(a.S), null);
  r.trekk(0, { svar: "for sent", k: sp().r.k }); // after the end
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(2));
  assert.equal(rom("brevduen", 3, {}, 20261115, 2).tlf[0].S.spill.r.leder, 1, "match 2: the next seat leads");
  assert.equal(rom("brevduen", 3, {}).tlf[0].S.spill.runder, 3);
  const voksen = rom("brevduen", 4, { voksen: true, runder: 5 }).tlf[0].S.spill;
  assert.ok(voksen.stokk.length > rom("brevduen", 4, { runder: 5 }).tlf[0].S.spill.stokk.length, "18+ questions only with the host's setting");
});

test("Brevduen: five phones – a seat that leaves is never waited for, its answers go (also the one being guessed), the next one leads", () => {
  const r = rom("brevduen", 5, { runder: 3 });
  const [a, , , , e] = r.tlf;
  const sp = () => a.S.spill;
  const k = sp().r.k;
  r.trekk(2, { svar: "Seat two", k });
  r.trekk(0, { svar: "Seat zero", k });
  r.borte(2); // wrote, then left: the answer goes
  assert.equal(sp().r.svar[2], null);
  assert.equal(sp().fase, "skriv");
  r.trekk(2, { svar: "back again", k }); // gone: ignored
  r.trekk(1, { svar: "Seat one", k });
  r.trekk(3, { svar: "Seat three", k });
  assert.equal(sp().fase, "skriv");
  r.trekk(4, { svar: "Seat four", k });
  assert.equal(sp().fase, "pek", "the seat that left is not waited for");
  assert.deepEqual(somJson(sp().r.rekke.slice().sort()), [0, 1, 3, 4]);
  // The author of the answer being guessed leaves: that answer goes, the next one comes up.
  const v = sp().r.vis;
  const forfatter = sp().r.rekke[v];
  const andre = [0, 1, 3, 4].filter((i) => i !== forfatter);
  r.trekk(andre[0], { pek: andre[1], v });
  r.borte(forfatter);
  assert.equal(sp().fase, "pek");
  assert.equal(sp().r.rekke.length, 3);
  assert.ok(!sp().r.rekke.includes(forfatter));
  assert.deepEqual(somJson(sp().r.pek), [null, null, null, null, null], "the guesses start again");
  const inne = andre;
  for (let steg = 0; steg < 200 && !sp().ferdig; steg++) {
    const s = sp();
    assert.ok(!s.ute.includes(a.def.nett.tur(a.S)), "never the turn of a seat that left");
    if (s.fase === "skriv") for (const i of inne) r.trekk(i, { svar: `Svar ${i}`, k: s.r.k });
    else if (s.fase === "pek") for (const i of inne) r.trekk(i, { pek: inne.find((x) => x !== i), v: s.r.vis });
    else r.trekk(s.r.leder, { neste: s.steg });
  }
  assert.ok(sp().ferdig);
  assert.equal(sp().ute.length, 2);
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  likt(a, e);
  likt(a, r.sen(0));
  // The leader leaves after a reveal: the next seat still in leads.
  const r2 = rom("brevduen", 4, { runder: 3 });
  const s2 = () => r2.tlf[1].S.spill;
  for (let i = 0; i < 4; i++) r2.trekk(i, { svar: `Svar ${i}`, k: s2().r.k });
  for (let i = 0; i < 4; i++) r2.trekk(i, { pek: (i + 1) % 4, v: 0 });
  assert.equal(s2().fase, "fasit");
  r2.borte(0);
  assert.equal(s2().r.leder, 1);
  r2.trekk(1, { neste: s2().steg });
  assert.equal(s2().fase, "pek");
  // Fewer than three left (the room ends such a match itself): over on every phone.
  const r3 = rom("brevduen", 3, {});
  r3.borte(1);
  assert.ok(r3.tlf[0].def.nett.ferdig(r3.tlf[0].S));
});

// Skrønemakeren's cards in the game's order (the same as window.RusjSkrone sees them).
function skroneKort(p) {
  const ut = [];
  p.window.RUSJ_DATA.kort.pakker.forEach((pk) => pk.kort.forEach((k) => ut.push(k)));
  return ut;
}

test("Skrønemakeren: three phones – fakes and votes as moves, the truth gives a bonus, equal fakes merge, the leader reveals; illegal moves ignored", () => {
  const r = rom("skronemakeren", 3, { runder: 3 });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  const M = a.window.RusjSkrone;
  const KORT = skroneKort(a);
  assert.equal(sp().modus, "nett");
  assert.equal(sp().fase, "skriv");
  assert.equal(sp().r.leder, 0);
  const kort0 = sp().kort;
  r.trekk(2, { bytt: 1 }); // not the leader
  assert.equal(sp().kort, kort0);
  r.trekk(0, { bytt: 1 });
  const kort = sp().kort;
  assert.notEqual(kort, kort0);
  // Seat 1 writes the real answer: the bonus, and another fake to write.
  r.trekk(1, { skrone: KORT[kort].a, kort });
  assert.equal(sp().r.sann[1], true);
  assert.equal(sp().r.skrevet[1], null);
  r.trekk(0, { bytt: 1 }); // someone has written: no other card now
  assert.equal(sp().kort, kort);
  r.trekk(0, { skrone: "En diger fisk", kort });
  r.trekk(0, { skrone: "igjen", kort }); // twice
  r.trekk(2, { skrone: "!!!", kort }); // no letters
  r.trekk(2, { skrone: "x", kort: kort0 }); // the card before
  r.trekk(2, { skrone: "diger fisk", kort }); // the same fake: merged with seat 0's
  assert.equal(sp().fase, "skriv", "not before everyone has written");
  r.trekk(1, { skrone: SKITTEN, kort });
  assert.equal(sp().fase, "stem");
  const r1 = sp().r;
  assert.equal(r1.valg.length, 3, "two fakes (one merged) and the truth");
  const sann = M.sannIndeks(r1.valg);
  const felles = r1.valg.findIndex((v) => v.av.includes(0));
  const ener = r1.valg.findIndex((v) => v.av.includes(1));
  assert.deepEqual(somJson(r1.valg[felles].av), [0, 2]);
  assert.equal(r1.valg[ener].t, REN, "cleaned when it is played");
  assert.deepEqual(somJson(r1.srekke), [0, 2], "the one who wrote the truth sits out the vote");
  r.trekk(1, { stem: sann, rn: 0 }); // sits out
  r.trekk(0, { stem: felles, rn: 0 }); // its own fake
  r.trekk(0, { stem: sann, rn: 1 }); // another round
  r.trekk(0, { stem: 9, rn: 0 }); // no such option
  assert.equal(sp().fase, "stem");
  r.trekk(0, { stem: sann, rn: 0 });
  r.trekk(0, { stem: ener, rn: 0 }); // twice
  r.trekk(2, { stem: ener, rn: 0 });
  assert.equal(sp().fase, "avslor");
  assert.deepEqual(somJson(sp().poeng), [M.SANN, M.BONUS + M.LURT, 0]);
  // The reveal: the leader only, one tap per option, then the points.
  const rekke = M.avslorRekke(sp().r);
  r.trekk(1, { neste: sp().steg });
  assert.equal(sp().r.vist, 0);
  for (let n = 1; n <= rekke.length; n++) {
    r.trekk(0, { neste: sp().steg });
    assert.equal(sp().r.vist, n);
  }
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().fase, "resultat");
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().rn, 1);
  assert.equal(sp().r.leder, 1, "one seat on per round");
  for (let steg = 0; steg < 300 && !sp().ferdig; steg++) {
    const s = sp();
    const r0 = s.r;
    if (s.fase === "skriv") for (let i = 0; i < 3; i++) r.trekk(i, { skrone: `Skrøne ${s.rn} nr ${i}`, kort: s.kort });
    else if (s.fase === "stem") for (const i of r0.srekke) r.trekk(i, { stem: r0.valg.findIndex((v) => !v.av.includes(i)), rn: s.rn });
    else r.trekk(r0.leder, { neste: s.steg });
  }
  assert.ok(sp().ferdig && a.def.nett.ferdig(a.S));
  assert.equal(sp().spilt, 3);
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(1));
  assert.equal(rom("skronemakeren", 3, {}, 20261115, 2).tlf[0].S.spill.r.leder, 1, "match 2: the next seat leads");
});

test("Skrønemakeren: five phones – a seat that leaves is never waited for, its fake goes before the vote, the next one leads", () => {
  const r = rom("skronemakeren", 5, { runder: 3 });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  const kort = sp().kort;
  r.trekk(3, { skrone: "Noe helt annet", kort });
  r.borte(3); // wrote, then left: the fake goes
  r.trekk(0, { skrone: "Første skrøne", kort });
  r.trekk(1, { skrone: "Andre skrøne", kort });
  r.trekk(2, { skrone: "Tredje skrøne", kort });
  assert.equal(sp().fase, "skriv");
  r.trekk(4, { skrone: "Fjerde skrøne", kort });
  assert.equal(sp().fase, "stem");
  assert.equal(sp().r.valg.length, 5, "four fakes and the truth – not the fake of the seat that left");
  assert.deepEqual(somJson(sp().r.srekke), [0, 1, 2, 4]);
  const sann = sp().r.valg.findIndex((v) => v.sann);
  r.trekk(1, { stem: sann, rn: 0 });
  r.trekk(2, { stem: sann, rn: 0 });
  r.trekk(4, { stem: sann, rn: 0 });
  r.borte(0); // the leader leaves before voting: not waited for, and the next seat leads
  assert.equal(sp().fase, "avslor");
  assert.equal(sp().r.leder, 1);
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().r.vist, 0, "a seat that left cannot move");
  const inne = [1, 2, 4];
  for (let steg = 0; steg < 300 && !sp().ferdig; steg++) {
    const s = sp();
    assert.ok(!s.ute.includes(a.def.nett.tur(a.S)));
    if (s.fase === "skriv") for (const i of inne) r.trekk(i, { skrone: `Skrøne ${s.rn} ${i}`, kort: s.kort });
    else if (s.fase === "stem") for (const i of s.r.srekke) r.trekk(i, { stem: s.r.valg.findIndex((v) => v.sann), rn: s.rn });
    else r.trekk(s.r.leder, { neste: s.steg });
  }
  assert.ok(sp().ferdig);
  assert.equal(sp().spilt, 3);
  likt(a, b);
  likt(a, r.sen(2));
  // Fewer than three left (the room ends such a match itself): over on every phone.
  const r3 = rom("skronemakeren", 3, {});
  r3.borte(0);
  assert.ok(r3.tlf[1].def.nett.ferdig(r3.tlf[1].S));
});

// Hviskeren's words in the game's order, from the same word bank (for the forbidden hint).
function hviskOrd(p) {
  const ut = [];
  p.window.RUSJ_ORD.kategorier.forEach((k) => k.ord.forEach((e) => !/[,!?]/.test(e[0]) && e[0].trim().split(/\s+/).length <= 2 && ut.push({ o: e[0], h: e[2] })));
  return ut;
}

test("Hviskeren: three phones – two hints each, twins struck by the rules, the givers strike more, the guesser guesses and judges; illegal moves ignored", () => {
  const r = rom("hviskeren", 3, { runder: 8, forbudt: true });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  const ORD = hviskOrd(a);
  assert.equal(sp().modus, "nett");
  assert.equal(sp().r.gjetter, 0, "the host guesses first in match 1");
  assert.equal(sp().r.per, 2, "three players: two hints each");
  assert.equal(a.def.nett.skjerm(a.S), "n-skriv");
  const ord0 = sp().r.ord;
  r.trekk(2, { bytt: 1 }); // not the first hint giver
  r.trekk(0, { bytt: 1 }); // the guesser
  assert.equal(sp().r.ord, ord0);
  r.trekk(1, { bytt: 1 });
  const ord = sp().r.ord;
  assert.notEqual(ord, ord0);
  const ordet = ORD[ord].o;
  r.trekk(0, { hint: ["Zorbel", "Kviff"], ord }); // the guesser gives no hints
  r.trekk(1, { hint: ["Zorbel"], ord }); // one too few
  r.trekk(1, { hint: ["to ord", "Kviff"], ord }); // one word each
  r.trekk(1, { hint: [ordet, "Kviff"], ord }); // the word itself
  r.trekk(1, { hint: [ORD[ord].h, "Kviff"], ord }); // the forbidden hint
  r.trekk(1, { hint: ["Kviff", "kviff"], ord }); // the same twice
  r.trekk(1, { hint: ["Zorbel", "Kviff"], ord: ord0 }); // another word
  assert.deepEqual(somJson(sp().r.gitt), [null, null, null]);
  assert.equal(b.def.nett.tur(b.S), 1);
  r.trekk(1, { hint: ["Zorbel", "Kviff\u0000"], ord });
  r.trekk(1, { hint: ["Plonk", "Snerk"], ord }); // twice
  assert.equal(sp().r.fase, "skriv");
  r.trekk(2, { hint: ["zorbelen", "Plonk"], ord });
  assert.equal(sp().r.fase, "sjekk");
  assert.deepEqual(
    somJson(sp().r.hint),
    [
      { i: 1, t: "Zorbel", a: true, s: true },
      { i: 1, t: "Kviff", a: false, s: false },
      { i: 2, t: "zorbelen", a: true, s: true },
      { i: 2, t: "Plonk", a: false, s: false },
    ],
    "twins (zorbel / zorbelen) struck the same on every phone",
  );
  r.trekk(0, { stryk: 1 }); // the guesser can't strike
  r.trekk(2, { stryk: 9 }); // no such hint
  r.trekk(2, { stryk: 3 });
  assert.equal(sp().r.hint[3].s, true);
  r.trekk(1, { stryk: 3 });
  assert.equal(sp().r.hint[3].s, false, "and back");
  r.trekk(0, { gjett: "sjekk" }); // not yet
  r.trekk(2, { neste: sp().steg }); // not the first hint giver
  assert.equal(sp().r.fase, "sjekk");
  r.trekk(1, { neste: sp().steg });
  assert.equal(sp().r.fase, "gjett");
  assert.equal(a.def.nett.tur(a.S), 0);
  r.trekk(1, { gjett: "sjekk" }); // only the guesser
  r.trekk(0, { gjett: "sjekk" });
  assert.equal(sp().r.fase, "svar");
  assert.equal(sp().r.utfall, null);
  r.trekk(0, { neste: sp().steg }); // not judged yet
  r.trekk(1, { utfall: "riktig" }); // only the guesser judges
  r.trekk(0, { utfall: "kanskje" });
  assert.equal(sp().r.utfall, null);
  r.trekk(0, { utfall: "riktig" });
  r.trekk(0, { utfall: "feil" }); // judged already
  assert.equal(sp().r.utfall, "riktig");
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().poeng, 1);
  assert.equal(sp().logg.length, 1);
  assert.equal(sp().r.gjetter, 1, "the next seat guesses");
  const utfall = ["feil", "pass", "riktig"];
  let feil = 0;
  for (let steg = 0; steg < 400 && !sp().ferdig; steg++) {
    const s = sp();
    const g = s.r.gjetter;
    const givere = [0, 1, 2].filter((i) => i !== g);
    if (s.r.fase === "skriv") givere.forEach((i, n) => r.trekk(i, { hint: [`Qwx${s.nr}a${n}`, `Vyk${s.nr}b${n}`], ord: s.r.ord }));
    else if (s.r.fase === "sjekk") r.trekk(a.def.nett.tur(a.S), { neste: s.steg });
    else if (s.r.fase === "gjett") r.trekk(g, { gjett: s.logg.length % 3 === 1 ? "pass" : "sjekk" });
    else if (!s.r.utfall) {
      const u = utfall[s.logg.length % 3];
      if (u === "feil") feil++;
      r.trekk(g, { utfall: u });
    } else r.trekk(g, { neste: s.steg });
  }
  assert.ok(sp().ferdig && a.def.nett.ferdig(a.S));
  assert.ok(feil > 0 && sp().tapt > 0, "a wrong guess costs a card");
  assert.equal(sp().logg.length + sp().tapt, 8);
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(2));
  assert.equal(rom("hviskeren", 3, {}, 20261115, 2).tlf[0].S.spill.r.gjetter, 1, "match 2: the next seat guesses first");
  assert.equal(rom("hviskeren", 4, {}).tlf[0].S.spill.r.per, 1, "four players: one hint each");
  assert.equal(rom("hviskeren", 4, {}).tlf[0].S.spill.runder, 13);
});

test("Hviskeren: a seat that leaves is never waited for; if the guesser leaves, the next one guesses a new word and no card is lost", () => {
  const r = rom("hviskeren", 5, { runder: 8 });
  const [a, , , , e] = r.tlf;
  const sp = () => a.S.spill;
  let ord = sp().r.ord;
  r.trekk(2, { hint: ["Zorbel"], ord });
  r.borte(2); // wrote, then left: its hint goes
  r.trekk(1, { hint: ["Kviff"], ord });
  r.trekk(3, { hint: ["Plonk"], ord });
  assert.equal(sp().r.fase, "skriv");
  r.trekk(4, { hint: ["Snerk"], ord });
  assert.equal(sp().r.fase, "sjekk", "the seat that left is not waited for");
  assert.deepEqual(somJson(sp().r.hint.map((h) => h.i)), [1, 3, 4]);
  r.trekk(1, { neste: sp().steg });
  r.trekk(0, { gjett: "sjekk" });
  r.trekk(0, { utfall: "riktig" });
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().r.gjetter, 1);
  assert.equal(sp().r.per, 1, "four still in: one hint each");
  ord = sp().r.ord;
  for (const i of [0, 3, 4]) r.trekk(i, { hint: [`Hint${i}`], ord });
  r.trekk(3, { neste: sp().steg });
  assert.equal(sp().r.fase, "gjett");
  r.borte(1); // the guesser leaves: a new word for the next seat still in, no card lost
  assert.equal(sp().r.fase, "skriv");
  assert.equal(sp().r.gjetter, 3);
  assert.notEqual(sp().r.ord, ord);
  assert.equal(sp().logg.length, 1);
  assert.equal(sp().r.per, 2, "three still in: two hints each");
  for (let steg = 0; steg < 400 && !sp().ferdig; steg++) {
    const s = sp();
    const g = s.r.gjetter;
    assert.ok(!s.ute.includes(a.def.nett.tur(a.S)));
    const givere = [0, 3, 4].filter((i) => i !== g);
    if (s.r.fase === "skriv") givere.forEach((i, n) => r.trekk(i, { hint: [`Qwx${s.nr}a${n}`, `Vyk${s.nr}b${n}`], ord: s.r.ord }));
    else if (s.r.fase === "sjekk") r.trekk(a.def.nett.tur(a.S), { neste: s.steg });
    else if (s.r.fase === "gjett") r.trekk(g, { gjett: "pass" });
    else r.trekk(g, { neste: s.steg });
  }
  assert.ok(sp().ferdig);
  assert.equal(sp().logg.length, 8);
  likt(a, e);
  likt(a, r.sen(3));
  // The first hint giver leaves while the hints are checked: the next giver sends them on.
  const r2 = rom("hviskeren", 5, {});
  const s2 = () => r2.tlf[0].S.spill;
  for (const i of [1, 2, 3, 4]) r2.trekk(i, { hint: [`Hint${i}`], ord: s2().r.ord });
  assert.equal(s2().r.fase, "sjekk");
  r2.borte(1);
  r2.trekk(2, { neste: s2().steg });
  assert.equal(s2().r.fase, "gjett");
  // The guesser leaves after judging: the round counts.
  r2.trekk(0, { gjett: "sjekk" });
  r2.trekk(0, { utfall: "riktig" });
  r2.borte(0);
  assert.equal(s2().logg.length, 1);
  assert.equal(s2().poeng, 1);
});

test("Sauen: four phones – answers grouped the same on every phone, the leader reveals, merges and splits, the black sheep, the first to the target wins", () => {
  const r = rom("sauen", 4, { mal: 5 });
  const [a, b, c, d] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "nett");
  assert.equal(sp().mal, 5);
  assert.equal(sp().sauUte, false);
  assert.equal(sp().r.leder, 0);
  const q0 = sp().r.q;
  r.trekk(3, { bytt: 1 }); // not the leader
  assert.equal(sp().r.q, q0);
  r.trekk(0, { bytt: 1 });
  const q = sp().r.q;
  assert.notEqual(q, q0);
  r.trekk(0, { svar: "Banan", q });
  r.trekk(0, { svar: "Eple", q }); // twice
  r.trekk(0, { bytt: 1 }); // someone has answered
  r.trekk(1, { svar: "...", q }); // no letters
  r.trekk(1, { svar: "bananer", q: q0 }); // the question before
  assert.equal(sp().r.q, q);
  r.trekk(1, { svar: "bananer", q });
  r.trekk(2, { svar: "en banan", q });
  assert.equal(sp().r.fase, "skriv");
  assert.equal(d.def.nett.tur(d.S), 3);
  r.trekk(3, { svar: SKITTEN, q });
  assert.equal(sp().r.fase, "avslor");
  assert.equal(sp().r.inn[3], REN);
  assert.equal(sp().r.grupper.length, 2, "banan, bananer and en banan are one group");
  // The reveal: the leader only.
  r.trekk(1, { neste: sp().steg });
  assert.equal(sp().r.vist, 0);
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().r.vist, 1);
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().r.avslort, true);
  // Merge, take back, split, take back – the leader only.
  r.trekk(1, { sla: [0, 1] });
  assert.equal(sp().r.grupper.length, 2);
  r.trekk(0, { sla: [0, 0] }); // the same group
  r.trekk(0, { sla: [0, 5] }); // no such group
  r.trekk(0, { sla: [0, 1] });
  assert.equal(sp().r.grupper.length, 1);
  r.trekk(0, { angre: 1 });
  assert.equal(sp().r.grupper.length, 2);
  const stor = sp().r.grupper.findIndex((g) => g.length > 1);
  r.trekk(0, { delOpp: stor });
  assert.equal(sp().r.grupper.length, 3);
  r.trekk(0, { angre: 1 });
  r.trekk(0, { angre: 1 }); // nothing more to take back
  assert.equal(sp().r.grupper.length, 2);
  r.trekk(0, { neste: sp().steg }); // «Del ut poengene»
  assert.equal(sp().r.fase, "poeng");
  assert.deepEqual(somJson(sp().poeng), [1, 1, 1, 0]);
  assert.equal(sp().sau, 3, "alone: the black sheep");
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().r.leder, 1, "one seat on per round");
  for (let steg = 0; steg < 400 && !sp().ferdig; steg++) {
    const s = sp();
    if (s.r.fase === "skriv") for (let i = 0; i < 4; i++) r.trekk(i, { svar: "Sol", q: s.r.q });
    else r.trekk(s.r.leder, { neste: s.steg });
  }
  assert.ok(sp().ferdig && a.def.nett.ferdig(a.S));
  assert.deepEqual(somJson(sp().vinnere), [0, 1, 2], "the black sheep can't win");
  assert.equal(a.def.nett.skjerm(a.S), "vinner");
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(3));
  assert.equal(rom("sauen", 4, {}, 20261115, 2).tlf[0].S.spill.r.leder, 1, "match 2: the next seat leads");
  assert.equal(rom("sauen", 3, {}).tlf[0].S.spill.sauUte, true, "three players: the sheep is at pasture");
  assert.equal(rom("sauen", 8, {}).tlf[0].S.spill.mal, 5, "the target follows the group when the host has not chosen one");
});

test("Sauen: a seat that leaves is never waited for, its answer leaves the reveal, the black sheep goes with it, the next one leads", () => {
  const r = rom("sauen", 5, { mal: 5 });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  const q = sp().r.q;
  ["Ost", "Ost", "Melk", "Brød"].forEach((t, i) => r.trekk(i, { svar: t, q }));
  r.borte(4); // never answered: not waited for
  assert.equal(sp().r.fase, "avslor");
  assert.equal(sp().r.svar.length, 4);
  r.trekk(0, { neste: sp().steg });
  r.borte(3); // its answer («Brød», alone) leaves the reveal
  assert.equal(sp().r.grupper.length, 2);
  assert.ok(sp().r.rekkefolge.every((g) => g < 2));
  for (let n = 0; n < 5 && !sp().r.avslort; n++) r.trekk(0, { neste: sp().steg });
  r.trekk(0, { neste: sp().steg });
  assert.deepEqual(somJson(sp().poeng), [1, 1, 0, 0, 0]);
  assert.equal(sp().sau, 2, "«Melk» stood alone");
  r.trekk(0, { neste: sp().steg });
  assert.equal(sp().r.leder, 1, "one seat on per round");
  // The holder of the black sheep leaves: the sheep goes with it. (Only two are left: the match is
  // over – the room ends it too.)
  r.trekk(2, { svar: "Te", q: sp().r.q });
  r.borte(2);
  assert.equal(sp().sau, -1);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.deepEqual(somJson(sp().vinnere), [0, 1], "the leaders so far, among those still in");
  likt(a, b);
  likt(a, r.sen(0));
  // A leader that leaves: the next seat still in leads.
  const r2 = rom("sauen", 4, {});
  r2.borte(0);
  assert.equal(r2.tlf[1].S.spill.r.leder, 1);
  for (const i of [1, 2, 3]) r2.trekk(i, { svar: "Hav", q: r2.tlf[1].S.spill.r.q });
  assert.equal(r2.tlf[1].S.spill.r.fase, "avslor");
  r2.trekk(1, { neste: r2.tlf[1].S.spill.steg });
  assert.equal(r2.tlf[1].S.spill.r.avslort, true);
});

// ---------- Nissen, Spionen, Varulven: hidden roles, everyone answers at once ----------

// Every phone draws its screen after every move (a screen that cannot be drawn fails the test).
function medSkjerm(r) {
  const tegn = () => {
    for (const p of r.tlf) {
      const navn = p.def.nett.skjerm(p.S);
      assert.equal(typeof p.def.skjermer[navn].vis(p.S), "string", `${navn} on seat ${p.meg}`);
    }
  };
  const trekk = r.trekk.bind(r);
  r.trekk = (sete, t) => {
    trekk(sete, t);
    tegn();
  };
  tegn();
  return r;
}

test("Nissen: three rounds for three phones – only one's own bowl, the leader moves the round on, everyone points, the points", () => {
  const r = medSkjerm(rom("nissen", 3, { runder: 3 }));
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().runder, 3);
  assert.equal(a.def.nett.skjerm(a.S), "nettspill");
  let sporsmal = 0;
  for (let runde = 0; runde < 3; runde++) {
    const m = sp().mandel;
    const led = runde % 3;
    for (const p of r.tlf) assert.equal(p.S.spill.mandel, m, "the same almond on every phone");
    // Each phone's card shows its own bowl, never another seat's.
    for (const p of r.tlf) assert.equal(/ng-se har/.test(p.def.hemmelig.innhold(p.S, "nett").html), p.meg === m);
    assert.equal(a.def.nett.tur(a.S), 0, "everyone looks at once: A has not");
    r.trekk(led, { nissen: runde }); // before everyone has looked
    r.trekk(1, { sett: runde + 1 }); // another round
    r.trekk(0, { sett: runde });
    r.trekk(0, { sett: runde }); // twice
    assert.equal(sp().fase, "se");
    assert.equal(a.def.nett.tur(a.S), null, "A has looked; two still to look");
    r.trekk(1, { sett: runde });
    assert.equal(a.def.nett.tur(a.S), 2, "one left: waiting for C");
    r.trekk(2, { sett: runde });
    assert.equal(sp().fase, "munn");
    assert.equal(a.def.nett.tur(a.S), led);
    r.trekk((led + 1) % 3, { nissen: runde }); // not the leader
    assert.equal(sp().fase, "munn");
    r.trekk(led, { nissen: runde });
    assert.equal(sp().fase, "prat");
    const forste = sp().spurt;
    r.trekk(led, { sporsmal: runde });
    assert.notEqual(sp().spurt, forste, "the elf never asks the same one twice in a row");
    sporsmal += 2;
    r.trekk((led + 1) % 3, { pek: runde }); // not the leader
    assert.equal(sp().fase, "prat");
    r.trekk(led, { pek: runde });
    assert.equal(sp().fase, "pek");
    const x = (m + 1) % 3;
    const y = (m + 2) % 3;
    r.trekk(x, { stem: x, r: runde }); // not at oneself
    r.trekk(x, { stem: 7, r: runde }); // no such seat
    r.trekk(x, { stem: m, r: runde + 1 }); // another round
    r.trekk(x, { stem: m, r: runde });
    r.trekk(x, { stem: y, r: runde }); // only once
    r.trekk(m, { stem: x, r: runde });
    assert.equal(sp().fase, "pek", "one has not pointed yet");
    r.trekk(y, { stem: x, r: runde });
    assert.equal(sp().fase, "fasit");
    assert.deepEqual(somJson(sp().siste.riktige), [x]);
    assert.equal(sp().siste.lurte, 1);
    assert.deepEqual(somJson(sp().siste.pluss), [0, 1, 2].map((i) => (i === x || i === m ? 1 : 0)));
    if (runde < 2) {
      assert.equal(a.def.nett.tur(a.S), (runde + 1) % 3, "the next round's leader starts it");
      r.trekk((runde + 2) % 3, { runde: runde + 1 }); // not the next leader
      assert.equal(sp().fase, "fasit");
      r.trekk((runde + 1) % 3, { runde: runde + 2 }); // not the next round
      r.trekk((runde + 1) % 3, { runde: runde + 1 });
      assert.equal(sp().fase, "se");
      assert.equal(sp().runde, runde + 1);
    }
  }
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  assert.equal(a.def.nett.tur(a.S), null);
  assert.equal(sp().spilt, 3);
  assert.equal(sp().poeng.reduce((s, p) => s + p, 0), 6, "two points a round");
  assert.equal(new Set(sp().brukt).size, sporsmal, "a new question each time, never twice in a match");
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(1));
  const k2 = rom("nissen", 3, { runder: 9 }, 20261115, 2).tlf[0];
  assert.equal(k2.S.spill.runder, 5, "an unknown number of rounds: five");
  assert.equal(k2.def.nett.tur(k2.S), 0, "everyone looks first");
  assert.equal(k2.S.spill.forste, 1, "match 2: the next seat leads first");
});

test("Nissen: a seat that leaves is skipped – also as the leader; with the almond the round does not count; under three the match is over", () => {
  const r = medSkjerm(rom("nissen", 6, { runder: 5 }));
  const [a] = r.tlf;
  const sp = () => a.S.spill;
  const inne = () => [0, 1, 2, 3, 4, 5].filter((i) => !sp().ute.includes(i));
  const se = (k) => inne().forEach((i) => r.trekk(i, { sett: k }));
  const pek = (k) => {
    const m = sp().mandel;
    inne().forEach((i) => r.trekk(i, { stem: i === m ? inne().find((j) => j !== m) : m, r: k }));
  };
  // Round 0 (A leads): a seat that is neither the leader nor the almond holder leaves while the
  // others look – nobody waits for it.
  const x = [5, 4, 3].find((i) => i !== sp().mandel);
  inne().filter((i) => i !== x).forEach((i) => r.trekk(i, { sett: 0 }));
  assert.equal(sp().fase, "se");
  r.borte(x);
  assert.equal(sp().fase, "munn", "the seat that left is not waited for");
  r.trekk(x, { nissen: 0 }); // gone
  r.trekk(0, { nissen: 0 });
  r.trekk(0, { pek: 0 });
  pek(0);
  assert.equal(sp().fase, "fasit");
  assert.equal(sp().siste.lurte, 0, "the seat that left is neither fooled nor right");
  assert.equal(sp().siste.riktige.length, 4);
  // Round 1: its leader leaves before the elf – the next seat still in leads.
  const l1 = a.def.nett.tur(a.S);
  r.trekk(l1, { runde: 1 });
  assert.notEqual(sp().mandel, x, "the almond never goes to a seat that left");
  se(1);
  if (sp().mandel === l1) {
    r.borte(l1);
    assert.ok(sp().siste.tom, "the leader had the almond: the round does not count");
  } else {
    r.borte(l1);
    const ny = a.def.nett.tur(a.S);
    assert.ok(ny !== l1 && !sp().ute.includes(ny), "a new leader");
    r.trekk(l1, { nissen: 1 });
    assert.equal(sp().fase, "munn");
    r.trekk(ny, { nissen: 1 });
    r.trekk(ny, { pek: 1 });
    pek(1);
    assert.equal(sp().fase, "fasit");
  }
  // Round 2: the almond holder leaves while the elf asks – the round gives nobody anything.
  r.trekk(a.def.nett.tur(a.S), { runde: 2 });
  se(2);
  r.trekk(a.def.nett.tur(a.S), { nissen: 2 });
  const poeng = somJson(sp().poeng);
  const m2 = sp().mandel;
  r.borte(m2);
  assert.equal(sp().fase, "fasit");
  assert.ok(sp().siste.tom);
  assert.deepEqual(somJson(sp().poeng), poeng, "the round that did not count gave nothing");
  assert.equal(sp().spilt, 2);
  assert.ok(!a.def.nett.ferdig(a.S));
  likt(a, r.sen(inne()[0]));
  // Under three left: over on every phone.
  r.borte(inne().find((i) => i !== 0));
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  for (const p of r.tlf) assert.ok(p.def.nett.ferdig(p.S));
});

test("Spionen: three rounds for four phones – own cards, «Klar», stop and vote, the accused spy guesses, a bold spy, the points", () => {
  const r = medSkjerm(rom("spionen", 4, { spioner: 1, tid: 5, runder: 3, pakker: ["hverdag"] }));
  const [a, b, c, d] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().tid, 5);
  assert.deepEqual(somJson(sp().pakker), ["hverdag"]);
  const alle = [0, 1, 2, 3];
  const klar = (k) => alle.forEach((i) => r.trekk(i, { klar: k }));
  const spion = () => sp().r.spioner[0];
  const STED = (i) => a.window.RUSJ_DATA.steder.pakker.flatMap((p) => p.steder)[i];
  const stedINorsk = (i) => STED(i).navn;
  // Round 1: the same round on every phone; each card shows only its own.
  for (const p of r.tlf) assert.deepEqual(somJson(p.S.spill.r), somJson(sp().r));
  assert.equal(sp().r.spioner.length, 1);
  for (const p of r.tlf) {
    const html = p.def.hemmelig.innhold(p.S, "nett").html;
    if (p.meg === spion()) assert.ok(/Oppdraget ditt/.test(html) && !html.includes(stedINorsk(sp().r.sted)), "the spy's card has no place");
    else assert.ok(html.includes(stedINorsk(sp().r.sted)) && !/Oppdraget ditt/.test(html), "a player's card has the place");
  }
  assert.equal(a.def.nett.skjerm(a.S), "nettkort");
  r.trekk(0, { stopp: 1 }); // before the round has started
  r.trekk(0, { klar: 2 }); // another round
  klar(1);
  assert.equal(sp().fase, "runde");
  assert.equal(a.def.nett.skjerm(a.S), "nettrunde");
  assert.equal(a.def.nett.tur(a.S), null, "while you talk, nobody has the turn");
  const s1 = spion();
  const uskyldig = alle.find((i) => i !== s1);
  r.trekk((s1 + 1) % 4, { gjett: sp().r.sted, r: 1 }); // only a spy can guess
  assert.equal(sp().fase, "runde");
  r.trekk(uskyldig, { stopp: 1 });
  assert.equal(sp().fase, "stem");
  assert.equal(sp().stopper, uskyldig);
  r.trekk(uskyldig, { stopp: 1 }); // already voting
  r.trekk(0, { stem: 0, r: 1 }); // not oneself
  r.trekk(0, { stem: 9, r: 1 }); // no such seat
  alle.forEach((i) => r.trekk(i, { stem: i === uskyldig ? alle.find((j) => j !== i) : uskyldig, r: 1 }));
  assert.equal(sp().anklaget, uskyldig);
  assert.equal(sp().fase, "resultat");
  assert.equal(sp().utfall.grunn, "uskyldig");
  assert.ok(sp().utfall.spionVant);
  assert.equal(sp().poeng[s1], 2, "an innocent was accused: 2 to the spy");
  // Round 2, started by the next seat: the spy stops the clock on its own and names the place.
  assert.equal(a.def.nett.tur(a.S), 1);
  r.trekk(0, { runde: 2 }); // not the leader of round 2
  r.trekk(1, { runde: 3 }); // not the next round
  assert.equal(sp().fase, "resultat");
  r.trekk(1, { runde: 2 });
  assert.equal(sp().runde, 2);
  klar(2);
  const s2 = spion();
  r.trekk(s2, { gjett: 9999, r: 2 }); // no such place
  r.trekk(s2, { gjett: sp().r.sted, r: 2 });
  assert.equal(sp().utfall.grunn, "gjettet");
  assert.ok(sp().utfall.modig);
  assert.equal(sp().utfall.pluss[s2], 3, "a bold spy: 3 points");
  // Round 3: caught – the spy guesses wrong; everyone else gets 1, the one who called stop 1 more.
  r.trekk(2, { runde: 3 });
  klar(3);
  const s3 = spion();
  const stopper = alle.find((i) => i !== s3);
  r.trekk(stopper, { stopp: 3 });
  alle.forEach((i) => r.trekk(i, { stem: i === s3 ? stopper : s3, r: 3 }));
  assert.equal(sp().fase, "gjett");
  assert.equal(a.def.nett.tur(a.S), s3, "the accused spy has the turn");
  assert.equal(a.def.nett.skjerm(a.S), "nettgjett");
  const feil = a.window.RUSJ_DATA.steder.pakker[0].steder.findIndex((_, i) => i !== sp().r.sted);
  r.trekk(stopper, { gjett: feil, r: 3 }); // not the accused
  assert.equal(sp().fase, "gjett");
  r.trekk(s3, { gjett: feil, r: 3 });
  assert.equal(sp().utfall.grunn, "feilgjett");
  assert.equal(sp().utfall.stoppet, stopper);
  assert.deepEqual(somJson(sp().utfall.pluss), alle.map((i) => (i === s3 ? 0 : 1)));
  assert.equal(sp().fangst[stopper], 1);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  assert.equal(sp().spilt, 3);
  assert.equal(sp().logg.length, 3);
  likt(a, b);
  likt(a, c);
  likt(a, d);
  likt(a, r.sen(2));
  // Match 2: the next seat leads; no packs in the setup gives the usual ones.
  const k2 = rom("spionen", 4, { runder: 3 }, 777, 2).tlf[0].S.spill;
  assert.equal(k2.forste, 1);
  assert.ok(k2.pakker.length >= 1 && k2.tid === 5, "four players: five minutes");
});

test("Spionen: a tie goes back to the round, «uenige», «Fri» ends when the leader says so; a spy that leaves voids the round; under three it is over", () => {
  const r = medSkjerm(rom("spionen", 5, { spioner: 1, runder: 0 }));
  const [a] = r.tlf;
  const sp = () => a.S.spill;
  const inne = () => [0, 1, 2, 3, 4].filter((i) => !sp().ute.includes(i));
  const klar = (k) => inne().forEach((i) => r.trekk(i, { klar: k }));
  klar(1);
  // A tie: two names with two votes each – back to the round, nobody accused.
  const [x, y] = inne().filter((i) => i !== sp().r.spioner[0]);
  const resten = inne().filter((i) => i !== x && i !== y);
  r.trekk(x, { stopp: 1 });
  r.trekk(x, { stem: y, r: 1 });
  r.trekk(y, { stem: x, r: 1 });
  r.trekk(resten[0], { stem: x, r: 1 });
  r.trekk(resten[1], { stem: y, r: 1 });
  r.trekk(resten[2], { stem: resten[0], r: 1 });
  assert.equal(sp().fase, "runde", "two with two votes each: back to the round");
  assert.ok(sp().uavgjort);
  assert.equal(sp().anklaget, null);
  assert.equal(sp().stemmer, null);
  assert.equal(sp().stopper, null);
  // Time is up and the group cannot agree: the spy escapes.
  r.trekk(x, { uenige: 1 });
  assert.equal(sp().fase, "resultat");
  assert.equal(sp().utfall.grunn, "uenige");
  assert.equal(sp().poeng[sp().r.spioner[0]], 2);
  // «Fri»: only the leader of the next round can end it, and only on the result.
  const leder = a.def.nett.tur(a.S);
  r.trekk((leder + 1) % 5, { kaaring: 1 });
  assert.ok(!sp().ferdig);
  r.trekk(leder, { runde: 2 });
  klar(2);
  // The spy leaves mid-round: the round does not count.
  const poeng = somJson(sp().poeng);
  const spilt = sp().spilt;
  const s2 = sp().r.spioner[0];
  r.trekk(inne().find((i) => i !== s2), { stopp: 2 });
  r.borte(s2);
  assert.equal(sp().fase, "resultat");
  assert.ok(sp().utfall.tom);
  assert.deepEqual(somJson(sp().poeng), poeng);
  assert.equal(sp().spilt, spilt);
  // Round 3 among four: the spy is never a seat that left; one that votes and then leaves is not waited for.
  r.trekk(a.def.nett.tur(a.S), { runde: 3 });
  assert.ok(!sp().ute.some((i) => sp().r.spioner.includes(i)));
  klar(3);
  const s3 = sp().r.spioner[0];
  const andre = inne().filter((i) => i !== s3);
  r.trekk(andre[0], { stopp: 3 });
  for (const i of andre.slice(0, 2)) r.trekk(i, { stem: s3, r: 3 });
  r.trekk(s3, { stem: andre[0], r: 3 });
  assert.equal(sp().fase, "stem");
  r.borte(andre[2]); // the last one leaves before voting
  assert.equal(sp().fase, "gjett", "nobody waits for the seat that left");
  r.trekk(s3, { gjett: sp().r.sted, r: 3 });
  assert.equal(sp().utfall.grunn, "gjettet");
  assert.ok(!sp().utfall.modig);
  likt(a, r.sen(andre[0]));
  // «Fri»: the leader ends the match.
  const l4 = a.def.nett.tur(a.S);
  r.trekk(l4, { kaaring: 3 });
  assert.ok(a.def.nett.ferdig(a.S));
  // Under three: over.
  const r2 = medSkjerm(rom("spionen", 3, { runder: 5 }));
  r2.borte(r2.tlf[0].S.spill.r.spioner[0] === 1 ? 2 : 1);
  assert.ok(r2.tlf[0].def.nett.ferdig(r2.tlf[0].S));
});

test("Spionen and Varulven: votes for a seat that has since left do not count", () => {
  // Spionen: two vote for an innocent seat that then leaves – it cannot be accused; one each is a tie.
  const r = medSkjerm(rom("spionen", 5, { spioner: 1, runder: 0 }));
  const sp = () => r.tlf[0].S.spill;
  [0, 1, 2, 3, 4].forEach((i) => r.trekk(i, { klar: 1 }));
  const spion = sp().r.spioner[0];
  const [x, n1, n2, n3] = [0, 1, 2, 3, 4].filter((i) => i !== spion);
  r.trekk(n1, { stopp: 1 });
  r.trekk(n1, { stem: x, r: 1 });
  r.trekk(n2, { stem: x, r: 1 });
  r.borte(x);
  r.trekk(n3, { stem: n1, r: 1 });
  r.trekk(spion, { stem: n2, r: 1 });
  assert.equal(sp().anklaget, null, "the seat that left is not accused");
  assert.equal(sp().fase, "runde", "one vote each for those still in: a tie");
  for (const p of r.tlf.slice(1)) if (p.meg !== x) likt(r.tlf[0], p);
  // Varulven «Klassisk»: two vote for the hunter, who then leaves – the village does not wait for its shot.
  const v = medSkjerm(rom("varulven", 6, { modus: "klassisk", ulver: 1, synsk: true, lege: true, jeger: true, tid: 2, fredelig: false }));
  const vs = () => v.tlf[0].S.spill;
  const rolle = (navn) => vs().roller.indexOf(navn);
  const [ulv, synsk, lege, jeger] = ["varulv", "synsk", "lege", "jeger"].map(rolle);
  const [l1, l2] = [0, 1, 2, 3, 4, 5].filter((i) => vs().roller[i] === "landsby");
  [0, 1, 2, 3, 4, 5].forEach((i) => v.trekk(i, { klar: 1 }));
  v.trekk(ulv, { valg: l1, n: 1 });
  v.trekk(synsk, { valg: ulv, n: 1 });
  v.trekk(lege, { valg: lege, n: 1 });
  v.trekk(jeger, { valg: l2, n: 1 });
  v.trekk(l1, { valg: ulv, n: 1 });
  v.trekk(l2, { valg: synsk, n: 1 });
  assert.equal(vs().morgen.offer, l1);
  v.trekk(l1, { stem: 1 });
  assert.equal(vs().fase, "stemme");
  v.trekk(ulv, { mot: jeger, d: 1 });
  v.trekk(synsk, { mot: jeger, d: 1 });
  v.borte(jeger);
  v.trekk(lege, { mot: l2, d: 1 });
  v.trekk(l2, { mot: lege, d: 1 });
  assert.equal(vs().fase, "utkastet");
  assert.equal(vs().utkastet, null, "the hunter had left: one vote each for the others is a tie");
  assert.equal(vs().jeger, null, "nobody waits for a shot");
  v.trekk(l1, { kveld: 2 });
  assert.equal(vs().fase, "natt", "the game goes on");
  for (const p of v.tlf.slice(1)) if (p.meg !== jeger) likt(v.tlf[0], p);
});

test("Varulven: «Klassisk» for six phones – own roles, the night on every phone, the hunter's shot, a tied vote, a saved night, the village wins", () => {
  const r = medSkjerm(rom("varulven", 6, { modus: "klassisk", ulver: 1, synsk: true, lege: true, jeger: true, tid: 2, fredelig: false }));
  const [a] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().type, "klassisk");
  const rolle = (navn) => sp().roller.indexOf(navn);
  const ulv = rolle("varulv");
  const synsk = rolle("synsk");
  const lege = rolle("lege");
  const jeger = rolle("jeger");
  const [l1, l2] = [0, 1, 2, 3, 4, 5].filter((i) => sp().roller[i] === "landsby");
  assert.deepEqual(somJson(sp().roller.slice().sort()), ["jeger", "landsby", "landsby", "lege", "synsk", "varulv"]);
  for (const p of r.tlf) assert.deepEqual(somJson(p.S.spill.roller), somJson(sp().roller), "the same deal on every phone");
  // Each phone's card shows only its own role.
  for (const p of r.tlf) assert.ok(p.def.hemmelig.innhold(p.S, "nett").html.includes(`kort-ord">${{ varulv: "Varulv", synsk: "Synsk", lege: "Lege", jeger: "Jeger", landsby: "Landsbyboer" }[sp().roller[p.meg]]}<`));
  r.trekk(ulv, { valg: l1, n: 1 }); // the night has not fallen
  [0, 1, 2, 3, 4, 5].forEach((i) => r.trekk(i, { klar: 1 }));
  assert.equal(sp().fase, "natt");
  assert.equal(sp().natt, 1);
  // Night 1: the wolf takes the hunter; the doctor guards someone else.
  r.trekk(ulv, { valg: ulv, n: 1 }); // not a wolf
  r.trekk(synsk, { valg: synsk, n: 1 }); // not oneself
  r.trekk(ulv, { valg: jeger, n: 2 }); // another night
  r.trekk(ulv, { valg: jeger, n: 1 });
  r.trekk(ulv, { valg: l1, n: 1 }); // only once
  r.trekk(synsk, { valg: ulv, n: 1 });
  r.trekk(lege, { valg: lege, n: 1 }); // the doctor may guard itself
  r.trekk(jeger, { valg: l1, n: 1 });
  r.trekk(l1, { valg: ulv, n: 1 });
  assert.equal(sp().fase, "natt", "one has not picked");
  assert.equal(a.def.nett.tur(a.S), a.meg === l2 ? l2 : l2, "waiting for the last one");
  r.trekk(l2, { valg: synsk, n: 1 });
  assert.equal(sp().fase, "dag");
  assert.equal(sp().morgen.offer, jeger);
  assert.ok(!sp().levende[jeger]);
  assert.equal(sp().spilleder, jeger, "the first one out leads");
  assert.deepEqual(somJson(sp().hendelser[0].synsk), { av: synsk, sjekket: ulv, ulv: true });
  assert.equal(sp().forrigeBeskyttet, lege);
  // The hunter shoots before the day goes on.
  assert.equal(a.def.nett.tur(a.S), jeger);
  r.trekk(jeger, { stem: 1 }); // the leader, but the hunter has not shot
  assert.equal(sp().fase, "dag");
  r.trekk(l1, { skyt: l2 }); // not the hunter
  r.trekk(jeger, { skyt: jeger }); // not oneself
  r.trekk(jeger, { skyt: l2 });
  assert.ok(!sp().levende[l2]);
  assert.equal(sp().hendelser.at(-1).type, "jeger");
  r.trekk(jeger, { skyt: l1 }); // only one shot
  assert.ok(sp().levende[l1]);
  assert.ok(!a.def.nett.ferdig(a.S), "one wolf, three others: no winner");
  r.trekk(ulv, { stem: 1 }); // not the leader
  r.trekk(jeger, { stem: 1 });
  assert.equal(sp().fase, "stemme");
  // A tied vote: nobody leaves.
  r.trekk(jeger, { mot: ulv, d: 1 }); // the dead don't vote
  r.trekk(ulv, { mot: synsk, d: 1 });
  r.trekk(synsk, { mot: ulv, d: 1 });
  r.trekk(lege, { mot: ulv, d: 1 });
  r.trekk(l1, { mot: l1, d: 1 }); // not oneself
  r.trekk(l1, { mot: jeger, d: 1 }); // not the dead
  r.trekk(l1, { mot: synsk, d: 1 });
  assert.equal(sp().fase, "utkastet");
  assert.equal(sp().utkastet, null, "2–2: nobody");
  assert.ok(sp().ingenUt);
  r.trekk(jeger, { kveld: 3 }); // not the next night
  r.trekk(jeger, { kveld: 2 });
  assert.equal(sp().fase, "natt");
  assert.equal(sp().natt, 2);
  // Night 2: the doctor cannot guard itself two nights running; it guards the seer, whom the wolf takes.
  r.trekk(lege, { valg: lege, n: 2 });
  assert.equal(sp().valg[lege], null);
  r.trekk(lege, { valg: synsk, n: 2 });
  r.trekk(ulv, { valg: synsk, n: 2 });
  r.trekk(synsk, { valg: l1, n: 2 });
  r.trekk(l1, { valg: ulv, n: 2 });
  assert.equal(sp().morgen.offer, null);
  assert.ok(sp().morgen.reddet, "the doctor saved the seer");
  assert.equal(a.def.nett.tur(a.S), null, "the day: you talk");
  r.trekk(jeger, { stem: 2 });
  for (const i of [synsk, lege, l1]) r.trekk(i, { mot: ulv, d: 2 });
  r.trekk(ulv, { mot: l1, d: 2 });
  assert.equal(sp().utkastet, ulv);
  assert.equal(sp().vinner, "landsby");
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  assert.equal(sp().mistanker.length, 4, "the villagers' and the hunter's secret guesses");
  for (const p of r.tlf.slice(1)) likt(a, p);
  likt(a, r.sen(4));
  assert.match(a.def.skjermer.slutt.vis(a.S), /Landsbyen vinner/);
});

test("Varulven: «Klassisk» – a player who leaves is out (its role shown), a hunter who leaves does not shoot, the last wolf leaving gives the village the win", () => {
  const r = medSkjerm(rom("varulven", 7, { modus: "klassisk", ulver: 2, synsk: false, lege: false, jeger: true, fredelig: true }));
  const [a] = r.tlf;
  const sp = () => a.S.spill;
  const alle = [0, 1, 2, 3, 4, 5, 6];
  const ulver = alle.filter((i) => sp().roller[i] === "varulv");
  const jeger = sp().roller.indexOf("jeger");
  const folk = alle.filter((i) => sp().roller[i] === "landsby");
  assert.equal(ulver.length, 2);
  alle.forEach((i) => r.trekk(i, { klar: 1 }));
  // Night 1 is peaceful: everyone picks, nobody is taken. One villager leaves before picking.
  for (const i of alle.filter((x) => x !== folk[0])) r.trekk(i, { valg: sp().roller[i] === "varulv" ? jeger : ulver[0] === i ? jeger : i === jeger ? folk[1] : jeger, n: 1 });
  assert.equal(sp().fase, "natt");
  r.borte(folk[0]);
  assert.equal(sp().fase, "dag", "nobody waits for the one who left");
  assert.equal(sp().morgen.offer, null);
  assert.ok(sp().morgen.fredelig);
  assert.ok(!sp().levende[folk[0]]);
  assert.equal(sp().hendelser.at(-2).type, "borte");
  assert.match(a.def.skjermer.slutt.vis(Object.assign({}, a.S, { spill: Object.assign({}, sp(), { ferdig: true }) })), /Forlot spillet/);
  // The leader: nobody out yet, so the match's first seat (0), past those who left.
  const leder = a.def.nett.tur(a.S) ?? (folk[0] === 0 ? 1 : 0);
  r.trekk(leder, { stem: 1 });
  // The hunter is voted out, and leaves before shooting: no shot, the game goes on.
  const levende = () => alle.filter((i) => sp().levende[i]);
  for (const i of levende()) r.trekk(i, { mot: i === jeger ? ulver[0] : jeger, d: 1 });
  assert.equal(sp().utkastet, jeger);
  assert.equal(a.def.nett.tur(a.S), jeger, "the hunter aims");
  r.borte(jeger);
  assert.equal(sp().jeger, null);
  assert.ok(!sp().hendelser.some((h) => h.type === "jeger"));
  assert.ok(!a.def.nett.ferdig(a.S));
  // Both wolves leave: the village wins.
  r.borte(ulver[0]);
  assert.ok(!a.def.nett.ferdig(a.S));
  r.borte(ulver[1]);
  assert.ok(a.def.nett.ferdig(a.S), "fewer than four, or no wolves: over");
  for (const p of r.tlf) if (!sp().ute.includes(p.meg)) likt(a, p);
  // Wolves as many as the rest after a player leaves: the wolves win.
  const r2 = medSkjerm(rom("varulven", 7, { modus: "klassisk", ulver: 2, synsk: false, lege: false, jeger: false }));
  const s2 = () => r2.tlf[0].S.spill;
  const folk2 = [0, 1, 2, 3, 4, 5, 6].filter((i) => s2().roller[i] !== "varulv");
  [0, 1, 2, 3, 4, 5, 6].forEach((i) => r2.trekk(i, { klar: 1 }));
  r2.borte(folk2[0]);
  r2.borte(folk2[1]);
  assert.ok(!s2().vinner);
  r2.borte(folk2[2]);
  assert.equal(s2().vinner, "ulv", "two wolves, two others: the wolves win");
});

test("Varulven: «Én natt» for six phones – the troublemaker picks two, the swaps at dawn, the vote, the points; a seat that leaves voids the round", () => {
  const r = medSkjerm(rom("varulven", 6, { modus: "en", runder: 3 }));
  const [a] = r.tlf;
  const sp = () => a.S.spill;
  const alle = [0, 1, 2, 3, 4, 5];
  assert.equal(sp().type, "en");
  assert.deepEqual(somJson(sp().roller.slice().sort()), ["brak", "bytter", "landsby", "landsby", "synsk", "varulv"]);
  const natt = () => {
    const rol = sp().roller;
    const med = alle.filter((i) => !sp().ute.includes(i));
    const ulv = rol.indexOf("varulv");
    for (const i of med) {
      const andre = med.filter((j) => j !== i);
      if (rol[i] === "brak") {
        r.trekk(i, { valg: [andre[0]], r: sp().runde }); // two names
        r.trekk(i, { valg: [andre[0], andre[0]], r: sp().runde }); // two different
        r.trekk(i, { valg: [i, andre[0]], r: sp().runde }); // not oneself
        r.trekk(i, { valg: [andre[0], andre[1]], r: sp().runde });
      } else if (rol[i] === "bytter") r.trekk(i, { valg: ulv === i ? andre[0] : ulv, r: sp().runde });
      else r.trekk(i, { valg: andre.find((j) => j !== ulv) ?? andre[0], r: sp().runde });
    }
  };
  natt();
  assert.equal(sp().fase, "dag");
  const slutt = somJson(sp().slutt);
  assert.notDeepEqual(slutt, somJson(sp().roller), "the swaps happened at dawn");
  // The swapper's swap first, then the troublemaker's.
  const forventet = sp().roller.slice();
  const bytter = sp().roller.indexOf("bytter");
  [forventet[bytter], forventet[sp().valg[bytter]]] = [forventet[sp().valg[bytter]], forventet[bytter]];
  const [y, z] = sp().valg[sp().roller.indexOf("brak")];
  [forventet[y], forventet[z]] = [forventet[z], forventet[y]];
  assert.deepEqual(slutt, somJson(forventet));
  assert.equal(a.def.nett.tur(a.S), null);
  r.trekk(1, { stem: 1 }); // not the leader of round 1
  r.trekk(0, { stem: 1 });
  assert.equal(sp().fase, "stemme");
  // Everyone votes for whoever ended the night as a wolf (that one for someone else): the village wins.
  const ulv = slutt.indexOf("varulv");
  for (const i of alle) r.trekk(i, { mot: i === ulv ? (ulv + 1) % 6 : ulv, d: 1 });
  assert.equal(sp().fase, "avsloring");
  assert.deepEqual(somJson(sp().pekt), [ulv]);
  assert.equal(sp().logg[0].v, "landsby");
  assert.deepEqual(somJson(sp().poeng), alle.map((i) => (slutt[i] === "varulv" ? 0 : 1)));
  // Round 2 (the next seat leads): votes spread – nobody gets two – the wolves win.
  r.trekk(0, { runde: 2 }); // not the leader
  r.trekk(1, { runde: 2 });
  assert.equal(sp().runde, 2);
  natt();
  r.trekk(1, { stem: 2 });
  for (const i of alle) r.trekk(i, { mot: (i + 1) % 6, d: 2 });
  assert.deepEqual(somJson(sp().pekt), []);
  assert.equal(sp().logg[1].v, "ulv");
  // Round 3: a seat leaves at night – the round does not count; fewer than four end the match.
  r.trekk(2, { runde: 3 });
  const poeng = somJson(sp().poeng);
  r.trekk(0, { valg: 1, r: 3 });
  r.borte(5);
  assert.equal(sp().fase, "tom");
  assert.equal(sp().borte, 5);
  assert.deepEqual(somJson(sp().poeng), poeng);
  assert.ok(a.def.nett.ferdig(a.S), "the last round did not count: the match is over");
  assert.equal(sp().spilt, 2);
  for (const p of r.tlf.slice(1, 5)) likt(a, p);
  likt(a, r.sen(3));
  assert.match(a.def.skjermer.slutt.vis(a.S), /poengliste/);
  // The way of playing follows the number of seats.
  assert.equal(rom("varulven", 4, { modus: "klassisk" }).tlf[0].S.spill.type, "en", "fewer than six: «Én natt»");
  assert.equal(rom("varulven", 11, { modus: "en" }).tlf[0].S.spill.type, "klassisk", "more than ten: «Klassisk»");
  const fri = rom("varulven", 4, { modus: "en", runder: 0 });
  const f = () => fri.tlf[0].S.spill;
  fri.borte(3);
  assert.ok(f().ferdig, "three left: over");
});

// ---------- Dommeren ----------

// One round on the net: everyone still in but the judge lays a card (the first in hand), the judge
// crowns option `v`, and the next judge starts the next round (unless the match is won).
function domRunde(r, v = 0) {
  const sp = () => r.tlf[0].S.spill;
  const d = sp().dommer;
  for (let i = 0; i < sp().antall; i++) if (i !== d && !sp().ute.includes(i)) r.trekk(i, { legg: sp().hender[i][0] });
  assert.equal(sp().fase, "dom");
  r.trekk(d, { kar: v % sp().valg.length });
  assert.equal(sp().fase, "resultat");
  if (!r.tlf[0].def.nett.ferdig(r.tlf[0].S)) r.trekk(r.tlf[0].def.nett.tur(r.tlf[0].S), { neste: sp().runde });
}

test("Dommeren: a match to 3 for four phones – everyone lays at once, the options come shuffled without names, illegal moves ignored", () => {
  const r = rom("dommeren", 4, { pakker: ["familie"], maal: 3 });
  const [a, b, c, d] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().nett, true);
  assert.equal(sp().fase, "velg", "on the net the round starts with everyone choosing");
  assert.equal(sp().dommer, 0, "match 1: the host judges first");
  assert.equal(sp().maal, 3);
  assert.ok(sp().hender.every((h) => h.length === 5));
  likt(a, b);
  // Each phone's turn while everyone chooses is its own (the judge waits for the first one missing).
  assert.equal(b.def.nett.tur(b.S), 1);
  assert.equal(c.def.nett.tur(c.S), 2);
  assert.equal(a.def.nett.tur(a.S), 1);
  // The judge swaps the question before anyone has laid; not after, and nobody else can.
  const q = sp().sporsmal;
  r.trekk(1, { bytt: 1 });
  assert.equal(sp().sporsmal, q, "only the judge swaps the card");
  r.trekk(0, { bytt: 1 });
  assert.notEqual(sp().sporsmal, q);
  // Illegal cards: the judge's, one not in the hand, a card from another hand, twice.
  r.trekk(0, { legg: sp().hender[0][0] });
  r.trekk(1, { legg: 99999 });
  r.trekk(1, { legg: sp().hender[2][0] });
  r.trekk(1, { legg: "1" });
  assert.deepEqual(somJson(sp().lagt), [-1, -1, -1, -1]);
  const kort1 = sp().hender[1][2];
  r.trekk(1, { legg: kort1 });
  assert.equal(sp().lagt[1], kort1);
  assert.equal(sp().hender[1].length, 4);
  r.trekk(1, { legg: sp().hender[1][0] }); // a second card: ignored
  assert.equal(sp().hender[1].length, 4);
  const q2 = sp().sporsmal;
  r.trekk(0, { bytt: 1 }); // a card is laid: no more swapping
  assert.equal(sp().sporsmal, q2);
  // Taking it back while the others choose, and laying another.
  r.trekk(1, { angre: 1 });
  assert.equal(sp().lagt[1], -1);
  assert.equal(sp().hender[1].length, 5);
  r.trekk(1, { legg: sp().hender[1][0] });
  r.trekk(2, { legg: sp().hender[2][0] });
  assert.equal(sp().fase, "velg");
  r.trekk(0, { kar: 0 }); // not yet
  assert.equal(sp().fase, "velg");
  r.trekk(3, { legg: sp().hender[3][0] });
  assert.equal(sp().fase, "dom", "all have laid: the judge's turn");
  assert.deepEqual(somJson([...sp().valg].sort()), [1, 2, 3]);
  r.trekk(2, { angre: 1 }); // too late
  r.trekk(1, { kar: 0 }); // not the judge
  r.trekk(0, { kar: 3 }); // no such option
  assert.equal(sp().fase, "dom");
  const vinner = sp().valg[1];
  r.trekk(0, { kar: 1 });
  assert.equal(sp().vinner, vinner);
  assert.equal(sp().poeng[vinner], 1);
  // The next judge starts the next round, nobody else.
  assert.equal(a.def.nett.tur(a.S), 1);
  r.trekk(2, { neste: 1 });
  r.trekk(1, { neste: 2 });
  assert.equal(sp().fase, "resultat");
  r.trekk(1, { neste: 1 });
  assert.equal(sp().fase, "velg");
  assert.equal(sp().dommer, 1);
  assert.ok(sp().hender.every((h) => h.length === 5), "hands are filled up");
  likt(a, b);
  likt(a, d);
  for (let n = 0; n < 40 && !a.def.nett.ferdig(a.S); n++) domRunde(r, n);
  assert.ok(a.def.nett.ferdig(a.S), "the match did not end");
  assert.equal(Math.max(...sp().poeng), 3);
  assert.equal(a.def.nett.tur(a.S), null);
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
  const for_ = JSON.stringify(sp());
  r.trekk(sp().dommer, { neste: sp().runde }); // after the end: ignored
  assert.equal(JSON.stringify(sp()), for_);
  likt(a, c);
  likt(a, r.sen(2));
  // Match 2: another seed deals other cards, and the next seat judges first.
  const r2 = rom("dommeren", 4, { pakker: ["familie"], maal: 3 }, 20261116, 2);
  assert.equal(r2.tlf[0].S.spill.dommer, 1);
  assert.notDeepEqual(somJson(r2.tlf[0].S.spill.hender), somJson(rom("dommeren", 4, { pakker: ["familie"], maal: 3 }).tlf[0].S.spill.hender));
});

test("Dommeren: seats that leave – a player is not waited for, a judge's round starts again, too few ends it", () => {
  const r = rom("dommeren", 6, { pakker: ["familie"], maal: 5 });
  const [a, , , , , f] = r.tlf;
  const sp = () => a.S.spill;
  r.trekk(1, { legg: sp().hender[1][0] });
  r.trekk(2, { legg: sp().hender[2][0] });
  r.trekk(3, { legg: sp().hender[3][0] });
  r.trekk(5, { legg: sp().hender[5][0] });
  // Seat 4 leaves while the others wait for it: the judge gets the four cards at once.
  r.borte(4);
  assert.deepEqual(somJson(sp().ute), [4]);
  assert.deepEqual(somJson(sp().hender[4]), [], "its hand goes to the discards");
  assert.equal(sp().fase, "dom");
  assert.equal(sp().valg.length, 4);
  r.trekk(4, { legg: 0 }); // the seat that left can't play
  // Seat 2 leaves while the judge chooses: its card goes from the options.
  r.borte(2);
  assert.equal(sp().valg.length, 3);
  assert.ok(!sp().valg.includes(2));
  r.trekk(0, { kar: 0 });
  const vant = sp().vinner;
  assert.ok([1, 3, 5].includes(vant));
  r.trekk(1, { neste: 1 });
  assert.equal(sp().dommer, 1);
  assert.ok(sp().hender[2].length === 0 && sp().hender[4].length === 0, "no cards for those who left");
  // The judge leaves while the others choose: the round starts again with the next one.
  r.trekk(0, { legg: sp().hender[0][0] });
  const q = sp().sporsmal;
  r.borte(1);
  assert.equal(sp().dommer, 3, "the next judge still in");
  assert.equal(sp().fase, "velg");
  assert.notEqual(sp().sporsmal, q, "a new card");
  assert.deepEqual(somJson(sp().lagt), [-1, -1, -1, -1, -1, -1], "the cards laid went back");
  assert.equal(sp().hender[0].length, 5);
  assert.equal(a.def.nett.tur(a.S), 0);
  likt(a, f);
  likt(a, r.sen(3));
  // Two left (0 and 5): too few for Dommeren (the room ends it too).
  r.borte(3);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "slutt");
});

// ---------- Detektiven ----------

test("Detektiven: «20 spørsmål» for three phones – the keeper's phone counts, a double tap counts once, points as on one phone", () => {
  const r = rom("detektiven", 3, { modus: "spm", kategorier: ["dyr", "mat"], nivaa: 2, antallH: 3, hint: true });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  const runde = () => sp().runde;
  assert.equal(sp().nett, true);
  assert.equal(sp().totalt, 3);
  assert.equal(sp().k, 0, "match 1: the host keeps the first secret");
  assert.equal(a.def.nett.skjerm(a.S), "hemmelig", "the keeper's phone has the card");
  assert.equal(b.def.nett.skjerm(b.S), "gi", "the others wait");
  assert.equal(b.def.nett.tur(b.S), 0);
  likt(a, b);
  // Another secret before the questioning starts: the keeper only, and once per secret.
  const h = runde().h;
  r.trekk(1, { ny: h });
  assert.equal(runde().h, h);
  r.trekk(0, { ny: h });
  const h2 = runde().h;
  assert.notEqual(h2, h);
  r.trekk(0, { ny: h }); // (a second tap for the old secret)
  assert.equal(runde().h, h2);
  r.trekk(0, { svar: "j", nr: 0 }); // not started
  assert.equal(runde().spm, 0);
  r.trekk(2, { start: h2 });
  assert.equal(runde().startet, false, "only the keeper starts");
  r.trekk(0, { start: h2 });
  assert.equal(runde().startet, true);
  assert.equal(a.def.nett.skjerm(a.S), "avhor");
  assert.equal(c.def.nett.skjerm(c.S), "avhor");
  r.trekk(0, { ny: h2 }); // started: no new secret
  assert.equal(runde().h, h2);
  // Counting: the keeper only; the question's number must fit; two taps for the same question count once.
  r.trekk(1, { svar: "j", nr: 0 });
  r.trekk(0, { svar: "q", nr: 0 });
  r.trekk(0, { svar: "j", nr: 3 });
  assert.equal(runde().spm, 0);
  r.trekk(0, { svar: "j", nr: 0 });
  r.trekk(0, { svar: "n", nr: 0 });
  assert.deepEqual(somJson(runde().svar), ["j"]);
  r.trekk(0, { angre: 0 }); // the number must fit
  r.trekk(0, { angre: 1 });
  assert.equal(runde().spm, 0);
  for (let n = 0; n < 9; n++) r.trekk(0, { svar: ["j", "n", "k", "x"][n % 4], nr: n });
  r.trekk(2, { hint: 0 }); // too early (9 questions)
  assert.equal(runde().hint, 0);
  r.trekk(0, { svar: "n", nr: 9 });
  r.trekk(2, { hint: 0 }); // anyone may show it once it is due
  r.trekk(1, { hint: 0 }); // (a second tap)
  assert.equal(runde().hint, 1);
  // Who guessed it: a detective still in – not the keeper.
  r.trekk(0, { gjettet: 0 });
  r.trekk(0, { gjettet: 7 });
  r.trekk(1, { gjettet: 1 }); // not the keeper's phone
  assert.ok(runde());
  r.trekk(0, { gjettet: 2 });
  assert.equal(runde(), null);
  assert.deepEqual(somJson(sp().poeng), [0, 0, 2], "11 questions with the guess: 2 to the one who guessed, nothing to the keeper");
  assert.equal(sp().k, 1, "the next secret goes to the next seat");
  assert.equal(a.def.nett.skjerm(a.S), "avsloring");
  assert.equal(a.def.nett.tur(a.S), 1);
  r.trekk(0, { neste: 1 });
  r.trekk(1, { neste: 0 });
  assert.equal(runde(), null);
  r.trekk(1, { neste: 1 });
  assert.ok(runde() && !runde().startet);
  assert.equal(b.def.nett.skjerm(b.S), "hemmelig");
  assert.equal(a.def.nett.skjerm(a.S), "gi");
  // Secret 2: all 20 used, nobody found it – 3 to the keeper.
  r.trekk(1, { start: runde().h });
  r.trekk(1, { ingen: 1 }); // not before 20
  for (let n = 0; n < 21; n++) r.trekk(1, { svar: "n", nr: n });
  assert.equal(runde().spm, 20);
  r.trekk(1, { ingen: 1 });
  assert.deepEqual(somJson(sp().poeng), [0, 3, 2]);
  // Secret 3: a quick solve gives the other detective 1, then the match is over.
  r.trekk(2, { neste: 2 });
  r.trekk(2, { start: runde().h });
  for (let n = 0; n < 4; n++) r.trekk(2, { svar: "j", nr: n });
  r.trekk(2, { gjettet: 0 });
  assert.deepEqual(somJson(sp().poeng), [2, 4, 2]);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.tur(a.S), null);
  assert.equal(a.def.nett.skjerm(a.S), "slutt", "a finished match, replayed: the result");
  r.trekk(0, { neste: 3 });
  likt(a, b);
  likt(a, c);
  likt(a, r.sen(1));
  // Match 2: the next seat keeps the first secret; another seed, other secrets.
  const r2 = rom("detektiven", 3, { modus: "spm", kategorier: ["dyr", "mat"], nivaa: 2, antallH: 3, hint: true }, 20261116, 2);
  assert.equal(r2.tlf[0].S.spill.k, 1);
  assert.notDeepEqual(somJson(r2.tlf[0].S.spill.rekke.slice(0, 5)), somJson(sp().rekke.slice(0, 5)));
});

test("Detektiven: «Hvem er jeg?» – every phone but the guesser's has the card and counts; «Alle mot hemmeligheten» has no points", () => {
  const r = rom("detektiven", 3, { modus: "jeg", antallH: 2 });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  const runde = () => sp().runde;
  assert.equal(sp().k, 0);
  assert.equal(a.def.nett.skjerm(a.S), "gi", "the guesser does not see the card");
  assert.equal(b.def.nett.skjerm(b.S), "hemmelig");
  assert.equal(c.def.nett.skjerm(c.S), "hemmelig");
  r.trekk(0, { start: runde().h }); // the guesser can't start
  assert.equal(runde().startet, false);
  r.trekk(2, { start: runde().h });
  r.trekk(1, { start: runde().h }); // (both did: once)
  assert.equal(runde().startet, true);
  // Two phones answer the same question at once: it counts once.
  r.trekk(1, { svar: "j", nr: 0 });
  r.trekk(2, { svar: "n", nr: 0 });
  r.trekk(0, { svar: "j", nr: 1 }); // not the guesser
  assert.deepEqual(somJson(runde().svar), ["j"]);
  r.trekk(2, { svar: "k", nr: 1 });
  r.trekk(1, { gjettet: 1 }); // in «Hvem er jeg?» only the guesser can have guessed it
  r.trekk(1, { gjettet: 0 });
  assert.deepEqual(somJson(sp().poeng), [3, 0, 0], "solved on 3 questions: 3 points");
  assert.equal(sp().k, 1);
  r.trekk(1, { neste: 1 });
  assert.equal(b.def.nett.skjerm(b.S), "gi");
  assert.equal(a.def.nett.skjerm(a.S), "hemmelig");
  r.trekk(0, { start: runde().h });
  r.trekk(2, { opp: 1 });
  assert.ok(a.def.nett.ferdig(a.S));
  assert.deepEqual(somJson(sp().poeng), [3, 0, 0]);
  likt(a, c);
  likt(a, r.sen(2));

  const s = rom("detektiven", 2, { modus: "sammen", antallH: 1 });
  const sp2 = () => s.tlf[0].S.spill;
  s.trekk(0, { start: sp2().runde.h });
  s.trekk(0, { gjettet: 1 }); // the group guesses: −1
  assert.ok(sp2().runde);
  s.trekk(0, { gjettet: -1 });
  assert.ok(s.tlf[0].def.nett.ferdig(s.tlf[0].S));
  assert.deepEqual(somJson(sp2().poeng), [0, 0]);
  assert.equal(sp2().logg[0].lost, true);
});

test("Detektiven: a seat that leaves – a keeper's secret goes away uncounted and the next seat gets a new one; it is not ranked", () => {
  const r = rom("detektiven", 4, { modus: "spm", antallH: 4 });
  const [a, , , d] = r.tlf;
  const sp = () => a.S.spill;
  const runde = () => sp().runde;
  r.trekk(0, { start: runde().h });
  r.trekk(0, { svar: "j", nr: 0 });
  const h = runde().h;
  // The keeper leaves in the middle of the questions.
  r.borte(0);
  assert.deepEqual(somJson(sp().ute), [0]);
  assert.equal(sp().k, 1);
  assert.ok(runde() && runde().h !== h && runde().spm === 0 && !runde().startet, "a new secret for the next seat");
  assert.equal(sp().logg.length, 0, "the secret that went away does not count");
  r.trekk(0, { start: runde().h }); // the seat that left can't play
  assert.equal(runde().startet, false);
  r.trekk(1, { start: runde().h });
  for (let n = 0; n < 3; n++) r.trekk(1, { svar: "n", nr: n });
  r.trekk(1, { gjettet: 0 }); // the seat that left can't have guessed it
  assert.ok(runde());
  r.trekk(1, { gjettet: 2 });
  assert.deepEqual(somJson(sp().poeng), [0, 0, 2, 1], "the other detective still in gets the point for a quick solve");
  assert.equal(sp().k, 2);
  // The next keeper leaves before starting: the one after takes it.
  r.borte(2);
  assert.equal(sp().k, 3);
  assert.equal(a.def.nett.tur(a.S), 3);
  r.trekk(3, { neste: 1 });
  r.trekk(3, { start: runde().h });
  r.trekk(3, { opp: 1 });
  r.trekk(1, { neste: 2 });
  r.trekk(1, { start: runde().h });
  r.trekk(1, { gjettet: 3 });
  assert.equal(sp().logg.length, 3);
  likt(a, d);
  likt(a, r.sen(1));
  // One left: over.
  r.borte(3);
  assert.ok(a.def.nett.ferdig(a.S));
});

// ---------- Tankeleseren ----------

test("Tankeleseren: «Sammen» for three phones – the giver's target, every guesser's needle, the middle of them scores", () => {
  const r = rom("tankeleseren", 3, { modus: "sammen", pakker: ["mat", "folk"] });
  const [a, b, c] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().nett, true);
  assert.equal(sp().modus, "sammen");
  assert.equal(sp().runder, 8);
  assert.equal(sp().giver, 0, "match 1: the host gives the first hint");
  assert.equal(sp().fase, "gi");
  assert.ok(["mat", "folk"].includes(a.window.RUSJ_DATA.spektrum.pakker.find((p) => p.par.some(([v, h]) => v === sp().par[0] && h === sp().par[1])).id));
  assert.equal(a.def.nett.skjerm(a.S), "hint", "the giver's phone has the target");
  assert.equal(b.def.nett.skjerm(b.S), "gi", "the others wait");
  assert.equal(c.def.nett.tur(c.S), 0);
  likt(a, b);
  // The other card: the giver only, before it is ready.
  const kort = sp().kort;
  const mal = sp().mal;
  r.trekk(1, { bytt: 1 });
  assert.equal(sp().kort, kort);
  r.trekk(0, { bytt: 1 });
  assert.notEqual(sp().kort, kort);
  assert.equal(sp().mal, mal, "the target stays where it is");
  r.trekk(1, { las: 50 }); // not ready yet
  r.trekk(1, { klar: 1 }); // not the giver
  assert.equal(sp().fase, "gi");
  r.trekk(0, { klar: 1, hint: "  Bade\u0000vann ‮" + "x".repeat(80) });
  assert.equal(sp().fase, "gjett");
  assert.ok(sp().hint.startsWith("Bade vann") && [...sp().hint].length <= 40, sp().hint);
  assert.equal(b.def.nett.skjerm(b.S), "skive");
  assert.equal(a.def.nett.skjerm(a.S), "hint", "the giver waits with the target");
  assert.equal(b.def.nett.tur(b.S), 1);
  assert.equal(c.def.nett.tur(c.S), 2);
  r.trekk(0, { las: 40 }); // the giver has no needle
  r.trekk(1, { las: 140 });
  r.trekk(1, { las: "50" });
  assert.deepEqual(somJson(sp().laste), {});
  r.trekk(1, { las: sp().mal - 4 });
  r.trekk(1, { las: 0 }); // once
  assert.equal(sp().fase, "gjett");
  r.trekk(2, { las: sp().mal + 4 });
  assert.equal(sp().fase, "fasit");
  assert.equal(sp().viser, Math.round(((sp().mal - 4 + sp().mal + 4) / 2) * 10) / 10);
  assert.equal(sp().logg[0].poeng, 4, "the middle of the two needles is a bullseye");
  assert.equal(sp().logg[0].naler.length, 2);
  // The next giver starts the next round.
  assert.equal(a.def.nett.tur(a.S), 1);
  r.trekk(2, { neste: 1 });
  r.trekk(1, { neste: 2 });
  assert.equal(sp().fase, "fasit");
  r.trekk(1, { neste: 1 });
  assert.equal(sp().runde, 2);
  assert.equal(sp().giver, 1);
  assert.equal(sp().fase, "gi");
  likt(a, c);
  // The rest of the eight rounds: one needle bang on, one far off.
  for (let n = 0; n < 40 && !a.def.nett.ferdig(a.S); n++) {
    const g = sp().giver;
    r.trekk(g, { klar: 1, hint: "" });
    const [x, y] = [0, 1, 2].filter((i) => i !== g);
    r.trekk(x, { las: sp().mal });
    r.trekk(y, { las: n % 2 ? sp().mal : Math.min(100, sp().mal + 20) });
    if (!a.def.nett.ferdig(a.S)) r.trekk(a.def.nett.tur(a.S), { neste: sp().runde });
  }
  assert.ok(a.def.nett.ferdig(a.S), "the match did not end");
  assert.equal(sp().logg.length, 8);
  assert.equal(a.def.nett.tur(a.S), null);
  assert.equal(a.def.nett.skjerm(a.S), "slutt", "a finished match, replayed: the result");
  likt(a, b);
  likt(a, r.sen(2), (x) => [x.logg, x.runde, x.giver]);
  // Match 2: the next seat gives the first hint, other targets.
  const r2 = rom("tankeleseren", 3, { modus: "sammen" }, 20261116, 2);
  assert.equal(r2.tlf[0].S.spill.giver, 1);
  assert.notEqual(r2.tlf[0].S.spill.mal, rom("tankeleseren", 3, { modus: "sammen" }).tlf[0].S.spill.mal);
});

test("Tankeleseren: «Lag mot lag» for four phones – the team on turn locks its needles, the other team bets; under four it is «Sammen»", () => {
  assert.equal(rom("tankeleseren", 3, { modus: "lag" }).tlf[0].S.spill.modus, "sammen");
  const r = rom("tankeleseren", 4, { modus: "lag", pakker: ["hverdag"] });
  const [a, b, , d] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "lag");
  assert.deepEqual(somJson(sp().lag), [0, 1, 0, 1]);
  assert.equal(sp().tur, 0);
  assert.equal(sp().giver, 0);
  r.trekk(0, { klar: 1, hint: "Suppe" });
  r.trekk(1, { las: 50 }); // the other team doesn't drag
  assert.deepEqual(somJson(sp().laste), {});
  r.trekk(2, { las: sp().mal + 10 });
  assert.equal(sp().fase, "motlag");
  assert.equal(b.def.nett.tur(b.S), 1, "the other team bets");
  r.trekk(2, { tipp: "v" }); // not the betting team
  assert.equal(sp().fase, "motlag");
  r.trekk(3, { tipp: "v" });
  r.trekk(1, { tipp: "h" }); // (too late: the first one counts)
  assert.equal(sp().fase, "fasit");
  assert.equal(sp().logg[0].tipp, "v");
  assert.equal(sp().logg[0].tippRiktig, true, "the target is left of the needle");
  assert.equal(sp().logg[0].poeng, 2, "ten off: 2 points");
  // Blå's turn: its first member gives the hint.
  assert.equal(a.def.nett.tur(a.S), 1);
  r.trekk(1, { neste: 1 });
  assert.equal(sp().tur, 1);
  assert.equal(sp().giver, 1);
  likt(a, d);
  for (let n = 0; n < 80 && !a.def.nett.ferdig(a.S); n++) {
    const g = sp().giver;
    r.trekk(g, { klar: 1 });
    for (const i of [0, 1, 2, 3]) if (i !== g && sp().lag[i] === sp().tur) r.trekk(i, { las: n % 3 ? sp().mal : Math.max(0, sp().mal - 9) });
    const m = [0, 1, 2, 3].find((i) => sp().lag[i] !== sp().tur);
    r.trekk(m, { tipp: n % 2 ? "-" : "h" });
    if (!a.def.nett.ferdig(a.S)) r.trekk(a.def.nett.tur(a.S), { neste: sp().runde });
  }
  assert.ok(a.def.nett.ferdig(a.S), "no team reached 10");
  assert.ok(sp().vinner === 0 || sp().vinner === 1);
  likt(a, b);
  likt(a, r.sen(3), (x) => [x.logg, x.runde, x.tur, x.vinner]);
});

test("Tankeleseren: seats that leave – a giver before it is ready hands the round on, a needle nobody waits for, a team too small ends it", () => {
  const r = rom("tankeleseren", 4, { modus: "sammen" });
  const [a, , , d] = r.tlf;
  const sp = () => a.S.spill;
  const mal = sp().mal;
  r.borte(0);
  assert.equal(sp().giver, 1, "the next seat gives the hint");
  assert.equal(sp().fase, "gi");
  assert.equal(sp().runde, 1);
  assert.notEqual(sp().mal, mal, "a new target");
  r.trekk(0, { klar: 1 });
  assert.equal(sp().fase, "gi");
  r.trekk(1, { klar: 1 });
  r.trekk(2, { las: sp().mal });
  // The last one still dragging leaves: the round is revealed with the needles there are.
  r.borte(3);
  assert.equal(sp().fase, "fasit");
  assert.equal(sp().logg[0].poeng, 4);
  assert.equal(a.def.nett.tur(a.S), 2);
  likt(a, d, (x) => [x.logg, x.fase, x.giver, x.ute]);
  likt(a, r.sen(1), (x) => [x.logg, x.fase, x.giver, x.ute]);

  // «Lag mot lag» with five: Rosa 0, 2, 4 and Blå 1, 3. Blå loses one: too few to go on.
  const l = rom("tankeleseren", 5, { modus: "lag" });
  const lp = () => l.tlf[0].S.spill;
  l.trekk(0, { klar: 1 });
  l.borte(4);
  assert.ok(!l.tlf[0].def.nett.ferdig(l.tlf[0].S), "Rosa still has two");
  l.trekk(2, { las: lp().mal });
  assert.equal(lp().fase, "motlag");
  l.borte(3);
  assert.ok(l.tlf[0].def.nett.ferdig(l.tlf[0].S), "Blå has one left: the match is over");
  assert.equal(l.tlf[0].def.nett.skjerm(l.tlf[0].S), "slutt");
});

// ---------- Kodeknekkeren ----------

// The first card of a type that is still face down (from the key every phone has).
const kkKort = (sp, type) => sp.nokkel.findIndex((t, i) => t === type && !sp.vist.includes(i));
// A guesser of the team on turn (not its code master, still in).
const kkGjetter = (sp) => Array.from({ length: sp.antall }, (_, i) => i).find((i) => !sp.ute.includes(i) && !sp.mester.includes(i) && (sp.modus === "sammen" || sp.lag[sp.tur].includes(i)));

test("Kodeknekkeren: «Lag mot lag» for four phones – the code masters have the key, a guesser of the team on turn taps; races and strangers ignored", () => {
  const r = rom("kodeknekkeren", 4, { modus: "lag", kamp: "ett", lett: false });
  const [a, b, c, d] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().nett, true);
  assert.equal(sp().modus, "lag");
  assert.deepEqual(somJson(sp().lag), [[0, 2], [1, 3]], "the seats take turns to be Rosa and Blå");
  assert.deepEqual(somJson(sp().mester), [0, 1], "match 1: the first of each team holds the key");
  assert.equal(sp().start, 0);
  assert.equal(sp().tid, 0, "no turn timer on the net");
  assert.equal(sp().ord.length, 25);
  likt(a, d);
  assert.equal(a.def.nett.tur(a.S), 0, "Rosa's turn on Rosa's phones");
  assert.equal(c.def.nett.tur(c.S), 2);
  assert.equal(b.def.nett.tur(b.S), 0, "Blå waits for Rosa's code master");
  // The hint strip: Rosa's code master only.
  r.trekk(2, { hint: { ord: "Hav", n: 2 }, h: 0 });
  r.trekk(1, { hint: { ord: "Hav", n: 2 }, h: 0 });
  r.trekk(0, { hint: { ord: "Hav", n: 7 }, h: 0 });
  assert.equal(sp().hint, null);
  r.trekk(0, { hint: { ord: " Hav\u0000", n: 2 }, h: 0 });
  assert.deepEqual(somJson(sp().hint), { ord: "Hav", n: 2 });
  assert.equal(sp().hintlogg.length, 1);
  // Cards: not the code master, not Blå, not with an old count of steps.
  const egen = kkKort(sp(), 0);
  r.trekk(0, { kort: egen, h: 1 });
  r.trekk(3, { kort: egen, h: 1 });
  r.trekk(2, { kort: egen, h: 0 });
  r.trekk(2, { kort: 25, h: 1 });
  assert.equal(sp().vist.length, 0);
  r.trekk(2, { kort: egen, h: 1 });
  assert.deepEqual(somJson(sp().vist), [egen]);
  // Two phones tap at the same moment: the second one counted the steps before the first card.
  r.trekk(2, { kort: kkKort(sp(), 0), h: 1 });
  assert.equal(sp().vist.length, 1, "a stale tap is ignored");
  assert.equal(sp().tur, 0);
  // «Lag Rosa er ferdig»: anyone of Rosa, with the steps so far.
  r.trekk(1, { ferdig: sp().hist.length });
  r.trekk(2, { ferdig: 0 });
  assert.equal(sp().tur, 0);
  r.trekk(0, { ferdig: sp().hist.length });
  assert.equal(sp().tur, 1);
  assert.equal(sp().hint, null, "the strip is empty for the next team");
  assert.equal(b.def.nett.tur(b.S), 1);
  // Blå hits a neutral word: the turn goes back to Rosa.
  r.trekk(3, { kort: kkKort(sp(), 2), h: sp().hist.length });
  assert.equal(sp().tur, 0);
  // Rosa finds all its agents: the board is won, and with «Ett brett» the match too.
  for (let n = 0; n < 12 && !a.def.nett.ferdig(a.S); n++) r.trekk(2, { kort: kkKort(sp(), 0), h: sp().hist.length });
  assert.equal(sp().grunn, "alle");
  assert.equal(sp().vinner, 0);
  assert.deepEqual(somJson(sp().stilling), [1, 0]);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.tur(a.S), null);
  assert.equal(a.def.nett.skjerm(a.S), "karing", "a finished match, replayed: «Kåringen»");
  r.trekk(1, { neste: 0 });
  likt(a, b);
  likt(a, c, (x) => [x.vist, x.hist, x.stilling, x.mester, x.ferdig]);
  likt(a, r.sen(3), (x) => [x.vist, x.hist, x.stilling, x.mester, x.ferdig, x.beste]);
  // Match 2: the next ones hold the key, Blå begins, another board.
  const r2 = rom("kodeknekkeren", 4, { modus: "lag", kamp: "ett" }, 20261116, 2);
  assert.deepEqual(somJson(r2.tlf[0].S.spill.mester), [2, 3]);
  assert.equal(r2.tlf[0].S.spill.start, 1);
  assert.notDeepEqual(somJson(r2.tlf[0].S.spill.ord), somJson(sp().ord));
});

test("Kodeknekkeren: «Best av 3» – the next board from the one who leads it, the key moves on; «Fri kamp» ends on request", () => {
  const r = rom("kodeknekkeren", 5, { modus: "lag", kamp: "best3" });
  const [a, , , , e] = r.tlf;
  const sp = () => a.S.spill;
  assert.deepEqual(somJson(sp().lag), [[0, 2, 4], [1, 3]]);
  // Rosa turns the trap: Blå takes board 1.
  r.trekk(2, { kort: kkKort(sp(), 3), h: 0 });
  assert.equal(sp().grunn, "fella");
  assert.equal(sp().vinner, 1);
  assert.ok(!a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "resultat");
  // Board 2 starts with Blå, led by Blå's next code master (3); Rosa's key goes to 2.
  assert.equal(a.def.nett.tur(a.S), 3);
  r.trekk(1, { neste: 0 });
  r.trekk(3, { neste: 1 });
  r.trekk(3, { karing: 1 }); // not in «Best av 3»
  assert.equal(sp().brett, 0);
  r.trekk(3, { neste: 0 });
  assert.equal(sp().brett, 1);
  assert.equal(sp().start, 1);
  assert.deepEqual(somJson(sp().mester), [2, 3]);
  assert.deepEqual(somJson(sp().stilling), [0, 1], "the score goes with the match");
  likt(a, e, (x) => [x.brett, x.mester, x.stilling, x.ord]);
  // Blå turns the trap: 1–1, board 3 is led by Rosa's next code master (4).
  r.trekk(1, { kort: kkKort(sp(), 3), h: 0 });
  assert.deepEqual(somJson(sp().stilling), [1, 1]);
  r.trekk(4, { neste: 1 });
  assert.deepEqual(somJson(sp().mester), [4, 1]);
  r.trekk(2, { kort: kkKort(sp(), 3), h: 0 });
  assert.deepEqual(somJson(sp().stilling), [1, 2]);
  assert.ok(a.def.nett.ferdig(a.S), "first to two");

  const f = rom("kodeknekkeren", 4, { modus: "lag", kamp: "fri" });
  const fp = () => f.tlf[0].S.spill;
  f.trekk(2, { kort: kkKort(fp(), 3), h: 0 });
  assert.ok(!f.tlf[0].def.nett.ferdig(f.tlf[0].S), "«Fri kamp» goes on");
  f.trekk(0, { karing: 1 }); // not the one who leads the next board
  assert.ok(!fp().ferdig);
  f.trekk(f.tlf[0].def.nett.tur(f.tlf[0].S), { karing: 1 });
  assert.ok(fp().ferdig && f.tlf[0].def.nett.ferdig(f.tlf[0].S));
  assert.equal(f.tlf[0].def.nett.skjerm(f.tlf[0].S), "karing");
});

test("Kodeknekkeren: «Sammen mot fella» under four (also when the host chose teams) – seven hints, one code master", () => {
  const r = rom("kodeknekkeren", 3, { modus: "lag", kamp: "best3" });
  const [a, b] = r.tlf;
  const sp = () => a.S.spill;
  assert.equal(sp().modus, "sammen");
  assert.equal(sp().kamp, "ett");
  assert.deepEqual(somJson(sp().mester), [0]);
  assert.equal(b.def.nett.tur(b.S), 1, "everyone guesses");
  r.trekk(0, { kort: kkKort(sp(), 0), h: 0 }); // the code master doesn't tap
  assert.equal(sp().vist.length, 0);
  r.trekk(1, { kort: kkKort(sp(), 0), h: 0 });
  r.trekk(2, { kort: kkKort(sp(), 2), h: 1 }); // neutral: the hint is used
  assert.equal(hintNrAv(sp()), 2);
  for (let n = 0; n < 6; n++) r.trekk(n % 2 ? 0 : 2, { ferdig: sp().hist.length });
  assert.equal(sp().grunn, "hint", "seven hints used");
  assert.ok(a.def.nett.ferdig(a.S));
  likt(a, b);
  likt(a, r.sen(2), (x) => [x.vist, x.hist, x.grunn, x.ferdig]);
});
function hintNrAv(sp) {
  return sp.hist.filter((h) => h.t !== "hint" && (h.t !== "kort" || sp.nokkel[h.i] !== 0)).length + 1;
}

test("Kodeknekkeren: a code master that leaves hands the key on; a team left with one ends the match", () => {
  const r = rom("kodeknekkeren", 5, { modus: "lag", kamp: "best3" });
  const [a, , , , e] = r.tlf;
  const sp = () => a.S.spill;
  r.trekk(2, { kort: kkKort(sp(), 0), h: 0 });
  r.borte(0);
  assert.deepEqual(somJson(sp().ute), [0]);
  assert.deepEqual(somJson(sp().mester), [2, 1], "Rosa's key goes to the next one on Rosa");
  assert.equal(sp().melding.type, "tur");
  r.trekk(2, { kort: kkKort(sp(), 0), h: sp().hist.length }); // the new code master doesn't tap
  assert.equal(sp().vist.length, 1);
  r.trekk(4, { kort: kkKort(sp(), 0), h: sp().hist.length });
  assert.equal(sp().vist.length, 2);
  r.trekk(0, { ferdig: sp().hist.length }); // the seat that left
  assert.equal(sp().tur, 0);
  likt(a, e);
  likt(a, r.sen(1), (x) => [x.vist, x.mester, x.ute, x.tur]);
  // Blå loses one: one left, too few for a team.
  r.borte(3);
  assert.ok(sp().ferdig && sp().stopp);
  assert.ok(a.def.nett.ferdig(a.S));
  assert.equal(a.def.nett.skjerm(a.S), "karing");
  // «Sammen»: the code master leaves – the next one still in holds the key.
  const s = rom("kodeknekkeren", 3, { modus: "sammen" });
  s.borte(0);
  assert.deepEqual(somJson(s.tlf[1].S.spill.mester), [1]);
  assert.ok(!s.tlf[1].def.nett.ferdig(s.tlf[1].S));
});
