// Vinglepetter: count votes (split bar + verdict), swipe, reload mid-game, back + continue, a ghost tap
// after «Neste dilemma», the group's verdict at the end; then a round without counting, and quitting.
export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);

  await t.start();
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('[data-h="telle"][aria-pressed="true"]'), "«Tell stemmer» skal være på fra start");
  t.sjekk(!(await t.tilstand()).oppsett.pakker.includes("fest"), "Festpakken (18+) skal ikke være med fra start");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="pakke"][data-v="ekkelt"]');
  await t.klikk('[data-h="pakke"][data-v="fest"]');
  const o = (await t.tilstand()).oppsett;
  t.sjekk(o.pakker.includes("fest") && !o.pakker.includes("ekkelt"), "Pakkevalget ble ikke lagret");

  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.vingle-kort')");
  await t.bilde("kort");
  t.sjekk((await t.antall(".vingle-halv")) === 2, "Kortet er ikke delt i to");
  t.sjekk((await t.tilstand())._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  const forste = (await t.tilstand()).spill.kort;
  await t.sveip(".storkort", 240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  t.sjekk((await t.tilstand()).spill.kort !== forste, "Sveip ga ikke nytt dilemma");
  await pause();

  // Countdown → count → result: 3 against 1
  await t.klikk('[data-h="velg"]', 50);
  await t.vent("document.querySelector('#teller-a')", 8000);
  await enH1("tell");
  t.sjekk(await t.finnes('[data-h="vis-svar"][disabled]'), "«Vis resultatet» skal være av før noen har stemt");
  for (let i = 0; i < 3; i++) await t.klikk('#teller-a [data-v="1"]');
  await t.klikk('#teller-b [data-v="1"]');
  await t.klikk('#teller-b [data-v="1"]');
  await t.klikk('#teller-b [data-v="-1"]');
  let s = await t.tilstand();
  t.sjekk(s.spill.a === 3 && s.spill.b === 1, `Feil telling: ${s.spill.a}–${s.spill.b}`);
  const tekster = await t.js("Array.from(document.querySelectorAll('.vingle-teller-tekst')).map((e) => e.textContent)");
  t.sjekk(tekster.length === 2 && tekster[0] !== tekster[1], "Tellerradene viser samme tekst for begge valgene");
  await t.bilde("tell");
  await t.klikk('[data-h="vis-svar"]');
  await t.vent("document.querySelector('.vingle-stolpe')", 5000);
  await enH1("resultat");
  await t.sov(1100);
  await t.bilde("svar");
  t.sjekk(/vinglepetter|resten|ulv/i.test(await t.tekst(".vingle-dom")), `Feil kommentar for 3 mot 1: ${await t.tekst(".vingle-dom")}`);
  t.sjekk(/75 %/.test(await t.tekst(".vingle-stolpe")), "Stolpen viser ikke 75 %");

  // A ghost tap on «3 · 2 · 1 – Velg!», which appears under the finger after «Neste dilemma», is ignored
  await t.klikk('[data-h="neste"]', 220);
  await t.trykk('[data-h="velg"]'); // a real tap right after the redraw: the kit ignores it
  await t.sov(300);
  t.sjekk((await t.tilstand()).spill.fase === "les" && (await t.finnes("#nedtelling[hidden]")), "Et spøketrykk rett etter «Neste dilemma» startet nedtellingen");

  // 2 against 2, with a reload in the middle of the counting
  await t.klikk('[data-h="velg"]', 50);
  await t.vent("document.querySelector('#teller-a')", 8000);
  await t.klikk('#teller-a [data-v="1"]');
  await t.lastSide(t.side, "document.querySelector('#skjerm h1, #skjerm h2')");
  t.sjekk(await t.finnes("#teller-a"), "Tellingen fortsatte ikke etter omlasting");
  t.sjekk((await t.tilstand()).spill.a === 1, "Stemmene forsvant ved omlasting");
  await t.klikk('#teller-a [data-v="1"]');
  await t.klikk('#teller-b [data-v="1"]');
  await t.klikk('#teller-b [data-v="1"]');
  await t.klikk('[data-h="vis-svar"]');
  await t.vent("document.querySelector('.vingle-stolpe')", 5000);
  t.sjekk(/midten|Dødt|likt/i.test(await t.tekst(".vingle-dom")), `Feil kommentar for 2 mot 2: ${await t.tekst(".vingle-dom")}`);

  // Back to home keeps the game: «Fortsett» is the main button, «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.vingle-stolpe')");

  // Unanimous: 4 against 0
  await t.klikk('[data-h="neste"]', 800);
  await t.klikk('[data-h="velg"]', 50);
  await t.vent("document.querySelector('#teller-b')", 8000);
  for (let i = 0; i < 4; i++) await t.klikk('#teller-b [data-v="1"]');
  await t.klikk('[data-h="vis-svar"]');
  await t.vent("document.querySelector('.vingle-stolpe')", 5000);
  t.sjekk(/Enstemmig|Alle som én|enighet/i.test(await t.tekst(".vingle-dom")), "Feil kommentar for 0 mot 4");
  await t.sov(1100);
  await t.bilde("enstemmig");

  // The verdict («Avslutt» asks first and says what happens)
  t.sjekk((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte skal bare hete «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.vingle-boks')");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  await t.bilde("slutt", true);
  t.sjekk(/3 dilemmaer/.test(await t.tekst(".merker")) && /1 enstemmig\b/.test(await t.tekst(".merker")), `Dommen teller feil: ${await t.tekst(".merker")}`);
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk(/mest uenige/i.test(await t.tekst("#skjerm")), "Dommen viser ikke dilemmaet dere var mest uenige om");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");

  // Play again: a fresh game
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.vingle-kort')");
  s = await t.tilstand();
  t.sjekk(s.spill.nr === 1 && s.spill.logg.length === 0, "«Spill igjen» startet ikke et nytt spill");

  // Without counting: countdown → a prompt to defend the choice → next
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="telle"]');
  t.sjekk((await t.tilstand()).oppsett.telle === false, "«Tell stemmer» ble ikke skrudd av");
  await t.klikk('[data-h="start"]');
  await pause();
  await t.klikk('[data-h="velg"]', 50);
  await t.vent("document.querySelector('.vingle-prompt')", 8000);
  t.sjekk(!(await t.finnes("#teller-a")), "Tellerne vises selv om tellingen er av");
  await t.bilde("uten-telling");
  await t.klikk('[data-h="neste"]', 400);
  t.sjekk((await t.tilstand()).spill.fase === "les", "«Neste dilemma» ga ikke nytt kort");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('[data-h=\"nytt\"]')");
  t.sjekk((await t.tilstand()).spill === null, "Spillet ble ikke avsluttet");
}
