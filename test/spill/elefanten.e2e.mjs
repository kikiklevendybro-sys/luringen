// Elefanten (memory): two players on the rusj-gjengen board (a miss passes the turn, a pair gives an
// extra turn), reload and back + continue mid-game, the winner screen; then a solo game on 30 cards
// that must fit the screen (also at 320 px) and saves a personal record.
export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="tema"][data-v="gjengen"]');
  await t.klikk('[data-h="storrelse"][data-v="12"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.bilde("oppsett", true);
  t.sjekk((await t.tilstand()).antall === 2, "Fikk ikke lagt til spiller 2");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 12");
  await t.sov(900);

  const kort = (await t.tilstand()).spill.kort;
  const par = (k) => [kort.indexOf(k), kort.lastIndexOf(k)];
  const kortet = (i) => `.ele-kort[data-v="${i}"]`;

  // A miss: the turn goes to player 2
  const ulik = kort.findIndex((k) => k !== kort[0]);
  await t.klikk(kortet(0), 120);
  await t.klikk(kortet(ulik), 500);
  await t.bilde("to-ulike");
  let s = await t.tilstand();
  t.sjekk(s.spill.trekk === 1 && s.spill.tur === 1, "Turen gikk ikke videre etter to ulike kort");
  await t.sov(1100);
  t.sjekk((await t.antall(".ele-kort.opp")) === 0, "Ulike kort snudde seg ikke tilbake");

  // A pair: point and an extra turn for player 2
  const [p1, p2] = par(kort[0]);
  await t.klikk(kortet(p1), 120);
  await t.klikk(kortet(p2), 450);
  await t.bilde("par");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 1 && s.spill.tur === 1, "Et par ga ikke poeng og ekstra tur");
  t.sjekk((await t.antall(".ele-kort.funnet")) === 2, "Paret ble ikke markert som funnet");

  // One card up, then reload: found pairs stay, the half move is kept
  const neste = kort.find((k) => k !== kort[0]);
  const [n1, n2] = par(neste);
  await t.klikk(kortet(n1), 300);
  await t.lastSide(t.side, "document.querySelector('.ele-kort')");
  t.sjekk((await t.antall(".ele-kort.funnet")) === 2, "Funnet par forsvant etter omlasting");
  t.sjekk((await t.antall(".ele-kort.opp:not(.funnet)")) === 1, "Det snudde kortet forsvant etter omlasting");
  await t.klikk(kortet(n2), 450);
  t.sjekk((await t.tilstand()).spill.poeng[1] === 2, "Paret etter omlasting ble ikke telt");

  // Back to home and continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ele-kort')");

  // Player 2 clears the board
  for (const k of [...new Set(kort)].filter((k) => k !== kort[0] && k !== neste)) {
    const [x, y] = par(k);
    await t.klikk(kortet(x), 90);
    await t.klikk(kortet(y), 140);
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.bilde("vinner", true);
  t.sjekk(/Testspiller B vinner/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke");

  // Solo on 30 cards
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="1"]');
  await t.klikk('[data-h="tema"][data-v="dyr"]');
  await t.klikk('[data-h="storrelse"][data-v="30"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 30");
  await t.sov(1400);
  const solo = (await t.tilstand()).spill.kort;
  const soloPar = (k) => [solo.indexOf(k), solo.lastIndexOf(k)];
  t.sjekk(await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1"), "30 kort får ikke plass uten å scrolle");
  // Two real finger taps in quick succession (the kit's ghost-tap guard must not swallow the second)
  const forsteUlik = solo.findIndex((k) => k !== solo[0]);
  await t.trykk(kortet(0));
  await t.trykk(kortet(forsteUlik));
  s = await t.tilstand();
  t.sjekk(s.spill.trekk === 1 && (await t.antall(".ele-kort.opp")) === 2, "Raske, ekte trykk snudde ikke begge kortene");
  await t.sov(250);
  await t.bilde("solo-30");

  // The smallest phone, then back to the size the runner started with (390×844 or --bredde/--hoyde).
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(1300);
  t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), "Brettet er for bredt på 320 px");
  t.sjekk(await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1"), "30 kort får ikke plass uten å scrolle på 320×568");
  await t.bilde("solo-30-320px");
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  for (const k of [...new Set(solo)]) {
    const [x, y] = soloPar(k);
    await t.klikk(kortet(x), 80);
    await t.klikk(kortet(y), 120);
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.sov(1200);
  await t.bilde("solo-ferdig");
  s = await t.tilstand();
  t.sjekk(s.rekorder && s.rekorder["30"] && s.rekorder["30"].trekk === 16, "Rekorden for 30 kort ble ikke lagret");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");

  // Back to the game's home screen: the record is shown there
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.ele-rekorder')");
  t.sjekk(/30 kort/.test(await t.tekst(".ele-rekorder")), "Rekorden vises ikke på hjem-skjermen");
  await t.bilde("hjem-rekord");

  // Leave during the end celebration and start a new game at once: the old celebration must
  // not push the new game to the result screen.
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="storrelse"][data-v="12"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 12");
  const tolv = (await t.tilstand()).spill.kort;
  for (const k of [...new Set(tolv)]) {
    await t.klikk(kortet(tolv.indexOf(k)), 60);
    await t.klikk(kortet(tolv.lastIndexOf(k)), 90);
  }
  t.sjekk(await t.js("Rusj.S.spill.ferdig && Rusj.S.skjerm === 'spill'"), "Sluttfeiringen startet ikke");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 12");
  await t.sov(2600);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "spill" && !(await t.js("Rusj.S.spill.ferdig")), "Et nytt spill ble sendt til sluttskjermen av den forrige feiringen");
}
