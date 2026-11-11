# Client contract: rusj.no → rusj-statistikk

For whoever maintains the kit and the build. The sender is `rusj/kit/stat.js`; the Worker is
`statistikk/src/`. Both sides are tested together in `statistikk/test/klient.test.mjs` (every name
the client can send must pass the Worker's grammar).

## Switch

`STAT_ADRESSE` in `scripts/rusj.mjs` is the only switch.

- Empty (default): nothing is published, nothing is sent, the CSP is unchanged, and the footer,
  `/personvern/` and the kit's rules sheet say exactly what they said before.
- Set to the Worker's bare origin (`https://rusj-statistikk.<sub>.workers.dev`; the build refuses
  anything else, except `http://localhost`/`127.0.0.1` for tests):
  - CSP: `connect-src 'self' <origin>` on every page.
  - `/felles/stat.js` = `window.RUSJ_STAT="<origin>";` + `rusj/kit/stat.js`, loaded with `defer`
    as the **first** script on every page (front page, game pages, Luringen, the pages about rusj),
    so `window.RusjStat` exists before the kit runs.
  - Footer, `/personvern/` («Anonym telling») and the rules sheet switch to the wording below.

## Endpoint

`POST <origin>/t`, body = JSON text, `Content-Type: text/plain` (a CORS-safelisted type: no
preflight), `credentials: "omit"`, `keepalive: true`, `referrerPolicy: "no-referrer"`.

```json
{"v":1,"k":["side.ordugla","besok","enhet.igar"]}
```

- Exactly two fields. `v` is `1`. `k` has 1–16 names, each ≤ 40 characters.
- Body ≤ 1024 bytes and a `Content-Length` header (browsers always add one); otherwise 411/413.
- `Origin` must be `https://rusj.no` (403 otherwise).
- Answers: `204` (counted, or silently dropped names), `400` bad envelope, `403` wrong origin,
  `405` not POST, `411`/`413` size, `415` not text/plain, `429` brake, `503` database down.
  The client ignores every answer.
- The server adds 1 to `(today in Oslo, name)` for each **distinct** valid name. The client cannot
  choose the day or the amount.

Why `fetch(…, {keepalive:true})` and not `sendBeacon`: the site sets `referrer` to `no-referrer`,
and a beacon from such a page may arrive with `Origin: null`, which the Worker refuses.

## Names (the whole vocabulary)

| Name | Sent when |
|---|---|
| `side.<page>` | once per page load (and on back/forward restore). `<page>` = first path segment if it matches `^[a-z0-9]{2,24}$`, `forside` for `/`, else `annet`. Unknown ids are stored as `side.annet`. |
| `besok` | rusj comes on screen after ≥ 30 min without being on screen (a new visit) |
| `enhet.ny` / `enhet.igar` / `enhet.uke` / `enhet.lenge` | first time today on this device: never before / yesterday / 2–7 days ago / 8+ days ago |
| `unik.uke`, `unik.mnd` | with `enhet.*`, when the last visit was in another week (Mon–Sun) / month |
| `app` | with `enhet.*`, when `display-mode: standalone` (or iOS `navigator.standalone`) |
| `tid.1`, `tid.3`, `tid.10`, `tid.30` | the visit has now been on screen 1/3/10/30 minutes; each once per visit |
| `start.<game>`, `ferdig.<game>` | from `R.statistikk("start" \| "ferdig", …)`. **Only the event name** is used; the data object is never sent. Other events (`visning`, `runde`, `kveld` …) are not sent. |
| `daglig.<game>` | from `R.dagligFerdig`, the first time today's daily in that game is finished |
| `dagens.<n>` (1–9) | with `daglig.*`: this device has now finished n of today's dailies |
| `rekke.1/2/4/7/14/30` | with `dagens.1`: the site streak (DAGLIG.md rule) as a group: 1, 2–3, 4–6, 7–13, 14–29, 30+ |

`<game>` must be in `statistikk/src/spilliste.js` (generated from `rusj/spill/*/spill.json` by
`node statistikk/oppdater-spilliste.mjs`), else the name is dropped.

## Local state

One key, `rusj.stat` = `{ v:1, dag, sist, tid, trinn }`: last counted Oslo day number, last time on
screen (ms), screen time of the current visit (ms) and how many time steps were reported. It never
leaves the device. «Slett alt» on `/personvern/` removes it (it starts with `rusj.`). If it cannot
be written (private mode, full), only `side.*`, `start.*`, `ferdig.*` and `daglig.*` are sent.
`window.RUSJ_STAT_LAGRING = false` turns the key off entirely.

## Behaviour

- Batching: names are collected for 1.5 s, then one request; at `visibilitychange → hidden` and
  `pagehide` the queue is flushed at once (with the time step reached so far).
- Silent (no request, no storage, no timers) when `RUSJ_STAT` is not a valid origin,
  `navigator.doNotTrack === "1"` (or `window.doNotTrack`/`msDoNotTrack`),
  `navigator.globalPrivacyControl === true`, `navigator.connection.saveData === true`,
  `navigator.webdriver === true`, or inside a frame.
- Never blocks or throws into a game: one attempt per batch, errors swallowed, no retry, at most
  40 requests per page load. The service worker ignores it (POST, other origin).
- Time counts only while the page is visible; one check adds at most 60 s (a sleeping phone).

## Kit hooks (`rusj/kit/rusj.js`)

- `R.statistikk(h, data)` → `window.RusjStat.hendelse(h)` (inside try/catch).
- `R.dagligFerdig(info)` → on the first finish of the day for that game:
  `window.RusjStat.daglig(<games finished today>, <site streak>)`.
- The rules sheet line switches on `window.RUSJ_STAT`.

## Wording when switched on

- Footer: «Ingen konto. Ingen sporing. Ingen reklame. Det dere skriver inn, lagres bare i
  nettleseren på denne enheten. Vi teller bare anonymt hvor mange som er innom og hvilke spill som
  åpnes – uten informasjonskapsler og uten personopplysninger.»
- Rules sheet: «Det dere skriver inn, blir på denne mobilen. Ingen konto og ingen reklame. Vi teller
  bare anonymt hvor mange som spiller.»
- `/personvern/`: the intro adds «Vi teller bare anonymt hvor mange som bruker rusj, og hvilke spill
  som åpnes.»; the storage list adds the `rusj.stat` note; a new section «Anonym telling» says what
  is counted, what is not, where (Cloudflare, database in the EU, IP seen but not stored, logs off,
  deleted after 25 months) and how to opt out (Do Not Track / GPC / data saving); «Ingen sporing,
  statistikk eller måling» becomes «Ingen sporing av enkeltpersoner. Vi teller bare anonyme tall per
  dag». The exact text is in `PV_TELLING` and the template in `scripts/rusj.mjs`.
- Still to do by hand when switching on: `README.md` in the repo root says «ingen analyse,
  ingenting sendes noe sted» (developer README, not shown on the site).
