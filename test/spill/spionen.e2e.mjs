// Spionen, played through in parts (each part starts from the home screen):
//   content     the data files, the home screen and «Stedspasset»
//   setup       minutes that follow the group, «Antall runder», the packs
//   onephone    a game of three rounds on one phone: the places in the open, a question on the
//               table, the scoring («Modig spion», «Hvem ropte stopp?», undo), the tie-break,
//               «Kåringen», «Kveldens gjeng», sharing, the passport
//   free        a «Fri» game: the longest card texts, the clock runs out, «Avslutt» mid-round
//   saved       a game saved by the previous version, damaged saves, a fresh phone
//   ownphones   «hver sin mobil» with a second browser: the same cards on every phone, seat locks,
//               the host can't join as a guest (M3), junk in the join link (L6), the host's scoring
//   deck        «hver sin mobil»: the places don't come back from game to game
//   season      the «Jul» pack follows the season (with a faked date)
// While working on one part: SPIONEN_DELER=onephone,free node … (default: all of them).
import { startChrome } from "../chrome.mjs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const KORT = (id) => `.mappe[data-mappe="${id}"]`;
const NOKKEL = "rusj.spionen.v1";
const STOKK = "rusj.spionen.brukt.steder";
// The place list as it was before the «Jul» pack (the game keeps one-phone games from then).
const SALT_FOR_JUL = 2161112527;

// Where the runner saves screenshots (for the second browser's pictures).
const argBilder = process.argv.indexOf("--bilder");
const BILDER = join(resolve(argBilder > 0 ? process.argv[argBilder + 1] : join(tmpdir(), "rusj-e2e")), "spionen");

// Place names carry soft hyphens so long compounds break nicely; ignore them when comparing.
const MYK = String.fromCharCode(173);
const ren = (tekst) => String(tekst).split(MYK).join("");

// All places as the page has them, in the game's own order: [{ p, navn, roller }].
const STEDER_JS = `window.RUSJ_DATA.steder.pakker.flatMap((p) => p.steder.map((s) => ({ p: p.id, navn: s.navn, roller: s.roller })))`;

// What every seat should see, worked out from the host's saved round and the page's own data.
function forventet(t, r) {
  return t.js(`(() => {
    const steder = ${STEDER_JS};
    const r = ${JSON.stringify(r)};
    const s = steder[r.sted];
    return r.roller.map((k, i) => (r.spioner.includes(i) ? { spion: true } : { spion: false, sted: s.navn, rolle: s.roller[k % s.roller.length] }));
  })()`);
}

function sjekkKort(t, tekst, f, hvem) {
  tekst = ren(tekst);
  f = f.spion ? f : { ...f, sted: ren(f.sted) };
  if (f.spion) t.sjekk(/Spionen/.test(tekst) && !/stedet er/i.test(tekst), `${hvem} skulle vært spion, men kortet viser: ${tekst.replace(/\s+/g, " ")}`);
  else t.sjekk(tekst.includes(f.sted) && tekst.includes(f.rolle) && !/Spionen/.test(tekst), `${hvem} skulle sett «${f.sted}» / «${f.rolle}», men kortet viser: ${tekst.replace(/\s+/g, " ")}`);
}

// Hold a card, read its back, let go. Cards whose content is taller than the card are noted.
const klipte = [];
const erKlipt = (c, sel) =>
  c.js(`Array.from(document.querySelectorAll(${JSON.stringify(`${sel} .mappe-forside, ${sel} .mappe-bakside`)})).some((b) => b.scrollHeight > b.clientHeight + 2)`);
async function les(c, sel, merke = sel) {
  const slipp = await c.hold(sel, 650);
  const tekst = await c.tekst(`${sel} .mappe-bakside`);
  if (await erKlipt(c, sel)) klipte.push(merke);
  await slipp();
  return tekst;
}

// The card's instruction («Hold fingeren på kortet for å se») must not hide behind the dock.
const overDokken = (c, sel) =>
  c.js(`(() => {
    window.scrollTo(0, 0);
    const el = document.querySelector(${JSON.stringify(sel)});
    const dokk = document.querySelector("#skjerm .dokk");
    if (!el || !dokk) return true;
    const a = el.getBoundingClientRect();
    const d = dokk.getBoundingClientRect();
    // Beside the dock (a phone on its side: the dock is a column on the right) is fine when it is inside the screen.
    return a.right <= d.left + 1 || a.left >= d.right - 1 ? a.bottom <= window.innerHeight + 1 : a.bottom <= d.top + 1;
  })()`);

// The kit's secret card without a finger — a keyboard, a screen reader, a switch: one press shows
// it and reads it out to the player's own screen reader (#si), the next press hides it. No holding
// and no timing. The secret is never part of the button, and is gone from #si when the card is
// hidden. `tekst` is what the back says (read while a finger held the card).
async function utenFinger(t, sel, tekst) {
  await t.send("Emulation.setFocusEmulationEnabled", { enabled: true }); // a headless page has no focus: keys need it
  const kort = () =>
    t.js(`(() => { const m = document.querySelector(${JSON.stringify(sel)}); return { apen: m.classList.contains("apen"), utvidet: m.getAttribute("aria-expanded"), navn: m.getAttribute("aria-label") || "", si: document.querySelector("#si").textContent, bak: m.querySelector(".mappe-bakside").getAttribute("aria-hidden"), fokus: document.activeElement === m, hint: (document.getElementById(m.getAttribute("aria-describedby") || "") || {}).textContent || "" }; })()`);
  const tast = async (key, vk, ms = 30) => {
    const felles = { key, code: key === " " ? "Space" : key, windowsVirtualKeyCode: vk };
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", ...felles, ...(key === "Enter" ? { text: "\r" } : key === " " ? { text: " " } : {}) });
    await t.sov(ms);
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", ...felles });
    await t.sov(150);
  };
  // The longest word on the back stands for the secret.
  const ord = ren(tekst).split(/[^\p{L}]+/u).sort((a, b) => b.length - a.length)[0] || "";
  const har = (hvor) => ren(hvor).toLowerCase().includes(ord.toLowerCase());
  let k = await kort();
  t.sjekk(!k.apen && k.utvidet === "false" && k.bak === "true", "Kortet sier ikke at det er lukket (aria-expanded), eller baksiden er ikke skjult for skjermlesere");
  t.sjekk(/trykk/i.test(k.hint), "Kortet forklarer ikke at et trykk viser og skjuler det (aria-describedby)");
  await t.klikk(sel); // what a screen reader's double tap sends
  k = await kort();
  t.sjekk(k.apen && k.utvidet === "true", "Et vanlig klikk (skjermleser, bryter) viser ikke kortet");
  t.sjekk(ord.length > 3 && har(k.si), `Kortet leses ikke opp mens det vises (#si: «${k.si}», ventet «${ord}»)`);
  t.sjekk(!har(k.navn), "Det hemmelige står i knappens navn");
  t.sjekk(k.fokus, "Kortet har ikke fokus mens det vises etter et klikk");
  await t.klikk(sel);
  k = await kort();
  t.sjekk(!k.apen && k.utvidet === "false", "Et klikk til skjuler ikke kortet");
  t.sjekk(!har(k.si), "Det hemmelige ble liggende i skjermleser-meldingen etter at kortet ble skjult");
  t.sjekk(k.fokus, "Fokus ble ikke med kortet da skjermen ble tegnet på nytt");
  // Keys: a short press of Enter shows it and Escape hides it; a long press of Space shows it just
  // the same (letting go of the key hides nothing), and leaving the card with Tab hides it.
  await tast("Enter", 13);
  t.sjekk((await kort()).apen, "Et kort trykk på Enter viser ikke kortet (uten å holde)");
  await tast("Escape", 27);
  t.sjekk(!(await kort()).apen, "Escape skjuler ikke kortet");
  await tast(" ", 32, 500);
  k = await kort();
  t.sjekk(k.apen && har(k.si), "Mellomrom viser ikke kortet (eller det lukket seg da tasten ble sluppet)");
  await tast("Tab", 9);
  k = await kort();
  t.sjekk(!k.apen && !har(k.si), "Kortet skjules ikke når fokus forlater det");
  t.sjekk(await t.js(`!!document.activeElement && document.activeElement !== document.body`), "Fokus ble borte da kortet ble skjult");
  // A finger's quick tap is still not enough (the card must be held): it only gives the hint.
  await t.trykk(sel, 60);
  t.sjekk(!(await kort()).apen, "Et kjapt fingertrykk lot kortet stå åpent");
}

// One phone: pass it around, every player holds their card. Returns the texts.
// o.tilbakeUnderNedtelling: tap «back» during «3 2 1 SPØR!» – the round must not start by itself.
async function sendRundt(t, bildeAvForste, o = {}) {
  const antall = (await t.tilstand()).spill.antall;
  const tekster = [];
  for (let i = 0; i < antall; i++) {
    await t.vent(`document.querySelector('${KORT("p" + i)}')`);
    t.sjekk(await t.finnes('[data-h="vist"]:disabled'), "«Ferdig» skal være låst til kortet er sett");
    if (i === 0) t.sjekk(await overDokken(t, `${KORT("p0")} .mappe-finger`), "Instruksen på kortet ligger bak knappen nederst");
    if (i === 0 && bildeAvForste) {
      await t.bilde("gi-mobilen");
      const slipp = await t.hold(KORT("p0"), 650);
      tekster.push(await t.tekst(`${KORT("p0")} .mappe-bakside`));
      if (await erKlipt(t, KORT("p0"))) klipte.push(KORT("p0"));
      await t.bilde("kortet");
      await slipp();
      await utenFinger(t, KORT("p0"), tekster[0]);
    } else {
      tekster.push(await les(t, KORT("p" + i)));
    }
    await t.vent("!document.querySelector('[data-h=\"vist\"]').disabled", 3000);
    await t.klikk('[data-h="vist"]', i === antall - 1 && o.tilbakeUnderNedtelling ? 40 : 160);
    if (i === antall - 1 && o.tilbakeUnderNedtelling) {
      await t.vent("!document.querySelector('#nedtelling').hidden", 2000);
      await t.klikk("#tilbake");
      await t.sov(3200);
      const s = await t.tilstand();
      t.sjekk(s.skjerm === "hjem" && s.spill.klokke.slutt == null && (await t.js("document.querySelector('#nedtelling').hidden")), "Tilbake under «3 2 1» trakk likevel spilleren inn i runden");
      await t.klikk('[data-h="fortsett"]');
      await t.vent("!document.querySelector('[data-h=\"vist\"]').disabled", 3000);
      await t.klikk('[data-h="vist"]');
    }
  }
  await t.vent("document.querySelector('.skjerm-runde #klokke')", 8000);
  return tekster;
}

