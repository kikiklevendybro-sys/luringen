// The reference client (rusj/kit/stat.js) in a pretend browser: what it sends, when, and when it
// stays silent. The last tests send its requests through the real Worker code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nettleser, MAL, MIN, DOGN, KILDE } from "./falsk-nettleser.mjs";
import { handter } from "../src/index.js";
import { renNokkel, alleNokler } from "../src/nokler.js";
import { MAKS_BYTES, MAKS_NOKLER, DAGLIGE } from "../src/oppsett.js";
import { sammendrag } from "../src/tall.js";
import { falskD1 } from "./falsk-d1.mjs";

const T0 = Date.parse("2026-11-11T12:00:00Z"); // Wednesday 11 November 2026, 13:00 in Norway

test("first page ever: page view, visit, new phone, first this week and month — in one request", () => {
  const n = nettleser();
  assert.equal(n.sendt.length, 0, "nothing is sent before the short wait");
  n.fram(1500);
  assert.deepEqual(n.pakker(), [["side.forside", "besok", "enhet.ny", "unik.uke", "unik.mnd"]]);
  const { url, valg } = n.sendt[0];
  assert.equal(url, MAL + "/t");
  assert.equal(valg.method, "POST");
  assert.deepEqual({ ...valg.headers }, { "Content-Type": "text/plain" });
  assert.equal(valg.credentials, "omit");
  assert.equal(valg.referrerPolicy, "no-referrer");
  assert.equal(valg.keepalive, true);
  assert.equal(valg.mode, "cors");
  assert.deepEqual(Object.keys(JSON.parse(valg.body)), ["v", "k"]);
  assert.deepEqual(n.notat(), { v: 1, dag: 20768, sist: T0, tid: 0, trinn: 0 });
});

test("the next page in the same visit is only a page view", () => {
  const lager = new Map();
  const a = nettleser({ lager });
  a.fram(20 * 1000);
  a.lukk();
  const b = nettleser({ lager, url: "https://rusj.no/ordugla/", naa: T0 + 21 * 1000 });
  b.fram(1500);
  assert.deepEqual(b.pakker(), [["side.ordugla"]]);
});

test("the page id comes from the address", () => {
  const sider = { "/": "forside", "/index.html": "forside", "/ordugla/": "ordugla", "/ordugla/?x=1#dagens": "ordugla", "/luringen/": "luringen", "/om/": "om", "/personvern/": "personvern", "/Noe-Rart/": "annet", "/a/": "annet", "/%C3%A6/": "annet" };
  for (const [sti, id] of Object.entries(sider)) {
    const n = nettleser({ url: "https://rusj.no" + sti });
    n.fram(1500);
    assert.equal(n.nokler()[0], "side." + id, sti);
  }
});

test("yesterday, this week, long ago: the phone says which, and nothing more", () => {
  const lager = new Map();
  const dag = (d, ekstra = {}) => {
    const n = nettleser({ lager, naa: T0 + d * DOGN, ...ekstra });
    n.fram(1500);
    n.lukk();
    return n.nokler();
  };
  assert.deepEqual(dag(0), ["side.forside", "besok", "enhet.ny", "unik.uke", "unik.mnd"]); // Wed 11 Nov
  assert.deepEqual(dag(1), ["side.forside", "besok", "enhet.igar"]); // Thu: yesterday, same week
  assert.deepEqual(dag(1.2), ["side.forside", "besok"]); // later the same day: a new visit only
  assert.deepEqual(dag(5), ["side.forside", "besok", "enhet.uke", "unik.uke"]); // Mon 16 Nov: 4 days, new week
  assert.deepEqual(dag(12), ["side.forside", "besok", "enhet.uke", "unik.uke"]); // Mon 23 Nov: 7 days
  assert.deepEqual(dag(20), ["side.forside", "besok", "enhet.lenge", "unik.uke", "unik.mnd"]); // Tue 1 Dec: 8 days, new month
  assert.deepEqual(dag(21), ["side.forside", "besok", "enhet.igar"]); // Wed 2 Dec
  assert.deepEqual(dag(60), ["side.forside", "besok", "enhet.lenge", "unik.uke", "unik.mnd"]); // January
});

