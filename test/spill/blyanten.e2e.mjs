// Blyanten: an old unfinished crossword gives way to today's; typing moves to the next empty cell and
// the next word; a cell tapped twice turns; the clue list jumps; check and reveal mark the cells;
// overwriting clears a wrong mark; reload and back keep the crossword and the time; a real
// keyboard types; solving shows the result with statistics, the countdown and a share text (a row
// of pencils through R.del, never the answers). The result of a check stands in the clue bar, never
// in a toast over the grid. Then «Flere kryss»: setup («Gjør klart», level, a handful of themes +
// «Alle temaer (36)»), give up and see the solution, a new crossword, and an easy one filled with
// one wrong letter («Nesten!») that is then fixed. Language-neutral (rusj/SPRAK.md): texts are
// checked word for word only in Norwegian; the edition's own themes and daily plan are pinned.
export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const S = () => t.tilstand();
  const sp = async () => {
    const s = await S();
    return s[s.modus];
  };
  const celler = (k, w) => Array.from(w.o).map((_, i) => (w.y + (w.r === "l" ? i : 0)) * k.b + w.x + (w.r === "v" ? i : 0));
  const tast = (b) => t.klikk(`.bly-tast[data-v="${b}"]`, 20);
  // The message in the clue bar ("" when the clue is showing).
  const varsel = (type) => t.js(`(() => { const el = document.querySelector(".bly-hintlinje .bly-varsel${type ? "." + type : ""} .bly-hint-tekst"); return el ? el.textContent : ""; })()`);
  const trykket = (sel) => t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? el.getAttribute("aria-pressed") : null; })()`);
  // Select word wi from the clue list and type the letters of its empty cells.
  async function fyllOrd(wi, feilBokstav) {
    const p = await sp();
    const k = p.kryss;
    const w = k.ord[wi];
    const tomme = celler(k, w).filter((c) => !p.fylt[c]);
    if (!tomme.length) return;
    await t.klikk(".bly-hint", 120);
    await t.klikk(`#ark [data-h="velg-ord"][data-v="${wi}"]`, 120);
    const b = Array.from(w.o);
    for (const c of tomme) {
      const i = celler(k, w).indexOf(c);
      await tast(feilBokstav && c === tomme[tomme.length - 1] ? (b[i] === "e" ? "a" : "e") : b[i]);
    }
  }
  async function fyllAlt(feilISiste) {
    const k = (await sp()).kryss;
    for (let wi = 0; wi < k.ord.length; wi++) await fyllOrd(wi, feilISiste && wi === k.ord.length - 1);
  }

  await t.start();
  const iDag = await t.js("Rusj.dag().nr");
  // Yesterday's crossword was never finished: today starts fresh.
  await t.js(`(() => {
    const k = Rusj.app._lagKryss("frukt", "lett", 5);
    Rusj.S.dag = { nr: ${iDag - 2}, kryss: k, fylt: Array(k.b * k.h).fill(""), vist: [], feil: [], rett: [], valgt: { c: k.ord[0].y * k.b + k.ord[0].x, r: k.ord[0].r }, tid: 9000, hjelp: 0, ferdig: false, gaOpp: false };
    Rusj.S.dag.fylt[k.ord[0].y * k.b + k.ord[0].x] = k.ord[0].o[0];
    Rusj.lagre();
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('.hjem-knapper .knapp.stor[data-h="dag"]') && (!t.norsk || !/Fortsett/.test(await t.tekst(".hjem-knapper"))), "Et gammelt uferdig kryss skal ikke gi «Fortsett» i dag");

  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.bly-rutenett .bly-celle')");
  let s = await S();
  const k = s.dag.kryss;
  t.sjekk(s.dag.nr === iDag && k.ord.length === 8 && k.niva === "middels", `Dagens kryss skal ha 8 ord (har ${k.ord.length})`);
  t.sjekk((await t.antall(".bly-rutenett .bly-celle")) === new Set(k.ord.flatMap((w) => celler(k, w))).size, "Antall ruter stemmer ikke med ordene");
  t.sjekk(/\d/.test(await t.tekst(".bly-hint-nr")) && (await t.tekst(".bly-hint-tekst")).length > 3, "Hintlinja viser ikke nummer og hint");
  // The same crossword on every phone: generated again from the day number alone
  const igjen = await t.js(`JSON.stringify(Rusj.app._lagKryss(${JSON.stringify(k.tema)}, "middels", Rusj.hash("blyanten:${iDag}:0"), RUSJ_DATA.dagens.ordAntall[${JSON.stringify(k.tema)}]))`);
  t.sjekk(igjen === JSON.stringify(k), "Dagens kryss ble ikke likt når det lages på nytt fra dagen");
  await t.bilde("kryss-tomt");

  // Type the first word: the selection jumps to the next word afterwards
  const w0 = k.ord[0];
  for (const b of w0.o) await tast(b);
  s = await S();
  t.sjekk(celler(k, w0).every((c) => s.dag.fylt[c]), "Første ord ble ikke skrevet inn");
  t.sjekk(!celler(k, w0).includes(s.dag.valgt.c), "Markøren gikk ikke videre til neste ord");
  t.sjekk((await S())._aktiv === true, "Et påbegynt kryss er ikke merket som pågående");

  // A crossing cell tapped twice turns the direction
  const I = {};
  k.ord.forEach((w) => celler(k, w).forEach((c) => (I[c] = (I[c] || 0) + 1)));
  const kryssCelle = Number(Object.keys(I).find((c) => I[c] > 1));
  await t.klikk(`.bly-celle[data-v="${kryssCelle}"]`, 60);
  const r1 = (await S()).dag.valgt.r;
  await t.klikk(`.bly-celle[data-v="${kryssCelle}"]`, 60);
  const r2 = (await S()).dag.valgt.r;
  t.sjekk((await S()).dag.valgt.c === kryssCelle && r1 !== r2, "To trykk på en krysning bytter ikke retning");

  // The clue list: jump to the first down word
  const nedI = k.ord.findIndex((w) => w.r === "l");
  await t.klikk(".bly-hint", 150);
  t.sjekk((await t.antall("#ark:not([hidden]) .bly-hintvalg")) === k.ord.length, "Hintlista viser ikke alle hintene");
  await t.bilde("hintliste");
  await t.klikk(`#ark [data-h="velg-ord"][data-v="${nedI}"]`, 150);
  s = await S();
  t.sjekk(s.dag.valgt.r === "l" && celler(k, k.ord[nedI]).includes(s.dag.valgt.c) && (await t.finnes("#ark[hidden]")), "Hintlista hoppet ikke til ordet");

  // A wrong letter, check the word, reveal a letter
  const wNed = k.ord[nedI];
  const tommeNed = celler(k, wNed).filter((c) => !s.dag.fylt[c]);
  const feilCelle = tommeNed[0];
  const riktig = Array.from(wNed.o)[celler(k, wNed).indexOf(feilCelle)];
  await tast(riktig === "x" ? "y" : "x");
  await t.klikk('[data-h="hjelp"]', 150);
  t.sjekk((await t.antall("#ark:not([hidden]) .bly-hjelpvalg .bly-hjelpknapp")) === 4, "Hjelpen skal være fire fliser");
  await t.bilde("hjelp");
  await t.klikk('#ark [data-h="sjekk-ord"]', 200);
  t.sjekk(await t.finnes(`.bly-celle.feil[data-v="${feilCelle}"]`), "«Sjekk ordet» merket ikke den gale bokstaven");
  t.sjekk((t.norsk ? /Én bokstav er feil/.test(await varsel("feil")) : !!(await varsel("feil"))), `Resultatet av «Sjekk ordet» skal stå i stikkordlinja («${await varsel()}»)`);
  t.sjekk(!(await t.finnes("#toast.vis")), "«Sjekk ordet» skal ikke legge en toast over krysset");
  await t.bilde("sjekket");
  await t.klikk('[data-h="hjelp"]', 150);
  await t.klikk('#ark [data-h="vis-bokstav"]', 200);
  s = await S();
  t.sjekk(s.dag.vist.length === 1 && s.dag.hjelp === 2 && (await t.finnes(".bly-celle.vist")), `«Vis én bokstav» virket ikke (${JSON.stringify({ vist: s.dag.vist, hjelp: s.dag.hjelp })})`);
  // Overwrite the wrong letter: the mark goes away
  await t.klikk(`.bly-celle[data-v="${feilCelle}"]`, 60);
  if ((await S()).dag.valgt.c !== feilCelle) await t.klikk(`.bly-celle[data-v="${feilCelle}"]`, 60);
  await tast(riktig);
  s = await S();
  t.sjekk(s.dag.fylt[feilCelle] === riktig && !s.dag.feil.includes(feilCelle), "Å skrive over en gal bokstav fjernet ikke feilmerket");

  // Reload: the letters, the help and the time come back
  await t.sov(1300);
  await t.lastSide(t.side, "document.querySelector('.bly-rutenett .bly-celle')");
  s = await S();
  t.sjekk(s.skjerm === "kryss" && s.dag.fylt[feilCelle] === riktig && s.dag.vist.length === 1 && s.dag.tid >= 1000, `Krysset ble ikke husket etter omlasting (tid ${s.dag.tid})`);
  t.sjekk((await t.tekst(".bly-celle.vist")).trim().length === 1, "Den viste bokstaven vises ikke etter omlasting");

  // Back and continue
  await t.klikk("#tilbake");
  // One line («… · 3/8 ord») where it fits; on narrow phones the progress stands on its own line.
  t.sjekk((t.norsk ? /Fortsett dagens kryss(?: · |\s+)\d\/8 ord/ : /\d\/8/).test(await t.tekst('.hjem-knapper [data-h="dag"]')), `Hjem viser ikke «Fortsett dagens kryss · n/8 ord» («${await t.tekst('.hjem-knapper [data-h="dag"]')}»)`);
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.bly-tastatur')");
  await pause();

  // Frozen dailies: these must never change (data/dagens.json and the theme word lists are append-only).
  const forste = await t.js("Rusj.dag(new Date(Date.UTC(2026, 10, 9, 12))).nr");
  const fast = {
    nb: {
      0: "naturen: blomst skog sti topp elv utsikt mose rot",
      1: "eventyr: frosk ønske havfrue slott ring kjempe drage troll",
      2: "rommet: fullmåne meteor nordlys univers ufo måne jord bane",
      30: "garden: egg traktor lam hest åker stall halm gjerde",
      365: "yrker: fotograf sjåfør prest servitør murer lokfører fisker maler",
    },
    en: {
      0: "fugler: owl seagull peacock wren swallow nest magpie hawk",
      1: "skolen: bag art scissors glue register reading maths board",
      2: "sommer: festival suncream fan spade pier sun lemonade crab",
      30: "fugler: sparrow feather starling crow swan thrush nest wren",
      365: "transport: canoe rocket tractor car coach train tube tram",
    },
    da: {
      0: "rommet: rumvæsen meteor sol raket rumskib satellit krater mars",
      1: "yrker: sømand dyrlæge lærer slagter murer betjent dommer læge",
      2: "musikk: saxofon dans tone kor guitar sanger orkester disko",
      30: "rommet: jorden univers mars måne venus jupiter raket sol",
      365: "hjemme: pejs sofa tag gardin skorsten garage hylde væg",
    },
  }[t.sprak];
  for (const [d, forventet] of Object.entries(fast)) {
    const fakt = await t.js(`(() => { const x = Rusj.app._dagensKryss(${forste} + ${d}); return x.tema + ": " + x.ord.map((w) => w.o).join(" "); })()`);
    t.sjekk(fakt === forventet, `Dagens kryss dag ${Number(d) + 1} er endret: «${fakt}»`);
  }

  // Keyboard users keep their place: focus follows the selected cell after typing. Start on an empty
  // cell — on a revealed (fixed) letter the game writes in the next free cell, so the expected letter
  // would depend on which cell «Vis én bokstav» happened to pick today.
  {
    const d = (await S()).dag;
    const tom = k.ord.flatMap((w) => celler(k, w)).find((c) => !d.fylt[c] && !d.vist.includes(c));
    if (d.valgt.c !== tom) await t.klikk(`.bly-celle[data-v="${tom}"]`, 60);
    if ((await S()).dag.valgt.c !== tom) await t.klikk(`.bly-celle[data-v="${tom}"]`, 60);
  }
  await t.js("document.querySelector('.bly-celle.aktiv').focus()");
  const forFokus = (await S()).dag;
  const fokusCelle = forFokus.valgt.c;
  const fokusBokstav = Array.from(k.ord.flatMap((w) => celler(k, w).map((c, i) => [c, w.o[i]])).find(([c]) => c === fokusCelle) || [0, "a"])[1];
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: fokusBokstav, text: fokusBokstav });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: fokusBokstav });
  await t.sov(80);
  const fokus = await t.js("document.activeElement && document.activeElement.classList.contains('bly-celle') ? Number(document.activeElement.dataset.v) : -1");
  t.sjekk(fokus === (await S()).dag.valgt.c, `Fokus fulgte ikke den valgte ruta etter et trekk (${fokus})`);

  // A real keyboard: pick a word with empty cells and type it
  s = await S();
  const wi2 = k.ord.findIndex((w) => celler(k, w).filter((c) => !s.dag.fylt[c]).length >= 2);
  await t.klikk(".bly-hint", 120);
  await t.klikk(`#ark [data-h="velg-ord"][data-v="${wi2}"]`, 150);
  await t.js("document.activeElement && document.activeElement.blur && document.activeElement.blur()");
  for (const c of celler(k, k.ord[wi2]).filter((c) => !s.dag.fylt[c])) {
    const b = Array.from(k.ord[wi2].o)[celler(k, k.ord[wi2]).indexOf(c)];
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: b, text: b });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: b });
    await t.sov(30);
  }
  s = await S();
  t.sjekk(celler(k, k.ord[wi2]).every((c) => s.dag.fylt[c]), "Et ekte tastatur skrev ikke inn ordet");
  await t.bilde("halvveis");

  // Solve the rest
  await fyllAlt(false);
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(700);
  s = await S();
  const daglig = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").blyanten || null`);
  t.sjekk(daglig && daglig.nr === iDag && daglig.vunnet === true && daglig.rekke === 1, `R.dagligFerdig ble ikke kalt riktig: ${JSON.stringify(daglig)}`);
  t.sjekk(s.dag.ferdig && !s.dag.gaOpp && s.stat.lost === 1 && s.stat.rekke === 1 && s.stat.sistLost === iDag, `Statistikken er feil: ${JSON.stringify(s.stat)}`);
  if (t.norsk) t.sjekk(/Krysset er løst/.test(await t.tekst("#skjerm h1")), `Feil overskrift: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(/2/.test(await t.tekst(".bly-fakta")), "Antall hint vises ikke på resultatet");
  t.sjekk(s._aktiv === false, "Et løst kryss skal ikke være merket som pågående");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på resultatet");
  t.sjekk((await t.finnes('.dokk .knapp[data-h="del"]')) && (!t.norsk || (await t.tekst(".dokk .knapp")).trim() === "Del resultatet"), `Hovedknappen på dagens resultat skal være «Del resultatet» (${await t.tekst(".dokk .knapp")})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".skjerm-resultat .bly-nedtelling b")), "Nedtellingen (TT:MM:SS) mangler på resultatet");
  await t.bilde("resultat", true);

  // Share text through R.del: a row of pencils (a light bulb where letters were shown), the link, no answers
  await t.js(`(() => {
    window.__delt = null;
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
  })()`);
  await t.klikk('[data-h="del"]', 300);
  const delt = await t.js("window.__delt");
  // The edition's name and address: «Blyanten nr. 4 · …», «Pencil #4 · …»
  const adresse = "https://rusj.no" + (await t.js("location.pathname"));
  const navn = await t.js("window.RUSJ_SPILL.navn");
  t.sjekk(delt && delt.startsWith(navn + " ") && /\n[^\n]*\d+:\d\d[^\n]* 2 [^\n]*\n\n/.test(delt) && delt.endsWith("\n\n" + adresse), `Delingsteksten er feil: ${delt}`);
  if (t.norsk) t.sjekk(delt && /^Blyanten nr\. \d+ · /.test(delt) && /\nLøst på \d+:\d\d med 2 hint\n\nhttps:\/\/rusj\.no\/blyanten\/$/.test(delt), `Delingsteksten er feil: ${delt}`);
  const delRad = delt ? delt.split("\n")[1] : "";
  t.sjekk(/^(?:\u270F\uFE0F?|\u{1F4A1}){8}$/u.test(delRad) && /\u{1F4A1}/u.test(delRad) && /\u270F/u.test(delRad), `Delingsteksten skal ha én blyant eller lyspære per ord: ${delt}`);
  t.sjekk((t.norsk ? /Kopiert/ : /./).test(await t.js(`document.querySelector("#toast.vis") ? document.querySelector("#toast").textContent : ""`)), "Mangler «Kopiert» etter deling");
  t.sjekk(delt && !k.ord.some((w) => w.o.length > 3 && delt.toLowerCase().includes(w.o)), "Delingsteksten røper et svar");

  // Home: today's crossword is done
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="se-resultat"]') && /^\d\d:\d\d:\d\d$/.test(await t.tekst(".bly-nedtelling b")), "Hjem viser ikke dagens resultat og nedtellingen");
  await t.bilde("hjem-ferdig");

  // «Flere kryss»: hard, one theme
  await t.klikk('[data-h="fri"]');
  await t.vent("document.querySelector('[data-h=\"start\"]')");
  if (t.norsk) t.sjekk(/Gjør klart/.test(await t.tekst("#skjerm h1")), `Oppsettet skal hete «Gjør klart» («${await t.tekst("#skjerm h1")}»)`);
  const antallTemaer = await t.js("window.RUSJ_DATA.temaer.temaer.length");
  t.sjekk((await t.antall('.brikke[data-h="tema"]')) === 9 && new RegExp(`\\(${antallTemaer}\\)`).test(await t.tekst('.brikke[data-v="*"]')) && (!t.norsk || /Alle temaer \(36\)/.test(await t.tekst('.brikke[data-v="*"]'))) && (await trykket('.brikke[data-v="*"]')) === "true", "Oppsettet skal vise «Alle temaer (36)» (valgt) og åtte temaer");
  await t.klikk('[data-h="niva"][data-v="vanskelig"]');
  await t.klikk('[data-h="alle-temaer"]');
  t.sjekk((await t.antall('.brikke[data-h="tema"]')) === antallTemaer + 1, `«Vis alle 36 temaene» viser ikke alle temaene (${await t.antall('.brikke[data-h="tema"]')})`);
  await t.bilde("oppsett-alle", true);
  await t.klikk('[data-h="alle-temaer"]');
  await t.klikk('[data-h="tema"][data-v="skogsdyr"]');
  t.sjekk((await trykket('.brikke[data-v="skogsdyr"]')) === "true" && (await trykket('.brikke[data-v="*"]')) === "false", "Et valgt tema skal slå av «Alle temaer»");
  t.sjekk(!(await t.js("document.querySelector('[data-h=\"start\"]').disabled")), "Start skal alltid kunne trykkes");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.bly-rutenett .bly-celle')");
  s = await S();
  t.sjekk(s.modus === "fri" && s.fri.kryss.ord.length === 10 && s.fri.kryss.tema === "skogsdyr" && s.fri.kryss.niva === "vanskelig", "Vanskelig kryss om ville dyr ble ikke laget");
  await t.bilde("vanskelig");

  // Give up
  await t.klikk('[data-h="hjelp"]', 150);
  await t.klikk('#ark [data-h="vis-losning"]', 150);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-resultat')", 6000);
  await t.sov(400);
  s = await S();
  t.sjekk(s.fri.ferdig && s.fri.gaOpp && s.friStat.lost === 0 && (!t.norsk || /løsningen/.test(await t.tekst("#skjerm h1"))), "«Gi opp» viste ikke løsningen");
  t.sjekk(!t.norsk || (/Løsning vist/.test(await t.tekst(".bly-fakta")) && !/hint/.test(await t.tekst(".bly-fakta"))), `Etter «Gi opp» skal det stå «Løsning vist», ikke antall hint («${await t.tekst(".bly-fakta")}»)`);
  await t.bilde("ga-opp");

  // A new one with the same settings
  const forrige = JSON.stringify(s.fri.kryss);
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.bly-tastatur')");
  t.sjekk(JSON.stringify((await S()).fri.kryss) !== forrige, "«Nytt kryss» ga samme kryss");
  await pause();

  // An easy one (replacing the running crossword asks first), filled with one wrong letter
  await t.klikk("#tilbake");
  await t.klikk('.lenkerad [data-h="oppsett"]');
  await t.klikk('[data-h="niva"][data-v="lett"]');
  await t.klikk('[data-h="tema"][data-v="*"]');
  await t.klikk('[data-h="start"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]'), "Et kryss som pågår ble erstattet uten å spørre");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.bly-tastatur')");
  s = await S();
  t.sjekk(s.fri.kryss.ord.length === 6 && s.fri.kryss.ord.every((w) => w.o.length <= 6), "Lett kryss skal ha seks korte ord");
  await t.bilde("lett");
  await fyllAlt(true);
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"sjekk-alt\"]')", 4000);
  await t.bilde("nesten");
  await t.klikk('#ark [data-h="sjekk-alt"]', 200);
  const feil = (await S()).fri.feil;
  t.sjekk(feil.length === 1 && (await t.finnes(".bly-celle.feil")), `«Vis meg feilene» merket ikke én feil (${feil.length})`);
  t.sjekk((t.norsk ? /Én bokstav er feil/.test(await varsel("feil")) : !!(await varsel("feil"))) && !(await t.finnes("#toast.vis")), "«Vis meg feilene» skal svare i stikkordlinja, ikke i en toast");
  const fk = (await S()).fri.kryss;
  const fc = feil[0];
  let fb = null;
  fk.ord.forEach((w) => celler(fk, w).forEach((c, i) => c === fc && (fb = Array.from(w.o)[i])));
  await t.klikk(`.bly-celle[data-v="${fc}"]`, 60);
  await tast(fb);
  await t.vent("document.querySelector('.skjerm-resultat')", 6000);
  t.sjekk((await S()).friStat.lost === 1, "Det løste krysset telte ikke");
  await t.sov(500);
  await t.bilde("lett-lost");
}
