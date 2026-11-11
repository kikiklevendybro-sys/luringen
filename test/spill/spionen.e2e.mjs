// Spionen: one phone (pass around, accuse the spy + last guess, voluntary guess, accuse an innocent,
// time runs out), reload and back + continue, a 320 px check, and then "each on their own phone":
// a second, separate browser joins with the code and must see the same place, roles and spies as
// the host, seat by seat, in round 1 and round 2.
import { startChrome } from "../chrome.mjs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const KORT = (id) => `.mappe[data-mappe="${id}"]`;

// Where the runner saves screenshots (for the second browser's pictures).
const argBilder = process.argv.indexOf("--bilder");
const BILDER = join(resolve(argBilder > 0 ? process.argv[argBilder + 1] : join(tmpdir(), "rusj-e2e")), "spionen");

// What every seat should see, worked out from the host's saved round and the page's own data.
function forventet(t, r) {
  return t.js(`(() => {
    const steder = window.RUSJ_DATA.steder.pakker.flatMap((p) => p.steder);
    const r = ${JSON.stringify(r)};
    const s = steder[r.sted];
    return r.roller.map((k, i) => (r.spioner.includes(i) ? { spion: true } : { spion: false, sted: s.navn, rolle: s.roller[k % s.roller.length] }));
  })()`);
}

