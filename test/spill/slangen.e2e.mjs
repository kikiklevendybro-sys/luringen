// Slangen (snake): the setup (speed, walls), the first arrow starts the snake, it eats (food put in
// its way), it turns with a real swipe, the arrow cross (on touch-down) and the keyboard; a hidden
// tab pauses it; a reload mid-game waits in pause and «Fortsett» counts down; back + continue; with
// walls it crashes into the edge and the result screen saves the record; without walls it comes
// out on the other side; the board and the cross fit at 320×568 and 375×560.
export default async function (t) {
  const live = () => t.js("JSON.parse(JSON.stringify(Rusj.S.spill))");
  const sett = (kode) => t.js(`(() => { const sp = Rusj.S.spill; ${kode}; })()`);
  async function sveip(dx, dy) {
    const p = await t.js(`(() => { const b = document.querySelector(".sl-lerret").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    for (let i = 1; i <= 5; i++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + (dx * i) / 5, y: p.y + (dy * i) / 5 }] });
      await t.sov(16);
    }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  async function tast(key) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
  }

  await t.start();
  // The install tip (shown at most twice per phone after a good result) would cover the screenshots.
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  // The main button starts at once («Rolig» with walls the first time); «Bytt nivå» opens the setup.
  t.sjekk(/Start spill · rolig/.test(await t.tekst('[data-h="nytt"]')), "Hovedknappen starter ikke på «Rolig» første gang");
  await t.klikk('[data-h="bytt"]');
  t.sjekk((await t.tekst("#skjerm h1")) === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  t.sjekk(await t.finnes('[data-h="fart"][data-v="rolig"][aria-pressed="true"]'), "«Rolig» er ikke valgt første gang");
  t.sjekk(await t.finnes('[data-h="vegger"][aria-pressed="true"]'), "Vegger skal være på som standard");
  t.sjekk(await t.js("new Set(Array.from(document.querySelectorAll('[data-h=\"fart\"]')).map((el) => Math.round(el.getBoundingClientRect().top))).size === 1"), "De tre hastighetene står ikke på én rad");
  await t.bilde("oppsett");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sl-lerret')");
  await t.sov(400);
  t.sjekk((await live()).status === "klar" && (await t.finnes(".sl-status:not([hidden])")), "Slangen venter ikke på første trykk");
  // The «Klar?» card sits low on the board; the first fruit is always above it.
  t.sjekk(
    await t.js(`(() => {
      const sp = Rusj.S.spill;
      const l = document.querySelector(".sl-lerret").getBoundingClientRect();
      const kort = document.querySelector(".sl-statuskort").getBoundingClientRect();
      return sp.mat.y < 7 && l.top + ((sp.mat.y + 1) / 17) * l.height <= kort.top;
    })()`),
    "«Klar?»-kortet skjuler den første frukten",
  );
  await t.bilde("klar");

  // The first arrow (touch-down on the cross) starts it; food right ahead is eaten.
  await sett("sp.mat = { x: 9, y: sp.kropp[0][1], t: 0 }");
  await t.trykk(".sl-pil.hoyre", 40);
  await t.vent("Rusj.S.spill.poeng === 1", 3000);
  // The next fruit is placed at random: park it in a far corner, so the turns below never eat it.
  await sett("sp.mat = { x: 0, y: 16, t: 1 }");
  let s = await live();
  t.sjekk(s.status === "spiller" && s.kropp.length === 4, "Slangen vokste ikke da den spiste");
  t.sjekk((await t.tekst("#sl-poeng")) === "1", "Poenget vises ikke");
  await t.sov(250);
  await t.bilde("spiser");

  // A real swipe up, then the left arrow key: both turns are taken.
  await sveip(0, -120);
  await t.vent("Rusj.S.spill.retning === 'opp'", 2000);
  await tast("ArrowLeft");
  await t.vent("Rusj.S.spill.retning === 'venstre'", 2000);
  // Two quick turns are both remembered (down, then right).
  await t.trykk(".sl-pil.ned", 30);
  await t.trykk(".sl-pil.hoyre", 30);
  await t.vent("Rusj.S.spill.retning === 'hoyre'", 2500);
  t.sjekk((await live()).status === "spiller", "Slangen krasjet under svingene");

  // A hidden tab (app switch, locked phone) pauses at once.
  await t.js(`Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"))`);
  s = await live();
  t.sjekk(s.status === "pause" && (await t.finnes(".sl-status:not([hidden]) [data-h='fortsett-spill']")), "Slangen tok ikke pause da fanen ble skjult");
  await t.js(`delete document.hidden`);
  const lengde = s.kropp.length;
  await t.sov(500);
  t.sjekk((await live()).kropp.join() === s.kropp.join(), "Slangen beveget seg under pausen");
  await t.bilde("pause");

  // Reload mid-game: it waits in pause; «Fortsett» counts down and it moves again.
  await t.lastSide(t.side, "document.querySelector('.sl-lerret')");
  s = await live();
  t.sjekk(s.status === "pause" && s.poeng === 1 && s.kropp.length === lengde, "Spillet ble ikke som før etter omlasting");
  await t.klikk('[data-h="fortsett-spill"]');
  t.sjekk(await t.js("!document.querySelector('#nedtelling').hidden"), "Ingen nedtelling før slangen går igjen");
  await t.vent("Rusj.S.spill.status === 'spiller'", 4000);

  // The rules over a moving snake: it pauses first, and waits after the sheet is closed.
  await t.klikk("#reglerknapp", 300);
  t.sjekk((await live()).status === "pause", "Slangen tok ikke pause da reglene ble åpnet");
  await t.klikk('#ark [data-h="lukk-ark"]', 300);
  t.sjekk((await live()).status === "pause", "Slangen startet av seg selv etter reglene");

  // A tab hidden during «3, 2, 1» stays in pause.
  await t.klikk('[data-h="fortsett-spill"]', 200);
  await t.js(`Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"))`);
  await t.sov(1700);
  t.sjekk((await live()).status === "pause", "Slangen startet selv om fanen ble skjult under nedtellingen");
  await t.js(`delete document.hidden`);
  await t.klikk('[data-h="fortsett-spill"]');
  await t.vent("Rusj.S.spill.status === 'spiller'", 4000);

  // Back + continue
  await t.klikk("#tilbake");
  t.sjekk((await live()).status === "pause", "Slangen gikk videre etter «tilbake»");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.sl-lerret')");
  await t.klikk('[data-h="fortsett-spill"]');
  await t.vent("Rusj.S.spill.status === 'spiller'", 4000);

  // Straight into the top wall: crash, then the result with a first record.
  await sett("sp.kropp = [[7, 0], [7, 1], [7, 2], [7, 3]]; sp.retning = 'opp'; sp.ko = []; sp.mat = { x: 1, y: 14, t: 1 }");
  await t.vent("Rusj.S.spill.status === 'over'", 3000);
  t.sjekk((await t.tilstand()).spill.ferdig === true, "Krasjet ble ikke lagret som ferdig med en gang");
  await t.vent("document.querySelector('.skjerm-slutt')", 5000);
  await t.sov(900);
  await t.bilde("slutt", true);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.rekorder["rolig-vegg"] === 1, "Rekorden ble ikke lagret");
  t.sjekk(await t.finnes(".sl-mini path[stroke='#ff5a4e']"), "Resultatet viser ikke brettet med kryss der slangen krasjet");
  t.sjekk(!/kåringen/i.test(await t.tekst("#topp-tittel")), "Topplinja sier «Kåringen» på et soloresultat");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");

  // «Spill igjen» at once, the same setup.
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.sl-lerret')");
  s = await live();
  t.sjekk(s.status === "klar" && s.fart === "rolig" && s.vegger && s.poeng === 0, "«Spill igjen» ga ikke en ny slange med samme oppsett");

  // Without walls: out at the left edge, in at the right.
  await t.klikk("#tilbake");
  await t.klikk('[data-h="bytt"]');
  await t.klikk('[data-h="vegger"]');
  t.sjekk(await t.finnes('[data-h="vegger"][aria-pressed="false"]'), "Vegger lot seg ikke slå av");
  await t.klikk('[data-h="fart"][data-v="normal"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sl-ramme.fri')");
  await sett("sp.kropp = [[1, 5], [2, 5], [3, 5], [4, 5]]; sp.retning = 'venstre'; sp.mat = { x: 7, y: 12, t: 2 }");
  await t.trykk(".sl-pil.venstre", 30);
  await t.vent("Rusj.S.spill.kropp[0][0] === 13", 3000);
  s = await live();
  t.sjekk(s.status === "spiller" && s.kropp[0][1] === 5, "Slangen kom ikke ut på andre siden uten vegger");
  await t.bilde("uten-vegger");
  await t.klikk('[data-h="pause"]');

  // The smallest phones: board and arrow cross fit, the page never scrolls.
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [w, h] of [
    [320, 568],
    [375, 560],
  ].filter(([w]) => w <= bredde0)) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(700);
    const m = await t.js(`(() => {
      const l = document.querySelector(".sl-lerret").getBoundingClientRect();
      const k = document.querySelector(".sl-kryss").getBoundingClientRect();
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, lerret: l.width, lerretBunn: l.bottom, kryssTopp: k.top, kryssBunn: k.bottom, h: innerHeight };
    })()`);
    t.sjekk(m.side <= 1 && m.bred <= 0, `${w}×${h}: siden kan scrolles`);
    t.sjekk(m.lerret >= 200 && m.lerretBunn <= m.kryssTopp && m.kryssBunn <= m.h, `${w}×${h}: brettet eller pilene får ikke plass`);
    await t.bilde(`${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // A tampered speed in the saved state ("__proto__") is not a speed: back to the default.
  await t.js(`Rusj.S.oppsett = JSON.parse('{"fart":"__proto__","vegger":true}'); Rusj.S.spill = null; Rusj.lagre()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(/Start spill · rolig/.test(await t.tekst('[data-h="nytt"]')), "En ugyldig hastighet i lagret tilstand ga ikke standardvalget");
}
