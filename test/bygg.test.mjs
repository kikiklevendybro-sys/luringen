// The built site as search engines and link previews read it: every page's title, description,
// canonical address and preview tags, the sitemap, robots.txt, the favicon and the structured data.
// Builds into a temporary folder (never dist/web). To check a folder that is already built:
//   RUSJ_WEB=dist/web node --test test/bygg.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lesSeo, merkeI, merkeSynlig, TITTEL_MAKS, BESKRIVELSE_GRENSER, DOMENE, OMDOPT } from "../scripts/rusj.mjs";
import { omSpilletHtml, flereTil } from "../scripts/om-spillet.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ferdigBygget = process.env.RUSJ_WEB ? resolve(process.env.RUSJ_WEB) : null;
const midlertidig = ferdigBygget ? null : mkdtempSync(join(tmpdir(), "rusj-bygg-"));
const WEB = ferdigBygget || join(midlertidig, "web");

let sider = []; // { sti, html, tittel, beskrivelse, kanonisk, robots, og: {…}, jsonld: [tekst, …] }
let spillIder = [];
const videresend = new Map(); // old address of a renamed game → its html

const tekst = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function lesSide(sti, fil) {
  const html = readFileSync(fil, "utf8");
  const hode = html.slice(0, html.indexOf("</head>"));
  const ett = (re) => {
    const alle = [...hode.matchAll(re)].map((m) => tekst(m[1]));
    assert.ok(alle.length <= 1, `${sti}: ${alle.length} treff på ${re}`);
    return alle[0] ?? null;
  };
  const og = {};
  for (const m of hode.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)">/g)) {
    assert.ok(!(m[1] in og), `${sti}: ${m[1]} står to ganger`);
    og[m[1]] = tekst(m[2]);
  }
  return {
    sti,
    html,
    tittel: ett(/<title>([^<]*)<\/title>/g),
    beskrivelse: ett(/<meta name="description" content="([^"]*)">/g),
    kanonisk: ett(/<link rel="canonical" href="([^"]*)">/g),
    robots: ett(/<meta name="robots" content="([^"]*)">/g),
    og,
    jsonld: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]),
  };
}

before(() => {
  if (!ferdigBygget) execFileSync(process.execPath, [join(ROT, "scripts/bygg.mjs"), "--ut", WEB], { cwd: ROT, stdio: "pipe" });
  assert.ok(existsSync(join(WEB, "index.html")), `Fant ikke ${WEB}/index.html`);
  sider = [lesSide("/", join(WEB, "index.html"))];
  for (const mappe of readdirSync(WEB, { withFileTypes: true })) {
    if (!mappe.isDirectory()) continue;
    const fil = join(WEB, mappe.name, "index.html");
    if (!existsSync(fil)) continue;
    // Old addresses of renamed games and alias addresses: small pages that send the visitor on.
    const html = readFileSync(fil, "utf8");
    if (mappe.name in OMDOPT || html.includes('<meta http-equiv="refresh"')) {
      videresend.set(mappe.name, html);
      continue;
    }
    sider.push(lesSide(`/${mappe.name}/`, fil));
    if (existsSync(join(WEB, mappe.name, "data.js")) || mappe.name === "luringen") spillIder.push(mappe.name);
  }
});

after(() => {
  if (midlertidig) rmSync(midlertidig, { recursive: true, force: true });
});

test("the build has the front page, the games and the pages about rusj", () => {
  assert.ok(spillIder.length >= 40, `bare ${spillIder.length} spill i bygget`);
  for (const sti of ["/", "/luringen/", "/om/", "/personvern/", "/merker/"]) assert.ok(sider.some((s) => s.sti === sti), `mangler ${sti}`);
  // + the collection pages (rusj/samlinger/*.json), one page each.
  const samlinger = readdirSync(join(ROT, "rusj/samlinger")).filter((f) => f.endsWith(".json")).length;
  assert.equal(sider.length, spillIder.length + 4 + samlinger, "andre sider enn forsiden, spillene, /om/, /personvern/, /merker/ og samlingene – legg dem til i testen");
});

