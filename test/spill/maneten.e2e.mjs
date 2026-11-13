// Maneten (one-tap): the home screen; the jellyfish waits until the first press; a real press on the
// pad, on the board and the space bar all make it swim up, letting go sinks it; an autopilot (key
// presses from the page, like a player) swims a stretch; a pearl is collected; a hidden tab pauses
// and nothing moves; a reload waits in pause and «Fortsett» counts down; the rules pause; back +
// continue; a crash leaves the board with a small card and one press starts the next run; «Se
// resultatet»; a new record goes to the result screen by itself; 300 m gives the sticker; small
// phones and a phone on its side fit; home remembers the record, the pearls and the last run; a
// tampered save is dropped. Runs in every edition: texts are checked in Norwegian only (t.norsk).
export default async function (t) {
  const st = () => t.js("JSON.parse(JSON.stringify(Rusj.S.spill.st))");
  const status = () => t.js("Rusj.S.spill.status");
  const sett = (kode) => t.js(`(() => { const sp = Rusj.S.spill; const st = sp.st; ${kode}; Rusj.lagre(); })()`);
  const punkt = (sel, fx = 0.5, fy = 0.5) => t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width * ${fx}, y: b.y + b.height * ${fy} }; })()`);
  async function hold(sel, ms, fx = 0.5, fy = 0.5) {
    const p = await punkt(sel, fx, fy);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.sov(ms);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  // The autopilot from the unit tests, pressing the space bar from inside the page.
  const pilot = (pa) =>
    t.js(
      pa
        ? `window.__pilot = setInterval(() => {
            const sp = Rusj.S.spill; if (!sp || sp.status !== "spiller" || sp.st.punkter.length < 2) return;
            const s = sp.st, R = 11;
            const vegg = (x) => { const p = s.punkter; for (let i = 1; i < p.length; i++) if (x <= p[i].x) { const a = p[i - 1], b = p[i], k = (x - a.x) / (b.x - a.x); return { c: a.c + (b.c - a.c) * k, f: a.f + (b.f - a.f) * k }; } return p[p.length - 1]; };
            const h = s.hindre.find((x) => x.x + (x.b || x.r) > s.d - R);
            let mal;
            if (h && h.x - s.d < 280) { const v = vegg(h.x); if (h.t === "stein") mal = h.side === "ned" ? (v.c + h.spiss) / 2 : (h.spiss + v.f) / 2; else { const y = h.a ? h.y0 + h.a * Math.sin(s.d * 0.011 + h.fase) : h.y0; mal = h.side === "opp" ? (v.c + y - h.r) / 2 : (y + h.r + v.f) / 2; } }
            else { const v = vegg(s.d + 50); mal = (v.c + v.f) / 2; }
            let c = 0, f = 440; for (let x = s.d - R; x <= s.d + 70; x += 10) { const v = vegg(x); c = Math.max(c, v.c); f = Math.min(f, v.f); }
            mal = c + R + 14 > f - R - 14 ? (c + f) / 2 : Math.min(f - R - 14, Math.max(c + R + 14, mal));
            const stopp = s.vy < 0 ? s.y - (s.vy * s.vy) / 2300 : s.y + (s.vy * s.vy) / 2700;
            document.dispatchEvent(new KeyboardEvent(stopp + s.vy * 0.06 > mal ? "keydown" : "keyup", { key: " ", bubbles: true }));
          }, 8)`
        : `clearInterval(window.__pilot); document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }))`,
    );
  const skjul = (pa) =>
    t.js(pa ? `Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"))` : `delete document.hidden`);

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(!t.norsk || /Start spill/.test(await t.tekst('[data-h="nytt"]')), "Hovedknappen heter ikke «Start spill»");
  t.sjekk(!(await t.finnes(".ma-rekorder")), "Rekordlinja vises før første tur");
  await t.bilde("hjem");

  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.ma-lerret') && Rusj.S.spill");
  await t.sov(500);
  let s = await st();
  t.sjekk((await status()) === "klar" && s.d === 0 && (await t.finnes(".ma-status.klar:not([hidden])")), "Maneten venter ikke på første trykk");
  await t.sov(400);
  t.sjekk((await st()).d === 0, "Maneten svømte før første trykk");
  await t.bilde("klar");

  // A real press on the pad starts it and swims up; letting go sinks.
  await hold(".ma-pad", 200);
  s = await st();
  t.sjekk((await status()) === "spiller" && s.d > 0 && s.y < 220 - 15, `Et trykk på puten fikk ikke maneten til å svømme opp (y = ${Math.round(s.y)})`);
  await t.sov(400);
  t.sjekk((await st()).vy > 0, "Maneten synker ikke når fingeren slippes");
  // Holding on the board works as well
  await sett("st.y = st.py = 300; st.vy = 0");
  await hold(".ma-lerret", 300, 0.6, 0.3);
  t.sjekk((await st()).y < 300 - 15, "Et trykk på brettet fikk ikke maneten til å svømme opp");
  // And the space bar
  await sett("st.y = st.py = 300; st.vy = 0");
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space" });
  await t.sov(300);
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space" });
  t.sjekk((await st()).y < 300 - 15, "Mellomrom fikk ikke maneten til å svømme opp");

  // The autopilot swims a stretch; a pearl right in front is collected.
  await pilot(true);
  await t.vent("Rusj.S.spill.st.d > 700", 8000);
  await sett("st.perleliste.push({ id: 99999, x: st.d + 6, y: st.y, tatt: false })");
  await t.vent("Rusj.S.spill.st.perler >= 1", 2000);
  t.sjekk((await t.tekst("#ma-perler")) !== "0", "Perlen ble ikke talt i toppen");
  await t.vent("Rusj.S.spill.st.d > 1500", 10000);
  t.sjekk((await status()) === "spiller", `Autopiloten krasjet (${(await st()).krasj})`);
  await t.bilde("svommer");

  // A hidden tab pauses at once, and nothing moves.
  await skjul(true);
  await pilot(false);
  t.sjekk((await status()) === "pause" && (await t.finnes(".ma-status:not([hidden]) [data-h='fortsett-spill']")), "Spillet tok ikke pause da fanen ble skjult");
  await skjul(false);
  const d0 = (await st()).d;
  await t.sov(500);
  t.sjekk((await st()).d === d0, "Maneten svømte videre under pausen");
  await t.bilde("pause");

  // Reload: waits in pause; «Fortsett» counts down and it swims again.
  await t.lastSide(t.side, "document.querySelector('.ma-lerret')");
  await t.sov(300);
  t.sjekk((await status()) === "pause" && Math.abs((await st()).d - d0) < 1, "Spillet ble ikke som før etter omlasting");
  await pilot(true);
  await t.klikk('[data-h="fortsett-spill"]');
  t.sjekk(await t.js("!document.querySelector('#nedtelling').hidden"), "Ingen nedtelling før maneten svømmer igjen");
  await t.vent("Rusj.S.spill.status === 'spiller'", 4000);

  // The rules pause it
  await t.klikk("#reglerknapp", 300);
  t.sjekk((await status()) === "pause", "Spillet tok ikke pause da reglene ble åpnet");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]', 300);
  t.sjekk((await status()) === "pause", "Spillet startet av seg selv etter reglene");

  // Back + continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ma-lerret')");
  await t.klikk('[data-h="fortsett-spill"]');
  await t.vent("Rusj.S.spill.status === 'spiller'", 4000);

  // 300 m: the sticker. A calm cave is laid out just before it.
  await sett("st.d = st.pd = 7480; st.y = st.py = 220; st.vy = 0; st.punkter = []; st.hindre = []; st.perleliste = []; st.genX = 7480 - 60; st.genMidt = 220; st.nesteHinder = 7480 + 400");
  await t.vent("Rusj.S.spill.st.d > 7520", 4000);
  await t.vent(`(JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "{}"))["arkade-maneten"]`, 3000);

  // Let go: it sinks into the floor. The first run gives no «new record»: the board stays, with a card.
  await pilot(false);
  await t.vent("Rusj.S.spill.status === 'over'", 8000);
  t.sjekk((await t.tilstand()).spill.ferdig === true && (await t.tilstand()).rekord >= 300, "Krasjet eller rekorden ble ikke lagret med en gang");
  await t.vent("document.querySelector('.ma-status.over:not([hidden]) .ma-statuskort.over')", 3000);
  await t.sov(400);
  t.sjekk(!(await t.finnes(".skjerm-slutt")), "Første krasj gikk rett til resultatet");
  t.sjekk((t.norsk ? /Au! 30\d m\. Trykk/ : /30\d/).test(await t.js("document.querySelector('#si').textContent")), "Krasjet ble ikke lest opp for skjermleser");
  await t.bilde("krasj");
  // One press: a new run at once
  await hold(".ma-pad", 120);
  await t.vent("Rusj.S.spill.status === 'spiller' && Rusj.S.spill.st.d < 200", 2000);
  t.sjekk((await t.finnes(".ma-status[hidden]")) && (await t.tekst("#ma-meter")) === "0", "Ett trykk etter krasjet startet ikke en ny tur");
  // Crash again (into the floor): «Se resultatet» opens the result
  await t.vent("Rusj.S.spill.status === 'over'", 8000);
  await t.vent("document.querySelector('.ma-status.over:not([hidden]) [data-h=\"resultat\"]')", 3000);
  await t.klikk('[data-h="resultat"]');
  await t.vent("document.querySelector('.skjerm-slutt')", 5000);
  await t.sov(900);
  await t.bilde("slutt", true);
  t.sjekk(await t.finnes('[data-h="del"]'), "Resultatet mangler «Del»");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");
  t.sjekk(await t.friForDokk(".ma-resultat"), "Resultatet ligger bak dokken");
  t.sjekk(!t.norsk || /traff veggen/i.test(await t.tekst(".banner")), "Resultatet sier ikke hva maneten traff");
  await t.klikk('[data-h="del"]', 600);

  // «Spill igjen»; a new record goes to the result screen by itself.
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.ma-lerret')");
  t.sjekk((await status()) === "klar" && (await st()).d === 0, "«Spill igjen» ga ikke en ny tur som venter");
  await hold(".ma-pad", 100);
  const rekord = (await t.tilstand()).rekord;
  await sett(`st.d = st.pd = ${(rekord + 5) * 25}; st.y = st.py = 220; st.vy = 0; st.punkter = []; st.hindre = []; st.perleliste = []; st.genX = st.d - 60; st.genMidt = 220; st.nesteHinder = st.d + 600`);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(500);
  t.sjekk((!t.norsk || /Ny rekord/.test(await t.tekst("#skjerm h1"))) && (await t.tilstand()).rekord >= rekord + 5, "En ny rekord gikk ikke til resultatskjermen");
  await t.bilde("ny-rekord");

  // Small phones and a phone on its side: the cave and the pad fit, the page never scrolls.
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.ma-lerret')");
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  const maal = [[bredde0, hoyde0], ...[[320, 568], [375, 560]].filter(([w]) => w < bredde0 && bredde0 < hoyde0)];
  for (const [w, h] of maal) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(600);
    const m = await t.js(`(() => {
      const l = document.querySelector(".ma-lerret").getBoundingClientRect();
      const p = document.querySelector(".ma-pad").getBoundingClientRect();
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, lw: l.width, lh: l.height, lb: l.bottom, lr: l.right, pt: p.top, pl: p.left, pb: p.bottom, ph: p.height, h: innerHeight };
    })()`);
    t.sjekk(m.side <= 1 && m.bred <= 0, `${w}×${h}: siden kan scrolles`);
    t.sjekk(m.lh >= 200 && m.lw >= 200, `${w}×${h}: hulen er for liten (${Math.round(m.lw)}×${Math.round(m.lh)})`);
    t.sjekk(m.pb <= m.h + 1 && m.ph >= 50 && (w > h ? m.pl >= m.lr - 1 : m.pt >= m.lb - 1), `${w}×${h}: puten får ikke plass ved hulen`);
    if (w !== bredde0) await t.bilde(`${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // Home remembers the record, the pearls and the last run
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.ma-rekorder')");
  t.sjekk((await t.antall(".ma-rekorder li")) === 3, "Hjem viser ikke rekord, perler og «sist»");
  await t.bilde("hjem-rekord");

  // A tampered save is dropped
  await t.js(`Rusj.S.spill.st.punkter = "x"; Rusj.lagre()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.tilstand()).spill === null, "En ødelagt lagring ble ikke forkastet");
}
