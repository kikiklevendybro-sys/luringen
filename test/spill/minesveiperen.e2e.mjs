// Minesveiperen (minesweeper): on Lett the first tap is always safe and opens an area, a long press
// flags, flag mode, chording on a number, reload and back + continue mid-game, the face restarts
// (asking first), a win with a record; a lost game («Bom!»); Ekspert scrolls inside its own frame
// and zooms, and the controls stay on screen at 320×568 and 375×560.
export default async function (t) {
  const celle = (i) => `.ms-c[data-i="${i}"]`;
  const spill = async () => (await t.tilstand()).spill;
  const naboer = (sp, i) => {
    const ut = [];
    const x = i % sp.b;
    const y = Math.floor(i / sp.b);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx || dy) && x + dx >= 0 && x + dx < sp.b && y + dy >= 0 && y + dy < sp.h) ut.push((y + dy) * sp.b + x + dx);
    return ut;
  };
  const tall = (sp, i) => naboer(sp, i).filter((j) => sp.mine[j]).length;
  // Scripted activation of a cell (like Enter on a focused cell).
  const aktiver = (liste) => t.js(`${JSON.stringify(liste)}.forEach((i) => document.querySelector('.ms-c[data-i="' + i + '"]').click())`);

  await t.start();
  // The install tip (shown at most twice per phone after a good result) would cover the screenshots.
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  // The main button starts at once (the first time: lett); «Bytt nivå» opens the choice.
  t.sjekk(/Start spill · lett/.test(await t.tekst('[data-h="nytt"]')), "Hovedknappen viser ikke nivået den starter");
  await t.klikk('[data-h="bytt"]');
  t.sjekk((await t.tekst("#skjerm h1")) === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  await t.bilde("oppsett");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelectorAll('.ms-c').length === 81");
  await t.sov(400);
  t.sjekk(await t.js("document.documentElement.scrollHeight <= innerHeight + 1"), "Siden kan scrolles på Lett");
  await t.bilde("lett");

  // The first tap (a real finger) is safe and opens an area.
  await t.trykk(celle(40));
  let s = await spill();
  t.sjekk(s.mine && !s.mine[40] && naboer(s, 40).every((j) => !s.mine[j]), "Første trykk var ikke trygt");
  t.sjekk(s.apen.filter((x) => x).length >= 9, "Første trykk åpnet ikke et område");
  t.sjekk(s.mine.reduce((a, b) => a + b, 0) === 10, "Lett skal ha 10 miner");

  // A long press on a closed mine next to the open area plants a flag.
  const kant = s.mine.map((m, i) => i).filter((i) => s.mine[i] && naboer(s, i).some((j) => s.apen[j]));
  await t.trykk(celle(kant[0]), 650);
  s = await spill();
  t.sjekk(s.flagg[kant[0]] === 1 && !s.apen[kant[0]], "Et langt trykk satte ikke flagg");
  t.sjekk((await t.tekst("#ms-igjen")) === "9", "Minetelleren teller ikke ned for flagget");
  await t.bilde("flagg");

  // Flag mode: a tap flags; then back to opening.
  await t.klikk('[data-h="modus"][data-v="flagg"]');
  t.sjekk(await t.finnes(".ms-vindu.flaggmodus"), "Flaggmodus vises ikke");
  const andre = kant.find((i) => i !== kant[0]) ?? s.mine.findIndex((m, i) => m && i !== kant[0]);
  await t.trykk(celle(andre));
  s = await spill();
  t.sjekk(s.flagg[andre] === 1, "Et trykk i flaggmodus satte ikke flagg");
  await t.bilde("flaggmodus");
  await t.trykk(celle(andre));
  t.sjekk((await spill()).flagg[andre] === 0, "Et nytt trykk i flaggmodus tok ikke bort flagget");
  await t.klikk('[data-h="modus"][data-v="apne"]');

  // Chording: flag every mine around an open number, tap the number, the rest around it opens.
  s = await spill();
  const tallCelle = s.apen
    .map((a, i) => i)
    .find((i) => s.apen[i] && tall(s, i) > 0 && naboer(s, i).some((j) => !s.apen[j] && !s.mine[j]) && naboer(s, i).some((j) => s.mine[j]));
  if (tallCelle == null) t.feil("Fant ikke et tall å akkordere på");
  else {
    for (const j of naboer(s, tallCelle)) if (s.mine[j] && !s.flagg[j]) await t.trykk(celle(j), 650);
    const trygge = naboer(s, tallCelle).filter((j) => !s.mine[j] && !s.apen[j]);
    await t.trykk(celle(tallCelle));
    s = await spill();
    t.sjekk(trygge.every((j) => s.apen[j]), "Et trykk på tallet åpnet ikke resten rundt det");
    await t.bilde("akkord");
  }

  // The clock stands still while the rules are open.
  await t.klikk("#reglerknapp", 700);
  const tid0 = await t.js("Rusj.S.spill.tid");
  await t.sov(1200);
  t.sjekk((await t.js("Rusj.S.spill.tid")) === tid0, "Klokka gikk mens reglene var åpne");
  await t.klikk('#ark [data-h="lukk-ark"]', 400);

  // Reload mid-game: open cells, flags and the clock come back.
  const for1 = await spill();
  await t.lastSide(t.side, "document.querySelectorAll('.ms-c').length === 81");
  s = await spill();
  t.sjekk(s.apen.join() === for1.apen.join() && s.flagg.join() === for1.flagg.join(), "Brettet ble ikke som før etter omlasting");
  t.sjekk((await t.antall(".ms-c.f")) === for1.flagg.filter((f) => f).length, "Flaggene vises ikke etter omlasting");

  // Back to home and continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.ms-c').length === 81");

  // The face asks before throwing a game in progress away.
  await t.klikk('[data-h="ny"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]'), "Fjeset spurte ikke før brettet ble kastet");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');

  // Open every safe cell: the board waves and the result screen shows the first record.
  s = await spill();
  await aktiver(s.mine.map((m, i) => i).filter((i) => !s.mine[i] && !s.apen[i]));
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(900);
  await t.bilde("vunnet", true);
  s = await t.tilstand();
  t.sjekk(s.rekorder.lett && s.rekorder.lett.tid > 0 && s.stat.lett.vunnet === 1, "Rekorden for Lett ble ikke lagret");
  t.sjekk(/Godt jobba|Ny rekord/.test(await t.tekst("#skjerm h1")), "Seieren vises ikke");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");

  // «Spill igjen», then step on a mine: Kabom!
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelectorAll('.ms-c').length === 81");
  await aktiver([0]);
  s = await spill();
  t.sjekk(s.startet && !s.mine[0], "Første trykk etter «Spill igjen» var ikke trygt");
  await aktiver([s.mine.indexOf(1)]);
  await t.sov(700);
  await t.bilde("smell");
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(600);
  t.sjekk(/Kabom/.test(await t.tekst("#skjerm h1")), "Tapet vises ikke som «Kabom!»");
  t.sjekk((await t.tilstand()).stat.lett.spilt === 2, "Tapet ble ikke telt");
  await t.bilde("tapt", true);

  // Middels opens with the whole board on the screen («+» zooms in).
  await t.klikk('[data-h="bytt"]');
  await t.klikk('[data-h="niva"][data-v="middels"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ms-c').length === 256");
  await t.sov(300);
  t.sjekk(await t.js("(() => { const r = document.querySelector('.ms-rulle'); return r.scrollWidth <= r.clientWidth + 1 && r.scrollHeight <= r.clientHeight + 1; })()"), "Middels får ikke plass på skjermen når det starter");
  await t.bilde("middels");

  // Ekspert: 16 × 30, scrolls inside its frame (never the page), starts in the top-left corner
  // with shaded edges where it goes on, and zooms.
  await t.klikk("#tilbake");
  await t.klikk('[data-h="bytt"]');
  await t.klikk('[data-h="niva"][data-v="ekspert"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ms-c').length === 480");
  await t.sov(400);
  const m1 = await t.js(`(() => { const r = document.querySelector(".ms-rulle"); return { side: document.documentElement.scrollHeight - innerHeight, h: r.scrollHeight - r.clientHeight, w: r.scrollWidth - r.clientWidth, x: r.scrollLeft, y: r.scrollTop, c: Number(document.querySelector(".ms-brett").dataset.c) }; })()`);
  t.sjekk(m1.side <= 1, "Siden kan scrolles på Ekspert");
  t.sjekk(m1.h > 0 && m1.c >= 30, `Ekspert-brettet skal kunne rulles med store ruter (ruter ${m1.c}px)`);
  t.sjekk(m1.x === 0 && m1.y === 0, "Ekspert starter ikke i hjørnet oppe til venstre");
  t.sjekk(await t.finnes(".ms-vindu.mer-n"), "Kanten viser ikke at brettet fortsetter");
  await t.bilde("ekspert");
  // The cell nearest the middle of the visible frame.
  const midt = await t.js(`(() => {
    const r = document.querySelector(".ms-rulle").getBoundingClientRect();
    let beste = -1, avstand = 1e9;
    for (const el of document.querySelectorAll(".ms-c")) {
      const b = el.getBoundingClientRect();
      const d = Math.hypot(b.x + b.width / 2 - (r.left + r.width / 2), b.y + b.height / 2 - (r.top + r.height / 2));
      if (d < avstand) { avstand = d; beste = Number(el.dataset.i); }
    }
    return beste;
  })()`);
  await t.trykk(celle(midt));
  s = await spill();
  t.sjekk(s.mine.reduce((a, b) => a + b, 0) === 99 && !s.mine[midt], "Ekspert skal ha 99 miner, og første trykk skal være trygt");
  await t.bilde("ekspert-apnet");
  for (let k = 0; k < 4; k++) if (!(await t.js(`document.querySelector('[data-h="zoom"][data-v="-1"]').disabled`))) await t.klikk('[data-h="zoom"][data-v="-1"]', 200);
  const m2 = await t.js(`(() => { const r = document.querySelector(".ms-rulle"); return { h: r.scrollHeight - r.clientHeight, w: r.scrollWidth - r.clientWidth }; })()`);
  t.sjekk(m2.h <= 1 && m2.w <= 1, "Helt utzoomet får ikke hele Ekspert-brettet plass");
  await t.bilde("ekspert-hele");
  t.sjekk((await t.tilstand()).zoom.ekspert === 0, "Zoomen ble ikke husket");

  // The smallest phones: the board frame and the controls fit without scrolling the page.
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [w, h] of [
    [320, 568],
    [375, 560],
  ].filter(([w]) => w <= bredde0)) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(700);
    const m = await t.js(`(() => {
      const r = document.querySelector(".ms-rulle").getBoundingClientRect();
      const k = document.querySelector(".ms-modus").getBoundingClientRect();
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, rulle: r.height, kontroll: k.bottom, h: innerHeight };
    })()`);
    t.sjekk(m.side <= 1 && m.bred <= 0, `${w}×${h}: siden kan scrolles`);
    t.sjekk(m.kontroll <= m.h && m.rulle > 200, `${w}×${h}: brettet eller knappene får ikke plass`);
    await t.bilde(`ekspert-${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
}
