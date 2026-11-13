// Mølla: two players place pieces (the free dots shown), a mill waits for its capture (a piece in a
// mill or an own piece is refused), undo, a reload and back + continue, then a game near its end is
// won by moving into a mill and taking the third-last piece, and «Kåringen» follows. Against the
// phone: it answers in time without freezing the page, «Angre» takes back its answer too, it never
// moves while a sheet is open, and a win counts in the record on the home screen.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en molla): texts are checked in Norwegian
// only (t.norsk); elsewhere the state, the classes and the links.

const punkt = (v) => `[data-h="punkt"][data-v="${v}"]`;
// A whole game (white wins: a7-d7 closes a mill and takes black's third-last piece). Found by a
// seeded self-play with the game's own rules; replayed in test/molla.test.mjs.
const SLUTT = ["d6","c4","b6","f6","d5","d3","d7xf6","f6","a7","g7","c5","e5","a1","b4","a4xe5","e5","e3","b2","a1-d1","d3-d2","d1-a1xf6","e5-e4","d6-f6","c4-c3","d7-d6xg7","d2-d1","a7-d7xd1","b2-d2","d7-a7xb4","c3-d3","a7-d7xe4"];

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

async function brettPasser(t, navn) {
  await t.js("window.scrollTo(0, 0)");
  const mal = await t.js(`(() => {
    const b = document.querySelector('.skjerm-spill .ml-brett').getBoundingClientRect();
    const p = document.querySelector('.skjerm-spill .ml-punkt').getBoundingClientRect();
    return { bredde: Math.round(b.width), punkt: Math.round(p.width), scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px («${navn}»)`);
  t.sjekk(mal.bredde >= 232, `Brettet er bare ${mal.bredde}px («${navn}»)`);
  t.sjekk(mal.punkt >= 30, `Prikkene er bare ${mal.punkt}px å trykke på («${navn}»)`);
  t.sjekk(await t.friForDokk(".ml-brett"), `Brettet ligger under dokka («${navn}»)`);
}

