// Dobleren (2048): 4 × 4 played with real swipes, the arrow keys and the arrow buttons; merges score;
// one undo per move (never two in a row, and the same move again gives the same new tile); a swipe
// that moves nothing nudges the board; reload and back + continue; 2048 is celebrated and the game
// goes on; a full board ends the game and the result screen can take the last move back; 5 × 5; the
// board and the arrow buttons fit at 320×568 and 375×560 without scrolling the page.
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
  async function sett(fliser) {
    await t.js(`(() => { const sp = Rusj.S.spill; sp.fliser = ${JSON.stringify(fliser)}.map((f, i) => ({ id: 1000 + i, ...f })); sp.nesteId = 2000; sp.forrige = null; sp.over = false; Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelectorAll('.db-flis').length > 0");
    await t.sov(200);
  }

  await t.start();
  // The install tip (shown at most twice per phone after a good result) would cover the screenshots.
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  // Two boards, both one tap from home: «Start 4 × 4» (main) and «5 × 5» – no setup screen.
  t.sjekk((await t.tekst('.knapp[data-h="nytt"][data-v="4"]')).trim() === "Start 4 × 4", "Hovedknappen er ikke «Start 4 × 4»");
  t.sjekk(await t.finnes('.knapp-2[data-h="nytt"][data-v="5"]'), "Mangler knappen for 5 × 5 på hjem-skjermen");
  await t.klikk('[data-h="nytt"][data-v="4"]');
  await t.vent("document.querySelectorAll('.db-flis').length === 2");
  t.sjekk((await t.antall(".db-ruter i")) === 16, "4 × 4 skal ha 16 ruter");
  await t.bilde("start");

  // A real swipe merges two 2s into a 4 and scores 4.
  await sett([
    { v: 2, x: 0, y: 0 },
    { v: 2, x: 1, y: 0 },
    { v: 4, x: 3, y: 3 },
  ]);
  await sveip(-160, 0);
  let s = await spill();
  t.sjekk(s.poeng === 4 && s.trekk === 1 && s.fliser.some((f) => f.v === 4 && f.x === 0 && f.y === 0), "Sveipet slo ikke sammen 2 og 2 til 4");
  t.sjekk(s.fliser.length === 3 && (await t.antall(".db-flis")) === 3, "Feil antall brikker etter sammenslåingen");
  t.sjekk((await t.tekst("#db-poeng")) === "4", "Poengene vises ikke");
  const etterForste = brett(s);
  await t.bilde("slatt-sammen");

  // One undo: back to before; a second undo in a row does nothing.
  await t.klikk('[data-h="angre"]');
  s = await spill();
  t.sjekk(s.poeng === 0 && s.trekk === 0 && brett(s) === "2@0,0 2@1,0 4@3,3", "Angre ga ikke tilbake brettet fra før");
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
  await t.klikk('[data-h="angre-slutt"]');
  await t.vent("document.querySelectorAll('.db-flis').length === 16");
  s = await spill();
  t.sjekk(!s.ferdig && s.fliser.find((f) => f.x === 0 && f.y === 0).v === 2, "Angre fra sluttskjermen ga ikke tilbake brettet");
  // Out of moves again, and «tilbake» during the message: the game is already saved as finished,
  // so home never offers a locked board as «Fortsett».
  await sveip(-160, 0);
  await t.vent("document.querySelector('.db-melding:not([hidden])')", 3000);
  t.sjekk((await t.tilstand()).spill.ferdig === true, "Spillet ble ikke lagret som ferdig med en gang det var tomt for trekk");
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Et ferdig spill tilbys som «Fortsett» etter tilbake");

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
}
