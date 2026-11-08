// Offline support for all of rusj.no: games keep working at a party with bad coverage.
// Pages: network first (updates arrive at once), cached copy when offline.
// Files: they carry ?v=<hash> in their address, so a cached copy is always the right one.
const CACHE = "rusj-__VERSJON__";
const FORHAND = __FILER__;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FORHAND))
      .catch(() => {})
      .then(() => self.skipWaiting()),
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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    const nokkel = url.origin + url.pathname;
    e.respondWith(
      fetch(req)
        .then((svar) => {
          if (svar.ok) {
            const kopi = svar.clone();
            caches.open(CACHE).then((c) => c.put(nokkel, kopi));
          }
          return svar;
        })
        .catch(() => caches.match(nokkel).then((treff) => treff || caches.match("/"))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (treff) =>
        treff ||
        fetch(req).then((svar) => {
          if (svar.ok && url.search.includes("v=")) {
            const kopi = svar.clone();
            caches.open(CACHE).then((c) => c.put(req, kopi));
          }
          return svar;
        }),
    ),
  );
});
