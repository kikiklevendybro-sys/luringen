// rusj-nett — rooms for playing a rusj.no game on two or more phones.
//
//   POST /rom          a fresh room code (6 signs), from https://rusj.no only
//   GET  /rom/<kode>   WebSocket upgrade: into the room (one Durable Object per code, in the EU)
//   GET  /             health text
//
// The Worker only checks the origin and the code and hands the socket to the room (rom.js). It
// never reads the caller's address, browser name or referrer, sets no cookie and writes no log
// line (test/personvern.test.mjs checks the source for exactly that).
import { OPPRINNELSER, ALFABET, KODE_LENGDE, KODE } from "./oppsett.js";

export { Rom } from "./rom.js";

const FELLES = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

const tekst = (innhold, status = 200, ekstra = {}) => new Response(innhold, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...FELLES, ...ekstra } });

// https://rusj.no always. http://localhost and http://127.0.0.1 (any port) only when the variable
// LOKAL is "1", which is set in .dev.vars for local testing and never in production.
export function tillattOpprinnelse(opprinnelse, env) {
  if (typeof opprinnelse !== "string") return false;
  if (OPPRINNELSER.includes(opprinnelse)) return true;
  return !!env && env.LOKAL === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(opprinnelse);
}

// A random code from the alphabet. 256 is a multiple of neither 31 nor anything close, so bytes
// at or above 248 (8 × 31) are thrown away to keep every sign equally likely.
export function nyKode() {
  let ut = "";
  while (ut.length < KODE_LENGDE) {
    for (const b of crypto.getRandomValues(new Uint8Array(KODE_LENGDE * 2))) {
      if (b < 248 && ut.length < KODE_LENGDE) ut += ALFABET[b % 31];
    }
  }
  return ut;
}

// Every room lives in the EU: the stub always comes from the jurisdiction subnamespace. Only the
// local simulator (`wrangler dev`, which has no jurisdictions and says so by throwing) falls back
// to the plain namespace, and only with LOKAL="1"; on Cloudflare the EU call never throws.
export const romFor = (env, kode) => {
  let ns;
  try {
    ns = env.ROM.jurisdiction("eu");
  } catch (e) {
    if (env.LOKAL !== "1") throw e;
    ns = env.ROM;
  }
  return ns.get(ns.idFromName(kode));
};

async function lagRom(request, env, cors) {
  // Optional brake on the whole endpoint (wrangler.toml, [[ratelimits]]). The key is a constant:
  // it counts requests, not who sends them.
  if (env.FART) {
    const { success } = await env.FART.limit({ key: "rom" });
    if (!success) return tekst("For mange på en gang.", 429, cors);
  }
  // A code that is in use already is never handed out: the room says no and we draw again.
  for (let forsok = 0; forsok < 5; forsok++) {
    const kode = nyKode();
    let svar;
    try {
      svar = await romFor(env, kode).fetch("https://rom/reserver", { method: "POST" });
    } catch (e) {
      return tekst("Prøv igjen senere.", 503, cors);
    }
    if (svar.status === 201) return new Response(JSON.stringify({ kode }), { status: 201, headers: { "Content-Type": "application/json; charset=utf-8", ...FELLES, ...cors } });
  }
  return tekst("Prøv igjen senere.", 503, cors);
}

export async function handter(request, env) {
  const url = new URL(request.url);
  const sti = url.pathname;
  if (sti === "/") return tekst("rusj-nett: ok\n");
  if (sti === "/robots.txt") return tekst("User-agent: *\nDisallow: /\n");

  if (sti === "/rom") {
    const opprinnelse = request.headers.get("Origin");
    const tillatt = tillattOpprinnelse(opprinnelse, env);
    const cors = tillatt ? { "Access-Control-Allow-Origin": opprinnelse, Vary: "Origin" } : { Vary: "Origin" };
    if (request.method === "OPTIONS") {
      if (!tillatt) return tekst("Ikke tillatt.", 403, cors);
      return new Response(null, { status: 204, headers: { ...FELLES, ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Max-Age": "86400" } });
    }
    if (request.method !== "POST") return tekst("Bare POST.", 405, { ...cors, Allow: "POST, OPTIONS" });
    if (!tillatt) return tekst("Ikke tillatt.", 403, cors);
    return lagRom(request, env, cors);
  }

  const m = /^\/rom\/([^/]+)$/.exec(sti);
  if (m) {
    if (request.method !== "GET") return tekst("Bare GET.", 405, { Allow: "GET" });
    if (!tillattOpprinnelse(request.headers.get("Origin"), env)) return tekst("Ikke tillatt.", 403);
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return tekst("Bare WebSocket.", 426, { Upgrade: "websocket" });
    if (!KODE.test(m[1])) return tekst("Fant ikke rommet.", 404);
    return romFor(env, m[1]).fetch(request);
  }
  return tekst("Fant ikke siden.\n", 404);
}

export default {
  fetch: (request, env) => handter(request, env),
};
