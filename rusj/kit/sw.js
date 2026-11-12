// Offline support for all of rusj.no: every game keeps working at a party with bad coverage.
// How it is run, tested and switched off in an emergency: rusj/DRIFT.md.
//
// WHAT IS STORED
//   One cache (LAGER) holds pages and the files they need. A page is stored only after every file
//   it names is in place, and it is replaced the same way: files first, the page last. A stored
//   page therefore always works without a connection, whatever else is going on.
//   Files carry ?v=<hash of their content> in their address and never change: fetched once, kept.
//
// WHEN IT IS FETCHED
//   Install    The front page and the page that is open right now. Nothing else, so a first visit
//              stays cheap. Nothing can make the install fail: what is missing is fetched later.
//   When idle  The other games, one page at a time, while no page is loading. Never on Save-Data
//              or a 2G connection: there a game is stored when someone opens it.
//   A visit    A stored page is shown at once, without asking the network. A page that is not
//              stored comes from the network and is kept. Without a connection an unknown address
//              gets a small page that says so (FRAKOBLET) and links to the front page.
//
// VERSIONS AND UPDATES
//   The build (scripts/bygg.mjs) writes three things into this file: VERSJON, a hash of every
//   published file; SIDER, every page with a hash of its content; EKSTRA, the few other files
//   without a hash in their address. Browsers compare sw.js byte for byte on every visit and
//   install it when it differs – VERSJON is what makes it differ after any change.
//   A new worker keeps the cache. It compares the hash of each stored page with SIDER and fetches
//   only the pages that changed, plus the files they name that are not stored yet. Until a page has
//   been refreshed its stored copy (page and files from the same build) stays in use; when someone
//   opens such a page with a connection, the fresh page gets FRIST ms to arrive first.
//   Everything fetched is checked against its hash, so a half-finished deploy is never stored.
//   The first generation of this worker kept one cache per version ("rusj-<hash>") and fetched
//   everything at install. Its pages and files are moved into LAGER without a single request.
const VERSJON = "__VERSJON__";
const LAGER = "rusj-lager-1"; // one cache for every version; change the name only if the layout changes
const SIDER = __SIDER__; // [[path, hash], …] – the front page first, then the games in front-page order
const EKSTRA = __EKSTRA__; // [[path, hash], …] – manifest and other files without ?v=
const FRAKOBLET = __FRAKOBLET__; // the page shown when a page is neither stored nor reachable

const FRIST = 2000; // ms the network gets when the stored page is known to be outdated
const FRIST_UKJENT = 10000; // ms before a page that is not stored at all is given up
const ROLIG = 3000; // ms without requests from a page before the worker fetches on its own
const SAMTIDIG = 3; // files fetched at the same time
const HASH_HODE = "x-rusj-hash"; // header on stored pages: the hash of their content
const ONSKET = new Map([...SIDER, ...EKSTRA]); // path → the hash this build expects
const FORSIDE = SIDER.length ? SIDER[0][0] : "/";
const MANIFEST = "/manifest.webmanifest";
// The editions under a folder of their own (/en/, /da/ – rusj/SPRAK.md): the build gives each its own
// offline page, so FRAKOBLET names them. The worker fetches ahead only the pages of the editions
// this visitor uses: those of the open pages and of the pages opened since the worker started
// (Norwegian when there are none).
const UTGAVER = typeof FRAKOBLET === "object" ? Object.keys(FRAKOBLET).filter((u) => u !== "/") : [];
const utgaveAv = (sti) => UTGAVER.find((u) => sti.startsWith(u)) || "/";
const brukteUtgaver = new Set();
async function utgaverIBruk() {
  const ut = new Set(brukteUtgaver);
  try {
    for (const k of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) ut.add(utgaveAv(new URL(k.url).pathname));
  } catch (feil) {
    /* none known: Norwegian */
  }
  if (!ut.size) ut.add("/");
  return ut;
}

const vent = (ms) => new Promise((ferdig) => setTimeout(ferdig, ms));

