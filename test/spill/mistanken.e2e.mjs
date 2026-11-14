// Mistanken: the 18+ gate, packs (Flørt off), «Gi mobilen til» → «Jeg er …», the secret question
// behind the hold card (the names wake up only after reading; a {a} question names someone else),
// «Bytt spørsmål», pointing at a name (never yourself), who was pointed at, the three choices (a
// sip and the coin, a kind word and the coin, let it be), the revealed question, the phone moving
// round, reload never shows the secret, back + continue, «Nytt spill» asks first, the water break,
// small screens and a phone on its side, Kåringen (the most suspected, the revealed questions,
// sharing, the «sist» line), «Spill igjen» and quitting.
// Language-neutral (rusj/SPRAK.md): words are checked per edition through ORD.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const ORD = {
  nb: { navn: "Mistanken", alkfri: /alkoholfritt/i, over: /stå over/i, vann: /vann/i, start: /^Hvem her/, fot: /alle kan stå over/ },
  en: { navn: "Nosy", alkfri: /alcohol-free/i, over: /sit .*out/i, vann: /water/i, start: /^Who here/, fot: /anyone can sit out/ },
  da: { navn: "Mistanken", alkfri: /alkoholfrit/i, over: /stå over/i, vann: /vand/i, start: /^Hvem her/, fot: /alle kan stå over/ },
};

