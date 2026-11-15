// Julekalenderen: the content and the pure rules, loaded in node:vm without the kit.
// Content: 24 doors in nb, en and da, each with something cosy (kos), a talk card with a follow-up
// (prat) and a game; exactly 24 different linked games per edition and per group (family, friends,
// class), all existing, published in that edition and never 18+; «#jul» only where the game reads
// it and has a Christmas pack; 6–8 kind tasks; a guess-together bonus on doors 1–23 for the big quiz
// on the 24th. Rules: the season's dates, door links and QR codes, the host rotation, the ornaments
// and the tree drawing, and the .ics file (24 events at 18:00 in the edition's time zone).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAPPE = join(ROT, "rusj/spill/julekalenderen");
const window = {};
vm.runInNewContext(readFileSync(join(MAPPE, "spill.js"), "utf8"), { window, console });
const M = window.RusjJulekalender;
const Q = createRequire(import.meta.url)(join(ROT, "src/qr.js"));
const SPRAK = ["nb", "en", "da"];
const DATA = Object.fromEntries(SPRAK.map((s) => [s, JSON.parse(readFileSync(join(MAPPE, s === "nb" ? "data" : `data.${s}`, "luker.json"), "utf8"))]));
const SONE = { nb: "Europe/Oslo", en: "Europe/London", da: "Europe/Copenhagen" };
const SLUG = { nb: "julekalenderen", en: "advent-calendar", da: "julekalenderen" };
const BASE = (s) => `https://rusj.no${s === "nb" ? "/" : `/${s}/`}${SLUG[s]}/`;

// Every game on rusj.no and whether an edition publishes it (rusj/SPRAK.md: i18n.<lang> and every
// data file translated).
const SPILL = new Map(
  readdirSync(join(ROT, "rusj/spill")).map((id) => {
    const m = JSON.parse(readFileSync(join(ROT, "rusj/spill", id, "spill.json"), "utf8"));
    return [id, m];
  }),
);
function publisert(id, s) {
  const m = SPILL.get(id);
  if (!m) return false;
  if (s === "nb") return true;
  if (!m.i18n || !m.i18n[s] || !m.i18n[s].slug) return false;
  const data = join(ROT, "rusj/spill", id, "data");
  if (!existsSync(data)) return true;
  return readdirSync(data)
    .filter((f) => f.endsWith(".json"))
    .every((f) => existsSync(join(ROT, "rusj/spill", id, `data.${s}`, f)));
}
// Does the game's data in the edition have a Christmas pack («jul»)?
function harJulepakke(id, s) {
  const mappe = join(ROT, "rusj/spill", id, s === "nb" ? "data" : `data.${s}`);
  if (!existsSync(mappe)) return false;
  const finn = (o) =>
    Array.isArray(o) ? o.some(finn) : o && typeof o === "object" ? o.id === "jul" || "jul" in o || Object.values(o).some(finn) : false;
  return readdirSync(mappe).some((f) => f.endsWith(".json") && finn(JSON.parse(readFileSync(join(mappe, f), "utf8"))));
}
const tekst = (x) => typeof x === "string" && x.trim().length > 0;
const dagNr = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
};
const fase = (iso) => M.fase({ tekst: iso, nr: dagNr(iso) });

