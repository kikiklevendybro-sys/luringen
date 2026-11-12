// Reversi: two players play the opening (legal moves shown as dots, an illegal square refused,
// flips counted live), undo, a reload and back + continue, the dots switched off, a pass, and a full
// game that ends on the board and leads to «Kåringen». Then against the phone: it answers in time
// without freezing the page, «Angre» takes back its answer, it never moves while a sheet is open,
// the hint on Lett, and a win counts in the record on the home screen.
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
    const b = document.querySelector('.skjerm-spill .rv-brett').getBoundingClientRect();
    return { bredde: Math.round(b.width), scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px på ${bredde}×${hoyde}`);
  t.sjekk(mal.bredde >= 224, `Brettet er bare ${mal.bredde}px på ${bredde}×${hoyde}`);
  t.sjekk(await t.friForDokk(".rv-brett"), `Brettet ligger under dokka på ${bredde}×${hoyde}`);
  await t.skjermbilde(join(bildemappe(t.id), `str-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

// A full legal game with a pass in it; black's last move ends it and black wins (found by a seeded
// random search with the game's own rules, and replayed in test/reversi.test.mjs).
const SLUTT = ["f5","f6","e6","f4","g4","d6","c5","c6","g7","b6","a6","f7","f3","h8","b5","c7","g8","f8","c8","h4","d3","a5","g3","c4","b3","d8","c3","d7","b8","a2","g5","c2","a4","f2","d2","e2","g2","b7","e7","e8","e1","h6","e3","h2","c1","b4","h3","b1","g1","d1","f1","b2","a3","g6","a8","h5","a7","h1","h7","a1"];
// The shortest win for black: after f4 white has no discs left.
const UTSLETTING = ["d3","c3","b3","d2","e1","d6","d7","e3","f4"];

export default async function (t) {
  const legg = async (v, ms = 700) => t.klikk(rute(v), ms);
  const sp = async () => (await t.tilstand()).spill;
  const skiver = () => t.antall(".rv-brett .rv-skive");

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="1"]');
  await t.bilde("oppsett-to", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.rv-rute').length === 64");
  await t.sov(300);
  await t.bilde("start");
  t.sjekk((await skiver()) === 4, "Brettet skal starte med fire brikker");
  t.sjekk((await t.antall(".rv-rute.mulig")) === 4, "Svart skal ha fire mulige trekk som prikker");
  t.sjekk(/d3, tom, mulig trekk, snur 1/.test(await t.js(`document.querySelector('${rute("d3")}').getAttribute('aria-label')`)), "Ruta d3 har ikke et godt navn");
  t.sjekk(/e5, hvit brikke/.test(await t.js(`document.querySelector('${rute("e5")}').getAttribute('aria-label')`)), "Ruta e5 heter ikke «e5, hvit brikke»");

  // An illegal square is refused, a legal one flips
  await legg("a1", 300);
  t.sjekk((await sp()).trekk.length === 0, "Et ulovlig trekk ble spilt");
  await legg("d3", 200);
  t.sjekk(await t.finnes(".rv-skive.snu"), "Brikka som snus, får ingen snu-animasjon");
  await t.sov(500);
  t.sjekk((await sp()).trekk.join() === "d3", "Trekket d3 ble ikke spilt");
  t.sjekk((await t.antall(".rv-brett .rv-skive.svart")) === 4 && (await t.antall(".rv-brett .rv-skive.hvit")) === 1, "d3 snudde ikke d4");
  t.sjekk(/4/.test(await t.tekst(".rv-spiller:first-child .rv-antall")), "Brikketellingen oppdateres ikke");
  await t.bilde("forste-trekk");
  await legg("c3");
  await legg("c4");
  t.sjekk((await sp()).trekk.length === 3, "Åpningen ble ikke spilt");

  // Undo
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 2, "«Angre» tok ikke tilbake ett trekk");

  // Reload, back + continue
  await t.lastSide(t.side, "document.querySelectorAll('.rv-rute').length === 64");
  t.sjekk((await sp()).trekk.length === 2 && (await skiver()) === 6, "Partiet ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens partiet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.rv-rute').length === 64");

  // A game that ends: the last move fills the board and «Kåringen» follows
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.starter = 0; }`);
  await t.bilde("nesten-ferdig");
  await legg(SLUTT[SLUTT.length - 1], 900);
  let s = await sp();
  t.sjekk(s.resultat && s.resultat.antall[0] + s.resultat.antall[1] > 0, "Partiet ble ikke avsluttet da ingen kunne legge mer");
  t.sjekk(await t.finnes(".rv-stempel"), "Brettet viser ikke resultatet");
  await t.bilde("ferdig");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(400);
  await t.bilde("kaaringen", true);
  t.sjekk(/vinner|Uavgjort/.test(await t.tekst("#skjerm h1")), `Kåringen har ingen vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.spill.registrert === true && s._aktiv === false, "Kåringen ble ikke registrert for kvelden");

  // «Spill igjen»: the other player starts; the dots can be switched off
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="prikker"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.rv-rute').length === 64");
  t.sjekk((await sp()).starter === 1, "Den andre spilleren begynner ikke neste kamp");
  t.sjekk((await t.antall(".rv-rute.mulig")) === 0, "Prikkene vises selv om de er skrudd av");
  await legg("f5");
  t.sjekk((await sp()).trekk.join() === "f5", "Trekk uten prikker virker ikke");

  // Against the phone, Vanskelig
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="prikker"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="niva"][data-v="4"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="3"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.rv-rute').length === 64");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  const t0 = Date.now();
  await legg("d3", 60);
  await t.bilde("mobilen-tenker");
  await t.vent("Rusj.S.spill.trekk.length === 2", 6000);
  const brukt = Date.now() - t0;
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(brukt < 2800, `Mobilen brukte ${brukt} ms på å svare`);
  t.sjekk(gap < 120, `Siden frøs i ${Math.round(gap)} ms mens mobilen tenkte`);
  await t.sov(700);
  await t.bilde("mobilen-svarte");
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 0, "«Angre» mot mobilen skal ta tilbake to trekk");

  // The phone never moves while a sheet is open
  await t.js(`(() => { const S = Rusj.S; S.spill.starter = 1; S.spill.trekk = []; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.js(`document.querySelector('[data-h="regler"]').click()`);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen flyttet før regelarket ble åpnet (testen kom for sent)");
  await t.sov(2600);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen la en brikke mens regelarket var åpent");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent("Rusj.S.spill.trekk.length === 1", 5000);

  await storrelse(t, "brett", 375, 560);
  await storrelse(t, "brett", 320, 568);
  await storrelse(t, "brett", 844, 390);
  await storrelse(t, "brett", 1280, 800, false);

  // Lett: the hint, and a win counts in the record
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="niva"][data-v="2"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.rv-rute').length === 64");
  await t.klikk('[data-h="hint"]');
  await t.vent("document.querySelectorAll('.rv-rute.hint').length === 1", 4000);
  await t.bilde("tips");
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(UTSLETTING.slice(0, -1))}; S.spill.starter = 0; }`);
  await legg("f4", 900);
  t.sjekk((await sp()).resultat && (await sp()).resultat.vinner === 0, "Seieren mot mobilen ble ikke registrert");
  t.sjekk((await t.tilstand()).rekord[2].seier === 1, "Seieren ble ikke telt mot Lett");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  t.sjekk(/Du vinner/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke «Du vinner!»");
  await t.bilde("du-vinner", true);
  await t.klikk("#tilbake");
  t.sjekk(/Lett/.test(await t.tekst(".rv-rekorder")), "Rekorden mot mobilen vises ikke på hjemskjermen");
  await t.bilde("hjem-rekord", true);
}