test("the Oslo day decides, not the phone's time zone or UTC", () => {
  const lager = new Map();
  // 23:30 Norwegian time on 11 Nov, then 00:30 on 12 Nov: one hour apart, but a new day.
  const a = nettleser({ lager, naa: Date.parse("2026-11-11T22:30:00Z") });
  a.fram(1500);
  a.lukk();
  const b = nettleser({ lager, naa: Date.parse("2026-11-11T23:30:00Z") });
  b.fram(1500);
  assert.deepEqual(b.nokler(), ["side.forside", "besok", "enhet.igar"]);
});

test("opened from the home screen: «app» is sent with the day's first page", () => {
  const lager = new Map();
  const a = nettleser({ lager, appmodus: true });
  a.fram(1500);
  assert.deepEqual(a.nokler(), ["side.forside", "besok", "enhet.ny", "unik.uke", "unik.mnd", "app"]);
  a.lukk();
  const b = nettleser({ lager, appmodus: true, naa: T0 + 2 * MIN });
  b.fram(1500);
  assert.deepEqual(b.nokler(), ["side.forside"], "once a day, not on every page");
  const c = nettleser({ nav: { standalone: true } }); // iOS
  c.fram(1500);
  assert.ok(c.nokler().includes("app"));
});

test("time on screen is reported as steps passed: 1, 3, 10, 30 minutes — each once per visit", () => {
  const lager = new Map();
  const a = nettleser({ lager });
  a.fram(59 * 1000);
  assert.ok(!a.nokler().includes("tid.1"));
  a.fram(2 * 1000 + 30 * 1000);
  assert.deepEqual(a.nokler().filter((k) => k.startsWith("tid.")), ["tid.1"]);
  a.fram(10 * MIN);
  assert.deepEqual(a.nokler().filter((k) => k.startsWith("tid.")), ["tid.1", "tid.3", "tid.10"]);
  a.lukk();
  // Another page in the same visit: earlier steps are not sent again; 30 minutes is reached here.
  const b = nettleser({ lager, url: "https://rusj.no/sauen/", naa: a.klokke.naa + 5 * 1000 });
  b.fram(25 * MIN);
  b.lukk();
  assert.deepEqual(b.nokler(), ["side.sauen", "tid.30"]);
  // A new visit (more than 30 minutes away) starts from zero.
  const c = nettleser({ lager, naa: b.klokke.naa + 31 * MIN });
  c.fram(4 * MIN);
  c.lukk();
  assert.deepEqual(c.nokler(), ["side.forside", "besok", "tid.1", "tid.3"]);
});

test("a short visit reports no time step; closing the page sends what is waiting at once", () => {
  const a = nettleser();
  a.fram(400);
  a.lukk(); // closed before the short wait was over: sent on the way out, with no timer involved
  assert.deepEqual(a.pakker(), [["side.forside", "besok", "enhet.ny", "unik.uke", "unik.mnd"]]);
  assert.equal(a.notat().tid, 400);

  // Another phone: 20 seconds on the front page, then 45 seconds in a game. The minute is passed
  // between two half-minute checks, so it is reported when the page closes.
  const lager = new Map();
  const b = nettleser({ lager });
  b.fram(20 * 1000);
  b.lukk();
  const c = nettleser({ lager, url: "https://rusj.no/sauen/", naa: T0 + 21 * 1000 });
  c.fram(45 * 1000);
  assert.deepEqual(c.pakker(), [["side.sauen"]]);
  c.lukk();
  assert.deepEqual(c.pakker(), [["side.sauen"], ["tid.1"]]);
});

test("time in the background does not count, and a sleeping phone adds at most one minute", () => {
  const a = nettleser();
  a.fram(20 * 1000);
  a.skjul();
  a.fram(10 * MIN); // in the background
  a.vis();
  a.fram(20 * 1000);
  a.lukk();
  assert.deepEqual(a.nokler().filter((k) => k.startsWith("tid.")), [], "40 seconds on screen in total");
  assert.equal(a.notat().tid, 40 * 1000);

  const b = nettleser();
  b.fram(10 * 1000);
  b.sov(3 * 60 * MIN); // the lid was closed for three hours without the page being told
  b.fram(1000);
  b.lukk();
  assert.ok(b.notat().tid <= 10 * 1000 + 60 * 1000 + 1000);
  assert.ok(!b.nokler().includes("tid.3"));
});

