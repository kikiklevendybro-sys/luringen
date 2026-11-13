# rusj del 4 — every popular game that fits the platform (briefs)

Chosen 2026-11-13 from a gap check (Poki's popular list, NYT Games 2025 numbers, UK/Nordic card,
board and drinking-game sources). Platform: one device, offline, no accounts, no ads, no brand
names or look-alike trade dress, own graphics, no licensed content, no real-money gambling,
works from 320 px. Every new game ships in nb, en and da from day one.
Quality bar: the best existing games. Read rusj/KIT.md, rusj/SPRAK.md, rusj/SPILL3.md («Rules for
every builder») and two comparable games before building.

## Rules for every builder (in addition to SPILL3.md)

- Work alone (no sub-agents), in your own worktree; commit on your branch, one commit per game;
  never push or merge.
- Your own files: rusj/spill/<id>/ (spill.json with the i18n block, spill.js, spill.css,
  tekst.en.json, tekst.da.json, data/, data.en/, data.da/), test/<id>.test.mjs,
  test/spill/<id>.e2e.mjs. Side files maskot.js and seo.json (nb) as in SPILL3.md.
- Shared tables: only ADD keys (rusj/kit/tekst.en.json, rusj/kit/tekst.da.json, sticker texts,
  rusj/seo.en.json, rusj/seo.da.json). Never reformat, move or change existing keys.
  `node scripts/sprak.mjs` must be clean.
- Final names: a rusj-style Norwegian name (a character noun like the others), plus English and
  Danish names chosen for those cultures (rusj/SPRAK.md). No trademarks in names, aliases, text
  or `sok`. Ids: [a-z0-9], the Norwegian name.
- Computer opponents: 2–3 levels; a seeded RNG so unit tests are deterministic.
- Daily games follow rusj/DAGLIG.md; generators must give exactly one solution and be tested
  over at least a year of days.
- Tests: unit tests for rules/engine/opponent/generator; e2e at 390×844, 320×568, 844×390 and
  --probe, in nb, en and da (max two e2e processes at once). Look at the screenshots.
- Disk is limited: delete your screenshots and partial builds under build/ when you are done.
- spill.json gets `"alder": <number>`: the lowest recommended player age (reading, rules, content;
  the children's version where the game has one). The front-page finder uses it.
- Start by fast-forwarding your worktree to `sprak` (`git merge --ff-only sprak`).

## Wave 1 — the most played solo games

| # | id (working) | what | rekkefolge | tagger |
|---|---|---|---|---|
| 1 | kortkongen (existing) | new solitaires: Spider (1/2/4 suits), FreeCell, Pyramid, Tri-peaks, Golf | – | (existing) |
| 2 | (builder names it) | Mahjong solitaire: remove free matching tiles; own tile art; several layouts; deal only solvable layouts; hint, undo, daily board | 59 | alene, tenke, daglig, klassiker |
| 3a | (builder) | «Queens»-type: one piece per row, column and colour region, no two touching | 60 | alene, tenke, daglig |
| 3b | (builder) | Binary grid (Takuzu): two symbols, no three alike in a line, equal counts per row/column (optional «=»/«×» clues) | 61 | alene, tenke, daglig |
| 3c | (builder) | Path puzzle («Zip»-type): one line through every cell, passing the numbers in order | 62 | alene, tenke, daglig |
| 4a | (builder) | Theme word hunt («Strands»-type, daily) with a classic word-search mode | 63 | alene, ord, daglig |
| 4b | (builder) | Letter hive («Spelling Bee»-type, daily): words of 4+ letters from 7 letters, centre letter required | 64 | alene, ord, daglig |

Notes:
- 1: reuse Kortkongen's card engine, look and «Dagens kabal»; a record per variant; the
  existing Klondike saves, codes and daily deals must not change.
- 4b: ship precomputed daily puzzles with their answer lists (not a whole dictionary in the
  browser). Word lists: nb Norsk ordbank (check the licence at the source; credit it on the
  about page), en ENABLE (public domain), da only with a free licence (CC0/CC BY/public domain/
  MIT) — if none is found, publish 4b in nb and en only and say so. Filter out offensive words.

## Wave 2 — card and board classics against the phone

| job | games (rekkefolge) | tagger (suggested) |
|---|---|---|
| 5 | Idiot / Shithead / Palace (65), Golf card game (66, the classic 6- or 4-card grid game) | kort, klassiker, familie, fest |
| 6 | Rummy with 500 and Gin variants (67), Hearts (68) | kort, klassiker, familie |
| 7 | Backgammon (69), Ten thousand dice game (70), Dominoes (71) | klassiker, familie, tenke |
| 8 | Nine men's morris (72), Kalaha/mancala (73), Chinese checkers (74), Dots and boxes (75); Bonden gets a «five in a row» variant | klassiker, familie, tenke, barn |

Notes: play against the phone (2–3 levels) and pass-and-play where hidden hands allow it (a
hand screen between players, like Vri åtter). Reuse the card look and hand UI of Vri åtter and
Kortkongen. Each game gets its own rules screen and a record or «sist» line.

## Wave 3 — casual and children

| job | games (rekkefolge) | tagger (suggested) |
|---|---|---|
| 9 | Bubble shooter (76), Match-3 (77, no sweets theme) | alene, tenke, barn |
| 10 | Merge-the-fruit drop (78, own art, no copy of the known game), One-tap game (79, original character, no bird), Brick breaker (80) | alene, barn |
| 11 | Children's card games (81, one game with Old Maid without the caricature, Go Fish, War, Snap), Times tables and mental maths (82), Follow the pattern (83), Maze (84) | barn, familie, alene |
| 12 | Nonogram (85), Code breaker with colour pegs (86), 15-puzzle (87), «Which country?» daily (88, Natural Earth public-domain outlines, own flag SVGs), Domino logic daily (89, «Pips»-type, never that name) | alene, tenke, daglig |

Notes: arcade games must feel great with touch (no lag, 60 fps on a mid phone, pause on
visibility change) and work with keyboard; no ads, no lives to buy, no timers that push.
Children's games: no reading needed where possible, big targets, praise, no failure sounds.

## Wave 4 — party and 18+
13 18+: task deck with player names, Guess the card, Count to 21, Paranoia (responsible tone) ·
14 Hot seat, Emoji riddles, Fill in the blank (own content), Trick riddles · 15 Word grid hunt
(4×4), Anagrams, Amerikaner, Kasino · 16 Treasure hunt for kids' parties, Colouring.

## Left out on purpose
Falling blocks (Tetris trade dress), network/.io games, 3D runners and sports, poker/blackjack/
slots, physical games, branded games under their names, multi-device party games, CAH content,
dress-up, bridge, music quiz.