test("24 doors per language, each with something cosy, a talk card and a game – for every group", () => {
  for (const s of SPRAK) {
    const L = DATA[s];
    assert.equal(L.length, 24, s);
    L.forEach((dor, i) => {
      const d = i + 1;
      assert.ok(tekst(dor.merke) && tekst(dor.merkeNavn), `${s} ${d}: klistremerket mangler`);
      for (const g of M.GRUPPER) {
        const l = M.lukeFor(dor, g);
        const hvor = `${s} luke ${d} (${g})`;
        assert.ok(tekst(l.tittel), `${hvor}: tittel`);
        assert.ok(tekst(l.kos.tittel) && tekst(l.kos.tekst) && l.kos.tekst.length <= 420, `${hvor}: kos`);
        assert.ok(Number.isInteger(l.kos.min) && l.kos.min >= 5 && l.kos.min <= 15, `${hvor}: kos tar 5–15 minutter`);
        assert.ok(tekst(l.prat.t) && tekst(l.prat.f), `${hvor}: julekortet til praten og «Spør videre»`);
        assert.ok(l.spill && tekst(l.spill.id) && tekst(l.spill.tekst) && tekst(l.spill.figur) && l.spill.figur.length <= 260, `${hvor}: spillet og figurens replikk`);
        if (l.snill) assert.ok(tekst(l.snill.tekst), `${hvor}: den snille oppgaven`);
        if (g === "familie") assert.ok(tekst(l.smaa), `${hvor}: en variant for de minste`);
        else assert.equal(l.smaa, "", `${hvor}: «For de minste» bare for familien`);
        const steg = M.steg(l);
        assert.ok(steg[0] === "kos" && steg.includes("prat") && steg.includes("spill") && steg[steg.length - 1] === "pynt", `${hvor}: stegene ${steg}`);
      }
      // A guess-together bonus on doors 1–23 (the big quiz on the 24th asks them all again).
      if (d < 24) {
        const b = dor.bonus;
        assert.ok(b && ["quiz", "nott"].includes(b.type) && tekst(b.tekst), `${s} ${d}: bonus`);
        if (b.type === "quiz") assert.ok(b.valg.length === 3 && b.valg.every(tekst) && Number.isInteger(b.riktig) && b.riktig >= 0 && b.riktig < 3, `${s} ${d}: quizen`);
        else assert.ok(tekst(b.svar), `${s} ${d}: svaret på nøtta`);
      } else assert.ok(dor.storquiz && !dor.bonus, `${s}: luke 24 er den store quizen`);
    });
    assert.equal(M.storquiz(L).length, 23, `${s}: julaftenquizen har ett spørsmål fra hver av lukene 1–23`);
    assert.deepEqual(Array.from(M.steg(M.lukeFor(L[23], "familie"))).slice(0, 2), ["kos", "gjett"], `${s}: quizen kommer rett etter kosen på julaften`);
  }
});

test("exactly 24 different linked games per edition and group: existing, published there, never 18+", () => {
  for (const s of SPRAK)
    for (const g of M.GRUPPER) {
      const ids = M.spillListe(DATA[s], g);
      assert.equal(new Set(ids).size, 24, `${s} ${g}: ${ids.join(", ")}`);
      for (const id of ids) {
        const m = SPILL.get(id);
        assert.ok(m, `${s} ${g}: ${id} finnes ikke`);
        assert.ok(id !== "julekalenderen", `${s} ${g}: kalenderen lenker til seg selv`);
        assert.ok(publisert(id, s), `${s} ${g}: ${id} er ikke publisert på ${s}`);
        assert.ok(!m.alder18 && !(m.tagger || []).includes("drikke") && (m.alder || 0) <= 10, `${s} ${g}: ${id} passer ikke for familien (18+ eller fra ${m.alder} år)`);
        assert.ok(m.spillere[1] >= 3, `${s} ${g}: ${id} er ikke et spill for en gruppe (${m.spillere.join("–")})`);
      }
    }
  // The same game behind the same door in every edition (so the three calendars match).
  for (const g of M.GRUPPER) assert.deepEqual(Array.from(M.spillListe(DATA.en, g)), Array.from(M.spillListe(DATA.nb, g)), `en ${g}`), assert.deepEqual(Array.from(M.spillListe(DATA.da, g)), Array.from(M.spillListe(DATA.nb, g)), `da ${g}`);
  // Nothing private in class mode: no pointing at classmates, no confessions, no dares.
  for (const s of SPRAK) for (const id of ["pekefingeren", "sladrehanken", "vaghalsen", "lognhalsen", "bingoballen"]) assert.ok(!M.spillListe(DATA[s], "klasse").includes(id), `${s}: ${id} i klassemodus`);
});

