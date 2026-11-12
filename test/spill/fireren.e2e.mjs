// Fireren: two players win a round with four in a column, undo the winning disc (the point goes),
// win again, start a new round (the other player starts), a full column is refused, reload and
// back + continue keep the round, a full board is a draw; then against the phone: it answers in
// time without freezing the page, blocks a threat, and «Avslutt» leads to «Kåringen».
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
    const b = document.querySelector('.fi-brett').getBoundingClientRect();
    return { bunn: Math.round(b.bottom + 10), bredde: Math.round(b.width), scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px på ${bredde}×${hoyde}`);
  t.sjekk(mal.bredde >= 220, `Brettet er bare ${mal.bredde}px på ${bredde}×${hoyde}`);
  await t.skjermbilde(join(bildemappe(t.id), `str-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

// A full board without four in a row (21 discs each), and an order of play that reaches it.
const KOLONNER = ["112211", "221122", "112211", "221122", "112211", "221122", "112212"];
function uavgjortRekke() {
  const h = [0, 0, 0, 0, 0, 0, 0];
  const rekke = [];
  const dfs = (tur) => {
    if (rekke.length === 42) return true;
    for (let k = 0; k < 7; k++) {
      if (h[k] < 6 && Number(KOLONNER[k][h[k]]) === tur) {
        h[k]++;
        rekke.push(k);
        if (dfs(3 - tur)) return true;
        rekke.pop();
        h[k]--;
      }
    }
    return false;
  };
  dfs(1);
  return rekke;
}

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

export default async function (t) {
  const slipp = async (k, ms = 520) => t.klikk(`.fi-kol[data-v="${k}"]`, ms);
  const tilstand = async () => (await t.tilstand()).spill;

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.bilde("oppsett-to", true);
  await t.js("Rusj.S.nesteStarter = 0"); // who opens round 1 alternates; the test wants player 1
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.fi-kol').length === 7");
  await t.sov(300);
  await t.bilde("start");
  t.sjekk((await t.tilstand())._aktiv === true, "En pågående kamp er ikke merket som aktiv");

  // Testspiller A (rosa) starts and makes four in column 4
  for (const k of [3, 4, 3, 4, 3, 4]) await slipp(k);
  await t.bilde("tre-pa-rad");
  await slipp(3, 1300);
  let sp = await tilstand();
  t.sjekk(sp.resultat && sp.resultat.vinner === 0 && sp.poeng[0] === 1, "Fire på rad ga ikke seier og poeng");
  t.sjekk(await t.finnes(".fi-strek line"), "Vinnerlinja tegnes ikke");
  t.sjekk(/Testspiller A vinner/.test(await t.tekst(".fi-melding")), "Meldingen sier ikke hvem som vant");
  t.sjekk(await t.finnes('.dokk [data-h="runde"]'), "Mangler «Ny runde» etter seieren");
  await t.bilde("vinner");

  // Undo the winning disc: the point goes and the round goes on
  await t.klikk('[data-h="angre"]', 400);
  sp = await tilstand();
  t.sjekk(!sp.resultat && sp.poeng[0] === 0 && sp.trekk.length === 6, "«Angre» tok ikke tilbake vinnerbrikka og poenget");
  await slipp(3, 1200);
  t.sjekk((await tilstand()).poeng[0] === 1, "Seieren ble ikke telt på nytt");

  // New round: Testspiller B starts
  await t.klikk('[data-h="runde"]', 400);
  sp = await tilstand();
  t.sjekk(sp.runde === 2 && sp.starter === 1 && sp.trekk.length === 0, "Ny runde startet ikke med den andre spilleren");
  t.sjekk(/Testspiller B begynner/.test(await t.tekst(".fi-melding")), "Meldingen sier ikke at Testspiller B begynner");
  await t.bilde("ny-runde");

  // A full column is refused
  for (let n = 0; n < 6; n++) await slipp(0, 480);
  await slipp(0, 300);
  t.sjekk((await tilstand()).trekk.length === 6, "En full kolonne tok imot en brikke til");
  t.sjekk(await t.js("document.querySelector('.fi-kol[data-v=\"0\"]').getAttribute('aria-disabled') === 'true'"), "Full kolonne er ikke merket som full");

  // Reload, back + continue
  await t.lastSide(t.side, "document.querySelectorAll('.fi-kol').length === 7");
  t.sjekk((await tilstand()).trekk.length === 6 && (await t.antall(".fi-brikke")) === 6, "Runden ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens kampen pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.fi-kol').length === 7");

  // A full board without four in a row: a draw
  const rekke = uavgjortRekke();
  t.sjekk(rekke.length === 42, "Fant ingen rekkefølge for et fullt brett");
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(rekke.slice(0, 41))}; S.spill.starter = 0; }`);
  await slipp(rekke[41], 1000);
  sp = await tilstand();
  t.sjekk(sp.resultat && sp.resultat.vinner === null && sp.uavgjort === 1, "Fullt brett ga ikke uavgjort");
  await t.bilde("uavgjort");

  // «Avslutt» → the crowning
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(/Testspiller A vinner/.test(await t.tekst("#skjerm h1")), `Kåringen viser feil vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk((await t.tilstand())._aktiv === false, "En ferdig kamp skal ikke være merket som pågående");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  await t.bilde("kaaringen", true);

  // «Først til 3» (the default): the third won round leads to «Kåringen» by itself
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelectorAll('.fi-kol').length === 7");
  t.sjekk((await tilstand()).mal === 3, "«Først til 3» er ikke standard");
  await lastMed(t, `(S) => { S.spill.poeng = [2, 0]; S.spill.trekk = [3, 4, 3, 4, 3, 4]; S.spill.starter = 0; S.spill.resultat = null; }`);
  await slipp(3, 600);
  t.sjekk(await t.finnes('.dokk [data-h="kaaring"]'), "Mangler «Se kåringen» når kampen er avgjort");
  await t.bilde("kamp-vunnet");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  t.sjekk(/Testspiller A vinner/.test(await t.tekst("#skjerm h1")) && (await tilstand()).poeng[0] === 3, "Automatisk kåring etter tre seirer virket ikke");

  // Against the phone, strongest level
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.js("Rusj.S.nesteStarter = 0"); // who opens round 1 alternates; the test wants player 1
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.fi-kol').length === 7");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  const t0 = Date.now();
  await slipp(3, 100);
  await t.bilde("mobilen-tenker");
  await t.vent("Rusj.S.spill.trekk.length === 2", 6000);
  const brukt = Date.now() - t0;
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(brukt < 2600, `Mobilen brukte ${brukt} ms på å svare`);
  t.sjekk(gap < 120, `Siden frøs i ${Math.round(gap)} ms mens mobilen tenkte`);
  await t.sov(700);
  await t.bilde("mobilen-svarte");

  // It blocks three in a row on the bottom
  await lastMed(t, `(S) => { S.spill.trekk = [0, 6, 1, 6, 2]; S.spill.starter = 0; S.spill.resultat = null; }`);
  await t.vent("Rusj.S.spill.trekk.length === 6", 6000);
  t.sjekk((await tilstand()).trekk[5] === 3, `Mobilen blokkerte ikke tre på rad (la i ${(await tilstand()).trekk[5] + 1})`);
  await t.sov(700);
  await t.bilde("blokkert");

  // Undo against the phone takes back its disc and yours
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await tilstand()).trekk.length === 4, "«Angre» mot mobilen skal ta tilbake to brikker");

  // Beating the phone gives the sticker «Fire på rad» once, celebrated at a calm moment.
  await t.js(`localStorage.removeItem("rusj.merker"); localStorage.removeItem("rusj.merkerNye")`);
  await lastMed(t, `(S) => { S.spill.trekk = [0, 6, 1, 6, 2, 5]; S.spill.starter = 0; S.spill.resultat = null; }`);
  await slipp(3, 200);
  await t.vent("Rusj.S.spill.resultat", 6000);
  t.sjekk((await tilstand()).resultat.vinner === 0, "Seieren mot mobilen ble ikke registrert");
  await t.vent("document.querySelector('#merke-pop.vis')", 6000);
  const pop = await t.js(`({ tekst: document.querySelector("#merke-pop").innerText.replace(/\\s+/g, " "), lagret: JSON.parse(localStorage.getItem("rusj.merker") || "{}"), nye: localStorage.getItem("rusj.merkerNye") })`);
  t.sjekk(/(Nytt klistremerke|nye klistremerker):.*Fire på rad/.test(pop.tekst) && Number.isInteger(pop.lagret["klassiker-fireren"]) && pop.nye == null, `Klistremerket for seier mot mobilen: ${JSON.stringify(pop)}`);
  await t.sov(700);
  await t.bilde("klistremerke");
  await lastMed(t, `(S) => { S.spill.trekk = [0, 6, 1, 6, 2, 5]; S.spill.starter = 0; S.spill.resultat = null; }`);
  await t.sov(1800);
  t.sjekk(!(await t.js("!!document.querySelector('#merke-pop.vis')")), "Klistremerket ble feiret to ganger");

  // Small screens
  await storrelse(t, "brett", 375, 560);
  await storrelse(t, "brett", 320, 568);
  await storrelse(t, "brett", 1280, 800, false);

  // The phone wins when you leave a threat open (Lett would sometimes miss; Vanskelig never does)
  await lastMed(t, `(S) => { S.spill.trekk = [0, 3, 6, 3, 6, 3]; S.spill.starter = 0; S.spill.resultat = null; }`);
  await slipp(5, 200);
  await t.vent("Rusj.S.spill.resultat", 6000);
  await t.sov(1200);
  t.sjekk((await tilstand()).resultat.vinner === 1, "Mobilen tok ikke vinnertrekket");
  await t.bilde("mobilen-vant");

  // Leaving while the phone thinks: no move on another screen
  await t.klikk('[data-h="runde"]', 400);
  sp = await tilstand();
  t.sjekk(sp.starter === 1, "I neste runde skal mobilen begynne");
  await t.klikk("#tilbake");
  await t.sov(1600);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem", "Mobilen sitt trekk dro spilleren tilbake");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("Rusj.S.spill.trekk.length === 1", 6000);
}
