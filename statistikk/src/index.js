// rusj-statistikk — anonymous counters for rusj.no.
//
//   POST /t                 a phone reports a few counter names; each adds 1 to (day, name)
//   GET  /admin             the owner's dashboard (Cloudflare Access, or the admin key);
//                           ?p=7|30|90|365|alt chooses the period, ?sort=… the games table's order
//   GET  /admin/data.json   the same numbers as JSON (same protection)
//   GET  /admin/eksport.csv ?fra=YYYY-MM-DD&til=YYYY-MM-DD: the daily counters as CSV (same)
//   GET  /admin/manifest.webmanifest, /admin/ikon*: «rusj admin» on the home screen (no numbers)
//   GET  /                  health text
//   cron                    deletes counters older than the retention limit, and adds up every
//                           complete month into table maned (schema-2.sql)
//
// Privacy by construction: the only thing a request can change is a counter whose name is in the
// grammar in nokler.js, on today's date as this Worker sees it. This file never reads the
// caller's address, browser name or referrer, sets no cookie and writes no log line
// (test/personvern.test.mjs checks the source for exactly that).
import { OPPRINNELSER, MAKS_BYTES, MAKS_NOKLER, OPPBEVARING_MND, DAGER_TILBAKE, MIN_ADMIN_NOKKEL, MAKS_EKSPORT_DAGER } from "./oppsett.js";
import { tolkPakke, gyldigeNokler } from "./nokler.js";
import { osloDag, osloKlokke, flytt, maanederFor, flyttMnd, manedene, manedSlutt, dagNr, fraNr } from "./dato.js";
import { sammendrag } from "./tall.js";
import { lesValg, periodeFor, vinduStart, planlegg, slaSammen, lagLager, nyeKandidater, byggTavle, MANEDER_I_DIAGRAM } from "./tavle.js";
import { sjekkNett } from "./helse.js";
import { IKON_SVG, IKON_PNG } from "./ikon.js";
import { adminSide } from "./side.js";

