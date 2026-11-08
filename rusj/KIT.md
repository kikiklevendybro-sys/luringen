# Building a game for rusj.no

rusj.no is a free Norwegian party-game site: a front page plus one static page per game.
No server, no accounts, no tracking, no dependencies. Every game shares one design system and
one runtime ("the kit") so the whole site feels like one product. Read this whole file before
writing code, then study the reference game `rusj/spill/pekefingeren/`.

## Files of a game

```
rusj/spill/<id>/spill.json      facts about the game (required)
rusj/spill/<id>/spill.js        the game (required) — a classic script, one Rusj.start({...}) call
rusj/spill/<id>/spill.css       game-specific styles (optional)
rusj/spill/<id>/data/*.json     content; every file becomes window.RUSJ_DATA.<filename>
test/spill/<id>.e2e.mjs         automated play-through (required)
```

`<id>` must match a mascot in `rusj/kit/gjengen.js` (they already exist for every planned game).

### spill.json

```json
{
  "id": "pekefingeren",
  "navn": "Pekefingeren",
  "undertittel": "Hvem er mest sannsynlig?",      // the well-known genre name people search for
  "beskrivelse": "…",                              // meta description, max ~160 chars, Norwegian
  "kort": "Les utsagnet, tell ned – og alle peker samtidig.",  // one line on the front page card
  "spillere": [3, 20],                             // min and max players
  "minutter": [5, 30],
  "mobiler": "en",                                 // "en" | "hver" | "begge"
  "tagger": ["fest", "familie", "sporsmal"],       // fest familie barn blof ord lag quiz tegning hukommelse sporsmal
  "rekkefolge": 4,                                 // position on the front page (given in your brief)
  "farge": "#ffd23f",                              // optional accent; default = the mascot's colour
  "ordbank": false,                                // true → window.RUSJ_ORD (3,189 Norwegian words) is loaded
  "qr": false                                      // true → window.LuringenQr is loaded (Rusj.kode.qr)
}
```

## Hard rules

- **Language:** all UI text and content in Norwegian bokmål, natural and warm, short sentences.
  Code, comments and identifiers follow the kit's style (Norwegian identifiers are fine, comments in English).
- **No dependencies, no network.** No fetch, no external URLs, no fonts/images from the internet.
  The page has a strict Content Security Policy: no inline `<script>`, no `onclick=` attributes,
  no `eval`/`new Function`. Inline `style="…"` attributes are allowed.
- **Escape everything a player typed** with `Rusj.esc()` before putting it in HTML. Content from your
  own data files must also go through `esc()` unless you deliberately insert markup.
- **Do not edit shared files:** `rusj/kit/*`, `rusj/portal/*`, `scripts/*`, `src/*` (Luringen),
  `test/chrome.mjs`, `test/rusj-e2e.mjs`, other games' folders. If the kit lacks something, build it
  inside your game and mention it in your report. Never run `scripts/lag-bilder.mjs`.
- **No real personal data:** no real people's names in content or tests (use "Testspiller A"…), no
  celebrities or politicians. Fictional characters, animals, things and places are fine.
- **Content safety:** family-friendly by default. A pack may be marked 18+ (party humour, flirting,
  alcohol mentioned) but never explicit sex, drugs, self-harm, hate, bullying of a specific person,
  dangerous dares or anything illegal. Dares must be safe to do in a living room.
- **Storage:** only through the kit (`localStorage` keys start with `rusj.`). No cookies.

## The kit in one page (`window.Rusj`, here `R`)

```js
const R = window.Rusj;
const D = window.RUSJ_DATA;          // your data/*.json, by file name
let H;                               // keep the actions in a variable so one can call another
R.start({
  id: "pekefingeren",
  versjon: 1,                        // bump if you change the saved state shape
  tilstand: () => ({ antall: 4, oppsett: {...}, spill: null }),   // default saved state
  lastet(S) { /* validate/migrate restored state; set S.spill = null if it doesn't fit */ },
  regler: { intro, steg: [[tittel, tekst], ...], tips: [...] },     // "?" button + rules sheet
  hemmelig: { innhold(S, id) { return { html, klasse } }, sett(S, id) {} },  // hold-to-reveal cards
  vedHash(S, hash) { return "skjermnavn" | null },                    // join links  …/<id>/#CODE
  vedSpillere(S) {},                 // after a player is added/removed in R.ui.spillere()
  felt: { navn(S, el, e) {} },       // <input data-felt="navn"> → called on every input
  skjema: { navn(S, form, e) {} },   // <form data-skjema="navn"> → called on submit
  skjermer: {
    hjem: { tilbake: "portal", vis: (S) => html },
    oppsett: { tittel: "Nytt spill", tilbake: "hjem", vis, etter(S, rot) {}, inn(S) {}, ut(S) {} },
    ...
  },
  handlinger: (H = { navn(el, e, S) {} }),   // <button data-h="navn" data-v="…">
});
```

