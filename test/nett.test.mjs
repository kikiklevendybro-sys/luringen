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
import { SPILL } from "../nett/src/oppsett.js";
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

function telefon(id, meg, valg = {}) {
  const lager = new Map();
  const location = { protocol: "https:", origin: "https://rusj.no", pathname: `/${id}/`, hash: "", search: "" };
  const window = {
    RUSJ_SPILL: { id, navn: id },
    RUSJ_DATA: spillData(id),
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
  if (R.nett) {
    R.nett.meg = () => meg;
    R.nett.erMeg = (i) => i === meg;
    R.nett.aktiv = () => true;
  }
  return { R, def, S, meg, lager, window };
}

// The room's part: a list of moves, each played on every phone in the same order.
function rom(id, antall, oppsett, fro = 20261115, kamp = 1) {
  const tlf = Array.from({ length: antall }, (_, i) => telefon(id, i));
  const logg = [];
  const okt = (p, n, gjenspill = true) => ({ n, gjenspill, meg: p.meg, kamp, fro, oppsett, antall, rng: p.R.nett.tilfeldig(fro, n) });
  for (const p of tlf) p.def.nett.start(p.S, okt(p, null));
  return {
    tlf,
    logg,
    trekk(sete, t) {
      const n = logg.length;
      logg.push([sete, t]);
      for (const p of tlf) p.def.nett.trekk(p.S, JSON.parse(JSON.stringify(t)), sete, okt(p, n));
    },
    // A seat leaves a play-on match: the room adds its «borte» move, the kit calls the game's borte.
    borte(sete) {
      const n = logg.length;
      logg.push([sete, { $: "borte" }]);
      for (const p of tlf) if (p.meg !== sete) p.def.nett.borte(p.S, sete, okt(p, n));
    },
    // A late phone: a fresh copy that replays the whole list.
    sen(meg) {
      const p = telefon(id, meg);
      p.def.nett.start(p.S, okt(p, null));
      logg.forEach(([s, t], n) => (t.$ === "borte" ? p.def.nett.borte(p.S, s, okt(p, n)) : p.def.nett.trekk(p.S, JSON.parse(JSON.stringify(t)), s, okt(p, n))));
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
