// Anonymous statistics on the site: the switch in scripts/rusj.mjs, and the sender
// (rusj/kit/stat.js) — whose own tests live with the Worker in statistikk/test/klient.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { CSP, lagCsp, statOpprinnelse, statFil, STAT_ADRESSE } from "../scripts/rusj.mjs";
import { nettleser, MIN } from "../statistikk/test/falsk-nettleser.mjs";
import { renNokkel } from "../statistikk/src/nokler.js";
import "../statistikk/test/klient.test.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");

// (The second argument of lagCsp is the rooms for playing on the net – off here: test/nett.test.mjs.)
test("statistics off: the CSP allows no outside request and no stat.js is made", () => {
  assert.equal(lagCsp("", ""), lagCsp(statOpprinnelse(""), ""));
  assert.match(lagCsp("", ""), /connect-src 'self';/);
  assert.equal(statFil(ROT, ""), null);
  if (!STAT_ADRESSE) assert.equal(CSP, lagCsp(""));
});

test("statistics on: only the Worker's origin is added to connect-src", () => {
  const csp = lagCsp("https://rusj-statistikk.eksempel.workers.dev", "");
  assert.match(csp, /connect-src 'self' https:\/\/rusj-statistikk\.eksempel\.workers\.dev;/);
  assert.equal(csp.replace(" https://rusj-statistikk.eksempel.workers.dev", ""), lagCsp("", ""));
  const fil = statFil(ROT, "https://rusj-statistikk.eksempel.workers.dev");
  assert.ok(fil.innhold.startsWith('window.RUSJ_STAT="https://rusj-statistikk.eksempel.workers.dev";\n'));
  assert.match(fil.sti, /^\/felles\/stat\.js\?v=/);
});

test("the address must be a bare https origin (or localhost for tests)", () => {
  assert.equal(statOpprinnelse("https://a.workers.dev/"), "https://a.workers.dev");
  assert.equal(statOpprinnelse("http://127.0.0.1:9"), "http://127.0.0.1:9");
  for (const feil of ["http://a.workers.dev", "https://a.workers.dev/t", "https://a.workers.dev/?x=1", "https://u:p@a.workers.dev", "javascript:alert(1)", "ftp://a.dev"]) {
    assert.throws(() => statOpprinnelse(feil), feil);
  }
});

// ---------- The sender on the phone: the groups it works out itself ----------

// The names of the first request of a page, after the short wait.
const forste = (valg) => {
  const n = nettleser(valg);
  n.fram(1500);
  return n.nokler();
};
const gruppe = (navn, prefiks) => navn.filter((k) => k.startsWith(prefiks + "."));

test("source: search engines, social networks, direct and other – from fixed host lists, as one word", () => {
  const tilfeller = {
    sok: ["https://www.google.com/", "https://www.google.no/", "https://google.co.uk/", "https://www.bing.com/search?q=rusj", "https://duckduckgo.com/", "https://search.yahoo.com/", "https://no.search.yahoo.com/", "https://www.ecosia.org/", "https://www.startpage.com/", "https://www.kvasir.no/", "android-app://com.google.android.googlequicksearchbox/"],
    sosial: ["https://l.facebook.com/", "https://m.facebook.com/", "https://www.instagram.com/", "https://l.instagram.com/", "https://www.tiktok.com/", "https://www.snapchat.com/", "https://x.com/", "https://t.co/abc", "https://twitter.com/", "https://www.reddit.com/r/norge", "https://out.reddit.com/", "https://www.linkedin.com/", "https://lnkd.in/x", "https://no.pinterest.com/", "https://pin.it/x", "https://www.youtube.com/", "https://youtu.be/x", "https://www.messenger.com/"],
    direkte: [""],
    annen: ["https://example.com/", "https://www.vg.no/", "https://google.example.com/", "https://notgoogle.com/", "https://facebook.example.org/", "https://mail.proton.me/", "android-app://com.example.app/", "ikke en adresse"],
  };
  for (const [ord, liste] of Object.entries(tilfeller)) {
    for (const fra of liste) assert.deepEqual(gruppe(forste({ fra }), "kilde"), ["kilde." + ord], `${fra} → ${ord}`);
  }
  // rusj itself is not a source: a visit that starts from one of its own pages says nothing.
  for (const fra of ["https://rusj.no/", "https://rusj.no/ordugla/"]) assert.deepEqual(gruppe(forste({ fra }), "kilde"), [], fra);
});

