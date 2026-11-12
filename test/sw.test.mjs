// The service worker (rusj/kit/sw.js) in a pretend browser: caches, fetch, clients and the clock are
// stand-ins, the worker code is the real file. Covers what a visitor depends on:
// a cheap first visit, the rest when idle (never on Save-Data/2G), a failing file that costs
// nothing, stored pages answered without the network, an honest offline page, a cache that
// rebuilds itself, updates that fetch only what changed, taking over from the first generation of
// the worker without stranding anyone, and the emergency worker (--sw-av).
// The last tests run the worker against a real build.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KILDE = readFileSync(join(ROT, "rusj/kit/sw.js"), "utf8");
const OPPHAV = "https://rusj.test";
const SKALA = 100; // the worker's clock runs this much faster than the real one (its 3 s pauses take 30 ms)

// FNV-1a as in the build and in the worker.
function fnv(lengde, tegn) {
  let h = 0x811c9dc5;
  for (let i = 0; i < lengde; i++) {
    h ^= tegn(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
const hashTekst = (t) => fnv(t.length, (i) => t.charCodeAt(i));
const hashBytes = (b) => fnv(b.length, (i) => b[i]);
const bytes = (v) => (typeof v === "string" ? new TextEncoder().encode(v) : new Uint8Array(v));

// ---------- A pretend site ----------

// lagSted({ spill: ["a", "b"], endret: { a: 2 }, kit: 1 }) → the files of a small rusj: a front page,
// one page per game, a manifest. `endret` gives a game's script new content (so a new ?v=).
function lagSted({ spill = ["a", "b", "c"], endret = {}, kit = 1, forside = 1 } = {}) {
  const filer = new Map(); // path (with ?v=) → { kropp, type }
  const medV = (sti, tekst) => {
    const adr = `${sti}?v=${hashTekst(tekst)}`;
    filer.set(adr, { kropp: tekst, type: sti.endsWith(".css") ? "text/css" : "application/javascript" });
    return adr;
  };
  const css = medV("/felles/rusj.css", `body{color:red}/*${kit}*/`);
  const js = medV("/felles/rusj.js", `window.Rusj=${kit};`);
  const portal = medV("/felles/portal.js", `window.portal=${forside};`);
  filer.set("/ikon-192.png?v=bilde", { kropp: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), type: "image/png" });
  const side = (tittel, skript) =>
    `<!doctype html><html><head><link rel="icon" href="/ikon-192.png?v=bilde" type="image/png"><link rel="stylesheet" href="${css}">${skript.map((s) => `<script defer src="${s}"></script>`).join("")}<meta property="og:image" content="https://rusj.no/deling.png"></head><body><h1>${tittel}</h1></body></html>`;
  const sider = [["/", side(`rusj ${forside}`, [portal])]];
  for (const id of spill) sider.push([`/${id}/`, side(id, [js, medV(`/${id}/spill.js`, `spill("${id}",${endret[id] || 1});`)])]);
  for (const [sti, html] of sider) filer.set(sti, { kropp: html, type: "text/html; charset=utf-8" });
  filer.set("/manifest.webmanifest", { kropp: `{"name":"rusj"}`, type: "application/manifest+json" });
  return {
    filer,
    SIDER: sider.map(([sti, html]) => [sti, hashBytes(bytes(html))]),
    EKSTRA: [["/manifest.webmanifest", hashBytes(bytes(`{"name":"rusj"}`))]],
    filerFor: (sti) => [...filer.get(sti).kropp.matchAll(/(?:src|href)="(\/[^"]*\?v=[^"]*)"/g)].map((m) => m[1]),
  };
}

// ---------- The pretend browser ----------

function lagNettleser() {
  const p0 = performance.now();
  const klokke = { now: () => 1e12 + (performance.now() - p0) * SKALA };
  const tid = (fn, ms) => setTimeout(fn, ms / SKALA);
  const pause = (ms) => new Promise((ferdig) => tid(ferdig, ms));

  // The host: what it would answer right now.
  const vert = { filer: new Map(), nede: false, feil: new Set(), treg: new Map(), logg: [], samtidig: 0, maksSamtidig: 0 };
  async function fetch(inn, valg = {}) {
    const url = new URL(typeof inn === "string" ? inn : inn.url, OPPHAV);
    const sti = url.pathname + url.search;
    vert.logg.push({ sti, cache: valg.cache || (typeof inn === "object" && inn.cache) || "default", prioritet: valg.priority || "", naviger: typeof inn === "object" && inn.mode === "navigate" });
    vert.samtidig++;
    vert.maksSamtidig = Math.max(vert.maksSamtidig, vert.samtidig);
    try {
      await pause(vert.treg.get(sti) ?? 50);
      if (vert.nede) throw new TypeError("Failed to fetch");
      if (vert.feil.has(sti)) return new Response("503", { status: 503 });
      const fil = vert.filer.get(sti) || vert.filer.get(url.pathname);
      if (!fil) return new Response("<h1>Her var det tomt.</h1>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
      return new Response(fil.kropp, { status: 200, headers: { "content-type": fil.type, "cache-control": "max-age=600" } });
    } finally {
      vert.samtidig--;
    }
  }

  // Cache storage.
  const nokkel = (r) => new URL(typeof r === "string" ? r : r.url, OPPHAV).href;
  class Lager {
    constructor() {
      this.inn = new Map();
    }
    async match(r) {
      const o = this.inn.get(nokkel(r));
      return o ? new Response(o.kropp.slice(), { status: o.status, headers: o.hoder }) : undefined;
    }
    async put(r, svar) {
      if (typeof r === "object" && r.method && r.method !== "GET") throw new TypeError("bare GET kan lagres");
      this.inn.set(nokkel(r), { kropp: new Uint8Array(await svar.arrayBuffer()), status: svar.status, hoder: [...svar.headers] });
    }
    async delete(r) {
      return this.inn.delete(nokkel(r));
    }
    async keys() {
      return [...this.inn.keys()].map((url) => ({ url, method: "GET" }));
    }
  }
  const lagre = new Map();
  const caches = {
    open: async (navn) => lagre.get(navn) || (lagre.set(navn, new Lager()), lagre.get(navn)),
    has: async (navn) => lagre.has(navn),
    delete: async (navn) => lagre.delete(navn),
    keys: async () => [...lagre.keys()],
    match: async (r) => {
      for (const l of lagre.values()) {
        const t = await l.match(r);
        if (t) return t;
      }
      return undefined;
    },
  };

  const sider = []; // open pages (window clients): { url, navigert: [] }
  let avregistrert = 0;
  const klienter = {
    matchAll: async () => sider.map((s) => ({ url: s.url, navigate: async (til) => void s.navigert.push(til) })),
    claim: async () => {},
  };
  const nett = { saveData: false, effectiveType: "4g" };

  // Starts a worker from source text. Returns the hooks a browser would call.
  function start(kilde) {
    const lyttere = {};
    const selv = {
      addEventListener: (type, fn) => ((lyttere[type] = lyttere[type] || []).push(fn)),
      skipWaiting: async () => {},
      clients: klienter,
      navigator: { connection: nett },
      location: { origin: OPPHAV },
      registration: { unregister: async () => (avregistrert++, true) },
    };
    new Function("self", "caches", "fetch", "setTimeout", "Date", kilde)(selv, caches, fetch, tid, klokke);
    const send = async (type, felt = {}) => {
      const venter = [];
      let svar;
      const e = { ...felt, waitUntil: (p) => venter.push(Promise.resolve(p)), respondWith: (p) => (svar = Promise.resolve(p)) };
      for (const fn of lyttere[type] || []) fn(e);
      return { svar, ferdig: Promise.all(venter) };
    };
    const hendelse = async (type, felt) => {
      const h = await send(type, felt);
      await h.ferdig;
    };
    return {
      installer: () => hendelse("install"),
      aktiver: () => hendelse("activate"),
      // A page asks for an address. `svar` is what the page gets; `etter` settles when the worker is done with what it started.
      async naviger(sti) {
        const h = await send("fetch", { request: { url: OPPHAV + sti, method: "GET", mode: "navigate", cache: "default" } });
        return { svar: h.svar ? await h.svar : null, etter: h.ferdig };
      },
      async hent(sti) {
        const h = await send("fetch", { request: { url: OPPHAV + sti, method: "GET", mode: "no-cors", cache: "default" } });
        const svar = h.svar ? await h.svar : null;
        await h.ferdig;
        return svar;
      },
      // What a page would say when it is idle; settles when the running download is done (or has stopped).
      fyll: () => hendelse("message", { data: "rusj-fyll" }),
      // … and once more, in case the first one joined a download that was already on its way out.
      async fyllHelt() {
        await hendelse("message", { data: "rusj-fyll" });
        await hendelse("message", { data: "rusj-fyll" });
      },
      async status() {
        let fikk = null;
        await hendelse("message", { data: { type: "rusj-status" }, source: { postMessage: (m) => (fikk = m) } });
        return fikk;
      },
    };
  }

  return {
    vert,
    caches,
    lagre,
    nett,
    sider,
    pause,
    start,
    get avregistrert() {
      return avregistrert;
    },
    apne: (sti) => sider.push({ url: OPPHAV + sti, navigert: [] }),
    // The worker as the build would write it for this site.
    arbeider(sted, versjon = "v1") {
      return start(
        KILDE.replace("__VERSJON__", () => versjon)
          .replace("__SIDER__", () => JSON.stringify(sted.SIDER))
          .replace("__EKSTRA__", () => JSON.stringify(sted.EKSTRA))
          .replace("__FRAKOBLET__", () => JSON.stringify(`<!doctype html><title>Uten nett | rusj</title><h1>Du er uten nett</h1><a href="/">Til forsiden</a>`)),
      );
    },
    publiser(sted) {
      vert.filer = new Map(sted.filer);
    },
    lagret: async (navn = "rusj-lager-1") => (lagre.has(navn) ? [...lagre.get(navn).inn.keys()].map((u) => u.slice(OPPHAV.length)).sort() : null),
    hentet: () => vert.logg.map((l) => l.sti),
    nullstillLogg: () => ((vert.logg.length = 0), (vert.maksSamtidig = 0)),
  };
}

const tekst = async (svar) => (svar ? await svar.text() : null);

// A first-generation cache ("rusj-<hash>"): every page and file, as the old worker stored them.
async function gammeltLager(n, sted, navn = "rusj-gammel1", utelat = []) {
  const l = await n.caches.open(navn);
  for (const [sti, fil] of sted.filer) if (!utelat.includes(sti)) await l.put(sti, new Response(fil.kropp, { headers: { "content-type": fil.type } }));
  return l;
}

// ---------- First visit ----------

test("first visit: the front page, the manifest and the page that is open – nothing else", async () => {
  const n = lagNettleser();
  const sted = lagSted();
  n.publiser(sted);
  n.apne("/b/");
  const sw = n.arbeider(sted);
  await sw.installer();
  const lagret = await n.lagret();
  for (const sti of ["/", "/b/", "/manifest.webmanifest", ...sted.filerFor("/"), ...sted.filerFor("/b/")]) assert.ok(lagret.includes(sti), `mangler ${sti}`);
  assert.ok(!lagret.includes("/a/") && !lagret.includes("/c/"), "andre spill ble hentet ved installasjon");
  assert.ok(!lagret.some((s) => s.startsWith("/a/spill.js")), "filene til et spill som ikke er åpnet, ble hentet");
});

test("when idle the other games follow, one page at a time, at low priority, a few files at once", async () => {
  const n = lagNettleser();
  const sted = lagSted({ spill: ["a", "b", "c", "d", "e"] });
  n.publiser(sted);
  const sw = n.arbeider(sted);
  await sw.installer();
  n.nullstillLogg();
  await sw.aktiver();
  await sw.fyll();
  const lagret = await n.lagret();
  for (const [sti] of sted.SIDER) assert.ok(lagret.includes(sti), `mangler ${sti}`);
  for (const sti of sted.filer.keys()) assert.ok(lagret.includes(sti), `mangler ${sti}`);
  const sider = n.hentet().filter((s) => s.endsWith("/"));
  assert.deepEqual(sider, ["/a/", "/b/", "/c/", "/d/", "/e/"], "sidene hentes i rekkefølgen fra forsiden");
  assert.ok(n.vert.logg.every((l) => l.prioritet === "low"), "nedlasting i bakgrunnen skal ha lav prioritet");
  assert.ok(n.vert.maksSamtidig <= 3, `${n.vert.maksSamtidig} forespørsler samtidig`);
  assert.equal(new Set(n.hentet()).size, n.hentet().length, "noe ble hentet to ganger");
  assert.deepEqual(await sw.status(), { type: "rusj-status", versjon: "v1", sider: 6, lagret: 6, sparsomt: false });
});

test("Save-Data or 2G: nothing is fetched in the background, but a game is stored when it is opened", async () => {
  for (const [felt, verdi] of [["saveData", true], ["effectiveType", "2g"], ["effectiveType", "slow-2g"]]) {
    const n = lagNettleser();
    n.nett[felt] = verdi;
    const sted = lagSted();
    n.publiser(sted);
    const sw = n.arbeider(sted);
    await sw.installer();
    await sw.aktiver();
    await sw.fyll();
    assert.ok((await n.lagret()).includes("/"), `${felt}: forsiden skal alltid lagres`);
    assert.ok(!(await n.lagret()).some((s) => /^\/[abc]\//.test(s)), `${felt}: spill ble hentet i bakgrunnen`);
    const { svar, etter } = await sw.naviger("/a/");
    assert.match(await tekst(svar), /<h1>a<\/h1>/);
    await etter;
    const lagret = await n.lagret();
    for (const sti of ["/a/", ...sted.filerFor("/a/")]) assert.ok(lagret.includes(sti), `${felt}: ${sti} ble ikke lagret da spillet ble åpnet`);
    assert.ok(!lagret.includes("/b/"), `${felt}: et spill som ikke er åpnet, ble hentet`);
    n.vert.nede = true;
    assert.match(await tekst((await sw.naviger("/a/")).svar), /<h1>a<\/h1>/, `${felt}: spillet virker ikke uten nett etter at det ble åpnet`);
  }
});

// ---------- Things go wrong ----------

test("a file that fails does not stop the install; what was fetched is kept and only the rest is fetched later", async () => {
  const n = lagNettleser();
  const sted = lagSted();
  n.publiser(sted);
  const dod = sted.filerFor("/b/").find((s) => s.startsWith("/b/spill.js"));
  n.vert.feil.add(dod);
  n.apne("/b/");
  const sw = n.arbeider(sted);
  await sw.installer(); // must not throw
  await sw.aktiver();
  await sw.fyll();
  let lagret = await n.lagret();
  assert.ok(!lagret.includes("/b/"), "en side ble lagret uten alle filene sine");
  for (const sti of ["/", "/a/", "/c/"]) assert.ok(lagret.includes(sti), `mangler ${sti}`);
  // Online the page still works (from the network) …
  const forsok = await sw.naviger("/b/");
  assert.match(await tekst(forsok.svar), /<h1>b<\/h1>/);
  await forsok.etter;
  assert.ok(!(await n.lagret()).includes("/b/"));
  // … and when the file answers again, only what is missing is fetched.
  n.vert.feil.clear();
  n.nullstillLogg();
  const { etter } = await sw.naviger("/c/");
  await etter;
  await sw.fyllHelt();
  lagret = await n.lagret();
  assert.ok(lagret.includes("/b/") && lagret.includes(dod), "siden ble ikke lagret da fila svarte igjen");
  assert.deepEqual(n.hentet().sort(), ["/b/", dod].sort(), "mer enn det som manglet, ble hentet");
});

test("no connection while fetching the rest: it stops quietly and goes on from there next time", async () => {
  const n = lagNettleser();
  const sted = lagSted({ spill: ["a", "b", "c", "d"] });
  n.publiser(sted);
  const sw = n.arbeider(sted);
  await sw.installer();
  await sw.aktiver();
  n.vert.treg.set("/b/", 20000); // while this one is on its way, the connection goes
  const kjorer = sw.fyll();
  await n.pause(3000 + 1500);
  n.vert.nede = true;
  await kjorer;
  let lagret = await n.lagret();
  assert.ok(lagret.includes("/a/"), "det som rakk å komme, skal være lagret");
  assert.ok(!lagret.includes("/b/") && !lagret.includes("/d/"));
  const forsok = n.hentet().length;
  await sw.fyll(); // still down: one try, then it gives up again
  assert.ok(n.hentet().length - forsok <= 2, "den prøver alle sidene selv om nettet er borte");
  n.vert.nede = false;
  n.vert.treg.clear();
  n.nullstillLogg();
  await sw.fyll();
  lagret = await n.lagret();
  for (const [sti] of sted.SIDER) assert.ok(lagret.includes(sti), `mangler ${sti}`);
  assert.ok(!n.hentet().includes("/a/"), "en side som var lagret, ble hentet på nytt");
});

// ---------- Visits ----------

test("a stored page is shown at once, without asking the network – also /x, /x/index.html and ?query", async () => {
  const n = lagNettleser();
  const sted = lagSted();
  n.publiser(sted);
  const sw = n.arbeider(sted);
  await sw.installer();
  await sw.aktiver();
  await sw.fyll();
  n.nullstillLogg();
  n.vert.treg.set("/a/", 60000);
  for (const adr of ["/a/", "/a", "/a/index.html", "/a/?utm_source=x", "/"]) {
    const { svar, etter } = await sw.naviger(adr);
    assert.equal(svar.status, 200, adr);
    assert.match(await tekst(svar), adr === "/" ? /<h1>rusj 1<\/h1>/ : /<h1>a<\/h1>/, adr);
    await etter;
  }
  assert.deepEqual(n.hentet(), [], "nettet ble spurt om sider som var lagret");
  // The page's files come from the cache too.
  for (const fil of sted.filerFor("/a/")) assert.equal((await sw.hent(fil)).status, 200);
  assert.deepEqual(n.hentet(), []);
});

test("without a connection: stored pages work, an unknown address gets a page that says so and links home", async () => {
  const n = lagNettleser();
  const sted = lagSted();
  n.publiser(sted);
  n.nett.saveData = true; // only the front page and /a/ get stored
  n.apne("/a/");
  const sw = n.arbeider(sted);
  await sw.installer();
  await sw.aktiver();
  n.vert.nede = true;
  assert.match(await tekst((await sw.naviger("/a/")).svar), /<h1>a<\/h1>/);
  assert.match(await tekst((await sw.naviger("/")).svar), /<h1>rusj 1<\/h1>/);
  for (const adr of ["/finnes-ikke/", "/b/", "/404.html", "/a/noe-annet"]) {
    const { svar, etter } = await sw.naviger(adr);
    await etter;
    const html = await tekst(svar);
    assert.equal(svar.status, 503, adr);
    assert.match(html, /Du er uten nett/, adr);
    assert.match(html, /<a href="\/">Til forsiden<\/a>/, adr);
    assert.match(svar.headers.get("content-type"), /text\/html/);
  }
  // With a connection the host's own answer is passed on (its 404 page), and nothing of it is stored.
  n.vert.nede = false;
  const { svar, etter } = await sw.naviger("/finnes-ikke/");
  assert.equal(svar.status, 404);
  assert.match(await tekst(svar), /Her var det tomt/);
  await etter;
  assert.ok(!(await n.lagret()).includes("/finnes-ikke/"));
});

test("a page that never answers: the offline page after the long limit, never a hanging screen", async () => {
  const n = lagNettleser();
  const sted = lagSted();
  n.publiser(sted);
  n.nett.saveData = true;
  const sw = n.arbeider(sted);
  await sw.installer();
  await sw.aktiver();
  n.vert.treg.set("/b/", 60000);
  const { svar } = await sw.naviger("/b/");
  assert.equal(svar.status, 503);
  assert.match(await tekst(svar), /Du er uten nett/);
});

test("an emptied cache rebuilds itself on the next visit – but a copy deleted on purpose is left alone", async () => {
  const n = lagNettleser();
  const sted = lagSted();
  n.publiser(sted);
  const sw = n.arbeider(sted);
  await sw.installer();
  await sw.aktiver();
  await sw.fyll();
  // The browser throws the cache away (storage pressure). The worker lives on.
  await n.caches.delete("rusj-lager-1");
  const { svar, etter } = await sw.naviger("/c/");
  assert.match(await tekst(svar), /<h1>c<\/h1>/, "siden skal komme fra nettet når lageret er borte");
  await etter;
  const lagret = await n.lagret();
  for (const [sti] of sted.SIDER) assert.ok(lagret.includes(sti), `${sti} ble ikke bygd opp igjen`);
  n.vert.nede = true;
  assert.match(await tekst((await sw.naviger("/a/")).svar), /<h1>a<\/h1>/);
  n.vert.nede = false;

  // «Slett alt» on /personvern/ deletes the caches while a download is running: it must stay deleted.
  const n2 = lagNettleser();
  const sted2 = lagSted({ spill: ["a", "b", "c", "d", "e", "f"] });
  n2.publiser(sted2);
  const sw2 = n2.arbeider(sted2);
  await sw2.installer();
  await sw2.aktiver();
  n2.vert.treg.set("/c/", 6000); // the download is busy with this page when the button is pressed
  const kjorer = sw2.fyll();
  await n2.pause(3000 + 3000);
  for (const navn of await n2.caches.keys()) await n2.caches.delete(navn);
  await kjorer;
  assert.deepEqual(await n2.caches.keys(), [], "nedlastingen i bakgrunnen laget lageret på nytt etter at det ble slettet");
});

// ---------- Updates ----------

test("after a deploy only what changed is fetched; files nobody names any more are removed", async () => {
  const n = lagNettleser();
  const v1 = lagSted();
  n.publiser(v1);
  let sw = n.arbeider(v1, "v1");
  await sw.installer();
  await sw.aktiver();
  await sw.fyll();
  const gammelFil = v1.filerFor("/b/").find((s) => s.startsWith("/b/spill.js"));

  const v2 = lagSted({ endret: { b: 2 } });
  const nyFil = v2.filerFor("/b/").find((s) => s.startsWith("/b/spill.js"));
  n.publiser(v2);
  n.nullstillLogg();
  sw = n.arbeider(v2, "v2"); // the browser found a new sw.js
  await sw.installer();
  await sw.aktiver();
  await sw.fyll();
  assert.deepEqual(n.hentet().sort(), ["/b/", nyFil].sort(), "bare den endrede siden og den nye fila skal hentes");
  const lagret = await n.lagret();
  assert.ok(lagret.includes(nyFil) && !lagret.includes(gammelFil), "den gamle fila ligger igjen, eller den nye mangler");
  n.vert.nede = true;
  for (const [sti] of v2.SIDER) assert.equal((await sw.naviger(sti)).svar.status, 200, `${sti} virker ikke uten nett etter oppdateringen`);
  assert.equal(await tekst(await sw.hent(nyFil)), `spill("b",2);`);
});

test("a page that is outdated after an update: the fresh one if the network is quick, else the stored one – which still works", async () => {
  const n = lagNettleser();
  const v1 = lagSted();
  n.publiser(v1);
  let sw = n.arbeider(v1, "v1");
  await sw.installer();
  await sw.aktiver();
  await sw.fyll();
  const v2 = lagSted({ endret: { a: 2, b: 2 } });
  n.publiser(v2);
  n.nett.saveData = true; // so the worker does not refresh the pages on its own
  sw = n.arbeider(v2, "v2");
  await sw.installer();
  await sw.aktiver();
  // Quick network: the fresh page, and it is stored with its new file.
  let r = await sw.naviger("/a/");
  assert.ok((await tekst(r.svar)).includes(v2.filerFor("/a/").find((s) => s.startsWith("/a/spill.js"))), "fikk ikke den nye siden");
  await r.etter;
  n.vert.nede = true;
  assert.ok((await tekst((await sw.naviger("/a/")).svar)).includes("/a/spill.js?v=" + hashTekst(`spill("a",2);`)));
  n.vert.nede = false;
  // Slow network: the stored page after the short limit; its own (old) file is still there.
  n.vert.treg.set("/b/", 8000);
  r = await sw.naviger("/b/");
  const gammelFil = v1.filerFor("/b/").find((s) => s.startsWith("/b/spill.js"));
  assert.ok((await tekst(r.svar)).includes(gammelFil), "skulle fått den lagrede siden da nettet var tregt");
  assert.equal(await tekst(await sw.hent(gammelFil)), `spill("b",1);`);
  await r.etter; // the slow answer arrived in the end and was stored
  n.vert.nede = true;
  assert.ok((await tekst((await sw.naviger("/b/")).svar)).includes("/b/spill.js?v=" + hashTekst(`spill("b",2);`)), "den ferske siden ble ikke lagret da den kom");
});

test("a half-finished deploy is never stored: an old page under the new list, or old content under a new address", async () => {
  const n = lagNettleser();
  const v1 = lagSted();
  n.publiser(v1);
  let sw = n.arbeider(v1, "v1");
  await sw.installer();
  await sw.aktiver();
  await sw.fyll();
  const v2 = lagSted({ endret: { a: 2, b: 2 } });
  const nyA = v2.filerFor("/a/").find((s) => s.startsWith("/a/spill.js"));
  // The host has the new worker and the new /a/ page, but still answers /b/ with the old page,
  // and the new address of a's script with the old script.
  n.publiser(v2);
  n.vert.filer.set("/b/", v1.filer.get("/b/"));
  n.vert.filer.set(nyA, { kropp: `spill("a",1);`, type: "application/javascript" });
  sw = n.arbeider(v2, "v2");
  await sw.installer();
  await sw.aktiver();
  await sw.fyll();
  let lagret = await n.lagret();
  assert.ok(!lagret.includes(nyA), "gammelt innhold ble lagret under ny adresse");
  n.vert.nede = true;
  // Both games still work offline, as the old version (page and files from the same build).
  for (const id of ["a", "b"]) {
    const html = await tekst((await sw.naviger(`/${id}/`)).svar);
    const fil = v1.filerFor(`/${id}/`).find((s) => s.includes("/spill.js"));
    assert.ok(html.includes(fil), `/${id}/: ikke den gamle siden`);
    assert.equal(await tekst(await sw.hent(fil)), `spill("${id}",1);`);
  }
  // The deploy finishes: the next round brings both up to date.
  n.vert.nede = false;
  n.publiser(v2);
  const { etter } = await sw.naviger("/c/");
  await etter;
  await sw.fyllHelt();
  lagret = await n.lagret();
  assert.ok(lagret.includes(nyA));
  assert.deepEqual(await sw.status(), { type: "rusj-status", versjon: "v2", sider: 4, lagret: 4, sparsomt: false });
});

// ---------- Taking over from the first generation of the worker ----------

test("takes over a first-generation cache without a single request, and nobody is stranded offline", async () => {
  const n = lagNettleser();
  const sted = lagSted();
  n.publiser(sted);
  await gammeltLager(n, sted, "rusj-1abc2de");
  await (await n.caches.open("luringen-gammel")).put("/index.html", new Response("gammel"));
  n.vert.nede = true; // prove it: no network at all during the takeover
  const sw = n.arbeider(sted);
  await sw.installer();
  assert.ok((await n.caches.keys()).includes("rusj-1abc2de"), "det gamle lageret ble slettet før den nye arbeideren tok over");
  await sw.aktiver();
  assert.deepEqual(await n.caches.keys(), ["rusj-lager-1"], "gamle lagre ligger igjen");
  for (const [sti] of sted.SIDER) assert.equal((await sw.naviger(sti)).svar.status, 200, `${sti} virker ikke uten nett rett etter overtakelsen`);
  for (const fil of sted.filerFor("/a/")) assert.equal((await sw.hent(fil)).status, 200, fil);
  n.vert.nede = false;
  n.nullstillLogg();
  await sw.fyll();
  assert.deepEqual(n.hentet(), [], "noe ble hentet selv om alt var uendret");
});

test("takeover when every page changed (like this very update): old pages keep working until the new ones are in", async () => {
  const n = lagNettleser();
  const v1 = lagSted({ kit: 1, forside: 1 });
  await gammeltLager(n, v1, "rusj-1abc2de");
  const v2 = lagSted({ kit: 2, forside: 2 });
  n.publiser(v2);
  n.apne("/a/");
  const sw = n.arbeider(v2, "v2");
  await sw.installer();
  await sw.aktiver();
  // Right after the takeover, without a connection: the open page and the front page are new,
  // the others are the old build – complete, with their own files.
  n.vert.nede = true;
  assert.match(await tekst((await sw.naviger("/")).svar), /rusj 2/);
  const gammelKit = v1.filerFor("/b/").find((s) => s.startsWith("/felles/rusj.js"));
  assert.ok((await tekst((await sw.naviger("/b/")).svar)).includes(gammelKit));
  assert.equal(await tekst(await sw.hent(gammelKit)), "window.Rusj=1;");
  n.vert.nede = false;
  await sw.fyllHelt();
  n.vert.nede = true;
  const nyKit = v2.filerFor("/b/").find((s) => s.startsWith("/felles/rusj.js"));
  for (const id of ["a", "b", "c"]) assert.ok((await tekst((await sw.naviger(`/${id}/`)).svar)).includes(nyKit), `/${id}/ er ikke oppdatert`);
  assert.ok(!(await n.lagret()).includes(gammelKit), "den gamle kit-fila ble ikke ryddet bort");
});

test("an old page with a file missing is not taken over (it would not work offline)", async () => {
  const n = lagNettleser();
  const sted = lagSted();
  const mangler = sted.filerFor("/b/").find((s) => s.startsWith("/b/spill.js"));
  await gammeltLager(n, sted, "rusj-1abc2de", [mangler]);
  n.vert.nede = true;
  const sw = n.arbeider(sted);
  await sw.installer();
  await sw.aktiver();
  const lagret = await n.lagret();
  assert.ok(lagret.includes("/a/") && !lagret.includes("/b/"));
  assert.equal((await sw.naviger("/b/")).svar.status, 503);
});

// ---------- The emergency worker and the real build ----------

let WEB = null;
let midlertidig = null;
before(() => {
  midlertidig = mkdtempSync(join(tmpdir(), "rusj-sw-"));
  WEB = join(midlertidig, "web");
  execFileSync(process.execPath, [join(ROT, "scripts/bygg.mjs"), "--ut", WEB], { cwd: ROT, stdio: "pipe" });
  execFileSync(process.execPath, [join(ROT, "scripts/bygg.mjs"), "--ut", join(midlertidig, "av"), "--spill", "pekefingeren", "--sw-av"], { cwd: ROT, stdio: "pipe" });
});
after(() => {
  if (midlertidig) rmSync(midlertidig, { recursive: true, force: true });
});

test("--sw-av: the emergency worker deletes the copy, removes itself and reloads open pages once – never in a loop", async () => {
  const kilde = readFileSync(join(midlertidig, "av/sw.js"), "utf8");
  assert.ok(kilde.length < 1500 && !kilde.includes("__"), "nødarbeideren skal være liten og ferdig utfylt");
  const n = lagNettleser();
  const sted = lagSted();
  n.publiser(sted);
  const vanlig = n.arbeider(sted);
  await vanlig.installer();
  await vanlig.aktiver();
  n.apne("/a/");
  const av = n.start(kilde);
  await av.installer();
  await av.aktiver();
  assert.deepEqual(await n.caches.keys(), []);
  assert.equal(n.avregistrert, 1);
  assert.deepEqual(n.sider[0].navigert, [OPPHAV + "/a/"], "den åpne siden skal lastes på nytt én gang");
  assert.equal((await av.naviger("/a/")).svar, null, "nødarbeideren skal ikke svare på forespørsler");
  // The reloaded page registers /sw.js again: same worker, nothing to delete, no second reload.
  const igjen = n.start(kilde);
  await igjen.installer();
  await igjen.aktiver();
  assert.deepEqual(n.sider[0].navigert.length, 1, "siden ble lastet på nytt en gang til (løkke)");
});

// The real site served from the build folder.
function publiserBygg(n) {
  const typer = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain" };
  const filer = new Map();
  (function gaa(mappe, sti) {
    for (const navn of readdirSync(mappe)) {
      const f = join(mappe, navn);
      if (statSync(f).isDirectory()) gaa(f, `${sti}${navn}/`);
      else {
        const o = { kropp: new Uint8Array(readFileSync(f)), type: typer[extname(f)] || "application/octet-stream" };
        filer.set(sti + navn, o);
        if (navn === "index.html") filer.set(sti, o);
      }
    }
  })(WEB, "/");
  n.vert.filer = filer;
  n.vert.treg = new Map();
  return filer;
}

test("the build: every page names files that exist, and every script and style carries the hash of its own text", () => {
  const sw = readFileSync(join(WEB, "sw.js"), "utf8");
  const sider = JSON.parse(sw.match(/const SIDER = (\[.*?\]); \/\//)[1]);
  const ekstra = JSON.parse(sw.match(/const EKSTRA = (\[.*?\]); \/\//)[1]);
  assert.ok(sider.length >= 45 && sider[0][0] === "/", "forsiden skal stå først i SIDER");
  for (const sti of ["/om/", "/personvern/", "/luringen/", "/ordugla/"]) assert.ok(sider.some((s) => s[0] === sti), `SIDER mangler ${sti}`);
  assert.deepEqual(ekstra.map((e) => e[0]), ["/manifest.webmanifest", "/en/manifest.webmanifest", "/da/manifest.webmanifest", "/luringen/ikon.svg", "/luringen/ikon-180.png"]);
  const sett = new Set();
  for (const [sti, hash] of [...sider, ...ekstra]) {
    const fil = join(WEB, sti.endsWith("/") ? sti + "index.html" : sti);
    assert.ok(existsSync(fil), `${sti} finnes ikke i bygget`);
    const innhold = new Uint8Array(readFileSync(fil));
    assert.equal(hashBytes(innhold), hash, `${sti}: hashen i sw.js stemmer ikke med fila`);
    if (!sti.endsWith("/")) continue;
    const html = new TextDecoder().decode(innhold);
    const filer = [...html.matchAll(/\s(?:src|href)="(\/[^"?#]*\?v=[^"#]*)"/g)].map((m) => m[1]);
    assert.ok(filer.length >= 2, `${sti}: fant bare ${filer.length} filer med ?v=`);
    // Every script and stylesheet of the page must be among them (nothing the worker cannot see).
    for (const m of html.matchAll(/<(?:script[^>]*\ssrc|link rel="stylesheet" href)="([^"]+)"/g)) assert.ok(filer.includes(m[1]), `${sti}: ${m[1]} har ikke ?v= og blir ikke lagret`);
    assert.doesNotMatch(html.slice(html.indexOf("<body")), /<script[^>]*\ssrc=/, `${sti}: et skript står i <body> (skal være defer i <head>)`);
    for (const adr of filer) sett.add(adr);
  }
  for (const adr of sett) {
    const fil = join(WEB, adr.split("?")[0]);
    assert.ok(existsSync(fil), `${adr} finnes ikke i bygget`);
    if (/\.(js|css)\?v=/.test(adr)) assert.equal(hashTekst(new TextDecoder().decode(readFileSync(fil))), adr.split("?v=")[1], `${adr}: ?v= er ikke hashen av teksten (arbeideren ville forkastet fila)`);
  }
  // The two big install icons are only for the manifest; no page names them, so they are not stored.
  assert.ok(![...sett].some((a) => /ikon-(512|maskerbar-512)\.png/.test(a)));
  assert.ok(sw.includes("Du er uten nett") && sw.includes("Til forsiden"), "sw.js mangler frakoblet-siden");
});

test("the real site: a first visit is cheap, the idle download brings every page, and all of it works offline", async () => {
  const n = lagNettleser();
  const filer = publiserBygg(n);
  const kb = (stier) => Math.round(stier.reduce((s, sti) => s + (filer.get(sti) || filer.get(sti.split("?")[0])).kropp.length, 0) / 1024);
  n.apne("/ordugla/");
  const sw = n.start(readFileSync(join(WEB, "sw.js"), "utf8"));
  await sw.installer();
  const forst = [...new Set(n.hentet())];
  assert.ok(forst.includes("/") && forst.includes("/ordugla/") && forst.length < 25, `første besøk hentet ${forst.length} filer`);
  assert.ok(kb(forst) < 1000, `første besøk hentet ${kb(forst)} kB (ukomprimert) – hele nettstedet er rundt 5000`);
  await sw.aktiver();
  await sw.fyll();
  const status = await sw.status();
  assert.equal(status.lagret, status.sider, "ikke alle sidene ble lagret");
  assert.equal(new Set(n.hentet()).size, n.hentet().length, "noe ble hentet to ganger");
  assert.ok(!n.hentet().some((s) => /ikon-(512|maskerbar-512)/.test(s)), "de store ikonene ble hentet");
  n.vert.nede = true;
  n.nullstillLogg();
  const sider = JSON.parse(readFileSync(join(WEB, "sw.js"), "utf8").match(/const SIDER = (\[.*?\]); \/\//)[1]);
  // (a Norwegian visitor: the other editions are fetched only for those who use them – see below)
  for (const [sti] of sider.filter(([s]) => !/^\/(en|da)\//.test(s))) {
    const { svar } = await sw.naviger(sti);
    assert.equal(svar.status, 200, sti);
    const html = await tekst(svar);
    for (const m of html.matchAll(/\s(?:src|href)="(\/[^"?#]*\?v=[^"#]*)"/g)) assert.equal((await sw.hent(m[1])).status, 200, `${sti}: ${m[1]} mangler uten nett`);
  }
  assert.equal((await sw.hent("/manifest.webmanifest")).status, 200);
  assert.equal((await sw.naviger("/finnes-ikke/")).svar.status, 503);
});
