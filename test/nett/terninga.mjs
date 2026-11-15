// Terninga (Yatzy) on the net: A makes a room, B joins, A starts with two (of up to six); a third
// phone is told the match has begun. They fill the whole pad – every throw is the same on both
// phones, and dice that are held stay as they were – with B closing its tab half-way and coming
// back; «Se kåringen» on both; «Ny kamp» lets B open; both leave.
export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  await a.apne();
  const lenke = await t.lagRom(a, "Testspiller A");
  await t.bliMed(b, lenke, "Testspiller B");
  await a.vent(`document.querySelector('[data-h="nett-start"]')`, 8000);
  await a.bilde("venterom");
  await b.ventSkjerm("nett");
  if (t.norsk) t.sjekk(/Venter på at Testspiller A starter/.test(await b.tekst("#skjerm .ingress")), `Gjesten i venterommet: «${await b.tekst("#skjerm .ingress")}»`);
  await a.klikk('[data-h="nett-start"]');
  await a.ventSkjerm("spill");
  await b.ventSkjerm("spill");
  await t.fullt(lenke);
  t.sjekk((await a.spill()).tur === 0, "Verten begynner ikke første kamp");

  const likt = async (hva) => {
    const sa = await a.spill();
    await b.vent(`JSON.stringify([Rusj.S.spill.terninger, Rusj.S.spill.kort, Rusj.S.spill.tur, Rusj.S.spill.kast]) === ${JSON.stringify(JSON.stringify([sa.terninger, sa.kort, sa.tur, sa.kast]))}`, 8000).catch(() => t.feil(`Mobilene er uenige etter ${hva}`));
  };
  let holdtTestet = false;
  let tilbake = false;
  let bilder = 0;
  for (let steg = 0; steg < 400; steg++) {
    const sp = await a.spill();
    if (sp.kort.every((k) => Object.keys(k).length === 15)) break;
    if (!tilbake && Object.keys(sp.kort[1]).length === 6 && sp.tur === 0) {
      tilbake = true;
      await t.gjenoppkoble(b, a);
    }
    const p = (await a.minTur()) ? a : (await b.minTur()) ? b : null;
    if (!p) {
      await t.sov(150);
      continue;
    }
    const egen = await p.spill();
    if (egen.kast === 0) {
      await p.trekk("#tg-kast", `Rusj.S.spill.kast === 1`);
      await p.vent(`!document.querySelector("#tg-brett[data-ruller]") && !document.querySelector(".trn-brett[data-kaster]")`, 8000);
      await likt("et kast");
      if (bilder < 2) {
        bilder++;
        await p.bilde("kastet");
        await (p === a ? b : a).bilde("ser-kastet");
      }
      if (!holdtTestet) {
        // Hold the first two dice and roll again: they keep their numbers, on both phones.
        holdtTestet = true;
        const for_ = (await p.spill()).terninger;
        await p.klikk('#tg-brett [data-h="hold"][data-v="0"]');
        await p.klikk('#tg-brett [data-h="hold"][data-v="1"]');
        await p.bilde("holder-to");
        await p.trekk("#tg-kast", `Rusj.S.spill.kast === 2`);
        await p.vent(`!document.querySelector("#tg-brett[data-ruller]") && !document.querySelector(".trn-brett[data-kaster]")`, 8000);
        await likt("et kast med holdte terninger");
        const etter = await (p === a ? b : a).spill();
        t.sjekk(etter.terninger[0] === for_[0] && etter.terninger[1] === for_[1] && etter.holdt[0] && etter.holdt[1], `De holdte terningene endret seg: ${for_} → ${etter.terninger}`);
        await (p === a ? b : a).bilde("ser-holdte");
      }
      continue;
    }
    const tur = egen.tur;
    await p.trekk("#skjerm .tg-felt.mulig:not(.null), #skjerm .tg-felt.mulig", `Rusj.S.spill.tur !== ${tur} || Rusj.S.spill.kort.every((k) => Object.keys(k).length === 15)`);
    await likt("et felt");
  }
  t.sjekk(holdtTestet && tilbake, "Holding eller gjenoppkobling ble ikke testet");
  for (const p of [a, b]) {
    await p.vent(`document.querySelector('[data-h="kaaring"]')`, 8000);
    await p.klikk('[data-h="kaaring"]');
    await p.ventSkjerm("slutt");
  }
  const sa = await a.spill();
  const sb = await b.spill();
  t.sjekk(JSON.stringify(sa.kort) === JSON.stringify(sb.kort), "Blokkene er ulike på slutten");
  await a.bilde("kaaring");
  await b.bilde("kaaring");

  await b.klikk('[data-h="nett-ny"]');
  for (const p of [a, b]) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  t.sjekk((await a.spill()).tur === 1, "Den andre spilleren begynner ikke kamp 2");
  await t.forlat(b);
  await a.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await a.klikk('#ark [data-h="nett-forlat"]');
  await a.ventSkjerm("hjem");
}
