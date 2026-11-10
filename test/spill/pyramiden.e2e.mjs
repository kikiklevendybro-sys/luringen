// Pyramiden (18+): the age gate («Nei» leads away, «Ja» opens); four players each hold to see their four
// cards (once, «Ferdig» only after looking). Then a fixed deal is put in, so every rule can be checked:
// one hand-out per player per pyramid card; nobody is handed sips more than twice on the same card;
// accept, pass («Står over») or call bluff; the loser of a bluff duel takes two extra but never more
// than 5 sips, and the winner gets a point (so a wrong call on the top card costs in the standings);
// a card shown as proof is swapped for a new secret card that its owner alone holds to see; «Angre»
// takes back a hand-out (and the swap); full-screen water breaks before row 3 and before the top card;
// the log shows who gave to whom without sip counts; reload and back + «Fortsett» keep the game; the
// memory finale; the crowning ranks points for bluffing (never sips) and reveals the bluff master;
// short screens and landscape keep the question and the buttons on screen.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const [A, B, C, D] = [0, 1, 2, 3];
const verdi = (k) => (k % 13) + 1;
const rad = (n) => (n >= 14 ? 5 : n >= 12 ? 4 : n >= 9 ? 3 : n >= 5 ? 2 : 1);
const kort = (sort, v) => sort * 13 + v - 1; // sort: 0 spar, 1 hjerter, 2 ruter, 3 kløver

// The fixed deal: A holds 7, 9, K, 2 · B and C hold 3–6 · D holds Q, J, 10, 8.
const HENDER = [
  [kort(0, 7), kort(0, 9), kort(0, 13), kort(0, 2)],
  [kort(1, 3), kort(1, 4), kort(1, 5), kort(1, 6)],
  [kort(2, 3), kort(2, 4), kort(2, 5), kort(2, 6)],
  [kort(3, 12), kort(3, 11), kort(3, 10), kort(3, 8)],
];
// Row 1: 7 9 A 2 K · row 2: 9 7 A 2 · row 3: K 7 9 · row 4: A 2 · top: Q
const PYRAMIDE = [kort(1, 7), kort(1, 9), kort(1, 1), kort(1, 2), kort(1, 13), kort(2, 9), kort(2, 7), kort(2, 1), kort(2, 2), kort(2, 13), kort(3, 7), kort(3, 9), kort(3, 1), kort(3, 2), kort(1, 12)];
const NYTT_1 = kort(0, 10); // the first card swapped in (top of the spare pile)
const NYTT_2 = kort(0, 11); // the second

