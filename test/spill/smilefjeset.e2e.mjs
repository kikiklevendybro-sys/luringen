// Smilefjeset: a game with the crew (three players, ten riddles): setup (mode first, all packs,
// length), the card (emojis only), both hints (boxes per letter, then first letters), a swipe to
// swap, «Vis svaret», a point to whoever guessed first, «Angre», «Ingen klarte det», a reload in
// the middle, back + «Fortsett», Kåringen (podium, Kveldens gjeng once). Then solo: ten right
// (record, sticker, share button, «sist» line and record on home) and a solo game quit early.
// Runs in every edition: texts are compared with the page's own R.t (tr) or only in Norwegian.

export default async function (t) {
  const pause = () => t.sov(420);
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const sp = async () => (await t.tilstand()).spill;
  const tr = (nokkel, verdier) => t.js(`Rusj.t(${JSON.stringify(nokkel)}, ${JSON.stringify(verdier || null)})`);
  const har = async (sel, nokkel, verdier) => (await t.tekst(sel)).toLocaleLowerCase().includes((await tr(nokkel, verdier)).toLocaleLowerCase());
  const gate = (i) => t.js(`RUSJ_DATA.gater.pakker.flatMap((p) => p.kort)[${i}]`);
  const kveld = () => t.js(`((JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null") || {}).spill || []).filter((s) => s.id === "smilefjeset").length`);
  const merker = () => t.js(`Object.keys(JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}"))`);
  const gjett = () => t.vent(`document.querySelector('.sf-emoji') && document.querySelector('[data-h="vis"]')`);
  const vis = async () => {
    await gjett();
    await pause();
    await t.klikk('[data-h="vis"]');
    await t.vent("document.querySelector('.sf-svar')");
    await pause();
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(await har("#skjerm", "Se emojiene."), "Hjem mangler slagordet");
  await t.klikk('[data-h="nytt"]');
  await enH1("gjør klart");
  t.sjekk((await t.js(`document.querySelector("#skjerm h2").nextElementSibling.querySelector('[data-h]').dataset.h`)) === "modus", "Valget av spillemåte skal stå først");
  t.sjekk(await t.finnes('[data-h="modus"][data-v="gjengen"][aria-pressed="true"]'), "«Gjengen» skal være valgt fra start");
  const pakker = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((f) => f.dataset.v + (f.getAttribute("aria-pressed") === "true" ? "*" : "")).join()`);
  t.sjekk(pakker === "ordtak*,ting*,steder*,dyr*,yrker*,sanger*", `Pakkene er feil: ${pakker}`);
  t.sjekk(await t.finnes('[data-h="lengde"][data-v="10"][aria-pressed="true"]') && (await t.finnes("#spillerboks")), "Standard: 10 gåter, og spillerne vises for gjengen");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');

  // ---------- The card and the hints ----------
  await gjett();
  await enH1("gåte");
  let s = await sp();
  t.sjekk(s.modus === "gjengen" && s.antall === 3 && s.nr === 1 && s.lengde === 10, "Spillet startet ikke riktig");
  t.sjekk(await t.friForDokk(".storkort"), "Kortet havner bak knappene");
  t.sjekk(!(await t.finnes(".sf-svar")), "Svaret vises før «Vis svaret»");
  await t.bilde("gate");
  await t.sveip(".storkort", 240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  await pause();
  const forste = s.kort;
  s = await sp();
  t.sjekk(s.kort !== forste && s.nr === 1, "Sveip ga ikke ny gåte, eller talte med");
  let k = await gate(s.kort);
  const bokstaver = Array.from(k.s).filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
  await t.klikk('[data-h="hint"]');
  t.sjekk((await t.antall(".sf-boks")) === bokstaver && !(await t.finnes(".sf-boks.vis")), `Første hint skal gi én boks per bokstav (${await t.antall(".sf-boks")} av ${bokstaver})`);
  await t.klikk('[data-h="hint"]');
  const ord = k.s.split(/\s+/).filter((o) => /[\p{L}\p{N}]/u.test(o)).length;
  t.sjekk((await t.antall(".sf-boks.vis")) === ord, `Andre hint skal vise forbokstaven i hvert ord (${await t.antall(".sf-boks.vis")} av ${ord})`);
  t.sjekk(await t.js(`document.querySelector('[data-h="hint"]').disabled`), "Hint-knappen skal stoppe etter to hint");
  t.sjekk(await t.friForDokk(".sf-hint"), "Hintet havner bak knappene");
  await t.bilde("hint");

  // Reload with the hints showing, then back + «Fortsett».
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  t.sjekk((await sp()).hint === 2 && (await t.antall(".sf-boks.vis")) === ord, "Omlasting mistet hintene");
  await t.klikk("#tilbake");
  await t.vent(`document.querySelector('[data-h="fortsett"]')`);
  await pause();
  await t.klikk('[data-h="fortsett"]');
  await vis();
  t.sjekk((await t.tekst(".sf-svar")).includes(k.s), `Svaret vises ikke: ${await t.tekst(".sf-svar")}`);
  t.sjekk(await t.finnes('[data-h="fikk"]'), "Mangler «Hvem gjettet først?»");
  await t.bilde("svar");

  // A point, undo, the point to someone else.
  await t.klikk('[data-h="fikk"][data-v="0"]', 400);
  await gjett();
  s = await sp();
  t.sjekk(s.nr === 2 && s.poeng.join() === "1,0,0" && (await t.finnes("#angre")), `Poenget ble ikke gitt (${s.poeng})`);
  await pause();
  await t.klikk("#angre", 400);
  await t.vent("document.querySelector('.sf-svar')");
  s = await sp();
  t.sjekk(s.nr === 1 && s.poeng.join() === "0,0,0" && s.fase === "svar", "«Angre» tok ikke poenget tilbake");
  await pause();
  await t.klikk('[data-h="fikk"][data-v="1"]', 400);
  // The rest: Testspiller C gets most, one nobody gets.
  for (let n = 2; n <= 10; n++) {
    await vis();
    if (n === 4) await t.klikk('[data-h="ingen"]', 400);
    else await t.klikk(`[data-h="fikk"][data-v="${n % 3 === 0 ? 1 : 2}"]`, 400);
  }
  await t.vent("document.querySelector('.pall') || document.querySelector('.poengliste')");
  await enH1("kåringen");
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.skjerm === "slutt" && s.spill.spilt === 10, "Spillet ble ikke ferdig etter ti gåter");
  t.sjekk(s.spill.poeng.join() === "0,4,5", `Feil poeng: ${s.spill.poeng}`);
  t.sjekk(await har("#skjerm h1", "{navn} vinner!|{navn} vinner!", { navn: "Testspiller C", n: 1 }) || (await t.js("Rusj.navn(2)")).includes("<x-q>"), `Feil vinner: ${await t.tekst("#skjerm h1")}`);
  t.sjekk((await kveld()) === 1, "«Kveldens gjeng» fikk ikke spillet nøyaktig én gang");
  await t.bilde("kaaringen", true);

  // ---------- Solo: ten out of ten ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent(`document.querySelector('[data-h="modus"][data-v="alene"]')`);
  await t.klikk('[data-h="modus"][data-v="alene"]');
  t.sjekk(!(await t.finnes("#spillerboks")), "Alene skal ikke spørre etter spillere");
  await t.klikk('[data-h="start"]');
  for (let n = 1; n <= 10; n++) {
    await vis();
    if (n === 1) {
      t.sjekk(await t.finnes('[data-h="klarte"]') && (await t.finnes('[data-h="bom"]')), "Alene mangler «Jeg klarte det!» og «Ikke denne»");
      t.sjekk(await t.friForDokk(".sf-svar"), "Svaret havner bak knappene");
      await t.bilde("alene-svar");
    }
    await t.klikk('[data-h="klarte"]', 400);
  }
  await t.vent(`document.querySelector('[data-h="igjen"]')`);
  await enH1("alene ferdig");
  s = await t.tilstand();
  t.sjekk(s.spill.riktig === 10 && s.rekord["10"] === 10 && s.spill.nyRekord, `Rekorden ble ikke lagret (${JSON.stringify(s.rekord)})`);
  t.sjekk(await har("#skjerm h1", "{riktig} av {av}", { riktig: 10, av: 10 }), `Resultatet: ${await t.tekst("#skjerm h1")}`);
  t.sjekk(await t.finnes('[data-h="del"]'), "Resultatet mangler «Del resultatet»");
  t.sjekk((await kveld()) === 1, "Et spill alene skal ikke inn i «Kveldens gjeng»");
  await t.sov(1800);
  t.sjekk((await merker()).includes("smilefjeset-alle"), "Klistremerket «Emoji-ekspert» ble ikke gitt");
  await t.bilde("alene-ferdig", true);

  // ---------- Solo, quit early: no record ----------
  await t.klikk('[data-h="igjen"]');
  for (let n = 1; n <= 2; n++) {
    await vis();
    await t.klikk(n === 1 ? '[data-h="klarte"]' : '[data-h="bom"]', 400);
  }
  await gjett();
  await pause();
  await t.klikk('[data-h="avslutt"]');
  await t.vent(`document.querySelector('#ark:not([hidden]) [data-h="ark-svar"]')`);
  t.sjekk(!t.norsk || (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Arket skal ha «Spill videre»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(`document.querySelector('[data-h="igjen"]')`);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.riktig === 1 && s.spill.spilt === 2 && s.rekord["10"] === 10, "Å avslutte alene skal vise 1 av 2 og ikke røre rekorden");
  t.sjekk(await har("#skjerm h1", "{riktig} av {av}", { riktig: 1, av: 2 }), `Resultatet etter «Avslutt»: ${await t.tekst("#skjerm h1")}`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk(await t.finnes(".sf-sist"), "Hjem mangler «sist»-linja");
  t.sjekk(await har(".sf-sist", "Rekord alene: {rekorder}", { rekorder: await tr("{riktig} av {av}", { riktig: 10, av: 10 }) }), `Hjem viser ikke rekorden: ${await t.tekst(".sf-sist")}`);
  await t.bilde("hjem-sist");
}
