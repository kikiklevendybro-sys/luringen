// Hjulet: the 18+ gate («Nei» leads away, «Ja» opens the game), setup with a house rule, spinning
// (button, a tap on the wheel and a flick), every kind of field (truth, challenge, category, rule
// with typed text, mate, spin again, a renamed field), reload mid-spin, leaving mid-spin, the water
// break after ten spins, back + continue, «Nytt spill» asks first, small screens (375 × 560 and
// 320 × 568), the crowning, «Spill igjen» and resetting the house rules.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const NOKKEL = "rusj.hjulet.v1";
const FELT = ["alle", "venstre", "gi3", "vann", "utfordring", "sannhet", "kompis", "ta1", "fritak", "igjen", "kategori", "regel"];
const HJUL = "document.querySelector('[data-h=\"snurr\"]:not(:disabled)') && document.querySelector('#hjul')";
const KORT = "document.querySelector('#hjul-kort')";

async function aldersport(t, sjekkNei) {
  if (!(await t.finnes('[data-h="alder-ja"]'))) {
    await t.js(`(() => { const f = JSON.parse(localStorage.getItem("rusj.felles") || "{}"); delete f.over18; localStorage.setItem("rusj.felles", JSON.stringify(f)); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  }
  t.sjekk(await t.finnes('[data-h="alder-ja"]'), "18-årsgrensen vises ikke før spillet");
  if (sjekkNei) {
    await t.bilde("aldersgrense");
    await t.klikk('[data-h="alder-nei"]', 50);
    await t.vent("location.pathname === '/' && document.readyState === 'complete'", 8000);
    t.sjekk(!/\/hjulet\//.test(await t.js("location.pathname")), "«Nei, ta meg tilbake» ble på spillsiden");
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    t.sjekk(await t.finnes('[data-h="alder-ja"]'), "Etter «Nei» skal aldersgrensen vises igjen");
  }
  await t.klikk('[data-h="alder-ja"]');
  await t.vent("document.querySelector('.spillhjem h1')");
}

// Make the wheel "land" on a field (as if it stopped there) and reload: the game shows its card.
async function lander(t, id, ekstra = "") {
  const mal = FELT.indexOf(id);
  await t.js(`(() => {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)}));
    s.spill.fase = "hjul";
    s.spill.snurr = { mal: ${mal}, vinkel: ${(90 - mal * 30 - 15 + 360) % 360} };
    s.skjerm = "hjul";
    ${ekstra}
    localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s));
  })()`);
  await t.lastSide(t.side, KORT);
  await t.sov(420);
}

// Drag along an arc around the wheel's centre and let go while moving (a flick).
async function flikk(t, fra = 200, steg = 26) {
  const b = await t.js(`(() => { const r = document.querySelector("#hjul").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width * 0.32 }; })()`);
  const punkt = (v) => ({ x: b.x + b.r * Math.sin((v * Math.PI) / 180), y: b.y - b.r * Math.cos((v * Math.PI) / 180) });
  let p = punkt(fra);
  await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 6; i++) {
    p = punkt(fra + i * steg);
    await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "left", buttons: 1 });
    await t.sov(16);
  }
  await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
}

export default async function (t) {
  const pause = () => t.sov(420);
  const s = () => t.tilstand();

  // ---------- 18+ gate, home ----------
  await aldersport(t, true);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Hjulet", "Hjem-skjermen viser ikke «Hjulet» etter aldersgrensen");
  t.sjekk(await t.finnes("#tilportal:not([hidden])"), "Mangler rusj-knappen øverst på hjem-skjermen");
  await t.bilde("hjem-etter-18");
  await t.klikk("#reglerknapp");
  t.sjekk(/alkoholfritt/i.test(await t.tekst("#ark")) && /stå over/i.test(await t.tekst("#ark")), "Reglene sier ikke at alkoholfritt teller og at alle kan stå over");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Setup and a house rule ----------
  await t.start({ navn: NAVN });
  await aldersport(t, false);
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4, "Oppsettet viser ikke de fire lagrede spillerne");
  t.sjekk(await t.finnes(".hjul-mini #hjul"), "Oppsettet viser ikke hjulet");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="husregler"]');
  t.sjekk((await t.antall(".hus-rad")) === 12, "Husreglene viser ikke alle tolv feltene");
  await t.skrivInn('.hus-navn[data-id="ta1"]', "Dans!");
  await t.skrivInn('.hus-tekst[data-id="ta1"]', "Dans som <x-q>ingen</x-q> ser på i ti sekunder.");
  t.sjekk((await t.tekst("#hus-teller-7")).trim() === "5/14", "Husreglene viser ikke telleren «x/14»");
  await t.bilde("husregler");
  await t.lastSide(t.side, "document.querySelector('.hus-liste')");
  t.sjekk((await t.js(`document.querySelector('.hus-navn[data-id="ta1"]').value`)) === "Dans!", "Husregelen ble ikke husket");
  await t.klikk('[data-h="hus-ferdig"]');
  await t.vent("document.querySelector('[data-h=\"start\"]')");
  t.sjekk(/1 av 12/.test(await t.tekst("#skjerm")), "Oppsettet viser ikke at ett felt er endret");
  t.sjekk((await t.tekst(".hjul-mini")).includes("Dans!"), "Hjulet viser ikke det nye navnet");
  await t.klikk('[data-h="start"]');
  await t.vent(HJUL);
  let st = await s();
  t.sjekk(st._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[st.spill.tur], "Overskriften viser ikke hvem som har tur");
  await t.sov(400);
  await t.bilde("hjul");

  // ---------- 1. Spin with the button ----------
  const forste = st.spill.tur;
  await t.klikk('[data-h="snurr"]', 40);
  await t.sov(1200);
  await t.bilde("snurrer");
  const dobleId = await t.js("(() => { const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); return ids.filter((id, i) => ids.indexOf(id) !== i); })()");
  t.sjekk(!dobleId.length, `Samme id flere ganger mens hjulet snurrer: ${dobleId.join(", ")}`);
  const mal = (await s()).spill.snurr && (await s()).spill.snurr.mal;
  await t.vent(KORT, 10000);
  st = await s();
  t.sjekk(st.spill.nr === 1 && st.spill.felt === mal && st.spill.tell[forste][mal] === 1, "Hjulet landet ikke på feltet som ble trukket");
  t.sjekk(st.spill.vinkel !== undefined && Math.floor(((90 - st.spill.vinkel) % 360 + 360) % 360 / 30) === mal, "Pekeren peker ikke på feltet som ble trukket");
  await t.sov(500);
  await t.bilde("felt");
  t.sjekk((await t.antall("#skjerm h1")) === 1, "Feltskjermen skal ha nøyaktig én h1");
  if (FELT[mal] === "igjen") {
    await pause();
    await t.klikk('[data-h="igjen-snurr"]');
    await t.vent(HJUL);
    t.sjekk((await s()).spill.tur === forste, "«Snurr igjen» skal la samme spiller snurre");
    await t.klikk('[data-h="snurr"]', 40);
    await t.vent(KORT, 10000);
  }
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(HJUL);
  t.sjekk((await s()).spill.tur === (forste + 1) % 4, "Turen gikk ikke videre til neste spiller");

  // ---------- 2. A tap on the wheel spins it; 3. a flick spins it ----------
  await pause();
  await t.trykk("#hjul");
  await t.sov(300);
  t.sjekk(!!(await s()).spill.snurr || (await t.finnes("#hjul-kort")), "Et trykk på hjulet satte det ikke i gang");
  await t.vent(KORT, 10000);
  if (await t.finnes('[data-h="igjen-snurr"]')) {
    await pause();
    await t.klikk('[data-h="igjen-snurr"]');
  } else {
    await pause();
    await t.klikk('[data-h="neste"]');
  }
  await t.vent(HJUL);
  await pause();
  await flikk(t);
  await t.sov(500);
  t.sjekk(!!(await s()).spill.snurr, "Et kast med fingeren satte ikke hjulet i gang");
  await t.vent(KORT, 10000);

  // ---------- Every kind of field ----------
  await lander(t, "sannhet");
  t.sjekk(/Sannhet/.test(await t.tekst("#hjul-kort h1")), "Sannhet-feltet viser ikke riktig kort");
  const sp1 = await t.tekst(".hjul-oppgave-tekst");
  t.sjekk(sp1.length > 10 && /\?$/.test(sp1.trim()), "Sannhet viser ikke et spørsmål");
  await t.bilde("sannhet");
  await t.klikk('[data-h="ide"]');
  t.sjekk((await t.tekst(".hjul-oppgave-tekst")) !== sp1, "🎲 ga ikke et nytt spørsmål");

  await lander(t, "utfordring");
  t.sjekk((await t.tekst(".hjul-oppgave-tekst")).length > 10, "Utfordring viser ikke en utfordring");
  await t.bilde("utfordring");

  await lander(t, "kategori");
  t.sjekk(/Kategori/i.test(await t.tekst(".hjul-oppgave-tekst")), "Kategori viser ikke et forslag");

  await lander(t, "regel");
  await t.klikk('[data-h="ide-bruk"]');
  t.sjekk((await t.js("document.querySelector('#hjul-utkast').value")).length > 3, "«Bruk» fylte ikke inn idéen");
  await t.skrivInn("#hjul-utkast", "Ingen får si <x-q>ja</x-q>");
  await t.bilde("regel");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('#hjul, .hjul-vann')");
  st = await s();
  t.sjekk(st.spill.regler.length >= 1 && st.spill.regler[st.spill.regler.length - 1].t === "Ingen får si <x-q>ja</x-q>", "Regelen ble ikke lagret");
  if (await t.finnes(".hjul-vann")) {
    await pause();
    await t.klikk('[data-h="vann-ferdig"]');
    await t.vent(HJUL);
  }

  await lander(t, "kompis");
  const kompisTur = (await s()).spill.tur;
  await t.klikk('[data-h="kompis"]');
  t.sjekk((await t.antall('#ark [data-h="ark-svar"]')) === 3, "Kompis-arket skal vise de tre andre spillerne");
  await t.klikk('#ark [data-h="ark-svar"][data-v="0"]');
  st = await s();
  t.sjekk(Array.isArray(st.spill.kompis) && st.spill.kompis[0] === kompisTur && st.spill.kompis[1] !== kompisTur, "Kompisen ble ikke valgt");
  await t.bilde("kompis");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('#hjul, .hjul-vann')");
  if (await t.finnes(".hjul-vann")) {
    await pause();
    await t.klikk('[data-h="vann-ferdig"]');
    await t.vent(HJUL);
  }
  t.sjekk(await t.finnes(".hjul-status"), "Hjulet viser ikke kompiser og regler");
  await t.klikk('[data-h="status"]');
  const ark = await t.tekst("#ark");
  t.sjekk(/Kompiser/.test(ark) && ark.includes("Ingen får si <x-q>ja</x-q>"), "«Gjelder nå» viser ikke kompiser og regler");
  t.sjekk(!(await t.finnes("x-q")), "Regelteksten ble tolket som HTML");
  await t.bilde("gjelder-na");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // The renamed field shows only the players' own text
  await lander(t, "ta1");
  t.sjekk((await t.tekst("#hjul-kort h1")).trim() === "Dans!", "Det endrede feltet viser ikke sitt nye navn");
  t.sjekk((await t.tekst("#hjul-kort")).includes("Dans som <x-q>ingen</x-q> ser på"), "Det endrede feltet viser ikke sin egen tekst");
  t.sjekk(!(await t.finnes("x-q")), "Husregelen ble tolket som HTML");
  await t.bilde("eget-felt");

  // Renaming «Sannhet» only keeps the built-in questions
  await lander(t, "sannhet", "s.oppsett.felt.sannhet = { navn: 'Fortell!', tekst: '' };");
  t.sjekk((await t.tekst("#hjul-kort h1")).trim() === "Fortell!" && /\?$/.test((await t.tekst(".hjul-oppgave-tekst")).trim()), "Omdøpt «Sannhet» mistet de innebygde spørsmålene");
  await lander(t, "sannhet", "s.oppsett.felt.sannhet = { navn: '', tekst: '' };");

  // Reduced motion: less than one calm turn, straight to the field
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('#hjul, .hjul-vann')");
  if (await t.finnes(".hjul-vann")) { await pause(); await t.klikk('[data-h="vann-ferdig"]'); await t.vent(HJUL); }
  const fraVinkel = (await s()).spill.vinkel;
  await pause();
  await t.klikk('[data-h="snurr"]', 20);
  let tilVinkel = NaN;
  for (let n = 0; n < 40 && !(await t.finnes("#hjul-kort")); n++) {
    const v = await t.js("(() => { const e = document.querySelector('#hjul [data-roter]'); return e ? parseFloat(e.style.transform.replace(/[^0-9.-]/g, '')) : null; })()");
    if (v != null) tilVinkel = v;
    await t.sov(50);
  }
  t.sjekk(Number.isFinite(tilVinkel) && Math.abs(tilVinkel - fraVinkel) < 360, `Med redusert bevegelse snurret hjulet ${Math.round(Math.abs(tilVinkel - fraVinkel))}° (skal være under én runde)`);
  await t.vent(KORT, 4000);
  await t.send("Emulation.setEmulatedMedia", { features: [] });

  // Spin again keeps the same player
  await lander(t, "igjen");
  const igjenTur = (await s()).spill.tur;
  await pause();
  await t.klikk('[data-h="igjen-snurr"]');
  await t.vent(HJUL);
  t.sjekk((await s()).spill.tur === igjenTur && /igjen/i.test(await t.tekst("#hjul-info")), "«Snurr igjen» ga ikke samme spiller en ny tur");

  // ---------- Reload mid-spin lands on the drawn field ----------
  await t.klikk('[data-h="snurr"]', 40);
  await t.sov(700);
  const trukket = (await s()).spill.snurr.mal;
  await t.lastSide(t.side, KORT);
  st = await s();
  t.sjekk(st.spill.felt === trukket && st.spill.snurr === null, "Omlasting midt i et snurr landet ikke på feltet som var trukket");

  // ---------- Leaving mid-spin: «Fortsett» shows the result ----------
  await pause();
  await t.klikk(FELT[st.spill.felt] === "igjen" ? '[data-h="igjen-snurr"]' : '[data-h="neste"]');
  await t.vent("document.querySelector('#hjul, .hjul-vann')");
  if (await t.finnes(".hjul-vann")) {
    await pause();
    await t.klikk('[data-h="vann-ferdig"]');
    await t.vent(HJUL);
  }
  await t.klikk('[data-h="snurr"]', 40);
  await t.sov(600);
  const trukket2 = (await s()).spill.snurr.mal;
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent(KORT);
  t.sjekk((await s()).spill.felt === trukket2, "Et avbrutt snurr landet ikke på feltet som var trukket");

  // ---------- Water break after ten spins ----------
  await lander(t, "fritak", "s.spill.nr = 9; s.spill.sisteVann = 0; s.spill.tur = 1;");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.hjul-vann')", 5000);
  st = await s();
  t.sjekk(st.spill.fase === "vann" && st.spill.nr === 10, "Vannpausen kom ikke etter ti snurr");
  await t.bilde("vannpause");
  await pause();
  await t.klikk('[data-h="vann-ferdig"]');
  await t.vent(HJUL);

  // ---------- Small screens ----------
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  const over = (sel) => t.js(`(() => { const a = document.querySelector(${JSON.stringify(sel)}); const d = document.querySelector('#skjerm .dokk'); if (!a || !d) return false; return a.getBoundingClientRect().bottom <= d.getBoundingClientRect().top + 2; })()`);
  const fri = (sel) => t.js(`(() => { const a = document.querySelector(${JSON.stringify(sel)}); if (!a) return false; const r = a.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight + 1) return false; const d = document.querySelector("#skjerm .dokk"); if (!d) return true; const q = d.getBoundingClientRect(); return q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom; })()`);
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    await t.js("window.scrollTo(0, 0)");
    const sjekk = b > h ? fri : over;
    t.sjekk(await sjekk("#hjul"), `Hjulet skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await sjekk("#skjerm h1"), `Navnet skjules bak knappene på ${b} × ${h}`);
    if (await t.finnes(".hjul-status")) t.sjekk(/Kompis: |regel/.test(await t.tekst(".hjul-status-linje")), `«Gjelder nå» er ikke én linje med rollen skrevet ut på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`hjul-${b}x${h}`);
  }
  await lander(t, "sannhet");
  t.sjekk((await t.tekst(".hjul-neste-linje")).includes("snurrer neste") && (await t.tekst('[data-h="neste"]')).trim() === "Neste snurr", "Feltet viser ikke «X snurrer neste» over «Neste snurr»");
  t.sjekk(/stå over/.test(await t.tekst("#hjul-kort")) && !/ta en slurk i stedet/.test(await t.tekst("#hjul-kort")), "Sannhet skal si «eller stå over», ikke gjøre slurken til prisen for å si nei");
  for (const [b, h] of [[320, 568], [Math.min(375, b0), 560], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    await t.js("window.scrollTo(0, 0)");
    t.sjekk(await (b > h ? fri : over)(".hjul-oppgave"), `Spørsmålet skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await t.js("(() => { const e = document.querySelector('.hjul-fot'); return !!e && getComputedStyle(e).display !== 'none'; })()"), `Bunnlinjen mangler på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`felt-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // ---------- The crowning: two free passes make Testspiller C the wheel's favourite ----------
  await lander(t, "fritak", "s.spill.tur = 2; s.spill.tell.forEach((r) => (r[8] = 0, r[2] = 0, r[9] = 0)); s.spill.tell[2][8] = 1;");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await s()).skjerm === "felt", "«Spill videre» skulle bli i spillet");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.hjul-banner')");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Testspiller C er hjulets favoritt!", `Feil kåring: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(/heldiggrisen/i.test(await t.tekst(".hjul-priser")), "Kåringen viser ikke prisene");
  t.sjekk(await t.finnes(".hjul-stat li"), "Kåringen viser ikke hva hjulet landet på");
  t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await s())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk(!(await t.finnes("x-q")), "Brukertekst ble tolket som HTML på kåringen");
  await t.sov(700);
  await t.bilde("kaaring", true);

  // ---------- «Spill igjen»; «Avslutt» before any spin; reset the house rules ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent(HJUL);
  st = await s();
  t.sjekk(st.spill.nr === 0 && st.spill.antall === 4, "«Spill igjen» startet ikke et nytt spill med samme gjeng");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await s()).spill === null, "«Avslutt» før første snurr avsluttet ikke spillet");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="husregler"]');
  await t.klikk('[data-h="hus-nullstill"]');
  await t.klikk('#ark [data-v="ja"]');
  t.sjekk(Object.keys((await s()).oppsett.felt).length === 0, "Husreglene ble ikke tilbakestilt");
  t.sjekk((await t.js(`document.querySelector('.hus-navn[data-id="ta1"]').value`)) === "", "Feltet viser fortsatt den gamle husregelen");
}
