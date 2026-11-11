// End-to-end check of rusj.no in headless Google Chrome on a phone-sized screen.
// For every game: loads the page, checks the basics (title, no errors, no sideways scrolling),
// then plays it through with test/spill/<id>.e2e.mjs if that file exists. Saves screenshots.
// Usage: node test/rusj-e2e.mjs [--web dist/web] [--bilder dir] [--a11y dir] [id ...]
//   ids: game ids, "forside" (front page) or "luringen". Default: everything that was built.
//   --a11y dir: also run the accessibility checker (test/a11y/) on every screenshot and write what
//   it finds to dir/funn/<id>.json. Findings are data: they never fail the run.
//   Then: node test/a11y/sammendrag.mjs dir
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
      if (a11y) await a11y.sjekk(navn); // findings are collected, never a test failure
    },
    tilstand: () => c.js(`JSON.parse(localStorage.getItem("rusj.${id}.v1") || "null")`),
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
    if (id === "forside") {
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

      // «Dagens rusj», new visitor: no strip – one slim row under the buttons that says how many
      // daily puzzles there are (counted from the games tagged «daglig», never a fixed number) and
      // leads to the shelf with them.
      const daglige = await c.js(`(window.RUSJ_SPILLISTE || []).filter((s) => s.tagger.includes("daglig") && !s.alder18).map((s) => ({ id: s.id, navn: s.dagnavn || s.undertittel }))`);
      const TALLORD = ["null", "én", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "elleve", "tolv"];
      const tallord = (n) => TALLORD[n] || String(n);
      const stor = (tekst) => tekst.charAt(0).toUpperCase() + tekst.slice(1);
      if (daglige.length) {
        const ny = await c.js(`(() => { const rad = document.querySelector("#idag-ny"); const b = rad.getBoundingClientRect(); const k = document.querySelector(".helt-knapper").getBoundingClientRect(); return { stripe: !document.querySelector("#idag").hidden, synlig: !!rad.offsetParent, tekst: rad.querySelector("#idag-ny-tekst").innerText.replace(/\\s+/g, " ").trim(), figurer: rad.querySelectorAll(".idag-ny-figurer svg").length, hoyde: Math.round(b.height), topp: Math.round(b.top), bunn: Math.round(b.bottom), knapperBunn: Math.round(k.bottom), bredde: Math.round(b.right), vw: innerWidth, vh: innerHeight, hylle: !!document.querySelector("#hylle-daglig"), klasse: document.body.classList.contains("daglig-spiller") }; })()`);
        const ventetTekst = `I dag: ${daglige.length === 1 ? "én ny oppgave" : `${tallord(daglige.length)} nye oppgaver`}`;
        t.sjekk(!ny.stripe && ny.synlig && !ny.klasse, "En ny besøkende får «I dag»-stripa i stedet for den slanke raden");
        t.sjekk(ny.tekst.startsWith(ventetTekst), `Den slanke raden sier «${ny.tekst}», ventet «${ventetTekst}»`);
        t.sjekk(ny.figurer === Math.min(daglige.length, 4), `Den slanke raden viser ${ny.figurer} figurer for ${daglige.length} dagsspill`);
        t.sjekk(ny.hoyde <= 44 && ny.topp >= ny.knapperBunn && ny.bunn <= ny.vh && ny.bredde <= ny.vw, `Den slanke «I dag»-raden er ikke én lav rad under knappene på første skjerm (${ny.hoyde} px høy, ${ny.topp}–${ny.bunn} av ${ny.vh} px)`);
        t.sjekk(ny.hylle === daglige.length >= 2, "Hylla «Dagens utfordringer» mangler for en ny besøkende");
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
      const ventetStopp = ["finn", "#overrask", ...(daglige.length ? ["#idag-ny"] : []), "#installtips-vis", "#installtips-lukk", "#sok", "#filter-knapp", "hylle-alle"].slice(0, 8);
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

      // The slim «I dag» row leads to the shelf with today's puzzles, and puts the keyboard there.
      if (daglige.length >= 2) {
        await c.klikk("#idag-ny", 700);
        const etter = await c.js(`(() => { const h = document.querySelector("#hylle-daglig"); const b = h.getBoundingClientRect(); return { fokus: !!document.activeElement.closest("#hylle-daglig"), synlig: b.top >= 0 && b.top < innerHeight, sti: location.pathname }; })()`);
        t.sjekk(etter.sti === "/" && etter.fokus && etter.synlig, "Den slanke «I dag»-raden fører ikke til hylla med dagens oppgaver");
        await c.js("document.activeElement.blur(); scrollTo(0, 0)");
        await c.sov(400);
      }

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
      // «Dagens rusj», returning players: the «I dag» strip. Storage is seeded in the format of
      // rusj/DAGLIG.md (new and old); every number comes from the games tagged «daglig».
      if (daglige.length >= 2) {
        const T = await c.js("window.RusjDaglig.dag().nr"); // today in Norway, as the page counts it
        const ukedag = await c.js("window.RusjDaglig.dag().ukedag"); // 0 = Monday
        const UKEDAGER = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
        const n = daglige.length;
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
        const stripe = () =>
          c.js(`(() => {
            const s = document.querySelector("#idag");
            const tekst = (sel) => { const e = s.querySelector(sel); return e ? e.innerText.replace(/\\s+/g, " ").trim() : ""; };
            const boks = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
            const ute = Array.from(s.querySelectorAll("*")).filter((e) => { const r = e.getBoundingClientRect(); const k = s.getBoundingClientRect(); return r.width && r.height && !e.closest("svg") && !e.classList.contains("vh") && (r.left < k.left - 1 || r.right > k.right + 1 || r.right > innerWidth + 1 || r.left < -1); }).map((e) => e.className || e.tagName);
            const fliser = Array.from(s.querySelectorAll(".idag-flis"));
            const bokser = fliser.map(boks);
            const overlapp = bokser.some((x, i) => bokser.some((y, j) => j > i && x[0] < y[2] - 1 && y[0] < x[2] - 1 && x[1] < y[3] - 1 && y[1] < x[3] - 1));
            const knapper = document.querySelector(".helt-knapper").getBoundingClientRect();
            return {
              vises: !s.hidden && !!s.offsetParent,
              slank: !document.querySelector("#idag-ny").hidden,
              hylle: !!document.querySelector("#hylle-daglig"),
              slagord: !!document.querySelector(".helt-slagord").offsetParent,
              tittel: tekst("#idag-tittel"),
              fliser: fliser.map((f) => ({ navn: f.getAttribute("aria-label"), sti: f.getAttribute("href"), tilstand: (/\\bt-(ny|pagar|ferdig)\\b/.exec(f.className) || [])[1], hake: !!f.querySelector(".idag-hake"), vist: f.querySelector(".idag-res").innerText.trim(), figur: !!f.querySelector("svg") })),
              antall: tekst(".idag-antall"),
              rekke: tekst(".idag-rekke .vh"),
              flamme: !!s.querySelector(".idag-flamme"),
              uke: (s.querySelector(".idag-uke") || { getAttribute: () => "" }).getAttribute("aria-label"),
              prikker: Array.from(s.querySelectorAll(".idag-prikk")).map((p) => (/\\bp-(spilt|hvile|tom|kommer)\\b/.exec(p.className) || [])[1] + (p.classList.contains("p-i-dag") ? "*" : "")),
              status: tekst("#idag-status"),
              klokke: tekst("#idag-klokke"),
              neste: tekst("#idag-neste"),
              nesteSti: (s.querySelector("#idag-neste") || { getAttribute: () => "" }).getAttribute("href"),
              del: !!s.querySelector("#idag-del"),
              iBoks: s.classList.contains("i-boks"),
              alt: s.innerText,
              ute,
              overlapp,
              bunn: Math.round(s.getBoundingClientRect().bottom),
              knapperBunn: Math.round(knapper.bottom),
              vh: innerHeight,
            };
          })()`);
        // What the week row must show, counted here on its own: Monday to Sunday of this week.
        const ventetUke = (spilt, hvile) => Array.from({ length: 7 }, (_, i) => { const nr = T - ukedag + i; return (spilt.includes(nr) ? "spilt" : hvile.includes(nr) ? "hvile" : nr > T ? "kommer" : "tom") + (nr === T ? "*" : ""); });
        const utseende = (st, hva) => {
          t.sjekk(st.ute.length === 0, `«I dag» (${hva}): noe stikker utenfor stripa eller skjermen: ${st.ute.slice(0, 3).join(", ")}`);
          t.sjekk(!st.overlapp, `«I dag» (${hva}): flisene ligger oppå hverandre`);
          t.sjekk(st.fliser.length === n && st.fliser.every((f) => f.figur), `«I dag» (${hva}): ${st.fliser.length} fliser for ${n} dagsspill`);
          t.sjekk(st.prikker.length === 7 && st.prikker.filter((p) => p.endsWith("*")).length === 1 && st.prikker[ukedag].endsWith("*"), `«I dag» (${hva}): ukeprikkene er ${st.prikker.join(" ")}`);
          t.sjekk(st.vises && !st.slank && !st.hylle && !st.slagord, `«I dag» (${hva}): stripa skal vises alene – uten den slanke raden, hylla «Dagens utfordringer» og slagordet`);
          // On a phone on its side the two buttons under the strip are still on the first screen.
          if (HOYDE < 500) t.sjekk(st.knapperBunn <= st.vh, `«I dag» (${hva}): knappene under stripa havner utenfor første skjerm (${st.knapperBunn} av ${st.vh} px)`);
        };

        // (a) One of the puzzles finished, one in progress – new format. Two days in a row.
        await medDaglig({ [a.id]: { nr: T, vunnet: true, rekke: 2, res: merk("4/6") }, [b.id]: { nr: T - 9, vunnet: true, rekke: 1, res: "0:52", pagar: { nr: T, tekst: merk("5 av 8 ord") } }, _: { v: 1, dager: { [T]: [a.id], [T - 1]: [a.id], [T - 9]: [b.id] } } });
        let st = await stripe();
        utseende(st, "én ferdig");
        t.sjekk(st.tittel === "I dag" && !st.iBoks, `«I dag» (én ferdig): overskriften er «${st.tittel}»`);
        t.sjekk(st.fliser[0].navn === `${a.navn}, løst, 4 av 6` && st.fliser[0].tilstand === "ferdig" && st.fliser[0].hake && st.fliser[0].vist === "4/6", `«I dag»: den ferdige flisa heter «${st.fliser[0].navn}» og viser «${st.fliser[0].vist}»`);
        t.sjekk(st.fliser[1].navn === `${b.navn}, i gang, 5 av 8 ord` && st.fliser[1].tilstand === "pagar" && !st.fliser[1].hake, `«I dag»: flisa som er i gang, heter «${st.fliser[1].navn}»`);
        t.sjekk(st.fliser.slice(2).every((f, i) => f.navn === `${daglige[i + 2].navn}, ny` && f.tilstand === "ny" && f.vist === "Ny"), "«I dag»: de urørte flisene sier ikke «ny»");
        t.sjekk(st.fliser.every((f, i) => f.sti === `/${daglige[i].id}/#dagens`), "«I dag»: flisene lenker ikke til /<spill>/#dagens");
        t.sjekk(st.antall === `1 av ${n} i dag`, `«I dag»: telleren sier «${st.antall}», ventet «1 av ${n} i dag»`);
        t.sjekk(st.rekke === "2 dager på rad" && st.flamme, `«I dag»: rekka sier «${st.rekke}» (flamme: ${st.flamme})`);
        t.sjekk(st.status === `${stor(tallord(n - 1))} igjen i dag.` && !st.klokke, `«I dag»: linja under uka sier «${st.status}»`);
        t.sjekk(st.neste === `Fortsett: ${b.navn}` && st.nesteSti === `/${b.id}/#dagens` && st.del, `«I dag»: knappen sier «${st.neste}» (del-knapp: ${st.del})`);
        t.sjekk(st.prikker.join(" ") === ventetUke([T, T - 1], []).join(" "), `«I dag»: ukeprikkene er ${st.prikker.join(" ")}, ventet ${ventetUke([T, T - 1], []).join(" ")}`);
        // Keyboard: the strip comes first, tile by tile, then its button – with a ring that shows on paper.
        const stopp2 = [];
        for (let i = 0; i < n + 2; i++) {
          await tast("Tab", 9);
          await c.sov(80);
          stopp2.push(await c.js(`(() => { const e = document.activeElement; const s = getComputedStyle(e); return (e.id ? "#" + e.id : e.getAttribute("href")) + (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 && s.outlineColor === "rgb(23, 14, 43)" ? "" : " (uten mørk fokusring)"); })()`));
        }
        const ventet2 = [...daglige.map((d) => `/${d.id}/#dagens`), "#idag-neste", "#idag-del"];
        t.sjekk(stopp2.join(" → ") === ventet2.join(" → "), `Tab-rekkefølgen i «I dag»-stripa: ${stopp2.join(" → ")}`);
        await c.js("document.activeElement.blur(); scrollTo(0, 0)");
        await t.bilde("forside-idag");

        // (b) Back from the last puzzle (the page comes from the browser's memory): the day is done.
        // The last one is finished but not solved; the first two have a result text.
        const fasit = daglige.map((d, i) => ({ ...d, vunnet: i !== n - 1, res: i === 0 ? "3/6" : i === 1 ? "0:52" : "" }));
        const LEST = { "3/6": "3 av 6", "0:52": "52 sekunder" };
        const alleFerdig = Object.fromEntries(fasit.map((d, i) => [d.id, { nr: T, vunnet: d.vunnet, rekke: d.vunnet ? 3 : 0, res: i === 0 ? merk(d.res) : d.res }]));
        await medDaglig({ ...alleFerdig, _: { v: 1, dager: { [T]: daglige.map((d) => d.id), [T - 1]: [a.id], [T - 2]: [a.id] } } }, true);
        st = await stripe();
        utseende(st, "alt ferdig");
        t.sjekk(st.tittel === "Dagen er i boks" && st.iBoks, `«I dag» (alt ferdig): overskriften er «${st.tittel}»`);
        t.sjekk(st.antall === `${n} av ${n} i dag` && st.fliser.every((f) => f.tilstand === "ferdig" && f.hake), `«I dag» (alt ferdig): telleren sier «${st.antall}»`);
        const ventetNavn = fasit.map((d) => `${d.navn}, ${d.vunnet ? "løst" : "ferdig"}${d.res ? ", " + LEST[d.res] : ""}`);
        if (!PROBE) t.sjekk(st.fliser.map((f) => f.navn).join(" | ") === ventetNavn.join(" | "), `«I dag» (alt ferdig): flisene heter ${st.fliser.map((f) => f.navn).join(" | ")}, ventet ${ventetNavn.join(" | ")}`);
        t.sjekk(st.fliser.every((f, i) => i === 0 || f.vist === (fasit[i].res || (fasit[i].vunnet ? "Løst" : "Ferdig"))), `«I dag» (alt ferdig): flisene viser ${st.fliser.map((f) => f.vist).join(" | ")}`);
        t.sjekk(st.rekke === "3 dager på rad", `«I dag» (alt ferdig): rekka sier «${st.rekke}»`);
        t.sjekk(/^Nye oppgaver om \d\d:\d\d:\d\d$/.test(st.status) && !st.neste && st.del, `«I dag» (alt ferdig): linja sier «${st.status}»`);
        // The countdown to the next day is alive – and not read out every second.
        const klokke1 = st.klokke;
        t.sjekk(await venter(`document.querySelector("#idag-klokke").textContent !== ${JSON.stringify(klokke1)}`, 2500), "Nedtellingen til neste dag står stille");
        const sek = (k) => k.split(":").reduce((sum, del) => sum * 60 + Number(del), 0);
        const igjen = sek(await c.tekst("#idag-klokke"));
        t.sjekk(igjen > 0 && igjen <= 25 * 3600 && sek(klokke1) - igjen >= 1 && sek(klokke1) - igjen <= 5, `Nedtellingen gikk fra ${klokke1} til ${igjen} sekunder`);
        t.sjekk(await c.js(`(() => { const k = document.querySelector("#idag-klokke"); return k.getAttribute("role") === "timer" && !k.closest("[aria-live], [role=status]"); })()`), "Nedtellingen er et område som leses opp ved hver endring");
        await t.bilde("forside-i-boks");

        // «Del dagen»: one text with the results and the address – through the phone's share sheet,
        // else the clipboard, else the text itself.
        await c.js(`Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.__delt = d; } })`);
        await c.klikk("#idag-del");
        const delt = await c.js("window.__delt || null");
        const linjer = delt ? String(delt.text).split("\n") : [];
        t.sjekk(delt && delt.url === "https://rusj.no/" && !/https?:/.test(delt.text), `«Del dagen» deler ikke adressen https://rusj.no/ for seg (${delt && delt.url})`);
        t.sjekk(linjer.length === n + 2 && /^rusj i dag · /.test(linjer[0]) && daglige.every((d, i) => linjer[i + 1].startsWith(d.navn + ": ")) && linjer[n + 1] === `Dagen er i boks – ${n} av ${n} · 🔥 3 dager på rad`, `«Del dagen» deler: ${linjer.join(" / ")}`);
        const ventetLinjer = fasit.map((d) => `${d.navn}: ${d.res || (d.vunnet ? "løst" : "ferdig")}`);
        if (!PROBE) t.sjekk(linjer.slice(1, n + 1).join(" / ") === ventetLinjer.join(" / "), `«Del dagen»: resultatlinjene er ${linjer.slice(1, n + 1).join(" / ")}, ventet ${ventetLinjer.join(" / ")}`);
        await c.js(`Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); navigator.clipboard.writeText = async (tekst) => { window.__kopiert = tekst; };`);
        await c.klikk("#idag-del");
        const kopiert = await c.js("window.__kopiert || ''");
        t.sjekk(delt && kopiert === delt.text + "\nhttps://rusj.no/" && /Kopiert/.test(await c.tekst("#idag-melding")), `«Del dagen» uten delingsark kopierer ikke tekst og adresse (${kopiert.split("\n").length} linjer)`);
        await c.js(`navigator.clipboard.writeText = async () => { throw new Error("ikke lov"); };`);
        await c.klikk("#idag-del");
        const felt = await c.js(`(() => { const d = document.querySelector("#dialog"); const f = d.querySelector("textarea"); return { apen: d.open, tekst: f ? f.value : "", fokus: document.activeElement === f }; })()`);
        t.sjekk(delt && felt.apen && felt.tekst === delt.text + "\nhttps://rusj.no/" && felt.fokus, "«Del dagen» uten delingsark og utklippstavle viser ikke teksten i et felt");
        await t.bilde("forside-del");
        await c.klikk('#dialog [value="ok"]');

        // (c) A streak held together by a rest day: the day before yesterday was missed. Nothing done today.
        await medDaglig({ [a.id]: { nr: T - 1, vunnet: true, rekke: 1, res: "5/6" }, _: { v: 1, dager: { [T - 1]: [a.id], [T - 3]: [a.id], [T - 4]: [a.id, b.id] } } });
        st = await stripe();
        utseende(st, "hviledag");
        t.sjekk(st.rekke === "3 dager på rad" && st.flamme, `«I dag» (hviledag): rekka sier «${st.rekke}», ventet 3 dager med én hviledag imellom`);
        t.sjekk(st.prikker.join(" ") === ventetUke([T - 1, T - 3, T - 4], [T - 2]).join(" "), `«I dag» (hviledag): ukeprikkene er ${st.prikker.join(" ")}, ventet ${ventetUke([T - 1, T - 3, T - 4], [T - 2]).join(" ")}`);
        t.sjekk(ukedag >= 2 ? st.uke.includes(`Hviledag ${UKEDAGER[ukedag - 2]}.`) : !/Hviledag/.test(st.uke), `«I dag» (hviledag): uka leses som «${st.uke}»`);
        t.sjekk(st.antall === `0 av ${n} i dag` && st.fliser.every((f) => f.tilstand === "ny"), `«I dag» (hviledag): telleren sier «${st.antall}»`);
        t.sjekk(st.status === "Én oppgave i dag holder rekka i gang." && st.neste === `Start: ${a.navn}` && !st.del, `«I dag» (hviledag): linja sier «${st.status}», knappen «${st.neste}»`);
        await t.bilde("forside-hviledag");

        // (d) A streak that ended days ago: a new start, said calmly – nothing about what was lost.
        await medDaglig({ [a.id]: { nr: T - 6, vunnet: true, rekke: 4, res: "4/6" } }, true);
        st = await stripe();
        utseende(st, "ny rekke");
        t.sjekk(!st.rekke && !st.flamme && st.status === "Ny rekke starter i dag.", `«I dag» (ny rekke): linja sier «${st.status}», rekka «${st.rekke}»`);
        t.sjekk(!/mist|brutt|tapt|dessverre|synd|røk/i.test(st.alt), `«I dag» (ny rekke): stripa skammer: «${st.alt.replace(/\s+/g, " ").slice(0, 120)}»`);

        // (e) Data in the format the games write today (no result text, no day log): finished or
        // new, and a streak built from the games' own streaks.
        await medDaglig({ [a.id]: { nr: T, vunnet: true, rekke: 5 }, [b.id]: { nr: T - 1, vunnet: true, rekke: 2 } });
        st = await stripe();
        utseende(st, "gammelt format");
        t.sjekk(st.fliser[0].navn === `${a.navn}, løst` && st.fliser[0].vist === "Løst" && st.fliser[0].hake && st.fliser[1].tilstand === "ny", `«I dag» (gammelt format): flisene heter ${st.fliser.map((f) => f.navn).join(" | ")}`);
        t.sjekk(st.antall === `1 av ${n} i dag` && st.rekke === "5 dager på rad", `«I dag» (gammelt format): «${st.antall}», «${st.rekke}»`);
        t.sjekk(st.prikker.join(" ") === ventetUke([T, T - 1, T - 2, T - 3, T - 4], []).join(" "), `«I dag» (gammelt format): ukeprikkene er ${st.prikker.join(" ")}`);
        t.sjekk(st.neste === `Neste: ${b.navn}`, `«I dag» (gammelt format): knappen sier «${st.neste}»`);
        await t.bilde("forside-gammelt-format");

        // (f) Less motion asked for: the strip is simply there, and the day still counts down.
        await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
        await medDaglig({ ...alleFerdig });
        await c.sov(300);
        const rolig = await c.js(`(() => { const s = document.querySelector("#idag"); return { synlig: getComputedStyle(s).opacity === "1", varighet: parseFloat(getComputedStyle(s).animationDuration), klokke: !!document.querySelector("#idag-klokke") }; })()`);
        t.sjekk(rolig.synlig && rolig.varighet < 0.01 && rolig.klokke, `«I dag» med redusert bevegelse: synlig ${rolig.synlig}, animasjon ${rolig.varighet} s`);
        await c.send("Emulation.setEmulatedMedia", { features: [] });

        // (g) Rubbish in storage: the page treats the visitor as new, without an error.
        for (const rot of ["{ødelagt", "[1,2,3]", JSON.stringify({ [a.id]: "x", _: 7 })]) {
          await medDaglig(rot);
          t.sjekk(await c.js(`document.querySelector("#idag").hidden && !document.querySelector("#idag-ny").hidden && !!document.querySelector("#hylle-daglig")`), `Søppel i lagringen (${rot.slice(0, 12)}) gir ikke forsiden for en ny besøkende`);
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
