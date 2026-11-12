// Tankeleseren, in parts (each starts from an empty phone):
//   sammen      co-op game of 8 rounds: two cards to choose from, hold / click / keys to peek, the
//               first-time example, the hint field, drag + keys + ◀ ▶, lock, reveal, streak toast,
//               reload, «Avslutt» → «Spill videre», «Kåringen» with the hints, record, share text;
//               then a game ended with «Avslutt» (goes to «Kåringen», no record, not in progress)
//   lag         team game to 10 with the left/right bet, the evening scoreboard, and the catch-up
//               rule from a prepared save of the old shape
//   skadet      damaged saves must give the home screen, never a blank page or an exception
//   jul         the season rule for the «Jul» pack with a faked date
//   utfordring  make a challenge link, open it as a receiver (cold and on the open page), markup
//               in the hint, a damaged link, and a party game in progress that survives it all
//   ti          «Sammen» with 10 players: one round per player
// Run only some of them while developing: TL_DEL=lag,jul node …/e2e-ko.mjs … tankeleseren
// Runs in every edition (node test/rusj-e2e.mjs --sprak en tankeleseren): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the numbers, the links (t.forside) and the
// edition's storage keys (t.nokkel).
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

const DELER = (process.env.TL_DEL || "").split(",").filter(Boolean);
const med = (navn) => !DELER.length || DELER.includes(navn);

function bildemappe(id) {
  const i = process.argv.indexOf("--bilder");
  const rot = i > 0 ? resolve(process.argv[i + 1]) : join(tmpdir(), "rusj-e2e");
  const mappe = join(rot, id);
  mkdirSync(mappe, { recursive: true });
  return mappe;
}

// The phone size the runner uses (--bredde / --hoyde), to return to after other screen sizes.
const flaggTall = (navn, standard) => {
  const i = process.argv.indexOf(navn);
  return (i > 0 && Number(process.argv[i + 1])) || standard;
};
const MOBIL = { width: flaggTall("--bredde", 390), height: flaggTall("--hoyde", 844), deviceScaleFactor: 2, mobile: true };
const LIGGENDE = MOBIL.width > MOBIL.height;
// A hint that can no longer be typed is shown over the dial where there is room for it: on tall
// phones, and beside the card on wide screens (spill.css).
const HINT_VISES = LIGGENDE || MOBIL.width >= 768 || MOBIL.height > 700;

// Another phone size for a moment: no sideways scrolling, and the named things end above the main
// button of the dock. Then back to the runner's size.
async function iStorrelse(t, navn, bredde, hoyde, over = [".tl-fin", ".tl-holdknapp"]) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });
  await t.sov(400);
  const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(bred <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${bred}px`);
  await t.js("window.scrollTo(0, 0)");
  const bak = await t.js(`(() => { const k = document.querySelector('#skjerm .dokk .knapprad, #skjerm .dokk .knapp'); if (!k) return [];
    const topp = k.getBoundingClientRect().top;
    return ${JSON.stringify(over)}.filter((s) => { const e = document.querySelector('#skjerm ' + s); return e && e.getClientRects().length && e.getBoundingClientRect().bottom > topp + 2; }); })()`);
  t.sjekk(bak.length === 0, `Gjemmer seg bak dokken på ${bredde}×${hoyde} («${navn}»): ${bak.join(", ")}`);
  await t.skjermbilde(join(bildemappe(t.id), `${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(300);
}

// Player names as stored (the runner may replace them, e.g. with --probe).
const navnet = (t, i) => t.js(`JSON.parse(localStorage.getItem("rusj.felles")).navn[${i}]`);

// Tablet / computer: the dial and the main button must fit without scrolling.
async function bredBilde(t, navn, bredde, hoyde) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 1, mobile: false });
  await t.sov(450);
  await t.js("window.scrollTo(0, 0)");
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const m = await t.js(`(() => { const s = document.querySelector('.tl-skive').getBoundingClientRect(); const k = document.querySelector('.dokk .knapp').getBoundingClientRect();
    const f = document.querySelector('.tl-fin, .tl-holdknapp'); const d = document.querySelector('#skjerm .dokk').getBoundingClientRect();
    return { skive: s.bottom, fin: f ? f.getBoundingClientRect().bottom : s.bottom, knapp: k.top, bunn: d.bottom }; })()`);
  t.sjekk(m.fin <= m.knapp + 2 && m.bunn <= hoyde + 1, `Skiva og knappene får ikke plass på ${bredde}×${hoyde} («${navn}»)`);
  await t.skjermbilde(join(bildemappe(t.id), `bred-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(300);
}

const spill = async (t) => (await t.tilstand()).spill;
// Card number n in the data, as [left, right] (the same order as the game's own list).
const kortet = (t, n) => t.js(`window.RUSJ_DATA.spektrum.pakker.flatMap((p) => p.par)[${n}] || null`);
const toast = (t) => t.js(`document.querySelector("#toast.vis") ? document.querySelector("#toast").textContent : ""`);

// What is shared (R.del) is caught here: a headless browser has no share sheet and no clipboard.
const fangDeling = (t) =>
  t.js(`(() => {
    window.__delt = [];
    const fang = (x) => { window.__delt.push(typeof x === "string" ? { text: x, url: "" } : { title: x.title, text: x.text, url: x.url }); return Promise.resolve(); };
    Object.defineProperty(navigator, "share", { value: fang, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: fang }, configurable: true });
  })()`);
const sistDelt = (t) => t.js("window.__delt[window.__delt.length - 1] || null");

// Client coordinates of value v (0–100) on the dial, r = distance from the centre in SVG units.
const punkt = (t, v, r = 80) =>
  t.js(`(() => { const s = document.querySelector('.tl-skive svg').getBoundingClientRect(); const a = Math.PI * ${v} / 100;
    const x = 120 - ${r} * Math.cos(a), y = 122 - ${r} * Math.sin(a);
    return { x: s.left + x / 240 * s.width, y: s.top + y / 136 * s.height }; })()`);

// A real finger drag from one value to another.
async function dra(t, fra, til) {
  await t.js("document.querySelector('.tl-skive').scrollIntoView({ block: 'center' })");
  await t.sov(150);
  const a = await punkt(t, fra);
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 12; i++) {
    const p = await punkt(t, fra + ((til - fra) * i) / 12);
    await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y }] });
    await t.sov(16);
  }
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sov(200);
}

async function tast(t, key, tallkode, n = 1) {
  for (let i = 0; i < n; i++) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: tallkode });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: tallkode });
  }
  await t.sov(80);
}

// Put the needle on a value with the keyboard (Home, then → steps), as a keyboard user would.
async function settMedTaster(t, verdi) {
  await t.js(`(() => { const s = document.querySelector('.tl-skive[role="slider"]'); s.focus();
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    for (let i = 0; i < ${Math.round(verdi)}; i++) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); })()`);
  await t.sov(60);
}

async function holdOgSe(t) {
  const slipp = await t.hold(".tl-holdknapp", 700);
  t.sjekk(await t.finnes(".tl-skive.apen"), "Skiva åpnet seg ikke når hintgiveren holdt knappen");
  await slipp();
  await t.vent("!document.querySelector('#tl-klar').disabled || document.querySelector('#tl-klar').textContent !== 'Se målet først'", 3000);
  // The target must not stay in the hidden screen-reader message when the phone is passed on
  t.sjekk(!/\d+ (?:av|of|af) 100/.test(await t.tekst("#si")), "Hvor målet ligger, ble liggende i skjermleser-meldingen");
}

// The peek control as the page says it is: open or closed, and what the screen reader was told.
const kikken = (t) =>
  t.js(`({ apen: document.querySelector('.tl-skive').classList.contains('apen'), skive: document.querySelector('.tl-kikk').getAttribute('aria-expanded'),
    knapp: document.querySelector('.tl-holdknapp').getAttribute('aria-expanded'), si: document.querySelector('#si').textContent })`);

// A double tap: a real tap on `sel`, then 110 ms later a second real tap on `nesteSel` (the button
// that appears under the finger on the next screen). Aiming at it covers every layout, worst case.
async function dobbeltTrykk(t, sel, nesteSel) {
  await t.js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center" })`);
  await t.sov(150);
  const midt = (s) => t.js(`(() => { const e = document.querySelector(${JSON.stringify(s)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const trykk = async (p) => {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const forste = await midt(sel);
  await trykk(forste);
  await t.sov(110);
  await trykk((nesteSel && (await midt(nesteSel))) || forste);
  await t.sov(500);
}

// Every card at this screen width: labels may only break between words (no «sam-le»).
async function sjekkEtiketter(t, bredde) {
  const ord = await t.js(`(() => {
    const D = window.RUSJ_DATA.spektrum;
    const kort = document.querySelector('.tl-kort');
    const tegn = kort.cloneNode(true);
    tegn.style.cssText = "position: fixed; left: -9999px; top: 0; width: " + kort.getBoundingClientRect().width + "px";
    document.body.appendChild(tegn);
    const ut = [];
    const sjekk = (el, tekst) => {
      const s = el.querySelector('span');
      s.textContent = tekst;
      // Measure each word on its own: no word may be wider than the line it sits on.
      const linje = s.getBoundingClientRect().width;
      for (const w of tekst.split(/\\s+/)) {
        const m = document.createElement('span');
        m.style.whiteSpace = 'nowrap';
        m.textContent = w;
        s.appendChild(m);
        const b = m.getBoundingClientRect().width;
        m.remove();
        if (b > linje + 1) ut.push(w);
      }
      s.textContent = tekst;
    };
    for (const p of D.pakker) for (const [v, h] of p.par) {
      const [a, b] = tegn.querySelectorAll('.tl-ende');
      a.className = 'tl-ende v' + (Math.max(...v.split(/\\s+/).map(o => o.length)) >= 15 || v.length > 30 ? ' ekstra-lang' : Math.max(...v.split(/\\s+/).map(o => o.length)) >= 12 || v.length > 22 ? ' lang' : '');
      b.className = 'tl-ende h' + (Math.max(...h.split(/\\s+/).map(o => o.length)) >= 15 || h.length > 30 ? ' ekstra-lang' : Math.max(...h.split(/\\s+/).map(o => o.length)) >= 12 || h.length > 22 ? ' lang' : '');
      sjekk(a, v);
      sjekk(b, h);
    }
    tegn.remove();
    return ut;
  })()`);
  t.sjekk(ord.length === 0, `${ord.length} ord må deles midt i ordet på ${bredde} px: ${ord.slice(0, 6).join(", ")}`);
}

const poengFor = (d) => (d <= 2.5 + 1e-9 ? 4 : d <= 7.5 + 1e-9 ? 3 : d <= 12.5 + 1e-9 ? 2 : 0);

async function ventResultat(t) {
  await t.vent("document.querySelector('.tl-resultat .stempel')", 9000);
  await t.vent("!document.querySelector('#skjerm .dokk .knapp').disabled", 3000);
}

// Text a player typed must show as text. (The name of the check matters: with --probe the runner
// keeps only errors that start like this.)
async function ingenInjeksjon(t, hvor) {
  const n = await t.js(`document.querySelectorAll("x-q, .tl-hint b, .tl-logg b b").length`);
  t.sjekk(n === 0, `HTML-INJEKSJON på «${hvor}»: tekst en spiller har skrevet, ble tolket som HTML (${n} element)`);
}

// Answer the confirm sheet that is open.
async function svarArk(t, svar) {
  await t.vent(`document.querySelector('#ark:not([hidden]) [data-v="${svar}"]')`);
  await t.klikk(`#ark [data-v="${svar}"]`);
}

