// Dam: two players play a forced capture (the pieces that must capture are marked, another piece
// is refused), undo, drag and drop, a reload and back + continue; a multi-jump chosen square by
// square; a promotion; a flying king's capture wins the game and leads to «Kåringen». Then against
// the phone: it answers in time without freezing the page, «Angre» takes back its answer, it never
// moves while a sheet is open, the hint on Lett, and a win counts in the record on the home screen.
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
const rute = (v) => `[data-h="rute"][data-v="${v}"]`;

async function storrelse(t, navn, bredde, hoyde, mobil = true) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: mobil ? 2 : 1, mobile: mobil });
  await t.sov(500);
  await t.js("window.scrollTo(0, 0)");
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const mal = await t.js(`(() => {
    const b = document.querySelector('.skjerm-spill .dm-brett').getBoundingClientRect();
    return { bredde: Math.round(b.width), scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px på ${bredde}×${hoyde}`);
  t.sjekk(mal.bredde >= 224, `Brettet er bare ${mal.bredde}px på ${bredde}×${hoyde}`);
  t.sjekk(await t.friForDokk(".dm-brett"), `Brettet ligger under dokka på ${bredde}×${hoyde}`);
  await t.skjermbilde(join(bildemappe(t.id), `str-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

// Positions: rows 8 → 1, '.' empty, w/W white man/king, b/B black man/king, then the side to move.
const FLERHOPP = ".......b/......../...b.b../......../...b..../..w...../......../w....... w 0";
const FORFREMMING = "......../......w./.b....../......../......../......../......../........ w 0";
const FLYGENDE = "......../......../......../......../...b..../......../......../W....... w 0";
const SEIER_MOBIL = "......../......../......../..b...../...w..../......../......../........ w 0";

export default async function (t) {
  const trykk = async (v, ms = 120) => t.klikk(rute(v), ms);
  const sp = async () => (await t.tilstand()).spill;
  const brikker = () => t.antall(".dm-brett .dm-brikke:not(.borte)");

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="1"]');
  await t.bilde("oppsett-to", true);
  t.sjekk((await t.antall(".spiller")) === 2, "To spillere skal ha to navnefelt");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.dm-rute[data-v]').length === 32");
  await t.sov(300);
  await t.bilde("start");
  t.sjekk((await brikker()) === 24, `Brettet skal ha 24 brikker, fant ${await brikker()}`);
  t.sjekk((await t.tilstand())._aktiv === true, "Et pågående parti er ikke merket som aktivt");
  t.sjekk(/c3, hvit brikke/.test(await t.js(`document.querySelector('${rute("c3")}').getAttribute('aria-label')`)), "Ruta c3 har ikke navnet «c3, hvit brikke»");

  // A first move: two dots, then the board turns to black
  await trykk("c3");
  t.sjekk((await t.antall(".dm-rute.mal")) === 2, "Brikka på c3 skal ha to mulige trekk");
  await t.bilde("valgt");
  await trykk("d4", 900);
  t.sjekk((await sp()).trekk.join() === "c3-d4", "Trekket c3–d4 ble ikke spilt");
  t.sjekk((await t.js(`document.querySelector('[data-h="rute"]').dataset.v`)) === "g1", "Brettet snudde ikke til svart");

  // Black offers a piece: white must capture
  await trykk("b6");
  await trykk("c5", 900);
  t.sjekk((await t.antall(".dm-rute.tvang")) === 1 && (await t.finnes(`${rute("d4")}.tvang`)), "Brikka som må slå, er ikke merket");
  t.sjekk(/må slå/.test(await t.tekst(".dm-melding")), "Meldingen sier ikke at hvit må slå");
  t.sjekk(/må slå/.test(await t.js(`document.querySelector('${rute("d4")}').getAttribute('aria-label')`)), "Skjermleseren får ikke vite at d4 må slå");
  await t.bilde("slagplikt");
  await trykk("e3");
  t.sjekk(!(await t.finnes(".dm-rute.valgt")), "En brikke som ikke kan slå, ble valgt under slagplikt");
  await trykk("d4");
  t.sjekk(await t.finnes(`${rute("b6")}.mal.slag`), "Slaget til b6 vises ikke");
  await trykk("b6", 900);
  t.sjekk((await sp()).trekk[2] === "d4xb6" && (await brikker()) === 23, "Slaget d4xb6 ble ikke spilt");

  // Undo, then the same capture by drag and drop
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 2 && (await brikker()) === 24, "«Angre» tok ikke tilbake slaget");
  const midt = (v) => t.js(`(() => { const b = document.querySelector('${rute(v)}').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const a = await midt("d4");
  const b = await midt("b6");
  await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
  await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x + ((b.x - a.x) * i) / 10, y: a.y + ((b.y - a.y) * i) / 10, button: "left", buttons: 1 });
    await t.sov(16);
  }
  t.sjekk(await t.finnes(".dm-svever"), "Brikka følger ikke fingeren når den dras");
  await t.skjermbilde(join(bildemappe(t.id), "dra.png"));
  await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await t.sov(900);
  t.sjekk((await sp()).trekk[2] === "d4xb6", `Dra-og-slipp spilte ikke d4xb6 (${(await sp()).trekk[2]})`);
  t.sjekk(!(await t.finnes(".dm-svever")), "Den dratte brikka ble liggende igjen");

  // Reload, back + continue
  await t.lastSide(t.side, "document.querySelectorAll('.dm-rute[data-v]').length === 32");
  t.sjekk((await sp()).trekk.length === 3 && (await brikker()) === 23, "Partiet ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens partiet pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.dm-rute[data-v]').length === 32");

  // A multi-jump chosen square by square: c3xe5, then c7 or g7
  await lastMed(t, `(S) => { S.spill.fra = ${JSON.stringify(FLERHOPP)}; S.spill.trekk = []; S.spill.starter = 0; S.spill.snu = false; }`);
  await trykk("c3");
  t.sjekk((await t.antall(".dm-rute.mal")) === 1 && (await t.finnes(`${rute("e5")}.mal.slag`)), "Første hopp til e5 vises ikke");
  await trykk("e5", 300);
  t.sjekk((await t.antall(".dm-rute.mal")) === 2 && /Slå videre/.test(await t.tekst(".dm-melding")), "Midt i slaget skal to videre hopp vises");
  t.sjekk(await t.finnes(".dm-brikke.slatt"), "Den hoppede brikka er ikke merket midt i slaget");
  await t.bilde("flerhopp");
  await trykk("g7", 1000);
  t.sjekk((await sp()).trekk.join() === "c3xe5xg7", `Flerhoppet ble ikke spilt (${(await sp()).trekk.join()})`);
  await t.bilde("flerhopp-ferdig");

  // Promotion: a man reaching the far row becomes a king
  await lastMed(t, `(S) => { S.spill.fra = ${JSON.stringify(FORFREMMING)}; S.spill.trekk = []; S.spill.starter = 0; }`);
  await trykk("g7");
  await trykk("h8", 900);
  t.sjekk(await t.finnes(`${rute("h8")} .dm-brikke.dame`), "Brikka ble ikke dame på bakerste rad");
  t.sjekk(/h8, hvit dame/.test(await t.js(`document.querySelector('${rute("h8")}').getAttribute('aria-label')`)), "Damen har ikke navnet «h8, hvit dame»");
  await t.bilde("dame");

  // A flying king captures from a distance and wins: «Kåringen»
  await lastMed(t, `(S) => { S.spill.fra = ${JSON.stringify(FLYGENDE)}; S.spill.trekk = []; S.spill.starter = 0; }`);
  await trykk("a1");
  t.sjekk((await t.antall(".dm-rute.mal")) === 4, `Damen skal kunne lande på fire ruter bak brikka (fant ${await t.antall(".dm-rute.mal")})`);
  await trykk("g7", 900);
  let s = await sp();
  t.sjekk(s.resultat && s.resultat.vinner === 0 && s.poeng[0] === 1, "Seieren ble ikke registrert");
  t.sjekk(await t.finnes(".dm-stempel"), "Brettet viser ikke resultatet");
  await t.bilde("seier");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(400);
  await t.bilde("kaaringen", true);
  t.sjekk(/Testspiller A vinner/.test(await t.tekst("#skjerm h1")), `Kåringen viser feil vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.spill.registrert === true && s._aktiv === false, "Kåringen ble ikke registrert for kvelden");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");

  // «Spill igjen»: the other player starts
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelectorAll('.dm-rute[data-v]').length === 32");
  t.sjekk((await sp()).starter === 1, "Den andre spilleren begynner ikke neste kamp");
  t.sjekk(/Testspiller B begynner/.test(await t.tekst(".dm-melding")), "Meldingen sier ikke at Testspiller B begynner");

  // Against the phone, Vanskelig: it answers in time and the page keeps breathing
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="niva"][data-v="4"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="3"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.dm-rute[data-v]').length === 32");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  const t0 = Date.now();
  await trykk("c3", 60);
  await trykk("d4", 60);
  await t.bilde("mobilen-tenker");
  await t.vent("Rusj.S.spill.trekk.length === 2", 6000);
  const brukt = Date.now() - t0;
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(brukt < 2800, `Mobilen brukte ${brukt} ms på å svare`);
  t.sjekk(gap < 120, `Siden frøs i ${Math.round(gap)} ms mens mobilen tenkte`);
  await t.sov(600);
  await t.bilde("mobilen-svarte");
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 0, "«Angre» mot mobilen skal ta tilbake to trekk");

  // The phone never moves while a sheet is open
  await t.js(`(() => { const S = Rusj.S; S.spill.starter = 1; S.spill.trekk = []; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.js(`document.querySelector('[data-h="regler"]').click()`);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen flyttet før regelarket ble åpnet (testen kom for sent)");
  await t.sov(2600);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen flyttet mens regelarket var åpent");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent("Rusj.S.spill.trekk.length === 1", 5000);
  t.sjekk((await sp()).trekk.length === 1, "Mobilen flyttet ikke etter at arket ble lukket");

  // Small screens
  await storrelse(t, "brett", 375, 560);
  await storrelse(t, "brett", 320, 568);
  await storrelse(t, "brett", 844, 390);
  await storrelse(t, "brett", 1280, 800, false);

  // Lett: the hint shows a move; a win counts in the record
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="niva"][data-v="2"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.dm-rute[data-v]').length === 32");
  await t.klikk('[data-h="hint"]');
  await t.vent("document.querySelectorAll('.dm-rute.hint').length === 2", 4000);
  await t.bilde("tips");
  await lastMed(t, `(S) => { S.spill.fra = ${JSON.stringify(SEIER_MOBIL)}; S.spill.trekk = []; S.spill.starter = 0; }`);
  await trykk("d4");
  await trykk("b6", 900);
  t.sjekk((await sp()).resultat && (await sp()).resultat.vinner === 0, "Seieren mot mobilen ble ikke registrert");
  t.sjekk((await t.tilstand()).rekord[2].seier === 1, "Seieren ble ikke telt mot Lett");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  t.sjekk(/Du vinner/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke «Du vinner!»");
  await t.bilde("du-vinner", true);
  await t.klikk("#tilbake");
  t.sjekk(/Lett/.test(await t.tekst(".dm-rekorder")), "Rekorden mot mobilen vises ikke på hjemskjermen");
  await t.bilde("hjem-rekord", true);
}
