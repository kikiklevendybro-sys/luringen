#!/usr/bin/env node
// «Mest spilt nå»: fetches the last 30 days from the statistics Worker (the numbers behind «Mest
// spilt» on the owner's dashboard) and writes rusj/topp.json – the ids of the most started games,
// the most started first, at most ten. Ids only: no number is ever published. The build shows the
// first five an edition has, never an 18+ game, and no row at all with fewer than three
// (lesTopp and toppSpill in scripts/rusj.mjs).
//   node scripts/topp.mjs        then build, look at the front page, and commit rusj/topp.json
// Reads the database through Cloudflare's API when CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
// are in .env (hentToppD1); otherwise it asks the Worker's /admin/data.json with the admin key.
// Needs RUSJ_ADMIN_NOKKEL in .env at the root of the repository (or in the environment). The key
// goes only into the X-Admin-Nokkel header of one GET to STAT_ADRESSE, and is never printed.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STAT_ADRESSE, statOpprinnelse } from "./rusj.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MAKS = 10;
// A game joins the list only after this many starts in 30 days: below it the order is chance.
export const MIN_STARTER = 10;

// One value from the text of a .env file: NAME=value, NAME="value", export NAME=value, # comments.
export function lesEnv(tekst, navn) {
  for (const linje of String(tekst).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linje);
    if (!m || m[1] !== navn) continue;
    const v = m[2].trim();
    return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v.replace(/\s+#.*$/, "");
  }
  return "";
}

// Every game id on rusj.no: the folders in rusj/spill, and Luringen.
export function kjenteSpill(rot) {
  const mappe = join(rot, "rusj/spill");
  const ider = existsSync(mappe) ? readdirSync(mappe).filter((id) => existsSync(join(mappe, id, "spill.json"))) : [];
  return new Set(["luringen", ...ider]);
}

// The ids of the most started games of the last 30 days, most first, from the answer of
// /admin/data.json (perioder → id "d30" → spill: [{ id, startet, … }]). Only games that exist and
// were started at least once; at most ten.
export function toppFraData(data, kjente) {
  const d30 = data && Array.isArray(data.perioder) ? data.perioder.find((p) => p && p.id === "d30") : null;
  if (!d30 || !Array.isArray(d30.spill)) throw new Error("Svaret fra statistikken har ikke «Siste 30 dager» med spill (perioder → d30 → spill)");
  const ut = [];
  d30.spill
    .map((s, i) => ({ id: s && s.id, startet: Number(s && s.startet) || 0, i }))
    .filter((s) => typeof s.id === "string" && kjente.has(s.id) && s.startet > 0)
    .sort((a, b) => b.startet - a.startet || a.i - b.i)
    .forEach((s) => {
      if (!ut.includes(s.id)) ut.push(s.id);
    });
  return ut.slice(0, MAKS);
}

const osloDag = (dato) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(dato);

// Fetches and returns { oppdatert, spill }. hent: fetch (a fake one in the tests).
export async function hentTopp({ rot = ROT, env = process.env, hent = globalThis.fetch, adresse = STAT_ADRESSE, idag = new Date() } = {}) {
  const envFil = join(rot, ".env");
  const nokkel = (env && env.RUSJ_ADMIN_NOKKEL) || (existsSync(envFil) ? lesEnv(readFileSync(envFil, "utf8"), "RUSJ_ADMIN_NOKKEL") : "");
  if (!nokkel) throw new Error("Fant ikke RUSJ_ADMIN_NOKKEL i .env i roten av repoet (eller i miljøet).");
  const opprinnelse = statOpprinnelse(adresse);
  if (!opprinnelse) throw new Error("STAT_ADRESSE i scripts/rusj.mjs er tom: statistikken er slått av.");
  let svar;
  try {
    svar = await hent(`${opprinnelse}/admin/data.json`, { method: "GET", headers: { "X-Admin-Nokkel": nokkel, Accept: "application/json" }, redirect: "error", cache: "no-store" });
  } catch (e) {
    throw new Error(`Fikk ikke kontakt med statistikken på ${opprinnelse}.`);
  }
  if (svar.status === 401 || svar.status === 403) throw new Error(`Statistikken godtok ikke nøkkelen (HTTP ${svar.status}). Sjekk RUSJ_ADMIN_NOKKEL i .env.`);
  if (!svar.ok) throw new Error(`Statistikken svarte HTTP ${svar.status}.`);
  let data;
  try {
    data = await svar.json();
  } catch (e) {
    throw new Error("Svaret fra statistikken var ikke JSON.");
  }
  const oppdatert = typeof data.iDag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.iDag) ? data.iDag : osloDag(idag);
  return { oppdatert, spill: toppFraData(data, kjenteSpill(rot)) };
}

