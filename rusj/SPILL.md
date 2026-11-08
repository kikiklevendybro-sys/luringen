# The rusj games — design briefs

Each game is an original design in a well-known party genre. Don't copy names, texts, art or exact
rules from existing commercial games or apps; build our own take that is simpler and better.
`rekkefolge` = position on the front page. Content amounts are minimums.

---

## spionen — Spionen · «Finn spionen» · rekkefolge 2 · 3–12 players · mobiler "begge" · qr true
Everyone gets the same secret place and a role there — except the spy, who gets nothing.
- Modes like Luringen: **én mobil** (pass the phone, hold-to-reveal) and **hver sin mobil**
  (host shows a join code + QR; each phone picks its seat number and holds to see its card; the code
  encodes seed, player count and spy count, salted with a hash of the place list).
- Setup: players (names only needed on one phone), 1 or 2 spies (2 from 7 players), time 5/8/10 min,
  place packs (Hverdag, Norge, Reise, Fantasi …).
- Card: "📍 Hytta på fjellet · Du er: Den som alltid fyrer i peisen". Spy: "Du er spionen. Finn ut hvor dere er."
- Play screen: big timer, who asks first (random), button "Steder" (sheet with all places in the
  pack, so the spy can browse and everyone can check), "Stopp – vi anklager noen!", and
  "Spionen vil gjette stedet". Accusation → pick suspect → was it the spy? (dramatic reveal) → if
  caught, the spy gets one last guess at the place. Time out → accusation. Spy guess → pick from list.
- Score per round: group +1 each when the spy is caught without guessing; spy +2 when escaping or
  guessing right. Scoreboard across rounds, "Ny runde" keeps players.
- Content: ≥ 70 places, each with 7 roles (fun, specific, Norwegian flavour: 17. mai-tog, Hurtigruta,
  Syden-charter, Dugnad i borettslaget, Russebuss, Fjellstue, Fiskebåt, Barnehage, Romstasjon, Piratskip …).

## sladrehanken — Sladrehanken · «Jeg har aldri» · rekkefolge 3 · 2–20 · mobiler "en"
Deck game in the style of Pekefingeren: "Jeg har aldri …" cards.
- Modes: **Bare kort** (read, laugh, swipe) and **Fem liv** (each player starts with 5 fingers/hearts;
  after each card tap everyone who HAS done it → they lose one; out at 0; last one standing wins,
  with a fun "Uskyldigst" crowning and a "Mest erfaren" title for the first one out).
- Packs: Familie (barnevennlig), Venner, Reise, Skole og jobb, Pinlig, Mat, Fest (18+, mild).
  Not a drinking game — no instructions to drink.
- Content: ≥ 450 statements total, varied and specific ("Jeg har aldri sendt en melding til feil person"
  is fine, but find fresher ones too). No duplicates of Pekefingeren's statements.
- Also expand `rusj/spill/pekefingeren/data/utsagn.json` to ≥ 400 statements total (keep its packs and
  format; add good ones to each pack; you may add one new pack "Reise"). Re-run its e2e test.

## vaghalsen — Våghalsen · «Sannhet eller konsekvens» · rekkefolge 5 · 2–20 · mobiler "en"
- Players required. Whose turn: a spinning bottle/arrow animation in the middle of a ring of avatars
  that stops on a player (or "i rekkefølge" setting). Player picks **Sannhet** or **Konsekvens**
  (two big buttons), card appears. "Fullført!" (+1 truth, +2 dare) or "Feig…" (0, counts as chicken).
- Dares may involve another player: `{spiller}` in the text is replaced by a random other player's name.
- Packs/levels: Barn (6–12 år), Familie, Venner, Fest (18+, flirty but never explicit).
  Dares must be safe indoors, kind, never humiliating, no strangers, no posting online, no food/drink
  challenges that could be unsafe.
- End: "Største våghals" (most dares), "Ærligste" (most truths), "Feigeste" (most chickens) — light-hearted.
- Content: ≥ 220 truths and ≥ 220 dares across the packs.

## vinglepetter — Vinglepetter · «Hva vil du helst?» · rekkefolge 6 · 2–20 · mobiler "en"
- Card split into two halves A (left/top) and B (right/bottom) in two colours, "ELLER" stamp between.
- "3 · 2 · 1 – Velg!" countdown, everyone points left or right (or holds up 1 or 2 fingers).
- Optional vote count: steppers for how many chose A vs B → animated split bar with percentages and a
  playful comment ("Enstemmig!", "Delt på midten", "Bare én vinglepetter …"). Swipe for next.
