# Client contract: rusj.no ↔ rusj-nett

For whoever maintains the kit, the games and the build. The client is `rusj/kit/nett.js`
(`R.nett`); the Worker is `nett/src/`. Both are deliberately game-agnostic: the room relays moves in
order and never looks inside them; the games' own deterministic rules (seeded RNG, pure engines)
make every phone compute the same match.

## Switch

`NETT_ADRESSE` in `scripts/rusj.mjs` is the only switch.

- Empty: nothing is published, nothing is sent, the CSP is unchanged, the «Spill med en venn på
  nett» button does not exist, and `/personvern/` says what it said before.
- Set to the Worker's bare origin (`https://rusj-nett.<sub>.workers.dev`; the build refuses anything
  else, except `http://localhost`/`127.0.0.1` for tests; `RUSJ_NETT_ADRESSE` in the environment
  overrides it for a test build):
  - CSP: `connect-src` gains `https://<host>` and `wss://<host>` on every page.
  - `/felles/nett.js` = `window.RUSJ_NETT="<origin>";` + `rusj/kit/nett.js`, loaded (after the kit,
    before the game) only on the pages of games with `"nett": true` in spill.json, plus
    `/felles/nett.css`.
  - `/personvern/` gets the section «Spill på nett», and the intro one sentence about it.

## HTTP

| Request | Answer |
|---|---|
| `POST /rom` (no body, `Origin: https://rusj.no`) | `201 {"kode":"ABC234"}` – a fresh code, reserved for 10 minutes. `403` other origins, `429` brake, `503` try later. |
| `GET /rom/<kode>` with `Upgrade: websocket` | `101` – the socket. `403` wrong origin, `404` malformed code, `426` not a WebSocket. |
| `GET /` | `rusj-nett: ok` |

Codes: 6 signs from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O, 1/I/L). They travel in the
invite link (`https://rusj.no/<game>/#nett=<kode>`); the client upper-cases and drops anything else.

A code that does not exist, a full room or too many sockets: the socket opens, gets one
`{"h":"feil","kode":…}` and is closed. (A refused upgrade would look like a lost connection.)

## Socket messages

Text frames with JSON, at most 2 KB from a phone. `"ping"` (plain text) is answered `"pong"` by the
platform without waking the room; the client sends it every 25 s.

### Phone → room

| `h` | Fields | When |
|---|---|---|
| `lag` | `spill`, `oppsett` (object ≤ 512 B), `fro` (uint32), `navn` | first message of the host, on a code it just got from `POST /rom` |
| `bli` | `navn`, `token` (optional) | join a free seat, or take one's own seat back with its token |
| `start` | – | the host (seat 0) starts before every seat is taken (≥ the game's minimum) |
| `trekk` | `n` (the place the move should get), `t` (any JSON ≤ 1 KB) | a move |
| `reaksjon` | `e` (0–5) | one of the six preset emoji |
| `ferdig` | – | the phone's rules say the match is over |
| `ny` | `fro` | «Ny kamp», after `ferdig` |
| `forlat` | – | leave on purpose |

### Room → phone

| `h` | Fields | When |
|---|---|---|
| `rom` | `spill oppsett fro kamp min maks startet ferdig seter du token logg` | after `lag`/`bli`, after `ny`, and to everyone when the seats are renumbered |
| `seter` | `seter: [{ navn, med, borte }]` | someone joined, left, lost or regained the connection |
| `start` | – | the match begins (the last seat was taken, or the host started) |
| `trekk` | `n s t` | a move, in order, to everyone (the sender too) |
| `reaksjon` | `s e` | to the others |
| `feil` | `kode` (`n` with `utdatert`) | see below |
| `slettet` | `grunn`: `tid`, `ferdig`, `verten` | just before the room closes every socket |

`du` is the receiving phone's seat (−1 = none); `token` is sent only to the phone that holds the
seat. `logg` is `[[seat, move], …]`. `med`: connected now. `borte`: left on purpose.

Errors (`feil.kode`): `ukjent` (no such room), `full`, `startet` (the match began without you),
`opptatt` (`lag` on a room that is set up), `sete` (no seat), `utdatert` (`n` was not the next place:
you missed moves; they arrive in order anyway), `ugyldig`, `stor` (> 2 KB), `fort` (> 20 messages /
10 s), `logg` (2000 moves).

Close codes the client must not reconnect after: `1000` left, `4000` another socket took the seat,
`4001` deleted, `4003` full/started, `4004` unknown, `4008` far too many messages.

## Order, replay and fairness

- **Order.** The room numbers moves 0, 1, 2 … and sends each to every phone. A phone applies moves
  only as they come back from the room – its own too – so all phones see the same order. A move
  carries `n`, the place the phone expects it to get; if another move got there first the room
  answers `utdatert` and the phone simply waits for the moves it missed (its UI is redrawn from
  them, so a stale tap is just dropped).
- **Replay.** A phone that comes back (reload, lost connection) sends `bli` with its token and gets
  `rom` with the setup, the seed and the whole `logg`. The kit rebuilds the game from the seed and
  replays every move silently, then draws. Nothing about the match is stored on the phone except the
  room code and the seat token (and, in Admiralen, the phone's own fleet).
- **Illegal moves** are not checked by the room. Every phone's rules ignore a move that is not
  legal (wrong seat, wrong turn, impossible) in the same way, so a broken or hostile client cannot
  split the match.
- **Dice** (Brikka, Terninga): the value of a throw is `R.rng(fro ^ hash(n))` for the move at place
  `n`, so every phone gets the same throw. (A modified client could compute a coming throw from the
  seed; it is a game among friends.)
- **Hidden information** (Admiralen): each phone keeps its fleet to itself. At «Klar» it sends a
  commitment (`SHA-256` of the fleet and a random salt). A shot is a move from the shooter; the
  defender's phone answers it with a move (`miss`, `hit`, or `sunk` with that ship's cells). When the
  match ends both phones reveal fleet and salt; each checks the other's commitment and every answer.

## Kit API (`R.nett`, rusj/kit/nett.js)

A game opts in with `"nett": true` in spill.json, an entry in `SPILL` in `nett/src/oppsett.js`,
and a `nett` block in `Rusj.start`:

```js
R.start({
  …,
  nett: {
    min: 2, maks: 2,
    oppsett: (S) => ({ mal: S.oppsett.mal }),        // host's setup, read from the game's own settings
    oppsettTekst: (o) => R.t("Først til {n}", { n: o.mal }),  // one line in the lobby (optional)
    start(S, okt) { S.spill = …; return "spill"; },  // a new match on the online state S; returns the screen
    trekk(S, t, sete, okt) { … },                   // apply one move (also while replaying: okt.gjenspill)
    tur: (S) => seat | null,                         // whose turn (for the bar); null when over
    ferdig: (S) => bool,                             // the rules say the match is over
    etter(S, okt) {},                                // after a live move / after a replay (optional)
  },
});
// in the game: R.nett.aktiv(), R.nett.meg(), R.nett.send(t), R.nett.navn(sete), R.nett.knapp(),
// R.nett.forlat(), R.nett.nyKamp(), R.nett.terning(n) → 1–6 for the move at place n
```

While a match on the net is running the kit swaps in a separate state `S` that is never saved:
the game's own saved state (`rusj.<id>.v1`), its settings and its join codes are untouched, and
come back as they were when the player leaves.
