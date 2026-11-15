// Fortelleren: setup (who is playing, the child's age band, the way of playing, level, length),
// «Begge svarer» with a child of 4–6 (emoji, the grown-up's version, «Spør videre»), the level
// rising through the game, the heart (favourites on this phone), swipe / «Bytt kort» / «Stå over»
// never count, a reload mid-game, back + «Fortsett», the end (no Kåringen, sharing, «sist» line),
// the favourites screen (a wrong tap is undone with one more) and a favourites game; then
// «Gjett svaret» for friends with friendly points (no show-and-draw cards, guess chips, hits,
// «Kveldens gjeng» once, the sticker after ten cards) and «Avslutt» early.
// Runs in every edition: texts are compared with the page's own R.t (tr) or only in Norwegian.

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const sp = async () => (await t.tilstand()).spill;
  const tr = (nokkel, verdier) => t.js(`Rusj.t(${JSON.stringify(nokkel)}, ${JSON.stringify(verdier || null)})`);
  const har = async (sel, nokkel, verdier) => (await t.tekst(sel)).toLocaleLowerCase().includes((await tr(nokkel, verdier)).toLocaleLowerCase());
  const presset = (h, v) => t.finnes(`[data-h="${h}"][data-v="${v}"][aria-pressed="true"]`);
  // The card on the table, from the page's own data.
  const kortet = () =>
    t.js(`(() => {
      const sp = JSON.parse(localStorage.getItem("${t.nokkel("fortelleren.v1")}")).spill;
      if (sp.egne) return sp.egne[sp.kort];
      return RUSJ_DATA.kort.stokker.find((s) => s.id === sp.stokk).kort[sp.kort];
    })()`);
  const favoritter = () => t.js(`JSON.parse(localStorage.getItem("${t.nokkel("fortelleren.favoritter")}") || "[]")`);
  const kveld = () => t.js(`((JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null") || {}).spill || []).filter((s) => s.id === "fortelleren").length`);
  const merker = () => t.js(`Object.keys(JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}"))`);
  const paKortet = async () => {
    await t.vent(`document.querySelector('.ft-kort:not(.ut)') && document.querySelector('[data-h="neste"], [data-h="hor"]')`);
    await pause();
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(await har("#skjerm", "Trekk et kort."), "Hjem mangler slagordet");
  t.sjekk(!(await t.finnes(".ft-sist")) && !(await t.finnes('[data-h="favoritter"]')), "Hjem viser «sist» eller favoritter før noe er spilt");
  await t.klikk('[data-h="tips"]');
  await t.vent(`document.querySelector('#ark:not([hidden]) .ft-tips')`);
  t.sjekk((await t.antall("#ark .ft-tips li")) >= 5 && (await har("#ark", "Lytt mer enn du snakker.")), "Tipsene til voksne mangler «Lytt mer enn du snakker»");
  await t.bilde("tips");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.bilde("hjem");
  await pause();
  await t.klikk('[data-h="nytt"]');
  await enH1("gjør klart");
  t.sjekk(await har("#skjerm h1", "Gjør klart"), "Oppsettet skal hete «Gjør klart»");
  const gjenger = await t.js(`Array.from(document.querySelectorAll('[data-h="gjeng"]')).map((f) => f.dataset.v).join()`);
  t.sjekk(gjenger === "barnvoksen,familie,venner,ungdom,voksne", `Hvem spiller: ${gjenger}`);
  t.sjekk(
    (await presset("gjeng", "familie")) && (await presset("modus", "snakk")) && (await presset("niva", "stiger")) && (await presset("lengde", "10")) && (await t.finnes("#spillerboks")),
    "Standard: Familie, Snakk sammen, Stiger, 10 kort og spillernavn",
  );
  t.sjekk(!(await t.finnes('[data-h="modus"][data-v="begge"]')) && !(await t.finnes('[data-h="alder"]')), "Familie skal ikke ha «Begge svarer» eller barnets alder");
  await t.bilde("oppsett", true);

  // ---------- A child of 4–6 and a grown-up: both answer ----------
  await t.klikk('[data-h="gjeng"][data-v="barnvoksen"]');
  t.sjekk((await presset("modus", "begge")) && (await presset("alder", "46")) && !(await t.finnes("#spillerboks")), "Barn og voksen: «Begge svarer», 4–6 år og ingen navn");
  t.sjekk(await t.finnes(".ft-tips-boks"), "Barn og voksen mangler tipset til voksne");
  await t.klikk('[data-h="lengde"][data-v="5"]');
  t.sjekk((await t.tilstand()).oppsett.lengde === 5, "Antall kort ble ikke lagret");
  await t.bilde("oppsett-barn", true);
  await t.klikk('[data-h="start"]');
  await paKortet();
  await enH1("kortet");
  let s = await sp();
  t.sjekk(s.stokk === "barn46" && s.modus === "begge" && s.roller && s.antall === 2 && s.lengde === 5 && s.nr === 1, `Spillet startet feil: ${JSON.stringify([s.stokk, s.modus, s.antall, s.lengde])}`);
  t.sjekk((await t.js(`Rusj._statKo.map((x) => x.h)`)).includes("start"), "Statistikken fikk ikke «start»");
  let k = await kortet();
  t.sjekk(k.n === 1, `«Stiger» skal begynne med et lett kort (fikk nivå ${k.n})`);
  t.sjekk((await t.finnes(".ft-emoji")) && (await t.finnes(".ft-voksen")), "Kortet for 4–6 mangler bilde eller den voksnes spørsmål");
  t.sjekk(!k.f || (await t.finnes(".ft-videre")), "«Spør videre» mangler på kortet");
  t.sjekk(await t.friForDokk(".ft-kort"), "Kortet havner bak knappene");
  t.sjekk(await har(".ft-hode", "Barnet svarer først"), "Det står ikke hvem som svarer først");
  await t.bilde("begge");

  // The heart: on (saved on this phone), and it stays when the card is redrawn.
  await t.klikk('[data-h="favoritt"]');
  t.sjekk((await t.finnes('[data-h="favoritt"][aria-pressed="true"]')) && (await favoritter()).length === 1 && (await sp()).fav.length === 1, "Hjertet lagret ikke kortet");
  await t.bilde("hjerte");

  // Swipe, «Bytt kort» and «Stå over» give a new card and never count.
  let forste = (await sp()).kort;
  await t.sveip(".storkort", 240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  await pause();
  s = await sp();
  t.sjekk(s.kort !== forste && s.nr === 1 && s.besvart === 0 && s.byttet === 1, "Sveip ga ikke nytt kort, eller talte med");
  t.sjekk(await t.finnes('[data-h="favoritt"][aria-pressed="false"]'), "Hjertet skal være tomt på et nytt kort");
  forste = s.kort;
  await t.klikk('[data-h="bytt"]', 700);
  s = await sp();
  t.sjekk(s.kort !== forste && s.nr === 1 && s.byttet === 2 && s.sett.length === 3, "«Bytt kort» ga ikke et nytt kort");
  await t.klikk('[data-h="sta-over"]', 800);
  s = await sp();
  t.sjekk(s.nr === 1 && s.besvart === 0 && s.staOver === 1 && s.tur === 1, "«Stå over» talte med, eller ga ikke turen videre");
  t.sjekk(await har(".ft-hode", "Den voksne svarer først"), "Etter «Stå over» skal den voksne svare først");

  // Answer: the level rises (5 cards: lett, lett, middels, middels, dypere).
  const nivaer = [(await kortet()).n];
  await t.klikk('[data-h="neste"]', 700);
  await paKortet();
  nivaer.push((await kortet()).n);
  s = await sp();
  t.sjekk(s.nr === 2 && s.besvart === 1 && s.tur === 0, "«Neste kort» talte ikke");

  // Reload in the middle, then back + «Fortsett».
  const forReload = s.kort;
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  t.sjekk((await t.finnes(".ft-kort")) && (await sp()).kort === forReload, "Omlasting mistet kortet");
  await t.klikk("#tilbake");
  await t.vent(`document.querySelector('[data-h="fortsett"]')`);
  t.sjekk(await har('[data-h="fortsett"]', "Fortsett · kort {n} av {av}", { n: 2, av: 5 }), "«Fortsett» sier ikke hvilket kort dere er på");
  await pause();
  await t.klikk('[data-h="fortsett"]');
  await paKortet();
  t.sjekk((await sp()).nr === 2, "«Fortsett» gikk ikke tilbake til samme kort");
  for (let n = 3; n <= 5; n++) {
    await t.klikk('[data-h="neste"]', 700);
    await paKortet();
    nivaer.push((await kortet()).n);
  }
  t.sjekk(nivaer.join() === "1,1,2,2,3", `Nivået steg ikke som det skulle: ${nivaer.join()}`);
  t.sjekk(await har('[data-h="neste"]', "Ferdig"), "Siste kort skal ha «Ferdig»");
  if ((await kortet()).ty !== "vis") t.sjekk(await t.finnes(".ft-videre"), "Et dypere kort mangler «Spør videre»");
  await t.bilde("dypere");
  await t.klikk('[data-h="neste"]', 600);
  await t.vent(`document.querySelector('[data-h="igjen"]')`);
  await enH1("slutt");
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.skjerm === "slutt" && s.spill.besvart === 5, "Spillet ble ikke ferdig etter fem kort");
  t.sjekk(await har("#skjerm h1", "Godt snakka!"), `Feil overskrift: ${await t.tekst("#skjerm h1")}`);
  t.sjekk((await t.finnes('[data-h="del"]')) && !(await t.finnes(".pall")), "Slutten skal ha «Del» og ingen pall");
  t.sjekk((await kveld()) === 0, "Et spill uten poeng skal ikke inn i «Kveldens gjeng»");
  await t.bilde("slutt", true);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk(await t.finnes(".ft-sist"), "Hjem mangler «sist»-linja");
  if (t.norsk) t.sjekk(/Sist: 5 kort · Barn og voksen · Begge svarer/.test(await t.tekst(".ft-sist")), `«Sist»-linja: ${await t.tekst(".ft-sist")}`);
  await t.bilde("hjem-sist");

  // ---------- Favourites ----------
  await t.klikk('[data-h="favoritter"]');
  await t.vent(`document.querySelector('.ft-favliste')`);
  await enH1("favoritter");
  t.sjekk((await t.antall(".ft-fav")) === 1, "Favorittlista skal ha ett kort");
  await t.klikk('[data-h="fav-veksle"][data-v="0"]');
  t.sjekk((await t.finnes(".ft-fav.fjernet")) && (await favoritter()).length === 0, "Et trykk på hjertet fjernet ikke favoritten");
  await t.klikk('[data-h="fav-veksle"][data-v="0"]');
  t.sjekk(!(await t.finnes(".ft-fav.fjernet")) && (await favoritter()).length === 1, "Et nytt trykk ga ikke favoritten tilbake");
  await t.bilde("favoritter");
  await t.klikk('[data-h="spill-fav"]');
  await paKortet();
  s = await sp();
  t.sjekk(Array.isArray(s.egne) && s.egne.length === 1 && s.lengde === 1 && s.modus === "begge", "«Spill favorittene» startet ikke med favorittkortet");
  t.sjekk(await har("#topp-tittel", "Favoritter"), "Toppen skal si «Favoritter» i et favorittspill");
  await t.klikk('[data-h="avslutt"]');
  await t.vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"]')`);
  t.sjekk(!t.norsk || (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Arket skal ha «Spill videre»");
  await t.bilde("avslutt-ark");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(`document.querySelector('[data-h="nytt"]')`);
  t.sjekk(!(await sp()), "«Avslutt» før noe er besvart skal gå hjem uten spill");

  // ---------- «Gjett svaret» for friends, with friendly points ----------
  await pause();
  await t.klikk('[data-h="nytt"]');
  await t.vent(`document.querySelector('[data-h="gjeng"]')`);
  await t.klikk('[data-h="gjeng"][data-v="venner"]');
  t.sjekk((await presset("modus", "snakk")) && !(await t.finnes('[data-h="modus"][data-v="begge"]')) && (await t.finnes("#spillerboks")), "Venner: «Snakk sammen» og navn");
  await t.klikk('[data-h="modus"][data-v="gjett"]');
  await t.klikk('[data-h="poeng"]');
  await t.klikk('[data-h="niva"][data-v="1"]');
  await t.klikk('[data-h="lengde"][data-v="10"]');
  const o = (await t.tilstand()).oppsett;
  t.sjekk(o.gjeng === "venner" && o.modus === "gjett" && o.poeng && o.niva === "1" && o.lengde === 10, `Oppsettet ble ikke lagret: ${JSON.stringify(o)}`);
  await t.bilde("oppsett-gjett", true);
  await t.klikk('[data-h="start"]');
  await paKortet();
  s = await sp();
  t.sjekk(s.stokk === "venner" && s.modus === "gjett" && s.fase === "gjett" && s.antall === 3 && s.poeng, "«Gjett svaret» startet feil");
  let traff = 0;
  for (let n = 1; n <= 10; n++) {
    await paKortet();
    s = await sp();
    k = await kortet();
    t.sjekk(k.ty !== "vis" && k.n === 1, `«Gjett svaret» på lett ga et kort som ikke passer (${k.ty}, nivå ${k.n})`);
    t.sjekk((await t.antall('[data-h="gjettet"]')) === 2 && !(await t.finnes(".ft-videre")), "Før svaret: to som gjetter, og ingen «Spør videre» ennå");
    const gjetter = (s.tur + 1) % 3;
    await t.klikk(`[data-h="gjettet"][data-v="${gjetter}"]`);
    t.sjekk(await presset("gjettet", gjetter), "Gjett-brikken ble ikke slått på");
    if (n === 1) await t.bilde("gjett");
    await t.klikk('[data-h="hor"]');
    await t.vent(`document.querySelector('[data-h="neste"]')`);
    t.sjekk((await sp()).fase === "svar" && (await t.antall('[data-h="traff"]')) === 2, "Etter «Hør svaret»: hvem traff?");
    if (k.f) t.sjekk(await t.finnes(".ft-videre"), "Etter svaret skal «Spør videre» vises");
    if (n % 3 === 1) {
      await t.klikk(`[data-h="traff"][data-v="${gjetter}"]`);
      traff += 1;
      if (n === 1) {
        // A wrong tap is undone with one more.
        await t.klikk(`[data-h="traff"][data-v="${gjetter}"]`);
        t.sjekk(!(await presset("traff", gjetter)), "Et nytt trykk tok ikke bort treffet");
        await t.klikk(`[data-h="traff"][data-v="${gjetter}"]`);
        await t.bilde("traff");
      }
    }
    await pause();
    await t.klikk('[data-h="neste"]', n < 10 ? 700 : 500);
  }
  await t.vent(`document.querySelector('[data-h="igjen"]')`);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.besvart === 10, "«Gjett svaret» ble ikke ferdig etter ti kort");
  t.sjekk(s.spill.treff.reduce((a, b) => a + b, 0) === traff && (await t.finnes(".poengliste")), `Treffene ble feil: ${JSON.stringify(s.spill.treff)} (ventet ${traff})`);
  t.sjekk((await kveld()) === 1, "«Kveldens gjeng» fikk ikke spillet nøyaktig én gang");
  await t.sov(1800);
  t.sjekk((await merker()).includes("fortelleren-ti"), "Klistremerket «Ti gode samtaler» ble ikke gitt");
  await t.bilde("slutt-gjett", true);

  // ---------- «Avslutt» after one card goes to the end ----------
  await t.klikk('[data-h="igjen"]');
  await paKortet();
  await t.klikk('[data-h="hor"]');
  await t.vent(`document.querySelector('[data-h="neste"]')`);
  await pause();
  await t.klikk('[data-h="neste"]', 700);
  await paKortet();
  await t.klikk('[data-h="avslutt"]');
  await t.vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"]')`);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(`document.querySelector('[data-h="igjen"]')`);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.besvart === 1 && s.skjerm === "slutt", "«Avslutt» etter ett kort gikk ikke til slutten");
  t.sjekk((await kveld()) === 2, "Et avsluttet spill med poeng skal også inn i «Kveldens gjeng»");
}
