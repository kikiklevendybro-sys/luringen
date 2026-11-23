// The pure parts of the room protocol: reading a message from a phone, cleaning a nickname,
// checking a setup, a seed and a move. No storage, no sockets (test/protokoll.test.mjs).
import { MAKS_BYTES, MAKS_TREKK_BYTES, MAKS_OPPSETT_BYTES, MAKS_NAVN, REAKSJONER, SPILL } from "./oppsett.js";

const kode = new TextEncoder();
export const bytes = (tekst) => kode.encode(tekst).length;

// The kinds of message a phone may send, and nothing else.
export const HENDELSER = new Set(["lag", "bli", "start", "trekk", "reaksjon", "ferdig", "ny", "forlat"]);

// A message as text → an object with a known `h`, or a reason it was refused.
export function lesMelding(melding) {
  if (typeof melding !== "string") return { feil: "ugyldig" };
  if (melding.length > MAKS_BYTES || bytes(melding) > MAKS_BYTES) return { feil: "stor" };
  let m;
  try {
    m = JSON.parse(melding);
  } catch (e) {
    return { feil: "ugyldig" };
  }
  if (!m || typeof m !== "object" || Array.isArray(m) || !HENDELSER.has(m.h)) return { feil: "ugyldig" };
  return { m };
}

// A nickname is plain text: no control or direction characters, spaces folded, at most 16
// characters. Empty is fine (the phones then say «Spiller 2»). The joiner and the emoji variation
// selectors stay, so «👩‍🚀» and «❤️» survive.
const USYNLIG = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b\u200c\u200e\u200f\u2028-\u202e\u2060-\u206f\u3164\ufeff\uffa0\ufff0-\uffff]/g;
export function rensNavn(navn) {
  if (typeof navn !== "string") return "";
  const ren = navn.slice(0, 200).normalize("NFC").replace(USYNLIG, "").replace(/\s+/g, " ").trim();
  return Array.from(ren).slice(0, MAKS_NAVN).join("").trim();
}

export const erFro = (fro) => Number.isInteger(fro) && fro >= 0 && fro <= 0xffffffff;

export const kjentSpill = (id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(SPILL, id);

// The host's setup: a small plain object (the phones check what is in it).
export function gyldigOppsett(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  try {
    return bytes(JSON.stringify(o)) <= MAKS_OPPSETT_BYTES;
  } catch (e) {
    return false;
  }
}

// A move: any JSON value up to 1 KB. The room never looks inside; the phones' game rules do.
export function gyldigTrekk(t) {
  if (t === undefined) return false;
  // The key «$» is the room's own (the «borte» move for a seat that left): never from a phone.
  if (t !== null && typeof t === "object" && Object.prototype.hasOwnProperty.call(t, "$")) return false;
  try {
    const s = JSON.stringify(t);
    return typeof s === "string" && bytes(s) <= MAKS_TREKK_BYTES;
  } catch (e) {
    return false;
  }
}

export const gyldigReaksjon = (e) => Number.isInteger(e) && e >= 0 && e < REAKSJONER;

// A random seat token: 16 bytes in base64url (22 signs). It only ever goes to the phone that got
// the seat, so that phone can take its seat back after a lost connection.
export function nyttToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const erToken = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{22}$/.test(t);
