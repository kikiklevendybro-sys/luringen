// Telleren: the 18+ gate, setup (how many rules), the board 1–21, «Noen bommet» with «Angre»,
// «Noen sa 21!» → who → three suggestions («Nye forslag») → the rule on the board and the next
// starter, «Angre» on a rule, your own rule (text + number), a tile shows its rule, reload, back +
// continue, «Nytt spill» asks first, the water break after four rules, small screens and a phone
// on its side, Kåringen when the board has its rules (the board, who made what, «Bommet aldri»,
// sharing, «sist» on home), «Spill igjen» and quitting.
// Language-neutral (rusj/SPRAK.md): words are checked per edition through ORD.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const ORD = {
  nb: { navn: "Telleren", alkfri: /alkoholfritt/i, over: /stå over/i, vann: /vann/i, skal: "Skål for gjengen!", egen: "Bjeff som en hund", fot: /alle kan stå over/ },
  en: { navn: "Tally", alkfri: /alcohol-free/i, over: /sit .*out/i, vann: /water/i, skal: "Cheers to the crew!", egen: "Bark like a dog", fot: /anyone can sit out/ },
  da: { navn: "Tælleren", alkfri: /alkoholfrit/i, over: /stå over/i, vann: /vand/i, skal: "Skål for banden!", egen: "Gø som en hund", fot: /alle kan stå over/ },
};
const TAVLE = "document.querySelector('.tel-tavle') && document.querySelector('[data-h=\"sa21\"]')";

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
  // Someone said 21: who, then the suggestion number «flis» (or none: stay on the rule screen).
  const sa21 = async (hvem, flis = 0, bilde = "") => {
    await pause();
    await t.klikk('[data-h="sa21"]');
    await t.vent("document.querySelector('[data-h=\"hvem21\"]')");
    if (bilde) await t.bilde(`${bilde}-hvem`);
    await pause();
    await t.klikk(`.velger[data-h="hvem21"][data-v="${hvem}"]`);
    await t.vent("document.querySelector('[data-h=\"velg-regel\"]')");
    if (flis == null) return;
    await pause();
    await t.klikk(`[data-h="velg-regel"][data-v="${flis}"]`);
    await t.sov(500);
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
  t.sjekk((await s()).oppsett.maks === 8, "Standard skal være 8 regler");
  t.sjekk((await t.antall(".spiller")) === 4 && (await t.finnes(".tel-vett")), "Oppsettet mangler spillerne eller «Slik er slurkene»");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="maks"][data-v="5"]');
  await t.klikk('[data-h="start"]');
  await t.vent(TAVLE);
  let st = await s();
  t.sjekk(st._aktiv === true && st.spill.maks === 5, "Spillet startet ikke med 5 regler");
  t.sjekk((await t.antall(".tel-rute")) === 21, "Tavla har ikke 21 tall");
  t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[st.spill.starter]), "Skjermen viser ikke hvem som begynner");
  await t.bilde("tavle-tom");

  // ---------- A miss, and «Angre» ----------
  const starter0 = st.spill.starter;
  await pause();
  await t.klikk('[data-h="bom"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"]')");
  await t.bilde("hvem-bommet");
  await t.klikk('#ark [data-h="ark-svar"][data-v="2"]');
  await t.sov(400);
  st = await s();
  t.sjekk(st.spill.bom[2] === 1 && st.spill.starter === 2 && (await t.finnes(".tel-sist-hendelse")), "«Noen bommet» ga ikke en bom og ny starter");
  await t.bilde("bom");
  await t.klikk('[data-h="angre"]');
  st = await s();
  t.sjekk(st.spill.bom[2] === 0 && st.spill.starter === starter0 && !(await t.finnes('[data-h="angre"]')), "«Angre» tok ikke bommen tilbake");

  // ---------- Someone said 21: suggestions, «Nye forslag», the rule on the board ----------
  await sa21(1, null, "regel1");
  t.sjekk((await t.antall('[data-h="velg-regel"]')) === 3, "Det er ikke tre forslag");
  t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[1]), "Regelskjermen sier ikke hvem som sa 21");
  await t.bilde("forslag");
  const for1 = JSON.stringify((await s()).spill.forslag);
  await pause();
  await t.klikk('[data-h="bland"]');
  t.sjekk(JSON.stringify((await s()).spill.forslag) !== for1, "«Nye forslag» ga ikke nye forslag");
  const valgt = (await s()).spill.forslag[1];
  await pause();
  await t.klikk('[data-h="velg-regel"][data-v="1"]');
  await t.vent(TAVLE);
  st = await s();
  t.sjekk(st.spill.regler.length === 1 && st.spill.regler[0].av === 1 && JSON.stringify(st.spill.regler[0].tall) === JSON.stringify(valgt.tall), "Regelen kom ikke på tavla");
  t.sjekk(st.spill.starter === 2, "Den etter den som sa 21, begynner ikke neste runde");
  t.sjekk((await t.antall(".tel-rute button")) === valgt.tall.length && (await t.antall(".tel-regler li")) === 1, "Tavla eller lista viser ikke regelen");
  await t.sov(400);
  await t.bilde("tavle-1");
  await t.klikk(`.tel-rute button[data-v="${valgt.tall[0]}"]`);
  t.sjekk(await t.finnes(".toast:not([hidden])"), "Et tall på tavla viser ikke regelen");
  // «Angre» takes the rule back: the same player chooses again from the same suggestions
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"velg-regel\"]')");
  st = await s();
  t.sjekk(st.spill.regler.length === 0 && st.spill.hvem21 === 1 && st.spill.starter === starter0, "«Angre» tok ikke regelen tilbake");
  await pause();
  await t.klikk('[data-h="velg-regel"][data-v="0"]');
  await t.vent(TAVLE);

  // ---------- Your own rule ----------
  await sa21(3, null);
  await pause();
  await t.klikk('[data-h="egen"]');
  await t.vent("document.querySelector('#tel-egen-tekst')");
  t.sjekk(await t.js("document.querySelector('[data-h=\"egen-ferdig\"]').disabled"), "«Legg til regelen» skal være av uten tekst og tall");
  await t.skrivInn("#tel-egen-tekst", O.egen);
  const fritt = await t.js("Number(document.querySelector('.tel-tallknapp').dataset.v)");
  await t.klikk(`.tel-tallknapp[data-v="${fritt}"]`);
  t.sjekk(!(await t.js("document.querySelector('[data-h=\"egen-ferdig\"]').disabled")), "«Legg til regelen» våkner ikke med tekst og tall");
  await t.bilde("egen-regel");
  await t.klikk('[data-h="egen-ferdig"]');
  await t.vent(TAVLE);
  st = await s();
  t.sjekk(st.spill.regler.length === 2 && st.spill.regler[1].type === "egen" && st.spill.regler[1].tekst === O.egen && st.spill.regler[1].tall[0] === fritt, "Den egne regelen kom ikke på tavla");
  t.sjekk(!t.norsk || (await t.tekst(".tel-regler")).includes(O.egen), "Den egne regelen står ikke i lista");

  // Reload; back + continue; «Nytt spill» asks first
  await t.lastSide(t.side, TAVLE);
  t.sjekk((await s()).spill.regler.length === 2, "Reglene forsvant ved omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent(TAVLE);

  // ---------- Small screens and a phone on its side ----------
  await sa21(0, 2);
  await t.vent(TAVLE);
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".tel-tavle"), `Tavla skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await t.friForDokk(".tel-starter"), `Hvem som begynner, skjules bak knappene på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`tavle-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // ---------- The fourth rule brings water ----------
  await sa21(2, 0);
  await t.vent("document.querySelector('.tel-vann')", 5000);
  t.sjekk(O.vann.test(await t.tekst("#skjerm h1")) && (await s()).spill.fase === "vann", "Vannpausen kom ikke etter fire regler");
  await t.bilde("vannpause");
  await pause();
  await t.klikk('[data-h="vann-ferdig"]');
  await t.vent(TAVLE);
  // a miss that stays, so Kåringen can name those who never missed
  await pause();
  await t.klikk('[data-h="bom"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="0"]');
  await t.sov(300);

  // ---------- The fifth rule ends the game ----------
  await sa21(1, 0);
  await t.vent("document.querySelector('.tel-banner')");
  st = await s();
  t.sjekk(st.spill.ferdig && st.spill.regler.length === 5, "Spillet sluttet ikke ved fem regler");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === O.skal, `Kåringen har ikke overskriften «${O.skal}»`);
  t.sjekk((await t.antall(".tel-regler li")) === 5 && (await t.antall(".tel-regler small")) === 5, "Kåringen viser ikke alle reglene og hvem som laget dem");
  t.sjekk(await t.finnes(".tel-feilfri"), "Kåringen nevner ikke dem som aldri bommet");
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen mangler «Del kvelden»");
  if (await t.js("(window.RUSJ_ANDRE || []).length > 0")) t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk(st._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  await t.sov(500);
  await t.bilde("kaaring", true);
  await t.klikk('[data-h="del"]');
  await t.sov(400);

  // ---------- «Spill igjen»; quitting before anything happened; quitting midway ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent(TAVLE);
  st = await s();
  t.sjekk(st.spill.regler.length === 0 && st.spill.maks === 5 && !st.spill.ferdig, "«Spill igjen» startet ikke et nytt spill med samme oppsett");
  await pause();
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await s()).spill === null, "«Avslutt» før noe har skjedd skal bare avslutte");
  t.sjekk(await t.finnes(".tel-sist"), "Hjem viser ikke «Sist …» etter et spill");
  await t.bilde("hjem-sist");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent(TAVLE);
  await sa21(3, 0);
  await t.vent(TAVLE);
  await pause();
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.tel-banner')");
  t.sjekk((await s()).spill.ferdig === true && (await s()).spill.regler.length === 1, "«Avslutt» midt i ga ikke kåringen");
  await t.bilde("kaaring-tidlig");
}
