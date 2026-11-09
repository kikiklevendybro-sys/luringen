# The rusj games, part 2 — design briefs

Same rules as rusj/SPILL.md and rusj/KIT.md: original designs in well-known genres, our own names,
texts and art, simpler and better than the apps people know. `rekkefolge` = position in its category.
`tagger` decide the front-page categories (fest familie barn blof ord lag quiz tegning hukommelse
sporsmal klassiker daglig tenke alene kort verktoy drikke). `sok` = extra search words people type
(Norwegian genre names, common English names of the genre — never invented brand claims).
A placeholder mascot already exists for every id below; a separate agent draws the real ones.

New kit features you should use (see rusj/kit/rusj.js):
- `R.dag()` → `{ tekst: "2026-11-10", nr }` — the same "today" (Oslo time) on every phone, for daily puzzles.
- `R.statistikk("start", { modus: "lag" })` when a game/round starts and `R.statistikk("ferdig", { … })`
  when it ends — numbers, booleans and short ids only, never names or typed text.
- `R.kveld.registrer(rader)` on every end screen with points/places (same rows as R.ui.poengliste) —
  feeds «Kveldens gjeng», the evening's scoreboard across games. Solo games: `{ solo: true }` not needed.
- spill.json `"alder18": true` puts the kit's 18+ gate (with drink-responsibly notes) in front of the game.

---

## Puzzles, classics and daily games

### ordugla — Ordugla · «Dagens ord» · 1 player · tagger daglig ord alene tenke · rekkefolge 22
Guess today's five-letter Norwegian word in six tries (green = right place, yellow = in the word,
grey = not in it). Same word for everyone each day (`R.dag()`), a big on-screen keyboard with æ ø å
coloured by what you know, invalid words shake ("Ikke i ordlista"), results shareable as coloured
squares with «rusj.no/ordugla» (no spoilers), streak + statistics (wins per number of tries) saved
locally, countdown to tomorrow's word, plus an unlimited practice mode. Dark/colour-blind friendly
colours. Word lists: ≥ 1 500 common answer words (no inflected forms as answers, no proper nouns,
nothing offensive) and ≥ 8 000 allowed guesses — validate with the macOS Norwegian spell checker
(NSSpellChecker, language "nb") via a small Swift script, and keep the lists in data/.
sok: ["dagens ord", "ordspill", "fem bokstaver", "wordle"].

### blyanten — Blyanten · «Minikryss» · 1 player · tagger daglig ord alene tenke · rekkefolge 23
Small crosswords made for a phone: a generator lays 6–10 words from a theme into a crossing grid
(free-form, every word crosses another), numbers the clues, and the player types into the grid with
an on-screen keyboard (tap a clue to jump, tap a cell twice to switch across/down). «Dagens kryss»
(same for everyone via `R.dag()`) + unlimited puzzles by theme and difficulty, hints (reveal letter /
check word), timer, celebration. Content: ≥ 30 themes × ≥ 25 words, each with a short, fair, correct
clue in Norwegian (no proper nouns of real people). sok: ["kryssord", "minikryss", "kryssord på nett"].

### tallknuseren — Tallknuseren · «Sudoku» · 1 player · tagger klassiker tenke alene daglig · rekkefolge 24
Generated puzzles with exactly one solution in four levels (Lett/Middels/Vanskelig/Ekspert), «Dagens
sudoku», notes mode (pencil marks), smart number pad, highlight of same numbers/row/column/box,
conflicts shown, undo, three hints, timer, auto-save, best times per level. Generation must be
fast on an old phone (generate with a seeded solver, verify uniqueness; precompute in a worker-free
way or ship a few hundred puzzles per level in data/ if needed).

### kortkongen — Kortkongen · «Kabal» · 1 player · tagger klassiker kort alene tenke · rekkefolge 25
Klondike solitaire: tap a card to move it to the best place (and drag & drop), draw 1 or 3, undo,
hint, auto-finish when solved, timer + moves, a winning card cascade, statistics. Beautiful,
readable cards on a 360 px phone (portrait) — the cards are the star. Every deal solvable is not
required, but offer «Bare løsbare kabaler» using a solver if feasible.

### sjakkhesten — Sjakkhesten · «Sjakk» · 1–2 players · tagger klassiker tenke alene · rekkefolge 26
Full rules (castling, en passant, promotion with choice, check, mate, stalemate, threefold repetition,
50-move rule, insufficient material). Two players on one phone (option to flip the board) and against
the computer at three levels (simple alpha-beta search with piece-square tables, run in small chunks
so the UI never freezes). Tap a piece → legal moves shown; last move highlighted; captured pieces;
undo against the computer; clocks optional. Pieces drawn as clean SVG (no font glyph dependency).

### fireren — Fireren · «Fire på rad» · 1–2 players · tagger klassiker barn familie alene · rekkefolge 27
Drop discs into a 7×6 board; two players on one phone or against the computer (three levels:
random-ish, decent, strong — minimax with alpha-beta). Satisfying drop animation and sound, winning
line highlighted, score across games, who starts alternates.

