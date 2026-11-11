// rusj-statistikk — anonymous counters for rusj.no.
//
//   POST /t                 a phone reports a few counter names; each adds 1 to (day, name)
//   GET  /admin             the owner's dashboard (Cloudflare Access, or the admin key)
//   GET  /admin/data.json   the same numbers as JSON (same protection)
//   GET  /                  health text
//   cron                    deletes counters older than the retention limit
//
// Privacy by construction: the only thing a request can change is a counter whose name is in the
// grammar in nokler.js, on today's date as this Worker sees it. This file never reads the
// caller's address, browser name or referrer, sets no cookie and writes no log line
// (test/personvern.test.mjs checks the source for exactly that).
import { OPPRINNELSER, MAKS_BYTES, MAKS_NOKLER, OPPBEVARING_MND, DAGER_TILBAKE, MIN_ADMIN_NOKKEL } from "./oppsett.js";
import { tolkPakke, gyldigeNokler } from "./nokler.js";
import { osloDag, osloKlokke, flytt, maanederFor } from "./dato.js";
import { sammendrag } from "./tall.js";
import { adminSide } from "./side.js";

export const SQL = {
  tell: "INSERT INTO teller (dag, nokkel, n) VALUES (?1, ?2, 1) ON CONFLICT (dag, nokkel) DO UPDATE SET n = n + 1",
  les: "SELECT dag, nokkel, n FROM teller WHERE dag >= ?1 AND dag <= ?2",
  forste: "SELECT MIN(dag) AS forste FROM teller",
  rydd: "DELETE FROM teller WHERE dag < ?1",
};

const FELLES = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

const tekst = (innhold, status = 200, ekstra = {}) => new Response(innhold, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...FELLES, ...ekstra } });

// ---------- POST /t ----------

// https://rusj.no always. http://localhost and http://127.0.0.1 (any port) only when the variable
// LOKAL is "1", which is set in .dev.vars for local testing and never in production.
export function tillattOpprinnelse(opprinnelse, env) {
  if (typeof opprinnelse !== "string") return false;
  if (OPPRINNELSER.includes(opprinnelse)) return true;
  return !!env && env.LOKAL === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(opprinnelse);
}

// Reads at most `maks` bytes of the body as UTF-8. Returns null when it is longer or not text.
// (A second lock on the size: it holds even if the Content-Length header should be wrong.)
export async function lesKropp(request, maks) {
  if (!request.body) return "";
  const leser = request.body.getReader();
  const biter = [];
  let lengde = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    lengde += value.byteLength;
    if (lengde > maks) {
      await leser.cancel();
      return null;
    }
    biter.push(value);
  }
  const alt = new Uint8Array(lengde);
  let pos = 0;
  for (const bit of biter) {
    alt.set(bit, pos);
    pos += bit.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(alt);
  } catch (e) {
    return null;
  }
}

