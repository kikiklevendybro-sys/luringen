// scripts/topp.mjs: «Mest spilt nå» from the statistics Worker, with a fake answer only – the tests
// never call the live service. The key from .env goes only into the X-Admin-Nokkel header, is never
// printed or put in an error, and rusj/topp.json gets ids only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lesEnv, toppFraData, hentTopp, skrivTopp, kjenteSpill, MAKS } from "../scripts/topp.mjs";
import { STAT_ADRESSE, lesTopp } from "../scripts/rusj.mjs";

const NOKKEL = "test-nokkel-som-aldri-skal-vises-0123456789abcdef";

// A repository in miniature: a few game folders, and a .env with the key.
function lagRot(env = `RUSJ_ADMIN_NOKKEL=${NOKKEL}\n`) {
  const rot = mkdtempSync(join(tmpdir(), "rusj-topp-"));
  for (const id of ["fireren", "bonden", "ringen", "sjakkhesten", "dam", "reversi", "mimen", "panna", "skravla", "hatten", "spionen", "tieren"]) {
    mkdirSync(join(rot, "rusj/spill", id), { recursive: true });
    writeFileSync(join(rot, "rusj/spill", id, "spill.json"), JSON.stringify({ id }));
  }
  if (env != null) writeFileSync(join(rot, ".env"), env);
  return rot;
}

// The shape of /admin/data.json (statistikk/src/index.js and tall.js): the 30-day list is sorted by
// starts there already, but the script does not rely on that.
const data = (spill) => ({
  hentet: "2026-11-13T09:00:00.000Z",
  iDag: "2026-11-13",
  perioder: [
    { id: "idag", spill: [{ id: "panna", startet: 999, ferdig: 1, apnet: 1 }] },
    { id: "d7", spill: [] },
    { id: "d30", navn: "Siste 30 dager", spill },
  ],
});
const svar = (status, kropp) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof kropp === "string" ? JSON.parse(kropp) : kropp) });

test("the .env reader: plain, quoted, exported, commented", () => {
  assert.equal(lesEnv(`A=1\nRUSJ_ADMIN_NOKKEL=abc\n`, "RUSJ_ADMIN_NOKKEL"), "abc");
  assert.equal(lesEnv(`RUSJ_ADMIN_NOKKEL="a b#c"`, "RUSJ_ADMIN_NOKKEL"), "a b#c");
  assert.equal(lesEnv(`export RUSJ_ADMIN_NOKKEL='xyz'`, "RUSJ_ADMIN_NOKKEL"), "xyz");
  assert.equal(lesEnv(`# RUSJ_ADMIN_NOKKEL=nei\nRUSJ_ADMIN_NOKKEL=ja # kommentar\r\n`, "RUSJ_ADMIN_NOKKEL"), "ja");
  assert.equal(lesEnv(`RUSJ_ADMIN_NOKKEL_GAMMEL=nei`, "RUSJ_ADMIN_NOKKEL"), "");
});

test("the list: sorted by starts, only real games that were started, at most ten, ids only", () => {
  const kjente = new Set(["luringen", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]);
  const ut = toppFraData(
    data([
      { id: "c", startet: 5, apnet: 90 },
      { id: "a", startet: 40 },
      { id: "forside", startet: 500 }, // not a game
      { id: "<script>", startet: 400 },
      { id: "b", startet: 0, apnet: 300 }, // opened, never started
      { id: "luringen", startet: 40 },
      ...["d", "e", "f", "g", "h", "i", "j", "k", "l"].map((id, n) => ({ id, startet: 30 - n })),
    ]),
    kjente,
  );
  assert.deepEqual(ut, ["a", "luringen", "d", "e", "f", "g", "h", "i", "j", "k"]);
  assert.equal(ut.length, MAKS);
  assert.throws(() => toppFraData({ perioder: [{ id: "d7", spill: [] }] }, kjente), /Siste 30 dager/);
  assert.throws(() => toppFraData(null, kjente), /Siste 30 dager/);
});

