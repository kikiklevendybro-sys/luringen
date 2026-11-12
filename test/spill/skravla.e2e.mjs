// Skravla: three teams in «Forbudte ord». The mode only draws words with a real list of forbidden
// words and is closed when the chosen categories have too few of them. Answer with buttons and
// swipes, let the opponents press «Forbudt ord!», undo, reload in the middle of a round, let the
// clock run out, steal the last word, fix mistakes in the list (three states), move the token and
// undo the move (the record follows), leave and continue (a new game asks first), play until a team
// crosses the finish line and the final round decides the winner. Then: the evening's scoreboard and
// the statistics get the game exactly once, the result can be shared, the record is on the home
// screen, «Avslutt» is within reach from the pause and from the list after a round, and classic
// play has neither forbidden words nor the button.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en skravla): the texts it looks for are in X.
let S = "JSON.parse(localStorage.getItem('rusj.skravla.v1'))";
let REKORD = "JSON.parse(localStorage.getItem('rusj.skravla.rekord') || '{}')";
const TEKSTER = {
  nb: {
    lag: ["Lag Rosa", "Lag Gul", "Lag Blå"],
    reklame: /reklame/,
    rekord: "rekord",
    oppsett: /Hvordan spiller dere\?/,
    forFa: /har bare \d+ ord her/,
    medListe: 300,
    startRunde: "Start runden – ",
    fortsett: "Fortsett",
    forbudtOrd: /forbudt ord/,
    iMal: (lag) => new RegExp(`${lag} er i mål!`),
    sisteRunde: /siste runde/i,
    tilKaringen: "Til kåringen",
    vinner: (lag) => `${lag} vinner!`,
    nyRekord45: /ny rekord på 45 s/,
    ettForbudt: /1\s*forbudt ord sagt/,
    delt: [/Lag Gul vant med 20 poeng, foran Lag Rosa \(5\) og Lag Blå \(3\)\./, /Beste runde: 19 ord på 45 s – ny rekord!/],
    spillVidere: "Spill videre",
    avslutt: "Avslutt",
    ingenPoeng: /Ingen har fått poeng/,
    lederVinner: /Laget som leder nå, vinner/,
    utenASi: /uten å si ordet/,
  },
  en: {
    lag: ["Team Pink", "Team Yellow", "Team Blue"],
    reklame: /ads/,
    rekord: "record",
    oppsett: /How do you want to play\?/,
    forFa: /only has \d+ words? here/,
    medListe: 100,
    startRunde: "Start the round – ",
    fortsett: "Continue",
    forbudtOrd: /forbidden/,
    iMal: (lag) => new RegExp(`${lag} has reached the finish!`),
    sisteRunde: /last round/i,
    tilKaringen: "To the results",
    vinner: (lag) => `${lag} wins!`,
    nyRekord45: /a new 45 s record/,
    ettForbudt: /1\s*forbidden word said/,
    delt: [/Team Yellow won with 20 points, ahead of Team Pink \(5\) and Team Blue \(3\)\./, /Best round: 19 words in 45 s – a new record!/],
    spillVidere: "Keep playing",
    avslutt: "Quit",
    ingenPoeng: /Nobody has scored/,
    lederVinner: /The team in the lead now wins/,
    utenASi: /without saying the word/,
  },
  da: {
    lag: ["Hold Rosa", "Hold Gul", "Hold Blå"],
    reklame: /reklamer/,
    rekord: "rekord",
    oppsett: /Hvordan vil I spille\?/,
    forFa: /har kun \d+ ord her/,
    medListe: 100,
    startRunde: "Start runden – ",
    fortsett: "Fortsæt",
    forbudtOrd: /forbudt ord/,
    iMal: (lag) => new RegExp(`${lag} er i mål!`),
    sisteRunde: /sidste runde/i,
    tilKaringen: "Til kåringen",
    vinner: (lag) => `${lag} vinder!`,
    nyRekord45: /ny rekord på 45 s/,
    ettForbudt: /1\s*forbudt ord sagt/,
    delt: [/Hold Gul vandt med 20 point foran Hold Rosa \(5\) og Hold Blå \(3\)\./, /Bedste runde: 19 ord på 45 s – ny rekord!/],
    spillVidere: "Spil videre",
    avslutt: "Afslut",
    ingenPoeng: /Ingen har fået point/,
    lederVinner: /Holdet, der fører nu, vinder/,
    utenASi: /uden at sige ordet/,
  },
};
let X = TEKSTER.nb;
// The screen's heading must be fully visible above the dock (short phones), measured from the top.
const OVER_DOKK = `(() => { window.scrollTo(0, 0); const h = document.querySelector('#skjerm h1').getBoundingClientRect(); const d = document.querySelector('#skjerm .dokk').getBoundingClientRect(); return h.right <= d.left + 1 || h.left >= d.right - 1 ? h.bottom <= innerHeight + 1 : h.bottom <= d.top + 20; })()`;
// The list of forbidden words for a word, straight from the data file (lower case), or null.
const LISTE = (ord) =>
  `(() => { const d = window.RUSJ_DATA.forbudt; const k = ${JSON.stringify(ord)}.toLocaleLowerCase("nb"); for (const g of Object.keys(d)) for (const o of Object.keys(d[g])) if (o.toLocaleLowerCase("nb") === k) return d[g][o].map((x) => x.toLocaleLowerCase("nb")); return null; })()`;
