// Nissen («Mandelen i grøten»): home and rules, «Gjør klart» (players, rounds), the bowl going
// round («Gi mobilen til» → hold the bowl: «MANDELEN!» for exactly one, «Bare grøt» for the rest;
// a reload never shows the bowl), the elf's question with the talking timer and «Nytt spørsmål»,
// «3 · 2 · 1 – Pek!», the reveal (got away: 3 points and the pig; caught: 1 to everyone else),
// «Angre», the next round, small screens and a phone on its side, Kåringen, «Spill igjen», and old
// Secret Santa links (…/nissen/#2…) handed on to the draw with the hash.
// Language-neutral (rusj/SPRAK.md): words are checked per edition through ORD.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const ORD = {
  nb: { navn: "Nissen", mandel: /MANDELEN!/, grot: /Bare grøt/, trekning: /\/nissetrekning\/$/ },
  en: { navn: "The Almond", mandel: /THE ALMOND!/, grot: /Just porridge/, trekning: /\/en\/secret-santa-draw\/$/ },
  da: { navn: "Nissen", mandel: /MANDLEN!/, grot: /Kun risalamande/, trekning: /\/da\/nissetraekning\/$/ },
};

export default async function (t) {
  const O = ORD[t.sprak];
  const s = () => t.tilstand();
  const pause = () => t.sov(420);
  const NOKKEL = t.nokkel("nissen.v2");
  const GI = "document.querySelector('.gi-til') && document.querySelector('[data-h=\"jeg-er\"]')";
  const endre = async (kode, vent) => {
    await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); ${kode}; localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
    await t.lastSide(t.side, vent);
    await t.sov(450);
  };
  // Everyone looks in their bowl; returns what each one saw.
  const runde = async (bilder = false) => {
    const sett = [];
    for (;;) {
      await t.vent(GI);
      await pause();
      await t.klikk('[data-h="jeg-er"]');
      await t.vent("document.querySelector('.mappe')");
      const st = await s();
      const hvem = (st.spill.start + st.spill.sett) % st.spill.antall;
      t.sjekk(!(await t.js(`document.querySelector('[data-h="videre"]').disabled === false`)), "«Gi mobilen videre» kan trykkes før bollen er sett");
      const slipp = await t.hold(".mappe", 650);
      const tekst = (await t.tekst(".mappe-bakside")).trim();
      if (bilder && sett.length < 2) await t.bilde(hvem === st.spill.mandel ? "bolle-mandel" : "bolle-grot");
      await slipp();
      const har = O.mandel.test(tekst);
      t.sjekk(har === (hvem === st.spill.mandel) && (har || O.grot.test(tekst)), `Bollen til ${NAVN[hvem]} viser feil: «${tekst}»`);
      t.sjekk(!(await t.tekst(".mappe-bakside")).trim(), "Bollen blir stående etter at fingeren slipper");
      sett.push(har);
      await pause();
      await t.klikk('[data-h="videre"]');
      await t.sov(300);
      if (await t.finnes(".ng-nissen")) break;
    }
    t.sjekk(sett.length === NAVN.length && sett.filter(Boolean).length === 1, `Alle skal se bollen én gang, og nøyaktig én skal ha mandelen (${sett.join()})`);
  };

  // ---------- Home and rules ----------
  await t.start({ navn: NAVN });
  t.sjekk((await t.tekst("#skjerm h1")).trim() === O.navn, `Hjem-skjermen viser ikke «${O.navn}»`);
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark ol li, #ark .steg li, #ark li")) >= 4, "Reglene mangler stegene");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4 && (await t.finnes('[data-h="runder"]')), "Oppsettet mangler spillerne eller rundevalget");
  await t.klikk('[data-h="runder"][data-v="3"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent(GI);
  let st = await s();
  t.sjekk(st.runder === 3 && st.spill.runder === 3 && st._aktiv === true, "Spillet startet ikke med 3 runder");
  t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[st.spill.start]), "«Gi mobilen til» viser ikke den første spilleren");
  await t.bilde("gi");

  // A reload while the bowl is open: the bowl is never on the screen afterwards.
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.mappe')");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  st = await s();
  t.sjekk(st.spill.fase === "gi" && (await t.finnes('[data-h="jeg-er"]')), "Etter omlasting skal mobilen gis til spilleren igjen");

  // ---------- Round 1: the bowls, the elf, pointing ----------
  await runde(true);
  st = await s();
  t.sjekk(st.spill.fase === "prat" && Number.isInteger(st.spill.spurt) && (await t.finnes("#klokke")), "Nissen spør ikke, eller klokka mangler");
  const sporsmal1 = (await t.tekst(".ng-boble h1")).trim();
  t.sjekk(sporsmal1.length > 5 && (await t.js("document.querySelector('.ng-boble .etikett').textContent")).includes(NAVN[st.spill.spurt]), "Nissens spørsmål eller navnet mangler");
  await t.bilde("nissen-spor");
  const spurt0 = st.spill.spurt;
  await pause();
  await t.klikk('[data-h="nytt-sporsmal"]');
  st = await s();
  t.sjekk(st.spill.spurt !== spurt0, "«Nytt spørsmål» spurte den samme igjen");
  await t.klikk('[data-h="til-pek"]');
  await t.vent("document.querySelector('[data-h=\"pekt\"]')");
  t.sjekk(await t.js(`document.querySelector('[data-h="snu"]').disabled`), "«Snu bollen» kan trykkes før noen er valgt");
  await t.klikk('[data-h="pek"]');
  await t.sov(3600);
  const mandel = st.spill.mandel;
  const uskyldig = (mandel + 1) % 4;
  await t.klikk(`.velger[data-h="pekt"][data-v="${uskyldig}"]`);
  await t.bilde("pek");
  await t.klikk('[data-h="snu"]');
  await t.vent("document.querySelector('.ng-fasit')", 6000);
  st = await s();
  t.sjekk(!st.spill.siste.fanget && st.spill.poeng[mandel] === 3 && st.spill.poeng.reduce((a, b) => a + b, 0) === 3, `Mandelholderen slapp unna, men fikk ikke 3 poeng (${st.spill.poeng.join()})`);
  t.sjekk(await t.finnes(".ng-gris"), "Marsipangrisen vises ikke");
  await t.bilde("fasit-slapp", true);

  // «Angre» takes the points back; this time the holder is caught.
  await pause();
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"pekt\"]')");
  st = await s();
  t.sjekk(st.spill.fase === "pek" && st.spill.poeng.every((p) => p === 0), "«Angre» tok ikke poengene tilbake");
  await t.klikk(`.velger[data-h="pekt"][data-v="${uskyldig}"]`); // unselect
  await t.klikk(`.velger[data-h="pekt"][data-v="${mandel}"]`);
  await t.klikk('[data-h="snu"]');
  await t.vent("document.querySelector('.ng-fasit')", 6000);
  st = await s();
  t.sjekk(st.spill.siste.fanget && st.spill.poeng[mandel] === 0 && st.spill.poeng.filter((p) => p === 1).length === 3, `Mandelholderen ble tatt, men poengene er feil (${st.spill.poeng.join()})`);
  await t.bilde("fasit-tatt");

  // ---------- Round 2 starts with the next player; small screens ----------
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(GI);
  st = await s();
  t.sjekk(st.spill.runde === 1 && st.spill.start === 1 && st.spill.sett === 0, "Runde 2 startet ikke med neste spiller");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.mappe')");
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".mappe"), `Grøtbollen skjules bak knappene på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`se-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // Back + continue; «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent(GI);

  // ---------- Kåringen (quit early) ----------
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.mappe')");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner') && document.querySelector('.poengliste')", 6000);
  st = await s();
  t.sjekk(st.spill.ferdig && st.spill.runde === 1 && st._aktiv === false, `Kåringen etter avbrutt spill er feil (runde ${st.spill.runde})`);
  t.sjekk(await t.finnes(".pall") && (await t.finnes(".ng-griser")), "Kåringen mangler pallen eller marsipangris-linja");
  if (await t.js("(window.RUSJ_ANDRE || []).length > 0")) t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  await t.sov(500);
  await t.bilde("kaaring", true);

  // ---------- «Spill igjen» ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent(GI);
  st = await s();
  t.sjekk(st.spill.runde === 0 && !st.spill.ferdig && st.spill.runder === 3, "«Spill igjen» startet ikke et nytt spill med samme oppsett");

  // ---------- A whole game to the end ----------
  await endre("s.spill.runde = 2; s.spill.start = 2", GI);
  await runde();
  await t.klikk('[data-h="til-pek"]');
  await t.vent("document.querySelector('[data-h=\"pekt\"]')");
  await t.klikk('[data-h="ingen"]');
  await t.vent("document.querySelector('.ng-fasit')", 6000);
  t.sjekk((await s()).spill.pekt.length === 0, "«Ingen fikk mer enn én finger» skal snu bollen uten noen pekt ut");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner') && document.querySelector('.poengliste')", 6000);
  st = await s();
  t.sjekk(st.spill.ferdig && st.spill.runde === 3, "Spillet ble ikke ferdig etter siste runde");

  // ---------- Old Secret Santa links go on to the draw ----------
  // (a query string makes it a real page load, not just a jump within the page)
  await t.lastSide(t.side + "?gammel=1#2ABCDEFGHJK", "!/\\/(nissen|the-almond)\\/$/.test(location.pathname) && document.readyState === 'complete'");
  await t.sov(400);
  const [sti, hash] = await t.js("[location.pathname, location.hash]");
  t.sjekk(O.trekning.test(sti), `En gammel nisselenke ble ikke sendt til nissetrekningen (${sti})`);
  t.sjekk(hash === "" || hash === "#2ABCDEFGHJK", `Lenken mistet ikke bare #-delen, den ble endret (${hash})`);
}