export default async function (t) {
  const trykk = async (v, ms = 450) => t.klikk(punkt(v), ms);
  const sp = async () => (await t.tilstand()).spill;

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem", true);
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="1"]');
  await t.bilde("oppsett-to", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ml-punkt').length === 24");
  await t.sov(300);
  await t.bilde("start");
  await brettPasser(t, "start");
  t.sjekk((await t.antall(".ml-punkt.mulig")) === 24, "Alle de 24 prikkene skal vises som ledige ved start");
  t.sjekk((t.norsk ? /^d6, tom, du kan sette her/ : /^d6, /).test(await t.js(`document.querySelector('${punkt("d6")}').getAttribute('aria-label')`)), "Prikken d6 har ikke et godt navn");

  // Placing, and a mill that waits for its capture
  await trykk("a7");
  await trykk("a1");
  t.sjekk((await t.antall(".ml-brett .ml-skive")) === 2, "To brikker skal stå på brettet");
  await trykk("a1", 300);
  t.sjekk((await sp()).trekk.length === 2, "En opptatt prikk ble tatt");
  await trykk("d7");
  await trykk("d1");
  await trykk("g7", 500);
  let s = await sp();
  t.sjekk(Array.isArray(s.venter) && s.trekk.length === 4, "Møllen venter ikke på at en brikke blir tatt");
  t.sjekk((await t.antall(".ml-punkt.ta")) === 2, "De to svarte brikkene skal blinke");
  t.sjekk(!t.norsk || /Mølle!/.test(await t.tekst(".ml-melding")), "Meldingen sier ikke «Mølle!»");
  await t.bilde("molle");
  await trykk("a7", 300);
  t.sjekk((await sp()).trekk.length === 4, "En egen brikke ble tatt");
  await trykk("a1", 600);
  s = await sp();
  t.sjekk(s.trekk[4] === "g7xa1" && !s.venter, `Møllen tok ikke a1: ${s.trekk.join(" ")}`);
  t.sjekk((await t.antall(".ml-brett .ml-skive:not(.tatt)")) === 4, "Brikka på a1 ble ikke fjernet");

  // Undo, then the same again
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 4, "«Angre» tok ikke tilbake ett trekk");
  await trykk("g7");
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk(!(await sp()).venter, "«Angre» midt i en mølle skal ta tilbake møllen");
  await trykk("g7");
  await trykk("a1");
  t.sjekk((await sp()).trekk.length === 5, "Møllen ble ikke spilt på nytt");

  // Reload, back + continue
  await t.lastSide(t.side, "document.querySelectorAll('.ml-punkt').length === 24");
  t.sjekk((await sp()).trekk.length === 5 && (await t.antall(".ml-brett .ml-skive")) === 4, "Partiet ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens partiet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.ml-punkt').length === 24");

  // Near the end: white moves into a mill and takes black's third-last piece
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.venter = null; S.spill.starter = 0; }`);
  await t.bilde("flytting");
  t.sjekk((await t.antall(".ml-punkt.kan")) > 0, "Brikkene som kan flyttes, er ikke merket");
  await trykk("a7");
  t.sjekk(await t.finnes(`${punkt("a7")}.valgt`), "Brikka på a7 ble ikke valgt");
  t.sjekk(await t.finnes(`${punkt("d7")}.mulig`), "d7 vises ikke som et mulig mål");
  await trykk("g1", 300);
  t.sjekk((await sp()).trekk.length === SLUTT.length - 1, "Et ulovlig flytt ble spilt");
  await trykk("d7");
  await t.bilde("molle-flytt");
  await trykk("e4", 900);
  s = await sp();
  t.sjekk(s.resultat && s.resultat.vinner === 0 && s.resultat.grunn === "to", "Partiet ble ikke vunnet da svart fikk to brikker");
  t.sjekk(await t.finnes(".ml-stempel"), "Brettet viser ikke resultatet");
  await t.bilde("ferdig");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(400);
  await t.bilde("kaaringen", true);
  t.sjekk((t.norsk ? /vinner/ : /\S/).test(await t.tekst("#skjerm h1")), `Kåringen har ingen vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(!t.norsk || /KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.spill.registrert === true && s._aktiv === false, "Kåringen ble ikke registrert for kvelden");
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen har ingen «Del resultatet»");

  // «Spill igjen»: the other player starts
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelectorAll('.ml-punkt').length === 24");
  t.sjekk((await sp()).starter === 1, "Den andre spilleren begynner ikke neste parti");

  // Against the phone, Vanskelig: it answers in time and the page does not freeze
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="3"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ml-punkt').length === 24");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  const t0 = Date.now();
  await trykk("d6", 60);
  await t.bilde("mobilen-tenker");
  await t.vent("Rusj.S.spill.trekk.length === 2", 6000);
  const brukt = Date.now() - t0;
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(brukt < 2800, `Mobilen brukte ${brukt} ms på å svare`);
  t.sjekk(gap < 120, `Siden frøs i ${Math.round(gap)} ms mens mobilen tenkte`);
  await t.sov(700);
  await t.bilde("mobilen-svarte");
  await brettPasser(t, "mot mobilen");
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 0, "«Angre» mot mobilen skal ta tilbake to trekk");

  // The phone never moves while a sheet is open
  await t.js(`(() => { const S = Rusj.S; S.spill.starter = 1; S.spill.trekk = []; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.js(`document.querySelector('[data-h="regler"]').click()`);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen flyttet før regelarket ble åpnet (testen kom for sent)");
  await t.sov(2600);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen satte en brikke mens regelarket var åpent");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent("Rusj.S.spill.trekk.length === 1", 5000);

  // Lett: a win counts in the record
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="niva"][data-v="1"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="mal"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ml-punkt').length === 24");
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.starter = 0; }`);
  await trykk("a7");
  await trykk("d7");
  await trykk("e4", 900);
  t.sjekk((await sp()).resultat && (await sp()).resultat.vinner === 0, "Seieren mot mobilen ble ikke registrert");
  t.sjekk((await t.tilstand()).rekord[1].seier === 1, "Seieren ble ikke telt mot Lett");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  t.sjekk(!t.norsk || /Du vinner/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke «Du vinner!»");
  await t.bilde("du-vinner", true);
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Lett/ : /\S/).test(await t.tekst(".ml-rekorder")), "Rekorden mot mobilen vises ikke på hjemskjermen");
  const merker = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "[]")`);
  t.sjekk(JSON.stringify(merker).includes("klassiker-molla"), "Klistremerket for å slå mobilen ble ikke gitt");
  await t.bilde("hjem-rekord", true);
}
