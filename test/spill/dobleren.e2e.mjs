// Dobleren (2048): «Dagens lynrunde» (3 × 3 from the date, no undo, three tries with the same start,
// streak, countdown, medals, share, #dagens) beside a free game (two games under way at once).
// 4 × 4 played with real swipes, the arrow keys and the arrow buttons; merges score; every move is
// said for a screen reader and the board is a hidden table; one undo per move (never two in a row,
// the same move again gives the same new tile, and the record never keeps a move that was taken
// back); a swipe that moves nothing nudges the board; reload and back + continue; 2048 is celebrated
// and the game goes on; a full board ends the game and the result screen can take the last move
// back; a game left for a new one keeps its score as the record; 5 × 5; the board and the arrow
// buttons fit at 320×568 and 375×560 without scrolling the page.
export default async function (t) {
  const spill = async () => (await t.tilstand()).spill;
  const brett = (sp) => sp.fliser.map((f) => `${f.v}@${f.x},${f.y}`).sort().join(" ");
  async function sveip(dx, dy) {
    const p = await t.js(`(() => { const b = document.querySelector(".db-brett").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    for (let i = 1; i <= 6; i++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + (dx * i) / 6, y: p.y + (dy * i) / 6 }] });
      await t.sov(16);
    }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(260);
  }
  async function tast(key) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
    await t.sov(260);
  }
  // A known position, saved like a real game and reloaded.
  async function sett(fliser, nullstill = false) {
    await t.js(`(() => { const sp = Rusj.S.spill; sp.fliser = ${JSON.stringify(fliser)}.map((f, i) => ({ id: 1000 + i, ...f })); sp.nesteId = 2000; sp.forrige = null; sp.over = false; if (${nullstill}) { sp.poeng = 0; sp.trekk = 0; } Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelectorAll('.db-flis').length > 0");
    await t.sov(200);
  }

  await t.start();
  // The install tip (shown at most twice per phone after a good result) would cover the screenshots.
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  // Today's sprint is the main button; the two boards are one tap from home – no setup screen.
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .db-kal'), "Dagens lynrunde er ikke hovedknappen på hjemskjermen");
  t.sjekk((await t.tekst('.knapp-2[data-h="nytt"][data-v="4"]')).trim() === "Start 4 × 4" && (await t.finnes('.knapp-2[data-h="nytt"][data-v="5"]')), "Mangler knappene for 4 × 4 og 5 × 5 på hjem-skjermen");

  // ----- Dagens lynrunde -----
  const dag = await t.js("Rusj.dag()");
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelectorAll('.db-flis').length === 2");
  let s = await spill();
  t.sjekk(s.str === 3 && s.dagens === dag.tekst && s.forsok === 1 && (await t.antall(".db-ruter i")) === 9, "Dagens lynrunde er ikke 3 × 3 med dagens dato");
  t.sjekk(/dagens lynrunde/i.test(await t.tekst("#topp-tittel")) && !(await t.finnes('[data-h="angre"]')), "Lynrunden skal hete «Dagens lynrunde» og ikke ha angreknapp");
  const lesTabell = () => t.js(`Array.from(document.querySelectorAll(".db-tabell tr")).map((tr) => Array.from(tr.children).map((td) => td.textContent).join(",")).join(";")`);
  const somTabell = (sp) =>
    Array.from({ length: sp.str }, (_, y) => Array.from({ length: sp.str }, (_, x) => (sp.fliser.find((f) => f.x === x && f.y === y) || { v: "tom" }).v).join(",")).join(";");
  t.sjekk((await lesTabell()) === somTabell(s) && (await t.js("!document.querySelector('.db-tabell').closest('[aria-hidden]')")), "Brettet finnes ikke som tabell for skjermleser");
  const dagStart = brett(s);
  await t.bilde("dagens");
  // The first move starts the try; it is said in a sentence, and it cannot be undone.
  await sveip(-160, 0);
  s = await spill();
  if (s.trekk === 0) {
    await sveip(0, 160);
    s = await spill();
  }
  let alt = await t.tilstand();
  t.sjekk(s.trekk === 1 && alt.daglig.forsok && alt.daglig.forsok.n === 1 && s.forrige === null, "Første trekk i lynrunden startet ikke forsøket (eller kan angres)");
  await t.sov(80);
  t.sjekk(/^(Venstre|Høyre|Opp|Ned)\. .*Ny [24] i rad \d, kolonne \d\. \d+ poeng\.$/.test(await t.js("document.querySelector('#si').textContent")), "Trekket ble ikke lest opp for skjermleser");
  t.sjekk((await lesTabell()) === somTabell(s), "Tabellen for skjermleser følger ikke brettet");
  await tast("u");
  t.sjekk((await spill()).trekk === 1, "Lynrunden lot seg angre");

  // A free 4 × 4 beside it: neither wipes the other.
  await t.klikk("#tilbake");
  t.sjekk(/Fortsett lynrunden/.test(await t.tekst('[data-h="dagens"]')), "Hjemskjermen tilbyr ikke å fortsette lynrunden");
  await t.klikk('[data-h="nytt"][data-v="4"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "Et fritt spill spurte om å kaste lynrunden");
  await t.vent("Rusj.S.spill && !Rusj.S.spill.dagens && document.querySelectorAll('.db-flis').length === 2");
  t.sjekk((await t.antall(".db-ruter i")) === 16, "4 × 4 skal ha 16 ruter");
  await t.bilde("start");
  await sveip(-160, 0);
  if ((await spill()).trekk === 0) await sveip(0, 160);
  alt = await t.tilstand();
  t.sjekk(alt.annet && alt.annet.dagens === dag.tekst && alt.annet.trekk === 1, "Lynrunden ble borte da et fritt spill startet");
  await t.klikk("#tilbake");
  t.sjekk(/Fortsett lynrunden/.test(await t.tekst('[data-h="dagens"]')) && /Fortsett · 4 × 4/.test(await t.tekst('[data-h="fortsett"]')), "Hjemskjermen viser ikke begge spillene som er i gang");
  await t.bilde("hjem-to-spill");

  // Finish the first try: a full board with one move left. The result has the streak, the
  // countdown, the medals and «Prøv igjen».
  await t.klikk('[data-h="dagens"]');
  await t.vent("Rusj.S.spill && Rusj.S.spill.dagens && document.querySelectorAll('.db-flis').length > 0");
  await sett([
    [2, 2, 8],
    [16, 32, 64],
    [2, 4, 2],
  ].flatMap((rad, y) => rad.map((v, x) => ({ v, x, y }))));
  await sveip(-160, 0);
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(800);
  alt = await t.tilstand();
  const dagRes = alt.daglig.dager[dag.tekst];
  t.sjekk(dagRes && dagRes.poeng === alt.spill.poeng && dagRes.flis === 64 && dagRes.forsok === 1 && alt.daglig.rekke === 1, "Lynrunden ble ikke lagret som tatt");
  t.sjekk(!alt.rekorder["3"] && alt.annet && !alt.annet.dagens, "Lynrunden rotet med rekordene eller det frie spillet");
  const felles = await t.js(`JSON.parse(localStorage.getItem("rusj.daglig") || "{}").dobleren`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.rekke === 1, "Forsiden får ikke vite at lynrunden er tatt");
  t.sjekk(!felles || felles.res === undefined || (/poeng$/.test(felles.res) && felles.res.length <= 14), "Resultatet til forsiden er ikke poengene");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".db-nedtelling b")) && /1 dag på rad/.test(await t.tekst(".db-rekke")), "Resultatet mangler nedtelling eller rekke");
  t.sjekk((await t.antall(".db-medaljer li.tatt")) === 2, "Medaljene for 32 og 64 vises ikke");
  t.sjekk(/Prøv igjen · 2 forsøk igjen/.test(await t.tekst('.dokk .knapp[data-h="dagens"]')), "Resultatet tilbyr ikke de to forsøkene som er igjen");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }");
  await t.klikk('.dokk [data-h="del"]', 300);
  const delt = await t.js("window.__delt");
  t.sjekk(delt && (delt.url === "https://rusj.no/dobleren/" || String(delt.text).includes("https://rusj.no/dobleren/")) && /Dobleren \d+\.\d+ · 64-brikke 🥈 · \d+ poeng/.test(delt.text), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  await t.bilde("dagens-resultat", true);
  // The front page's link: #dagens shows the result of the finished try.
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  t.sjekk(/dagens lynrunde/i.test(await t.tekst("#topp-tittel")), "#dagens åpnet ikke resultatet for lynrunden");
  // The second try starts from the same board as the first.
  await t.klikk('.dokk .knapp[data-h="dagens"]');
  await t.vent("Rusj.S.spill && Rusj.S.spill.dagens && !Rusj.S.spill.ferdig && document.querySelectorAll('.db-flis').length === 2");
  s = await spill();
  t.sjekk(s.forsok === 2 && brett(s) === dagStart, "Andre forsøk starter ikke med de samme brikkene");
  t.sjekk(/2 av 3/.test(await t.js("document.querySelector('.db-hud').textContent")), "Lynrunden viser ikke hvilket forsøk det er");
  // Home: taken, a live countdown, and the try that is left.
  await t.klikk("#tilbake");
  t.sjekk(/Dagens lynrunde: \d+ poeng · 64-brikke/.test(await t.tekst(".db-daglinje")), "Hjemskjermen viser ikke at lynrunden er tatt");
  t.sjekk(/2 forsøk igjen/.test(await t.tekst('.knapp-2[data-h="dagens"]')), "Hjemskjermen tilbyr ikke forsøkene som er igjen");
  const n1 = await t.tekst(".db-nedtelling b");
  await t.sov(1300);
  t.sjekk((await t.tekst(".db-nedtelling b")) !== n1, "Nedtellingen står stille");
  await t.bilde("hjem-tatt");

  // ----- The free game -----
  await t.klikk('[data-h="fortsett"]');
  await t.vent("Rusj.S.spill && !Rusj.S.spill.dagens && document.querySelectorAll('.db-flis').length > 0");

  // A real swipe merges two 2s into a 4 and scores 4.
  await sett(
    [
      { v: 2, x: 0, y: 0 },
      { v: 2, x: 1, y: 0 },
      { v: 4, x: 3, y: 3 },
    ],
    true,
  );
  await sveip(-160, 0);
  s = await spill();
  t.sjekk(s.poeng === 4 && s.trekk === 1 && s.fliser.some((f) => f.v === 4 && f.x === 0 && f.y === 0), "Sveipet slo ikke sammen 2 og 2 til 4");
  t.sjekk(s.fliser.length === 3 && (await t.antall(".db-flis")) === 3, "Feil antall brikker etter sammenslåingen");
  t.sjekk((await t.tekst("#db-poeng")) === "4" && (await t.tekst("#db-beste")) === "4", "Poengene vises ikke");
  await t.sov(80);
  t.sjekk(/^Venstre\. 2 \+ 2 = 4\. Ny [24] i rad \d, kolonne \d\. 4 poeng\.$/.test(await t.js("document.querySelector('#si').textContent")), "Sammenslåingen ble ikke lest opp for skjermleser");
  const etterForste = brett(s);
  await t.bilde("slatt-sammen");

  // One undo: back to before – and the record does not keep the move that was taken back. A
  // second undo in a row does nothing.
  await t.klikk('[data-h="angre"]');
  s = await spill();
  t.sjekk(s.poeng === 0 && s.trekk === 0 && brett(s) === "2@0,0 2@1,0 4@3,3", "Angre ga ikke tilbake brettet fra før");
  t.sjekk(!(await t.tilstand()).rekorder["4"] && (await t.tekst("#db-beste")) === "0", "Rekorden overlevde et trekk som ble angret");
  t.sjekk(await t.js(`document.querySelector('[data-h="angre"]').disabled`), "Angre skal ikke kunne brukes to ganger på rad");
  await tast("u");
  t.sjekk((await spill()).trekk === 0, "En ny angring på rad endret brettet");
  // The same move again (arrow key) brings the same new tile: no fishing for luck.
  await tast("ArrowLeft");
  t.sjekk(brett(await spill()) === etterForste, "Samme trekk etter angring ga en annen ny brikke");

  // The arrow buttons work too.
  const for1 = (await spill()).trekk;
  await t.klikk('[data-h="flytt"][data-v="hoyre"]', 260);
  t.sjekk((await spill()).trekk === for1 + 1, "Pilknappen flyttet ikke brikkene");

  // A swipe that moves nothing: no move, but the board nudges.
  await sett([
    { v: 2, x: 0, y: 0 },
    { v: 4, x: 0, y: 1 },
  ]);
  await sveip(-160, 0);
  t.sjekk((await spill()).trekk === for1 + 1 && (await t.finnes(".db-brett.dytt")), "Et sveip som ikke flytter noe, ga ingen tilbakemelding");
  await sveip(0, 160);
  s = await spill();
  t.sjekk(s.fliser.some((f) => f.v === 4 && f.x === 0 && f.y === 3), "Sveip nedover flyttet ikke brikkene");

  // Reload mid-game, then back + continue.
  const forOmlasting = brett(s);
  await t.lastSide(t.side, "document.querySelectorAll('.db-flis').length > 0");
  t.sjekk(brett(await spill()) === forOmlasting && (await t.antall(".db-flis")) === s.fliser.length, "Brettet ble ikke som før etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.db-flis').length > 0");

  // 2048: celebrated on the board, then the game goes on.
  await sett([
    { v: 1024, x: 0, y: 0 },
    { v: 1024, x: 1, y: 0 },
    { v: 512, x: 0, y: 1 },
  ]);
  await sveip(-160, 0);
  await t.vent("document.querySelector('.db-melding.vant:not([hidden])')", 3000);
  await t.sov(500);
  await t.bilde("2048");
  t.sjekk((await spill()).vant === true, "2048 ble ikke registrert");
  t.sjekk(await t.js("document.activeElement && document.activeElement.dataset.h === 'fortsett-etter'"), "Tastaturet havner ikke på «Fortsett» i 2048-meldingen");
  // The card sits under the board: the 2048 tile is in view and celebrated.
  t.sjekk(
    await t.js(`(() => {
      const kort = document.querySelector(".db-meldingskort").getBoundingClientRect();
      const flis = document.querySelector(".db-flis.feiret");
      return !!flis && flis.getBoundingClientRect().bottom <= kort.top + 1 && getComputedStyle(document.querySelector(".db-melding")).backdropFilter === "none";
    })()`),
    "2048-brikken er dekket av meldingen eller ikke feiret",
  );
  await t.klikk('[data-h="fortsett-etter"]');
  t.sjekk(await t.finnes(".db-melding[hidden]"), "Meldingen om 2048 forsvant ikke");
  const forEtter = (await spill()).trekk;
  await sveip(0, 160);
  t.sjekk((await spill()).trekk === forEtter + 1, "Spillet gikk ikke videre etter 2048");

  // Out of moves: the board fills up, «Tomt for trekk!», then the result; it can take the move back.
  const fullt = [
    [2, 2, 8, 16],
    [64, 128, 256, 32],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ].flatMap((rad, y) => rad.map((v, x) => ({ v, x, y })));
  await sett(fullt.filter((f) => !(f.x === 3 && f.y === 0)).concat([{ v: 16, x: 3, y: 0 }]));
  await sveip(-160, 0);
  await t.vent("document.querySelector('.db-melding:not([hidden])')", 3000);
  await t.bilde("tomt-for-trekk");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(800);
  await t.bilde("slutt", true);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.rekorder["4"] && s.rekorder["4"].poeng >= s.spill.poeng, "Rekorden ble ikke lagret");
  t.sjekk(await t.finnes('.knapp-2[data-h="angre-slutt"]'), "Sluttskjermen tilbyr ikke å angre det siste trekket");
  t.sjekk((await t.antall(".dokk .lenkerad .lenke")) === 2, "Sluttskjermens lenker er ikke de to vanlige");
  t.sjekk(!/kåringen/i.test(await t.tekst("#topp-tittel")), "Topplinja sier «Kåringen» på et soloresultat");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  const forAngre = s.spill.poeng;
  await t.klikk('[data-h="angre-slutt"]');
  await t.vent("document.querySelectorAll('.db-flis').length === 16");
  s = await spill();
  t.sjekk(!s.ferdig && s.fliser.find((f) => f.x === 0 && f.y === 0).v === 2, "Angre fra sluttskjermen ga ikke tilbake brettet");
  t.sjekk(s.poeng < forAngre && !(await t.tilstand()).rekorder["4"], "Rekorden beholdt trekket som ble angret fra sluttskjermen");
  // Out of moves again, and «tilbake» during the message: the game is already saved as finished,
  // so home never offers a locked board as «Fortsett».
  await sveip(-160, 0);
  await t.vent("document.querySelector('.db-melding:not([hidden])')", 3000);
  t.sjekk((await t.tilstand()).spill.ferdig === true, "Spillet ble ikke lagret som ferdig med en gang det var tomt for trekk");
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Et ferdig spill tilbys som «Fortsett» etter tilbake");
  t.sjekk((await t.tekst('.knapp[data-h="nytt"][data-v="4"]')).trim() === "Start 4 × 4", "Hovedknappen er ikke «Start 4 × 4» når lynrunden er tatt");

  // 5 × 5 straight from home
  await t.klikk('[data-h="nytt"][data-v="5"]');
  await t.vent("document.querySelectorAll('.db-ruter i').length === 25");
  await sveip(0, -160);
  await sveip(-160, 0);
  await t.bilde("5x5");

  // The smallest phones: board and arrow buttons fit, the page never scrolls.
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [w, h] of [
    [320, 568],
    [375, 560],
  ].filter(([w]) => w <= bredde0)) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(700);
    const m = await t.js(`(() => {
      const b = document.querySelector(".db-brett").getBoundingClientRect();
      const p = document.querySelector(".db-piler").getBoundingClientRect();
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, brett: b.width, brettBunn: b.bottom, pilTopp: p.top, pilBunn: p.bottom, pilHoyde: document.querySelector(".db-piler button").getBoundingClientRect().height, h: innerHeight };
    })()`);
    t.sjekk(m.side <= 1 && m.bred <= 0, `${w}×${h}: siden kan scrolles`);
    t.sjekk(m.brett >= 220 && m.brettBunn <= m.pilTopp && m.pilBunn <= m.h, `${w}×${h}: brettet eller pilene får ikke plass`);
    t.sjekk(m.pilHoyde >= 44, `${w}×${h}: pilknappene er lavere enn 44 px (${Math.round(m.pilHoyde)})`);
    await t.bilde(`5x5-${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // A game left for a new one keeps its score as the record (it is written when the game is left,
  // not while it is played).
  await t.js("Rusj.S.spill.poeng = 500; Rusj.lagre()");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"][data-v="5"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]'), "Et nytt spill spurte ikke før spillet i gang ble kastet");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("Rusj.S.spill && Rusj.S.spill.poeng === 0 && document.querySelectorAll('.db-flis').length === 2");
  t.sjekk(((await t.tilstand()).rekorder["5"] || {}).poeng === 500, "Poengene i et spill som ble forlatt, ble ikke rekord");
}
