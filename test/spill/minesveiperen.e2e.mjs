// Minesveiperen (minesweeper): «Dagens minefelt» (the same board for everyone, a given first cell,
// a lost try and a new one on the same board, solved → streak, countdown and share) beside a free
// board (two games under way at once), and #dagens. On Lett the first tap is always safe and opens
// an area and the board needs no guess, a long press flags, flag mode, chording on a number, reload
// and back + continue mid-game, the face restarts (asking first), a win with a record; a lost game
// («Kabom!»); Middels and Ekspert scroll inside their own frame, and zoomed all the way out the
// board is a map where a tap zooms in; the controls stay on screen at 320×568 and 375×560.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en minesveiperen): the texts are checked
// in Norwegian only (t.norsk); elsewhere the numbers, the state, the address and the links.
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
  const antallCeller = () => t.js("Rusj.S.spill.b * Rusj.S.spill.h");
  const brettKlart = () => t.vent("Rusj.S.spill && document.querySelectorAll('.ms-c').length === Rusj.S.spill.b * Rusj.S.spill.h");

  await t.start();
  // The install tip (shown at most twice per phone after a good result) would cover the screenshots.
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  // Today's minefield is the main button; a free board starts at once (the first time: lett).
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .ms-kal'), "Dagens minefelt er ikke hovedknappen på hjemskjermen");
  t.sjekk(!t.norsk || /Start spill · lett/.test(await t.tekst('[data-h="nytt"]')), "Knappen for et fritt brett viser ikke nivået den starter");
  await t.klikk('[data-h="bytt"]');
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")) === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  t.sjekk(await t.finnes('.bryter[data-h="uten"][aria-pressed="true"]'), "«Uten gjetting» er ikke på fra start");
  await t.bilde("oppsett");
  await t.klikk("#tilbake");

  // ----- Dagens minefelt -----
  await t.klikk('[data-h="dagens"]');
  await brettKlart();
  await t.sov(400);
  let s = await spill();
  const dag = await t.js("Rusj.dag()");
  t.sjekk(s.dagens === dag.tekst && s.dagNr === dag.nr && s.forsok === 1, "Dagens minefelt har ikke dagens dato");
  t.sjekk(Array.isArray(s.mine) && !s.mine[s.start] && naboer(s, s.start).every((j) => !s.mine[j]), "Startruta på dagens minefelt er ikke trygg");
  t.sjekk(await t.js(`document.querySelector('.ms-c.start') && Number(document.querySelector('.ms-c.start').dataset.i) === ${s.start}`), "Startruta er ikke merket");
  t.sjekk(await t.js(`(() => { const a = document.querySelectorAll('.ms-c[tabindex="0"]'); return a.length === 1 && Number(a[0].dataset.i) === ${s.start}; })()`), "Tab går ikke til startruta");
  t.sjekk(await t.js("!document.querySelector('.ms-merke').hidden"), "Dagens minefelt sier ikke «Uten gjetting»");
  t.sjekk((!t.norsk || /dagens minefelt/i.test(await t.tekst("#topp-tittel"))), "Topplinja sier ikke «Dagens minefelt»");
  const dagensMiner = s.mine.join("");
  await t.bilde("dagens");
  // The same board on every phone: the engine gives the same mines again.
  t.sjekk(await t.js(`(() => { const d = Rusj.dag(); const o = Minesveiperen.lagDaglig(d.tekst, d.nr); return o.trygg && o.start === Rusj.S.spill.start && o.mine.join("") === Rusj.S.spill.mine.join(""); })()`), "Dagens brett er ikke det motoren lager for datoen");
  // The first tap opens the given cell, wherever the finger lands (here: a corner far from it).
  const hjorne = s.start === 0 ? s.b * s.h - 1 : 0;
  await t.trykk(celle(hjorne));
  s = await spill();
  t.sjekk(s.startet && s.apen[s.start] === 1 && s.apen.filter((x) => x).length >= 9, "Første trykk åpnet ikke området rundt startruta");
  t.sjekk(!(await t.finnes(".ms-c.start")), "Startmerket ble ikke borte etter første trykk");
  await t.bilde("dagens-apnet");
  // A mine: «Kabom!», and the same board waits for a second try.
  await aktiver([s.mine.indexOf(1)]);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(600);
  t.sjekk((t.norsk ? /Kabom/ : /Kab/).test(await t.tekst("#skjerm h1")) && (t.norsk ? /Prøv igjen/ : /\S/).test(await t.tekst('.dokk [data-h="dagens"]')), "Et tapt forsøk på dagens minefelt tilbyr ikke «Prøv igjen»");
  let alt = await t.tilstand();
  t.sjekk(alt.daglig.forsok && alt.daglig.forsok.n === 1 && !alt.daglig.dager[dag.tekst] && !alt.stat.lett, "Forsøket på dagens minefelt ble ikke telt riktig");
  await t.bilde("dagens-tapt", true);
  await t.klikk('.dokk [data-h="dagens"]');
  await brettKlart();
  s = await spill();
  t.sjekk(s.mine.join("") === dagensMiner && s.forsok === 2 && !s.startet, "Andre forsøk er ikke det samme brettet");
  await t.trykk(celle(s.start));
  t.sjekk((t.norsk ? /2\. forsøk/ : /2/).test(await t.js("document.querySelector('.ms-hud').textContent")), "Brettet viser ikke at det er andre forsøk");

  // A free board beside it: neither wipes the other.
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett dagens/ : /\d:\d\d/).test(await t.tekst('[data-h="dagens"]')), "Hjemskjermen tilbyr ikke å fortsette dagens minefelt");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "Et fritt brett spurte om å kaste dagens minefelt");
  await t.vent("Rusj.S.spill && !Rusj.S.spill.dagens && document.querySelectorAll('.ms-c').length === 81");
  await t.sov(400);
  t.sjekk(await t.js("document.documentElement.scrollHeight <= innerHeight + 1"), "Siden kan scrolles på Lett");
  t.sjekk(await t.js(`document.querySelectorAll('.ms-c[tabindex="0"]').length === 1`), "Brettet har ikke ett tabulatorstopp");
  await t.bilde("lett");

  // The first tap (a real finger) is safe and opens an area; the board then needs no guess.
  await t.trykk(celle(40));
  s = await spill();
  t.sjekk(s.mine && !s.mine[40] && naboer(s, 40).every((j) => !s.mine[j]), "Første trykk var ikke trygt");
  t.sjekk(s.apen.filter((x) => x).length >= 9, "Første trykk åpnet ikke et område");
  t.sjekk(s.mine.reduce((a, b) => a + b, 0) === 10, "Lett skal ha 10 miner");
  t.sjekk(s.trygg === true && (await t.js("!document.querySelector('.ms-merke').hidden")), "Brettet er ikke merket «Uten gjetting»");
  alt = await t.tilstand();
  t.sjekk(alt.annet && alt.annet.dagens === dag.tekst && alt.annet.startet && !alt.annet.ferdig, "Dagens minefelt ble borte da et fritt brett startet");

  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett dagens/ : /\d:\d\d/).test(await t.tekst('[data-h="dagens"]')) && (t.norsk ? /Fortsett · lett/ : /\d:\d\d/).test(await t.tekst('[data-h="fortsett"]')), "Hjemskjermen viser ikke begge spillene som er i gang");
  await t.bilde("hjem-to-spill");

  // Solve today's minefield: time, try number, streak, countdown and share.
  await t.klikk('[data-h="dagens"]');
  await t.vent("Rusj.S.spill && Rusj.S.spill.dagens && document.querySelectorAll('.ms-c').length === Rusj.S.spill.b * Rusj.S.spill.h");
  s = await spill();
  t.sjekk(s.forsok === 2 && s.startet, "«Fortsett dagens» åpnet ikke brettet som var i gang");
  await aktiver(s.mine.map((m, i) => i).filter((i) => !s.mine[i] && !s.apen[i]));
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(900);
  alt = await t.tilstand();
  t.sjekk(alt.daglig.dager[dag.tekst] && alt.daglig.dager[dag.tekst].forsok === 2 && alt.daglig.rekke === 1, "Dagens minefelt ble ikke lagret som løst");
  t.sjekk(!alt.rekorder.lett && !alt.stat.lett, "Dagens minefelt skal ikke telle i nivårekordene");
  t.sjekk(alt.annet && !alt.annet.dagens && alt.annet.startet, "Det frie brettet ble borte da dagens ble løst");
  const felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").minesveiperen`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.rekke === 1, "Forsiden får ikke vite at dagens minefelt er løst");
  t.sjekk(!felles || felles.res === undefined || /^\d+:\d\d$/.test(felles.res), "Resultatet til forsiden er ikke en tid");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".ms-nedtelling b")), "Nedtellingen til neste minefelt mangler");
  t.sjekk((t.norsk ? /1 dag på rad/ : /1/).test(await t.tekst(".ms-rekke")), "Rekka vises ikke");
  t.sjekk((t.norsk ? /2\./ : /2/).test(await t.tekst(".ms-resultat")), "Resultatet viser ikke hvilket forsøk det var");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }");
  await t.klikk('.dokk [data-h="del"]', 300);
  const delt = await t.js("window.__delt");
  const adresse = "https://rusj.no" + new URL(t.side).pathname; // https://rusj.no/minesveiperen/, /en/minefield/ …
  t.sjekk(delt && (delt.url === adresse || String(delt.text).includes(adresse)) && (t.norsk ? /Minesveiperen \d+\.\d+ · \d+:\d\d på 2\. forsøk/ : / \d+[./]\d+ · \d+:\d\d .*2/).test(delt.text), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  await t.bilde("dagens-lost", true);

  // Home: solved, a live countdown, and the free board is the main button now.
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /ryddet på \d+:\d\d/ : /\d+:\d\d/).test(await t.tekst(".ms-daglinje")) && (await t.finnes(".ms-nedtelling b")), "Hjemskjermen viser ikke at dagens minefelt er løst");
  t.sjekk(!(await t.finnes('[data-h="dagens"]')) && (await t.finnes('.knapp[data-h="fortsett"]')), "Hovedknappen ble ikke det frie brettet etter at dagens var løst");
  const n1 = await t.tekst(".ms-nedtelling b");
  await t.sov(1300);
  t.sjekk((await t.tekst(".ms-nedtelling b")) !== n1, "Nedtellingen står stille");
  await t.bilde("hjem-lost");
  // The front page's link: #dagens opens the result of the solved minefield.
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  t.sjekk((!t.norsk || /dagens minefelt/i.test(await t.tekst("#topp-tittel"))) && (await t.finnes('.dokk [data-h="del"]')), "#dagens åpnet ikke resultatet for dagens minefelt");
  await t.klikk("#tilbake");

  // ----- The free board -----
  await t.klikk('[data-h="fortsett"]');
  await t.vent("Rusj.S.spill && !Rusj.S.spill.dagens && document.querySelectorAll('.ms-c').length === 81");
  s = await spill();

  // A long press on a closed mine next to the open area plants a flag.
  const kant = s.mine.map((m, i) => i).filter((i) => s.mine[i] && naboer(s, i).some((j) => s.apen[j]));
  await t.trykk(celle(kant[0]), 650);
  s = await spill();
  t.sjekk(s.flagg[kant[0]] === 1 && !s.apen[kant[0]], "Et langt trykk satte ikke flagg");
  t.sjekk((await t.tekst("#ms-igjen")) === "9", "Minetelleren teller ikke ned for flagget");
  await t.sov(80);
  t.sjekk((t.norsk ? /Flagg satt på rad \d+, kolonne \d+\. 9 miner igjen/ : /\d+.*\d+.*9/).test(await t.js("document.querySelector('#si').textContent")), "Flagget ble ikke lest opp for skjermleser");
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
    await t.sov(80);
    t.sjekk((t.norsk ? /rundt|åpnet|tom/ : /\S/).test(await t.js("document.querySelector('#si').textContent")), "Åpnede ruter ble ikke lest opp for skjermleser");
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
  t.sjekk((t.norsk ? /Godt jobba|Ny rekord/ : /\S/).test(await t.tekst("#skjerm h1")), "Seieren vises ikke");
  t.sjekk(!/kåringen/i.test(await t.tekst("#topp-tittel")) && (t.norsk ? /lett/i : /9 × 9/).test(await t.tekst("#topp-tittel")), "Topplinja på soloresultatet sier ikke hva som ble spilt");
  t.sjekk(await t.finnes(".banner .ms-glad .ms-vaie"), "Maskoten er ikke glad etter seieren");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");

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
  t.sjekk((t.norsk ? /Kabom/ : /Kab/).test(await t.tekst("#skjerm h1")), "Tapet vises ikke som «Kabom!»");
  t.sjekk((await t.tilstand()).stat.lett.spilt === 2, "Tapet ble ikke telt");
  t.sjekk((t.norsk ? /av 10/ : /10/).test(await t.tekst(".ms-resultat")), "Tapet viser ikke hvor mange miner som ble funnet");
  await t.bilde("tapt", true);

  // Middels opens like Ekspert: finger-sized cells from the top-left corner. «−» shows the whole
  // board; where that makes the cells too small for a finger the board is a map, and a tap on it
  // zooms in instead of opening a cell.
  await t.klikk('[data-h="bytt"]');
  await t.klikk('[data-h="niva"][data-v="middels"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ms-c').length === 256");
  await t.sov(300);
  t.sjekk(await t.js("(() => { const r = document.querySelector('.ms-rulle'); return Number(document.querySelector('.ms-brett').dataset.c) >= 30 && r.scrollLeft === 0 && r.scrollTop === 0; })()"), "Middels starter ikke med store ruter fra hjørnet oppe til venstre");
  await t.bilde("middels");
  await t.klikk('[data-h="zoom"][data-v="-1"]', 250);
  t.sjekk(await t.js("(() => { const r = document.querySelector('.ms-rulle'); return r.scrollWidth <= r.clientWidth + 1 && r.scrollHeight <= r.clientHeight + 1; })()"), "Helt utzoomet får ikke hele Middels-brettet plass");
  if (await t.js("Number(document.querySelector('.ms-brett').dataset.c) < 24")) {
    t.sjekk(await t.js("document.querySelector('.ms-brett').inert && !document.querySelector('.ms-lupe').hidden && document.querySelector('.ms-vindu.oversikt') !== null"), "Små ruter (under 24 px) kan fortsatt trykkes på i oversikten");
    await t.bilde("middels-oversikt");
    await t.trykk(".ms-lupe");
    await t.sov(250);
    s = await spill();
    t.sjekk(!s.startet && (await t.js("Number(document.querySelector('.ms-brett').dataset.c) >= 30 && !document.querySelector('.ms-brett').inert && document.querySelector('.ms-lupe').hidden")), "Et trykk på oversikten zoomet ikke inn (eller åpnet en rute)");
  } else await t.klikk('[data-h="zoom"][data-v="1"]', 250);

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
  t.sjekk(s.trygg === true, "Ekspert-brettet ble ikke laget uten gjetting");
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

  // «Uten gjetting» off: the classic board, laid by the seed alone and not marked.
  await t.klikk("#tilbake");
  await t.klikk('[data-h="bytt"]');
  await t.klikk('[data-h="niva"][data-v="lett"]');
  await t.klikk('.bryter[data-h="uten"]');
  t.sjekk(await t.finnes('.bryter[data-h="uten"][aria-pressed="false"]'), "«Uten gjetting» lot seg ikke slå av");
  await t.klikk('[data-h="start"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("Rusj.S.spill && Rusj.S.spill.niva === 'lett' && document.querySelectorAll('.ms-c').length === 81");
  await aktiver([40]);
  s = await spill();
  t.sjekk(s.startet && s.trygg === false && s.uten === false && (await t.js("document.querySelector('.ms-merke').hidden")), "Et klassisk brett er merket «Uten gjetting»");

  // A tampered level name in the saved state ("__proto__") is not a level: back to the default.
  await t.js(`Rusj.S.oppsett = JSON.parse('{"niva":"__proto__"}'); Rusj.S.spill = null; Rusj.S.annet = null; Rusj.lagre()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(!t.norsk || /Start spill · lett/.test(await t.tekst('[data-h="nytt"]')), "Et ugyldig nivånavn i lagret tilstand ga ikke standardnivået");
}
