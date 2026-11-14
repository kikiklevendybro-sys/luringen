// Murbrekkeren (brick breaker): the home screen; the ball waits on the paddle; a real drag moves the
// paddle and letting go sends the ball; the arrow keys move it too; a brick breaks (points); a
// capsule gives three balls; a hidden tab pauses and nothing moves; a reload waits in pause and
// «Fortsett» counts down; the rules pause; back + continue; a lost ball costs one of three and the
// next waits on the paddle; a cleared level shows a card and «Neste brett» goes on; level 5 gives
// the sticker; the last ball ends the game and the result shows the score and the levels; «Velg
// brett» starts on a reached level; small phones and a phone on its side fit; home remembers the
// record; a tampered save is dropped. Runs in every edition: texts in Norwegian only (t.norsk).
export default async function (t) {
  const st = () => t.js("JSON.parse(JSON.stringify(Rusj.S.spill.st))");
  const status = () => t.js("Rusj.S.spill.status");
  const sett = (kode) => t.js(`(() => { const sp = Rusj.S.spill; const st = sp.st; ${kode}; Rusj.lagre(); })()`);
  const punkt = (fx, fy) => t.js(`(() => { const b = document.querySelector(".mu-lerret").getBoundingClientRect(); return { x: b.x + b.width * ${fx}, y: b.y + b.height * ${fy} }; })()`);
  const skjul = (pa) =>
    t.js(pa ? `Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"))` : `delete document.hidden`);
  // Clears the level: every brick but one ordinary brick is gone, and the ball flies right at it.
  const ryddBrett = () =>
    sett(`for (const s of st.steiner) if (s.type !== "stal") s.hp = 0;
      const s = st.steiner.find((x) => x.type === "vanlig"); s.hp = 1;
      st.venter = false; st.baller = [{ x: s.x + 14, y: s.y + 22, px: s.x + 14, py: s.y + 22, vx: 0, vy: -240 }]`);

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(!t.norsk || (await t.tekst('[data-h="nytt"]')) === "Start spill", "Hovedknappen heter ikke «Start spill»");
  t.sjekk(!(await t.finnes('[data-h="velg"]')) && !(await t.finnes(".mu-rekorder")), "«Velg brett» eller rekorder vises før første spill");
  await t.bilde("hjem");

  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.mu-lerret') && Rusj.S.spill");
  await t.sov(400);
  let s = await st();
  t.sjekk((await status()) === "spiller" && s.venter && s.brett === 1 && s.liv === 3, "Ballen venter ikke på racketen ved start");
  t.sjekk((await t.antall("#mu-liv i:not(.mu-tom)")) === 3, "Toppen viser ikke tre baller");
  await t.bilde("klar");

  // A real drag: the paddle follows the finger; letting go sends the ball.
  const a = await punkt(0.3, 0.6);
  const b = await punkt(0.8, 0.95);
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
  for (let i = 1; i <= 6; i++) {
    await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 6, y: a.y + ((b.y - a.y) * i) / 6 }] });
    await t.sov(16);
  }
  s = await st();
  t.sjekk(Math.abs(s.padX - 240) < 6 && s.venter && Math.abs(s.baller[0].x - s.padX) < 0.01, `Racketen fulgte ikke fingeren (padX = ${Math.round(s.padX)})`);
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sov(150);
  s = await st();
  t.sjekk(!s.venter && s.baller[0].vy < 0, "Ballen gikk ikke da fingeren slapp");
  // The arrow keys
  const x0 = s.padX;
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft" });
  await t.sov(300);
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft" });
  t.sjekk((await st()).padX < x0 - 40, "Venstre piltast flyttet ikke racketen");

  // A brick breaks (points); a capsule caught with the paddle gives three balls.
  await sett(`const s = st.steiner.find((x) => x.type === "vanlig" && x.hp > 0); st.baller = [{ x: s.x + 14, y: s.y + 22, px: s.x + 14, py: s.y + 22, vx: 0, vy: -240 }]`);
  await t.vent("Rusj.S.spill.st.knust >= 1", 2000);
  t.sjekk((await st()).poeng >= 10 && (await t.tekst("#mu-poeng")) !== "0", "Poengene for klossen vises ikke");
  await sett(`st.padX = 150; st.baller = [{ x: 150, y: 200, px: 150, py: 200, vx: 30, vy: -200 }]; st.kapsler = [{ x: 150, y: ${336}, py: 336, type: "multi" }]`);
  await t.vent("Rusj.S.spill.st.baller.length === 3", 2000);
  await t.sov(300);
  await t.bilde("tre-baller");

  // A hidden tab pauses at once, and nothing moves.
  await skjul(true);
  t.sjekk((await status()) === "pause" && (await t.finnes(".mu-status:not([hidden]) [data-h='fortsett-spill']")), "Spillet tok ikke pause da fanen ble skjult");
  await skjul(false);
  const stille = JSON.stringify((await st()).baller);
  await t.sov(400);
  t.sjekk(JSON.stringify((await st()).baller) === stille, "Ballene beveget seg under pausen");
  await t.bilde("pause");

  // Reload: waits in pause; «Fortsett» counts down (the balls are flying).
  await t.lastSide(t.side, "document.querySelector('.mu-lerret')");
  await t.sov(300);
  t.sjekk((await status()) === "pause" && (await st()).baller.length === 3, "Spillet ble ikke som før etter omlasting");
  await t.klikk('[data-h="fortsett-spill"]');
  t.sjekk(await t.js("!document.querySelector('#nedtelling').hidden"), "Ingen nedtelling før ballene går igjen");
  await t.vent("Rusj.S.spill.status === 'spiller'", 4000);

  // The rules pause it; back + continue
  await t.klikk("#reglerknapp", 300);
  t.sjekk((await status()) === "pause", "Spillet tok ikke pause da reglene ble åpnet");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]', 300);
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.mu-lerret')");
  await t.klikk('[data-h="fortsett-spill"]');
  await t.vent("Rusj.S.spill.status === 'spiller'", 4000);

  // Every ball lost: one of three is gone, the next waits on the paddle (and a screen reader hears it;
  // the lines are caught as they are said, a sticker may be read out right after).
  await t.js("window.__si = []; const si = Rusj.si; Rusj.si = (x) => { window.__si.push(String(x)); return si(x); }");
  await sett(`st.padX = 40; st.kapsler = []; st.baller = [{ x: 260, y: 395, px: 260, py: 395, vx: 0, vy: 280 }]`);
  await t.vent("Rusj.S.spill.st.venter && Rusj.S.spill.st.liv === 2", 3000);
  t.sjekk((await t.antall("#mu-liv i:not(.mu-tom)")) === 2, "Toppen viser ikke at en ball er borte");
  t.sjekk((t.norsk ? /2 baller igjen/ : /2/).test((await t.js("window.__si")).join(" | ")), "Tapt ball ble ikke lest opp");

  // A cleared level: a card, then «Neste brett».
  await ryddBrett();
  await t.vent("Rusj.S.spill.status === 'klart'", 3000);
  await t.vent("document.querySelector('.mu-status.klart:not([hidden]) [data-h=\"neste\"]')", 2000);
  t.sjekk((await t.tilstand()).naadd === 2, "Brett 2 ble ikke låst opp");
  await t.sov(400);
  await t.bilde("brett-klart");
  await t.klikk('[data-h="neste"]');
  s = await st();
  t.sjekk((await status()) === "spiller" && s.brett === 2 && s.venter && s.liv === 2 && s.poeng > 0, "«Neste brett» ga ikke brett 2 med ballen på racketen");
  t.sjekk(!t.norsk || /brett 2/i.test(await t.tekst("#topp-tittel")), "Topplinja viser ikke brettet");
  await t.sov(300);
  await t.bilde("brett-2");

  // Level 5 cleared: the sticker.
  await sett("st.brett = 5");
  await ryddBrett();
  await t.vent("Rusj.S.spill.status === 'klart'", 3000);
  await t.vent(`(JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "{}"))["arkade-murbrekkeren"]`, 3000);
  await t.klikk('[data-h="neste"]');

  // The last ball: the game is over and the result comes.
  await sett(`st.liv = 1; st.venter = false; st.padX = 30; st.baller = [{ x: 270, y: 390, px: 270, py: 390, vx: 0, vy: 300 }]`);
  await t.vent("Rusj.S.spill.status === 'over'", 3000);
  t.sjekk((await t.tilstand()).spill.ferdig === true, "Slutten ble ikke lagret med en gang");
  await t.vent("document.querySelector('.skjerm-slutt')", 5000);
  await t.sov(900);
  await t.bilde("slutt", true);
  const S = await t.tilstand();
  t.sjekk(S.rekord > 0 && S.rekord === S.spill.st.poeng && S.lengst === 6 && S.sist && S.sist.brett === 6 && S.naadd === 6, `Rekord, lengst eller «sist» ble ikke lagret (${JSON.stringify({ rekord: S.rekord, lengst: S.lengst, naadd: S.naadd })})`);
  t.sjekk(!t.norsk || /brett klart/i.test(await t.tekst(".mu-resultat")), "Resultatet viser ikke hvor mange brett som ble klart");
  t.sjekk(await t.finnes('[data-h="del"]') && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Resultatet mangler «Del» eller «Alle spill»");
  t.sjekk(await t.friForDokk(".mu-resultat"), "Resultatet ligger bak dokken");
  await t.klikk('[data-h="del"]', 600);

  // «Velg brett»: the reached levels can be chosen, the others are locked.
  await t.klikk('[data-h="velg"]');
  await t.vent("document.querySelector('.mu-brettvalg')");
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")) === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  t.sjekk((await t.antall('[data-h="brettvalg"]:not([disabled])')) === 6 && (await t.antall('[data-h="brettvalg"][disabled]')) === 6, "Feil antall brett å velge mellom");
  await t.klikk('[data-h="brettvalg"][data-v="4"]');
  t.sjekk(await t.finnes('[data-h="brettvalg"][data-v="4"][aria-pressed="true"]'), "Brett 4 ble ikke valgt");
  t.sjekk(await t.friForDokk('[data-h="brettvalg"][aria-pressed="true"]'), "Det valgte brettet ligger bak dokken");
  await t.bilde("velg-brett");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.mu-lerret')");
  s = await st();
  t.sjekk(s.brett === 4 && s.start === 4 && s.poeng === 0, "Spillet startet ikke på det valgte brettet");

  // Small phones and a phone on its side: the board fits, the page never scrolls.
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  const maal = [[bredde0, hoyde0], ...[[320, 568], [375, 560]].filter(([w]) => w < bredde0 && bredde0 < hoyde0)];
  for (const [w, h] of maal) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(600);
    const m = await t.js(`(() => {
      const l = document.querySelector(".mu-lerret").getBoundingClientRect();
      const hud = document.querySelector(".mu-hud").getBoundingClientRect();
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, lw: l.width, lh: l.height, bunn: l.bottom, topp: l.top, hoyre: l.right, hudBunn: hud.bottom, hudVenstre: hud.left, h: innerHeight };
    })()`);
    t.sjekk(m.side <= 1 && m.bred <= 0, `${w}×${h}: siden kan scrolles`);
    t.sjekk(m.bunn <= m.h && m.lh >= 230, `${w}×${h}: brettet får ikke plass (${Math.round(m.lw)}×${Math.round(m.lh)})`);
    t.sjekk(w > h ? m.hudVenstre >= m.hoyre - 1 : m.topp >= m.hudBunn - 1, `${w}×${h}: poengene står oppå brettet`);
    if (w !== bredde0) await t.bilde(`${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // Home remembers the record, the furthest level and the last game
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.mu-rekorder')");
  t.sjekk((await t.antall(".mu-rekorder li")) === 3 && (await t.finnes('[data-h="velg"]')), "Hjem viser ikke rekordene og «Velg brett»");
  await t.bilde("hjem-rekord");

  // A tampered save is dropped
  await t.js(`Rusj.S.spill.st.steiner = [{ x: 1, y: 2, hp: 1, type: "__proto__" }]; Rusj.lagre()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.tilstand()).spill === null, "En ødelagt lagring ble ikke forkastet");
}
