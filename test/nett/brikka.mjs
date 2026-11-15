// Brikka (ludo) on the net with three phones: A makes a room with «Kjapt spill» (two pieces each)
// and no exact finish, B and C join, A starts with three; a fourth phone is told the match has
// begun; they play to the end – each roll is the same on every phone – with B closing its tab
// half-way and coming back; «Ny kamp»; everyone leaves.
export default async function (t) {
  const a = await t.telefon("A", { rolig: true });
  const b = await t.telefon("B", { rolig: true });
  const c = await t.telefon("C2", { rolig: true });
  await a.apne();
  // A's own settings for ludo (they become the room's setup).
  await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("brikka.v1"))}, JSON.stringify({ antall: 2, oppsett: { roboter: 0, seks: true, eksakt: false, kjapt: true }, spill: null }))`);
  await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
  const lenke = await t.lagRom(a, "Testspiller A");
  await t.bliMed(b, lenke, "Testspiller B");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 2`, 8000);
  t.sjekk(await a.finnes('[data-h="nett-start"]'), "Verten kan ikke starte med to av fire");
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 3`, 8000);
  await a.bilde("venterom-tre");
  await b.bilde("venterom-gjest");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm("spill");
  const sp0 = await a.spill();
  t.sjekk(sp0.seter.length === 3 && sp0.brikker.filter(Boolean).every((x) => x.length === 2), `Oppsettet ble ikke tre spillere med to brikker: ${JSON.stringify(sp0.seter)}`);
  await t.fullt(lenke);

  const alle = [a, b, c];
  let tilbake = false;
  let bilder = 0;
  for (let steg = 0; steg < 900; steg++) {
    const sp = await a.spill();
    if (sp.ferdig) break;
    if (!tilbake && sp.nr > 12) {
      tilbake = true;
      await t.gjenoppkoble(b, a);
    }
    let p = null;
    for (const x of alle) if (await x.minTur()) p = x;
    if (!p) {
      await t.sov(150);
      continue;
    }
    if (await p.finnes('#skjerm .dokk [data-h="kast"]:not([disabled])')) {
      const for_ = await p.js(`JSON.stringify([Rusj.S.spill.nr, Rusj.S.spill.forsok, Rusj.S.spill.kast])`);
      await p.trekk('#skjerm .dokk [data-h="kast"]', `JSON.stringify([Rusj.S.spill.nr, Rusj.S.spill.forsok, Rusj.S.spill.kast]) !== ${JSON.stringify(for_)}`);
      // Every phone shows the same number.
      const kast = await p.js("Rusj.S.spill.kast");
      for (const x of alle) await x.vent(`Rusj.S.spill.kast === ${JSON.stringify(kast)} || Rusj.S.spill.nr !== ${sp.nr} || Rusj.S.spill.ferdig`, 8000);
      if (bilder < 2 && kast != null) {
        bilder++;
        await p.bilde("har-kastet");
        await (p === a ? b : a).bilde("ser-kastet");
      }
      continue;
    }
    if (await p.finnes("#skjerm .bk-brikke.kan:not([disabled])")) {
      const for_ = await p.js(`JSON.stringify(Rusj.S.spill.brikker)`);
      await p.trekk("#skjerm .bk-brikke.kan", `JSON.stringify(Rusj.S.spill.brikker) !== ${JSON.stringify(for_)}`);
      continue;
    }
    await t.sov(150); // a single option or a useless roll: the phone sends it by itself
  }
  for (const p of alle) await p.ventSkjerm("slutt", 15000);
  const sa = await a.spill();
  const sb = await b.spill();
  const sc = await c.spill();
  t.sjekk(sa.ferdig && JSON.stringify(sa.brikker) === JSON.stringify(sb.brikker) && JSON.stringify(sa.brikker) === JSON.stringify(sc.brikker), "Mobilene endte med ulike brett");
  t.sjekk(sa.stat.kast === sb.stat.kast && sa.vinner === sc.vinner, "Mobilene er uenige om kast eller vinner");
  t.sjekk(tilbake, "Gjenoppkoblingen ble aldri testet");
  await a.bilde("kaaring");
  await c.bilde("kaaring");

  await c.klikk('[data-h="nett-ny"]');
  for (const p of alle) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  t.sjekk((await b.spill()).stat.kast === 0, "Ny kamp startet ikke på nytt");
  await b.bilde("ny-kamp");
  await t.forlat(a);
  for (const p of [b, c]) {
    await p.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
    await p.klikk('#ark [data-h="nett-forlat"]');
    await p.ventSkjerm("hjem");
  }
}
