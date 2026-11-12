// Bokstavtrollet:
// Bomba with three players and «Begge» (a wide category + a letter): the setup follows the level, a new
//   letter on every pass, «Bytt bokstav» costs time, the troll wakes, the phone suggests who held it,
//   undo, reload, back + continue, the record. Nobody is out: when someone loses the last heart the
//   game is over, equal hearts at the top give a final between those players, then «Kåringen».
// Bomba with «Kategori» (no letter) and «Avslutt» before anything has happened.
// Bomba with «Bokstav» (no category) and «Sistemann igjen»: the knock-out rule, two players.
// Bokstavjakt with the Christmas categories: three rounds (reload while writing, time runs out, a row
//   without points is marked, undo the points), a tie → one extra round → «Kåringen» by itself.
// A game saved by the first version keeps its rules.
export default async function (t) {
  const vent = (sel, ms) => t.vent(`document.querySelector(${JSON.stringify(sel)})`, ms);
  const sp = () => t.js("JSON.parse(JSON.stringify(Rusj.S.spill))");
  const kat = (i) => t.js(`window.RUSJ_DATA.kategorier.kategorier[${i}]`);
  const kveld = () => t.js(`(JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null") || { spill: [] }).spill.filter((s) => s.id === "bokstavtrollet").map((s) => s.resultat.map((r) => r.navn.slice(-1) + r.plass).join(" "))`);
  const fri = async (sel, hvor) => t.sjekk(await t.friForDokk(sel, 6), `«${sel}» er skjult bak knappene på «${hvor}»`);
  // One round of Bomba from the card: start, (pass the phone n times), wake the troll, say who held it.
  const runde = async (taper, send = 0) => {
    await vent('[data-h="bomba-start"]');
    await t.sov(300);
    await t.klikk('[data-h="bomba-start"]', 50);
    await vent(".skjerm-bomba", 8000);
    await t.sov(250);
    for (let n = 0; n < send; n++) await t.klikk('[data-h="send"]', 420);
    await t.js("Rusj.S.spill.slutt = Date.now()");
    await vent(".skjerm-vakna", 6000);
    if (taper != null) await t.klikk(`[data-h="taper"][data-v="${taper}"]`);
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  t.sjekk(!(await t.finnes(".bt-rekord")), "Hjem-skjermen viser en rekord før noe er spilt");
  await t.klikk('[data-h="velg-modus"][data-v="bomba"]');

  // ---------- Setup: what the word must fit follows the level ----------
  const krav = () => t.js(`document.querySelector('[data-h="krav"][aria-pressed="true"]').dataset.v`);
  t.sjekk((await krav()) === "bokstav" && !(await t.finnes('[data-h="niva"]')) && !(await t.finnes('[data-h="jul"]')), "På barnenivå skal «Bokstav» være valgt – uten kategorinivå og julekategorier");
  await t.bilde("oppsett-bokstav", true);
  await t.klikk('[data-h="krav"][data-v="begge"]');
  t.sjekk((t.norsk ? /16 kategorier/ : / 16 /).test(await t.tekst(".skjerm-oppsett")), "«Begge» på barnenivå skal trekke blant de 16 brede kategoriene");
  await t.klikk('[data-h="niva"][data-v="familie"]');
  t.sjekk((t.norsk ? /27 kategorier/ : / 27 /).test(await t.tekst(".skjerm-oppsett")), "«Begge» på familienivå skal trekke blant 27 brede kategorier");
  await t.klikk('[data-h="jul"]');
  t.sjekk((t.norsk ? / 4 kategorier/ : / 4 /).test(await t.tekst(".skjerm-oppsett")), "Julekategoriene med bokstav skal være fire på familienivå");
  await t.klikk('[data-h="jul"]');
  t.sjekk((await t.js(`document.querySelector('[data-h="sistemann"]').getAttribute("aria-pressed")`)) === "false", "«Sistemann igjen» skal være av fra start");
  await t.bilde("oppsett-bomba", true);
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  await t.klikk('[data-h="start"]');
  await vent(".bt-kort");
  await t.sov(1500);
  await t.bilde("klar");
  await fri(".bt-kort", "klar");
  await fri(".bt-forst", "klar");
  let s = await sp();
  t.sjekk(s.krav === "begge" && s.sistemann === false && (await kat(s.kort.k)).b === 2 && /^[A-ZÆØÅ]$/.test(s.kort.b), `Kortet skal ha en bred kategori og en bokstav: ${JSON.stringify(s.kort)}`);
  t.sjekk(await t.finnes('.bt-hjerter[role="img"]'), "Hjertene mangler rolle for skjermlesere");

  // A new card gives a new category
  const forste = s.kort;
  await t.klikk('[data-h="nytt-kort"]', 1500);
  const andre = (await sp()).kort;
  t.sjekk(andre.k !== forste.k && (await kat(andre.k)).b === 2, "«Nytt kort» ga samme kategori (eller en smal)");

  // Back (Android back button) during the countdown: stay home, no hidden clock starts later
  await t.klikk('[data-h="bomba-start"]', 400);
  await t.js("history.back()");
  await vent('[data-h="fortsett"]', 4000);
  await t.sov(3200);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem" && !(await t.js("Rusj.S.spill.slutt")), "Spillet hoppet til runden etter at man gikk tilbake under nedtellingen");
  await t.klikk('[data-h="fortsett"]');
  await vent('[data-h="bomba-start"]');

  // ---------- The round: a new letter on every pass ----------
  await t.klikk('[data-h="bomba-start"]', 50);
  await vent(".skjerm-bomba", 8000);
  await t.sov(500);
  await t.bilde("trollet-sover");
  await fri(".bt-holder", "trollet sover");
  const start = await t.js("Rusj.S.spill.start");
  const bokstaver = [(await sp()).kort.b];
  await t.klikk('[data-h="send"]', 420);
  bokstaver.push((await sp()).kort.b);
  await t.klikk('[data-h="send"]', 420);
  bokstaver.push((await sp()).kort.b);
  s = await sp();
  t.sjekk(s.holder === (start + 2) % 3 && s.ord === 2, "«Send videre» flyttet ikke mobilen to plasser");
  t.sjekk(new Set(bokstaver).size === 3 && s.kort.k === andre.k, `Hver spiller skal få sin egen bokstav i samme kategori: ${bokstaver.join(" ")}`);
  t.sjekk((await t.tekst(".bt-kort .bt-bokstav")).trim() === s.kort.b, "Kortet viser ikke den nye bokstaven");
  // «Bytt bokstav»: a new letter for the same player – and the phone cannot be passed on while it spins
  t.sjekk((await t.finnes('.dokk [data-h="bytt-bokstav"]')) && (!t.norsk || (await t.tekst('.dokk [data-h="bytt-bokstav"]')).trim() === "Bytt bokstav"), "Mangler «Bytt bokstav» under «Send videre»");
  await t.klikk('[data-h="bytt-bokstav"]', 200);
  const byttet = await sp();
  t.sjekk(byttet.kort.b !== s.kort.b && byttet.holder === s.holder && (await t.js(`document.querySelector('[data-h="send"]').disabled`)), "«Bytt bokstav» skal gi ny bokstav til samme spiller og låse «Send videre» mens den snurrer");
  await t.js(`document.querySelector('[data-h="send"]').click()`);
  t.sjekk((await sp()).ord === 2, "Mobilen kunne sendes videre mens bokstaven snurret");
  await t.vent(`!document.querySelector('[data-h="send"]').disabled`, 5000);
  t.sjekk((await t.tekst(".bt-kort .bt-bokstav")).trim() === byttet.kort.b, "Bokstaven landet ikke på den nye etter byttet");

  // The troll wakes (the hidden timer is cut short)
  const holder = await t.js("Rusj.S.spill.holder");
  await t.js("Rusj.S.spill.slutt = Date.now()");
  await t.sov(350);
  await t.bilde("trollet-vakner");
  await vent(".skjerm-vakna", 6000);
  await t.bilde("hvem-holdt-mobilen");
  t.sjekk(await t.finnes(`.bt-spiller.trolig[data-v="${holder}"]`), "Mobilen foreslår ikke den som holdt den");
  await t.klikk(`[data-h="taper"][data-v="${holder}"]`);
  await t.bilde("mistet-hjerte");
  await fri(".bt-tap h1", "mistet hjerte");
  t.sjekk((await t.tilstand()).spill.liv[holder] === 2, "Hjertet ble ikke tatt");
  t.sjekk((t.norsk ? /2 ord før trollet våknet/ : /2/).test(await t.tekst(".bt-rundeord")), `Runden skal si hvor mange ord dere rakk: «${await t.tekst(".bt-rundeord")}»`);
  t.sjekk((await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("bokstavtrollet.rekord")}")).ord`)) === 2, "Rekorden (flest ord før trollet våknet) ble ikke lagret");

  // Undo, then pick again – it was Testspiller C
  await t.klikk('[data-h="angre"]');
  t.sjekk((await t.tilstand()).spill.liv[holder] === 3, "Angre ga ikke hjertet tilbake");
  await t.klikk('[data-h="taper"][data-v="2"]');

  // Reload, back to home and continue
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="neste-runde"]'), "Kom ikke tilbake til runden etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes('[data-h="fortsett"]')) && (t.norsk ? /2 ord/ : /2/).test(await t.tekst(".bt-rekord")), "Hjem-skjermen mangler «Fortsett» eller rekorden");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.klikk('[data-h="neste-runde"]');

  // ---------- Nobody is out: the last heart ends the game, equal hearts give a final ----------
  await runde(2);
  t.sjekk((await sp()).liv.join() === "3,3,1" && (await t.finnes('[data-h="neste-runde"]')), "Testspiller C skulle ha ett hjerte igjen og spillet gå videre");
  await t.klikk('[data-h="neste-runde"]');
  await runde(2);
  await t.bilde("siste-hjerte");
  s = await sp();
  t.sjekk(s.liv.join() === "3,3,0" && (!t.norsk || /mistet det siste hjertet/.test(await t.tekst("#skjerm h1"))), `Det siste hjertet: ${s.liv} «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(!(await t.finnes('[data-h="neste-runde"]')) && (await t.finnes('.dokk .knapp[data-h="finale"]')) && (!t.norsk || /finale/.test(await t.tekst(".bt-tap .ingress"))), "Like mange hjerter på topp skal gi finale, ikke flere runder");
  t.sjekk(!(await t.finnes(".bt-ute")) && (await t.antall(".bt-liv li")) === 3, "Ingen skal være «ute» når spillet slutter på det siste hjertet");
  await t.klikk('[data-h="finale"]');
  await vent(".bt-finale");
  await t.sov(1500);
  await t.bilde("finale");
  await fri(".bt-kort", "finalen");
  s = await sp();
  t.sjekk(s.finale.join() === "0,1" && [0, 1].includes(s.start) && (await t.antall(".bt-liv li")) === 2 && (!t.norsk || /Finalen/i.test(await t.tekst("#topp-tittel"))), `Finalen skal stå mellom A og B: ${JSON.stringify(s.finale)}`);
  await runde(null, 2);
  t.sjekk((await t.js("Rusj.S.spill.holder")) === s.start && (await t.antall('[data-h="taper"]')) === 2, "I finalen skal mobilen bare gå mellom finalistene");
  await t.klikk('[data-h="taper"][data-v="0"]');
  t.sjekk((!t.norsk || /røk ut av finalen/.test(await t.tekst("#skjerm h1"))) && (await sp()).liv.join() === "3,3,0", "Finalen skal ikke ta hjerter – den som holdt mobilen, ryker ut");
  // Undo works in the final too – it was Testspiller B
  await t.klikk('[data-h="angre"]');
  t.sjekk((await sp()).finale.join() === "0,1", "Angre i finalen satte ikke finalisten inn igjen");
  await t.klikk('[data-h="taper"][data-v="1"]');
  await t.bilde("ute-av-finalen");
  t.sjekk(t.norsk ? /Til kåringen/.test(await t.tekst(".dokk .knapp")) : await t.finnes('.dokk .knapp[data-h="bomba-vinner"]'), `Etter finalen skal knappen lede «Til kåringen»: «${await t.tekst(".dokk .knapp")}»`);
  await t.klikk('[data-h="bomba-vinner"]');
  await vent(".skjerm-vinner");
  await t.bilde("vinner-bomba", true);
  await fri(".banner h1", "kåringen");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")) && (!t.norsk || (/Testspiller A vinner/.test(await t.tekst("#skjerm h1")) && /Vant finalen/i.test(await t.tekst(".banner .etikett")))), "Vinneren av finalen vises ikke");
  t.sjekk((await t.js(`Array.from(document.querySelectorAll(".bt-rekke li")).map((li) => li.querySelector(".bt-plass").textContent + li.querySelector(".bt-pr-navn").textContent.slice(-1)).join(" ")`)) === "1A 2B 3C" && (await t.antall(".bt-rekke li.vinner")) === 1, "Kåringen skal vise plassene etter finalen");
  t.sjekk((await kveld()).join("|") === "A1 B2 C3", `Bomba ble ikke meldt til «Kveldens gjeng»: ${(await kveld()).join("|")}`);
  t.sjekk(await t.finnes(`.flere-spill, a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");
  t.sjekk((!t.norsk || (await t.tekst("#topp-tittel")).trim().toLowerCase() === "kåringen") && (await t.tilstand())._aktiv === false, "Sluttskjermen heter ikke «Kåringen», eller spillet regnes som pågående");

  // ---------- «Kategori»: no letter; «Avslutt» before anything has happened clears the game ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="krav"][data-v="kategori"]');
  t.sjekk(!(await t.finnes('[data-h="vanskelig"]')) && (await t.finnes('[data-h="niva"]')), "«Kategori» trenger nivå, men ikke vanskelige bokstaver");
  await t.klikk('[data-h="start"]');
  await vent(".bt-kort .bt-bokstav.bilde");
  await t.sov(800);
  await t.bilde("klar-kategori");
  s = await sp();
  const k = await kat(s.kort.k);
  t.sjekk(s.kort.b === "" && k.b >= 1 && !k.kun && (!t.norsk || /si noe som passer/.test(await t.tekst(".bt-kort"))), `«Kategori» skal gi en bred kategori uten bokstav: ${JSON.stringify(k)}`);
  await t.klikk('[data-h="bomba-start"]', 50);
  await vent(".skjerm-bomba", 8000);
  await t.sov(300);
  await t.klikk('[data-h="send"]', 420);
  t.sjekk((await sp()).kort.b === "" && !(await t.finnes('[data-h="bytt-bokstav"]')) && (await t.finnes(".bt-hvisk")), "Uten bokstav skal det ikke finnes «Bytt bokstav»");
  await t.bilde("trollet-sover-kategori");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="fortsett"]');
  await vent('[data-h="bomba-start"]');
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(!t.norsk || (/blir borte/.test(await t.tekst("#ark .ingress")) && (await t.tekst('#ark [data-v="nei"]')).trim() === "Spill videre"), `«Avslutt» før noen har mistet et hjerte: «${await t.tekst("#ark .ingress")}»`);
  await t.klikk('#ark [data-v="ja"]');
  await vent(".bt-moduser");
  t.sjekk((await t.tilstand()).spill === null, "«Avslutt» før noe har skjedd skal fjerne spillet");

  // ---------- «Bokstav» + «Sistemann igjen»: the knock-out rule, two players ----------
  await t.klikk('[data-h="velg-modus"][data-v="bomba"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  await t.klikk('[data-h="krav"][data-v="bokstav"]');
  await t.klikk('[data-h="sistemann"]');
  await t.bilde("oppsett-sistemann", true);
  await t.klikk('[data-h="start"]');
  await vent(".bt-kort");
  await t.sov(1500);
  s = await sp();
  t.sjekk(s.kort.k === -1 && s.sistemann === true && (!t.norsk || /Et ord\s+som begynner på/.test((await t.tekst(".bt-kort")).replace(/\s+/g, " "))), `«Bokstav» skal gi et kort uten kategori: «${(await t.tekst(".bt-kort")).replace(/\s+/g, " ")}»`);
  t.sjekk(!t.norsk || (await t.tekst('.dokk [data-h="nytt-kort"]')).trim() === "Ny bokstav", "Lenken for nytt kort skal hete «Ny bokstav» uten kategori");
  await t.bilde("klar-bokstav");
  await runde(1);
  // «Avslutt» after a heart is lost goes to «Kåringen» – «Spill videre» stays
  await t.klikk('[data-h="neste-runde"]');
  await vent('[data-h="bomba-start"]');
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(!t.norsk || /flest hjerter nå, vinner/.test(await t.tekst("#ark .ingress")), `«Avslutt» etter et tapt hjerte: «${await t.tekst("#ark .ingress")}»`);
  await t.klikk('#ark [data-v="nei"]');
  await runde(1);
  await t.klikk('[data-h="neste-runde"]');
  await runde(1);
  await t.bilde("ute");
  t.sjekk((await t.finnes(".bt-liv .bt-ute")) && (!t.norsk || (/er ute!/.test(await t.tekst("#skjerm h1")) && /Til kåringen/.test(await t.tekst(".dokk .knapp")))), "Med «Sistemann igjen» skal den uten hjerter være ute");
  await t.klikk('[data-h="bomba-vinner"]');
  await vent(".skjerm-vinner");
  await t.bilde("vinner-sistemann", true);
  t.sjekk((t.norsk ? /Testspiller A vinner/ : /Testspiller A/).test(await t.tekst("#skjerm h1")) && (await kveld())[1] === "A1 B2", "Vinneren av «Sistemann igjen» vises ikke");

  // ---------- Bokstavjakt: the game is chosen on the home screen (once) ----------
  await t.klikk("#tilbake");
  await t.klikk('[data-h="velg-modus"][data-v="jakt"]');
  t.sjekk(!(await t.finnes('[data-h="modus"]')) && !(await t.finnes('[data-h="krav"]')), "Leken velges to ganger (også i oppsettet)");
  await t.klikk('[data-h="tid"][data-v="60"]');
  t.sjekk((await t.js(`document.querySelector('[data-h="lengde"][aria-pressed="true"]').dataset.v`)) === "3", "Bokstavjakt skal ha tre runder som standard");
  await t.klikk('[data-h="jul"]');
  await t.bilde("oppsett-jakt", true);
  await t.klikk('[data-h="start"]');
  await vent('[data-h="jakt-trekk"]');
  t.sjekk((t.norsk ? /Runde 1 av 3/i : /1\D+3/).test(await t.tekst("#topp-tittel")), `Bokstavjakt skal si hvor langt dere er kommet: «${await t.tekst("#topp-tittel")}»`);
  await t.bilde("jakt-klar");
  await t.klikk('[data-h="jakt-trekk"]');
  await t.vent("document.querySelector('.bt-kategorier:not(.skjult)') && !document.querySelector('[data-h=\"jakt-ferdig\"]').disabled", 8000);
  await t.sov(1200);
  await t.bilde("jakt-skriv");
  let r = (await sp()).r;
  const bokstav = r.b;
  t.sjekk((await Promise.all(r.k.map(kat))).every((x) => x.jul), "Med julekategorier på skal alle fem kategoriene være fra julesettet");

  // Reload while writing: same letter, the clock goes on
  await t.lastSide(t.side, "document.querySelector('.bt-kategorier')");
  r = (await t.tilstand()).spill.r;
  t.sjekk(r.b === bokstav && r.fase === "skriv" && r.igjen > 0 && r.igjen <= 60, "Runden ble ikke gjenopptatt etter omlasting");

  // Time runs out – and the page is reloaded during «Blyantene ned!»: it must land on the scoring
  await t.vent("window.Rusj.timer('jakt-tid')");
  await t.js("Rusj.timer('jakt-tid').leggTil(-500)");
  await t.vent("Rusj.S.spill.r.fase === 'poeng'", 4000);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "jakt", "«Blyantene ned!» ble ikke vist");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await vent(".skjerm-jakt-poeng", 4000);
  await t.bilde("jakt-poeng");
  // A row nobody has scored is marked – the group cannot move on with a silent 0
  await t.klikk('[data-h="poeng"][data-v="0:2"]', 80);
  await t.klikk('[data-h="kat-neste"]');
  t.sjekk((await t.antall(".bt-poengrader li.mangler")) === 1 && (!t.norsk || /Mangler poeng/.test(await t.tekst(".bt-poengrader li.mangler"))) && (await t.js("Rusj.S.spill.r.nr")) === 0, "En rad uten poeng skal merkes, og kategorien bli stående");
  await t.bilde("jakt-mangler-poeng");
  await fri(".bt-poengrader li.mangler", "mangler poeng");
  // Scores a whole round: a points per category for the first player, b for the second
  const gi = async (a, b) => {
    for (let n = 0; n < 5; n++) {
      await t.klikk(`[data-h="poeng"][data-v="0:${a}"]`, 80);
      await t.klikk(`[data-h="poeng"][data-v="1:${b}"]`, 80);
      await t.klikk('[data-h="kat-neste"]');
    }
  };
  await t.klikk('[data-h="poeng"][data-v="1:1"]', 80);
  t.sjekk(!(await t.finnes(".bt-poengrader li.mangler")), "Merket for manglende poeng ble stående etter at poengene var satt");
  await t.bilde("jakt-poeng-satt");
  await t.klikk('[data-h="kat-neste"]');
  for (let n = 1; n < 5; n++) {
    await t.klikk('[data-h="poeng"][data-v="0:2"]', 80);
    await t.klikk('[data-h="poeng"][data-v="1:1"]', 80);
    await t.klikk('[data-h="kat-neste"]');
  }
  await vent(".skjerm-jakt-stilling");
  await t.bilde("jakt-stilling");
  t.sjekk((await t.tilstand()).spill.poeng.join() === "10,5", "Poengene ble ikke summert riktig");

  // Points can be undone until the next round starts
  await t.klikk('[data-h="endre-poeng"]');
  await vent(".skjerm-jakt-poeng");
  t.sjekk((await t.tilstand()).spill.poeng.join() === "0,0", "«Endre poengene» trakk ikke runden fra igjen");
  await t.klikk('[data-h="kat-neste"]');
  await vent(".skjerm-jakt-stilling");
  t.sjekk((await t.tilstand()).spill.poeng.join() === "10,5", "Poengene ble ikke lagt til igjen");
  t.sjekk((await t.finnes('[data-h="avslutt"]')) && (!t.norsk || ((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt" && /Ny runde/.test(await t.tekst(".dokk .knapp")))), "Etter første runde skal det stå «Ny runde» og «Avslutt»");

  // The next rounds: draw, let the time run out, score
  const jaktrunde = async (a, b) => {
    await t.klikk('[data-h="jakt-ny-runde"]');
    await t.klikk('[data-h="jakt-trekk"]');
    await t.vent("Rusj.S.spill.r && Rusj.S.spill.r.fase === 'skriv' && window.Rusj.timer('jakt-tid')", 8000);
    await t.js("Rusj.timer('jakt-tid').leggTil(-500)");
    await vent(".skjerm-jakt-poeng", 6000);
    await gi(a, b);
    await vent(".skjerm-jakt-stilling");
  };
  await jaktrunde(0, 1);
  t.sjekk((await t.tilstand()).spill.poeng.join() === "10,10" && (!t.norsk || /Runde 2 av 3 er ferdig/i.test(await t.tekst(".banner .etikett"))), "Runde to ble ikke talt riktig");
  // Round three ends level: one extra round decides
  await jaktrunde(1, 1);
  await t.bilde("jakt-likt");
  t.sjekk(!t.norsk || (/står likt!/.test(await t.tekst("#skjerm h1")) && /Ekstrarunde/.test(await t.tekst(".dokk .knapp")) && /ekstrarunde avgjør/.test(await t.tekst(".banner .ingress"))), `Likt etter siste runde skal gi én ekstrarunde: «${await t.tekst("#skjerm h1")}»`);
  await jaktrunde(2, 0);
  await t.bilde("jakt-siste-stilling");
  t.sjekk((await t.tilstand()).spill.poeng.join() === "25,15" && (t.norsk ? /Til kåringen/.test(await t.tekst(".dokk .knapp")) : await t.finnes('.dokk .knapp[data-h="jakt-karing"]')) && !(await t.finnes('[data-h="avslutt"]')), "Etter ekstrarunden skal spillet lede «Til kåringen» av seg selv");
  await t.klikk('[data-h="jakt-karing"]');
  await vent(".skjerm-vinner");
  await t.bilde("vinner-jakt", true);
  t.sjekk((t.norsk ? /Testspiller A vinner/ : /Testspiller A/).test(await t.tekst("#skjerm h1")), "Vinneren av Bokstavjakt vises ikke");
  if (t.norsk) t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === "kåringen", "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk((await t.tilstand())._aktiv === false && (await kveld())[2] === "A1 B2", "Bokstavjakt ble ikke meldt til «Kveldens gjeng», eller regnes som pågående");

  // ---------- A game saved by the first version keeps its rules (category + letter, knock-out) ----------
  await t.js(`localStorage.setItem("${t.nokkel("bokstavtrollet.v1")}", JSON.stringify({ skjerm: "klar", antall: 3, _tid: Date.now(),
    oppsett: { modus: "bomba", niva: "familie", vanskelig: false, sovn: "normalt", tid: 90 },
    spill: { modus: "bomba", antall: 3, niva: "familie", vanskelig: false, brukt: ["K"], runde: 2, ferdig: false, sovn: "normalt", liv: [3, 2, 3], ute: [], start: 1, holder: 1, ord: 0, slutt: 0, kort: { k: 2, b: "K" } } }))`);
  await t.lastSide(t.side, "document.querySelector('.bt-kort')");
  s = await sp();
  t.sjekk(s.krav === "begge" && s.sistemann === true && s.kort.k === 2 && s.kort.b === "K" && s.finale === null, `Et gammelt lagret spill ble ikke ført over: ${JSON.stringify({ krav: s.krav, sistemann: s.sistemann, kort: s.kort })}`);
  t.sjekk((await t.js("Rusj.S.oppsett.krav")) === null && (await t.js("Rusj.S.oppsett.lengde")) === "3", "Et gammelt oppsett fikk ikke de nye valgene");
  await runde(1, 1);
  t.sjekk((await sp()).liv.join() === "3,1,3" && (await sp()).kort.b !== "K", "Det gamle spillet gikk ikke videre med ny bokstav for hver spiller");
}
