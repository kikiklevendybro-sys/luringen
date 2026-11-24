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

// ---------- The front page («Miks»), every edition ----------
// One list of every game, «Alle spill A–Å», written into the page; the search in the top bar, the
// shortcuts, the rooms and the three questions behind «Hjelp oss å velge» filter it in place. Texts are
// checked in Norwegian only (t.norsk); the rest holds in every edition and at every size.

// What the page shows right now (read in the page). nokkel: where the edition keeps its choices.
const lesForside = (nokkel) => `(() => {
  const spill = new Map((window.RUSJ_SPILLISTE || []).map((s) => [s.id, s]));
  const synlig = (el) => !!el && !el.hidden && !!el.offsetParent;
  const vist = Array.from(document.querySelectorAll("#alle-liste li[data-id]")).filter((li) => !li.hidden).map((li) => li.dataset.id);
  const beste = Array.from(document.querySelectorAll("#beste .forslagkort")).filter(synlig).map((k) => ({ id: k.dataset.id, grunn: k.querySelector(".kort-grunn").textContent, navn: k.querySelector("a").getAttribute("aria-label") }));
  const dor = document.querySelector("#dor-celle");
  return {
    vist,
    atten: vist.filter((id) => spill.get(id) && spill.get(id).alder18),
    tittel: document.querySelector("#alle-t").textContent,
    si: document.querySelector("#si").textContent,
    live: document.querySelector("#si").getAttribute("aria-live"),
    aktive: Array.from(document.querySelectorAll("#aktive [data-fjern]")).map((b) => b.dataset.fjern + ":" + b.textContent.replace(/×/g, "").trim()),
    nullstill: !document.querySelector("#nullstill").hidden,
    beste,
    dor: synlig(dor) ? dor.innerText.replace(/\\s+/g, " ").trim() : "",
    ingen: !document.querySelector("#ingen-treff").hidden,
    trykket: Array.from(document.querySelectorAll("[data-hurtig][aria-pressed='true'], #rommene [data-rom][aria-pressed='true']")).map((b) => b.dataset.hurtig || b.dataset.rom),
    lagret: (() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(nokkel)}) || "null"); } catch (e) { return "?"; } })(),
  };
})()`;

