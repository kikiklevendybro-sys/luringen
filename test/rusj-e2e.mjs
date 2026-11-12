// End-to-end check of rusj.no in headless Google Chrome on a phone-sized screen.
// For every game: loads the page, checks the basics (title, no errors, no sideways scrolling),
// then plays it through with test/spill/<id>.e2e.mjs if that file exists. Saves screenshots.
// Usage: node test/rusj-e2e.mjs [--web dist/web] [--bilder dir] [--a11y dir] [--sprak en] [id ...]
//   ids: game ids, "forside" (front page) or "luringen". Default: everything that was built.
//   --a11y dir: also run the accessibility checker (test/a11y/) on every screenshot and write what
//   it finds to dir/funn/<id>.json. Findings are data: they never fail the run.
//   Then: node test/a11y/sammendrag.mjs dir
//   --sprak en|da: the same in another edition (rusj/SPRAK.md): /en/ for "forside", /en/<slug>/ for a
//   game published in it. The front page gets language-neutral checks; every screen is checked for
//   Norwegian words left in it, and <html lang>.
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
// --a11y dir: the accessibility checker rides along (loaded only then). One file per page, so two
// runs at the same time can share a folder.
const A11Y = flagg("--a11y");
const SPRAK = flagg("--sprak");
if (SPRAK && !["en", "da"].includes(SPRAK)) {
  console.error("--sprak må være en eller da");
  process.exit(2);
}
// Words that give Norwegian away in the other editions (Danish shares many words, so its list is short).
const NORSKE = {
  en: new Set("og ikke er på med som har kan vil det et av du dere deg din ditt dine jeg meg hva når nå igjen spill spillet spiller spillere mobilen runde runder trekk poeng vinner avslutt fortsett angre lukk tilbake ferdig neste velg trykk start spill".split(" ")),
  da: new Set("spill trykk velg igjen noe fortsett avslutt lukk uavgjort brettet deg meg dere hva gjør ble brikka".split(" ")),
};
NORSKE.en.delete("start");
const norskOrd = (tekst) => {
  const ren = String(tekst).replace(/Testspiller [A-Z]/g, " ");
  if (SPRAK === "en" && /[æøå]/i.test(ren)) return true;
  return (ren.toLocaleLowerCase("nb").match(/[a-zæøå]+/g) || []).some((o) => NORSKE[SPRAK].has(o));
};
// The game folders of the edition: id → "/en/<slug>/"
const UTGAVE = new Map();
if (SPRAK && existsSync(join(WEB, SPRAK)))
  for (const d of readdirSync(join(WEB, SPRAK))) {
    const fil = join(WEB, SPRAK, d, "data.js");
    if (!existsSync(fil)) continue;
    const m = /window\.RUSJ_SPILL=(\{.*?\});\n/.exec(readFileSync(fil, "utf8"));
    if (m) UTGAVE.set(JSON.parse(m[1]).id, `/${SPRAK}/${d}/`);
  }
const A11Y_MAPPE = A11Y ? resolve(A11Y) : null;
const lagA11y = A11Y_MAPPE ? (await import("./a11y/a11y.mjs")).lagA11y : null;
if (A11Y_MAPPE) {
  mkdirSync(join(A11Y_MAPPE, "funn"), { recursive: true });
  writeFileSync(join(A11Y_MAPPE, "meta.json"), JSON.stringify({ dato: new Date().toISOString(), web: WEB, bredde: BREDDE, hoyde: HOYDE }, null, 1));
}
if (!existsSync(join(WEB, "index.html"))) {
  console.error(`Fant ikke ${WEB}/index.html – kjør node scripts/bygg.mjs først.`);
  process.exit(1);
}
const bygget = SPRAK ? [...UTGAVE.keys()] : readdirSync(WEB).filter((d) => existsSync(join(WEB, d, "index.html")) && existsSync(join(WEB, d, "data.js")));
const valgt = args.length ? args : ["forside", ...(!SPRAK && existsSync(join(WEB, "luringen/index.html")) ? ["luringen"] : []), ...bygget];
const FORSIDE = SPRAK ? `/${SPRAK}/` : "/";
const sideFor = (id) => (id === "forside" ? FORSIDE : SPRAK ? UTGAVE.get(id) : `/${id}/`);
if (SPRAK) for (const id of valgt) if (id !== "forside" && !UTGAVE.has(id)) {
  console.error(`${id} er ikke publisert på ${SPRAK} i ${WEB} (node scripts/sprak.mjs --spill ${id} --sprak ${SPRAK})`);
  process.exit(1);
}

const tjener = await startTjener(WEB);
const resultat = [];

function meta(id) {
  const tekst = readFileSync(join(WEB, sideFor(id).slice(1), "data.js"), "utf8");
  const m = /window\.RUSJ_SPILL=(\{.*?\});\n/.exec(tekst);
  return m ? JSON.parse(m[1]) : { id };
}