test("back on screen after more than 30 minutes is a new visit; sooner is the same visit", () => {
  const n = nettleser();
  n.fram(5 * 1000);
  n.skjul();
  n.fram(29 * MIN);
  n.vis();
  n.fram(2000);
  assert.equal(n.nokler().filter((k) => k === "besok").length, 1);
  n.skjul();
  n.fram(31 * MIN);
  n.vis();
  n.fram(2000);
  assert.deepEqual(n.pakker().at(-1), ["besok"]);
  assert.equal(n.nokler().filter((k) => k.startsWith("side.")).length, 1, "not a new page view");
});

test("a tab left open over midnight counts the new day when it is looked at again", () => {
  const n = nettleser({ naa: Date.parse("2026-11-11T21:00:00Z") }); // 22:00
  n.fram(5000);
  n.skjul();
  n.fram(10 * 60 * MIN); // 08:00 the next morning
  n.vis();
  n.fram(2000);
  assert.deepEqual(n.pakker().at(-1), ["besok", "enhet.igar"]);
});

test("a page opened in the background waits until it is seen", () => {
  const n = nettleser({ synlig: false });
  n.fram(10 * MIN);
  assert.equal(n.sendt.length, 0);
  assert.equal(n.notat(), null);
  n.vis();
  n.fram(1500);
  assert.deepEqual(n.nokler(), ["side.forside", "besok", "enhet.ny", "unik.uke", "unik.mnd"]);
});

test("back/forward that restores the page counts as a page view", () => {
  const n = nettleser({ url: "https://rusj.no/ordugla/" });
  n.fram(1500);
  n.lukk();
  n.fram(10 * 1000);
  n.tilbakeFraBuffer();
  n.fram(1500);
  assert.deepEqual(n.pakker(), [["side.ordugla", "besok", "enhet.ny", "unik.uke", "unik.mnd"], ["side.ordugla"]]);
});

test("silent: no endpoint configured", () => {
  for (const stat of [undefined, "", null, 42, "ja", "javascript:alert(1)", "http://stat.example", "https://stat.example/t?x=1", "//stat.example", "ftp://stat.example"]) {
    const n = nettleser({ stat });
    n.stat.hendelse("start");
    n.stat.daglig(1, 3);
    n.fram(60 * MIN);
    n.lukk();
    assert.equal(n.sendt.length, 0, String(stat));
    assert.equal(n.stat.av, true);
    assert.deepEqual(n.lagerKall, [], "the phone's storage is not touched either");
    assert.equal(n.antallTidtakere(), 0);
  }
  // A trailing slash on the address is fine.
  const n = nettleser({ stat: MAL + "/" });
  n.fram(1500);
  assert.equal(n.sendt[0].url, MAL + "/t");
});

test("silent: Do Not Track, Global Privacy Control, data saving, frames and automated browsers", () => {
  const tilfeller = [
    { nav: { doNotTrack: "1" } },
    { ekstra: { doNotTrack: "1" } },
    { nav: { msDoNotTrack: "1" } },
    { nav: { globalPrivacyControl: true } },
    { nav: { connection: { saveData: true } } },
    { nav: { webdriver: true } },
    { iRamme: true },
  ];
  for (const t of tilfeller) {
    const n = nettleser({ url: "https://rusj.no/ordugla/", ...t });
    n.stat.hendelse("start");
    n.stat.daglig(1, 3);
    n.fram(60 * MIN);
    n.skjul();
    n.vis();
    n.lukk();
    assert.equal(n.sendt.length, 0, JSON.stringify(t));
    assert.deepEqual(n.lagerKall, [], JSON.stringify(t));
    assert.equal(n.antallTidtakere(), 0, JSON.stringify(t));
    assert.equal(n.stat.av, true);
  }
  // The opposite values do not silence it.
  const n = nettleser({ nav: { doNotTrack: "0", globalPrivacyControl: false, connection: { saveData: false }, webdriver: false } });
  n.fram(1500);
  assert.equal(n.sendt.length, 1);
});

