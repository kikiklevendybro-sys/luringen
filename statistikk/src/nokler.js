// The grammar of counter names. This is the whole vocabulary of the statistics: a request can
// only add 1 to a counter whose name is built here. There is no field for free text, ids,
// addresses or anything else, so none of that can be stored.
//
//   side.<side>      a page was opened; <side> is "forside", "annet" or a game id
//   besok            a visit began (the phone decides: 30 minutes of silence ends a visit)
//   enhet.<nar>      first page of the day on this phone; <nar> says when it was last here:
//                    ny (never) · igar (yesterday) · uke (2–7 days ago) · lenge (8 days or more)
//   unik.uke         first page this week (Monday–Sunday) on this phone
//   unik.mnd         first page this calendar month on this phone
//   app              sent with enhet.*: rusj was opened from the home screen (installed)
//   tid.<min>        the visit has now lasted <min> minutes on screen: 1, 3, 10 or 30
//   start.<spill>    a round was started
//   ferdig.<spill>   a round was finished
//   daglig.<spill>   today's daily puzzle was finished in this game
//   dagens.<n>       this phone has now finished <n> of today's daily puzzles (1–9)
//   rekke.<fra>      sent with dagens.1: days in a row, as a group: 1, 2 (2–3), 4 (4–6),
//                    7 (7–13), 14 (14–29) or 30 (30 or more)
import { SPILL, MAKS_NOKKEL_LENGDE } from "./oppsett.js";

export const SPILL_ID = /^[a-z0-9]{2,24}$/;

export const ENHET = ["ny", "igar", "uke", "lenge"];
export const TID_MINUTTER = [1, 3, 10, 30];
export const REKKE_FRA = [1, 2, 4, 7, 14, 30];
export const DAGENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const ANDRE_SIDER = ["forside", "annet"];

const har = (objekt, id) => Object.prototype.hasOwnProperty.call(objekt, id);

// Counter names that carry no game id.
export function fasteNokler() {
  return [
    "besok",
    ...ENHET.map((n) => "enhet." + n),
    "unik.uke",
    "unik.mnd",
    "app",
    ...TID_MINUTTER.map((m) => "tid." + m),
    ...DAGENS.map((n) => "dagens." + n),
    ...REKKE_FRA.map((r) => "rekke." + r),
  ];
}

const FASTE = new Set(fasteNokler());

// Every counter name the Worker can store (for tests and documentation).
export function alleNokler(oppsett = { SPILL }) {
  const spill = Object.keys(oppsett.SPILL);
  return [
    ...fasteNokler(),
    ...ANDRE_SIDER.map((s) => "side." + s),
    ...spill.flatMap((id) => ["side." + id, "start." + id, "ferdig." + id, "daglig." + id]),
  ];
}

// Returns the counter name to store, or null when the name is not in the grammar.
// A page id that looks like an id but is not a known game is stored as "side.annet": the page
// view is kept, the unknown word is not.
export function renNokkel(nokkel, oppsett = { SPILL }) {
  if (typeof nokkel !== "string" || nokkel.length < 1 || nokkel.length > MAKS_NOKKEL_LENGDE) return null;
  if (FASTE.has(nokkel)) return nokkel;
  const deler = nokkel.split(".");
  if (deler.length !== 2) return null;
  const [type, id] = deler;
  if (!SPILL_ID.test(id)) return null;
  const erSpill = har(oppsett.SPILL, id);
  if (type === "side") return erSpill || ANDRE_SIDER.includes(id) ? nokkel : "side.annet";
  // (daglig.<spill> is accepted for every game: which games are dailies changes on the site, and
  // a new daily should be counted from its first day.)
  if (type === "start" || type === "ferdig" || type === "daglig") return erSpill ? nokkel : null;
  return null;
}

// Parses the body of POST /t: {"v":1,"k":["side.forside","besok"]}.
// Returns the list of names exactly as sent, or null when the envelope is not exactly that shape.
export function tolkPakke(tekst, maksNokler) {
  let pakke;
  try {
    pakke = JSON.parse(tekst);
  } catch (e) {
    return null;
  }
  if (pakke === null || typeof pakke !== "object" || Array.isArray(pakke)) return null;
  const felt = Object.keys(pakke);
  if (felt.length !== 2 || !felt.includes("v") || !felt.includes("k")) return null;
  if (pakke.v !== 1 || !Array.isArray(pakke.k)) return null;
  if (pakke.k.length < 1 || pakke.k.length > maksNokler) return null;
  for (const k of pakke.k) if (typeof k !== "string" || k.length > MAKS_NOKKEL_LENGDE) return null;
  return pakke.k;
}

// The names to count from one batch: valid, normalised, each at most once.
export function gyldigeNokler(nokler, oppsett) {
  const ut = new Set();
  for (const k of nokler) {
    const ren = renNokkel(k, oppsett);
    if (ren) ut.add(ren);
  }
  return [...ut];
}
