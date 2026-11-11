// End-to-end check in headless Google Chrome, without dependencies (Chrome DevTools Protocol).
// Plays full rounds on a phone-sized screen, saves screenshots and fails on page errors or sideways scrolling.
// Usage: node test/e2e.mjs [screenshot-dir]
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "node:http";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const K = require(join(ROT, "src/kjerne.js"));
const DATA = JSON.parse(readFileSync(join(ROT, "build/ord.json"), "utf8"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BILDER = process.argv[2] || join(tmpdir(), "luringen-e2e");
mkdirSync(BILDER, { recursive: true });

// Serve dist/web over http, like a real website (enables the share link and the QR code).
// RUSJ_WEB=<dir> tests another build than dist/web (so a test run never has to rebuild dist/).
const WEB = process.env.RUSJ_WEB ? join(ROT, process.env.RUSJ_WEB) : join(ROT, "dist/web");
const TYPER = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const tjener = createServer((req, res) => {
  const sti = decodeURIComponent(new URL(req.url, "http://lokal").pathname);
  const fil = join(WEB, sti.endsWith("/") ? sti.replace(/^\/+/, "") + "index.html" : sti.replace(/^\/+/, ""));
  if (!fil.startsWith(WEB) || !existsSync(fil)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": TYPER[extname(fil)] || "application/octet-stream" });
  res.end(readFileSync(fil));
});
await new Promise((r) => tjener.listen(0, "127.0.0.1", r));
// Luringen lives at /luringen/ on rusj.no.
const SIDE = `http://127.0.0.1:${tjener.address().port}/luringen/`;

const sov = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(join(tmpdir(), "luringen-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profil}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--mute-audio",
  "about:blank",
], { stdio: "ignore" });

const feil = [];
const sjekk = (ok, melding) => {
  if (!ok) feil.push(melding);
};
let ws;
let neste = 0;
const ventende = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++neste;
    ventende.set(id, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function js(uttrykk) {
  const r = await send("Runtime.evaluate", { expression: uttrykk, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`JS-feil: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n  i: ${uttrykk}`);
  return r.result.value;
}

async function vent(uttrykk, ms = 5000) {
  const slutt = Date.now() + ms;
  while (Date.now() < slutt) {
    if (await js(`!!(${uttrykk})`)) return;
    await sov(50);
  }
  throw new Error(`Tidsavbrudd: ${uttrykk}`);
}

const klikk = async (sel) => {
  await vent(`document.querySelector(${JSON.stringify(sel)})`);
  const deaktivert = await js(`document.querySelector(${JSON.stringify(sel)}).disabled`);
  if (deaktivert) throw new Error(`Knappen er deaktivert: ${sel}`);
  await js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  await sov(120);
};

async function hold(sel, ms = 700) {
  await js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block: "center"})`);
  await sov(150);
  const r = await js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const treff = await js(`(() => { const el = document.elementFromPoint(${r.x}, ${r.y}); return el ? (el.closest(".mappe") ? "mappe" : el.outerHTML.slice(0, 120)) : "ingenting"; })()`);
  if (treff !== "mappe") feil.push(`Trykket på ${sel} treffer noe annet: ${treff}`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
  await sov(ms);
  const apen = await js(`document.querySelector(${JSON.stringify(sel)}).classList.contains("apen")`);
  if (!apen) feil.push(`Kortet ${sel} åpnet seg ikke ved trykk (${Math.round(r.x)},${Math.round(r.y)})`);
  return async () => {
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
    await sov(500);
  };
}

let bildeNr = 0;
async function bilde(navn, helside = false) {
  await sov(350);
  const bredde = await js("document.documentElement.scrollWidth - window.innerWidth");
  if (bredde > 0) feil.push(`Sidelengs scrolling på «${navn}»: ${bredde}px for bred`);
  const valg = { format: "png" };
  if (helside) {
    const h = await js("document.documentElement.scrollHeight");
    valg.captureBeyondViewport = true;
    valg.clip = { x: 0, y: 0, width: await js("window.innerWidth"), height: h, scale: 1 };
  }
  const { data } = await send("Page.captureScreenshot", valg);
  const fil = join(BILDER, `${String(++bildeNr).padStart(2, "0")}-${navn}.png`);
  writeFileSync(fil, Buffer.from(data, "base64"));
  return fil;
}

// A real key press (down, held for ms, up), to whatever has focus.
async function tast(key, vk, ms = 30) {
  const felles = { key, code: key === " " ? "Space" : key, windowsVirtualKeyCode: vk };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...felles, ...(key === "Enter" ? { text: "\r" } : key === " " ? { text: " " } : {}) });
  await sov(ms);
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...felles });
  await sov(120);
}

const tilstand = () => js(`JSON.parse(localStorage.getItem("luringen.v1"))`);
const tekst = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`);

async function lastSide(url) {
  await send("Page.navigate", { url });
  await vent(`document.readyState === "complete" && document.querySelector("#s-hjem, #s-bli-med")`);
  await sov(300);
}

try {
  // Connect
  let liste;
  for (let i = 0; i < 100; i++) {
    try {
      liste = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (liste.some((t) => t.type === "page")) break;
    } catch (e) {
      /* Chrome is starting */
    }
    await sov(100);
  }
  ws = new WebSocket(liste.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && ventende.has(d.id)) {
      ventende.get(d.id)(d);
      ventende.delete(d.id);
    } else if (d.method === "Runtime.exceptionThrown") {
      feil.push(`Unntak: ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
    } else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") {
      feil.push(`console.error: ${d.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setFocusEmulationEnabled", { enabled: true }); // a headless page has no focus: keys and focus events need it

  // ---------- One phone, 4 players, level Lett ----------
  await lastSide(SIDE);
  await js(`localStorage.clear()`);
  await lastSide(SIDE);
  await bilde("hjem");

  await klikk('[data-h="nytt"]');
  await klikk('[data-h="spillere"][data-d="-1"]');
  await js(`(() => { const f = document.querySelector("#navn-0"); f.value = "Testspiller A"; f.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await klikk('[data-h="niva"][data-v="0"]');
  await bilde("oppsett", true);
  const potten = await tekst(".seksjon-hode .tall");
  if (!/ord i potten/.test(potten)) feil.push(`Mangler ordtelling: ${potten}`);

  await klikk('[data-h="start"]');
  await vent(`!document.querySelector("#s-del").hidden`);
  await bilde("del-spiller-1");
  const st = await tilstand();
  const runde1 = st.spill.r;
  if (st.spill.oppsett.spillere !== 4) feil.push("Feil antall spillere");
  if (runde1.vanske !== 1) feil.push(`Lett skal gi vanskelighet 1, fikk ${runde1.vanske}`);

  // The card without a finger (keyboard, screen reader, switch): one press shows it and reads it
  // out to the player's own screen reader, the next hides it — no holding, no timing. The secret
  // is never in the button's name, and is gone from the announcement when the card is hidden.
  {
    const KORT = ".skjerm:not([hidden]) .mappe";
    const hemmelig = (runde1.luringer.includes(0) ? "luringen" : runde1.ord).toLowerCase();
    const kort = () =>
      js(`(() => { const m = document.querySelector(${JSON.stringify(KORT)}); return { apen: m.classList.contains("apen"), utvidet: m.getAttribute("aria-expanded"), navn: (m.getAttribute("aria-label") || "").toLowerCase(), si: document.querySelector("#si").textContent.toLowerCase(), bak: m.querySelector(".mappe-bakside").getAttribute("aria-hidden"), neste: !document.querySelector("#neste-spiller").disabled, fokus: document.activeElement === m }; })()`);
    let k = await kort();
    sjekk(!k.apen && k.utvidet === "false", "Kortet sier ikke at det er lukket (aria-expanded) før det er vist");
    await klikk(KORT); // what a screen reader's double tap sends
    k = await kort();
    sjekk(k.apen && k.utvidet === "true", "Et vanlig klikk (skjermleser, bryter) viser ikke kortet");
    sjekk(k.si.includes(hemmelig), `Kortet leses ikke opp mens det vises (#si: «${k.si}»)`);
    // (The label's own words — «Sak 1234, hemmelig. Hold inne for å se kortet ditt» — prove nothing.)
    const egneOrd = ["sak", "hemmelig", "hold", "inne", "for", "å", "se", "kortet", "ditt"];
    sjekk(k.bak === "true" && (egneOrd.includes(hemmelig) || !k.navn.split(/[^a-zæøå0-9]+/).includes(hemmelig)), "Det hemmelige er en del av knappen for en skjermleser");
    sjekk(k.fokus, "Kortet har ikke fokus mens det vises etter et klikk");
    await klikk(KORT);
    k = await kort();
    sjekk(!k.apen && k.utvidet === "false", "Et klikk til skjuler ikke kortet");
    sjekk(!k.si.includes(hemmelig), "Det hemmelige ble liggende i skjermleser-meldingen etter at kortet ble skjult");
    sjekk(k.neste, "Kortet teller ikke som sett når det er vist og skjult uten å holde");
    // Keys: a short press of Enter shows it, Escape hides it; Space shows it, and leaving it hides it.
    await js(`document.querySelector(${JSON.stringify(KORT)}).focus()`);
    await tast("Enter", 13);
    sjekk((await kort()).apen, "Et kort trykk på Enter viser ikke kortet (uten å holde)");
    await tast("Escape", 27);
    sjekk(!(await kort()).apen, "Escape skjuler ikke kortet");
    await tast(" ", 32, 500);
    k = await kort();
    sjekk(k.apen, "Mellomrom viser ikke kortet (eller kortet lukket seg da tasten ble sluppet)");
    await tast("Tab", 9);
    await sov(100);
    k = await kort();
    sjekk(!k.apen && !k.si.includes(hemmelig), "Kortet skjules ikke når fokus forlater det");
  }

  for (let i = 0; i < 4; i++) {
    const slipp = await hold(".skjerm:not([hidden]) .mappe");
    const kort = await tekst(".skjerm:not([hidden]) .mappe-bakside");
    const erLuring = runde1.luringer.includes(i);
    if (erLuring && !/Luringen/i.test(kort)) feil.push(`Spiller ${i + 1} skulle sett luring-kortet: ${kort}`);
    if (erLuring && !kort.includes(runde1.hint)) feil.push(`Luringen skulle fått hintet «${runde1.hint}» på Lett`);
    if (!erLuring && !kort.includes(runde1.ord)) feil.push(`Spiller ${i + 1} skulle sett ordet «${runde1.ord}»: ${kort}`);
    if (i === 0 || erLuring) await bilde(erLuring ? "kort-luringen" : "kort-vanlig");
    await slipp();
    const igjen = await tekst(".skjerm:not([hidden]) .mappe-bakside");
    if (igjen.trim()) feil.push("Kortet skjules ikke når man slipper");
    await klikk('[data-h="neste-spiller"]');
  }

  await vent(`!document.querySelector("#s-diskusjon").hidden`);
  await sov(1200);
  await bilde("diskusjon");
  const timerTekst = await tekst("#timer-tid");
  if (!/^[0-3]:\d\d$/.test(timerTekst)) feil.push(`Timer viser «${timerTekst}»`);

  await klikk('[data-h="til-pek"]');
  await klikk(`[data-h="velg-mistenkt"][data-v="${runde1.luringer[0]}"]`);
  await bilde("pek");
  await klikk('[data-h="avslor"]');
  await vent(`document.querySelector("#stempel-sted .stempel")`, 6000);
  await sov(600);
  await bilde("avslor-tatt");
  await klikk('[data-h="vis-ordet"]');
  await bilde("avslor-gjett");
  await klikk('[data-h="ferdig"][data-v="gruppa"]');
  await vent(`!document.querySelector("#s-resultat").hidden`);
  await sov(900);
  await bilde("resultat");
  const etter = await tilstand();
  const forventet = K.poengForRunde(4, runde1.luringer, false);
  if (JSON.stringify(etter.spill.poeng) !== JSON.stringify(forventet)) feil.push(`Feil poeng: ${etter.spill.poeng} (ventet ${forventet})`);

  await klikk('[data-h="ny-runde"]');
  await vent(`!document.querySelector("#s-del").hidden`);
  const runde2 = (await tilstand()).spill.r;
  if (runde2.nokkel === runde1.nokkel) feil.push("Runde 2 fikk samme ord som runde 1");
  if (runde2.runde !== 2) feil.push("Rundenummeret økte ikke");

  // "Forgot the word": the sheet shows a card that can be held
  await js(`(() => { const s = JSON.parse(localStorage.getItem("luringen.v1")); return s; })()`);
  for (let i = 0; i < 4; i++) {
    const slipp = await hold(".skjerm:not([hidden]) .mappe", 400);
    await slipp();
    await klikk('[data-h="neste-spiller"]');
  }
  // The sheet is a modal dialog: focus goes into it and stays there, the page behind is out of
  // reach, and focus comes back to the button that opened it.
  const iArket = () => js(`document.querySelector("#ark-innhold").contains(document.activeElement)`);
  await js(`document.querySelector('[data-h="se-igjen"]').focus()`);
  await klikk('[data-h="se-igjen"]');
  sjekk(await iArket(), "Fokus ble ikke flyttet inn i arket da det åpnet");
  sjekk(await js(`document.querySelector("#app").inert === true`), "Siden bak arket kan fortsatt nås (ikke inert)");
  for (let i = 0; i < 7; i++) await tast("Tab", 9, 10);
  sjekk(await iArket(), "Tab førte fokus ut av arket");
  await klikk('[data-h="se-igjen-velg"][data-v="1"]');
  sjekk(await iArket(), "Fokus forsvant da arket byttet innhold");
  const slippArk = await hold("#ark .mappe", 600);
  const arkKort = await tekst("#ark .mappe-bakside");
  if (!arkKort.trim()) feil.push("«Se igjen» viste ikke noe kort");
  await bilde("se-igjen");
  await slippArk();
  await klikk('[data-h="lukk-ark"]');
  sjekk(await js(`document.activeElement === document.querySelector('[data-h="se-igjen"]') && !document.querySelector("#app").inert`), "Fokus kom ikke tilbake til «Se kortet igjen» da arket ble lukket");

  // ---------- Each on their own phone: host ----------
  await klikk('[data-h="tilbake"]');
  // A game is in progress: «Fortsett» is the main button, and «Nytt spill» asks before the points go.
  sjekk(await js(`!!document.querySelector('.hjem-knapper .knapp[data-h="fortsett"]') && !!document.querySelector('.hjem-knapper .knapp-2[data-h="nytt"]')`), "Hjem viser ikke «Fortsett» først og «Nytt spill» som nummer to mens et spill pågår");
  await klikk('[data-h="nytt"]');
  sjekk(/Starte nytt spill/.test(await js(`document.querySelector("#ark-tittel")?.textContent || ""`)), "«Nytt spill» spør ikke før poengene slettes");
  await klikk('[data-h="ark-svar"][data-v="ja"]');
  await klikk('[data-h="modus"][data-v="hver"]');
  // Every change on the set-up screen draws it again: focus must stay on the control that was pressed.
  const fokusPa = (h, attr, v) => js(`!!document.activeElement && document.activeElement.dataset.h === ${JSON.stringify(h)} && document.activeElement.dataset.${attr} === ${JSON.stringify(v)}`);
  await js(`document.querySelector('[data-h="spillere"][data-d="1"]').focus()`);
  for (let i = 0; i < 2; i++) await klikk('[data-h="spillere"][data-d="1"]');
  sjekk(await fokusPa("spillere", "d", "1"), "Fokus forsvant fra «Flere spillere» da oppsettet ble tegnet på nytt");
  await js(`document.querySelector('[data-h="niva"][data-v="3"]').focus()`);
  await klikk('[data-h="niva"][data-v="3"]');
  sjekk(await fokusPa("niva", "v", "3"), "Fokus forsvant fra nivået som ble valgt");
  // The dock floats over the page: a control that takes focus is scrolled clear of it.
  sjekk(
    await js(`(() => { const el = Array.from(document.querySelectorAll('[data-h="tid"]')).pop(); el.focus(); const a = el.getBoundingClientRect(); const d = document.querySelector(".skjerm:not([hidden]) .dokk").getBoundingClientRect(); return a.bottom <= d.top + 1 && a.top >= 0; })()`),
    "En kontroll som får fokus, blir liggende bak knappen nederst",
  );
  await klikk('[data-h="luringer"][data-v="2"]');
  // Pick two categories: the pot shrinks and the code becomes the long version
  const fullPott = await tekst(".seksjon-hode .tall");
  await klikk('[data-h="kat-velg"]');
  await klikk('[data-h="kat"][data-id="dyr"]');
  await klikk('[data-h="kat"][data-id="mat"]');
  const litenPott = await tekst(".seksjon-hode .tall");
  if (fullPott === litenPott) feil.push(`Ordtellingen endret seg ikke med kategorier (${fullPott})`);
  await bilde("oppsett-kategorier");
  await klikk('[data-h="start"]');
  await vent(`!document.querySelector("#s-kode").hidden`);
  if (!(await js(`document.querySelector("#vert-start").disabled`))) feil.push("Verten kan starte uten å ha valgt plass");
  await klikk('[data-h="vert-plass"][data-v="0"]');
  if (!(await js(`document.querySelector("#vert-start").disabled`))) feil.push("Verten kan starte uten å ha sett ordet");
  const slippVert = await hold(".skjerm:not([hidden]) .mappe");
  const vertKort = await tekst(".skjerm:not([hidden]) .mappe-bakside");
  if (!vertKort.trim()) feil.push("Verten fikk ikke se kortet sitt");
  await slippVert();
  if (await js(`document.querySelector("#vert-start").disabled`)) feil.push("Startknappen åpnet seg ikke etter at verten så ordet");
  await bilde("kode-vert", true);
  const vert = (await tilstand()).spill;
  const kode = vert.kode;
  if (kode.length !== 15) feil.push(`Koden med valgte kategorier skal ha 15 tegn, har ${kode.length}`);
  if (vert.r.luringer.length !== 2) feil.push("Skulle hatt 2 luringer");
  if (!["dyr", "mat"].includes(vert.r.kategori.id)) feil.push(`Ordet kom fra feil kategori: ${vert.r.kategori.id}`);

  // The QR code on the page must scan to the share link
  if (!(await js(`!!document.querySelector(".qr svg")`))) feil.push("QR-koden vises ikke på nettsiden");
  else if (existsSync("/usr/bin/swift")) {
    await js(`document.querySelector(".qr").scrollIntoView({ block: "center" })`);
    const qrBilde = await bilde("kode-qr");
    const ut = execFileSync("swift", [join(ROT, "test/qr-les.swift"), qrBilde], { encoding: "utf8" });
    const lestQr = ut.trim().split("\t")[1];
    if (lestQr !== SIDE + "#" + kode) feil.push(`QR-koden leses som «${lestQr}», ventet «${SIDE}#${kode}»`);
  }

  // The code must reproduce exactly the host's round on a "new device"
  const lest = K.lesKode(kode, DATA);
  if (!lest.ok) feil.push(`Koden kunne ikke leses: ${lest.feil}`);
  const iNode = K.lagRunde(DATA, lest.oppsett, 1);
  if (iNode.ord !== vert.r.ord || JSON.stringify(iNode.luringer) !== JSON.stringify(vert.r.luringer)) feil.push("Koden gir ikke samme runde som hos verten");

  // ---------- Each on their own phone: guest (fresh storage = new device) ----------
  await js(`localStorage.clear()`);
  await lastSide(SIDE + "?enhet=2#" + kode);
  await vent(`!document.querySelector("#s-bli-med").hidden`);
  await bilde("bli-med");
  const forhand = await js(`document.querySelector("#kodefelt").value`);
  if (forhand !== K.formaterKode(kode)) feil.push(`Koden fra lenken ble ikke fylt inn: «${forhand}»`);

  // Typo first
  await js(`(() => { const f = document.querySelector("#kodefelt"); f.value = ${JSON.stringify(K.formaterKode(kode).slice(0, -1) + (kode.endsWith("A") ? "B" : "A"))}; f.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await js(`document.querySelector("#kodeskjema").requestSubmit()`);
  await sov(200);
  const feilmelding = await tekst("#kodefeil");
  if (!feilmelding) feil.push("Skrivefeil i koden ga ingen feilmelding");
  await bilde("bli-med-feil");

  await js(`(() => { const f = document.querySelector("#kodefelt"); f.value = ${JSON.stringify(kode.toLowerCase())}; f.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await js(`document.querySelector("#kodeskjema").requestSubmit()`);
  await vent(`!document.querySelector("#s-plass").hidden`);
  await bilde("velg-plass");
  const luringPlass = vert.r.luringer[0];
  await klikk(`[data-h="gjest-plass"][data-v="${luringPlass}"]`);
  await vent(`!document.querySelector("#s-gjest").hidden`);
  const slippGjest = await hold(".skjerm:not([hidden]) .mappe");
  const gjesteKort = await tekst(".skjerm:not([hidden]) .mappe-bakside");
  if (!gjesteKort.includes(vert.r.lignende)) feil.push(`Kaos: luringen skulle fått «${vert.r.lignende}», fikk: ${gjesteKort}`);
  await bilde("gjest-kort-kaos");
  await slippGjest();

  // ---------- Narrow phone (320 px) on the busiest screens ----------
  await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  await klikk('[data-h="gjest-runde"][data-d="1"]');
  await bilde("smal-gjest");
  await lastSide(SIDE);
  await klikk('[data-h="nytt"]');
  await bilde("smal-oppsett", true);
  await klikk('[data-h="regler"]').catch(() => {});
} catch (e) {
  feil.push(e.stack || String(e));
} finally {
  try {
    ws?.close();
  } catch (e) {
    /* closing */
  }
  chrome.kill();
  tjener.close();
  await sov(300);
  rmSync(profil, { recursive: true, force: true });
}

console.log(`Skjermbilder: ${BILDER}`);
if (feil.length) {
  console.log(`✗ ${feil.length} feil:`);
  for (const f of feil) console.log("  - " + f);
  process.exit(1);
}
console.log("✓ Ende-til-ende: alle sjekker bestått");