async function aldersport(t, sjekkNei) {
  if (!(await t.finnes('[data-h="alder-ja"]'))) {
    await t.js(`(() => { const f = JSON.parse(localStorage.getItem("rusj.felles") || "{}"); delete f.over18; localStorage.setItem("rusj.felles", JSON.stringify(f)); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  }
  t.sjekk(await t.finnes('[data-h="alder-ja"]'), "18-årsgrensen vises ikke før spillet");
  if (sjekkNei) {
    await t.bilde("aldersgrense");
    await t.klikk('[data-h="alder-nei"]', 50);
    await t.vent(`location.pathname === ${JSON.stringify(t.forside)} && document.readyState === 'complete'`, 8000);
    t.sjekk((await t.js("location.pathname")) === t.forside, "«Nei, ta meg tilbake» ble på spillsiden");
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    t.sjekk(await t.finnes('[data-h="alder-ja"]'), "Etter «Nei» skal aldersgrensen vises igjen");
  }
  await t.klikk('[data-h="alder-ja"]');
  await t.vent("document.querySelector('.spillhjem h1')");
}

export default async function (t) {
  const O = ORD[t.sprak];
  const s = () => t.tilstand();
  const pause = () => t.sov(420);
  const NOKKEL = t.nokkel("mistanken.v1");
  const GI = "document.querySelector('.gi-til') && document.querySelector('[data-h=\"jeg-er\"]')";
  const endre = async (kode, vent) => {
    await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); ${kode}; localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
    await t.lastSide(t.side, vent);
    await t.sov(450);
  };
  // One round: «Jeg er …», hold the card, point at the next player, then a choice.
  const runde = async (valg, bilder = false) => {
    await t.vent(GI);
    await pause();
    await t.klikk('[data-h="jeg-er"]');
    await t.vent("document.querySelector('.mappe')");
    const slipp = await t.hold(".mappe", 650);
    if (bilder) await t.bilde("sporsmal");
    await slipp();
    const st = await s();
    const hvem = (st.spill.svarer + 1) % st.spill.antall;
    await pause();
    await t.klikk(`.velger[data-h="pek"][data-v="${hvem}"]`);
    await t.vent("document.querySelector('.mis-pekt')");
    if (bilder) await t.bilde("pekt");
    await pause();
    await t.klikk(`[data-h="valg"][data-v="${valg}"]`);
    await t.vent("document.querySelector('.mis-resultat')", 6000);
    await t.sov(300);
    return hvem;
  };

  // ---------- 18+ gate, home, rules ----------
  await aldersport(t, true);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === O.navn, `Hjem-skjermen viser ikke «${O.navn}» etter aldersgrensen`);
  await t.klikk("#reglerknapp");
  t.sjekk(O.alkfri.test(await t.tekst("#ark")) && O.over.test(await t.tekst("#ark")), "Reglene sier ikke at alkoholfritt teller og at alle kan stå over");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Setup ----------
  await t.start({ navn: NAVN });
  await aldersport(t, false);
  await t.klikk('[data-h="nytt"]');
  let st = await s();
  t.sjekk(st.oppsett.pakker.join() === "snill,fest", `Standardpakkene er feil: ${st.oppsett.pakker.join()}`);
  t.sjekk((await t.antall(".spiller")) === 4 && (await t.finnes(".mis-vett")), "Oppsettet mangler spillerne eller «Slik er slurkene»");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="pakke"][data-v="snill"]');
  await t.klikk('[data-h="pakke"][data-v="fest"]');
  t.sjekk(await t.js("document.querySelector('[data-h=\"start\"]').disabled"), "Start skal være av når ingen pakker er valgt");
  await t.klikk('[data-h="pakke"][data-v="snill"]');
  await t.klikk('[data-h="start"]');
  await t.vent(GI);
  st = await s();
  t.sjekk(st._aktiv === true && (await t.tekst("#skjerm h1")).includes(NAVN[st.spill.svarer]), "«Gi mobilen til» viser ikke den som skal svare");
  await t.bilde("gi");

  // ---------- The secret question: names wake up after reading ----------
  // A question with {a}, so the name in it can be checked.
  const medNavn = await t.js(`(() => { let i = 0; for (const p of RUSJ_DATA.sporsmal.pakker) for (const q of p.sporsmal) { if (p.id === "snill" && q.includes("{a}")) return i; i++; } return -1; })()`);
  await endre(`s.spill.k = ${medNavn}; s.spill.a = (s.spill.svarer + 2) % 4`, GI);
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.mappe')");
  st = await s();
  t.sjekk((await t.antall('.velger[data-h="pek"]')) === 3, "Man skal kunne peke på alle andre – ikke seg selv");
  t.sjekk(await t.js(`Array.from(document.querySelectorAll('.velger[data-h="pek"]')).every((b) => b.disabled)`), "Navnene kan trykkes før spørsmålet er lest");
  t.sjekk(!(await t.finnes(`.velger[data-h="pek"][data-v="${st.spill.svarer}"]`)), "Den som svarer, kan peke på seg selv");
  t.sjekk(!(await t.tekst("#skjerm")).includes("{a}") && !O.start.test((await t.tekst(".mappe")).trim()), "Spørsmålet synes før kortet holdes");
  await t.bilde("les");
  let slipp = await t.hold(".mappe", 650);
  const sporsmal = (await t.tekst(".mappe-bakside .mis-sporsmal")).trim();
  t.sjekk(O.start.test(sporsmal) || !t.norsk, `Spørsmålet ser feil ut: «${sporsmal}»`);
  t.sjekk(sporsmal.includes(NAVN[st.spill.a]) && !sporsmal.includes("{a}"), `Navnet står ikke i spørsmålet: «${sporsmal}»`);
  await t.bilde("sporsmal-holdt");
  await slipp();
  t.sjekk((await s()).spill.sett === true && (await t.js(`Array.from(document.querySelectorAll('.velger[data-h="pek"]')).every((b) => !b.disabled)`)), "Navnene våkner ikke etter at spørsmålet er lest");
  t.sjekk(!(await t.tekst(".mappe-bakside")).trim(), "Spørsmålet blir stående etter at fingeren slipper");
  // «Bytt spørsmål» gives a new one that must be read again
  const k0 = (await s()).spill.k;
  await pause();
  await t.klikk('[data-h="bytt"]');
  st = await s();
  t.sjekk(st.spill.k !== k0 && st.spill.sett === false, "«Bytt spørsmål» ga ikke et nytt spørsmål som må leses");
  // Reload: the secret is never on the screen afterwards
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  t.sjekk((await s()).spill.fase === "gi" && (await t.finnes('[data-h="jeg-er"]')), "Etter omlasting skal mobilen gis til den som svarer igjen");
  slipp = null;

  // ---------- Pointed at; a sip and the coin ----------
  const svarer0 = (await s()).spill.svarer;
  await t.js("Math.random = () => 0.1"); // the coin says «revealed»
  const pekt0 = await runde("slurk", true);
  st = await s();
  t.sjekk(st.spill.pekt === pekt0 && st.spill.pektPa[pekt0] === 1, "Pekingen ble ikke telt");
  t.sjekk(st.spill.mynt === true && st.spill.avslort.length === 1 && (await t.finnes(".storkort.mis-avslort")), "Mynten avslørte ikke spørsmålet");
  t.sjekk((await t.tekst(".mis-etter")).includes(NAVN[pekt0]), "Avsløringen sier ikke hvem som ble pekt på");
  await t.bilde("avslort");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(GI);
  st = await s();
  t.sjekk(st.spill.svarer === (svarer0 + 1) % 4 && st.spill.runde === 1, "Mobilen gikk ikke videre til neste");

  // A kind word and the coin says secret
  await t.js("Math.random = () => 0.9");
  await runde("snill");
  st = await s();
  t.sjekk(st.spill.valgt === "snill" && st.spill.mynt === false && st.spill.avslort.length === 1, "Et hyggelig ord kastet ikke mynten, eller hemmeligheten ble avslørt");
  t.sjekk(!(await t.finnes(".storkort")), "Spørsmålet vises selv om mynten sa hemmelig");
  await t.bilde("hemmelig");
  await pause();
  await t.klikk('[data-h="neste"]');

  // Let it be: no coin
  await runde("la");
  st = await s();
  t.sjekk(st.spill.valgt === "la" && st.spill.mynt === null && !(await t.finnes(".storkort")), "«La det være» skal holde spørsmålet hemmelig uten mynt");
  await t.bilde("la-det-vaere");

  // Back + continue; «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.mis-resultat')");

  // ---------- Small screens and a phone on its side ----------
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(GI);
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.mappe')");
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".mappe"), `Det hemmelige kortet skjules bak knappene på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`les-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  slipp = await t.hold(".mappe", 650);
  await slipp();
  st = await s();
  await t.klikk(`.velger[data-h="pek"][data-v="${(st.spill.svarer + 1) % 4}"]`);
  await t.vent("document.querySelector('.mis-pekt')");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".mis-pekt h1"), `Hvem som ble pekt på, skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await t.js(`(() => { const e = document.querySelector('.mis-fot-linje'); return !!e && ${O.fot}.test(e.textContent); })()`), `Bunnlinjen mangler på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`pekt-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  await t.klikk('[data-h="valg"][data-v="la"]');
  await t.vent("document.querySelector('.mis-resultat')");

  // ---------- Water after ten rounds ----------
  await endre("s.spill.runde = 9", "document.querySelector('.mis-resultat')");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.mis-vann')", 5000);
  t.sjekk(O.vann.test(await t.tekst("#skjerm h1")) && (await s()).spill.fase === "vann", "Vannpausen kom ikke etter ti runder");
  await t.bilde("vannpause");
  await pause();
  await t.klikk('[data-h="vann-ferdig"]');
  await t.vent(GI);

  // ---------- Kåringen ----------
  await endre(`s.spill.pektPa[${pekt0}] = 3`, GI);
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.mappe')");
  await pause();
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.mis-banner')");
  st = await s();
  t.sjekk(st.spill.ferdig && st.spill.runde === 10, `Kåringen teller feil antall runder (${st.spill.runde})`);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[pekt0], "Kåringen kårer ikke den som ble pekt mest på");
  t.sjekk(await t.finnes(".poengliste") && (await t.finnes(".mis-avslorte li")), "Kåringen mangler pekelista eller det avslørte spørsmålet");
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen mangler «Del kvelden»");
  if (await t.js("(window.RUSJ_ANDRE || []).length > 0")) t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk(st._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  await t.sov(500);
  await t.bilde("kaaring", true);
  await t.klikk('[data-h="del"]');
  await t.sov(400);

  // ---------- «Spill igjen»; quitting before anything happened ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent(GI);
  st = await s();
  t.sjekk(st.spill.runde === 0 && !st.spill.ferdig && st.spill.pakker.join() === "snill", "«Spill igjen» startet ikke et nytt spill med samme oppsett");
  await pause();
  await t.klikk('#tilbake');
  await t.klikk('[data-h="fortsett"]');
  await t.vent(GI);
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.mappe')");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await s()).spill === null, "«Avslutt» før noe har skjedd skal bare avslutte");
  t.sjekk(await t.finnes(".mis-sist"), "Hjem viser ikke «Sist …» etter et spill");
  await t.bilde("hjem-sist");
}
