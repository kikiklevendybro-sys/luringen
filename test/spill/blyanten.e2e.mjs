// Blyanten: an old unfinished crossword gives way to today's; typing moves to the next empty cell and
// the next word; a cell tapped twice turns; the clue list jumps; check and reveal mark the cells;
// overwriting clears a wrong mark; reload and back keep the crossword and the time; a real
// keyboard types; solving shows the result with statistics and a share text without answers.
// Then «Flere kryss»: setup (level and theme), give up and see the solution, a new crossword, and
// an easy one filled with one wrong letter («Nesten!») that is then fixed.
export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const S = () => t.tilstand();
  const sp = async () => {
    const s = await S();
    return s[s.modus];
  };
  const celler = (k, w) => Array.from(w.o).map((_, i) => (w.y + (w.r === "l" ? i : 0)) * k.b + w.x + (w.r === "v" ? i : 0));
  const tast = (b) => t.klikk(`.bly-tast[data-v="${b}"]`, 20);
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
  t.sjekk(!/Fortsett/.test(await t.tekst(".hjem-knapper")), "Et gammelt uferdig kryss skal ikke gi «Fortsett» i dag");

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
  await t.bilde("hjelp");
  await t.klikk('#ark [data-h="sjekk-ord"]', 200);
  t.sjekk(await t.finnes(`.bly-celle.feil[data-v="${feilCelle}"]`), "«Sjekk ordet» merket ikke den gale bokstaven");
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
  t.sjekk(/Fortsett dagens kryss/.test(await t.tekst('.hjem-knapper [data-h="dag"]')), "Hjem viser ikke «Fortsett dagens kryss»");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.bly-tastatur')");
  await pause();

  // Frozen dailies: these must never change (data/dagens.json and the theme word lists are append-only).
  const forste = await t.js("Rusj.dag(new Date(Date.UTC(2026, 10, 9, 12))).nr");
  const fast = {
    0: "naturen: blomst skog sti topp elv utsikt mose rot",
    1: "eventyr: frosk ønske havfrue slott ring kjempe drage troll",
    2: "rommet: fullmåne meteor nordlys univers ufo måne jord bane",
    30: "garden: egg traktor lam hest åker stall halm gjerde",
    365: "yrker: fotograf sjåfør prest servitør murer lokfører fisker maler",
  };
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
  const daglig = await t.js(`JSON.parse(localStorage.getItem("rusj.daglig") || "{}").blyanten || null`);
  t.sjekk(daglig && daglig.nr === iDag && daglig.vunnet === true && daglig.rekke === 1, `R.dagligFerdig ble ikke kalt riktig: ${JSON.stringify(daglig)}`);
  t.sjekk(s.dag.ferdig && !s.dag.gaOpp && s.stat.lost === 1 && s.stat.rekke === 1 && s.stat.sistLost === iDag, `Statistikken er feil: ${JSON.stringify(s.stat)}`);
  t.sjekk(/Krysset er løst/.test(await t.tekst("#skjerm h1")), `Feil overskrift: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(/2/.test(await t.tekst(".bly-fakta")), "Antall hint vises ikke på resultatet");
  t.sjekk(s._aktiv === false, "Et løst kryss skal ikke være merket som pågående");
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på resultatet");
  await t.bilde("resultat", true);

  // Share text: no answers
  await t.js(`(() => {
    window.__delt = null;
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
  })()`);
  await t.klikk('[data-h="del"]', 300);
  const delt = await t.js("window.__delt");
  t.sjekk(delt && /Blyanten · Dagens kryss/.test(delt) && /rusj\.no\/blyanten/.test(delt) && /2 hint/.test(delt), `Delingsteksten er feil: ${delt}`);
  t.sjekk(delt && !k.ord.some((w) => w.o.length > 3 && delt.toLowerCase().includes(w.o)), "Delingsteksten røper et svar");

  // Home: today's crossword is done
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="se-resultat"]') && /^\d+:\d\d:\d\d$/.test(await t.tekst(".bly-nedtelling b")), "Hjem viser ikke dagens resultat og nedtellingen");
  await t.bilde("hjem-ferdig");

  // «Flere kryss»: hard, one theme
  await t.klikk('[data-h="fri"]');
  await t.vent("document.querySelector('[data-h=\"start\"]')");
  await t.klikk('[data-h="niva"][data-v="vanskelig"]');
  await t.klikk('[data-h="tema"][data-v="*"]');
  t.sjekk(await t.js("document.querySelector('[data-h=\"start\"]').disabled"), "Start skal være av uten tema");
  await t.klikk('[data-h="tema"][data-v="skogsdyr"]');
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
  t.sjekk(s.fri.ferdig && s.fri.gaOpp && s.friStat.lost === 0 && /løsningen/.test(await t.tekst("#skjerm h1")), "«Gi opp» viste ikke løsningen");
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
