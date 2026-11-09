// Offline support for all of rusj.no: every game keeps working at a party with bad coverage.
// - Install: every page and file of every game is stored (the build lists them in FORHAND), so
//   games work offline even if they were never opened. Files carry ?v=<content hash> and never
//   change, so unchanged ones are copied from the previous version instead of downloaded again.
//   The new version only takes over when everything is in place; until then the old, complete
//   copy stays in charge (an update over a bad connection can never break offline play).
// - Pages: network first so updates arrive at once, but after 3 seconds without an answer the
//   stored copy is shown (a hanging connection must not freeze the party).
const CACHE = "rusj-__VERSJON__";
const FORHAND = __FILER__;
const TIDSFRIST = 3000;

async function fraGamle(gamle, url) {
  for (const navn of gamle) {
    const treff = await (await caches.open(navn)).match(url);
    if (treff) return treff;
  }
  return null;
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const ny = await caches.open(CACHE);
      const gamle = (await caches.keys()).filter((n) => n !== CACHE);
      const mangler = [];
      await Promise.all(
        FORHAND.map(async (url) => {
          if (url.includes("?v=")) {
            const kopi = await fraGamle(gamle, url);
            if (kopi) return ny.put(url, kopi);
          }
          try {
            const svar = await fetch(new Request(url, { cache: "reload" }));
            if (!svar.ok) throw new Error(String(svar.status));
            await ny.put(url, svar);
          } catch (feil) {
            const kopi = await fraGamle(gamle, url);
            if (kopi) await ny.put(url, kopi);
            else mangler.push(url);
          }
        }),
      );
      if (mangler.length) throw new Error(`rusj: ${mangler.length} filer mangler – prøver igjen senere`);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((navn) => Promise.all(navn.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function side(e, req, url) {
  const cache = await caches.open(CACHE);
  const nokkel = url.origin + url.pathname;
  const lagret = (await caches.match(nokkel)) || (!nokkel.endsWith("/") && (await caches.match(nokkel + "/"))) || null;
  const nett = fetch(req).then((svar) => {
    if (svar.ok) e.waitUntil(cache.put(nokkel, svar.clone()));
    return svar;
  });
  if (!lagret) {
    return nett.catch(async () => (await caches.match(url.origin + "/")) || Response.error());
  }
  const fraNett = nett.then((svar) => (svar.ok || svar.status === 404 ? svar : lagret)).catch(() => lagret);
  const frist = new Promise((ok) => setTimeout(() => ok(lagret), TIDSFRIST));
  return Promise.race([fraNett, frist]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(side(e, req, url));
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (treff) =>
        treff ||
        fetch(req).then((svar) => {
          if (svar.ok && url.search.includes("v=")) {
            const kopi = svar.clone();
            e.waitUntil(caches.open(CACHE).then((c) => c.put(req, kopi)));
          }
          return svar;
        }),
    ),
  );
});