async function taImot(request, env, naa) {
  const opprinnelse = request.headers.get("Origin");
  const tillatt = tillattOpprinnelse(opprinnelse, env);
  const cors = tillatt ? { "Access-Control-Allow-Origin": opprinnelse, Vary: "Origin" } : { Vary: "Origin" };

  if (request.method === "OPTIONS") {
    if (!tillatt) return tekst("Ikke tillatt.", 403, cors);
    return new Response(null, { status: 204, headers: { ...FELLES, ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
  }
  if (request.method !== "POST") return tekst("Bare POST.", 405, { ...cors, Allow: "POST, OPTIONS" });
  if (!tillatt) return tekst("Ikke tillatt.", 403, cors);

  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "text/plain") return tekst("Bare text/plain.", 415, cors);
  // The size is decided from the Content-Length header, before any of the body is read. Browsers
  // always send it for a body like ours; a request without it is refused unread.
  const lengde = request.headers.get("Content-Length");
  if (lengde === null || !/^\d{1,9}$/.test(lengde)) return tekst("Mangler lengde.", 411, cors);
  if (Number(lengde) > MAKS_BYTES) return tekst("For stort.", 413, cors);

  // Optional brake on the whole endpoint (wrangler.toml, [[ratelimits]]). The key is a constant:
  // it counts requests, not who sends them.
  if (env.FART) {
    const { success } = await env.FART.limit({ key: "t" });
    if (!success) return tekst("For mange på en gang.", 429, cors);
  }

  const kropp = await lesKropp(request, MAKS_BYTES);
  if (kropp === null) return tekst("For stort.", 413, cors);
  const sendt = tolkPakke(kropp, MAKS_NOKLER);
  if (sendt === null) return tekst("Ugyldig.", 400, cors);

  const nokler = gyldigeNokler(sendt);
  if (nokler.length > 0) {
    const dag = osloDag(naa);
    const tell = env.DB.prepare(SQL.tell);
    try {
      await env.DB.batch(nokler.map((nokkel) => tell.bind(dag, nokkel)));
    } catch (e) {
      return tekst("Prøv igjen senere.", 503, cors);
    }
  }
  // Same answer whether the names were counted or dropped.
  return new Response(null, { status: 204, headers: { ...FELLES, ...cors } });
}

// ---------- Admin ----------

// Compares two texts without leaking, through timing, how much of them matched: both are hashed
// to 32 bytes first, and every byte is always compared.
export async function likTid(a, b) {
  const kode = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", kode.encode(String(a))), crypto.subtle.digest("SHA-256", kode.encode(String(b)))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let ulik = 0;
  for (let i = 0; i < x.length; i++) ulik |= x[i] ^ y[i];
  return ulik === 0;
}

export const nokkelPaa = (env) => typeof env.ADMIN_NOKKEL === "string" && env.ADMIN_NOKKEL.length >= MIN_ADMIN_NOKKEL;

// Who may see the numbers. Returns "access", "nokkel" or null. Closed unless one of these holds:
//  1. Cloudflare Access let the request through (ctx.access is set by Cloudflare, never by the
//     caller) for the Access application named in ACCESS_AUD.
//  2. The header X-Admin-Nokkel equals the secret ADMIN_NOKKEL (at least 32 characters).
// The key is only read from the header. A key in the address is ignored, so it cannot end up in
// browser history or logs.
export async function adminInnlogging(request, env, ctx, lik = likTid) {
  const access = ctx && ctx.access;
  if (access && typeof env.ACCESS_AUD === "string" && env.ACCESS_AUD.length >= 16 && [].concat(access.aud).includes(env.ACCESS_AUD)) return "access";
  if (!nokkelPaa(env)) return null;
  const gitt = request.headers.get("X-Admin-Nokkel");
  if (typeof gitt !== "string" || gitt.length < 1 || gitt.length > 200) return null;
  return (await lik(gitt, env.ADMIN_NOKKEL)) ? "nokkel" : null;
}

export async function hentSammendrag(db, naa) {
  const iDag = osloDag(naa);
  const [rader, forste] = await db.batch([db.prepare(SQL.les).bind(flytt(iDag, -DAGER_TILBAKE), iDag), db.prepare(SQL.forste)]);
  const forsteDag = (forste.results && forste.results[0] && forste.results[0].forste) || null;
  return sammendrag(rader.results || [], iDag, { forsteDag });
}

function lagNonce() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b));
}

async function admin(request, env, ctx, naa, sti) {
  if (request.method !== "GET" && request.method !== "HEAD") return tekst("Bare GET.", 405, { Allow: "GET, HEAD" });
  const innlogging = await adminInnlogging(request, env, ctx);
  const status = innlogging ? 200 : 401;

  if (sti === "/admin/data.json") {
    const hode = { "Content-Type": "application/json; charset=utf-8", ...FELLES, "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY" };
    if (!innlogging) return new Response(JSON.stringify({ feil: "ikke innlogget" }), { status, headers: { ...hode, "WWW-Authenticate": "X-Admin-Nokkel" } });
    const data = await hentSammendrag(env.DB, naa);
    return new Response(JSON.stringify({ hentet: naa.toISOString(), oppbevaringMaaneder: OPPBEVARING_MND, ...data }), { status, headers: hode });
  }

  const nonce = lagNonce();
  const data = innlogging ? await hentSammendrag(env.DB, naa) : null;
  const html = adminSide({ data, nonce, klokke: osloKlokke(naa), innlogging, nokkelPaa: nokkelPaa(env) });
  // The dashboard has no script. The login page has one inline script and may fetch /admin.
  const csp = ["default-src 'none'", `style-src 'nonce-${nonce}'`, ...(innlogging ? [] : [`script-src 'nonce-${nonce}'`, "connect-src 'self'"]), "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join("; ");
  return new Response(request.method === "HEAD" ? null : html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...FELLES,
      "Content-Security-Policy": csp,
      "X-Frame-Options": "DENY",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Strict-Transport-Security": "max-age=31536000",
      ...(innlogging ? {} : { "WWW-Authenticate": "X-Admin-Nokkel" }),
    },
  });
}

// ---------- Retention ----------

// Deletes every counter older than OPPBEVARING_MND months. Returns the limit that was used.
export async function ryddGamle(db, naa) {
  const grense = maanederFor(osloDag(naa), OPPBEVARING_MND);
  await db.prepare(SQL.rydd).bind(grense).run();
  return grense;
}

// ---------- Routing ----------

export async function handter(request, env, ctx, naa = new Date()) {
  const sti = new URL(request.url).pathname;
  if (sti === "/t") return taImot(request, env, naa);
  if (sti === "/admin" || sti === "/admin/data.json") return admin(request, env, ctx, naa, sti);
  if (sti === "/robots.txt") return tekst("User-agent: *\nDisallow: /\n");
  if (sti === "/") return tekst("rusj-statistikk: ok\n");
  return tekst("Fant ikke siden.\n", 404);
}

export default {
  fetch: (request, env, ctx) => handter(request, env, ctx),
  scheduled: (hendelse, env, ctx) => ctx.waitUntil(ryddGamle(env.DB, new Date())),
};
