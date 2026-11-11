// Nynneren. Hurtignynn (the main mode), everyone against everyone: the big zones, taps and a
// double tap, reload in the middle of a turn, the check list, the record on the home screen,
// Kåringen and the evening's scoreboard. Then «Én om gangen» with only newer songs, twists and
// la-la in three screens (the secret card on the hand-over, who guessed on the answer), back
// during the countdown, reloads, the hint, the peek card and a shared win. Then teams, the Jul
// deep link and settings saved by the version before Hurtignynn.

const REKORD = "JSON.parse(localStorage.getItem('rusj.nynneren.rekord') || 'null')";
const KVELD = "JSON.parse(localStorage.getItem('rusj.kveld') || 'null')";

// Hurtignynn: from the hand-over screen through the countdown to the first song.
async function startTur(t) {
  await t.klikk('[data-h="start-tur"]', 50);
  await t.vent("document.querySelector('.ny-riktig')", 8000);
  await t.sov(300);
}
// One song answered (a second tap within 350 ms is ignored on purpose, so wait a little longer).
const riktig = (t) => t.klikk('[data-h="h-riktig"]', 420);
const pass = (t) => t.klikk('[data-h="h-pass"]', 420);
async function tidUte(t, sel) {
  await t.js("Rusj.timer('ny-tid').leggTil(-500)");
  await t.vent(`document.querySelector(${JSON.stringify(sel)})`);
  await t.sov(200);
}
// Én om gangen: read the song on the hand-over screen (hold the card) and start humming.
async function nynn(t, bilde) {
  await t.vent("document.querySelector('#skjerm > .mappe')");
  t.sjekk(await t.finnes('[data-h="start-nynn"]:disabled'), "Start skal være låst til låta er sett");
  const slipp = await t.hold("#skjerm > .mappe", 650);
  if (bilde) await t.bilde(bilde);
  await slipp();
  await t.vent("!document.querySelector('[data-h=\"start-nynn\"]').disabled");
  await t.klikk('[data-h="start-nynn"]', 50);
  await t.vent("document.querySelector('#ny-tid')", 8000);
  await t.sov(400);
}

