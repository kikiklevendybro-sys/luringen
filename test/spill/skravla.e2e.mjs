// Skravla: three teams in Tabu mode. Answer with buttons and swipes, undo an answer, reload in the
// middle of a round, let the clock run out, steal the last word, fix a mistake, move the token and
// undo the move, leave and continue (a new game asks first), then play until a team crosses the
// finish line and the final round decides the winner.
const S = "JSON.parse(localStorage.getItem('rusj.skravla.v1'))";
// The screen's heading must be fully visible above the dock (short phones), measured from the top.
const OVER_DOKK = `(() => { window.scrollTo(0, 0); const h = document.querySelector('#skjerm h1').getBoundingClientRect(); const d = document.querySelector('#skjerm .dokk').getBoundingClientRect(); return h.bottom <= d.top + 20; })()`;

// Waits until the round on screen has `antall` correct words.
async function riktige(t, antall) {
  for (let n = 0; n < antall + 5; n++) {
    const s = await t.tilstand();
    const har = s.spill.runde.ord.filter((w) => w.s === 1).length;
    if (har >= antall) return;
    await t.klikk('[data-h="riktig"]', 60);
    await t.vent(`${S}.spill.runde.ord.filter(w => w.s === 1).length > ${har}`);
    await t.vent("document.querySelector('.storkort:not(.ut) .sk-ordet')");
  }
}

// From the track: start a round, get `antall` words right, run out of time, give the last word away.
async function runde(t, antall, siste) {
  await t.klikk('[data-h="start-runde"]', 50);
  await t.vent("document.querySelector('.sk-ordet')", 8000);
  await riktige(t, antall);
  await t.js("Rusj.timer('sk-tid').leggTil(-500)");
  await t.vent("document.querySelector('[data-h=\"siste\"]')");
  await t.klikk(`[data-h="siste"][data-v="${siste}"]`);
  await t.vent("document.querySelector('[data-h=\"flytt\"]')");
  await t.klikk('[data-h="flytt"]');
  await t.vent("document.querySelector('.sk-bane')");
}