// One round of a game in progress: hand over, peek, lock where `sikte(mal)` says.
async function spillRunde(t, sikte, hint) {
  if (!(await t.finnes('[data-h="jeg-er"]'))) await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  await t.klikk('[data-h="jeg-er"]');
  await holdOgSe(t);
  await t.klikk('[data-h="hint-klar"]');
  await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
  if (hint != null) await t.skrivInn("#tl-hint", hint);
  await settMedTaster(t, sikte((await spill(t)).mal));
  await t.klikk('[data-h="las"]', 100);
  if (await t.finnes('[data-h="tipp"]')) await t.klikk('[data-h="tipp"][data-v="-"]');
  await ventResultat(t);
}
const blink = (mal) => mal;
const bom = (mal) => (mal > 50 ? mal - 40 : mal + 40);
const naer = (mal) => mal + (mal > 50 ? -6 : 6);

// ---------- Sammen ----------

async function sammen(t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  t.sjekk(await t.finnes('.hjem-knapper .knapp-2[data-h="utfordre"]'), "Hjem mangler «Send en utfordring» som sekundærknapp");
  t.sjekk(!/REKORD|RECORD/.test(await t.tekst(".merker")), "Rekordmerket vises før noen har spilt");
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke tre spillere (én rad per lagrede navn)");
  t.sjekk((!t.norsk || (await t.tekst("#skjerm h1")).trim() === "Gjør klart") && (await t.js(`document.querySelector("#skjerm h1 + *").classList.contains("fliser")`)), "Oppsettet heter ikke «Gjør klart» med modusvalget først");
  // The packs are chosen by hand, so this run is the same on every date (the season: see jul()).
  if (!(await t.js(`document.querySelector('[data-h="pakke"][data-v="*"]').getAttribute("aria-pressed") === "true"`))) await t.klikk('[data-h="pakke"][data-v="*"]');
  const antallPakker = await t.js("window.RUSJ_DATA.spektrum.pakker.length");
  let S = await t.tilstand();
  t.sjekk(S.oppsett.pakker.includes("barn") && S.oppsett.pakker.includes("jul") && S.oppsett.pakker.length === antallPakker, "«Alle» valgte ikke alle kortstokkene");
  await t.klikk('[data-h="start"]');
  t.sjekk(await t.js(`Rusj._statKo.some((x) => x.h === "start" && x.d.modus === "sammen" && x.d.spillere === 3)`), "Mangler statistikk for start (modus, spillere)");

  // ---------- Round 1: hand over, two cards, peek ----------
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  t.sjekk((await t.tekst("#skjerm h1")).includes(await navnet(t, 0)), "Første hintgiver er ikke spiller 1");
  await t.bilde("gi");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.tl-kikk')");
  t.sjekk(await t.js("document.querySelector('#tl-klar').disabled"), "«Jeg har et hint» skulle være låst før målet er sett");
  t.sjekk((await t.antall(".tl-skive .tl-sone")) >= 3, "Målet er ikke tegnet under dekselet");
  // Two cards to choose from: the other one is named on its button in the dock
  let sp = await spill(t);
  const annet = await kortet(t, sp.alt);
  t.sjekk(annet && sp.alt !== sp.kort, "Runden har ikke to kort å velge mellom");
  const bytt = await t.js(`(() => { const b = document.querySelector('.dokk [data-h="bytt-kort"]'); return b ? { tekst: b.innerText, navn: b.getAttribute("aria-label") || "" } : null; })()`);
  t.sjekk(bytt && annet && bytt.tekst.includes(annet[0]) && bytt.tekst.includes(annet[1]) && (!t.norsk || /^Bytt skala til/.test(bytt.navn)), `«Bytt til» viser ikke det andre kortet (${JSON.stringify(bytt)})`);
  t.sjekk(!(await t.finnes('.dokk .lenke[data-h="bytt-kort"]')), "Den blinde «Bytt kort»-lenken finnes fortsatt");
  t.sjekk(await t.friForDokk(".tl-holdknapp"), "Hold-knappen ligger bak dokken");
  await t.bilde("hint");
  await iStorrelse(t, "hint", 320, 568);
  await bredBilde(t, "hint", 1024, 768);
  // A reload on the secret screen goes back to "give the phone to …"
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="jeg-er"]'), "Omlasting på hint-skjermen skulle gå tilbake til «Gi mobilen til»");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.tl-kikk')");
  // A finger on the dial itself: open while it is held (a tap is too short and says so)
  const slipp = await t.hold(".tl-skive", 900);
  t.sjekk(await t.finnes(".tl-skive.apen"), "Skiva åpnet seg ikke når hintgiveren holdt inne");
  await t.bilde("hint-holdt");
  await slipp();
  t.sjekk(!(await t.finnes(".tl-skive.apen")), "Skiva lukket seg ikke igjen");
  t.sjekk(!(await t.js("document.querySelector('#tl-klar').disabled")), "Knappen ble ikke åpnet etter at målet var sett");
  // A phone that has never finished a game: an example for the first hint, after the first peek
  t.sjekk(t.norsk ? /Eksempel: Kaldt ↔ Varmt, målet litt mot varmt → «badevann»\./.test(await t.tekst("#tl-kikk-hjelp")) : await t.finnes("#tl-kikk-hjelp .tl-eksempel"), `Eksempelet til det første hintet mangler («${await t.tekst("#tl-kikk-hjelp")}»)`);
  await iStorrelse(t, "hint-sett", 375, 560, [".tl-holdknapp"]);
  await iStorrelse(t, "hint-sett", 390, 664, [".tl-holdknapp", "#tl-kikk-hjelp"]);
  // A plain click (a screen reader's double tap, a switch): opens, tells where the target is, and
  // the next click closes it again. The same with Enter and Space on the hold button.
  await t.sov(300); // (the click that follows a finger is not a command for half a second)
  await t.js("document.querySelector('.tl-kikk').click()");
  await t.sov(150);
  let k = await kikken(t);
  t.sjekk(k.apen && k.skive === "true" && k.knapp === "true" && /\d+ (?:av|of|af) 100/.test(k.si), `Et vanlig klikk åpner ikke skiva (${JSON.stringify(k)})`);
  await t.js("document.querySelector('.tl-kikk').click()");
  await t.sov(150);
  k = await kikken(t);
  t.sjekk(!k.apen && k.skive === "false" && k.si === "", `Neste klikk lukker ikke skiva, eller målet ble stående i skjermleser-meldingen (${JSON.stringify(k)})`);
  await t.js("document.querySelector('.tl-holdknapp').focus()");
  await tast(t, "Enter", 13);
  await t.sov(100);
  k = await kikken(t);
  t.sjekk(k.apen && /\d+ (?:av|of|af) 100/.test(k.si), `Enter på hold-knappen åpner ikke skiva (${JSON.stringify(k)})`);
  await tast(t, " ", 32);
  await t.sov(100);
  k = await kikken(t);
  t.sjekk(!k.apen && k.si === "", `Mellomrom lukker ikke skiva igjen (${JSON.stringify(k)})`);
  const navnPaKnapp = await t.js(`(() => { const b = document.querySelector('.tl-holdknapp'); return { tekst: b.innerText.trim(), beskrevet: !!document.getElementById(b.getAttribute("aria-describedby") || "-") }; })()`);
  t.sjekk((t.norsk ? /Hold fingeren her for å se/.test(navnPaKnapp.tekst) : navnPaKnapp.tekst.trim().length > 3) && navnPaKnapp.beskrevet, "Hold-knappen mangler tekst eller beskrivelse");

  // One tap swaps the two cards; the target stays where it is and need not be seen again
  const forBytte = await spill(t);
  await t.js(`(() => { const b = document.querySelector('[data-h="bytt-kort"]'); b.focus(); b.click(); })()`);
  await t.sov(200);
  sp = await spill(t);
  t.sjekk(sp.kort === forBytte.alt && sp.alt === forBytte.kort && sp.mal === forBytte.mal && sp.sett === true && sp.par.join("|") === annet.join("|"), "«Bytt til» byttet ikke til det andre kortet (eller flyttet målet)");
  t.sjekk((await t.tekst(".tl-kort")).includes(annet[0]) && (await t.tekst('[data-h="bytt-kort"]')).includes(forBytte.par[0]), "Kortet på skjermen og «Bytt til» byttet ikke plass");
  t.sjekk((await t.js("document.activeElement && document.activeElement.dataset.h")) === "bytt-kort", "Fokus ble ikke stående på «Bytt til» etter byttet");
  await t.klikk('[data-h="hint-klar"]');

  // ---------- Guessing: the hint field, drag, keys, buttons ----------
  await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
  t.sjekk(
    await t.js(`(() => { const f = document.querySelector('#tl-hint'); const l = document.querySelector('label[for="tl-hint"]'); return !!f && !!l && l.innerText.trim().length > 0 && f.maxLength === 40 && /valgfritt|optional|valgfrit/.test(f.placeholder); })()`),
    "Hintfeltet mangler etikett, grense på 40 tegn eller «valgfritt»",
  );
  await t.skrivInn("#tl-hint", "matpakke");
  t.sjekk((await spill(t)).hint === "matpakke" && (await t.js("document.activeElement.id")) === "tl-hint", "Hintet ble ikke lagret mens det ble skrevet (eller feltet mistet fokus)");
  await t.js("document.activeElement.blur()");
  await dra(t, 50, 22);
  sp = await spill(t);
  t.sjekk(Math.abs(sp.viser - 22) <= 1.5, `Viseren fulgte ikke fingeren (står på ${sp.viser}, ventet 22)`);
  await dra(t, 22, 81);
  sp = await spill(t);
  t.sjekk(Math.abs(sp.viser - 81) <= 1.5, `Viseren fulgte ikke fingeren andre gang (står på ${sp.viser}, ventet 81)`);
  const vinkel = await t.js("document.querySelector('.tl-viser').style.transform");
  t.sjekk(/rotate\(14[0-9]/.test(vinkel), `Viseren er ikke tegnet der den skal (${vinkel})`);
  await t.js("document.querySelector('.tl-skive').focus()");
  await tast(t, "ArrowLeft", 37, 3);
  const etterTaster = (await spill(t)).viser;
  t.sjekk(Math.abs(etterTaster - (Math.ceil(sp.viser) - 3)) < 0.01, `Piltastene flyttet ikke viseren riktig (${sp.viser} → ${etterTaster})`);
  await t.klikk('[data-h="flytt"][data-v="1"]', 120);
  t.sjekk(Math.abs((await spill(t)).viser - (etterTaster + 1)) < 0.01, "▶-knappen flyttet ikke viseren ett steg");
  t.sjekk((await t.js("document.querySelector('.tl-skive').getAttribute('aria-valuenow')")) === String(Math.round(etterTaster + 1)), "aria-valuenow følger ikke viseren");
  t.sjekk((await t.friForDokk(".tl-fin")) && (await t.friForDokk(".tl-hint")), "Hintfeltet eller finjusteringen ligger bak dokken");
  t.sjekk(!/🔒/u.test(await t.tekst(".dokk .knapp")), "Hovedknappen «Lås svaret» har emoji");
  await t.bilde("gjett");
  await bredBilde(t, "gjett", 1024, 768);
  await bredBilde(t, "gjett", 1440, 900);
  await bredBilde(t, "gjett", 768, 1024);
  // No scale label may break inside a word, on any card, at the normal and the narrowest phone
  await sjekkEtiketter(t, MOBIL.width);
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  await sjekkEtiketter(t, 320);
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  // Short screens: the hint field, the dial, its buttons and the main button show without scrolling
  await iStorrelse(t, "gjett", 320, 568, [".tl-fin", ".tl-hint"]);
  await iStorrelse(t, "gjett", 375, 560, [".tl-fin", ".tl-hint"]);
  await iStorrelse(t, "gjett", 390, 664, [".tl-fin", ".tl-hint", ".tl-sporsmal"]);
  // The front page sees a game in progress
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet regnes ikke som pågående (pagar)");

  // Reload while guessing keeps the needle and the hint
  const forLast = await spill(t);
  await t.lastSide(t.side, "document.querySelector('.tl-skive[role=\"slider\"]')");
  t.sjekk(Math.abs((await spill(t)).viser - forLast.viser) < 0.01, "Viseren flyttet seg etter omlasting");
  t.sjekk((await t.js("document.querySelector('#tl-hint').value")) === "matpakke", "Hintet forsvant fra feltet etter omlasting");

  // Lock and reveal
  await t.klikk('[data-h="las"]', 100);
  await t.bilde("avsloring");
  await ventResultat(t);
  sp = await spill(t);
  const l1 = sp.logg[0];
  t.sjekk(l1.poeng === poengFor(Math.abs(l1.viser - l1.mal)), `Feil poeng: ${l1.poeng} for avstand ${Math.abs(l1.viser - l1.mal)}`);
  t.sjekk(l1.hint === "matpakke", "Hintet ble ikke lagret sammen med runden");
  t.sjekk(await t.finnes(".tl-skive.apen .tl-sone.s4"), "Målet vises ikke etter avsløringen");
  const vist = await t.js(`(() => { const h = document.querySelector('.tl-hint.vist'); return h ? { synlig: h.getClientRects().length > 0, tekst: h.innerText } : null; })()`);
  t.sjekk(vist && (t.norsk ? /«matpakke»/ : /matpakke/).test(vist.tekst) && vist.synlig === HINT_VISES, `Hintet over skiva etter låsing: ${JSON.stringify(vist)} (ventet synlig: ${HINT_VISES})`);
  t.sjekk((await t.js("document.activeElement && document.activeElement.dataset.h")) === "neste", "Fokus havnet ikke på «Neste runde» etter avsløringen");
  t.sjekk(await t.friForDokk(".tl-resultat .stempel"), "Stempelet ligger bak dokken");
  await t.bilde("fasit");
  await iStorrelse(t, "fasit", 320, 568, [".tl-resultat .stempel"]);

  // ---------- Rounds 2–8 ----------
  for (let runde = 2; runde <= 8; runde++) {
    await t.klikk('[data-h="neste"]');
    await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
    const forventet = await navnet(t, (runde - 1) % 3);
    t.sjekk((await t.tekst("#skjerm h1")).includes(forventet), `Runde ${runde}: feil hintgiver`);
    if (runde === 3) {
      // Back to the home screen and continue
      await t.klikk("#tilbake");
      t.sjekk(await t.finnes('.knapp[data-h="fortsett"]'), "Mangler «Fortsett» som hovedknapp midt i spillet");
      t.sjekk(await t.finnes('.hjem-knapper .lenke[data-h="utfordre"]'), "Med et spill i gang skal «Send en utfordring» være en lenke under knappene");
      await t.bilde("hjem-fortsett");
      await t.klikk('[data-h="nytt"]');
      await svarArk(t, "nei");
      t.sjekk((await spill(t)) !== null, "Spillet forsvant selv om vi trykket «Avbryt»");
      await t.klikk('[data-h="fortsett"]');
      await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
    }
    await t.klikk('[data-h="jeg-er"]');
    await holdOgSe(t);
    await t.klikk('[data-h="hint-klar"]');
    await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
    if (runde === 2) {
      // Markup in a hint is text, here and on «Kåringen»
      await t.skrivInn("#tl-hint", "<x-q>tull</x-q> & <b>fet</b>");
      await ingenInjeksjon(t, "gjett");
    }
    if (runde === 4) {
      // «Avslutt» asks first, and staying is called «Spill videre»
      await t.klikk('[data-h="avslutt"]');
      await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
      const ark = await t.js(`({ ja: document.querySelector('#ark [data-v="ja"]').innerText.trim(), nei: document.querySelector('#ark [data-v="nei"]').innerText.trim(), tekst: document.querySelector('#ark .ingress').innerText })`);
      t.sjekk(!t.norsk || (ark.ja === "Avslutt" && ark.nei === "Spill videre" && /kåringen/.test(ark.tekst)), `Arket for «Avslutt» sier ${JSON.stringify(ark)}`);
      await t.bilde("avslutt-ark");
      await t.klikk('#ark [data-v="nei"]');
      t.sjekk((await spill(t)).logg.length === 3 && (await t.finnes('.tl-skive[role="slider"]')), "«Spill videre» fortsatte ikke runden");
    }
    const mal = (await spill(t)).mal;
    // Bullseye on rounds 2 and 3 (two in a row) and 6, a miss on round 5, near on the others
    const sikte = runde === 5 ? bom(mal) : [2, 3, 6].includes(runde) ? mal : naer(mal);
    await settMedTaster(t, sikte);
    await t.klikk('[data-h="las"]', 100);
    await ventResultat(t);
    const logg = (await spill(t)).logg;
    let rad = 0;
    for (let i = logg.length - 1; i >= 0 && logg[i].poeng === 4; i--) rad++;
    const ord = ["", "", "To", "Tre", "Fire", "Fem", "Seks", "Sju", "Åtte"][rad];
    if (runde === 2 || runde === 3) t.sjekk(rad >= 2 ? (t.norsk ? (await toast(t)) === `${ord} på rad! 🔥` : /🔥/u.test(await toast(t))) : !/på rad|🔥/u.test(await toast(t)), `Feil «på rad»-toast etter ${rad} blink(er) på rad: «${await toast(t)}»`);
    if (runde === 2) {
      await ingenInjeksjon(t, "fasit");
      await t.bilde("fasit-full-pott");
    }
    if (runde === 3) await t.bilde("fasit-to-pa-rad");
    if (runde === 5) await t.bilde("fasit-bom");
  }
  sp = await spill(t);
  t.sjekk(sp.logg.length === 8, `Spillet har ${sp.logg.length} runder, ventet 8`);
  t.sjekk(t.norsk ? (await t.tekst('[data-h="neste"]')).trim() === "Til kåringen" : !(await t.finnes('[data-h="neste"] *')), `Siste runde viser «${await t.tekst('[data-h="neste"]')}», ventet «Til kåringen» (ren tekst)`);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.tl-logg')");
  t.sjekk((await t.antall(".tl-logg li")) === 8, "Resultatet viser ikke alle åtte rundene");
  const sum = sp.logg.reduce((s, l) => s + l.poeng, 0);
  t.sjekk((await t.tekst(".tl-total")).includes(String(sum)), "Resultatet viser feil poengsum");
  t.sjekk(t.norsk ? /Første runde – nå har dere en rekord å slå!/.test(await t.tekst(".tl-rekord")) : await t.finnes(".tl-rekord:not(.ny)"), "Første «Sammen»-spill sier ikke at det nå finnes en rekord å slå");
  // The rounds are listed with the hint that was written down, as text
  const rad1 = await t.tekst(".tl-logg li:nth-child(1)");
  t.sjekk(t.norsk ? /«matpakke» fra /.test(rad1) && !/Hint fra/.test(rad1) : /matpakke/.test(rad1) && !/Hint (?:fra|from)/.test(rad1), `Kåringen viser ikke hintet for runde 1 («${rad1.replace(/\s+/g, " ")}»)`);
  t.sjekk((await t.tekst(".tl-logg li:nth-child(2)")).includes(t.norsk ? "«<x-q>tull</x-q> & <b>fet</b>»" : "<x-q>tull</x-q> & <b>fet</b>"), "Hint med < og > vises ikke som tekst i kåringen");
  t.sjekk(/Hint (?:fra|from) /.test(await t.tekst(".tl-logg li:nth-child(3)")), "En runde uten nedskrevet hint sier ikke hvem som ga hintet");
  await ingenInjeksjon(t, "slutt-sammen");
  // Banner → rounds → «Del resultatet» → other games; the dock: «Spill igjen», «Endre oppsett», «Alle spill»
  const rekkefolge = await t.js(`Array.from(document.querySelector("#skjerm").children).map((e) => (e.classList.contains("banner") ? "banner" : e.classList.contains("tl-rekord") ? "rekord" : e.classList.contains("tl-logg") ? "logg" : e.dataset.h === "del" ? "del" : e.classList.contains("flere-spill") ? "flere" : e.classList.contains("dokk") ? "dokk" : "?")).join(" ")`);
  // (Other games are suggested only when the edition has some for this group: a build of one game has none.)
  const gruppe = (await spill(t)).antall;
  const andre = await t.js(`(window.RUSJ_ANDRE || []).some((g) => g.spillere[0] <= ${gruppe} && ${gruppe} <= g.spillere[1])`);
  t.sjekk(rekkefolge === (andre ? "banner rekord logg del flere dokk" : "banner rekord logg del dokk"), `Rekkefølgen på kåringen: ${rekkefolge}`);
  t.sjekk((!t.norsk || (await t.tekst(".dokk .knapp")).trim() === "Spill igjen") && (await t.finnes('.dokk [data-h="igjen"]')) && (await t.finnes('.dokk [data-h="endre"]')) && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Dokken på kåringen har ikke «Spill igjen», «Endre oppsett» og «Alle spill»");
  await t.bilde("slutt-sammen", true);
  await iStorrelse(t, "slutt-sammen", 320, 568, []);
  S = await t.tilstand();
  t.sjekk(S._aktiv === false, "Kåringen skulle ikke regnes som et pågående spill");
  t.sjekk(S.rekord && S.rekord[8] === sum && S.ferdige === 1, `Rekorden for åtte runder ble ikke lagret (${JSON.stringify(S.rekord)})`);
  // «Sammen» is co-op: a record, not points in «Kveldens gjeng»
  t.sjekk((await t.js(`localStorage.getItem("${t.nokkel("kveld")}")`)) === null, "Et samarbeidsspill ga poeng i Kveldens gjeng");
  t.sjekk(await t.js(`Rusj._statKo.some((x) => x.h === "ferdig" && x.d.runder === 8 && x.d.avbrutt === false)`), "Mangler statistikk for ferdig spill (runder, avbrutt)");
  // The share text: name, numbers and one sign per round. Nothing a player typed.
  await fangDeling(t);
  await t.klikk('[data-h="del"]', 300);
  const delt = await sistDelt(t);
  t.sjekk(delt && new RegExp(`^${t.norsk ? "Tankeleseren" : ".+"} ${sum}/32 – [^\\n]+ (?:🎯|🟠|🟡|⚫){8}$`, "u").test(delt.text) && delt.url.endsWith(new URL(t.side).pathname), `Delingsteksten er feil: ${JSON.stringify(delt)}`);
  t.sjekk(delt && !/matpakke|tull|fet|Testspiller|x-q/.test(delt.text), "Delingsteksten inneholder noe en spiller har skrevet");

  // Home: the record is the first chip, and the game is over («Start spill», no «Fortsett»)
  await t.klikk("#tilbake");
  t.sjekk(new RegExp(t.norsk ? `^REKORD ${sum} av 32$` : `^\\S+ ${sum} \\S+ 32$`).test((await t.tekst(".merker li:first-child")).replace(/\s+/g, " ").trim()), `Rekordmerket på hjem-skjermen: «${await t.tekst(".merker li:first-child")}»`);
  t.sjekk((await t.finnes('.knapp[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), "Hjem viser ikke «Start spill» alene etter et ferdig spill");
  await t.bilde("hjem-rekord");
  if (!LIGGENDE) {
    // A phone in the browser (390 × 664): the buttons and the record chip fit the first screen
    await t.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 2, mobile: true });
    await t.sov(400);
    const bunn = await t.js(`Math.round(document.querySelector(".merker li:last-child").getBoundingClientRect().bottom)`);
    t.sjekk(bunn <= 664, `Hjem-skjermen får ikke plass på 390×664 (merkene slutter på ${bunn} px)`);
    await t.skjermbilde(join(bildemappe(t.id), "hjem-rekord-390x664.png"));
    await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
    await t.sov(300);
  }

  // ---------- A game ended with «Avslutt»: «Kåringen» with the rounds so far ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await spillRunde(t, blink, null);
  // (an experienced phone gets no example any more)
  await t.klikk('[data-h="neste"]');
  await t.klikk('[data-h="jeg-er"]');
  await holdOgSe(t);
  t.sjekk(!(await t.finnes("#tl-kikk-hjelp .tl-eksempel")) && (t.norsk ? /ikke tall/.test(await t.tekst("#tl-kikk-hjelp")) : await t.finnes("#tl-kikk-hjelp .tl-mer")), "En mobil som har spilt ferdig før, får fortsatt eksempelet");
  await t.klikk('[data-h="hint-klar"]');
  await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
  await t.klikk('[data-h="avslutt"]');
  await svarArk(t, "ja");
  await t.vent("document.querySelector('.skjerm-slutt .tl-logg')");
  t.sjekk((t.norsk ? /1 av 8 runder/i : /1 \S+ 8/).test(await t.tekst(".banner .etikett")) && (t.norsk ? /4\s*av 4 poeng/ : /4\s*\S+ 4/).test(await t.tekst(".tl-total")), `«Avslutt» ga ikke kåringen med rundene så langt («${await t.tekst(".banner .etikett")}», «${await t.tekst(".tl-total")}»)`);
  t.sjekk((await t.antall(".tl-logg li")) === 1 && !(await t.finnes(".tl-rekord")), "Et avsluttet spill skal vise én runde og ikke røre rekorden");
  S = await t.tilstand();
  t.sjekk(S._aktiv === false && S.rekord[8] === sum && S.ferdige === 2, "Et avsluttet spill regnes fortsatt som pågående, eller endret rekorden");
  t.sjekk(await t.js(`Rusj._statKo.some((x) => x.h === "ferdig" && x.d.runder === 1 && x.d.avbrutt === true)`), "Mangler statistikk for avsluttet spill");
  await t.bilde("slutt-avsluttet");
  // A reload on «Kåringen» lands on the home screen with «Start spill»
  await t.lastSide(t.side, "document.querySelector('#skjerm-tittel')");
  t.sjekk((await t.finnes('.knapp[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), "Etter «Avslutt» og omlasting viser hjem fortsatt «Fortsett»");
}

// ---------- Lag mot lag ----------

async function lagMotLag(t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  if (!(await t.js(`document.querySelector('[data-h="pakke"][data-v="*"]').getAttribute("aria-pressed") === "true"`))) await t.klikk('[data-h="pakke"][data-v="*"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  await t.vent("document.querySelectorAll('.spiller').length === 4");
  await t.skrivInn("#navn-3", "Testspiller D");
  let S = await t.tilstand();
  t.sjekk(S.oppsett.lag.filter((l) => l === 0).length === 2, "Lagene er ikke delt likt");
  await t.klikk('[data-h="bytt-lag"][data-v="0"]');
  t.sjekk(await t.js("document.querySelector('[data-h=\"start\"]').disabled"), "Start skulle være låst når et lag har én spiller");
  await t.klikk('[data-h="bytt-lag"][data-v="0"]');
  await t.bilde("oppsett-lag", true);
  await iStorrelse(t, "oppsett-lag", 320, 568, []);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.tl-lagmerke')");
  await t.bilde("gi-lag");

  let runder = 0;
  let tippet = false;
  let sp;
  for (;;) {
    runder++;
    if (runder > 14) {
      t.feil("Lag mot lag ble aldri ferdig");
      break;
    }
    if (!(await t.finnes('[data-h="jeg-er"]'))) await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
    const forSp = await spill(t);
    t.sjekk(forSp.lag[forSp.giver] === forSp.tur, `Runde ${runder}: hintgiveren er ikke på laget som har tur`);
    await t.klikk('[data-h="jeg-er"]');
    await holdOgSe(t);
    await t.klikk('[data-h="hint-klar"]');
    await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
    const mal = (await spill(t)).mal;
    await settMedTaster(t, mal);
    if (runder === 1) {
      await t.skrivInn("#tl-hint", "sokker i sandaler");
      await t.js("document.activeElement.blur()");
      await iStorrelse(t, "gjett-lag", 320, 568, [".tl-fin", ".tl-hint"]);
      await iStorrelse(t, "gjett-lag", 375, 560, [".tl-fin", ".tl-hint"]);
      // A double tap on «Lås svaret» (real taps, 110 ms apart) locks the answer but must not place
      // the other team's bet, even when «Høyre» lands right under the finger.
      await dobbeltTrykk(t, '[data-h="las"]', '[data-h="tipp"][data-v="h"]');
      const etterDobbelt = await spill(t);
      t.sjekk(etterDobbelt.fase === "motlag" && etterDobbelt.tipp == null && etterDobbelt.logg.length === 0, "Dobbelttrykk på «Lås svaret» la inn motlagets tips");
      // Nothing is revealed yet, so the guessing team may still move the needle
      t.sjekk(await t.finnes('[data-h="angre-las"]'), "Mangler «Angre» på motlagets skjerm");
      await t.js(`(() => { const b = document.querySelector('[data-h="angre-las"]'); b.focus(); b.click(); })()`);
      await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
      t.sjekk((await spill(t)).fase === "gjett", "«Angre» ga ikke viseren tilbake til laget");
      t.sjekk((await t.js("document.activeElement && document.activeElement.getAttribute('role')")) === "slider", "Fokus havnet ikke på viseren etter «Angre»");
      t.sjekk((await t.js("document.querySelector('#tl-hint').value")) === "sokker i sandaler", "Hintet forsvant fra feltet etter «Angre»");
      await settMedTaster(t, mal);
    }
    await t.klikk('[data-h="las"]');
    await t.vent("document.querySelector('[data-h=\"tipp\"]')");
    if (!tippet) {
      t.sjekk((await t.js("document.activeElement && document.activeElement.id")) === "skjerm-tittel", "Fokus havnet ikke på overskriften til motlaget etter «Lås svaret»");
      await t.bilde("motlag"); // (also lets the short guard on the bet buttons pass)
      const sp2 = await spill(t);
      const svar = sp2.mal < sp2.viser ? "v" : "h";
      await t.klikk(`[data-h="tipp"][data-v="${svar}"]`);
      tippet = true;
      await ventResultat(t);
      const l = (await spill(t)).logg[0];
      t.sjekk(l.poeng === 4 && l.tipp === svar, "Første lagrunde ga ikke full pott og registrert tips");
      const fasitRiktig = svar === "v" ? l.mal < l.viser : l.mal > l.viser;
      t.sjekk(l.tippRiktig === fasitRiktig, "Tipset til motlaget ble vurdert feil");
      t.sjekk(l.igjen === false, "Laget som leder, fikk en ekstrarunde");
      await t.bilde("fasit-lag");
    } else {
      await t.klikk('[data-h="tipp"][data-v="-"]');
      await ventResultat(t);
    }
    sp = await spill(t);
    if (sp.vinner != null) break;
    await t.klikk('[data-h="neste"]');
  }
  const p = [0, 0];
  for (const l of sp.logg) {
    p[l.lag] += l.poeng;
    if (l.tippRiktig) p[1 - l.lag] += 1;
  }
  t.sjekk(sp.vinner != null && p[sp.vinner] >= 10 && p[sp.vinner] > p[1 - sp.vinner], `Feil vinner: ${JSON.stringify(p)}, vinner ${sp.vinner}`);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.tl-vinner')");
  t.sjekk(!t.norsk || new RegExp(sp.vinner === 0 ? "^Lag Rosa vinner!$" : "^Lag Blå vinner!$").test((await t.tekst("#skjerm h1")).trim()), `Vinnerlinja er «${await t.tekst("#skjerm h1")}»`);
  await ingenInjeksjon(t, "slutt-lag");
  await t.bilde("slutt-lag", true);
  // «Kveldens gjeng»: every member with the team's points — once
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  const plasser = kveld && kveld.spill.length === 1 ? kveld.spill[0].resultat : [];
  const ventet = [];
  for (let i = 0; i < 4; i++) ventet.push({ navn: await navnet(t, i), plass: sp.lag[i] === sp.vinner ? 1 : 3 });
  t.sjekk(plasser.length === 4 && ventet.every((v) => plasser.some((r) => r.navn === v.navn && r.plass === v.plass)), `Kveldens gjeng fikk ikke lagmedlemmene med lagets poeng: ${JSON.stringify(plasser)}`);
  await fangDeling(t);
  await t.klikk('[data-h="del"]', 300);
  const delt = await sistDelt(t);
  t.sjekk(delt && (t.norsk ? new RegExp(`^Tankeleseren – Lag (Rosa|Blå) vinner ${p[sp.vinner]}–${p[1 - sp.vinner]}\\nLag Rosa .+ · Lag Blå .+$`, "u") : new RegExp(`^.+ ${p[sp.vinner]}–${p[1 - sp.vinner]}\\n.+ · .+$`, "u")).test(delt.text) && !/sandaler|Testspiller/.test(delt.text), `Delingsteksten for lagspillet er feil: ${JSON.stringify(delt)}`);

  // "Spill igjen" starts a fresh team game with the same teams
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  const ny = await spill(t);
  t.sjekk(ny.modus === "lag" && ny.logg.length === 0 && ny.runde === 1 && ny.lag.join() === sp.lag.join(), "«Spill igjen» startet ikke et nytt spill med de samme lagene");

  // ---------- The catch-up rule, from a prepared save (in the shape the game had before) ----------
  // Lag Rosa has 8, Lag Blå 0, and it is Lag Blå's turn: a bullseye gives 4 and they are still behind.
  const gammel = (lag, poeng, giver) => ({ par: ["Kaldt", "Varmt"], kort: 0, mal: 40, viser: poeng === 4 ? 40 : 90, poeng, giver, lag, tipp: null, tippRiktig: null });
  S = await t.tilstand();
  S.spill = { modus: "lag", antall: 4, pakker: ["hverdag"], lag: [0, 1, 0, 1], teller: [2, 1], tur: 1, runde: 4, runder: null, logg: [gammel(0, 4, 0), gammel(1, 0, 1), gammel(0, 4, 2)], vinner: null, skjerm: "gi", kort: 0, par: ["Kaldt", "Varmt"], mal: 40, viser: 50, fase: "gjett", sett: false, tipp: null, avslort: false, giver: 3 };
  S.skjerm = "gi";
  await t.js(`localStorage.setItem("${t.nokkel("tankeleseren.v1")}", ${JSON.stringify(JSON.stringify(S))})`);
  await t.lastSide(t.side, "document.querySelector('[data-h=\"jeg-er\"]')");
  t.sjekk((await t.tekst("#skjerm h1")).includes(await navnet(t, 3)) && (!t.norsk || /Lag Blå gir hint/i.test(await t.tekst(".tl-lagmerke"))), "Et lagret spill fra forrige versjon fortsatte ikke der det slapp");
  await spillRunde(t, blink, null);
  sp = await spill(t);
  t.sjekk(sp.logg.length === 4 && sp.logg[3].poeng === 4 && sp.logg[3].igjen === true, `Full pott og fortsatt bak ga ikke ekstrarunde: ${JSON.stringify(sp.logg[3])}`);
  t.sjekk(t.norsk ? /Full pott og fortsatt bak: Lag Blå får en runde til!/.test(await t.tekst(".tl-resultat")) && (await t.tekst('[data-h="neste"]')).trim() === "Neste: Lag Blå" : await t.finnes(".tl-resultat .tl-igjen.bla"), `Ekstrarunden sies ikke på skjermen («${(await t.tekst(".tl-resultat")).replace(/\s+/g, " ")}», «${await t.tekst('[data-h="neste"]')}»)`);
  await t.bilde("fasit-ekstrarunde");
  await iStorrelse(t, "fasit-ekstrarunde", 390, 664, [".tl-resultat .stempel", ".tl-kommentar"]);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  sp = await spill(t);
  t.sjekk(sp.tur === 1 && sp.giver === 1 && (!t.norsk || /Ekstrarunde: Lag Blå gir hint igjen/i.test(await t.tekst(".tl-lagmerke"))), `Laget fikk ikke gå igjen med sin neste spiller (tur ${sp.tur}, giver ${sp.giver})`);
  await t.bilde("gi-ekstrarunde");
  await t.klikk("#reglerknapp");
  t.sjekk(!t.norsk || /full pott \(4 poeng\) og ligger fortsatt bak, får det en runde til/.test(await t.tekst("#ark")), "Reglene nevner ikke ekstrarunden");
  await t.klikk('#ark [data-h="lukk-ark"]');
  // «Avslutt» in a team game: the team in the lead wins, and the evening gets the result
  await t.klikk('[data-h="jeg-er"]');
  await holdOgSe(t);
  await t.klikk('[data-h="hint-klar"]');
  await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) .ingress')");
  t.sjekk(!t.norsk || /Laget som leder nå, vinner/.test(await t.tekst("#ark .ingress")), "Arket for «Avslutt» i lagspill sier ikke hva som skjer");
  await svarArk(t, "ja");
  await t.vent("document.querySelector('.skjerm-slutt .tl-vinner')");
  t.sjekk(t.norsk ? (await t.tekst("#skjerm h1")).trim() === "Lag Rosa vinner!" && /Avsluttet etter 4 runder/i.test(await t.tekst(".banner .etikett")) : (await t.finnes(".tl-vinner.rosa")) && /4/.test(await t.tekst(".banner .etikett")), `Kåringen etter «Avslutt»: «${await t.tekst("#skjerm h1")}» / «${await t.tekst(".banner .etikett")}»`);
  S = await t.tilstand();
  t.sjekk(S._aktiv === false, "Lagspillet regnes som pågående etter «Avslutt»");
  t.sjekk((await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}")).spill.length`)) === 2, "Et avsluttet lagspill med runder ble ikke regnet med i Kveldens gjeng (eller ble regnet to ganger)");
  await t.bilde("slutt-lag-avsluttet", true);
}

// ---------- Damaged saves ----------

async function skadet(t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"] });
  // Errors on the page are collected from the first line of every load.
  const { identifier } = await t.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__feil = []; addEventListener("error", (e) => window.__feil.push(String(e.message))); addEventListener("unhandledrejection", (e) => window.__feil.push("løfte: " + String(e.reason)));
      (() => { const ekte = console.error; console.error = function () { window.__feil.push(Array.from(arguments).map(String).join(" ")); return ekte.apply(console, arguments); }; })();`,
  });
  const god = () => ({ modus: "lag", antall: 4, pakker: ["hverdag"], lag: [0, 1, 0, 1], teller: [0, 0], tur: 0, runde: 1, runder: null, logg: [], vinner: null, skjerm: "gi", kort: 3, par: ["Kaldt", "Varmt"], mal: 40, viser: 50, fase: "gjett", sett: false, tipp: null, avslort: false, giver: 0 });
  const skader = {
    "tur utenfor (5)": { spill: { ...god(), tur: 5 } },
    "lagspill uten lag": { spill: { ...god(), lag: null } },
    "lagspill der alle er på ett lag": { spill: { ...god(), lag: [0, 0, 0, 0] } },
    "spill: 7": { spill: 7 },
    "spill: tekst": { spill: "sammen" },
    "feil typer": { spill: { ...god(), logg: "x", par: 5, mal: "midten", teller: null } },
    "runde i loggen uten innhold": { spill: { ...god(), logg: [null, 4] } },
    "fasit uten runder": { spill: { ...god(), fase: "fasit" } },
    "hintgiver som ikke finnes": { spill: { ...god(), giver: 99 } },
    "alt annet også skadet": { spill: { ...god(), tur: -1 }, antall: "mange", oppsett: 5, rekord: "nei", utf: 3, jul: "x", ferdige: -3 },
    "utfordring uten innhold": { spill: null, skjerm: "utf", utf: { mot: { kort: 99999, par: [1, 2] }, lag: { kort: "x" }, svar: "x" } },
  };
  for (const [navn, skade] of Object.entries(skader)) {
    for (const skjerm of ["hjem", "skive", "slutt"]) {
      const lagret = { _tid: Date.now(), skjerm, antall: 4, oppsett: { modus: "lag", pakker: ["hverdag"], lag: [0, 1, 0, 1] }, ...skade };
      if (skade.skjerm) lagret.skjerm = skade.skjerm;
      await t.js(`localStorage.setItem("${t.nokkel("tankeleseren.v1")}", ${JSON.stringify(JSON.stringify(lagret))})`);
      await t.lastSide(t.side, "document.querySelector('#skjerm-tittel')");
      const s = await t.js(`({ h1: (document.querySelector("#skjerm-tittel") || {}).innerText || "", start: !!document.querySelector('.hjem-knapper .knapp[data-h="nytt"]'), fortsett: !!document.querySelector('[data-h="fortsett"]'),
        toast: document.querySelector("#toast").textContent, feil: window.__feil || ["(ingen feilsamler)"], spill: JSON.parse(localStorage.getItem("${t.nokkel("tankeleseren.v1")}")).spill })`);
      t.sjekk((!t.norsk || s.h1.trim() === "Tankeleseren") && s.start && !s.fortsett, `Skadet lagring (${navn}, på «${skjerm}»): hjem-skjermen vises ikke med «Start spill» (h1 «${s.h1}»)`);
      t.sjekk(s.feil.length === 0, `Skadet lagring (${navn}, på «${skjerm}»): feil på siden: ${s.feil.join(" | ").slice(0, 200)}`);
      t.sjekk(s.spill === null && !/kunne ikke åpnes/.test(s.toast), `Skadet lagring (${navn}, på «${skjerm}»): spillet ble ikke ryddet bort av spillet selv`);
      if (skade.skjerm) break;
    }
  }
  // Not valid JSON at all, and a saved game that is fine: the first starts fresh, the second continues.
  await t.js(`localStorage.setItem("${t.nokkel("tankeleseren.v1")}", "{ikke json")`);
  await t.lastSide(t.side, "document.querySelector('#skjerm-tittel')");
  t.sjekk((await t.finnes('.hjem-knapper .knapp[data-h="nytt"]')) && (await t.js("window.__feil.length")) === 0, "Lagring som ikke er JSON, ga ikke en vanlig hjem-skjerm");
  await t.js(`localStorage.setItem("${t.nokkel("tankeleseren.v1")}", ${JSON.stringify(JSON.stringify({ _tid: Date.now(), skjerm: "hjem", antall: 4, oppsett: { modus: "lag", pakker: ["hverdag"], lag: [0, 1, 0, 1] }, spill: god() }))})`);
  await t.lastSide(t.side, "document.querySelector('#skjerm-tittel')");
  t.sjekk((t.norsk ? /Fortsett · runde 1 · Lag Rosa/ : /1 · /).test(await t.tekst('.knapp[data-h="fortsett"]')), "Et helt lagret spill ga ikke «Fortsett» på hjem-skjermen");
  await t.bilde("hjem-etter-skadet");
  await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
}

// ---------- The «Jul» pack and its season ----------

async function jul(t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  // 32 scales, each one of a kind, and none that is in another pack already
  const pakke = await t.js(`(() => { const D = window.RUSJ_DATA.spektrum.pakker; const j = D.find((p) => p.id === "jul"); const andre = new Set(D.filter((p) => p.id !== "jul").flatMap((p) => p.par.map((x) => x.join("|"))));
    return j ? { navn: j.navn, ikon: j.ikon, antall: j.par.length, unike: new Set(j.par.map((x) => x.join("|"))).size, felles: j.par.filter((x) => andre.has(x.join("|"))).length, sist: D[D.length - 1].id } : null; })()`);
  t.sjekk(pakke && pakke.navn === (t.sprak === "en" ? "Christmas" : "Jul") && pakke.ikon === "🎄" && pakke.antall >= 30 && pakke.unike === pakke.antall && pakke.felles === 0, `Julepakken: ${JSON.stringify(pakke)}`);
  // The rule itself: 1 November – 6 January, and the season is named after the year it started
  const regel = await t.js(`["2026-10-31", "2026-11-01", "2026-12-24", "2027-01-06", "2027-01-07", "2027-06-15", "tull"].map((d) => Rusj.app.test.julesesong(d)).join(",")`);
  t.sjekk(regel === "0,2026,2026,2026,0,0,0", `Sesongregelen for julepakken: ${regel}`);

  // With a faked clock (Oslo time is read through Date): the same phone through a year
  let klokke = null;
  const settDato = async (iso) => {
    if (klokke) await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: klokke });
    klokke = iso
      ? (
          await t.send("Page.addScriptToEvaluateOnNewDocument", {
            source: `(() => { const Ekte = Date; const fast = new Ekte(${JSON.stringify(iso)}).getTime();
              class Falsk extends Ekte { constructor(...a) { if (a.length) super(...a); else super(fast); } static now() { return fast; } }
              window.Date = Falsk; })();`,
          })
        ).identifier
      : null;
    await t.lastSide(t.side, "document.querySelector('#skjerm-tittel')");
  };
  const stand = async () => {
    const S = await t.tilstand();
    return { pa: S.oppsett.pakker.includes("jul"), jul: S.jul, dag: await t.js("Rusj.dag().tekst") };
  };
  const tilOppsett = async () => {
    if (await t.finnes("#tilbake:not([hidden])")) await t.klikk("#tilbake");
    await t.klikk('[data-h="nytt"]');
  };
  const brikker = () => t.js(`Array.from(document.querySelectorAll('.brikke[data-h="pakke"]:not(.alle)')).map((b) => b.dataset.v)`);

  await t.js(`localStorage.removeItem("${t.nokkel("tankeleseren.v1")}")`);
  await settDato("2026-06-15T12:00:00Z");
  let s = await stand();
  t.sjekk(s.dag === "2026-06-15" && !s.pa && s.jul === 0, `Juni: julepakken skal være av (${JSON.stringify(s)})`);
  await tilOppsett();
  let rekke = await brikker();
  t.sjekk(rekke[rekke.length - 1] === "jul", `Utenom sesongen skal «Jul» stå sist blant kortstokkene (${rekke.join(", ")})`);

  await settDato("2026-11-01T12:00:00Z");
  s = await stand();
  t.sjekk(s.pa && s.jul === 2026, `1. november: julepakken ble ikke skrudd på (${JSON.stringify(s)})`);
  await tilOppsett();
  rekke = await brikker();
  t.sjekk(rekke[0] === "jul" && (await t.js(`document.querySelector('.brikke[data-v="jul"]').getAttribute("aria-pressed")`)) === "true", `I sesongen skal «Jul» stå først og være valgt (${rekke.join(", ")})`);
  await t.bilde("oppsett-jul", true);
  await t.klikk('.brikke[data-v="jul"]'); // a player who switches it off …
  await settDato("2026-12-24T12:00:00Z");
  s = await stand();
  t.sjekk(!s.pa && s.jul === 2026, `… beholder den av resten av sesongen (julaften: ${JSON.stringify(s)})`);
  await settDato("2027-01-06T12:00:00Z");
  s = await stand();
  t.sjekk(!s.pa && s.jul === 2026, `6. januar hører til sesongen som startet i 2026 (${JSON.stringify(s)})`);
  await settDato("2027-02-01T12:00:00Z");
  s = await stand();
  t.sjekk(!s.pa && s.jul === 0, `Februar: sesongen er over (${JSON.stringify(s)})`);
  await tilOppsett();
  await t.klikk('.brikke[data-v="jul"]'); // … and one who switches it on in February keeps it
  await settDato("2027-06-01T12:00:00Z");
  s = await stand();
  t.sjekk(s.pa && s.jul === 0, `Skrudd på for hånd utenom sesongen: skal stå på (${JSON.stringify(s)})`);
  await settDato("2027-11-05T12:00:00Z");
  s = await stand();
  t.sjekk(s.pa && s.jul === 2027, `Ny sesong: ${JSON.stringify(s)}`);
  await settDato("2028-03-01T12:00:00Z");
  s = await stand();
  t.sjekk(!s.pa && s.jul === 0, `Etter sesongen skrus pakken av igjen (${JSON.stringify(s)})`);
  await settDato(null);
}

// ---------- «Send en utfordring» ----------

async function utfordring(t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  // A party game in progress (one round played): it must be untouched by everything below.
  await t.klikk('[data-h="nytt"]');
  if (!(await t.js(`document.querySelector('[data-h="pakke"][data-v="*"]').getAttribute("aria-pressed") === "true"`))) await t.klikk('[data-h="pakke"][data-v="*"]');
  await t.klikk('[data-h="start"]');
  await spillRunde(t, naer, "varm sjokolade");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  const fest = JSON.stringify(await spill(t));
  const festUrort = async (hvor) => {
    const S = await t.tilstand();
    t.sjekk(JSON.stringify(S.spill) === fest && S._aktiv === true, `Festspillet som var i gang, ble endret eller avsluttet (${hvor})`);
  };
  await t.klikk("#tilbake");

  // ----- Make one -----
  await t.klikk('[data-h="utfordre"]');
  await t.vent("document.querySelector('.skjerm-lag .tl-kikk')");
  let S = await t.tilstand();
  let u = S.utf.lag;
  const annet = await kortet(t, u.alt);
  t.sjekk(u && annet && u.alt !== u.kort && (await t.tekst('.dokk [data-h="bytt-kort"]')).includes(annet[0]), "Utfordringen har ikke to kort å velge mellom");
  t.sjekk((!t.norsk || (await t.tekst("#tl-klar")).trim() === "Se målet først") && (await t.js("document.querySelector('#tl-klar').disabled")), "«Del utfordringen» skulle vente på at målet er sett");
  t.sjekk(await t.js(`(() => { const f = document.querySelector('#tl-hint'); const l = document.querySelector('label[for="tl-hint"]'); return !!f && !!l && l.innerText.trim().length > 0 && f.maxLength === 40; })()`), "Hintfeltet i utfordringen mangler etikett eller grense");
  t.sjekk(await t.friForDokk(".tl-hint"), "Hintfeltet i utfordringen ligger bak dokken");
  await t.bilde("utfordring-lag");
  await t.js(`document.querySelector('[data-h="bytt-kort"]').click()`); // pick the other card
  await t.sov(200);
  u = (await t.tilstand()).utf.lag;
  t.sjekk(u.par.join("|") === annet.join("|"), "Ett trykk valgte ikke det andre kortet");
  await holdOgSe(t);
  t.sjekk((!t.norsk || (await t.tekst("#tl-klar")).trim() === "Skriv et hint først") && (await t.js("document.querySelector('#tl-klar').disabled")), `Etter kikket sier knappen «${await t.tekst("#tl-klar")}»`);
  // The hint has markup in it on purpose: it must travel and be shown as text
  const hint = "<x-q>mat</x-q>pakke & <b>ost</b>";
  await t.skrivInn("#tl-hint", "  " + hint + "\u202E  ");
  u = (await t.tilstand()).utf.lag;
  t.sjekk(u.hint === hint, `Hintet lagres ikke renset (${JSON.stringify(u.hint)})`);
  t.sjekk((!t.norsk || (await t.tekst("#tl-klar")).trim() === "Del utfordringen") && !(await t.js("document.querySelector('#tl-klar').disabled")) && (await t.js("document.activeElement.id")) === "tl-hint", "Knappen ble ikke «Del utfordringen» mens hintet ble skrevet (eller feltet mistet fokus)");
  await t.js("document.activeElement.blur()");
  await iStorrelse(t, "utfordring-lag", 320, 568, [".tl-holdknapp", ".tl-hint"]);
  await iStorrelse(t, "utfordring-lag", 375, 560, [".tl-holdknapp", ".tl-hint"]);
  await iStorrelse(t, "utfordring-lag", 390, 664, [".tl-holdknapp", ".tl-hint"]);
  await fangDeling(t);
  await t.klikk("#tl-klar", 400);
  const delt = await sistDelt(t);
  t.sjekk(delt && (t.norsk ? delt.text === `Jeg tenker på «${hint}» et sted mellom «${u.par[0]}» og «${u.par[1]}». Treffer du?` : delt.text.includes(hint) && delt.text.includes(u.par[0]) && delt.text.includes(u.par[1])), `Teksten som deles, er feil: ${JSON.stringify(delt)}`);
  const lenke = (delt && delt.url) || "";
  const kode = lenke.split("#s=")[1] || "";
  t.sjekk(lenke.startsWith(t.side + "#s=") && /^[A-Za-z0-9_-]{20,}$/.test(kode), `Lenken er ikke …/tankeleseren/#s=… (${lenke})`);
  // Nothing readable in the link: not the ends of the card, not the target
  const raa = await t.js(`(() => { const s = ${JSON.stringify(kode)}.replace(/-/g, "+").replace(/_/g, "/"); try { return atob(s + "=".repeat((4 - (s.length % 4)) % 4)); } catch (e) { return ""; } })()`);
  t.sjekk(raa.length > 10 && !raa.includes(u.par[0]) && !raa.includes(u.par[1]), "Lenken inneholder teksten på kortet (skal være en fast referanse, ikke tekst)");
  const lest = await t.js(`Rusj.app.test.lesKode(${JSON.stringify(kode)})`);
  t.sjekk(lest && lest.kort === u.kort && lest.mal === u.mal && lest.hint === hint, `Lenken kan ikke leses tilbake: ${JSON.stringify(lest)}`);
  t.sjekk((await t.tilstand()).utf.lag.delt === true && (await t.finnes('.dokk [data-h="utf-ny"]')), "Etter deling tilbys ikke «Lag en ny»");
  await t.bilde("utfordring-delt");
  await festUrort("etter at en utfordring ble laget");

  // ----- Open it as the receiver: on the page that is open (the address changes) -----
  await t.lastSide(lenke, "document.querySelector('.skjerm-utf .tl-skive[role=\"slider\"]')");
  t.sjekk((await t.js("location.hash")) === "", "Lenken ble stående i adressefeltet");
  let m = (await t.tilstand()).utf.mot;
  t.sjekk(m && m.hint === hint && m.kort === u.kort && m.mal === u.mal && m.fase === "gjett", `Mottakeren fikk ikke utfordringen: ${JSON.stringify(m)}`);
  const strimmel = await t.js(`(() => { const h = document.querySelector('.tl-hint.vist'); return { merke: h.querySelector('.tl-hint-merke').innerText, tekst: h.querySelector('.tl-hint-tekst').innerText, synlig: h.getClientRects().length > 0 }; })()`);
  t.sjekk((t.norsk ? /fra en venn/i.test(strimmel.merke) && strimmel.tekst === `«${hint}»` : strimmel.tekst.includes(hint) && strimmel.tekst.length === hint.length + 2) && strimmel.synlig, `Hintet vises ikke som tekst fra en venn: ${JSON.stringify(strimmel)}`);
  await ingenInjeksjon(t, "utfordring-mottatt");
  t.sjekk((await t.tekst(".tl-kort")).includes(u.par[0]) && (await t.friForDokk(".tl-fin")), "Mottakeren ser ikke kortet, eller finjusteringen ligger bak dokken");
  await t.bilde("utfordring-mottatt");
  await iStorrelse(t, "utfordring-mottatt", 320, 568, [".tl-fin", ".tl-hint"]);
  await iStorrelse(t, "utfordring-mottatt", 375, 560, [".tl-fin", ".tl-hint"]);
  await festUrort("da utfordringen ble åpnet");
  // A reload keeps the challenge (the address no longer has it)
  await t.lastSide(t.side, "document.querySelector('.skjerm-utf .tl-skive[role=\"slider\"]')");
  // Place the needle 5 off the target: 3 points
  await settMedTaster(t, m.mal + (m.mal > 50 ? -5 : 5));
  const statFor = await t.js("Rusj._statKo.length");
  await t.klikk('[data-h="utf-las"]', 100);
  await ventResultat(t);
  m = (await t.tilstand()).utf.mot;
  t.sjekk(m.fase === "fasit" && m.avslort && (t.norsk ? (await t.tekst(".tl-resultat .stempel")).trim().toLowerCase() === "3 poeng" : /^3 /.test((await t.tekst(".tl-resultat .stempel")).trim())), `Mottakeren fikk ikke 3 poeng (${(await t.tekst(".tl-resultat .stempel")).trim()})`);
  t.sjekk(await t.finnes(".tl-skive.apen .tl-sone.s4"), "Målet vises ikke for mottakeren");
  await t.sov(600); // (the stamp lands with an animation: measure it when it has landed)
  t.sjekk((await t.finnes('.dokk [data-h="utf-svar"]')) && (await t.finnes('.dokk [data-h="utf-resultat"]')) && (await t.friForDokk(".tl-resultat .stempel")), "Mangler «Send en tilbake» og «Del resultatet», eller stempelet ligger bak dokken");
  await ingenInjeksjon(t, "utfordring-fasit");
  await t.bilde("utfordring-fasit");
  await iStorrelse(t, "utfordring-fasit", 320, 568, [".tl-resultat .stempel"]);
  await iStorrelse(t, "utfordring-fasit", 375, 560, [".tl-resultat .stempel", ".tl-kommentar"]);
  await fangDeling(t);
  await t.klikk('[data-h="utf-resultat"]', 300);
  const svar = await sistDelt(t);
  t.sjekk(svar && (t.norsk ? svar.text === "Tankeleseren-utfordring: 🟠 3 poeng" : /🟠 3 /u.test(svar.text)) && svar.url === t.side, `Resultatet som deles: ${JSON.stringify(svar)}`);
  // Nothing from a received challenge goes into statistics, records or the evening
  S = await t.tilstand();
  t.sjekk((await t.js("Rusj._statKo.length")) === statFor && Object.keys(S.rekord).length === 0 && S.ferdige === 0 && (await t.js(`localStorage.getItem("${t.nokkel("kveld")}")`)) === null, "En mottatt utfordring satte spor i statistikk, rekord eller Kveldens gjeng");
  await festUrort("etter at utfordringen ble besvart");

  // ----- The same link once more, from a cold start: the first answer stands -----
  await t.lastSide("about:blank");
  await t.lastSide(lenke, "document.querySelector('.skjerm-utf .tl-resultat .stempel')");
  t.sjekk((t.norsk ? (await t.tekst(".tl-resultat .stempel")).trim().toLowerCase() === "3 poeng" && /svart på denne før/.test(await t.tekst(".tl-resultat")) : /^3 /.test((await t.tekst(".tl-resultat .stempel")).trim())) && !(await t.finnes('[data-h="utf-las"]')), "En lenke som åpnes på nytt, viser ikke svaret fra første gang");
  // «Send en tilbake» → a new challenge to make; the party game is still under «Fortsett»
  await t.klikk('[data-h="utf-svar"]');
  await t.vent("document.querySelector('.skjerm-lag .tl-kikk')");
  t.sjekk(!(await t.tilstand()).utf.lag.delt && (await t.js("document.querySelector('#tl-hint').value")) === "", "«Send en tilbake» ga ikke en ny, tom utfordring");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett · runde 2 av 8/ : /2 \S+ 8/).test(await t.tekst('.knapp[data-h="fortsett"]')), "Festspillet står ikke under «Fortsett» etter utfordringen");

  // ----- Damaged and foreign links: «Lenken er ikke gyldig», the home screen, nothing lost -----
  const siste = kode.slice(-1) === "A" ? "B" : "A";
  const darlige = { "ett tegn endret": "s=" + kode.slice(0, -1) + siste, avkortet: "s=" + kode.slice(0, -6), "noe lagt til": "s=" + kode + "AAAA", "ukjent versjon": "s=Ag" + kode.slice(2), tom: "s=", "ikke en utfordring": "ABCD2345", "tegn som ikke hører hjemme": "s=<script>alert(1)</script>", "ødelagt prosentkode": "s=%E0%A4%A" };
  for (const [navn, del] of Object.entries(darlige)) {
    await t.lastSide("about:blank");
    await t.lastSide(`${t.side}#${del}`, "document.querySelector('#skjerm-tittel')");
    const s = await t.js(`({ hjem: !!document.querySelector('.hjem-knapper'), toast: document.querySelector("#toast.vis") ? document.querySelector("#toast").textContent : "", hash: location.hash, mot: JSON.parse(localStorage.getItem("${t.nokkel("tankeleseren.v1")}")).utf.mot })`);
    t.sjekk(s.hjem && (t.norsk ? s.toast === "Lenken er ikke gyldig" : !!s.toast) && s.hash === "", `Ødelagt lenke (${navn}): ${JSON.stringify({ hjem: s.hjem, toast: s.toast, hash: s.hash })}`);
    t.sjekk(s.mot && s.mot.hint === hint, `Ødelagt lenke (${navn}) rørte utfordringen som lå der fra før`);
    if (navn === "ett tegn endret") await t.bilde("utfordring-ugyldig");
  }
  await festUrort("etter ødelagte lenker");
  await ingenInjeksjon(t, "etter ødelagte lenker");
  // Hostile text in a link that is otherwise well-formed: control and invisible characters go, the length is capped
  const stygg = await t.js(`(() => { const T = Rusj.app.test; const k = T.lagKode({ kort: 0, mal: 50, hint: "a\\u202Eb\\u200B c\\u0000d " + "x".repeat(80) }); const u = T.lesKode(k); return u ? { hint: u.hint, lengde: Array.from(u.hint).length } : null; })()`);
  t.sjekk(stygg && stygg.lengde === 40 && stygg.hint.startsWith("ab cd xxx") && !/[\u0000-\u001F\u200B-\u200F\u202A-\u202E]/.test(stygg.hint), `Hint i lenker renses ikke: ${JSON.stringify(stygg)}`);
  // … and the party game goes on
  await t.lastSide(t.side, "document.querySelector('#skjerm-tittel')");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  t.sjekk((await spill(t)).runde === 2, "Festspillet kunne ikke fortsettes etter utfordringene");
}

// ---------- Sammen with 10 players: one round per player, so everybody gives a hint ----------

async function tiSpillere(t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E", "Testspiller F", "Testspiller G"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 7, `Med sju lagrede navn skal oppsettet starte med sju spillere (viser ${await t.antall(".spiller")})`);
  if (!(await t.js(`document.querySelector('[data-h="pakke"][data-v="*"]').getAttribute("aria-pressed") === "true"`))) await t.klikk('[data-h="pakke"][data-v="*"]');
  for (let i = await t.antall(".spiller"); i < 10; i++) await t.klikk('[data-h="spiller-legg-til"]', 60);
  t.sjekk((await t.antall(".spiller")) === 10, "Fikk ikke lagt til ti spillere");
  t.sjekk(/10/.test(await t.tekst('[data-h="modus"][data-v="sammen"]')), "Oppsettet sier ikke at det blir 10 runder");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  t.sjekk((await spill(t)).runder === 10, "Med ti spillere skulle det bli ti runder");
  await t.klikk('[data-h="jeg-er"]');
  await holdOgSe(t);
  await t.klikk('[data-h="hint-klar"]');
  await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
  t.sjekk((t.norsk ? /Runde 1 av 10/i : /1 \S+ 10/).test(await t.tekst("#topp-tittel")), "Toppen viser ikke «Runde 1 av 10»");
  await t.bilde("sammen-10-spillere");
}

export default async function (t) {
  if (med("sammen")) await sammen(t);
  if (med("lag")) await lagMotLag(t);
  if (med("skadet")) await skadet(t);
  if (med("jul")) await jul(t);
  if (med("utfordring")) await utfordring(t);
  if (med("ti")) await tiSpillere(t);
}
