// Våghalsen: set up, spin the bottle (button, tap on the table and a flick), dare + swap card,
// undo a result, truth, passing («Står over»), reload mid-card, back + continue, «Nytt spill» asks first,
// awards, then "på rekke og rad" with 20 players, a 320 × 568 phone and a game for two.
// Then the finish line («Hvor lenge?»: turns each, first to ten, in turn order and with the bottle),
// the clock on timed cards, «Gjelder nå» chips («Glemte seg!» + undo), the Christmas pack (#jul).
// Regression checks: a real double tap on «Konsekvens» never gives points without the card,
// unique ids while spinning, packs look multi-select, «Avslutt» asks first and is in every dock,
// pagar, 375 × 560, Kåringen is final (no way back into the game, no «Fortsett» afterwards) and is
// counted once for «Kveldens gjeng», the rim lights blink at most three times a second.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C"];
const VALG = "document.querySelector('[data-h=\"velg\"]')";
const SNURR = "document.querySelector('[data-h=\"snurr\"]:not(:disabled)')";
const KORT = "document.querySelector('#vh-kort')";
const NOKKEL = "rusj.vaghalsen.v1";

// Change the saved game and load the page again (the kit only saves on screen changes and redraws,
// so the change survives the reload). `endre` runs in the page: (state, argument, all cards) => {}.
async function settTilstand(t, endre, arg) {
  await t.js(`(() => {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)}));
    const tekst = (k) => (typeof k === "string" ? k : k.t);
    const kort = { s: [], k: [] };
    for (const p of window.RUSJ_DATA.kort.pakker) { p.sannhet.forEach((k) => kort.s.push(tekst(k))); p.konsekvens.forEach((k) => kort.k.push(tekst(k))); }
    (${endre.toString()})(s, ${JSON.stringify(arg === undefined ? null : arg)}, kort);
    s._tid = Date.now();
    localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s));
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
}
const kveldsspill = (t) => t.js(`((JSON.parse(localStorage.getItem("rusj.kveld") || "null") || {}).spill || []).filter((s) => s.id === "vaghalsen").length`);
// One whole turn in turn order: choose, (the card), «Fullført!» or «Står over», wait for the table.
async function spillTur(t, type, utfall = "fullfort") {
  await t.klikk(`[data-h="velg"][data-v="${type}"]`);
  await t.vent(KORT);
  await t.klikk(`[data-h="${utfall}"]`, 250);
  await t.vent("document.querySelector('#vh-hjul')", 6000);
}

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
  // The rim lights blink when the bottle stops: never faster than three times a second
  const blink = await t.js(`(() => { const el = document.querySelector(".vh-hjul.stoppet .vh-lys.en"); if (!el) return null; const st = getComputedStyle(el); return { navn: st.animationName, sek: parseFloat(st.animationDuration), ganger: st.animationIterationCount }; })()`);
  t.sjekk(blink && blink.navn === "vh-blink" && blink.sek >= 0.334 && Number(blink.ganger) <= 5, `Lysene blinker for fort når flaska stopper (${JSON.stringify(blink)})`);
  t.sjekk(await t.finnes('.dokk [data-h="kaaring"]'), "«Avslutt» mangler når flaska har pekt ut en spiller");
  t.sjekk(/^Tur 1 av 12$/i.test((await t.tekst("#topp-tittel")).trim()), `Toppfeltet viser ikke «Tur 1 av 12» med tre spillere og fire turer hver («${await t.tekst("#topp-tittel")}»)`);
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
  t.sjekk(await t.finnes('.dokk [data-h="kaaring"]'), "«Avslutt» mangler på kortskjermen");
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
  // Kåringen is final and counted once: shared with «Del kåringen», no way back into the game
  t.sjekk((await kveldsspill(t)) === 1, `Kåringen ble ikke meldt til «Kveldens gjeng» nøyaktig én gang (${await kveldsspill(t)})`);
  const ferdig = await t.js(`window.Rusj._statKo.filter((h) => h.h === "ferdig").map((h) => h.d)`);
  t.sjekk(ferdig.length === 1 && ferdig[0].spillere === 3 && ferdig[0].turer === 3 && ferdig[0].mal === "turer", `Statistikken fikk ikke nøyaktig én «ferdig» (${JSON.stringify(ferdig)})`);
  await t.js(`window.__delt = null; navigator.share = async (d) => { window.__delt = d; };`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt");
  t.sjekk(delt && delt.text.includes(`${NAVN[forste]} vant`) && /Største våghals/.test(delt.text) && /\/vaghalsen\/$/.test(delt.url) && !/https?:/.test(delt.text), `«Del kåringen» delte ikke kåringen (${JSON.stringify(delt)})`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.tilstand()).skjerm === "slutt" && (await t.finnes(".vh-priser")), "Kåringen sto ikke etter omlasting");
  t.sjekk((await kveldsspill(t)) === 1, "Kåringen ble meldt til «Kveldens gjeng» en gang til ved omlasting");
  await t.klikk("#tilbake");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && s._aktiv === false, `Tilbake fra Kåringen skal føre hjem, ikke inn i spillet igjen (skjerm: ${s.skjerm})`);
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Hjem-skjermen viser «Fortsett» etter Kåringen");
  await t.bilde("hjem-etter-kaaring");

  // 10. Five players with names of different lengths: the name tags around the table
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Start spill» etter Kåringen skal ikke spørre");
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
  t.sjekk(await t.finnes('.dokk [data-h="kaaring"]'), "«På rekke og rad» har ingen vei til Kåringen («Avslutt» mangler)");
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

  // From here on with reduced motion, so the bottle and the stamps are quick.
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const TIL_KAARING = "document.querySelector('[data-h=\"til-kaaring\"]')";
  const etikett = async () => (await t.tekst("#vh-info .etikett")).trim();
  const topp = async () => (await t.tekst("#topp-tittel")).trim();

  // 14. «Hvor lenge?»: turns each (the default), in turn order with two players — four turns each.
  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('[data-h="mal"][data-v="turer"][aria-pressed="true"]'), "«Turer hver» skal være valgt fra start under «Hvor lenge?»");
  t.sjekk(/^4 turer hver$/.test((await t.tekst('[data-h="mal"][data-v="turer"]')).trim()), `To spillere skal få fire turer hver («${await t.tekst('[data-h="mal"][data-v="turer"]')}»)`);
  await t.klikk('[data-h="turmodus"][data-v="rekke"]');
  await t.klikk('[data-h="start"]');
  await t.vent(VALG);
  s = await t.tilstand();
  t.sjekk(s.spill.tur === 0 && s.spill.start === 0, `Første spill på rekke og rad skal starte med spiller 1 (startet med ${s.spill.tur + 1})`);
  t.sjekk(s.spill.mal && s.spill.mal.type === "turer" && s.spill.mal.n === 4, `Målet ble ikke fire turer hver (${JSON.stringify(s.spill.mal)})`);
  t.sjekk(/^Tur 1 av 8$/i.test(await topp()), `Toppfeltet viser «${await topp()}», ventet «Tur 1 av 8»`);
  await spillTur(t, "k");
  await t.vent(VALG);
  await spillTur(t, "s");
  await t.vent(VALG);
  const ring = await t.js(`[0, 1].map((i) => parseFloat(getComputedStyle(document.querySelector('[data-plass="' + i + '"]')).getPropertyValue("--fr")))`);
  t.sjekk(Math.abs(ring[0] - 0.25) < 0.01 && Math.abs(ring[1] - 0.25) < 0.01, `Ringene rundt spillerne viser ikke én av fire turer (${ring})`);
  await t.sov(500);
  await t.bilde("framgang-ringer");
  // Straight to the last lap: both have had three turns.
  await settTilstand(t, (st) => {
    st.spill.stat.forEach((x, i) => Object.assign(x, { turer: 3, k: i === 0 ? 3 : 0, s: i === 0 ? 0 : 3 }));
    Object.assign(st.spill, { nr: 6, runde: 4, tur: 0, fase: "valg", angre: null });
  });
  await t.vent(VALG);
  t.sjekk(/^Siste runde$/i.test(await etikett()), `Bordet sier ikke «Siste runde» i siste runde («${await etikett()}»)`);
  t.sjekk(/^Tur 7 av 8$/i.test(await topp()), `Toppfeltet viser «${await topp()}», ventet «Tur 7 av 8»`);
  await spillTur(t, "k");
  await t.vent(VALG);
  await spillTur(t, "s");
  await t.vent(TIL_KAARING, 6000);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "mal" && s.skjerm === "runde" && s._aktiv === true, `Etter siste tur skal bordet vise målgang (fase: ${s.spill.fase})`);
  t.sjekk(/^Målgang$/i.test(await topp()) && /siste tur/i.test(await t.tekst("#skjerm h1")), "Målgangen sier ikke at det var siste tur");
  t.sjekk(!(await t.finnes('[data-h="velg"], [data-h="snurr"]')), "Det går an å spille videre etter målgang");
  await t.sov(500);
  await t.bilde("malgang");
  // «Angre» still works at the finish line: the last card comes back.
  await t.klikk('[data-h="angre"]');
  await t.vent(KORT);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "kort" && s.spill.nr === 7 && s.spill.stat[1].turer === 3 && s.spill.runde === 4, "«Angre» ved målgang tok ikke tilbake den siste turen");
  await t.klikk('[data-h="fullfort"]', 250);
  await t.vent(TIL_KAARING, 6000);
  await t.klikk('[data-h="til-kaaring"]');
  await t.vent("document.querySelector('.vh-priser')");
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig === true && s._aktiv === false && s.skjerm === "slutt", "«Til kåringen» avsluttet ikke spillet");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Testspiller A vinner!", `Åtte mot fire poeng skal kåre spiller A («${await t.tekst("#skjerm h1")}»)`);
  t.sjekk((await kveldsspill(t)) === 1, "Målgangen ble ikke meldt til «Kveldens gjeng» én gang");
  await t.sov(600);
  await t.bilde("kaaring-etter-malgang", true);
  // «Spill igjen»: the next game in turn order starts one seat further round.
  await t.klikk('[data-h="igjen"]');
  await t.vent(VALG);
  s = await t.tilstand();
  t.sjekk(s.spill.start === 1 && s.spill.tur === 1 && s.spill.nr === 0 && !s.spill.ferdig, `Neste spill skal starte med spiller 2 (startet med ${s.spill.tur + 1})`);

  // 15. First to ten in turn order: the lap is played out, so both get as many turns — and can tie.
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.klikk('[data-h="mal"][data-v="poeng"]');
  t.sjekk(/10 poeng/.test(await t.tekst("#vh-mal-hjelp")), "Forklaringen under «Hvor lenge?» følger ikke valget");
  await t.klikk('[data-h="start"]');
  await t.vent(VALG);
  s = await t.tilstand();
  t.sjekk(s.spill.mal && s.spill.mal.type === "poeng" && s.spill.mal.n === 10, `Målet ble ikke ti poeng (${JSON.stringify(s.spill.mal)})`);
  t.sjekk(/^Først til 10$/i.test(await topp()), `Toppfeltet viser «${await topp()}», ventet «Først til 10»`);
  const forst = s.spill.start;
  await settTilstand(t, (st) => {
    st.spill.stat.forEach((x) => Object.assign(x, { turer: 4, k: 4, s: 0 }));
    Object.assign(st.spill, { nr: 8, runde: 5, tur: st.spill.start, fase: "valg", angre: null });
  });
  await t.vent(VALG);
  await spillTur(t, "k"); // the one who started reaches ten …
  await t.vent(VALG);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "valg" && s.spill.tur === 1 - forst, "Den andre fikk ikke turen sin etter at den første nådde ti poeng");
  t.sjekk(/^Siste runde$/i.test(await etikett()), `Bordet sier ikke «Siste runde» når noen har nådd ti poeng («${await etikett()}»)`);
  await spillTur(t, "k"); // … and so does the other
  await t.vent(TIL_KAARING, 6000);
  await t.klikk('[data-h="til-kaaring"]');
  await t.vent("document.querySelector('.vh-priser')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Testspiller A og Testspiller B vinner!", `Ti mot ti skal kåre begge («${await t.tekst("#skjerm h1")}»)`);

  // 16. «Avslutt» before anyone has played: home, no crowning. Then the bottle with a goal:
  // everyone gets exactly as many turns, so only players with turns left are picked.
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent(SNURR);
  await t.klikk('[data-h="kaaring"]');
  await t.klikk('#ark [data-v="ja"]');
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && s.spill === null && (await kveldsspill(t)) === 0, "«Avslutt» før første tur skal føre hjem uten kåring");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent(SNURR);
  await settTilstand(t, (st) => {
    [4, 4, 3].forEach((n, i) => Object.assign(st.spill.stat[i], { turer: n, s: n }));
    Object.assign(st.spill, { nr: 11, tur: 2, fase: "snurr", angre: null });
  });
  await t.vent(SNURR);
  t.sjekk(/^Siste runde$/i.test(await etikett()) && /^Tur 12 av 12$/i.test(await topp()), `Siste tur med flaska: «${await etikett()}» / «${await topp()}»`);
  await t.klikk('[data-h="snurr"]', 40);
  await t.vent(VALG, 9000);
  s = await t.tilstand();
  t.sjekk(s.spill.tur === 2, `Flaska skal peke på den eneste som har en tur igjen (pekte på spiller ${s.spill.tur + 1})`);
  await spillTur(t, "s");
  await t.vent(TIL_KAARING, 6000);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "mal" && s.spill.stat.every((x) => x.turer === 4), "Med flaska skal alle ha fått nøyaktig fire turer ved målgang");
  // First to ten with the bottle: A is there, C has had one turn less and gets it before the finish.
  await settTilstand(t, (st) => {
    st.spill.mal = { type: "poeng", n: 10 };
    st.spill.stat = [
      { s: 0, k: 5, f: 0, m: 0, turer: 5 },
      { s: 3, k: 0, f: 2, m: 0, turer: 5 },
      { s: 2, k: 0, f: 2, m: 0, turer: 4 },
    ];
    Object.assign(st.spill, { nr: 14, tur: 0, fase: "snurr", angre: null });
  });
  await t.vent(SNURR);
  t.sjekk(/^Siste runde$/i.test(await etikett()), `Bordet sier ikke «Siste runde» når noen har ti poeng («${await etikett()}»)`);
  await t.klikk('[data-h="snurr"]', 40);
  await t.vent(VALG, 9000);
  t.sjekk((await t.tilstand()).spill.tur === 2, "Flaska skal peke på den som har hatt én tur mindre");
  await spillTur(t, "s");
  await t.vent(TIL_KAARING, 6000);
  t.sjekk((await t.tilstand()).spill.fase === "mal", "Spillet gikk ikke i mål da alle hadde hatt like mange turer");

  // 17. A card with a duration gets a clock: start, stop, time's up, start again.
  const medKort = (tekst, type = "k") =>
    settTilstand(
      t,
      (st, a, kort) => {
        Object.assign(st.spill, { fase: "kort", type: a.type, kort: kort[a.type].indexOf(a.tekst), tur: 0, andre: 1, byttet: false, angre: null, snurr: null });
        st.skjerm = "kort";
      },
      { tekst, type },
    );
  const klokke = async () => (await t.tekst("#vh-klokke .timer-tid")).trim();
  const klokkeEtikett = () => t.js(`document.querySelector("#vh-klokke").getAttribute("aria-label")`);
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="turmodus"][data-v="rekke"]');
  await t.klikk('[data-h="start"]');
  await t.vent(VALG);
  await medKort("Fortell et kjent eventyr på 20 sekunder.");
  await t.vent(KORT);
  t.sjekk((await klokke()) === "20" && /20 sekunder/.test(await klokkeEtikett()), `Kortet med «20 sekunder» fikk ikke en klokke på 20 s («${await klokke()}»)`);
  t.sjekk(await t.friForDokk("#vh-klokke"), "Klokka på kortet havner bak knappene");
  await t.sov(400);
  await t.bilde("kort-med-klokke");
  await t.klikk('[data-h="klokke"]');
  await t.sov(1300);
  const igjen = Number(await klokke());
  t.sjekk(igjen < 20 && igjen >= 17 && (await t.finnes("#vh-klokke.startet")), `Klokka teller ikke ned (${igjen})`);
  await t.bilde("klokka-gar");
  await t.klikk('[data-h="klokke"]');
  const stoppet = await klokke();
  await t.sov(1200);
  t.sjekk((await klokke()) === stoppet && (await t.finnes("#vh-klokke.pause")), "Et trykk til stoppet ikke klokka");
  await t.klikk('[data-h="klokke"]');
  await t.js(`(() => { const k = window.Rusj.timer("vh-klokke"); k.leggTil(-(k.igjen - 0.5)); })()`);
  await t.vent("document.querySelector('#vh-klokke.ferdig')", 4000);
  t.sjekk(/Tiden er ute/.test(await klokkeEtikett()), "Klokka sier ikke fra når tiden er ute");
  await t.klikk('[data-h="klokke"]');
  t.sjekk(!(await t.finnes("#vh-klokke.ferdig")) && Number(await klokke()) >= 19, "Klokka kan ikke startes på nytt når tiden er ute");
  await t.klikk('[data-h="fullfort"]', 250);
  t.sjekk(!(await t.js(`!!window.Rusj.timer("vh-klokke")`)), "Klokka går videre etter «Fullført!»");
  await t.vent(VALG, 6000);
  for (const [tekst, sek] of [["Si fem ting som er gule – på ti sekunder.", "10"], ["Snakk som en baby i ett minutt.", "60"]]) {
    await medKort(tekst);
    await t.vent(KORT);
    t.sjekk((await t.finnes("#vh-klokke")) && (await klokke()) === sek, `«${tekst}» skulle fått en klokke på ${sek} s`);
  }
  await medKort("Gå som en pingvin rundt i rommet.");
  await t.vent(KORT);
  t.sjekk(!(await t.finnes("#vh-klokke")), "Et kort uten tid fikk klokke");

  // 18. «Gjelder nå»: a dare that lasts stays on the table until the player's next turn.
  await medKort("Snakk som en sjørøver til det er din tur igjen.");
  await t.vent(KORT);
  await t.klikk('[data-h="fullfort"]', 250);
  await t.vent(VALG, 6000);
  t.sjekk((await t.tekst(".vh-brikke")).includes("Testspiller A snakker som en sjørøver"), `Konsekvensen som varer, står ikke på bordet («${await t.tekst(".vh-brikker")}»)`);
  t.sjekk(await t.friForDokk(".vh-brikker"), "«Gjelder nå»-brikkene havner bak knappene");
  await t.sov(600);
  await t.bilde("gjelder-na");
  await t.klikk('[data-h="gjelder"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="gjelder-glemte"]'), "Brikken åpner ikke valget «Glemte seg!»");
  await t.bilde("gjelder-ark");
  await t.klikk('#ark [data-h="gjelder-glemte"]');
  s = await t.tilstand();
  t.sjekk(s.spill.stat[0].m === 1 && s.spill.gjelder.length === 0 && !(await t.finnes(".vh-brikke")), "«Glemte seg!» tok ikke ett poeng og brikken");
  t.sjekk((await t.tekst('[data-plass="0"] .vh-poeng')).trim() === String(s.spill.stat[0].k * 2 + s.spill.stat[0].s - 1), "Poengene på bordet følger ikke med når noen glemmer seg");
  await t.klikk('[data-h="angre"]');
  s = await t.tilstand();
  t.sjekk(s.spill.stat[0].m === 0 && s.spill.gjelder.length === 1 && (await t.finnes(".vh-brikke")), "«Angre» ga ikke poenget og brikken tilbake");
  await spillTur(t, "s");
  await t.vent(VALG);
  t.sjekk(await t.finnes(".vh-brikke"), "Brikken forsvant før spilleren sto for tur igjen");
  await spillTur(t, "s", "staover");
  await t.vent(VALG);
  s = await t.tilstand();
  t.sjekk(s.spill.tur === 0 && s.spill.gjelder.length === 0 && !(await t.finnes(".vh-brikke")), "Brikken ble ikke borte da spilleren sto for tur igjen");
  // A rule for the whole table: nobody can «forget» it, it can only be taken away.
  await medKort("Finn på en ny regel som gjelder til det er din tur igjen.");
  await t.vent(KORT);
  await t.klikk('[data-h="fullfort"]', 250);
  await t.vent(VALG, 6000);
  await t.klikk('[data-h="gjelder"]');
  t.sjekk((await t.finnes('#ark:not([hidden]) [data-h="gjelder-ferdig"]')) && !(await t.finnes('#ark [data-h="gjelder-glemte"]')), "En regel for alle skal ikke kunne gi minuspoeng");
  await t.klikk('#ark [data-h="gjelder-ferdig"]');
  t.sjekk((await t.tilstand()).spill.gjelder.length === 0 && !(await t.finnes(".vh-brikke")), "«Ferdig» tok ikke bort brikken");

  // 19. The Christmas pack: rusj.no/vaghalsen/#jul opens «Gjør klart» with only that pack chosen.
  await t.start({ navn: NAVN });
  await t.lastSide(t.side + "#jul", "document.querySelector('[data-h=\"start\"]')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "oppsett" && s.oppsett.pakker.join() === "jul", `#jul valgte ikke bare julepakken (${s.skjerm}: ${s.oppsett.pakker})`);
  const iDag = new Date();
  const iSesong = iDag.getMonth() >= 10 || (iDag.getMonth() === 0 && iDag.getDate() <= 6);
  const pakker = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((b) => b.dataset.v)`);
  t.sjekk(pakker.indexOf("jul") === (iSesong ? 0 : pakker.length - 1), `Julepakken står på feil plass (${pakker.join(", ")}; sesong: ${iSesong})`);
  const jul = await t.js(`(() => { const p = window.RUSJ_DATA.kort.pakker.find((x) => x.id === "jul"); return p ? [p.sannhet.length, p.konsekvens.length] : null; })()`);
  t.sjekk(jul && jul[0] >= 30 && jul[1] >= 30, `Julepakken skal ha minst 30 sannheter og 30 konsekvenser (${jul})`);
  await t.bilde("oppsett-jul", true);
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="snurr"]', 40);
  await t.vent(VALG, 9000);
  await t.klikk('[data-h="velg"][data-v="k"]');
  await t.vent(KORT);
  t.sjekk(/Jul/.test(await t.tekst("#vh-kort .storkort-nr")), `Kortet kom ikke fra julepakken («${await t.tekst("#vh-kort .storkort-nr")}»)`);
  await t.sov(400);
  await t.bilde("julekort");
  // A running game is left alone by the link.
  await t.lastSide(t.side + "#jul", "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.spill && !s.spill.ferdig && s.skjerm === "kort", `#jul skal ikke rive med seg et spill som pågår (skjerm: ${s.skjerm})`);
  await t.send("Emulation.setEmulatedMedia", { features: [] });
}
