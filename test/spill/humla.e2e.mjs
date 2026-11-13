// Humla: a flower from another day is dropped for today's; the board shows seven letter buttons
// (the centre one marked), the rank and the found words, and stays clear of the dock; a short
// word, a word without the centre letter and an unknown word are refused with a message; a word
// typed with the flower and one typed on a real keyboard are found (points, «Det ordet har du
// alt»); «Stokk» moves the petals; a reload keeps the words; back + «Fortsett … · 2 ord»; words
// until honey: the daily is reported (rank as result), the result shows the words and the numbers
// and shares the rank and points through R.del (never a word); «Finn flere ord» goes back; «Vis
// svarene» closes the day and lists every answer; #dagens opens the result; then practice with an
// older flower and the rules' ranks. Language-neutral (rusj/SPRAK.md).
export default async function (t) {
  const LAGER = t.nokkel("humla.v1");
  const DAGLIG = t.nokkel("daglig");
  const pause = () => t.sov(420);
  const tilstand = () => t.tilstand();
  const hjelp = () => t.tekst(".hu-hjelp");
  const daglig = () => t.js(`JSON.parse(localStorage.getItem("${DAGLIG}") || "{}").humla || null`);
  const sp = async () => {
    const s = await tilstand();
    return s[s.modus];
  };
  // Type with the flower's buttons, then «Send».
  const trykkOrd = async (ord) => {
    for (const b of Array.from(ord)) await t.klikk(`.hu-blomst [data-v="${b}"]`, 30);
    await t.klikk('.hu-knapper [data-v="send"]', 120);
  };
  // Type on a real keyboard (key events on the page), then Enter.
  const tastOrd = async (ord) => {
    for (const b of Array.from(ord)) {
      await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: b, text: b });
      await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: b });
    }
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await t.sov(150);
  };
  const dele = async () => {
    await t.js(`(() => {
      window.__delt = null;
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
    })()`);
    await t.klikk('[data-h="del"]', 400);
    return t.js("window.__delt");
  };

  await t.start();
  const iDag = await t.js("Rusj.dag().nr");
  t.sjekk((await t.js("Rusj.app._motor.FORSTE")) === (await t.js("Rusj.dag(new Date(Date.UTC(2026, 10, 13, 12))).nr")), "Humla nr. 1 skal være 13. november 2026");
  // Yesterday reached honey (streak 2), and a flower from the day before that must not come back.
  await t.js(`(() => {
    const S = Rusj.S;
    S.stat = { spilt: 2, maal: 2, rekke: 2, best: 2, sistMaal: ${iDag - 1}, sistSpilt: ${iDag - 1} };
    S.dag = { nr: ${iDag - 2}, funnet: [], rekkefolge: [1, 2, 3, 4, 5, 6], maal: false, lukket: false };
    Rusj.lagre();
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('.hjem-knapper .knapp.stor[data-h="dag"]'), "En blomst fra en annen dag skal ikke gi «Fortsett» i dag");
  t.sjekk(/2/.test(await t.tekst(".merker")), "Rekka (2 dager på rad) vises ikke på hjem-skjermen");
  await t.bilde("hjem");

  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelectorAll('.hu-blomst button').length === 7");
  let s = await tilstand();
  t.sjekk(s.dag.nr === iDag && s.dag.funnet.length === 0, "Dagens blomst startet ikke på nytt");
  const dag = await t.js(`window.RUSJ_DATA.blomster.dagens[Rusj.app._motor.indeksFor(${iDag}, window.RUSJ_DATA.blomster.dagens.length)]`);
  const svar = await t.js(`Rusj.app._svar(${iDag})`);
  const midt = Array.from(dag)[0];
  t.sjekk((await t.js(`document.querySelector(".hu-midt").dataset.v`)) === midt, "Midtbokstaven står ikke i midten");
  t.sjekk(svar.length >= 20 && svar.length <= 60, `Dagens blomst har ${svar.length} svar`);
  t.sjekk(await t.friForDokk(".hu-blomst"), "Blomsten ligger bak dokka");
  t.sjekk((await t.js(`(() => { const r = document.querySelector(".hu-blomst").getBoundingClientRect(); return r.width >= 180 && r.left >= 0 && r.right <= innerWidth; })()`)), "Blomsten er for liten eller går utenfor skjermen");
  await t.bilde("brett");

  // Refused: too short, without the centre letter, not in the list
  const andre = Array.from(dag).slice(1);
  await trykkOrd(midt + andre[0] + andre[1]);
  t.sjekk((await sp()).funnet.length === 0 && (!t.norsk || /For kort/.test(await hjelp())) && (await t.finnes(".hu-varsel.feil")), `Et ord på tre bokstaver ble ikke avvist (${await hjelp()})`);
  await t.sov(700);
  await trykkOrd(andre.slice(0, 4).join(""));
  t.sjekk((await sp()).funnet.length === 0 && (!t.norsk || /midtbokstaven/.test(await hjelp())), `Et ord uten midtbokstaven ble ikke avvist (${await hjelp()})`);
  await t.sov(700);
  const tull = midt.repeat(5);
  if (!svar.includes(tull)) {
    await trykkOrd(tull);
    t.sjekk((await sp()).funnet.length === 0 && (!t.norsk || /ordlista/.test(await hjelp())), `Et ukjent ord ble ikke avvist (${await hjelp()})`);
    await t.sov(700);
  }
  await t.bilde("avvist");

  // Two answers: one with the flower, one on the keyboard
  const sortert = svar.slice().sort((a, b) => a.length - b.length);
  const forste = sortert[0];
  await trykkOrd(forste);
  s = await tilstand();
  t.sjekk(s.dag.funnet.length === 1 && s.dag.funnet[0] === forste, `Ordet «${forste}» ble ikke funnet: ${JSON.stringify(s.dag)}`);
  t.sjekk(await t.finnes(".hu-varsel.ok, .hu-varsel.blomst"), "Mangler ros for et riktig ord");
  t.sjekk(JSON.stringify((await daglig()) && (await daglig()).pagar) === JSON.stringify({ nr: iDag, tekst: t.norsk ? "1 ord" : (await t.js(`Rusj.t("{n} ord", { n: 1 })`)) }), `R.dagligIGang ble ikke kalt: ${JSON.stringify(await daglig())}`);
  const andreOrd = sortert[1];
  await t.js("document.activeElement && document.activeElement.blur()");
  await tastOrd(andreOrd);
  t.sjekk((await sp()).funnet.includes(andreOrd), `Ordet «${andreOrd}» fra tastaturet ble ikke funnet`);
  await t.sov(300);
  await tastOrd(forste);
  t.sjekk((await sp()).funnet.length === 2 && (!t.norsk || /har du alt/.test(await hjelp())), "Samme ord to ganger skal avvises");
  t.sjekk((await t.tekst(".hu-funnet")).includes(forste.toLocaleUpperCase(await t.js("Rusj.lokale"))), "Funne ord vises ikke");
  await t.bilde("to-ord");

  // «Stokk» moves the petals
  const for_ = (await sp()).rekkefolge.join();
  await t.klikk('.hu-knapper [data-v="stokk"]', 200);
  t.sjekk((await sp()).rekkefolge.join() !== for_ && (await t.antall(".hu-blad")) === 6, "«Stokk» flyttet ikke bokstavene");

  // The found words sheet and the ranks sheet
  await t.klikk(".hu-funnet", 300);
  t.sjekk((await t.antall("#ark .hu-ordliste li")) === 2, "Arket med ordene dine viser ikke to ord");
  await t.klikk('#ark [data-h="lukk-ark"]', 300);
  await t.klikk(".hu-rang", 300);
  t.sjekk((await t.antall("#ark .hu-rangliste li")) === 9, "Arket med rangene har ikke ni rang");
  await t.bilde("rangene");
  await t.klikk('#ark [data-h="lukk-ark"]', 300);

  // Reload mid-game: the words stay
  await t.lastSide(t.side, "document.querySelector('.hu-blomst')");
  t.sjekk((await sp()).funnet.length === 2 && (await tilstand()).skjerm === "brett", "Ordene forsvant etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk((await t.tekst('.hjem-knapper [data-h="dag"]')).includes(t.norsk ? "Fortsett dagens blomst · 2 ord" : "2"), "Hjem viser ikke «Fortsett dagens blomst · 2 ord»");
  t.sjekk((await tilstand())._aktiv === true, "En påbegynt blomst er ikke merket som pågående");
  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.hu-blomst')");
  await pause();

  // Words until honey (the longest first, typed on the keyboard)
  const maal = await t.js(`(() => { const M = Rusj.app._motor; const d = "${dag}"; const s = Rusj.app._svar(${iDag}); return M.grenseFor(M.MAAL, M.sumPoeng(s, d)); })()`);
  const resten = svar.filter((o) => o !== forste && o !== andreOrd).sort((a, b) => b.length - a.length);
  for (const o of resten) {
    const p = await t.js(`(() => { const M = Rusj.app._motor; const S = Rusj.S; return M.sumPoeng(S.dag.funnet, "${dag}"); })()`);
    if (p >= maal) break;
    await tastOrd(o);
    await t.sov(80);
  }
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(700);
  s = await tilstand();
  t.sjekk(s.dag.maal === true && !s.dag.lukket, "Honning ble ikke nådd");
  t.sjekk(s.stat.spilt === 3 && s.stat.maal === 3 && s.stat.rekke === 3 && s.stat.best === 3, `Statistikken er feil: ${JSON.stringify(s.stat)}`);
  const d = await daglig();
  const rangNavn = await t.js(`(() => { const M = Rusj.app._motor; const S = Rusj.S; const s = Rusj.app._svar(${iDag}); return M.rang(M.sumPoeng(S.dag.funnet, "${dag}"), M.sumPoeng(s, "${dag}")); })()`);
  t.sjekk(d && d.nr === iDag && d.vunnet === true && d.rekke === 3 && !d.pagar && typeof d.res === "string" && d.res.length <= 14, `R.dagligFerdig ble ikke kalt riktig: ${JSON.stringify(d)}`);
  if (t.norsk) t.sjekk(d.res === ["Frø", "Spire", "Knopp", "Blomst", "Bukett", "Eng", "Honning", "Mesterhumle", "Hele blomsten"][rangNavn], `Resultatet skal være rangen: ${d.res}`);
  t.sjekk(s._aktiv === false, "En blomst med honning skal ikke være merket som pågående");
  if (t.norsk) t.sjekk(/honning/.test(await t.tekst("#skjerm h1")), `Feil overskrift: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".hu-ordene .hu-ordliste li")) === s.dag.funnet.length, "Ordene dine vises ikke på resultatet");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".skjerm-resultat .hu-nedtelling b")), "Nedtellingen mangler på resultatet");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på resultatet");
  await t.bilde("resultat", true);

  // Share: rank and numbers, never a word
  const delt = await dele();
  const navn = await t.js("window.RUSJ_SPILL.navn");
  const adresse = "https://rusj.no" + (await t.js("location.pathname")) + "#utfordring";
  t.sjekk(delt && delt.startsWith(navn + " ") && delt.endsWith("\n\n" + adresse) && delt.includes("🍯"), `Delingsteksten er feil: ${delt}`);
  if (t.norsk) t.sjekk(/^Humla nr\. \d+ · \S+/.test(delt) && /🔥 3 på rad/.test(delt), `Delingsteksten er feil: ${delt}`);
  const lav = (delt || "").toLowerCase();
  t.sjekk(delt && !svar.some((o) => new RegExp(`(^|[^\\p{L}])${o}([^\\p{L}]|$)`, "u").test(lav)), "Delingsteksten røper et ord");

  // «Finn flere ord» goes back to the board; «Vis svarene» closes the day
  await t.klikk('.lenkerad [data-h="fortsett"]');
  await t.vent("document.querySelector('.hu-blomst')");
  t.sjekk((await tilstand()).skjerm === "brett", "«Finn flere ord» gikk ikke tilbake til blomsten");
  await t.bilde("etter-honning");
  await pause();
  await t.klikk('.lenkerad [data-h="vis-svar"]', 300);
  t.sjekk(await t.finnes("#ark"), "«Vis svarene» spør ikke først");
  await t.bilde("vis-svar-spor");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 300);
  await t.vent("document.querySelector('.skjerm-resultat')", 4000);
  await t.sov(400);
  s = await tilstand();
  t.sjekk(s.dag.lukket === true && (await t.antall(".hu-ordene .hu-ordliste li")) === svar.length, `Alle svarene vises ikke etter «Vis svarene» (${await t.antall(".hu-ordene .hu-ordliste li")} av ${svar.length})`);
  t.sjekk((await t.antall(".hu-ordene .hu-ordliste li.glemt")) === svar.length - s.dag.funnet.length, "De glemte ordene er ikke merket");
  t.sjekk((await daglig()).vunnet === true && s.stat.spilt === 3, "Å vise svarene etter honning skal ikke telle dagen på nytt");
  await t.bilde("alle-svar", true);

  // Home: the result and the countdown; #dagens opens the result
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="se-resultat"]'), "Hjem viser ikke «Se dagens resultat»");
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-resultat')");
  t.sjekk(await t.finnes(".skjerm-resultat"), "#dagens åpner ikke dagens resultat");

  // Practice: older flowers, newest first; one word, then the answers
  await t.klikk('.lenkerad [data-h="arkiv"]');
  await t.vent("document.querySelector('.hu-arkiv')");
  const antall = iDag - (await t.js("Rusj.app._motor.FORSTE"));
  if (antall > 0) {
    t.sjekk((await t.antall(".hu-arkivrad")) === Math.min(antall, 760), "Arkivet har feil antall blomster");
    await t.bilde("arkiv");
    await t.klikk(".hu-arkivrad");
    await t.vent("document.querySelector('.hu-blomst')");
    s = await tilstand();
    t.sjekk(s.modus === "ov" && s.ov.nr === iDag - 1, "Øvingen startet ikke med gårsdagens blomst");
    const ovSvar = await t.js(`Rusj.app._svar(${iDag - 1})`);
    await pause();
    await trykkOrd(ovSvar[0]);
    t.sjekk((await sp()).funnet.length === 1 && (await tilstand()).stat.spilt === 3, "Øving skal lagres for seg");
    await t.bilde("ov-brett");
  } else {
    t.sjekk((await t.antall(".hu-arkivrad")) === 0, "Arkivet skal være tomt på dag 1");
  }

  // The rules: the ranks
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark .hu-rangliste li")) === 9, "Reglene viser ikke rangene");
  await t.klikk('#ark [data-h="lukk-ark"]');
}