async function sjekkRundt(t, tekster) {
  const r = (await t.tilstand()).spill.r;
  const f = await forventet(t, r);
  tekster.forEach((tekst, i) => sjekkKort(t, tekst, f[i], NAVN[i]));
  t.sjekk(tekster.filter((x) => /Spionen/.test(x)).length === r.spioner.length, "Feil antall spionkort");
  return r;
}

const stedsnavn = (t, i) => t.js(`${STEDER_JS}[${i}].navn`);

async function ja(c) {
  await c.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"ja\"]')");
  await c.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
}

async function smal(t, navn) {
  const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(bred <= 0, `Sidelengs scrolling på «${navn}» ved 320 px: ${bred}px for bred`);
  await t.bilde(navn);
}

const lagret = (c, nokkel) => c.js(`JSON.parse(localStorage.getItem(${JSON.stringify(nokkel)}) || "null")`);
// Change the saved game with a function (given as source text): endreTilstand(t, "(s) => { s.antall = 5; }")
const endreTilstand = (c, kilde) => c.js(`(() => { const s = JSON.parse(localStorage.getItem("${NOKKEL}")); (${kilde})(s); localStorage.setItem("${NOKKEL}", JSON.stringify(s)); })()`);
const skrivTilstand = (c, tilstand) => c.js(`localStorage.setItem("${NOKKEL}", ${JSON.stringify(typeof tilstand === "string" ? tilstand : JSON.stringify(tilstand))})`);
const trykket = (c, h) => c.js(`(document.querySelector('[data-h="${h}"][aria-pressed="true"]') || { dataset: {} }).dataset.v`);
const statistikk = (c, hendelse) => c.js(`(window.Rusj._statKo.filter((e) => e.h === ${JSON.stringify(hendelse)}).pop() || {}).d || null`);

// Every part starts here: the game's home screen, whatever screen was saved.
async function tilHjem(t) {
  await t.js(`(() => { const s = JSON.parse(localStorage.getItem("${NOKKEL}") || "null"); if (s && typeof s === "object") { s.skjerm = "hjem"; localStorage.setItem("${NOKKEL}", JSON.stringify(s)); } })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm .hjem-knapper')");
}

// «Start spill» / «Nytt spill» → the setup screen (a running game is thrown away after the question).
async function nyttOppsett(t) {
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-oppsett')");
}

// Switch packs on and off until exactly these are chosen (the test must pass on any date).
async function velgPakker(t, onskede) {
  const na = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((b) => [b.dataset.v, b.getAttribute("aria-pressed") === "true"])`);
  for (const [id, pa] of na) if (pa !== onskede.includes(id)) await t.klikk(`[data-h="pakke"][data-v="${id}"]`, 60);
  const valgt = (await t.tilstand()).oppsett.pakker;
  t.sjekk(valgt.length === onskede.length && onskede.every((id) => valgt.includes(id)), `Pakkevalget ble ${valgt.join(", ")} – ventet ${onskede.join(", ")}`);
}

// Headings come in order: one h1 on a screen, and no level is skipped on the way down.
async function overskrifter(t, navn, rot = "#skjerm") {
  const nivaer = await t.js(`Array.from(document.querySelectorAll(${JSON.stringify(`${rot} h1, ${rot} h2, ${rot} h3, ${rot} h4`)})).filter((h) => h.getClientRects().length).map((h) => Number(h.tagName[1]))`);
  if (rot === "#skjerm") t.sjekk(nivaer.filter((n) => n === 1).length === 1 && nivaer[0] === 1, `«${navn}» skal ha én h1, og den først (har ${nivaer.join(" ")})`);
  const hopp = nivaer.findIndex((n, i) => i > 0 && n > nivaer[i - 1] + 1);
  t.sjekk(hopp < 0, `Overskriftene på «${navn}» hopper over et nivå: ${nivaer.join(" ")}`);
}

// The places of the first rounds of a seed, worked out as the game does it.
const forsteSteder = (t, sp, antall) =>
  t.js(`(() => {
    const R = window.Rusj;
    const pakker = ${JSON.stringify(sp.pakker)};
    const alle = ${STEDER_JS};
    const pool = alle.map((s, i) => i).filter((i) => pakker.includes(alle[i].p));
    return R.stokk(pool, R.rng(R.hash("steder:" + ${sp.fro}))).slice(0, ${antall});
  })()`);

// ---------- content ----------

async function innhold(t, ctx) {
  const d = await t.js(`(() => {
    const data = window.RUSJ_DATA;
    const pakker = data.steder.pakker;
    const alle = pakker.flatMap((p) => p.steder);
    const navn = alle.map((s) => s.navn.split(String.fromCharCode(173)).join(""));
    const sporsmal = Object.values(data.sporsmal).flat();
    return {
      pakker: pakker.map((p) => [p.id, p.steder.length]),
      skjeve: alle.filter((s) => s.roller.length !== 7 || s.roller.some((r) => !r.trim() || r.length > 74) || !s.ikon).map((s) => s.navn),
      like: navn.filter((n, i) => navn.indexOf(n) !== i),
      sporsmal,
      grupper: Object.fromEntries(Object.entries(data.sporsmal).map(([k, v]) => [k, v.length])),
    };
  })()`);
  ctx.steder = d.pakker.reduce((s, [, n]) => s + n, 0);
  ctx.sporsmal = d.sporsmal;
  t.sjekk(d.pakker.every(([, n]) => n === 14) && d.pakker.some(([id]) => id === "jul") && !d.skjeve.length, `Hver pakke skal ha 14 steder med 7 roller (og «Jul» skal finnes): ${JSON.stringify(d.pakker)} ${d.skjeve.join(", ")}`);
  t.sjekk(!d.like.length, `Samme sted finnes to ganger: ${d.like.join(", ")}`);
  const unike = new Set(d.sporsmal).size;
  t.sjekk(d.sporsmal.length === 120 && unike === 120 && d.grupper.rolle >= 30 && d.grupper.lett >= 20 && d.sporsmal.every((q) => /\?$/.test(q)), `Ventet 120 ulike spørsmål (minst 30 om rollen, 20 lette): ${d.sporsmal.length} / ${unike} unike, ${JSON.stringify(d.grupper)}`);

  // Home: the first chip counts the places and opens «Stedspasset» (nothing is stamped yet).
  await tilHjem(t);
  const merker = await t.js(`Array.from(document.querySelectorAll(".merker li")).map((li) => li.innerText.replace(/\\s+/g, " ").trim())`);
  t.sjekk(merker.length === 3 && merker[0].startsWith(`${ctx.steder} steder`), `Første merke på hjem-skjermen skal telle stedene: ${merker.join(" | ")}`);
  await t.klikk('[data-h="pass"]');
  await t.vent("document.querySelector('#ark:not([hidden]) .sp-pass')");
  t.sjekk((await t.antall("#ark .sp-pass")) === d.pakker.length && (await t.antall("#ark .sp-stempler li")) === ctx.steder && (await t.antall("#ark .sp-stempler li.tatt")) === 0, "«Stedspasset» skal vise alle stedene per pakke, uten stempler på en ny mobil");
  await overskrifter(t, "stedspasset", "#ark-innhold");
  await t.klikk('#ark [data-h="lukk-ark"]');
}

// ---------- setup ----------

async function oppsett(t) {
  await tilHjem(t);
  await nyttOppsett(t);
  // A fresh setup starts from the saved group (four names), and the minutes follow the group
  // until someone chooses them.
  t.sjekk((await t.tilstand()).antall === 4, "Et nytt oppsett skal starte med like mange spillere som det er lagrede navn");
  t.sjekk((await trykket(t, "tid")) === "5", "4 spillere skal gi 5 minutter");
  for (let i = 0; i < 2; i++) await t.klikk('[data-h="spiller-legg-til"]', 60);
  t.sjekk((await trykket(t, "tid")) === "8", "6 spillere skal gi 8 minutter");
  await t.klikk('[data-h="tid"][data-v="10"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="5"]', 60);
  await t.klikk('[data-h="spiller-fjern"][data-v="4"]', 60);
  t.sjekk((await trykket(t, "tid")) === "10" && (await t.tilstand()).antall === 4, "Minuttene noen har valgt selv, skal bli stående når gruppa endres");
  await t.klikk('[data-h="tid"][data-v="5"]');

  t.sjekk((await trykket(t, "runder")) === "5", "«Antall runder» skal stå på 5 til å begynne med");
  await t.klikk('[data-h="runder"][data-v="0"]');
  t.sjekk(/til dere avslutter/.test(await t.tekst(".skjerm-oppsett")), "«Fri» sier ikke at spillet varer til dere avslutter");
  await t.klikk('[data-h="runder"][data-v="3"]');
  t.sjekk(/ca\. 20 min/.test(await t.tekst(".skjerm-oppsett")), "3 runder på 5 minutter skal anslås til ca. 20 min");

  await velgPakker(t, ["hverdag", "fantasi"]);
  t.sjekk(/28 steder/.test(await t.tekst(".skjerm-oppsett")), "To pakker skal gi 28 steder");
  t.sjekk(await t.finnes('[data-h="spioner"][data-v="2"]:disabled'), "2 spioner skal være låst med 4 spillere");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Gjør klart" && (await t.tekst('[data-h="start"]')).trim() === "Start", "Oppsettet skal hete «Gjør klart» og ha knappen «Start»");
  await overskrifter(t, "oppsett");
  await t.bilde("oppsett", true);
}

// ---------- onephone ----------

