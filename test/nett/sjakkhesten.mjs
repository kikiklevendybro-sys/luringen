// Sjakkhesten on the net: A makes a room, B joins; each phone has its own colour at the bottom;
// the quickest mate (1. f3 e5 2. g4 Dh4#) with black closing its tab after 1… e5 and coming back;
// a third phone finds the room full; «Ny kamp» swaps the colours; white resigns; both leave.
export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  await a.apne();
  const lenke = await t.lagRom(a, "Testspiller A");
  await t.bliMed(b, lenke, "Testspiller B");
  await a.ventSkjerm("spill");
  await b.ventSkjerm("spill");
  await t.fullt(lenke);

  const farger = async () => {
    const sa = await a.spill();
    const hvit = sa.meg === 0 ? a : b; // HVIT = 0
    return { hvit, svart: hvit === a ? b : a };
  };
  let { hvit, svart } = await farger();
  t.sjekk((await a.spill()).meg !== (await b.spill()).meg, "Begge mobilene har samme farge");
  for (const p of [a, b]) {
    const bunn = await p.js(`(() => { const r = document.querySelectorAll(".sh-brett .sh-rute"); return r[r.length - 1].dataset.v; })()`);
    const meg = (await p.spill()).meg;
    t.sjekk(meg === 0 ? bunn === "h1" : bunn === "a8", `${p.navn}: egne brikker er ikke nederst (hjørnet nede til høyre er ${bunn})`);
  }
  await hvit.bilde("hvit-start");
  await svart.bilde("svart-start");

  const flytt = async (p, fra, til) => {
    const n = (await p.spill()).trekk.length;
    await p.klikk(`.sh-rute[data-v="${fra}"]`);
    await p.trekk(`.sh-rute[data-v="${til}"]`, `Rusj.S.spill.trekk.length > ${n}`);
    const annen = p === a ? b : a;
    await annen.vent(`Rusj.S.spill && Rusj.S.spill.trekk.length > ${n}`, 8000);
    await t.sov(400);
  };

  // A tap on the other side's piece while it is not your turn does nothing.
  await svart.klikk('.sh-rute[data-v="e7"]');
  await svart.klikk('.sh-rute[data-v="e5"]');
  await t.sov(400);
  t.sjekk((await svart.spill()).trekk.length === 0, "Svart fikk flytte før hvit");

  await flytt(hvit, "f2", "f3");
  await flytt(svart, "e7", "e5");
  await svart.bilde("svart-har-flyttet");
  await t.gjenoppkoble(svart, hvit);
  t.sjekk(JSON.stringify((await svart.spill()).trekk) === '["f2f3","e7e5"]', `Svart har ikke trekkene etter gjenoppkobling: ${JSON.stringify((await svart.spill()).trekk)}`);
  await flytt(hvit, "g2", "g4");
  await hvit.bilde("hvit-venter");
  await flytt(svart, "d8", "h4");
  await a.ventSkjerm("slutt", 10000);
  await b.ventSkjerm("slutt", 10000);
  const res = await a.spill();
  t.sjekk(res.resultat && res.resultat.grunn === "matt" && res.resultat.vinner === 1, `Resultatet er ikke matt til svart: ${JSON.stringify(res.resultat)}`);
  if (t.norsk) t.sjekk((await svart.tekst("#skjerm h1")) === "Du vinner!", `Svart sin kåring: «${await svart.tekst("#skjerm h1")}»`);
  await svart.bilde("kaaring-vinner");
  await hvit.bilde("kaaring-taper");

  // «Ny kamp»: the colours swap.
  const forHvit = (await a.spill()).hvit;
  await b.klikk('[data-h="nett-ny"]');
  await a.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  await b.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  t.sjekk((await a.spill()).hvit !== forHvit, "Fargene byttet ikke ved ny kamp");
  ({ hvit, svart } = await farger());
  await flytt(hvit, "e2", "e4");

  // White resigns: both phones to the result, black wins.
  await hvit.klikk('[data-h="gi-opp"]');
  await hvit.bilde("gi-opp");
  await hvit.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await a.ventSkjerm("slutt", 10000);
  await b.ventSkjerm("slutt", 10000);
  const r2 = await b.spill();
  t.sjekk(r2.resultat && r2.resultat.grunn === "oppgitt" && r2.resultat.vinner === 1, `Etter «Gi opp»: ${JSON.stringify(r2.resultat)}`);
  await svart.bilde("motstanderen-ga-opp");

  await t.forlat(a);
  await b.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await b.klikk('#ark [data-h="nett-forlat"]');
  await b.ventSkjerm("hjem");
}
