// Femmeren: setup (packs, rounds, time), a turn where the time runs out by itself, «Ferdig!» before
// the time, Ja/Nei, swapping a card, the challenge (picker, reload mid-countdown, bonus both ways,
// undo), reload mid-countdown on an ordinary turn, back + continue, «Spill videre», the streak and
// Kåringen (podium, «Kveldens gjeng», share, record on home). Then «Først til» with «Gi mobilen
// videre», ended early without points.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en femmeren): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names, the card's prefix and the links.

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const kveld = () => t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  const hendelser = () => t.js(`window.Rusj._statKo.map((s) => s.h)`);
  const fase = async () => (await t.tilstand()).spill.fase;

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  await enH1("gjør klart");
  await t.bilde("oppsett", true);
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet skal hete «Gjør klart»");
  t.sjekk((await t.antall(".spiller")) === 3, `Spillerlista skal følge gjengens tre navn, viser ${await t.antall(".spiller")}`);
  const fliser = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((f) => f.dataset.v)`);
  t.sjekk(["familie", "fest", "norge", "jul", "vanskelig"].every((p) => fliser.includes(p)), `Pakkene mangler: ${fliser.join(", ")}`);
  let s = await t.tilstand();
  t.sjekk(s.oppsett.pakker.join() === "familie,norge" && !s.oppsett.pakker.includes("fest"), `Familie og Norge skal være valgt fra start: ${s.oppsett.pakker}`);
  t.sjekk(s.oppsett.tid === 5 && s.oppsett.utfordre === true && s.oppsett.runder === 3, "Standardoppsettet skal være 5 s, 3 runder og «Utfordre» på");

  // Two rounds, the Vanskelig pack on, 10 s and back to 5 s
  await t.klikk('[data-h="runder"][data-v="-1"]');
  await t.klikk('[data-h="pakke"][data-v="vanskelig"]');
  await t.klikk('[data-h="tid"][data-v="10"]');
  t.sjekk((await t.tilstand()).oppsett.tid === 10, "Valget «10 s» ble ikke lagret");
  await t.klikk('[data-h="tid"][data-v="5"]');
  s = await t.tilstand();
  t.sjekk(s.oppsett.runder === 2 && s.oppsett.pakker.includes("vanskelig"), "Runder eller pakke ble ikke lagret");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  await enH1("første tur");
  t.sjekk((await hendelser()).includes("start"), "Spillet meldte ikke «start» til statistikken");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Første tur skal være Testspiller A sin");
  t.sjekk({ nb: /Nevn tre/, en: /Name three/, da: /Nævn tre/ }[t.sprak].test(await t.tekst(".storkort-tekst")), "Kortet sier ikke «Nevn tre …»");
  t.sjekk(!t.norsk || /Runde 1 av 2/i.test(await t.tekst("#topp-tittel")), `Topplinja skal si «Runde 1 av 2»: ${await t.tekst("#topp-tittel")}`);
  t.sjekk(await t.friForDokk(".storkort"), "Kortet havner bak knappene");
  await t.bilde("tur");

  // «Bytt kort»: another card, same turn
  const forste = (await t.tilstand()).spill.kort;
  await pause();
  await t.klikk('[data-h="bytt"]');
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  s = await t.tilstand();
  t.sjekk(s.spill.kort !== forste && s.spill.tur === 0, "«Bytt kort» skal bytte kortet uten å bruke opp turen");

  // Turn 1: Start → «Klar, ferdig, GÅ!» → the fuse burns → the time runs out by itself
  await pause();
  await t.klikk('[data-h="tid-start"]', 50);
  await t.vent("document.querySelector('.femmer-lunte')", 6000);
  t.sjekk((await fase()) === "tikker", "Nedtellingen startet ikke");
  t.sjekk(await t.finnes("#femmer-klokke .timer-ring"), "Ringen mangler under nedtellingen");
  t.sjekk(await t.friForDokk(".femmer-klokke"), "Klokka havner bak knappene");
  await t.bilde("tikker");
  await t.vent(`document.querySelector('[data-h="dom"]')`, 9000);
  await enH1("klarte det");
  t.sjekk(!t.norsk || /Klarte det\?/.test(await t.tekst("#skjerm h1")), "Etter tiden skal skjermen spørre «Klarte det?»");
  t.sjekk(await t.friForDokk(".storkort"), "Kortet på «Klarte det?» havner bak knappene");
  await t.bilde("dom");
  await pause();
  await t.klikk('[data-h="dom"][data-v="ja"]');
  await t.vent("document.querySelector('.femmer-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[0] === 1 && s.spill.rekke[0] === 1, "Ja ga ikke poeng til Testspiller A");
  t.sjekk(/\+1 .*Testspiller A/.test(await t.tekst("#skjerm h1")), "Resultatet sier ikke «+1 til Testspiller A»");
  t.sjekk(await t.finnes('[data-h="utfordre"]'), "«Utfordre» mangler etter et ja");
  await enH1("resultat");
  await t.bilde("resultat");

  // The challenge: pick the challenger, reload mid-countdown (the challenge starts again)
  await pause();
  await t.klikk('[data-h="utfordre"]');
  await t.vent(`document.querySelector('[data-h="utfordrer"]')`);
  t.sjekk(!(await t.finnes('[data-h="utfordrer"][data-v="0"]')), "Den som hadde tur, skal ikke kunne utfordre seg selv");
  await t.bilde("hvem-utfordrer");
  await pause();
  await t.klikk('[data-h="utfordrer"][data-v="1"]');
  await t.vent("document.querySelector('.storkort.lampe')");
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")) && (!t.norsk || /Utfordring/i.test(await t.tekst(".femmer-hvem .etikett"))), "Utfordringen viser ikke Testspiller B");
  await t.bilde("utfordring");
  const kortU = (await t.tilstand()).spill.kort;
  await pause();
  await t.klikk('[data-h="tid-start"]', 50);
  await t.vent("document.querySelector('.femmer-lunte')", 6000);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "uklar" && s.spill.kort === kortU && s.spill.utfordrer === 1, `Omlasting midt i utfordringen skal starte den på nytt (fase ${s.spill.fase})`);
  t.sjekk(await t.finnes('[data-h="tid-start"]'), "Etter omlasting mangler «Start»");

  // «Ferdig!» before the time → Ja → the bonus to the challenger; undo; Nei → the bonus to the player
  await pause();
  await t.klikk('[data-h="tid-start"]', 50);
  await t.vent(`document.querySelector('[data-h="tid-ferdig"]')`, 6000);
  await pause();
  await t.klikk('[data-h="tid-ferdig"]');
  await t.vent(`document.querySelector('[data-h="dom"]')`);
  t.sjekk((await fase()) === "udom", "«Ferdig!» i utfordringen gikk ikke til dommen");
  await pause();
  await t.klikk('[data-h="dom"][data-v="ja"]');
  await t.vent("document.querySelector('.femmer-bonus')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 1 && s.spill.poeng[0] === 1, "Bonusen gikk ikke til den som utfordret");
  t.sjekk(/\+1 bonus .*Testspiller B/.test(await t.tekst(".femmer-bonus")), "Resultatet sier ikke hvem som fikk bonusen");
  t.sjekk(!(await t.finnes('[data-h="utfordre"]')), "Én utfordring per tur");
  await t.bilde("bonus");
  await pause();
  await t.klikk("#angre");
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "udom" && s.spill.poeng[1] === 0, "«Angre» tok ikke tilbake bonusen");
  t.sjekk(!t.norsk || /Angret/.test(await t.tekst("#toast")), "«Angre» sier ikke fra");
  await pause();
  await t.klikk('[data-h="dom"][data-v="nei"]');
  await t.vent("document.querySelector('.femmer-bonus')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[0] === 2 && s.spill.poeng[1] === 0, "Når utfordringen slår tilbake, skal bonusen gå til den som hadde tur");
  t.sjekk(!t.norsk || /slo tilbake/.test(await t.tekst(".femmer-bonus")), "Resultatet sier ikke at utfordringen slo tilbake");

  // One turn: Start, «Ferdig!», Ja or Nei
  async function tur(ja) {
    await pause();
    await t.klikk('[data-h="tid-start"]', 50);
    await t.vent(`document.querySelector('[data-h="tid-ferdig"]')`, 6000);
    await pause();
    await t.klikk('[data-h="tid-ferdig"]');
    await t.vent(`document.querySelector('[data-h="dom"]')`);
    await pause();
    await t.klikk(`[data-h="dom"][data-v="${ja ? "ja" : "nei"}"]`);
    await t.vent("document.querySelector('.femmer-resultat')");
  }
  async function videre() {
    await pause();
    await t.klikk('[data-h="videre"]');
    await t.vent(`document.querySelector('[data-h="tid-start"], .pall, .banner')`);
  }

  // Turn 2 (B): undo is still offered before Start; reload mid-countdown restarts the card
  await videre();
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Tur 2 skal være Testspiller B sin");
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="angre"]'), "«Angre» skal fortsatt finnes før neste Start");
  const kort2 = (await t.tilstand()).spill.kort;
  await pause();
  await t.klikk('[data-h="tid-start"]', 50);
  await t.vent("document.querySelector('.femmer-lunte')", 6000);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "klar" && s.spill.kort === kort2 && s.spill.tur === 1, `Omlasting midt i nedtellingen skal starte kortet på nytt (fase ${s.spill.fase})`);
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "«Angre» skal forsvinne når neste tur er startet");
  await tur(false);
  t.sjekk(!t.norsk || /Ikke denne gangen/i.test(await t.tekst(".femmer-resultat .etikett")), "Nei skal vise «Ikke denne gangen»");
  t.sjekk(!(await t.finnes('[data-h="utfordre"]')), "«Utfordre» skal ikke tilbys etter et nei");
  await t.bilde("nei");

  // Turn 3 (C): Ja
  await videre();
  await tur(true);

  // Back + continue in round 2
  await videre();
  t.sjekk(!t.norsk || /Runde 2 av 2/i.test(await t.tekst("#topp-tittel")), "Runde 2 vises ikke i topplinja");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  t.sjekk(!t.norsk || /runde 2 av 2/.test(await t.tekst('[data-h="fortsett"]')), "«Fortsett» sier ikke hvor langt spillet er kommet");
  await pause();
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`document.querySelector('[data-h="tid-start"]')`);

  // «Avslutt» asks, staying is «Spill videre»
  await pause();
  await t.klikk('[data-h="slutt"]');
  t.sjekk(!t.norsk || (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Arket skal ha knappen «Spill videre»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).spill.ferdig === false, "«Spill videre» avsluttet spillet likevel");

  // Round 2: A makes it two in a row
  await tur(true);
  s = await t.tilstand();
  t.sjekk(s.spill.rekke[0] === 2 && s.spill.poeng[0] === 3, `Testspiller A skal ha 2 på rad og 3 poeng (${s.spill.rekke[0]}, ${s.spill.poeng[0]})`);
  t.sjekk(/2/.test(await t.tekst(".femmer-linje")), "Rekka vises ikke");
  await t.bilde("rekke");
  await videre();
  await tur(true);
  await videre();
  await tur(false);
  t.sjekk(!t.norsk || /Til kåringen/.test(await t.tekst('[data-h="videre"]')), "Etter siste tur skal knappen hete «Til kåringen»");
  await videre();
  await t.vent("document.querySelector('.pall')");
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  await enH1("kåringen");
  t.sjekk((t.norsk ? /Testspiller A vinner!/ : /Testspiller A/).test(await t.tekst("#skjerm h1")), `Testspiller A skal vinne: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(/2/.test(await t.tekst(".femmer-rekke-tall")), "Lengste rekke vises ikke");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk((await hendelser()).includes("ferdig"), "Spillet meldte ikke «ferdig» til statistikken");
  await t.bilde("slutt", true);
  const k = await kveld();
  t.sjekk(k && k.spill.length === 1 && k.spill[0].id === "femmeren", "Kåringen ble ikke meldt til «Kveldens gjeng»");

  // «Del resultatet»
  await t.js(`navigator.share = async (d) => { window.__delt = d; }; navigator.canShare = () => false;`);
  await t.klikk('[data-h="del"]');
  await t.sov(300);
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && (t.norsk ? /Testspiller A vinner!/ : /Testspiller A/).test(delt.text) && delt.url.endsWith(new URL(t.side).pathname), `«Del resultatet» delte ikke resultatet: ${JSON.stringify(delt)}`);

  // Home: the record (two in a row), nothing to continue
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Etter kåringen skal hjem-skjermen ikke tilby «Fortsett»");
  t.sjekk(!t.norsk || /2\s*på rad \(rekord\)/.test(await t.tekst(".merker")), `Rekorden vises ikke på hjem-skjermen: ${await t.tekst(".merker")}`);
  await t.bilde("hjem-rekord");

  // «Først til» with «Gi mobilen videre»; ended early without points
  await t.klikk('[data-h="nytt"]');
  await t.vent(`document.querySelector('[data-h="start"]')`);
  await t.klikk('[data-h="maal"][data-v="poeng"]');
  t.sjekk(await t.finnes('[data-h="poengmaal"]'), "«Først til» viser ikke poengtelleren");
  await t.klikk('[data-h="gividere"]');
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="klar"]')`);
  await enH1("gi mobilen");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")) && (!t.norsk || /Først til 10/i.test(await t.tekst("#topp-tittel"))), "«Gi mobilen til» eller «Først til 10» mangler");
  await t.bilde("gi-videre");
  await pause();
  await t.klikk('[data-h="klar"]');
  await t.vent(`document.querySelector('[data-h="tid-start"]')`);
  await pause();
  await t.klikk('[data-h="slutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  t.sjekk((!t.norsk || /Ingen poeng/.test(await t.tekst("#skjerm h1"))) && !(await t.finnes(".pall")), "Uten poeng skal kåringen si «Ingen poeng» uten pall");
  await t.bilde("slutt-uten-poeng");
}