// FNV-1a in base 36, as in the build: over bytes for pages, over characters for ?v=.
function fnv(lengde, tegn) {
  let h = 0x811c9dc5;
  for (let i = 0; i < lengde; i++) {
    h ^= tegn(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
const hashBytes = (bytes) => fnv(bytes.length, (i) => bytes[i]);
const hashTekst = (tekst) => fnv(tekst.length, (i) => tekst.charCodeAt(i));

// "/ordugla" and "/ordugla/index.html" are the page "/ordugla/".
function sideSti(sti) {
  if (sti.endsWith("/index.html")) return sti.slice(0, -"index.html".length);
  if (!sti.endsWith("/") && !sti.slice(sti.lastIndexOf("/")).includes(".")) return sti + "/";
  return sti;
}

// The files a page needs: every address on this site with ?v= in its markup (scripts, styles, icons).
function filerI(html) {
  const ut = new Set();
  for (const m of html.matchAll(/\s(?:src|href)="(\/[^"?#]*\?v=[^"#]*)"/g)) ut.add(m[1]);
  return [...ut];
}

// Save-Data, or a connection the browser calls 2G: fetch nothing that nobody asked for.
function sparsomt() {
  const nett = self.navigator && self.navigator.connection;
  return !!nett && (nett.saveData === true || /(^|-)2g$/.test(String(nett.effectiveType || "")));
}

async function iPuljer(liste, gjor) {
  const ko = liste.slice();
  await Promise.all(
    Array.from({ length: Math.min(SAMTIDIG, ko.length) }, async () => {
      while (ko.length) await gjor(ko.shift());
    }),
  );
}

// Is this what the address says it is? Scripts and styles carry the hash of their text in ?v=.
// While a deploy spreads, the host can answer a new address with the old content for a moment.
// (Reads a copy of the answer; the answer itself can still be stored or passed on.)
async function stemmer(adr, svar) {
  if (!/\.(js|css)\?v=/.test(adr)) return true;
  return hashTekst(await svar.clone().text()) === adr.split("?v=")[1];
}

// One file with ?v= in its address: fetched unless it is stored already, kept only if it is right.
async function hentFil(lager, adr, valg) {
  if (await lager.match(adr)) return;
  const svar = await fetch(adr, valg);
  if (!svar.ok) throw new Error(`${adr}: ${svar.status}`);
  if (!(await stemmer(adr, svar))) throw new Error(`${adr}: innholdet stemmer ikke med adressen`);
  await lager.put(adr, svar);
}

const somLagret = (bytes, type, hash) => new Response(bytes, { headers: { "content-type": type, [HASH_HODE]: hash } });

// Stores a page: every file it names first, the page itself last.
async function lagreSide(lager, sti, bytes, type, valg) {
  await iPuljer(filerI(new TextDecoder().decode(bytes)), (adr) => hentFil(lager, adr, valg));
  await lager.put(sti, somLagret(bytes, type || "text/html; charset=utf-8", hashBytes(bytes)));
}

// Makes sure one listed page or extra file is stored as this build expects it.
// "har": it was; "ny": fetched and stored; "venter": the host does not serve this build's copy yet.
async function sikre(lager, sti, valg) {
  const onsket = ONSKET.get(sti);
  const lagret = await lager.match(sti);
  if (lagret && lagret.headers.get(HASH_HODE) === onsket) return "har";
  const svar = await fetch(sti, { cache: "no-cache", ...valg });
  if (!svar.ok) throw new Error(`${sti}: ${svar.status}`);
  const bytes = new Uint8Array(await svar.arrayBuffer());
  if (hashBytes(bytes) !== onsket) return "venter";
  if (sti.endsWith("/")) await lagreSide(lager, sti, bytes, svar.headers.get("content-type"), valg);
  else await lager.put(sti, somLagret(bytes, svar.headers.get("content-type") || "application/octet-stream", onsket));
  return "ny";
}

// Caches from older workers ("rusj-<hash>", "luringen-<hash>"): move every page whose files are all
// there into LAGER, with those files – no requests. With `slett` the old cache is removed afterwards
// (only once this worker is in charge: until then the old worker still answers from it).
async function overtaGamle(lager, slett) {
  for (const navn of await caches.keys()) {
    if (navn === LAGER || !/^(rusj|luringen)-/.test(navn)) continue;
    const gammel = await caches.open(navn);
    for (const foresporsel of await gammel.keys()) {
      const url = new URL(foresporsel.url);
      const sti = url.pathname;
      if (url.origin !== self.location.origin || url.search || (await lager.match(sti))) continue; // pages and other files without ?v=
      const svar = await gammel.match(foresporsel);
      if (!svar || !svar.ok) continue;
      const bytes = new Uint8Array(await svar.arrayBuffer());
      if (sti.endsWith("/")) {
        const kopier = [];
        let komplett = true;
        for (const adr of filerI(new TextDecoder().decode(bytes))) {
          if (await lager.match(adr)) continue;
          const fil = await gammel.match(adr);
          if (!fil) {
            komplett = false;
            break;
          }
          kopier.push([adr, fil]);
        }
        if (!komplett) continue;
        for (const [adr, fil] of kopier) await lager.put(adr, fil);
      }
      await lager.put(sti, somLagret(bytes, svar.headers.get("content-type") || (sti.endsWith("/") ? "text/html; charset=utf-8" : "application/octet-stream"), hashBytes(bytes)));
    }
    if (slett) await caches.delete(navn);
  }
}

// Removes what no stored page names any more (files of older builds) and pages that left the site.
async function rydd(lager) {
  const behold = new Set(EKSTRA.map((e) => e[0]));
  const nokler = await lager.keys();
  for (const foresporsel of nokler) {
    const url = new URL(foresporsel.url);
    if (url.search || !ONSKET.has(url.pathname) || !url.pathname.endsWith("/")) continue;
    behold.add(url.pathname);
    const svar = await lager.match(foresporsel);
    if (svar) for (const adr of filerI(await svar.text())) behold.add(adr);
  }
  for (const foresporsel of nokler) {
    const url = new URL(foresporsel.url);
    if (!behold.has(url.pathname + url.search)) await lager.delete(foresporsel);
  }
}

// ---------- The rest of the games, when the phone has nothing better to do ----------

let fyller = null; // the download that is running (never two at a time)
let altLagret = false; // everything in SIDER and EKSTRA is stored, as far as this worker has seen
let sistSpurt = 0; // when a page last asked for something: stay out of its way

function fyll() {
  if (altLagret) return Promise.resolve();
  if (!fyller) {
    fyller = hentResten()
      .catch(() => {})
      .then(() => {
        fyller = null;
      });
  }
  return fyller;
}

async function hentResten() {
  // Never while a page is loading: wait until ROLIG ms have passed since a page last asked for
  // something (and since this was started).
  const start = Date.now();
  const rolig = async () => {
    for (;;) {
      const igjen = ROLIG - (Date.now() - Math.max(sistSpurt, start));
      if (igjen <= 0) return;
      await vent(igjen);
    }
  };
  await rolig();
  const lager = await caches.open(LAGER);
  await overtaGamle(lager, true);
  const lav = { priority: "low" };
  let mangler = 0;
  let endret = 0;
  const ett = async (sti) => {
    try {
      const utfall = await sikre(lager, sti, lav);
      if (utfall === "venter") mangler++;
      if (utfall === "ny") endret++;
      return true;
    } catch (feil) {
      mangler++;
      return !(feil instanceof TypeError); // TypeError: no connection – stop, the next visit goes on from here
    }
  };
  // The way in when the connection is gone: always, also on a metered connection.
  // The editions in use: the open pages' and those opened since the worker started.
  const utgaver = await utgaverIBruk();
  const forsider = [FORSIDE, MANIFEST, ...UTGAVER.filter((u) => utgaver.has(u)).flatMap((u) => [u, u + "manifest.webmanifest"])];
  for (const sti of forsider) if (ONSKET.has(sti) && !(await ett(sti))) return;
  // Then the other pages in the order of the front page, and last the remaining extra files.
  const iBruk = (sti) => utgaver.has(utgaveAv(sti));
  for (const [sti] of [...SIDER.slice(1), ...EKSTRA.filter((e) => e[0] !== MANIFEST)]) {
    if (forsider.includes(sti) || !iBruk(sti)) continue;
    if (!(await caches.has(LAGER))) return; // the copy was deleted on purpose (/personvern/): leave it
    const lagret = await lager.match(sti);
    if (lagret && lagret.headers.get(HASH_HODE) === ONSKET.get(sti)) continue;
    if (sparsomt()) {
      mangler++; // stored when someone opens it instead
      continue;
    }
    await rolig(); // a page is loading: wait for it
    if (!(await ett(sti))) return;
  }
  if (!mangler) {
    altLagret = true;
    if (endret) await rydd(lager);
  }
}

// ---------- Install, take over, messages ----------

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      try {
        const lager = await caches.open(LAGER);
        await overtaGamle(lager, false);
        // The front page, the manifest and the pages that are open right now.
        const apne = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).map((k) => sideSti(new URL(k.url).pathname));
        // (and the front page of each open page's edition)
        const egne = apne.map(utgaveAv).filter((u) => u !== "/").flatMap((u) => [u, u + "manifest.webmanifest"]);
        for (const sti of new Set([FORSIDE, MANIFEST, ...egne, ...apne])) if (ONSKET.has(sti)) await sikre(lager, sti).catch(() => {});
      } catch (feil) {
        /* never stop the install: whatever is missing is fetched later */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      try {
        await overtaGamle(await caches.open(LAGER), true);
      } catch (feil) {
        /* the old cache stays and is tried again later; pages are still found in it */
      }
      await self.clients.claim();
    })(),
  );
  fyll(); // not waited for: taking over must not wait for the downloads
});