// What the record line on the track says — the line of its own on tall phones, the words in the
// small label on short ones (only one of the two is shown).
const REKORD_PA_TAVLA = `Array.from(document.querySelectorAll(".sk-neste .sk-rekord, .sk-neste .sk-rekord-kort")).filter((el) => getComputedStyle(el).display !== "none").map((el) => (el.classList.contains("ny") ? "NY " : "") + el.textContent.trim()).join(" | ")`;

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

// Choose exactly these categories in the sheet («Alle» first empties or fills the selection).
async function velgKategorier(t, bare, uten) {
  await t.klikk('[data-h="kategorier"]');
  const alle = await t.js(`document.querySelector('#ark [data-h="kat"][data-v="*"]').getAttribute("aria-pressed") === "true"`);
  if (bare) {
    if (!alle) await t.klikk('#ark [data-h="kat"][data-v="*"]'); // → all
    await t.klikk('#ark [data-h="kat"][data-v="*"]'); // → none
    for (const id of bare) await t.klikk(`#ark [data-h="kat"][data-v="${id}"]`);
  } else {
    if (!alle) await t.klikk('#ark [data-h="kat"][data-v="*"]'); // → all
    for (const id of uten || []) await t.klikk(`#ark [data-h="kat"][data-v="${id}"]`);
  }
}

