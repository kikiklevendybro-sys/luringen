// Nissen: set up a draw (names, a pair that must not draw each other, an impossible set of pairs,
// budget and date), draw on one phone (pass it around, a reload and back + continue on the way),
// look up a forgotten card, gift ideas, «Ferdig – vi ses på gavedagen» with a countdown, the reveal
// only from the gift day on, and «årets nisse». Then «hver sin mobil»: one personal link per person,
// each one scrambled token that no name can be read off, and none of them lying in the page. A
// second, separate browser (which knows nothing of the draw) opens one person's link and must
// see exactly that person's receiver; another person's link asks before it replaces the card;
// broken and readable links are refused kindly; the host's phone asks before it opens a card from
// a link; and the host's own card locks to one name on the host's phone.
import { startChrome } from "../chrome.mjs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E"];
const KORT = (id) => `.mappe[data-mappe="${id}"]`;

const argBilder = process.argv.indexOf("--bilder");
const BILDER = join(resolve(argBilder > 0 ? process.argv[argBilder + 1] : join(tmpdir(), "rusj-e2e")), "nissen");

// Hold a card, read whom it says (data-mottaker) and its text, let go. Cut-off content is noted.
const klipte = [];
async function les(c, sel) {
  const slipp = await c.hold(sel, 650);
  const mottaker = await c.js(`(() => { const el = document.querySelector(${JSON.stringify(sel + " .mappe-bakside [data-mottaker]")}); return el ? el.dataset.mottaker : ""; })()`);
  const tekst = await c.tekst(`${sel} .mappe-bakside`);
  const klipt = await c.js(`Array.from(document.querySelectorAll(${JSON.stringify(`${sel} .mappe-forside, ${sel} .mappe-bakside`)})).some((b) => b.scrollHeight > b.clientHeight + 2)`);
  if (klipt) klipte.push(sel);
  await slipp();
  return { mottaker, tekst };
}

// The card's instruction must not hide behind the dock.
const overDokken = (c, sel) =>
  c.js(`(() => {
    window.scrollTo(0, 0);
    const el = document.querySelector(${JSON.stringify(sel)});
    const dokk = document.querySelector("#skjerm .dokk");
    return !el || !dokk || el.getBoundingClientRect().bottom <= dokk.getBoundingClientRect().top + 1;
  })()`);

async function ja(c) {
  await c.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"ja\"]')");
  await c.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
}

function sjekkRing(t, m, hvor) {
  const n = m.length;
  t.sjekk(new Set(m).size === n && m.every((x) => x >= 0 && x < n), `${hvor}: ikke alle fikk nøyaktig én nisse (${m})`);
  t.sjekk(m.every((x, i) => x !== i), `${hvor}: noen trakk seg selv (${m})`);
  let i = 0;
  let steg = 0;
  do {
    i = m[i];
    steg += 1;
  } while (i !== 0 && steg <= n);
  t.sjekk(steg === n, `${hvor}: trekningen er ikke én ring (${m})`);
}