test("source: the referring address never leaves the phone, only the word", () => {
  const fra = "https://www.google.no/search?q=hemmelig+s%C3%B8k&kari=nordmann";
  const n = nettleser({ fra, url: "https://rusj.no/ordugla/" });
  n.fram(1500);
  const kropp = n.sendt.map((s) => s.valg.body).join("\n");
  assert.match(kropp, /"kilde\.sok"/);
  assert.doesNotMatch(kropp, /google|hemmelig|kari|nordmann|search|https?:/);
  assert.equal(n.sendt[0].valg.referrerPolicy, "no-referrer");
  for (const k of n.nokler()) assert.equal(renNokkel(k), k, k);
});

test("source: only once per visit, from the page that began it; back after a pause is «direkte»", () => {
  const lager = new Map();
  const a = nettleser({ lager, fra: "https://www.facebook.com/" });
  a.fram(1500);
  a.lukk();
  // The next page in the same visit (even with a referrer): no source again.
  const b = nettleser({ lager, url: "https://rusj.no/ordugla/", naa: a.klokke.naa + 5000, fra: "https://www.google.com/" });
  b.fram(1500);
  assert.deepEqual(gruppe(b.nokler(), "kilde"), []);
  // The same tab, looked at again an hour later: a new visit that came straight back.
  b.skjul();
  b.fram(60 * MIN);
  b.vis();
  b.fram(1500);
  assert.deepEqual(b.pakker().at(-1), ["besok", "utgave.nb", "type.pc", "kilde.direkte"]);
  assert.deepEqual(gruppe(a.nokler(), "kilde"), ["kilde.sosial"]);
});

test("device type: touch screens split by their shorter side, everything else is a PC", () => {
  const type = (valg) => gruppe(forste(valg), "type");
  assert.deepEqual(type({ peker: "grov", vindu: [390, 844] }), ["type.mobil"]);
  assert.deepEqual(type({ peker: "grov", vindu: [844, 390] }), ["type.mobil"], "a phone on its side");
  assert.deepEqual(type({ peker: "grov", vindu: [320, 568] }), ["type.mobil"]);
  assert.deepEqual(type({ peker: "grov", vindu: [820, 1180] }), ["type.nettbrett"]);
  assert.deepEqual(type({ peker: "grov", vindu: [1366, 1024] }), ["type.nettbrett"]);
  assert.deepEqual(type({ peker: "fin", vindu: [1280, 800] }), ["type.pc"]);
  assert.deepEqual(type({ peker: "fin", vindu: [500, 700] }), ["type.pc"], "a small window on a PC is still a PC");
  // No media queries at all: nothing is guessed.
  assert.deepEqual(type({ ekstra: { matchMedia: undefined } }), []);
  // Only yes/no questions are asked; no size is ever read out.
  const n = nettleser({ peker: "grov", vindu: [390, 844] });
  assert.ok(n.medier.every((q) => ["(pointer: coarse)", "(max-width: 599px), (max-height: 599px)", "(display-mode: standalone)"].includes(q)), n.medier.join(" | "));
});

test("edition: from the address, once per visit", () => {
  assert.deepEqual(gruppe(forste({ url: "https://rusj.no/" }), "utgave"), ["utgave.nb"]);
  assert.deepEqual(gruppe(forste({ url: "https://rusj.no/en/" }), "utgave"), ["utgave.en"]);
  assert.deepEqual(gruppe(forste({ url: "https://rusj.no/da/fireren/" }), "utgave"), ["utgave.da"]);
  assert.deepEqual(gruppe(forste({ url: "https://rusj.no/ordugla/" }), "utgave"), ["utgave.nb"]);
});

test("a new install: «app.ny» the first time rusj runs from the home screen, never again", () => {
  const lager = new Map();
  const a = nettleser({ lager, appmodus: true });
  a.fram(1500);
  a.lukk();
  assert.ok(a.nokler().includes("app.ny"));
  assert.equal(a.notat().app, 1);
  for (const d of [0.01, 1, 40]) {
    const b = nettleser({ lager, appmodus: true, naa: a.klokke.naa + d * 86400000 });
    b.fram(1500);
    b.lukk();
    assert.ok(!b.nokler().includes("app.ny"), String(d));
  }
  // In the browser first, then from the home screen the same day: counted at once.
  const lager2 = new Map();
  const c = nettleser({ lager: lager2 });
  c.fram(1500);
  c.lukk();
  assert.ok(!c.nokler().includes("app.ny"));
  const d = nettleser({ lager: lager2, appmodus: true, naa: c.klokke.naa + 5000 });
  d.fram(1500);
  assert.deepEqual(d.nokler(), ["side.forside", "app.ny"]);
});

