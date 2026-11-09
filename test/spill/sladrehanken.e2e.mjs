// Sladrehanken: «Fem liv» with four players — countdown, expose, lose lives, undo, knock-outs, the
// "everyone out at once doesn't count" rule, reload mid-game, back + continue (also during the heart
// animation), a ghost tap after «Ingen har gjort det», and the crowning. Then «Bare kort» (next +
// swipe + quit) and an early finish with a shared win.
export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const liv = async () => (await t.tilstand()).spill.liv.join(",");

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('[data-h="modus"][data-v="liv"][aria-pressed="true"]'), "«Fem liv» er ikke valgt fra start");
  t.sjekk(!(await t.tilstand()).oppsett.pakker.includes("fest"), "Festpakken (18+) skal ikke være med fra start");
  t.sjekk((await t.antall(".spiller")) === 4, "Spillerlista viser ikke fire spillere");
  await t.bilde("oppsett", true);

  await t.klikk('[data-h="pakke"][data-v="fest"]');
  await t.klikk('[data-h="pakke"][data-v="mat"]');
  let s = await t.tilstand();
  t.sjekk(s.oppsett.pakker.includes("fest") && !s.oppsett.pakker.includes("mat"), "Pakkevalget ble ikke lagret");

  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  await t.bilde("kort");
  s = await t.tilstand();
  t.sjekk(s.spill.liv.length === 4 && s.spill.liv.every((l) => l === 5), "Alle skal starte med fem liv");
  t.sjekk(/^Jeg har aldri/.test(await t.tekst(".storkort-tekst")), "Kortet begynner ikke med «Jeg har aldri»");
  t.sjekk(s._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  const forste = s.spill.kort;

  // Swiping skips the card
  await t.sveip(".storkort", -240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  t.sjekk((await t.tilstand()).spill.kort !== forste, "Sveip ga ikke nytt kort");

  // One card: countdown, tap who has done it, confirm.
  async function tilVelg() {
    await pause();
    await t.klikk('[data-h="avslor-na"]', 50);
    await t.vent("document.querySelector('[data-h=\"avslor\"]')", 8000);
  }
  async function runde(hvem, bilde) {
    await tilVelg();
    for (const i of hvem) await t.klikk(`[data-h="avslor"][data-v="${i}"]`);
    if (bilde) await t.bilde(bilde);
    await t.klikk('[data-h="ferdig"]');
    await t.vent("document.querySelector('[data-h=\"avslor-na\"], [data-h=\"videre\"]')", 5000);
  }

  await runde([0, 1], "hvem-har");
  t.sjekk((await liv()) === "4,4,5,5", `Feil liv etter første kort: ${await liv()}`);

  // Undo: the lives come back and the same card returns to «Hvem har gjort det?» with the same choice
  t.sjekk(await t.finnes('[data-h="angre"]'), "Mangler «Angre» etter at liv ble trukket");
  await pause();
  await t.klikk('[data-h="angre"]');
  s = await t.tilstand();
  t.sjekk((await liv()) === "5,5,5,5" && s.spill.fase === "velg" && s.spill.valgt.join() === "0,1", "«Angre» ga ikke tilbake livene og valget");
  t.sjekk((await t.antall("#skjerm h1")) === 1, "«Hvem har gjort det?» skal ha nøyaktig én h1");
  await pause();
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')", 5000);
  t.sjekk((await liv()) === "4,4,5,5", "Feil liv etter nytt forsøk");

  // «Ingen har gjort det» costs nothing, and a ghost tap on the button that appears under the finger is ignored
  await tilVelg();
  await t.klikk('[data-h="ferdig"]', 20);
  await t.trykk('[data-h="avslor-na"]'); // a real tap right after the redraw: the kit ignores it
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "les" && (await t.finnes("#nedtelling[hidden]")), "Et spøketrykk rett etter «Ingen har gjort det» startet nedtellingen");
  t.sjekk((await liv()) === "4,4,5,5", "«Ingen har gjort det» skal ikke koste liv");

  // Reload mid-game keeps everything
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="avslor-na"]'), "Spillet fortsatte ikke etter omlasting");
  t.sjekk((await liv()) === "4,4,5,5", "Livene forsvant ved omlasting");

  // Back to home keeps the game: «Fortsett» is the main button, «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')");

  // Testspiller A loses three more lives …
  for (let n = 0; n < 3; n++) await runde([0]);
  t.sjekk((await liv()) === "1,4,5,5", `Feil liv før siste liv: ${await liv()}`);

  // … and the last one, but «tilbake» during the heart animation must leave everything as it was
  await tilVelg();
  await t.klikk('[data-h="avslor"][data-v="0"]');
  await t.klikk('[data-h="ferdig"]', 60);
  await t.klikk("#tilbake", 1300);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && s.spill.liv[0] === 1 && s.spill.fase === "velg", "Tilbake under hjerteanimasjonen endret spillet likevel");
  await t.klikk('[data-h="fortsett"]');
  await pause();
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.sladre-ute')", 5000);
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Ute-skjermen viser ikke Testspiller A");
  t.sjekk(/Mest erfaren/.test(await t.tekst("#skjerm")), "Den første ute får ikke tittelen «Mest erfaren»");
  await t.bilde("ute", true);
  await t.klikk('[data-h="videre"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')");
  await tilVelg();
  t.sjekk(!(await t.finnes('[data-h="avslor"][data-v="0"]')), "En spiller som er ute, kan fortsatt velges");
  await t.klikk('[data-h="ferdig"]');

  // B, C and D are exposed four times: B goes out, C and D end on one life each
  for (let n = 0; n < 4; n++) await runde([1, 2, 3], n === 3 ? "tre-avslort" : null);
  await t.vent("document.querySelector('.sladre-ute')");
  t.sjekk((await liv()) === "0,0,1,1", `Feil liv etter fire kort: ${await liv()}`);
  await pause();
  await t.klikk('[data-h="videre"]');

  // Both last players exposed at once: the card doesn't count
  await runde([2, 3]);
  t.sjekk((await liv()) === "0,0,1,1", "Kortet skulle ikke telle når alle ville røket ut samtidig");

  // C goes out → D is the most innocent
  await runde([2]);
  await t.vent("document.querySelector('[data-h=\"videre\"]')");
  await pause();
  await t.klikk('[data-h="videre"]');
  await t.vent("document.querySelector('.sladre-rang')");
  await t.bilde("slutt", true);
  t.sjekk(/Testspiller D vinner/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk(/Testspiller A/.test(await t.tekst(".sladre-tittel")), "«Mest erfaren» skal være den første ute");
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");

  // «Bare kort»: next, swipe, quit («Endre oppsett» after the crowning doesn't ask)
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Endre oppsett» etter kåringen skal ikke spørre");
  await t.klikk('[data-h="modus"][data-v="kort"]');
  t.sjekk(!(await t.finnes(".spiller")), "«Bare kort» skal ikke trenge spillere");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  await t.bilde("bare-kort");
  const k1 = (await t.tilstand()).spill.kort;
  await t.klikk('[data-h="neste"]', 400);
  const k2 = (await t.tilstand()).spill.kort;
  t.sjekk(k1 !== k2, "«Neste kort» ga ikke nytt kort");
  await pause();
  await t.sveip(".storkort", 240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  t.sjekk((await t.tilstand()).spill.nr === 3, "Sveip i «Bare kort» ga ikke nytt kort");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('[data-h=\"nytt\"]')");
  t.sjekk((await t.tilstand()).spill === null, "Spillet ble ikke avsluttet");

  // Early finish: crown now → shared win between the three still on five lives
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="liv"]');
  await t.klikk('[data-h="start"]');
  await runde([0]);
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="0"]');
  await t.vent("document.querySelector('.sladre-rang')");
  t.sjekk(/delt seier/i.test(await t.tekst(".banner .etikett")), "Lik stilling skal gi delt seier");
  t.sjekk(/Testspiller B, Testspiller C og Testspiller D vinner/.test(await t.tekst("#skjerm h1")), "Delt seier skal liste navnene «A, B og C»");
  await t.bilde("delt-seier");
}