export default async function (t) {
  const h1 = async () => (await t.tekst("#skjerm h1")).trim();

  // ---------- Setup: Hurtignynn first, Jul listed but not chosen, «Bare nyere låter» ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  let s = await t.tilstand();
  t.sjekk(s.oppsett.form === "hurtig" && (await t.finnes('[data-h="form"][data-v="hurtig"][aria-pressed="true"]')), "Hurtignynn skal være forhåndsvalgt");
  t.sjekk((await t.antall('[data-h="kat"]:not([data-v="*"])')) === 10, "Det skal være ti kategorier");
  const naa = new Date();
  const sesong = naa.getMonth() >= 10 || (naa.getMonth() === 0 && naa.getDate() <= 6);
  const rekke = await t.js(`Array.from(document.querySelectorAll('[data-h="kat"]')).map((b) => b.dataset.v)`);
  t.sjekk(rekke[0] === "*" && rekke.indexOf("jul") === (sesong ? 1 : rekke.length - 1), `Jul skal stå først i jula og sist ellers (${rekke.join(" ")})`);
  t.sjekk(await t.finnes('[data-h="kat"][data-v="jul"][aria-pressed="false"]'), "Jul skal ikke være forhåndsvalgt");
  const tall = () => t.js("Number(Array.from(document.querySelectorAll('.seksjon-hode')).find((h) => /Låtene/.test(h.textContent)).querySelector('.tall').textContent.replace(/\\D/g, ''))");
  const foer = await tall();
  await t.klikk('[data-h="nye"]');
  const nyere = await tall();
  t.sjekk(nyere >= 100 && nyere < foer, `«Bare nyere låter» skal gi færre, men mange låter (${foer} → ${nyere})`);
  await t.klikk('[data-h="nye"]');
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="kat"][data-v="barn"]');
  s = await t.tilstand();
  t.sjekk(Array.isArray(s.oppsett.kat) && !s.oppsett.kat.includes("barn") && !s.oppsett.kat.includes("jul") && s.oppsett.nye === false, "Barnesanger ble ikke valgt bort");
  t.sjekk(/^3 turer · ca\. \d+ min$/.test((await t.tekst(".ny-estimat")).trim()), `Start-knappen skal ha «3 turer · ca. N min» under seg, fikk «${await t.tekst(".ny-estimat")}»`);
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller A/.test(await h1()), "Testspiller A skal nynne først");
  t.sjekk(await t.friForDokk(".ikke-se"), "Overleveringen (hvem, hva, «bare nynneren ser skjermen») skjules bak knappene nederst");
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="avslutt"]'), "Overleveringen mangler «Avslutt»");
  await t.bilde("gi");

  // ---------- Hurtignynn, turn 1 (A): the phone in the hand ----------
  await startTur(t);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hurtig" && s.spill.runde.ord.length === 1 && s.spill.runde.ord[0].k !== "barn", "Turen startet ikke med én låt fra de valgte kategoriene");
  const m = await t.js(`(() => {
    const b = (q) => document.querySelector(q).getBoundingClientRect();
    const r = b(".ny-riktig"), p = b(".ny-pass"), k = b(".ny-hkort"), l = b('#skjerm [data-h="pause"]');
    return { rA: r.width * r.height, pA: p.width * p.height, rT: r.top, rL: r.left, kB: k.bottom, kR: k.right, lB: l.bottom, skjerm: innerWidth * innerHeight, h: innerHeight, rull: document.documentElement.scrollHeight - innerHeight };
  })()`);
  t.sjekk(m.rull <= 0 && m.lB <= m.h + 1, `Hurtignynn-skjermen skal fylle mobilen uten å rulle (${m.rull} px for høy)`);
  t.sjekk(m.rA >= 0.14 * m.skjerm && m.rA >= 2 * m.pA, `«Riktig» skal være en stor sone og «Pass» en smal stripe (${Math.round((100 * m.rA) / m.skjerm)} % av skjermen)`);
  t.sjekk(m.kB <= m.rT + 1 || m.kR <= m.rL + 1, "Låta skal stå over (eller til venstre for) «Riktig»-sonen");
  const forste = s.spill.runde.ord[0];
  t.sjekk((await t.tekst(".ny-hord")).trim() === forste.t, "Låta vises ikke i stor skrift");
  t.sjekk(!forste.a || (await t.tekst(".ny-hartist")).includes(forste.a), "Artisten vises ikke under låta");
  await t.bilde("hurtig");
  await riktig(t);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hurtig" && s.spill.runde.ord.length === 2 && s.spill.runde.ord[0].s === 1, "«Riktig» skal gi neste låt med en gang, uten skjermbytte");
  t.sjekk((await t.tekst(".ny-hord")).trim() === s.spill.runde.ord[1].t && (await t.tekst(".ny-teller b")).trim() === "1", "Neste låt og telleren ble ikke oppdatert etter «Riktig»");
  // A nervous double tap must not burn the next song
  await t.klikk('[data-h="h-riktig"]', 30);
  await t.klikk('[data-h="h-riktig"]', 420);
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord.length === 3, `Et dobbelttrykk skal bare telle én låt (telte ${s.spill.runde.ord.length - 2})`);
  await pass(t);
  await riktig(t);
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord.map((w) => String(w.s)).join(",") === "1,1,0,1,null", `Riktig, riktig, pass, riktig ble lagret som ${s.spill.runde.ord.map((w) => w.s).join(",")}`);
  t.sjekk(s.spill.poeng.join(",") === "0,0,0", "Poengene skal ikke telles før turen er sjekket");
  // Reload in the middle of the turn: it comes back paused, with the song hidden
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hurtig" && (await t.finnes('[data-h="fortsett-nynn"]')) && !(await t.finnes(".ny-hord")), "Etter omlasting skal turen stå på pause med låta skjult");
  await t.bilde("hurtig-pause");
  await t.klikk('[data-h="fortsett-nynn"]');
  await t.vent("document.querySelector('.ny-riktig')");
  // Time is up: the check list
  await tidUte(t, ".ny-ordliste");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "sjekk" && s.spill.runde.ute === true, "Når tiden er ute, skal sjekklista komme");
  t.sjekk((await t.antall(".ny-ord")) === 5, `Sjekklista skal vise alle fem låtene (viser ${await t.antall(".ny-ord")})`);
  t.sjekk(/^\+3\s*poeng$/.test(await h1()), `Tre riktige skal gi «+3 poeng», fikk «${await h1()}»`);
  t.sjekk(/rakk ikke/.test(await t.tekst(".ny-ordliste li:last-child")), "Låta klokka stoppet på, skal stå som «rakk ikke»");
  t.sjekk((await t.tekst(".poengliste li:first-child .pluss")).trim() === "+3", "Stillingen skal vise turens poeng som «+3»");
  await t.bilde("sjekk", true);
  await t.klikk('.ny-ord[data-v="2"]');
  t.sjekk(/^\+4/.test(await h1()), "Et trykk på en låt i sjekklista skal rette den");
  await t.klikk('.ny-ord[data-v="2"]');
  t.sjekk(/^\+3/.test(await h1()) && (await t.tekst('[data-h="neste"]')).trim() === "Neste: Testspiller B", "Et nytt trykk skal rette tilbake, og hovedknappen sende mobilen videre");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "3,0,0" && s.spill.tur === 1, `Turens poeng ble ikke talt riktig: ${s.spill.poeng.join(",")}`);
  t.sjekk(((await t.js(REKORD)) || { hurtig: {} }).hurtig["60"] === 3, "Rekorden for 60 s ble ikke lagret");

  // Turn 2 (B): one song. Turn 3 (C): none — the last turn leads to Kåringen.
  await startTur(t);
  await riktig(t);
  await tidUte(t, ".ny-ordliste");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  await startTur(t);
  await tidUte(t, ".ny-ordliste");
  t.sjekk((await t.tekst('[data-h="neste"]')).trim() === "Til kåringen" && !(await t.finnes('#skjerm [data-h="avslutt"]')), "Siste tur skal gå videre til kåringen");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner')");
  await t.bilde("slutt", true);
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === "kåringen", "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(/^Testspiller A vinner!$/.test(await h1()), `Vinneren vises ikke riktig: «${await h1()}»`);
  t.sjekk((await t.finnes(".pall")) && (await t.finnes(".poengliste")) && /Beste tur/.test(await t.tekst(".ny-priser")), "Kåringen mangler pall, poengliste eller «Beste tur»");
  t.sjekk((await t.finnes(".flere-spill")) && (await t.finnes('.dokk a.lenke[href="/"]')), "Kåringen mangler andre spill eller «Alle spill»");
  let kv = await t.js(KVELD);
  t.sjekk(kv && kv.spill.length === 1 && kv.spill[0].id === "nynneren" && kv.spill[0].resultat[0].plass === 1, "Kåringen ble ikke meldt til «Kveldens gjeng»");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.tilstand()).skjerm === "slutt" && (await t.js(KVELD)).spill.length === 1, "Omlasting på kåringen skal vise kåringen igjen uten å melde spillet én gang til");
  // The record is on the home screen
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('[data-h=\"nytt\"]')");
  t.sjekk(/rekord på 60 s/.test(await t.tekst("#skjerm")), "Rekorden vises ikke på hjem-skjermen");
  await t.bilde("hjem-rekord");

  // ---------- Én om gangen: newer songs only, twists and la-la, three players, one round ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="form"][data-v="en"]');
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="nye"]');
  await t.klikk('[data-h="vrier"]');
  await t.klikk('[data-h="lala"]');
  s = await t.tilstand();
  t.sjekk(s.oppsett.form === "en" && s.oppsett.nye && s.oppsett.vrier && s.oppsett.lala && s.oppsett.tid.en === 45, "Én om gangen, nyere låter, vrier og la-la ble ikke skrudd på");
  await t.bilde("oppsett-en", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#skjerm > .mappe')");
  // The first hummer goes round from game to game: B now
  t.sjekk(/Testspiller B\s+nynner/.test(await t.tekst(".ny-nynner")), `Neste spill skal starte med nestemann: «${await t.tekst(".ny-nynner")}»`);
  t.sjekk(await t.friForDokk(".mappe-finger"), "«Hold fingeren på kortet for å se» skjules bak knappene nederst");
  await t.js("Rusj.S.spill.vri = 1; Rusj.lagre()");
  const slipp = await t.hold("#skjerm > .mappe", 650);
  t.sjekk(/Vri:/.test(await t.tekst(".mappe-bakside")) && /La-la er lov/.test(await t.tekst(".mappe-bakside")), "Vrien eller la-la-regelen vises ikke på det hemmelige kortet");
  t.sjekk(/\b20[12]\d\b/.test(await t.tekst(".mappe-bakside .ny-artist")), "Artist og år vises ikke på kortet");
  await t.bilde("gi-en");
  await slipp();
  s = await t.tilstand();
  const laat1 = s.spill.laat.t;
  t.sjekk(s.spill.laat.y >= 2010, `«Bare nyere låter» ga en eldre låt: ${JSON.stringify(s.spill.laat)}`);
  await t.klikk('[data-h="bytt"]');
  s = await t.tilstand();
  t.sjekk(s.spill.laat.t !== laat1 && s.spill.bytt === 1 && s.spill.laat.y >= 2010 && s.spill.laat.k !== "barn", "«Bytt» ga ikke en ny, nyere låt");
  await nynn(t);
  await t.sov(900);
  await t.bilde("nynn");
  t.sjekk(/robot/i.test(await t.tekst(".ny-skilt")), "Vrien vises ikke mens man nynner");
  t.sjekk(await t.friForDokk(".ny-skilt"), "Klokka skjules bak knappene nederst");
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  t.sjekk((await t.antall('[data-h="gjetter"]')) === 2 && (await t.finnes('[data-h="neste"]:disabled')), "Svaret skal spørre hvem som gjettet (ikke nynneren), og vente med «Neste»");
  t.sjekk(/\b20[12]\d\b/.test(await t.tekst(".ny-fasit-artist")), "Fasiten viser ikke artist og år");
  await t.bilde("svar-velg");
  // Undo: back to humming, then right for real
  await t.klikk('[data-h="angre-svar"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  // A wrong guesser is just tapped again
  await t.klikk('[data-h="gjetter"][data-v="2"]');
  await t.klikk('[data-h="gjetter"][data-v="0"]');
  await t.sov(600);
  await t.bilde("svar", true);
  s = await t.tilstand();
  t.sjekk(s.spill.gjetter === 0 && s.spill.poeng.join(",") === "0,0,0" && /^\+1$/.test((await t.tekst(".poengliste .pluss")).trim()), "Gjetteren skal kunne endres, og poengene vises som «+1» til turen er over");
  t.sjekk(await t.finnes(".ny-allsang"), "Allsang-bonusen vises ikke ved riktig svar");
  t.sjekk(((await t.js(REKORD)) || {}).raskest == null, "Raskeste gjetning skal først lagres når turen er over");

  // Turn 2: C hums. Going back during the countdown must not start the clock by itself; then pass.
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('#skjerm > .mappe')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "1,1,0" && /Testspiller C/.test(await t.tekst(".ny-nynner")), `Gjetter og nynner skulle få ett poeng hver, fikk ${s.spill.poeng.join(",")}`);
  t.sjekk(((await t.js(REKORD)) || {}).raskest && (await t.js(REKORD)).raskest.sek >= 1, "Raskeste gjetning ble ikke lagret som rekord");
  const slippC = await t.hold("#skjerm > .mappe", 650);
  await slippC();
  await t.vent("!document.querySelector('[data-h=\"start-nynn\"]').disabled");
  await t.klikk('[data-h="start-nynn"]', 300);
  await t.klikk("#tilbake", 100);
  await t.sov(3600);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && !(await t.finnes("#ny-tid")), "Klokka startet av seg selv etter «tilbake» under nedtellingen");
  await t.klikk('[data-h="fortsett"]');
  await nynn(t);
  await t.klikk('[data-h="pass"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.ny-fasit')");
  t.sjekk(/Pass!/i.test(await h1()) && !(await t.finnes('[data-h="gjetter"]')), "Pass skal vise svaret uten å spørre hvem som gjettet");

  // Turn 3: A hums. A reload on the hand-over keeps the card hidden; a reload mid-humming pauses.
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('#skjerm > .mappe')");
  const slippA = await t.hold("#skjerm > .mappe", 650);
  await slippA();
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gi" && (await t.finnes('[data-h="start-nynn"]:disabled')), "Etter omlasting på overleveringen skal kortet holdes på nytt før «Start»");
  await nynn(t);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "nynn" && (await t.finnes('[data-h="fortsett-nynn"]')), "Nynningen ble ikke gjenopptatt på pause etter omlasting");
  await t.bilde("nynn-pause");
  await t.klikk('[data-h="fortsett-nynn"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  // Half the time gone: the guessers get a hint
  await t.js("Rusj.timer('ny-tid').leggTil(-(Rusj.S.spill.tid / 2 + 1))");
  await t.vent("document.querySelector('.ny-hint:not([hidden])')", 4000);
  t.sjekk(/ord/.test(await t.tekst(".ny-hint")), "Hintet etter halve tiden viser ikke antall ord");
  // Peek at the song again: the small card under the record
  t.sjekk(await t.friForDokk(".ny-titt .mappe"), "Titte-kortet skjules bak knappene nederst");
  const slipp3 = await t.hold(".ny-titt .mappe", 600);
  await t.bilde("titt");
  t.sjekk((await t.tekst(".ny-titt .mappe-bakside")).trim().length > 0, "Titte-kortet viser ikke låta");
  await slipp3();
  // The clock runs out
  await tidUte(t, ".ny-fasit");
  t.sjekk(/Tiden er ute/i.test(await h1()) && (await t.tekst('[data-h="neste"]')).trim() === "Til kåringen", "Mangler «Tiden er ute» eller «Til kåringen»");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner')");
  await t.sov(300);
  await t.bilde("slutt-delt", true);
  t.sjekk(/^Testspiller A og Testspiller B vinner!$/.test(await h1()), `Delt seier vises ikke riktig: «${await h1()}»`);
  t.sjekk((await t.antall(".pall .pall-plass.p1")) === 2, "Pallen skal vise to på delt førsteplass");
  t.sjekk(/Raskeste gjetning/.test(await t.tekst(".ny-priser")) && /Skarpeste øre/.test(await t.tekst(".ny-priser")), "Kåringen mangler «Raskeste gjetning» eller «Skarpeste øre»");
  kv = await t.js(KVELD);
  t.sjekk(kv.spill.length === 2, "Spill nummer to ble ikke meldt til «Kveldens gjeng»");
  await t.sov(1500);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Teams, Hurtignynn: two songs, then «Avslutt» from the check list ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="form"][data-v="hurtig"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  t.sjekk(!(await t.finnes("#spillerboks")), "Lag mot lag skal ikke vise spillerlista");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Lag Rosa/.test(await h1()), "Lag Rosa skal nynne først");
  await t.bilde("gi-lag");
  await startTur(t);
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord[0].y >= 2010, "«Bare nyere låter» skal også gjelde Hurtignynn");
  await riktig(t);
  await riktig(t);
  await tidUte(t, ".ny-ordliste");
  t.sjekk((await t.antall(".poengliste .ny-lagfigur")) === 2, "Poenglista viser ikke lagfigurene");
  await t.bilde("sjekk-lag", true);
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "2,0" && /^Lag Rosa vinner!$/.test(await h1()), `«Avslutt» fra sjekklista skal telle turen: ${s.spill.poeng.join(",")} «${await h1()}»`);
  t.sjekk((await t.finnes(".poengliste")) && !(await t.finnes(".pall")), "Med bare ett lag på poeng skal det være poengliste, men ingen pall");
  await t.bilde("slutt-lag", true);

  // ---------- rusj.no/nynneren/#jul: «Gjør klart» with only the Christmas songs ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.lastSide("about:blank");
  await t.lastSide(t.side + "#jul", "document.querySelector('[data-h=\"start\"]')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "oppsett" && JSON.stringify(s.oppsett.kat) === '["jul"]' && (await t.antall('[data-h="kat"][aria-pressed="true"]')) === 1, "Lenken #jul skal åpne «Gjør klart» med bare Jul valgt");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  await startTur(t);
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord[0].k === "jul" && /jul/i.test(await t.tekst(".ny-hetikett")), "Med bare Jul valgt skal låtene komme fra Jul");
  await t.bilde("hurtig-jul");

  // ---------- Settings and a game saved by the version before Hurtignynn ----------
  await t.klikk('#skjerm [data-h="pause"]'); // (a running clock would save over the old state)
  await t.vent("document.querySelector('[data-h=\"fortsett-nynn\"]')");
  await t.js(`localStorage.setItem("rusj.nynneren.v1", JSON.stringify({ skjerm: "se", _tid: Date.now(), antall: 3,
    oppsett: { modus: "lag", lag: 3, runder: { alle: 3, lag: 5 }, tid: 60, niva: 1, kat: ["barn"], lala: true, vrier: false },
    spill: { modus: "lag", lag: 3, antall: 0, runder: 5, tid: 60, niva: 1, kat: ["barn"], lala: true, vrier: false, poeng: [1, 0, 0], tur: 1, turer: 15, logg: [], laat: { t: "Mikkel rev", k: "barn", n: 1, a: "" }, skjerm: "se", ferdig: false } }))`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  const o = s.oppsett;
  t.sjekk(s.skjerm === "hjem" && s.spill === null, "Et spill lagret av den gamle versjonen skal legges bort, og siden skal åpne på hjem-skjermen");
  t.sjekk(o.form === "hurtig" && o.modus === "lag" && o.lag === 3 && o.tid.en === 60 && o.tid.hurtig === 60 && o.runder.en.alle === 3 && o.runder.en.lag === null && o.niva === 1 && o.lala === true && o.nye === false && JSON.stringify(o.kat) === '["barn"]', `Gamle innstillinger ble ikke tatt med: ${JSON.stringify(o)}`);
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('[data-h="modus"][data-v="lag"][aria-pressed="true"]'), "Oppsettet kunne ikke tegnes med gamle innstillinger");
}
