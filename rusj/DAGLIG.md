# `rusj.daglig` – the storage contract for «Dagens rusj»

One `localStorage` key carries everything the daily ritual needs. **The kit writes it** (from the
daily games), **the front page reads it** (the «I dag» strip). Nothing leaves the phone.

- Writer: `rusj/kit/rusj.js` (`R.dagligFerdig`, and the new `R.dagligIGang`).
- Reader: `rusj/portal/daglig.js` (pure functions, unit-tested in `test/daglig.test.mjs`) and
  `rusj/portal/portal.js` (the strip).
- A **daily game** is a game with the tag `daglig` in its `spill.json`. Nothing here is tied to the
  three that exist today.

## Today

«Today» is the date in Norway. Its **day number** is `R.dag().nr`: days since 1 January 1970 of the
Oslo date (11 November 2026 is `20768`). Weekday: `(nr + 3) % 7`, where 0 is Monday. A week is
Monday–Sunday: `Math.floor((nr + 3) / 7)`.

## The format

The key is `rusj.daglig` (`R.les("daglig")` / `R.skriv("daglig", …)`). The value is one object:

```js
{
  "ordugla":      { "nr": 20768, "vunnet": true, "rekke": 12, "res": "4/6" },
  "blyanten":     { "nr": 20767, "vunnet": true, "rekke": 4,  "res": "0:52",
                    "pagar": { "nr": 20768, "tekst": "5 av 8 ord" } },
  "tallknuseren": { "pagar": { "nr": 20768, "tekst": "4:12" } },
  "_": {
    "v": 1,
    "dager": { "20768": ["ordugla"], "20767": ["ordugla", "blyanten"], "20765": ["ordugla"] },
    "best": 31
  }
}
```

### One entry per game: `<id>`

| Field | Type | Meaning |
|---|---|---|
| `nr` | integer | Day number of the last daily this game **finished** (won, lost or given up). Absent until the first one. *(exists today)* |
| `vunnet` | boolean | How that daily ended. *(exists today)* |
| `rekke` | integer 0–9999 | The game's own streak after that daily: so many days in a row, ending on `nr`. 0 after a loss. *(exists today)* |
| `res` | string, ≤ 14 characters | **New.** The result of that daily as the player would say it: `"4/6"`, `"3:42"`, `"X/6"`. Plain text. Never the answer or any part of it – this text is shared. Optional. |
| `pagar` | `{ nr, tekst }` | **New.** A daily that is started but not finished. `nr`: the day it belongs to. `tekst` (≤ 14 characters, may be `""`): how far – `"2/6"`, `"5 av 8 ord"`, `"4:12"`. Optional. |

`nr`, `vunnet`, `rekke` and `res` always describe the same day: the last finished one.
`pagar` counts only when `pagar.nr` is today and the game is not finished today (`nr` is not today).

### The site log: `_`

Owned by the kit. `_` is never a game id.

| Field | Type | Meaning |
|---|---|---|
| `v` | `1` | Version of this part. |
| `dager` | object | Key: a day number as a string. Value: the ids of the daily games finished that day (each id once, at least one). **At most the 400 newest days** – drop the oldest key when a 401st is added. |
| `best` | integer | The longest site streak so far (see below). Optional; not shown yet. |

## What the writer must do

1. **Read, change, write the whole object.** Never drop a key you do not know: other games, `_`,
   and fields that come later.
2. **`R.dagligFerdig({ vunnet, rekke, res })`** – today's daily is finished:
   - `alle[id] = { nr: today, vunnet, rekke, res }` (`res` cut to 14 characters; leave it out if the
     game gave none; the old `pagar` goes away);
   - add `id` to `alle._.dager[today]` (create `_` and the list as needed, an id only once), then
     trim `dager` to the 400 newest days;
   - `alle._.best = Math.max(alle._.best || 0, site streak)`.
   - **Idempotent:** the games call it again from `lastet` on every load the same day. A second
     call with the same values must leave the stored object unchanged.
3. **`R.dagligIGang({ tekst })`** – today's daily has progress and is not finished: if
   `alle[id].nr` is not today, set `alle[id].pagar = { nr: today, tekst }` and keep the entry's
   other fields. It never touches `_`. Call it when progress changes (a guess, a filled word, on
   leaving the board) – not every second.
4. **Only today's daily is reported, and only as today.** A puzzle from another day, a practice
   round or a custom board is never written here.
5. The first time `_` is created, seed `dager` with the days the existing entries tell of (for
   each game: `nr`, `nr − 1` … `nr − rekke + 1`). Readers do the same sum, so this is for tidiness.
