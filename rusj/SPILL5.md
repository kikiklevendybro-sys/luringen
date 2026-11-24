# rusj del 5 — twenty new games (briefs)

Chosen 2026-11-24 from the report «Nye spill og funksjoner for rusj» (reports/, research notes in
research_notes/): mechanics the collection lacks, picked so no new game is a twin of an existing one.
Platform as before: no accounts, no ads, no brand names or look-alike trade dress, own graphics, no
licensed content, nothing that looks like gambling (no chips, stakes, odds or casino look), works from
320 px, nb + en + da from day one. Quality bar: the best existing games.

## Rules for every builder

Everything in «Rules for every builder» in rusj/SPILL3.md and rusj/SPILL4.md applies (own folder only,
`maskot.js` and `seo.json` next to the game, shared tables only ADD keys, `node scripts/sprak.mjs`
clean, tests and e2e in three sizes and three languages, look at the screenshots). In addition:

- Work alone (no sub-agents) in your own worktree; first `git merge --ff-only sprak`; one commit per
  game on your branch; never push, merge, deploy or touch main/sprak.
- Names are given below (Norwegian); choose the English and Danish names for those cultures
  (rusj/SPRAK.md). `undertittel` is the plain genre name people know. Brand names never in names,
  aliases or text – only in `sok` (the build enforces it).
- `spill.json`: `"alder"`, `"minutter"`, `"mobiler"` ("en" | "hver" | "begge"), `rekkefolge` as given.
- The home screen must fit 390 × 664 with all its buttons and the fact chips (check it in the e2e, as
  test/spill/tankeleseren.e2e.mjs does) – an online game has three buttons there.
- Run the e2e against a build of YOUR tree: `node scripts/bygg.mjs --ut <your dir>` and
  `node test/rusj-e2e.mjs --web <your dir> <id>` (without `--web` the test uses dist/web, which may be
  stale).
- Games marked «nett»: playable with a phone each through the room service from day one. Read
  nett/KLIENT.md and rusj/kit/nett.js; references: rusj/spill/tieren (secret simultaneous choices),
  rusj/spill/meyer (hidden dice on one phone), rusj/spill/brevduen and rusj/spill/sauen (typed answers).
  - `"nett": true`, a line in `SPILL` (nett/src/oppsett.js) and, with three or more seats, in `FORTSETT`
    with `borte(S, sete, okt)`: a seat that leaves is skipped and never waited for; the match ends
    cleanly below the game's minimum.
  - Deterministic from the room seed and the move list (`okt.rng`, `R.nett.tilfeldig`); every move
    validated in `trekk()` and an illegal one ignored the same way on every phone; round tags on moves so
    a stale or double tap counts once.
  - A vote, choice or answer that points at a seat that has since left does not count.
  - Each phone shows only its own secret (`R.nett.meg()`); seed-derived secrets are «friends level»
    (say so in a comment).
  - Typed text: `R.nett.tekst(s)` (at most 60 characters) before sending and again in `trekk()`;
    `maxlength` on the field; other players' text only through `esc()`/`textContent`; the XSS test from
    test/nett-fritekst.mjs; comparisons normalised the same way on every phone.
  - Tests: `test/nett/<id>.mjs` (a whole match with three or more phones, a reconnect, «Ny kamp», one
    phone leaving mid-match, secrets not in the other phones' DOM) in nb and en, and two or more unit
    tests in test/nett.test.mjs with `rom()`. `npm test` in the root and in nett/.
  - Never send moves on a timer or in a loop (20 messages per 10 s per phone).
- Report in Norwegian bokmål, plain words: per game what it is, how it is played on one phone and on
  the net, exact test result lines, anything not done or uncertain, changed shared files, your branch
  and last commit.

## Wave 1 — before Christmas

| id | navn | undertittel | spillere | rekkefolge | tagger | mobiler | what |
|---|---|---|---|---|---|---|---|
| pakketyven | Pakketyven | Pakkeleken | 4–20 | 111 | fest, familie, barn | en | The Nordic parcel game: real wrapped parcels on the table, the phone in the middle is the dice and a hidden countdown. Phase 1: pass the phone, roll; a six takes a parcel from the pile (other throws can have a small house rule: 1 = swap seats is NOT wanted – keep it to sixes, with optional «enere gir bort»). When the pile is empty, phase 2: a hidden clock of 3–7 minutes (nobody sees how long) – a six now steals a parcel from another player. The phone keeps who has how many (names from «Kveldens gjeng»), shows whose turn it is, and ends with a horn. Fast: one tap to roll, the next player's name at once. No points in «Kveldens gjeng». |
| gradigper | Grådigper | Ett kort til? | 2–8 | 112 | fest, familie, kort | begge, nett | Push your luck with our own number cards (0–12, as many of each as its number, plus a few bonus cards of our own design): on your turn «ett til» or «stopp»; a number you already have in front of you and the round's points are gone; seven different numbers ends the round with a bonus. First to 200. Turn by turn on one phone, or a phone each on the net. No casino look: friendly cards, own back. |
| flinkisen | Flinkisen | Kategorier på bokstav | 2–10 | 113 | fest, familie, ord | begge, nett | A letter is drawn, five or six categories (from packs: classic «navn, by, land, dyr, mat», children, party, Christmas), everyone writes one answer per category at the same time; the first to finish can press «Stopp» and the others get ten seconds. Then category by category: every answer is shown, the group marks answers that do not count (majority of the others), unique valid answers 10 points, shared 5. On the net: a phone each (typed text, see the rules above; one move per player per round carrying all answers, each at most 30 characters). On one phone: the phone draws the letter and keeps time and points while people write on paper. |
| lurendreieren | Lurendreieren | Løgnerterning | 2–8 | 114 | fest, blof, klassiker | hver, nett | Liar's dice with bids: everyone has five hidden dice on their own phone (R.terninger for the look). In turn: bid «at least N dice showing X» higher than the last bid, or call «løgn». All dice are shown; the bidder or the caller loses a die; without dice you are out; the last one with dice wins. Ones are wild (option). On the net with a phone each; also «send mobilen rundt» for one phone (hold to peek at your own dice) so it can be played without the net. Related to Meyer in the collection – make the bidding and the reveal feel different. |

## Later waves (briefs follow)

- Cards and bluff: President/Boms (climbing game) · exact-bid trick game (Oh Hell type) · the card
  game Cheat («Bløff») · bluff bids with hidden discs.
- Write, draw and vote: drawing bluff · caption duel (own pictures with the rusj characters) ·
  number quiz «who is closest?» · blind ranking.
- Co-operation and boards: silent number line · sort us by our own numbers · colour clue ·
  the Viking board game (hnefatafl).
- Alone and for two: cryptogram (daily) · duels for two on a split screen · word-board duel ·
  closest in meaning (daily). The last two need language data: check the licence first.