- `S` is the whole saved state; it is written to localStorage after every screen change and every
  `R.vis()`. Keep it JSON-only. The state of the screen you are on is restored after a reload (if
  less than 3 hours old), so `vis(S)` must work from `S` alone.
- Screen options: `vis(S)` returns HTML (required); `tittel` (string or fn) is shown in the top bar;
  `tilbake` = "portal" | screen name | `async (S) => name | null` (null = stay);
  `inn(S)` runs once each time the screen is entered (also after a reload) — start timers here;
  `etter(S, rot)` runs after every render (bind canvas etc.); `ut(S)` when leaving;
  `gjenoppta: false` (never resume this screen) or `"hjem"` (resume to that screen instead).
- `R.gaTil("skjerm")` navigates (stops timers, closes sheets, focuses the h1, saves).
  `R.vis()` redraws the current screen in place (keeps scroll and focus) — call it after changing `S`.
- Every screen needs exactly one `<h1>` (it may be visually hidden with class `vh`).
- Built-in actions you can use in markup: `tilbake`, `lyd`, `regler`, `lukk-ark`,
  `spiller-legg-til`, `spiller-fjern`, `timer-veksle` (data-v = timer id), `timer-pluss` (data-v = id).

### Building blocks (return HTML strings; text params are escaped, `…Html` params are not)

