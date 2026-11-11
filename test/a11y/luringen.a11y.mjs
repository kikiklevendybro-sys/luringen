// Luringen (src/) only has its first two screens in the shared runner. For the accessibility pass
// this plays one round on one phone and walks through the "each on their own phone" screens, with a
// t.bilde() — and so an a11y check — on every screen. The steps follow test/e2e.mjs.
// Called by test/rusj-e2e.mjs (only with --a11y) when the set-up screen is showing.
export default async function (t) {
  const tilstand = () => t.js(`JSON.parse(localStorage.getItem("luringen.v1"))`);
  const apen = (id) => t.vent(`!document.querySelector("#s-${id}").hidden`);
  const kort = ".skjerm:not([hidden]) .mappe";

  // The rules, from the home screen
  await t.klikk('[data-h="tilbake"]');
  await t.klikk('[data-h="regler"]');
  await apen("regler");
  await t.bilde("luringen-regler");
  await t.klikk('[data-h="tilbake"]');

  // One phone, 4 players
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="spillere"][data-d="-1"]');
  await t.skrivInn("#navn-0", "Testspiller A");
  await t.klikk('[data-h="niva"][data-v="0"]');
  await t.klikk('[data-h="start"]');
  await apen("del");
  await t.bilde("luringen-del");
  const runde = (await tilstand()).spill.r;
  for (let i = 0; i < 4; i++) {
    const slipp = await t.hold(kort);
    if (i === 0 || runde.luringer.includes(i)) await t.bilde(runde.luringer.includes(i) ? "luringen-kort-luring" : "luringen-kort-apent");
    await slipp();
    if (i === 0) await t.bilde("luringen-kort-sett");
    await t.klikk('[data-h="neste-spiller"]');
  }
  await apen("diskusjon");
  await t.sov(1200);
  await t.bilde("luringen-diskusjon");
  await t.klikk('[data-h="se-igjen"]');
  await t.bilde("luringen-se-igjen-velg");
  await t.klikk('[data-h="se-igjen-velg"][data-v="1"]');
  const slippArk = await t.hold("#ark .mappe", 600);
  await t.bilde("luringen-se-igjen-kort");
  await slippArk();
  await t.klikk('[data-h="lukk-ark"]');
  await t.klikk('[data-h="til-pek"]');
  await t.bilde("luringen-pek");
  await t.klikk(`[data-h="velg-mistenkt"][data-v="${runde.luringer[0]}"]`);
  await t.bilde("luringen-pek-valgt");
  await t.klikk('[data-h="avslor"]');
  await t.vent(`document.querySelector("#stempel-sted .stempel")`, 8000);
  await t.sov(600);
  await t.bilde("luringen-avslor");
  await t.klikk('[data-h="vis-ordet"]');
  await t.bilde("luringen-avslor-ordet");
  await t.klikk('[data-h="ferdig"][data-v="gruppa"]');
  await apen("resultat");
  await t.sov(900);
  await t.bilde("luringen-resultat");

  // Each on their own phone: the host. (A game is in progress, so «Nytt spill» asks first.)
  await t.klikk('[data-h="tilbake"]');
  await t.klikk('[data-h="nytt"]');
  await t.vent(`!document.querySelector("#ark").hidden`);
  await t.bilde("luringen-nytt-bekreft");
  await t.klikk('[data-h="ark-svar"][data-v="ja"]');
  await apen("oppsett");
  await t.klikk('[data-h="modus"][data-v="hver"]');
  await t.klikk('[data-h="kat-velg"]');
  await t.klikk('[data-h="kat"][data-id="dyr"]');
  await t.bilde("luringen-oppsett-hver", true);
  await t.klikk('[data-h="start"]');
  await apen("kode");
  await t.bilde("luringen-kode", true);
  await t.klikk('[data-h="vert-plass"][data-v="0"]');
  const slippVert = await t.hold(kort);
  await slippVert();
  await t.bilde("luringen-kode-klar", true);
  const kode = (await tilstand()).spill.kode;

  // … and a guest (fresh storage = another phone)
  await t.js("localStorage.clear()");
  await t.lastSide(`${t.side}?enhet=2#${kode}`, `!document.querySelector("#s-bli-med").hidden`);
  await t.bilde("luringen-bli-med");
  await t.skrivInn("#kodefelt", kode.slice(0, -1) + (kode.endsWith("A") ? "B" : "A"));
  await t.js(`document.querySelector("#kodeskjema").requestSubmit()`);
  await t.sov(250);
  await t.bilde("luringen-bli-med-feil");
  await t.skrivInn("#kodefelt", kode.toLowerCase());
  await t.js(`document.querySelector("#kodeskjema").requestSubmit()`);
  await apen("plass");
  await t.bilde("luringen-velg-plass");
  await t.klikk('[data-h="gjest-plass"][data-v="1"]');
  await apen("gjest");
  await t.bilde("luringen-gjest");
}
