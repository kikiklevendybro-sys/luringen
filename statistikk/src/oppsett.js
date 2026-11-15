// Configuration for the rusj statistics Worker. No secrets here.
// Change a value, run the tests (`npm test` in this folder), deploy again.

// The only website allowed to send counts.
export const OPPRINNELSER = ["https://rusj.no"];

// The games and the daily puzzles. The list is written from the repository's own game files:
//   node statistikk/oppdater-spilliste.mjs
// A game that is missing is still counted as a page view (under «andre sider»), but its starts,
// finishes and dailies are dropped until the list is updated and the Worker deployed again.
export { SPILL, DAGLIGE } from "./spilliste.js";

// Limits for one request to POST /t.
export const MAKS_BYTES = 1024; // body size
export const MAKS_NOKLER = 16; // counter names in one batch
export const MAKS_NOKKEL_LENGDE = 40; // characters in one counter name

// Daily counters are kept this many months, then deleted by the scheduled job.
export const OPPBEVARING_MND = 25;

// The dashboard always reads this many days of daily counters (enough for «previous month», the
// 8-week sparklines and new games). Longer periods add whole months from table maned.
export const DAGER_TILBAKE = 62;

// The CSV export gives at most this many days at a time (25 months is about 761).
export const MAKS_EKSPORT_DAGER = 800;

// The rooms Worker for playing on the net: the dashboard asks its health text (GET / →
// «rusj-nett: ok») and waits at most this long. The only request this Worker ever makes; it carries
// nothing about anyone. Empty = no check.
export const NETT_HELSE = "https://rusj-nett.kikiklevendybro.workers.dev/";
export const HELSE_FRIST_MS = 2500;

// The admin key (ADMIN_NOKKEL) must be at least this long, or the key login stays closed.
export const MIN_ADMIN_NOKKEL = 32;
