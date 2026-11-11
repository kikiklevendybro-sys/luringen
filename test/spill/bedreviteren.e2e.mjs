// Besserwisseren: a full quiz with three players (reveal, «Hvem hadde rett?», undo, reload mid-game,
// back + continue, «Nytt spill» asks first, standings, podium, answer key), a solo round played to
// the end, a team round with the clock, and small phones (320 × 568) where the question, all four
// answers, the right answer and the fun fact must be visible without scrolling.
export default async function (t) {
  const fase = async () => (await t.tilstand()).spill;
  const visSvaret = async () => {
    await t.klikk('[data-h="vis"]');
    await t.vent("document.querySelector('.bw-valg.riktig')", 5000);
  };
  // Nothing inside the question card may stick out (the page clips sideways overflow, so check the card itself).
  const passerKortet = async (navn) => {
    const ut = await t.js(`(() => { const k = document.querySelector(".bw-kort"); if (!k) return 0; const r = k.getBoundingClientRect(); return Math.max(k.scrollWidth - k.clientWidth, Math.round(r.right - window.innerWidth), ...Array.from(k.querySelectorAll(".bw-kort-topp > *")).map((e) => Math.round(e.getBoundingClientRect().right - r.right + 1))); })()`);
    t.sjekk(ut <= 0, `Spørsmålskortet er ${ut}px for bredt på «${navn}»`);
  };
  // How far (px) an element reaches below the top of the sticky dock (> 0 means hidden behind it).
  // On a phone on its side the dock is a column beside the content: then the bottom of the screen counts.
  const underDokka = (sel) =>
    t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const d = document.querySelector("#skjerm .dokk .knapp"); if (!el || !d) return 999; const a = el.getBoundingClientRect(); const b = d.getBoundingClientRect(); const ved = a.right <= b.left + 1 || a.left >= b.right - 1; return Math.round(a.bottom - (ved ? window.innerHeight : b.top)); })()`);
  const overToppen = (sel) => t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? Math.round(60 - el.getBoundingClientRect().top) : 999; })()`);

  // The runner may use another phone size (--bredde/--hoyde); adapt to it and restore it at the end.
  const [B0, H0] = await t.js("[window.innerWidth, window.innerHeight]");

  // ---------- Setup ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk(await t.finnes('.flis[data-h="modus"][aria-pressed="true"]'), "Spillemåten skal velges med store fliser øverst");
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke tre spillere");
  t.sjekk(!(await t.tilstand()).oppsett.kategorier.includes("barn"), "Barn-kategorien skal ikke være valgt fra start");
  await t.klikk('[data-h="kategori"][data-v="barn"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.includes("barn"), "Barn-kategorien ble ikke valgt");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.length === 0, "«Alle» skal kunne velge bort alle kategorier");
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skal være av uten kategorier");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  await t.klikk('[data-h="kategori"][data-v="barn"]');
  await t.klikk('[data-h="niva"][data-v="blandet"]');
  await t.klikk('[data-h="lengde"][data-v="10"]');

  // ---------- First question ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.bw-kort')");
  await passerKortet("sporsmal");
  await t.bilde("sporsmal");
  let sp = await fase();
  t.sjekk(sp.liste.length === 10, `Runden har ${sp.liste.length} spørsmål, ventet 10`);
  t.sjekk(new Set(sp.liste).size === sp.liste.length, "Samme spørsmål kom to ganger i én runde");
  t.sjekk((await t.antall(".bw-valg")) === 4, "Spørsmålet viser ikke fire svar");
  t.sjekk(!(await t.finnes('[data-h="svar"]')), "Svarene skal ikke være knapper når flere spiller");
  t.sjekk((B0 < 380 ? /^1\/10$/ : /Spørsmål 1 av 10/i).test((await t.tekst("#topp-tittel")).trim()), "Topplinjen viser ikke hvilket spørsmål vi er på");

  await visSvaret();
  await t.bilde("svar");
  t.sjekk((await t.antall(".bw-valg.riktig")) === 1, "Det skal lyse opp nøyaktig ett riktig svar");
  t.sjekk((await t.antall(".bw-valg.dempet")) === 3, "De tre gale svarene skal dempes");
  t.sjekk((await t.tekst(".bw-fakta")).length > 20, "Faktabiten vises ikke");
  t.sjekk((await overToppen(".bw-valg.riktig")) <= 0 && (await underDokka(".bw-fakta")) <= 0, "Riktig svar og faktabiten skal synes uten å scrolle");
  await t.klikk('[data-h="stilling"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .poengliste"), "Stillingen vises ikke");
  await t.bilde("stillingen");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Who had it right: its own step
  await t.klikk('[data-h="hvem"]');
  t.sjekk(await t.finnes(".bw-fasitlinje"), "«Hvem hadde rett?» skal vise riktig svar øverst");
  await t.klikk('[data-h="riktig"][data-v="0"]');
  await t.klikk('[data-h="riktig"][data-v="2"]');
  await t.klikk('[data-h="riktig"][data-v="2"]');
  t.sjekk(JSON.stringify((await fase()).riktige) === "[0]", "Å trykke to ganger skal fjerne valget igjen");
  await t.bilde("hvem-hadde-rett");
  await t.klikk('[data-h="neste"]');
  sp = await fase();
  t.sjekk(sp.nr === 1 && sp.treff[0] === 1 && sp.poeng[0] >= 1 && sp.poeng[1] === 0, "Poenget ble ikke gitt til Testspiller A");

  // Undo the scoring, fix it, go on
  t.sjekk(await t.finnes('[data-h="angre"]'), "Mangler «Angre poengene» etter at poeng er gitt");
  await t.bilde("angre");
  await t.klikk('[data-h="angre"]');
  sp = await fase();
  t.sjekk(sp.nr === 0 && sp.fase === "hvem" && sp.poeng[0] === 0 && sp.logg.length === 0, "«Angre» tok ikke poengene tilbake");
  await t.klikk('[data-h="riktig"][data-v="2"]');
  await t.klikk('[data-h="neste"]');
  sp = await fase();
  t.sjekk(sp.nr === 1 && sp.poeng[0] > 0 && sp.poeng[2] > 0, "Poengene etter angring ble feil");

  // ---------- Reload mid-game, back + continue, «Nytt spill» asks first ----------
  await t.lastSide(t.side, "document.querySelector('.bw-kort')");
  t.sjekk((await fase()).nr === 1, "Spillet husket ikke hvor vi var etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(/spørsmål 2 av 10/.test(await t.tekst('.hjem-knapper .knapp[data-h="fortsett"]')), "«Fortsett» skal være hovedknappen mens et spill pågår");
  await t.bilde("hjem-pagar");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» skal spørre før spillet forsvinner");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await fase()) !== null, "Spillet forsvant selv om vi trykket «Avbryt»");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.bw-kort')");

  // The answer survives a reload too
  await visSvaret();
  await t.lastSide(t.side, "document.querySelector('.bw-kort')");
  t.sjekk(await t.finnes(".bw-valg.riktig"), "Svaret var borte etter omlasting");

  // ---------- Play to the end ----------
  for (let i = 1; i < 10; i++) {
    if (i > 1) await visSvaret();
    await t.klikk('[data-h="hvem"]');
    await t.klikk('[data-h="riktig"][data-v="1"]');
    await t.klikk('[data-h="neste"]', 200);
  }
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  t.sjekk(/Testspiller B.*vinner!/.test(await t.tekst("#skjerm h1")), "Vinnerlinjen «Testspiller B vinner!» vises ikke");
  t.sjekk((await fase()).logg.length === 10, "Loggen har ikke ti spørsmål");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Slutten mangler lenken «Alle spill»");
  await t.klikk('[data-h="fasit"]');
  t.sjekk((await t.antall("#ark .bw-fasit li")) === 10, "Fasiten viser ikke ti spørsmål");
  await t.bilde("fasit");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="resultat"]'), "Hjem-skjermen mangler «Se kåringen» etter en ferdig quiz");

  // ---------- Solo: tap your own answer ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="1"]');
  t.sjekk((await t.antall(".spiller")) === 1, "Klarte ikke å gå ned til én spiller");
  await t.klikk('[data-h="niva"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"svar\"]')");
  await t.bilde("solo-sporsmal");
  await t.klikk('[data-h="svar"][data-v="2"]');
  await t.vent("document.querySelector('.bw-dom')", 5000);
  await t.bilde("solo-svar");
  sp = await fase();
  t.sjekk(sp.fase === "svar" && sp.valgt === 2, "Solo-svaret ble ikke registrert");
  const traff = await t.finnes(".bw-valg.v2.riktig");
  t.sjekk(traff ? sp.riktige[0] === 0 : sp.riktige.length === 0 && (await t.finnes(".bw-valg.v2.feil")), "Solo-svaret ble ikke vurdert riktig");
  t.sjekk(!(await t.finnes('[data-h="hvem"]')), "Solo skal ikke spørre hvem som hadde rett");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('[data-h=\"svar\"]')");
  await t.klikk('[data-h="vis"]');
  await t.vent("document.querySelector('.bw-dom')", 5000);
  t.sjekk((await fase()).riktige.length === 0, "«Jeg vet ikke» skal gi null poeng");
  for (let i = 2; i < 10; i++) {
    await t.klikk('[data-h="neste"]', 200);
    await t.klikk('[data-h="svar"][data-v="0"]');
    await t.vent("document.querySelector('.bw-dom')", 5000);
  }
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner')");
  sp = await fase();
  t.sjekk(new RegExp(`${sp.treff[0]} av 10 riktige`).test(await t.tekst("#skjerm h1")), "Solo-resultatet viser ikke antall riktige");
  t.sjekk(!(await t.finnes(".pall")), "Solo skal ikke vise pall");
  await t.bilde("solo-slutt", true);

  // ---------- Teams with the clock ----------
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  // Longest category name + hardest level + clock: the tightest top row on the card
  await t.klikk('[data-h="kategori"][data-v="*"]');
  if ((await t.tilstand()).oppsett.kategorier.length) await t.klikk('[data-h="kategori"][data-v="*"]');
  await t.klikk('[data-h="kategori"][data-v="kultur"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="lag"][data-v="1"]');
  await t.klikk('[data-h="klokke"]');
  await t.bilde("oppsett-lag", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#bw-klokke')");
  await t.sov(1600);
  const tid = Number(await t.tekst("#bw-klokke .bw-tid"));
  t.sjekk(tid > 0 && tid < 20, `Klokka teller ikke ned (viser ${tid})`);
  await passerKortet("lag-klokke");
  await t.bilde("lag-klokke");
  await visSvaret();
  await t.klikk('[data-h="hvem"]');
  await t.klikk('[data-h="riktig"][data-v="2"]');
  await t.bilde("lag-hvem");
  await t.klikk('[data-h="neste"]');
  sp = await fase();
  t.sjekk(sp.modus === "lag" && sp.deltakere === 3 && sp.poeng[2] > 0, "Lag Blå fikk ikke poeng");

  // ---------- Short screens: 320 × 568 and 375 × 560 ----------
  for (const [b, h] of [[320, 568], [375, 560]]) {
    const navn = `${b}x${h}`;
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    if ((await fase()).fase === "hvem") await t.klikk('[data-h="neste"]');
    await t.vent("document.querySelector('.bw-kort')");
    await t.sov(300);
    if (b < 380) t.sjekk(/^\d+\/10$/.test((await t.tekst("#topp-tittel")).trim()), "Smal skjerm skal ha kort tittel, som «2/10»");
    t.sjekk((await underDokka(".bw-valgliste li:last-child")) <= 0, `${navn}: alle fire svar skal synes over knappen`);
    await passerKortet(`${navn}-sporsmal`);
    if (b <= B0) await t.bilde(`${navn}-sporsmal`);
    await visSvaret();
    await t.sov(500);
    const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Siden er ${bred}px for bred på ${navn}`);
    t.sjekk((await overToppen(".bw-valg.riktig")) <= 0 && (await underDokka(".bw-valg.riktig")) <= 0, `${navn}: riktig svar skal synes etter «Vis svaret»`);
    t.sjekk((await underDokka(".bw-fakta p:last-child")) <= 24, `${navn}: faktabiten skal synes etter «Vis svaret»`);
    if (b <= B0) await t.bilde(`${navn}-svar`);
    await t.klikk('[data-h="hvem"]');
    if (b <= B0) await t.bilde(`${navn}-hvem`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: B0, height: H0, deviceScaleFactor: 2, mobile: true });

  // ---------- Quit mid-game ----------
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await t.tilstand()).spill === null, "Avslutt fjernet ikke spillet");
}