test("fetches /admin/data.json with the key in the header and writes rusj/topp.json the build can read", async () => {
  const rot = lagRot();
  try {
    let kall = null;
    const hent = async (url, valg) => {
      kall = { url, valg };
      return svar(200, data([{ id: "mimen", startet: 80 }, { id: "ringen", startet: 70 }, { id: "panna", startet: 60 }, { id: "finnesikke", startet: 50 }, { id: "luringen", startet: 40 }]));
    };
    const topp = await hentTopp({ rot, env: {}, hent });
    assert.equal(kall.url, `${new URL(STAT_ADRESSE).origin}/admin/data.json`);
    assert.equal(kall.valg.method, "GET");
    assert.equal(kall.valg.headers["X-Admin-Nokkel"], NOKKEL);
    assert.equal(kall.valg.redirect, "error", "the key must never follow a redirect elsewhere");
    assert.deepEqual(topp, { oppdatert: "2026-11-13", spill: ["mimen", "ringen", "panna", "luringen"] });
    const fil = skrivTopp(rot, topp);
    const tekst = readFileSync(fil, "utf8");
    assert.deepEqual(JSON.parse(tekst), { oppdatert: "2026-11-13", spill: ["mimen", "ringen", "panna", "luringen"] });
    assert.doesNotMatch(tekst, /startet|apnet|ferdig|": *\d/, "only ids, never a number of starts");
    assert.ok(!tekst.includes(NOKKEL));
    assert.deepEqual(lesTopp(fil), { oppdatert: "2026-11-13", spill: ["mimen", "ringen", "panna", "luringen"] });
    // The environment wins over .env (and the date falls back to today in Oslo).
    const fra = await hentTopp({ rot, env: { RUSJ_ADMIN_NOKKEL: "fra-miljoet" }, hent: async (url, valg) => ((kall = valg), svar(200, { perioder: [{ id: "d30", spill: [] }] })), idag: new Date("2026-11-13T23:30:00Z") });
    assert.equal(kall.headers["X-Admin-Nokkel"], "fra-miljoet");
    assert.deepEqual(fra, { oppdatert: "2026-11-14", spill: [] });
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});

test("the key is never printed: not in errors, not in the output, and no request without it", async () => {
  const rot = lagRot();
  const utskrift = [];
  const { log, error, warn } = console;
  console.log = console.error = console.warn = (...a) => utskrift.push(a.join(" "));
  try {
    for (const [status, ventet] of [[401, /godtok ikke nøkkelen \(HTTP 401\)/], [403, /HTTP 403/], [500, /HTTP 500/]]) {
      const feil = await hentTopp({ rot, env: {}, hent: async () => svar(status, { feil: "ikke innlogget" }) }).catch((e) => e);
      assert.match(feil.message, ventet);
      assert.ok(!feil.message.includes(NOKKEL), "nøkkelen står i feilmeldingen");
    }
    const nett = await hentTopp({ rot, env: {}, hent: async (url, valg) => { throw new Error(`fetch failed ${JSON.stringify(valg)}`); } }).catch((e) => e);
    assert.match(nett.message, /Fikk ikke kontakt/);
    assert.ok(!nett.message.includes(NOKKEL), "nøkkelen står i feilmeldingen ved nettfeil");
    const tull = await hentTopp({ rot, env: {}, hent: async () => svar(200, "{ikke json") }).catch((e) => e);
    assert.match(tull.message, /ikke JSON/);
    // No key: a clear message, and nothing is fetched.
    const uten = lagRot(null);
    try {
      let hentet = false;
      const mangler = await hentTopp({ rot: uten, env: {}, hent: async () => ((hentet = true), svar(200, {})) }).catch((e) => e);
      assert.match(mangler.message, /Fant ikke RUSJ_ADMIN_NOKKEL i \.env/);
      assert.equal(hentet, false);
      assert.ok(!existsSync(join(uten, "rusj/topp.json")));
    } finally {
      rmSync(uten, { recursive: true, force: true });
    }
  } finally {
    Object.assign(console, { log, error, warn });
    rmSync(rot, { recursive: true, force: true });
  }
  assert.ok(utskrift.every((l) => !l.includes(NOKKEL)), "nøkkelen ble skrevet ut");
});

test("the games it knows: every folder with a spill.json, and Luringen", () => {
  const rot = lagRot();
  try {
    mkdirSync(join(rot, "rusj/spill/uten-json"));
    const kjente = kjenteSpill(rot);
    assert.ok(kjente.has("luringen") && kjente.has("fireren") && !kjente.has("uten-json"));
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});

test("the committed rusj/topp.json is valid", () => {
  const topp = lesTopp(join(import.meta.dirname, "..", "rusj/topp.json"));
  assert.ok(topp && Array.isArray(topp.spill) && topp.spill.length <= MAKS);
});

test("hentToppD1: reads the table through Cloudflare's API, only games with enough starts", async () => {
  const { hentToppD1, MIN_STARTER } = await import("../scripts/topp.mjs");
  let kall = null;
  const rader = [{ id: "spionen", startet: 40 }, { id: "ordugla", startet: MIN_STARTER }, { id: "humla", startet: MIN_STARTER - 1 }, { id: "finnesikke", startet: 99 }];
  const hent = async (url, valg) => ((kall = { url, valg }), { ok: true, status: 200, json: async () => ({ success: true, result: [{ results: rader }] }) });
  const env = { CLOUDFLARE_API_TOKEN: "t".repeat(40), CLOUDFLARE_ACCOUNT_ID: "a".repeat(32) };
  const topp = await hentToppD1({ env, hent, idag: new Date("2026-11-13T12:00:00Z") });
  assert.deepEqual(topp, { oppdatert: "2026-11-13", spill: ["spionen", "ordugla"] });
  assert.match(kall.url, /\/accounts\/a{32}\/d1\/database\/[0-9a-f-]{36}\/query$/);
  assert.deepEqual(JSON.parse(kall.valg.body).params, ["2026-10-15", "2026-11-13"]);
  assert.equal(await hentToppD1({ env: {}, hent, rot: "/finnes/ikke" }), null);
});
