// Hovedpersonen: a full game with three players and stars. Setup (packs, questions each, stars),
// the chair screen (who sits, who reads), the question card (swipe and «Bytt spørsmål» never
// count, the star toggles on and off), a reload in the middle of a turn, back + «Fortsett», the
// next player in the chair with last turn's stars, «Stå over», Kåringen (podium, «Kveldens gjeng»
// once, share button), the «sist» line on home; then a short game without stars where everyone
// sits in the chair (the sticker), and «Avslutt» with stars straight to Kåringen.
// Runs in every edition: texts are compared with the page's own R.t (tr) or only in Norwegian.

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const sp = async () => (await t.tilstand()).spill;
  const tr = (nokkel, verdier) => t.js(`Rusj.t(${JSON.stringify(nokkel)}, ${JSON.stringify(verdier || null)})`);
  const har = async (sel, nokkel, verdier) => (await t.tekst(sel)).toLocaleLowerCase().includes((await tr(nokkel, verdier)).toLocaleLowerCase());
  const navn = (i) => t.js(`Rusj.navn(${i})`);
  const kveld = () => t.js(`((JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null") || {}).spill || []).filter((s) => s.id === "hovedpersonen").length`);
  const merker = () => t.js(`Object.keys(JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}"))`);
  const sporsmal = async () => {
    await t.vent(`document.querySelector('.storkort') && document.querySelector('[data-h="neste"]')`);
    await pause();
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(await har("#skjerm", "Én i stolen."), "Hjem mangler slagordet");
  t.sjekk(!(await t.finnes(".hp-sist")), "Hjem viser en «sist»-linje før noe er spilt");
  await t.bilde("hjem");
  await t.klikk('[data-h="nytt"]');
  await enH1("gjør klart");
  t.sjekk(await har("#skjerm h1", "Gjør klart"), "Oppsettet skal hete «Gjør klart»");
  const fliser = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((f) => f.dataset.v + (f.getAttribute("aria-pressed") === "true" ? "*" : "")).join()`);
  t.sjekk(fliser === "familie*,venner*,fantasi,dypt,ungdom", `Pakkene er feil: ${fliser}`);
  t.sjekk(await t.finnes('[data-h="per"][data-v="5"][aria-pressed="true"]') && (await t.finnes('[data-h="stjerner"][aria-pressed="true"]')), "Standard: 5 spørsmål og stjerner på");
  await t.klikk('[data-h="pakke"][data-v="dypt"]');
  await t.klikk('[data-h="per"][data-v="3"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.join() === "familie,venner,dypt" && (await t.tilstand()).oppsett.per === 3, "Valgene på «Gjør klart» ble ikke lagret");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');

  // ---------- The chair ----------
  await t.vent(`document.querySelector('[data-h="sett"]')`);
  await enH1("stolen");
  let s = await sp();
  const [p1, p2, p3] = s.rekke;
  t.sjekk(s.antall === 3 && s.per === 3 && s.stjerner === true && s.fase === "stol", "Spillet startet ikke riktig");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === (await navn(p1)), "Stolskjermen viser ikke hvem som sitter i stolen");
  t.sjekk(await har(".hp-leser", "{navn} leser spørsmålene.", { navn: await navn(p2) }), "Stolskjermen sier ikke hvem som leser (nestemann)");
  t.sjekk((await t.js(`Rusj._statKo.map((x) => x.h)`)).includes("start"), "Statistikken fikk ikke «start»");
  t.sjekk(await t.friForDokk(".hp-stol h1"), "Navnet havner bak knappene");
  await t.bilde("stol");
  await pause();
  await t.klikk('[data-h="sett"]');
  await sporsmal();
  await enH1("spørsmål");
  t.sjekk(await t.friForDokk(".storkort"), "Kortet havner bak knappene");
  t.sjekk(await t.finnes(".dokk .hp-stjerne"), "Stjerneknappen skal stå ved hovedknappen nederst");
  t.sjekk(await har(".storkort-nr", "{n} av {av}", { n: 1, av: 3 }), "Kortet viser ikke «1 av 3»");
  await t.bilde("sporsmal");

  // Swipe and the link swap the question; the number stays.
  let forste = (await sp()).kort;
  await t.sveip(".storkort", 240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  await pause();
  s = await sp();
  t.sjekk(s.kort !== forste && s.nr === 1, "Sveip ga ikke nytt spørsmål, eller talte med");
  forste = s.kort;
  await t.klikk('[data-h="bytt"]', 700);
  s = await sp();
  t.sjekk(s.kort !== forste && s.nr === 1 && s.besvart === 0, "«Bytt spørsmål» ga ikke nytt spørsmål, eller talte med");

  // The star: on, off, on.
  await t.klikk('[data-h="stjerne"]');
  t.sjekk(await t.finnes('[data-h="stjerne"][aria-pressed="true"]') && (await sp()).stjerne === true, "Stjerna ble ikke slått på");
  await t.bilde("stjerne");
  await t.klikk('[data-h="stjerne"]');
  t.sjekk(await t.finnes('[data-h="stjerne"][aria-pressed="false"]') && (await sp()).stjerne === false, "Et nytt trykk tar ikke stjerna bort");
  await t.klikk('[data-h="stjerne"]');
  await pause();
  await t.klikk('[data-h="neste"]', 700);
  await sporsmal();
  s = await sp();
  t.sjekk(s.nr === 2 && s.poeng[p1] === 1 && s.stjerne === false, `Stjerna ble ikke gitt ved «Neste» (${s.poeng})`);

  // Reload in the middle of the turn, then back + «Fortsett».
  await t.klikk('[data-h="stjerne"]');
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  s = await sp();
  t.sjekk((await t.finnes(".storkort")) && s.nr === 2 && s.stjerne === true && (await t.finnes('[data-h="stjerne"][aria-pressed="true"]')), "Omlasting mistet spørsmålet eller stjerna");
  await t.klikk("#tilbake");
  await t.vent(`document.querySelector('[data-h="fortsett"]')`);
  t.sjekk(await har('[data-h="fortsett"]', "Fortsett · {navn} i stolen", { navn: await navn(p1) }), "«Fortsett» sier ikke hvem som sitter i stolen");
  await pause();
  await t.klikk('[data-h="fortsett"]');
  await sporsmal();
  t.sjekk((await sp()).nr === 2, "«Fortsett» gikk ikke tilbake til samme spørsmål");
  await t.klikk('[data-h="neste"]', 700);
  await sporsmal();
  t.sjekk(await har(".storkort-fot", "Siste spørsmål til {navn}", { navn: await navn(p1) }), "Siste spørsmål er ikke merket");
  await t.klikk('[data-h="neste"]', 600);

  // ---------- Next in the chair; she skips ----------
  await t.vent(`document.querySelector('[data-h="sett"]')`);
  s = await sp();
  t.sjekk(s.na === 1 && (await t.tekst("#skjerm h1")).trim() === (await navn(p2)) && s.poeng[p1] === 2 && s.besvart === 3, `Nestemann kom ikke i stolen (${JSON.stringify(s.poeng)})`);
  t.sjekk(await har(".hp-forrige", "{navn} fikk {stjerner}.", { navn: await navn(p1), stjerner: await tr("{n} stjernesvar", { n: 2 }) }), "Stolskjermen sier ikke hvor mange stjerner forrige fikk");
  await t.bilde("neste-i-stolen");
  await pause();
  await t.klikk('[data-h="sta-over"]', 500);
  await t.vent(`document.querySelector('[data-h="sett"]')`);
  s = await sp();
  t.sjekk(s.na === 2 && s.poeng[p2] === 0 && (await t.tekst("#skjerm h1")).trim() === (await navn(p3)), "«Stå over» ga ikke stolen til nestemann");

  // ---------- The last one, then Kåringen ----------
  await pause();
  await t.klikk('[data-h="sett"]');
  for (let n = 0; n < 3; n++) {
    await sporsmal();
    if (n === 2) {
      t.sjekk(await har('[data-h="neste"]', "Til kåringen"), "Siste knapp skal gå til kåringen");
      await t.klikk('[data-h="stjerne"]');
    }
    await t.klikk('[data-h="neste"]', 700);
  }
  await t.vent("document.querySelector('.pall') || document.querySelector('.poengliste')");
  await enH1("kåringen");
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.skjerm === "slutt", "Spillet ble ikke ferdig");
  t.sjekk(await har("#skjerm h1", "{navn} vinner!|{navn} vinner!", { navn: await navn(p1), n: 1 }), `Feil vinner: ${await t.tekst("#skjerm h1")}`);
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen mangler «Del resultatet»");
  t.sjekk((await kveld()) === 1, "«Kveldens gjeng» fikk ikke spillet nøyaktig én gang");
  t.sjekk(!(await merker()).includes("hovedpersonen-alle"), "Klistremerket ble gitt selv om noen sto over");
  await t.bilde("kaaringen", true);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk((await kveld()) === 1, "Omlasting på kåringen registrerte spillet en gang til");
  t.sjekk(await t.finnes(".hp-sist"), "Hjem mangler «sist»-linja");
  if (t.norsk) t.sjekk(/Sist: 2 i stolen, 6 spørsmål og 3 stjerner/.test(await t.tekst(".hp-sist")), `«Sist»-linja: ${await t.tekst(".hp-sist")}`);
  await t.bilde("hjem-sist");

  // ---------- Without stars: two players, everyone in the chair ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent(`document.querySelector('[data-h="stjerner"]')`);
  await t.klikk('[data-h="stjerner"]');
  t.sjekk(!(await t.tilstand()).oppsett.stjerner, "Stjernene ble ikke skrudd av");
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="sett"]')`);
  s = await sp();
  t.sjekk(s.antall === 2 && !s.stjerner, "Spillet uten stjerner startet ikke med to");
  t.sjekk(await har(".hp-leser", "{navn} spør.", { navn: await navn(s.rekke[1]) }), "Med to spillere skal den andre spørre");
  for (let spiller = 0; spiller < 2; spiller++) {
    await pause();
    await t.klikk('[data-h="sett"]');
    for (let n = 0; n < 3; n++) {
      await sporsmal();
      t.sjekk(!(await t.finnes('[data-h="stjerne"]')), "Stjerneknappen vises uten stjerner");
      await t.klikk('[data-h="neste"]', 700);
    }
    if (spiller === 0) await t.vent(`document.querySelector('[data-h="sett"]')`);
  }
  await t.vent(`document.querySelector('[data-h="igjen"]')`);
  await enH1("slutt uten stjerner");
  t.sjekk(!(await t.finnes(".pall")) && !(await t.finnes(".poengliste")), "Uten stjerner skal det ikke være pall eller poeng");
  t.sjekk(await har("#skjerm h1", "Alle har vært hovedperson!"), "Avslutningen uten stjerner har feil overskrift");
  t.sjekk((await kveld()) === 1, "Et spill uten stjerner skal ikke inn i «Kveldens gjeng»");
  await t.sov(1800);
  t.sjekk((await merker()).includes("hovedpersonen-alle"), "Klistremerket «Alle i stolen» ble ikke gitt");
  await t.bilde("slutt-uten-stjerner");

  // ---------- «Avslutt» with stars goes to Kåringen ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent(`document.querySelector('[data-h="stjerner"]')`);
  await t.klikk('[data-h="stjerner"]');
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="sett"]')`);
  await pause();
  await t.klikk('[data-h="avslutt"]');
  await t.vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"]')`);
  t.sjekk(!t.norsk || ((await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre" && /kåringen/.test(await t.tekst("#ark"))), "Arket skal si at «Avslutt» går til kåringen, og ha «Spill videre»");
  await t.bilde("avslutt-ark");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(`document.querySelector('[data-h="igjen"]')`);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.skjerm === "slutt", "«Avslutt» med stjerner gikk ikke til kåringen");
  t.sjekk(await har("#skjerm h1", "Ingen stjerner denne gangen"), "Kåringen uten stjerner har feil overskrift");
  await t.bilde("slutt-tidlig");

  // ---------- The teen pack («Ungdom» 13–16): last, not chosen by default, not 18+ ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  const ungdom = await t.js(`(() => { const p = window.RUSJ_DATA.sporsmal.pakker; const u = p[p.length - 1]; return { id: u.id, navn: u.navn, antall: u.kort.length, fra: p.slice(0, -1).reduce((n, x) => n + x.kort.length, 0), kort: u.kort }; })()`);
  t.sjekk(ungdom.id === "ungdom" && ungdom.antall >= 55, `Ungdomspakken skal stå sist i dataene, med rundt 60 spørsmål (${ungdom.id}: ${ungdom.antall})`);
  const flis = await t.tekst('[data-h="pakke"][data-v="ungdom"]');
  t.sjekk(/13–16/.test(flis) && !/18\+/.test(flis) && flis.includes(ungdom.navn), `Ungdomsflisa skal si navnet og 13–16, ikke 18+ («${flis.replace(/\s+/g, " ")}»)`);
  await t.klikk('[data-h="pakke"][data-v="familie"]');
  await t.klikk('[data-h="pakke"][data-v="venner"]');
  await t.klikk('[data-h="pakke"][data-v="ungdom"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.join() === "ungdom", `Bare ungdomspakken skal være valgt (${(await t.tilstand()).oppsett.pakker})`);
  await t.bilde("ungdom-oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="sett"]')`);
  await pause();
  await t.klikk('[data-h="sett"]');
  await sporsmal();
  s = await sp();
  t.sjekk(s.kort >= ungdom.fra && s.kort < ungdom.fra + ungdom.antall, `Spørsmålet kom ikke fra ungdomspakken (nr. ${s.kort})`);
  t.sjekk((await t.tekst(".storkort-etikett")).toLocaleLowerCase().includes(ungdom.navn.toLocaleLowerCase()), `Kortet viser ikke pakkenavnet («${await t.tekst(".storkort-etikett")}»)`);
  t.sjekk((await t.tekst(".storkort-tekst")).includes(ungdom.kort[s.kort - ungdom.fra]), "Kortet viser ikke spørsmålet fra ungdomspakken");
  t.sjekk(await t.friForDokk(".storkort"), "Kortet havner bak knappene (ungdomspakken)");
  await t.bilde("ungdom-sporsmal");
  await t.klikk('[data-h="stjerne"]');
  await pause();
  await t.klikk('[data-h="neste"]', 700);
  await sporsmal();
  s = await sp();
  t.sjekk(s.nr === 2 && s.poeng[s.rekke[0]] === 1 && s.kort >= ungdom.fra && s.kort < ungdom.fra + ungdom.antall, `Neste spørsmål skal også komme fra ungdomspakken, og stjerna skal telle (${s.kort}, ${s.poeng})`);
}
