// Bonden: two players on 3 × 3 (a win, undo of the winning mark, the win again), a new round
// where the other player starts, a draw, reload and back + continue; then five in a row on the
// big board; then against the phone: Uslåelig never loses and blocks, the five-in-a-row phone
// blocks a four, and «Avslutt» leads to «Kåringen». Everything must fit on small phones.
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

async function storrelse(t, navn, bredde, hoyde, mobil = true) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: mobil ? 2 : 1, mobile: mobil });
  await t.sov(500);
  await t.js("window.scrollTo(0, 0)");
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const mal = await t.js(`(() => {
    const b = document.querySelector('.bo-brett').getBoundingClientRect();
    return { bredde: Math.round(b.width), scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px på ${bredde}×${hoyde} («${navn}»)`);
  t.sjekk(mal.bredde >= 220, `Brettet er bare ${mal.bredde}px på ${bredde}×${hoyde}`);
  await t.skjermbilde(join(bildemappe(t.id), `str-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

export default async function (t) {
  const merk = async (i, ms = 260) => t.klikk(`.bo-celle[data-v="${i}"]`, ms);
  const spill = async () => (await t.tilstand()).spill;

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.bilde("oppsett-to", true);
  await t.js("Rusj.S.nesteStarter = 0"); // who opens round 1 alternates; the test wants player 1
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.bo-celle').length === 9");
  await t.sov(700);
  await t.bilde("start");
  t.sjekk((await t.tilstand())._aktiv === true, "En pågående kamp er ikke merket som aktiv");

  // Testspiller A (kryss) gets the top row
  for (const i of [0, 3, 1, 4]) await merk(i);
  await t.bilde("to-pa-rad");
  await merk(2, 1200);
  let sp = await spill();
  t.sjekk(sp.resultat && sp.resultat.vinner === 0 && sp.poeng[0] === 1, "Tre på rad ga ikke seier og poeng");
  t.sjekk(await t.finnes(".bo-strek path"), "Vinnerstreken tegnes ikke");
  t.sjekk(/Testspiller A vinner/.test(await t.tekst(".bo-melding")), "Meldingen sier ikke hvem som vant");
  await t.bilde("vinner");

  // Undo the winning mark; the point goes. Then win again.
  await t.klikk('[data-h="angre"]', 300);
  sp = await spill();
  t.sjekk(!sp.resultat && sp.poeng[0] === 0 && sp.trekk.length === 4, "«Angre» tok ikke tilbake vinnermerket og poenget");
  await merk(2, 900);
  t.sjekk((await spill()).poeng[0] === 1, "Seieren ble ikke telt på nytt");

  // New round: Testspiller B (bolle) starts; a draw
  await t.klikk('[data-h="runde"]', 700);
  sp = await spill();
  t.sjekk(sp.runde === 2 && sp.starter === 1 && sp.trekk.length === 0, "Ny runde startet ikke med den andre spilleren");
  t.sjekk(/Testspiller B begynner/.test(await t.tekst(".bo-melding")), "Meldingen sier ikke at Testspiller B begynner");
  for (const i of [0, 1, 2, 4, 3]) await merk(i);
  // Reload and back + continue keep the round
  await t.lastSide(t.side, "document.querySelectorAll('.bo-celle').length === 9");
  t.sjekk((await spill()).trekk.length === 5 && (await t.antall(".bo-celle .bo-merke")) === 5, "Runden ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens kampen pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.bo-celle').length === 9");
  await merk(3, 150);
  t.sjekk((await spill()).trekk.length === 5, "En opptatt rute tok imot et merke");
  for (const i of [5, 7, 6, 8]) await merk(i);
  await t.sov(600);
  sp = await spill();
  t.sjekk(sp.resultat && sp.resultat.vinner === null && sp.uavgjort === 1, "Fullt brett uten tre på rad ga ikke uavgjort");
  await t.bilde("uavgjort");

  // «Først til 3» (the default): the third won round leads to «Kåringen» by itself
  t.sjekk(sp.mal === 3, "«Først til 3» er ikke standard");
  await lastMed(t, `(S) => { S.spill.poeng = [2, 0]; S.spill.trekk = [0, 3, 1, 4]; S.spill.starter = 0; S.spill.resultat = null; }`);
  await merk(2, 700);
  t.sjekk(await t.finnes('.dokk [data-h="kaaring"]'), "Mangler «Se kåringen» når kampen er avgjort");
  await t.bilde("kamp-vunnet");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  t.sjekk((await spill()).poeng[0] === 3, "Automatisk kåring etter tre seirer virket ikke");
  t.sjekk(/Testspiller A vinner/.test(await t.tekst("#skjerm h1")), `Kåringen viser feil vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  await t.bilde("kaaringen", true);
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="variant"][data-v="fem"]');
  await t.klikk('[data-h="mal"][data-v="0"]');
  await t.js("Rusj.S.nesteStarter = 0"); // who opens round 1 alternates; the test wants player 1
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.bo-celle').length === 100");
  // Small cells: a real finger tap first shows a faint mark, the second tap draws it
  await t.trykk('.bo-celle[data-v="22"]');
  t.sjekk(await t.finnes('.bo-celle.forslag[data-v="22"]') && (await spill()).trekk.length === 0, "Første trykk på en liten rute skal bare vise et svakt merke");
  await t.trykk('.bo-celle[data-v="22"]');
  t.sjekk((await spill()).trekk[0] === 22, "Andre trykk tegnet ikke merket");
  await t.klikk('[data-h="angre"]', 300);
  for (const [a, b] of [[44, 0], [45, 1], [46, 2], [47, 3]]) {
    await merk(a, 120);
    await merk(b, 120);
  }
  await t.bilde("fem-fire");
  await merk(48, 1100);
  sp = await spill();
  t.sjekk(sp.resultat && sp.resultat.vinner === 0 && sp.resultat.celler.length === 5, "Fem på rad ga ikke seier");
  await t.bilde("fem-vinner");
  await storrelse(t, "fem", 375, 560);
  await storrelse(t, "fem", 320, 568);

  // Against the phone: Uslåelig on 3 × 3 never loses, whatever you do
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="variant"][data-v="tre"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.bilde("oppsett-uslaelig", true);
  await t.js("Rusj.S.nesteStarter = 0"); // who opens round 1 alternates; the test wants player 1
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.bo-celle').length === 9");
  for (let n = 0; n < 5; n++) {
    sp = await spill();
    if (sp.resultat) break;
    const fri = await t.js("Array.from(document.querySelectorAll('.bo-celle')).findIndex(b => !b.querySelector('.bo-merke'))");
    await merk([4, 0, 8, 2, 6][n] !== undefined && !(await t.js(`!!document.querySelector('.bo-celle[data-v="${[4, 0, 8, 2, 6][n]}"] .bo-merke')`)) ? [4, 0, 8, 2, 6][n] : fri, 100);
    await t.vent("Rusj.S.spill.resultat || Rusj.S.spill.trekk.length % 2 === 0", 4000);
    await t.sov(150);
  }
  await t.vent("Rusj.S.spill.resultat", 4000);
  sp = await spill();
  t.sjekk(sp.resultat.vinner !== 0, "Uslåelig tapte");
  await t.sov(500);
  await t.bilde("mot-uslaelig");

  // It blocks: kryss on 0 and 1, the phone must take 2
  await lastMed(t, `(S) => { S.spill.trekk = [0, 4, 1]; S.spill.starter = 0; S.spill.resultat = null; }`);
  await t.vent("Rusj.S.spill.trekk.length === 4", 4000);
  t.sjekk((await spill()).trekk[3] === 2, `Mobilen blokkerte ikke (tegnet i ${(await spill()).trekk[3]})`);
  await t.klikk('[data-h="angre"]', 300);
  t.sjekk((await spill()).trekk.length === 2, "«Angre» mot mobilen skal ta tilbake to merker");
  await storrelse(t, "tre", 375, 560);
  await storrelse(t, "tre", 320, 568);

  // Five in a row against Vanskelig: it stops an open four at one of the ends
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="variant"][data-v="fem"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.js("Rusj.S.nesteStarter = 0"); // who opens round 1 alternates; the test wants player 1
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.bo-celle').length === 100");
  await merk(55, 100);
  await t.vent("Rusj.S.spill.trekk.length === 2", 4000);
  await lastMed(t, `(S) => { S.spill.trekk = [44, 0, 45, 9, 46, 90, 47]; S.spill.starter = 0; S.spill.resultat = null; }`);
  await t.vent("Rusj.S.spill.trekk.length === 8", 4000);
  const svar = (await spill()).trekk[7];
  t.sjekk(svar === 43 || svar === 48, `Mobilen stoppet ikke firer-rekka (tegnet i ${svar})`);
  await t.sov(500);
  await t.bilde("fem-mot-mobilen");

  // Leaving right after your move, while the phone thinks: no move on another screen
  const fri = await t.js("Array.from(document.querySelectorAll('.bo-celle')).find(b => !b.querySelector('.bo-merke') && b.getAttribute('aria-disabled') !== 'true').dataset.v");
  const lengde = await t.js("Rusj.S.spill.trekk.length");
  await merk(fri, 30);
  await t.klikk("#tilbake");
  await t.sov(1200);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem" && (await t.js("Rusj.S.spill.trekk.length")) === lengde + 1, "Mobilen tegnet mens spilleren var på en annen skjerm");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`Rusj.S.spill.trekk.length === ${lengde + 2}`, 4000);
}
