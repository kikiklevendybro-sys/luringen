// Dommeren: a full three-player game to 3 points. Setup (the adult pack behind the 18+ question:
// «Nei» leaves it off, «Ja» turns it on and remembers the answer), the card with its gap read by
// the judge, «Bytt kort», the phone going round (a gate before every hand, nothing private on the
// gate, a reload on the hand goes back to the gate, «Angre siste kort»), back + «Fortsett», the
// judge's list (no names), the winner of the round, undo of the judge's choice, the next judge,
// and Kåringen (podium, «Kveldens beste», share button, Kveldens gjeng once, the sticker).
// Runs in every edition: texts are compared with the page's own R.t (tr) or only in Norwegian.

export default async function (t) {
  const pause = () => t.sov(420);
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const sp = async () => (await t.tilstand()).spill;
  const tr = (nokkel, verdier) => t.js(`Rusj.t(${JSON.stringify(nokkel)}, ${JSON.stringify(verdier || null)})`);
  const har = async (sel, nokkel, verdier) => (await t.tekst(sel)).toLocaleLowerCase().includes((await tr(nokkel, verdier)).toLocaleLowerCase());
  const navn = (i) => t.js(`Rusj.navn(${i})`);
  const svarTekst = (k) => t.js(`RUSJ_DATA.kort.pakker.flatMap((p) => p.svar)[${k}]`);
  const kveld = () => t.js(`((JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null") || {}).spill || []).filter((s) => s.id === "dommeren").length`);
  const merker = () => t.js(`Object.keys(JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}"))`);
  const over18 = () => t.js(`!!(JSON.parse(localStorage.getItem("rusj.felles") || "{}").over18)`);
  const vent = (uttrykk) => t.vent(uttrykk);
  const gi = () => vent(`document.querySelector('[data-h="jeg-er"]')`);
  // One player on the hand screen picks card n and plays it.
  const legg = async (n = 0) => {
    await gi();
    await pause();
    await t.klikk('[data-h="jeg-er"]');
    await vent("document.querySelector('.dom-svarkort')");
    await t.klikk(`.dom-svarkort[data-v="${n}"]`);
    await t.klikk("#dom-legg", 300);
  };
  // A whole round: the card, everyone plays their first card, the judge picks option v.
  const runde = async (v = 0) => {
    await vent(`document.querySelector('[data-h="rundt"]')`);
    await pause();
    await t.klikk('[data-h="rundt"]');
    for (let n = 0; n < 2; n++) await legg(0);
    await gi();
    await pause();
    await t.klikk('[data-h="jeg-er"]');
    await vent("document.querySelector('.dom-alternativ')");
    await t.klikk(`.dom-alternativ[data-v="${v}"]`);
    await t.klikk("#dom-kar", 400);
    await vent(`document.querySelector('[data-h="videre"]')`);
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(await har("#skjerm", "Fyll inn det som mangler."), "Hjem mangler slagordet");
  await t.klikk('[data-h="nytt"]');
  await enH1("gjør klart");
  const fliser = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((f) => f.dataset.v + (f.getAttribute("aria-pressed") === "true" ? "*" : "")).join()`);
  t.sjekk(fliser === "familie*,voksen", `Pakkene er feil (voksenpakken skal være av): ${fliser}`);
  t.sjekk(await t.finnes('[data-h="maal"][data-v="5"][aria-pressed="true"]'), "Standard: spill til 5");

  // The adult pack: the 18+ question first.
  await t.klikk('[data-h="pakke"][data-v="voksen"]');
  await vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"]')`);
  t.sjekk(await har("#ark", "Er du 18 år eller eldre?"), "Voksenpakken spør ikke om alder");
  await t.bilde("atten-ark");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]', 400);
  t.sjekk(!(await t.tilstand()).oppsett.pakker.includes("voksen") && !(await over18()), "«Nei» skal la voksenpakken være av");
  await t.klikk('[data-h="pakke"][data-v="voksen"]');
  await vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"]')`);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 400);
  t.sjekk((await t.tilstand()).oppsett.pakker.includes("voksen") && (await over18()), "«Ja» skal slå på voksenpakken og huske svaret");
  await t.klikk('[data-h="pakke"][data-v="voksen"]');
  await t.klikk('[data-h="pakke"][data-v="voksen"]');
  t.sjekk(!(await t.finnes('#ark:not([hidden])')) && (await t.tilstand()).oppsett.pakker.includes("voksen"), "Andre gang skal ikke spørre om alder igjen");
  await t.klikk('[data-h="pakke"][data-v="voksen"]');
  await t.klikk('[data-h="maal"][data-v="3"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.join() === "familie" && (await t.tilstand()).oppsett.maal === 3, "Valgene ble ikke lagret");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');

  // ---------- The card ----------
  await vent(`document.querySelector('[data-h="rundt"]')`);
  await enH1("kortet");
  let s = await sp();
  t.sjekk(s.antall === 3 && s.maal === 3 && s.hender.every((h) => h.length === 5), "Spillet startet ikke med fem kort hver");
  t.sjekk(await har(".dom-dommer", "Dommer: {navn}", { navn: await navn(s.dommer) }), "Kortet viser ikke hvem som er dommer");
  t.sjekk(await t.finnes(".storkort .dom-hull"), "Kortet mangler det tomme feltet");
  t.sjekk(await t.friForDokk(".storkort"), "Kortet havner bak knappene");
  await t.bilde("kort");
  await pause();
  const forste = s.sporsmal;
  await t.klikk('[data-h="bytt"]', 700);
  t.sjekk((await sp()).sporsmal !== forste, "«Bytt kort» ga ikke nytt kort");

  // ---------- The phone goes round ----------
  await pause();
  await t.klikk('[data-h="rundt"]');
  await gi();
  await enH1("gi mobilen");
  s = await sp();
  const [p1, p2] = s.rekke;
  t.sjekk(s.rekke.length === 2 && !s.rekke.includes(s.dommer) && p1 === (s.dommer + 1) % 3, "Rekkefølgen rundt bordet er feil");
  t.sjekk(!(await t.finnes(".dom-svarkort")) && (await t.tekst("#skjerm h1")).trim() === (await navn(p1)), "Gi-skjermen viser kort eller feil navn");
  await t.bilde("gi");
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await vent("document.querySelector('.dom-svarkort')");
  await enH1("hånda");
  t.sjekk((await t.antall(".dom-svarkort")) === 5 && (await t.js(`document.querySelector("#dom-legg").disabled`)), "Hånda skal ha fem kort og «Legg kortet» av til et kort er valgt");
  await t.klikk('.dom-svarkort[data-v="2"]');
  const kort2 = s.hender[p1][2];
  t.sjekk((await t.tekst(".dom-forhand .dom-svar")).toLocaleLowerCase() === (await svarTekst(kort2)).toLocaleLowerCase(), "Forhåndsvisningen viser ikke svaret i setningen");
  t.sjekk(await t.friForDokk(".dom-forhand"), "Setningen havner bak knappen");
  await t.bilde("hand");
  // A reload on the hand: back to the gate, nothing private shown.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  t.sjekk((await t.finnes('[data-h="jeg-er"]')) && !(await t.finnes(".dom-svarkort")), "Etter omlasting skal mobilen gis til samme spiller igjen, uten kortene");
  // Back + «Fortsett» on the gate.
  await t.klikk("#tilbake");
  await vent(`document.querySelector('[data-h="fortsett"]')`);
  await pause();
  await t.klikk('[data-h="fortsett"]');
  await legg(2);
  s = await sp();
  t.sjekk(s.lagt[p1] === kort2 && s.hender[p1].length === 4 && s.na === 1, "Kortet ble ikke lagt");
  // «Angre siste kort» gives it back.
  await gi();
  await t.klikk('[data-h="angre-legg"]', 400);
  s = await sp();
  t.sjekk(s.na === 0 && s.lagt[p1] === -1 && s.hender[p1].length === 5 && (await t.tekst("#skjerm h1")).trim() === (await navn(p1)), "«Angre siste kort» ga ikke kortet tilbake");
  await legg(0);
  await legg(1);

  // ---------- The judge ----------
  await gi();
  s = await sp();
  t.sjekk(s.fase === "dom" && (await t.tekst("#skjerm h1")).trim() === (await navn(s.dommer)), "Mobilen skal til dommeren når alle har valgt");
  await t.bilde("til-dommeren");
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await vent("document.querySelector('.dom-alternativ')");
  await enH1("dommeren");
  t.sjekk((await t.antall(".dom-alternativ")) === 2, "Dommeren skal se to svar");
  const lista = await t.tekst(".dom-valg");
  t.sjekk(!lista.includes(await navn(p1)) && !lista.includes(await navn(p2)), "Dommeren ser hvem som skrev hva");
  t.sjekk(await t.js(`document.querySelector("#dom-kar").disabled`), "«Kår vinneren» skal være av til et svar er valgt");
  await t.klikk('.dom-alternativ[data-v="1"]');
  await t.bilde("dom", true);
  await t.klikk("#dom-kar", 400);
  await vent(`document.querySelector('[data-h="videre"]')`);
  await enH1("rundens vinner");
  s = await sp();
  const vinner = s.valg[1];
  t.sjekk(s.poeng[vinner] === 1 && (await har("#skjerm h1", "{navn} vinner runden!", { navn: await navn(vinner) })), `Rundens vinner er feil (${s.poeng})`);
  await t.bilde("resultat");
  await t.klikk("#angre", 400);
  await vent("document.querySelector('.dom-alternativ')");
  s = await sp();
  t.sjekk(s.fase === "dom" && s.poeng.every((p) => p === 0), "«Angre» tok ikke poenget tilbake");
  await t.klikk('.dom-alternativ[data-v="0"]');
  await t.klikk("#dom-kar", 400);
  await vent(`document.querySelector('[data-h="videre"]')`);
  const forrigeDommer = (await sp()).dommer;
  await pause();
  await t.klikk('[data-h="videre"]');
  await vent(`document.querySelector('[data-h="rundt"]')`);
  s = await sp();
  t.sjekk(s.dommer === (forrigeDommer + 1) % 3 && s.runde === 2 && s.hender.every((h) => h.length === 5), "Neste runde: ny dommer og fem kort hver");

  // ---------- Play on to 3 points ----------
  for (let n = 0; n < 12; n++) {
    await runde(0);
    if (await t.finnes('[data-h="videre"]')) {
      s = await sp();
      if (s.poeng.some((p) => p >= 3)) break;
      await pause();
      await t.klikk('[data-h="videre"]');
    }
  }
  t.sjekk(await har('[data-h="videre"]', "Til kåringen"), "Etter 3 poeng skal knappen gå til kåringen");
  await pause();
  await t.klikk('[data-h="videre"]');
  await vent("document.querySelector('.pall')");
  await enH1("kåringen");
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.skjerm === "slutt", "Spillet ble ikke ferdig");
  t.sjekk((await t.antall(".dom-beste li")) >= 3 && (await t.finnes('[data-h="del"]')), "Kåringen mangler «Kveldens beste» eller «Del resultatet»");
  t.sjekk((await kveld()) === 1, "«Kveldens gjeng» fikk ikke spillet nøyaktig én gang");
  await t.sov(1800);
  t.sjekk((await merker()).includes("dommeren-seier"), "Klistremerket ble ikke gitt");
  await t.bilde("kaaringen", true);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await kveld()) === 1, "Omlasting registrerte spillet en gang til");
}
