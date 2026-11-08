// Pekefingeren: set up with scoring, play a few cards (button, swipe, vote, draw), finish.
export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk((await t.antall(".spiller")) >= 3, "Spillerlista viser ikke tre spillere");

  // Toggle a pack off and on, add a player
  await t.klikk('[data-h="pakke"][data-v="kaos"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.includes("kaos"), "Kaos-pakken ble ikke valgt");
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.skrivInn("#navn-3", "Testspiller D");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  await t.bilde("kort");
  const forste = (await t.tilstand()).spill.kort;

  // Swipe to the next card
  await t.sveip(".storkort", -240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  const andre = (await t.tilstand()).spill.kort;
  t.sjekk(andre !== forste, "Sveip ga ikke nytt kort");

  // Countdown and vote
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('[data-h=\"vinner\"]')", 8000);
  await t.bilde("hvem-fikk-flest");
  await t.klikk('[data-h="vinner"][data-v="1"]');
  t.sjekk((await t.tilstand()).spill.poeng[1] === 1, "Poenget ble ikke gitt til spiller 2");

  // A draw gives no points
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('[data-h=\"uavgjort\"]')", 8000);
  await t.klikk('[data-h="uavgjort"]');
  t.sjekk(Object.values((await t.tilstand()).spill.poeng).reduce((a, b) => a + b, 0) === 1, "Uavgjort skulle ikke gi poeng");

  // Back to home keeps the game; continue works
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.klikk('[data-h="fortsett"]');
  await t.klikk('[data-h="slutt"]');
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke");
}
