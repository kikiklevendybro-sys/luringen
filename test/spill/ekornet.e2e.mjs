// Ekornet (times tables and mental maths). Runs in every edition: texts are checked in Norwegian only.
// 1 Home with the progress rings, rules, setup: two ways, four kinds of sums, ten tables.
// 2 A practice round on the 3- and 7-tables with the number keys: a right answer gives a nut and
//   moves the fact up; a wrong one shows the right answer and comes back later («En gang til»);
//   a reload and back + «Fortsett» keep the round; the keyboard works; the result lists what to
//   practise and the rings show the progress.
// 3 A challenge with four answers to choose from, plus up to 20: twenty right gives three stars,
//   a record and the sticker.
// 4 The question and the keys fit a small screen with division and the number keys.
export default async function (t) {
  const spillet = async () => (await t.tilstand()).spill;
  const svaret = () => t.js("Rusj.S.spill.ko[Rusj.S.spill.nr].svar");
  const klar = () => t.vent("Rusj.S.spill && !Rusj.S.spill.svart && !Rusj.S.spill.ferdig && document.querySelector('.ek-stykke')", 8000);
  // Type a number on the on-screen keys (the answer is checked when it has enough digits).
  async function skriv(n, ok = false) {
    for (const d of String(n)) await t.klikk(`.ek-tast[data-v="${d}"]`, 60);
    if (ok) await t.klikk('.ek-tast[data-v="ok"]', 60);
    await t.sov(150);
  }
  // Answer right with the on-screen keys, then go on at once.
  async function riktig() {
    await klar();
    await skriv(await svaret());
    await t.vent("Rusj.S.spill.svart || Rusj.S.spill.ferdig");
    if (!(await t.js("Rusj.S.spill.ferdig"))) await t.klikk('.ek-tast[data-v="ok"]', 120);
  }
  const passer = async (hvor) => {
    t.sjekk(await t.friForDokk(".ek-kort"), `Regnestykket ligger under tastene (${hvor})`);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Siden er for bred (${hvor})`);
  };

  // ---------- 1 Home, rules, setup ----------
  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk((await t.antall(".ek-fremgang .ek-ring")) === 10, "Hjem viser ikke ti ringer for gangetabellen");
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall('[data-h="modus"]')) === 2 && (await t.antall('[data-h="art"]')) === 4 && (await t.antall('[data-h="tabell"]')) === 10, "Oppsettet mangler valg");
  await t.klikk('[data-h="tabell"][data-v="3"]');
  await t.klikk('[data-h="tabell"][data-v="7"]');
  await t.klikk('[data-h="tabell"][data-v="2"]');
  t.sjekk((await t.tilstand()).oppsett.tabeller.join() === "3,7", "Valget av tabeller ble feil");
  await t.bilde("oppsett", true);

  // ---------- 2 Practice ----------
  await t.klikk('[data-h="start"]');
  await klar();
  await passer("øving");
  await t.bilde("sporsmal");
  let sp = await spillet();
  t.sjekk(sp.ko.length === 10 && sp.ko.every((q) => [3, 7].includes(q.b) && q.op === "gange"), "Øverunden har ikke ti spørsmål fra 3- og 7-gangen");
  const forste = sp.ko[0];
  await riktig();
  let s = await t.tilstand();
  t.sjekk(s.spill.notter === 1 && s.fakta[forste.k] === 1 && s.notter === 1, `Et riktig svar ga ikke nøtt og nivå (${JSON.stringify({ n: s.spill.notter, f: s.fakta[forste.k] })})`);
  // A wrong answer: the right one shows, and the question is put back three later.
  await klar();
  const andre = (await spillet()).ko[1];
  const feil = andre.svar === 1 ? 2 : andre.svar - 1;
  await skriv(feil, String(feil).length < String(andre.svar).length);
  await t.vent("Rusj.S.spill.svart");
  await t.bilde("feil-svar");
  sp = await spillet();
  t.sjekk(!sp.svart.riktig && sp.ko.length === 11 && sp.ko[4].k === andre.k && sp.ko[4].igjen && sp.bom.length === 1, `Et feil svar kom ikke tilbake senere (${sp.ko.length})`);
  t.sjekk(!t.norsk || (await t.tekst(".ek-stykke")).includes(String(andre.svar)), "Det riktige svaret vises ikke");
  // On by itself after a moment.
  await t.vent("Rusj.S.spill.nr === 2 && !Rusj.S.spill.svart", 5000);
  // Reload: the round goes on where it was.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await klar();
  t.sjekk((await spillet()).nr === 2, "Omlasting mistet plassen i runden");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await klar();
  // The keyboard: digits and Enter.
  const n3 = await svaret();
  for (const d of String(n3)) await t.js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "${d}", bubbles: true }))`);
  await t.vent("Rusj.S.spill.svart");
  t.sjekk((await spillet()).svart.riktig, "Svaret med tastaturet ble ikke godkjent");
  await t.js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`);
  await t.vent("Rusj.S.spill.nr === 3 && !Rusj.S.spill.svart");
  await riktig();
  await klar();
  t.sjekk((await spillet()).ko[(await spillet()).nr].igjen, "Spørsmålet man bommet på, kom ikke tilbake");
  await t.bilde("en-gang-til");
  for (let i = 0; i < 7; i++) await riktig();
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(400);
  await t.bilde("resultat-ove", true);
  s = await t.tilstand();
  t.sjekk(s.spill.resultat.riktige === 9 && s.spill.resultat.av === 10, `Øverunden ble talt feil (${JSON.stringify(s.spill.resultat)})`);
  t.sjekk((await t.antall(".ek-bom li")) === 1, "Resultatet viser ikke hva man bør øve mer på");
  t.sjekk(!!s.sist && s.sist.riktige === 9, "«Sist» ble ikke lagret");

  // ---------- 3 Challenge with four answers ----------
  await t.klikk('.lenkerad [data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="utfordring"]');
  await t.klikk('[data-h="art"][data-v="pluss"]');
  await t.klikk('[data-h="til"][data-v="20"]');
  await t.klikk('[data-h="svarvalg"]');
  await t.bilde("oppsett-utfordring", true);
  await t.klikk('[data-h="start"]');
  await klar();
  t.sjekk((await t.antall(".ek-svar")) === 4, "Fire svar å velge mellom vises ikke");
  await passer("fire svar");
  await t.bilde("fire-svar");
  for (let i = 0; i < 20; i++) {
    await klar();
    await t.klikk(`.ek-svar[data-v="${await svaret()}"]`, 80);
    await t.vent("Rusj.S.spill.svart || Rusj.S.spill.ferdig");
    if (!(await t.js("Rusj.S.spill.ferdig"))) await t.klikk(".ek-svar", 100);
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(500);
  await t.bilde("resultat-utfordring", true);
  s = await t.tilstand();
  t.sjekk(s.spill.resultat.riktige === 20 && s.spill.resultat.st === 3 && s.rekorder["pluss:20"] === 20, `Utfordringen ble talt feil (${JSON.stringify(s.spill.resultat)})`);
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(!!merker["ekornet-alle"], "Klistremerket «Nøtteknekker» ble ikke gitt for 20 av 20");

  // ---------- 4 Division with the number keys ----------
  await t.klikk('.lenkerad [data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="ove"]');
  await t.klikk('[data-h="art"][data-v="deling"]');
  await t.klikk('[data-h="svarvalg"]');
  await t.klikk('[data-h="alle"]');
  t.sjekk((await t.tilstand()).oppsett.tabeller.length === 10, "«Alle» valgte ikke alle tabellene");
  await t.klikk('[data-h="start"]');
  await klar();
  sp = await spillet();
  t.sjekk(sp.ko.every((q) => q.op === "deling" && q.a / q.b === q.svar), "Delestykkene er feil");
  await passer("deling");
  await t.bilde("deling");
  await riktig();
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.ek-fremgang')");
  await t.bilde("hjem-fremgang", true);
}