test("a phone that cannot store the note sends page views only — it never looks «new» again and again", () => {
  for (let i = 0; i < 3; i++) {
    const n = nettleser({ lagerFeil: true, url: "https://rusj.no/sauen/" });
    n.stat.hendelse("start");
    n.fram(15 * MIN);
    n.lukk();
    assert.deepEqual(n.nokler(), ["side.sauen", "start.sauen"]);
  }
});

test("RUSJ_STAT_LAGRING = false: storage is never read or written for statistics", () => {
  const n = nettleser({ url: "https://rusj.no/ordugla/", ekstra: { RUSJ_STAT_LAGRING: false } });
  n.stat.hendelse("start");
  n.stat.hendelse("ferdig");
  n.stat.daglig(1, 12);
  n.fram(40 * MIN);
  n.skjul();
  n.vis();
  n.lukk();
  assert.deepEqual(n.nokler(), ["side.ordugla", "start.ordugla", "ferdig.ordugla", "daglig.ordugla"]);
  assert.deepEqual(n.lagerKall, []);
});

test("game events: only start and ferdig, only on a game page, and never the game's own data", () => {
  const n = nettleser({ url: "https://rusj.no/sauen/" });
  n.stat.hendelse("visning");
  n.stat.hendelse("start", { modus: "lag", spillere: 6, navn: "Kari" });
  n.stat.hendelse("runde");
  n.stat.hendelse("kveld");
  n.stat.hendelse("alder18");
  n.stat.hendelse("utfordring");
  n.stat.hendelse("ferdig", { runder: 3 });
  n.stat.hendelse("START");
  n.stat.hendelse("start.x");
  n.stat.hendelse();
  n.stat.hendelse({ toString: () => "start" });
  n.fram(1500);
  assert.deepEqual(n.nokler(), ["side.sauen", "besok", "enhet.ny", "unik.uke", "unik.mnd", "start.sauen", "ferdig.sauen"]);
  assert.doesNotMatch(n.sendt[0].valg.body, /Kari|lag|spillere|6|runder/);
  const forside = nettleser();
  forside.stat.hendelse("start");
  forside.stat.daglig(1, 1);
  forside.fram(1500);
  assert.deepEqual(forside.nokler(), ["side.forside", "besok", "enhet.ny", "unik.uke", "unik.mnd"]);
});

test("a finished daily: the game, how many today, and the streak as a group", () => {
  const send = (antall, rekke) => {
    const n = nettleser({ url: "https://rusj.no/ordugla/" });
    n.fram(1500);
    n.stat.daglig(antall, rekke);
    n.fram(1500);
    return n.pakker()[1];
  };
  assert.deepEqual(send(1, 1), ["daglig.ordugla", "dagens.1", "rekke.1"]);
  assert.deepEqual(send(1, 2), ["daglig.ordugla", "dagens.1", "rekke.2"]);
  assert.deepEqual(send(1, 3), ["daglig.ordugla", "dagens.1", "rekke.2"]);
  assert.deepEqual(send(1, 4), ["daglig.ordugla", "dagens.1", "rekke.4"]);
  assert.deepEqual(send(1, 6), ["daglig.ordugla", "dagens.1", "rekke.4"]);
  assert.deepEqual(send(1, 7), ["daglig.ordugla", "dagens.1", "rekke.7"]);
  assert.deepEqual(send(1, 13), ["daglig.ordugla", "dagens.1", "rekke.7"]);
  assert.deepEqual(send(1, 14), ["daglig.ordugla", "dagens.1", "rekke.14"]);
  assert.deepEqual(send(1, 29), ["daglig.ordugla", "dagens.1", "rekke.14"]);
  assert.deepEqual(send(1, 30), ["daglig.ordugla", "dagens.1", "rekke.30"]);
  assert.deepEqual(send(1, 9999), ["daglig.ordugla", "dagens.1", "rekke.30"]);
  assert.deepEqual(send(1, 0), ["daglig.ordugla", "dagens.1", "rekke.1"]);
  assert.deepEqual(send(1, undefined), ["daglig.ordugla", "dagens.1", "rekke.1"]);
  assert.deepEqual(send(2, 12), ["daglig.ordugla", "dagens.2"], "the streak is sent with the first daily only");
  assert.deepEqual(send(3, 12), ["daglig.ordugla", "dagens.3"]);
  assert.deepEqual(send(0, 5), ["daglig.ordugla"]);
  assert.deepEqual(send("mange", 5), ["daglig.ordugla"]);
  assert.deepEqual(send(12, 5), ["daglig.ordugla"]);
});

