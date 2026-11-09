// Mimen: everyone against everyone with three players (guess, pass, reload in the middle of a
// turn, run out of time, a shared win), then a quick team game ended early.
const S = "JSON.parse(localStorage.getItem('rusj.mimen.v1'))";
// An element must be fully visible above the dock (short phones), measured from the top.
const overDokk = (sel) =>
  `(() => { window.scrollTo(0, 0); const e = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); const d = document.querySelector('#skjerm .dokk').getBoundingClientRect(); return e.bottom <= d.top + 20; })()`;

// From the pass-the-phone screen: read the task (hold the card) and start miming.
async function mim(t, bilde) {
  await t.klikk('[data-h="klar"]');
  await t.vent("document.querySelector('.mappe')");
  t.sjekk(await t.finnes('[data-h="start-mim"]:disabled'), "Start skal være låst til oppgaven er sett");
  const slipp = await t.hold(".mappe", 650);
  if (bilde) await t.bilde(bilde);
  await slipp();
  await t.vent("!document.querySelector('[data-h=\"start-mim\"]').disabled");
  await t.klikk('[data-h="start-mim"]', 50);
  await t.vent("document.querySelector('#mi-tid')", 8000);
  await t.sov(400);
}

export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  t.sjekk(/Hvordan spiller dere\?/.test(await t.tekst("#skjerm")), "Oppsettet mangler overskriften over spillemåtene");
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="kat"][data-v="barn"]');
  let s = await t.tilstand();
  t.sjekk(Array.isArray(s.oppsett.kat) && !s.oppsett.kat.includes("barn"), "Barn-kategorien ble ikke valgt bort");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Testspiller A skal mime først");
  await t.bilde("gi");

  // Turn 1: A mimes. Swap the task once, then read it and start.
  await t.klikk('[data-h="klar"]');
  t.sjekk(await t.js(overDokk(".mappe-finger")), "«Hold fingeren på kortet for å se» skjules bak knappene nederst");
  const slipp = await t.hold(".mappe", 650);
  await slipp();
  const forste = (await t.tilstand()).spill.oppgave.t;
  await t.klikk('[data-h="bytt"]');
  s = await t.tilstand();
  t.sjekk(s.spill.oppgave.t !== forste && s.spill.bytt === 1, "«Bytt» ga ikke en ny oppgave");
  t.sjekk(s.spill.oppgave.k !== "barn", "En oppgave fra en bortvalgt kategori dukket opp");
  const slipp2 = await t.hold(".mappe", 650);
  await t.bilde("oppgave");
  await slipp2();
  await t.klikk('[data-h="start-mim"]', 50);
  await t.vent("document.querySelector('#mi-tid')", 8000);
  await t.sov(1300);
  await t.bilde("mim");
  t.sjekk(/Testspiller A\s+mimer/.test(await t.tekst(".mi-mimer")), "Mimeskjermen viser ikke hvem som mimer");
  t.sjekk(await t.js(overDokk(".mi-titt")), "Klokka og titte-kortet skjules bak knappene nederst");
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  t.sjekk((await t.antall('[data-h="gjetter"]')) === 2, "Mimeren skal ikke kunne velges som gjetter");
  await t.bilde("hvem");
  // Undo: back to miming, then right for real
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  await t.klikk('[data-h="riktig"]');
  // Wrong guesser picked: «Angre» on the answer takes the points back and asks again
  await t.klikk('[data-h="gjetter"][data-v="2"]');
  await t.vent("document.querySelector('.mi-fasit')");
  await t.klikk('[data-h="angre-svar"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  t.sjekk((await t.tilstand()).spill.poeng.join(",") === "0,0,0", "«Angre» tok ikke tilbake poengene");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  await t.vent("document.querySelector('.mi-fasit')");
  await t.bilde("svar", true);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "1,1,0", `Gjetter og mimer skulle få ett poeng hver, fikk ${s.spill.poeng.join(",")}`);

  // Turn 2: B mimes and passes (confirmed in a sheet)
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Testspiller B skal mime nå");
  // Going back during the countdown must not start the clock by itself
  await t.klikk('[data-h="klar"]');
  const slippB = await t.hold(".mappe", 650);
  await slippB();
  await t.vent("!document.querySelector('[data-h=\"start-mim\"]').disabled");
  await t.klikk('[data-h="start-mim"]', 300);
  await t.klikk("#tilbake", 100);
  await t.sov(3600);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gi" && !(await t.finnes("#mi-tid")), "Klokka startet av seg selv etter «tilbake» under nedtellingen");
  await mim(t);
  await t.klikk('[data-h="pass"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.mi-fasit')");
  await t.bilde("svar-pass");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "1,1,0", "Pass skal ikke gi poeng");

  // Turn 3: C mimes. A reload on the secret card goes back to «Gi mobilen til …» first.
  await t.klikk('[data-h="neste"]');
  await t.klikk('[data-h="klar"]');
  await t.vent("document.querySelector('.mappe')");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gi" && /Testspiller C/.test(await t.tekst("#skjerm h1")), "Omlasting på det hemmelige kortet skal gå tilbake til «Gi mobilen til»");
  // Reload in the middle of miming: the turn comes back paused.
  await mim(t);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "mim", "Mimingen ble ikke gjenopptatt etter omlasting");
  t.sjekk(await t.finnes('[data-h="fortsett-mim"]'), "Mimingen står ikke på pause etter omlasting");
  await t.bilde("mim-pause");
  await t.klikk('[data-h="fortsett-mim"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  // Peek at the task again while miming
  const slipp3 = await t.hold(".mi-titt .mappe", 600);
  await t.bilde("titt");
  await slipp3();
  // The clock runs out
  await t.js("Rusj.timer('mi-tid').leggTil(-500)");
  await t.vent("document.querySelector('.mi-fasit')");
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
  await t.vent("document.querySelector('.mi-fasit')");
  await t.klikk('[data-h="slutt"]');
  await t.vent("document.querySelector('.banner')");
  await t.bilde("slutt", true);
  t.sjekk(/^Testspiller A og Testspiller B vinner!$/.test((await t.tekst("#skjerm h1")).trim()), `Delt seier vises ikke riktig: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".pall .pall-plass.p1")) === 2, "Pallen skal vise to på delt førsteplass");
  t.sjekk(await t.finnes(".flere-spill") && await t.finnes('.dokk a.lenke[href="/"]'), "Kåringen mangler andre spill eller «Alle spill»");

  // Team game: two teams, one correct turn, then end early
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  t.sjekk(!(await t.finnes("#spillerboks")), "Lag mot lag skal ikke vise spillerlista");
  await t.bilde("oppsett-lag", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Lag Rosa/.test(await t.tekst("#skjerm h1")), "Lag Rosa skal mime først");
  await t.bilde("gi-lag");
  await mim(t);
  // A «Riktig!» by mistake can be undone from the answer screen
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('.mi-fasit')");
  await t.klikk('[data-h="angre-svar"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,0" && s.spill.logg.length === 0, `«Angre» tok ikke tilbake poenget: ${s.spill.poeng.join(",")}`);
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('.mi-fasit')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "1,0", `Lag Rosa skulle få ett poeng, fikk ${s.spill.poeng.join(",")}`);
  t.sjekk((await t.antall(".poengliste .mi-lagfigur")) === 2, "Poenglista viser ikke lagfigurene");
  await t.bilde("svar-lag");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  t.sjekk(await t.finnes(".poengliste") && !(await t.finnes(".pall")), "Med bare ett lag på poeng skal det være poengliste, men ingen pall");
  t.sjekk(/Lag Rosa vinner!/.test(await t.tekst("#skjerm h1")), "Lag Rosa vises ikke som vinner");
  await t.bilde("slutt-lag", true);
}
