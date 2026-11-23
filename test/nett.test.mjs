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

function telefon(id, meg, valg = {}) {
  const lager = new Map();
  const location = { protocol: "https:", origin: "https://rusj.no", pathname: `/${id}/`, hash: "", search: "" };
  const window = {
    RUSJ_SPILL: { id, navn: id },
    RUSJ_DATA: {},
    RUSJ_NETT: valg.adresse === undefined ? ADR : valg.adresse,
    RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" },
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