// A page may say "rusj-fyll" when it is idle (the worker then gets time to finish the downloads),
// and ask "rusj-status" to learn how much is stored.
self.addEventListener("message", (e) => {
  const hva = e.data && (e.data.type || e.data);
  if (hva === "rusj-fyll") e.waitUntil(fyll());
  if (hva === "rusj-status" && e.source) {
    e.waitUntil(
      (async () => {
        const lager = await caches.open(LAGER);
        // (the pages of the editions in use: those are the ones the worker keeps)
        const utgaver = await utgaverIBruk();
        const mine = SIDER.filter(([sti]) => utgaver.has(utgaveAv(sti)));
        let lagret = 0;
        for (const [sti, hash] of mine) {
          const svar = await lager.match(sti);
          if (svar && svar.headers.get(HASH_HODE) === hash) lagret++;
        }
        e.source.postMessage({ type: "rusj-status", versjon: VERSJON, sider: mine.length, lagret, sparsomt: sparsomt() });
      })(),
    );
  }
});

// ---------- Requests ----------

// FRAKOBLET is one page, or one per edition: { "/": …, "/en/": … }.
const frakoblet = (sti) => new Response(typeof FRAKOBLET === "string" ? FRAKOBLET : FRAKOBLET[utgaveAv(sti || "/")] || FRAKOBLET["/"], { status: 503, statusText: "Uten nett", headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

// A page. `etter` collects what goes on after the answer (the caller keeps the worker alive for it).
async function side(req, url, etter) {
  const sti = sideSti(url.pathname);
  const onsket = ONSKET.get(sti);
  const lager = await caches.open(LAGER);
  const lagret = (await lager.match(sti)) || (await caches.match(url.origin + sti)); // or what an older worker left
  const lagretHash = lagret ? lagret.headers.get(HASH_HODE) : null;
  // Stored as this build expects it: show it at once. Nothing is asked of the network; a newer
  // version of the site arrives with a newer worker.
  if (lagret && onsket && lagretHash === onsket) return lagret;
  if (onsket) altLagret = false; // a listed page is missing or outdated: there is something to fetch

  // Ask the network, and keep what comes back (its files first) for next time.
  const nett = fetch(req);
  etter.push(
    nett
      .then(async (svar) => {
        if (svar.status === 404 && lagret) return lager.delete(sti);
        if (!svar.ok || !sti.endsWith("/") || !/text\/html/.test(svar.headers.get("content-type") || "")) return;
        const bytes = new Uint8Array(await svar.clone().arrayBuffer());
        if (hashBytes(bytes) !== lagretHash) await lagreSide(lager, sti, bytes, svar.headers.get("content-type"));
      })
      .catch(() => {}),
  );
  if (lagret) {
    // A page this build does not list: the stored copy now, the fresh one next time.
    if (!onsket) return lagret;
    // Outdated after an update: the fresh page gets FRIST ms, otherwise the stored one is shown.
    return Promise.race([nett.then((svar) => (svar.ok || svar.status === 404 ? svar : lagret)).catch(() => lagret), vent(FRIST).then(() => lagret)]);
  }
  // Not stored: the network – or, without one, a page that says so.
  return Promise.race([nett, vent(FRIST_UKJENT).then(() => Promise.reject(new Error("frist")))]).catch(() => frakoblet(sti));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;
  sistSpurt = Date.now();

  if (req.mode === "navigate") {
    brukteUtgaver.add(utgaveAv(url.pathname));
    const etter = [];
    const svar = side(req, url, etter);
    e.respondWith(svar);
    // After the answer: finish storing this page, then go on with the rest of the games.
    e.waitUntil(
      svar
        .catch(() => {})
        .then(() => Promise.all(etter))
        .then(fyll),
    );
    return;
  }

  e.respondWith(
    (async () => {
      const treff = await caches.match(req);
      if (treff) return treff;
      const svar = await fetch(req);
      if (svar.ok && url.search.includes("v=")) {
        const kopi = svar.clone();
        e.waitUntil(
          stemmer(url.pathname + url.search, kopi)
            .then(async (riktig) => {
              if (riktig) await (await caches.open(LAGER)).put(req, kopi);
            })
            .catch(() => {}),
        );
      }
      return svar;
    })(),
  );
});
