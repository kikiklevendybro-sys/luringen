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

## Shared wording (use exactly these, so all games feel like one product)

- Ending a game early: **«Avslutt»**; resuming: **«Fortsett»**. Don't say «forsiden» about the game's own
  start screen (on rusj.no «forsiden» means rusj.no) — say **«Til [spillnavn]»** if you need that link.
- Praise: **«Godt jobba!»**. Winner line: **«X vinner!»**; shared win: «A, B og C vinner!» — list names as
  «A, B og C» (comma-separated, «og» before the last), never «A og B og C».
- **fingrer** (not «fingre»), **Hurtigruta**, **spagetti**, **T-skjorte**, **matpakka**, **sto** (not «stod»),
  **verdensrommet** (not «rommet» for space), «faktabit» (one word), «festpakken» (one word).
- Also: **fram** (not «frem»), **grøt**, **sjiraff**, **disko**, **flygende**, **topphemmelig**, **natta**,
  seconds as **«30 s»**. The final screen of every game is called **«Kåringen»**. The setup screen's main
  button is **«Start»**. Hold-to-reveal instruction: **«Hold fingeren på kortet for å se»**.
- Saying no is always fine: never shame a player for skipping (no booing, no «feig» for children).
- The confirm sheet for «Avslutt» has the buttons «Avslutt» and **«Spill videre»**. The computer
  opponent is **«mobilen»** («Du mot mobilen»). The setup screen is titled **«Gjør klart»**. Level names
  are lower case mid-sentence («rekord på middels»); plural **«seirer»**. Solo puzzles may give their
  result screen its own title (e.g. «Ordugla nr. 12») instead of «Kåringen».
- **ferje** (not «ferge»). Teams are always called **«Lag Rosa», «Lag Gul», «Lag Blå», «Lag Grønn»**
  (capital L, also mid-sentence), as `R.ui.lagmerke` and `R.ui.poengliste` write them.
- Numbers with nouns: `R.flertall(n, "sekund", "sekunder")` → «1 sekund» / «2 sekunder» (never «1 sekunder»);
  name lists: `R.ramsOpp(["A", "B", "C"])` → «A, B og C» (escape the result before inserting it in HTML).
- Don't use «de/dem/deres» about one person; rewrite with «man/en/seg» or rephrase.
- Pack names, icons and descriptions: Familie 🏡 «For alle aldre» · Barn 🧸 «For de minste» ·
  Venner 😎 «Hverdagsgøy» · Mat 🍕 · Reise ✈️ · Skole og jobb 💼 · Pinlig 🙈 · Kaos 🌪️ ·
  Fest 🎉 «Litt mer på kanten (18+)» (off by default when children may be playing).

## Shared screen patterns

- **Home screen:** use `R.ui.startKnapper({ pagar, fortsettTekst })`. While a game is running,
  «Fortsett …» is the big main button and «Nytt spill» is secondary; the «nytt» handler must call
  `await R.bekreftNytt(pagar)` before throwing a running game away (`R.bekreftNytt(pagar, true)` when one
  person plays alone — then the sheet says «du»; one-player games get that automatically).
- **Modes:** a choice of mode is the FIRST section of the setup screen, as big tiles (`R.ui.fliser`),
  and is never asked twice. Exception: a game with exactly two modes and no other settings may show
  the two modes as the two main buttons on the home screen.
