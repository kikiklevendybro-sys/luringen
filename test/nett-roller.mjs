// The common course of an online e2e scenario (test/nett/<id>.mjs) for the party games with hidden
// roles, where everyone answers at once (looks at a card, points, votes) and one seat moves the round
// on: A has a game saved on the phone and makes a room; the others join from the link and A starts;
// a late phone is told the match has begun; match 1 is played to its end – every phone that has «Din
// tur» in the title does its step (o.trekk), the second phone closes its tab half-way and comes back;
// «Ny kamp»; in match 2 one phone leaves on purpose (play-on, o.forlatNar) and the others finish;
// then everyone leaves, and A's saved game is untouched.
//
// o: {
//   antall: 4                     phones (the first one is the host),
//   lagret: "nissen.v1",          the game's storage name (with offline), optional,
//   offline: async (a) => …       a game on A's phone before the room, ending on the home screen,
//   forbered: async (a) => …      A's own settings (they become the room's setup), optional,
//   skjermer: ["nettspill"],     the play screens (where a phone may have its turn),
//   trekk: async (p, sp, alle) => …  p has «Din tur»: one step, and wait until it is played,
//   ingenTur: async (alle, sp) => …  nobody has a turn (a local step, the clock …), optional,
//   nokkel: (sp) => …             what every phone must agree on,
//   gjenoppkoble: (sp) => bool    when the second phone closes its tab and comes back (match 1),
//   forlatNar: (sp) => i | null   in match 2: the phone (index) that leaves now, if any (A too),
//   etterForlat: async (alle, sp, i) => …   checks right after it left, optional,
//   kamp2: async (alle) => …      checks at the start of match 2, optional,
//   maksSteg: 600,
// }
export async function rollekamp(t, o) {
  const SKJERMER = o.skjermer || ["nettspill"];
  const iSpill = `${JSON.stringify(SKJERMER)}.includes(Rusj.S.skjerm)`;
  const N = o.antall || 4;
  const navn = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const alle = [];
  for (let i = 0; i < N; i++) alle.push(await t.telefon(navn[i], { rolig: i > 0 }));
  const [a] = alle;
  const nokkel = (sp) => JSON.stringify(o.nokkel(sp));
  // Wait until the other phones have the same state as p.
  const likt = async (p, andre, hva) => {
    const mal = nokkel(await p.spill());
    for (const q of andre) {
      let ok = false;
      for (let i = 0; i < 50 && !ok; i++) {
        ok = nokkel(await q.spill()) === mal;
        if (!ok) await t.sov(200);
      }
      if (!ok) t.feil(`${q.navn} er uenig med ${p.navn} etter ${hva}`);
    }
  };

  await a.apne();
  let lagret = null;
  if (o.offline) {
    await o.offline(a);
    await a.ventSkjerm("hjem");
    lagret = await a.js(`localStorage.getItem(${JSON.stringify(t.nokkel(o.lagret))})`);
    t.sjekk(!!lagret && JSON.parse(lagret).spill, "Spillet på mobilen ble ikke lagret før nettkampen");
  }
  if (o.forbered) await o.forbered(a);
  await a.ventSkjerm("hjem");
  t.sjekk(await a.finnes('[data-h="nett-apne"]'), "Ingen «Spill med en venn på nett» på hjemskjermen");
  const lenke = await t.lagRom(a);
  for (let i = 1; i < N; i++) await t.bliMed(alle[i], lenke, `Testspiller ${navn[i]}`);
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === ${N} && document.querySelector('[data-h="nett-start"]')`, 15000);
  await a.bilde("venterom");
  await a.klikk('[data-h="nett-start"]');
  for (const p of alle) await p.vent(`window.Rusj && Rusj.S && ${iSpill}`, 15000);
  for (let i = 0; i < N; i++) t.sjekk((await alle[i].nettMeg()) === i, `${navn[i]} har ikke plass ${i + 1}`);
  await a.bilde("kamp-start");
  // (The room has twelve seats: instead of a full room, a phone that comes after the start.)
  await t.fullt(lenke);

  // One match: every phone still in takes its steps until everyone is on «Kåringen».
  const sist = new Map();
  async function kamp(nr) {
    let tilbake = nr !== 1;
    let ute = nr !== 2;
    let inne = alle.slice();
    let steg = 0;
    for (; steg < (o.maksSteg || 600); steg++) {
      let slutt = true;
      for (const p of inne) if ((await p.skjerm()) !== "slutt") slutt = false;
      if (slutt) break;
      const vert = inne[0];
      const sp = await vert.spill();
      if (!tilbake && o.gjenoppkoble(sp)) {
        tilbake = true;
        await t.gjenoppkoble(alle[1], a, o.nokkel);
        continue;
      }
      if (!ute) {
        const i = o.forlatNar(sp);
        if (i != null) {
          ute = true;
          const p = alle[i];
          await p.bilde("for-forlat");
          await t.forlat(p);
          inne = inne.filter((q) => q !== p);
          for (const q of inne) {
            await q.vent(`Rusj.nett.erUte(${i})`, 10000).catch(() => t.feil(`${q.navn}: plassen til ${p.navn} ble ikke tatt ut`));
            await t.sov(300);
            t.sjekk(!(await q.finnes('#ark [data-h="nett-forlat"]')), `${q.navn}: kampen stoppet da ${p.navn} gikk`);
          }
          await likt(inne[0], inne.slice(1), `at ${p.navn} gikk`);
          await inne[0].bilde("etter-forlat");
          if (o.etterForlat) await o.etterForlat(inne, await inne[0].spill(), i);
          continue;
        }
      }
      let p = null;
      for (const q of inne) {
        if (SKJERMER.includes(await q.skjerm()) && (await q.minTur())) {
          p = q;
          break;
        }
      }
      if (!p) {
        if (o.ingenTur) await o.ingenTur(inne, sp);
        else await t.sov(200);
        continue;
      }
      // (At most 20 messages per 10 s from one phone: no robot faster than a person.)
      const vent = (sist.get(p) || 0) + 600 - Date.now();
      if (vent > 0) await t.sov(vent);
      sist.set(p, Date.now());
      await o.trekk(p, await p.spill(), inne);
      await likt(p, inne.filter((q) => q !== p), `steg ${steg} i kamp ${nr}`);
    }
    t.sjekk(steg < (o.maksSteg || 600), `Kamp ${nr} ble ikke ferdig`);
    t.sjekk(tilbake, "Kampen ble for kort til å teste gjenoppkobling");
    t.sjekk(ute, "Ingen forlot kamp 2");
    for (const p of inne) await p.ventSkjerm("slutt", 15000);
    const mal = nokkel(await inne[0].spill());
    for (const p of inne.slice(1)) t.sjekk(nokkel(await p.spill()) === mal, `Kamp ${nr}: sluttstillingen er ulik hos ${p.navn}`);
    t.sjekk(await inne[0].finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
    await inne[0].bilde(`kaaring-${nr}`);
    await inne[inne.length - 1].bilde(`kaaring-${nr}`);
    return inne;
  }

  await kamp(1);
  // «Ny kamp»: every phone in match 2.
  await a.klikk('[data-h="nett-ny"]');
  for (const p of alle) await p.vent(`Rusj.nett.kamp() === 2 && ${iSpill}`, 10000);
  if (o.kamp2) await o.kamp2(alle);
  await alle[N - 1].bilde("ny-kamp");
  const inne = await kamp(2);
  for (const p of inne) await t.forlat(p);
  if (!inne.includes(a)) await a.ventSkjerm("hjem");

  if (lagret) {
    // A's game on the phone: exactly as saved before the match on the net (only `_tid` moves).
    const utenTid = (x) => JSON.stringify({ ...JSON.parse(x), _tid: 0 });
    t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(t.nokkel(o.lagret))})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
    t.sjekk(await a.finnes('[data-h="fortsett"]'), "«Fortsett» mangler etter nettkampen");
  }
  return alle;
}
