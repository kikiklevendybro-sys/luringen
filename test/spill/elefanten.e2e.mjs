// Elefanten (find two alike).
// 1 Two players on the rusj-gjengen board: an odd number of pairs is offered (there is always a
//   winner), a miss passes the turn, a pair gives an extra turn, reload and back + continue
//   mid-game, the winner screen, the result in «Kveldens gjeng».
// 2 Three players end level: a tie-break on a small board for those who share the lead (twice,
//   the second time only two of them) – never a shared win.
// 3 Against the elephant: the old elephant (forgets nothing) always takes a pair it has seen both
//   cards of; taps wait while it plays; a reload in the middle of its move; the same seed gives the
//   same moves; a win is counted on the home screen and never sent to «Kveldens gjeng».
// 4 Alone on 30 cards that must fit the screen (also at 320 px): stars, a record, «2 trekk fra
//   rekorden», «Kikk først» (a practice game that never touches the record), sharing.
// 5 The Christmas pictures: offered in season only.
export default async function (t) {
  const kortet = (i) => `.ele-kort[data-v="${i}"]`;
  const spillet = async () => (await t.tilstand()).spill;
  const kveld = () => t.js(`(JSON.parse(localStorage.getItem("rusj.kveld") || "{}").spill || []).filter((s) => s.id === "elefanten")`);
  const toppTittel = async () => (await t.tekst("#topp-tittel")).trim().toLowerCase();
  const hoy = (await t.js("window.innerHeight")) >= 800;
  // The cards that are not found yet, by face: Map(face → [card, card])
  const igjen = (sp) => {
    const m = new Map();
    sp.kort.forEach((k, i) => {
      if (sp.funnet[i] < 0) m.set(k, [...(m.get(k) || []), i]);
    });
    return m;
  };
  // The player whose turn it is finds n pairs in a row.
  async function finnPar(n) {
    for (let x = 0; x < n; x++) {
      const [a, b] = igjen(await spillet()).values().next().value;
      await t.klikk(kortet(a), 90);
      await t.klikk(kortet(b), 150);
    }
  }
  // The player whose turn it is turns two cards that are not alike, and they turn back.
  async function bom() {
    const [[a], [b]] = Array.from(igjen(await spillet()).values());
    await t.klikk(kortet(a), 90);
    await t.klikk(kortet(b), 150);
    await t.sov(1450);
  }
  const brettFarPlass = async (hvor) => {
    t.sjekk(await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1"), `Brettet får ikke plass uten å scrolle (${hvor})`);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Brettet er for bredt (${hvor})`);
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  t.sjekk(!/memory/i.test(await t.js("document.body.innerText")), "Ordet «memory» står på hjem-skjermen");
  await t.klikk("#reglerknapp");
  t.sjekk(!/memory/i.test(await t.tekst("#ark")) && /elefanten/i.test(await t.tekst("#ark")), "Reglene nevner ikke elefanten (eller bruker ordet «memory»)");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- 1 Two players ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall('.ele-tre [data-h="modus"]')) === 3 && (await t.js(`document.querySelector('[data-h="modus"][data-v="alene"]').getAttribute("aria-pressed")`)) === "true", "Oppsettet starter ikke med de tre måtene å spille på («Alene» valgt)");
  t.sjekk(!(await t.finnes("#spillerboks")) && !(await t.finnes('[data-h="styrke"]')), "«Alene» viser spillerliste eller elefantstyrke");
  t.sjekk((await t.js(`Array.from(document.querySelectorAll('[data-h="storrelse"]')).map((k) => k.dataset.v).join()`)) === "12,16,20,24,30", "Alene skal tilby 12–30 kort");
  await t.bilde("oppsett-alene", true);
  await t.klikk('[data-h="modus"][data-v="sammen"]');
  // Two players: an odd number of pairs, so there is always a winner
  t.sjekk((await t.js(`Array.from(document.querySelectorAll('[data-h="storrelse"]')).map((k) => k.dataset.v).join()`)) === "14,18,22,26,30", "To spillere skal tilbys et oddetall par (14, 18, 22, 26 eller 30 kort)");
  await t.klikk('[data-h="tema"][data-v="gjengen"]');
  await t.klikk('[data-h="storrelse"][data-v="14"]');
  t.sjekk((await t.tekst('.dokk [data-h="start"]')).trim() === "Start", "Startknappen skal være ren tekst");
  await t.bilde("oppsett", true);
  t.sjekk((await t.tilstand()).antall === 2, "Sammen starter ikke med to spillere");
  t.sjekk(!/memory/i.test(await t.js("document.body.innerText")), "Ordet «memory» står i oppsettet");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 14");
  await t.sov(900);
  await brettFarPlass("14 kort");

  const kort = (await spillet()).kort;
  const par = (k) => [kort.indexOf(k), kort.lastIndexOf(k)];

  // A miss: the turn goes to player 2
  const ulik = kort.findIndex((k) => k !== kort[0]);
  await t.klikk(kortet(0), 120);
  await t.klikk(kortet(ulik), 500);
  await t.bilde("to-ulike");
  let s = await t.tilstand();
  t.sjekk(s.spill.trekk === 1 && s.spill.tur === 1, "Turen gikk ikke videre etter to ulike kort");
  await t.sov(1100);
  t.sjekk((await t.antall(".ele-kort.opp")) === 0, "Ulike kort snudde seg ikke tilbake");

  // A pair: point and an extra turn for player 2
  const [p1, p2] = par(kort[0]);
  await t.klikk(kortet(p1), 120);
  await t.klikk(kortet(p2), 450);
  await t.bilde("par");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 1 && s.spill.tur === 1, "Et par ga ikke poeng og ekstra tur");
  t.sjekk((await t.antall(".ele-kort.funnet")) === 2, "Paret ble ikke markert som funnet");

  // One card up, then reload: found pairs stay, the half move is kept
  const neste = kort.find((k) => k !== kort[0]);
  const [n1, n2] = par(neste);
  await t.klikk(kortet(n1), 300);
  await t.lastSide(t.side, "document.querySelector('.ele-kort')");
  t.sjekk((await t.antall(".ele-kort.funnet")) === 2, "Funnet par forsvant etter omlasting");
  t.sjekk((await t.antall(".ele-kort.opp:not(.funnet)")) === 1, "Det snudde kortet forsvant etter omlasting");
  await t.klikk(kortet(n2), 450);
  t.sjekk((await spillet()).poeng[1] === 2, "Paret etter omlasting ble ikke telt");

  // Back to home and continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ele-kort')");

  // Player 2 clears the board
  await finnPar(5);
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.bilde("vinner", true);
  t.sjekk(/Testspiller B vinner/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke");
  t.sjekk((await toppTittel()) === "kåringen", "Resultatet for flere spillere heter ikke «Kåringen»");
  let k = await kveld();
  t.sjekk(k.length === 1 && k[0].resultat.map((r) => r.plass).join() === "1,2", `Resultatet ble ikke sendt til Kveldens gjeng (${JSON.stringify(k)})`);

  // ---------- 2 Three players, level at the top: a tie-break ----------
  await t.klikk('.lenkerad [data-h="nytt"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  t.sjekk((await t.js(`Array.from(document.querySelectorAll('[data-h="storrelse"]')).map((k) => k.dataset.v).join()`)) === "12,16,20,24,30", "Tre spillere skal tilbys 12–30 kort");
  await t.klikk('[data-h="tema"][data-v="dyr"]');
  await t.klikk('[data-h="storrelse"][data-v="12"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 12");
  await t.sov(700);
  // Two pairs each
  await finnPar(2);
  await bom();
  await finnPar(2);
  await bom();
  await finnPar(2);
  await t.vent("document.querySelector('.skjerm-omkamp')", 9000);
  await t.sov(400);
  await t.bilde("omkamp");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join() === "2,2,2" && s.spill.omkamp === 1 && s.spill.med.join() === "0,1,2" && !s.spill.ferdig, `Tre like ga ikke omkamp (${JSON.stringify({ p: s.spill.poeng, o: s.spill.omkamp, med: s.spill.med })})`);
  t.sjekk(s.spill.kort.length === 10, `Omkampen for tre skal ha fem par (${s.spill.kort.length} kort)`);
  t.sjekk((await kveld()).length === 1, "Et spill som ikke er avgjort, ble sendt til Kveldens gjeng");
  // A reload here comes back to the introduction of the tie-break; so does «Fortsett» from the home screen
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.js("Rusj.S.skjerm")) === "omkamp" && (await t.finnes('[data-h="start-omkamp"]')), "Omkampen forsvant etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(/omkamp/.test(await t.tekst('[data-h="fortsett"]')), `«Fortsett» sier ikke at det er omkamp («${await t.tekst('[data-h="fortsett"]')}»)`);
  await t.klikk('[data-h="fortsett"]');
  t.sjekk((await t.js("Rusj.S.skjerm")) === "omkamp", "«Fortsett» gikk ikke til omkampen");
  await t.klikk('[data-h="start-omkamp"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 10");
  await t.sov(700);
  await brettFarPlass("omkamp, 10 kort");
  await t.bilde("omkamp-brett");
  // A two pairs, B two pairs, C one: A and B still share the lead
  await finnPar(2); // A
  await bom();
  await bom(); // B misses
  await finnPar(1); // C
  await bom();
  await bom(); // A misses
  await finnPar(2); // B takes the last two
  await t.vent("document.querySelector('.skjerm-omkamp')", 9000);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join() === "4,4,3" && s.spill.omkamp === 2 && s.spill.med.join() === "0,1" && s.spill.kort.length === 6, `Fortsatt likt mellom to skulle gi en ny omkamp med tre par (${JSON.stringify({ p: s.spill.poeng, o: s.spill.omkamp, med: s.spill.med, n: s.spill.kort.length })})`);
  await t.klikk('[data-h="start-omkamp"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 6");
  await t.sov(600);
  t.sjekk((await t.antall(".ele-spiller.ute")) === 1, "Den som ikke er med i omkampen, er ikke dempet");
  await t.bilde("omkamp-to");
  // A misses, and the turn goes to B – never to C, who is not in the tie-break
  await bom();
  t.sjekk((await spillet()).tur === 1, "Turen i omkampen gikk ikke til den andre som står likt");
  await bom();
  t.sjekk((await spillet()).tur === 0, "Turen i omkampen gikk til en som ikke er med");
  await finnPar(3);
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.bilde("vinner-omkamp", true);
  s = await t.tilstand();
  t.sjekk(/Testspiller A vinner/.test(await t.tekst("#skjerm h1")) && /omkampen/i.test(await t.tekst(".banner .etikett")), "Vinneren av omkampen vises ikke");
  t.sjekk(s.spill.poeng.join() === "7,4,3" && s.spill.ferdig && s.spill.fant.length === 14, `Parene etter omkampen ble feil (${s.spill.poeng.join()}, ${s.spill.fant.length} par)`);
  k = await kveld();
  t.sjekk(k.length === 2 && k[1].resultat.map((r) => r.plass).join() === "1,2,3", `Resultatet etter omkampen ble ikke sendt til Kveldens gjeng med én vinner (${JSON.stringify(k[1])})`);

  // ---------- 3 Against the elephant ----------
  await t.klikk('.lenkerad [data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="elefant"]');
  t.sjekk((await t.antall('[data-h="styrke"]')) === 3 && !(await t.finnes("#spillerboks")), "«Mot elefanten» viser ikke de tre styrkene (eller viser spillerlista)");
  t.sjekk((await t.js(`Array.from(document.querySelectorAll('[data-h="storrelse"]')).map((k) => k.dataset.v).join()`)) === "14,18,22,26,30", "Mot elefanten skal tilby et oddetall par");
  await t.klikk('[data-h="styrke"][data-v="gammel"]');
  await t.klikk('[data-h="storrelse"][data-v="14"]');
  await t.bilde("oppsett-elefant", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 14");
  await t.sov(900);
  s = await t.tilstand();
  t.sjekk(s.spill.motstander === "gammel" && s.spill.antall === 2 && s.spill.tur === 0 && Number.isFinite(s.spill.efro), "Spillet mot elefanten startet ikke med deg først og elefanten som motstander");
  t.sjekk(/Du/.test(await t.tekst(".ele-hud")) && /Elefanten/.test(await t.tekst(".ele-hud")), `Poengene viser ikke «Du» og «Elefanten» («${await t.tekst(".ele-hud")}»)`);
  if (hoy) t.sjekk(await t.js("!document.querySelector('.ele-venn').hidden"), "Elefanten sitter ikke under brettet når det er plass");
  await brettFarPlass("mot elefanten");
  await t.bilde("elefant-start");

  // The elephant's whole turn: over when it is your turn again and no cards wait to turn back.
  const elefantFerdig = () => t.vent(`Rusj.S.spill.ferdig || (Rusj.S.spill.tur === 0 && !Rusj.S.spill.opp.length && !document.querySelector(".ele-kort.opp:not(.funnet)"))`, 30000);
  // You miss: the cards turn back, and the elephant plays
  await (async () => {
    const [[a], [b]] = Array.from(igjen(await spillet()).values());
    await t.klikk(kortet(a), 90);
    await t.klikk(kortet(b), 200);
    s = await t.tilstand();
    t.sjekk(s.spill.tur === 1 && s.spill.husk.includes(a) && s.spill.husk.includes(b), "Den gamle elefanten husker ikke kortene du snudde");
    // A tap while the turn is the elephant's only hurries the cards back: it never turns a card for you
    const c = (await spillet()).kort.findIndex((_, i) => i !== a && i !== b);
    await t.klikk(kortet(c), 60);
    s = await t.tilstand();
    t.sjekk(s.spill.tur === 1 && !s.spill.opp.includes(c) && s.spill.trekk === 1 && (await t.antall(".ele-kort.opp:not(.funnet)")) === 0, "Et trykk i elefantens tur snudde et kort");
    await t.vent("Rusj.S.spill.opp.length === 1 || Rusj.S.spill.trekk > 1", 8000);
    await t.bilde("elefantens-tur");
  })();
  await elefantFerdig();
  // The elephant has now seen one card of several pairs. You show it the other card of one of
  // them (and miss): it must take that pair, first thing in its turn.
  s = await t.tilstand();
  if (!s.spill.ferdig) {
    const sp = s.spill;
    const halvkjent = Array.from(igjen(sp).values()).find(([x, y]) => sp.husk.includes(x) !== sp.husk.includes(y));
    t.sjekk(!!halvkjent, "Fant ikke noe par som elefanten har sett ett kort av");
    if (halvkjent) {
      const [kjent, ukjent] = sp.husk.includes(halvkjent[0]) ? halvkjent : [halvkjent[1], halvkjent[0]];
      const annet = sp.kort.findIndex((f, i) => sp.funnet[i] < 0 && f !== sp.kort[kjent]);
      await t.klikk(kortet(ukjent), 90);
      await t.klikk(kortet(annet), 200);
      await elefantFerdig();
      s = await t.tilstand();
      t.sjekk(s.spill.funnet[kjent] === 1 && s.spill.funnet[ukjent] === 1, "Den gamle elefanten tok ikke paret den hadde sett begge kortene av");
      t.sjekk((await t.antall(".ele-kort.funnet")) >= 2 && /🐘/.test(await t.tekst(".ele-kort.funnet .ele-merke")), "Elefantens par er ikke merket");
    }
  }
  // A reload in the middle of the elephant's move: it carries on, and the turn comes back to you
  s = await t.tilstand();
  if (!s.spill.ferdig && igjen(s.spill).size >= 2) {
    const [[a], [b]] = Array.from(igjen(s.spill).values());
    await t.klikk(kortet(a), 90);
    await t.klikk(kortet(b), 200);
    await t.vent("Rusj.S.spill.ferdig || (Rusj.S.spill.tur === 1 && Rusj.S.spill.opp.length === 1) || Rusj.S.spill.tur === 0", 12000);
    await t.lastSide(t.side, "document.querySelector('.ele-kort')");
    await elefantFerdig();
    s = await t.tilstand();
    t.sjekk(s.spill.ferdig || s.spill.tur === 0, "Elefanten ble stående etter omlasting midt i trekket");
  }
  // You take the rest
  s = await t.tilstand();
  if (!s.spill.ferdig) await finnPar(igjen(s.spill).size);
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.sov(600);
  await t.bilde("elefant-resultat", true);
  s = await t.tilstand();
  const vant = s.spill.poeng[0] > s.spill.poeng[1];
  t.sjekk(s.spill.poeng[0] + s.spill.poeng[1] === 7 && s.spill.poeng[0] !== s.spill.poeng[1], `Parene mot elefanten ble feil (${s.spill.poeng.join()})`);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === (vant ? "Du vant!" : "Elefanten vant!"), `Resultatet mot elefanten stemmer ikke med parene («${await t.tekst("#skjerm h1")}», ${s.spill.poeng.join()})`);
  t.sjekk((await toppTittel()) === "mot elefanten", `Resultatet mot elefanten heter «${await toppTittel()}»`);
  t.sjekk(s.elefant.gammel.spilt === 1 && s.elefant.gammel.seirer === (vant ? 1 : 0), `Spillet mot den gamle elefanten ble ikke talt (${JSON.stringify(s.elefant.gammel)})`);
  t.sjekk((await kveld()).length === 2, "Et spill mot elefanten ble sendt til Kveldens gjeng");

  // The same seed gives the same moves: the elephant's dice live in the saved game.
  await t.klikk('.lenkerad [data-h="nytt"]');
  await t.klikk('[data-h="styrke"][data-v="unge"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 14");
  const likt = (await spillet()).kort;
  const medFro = async () => {
    await t.js(`(() => { const sp = Rusj.S.spill; sp.kort = ${JSON.stringify(likt)}; sp.funnet = sp.kort.map(() => -1); sp.opp = []; sp.husk = []; sp.poeng = [0, 0]; sp.fant = []; sp.trekk = 0; sp.tur = 0; sp.efro = 20261110; Rusj.vis(); })()`);
    const a = 0;
    const b = likt.findIndex((f) => f !== likt[0]);
    await t.klikk(kortet(a), 90);
    await t.klikk(kortet(b), 200);
    await elefantFerdig();
    const sp = await spillet();
    return JSON.stringify([sp.funnet, sp.husk, sp.trekk, sp.poeng, sp.efro]);
  };
  const forste = await medFro();
  const andre = await medFro();
  t.sjekk(forste === andre, `Samme frø ga ikke samme trekk fra elefanten:\n      ${forste}\n      ${andre}`);
  t.sjekk(JSON.parse(forste)[2] >= 2, "Elefantungen gjorde ikke noe trekk");
  // You take every pair that is left: a win against the calf
  await finnPar(igjen(await spillet()).size);
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.sov(600);
  await t.bilde("elefant-seier");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[0] > s.spill.poeng[1] && (await t.tekst("#skjerm h1")).trim() === "Du vant!" && s.elefant.unge.seirer === 1, `Seieren mot elefantungen ble ikke talt (${s.spill.poeng.join()}, ${JSON.stringify(s.elefant.unge)})`);
  t.sjekk((await t.finnes('[data-h="sterkere"]')) && /elefant/.test(await t.tekst('[data-h="sterkere"]')), "Etter en seier tilbys ikke en sterkere elefant");
  await t.js(`navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }`);
  await t.klikk('[data-h="del"]');
  let delt = await t.js("window.__delt || null");
  t.sjekk(delt && /elefantungen/.test(delt.text) && delt.url === "https://rusj.no/elefanten/" && !/memory/i.test(delt.text), `«Del resultatet» delte ikke seieren (${JSON.stringify(delt)})`);
  // «Prøv mot elefant»: the same game against the next one up
  await t.klikk('[data-h="sterkere"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 14");
  s = await t.tilstand();
  t.sjekk(s.spill.motstander === "voksen" && s.oppsett.styrke === "voksen", "«Prøv mot elefant» startet ikke mot den neste elefanten");
  // The win is on the home screen
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.ele-rekorder')");
  t.sjekk(/Elefantunge/.test(await t.tekst(".ele-rekorder")) && /1 seier/.test(await t.tekst(".ele-rekorder")), `Seieren mot elefanten vises ikke på hjem-skjermen («${await t.tekst(".ele-rekorder")}»)`);
  await t.bilde("hjem-seier");

  // ---------- 4 Alone on 30 cards ----------
  await t.klikk('[data-h="nytt"]');
  // The unfinished game against the elephant is never thrown away without asking – and you are asked as «du»
  t.sjekk(/du holder på med/.test(await t.tekst("#ark")), "Spør ikke (eller ikke med «du») før spillet mot elefanten blir erstattet");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="modus"][data-v="alene"]');
  await t.klikk('[data-h="tema"][data-v="dyr"]');
  await t.klikk('[data-h="storrelse"][data-v="30"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 30");
  await t.sov(1400);
  const solo = (await spillet()).kort;
  const soloPar = (f) => [solo.indexOf(f), solo.lastIndexOf(f)];
  t.sjekk(await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1"), "30 kort får ikke plass uten å scrolle");
  // Two real finger taps in quick succession (the kit's ghost-tap guard must not swallow the second)
  const forsteUlik = solo.findIndex((f) => f !== solo[0]);
  await t.trykk(kortet(0));
  await t.trykk(kortet(forsteUlik));
  s = await t.tilstand();
  t.sjekk(s.spill.trekk === 1 && (await t.antall(".ele-kort.opp")) === 2, "Raske, ekte trykk snudde ikke begge kortene");
  await t.sov(250);
  await t.bilde("solo-30");

  // The smallest phone, then back to the size the runner started with (390×844 or --bredde/--hoyde).
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(1300);
  t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), "Brettet er for bredt på 320 px");
  t.sjekk(await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1"), "30 kort får ikke plass uten å scrolle på 320×568");
  await t.bilde("solo-30-320px");
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  for (const f of [...new Set(solo)]) {
    const [x, y] = soloPar(f);
    await t.klikk(kortet(x), 80);
    await t.klikk(kortet(y), 120);
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.sov(1200);
  await t.bilde("solo-ferdig");
  s = await t.tilstand();
  t.sjekk(s.rekorder && s.rekorder["30"] && s.rekorder["30"].trekk === 16 && s.rekorder["30"].st === 3, "Rekorden for 30 kort ble ikke lagret");
  // 16 moves for 15 pairs: three stars (within 1.9 moves per pair)
  t.sjekk((await t.antall(".ele-stjerner .pa")) === 3 && (await t.js(`document.querySelector(".ele-stjerner").getAttribute("role")`)) === "img", "30 kort på 16 trekk skal gi tre stjerner (med rolle på stjernene)");
  t.sjekk((await toppTittel()) === "dyr · 30 kort", `Resultatet for én spiller heter «${await toppTittel()}» (ikke spillet og brettet)`);
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  t.sjekk((await kveld()).length === 2, "Et spill alene ble sendt til Kveldens gjeng");
  await t.klikk('[data-h="del"]');
  delt = await t.js("window.__delt || null");
  t.sjekk(delt && /30 kort på 16 trekk/.test(delt.text) && /⭐⭐⭐/.test(delt.text), `«Del resultatet» delte ikke resultatet alene (${JSON.stringify(delt)})`);

  // Back to the game's home screen: the record is shown there
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.ele-rekorder')");
  t.sjekk(/30 kort/.test(await t.tekst(".ele-rekorder")) && /16 trekk/.test(await t.tekst(".ele-rekorder")), "Rekorden vises ikke på hjem-skjermen");
  await t.bilde("hjem-rekord");

  // 12 cards twice: a record, then a game two moves from it
  const tolv = async (bomAntall, kikk) => {
    await t.klikk('[data-h="nytt"]');
    await t.klikk('[data-h="storrelse"][data-v="12"]');
    if ((await t.js(`document.querySelector('[data-h="kikk"]').getAttribute("aria-pressed")`)) !== String(!!kikk)) await t.klikk('[data-h="kikk"]');
    await t.klikk('[data-h="start"]');
    await t.vent("document.querySelectorAll('.ele-kort').length === 12");
    if (kikk) {
      // Every card face up for three seconds; taps wait
      await t.vent("document.querySelectorAll('.ele-kort.opp').length === 12", 6000);
      await t.bilde("kikk-forst");
      await t.klikk(kortet(0), 60);
      t.sjekk((await spillet()).opp.length === 0 && !(await spillet()).startet, "Et trykk under «Kikk først» snudde et kort");
      await t.vent("document.querySelectorAll('.ele-kort.opp').length === 0", 6000);
      await t.sov(200);
    }
    for (let n = 0; n < bomAntall; n++) await bom();
    await finnPar(6);
  };
  await tolv(0);
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  const tid12 = (await t.tilstand()).rekorder["12"];
  t.sjekk(tid12 && tid12.trekk === 6, "Rekorden for 12 kort ble ikke lagret");
  await t.klikk("#tilbake");
  await tolv(2);
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.sov(500);
  t.sjekk(/2 trekk fra rekorden/.test(await t.tekst(".hjelp")), `Resultatet sier ikke hvor nær rekorden det var («${await t.tekst(".hjelp")}»)`);
  t.sjekk((await t.antall(".ele-stjerner .pa")) === 3 && (await t.tilstand()).rekorder["12"].trekk === 6, "8 trekk for 6 par skal gi tre stjerner og la rekorden stå");
  await t.bilde("solo-nesten");
  // «Kikk først»: a practice game – a perfect one, and still the record is not touched
  await t.klikk("#tilbake");
  await tolv(0, true);
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await t.sov(500);
  s = await t.tilstand();
  t.sjekk(s.rekorder["12"].trekk === tid12.trekk && s.rekorder["12"].tid === tid12.tid && !(await t.finnes(".ele-ny")) && /øvingsspill/.test(await t.tekst(".hjelp")), "Et spill med «Kikk først» rørte rekorden");

  // Leave during the end celebration and start a new game at once: the old celebration must
  // not push the new game to the result screen.
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="kikk"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 12");
  await finnPar(6);
  t.sjekk(await t.js("Rusj.S.spill.ferdig && Rusj.S.skjerm === 'spill'"), "Sluttfeiringen startet ikke");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 12");
  await t.sov(2600);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "spill" && !(await t.js("Rusj.S.spill.ferdig")), "Et nytt spill ble sendt til sluttskjermen av den forrige feiringen");

  // ---------- 5 The Christmas pictures, in season only ----------
  await t.klikk("#tilbake");
  await t.js(`Rusj.dag = () => ({ tekst: "2026-07-01", nr: 20635 })`);
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  t.sjekk(!(await t.finnes('[data-h="tema"][data-v="jul"]')), "Julebildene tilbys midt på sommeren");
  await t.js(`Rusj.dag = () => ({ tekst: "2026-12-10", nr: 20797 }); Rusj.vis()`);
  t.sjekk((await t.js(`document.querySelector('[data-h="tema"]').dataset.v`)) === "jul", "Julebildene står ikke først i desember");
  await t.klikk('[data-h="tema"][data-v="jul"]');
  await t.bilde("oppsett-jul", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ele-kort').length === 12");
  t.sjekk((await spillet()).tema === "jul", "Julebildene ble ikke brukt");
  await finnPar(2);
  await t.sov(500);
  await t.bilde("jul-brett");
}