async function forsideTur(t, c) {
  const tast = async (key, vk, modifiers = 0) => {
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: vk, modifiers });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: vk, modifiers });
  };
  const venter = async (uttrykk, ms = 3000) => {
    try {
      await c.vent(uttrykk, ms);
      return true;
    } catch (e) {
      return false;
    }
  };
  const les = () => c.js(lesForside(t.nokkel("portal")));
  const lastPaNytt = async () => {
    await c.lastSide(t.side, "document.querySelector('#alle-liste')");
    await c.sov(300);
  };
  // A headless page has no focus, so «focus» never fires; the keyboard checks need it.
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await t.start();
  await c.sov(600);
  await t.bilde("forside");
  const stor = BREDDE >= 720;
  const staende = HOYDE > BREDDE;

  // ---------- The page as it is written ----------
  const side = await c.js(`({
    alle: (window.RUSJ_SPILLISTE || []).map((s) => ({ id: s.id, alder18: !!s.alder18, url: s.url || "/" + s.id + "/", navn: s.navn })),
    lenker: Array.from(document.querySelectorAll("#alle-liste a.spillflis")).map((a) => a.getAttribute("href")),
    hreflang: Array.from(document.querySelectorAll('link[rel="alternate"]')).map((l) => l.hreflang + " " + new URL(l.href).pathname),
    bryter: Array.from(document.querySelectorAll(".bunn .sprakvalg a, .bunn .sprakvalg [aria-current]")).map((a) => a.getAttribute("href") || "*"),
    bunn: Array.from(document.querySelectorAll(".bunn-lenker a")).map((a) => a.getAttribute("href")),
    h1: document.querySelector("h1") && document.querySelector("h1").textContent.trim(),
    manifest: document.querySelector('link[rel="manifest"]').getAttribute("href"),
    tittel: document.title,
    beskrivelse: document.querySelector('meta[name="description"]').content,
    ld: (() => { try { const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)["@graph"]; return { typer: g.map((n) => n["@type"]), spill: g.find((n) => n["@type"] === "ItemList").itemListElement.length }; } catch (e) { return { feil: e.message }; } })(),
    hopp: document.querySelector("body > a.hopp") === document.querySelector("body a"),
  })`);
  const vanlige = side.alle.filter((s) => !s.alder18);
  const atten = side.alle.filter((s) => s.alder18);
  t.sjekk(side.lenker.length === vanlige.length && side.lenker.every((h) => h.startsWith(t.forside)), `A–Å-lista har ${side.lenker.length} lenker, ventet ${vanlige.length} i ${t.forside}`);
  if (!SPRAK) {
    const ventet = bygget.length + (side.alle.some((s) => s.id === "luringen") ? 1 : 0);
    t.sjekk(side.alle.length === ventet, `Spillista har ${side.alle.length} spill, ventet ${ventet}`);
    for (const id of bygget) t.sjekk(side.alle.some((s) => s.id === id), `Forsiden mangler ${id}`);
  } else t.sjekk(side.alle.length === UTGAVE.size, `Spillista på ${SPRAK} har ${side.alle.length} spill, ventet ${UTGAVE.size}`);
  t.sjekk(!side.ld.feil && side.ld.typer.includes("WebSite") && side.ld.spill === vanlige.length, `Strukturerte data på forsiden: ${side.ld.feil || `${(side.ld.typer || []).join(", ")}, ${side.ld.spill} spill (ventet ${vanlige.length})`}`);
  t.sjekk(["nb /", "en /en/", "da /da/", "x-default /"].every((x) => side.hreflang.includes(x)), `hreflang på forsiden: ${side.hreflang.join(", ")}`);
  t.sjekk(side.bryter.length === 3 && side.bryter.includes("*"), `Språkvalget i bunnen: ${side.bryter.join(", ")}`);
  t.sjekk(side.bunn.every((h) => h.startsWith(t.forside)), `Bunnlenkene peker ut av utgaven: ${side.bunn.join(", ")}`);
  t.sjekk(!!side.h1 && side.manifest === `${t.forside}manifest.webmanifest` && side.hopp, `Forsiden mangler h1, eget manifest eller hopp-lenken først (${side.manifest})`);
  if (t.norsk) {
    t.sjekk(/selskapsleker/.test(side.tittel) && /selskapsleker/.test(side.beskrivelse) && !/festspill/i.test(side.tittel + side.beskrivelse), `Tittel eller beskrivelse på forsiden: «${side.tittel}» / «${side.beskrivelse}»`);
    t.sjekk(side.h1.endsWith("Hva skal vi spille?") && (await c.tekst(".start-linje")).trim() === `${side.alle.length} gratis spill · ingen konto · ingen reklame`, `Overskriften eller linja under den: «${side.h1}» / «${await c.tekst(".start-linje")}»`);
  }
  // No drinking game before the 18+ door: not in the list, not anywhere on the page.
  let f = await les();
  t.sjekk(f.atten.length === 0 && !(await c.js(`${JSON.stringify(atten.map((s) => s.url))}.some((u) => document.querySelector('a[href="' + u + '"]'))`)), "Et drikkespill vises før 18-årsbekreftelsen");
  t.sjekk(f.live === "polite" && f.si === "", `Antallet leses ikke høflig opp (aria-live="${f.live}"), eller noe leses opp ved lasting («${f.si}»)`);

  // The first screen: the top bar with the search and the dice, the shortcuts and the rooms.
  const forste = await c.js(`(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { topp: Math.round(b.top), bunn: Math.round(b.bottom), venstre: Math.round(b.left), hoyre: Math.round(b.right) }; };
    const rom = Array.from(document.querySelectorAll("#rommene .rom")).map((b) => b.getBoundingClientRect());
    return { sok: r("#sok"), terning: r("#overrask"), hurtig: r("#hurtig"), rom: rom.length, forsteRom: Math.round(rom[0].bottom), sisteRom: Math.round(rom[rom.length - 1].bottom), figurer: document.querySelectorAll("#rommene .rom-gjeng > svg").length, vh: innerHeight, vw: innerWidth };
  })()`);
  t.sjekk(forste.sok.bunn <= 80 && forste.terning.hoyre <= forste.vw && forste.hurtig.topp < forste.vh, `Søket, terningen eller snarveiene er ikke på første skjerm (${JSON.stringify(forste)})`);
  t.sjekk(forste.rom >= 9 && forste.figurer >= 16, `Rommene mangler eller har ikke figurene sine (${forste.rom} rom, ${forste.figurer} figurer)`);
  // «Hjelp oss å velge» (the three questions) is the first chip, whole on the first screen and filled.
  const velg = await c.js(`(() => { const k = document.querySelector("#flere"); const b = k.getBoundingClientRect(); const andre = document.querySelector("[data-hurtig]"); return { forst: document.querySelector("#hurtig").firstElementChild === k, venstre: Math.round(b.left), hoyre: Math.round(b.right), bunn: Math.round(b.bottom), vw: innerWidth, vh: innerHeight, egenFarge: getComputedStyle(k).backgroundColor !== getComputedStyle(andre).backgroundColor, tekst: k.textContent.trim() }; })()`);
  t.sjekk(velg.forst && velg.venstre >= 0 && velg.hoyre <= velg.vw && velg.bunn <= velg.vh && velg.egenFarge, `«Hjelp oss å velge» er ikke den første brikken, hel og tydelig på første skjerm (${JSON.stringify(velg)})`);
  if (t.norsk) t.sjekk(velg.tekst.endsWith("Hjelp oss å velge"), `Knappen til de tre spørsmålene heter «${velg.tekst}»`);
  // The room «På nett»: the games that can be played online, with a count.
  const nettRom = await c.js(`(() => { const b = document.querySelector('#rommene [data-rom="nett"]'); return b ? { antall: Number(b.querySelector(".rom-antall").textContent), ventet: (window.RUSJ_SPILLISTE || []).filter((s) => s.nett && !s.alder18).length } : null; })()`);
  t.sjekk(nettRom && nettRom.antall === nettRom.ventet && nettRom.antall > 0, `Rommet «På nett» mangler eller teller feil (${JSON.stringify(nettRom)})`);
  if (staende && HOYDE >= 800) t.sjekk(forste.sisteRom <= forste.vh, `Rommene får ikke plass på første skjerm (slutter på ${forste.sisteRom} av ${forste.vh} px)`);
  else if (staende || stor) t.sjekk(forste.forsteRom <= forste.vh, `Den første raden med rom er ikke på første skjerm (slutter på ${forste.forsteRom} av ${forste.vh} px)`);
  // The search field's placeholder fits («Søk i 104 spill»), also on the smallest phones.
  const ph = await c.js(`(() => { const f = document.querySelector("#sok"); const s = getComputedStyle(f, "::placeholder"); const x = document.createElement("canvas").getContext("2d"); x.font = s.fontWeight + " " + s.fontSize + " " + s.fontFamily; const px = (n) => parseFloat(getComputedStyle(f)[n]) || 0; return { tekst: f.placeholder, bredde: Math.ceil(x.measureText(f.placeholder).width), rom: Math.floor(f.getBoundingClientRect().width - px("paddingLeft") - px("paddingRight")) }; })()`);
  t.sjekk(ph.bredde <= ph.rom, `Plassholderen «${ph.tekst}» får ikke plass i søkefeltet (${ph.bredde} px tekst, ${ph.rom} px rom)`);
  if (t.norsk) t.sjekk(ph.tekst === `Søk i ${side.alle.length} spill`, `Plassholderen: «${ph.tekst}»`);
  // Only the first screen's mascots are drawn into the page; the list's are lazy pictures.
  const bilder = await c.js(`({ lat: document.querySelectorAll('#alle-liste img[loading="lazy"]').length, inline: document.querySelectorAll("#alle-liste svg.figur").length, lastet: Array.from(document.querySelectorAll('#alle-liste img')).filter((i) => i.complete && i.naturalWidth).length })`);
  t.sjekk(bilder.lat === vanlige.length && bilder.inline === 0, `A–Å-lista: ${bilder.lat} late bilder og ${bilder.inline} innebygde figurer (ventet ${vanlige.length} og 0)`);
  // The top bar stays at the top, at one height, as the page scrolls.
  const linje = await c.js(`(async () => { const l = document.querySelector("#linje"); const h0 = l.offsetHeight; scrollTo(0, 1500); await new Promise((r) => setTimeout(r, 200)); const b = l.getBoundingClientRect(); const ut = { topp: Math.round(b.top), h0, h1: l.offsetHeight, kant: l.classList.contains("skygget") }; scrollTo(0, 0); return ut; })()`);
  t.sjekk(linje.topp === 0 && linje.h0 === linje.h1 && linje.kant, `Topplinja fester seg ikke øverst eller endrer høyde (${JSON.stringify(linje)})`);

  // ---------- Keyboard: the order of the first stops, each with a visible ring ----------
  await c.js("document.activeElement && document.activeElement.blur(); scrollTo(0, 0)");
  // («Hjelp oss å velge», #flere, comes before the shortcuts: it was the last chip, out of sight.)
  const ventetStopp = ["hopp", "linje-logo", "#sok", "#overrask", "SUMMARY", "#flere", ...Array(6).fill("hurtig"), ...Array(forste.rom).fill("rom"), "#installtips-vis", "#installtips-lukk"];
  const stopp = [];
  for (let i = 0; i < ventetStopp.length; i++) {
    await tast("Tab", 9);
    await c.sov(60);
    stopp.push(
      await c.js(`(() => { const e = document.activeElement; const s = getComputedStyle(e); const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2) || (e.id === "sok" && /255, 210, 63/.test(s.boxShadow)); const b = e.getBoundingClientRect(); const synlig = b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; const navn = e.id ? "#" + e.id : e.dataset.hurtig ? "hurtig" : e.classList.contains("rom") ? "rom" : String(e.className).split(" ")[0] || e.tagName; return navn + (ring ? "" : " (uten synlig fokus)") + (synlig ? "" : " (utenfor skjermen)"); })()`),
    );
  }
  t.sjekk(stopp.join(" → ") === ventetStopp.join(" → "), `Tab-rekkefølgen på forsiden: ${stopp.join(" → ")}`);
  // The skip link: to «Alle spill A–Å», with its heading in sight under the top bar.
  await c.js("scrollTo(0, 0); document.querySelector('a.hopp').focus()");
  await tast("Enter", 13);
  await c.sov(500);
  const hopp = await c.js(`(() => { const a = document.querySelector("#alle-t").getBoundingClientRect(); return { fokus: document.activeElement && document.activeElement.id, topp: Math.round(a.top), linje: document.querySelector("#linje").offsetHeight, vh: innerHeight }; })()`);
  t.sjekk(hopp.fokus === "alle" && hopp.topp >= hopp.linje - 2 && hopp.topp < hopp.vh / 2, `Hopp-lenken går ikke til «Alle spill A–Å» (fokus ${hopp.fokus}, overskriften på ${hopp.topp} px)`);
  // Tabbing backwards from the end of the list: what gets focus is never under the bars on top.
  await c.js(`(() => { const a = Array.from(document.querySelectorAll("#alle-liste a")); a[a.length - 1].focus(); })()`);
  await c.sov(200);
  const dekket = [];
  for (let i = 0; i < 8; i++) {
    await tast("Tab", 9, 8);
    await c.sov(80);
    const under = await c.js(`(() => { const e = document.activeElement; const sperre = Math.max(document.querySelector("#linje").getBoundingClientRect().bottom, getComputedStyle(document.querySelector("#resultat-topp")).position === "sticky" ? document.querySelector("#resultat-topp").getBoundingClientRect().bottom : 0); const b = e.getBoundingClientRect(); return !e.closest("#linje, #resultat-topp") && b.top < sperre - 2 ? (e.getAttribute("href") || e.className) + " (" + Math.round(sperre - b.top) + " px)" : ""; })()`);
    if (under) dekket.push(under);
  }
  t.sjekk(dekket.length === 0, `Fokus havner under topplinja når man tabber bakover: ${dekket.join(", ")}`);
  await c.js("document.activeElement.blur(); scrollTo(0, 0)");
  await c.sov(200);

  // ---------- A shortcut: «Vorspiel» – the party games, and the door to the drinking games ----------
  await c.klikk('[data-hurtig="vors"]');
  await c.sov(900);
  f = await les();
  const vors = await c.js(`(() => { const F = window.RusjFinner; const v = F.HURTIG.vors(false); return (window.RUSJ_SPILLISTE || []).filter((s) => F.passer(s, v, { maned: new Date().getMonth() + 1 })).map((s) => s.id).sort(); })()`);
  t.sjekk(f.vist.slice().sort().join() === vors.join() && f.vist.length >= 6, `«Vorspiel» viser ${f.vist.length} spill, ventet ${vors.length}`);
  t.sjekk(f.atten.length === 0 && /\S/.test(f.dor), `«Vorspiel» viser drikkespill før aldersdøra, eller mangler døra til dem («${f.dor}»)`);
  t.sjekk(f.trykket.join() === "vors" && f.aktive.length === 1 && f.aktive[0].startsWith("hurtig:") && f.nullstill, `«Vorspiel»: trykket ${f.trykket}, merkelapper ${f.aktive.join(" | ")}`);
  t.sjekk(f.beste.length === 3 && f.beste.every((b) => vors.includes(b.id)), `«Vorspiel» gir ikke tre forslag som passer (${f.beste.map((b) => b.id).join(", ")})`);
  t.sjekk(/\d/.test(f.si), `Antallet leses ikke opp etter et valg («${f.si}»)`);
  if (t.norsk) t.sjekk(f.tittel === `${f.vist.length} spill passer` && f.dor.includes("Vis drikkespillene") && f.aktive[0] === "hurtig:🍻 Vorspiel", `Tekstene etter «Vorspiel»: «${f.tittel}», «${f.dor}», ${f.aktive}`);
  const iSyne = await c.js(`(() => { const a = document.querySelector("#alle").getBoundingClientRect(); return a.top >= -2 && a.top < innerHeight / 2; })()`);
  t.sjekk(iSyne, "Lista kommer ikke opp under topplinja etter en snarvei");
  await t.bilde("forside-vorspiel");
  // Off again with the chip's ×: everything is back, and the focus has somewhere to be.
  await c.klikk('#aktive [data-fjern="hurtig"]');
  f = await les();
  t.sjekk(f.vist.length === vanlige.length && !f.nullstill && f.aktive.length === 0 && f.trykket.length === 0, `Merkelappens × tar ikke bort «Vorspiel» (${f.vist.length} spill, ${f.aktive})`);
  t.sjekk(await c.js(`document.activeElement && document.activeElement.id === "alle-t"`), "Fokus går ikke til overskriften når den siste merkelappen fjernes");
  if (t.norsk) t.sjekk(f.tittel === "Alle spill A–Å", `Overskriften etter at valget er fjernet: «${f.tittel}»`);

  // ---------- Rooms: «Arkade» holds the arcade games; a room and a shortcut together ----------
  const rom = (id) => c.js(`(window.RUSJ_SPILLISTE || []).filter((s) => window.RusjFinner.iRom(s, ${JSON.stringify(id)})).map((s) => s.id).sort()`);
  await c.klikk('#rommene [data-rom="arkade"]');
  await c.sov(400);
  f = await les();
  const arkade = await rom("arkade");
  t.sjekk(arkade.length >= 6 && f.vist.slice().sort().join() === arkade.join() && f.trykket.join() === "arkade", `Rommet «Arkade» viser ${f.vist.join(", ")}, ventet ${arkade.join(", ")}`);
  t.sjekk(f.beste.length === 3 && f.beste.every((b) => arkade.includes(b.id)), "Rommet «Arkade» gir ikke tre forslag fra rommet");
  await t.bilde("forside-arkade");
  await c.klikk('#rommene [data-rom="arkade"]');
  t.sjekk((await les()).vist.length === vanlige.length, "Et nytt trykk på rommet tar det ikke bort");
  await c.klikk('#rommene [data-rom="fest"]');
  await c.klikk('[data-hurtig="to"]');
  f = await les();
  const fest = await rom("fest");
  const to = await c.js(`(() => { const F = window.RusjFinner; return (window.RUSJ_SPILLISTE || []).filter((s) => F.passer(s, F.HURTIG.to(false), { maned: new Date().getMonth() + 1 })).map((s) => s.id); })()`);
  t.sjekk(f.vist.length > 0 && f.vist.every((id) => fest.includes(id) && to.includes(id)) && f.aktive.length === 2, `Fest + «To stykker» viser ${f.vist.join(", ")} (${f.aktive.join(" | ")})`);
  await c.klikk('#aktive [data-fjern="rom"]');
  f = await les();
  t.sjekk(f.aktive.length === 1 && f.aktive[0].startsWith("hurtig:") && f.vist.slice().sort().join() === to.slice().sort().join(), "Når rommet fjernes, står ikke snarveien igjen alene");
  t.sjekk(await c.js(`document.activeElement && document.activeElement.dataset.fjern === "hurtig"`), "Fokus går ikke til neste merkelapp når én fjernes");
  await c.klikk("#nullstill");
  f = await les();
  t.sjekk(f.vist.length === vanlige.length && f.aktive.length === 0 && (await c.js(`document.activeElement.id === "alle-t"`)), "«Nullstill» viser ikke alle spillene igjen, eller fokus forsvinner");

  // ---------- Search ----------
  const sok = async (q) => {
    await c.skrivInn("#sok", q);
    await c.sov(250);
    return les();
  };
  const etNavn = vanlige[Math.floor(vanlige.length / 2)];
  f = await sok(etNavn.navn);
  t.sjekk(f.vist.includes(etNavn.id) && f.aktive.some((a) => a.startsWith("sok:")), `Søket etter «${etNavn.navn}» finner ikke spillet (${f.vist.join(", ")})`);
  t.sjekk(await c.js(`(() => { const a = document.querySelector("#alle").getBoundingClientRect(); return a.top >= -2 && a.top < innerHeight / 2; })()`), "Treffene kommer ikke opp under topplinja når man søker");
  await t.bilde("forside-sok");
  await c.klikk("#sok-tom");
  t.sjekk((await les()).vist.length === vanlige.length, "«Tøm søket» viser ikke alle spillene igjen");
  f = await sok("xyzzy");
  t.sjekk(f.vist.length === 0 && f.ingen, "Et tulleord gir treff, eller «ingen spill passer» vises ikke");
  await tast("Escape", 27);
  await c.sov(100);
  t.sjekk((await les()).vist.length === vanlige.length && (await c.js(`document.querySelector("#sok").value`)) === "", "Escape tømmer ikke søket");
  if (t.norsk) {
    // The words people actually use find the games (rusj/seo.json), and the facts can be searched in phrases.
    const finner = { alias: "skravla", imposter: "luringen", "nødt": "vaghalsen", pekeleken: "pekefingeren", "secret santa": "nissetrekning", ludo: "brikka", mafia: "varulven", musikk: "nynneren", "bli kjent": "lognhalsen", arkadespill: "slangen" };
    const anledninger = ["vors", "bursdag", "hyttetur", "selskapsleker", "festleker", "julebord", "klassefest", "leker til barnebursdag"];
    const faktasok = { "flere mobiler": (s) => s.mobiler !== "en", "én mobil": (s) => s.mobiler !== "hver", alene: (s) => s.spillere[0] === 1, "mot mobilen": (s) => !!s.motMobilen };
    const treff = await c.js(`(() => {
      const felt = document.querySelector("#sok");
      const ut = {};
      for (const q of ${JSON.stringify([...Object.keys(finner), ...anledninger, ...Object.keys(faktasok), "quiz"])}) {
        felt.value = q;
        felt.dispatchEvent(new Event("input", { bubbles: true }));
        ut[q] = Array.from(document.querySelectorAll("#alle-liste li[data-id]")).filter((li) => !li.hidden).map((li) => li.dataset.id).sort();
      }
      felt.value = "";
      felt.dispatchEvent(new Event("input", { bubbles: true }));
      return ut;
    })()`);
    for (const [q, id] of Object.entries(finner)) if (side.alle.some((s) => s.id === id)) t.sjekk(treff[q].includes(id), `Søket «${q}» finner ikke ${id} (fant: ${treff[q].join(", ") || "ingenting"})`);
    if (vanlige.length > 20) for (const q of anledninger) t.sjekk(treff[q].length >= 3, `Søket «${q}» gir bare ${treff[q].length} treff`);
    const liste = await c.js(`window.RUSJ_SPILLISTE`);
    for (const [q, passer] of Object.entries(faktasok)) {
      const ventet = liste.filter((s) => !s.alder18 && passer(s)).map((s) => s.id).sort();
      t.sjekk(treff[q].join() === ventet.join(), `Søket «${q}» gir ${treff[q].length} spill, ventet ${ventet.length}`);
    }
    t.sjekk(treff.quiz.length > 3 && treff.quiz.length < vanlige.length, `Søket «quiz» viser ${treff.quiz.length} spill`);
    // Drinking games in a search before the door: the door says how many, never the games.
    if (atten.length) {
      f = await sok("drikkeleker");
      t.sjekk(f.atten.length === 0 && new RegExp(`\\+ ${atten.length} for voksne \\(18\\+\\)`).test(f.dor) && !f.ingen, `Søket «drikkeleker» før aldersdøra: døra sier «${f.dor}»${f.ingen ? ", og «ingen spill passer» vises" : ""}`);
      await t.bilde("forside-drikkeleker");
      await c.klikk("#sok-tom");
    }
  }

  // ---------- The search understands people (rusj/portal/sok.js), in every edition ----------
  // A typo, a name people use, nothing found, a well-known game that is not here, a head count,
  // «på nett» – and a game inside a game, as a row that opens it.
  const ORD = {
    nb: { skrivefeil: ["yatsy", "yatzy"], antall: "for to", nett: "på nett" },
    en: { skrivefeil: ["dicye", "dicey"], antall: "for two", nett: "online" },
    da: { skrivefeil: ["yatsy", "yatzy"], antall: "for to", nett: "online" },
  }[t.sprak];
  const har = (id) => side.alle.some((s) => s.id === id);
  // The rows the list shows now, in order: games and games inside games.
  const rader = () =>
    c.js(`Array.from(document.querySelectorAll("#alle-liste > li[data-id], #alle-liste > li[data-var]")).filter((li) => !li.hidden).map((li) => { const a = li.querySelector("a.spillflis"); const f = li.querySelector(".spillflis-fakta"); return { n: li.dataset.id || li.dataset.var, navn: li.querySelector(".spillflis-navn").innerText.trim(), sjanger: li.querySelector(".spillflis-sjanger").innerText.trim(), fakta: f && f.offsetParent ? f.innerText.replace(/\\s+/g, " ").trim() : "", href: a.getAttribute("href"), etikett: a.getAttribute("aria-label") || "", tekst: li.innerText }; })`);
  const aaRekke = await c.js(`Array.from(document.querySelectorAll("#alle-liste > li[data-id]")).map((li) => li.dataset.id).join()`);
  if (har("terninga")) {
    // A typo: the nearest word we know, said in a line over the matches – and the row says what the game is.
    f = await sok(ORD.skrivefeil[0]);
    const rettet = await c.js(`(() => { const m = document.querySelector("#sok-melding"); return { synlig: !m.hidden && !!m.offsetParent, tekst: m.textContent, fokus: document.activeElement && document.activeElement.id, rader: document.querySelector("#alle-liste").classList.contains("rader"), bokstaver: document.querySelectorAll("#alle-liste > li.forste").length }; })()`);
    let r = await rader();
    t.sjekk(f.vist[0] === "terninga" && rettet.synlig && rettet.tekst.includes(ORD.skrivefeil[1]) && !f.ingen, `Skrivefeilen «${ORD.skrivefeil[0]}» finner ikke Yatzy-spillet med en linje om hva som vises (${f.vist.slice(0, 3).join(", ")}; «${rettet.tekst}»)`);
    t.sjekk(rettet.fokus === "sok", `Fokus forlater søkefeltet mens man skriver (${rettet.fokus})`);
    t.sjekk(rettet.rader && rettet.bokstaver === 0 && r[0] && /\S/.test(r[0].sjanger) && /\d/.test(r[0].fakta) && r[0].etikett.startsWith(r[0].navn), `Et treff er ikke en rad med navn, sjanger og fakta (${JSON.stringify(r[0])})`);
    if (t.norsk) t.sjekk(rettet.tekst === "Viser treff for «yatzy»" && r[0].sjanger === "Yatzy", `Linja etter en skrivefeil: «${rettet.tekst}», sjangeren: «${r[0] && r[0].sjanger}»`);
    await c.sov(800);
    t.sjekk((await c.tekst("#si")).includes(ORD.skrivefeil[1]), `Rettingen leses ikke opp («${await c.tekst("#si")}»)`);
    await t.bilde("forside-sok-skrivefeil");
    // A name people use (another company's game): the game is found, the name is never shown by us.
    if (har("vriatter")) {
      f = await sok("uno");
      r = await rader();
      t.sjekk(f.vist[0] === "vriatter" && r.length >= 1 && !/\buno\b/i.test(r.map((x) => x.tekst + " " + x.etikett).join(" ")), `Søket «uno» finner ikke kortspillet, eller merkenavnet står i raden (${f.vist.slice(0, 3).join(", ")})`);
      await t.bilde("forside-sok-merke");
    }
  }
  // Nothing found is never a dead end: three games to try and the kinds of game, and what was
  // typed is shown as text.
  f = await sok("<i>xyzzy</i>");
  let ingen = await c.js(`(() => { const b = document.querySelector("#ingen-treff"); return { synlig: !b.hidden && !!b.offsetParent, spill: Array.from(b.querySelectorAll(".ingen-liste a.spillflis")).map((a) => a.getAttribute("href")), rom: Array.from(b.querySelectorAll("[data-til-rom]")).map((k) => k.dataset.tilRom), tittel: (b.querySelector(".ingen-tittel") || {}).textContent || "", ikke: !!b.querySelector(".ingen-ikke"), merket: b.querySelectorAll("i").length, fokus: document.activeElement && document.activeElement.id }; })()`);
  t.sjekk(f.vist.length === 0 && f.ingen && ingen.synlig && ingen.spill.length === 3 && ingen.rom.length >= 5 && !ingen.rom.includes("voksen") && !ingen.ikke, `Et søk uten treff gir ikke tre spill og rommene (${JSON.stringify(ingen)})`);
  t.sjekk(ingen.merket === 0 && ingen.tittel.includes("<i>xyzzy</i>") && ingen.fokus === "sok", `Det som ble skrevet, vises ikke som ren tekst, eller fokus forlot søkefeltet (${JSON.stringify(ingen)})`);
  t.sjekk(!ingen.spill.some((h) => atten.some((s) => s.url === h)), "Et drikkespill foreslås etter et søk uten treff");
  if (t.norsk) t.sjekk(ingen.tittel === "Fant ingen spill for «<i>xyzzy</i>»", `Teksten uten treff: «${ingen.tittel}»`);
  await t.bilde("forside-sok-ingen");
  // A well-known game we do not have: said plainly, with the nearest kind of game.
  f = await sok("poker");
  ingen = await c.js(`(() => { const b = document.querySelector("#ingen-treff"); return { synlig: !b.hidden, ikke: !!b.querySelector(".ingen-ikke"), spill: b.querySelectorAll(".ingen-liste a.spillflis").length, forsteRom: (b.querySelector("[data-til-rom]") || { dataset: {} }).dataset.tilRom }; })()`);
  t.sjekk(f.vist.length === 0 && ingen.synlig && ingen.ikke && ingen.spill >= 1 && ingen.forsteRom === "kort", `«poker» sier ikke «det har vi ikke ennå» med kortspillene som nærmeste (${JSON.stringify(ingen)})`);
  if (t.norsk) t.sjekk((await c.tekst("#ingen-treff .ingen-ikke")).trim() === "Det har vi ikke ennå.", "Teksten «Det har vi ikke ennå.» mangler");
  await t.bilde("forside-sok-ikke-enna");
  // A kind of game from the box: the search gives way to the room.
  await c.klikk('#ingen-treff [data-til-rom="kort"]');
  f = await les();
  t.sjekk(f.trykket.join() === "kort" && f.vist.length >= 5 && !f.ingen && (await c.js(`document.querySelector("#sok").value`)) === "" && f.aktive.length === 1, `Et rom fra «ingen treff» åpner ikke rommet i stedet for søket (${f.aktive.join(" | ")})`);
  // A room is rows too, and a game with well-known games inside it says which, as links.
  if (har("kortkongen")) {
    const ogsa = await c.js(`(() => { const li = document.querySelector('#alle-liste li[data-id="kortkongen"]'); const p = li && li.querySelector(".flis-ogsa"); return p ? { synlig: !!p.offsetParent, lenker: Array.from(p.querySelectorAll("a")).map((a) => a.getAttribute("href")), navn: Array.from(p.querySelectorAll("a")).every((a) => a.textContent.trim() && a.getAttribute("aria-label")) } : null; })()`);
    t.sjekk(ogsa && ogsa.synlig && ogsa.lenker.length === 5 && ogsa.navn && ogsa.lenker.every((h) => /\/#variant=[a-z]+$/.test(h)), `Raden til kabalspillet i rommet «Kort» viser ikke kabalene inni det (${JSON.stringify(ogsa)})`);
    await c.js(`document.querySelector('#alle-liste li[data-id="kortkongen"]').scrollIntoView({ block: "center" })`);
    await t.bilde("forside-rom-rader");
  }
  await c.klikk("#nullstill");
  // A head count and «på nett» are read as such.
  f = await sok(ORD.antall);
  const forTo = side.alle.length && (await c.js(`(window.RUSJ_SPILLISTE || []).filter((s) => !s.alder18 && s.spillere[0] <= 2 && s.spillere[1] >= 2).map((s) => s.id).sort().join()`));
  t.sjekk(f.vist.slice().sort().join() === forTo && f.vist.length > 0, `«${ORD.antall}» viser ${f.vist.length} spill, ventet dem to kan spille`);
  f = await sok(ORD.nett);
  t.sjekk(f.vist.slice().sort().join() === (await rom("nett")).join(), `«${ORD.nett}» viser ikke akkurat spillene i rommet «På nett» (${f.vist.length})`);
  // A game inside a game is a row of its own, and opens the game with it chosen.
  if (har("kortkongen")) {
    f = await sok("freecell");
    const r = await rader();
    const kk = side.alle.find((s) => s.id === "kortkongen");
    t.sjekk(f.vist.length === 0 && !f.ingen && r.length === 1 && r[0].n === "kortkongen#freecell" && r[0].href === kk.url + "#variant=freecell" && r[0].navn.includes(kk.navn) && r[0].etikett.includes(kk.navn), `«freecell» gir ikke raden for kabalen inni kabalspillet (${JSON.stringify(r.map((x) => [x.n, x.href, x.navn]))})`);
    t.sjekk(/1/.test(f.tittel) && side.alle.length === (await c.js("window.RUSJ_SPILLISTE.length")), `En variant telles som et spill, eller overskriften teller den ikke som treff («${f.tittel}»)`);
    if (t.norsk) t.sjekk(r[0] && r[0].navn === "FreeCell · i Kortkongen", `Raden heter «${r[0] && r[0].navn}»`);
    await t.bilde("forside-sok-variant");
    await c.klikk('#alle-liste li[data-var="kortkongen#freecell"] a');
    const apnet = await venter(`window.Rusj && Rusj.S && Rusj.S.skjerm === "vspill" && Rusj.S.vid === "freecell"`, 10000);
    t.sjekk(apnet && (await c.js("location.pathname + location.hash")) === kk.url, `Raden åpner ikke kabalspillet med FreeCell på bordet (${await c.js("location.pathname + location.hash")})`);
    await c.sov(300);
    await t.bilde("forside-variant-apnet");
    await c.lastSide(t.side, "document.querySelector('#alle-liste')");
    await c.js(`localStorage.removeItem(${JSON.stringify(t.nokkel("kortkongen.v1"))})`);
    await lastPaNytt();
  } else await c.klikk("#sok-tom");
  // With the search gone, the list is A–Å again: the small cards, the letters and the order.
  await c.js(`(() => { const f = document.querySelector("#sok"); f.value = ""; f.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const tilbake = await c.js(`({ rekke: Array.from(document.querySelectorAll("#alle-liste > li[data-id]")).map((li) => li.dataset.id).join(), rader: document.querySelector("#alle-liste").classList.contains("rader"), bokstaver: document.querySelectorAll("#alle-liste > li.forste").length, varianter: document.querySelectorAll("#alle-liste > li[data-var]").length, sjanger: Array.from(document.querySelectorAll("#alle-liste > li[data-id] .spillflis-sjanger")).filter((s) => s.offsetParent && s.textContent.trim()).length })`);
  t.sjekk(tilbake.rekke === aaRekke && !tilbake.rader && tilbake.bokstaver >= Math.min(8, vanlige.length) && tilbake.varianter === 0, `Etter søket er ikke lista A–Å igjen (${JSON.stringify({ lik: tilbake.rekke === aaRekke, rader: tilbake.rader, bokstaver: tilbake.bokstaver, varianter: tilbake.varianter })})`);
  t.sjekk(tilbake.sjanger === vanlige.length, `Bare ${tilbake.sjanger} av ${vanlige.length} kort i «Alle spill A–Å» viser hva spillet er (sjangeren)`);
  // «Med barna» is together: the first suggestion is never a game for one alone.
  await c.klikk('[data-hurtig="barn"]');
  f = await les();
  const barn = await c.js(`${JSON.stringify(f.beste.map((b) => b.id))}.map((id) => window.RUSJ_SPILLISTE.find((s) => s.id === id).spillere[1])`);
  t.sjekk(f.beste.length === 3 && barn.every((n) => n >= 2), `«Med barna» foreslår et spill for én (${f.beste.map((b) => b.id).join(", ")})`);
  t.sjekk((await c.js(`Array.from(document.querySelectorAll("#beste .forslagkort-sjanger")).filter((s) => s.textContent.trim()).length`)) === 3, "Forslagskortene viser ikke hva spillene er (sjangeren)");
  await c.klikk("#nullstill");

  // ---------- The three questions («Hjelp oss å velge») ----------
  await c.js("scrollTo(0, 0)");
  await c.klikk("#flere");
  t.sjekk(await c.js(`!document.querySelector("#finner").hidden && document.querySelector("#flere").getAttribute("aria-expanded") === "true"`), "«Hjelp oss å velge» åpner ikke de tre spørsmålene");
  const velgAlder = async (v) => {
    await c.js(`(() => { const s = document.querySelector("#finner-yngst"); s.value = ${JSON.stringify(String(v))}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await c.sov(150);
  };
  await c.klikk('[data-finn-antall="3-4"]');
  await velgAlder(7);
  f = await les();
  const passer7 = await c.js(`(() => { const F = window.RusjFinner; return (window.RUSJ_SPILLISTE || []).filter((s) => F.passer(s, { antall: "3-4", yngst: 7, lyst: "alt" }, { maned: new Date().getMonth() + 1 })).map((s) => s.id).sort(); })()`);
  t.sjekk(f.vist.slice().sort().join() === passer7.join() && f.vist.length >= 4, `Tre–fire med en sjuåring viser ${f.vist.length} spill, ventet ${passer7.length}`);
  t.sjekk(f.aktive.length === 2 && f.aktive[0].startsWith("antall:") && f.aktive[1].startsWith("yngst:"), `Merkelappene for svarene: ${f.aktive.join(" | ")}`);
  t.sjekk(f.beste.length === 3 && f.beste.every((b) => passer7.includes(b.id) && /7|\d/.test(b.grunn)), `Forslagene for tre–fire med en sjuåring: ${f.beste.map((b) => b.id).join(", ")}`);
  if (t.norsk) {
    t.sjekk(f.aktive.join("|") === "antall:3–4 spillere|yngst:Yngste 7 år", `Merkelappene: ${f.aktive.join(" | ")}`);
    const fra = ([a, b]) => (a === b ? String(a) : `${a}–${b}`);
    const liste = await c.js(`window.RUSJ_SPILLISTE`);
    for (const b of f.beste) {
      const s = liste.find((x) => x.id === b.id);
      t.sjekk(b.grunn.startsWith(`Fra ${s.alder} år`) && b.grunn.includes(`${fra(s.spillere)} spillere`) && b.navn.includes(`Fra ${s.alder} år`), `${b.id}: grunnlinja «${b.grunn}» eller lenkenavnet «${b.navn}»`);
    }
  }
  t.sjekk(JSON.stringify(f.lagret && f.lagret.finn) === JSON.stringify({ antall: "3-4", yngst: 7, lyst: "alt" }), `Svarene lagres ikke i ${t.nokkel("portal")}: ${JSON.stringify(f.lagret)}`);
  await c.js(`document.querySelector("#finner").scrollIntoView({ block: "start" })`);
  await t.bilde("forside-finner");
  // The stepper: one year at a time, and «Voksen» after 17.
  await c.klikk('[data-finn-yngst="1"]');
  t.sjekk((await c.js(`document.querySelector("#finner-yngst").value`)) === "8", "+ i alderen går ikke ett år opp");
  await velgAlder(17);
  await c.klikk('[data-finn-yngst="1"]');
  t.sjekk((await c.js(`document.querySelector("#finner-yngst").value`)) === "voksen" && (await c.js(`document.querySelector('[data-finn-yngst="1"]').getAttribute("aria-disabled")`)) === "true", "Etter 17 kommer ikke «Voksen» som siste trinn");
  await velgAlder(7);
  // Remembered after a reload: the answers and the list.
  const for_ = (await les()).vist.join();
  await lastPaNytt();
  f = await les();
  t.sjekk(f.vist.join() === for_ && f.aktive.length === 2, `Svarene huskes ikke etter omlasting (${f.aktive.join(" | ")})`);
  // The button under the questions goes to the list; Escape closes the questions.
  await c.js("scrollTo(0, 0)");
  await c.klikk("#flere");
  await c.klikk("#finner-vis");
  await c.sov(900);
  t.sjekk(await c.js(`document.activeElement && document.activeElement.id === "alle-t" && document.querySelector("#alle").getBoundingClientRect().top < innerHeight / 2`), "Knappen under spørsmålene går ikke til lista");
  await c.js(`document.querySelector('[data-finn-antall="3-4"]').focus()`);
  await tast("Escape", 27);
  t.sjekk(await c.js(`document.querySelector("#finner").hidden && document.activeElement && document.activeElement.id === "flere"`), "Escape lukker ikke spørsmålene, eller fokus går ikke tilbake til «Hjelp oss å velge»");
  await c.klikk("#nullstill");

  // ---------- The 18+ door: the room, «Nei», «Ja», «Skjul» ----------
  if (atten.length) {
    await c.klikk('#rommene [data-rom="voksen"]');
    t.sjekk(await c.js("document.querySelector('#dialog').open"), "18+-rommet åpner ikke spørsmålet om alder");
    const svarLinjer = await c.js(`(() => { const k = document.querySelector('#dialog [value="ja"]'); const r = document.createRange(); r.selectNodeContents(k); return new Set(Array.from(r.getClientRects()).map((b) => Math.round(b.top))).size; })()`);
    t.sjekk(svarLinjer === 1, `«Ja, jeg er 18 eller eldre» står på ${svarLinjer} linjer i dialogen`);
    await t.bilde("forside-18");
    await c.klikk('#dialog [value="nei"]');
    f = await les();
    t.sjekk(!(await c.js("document.querySelector('#dialog').open")) && f.atten.length === 0 && !(await c.js("document.body.classList.contains('over18')")), "«Nei» viser drikkespillene likevel");
    await c.klikk('#rommene [data-rom="voksen"]');
    await c.klikk('#dialog [value="ja"]');
    await c.sov(300);
    f = await les();
    t.sjekk(f.atten.length === atten.length && f.vist.length === atten.length && f.trykket.join() === "voksen", `18+-rommet viser ${f.atten.length} drikkespill etter «Ja», ventet ${atten.length}`);
    t.sjekk((await c.js(`Array.from(document.querySelectorAll("#finner-yngst option")).map((o) => o.value).slice(-2).join()`)) === "voksen,fest", "«Voksen fest (18+)» er ikke siste trinn etter 18+-bekreftelsen");
    await t.bilde("forside-18-apen");
    // «Vorspiel» now brings the drinking games too.
    await c.klikk('#aktive [data-fjern="rom"]');
    await c.klikk('[data-hurtig="vors"]');
    t.sjekk((await les()).atten.length >= 1, "«Vorspiel» viser ikke drikkespill etter aldersdøra");
    await c.klikk("#nullstill");
    t.sjekk((await les()).vist.length === vanlige.length + atten.length, "Alle spill A–Å har ikke med drikkespillene etter aldersdøra");
    await c.klikk("[data-skjul18]");
    f = await les();
    t.sjekk(f.atten.length === 0 && !(await c.js("document.body.classList.contains('over18')")) && (await c.js("document.activeElement !== document.body")), "«Skjul» skjuler ikke drikkespillene, eller fokus forsvinner");
    t.sjekk(!(await c.js(`Array.from(document.querySelectorAll("#finner-yngst option")).some((o) => o.value === "fest")`)), "«Skjul» tar ikke bort «Voksen fest (18+)»");
    // From a search: the door opens the question, and after «Ja» the games are right there.
    if (t.norsk) {
      await c.skrivInn("#sok", "drikkeleker");
      await c.sov(200);
      await c.klikk("#dor-celle [data-atten]");
      await c.klikk('#dialog [value="ja"]');
      await c.sov(200);
      f = await les();
      t.sjekk(f.atten.length === atten.length && (await c.js("!!document.activeElement.closest('#alle-liste li[data-alder18]')")), "Etter «Ja» fra et søk vises ikke drikkespillene som treff, eller fokus havner ikke på det første");
      await c.klikk("#sok-tom");
      await c.klikk("[data-skjul18]");
    }
  }

  // ---------- «Overrask meg»: a game the page shows, and a player count of its own ----------
  await c.klikk("#overrask");
  await c.vent("document.querySelector('#automat [data-spill]').getAttribute('aria-disabled') === 'false'", 6000);
  const valgt = await c.js("document.querySelector('#automat-svar b')?.textContent || ''");
  t.sjekk(valgt && !atten.some((s) => s.navn === valgt), `Automaten valgte «${valgt}»`);
  const boks = await c.js(`(() => { const r = document.querySelector("#automat").getBoundingClientRect(); return { topp: Math.round(r.top), bunn: Math.round(r.bottom), venstre: Math.round(r.left), hoyre: Math.round(r.right), vh: innerHeight, vw: innerWidth, bilde: !!document.querySelector("#automat .automat-figur:last-child img") }; })()`);
  t.sjekk(boks.topp >= 0 && boks.bunn <= boks.vh && boks.venstre >= 0 && boks.hoyre <= boks.vw && boks.bilde, `Automaten får ikke plass på skjermen eller mangler figuren (${JSON.stringify(boks)})`);
  await t.bilde("forside-overrask");
  await c.klikk('#automat [data-antall="1"]');
  await c.vent("document.querySelector('#automat [data-spill]').getAttribute('aria-disabled') === 'false'", 6000);
  const fire = await c.js(`({ antall: document.querySelector("#automat #antall").textContent, valgt: (window.RUSJ_SPILLISTE || []).find((s) => s.navn === document.querySelector("#automat-svar b").textContent) })`);
  t.sjekk(fire.antall === "2" && fire.valgt && fire.valgt.spillere[0] <= 2 && fire.valgt.spillere[1] >= 2, `Automaten for to spillere valgte ${fire.valgt && fire.valgt.id} (${fire.antall})`);
  if (t.norsk) t.sjekk(/^Blant \d+ spill for 2 spillere$/.test(await c.tekst("#automat-under")), `Automaten sier «${await c.tekst("#automat-under")}»`);
  await tast("Escape", 27);
  await c.sov(200);
  t.sjekk(await c.js("!document.querySelector('#automat').open && document.activeElement && document.activeElement.id === 'overrask'"), "Escape lukker ikke automaten, eller fokus går ikke tilbake til terningen");

  // ---------- «Fortsett», «Kveldens gjeng», «På nett» and saved choices from the old page ----------
  const fortsett = vanlige.find((s) => s.id !== "luringen");
  const navn = ["Ada", "Bo", "Cia", "Dag", "Eli", "Fia", "Gro"];
  await c.js(`localStorage.setItem(${JSON.stringify(`${t.nokkel(fortsett.id)}.v1`)}, JSON.stringify({ _aktiv: true, _tid: Date.now(), skjerm: "spill" }))`);
  // Four players with points (Ada 5, Dag 3, Bo 2, Cia 1) and three without.
  const kveld = { start: Date.now(), spill: [{ id: "x", resultat: navn.map((n, i) => ({ navn: n, plass: Math.min(i + 1, 4) })) }, { id: "y", resultat: [{ navn: "Dag", plass: 1 }, { navn: "Ada", plass: 2 }] }] };
  await c.js(`localStorage.setItem(${JSON.stringify(t.nokkel("kveld"))}, ${JSON.stringify(JSON.stringify(kveld))})`);
  // «På nett» (spill.json "nett"): the game in progress is marked as one, as the list would say it.
  const { identifier } = await c.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `Object.defineProperty(window, "RUSJ_SPILLISTE", { configurable: true, get() { return this.__l; }, set(v) { for (const s of v) if (s.id === ${JSON.stringify(fortsett.id)}) s.nett = true; this.__l = v; } });`,
  });
  await lastPaNytt();
  const rad = await c.js(`(() => { const a = document.querySelector('#fortsett:not([hidden]) #fortsett-rad li[data-id=${JSON.stringify(fortsett.id)}] a'); return a ? { merke: (a.querySelector(".flis-merke.fortsett") || {}).textContent || "", nett: !!a.querySelector(".nett-merke"), navn: a.getAttribute("aria-label") } : null; })()`);
  t.sjekk(rad && rad.merke && rad.nett, `«Fortsett» viser ikke ${fortsett.id} med merket sitt og «På nett» (${JSON.stringify(rad)})`);
  if (t.norsk) t.sjekk(rad && rad.merke === "Fortsett" && rad.navn.startsWith("Fortsett. ") && rad.navn.endsWith("kan spilles på nett."), `«Fortsett»/«På nett» i lenkenavnet: «${rad && rad.navn}»`);
  await c.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  const tavle = () => c.js(`Array.from(document.querySelectorAll("#kveld-liste li:not([hidden])")).map((li) => li.querySelector(".kveld-navn").textContent)`);
  t.sjekk((await tavle()).join(",") === "Ada,Dag,Bo", `Kveldens gjeng viser ikke de tre beste (${(await tavle()).join(", ")})`);
  await c.js(`document.querySelector("#fortsett").scrollIntoView({ block: "start" })`);
  await t.bilde("forside-fortsett");
  await c.klikk("#kveld-alle");
  t.sjekk((await tavle()).length === 7, "«Vis alle» viser ikke hele Kveldens gjeng");
  if (!SPRAK && side.alle.some((s) => s.id === "luringen")) {
    // Luringen keeps its own saved state: «in progress» for 12 hours, and only with the time it was saved.
    const lurRad = async (tid) => {
      await c.js(`localStorage.setItem("luringen.v1", JSON.stringify({ spill: { skjerm: "diskusjon" }${tid ? `, _tid: ${tid}` : ""} }))`);
      await c.js(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
      await c.sov(100);
      return c.finnes('#fortsett-rad li[data-id="luringen"] .flis-merke.fortsett');
    };
    t.sjekk(await lurRad("Date.now() - 60 * 1000"), "Luringen vises ikke under «Fortsett» med et spill fra i sted");
    t.sjekk(!(await lurRad("Date.now() - 13 * 3600 * 1000")), "Luringen står under «Fortsett» 13 timer etter siste runde");
    t.sjekk(!(await lurRad(null)), "Luringen står under «Fortsett» uten tidspunkt for lagringen");
    await c.js(`localStorage.removeItem("luringen.v1")`);
  }
  // The old page kept { antall, tagg, finn }: the type becomes its room, the player count an answer.
  await c.js(`localStorage.setItem(${JSON.stringify(t.nokkel("portal"))}, JSON.stringify({ antall: 6, tagg: "kort", finn: { antall: "", yngst: "voksen", lyst: "alt" } }))`);
  await lastPaNytt();
  f = await les();
  t.sjekk(f.trykket.join() === "kort" && f.aktive.length === 2 && f.aktive[1].startsWith("antall:") && JSON.stringify(f.lagret) === JSON.stringify({ rom: "kort", hurtig: "", finn: { antall: "5-8", yngst: "voksen", lyst: "alt" } }), `Gamle valg flyttes ikke over (${f.aktive.join(" | ")}, ${JSON.stringify(f.lagret)})`);
  await c.klikk("#nullstill");

  // ---------- «Dagens»: today's game, how today went and the streak ----------
  const dagens = await c.js(`(() => { const a = document.querySelector("#dagens-kort"); return a && !a.hidden ? { href: a.getAttribute("href"), navn: a.querySelector(".dagens-navn").textContent, status: document.querySelector("#dagens-status").textContent, dato: document.querySelector("#dagens-dato").textContent } : null; })()`);
  const daglige = await c.js(`(window.RUSJ_SPILLISTE || []).filter((s) => s.tagger.includes("daglig") && !s.alder18).map((s) => s.id)`);
  if (daglige.length) {
    t.sjekk(dagens && dagens.href.endsWith("#dagens") && dagens.status === "" && /\S/.test(dagens.dato), `«Dagens» for en ny besøkende: ${JSON.stringify(dagens)}`);
    const iDag = await c.js(`(() => { const D = window.RusjDaglig; const nr = D.dag().nr; const l = (window.RUSJ_SPILLISTE || []).filter((s) => s.tagger.includes("daglig") && !s.alder18); return { nr, id: l[((nr % l.length) + l.length) % l.length].id }; })()`);
    await c.js(`localStorage.setItem(${JSON.stringify(t.nokkel("daglig"))}, JSON.stringify({ ${JSON.stringify(iDag.id)}: { nr: ${iDag.nr}, vunnet: true, rekke: 3, res: "4/6" }, _: { v: 1, dager: { ${iDag.nr}: [${JSON.stringify(iDag.id)}], ${iDag.nr - 1}: [${JSON.stringify(iDag.id)}], ${iDag.nr - 2}: [${JSON.stringify(iDag.id)}] } } }))`);
    await c.js(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
    await c.sov(200);
    const ferdig = await c.js(`({ merke: (document.querySelector("#dagens-kort .dagens-status-merke") || {}).textContent || "", status: document.querySelector("#dagens-status").textContent, navn: document.querySelector("#dagens-kort").getAttribute("aria-label") })`);
    t.sjekk(ferdig.merke === "✓ 4/6" && /1/.test(ferdig.status) && /3/.test(ferdig.status), `«Dagens» etter en løst oppgave: ${JSON.stringify(ferdig)}`);
    if (t.norsk) t.sjekk(ferdig.status === `✓ 1 av ${daglige.length} i dag · 🔥 3 dager på rad` && ferdig.navn.endsWith(" – ferdig i dag, 4 av 6"), `«Dagens»-teksten: «${ferdig.status}», «${ferdig.navn}»`);
    await c.js(`document.querySelector("#dagens").scrollIntoView({ block: "center" })`);
    await t.bilde("forside-dagens");
    // Rubbish or blocked storage: as for a new visitor, without an error.
    await c.js(`localStorage.setItem(${JSON.stringify(t.nokkel("daglig"))}, "{ødelagt")`);
    await lastPaNytt();
    t.sjekk((await c.tekst("#dagens-status")) === "", "Søppel i lagringen gir status i «Dagens»");
    await c.js(`Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blokkert", "SecurityError"); } }); window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
    await c.sov(200);
    t.sjekk((await c.tekst("#dagens-status")) === "", "Blokkert lagring gir status i «Dagens»");
    await lastPaNytt();
    await c.js(`localStorage.removeItem(${JSON.stringify(t.nokkel("daglig"))})`);
  }

  // ---------- Reduced motion: the list comes up at once ----------
  await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await lastPaNytt();
  await c.js("scrollTo(0, 0)");
  await c.js(`document.querySelector('#rommene [data-rom="familie"]').click()`);
  await c.sov(60);
  t.sjekk(await c.js(`(() => { const a = document.querySelector("#alle").getBoundingClientRect(); return a.top >= -2 && a.top < innerHeight / 2; })()`), "Med redusert bevegelse kommer ikke lista opp med en gang");
  await c.send("Emulation.setEmulatedMedia", { features: [] });
  await c.js("localStorage.clear()");
  await lastPaNytt();

  // The whole page in one image on a phone (capped by the helper); one screen of the list when wide.
  if (BREDDE <= 430) await t.bilde("forside-hel", true);
  else {
    await c.js(`scrollTo(0, document.querySelector("#alle").getBoundingClientRect().top + scrollY - 70)`);
    await t.bilde("forside-liste");
  }

  // ---------- «Send rusj til gjengen» ----------
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
  t.sjekk(qr.del && !qr.tips && qr.topp >= 0 && qr.bunn <= qr.vh && qr.fokus === "del-lenken", `«Send rusj til gjengen»: ${JSON.stringify({ del: qr.del, tips: qr.tips, topp: qr.topp, bunn: qr.bunn, fokus: qr.fokus })}`);
  if (t.norsk) t.sjekk(/Skann for å bli med/.test(qr.tekst), `«Send rusj til gjengen» mangler teksten: ${qr.tekst}`);
  await t.bilde("forside-send-rusj");
  await c.js(`window.__delt = null; navigator.share = undefined; Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true })`);
  await c.klikk("#del-lenken");
  await c.sov(150);
  t.sjekk((await c.js("window.__delt")) === `https://rusj.no${t.forside}`, "«Del lenken» kopierer ikke utgavens forside uten delingsmeny");
  await c.klikk('#dialog [value="ok"]');
  await c.sov(150);
  t.sjekk(await c.js("!document.querySelector('#dialog').open && document.activeElement && document.activeElement.id === 'send-rusj'"), "«Lukk» lukker ikke arket, eller fokus går ikke tilbake til «Send rusj til gjengen»");
  if (t.norsk) {
    const vanligUa = await c.js("navigator.userAgent");
    await c.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 356.0.0.21.107" });
    await lastPaNytt();
    const qrApp = await qrArk();
    t.sjekk(qrApp.tips && /Åpne i nettleseren for å installere og lagre/.test(qrApp.tekst), "Tipset for app-nettlesere mangler inne i Instagram");
    t.sjekk(/Instagram/.test(await c.tekst("#installer-tekst")), "«Ha rusj på hjemskjermen» viser installeringsstegene inne i Instagram");
    await tast("Escape", 27);
    await c.sov(150);
    t.sjekk(await c.js("!document.querySelector('#dialog').open && document.activeElement && document.activeElement.id === 'send-rusj'"), "Escape lukker ikke «Send rusj til gjengen», eller fokus går ikke tilbake");
    await c.send("Emulation.setUserAgentOverride", { userAgent: vanligUa });
    await lastPaNytt();
  }
  // The install tip: «×» hides it for good, and the focus goes to the heading.
  if (await c.js(`!document.querySelector("#installtips").hidden`)) {
    await c.klikk("#installtips-lukk");
    t.sjekk(await c.js(`document.querySelector("#installtips").hidden && document.activeElement.id === "spill"`), "Installeringstipset lukkes ikke, eller fokus går ikke til overskriften");
    await lastPaNytt();
    t.sjekk(await c.js(`document.querySelector("#installtips").hidden`), "Installeringstipset kommer tilbake etter at det er lukket");
  }
}

for (const id of valgt) {
  const mappe = join(BILDER, id);
  mkdirSync(mappe, { recursive: true });
  // A desktop is no phone: no touch emulation, and pixel ratio 1 (at 2 headless Chrome never
  // finishes a 1280 px wide screenshot of the front page).
  const c0 = await startChrome({ bredde: BREDDE, hoyde: HOYDE, mikrofon: true, ...(BREDDE >= 1000 ? { skala: 1, mobil: false } : {}) });
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
        for (const el of document.querySelectorAll("#skjerm *, .ark *, .forside-hoved *")) {
          if (el.closest("svg, canvas, [data-utenfor-ok]")) continue;
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
    // The game's saved state: <id>.v1, or the highest version the game has saved (Nissen is v2).
    tilstand: () => c.js(`(() => { const p = "rusj.${SPRAK ? SPRAK + "." : ""}${id}.v"; const k = Object.keys(localStorage).filter((x) => x.startsWith(p) && /^\\d+$/.test(x.slice(p.length))).sort((a, b) => Number(b.slice(p.length)) - Number(a.slice(p.length)))[0]; return JSON.parse((k && localStorage.getItem(k)) || "null"); })()`),
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
      await c.lastSide(t.side, id === "forside" ? "document.querySelector('#alle-liste')" : "document.querySelector('#skjerm h1')");
    },
  };

  try {
    if (id === "forside") {
      await forsideTur(t, c);
      if (SPRAK) {
        // The pages about rusj in the edition, and the way back from a game.
        for (const side of await c.js(`Array.from(document.querySelectorAll(".bunn-lenker a")).map((a) => a.getAttribute("href"))`)) {
          await c.lastSide(`${tjener.url}${side}`, "document.querySelector('h1')");
          t.sjekk(await c.js("location.pathname.startsWith('/' + document.documentElement.lang + '/')"), `${side}: ikke i utgaven`);
          await t.bilde("side-" + side.split("/").filter(Boolean).pop(), true);
        }
        const spill = [...UTGAVE.keys()];
        if (spill.length) {
          await c.lastSide(`${tjener.url}${UTGAVE.get(spill[0])}`, "document.querySelector('#skjerm h1')");
          t.sjekk((await c.js(`document.querySelector("#tilportal").getAttribute("href")`)) === FORSIDE, "Spillets rusj-knapp går ikke til utgavens forside");
        }
      } else {
      const venter = async (uttrykk, ms = 3000) => {
        try {
          await c.vent(uttrykk, ms);
          return true;
        } catch (e) {
          return false;
        }
      };
      const atten = await c.js("(window.RUSJ_SPILLISTE || []).filter((s) => s.alder18).length");
      // Old Luringen links (rusj.no/#CODE) are sent on to /luringen/ – but only real codes, never a
      // place on this page.
      for (const anker of ["#fortsett", "#overrask", "#spill"]) {
        await c.lastSide("about:blank");
        await c.lastSide(`${tjener.url}/${anker}`, "document.querySelector('#alle-liste') || location.pathname !== '/'");
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
      await c.lastSide(t.side, "document.querySelector('#alle-liste')");
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
      }
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
      // A card that hands over to another game at once (Hviskeleken → Kunstneren with #hvisk) has no
      // home screen of its own: its scenario checks where it lands.
      const overlevert = (await c.js("location.pathname")) !== sideFor(id);
      if (!overlevert && m.alder18) {
        // Drinking games: the kit's 18+ gate comes first; "Nei" leads away, "Ja" opens the game.
        // The gate's heading is the game's name (with «18+»), and it asks as the front page does.
        const port = await c.tekst("#skjerm h1");
        t.sjekk(/18/.test(port) && port.includes(m.navn), `18+-porten vises ikke først i et drikkespill, eller har ikke spillets navn som overskrift («${port.replace(/\s+/g, " ")}»)`);
        t.sjekk({ nb: /Er du 18 år eller eldre\?/, en: /Are you 18 or over\?/, da: /Er du 18 år eller ældre\?/ }[t.sprak].test(await c.tekst("#skjerm h2")), "18+-porten spør ikke «Er du 18 år eller eldre?»");
        t.sjekk(await c.finnes('[data-h="alder-ja"]') && (await c.finnes('[data-h="alder-nei"]')), "18+-porten mangler Ja/Nei");
        await t.bilde("alder");
        await c.klikk('[data-h="alder-ja"]');
        await c.vent("document.querySelector('#skjerm h1') && !document.querySelector('[data-h=\"alder-ja\"]')");
      }
      if (!overlevert) {
        const h1 = await c.tekst("#skjerm h1");
        t.sjekk(h1.trim() === m.navn, `Hjem-skjermen har overskriften «${h1}», ventet «${m.navn}»`);
        t.sjekk(await c.finnes("#tilportal:not([hidden])"), "Mangler rusj-knappen øverst på hjem-skjermen");
        await t.bilde("hjem");
        await c.klikk("#reglerknapp");
        t.sjekk(await c.finnes("#ark:not([hidden]) .steg li"), "Reglene vises ikke");
        await t.bilde("regler");
        await c.klikk('#ark [data-h="lukk-ark"]');
      }
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