// Change the saved draw (as if days had passed) and reload the page.
async function endreSpill(t, kode) {
  await t.js(`(() => { const k = "rusj.nissen.v1"; const s = JSON.parse(localStorage.getItem(k)); (${kode})(s.spill); localStorage.setItem(k, JSON.stringify(s)); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
}

export default async function (t) {
  await t.start({ navn: NAVN });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  const navnPaSiden = async () => t.js("Array.from({ length: 5 }, (_, i) => (document.querySelector('#ni-navn-' + i) || {}).value || '')");

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.skjerm-oppsett')");
  t.sjekk((await t.antall('[data-felt="navn"]')) === 5, "Navnene fra gjengen ble ikke fylt inn");
  const visteNavn = await navnPaSiden();
  t.sjekk(visteNavn[0] === NAVN[0] || visteNavn[0].includes("x-q"), "Første navn ble ikke fylt inn");
  await t.bilde("oppsett", true);

  // A missing name and two equal names stop the draw, with a message
  await t.skrivInn("#ni-navn-1", "");
  t.sjekk(await t.finnes('[data-h="start"]:disabled'), "«Start» virker uten alle navn");
  t.sjekk(/mangler/i.test(await t.tekst("#ni-feil")), "Ingen melding om navn som mangler");
  await t.skrivInn("#ni-navn-1", "testspiller a");
  t.sjekk(/To heter/.test(await t.tekst("#ni-feil")), "Ingen melding om to like navn");
  // A name is cut between whole characters: an emoji that doesn't fit goes out whole, never in half
  const felt1 = () => t.js("document.querySelector('#ni-navn-1').value");
  await t.skrivInn("#ni-navn-1", "Bestemor Solveig🎅");
  t.sjekk((await t.tilstand()).navn[1] === "Bestemor Solveig" && (await felt1()) === "Bestemor Solveig", "Navnet ble ikke kuttet mellom hele tegn");
  await t.skrivInn("#ni-navn-1", "Bestemor Solvei🎅");
  t.sjekk((await t.tilstand()).navn[1] === "Bestemor Solvei🎅" && !(await t.finnes('[data-h="start"]:disabled')), "En emoji som får plass, ble ikke godtatt");
  // A name of invisible characters only is still a missing name
  await t.skrivInn("#ni-navn-1", "\u200b\u2060");
  t.sjekk(/mangler/i.test(await t.tekst("#ni-feil")), "Et usynlig navn ble godtatt");
  await t.skrivInn("#ni-navn-1", NAVN[1]);
  t.sjekk(!(await t.finnes('[data-h="start"]:disabled')), "«Start» er fortsatt låst etter at navnene er rettet");

  // A pair that must not draw each other
  await t.klikk('[data-h="par"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"par-velg\"]')");
  await t.klikk('#ark [data-h="par-velg"][data-v="0"]');
  await t.klikk('#ark [data-h="par-velg"][data-v="1"]');
  await t.bilde("par-ark");
  await t.klikk("#ni-par-ok");
  t.sjekk(JSON.stringify((await t.tilstand()).oppsett.par) === "[[0,1]]", "Paret ble ikke lagt til");
  // Two more pairs with A leave A only one person to give to: impossible, and said so
  for (const b of [2, 3]) {
    await t.klikk('[data-h="par"]');
    await t.klikk('#ark [data-h="par-velg"][data-v="0"]');
    await t.klikk(`#ark [data-h="par-velg"][data-v="${b}"]`);
    await t.klikk("#ni-par-ok");
  }
  t.sjekk(await t.finnes('[data-h="start"]:disabled'), "Umulige par stoppet ikke trekningen");
  t.sjekk(/går ikke/.test(await t.tekst("#ni-feil")), "Ingen melding om at parene gjør trekningen umulig");
  await t.bilde("oppsett-umulig");
  await t.klikk('[data-h="fjern-par"][data-v="2"]');
  await t.klikk('[data-h="fjern-par"][data-v="1"]');
  t.sjekk(JSON.stringify((await t.tilstand()).oppsett.par) === "[[0,1]]", "Feil par igjen etter fjerning");

  // Budget and a gift day 30 days from now
  await t.klikk('[data-h="budsjett"][data-v="1"]');
  t.sjekk((await t.tilstand()).oppsett.budsjett === 5, "Budsjettet gikk ikke opp");
  const gavedag = await t.js("(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()");
  await t.skrivInn("#ni-dato", gavedag);
  t.sjekk((await t.tilstand()).oppsett.dato === gavedag, "Datoen ble ikke lagret");

  // ---------- One phone ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-trekk')");
  await t.sov(500);
  await t.bilde("trekk");
  await t.vent(`document.querySelector('${KORT("p0")}')`, 8000);
  let sp = (await t.tilstand()).spill;
  const m = sp.mottaker;
  sjekkRing(t, m, "Én mobil");
  t.sjekk(m[0] !== 1 && m[1] !== 0, `A og B trakk hverandre selv om de er et par (${m})`);
  const navn = sp.navn;

  for (let i = 0; i < 5; i++) {
    await t.vent(`document.querySelector('${KORT("p" + i)}')`);
    t.sjekk(await t.finnes('[data-h="vist"]:disabled'), "«Ferdig» skal være låst til kortet er sett");
    if (i === 0) {
      t.sjekk(await overDokken(t, `${KORT("p0")} .mappe-finger`), "Instruksen på kortet ligger bak knappen nederst");
      await t.bilde("gi-mobilen");
      const slipp = await t.hold(KORT("p0"), 650);
      const mottaker = await t.js(`document.querySelector('${KORT("p0")} [data-mottaker]').dataset.mottaker`);
      t.sjekk(mottaker === navn[m[0]], `Kortet til A viser ${mottaker}, men A skal gi til ${navn[m[0]]}`);
      const tekst = await t.tekst(`${KORT("p0")} .mappe-bakside`);
      t.sjekk(/250 kr/.test(tekst) && /Gavedag/.test(tekst), `Kortet viser ikke budsjett og dato: ${tekst.replace(/\s+/g, " ")}`);
      await t.bilde("kortet");
      await slipp();
    } else {
      if (i === 2) {
        // Reload in the middle of the round, then back + «Fortsett»
        await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
        await t.vent(`document.querySelector('${KORT("p2")}')`);
        await t.klikk("#tilbake");
        t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» midt i trekningen");
        await t.klikk('[data-h="fortsett"]');
        await t.vent(`document.querySelector('${KORT("p2")}')`);
      }
      const kort = await les(t, KORT("p" + i));
      t.sjekk(kort.mottaker === navn[m[i]], `Kortet til ${navn[i]} viser ${kort.mottaker}, ventet ${navn[m[i]]}`);
    }
    await t.vent("!document.querySelector('[data-h=\"vist\"]').disabled", 3000);
    await t.klikk('[data-h="vist"]');
  }

  // Everybody has drawn: the main button is «Ferdig – vi ses på gavedagen»; no reveal before the day
  await t.vent("document.querySelector('.skjerm-klar')");
  t.sjekk(/vi ses på gavedagen/.test(await t.tekst(".dokk .knapp")), "Hovedknappen er ikke «Ferdig – vi ses på gavedagen»");
  t.sjekk(/30 dager til gavedagen/.test(await t.tekst(".ni-nedtelling")), "Nedtellingen til gavedagen mangler");
  t.sjekk(!(await t.finnes('[data-h="til-kaaring"]')), "«Avslør nissekjeden» vises før gavedagen");
  await t.bilde("klar", true);
  // Forgot whom to give to: pick the name, hold the card
  await t.klikk('[data-h="glemt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="2"]');
  await t.vent(`document.querySelector('#ark:not([hidden]) ${KORT("glemt2")}')`);
  const glemt = await les(t, `#ark ${KORT("glemt2")}`);
  t.sjekk(glemt.mottaker === navn[m[2]], `«Glemt?» viste ${glemt.mottaker}, men C skal gi til ${navn[m[2]]}`);
  await t.klikk('#ark [data-h="lukk-ark"]');
  // Gift ideas for the budget
  await t.klikk('[data-h="ideer"]');
  await t.vent("document.querySelectorAll('#ni-ideer li').length === 3");
  t.sjekk(/250 kr/.test(await t.tekst("#ark-tittel")), "Gaveideene sier ikke budsjettet");
  const forste = await t.tekst("#ni-ideer");
  await t.klikk('#ark [data-h="ideer-nye"]');
  t.sjekk((await t.tekst("#ni-ideer")) !== forste, "«Tre nye» ga de samme ideene");
  await t.bilde("ideer");
  await t.klikk('#ark [data-h="lukk-ark"]');
  // «Ferdig» goes home; the draw is kept, with the countdown
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.skjerm-hjem')");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Trekningen ble ikke tatt vare på etter «Ferdig»");
  t.sjekk(/30 dager til gavedagen/.test(await t.tekst(".ni-nedtelling")), "Hjem-skjermen viser ikke nedtellingen");
  await t.bilde("hjem-nedtelling");

  // ---------- The gift day: the reveal ----------
  await endreSpill(t, "(sp) => { const d = new Date(); sp.dato = (d.getMonth() + 1) * 32 + d.getDate(); }");
  if (!(await t.finnes(".skjerm-klar"))) await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.skjerm-klar')");
  t.sjekk(/Gavedag i dag/.test(await t.tekst(".ni-nedtelling")), "Gavedagen vises ikke som i dag");
  await t.klikk('[data-h="til-kaaring"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"nei\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).skjerm === "klar", "«Ikke ennå» avslørte likevel");
  await t.klikk('[data-h="til-kaaring"]');
  await ja(t);
  await t.vent("document.querySelector('.skjerm-kaaring .ni-sporsmal')");
  await t.bilde("kaaring-start");
  const giver = m.indexOf(0);
  await t.klikk('[data-h="avslor"]');
  await t.vent("document.querySelectorAll('.ni-kjede li').length === 1", 4000);
  const linje = (await t.tekst(".ni-kjede li")).replace(/\s+/g, " ");
  t.sjekk(linje.includes(`${navn[giver]} var nissen til ${navn[0]}`) || linje.includes("x-q"), `Feil avsløring: «${linje}» (nissen til A er ${navn[giver]})`);
  await t.klikk('[data-h="avslor"]');
  await t.vent("document.querySelectorAll('.ni-kjede li').length === 2", 4000);
  await t.bilde("kaaring-to");
  await t.klikk('[data-h="vis-alle"]');
  await t.vent("document.querySelector('[data-h=\"arets\"]')");
  t.sjekk((await t.antall(".ni-kjede li")) === 5, "Nissekjeden viser ikke alle fem");
  await t.klikk('[data-h="arets"][data-v="3"]');
  t.sjekk(/vinner!/.test(await t.tekst("#skjerm h1")), "Årets nisse vises ikke som vinner");
  t.sjekk(await t.finnes('.skjerm-kaaring a[href="/"]'), "Kåringen mangler «Alle spill»");
  await t.bilde("kaaring", true);
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "En ferdig trekning vises fortsatt som «Fortsett»");

  // ---------- Each on their own phone: one personal link per person ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="hver"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.ni-lenker')", 8000);
  sp = (await t.tilstand()).spill;
  const m2 = sp.mottaker;
  sjekkRing(t, m2, "Hver sin mobil");
  t.sjekk(m2[0] !== 1 && m2[1] !== 0, "Paret ble ikke respektert i «hver sin mobil»");
  t.sjekk((await t.antall(".ni-lenkerad")) === 5, "Delingslista har ikke én rad per person");
  t.sjekk(!(await t.finnes('[data-h="glemt"]')), "«Glemt? Slå opp» finnes fortsatt i «hver sin mobil»");
  // The host is told plainly that the draw lives on this phone only
  t.sjekk(/Send lenkene nå/.test(await t.tekst("#ni-varsel")) && /bare på denne mobilen/.test(await t.tekst("#ni-varsel")), "Delingsskjermen sier ikke at trekningen bare ligger på denne mobilen");
  t.sjekk(/Del lenken til/.test(await t.tekst(".dokk .knapp")), "Hovedknappen er ikke «Del lenken til …»");
  await t.bilde("del", true);
  // What is shared and copied is caught here (a headless browser has no share sheet or clipboard)
  await t.js(`(() => {
    window.__ut = [];
    const fang = (x) => { window.__ut.push(typeof x === "string" ? x : [x.text, x.url].join("\\n")); return Promise.resolve(); };
    Object.defineProperty(navigator, "clipboard", { value: { writeText: fang }, configurable: true });
    Object.defineProperty(navigator, "share", { value: fang, configurable: true });
  })()`);
  const sist = () => t.js("window.__ut[window.__ut.length - 1] || ''");
  // The main button shares the next link; the list shows what has been sent
  await t.klikk(".dokk .knapp");
  t.sjekk((await t.tilstand()).spill.sendt[0] === 1, "Lenken til A ble ikke merket som delt");
  const delt = await sist();
  t.sjekk(/^Hei, /.test(delt) && /#2[0-9A-Z]+$/.test(delt), `Det som deles, er ikke en hilsen og en lenke: ${delt}`);
  t.sjekk(!delt.includes(sp.navn[m2[0]]), "Meldingen som deles, røper hvem A skal gi til");
  t.sjekk(new RegExp(`Del lenken til ${sp.navn[1].replace(/[<>/]/g, ".")}`).test(await t.tekst(".dokk .knapp")) || sp.navn[1].includes("x-q"), "Hovedknappen gikk ikke videre til neste person");
  await t.klikk('.ni-lenkerad [data-h="kopier-en"][data-v="3"]');
  t.sjekk((await t.tilstand()).spill.sendt[3] === 2, "Lenken til D ble ikke merket som kopiert");
  // One person's sheet: QR code + «Del» and «Kopier»
  await t.klikk('[data-h="person"][data-v="2"]');
  await t.vent("document.querySelector('#ark:not([hidden]) .qr svg')");
  await t.bilde("person-ark");
  await t.klikk('#ark [data-h="lukk-ark"]');
  // Every person's link, as it is copied: one scrambled token that no name can be read off
  const lenker = [];
  for (let i = 0; i < 5; i++) {
    await t.klikk(`.ni-lenkerad [data-h="kopier-en"][data-v="${i}"]`);
    lenker.push(await sist());
  }
  const hashFor = (i) => String(lenker[i]).split("#")[1] || "";
  const adresse = await t.js("location.origin + location.pathname");
  lenker.forEach((lenke, i) => {
    t.sjekk(lenke.split("#")[0] === adresse && /^2[0-9A-HJKMNP-TV-Z]{21,223}$/.test(hashFor(i)), `Lenken til ${sp.navn[i]} er ikke ett kodeord: ${lenke}`);
    const lesbart = sp.navn.some((x) => x.split(/[^\p{L}\p{N}]+/u).some((ord) => ord.length > 2 && hashFor(i).toLowerCase().includes(ord.toLowerCase())));
    t.sjekk(!lesbart, `Et navn kan leses ut av lenken til ${sp.navn[i]}: ${lenke}`);
  });
  t.sjekk(new Set(lenker).size === 5, "To personer fikk samme lenke");
  // … and the links lie nowhere in the page
  t.sjekk(!(await t.finnes("[data-lenke]")), "Lenkene ligger i sidens HTML (data-lenke)");
  t.sjekk(!(await t.js(`${JSON.stringify(lenker.map((l) => String(l).split("#")[1] || "?"))}.some((x) => document.documentElement.innerHTML.includes(x))`)), "En lenke ligger i sidens HTML");
  // All sent: the main button is «Ferdig», and the notice says where the draw is kept
  t.sjekk(/vi ses på gavedagen/.test(await t.tekst(".dokk .knapp")), "Hovedknappen ble ikke «Ferdig» da alle lenkene var sendt");
  t.sjekk(/Alle lenkene er sendt/.test(await t.tekst("#ni-varsel")) && /bare på denne mobilen/.test(await t.tekst("#ni-varsel")), "Varselet sier ikke at alle lenkene er sendt");

  const [bredde, hoyde] = await t.js("[window.innerWidth, window.innerHeight]");
  const c2 = await startChrome({ bredde, hoyde });
  mkdirSync(BILDER, { recursive: true });
  let nr = 0;
  const bilde2 = async (navn) => {
    await c2.sov(350);
    const bred = await c2.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Sidelengs scrolling på gjestens «${navn}»`);
    const injisert = await c2.js(`document.querySelectorAll("x-q").length`);
    if (injisert) t.feil(`HTML-INJEKSJON på gjestens «${navn}»: et navn fra en lenke ble tolket som HTML (${injisert} element)`);
    await c2.skjermbilde(join(BILDER, `g${++nr}-${navn}.png`));
  };
  // The card kept on the guest's phone (whose it is)
  const kortet = () => c2.js(`((JSON.parse(localStorage.getItem("rusj.nissen.v1") || "{}") || {}).gjest || {}).navn || ""`);
  try {
    await c2.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await c2.js(`localStorage.setItem("rusj.felles", JSON.stringify({ lyd: false, navn: [], installTips: 2 }))`);
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${hashFor(3)}`, "document.querySelector('.skjerm-gjest')");
    t.sjekk((await c2.tekst("#skjerm h1")).includes(sp.navn[3]) || sp.navn[3].includes("x-q"), "Gjesten blir ikke hilst med navnet sitt");
    t.sjekk(await overDokken(c2, `${KORT("gjest")} .mappe-finger`), "Instruksen på gjestens kort ligger bak knappen nederst");
    await bilde2("kort-for");
    const g = await les(c2, KORT("gjest"));
    t.sjekk(g.mottaker === sp.navn[m2[3]], `Gjesten (D) ser ${g.mottaker}, men D skal gi til ${sp.navn[m2[3]]}`);
    await bilde2("kort-holdt");
    // The card stays on the phone: reload, and the home screen leads back to it
    await c2.lastSide(t.side, "document.querySelector('#skjerm h1')");
    if (await c2.finnes(".skjerm-hjem")) {
      t.sjekk(await c2.finnes('[data-h="til-gjest"]'), "Hjem-skjermen mangler veien tilbake til kortet");
      t.sjekk(/dager til gavedagen/.test(await c2.tekst(".ni-nedtelling")), "Gjestens hjem-skjerm viser ikke nedtellingen");
      await c2.klikk('[data-h="til-gjest"]');
    }
    await c2.vent("document.querySelector('.skjerm-gjest')");
    t.sjekk((await les(c2, KORT("gjest"))).mottaker === sp.navn[m2[3]], "Kortet viser noe annet etter omlasting");
    // Removing it from the phone, then opening the link again
    await c2.klikk('[data-h="forlat"]');
    await ja(c2);
    await c2.vent("document.querySelector('.skjerm-hjem')");
    t.sjekk(!(await c2.finnes('[data-h="til-gjest"]')), "Kortet ble ikke fjernet fra mobilen");
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${hashFor(3)}`, "document.querySelector('.skjerm-gjest')");
    t.sjekk((await les(c2, KORT("gjest"))).mottaker === sp.navn[m2[3]], "Lenken virket ikke igjen");
    // Another person's link on a phone that already has a card: it asks, and replaces nothing yet
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${hashFor(4)}`, "document.querySelector('.skjerm-nyttkort')");
    t.sjekk(/allerede et nissekort/.test(await c2.tekst("#skjerm h1")), "Mobilen spurte ikke før kortet ble byttet");
    t.sjekk((await kortet()) === sp.navn[3], "Kortet ble byttet før gjesten hadde svart");
    await bilde2("nyttkort");
    await c2.klikk('[data-h="behold-kort"]');
    await c2.vent("document.querySelector('.skjerm-gjest')");
    t.sjekk((await kortet()) === sp.navn[3] && (await les(c2, KORT("gjest"))).mottaker === sp.navn[m2[3]], "«Behold det gamle» byttet kortet likevel");
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${hashFor(4)}`, "document.querySelector('.skjerm-nyttkort')");
    await c2.klikk('[data-h="apne-nytt"]');
    await c2.vent("document.querySelector('.skjerm-gjest')");
    t.sjekk((await kortet()) === sp.navn[4] && (await les(c2, KORT("gjest"))).mottaker === sp.navn[m2[4]], "«Åpne det nye kortet» viste ikke kortet til E");
    // A link cut off by a chat app, and a link with readable names (the format from before the
    // launch), are refused kindly – and the card that is kept is left alone
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${hashFor(1).slice(0, -3)}`, "document.querySelector('.skjerm-lenkefeil')");
    t.sjekk(/virker ikke/.test(await c2.tekst("#skjerm h1")), "En avkuttet lenke ble ikke avvist");
    await bilde2("lenkefeil");
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#1/9EAT/7K2QX/200/1219/Testspiller_A/Testspiller_B`, "document.querySelector('.skjerm-lenkefeil')");
    t.sjekk(/virker ikke/.test(await c2.tekst("#skjerm h1")), "En lenke med lesbare navn ble ikke avvist");
    t.sjekk((await kortet()) === sp.navn[4], "En lenke som ikke virker, rørte kortet på mobilen");
    await c2.klikk('[data-h="hjem"]');
    await c2.vent("document.querySelector('.skjerm-hjem')");
    if (c2.feil.length) c2.feil.forEach((f) => t.feil(`Gjestens mobil: ${f}`));
  } finally {
    await c2.lukk();
  }

  // The host's phone has a draw of its own: a link opened here asks before it shows a card
  await t.lastSide(`${t.side}#${hashFor(1)}`, "document.querySelector('.skjerm-nyttkort')");
  t.sjekk(/trekning på denne mobilen/.test(await t.tekst("#skjerm h1")), "Vertens mobil spurte ikke før den åpnet et kort fra en lenke");
  t.sjekk((await t.tilstand()).gjest === null, "Et kort fra en lenke ble lagt på vertens mobil uten spørsmål");
  await t.bilde("vert-lenke");
  await t.klikk('[data-h="behold-kort"]');
  await t.vent("document.querySelector('.skjerm-hjem')");
  t.sjekk((await t.tilstand()).gjest === null && (await t.finnes('[data-h="fortsett"]')), "«Ikke nå» åpnet kortet eller mistet trekningen");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ni-lenker')");

  // The host is in the draw too: picks their own name once, then this phone shows only that card
  await t.klikk('[data-h="vert-gjest"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="0"]');
  await t.vent("document.querySelector('.skjerm-gjest')");
  const v = await les(t, KORT("gjest"));
  t.sjekk(v.mottaker === sp.navn[m2[0]], `Verten (A) ser ${v.mottaker}, ventet ${sp.navn[m2[0]]}`);
  await t.bilde("vert-kort");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ni-lenker')");
  await t.klikk('[data-h="vert-gjest"]');
  await t.vent("document.querySelector('.skjerm-gjest, #ark:not([hidden])')");
  t.sjekk(await t.finnes(".skjerm-gjest"), "Verten fikk velge et nytt navn etter å ha sett kortet sitt");
  t.sjekk((await les(t, KORT("gjest"))).mottaker === sp.navn[m2[0]], "Verten fikk se et annet kort");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ni-lenker')");
  await t.klikk('[data-h="avslutt"]');
  await ja(t);
  await t.vent("document.querySelector('.skjerm-hjem')");
  t.sjekk((await t.tilstand()).spill === null, "«Avslutt» slettet ikke trekningen");
  t.sjekk(!klipte.length, `Innholdet er høyere enn kortet (blir kuttet): ${[...new Set(klipte)].join(", ")}`);
}