- Packs: Barn, Familie, Mat, Superkrefter og fantasi, Ekkelt (tame gross), Venner, Fest (18+, mild).
- Content: ≥ 400 dilemmas, both options equally tempting (that's what makes it fun).

## skravla — Skravla · «Forklar ordet» · rekkefolge 7 · 4–20 · mobiler "en" · ordbank true
Team explaining game (our own take on the classic).
- 2–4 teams (R.LAG colours). Each turn: explainer from the current team, 60 s (45/60/90), words from
  the shared word bank (`window.RUSJ_ORD`; pick categories and difficulty Lett/Middels/Vanskelig = n 1/2/3).
- During the turn: huge word, buttons "Riktig ✓" and "Hopp over"; swiping right/left does the same.
  Optional "Tabu-modus": shows two forbidden words under the word (use the entry's hint `h` and
  similar word `l` fields).
- After the turn: list of the words with toggles (fix mistakes), points, then a **race track**
  (board with team tokens moving forward, first to 30 or chosen goal wins) — the visual hook.
- Pass-the-phone screen between turns ("Lag Rosa: hvem forklarer?").

## panna — Panna · «Gjett ordet på panna» · rekkefolge 8 · 2–20 · mobiler "en" · ordbank true
- Player holds the phone on the forehead (landscape); others shout clues. Tilt down = correct,
  tilt up = pass (DeviceOrientation; ask permission on iOS with a button; calibrate on start).
  Always also tap zones: right half = riktig, left half = pass. 60 s rounds, 3-2-1 countdown with
  "Hold mobilen mot panna" instruction, huge word readable at arm's length, green/orange full-screen
  flash + sound on each answer.
- Decks: build ≥ 12 themed decks (≥ 40 words each) in data (Dyr, Mat, Yrker, Sport, Norge, Eventyr og
  fantasi, Ting i huset, Filmfigurer (fictional only), Følelser å spille, Steder, Barn (lett), Kaos)
  + option to use word-bank categories.
- After the round: list of words (✓/✗), score, "Neste spiller" and a scoreboard if names are used.
- Handle portrait/landscape (CSS orientation media queries), wake lock, and pausing if the tab hides.

## kodeknekkeren — Kodeknekkeren · «Kodeord i lag» · rekkefolge 9 · 4–20 · mobiler "begge" · ordbank true · qr true
Two teams (Rosa vs Blå), each with a code master. Our own take on the classic word-grid game.
- Board: 5×5 words from the word bank (single words, 3–11 letters, difficulty 1–2, no duplicates).
  Key: 9 for the starting team, 8 for the other, 7 neutral, 1 trap ("Fella" — touching it loses).
- The board is shown on one shared screen (phone/tablet/laptop, responsive up to big screens).
  Code masters see the key either on their **own phone** (scan the QR / enter the code; the code holds
  the seed + starting team, salted with the word-bank hash) or on the board device via a
  hold-to-reveal "Kun kodemestere!" card.
- Turn flow on the board: shows whose turn, remaining agents per team, tap a word to reveal (flip with
  team colour), "Ferdig med runden" button, win/lose detection, undo last tap (in case of mis-tap).
- Optional turn timer. End screen with the full key revealed.

## besserwisseren — Besserwisseren · «Festquiz» · rekkefolge 10 · 1–20 · mobiler "en"
- Quizmaster mode on one phone: question + 4 options (A–D) big; optional 20 s timer with ticking;
  "Vis svaret" → correct option lights up + a short fun fact; then tap who answered right (players or
  teams) → points. Rounds of 10/15/20 questions, category and difficulty choice, final podium.
- Categories: Norge, Geografi, Natur og dyr, Mat og drikke, Sport, Historie, Vitenskap og rom, Språk og
  ord, Kultur og eventyr, Barn (lett). Three difficulty levels.
- Content: ≥ 500 questions. **Facts must be correct and stable over time**: avoid records, rankings,
  populations, prices, "current" office holders, recent events and anything disputed. Only include a
  question if you are certain. One clearly correct option; distractors plausible but clearly wrong.
  Each question has `fakta` (one short sentence). Store as `{ k, n, s, a: [4 options], r: index, fakta }`.

## detektiven — Detektiven · «Hvem er jeg? – 20 spørsmål» · rekkefolge 11 · 2–20 · mobiler "en"
- One player is the "secret keeper": sees the secret (hold-to-reveal, or a gate "Bare X ser").
  The others ask yes/no questions out loud; the phone (with the keeper) counts: big "+1 spørsmål"
  button showing 1…20 on a magnifying-glass meter, plus "Ja / Nei / Kanskje" quick buttons that also
  count. At question 10 a hint (category) may be revealed. "Noen gjettet det!" → pick who → points
  (guesser +2, keeper +1 if it took over 10 questions; keeper +3 if nobody gets it in 20).
- Content: ≥ 350 secrets across Dyr, Ting, Mat, Yrker, Steder i Norge, Kjøretøy, Fantasi og eventyr
  (fictional characters only), Natur, Sport, Barn (lett); each with category and difficulty.

## mimen — Mimen · «Mimeleken» · rekkefolge 12 · 3–20 · mobiler "en"
- Modes: **Lag mot lag** (2–4 teams) or **Alle mot alle** (guesser gets the point, pick who).
- Turn: mimer sees the prompt behind a gate (others look away), 3-2-1, 60 s timer, "Riktig!" / "Pass".
  "Ingen lyder!" reminder (option "Lyder lov" for kids).
- Categories: Dyr, Yrker, Sport, Hverdag, Følelser, Eventyr og fantasi, Handlinger, Kjente situasjoner
  ("Gå på glatt is", "Bære en altfor tung sekk"), Barn (lett). Difficulty 1–3.
- Content: ≥ 450 prompts. End: podium/scoreboard.

## tankeleseren — Tankeleseren · «Bølgelengde» · rekkefolge 13 · 2–20 · mobiler "en"
- A spectrum card ("Kaldt ↔ Varmt", "Undervurdert ↔ Overvurdert"). A hidden target on a semicircle
  dial (0–100, scoring zones 4/3/2 around the target). The clue giver sees the target (behind a
  gate/hold), says one clue, hands the phone to the team, who drag the needle and lock it in.
  Reveal animation (the cover slides open), points, next clue giver.
- Modes: **Sammen** (co-op, 8 rounds, rating at the end) and **Lag mot lag** (2 teams, first to 10;
  the other team can bet "lenger til venstre/høyre" for 1 point).
- The dial is the star: beautiful, smooth dragging with pointer events, big and precise on phones,
  also adjustable with buttons/keyboard.
- Content: ≥ 180 spectrum pairs (fun, debatable, Norwegian context).

## hviskeren — Hviskeren · «Bare ett hint» · rekkefolge 14 · 3–10 · mobiler "en" · ordbank true
Co-operative. One guesser per round, the others give one-word hints.
- Guesser looks away; the secret word is shown to the others (gate "Gjetteren ser bort!").
- Pass the phone: each hint giver privately types ONE word (gate per player; input validated: one word,
  not the secret word or a form of it).
- The app cancels identical hints automatically (normalised; also simple Norwegian plural/definite
  forms like bil/bilen/biler/bilene). Then a "Sjekk hintene" screen for the hint givers to strike more
  near-duplicates by tapping. Then the guesser sees the surviving hints and guesses aloud:
  "Riktig" / "Feil" / "Pass". 13 rounds, score with a rating ("Telepater!").
- Words: shared word bank, difficulty 1–2, categories selectable.

## lognhalsen — Løgnhalsen · «To sannheter og en løgn» · rekkefolge 15 · 3–20 · mobiler "en"
- Turn: the teller gets a fresh **inspiration prompt** (e.g. "Noe du har spist", "Et sted du har sovet"),
  then either says the three claims out loud (mode "Si det høyt") or types them privately (mode
  "Skriv inn": three fields + mark the lie; the app shows them shuffled as big numbered cards).
- "3 · 2 · 1 – Pek på løgnen!" everyone holds up 1, 2 or 3 fingers. The teller reveals the lie
  (tap it / the app reveals it with a stamp "LØGN!").
- Scoring: tap who guessed right (+1 each); teller +1 per player fooled (computed). Podium at the end.
- Content: ≥ 200 inspiration prompts, grouped by theme.

## kunstneren — Kunstneren · «Tegn og gjett» · rekkefolge 16 · 2–20 · mobiler "en"
Two modes, both on one phone:
- **Tegn og gjett**: drawer sees the word (gate), 60 s timer, draws on a full-width canvas with finger
  (6 colours, 2 brush sizes, eraser, undo, clear). Others guess aloud; "Gjettet!" → pick who guessed
  (+1 guesser, +1 drawer). Teams optional.
- **Hviskeleken** (telephone with pictures): player 1 gets a word and draws, player 2 sees only the
  drawing and types a guess, player 3 sees only the guess and draws, … At the end: a gallery that
  replays each drawing stroke by stroke next to the guesses — the big laugh.
- Store drawings as compact stroke lists (normalised coordinates), not images. Smooth lines
  (pointer events, coalesced events, quadratic smoothing), works with mouse too.
- Words: ≥ 400 drawable words in data (Dyr, Mat, Ting, Hjemme, Natur, Kjøretøy, Sport, Handlinger,
  Steder, Fantasi), difficulty 1–3.

## sauen — Sauen · «Tenk som flokken» · rekkefolge 17 · 3–12 · mobiler "en"
- Question ("Nevn en frukt som er gul"). Pass the phone: each player privately types one answer.
- The app groups equal answers (normalised + simple Norwegian forms), then a "Slå sammen" step where
  the group can merge groups that mean the same (tap two groups). Reveal group by group with suspense.
- Everyone in the single biggest group gets 1 point (tie for biggest → nobody). **Den svarte sauen**:
  if exactly one player is alone with a unique answer, they get the black sheep (shown on their
  avatar); while you hold it you can't win; it moves to the next lone answer. First to 8 points
  without the black sheep wins.
- Content: ≥ 320 questions with clear categories (no factual right answer needed).

## varulven — Varulven · «Varulv» · rekkefolge 18 · 6–18 · mobiler "en"
All on one phone, passed around — no game master needed.
- Roles: Varulv (1 per 4–5 players), Synsk (sees one player's side each night), Lege (protects one
  player each night, not the same twice in a row), Landsbyboer. Optional: Jeger (takes someone with
  them when they die).
- Start: pass the phone, each player holds to see their role.
- Night: the phone goes around in seat order to every living player ("Gi mobilen til X"; "Jeg er X").
  Everyone does something so nobody can tell roles by timing: wolves vote a victim (majority, random
  tie-break; wolves see what the other wolves chose), the seer checks someone, the doctor protects
  someone, villagers answer a little question ("Hvem tror du er varulv?" — used for a fun statistic at the end).
- Morning: dramatic reveal of who was taken (or "Legen reddet noen i natt!"). Day: discussion timer,
  then "Landsbyen stemmer": choose who was voted out (or nobody) → their role is revealed.
- Win: all wolves gone → landsbyen vinner; wolves ≥ others → varulvene vinner. End screen with every
  role and the night history.
- Atmosphere: darker night look on night screens, synthesized howl/heartbeat sounds, short narration
  texts. Instructions must be crystal clear because everyone passes the phone.

## bokstavtrollet — Bokstavtrollet · «Alfabetleken» · rekkefolge 19 · 2–12 · mobiler "en"
Two modes:
- **Bomba**: the troll draws a category + letter ("Dyr på B"). Pass the phone around: say a word,
  pass it on. A hidden timer (15–45 s) with a heartbeat that speeds up; when the troll wakes (roar,
  shake, red flash) whoever holds the phone loses a heart (pick who). 3 hearts; last one standing wins.
- **Bokstavjakt**: letter + 5 categories on screen, 90 s; everyone writes on paper; then the app
  shows the categories again for scoring by hand (2 points unique, 1 shared — the app just helps tally).
- Kid-friendly letter set by default (no C, Q, W, X, Z, Å…), "Vanskelig" adds them.
- Content: ≥ 160 categories with difficulty (Barn / Familie / Voksen).

## skjaera — Skjæra · «Kims lek» · rekkefolge 20 · 1–8 · mobiler "en"
- A grid of colourful items (emoji with Norwegian names) is shown for a few seconds; then Skjæra (the
  magpie mascot) swoops across the screen and steals one or more; the board comes back with gaps
  (or shuffled at higher levels). Players pick what's missing from 4–6 options.
- Levels 1–12 (more items, less time, more stolen, shuffling). Solo progression with stars, or
  2–8 players taking turns with points. Celebrate, and show what was stolen with the magpie flying back.
- Content: ≥ 220 emoji items with names, grouped by theme.

## elefanten — Elefanten · «Memory» · rekkefolge 21 · 1–4 · mobiler "en"
- Classic pairs game with buttery 3D flip animations. Board sizes 12/16/20/24/30 cards (fit the screen
  without scrolling where possible). Themes: Dyr, Mat, Kjøretøy, Sport, Natur, Rom, and **rusj-gjengen**
  (the mascots from `RusjGjengen.svg(id)` as card faces).
- Solo: moves + time, personal best per size saved locally. 1–4 players: take turns, a match gives
  another try, scores, winner celebration.
- Content: themes with ≥ 15 distinct items each (emoji with Norwegian names for accessibility).
