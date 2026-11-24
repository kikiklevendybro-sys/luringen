// Flinkisen on one phone: three people set up (the children's pack, six categories, three rounds,
// 60 s), the phone draws a letter that the edition allows and shows the round's categories; a
// reload while everyone writes keeps the letter and the clock; «Stopp» gives ten seconds and then
// «Blyantene ned!»; the scoring goes category by category (nobody is left without points, «Forrige
// kategori», «Endre poengene»); the round's clock running out also ends the writing; back +
// «Fortsett» keeps the game; «Kåringen» has the winner, the podium and the evening's scoreboard;
// «Spill igjen» starts from zero; «Avslutt» with and without a finished round. The home screen
// fits 390 × 664 with its three buttons and the fact chips.
// (The game on the net – a phone each, typed answers – is test/nett/flinkisen.mjs.)
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

function bildemappe(id) {
  const i = process.argv.indexOf("--bilder");
  const rot = i > 0 ? resolve(process.argv[i + 1]) : join(tmpdir(), "rusj-e2e");
  const mappe = join(rot, id);
  mkdirSync(mappe, { recursive: true });
  return mappe;
}
const flaggTall = (navn, standard) => {
  const i = process.argv.indexOf(navn);
  return (i > 0 && Number(process.argv[i + 1])) || standard;
};
const MOBIL = { width: flaggTall("--bredde", 390), height: flaggTall("--hoyde", 844), deviceScaleFactor: 2, mobile: true };
const LIGGENDE = MOBIL.width > MOBIL.height;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const fase = (f) => t.vent(`Rusj.S.spill && Rusj.S.spill.r && Rusj.S.spill.r.fase === ${JSON.stringify(f)}`, 10000);
  // Give every player points in the category on the screen, then go on.
  const gi = async (poeng) => {
    for (let i = 0; i < poeng.length; i++) await t.klikk(`[data-h="poeng"][data-v="${i}:${poeng[i]}"]`, 60);
    await t.klikk('[data-h="kat-neste"]', 350);
  };
  // A whole round's scoring: the same points in every category.
  const domRunde = async (poeng, antallKat) => {
    for (let k = 0; k < antallKat; k++) await gi(poeng);
    await t.vent("Rusj.S.skjerm === 'stilling'");
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk((await t.finnes('.knapp[data-h="nytt"]')) && (await t.finnes('[data-h="nett-apne"]')) && (await t.finnes('[data-h="regler"]')), "Hjem mangler en av de tre knappene (start, på nett, regler)");
  t.sjekk((await t.antall(".merker li")) === 3, "Hjem har ikke tre merker");
  await t.bilde("hjem");
  if (!LIGGENDE) {
    // A phone in the browser (390 × 664): the three buttons and the fact chips fit the first screen
    await t.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 2, mobile: true });
    await t.sov(400);
    const bunn = await t.js(`Math.round(document.querySelector(".merker li:last-child").getBoundingClientRect().bottom)`);
    t.sjekk(bunn <= 664, `Hjem-skjermen får ikke plass på 390×664 (merkene slutter på ${bunn} px)`);
    await t.skjermbilde(join(bildemappe(t.id), "hjem-390x664.png"));
    await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
    await t.sov(300);
  }

  // ----- Setup -----
  await t.klikk('[data-h="nytt"]', 450);
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  t.sjekk((await t.antall("#spillerboks input[data-navn]")) === 3, "Tre spillere er ikke ført opp");
  t.sjekk((await t.antall('[data-h="pakke"]')) === 4, "Det er ikke fire pakker å velge mellom");
  await t.klikk('[data-h="pakke"][data-v="barn"]', 200);
  await t.klikk('[data-h="kat"][data-v="6"]', 200);
  await t.klikk('[data-h="runder"][data-v="3"]', 200);
  await t.klikk('[data-h="tid"][data-v="60"]', 200);
  const harEkstra = await t.js("window.RusjFlinkisen.harEkstra(Rusj.sprak)");
  t.sjekk((await t.finnes('[data-h="ekstra"]')) === harEkstra, "Bryteren for Æ, Ø og Å finnes i feil utgave");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]', 600);
  await t.vent("Rusj.S.skjerm === 'klar'");

  // ----- Round 1: the categories, the letter, the clock -----
  let s = await sp();
  const lov = await t.js("window.RusjFlinkisen.bokstaver(Rusj.sprak, false)");
  t.sjekk(s.antall === 3 && s.runder === 3 && s.kat === 6 && s.tid === 60 && s.pakke === "barn", `Oppsettet kom ikke med i spillet: ${JSON.stringify([s.antall, s.runder, s.kat, s.tid, s.pakke])}`);
  t.sjekk(s.bokstaver.length === 3 && new Set(s.bokstaver).size === 3 && s.bokstaver.every((b) => lov.includes(b)), `Bokstavene er ikke tre ulike av de tillatte: ${s.bokstaver}`);
  t.sjekk(s.r.k.length === 6 && new Set(s.r.k).size === 6, "Runden har ikke seks ulike kategorier");
  t.sjekk((await t.antall(".fl-kat li")) === 6, "Kategoriene vises ikke før bokstaven trekkes");
  t.sjekk(await t.friForDokk(".fl-kat li:last-child"), "Siste kategori er skjult bak knappene");
  await t.bilde("klar");
  await t.klikk('[data-h="trekk"]', 300);
  await fase("skriv");
  await t.sov(500);
  s = await sp();
  t.sjekk((await t.tekst(".fl-bokstav")).trim() === s.r.b, `Flisa viser «${await t.tekst(".fl-bokstav")}», bokstaven er ${s.r.b}`);
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")) === `Alt på ${s.r.b}`, `Overskriften: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes("#fl-tid .timer-tid"), "Rundens klokke vises ikke");
  t.sjekk(await t.friForDokk(".fl-kat li:last-child"), "Siste kategori er skjult bak «Stopp!»");
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet regnes ikke som pågående (pagar)");
  await t.bilde("skriver");

  // A reload while everyone writes: the same letter, the clock goes on from where it was
  await t.sov(2200);
  await t.lastSide(t.side, "document.querySelector('.fl-bokstav')");
  await t.sov(400);
  const etter = await sp();
  t.sjekk((await t.js("Rusj.S.skjerm")) === "skriv" && etter.r.b === s.r.b && etter.r.fase === "skriv", "Omlasting midt i runden ga ikke samme bokstav og skrivefase");
  t.sjekk(etter.r.igjen < 60 && etter.r.igjen >= 50, `Klokka fortsatte ikke der den var etter omlasting (${etter.r.igjen} s)`);

  // «Stopp»: ten seconds for the others, then pens down
  await t.klikk('[data-h="stopp"]', 400);
  s = await sp();
  t.sjekk(s.r.fase === "stopp" && (await t.finnes("#fl-ned .timer-tid")) && !(await t.finnes("#fl-tid")), "«Stopp» ga ikke ti sekunders nedtelling");
  t.sjekk(Number(await t.tekst("#fl-ned .timer-tid")) >= 9, `Nedtellingen starter ikke på ti (${await t.tekst("#fl-ned .timer-tid")})`);
  t.sjekk(!t.norsk || /Stopp!/.test(await t.tekst("#skjerm h1")), "Skjermen sier ikke «Stopp!»");
  await t.bilde("stopp");
  // (the test does not wait ten seconds: the clock is moved to its last second)
  await t.js(`(() => { const k = Rusj.timer("fl-ned"); k.slutt = performance.now() + 700; })()`);
  await fase("dom");
  await t.vent("Rusj.S.skjerm === 'dom'", 8000);

  // ----- Scoring: category by category -----
  t.sjekk((await t.antall(".fl-poengrader li")) === 3 && (await t.antall('[data-h="poeng"]')) === 9, "Poengskjermen har ikke 0, 5 og 10 for hver av de tre");
  await t.klikk('[data-h="kat-neste"]', 300);
  s = await sp();
  t.sjekk(s.r.nr === 0 && s.r.mangler === true && (await t.antall(".fl-poengrader li.mangler")) === 3, "Man kom videre uten å gi poeng (eller radene ble ikke merket)");
  await t.bilde("dom-mangler");
  await gi([10, 5, 5]);
  s = await sp();
  t.sjekk(s.r.nr === 1 && s.r.score[0][0] === 10 && s.r.score[1][0] === 5, "Poengene for første kategori ble ikke lagret");
  await gi([0, 10, 10]);
  await t.klikk('[data-h="kat-forrige"]', 350);
  s = await sp();
  t.sjekk(s.r.nr === 1 && (await t.js(`document.querySelector('[data-h="poeng"][data-v="1:10"]').getAttribute("aria-pressed")`)) === "true", "«Forrige kategori» viser ikke poengene som ble gitt");
  await t.bilde("dom");
  // (Three players fit above the buttons; on a phone on its side the list scrolls beside them.)
  t.sjekk(await t.friForDokk(LIGGENDE ? ".fl-poengrader li:first-child" : ".fl-poengrader li:last-child"), "Spillerne er skjult bak knappene på poengskjermen");
  await t.klikk('[data-h="kat-neste"]', 350);
  for (let k = 2; k < 6; k++) await gi([10, 10, 0]);
  await t.vent("Rusj.S.skjerm === 'stilling'");
  s = await sp();
  t.sjekk(s.poeng.join() === "50,55,15" && s.r.fase === "ferdig" && s.spilt === 1, `Rundens poeng er feil: ${s.poeng}`);
  t.sjekk(!t.norsk || /Testspiller B leder!/.test(await t.tekst("#skjerm h1")), `Stillingen: «${await t.tekst("#skjerm h1")}»`);
  await t.bilde("stilling");

  // «Endre poengene»: back to the last category, and the sums follow
  await t.klikk('[data-h="endre-poeng"]', 400);
  s = await sp();
  t.sjekk(s.poeng.join() === "0,0,0" && s.r.fase === "dom" && s.r.nr === 5 && s.spilt === 0, "«Endre poengene» tok ikke rundens poeng tilbake");
  await t.klikk('[data-h="poeng"][data-v="2:10"]', 100);
  await t.klikk('[data-h="kat-neste"]', 400);
  s = await sp();
  t.sjekk(s.poeng.join() === "50,55,25", `Poengene etter endringen er feil: ${s.poeng}`);

  // Back + «Fortsett»
  await t.klikk("#tilbake", 400);
  t.sjekk(!t.norsk || /Fortsett · runde 1 av 3/.test(await t.tekst('[data-h="fortsett"]')), `Hjem sier ikke «Fortsett · runde 1 av 3»: «${await t.tekst('[data-h="fortsett"]')}»`);
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]', 400);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "stilling", "«Fortsett» gikk ikke tilbake til stillingen");

  // ----- Round 2: the round's own clock runs out -----
  await t.klikk('[data-h="neste-runde"]', 400);
  s = await sp();
  t.sjekk(s.runde === 1 && s.r.fase === "klar" && s.r.b === s.bokstaver[1], "Runde 2 startet ikke med neste bokstav");
  t.sjekk(new Set([...s.r.k, ...(await t.js("Rusj.S.spill.katRekke.slice(0, 6)"))]).size === 12, "Runde 2 har ikke seks nye kategorier");
  await t.klikk('[data-h="trekk"]', 300);
  await fase("skriv");
  await t.sov(300);
  await t.js(`(() => { const k = Rusj.timer("fl-tid"); k.slutt = performance.now() + 700; })()`);
  await fase("dom");
  await t.vent("Rusj.S.skjerm === 'dom'", 8000);
  await domRunde([5, 5, 10], 6);
  s = await sp();
  t.sjekk(s.poeng.join() === "80,85,85", `Poengene etter runde 2: ${s.poeng}`);
  t.sjekk(!t.norsk || /Testspiller B og Testspiller C leder!/.test(await t.tekst("#skjerm h1")), `Delt ledelse: «${await t.tekst("#skjerm h1")}»`);

  // ----- Round 3 and «Kåringen» -----
  await t.klikk('[data-h="neste-runde"]', 400);
  await t.klikk('[data-h="trekk"]', 300);
  await fase("skriv");
  await t.klikk('[data-h="stopp"]', 300);
  await t.klikk('[data-h="ferdige"]', 500);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "dom", "«Alle er ferdige» gikk ikke til poengene");
  await domRunde([10, 0, 5], 6);
  t.sjekk(!t.norsk || /Til kåringen/.test(await t.tekst('[data-h="neste-runde"]')), "Siste runde: knappen sier ikke «Til kåringen»");
  await t.klikk('[data-h="neste-runde"]', 700);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "slutt", "Kom ikke til kåringen");
  s = await sp();
  t.sjekk(s.ferdig && s.poeng.join() === "140,85,115", `Sluttpoengene: ${s.poeng}`);
  t.sjekk(!t.norsk || /Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), `Kåringen: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.finnes(".pall")) && (await t.antall(".poengliste li")) === 3, "Kåringen mangler pallen eller poenglista");
  const kveld = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("kveld"))}) || "null")`);
  t.sjekk(kveld && kveld.spill.length === 1 && kveld.spill[0].id === "flinkisen" && kveld.spill[0].resultat[0].plass === 1, "Kvelden fikk ikke resultatet");
  t.sjekk((await t.tilstand())._aktiv !== true, "Et ferdig spill regnes som pågående");
  t.sjekk((await t.js(`document.querySelector('.dokk a.lenke').getAttribute("href")`)) === t.forside, "«Alle spill» går ikke til utgavens forside");
  await t.bilde("karing", true);

  // «Spill igjen»: the same setup from zero
  await t.klikk('[data-h="igjen"]', 500);
  s = await sp();
  t.sjekk((await t.js("Rusj.S.skjerm")) === "klar" && s.runde === 0 && s.poeng.join() === "0,0,0" && s.pakke === "barn" && s.kat === 6, "«Spill igjen» startet ikke likt fra null");

  // «Avslutt» before any round is scored: the game is gone, nothing to rank
  await t.klikk('[data-h="avslutt"]', 400);
  await t.bilde("avslutt-ark");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]', 400);
  t.sjekk(!!(await sp()), "«Spill videre» kastet spillet");
  await t.klikk('[data-h="avslutt"]', 400);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 500);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem" && !(await sp()), "«Avslutt» uten poeng gikk ikke hjem uten spill");

  // The classic pack plays the same five every round; «Avslutt» after a round goes to «Kåringen»
  await t.klikk('[data-h="nytt"]', 450);
  await t.klikk('[data-h="pakke"][data-v="klassisk"]', 200);
  await t.klikk('[data-h="kat"][data-v="5"]', 200);
  await t.klikk('[data-h="tid"][data-v="0"]', 200);
  await t.klikk('[data-h="start"]', 600);
  s = await sp();
  t.sjekk(s.r.k.join() === "0,1,2,3,4" && s.tid === 0, `Klassisk har ikke de fem faste kategoriene: ${s.r.k}`);
  await t.klikk('[data-h="trekk"]', 300);
  await fase("skriv");
  await t.sov(300);
  t.sjekk(!(await t.finnes("#fl-tid")), "Klokka vises selv om runden er uten tid");
  await t.bilde("skriver-uten-klokke");
  await t.klikk('[data-h="stopp"]', 300);
  await t.klikk('[data-h="ferdige"]', 500);
  await domRunde([10, 5, 5], 5);
  await t.klikk('[data-h="neste-runde"]', 400);
  s = await sp();
  t.sjekk(s.r.k.join() === "0,1,2,3,4" && s.runde === 1, "Klassisk byttet kategorier i runde 2");
  await t.klikk('[data-h="avslutt"]', 400);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 600);
  s = await sp();
  t.sjekk((await t.js("Rusj.S.skjerm")) === "slutt" && s.ferdig && s.spilt === 1 && s.poeng.join() === "50,25,25", "«Avslutt» etter én runde ga ikke kåring med rundens poeng");
  t.sjekk(!t.norsk || /Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), `Kåringen etter «Avslutt»: «${await t.tekst("#skjerm h1")}»`);

  // A damaged save: the home screen, never a blank page
  await t.js(`localStorage.setItem(${JSON.stringify(t.nokkel("flinkisen.v1"))}, JSON.stringify({ skjerm: "dom", _tid: Date.now(), antall: 3, oppsett: { pakke: "finnes-ikke", runder: 99 }, spill: { modus: "en", antall: 3, pakke: "barn", runder: 3, kat: 6, tid: 0, runde: 0, poeng: [0, 0], r: { fase: "dom" } } }))`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem" && !(await sp()) && (await t.tilstand()).oppsett.runder === 5, "Et ødelagt lagret spill ga ikke hjem-skjermen med standardoppsett");
}
