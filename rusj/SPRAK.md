# Languages on rusj.no

Norwegian lives at the root (`rusj.no/`, `rusj.no/fireren/`) and does not change. Every other
edition lives in a folder of its own, built from the same code:

| Edition | Front page | A game | Pages about rusj | Locale | «Today» |
|---|---|---|---|---|---|
| Norsk (`nb`) | `/` | `/<id>/` | `/personvern/` `/om/` `/merker/` | nb-NO | Oslo |
| English (`en`) | `/en/` | `/en/<slug>/` | `/en/privacy/` `/en/about/` `/en/stickers/` | en-GB | London |
| Dansk (`da`) | `/da/` | `/da/<slug>/` | `/da/privatliv/` `/da/om/` `/da/klistermaerker/` | da-DK | Copenhagen |

A game is in an edition only when it has been converted (the recipe below) and the checker is
happy. Today: **Fireren** (English «Fourby», Danish «Fireren»). The front page of an edition lists
only its own games; the language switch under every page («Norsk · English · Dansk») goes to the
same page in the other edition, or to its front page when the game is not there yet.

## How it works

- **Text tables keyed by the Norwegian text** (gettext style). In a game: `R.t("Gjør klart")`. In
  Norwegian `R.t` returns the key, so the Norwegian site behaves exactly as before; elsewhere it
  looks the key up in the game's table (`rusj/spill/<id>/tekst.<lang>.json`), then in the shared one
  (`rusj/kit/tekst.<lang>.json`: the kit, the front page and the page templates), and falls back to
  the Norwegian text.
- **Variables:** `R.t("{navn} vinner!", { navn })`. Values go in as text – escaping stays your job,
  exactly as before: `esc(R.t("{navn} vinner!", { navn: R.navn(i) }))`.
- **Plurals:** a table value may be `{ "one": "{n} point", "other": "{n} points" }`; the form is chosen
  by `Intl.PluralRules` of the edition with `verdier.n`. When the Norwegian itself has two forms,
  write both in the key: `R.t("{n} runde|{n} runder", { n })`, or for «number + noun» use
  `R.flertall(n, "runde", "runder")` (table key `"runde|runder"`, value `{ "one": "round", "other": "rounds" }`).
  The `|` means «singular|plural» – never use it in any other key.
- **The key must be a literal in quotes** (`"…"`, `'…'` or a template without `${}`), so
  `scripts/sprak.mjs` can read it. `R.t(variable)` and `` R.t(`Runde ${n}`) `` are errors in a game.
  Data that is shown (level names, labels in a list) is wrapped where it is written:
  `const NIVA = { 1: R.t("Lett"), 2: R.t("Middels") }`.
- `R.t` works at load time too: the tables are on the page before `spill.js` runs. The build also
  runs `spill.js` in Node for the «Slik spiller dere» block with the same tables, so the rules under
  the page are translated with no extra work.