test("errors: «feil.<game>» at most once per page view, on game pages only, with nothing about the error", () => {
  const n = nettleser({ url: "https://rusj.no/sauen/" });
  n.feil("TypeError: hemmelig is undefined");
  n.avvist(new Error("hemmelig grunn"));
  n.feil();
  n.fram(1500);
  for (let i = 0; i < 5; i++) n.feil();
  n.fram(60 * 1000);
  assert.equal(n.nokler().filter((k) => k === "feil.sauen").length, 1);
  assert.doesNotMatch(n.sendt.map((s) => s.valg.body).join(), /hemmelig|TypeError|spill\.js/);
  // A page restored from the back/forward cache is a new page view: one more is allowed.
  n.lukk();
  n.tilbakeFraBuffer();
  n.feil();
  n.feil();
  n.fram(1500);
  assert.equal(n.nokler().filter((k) => k === "feil.sauen").length, 2);
  // An unhandled promise alone counts too; the front page never counts.
  const p = nettleser({ url: "https://rusj.no/ordugla/" });
  p.avvist();
  p.fram(1500);
  assert.ok(p.nokler().includes("feil.ordugla"));
  const f = nettleser();
  f.feil();
  f.fram(1500);
  assert.ok(!f.nokler().some((k) => k.startsWith("feil.")));
});

test("online play and the calendar: per-game events and the calendar's three buttons", () => {
  const n = nettleser({ url: "https://rusj.no/fireren/" });
  for (const h of ["nett.rom", "nett.start", "nett.ferdig", "nett.kode", "nett", "nett.rom.fireren", "jul.utskrift"]) n.stat.hendelse(h);
  n.fram(1500);
  assert.deepEqual(n.nokler().filter((k) => /^(nett|jul)\./.test(k)), ["nett.rom.fireren", "nett.start.fireren", "nett.ferdig.fireren"]);
  const j = nettleser({ url: "https://rusj.no/julekalenderen/" });
  for (const h of ["jul.utskrift", "jul.paminnelse", "jul.tre", "jul.tre", "jul.annet", "utskrift", "bilde"]) j.stat.hendelse(h);
  j.fram(1500);
  assert.deepEqual(j.nokler().filter((k) => /^jul\./.test(k)), ["jul.utskrift", "jul.paminnelse", "jul.tre"]);
  // The same events from the front page are dropped.
  const f = nettleser();
  for (const h of ["nett.rom", "jul.tre"]) f.stat.hendelse(h);
  f.fram(1500);
  assert.ok(!f.nokler().some((k) => /^(nett|jul)\./.test(k)));
});

test("silent with Do Not Track, Global Privacy Control or data saving: no errors, rooms or buttons either", () => {
  for (const nav of [{ doNotTrack: "1" }, { globalPrivacyControl: true }, { connection: { saveData: true } }]) {
    const n = nettleser({ url: "https://rusj.no/julekalenderen/", nav, fra: "https://www.google.com/", peker: "grov", appmodus: true });
    n.feil();
    n.avvist();
    for (const h of ["start", "ferdig", "nett.rom", "nett.start", "nett.ferdig", "jul.utskrift", "jul.paminnelse", "jul.tre"]) n.stat.hendelse(h);
    n.fram(60 * MIN);
    n.lukk();
    assert.equal(n.sendt.length, 0, JSON.stringify(nav));
    assert.deepEqual(n.lagerKall, [], JSON.stringify(nav));
    assert.deepEqual(n.medier, [], "not even the media queries are asked");
  }
});

test("a busy moment: a full batch is sent at once and nothing is dropped", () => {
  const n = nettleser({ url: "https://rusj.no/julekalenderen/", appmodus: true, fra: "https://www.google.com/" });
  for (const h of ["start", "ferdig", "nett.rom", "nett.start", "nett.ferdig", "jul.utskrift", "jul.paminnelse", "jul.tre"]) n.stat.hendelse(h);
  n.stat.daglig(1, 3);
  n.feil();
  n.fram(1500);
  assert.ok(n.pakker().every((p) => p.length <= 16));
  assert.equal(new Set(n.nokler()).size, n.nokler().length);
  assert.ok(n.nokler().length > 16, String(n.nokler().length));
  for (const k of ["side.julekalenderen", "kilde.sok", "app.ny", "jul.tre", "rekke.2", "feil.julekalenderen"]) assert.ok(n.nokler().includes(k), k);
});

// ---------- The kit's hooks: R.nett counts rooms on the phone that made them ----------

