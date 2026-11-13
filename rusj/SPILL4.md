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
5 Idiot (Shithead/Palace) + Golf card game · 6 Rummy (500/Gin) + Hearts · 7 Backgammon +
Ten thousand (dice) · 8 Nine men's morris, Kalaha, Chinese checkers, Dots and boxes, Dominoes;
Bonden gets a «five in a row» variant.

## Wave 3 — casual and children
9 Bubble shooter + Match-3 (no sweets theme) · 10 Merge-the-fruit drop, one-tap game, Brick
breaker · 11 children's card games (Old Maid without the traditional caricature, Go Fish, War,
Snap), times tables and mental maths, Follow the pattern, Maze · 12 Nonogram, Code breaker
(colour pegs), 15-puzzle, «Which country?» (outline/flag daily; Natural Earth data),
Domino logic («Pips»-type).

## Wave 4 — party and 18+
13 18+: task deck with player names, Guess the card, Count to 21, Paranoia (responsible tone) ·
14 Hot seat, Emoji riddles, Fill in the blank (own content), Trick riddles · 15 Word grid hunt
(4×4), Anagrams, Amerikaner, Kasino · 16 Treasure hunt for kids' parties, Colouring.

## Left out on purpose
Falling blocks (Tetris trade dress), network/.io games, 3D runners and sports, poker/blackjack/
slots, physical games, branded games under their names, multi-device party games, CAH content,
dress-up, bridge, music quiz.
