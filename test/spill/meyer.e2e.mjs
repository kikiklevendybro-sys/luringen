// Meyer: three people set up and play a whole game — a true value is lifted (the caller loses a
// life), a bluffed Meyer is lifted (the bluffer loses two), a value is believed and beaten, a
// reload while the dice are hidden under the cup keeps them hidden, back + «Fortsett» keeps the
// game, and the last one standing gets «Kåringen» with the podium, the evening's scoreboard and the
// best bluffer on the home screen. Then one person against the phone: its turns play visibly at a
// readable pace and the game reaches «Kåringen».

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const settKast = (a, b) => t.js(`(() => { Rusj.S.spill.kast = [${a}, ${b}]; Rusj.lagre(); })()`);
  const fase = (f) => t.vent(`Rusj.S.spill && Rusj.S.spill.fase === ${JSON.stringify(f)}`, 8000);
  const rist = async () => {
    await t.klikk('[data-h="rist"]', 300);
    await fase("skjult");
    await t.sov(350);
  };
  const si = async (v) => {
    await t.klikk(`[data-h="velg"][data-v="${v}"]`, 250);
    await t.klikk('[data-h="meld"]', 450);
    await fase("svar");
  };
  const loft = async () => {
    await t.klikk('[data-h="loft"]', 400);
    await fase("resultat");
    await t.sov(1300);
  };
  // No die may be drawn anywhere on the page while the dice are under the cup (only the held card shows them).
  const skjulteTerninger = () => t.js(`document.querySelectorAll("#skjerm .my-t").length === 0 && !document.querySelector(".mappe.apen")`);

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem");
  await t.klikk('[data-h="nytt"]', 450);
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  t.sjekk((await t.antall('#spillerboks input[data-navn]')) === 3, "Tre spillere er ikke ført opp");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]', 600);
  await t.vent("Rusj.S.skjerm === 'spill'");
  // Testspiller A starts (the start is random: set it, before anything happens).
  await t.js("(() => { Rusj.S.spill.tur = 0; Rusj.lagre(); Rusj.vis(); })()");
  await t.sov(300);
  let s = await sp();
  t.sjekk(s.fase === "rist" && s.liv.join() === "6,6,6", "Spillet startet ikke med seks liv hver og begeret klart");
  t.sjekk(await t.friForDokk(".my-beger"), "Begeret er skjult bak knappene");
  await t.bilde("rist");

  // ----- Round 1: A rolls 6-4, peeks and says 64 (true); B calls «Løgn!» and loses a life -----
  await rist();
  await settKast(6, 4);
  t.sjekk(await skjulteTerninger(), "Terningene vises før noen holder på kortet");
  t.sjekk(await t.finnes(".my-titt .mappe"), "Mangler kortet man holder for å kikke");
  await t.bilde("skjult");
  const slipp = await t.hold(".my-titt .mappe", 600);
  t.sjekk(await t.finnes(".mappe.apen .my-bak .my-t"), "Kortet viser ikke terningene når man holder");
  t.sjekk(/64/.test(await t.tekst(".mappe.apen .my-bak-verdi")), "Kortet sier ikke 64");
  await t.bilde("kikk");
  await slipp();
  t.sjekk(await skjulteTerninger(), "Terningene vises fortsatt etter at kortet er sluppet");
  t.sjekk((await t.antall('[data-h="velg"]')) === 21, "Første melding: ikke alle 20 verdier + Fellesrunde å velge mellom");
  t.sjekk(!(await t.finnes('[data-h="velg"][data-v="32"]')), "3-2 kan sies som tall selv om Fellesrunde er på");
  await t.klikk('[data-h="velg"][data-v="64"]', 250);
  t.sjekk((t.norsk ? /Si 64/ : /64/).test(await t.tekst('[data-h="meld"]')), "Knappen sier ikke «Si 64»");
  await t.bilde("valgt", true);
  await t.klikk('[data-h="meld"]', 450);
  await fase("svar");
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")) && (!t.norsk || /Gi mobilen til/i.test(await t.tekst(".my-hode .etikett"))), "Svarskjermen sier ikke «Gi mobilen til Testspiller B»");
  t.sjekk(/64/.test(await t.tekst(".my-melding")), "Meldingen 64 vises ikke");
  t.sjekk(await t.friForDokk(".my-melding"), "Meldingen er skjult bak knappene");
  t.sjekk(await skjulteTerninger(), "Terningene vises på svarskjermen");
  await t.bilde("svar");
  await loft();
  s = await sp();
  t.sjekk(s.utfall.sann === true && s.liv.join() === "6,5,6", `Løgn! på en sann melding: feil liv (${s.liv})`);
  t.sjekk(!t.norsk || /Det var sant/.test(await t.tekst("#skjerm h1")), "Resultatet sier ikke «Det var sant!»");
  t.sjekk((await t.antall("#skjerm .my-t")) === 2, "Begeret ble løftet uten at terningene vises");
  await t.bilde("loftet-sant");

  // ----- Round 2: B (the loser) starts, rolls 3-1 and bluffs Meyer; C calls — B loses two -----
  await t.klikk('[data-h="runde"]', 500);
  s = await sp();
  t.sjekk(s.tur === 1 && s.runde === 2, "Taperen begynner ikke neste runde");
  await rist();
  await settKast(3, 1);
  await si("21");
  t.sjekk(await t.finnes('[data-h="godta"]') && !(await t.finnes('[data-h="tro"]')), "Etter Meyer: mangler «Godta Meyer», eller «Tror det» finnes");
  await t.bilde("svar-meyer");
  await loft();
  s = await sp();
  t.sjekk(s.utfall.sann === false && s.utfall.tap === 2 && s.liv.join() === "6,3,6", `Bløffet Meyer: bløfferen skulle mistet to liv (${s.liv})`);
  t.sjekk(!t.norsk || /Bløff/.test(await t.tekst("#skjerm h1")), "Resultatet sier ikke «Bløff!»");
  await t.bilde("loftet-blof");

  // ----- Round 3: B bluffs 33 with 2-2, C believes, rolls — reload while hidden — bluffs 66; A calls -----
  await t.klikk('[data-h="runde"]', 500);
  await rist();
  await settKast(2, 2);
  await si("33");
  await t.klikk('[data-h="tro"]', 450);
  await fase("rist");
  s = await sp();
  t.sjekk(s.tur === 2 && s.kast === null && s.tall[1].hjem === 1, "Den som trodde det, fikk ikke begeret (eller bløffen ble ikke telt)");
  t.sjekk(!t.norsk || /Du må slå/.test(await t.tekst(".my-maal")) && /Par treere/.test(await t.tekst(".my-maal")), "Skjermen sier ikke hva som må slås");
  await rist();
  await settKast(5, 5);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  s = await sp();
  t.sjekk(s.fase === "skjult" && s.kast.join() === "5,5", "Omlasting mistet terningene under begeret");
  t.sjekk(await skjulteTerninger(), "Omlasting viste de skjulte terningene");
  t.sjekk(await t.finnes(".my-titt .mappe"), "Etter omlasting mangler kortet man holder for å kikke");
  t.sjekk(!(await t.finnes('[data-h="velg"][data-v="33"]')) && (await t.finnes('[data-h="velg"][data-v="44"]')), "Etter Par treere kan man si noe som ikke slår det");
  await t.bilde("omlastet-skjult");
  await si("66");
  await loft();
  s = await sp();
  t.sjekk(s.utfall.sann === false && s.liv.join() === "6,3,5" && s.tall[2].avslort === 1, `Bløff av par seksere: feil liv (${s.liv})`);

  // ----- Back and «Fortsett» -----
  await t.klikk("#tilbake", 500);
  t.sjekk(await t.finnes('.hjem-knapper [data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]', 500);
  t.sjekk((await sp()).fase === "resultat", "«Fortsett» kom ikke tilbake til runden");

  // ----- Play it out: fewer lives to save time, then always lift the lowest true-or-not value -----
  await t.js("(() => { Rusj.S.spill.liv = [2, 1, 1]; Rusj.lagre(); Rusj.vis(); })()");
  await t.sov(300);
  let runder = 0;
  while ((await sp()).vinner == null && runder++ < 12) {
    await t.klikk('[data-h="runde"]', 500);
    await rist();
    const forste = await t.js(`Array.from(document.querySelectorAll('[data-h="velg"]')).filter((b) => b.dataset.v !== "F").pop()?.dataset.v || "F"`);
    await si(forste);
    await loft();
  }
  s = await sp();
  t.sjekk(s.vinner != null && s.liv.filter((l) => l > 0).length === 1, "Spillet fikk ingen vinner");
  t.sjekk(await t.finnes('[data-h="kaaring"]'), "Mangler «Til kåringen»");
  await t.bilde("siste-runde");
  await t.klikk('[data-h="kaaring"]', 900);
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk((t.norsk ? /vinner!/ : /!/).test(await t.tekst("#skjerm h1")), "Banneret sier ikke hvem som vant");
  t.sjekk(await t.finnes(".pall"), "Pallen mangler på kåringen");
  t.sjekk((await t.antall(".my-plasser li")) === 3, "Plasseringslista har ikke tre spillere");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((k) => k.id === "meyer" && k.resultat.length === 3), "Kåringen ble ikke registrert i Kveldens gjeng");
  await t.bilde("kaaring", true);
  await t.klikk("#tilbake", 500);
  t.sjekk((!t.norsk || /Beste bløffer/.test(await t.tekst(".my-stat"))) && /Testspiller B/.test(await t.tekst(".my-stat")), "Hjemskjermen viser ikke beste bløffer");
  await t.bilde("hjem-statistikk");

  // ----- The rules sheet has the ranking table -----
  await t.klikk('[data-h="regler"]', 500);
  t.sjekk((await t.antall(".ark .my-rang li")) === 21, "Reglene viser ikke hele rangeringen");
  t.sjekk((t.norsk ? /Meyer/ : /\S/).test(await t.tekst(".ark .my-rang li:first-child")) && /32/.test(await t.tekst(".ark .my-rang li:last-child")), "Rangeringen starter ikke med Meyer eller slutter ikke med 32");
  await t.bilde("regler");
  await t.klikk('[data-h="lukk-ark"]', 400);

  // ----- Against the phone: one person and Robo on «middels» -----
  await t.js("(() => { Rusj.S.antall = 1; Rusj.S.oppsett.roboter = 1; Rusj.S.oppsett.liv = 3; Rusj.S.spill = null; Rusj.lagre(); })()");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.klikk('[data-h="nytt"]', 450);
  t.sjekk(await t.finnes('[data-h="roboter"][data-v="1"][aria-pressed="true"]'), "Oppsettet viser ikke én motspiller fra mobilen");
  await t.bilde("oppsett-mobilen", true);
  await t.klikk('[data-h="start"]', 600);
  await t.vent("Rusj.S.skjerm === 'spill'");
  await t.js("(() => { Rusj.S.spill.tur = 0; Rusj.lagre(); Rusj.vis(); })()");
  await t.sov(300);
  s = await sp();
  t.sjekk(s.antall === 2 && s.mennesker === 1, "Spillet mot mobilen har ikke én person og én robot");
  await rist();
  await settKast(4, 1);
  await si("41");
  // Robo answers — not at once, but after a readable pause.
  await t.sov(500);
  t.sjekk((await sp()).fase === "svar", "Mobilen svarte for fort til at noen kunne lese det");
  t.sjekk(!t.norsk || /tenker/.test(await t.tekst(".my-hint")), "Skjermen sier ikke at mobilen tenker");
  await t.bilde("mobilen-tenker");
  let steg = 0;
  while ((await sp()).vinner == null && steg++ < 80) {
    s = await sp();
    if (s.fase === "rist" && s.tur === 0) await rist();
    else if (s.fase === "skjult" && s.tur === 0) {
      const v = await t.js(`Array.from(document.querySelectorAll('[data-h="velg"]')).filter((b) => b.dataset.v !== "F").pop()?.dataset.v || "F"`);
      await si(v);
    } else if (s.fase === "svar" && s.melding.av === 1) {
      if (steg === 3) await t.bilde("mobilen-sa");
      await t.klikk(s.melding.v === "21" ? '[data-h="loft"]' : steg % 2 ? '[data-h="loft"]' : '[data-h="tro"]', 400);
    } else if (s.fase === "resultat" && s.vinner == null) await t.klikk('[data-h="runde"]', 500);
    else await t.sov(400); // the phone's turn plays by itself
  }
  s = await sp();
  t.sjekk(s.vinner != null, "Spillet mot mobilen ble ikke ferdig");
  await t.sov(1200);
  await t.klikk('[data-h="kaaring"]', 900);
  t.sjekk((t.norsk ? /vinner!/ : /!/).test(await t.tekst("#skjerm h1")), "Kåringen mot mobilen sier ikke hvem som vant");
  await t.bilde("kaaring-mobilen", true);
}