### bonden — Bonden · «Bondesjakk» · 1–2 players · tagger klassiker barn familie alene · rekkefolge 28
Tic-tac-toe on 3×3, plus a «5 på rad» variant on a bigger board. Two players or against the
computer (easy, medium, unbeatable). Super quick rounds, score, fun for small kids (big X and O drawn
with a playful pen animation). sok: ["tre på rad", "kryss og bolle", "tic tac toe"].

### minesveiperen — Minesveiperen · «Minesveiper» · 1 player · tagger klassiker tenke alene · rekkefolge 29
Levels Lett 9×9/10, Middels 16×16/40, Ekspert (fits a phone: 16×30 scrollable or zoom), first tap
always safe, tap to open and a flag mode toggle (long-press also flags), chording, timer, best times.

### dobleren — Dobleren · «2048» · 1 player · tagger klassiker tenke alene · rekkefolge 30
Swipe (and arrow keys) to merge tiles; smooth slide/merge animations; score + best; one undo per
move; continue after 2048; 4×4 and 5×5. No accidental page scrolling while swiping.

### slangen — Slangen · «Snake» · 1 player · tagger klassiker alene · rekkefolge 31
Classic snake on a canvas: swipe or on-screen arrows (thumb-friendly) and keyboard, three speeds,
walls on/off, food with little animations, best score, pause when the tab hides.

---

## Party and family

### nissen — Nissen · «Nissetrekning» · 3–30 players · tagger familie fest verktoy · rekkefolge 32
Secret Santa without a server. Enter names (+ optional «ikke trekk hverandre» pairs, budget, date).
Two modes: **én mobil** (each person holds to see whom they give to, then passes on) and **hver sin
mobil** (a share code/QR; each person picks their own name and sees only their match; the name locks
once seen, like Luringen). Valid derangement from a seed honouring exclusions; a short gift-idea
generator per budget; Christmas look (snow, bells) while staying in the rusj style.
sok: ["secret santa", "nissetrekning", "trekk julegaver", "hemmelig nisse"].

### terninga — Terninga · «Yatzy» · 1–6 players · tagger klassiker familie · rekkefolge 33
Scandinavian Yatzy rules (15 categories: enere–seksere, bonus 50 at ≥ 63, ett par, to par, tre like,
fire like, liten straight 1–5, stor straight 2–6, hus, sjanse, yatzy 50). Five 3D-feeling dice, tap to
hold, three rolls, the scorecard shows what each open box would give, pass-the-phone between players,
undo of a mistaken score (until the next roll), winner celebration, best score. Option: «Maxi-Yatzy».

### brikka — Brikka · «Fia med knuff» · 2–4 players · tagger klassiker familie barn · rekkefolge 34
Classic Norwegian board game: 4 pawns each, roll 6 to come out (house rules toggles: 6 gives an extra
roll, exact roll to finish), knock opponents home, safe squares. Pass-and-play and computer players
for empty seats. A clear board on a phone, animated moves, the pawns you can move pulse, one tap
moves. Never more than one decision per roll.

### tidsmaskinen — Tidsmaskinen · «Tidslinja» · 1–10 players · tagger quiz familie lag · rekkefolge 35
Each player builds a timeline: draw an event card (year hidden) and place it between the cards you
already have; right → keep it, wrong → it's discarded and the year revealed. First to 10 cards wins
(solo: how long a streak). Content: ≥ 400 events (Norway, world history, inventions, pop culture
before 2000, nature, sport) with correct years — facts must be certain and not disputed; a separate
fact check pass is required; add a node:test validating the data.

### tieren — Tieren · «Ti svar» · 2–8 players · tagger quiz familie fest · rekkefolge 36
A question with ten answer options on a ring (e.g. «Hvilke av disse er hovedsteder?»); players in turn
pick an option and claim it is true/false or answer the number/order; right = 1 point banked for the
round, wrong = lose the round's points; you may stop and keep your points. Content: ≥ 120 question
cards × 10 items, all correct and stable over time (same rules as Besserwisseren; fact check + node:test).

### admiralen — Admiralen · «Slagskip» · 1–2 players · tagger klassiker familie alene · rekkefolge 37
Place your fleet (drag or auto-place), then shoot. Against the computer (smart hunt/target AI, three
levels) or two players on one phone with a pass-the-phone gate between turns so nobody sees the other
board. Splashes, hits, sinking animation and sound; ships named in Norwegian.

### ballongen — Ballongen · «Galgen for barn» · 1–6 players · tagger barn familie ord · rekkefolge 38
Guess the word letter by letter before all the balloons holding the basket pop (no hanging — friendly
for kids). Word sources: categories from the shared word bank and a «skriv ditt eget ord» mode where
one player types a secret word for the others (hidden input). Big Norwegian keyboard with æ ø å,
hint button (category / one letter), win/lose animations. sok: ["galgen", "hangman", "gjett ordet"].

