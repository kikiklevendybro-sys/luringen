// Løgnhalsen: "Si det høyt" — theme, new theme, countdown, the teller taps the lie (and undoes),
// reload mid-reveal, who guessed right, points (teller +1 per player fooled), back + continue,
// fooling everyone, ending early on the podium. Then "Skriv inn": hand-over, private fields,
// reload while typing (back to the hand-over, text kept), shuffled cards, reveal; 320 px.
// Regression checks: leaving during the countdown does nothing afterwards, «Avslutt» asks first,
// «Kåringen» is shown once, pagar, and the screen's content stays above the dock at 375 × 560.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const VELG = "document.querySelector('[data-h=\"velg-logn\"]')";
const RIKTIG = "document.querySelector('[data-h=\"riktig\"]')";

export default async function (t) {
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4, "Oppsettet viser ikke de fire lagrede spillerne");
  // The kit's stepper is drawn anew by every press. Focus must stay with it — on the other button
  // when the one that was pressed has reached its limit — and the new number is read out through
  // the kit's one live region (the number on the screen is switched off: it would say nothing).
  await t.js(`document.querySelector('[data-h="runder"][data-v="-1"]').focus()`);
  await t.klikk('[data-h="runder"][data-v="-1"]');
  t.sjekk((await t.tilstand()).oppsett.runder === 1, "Antall runder endret seg ikke");
  t.sjekk(await t.js(`!!document.activeElement && document.activeElement.dataset.h === "runder" && document.activeElement.dataset.v === "1"`), "Fokus ble ikke med til «Flere runder» da «Færre runder» nådde bunnen");
  t.sjekk(await t.js(`document.querySelector(".teller output").getAttribute("aria-live") === "off"`), "Tallet i telleren er fortsatt en egen live-region (leses to ganger, eller aldri)");
  let lest = true;
  try {
    await t.vent(`/1 runde/.test(document.querySelector("#si").textContent)`, 2000);
  } catch (e) {
    lest = false;
  }
  t.sjekk(lest, "Det nye tallet i telleren ble ikke lest opp (#si)");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="vis-temaer"]');
  await t.klikk('#ark [data-h="temavalg"][data-v="mat"]');
  t.sjekk(!(await t.tilstand()).oppsett.temaer.includes("mat"), "Temaet ble ikke valgt bort");
  t.sjekk(/12 av 13/.test(await t.tekst("#skjerm")), "Oppsettet viser ikke antall valgte temaer");
  await t.bilde("temaer");
  await t.klikk('#ark [data-h="temavalg"][data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.temaer.length === 13, "«Alle» valgte ikke alle temaene");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.lh-temakort')");
  await t.bilde("tur");
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet regnes ikke som pågående (pagar)");
  let s = await t.tilstand();
  const teller1 = (s.spill.start + s.spill.k) % 4;
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[teller1], "Fortelleren vises ikke som overskrift");
  const tema1 = s.spill.tema;
  await t.klikk('[data-h="nytt-tema"]');
  t.sjekk((await t.tilstand()).spill.tema !== tema1, "«Nytt tema» ga ikke et nytt tema");

  // 3 · 2 · 1 – the teller taps the lie, regrets, taps again
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.bilde("hvilken-var-logn");
  await t.klikk('[data-h="velg-logn"][data-v="1"]');
  await t.vent("document.querySelector('.lh-tall.logn .lh-stempel')");
  await t.klikk('[data-h="angre-logn"]');
  await t.klikk('[data-h="velg-logn"][data-v="2"]');
  await t.vent(RIKTIG);
  t.sjekk((await t.tilstand()).spill.logn === 2, "Løgnen ble ikke registrert");

  // Reload in the middle of the reveal
  await t.lastSide(t.side, RIKTIG);
  const lyttere = [0, 1, 2, 3].filter((i) => i !== teller1);
  t.sjekk((await t.antall('[data-h="riktig"]')) === 3, "Fortelleren skal ikke kunne velges som gjetter");
  await t.klikk(`[data-h="riktig"][data-v="${lyttere[0]}"]`);
  t.sjekk(/1 hadde rett/.test(await t.tekst("#lh-ferdig-tur")), "Ferdig-knappen viser ikke hvor mange som hadde rett");
  await t.sov(400);
  await t.bilde("hvem-pekte");
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  await t.sov(1300);
  await t.bilde("resultat");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[teller1] === 2 && s.spill.poeng[lyttere[0]] === 1 && s.spill.poeng[lyttere[1]] === 0, "Feil poeng: fortelleren skal ha 2 og gjetteren 1");

  // «Angre» takes the points back and returns to «who guessed right?» with the same choice
  await t.klikk('[data-h="angre"]');
  await t.vent(RIKTIG);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.every((p) => p === 0) && s.spill.riktige.includes(lyttere[0]), "«Angre» tok ikke tilbake poengene");
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[teller1] === 2 && s.spill.poeng[lyttere[0]] === 1, "Poengene ble feil etter angring");

  // Back to home keeps the game; «Nytt spill» asks first (cancel keeps it); continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spurte ikke før spillet ble kastet");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om man trykket Avbryt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.lh-resultat')");

  // Next teller fools everyone
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.lh-temakort')");
  s = await t.tilstand();
  const teller2 = (s.spill.start + s.spill.k) % 4;
  t.sjekk(teller2 === (teller1 + 1) % 4, "Turen gikk ikke videre til neste spiller");
  // Leaving during the countdown: nothing may happen afterwards (no jump to the reveal)
  await t.klikk('[data-h="pek"]', 50);
  await t.klikk("#tilbake");
  await t.sov(3600);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && s.spill.fase === "tema", "Nedtellingen fortsatte etter at man gikk ut av skjermen");
  t.sjekk(await t.js("document.querySelector('#nedtelling').hidden"), "Nedtellingen ble liggende over hjem-skjermen");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.lh-temakort')");
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.klikk('[data-h="velg-logn"][data-v="0"]');
  await t.vent(RIKTIG);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  await t.sov(1400);
  await t.bilde("lurte-alle");
  t.sjekk(/alle/i.test(await t.tekst("#skjerm h1")), "Skulle stått «Lurte alle sammen!»");

  // End early: the link is just «Avslutt» and asks first; then the ranking
  t.sjekk((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte skal hete «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.pall')");
  t.sjekk((await t.tilstand())._aktiv === false, "Kåringen skal ikke regnes som et pågående spill (pagar)");
  t.sjekk(!(await t.finnes("#skjerm .banner .etikett")), "«Kåringen» står både i toppfeltet og i banneret");
  await t.sov(900);
  await t.bilde("pallen", true);
  const h1 = (await t.tekst("#skjerm h1")).trim();
  t.sjekk(h1 === `${NAVN[teller2]} vinner!`, `Overskriften skulle vært «${NAVN[teller2]} vinner!», men er «${h1}»`);
  t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler lenken «Alle spill»");

  // "Skriv inn" with three players
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="modus"][data-v="skriv"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="3"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Fikk ikke fjernet en spiller");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  await t.bilde("gi-mobilen");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#lh-felt-0')");
  t.sjekk(await t.js("document.querySelector('#lh-ferdig').disabled"), "«Ferdig» skal være av før alle tre er skrevet");
  await t.skrivInn("#lh-felt-0", "Jeg har sovet i en hengekøye i tre netter");
  await t.skrivInn("#lh-felt-1", "Jeg har sovet på en flyplass");
  await t.bilde("skriv");

  // Reload while typing: back to the hand-over screen, the text is kept
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(!(await t.finnes("#lh-felt-0")) && (await t.finnes('[data-h="jeg-er"]')), "Etter omlasting skal mobilen gis til fortelleren igjen, ikke vise det som er skrevet");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#lh-felt-1')");
  t.sjekk((await t.js("document.querySelector('#lh-felt-1').value")) === "Jeg har sovet på en flyplass", "Teksten forsvant etter omlasting");
  await t.skrivInn("#lh-felt-2", "Jeg har sovet i en iglo på Svalbard");
  await t.klikk('[data-h="ferdig-skrevet"]');
  await t.vent("document.querySelector('.lh-pastand')");
  t.sjekk((await t.antall(".lh-pastand")) === 3, "Viser ikke tre påstander");
  s = await t.tilstand();
  t.sjekk(s.spill.kort[s.spill.logn] === "Jeg har sovet i en iglo på Svalbard", "Appen husket feil løgn");
  t.sjekk(s.spill.utkast.every((x) => !x), "Utkastet (med svaret) ble liggende igjen i lagringen");
  await t.sov(500);
  await t.bilde("pek-skriv");
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('[data-h=\"vis-logn\"]')", 8000);
  await t.klikk('[data-h="vis-logn"]');
  await t.vent("document.querySelector('.lh-pastand.logn')", 6000);
  t.sjekk((await t.tekst(".lh-pastand.logn")).includes("iglo"), "Feil påstand ble stemplet som løgn");
  await t.sov(800);
  await t.bilde("avslort-skriv");
  const teller3 = ((await t.tilstand()).spill.start) % 3;
  const gjetter = [0, 1, 2].find((i) => i !== teller3);
  await t.klikk(`[data-h="riktig"][data-v="${gjetter}"]`);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[teller3] === 1 && s.spill.poeng[gjetter] === 1, "Feil poeng i «Skriv inn»");

  // Small phone (320 × 568)
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(1200);
  const bredt = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(bredt <= 0, `Siden er ${bredt}px for bred på 320 px skjerm`);
  await t.bilde("smal-320-resultat");
  await t.klikk('[data-h="neste"]');
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#lh-felt-0')");
  await t.bilde("smal-320-skriv");
  // The "Si det høyt" turn on the small phone
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.klikk('[data-h="modus"][data-v="hoyt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.lh-temakort')");
  await t.bilde("smal-320-tur");
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.bilde("smal-320-velg");
  // 375 × 560 (or narrower when the runner itself is narrower): what each screen is about stays
  // above the dock
  await t.send("Emulation.setDeviceMetricsOverride", { width: Math.min(375, b0), height: 560, deviceScaleFactor: 2, mobile: true });
  await t.sov(500);
  const over = (sel) => t.js(`(() => { const a = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); const d = document.querySelector(".dokk > *").getBoundingClientRect(); return a.bottom <= d.top + 2; })()`);
  t.sjekk(await over("#skjerm h1"), "«Hvilken var løgnen?» skjules bak knappene på 375 × 560");
  await t.bilde("velg-hoyde-560");
  await t.klikk('[data-h="velg-logn"][data-v="2"]');
  await t.vent(RIKTIG);
  t.sjekk(await over("#skjerm h1"), "«Hvem pekte på …?» skjules bak knappene på 375 × 560");
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  t.sjekk(await over("#skjerm h1"), "Resultatet skjules bak knappene på 375 × 560");
  await t.bilde("resultat-hoyde-560");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.lh-temakort')");
  t.sjekk(await over(".lh-temakort .storkort-tekst"), "Temaet skjules bak knappene på 375 × 560");
  await t.bilde("tur-hoyde-560");
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });

  // 20 players: who-guessed-right list and scoreboard must still fit
  await t.start({ navn: Array.from({ length: 20 }, (_, i) => `Testspiller ${i + 1}`) });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 20, "Oppsettet viser ikke 20 spillere");
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.klikk('[data-h="velg-logn"][data-v="1"]');
  await t.vent(RIKTIG);
  t.sjekk((await t.antall('[data-h="riktig"]')) === 19, "Ikke alle 19 lytterne kan velges");
  await t.bilde("tjue-spillere", true);
  const bred20 = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(bred20 <= 0, `Siden er ${bred20}px for bred med 20 spillere`);
}
