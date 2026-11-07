// Offline support for the website: the game keeps working at a party with bad coverage.
const CACHE = "luringen-__VERSJON__";
const FILER = ["./", "./index.html", "./manifest.webmanifest", "./ikon.svg", "./ikon-180.png", "./ikon-192.png", "./ikon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILER))
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
  const foresporsel = e.request;
  if (foresporsel.method !== "GET" || new URL(foresporsel.url).origin !== self.location.origin) return;
  if (foresporsel.mode === "navigate") {
    // Network first so updates arrive; cached copy when offline.
    e.respondWith(
      fetch(foresporsel)
        .then((svar) => {
          const kopi = svar.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", kopi));
          return svar;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  e.respondWith(caches.match(foresporsel).then((treff) => treff || fetch(foresporsel)));
});
