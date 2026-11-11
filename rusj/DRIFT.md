# Running rusj.no: offline copy, updates and the emergency brake

Operating notes for the part of rusj.no that nobody sees: the service worker (`rusj/kit/sw.js`)
that keeps the games playable without a connection. Read this before changing the worker, the
build's page head (`hode()` in `scripts/rusj.mjs`) or the way files get their addresses.

## How it works

- **One cache, `rusj-lager-1`.** It holds pages and the files they need. A page is stored only
  after every file it names is stored, and replaced the same way (files first, the page last).
  A stored page therefore always works offline.
- **Files never change.** Every script, stylesheet and icon a page names carries
  `?v=<hash of its content>`. The worker fetches such a file once and keeps it. It finds a page's
  files by reading the page: every `src="/…?v=…"` and `href="/…?v=…"`. There is no second list.
- **First visit:** the worker stores the front page, the manifest and the page that is open.
  About 0.1–0.2 MB, most of it already in the browser's own cache.
- **When idle:** the rest of the games, one page at a time, a few seconds after the last request
  from a page, at low priority. Not on Save-Data and not on a connection the browser calls 2G:
  there a game is stored when someone opens it.
- **A visit:** a stored page is shown at once, without asking the network. A page that is not
  stored comes from the network and is kept. Offline, an unknown address gets a small page that
  says so and links to the front page (it lives inside `sw.js`, so it cannot be missing).
- **Self-repair:** if the browser throws the cache away, the next visit rebuilds it. If the user
  deletes it with the button on `/personvern/`, the running download stops and leaves it deleted.

## Versions and deploys

`scripts/bygg.mjs` writes three values into `sw.js`:

| Value | What it is | What it is for |
|---|---|---|
| `VERSJON` | a hash of every published file | makes `sw.js` differ from the last build after any change |
| `SIDER` | every page with a hash of its content, front page first, then front-page order | tells the worker which pages changed, and in which order to fetch them |
| `EKSTRA` | manifest and Luringen's icons, with hashes | the few files without `?v=` in their address |

What happens after a push to `main`:

1. Browsers compare `sw.js` byte for byte on every visit (they bypass their cache for this file)
   and install the new one when it differs.
2. The new worker **keeps the cache**. During install it refreshes the front page and the open
   page if their hashes changed. Then it takes over open pages at once (`skipWaiting`, `claim`);
   pages are not reloaded and a game in progress goes on.
3. When idle it fetches the other pages whose hash changed, and the files they name that are not
   stored yet. Nothing else: a change in one game costs that game's page and its changed file.
   A change in the kit changes every game page (they name the kit's `?v=`), so all pages are
   fetched again, about 0.15 MB.
4. Until a page has been refreshed, its old copy (page and files from the same build) stays in
   use. If someone opens such a page with a connection, the fresh page gets 2 seconds to arrive
   first; otherwise the stored one is shown and the fresh one is kept for next time.
5. When every page is up to date, files that no stored page names any more are removed.

Everything fetched is checked: a page against its hash in `SIDER`, a script or stylesheet against
the hash in its own address. While a deploy is spreading, the host can answer with a mix of old
and new for a moment; such answers are not stored and are tried again later.

The first generation of the worker kept one cache per version (`rusj-<hash>`) and fetched all
files at install. The current worker moves those pages and files into `rusj-lager-1` without any
request and deletes the old cache when it takes over.

## Checking a change

```bash
node --test test/sw.test.mjs      # the worker in a pretend browser, and against a real build
node --test test/bygg.test.mjs    # page heads, manifest, sitemap
```

`test/sw.test.mjs` covers: first visit, idle download, Save-Data/2G, a failing file, no
connection, stored pages without the network, the offline page, self-repair, updates that fetch
only what changed, half-finished deploys, taking over a first-generation cache, and the emergency
worker. Add a case there when the worker gets a new rule.

In a browser: DevTools → Application → Service workers shows the active worker; Cache storage →
`rusj-lager-1` shows what is stored (stored pages carry the header `x-rusj-hash`).

A page can talk to the worker (none of this is required for it to work):

```js
navigator.serviceWorker.controller.postMessage("rusj-fyll");               // "I am idle: go on with the downloads"
navigator.serviceWorker.controller.postMessage({ type: "rusj-status" });   // answer: { type, versjon, sider, lagret, sparsomt }
```

## Rules to keep

- Every script and stylesheet a page uses must be named in its HTML with `?v=` (the build's
  `skriv()` returns such addresses). A file loaded any other way is not stored for offline use.
- Scripts go in `<head>` with `defer` (`hode({ skript: [...] })`). The Content-Security-Policy
  `<meta>` switches off the browser's look-ahead loading, so scripts at the end of `<body>` load
  one after another.
- `sw.js` must contain each placeholder (`__VERSJON__`, `__SIDER__`, `__EKSTRA__`,
  `__FRAKOBLET__`) exactly once; the build stops otherwise.
- Change the cache name `rusj-lager-1` only if the way things are stored changes. The worker
  takes over caches named `rusj-…` and `luringen-…`, so a new name would be taken over as well.

## A bad deploy

Most problems need no brake: revert the commit and push. The build gets a new `VERSJON`, browsers
install the worker on the next visit, and it refreshes the pages that changed back.

## The emergency brake

Use it only when the worker itself is at fault (pages do not load, or the wrong files are served)
and a normal fix would have to pass through that faulty worker.

**Pull it:**

```bash
touch rusj/SW-AV
git add rusj/SW-AV && git commit -m "Emergency: remove the service worker" && git push
```

With that file in the repository the build publishes a different `sw.js` (the same as
`node scripts/bygg.mjs --sw-av`). It has no request handling at all. When a browser installs it,
it deletes every cache of rusj.no, unregisters itself and reloads the open rusj pages once, so
they load straight from the host. Names, settings and games in progress are in `localStorage` and
are not touched.

What to expect:
- It reaches a user on their next visit **with a connection**. Someone who is offline keeps the
  old worker until then.
- Every page still calls `register("/sw.js")`, so the brake worker is installed and removed again
  on each page view. That is harmless (it reloads only when there was a cache to delete), but
  nothing works offline while the brake is on.

**Release it:**

```bash
git rm rusj/SW-AV
git commit -m "Service worker back" && git push
```

The normal worker comes back on the next visit and builds the offline copy again in stages.

**Try it locally first:** `node scripts/bygg.mjs --ut build/web-av --sw-av`, then look at
`build/web-av/sw.js`. The test «--sw-av: the emergency worker …» in `test/sw.test.mjs` runs it.