test("renamed games: the old address sends the visitor on, no script, not indexed, not in the sitemap", () => {
  for (const [gammel, ny] of Object.entries(OMDOPT)) {
    if (!spillIder.includes(ny)) continue;
    const html = videresend.get(gammel);
    assert.ok(html, `mangler /${gammel}/`);
    assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0; url=/${ny}/">`), `/${gammel}/: sender ikke videre`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${DOMENE}/${ny}/">`), `/${gammel}/: canonical`);
    assert.match(html, /<meta name="robots" content="noindex">/, `/${gammel}/: skal ikke indekseres`);
    assert.match(html, new RegExp(`<a href="/${ny}/">`), `/${gammel}/: mangler lenke`);
    assert.ok(!/<script/i.test(html), `/${gammel}/: har script`);
    assert.ok(!readFileSync(join(WEB, "sitemap.xml"), "utf8").includes(`/${gammel}/`), `/${gammel}/ står i sitemap.xml`);
  }
});

test("every page has its own title of a sensible length, search phrase before « | rusj»", () => {
  const sett = new Map();
  for (const s of sider) {
    assert.ok(s.tittel, `${s.sti}: mangler <title>`);
    assert.ok(s.tittel.length >= 25 && s.tittel.length <= TITTEL_MAKS, `${s.sti}: tittelen er ${s.tittel.length} tegn («${s.tittel}»)`);
    assert.ok(s.sti === "/" ? s.tittel.startsWith("rusj – ") : s.tittel.endsWith(" | rusj"), `${s.sti}: «${s.tittel}» slutter ikke på « | rusj»`);
    assert.ok(!sett.has(s.tittel), `${s.sti} og ${sett.get(s.tittel)} har samme tittel`);
    sett.set(s.tittel, s.sti);
  }
});

test("every page has its own description within the length limits", () => {
  const [min, maks] = BESKRIVELSE_GRENSER;
  const sett = new Map();
  for (const s of sider) {
    assert.ok(s.beskrivelse, `${s.sti}: mangler beskrivelse`);
    assert.ok(s.beskrivelse.length >= min && s.beskrivelse.length <= maks, `${s.sti}: beskrivelsen er ${s.beskrivelse.length} tegn (${min}–${maks})`);
    assert.ok(!sett.has(s.beskrivelse), `${s.sti} og ${sett.get(s.beskrivelse)} har samme beskrivelse`);
    sett.set(s.beskrivelse, s.sti);
  }
});

test("every page names its own address, may be indexed, and has complete link-preview tags", () => {
  for (const s of sider) {
    const url = DOMENE + s.sti;
    assert.equal(s.kanonisk, url, `${s.sti}: canonical`);
    assert.equal(s.robots, "max-image-preview:large", `${s.sti}: robots`);
    assert.equal(s.og["og:url"], url, `${s.sti}: og:url`);
    assert.equal(s.og["og:description"], s.beskrivelse, `${s.sti}: og:description følger ikke beskrivelsen`);
    assert.ok(s.og["og:title"] && s.og["og:title"].length >= 5 && s.og["og:title"].length <= 70, `${s.sti}: og:title «${s.og["og:title"]}»`);
    assert.equal(s.og["og:type"], "website", `${s.sti}: og:type`);
    assert.equal(s.og["og:site_name"], "rusj", `${s.sti}: og:site_name`);
    assert.equal(s.og["og:locale"], "nb_NO", `${s.sti}: og:locale`);
    const bilde = s.og["og:image"];
    assert.ok(bilde && bilde.startsWith(DOMENE + "/") && !bilde.includes("?"), `${s.sti}: og:image «${bilde}»`);
    assert.ok(existsSync(join(WEB, bilde.slice(DOMENE.length))), `${s.sti}: delingsbildet ${bilde} finnes ikke i bygget`);
    assert.equal(s.og["og:image:width"], "1200", `${s.sti}: og:image:width`);
    assert.equal(s.og["og:image:height"], "630", `${s.sti}: og:image:height`);
    assert.ok(s.og["og:image:alt"], `${s.sti}: mangler og:image:alt`);
    assert.equal(s.og["twitter:card"], "summary_large_image", `${s.sti}: twitter:card`);
    assert.match(s.html, /<html lang="nb"/, `${s.sti}: lang`);
  }
});

test("link previews of the games say what the game is before the mascot's name; 18+ is marked", () => {
  const seo = lesSeo(ROT);
  for (const id of spillIder) {
    const s = sider.find((x) => x.sti === `/${id}/`);
    const e = seo.spill[id];
    // A new game still being built keeps its SEO text in rusj/spill/<id>/seo.json until it is merged.
    if (!e && existsSync(join(ROT, "rusj/spill", id, "seo.json"))) continue;
    assert.ok(e, `${id}: mangler i rusj/seo.json`);
    assert.equal(s.tittel, `${e.tittel} | rusj`, `${id}: tittelen kommer ikke fra rusj/seo.json`);
    assert.equal(s.beskrivelse, e.beskrivelse, `${id}: beskrivelsen kommer ikke fra rusj/seo.json`);
    assert.ok(s.og["og:title"].startsWith(e.frase), `${id}: og:title «${s.og["og:title"]}» begynner ikke med «${e.frase}»`);
    if (/"suggestedMinAge":18/.test(s.jsonld[0])) assert.ok(s.tittel.includes("(18+)") && s.og["og:title"].includes("(18+)"), `${id}: 18+ står ikke i tittel og og:title`);
  }
});

test("no other company's game brand in titles, descriptions, previews or structured data", () => {
  for (const s of sider) {
    const synlig = { tittel: s.tittel, beskrivelse: s.beskrivelse, "og:title": s.og["og:title"], "og:image:alt": s.og["og:image:alt"], "strukturerte data": s.jsonld.join(" ").replace(/\\u003c/g, "<") };
    for (const [hva, verdi] of Object.entries(synlig)) assert.equal(merkeI(verdi), null, `${s.sti}: «${merkeI(verdi)}» i ${hva}`);
  }
});

test("the front page: the words people search for – and not «festspill» (an arts festival)", () => {
  const f = sider.find((s) => s.sti === "/");
  assert.match(f.tittel, /^rusj – gratis spill og selskapsleker på norsk$/);
  for (const ord of ["selskapsleker", "quiz", "drikkeleker (18+)", "kabal", "sudoku", "yatzy", "dagens ord", "Ingen app", "ingen konto", "ingen reklame"]) assert.ok(f.beskrivelse.includes(ord), `beskrivelsen mangler «${ord}»`);
  assert.ok(f.beskrivelse.startsWith(`${spillIder.length} gratis spill`), `beskrivelsen teller ikke spillene («${f.beskrivelse.slice(0, 30)}…»)`);
  assert.match(f.html, /<p class="helt-slagord">Spill for hele gjengen\. <br><em>Rett i nettleseren\.<\/em><\/p>/);
  assert.doesNotMatch(f.html, /festspill/i, "ordet «festspill» står fortsatt på forsiden");
  assert.doesNotMatch(readFileSync(join(WEB, "manifest.webmanifest"), "utf8"), /festspill/i, "ordet «festspill» står fortsatt i manifestet");
  assert.match(f.html, /<a href="\/om\/">Om rusj<\/a><a href="\/personvern\/">Personvern<\/a>/, "bunnteksten lenker ikke til /om/ og /personvern/");
  for (const id of spillIder) assert.ok(f.html.includes(`href="/${id}/"`), `forsiden lenker ikke til /${id}/`);
});

test("the front page: «Dagens rusj» is wired in, and every card carries its facts", () => {
  const f = sider.find((s) => s.sti === "/");
  // The strip (returning players) and the slim row (new visitors) are empty and hidden until
  // portal.js fills one of them; the helpers load before it.
  assert.match(f.html, /<section class="idag" id="idag" aria-labelledby="idag-tittel" hidden><\/section>/);
  assert.match(f.html, /<a class="idag-ny" id="idag-ny" href="#hylle-daglig" hidden>/);
  const skript = [...f.html.matchAll(/<script defer src="\/felles\/([a-z]+)\.js\?v=[a-z0-9]+"><\/script>/g)].map((m) => m[1]);
  // (stat.js comes first on every page when anonymous statistics are on: see STAT_ADRESSE.)
  assert.deepEqual(skript.filter((s) => s !== "stat"), ["spilliste", "daglig", "portal"]);
  assert.ok(existsSync(join(WEB, "felles/daglig.js")));
  // One card per game: players, phones and time, and the same in the link's name.
  const kort = [...f.html.matchAll(/<li class="spillkort" data-id="([a-z]+)"[\s\S]*?<\/li>/g)];
  assert.equal(kort.length, spillIder.length);
  for (const [html, id] of kort) {
    for (const klasse of ["kort-spillere", "kort-mobiler", "kort-tid"]) assert.equal(html.split(`class="${klasse}"`).length, 2, `${id}: ${klasse}`);
    assert.match(html, /aria-label="[^"]*(spiller|spillere), (én mobil|hver sin mobil|én eller flere mobiler), \d+( til \d+)? minutter[^"]*\."/, `${id}: lenkenavnet sier ikke fakta`);
    assert.match(html, /<span class="fakta-lang">(1 mobil|Hver sin mobil|1 eller flere mobiler)<\/span><span class="fakta-kort">(1|flere|1\+)<\/span>/, `${id}: mobiler`);
  }
  // «Mot mobilen» is said by the games (or rusj/seo.json), not guessed from the number of players.
  const seo = lesSeo(ROT);
  const liste = readFileSync(join(WEB, "felles/spilliste.js"), "utf8");
  for (const [html, id] of kort) {
    const sagt = new RegExp(`"id":"${id}"[^}]*"motMobilen":true`).test(liste);
    assert.equal(html.includes('<span class="kort-merke">Mot mobilen</span>'), sagt, `${id}: merket «Mot mobilen»`);
    if ((seo.spill[id] || {}).motMobilen) assert.ok(sagt, `${id}: motMobilen i rusj/seo.json kom ikke med i spillista`);
  }
});

test("the 404 page is not indexed and has no address of its own", () => {
  const s = lesSide("/404.html", join(WEB, "404.html"));
  assert.equal(s.robots, "noindex");
  assert.equal(s.kanonisk, null, "404-siden har canonical");
  assert.equal(s.og["og:url"], undefined, "404-siden har og:url");
  assert.ok(s.tittel && s.beskrivelse);
});

test("sitemap.xml lists every page once, with the date it last changed; robots.txt points to it", () => {
  const xml = readFileSync(join(WEB, "sitemap.xml"), "utf8");
  const rader = [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)].map((m) => ({ loc: m[1], dato: m[2] }));
  assert.equal(rader.length, (xml.match(/<url>/g) || []).length, "en <url> i sitemap.xml mangler <loc> eller <lastmod>");
  assert.deepEqual(rader.map((r) => r.loc).sort(), sider.map((s) => DOMENE + s.sti).sort());
  assert.equal(rader[0].loc, DOMENE + "/", "forsiden står ikke først");
  const iMorgen = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  for (const r of rader) {
    assert.match(r.dato, /^20\d\d-\d\d-\d\d$/, `${r.loc}: lastmod «${r.dato}»`);
    assert.ok(!Number.isNaN(Date.parse(r.dato)) && r.dato <= iMorgen, `${r.loc}: lastmod ${r.dato} er ikke en dato til og med i dag`);
  }
  assert.ok(!xml.includes("404"), "404-siden står i sitemap.xml");
  const robots = readFileSync(join(WEB, "robots.txt"), "utf8");
  assert.match(robots, /^User-agent: \*\nAllow: \/\nSitemap: https:\/\/rusj\.no\/sitemap\.xml\n$/);
  assert.doesNotMatch(robots, /Disallow/);
});

test("structured data parses and agrees with the page: the front page lists the games, each game describes itself", () => {
  const graf = (s) => {
    assert.equal(s.jsonld.length, 1, `${s.sti}: ${s.jsonld.length} blokker med strukturerte data`);
    assert.ok(!s.jsonld[0].includes("<"), `${s.sti}: «<» i strukturerte data er ikke skrevet som \\u003c`);
    const j = JSON.parse(s.jsonld[0]);
    assert.equal(j["@context"], "https://schema.org");
    return j["@graph"];
  };
  const forside = graf(sider.find((s) => s.sti === "/"));
  const nettsted = forside.find((n) => n["@type"] === "WebSite");
  assert.equal(nettsted.url, DOMENE + "/");
  assert.equal(nettsted.inLanguage, "nb");
  assert.ok(forside.some((n) => n["@id"] === nettsted.publisher["@id"]), "utgiveren WebSite viser til, mangler");
  const liste = forside.find((n) => n["@type"] === "ItemList");
  assert.equal(liste.numberOfItems, spillIder.length);
  assert.deepEqual(liste.itemListElement.map((e) => e.url).sort(), spillIder.map((id) => `${DOMENE}/${id}/`).sort());
  assert.deepEqual(liste.itemListElement.map((e) => e.position), liste.itemListElement.map((_, i) => i + 1));

  for (const id of spillIder) {
    const s = sider.find((x) => x.sti === `/${id}/`);
    const g = graf(s);
    const spill = g.find((n) => n["@type"] === "VideoGame" || n["@type"] === "WebApplication");
    assert.ok(spill, `${id}: verken VideoGame eller WebApplication`);
    assert.equal(spill.url, s.kanonisk, `${id}: url`);
    assert.equal(spill.description, s.beskrivelse, `${id}: description følger ikke beskrivelsen`);
    assert.ok(spill.name && spill.alternateName, `${id}: mangler navn`);
    assert.equal(spill.image, s.og["og:image"], `${id}: image følger ikke og:image`);
    assert.equal(spill.isAccessibleForFree, true);
    assert.deepEqual(spill.offers, { "@type": "Offer", price: "0", priceCurrency: "NOK" });
    assert.ok(g.some((n) => n["@id"] === spill.publisher["@id"]), `${id}: utgiveren mangler`);
    if (spill["@type"] === "VideoGame") {
      const { minValue, maxValue } = spill.numberOfPlayers;
      assert.ok(Number.isInteger(minValue) && Number.isInteger(maxValue) && minValue >= 1 && maxValue >= minValue, `${id}: numberOfPlayers`);
      assert.ok(spill.playMode, `${id}: playMode`);
    }
    const sti = g.find((n) => n["@type"] === "BreadcrumbList").itemListElement;
    assert.equal(sti[0].item, DOMENE + "/", `${id}: brødsmulestien begynner ikke på forsiden`);
    assert.equal(sti.at(-1).item, s.kanonisk, `${id}: brødsmulestien ender ikke på siden`);
  }
});

test("the pages about rusj: the delete button and what the privacy page must say; a contact line", () => {
  const pv = sider.find((s) => s.sti === "/personvern/").html;
  assert.match(pv, /<button type="button" class="knapp rod" id="slett-alt">Slett alt rusj har lagret på denne enheten<\/button>/);
  assert.match(pv, /<script defer src="\/felles\/sider\.js\?v=[a-z0-9]+"><\/script>/);
  for (const ord of ["localStorage", "informasjonskapsler", "GitHub Pages", "IP-adressen", "utenfor EU/EØS", "uten nett", "Ingen konto", "sporing", "reklame"]) assert.ok(pv.includes(ord), `personvernsiden mangler «${ord}»`);
  const om = sider.find((s) => s.sti === "/om/").html;
  // The contact line is only printed once the owner has set a real address; never a placeholder.
  if (/Kontakt:/.test(om)) assert.match(om, /Kontakt: <a href="mailto:[^"@]+@[^"]+">/);
  assert.doesNotMatch(om + pv, /hei@rusj\.no/, "plassholder-adressen skal ikke publiseres");
  assert.match(om, /alkoholfritt teller like mye/, "Om-siden mangler avsnittet om måtehold");
  // The script that deletes: the two prefixes, the caches and the service worker.
  const js = readFileSync(join(WEB, "felles/sider.js"), "utf8");
  for (const bit of ['startsWith("rusj.")', 'startsWith("luringen.")', "caches.delete", "unregister()"]) assert.ok(js.includes(bit), `sider.js mangler ${bit}`);
});

test("favicon.ico is an icon file with a PNG inside", () => {
  const ico = readFileSync(join(WEB, "favicon.ico"));
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 1, 0], "ikke et ICO-hode med ett bilde");
  assert.equal(ico.readUInt32LE(18), 22, "bildet begynner ikke rett etter hodet");
  assert.equal(ico.readUInt32LE(14), ico.length - 22, "lengden i hodet stemmer ikke");
  assert.deepEqual([...ico.subarray(22, 30)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "ikke en PNG inni");
});

test("rusj/seo.json is checked when it is read: length, duplicates and brand names stop the build", () => {
  const rot = mkdtempSync(join(tmpdir(), "rusj-seo-"));
  mkdirSync(join(rot, "rusj"));
  const god = { tittel: "Sudoku gratis – dagens sudoku, uten reklame", frase: "Sudoku", beskrivelse: "Gratis sudoku på norsk uten reklame: nye brett i fire nivåer, alltid med bare én løsning. Dagens sudoku for hele landet." };
  const les = (spill) => {
    writeFileSync(join(rot, "rusj/seo.json"), JSON.stringify({ forside: {}, spill }));
    return lesSeo(rot);
  };
  try {
    assert.doesNotThrow(() => les({ a: god }));
    assert.throws(() => les({ a: { ...god, tittel: "x".repeat(TITTEL_MAKS) } }), /tittelen er/);
    assert.throws(() => les({ a: { ...god, beskrivelse: "For kort." } }), /beskrivelsen er/);
    assert.throws(() => les({ a: god, b: { ...god, beskrivelse: god.beskrivelse + " Og litt til." } }), /samme tittel/);
    assert.throws(() => les({ a: god, b: { ...god, tittel: "Sudoku på nett – fire nivåer og dagens brett" } }), /samme beskrivelse/);
    assert.throws(() => les({ a: { ...god, tittel: "Forklar ordet – som Alias, bare gratis" } }), /merkevare/);
    assert.throws(() => les({ a: { ...god, frase: undefined } }), /mangler "frase"/);
    // A brand as a hidden search word is fine: that is the one place it belongs.
    assert.doesNotThrow(() => les({ a: { ...god, sok: ["alias"] } }));
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});

// ---------- «Slik spiller dere …» under every game page (scripts/om-spillet.mjs) ----------

const omBlokk = (html) => {
  const fra = html.indexOf('<section class="om-spillet"');
  return fra < 0 ? null : html.slice(fra, html.indexOf("</section>", fra) + "</section>".length);
};
const synligTekst = (html) => tekst(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const atten = (id) => id !== "luringen" && /"alder18":true/.test(readFileSync(join(WEB, id, "data.js"), "utf8").split("\n")[0]);

test("every game page has a readable «Slik spiller dere» block after the app, outside #skjerm", () => {
  for (const id of spillIder.filter((x) => x !== "luringen")) {
    const s = sider.find((x) => x.sti === `/${id}/`);
    const blokk = omBlokk(s.html);
    assert.ok(blokk, `${id}: mangler «Slik spiller dere»-blokken`);
    assert.equal(s.html.split('<section class="om-spillet"').length, 2, `${id}: blokken står mer enn én gang`);
    // After the app's closing tag (never inside #skjerm, which the kit redraws).
    const appSlutt = s.html.indexOf("</main>\n</div>");
    assert.ok(appSlutt > 0 && s.html.indexOf('<section class="om-spillet"') > appSlutt, `${id}: blokken står ikke etter appen`);
    assert.ok(!/hidden|display:\s*none|aria-hidden/.test(blokk), `${id}: blokken er skjult i HTML-en`);
    assert.match(blokk, /<h2 id="om-spillet-tittel">Slik spiller (dere|du) [^<]+<\/h2>/, `${id}: overskriften`);
    assert.ok((blokk.match(/<li><b>/g) || []).length >= 3, `${id}: færre enn tre steg`);
    assert.match(blokk, /<p class="om-ingress">[^<]{20,}<\/p>/, `${id}: mangler ingress`);
    // Only plain text and a few harmless tags: everything from the games is escaped.
    for (const [, tag] of blokk.matchAll(/<\/?([a-z0-9]+)/g)) assert.ok(["section", "p", "h2", "h3", "h4", "ul", "ol", "li", "b", "div", "nav", "a"].includes(tag), `${id}: <${tag}> i blokken`);
    assert.equal(merkeSynlig(synligTekst(blokk)), null, `${id}: «${merkeSynlig(synligTekst(blokk))}» står synlig i blokken`);
    assert.ok(synligTekst(blokk).split(" ").length >= 100, `${id}: blokken har bare ${synligTekst(blokk).split(" ").length} ord`);
  }
});

test("examples: 20–30 real items on ordinary card games, none on 18+ games; 18+ games get the sober box", () => {
  let medEksempler = 0;
  for (const id of spillIder.filter((x) => x !== "luringen")) {
    const blokk = omBlokk(sider.find((x) => x.sti === `/${id}/`).html);
    const eksempler = [...blokk.matchAll(/<ul class="om-eksempler">([\s\S]*?)<\/ul>/g)].reduce((n, m) => n + (m[1].match(/<li>/g) || []).length, 0);
    if (atten(id)) {
      assert.equal(eksempler, 0, `${id}: 18+-spill skal ikke ha eksempler`);
      assert.match(blokk, /Alkoholfritt teller like mye/, `${id}: mangler «Alkoholfritt teller like mye»`);
      assert.match(blokk, /<a href="https:\/\/rusinfo\.no\/" rel="noopener">rusinfo\.no<\/a>/, `${id}: mangler RUSinfo`);
      assert.match(blokk, /Bare for voksne \(18\+\)/, `${id}: sier ikke 18+`);
    } else {
      assert.ok(!/om-vett|rusinfo/.test(blokk), `${id}: drikkeråd i et vanlig spill`);
      if (!eksempler) continue;
      medEksempler++;
      assert.ok(eksempler >= 20 && eksempler <= 30, `${id}: ${eksempler} eksempler`);
      assert.match(blokk, /<p class="om-mer">… og (over )?[\d ]+ til i spillet\.<\/p>/, `${id}: mangler «… og over N til i spillet»`);
    }
  }
  assert.ok(medEksempler >= 15, `bare ${medEksempler} spill har eksempler`);
});

test("the block escapes what it prints, and «over N» is always true", () => {
  const m = { id: "x", navn: "<b>X</b>", spillere: [2, 4], minutter: [5, 10], mobiler: "en" };
  const html = omSpilletHtml(m, { frase: "A & B", regler: { intro: "<script>alert(1)</script>", steg: [["<i>", '"x"'], ["a", "b"], ["c", "d"]], tips: ["<img src=x>"] }, eksempler: { tittel: "<u>", ting: ["<svg onload=x>"], totalt: 5, antall: 1 }, lenker: [["/a/", "<a>"]] });
  for (const farlig of ["<script", "<b>X", "<i>", "<img", "<svg", "<u>", "<a>"]) assert.ok(!html.includes(farlig), `«${farlig}» kom med uescapet`);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Slik spiller dere &lt;b&gt;X&lt;\/b&gt;/);
  assert.equal(flereTil(1437), "… og over 1 400 til i spillet.");
  assert.equal(flereTil(470), "… og 470 til i spillet.");
  assert.equal(flereTil(0), "");
});

// ---------- Collection pages (rusj/samlinger/*.json → /<slug>/) ----------

const samlingSlugs = () => readdirSync(join(ROT, "rusj/samlinger")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));

test("collection pages: real pages with games, steps, questions and neighbours; in the sitemap; structured data", () => {
  const slugs = samlingSlugs();
  assert.ok(slugs.length >= 10, `bare ${slugs.length} samlinger`);
  const xml = readFileSync(join(WEB, "sitemap.xml"), "utf8");
  const sw = readFileSync(join(WEB, "sw.js"), "utf8");
  for (const slug of slugs) {
    const s = sider.find((x) => x.sti === `/${slug}/`);
    assert.ok(s, `mangler /${slug}/`);
    assert.ok(xml.includes(`<loc>${DOMENE}/${slug}/</loc>`), `/${slug}/ står ikke i sitemap.xml`);
    assert.ok(sw.includes(`"/${slug}/"`), `/${slug}/ er ikke med for bruk uten nett`);
    const main = s.html.slice(s.html.indexOf('<main class="side">'), s.html.indexOf("</main>"));
    assert.equal((main.match(/<h1[ >]/g) || []).length, 1, `/${slug}/: én h1`);
    assert.match(main, /<h2 id="samling-kvelden">/, `/${slug}/: mangler «Slik legger dere opp kvelden»`);
    assert.match(main, /<dl class="samling-faq">/, `/${slug}/: mangler spørsmål og svar`);
    const naboer = [...main.matchAll(/<nav class="samling-naboer"[\s\S]*?<\/nav>/g)][0][0];
    assert.ok((naboer.match(/<a href="\/[a-z0-9-]+\/">/g) || []).length >= 2, `/${slug}/: for få nabosamlinger`);
    assert.ok(synligTekst(main).split(" ").length >= 250, `/${slug}/: bare ${synligTekst(main).split(" ").length} ord`);
    assert.equal(merkeSynlig(synligTekst(main)), null, `/${slug}/: «${merkeSynlig(synligTekst(main))}» står synlig`);
    assert.ok(!/<script(?! type="application\/ld\+json")/.test(s.html.replace(/<script defer src="\/felles\/stat\.js\?v=[a-z0-9]+"><\/script>/, "")), `/${slug}/: har skript`);
    // Structured data: the page, the list of games (exactly the games on the page) and the path.
    assert.equal(s.jsonld.length, 1);
    const g = JSON.parse(s.jsonld[0])["@graph"];
    assert.ok(g.some((n) => n["@type"] === "CollectionPage" && n.url === s.kanonisk && n.description === s.beskrivelse), `/${slug}/: CollectionPage`);
    const liste = g.find((n) => n["@type"] === "ItemList");
    const lenket = [...new Set([...main.matchAll(/<a href="\/([a-z]+)\/"/g)].map((m) => m[1]).filter((id) => spillIder.includes(id)))];
    assert.deepEqual(liste.itemListElement.map((e) => e.url).sort(), lenket.map((id) => `${DOMENE}/${id}/`).sort(), `/${slug}/: ItemList følger ikke spillene på siden`);
    assert.equal(liste.numberOfItems, liste.itemListElement.length);
    const sti = g.find((n) => n["@type"] === "BreadcrumbList").itemListElement;
    assert.equal(sti[0].item, DOMENE + "/");
    assert.equal(sti.at(-1).item, s.kanonisk);
    // 18+: only the drinking games, no cards, the sober box. Ordinary: never a drinking game, never the hub.
    const harAtten = lenket.some((id) => id !== "luringen" && atten(id));
    if (slug === "drikkeleker") {
      assert.ok(lenket.length >= 3 && lenket.every((id) => atten(id)), "/drikkeleker/: bare 18+-spill");
      assert.ok(!main.includes("samling-kort"), "/drikkeleker/: skal ikke ha spillkort");
      assert.match(main, /Alkoholfritt teller like mye/);
      assert.match(main, /href="https:\/\/rusinfo\.no\/"/);
      assert.match(s.tittel + s.og["og:title"], /18\+[\s\S]*18\+/, "/drikkeleker/: 18+ i tittel og og:title");
    } else {
      assert.ok(!harAtten, `/${slug}/: lenker til et 18+-spill`);
      assert.ok(!main.includes('href="/drikkeleker/"'), `/${slug}/: lenker til drikkelekene`);
      assert.ok(lenket.length >= 4, `/${slug}/: bare ${lenket.length} spill`);
    }
  }
  // The game pages link to the collections they are in.
  const jul = sider.find((x) => x.sti === "/bingoballen/");
  assert.match(omBlokk(jul.html), /<a href="\/julebordleker\/">Julebordleker<\/a>/);
  assert.ok(!sider.some((x) => spillIder.includes(x.sti.slice(1, -1)) && !atten(x.sti.slice(1, -1)) && x.html.includes('href="/drikkeleker/"')), "et vanlig spill lenker til /drikkeleker/");
});

test("collections are checked when they are read: unknown or 18+ games, brands, lengths and neighbours stop the build", async () => {
  const { lesSamlinger } = await import("../scripts/samlinger.mjs");
  const rot = mkdtempSync(join(tmpdir(), "rusj-samling-"));
  mkdirSync(join(rot, "rusj/samlinger"), { recursive: true });
  const ingress = ["Et avsnitt med nok ord til at siden blir en ekte side, skrevet for hånd og på naturlig norsk, med en grunn til å være her og ikke bare en liste.", "Et avsnitt til som forklarer hvordan spillene passer sammen, hvem de passer for, og hva dere trenger for å komme i gang med en gang i kveld, uten å lese en lang bruksanvisning."];
  const god = (x = {}) => ({ tittel: "Spill for testing – en side som bare er her for testen", navn: "Test", h1: "Test", beskrivelse: "En beskrivelse som er lang nok til å være innenfor grensene som bygget bruker for alle sider på rusj, og ikke lenger.", ingress, spill: [["a", "Fordi."], ["b", "Fordi."], ["c", "Fordi."], ["luringen", "Fordi."]], kvelden: [["1", "x"], ["2", "y"], ["3", "z"]], faq: [["?", "!"], ["??", "!!"]], naboer: ["to", "tre"], ...x });
  const skriv = (filer) => {
    rmSync(join(rot, "rusj/samlinger"), { recursive: true, force: true });
    mkdirSync(join(rot, "rusj/samlinger"));
    for (const [navn, innhold] of Object.entries(filer)) writeFileSync(join(rot, "rusj/samlinger", navn + ".json"), JSON.stringify(innhold));
    return lesSamlinger({ rot, spillIder: ["luringen", "a", "b", "c", "x", "y", "z", "w"], atten: ["x", "y", "z", "w"], tittelMaks: TITTEL_MAKS, beskrivelse: BESKRIVELSE_GRENSER, merke: merkeSynlig });
  };
  const tre = (en) => ({ en, to: god({ tittel: "Andre spill for testing – den andre siden i testen", beskrivelse: god().beskrivelse + " To.", naboer: ["en", "tre"] }), tre: god({ tittel: "Tredje spill for testing – den tredje siden i testen", beskrivelse: god().beskrivelse + " Tre.", naboer: ["en", "to"] }) });
  try {
    assert.equal(skriv(tre(god({ naboer: ["to", "tre"] }))).length, 3);
    assert.throws(() => skriv(tre(god({ naboer: ["to", "tre"], spill: [...god().spill, ["finnesikke", "Fordi."]] }))), /finnes ikke/);
    assert.throws(() => skriv(tre(god({ naboer: ["to", "tre"], spill: [...god().spill, ["x", "Fordi."]] }))), /18\+-spill/);
    assert.throws(() => skriv(tre(god({ naboer: ["to", "tre"], ingress: [...ingress, "Nesten som Ring of Fire, bare bedre."] }))), /merkevare/);
    assert.throws(() => skriv(tre(god({ naboer: ["to", "tre"], tittel: "x".repeat(TITTEL_MAKS) }))), /tittelen er/);
    assert.throws(() => skriv(tre(god({ naboer: ["to", "fire"] }))), /«fire» finnes ikke/);
    assert.throws(() => skriv({ ...tre(god({ naboer: ["to", "atten"] })), atten: god({ alder18: true, tittel: "Atten pluss for testing – kun for voksne i testen", beskrivelse: god().beskrivelse + " Atten.", spill: [["x", "Fordi."], ["y", "Fordi."], ["z", "Fordi."], ["w", "Fordi."]], naboer: ["en", "to"] }) }), /kan ikke lenke til 18\+-samlingen «atten»/);
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});

// ---------- Alias addresses (`alias` in spill.json): /jeg-har-aldri/ → /sladrehanken/ ----------

test("alias addresses send the visitor on: no script, not indexed, not in the sitemap or the offline list", () => {
  const kart = new Map([["imposter", "luringen"]]);
  for (const id of readdirSync(join(ROT, "rusj/spill"))) {
    const fil = join(ROT, "rusj/spill", id, "spill.json");
    if (existsSync(fil)) for (const a of JSON.parse(readFileSync(fil, "utf8")).alias || []) kart.set(a, id);
  }
  assert.ok(kart.size >= 40, `bare ${kart.size} alias`);
  const xml = readFileSync(join(WEB, "sitemap.xml"), "utf8");
  const sw = readFileSync(join(WEB, "sw.js"), "utf8");
  for (const [a, id] of kart) {
    if (!spillIder.includes(id)) continue;
    const html = videresend.get(a);
    assert.ok(html, `mangler /${a}/`);
    assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0; url=/${id}/">`), `/${a}/: sender ikke videre til /${id}/`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${DOMENE}/${id}/">`), `/${a}/: canonical`);
    assert.match(html, /<meta name="robots" content="noindex">/, `/${a}/: skal ikke indekseres`);
    assert.match(html, new RegExp(`<a href="/${id}/">`), `/${a}/: mangler lenke`);
    assert.ok(!/<script/i.test(html), `/${a}/: har script`);
    assert.ok(!xml.includes(`/${a}/`), `/${a}/ står i sitemap.xml`);
    assert.ok(!sw.includes(`"/${a}/"`), `/${a}/ står i listen for bruk uten nett`);
    assert.equal(merkeSynlig(a.replace(/-/g, " ")), null, `/${a}/ er en annens merkevare`);
  }
  // Never a third party's game name as an address (an address is visible use).
  for (const a of ["alias", "codenames", "wordle", "ring-of-fire", "kahoot", "heads-up", "pictionary", "tabu", "bezzerwizzer", "memory-spill"]) assert.ok(!kart.has(a), `/${a}/ er et alias`);
});

