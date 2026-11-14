// Sjongløren: home has the two modes as the two buttons; «På tid»: six letter balls, the clock at
// 2:00, the progress per length, all clear of the dock; a word made by tapping the balls and one typed
// on a keyboard are found, a short word and a repeat are refused; «Stokk» throws the letters up in a
// new order; the helord gives its bonus; a reload keeps the round; the time runs out → the round's
// summary with every word → round 2; the last round → the result with the record, the sticker for all
// five helord and sharing without words; home shows the record line. «Uten klokke»: no clock,
// «Neste runde» asks first when the helord is missing; «Avslutt» mid-game gives the result without a
// record. Language-neutral (rusj/SPRAK.md).
export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const runde = async () => {
    const s = await sp();
    return s.runder[s.nr];
  };
  const svar = (sett) => t.js(`Rusj.app._svar(${JSON.stringify(sett)})`);
  const brikker = (ord, sett) => t.js(`Rusj.app._motor.brikkerFor(${JSON.stringify(ord)}, ${JSON.stringify(sett)})`);
  const trykkOrd = async (ord, sett) => {
    for (const i of await brikker(ord, sett)) await t.klikk(`.sj-ball[data-v="${i}"]`, 40);
    await t.klikk('.sj-knapper [data-h="send"]', 150);
  };
  const tast = async (ord) => {
    for (const b of Array.from(ord)) {
      await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: b, text: b });
      await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: b });
    }
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await t.sov(200);
  };
  const dele = async () => {
    await t.js(`(() => {
      window.__delt = null;
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
    })()`);
    await t.klikk('[data-h="del"]', 500);
    return t.js("window.__delt");
  };

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(await t.finnes('.hjem-knapper .knapp.stor[data-h="ny"][data-v="tid"]') && (await t.finnes('.hjem-knapper [data-h="ny"][data-v="rolig"]')), "Hjem har ikke de to modusene som knapper");
  await t.bilde("hjem");

  // ---------- Against the clock ----------
  await t.klikk('[data-h="ny"][data-v="tid"]', 400);
  await t.vent("document.querySelectorAll('.sj-ball').length === 6");
  let r = await runde();
  t.sjekk((await sp()).modus === "tid" && Array.from(r.sett).length === 6 && r.igjen > 110000, "Runde 1 har ikke seks bokstaver og to minutter");
  t.sjekk(!t.norsk || /^[12]:\d\d$/.test(await t.tekst(".sj-klokke b")), "Klokka viser ikke to minutter");
  t.sjekk((await t.antall(".sj-lengder li")) >= 2 && (await t.finnes(".sj-lengder li.hel")), "Raden med lengder mangler, eller mangler helordet");
  t.sjekk(await t.friForDokk(".sj-baller"), "Bokstavene ligger bak handlingsfeltet");
  const vist = await t.js(`Array.from(document.querySelectorAll('.sj-ball')).map((b) => b.getAttribute('aria-label')).join('').toLowerCase()`);
  t.sjekk(vist !== r.sett, "Bokstavene står i samme rekkefølge som helordet");
  await t.bilde("brett");
  const alle = await svar(r.sett);
  const korte = alle.filter((o) => Array.from(o).length <= 4);
  await trykkOrd(korte[0], r.sett);
  r = await runde();
  t.sjekk(r.funnet.includes(korte[0]), `«${korte[0]}» ble ikke funnet med ballene`);
  await trykkOrd(korte[0], r.sett);
  t.sjekk(!t.norsk || /har du alt/.test(await t.tekst(".sj-hjelp")), "Et ord to ganger sier ikke «Det ordet har du alt»");
  const to = (await brikker(korte[0], r.sett)).slice(0, 2);
  for (const i of to) await t.klikk(`.sj-ball[data-v="${i}"]`, 40);
  t.sjekk((await t.antall(".sj-ball.tatt")) === 2, "Valgte baller vises ikke som tatt");
  await t.bilde("velger");
  await t.klikk('.sj-knapper [data-h="send"]', 150);
  t.sjekk(!t.norsk || /For kort/.test(await t.tekst(".sj-hjelp")), "To bokstaver sier ikke «For kort»");
  await tast(korte[1]);
  t.sjekk((await runde()).funnet.includes(korte[1]), `«${korte[1]}» ble ikke funnet med tastaturet`);
  // Stokk.
  const for_ = (await runde()).rekkefolge.join();
  await t.klikk('.sj-knapper [data-h="stokk"]', 300);
  t.sjekk((await runde()).rekkefolge.join() !== for_, "«Stokk» endret ikke rekkefølgen");
  // The helord.
  await trykkOrd(r.sett, r.sett);
  r = await runde();
  t.sjekk(r.funnet.includes(r.sett), "Helordet ble ikke funnet");
  t.sjekk(await t.finnes(".sj-lengder li.hel.ferdig"), "Stjernen for helordet er ikke fylt");
  await t.bilde("helord");
  // Reload.
  await t.lastSide(t.side, "document.querySelector('.sj-baller')");
  t.sjekk((await runde()).funnet.length === 3, "Ordene forsvant ved omlasting");
  // The time runs out.
  await t.js(`(() => { const s = Rusj.S.spill; s.runder[s.nr].igjen = 700; })()`);
  await t.vent("document.querySelector('.skjerm-runde')", 6000);
  await t.sov(300);
  t.sjekk((await t.antall(".sj-ordliste li")) === alle.length && (await t.antall(".sj-ordliste li.glemt")) === alle.length - 3, "Rundeoppsummeringen viser ikke alle ordene");
  await t.bilde("runde-ferdig", true);
  await t.klikk('.dokk [data-h="videre"]', 400);
  await t.vent("document.querySelector('.sj-baller')");
  t.sjekk((await sp()).nr === 1 && (await t.antall(".sj-ball")) === 6, "Runde 2 har ikke seks bokstaver");
  // On to the last round: rounds 1–4 done with their helord (put into the state).
  await t.js(`(() => { const s = Rusj.S.spill; s.runder.forEach((x, k) => { if (k < 4) { x.funnet = [x.sett]; x.ferdig = true; } }); s.nr = 4; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelectorAll('.sj-ball').length === 7");
  r = await runde();
  await trykkOrd(r.sett, r.sett);
  await t.js(`(() => { const s = Rusj.S.spill; s.runder[s.nr].igjen = 600; })()`);
  await t.vent("document.querySelector('.skjerm-runde')", 6000);
  t.sjekk(await t.finnes('.dokk [data-h="resultat"]'), "Siste runde går ikke til resultatet");
  await t.klikk('.dokk [data-h="resultat"]', 500);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  const s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.rekord.tid.spilt === 1 && s.rekord.tid.best > 50 && s.rekord.tid.sist === s.rekord.tid.best, `Rekorden ble ikke lagret: ${JSON.stringify(s.rekord.tid)}`);
  t.sjekk((await t.antall(".sj-runder li.hel")) === 5, "Resultatet viser ikke fem helord");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(merker["sjongloren-helord"], "Klistremerket for alle fem helord ble ikke gitt");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Resultatet mangler «Alle spill»");
  await t.bilde("resultat", true);
  const delt = await dele();
  const settene = s.spill.runder.map((x) => x.sett);
  t.sjekk(delt && /\d/.test(delt) && !settene.some((o) => delt.toLowerCase().includes(o)), `Delingen røper ord eller mangler poeng: ${delt}`);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake", 300);
  t.sjekk(await t.finnes(".sj-rekorder li"), "Hjem viser ikke rekorden");
  await t.bilde("hjem-rekord");

  // ---------- No clock ----------
  await t.klikk('[data-h="ny"][data-v="rolig"]', 400);
  await t.vent("document.querySelector('.sj-baller')");
  t.sjekk((await sp()).modus === "rolig" && !(await t.finnes(".sj-klokke i")), "Uten klokke viser en klokke");
  await t.bilde("rolig");
  await t.klikk('.dokk [data-h="neste"]', 300);
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Neste runde» uten helordet spør ikke først");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]', 300);
  t.sjekk(await t.finnes(".sj-baller") && !(await runde()).ferdig, "«Spill videre» avsluttet runden");
  await t.klikk('.dokk [data-h="neste"]', 300);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 400);
  await t.vent("document.querySelector('.skjerm-runde')");
  t.sjekk(!t.norsk || /Helordet var/.test(await t.tekst("#skjerm h1")), "Oppsummeringen sier ikke hva helordet var");
  await t.klikk('.dokk [data-h="videre"]', 400);
  await t.vent("document.querySelector('.sj-baller')");
  await t.klikk('.dokk [data-h="avslutt"]', 300);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 400);
  await t.vent("document.querySelector('.skjerm-slutt')");
  const s2 = await t.tilstand();
  t.sjekk(s2.rekord.rolig.spilt === 0 && (await t.antall(".sj-runder li")) === 5, "Et avbrutt spill ble telt i rekorden");
  await t.bilde("avbrutt");
}