test("failures are dropped silently: no retry, no error, nothing thrown into the game", async () => {
  for (const hentFeil of ["kast", "avvis"]) {
    const n = nettleser({ url: "https://rusj.no/sauen/", hentFeil });
    assert.doesNotThrow(() => {
      n.stat.hendelse("start");
      n.fram(1500);
      n.lukk();
    });
    await new Promise((r) => setTimeout(r, 0)); // an unhandled rejection would fail the test run
    assert.equal(n.sendt.length, 1, "one attempt, never again");
    n.fram(60 * MIN);
    assert.equal(n.sendt.length, 1);
  }
  // No fetch at all (a very old browser): still nothing thrown.
  const gammel = nettleser({ ekstra: { fetch: undefined } });
  assert.doesNotThrow(() => gammel.fram(5000));
});

test("bounded: at most 16 names in a request and at most 40 requests from one page", () => {
  const n = nettleser({ url: "https://rusj.no/sauen/" });
  for (let i = 0; i < 200; i++) {
    n.stat.hendelse(i % 2 ? "start" : "ferdig");
    n.stat.daglig((i % 3) + 1, i);
    n.fram(2000);
  }
  n.lukk();
  assert.equal(n.sendt.length, 40);
  for (const s of n.sendt) {
    assert.ok(JSON.parse(s.valg.body).k.length <= MAKS_NOKLER);
    assert.ok(s.valg.body.length <= MAKS_BYTES);
  }
});

