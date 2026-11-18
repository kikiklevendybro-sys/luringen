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
};

// Limits per message and per socket.
export const MAKS_BYTES = 2048; // one message from a phone, as UTF-8
export const MAKS_TREKK_BYTES = 1024; // one move, as JSON
export const MAKS_OPPSETT_BYTES = 512; // the host's setup, as JSON
export const FART = { antall: 20, ms: 10000 }; // at most 20 messages per 10 s per socket …
export const FART_STENG = 40; // … and a socket that sends 40 in 10 s is closed

// Limits per room.
export const MAKS_KOBLINGER = 10; // open sockets at the same time (seats + phones on their way in)
export const MAKS_TREKK = 2000; // moves in one match
export const MAKS_NAVN = 16; // characters in a nickname
export const REAKSJONER = 6; // preset emoji, sent as their number 0–5 (the client draws them)

// Deletion: everything goes 24 hours after the last activity (an alarm), at once when everyone
// has left a finished match, and 10 minutes after a code was made if nobody opened the room.
export const LEVETID_MS = 24 * 60 * 60 * 1000;
export const RESERVERT_MS = 10 * 60 * 1000;