async function enMobil(t, ctx) {
  await tilHjem(t);
  await nyttOppsett(t);
  await t.klikk('[data-h="modus"][data-v="en"]', 60);
  await t.klikk('[data-h="tid"][data-v="5"]', 60);
  await t.klikk('[data-h="runder"][data-v="3"]', 60);
  await velgPakker(t, ["hverdag", "fantasi"]);
  await t.klikk('[data-h="start"]');
  const start = await statistikk(t, "start");
  t.sjekk(start && start.modus === "en" && start.spillere === 4 && start.runder === 3, `Statistikk ved start: ${JSON.stringify(start)}`);
  t.sjekk(/Runde 1 av 3/i.test(await t.tekst("#topp-tittel")), "Toppen viser ikke «Runde 1 av 3»");

  // ----- Round 1: the group catches the spy -----
  let tekster = await sendRundt(t, true);
  let r = await sjekkRundt(t, tekster);
  await t.bilde("runde");
  t.sjekk(/spør først/.test(await t.tekst(".sp-topp")), "Viser ikke hvem som spør først");
  t.sjekk(/Runde 1 av 3/i.test(await t.tekst(".sp-rundemerke")), "Mangler merket «Runde 1 av 3» på runden");

  // The possible places are in the open (no button that tells on the spy), in a list that
  // scrolls by itself between the question and the buttons.
  const navnSted = await stedsnavn(t, r.sted);
  const apent = await t.js(`(() => {
    const el = document.querySelector("#sp-apent");
    return { steder: el.querySelectorAll(".sp-sted").length, knapper: el.querySelectorAll("button.sp-sted").length, tekst: el.innerText, ruller: el.scrollHeight > el.clientHeight + 4, hoyde: Math.round(el.clientHeight), siden: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(apent.steder === 28 && apent.knapper === 0 && ren(apent.tekst).includes(ren(navnSted)), `Stedene skal stå åpent på runden (28, deriblant stedet): ${apent.steder} steder, ${apent.knapper} knapper`);
  t.sjekk(!(await t.finnes('#skjerm [data-h="steder"]')), "«Steder»-knappen (som avslørte spionen) finnes fortsatt på runden");
  t.sjekk(apent.ruller && apent.hoyde >= 90 && apent.siden <= 1, `Stedslista skal rulle for seg selv, og siden skal stå stille (lista ${apent.hoyde} px høy, siden ${apent.siden} px for lang)`);
  for (const sel of [".sp-topp", ".sp-forslag", "#sp-apent"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak knappene på runden`);
  await overskrifter(t, "runden");

  // A question on the table, and a real button for another one. The list keeps its place.
  const forslag = async () => (await t.tekst("#sp-forslag")).replace(/[«»]/g, "").trim();
  const q1 = await forslag();
  t.sjekk(ctx.sporsmal.includes(q1), `Forslaget «${q1}» er ikke et av spørsmålene`);
  await t.js("document.querySelector('#sp-apent').scrollTop = 140");
  await t.sov(120);
  await t.klikk('[data-h="nytt-forslag"]');
  const q2 = await forslag();
  t.sjekk(q2 !== q1 && ctx.sporsmal.includes(q2) && ctx.sporsmal[(await t.tilstand()).spill.sporsmal] === q2, `«Nytt» ga ikke et nytt spørsmål («${q1}» → «${q2}»)`);
  t.sjekk((await t.js("document.querySelector('#sp-apent').scrollTop")) > 100, "Et nytt forslag rullet stedslista til toppen");
  t.sjekk(await t.js(`(() => { const b = document.querySelector('[data-h="nytt-forslag"]'); return b.tagName === "BUTTON" && /Nytt/.test(b.getAttribute("aria-label")) && /Nytt/.test(b.innerText); })()`), "Knappen for nytt forslag skal være en ekte knapp med navn");
  await t.js("document.querySelector('#sp-apent').scrollTop = 0");

  // «Spørsmålsideer»: a list from every group, and another draw
  await t.klikk('[data-h="ide"]');
  await t.vent("document.querySelector('#ark:not([hidden]) .sp-ideer')");
  const ideer = () => t.js(`Array.from(document.querySelectorAll("#ark .sp-ideer li")).map((li) => li.textContent)`);
  const forste = await ideer();
  t.sjekk(forste.length === 12 && forste.every((q) => ctx.sporsmal.includes(q)), `«Spørsmålsideer» skal vise 12 spørsmål, viser ${forste.length}`);
  await overskrifter(t, "spørsmålsideer", "#ark-innhold");
  await t.bilde("sporsmal");
  await t.klikk('#ark [data-h="ide"]');
  t.sjekk((await ideer()).join("|") !== forste.join("|"), "«Vis andre» ga de samme spørsmålene");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Pause and +1 min
  await t.klikk('[data-h="pause"]');
  t.sjekk((await t.tilstand()).spill.klokke.gaar === false && /Fortsett/.test(await t.tekst("#pauseknapp")), "Pause stoppet ikke klokka");
  await t.klikk('[data-h="pause"]');
  await t.klikk('[data-h="pluss-min"]');
  t.sjekk((await t.tilstand()).spill.klokke.total === 360, "+1 min ble ikke lagt til");

  // Reload mid-round: same screen, the clock keeps its time
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.skjerm-runde #klokke')");
  const tid = await t.tekst("#klokke .timer-tid");
  t.sjekk(/^[56]:\d\d$/.test(tid), `Klokka etter omlasting viser ${tid}`);
  t.sjekk((await forslag()) === q2, "Forslaget ble byttet ut av en omlasting");

  // Back keeps the game; "Fortsett" returns to the round
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  // «Nytt spill» asks before throwing the running game away
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"nei\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).spill !== null, "«Nytt spill» kastet spillet uten å spørre");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.skjerm-runde')");

  // Forgot your card? Pick who, then hold
  await t.klikk('[data-h="se-igjen"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="2"]');
  await t.vent(`document.querySelector('#ark:not([hidden]) ${KORT("p2")}')`);
  sjekkKort(t, await les(t, `#ark ${KORT("p2")}`), (await forventet(t, r))[2], "Glemt kortet: " + NAVN[2]);
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Accuse the spy → the spy guesses wrong → the group wins
  await t.klikk('[data-h="anklag"]');
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("!document.querySelector('#nedtelling').hidden");
  await t.vent("document.querySelector('#nedtelling').hidden", 6000);
  const spion = r.spioner[0];
  await t.klikk(`[data-h="anklaget"][data-v="${spion}"]`);
  await t.bilde("anklage");
  await t.klikk('[data-h="avslor"]');
  await t.vent("document.querySelector('.stempel')", 6000);
  await t.bilde("avslort-spion");
  await t.klikk('[data-h="til-gjett"]');
  await t.vent("document.querySelector('[data-h=\"gjett-sted\"]')");
  // The guess list is the list from the round, in the same order; its headings are in order.
  t.sjekk((await t.antall('[data-h="gjett-sted"]')) === 28, "Gjettelista skal ha de samme 28 stedene");
  await overskrifter(t, "spionen gjetter");
  await t.bilde("gjett");
  const feilSted = await t.js(`Number(Array.from(document.querySelectorAll('[data-h="gjett-sted"]')).map((b) => b.dataset.v).find((v) => Number(v) !== ${r.sted}))`);
  await t.klikk(`[data-h="gjett-sted"][data-v="${feilSted}"]`);
  await ja(t);
  await t.vent("document.querySelector('.skjerm-svar .stempel')", 6000);
  await t.bilde("svar-feil");
  await t.klikk('[data-h="se-poeng"]');
  await t.vent("document.querySelector('.skjerm-resultat .poengliste')");
  let s = await t.tilstand();
  t.sjekk(s.spill.poeng.every((p, i) => p === (i === spion ? 0 : 1)), `Feil poeng etter at spionen ble tatt: ${s.spill.poeng}`);
  t.sjekk(/tok spionen/.test(await t.tekst("#skjerm h1")), "Resultatet sier ikke at dere tok spionen");

  // «Hvem ropte stopp?»: one tap gives the accuser one more point; «Ingen bestemt» takes it back.
  const jeger = [0, 1, 2, 3].find((i) => i !== spion);
  t.sjekk((await t.antall('[data-h="stoppet"]')) === 4 && !(await t.finnes(`[data-h="stoppet"][data-v="${spion}"]`)), "«Hvem ropte stopp?» skal ha de tre andre og «Ingen bestemt»");
  await t.klikk(`[data-h="stoppet"][data-v="${jeger}"]`);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[jeger] === 2 && s.spill.fangst[jeger] === 1 && s.spill.utfall.stoppet === jeger, `Den som ropte stopp, fikk ikke ett poeng ekstra: ${s.spill.poeng}`);
  await t.klikk('[data-h="stoppet"][data-v="ingen"]');
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[jeger] === 1 && s.spill.fangst[jeger] === 0 && s.spill.utfall.stoppet === null, `«Ingen bestemt» tok ikke ekstrapoenget tilbake: ${s.spill.poeng}`);
  await t.klikk(`[data-h="stoppet"][data-v="${jeger}"]`);
  t.sjekk((await t.tilstand()).spill.poeng[jeger] === 2 && (await t.finnes(`[data-h="stoppet"][data-v="${jeger}"][aria-pressed="true"]`)), "Ekstrapoenget ble ikke gitt på nytt");
  await overskrifter(t, "resultatet");
  await t.bilde("resultat", true);
  // The place is stamped in «Stedspasset» once it is in the open.
  t.sjekk(((await lagret(t, "rusj.spionen.pass")) || []).includes(ren(navnSted)), "Stedet fikk ikke stempel i «Stedspasset»");

  // Narrow phone (320 px) with the longest possible name
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  await t.js(`(() => { const f = JSON.parse(localStorage.getItem("rusj.felles")); f.navn[0] = "Testspillerlanga"; localStorage.setItem("rusj.felles", JSON.stringify(f)); })()`);
  await t.lastSide(t.side, "document.querySelector('.skjerm-resultat')");
  await smal(t, "320-resultat");

  // ----- Round 2: the bold spy stops the clock and names the place → 3 points -----
  await t.klikk('[data-h="ny-runde"]');
  await t.vent(`document.querySelector('${KORT("p0")}')`);
  t.sjekk(/Runde 2 av 3/i.test(await t.tekst("#topp-tittel")), "Toppen viser ikke «Runde 2 av 3»");
  await smal(t, "320-gi-mobilen");
  tekster = await sendRundt(t, false);
  r = await sjekkRundt(t, tekster);
  await smal(t, "320-runde");
  for (const sel of [".sp-topp", ".sp-forslag", "#sp-apent"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak knappene på runden ved 320 px`);
  await t.send("Emulation.setDeviceMetricsOverride", { width: ctx.bredde, height: ctx.hoyde, deviceScaleFactor: 2, mobile: true });
  const modig = r.spioner[0];
  await t.klikk('[data-h="spion-gjetter"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"nei\"]')");
  t.sjekk((await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Å bli i runden skal hete «Spill videre»");
  await ja(t);
  await t.klikk(`[data-h="gjett-sted"][data-v="${r.sted}"]`);
  await ja(t);
  await t.vent("document.querySelector('.skjerm-svar .stempel')", 6000);
  await t.klikk('[data-h="se-poeng"]');
  await t.vent("document.querySelector('.skjerm-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.utfall.spionVant && s.spill.utfall.modig && s.spill.utfall.pluss[modig] === 3 && /Modig spion/.test(await t.tekst("#skjerm h1")), `Den modige spionen fikk ikke 3 poeng: ${JSON.stringify(s.spill.utfall)}`);
  t.sjekk(s.spill.seire[modig] === 1 && s.spill.spilt === 2 && !(await t.finnes('[data-h="stoppet"]')), "Runden spionen vant, skal telle som seier – uten «Hvem ropte stopp?»");
  // «Angre poengene» takes everything back and returns to the guess; the same guess gives the same points.
  const etter2 = s.spill.poeng.slice();
  await t.klikk('[data-h="angre-poeng"]');
  await t.vent("document.querySelector('.skjerm-gjett')");
  s = await t.tilstand();
  t.sjekk(s.spill.utfall === null && s.spill.poeng[modig] === etter2[modig] - 3 && s.spill.seire[modig] === 0 && s.spill.spilt === 1 && s.spill.logg.length === 1, `«Angre poengene» tok ikke alt tilbake: ${s.spill.poeng} / ${s.spill.seire}`);
  await t.klikk(`[data-h="gjett-sted"][data-v="${r.sted}"]`);
  await ja(t);
  await t.vent("document.querySelector('[data-h=\"se-poeng\"]')", 6000);
  await t.klikk('[data-h="se-poeng"]');
  await t.vent("document.querySelector('.skjerm-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join() === etter2.join() && s.spill.seire[modig] === 1, `Poengene ble ikke de samme etter angring: ${s.spill.poeng}`);
  await t.bilde("resultat-modig");

  // ----- Round 3, the last (with «back» during «3 2 1 SPØR!»): an innocent is accused → spy +2 -----
  await t.klikk('[data-h="ny-runde"]');
  await sendRundt(t, false, { tilbakeUnderNedtelling: true });
  r = (await t.tilstand()).spill.r;
  t.sjekk(/Runde 3 av 3/i.test(await t.tekst(".sp-rundemerke")), "Mangler merket «Runde 3 av 3»");
  const uskyldig = [0, 1, 2, 3].find((i) => !r.spioner.includes(i));
  await t.klikk('[data-h="anklag"]');
  await t.klikk(`[data-h="anklaget"][data-v="${uskyldig}"]`);
  await t.klikk('[data-h="avslor"]');
  await t.vent("document.querySelector('.stempel')", 6000);
  await t.bilde("avslort-uskyldig");
  await t.klikk('[data-h="uskyldig"]');
  await t.vent("document.querySelector('.skjerm-resultat')");
  t.sjekk((await t.tilstand()).spill.utfall.pluss[r.spioner[0]] === 2, "Spionen fikk ikke 2 poeng da en uskyldig ble anklaget");
  // After the last round the way on is «Til kåringen» (no new round, nothing to end early).
  t.sjekk((await t.finnes('[data-h="til-slutt"]')) && !(await t.finnes('[data-h="ny-runde"]')) && !(await t.finnes('#skjerm [data-h="avslutt"]')), "Etter siste runde skal knappen være «Til kåringen»");
  t.sjekk((await t.tekst('[data-h="til-slutt"]')).trim() === "Til kåringen", "Hovedknappen etter siste runde skal være ren tekst: «Til kåringen»");
  // «Angre poengene» takes the points back and returns to the accusation
  const forAngre = (await t.tilstand()).spill.poeng.slice();
  await t.klikk('[data-h="angre-poeng"]');
  await t.vent("document.querySelector('.skjerm-anklage')");
  s = await t.tilstand();
  t.sjekk(s.spill.utfall === null && s.spill.poeng[r.spioner[0]] === forAngre[r.spioner[0]] - 2, "«Angre poengene» tok ikke poengene tilbake");
  await t.klikk(`[data-h="anklaget"][data-v="${uskyldig}"]`);
  await t.klikk('[data-h="avslor"]');
  await t.vent("document.querySelector('[data-h=\"uskyldig\"]')", 6000);
  await t.klikk('[data-h="uskyldig"]');
  await t.vent("document.querySelector('.skjerm-resultat')");
  t.sjekk((await t.tilstand()).spill.poeng[r.spioner[0]] === forAngre[r.spioner[0]], "Poengene ble ikke gitt på nytt etter angring");

  // ----- «Kåringen»: two are level on points; the one with most rounds won as spy wins -----
  await endreTilstand(t, "(s) => { s.spill.poeng = [6, 6, 2, 1]; s.spill.seire = [1, 2, 0, 0]; s.spill.fangst = [0, 0, 2, 0]; }");
  await t.lastSide(t.side, "document.querySelector('.skjerm-resultat')");
  const navn = await t.js("[0, 1, 2, 3].map((i) => window.Rusj.navn(i))");
  await t.klikk('[data-h="til-slutt"]');
  await t.vent("document.querySelector('.skjerm-slutt .poengliste')");
  const k = await t.js(`(() => {
    const tekst = (sel) => Array.from(document.querySelectorAll(sel)).map((el) => el.innerText.replace(/\\s+/g, " ").trim());
    return { h1: tekst("#skjerm h1")[0], etikett: tekst(".banner .etikett")[0], linje: tekst(".banner .ingress")[0] || "", pall: ["p1", "p2", "p3"].map((p) => tekst(".pall .pall-plass." + p + " .navn").join("+")), ledere: document.querySelectorAll(".poengliste li.leder").length, liste: tekst(".poengliste .navn"), priser: tekst(".sp-priser li") };
  })()`);
  t.sjekk(k.h1 === `${navn[1]} vinner!` && /flest runder vunnet som spion/.test(k.linje) && /Etter 3 runder/i.test(k.etikett), `Poenglikhet skal avgjøres av runder vunnet som spion: «${k.h1}» / «${k.linje}» / «${k.etikett}»`);
  t.sjekk(k.pall.join("|") === [navn[1], navn[0], navn[2]].join("|") && k.ledere === 1 && k.liste.join("|") === [navn[1], navn[0], navn[2], navn[3]].join("|"), `Pallen og lista følger ikke rangeringen: ${k.pall.join(" / ")} – ${k.liste.join(", ")}`);
  t.sjekk(k.priser.length === 2 && /Mesterspion/i.test(k.priser[0]) && k.priser[0].includes(navn[1]) && /Spionjeger/i.test(k.priser[1]) && k.priser[1].includes(navn[2]), `Utmerkelsene: ${k.priser.join(" | ")}`);
  t.sjekk((await t.finnes('.skjerm-slutt a[href="/"]')) && (await t.finnes(".skjerm-slutt .flere-spill")) && (await t.tekst('[data-h="igjen"]')).trim() === "Spill igjen" && (await t.finnes('.dokk [data-h="nytt"]')), "«Kåringen» mangler «Spill igjen», «Endre oppsett», «Alle spill» eller flere spill");
  // Exactly one game in «Kveldens gjeng», with the same order as on the screen; statistics.
  const kveld = () => lagret(t, "rusj.kveld");
  let kv = await kveld();
  t.sjekk(kv && kv.spill.length === 1 && kv.spill[0].id === "spionen" && kv.spill[0].resultat.map((x) => `${x.navn}:${x.plass}`).join("|") === [`${navn[1]}:1`, `${navn[0]}:2`, `${navn[2]}:3`, `${navn[3]}:4`].join("|"), `«Kveldens gjeng» fikk ikke resultatet: ${JSON.stringify(kv && kv.spill)}`);
  const ferdig = await statistikk(t, "ferdig");
  t.sjekk(ferdig && ferdig.runder === 3 && ferdig.avbrutt === false, `Statistikk ved slutt: ${JSON.stringify(ferdig)}`);
  // «Del resultatet»: the result in numbers, the winner and the award holders – and the game's address.
  await t.js(`Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.__delt = d; } })`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && delt.text.includes(`${navn[1]} vant Spionen med 6 poeng etter 3 runder`) && /Mesterspion/.test(delt.text) && !/#/.test(delt.text) && /\/spionen\/$/.test(delt.url), `«Del resultatet» delte: ${JSON.stringify(delt)}`);
  await overskrifter(t, "kåringen");
  await t.bilde("slutt", true);

  // The game is over: a reload or a visit to the home screen registers nothing more.
  await t.lastSide(t.side, "document.querySelector('.skjerm-slutt .poengliste')");
  await t.klikk("#tilbake");
  s = await t.tilstand();
  kv = await kveld();
  t.sjekk(kv.spill.length === 1, `«Kveldens gjeng» fikk spillet ${kv.spill.length} ganger`);
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && s._aktiv === false && /Start spill/.test(await t.tekst(".hjem-knapper")), "Et ferdig spill vises fortsatt som «Fortsett»");
  // The passport: three places played, three stamps.
  t.sjekk((await t.tekst(".sp-passmerke")).replace(/\s+/g, " ").includes(`3 av ${ctx.steder} steder`), `Hjem-skjermen teller ikke stedene dere har besøkt: «${await t.tekst(".sp-passmerke")}»`);
  await t.klikk('[data-h="pass"]');
  await t.vent("document.querySelector('#ark:not([hidden]) .sp-pass')");
  t.sjekk((await t.antall("#ark .sp-stempler li.tatt")) === 3, "«Stedspasset» skal ha tre stempler etter tre runder");
  await t.bilde("stedspasset");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.bilde("hjem-etter-spill");
}

// ---------- free ----------

async function friSpill(t, ctx) {
  await tilHjem(t);
  const forKveld = (((await lagret(t, "rusj.kveld")) || {}).spill || []).length;
  await nyttOppsett(t);
  await t.klikk('[data-h="modus"][data-v="en"]', 60);
  await t.klikk('[data-h="tid"][data-v="5"]', 60);
  await t.klikk('[data-h="runder"][data-v="0"]', 60);
  await velgPakker(t, ["hverdag", "fantasi"]);
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('${KORT("p0")}')`);
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === "runde 1", `«Fri» skal bare vise rundenummeret: «${await t.tekst("#topp-tittel")}»`);

  // The longest place name and the longest role line there is: the card holds both, on this
  // screen size (the card is checked for cut-off content every time one is read).
  const verst = await t.js(`(() => {
    const steder = ${STEDER_JS};
    const lengde = (s) => s.navn.split(String.fromCharCode(173)).join("").length;
    const lengst = (s) => s.roller.reduce((b, r, i) => (r.length > s.roller[b].length ? i : b), 0);
    const navn = steder.reduce((b, s, i) => (lengde(s) > lengde(steder[b]) ? i : b), 0);
    const rolle = steder.reduce((b, s, i) => (s.roller[lengst(s)].length > steder[b].roller[lengst(steder[b])].length ? i : b), 0);
    return [navn, rolle].map((i) => ({ sted: i, pakke: steder[i].p, rolle: lengst(steder[i]), navn: steder[i].navn, tekst: steder[i].roller[lengst(steder[i])] }));
  })()`);
  ctx.verst = verst;
  for (const v of verst) {
    await endreTilstand(t, `(s) => { const sp = s.spill; sp.r.sted = ${v.sted}; if (!sp.pakker.includes("${v.pakke}")) sp.pakker.push("${v.pakke}"); sp.r.spioner = [sp.antall - 1]; sp.r.roller = sp.r.roller.map((x, i) => (i === sp.antall - 1 ? -1 : (${v.rolle} + i) % 7)); sp.vis = { i: 0, sett: false }; }`);
    await t.lastSide(t.side, `document.querySelector('${KORT("p0")}')`);
    const tekst = await les(t, KORT("p0"), `kortet med «${ren(v.navn)}» / «${v.tekst}»`);
    t.sjekk(ren(tekst).includes(ren(v.navn)) && tekst.includes(v.tekst), `Kortet viser ikke «${ren(v.navn)}» med rollen «${v.tekst}»`);
  }
  await endreTilstand(t, "(s) => { s.spill.vis = { i: 0, sett: false }; }");
  await t.lastSide(t.side, `document.querySelector('${KORT("p0")}')`);
  await sjekkRundt(t, await sendRundt(t, false));
  t.sjekk((await t.tekst(".sp-rundemerke")).trim().toLowerCase() === "runde 1", "«Fri» skal ha merket «Runde 1» på runden");

  // The clock runs out. «+1 min» cancels the jump to the accusation; a reload after the time is
  // up doesn't jump by itself; running out while watching opens the accusation.
  const settSlutt = (ms) => endreTilstand(t, `(s) => { s.spill.klokke.slutt = Date.now() + ${ms}; s.spill.klokke.gaar = true; s.spill.tidUte = false; }`);
  await settSlutt(2000);
  await t.lastSide(t.side, "document.querySelector('.skjerm-runde')");
  await t.vent("document.querySelector('.skjerm-runde .sp-tid-ute')", 8000);
  t.sjekk(!(await t.finnes("#pauseknapp")) && /Hvem er spionen/.test(await t.tekst('[data-h="anklag"]')), "Når tiden er ute, skal «Pause» bort og hovedknappen spørre hvem som er spionen");
  for (const sel of [".sp-topp", ".sp-forslag", "#sp-apent"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak knappene når tiden er ute`);
  await t.bilde("tiden-ute-runde");
  await t.klikk('[data-h="pluss-min"]');
  await t.sov(3500);
  let s = await t.tilstand();
  t.sjekk(s.skjerm === "runde" && !s.spill.tidUte && s.spill.klokke.gaar, "«+1 min» stoppet ikke hoppet til anklagen");
  await settSlutt(-1000);
  await t.lastSide(t.side, "document.querySelector('.skjerm-runde')");
  await t.sov(3500);
  t.sjekk((await t.tilstand()).skjerm === "runde" && (await t.finnes(".sp-tid-ute")), "Omlasting etter at tiden var ute hoppet videre av seg selv");
  await settSlutt(1500);
  await t.lastSide(t.side, "document.querySelector('.skjerm-runde')");
  await t.vent("document.querySelector('.skjerm-anklage .sp-tid-ute')", 9000);
  await t.bilde("tiden-ute");
  await t.klikk('[data-h="uenige"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"nei\"]')");
  t.sjekk((await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Å bli i anklagen skal hete «Spill videre»");
  await ja(t);
  await t.vent("document.querySelector('.skjerm-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.utfall.grunn === "uenige" && s.spill.runde === 1 && s.spill.poeng[s.spill.r.spioner[0]] === 2, "Tiden ute + uenige ga feil utfall");
  // «Fri» never ends by itself: a new round is always the main button, and «Avslutt» is there.
  t.sjekk((await t.finnes('[data-h="ny-runde"]')) && (await t.finnes('.dokk [data-h="avslutt"]')) && !(await t.finnes('[data-h="til-slutt"]')), "«Fri» skal tilby «Ny runde» og «Avslutt» etter hver runde");

  // Round 2 is ended in the middle: «Avslutt» → the sheet → «Kåringen» with round 1 only.
  await t.klikk('[data-h="ny-runde"]');
  await sendRundt(t, false);
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"nei\"]')");
  const ark = await t.js(`({ tittel: document.querySelector("#ark h2").innerText, tekst: document.querySelector("#ark .ingress").innerText, ja: document.querySelector('#ark [data-v="ja"]').innerText.trim(), nei: document.querySelector('#ark [data-v="nei"]').innerText.trim() })`);
  t.sjekk(ark.tittel === "Avslutte spillet?" && /teller ikke/.test(ark.tekst) && ark.ja === "Avslutt" && ark.nei === "Spill videre", `Arket for «Avslutt»: ${JSON.stringify(ark)}`);
  await t.bilde("avslutt");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).skjerm === "runde" && (await t.finnes(".skjerm-runde")), "«Spill videre» ble ikke i runden");
  await t.klikk('#skjerm [data-h="avslutt"]');
  await ja(t);
  await t.vent("document.querySelector('.skjerm-slutt .poengliste')");
  s = await t.tilstand();
  const kv = await lagret(t, "rusj.kveld");
  const ferdig = await statistikk(t, "ferdig");
  t.sjekk(/Etter 1 runde$/i.test((await t.tekst(".banner .etikett")).trim()) && s.spill.ferdig && s._aktiv === false && s.spill.spilt === 1, `«Avslutt» midt i runde 2 skal gi kåring etter 1 runde: «${await t.tekst(".banner .etikett")}»`);
  t.sjekk(kv.spill.length === forKveld + 1 && ferdig && ferdig.runder === 1 && ferdig.avbrutt === false, `Et avsluttet spill med én ferdig runde skal registreres én gang: ${kv.spill.length - forKveld} / ${JSON.stringify(ferdig)}`);
  t.sjekk(/vinner!/.test(await t.tekst("#skjerm h1")), "Sluttskjermen viser ikke hvem som vinner");
  await t.bilde("slutt-avsluttet");

  // «Spill igjen»: the same setup, a new game from round 1.
  await t.klikk('[data-h="igjen"]');
  await t.vent(`document.querySelector('${KORT("p0")}')`);
  s = await t.tilstand();
  t.sjekk(s.spill.runde === 1 && s.spill.spilt === 0 && s.spill.runder === 0 && s.spill.poeng.every((p) => p === 0) && !s.spill.ferdig && s._aktiv === true, "«Spill igjen» startet ikke et nytt spill med samme oppsett");
  ctx.iGang = s;
  // Ended before any round has a result: nothing to rank, nothing to share, nothing registered.
  await endreTilstand(t, '(s) => { s.skjerm = "slutt"; s.spill.skjerm = "slutt"; }');
  await t.lastSide(t.side, "document.querySelector('.skjerm-slutt .poengliste')");
  t.sjekk(/Ingen poeng/.test(await t.tekst("#skjerm h1")) && !(await t.finnes('[data-h="del"]')) && !(await t.finnes(".pall")), "Et spill uten ferdige runder skal ikke kåre noen");
  t.sjekk((await lagret(t, "rusj.kveld")).spill.length === forKveld + 1, "Et spill uten ferdige runder havnet i «Kveldens gjeng»");
}

// ---------- saved ----------

async function lagredeSpill(t, ctx) {
  // A game in progress, as this version saves it (from «free», or a fresh one).
  let s = ctx.iGang;
  if (!s) {
    await tilHjem(t);
    await nyttOppsett(t);
    await t.klikk('[data-h="modus"][data-v="en"]', 60);
    await velgPakker(t, ["hverdag", "fantasi"]);
    await t.klikk('[data-h="start"]');
    await t.vent(`document.querySelector('${KORT("p0")}')`);
    s = await t.tilstand();
  }
  const hjemme = "document.querySelector('#skjerm .hjem-knapper')";

  // The previous version's save: the old place list, no rounds, no counts. A one-phone game
  // carries on, as «Fri».
  const gammelt = JSON.parse(JSON.stringify(s));
  gammelt.skjerm = "hjem";
  gammelt._tid = Date.now();
  gammelt.oppsett = { modus: "en", spioner: 1, tid: 8, pakker: ["hverdag", "fantasi"] };
  delete gammelt.jul;
  for (const felt of ["runder", "spilt", "seire", "fangst", "logg", "sporsmal", "ferdig"]) delete gammelt.spill[felt];
  Object.assign(gammelt.spill, { salt: SALT_FOR_JUL, skjerm: "vis", vis: { i: 0, sett: false }, pakker: ["hverdag", "fantasi"], runde: 2, poeng: [1, 3, 1, 0], utfall: null });
  gammelt.spill.r.sted = 3;
  await skrivTilstand(t, gammelt);
  await t.lastSide(t.side, hjemme);
  s = await t.tilstand();
  t.sjekk(s.spill && s.spill.runder === 0 && s.spill.spilt === 1 && s.spill.poeng.join() === "1,3,1,0" && s.spill.seire.join() === "0,0,0,0" && s.oppsett.runder === 5 && s.oppsett.tidValgt === false, `Et spill fra forrige versjon ble ikke videreført: ${JSON.stringify(s.spill && { runder: s.spill.runder, spilt: s.spill.spilt, poeng: s.spill.poeng })}`);
  t.sjekk(/Fortsett · runde 2/.test(await t.tekst(".hjem-knapper")), "Hjem-skjermen tilbyr ikke å fortsette spillet fra forrige versjon");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`document.querySelector('${KORT("p0")}')`);
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === "runde 2", "Spillet fra forrige versjon skal spilles videre som «Fri»");
  // … but not on the one place that changed number («Julebordet» moved to the «Jul» pack): then
  // the round can't be trusted, and the game is dropped as before.
  gammelt.spill.r.sted = 21;
  gammelt.spill.pakker = ["hverdag", "norge"];
  await skrivTilstand(t, gammelt);
  await t.lastSide(t.side, hjemme);
  t.sjekk((await t.tilstand()).spill === null && !(await t.finnes('[data-h="fortsett"]')), "Et gammelt spill på stedet som har byttet nummer, skulle vært lagt bort");

  // Damaged saves never give a blank page (and never an error): the game starts from what is sound.
  const sunn = JSON.parse(JSON.stringify(ctx.iGang || s));
  const med = (endring) => {
    const kopi = JSON.parse(JSON.stringify(sunn));
    kopi._tid = Date.now();
    endring(kopi);
    return kopi;
  };
  const odelagte = [
    ["ugyldig JSON", '{"spill": {'],
    ["bare tull", { skjerm: "runde", _tid: Date.now(), antall: "mange", oppsett: "tull", spill: 3, laste: 7, gjest: { kode: 12 }, jul: "x", kodeUtkast: { a: 1 } }],
    ["runden mangler", med((k) => ((k.skjerm = "runde"), (k.spill.r = null)))],
    ["poeng er tekst", med((k) => ((k.skjerm = "resultat"), (k.spill.poeng = "x")))],
    ["klokka er et tall", med((k) => ((k.skjerm = "runde"), (k.spill.klokke = 5)))],
    ["ukjent pakke", med((k) => (k.spill.pakker = ["finnes-ikke"]))],
    ["for få roller", med((k) => ((k.skjerm = "vis"), (k.spill.r.roller = [1])))],
    ["resultat uten utfall", med((k) => ((k.skjerm = "resultat"), (k.spill.skjerm = "resultat"), (k.spill.utfall = { pluss: "x" })))],
    ["avsløring uten anklaget", med((k) => ((k.skjerm = "avslor"), (k.spill.skjerm = "avslor"), (k.spill.anklaget = 99)))],
    ["svar uten gjetning", med((k) => ((k.skjerm = "svar"), (k.spill.skjerm = "svar"), (k.spill.gjett = 999)))],
    ["gjest med markup som kode", med((k) => ((k.skjerm = "gjest"), (k.spill = null), (k.gjest = { kode: "<b>x</b>", plass: 2, runde: "to" })))],
    ["oppsett med rare verdier", med((k) => ((k.spill = null), (k.oppsett = { modus: "tre", spioner: 9, tid: "lenge", runder: -1, pakker: "alle" }), (k.antall = 99)))],
  ];
  for (const [hva, tilstand] of odelagte) {
    await skrivTilstand(t, tilstand);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    const side = await t.js(`({ h1: document.querySelector("#skjerm h1").innerText.trim(), knapper: document.querySelectorAll("#skjerm button").length, nodbrems: /kunne ikke åpnes/.test(document.querySelector("#toast").textContent) })`);
    t.sjekk(side.h1.length > 0 && side.knapper > 0 && !side.nodbrems, `Ødelagt lagring («${hva}») ga ${side.nodbrems ? "nødbremsen i kittet" : "en tom side"}`);
    const etter = await t.tilstand();
    t.sjekk(etter && Number.isInteger(etter.antall) && etter.antall >= 3 && etter.antall <= 12 && Array.isArray(etter.oppsett.pakker) && etter.oppsett.pakker.length > 0 && [0, 3, 5].includes(etter.oppsett.runder), `Ødelagt lagring («${hva}») ble ikke ryddet: ${JSON.stringify(etter && etter.oppsett)}`);
  }
  // … also when the deck or the passport is damaged.
  await t.js(`localStorage.setItem("${STOKK}", '"tull"'); localStorage.setItem("rusj.spionen.pass", '{"a":1}')`);
  await skrivTilstand(t, med((k) => (k.spill = null)));
  await t.lastSide(t.side, hjemme);
  await nyttOppsett(t);
  await t.klikk('[data-h="modus"][data-v="en"]', 60);
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('${KORT("p0")}')`);
  t.sjekk(Array.isArray(await lagret(t, STOKK)) && Array.isArray(await lagret(t, "rusj.spionen.pass")), "En ødelagt stokk eller et ødelagt pass ble ikke erstattet");

  // A phone that has played before this version: the places in its deck are stamped from the
  // start («Julebordet» was number 21 then).
  await t.js(`localStorage.clear(); localStorage.setItem("rusj.felles", ${JSON.stringify(JSON.stringify({ lyd: false, navn: ["A", "B", "C", "D", "E", "F"] }))}); localStorage.setItem("${STOKK}", "[0, 21, 30]")`);
  await t.lastSide(t.side, hjemme);
  const pass = (await lagret(t, "rusj.spionen.pass")) || [];
  t.sjekk(pass.length === 3 && pass.includes("Julebordet") && pass.includes("Supermarkedet") && /3 av/.test(await t.tekst(".sp-passmerke")), `Stedene i den gamle stokken ble ikke stemplet: ${pass.join(", ")}`);
  // … and a fresh setup follows the saved group: six names → six players and eight minutes.
  await nyttOppsett(t);
  t.sjekk((await t.tilstand()).antall === 6 && (await trykket(t, "tid")) === "8", "Seks lagrede navn skal gi seks spillere og 8 minutter");
  // Back to the four test players for the parts that follow.
  await t.js(`localStorage.clear(); localStorage.setItem("rusj.felles", ${JSON.stringify(JSON.stringify({ lyd: false, navn: NAVN }))})`);
  await t.lastSide(t.side, hjemme);
}

