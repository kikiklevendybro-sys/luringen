// A small stand-in for Cloudflare D1, for the tests. It has the same few methods the Worker
// uses (prepare/bind/run/all/first/batch) and runs the SQL for real in Node's built-in SQLite
// (D1 is SQLite too), with schema.sql and schema-2.sql applied — so the Worker's SQL and the schema
// are tested, not just the JavaScript around them. falskD1({ utenManed: true }): a database where
// schema-2.sql has not been run yet (the Worker deployed before the migration).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// No request leaves the tests. The dashboard asks the rooms Worker whether it is up (src/helse.js);
// here the answer comes from falskHent.svar, and every call is written down in hentLogg.
export const hentLogg = [];
export const falskHent = { svar: () => new Response("rusj-nett: ok\n") };
globalThis.fetch = async (url, valg) => {
  hentLogg.push({ url: String(url), valg });
  return falskHent.svar(url, valg);
};

export const SKJEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
export const SKJEMA_2 = readFileSync(new URL("../schema-2.sql", import.meta.url), "utf8");

export function falskD1({ utenManed = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(SKJEMA);
  if (!utenManed) db.exec(SKJEMA_2);
  const logg = []; // every statement that was run: { sql, args }
  const tilstand = { feil: false }; // set feil = true to make every query fail

  const kjor = (sql, args, les) => {
    if (tilstand.feil) throw new Error("D1_ERROR: unavailable");
    logg.push({ sql, args });
    const stmt = db.prepare(sql);
    if (les) return { success: true, results: stmt.all(...args).map((r) => ({ ...r })), meta: {} };
    const r = stmt.run(...args);
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  };
  const erLes = (sql) => /^\s*select/i.test(sql);
  const setning = (sql, args = []) => ({
    sql,
    args,
    bind: (...nye) => setning(sql, nye),
    run: async () => kjor(sql, args, false),
    all: async () => kjor(sql, args, true),
    first: async () => kjor(sql, args, true).results[0] ?? null,
  });

  return {
    prepare: (sql) => setning(sql),
    // Like D1: all statements in one transaction, all or nothing.
    async batch(liste) {
      if (tilstand.feil) throw new Error("D1_ERROR: unavailable");
      db.exec("BEGIN");
      try {
        const ut = liste.map((s) => kjor(s.sql, s.args, erLes(s.sql)));
        db.exec("COMMIT");
        return ut;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    // Helpers for the tests (not part of D1).
    logg,
    tilstand,
    rader: () => db.prepare("SELECT dag, nokkel, n FROM teller ORDER BY dag, nokkel").all().map((r) => ({ ...r })),
    somObjekt: (dag) => Object.fromEntries(db.prepare("SELECT nokkel, n FROM teller WHERE dag = ? ORDER BY nokkel").all(dag).map((r) => [r.nokkel, r.n])),
    sett: (dag, nokkel, n) => db.prepare("INSERT INTO teller (dag, nokkel, n) VALUES (?, ?, ?)").run(dag, nokkel, n),
    mnd: () => db.prepare("SELECT maned, nokkel, n FROM maned ORDER BY maned, nokkel").all().map((r) => ({ ...r })),
    settMnd: (maned, nokkel, n) => db.prepare("INSERT INTO maned (maned, nokkel, n) VALUES (?, ?, ?)").run(maned, nokkel, n),
    kjorSql: (sql) => db.exec(sql),
    // How SQLite would run a statement: the lines of EXPLAIN QUERY PLAN.
    plan: (sql, args = []) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...args).map((r) => r.detail),
    skjema: () => db.prepare("SELECT type, name FROM sqlite_master ORDER BY name").all().map((r) => ({ ...r })),
    kolonner: (tabell) => db.prepare(`SELECT name FROM pragma_table_info('${tabell}')`).all().map((r) => r.name),
  };
}

// A POST /t as a browser on rusj.no would send it (browsers add Content-Length themselves).
export function post(kropp, hode = {}, url = "https://stat.example/t") {
  const tekst = typeof kropp === "string" ? kropp : JSON.stringify(kropp);
  return new Request(url, {
    method: "POST",
    headers: { Origin: "https://rusj.no", "Content-Type": "text/plain;charset=UTF-8", "Content-Length": String(new TextEncoder().encode(tekst).length), ...hode },
    body: tekst,
  });
}

export const pakke = (...nokler) => ({ v: 1, k: nokler });
// 11 November 2026 at 13:00 in Norway.
export const NAA = new Date("2026-11-11T12:00:00Z");
