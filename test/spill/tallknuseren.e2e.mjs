// Tallknuseren (sudoku): «Bytt nivå» and the level choice, a Lett board played with taps and the keyboard (a clash
// and undo, notes that tidy themselves up, a hint), reload and back + continue mid-game, pause,
// solving it to the result screen with a record; «Dagens sudoku» is the same on every phone and its
// result screen shows the streak; Ekspert is made fast; the board fits at 320 px and 375×560
// without scrolling.
export default async function (t) {
  const celle = (i) => `.tk-celle[data-i="${i}"]`;
  const tast = (d) => `.tk-tast[data-v="${d}"]`;
  const spill = async () => (await t.tilstand()).spill;
  async function knapp(key, code) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, text: key.length === 1 ? key : undefined });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
    await t.sov(60);
  }
  // Fill every empty cell with the solution (scripted taps: select the cell, press the number).
  const losResten = () =>
    t.js(`(() => {
      const sp = Rusj.S.spill;
      for (let i = 0; i < 81; i++) {
        if (sp.v[i]) continue;
        document.querySelector('.tk-celle[data-i="' + i + '"]').click();
        document.querySelector('.tk-tast[data-v="' + sp.losning[i] + '"]').click();
      }
    })()`);
  async function passer(navn) {
    const m = await t.js(`(() => {
      const b = document.querySelector(".tk-brett").getBoundingClientRect();
      const tast = document.querySelector('.tk-tast[data-v="9"]').getBoundingClientRect();
      const verk = document.querySelector(".tk-verktoy").getBoundingClientRect();
      return { rull: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, brettTopp: b.top, brettBunn: b.bottom, brettBredde: b.width, verkTopp: verk.top, tastBunn: tast.bottom, h: innerHeight, w: innerWidth };
    })()`);
    t.sjekk(m.rull <= 1 && m.bred <= 0, `${navn}: siden kan scrolles (${m.rull}px ned, ${m.bred}px sidelengs)`);
    t.sjekk(m.brettTopp >= 0 && m.brettBunn <= m.verkTopp + 1, `${navn}: brettet overlapper knappene (${Math.round(m.brettBunn)} > ${Math.round(m.verkTopp)})`);
    t.sjekk(m.tastBunn <= m.h, `${navn}: talltastene er under skjermkanten`);
    t.sjekk(m.brettBredde >= Math.min(m.w, 480) * 0.75, `${navn}: brettet er for lite (${Math.round(m.brettBredde)}px)`);
  }

  await t.start();
  // The install tip (shown at most twice per phone after a good result) would cover the screenshots.
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  // The main button starts at once on the last level (the first time: lett); «Bytt nivå» opens the choice.
  t.sjekk(/Start spill · lett/.test(await t.tekst('[data-h="nytt"]')), "Hovedknappen viser ikke nivået den starter");
  t.sjekk(await t.finnes('[data-h="dagens"]'), "Mangler «Dagens sudoku» på hjem-skjermen");
  await t.klikk('[data-h="bytt"]');
  t.sjekk((await t.tekst("#skjerm h1")) === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  await t.klikk('[data-h="niva"][data-v="middels"]');
  await t.bilde("oppsett");
  await t.klikk('[data-h="niva"][data-v="lett"]');
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelectorAll('.tk-celle').length === 81");
  await t.sov(500);
  let s = await spill();
  t.sjekk(s.niva === "lett" && !s.dagens, "Startet ikke et lett brett");
  t.sjekk(await t.js(`Tallknuseren.tell(Rusj.S.spill.gitt.split("").map(Number), 2) === 1`), "Brettet har ikke nøyaktig én løsning");
  t.sjekk(await t.js(`Tallknuseren.grader(Rusj.S.spill.gitt.split("").map(Number)).niva === 1`), "Det lette brettet krever mer enn de enkleste teknikkene");
  await passer("390×844");
  await t.bilde("brett");

  const los = s.losning.split("").map(Number);
  const tomme = [...s.gitt].map((x, i) => (x === "0" ? i : -1)).filter((i) => i >= 0);
  const rad = (i) => Math.floor(i / 9);

  // A number that clashes with one in the same row turns red; undo takes it away.
  const i0 = tomme[0];
  const krasj = [...Array(9)].map((_, c) => Number(s.gitt[rad(i0) * 9 + c])).find((x) => x);
  await t.trykk(celle(i0));
  t.sjekk((await spill()).valgt === i0, "Et trykk på ruta valgte den ikke");
  await t.klikk(tast(krasj));
  t.sjekk(await t.finnes(`${celle(i0)}.konflikt`), "Et tall som krasjer, blir ikke rødt");
  await t.bilde("konflikt");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await spill()).v[i0] === 0 && !(await t.finnes(".tk-celle.konflikt")), "Angre fjernet ikke tallet som krasjet");

  // Notes: two pencil marks; setting one of them in the same row removes that mark by itself.
  const i1 = tomme.find((i) => tomme.some((j) => j !== i && rad(j) === rad(i)));
  const j1 = tomme.find((j) => j !== i1 && rad(j) === rad(i1));
  const a = los[j1];
  const b = los[i1];
  await t.klikk('[data-h="notater"]');
  t.sjekk(await t.finnes('#tk-notater[aria-pressed="true"]'), "Notater slo seg ikke på");
  await t.trykk(celle(i1));
  await t.klikk(tast(a));
  await t.klikk(tast(b));
  s = await spill();
  t.sjekk(s.n[i1] === ((1 << a) | (1 << b)), "Notatene ble ikke lagret i ruta");
  t.sjekk((await t.antall(`${celle(i1)} .tk-not i:not(:empty)`)) === 2, "Notatene vises ikke i ruta");
  await t.bilde("notater");
  await t.klikk('[data-h="notater"]');
  await t.trykk(celle(j1));
  await t.klikk(tast(a));
  s = await spill();
  t.sjekk(s.v[j1] === a && s.n[i1] === 1 << b, "Notatet forsvant ikke da tallet ble satt i samme rad");

  // The keyboard: an arrow moves the selection, a number key writes.
  const k1 = tomme.find((i) => i % 9 > 0 && !s.v[i] && i !== i1);
  await t.trykk(celle(k1 - 1));
  await knapp("ArrowRight", "ArrowRight");
  t.sjekk((await spill()).valgt === k1, "Piltasten flyttet ikke valget");
  await knapp(String(los[k1]), "Digit" + los[k1]);
  t.sjekk((await spill()).v[k1] === los[k1], "Talltasten skrev ikke i ruta");

  // A hint: one right number in an empty cell, with an explanation.
  const ledig = (await spill()).v.findIndex((x) => !x);
  await t.trykk(celle(ledig));
  await t.klikk('[data-h="hint"]', 300);
  s = await spill();
  t.sjekk(s.hintIgjen === 2 && s.hint.length === 1 && s.v[s.hint[0]] === los[s.hint[0]], "Hintet satte ikke et riktig tall");
  t.sjekk(await t.js("document.querySelector('.tk-melding.vis')?.textContent.length > 20"), "Hintet forklarer ikke hvorfor");
  await t.bilde("hint");

  // Reload mid-game: numbers, notes and hints are still there.
  const forOmlasting = await spill();
  await t.lastSide(t.side, "document.querySelectorAll('.tk-celle').length === 81");
  s = await spill();
  t.sjekk(s.v.join() === forOmlasting.v.join() && s.n.join() === forOmlasting.n.join() && s.hintIgjen === 2, "Brettet ble ikke som før etter omlasting");
  t.sjekk((await t.antall(".tk-celle.bruker")) >= 2, "Tallene du satte vises ikke etter omlasting");

  // Back to home and continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.tk-celle').length === 81");

  // Pause hides the board and stops the clock.
  await t.klikk('[data-h="pause"]');
  t.sjekk(await t.finnes(".tk-pauseboks:not([hidden])"), "Pause vises ikke");
  const tid1 = (await spill()).tid;
  await t.sov(1200);
  t.sjekk((await spill()).tid === tid1, "Klokka gikk under pausen");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-spill"]');
  t.sjekk(await t.finnes(".tk-pauseboks[hidden]"), "Pausen forsvant ikke");

  // The clock also stands still while the rules are open.
  await t.klikk("#reglerknapp", 700);
  const tid2 = await t.js("Rusj.S.spill.tid");
  await t.sov(1200);
  t.sjekk((await t.js("Rusj.S.spill.tid")) === tid2, "Klokka gikk mens reglene var åpne");
  await t.klikk('#ark [data-h="lukk-ark"]', 500);
  t.sjekk(await t.js("(() => { const a = document.querySelector('#tk-tid').textContent; return new Promise((ok) => setTimeout(() => ok(document.querySelector('#tk-tid').textContent !== a), 1300)); })()"), "Klokka startet ikke igjen etter reglene");

  // Solve the rest: the board waves and the result screen shows the time and a first record.
  await losResten();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(900);
  await t.bilde("slutt", true);
  s = await t.tilstand();
  t.sjekk(s.rekorder && s.rekorder.lett && s.rekorder.lett.antall === 1, "Rekorden for Lett ble ikke lagret");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  await t.klikk("#tilbake");
  t.sjekk(/Lett/.test(await t.tekst(".tk-rekorder")), "Beste tid vises ikke på hjem-skjermen");
  await t.bilde("hjem-rekord");

  // Today's sudoku: made from the date, the same on every phone, and the level follows the weekday.
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelectorAll('.tk-celle').length === 81");
  s = await spill();
  const forventet = await t.js(`(() => {
    const d = Rusj.dag();
    const niva = ["ekspert", "lett", "lett", "middels", "middels", "vanskelig", "vanskelig"][(d.nr + 4) % 7];
    const o = Tallknuseren.lagDaglig(d.tekst, d.nr);
    return { niva, gitt: Array.from(o.oppgave).join(""), dag: d.tekst, nr: d.nr };
  })()`);
  t.sjekk(s.dagens === forventet.dag && s.niva === forventet.niva && s.gitt === forventet.gitt, "Dagens sudoku er ikke laget fra datoen");
  await t.bilde("dagens");
  await losResten();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(900);
  t.sjekk(await t.finnes('[data-h="del"]'), "Dagens sudoku mangler «Del resultatet»");
  s = await t.tilstand();
  t.sjekk(s.daglig.tider[forventet.dag] > 0 && s.daglig.rekke === 1, "Dagens sudoku ble ikke registrert som løst");
  const forside = await t.js(`JSON.parse(localStorage.getItem("rusj.daglig") || "{}").tallknuseren || null`);
  t.sjekk(forside && forside.vunnet && forside.rekke === 1 && forside.nr === forventet.nr, "Forsiden får ikke vite at dagens sudoku er løst (R.dagligFerdig)");
  await t.bilde("dagens-slutt", true);

  // «Spill igjen» gives a new board at the same level at once.
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelectorAll('.tk-celle').length === 81");
  s = await spill();
  t.sjekk(s.niva === forventet.niva && !s.dagens && s.gitt !== forventet.gitt, "«Spill igjen» ga ikke et nytt brett");

  // Every level is made quickly, with exactly one solution.
  const fart = await t.js(`(() => {
    const ut = {};
    for (const niva of ["lett", "middels", "vanskelig", "ekspert"]) {
      const t0 = performance.now();
      let unike = 0;
      for (let k = 1; k <= 8; k++) {
        const o = Tallknuseren.lag(niva, k * 977);
        if (Tallknuseren.tell(o.oppgave, 2) === 1 && Tallknuseren.grader(o.oppgave).niva === ["lett", "middels", "vanskelig", "ekspert"].indexOf(niva) + 1) unike++;
      }
      ut[niva] = { ms: (performance.now() - t0) / 8, unike };
    }
    return ut;
  })()`);
  for (const [niva, f] of Object.entries(fart)) {
    t.sjekk(f.unike === 8, `${niva}: ${8 - f.unike} av 8 brett var ikke unike eller på feil nivå`);
    t.sjekk(f.ms < 400, `${niva}: et brett tok ${Math.round(f.ms)} ms å lage`);
  }

  // Ekspert from the menu, then the smallest phones: everything fits without scrolling.
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes(".tk-daglinje") && !(await t.finnes('[data-h="dagens"]')), "Hjem-skjermen viser ikke at dagens sudoku er løst");
  await t.klikk('[data-h="bytt"]');
  await t.klikk('[data-h="niva"][data-v="ekspert"]');
  await t.klikk('[data-h="start"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]'), "Spør ikke før et brett som pågår blir erstattet");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelectorAll('.tk-celle').length === 81");
  t.sjekk((await spill()).niva === "ekspert", "Startet ikke et ekspertbrett");
  t.sjekk((await t.tilstand()).oppsett.niva === "ekspert", "Nivået ble ikke husket til neste gang");
  await t.trykk(celle((await spill()).v.findIndex((x) => !x)));
  await t.klikk('[data-h="notater"]');
  await t.bilde("ekspert");
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [w, h] of [
    [320, 568],
    [375, 560],
  ].filter(([w]) => w <= bredde0)) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(700);
    await passer(`${w}×${h}`);
    await t.bilde(`ekspert-${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
}