test("the script itself: no cookies, no ids, no beacon, nothing but the endpoint", () => {
  assert.doesNotMatch(KILDE, /\.cookie|sessionStorage|indexedDB|crypto|Math\.random|randomUUID|userAgent|\.screen|\.languages?\b|\.referrer\b|sendBeacon\(|XMLHttpRequest|WebSocket|canvas|deviceMemory|hardwareConcurrency|\.plugins|getBattery|\.platform/);
  assert.equal(KILDE.match(/\.fetch\(/g).length, 1);
  assert.equal(KILDE.match(/localStorage\.(get|set)Item\(LAGER/g).length, 3, "one key, rusj.stat, and no other");
});

// ---------- Client → Worker ----------

const tilWorker = async (n, db, naa) => {
  for (const s of n.sendt.splice(0)) {
    // (Origin and Content-Length are what the browser itself adds on the way out.)
    const hode = { ...s.valg.headers, Origin: "https://rusj.no", "Content-Length": String(new TextEncoder().encode(s.valg.body).length) };
    const svar = await handter(new Request(s.url, { method: s.valg.method, headers: hode, body: s.valg.body }), { DB: db }, {}, new Date(naa ?? n.klokke.naa));
    assert.equal(svar.status, 204);
  }
};

test("contract: every name the client can send is in the Worker's grammar", async () => {
  const sett = new Set();
  const lager = new Map();
  for (const [d, sti] of [[0, "/"], [0.01, "/ordugla/"], [1, "/sauen/"], [5, "/luringen/"], [20, "/blyanten/"], [21, "/tallknuseren/"], [80, "/"]]) {
    const n = nettleser({ lager, url: "https://rusj.no" + sti, naa: T0 + d * DOGN, appmodus: true });
    n.stat.hendelse("start");
    n.stat.hendelse("ferdig");
    // (The kit calls daglig() from R.dagligFerdig, which only the daily games use.)
    n.fram(2000);
    if (DAGLIGE.includes(sti.replaceAll("/", ""))) {
      for (const r of [1, 2, 4, 7, 14, 30]) n.stat.daglig(1, r);
      n.fram(2000);
      for (let i = 2; i <= 9; i++) n.stat.daglig(i, 1);
      n.fram(2000);
    }
    n.fram(45 * MIN);
    n.lukk();
    n.nokler().forEach((k) => sett.add(k));
  }
  const kjente = new Set(alleNokler());
  for (const k of sett) {
    assert.equal(renNokkel(k), k, k);
    assert.ok(kjente.has(k), k);
  }
  // …and together the scenarios used every kind of name there is.
  const typer = (liste) => [...new Set([...liste].map((k) => (/^(side|start|ferdig|daglig)\./.test(k) ? k.split(".")[0] : k)))].sort();
  assert.deepEqual(typer(sett), typer(kjente));
});

test("end to end: three phones over two days → the counters → the sentence on the dashboard", async () => {
  const db = falskD1();
  const DAG1 = Date.parse("2026-11-09T17:00:00Z"); // Monday 18:00
  const DAG2 = DAG1 + DOGN; // Tuesday 18:00
  const DAG3 = DAG2 + DOGN; // Wednesday: the owner looks at the dashboard
  const a = new Map();
  const b = new Map();
  const c = new Map();

  // Monday: A plays Ordugla for four minutes and finishes the daily. B looks at the front page.
  let n = nettleser({ lager: a, url: "https://rusj.no/", naa: DAG1 });
  n.fram(10 * 1000);
  n.lukk();
  await tilWorker(n, db);
  n = nettleser({ lager: a, url: "https://rusj.no/ordugla/", naa: DAG1 + 11 * 1000 });
  n.stat.hendelse("start");
  n.fram(4 * MIN);
  n.stat.hendelse("ferdig");
  n.stat.daglig(1, 1);
  n.fram(2000);
  n.lukk();
  await tilWorker(n, db);
  n = nettleser({ lager: b, url: "https://rusj.no/", naa: DAG1 + 60 * MIN });
  n.fram(20 * 1000);
  n.lukk();
  await tilWorker(n, db);

  // Tuesday: A is back (app on the home screen) and does two dailies. C is new. B stays away.
  n = nettleser({ lager: a, url: "https://rusj.no/ordugla/", naa: DAG2, appmodus: true });
  n.stat.hendelse("start");
  n.fram(2 * MIN);
  n.stat.hendelse("ferdig");
  n.stat.daglig(1, 2);
  n.fram(2000);
  n.lukk();
  await tilWorker(n, db);
  n = nettleser({ lager: a, url: "https://rusj.no/blyanten/", naa: DAG2 + 3 * MIN, appmodus: true });
  n.stat.hendelse("start");
  n.fram(9 * MIN);
  n.stat.daglig(2, 2);
  n.lukk();
  await tilWorker(n, db);
  n = nettleser({ lager: c, url: "https://rusj.no/sauen/", naa: DAG2 + 2 * 60 * MIN });
  n.stat.hendelse("start");
  n.fram(40 * MIN);
  n.lukk();
  await tilWorker(n, db);

  assert.deepEqual(db.somObjekt("2026-11-09"), {
    besok: 2, "enhet.ny": 2, "unik.uke": 2, "unik.mnd": 2,
    "side.forside": 2, "side.ordugla": 1, "start.ordugla": 1, "ferdig.ordugla": 1,
    "tid.1": 1, "tid.3": 1,
    "daglig.ordugla": 1, "dagens.1": 1, "rekke.1": 1,
  });
  assert.deepEqual(db.somObjekt("2026-11-10"), {
    besok: 2, "enhet.igar": 1, "enhet.ny": 1, "unik.uke": 1, "unik.mnd": 1, app: 1,
    "side.ordugla": 1, "side.blyanten": 1, "side.sauen": 1,
    "start.ordugla": 1, "ferdig.ordugla": 1, "start.blyanten": 1, "start.sauen": 1,
    "tid.1": 2, "tid.3": 2, "tid.10": 2, "tid.30": 1,
    "daglig.ordugla": 1, "daglig.blyanten": 1, "dagens.1": 1, "dagens.2": 1, "rekke.2": 1,
  });

  const s = sammendrag(db.rader(), "2026-11-11");
  assert.equal(s.setning, "I går var 2 innom, 1 av dem var også her dagen før.");
  const igar = s.perioder[1];
  assert.equal(igar.besok, 2);
  assert.deepEqual(igar.tilbake.nesteDag, { teller: 1, nevner: 2, prosent: 50 });
  assert.deepEqual(igar.tid.grupper.map((g) => g.antall), [0, 0, 0, 1, 1]);
  assert.deepEqual(igar.app, { antall: 1, av: 2, prosent: 50 });
  assert.equal(s.kalender[0].enheter, 3, "three different phones this week");
  void DAG3;
});