test("«#jul» only for games that open their Christmas pack from the address, and only where the pack exists", () => {
  for (const s of SPRAK)
    for (const dor of DATA[s])
      for (const g of M.GRUPPER) {
        const sp = M.lukeFor(dor, g).spill;
        if (!sp.hash) continue;
        assert.equal(sp.hash, "jul");
        const kilde = readFileSync(join(ROT, "rusj/spill", sp.id, "spill.js"), "utf8");
        assert.ok(kilde.includes("vedHash") && kilde.includes(`/${sp.id}/#jul`), `${sp.id} leser ikke #jul`);
        assert.ok(harJulepakke(sp.id, s), `${sp.id} har ingen julepakke på ${s}`);
      }
  // Every game that can open its Christmas pack from the address does so from the calendar.
  const medHash = new Set(DATA.nb.map((L) => L.spill).filter((sp) => sp.hash).map((sp) => sp.id));
  for (const id of ["mimen", "pekefingeren", "sladrehanken", "vinglepetter", "panna", "nynneren", "skravla", "vaghalsen"]) assert.ok(medHash.has(id), id);
});

test("kind tasks for someone outside the room on 6–8 days; the texts fit their language", () => {
  for (const s of SPRAK) {
    const n = DATA[s].filter((L) => L.snill).length;
    assert.ok(n >= 6 && n <= 8, `${s}: ${n} snille oppgaver`);
    const alt = JSON.stringify(DATA[s]);
    if (s === "en") assert.ok(!/[æøåÆØÅ«»]/.test(alt), "en: norske tegn eller anførselstegn");
    if (s === "da") assert.ok(!/«\p{L}/u.test(alt), "da: danske anførselstegn er »…«");
    if (s === "nb") assert.ok(!/»\p{L}/u.test(alt), "nb: norske anførselstegn er «…»");
    assert.ok(!/\b(alkohol|øl|vin|gløgg|beer|wine|mulled|snaps)\b/i.test(alt), `${s}: alkohol i kalenderen`);
  }
});

test("the season: countdown before December, doors 1–24, open after Christmas, January as before", () => {
  assert.deepEqual([fase("2026-11-20").fase, fase("2026-11-20").igjen, fase("2026-11-20").sesong], ["for", 11, 2026]);
  assert.equal(fase("2026-11-30").igjen, 1);
  assert.deepEqual([fase("2026-12-01").fase, fase("2026-12-01").dag], ["aktiv", 1]);
  assert.deepEqual([fase("2026-12-07").fase, fase("2026-12-07").dag], ["aktiv", 7]);
  assert.deepEqual([fase("2026-12-24").fase, fase("2026-12-24").dag], ["aktiv", 24]);
  assert.deepEqual([fase("2026-12-27").fase, fase("2026-12-27").dag, fase("2026-12-27").sesong], ["etter", 24, 2026]);
  assert.deepEqual([fase("2027-01-10").fase, fase("2027-01-10").sesong], ["etter", 2026]);
  assert.deepEqual([fase("2027-03-01").fase, fase("2027-03-01").sesong], ["for", 2027]);
  assert.ok(M.kanApnes(7, fase("2026-12-07")) && !M.kanApnes(8, fase("2026-12-07")) && !M.kanApnes(1, fase("2026-11-30")));
  assert.ok(M.kanApnes(24, fase("2026-12-27")) && M.kanApnes(3, fase("2027-01-05")));
});

test("door links and QR codes: one address per door that opens that door", () => {
  for (const s of SPRAK)
    for (let d = 1; d <= 24; d++) {
      const url = M.lukeAdresse(BASE(s), s, d);
      assert.equal(url, `${BASE(s)}#${M.HASH[s]}-${d}`);
      assert.equal(M.lesLuke(url.split("#")[1]), d, url);
      const qr = Q.lagQr(url, "M");
      assert.ok(qr.storrelse >= 21 && qr.storrelse <= 37, `${url}: QR-størrelse ${qr.storrelse}`);
      assert.match(Q.qrSvg(qr, { etikett: "x" }), /^<svg[^>]+viewBox/);
    }
  assert.equal(M.lukeAdresse("https://rusj.no/julekalenderen/", "nb", 7), "https://rusj.no/julekalenderen/#luke-7");
  assert.equal(M.lukeAdresse("https://rusj.no/en/advent-calendar/", "en", 7), "https://rusj.no/en/advent-calendar/#door-7");
  for (const [h, d] of [["luke-7", 7], ["door-24", 24], ["laage-1", 1], ["7", 7], ["LUKE-12", 12], [" luke-3 ", 3]]) assert.equal(M.lesLuke(h), d, h);
  for (const h of ["luke-0", "luke-25", "dagens", "jul", "", null, "luke-7x", "abc"]) assert.equal(M.lesLuke(h), null, String(h));
});