export const SQL = {
  tell: "INSERT INTO teller (dag, nokkel, n) VALUES (?1, ?2, 1) ON CONFLICT (dag, nokkel) DO UPDATE SET n = n + 1",
  les: "SELECT dag, nokkel, n FROM teller WHERE dag >= ?1 AND dag <= ?2",
  forste: "SELECT MIN(dag) AS forste FROM teller",
  rydd: "DELETE FROM teller WHERE dag < ?1",
  // Table maned (schema-2.sql): one total per month and counter name, written by the nightly job.
  ryddMnd: "DELETE FROM maned WHERE maned < ?1",
  mndFinnes: "SELECT value AS maned FROM json_each(?1) WHERE EXISTS (SELECT 1 FROM maned WHERE maned.maned = json_each.value)",
  rull: "INSERT INTO maned (maned, nokkel, n) SELECT ?3, nokkel, SUM(n) FROM teller WHERE dag >= ?1 AND dag <= ?2 GROUP BY nokkel ON CONFLICT (maned, nokkel) DO UPDATE SET n = excluded.n",
  // The dashboard. Every read goes by the primary key (one row for MIN/MAX).
  siste: "SELECT MAX(dag) AS siste FROM teller",
  forsteMnd: "SELECT MIN(maned) AS forste FROM maned",
  sisteMnd: "SELECT MAX(maned) AS siste FROM maned",
  lesMnd: "SELECT maned, nokkel, n FROM maned WHERE maned >= ?1 AND maned <= ?2",
  lesMndNokler: "SELECT maned, nokkel, n FROM maned WHERE maned IN (SELECT value FROM json_each(?1)) AND nokkel IN (SELECT value FROM json_each(?2))",
  eksport: "SELECT dag, nokkel, n FROM teller WHERE dag >= ?1 AND dag <= ?2 ORDER BY dag, nokkel",
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

const forsteRad = (svar, felt) => (svar && svar.results && svar.results[0] && svar.results[0][felt]) || null;
// Rows read, as D1 reports it (meta.rows_read), or the rows returned where it does not say.
const lest = (svar) => (svar && svar.meta && Number.isFinite(svar.meta.rows_read) ? svar.meta.rows_read : (svar && svar.results ? svar.results.length : 0));
// The counter names the month chart needs from table maned.
const DIAGRAM_NOKLER = ["besok", "unik.mnd"];

// Everything the dashboard shows for one period (valg: { periode, sort } from the address).
// Round trips: 1) the first and the last day with counters, and the first month in table maned;
// 2) the daily counters of the window and of the odd days at the ends of a long period, the
// monthly totals of the whole months in it, and the chart's names for older months; 3) only when
// needed: the days of months that have no totals yet, and whether «new» games had counters in
// older months. The health of the rooms Worker is asked at the same time.
export async function hentTavle(db, naa, valg = {}, { hent } = {}) {
  const { periode: pid, sort } = lesValg(valg.periode, valg.sort);
  const iDag = osloDag(naa);
  const nett = sjekkNett(hent ? { hent } : {});
  const start = Date.now();
  let rader = 0;

  const [forsteSvar, sisteSvar] = await db.batch([db.prepare(SQL.forste), db.prepare(SQL.siste)]);
  rader += lest(forsteSvar) + lest(sisteSvar);
  const forsteDag = forsteRad(forsteSvar, "forste");
  const sisteDag = forsteRad(sisteSvar, "siste");
  let manedTabell = true;
  let forsteMnd = null;
  let sisteMnd = null;
  try {
    const [f, s] = await db.batch([db.prepare(SQL.forsteMnd), db.prepare(SQL.sisteMnd)]);
    rader += lest(f) + lest(s);
    forsteMnd = forsteRad(f, "forste");
    sisteMnd = forsteRad(s, "siste");
  } catch (e) {
    manedTabell = false; // schema-2.sql not run yet: everything from the daily counters
  }
  const forste = [forsteDag, forsteMnd && forsteMnd + "-01"].filter(Boolean).sort()[0] || null;

  const periode = periodeFor(pid, iDag, forste);
  const W = vinduStart(periode, iDag);
  const omrader = [periode, periode.forrige, { fra: flytt(periode.fra, -1), til: flytt(periode.fra, -1) }].filter(Boolean);
  const plan = planlegg(omrader, W, forste, iDag);
  const maneder = manedTabell ? plan.maneder : [];
  const dagOmrader = slaSammen([[W, iDag], ...plan.dager, ...(manedTabell ? [] : plan.maneder.map((M) => [M + "-01", manedSlutt(M)]))]);
  const denne = iDag.slice(0, 7);
  const tidligst = flyttMnd(denne, -(MANEDER_I_DIAGRAM - 1));
  const fraMnd = forste && forste.slice(0, 7) > tidligst ? forste.slice(0, 7) : tidligst;
  const sisteDiagramMnd = W.endsWith("-01") ? flyttMnd(W.slice(0, 7), -1) : W.slice(0, 7);
  const diagramMnd = manedTabell ? manedene(fraMnd, sisteDiagramMnd).filter((M) => M < denne && !maneder.includes(M)) : [];

  const setninger = dagOmrader.map(([a, b]) => db.prepare(SQL.les).bind(a, b));
  if (maneder.length) setninger.push(db.prepare(SQL.lesMnd).bind(maneder[0], maneder[maneder.length - 1]));
  if (diagramMnd.length) setninger.push(db.prepare(SQL.lesMndNokler).bind(JSON.stringify(diagramMnd), JSON.stringify(DIAGRAM_NOKLER)));
  const svar = await db.batch(setninger);
  for (const s of svar) rader += lest(s);
  const dagRader = svar.slice(0, dagOmrader.length).flatMap((s) => s.results || []);
  const mndRader = svar.slice(dagOmrader.length).flatMap((s) => s.results || []);
  let lager = lagLager({ dagRader, dagOmrader, mndRader, mndHele: maneder, forste });

  // 3) Months with no totals yet (the nightly job has not run since): their days instead. And new
  // games: did they have counters in an older month?
  const utenSum = maneder.filter((M) => !lager.harMnd(M));
  const kandidater = manedTabell ? nyeKandidater(lager, { iDag, W, forste }) : [];
  const ekstraOmrader = utenSum.map((M) => [M + "-01", manedSlutt(M)]);
  const ekstra = ekstraOmrader.map(([a, b]) => db.prepare(SQL.les).bind(a, b));
  const sjekkMnd = forste ? manedene(forste.slice(0, 7), W.slice(0, 7)) : [];
  if (kandidater.length && sjekkMnd.length) ekstra.push(db.prepare(SQL.lesMndNokler).bind(JSON.stringify(sjekkMnd), JSON.stringify(kandidater.flatMap((k) => ["side." + k.id, "start." + k.id]))));
  const gamle = new Set();
  if (ekstra.length) {
    const svar3 = await db.batch(ekstra);
    for (const s of svar3) rader += lest(s);
    const nyeDager = svar3.slice(0, ekstraOmrader.length).flatMap((s) => s.results || []);
    for (const r of svar3.slice(ekstraOmrader.length).flatMap((s) => s.results || [])) {
      const k = kandidater.find((x) => r.nokkel.endsWith("." + x.id));
      if (k && r.maned < k.forsteDag.slice(0, 7)) gamle.add(k.id);
    }
    if (nyeDager.length || ekstraOmrader.length) lager = lagLager({ dagRader: [...dagRader, ...nyeDager], dagOmrader: [...dagOmrader, ...ekstraOmrader], mndRader, mndHele: maneder, forste });
  }
  const dbMs = Date.now() - start;

  const tavle = byggTavle(lager, { iDag, periode, sort, W, gamle });
  const iDagRader = lager.dag(iDag);
  // Last month should be added up by now (the night after it ended), if it had counters.
  const forrigeMnd = flyttMnd(denne, -1);
  const venter = manedTabell && forste && forste.slice(0, 7) <= forrigeMnd && !(sisteMnd >= forrigeMnd) ? [forrigeMnd] : [];
  return {
    sammendrag: sammendrag(dagRader.filter((r) => r.dag >= flytt(iDag, -DAGER_TILBAKE)), iDag, { forsteDag }),
    tavle,
    drift: {
      db: { ok: true, ms: dbMs, rader },
      manedTabell,
      sisteRull: sisteMnd,
      manglerMnd: [...new Set([...tavle.diagram.maned.filter((m) => m.mangler).map((m) => m.dag.slice(0, 7)), ...venter])].sort(),
      sisteDag,
      iDag: [...iDagRader.values()].reduce((a, b) => a + b, 0),
      nett: await nett,
    },
  };
}

function lagNonce() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b));
}

