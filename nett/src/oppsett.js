// Configuration for the rusj-nett Worker. No secrets here.
// Change a value, run the tests (`npm test` in this folder), deploy again.

// The only website allowed to open rooms. http://localhost and http://127.0.0.1 are let in only
// when the variable LOKAL is "1" (.dev.vars, for local testing; never in production).
export const OPPRINNELSER = ["https://rusj.no"];

// Room codes: 6 signs from an alphabet without look-alikes (no 0/O, 1/I/L). 31^6 ≈ 887 million.
export const ALFABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const KODE_LENGDE = 6;
export const KODE = new RegExp(`^[${ALFABET}]{${KODE_LENGDE}}$`);

// The games that can be played on the net: [fewest, most] seats.
export const SPILL = {
  sjakkhesten: [2, 2],
  fireren: [2, 2],
  admiralen: [2, 2],
  brikka: [2, 4],
  terninga: [2, 6],
  reversi: [2, 2],
  bonden: [2, 2],
  molla: [2, 2],
  samannen: [2, 2],
  snekkeren: [2, 2],
  dam: [2, 2],
  stigespillet: [2, 4],
  lykkegrisen: [2, 8],
  tavla: [2, 2],
  hopperen: [2, 6],
  dobbelsekseren: [2, 4],
  lasesmeden: [2, 2],
  meyer: [2, 10],
  elefanten: [2, 4],
  tidsmaskinen: [2, 10],
  tieren: [2, 8],
  vriatter: [2, 4],
  narren: [2, 4],
  samleren: [2, 4],
  golfballen: [2, 4],
  pusen: [2, 4],
};

// Games where a player who leaves on purpose is skipped and the others play on (party games with
// many seats). The room then adds a move `{ "$": "borte" }` from that seat to the list, so every
// phone takes the seat out at the same place in the match; when fewer than the game's minimum (and
// never fewer than 2) are left, the match is over as in every other game.
export const FORTSETT = new Set(["hopperen", "dobbelsekseren", "meyer", "elefanten", "tidsmaskinen", "tieren", "vriatter", "narren", "samleren", "golfballen", "pusen"]);

// Limits per message and per socket.
export const MAKS_BYTES = 2048; // one message from a phone, as UTF-8
export const MAKS_TREKK_BYTES = 1024; // one move, as JSON
export const MAKS_OPPSETT_BYTES = 512; // the host's setup, as JSON
export const FART = { antall: 20, ms: 10000 }; // at most 20 messages per 10 s per socket …
export const FART_STENG = 40; // … and a socket that sends 40 in 10 s is closed

// Limits per room.
export const MAKS_KOBLINGER = 22; // open sockets at the same time (seats + phones on their way in; party games seat up to 20)
export const MAKS_TREKK = 2000; // moves in one match
export const MAKS_NAVN = 16; // characters in a nickname
export const REAKSJONER = 6; // preset emoji, sent as their number 0–5 (the client draws them)

// Deletion: everything goes 24 hours after the last activity (an alarm), at once when everyone
// has left a finished match, and 10 minutes after a code was made if nobody opened the room.
export const LEVETID_MS = 24 * 60 * 60 * 1000;
export const RESERVERT_MS = 10 * 60 * 1000;