for (const id of valgt) {
  const mappe = join(BILDER, id);
  mkdirSync(mappe, { recursive: true });
  const c0 = await startChrome({ bredde: BREDDE, hoyde: HOYDE });
  // With --a11y the same helpers, with clicks and gestures observed.
  const a11y = lagA11y ? await lagA11y(c0, { id, axMappe: join(A11Y_MAPPE, "ax", id) }) : null;
  const c = a11y ? a11y.chrome : c0;
  const feil = [];
  const a11yNotater = []; // what stopped an a11y-only walk: written with the findings, never a failure
  let nr = 0;
  const t = {
    ...c,
    id,
    url: tjener.url,
    side: `${tjener.url}${sideFor(id)}`,
    // The edition (rusj/SPRAK.md): scenarios check texts only in Norwegian, and find the front page
    // and the stored state where this edition keeps them.
    sprak: SPRAK || "nb",
    norsk: !SPRAK,
    forside: FORSIDE,
    nokkel: (n) => `rusj.${SPRAK ? SPRAK + "." : ""}${n}`,
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
      if (SPRAK) {
        // Another edition: the page says which language it is in, and no Norwegian is left on it
        // (visible text and the names a screen reader reads; a part marked with another lang, such
        // as the language switch, is left out).
        const lang = await c.js("document.documentElement.lang");
        if (lang !== SPRAK) feil.push(`<html lang="${lang}"> på «${navn}» (ventet ${SPRAK})`);
        const tekster = await c.js(`(() => {
          const ut = [];
          const egen = (el) => { const l = el.closest("[lang]"); return !l || l.getAttribute("lang") === document.documentElement.lang; };
          const synlig = (el) => { if (el.closest("[hidden], svg, script, style, template, noscript")) return false; const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden") return false; const b = el.getBoundingClientRect(); return b.width > 0 || b.height > 0; };
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            const el = n.parentElement;
            const x = n.textContent.trim();
            if (x && el && egen(el) && synlig(el)) ut.push(x);
          }
          for (const el of document.querySelectorAll("[aria-label], [placeholder], [title]")) {
            if (!egen(el) || !synlig(el)) continue;
            for (const a of ["aria-label", "placeholder", "title"]) if (el.getAttribute(a)) ut.push(el.getAttribute(a));
          }
          return ut;
        })()`);
        const norsk = [...new Set(tekster.filter(norskOrd))];
        if (norsk.length) feil.push(`Norsk tekst på «${navn}» (${SPRAK}): ${norsk.slice(0, 4).map((x) => `«${x.slice(0, 60)}»`).join(", ")}`);
      }
      await c.skjermbilde(join(mappe, `${String(++nr).padStart(2, "0")}-${navn}.png`), { helside });
      if (a11y) await a11y.sjekk(navn); // findings are collected, never a test failure
    },
    tilstand: () => c.js(`JSON.parse(localStorage.getItem("rusj.${SPRAK ? SPRAK + "." : ""}${id}.v1") || "null")`),
    // Is the element clear of the action area (the dock), with the page scrolled to the top?
    // Portrait: it ends above the dock. Landscape phones, where the kit makes the dock a column on
    // the right: it is beside the dock and inside the screen. `slakk` px of overlap are allowed.
    // True when there is no such element or no dock. Use this instead of comparing only top and bottom.
    friForDokk: (sel, slakk = 1) =>
      c.js(`(() => {
        window.scrollTo(0, 0);
        const el = document.querySelector(${JSON.stringify(sel)});
        const dokk = document.querySelector("#skjerm .dokk");
        if (!el || !dokk) return true;
        const a = el.getBoundingClientRect();
        const d = dokk.getBoundingClientRect();
        if (a.right <= d.left + ${Number(slakk)} || a.left >= d.right - ${Number(slakk)}) return a.bottom <= window.innerHeight + ${Number(slakk)};
        return a.bottom <= d.top + ${Number(slakk)};
      })()`),
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
    if (id === "forside" && SPRAK) {
      // Another edition's front page: language-neutral checks (the Norwegian walk is below).
      await t.start();
      const spill = [...UTGAVE.keys()];
      const forside = await c.js(`({
        kort: Array.from(document.querySelectorAll("#spillgrid .spillkort a")).map((a) => a.getAttribute("href")),
        hreflang: Array.from(document.querySelectorAll('link[rel="alternate"]')).map((l) => l.hreflang + " " + new URL(l.href).pathname),
        bryter: Array.from(document.querySelectorAll(".bunn .sprakvalg a, .bunn .sprakvalg [aria-current]")).map((a) => a.getAttribute("href") || "*"),
        bunn: Array.from(document.querySelectorAll(".bunn-lenker a")).map((a) => a.getAttribute("href")),
        h1: document.querySelector("h1") && document.querySelector("h1").textContent.trim(),
        manifest: document.querySelector('link[rel="manifest"]').getAttribute("href"),
      })`);
      t.sjekk(forside.kort.length === spill.length && forside.kort.every((h) => h.startsWith(FORSIDE)), `Forsiden på ${SPRAK} viser ${forside.kort.length} spill (${forside.kort.join(", ")}), ventet ${spill.length} under ${FORSIDE}`);
      t.sjekk(["nb /", `${SPRAK} ${FORSIDE}`, "x-default /"].every((x) => forside.hreflang.includes(x)), `hreflang på forsiden: ${forside.hreflang.join(", ")}`);
      t.sjekk(forside.bryter.length === 3 && forside.bryter.includes("/") && forside.bryter.includes("*"), `Språkvalget i bunnen: ${forside.bryter.join(", ")}`);
      t.sjekk(forside.bunn.every((h) => h.startsWith(FORSIDE)), `Bunnlenkene peker ut av utgaven: ${forside.bunn.join(", ")}`);
      t.sjekk(!!forside.h1 && forside.manifest === `${FORSIDE}manifest.webmanifest`, `Forsiden mangler h1 eller eget manifest (${forside.manifest})`);
      await t.bilde("forside");
      await t.bilde("forside-hel", true);
      // Search: a game's own name finds it.
      const navn = await c.tekst("#spillgrid .spillkort .kort-navn");
      await c.skrivInn("#sok", navn);
      await c.sov(300);
      t.sjekk((await c.antall("#spillgrid .spillkort:not([hidden])")) >= 1 && /\S/.test(await c.tekst("#treff")), `Søket etter «${navn}» fant ingenting`);
      await t.bilde("forside-sok");
      await c.klikk("#sok-tom");
      await c.klikk("#overrask");
      await c.vent("document.querySelector('#automat[open] [data-spill]:not([aria-disabled=\"true\"])')", 6000);
      await t.bilde("forside-overrask");
      await c.klikk("#automat [data-lukk]");
      for (const side of await c.js(`Array.from(document.querySelectorAll(".bunn-lenker a")).map((a) => a.getAttribute("href"))`)) {
        await c.lastSide(`${tjener.url}${side}`, "document.querySelector('h1')");
        t.sjekk(await c.js("location.pathname.startsWith('/' + document.documentElement.lang + '/')"), `${side}: ikke i utgaven`);
        await t.bilde("side-" + side.split("/").filter(Boolean).pop(), true);
      }
      // The game page links back to this edition's front page.
      if (spill.length) {
        await c.lastSide(`${tjener.url}${UTGAVE.get(spill[0])}`, "document.querySelector('#skjerm h1')");
        t.sjekk((await c.js(`document.querySelector("#tilportal").getAttribute("href")`)) === FORSIDE, "Spillets rusj-knapp går ikke til utgavens forside");
      }
    } else if (id === "forside") {
      // A headless page has no focus, so «focus» never fires; the search row moves itself on focus.
      await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      const tast = async (key, vk) => {
        await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: vk });
        await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: vk });
      };
      // Like c.vent, but an answer instead of an exception (one slow thing should not stop the rest).
      const venter = async (uttrykk, ms = 3000) => {
        try {
          await c.vent(uttrykk, ms);
          return true;
        } catch (e) {
          return false;
        }
      };
      await t.start();
      await c.sov(2600); // let the intro animation finish
      await t.bilde("forside");
      const kort = await c.antall("#spillgrid .spillkort");
      const liste = await c.js("(window.RUSJ_SPILLISTE || []).map((s) => s.id)");
      const ventet = bygget.length + (liste.includes("luringen") ? 1 : 0);

      // The words on top: «spill» and «selskapsleker», never «festspill» (that is an arts festival).
      const ord = await c.js(`({ tittel: document.title, slagord: document.querySelector(".helt-slagord").innerText.replace(/\\s+/g, " ").trim(), beskrivelse: document.querySelector('meta[name="description"]').content })`);
      t.sjekk(ord.slagord === "Spill for hele gjengen. Rett i nettleseren.", `Slagordet på forsiden: «${ord.slagord}»`);
      t.sjekk(/selskapsleker/.test(ord.tittel) && /selskapsleker/.test(ord.beskrivelse) && !/festspill/i.test(ord.tittel + ord.slagord + ord.beskrivelse), `Tittel eller beskrivelse på forsiden: «${ord.tittel}» / «${ord.beskrivelse}»`);
      // Structured data is an inline data block: the browser must be able to read it (and the
      // content rules must let it be – a violation ends up among the console errors below).
      const ld = await c.js(`(() => { try { const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)["@graph"]; return { typer: g.map((n) => n["@type"]), spill: g.find((n) => n["@type"] === "ItemList").itemListElement.length }; } catch (e) { return { feil: e.message }; } })()`);
      t.sjekk(!ld.feil && ld.typer.includes("WebSite") && ld.spill === ventet, `Strukturerte data på forsiden: ${ld.feil || `${(ld.typer || []).join(", ")}, ${ld.spill} spill (ventet ${ventet})`}`);
      // Drinking games are in the list but hidden until someone confirms being over 18.
      t.sjekk((await c.antall("#spillgrid .spillkort[data-alder18]:not([hidden])")) === 0 || (await c.js("document.body.classList.contains('over18')")), "Drikkespill vises før 18-årsbekreftelsen");
      t.sjekk(kort === ventet && liste.length === ventet, `Forsiden viser ${kort} spillkort, ventet ${ventet}`);
      for (const id of bygget) t.sjekk(liste.includes(id), `Forsiden mangler kortet for ${id}`);
      const synligeKort = (sel = "#spillgrid .spillkort") => c.js(`Array.from(document.querySelectorAll(${JSON.stringify(sel)})).filter((k) => k.offsetParent).length`);
      const alle = await synligeKort();

      // First visit: the install tip is one compact row on the first screen, and on an ordinary
      // phone a whole row of game cards fits under it.
      const forste = await c.js(`(() => { const k = document.querySelector(".hylle-rad .spillkort a"); const tips = document.querySelector("#installtips"); const b = tips.getBoundingClientRect(); return { kortBunn: k ? Math.round(k.getBoundingClientRect().bottom) : 0, tipsSynlig: !tips.hidden, tipsHoyde: Math.round(b.height), tipsBunn: Math.round(b.bottom), vh: innerHeight }; })()`);
      t.sjekk(forste.tipsSynlig && forste.tipsHoyde <= 48 && forste.tipsBunn <= forste.vh, `Installeringstipset er ikke én kompakt rad på første skjerm (${forste.tipsHoyde} px høyt, slutter på ${forste.tipsBunn} av ${forste.vh} px)`);
      if (BREDDE <= 430 && HOYDE >= 800) t.sjekk(forste.kortBunn > 0 && forste.kortBunn <= forste.vh, `Første rad med spillkort får ikke plass på første skjerm (slutter på ${forste.kortBunn} av ${forste.vh} px)`);
      const fakta = (await c.tekst(".helt-fakta")).replace(/\s+/g, " ");
      t.sjekk(/Ingen konto/.test(fakta) && !/apper/.test(fakta), `Faktaene under logoen: «${fakta}»`);

      // «Dagens utfordringer», new visitor: the shelf stands where it always has (not first), with
      // no badges and no streak. The old «I dag» strip and its slim row are gone.
      const daglige = await c.js(`(window.RUSJ_SPILLISTE || []).filter((s) => s.tagger.includes("daglig") && !s.alder18).map((s) => ({ id: s.id, navn: s.navn }))`);
      const dagligHylle = () =>
        c.js(`(() => {
          const hyller = Array.from(document.querySelectorAll("#hyller > .hylle")).map((s) => s.id);
          const gammel = !!document.querySelector("#idag, #idag-ny, .idag, .idag-ny");
          const h = document.querySelector("#hylle-daglig");
          if (!h) return { finnes: false, hyller, gammel, kort: [] };
          const rad = h.querySelector(".hylle-rad");
          const kort = Array.from(rad.querySelectorAll(".spillkort")).map((k) => {
            const a = k.querySelector("a");
            const m = k.querySelector(".kort-dagens");
            const f = k.querySelector(".kort-figur").getBoundingClientRect();
            const b = a.getBoundingClientRect();
            const mb = m ? m.getBoundingClientRect() : f;
            return { id: k.dataset.id, navn: a.getAttribute("aria-label") || "", merke: m ? m.textContent : null, ferdig: !!(m && m.classList.contains("ferdig")), skjult: !m || m.getAttribute("aria-hidden") === "true", inni: mb.left >= f.left - 0.5 && mb.right <= f.right + 0.5 && mb.top >= f.top - 0.5 && mb.bottom <= f.bottom + 0.5, storrelse: Math.round(b.width) + "×" + Math.round(b.height) };
          });
          const flamme = h.querySelector(".hylle-rekke");
          const topp = h.querySelector(".hylle-topp").getBoundingClientRect();
          return { finnes: true, hyller, gammel, kort, flamme: flamme ? { navn: flamme.getAttribute("aria-label"), tekst: flamme.textContent.trim() } : null, rulles: getComputedStyle(rad).overflowX, ute: topp.right > innerWidth + 1 || topp.left < -1 || document.documentElement.scrollWidth > innerWidth };
        })()`);
      const STATUS = / – (ferdig i dag|i gang)/;
      let nyStorrelse = "";
      if (daglige.length >= 2) {
        const h = await dagligHylle();
        nyStorrelse = h.kort.map((k) => k.storrelse).join(" ");
        t.sjekk(h.finnes && h.hyller.indexOf("hylle-daglig") > 0, `Ny besøkende: hylla «Dagens utfordringer» skal stå der den alltid har stått, ikke først (${h.hyller.join(", ")})`);
        t.sjekk(h.kort.length === daglige.length && h.kort.every((k) => k.merke === null && !STATUS.test(k.navn)) && !h.flamme, "Ny besøkende: dagens utfordringer har merker eller rekke");
        t.sjekk(!h.gammel, "«I dag»-stripa eller den slanke raden finnes fortsatt");
      }

      // The numbers agree: the hero counts every game; the line over the list says how many show now
      // and how many wait behind the 18+ question. («Overrask meg» is checked against it further down.)
      const tall = () => c.js(`({ helt: Number(document.querySelector("#helt-antall").textContent), alle: (window.RUSJ_SPILLISTE || []).length, linje: document.querySelector("#treff").textContent })`);
      const lesLinje = (linje) => /^(\d+) spill(?: \+ (\d+) for voksne \(18\+\))?/.exec(linje) || [];
      const for18 = await tall();
      const synligeSpill = Number(lesLinje(for18.linje)[1]);
      const voksneSpill = Number(lesLinje(for18.linje)[2] || 0);
      t.sjekk(for18.helt === for18.alle && synligeSpill + voksneSpill === for18.helt && synligeSpill === alle, `Antall spill stemmer ikke: logoen sier ${for18.helt}, lista sier «${for18.linje}» og viser ${alle}`);
      t.sjekk(voksneSpill === (await c.antall("#spillgrid .spillkort[data-alder18]")), `«${for18.linje}» stemmer ikke med antall drikkespill`);

      // The search field: the placeholder fits (also on the smallest phones).
      const plassholder = () => c.js(`(() => { const f = document.querySelector("#sok"); const s = getComputedStyle(f); const x = document.createElement("canvas").getContext("2d"); x.font = s.fontWeight + " " + s.fontSize + " " + s.fontFamily; const px = (n) => parseFloat(s[n]) || 0; return { tekst: f.placeholder, bredde: Math.ceil(x.measureText(f.placeholder).width), rom: Math.floor(f.getBoundingClientRect().width - px("paddingLeft") - px("paddingRight") - px("borderLeftWidth") - px("borderRightWidth")) }; })()`);
      let ph = await plassholder();
      t.sjekk(ph.tekst === "Søk etter spill" && ph.bredde <= ph.rom, `Plassholderen «${ph.tekst}» får ikke plass i søkefeltet (${ph.bredde} px tekst, ${ph.rom} px rom)`);

      // The shelves: names on one line across a shelf, and icons that show on the dark background.
      const hyller = await c.js(`(() => {
        const skjeve = [];
        for (const h of document.querySelectorAll(".hylle")) {
          const topper = new Set(Array.from(h.querySelectorAll(".spillkort a")).map((a) => Math.round(a.querySelector(".kort-navn").getBoundingClientRect().top - a.getBoundingClientRect().top)));
          if (topper.size > 1) skjeve.push(h.getAttribute("aria-label"));
        }
        const ikoner = Array.from(document.querySelectorAll(".hylle h3 > span[aria-hidden]")).map((el) => {
          const l = document.createElement("canvas");
          l.width = l.height = 48;
          const x = l.getContext("2d");
          x.font = "32px " + getComputedStyle(document.body).fontFamily;
          x.textBaseline = "top";
          x.fillStyle = "#000";
          x.fillText(el.textContent, 4, 6);
          const d = x.getImageData(0, 0, 48, 48).data;
          let n = 0, morke = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            n++;
            if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 60) morke++;
          }
          return { ikon: el.textContent, mork: n ? morke / n : 1 };
        });
        return { skjeve, ikoner };
      })()`);
      t.sjekk(hyller.skjeve.length === 0, `Spillnavnene står ikke på linje på hylla: ${hyller.skjeve.join(", ")}`);
      t.sjekk(new Set(hyller.ikoner.map((i) => i.ikon)).size === hyller.ikoner.length, "To hyller har samme ikon");
      const morkeIkoner = hyller.ikoner.filter((i) => i.mork > 0.5).map((i) => i.ikon);
      t.sjekk(morkeIkoner.length === 0, `Hylleikon som nesten forsvinner på mørk bakgrunn: ${morkeIkoner.join(" ")}`);

      // The facts on the cards: players, phones and time, from the game list (never typed in by
      // hand), the badges «Dagens» and «Mot mobilen», and the same as one sentence in the link's name.
      const MOBILER = { en: { tekst: "1 mobil", kort: "1", lest: "én mobil" }, hver: { tekst: "Hver sin mobil", kort: "flere", lest: "hver sin mobil" }, begge: { tekst: "1 eller flere mobiler", kort: "1+", lest: "én eller flere mobiler" } };
      const omrade = ([fra, til]) => (fra === til ? String(fra) : `${fra}–${til}`);
      const kortene = await c.js(`(window.RUSJ_SPILLISTE || []).map((s) => {
        const k = document.querySelector('#spillgrid .spillkort[data-id="' + s.id + '"]');
        const t = (sel) => { const e = k.querySelector(sel); return e ? e.textContent.replace(/\\s+/g, " ").trim() : null; };
        const synlige = Array.from(k.querySelectorAll(".kort-fakta > span")).filter((x) => x.offsetParent);
        const ramme = k.getBoundingClientRect();
        return {
          id: s.id, spillere: s.spillere, minutter: s.minutter, mobiler: s.mobiler, daglig: s.tagger.includes("daglig"), mot: !!s.motMobilen, alder18: !!s.alder18,
          vist: { spillere: t(".kort-spillere"), mobiler: t(".kort-mobiler .fakta-lang"), tid: t(".kort-tid"), merker: Array.from(k.querySelectorAll(".kort-merke")).map((m) => m.textContent).join(" + ") },
          navn: k.querySelector("a").getAttribute("aria-label"),
          synlige: synlige.length,
          linjer: new Set(synlige.map((x) => Math.round(x.getBoundingClientRect().top))).size,
          ute: synlige.some((x) => x.getBoundingClientRect().right > ramme.right - 4) || Array.from(k.querySelectorAll(".kort-merke")).some((x) => x.offsetParent && x.getBoundingClientRect().right > ramme.right - 4),
          ikoner: synlige.every((x) => { const i = x.querySelector("svg"); return i && i.getBoundingClientRect().width >= 10; }),
        };
      })`);
      const lest = (k) => {
        const [a2, b2] = k.spillere;
        const [fra, til] = k.minutter;
        const deler = [a2 === b2 ? (a2 === 1 ? "én spiller" : `${a2} spillere`) : `${a2} til ${b2} spillere`, MOBILER[k.mobiler].lest, fra === til ? `${fra} minutter` : `${fra} til ${til} minutter`];
        if (k.daglig) deler.push("ny oppgave hver dag");
        if (k.mot) deler.push("kan spilles mot mobilen");
        if (k.alder18) deler.push("for voksne over 18 år");
        const setning = deler.join(", ") + ".";
        return setning.charAt(0).toUpperCase() + setning.slice(1);
      };
      for (const k of kortene) {
        const ventetVist = { spillere: omrade(k.spillere), mobiler: MOBILER[k.mobiler].tekst, tid: `${omrade(k.minutter)} min`, merker: [k.daglig && "Dagens", k.mot && "Mot mobilen"].filter(Boolean).join(" + ") };
        t.sjekk(JSON.stringify(k.vist) === JSON.stringify(ventetVist), `Kortet for ${k.id} viser ${JSON.stringify(k.vist)}, ventet ${JSON.stringify(ventetVist)}`);
        t.sjekk(k.navn.endsWith(" " + lest(k)), `Kortet for ${k.id} leses som «${k.navn}», ventet at det slutter med «${lest(k)}»`);
        // In the list (drinking games are hidden for now): three facts on one line, inside the card.
        if (!k.alder18) t.sjekk(k.synlige === 3 && k.linjer === 1 && !k.ute && k.ikoner, `Kortet for ${k.id}: ${k.synlige} fakta på ${k.linjer} linje(r)${k.ute ? ", noe stikker ut av kortet" : ""}${k.ikoner ? "" : ", et ikon mangler"}`);
      }
      if (ventet > 20) t.sjekk(kortene.some((k) => k.mot) && kortene.some((k) => !k.mot && k.spillere[0] === 1 && k.spillere[1] > 1), "«Mot mobilen» ser ut til å være gjettet ut fra antall spillere (ingen spill for 1–flere mangler merket)");
      // On the shelves: two chips – players and phones in short – on one line, and no badges.
      const flisene = await c.js(`Array.from(document.querySelectorAll(".hylle-rad .spillkort")).map((k) => {
        const f = Array.from(k.querySelectorAll(".kort-fakta > span")).filter((x) => x.offsetParent);
        const ramme = k.getBoundingClientRect();
        return { id: k.dataset.id, tekst: f.map((x) => x.innerText.replace(/\\s+/g, " ").trim()).join(" | "), linjer: new Set(f.map((x) => Math.round(x.getBoundingClientRect().top))).size, ute: f.some((x) => x.getBoundingClientRect().right > ramme.right - 4), merker: Array.from(k.querySelectorAll(".kort-merke")).filter((x) => x.offsetParent).length };
      })`);
      const skjeveFliser = flisene.filter((fl) => { const k = kortene.find((x) => x.id === fl.id); return fl.tekst !== `${omrade(k.spillere)} | ${MOBILER[k.mobiler].kort}` || fl.linjer !== 1 || fl.ute || fl.merker; });
      t.sjekk(flisene.length > 0 && skjeveFliser.length === 0, `Hyllekort med feil fakta eller fakta som ikke får plass: ${skjeveFliser.slice(0, 4).map((fl) => `${fl.id} «${fl.tekst}» (${fl.linjer} linjer)`).join(", ")}`);

      // The mascot parade: filled by portal.js, never a drinking game, doubled for the loop.
      const parade = await c.js(`(() => { const f = Array.from(document.querySelectorAll("#parade .parade-figur")); const ids = f.map((a) => a.getAttribute("href").split("/")[1]); const atten = (window.RUSJ_SPILLISTE || []).filter((s) => s.alder18).map((s) => s.id); return { n: f.length, skjult: f.filter((a) => a.getAttribute("aria-hidden") === "true").length, atten: ids.filter((i) => atten.includes(i)).length, fokus: f.filter((a) => a.tabIndex >= 0).length }; })()`);
      t.sjekk(parade.n > 0 && parade.skjult === parade.n / 2, `Paraden er tom eller ikke doblet (${parade.n} figurer, ${parade.skjult} skjult)`);
      t.sjekk(parade.atten === 0, "Paraden viser drikkespill");
      t.sjekk(parade.fokus === 0, "Paradefigurene kan få tastaturfokus");

      // Keyboard: the first stops come in reading order, and each one shows where the focus is.
      const stopp = [];
      for (let i = 0; i < 8; i++) {
        await tast("Tab", 9);
        await c.sov(80);
        stopp.push(
          await c.js(`(() => { const e = document.activeElement; const s = getComputedStyle(e); const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2) || (e.id === "sok" && s.borderTopColor === "rgb(255, 210, 63)"); return (e.id ? "#" + e.id : e.matches('a[href="#spill"]') ? "finn" : String(e.className).split(" ")[0] || e.tagName) + (ring ? "" : " (uten synlig fokus)"); })()`),
        );
      }
      const ventetStopp = ["finn", "#overrask", "#installtips-vis", "#installtips-lukk", "#sok", "#filter-knapp", "hylle-alle", "A"].slice(0, 8); // A: the first card on the first shelf
      t.sjekk(stopp.join(" → ") === ventetStopp.join(" → "), `Tab-rekkefølgen på forsiden: ${stopp.join(" → ")}`);
      // Backwards from the last game: what gets focus is scrolled to the top of the screen, and must
      // not end up under the search row that sticks there.
      await c.js(`(() => { const a = Array.from(document.querySelectorAll("#spillgrid .spillkort a")).filter((x) => x.offsetParent); a[a.length - 1].focus(); })()`);
      await c.sov(200);
      const dekket = [];
      for (let i = 0; i < 8; i++) {
        await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
        await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
        await c.sov(80);
        const under = await c.js(`(() => { const e = document.activeElement; const l = document.querySelector("#filter").getBoundingClientRect(); const b = e.getBoundingClientRect(); return !e.closest("#filter") && l.top <= 0 && b.top < l.bottom - 2 ? (e.getAttribute("href") || e.className) + " (" + Math.round(l.bottom - b.top) + " px)" : ""; })()`);
        if (under) dekket.push(under);
      }
      t.sjekk(dekket.length === 0, `Fokus havner under søkelinja når man tabber bakover: ${dekket.join(", ")}`);
      await c.js("document.activeElement.blur(); scrollTo(0, 0)");
      await c.sov(400);

      // The search row sticks to the top. It must never change height there, and the page must not
      // jump as it passes that point (that once made slow scrolling get stuck). Once the page has
      // scrolled in under it, it gets its solid background.
      const glid = await c.js(`(async () => {
        const linje = document.querySelector("#filter");
        scrollTo(0, 0);
        const feste = Math.round(linje.getBoundingClientRect().top + scrollY);
        const hoyder = new Set(), sider = new Set();
        let hopp = 0;
        for (let y = feste - 30; y <= feste + 60; y += 2) {
          scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          hoyder.add(linje.offsetHeight);
          sider.add(document.documentElement.scrollHeight);
          if (Math.abs(scrollY - y) > 1) hopp++;
        }
        await new Promise((r) => setTimeout(r, 400));
        const fast = linje.classList.contains("fast");
        scrollTo(0, 0);
        return { hoyder: [...hoyder], sider: sider.size, hopp, fast };
      })()`);
      t.sjekk(glid.hoyder.length === 1 && glid.sider === 1 && glid.hopp === 0, `Søkelinja endrer høyde eller siden hopper der den fester seg (høyder: ${glid.hoyder.join("/")} px, ${glid.sider} sidehøyder, ${glid.hopp} hopp)`);
      t.sjekk(glid.fast, "Søkelinja får ikke bakgrunn når siden har rullet inn under den");
      const linjeHoyde = glid.hoyder[0];
      await c.sov(300);

      // Search: focus moves the search row to the top (room for the keyboard), typing narrows the
      // list, and the matches come right under the row.
      await c.js("document.querySelector('#sok').focus()");
      t.sjekk(await venter("document.querySelector('#filter').getBoundingClientRect().top <= 1"), "Søkefeltet flyttes ikke til toppen når det får fokus");
      await c.skrivInn("#sok", "Quiz");
      await c.sov(700);
      const treff = await synligeKort();
      t.sjekk(treff > 0 && treff < alle, `Søket «Quiz» viser ${treff} av ${alle} spill`);
      t.sjekk(await c.js("document.querySelector('#hyller').hidden"), "Hyllene vises fortsatt under søket");
      const sokt = await c.js(`(() => { const l = document.querySelector("#filter").getBoundingClientRect(); const k = Array.from(document.querySelectorAll("#spillgrid .spillkort")).find((x) => x.offsetParent).getBoundingClientRect(); return { topp: Math.round(l.top), hoyde: Math.round(l.height), kort: Math.round(k.top), vh: innerHeight }; })()`);
      t.sjekk(sokt.topp <= 1 && sokt.kort < sokt.vh / 2, `Treffene kommer ikke øverst, rett under søkefeltet (søkefeltet på ${sokt.topp} px, første treff på ${sokt.kort} av ${sokt.vh} px)`);
      t.sjekk(sokt.hoyde === linjeHoyde, `Søkelinja endrer høyde under søk (${linjeHoyde} → ${sokt.hoyde} px)`);
      await t.bilde("forside-sok");
      await c.klikk("#sok-tom");
      t.sjekk((await synligeKort()) === alle, "«Tøm søket» viser ikke alle spillene igjen");
      // The same from far down the list, where the search row is stuck to the top: a new search
      // brings the page back to where its matches begin.
      await c.js("scrollTo(0, document.documentElement.scrollHeight)");
      await c.sov(300);
      await c.skrivInn("#sok", "Quiz");
      await c.sov(900);
      const dypt = await c.js(`(() => { const k = Array.from(document.querySelectorAll("#spillgrid .spillkort")).find((x) => x.offsetParent).getBoundingClientRect(); return { kort: Math.round(k.top), vh: innerHeight }; })()`);
      t.sjekk(dypt.kort > 0 && dypt.kort < dypt.vh / 2, `Et søk langt nede på siden viser ikke treffene (første treff på ${dypt.kort} av ${dypt.vh} px)`);
      await c.klikk("#sok-tom");

      // The words people actually use find the games: what a game is called elsewhere, and the
      // occasion («vors», «bursdag» …). They come from rusj/seo.json.
      const finner = { alias: "skravla", imposter: "luringen", "nødt": "vaghalsen", pekeleken: "pekefingeren", "secret santa": "nissen", ludo: "brikka", mafia: "varulven", musikk: "nynneren", "bli kjent": "lognhalsen" };
      const anledninger = ["vors", "bursdag", "hyttetur", "selskapsleker", "festleker", "julebord", "klassefest", "leker til barnebursdag"];
      const sokeTreff = await c.js(`(() => {
        const felt = document.querySelector("#sok");
        const ut = {};
        for (const q of ${JSON.stringify([...Object.keys(finner), ...anledninger, "xyzzy"])}) {
          felt.value = q;
          felt.dispatchEvent(new Event("input", { bubbles: true }));
          ut[q] = Array.from(document.querySelectorAll("#spillgrid .spillkort")).filter((k) => k.offsetParent).map((k) => k.dataset.id);
        }
        felt.value = "";
        felt.dispatchEvent(new Event("input", { bubbles: true }));
        return ut;
      })()`);
      for (const [q, id] of Object.entries(finner)) if (liste.includes(id)) t.sjekk(sokeTreff[q].includes(id), `Søket «${q}» finner ikke ${id} (fant: ${sokeTreff[q].join(", ") || "ingenting"})`);
      if (ventet > 20) for (const q of anledninger) t.sjekk(sokeTreff[q].length >= 3, `Søket «${q}» gir bare ${sokeTreff[q].length} treff`);
      t.sjekk(sokeTreff.xyzzy.length === 0, "Et tulleord gir treff i søket");
      // The facts on the cards can be searched for: how many phones, alone, against the phone.
      const faktasok = { "flere mobiler": (k) => k.mobiler !== "en", "én mobil": (k) => k.mobiler !== "hver", "hver sin mobil": (k) => k.mobiler !== "en", alene: (k) => k.spillere[0] === 1, "mot mobilen": (k) => k.mot };
      const faktaTreff = await c.js(`(() => {
        const felt = document.querySelector("#sok");
        const ut = {};
        for (const q of ${JSON.stringify(Object.keys(faktasok))}) {
          felt.value = q;
          felt.dispatchEvent(new Event("input", { bubbles: true }));
          ut[q] = Array.from(document.querySelectorAll("#spillgrid .spillkort")).filter((k) => k.offsetParent).map((k) => k.dataset.id).sort();
        }
        felt.value = "";
        felt.dispatchEvent(new Event("input", { bubbles: true }));
        return ut;
      })()`);
      for (const [q, passerSpill] of Object.entries(faktasok)) {
        const ventetTreff = kortene.filter((k) => !k.alder18 && passerSpill(k)).map((k) => k.id).sort();
        t.sjekk(faktaTreff[q].join(",") === ventetTreff.join(","), `Søket «${q}» gir ${faktaTreff[q].length} spill, ventet ${ventetTreff.length} (${ventetTreff.filter((id) => !faktaTreff[q].includes(id)).concat(faktaTreff[q].filter((id) => !ventetTreff.includes(id))).slice(0, 5).join(", ")})`);
      }
      t.sjekk((await synligeKort()) === alle, "Lista er ikke tilbake etter søkene");

      // The filter button opens and closes the panel; the badge counts the active filters.
      t.sjekk(await c.js("document.querySelector('#filtre').hidden && document.querySelector('#filter-knapp').getAttribute('aria-expanded') === 'false'"), "Filterpanelet er åpent før det er valgt noe");
      await c.klikk("#filter-knapp");
      t.sjekk(await c.js("!document.querySelector('#filtre').hidden && document.querySelector('#filter-knapp').getAttribute('aria-expanded') === 'true'"), "Filterknappen åpner ikke panelet");
      await c.klikk('[data-antall="1"]');
      await c.klikk('[data-antall="1"]');
      const synlige2 = await c.antall("#spillgrid .spillkort:not([hidden])");
      t.sjekk(synlige2 > 0, "Ingen spill passer for 3 spillere");
      await c.klikk("#tagger .brikke:not(.alle)");
      t.sjekk((await c.tekst("#filter-antall")).trim() === "2", "Filterknappen viser ikke 2 aktive filtre");
      ph = await plassholder();
      t.sjekk(ph.bredde <= ph.rom, `Plassholderen får ikke plass i søkefeltet når filtertelleren vises (${ph.bredde} px tekst, ${ph.rom} px rom)`);
      await t.bilde("forside-filter");
      // Typing a search puts a tall panel away (it would hide the matches above the keyboard).
      const panelHoyt = await c.js("document.querySelector('#filtre').getBoundingClientRect().height > (window.visualViewport ? visualViewport.height : innerHeight) * 0.35");
      await c.skrivInn("#sok", "a");
      t.sjekk((await c.js("document.querySelector('#filtre').hidden")) === panelHoyt, panelHoyt ? "Et høyt filterpanel blir stående over treffene når det søkes" : "Filterpanelet lukkes under søk selv om det er plass til det");
      await c.klikk("#sok-tom");
      if (await c.js("document.querySelector('#filtre').hidden")) await c.klikk("#filter-knapp");
      await c.klikk('#tagger [data-tagg=""]');
      await c.klikk('[data-antall="-1"]');
      await c.klikk('[data-antall="-1"]'); // 3 → 2 → alle
      t.sjekk(await c.js("document.querySelector('#filter-antall').hidden"), "Filtertelleren vises uten aktive filtre");
      await c.klikk("#filter-knapp");
      t.sjekk(await c.js("document.querySelector('#filtre').hidden"), "Filterknappen lukker ikke panelet");

      // A search for drinking games before anyone has said they are 18: one row «Drikkespill (18+)»
      // that opens the question – not «no games fit». After «Ja» the games are right there.
      const atten = await c.antall("#spillgrid .spillkort[data-alder18]");
      if (atten) {
        for (const q of ["drikkeleker", "drikkespill"]) {
          await c.skrivInn("#sok", q);
          const dor = await c.js(`({ rad: !!document.querySelector("#atten-dor").offsetParent, tekst: document.querySelector("#atten-dor").innerText.replace(/\\s+/g, " "), ingen: !document.querySelector("#ingen-treff").hidden, linje: document.querySelector("#treff").textContent })`);
          t.sjekk(dor.rad && /Drikkespill \(18\+\)/.test(dor.tekst) && !dor.ingen, `Søket «${q}» viser ikke raden «Drikkespill (18+)» (rad: ${dor.rad}, «ingen spill passer»: ${dor.ingen})`);
          t.sjekk(new RegExp(`\\+ ${atten} for voksne`).test(dor.linje), `Søket «${q}»: linja over treffene sier «${dor.linje}»`);
          t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === 0, `Søket «${q}» viser drikkespill før 18-årsbekreftelsen`);
        }
        await c.sov(700);
        await t.bilde("forside-drikkeleker");
        await c.skrivInn("#sok", "sudoku");
        t.sjekk(!(await c.js(`!!document.querySelector("#atten-dor").offsetParent`)), "Raden «Drikkespill (18+)» vises for et søk som ikke gjelder drikkespill");
        await c.skrivInn("#sok", "drikkeleker");
        await c.klikk("#atten-dor button");
        t.sjekk(await c.js("document.querySelector('#dialog').open"), "Raden «Drikkespill (18+)» åpner ikke 18+-dialogen");
        // The answer is a whole sentence: it must stay on one line, also on the smallest phones.
        const svarLinjer = await c.js(`(() => { const k = document.querySelector('#dialog [value="ja"]'); const r = document.createRange(); r.selectNodeContents(k); return new Set(Array.from(r.getClientRects()).map((b) => Math.round(b.top))).size; })()`);
        t.sjekk(svarLinjer === 1, `«Ja, jeg er 18 eller eldre» står på ${svarLinjer} linjer i dialogen`);
        await c.klikk('#dialog [value="nei"]');
        t.sjekk(await c.js(`!document.querySelector("#dialog").open && !!document.querySelector("#atten-dor").offsetParent && !document.body.classList.contains("over18")`), "«Nei» i 18+-dialogen lukker ikke bare dialogen");
        await c.klikk("#atten-dor button");
        await c.klikk('#dialog [value="ja"]');
        t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === atten && !(await c.js(`!!document.querySelector("#atten-dor").offsetParent`)), "Drikkespillene vises ikke som treff etter «Ja»");
        t.sjekk(await c.js("!!document.activeElement.closest('#spillgrid .spillkort[data-alder18]')"), "Fokus havner ikke på det første drikkespillet blant treffene etter «Ja»");
        // Back to «not confirmed» for the checks below.
        await c.klikk("#sok-tom");
        await c.klikk("[data-skjul18]");
        t.sjekk(!(await c.js("document.body.classList.contains('over18')")), "«Skjul» virker ikke etter et søk");
      }

      // 18+: hidden until confirmed in the dialog, then focus lands on the drinking shelf.
      if (atten) {
        t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === 0, "Drikkespill vises før 18-årsbekreftelsen");
        await c.klikk("[data-vis18]");
        t.sjekk(await c.js("document.querySelector('#dialog').open"), "18+-dialogen åpnes ikke");
        await t.bilde("forside-18");
        await c.klikk('#dialog [value="ja"]');
        t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === atten, "Drikkespillene vises ikke etter «Ja»");
        t.sjekk(await c.js("!!document.activeElement.closest('.hylle-18')"), "Fokus havner ikke på drikkespill-hylla etter «Ja»");
        const etter18 = await tall();
        t.sjekk(Number(lesLinje(etter18.linje)[1]) === etter18.helt && !lesLinje(etter18.linje)[2], `Etter «Ja» sier lista «${etter18.linje}», logoen ${etter18.helt}`);
        await c.klikk("[data-skjul18]");
        t.sjekk((await synligeKort("#spillgrid .spillkort[data-alder18]")) === 0, "«Skjul» skjuler ikke drikkespillene");
        t.sjekk(await c.js("document.activeElement !== document.body"), "Fokus forsvinner etter «Skjul»");
      }

      // «Overrask meg»: the slot machine opens on the screen, picks among the games that show now
      // (never an 18+ game), and Escape closes it.
      await c.klikk("#overrask");
      t.sjekk(await c.js("document.querySelector('#automat').open"), "«Overrask meg» åpner ikke automaten");
      await c.vent("document.querySelector('#automat [data-spill]').getAttribute('aria-disabled') === 'false'", 5000);
      const valgt = await c.js("document.querySelector('#automat-svar b')?.textContent || ''");
      const valgt18 = await c.js(`(window.RUSJ_SPILLISTE || []).some((s) => s.alder18 && s.navn === ${JSON.stringify(valgt)})`);
      t.sjekk(valgt && !valgt18, `Automaten valgte «${valgt}»${valgt18 ? " (et drikkespill)" : ""}`);
      const blant = Number((/Blant (\d+) spill/.exec(await c.tekst("#automat-under")) || [])[1]);
      t.sjekk(blant === synligeSpill, `Automaten sier «Blant ${blant} spill», lista sier ${synligeSpill}`);
      const boks = await c.js(`(() => { const r = document.querySelector("#automat").getBoundingClientRect(); const i = document.querySelector("#automat .automat-inn").getBoundingClientRect(); return { topp: Math.round(Math.min(r.top, i.top)), bunn: Math.round(Math.max(r.bottom, i.bottom)), venstre: Math.round(r.left), hoyre: Math.round(r.right), vh: innerHeight, vw: innerWidth }; })()`);
      t.sjekk(boks.topp >= 0 && boks.bunn <= boks.vh && boks.venstre >= 0 && boks.hoyre <= boks.vw, `Automaten får ikke plass på skjermen (${boks.topp}–${boks.bunn} av ${boks.vh} px høyde)`);
      await t.bilde("forside-overrask");
      await c.klikk("#automat [data-en-til]");
      await c.vent("document.querySelector('#automat [data-spill]').getAttribute('aria-disabled') === 'false'", 5000);
      await tast("Escape", 27);
      await c.sov(200);
      t.sjekk(await c.js("!document.querySelector('#automat').open"), "Escape lukker ikke automaten");
      t.sjekk(await c.js("document.activeElement && document.activeElement.id === 'overrask'"), "Fokus går ikke tilbake til «Overrask meg»");

      // «Send rusj til gjengen»: a sheet with a big QR code for rusj.no, «Skann for å bli med» and
      // «Del lenken»; it fits the screen, closes, and focus goes back to the button. Inside an app's
      // own browser (here Instagram's user agent) a slim hint says to open the real browser.
      const qrArk = async () => {
        await c.js(`document.querySelector("#send-rusj").scrollIntoView({ block: "center" })`);
        await c.klikk("#send-rusj");
        await c.vent("document.querySelector('#dialog').open && document.querySelector('#dialog .qr-ark')", 5000);
        return c.js(`(() => {
          const d = document.querySelector("#dialog");
          const svg = d.querySelector(".qr-stor svg");
          const b = d.getBoundingClientRect();
          const q = svg ? svg.getBoundingClientRect() : { width: 0 };
          return { svg: !!svg && !!svg.querySelector("path"), qrBredde: Math.round(q.width), tekst: d.innerText, tips: !!d.querySelector(".innebygd-tips"), del: !!d.querySelector("#del-lenken"), fokus: document.activeElement && document.activeElement.id, topp: Math.round(b.top), bunn: Math.round(b.bottom), vh: innerHeight };
        })()`);
      };
      const qr = await qrArk();
      t.sjekk(qr.svg && qr.qrBredde >= Math.min(200, qr.vh * 0.4), `QR-koden i «Send rusj til gjengen» mangler eller er for liten (${qr.qrBredde} px)`);
      t.sjekk(/Skann for å bli med/.test(qr.tekst) && qr.del && !qr.tips, `«Send rusj til gjengen» mangler tekst eller «Del lenken», eller viser app-tipset i en vanlig nettleser: ${qr.tekst}`);
      t.sjekk(qr.topp >= 0 && qr.bunn <= qr.vh, `«Send rusj til gjengen» får ikke plass på skjermen (${qr.topp}–${qr.bunn} av ${qr.vh} px)`);
      t.sjekk(qr.fokus === "del-lenken", `Fokus starter ikke på «Del lenken» (${qr.fokus})`);
      await t.bilde("forside-send-rusj");
      await c.js(`window.__delt = null; navigator.share = undefined; Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true })`);
      await c.klikk("#del-lenken");
      await c.sov(150);
      t.sjekk((await c.js("window.__delt")) === "https://rusj.no/" && /kopiert/.test(await c.tekst("#qr-melding")), "«Del lenken» kopierer ikke rusj.no uten delingsmeny");
      await c.klikk('#dialog [value="ok"]');
      await c.sov(150);
      t.sjekk(await c.js("!document.querySelector('#dialog').open && document.activeElement && document.activeElement.id === 'send-rusj'"), "«Lukk» lukker ikke arket, eller fokus går ikke tilbake til «Send rusj til gjengen»");
      const vanligUa = await c.js("navigator.userAgent");
      await c.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 356.0.0.21.107" });
      await c.lastSide(t.side, "document.querySelector('.spillgrid')");
      const qrApp = await qrArk();
      t.sjekk(qrApp.tips && /Åpne i nettleseren for å installere og lagre/.test(qrApp.tekst), "Tipset for app-nettlesere mangler inne i Instagram");
      t.sjekk(/Instagram/.test(await c.tekst("#installer-tekst")), "«Ha rusj på hjemskjermen» viser installeringsstegene inne i Instagram");
      await t.bilde("forside-send-rusj-instagram");
      await tast("Escape", 27);
      await c.sov(150);
      t.sjekk(await c.js("!document.querySelector('#dialog').open && document.activeElement && document.activeElement.id === 'send-rusj'"), "Escape lukker ikke «Send rusj til gjengen», eller fokus går ikke tilbake");
      await c.send("Emulation.setUserAgentOverride", { userAgent: vanligUa });
      await c.lastSide(t.side, "document.querySelector('.spillgrid')");

      // «Fortsett der dere slapp» shows a game with saved, in-progress state (two lines of text and
      // a «Fortsett» badge in ordinary case). «Kveldens gjeng» shows the three best, and everyone
      // on «Vis alle».
      const fortsettId = bygget.find((i) => !meta(i).alder18);
      const navn = ["Ada", "Bo", "Cia", "Dag", "Eli", "Fia", "Gro"];
      const kveld = (spill) => `localStorage.setItem("rusj.kveld", ${JSON.stringify(JSON.stringify({ start: Date.now(), spill }))})`;
      await c.js(`localStorage.setItem("rusj.${fortsettId}.v1", JSON.stringify({ _aktiv: true, _tid: Date.now(), skjerm: "spill" }))`);
      // Four players with points (Ada 5, Dag 3, Bo 2, Cia 1) and three without.
      await c.js(kveld([{ id: "x", resultat: navn.map((n, i) => ({ navn: n, plass: Math.min(i + 1, 4) })) }, { id: "y", resultat: [{ navn: "Dag", plass: 1 }, { navn: "Ada", plass: 2 }] }]));
      await c.lastSide(t.side, "document.querySelector('.spillgrid')");
      await c.sov(2600);
      t.sjekk(await c.finnes(`#fortsett:not([hidden]) #fortsett-rad .spillkort[data-id="${fortsettId}"] .kort-fortsett`), `«Fortsett»-raden viser ikke ${fortsettId}`);
      const merke = await c.js(`(() => { const m = document.querySelector("#fortsett-rad .kort-fortsett"); const l = document.querySelector("#fortsett-rad .kort-linje"); return m && l ? { tekst: m.textContent, form: getComputedStyle(m).textTransform, linjer: getComputedStyle(l).webkitLineClamp } : null; })()`);
      t.sjekk(merke && merke.tekst === "Fortsett" && merke.form === "none", `«Fortsett»-merket er ikke i vanlig skrift (${merke && merke.form})`);
      t.sjekk(merke && merke.linjer === "2", "Fortsett-kortet viser ikke to linjer tekst");
      const tavle = () => c.js(`Array.from(document.querySelectorAll("#kveld-liste li:not([hidden])")).map((li) => li.querySelector(".kveld-navn").textContent)`);
      t.sjekk((await tavle()).join(",") === "Ada,Dag,Bo", `Kveldens gjeng viser ikke de tre beste (${(await tavle()).join(", ")})`);
      await t.bilde("forside-fortsett");
      // Back from a game (the page comes from the browser's memory) with a new evening where only
      // two have points: the rows with 0 points stay hidden until «Vis alle».
      await c.js(kveld([{ id: "z", resultat: navn.map((n, i) => ({ navn: n, plass: i < 2 ? i + 1 : 4 })) }]));
      await c.js(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
      await c.sov(150);
      t.sjekk((await tavle()).join(",") === "Ada,Bo", `Kveldens gjeng viser spillere uten poeng før «Vis alle» (${(await tavle()).join(", ")})`);
      // Luringen keeps its own saved state. It is «in progress» for 12 hours like the other games:
      // not for ever after one round, and not at all without the time it was saved.
      if (liste.includes("luringen")) {
        const lurRad = async (tid) => {
          await c.js(`localStorage.setItem("luringen.v1", JSON.stringify({ spill: { skjerm: "diskusjon" }${tid ? `, _tid: ${tid}` : ""} }))`);
          await c.js(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
          await c.sov(100);
          return c.finnes('#fortsett-rad .spillkort[data-id="luringen"] .kort-fortsett');
        };
        t.sjekk(await lurRad("Date.now() - 60 * 1000"), "Luringen vises ikke under «Fortsett» med et spill fra i sted");
        t.sjekk(!(await lurRad("Date.now() - 13 * 3600 * 1000")), "Luringen står under «Fortsett» 13 timer etter siste runde");
        t.sjekk(!(await lurRad(null)), "Luringen står under «Fortsett» uten tidspunkt for lagringen");
        await c.js(`localStorage.removeItem("luringen.v1")`);
      }
      await c.klikk("#kveld-alle");
      t.sjekk((await tavle()).length === 7 && (await c.js("document.querySelector('#kveld-alle').getAttribute('aria-expanded') === 'true'")), "«Vis alle» viser ikke hele Kveldens gjeng");
      const plasser = await c.js(`Array.from(document.querySelectorAll("#kveld-liste li .kveld-plass")).map((p) => p.textContent).join(" ")`);
      t.sjekk(plasser === "🥇 🥈 3. 3. 3. 3. 3.", `Spillere uten poeng får medalje i Kveldens gjeng (${plasser})`);
      // The whole page in one image, on phone widths. From the top: a full-page capture of a scrolled
      // page makes headless Chrome jump to the end of the page, and the search row (which sticks to
      // the top of the screen) goes missing in it. On wide screens such an image gets so big that
      // headless Chrome hangs on it, so there the list is captured as one screen instead.
      // First: a jump straight to the end of the page (the End key, a restored scroll position) with
      // the heading far below the first screen. The search row must get its solid background there too.
      await c.js("scrollTo(0, 0)");
      await c.sov(150);
      await c.js("scrollTo(0, document.documentElement.scrollHeight)");
      t.sjekk(await venter("document.querySelector('#filter').classList.contains('fast')", 1500), "Søkelinja er gjennomsiktig etter et hopp rett til bunnen av siden");
      if (BREDDE <= 430) {
        await c.js("scrollTo(0, 0)");
        await c.sov(200);
        await t.bilde("forside-hel", true);
      } else {
        await c.js(`scrollTo(0, document.querySelector("#alle-tittel").getBoundingClientRect().top + scrollY - 90)`);
        await c.sov(300);
        await t.bilde("forside-liste");
      }
      // «Dagens utfordringer», returning players: the shelf comes first, each daily card says how
      // today went, and the streak stands beside the heading. Storage is seeded in the format of
      // rusj/DAGLIG.md; every number comes from the games tagged «daglig».
      if (daglige.length >= 2) {
        const T = await c.js("window.RusjDaglig.dag().nr"); // today in Norway, as the page counts it
        const [a, b] = daglige;
        // In --probe the texts from storage carry markup: it must come out as text, never as an element.
        const merk = (tekst) => (PROBE ? `<x-q>${tekst.slice(0, 3)}</x-q>` : tekst);
        const medDaglig = async (verdi, somRetur) => {
          await c.js(`localStorage.setItem("rusj.daglig", ${JSON.stringify(typeof verdi === "string" ? verdi : JSON.stringify(verdi))})`);
          // somRetur: the page comes back from the browser's memory (after a game) instead of loading anew.
          if (somRetur) await c.js(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
          else await c.lastSide(t.side, "document.querySelector('.spillgrid')");
          await c.sov(somRetur ? 200 : 900);
        };
        const kort = (h, id) => h.kort.find((k) => k.id === id) || {};
        const utseende = (h, hva, forst = true) => {
          t.sjekk(h.finnes && (forst ? h.hyller[0] === "hylle-daglig" : h.hyller.indexOf("hylle-daglig") > 0), `Dagens utfordringer (${hva}): hylla står ${forst ? "ikke først" : "først for en ny besøkende"} (${h.hyller.join(", ")})`);
          t.sjekk(h.kort.length === daglige.length && h.kort.every((k) => k.inni && k.skjult), `Dagens utfordringer (${hva}): et merke stikker ut av bildet eller leses opp for seg`);
          t.sjekk(h.kort.map((k) => k.storrelse).join(" ") === nyStorrelse, `Dagens utfordringer (${hva}): kortene har endret størrelse (${h.kort.map((k) => k.storrelse).join(" ")}, før ${nyStorrelse})`);
          t.sjekk(h.rulles === "auto" && !h.ute && !h.gammel, `Dagens utfordringer (${hva}): raden ruller ikke sidelengs, noe stikker ut, eller den gamle stripa er der`);
        };

        // (a) One daily finished today (4/6), one in progress, the rest new. Three days in a row.
        const enFerdig = { [a.id]: { nr: T, vunnet: true, rekke: 3, res: merk("4/6") }, [b.id]: { nr: T - 9, vunnet: true, rekke: 1, res: "0:52", pagar: { nr: T, tekst: merk("5 av 8 ord") } } };
        const logg = { [T]: [a.id], [T - 1]: [a.id], [T - 2]: [a.id], [T - 9]: [b.id] };
        await medDaglig({ ...enFerdig, _: { v: 1, dager: logg } });
        let h = await dagligHylle();
        utseende(h, "én ferdig, én i gang");
        const ka = kort(h, a.id);
        const kb = kort(h, b.id);
        t.sjekk(ka.merke === "✓ " + merk("4/6") && ka.ferdig && ka.navn.endsWith(" – ferdig i dag, " + (PROBE ? merk("4/6") : "4 av 6")), `Dagens utfordringer: det ferdige kortet viser «${ka.merke}» og heter «${ka.navn}»`);
        t.sjekk(kb.merke === "I gang" && !kb.ferdig && kb.navn.endsWith(" – i gang"), `Dagens utfordringer: kortet som er i gang, viser «${kb.merke}» og heter «${kb.navn}»`);
        t.sjekk(h.kort.filter((k) => k.id !== a.id && k.id !== b.id).every((k) => k.merke === null && !STATUS.test(k.navn)), "Dagens utfordringer: urørte kort har merke");
        t.sjekk(h.flamme && h.flamme.navn === "3 dager på rad" && /🔥\s*3$/.test(h.flamme.tekst), `Dagens utfordringer: rekka er ${JSON.stringify(h.flamme)}`);
        await t.bilde("forside-vendt");
        await c.js(`document.querySelector("#hylle-daglig").scrollIntoView({ block: "center" })`);
        await t.bilde("forside-dagens");

        // (b) Back from a game (the page comes from the browser's memory): the second one is finished
        // too – lost. The badges change in place; the row keeps where it was scrolled to.
        const rulletFor = await c.js(`(() => { const r = document.querySelector("#hylle-daglig .hylle-rad"); r.scrollLeft = 60; return r.scrollLeft; })()`);
        await medDaglig({ ...enFerdig, [b.id]: { nr: T, vunnet: false, rekke: 0, res: "X/6" }, _: { v: 1, dager: { ...logg, [T]: [a.id, b.id] } } }, true);
        h = await dagligHylle();
        utseende(h, "tilbake fra et spill");
        const kb2 = kort(h, b.id);
        t.sjekk(kb2.merke === "✓ X/6" && kb2.ferdig && kb2.navn.endsWith(" – ferdig i dag, X/6") && kort(h, a.id).ferdig, `Dagens utfordringer (tilbake): kortet viser «${kb2.merke}» og heter «${kb2.navn}»`);
        t.sjekk((await c.js(`document.querySelector("#hylle-daglig .hylle-rad").scrollLeft`)) === rulletFor, "Dagens utfordringer (tilbake): raden hoppet tilbake til start");
        await c.js(`(() => { document.querySelector("#hylle-daglig .hylle-rad").scrollLeft = 0; document.querySelector("#hylle-daglig").scrollIntoView({ block: "center" }); })()`);
        await t.bilde("forside-dagens-ferdig");

        // (c) The format the games wrote before (no result text, no day log): just «✓». One day: no streak.
        await medDaglig({ [a.id]: { nr: T, vunnet: true, rekke: 1 } });
        h = await dagligHylle();
        utseende(h, "gammelt format");
        t.sjekk(kort(h, a.id).merke === "✓" && kort(h, a.id).navn.endsWith(" – ferdig i dag") && !h.flamme, `Dagens utfordringer (gammelt format): «${kort(h, a.id).merke}», «${kort(h, a.id).navn}», rekke ${JSON.stringify(h.flamme)}`);

        // (d) Storage blocked: the page reads as for a new visitor, without an error.
        await c.js(`Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blokkert", "SecurityError"); } }); window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
        await c.sov(200);
        h = await dagligHylle();
        utseende(h, "lagring blokkert", false);
        t.sjekk(h.kort.every((k) => k.merke === null) && !h.flamme, "Dagens utfordringer (lagring blokkert): merker eller rekke vises");
        await c.lastSide(t.side, "document.querySelector('.spillgrid')"); // storage back

        // (e) Rubbish in storage: the page treats the visitor as new, without an error.
        for (const rot of ["{ødelagt", "[1,2,3]", JSON.stringify({ [a.id]: "x", _: 7 })]) {
          await medDaglig(rot);
          h = await dagligHylle();
          t.sjekk(h.finnes && h.hyller[0] !== "hylle-daglig" && h.kort.every((k) => k.merke === null) && !h.flamme, `Søppel i lagringen (${rot.slice(0, 12)}) gir ikke forsiden for en ny besøkende`);
        }
        await c.js(`localStorage.removeItem("rusj.daglig")`);
      }

      // Old Luringen links (rusj.no/#CODE) are sent on to /luringen/ – but only real codes, never a
      // place on this page.
      for (const anker of ["#fortsett", "#overrask", "#spill"]) {
        await c.lastSide("about:blank");
        await c.lastSide(`${tjener.url}/${anker}`, "document.querySelector('.spillgrid') || location.pathname !== '/'");
        await c.sov(300);
        const havnet = await c.js("location.pathname");
        t.sjekk(havnet === "/", `Adressen /${anker} sendes til ${havnet} (skal bli på forsiden)`);
      }
      await c.lastSide("about:blank");
      await c.lastSide(`${tjener.url}/#ABCD2345`, "location.pathname.startsWith('/luringen/')");
      t.sjekk((await c.js("location.pathname")) === "/luringen/", "Gammel Luringen-lenke sendes ikke videre til /luringen/");
      await c.lastSide(`${tjener.url}/finnes-ikke/`, "document.querySelector('h1')");
      t.sjekk(/tomt/i.test(await c.tekst("h1")), "404-siden vises ikke");
      await t.bilde("404");

      // The pages about rusj: linked from the footer of the front page, readable on a phone, and
      // the button on /personvern/ really removes everything – after asking.
      await c.lastSide(t.side, "document.querySelector('.spillgrid')");
      const bunnlenker = await c.js(`Array.from(document.querySelectorAll(".bunn a")).map((a) => a.getAttribute("href"))`);
      t.sjekk(bunnlenker.includes("/om/") && bunnlenker.includes("/personvern/"), `Bunnteksten på forsiden lenker ikke til /om/ og /personvern/ (${bunnlenker.join(", ")})`);
      const utenfor = () => c.js(`Array.from(document.querySelectorAll("main *, footer *")).filter((el) => { const b = el.getBoundingClientRect(); return b.width && b.height && !el.closest("svg, dialog") && (b.right > innerWidth + 1 || b.left < -1); }).map((el) => el.tagName.toLowerCase() + " «" + el.textContent.trim().slice(0, 30) + "»").slice(0, 3)`);
      await c.lastSide(`${tjener.url}/om/`, "document.querySelector('h1')");
      const om = await c.js(`({ h1: document.querySelector("h1").innerText, tekst: document.querySelector("main").innerText, epost: (document.querySelector('main a[href^="mailto:"]') || {}).textContent || "", hjem: !!document.querySelector('a[href="/"]'), personvern: !!document.querySelector('a[href="/personvern/"]') })`);
      t.sjekk(/Om rusj/.test(om.h1) && (!/Kontakt: /.test(om.tekst) || /@/.test(om.epost)) && om.hjem && om.personvern, "Om-siden mangler overskrift eller lenker, eller kontaktlinja mangler adresse");
      if (atten) t.sjekk(/18 år/.test(om.tekst) && /alkoholfritt/i.test(om.tekst), "Om-siden sier ikke noe om drikkelekene og måtehold");
      t.sjekk((await utenfor()).length === 0, `Tekst stikker utenfor skjermen på Om-siden: ${(await utenfor()).join(", ")}`);
      await t.bilde("om");
      // «Klistremerkeboka»: linked from the footer, every sticker as a silhouette while the book is
      // empty; earned ones (stored, and a 7-day streak derived on the page) in colour with the day.
      t.sjekk(bunnlenker.includes("/merker/"), "Bunnteksten på forsiden lenker ikke til /merker/");
      await c.lastSide(`${tjener.url}/merker/`, "document.querySelector('.bok-merke')");
      await c.js(`localStorage.clear()`);
      await c.lastSide(`${tjener.url}/merker/`, "document.querySelector('.bok-merke')");
      const tom = await c.js(`({ h1: document.querySelector("h1").innerText, antall: document.querySelectorAll(".bok-merke").length, fatt: document.querySelectorAll(".bok-merke.fatt").length, telling: document.querySelector(".bok-telling").innerText, tom: !document.querySelector("#bok-tom").hidden, del: !document.querySelector("#bok-del").hidden })`);
      t.sjekk(/Klistremerkeboka/.test(tom.h1) && tom.antall >= 36 && tom.fatt === 0 && new RegExp("^0 av " + tom.antall).test(tom.telling) && tom.tom && !tom.del, `Tom klistremerkebok: ${JSON.stringify(tom)}`);
      t.sjekk((await utenfor()).length === 0, `Tekst stikker utenfor skjermen i klistremerkeboka: ${(await utenfor()).join(", ")}`);
      await t.bilde("merker-tom");
      await c.js(`(() => {
        const nr = Math.floor(Date.now() / 86400000);
        const dager = {};
        for (let i = 0; i < 7; i++) dager[nr - i] = ["ordugla"];
        localStorage.setItem("rusj.daglig", JSON.stringify({ ordugla: { nr, vunnet: true, rekke: 7 }, _: { v: 1, dager } }));
        localStorage.setItem("rusj.merker", JSON.stringify({ "klassiker-fireren": nr - 20, "luke-1": nr - 345, "finnes-ikke": nr, "provd-5": "tull" }));
        localStorage.setItem("rusj.spilt", JSON.stringify(["kunstneren", "tieren", "mimen", "fireren", "elefanten", "bussen"]));
      })()`);
      await c.lastSide(`${tjener.url}/merker/`, "document.querySelector('.bok-merke.fatt')");
      await c.sov(700);
      const bok = await c.js(`({ fatt: Array.from(document.querySelectorAll(".bok-merke.fatt")).map((li) => li.dataset.merke), telling: document.querySelector("#bok-antall").textContent, dato: document.querySelector('[data-merke="klassiker-fireren"] .bok-dato').textContent, lagret: JSON.parse(localStorage.getItem("rusj.merker")), del: !document.querySelector("#bok-del").hidden })`);
      const ventetFatt = ["dagens-forste", "dagens-rekke-3", "dagens-rekke-7", "seier-ordugla", "provd-5", "provd-tegning", "provd-quiz", "provd-lag", "provd-hukommelse", "klassiker-fireren", "luke-1"];
      t.sjekk(ventetFatt.every((id) => bok.fatt.includes(id)) && !bok.fatt.includes("dagens-rekke-14") && Number(bok.telling) === bok.fatt.length && bok.del, `Klistremerkeboka viser feil merker: ${bok.fatt.join(", ")} (${bok.telling})`);
      t.sjekk(/^Fått \d+\. [a-zæøå]+$/.test(bok.dato) && !("finnes-ikke" in bok.lagret) && Number.isInteger(bok.lagret["dagens-rekke-7"]), `Dato eller lagring i klistremerkeboka: «${bok.dato}», ${JSON.stringify(bok.lagret)}`);
      t.sjekk((await utenfor()).length === 0, `Tekst stikker utenfor skjermen i klistremerkeboka: ${(await utenfor()).join(", ")}`);
      await t.bilde("merker");
      // The full-page shot of the album hangs Chrome in landscape; portrait is enough.
      if (BREDDE < HOYDE) await t.bilde("merker-hel", true);
      await c.js(`localStorage.clear()`);
      await c.lastSide(`${tjener.url}/personvern/`, "document.querySelector('#slett-alt')");
      const pv = await c.js(`({ h1: document.querySelector("h1").innerText, tekst: document.querySelector("main").innerText, knapp: document.querySelector("#slett-alt").innerText.trim() })`);
      t.sjekk(/Personvern/.test(pv.h1) && /localStorage/.test(pv.tekst) && /informasjonskapsler/.test(pv.tekst) && /GitHub Pages/.test(pv.tekst) && /IP-adresse/.test(pv.tekst) && /utenfor EU\/EØS/.test(pv.tekst) && /uten nett/.test(pv.tekst), "Personvernsiden mangler noe av det den skal si (lagring, informasjonskapsler, nettvert, IP-adresse, EU/EØS, bruk uten nett)");
      t.sjekk(pv.knapp === "Slett alt rusj har lagret på denne enheten", `Sletteknappen heter «${pv.knapp}»`);
      t.sjekk((await utenfor()).length === 0, `Tekst stikker utenfor skjermen på personvernsiden: ${(await utenfor()).join(", ")}`);
      // Something of everything rusj stores, two keys that are not ours, a stored copy of a file and
      // (a stand-in for) the helper that keeps the offline copy.
      await c.js(`(async () => {
        localStorage.clear();
        for (const n of ["rusj.felles", "rusj.kveld", "rusj.sladrehanken.v1", "rusj.portal.installSkjult", "luringen.v1", "luringen.annet", "annet.nokkel", "rusjx"]) localStorage.setItem(n, JSON.stringify({ navn: ["Ada"] }));
        await (await caches.open("rusj-test")).put("/x", new Response("x"));
      })()`);
      await c.lastSide(`${tjener.url}/personvern/`, "document.querySelector('#slett-alt')");
      await c.js(`window.__avregistrert = 0; navigator.serviceWorker.getRegistrations = async () => [{ unregister: async () => (window.__avregistrert++, true) }];`);
      t.sjekk(/6 lagrede/.test(await c.tekst("#slett-status")), `Personvernsiden teller ikke det som er lagret («${await c.tekst("#slett-status")}»)`);
      await t.bilde("personvern");
      const lagretNa = () => c.js(`(async () => ({ nokler: Object.keys(localStorage).sort().join(","), lagre: (await caches.keys()).length, avregistrert: window.__avregistrert, status: document.querySelector("#slett-status").textContent }))()`);
      await c.klikk("#slett-alt");
      t.sjekk(await c.js("document.querySelector('#dialog').open"), "Sletteknappen spør ikke først");
      await c.klikk('#dialog [value="nei"]');
      const urort = await lagretNa();
      t.sjekk(urort.nokler.split(",").length === 8 && urort.lagre === 1 && urort.avregistrert === 0, `«Avbryt» slettet noe likevel (${urort.nokler})`);
      await c.klikk("#slett-alt");
      await c.klikk('#dialog [value="ja"]');
      await venter("/Slettet/.test(document.querySelector('#slett-status').textContent)");
      const slettet = await lagretNa();
      t.sjekk(slettet.nokler === "annet.nokkel,rusjx", `Etter «Ja, slett alt» ligger dette igjen i lagringen: ${slettet.nokler || "(ingenting)"} (ventet bare annet.nokkel og rusjx)`);
      t.sjekk(slettet.lagre === 0, `Etter «Ja, slett alt» ligger ${slettet.lagre} lagret kopi igjen`);
      t.sjekk(slettet.avregistrert === 1, "Etter «Ja, slett alt» er ikke hjelperen for bruk uten nett avregistrert");
      t.sjekk(/Slettet/.test(slettet.status), `Etter «Ja, slett alt» sier siden «${slettet.status}»`);
      await c.js(`localStorage.clear()`);
    } else if (id === "luringen") {
      await c.lastSide(t.side, "document.querySelector('#s-hjem h1')");
      await c.js("localStorage.clear()");
      await c.lastSide(t.side, "document.querySelector('#s-hjem h1')");
      await t.bilde("luringen-hjem");
      t.sjekk(await c.finnes('a[href="/"]'), "Luringen mangler lenke tilbake til rusj.no");
      await c.klikk('[data-h="nytt"]');
      await t.bilde("luringen-oppsett");
      // With --a11y: the rest of Luringen's screens (its own play-through is test/e2e.mjs). What
      // goes wrong on this extra walk is a note in the findings, never a failure of the run.
      if (a11y) {
        const fra = feil.length;
        const logget = c.feil.length;
        try {
          await (await import("./a11y/luringen.a11y.mjs")).default(t);
        } catch (e) {
          feil.push(`a11y-runden stoppet: ${e.message}`);
        }
        a11yNotater.push(...feil.splice(fra), ...c.feil.splice(logget));
      }
    } else {
      const m = meta(id);
      await t.start();
      if (m.alder18) {
        // Drinking games: the kit's 18+ gate comes first; "Nei" leads away, "Ja" opens the game.
        // The gate's heading is the game's name (with «18+»), and it asks as the front page does.
        const port = await c.tekst("#skjerm h1");
        t.sjekk(/18/.test(port) && port.includes(m.navn), `18+-porten vises ikke først i et drikkespill, eller har ikke spillets navn som overskrift («${port.replace(/\s+/g, " ")}»)`);
        t.sjekk(/Er du 18 år eller eldre\?/.test(await c.tekst("#skjerm h2")), "18+-porten spør ikke «Er du 18 år eller eldre?»");
        t.sjekk(await c.finnes('[data-h="alder-ja"]') && (await c.finnes('[data-h="alder-nei"]')), "18+-porten mangler Ja/Nei");
        await t.bilde("alder");
        await c.klikk('[data-h="alder-ja"]');
        await c.vent("document.querySelector('#skjerm h1') && !document.querySelector('[data-h=\"alder-ja\"]')");
      }
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
  let a11yTekst = "";
  if (a11y) {
    const funnet = a11y.resultat();
    writeFileSync(join(A11Y_MAPPE, "funn", `${id}.json`), JSON.stringify({ feil: [...feil, ...a11yNotater], ...funnet }, null, 1));
    a11yTekst = ` · a11y: ${funnet.skjermer.reduce((s, sk) => s + sk.funn.length, 0)} funn på ${funnet.skjermer.length} skjermer`;
  }
  console.log(`${feil.length ? "✗" : "✓"} ${id}${feil.length ? "" : ` (${nr} skjermbilder)`}${a11yTekst}`);
  for (const f of feil) console.log(`    – ${f}`);
  for (const f of a11yNotater) console.log(`    · ${f}`);
}

tjener.lukk();
const antallFeil = resultat.reduce((s, r) => s + r.feil.length, 0);
console.log(`\nSkjermbilder: ${BILDER}`);
if (A11Y_MAPPE) console.log(`a11y-funn: ${A11Y_MAPPE} (node test/a11y/sammendrag.mjs ${A11Y} gir rangert liste og nøkkeltall)`);
if (antallFeil) {
  console.log(`${antallFeil} feil i ${resultat.filter((r) => r.feil.length).length} av ${resultat.length}`);
  process.exit(1);
}
console.log(`Alle ${resultat.length} besto.`);