// The same list read straight from the D1 database through Cloudflare's API. /admin/data.json sits
// behind Cloudflare Access, which stops a script at the door before the Worker sees the key; the
// API token that deploys the Worker can read the table. Needs CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID in .env (never printed); the database id is in statistikk/wrangler.toml.
export async function hentToppD1({ rot = ROT, env = process.env, hent = globalThis.fetch, idag = new Date() } = {}) {
  const envFil = join(rot, ".env");
  const envTekst = existsSync(envFil) ? readFileSync(envFil, "utf8") : "";
  const verdi = (navn) => (env && env[navn]) || lesEnv(envTekst, navn);
  const token = verdi("CLOUDFLARE_API_TOKEN");
  const konto = verdi("CLOUDFLARE_ACCOUNT_ID");
  if (!token || !konto) return null;
  const toml = readFileSync(join(rot, "statistikk/wrangler.toml"), "utf8");
  const db = (/^\s*database_id\s*=\s*"([0-9a-f-]{36})"/m.exec(toml) || [])[1];
  if (!db || !/^[0-9a-f]{32}$/.test(konto)) throw new Error("Fant ikke database_id i statistikk/wrangler.toml eller en gyldig CLOUDFLARE_ACCOUNT_ID.");
  const iDag = osloDag(idag);
  const fra = new Date(Date.parse(iDag + "T12:00:00Z") - 29 * 864e5).toISOString().slice(0, 10);
  const sql = "SELECT substr(nokkel, 7) AS id, SUM(n) AS startet FROM teller WHERE nokkel LIKE 'start.%' AND dag >= ?1 AND dag <= ?2 GROUP BY nokkel ORDER BY startet DESC, nokkel LIMIT 60";
  let svar;
  try {
    svar = await hent(`https://api.cloudflare.com/client/v4/accounts/${konto}/d1/database/${db}/query`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params: [fra, iDag] }),
      cache: "no-store",
    });
  } catch (e) {
    throw new Error("Fikk ikke kontakt med Cloudflares API.");
  }
  if (svar.status === 401 || svar.status === 403) throw new Error(`Cloudflare godtok ikke API-nøkkelen (HTTP ${svar.status}). Sjekk CLOUDFLARE_API_TOKEN i .env.`);
  if (!svar.ok) throw new Error(`Cloudflares API svarte HTTP ${svar.status}.`);
  const data = await svar.json().catch(() => null);
  const rader = data && data.success && Array.isArray(data.result) && data.result[0] && Array.isArray(data.result[0].results) ? data.result[0].results : null;
  if (!rader) throw new Error("Uventet svar fra Cloudflares API.");
  const nok = rader.filter((r) => Number(r.startet) >= MIN_STARTER);
  return { oppdatert: iDag, spill: toppFraData({ perioder: [{ id: "d30", spill: nok }] }, kjenteSpill(rot)) };
}

export function skrivTopp(rot, topp) {
  const fil = join(rot, "rusj/topp.json");
  writeFileSync(fil, JSON.stringify({ oppdatert: topp.oppdatert, spill: topp.spill }, null, 2) + "\n");
  return fil;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const topp = (await hentToppD1()) || (await hentTopp());
    skrivTopp(ROT, topp);
    console.log(`✓ rusj/topp.json: ${topp.spill.length} spill, oppdatert ${topp.oppdatert}${topp.spill.length ? ` (${topp.spill.join(", ")})` : ""}`);
    if (topp.spill.length < 3) console.log("  Færre enn tre spill: raden «Mest spilt nå» vises ikke ennå.");
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
}