export default async function (t) {
  await t.start();
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="lag"][data-v="3"]');
  await t.klikk('[data-h="tid"][data-v="45"]');
  await t.klikk('[data-h="mal"][data-v="20"]');
  await t.klikk('[data-h="modus"][data-v="tabu"]');
  t.sjekk((await t.antall(".sk-lagrad li")) === 3, "Oppsettet viser ikke tre lag");
  t.sjekk(/Hvordan spiller dere\?/.test(await t.tekst("#skjerm")), "Oppsettet mangler overskriften over spillemåtene");

  // Categories live in a sheet: take one away
  await t.klikk('[data-h="kategorier"]');
  await t.klikk('#ark [data-h="kat"][data-v="abstrakt"]');
  await t.bilde("kategorier");
  let s = await t.tilstand();
  t.sjekk(Array.isArray(s.oppsett.kat) && s.oppsett.kat.length === 31 && !s.oppsett.kat.includes("abstrakt"), "Kategorien ble ikke valgt bort");
  await t.klikk('#ark [data-h="kat-ferdig"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sk-bane')");
  t.sjekk((await t.antall(".sk-brikke")) === 3, "Løypa viser ikke tre brikker");
  t.sjekk(/Rosa/.test(await t.tekst("#skjerm h1")), "Lag Rosa skal begynne");
  t.sjekk(/Start runden – Lag Rosa/.test(await t.tekst('[data-h="start-runde"]')), "Startknappen sier ikke hvilket lag som skal forklare");
  t.sjekk(await t.js(OVER_DOKK), "«Lag Rosa: hvem forklarer?» skjules bak knappene nederst");
  await t.bilde("tavla-start");

  // Leaving during the countdown (back, then quickly «Fortsett») must not start the round by itself
  await t.klikk('[data-h="start-runde"]', 300);
  await t.klikk("#tilbake", 100);
  await t.klikk('[data-h="fortsett"]');
  await t.sov(3600);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "tavla" && !s.spill.runde && !(await t.finnes(".sk-ordet")), "Runden startet av seg selv etter tilbake og «Fortsett» under nedtellingen");

  // Round 1 (Lag Rosa): buttons and swipes
  await t.klikk('[data-h="start-runde"]', 50);
  await t.vent("document.querySelector('.sk-ordet')", 8000);
  t.sjekk(await t.finnes(".sk-tabu-ord span"), "Tabu-ordene vises ikke");
  await t.bilde("runde");
  await riktige(t, 3);
  await t.klikk('[data-h="hopp"]', 60);
  await t.vent(`${S}.spill.runde.ord.filter(w => w.s === 0).length === 1`);
  await t.vent("document.querySelector('.storkort:not(.ut) .sk-ordet')");
  await t.sveip(".storkort", 240);
  await t.vent(`${S}.spill.runde.ord.filter(w => w.s === 1).length === 4`);
  await t.vent("document.querySelector('.storkort:not(.ut) .sk-ordet')");
  await t.sveip(".storkort", -240);
  await t.vent(`${S}.spill.runde.ord.filter(w => w.s === 0).length === 2`);
  // «Angre» brings the skipped word back
  const tilbake = (await t.tilstand()).spill.runde.ord.slice(-2)[0].o;
  await t.klikk('[data-h="angre-ord"]');
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord.length === 6 && s.spill.runde.ord[5].s === null && s.spill.runde.ord[5].o === tilbake, "«Angre» hentet ikke tilbake forrige ord");
  t.sjekk((await t.tekst(".sk-ordet")).includes(tilbake), "Ordet som ble angret, vises ikke på kortet");
  await t.klikk('[data-h="hopp"]', 60);
  await t.vent(`${S}.spill.runde.ord.filter(w => w.s === 0).length === 2`);
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord.length === 7, `Ventet sju ord i runden, fikk ${s.spill.runde.ord.length}`);
  t.sjekk(!s.spill.runde.ord.some((w) => w.k === "abstrakt"), "Et ord fra en bortvalgt kategori dukket opp");

  // Reload in the middle of the round: it comes back paused with the word hidden
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "runde", "Runden ble ikke gjenopptatt etter omlasting");
  t.sjekk(await t.finnes('[data-h="fortsett-runde"]'), "Runden står ikke på pause etter omlasting");
  t.sjekk(!(await t.finnes(".sk-ordet")), "Ordet vises mens runden står på pause");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-runde"]');
  await t.vent("document.querySelector('.sk-ordet')");
  await riktige(t, 5);

  // Time's up: the last word is free for all, Lag Gul takes it
  await t.js("Rusj.timer('sk-tid').leggTil(-500)");
  await t.vent("document.querySelector('[data-h=\"siste\"]')");
  await t.bilde("tiden-er-ute");
  await t.klikk('[data-h="siste"][data-v="1"]');
  await t.vent("document.querySelector('.sk-ordliste')");
  // Fix a mistake: the first skipped word was right after all
  const hoppet = await t.js(`${S}.spill.runde.ord.findIndex(w => w.s === 0)`);
  await t.klikk(`[data-h="veksle"][data-v="${hoppet}"]`);
  t.sjekk(/\+6/.test(await t.tekst("#skjerm h1")), `Ventet +6 poeng etter rettingen, fikk «${await t.tekst("#skjerm h1")}»`);
  await t.bilde("sjekk", true);
  await t.klikk('[data-h="flytt"]');
  await t.vent("document.querySelector('.sk-bane')");
  await t.sov(2600); // the tokens hop along the track
  await t.bilde("tavla-flytt");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "6,1,0", `Feil stilling etter runde 1: ${s.spill.poeng.join(",")}`);
  t.sjekk(/Gul/.test(await t.tekst("#skjerm h1")), "Lag Gul skal forklare nå");

  // The move can be undone until the next round starts
  await t.klikk('[data-h="angre-flytt"]');
  await t.vent("document.querySelector('.sk-ordliste')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,0,0" && s.spill.tur === 0 && s.spill.runde, "«Angre» på løypa tok ikke tilbake flyttet");
  await t.klikk('[data-h="flytt"]');
  await t.vent("document.querySelector('.sk-bane')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "6,1,0", `Feil stilling etter nytt flytt: ${s.spill.poeng.join(",")}`);

  // Leave and come back; «Nytt spill» asks before throwing the game away
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.tilstand()).spill.poeng.join(",") === "6,1,0", "Spillet forsvant selv om «Avbryt» ble valgt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.sk-bane')");

  // Lag Gul gets 19 words and reaches the goal (20) → final round for Lag Blå
  await runde(t, 19, -1);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 20 && s.spill.malgang && s.spill.vinner == null, "Lag Gul skulle være i mål uten at spillet er over");
  const sisteRunde = await t.tekst(".sk-neste");
  t.sjekk(/Lag Gul er i mål!/.test(sisteRunde) && /siste runde/i.test(sisteRunde), "Mangler beskjed om siste runde");
  t.sjekk(await t.js(OVER_DOKK), "Beskjeden om siste runde skyver «hvem forklarer?» bak knappene nederst");
  await t.sov(1200);
  await t.bilde("tavla-siste-sjanse");

  // Lag Blå gets two words; the round is complete, Lag Gul wins
  await runde(t, 2, 2);
  s = await t.tilstand();
  t.sjekk(s.spill.vinner === 1, `Lag Gul skulle ha vunnet (vinner: ${s.spill.vinner}, poeng ${s.spill.poeng.join(",")})`);
  await t.vent("document.querySelector('[data-h=\"kar\"]')");
  await t.sov(1200);
  await t.bilde("tavla-vinner");
  await t.klikk('[data-h="kar"]');
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  t.sjekk(/Lag Gul vinner!/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke på kåringen");
  t.sjekk(await t.finnes(".poengliste") && await t.finnes(".flere-spill") && await t.finnes('.dokk a.lenke[href="/"]'), "Kåringen mangler poengliste, andre spill eller «Alle spill»");
  t.sjekk((await t.antall(".poengliste .sk-klump")) === 3, "Poenglista viser ikke lagfigurene");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Ferdig spill skal ikke kunne fortsettes");

  // Play again starts a fresh game with the same settings
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.sk-bane')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,0,0" && s.spill.mal === 20 && s.spill.tabu, "«Spill igjen» startet ikke et nytt spill med samme oppsett");
}
