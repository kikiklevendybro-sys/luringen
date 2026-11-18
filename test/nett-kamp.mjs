// The common course of an online e2e scenario (test/nett/<id>.mjs) for the board games that only
// need «whose turn is it, tap a legal move»: A has a game saved on the phone, makes a room; B joins
// from the link (with more seats A starts); a third phone finds the room full; they play the match
// to the end – one reaction goes across, B closes its tab half-way and comes back; both see the
// result; «Ny kamp» starts match 2; A leaves and B is told; A's saved game is untouched.
//
// o: {
//   lagret: the game's storage name ("reversi.v1"),
//   offline: async (a) => …   play a little on A against the phone, end on the home screen,
//   trekk: async (p, sp) => … p has the turn: make one move and wait until p has played it,
//   utenTur: a selector the other phone taps out of turn (nothing may change), optional,
//   nokkel: (sp) => …         the part of the state both phones must agree on,
//   gjenoppkoble: (sp) => bool  when B closes its tab and comes back (once),
//   ingenTur: async (a, b, sp) => …  nobody's turn (a round is over …), optional,
//   vertStarter: true          the host taps «Start» (games for more than two),
//   kamp2: async (a, b) => …   checks on match 2 (who starts),
//   maksSteg: 400,
// }
export async function nettKamp(t, o) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  const LAGRET = t.nokkel(o.lagret);
  const nokkel = (sp) => JSON.stringify(o.nokkel(sp));
  // Wait until the other phone has the same state as p.
  const likt = async (p, annen, hva) => {
    const mal = nokkel(await p.spill());
    for (let i = 0; i < 40; i++) {
      if (nokkel(await annen.spill()) === mal) return;
      await t.sov(200);
    }
    t.feil(`Mobilene er uenige etter ${hva}`);
  };

  await a.apne();
  await o.offline(a);
  await a.ventSkjerm("hjem");
  const lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
  t.sjekk(!!lagret && JSON.parse(lagret).spill, "Spillet mot mobilen ble ikke lagret før nettkampen");
  t.sjekk(await a.finnes('[data-h="nett-apne"]'), "Ingen «Spill med en venn på nett» på hjemskjermen");
  await a.bilde("hjem");

  // (The host sends no nickname it has not typed: it shows as «Spiller 1».)
  const lenke = await t.lagRom(a);
  await a.ventSkjerm("nett");
  if (t.norsk) t.sjekk(/Venter på/.test(await a.tekst("#skjerm h1")), `Venterommet: «${await a.tekst("#skjerm h1")}»`);
  await a.bilde("venterom");

  await t.bliMed(b, lenke, "Testspiller B");
  if (o.vertStarter) {
    await a.vent(`document.querySelector('[data-h="nett-start"]')`, 8000);
    await a.bilde("venterom-to");
    await a.klikk('[data-h="nett-start"]');
  }
  await a.ventSkjerm("spill");
  await b.ventSkjerm("spill");
  t.sjekk((await a.nettMeg()) === 0 && (await b.nettMeg()) === 1, "Plassene er ikke 0 (vert) og 1 (venn)");
  await a.bilde("kamp-start");
  await b.bilde("kamp-start");

  await t.fullt(lenke);

  let reaksjon = false;
  let tilbake = false;
  let utenTur = false;
  const sist = new Map();
  for (let steg = 0; steg < (o.maksSteg || 400); steg++) {
    if ((await a.skjerm()) === "slutt") break;
    const sp = await a.spill();
    if (!tilbake && o.gjenoppkoble(sp)) {
      tilbake = true;
      await t.gjenoppkoble(b, a, o.nokkel);
      continue;
    }
    if (!reaksjon && steg >= 2) {
      reaksjon = true;
      await a.klikk('[data-h="nett-reaksjoner"]');
      await a.bilde("reaksjoner");
      await a.klikk('#ark [data-h="nett-reaksjon"][data-v="4"]');
      await b.vent(`document.querySelector("#nett-boble")`, 5000);
      await b.bilde("reaksjon");
    }
    const p = (await a.minTur()) ? a : (await b.minTur()) ? b : null;
    if (!p) {
      if (o.ingenTur) await o.ingenTur(a, b, sp);
      else await t.sov(200);
      continue;
    }
    const annen = p === a ? b : a;
    if (!utenTur && steg >= 1 && o.utenTur) {
      // A tap out of turn on the other phone changes nothing.
      utenTur = true;
      const for_ = nokkel(await annen.spill());
      await annen.js(`(document.querySelector(${JSON.stringify(o.utenTur)}) || {}).click?.()`);
      await t.sov(400);
      t.sjekk(nokkel(await annen.spill()) === for_, "Et trekk ble gjort utenom tur");
    }
    // (The room takes at most 20 messages per 10 s from one phone: a robot that taps faster than
    // anyone would is slowed down to a person's pace.)
    const vent = (sist.get(p) || 0) + 600 - Date.now();
    if (vent > 0) await t.sov(vent);
    sist.set(p, Date.now());
    await o.trekk(p, await p.spill());
    await likt(p, annen, `steg ${steg}`);
    if (steg === 6) {
      await p.bilde("midt-i-kampen");
      await annen.bilde("ser-trekket");
    }
  }
  t.sjekk(tilbake && reaksjon, "Kampen ble for kort til å teste gjenoppkobling og reaksjon");
  await a.ventSkjerm("slutt", 15000);
  await b.ventSkjerm("slutt", 15000);
  t.sjekk(nokkel(await a.spill()) === nokkel(await b.spill()), "Sluttstillingen er ulik på de to mobilene");
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  await a.bilde("kaaring");
  await b.bilde("kaaring");

  // «Ny kamp»: both phones in match 2.
  await a.klikk('[data-h="nett-ny"]');
  await a.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  await b.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  if (o.kamp2) await o.kamp2(a, b);
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
  t.sjekk(!(await b.js("Rusj.paNett()")), "B er fortsatt «på nett» etter «Forlat»");

  // A's game against the phone: exactly as saved before the match on the net (only `_tid` moves).
  const utenTid = (x) => JSON.stringify({ ...JSON.parse(x), _tid: 0 });
  t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
  t.sjekk(await a.finnes('[data-h="fortsett"]'), "«Fortsett» mangler etter nettkampen");
  await a.klikk('[data-h="fortsett"]');
  await a.ventSkjerm("spill");
  t.sjekk((await a.spill()).modus === "mobil", "«Fortsett» ga ikke spillet mot mobilen");
  await a.bilde("fortsett-mot-mobilen");
  return { a, b };
}