- **Giving points:** every tap that gives or takes points must be undoable («Angre») until the next action.
- **End screen:** winner banner (+ `R.ui.pall` and `R.ui.poengliste` when there are points), then
  `R.ui.flereSpill({ antall })` ("Spill noe annet med samme gjeng"; with `antall: 1` "Flere spill du kan spille
  alene" — don't pass your own `tittel`). Dock: «Spill igjen» (same setup) as the
  main button; links «Endre oppsett» and «Alle spill» (`<a class="lenke" href="/">Alle spill</a>`).
- **Celebrate in proportion:** fanfare + confetti for a real win or a great result; a gentle sound and
  warm words for a weak solo result.
- **Ending early:** the link is always just «Avslutt» (a `R.bekreft` sheet explains what happens).
- **In progress:** pass `pagar: (S) => …` to `Rusj.start` (true while a game is running, false on the end
  screen). The front page's «Fortsett» badge and the kit's screen wake lock use it.
- **After every `await`** in an action, check `R.vakt()` (and `if (!(await R.nedtelling(…))) return;`).
- The kit ignores ghost taps (a real tap within 350 ms after a screen change, or after a redraw when
  it's a different action in the same spot) — games don't need their own guard for that. On-screen keyboards: give
  every key the same `data-h` (e.g. `data-h="tast" data-v="a"`), or fast typing after a redraw is dropped.
- **Short screens:** what the screen is about must be visible above the dock at 375×560; shrink
  boards, clocks and mascots under `@media (max-height: 700px)`.
- **Landscape phones:** a phone on its side (844×390, 780×360) gets two columns from the kit — content
  on the left, the dock as a column on the right. Nothing may hide behind the dock there either; see
  «Landscape phones» below and test with `--bredde 844 --hoyde 390`.

## Newer kit features (use them)

- `R.dag()` → `{ tekst, nr }`: today in Oslo time, the same on every phone (daily puzzles).
- `R.statistikk("start" | "ferdig" | …, { tall/ja-nei/korte id-er })`: anonymous usage events —
  never names or typed text. Call "start" when a game/round starts and "ferdig" when it ends.
- `R.kveld.registrer(rader)`: on every end screen with scores (same rows as `R.ui.poengliste`) →
  «Kveldens gjeng», the evening's scoreboard across all games on the front page.
- spill.json: `"alder18": true` (the kit shows an 18+ gate first), `"sok": ["…"]` (extra words for the
  front-page search: Norwegian genre names, common names of the genre).
- `R.visInstallTips()`: the kit shows the "install as app" tip itself after a finished game.
- `R.dagligFerdig({ vunnet, rekke })`: daily puzzles call it when today's puzzle is done — the front page
  then shows «✓ i dag» and the streak on the game's card.
- **Mascot moods:** `R.ui.figur(id?, { stemning: "jubel" | "lei" })` — «jubel» hops and sparkles (a win, a
  great result), «lei» droops, tilts and loses colour (a loss, a weak result). No face is redrawn: the
  classes `jubel` / `lei` work on any `.figur-ramme`, so `R.figur(null, "jubel")` in an existing banner is
  enough. With reduced motion the pose stays and nothing moves.
  `R.ui.banner({ tittel | tittelHtml, etikett, tekst | tekstHtml, klasse, stemning })` is the result banner
  (`.banner` with mascot, label, `<h1>` and one line): the mascot celebrates unless you pass
  `stemning: "lei"` or `""` — celebrate in proportion.
- **Results on short screens:** `.banner` gets a smaller mascot at ≤ 700 px height (and in landscape), so
  the podium or the score shows at first view; `R.ui.pall` centres itself when only two have points;
  sheets (`R.ark`, rules, confirm) fade at the top edge while their content scrolls. Nothing to do in the game.
- `R.kutt(tekst, n)`: the first n characters and never half of one (an emoji is one character) — use it
  instead of `slice` on text a player typed. The kit cuts player names with it.
- `R.kveld.registrer`: a game where nobody scored still counts for the evening, but gives nobody points.
- **Safety net:** if a saved game can't be drawn at all (also not the home screen), the kit drops that
  game's saved state and starts fresh with a toast. Still validate in `lastet(S)` — and bump `versjon`
  when the shape of `S` changes.

## Accessibility the kit does for you (and how not to undo it)

- **Secret card (`R.ui.mappe`):** a finger holds it, as before. A keyboard, a screen reader's
  double tap, a switch or voice control shows it with **one press** and hides it with the next (no
  timing); Escape, leaving it with Tab, or a press elsewhere also hide it. The back is
  `aria-hidden` and never part of the button's name: while it shows, its text is a line in `#si`
  (only the player's own screen reader reads it) and that line is removed when it hides.
  `hemmelig.sett` is called on hide either way. Rules: never put the secret in `etikettAria`;
  if the back's text reads badly (icons, stars), return `si: "plain sentence"` from
  `hemmelig.innhold` next to `html`. Don't build your own peek button — use the card.
- **One voice (`R.si`):** `#si` is the only polite live region. `R.si(tekst)` queues a line (two
  calls in a row are both spoken). Status lines inside the screen (`aria-live="polite"`,
  `role="status"`, `<output>`, or mark one with `data-si`) are switched off by the kit and read out
  through `#si` **when their text changes** — a redraw no longer makes them silent or double. Don't
  call `R.si` with the same text as your status line; do call it for news that has no line on screen.
  Toasts are read out too, and stay 2.2–8 s depending on length.
- **Focus survives redraws:** after `R.vis`, the countdown, a closed sheet or any change of
  `#skjerm`, focus goes back to the same control, else to the element with `data-fokus` (mark the
  natural next control, e.g. the cell just played), else to one of the same kind, else to the h1.
- **Dock:** `--dokk-h` + `scroll-padding-bottom` keep the focused control clear of the dock.
- **Focus ring:** two tones (accent ring + ink band). On a light board of your own set
  `--fokus: var(--blekk); --fokus-2: transparent;` — the kit also swaps the ring to ink/cream by
  itself where the accent would be under 3:1.
- **Contrast:** `--tekst-3`, `--rosa`, `--mynte`, `--lampe` are for the dark page only. On paper use
  `--blekk`, `--blekk-2`, `--rosa-dyp`, `--rod-dyp`, `#0f6e54` (green), `#1f66a8` (blue); on tinted or
  lit surfaces use `--tekst-2`. Stamps on paper switch to the deep colours by themselves.
- Sheets and the countdown make `.app` inert. A failed save gives one calm toast. An exception after
  the first screen gives a sheet with «Prøv videre» / «Start spillet på nytt».
- Check it: `node test/rusj-e2e.mjs … --a11y build/a11y-navn id` then
  `node test/a11y/sammendrag.mjs build/a11y-navn` (findings and key numbers; never fails a run).

## Landscape phones

On a phone on its side — `@media (orientation: landscape) and (max-height: 500px)`, e.g. 844×390 and
780×360 — the kit lays every screen out by itself and writes how on `<html data-liggende="…">`
(`R.liggende()` returns the same value, `""` in portrait):

| Value | When | Layout |
|---|---|---|
| `side` | the screen has a dock made of the kit's own buttons, links and rows (`.knapp`, `.knapp-2`, `.lenke`, `.lenkerad`, `.knapprad`, lines of text) | content in a left column; the dock is a column on the right: fixed, centred, clear of the notch, scrolls by itself if it must |
| `bunn` | the dock has the game's own things in it (a toolbar, a keyboard, more than 8 buttons), or there are several docks | one centred column as in portrait; the dock stays at the bottom, slimmer |
| `hjem` | the home screen (`R.ui.spillhjem`, no dock) | mascot on the left; name, slogan and buttons on the right |
| `uten` | no dock | one centred column as in portrait |
| (none) | portrait, or a screen the game lays out itself | nothing but the slimmer top bar |

Everywhere in landscape the top bar is slimmer and screens fade in without the slide; on the kit's own
layouts headings, hold-cards (`.mappe`: mascot beside the finger), big cards and piles, timers, avatars,
banners and the podium are sized to fit 390 and 360 px of height, and sheets are wider and lower.

- **The side layout** gives the content about 500×330 px. It scrolls with the page; the dock does not.
  The screen is still a flex column, so let the main thing take the height (`flex: 1`) instead of a fixed
  height, and never rely on `dokk.offsetHeight` being room taken *under* the content — if you size a board
  in JS, ask `R.liggende() === "side"`.
- **Your own landscape layout** for a screen: write it in your `spill.css` under the same media query and
  take the dock out of the kit's hands — in your grid, `.skjerm-spill > .dokk { position: static; margin: 0;
  padding: 0; background: none; }`. The kit sees that the dock is no longer its own sticky one and leaves
  that whole screen alone (also the width of `.app`, which is yours to set).
  Or say it in code, on a screen (`skjermer.spill.liggende`) or for the whole game (`R.start({ liggende })`;
  the screen's value wins): `false` = hands off; `true` = the side column also for docks with your own
  buttons in them (up to 8 — look at them at 844×390 first); `"side"` / `"bunn"` forces one of the two.
- **Adjusting the kit's layout:** the kit's landscape rules are no more specific than the portrait rules
  they adjust (`html[data-liggende]` sits inside `:where()`), so whatever your CSS overrides in portrait it
  overrides there too. To change something only in one layout, write
  `html[data-liggende="side"] .mitt-brett { … }` under the media query.
- **Tests:** «is it behind the dock?» must compare rectangles — in the side layout the dock is *beside*
  the content, so `el.bottom <= dokk.top` is wrong there. Use `await t.friForDokk(".mitt-brett")`.

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
  `gjenoppta: false` (never resume this screen) or `"hjem"` (always resume to that screen instead —
  use this for screens that show a secret).
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
| `R.ui.figur(id?, { stemning })` | the mascot with a mood: `"jubel"` (a win) or `"lei"` (a loss) |
| `R.ui.banner({ tittel, etikett, tekst, klasse, stemning })` | result banner: mascot (celebrating by default), label, `<h1>`, one line |
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
`R.del(tittel, tekst, url)` (share sheet; without one it copies text + link), `R.kopier(tekst)`, `R.vedForlat(fn)` (cleanup on leave).

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
`t.antall`, `t.finnes`, `t.tilstand()`, `t.bilde(navn, helside)`, `t.sjekk(ok, melding)`, `t.lastSide`,
`t.friForDokk(sel)` — is the element clear of the dock, in portrait and on a landscape phone).
Run it on a phone on its side too: `--bredde 844 --hoyde 390` (and `--bredde 320 --hoyde 568` for the smallest).

**Look at every screenshot** (open the PNGs) and fix anything that looks unpolished, cramped,
misaligned, confusing or ugly. Iterate until it is genuinely great. Then run the tests again.
