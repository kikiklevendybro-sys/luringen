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
// --probe: player names contain markup (<x-q>…</x-q>). Every screen is checked that the markup
// shows as text and never becomes an element. Only injection problems count as errors then.
const PROBE = args.includes("--probe");
if (PROBE) args.splice(args.indexOf("--probe"), 1);
// --bredde / --hoyde: phone size (default 390×844; try 320 568 for the smallest phones).
const BREDDE = Number(flagg("--bredde")) || 390;
const HOYDE = Number(flagg("--hoyde")) || 844;
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
  const c = await startChrome({ bredde: BREDDE, hoyde: HOYDE });
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
      if (PROBE) {
        const injisert = await c.js(`document.querySelectorAll("x-q").length`);
        if (injisert) feil.push(`HTML-INJEKSJON på «${navn}»: et spillernavn ble tolket som HTML (${injisert} element)`);
      }
      const bred = await c.js(`Math.max(document.documentElement.scrollWidth, window.innerWidth) - ${BREDDE}`);
      if (bred > 0) feil.push(`Sidelengs scrolling på «${navn}»: ${bred}px for bred (siden blir zoomet ut på mobil)`);
      const utenfor = await c.js(`(() => {
        const ut = [];
        for (const el of document.querySelectorAll("#skjerm *, .ark *, .portal-hoved *, .helt-slagord")) {
          if (el.closest("svg, .parade, canvas, [data-utenfor-ok]")) continue;
          let rulles = false; // inside a row that is meant to scroll sideways
          for (let f = el.parentElement; f && f !== document.body; f = f.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(f).overflowX)) { rulles = true; break; }
          }
          if (rulles) continue;
          if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          const stil = getComputedStyle(el);
          if (stil.visibility === "hidden" || Number(stil.opacity) === 0) continue;
          if (b.right > window.innerWidth + 2 || b.left < -2) ut.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + " «" + el.textContent.trim().slice(0, 30) + "»");
        }
        return ut.slice(0, 3);
      })()`);
      if (utenfor.length) feil.push(`Tekst stikker utenfor skjermen på «${navn}»: ${utenfor.join(", ")}`);
      const tomme = await c.js(`Array.from(document.querySelectorAll("button, a")).filter(b => b.offsetParent && !b.innerText.trim() && !b.getAttribute("aria-label") && !b.querySelector("svg, img")).length`);
      if (tomme) feil.push(`${tomme} knapp(er) uten tekst eller aria-label på «${navn}»`);
      await c.skjermbilde(join(mappe, `${String(++nr).padStart(2, "0")}-${navn}.png`), { helside });
    },
    tilstand: () => c.js(`JSON.parse(localStorage.getItem("rusj.${id}.v1") || "null")`),
    // Fresh start: empty storage, load the page, wait for the game to draw.
    async start(valg = {}) {
      await c.lastSide(t.side);
      await c.js("localStorage.clear()");
      const navn = valg.navn && PROBE ? valg.navn.map((n, i) => `<x-q>${String.fromCharCode(65 + i)}</x-q>`) : valg.navn;
      if (navn) await c.js(`localStorage.setItem("rusj.felles", ${JSON.stringify(JSON.stringify({ lyd: false, navn }))})`);
      else await c.js(`localStorage.setItem("rusj.felles", JSON.stringify({ lyd: false, navn: [] }))`);
      await c.lastSide(t.side, id === "forside" ? "document.querySelector('.spillgrid')" : "document.querySelector('#skjerm h1')");
    },
  };

  try {
    if (id === "forside") {
      await t.start();
      await c.sov(2600); // let the intro animation finish
      await t.bilde("forside");
      const kort = await c.antall("#spillgrid .spillkort");
      const liste = await c.js("(window.RUSJ_SPILLISTE || []).map((s) => s.id)");
      const ventet = bygget.length + (liste.includes("luringen") ? 1 : 0);
      // Drinking games are in the list but hidden until someone confirms being over 18.
      t.sjekk((await c.antall("#spillgrid .spillkort[data-alder18]:not([hidden])")) === 0 || (await c.js("document.body.classList.contains('over18')")), "Drikkespill vises før 18-årsbekreftelsen");
      t.sjekk(kort === ventet && liste.length === ventet, `Forsiden viser ${kort} spillkort, ventet ${ventet}`);
      for (const id of bygget) t.sjekk(liste.includes(id), `Forsiden mangler kortet for ${id}`);
      await c.klikk('[data-antall="1"]');
      await c.klikk('[data-antall="1"]');
      const synlige2 = await c.antall("#spillgrid .spillkort:not([hidden])");
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
  if (PROBE) {
    try {
      const injisert = await c.js(`document.querySelectorAll("x-q").length`);
      if (injisert) feil.push(`HTML-INJEKSJON på siste skjerm (${injisert} element)`);
    } catch (e) {
      /* page gone */
    }
    // In probe mode the scripted checks fail on the odd names; only injections matter.
    const injeksjoner = feil.filter((f) => f.startsWith("HTML-INJEKSJON"));
    feil.length = 0;
    feil.push(...injeksjoner);
  }
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