test("an alias that is already taken, malformed or a brand stops the build", async () => {
  const { aliasKart } = await import("../scripts/rusj.mjs");
  const lag = (spill, opptatt = ["om", "julebordleker"]) => aliasKart({ spill, opptatt, merke: merkeSynlig });
  assert.deepEqual([...lag([{ id: "a", alias: ["jeg-har-aldri", "våghalsen"] }, { id: "b" }])], [["jeg-har-aldri", "a"], ["våghalsen", "a"]]);
  assert.throws(() => lag([{ id: "a", alias: ["b"] }, { id: "b" }]), /allerede spillet b/);
  assert.throws(() => lag([{ id: "a", alias: ["julebordleker"] }]), /allerede en side/);
  assert.throws(() => lag([{ id: "a", alias: ["om"] }]), /allerede en side/);
  assert.throws(() => lag([{ id: "a", alias: ["x"] }, { id: "b", alias: ["x"] }]), /brukes også av a/);
  assert.throws(() => lag([{ id: "a", alias: ["Stor Bokstav"] }]), /små bokstaver/);
  assert.throws(() => lag([{ id: "a", alias: ["ring-of-fire"] }]), /merkevare/);
  assert.throws(() => lag([{ id: "a", alias: ["codenames"] }]), /merkevare/);
  assert.throws(() => lag([{ id: "a", alias: "x" }]), /må være en liste/);
});
