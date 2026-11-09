// Nynneren: everyone against everyone with three players (a twist on the secret card, swap the
// song, right with undo, a wrong guesser undone, pass, back during the countdown, reload on the
// secret card and mid-humming, peek, time runs out, a shared win, «Kveldens gjeng»), then a quick
// team game with undo, ended early.

// An element must be fully visible above the dock (short phones), measured from the top.
const overDokk = (sel) =>
  `(() => { window.scrollTo(0, 0); const e = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); const d = document.querySelector('#skjerm .dokk').getBoundingClientRect(); return e.bottom <= d.top + 20 || e.right <= d.left || e.left >= d.right; })()`;

// From the pass-the-phone screen: read the song (hold the card) and start humming.
async function nynn(t, bilde) {
  await t.klikk('[data-h="klar"]');
  await t.vent("document.querySelector('.mappe')");
  t.sjekk(await t.finnes('[data-h="start-nynn"]:disabled'), "Start skal være låst til låta er sett");
  const slipp = await t.hold(".mappe", 650);
  if (bilde) await t.bilde(bilde);
  await slipp();
  await t.vent("!document.querySelector('[data-h=\"start-nynn\"]').disabled");
  await t.klikk('[data-h="start-nynn"]', 50);
  await t.vent("document.querySelector('#ny-tid')", 8000);
  await t.sov(400);
}

