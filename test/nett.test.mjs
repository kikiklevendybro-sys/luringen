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
    // A late phone: a fresh copy that replays the whole list.
    sen(meg) {
      const p = telefon(id, meg);
      p.def.nett.start(p.S, okt(p, null));
      logg.forEach(([s, t], n) => p.def.nett.trekk(p.S, JSON.parse(JSON.stringify(t)), s, okt(p, n)));
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
