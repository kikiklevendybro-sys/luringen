// Ordugla: an unfinished word from yesterday is dropped for today's word; invalid guesses (too
// short, not a word, the same word twice) shake and don't count; guesses typed on the screen and on
// a real keyboard; a reload keeps the typed letters; back + «Fortsett»; the right word wins (the
// streak goes on from yesterday), the result screen shows statistics and shares squares without the
// word; home shows the countdown. Then practice: six wrong guesses show the word, «Gi opp» on the
// next one, and the colour-blind palette.
export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const tilstand = () => t.tilstand();
  const skriv = async (ord) => {
    for (const b of ord) await t.klikk(`.ou-tast[data-v="${b}"]`, 25);
  };
  const gjett = async (ord) => {
    const for_ = (await tilstand())[(await tilstand()).modus].gjett.length;
    await skriv(ord);
    await t.klikk('.ou-tast[data-v="gjett"]', 60);
    // Done when the guess is saved and the next row (or the end) is drawn after the flip.
    await t.vent(`(() => { const s = JSON.parse(localStorage.getItem("rusj.ordugla.v1")); const sp = s[s.modus]; return sp.gjett.length === ${for_ + 1}; })()`, 4000);
    await t.vent(`!!document.querySelector('.ou-rad.na[data-rad="${for_ + 1}"]') || !!document.querySelector('.skjerm-resultat') || !document.querySelector('.ou-tastatur')`, 6000);
    await t.sov(120);
  };
  const toast = () => t.js(`document.querySelector("#toast.vis") ? document.querySelector("#toast").textContent : ""`);
  // Words that are allowed but are not the answer.
  const andreOrd = (svar, n) => t.js(`window.RUSJ_DATA.svar.dagens.filter((o) => o !== ${JSON.stringify(svar)} && new Set(o).size === 5).slice(40, 40 + ${n})`);
  const tast = async (key) => {
    const kode = { Enter: 13, Backspace: 8 }[key];
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, ...(kode ? { windowsVirtualKeyCode: kode, code: key } : { text: key }) });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, ...(kode ? { windowsVirtualKeyCode: kode, code: key } : {}) });
    await t.sov(30);
  };

  await t.start();
  const iDag = await t.js("Rusj.dag().nr");
  // Yesterday: a win (streak 3) and an unfinished word that must not come back today.
  await t.js(`(() => {
    const S = Rusj.S;
    S.stat = { spilt: 3, vunnet: 3, rekke: 3, best: 3, fordeling: [0, 0, 1, 1, 1, 0], sistVunnet: ${iDag - 1}, sistSpilt: ${iDag - 1} };
    S.dag = { nr: ${iDag - 2}, ord: "fjell", gjett: ["glede"], rad: "", ferdig: false, vunnet: false };
    Rusj.lagre();
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(/Dagens ord/.test(await t.tekst('.hjem-knapper [data-h="dag"]')) && !/Fortsett/.test(await t.tekst(".hjem-knapper")), "Et uferdig ord fra en annen dag skal ikke gi «Fortsett» i dag");
  t.sjekk(/3/.test(await t.tekst(".merker")), "Rekka (3 dager på rad) vises ikke på hjem-skjermen");
  await t.bilde("hjem-rekke");

  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.ou-tastatur')");
  let s = await tilstand();
  t.sjekk(s.dag.nr === iDag && s.dag.gjett.length === 0, "Dagens ord startet ikke på nytt");
  t.sjekk((await t.antall(".ou-rad")) === 6 && (await t.antall(".ou-rad .ou-rute")) === 30, "Brettet skal ha seks rader med fem ruter");
  const svar = s.dag.ord;
  t.sjekk(svar === (await t.js(`Rusj.app._dagensOrd(${iDag})`)), "Dagens ord kommer ikke fra den faste rekka");
  // Frozen daily order: these must never change (data/svar.json «dagens» is append-only).
  const forste = await t.js("Rusj.dag(new Date(Date.UTC(2026, 10, 9, 12))).nr");
  const fast = { 0: "glede", 1: "pizza", 2: "fjell", 3: "banan", 4: "sykle", 5: "kaffe", 6: "bjørn", 7: "hytte", 8: "gitar", 9: "jakke", 30: "langs", 100: "dusin", 364: "uenig" };
  for (const [k, o] of Object.entries(fast)) {
    const fakt = await t.js(`Rusj.app._dagensOrd(${forste} + ${k})`);
    t.sjekk(fakt === o, `Dagens ord dag ${Number(k) + 1} skal være «${o}», er «${fakt}» – rekkefølgen er endret`);
  }
  await t.bilde("brett-tomt");

  // Too short, not a word, then deleting
  await skriv("kat");
  await t.klikk('.ou-tast[data-v="gjett"]', 80);
  t.sjekk(/For få bokstaver/.test(await toast()), "Mangler «For få bokstaver»");
  await skriv("qq");
  await t.klikk('.ou-tast[data-v="gjett"]', 80);
  t.sjekk(/Ikke i ordlista/.test(await toast()), "Mangler «Ikke i ordlista»");
  t.sjekk(await t.finnes(".ou-rad.na.risting"), "Raden rister ikke ved ugyldig ord");
  await t.bilde("ikke-i-ordlista");
  for (let i = 0; i < 5; i++) await t.klikk('.ou-tast[data-v="slett"]', 25);
  s = await tilstand();
  t.sjekk(s.dag.gjett.length === 0 && s.dag.rad === "", `Ugyldige ord skal ikke telle, og «Slett» skal tømme raden (${JSON.stringify(s.dag)})`);

  // A real tap on a key types (the keys never take the focus)
  await t.trykk('.ou-tast[data-v="a"]');
  t.sjekk((await tilstand()).dag.rad === "a", "Et ekte trykk på tastaturet skrev ikke bokstaven");
  await t.klikk('.ou-tast[data-v="slett"]', 25);

  const [ord1, ord2, ord3] = await andreOrd(svar, 3);
  await gjett(ord1);
  t.sjekk((await t.antall('.ou-rad[data-rad="0"] .ou-rute.rett, .ou-rad[data-rad="0"] .ou-rute.med, .ou-rad[data-rad="0"] .ou-rute.ikke')) === 5, "Første forsøk ble ikke farget");
  t.sjekk((await t.antall(".ou-tast.rett, .ou-tast.med, .ou-tast.ikke")) >= 3, "Tastaturet ble ikke farget");
  await pause();
  // The same word twice
  await skriv(ord1);
  await t.klikk('.ou-tast[data-v="gjett"]', 80);
  t.sjekk(/prøvd/.test(await toast()) && (await tilstand()).dag.gjett.length === 1, "Samme ord to ganger skal avvises");
  for (let i = 0; i < 5; i++) await t.klikk('.ou-tast[data-v="slett"]', 25);

  // A real keyboard: letters, Backspace and Enter
  await t.js("document.activeElement && document.activeElement.blur && document.activeElement.blur()");
  for (const b of ord2.slice(0, 4) + "x") await tast(b);
  await tast("Backspace");
  await tast(ord2[4]);
  await tast("x"); // a sixth letter is ignored
  await tast("Enter");
  await t.vent(`JSON.parse(localStorage.getItem("rusj.ordugla.v1")).dag.gjett.length === 2`, 4000);
  await t.vent(`!!document.querySelector('.ou-rad.na[data-rad="2"]')`, 6000);
  t.sjekk((await tilstand()).dag.gjett[1] === ord2, "Et ord skrevet på et ekte tastatur ble ikke gjettet");
  await t.bilde("to-forsok");

  // Reload with letters typed: the board and the letters come back
  await skriv(ord3.slice(0, 3));
  await t.lastSide(t.side, "document.querySelector('.ou-brett')");
  s = await tilstand();
  t.sjekk(s.skjerm === "brett" && s.dag.gjett.length === 2 && s.dag.rad === ord3.slice(0, 3), "Brettet eller bokstavene forsvant etter omlasting");
  t.sjekk((await t.tekst('.ou-rad[data-rad="2"]')).replace(/\s/g, "").toLowerCase() === ord3.slice(0, 3), "Bokstavene i raden vises ikke etter omlasting");
  for (let i = 0; i < 3; i++) await t.klikk('.ou-tast[data-v="slett"]', 25);

  // Back to home and continue
  await t.klikk("#tilbake");
  t.sjekk(/Fortsett dagens ord · 2\/6/.test(await t.tekst('.hjem-knapper [data-h="dag"]')), "Hjem viser ikke «Fortsett dagens ord · 2/6»");
  t.sjekk((await tilstand())._aktiv === true, "Et påbegynt dagens ord er ikke merket som pågående");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.ou-tastatur')");
  await pause();

  // The right word wins
  await skriv(svar);
  await t.klikk('.ou-tast[data-v="gjett"]', 60);
  await t.sov(1500);
  await t.bilde("vunnet-brett");
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(600);
  s = await tilstand();
  t.sjekk(s.dag.ferdig && s.dag.vunnet, "Riktig ord ble ikke vunnet");
  const daglig = await t.js(`JSON.parse(localStorage.getItem("rusj.daglig") || "{}").ordugla || null`);
  t.sjekk(daglig && daglig.nr === iDag && daglig.vunnet === true && daglig.rekke === 4, `R.dagligFerdig ble ikke kalt riktig: ${JSON.stringify(daglig)}`);
  t.sjekk(s.stat.spilt === 4 && s.stat.vunnet === 4 && s.stat.rekke === 4 && s.stat.best === 4 && s.stat.fordeling[2] === 2, `Statistikken er feil: ${JSON.stringify(s.stat)}`);
  t.sjekk(s._aktiv === false, "Et ferdig dagens ord skal ikke være merket som pågående");
  t.sjekk(/Du fant ordet på 3 forsøk/.test(await t.tekst("#skjerm h1")), `Feil overskrift: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".ou-mini .ou-rad")) === 3, "Forsøkene vises ikke på resultatet");
  t.sjekk(await t.finnes(".ou-fordeling li.na"), "Dagens antall forsøk er ikke uthevet i statistikken");
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på resultatet");
  await t.bilde("resultat", true);

  // Share: squares and the address, never the word
  await t.js(`(() => {
    window.__delt = null;
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
  })()`);
  await t.klikk('[data-h="del"]', 300);
  const delt = await t.js("window.__delt");
  t.sjekk(delt && /^Ordugla nr\. \d+ · 3\/6/.test(delt) && /rusj\.no\/ordugla/.test(delt) && (delt.match(/🟩/g) || []).length >= 5, `Delingsteksten er feil: ${delt}`);
  t.sjekk(delt && !delt.toLowerCase().includes(svar), "Delingsteksten røper ordet");
  t.sjekk(/Kopiert/.test(await toast()), "Mangler «Kopiert» etter deling");

  // Home: today's result and the countdown
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="se-resultat"]'), "Hjem viser ikke «Se dagens resultat»");
  t.sjekk(/^\d+:\d\d:\d\d$/.test(await t.tekst(".ou-nedtelling b")), "Nedtellingen til neste ord vises ikke");
  t.sjekk(/4/.test(await t.tekst(".merker")), "Rekka på hjem-skjermen ble ikke 4");
  await t.bilde("hjem-ferdig");
  await t.klikk('[data-h="statistikk"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .ou-fordeling"), "Statistikken vises ikke");
  await t.bilde("statistikk");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="se-resultat"]');
  t.sjekk(await t.finnes(".skjerm-resultat"), "«Se dagens resultat» viser ikke resultatet");

  // Practice: six wrong words show the answer
  await t.klikk('.lenkerad [data-h="ov"]');
  await t.vent("document.querySelector('.ou-tastatur')");
  s = await tilstand();
  t.sjekk(s.modus === "ov" && s.ov && s.ov.ord !== svar, "Øving startet ikke med et annet ord enn dagens");
  t.sjekk(/ØVING|Øving/.test(await t.tekst("#topp-tittel")), "Øvingen er ikke merket «Øving»");
  const ovSvar = s.ov.ord;
  t.sjekk(!(await t.js(`Rusj.app._kommendeDagsord().includes(${JSON.stringify(ovSvar)})`)), `Øveordet «${ovSvar}» er et av de neste 365 dagsordene`);
  const feil = await andreOrd(ovSvar, 6);
  for (let i = 0; i < 6; i++) {
    await gjett(feil[i]);
    if (i === 3) await t.bilde("ov-fire-forsok");
  }
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(400);
  s = await tilstand();
  t.sjekk(s.ov.ferdig && !s.ov.vunnet && s.ovStat.spilt === 1 && s.ovStat.vunnet === 0, "Seks feil skal avslutte øveordet");
  t.sjekk(s.stat.spilt === 4, "Øving skal ikke telle i dagens statistikk");
  t.sjekk((await t.tekst(".ou-ordet")).replace(/\s/g, "").toLowerCase() === ovSvar, "Ordet vises ikke etter tap");
  await t.bilde("ov-tapt", true);

  // A new practice word, then give up
  await t.klikk('[data-h="nytt-ov"]');
  await t.vent("document.querySelector('.ou-tastatur')");
  await pause();
  const ord4 = (await andreOrd((await tilstand()).ov.ord, 1))[0];
  await gjett(ord4);
  t.sjekk(!(await t.finnes('[aria-hidden="true"] [data-h="gi-opp"]')), "«Gi opp» ligger i et aria-hidden-element");
  await t.klikk('[data-h="gi-opp"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]'), "«Gi opp» spør ikke først");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-resultat')", 6000);
  t.sjekk((await tilstand()).ovStat.spilt === 2, "«Gi opp» telte ikke som spilt øveord");

  // Colour-blind palette from the rules sheet
  await t.klikk("#reglerknapp");
  await t.klikk('#ark [data-h="kontrast"]');
  t.sjekk(await t.js("document.documentElement.classList.contains('ou-kontrast')"), "Fargeblind-fargene ble ikke slått på");
  t.sjekk(/Oransje/.test(await t.tekst("#ark .steg")), "Reglene forklarer ikke de nye fargene");
  await t.bilde("regler-kontrast");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="nytt-ov"]');
  await t.vent("document.querySelector('.ou-tastatur')");
  await pause();
  const [ord5, ord6] = await andreOrd((await tilstand()).ov.ord, 2);
  await gjett(ord5);
  await gjett(ord6);
  await t.bilde("brett-kontrast");
  await t.lastSide(t.side, "document.querySelector('.ou-brett')");
  t.sjekk(await t.js("document.documentElement.classList.contains('ou-kontrast')"), "Fargeblind-fargene ble ikke husket");
}