| Helper | Use |
|---|---|
| `R.ui.spillhjem({ slagordHtml, knapperHtml, merker: [["3–20","spillere"]] })` | standard game home (mascot, name, genre label) |
| `R.ui.knapp(tekst, h, { v, variant, ikon, av, id })` | main 3D button; variants `rosa mynte lampe lilla himmel rod papir liten stor` |
| `R.ui.knapp2(tekst, h, o)` / `R.ui.lenke(tekst, h, o)` | secondary button / text link |
| `R.ui.dokk(...html)` | sticky action area under the thumb — the main action of a screen goes here |
| `R.ui.lenkerad(...html)` | row of text links |
| `R.ui.seg(h, [[v, tekst]], aktiv)` | segmented choice |
| `R.ui.teller(h, verdi, min, max, { enhet })` | − / + stepper (data-v "-1"/"1") |
| `R.ui.fliser(h, [{ v, tittel, tekst, ikon }], aktiv \| [aktive])` | big choice tiles |
| `R.ui.brikker(h, [{ v, tekst, ikon, antall }], valgt[], { alle: true })` | multi-select chips |
| `R.ui.bryter(h, pa, tittel, tekst)` | on/off switch |
| `R.ui.spillere({ min, max, tittel, hjelp })` | player names editor; count lives in `S.antall`; names are shared by all games (`R.navn(i)`) |
| `R.ui.velgere(h, [indekser], valgt, { av })` | pick a player (avatar + name) |
| `R.ui.giTil({ i, h, tekst, knapp, prikker: [antall, na] })` | "Gi mobilen til …" screen for pass-the-phone |
| `R.ui.fremdrift(antall, na)` | progress dots |
| `R.ui.mappe({ id, etikett, tekst })` | hold-to-reveal secret card; back filled by `hemmelig.innhold` |
| `R.ui.storkort({ tekst \| tekstHtml, etikett, nr, fot, klasse, sveip, kompakt })` | big paper card for decks; `sveip: "handling"` makes it swipeable |
| `R.ui.timer({ id, sekunder, stor, kontrollHtml })` + `new R.Timer({ id, sekunder, vedSlutt, vedTikk }).start()` | countdown ring |
| `R.ui.poengliste([{ i \| lag \| navn, poeng, pluss }])`, `R.ui.pall(rader)` | scoreboard, podium |
| `R.ui.lagmerke(i)` | team badge (`R.LAG` = Rosa, Gul, Blå, Grønn) |
| `R.figur(id?)` | a mascot (default: this game's) in a `.figur-ramme` |
| `R.avatar(i, "mid" \| "stor" \| "gigant")` | player avatar |

Other helpers: `R.esc`, `R.navn(i)`, `R.rng(seed)`, `R.nyttFro()`, `R.stokk(liste, rng)`,
`R.velg(liste)`, `R.heltall(a, b)`, `R.hash(tekst)`, `R.normaliser(tekst)` (compare typed answers),
`R.kortstokk(navn, antall).neste(filter)` (deck that doesn't repeat cards across sessions),
`R.kode.lag(verdier, bredder, salt)` / `R.kode.les(tekst, bredder, salt)` / `R.kode.formater` /
`R.kode.lenke(kode)` / `R.kode.qr(tekst)` (join codes for "each on their own phone"),
`R.lyd.{klikk pop snu sveip tikk takk pek riktig feil pling trommevirvel fanfare buu latter alarm bom hjerteslag}`,
`R.vibrer(ms)`, `R.holdVaken()` / `R.slippVaken()` (keep the screen on during play),
`R.konfetti()`, `R.toast(tekst)`, `R.si(tekst)` (screen-reader announcement),
`await R.bekreft(tittel, tekst, ja, nei)`, `await R.velgIArk(tittel, [{ v, tekst }])`, `R.ark(html)`,
`await R.nedtelling(["3","2","1","KJØR!"])`, `await R.kastKort(-1)` (fly the big card out),
`R.del(tittel, tekst, url)` (share sheet), `R.kopier(tekst)`, `R.vedForlat(fn)` (cleanup on leave).

CSS: use the kit classes (`.seksjon`, `.seksjon-hode`, `.ingress`, `.etikett`, `.hjelp`, `.boks`,
`.papirboks`, `.stabel`, `.rad`, `.banner`, `.stempel`, `.risting`, `.kort-ord`, `.knapprad`…) and
tokens (`--aksent`, `--aksent-dyp`, `--natt*`, `--papir`, `--blekk`, `--rosa`, `--mynte`, `--lampe`,
`--lilla`, `--himmel`, `--rod`, `--oransje`, `--tekst*`, `--r-stor/mid/liten`, `--font-display`).
Put anything new in your `spill.css`, prefixed so it can't clash (e.g. `.vingle-…`).

## Quality bar ("state of the art")

1. **Instantly playable.** From the home screen to the first fun moment in under 20 seconds.
   Good defaults everywhere; setup is one short screen; never more than one decision per screen
   while playing. The big main action is always in the dock under the thumb.
2. **Obvious at a glance.** A person who has never played understands what to do from the
   screen alone. Use the rules sheet (3 steps + tips) for the details, not walls of text in the game.
3. **Feels alive.** Sounds and haptics on key moments, a countdown before the action, a satisfying
   reveal, confetti + fanfare for winners, playful copy in Norwegian. Respect reduced motion (the kit does).
4. **Party-proof.** Survives a reload mid-game (state in `S`), "Fortsett" on the home screen,
   back button never loses the game, no dead ends, works offline, works with 2 and 20 players
   where the rules allow, long names don't break the layout, nothing overflows at 320 px width.
5. **Fair and private.** Secret information is only shown behind a deliberate action (hold-to-reveal
   or a "Jeg er X" gate) and hidden again. Randomness is real (`R.nyttFro`, `R.stokk`).
6. **Accessible.** Real buttons, labels on icon buttons, `aria-pressed` on toggles, readable contrast,
   nothing that only works with a swipe or tilt (always a button alternative).
7. **Plenty of content.** The amounts in your brief are minimums. Every item is good — no filler, no
   repeats, correct Norwegian spelling, varied and genuinely funny/interesting.

## Build, test, look

Use your own output folders so parallel work doesn't collide (replace `navn` with your agent name):

```bash
node scripts/bygg.mjs --ut build/web-navn --spill id1,id2
node test/rusj-e2e.mjs --web build/web-navn --bilder build/e2e-navn id1 id2
```

The e2e runner loads each game on a 390×844 phone, checks the basics (h1, rules, no errors, no
sideways scrolling, buttons have labels) and runs `test/spill/<id>.e2e.mjs`, which must play a full
game: setup → play several rounds → result, including edge cases (reload mid-game, back + continue).
See `test/spill/pekefingeren.e2e.mjs` and the helper list in `test/chrome.mjs`
(`t.start({ navn })`, `t.klikk`, `t.trykk`, `t.hold`, `t.sveip`, `t.skrivInn`, `t.vent`, `t.tekst`,
`t.antall`, `t.finnes`, `t.tilstand()`, `t.bilde(navn, helside)`, `t.sjekk(ok, melding)`, `t.lastSide`).

**Look at every screenshot** (open the PNGs) and fix anything that looks unpolished, cramped,
misaligned, confusing or ugly. Iterate until it is genuinely great. Then run the tests again.
