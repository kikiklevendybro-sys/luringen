// Dates. A «day» is always the calendar day in Norway (Europe/Oslo), written "2026-11-11".
// Day numbers count days since 1 January 1970, the same way as R.dag().nr in the rusj kit.

const to = (n) => String(n).padStart(2, "0");

// The Oslo date at a moment in time.
export function osloDag(tidspunkt) {
  const deler = {};
  for (const d of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(tidspunkt)) {
    deler[d.type] = Number(d.value);
  }
  return `${deler.year}-${to(deler.month)}-${to(deler.day)}`;
}

// The Oslo clock at a moment in time, "14:05".
export function osloKlokke(tidspunkt) {
  const deler = {};
  for (const d of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(tidspunkt)) {
    deler[d.type] = Number(d.value);
  }
  return `${to(deler.hour)}:${to(deler.minute)}`;
}

export function dagNr(dag) {
  const [a, m, d] = dag.split("-").map(Number);
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
}

export function fraNr(nr) {
  const d = new Date(nr * 86400000);
  return `${d.getUTCFullYear()}-${to(d.getUTCMonth() + 1)}-${to(d.getUTCDate())}`;
}

export const flytt = (dag, antall) => fraNr(dagNr(dag) + antall);

// The days from `fra` to `til`, both included, oldest first.
export function dagene(fra, til) {
  const ut = [];
  for (let nr = dagNr(fra); nr <= dagNr(til); nr++) ut.push(fraNr(nr));
  return ut;
}

// Monday of the week the day is in (weeks run Monday–Sunday; day number 4 was a Monday).
export const ukeStart = (dag) => fraNr(dagNr(dag) - ((dagNr(dag) + 3) % 7));
export const maanedStart = (dag) => dag.slice(0, 8) + "01";

// The same day of the month `maaneder` months earlier, as text. It is only used as a limit in
// «older than», so a date like 2024-02-31 that does not exist still sorts in the right place.
export function maanederFor(dag, maaneder) {
  const [a, m, d] = dag.split("-").map(Number);
  const mnd = a * 12 + (m - 1) - maaneder;
  return `${Math.floor(mnd / 12)}-${to((mnd % 12) + 1)}-${to(d)}`;
}

const UKEDAGER = ["man", "tir", "ons", "tor", "fre", "lør", "søn"];
const MAANEDER = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const MAANEDER_LANG = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

export const ukedag = (dag) => UKEDAGER[(dagNr(dag) + 3) % 7];
// "11. nov"
export const kortDato = (dag) => `${Number(dag.slice(8))}. ${MAANEDER[Number(dag.slice(5, 7)) - 1]}`;
// "11. november"
export const langDato = (dag) => `${Number(dag.slice(8))}. ${MAANEDER_LANG[Number(dag.slice(5, 7)) - 1]}`;
export const maanedNavn = (dag) => MAANEDER_LANG[Number(dag.slice(5, 7)) - 1];
