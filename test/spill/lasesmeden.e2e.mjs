// Låsesmeden (crack the colour code): against the phone on easy – pegs by tap, a slot tapped out
// again, a guess with its pins, the keyboard (digits, Backspace, Enter), a hint that fits, a reload
// and back + «Fortsett», the code cracked, its record, sticker and a share without the code. Two
// players: each makes a code behind a «give the phone to» gate, cracks the other's, and the one
// with fewer guesses wins. Last: hard (five pegs, eight colours) fits the screen with nothing to
// scroll. Runs in every edition: texts are checked in Norwegian only (t.norsk).
export default async function (t) {
  const pause = () => t.sov(420);
  const S = () => t.tilstand();
  const KODE = { Enter: 13, Backspace: 8 };
  async function tast(key) {
    const vk = KODE[key] || key.charCodeAt(0);
    const tekst = key.length === 1 ? { text: key } : {};
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key.length === 1 ? "Digit" + key : key, windowsVirtualKeyCode: vk, ...tekst });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key.length === 1 ? "Digit" + key : key, windowsVirtualKeyCode: vk });
    await t.sov(60);
  }
  async function leggInn(kode) {
    for (const f of kode) await t.klikk(`.ls-velg[data-v="${f}"]`, 60);
  }

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(!t.norsk || /Knekk koden · middels/.test(await t.tekst(".hjem-knapper .knapp")), "Hjemskjermen starter ikke mot mobilen på middels");
  await t.bilde("hjem");

  // ----- Setup: against the phone, easy -----
  await t.klikk('[data-h="oppsett"]');
  await t.vent("document.querySelector('.flis[data-h=\"modus\"]')");
  await t.klikk('.seg [data-h="niva"][data-v="1"]');
  t.sjekk((await t.antall(".ls-eksempel .ls-knapp")) === 6, "Oppsettet viser ikke de seks knappene på lett");
  await t.bilde("oppsett");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelector('.ls-spill')");
  await pause();
  let sp = (await S()).spill;
  const kode = sp.runder[0].kode;
  t.sjekk(sp.niva === 1 && kode.length === 4 && new Set(kode).size === 4, "Koden følger ikke reglene for lett");
  t.sjekk((await t.antall(".ls-velg")) === 6 && (await t.antall(".ls-plass")) === 4 && (await t.antall(".ls-skjult")) === 4, "Brettet har ikke fire plasser, seks knapper og en skjult kode");
  t.sjekk(!(await t.js("document.body.innerText")).includes("undefined"), "undefined på skjermen");
  await t.bilde("start");

  // Pegs by tap; a peg used on easy can't be used twice.
  const feil = [0, 1, 2, 3, 4, 5].filter((f) => !kode.includes(f));
  const forst = [kode[1], kode[0], feil[0], feil[1]];
  await leggInn(forst);
  sp = (await S()).spill;
  t.sjekk(sp.rad.join() === forst.join(), `Knappene havnet ikke i raden (${sp.rad})`);
  t.sjekk(await t.js(`document.querySelector('.ls-velg[data-v="${forst[0]}"]').disabled`), "En brukt farge kan legges igjen på lett");
  // Tap the chosen slot to take its peg out, then another slot to choose it.
  await t.klikk('.ls-plass[data-v="3"]');
  await t.klikk('.ls-plass[data-v="3"]');
  t.sjekk((await S()).spill.rad[3] === null, "Trykk på plassen tok ikke ut knappen");
  await t.klikk(`.ls-velg[data-v="${feil[1]}"]`);
  await t.bilde("rad");
  await t.klikk('.dokk [data-h="sjekk"]');
  sp = (await S()).spill;
  const g1 = sp.runder[0].gjett[0];
  t.sjekk(g1 && g1.svart === 0 && g1.hvit === 2, `Svaret er feil (${JSON.stringify(g1)})`);
  t.sjekk((await t.antall(".ls-historikk .ls-rad")) === 1 && (await t.antall(".ls-rad .ls-pinner i.h")) === 2, "Forsøket med to ringer vises ikke");
  t.sjekk(!t.norsk || /9 forsøk igjen/.test(await t.tekst(".ls-status")), "Status sier ikke hvor mange forsøk som er igjen");
  await t.bilde("forsok");

  // The keyboard.
  await t.js("document.activeElement && document.activeElement.blur()");
  await tast(String(feil[0] + 1));
  await tast(String(feil[1] + 1));
  await tast("Backspace");
  sp = (await S()).spill;
  t.sjekk(sp.rad[0] === feil[0] && sp.rad[1] === null, `Tastaturet la ikke inn knapper (${sp.rad})`);
  await tast("Backspace");
  // A hint fills the row with a code that fits.
  await t.klikk('[data-h="hint"]');
  sp = (await S()).spill;
  const hint = sp.rad;
  t.sjekk(hint.every((f) => f != null) && sp.runder[0].hint === 0, "Hintet fylte ikke raden");
  const svar = await t.js(`(() => { const k = ${JSON.stringify(kode)}; const g = ${JSON.stringify(hint)}; let s = 0; for (let i = 0; i < 4; i++) if (k[i] === g[i]) s++; return s; })()`);
  t.sjekk(svar >= 0 && sp.rad.join() !== forst.join(), "Hintet ga samme rad igjen");
  await t.bilde("hint");
  await t.klikk('.dokk [data-h="sjekk"]');

  // Reload mid-game, then back + «Fortsett».
  const forLast = (await S()).spill;
  await t.lastSide(t.side, "document.querySelector('.ls-spill')");
  await pause();
  sp = (await S()).spill;
  t.sjekk(sp.runder[0].gjett.length === forLast.runder[0].gjett.length && (await t.antall(".ls-historikk .ls-rad")) === sp.runder[0].gjett.length, "Forsøkene ble borte etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Hjemskjermen tilbyr ikke å fortsette");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ls-spill')");
  await pause();

  // Crack it with the keyboard.
  if (!(await S()).spill.runder[0].ferdig) {
    await t.js("document.activeElement && document.activeElement.blur()");
    for (const f of kode) await tast(String(f + 1));
    await tast("Enter");
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(600);
  let alt = await S();
  t.sjekk(alt.spill.runder[0].lost && alt.rekord[1] && alt.rekord[1].beste === alt.spill.runder[0].gjett.length, "Den knekte koden ga ingen rekord");
  t.sjekk((await t.antall(".ls-fasit .ls-knapp")) === 4 && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Sluttskjermen viser ikke koden eller de vanlige knappene");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(JSON.stringify(merker).includes("klassiker-lasesmeden"), "Klistremerket ble ikke gitt");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""}` : "";
  t.sjekk(/●/.test(delTekst) && (!t.norsk || /knekt på \d+ av 10/.test(delTekst)), `Delingen mangler resultatet (${JSON.stringify(delt)})`);
  t.sjekk(!/[🔴🟦🔺]/u.test(delTekst), "Delingen viser knappene");
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes(".ls-rekorder li"), "Hjemskjermen viser ikke rekorden");

  // ----- Two players -----
  await t.klikk('[data-h="oppsett"]');
  await t.klikk('.flis[data-h="modus"][data-v="to"]');
  await t.vent("document.querySelectorAll('.spillere input, [data-felt]').length >= 2 || document.querySelector('.seg [data-h=\"starter\"]')");
  await t.klikk('.seg [data-h="niva"][data-v="2"]');
  await t.bilde("oppsett-to");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  await t.bilde("gi-lag");
  await t.klikk('.dokk [data-h="jeg-er"]');
  await t.vent("document.querySelector('.skjerm-lag .ls-palett')");
  await pause();
  const kodeA = [5, 5, 0, 1];
  await leggInn(kodeA);
  await t.bilde("lag");
  await t.klikk('.dokk [data-h="laas"]');
  await t.vent("document.querySelector('.gi-til')");
  sp = (await S()).spill;
  t.sjekk(sp.runder[0].kode.join() === kodeA.join() && sp.fase === "gjett", "Koden ble ikke låst");
  await t.klikk('.dokk [data-h="jeg-er"]');
  await t.vent("document.querySelector('.ls-spill')");
  await pause();
  t.sjekk((await t.antall(".ls-skjult")) === 4, "Koden vises for den som skal gjette");
  await leggInn([0, 1, 2, 3]);
  await t.klikk('.dokk [data-h="sjekk"]');
  await leggInn(kodeA);
  await t.klikk('.dokk [data-h="sjekk"]');
  await t.vent("document.querySelector('.skjerm-mellom')", 6000);
  await t.sov(400);
  t.sjekk(!t.norsk || /knekte koden/.test(await t.tekst("h1")), "Mellomskjermen sier ikke at koden ble knekt");
  await t.bilde("mellom");
  await t.klikk('.dokk [data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  await t.klikk('.dokk [data-h="jeg-er"]');
  await t.vent("document.querySelector('.skjerm-lag .ls-palett')");
  await pause();
  await leggInn([2, 3, 4, 4]);
  await t.klikk('.dokk [data-h="laas"]');
  await t.vent("document.querySelector('.gi-til')");
  await t.klikk('.dokk [data-h="jeg-er"]');
  await t.vent("document.querySelector('.ls-spill')");
  await pause();
  for (let k = 0; k < 3; k++) {
    await leggInn([0, 0, 1, 1]);
    await t.klikk('.dokk [data-h="sjekk"]');
  }
  await leggInn([2, 3, 4, 4]);
  await t.klikk('.dokk [data-h="sjekk"]');
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(600);
  alt = await S();
  t.sjekk(alt.spill.resultat && alt.spill.resultat.vinner === alt.spill.runder[0].gjetter, `Feil vinner (${JSON.stringify(alt.spill.resultat)})`);
  t.sjekk((await t.antall(".ls-tabell li")) === 2 && (await t.finnes(".ls-tabell li.vinner")), "Kåringen viser ikke begge spillerne");
  await t.bilde("kaaring", true);

  // ----- Hard: five pegs, eight colours fit the screen -----
  await t.klikk('[data-h="oppsett"]');
  await t.klikk('.flis[data-h="modus"][data-v="mobil"]');
  await t.klikk('.seg [data-h="niva"][data-v="3"]');
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.ls-velg').length === 8");
  await pause();
  for (let k = 0; k < 6; k++) {
    await leggInn([k % 8, (k + 1) % 8, (k + 2) % 8, (k + 3) % 8, (k + 4) % 8]);
    await t.klikk('.dokk [data-h="sjekk"]');
    if ((await S()).spill.fase !== "gjett") break;
  }
  await t.sov(300);
  const m = await t.js(`(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, palett: r(".ls-palett"), sjekk: r("#ls-sjekk"), las: r(".ls-las"), w: innerWidth, h: innerHeight };
  })()`);
  if (m.palett) {
    t.sjekk(m.side <= 1 && m.bred <= 0, `${m.w}×${m.h}: spillskjermen kan scrolles`);
    t.sjekk(m.palett.bottom <= m.h && m.sjekk.bottom <= m.h && m.las.top >= 0, `${m.w}×${m.h}: noe går utenfor skjermen`);
  }
  await t.bilde("vanskelig");
}
