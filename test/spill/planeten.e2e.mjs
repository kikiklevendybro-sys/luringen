// Planeten (drop and merge): the home screen and the planet row; a real tap drops a planet where it
// lands, a drag aims first, the arrow keys and space work too; two alike merge (points, the bigger
// kind); a hidden tab pauses and nothing moves; a reload waits in pause; the rules pause; back +
// continue; the jar fills up and the result screen shows the score, the biggest planet, the
// record and a share button; the Sun gives the sticker; «Spill igjen»; the home screen remembers
// the record and the last game; small phones and a phone on its side fit without scrolling; a
// tampered save is dropped. Runs in every edition: texts are checked in Norwegian only (t.norsk).
export default async function (t) {
  const st = () => t.js("JSON.parse(JSON.stringify(Rusj.S.spill.st))");
  const sett = (kode) => t.js(`(() => { const sp = Rusj.S.spill; const st = sp.st; ${kode}; Rusj.lagre(); })()`);
  // A planet put into the jar from the test, as if it had lain there a while.
  const legg = (n, x, y) => `st.b.push({ id: st.nesteId++, n: ${n}, x: ${x}, y: ${y}, px: ${x}, py: ${y}, vx: 0, vy: 0, a: 0, w: 0, alder: 500, vokser: 0 })`;
  const punkt = (fx, fy = 0.5) => t.js(`(() => { const b = document.querySelector(".pl-lerret").getBoundingClientRect(); return { x: b.x + b.width * ${fx}, y: b.y + b.height * ${fy} }; })()`);
  async function ta(fx, til = null) {
    const p = await punkt(fx, 0.4);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    if (til != null) {
      const q = await punkt(til, 0.45);
      for (let i = 1; i <= 6; i++) {
        await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + ((q.x - p.x) * i) / 6, y: p.y + ((q.y - p.y) * i) / 6 }] });
        await t.sov(16);
      }
      await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await t.sov(50);
      await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await t.sov(120);
  }
  async function tast(key, type = "begge") {
    if (type !== "opp") await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key === " " ? "Space" : key });
    if (type !== "ned") await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key === " " ? "Space" : key });
  }
  const skjul = (pa) =>
    t.js(pa ? `Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"))` : `delete document.hidden`);

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(!t.norsk || /Start spill/.test(await t.tekst('[data-h="nytt"]')), "Hovedknappen heter ikke «Start spill»");
  t.sjekk(await t.finnes(".pl-hjemrekke canvas.pl-rekke[aria-label]"), "Hjem viser ikke planetrekka");
  t.sjekk(!(await t.finnes(".pl-rekorder")), "Rekordlinja vises før første spill");
  await t.bilde("hjem");

  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.pl-lerret') && Rusj.S.spill");
  await t.sov(400);
  let s = await st();
  t.sjekk((await t.js("Rusj.S.spill.status")) === "spiller" && s.b.length === 0 && s.hold <= 2 && s.neste <= 2, "Spillet startet ikke med et tomt glass og små planeter");
  t.sjekk((await t.tekst("#pl-poeng")) === "0", "Poengene står ikke på 0");
  t.sjekk(await t.js("document.querySelector('.pl-neste').getAttribute('aria-label').length > 3"), "«Neste» har ikke navnet på planeten");

  // A real tap near the left wall drops a planet there.
  await ta(0.12);
  await t.vent("Rusj.S.spill.st.slipp === 1", 2000);
  s = await st();
  t.sjekk(s.b.length === 1 && s.b[0].x < 70, `Et trykk til venstre slapp ikke planeten der (x = ${s.b[0] && Math.round(s.b[0].x)})`);
  await t.sov(700);
  // A drag aims first, the planet falls where the finger lets go (right side).
  await ta(0.3, 0.85);
  await t.vent("Rusj.S.spill.st.slipp === 2", 2000);
  s = await st();
  t.sjekk(s.b[1] && s.b[1].x > 200, `Et drag til høyre slapp ikke planeten der (x = ${s.b[1] && Math.round(s.b[1].x)})`);
  await t.sov(700);
  // The keyboard: hold the left arrow, then space.
  const forSikte = (await st()).sikte;
  await tast("ArrowLeft", "ned");
  await t.sov(350);
  await tast("ArrowLeft", "opp");
  t.sjekk((await st()).sikte < forSikte - 30, "Venstre piltast flyttet ikke siktet");
  await tast(" ");
  await t.vent("Rusj.S.spill.st.slipp === 3", 2000);
  await t.sov(900);
  s = await st();
  t.sjekk(s.b.every((b) => b.y > 200), "Planetene falt ikke ned i glasset");
  await t.bilde("tre-planeter");

  // Two alike next to each other merge into the next kind, with points.
  await sett(`st.b = []; ${legg(3, 60, 376)}; ${legg(3, 108, 376)}`);
  await t.vent("Rusj.S.spill.st.slatt >= 1", 3000);
  s = await st();
  t.sjekk(s.b.length === 1 && s.b[0].n === 4 && s.poeng >= 12 && s.storst >= 4, "To like planeter ble ikke til én større");
  await t.vent("document.querySelector('#pl-poeng').textContent !== '0'", 2000);
  // Fill the jar a little for the pictures
  await sett(`${legg(6, 230, 355)}; ${legg(2, 150, 300)}; ${legg(5, 40, 250)}; ${legg(1, 270, 200)}`);
  await t.sov(1200);
  await t.bilde("slatt-sammen");

  // A hidden tab pauses at once, and nothing moves.
  await skjul(true);
  t.sjekk((await t.js("Rusj.S.spill.status")) === "pause" && (await t.finnes(".pl-status:not([hidden]) [data-h='fortsett-spill']")), "Spillet tok ikke pause da fanen ble skjult");
  await skjul(false);
  await sett(`${legg(4, 150, 120)}`);
  const stille = JSON.stringify((await st()).b.map((b) => [b.x, b.y]));
  await t.sov(500);
  t.sjekk(JSON.stringify((await st()).b.map((b) => [b.x, b.y])) === stille, "Planetene beveget seg under pausen");
  await t.bilde("pause");

  // Reload mid-game: waits in pause, and «Fortsett» goes on.
  const antall = (await st()).b.length;
  await t.lastSide(t.side, "document.querySelector('.pl-lerret')");
  await t.sov(300);
  t.sjekk((await t.js("Rusj.S.spill.status")) === "pause" && (await st()).b.length === antall, "Spillet ble ikke som før etter omlasting");
  await t.klikk('[data-h="fortsett-spill"]');
  t.sjekk((await t.js("Rusj.S.spill.status")) === "spiller", "«Fortsett» satte ikke spillet i gang igjen");

  // The rules over a running game pause it.
  await t.klikk("#reglerknapp", 300);
  t.sjekk((await t.js("Rusj.S.spill.status")) === "pause", "Spillet tok ikke pause da reglene ble åpnet");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]', 300);
  t.sjekk((await t.js("Rusj.S.spill.status")) === "pause", "Spillet startet av seg selv etter reglene");

  // Back + continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.pl-lerret')");
  await t.klikk('[data-h="fortsett-spill"]');
  t.sjekk((await t.js("Rusj.S.spill.status")) === "spiller", "Spillet gikk ikke videre etter «Fortsett»");

  // Two Jupiters make the Sun: the sticker.
  await sett(`st.b = []; ${legg(9, 72, 328)}; ${legg(9, 216, 328)}`);
  await t.vent("Rusj.S.spill.st.storst === 10", 4000);
  await t.vent(`(JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "{}"))["arkade-planeten"]`, 3000);
  await t.sov(600);
  await t.bilde("sola");

  // The jar fills up: a planet that stays above the line ends the game.
  await sett(`${legg(2, 150, 40)}; st.b[st.b.length - 1].y = 30; st.fare = 296`);
  await t.vent("Rusj.S.spill.status === 'over'", 3000);
  t.sjekk((await t.tilstand()).spill.ferdig === true, "Slutten ble ikke lagret med en gang");
  await t.vent("document.querySelector('.skjerm-slutt')", 5000);
  await t.sov(900);
  await t.bilde("slutt", true);
  const S = await t.tilstand();
  t.sjekk(S.rekord > 0 && S.rekord === S.spill.st.poeng && S.storst === 10 && S.sist && S.sist.storst === 10, "Rekorden, største planet eller «sist» ble ikke lagret");
  t.sjekk(!t.norsk || /Største planet/i.test(await t.tekst(".pl-resultat")), "Resultatet viser ikke største planet");
  t.sjekk(await t.finnes('[data-h="del"]'), "Resultatet mangler «Del»");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");
  t.sjekk(await t.friForDokk(".pl-resultat"), "Resultatet ligger bak dokken");
  t.sjekk(!/kåringen/i.test(await t.tekst("#topp-tittel")), "Topplinja sier «Kåringen» på et soloresultat");
  await t.klikk('[data-h="del"]', 600);

  // «Spill igjen»: an empty jar at once.
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.pl-lerret')");
  s = await st();
  t.sjekk((await t.js("Rusj.S.spill.status")) === "spiller" && s.b.length === 0 && s.poeng === 0, "«Spill igjen» ga ikke et tomt glass");

  // The smallest phones (and a phone on its side): the jar fits, the page never scrolls.
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  const maal = [[bredde0, hoyde0], ...[[320, 568], [375, 560]].filter(([w]) => w < bredde0 && bredde0 < hoyde0)];
  for (const [w, h] of maal) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(600);
    const m = await t.js(`(() => {
      const l = document.querySelector(".pl-lerret").getBoundingClientRect();
      const hud = document.querySelector(".pl-hud").getBoundingClientRect();
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, lw: l.width, lh: l.height, bunn: l.bottom, topp: l.top, hudBunn: hud.bottom, hudVenstre: hud.left, hoyre: l.right, h: innerHeight };
    })()`);
    t.sjekk(m.side <= 1 && m.bred <= 0, `${w}×${h}: siden kan scrolles`);
    t.sjekk(m.bunn <= m.h && (m.lh >= 230 || (w > h && m.lh >= 200)), `${w}×${h}: glasset får ikke plass (${Math.round(m.lw)}×${Math.round(m.lh)})`);
    if (w > h) t.sjekk(m.hudVenstre >= m.hoyre - 1, `${w}×${h}: poengene står ikke ved siden av glasset`);
    else t.sjekk(m.topp >= m.hudBunn - 1, `${w}×${h}: glasset ligger over poengene`);
    if (w !== bredde0) await t.bilde(`${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // Home remembers the record and the last game.
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.pl-rekorder')");
  t.sjekk((await t.antall(".pl-rekorder li")) === 3, "Hjem viser ikke rekord, største planet og «sist»");
  await t.bilde("hjem-rekord");

  // A tampered save (a body that is not a planet) is dropped, not drawn.
  await t.js(`Rusj.S.spill.st.b = [{ n: "__proto__" }]; Rusj.lagre()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.tilstand()).spill === null, "En ødelagt lagring ble ikke forkastet");
}