export default async function (t) {
  X = TEKSTER[t.sprak] || TEKSTER.nb;
  S = `JSON.parse(localStorage.getItem('${t.nokkel("skravla.v1")}'))`;
  REKORD = `JSON.parse(localStorage.getItem('${t.nokkel("skravla.rekord")}') || '{}')`;
  const [ROSA, GUL] = X.lag;
  const REK = new RegExp(X.rekord, "i");
  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  t.sjekk(X.reklame.test(await t.tekst(".merker")) && !REK.test(await t.tekst(".merker")), "Uten rekord skal hjem-skjermen ikke vise noen rekord");
  // A link with #jul opens «Gjør klart» with the Christmas words chosen; «Alle ord» puts the categories back
  await t.lastSide(t.side + "#jul", "document.querySelector('[data-h=\"start\"]')");
  let s = await t.tilstand();
  t.sjekk(s.skjerm === "oppsett" && s.oppsett.tema === "jul" && (await t.js("location.hash")) === "", `Lenken med #jul åpnet ikke oppsettet med juleordene (${s.skjerm}, tema «${s.oppsett.tema}»)`);
  const julOrd = Number((await t.tekst(".seksjon-hode .tall")).replace(/\D/g, ""));
  t.sjekk(julOrd >= 80 && julOrd < 300, `Juletemaet skal ha sine egne ord (viser ${julOrd})`);
  t.sjekk((await t.finnes(".sk-temaboks")) && !(await t.finnes('[data-h="kategorier"]')), "Med et tema valgt skal kategoriknappen vike for temaboksen");
  for (const n of [1, 2, 3]) {
    await t.klikk(`[data-h="niva"][data-v="${n}"]`);
    t.sjekk(!(await t.js(`document.querySelector('[data-h="modus"][data-v="tabu"]').disabled`)), `«Forbudte ord» er stengt for juleordene på nivå ${n}`);
  }
  await t.klikk('[data-h="niva"][data-v="2"]');
  await t.bilde("oppsett-jul", true);
  await t.klikk('[data-h="tema"][data-v=""]');
  t.sjekk((await t.tilstand()).oppsett.tema === "" && (await t.finnes('[data-h="kategorier"]')), "«Alle ord» ga ikke kategoriene tilbake");
  await t.klikk('[data-h="lag"][data-v="3"]');
  await t.klikk('[data-h="tid"][data-v="45"]');
  await t.klikk('[data-h="mal"][data-v="20"]');
  t.sjekk((await t.antall(".sk-lagrad li")) === 3, "Oppsettet viser ikke tre lag");
  t.sjekk(X.oppsett.test(await t.tekst("#skjerm")), "Oppsettet mangler overskriften over spillemåtene");
  t.sjekk(!/tabu|taboo/i.test(await t.tekst("#skjerm")), "Oppsettet bruker ordet «Tabu»");

  // «Forbudte ord» needs enough words with a list: with one small category the tile is closed and
  // a line says why. (On «Middels» every category now has enough lists on its own, so this is
  // checked on «Vanskelig», where one category has only a handful.)
  await t.klikk('[data-h="niva"][data-v="3"]');
  await velgKategorier(t, ["planter"]);
  await t.klikk('#ark [data-h="kat-ferdig"]');
  t.sjekk(await t.js(`document.querySelector('[data-h="modus"][data-v="tabu"]').disabled`), "«Forbudte ord» kan velges selv om utvalget har for få ord med forbudsliste");
  t.sjekk(X.forFa.test(await t.tekst("#sk-forfa")), `Mangler forklaringen på hvorfor «Forbudte ord» er stengt: «${await t.tekst("#sk-forfa")}»`);
  t.sjekk(!(await t.js(`document.querySelector('[data-h="start"]').disabled`)), "Klassisk spill skal kunne startes med én kategori");
  await t.bilde("oppsett-for-fa", true);
  // With every category the mode opens; narrowing afterwards keeps the choice but holds «Start»
  await velgKategorier(t, null, []);
  await t.klikk('#ark [data-h="kat-ferdig"]');
  t.sjekk(!(await t.finnes("#sk-forfa")), "Forklaringen står igjen selv om alle kategorier er valgt");
  await t.klikk('[data-h="modus"][data-v="tabu"]');
  s = await t.tilstand();
  t.sjekk(s.oppsett.tabu === true, "«Forbudte ord» ble ikke valgt");
  const medListe = Number((await t.tekst(".seksjon-hode .tall")).replace(/\D/g, ""));
  t.sjekk(medListe >= X.medListe && medListe < 2379, `«Forbudte ord» skal bare telle ord med forbudsliste (viser ${medListe})`);
  await velgKategorier(t, ["planter"]);
  t.sjekk(X.forFa.test(await t.tekst("#sk-katinfo")), "Kategoriarket sier ikke at utvalget er for lite til «Forbudte ord»");
  await t.klikk('#ark [data-h="kat-ferdig"]');
  t.sjekk(await t.finnes("#sk-forfa.sk-advarsel"), "Mangler advarselen når «Forbudte ord» er valgt og utvalget er for lite");
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "«Start» er åpen selv om «Forbudte ord» har for få ord");
  await t.klikk('[data-h="niva"][data-v="2"]');

  // Categories live in a sheet: all of them but one
  await velgKategorier(t, null, ["abstrakt"]);
  await t.bilde("kategorier");
  s = await t.tilstand();
  t.sjekk(Array.isArray(s.oppsett.kat) && s.oppsett.kat.length === 31 && !s.oppsett.kat.includes("abstrakt"), "Kategorien ble ikke valgt bort");
  await t.klikk('#ark [data-h="kat-ferdig"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sk-bane')");
  t.sjekk((await t.antall(".sk-brikke")) === 3, "Løypa viser ikke tre brikker");
  t.sjekk((await t.tekst("#skjerm h1")).includes(ROSA), "Lag Rosa skal begynne");
  t.sjekk((await t.tekst('[data-h="start-runde"]')).includes(X.startRunde + ROSA), "Startknappen sier ikke hvilket lag som skal forklare");
  t.sjekk(await t.js(OVER_DOKK), "«Lag Rosa: hvem forklarer?» skjules bak knappene nederst");
  t.sjekk((await t.js(REKORD_PA_TAVLA)) === "", "Løypa viser en rekord før noen runde er spilt");
  await t.bilde("tavla-start");

  // Leaving during the countdown (back, then quickly «Fortsett») must not start the round by itself
  await t.klikk('[data-h="start-runde"]', 300);
  await t.klikk("#tilbake", 100);
  await t.klikk('[data-h="fortsett"]');
  await t.sov(3600);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "tavla" && !s.spill.runde && !(await t.finnes(".sk-ordet")), "Runden startet av seg selv etter tilbake og «Fortsett» under nedtellingen");

  // Round 1 (Lag Rosa): the forbidden words on the card are the real list for that word
  await t.klikk('[data-h="start-runde"]', 50);
  await t.vent("document.querySelector('.sk-ordet')", 8000);
  const forste = (await t.tilstand()).spill.runde.ord[0].o;
  const liste = await t.js(LISTE(forste));
  const brikker = await t.js(`Array.from(document.querySelectorAll(".sk-tabu-ord b")).map((el) => el.textContent.trim().toLocaleLowerCase("nb"))`);
  t.sjekk(Array.isArray(liste) && liste.length >= 3 && liste.length <= 4, `Ordet «${forste}» har ingen forbudsliste, men ble trukket i «Forbudte ord»`);
  t.sjekk(liste && brikker.join("|") === liste.join("|"), `Kortet viser ikke forbudslista for «${forste}»: ${brikker.join(", ")}`);
  t.sjekk(await t.friForDokk(".storkort.sk-kort"), "Ordkortet med de forbudte ordene skjules bak knappene nederst");
  t.sjekk(await t.finnes('[data-h="forbudt"]'), "Mangler knappen «Forbudt ord!»");
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
  t.sjekk(!(await t.finnes(".sk-ordet")) && !(await t.finnes(".sk-tabu")), "Ordet eller de forbudte ordene vises mens runden står på pause");
  t.sjekk((await t.tekst('[data-h="fortsett-runde"]')).trim() === X.fortsett, `Knappen på pausekortet skal bare hete «Fortsett»: «${await t.tekst('[data-h="fortsett-runde"]')}»`);
  t.sjekk(await t.finnes('.dokk [data-h="avslutt"]'), "Mangler «Avslutt» på pausekortet");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-runde"]');
  await t.vent("document.querySelector('.sk-ordet')");
  t.sjekk((await t.antall(".sk-tabu-ord b")) >= 3, "De forbudte ordene mangler etter pausen");
  await riktige(t, 5);

  // The opponents hear a forbidden word: the word is lost, −1, next word — and «Angre» takes it back
  let ord = (await t.tilstand()).spill.runde.ord;
  const glapp = ord[ord.length - 1].o;
  // (The stamp is on screen for half a second; hold it a little longer for the picture.)
  await t.js("window.__vent = Rusj.vent; Rusj.vent = (ms) => window.__vent(ms === 520 ? 2200 : ms)");
  await t.klikk('[data-h="forbudt"]', 200);
  t.sjekk(await t.finnes(".sk-brudd-stempel"), "Kortet får ikke stempelet «Forbudt!» når knappen trykkes");
  await t.bilde("forbudt-ord");
  await t.js("Rusj.vent = window.__vent");
  await t.vent(`${S}.spill.runde.ord.length === ${ord.length + 1}`);
  await t.vent("document.querySelector('.storkort:not(.ut):not(.sk-brudd) .sk-ordet')");
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord[ord.length - 1].s === -1 && s.spill.runde.ord[ord.length].s === null, "«Forbudt ord!» merket ikke ordet og ga ikke et nytt");
  await t.klikk('[data-h="angre-ord"]');
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord.length === ord.length && s.spill.runde.ord[ord.length - 1].s === null && (await t.tekst(".sk-ordet")).includes(glapp), "«Angre» tok ikke tilbake «Forbudt ord!»");
  await t.klikk('[data-h="forbudt"]', 60);
  await t.vent(`${S}.spill.runde.ord.length === ${ord.length + 1}`);
  await t.vent("document.querySelector('.storkort:not(.ut):not(.sk-brudd) .sk-ordet')");
  ord = (await t.tilstand()).spill.runde.ord;
  t.sjekk(ord.filter((w) => w.s === -1).length === 1, "Ventet ett ord tapt på et forbudt ord");
  for (const w of ord) t.sjekk((await t.js(LISTE(w.o))) !== null, `«${w.o}» ble trukket uten forbudsliste`);

  // Time's up: the last word is free for all (its forbidden words still show), Lag Gul takes it
  await t.js("Rusj.timer('sk-tid').leggTil(-500)");
  await t.vent("document.querySelector('[data-h=\"siste\"]')");
  t.sjekk((await t.antall(".sk-siste .sk-tabu-ord b")) >= 3, "Siste ord viser ikke de forbudte ordene");
  await t.bilde("tiden-er-ute");
  await t.klikk('[data-h="siste"][data-v="1"]');
  await t.vent("document.querySelector('.sk-ordliste')");
  // Fix a mistake: the first skipped word was right after all (6 right, 1 skipped, 1 forbidden)
  const hoppet = await t.js(`${S}.spill.runde.ord.findIndex(w => w.s === 0)`);
  await t.klikk(`[data-h="veksle"][data-v="${hoppet}"]`);
  t.sjekk(/\+5/.test(await t.tekst("#skjerm h1")), `Ventet +5 poeng etter rettingen (6 riktige, ett forbudt ord), fikk «${await t.tekst("#skjerm h1")}»`);
  // The word lost to a forbidden word has its own state in the list, and a tap walks through all three
  const brudd = await t.js(`${S}.spill.runde.ord.findIndex(w => w.s === -1)`);
  t.sjekk(X.forbudtOrd.test(await t.tekst(`[data-h="veksle"][data-v="${brudd}"]`)) && (await t.finnes(`.sk-ord.brudd[data-v="${brudd}"]`)), "Lista viser ikke hvilket ord som røk på et forbudt ord");
  await t.klikk(`[data-h="veksle"][data-v="${brudd}"]`);
  t.sjekk(/\+6/.test(await t.tekst("#skjerm h1")), `Forbudt → hoppet over skal gi +6, fikk «${await t.tekst("#skjerm h1")}»`);
  await t.klikk(`[data-h="veksle"][data-v="${brudd}"]`);
  t.sjekk(/\+7/.test(await t.tekst("#skjerm h1")), `Hoppet over → riktig skal gi +7, fikk «${await t.tekst("#skjerm h1")}»`);
  await t.klikk(`[data-h="veksle"][data-v="${brudd}"]`);
  t.sjekk(/\+5/.test(await t.tekst("#skjerm h1")) && (await t.js(`${S}.spill.runde.ord[${brudd}].s`)) === -1, "Riktig → forbudt ord skal gi +5 igjen");
  t.sjekk(await t.finnes('.dokk [data-h="avslutt"]'), "Mangler «Avslutt» etter runden");
  await t.bilde("sjekk", true);
  await t.klikk('[data-h="flytt"]');
  await t.vent("document.querySelector('.sk-bane')");
  await t.sov(2600); // the tokens hop along the track
  await t.bilde("tavla-flytt");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "5,1,0", `Feil stilling etter runde 1: ${s.spill.poeng.join(",")}`);
  t.sjekk(s.spill.stat.forbudt === 1, "Det forbudte ordet ble ikke talt");
  t.sjekk((await t.tekst("#skjerm h1")).includes(GUL), "Lag Gul skal forklare nå");
  // The first round sets the phone's record quietly (6 words in 45 s with forbidden words)
  t.sjekk((await t.js(REKORD)).f45 === 6, `Rekorden ble ikke lagret: ${JSON.stringify(await t.js(REKORD))}`);
  t.sjekk(new RegExp(`${X.rekord}:? 6`, "i").test(await t.js(REKORD_PA_TAVLA)) && !/NY/.test(await t.js(REKORD_PA_TAVLA)), `Løypa viser ikke rekorden: «${await t.js(REKORD_PA_TAVLA)}»`);
  t.sjekk(await t.js(OVER_DOKK), "Rekorden skyver «hvem forklarer?» bak knappene nederst");

  // The move can be undone until the next round starts — and the record goes back with it
  await t.klikk('[data-h="angre-flytt"]');
  await t.vent("document.querySelector('.sk-ordliste')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,0,0" && s.spill.tur === 0 && s.spill.runde && s.spill.stat.forbudt === 0, "«Angre» på løypa tok ikke tilbake flyttet");
  t.sjekk((await t.js(REKORD)).f45 === undefined, "Rekorden overlevde at flyttet ble angret");
  await t.klikk('[data-h="flytt"]');
  await t.vent("document.querySelector('.sk-bane')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "5,1,0", `Feil stilling etter nytt flytt: ${s.spill.poeng.join(",")}`);
  t.sjekk((await t.js(REKORD)).f45 === 6, "Rekorden kom ikke tilbake da runden ble talt på nytt");

  // Leave and come back; the record is on the home screen; «Nytt spill» asks before throwing the game away
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  t.sjekk(new RegExp(`6\\s*${X.rekord}`, "i").test(await t.tekst(".merker")) && !X.reklame.test(await t.tekst(".merker")), `Hjem-skjermen viser ikke rekorden: «${await t.tekst(".merker")}»`);
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.tilstand()).spill.poeng.join(",") === "5,1,0", "Spillet forsvant selv om «Avbryt» ble valgt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.sk-bane')");

  // Lag Gul gets 19 words and reaches the goal (20) → final round for Lag Blå. 19 beats the record.
  await runde(t, 19, -1);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 20 && s.spill.malgang && s.spill.vinner == null, "Lag Gul skulle være i mål uten at spillet er over");
  const sisteRunde = await t.tekst(".sk-neste");
  t.sjekk(X.iMal(GUL).test(sisteRunde) && X.sisteRunde.test(sisteRunde), "Mangler beskjed om siste runde");
  t.sjekk(await t.js(OVER_DOKK), "Beskjeden om siste runde skyver «hvem forklarer?» bak knappene nederst");
  t.sjekk((await t.js(REKORD)).f45 === 19 && s.spill.nyRekord && s.spill.nyRekord.ord === 19 && s.spill.nyRekord.lag === 1, "19 ord skulle bli ny rekord for Lag Gul");
  t.sjekk(/^NY .*19/.test(await t.js(REKORD_PA_TAVLA)), `Løypa feirer ikke den nye rekorden: «${await t.js(REKORD_PA_TAVLA)}»`);
  await t.sov(1200);
  await t.bilde("tavla-siste-sjanse");

  // Lag Blå gets two words; the round is complete, Lag Gul wins
  await runde(t, 2, 2);
  s = await t.tilstand();
  t.sjekk(s.spill.vinner === 1, `Lag Gul skulle ha vunnet (vinner: ${s.spill.vinner}, poeng ${s.spill.poeng.join(",")})`);
  t.sjekk(s.spill.nyRekord === null && (await t.js(REKORD)).f45 === 19, "To ord skal ikke røre rekorden på 19");
  await t.vent("document.querySelector('[data-h=\"kar\"]')");
  t.sjekk((await t.tekst('[data-h="kar"]')).trim() === X.tilKaringen, `Hovedknappen skal være ren tekst: «${await t.tekst('[data-h="kar"]')}»`);
  await t.sov(1200);
  await t.bilde("tavla-vinner");
  await t.js(`localStorage.removeItem('${t.nokkel("kveld")}')`);
  await t.klikk('[data-h="kar"]');
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  t.sjekk((await t.tekst("#skjerm h1")).includes(X.vinner(GUL)), "Vinneren vises ikke på kåringen");
  t.sjekk(await t.finnes(".poengliste") && await t.finnes(".flere-spill") && await t.finnes(`.dokk a.lenke[href="${t.norsk ? "/" : `/${t.sprak}/`}"]`), "Kåringen mangler poengliste, andre spill eller «Alle spill»");
  t.sjekk((await t.antall(".poengliste .sk-klump")) === 3, "Poenglista viser ikke lagfigurene");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Ferdig spill skal ikke kunne fortsettes");
  t.sjekk(X.nyRekord45.test(await t.tekst("#skjerm")), "Kåringen sier ikke at beste runde ble ny rekord");
  t.sjekk(X.ettForbudt.test((await t.tekst(".sk-fakta")).replace(/\n/g, " ")), `Kåringen teller ikke det forbudte ordet: «${await t.tekst(".sk-fakta")}»`);

  // The evening's scoreboard and the statistics get the game — once, also after a reload
  const kveld = () => t.js(`JSON.parse(localStorage.getItem('${t.nokkel("kveld")}') || '{"spill":[]}').spill.filter((g) => g.id === 'skravla')`);
  let k = await kveld();
  t.sjekk(k.length === 1 && k[0].resultat.length === 3 && k[0].resultat[0].navn === GUL && k[0].resultat[0].plass === 1, `«Kveldens gjeng» fikk ikke resultatet: ${JSON.stringify(k)}`);
  const ferdig = await t.js("Rusj._statKo.filter((x) => x.h === 'ferdig')");
  t.sjekk(ferdig.length === 1 && ferdig[0].d.lag === 3 && ferdig[0].d.forbudt === true && ferdig[0].d.rekord === true && ferdig[0].d.tidlig === false, `Statistikken fikk ikke «ferdig» én gang: ${JSON.stringify(ferdig)}`);
  // «Del kåringen»: a sentence about the result, the link apart from the text
  await t.js("navigator.share = async (d) => { window.__delt = d; }");
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && X.delt.every((re) => re.test(delt.text)) && delt.title === (await t.js("window.RUSJ_SPILL.navn")), `«Del kåringen» sender ikke resultatet: ${JSON.stringify(delt)}`);
  t.sjekk(delt && delt.url.endsWith(new URL(t.side).pathname) && !/https?:|rusj\.no/.test(delt.text), "Lenken skal ligge utenfor teksten som deles");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  k = await kveld();
  t.sjekk(k.length === 1, `Kåringen ble meldt inn ${k.length} ganger etter omlasting`);
  t.sjekk((await t.tekst("#skjerm h1")).includes(X.vinner(GUL)) && (await t.tilstand())._aktiv === false, "Kåringen skal stå etter omlasting, og spillet skal ikke regnes som pågående");

  // Play again starts a fresh game with the same settings
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.sk-bane')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,0,0" && s.spill.mal === 20 && s.spill.tabu, "«Spill igjen» startet ikke et nytt spill med samme oppsett");
  t.sjekk(new RegExp(`${X.rekord}:? 19`, "i").test(await t.js(REKORD_PA_TAVLA)), `Det nye spillet viser ikke rekorden å slå: «${await t.js(REKORD_PA_TAVLA)}»`);

  // «Avslutt» from the pause drops the running round; the sheets say «Spill videre»
  await t.klikk('[data-h="start-runde"]', 50);
  await t.vent("document.querySelector('.sk-ordet')", 8000);
  await riktige(t, 1);
  await t.klikk('[data-h="pause"]');
  await t.klikk('.dokk [data-h="avbryt-runde"]');
  t.sjekk((await t.tekst('#ark [data-v="nei"]')).trim() === X.spillVidere, `Arket for «Avbryt runden» skal ha «Spill videre»: «${await t.tekst('#ark [data-v="nei"]')}»`);
  await t.klikk('#ark [data-v="nei"]');
  await t.klikk('.dokk [data-h="avslutt"]');
  t.sjekk(X.ingenPoeng.test(await t.tekst("#ark")) && (await t.tekst('#ark [data-v="nei"]')).trim() === X.spillVidere && (await t.tekst('#ark [data-v="ja"]')).trim() === X.avslutt, `Arket for «Avslutt» på pausekortet stemmer ikke: «${await t.tekst("#ark")}»`);
  await t.klikk('#ark [data-v="nei"]');
  s = await t.tilstand();
  t.sjekk(s.spill && s.spill.runde && s.spill.runde.pause && s.skjerm === "runde", "«Spill videre» skal la runden stå på pause");
  await t.klikk('[data-h="fortsett-runde"]');
  await t.vent("document.querySelector('.sk-ordet')");
  await riktige(t, 2);
  // …and from the list after the round, that round counts first: Lag Rosa wins 2–0–0
  await t.js("Rusj.timer('sk-tid').leggTil(-500)");
  await t.vent("document.querySelector('[data-h=\"siste\"]')");
  await t.klikk('[data-h="siste"][data-v="-1"]');
  await t.vent("document.querySelector('.sk-ordliste')");
  await t.klikk('.dokk [data-h="avslutt"]');
  t.sjekk(X.lederVinner.test(await t.tekst("#ark")), `Arket for «Avslutt» etter runden stemmer ikke: «${await t.tekst("#ark")}»`);
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.sk-banner')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "slutt" && s.spill.ferdig && s.spill.poeng.join(",") === "2,0,0" && (await t.tekst("#skjerm h1")).includes(X.vinner(ROSA)), `«Avslutt» etter runden skulle telle runden og kåre Lag Rosa (${s.spill.poeng.join(",")})`);
  t.sjekk((await kveld()).length === 2, "Det avsluttede spillet ble ikke meldt til «Kveldens gjeng»");
  t.sjekk((await t.js(REKORD)).f45 === 19, "Rekorden skal stå etter et kort spill");
  await t.bilde("slutt-avsluttet", true);

  // Kåringen is final: back leads home, where nothing can be continued and the record stands
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && new RegExp(`19\\s*${X.rekord}`, "i").test(await t.tekst(".merker")), `Etter kåringen skal hjem-skjermen ha rekorden og ingen «Fortsett»: «${await t.tekst(".merker")}»`);
  await t.bilde("hjem-rekord");

  // Classic play: no forbidden words, no button — and its own record
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Start spill» etter kåringen skal ikke spørre");
  await t.klikk('[data-h="modus"][data-v="klassisk"]');
  await t.klikk('[data-h="tema"][data-v="jul"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sk-bane')");
  t.sjekk((await t.js(REKORD_PA_TAVLA)) === "", "Klassisk spill skal ikke vise rekorden fra «Forbudte ord»");
  await t.klikk('[data-h="start-runde"]', 50);
  await t.vent("document.querySelector('.sk-ordet')", 8000);
  t.sjekk(!(await t.finnes(".sk-tabu")) && !(await t.finnes('[data-h="forbudt"]')) && X.utenASi.test(await t.tekst(".storkort")), "Klassisk spill viser forbudte ord eller knappen for dem");
  // …with the Christmas theme: every word comes from its list
  await riktige(t, 4);
  const julListe = await t.js(`window.RUSJ_DATA.tema.jul.ord.map((o) => o.toLocaleLowerCase("nb"))`);
  s = await t.tilstand();
  t.sjekk(s.spill.tema === "jul" && s.spill.runde.ord.every((w) => julListe.includes(w.o.toLocaleLowerCase("nb"))), `Et ord utenfor juletemaet ble trukket: ${s.spill.runde.ord.map((w) => w.o).join(", ")}`);
  await t.bilde("runde-klassisk");
  // A #jul link in the middle of a game leaves the game alone
  await t.lastSide(t.side + "#jul", "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.spill && s.spill.runde && s.skjerm === "runde", "En lenke med #jul forstyrret et spill som pågår");
}
