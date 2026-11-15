// Fireren on the net: A has a game against the phone saved, makes a room; B joins from the link;
// they play «Først til 3» to the end (the round starter drops in column 1, the other in column 2),
// B closes the tab in round 2 and comes back, a third phone finds the room full, a reaction goes
// across, «Ny kamp» starts match 2, A leaves and B is told; A's saved game is untouched.
export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  const LAGRET = t.nokkel("fireren.v1");

  // A game against the phone, one disc in, saved on A.
  await a.apne();
  await a.klikk('[data-h="nytt"]');
  await a.ventSkjerm("oppsett");
  await a.klikk('[data-h="start"]');
  await a.ventSkjerm("spill");
  await a.vent(`!Rusj.S.spill.trekk.length || document.querySelector('.fi-kolonner:not(.venter)')`, 8000);
  await a.vent(`document.querySelector('.fi-kolonner:not(.venter)')`, 8000);
  await a.klikk('.fi-kol[data-v="3"]');
  await a.vent(`document.querySelector('.fi-kolonner:not(.venter)')`, 8000);
  await a.klikk('[data-h="tilbake"]');
  await a.ventSkjerm("hjem");
  const lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
  t.sjekk(!!lagret && JSON.parse(lagret).spill, "Spillet mot mobilen ble ikke lagret før nettkampen");
  t.sjekk(await a.finnes('[data-h="nett-apne"]'), "Ingen «Spill med en venn på nett» på hjemskjermen");
  await a.bilde("hjem");

  const lenke = await t.lagRom(a, "Testspiller A");
  await a.ventSkjerm("nett");
  if (t.norsk) t.sjekk(/Venter på en venn/.test(await a.tekst("#skjerm h1")), `Venterommet: «${await a.tekst("#skjerm h1")}»`);
  await a.bilde("venterom");

  await t.bliMed(b, lenke, "Testspiller B");
  await a.ventSkjerm("spill");
  await b.ventSkjerm("spill");
  t.sjekk((await a.nettMeg()) === 0 && (await b.nettMeg()) === 1, "Plassene er ikke 0 (vert) og 1 (venn)");
  const navnA = await a.js(`Array.from(document.querySelectorAll(".fi-navn")).map((x) => x.textContent).join("|")`);
  t.sjekk(navnA === "Testspiller A|Testspiller B", `Navnene i stillingen hos A: ${navnA}`);
  await a.bilde("kamp-start");
  await b.bilde("kamp-start");

  // The full room, once the match is on.
  await t.fullt(lenke);

  // Play until «Kåringen».
  let reaksjon = false;
  let tilbake = false;
  for (let steg = 0; steg < 120; steg++) {
    const sp = await a.spill();
    if (sp.ferdig || (await a.skjerm()) === "slutt") break;
    if (sp.resultat) {
      // The round is over: whoever is quicker starts the next one (here B).
      if (await b.finnes('[data-h="runde"]')) await b.klikk('[data-h="runde"]');
      else await a.vent(`Rusj.S.skjerm === "slutt"`, 8000);
      await a.vent(`!Rusj.S.spill.resultat || Rusj.S.skjerm === "slutt"`, 8000);
      continue;
    }
    if (sp.runde === 2 && sp.trekk.length === 3 && !tilbake) {
      tilbake = true;
      await t.gjenoppkoble(b, a);
    }
    if (sp.runde === 1 && sp.trekk.length === 2 && !reaksjon) {
      reaksjon = true;
      await a.klikk('[data-h="nett-rommet"]');
      await a.bilde("rommet");
      await a.klikk('#ark [data-h="nett-reaksjon"][data-v="4"]');
      await b.vent(`document.querySelector("#nett-boble")`, 5000);
      await b.bilde("reaksjon");
    }
    const p = (await a.minTur()) ? a : (await b.minTur()) ? b : null;
    if (!p) {
      await t.sov(200);
      continue;
    }
    const meg = await p.nettMeg();
    const k = sp.starter === meg ? 0 : 1;
    const n = sp.trekk.length;
    // A tap out of turn on the other phone does nothing.
    const annen = p === a ? b : a;
    if (steg === 1) {
      await annen.klikk(`.fi-kol[data-v="${k}"]`);
      await t.sov(400);
      t.sjekk((await annen.spill()).trekk.length === n, "En brikke ble lagt utenom tur");
    }
    await p.trekk(`.fi-kol[data-v="${k}"]`, `Rusj.S.spill && (Rusj.S.spill.trekk.length > ${n} || !!Rusj.S.spill.resultat || Rusj.S.spill.runde !== ${sp.runde})`);
    await a.vent(`Rusj.S.spill && (Rusj.S.spill.trekk.length > ${n} || !!Rusj.S.spill.resultat !== ${!!sp.resultat} || Rusj.S.spill.runde !== ${sp.runde})`, 8000);
    await b.vent(`Rusj.S.spill && JSON.stringify(Rusj.S.spill.trekk) === ${JSON.stringify(JSON.stringify((await a.spill()).trekk))}`, 8000);
    if (steg === 3) await a.bilde("midt-i-runden");
  }
  t.sjekk(tilbake && reaksjon, "Kampen ble for kort til å teste gjenoppkobling og reaksjon");
  await a.ventSkjerm("slutt", 10000);
  await b.ventSkjerm("slutt", 10000);
  const sa = await a.spill();
  const sb = await b.spill();
  t.sjekk(JSON.stringify(sa.poeng) === JSON.stringify(sb.poeng) && Math.max(...sa.poeng) === 3, `Sluttstillingen er ulik eller feil: A ${sa.poeng}, B ${sb.poeng}`);
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  await a.bilde("kaaring");
  await b.bilde("kaaring");

  // «Ny kamp»: both phones in match 2, with an empty board.
  await a.klikk('[data-h="nett-ny"]');
  await a.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  await b.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  t.sjekk((await b.spill()).trekk.length === 0 && (await b.spill()).poeng.join() === "0,0", "Ny kamp startet ikke på null");
  await b.bilde("ny-kamp");

  // A leaves during the match; B is told and goes home too.
  await a.klikk('[data-h="avslutt"]');
  await a.bilde("forlat-sporsmal");
  await a.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await a.ventSkjerm("hjem");
  await b.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  if (t.norsk) t.sjekk(/forlot kampen/.test(await b.tekst("#ark h2")), `B fikk ikke beskjed om at A gikk: «${await b.tekst("#ark h2")}»`);
  await b.bilde("venn-forlot");
  await b.klikk('#ark [data-h="nett-forlat"]');
  await b.ventSkjerm("hjem");

  // A's game against the phone: exactly as saved before the match on the net.
  // (Only the time it was last looked at, `_tid`, moves: A is on its home screen again.)
  const utenTid = (x) => JSON.stringify({ ...JSON.parse(x), _tid: 0 });
  t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
  t.sjekk(await a.finnes('[data-h="fortsett"]'), "«Fortsett» mangler etter nettkampen");
  await a.klikk('[data-h="fortsett"]');
  await a.ventSkjerm("spill");
  t.sjekk((await a.spill()).modus === "mobil", "«Fortsett» ga ikke spillet mot mobilen");
  await a.bilde("fortsett-mot-mobilen");
}
