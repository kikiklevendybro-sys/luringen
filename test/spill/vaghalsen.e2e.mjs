// Våghalsen: set up, spin the bottle (button, tap on the table and a flick), dare + swap card,
// undo a result, truth, passing («Står over»), reload mid-card, back + continue, «Nytt spill» asks first,
// awards, then "på rekke og rad" with 20 players, a 320 × 568 phone and a game for two.
// Regression checks: a real double tap on «Konsekvens» never gives points without the card,
// unique ids while spinning, packs look multi-select, «Avslutt» asks first, pagar, 375 × 560.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C"];
const VALG = "document.querySelector('[data-h=\"velg\"]')";
const SNURR = "document.querySelector('[data-h=\"snurr\"]:not(:disabled)')";

// Drag along an arc around the table's centre and let go while moving (a flick).
async function flikk(t, fra = 200, steg = 24) {
  const b = await t.js(`(() => { const r = document.querySelector("#vh-hjul").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width * 0.3 }; })()`);
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
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke de tre lagrede spillerne");
  t.sjekk(await t.finnes('.fliser.flervalg [data-h="pakke"]'), "Kortpakkene ser ikke ut som flervalg (mangler ✓-stilen)");
  t.sjekk(!(await t.finnes('.fliser.flervalg [data-h="turmodus"]')), "«Hvem står for tur?» skal være ett valg, ikke flervalg");
  await t.klikk('[data-h="pakke"][data-v="fest"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.includes("fest"), "Fest-pakken ble ikke valgt");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="pakke"][data-v="fest"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#vh-hjul')");
  await t.bilde("bord");
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet regnes ikke som pågående (pagar)");

  // 1. Spin with the button: the bottle stops on someone
  await t.klikk('[data-h="snurr"]', 40);
  await t.sov(1300);
  await t.bilde("snurrer");
  const dobleId = await t.js("(() => { const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); return ids.filter((id, i) => ids.indexOf(id) !== i); })()");
  t.sjekk(!dobleId.length, `Samme id flere ganger mens flaska snurrer: ${dobleId.join(", ")}`);
  await t.vent(VALG, 9000);
  let s = await t.tilstand();
  t.sjekk(s.spill.fase === "valg" && Number.isInteger(s.spill.tur), "Flaska stoppet ikke på en spiller");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[s.spill.tur], "Navnet under bordet er ikke den flaska peker på");
  await t.sov(700);
  await t.bilde("flaska-har-talt");
  const forste = s.spill.tur;

  // 2. Dare, swap it once, complete it (+2)
  await t.klikk('[data-h="velg"][data-v="k"]');
  await t.vent("document.querySelector('#vh-kort')");
  t.sjekk(!/\{spiller\}/.test(await t.tekst("#vh-kort")), "Kortet viser {spiller} i stedet for et navn");
  const kort1 = (await t.tilstand()).spill.kort;
  await t.bilde("konsekvens");
  await t.klikk('[data-h="bytt"]', 400);
  s = await t.tilstand();
  t.sjekk(s.spill.byttet && s.spill.kort !== kort1, "«Bytt kort» ga ikke et nytt kort");
  t.sjekk(!(await t.finnes('[data-h="bytt"]')), "Det går an å bytte kort mer enn én gang");
  await t.klikk('[data-h="fullfort"]', 450);
  await t.bilde("fullfort");
  await t.vent(SNURR, 5000);
  s = await t.tilstand();
  t.sjekk(s.spill.stat[forste].k === 1 && s.spill.nr === 1, "Konsekvensen ble ikke talt");

  // «Angre» takes the points back and shows the same card again, until the next spin
  t.sjekk(await t.finnes('[data-h="angre"]'), "Mangler «Angre» etter at poeng er gitt");
  const kortForAngre = s.spill.angre && s.spill.angre.kort;
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('#vh-kort')");
  s = await t.tilstand();
  t.sjekk(s.spill.stat[forste].k === 0 && s.spill.nr === 0 && s.spill.kort === kortForAngre, "«Angre» tok ikke tilbake poenget og kortet");
  await t.klikk('[data-h="fullfort"]', 450);
  await t.vent(SNURR, 5000);
  t.sjekk((await t.tilstand()).spill.stat[forste].k === 1, "Konsekvensen ble ikke talt etter angring");
  t.sjekk(/snurrer/.test(await t.tekst("#skjerm h1")), "Den som nettopp spilte, blir ikke bedt om å snurre");

  // 3. Tap the table to spin; never the same player twice in a row; truth
  await t.trykk("#vh-hjul");
  await t.vent(VALG, 9000);
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "«Angre» skal forsvinne når flaska snurres igjen");
  s = await t.tilstand();
  t.sjekk(s.spill.tur !== forste, "Flaska valgte samme spiller to ganger på rad");
  const andre = s.spill.tur;
  await t.klikk('[data-h="velg"][data-v="s"]');
  await t.vent("document.querySelector('#vh-kort')");
  await t.bilde("sannhet");

  // 4. Reload in the middle of a card: same card comes back
  const kortFor = (await t.tilstand()).spill.kort;
  await t.lastSide(t.side, "document.querySelector('#vh-kort')");
  t.sjekk((await t.tilstand()).spill.kort === kortFor, "Kortet var byttet ut etter omlasting");

  // 5. Pass («Står over»): no points, no booing, and it never shows up in the awards
  await t.klikk('[data-h="staover"]', 450);
  await t.bilde("star-over");
  await t.vent(SNURR, 5000);
  s = await t.tilstand();
  t.sjekk(s.spill.stat[andre].f === 1 && s.spill.stat[andre].s === 0 && s.spill.stat[andre].turer === 1, "«Står over» ble ikke registrert riktig");

  // 6. Flick the bottle with a finger (drag along an arc and let go)
  await flikk(t);
  await t.sov(900);
  t.sjekk(!!(await t.tilstand()).spill.snurr, "Et kast med fingeren satte ikke flaska i gang");
  await t.vent(VALG, 9000);
  s = await t.tilstand();
  t.sjekk(s.spill.tur !== andre, "Flaska valgte samme spiller to ganger på rad (etter kast)");
  const tredje = s.spill.tur;

  // 7. Re-spin is allowed before choosing
  await t.klikk('[data-h="snurr-igjen"]');
  await t.vent(VALG, 9000);
  s = await t.tilstand();
  const fjerde = s.spill.tur;
  t.sjekk(fjerde !== tredje, "«Snurr på nytt» kan ikke lande på samme spiller");
  await t.klikk('[data-h="velg"][data-v="s"]');
  await t.vent("document.querySelector('#vh-kort')");
  await t.klikk('[data-h="fullfort"]', 300);
  await t.vent(SNURR, 5000);

  // 8. Back to home keeps the game; «Nytt spill» asks first (cancel keeps it); continue; score sheet
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spurte ikke før spillet ble kastet");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om man trykket Avbryt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('#vh-hjul')");
  await t.klikk('[data-h="poeng"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .vh-tavle"), "Poengtavla vises ikke");
  await t.bilde("poengtavle");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // 9. Awards: the link is just «Avslutt» and asks first («Spill videre» stays in the game)
  t.sjekk((await t.tekst('[data-h="kaaring"]')).trim() === "Avslutt", "Lenken for å avslutte skal hete «Avslutt»");
  await t.klikk('[data-h="kaaring"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.tilstand()).skjerm === "runde", "«Spill videre» skulle bli i spillet");
  await t.klikk('[data-h="kaaring"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.vh-priser')");
  t.sjekk((await t.tilstand())._aktiv === false, "Kåringen skal ikke regnes som et pågående spill (pagar)");
  t.sjekk(!(await t.finnes("#skjerm .banner .etikett")), "«Kåringen» står både i toppfeltet og i banneret");
  await t.sov(700);
  await t.bilde("kaaring", true);
  const h1 = (await t.tekst("#skjerm h1")).trim();
  t.sjekk(h1 === `${NAVN[forste]} vinner!`, `Overskriften skulle vært «${NAVN[forste]} vinner!», men er «${h1}»`);
  t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler lenken «Alle spill»");
  const priser = (await t.tekst(".vh-priser")).toLowerCase();
  t.sjekk(priser.includes("største våghals") && priser.includes("ærligste"), "Kåringen mangler største våghals eller ærligste");
  t.sjekk(!/feig|står over/.test(priser), "Kåringen skal ikke trekke fram den som sto over");

  // 10. Five players with names of different lengths: the name tags around the table
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.skrivInn("#navn-3", "Testspiller Lang");
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.skrivInn("#navn-4", "Test E");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#vh-hjul')");
  t.sjekk((await t.antall("#vh-hjul .vh-plass")) === 5, "Bordet viser ikke fem spillere");
  await t.bilde("bord-5-spillere");
  await t.klikk('[data-h="snurr"]', 40);
  await t.vent(VALG, 9000);
  await t.sov(700);
  await t.bilde("bord-5-valgt");

  // 11. New setup: in turn order with 20 players (one with a long name). «Start nytt» throws the old game away.
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-v="ja"]');
  t.sjekk(!(await t.tilstand()).spill, "«Start nytt» fjernet ikke det gamle spillet");
  await t.klikk('[data-h="turmodus"][data-v="rekke"]');
  for (let i = 5; i < 20; i++) await t.klikk('[data-h="spiller-legg-til"]', 30);
  t.sjekk((await t.antall(".spiller")) === 20, "Fikk ikke lagt til 20 spillere");
  await t.klikk('[data-h="start"]');
  await t.vent(VALG);
  await t.sov(1800);
  await t.bilde("rekke-20-spillere");
  s = await t.tilstand();
  t.sjekk(s.spill.modus === "rekke" && s.spill.antall === 20, "Spillet startet ikke i rekkefølge med 20 spillere");
  const tur = s.spill.tur;
  // Double tap on «Konsekvens»: two real taps 90 ms apart. The second one lands where «Fullført!»
  // sits on the card screen — it must be ignored, so no points are given before the card is read.
  const knapp = await t.js(`(() => { const b = document.querySelector('[data-h="velg"][data-v="k"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  for (const n of [1, 2]) {
    await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: knapp.x, y: knapp.y, button: "left", buttons: 1, clickCount: n });
    await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: knapp.x, y: knapp.y, button: "left", buttons: 0, clickCount: n });
    if (n === 1) await t.sov(90);
  }
  await t.sov(700);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "kort" && s.spill.stat[tur].k === 0 && s.spill.nr === 0, "Dobbelttrykk på «Konsekvens» ga poeng uten at kortet ble vist");
  t.sjekk((await t.finnes("#vh-kort")) && !(await t.finnes(".vh-stempel")), "Dobbelttrykk på «Konsekvens» hoppet over kortet");
  await t.klikk('[data-h="fullfort"]', 300);
  await t.vent(VALG, 5000);
  s = await t.tilstand();
  t.sjekk(s.spill.tur === (tur + 1) % 20, "Turen gikk ikke videre til neste spiller");

  // 12. Small phone (320 × 568): nothing may stick out sideways, the name stays above the dock
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(1600);
  const bredt = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(bredt <= 0, `Siden er ${bredt}px for bred på 320 px skjerm`);
  const synlig = await t.js("(() => { const h = document.querySelector('#skjerm h1').getBoundingClientRect(); const d = document.querySelector('.dokk .vh-valg').getBoundingClientRect(); return h.bottom <= d.top + 2; })()");
  t.sjekk(synlig, "Navnet under bordet skjules bak knappene på 320 × 568");
  await t.bilde("smal-320");
  await t.klikk('[data-h="velg"][data-v="s"]');
  await t.vent("document.querySelector('#vh-kort')");
  await t.bilde("smal-320-kort");
  // 375 × 560 (or narrower when the runner itself is narrower): the card text and the name under
  // the table stay above the dock
  await t.send("Emulation.setDeviceMetricsOverride", { width: Math.min(375, b0), height: 560, deviceScaleFactor: 2, mobile: true });
  await t.sov(600);
  const kortSynlig = await t.js("(() => { const k = document.querySelector('#vh-kort .storkort-tekst').getBoundingClientRect(); const d = document.querySelector('.dokk .vh-utfall').getBoundingClientRect(); return k.bottom <= d.top + 2; })()");
  t.sjekk(kortSynlig, "Kortteksten skjules bak knappene på 375 × 560");
  await t.bilde("kort-hoyde-560");
  await t.klikk('[data-h="fullfort"]', 300);
  await t.vent(VALG, 5000);
  await t.sov(1600);
  const navnSynlig = await t.js("(() => { const h = document.querySelector('#skjerm h1').getBoundingClientRect(); const d = document.querySelector('.dokk .vh-valg').getBoundingClientRect(); return h.bottom <= d.top + 2; })()");
  t.sjekk(navnSynlig, "Navnet under bordet skjules bak knappene på 375 × 560");
  await t.bilde("bord-hoyde-560");
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });

  // 13. Just two players: the bottle still works, and dares name the other one
  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 2, "Oppsettet viser ikke to spillere");
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="snurr"]', 40);
  await t.vent(VALG, 9000);
  await t.sov(700);
  await t.bilde("to-spillere");
  await t.klikk('[data-h="velg"][data-v="k"]');
  await t.vent("document.querySelector('#vh-kort')");
  t.sjekk(!/\{spiller\}/.test(await t.tekst("#vh-kort")), "Kortet viser {spiller} med to spillere");
}
