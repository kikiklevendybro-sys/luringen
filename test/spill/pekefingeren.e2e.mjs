// Pekefingeren: set up with scoring, play a few cards (button, swipe, vote, undo, draw), check that a
// running game is kept («Fortsett» first, «Nytt spill» asks), a ghost tap can't start a countdown,
// and a 1–1 tie crowns both players.

// Two real finger taps 90 ms apart on the same spot (a nervous double tap). The kit only drops a
// second tap that lands near the first one, so a scripted click + a tap elsewhere is not a ghost tap.
async function dobbeltrykk(t, sel) {
  await t.js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center" })`);
  await t.sov(120);
  const p = await t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const under = [];
  for (let i = 0; i < 2; i++) {
    under.push(await t.js(`document.elementFromPoint(${p.x}, ${p.y})?.closest("[data-h]")?.dataset.h ?? null`));
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.sov(30);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (i === 0) await t.sov(60);
  }
  return under; // the buttons under the finger at each tap
}

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);

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
  t.sjekk((await t.tilstand())._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  const forste = (await t.tilstand()).spill.kort;

  // Swipe to the next card
  await t.sveip(".storkort", -240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  const andre = (await t.tilstand()).spill.kort;
  t.sjekk(andre !== forste, "Sveip ga ikke nytt kort");
  await pause();

  // Countdown and vote
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('[data-h=\"vinner\"]')", 8000);
  await enH1("hvem fikk flest");
  await t.bilde("hvem-fikk-flest");
  await t.klikk('[data-h="vinner"][data-v="1"]');
  t.sjekk((await t.tilstand()).spill.poeng[1] === 1, "Poenget ble ikke gitt til spiller 2");
  await pause();

  // Undo: the point goes away and the same card comes back to the vote
  t.sjekk(/Testspiller B/.test(await t.tekst('[data-h="angre"]')), "Mangler «Angre +1 til Testspiller B» på neste kort");
  await t.bilde("angre");
  await t.klikk('[data-h="angre"]');
  let s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 0 && s.spill.fase === "velg" && s.spill.kort === andre, "«Angre» tok ikke tilbake poenget og kortet");
  await pause();
  await t.klikk('[data-h="vinner"][data-v="1"]');
  await pause();
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('[data-h=\"vinner\"]')", 8000);
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "«Angre» skal forsvinne ved neste handling");
  await t.klikk('[data-h="vinner"][data-v="0"]');
  await pause();

  // A draw gives no points – and a ghost tap on the button that appears under the finger is ignored
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('[data-h=\"uavgjort\"]')", 8000);
  await pause();
  const under = await dobbeltrykk(t, '[data-h="uavgjort"]'); // the second tap lands on what the redraw put there
  t.sjekk(under[0] === "uavgjort" && under[1] && under[1] !== "uavgjort", `Det andre trykket traff ingen ny knapp (${under.join(" → ")}), så spøketrykket ble ikke prøvd`);
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "les" && (await t.finnes("#nedtelling[hidden]")), "Et spøketrykk rett etter «Uavgjort» startet nedtellingen");
  t.sjekk(Object.values(s.spill.poeng).reduce((a, b) => a + b, 0) === 2, "Uavgjort skulle ikke gi poeng");

  // Back to home keeps the game: «Fortsett» is the main button, «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).spill !== null, "Spillet forsvant selv om vi avbrøt");
  await t.klikk('[data-h="fortsett"]');
  await pause();
  await t.klikk('[data-h="slutt"]');
  t.sjekk(/Avslutt/.test(await t.tekst('[data-h="slutt"]')), "Lenken for å avslutte skal bare hete «Avslutt»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.pall')");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  await t.bilde("slutt", true);
  t.sjekk(/Testspiller A og Testspiller B vinner/.test(await t.tekst("#skjerm h1")), `1–1 skal kåre begge: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");

  // After the crowning the game is over: «Endre oppsett» doesn't ask
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Endre oppsett» etter kåringen skal ikke spørre");
  await t.vent("document.querySelector('[data-h=\"start\"]')");

  await (await import("../a11y/kit-sjekk.mjs")).default(t); // the kit's accessibility promises
}
