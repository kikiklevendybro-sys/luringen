// End-to-end check of rusj.no in headless Google Chrome on a phone-sized screen.
// For every game: loads the page, checks the basics (title, no errors, no sideways scrolling),
// then plays it through with test/spill/<id>.e2e.mjs if that file exists. Saves screenshots.
// Usage: node test/rusj-e2e.mjs [--web dist/web] [--bilder dir] [id ...]
//   ids: game ids, "forside" (front page) or "luringen". Default: everything that was built.
import { readdirSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { startChrome, startTjener } from "./chrome.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flagg = (n) => {
  const i = args.indexOf(n);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const WEB = resolve(flagg("--web") || join(ROT, "dist/web"));
const BILDER = resolve(flagg("--bilder") || join(tmpdir(), "rusj-e2e"));
if (!existsSync(join(WEB, "index.html"))) {
  console.error(`Fant ikke ${WEB}/index.html – kjør node scripts/bygg.mjs først.`);
  process.exit(1);
}
const bygget = readdirSync(WEB).filter((d) => existsSync(join(WEB, d, "index.html")) && existsSync(join(WEB, d, "data.js")));
const valgt = args.length ? args : ["forside", ...(existsSync(join(WEB, "luringen/index.html")) ? ["luringen"] : []), ...bygget];

const tjener = await startTjener(WEB);
const resultat = [];

function meta(id) {
  const tekst = readFileSync(join(WEB, id, "data.js"), "utf8");
  const m = /window\.RUSJ_SPILL=(\{.*?\});\n/.exec(tekst);
  return m ? JSON.parse(m[1]) : { id };
}

for (const id of valgt) {
  const mappe = join(BILDER, id);
  mkdirSync(mappe, { recursive: true });
  const c = await startChrome();
  const feil = [];
  let nr = 0;
  const t = {
    ...c,
    id,
    url: tjener.url,
    side: `${tjener.url}/${id === "forside" ? "" : id + "/"}`,
    feil: (m) => feil.push(m),
    sjekk: (ok, m) => {
      if (!ok) feil.push(m);
    },
    // Screenshot + checks that apply to every screen.
    async bilde(navn, helside = false) {
      await c.sov(350);
      const bred = await c.js("Math.max(document.documentElement.scrollWidth, window.innerWidth) - 390");
      if (bred > 0) feil.push(`Sidelengs scrolling på «${navn}»: ${bred}px for bred (siden blir zoomet ut på mobil)`);
      const tomme = await c.js(`Array.from(document.querySelectorAll("button, a")).filter(b => b.offsetParent && !b.innerText.trim() && !b.getAttribute("aria-label") && !b.querySelector("svg, img")).length`);
      if (tomme) feil.push(`${tomme} knapp(er) uten tekst eller aria-label på «${navn}»`);
      await c.skjermbilde(join(mappe, `${String(++nr).padStart(2, "0")}-${navn}.png`), { helside });
    },
    tilstand: () => c.js(`JSON.parse(localStorage.getItem("rusj.${id}.v1") || "null")`),
    // Fresh start: empty storage, load the page, wait for the game to draw.
    async start(valg = {}) {
      await c.lastSide(t.side);
      await c.js("localStorage.clear()");
      if (valg.navn) await c.js(`localStorage.setItem("rusj.felles", ${JSON.stringify(JSON.stringify({ lyd: false, navn: valg.navn }))})`);
      else await c.js(`localStorage.setItem("rusj.felles", JSON.stringify({ lyd: false, navn: [] }))`);
      await c.lastSide(t.side, id === "forside" ? "document.querySelector('.spillgrid')" : "document.querySelector('#skjerm h1')");
    },
  };

  try {
    if (id === "forside") {
      await t.start();
      await c.sov(2600); // let the intro animation finish
      await t.bilde("forside");
      const kort = await c.antall(".spillkort");
      t.sjekk(kort === bygget.length + (existsSync(join(WEB, "luringen/index.html")) ? 1 : 0), `Forsiden viser ${kort} spillkort, ventet ${bygget.length + 1}`);
      await c.klikk('[data-antall="1"]');
      await c.klikk('[data-antall="1"]');
      const synlige2 = await c.antall(".spillkort:not([hidden])");
      t.sjekk(synlige2 > 0, "Ingen spill passer for 3 spillere");
      await c.klikk('#tagger .brikke:not(.alle)');
      await t.bilde("forside-filter");
      await c.klikk('[data-tagg=""]');
      await t.bilde("forside-hel", true);
      await c.lastSide("about:blank");
      await c.lastSide(`${tjener.url}/#ABCD2345`, "location.pathname.startsWith('/luringen/')");
      t.sjekk((await c.js("location.pathname")) === "/luringen/", "Gammel Luringen-lenke sendes ikke videre til /luringen/");
      await c.lastSide(`${tjener.url}/finnes-ikke/`, "document.querySelector('h1')");
      t.sjekk(/tomt/i.test(await c.tekst("h1")), "404-siden vises ikke");
      await t.bilde("404");
    } else if (id === "luringen") {
      await c.lastSide(t.side, "document.querySelector('#s-hjem h1')");
      await c.js("localStorage.clear()");
      await c.lastSide(t.side, "document.querySelector('#s-hjem h1')");
      await t.bilde("luringen-hjem");
      t.sjekk(await c.finnes('a[href="/"]'), "Luringen mangler lenke tilbake til rusj.no");
      await c.klikk('[data-h="nytt"]');
      await t.bilde("luringen-oppsett");
    } else {
      const m = meta(id);
      await t.start();
      const h1 = await c.tekst("#skjerm h1");
      t.sjekk(h1.trim() === m.navn, `Hjem-skjermen har overskriften «${h1}», ventet «${m.navn}»`);
      t.sjekk(await c.finnes("#tilportal:not([hidden])"), "Mangler rusj-knappen øverst på hjem-skjermen");
      await t.bilde("hjem");
      await c.klikk("#reglerknapp");
      t.sjekk(await c.finnes("#ark:not([hidden]) .steg li"), "Reglene vises ikke");
      await t.bilde("regler");
      await c.klikk('#ark [data-h="lukk-ark"]');
      const scenario = join(ROT, "test/spill", `${id}.e2e.mjs`);
      if (existsSync(scenario)) {
        const modul = await import(pathToFileURL(scenario).href);
        await modul.default(t);
      } else {
        feil.push(`Mangler test/spill/${id}.e2e.mjs (gjennomspilling)`);
      }
    }
  } catch (e) {
    feil.push(`Stoppet: ${e.message}`);
    try {
      await c.skjermbilde(join(mappe, "99-feil.png"));
    } catch (e2) {
      /* ignore */
    }
  }
  feil.push(...c.feil.filter((f) => !f.includes("/finnes-ikke/"))); // the 404 test asks for a missing page on purpose
  await c.lukk();
  resultat.push({ id, feil, bilder: nr });
  console.log(`${feil.length ? "✗" : "✓"} ${id}${feil.length ? "" : ` (${nr} skjermbilder)`}`);
  for (const f of feil) console.log(`    – ${f}`);
}

tjener.lukk();
const antallFeil = resultat.reduce((s, r) => s + r.feil.length, 0);
console.log(`\nSkjermbilder: ${BILDER}`);
if (antallFeil) {
  console.log(`${antallFeil} feil i ${resultat.filter((r) => r.feil.length).length} av ${resultat.length}`);
  process.exit(1);
}
console.log(`Alle ${resultat.length} besto.`);