### nynneren — Nynneren · «Nynn låta» · 3–20 players · tagger fest familie lag · rekkefolge 39
One player sees a song title (behind a gate) and hums it — no words; the others guess. Timer, points
for guesser and hummer, categories (Barnesanger, Julesanger, Norske klassikere, Allsang, Popklassikere
før 2010, Filmmusikk, Nasjonalsanger og hymner), difficulty. Content: ≥ 400 well-known song titles
(titles only, no lyrics). No audio is played by the app.

### papegoyen — Papegøyen · «Ja- og nei-forbudet» · 2–20 players · tagger barn familie fest · rekkefolge 40
One player answers rapid questions for 60 seconds without saying «ja» or «nei» (and optionally
without nodding/shaking the head); the others fire questions from the app (big text, «Neste spørsmål»
fast) or their own; a «Sa det!» button ends the turn with a parrot squawk; the score is how long you
lasted. Content: ≥ 300 tricky questions designed to lure a yes/no, grouped Barn/Familie/Voksen.

### bingoballen — Bingoballen · «Festbingo» · 3–40 players · tagger fest familie · rekkefolge 41
Two modes. **Tallbingo** (75 balls): the host phone draws numbers with a satisfying ball animation and
announces them (big, readable from across the room, history board); players get unique cards on their
own phones via a code/QR + seat number (deterministic from the code; marks saved locally; «BINGO!»
check on the host by entering the card number). **Festbingo**: cards of party moments («Noen synger
med på feil tekst», «Noen søler») for julebord, bryllup, 17. mai, hyttetur, bursdag — tap to mark,
first full row wins. Content: ≥ 6 themes × ≥ 40 moments.

### verktoykassa — Verktøykassa · «Festverktøy» · 1–20 players · tagger verktoy fest familie · rekkefolge 42
Small tools on one page, each one tap away: **Hvem starter?** (everyone puts a finger on the screen,
multi-touch, a winner is picked with a ring animation — the signature tool), **Terninger** (1–6 dice,
3D roll), **Lagdeler** (random fair teams from the shared names), **Stein, saks, papir** (vs. the phone
or two players), **Mynt**, **Tilfeldig tall**, **Poengteller** (up to 8 players), **Nedtelling/
stoppeklokke**. Each tool fast, beautiful, works offline.

---

## Drinking games (18+) — tagger drikke fest · spill.json "alder18": true

Responsible by design: sips («slurker»), never chugging or shots as a rule; every rule works with
non-alcoholic drinks and the game says so; no brands; no pressure («alle kan stå over»); no sexual
dares; nothing humiliating or dangerous; reminders to drink water appear now and then. The kit's 18+
gate handles age. Tone: fun, social, warm.

### ringen — Ringen · «Kortringen» · 3–12 players · rekkefolge 43
Cards laid in a ring on the table (virtual deck); each player draws in turn; every value has a rule
(our own Norwegian set: e.g. «Fossefall», «Regel», «Spørsmålsmester», «Rim», «Kategori», «Jeg har
aldri», «Høyre/venstre skåler», «Kompis» …), clearly explained on the card. The fourth of a value
ends the round with a fun finale (no «down the whole cup»). sok: ["ring of fire", "kongens kopp", "drikkelek kort"].

### pyramiden — Pyramiden · «Pyramiden» · 3–10 players · rekkefolge 44
Each player gets 4 cards (pass the phone to peek); a pyramid of face-down cards is flipped row by row;
a match lets you give out sips (row 1 = 1 sip … top = 5), others may call bluff (show the card).
Clear guidance at every step, the app keeps track of who gave what.

### bussen — Bussen · «Rød eller svart?» · 2–10 players · rekkefolge 45
Four questions per player (rød/svart, høyere/lavere, innenfor/utenfor, sort), wrong = sips; then the
«bussturen» finale for the unluckiest. Cards dealt with crisp animations; quick, readable.
sok: ["ride the bus", "rød eller svart", "høyere lavere"].

### hjulet — Hjulet · «Snurr og skål» · 3–20 players · rekkefolge 46
A big glossy wheel with ~12 segments (Alle skåler, Venstre nabo, Velg en kompis, Regel, Kategori,
Vannpause, Sannhet, Utfordring (safe), Gi ut 3, Ta 1, Snurr igjen, Fritak). Satisfying physics spin
by flick or button, segments with icons, house-rule editor (rename segments), pass the phone.

### torsten — Tørsten · «Jeg har aldri – drikkeversjon» · 3–20 players · rekkefolge 47
Like Sladrehanken but as a drinking game: «Jeg har aldri …» — those who have, take a sip. Packs:
Vors, Studentliv, Reise, Jobb, Pinlig, Flørt (cheeky, never explicit), Kaos. ≥ 400 statements, none
copied from Sladrehanken. Optional «drikk eller fortell»-twist.