test("«Dagens nisse»: one host a day, everyone gets turns, «Bytt» moves today on", () => {
  assert.equal(M.nisse(7, 0, 3, 0), -1, "ingen navn");
  assert.equal(M.nisse(0, 3, 0, 0), -1);
  for (const n of [1, 2, 3, 5, 20])
    for (const start of [0, 4, 19]) {
      const vert = Array.from({ length: 24 }, (_, i) => M.nisse(i + 1, n, start, 0));
      assert.ok(vert.every((k) => k >= 0 && k < n));
      for (let i = 1; i < 24; i++) assert.equal(vert[i], (vert[i - 1] + 1) % n, `en ny nisse hver dag (n=${n})`);
      const tur = Array.from({ length: n }, (_, k) => vert.filter((v) => v === k).length);
      assert.ok(Math.max(...tur) - Math.min(...tur) <= 1, `turene fordeles jevnt: ${tur}`);
      assert.equal(M.nisse(5, n, start, 1), (M.nisse(5, n, start, 0) + 1) % n, "Bytt gir neste");
      assert.equal(M.nisse(5, n, start, n), M.nisse(5, n, start, 0), "rundt igjen");
    }
});

test("ornaments: finished doors hang on the tree, the star on the 24th, presents when all 24 are done", () => {
  assert.deepEqual(Array.from(M.pynt({ 3: { ferdig: true }, 1: { ferdig: true }, 2: { ferdig: false }, 30: { ferdig: true }, x: { ferdig: true }, 5: null })), [1, 3]);
  assert.deepEqual(Array.from(M.ORDEN).sort((a, b) => a - b), Array.from({ length: 23 }, (_, i) => i), "hver plass på treet brukes én gang");
  assert.equal(M.PLASS.length, 23);
  // Every place lies inside the tree (the triangle from the top to the bottom tier).
  for (const [x, y] of M.PLASS) {
    const halv = (110 * (y - 20)) / (244 - 20);
    assert.ok(y > 40 && y < 240 && Math.abs(x - 120) < halv, `plassen ${x},${y} er utenfor treet`);
  }
  const telle = (svg, re) => (svg.match(re) || []).length;
  for (const n of [0, 1, 7, 23]) {
    const ferdige = Array.from({ length: n }, (_, i) => i + 1);
    const svg = M.treSvg(ferdige, { id: "t" });
    assert.equal(telle(svg, /class="jk-orn[^"]*"/g), n, `${n} pynt`);
    assert.equal(telle(svg, /stroke-dasharray="2.2 2.6"/g), 23 - n, "tomme plasser venter");
    assert.ok(!svg.includes('data-d="24"') && !svg.includes("jk-tre-ferdig"));
  }
  const alle = M.treSvg(Array.from({ length: 24 }, (_, i) => i + 1), { id: "t", ny: 24 });
  assert.ok(alle.includes('data-d="24"') && alle.includes("jk-tre-ferdig") && alle.includes("jk-orn-ny") && alle.includes("jk-lys"));
  assert.equal(telle(alle, /class="jk-orn[^"]*"/g), 24);
  // The picture file: a standalone SVG with no classes the page would style.
  const fil = M.treSvg([1, 2, 3], { frittstaende: true, bredde: 780 });
  assert.match(fil, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* width="780"/);
  assert.ok(!/<script|on\w+=/.test(fil));
  assert.match(M.treSvg([], { etikett: 'A "<b>"' }), /aria-label="A b"/, "etiketten kan ikke bryte ut av attributtet");
});

// Unfolds an .ics text (RFC 5545) into content lines.
const linjer = (ics) => ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);

test("the reminders: a valid .ics with 24 events at 18:00 in the edition's time zone", () => {
  for (const s of SPRAK) {
    const sone = SONE[s];
    const ics = M.ics({
      sesong: 2026,
      fra: 1,
      sone,
      sprak: s,
      stamp: "20261115T120000Z",
      navn: "Julekalenderen, «2026»",
      tittel: (d) => `🎄 Luke ${d}: ${DATA[s][d - 1].tittel}`,
      tekst: () => "Kos; prat, og spill\nsammen",
      url: (d) => M.lukeAdresse(BASE(s), s, d),
    });
    assert.ok(ics.endsWith("\r\n") && !/[^\r]\n/.test(ics), `${s}: CRLF`);
    for (const l of ics.split("\r\n")) assert.ok(M.bytes(l) <= 75, `${s}: linja er for lang (${M.bytes(l)}): ${l}`);
    const L = linjer(ics);
    assert.equal(L[0], "BEGIN:VCALENDAR");
    assert.equal(L[L.length - 1], "END:VCALENDAR");
    assert.ok(L.includes("VERSION:2.0") && L.some((l) => l.startsWith("PRODID:")));
    assert.ok(L.includes(`TZID:${sone}`) && L.includes("BEGIN:VTIMEZONE"), `${s}: VTIMEZONE`);
    assert.equal(L.filter((l) => l === "BEGIN:VEVENT").length, 24);
    assert.equal(L.filter((l) => l === "END:VEVENT").length, 24);
    assert.equal(L.filter((l) => l === "BEGIN:VALARM").length, 24, "en påminnelse per luke");
    const start = L.filter((l) => l.startsWith("DTSTART;"));
    assert.equal(start.length, 24);
    start.forEach((l, i) => assert.equal(l, `DTSTART;TZID=${sone}:202612${String(i + 1).padStart(2, "0")}T180000`));
    const uid = L.filter((l) => l.startsWith("UID:"));
    assert.equal(new Set(uid).size, 24);
    const url = L.filter((l) => l.startsWith("URL:")).map((l) => l.slice(4));
    assert.deepEqual(Array.from(url), Array.from({ length: 24 }, (_, i) => M.lukeAdresse(BASE(s), s, i + 1)));
    assert.ok(L.includes("X-WR-CALNAME:Julekalenderen\\, «2026»"), "komma escapes");
    assert.ok(L.some((l) => l.startsWith("DESCRIPTION:Kos\\; prat\\, og spill\\nsammen\\n")), "semikolon, komma og linjeskift escapes");
    // 18:00 in the zone really is 18:00 there: December is standard time (UTC+1, or UTC in London).
    const timeDer = (ms) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: sone, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
    const utc = s === "en" ? 18 : 17;
    for (const d of [1, 7, 24]) assert.equal(timeDer(Date.UTC(2026, 11, d, utc)), 18, `${s} ${d}. desember`);
  }
  // From today in December: only the doors that are left.
  const fra7 = linjer(M.ics({ sesong: 2026, fra: 7, sone: "Europe/Oslo", sprak: "nb", stamp: "20261207T120000Z", navn: "x", tittel: (d) => `${d}`, tekst: () => "", url: (d) => `u${d}` }));
  assert.equal(fra7.filter((l) => l === "BEGIN:VEVENT").length, 18);
  assert.equal(fra7.find((l) => l.startsWith("DTSTART;")), "DTSTART;TZID=Europe/Oslo:20261207T180000");
  // Long titles with emoji fold on a character boundary.
  const lang = M.brett("SUMMARY:" + "🎄æ".repeat(40));
  for (const l of lang.split("\r\n")) assert.ok(M.bytes(l) <= 75);
  assert.equal(lang.replace(/\r\n /g, ""), "SUMMARY:" + "🎄æ".repeat(40));
});

test("the new stickers are in the catalogue", () => {
  const K = JSON.parse(readFileSync(join(ROT, "rusj/merker.json"), "utf8"));
  const ids = new Set(K.merker.map((m) => m.id));
  for (const id of ["luke-1", "luke-12", "luke-24", "luke-10", "luke-tre", "luke-nisse"]) assert.ok(ids.has(id), id);
  const kilde = readFileSync(join(MAPPE, "spill.js"), "utf8");
  for (const id of ["luke-10", "luke-tre", "luke-nisse"]) assert.ok(kilde.includes(`"${id}"`), `${id} gis aldri`);
});