export default async function (t) {
  const pause = () => t.sov(420);
  const tilstand = () => t.tilstand();
  const lukkTips = async () => {
    await t.sov(2100);
    if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  };
  const overDokk = (velger) =>
    t.js(`(() => { const d = document.querySelector("#skjerm .dokk").getBoundingClientRect(); const e = document.querySelector(${JSON.stringify(velger)}).getBoundingClientRect(); return e.bottom <= d.top + 2; })()`);
  // Fully inside the window without scrolling (for landscape, where the dock is part of the layout).
  const iVinduet = (velger) =>
    t.js(`(() => { const e = document.querySelector(${JSON.stringify(velger)}); if (!e) return false; const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight + 1 && b.left >= 0 && b.right <= window.innerWidth + 1; })()`);
  const synligeKort = () => t.js(`[...document.querySelectorAll(".mappe.apen .mappe-bakside .sk-kort")].filter((el) => el.offsetParent).length`);
  const lagre = async (spill, skjerm) => {
    await t.js(`localStorage.setItem("rusj.pyramiden.v1", ${JSON.stringify(JSON.stringify({ ...(await tilstand()), spill, skjerm, _tid: Date.now() }))})`);
  };

  // 1. Age gate
  await t.start({ navn: NAVN });
  t.sjekk(/18/.test(await t.tekst("#skjerm h1")), "18-årsgrensen vises ikke før spillet");
  await t.klikk('[data-h="alder-nei"]');
  await t.vent("location.pathname === '/'", 8000);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="alder-ja"]'), "Spillet åpnet uten 18-årsbekreftelse etter «Nei»");
  await t.klikk('[data-h="alder-ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Pyramiden", "«Ja» åpnet ikke spillet");
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  const regler = await t.tekst("#ark");
  t.sjekk(/én gang per kort/.test(regler) && /mer enn to spillere/.test(regler) && /Aldri mer enn 5 slurker/.test(regler) && /vannpause/.test(regler) && /nytt hemmelig kort/.test(regler), "Reglene nevner ikke de nye husreglene");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // 2. Setup: four players, the memory finale on
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4, "Oppsettet viser ikke de fire spillerne");
  t.sjekk(await t.finnes('[data-h="finale"][aria-pressed="true"]'), "Hukommelsesfinalen skal være på som standard");
  t.sjekk(/stå over/.test(await t.tekst("#skjerm")), "Oppsettet sier ikke at alle kan stå over");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');

  // 3. Dealing: hold to see, «Ferdig» only after looking
  for (let i = 0; i < 4; i++) {
    await t.vent("document.querySelector('.mappe')");
    t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[i]), `Mobilen skal gis til ${NAVN[i]}`);
    t.sjekk(await t.js('document.querySelector(\'[data-h="vist"]\').disabled'), "«Ferdig» kan trykkes før kortene er sett");
    if (i === 0) await t.bilde("gi-mobilen");
    const slipp = await t.hold(".mappe", 800);
    t.sjekk((await synligeKort()) === 4, "Kortene vises ikke mens man holder");
    if (i === 0) await t.bilde("ser-kortene");
    await slipp();
    t.sjekk((await t.antall(".mappe-bakside .sk-kort")) === 0, "Kortene ble ikke skjult igjen");
    t.sjekk((await tilstand()).spill.del.sett === true, "Det ble ikke registrert at kortene ble sett");
    if (i === 1) {
      await t.lastSide(t.side, "document.querySelector('.mappe')");
      t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[1]), "Omlasting midt i utdelingen hoppet til feil spiller");
    }
    await pause();
    await t.klikk('[data-h="vist"]');
  }

  // 4. The pyramid – from here with the fixed deal
  await t.vent("document.querySelector('.py-pyramide')");
  t.sjekk((await t.antall(".py-pyramide .sk-kort")) === 15, "Pyramiden skal ha 15 kort");
  t.sjekk((await t.antall(".py-pyramide .sk-kort.sk-opp")) === 0, "Ingen kort skal være snudd før start");
  let s = await tilstand();
  t.sjekk(s.spill.bunke.length === 52 - 16 - 15 && !s.spill.doble, "Fire spillere skal ha én kortstokk med 21 kort til overs");
  const brukt = new Set([...HENDER.flat(), ...PYRAMIDE, NYTT_1, NYTT_2]);
  const rest = Array.from({ length: 52 }, (_, k) => k).filter((k) => !brukt.has(k));
  await lagre({ ...s.spill, hender: HENDER, pyramide: PYRAMIDE, bunke: [...rest, NYTT_2, NYTT_1] }, "pyramide");
  await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
  await t.bilde("pyramide");

  const sist = async () => {
    const sp = (await tilstand()).spill;
    return sp.logg[sp.logg.length - 1];
  };
  // A claim: «Jeg har …!» → who → to whom → godta / staover / bloff. Stops on the result.
  const kravet = async (fra, til, valg) => {
    await t.klikk('[data-h="krav"]');
    await t.vent("document.querySelector('[data-h=\"fra\"]')");
    await pause();
    await t.klikk(`[data-h="fra"][data-v="${fra}"]`);
    await t.vent("document.querySelector('[data-h=\"til\"]')");
    t.sjekk(!(await t.finnes(`[data-h="til"][data-v="${fra}"]`)), "Man kan gi slurker til seg selv");
    await pause();
    await t.klikk(`[data-h="til"][data-v="${til}"]`);
    await t.vent(`document.querySelector('[data-h="${valg}"]')`);
    await pause();
    await t.klikk(`[data-h="${valg}"]`);
    await t.vent("document.querySelector('.py-resultat .stempel')", 6000);
    await t.sov(400);
  };
  const tilPyramiden = async () => {
    await t.klikk('[data-h="tilpyramiden"]');
    await t.vent("document.querySelector('.py-pyramide')");
    await pause();
  };
  const snu = async () => {
    await pause();
    await t.klikk('[data-h="snu"]');
  };

  // Card 1 (row 1, a 7 – A has one)
  await snu();
  s = await tilstand();
  t.sjekk(s.spill.snudd === 1 && (await t.antall(".py-pyramide .sk-kort.sk-opp")) === 1, "Kortet ble ikke snudd");
  await t.sov(400);
  await t.bilde("forste-kort");

  // a) Accepted: the receiver takes the row's sips. «Angre» takes it back.
  await kravet(A, B, "godta");
  let x = await sist();
  t.sjekk(x.sant === true && x.taker === B && x.slurker === 1 && !x.ropte, "Et godtatt krav ble ført feil");
  await t.bilde("godtatt");
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('.py-pyramide')");
  t.sjekk((await tilstand()).spill.logg.length === 0, "«Angre» tok ikke tilbake utdelingen");
  await pause();
  await kravet(A, B, "godta");
  await tilPyramiden();

  // b) One hand-out per player per card: A can't be picked again
  await t.klikk('[data-h="krav"]');
  await t.vent("document.querySelector('[data-h=\"fra\"]')");
  t.sjekk(await t.js(`document.querySelector('[data-h="fra"][data-v="${A}"]').disabled`), "Samme spiller kan dele ut flere ganger på samme kort");
  t.sjekk(!(await t.js(`document.querySelector('[data-h="fra"][data-v="${C}"]').disabled`)), "En spiller som ikke har delt ut, er sperret");
  t.sjekk(/Testspiller A har delt ut på dette kortet/.test(await t.tekst(".py-regel")), "Skjermen sier ikke hvorfor A ikke kan velges");
  await t.bilde("en-gang-hver");
  await t.js(`(() => { const k = document.querySelector('[data-h="fra"][data-v="${A}"]'); k.disabled = false; k.click(); })()`);
  await t.sov(200);
  t.sjekk((await tilstand()).spill.krav.steg === "hvem", "Regelen «én gang per kort» kan omgås");
  await t.klikk('[data-h="avbryt"]');
  await t.vent("document.querySelector('.py-pyramide')");
  await pause();

  // c) C bluffs and B accepts: B has now been handed sips twice on this card
  await kravet(C, B, "godta");
  x = await sist();
  t.sjekk(x.sant === false && x.taker === B && x.slurker === 1, "En bløff som ble godtatt, ble ført feil");
  t.sjekk(!/bløff/i.test(await t.tekst(".py-resultat")), "En godtatt bløff blir avslørt på skjermen");
  await tilPyramiden();

  // d) No ganging up: D can't pick B. D picks A, who passes («Står over»): no sips
  await t.klikk('[data-h="krav"]');
  await t.vent("document.querySelector('[data-h=\"fra\"]')");
  await pause();
  await t.klikk(`[data-h="fra"][data-v="${D}"]`);
  await t.vent("document.querySelector('[data-h=\"til\"]')");
  t.sjekk(await t.js(`document.querySelector('[data-h="til"][data-v="${B}"]').disabled`), "En spiller kan få slurker mer enn to ganger på samme kort");
  t.sjekk(/Testspiller B har fått slurker to ganger/.test(await t.tekst(".py-regel")), "Skjermen sier ikke hvorfor B ikke kan velges");
  await t.bilde("skjermet");
  await t.js(`(() => { const k = document.querySelector('[data-h="til"][data-v="${B}"]'); k.disabled = false; k.click(); })()`);
  await t.sov(200);
  t.sjekk((await tilstand()).spill.krav.steg === "til", "Vernet mot at alle går løs på én, kan omgås");
  await pause();
  await t.klikk(`[data-h="til"][data-v="${A}"]`);
  await t.vent("document.querySelector('[data-h=\"staover\"]')");
  const duell = await t.tekst(".py-duell");
  t.sjekk(/Taperen tar 3 slurker/.test(duell) && /vinneren får 1 poeng/.test(duell), `Duellen forklarer ikke innsatsen: «${duell}»`);
  await t.bilde("duell");
  await pause();
  await t.klikk('[data-h="staover"]');
  await t.vent("document.querySelector('.py-resultat .stempel')");
  x = await sist();
  t.sjekk(x.over === true && x.slurker === 0 && !x.ropte, "«Står over» ga slurker");
  t.sjekk(/helt greit/.test(await t.tekst(".py-resultat")), "«Står over» får ikke en vennlig tekst");
  await t.bilde("star-over");
  await tilPyramiden();

  // e) A real bluff caught: B (no 7) is called by A → B takes 1 + 2, A gets a point
  await kravet(B, A, "bloff");
  x = await sist();
  t.sjekk(!x.sant && x.ropte && x.taker === B && x.slurker === 3 && !x.bytte, "En avslørt bløff ble ført feil");
  t.sjekk(/Bløff/i.test(await t.tekst(".py-resultat")), "Bløffen ble ikke avslørt");
  t.sjekk(/\+1 poeng til Testspiller A/.test(await t.tekst(".py-poeng")), "Skjermen sier ikke at den som avslørte, får poeng");
  await t.bilde("bloff");
  await tilPyramiden();
  t.sjekk(await t.js(`document.querySelector('[data-h="krav"]').disabled`), "«Jeg har …» kan trykkes selv om alle har delt ut på kortet");
  t.sjekk(/Alle har delt ut/.test(await t.tekst(".py-info")), "Skjermen sier ikke at alle har delt ut på kortet");
  t.sjekk(await overDokk(".py-status"), "«Alle har delt ut» skjules bak knappene");
  // Four hand-outs on the card: the screen keeps to the latest two (all four are in «Hvem ga hva»)
  const utdelt = await t.js(`({ rader: document.querySelectorAll(".py-krav li").length, flere: (document.querySelector(".py-flere") || {}).textContent || "" })`);
  t.sjekk(utdelt.rader === 2 && /Og 2 til/.test(utdelt.flere), `Pyramideskjermen skal bare liste de to siste utdelingene på kortet: ${JSON.stringify(utdelt)}`);
  await t.bilde("alle-har-delt-ut");

  // Card 2 (row 1, a 9 – A has one): C calls bluff and is wrong
  await snu();
  await kravet(A, C, "bloff");
  x = await sist();
  t.sjekk(x.sant && x.ropte && x.taker === C && x.slurker === 3, "Et ekte krav som ble kalt bløff, ble ført feil");
  t.sjekk(x.bytte && x.bytte.gammelt === kort(0, 9) && x.bytte.nytt === NYTT_1, "Beviskortet ble ikke byttet mot et nytt fra bunken");
  s = await tilstand();
  t.sjekk(s.spill.hender[A][1] === NYTT_1 && !s.spill.hender[A].includes(kort(0, 9)) && s.spill.bunke.length === 20, "Hånda fikk ikke det nye kortet");
  t.sjekk((await t.antall(".py-bevis .sk-kort")) === 1, "Kortet ble ikke vist fram som bevis");
  t.sjekk(/\+1 poeng til Testspiller A/.test(await t.tekst(".py-poeng")), "Skjermen sier ikke at den som ble mistrodd, får poeng");
  t.sjekk(/nytt hemmelig kort/.test(await t.tekst(".py-bytte")), "Skjermen sier ikke at kortet byttes");
  t.sjekk(/Testspiller A/.test(await t.tekst('[data-h="tilnytt"]')), "Mangler «Gi mobilen til …» etter et bevis");
  await t.bilde("sant");
  // «Angre» before the new card is seen: the hand-out and the swap are both taken back
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('.py-pyramide')");
  s = await tilstand();
  t.sjekk(s.spill.hender[A][1] === kort(0, 9) && s.spill.bunke.length === 21 && s.spill.bunke[20] === NYTT_1 && !s.spill.nytt && s.spill.logg.length === 4, "«Angre» la ikke beviskortet tilbake på hånda");
  await pause();
  await kravet(A, C, "bloff");
  // Reload on the result: still there, and the new card still waits for its owner
  await t.lastSide(t.side, "document.querySelector('[data-h=\"tilnytt\"]')");
  await t.klikk('[data-h="tilnytt"]');
  await t.vent("document.querySelector('.skjerm-nytt .mappe')");
  t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[A]), "Det nye kortet skal til den som viste beviset");
  t.sjekk(await t.js(`document.querySelector('[data-h="nyttferdig"]').disabled`), "«Ferdig» kan trykkes før det nye kortet er sett");
  await t.bilde("nytt-kort");
  // Back before the card is seen: the verdict again, where «Angre» still is
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('[data-h=\"tilnytt\"]')");
  s = await tilstand();
  t.sjekk(s.spill.fase === "krav" && s.spill.nytt && !s.spill.nytt.sett && (await t.finnes('[data-h="angre"]')), "Tilbake fra det nye kortet skal vise resultatet med «Angre»");
  // Back once more: out to the game's home – and «Fortsett» returns to the verdict (no way round the card)
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.hjem-knapper [data-h=\"fortsett\"]')");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('[data-h=\"tilnytt\"]')");
  s = await tilstand();
  t.sjekk(s.spill.nytt && !s.spill.nytt.sett && s.spill.hender[A][1] === NYTT_1, "«Fortsett» skal komme tilbake til resultatet mens det nye kortet venter");
  await pause();
  await t.klikk('[data-h="tilnytt"]');
  await t.vent("document.querySelector('.skjerm-nytt .mappe')");
  const slipp = await t.hold(".mappe", 800);
  t.sjekk((await synligeKort()) === 1, "Det nye kortet vises ikke mens man holder");
  await t.bilde("ser-nytt-kort");
  await slipp();
  s = await tilstand();
  t.sjekk(s.spill.nytt && s.spill.nytt.sett === true && s.spill.angre === false, "Det ble ikke registrert at det nye kortet ble sett");
  await pause();
  await t.klikk('[data-h="nyttferdig"]');
  await t.vent("document.querySelector('.py-pyramide')");
  t.sjekk((await tilstand()).spill.nytt === null, "Det nye kortet ble ikke ryddet bort");
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "«Angre» skal være borte når det nye kortet er sett");

  // Cards 3–5 (row 1): nobody claims
  for (let n = 2; n < 5; n++) await snu();

  // Card 6 (row 2, a 9): A's 9 is gone, so the same claim is a bluff now – D accepts
  await snu();
  await kravet(A, D, "godta");
  x = await sist();
  t.sjekk(x.sant === false && x.slurker === 2 && x.taker === D, "Et bevist kort gjelder fortsatt etter at det er byttet ut");
  await tilPyramiden();

  // Card 7: reload and back + continue in the middle
  await snu();
  await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
  t.sjekk((await tilstand()).spill.snudd === 7, "Pyramiden ble glemt ved omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="fortsett"]'), "Mangler «Fortsett» mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.py-pyramide')");
  await snu();
  await snu();
  t.sjekk((await tilstand()).spill.snudd === 9, "Rad 2 ble ikke snudd ferdig");

  // Before row 3: a real water break (its own screen, one tap)
  await snu();
  await t.vent("document.querySelector('.skjerm-vann')");
  s = await tilstand();
  t.sjekk(s.spill.fase === "vann" && s.spill.snudd === 9, "Vannpausen før rad 3 snudde kortet uten å vente");
  t.sjekk(/Vannpause/.test(await t.tekst("#skjerm h1")) && /rad 3/i.test(await t.tekst(".py-vannpause")), "Vannpausen sier ikke hva som venter");
  await t.sov(300);
  await t.bilde("vannpause");
  await t.lastSide(t.side, "document.querySelector('.skjerm-vann')");
  await t.klikk('[data-h="vannferdig"]');
  await t.vent("document.querySelector('.py-pyramide')");
  s = await tilstand();
  t.sjekk(s.spill.snudd === 10 && s.spill.vann.includes(9) && (await t.antall(".py-pyramide .sk-kort.sk-opp")) === 10, "Etter vannpausen ble ikke neste kort snudd");
  for (let n = 10; n < 14; n++) await snu();
  t.sjekk((await tilstand()).spill.snudd === 14 && !(await t.finnes(".skjerm-vann")), "Det kom en vannpause for mye");

  // Before the top card: water again. Then the top card (5 sips): B calls D's true claim a bluff
  await snu();
  await t.vent("document.querySelector('.skjerm-vann')");
  t.sjekk(/toppkortet/i.test(await t.tekst(".py-vannpause")), "Vannpausen før toppkortet mangler");
  await t.klikk('[data-h="vannferdig"]');
  await t.vent("document.querySelector('.py-pyramide')");
  t.sjekk((await tilstand()).spill.snudd === 15, "Toppkortet ble ikke snudd");
  await t.klikk('[data-h="krav"]');
  await t.vent("document.querySelector('[data-h=\"fra\"]')");
  await pause();
  await t.klikk(`[data-h="fra"][data-v="${D}"]`);
  await pause();
  await t.klikk(`[data-h="til"][data-v="${B}"]`);
  await t.vent("document.querySelector('[data-h=\"bloff\"]')");
  const topp = await t.tekst(".py-duell");
  t.sjekk(/tar 5 slurker/.test(topp) && !/[67] slurker/.test(topp) && /vinneren får 1 poeng/.test(topp), `Toppkortet: maks 5 slurker, og poeng på spill: «${topp}»`);
  await t.bilde("duell-toppkortet");
  await pause();
  await t.klikk('[data-h="bloff"]');
  await t.vent("document.querySelector('.py-resultat .stempel')", 6000);
  x = await sist();
  t.sjekk(x.sant && x.ropte && x.taker === B && x.slurker === 5 && x.bytte && x.bytte.nytt === NYTT_2, "Feil bløff-rop på toppkortet ble ført feil");
  t.sjekk(/\+1 poeng til Testspiller D/.test(await t.tekst(".py-poeng")), "Feil bløff-rop på toppkortet ga ikke poeng til den som ble mistrodd");
  await t.klikk('[data-h="tilnytt"]');
  await t.vent("document.querySelector('.skjerm-nytt .mappe')");
  const slipp2 = await t.hold(".mappe", 800);
  await slipp2();
  await pause();
  await t.klikk('[data-h="nyttferdig"]');
  await t.vent("document.querySelector('.py-pyramide')");
  await t.bilde("hele-pyramiden");

  // The log: who gave to whom – never how much anyone drank
  await t.klikk('[data-h="logg"]');
  s = await tilstand();
  t.sjekk((await t.antall("#ark .py-logg li li")) === s.spill.logg.length && s.spill.logg.length === 7, "«Hvem ga hva» viser ikke alle utdelingene");
  t.sjekk(!/slurk/i.test(await t.tekst("#ark .py-logg")), "Loggen viser hvor mye noen har drukket");
  await t.bilde("logg");
  await t.klikk('#ark [data-h="lukk-ark"]');
  t.sjekk(Math.max(...s.spill.logg.map((y) => y.slurker)) <= 5, "Mer enn 5 slurker på én gang");

  // 5. The memory finale (D's hand has the swapped-in card)
  await t.klikk('[data-h="ferdig"]');
  for (let i = 0; i < 4; i++) {
    await t.vent("document.querySelector('[data-h=\"visfasit\"]')");
    t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[i]), "Feil spiller i finalen");
    t.sjekk((await t.antall(".py-finale-hand .sk-kort.sk-opp")) === 0, "Kortene vises før de skal snus");
    await pause();
    await t.klikk('[data-h="visfasit"]');
    await t.vent("document.querySelector('[data-h=\"husket\"]')");
    if (i === 0) {
      await t.sov(500);
      await t.bilde("finale");
    }
    await pause();
    await t.klikk(`[data-h="husket"][data-v="${4 - i}"]`);
    if (i === 1) {
      await t.klikk('[data-h="angrefinale"]');
      t.sjekk((await tilstand()).spill.fin.husket[1] == null, "«Angre» i finalen virket ikke");
      await pause();
      await t.klikk('[data-h="husket"][data-v="3"]');
    }
    if (i === 0) await t.bilde("finale-alle-fire");
    await pause();
    await t.klikk('[data-h="nestefinale"]');
  }

  // 6. The crowning: points for bluffing and reading the others, never for drinking.
  // A: one bluff nobody caught, one bluff caught, once called a bluffer wrongly = 3 · D: 2 · C: 1 · B: 0
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(700);
  s = await tilstand();
  const h1 = (await t.tekst("#skjerm h1")).trim();
  t.sjekk(h1 === "Testspiller A vinner!", `Feil vinner: «${h1}»`);
  const liste = await t.js(`[...document.querySelectorAll(".poengliste li")].map((li) => li.querySelector(".navn").textContent.trim() + "=" + li.querySelector(".sum").textContent.trim())`);
  t.sjekk(liste.join(" ") === "Testspiller A=3 Testspiller D=2 Testspiller C=1 Testspiller B=0", `Feil poeng: ${liste.join(" ")}`);
  const priser = await t.tekst(".py-priser");
  t.sjekk(/bløffmester/i.test(priser) && /skarpeste øye/i.test(priser) && /uskyldig dømt/i.test(priser), "Kåringen mangler bløffmester, skarpeste øye eller uskyldig dømt");
  t.sjekk(/elefanthukommelse/i.test(priser), "Kåringen mangler hukommelsesprisen");
  t.sjekk(!/tok \d+ slurk|delt ut|til sammen|\d+ slurk/i.test(await t.tekst("#skjerm")), "Kåringen viser slurker per person eller totalt");
  t.sjekk(await t.finnes(".py-vann"), "Sluttskjermen mangler vannpåminnelsen");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Mangler «Alle spill»");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  t.sjekk(kveld && kveld.spill.some((y) => y.id === "pyramiden"), "Resultatet ble ikke registrert i «Kveldens gjeng»");
  t.sjekk(s._aktiv === false, "Et ferdig spill skal ikke regnes som pågående");
  await t.bilde("kaaring", true);
  await lukkTips();

  // 7. Short screens: what the screen is about stays above the buttons
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  const ferdig = (await tilstand()).spill;
  const midtI = (ekstra) => ({ ...ferdig, fase: "pyramide", snudd: 12, krav: null, nytt: null, angre: false, talt: false, logg: ferdig.logg.filter((y) => y.kort < 12), ...ekstra });
  for (const [b, h, navn] of [[320, 568, "320"], [Math.min(375, b0), 560, "375x560"]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    // Two hand-outs on the card: one line instead of the list, and it stays above the buttons
    await lagre(midtI({ snudd: 1, logg: ferdig.logg.filter((y) => y.kort === 0).slice(0, 2) }), "pyramide");
    await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
    await t.sov(300);
    t.sjekk(/2 av 4 har delt ut/.test(await t.tekst(".py-sum")) && (await overDokk(".py-sum")), `«2 av 4 har delt ut» mangler eller skjules bak knappene på ${navn}`);
    t.sjekk(!(await t.js(`!!document.querySelector(".py-krav").offsetParent`)), `Lista over utdelinger skal vike for én linje på ${navn}`);
    await t.bilde(`utdelt-${navn}`);
    // A proven claim (A has a king): the point and the swap are both readable above the button
    await lagre(midtI({ snudd: 10 }), "pyramide");
    await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
    await kravet(A, B, "bloff");
    await t.sov(400);
    for (const velger of [".py-resultat-tekst", ".py-poeng", ".py-bytte"]) t.sjekk(await overDokk(velger), `Etter et bevis skjules «${velger}» bak knappen på ${navn}`);
    await t.bilde(`bevis-${navn}`);
    await lagre(midtI(), "pyramide");
    await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
    await t.sov(300);
    t.sjekk(await overDokk(".py-info h1"), `Spørsmålet skjules bak knappene på ${navn}`);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Siden er for bred på ${navn}`);
    await t.bilde(`pyramide-${navn}`);
    await t.klikk('[data-h="krav"]');
    await t.vent("document.querySelector('[data-h=\"fra\"]')");
    await t.bilde(`hvem-${navn}`);
    await pause();
    await t.klikk(`[data-h="fra"][data-v="${A}"]`);
    await pause();
    await t.klikk(`[data-h="til"][data-v="${B}"]`);
    await t.vent("document.querySelector('[data-h=\"bloff\"]')");
    t.sjekk(await overDokk(".py-duell"), `Forklaringen av bløff skjules bak knappene på ${navn}`);
    await t.bilde(`svar-${navn}`);
    await t.klikk('[data-h="avbryt"]');
    await t.vent("document.querySelector('.py-pyramide')");
    // The water break and the new-card screen
    await lagre(midtI({ fase: "vann", snudd: 14, vann: [9] }), "vann");
    await t.lastSide(t.side, "document.querySelector('.skjerm-vann')");
    t.sjekk(await overDokk(".py-vannpause .ingress"), `Vannpausen skjules bak knappen på ${navn}`);
    await t.bilde(`vannpause-${navn}`);
    await lagre(midtI({ fase: "nytt", nytt: { i: D, plass: 0, sett: false } }), "nytt");
    await t.lastSide(t.side, "document.querySelector('.skjerm-nytt .mappe')");
    const slipp3 = await t.hold(".mappe", 700);
    t.sjekk((await synligeKort()) === 1, `Det nye kortet vises ikke på ${navn}`);
    const inni = await t.js(`(() => { const m = document.querySelector(".mappe").getBoundingClientRect(); const k = [...document.querySelectorAll(".mappe-bakside .sk-kort")].find((el) => el.offsetParent).getBoundingClientRect(); return k.top >= m.top && k.bottom <= m.bottom; })()`);
    t.sjekk(inni, `Det nye kortet stikker ut av det hemmelige kortet på ${navn}`);
    await t.bilde(`nytt-kort-${navn}`);
    await slipp3();
  }

  // 8. Landscape (844 × 390): the pyramid, the question and the buttons are all on screen
  // (Screenshots only when the whole run is in landscape: the runner compares widths with its own.)
  const bildeLiggende = async (navn) => {
    if (b0 >= 844) await t.bilde(navn);
  };
  await t.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  // (Card 1 with all four hand-outs: the fullest the pyramid screen gets.)
  await lagre(midtI({ snudd: 1 }), "pyramide");
  await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
  await t.sov(300);
  for (const velger of [".py-pyramide", ".py-info h1", ".py-status", '[data-h="krav"]', '[data-h="snu"]', '[data-h="logg"]']) t.sjekk(await iVinduet(velger), `Liggende mobil, alle har delt ut: «${velger}» er ikke synlig uten å rulle`);
  await bildeLiggende("liggende-alle-har-delt-ut");
  // (Card 10 is a king, and A has one: the claim below is true and ends with a proof and a swap.)
  await lagre(midtI({ snudd: 10 }), "pyramide");
  await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
  await t.sov(300);
  for (const velger of [".py-pyramide", ".py-info h1", '[data-h="krav"]', '[data-h="snu"]']) t.sjekk(await iVinduet(velger), `Liggende mobil: «${velger}» er ikke synlig uten å rulle`);
  await bildeLiggende("liggende-pyramide");
  await t.klikk('[data-h="krav"]');
  await t.vent("document.querySelector('[data-h=\"fra\"]')");
  await pause();
  await t.klikk(`[data-h="fra"][data-v="${A}"]`);
  await pause();
  await t.klikk(`[data-h="til"][data-v="${B}"]`);
  await t.vent("document.querySelector('[data-h=\"bloff\"]')");
  for (const velger of [".py-duell", '[data-h="godta"]', '[data-h="bloff"]', '[data-h="staover"]']) t.sjekk(await iVinduet(velger), `Liggende mobil, duellen: «${velger}» er ikke synlig uten å rulle`);
  await bildeLiggende("liggende-duell");
  await pause();
  await t.klikk('[data-h="bloff"]');
  await t.vent("document.querySelector('.py-resultat .stempel')", 6000);
  await t.sov(400);
  for (const velger of [".py-bevis .sk-kort", ".py-resultat-tekst", ".py-poeng", ".py-bytte", ".dokk .knapp"]) t.sjekk(await iVinduet(velger), `Liggende mobil, resultatet: «${velger}» er ikke synlig uten å rulle`);
  await bildeLiggende("liggende-resultat");
  await lagre(midtI({ fase: "vann", snudd: 14, vann: [9] }), "vann");
  await t.lastSide(t.side, "document.querySelector('.skjerm-vann')");
  for (const velger of [".py-vannpause h1", ".py-vannpause .ingress", '[data-h="vannferdig"]']) t.sjekk(await iVinduet(velger), `Liggende mobil, vannpausen: «${velger}» er ikke synlig uten å rulle`);
  await bildeLiggende("liggende-vannpause");
  await lagre(midtI({ fase: "nytt", nytt: { i: D, plass: 0, sett: false } }), "nytt");
  await t.lastSide(t.side, "document.querySelector('.skjerm-nytt .mappe')");
  for (const velger of [".mappe", "#skjerm h1", '[data-h="nyttferdig"]']) t.sjekk(await iVinduet(velger), `Liggende mobil, nytt kort: «${velger}» er ikke synlig uten å rulle`);
  await bildeLiggende("liggende-nytt-kort");
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });

  // 9. Three players work; seven use one deck, eight or more use two (spare cards for the swaps)
  await t.start({ navn: NAVN.slice(0, 3) });
  await t.klikk('[data-h="alder-ja"]');
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke tre spillere");
  for (let i = 3; i < 7; i++) await t.klikk('[data-h="spiller-legg-til"]', 40);
  t.sjekk(!/to kortstokker/.test(await t.tekst("#spillerboks")), "Sju spillere skal klare seg med én kortstokk");
  for (let i = 7; i < 10; i++) await t.klikk('[data-h="spiller-legg-til"]', 40);
  t.sjekk(/to kortstokker/.test(await t.tekst("#spillerboks")), "Med ti spillere skal det stå at vi bruker to kortstokker");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.mappe')");
  s = await tilstand();
  t.sjekk(s.spill.doble && s.spill.hender.length === 10 && s.spill.pyramide.length === 15 && s.spill.bunke.length === 104 - 40 - 15, "Ti spillere fikk ikke kort fra to kortstokker");
}
