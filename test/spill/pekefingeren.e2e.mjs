// Pekefingeren: a ten-card session with scoring — the player list follows the gang's names, the
// Christmas pack, swipe (the card keeps its number), vote, the spotlight, undo (from the spotlight
// and from the next card), a split vote («Delt!»), «Ingen poeng», a ghost tap after «Neste kort»,
// reload on the spotlight, back + continue, «Spill videre» in the sheet, the crowning that arrives
// by itself after the last card (shared win, diplomas, share, «Kveldens gjeng»). Then a session
// without points (ends by itself, no crowning) and the deep link #jul.

// A nervous double tap: a real finger tap on one button and, about 90 ms later, a second real tap
// on the button the new screen has put under the thumb. (Real taps: the kit only guards against
// trusted input, a scripted click passes.) Returns what the second tap landed on.
async function toTrykk(t, forst, deretter) {
  const midt = (sel) => t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const trykk = async (p) => {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.sov(30);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await t.js(`document.querySelector(${JSON.stringify(forst)}).scrollIntoView({ block: "center" })`);
  await t.sov(120);
  await trykk(await midt(forst));
  await t.sov(60);
  const p = await midt(deretter);
  if (!p) return null;
  const traff = await t.js(`document.elementFromPoint(${p.x}, ${p.y})?.closest("[data-h]")?.dataset.h ?? null`);
  await trykk(p);
  return traff;
}

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const kveld = () => t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  const hendelser = () => t.js(`window.Rusj._statKo.map((s) => s.h)`);

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  // The player list follows the names the gang has already typed (three names → three rows, not four)
  t.sjekk((await t.antall(".spiller")) === 3, `Spillerlista skal følge gjengens tre navn, viser ${await t.antall(".spiller")}`);

  // The Christmas pack: there, not chosen by default, first in the list while it is the season
  const sesong = (() => {
    const d = new Date();
    return d.getMonth() >= 10 || (d.getMonth() === 0 && d.getDate() <= 6);
  })();
  const fliser = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((f) => f.dataset.v)`);
  t.sjekk(fliser.includes("jul") && fliser[sesong ? 0 : fliser.length - 1] === "jul", `Julepakken skal stå ${sesong ? "først" : "sist"}: ${fliser.join(", ")}`);
  t.sjekk(/Jul og julebord/.test(await t.tekst('[data-h="pakke"][data-v="jul"]')), "Julepakken mangler beskrivelsen «Jul og julebord»");
  t.sjekk(!(await t.tilstand()).oppsett.pakker.includes("jul"), "Julepakken skal ikke være valgt fra start");

  // Session length: 20 by default, here 10
  t.sjekk(await t.finnes('[data-h="lengde"][data-v="20"][aria-pressed="true"]'), "«20 kort» er ikke valgt fra start");
  await t.klikk('[data-h="lengde"][data-v="10"]');
  t.sjekk((await t.tilstand()).oppsett.lengde === 10, "Valget «10 kort» ble ikke lagret");

  // Toggle a pack on, add a player
  await t.klikk('[data-h="pakke"][data-v="kaos"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.includes("kaos"), "Kaos-pakken ble ikke valgt");
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.skrivInn("#navn-3", "Testspiller D");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  await t.bilde("kort");
  t.sjekk((await t.tilstand())._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  t.sjekk((await hendelser()).includes("start"), "Spillet meldte ikke «start» til statistikken");
  t.sjekk(/1 av 10/i.test(await t.tekst("#topp-tittel")) && /1 av 10/.test(await t.tekst(".storkort-nr")), "Kortet viser ikke «1 av 10»");
  const forste = (await t.tilstand()).spill.kort;

  // Swipe: another card, but still card 1 of the session
  await t.sveip(".storkort", -240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  let s = await t.tilstand();
  const andre = s.spill.kort;
  t.sjekk(andre !== forste && s.spill.nr === 1, "Sveip skal bytte kortet uten å bruke opp et kort i runden");
  await pause();

  // One card: countdown, then the vote. `hvem`: a player, several players (split) or null (no points).
  async function tilVelg() {
    await pause();
    await t.klikk('[data-h="pek"]', 50);
    await t.vent("document.querySelector('[data-h=\"vinner\"]')", 8000);
  }
  async function stem(hvem) {
    if (hvem == null) return t.klikk('[data-h="uavgjort"]');
    if (!Array.isArray(hvem)) return t.klikk(`[data-h="vinner"][data-v="${hvem}"]`);
    await t.klikk('[data-h="delt"]');
    for (const i of hvem) await t.klikk(`[data-h="velg"][data-v="${i}"]`);
    await t.klikk('[data-h="delt-ferdig"]');
  }
  const videre = async () => {
    await pause();
    await t.klikk('[data-h="videre"]');
  };

  // Card 1: Testspiller B gets it → the spotlight
  await tilVelg();
  await enH1("hvem fikk flest");
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="slutt"]'), "«Avslutt» mangler på «Hvem fikk flest fingrer?»");
  await t.bilde("hvem-fikk-flest");
  await stem(1);
  await t.vent("document.querySelector('.peke-kaaret')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 1 && s.spill.fase === "kaaret", "Poenget ble ikke gitt til spiller 2");
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")) && /mest sannsynlig/i.test(await t.tekst(".stempel")), "Rampelyset viser ikke hvem som er mest sannsynlig");
  t.sjekk(/\+1 til Testspiller B/.test(await t.tekst(".peke-kaaret-linje")), "Rampelyset sier ikke «+1 til Testspiller B»");
  t.sjekk(!(await t.finnes("#toast.vis")), "«+1 til …» skal vises i rampelyset, ikke som en toast");
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="slutt"]'), "«Avslutt» mangler i rampelyset");
  t.sjekk(await t.friForDokk(".peke-kaaret-linje"), "Linja under stempelet havner bak knappene");
  await enH1("rampelyset");
  await t.sov(900); // the stamp lands when the drum roll ends
  await t.bilde("rampelys");

  // Undo from the spotlight: the point goes away and the same card comes back to the vote
  await pause();
  await t.klikk("#angre");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 0 && s.spill.fase === "velg" && s.spill.kort === andre && s.spill.spilt === 0, "«Angre» i rampelyset tok ikke tilbake poenget og kortet");
  await pause();
  await stem(1);
  await t.vent("document.querySelector('.peke-kaaret')");

  // Reload on the spotlight keeps it
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.finnes(".peke-kaaret")) && /Testspiller B/.test(await t.tekst("#skjerm h1")), "Rampelyset forsvant ved omlasting");

  // «Neste kort» — and a ghost tap on the button that appears under the finger is ignored
  await pause();
  const traff = await toTrykk(t, '[data-h="videre"]', '[data-h="pek"]'); // the second tap lands on «3 · 2 · 1 – PEK!»
  t.sjekk(traff === "pek", `Det andre trykket traff ikke «PEK!» (${traff}), så spøketrykket ble ikke prøvd`);
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "les" && s.spill.nr === 2 && (await t.finnes("#nedtelling[hidden]")), "Et spøketrykk rett etter «Neste kort» startet nedtellingen");

  // Undo is still there on the next card, until the next action
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="angre"]'), "Mangler «Angre» på neste kort");
  await t.bilde("angre");
  await pause();
  await t.klikk('[data-h="angre"]');
  t.sjekk(/Angret \+1 til Testspiller B/.test(await t.tekst("#toast")), "«Angre» sier ikke hva som ble angret");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[1] === 0 && s.spill.fase === "velg" && s.spill.kort === andre && s.spill.nr === 1, "«Angre» på neste kort tok ikke tilbake poenget og kortet");
  await pause();
  await stem(1);
  await videre();

  // Card 2: a split vote gives both a point
  await tilVelg();
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "«Angre» skal forsvinne ved neste handling");
  await t.klikk('[data-h="delt"]');
  t.sjekk(await t.js(`document.querySelector('[data-h="delt-ferdig"]').disabled`), "«Delt» skal kreve minst to navn");
  await t.klikk('[data-h="velg"][data-v="0"]');
  await t.klikk('[data-h="velg"][data-v="1"]');
  t.sjekk(/Delt! \+1 til begge/.test(await t.tekst('[data-h="delt-ferdig"]')), `Knappen skal si «Delt! +1 til begge»: «${await t.tekst('[data-h="delt-ferdig"]')}»`);
  await enH1("delt mellom flere");
  await t.bilde("delt-velg");
  await t.klikk('[data-h="delt-ferdig"]');
  await t.vent("document.querySelector('.peke-kaaret.delt')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[0] === 1 && s.spill.poeng[1] === 2, "Delt seier skal gi begge ett poeng");
  t.sjekk(/Testspiller A og Testspiller B/.test(await t.tekst("#skjerm h1")) && /delt/i.test(await t.tekst(".stempel")), "Rampelyset viser ikke den delte seieren");
  await t.sov(900);
  await t.bilde("delt");
  await videre();

  // Card 3: «Ingen poeng» goes straight on, and can be undone
  await tilVelg();
  await stem(null);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "les" && s.spill.nr === 4 && s.spill.poeng[0] + s.spill.poeng[1] === 3, "«Ingen poeng» skal gå rett til neste kort uten å gi poeng");
  t.sjekk(await t.finnes('[data-h="angre"]'), "«Ingen poeng» skal kunne angres på neste kort");

  // Back to home keeps the game: «Fortsett» is the main button, «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  t.sjekk(/kort 4 av 10/.test(await t.tekst('[data-h="fortsett"]')), "«Fortsett» sier ikke hvor langt spillet er kommet");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).spill !== null, "Spillet forsvant selv om vi avbrøt");
  await t.klikk('[data-h="fortsett"]');
  await pause();

  // «Avslutt» asks, and staying is called «Spill videre»
  t.sjekk(/^Avslutt$/.test((await t.tekst('[data-h="slutt"]')).trim()), "Lenken for å avslutte skal bare hete «Avslutt»");
  await t.klikk('[data-h="slutt"]');
  t.sjekk((await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Arket skal ha knappen «Spill videre»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).spill.ferdig === false, "«Spill videre» avsluttet spillet likevel");

  // Cards 4–9: A, A, B, A, B, C → A 4, B 4, C 1
  for (const hvem of [0, 0, 1, 0, 1, 2]) {
    await tilVelg();
    await stem(hvem);
    await t.vent("document.querySelector('.peke-kaaret')");
    await videre();
  }
  s = await t.tilstand();
  t.sjekk(s.spill.nr === 10 && s.spill.poeng[0] === 4 && s.spill.poeng[1] === 4 && s.spill.poeng[2] === 1, `Feil stilling før siste kort: ${JSON.stringify(s.spill.poeng)} på kort ${s.spill.nr}`);
  t.sjekk(/Siste kort/.test(await t.tekst(".storkort-fot")), "Det siste kortet sier ikke at det er det siste");
  await t.bilde("siste-kort");

  // Card 10, the last one: «Ingen poeng» stops once (so it can be undone), then the crowning comes by itself
  await tilVelg();
  await stem(null);
  await t.vent("document.querySelector('.peke-kaaret')");
  t.sjekk(/Ingen poeng/.test(await t.tekst("#skjerm h1")) && /Til kåringen/.test(await t.tekst('[data-h="videre"]')), "Etter siste kort skal knappen hete «Til kåringen»");
  t.sjekk(await t.finnes("#angre"), "«Ingen poeng» på siste kort skal kunne angres");
  await videre();
  await t.vent("document.querySelector('.pall')");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  await t.bilde("slutt", true);
  t.sjekk(/Testspiller A og Testspiller B vinner/.test(await t.tekst("#skjerm h1")), `4–4 skal kåre begge: «${await t.tekst("#skjerm h1")}»`);
  const blant = await t.tekst(".banner .ingress");
  t.sjekk(/Blant annet/.test(blant) && /Testspiller A til å/.test(blant) && /Testspiller B til å/.test(blant), `«Blant annet …» skal nevne begge vinnerne: «${blant}»`);
  t.sjekk((await t.antall(".peke-diplom")) === 3, `Alle tre med poeng skal få diplom, fant ${await t.antall(".peke-diplom")}`);
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk((await hendelser()).includes("ferdig"), "Spillet meldte ikke «ferdig» til statistikken");
  let k = await kveld();
  const plass = (navn) => (k.spill[0].resultat.find((r) => r.navn === navn) || {}).plass;
  t.sjekk(k && k.spill.length === 1 && k.spill[0].id === "pekefingeren", "Kåringen ble ikke meldt til «Kveldens gjeng» nøyaktig én gang");
  t.sjekk(plass("Testspiller A") === 1 && plass("Testspiller B") === 1 && plass("Testspiller C") === 3, "«Kveldens gjeng» fikk feil plasseringer");

  // «Del diplomene» hands the diplomas to the share sheet
  await t.js(`navigator.share = async (d) => { window.__delt = d; }`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && /Testspiller A – mest sannsynlig til å /.test(delt.text) && /Testspiller C – /.test(delt.text) && /\/pekefingeren\/$/.test(delt.url), `«Del diplomene» delte ikke diplomene: ${JSON.stringify(delt)}`);

  // The crowning is final: back leads home, and there is nothing to continue
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Etter kåringen skal hjem-skjermen ikke tilby «Fortsett»");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Nytt spill» etter kåringen skal ikke spørre");
  await t.vent("document.querySelector('[data-h=\"start\"]')");

  // Without points: no player list, no vote — and the session still ends by itself, without a crowning
  await t.klikk('[data-h="poeng"]');
  t.sjekk(!(await t.finnes(".spiller")), "Uten poeng trengs ingen spillerliste");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  await pause();
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('#nedtelling[hidden]') && document.querySelector('.storkort:not(.ut)') && /2 av 10/.test(document.querySelector('.storkort-nr').textContent)", 8000);
  // (jump to the last card instead of counting down eight more times)
  await t.js(`(() => { const s = JSON.parse(localStorage.getItem("rusj.pekefingeren.v1")); s.spill.nr = 10; s.spill.spilt = 9; localStorage.setItem("rusj.pekefingeren.v1", JSON.stringify(s)); })()`);
  await t.lastSide(t.side, "document.querySelector('.storkort')");
  t.sjekk(/Siste kort/.test(await t.tekst(".storkort-fot")), "Uten poeng: det siste kortet sier ikke at det er det siste");
  await pause();
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('.banner') && document.querySelector('[data-h=\"igjen\"]')", 8000);
  t.sjekk(/10 kort – ferdig/.test(await t.tekst("#skjerm h1")), `Uten poeng skal runden ende av seg selv: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(!/kåringen/i.test(await t.tekst("#topp-tittel")) && !(await t.finnes(".pall, .poengliste")), "Uten poeng skal sluttskjermen ikke være en kåring");
  k = await kveld();
  t.sjekk(k.spill.length === 1, "Et spill uten poeng skal ikke meldes til «Kveldens gjeng»");
  await t.bilde("ferdig-uten-poeng");

  // Deep link: …/pekefingeren/#jul opens «Gjør klart» with only the Christmas pack
  await t.lastSide(t.side + "#jul", "document.querySelector('[data-h=\"start\"]')");
  s = await t.tilstand();
  t.sjekk(s.oppsett.pakker.join() === "jul" && (await t.finnes('[data-h="pakke"][data-v="jul"][aria-pressed="true"]')), `#jul skal velge bare julepakken: ${s.oppsett.pakker.join()}`);
  t.sjekk((await t.js("location.hash")) === "", "#jul skal fjernes fra adressen etterpå");
  await t.bilde("jul-oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  t.sjekk(/Jul/i.test(await t.tekst(".storkort-etikett")), "Med bare julepakken skal kortet komme fra den");
  await t.bilde("jul-kort");
  // … and is ignored while a game is running
  await t.lastSide(t.side + "#jul", "document.querySelector('#skjerm h1')");
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill && s.spill.ferdig === false && s.skjerm !== "oppsett", "#jul skal ikke avbryte et spill som pågår");
  // The kit check runs on the set-up screen: leave the game above and start from a clean slate.
  await t.js(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("rusj.pekefingeren.v")) localStorage.removeItem(k); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('[data-h=\"start\"]')");
  await pause();
  await (await import("../a11y/kit-sjekk.mjs")).default(t); // the kit's accessibility promises
}