6. The front page links to **`/<id>/#dagens`**. A daily game opens today's puzzle from that
   address – the board, or the result if it is finished. (Until a game does, the address opens
   its home screen, as today.)

## What a reader does

- **State of a game today:** *ferdig* if `nr` is today (then `vunnet`, `res`); else *i gang* if
  `pagar.nr` is today (then `pagar.tekst`); else *ny*.
- **Played days** = the keys of `_.dager` with a non-empty list, plus – for every game entry –
  the days `nr`, `nr − 1` … `nr − max(rekke, 1) + 1`. Days after today are ignored. This sum is
  what makes old data work: with no `_` at all, the games' own streaks still give the days.
- **Has played before** = there is at least one played day.
- Nothing is trusted: a value of the wrong type is skipped, texts are cut and always shown as
  text (never as HTML).

## The site streak

*Days in a row with at least one finished daily* – any daily game, won or not. Showing up is
what counts. It is always **computed from the played days**, never stored (except `best`).

1. **Today never breaks a streak while it lasts.** If nothing is finished today, the streak is
   counted from yesterday.
2. **Each week (Monday–Sunday) forgives one missed day: the rest day.** A rest day holds the
   streak together but is not counted in its length. A second missed day in the same week ends
   the streak.
3. Counting goes **backwards from today**, so in a week with two missed days the newest one is
   the rest day, and the streak begins after the older one.
4. A missed day is a rest day only if there is a played day before it.
5. **Never shame.** A streak of 0 is «Ny rekke starter i dag» – nothing about what was lost.
   Streaks are never shown as a ranking against other people (the clock can be changed).

The reference implementation is `rekke(dager, iDag)` in `rusj/portal/daglig.js`. The kit should
use the same lines, so a result screen and the front page can never disagree:

```js
// dager: Set of played day numbers. iDag: today's day number.
// → { rekke, hvile: [day numbers used as rest days], spiltIDag }
function rekke(dager, iDag) {
  const uke = (nr) => Math.floor((nr + 3) / 7);
  const spiltIDag = dager.has(iDag);
  const hvile = [];
  let venter = [];              // missed days: rest days only if an older played day follows
  const bruktUke = new Set();
  let n = 0;
  for (let d = spiltIDag ? iDag : iDag - 1, i = 0; d > 0 && i < 4000; d--, i++) {
    if (dager.has(d)) { n++; hvile.push(...venter); venter = []; }
    else if (bruktUke.has(uke(d))) break;
    else { bruktUke.add(uke(d)); venter.push(d); }
  }
  return { rekke: n, hvile, spiltIDag };
}
```

Examples (week: Mon 20766, Tue 20767, **Wed 20768**, Thu 20769, Fri 20770; `P` = played days):

| Today | `P` | Streak | Rest days | Why |
|---|---|---|---|---|
| Wed | Mon, Tue | 2 | – | nothing finished yet today: counted to yesterday |
| Wed | Sun, Mon, Wed | 3 | Tue | one missed day in the week |
| Wed | Sun, Mon | 2 | Tue | yesterday missed, today still open: the streak lives |
| Wed | Sat, Sun, Wed | 1 | – | Mon and Tue both missed: a new streak |
| Wed | Sat, Sun | 0 | – | «Ny rekke starter i dag» |
| Tue | Fri, Sat, Tue | 3 | Sun, Mon | one rest day in each of two weeks |
| Fri | Sun, Mon, Wed, Fri | 2 | Thu | two missed days this week: the newest is the rest day |

## Old data

Today's format – `{ "ordugla": { "nr": 20768, "vunnet": true, "rekke": 12 } }` – is a valid
value of the new one. From it the front page shows *ferdig*/*ny* per game («Løst» where there is
no `res`), the count, the week dots and a site streak built from the games' own streaks.
*I gang* and the result texts appear when the kit starts writing `pagar` and `res`.

## For the kit owner

- [x] `R.dagligFerdig` takes `res`, keeps unknown keys, logs the day in `_.dager` (≤ 400),
      updates `_.best`, and is idempotent.
- [x] `R.dagligIGang({ tekst })`.
- [x] Each daily game passes `res` and reports progress: Ordugla `"4/6"` and `"2/6"`, Blyanten
      `"0:52"` and `"5 av 8 ord"`, Tallknuseren `"6:10"` and `"4:12"`.
- [x] `#dagens` opens today's puzzle (or its result) in every daily game.
- [ ] If the kit shows the site streak (result screens), it uses `rekke()` above with the same
      played days as «What a reader does».