const ekteDato = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && fraNr(dagNr(d)) === d;

// GET /admin/eksport.csv?fra=YYYY-MM-DD&til=YYYY-MM-DD: the daily counters as they are stored.
async function eksport(env, url) {
  const fra = url.searchParams.get("fra");
  const til = url.searchParams.get("til");
  const hode = { ...FELLES, "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY" };
  if (!ekteDato(fra) || !ekteDato(til) || fra > til) return tekst("Bruk /admin/eksport.csv?fra=ÅÅÅÅ-MM-DD&til=ÅÅÅÅ-MM-DD (fra før til).\n", 400, hode);
  if (dagNr(til) - dagNr(fra) + 1 > MAKS_EKSPORT_DAGER) return tekst(`Høyst ${MAKS_EKSPORT_DAGER} dager om gangen.\n`, 400, hode);
  let rader;
  try {
    rader = (await env.DB.prepare(SQL.eksport).bind(fra, til).all()).results || [];
  } catch (e) {
    return tekst("Databasen svarer ikke akkurat nå. Prøv igjen om litt.\n", 503, hode);
  }
  // (Names come from the fixed grammar: letters, digits and dots only, so nothing needs quoting.)
  const csv = "dag,nokkel,n\n" + rader.map((r) => `${r.dag},${r.nokkel},${Number(r.n)}`).join("\n") + (rader.length ? "\n" : "");
  return new Response(csv, { headers: { ...hode, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rusj-tall-${fra}-til-${til}.csv"` } });
}

// The web app manifest and the icon: no numbers in them, so the Worker serves them to anyone who
// reaches them. In production Cloudflare Access stands in front of all of /admin/.
const MANIFEST = JSON.stringify({
  id: "/admin",
  name: "rusj admin",
  short_name: "rusj admin",
  description: "Tallene for rusj.no",
  lang: "nb",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  background_color: "#150c28",
  theme_color: "#150c28",
  icons: [
    { src: "/admin/ikon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/admin/ikon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/admin/ikon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/admin/ikon.svg", sizes: "any", type: "image/svg+xml" },
  ],
});
const FILER = {
  "/admin/manifest.webmanifest": () => [MANIFEST, "application/manifest+json; charset=utf-8"],
  "/admin/ikon.svg": () => [IKON_SVG, "image/svg+xml"],
  "/admin/ikon-180.png": () => [Uint8Array.from(atob(IKON_PNG[180]), (c) => c.charCodeAt(0)), "image/png"],
  "/admin/ikon-192.png": () => [Uint8Array.from(atob(IKON_PNG[192]), (c) => c.charCodeAt(0)), "image/png"],
  "/admin/ikon-512.png": () => [Uint8Array.from(atob(IKON_PNG[512]), (c) => c.charCodeAt(0)), "image/png"],
};
export const ADMIN_STIER = ["/admin", "/admin/data.json", "/admin/eksport.csv", ...Object.keys(FILER)];

async function admin(request, env, ctx, naa, url) {
  const sti = url.pathname;
  if (request.method !== "GET" && request.method !== "HEAD") return tekst("Bare GET.", 405, { Allow: "GET, HEAD" });
  const svar = (innhold, valg) => new Response(request.method === "HEAD" ? null : innhold, valg);

  if (Object.prototype.hasOwnProperty.call(FILER, sti)) {
    const [innhold, type] = FILER[sti]();
    return svar(innhold, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'" } });
  }

  const innlogging = await adminInnlogging(request, env, ctx);
  const status = innlogging ? 200 : 401;
  // The choices on the dashboard are the only things read from the address: the period and the
  // sort order (checked against fixed lists), and the dates of an export.
  const valg = { periode: url.searchParams.get("p"), sort: url.searchParams.get("sort") };

  if (sti === "/admin/eksport.csv") {
    if (!innlogging) return tekst("Ikke innlogget.", 401, { "WWW-Authenticate": "X-Admin-Nokkel", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" });
    return eksport(env, url);
  }

  if (sti === "/admin/data.json") {
    const hode = { "Content-Type": "application/json; charset=utf-8", ...FELLES, "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY" };
    if (!innlogging) return new Response(JSON.stringify({ feil: "ikke innlogget" }), { status, headers: { ...hode, "WWW-Authenticate": "X-Admin-Nokkel" } });
    let data;
    try {
      data = await hentTavle(env.DB, naa, valg);
    } catch (e) {
      return new Response(JSON.stringify({ feil: "databasen svarer ikke" }), { status: 503, headers: hode });
    }
    return new Response(JSON.stringify({ hentet: naa.toISOString(), oppbevaringMaaneder: OPPBEVARING_MND, ...data.sammendrag, tavle: data.tavle, drift: data.drift }), { status, headers: hode });
  }

  const nonce = lagNonce();
  let data = null;
  if (innlogging) {
    try {
      data = await hentTavle(env.DB, naa, valg);
    } catch (e) {
      return tekst("Databasen svarer ikke akkurat nå. Prøv igjen om litt.", 503);
    }
  }
  const html = adminSide({ data, nonce, klokke: osloKlokke(naa), innlogging, nokkelPaa: nokkelPaa(env) });
  // The dashboard has no script. The login page has one inline script and may fetch /admin.
  const csp = ["default-src 'none'", `style-src 'nonce-${nonce}'`, "img-src 'self'", "manifest-src 'self'", ...(innlogging ? [] : [`script-src 'nonce-${nonce}'`, "connect-src 'self'"]), "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join("; ");
  return svar(html, {
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
// A monthly total is older than the limit when its whole month is: the months before the limit's.
// (Without table maned — schema-2.sql not run yet — only the daily counters are deleted.)
export async function ryddGamle(db, naa) {
  const grense = maanederFor(osloDag(naa), OPPBEVARING_MND);
  await db.prepare(SQL.rydd).bind(grense).run();
  try {
    await db.prepare(SQL.ryddMnd).bind(grense.slice(0, 7)).run();
  } catch (e) {
    /* no table maned yet */
  }
  return grense;
}

// ---------- Monthly totals (table maned, schema-2.sql) ----------

// Adds up one month of daily counters into table maned. Safe to run again: the totals are set,
// not added to, so the same days give the same rows.
export const rullManed = (db, maned) => db.prepare(SQL.rull).bind(maned + "-01", manedSlutt(maned), maned).run();

// The months that can be added up: complete (before this month) and with every day still kept
// (from the month after the retention limit's month, or the limit's own month when it is the 1st).
export function manederSomKanRulles(iDag) {
  const grense = maanederFor(iDag, OPPBEVARING_MND);
  const forste = grense.endsWith("-01") ? grense.slice(0, 7) : flyttMnd(grense.slice(0, 7), 1);
  return manedene(forste, flyttMnd(iDag.slice(0, 7), -1));
}

// The nightly job: every complete month that has no totals yet is added up. A month never changes
// once it is over (no counter can be written to a past day), so a month that is there is skipped
// at the cost of one row read. Returns the months that were added up.
export async function rullOpp(db, naa) {
  const maneder = manederSomKanRulles(osloDag(naa));
  const { results } = await db.prepare(SQL.mndFinnes).bind(JSON.stringify(maneder)).all();
  const ferdige = new Set((results || []).map((r) => r.maned));
  const mangler = maneder.filter((m) => !ferdige.has(m));
  if (mangler.length) await db.batch(mangler.map((m) => db.prepare(SQL.rull).bind(m + "-01", manedSlutt(m), m)));
  return mangler;
}

// The scheduled job: retention first, then the monthly totals; one failing never stops the other.
export async function natt(db, naa) {
  const ut = { grense: null, rullet: null };
  try {
    ut.grense = await ryddGamle(db, naa);
  } catch (e) {
    /* tried again tomorrow */
  }
  try {
    ut.rullet = await rullOpp(db, naa);
  } catch (e) {
    /* no table maned yet, or the database is busy: tried again tomorrow */
  }
  return ut;
}

// ---------- Routing ----------

export async function handter(request, env, ctx, naa = new Date()) {
  const url = new URL(request.url);
  const sti = url.pathname;
  if (sti === "/t") return taImot(request, env, naa);
  if (ADMIN_STIER.includes(sti)) return admin(request, env, ctx, naa, url);
  if (sti === "/robots.txt") return tekst("User-agent: *\nDisallow: /\n");
  if (sti === "/") return tekst("rusj-statistikk: ok\n");
  return tekst("Fant ikke siden.\n", 404);
}

export default {
  fetch: (request, env, ctx) => handter(request, env, ctx),
  scheduled: (hendelse, env, ctx) => ctx.waitUntil(natt(env.DB, new Date())),
};