- **The kit knows the edition:** `R.sprak` (`"nb" | "en" | "da"`), `R.lokale`, `R.tidssone`,
  `R.forside` (`"/"`, `"/en/"` …), `R.tall`, `R.flertall`, `R.ramsOpp` («A, B og C» / «A, B and C»),
  `R.dag()` (the edition's day), `R.lagNavn(i)` («Lag Rosa» / «Team Pink» / «Hold Rosa»).
- **Separate per edition, automatically:** saved games, decks, records, dailies, the evening's
  scoreboard and the sticker book (`rusj.en.*`, `rusj.da.*`), and join codes (`R.kode` mixes the
  language into the salt, so a Norwegian code is not read as an English one). Names, sound and the
  18+ answer are shared (`rusj.felles`).
- **Mascots with words** (`rusj/kit/gjengen.js`, `ORD`): Ordugla's tiles (ORD / OWL / ORD), Blyanten's
  grid (ORD / ABC / ORD), Papegøyen's «JA» (YES / JA) and Bussen's «FEST» (PARTY / FEST).
- **The build** (`scripts/rusj.mjs`) writes per edition: front page, game pages, privacy/about/sticker
  pages, `manifest.webmanifest`, the offline page, `<html lang>`, `og:locale`, JSON-LD in the
  language, `hreflang` (nb, en, da, x-default → Norwegian) in `<head>` and in `sitemap.xml` – only
  between real equivalents. `spill.js` and `spill.css` are the same file for every edition. One
  service worker serves all; it fetches ahead only the editions a visitor actually uses.
- **Anonymous counting** (`rusj/kit/stat.js`): a page of another edition is counted under its game id (data-spill), the front page as «forside»
  (the first part of its address); «start» and «ferdig» carry the game id as before.
- **Only Norwegian for now:** collection pages (`rusj/samlinger`), alias addresses, Luringen, the
  examples in «Slik spiller dere» (they need translated data and titles), the share images (the build
  uses `rusj/bilder/deling.<lang>.png` and `deling-<id>.<lang>.png` when they exist, and no picture
  until then), the 404 page (it has the language switch).

## The checker

```bash
node scripts/sprak.mjs                     # every game, every edition
node scripts/sprak.mjs --spill fireren     # one game (also what is left to wrap, before it has i18n)
node scripts/sprak.mjs --sprak en --alle   # also unwrapped text in the kit, front page and templates
```

It reads every `R.t("…")` / `t("…")` / `N_("…")` / `R.flertall(n, "…", "…")` in the kit, the front
page scripts, the page templates and each game, and **fails** (the build stops too) when a published
game or the shared table misses a key, a table keeps a key nobody uses, a translation has a
`{placeholder}` the key lacks (or drops one), a plural form is unknown, or a key is not a literal.
In a game with `i18n` it also fails on **Norwegian-looking text that is not wrapped** (æøå, common
Norwegian words, or a capitalised UI word such as «Lukk» in a string or in an `aria-label`). When a
string really must stay (a class name, a key in your own data), put `// sprak-ok` on that line.
`console.*` and `throw new Error(…)` texts are ignored. The sticker texts in `rusj/merker.json` are
keys of the shared table, but only the stickers an edition's games can give are required.

## Recipe: convert one game

1. **Wrap every text in `spill.js`** in `R.t("…")` – screens, buttons, `aria-label`s, toasts,
   `R.si` lines, `R.bekreft` sheets, titles in `skjermer`, `regler` (intro, every step, every tip),
   the `merker` on the home screen. Run `node scripts/sprak.mjs --spill <id>` until it lists nothing.
   - Markup stays out of keys: `` `<p>${esc(R.t("Du har de rosa brikkene."))}</p>` ``. A sentence
     with markup inside: `esc(R.t("Trykk på {knapp}."))` then put the markup in `{knapp}` yourself.
   - Sentences built from pieces become one key with variables: `` `${navn} sin tur` `` →
     `R.t("{navn} sin tur", { navn })` (English needs «{navn}'s turn», Danish «{navn} er på»).
   - «Du»/«Mobilen» as a name in a sentence: English verbs agree («You win» / «The phone wins»), so
     give those cases their own keys (`R.t("Du vinner!")`, `R.t("Mobilen vinner!")`).
   - Plurals: `R.flertall(n, "runde", "runder")`, or `R.t("seier|seirer", { n })` beside markup.
   - Links to the front page: `href="${R.forside}"`, never `href="/"`.
   - Your own «today» (some daily games compute the Oslo date themselves): use `R.tidssone`
     instead of `"Europe/Oslo"`, or `R.dag()`.
   - The Norwegian output must stay **identical**: same words, same punctuation. Run the Norwegian
     e2e for the game before and after.
2. **Tables:** `rusj/spill/<id>/tekst.en.json` and `tekst.da.json`, keys exactly as in the code.
   Words the shared table already has (`Avslutt`, `Nytt spill`, `Alle spill`, `Slik spiller du` …)
   need no line of their own – leave them out, so every game says them the same way.
3. **Content:** if the game has `data/`, put the translated files in `data.en/` and `data.da/` with
   the same file names and the same structure. A missing file means the game is simply not published
   in that language (a warning, not an error). Rewrite, don't translate word for word: food,
   holidays, school, places and humour must fit the country (see «Culture»).
4. **spill.json:** add
   ```json
   "i18n": {
     "en": { "navn": "Fourby", "undertittel": "Four in a row", "kort": "…", "beskrivelse": "…", "slug": "fourby", "sok": ["four in a row", "…"] },
     "da": { "navn": "Fireren", "undertittel": "Fire på stribe", "kort": "…", "beskrivelse": "…", "slug": "fireren", "sok": ["fire på stribe", "…"] }
   }
   ```
   `slug` (a–z, digits, hyphen) is the address: `/en/fourby/`. A mascot may keep its name where it
   works in the language (Danish «Fireren») or get a new one (English «Fourby»). `tagger` may be
   given when the edition should file the game differently. `sok`: the words people type, brands
   allowed here only.
5. **SEO:** an entry in `rusj/seo.en.json` and `rusj/seo.da.json` under `spill.<id>` with `tittel`
   (search phrase first, at most 55 characters), `frase`, `beskrivelse` (100–160, unique) and
   `motMobilen` if it applies – the same rules as `rusj/seo.json`; never a brand in those three.
6. **Check and build:** `node scripts/sprak.mjs --spill <id>` (it must say «publiseres» for both),
   then `node scripts/bygg.mjs --ut build/web-navn --spill <id>`.
7. **e2e in the language:** `node test/rusj-e2e.mjs --web build/web-navn --bilder build/e2e-navn --sprak en <id>`
   (and `--sprak da`, and `--bredde 320 --hoyde 568`). It opens `/en/<slug>/`, runs the game's own
   `test/spill/<id>.e2e.mjs`, checks `<html lang>` and fails on Norwegian words left on any screen.
   Make the scenario language-neutral: check texts only when `t.norsk`, use `t.forside` for links
   and `t.nokkel("merker")` for storage keys (`t.tilstand()` already reads the edition's key).
   `--sprak en forside` checks the edition's front page. Look at the screenshots.
8. Run the Norwegian e2e for the game again, and `npm test`.

## Glossary (the kit's words – use them, so every game feels like one product)

| Norsk | English (British) | Dansk |
|---|---|---|
| Gjør klart (setup title) | Get ready | Gør klar |
| Start | Start | Start |
| Avslutt | Quit | Afslut |
| Spill videre | Keep playing | Spil videre |
| Fortsett | Continue | Fortsæt |
| Nytt spill | New game | Nyt spil |
| Spill igjen | Play again | Spil igen |
| Endre oppsett | Change settings | Ændr opsætning |
| Alle spill | All games | Alle spil |
| Angre | Undo | Fortryd |
| Kåringen (end screen) | The results | Kåringen |
| Pallen | The podium | Podiet |
| X vinner! | X wins! | X vinder! |
| Godt jobba! | Well done! | Godt klaret! |
| mobilen (the computer opponent) | the phone («You vs the phone») | mobilen («Dig mod mobilen») |
| Gi mobilen til | Pass the phone to | Giv mobilen til |
| Jeg er X | I'm X | Jeg er X |
| Hold fingeren på kortet for å se | Hold your finger on the card to see | Hold fingeren på kortet for at se |
| Lag Rosa / Gul / Blå / Grønn | Team Pink / Yellow / Blue / Green | Hold Rosa / Gul / Blå / Grøn |
| seier / seirer, uavgjort, tap | win / wins, draw, loss | sejr / sejre, uafgjort, nederlag |
| Kveldens gjeng | Tonight's crew | Aftenens bande |
| gjengen | the crew | banden |
| Dagens utfordringer | Today's challenges | Dagens udfordringer |
| Klistremerkeboka | The sticker book | Klistermærkebogen |
| Overrask meg | Surprise me | Overrask mig |
| Drikkespill (18+) | Drinking games (18+) | Drukspil (18+) |
| Drikk med vett | Drink sensibly | Drik med omtanke |
| 30 s | 30 s | 30 sek. |

The setup screen is «Get ready» / «Gør klar»; its main button «Start». The end screen is «The
results» / «Kåringen». «Avslutt» always opens the same sheet: «Quit» / «Keep playing».

## Culture

- **English is British English:** spelling (colour, centre, favourite, practise as a verb), words
  (mobile/phone, holiday, sweets, crisps, maths, football, queue, mum), dates «12 November 2026»,
  £ for money, 999 for emergencies. References: UK holidays (Bonfire Night, Boxing Day, pancake day),
  UK food and places. No US spelling, no Norwegian things left in («brunost», «17. mai») unless the
  game is about Norway.
- **Danish is rigsdansk:** natural Danish, not Norwegian with Danish spelling. Danish quotes
  »…«, «kr.», 112 for emergencies, Danish holidays (Fastelavn, Sankthans, juleaften with risalamande)
  and places. Watch the false friends: «rar» (nice), «frokost» (lunch), «grine» (laugh), «semester».
- **Never machine-literal.** Rewrite jokes, rhymes and wordplay so they work; keep the tone (warm,
  short sentences, never shaming). A native speaker reads everything before it is published.
- **No third-party brand names** in names, titles, descriptions or the visible page – only in `sok`.
- **18+ games:** the «Drikk med vett» lines are in the shared table. The RUSinfo line under a
  Norwegian drinking game is Norwegian only; an edition that publishes a drinking game needs its own
  public help line, chosen and checked by the owner first.
- **Privacy pages** say the same facts in every language: anonymous daily counts (Cloudflare, EU),
  GitHub Pages outside the EU/EEA, the delete button, contact rusj@odkdigital.no – never a postal address.

## The games still to convert (57 in `rusj/spill` + Luringen)

**A – the rules are language-free** (35–100 strings each; converting is wrapping + tables):
Tallknuseren, Sjakkhesten, Kortkongen, ~~Fireren~~ (done), Bonden, Minesveiperen, Dobleren, Slangen,
Admiralen, Terninga (Nordic Yatzy: fine for Danish; English players expect other scoring – a rule
variant), Brikka, Elefanten (picture labels), Skjæra (picture labels), Verktøykassa, Nissen (174 gift
ideas), Bingoballen (number bingo; the party themes are cultural content), Dam, Reversi, Vri åtter
(«Crazy Eights» in English, «Olsen» in Danish – check that the local rules match), Meyer (dice bluff – well known in Denmark; 18+ wording), Stigespillet, Blokka.

**B – card and prompt decks** (300–900 lines each; translate with rewriting, replace the «Norge» packs):
Sladrehanken, Pekefingeren, Våghalsen, Vinglepetter, Papegøyen, Løgnhalsen, Tankeleseren, Sauen,
Detektiven, Mimen, Kunstneren, Panna, Spionen, Varulven, Tørsten, Ringen, Pyramiden, Bussen, Hjulet,
Femmeren, Hatten.

**C – the language or the country is the game** (new word lists, facts and songs per country):
Ordugla, Blyanten, Ballongen, Skravla, Hviskeren, Kodeknekkeren, Bokstavtrollet, Bedreviteren,
Tidsmaskinen, Tieren, Nynneren, Firkløveren, Skrønemakeren, Julekalenderen, and Luringen (`src/`,
not on the kit; the 3 189-word bank).

## Word lists and their sources

Word lists are written for rusj and checked with scripts. An outside list may only be CC0, public
domain, CC BY or MIT, and is named here and in the data file's `om`.

- **Ordugla, English (Word Owl)** – the answers (`data.en/svar.json`) are our own. The accepted
  guesses (`data.en/gyldige.json`) start from the five-letter words of *Webster's Second
  International* (1934, public domain; the `/usr/share/dict/words` list on macOS and BSD) and regular
  inflections of its shorter words; a word stays only when the macOS British English spell checker
  (en_GB) accepts it. No rude words.
- **Ordugla, Danish (Orduglen)** – answers and guesses are our own words and their regular
  inflections (and the words in rusj's own Danish texts), kept only when the macOS Danish spell
  checker accepts them.
- The spell checkers only say yes or no to words we bring; nothing is copied out of them.
