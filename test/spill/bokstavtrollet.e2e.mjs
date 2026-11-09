// Bokstavtrollet: Bomba with three players (new card, pass the phone, the troll wakes, the phone
// suggests who held it, undo, reload, back + continue) until one player is left; then a round of
// Bokstavjakt (reload while writing, time runs out, score five categories) and the winner.
export default async function (t) {
  const vent = (sel, ms) => t.vent(`document.querySelector(${JSON.stringify(sel)})`, ms);

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="velg-modus"][data-v="bomba"]');
  await t.klikk('[data-h="niva"][data-v="familie"]');
  await t.bilde("oppsett-bomba", true);
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  await t.klikk('[data-h="start"]');
  await vent(".bt-kort");
  await t.sov(1500);
  await t.bilde("klar");

  // A new card gives a new category
  const forste = (await t.tilstand()).spill.kort;
  await t.klikk('[data-h="nytt-kort"]', 1500);
  const andre = (await t.tilstand()).spill.kort;
  t.sjekk(andre.k !== forste.k, "«Nytt kort» ga samme kategori");

  // Back (Android back button) during the countdown: stay home, no hidden clock starts later
  await t.klikk('[data-h="bomba-start"]', 400);
  await t.js("history.back()");
  await vent('[data-h="fortsett"]', 4000);
  await t.sov(3200);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem" && !(await t.js("Rusj.S.spill.slutt")), "Spillet hoppet til runden etter at man gikk tilbake under nedtellingen");
  await t.klikk('[data-h="fortsett"]');
  await vent('[data-h="bomba-start"]');

  // The round: countdown, the troll sleeps, the phone goes round
  await t.klikk('[data-h="bomba-start"]', 50);
  await vent(".skjerm-bomba", 8000);
  await t.sov(500);
  await t.bilde("trollet-sover");
  const start = await t.js("Rusj.S.spill.start");
  await t.klikk('[data-h="send"]', 420);
  await t.klikk('[data-h="send"]', 420);
  const holder = await t.js("Rusj.S.spill.holder");
  t.sjekk(holder === (start + 2) % 3, "«Send videre» flyttet ikke mobilen to plasser");

  // The troll wakes (the hidden timer is cut short)
  await t.js("Rusj.S.spill.slutt = Date.now()");
  await t.sov(350);
  await t.bilde("trollet-vakner");
  await vent(".skjerm-vakna", 6000);
  await t.bilde("hvem-holdt-mobilen");
  t.sjekk(await t.finnes(`.bt-spiller.trolig[data-v="${holder}"]`), "Mobilen foreslår ikke den som holdt den");
  await t.klikk(`[data-h="taper"][data-v="${holder}"]`);
  await t.bilde("mistet-hjerte");
  t.sjekk((await t.tilstand()).spill.liv[holder] === 2, "Hjertet ble ikke tatt");

  // Undo, then pick again
  await t.klikk('[data-h="angre"]');
  t.sjekk((await t.tilstand()).spill.liv[holder] === 3, "Angre ga ikke hjertet tilbake");
  await t.klikk(`[data-h="taper"][data-v="${holder}"]`);

  // Reload, back to home and continue
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="neste-runde"]'), "Kom ikke tilbake til runden etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.klikk('[data-h="fortsett"]');
  await t.klikk('[data-h="neste-runde"]');

  // Play on: the troll always takes the last player in the ring, so Testspiller A wins
  let ute = false;
  for (let runde = 0; runde < 10; runde++) {
    await vent('[data-h="bomba-start"]');
    await t.sov(300);
    await t.klikk('[data-h="bomba-start"]', 50);
    await vent(".skjerm-bomba", 8000);
    await t.sov(250);
    await t.js("Rusj.S.spill.slutt = Date.now()");
    await vent(".skjerm-vakna", 6000);
    const liv = (await t.tilstand()).spill.liv;
    const taper = [2, 1].find((i) => liv[i] > 0);
    await t.klikk(`[data-h="taper"][data-v="${taper}"]`);
    if (!ute && liv[taper] === 1) {
      ute = true;
      await t.bilde("ute");
    }
    if (await t.finnes('[data-h="bomba-vinner"]')) {
      await t.klikk('[data-h="bomba-vinner"]');
      break;
    }
    await t.klikk('[data-h="neste-runde"]');
  }
  await vent(".skjerm-vinner");
  await t.bilde("vinner-bomba", true);
  t.sjekk(/Testspiller A vinner/.test(await t.tekst("#skjerm h1")), "Vinneren av Bomba vises ikke");

  // Bokstavjakt: the game is chosen on the home screen (once)
  t.sjekk(await t.finnes('.flere-spill, a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="velg-modus"][data-v="jakt"]');
  t.sjekk(!(await t.finnes('[data-h="modus"]')), "Leken velges to ganger (også i oppsettet)");
  await t.klikk('[data-h="tid"][data-v="60"]');
  await t.bilde("oppsett-jakt", true);
  await t.klikk('[data-h="start"]');
  await vent('[data-h="jakt-trekk"]');
  await t.bilde("jakt-klar");
  await t.klikk('[data-h="jakt-trekk"]');
  await t.vent("document.querySelector('.bt-kategorier:not(.skjult)') && !document.querySelector('[data-h=\"jakt-ferdig\"]').disabled", 8000);
  await t.sov(1200);
  await t.bilde("jakt-skriv");
  const bokstav = (await t.tilstand()).spill.r.b;

  // Reload while writing: same letter, the clock goes on
  await t.lastSide(t.side, "document.querySelector('.bt-kategorier')");
  const r = (await t.tilstand()).spill.r;
  t.sjekk(r.b === bokstav && r.fase === "skriv" && r.igjen > 0 && r.igjen <= 60, "Runden ble ikke gjenopptatt etter omlasting");

  // Time runs out – and the page is reloaded during «Blyantene ned!»: it must land on the scoring
  await t.vent("window.Rusj.timer('jakt-tid')");
  await t.js("Rusj.timer('jakt-tid').leggTil(-500)");
  await t.vent("Rusj.S.spill.r.fase === 'poeng'", 4000);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "jakt", "«Blyantene ned!» ble ikke vist");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await vent(".skjerm-jakt-poeng", 4000);
  await t.bilde("jakt-poeng");
  for (let n = 0; n < 5; n++) {
    await t.klikk('[data-h="poeng"][data-v="0:2"]', 80);
    await t.klikk('[data-h="poeng"][data-v="1:1"]', 80);
    await t.klikk('[data-h="poeng"][data-v="2:0"]', 80);
    if (n === 0) await t.bilde("jakt-poeng-satt");
    await t.klikk('[data-h="kat-neste"]');
  }
  await vent(".skjerm-jakt-stilling");
  await t.bilde("jakt-stilling");
  t.sjekk((await t.tilstand()).spill.poeng.join() === "10,5,0", "Poengene ble ikke summert riktig");

  // Points can be undone until the next round starts
  await t.klikk('[data-h="endre-poeng"]');
  await vent(".skjerm-jakt-poeng");
  t.sjekk((await t.tilstand()).spill.poeng.join() === "0,0,0", "«Endre poengene» trakk ikke runden fra igjen");
  await t.klikk('[data-h="kat-neste"]');
  await vent(".skjerm-jakt-stilling");
  t.sjekk((await t.tilstand()).spill.poeng.join() === "10,5,0", "Poengene ble ikke lagt til igjen");
  // Ending early is just «Avslutt»: the sheet explains, and with points it goes to «Kåringen»
  t.sjekk((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte heter ikke bare «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"ja\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await vent(".skjerm-vinner");
  await t.bilde("vinner-jakt", true);
  t.sjekk(/Testspiller A vinner/.test(await t.tekst("#skjerm h1")), "Vinneren av Bokstavjakt vises ikke");
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === "kåringen", "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk((await t.tilstand())._aktiv === false, "Spillet regnes fortsatt som pågående på «Kåringen»");
}
