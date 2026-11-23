// Play-on leaving (games in FORTSETT, nett/src/oppsett.js), end to end: three phones in one room;
// when it is C's turn (and the match is under way) C leaves on purpose; A and B are not stopped –
// the seat is out on both, at the same place – and play the match to its end; both see the result
// with «Ny kamp», then both leave.
//
// o: {
//   skjerm: "spill"             the game's play screen,
//   forbered: async (a) => …    A's own settings before the room is made (the room's setup), optional,
//   trekk: async (p, sp, andre) => …  p has the turn: make one move and wait until p has played it (andre: the other phones still in),
//   ingenTur: async (a, b, sp) => …  nobody's turn (a round is over, «Til kåringen» …), optional,
//   nokkel: (sp) => …           the part of the state the phones must agree on,
//   forlatNar: (sp) => bool     the match is far enough on for C to leave (on its turn),
//   etterForlat: async (a, b) => …  checks right after C has left, optional,
//   maksSteg: 600,
// }
export async function treSpillere(t, o) {
  const SPILL = o.skjerm || "spill";
  const a = await t.telefon("A3");
  const b = await t.telefon("B3", { rolig: true });
  const c = await t.telefon("C3", { rolig: true });
  const nokkel = (sp) => JSON.stringify(o.nokkel(sp));
  const likt = async (p, andre, hva) => {
    const mal = nokkel(await p.spill());
    for (const q of andre) {
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        ok = nokkel(await q.spill()) === mal;
        if (!ok) await t.sov(200);
      }
      if (!ok) t.feil(`Tre mobiler: ${q.navn} er uenig etter ${hva}`);
    }
  };

  await a.apne();
  if (o.forbered) await o.forbered(a);
  await a.ventSkjerm("hjem");
  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 3 && document.querySelector('[data-h="nett-start"]')`, 10000);
  await a.bilde("tre-venterom");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm(SPILL);
  t.sjekk((await c.nettMeg()) === 2, "C har ikke plass 3");
  await c.bilde("tre-start");

  let ute = false;
  const sist = new Map();
  for (let steg = 0; steg < (o.maksSteg || 600); steg++) {
    if ((await a.skjerm()) === "slutt" && (await b.skjerm()) === "slutt") break;
    const sp = await a.spill();
    const inne = ute ? [a, b] : [a, b, c];
    if (!ute && o.forlatNar(sp) && (await c.minTur())) {
      ute = true;
      await c.bilde("for-c-gaar");
      await t.forlat(c);
      for (const p of [a, b]) {
        await p.vent(`Rusj.nett.erUte(2)`, 10000).catch(() => t.feil(`${p.navn}: plassen til C ble ikke tatt ut`));
        await t.sov(400);
        t.sjekk(!(await p.finnes('#ark [data-h="nett-forlat"]')), `${p.navn}: kampen stoppet da C gikk`);
        t.sjekk(await p.js("Rusj.nett.aktiv()"), `${p.navn} er ikke lenger i kampen etter at C gikk`);
      }
      await likt(a, [b], "at C gikk");
      await a.bilde("c-gikk");
      if (o.etterForlat) await o.etterForlat(a, b);
      continue;
    }
    let p = null;
    for (const q of inne) {
      if (await q.minTur()) {
        p = q;
        break;
      }
    }
    if (!p) {
      if (o.ingenTur) await o.ingenTur(a, b, sp);
      else await t.sov(200);
      continue;
    }
    if (ute && p === c) {
      t.feil("C fikk tur etter å ha forlatt kampen");
      break;
    }
    const vent = (sist.get(p) || 0) + 600 - Date.now();
    if (vent > 0) await t.sov(vent);
    sist.set(p, Date.now());
    await o.trekk(p, await p.spill(), inne.filter((q) => q !== p));
    await likt(p, inne.filter((q) => q !== p), `steg ${steg}`);
  }
  t.sjekk(ute, "C forlot aldri kampen (det ble aldri C sin tur)");
  await a.ventSkjerm("slutt", 15000);
  await b.ventSkjerm("slutt", 15000);
  t.sjekk(nokkel(await a.spill()) === nokkel(await b.spill()), "Tre mobiler: sluttstillingen er ulik hos A og B");
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Tre mobiler: ingen «Ny kamp» på kåringen");
  t.sjekk(!(await c.js("Rusj.paNett()")), "C er fortsatt «på nett»");
  await a.bilde("tre-kaaring");
  await b.bilde("tre-kaaring");
  await t.forlat(a);
  await t.forlat(b);
  return { a, b, c };
}
