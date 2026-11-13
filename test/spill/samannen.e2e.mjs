// Såmannen: two players sow marbles (the pits one may pick are marked), an extra turn when the last
// marble lands in the store, the other side's pit and an empty pit are refused, undo, a reload and
// back + continue, then the last move of a game and «Kåringen», and «Sist» on the home screen.
// Against the phone: it answers in time without freezing the page (also with its extra turns),
// «Angre» takes back its answer too, it never moves while a sheet is open, and a win counts.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en samannen): texts are checked in
// Norwegian only (t.norsk).

const hull = (v) => `.sa-hull[data-v="${v}"]`;
// A whole 4-marble game (side 0 wins 34–14 with its last move, pit 5). Found by a seeded
// self-play with the game's own rules.
const SLUTT = [4, 9, 10, 1, 3, 7, 10, 4, 0, 11, 4, 5, 12, 5, 3, 7, 5, 4, 5, 0, 11, 1, 5, 4, 12, 10, 3, 12, 11, 2, 7, 3, 8, 4, 5];

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

async function brettPasser(t, navn) {
  await t.js("window.scrollTo(0, 0)");
  const mal = await t.js(`(() => {
    const b = document.querySelector('.skjerm-spill .sa-brett').getBoundingClientRect();
    const h = document.querySelector('.skjerm-spill button.sa-hull').getBoundingClientRect();
    return { b: Math.round(b.width), h: Math.round(Math.min(h.width, h.height)), scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px («${navn}»)`);
  t.sjekk(mal.h >= 26, `Hullene er bare ${mal.h}px å trykke på («${navn}»)`);
  t.sjekk(await t.friForDokk(".sa-brett"), `Brettet ligger under dokka («${navn}»)`);
}

export default async function (t) {
  const velg = async (v, ms = 500) => t.klikk(hull(v), ms);
  const sp = async () => (await t.tilstand()).spill;
  const kuler = (v) => t.js(`Number(document.querySelector('${hull(v)} .sa-tall').textContent)`);

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem", true);
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.klikk('[data-h="kuler"][data-v="4"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.bilde("oppsett-to", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sa-hull').length === 14");
  await t.sov(300);
  await t.bilde("start");
  await brettPasser(t, "start");
  t.sjekk((await t.antall(".sa-hull.kan")) === 6, "Spiller 1 skal kunne velge sine seks hull");
  t.sjekk((t.norsk ? /^Hull 3 til Testspiller A: 4 kuler, kan velges/ : /\S/).test(await t.js(`document.querySelector('${hull(2)}').getAttribute('aria-label')`)), "Hullet har ikke et godt navn");

  // Pit 3 (index 2) with 4 ends in the store: another turn
  await velg(2, 700);
  let s = await sp();
  t.sjekk(s.trekk.join() === "2", "Trekket ble ikke spilt");
  t.sjekk((await kuler(6)) === 1 && (await kuler(2)) === 0 && (await kuler(5)) === 5, "Kulene ble ikke sådd riktig");
  t.sjekk((await t.antall(".sa-hull.kan")) === 5, "Spiller 1 skulle få en tur til");
  t.sjekk(!t.norsk || /en tur til/.test(await t.tekst(".sa-melding")), "Meldingen sier ikke «en tur til»");
  await t.bilde("tur-til");
  // Refused: the other side's pit, and the empty pit
  await velg(9, 300);
  await velg(2, 300);
  t.sjekk((await sp()).trekk.length === 1, "Et ulovlig hull ble spilt");
  await velg(5);
  await velg(9);
  t.sjekk((await sp()).trekk.join() === "2,5,9", "Spiller 2 fikk ikke spille");

  // Undo, reload, back + continue
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 2, "«Angre» tok ikke tilbake ett trekk");
  await t.lastSide(t.side, "document.querySelectorAll('.sa-hull').length === 14");
  t.sjekk((await sp()).trekk.length === 2 && (await kuler(6)) === 2, "Spillet ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.sa-hull').length === 14");

  // The last move of a game
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.starter = 0; }`);
  await t.bilde("nesten-ferdig");
  await velg(SLUTT[SLUTT.length - 1], 1200);
  s = await sp();
  t.sjekk(s.resultat && s.resultat.vinner === 0 && s.resultat.lager.join() === "34,14", `Spillet endte ikke 34–14: ${JSON.stringify(s.resultat)}`);
  t.sjekk(await t.finnes(".sa-stempel"), "Brettet viser ikke resultatet");
  await t.bilde("ferdig");
  await t.vent("document.querySelector('.skjerm-slutt')", 7000);
  await t.sov(400);
  await t.bilde("kaaringen", true);
  t.sjekk((t.norsk ? /Testspiller A vinner/ : /\S/).test(await t.tekst("#skjerm h1")), `Kåringen har feil vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(!t.norsk || /KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.spill.registrert === true && s._aktiv === false, "Kåringen ble ikke registrert for kvelden");
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen har ingen «Del resultatet»");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes(".sa-sist"), "Hjemskjermen viser ikke det siste spillet");
  t.sjekk(!t.norsk || /34–14/.test(await t.tekst(".sa-sist")), "«Sist» viser ikke stillingen");

  // Against the phone, Vanskelig, 6 marbles: the phone starts here, with extra turns
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="kuler"][data-v="6"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sa-hull').length === 14");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  const t0 = Date.now();
  await velg(3, 60);
  await t.bilde("mobilen-tenker");
  await t.vent("Rusj.S.spill.trekk.length >= 2 && document.querySelector('.sa-brett.fri')", 9000);
  const brukt = Date.now() - t0;
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(brukt < 6000, `Mobilen brukte ${brukt} ms på å svare`);
  t.sjekk(gap < 120, `Siden frøs i ${Math.round(gap)} ms mens mobilen tenkte`);
  await t.sov(900);
  await t.bilde("mobilen-svarte");
  await brettPasser(t, "mot mobilen");
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 0, "«Angre» mot mobilen skal ta tilbake både mobilens og ditt trekk");

  // The phone never moves while a sheet is open
  await t.js(`(() => { const S = Rusj.S; S.spill.starter = 1; S.spill.trekk = []; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.js(`document.querySelector('[data-h="regler"]').click()`);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen flyttet før regelarket ble åpnet (testen kom for sent)");
  await t.sov(2600);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen spilte mens regelarket var åpent");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent("Rusj.S.spill.trekk.length >= 1", 6000);

  // Lett: a win counts in the record
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="niva"][data-v="1"]');
  await t.klikk('[data-h="kuler"][data-v="4"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sa-hull').length === 14");
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.starter = 0; }`);
  await velg(SLUTT[SLUTT.length - 1], 1200);
  t.sjekk((await sp()).resultat && (await sp()).resultat.vinner === 0, "Seieren mot mobilen ble ikke registrert");
  t.sjekk((await t.tilstand()).rekord[1].seier === 1, "Seieren ble ikke telt mot Lett");
  await t.vent("document.querySelector('.skjerm-slutt')", 7000);
  t.sjekk(!t.norsk || /Du vinner/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke «Du vinner!»");
  await t.bilde("du-vinner", true);
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Lett/ : /\S/).test(await t.tekst(".sa-rekorder")), "Rekorden mot mobilen vises ikke på hjemskjermen");
  const merker = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "[]")`);
  t.sjekk(JSON.stringify(merker).includes("klassiker-samannen"), "Klistremerket for å slå mobilen ble ikke gitt");
  await t.bilde("hjem-rekord", true);
}
