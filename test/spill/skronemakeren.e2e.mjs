// Skrønemakeren: a full three-player game. Setup (packs, rounds), swapping the card, the phone
// going round for the fakes (privacy gate before each), a reload in the middle of typing (back to
// the gate, nothing typed shown to the room), a fake equal to the truth (bonus, a new fake, sits
// out the vote), two identical fakes merged, the vote (never your own, undo), the reveal step by
// step with a reload in the middle, the round's points, back + «Fortsett», then two quick rounds
// and Kåringen (podium, awards, «Kveldens gjeng» once, typed text gone from storage).
// Player-typed markup is checked to show as text everywhere; with --probe the fakes carry <x-q>
// and the runner fails if one ever becomes an element.
// In another edition the texts are compared with the page's own R.t (tr), and the typed fakes are
// language-neutral so the check for Norwegian words left on screen stays meaningful.

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const sp = async () => (await t.tilstand()).spill;
  const kveld = () => t.js(`((JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null") || {}).spill || []).filter((s) => s.id === "skronemakeren")`);
  const tr = (nokkel, verdier) => t.js(`Rusj.t(${JSON.stringify(nokkel)}, ${JSON.stringify(verdier || null)})`);
  const har = async (sel, nokkel, verdier) => (await t.tekst(sel)).toLocaleLowerCase().includes((await tr(nokkel, verdier)).toLocaleLowerCase());
  // What the players type: Norwegian at home, neutral nonsense in the other editions.
  const TAK = t.norsk ? "skrøne om taket" : "plonk zibber flop";
  const LAVE = t.norsk ? " en gammel låve" : " grand old barn";
  const RUNDEFAKE = (n, runde) => (t.norsk ? `Skrøne nummer ${n} i runde ${runde} zqx` : `Fake number ${n} in round ${runde} zqx`);
  const svaret = (kort) => t.js(`RUSJ_DATA.kort.pakker.flatMap((p) => p.kort)[${kort}].a`);
  const ingenMarkup = async (hvor) =>
    t.sjekk(!(await t.js(`!!document.querySelector("#skjerm b.skrone-test, #skjerm x-q, #skjerm i.skrone-test")`)), `Spillerskrevet markup ble tolket som HTML på «${hvor}»`);

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const iProbe = await t.js(`Rusj.navn(0).includes("<x-q>")`);
  // Typed fakes carry markup: <x-q> in --probe (the runner counts those), a <b> otherwise.
  const merk = (tekst) => (iProbe ? `<x-q>${tekst}</x-q>` : `<b class="skrone-test">${tekst}</b>`);

  t.sjekk(await har("#skjerm", "Alle dikter en forklaring."), "Hjem mangler slagordet");
  await t.klikk('[data-h="nytt"]');
  await enH1("gjør klart");
  t.sjekk(await har("#skjerm h1", "Gjør klart"), "Oppsettet skal hete «Gjør klart»");
  const fliser = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((f) => f.dataset.v).join()`);
  t.sjekk(fliser === "ord,fakta,steder,dyr,oppfinnelser,barn", `Pakkene er feil: ${fliser}`);
  let s = await t.tilstand();
  t.sjekk(s.oppsett.runder === 5 && !s.oppsett.pakker.includes("barn"), "Standard: 5 runder, Barn ikke valgt");
  await t.klikk('[data-h="runder"][data-v="3"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="begynn"]')`);
  await enH1("kortet");
  t.sjekk(await har("#topp-tittel", "Runde {n} av {av}", { n: 1, av: 3 }), `Topplinja skal si «Runde 1 av 3»: ${await t.tekst("#topp-tittel")}`);
  t.sjekk(await t.friForDokk(".storkort"), "Kortet havner bak knappene");
  s = await sp();
  t.sjekk((await t.js(`Rusj._statKo.map((x) => x.h)`)).includes("start"), "Statistikken fikk ikke «start»");
  const forste = s.kort;
  await t.bilde("kort");
  await pause();
  await t.klikk('[data-h="bytt"]');
  s = await sp();
  t.sjekk(s.kort !== forste && s.fase === "kort", "«Bytt kort» ga ikke et nytt kort");
  const sannhet = await svaret(s.kort);
  t.sjekk(!(await t.tekst("#skjerm")).includes(sannhet), "Det ekte svaret vises på kortet");

  // ---------- Typing: the phone goes round ----------
  await pause();
  await t.klikk('[data-h="begynn"]');
  await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
  s = await sp();
  const [p1, p2, p3] = s.r.rekke;
  t.sjekk(!(await t.finnes("#skrone-felt")), "Skrivefeltet vises før «Jeg er …»");
  await enH1("gi mobilen");
  await t.bilde("gi-skriv");

  const skriv = async (tekst, ventPa = "gi") => {
    await t.skrivInn("#skrone-felt", tekst);
    await pause();
    await t.klikk("#skrone-ferdig", 300);
    if (ventPa === "gi") await t.vent(`document.querySelector('[data-h="jeg-er"]') || document.querySelector('[data-h="stem-start"]') || document.querySelector('[data-h="avslor-na"]')`);
  };

  // Player 1 starts typing, the page reloads: back to the gate, nothing shown to the room.
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#skrone-felt')");
  await enH1("skriv");
  t.sjekk(await t.friForDokk("#skrone-felt"), "Skrivefeltet havner bak knappen");
  const fake1 = merk("Fet") + " " + TAK;
  await t.skrivInn("#skrone-felt", fake1);
  await t.bilde("skriv");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  t.sjekk(await t.finnes('[data-h="jeg-er"]') && !(await t.finnes("#skrone-felt")), "Etter omlasting midt i skrivingen skal mobilen gis til samme spiller igjen");
  t.sjekk(!(await t.tekst("#skjerm")).includes(TAK), "Utkastet vises for hele rommet etter omlasting");
  s = await sp();
  t.sjekk(s.fase === "skriv" && s.r.na === 0 && s.r.rekke[0] === p1, "Omlastingen mistet hvem som skriver");
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#skrone-felt')");
  t.sjekk((await t.js(`document.querySelector("#skrone-felt").value`)) === fake1, "Utkastet ble ikke tatt vare på for samme spiller");
  // An empty fake is refused.
  await t.skrivInn("#skrone-felt", "  ?! ");
  await pause();
  await t.klikk("#skrone-ferdig", 300);
  t.sjekk((await har("#skrone-feil", "Skrønen må ha bokstaver eller tall.")) && (await sp()).r.na === 0, "En tom skrøne ble godtatt");
  await skriv(fake1);
  s = await sp();
  t.sjekk(s.r.na === 1 && s.r.skrevet[p1] === fake1, "Skrønen ble ikke lagret");
  t.sjekk(!(await t.tekst("#skjerm")).includes(TAK), "Forrige skrøne vises på neste gi-skjerm");

  // Player 2 types the truth: bonus, then a fake identical to player 1's (merged).
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#skrone-felt')");
  await skriv(`  ${sannhet.toUpperCase()}!! `, "samme");
  await t.vent("document.querySelector('.skrone-truffet')");
  s = await sp();
  t.sjekk(s.r.sann[p2] === true && s.r.na === 1 && s.r.skrevet[p2] === null, "Sannheten ga ikke bonus, eller ble lagret som skrøne");
  t.sjekk(await har("#skjerm h1", "Skriv en skrøne til"), "Spilleren som skrev sannheten, blir ikke bedt om en skrøne til");
  await t.bilde("skrev-sannheten");
  await skriv(fake1.toLowerCase());
  // Player 3
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#skrone-felt')");
  const fake3 = merk("Kursiv") + LAVE;
  await skriv(fake3);

  // ---------- Everyone reads the answers ----------
  await t.vent(`document.querySelector('[data-h="stem-start"]')`);
  await enH1("les");
  s = await sp();
  t.sjekk(s.fase === "les" && s.r.valg.length === 3, `Skrønene ble ikke slått sammen (${s.r.valg.length} svar)`);
  const merged = s.r.valg.findIndex((v) => !v.sann && v.av.length === 2);
  const sannK = s.r.valg.findIndex((v) => v.sann);
  const k3 = s.r.valg.findIndex((v) => !v.sann && v.av.length === 1);
  t.sjekk(merged >= 0 && s.r.valg[merged].av.includes(p1) && s.r.valg[merged].av.includes(p2), "Like skrøner skulle stå med begge forfatterne");
  t.sjekk(!iProbe ? (await t.tekst(".skrone-liste")).toLowerCase().includes('<b class="skrone-test">fet</b>') : true, "Markup i en skrøne vises ikke som tekst");
  await ingenMarkup("les");
  t.sjekk(/fikk|bonus/.test(await t.tekst(".skrone-fant")), "Lesesiden sier ikke at noen fant sannheten selv");
  await t.bilde("les", true);

  // ---------- The vote ----------
  await pause();
  await t.klikk('[data-h="stem-start"]');
  await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
  s = await sp();
  t.sjekk(s.r.srekke.length === 2 && !s.r.srekke.includes(p2), "Den som skrev sannheten, skal stå over stemmingen");
  const [v1, v2] = s.r.srekke;
  const stem = async (k, hvem) => {
    await pause();
    await t.klikk('[data-h="jeg-er"]');
    await t.vent(`document.querySelector('[data-h="velg"]')`);
    const egen = s.r.valg.findIndex((v) => v.av.includes(hvem));
    t.sjekk(await t.js(`document.querySelector('[data-h="velg"][data-v="${egen}"]').disabled`), "Egen skrøne kan velges");
    t.sjekk(await t.js(`document.querySelector("#skrone-stem").disabled`), "«Stem» kan trykkes før et svar er valgt");
    await t.klikk(`[data-h="velg"][data-v="${k}"]`);
    t.sjekk(await t.js(`document.querySelector('[data-h="velg"][data-v="${k}"]').getAttribute("aria-pressed") === "true"`), "Valgt svar er ikke markert");
    await ingenMarkup("stem");
    return egen;
  };
  await stem(sannK, v1);
  await t.bilde("stem");
  await t.klikk('[data-h="stem"]', 300);
  await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
  // Undo: the first voter votes again (on the same answer).
  t.sjekk(await t.finnes('[data-h="angre-stemme"]'), "Angre mangler etter en stemme");
  await t.bilde("gi-stem");
  await pause();
  await t.klikk('[data-h="angre-stemme"]', 300);
  s = await sp();
  t.sjekk(s.r.sna === 0 && s.r.stemmer[v1] === -1, "Angre tok ikke stemmen tilbake");
  await stem(sannK, v1);
  await t.klikk('[data-h="stem"]', 300);
  await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
  // The second voter: the merged fake (unless it is theirs, then the other fake).
  const mal = s.r.valg[merged].av.includes(v2) ? k3 : merged;
  await stem(mal, v2);
  await t.klikk('[data-h="stem"]', 300);

  // ---------- The reveal ----------
  await t.vent(`document.querySelector('[data-h="vis-neste"]')`);
  await enH1("avsløring");
  s = await sp();
  t.sjekk(s.fase === "avslor", "Siste stemme ga ikke avsløringen");
  const forventet = Array(3).fill(0);
  forventet[v1] += 2;
  s.r.valg[mal].av.forEach((a) => (forventet[a] += 1));
  forventet[p2] += 3;
  t.sjekk(JSON.stringify(s.poeng) === JSON.stringify(forventet), `Poengene er feil: ${JSON.stringify(s.poeng)}, ventet ${JSON.stringify(forventet)}`);
  await t.bilde("avslor-start");
  await pause();
  await t.klikk('[data-h="vis-neste"]');
  await t.vent("document.querySelector('.skrone-avslort')");
  await t.sov(1300);
  t.sjekk(
    (await har(".skrone-avslort .skrone-stempel", "SKRØNE")) &&
      (await t.tekst(".skrone-avslort")).toLocaleLowerCase().includes((await tr("Skrøne av {navn}")).split("{navn}")[0].trim().toLocaleLowerCase()),
    "Skrønen avsløres ikke med forfatter",
  );
  await ingenMarkup("avslor");
  await t.bilde("avslor-skrone");
  // Reload in the middle of the reveal: the same step, the points not given twice.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  if (await t.finnes('[data-h="fortsett"]')) {
    await t.klikk('[data-h="fortsett"]');
  }
  await t.vent("document.querySelector('.skrone-avslort')");
  s = await sp();
  t.sjekk(s.r.vist === 1 && JSON.stringify(s.poeng) === JSON.stringify(forventet), "Omlasting midt i avsløringen endret steget eller poengene");
  await pause();
  await t.klikk('[data-h="vis-neste"]');
  await t.sov(1300);
  t.sjekk(await har(".skrone-avslort.ny .skrone-stempel", "SANT!"), "Det ekte svaret får ikke stempelet SANT");
  t.sjekk((await t.tekst(".skrone-avslort.ny")).includes(sannhet), "Det ekte svaret vises ikke");
  t.sjekk(await t.friForDokk(".skrone-avslort.ny"), "Det ekte svaret havner bak knappen");
  await t.bilde("avslor-sann");
  await pause();
  await t.klikk('[data-h="vis-neste"]');
  await t.vent(`document.querySelector('[data-h="videre"]')`);
  await enH1("resultat");
  t.sjekk(await har("#skjerm h1", "Runde {n} er ferdig", { n: 1 }), "Resultatet sier ikke «Runde 1 er ferdig»");
  t.sjekk((await t.tekst(".skrone-fasit")).includes(sannhet), "Fasiten mangler på resultatet");
  await ingenMarkup("resultat");
  await t.bilde("resultat", true);

  // Back to home + «Fortsett»
  await t.klikk("#tilbake");
  await t.vent(`document.querySelector('[data-h="fortsett"]')`);
  t.sjekk(await har('[data-h="fortsett"]', "Runde {n} av {av}", { n: 1, av: 3 }), "«Fortsett» sier ikke hvilken runde");
  await pause();
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`document.querySelector('[data-h="videre"]')`);

  // ---------- Two quick rounds: everyone writes, everyone finds the truth ----------
  for (let runde = 2; runde <= 3; runde++) {
    await pause();
    await t.klikk('[data-h="videre"]');
    await t.vent(`document.querySelector('[data-h="begynn"]')`);
    s = await sp();
    t.sjekk(s.rn === runde - 1 && s.r === null, `Runde ${runde} startet ikke rent (gamle skrøner ligger igjen)`);
    await pause();
    await t.klikk('[data-h="begynn"]');
    for (let n = 0; n < 3; n++) {
      await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
      await pause();
      await t.klikk('[data-h="jeg-er"]');
      await t.vent("document.querySelector('#skrone-felt')");
      await skriv(RUNDEFAKE(n + 1, runde));
    }
    await t.vent(`document.querySelector('[data-h="stem-start"]')`);
    await pause();
    await t.klikk('[data-h="stem-start"]');
    s = await sp();
    const sk = s.r.valg.findIndex((v) => v.sann);
    for (let n = 0; n < s.r.srekke.length; n++) {
      await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
      await pause();
      await t.klikk('[data-h="jeg-er"]');
      await t.vent(`document.querySelector('[data-h="velg"]')`);
      await t.klikk(`[data-h="velg"][data-v="${sk}"]`);
      await t.klikk('[data-h="stem"]', 300);
    }
    await t.vent(`document.querySelector('[data-h="vis-neste"]')`);
    // Nobody fell for a fake: straight to the truth.
    t.sjekk(await har('[data-h="vis-neste"]', "Vis det ekte svaret"), "Uten stemmer på skrøner skal knappen vise det ekte svaret");
    await pause();
    await t.klikk('[data-h="vis-neste"]');
    await pause();
    await t.klikk('[data-h="vis-neste"]');
    await t.vent(`document.querySelector('[data-h="videre"]')`);
  }
  t.sjekk(await har('[data-h="videre"]', "Til kåringen"), "Siste runde skal gi «Til kåringen»");
  await pause();
  await t.klikk('[data-h="videre"]');

  // ---------- Kåringen ----------
  await t.vent("document.querySelector('.skrone-priser')");
  await enH1("kåringen");
  t.sjekk((t.norsk ? /vinner!/ : /Testspiller [ABC]/).test(await t.tekst("#skjerm h1")), "Kåringen mangler vinnerlinja");
  t.sjekk(await t.finnes(".pall"), "Pallen mangler");
  const priser = await t.tekst(".skrone-priser");
  const lav = priser.toLocaleLowerCase();
  t.sjekk(lav.includes((await tr("Beste skrønemaker")).toLocaleLowerCase()) && lav.includes((await tr("Sannhetsjeger")).toLocaleLowerCase()), `Prisene mangler: ${priser}`);
  t.sjekk(await har("#topp-tittel", "Kåringen"), "Topplinja sier ikke «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.r === null, "Skrevne skrøner ligger igjen etter spillet");
  t.sjekk(!JSON.stringify(s).includes("zqx") && !JSON.stringify(s).includes(TAK), "Skrevet tekst er lagret etter spillet");
  t.sjekk((await kveld()).length === 1, "Kveldens gjeng fikk ikke spillet nøyaktig én gang");
  t.sjekk((await t.js(`Rusj._statKo.filter((x) => x.h === "ferdig").length`)) === 1, "Statistikken fikk ikke «ferdig» én gang");
  await ingenMarkup("kåringen");
  await t.bilde("karingen", true);
  // Reload on Kåringen: home, not «Fortsett»
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Et ferdig spill tilbys som «Fortsett»");
  t.sjekk((await kveld()).length === 1, "Kveldens gjeng fikk spillet to ganger");

  // ---------- A new game ended early ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent(`document.querySelector('[data-h="start"]')`);
  await t.klikk('[data-h="pakke"][data-v="barn"]');
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="begynn"]')`);
  await pause();
  await t.klikk('[data-h="avslutt"]');
  await t.vent(`document.querySelector('#ark [data-h]')`);
  t.sjekk(await har("#ark", "Spill videre"), "Avslutt-arket mangler «Spill videre»");
  const AVSLUTT = await tr("Avslutt");
  await t.js(`Array.from(document.querySelectorAll("#ark button")).find((b) => b.textContent.trim() === ${JSON.stringify(AVSLUTT)}).click()`);
  await t.vent("document.querySelector('.banner')");
  t.sjekk(await har("#skjerm h1", "Ingen poeng denne gangen"), "Avsluttet uten poeng skal si «Ingen poeng denne gangen»");
  t.sjekk(!(await t.finnes(".pall")), "Pall uten poeng");
  await t.bilde("avsluttet");
}