// Place names carry soft hyphens (U+00AD) so long compounds break nicely; ignore them when comparing.
const ren = (tekst) => String(tekst).replace(/\u00ad/g, "");

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
async function les(c, sel) {
  const slipp = await c.hold(sel, 650);
  const tekst = await c.tekst(`${sel} .mappe-bakside`);
  if (await erKlipt(c, sel)) klipte.push(sel);
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

async function stedsnavn(t, i) {
  return t.js(`window.RUSJ_DATA.steder.pakker.flatMap((p) => p.steder)[${i}].navn`);
}

async function ja(t) {
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"ja\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
}

async function smal(t, navn) {
  const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(bred <= 0, `Sidelengs scrolling på «${navn}» ved 320 px: ${bred}px for bred`);
  await t.bilde(navn);
}

export default async function (t) {
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk(await t.finnes('[data-h="spioner"][data-v="2"]:disabled'), "2 spioner skal være låst med 4 spillere");
  await t.klikk('[data-h="pakke"][data-v="fantasi"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.includes("fantasi"), "Fantasi-pakken ble ikke valgt");
  await t.klikk('[data-h="tid"][data-v="5"]');

  // ---------- One phone ----------
  await t.klikk('[data-h="start"]');
  let tekster = await sendRundt(t, true);
  let r = await sjekkRundt(t, tekster);
  await t.bilde("runde");
  t.sjekk(/spør først/.test(await t.tekst(".sp-starter")), "Viser ikke hvem som spør først");

  await t.klikk('[data-h="steder"]');
  await t.vent("document.querySelector('#ark:not([hidden]) .sp-sted')");
  const navnSted = await stedsnavn(t, r.sted);
  t.sjekk(ren(await t.tekst("#ark")).includes(ren(navnSted)), "Stedet mangler i stedslista");
  await t.bilde("steder");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="ide"]');
  await t.vent("document.querySelector('#ark:not([hidden]) .sp-ide')");
  await t.bilde("sporsmal");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Pause and +1 min
  await t.klikk('[data-h="pause"]');
  t.sjekk((await t.tilstand()).spill.klokke.gaar === false, "Pause stoppet ikke klokka");
  await t.klikk('[data-h="pause"]');
  await t.klikk('[data-h="pluss-min"]');
  t.sjekk((await t.tilstand()).spill.klokke.total === 360, "+1 min ble ikke lagt til");

  // Reload mid-round: same screen, the clock keeps its time
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.skjerm-runde #klokke')");
  const tid = await t.tekst("#klokke .timer-tid");
  t.sjekk(/^[56]:\d\d$/.test(tid), `Klokka etter omlasting viser ${tid}`);

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
  await t.bilde("gjett");
  const feilSted = await t.js(`Number(Array.from(document.querySelectorAll('[data-h="gjett-sted"]')).map((b) => b.dataset.v).find((v) => Number(v) !== ${r.sted}))`);
  await t.klikk(`[data-h="gjett-sted"][data-v="${feilSted}"]`);
  await ja(t);
  await t.vent("document.querySelector('.skjerm-svar .stempel')", 6000);
  await t.bilde("svar-feil");
  await t.klikk('[data-h="se-poeng"]');
  await t.vent("document.querySelector('.skjerm-resultat .poengliste')");
  await t.bilde("resultat", true);
  let s = await t.tilstand();
  t.sjekk(s.spill.poeng.every((p, i) => p === (i === spion ? 0 : 1)), `Feil poeng etter at spionen ble tatt: ${s.spill.poeng}`);
  t.sjekk(/tok spionen/.test(await t.tekst("#skjerm h1")), "Resultatet sier ikke at dere tok spionen");

  // Narrow phone (320 px) with the longest possible name
  const [bredde, hoyde] = await t.js("[window.innerWidth, window.innerHeight]");
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  await t.js(`(() => { const f = JSON.parse(localStorage.getItem("rusj.felles")); f.navn[0] = "Testspillerlanga"; localStorage.setItem("rusj.felles", JSON.stringify(f)); })()`);
  await t.lastSide(t.side, "document.querySelector('.skjerm-resultat')");
  await smal(t, "320-resultat");

  // Round 2: the spy reveals themself and guesses right → spy +2
  await t.klikk('[data-h="ny-runde"]');
  await t.vent(`document.querySelector('${KORT("p0")}')`);
  await smal(t, "320-gi-mobilen");
  tekster = await sendRundt(t, false);
  r = await sjekkRundt(t, tekster);
  await smal(t, "320-runde");
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });
  await t.klikk('[data-h="spion-gjetter"]');
  await ja(t);
  await t.klikk(`[data-h="gjett-sted"][data-v="${r.sted}"]`);
  await ja(t);
  await t.vent("document.querySelector('.skjerm-svar .stempel')", 6000);
  await t.klikk('[data-h="se-poeng"]');
  await t.vent("document.querySelector('.skjerm-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.utfall.spionVant && s.spill.utfall.pluss[r.spioner[0]] === 2, "Spionen fikk ikke 2 poeng for riktig gjetning");

  // Round 3 (with «back» during «3 2 1 SPØR!»): accuse an innocent → spy escapes
  await t.klikk('[data-h="ny-runde"]');
  await sendRundt(t, false, { tilbakeUnderNedtelling: true });
  r = (await t.tilstand()).spill.r;
  const uskyldig = [0, 1, 2, 3].find((i) => !r.spioner.includes(i));
  await t.klikk('[data-h="anklag"]');
  await t.klikk(`[data-h="anklaget"][data-v="${uskyldig}"]`);
  await t.klikk('[data-h="avslor"]');
  await t.vent("document.querySelector('.stempel')", 6000);
  await t.bilde("avslort-uskyldig");
  await t.klikk('[data-h="uskyldig"]');
  await t.vent("document.querySelector('.skjerm-resultat')");
  t.sjekk((await t.tilstand()).spill.utfall.pluss[r.spioner[0]] === 2, "Spionen fikk ikke 2 poeng da en uskyldig ble anklaget");
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

  // Round 4: the clock runs out. «+1 min» cancels the jump to the accusation; a reload after the
  // time is up doesn't jump by itself; running out while watching opens the accusation.
  await t.klikk('[data-h="ny-runde"]');
  await sendRundt(t, false);
  const settSlutt = (ms) =>
    t.js(`(() => { const k = "rusj.spionen.v1"; const s = JSON.parse(localStorage.getItem(k)); s.spill.klokke.slutt = Date.now() + ${ms}; s.spill.klokke.gaar = true; s.spill.tidUte = false; localStorage.setItem(k, JSON.stringify(s)); })()`);
  await settSlutt(2000);
  await t.lastSide(t.side, "document.querySelector('.skjerm-runde')");
  await t.vent("document.querySelector('.skjerm-runde .sp-tid-ute')", 8000);
  await t.bilde("tiden-ute-runde");
  await t.klikk('[data-h="pluss-min"]');
  await t.sov(3500);
  s = await t.tilstand();
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
  await ja(t);
  await t.vent("document.querySelector('.skjerm-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.utfall.grunn === "uenige" && s.spill.runde === 4, "Tiden ute + uenige ga feil utfall");
  // «Avslutt» (with a question first) → the end: who wins, podium and scoreboard
  await t.klikk('[data-h="avslutt"]');
  await ja(t);
  await t.vent("document.querySelector('.skjerm-slutt .poengliste')");
  t.sjekk(/vinner!/.test(await t.tekst("#skjerm h1")), "Sluttskjermen viser ikke hvem som vinner");
  t.sjekk(await t.finnes('.skjerm-slutt a[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Et ferdig spill vises fortsatt som «Fortsett»");

  // ---------- Each on their own phone ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="hver"]');
  for (let i = 0; i < 3; i++) await t.klikk('[data-h="spiller-legg-til"]', 40);
  await t.klikk('[data-h="spioner"][data-v="2"]');
  t.sjekk((await t.tilstand()).oppsett.spioner === 2, "Fikk ikke valgt 2 spioner med 7 spillere");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#spillkode')");
  s = await t.tilstand();
  const kode = s.spill.kode;
  t.sjekk(kode.length === 9, `Koden skal ha 9 tegn (to kontrolltegn), har ${kode.length}`);
  t.sjekk((await t.tekst("#spillkode")).replace(/\s/g, "") === kode, "Koden på skjermen stemmer ikke med spillet");
  t.sjekk(await t.finnes(".qr svg"), "QR-koden mangler");
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

  const c2 = await startChrome({ bredde, hoyde });
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
    await c2.js(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("rusj.spionen.v")) localStorage.removeItem(k); })()`);
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${kode}_${runde}`, "document.querySelector('.skjerm-plass')");
  };
  // Every seat, compared with the host's round.
  const sjekkAlleSeter = async (forv, runde) => {
    let spioner = 0;
    for (let i = 0; i < forv.length; i++) {
      await nyMobil(runde);
      await c2.klikk(`[data-h="gjest-plass"][data-v="${i}"]`);
      await c2.vent(`document.querySelector('${KORT("gjest")}')`);
      t.sjekk((await c2.tekst("#skjerm h1")).includes(`nr. ${i + 1}`), `Gjesten ser ikke «Du er nr. ${i + 1}»`);
      const tekst = await les(c2, KORT("gjest"));
      if (/Spionen/.test(tekst)) spioner += 1;
      sjekkKort(t, tekst, forv[i], `Gjest nr. ${i + 1} i runde ${runde}`);
      // Cheating check: after seeing the card, the seat can't be changed (not even by rejoining).
      t.sjekk(!(await c2.finnes('[data-h="bytt-plass"]')), "«Bytt nummer» finnes etter at kortet er sett");
      await c2.klikk("#tilbake");
      await c2.lastSide("about:blank");
      await c2.lastSide(`${t.side}#${kode}_${runde}`, "document.querySelector('.skjerm-gjest, .skjerm-plass')");
      t.sjekk(await c2.finnes(".skjerm-gjest"), "Samme kode på nytt slapp gjesten til å velge nytt nummer");
      t.sjekk((await c2.tekst("#skjerm h1")).includes(`nr. ${i + 1}`), "Samme kode på nytt ga et annet nummer");
    }
    t.sjekk(spioner === 2, `Ventet 2 spionkort i runde ${runde}, fikk ${spioner}`);
  };
  try {
    await c2.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await c2.js(`localStorage.setItem("rusj.felles", JSON.stringify({ lyd: false, navn: [] }))`);
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${kode}`, "document.querySelector('.skjerm-plass')");
    await bilde2("plass");
    await sjekkAlleSeter(f, 1);
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

    // The host plays round 1 to the end and starts round 2
    await t.vent("!document.querySelector('[data-h=\"start-klokka\"]').disabled");
    await t.klikk('[data-h="start-klokka"]');
    await t.vent("document.querySelector('.skjerm-runde #klokke')", 8000);
    await t.klikk('[data-h="anklag"]');
    await t.klikk('[data-h="anklaget"][data-v="0"]');
    await t.klikk('[data-h="avslor"]');
    await t.vent("document.querySelector('.stempel')", 6000);
    await t.klikk('[data-h="til-gjett"], [data-h="uskyldig"]');
    if (await t.finnes('[data-h="gjett-sted"]')) {
      await t.klikk('[data-h="gjett-sted"]');
      await ja(t);
      await t.vent("document.querySelector('[data-h=\"se-poeng\"]')", 6000);
      await t.klikk('[data-h="se-poeng"]');
    }
    await t.vent("document.querySelector('.skjerm-resultat')");
    await t.klikk('[data-h="ny-runde"]');
    await t.vent("document.querySelector('.skjerm-vert')");
    t.sjekk(/Runde 2/.test(await t.tekst("#skjerm h1")), "Verten viser ikke runde 2");
    f = await forventet(t, (await t.tilstand()).spill.r);

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
    await c2.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"ja\"]')");
    await c2.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
    await c2.vent("/Runde 2/i.test(document.querySelector('#topp-tittel').textContent)");
    await bilde2("runde-2");
    await c2.lastSide(t.side, "document.querySelector('.skjerm-gjest')");
    t.sjekk(/Runde 2/i.test(await c2.tekst("#topp-tittel")), "Gjesten er ikke i runde 2 etter omlasting");
    await sjekkAlleSeter(f, 2);
    t.feil && c2.feil.forEach((m) => t.feil(`Gjestens mobil: ${m}`));
  } finally {
    await c2.lukk();
  }
  t.sjekk(!klipte.length, `Innholdet er høyere enn kortet (blir kuttet): ${[...new Set(klipte)].join(", ")}`);
}