const NETT = "https://rusj-nett.eksempel.workers.dev";
function nettTelefon({ lenke = "" } = {}) {
  const id = "fireren";
  const lager = new Map();
  const sokler = [];
  class FalskWs {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.sendt = [];
      sokler.push(this);
    }
    send(m) {
      this.sendt.push(m);
    }
    close() {}
  }
  const location = { protocol: "https:", origin: "https://rusj.no", pathname: `/${id}/`, hash: lenke, search: "", href: `https://rusj.no/${id}/${lenke}` };
  const window = { RUSJ_SPILL: { id, navn: id }, RUSJ_DATA: {}, RUSJ_NETT: NETT, RusjGjengen: { svg: () => "<svg></svg>", logo: () => "<svg></svg>" }, matchMedia: () => ({ matches: false }), addEventListener() {}, location };
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
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    performance,
    WebSocket: FalskWs,
    fetch: async () => ({ ok: true, json: async () => ({ kode: "ABC234" }) }),
  };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/rusj.js"), "utf8"), kontekst);
  const R = window.Rusj;
  let def = null;
  R.start = (d) => (def = d);
  R._nettBytt = () => R.S;
  R.paNett = () => true;
  vm.runInContext(readFileSync(join(ROT, "rusj/kit/nett.js"), "utf8"), kontekst);
  const hendelser = [];
  // The parts of the kit that draw on the screen are not needed here.
  Object.assign(R, { gaTil: (s) => (R.S.skjerm = s), vis() {}, ark() {}, lukkArk() {}, toast() {}, si() {}, vibrer() {}, statistikk: (h) => hendelser.push(h) });
  R.S = { skjerm: "hjem" };
  vm.runInContext(readFileSync(join(ROT, "rusj/spill", id, "spill.js"), "utf8"), kontekst);
  R.S = Object.assign({ skjerm: "hjem" }, def.tilstand());
  const fra = (ws, m) => ws.onmessage({ data: JSON.stringify(m) });
  const rom = (du, startet = false) => ({ h: "rom", spill: id, oppsett: {}, fro: 7, kamp: 1, min: 2, maks: 2, startet, ferdig: false, seter: [{ navn: "" }, { navn: "B" }], logg: [], du, token: "plass" + du });
  return { R, def, hendelser, sokler, fra, rom };
}

test("R.nett: the phone that made the room counts the room, its start and its end – once each", async () => {
  const t = nettTelefon();
  await t.def.handlinger["nett-apne"]();
  assert.deepEqual(t.hendelser, ["nett.rom"]);
  const ws = t.sokler[0];
  ws.onopen();
  t.fra(ws, t.rom(0));
  t.fra(ws, { h: "start" });
  assert.deepEqual(t.hendelser, ["nett.rom", "start", "nett.start"]);
  t.fra(ws, { h: "start" }); // said twice: counted once
  // The match ends by the game's own rules after a move.
  t.def.nett.ferdig = () => true;
  t.fra(ws, { h: "trekk", n: 0, s: 1, t: {} });
  t.fra(ws, { h: "trekk", n: 1, s: 0, t: {} });
  assert.deepEqual(t.hendelser, ["nett.rom", "start", "nett.start", "ferdig", "nett.ferdig"]);
});

test("R.nett: a phone that joined from a link counts its own start and end, but no room events", async () => {
  const t = nettTelefon({ lenke: "#nett=ABC234" });
  assert.ok(t.def.handlinger["nett-bli"], "joining needs the «Bli med» action");
  t.def.handlinger["nett-bli"]();
  const ws = t.sokler[0];
  ws.onopen();
  t.fra(ws, t.rom(1));
  t.fra(ws, { h: "start" });
  t.def.nett.ferdig = () => true;
  t.fra(ws, { h: "trekk", n: 0, s: 0, t: {} });
  assert.deepEqual(t.hendelser, ["start", "ferdig"]);
});

// ---------- The calendar's three buttons go to the counter (the clicks themselves: its e2e test) ----------

test("Julekalenderen: print, reminders and the tree picture report «jul.*» through R.statistikk", () => {
  const kilde = readFileSync(join(ROT, "rusj/spill/julekalenderen/spill.js"), "utf8");
  const meldt = [...kilde.matchAll(/R\.statistikk\("(jul\.[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(meldt)].sort(), ["jul.paminnelse", "jul.tre", "jul.utskrift"]);
  assert.equal(meldt.filter((h) => h === "jul.tre").length, 2, "both the download and the share of the tree");
  assert.doesNotMatch(kilde, /R\.statistikk\("(utskrift|paminnelse|bilde)"/, "the old event names are gone");
});