export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  t.sjekk(/Hvordan spiller dere\?/.test(await t.tekst("#skjerm")), "Oppsettet mangler overskriften over spillemåtene");
  t.sjekk((await t.antall('[data-h="kat"]:not([data-v="*"])')) === 7, "Det skal være sju kategorier");
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="kat"][data-v="barn"]');
  await t.klikk('[data-h="vrier"]');
  await t.klikk('[data-h="lala"]');
  let s = await t.tilstand();
  t.sjekk(Array.isArray(s.oppsett.kat) && !s.oppsett.kat.includes("barn"), "Barnesanger ble ikke valgt bort");
  t.sjekk(s.oppsett.vrier && s.oppsett.lala, "Vrier og la-la ble ikke skrudd på");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Testspiller A skal nynne først");
  await t.bilde("gi");

  // Turn 1: A hums. A twist is shown on the card; swap the song once, then read it and start.
  await t.js("Rusj.S.spill.vri = 1; Rusj.lagre()");
  await t.klikk('[data-h="klar"]');
  t.sjekk(await t.js(overDokk(".mappe-finger")), "«Hold fingeren på kortet for å se» skjules bak knappene nederst");
  const slipp = await t.hold(".mappe", 650);
  t.sjekk(/Vri:/.test(await t.tekst(".mappe-bakside")), "Vrien vises ikke på det hemmelige kortet");
  t.sjekk(/La-la er lov/.test(await t.tekst(".mappe-bakside")), "La-la-regelen vises ikke på kortet");
  await slipp();
  const forste = (await t.tilstand()).spill.laat.t;
  await t.klikk('[data-h="bytt"]');
  s = await t.tilstand();
  t.sjekk(s.spill.laat.t !== forste && s.spill.bytt === 1, "«Bytt» ga ikke en ny låt");
  t.sjekk(s.spill.laat.k !== "barn", "En låt fra en bortvalgt kategori dukket opp");
  const slipp2 = await t.hold(".mappe", 650);
  await t.bilde("laat");
  await slipp2();
  await t.klikk('[data-h="start-nynn"]', 50);
  await t.vent("document.querySelector('#ny-tid')", 8000);
  await t.sov(1300);
  await t.bilde("nynn");
  t.sjekk(/Testspiller A\s+nynner/.test(await t.tekst(".ny-nynner")), "Nynneskjermen viser ikke hvem som nynner");
  t.sjekk(/robot/i.test(await t.tekst(".ny-skilt")), "Vrien vises ikke mens man nynner");
  t.sjekk(await t.js(overDokk(".ny-skilt")), "Klokka skjules bak knappene nederst");
  t.sjekk(!(await t.finnes(".ny-midt .mappe")), "Svaret skal ikke ligge i et stort kort midt på skjermen mens det nynnes");
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  t.sjekk((await t.antall('[data-h="gjetter"]')) === 2, "Nynneren skal ikke kunne velges som gjetter");
  await t.bilde("hvem");
  // Undo: back to humming, then right for real
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  await t.klikk('[data-h="riktig"]');
  // Wrong guesser picked: «Angre» on the answer takes the points back and asks again
  await t.klikk('[data-h="gjetter"][data-v="2"]');
  await t.vent("document.querySelector('.ny-fasit')");
  await t.klikk('[data-h="angre-svar"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  t.sjekk((await t.tilstand()).spill.poeng.join(",") === "0,0,0", "«Angre» tok ikke tilbake poengene");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  await t.vent("document.querySelector('.ny-fasit')");
  await t.sov(800);
  await t.bilde("svar", true);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "1,1,0", `Gjetter og nynner skulle få ett poeng hver, fikk ${s.spill.poeng.join(",")}`);
  t.sjekk(await t.finnes(".ny-allsang"), "Allsang-bonusen vises ikke ved riktig svar");

  // Turn 2: B hums. Going back during the countdown must not start the clock by itself; then pass.
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Testspiller B skal nynne nå");
  await t.klikk('[data-h="klar"]');
  const slippB = await t.hold(".mappe", 650);
  await slippB();
  await t.vent("!document.querySelector('[data-h=\"start-nynn\"]').disabled");
  await t.klikk('[data-h="start-nynn"]', 300);
  await t.klikk("#tilbake", 100);
  await t.sov(3600);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gi" && !(await t.finnes("#ny-tid")), "Klokka startet av seg selv etter «tilbake» under nedtellingen");
  await nynn(t);
  await t.klikk('[data-h="pass"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.ny-fasit')");
  await t.bilde("svar-pass");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "1,1,0", "Pass skal ikke gi poeng");

  // Turn 3: C hums. A reload on the secret card goes back to «Gi mobilen til …» first.
  await t.klikk('[data-h="neste"]');
  await t.klikk('[data-h="klar"]');
  await t.vent("document.querySelector('.mappe')");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gi" && /Testspiller C/.test(await t.tekst("#skjerm h1")), "Omlasting på det hemmelige kortet skal gå tilbake til «Gi mobilen til»");
  // Reload in the middle of humming: the turn comes back paused.
  await nynn(t);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "nynn", "Nynningen ble ikke gjenopptatt etter omlasting");
  t.sjekk(await t.finnes('[data-h="fortsett-nynn"]'), "Nynningen står ikke på pause etter omlasting");
  await t.bilde("nynn-pause");
  await t.klikk('[data-h="fortsett-nynn"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  // Half the time gone: the guessers get a hint
  await t.js("Rusj.timer('ny-tid').leggTil(-(Rusj.S.spill.tid / 2 + 1))");
  await t.vent("document.querySelector('.ny-hint:not([hidden])')", 4000);
  t.sjekk(/ord/.test(await t.tekst(".ny-hint")), "Hintet etter halve tiden viser ikke antall ord");
  // Peek at the song again (a small button, then a hold card in a sheet)
  await t.klikk('[data-h="titt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) .mappe')");
  const slipp3 = await t.hold("#ark .mappe", 600);
  await t.bilde("titt");
  t.sjekk((await t.tekst("#ark .mappe-bakside")).trim().length > 0, "Titte-kortet viser ikke låta");
  await slipp3();
  await t.klikk('#ark [data-h="lukk-ark"]');
  // The clock runs out
  await t.js("Rusj.timer('ny-tid').leggTil(-500)");
  await t.vent("document.querySelector('.ny-fasit')");
  t.sjekk(/Tiden er ute/i.test(await t.tekst("#skjerm h1")), "Mangler «Tiden er ute»");
  t.sjekk(await t.finnes('[data-h="slutt"]'), "Siste tur skal gå videre til kåringen");

  // Leave and come back («Nytt spill» asks first), then the result: A and B share the win
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.tilstand()).spill.logg.length === 3, "Spillet forsvant selv om «Avbryt» ble valgt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ny-fasit')");
  await t.klikk('[data-h="slutt"]');
  await t.vent("document.querySelector('.banner')");
  await t.sov(300);
  await t.bilde("slutt", true);
  t.sjekk(/^Testspiller A og Testspiller B vinner!$/.test((await t.tekst("#skjerm h1")).trim()), `Delt seier vises ikke riktig: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".pall .pall-plass.p1")) === 2, "Pallen skal vise to på delt førsteplass");
  t.sjekk((await t.finnes(".flere-spill")) && (await t.finnes('.dokk a.lenke[href="/"]')), "Kåringen mangler andre spill eller «Alle spill»");
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === "kåringen", "Sluttskjermen heter ikke «Kåringen»");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "nynneren"), "Resultatet ble ikke lagt i «Kveldens gjeng»");
  await t.sov(2000);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');

  // Team game: two teams, one correct turn (undone once), then end early
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  t.sjekk(!(await t.finnes("#spillerboks")), "Lag mot lag skal ikke vise spillerlista");
  await t.bilde("oppsett-lag", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Lag Rosa/.test(await t.tekst("#skjerm h1")), "Lag Rosa skal nynne først");
  await t.bilde("gi-lag");
  await nynn(t);
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('.ny-fasit')");
  await t.klikk('[data-h="angre-svar"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,0" && s.spill.logg.length === 0, `«Angre» tok ikke tilbake poenget: ${s.spill.poeng.join(",")}`);
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('.ny-fasit')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "1,0", `Lag Rosa skulle få ett poeng, fikk ${s.spill.poeng.join(",")}`);
  t.sjekk((await t.antall(".poengliste .ny-lagfigur")) === 2, "Poenglista viser ikke lagfigurene");
  await t.bilde("svar-lag");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  t.sjekk((await t.finnes(".poengliste")) && !(await t.finnes(".pall")), "Med bare ett lag på poeng skal det være poengliste, men ingen pall");
  t.sjekk(/Lag Rosa vinner!/.test(await t.tekst("#skjerm h1")), "Lag Rosa vises ikke som vinner");
  await t.bilde("slutt-lag", true);
}
