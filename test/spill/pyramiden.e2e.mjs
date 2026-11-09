// Pyramiden (18+): the age gate («Nei» leads away, «Ja» opens); four players each hold to see their four
// cards (once, «Ferdig» only after looking); the pyramid is turned card by card; claims are checked
// against the hidden hands: accepted (the receiver takes the row's sips), a true claim called a bluff
// (the caller takes two extra), a real bluff caught (the bluffer takes two extra); «Angre» takes back a
// hand-out; the log shows who gave what; water breaks between rows; reload and back + «Fortsett» keep
// the game; the memory finale; the crowning (most sips handed out wins, the bluff master is revealed);
// small screens keep the question above the buttons.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const verdi = (k) => (k % 13) + 1;
const rad = (n) => (n >= 14 ? 5 : n >= 12 ? 4 : n >= 9 ? 3 : n >= 5 ? 2 : 1);

export default async function (t) {
  const pause = () => t.sov(420);
  const tilstand = () => t.tilstand();
  const lukkTips = async () => {
    await t.sov(2100);
    if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  };
  const overDokk = (velger) =>
    t.js(`(() => { const d = document.querySelector("#skjerm .dokk").getBoundingClientRect(); const e = document.querySelector(${JSON.stringify(velger)}).getBoundingClientRect(); return e.bottom <= d.top + 2; })()`);

  // 1. Age gate
  await t.start({ navn: NAVN });
  t.sjekk(/18/.test(await t.tekst("#skjerm h1")), "18-årsgrensen vises ikke før spillet");
  await t.klikk('[data-h="alder-nei"]');
  await t.vent("location.pathname === '/'", 8000);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="alder-ja"]'), "Spillet åpnet uten 18-årsbekreftelse etter «Nei»");
  await t.klikk('[data-h="alder-ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Pyramiden", "«Ja» åpnet ikke spillet");
  await t.bilde("hjem");

  // 2. Setup: four players, the memory finale on
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4, "Oppsettet viser ikke de fire spillerne");
  t.sjekk(await t.finnes('[data-h="finale"][aria-pressed="true"]'), "Hukommelsesfinalen skal være på som standard");
  t.sjekk(/stå over/.test(await t.tekst("#skjerm")), "Oppsettet sier ikke at alle kan stå over");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');

  // 3. Dealing: hold to see, «Ferdig» only after looking
  for (let i = 0; i < 4; i++) {
    await t.vent("document.querySelector('.mappe')");
    t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[i]), `Mobilen skal gis til ${NAVN[i]}`);
    t.sjekk(await t.js('document.querySelector(\'[data-h="vist"]\').disabled'), "«Ferdig» kan trykkes før kortene er sett");
    if (i === 0) await t.bilde("gi-mobilen");
    const slipp = await t.hold(".mappe", 800);
    t.sjekk((await t.js(`[...document.querySelectorAll(".mappe.apen .mappe-bakside .sk-kort")].filter((el) => el.offsetParent).length`)) === 4, "Kortene vises ikke mens man holder");
    if (i === 0) await t.bilde("ser-kortene");
    await slipp();
    t.sjekk((await t.antall(".mappe-bakside .sk-kort")) === 0, "Kortene ble ikke skjult igjen");
    t.sjekk((await tilstand()).spill.del.sett === true, "Det ble ikke registrert at kortene ble sett");
    if (i === 1) {
      await t.lastSide(t.side, "document.querySelector('.mappe')");
      t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[1]), "Omlasting midt i utdelingen hoppet til feil spiller");
    }
    await pause();
    await t.klikk('[data-h="vist"]');
  }

  // 4. The pyramid
  await t.vent("document.querySelector('.py-pyramide')");
  t.sjekk((await t.antall(".py-pyramide .sk-kort")) === 15, "Pyramiden skal ha 15 kort");
  t.sjekk((await t.antall(".py-pyramide .sk-kort.sk-opp")) === 0, "Ingen kort skal være snudd før start");
  await t.bilde("pyramide");
  let s = await tilstand();
  const hender = s.spill.hender;
  const pyr = s.spill.pyramide;
  const har = (i, k) => hender[i].some((x) => verdi(x) === verdi(k));
  const kravet = async (fra, til, valg) => {
    await t.klikk('[data-h="krav"]');
    await t.vent("document.querySelector('[data-h=\"fra\"]')");
    await pause();
    await t.klikk(`[data-h="fra"][data-v="${fra}"]`);
    await t.vent("document.querySelector('[data-h=\"til\"]')");
    t.sjekk(!(await t.finnes(`[data-h="til"][data-v="${fra}"]`)), "Man kan gi slurker til seg selv");
    await pause();
    await t.klikk(`[data-h="til"][data-v="${til}"]`);
    await t.vent(`document.querySelector('[data-h="${valg}"]')`);
    await pause();
    await t.klikk(`[data-h="${valg}"]`);
    await t.vent("document.querySelector('.py-resultat .stempel')", 6000);
    await t.sov(400);
  };

  let godtatt = false;
  let sant = false;
  let bloff = false;
  let angret = false;
  for (let n = 0; n < 15; n++) {
    await pause();
    await t.klikk('[data-h="snu"]');
    s = await tilstand();
    t.sjekk(s.spill.snudd === n + 1, "Kortet ble ikke snudd");
    const k = pyr[n];
    t.sjekk((await t.antall(".py-pyramide .sk-kort.sk-opp")) === n + 1, "Feil antall snudde kort");
    if (n === 0) {
      await t.sov(400);
      await t.bilde("forste-kort");
    }
    if (n === 8) t.sjekk(await t.finnes(".py-vann"), "Ingen vannpause før rad 3");
    const eiere = [0, 1, 2, 3].filter((i) => har(i, k));
    const ikkeEiere = [0, 1, 2, 3].filter((i) => !har(i, k));
    // Accepted claim (true or not) – the receiver takes the row's sips
    if (!godtatt && eiere.length) {
      const fra = eiere[0];
      const til = (fra + 1) % 4;
      await kravet(fra, til, "godta");
      await t.bilde("godtatt");
      s = await tilstand();
      const x = s.spill.logg[s.spill.logg.length - 1];
      t.sjekk(x.sant === true && x.taker === til && x.slurker === rad(n) && !x.ropte, "Et godtatt krav ble ført feil");
      // Undo the hand-out, then do it again
      if (!angret) {
        angret = true;
        await t.klikk('[data-h="angre"]');
        await t.vent("document.querySelector('.py-pyramide')");
        t.sjekk((await tilstand()).spill.logg.length === s.spill.logg.length - 1, "«Angre» tok ikke tilbake utdelingen");
        await pause();
        await kravet(fra, til, "godta");
      }
      await t.klikk('[data-h="tilpyramiden"]');
      await t.vent("document.querySelector('.py-pyramide')");
      godtatt = true;
      continue;
    }
    // A true claim called a bluff: the caller takes two extra
    if (godtatt && !sant && eiere.length) {
      const fra = eiere[0];
      const til = (fra + 2) % 4;
      await kravet(fra, til, "bloff");
      await t.bilde("sant");
      s = await tilstand();
      const x = s.spill.logg[s.spill.logg.length - 1];
      t.sjekk(x.sant && x.ropte && x.taker === til && x.slurker === Math.min(5, rad(n) + 2), "Et ekte krav som ble kalt bløff, ble ført feil");
      t.sjekk((await t.antall(".py-bevis .sk-kort")) >= 1, "Kortet ble ikke vist fram");
      await t.klikk('[data-h="tilpyramiden"]');
      await t.vent("document.querySelector('.py-pyramide')");
      sant = true;
      continue;
    }
    // A real bluff caught: the bluffer takes two extra
    if (sant && !bloff && ikkeEiere.length) {
      const fra = ikkeEiere[0];
      const til = (fra + 3) % 4;
      await kravet(fra, til, "bloff");
      await t.bilde("bloff");
      s = await tilstand();
      const x = s.spill.logg[s.spill.logg.length - 1];
      t.sjekk(!x.sant && x.ropte && x.taker === fra && x.slurker === Math.min(5, rad(n) + 2), "En avslørt bløff ble ført feil");
      t.sjekk(/Bløff/i.test(await t.tekst(".py-resultat")), "Bløffen ble ikke avslørt");
      await t.klikk('[data-h="tilpyramiden"]');
      await t.vent("document.querySelector('.py-pyramide')");
      bloff = true;
      // An uncaught bluff later, for the bluff master award
      continue;
    }
    if (bloff && ikkeEiere.length && n >= 10 && n <= 12) {
      const fra = ikkeEiere[0];
      await kravet(fra, (fra + 1) % 4, "godta");
      await t.klikk('[data-h="tilpyramiden"]');
      await t.vent("document.querySelector('.py-pyramide')");
    }
    if (n === 6) {
      // Reload and back + continue in the middle
      await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
      t.sjekk((await tilstand()).spill.snudd === 7, "Pyramiden ble glemt ved omlasting");
      await t.klikk("#tilbake");
      t.sjekk(await t.finnes('.hjem-knapper [data-h="fortsett"]'), "Mangler «Fortsett» mens spillet pågår");
      await t.klikk('[data-h="fortsett"]');
      await t.vent("document.querySelector('.py-pyramide')");
    }
  }
  t.sjekk(godtatt && sant && bloff, "Testen fikk ikke prøvd alle typer krav");
  await t.bilde("hele-pyramiden");
  await t.klikk('[data-h="logg"]');
  t.sjekk((await t.antall("#ark .py-logg li li")) === (await tilstand()).spill.logg.length, "«Hvem ga hva» viser ikke alle utdelingene");
  await t.bilde("logg");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // 5. The memory finale
  await t.klikk('[data-h="ferdig"]');
  for (let i = 0; i < 4; i++) {
    await t.vent("document.querySelector('[data-h=\"visfasit\"]')");
    t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[i]), "Feil spiller i finalen");
    t.sjekk((await t.antall(".py-finale-hand .sk-kort.sk-opp")) === 0, "Kortene vises før de skal snus");
    await pause();
    await t.klikk('[data-h="visfasit"]');
    await t.vent("document.querySelector('[data-h=\"husket\"]')");
    if (i === 0) {
      await t.sov(500);
      await t.bilde("finale");
    }
    await pause();
    await t.klikk(`[data-h="husket"][data-v="${4 - i}"]`);
    if (i === 1) {
      await t.klikk('[data-h="angrefinale"]');
      t.sjekk((await tilstand()).spill.fin.husket[1] == null, "«Angre» i finalen virket ikke");
      await pause();
      await t.klikk('[data-h="husket"][data-v="3"]');
    }
    if (i === 0) await t.bilde("finale-alle-fire");
    await pause();
    await t.klikk('[data-h="nestefinale"]');
  }

  // 6. The crowning
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(700);
  s = await tilstand();
  // Bluff points: 1 per bluff nobody caught, 1 per bluff caught. No sip counts per person anywhere.
  const delt = [0, 0, 0, 0];
  for (const x of s.spill.logg) {
    if (!x.sant && !x.ropte) delt[x.fra] += 1;
    if (!x.sant && x.ropte) delt[x.til] += 1;
  }
  const best = Math.max(...delt);
  const h1 = (await t.tekst("#skjerm h1")).trim();
  t.sjekk(best > 0 && NAVN.filter((_, i) => delt[i] === best).every((v) => h1.includes(v)), `Feil vinner: «${h1}» (bløffpoeng ${delt.join("/")})`);
  t.sjekk(/bløffmester/i.test(await t.tekst(".py-priser")), "Kåringen mangler bløffmesteren");
  t.sjekk(!/tok \d+ slurk|delt ut|til sammen/i.test(await t.tekst("#skjerm")), "Kåringen viser slurker per person eller totalt");
  t.sjekk(Math.max(...s.spill.logg.map((x) => x.slurker)) <= 5, "Mer enn 5 slurker på én gang");
  t.sjekk(/elefanthukommelse/i.test(await t.tekst(".py-priser")), "Kåringen mangler hukommelsesprisen");
  t.sjekk(await t.finnes(".py-vann"), "Sluttskjermen mangler vannpåminnelsen");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Mangler «Alle spill»");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "pyramiden"), "Resultatet ble ikke registrert i «Kveldens gjeng»");
  t.sjekk(s._aktiv === false, "Et ferdig spill skal ikke regnes som pågående");
  await t.bilde("kaaring", true);
  await lukkTips();

  // 7. Small screens: the question stays above the buttons; the claim screens fit
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h, navn] of [[320, 568, "320"], [Math.min(375, b0), 560, "375x560"]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    const sp = (await tilstand()).spill;
    Object.assign(sp, { fase: "pyramide", snudd: 12, krav: null, angre: false, talt: false });
    sp.logg = sp.logg.filter((x) => x.kort < 12);
    await t.js(`localStorage.setItem("rusj.pyramiden.v1", ${JSON.stringify(JSON.stringify({ ...(await tilstand()), spill: sp, skjerm: "pyramide", _tid: Date.now() }))})`);
    await t.lastSide(t.side, "document.querySelector('.py-pyramide')");
    await t.sov(300);
    t.sjekk(await overDokk(".py-info h1"), `Spørsmålet skjules bak knappene på ${navn}`);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Siden er for bred på ${navn}`);
    await t.bilde(`pyramide-${navn}`);
    await t.klikk('[data-h="krav"]');
    await t.vent("document.querySelector('[data-h=\"fra\"]')");
    await t.bilde(`hvem-${navn}`);
    await pause();
    await t.klikk('[data-h="fra"][data-v="0"]');
    await pause();
    await t.klikk('[data-h="til"][data-v="1"]');
    await t.vent("document.querySelector('[data-h=\"bloff\"]')");
    t.sjekk(await overDokk(".py-duell"), `Forklaringen av bløff skjules bak knappene på ${navn}`);
    await t.bilde(`svar-${navn}`);
    await t.klikk('[data-h="avbryt"]');
    await t.vent("document.querySelector('.py-pyramide')");
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });

  // 8. Three players work; ten players use two decks
  await t.start({ navn: NAVN.slice(0, 3) });
  await t.klikk('[data-h="alder-ja"]');
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke tre spillere");
  for (let i = 3; i < 10; i++) await t.klikk('[data-h="spiller-legg-til"]', 40);
  t.sjekk(/to kortstokker/.test(await t.tekst("#spillerboks")), "Med ti spillere skal det stå at vi bruker to kortstokker");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.mappe')");
  s = await tilstand();
  t.sjekk(s.spill.doble && s.spill.hender.length === 10 && s.spill.pyramide.length === 15, "Ti spillere fikk ikke kort fra to kortstokker");
}
