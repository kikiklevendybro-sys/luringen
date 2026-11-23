// Pusen on the net. 1 Svarteper on two phones: A has a game against the phone saved, makes a room
// (the lobby names the game), B joins, A starts with two of up to four; a third phone is told the
// match has begun. Each phone sees only its own hand face up. A card drawn is a move – the same table
// on both phones; a move sent out of turn changes nothing; B closes its tab half-way and comes back;
// the cat ends it and both see the result; «Ny kamp» lets B begin; A leaves and B is told; A's saved
// game is untouched. 2 Størst vinner on two phones: both tap «Snu!», each sees itself at the bottom,
// to the end. 3 Fisk on three phones: C leaves half-way, its cards go back into the pond, and A and B
// play on to the end without it.
const nokkel = (sp) => [sp.modus, sp.r, sp.klar, sp.borte, sp.ferdig, sp.resultat];
const tekst = (x) => JSON.stringify(x);

export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  const LAGRET = t.nokkel("pusen.v1");

  // Wait until the other phones have the same table as p.
  const likt = async (p, andre, hva) => {
    const mal = tekst(nokkel(await p.spill()));
    for (const annen of andre) {
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        ok = tekst(nokkel(await annen.spill())) === mal;
        if (!ok) await t.sov(200);
      }
      if (!ok) t.feil(`${annen.navn} er uenig med ${p.navn} etter ${hva}`);
    }
  };
  // Only this phone's own hand is face up (Svarteper and Fisk).
  const skjult = async (p, hva) => {
    const sp = await p.spill();
    const jeg = await p.nettMeg();
    const opp = await p.js(`document.querySelectorAll("#skjerm .pu-kort.opp").length`);
    t.sjekk(opp === sp.r.hender[jeg].length, `${p.navn}: ${opp} kort med forsiden opp, men ${sp.r.hender[jeg].length} på hånden (${hva})`);
  };
  // A new game against the phone in «Gjør klart» (that is the host's game for the next room).
  const offline = async (p, modus) => {
    await p.klikk('[data-h="nytt"]');
    if (await p.finnes('#ark [data-h="ark-svar"][data-v="ja"]')) await p.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
    await p.ventSkjerm("oppsett");
    await p.klikk(`[data-h="modus"][data-v="${modus}"]`);
    await p.klikk('[data-h="mot"][data-v="mobil"]');
    await p.klikk('[data-h="start"]');
    await p.ventSkjerm("spill");
  };
  const lobbyLinje = (p) => p.js(`(document.querySelector("#skjerm .nett-seter ~ .hjelp") || {}).textContent || ""`);

  // ---------- 1 Svarteper on two phones ----------
  await a.apne();
  await offline(a, "svarte");
  await a.vent(`document.querySelector('#skjerm [data-h="trekk"]')`, 10000);
  await a.klikk('#skjerm [data-h="trekk"]');
  await t.sov(300);
  await a.klikk("#tilbake");
  await a.ventSkjerm("hjem");
  // (One reload first: the game's load fills in a few empty fields of a saved game – sporsmal, loft,
  // utMeldt – and saves them, as any reload does; the match on the net must change nothing after that.)
  await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
  await a.ventSkjerm("hjem");
  const lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
  t.sjekk(!!lagret && JSON.parse(lagret).spill && JSON.parse(lagret).spill.mot === "mobil", "Spillet mot mobilen ble ikke lagret før nettkampen");
  t.sjekk(await a.finnes('[data-h="nett-apne"]'), "Ingen «Spill med en venn på nett» på hjemskjermen");

  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await a.vent(`document.querySelector('[data-h="nett-start"]')`, 8000);
  if (t.norsk) t.sjekk(/Svarteper/.test(await lobbyLinje(a)), `Venterommet sier ikke hvilket spill: «${await lobbyLinje(a)}»`);
  await a.bilde("venterom");
  await a.klikk('[data-h="nett-start"]');
  await a.ventSkjerm("spill");
  await b.ventSkjerm("spill");
  t.sjekk((await a.nettMeg()) === 0 && (await b.nettMeg()) === 1, "Plassene er ikke 0 (vert) og 1 (venn)");
  t.sjekk((await a.spill()).modus === "svarte" && (await a.spill()).mot === "nett", "Nettkampen er ikke Svarteper");
  await t.fullt(lenke);
  await skjult(a, "start");
  await skjult(b, "start");
  await a.bilde("svarteper-start");
  await b.bilde("svarteper-start");

  let trekk = 0;
  let tilbake = false;
  let reaksjon = false;
  let utenTur = false;
  // Draw (each phone when it has the turn) until the match is over, or `stopp` draws were made.
  // The checks come early: a game of Svarteper for two can be over after a few draws.
  const svarteper = async (stopp = Infinity) => {
    for (let steg = 0, egne = 0; steg < 300 && egne < stopp; steg++) {
      const sp = await a.spill();
      if (sp.ferdig) break;
      if (!tilbake && egne >= 1) {
        tilbake = true;
        await t.gjenoppkoble(b, a, nokkel);
        await skjult(b, "tilbake");
        continue;
      }
      if (!reaksjon) {
        reaksjon = true;
        await a.klikk('[data-h="nett-reaksjoner"]');
        await a.klikk('#ark [data-h="nett-reaksjon"][data-v="1"]');
        await b.vent(`document.querySelector("#nett-boble")`, 5000);
      }
      const p = (await a.minTur()) ? a : (await b.minTur()) ? b : null;
      if (!p) {
        await t.sov(200);
        continue;
      }
      const annen = p === a ? b : a;
      if (!utenTur) {
        // A move sent out of turn goes through the room and is ignored on both phones.
        utenTur = true;
        const for_ = tekst(nokkel(await annen.spill()));
        t.sjekk(await annen.js(`Rusj.nett.send({ k: 0 })`), "Trekket utenom tur ble ikke sendt");
        await annen.vent("!Rusj.nett.venter()", 5000);
        await t.sov(300);
        t.sjekk(tekst(nokkel(await annen.spill())) === for_ && tekst(nokkel(await p.spill())) === for_, "Et trekk utenom tur ble spilt");
      }
      const n = await p.js(`document.querySelectorAll('#skjerm [data-h="trekk"]').length`);
      const for_ = tekst(sp.r.hender);
      await t.sov(350);
      await p.trekk(`#skjerm [data-h="trekk"][data-v="${trekk % Math.max(1, n)}"]`, `JSON.stringify(Rusj.S.spill.r.hender) !== ${JSON.stringify(for_)}`);
      trekk++;
      egne++;
      await likt(p, [annen], `trekk ${trekk}`);
      await skjult(p, `trekk ${trekk}`);
      await skjult(annen, `trekk ${trekk}`);
      if (trekk === 2) {
        await p.bilde("svarteper-trekker");
        await annen.bilde("svarteper-ser-pa");
      }
    }
  };
  await svarteper();
  t.sjekk(reaksjon && utenTur, "Reaksjon eller trekk utenom tur ble ikke testet");
  await a.ventSkjerm("slutt", 15000);
  await b.ventSkjerm("slutt", 15000);
  t.sjekk(tekst(nokkel(await a.spill())) === tekst(nokkel(await b.spill())), "Sluttstillingen er ulik på de to mobilene");
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  await a.bilde("svarteper-kaaring");
  await b.bilde("svarteper-kaaring");

  await a.klikk('[data-h="nett-ny"]');
  for (const p of [a, b]) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  const k2 = await b.spill();
  t.sjekk(k2.r.tur === 1 || !k2.r.hender[1].length, "B begynner ikke kamp 2");
  await b.bilde("ny-kamp");
  // A first match that was over too soon: the reconnect is tested in this one.
  if (!tilbake) await svarteper(3);
  t.sjekk(tilbake, "Gjenoppkoblingen ble aldri testet");

  // A leaves during match 2 (two left of two: it is over for both), B is told.
  await t.forlat(a);
  await b.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  if (t.norsk) t.sjekk(/forlot kampen/.test(await b.tekst("#ark h2")), `B fikk ikke beskjed om at A gikk: «${await b.tekst("#ark h2")}»`);
  await b.bilde("venn-forlot");
  await b.klikk('#ark [data-h="nett-forlat"]');
  await b.ventSkjerm("hjem");
  t.sjekk(!(await b.js("Rusj.paNett()")), "B er fortsatt «på nett» etter «Forlat»");
  const utenTid = (x) => JSON.stringify({ ...JSON.parse(x), _tid: 0 });
  t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
  await a.klikk('[data-h="fortsett"]');
  await a.ventSkjerm("spill");
  t.sjekk((await a.spill()).mot === "mobil", "«Fortsett» ga ikke spillet fra før nettkampen");
  await a.klikk("#tilbake");
  await a.ventSkjerm("hjem");

  // ---------- 2 Størst vinner on two phones ----------
  await offline(a, "krig");
  await a.klikk("#tilbake");
  await a.ventSkjerm("hjem");
  const lenke2 = await t.lagRom(a);
  await t.bliMed(b, lenke2, "Testspiller B");
  await a.vent(`document.querySelector('[data-h="nett-start"]')`, 8000);
  if (t.norsk) t.sjekk(/Størst vinner · 10 kort hver/.test(await lobbyLinje(a)), `Venterommet: «${await lobbyLinje(a)}»`);
  await a.klikk('[data-h="nett-start"]');
  await a.ventSkjerm("spill");
  await b.ventSkjerm("spill");
  t.sjekk((await b.spill()).modus === "krig", "Nettkampen er ikke Størst vinner");
  if (t.norsk) for (const p of [a, b]) t.sjekk((await p.tekst("#skjerm .pu-side-bunn .pu-vunnet b")) === "Du", `${p.navn} ser ikke seg selv nederst`);
  let slag = 0;
  for (let steg = 0; steg < 200; steg++) {
    const sp = await a.spill();
    if (sp.ferdig) break;
    const p = (await a.minTur()) ? a : (await b.minTur()) ? b : null;
    if (!p) {
      await t.sov(200);
      continue;
    }
    const jeg = await p.nettMeg();
    const for_ = tekst([sp.klar, sp.r.vunnet]);
    await t.sov(250);
    await p.trekk('#skjerm .pu-side-bunn [data-h="snu"]', `Rusj.S.spill.klar[${jeg}] || JSON.stringify([Rusj.S.spill.klar, Rusj.S.spill.r.vunnet]) !== ${JSON.stringify(for_)}`);
    if ((await p.spill()).klar[jeg] && slag === 0) {
      await p.bilde("krig-klar");
      await (p === a ? b : a).bilde("krig-venter");
    }
    if (!(await p.spill()).klar[jeg]) {
      slag++;
      await likt(p, [p === a ? b : a], `slag ${slag}`);
      if (slag === 2) await p.bilde("krig-slag");
    }
  }
  await a.ventSkjerm("slutt", 15000);
  await b.ventSkjerm("slutt", 15000);
  t.sjekk(slag >= 1, "Ingen slag i Størst vinner");
  const sk = await a.spill();
  t.sjekk(sk.r.vunnet[0] + sk.r.vunnet[1] + sk.r.hender[0].length + sk.r.hender[1].length === 20, "Kortene i Størst vinner stemmer ikke");
  t.sjekk(tekst(nokkel(sk)) === tekst(nokkel(await b.spill())), "Størst vinner endte ulikt");
  await a.bilde("krig-kaaring");
  await b.bilde("krig-kaaring");
  await t.forlat(a);
  await b.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await b.klikk('#ark [data-h="nett-forlat"]');
  await b.ventSkjerm("hjem");

  // ---------- 3 Fisk on three phones: C leaves, A and B play on ----------
  await offline(a, "fisk");
  await a.klikk("#tilbake");
  await a.ventSkjerm("hjem");
  const c = await t.telefon("C");
  const lenke3 = await t.lagRom(a);
  await t.bliMed(b, lenke3, "Testspiller B");
  await t.bliMed(c, lenke3, "Testspiller C");
  await a.vent(`document.querySelectorAll(".nett-seter li.med").length === 3 && document.querySelector('[data-h="nett-start"]')`, 10000);
  if (t.norsk) t.sjekk((await lobbyLinje(a)).trim() === "⚙️ Fisk" || /Fisk/.test(await lobbyLinje(a)), `Venterommet: «${await lobbyLinje(a)}»`);
  await a.bilde("fisk-venterom");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm("spill");
  t.sjekk((await c.spill()).modus === "fisk" && (await c.spill()).n === 3, "Nettkampen er ikke Fisk for tre");
  for (const p of [a, b, c]) await skjult(p, "fisk-start");

  let spurt = 0;
  let cBorte = false;
  for (let steg = 0; steg < 400; steg++) {
    const sp = await a.spill();
    if (sp.ferdig) break;
    if (!cBorte && spurt >= 4) {
      cBorte = true;
      await c.bilde("fisk-for-c-gaar");
      await t.forlat(c);
      for (const p of [a, b]) await p.vent(`Rusj.S.spill.borte.includes(2)`, 8000);
      await likt(a, [b], "at C gikk");
      const etter = await a.spill();
      t.sjekk(etter.r.hender[2].length === 0 && etter.r.tur !== 2, "C har fortsatt kort eller tur etter at C gikk");
      t.sjekk(etter.r.hender.flat().length + etter.r.dam.length + 4 * etter.r.sett.flat().length === 40, "Kort forsvant da C gikk");
      t.sjekk(!(await a.finnes('#ark [data-h="nett-forlat"]')), "Kampen stoppet for A da C gikk");
      if (t.norsk) t.sjekk(/Forlot spillet/.test(await a.tekst("#skjerm .pu-seter")), "Plassen til C sier ikke at C gikk");
      await a.bilde("fisk-c-gikk");
      continue;
    }
    const spillere = cBorte ? [a, b] : [a, b, c];
    let p = null;
    for (const x of spillere) if (!p && (await x.minTur())) p = x;
    if (!p) {
      await t.sov(200);
      continue;
    }
    const egen = await p.spill();
    const jeg = await p.nettMeg();
    const rr = egen.r;
    const hand = rr.hender[jeg];
    const andre = rr.hender.map((h, i) => i).filter((i) => i !== jeg && rr.hender[i].length && !egen.borte.includes(i));
    // Ask someone who has one of my animals when there is one (a quick game), else the first.
    let valg = null;
    for (const q of andre) for (const k of hand) if (!valg && rr.hender[q].some((x) => x % 10 === k % 10)) valg = { q, a: k % 10 };
    if (!valg) valg = { q: andre[0], a: hand[0] % 10 };
    if (andre.length > 1) {
      await p.klikk(`#skjerm [data-h="velg"][data-v="${valg.q}"]`);
      await p.vent(`Rusj.S.spill.valgt === ${valg.q}`, 3000);
    }
    const for_ = tekst(rr);
    await t.sov(350);
    await p.trekk(`#skjerm [data-h="sporr"][data-v="${valg.a}"]`, `JSON.stringify(Rusj.S.spill.r) !== ${JSON.stringify(for_)}`);
    spurt++;
    const med = spillere.filter((x) => x !== p);
    await likt(p, med, `spørsmål ${spurt}`);
    for (const x of spillere) await skjult(x, `spørsmål ${spurt}`);
    if (spurt === 2) {
      await p.bilde("fisk-spor");
      await med[0].bilde("fisk-ser-pa");
    }
  }
  t.sjekk(cBorte, "C gikk aldri");
  await a.ventSkjerm("slutt", 15000);
  await b.ventSkjerm("slutt", 15000);
  const sf = await a.spill();
  t.sjekk(tekst(nokkel(sf)) === tekst(nokkel(await b.spill())), "Fisk endte ulikt");
  t.sjekk(sf.ferdig && sf.borte.join() === "2", "Fisk endte ikke, eller C er ikke borte");
  await a.bilde("fisk-kaaring");
  await b.bilde("fisk-kaaring");
  await t.forlat(a);
  await b.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await b.klikk('#ark [data-h="nett-forlat"]');
  await b.ventSkjerm("hjem");
}