// ---------- ownphones ----------

async function hverSinMobil(t, ctx) {
  await tilHjem(t);
  await nyttOppsett(t);
  await t.klikk('[data-h="modus"][data-v="hver"]');
  for (let i = (await t.tilstand()).antall; i < 7; i++) await t.klikk('[data-h="spiller-legg-til"]', 40);
  await t.klikk('[data-h="spioner"][data-v="2"]');
  t.sjekk((await t.tilstand()).oppsett.spioner === 2, "Fikk ikke valgt 2 spioner med 7 spillere");
  await t.klikk('[data-h="runder"][data-v="3"]', 60);
  await velgPakker(t, ["hverdag", "norge"]);
  // The deck: twenty of the 28 places have been played on this phone. The code the host makes
  // must start with places from the other eight (every phone works the places out from the code).
  await t.js(`localStorage.setItem("${STOKK}", JSON.stringify(Array.from({ length: 20 }, (_, i) => i)))`);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#spillkode')");
  let s = await t.tilstand();
  const kode = s.spill.kode;
  t.sjekk(kode.length === 10, `Koden skal ha 10 tegn (to kontrolltegn), har ${kode.length}`);
  t.sjekk((await t.tekst("#spillkode")).replace(/\s/g, "") === kode, "Koden på skjermen stemmer ikke med spillet");
  t.sjekk(await t.finnes(".qr svg"), "QR-koden mangler");
  const forste = await forsteSteder(t, s.spill, 3);
  const stokk = await lagret(t, STOKK);
  t.sjekk(forste[0] === s.spill.r.sted && forste.every((i) => i >= 20), `Koden starter på steder som nettopp er spilt: ${forste.join(", ")}`);
  t.sjekk(stokk[stokk.length - 1] === s.spill.r.sted && stokk.length === 21, "Stedet i runde 1 ble ikke merket som spilt på vertens mobil");
  await t.bilde("kode", true);
  // Step 2: the host finds their name and sees their own card
  await t.klikk('[data-h="til-vert"]');
  await t.vent("document.querySelector('.skjerm-vert')");
  await t.klikk('[data-h="vert-plass"][data-v="1"]');
  await t.bilde("vert", true);
  t.sjekk(await t.finnes('[data-h="start-klokka"]:disabled'), "Verten kan starte før kortet er sett");
  const vertTekst = await les(t, KORT("vert"));
  let f = await forventet(t, s.spill.r);
  sjekkKort(t, vertTekst, f[1], "Verten (nr. 2)");
  t.sjekk(await t.finnes('[data-h="vert-plass"][data-v="0"]:disabled'), "Verten kan bytte nummer etter å ha sett kortet");

  // The host must not get a second seat by joining their own game (M3): the code typed into
  // «Bli med», the join link opened in the running page, and the join link opened afresh all
  // lead back to the host's own screen. The host's seat is locked on the guest side as well.
  s = await t.tilstand();
  t.sjekk(s.laste[kode] === 1 && s.spill.vertLaast === true, `Vertens nummer ble ikke låst for koden: ${JSON.stringify(s.laste)}`);
  const hosVerten = async (hvordan) => {
    await t.vent("document.querySelector('.skjerm-vert, .skjerm-kode')");
    const na = await t.tilstand();
    t.sjekk(na.gjest === null && !(await t.finnes(".skjerm-plass, .skjerm-gjest")), `Verten ble gjest i sitt eget spill (${hvordan})`);
    t.sjekk(await t.js("document.querySelector('#toast').classList.contains('vis') && /Du er verten/.test(document.querySelector('#toast').textContent)"), `Verten fikk ikke beskjeden «Du er verten i dette spillet» (${hvordan})`);
  };
  await t.klikk("#tilbake"); // round 1: back to the code …
  await t.klikk("#tilbake"); // … and home
  await t.klikk('[data-h="bli-med"]');
  await t.skrivInn("#kodefelt", kode.toLowerCase().replace(/(.{4})/, "$1 "));
  await t.klikk('button[type="submit"]', 250);
  await hosVerten("koden skrevet inn");
  await t.js(`location.hash = "#${kode}"`);
  await t.sov(350);
  await hosVerten("lenken i samme side");
  await t.lastSide(`${t.side}#${kode}_2`, "document.querySelector('#skjerm h1')");
  await hosVerten("lenken åpnet på nytt");
  if (!(await t.finnes(".skjerm-vert"))) await t.klikk('[data-h="til-vert"]');
  await t.vent("document.querySelector('.skjerm-vert')");

  const c2 = await startChrome({ bredde: ctx.bredde, hoyde: ctx.hoyde });
  let nr = 0;
  const bilde2 = async (navn) => {
    await c2.sov(350);
    const bred = await c2.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Sidelengs scrolling på gjestens «${navn}»`);
    await c2.skjermbilde(join(BILDER, `g${++nr}-${navn}.png`));
  };
  // Seats lock once a card is seen, so the test plays "a fresh phone" for every seat: it forgets
  // this phone's game and locked seats, then joins again with the code.
  const nyMobil = async (runde) => {
    await c2.js(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("rusj.spionen")) localStorage.removeItem(k); })()`);
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${kode}_${runde}`, "document.querySelector('.skjerm-plass')");
  };
  // The seats, compared with the host's round.
  const sjekkSeter = async (forv, runde, seter) => {
    let spioner = 0;
    for (const i of seter) {
      await nyMobil(runde);
      await c2.klikk(`[data-h="gjest-plass"][data-v="${i}"]`);
      await c2.vent(`document.querySelector('${KORT("gjest")}')`);
      t.sjekk((await c2.tekst("#skjerm h1")).includes(`nr. ${i + 1}`), `Gjesten ser ikke «Du er nr. ${i + 1}»`);
      const tekst = await les(c2, KORT("gjest"), `gjestens kort (nr. ${i + 1}, runde ${runde})`);
      if (/Spionen/.test(tekst)) spioner += 1;
      sjekkKort(t, tekst, forv[i], `Gjest nr. ${i + 1} i runde ${runde}`);
      // A place this phone has shown is stamped in its passport – a spy's phone learns nothing.
      const pass = (await lagret(c2, "rusj.spionen.pass")) || [];
      t.sjekk(forv[i].spion ? pass.length === 0 : pass.length === 1 && pass[0] === ren(forv[i].sted), `Gjestens pass etter kortet (nr. ${i + 1}): ${pass.join(", ") || "tomt"}`);
      // Cheating check: after seeing the card, the seat can't be changed (not even by rejoining).
      t.sjekk(!(await c2.finnes('[data-h="bytt-plass"]')), "«Bytt nummer» finnes etter at kortet er sett");
      await c2.klikk("#tilbake");
      await c2.lastSide("about:blank");
      await c2.lastSide(`${t.side}#${kode}_${runde}`, "document.querySelector('.skjerm-gjest, .skjerm-plass')");
      t.sjekk(await c2.finnes(".skjerm-gjest"), "Samme kode på nytt slapp gjesten til å velge nytt nummer");
      t.sjekk((await c2.tekst("#skjerm h1")).includes(`nr. ${i + 1}`), "Samme kode på nytt ga et annet nummer");
    }
    return spioner;
  };
  try {
    await c2.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await c2.js(`localStorage.setItem("rusj.felles", JSON.stringify({ lyd: false, navn: [] }))`);

    // A join link may carry anything after the #: only what a code can be made of is kept (L6).
    const skrot = `<img src=x onerror=alert(1)>"'><x-q>J</x-q> ÆØÅ ${"kode-0189.".repeat(195)}`; // 2,000 characters
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${encodeURIComponent(skrot)}`, "document.querySelector('.skjerm-bli-med #kodefelt')");
    const utkast = await c2.js(`({ felt: document.querySelector("#kodefelt").value, lagret: JSON.parse(localStorage.getItem("${NOKKEL}")).kodeUtkast, feil: document.querySelector("#kodefeil").innerText, merker: document.querySelectorAll("x-q, img[src='x']").length })`);
    t.sjekk(/^[0-9A-Z ]{1,12}$/.test(utkast.felt) && utkast.lagret === utkast.felt && utkast.merker === 0, `Skrot i lenken ble liggende i kodefeltet: «${utkast.felt.slice(0, 60)}» (${utkast.lagret.length} tegn lagret)`);
    t.sjekk(utkast.feil.length > 5 && utkast.feil.length < 120, `Feilmeldingen for skrot i lenken: «${utkast.feil}»`);
    await bilde2("skrot-i-lenken");

    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${kode}`, "document.querySelector('.skjerm-plass')");
    await bilde2("plass");
    t.sjekk((await sjekkSeter(f, 1, [0, 1, 2, 3, 4, 5, 6])) === 2, "Ventet 2 spionkort i runde 1");
    const starter = (await t.tilstand()).spill.r.starter;
    await nyMobil(1);
    await c2.klikk('[data-h="gjest-plass"][data-v="3"]');
    t.sjekk((await c2.tekst(".skjerm-gjest")).includes(`Nr. ${starter + 1} spør først`), "Gjesten ser en annen startspiller enn verten");
    t.sjekk(await overDokken(c2, `${KORT("gjest")} .mappe-finger`), "Instruksen på gjestens kort ligger bak knappene nederst");
    await bilde2("kort");

    // Cross out places in the guest's own list
    await c2.klikk('[data-h="steder"]');
    await c2.klikk('#ark [data-h="kryss"]');
    t.sjekk(await c2.finnes('#ark [data-h="kryss"][aria-pressed="true"]'), "Stedet ble ikke krysset ut");
    await bilde2("steder-kryss");
    await c2.klikk('#ark [data-h="lukk-ark"]');

    // Typing the code by hand: a wrong code first, then the right one in lower case with dashes
    await c2.klikk("#tilbake");
    await c2.klikk('[data-h="bli-med"]');
    await c2.skrivInn("#kodefelt", "abcd 1234");
    await c2.klikk('button[type="submit"]');
    t.sjekk((await c2.tekst("#kodefeil")).length > 5, "Feil kode ga ingen feilmelding");
    await bilde2("feil-kode");
    await c2.skrivInn("#kodefelt", kode.toLowerCase().replace(/(.{4})/, "$1-"));
    await c2.klikk('button[type="submit"]');
    await c2.vent("document.querySelector('.skjerm-gjest, .skjerm-plass')");

    // The host plays round 1 to the end (the scoring is the same as on one phone) …
    await t.vent("!document.querySelector('[data-h=\"start-klokka\"]').disabled");
    await t.klikk('[data-h="start-klokka"]');
    await t.vent("document.querySelector('.skjerm-runde #klokke')", 8000);
    t.sjekk(/Runde 1 av 3/i.test(await t.tekst(".sp-rundemerke")) && (await t.antall("#sp-apent .sp-sted")) === 28 && (await t.finnes("#sp-forslag")), "Vertens runde mangler rundemerket, stedene eller spørsmålet");
    await t.bilde("vert-runde");
    const r1 = (await t.tilstand()).spill.r;
    const tatt = r1.spioner[0];
    await t.klikk('[data-h="anklag"]');
    await t.klikk(`[data-h="anklaget"][data-v="${tatt}"]`);
    await t.klikk('[data-h="avslor"]');
    await t.vent("document.querySelector('.stempel')", 6000);
    await t.klikk('[data-h="til-gjett"]');
    const bom = await t.js(`Number(Array.from(document.querySelectorAll('[data-h="gjett-sted"]')).map((b) => b.dataset.v).find((v) => Number(v) !== ${r1.sted}))`);
    await t.klikk(`[data-h="gjett-sted"][data-v="${bom}"]`);
    await ja(t);
    await t.vent("document.querySelector('[data-h=\"se-poeng\"]')", 6000);
    await t.klikk('[data-h="se-poeng"]');
    await t.vent("document.querySelector('.skjerm-resultat')");
    const jeger = [0, 1, 2, 3, 4, 5, 6].find((i) => !r1.spioner.includes(i));
    await t.klikk(`[data-h="stoppet"][data-v="${jeger}"]`);
    s = await t.tilstand();
    t.sjekk(s.spill.poeng.every((p, i) => p === (r1.spioner.includes(i) ? 0 : i === jeger ? 2 : 1)), `Vertens poeng etter at en spion ble tatt: ${s.spill.poeng}`);
    await t.bilde("vert-resultat", true);
    // … and starts round 2
    await t.klikk('[data-h="ny-runde"]');
    await t.vent("document.querySelector('.skjerm-vert')");
    t.sjekk(/Runde 2/.test(await t.tekst("#skjerm h1")), "Verten viser ikke runde 2");
    s = await t.tilstand();
    t.sjekk(s.spill.r.sted === forste[1], "Runde 2 hos verten er ikke kodens andre sted");
    f = await forventet(t, s.spill.r);

    // A late joiner scans the QR code in round 2: the link carries the round
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${kode}_2`, "document.querySelector('.skjerm-gjest, .skjerm-plass')");
    if (await c2.finnes(".skjerm-plass")) await c2.klikk('[data-h="gjest-plass"][data-v="0"]');
    t.sjekk(/Runde 2/i.test(await c2.tekst("#topp-tittel")), "Lenken for runde 2 ga ikke runde 2");
    // Back one round and forward again with the main button, then a reload
    await c2.klikk('[data-h="gjest-forrige"]');
    t.sjekk(/Runde 1/i.test(await c2.tekst("#topp-tittel")), "«Tilbake til runde 1» virket ikke");
    // «Neste runde» asks first; «Ikke ennå» keeps the card
    await c2.klikk('[data-h="gjest-neste"]');
    await c2.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"nei\"]')");
    await bilde2("neste-runde-sporsmal");
    await c2.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
    t.sjekk(/Runde 1/i.test(await c2.tekst("#topp-tittel")), "«Neste runde» byttet runde uten å spørre");
    await c2.klikk('[data-h="gjest-neste"]');
    await ja(c2);
    await c2.vent("/Runde 2/i.test(document.querySelector('#topp-tittel').textContent)");
    await bilde2("runde-2");
    await c2.lastSide(t.side, "document.querySelector('.skjerm-gjest')");
    t.sjekk(/Runde 2/i.test(await c2.tekst("#topp-tittel")), "Gjesten er ikke i runde 2 etter omlasting");
    // «Forlat spillet» asks, and staying is «Spill videre»
    await c2.klikk('[data-h="forlat"]');
    await c2.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"nei\"]')");
    t.sjekk((await c2.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Å bli i spillet skal hete «Spill videre» for gjesten");
    await c2.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
    await sjekkSeter(f, 2, [0, 3, 6]);
    t.feil && c2.feil.forEach((m) => t.feil(`Gjestens mobil: ${m}`));
  } finally {
    await c2.lukk();
  }

  // The host's own card with the longest texts there are (the card is lower on the host's
  // screen than when the phone is passed around).
  for (const v of ctx.verst || []) {
    await endreTilstand(t, `(s) => { const sp = s.spill; sp.r.sted = ${v.sted}; if (!sp.pakker.includes("${v.pakke}")) sp.pakker.push("${v.pakke}"); sp.r.spioner = [sp.vertPlass === 0 ? 1 : 0]; sp.r.roller = sp.r.roller.map((x, i) => (i === sp.r.spioner[0] ? -1 : i === sp.vertPlass ? ${v.rolle} : (${v.rolle} + 1 + i) % 7)); }`);
    await t.lastSide(t.side, `document.querySelector('${KORT("vert")}')`);
    const tekst = await les(t, KORT("vert"), `vertens kort med «${ren(v.navn)}» / «${v.tekst}»`);
    t.sjekk(ren(tekst).includes(ren(v.navn)) && tekst.includes(v.tekst), `Vertens kort viser ikke «${ren(v.navn)}» med rollen «${v.tekst}»`);
  }

  // The host leaves the game («Nytt spill»). The old code is still locked to the host's seat on
  // this phone: joining it as a guest gives that seat and no other.
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('#skjerm .hjem-knapper')");
  await nyttOppsett(t);
  await t.klikk("#tilbake");
  t.sjekk((await t.tilstand()).spill === null, "«Nytt spill» la ikke bort vertens spill");
  await t.klikk('[data-h="bli-med"]');
  await t.skrivInn("#kodefelt", kode);
  await t.klikk('button[type="submit"]', 250);
  await t.vent("document.querySelector('.skjerm-gjest, .skjerm-plass')");
  t.sjekk((await t.finnes(".skjerm-gjest")) && (await t.tekst("#skjerm h1")).includes("nr. 2") && !(await t.finnes('[data-h="bytt-plass"]')), "En kode mobilen selv har vært vert for, ga et annet nummer enn vertens");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="bli-med"]');
  await t.js(`location.hash = "#${kode}"`);
  await t.vent("document.querySelector('.skjerm-gjest, .skjerm-plass')");
  t.sjekk((await t.finnes(".skjerm-gjest")) && (await t.tekst("#skjerm h1")).includes("nr. 2"), "Lenken til en kode mobilen har vært vert for, ga et annet nummer enn vertens");
  await t.klikk('[data-h="forlat"]');
  await ja(t);
}

// ---------- deck ----------

// «Hver sin mobil», one pack of 14 places and three rounds per game: the places of one game never
// come straight back in the next, and nothing is repeated before the deck is nearly through.
async function stokkenOverSpill(t) {
  await t.js(`localStorage.removeItem("${STOKK}")`);
  const spilt = [];
  for (let spill = 1; spill <= 5; spill++) {
    await tilHjem(t);
    await nyttOppsett(t);
    if (spill === 1) {
      await t.klikk('[data-h="modus"][data-v="hver"]', 60);
      await t.klikk('[data-h="runder"][data-v="3"]', 60);
      await velgPakker(t, ["jobb"]);
    }
    await t.klikk('[data-h="start"]');
    await t.vent("document.querySelector('#spillkode')");
    const sp = (await t.tilstand()).spill;
    const steder = await forsteSteder(t, sp, 3);
    const forrige = spilt[spilt.length - 1] || [];
    const alle = spilt.flat();
    t.sjekk(!steder.some((i) => forrige.includes(i)), `Spill ${spill} starter med steder fra forrige spill: ${steder.join(", ")} (forrige: ${forrige.join(", ")})`);
    if (spill <= 4) t.sjekk(!steder.some((i) => alle.includes(i)), `Spill ${spill} gjentar steder før stokken er brukt opp: ${steder.join(", ")} (spilt: ${alle.join(", ")})`);
    // Rounds 2 and 3 are «played» too: the host marks a round's place when the round starts.
    await t.js(`(() => { const nye = ${JSON.stringify(steder)}; const l = JSON.parse(localStorage.getItem("${STOKK}") || "[]").filter((i) => !nye.includes(i)); localStorage.setItem("${STOKK}", JSON.stringify(l.concat(nye))); })()`);
    spilt.push(steder);
  }
}

// ---------- season ----------

// The «Jul» pack is in season from 1 November to 6 January (Oslo time). It is switched on once
// when the season starts and off when it is over; in between the players decide.
async function julesesongen(t) {
  const hjemme = "document.querySelector('#skjerm .hjem-knapper')";
  // Loads the game with the clock set to a date (it runs on from there).
  const pa = async (iso, fn) => {
    const kilde = `(() => { const Ekte = Date; const start = Ekte.now(); const mal = Ekte.parse("${iso}"); class Falsk extends Ekte { constructor(...a) { if (a.length) super(...a); else super(mal + (Ekte.now() - start)); } static now() { return mal + (Ekte.now() - start); } } window.Date = Falsk; })()`;
    const { identifier } = await t.send("Page.addScriptToEvaluateOnNewDocument", { source: kilde });
    try {
      await t.lastSide("about:blank");
      await t.lastSide(t.side, hjemme);
      return await fn(await t.tilstand());
    } finally {
      await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  };
  const tom = () => t.js(`localStorage.clear(); localStorage.setItem("rusj.felles", ${JSON.stringify(JSON.stringify({ lyd: false, navn: NAVN }))})`);
  const pakker = (s) => s.oppsett.pakker.join(",");

  // A fresh setup in the season: «Jul» and the first standard pack, 28 places, «Jul» first.
  await tom();
  await pa("2026-12-10T12:00:00+01:00", async (s) => {
    t.sjekk(pakker(s) === "hverdag,jul" && s.jul === 2026, `Et nytt oppsett i desember skal ha Jul + Hverdag: ${pakker(s)} (jul: ${s.jul})`);
    await nyttOppsett(t);
    t.sjekk((await t.js(`document.querySelector(".sp-pakker .flis").dataset.v`)) === "jul" && /28 steder/.test(await t.tekst(".skjerm-oppsett")), "«Jul» skal stå først i sesongen, og oppsettet skal ha 28 steder");
    await t.bilde("oppsett-jul", true);
    // The players switch it off: it stays off for the rest of the season.
    await t.klikk('[data-h="pakke"][data-v="jul"]');
  });
  await pa("2026-12-24T18:00:00+01:00", (s) => t.sjekk(pakker(s) === "hverdag" && s.jul === 2026, `«Jul» ble skrudd på igjen etter at spillerne skrudde den av: ${pakker(s)}`));

  // A selection from before the season gets «Jul» once, keeps it into January, and loses it on 7 January.
  await skrivTilstand(t, { skjerm: "hjem", _tid: Date.parse("2026-10-20T12:00:00+02:00"), antall: 4, oppsett: { modus: "en", spioner: 1, tid: 8, pakker: ["norge", "reise"] }, spill: null, laste: {}, gjest: null });
  await pa("2026-10-31T23:30:00+01:00", (s) => t.sjekk(pakker(s) === "norge,reise" && !s.jul, `«Jul» kom før sesongen (31. oktober): ${pakker(s)}`));
  await pa("2026-11-01T00:30:00+01:00", (s) => t.sjekk(pakker(s) === "norge,reise,jul" && s.jul === 2026, `«Jul» ble ikke lagt til da sesongen startet (1. november): ${pakker(s)}`));
  await pa("2027-01-06T23:00:00+01:00", (s) => t.sjekk(pakker(s) === "norge,reise,jul" && s.jul === 2026, `«Jul» skal være med til og med 6. januar: ${pakker(s)} (jul: ${s.jul})`));
  await pa("2027-01-07T00:30:00+01:00", (s) => t.sjekk(pakker(s) === "norge,reise" && s.jul === 0, `«Jul» ble ikke tatt ut etter sesongen (7. januar): ${pakker(s)} (jul: ${s.jul})`));

  // The season's own default (Jul + Hverdag) becomes the usual two packs when the season is over.
  await tom();
  await pa("2026-12-10T12:00:00+01:00", (s) => t.sjekk(pakker(s) === "hverdag,jul", `Nytt oppsett i desember: ${pakker(s)}`));
  await pa("2027-02-01T12:00:00+01:00", (s) => t.sjekk(pakker(s) === "hverdag,norge" && s.jul === 0, `Etter sesongen skal standardvalget være de to vanlige pakkene: ${pakker(s)}`));

  // Out of season «Jul» is off and last – and stays on for the players who switch it on.
  await pa("2027-06-15T12:00:00+02:00", async (s) => {
    t.sjekk(pakker(s) === "hverdag,norge", `Et oppsett i juni skal ikke ha «Jul»: ${pakker(s)}`);
    await nyttOppsett(t);
    t.sjekk((await t.js(`Array.from(document.querySelectorAll(".sp-pakker .flis")).pop().dataset.v`)) === "jul", "«Jul» skal stå sist utenom sesongen");
    await t.klikk('[data-h="pakke"][data-v="jul"]');
  });
  await pa("2027-06-16T12:00:00+02:00", (s) => t.sjekk(pakker(s) === "hverdag,norge,jul" && s.jul === 0, `«Jul» valgt for hånd i juni ble tatt bort igjen: ${pakker(s)}`));
  await pa("2027-11-01T12:00:00+01:00", (s) => t.sjekk(pakker(s) === "hverdag,norge,jul" && s.jul === 2027, `Neste sesong (2027) ble ikke merket: ${pakker(s)} (jul: ${s.jul})`));
}

const DELER = [
  ["content", innhold],
  ["setup", oppsett],
  ["onephone", enMobil],
  ["free", friSpill],
  ["saved", lagredeSpill],
  ["ownphones", hverSinMobil],
  ["deck", stokkenOverSpill],
  ["season", julesesongen],
];

export default async function (t) {
  await t.start({ navn: NAVN });
  const [bredde, hoyde] = await t.js("[window.innerWidth, window.innerHeight]");
  const ctx = { bredde, hoyde, steder: 0, sporsmal: [] };
  const bare = (process.env.SPIONEN_DELER || "").split(",").map((d) => d.trim()).filter(Boolean);
  for (const [navn, del] of DELER) {
    if (bare.length && navn !== "content" && !bare.includes(navn)) continue;
    await del(t, ctx);
  }
  t.sjekk(!klipte.length, `Innholdet er høyere enn kortet (blir kuttet): ${[...new Set(klipte)].join(", ")}`);
}
