// Sladrehanken. «Fem liv» with five players, where the game by default ends when the FIRST player
// is out: the end rule follows the group size until the group chooses, the Christmas pack, a new
// reader for every card, swipe, countdown, expose, the chip for two or more, undo, a ghost tap after
// «Ingen har gjort det», reload, back + continue (also during the heart animation), the story
// spotlight for a lone confessor (a good story gives the life back — also the last one), a «Finn på
// et selv» card, the knock-out that leads straight to the crowning (no boo), titles, share and
// «Kveldens gjeng». Then «Én står igjen» with four players (knock-outs, "everyone out at once
// doesn't count", last one standing), «Bare kort», an early finish with a shared win, and #jul.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en sladrehanken): the texts are checked in
// Norwegian only (t.norsk), the card's opening words in each edition; elsewhere the names, the state
// and the links (t.forside, t.nokkel).

// Two real finger taps 90 ms apart on the same spot (a nervous double tap). The kit only drops a
// second tap that lands near the first one, so a scripted click + a tap elsewhere is not a ghost tap.
async function dobbeltrykk(t, sel) {
  await t.js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center" })`);
  await t.sov(120);
  const p = await t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const under = [];
  for (let i = 0; i < 2; i++) {
    under.push(await t.js(`document.elementFromPoint(${p.x}, ${p.y})?.closest("[data-h]")?.dataset.h ?? null`));
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.sov(30);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (i === 0) await t.sov(60);
  }
  return under; // the buttons under the finger at each tap
}

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const liv = async () => (await t.tilstand()).spill.liv.join(",");
  const kveld = () => t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  const PREFIKS = { nb: "Jeg har aldri", en: "Never have I ever", da: "Jeg har aldrig" }[t.sprak];
  const hendelser = () => t.js(`window.Rusj._statKo.map((s) => s.h)`);
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const regelValgt = (v) => t.finnes(`[data-h="regel"][data-v="${v}"][aria-pressed="true"]`);

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('[data-h="modus"][data-v="liv"][aria-pressed="true"]'), "«Fem liv» er ikke valgt fra start");
  t.sjekk(!(await t.tilstand()).oppsett.pakker.includes("fest"), "Festpakken (18+) skal ikke være med fra start");
  t.sjekk((await t.antall(".spiller")) === 4, "Spillerlista viser ikke fire spillere");

  // The Christmas pack: there, not chosen by default, first in the list while it is the season
  const sesong = (() => {
    const d = new Date();
    return d.getMonth() >= 10 || (d.getMonth() === 0 && d.getDate() <= 6);
  })();
  const fliser = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((f) => f.dataset.v)`);
  t.sjekk(fliser.includes("jul") && fliser[sesong ? 0 : fliser.length - 1] === "jul", `Julepakken skal stå ${sesong ? "først" : "sist"}: ${fliser.join(", ")}`);
  t.sjekk(!t.norsk || /Jul og julebord/.test(await t.tekst('[data-h="pakke"][data-v="jul"]')), "Julepakken mangler beskrivelsen «Jul og julebord»");
  t.sjekk(!(await t.tilstand()).oppsett.pakker.includes("jul"), "Julepakken skal ikke være valgt fra start");

  // «Spillet varer til …»: four players keep the old rule, from five the first knock-out ends the game
  t.sjekk(await regelValgt("siste"), "Med fire spillere skal «Én står igjen» være valgt fra start");
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.skrivInn("#navn-4", "Testspiller E");
  t.sjekk(await regelValgt("forste"), "Med fem spillere skal «Første er ute» være valgt fra start");
  await t.bilde("oppsett", true);

  await t.klikk('[data-h="pakke"][data-v="fest"]');
  await t.klikk('[data-h="pakke"][data-v="mat"]');
  let s = await t.tilstand();
  t.sjekk(s.oppsett.pakker.includes("fest") && !s.oppsett.pakker.includes("mat"), "Pakkevalget ble ikke lagret");

  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  await t.bilde("kort");
  s = await t.tilstand();
  t.sjekk(s.spill.liv.length === 5 && s.spill.liv.every((l) => l === 5), "Alle skal starte med fem liv");
  t.sjekk(s.spill.regel === "forste", `Spillet skal ende når den første er ute, fikk «${s.spill.regel}»`);
  t.sjekk((await t.tekst(".storkort-tekst")).startsWith(PREFIKS), `Kortet begynner ikke med «${PREFIKS}»`);
  t.sjekk(s._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  t.sjekk((await hendelser()).includes("start"), "Spillet meldte ikke «start» til statistikken");
  t.sjekk((t.norsk ? /Leser: Testspiller A/ : /Testspiller A/).test(await t.tekst(".sladre-leser")), `Første kort skal leses av Testspiller A: «${await t.tekst(".sladre-leser")}»`);
  t.sjekk(await t.friForDokk(".sladre-hint"), "Teksten under kortet havner bak knappene");
  const forste = s.spill.kort;

  // Swiping skips the card (the same reader gets another one)
  await t.sveip(".storkort", -240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  s = await t.tilstand();
  t.sjekk(s.spill.kort !== forste && s.spill.leser === 0, "Sveip skal gi nytt kort til samme leser");

  // One card: countdown, tap who has done it, confirm. A lone confessor gets the spotlight first;
  // `historie` is what the table answers there: "god", "videre" (default) or null (stay there).
  async function tilVelg() {
    await pause();
    await t.klikk('[data-h="avslor-na"]', 50);
    await t.vent("document.querySelector('[data-h=\"avslor\"]')", 8000);
  }
  async function runde(hvem, o = {}) {
    await tilVelg();
    for (const i of hvem) await t.klikk(`[data-h="avslor"][data-v="${i}"]`);
    if (o.bilde) await t.bilde(o.bilde);
    await t.klikk('[data-h="ferdig"]');
    if (hvem.length === 1) {
      await t.vent("document.querySelector('.sladre-historie')", 5000);
      if (o.historie === null) return;
      await pause();
      await t.klikk(`[data-h="historie-${o.historie || "videre"}"]`);
    }
    await t.vent("document.querySelector('[data-h=\"avslor-na\"], [data-h=\"videre\"]')", 5000);
  }

  // Two exposed: a chip asks for the best story, both lose a life, and the phone goes to the next reader
  await tilVelg();
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="avslutt"]'), "«Avslutt» mangler på «Hvem har gjort det?»");
  await t.klikk('[data-h="avslor"][data-v="0"]');
  t.sjekk(!(await t.finnes(".sladre-prat")), "Brikken om den beste historien skal først komme når to er avslørt");
  await t.klikk('[data-h="avslor"][data-v="1"]');
  t.sjekk((await t.finnes(".sladre-prat")) && (!t.norsk || /beste historien/.test(await t.tekst(".sladre-prat"))), "Mangler «Hvem har den beste historien?» når to er avslørt");
  await t.bilde("hvem-har");
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')", 5000);
  t.sjekk((await liv()) === "4,4,5,5,5", `Feil liv etter første kort: ${await liv()}`);
  t.sjekk((t.norsk ? /Leser: Testspiller B/ : /Testspiller B/).test(await t.tekst(".sladre-leser")), "Neste kort skal leses av Testspiller B");

  // Undo: the lives come back and the same card returns to «Hvem har gjort det?» with the same choice
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="angre"]'), "Mangler «Angre» etter at liv ble trukket");
  await pause();
  await t.klikk('[data-h="angre"]');
  s = await t.tilstand();
  t.sjekk((await liv()) === "5,5,5,5,5" && s.spill.fase === "velg" && s.spill.valgt.join() === "0,1" && s.spill.leser === 0, "«Angre» ga ikke tilbake livene, valget og leseren");
  await enH1("hvem har gjort det");
  await pause();
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')", 5000);
  t.sjekk((await liv()) === "4,4,5,5,5", "Feil liv etter nytt forsøk");

  // «Ingen har gjort det» costs nothing, and a ghost tap on the button that appears under the finger is ignored
  await tilVelg();
  await pause();
  const under = await dobbeltrykk(t, '[data-h="ferdig"]'); // the second tap lands on what the redraw put there
  t.sjekk(under[0] === "ferdig" && under[1] && under[1] !== "ferdig", `Det andre trykket traff ingen ny knapp (${under.join(" → ")}), så spøketrykket ble ikke prøvd`);
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "les" && (await t.finnes("#nedtelling[hidden]")), "Et spøketrykk rett etter «Ingen har gjort det» startet nedtellingen");
  t.sjekk((await liv()) === "4,4,5,5,5", "«Ingen har gjort det» skal ikke koste liv");

  // Reload mid-game keeps everything
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="avslor-na"]'), "Spillet fortsatte ikke etter omlasting");
  t.sjekk((await liv()) === "4,4,5,5,5", "Livene forsvant ved omlasting");

  // Back to home keeps the game: «Fortsett» is the main button, «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')");

  // Alone in having done it: the spotlight instead of a toast — and a good story gives the life back
  await runde([0], { historie: null });
  s = await t.tilstand();
  t.sjekk((await liv()) === "3,4,5,5,5" && s.spill.fase === "historie", `Den som er alene om det, skal miste et liv og få rampelyset: ${await liv()}`);
  t.sjekk(t.norsk ? /Testspiller A – fortell/.test(await t.tekst("#skjerm h1")) && /Alene om det/i.test(await t.tekst(".sladre-historie .etikett")) : /Testspiller A/.test(await t.tekst("#skjerm h1")), "Rampelyset ber ikke Testspiller A fortelle");
  t.sjekk(!t.norsk || /lov å si pass/.test(await t.tekst(".sladre-historie .ingress")), "Rampelyset skal si at det er lov å si pass");
  t.sjekk(!(await t.finnes("#toast.vis")), "Rampelyset skal komme i stedet for en toast");
  t.sjekk((await t.finnes('#skjerm .dokk [data-h="avslutt"]')) && (await t.finnes('#skjerm .dokk [data-h="angre"]')), "Rampelyset mangler «Angre» eller «Avslutt»");
  t.sjekk(await t.friForDokk(".sladre-historie .ingress"), "Teksten i rampelyset havner bak knappene");
  await enH1("rampelyset");
  await t.bilde("historie");
  await pause();
  await t.klikk('[data-h="historie-god"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')", 5000);
  s = await t.tilstand();
  t.sjekk((await liv()) === "4,4,5,5,5" && s.spill.historier[0] === 1, `«God historie! +1 liv» ga ikke livet tilbake: ${await liv()}`);
  t.sjekk((t.norsk ? /fikk livet tilbake/ : /Testspiller A/).test(await t.tekst("#toast")), "Mangler beskjeden om at livet er tilbake");

  // … and that can be undone too (the story, the life and the card)
  await pause();
  await t.klikk('[data-h="angre"]');
  s = await t.tilstand();
  t.sjekk((await liv()) === "4,4,5,5,5" && s.spill.historier[0] === 0 && s.spill.fase === "velg" && s.spill.valgt.join() === "0", "«Angre» etter en god historie skal ta kortet tilbake til valget");
  await pause();
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.sladre-historie')", 5000);
  await pause();
  await t.klikk('[data-h="historie-videre"]'); // passing is free: no story, no comment
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')", 5000);
  t.sjekk((await liv()) === "3,4,5,5,5", `«Videre» skal la livet være tapt: ${await liv()}`);

  // About every sixth card (the fourth one played) the reader makes up the rest
  s = await t.tilstand();
  t.sjekk(s.spill.egen === true && (await t.finnes(".storkort.sladre-egen")), "Det fjerde kortet skal være et «Finn på et selv»-kort");
  t.sjekk((t.norsk ? /Testspiller D finner på resten/ : /Testspiller D/).test(await t.tekst(".storkort-tekst")) && (await t.tekst(".storkort-tekst")).includes(PREFIKS + " …"), `Kortet sier ikke hvem som finner på resten: «${await t.tekst(".storkort-tekst")}»`);
  await enH1("finn på et selv");
  await t.bilde("finn-pa-selv");
  await runde([1, 2, 3]);
  t.sjekk((await liv()) === "3,3,4,4,5", `Feil liv etter «Finn på et selv»-kortet: ${await liv()}`);
  t.sjekk((await t.tilstand()).spill.egen === false, "Kortet etter et «Finn på et selv»-kort skal være et vanlig kort");

  // Testspiller A loses two more lives …
  await runde([0]);
  await runde([0]);
  t.sjekk((await liv()) === "1,3,4,4,5", `Feil liv før siste liv: ${await liv()}`);

  // … and the last one, but «tilbake» during the heart animation must leave everything as it was
  await tilVelg();
  await t.klikk('[data-h="avslor"][data-v="0"]');
  await t.klikk('[data-h="ferdig"]', 60);
  await t.klikk("#tilbake", 1300);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && s.spill.liv[0] === 1 && s.spill.fase === "velg", "Tilbake under hjerteanimasjonen endret spillet likevel");
  await t.klikk('[data-h="fortsett"]');
  await pause();
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.sladre-historie')", 5000);
  // On zero lives the story decides: a good one, and Testspiller A is still in
  t.sjekk(!t.norsk || (/tom for liv/i.test(await t.tekst(".sladre-historie .etikett")) && /redder/.test(await t.tekst(".sladre-historie .ingress"))), "Rampelyset på siste liv skal si at en god historie redder spilleren");
  await t.bilde("historie-siste-liv");
  await pause();
  await t.klikk('[data-h="historie-god"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')", 5000);
  s = await t.tilstand();
  t.sjekk((await liv()) === "1,3,4,4,5" && s.spill.uteNr[0] === 0 && s.spill.historier[0] === 1, `En god historie på siste liv skal holde spilleren inne: ${await liv()}`);

  // No story this time: Testspiller A is the first one out, and that ends the game. No boo.
  await t.js(`(() => { window.__buu = 0; const l = window.Rusj.lyd; const gml = l.buu; l.buu = () => { window.__buu++; gml(); }; })()`);
  await runde([0]);
  await t.vent("document.querySelector('.sladre-ute')", 5000);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "ute" && s.spill.slutt === true, "Første spiller ute skal avslutte spillet");
  t.sjekk((await t.js("window.__buu")) === 0, "Den som ryker ut, skal ikke bli buet på");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Ute-skjermen viser ikke Testspiller A");
  t.sjekk(t.norsk ? /Mest erfaren/.test(await t.tekst("#skjerm")) : await t.finnes(".sladre-tittel"), "Den første ute får ikke tittelen «Mest erfaren»");
  t.sjekk((!t.norsk || /spillet over/.test(await t.tekst("#skjerm"))) && !(await t.finnes(".sladre-stilling")), "Ute-skjermen skal si at spillet er over – ingen sitter og ser på");
  t.sjekk(!t.norsk || /^Til kåringen$/.test((await t.tekst('[data-h="videre"]')).trim()), `Knappen skal hete «Til kåringen»: «${await t.tekst('[data-h="videre"]')}»`);
  await t.bilde("ute", true);
  await pause();
  await t.klikk('[data-h="videre"]');
  await t.vent("document.querySelector('.sladre-rang')");
  await t.bilde("slutt", true);
  t.sjekk((t.norsk ? /Testspiller E vinner/ : /Testspiller E/).test(await t.tekst("#skjerm h1")), `Den med flest liv skal vinne: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(!t.norsk || /KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  const titler = await t.js(`Array.from(document.querySelectorAll(".sladre-tittel")).map((b) => b.innerText).join(" | ")`);
  t.sjekk((t.norsk ? /MEST ERFAREN\s+Testspiller A/i : /😎\s*\S[^|]*Testspiller A/).test(titler), `«Mest erfaren» skal være den første ute: ${titler}`);
  t.sjekk((t.norsk ? /BESTE FORTELLER\s+Testspiller A/i : /🎤\s*\S[^|]*Testspiller A/).test(titler), `«Beste forteller» skal være den som fikk livet tilbake: ${titler}`);
  t.sjekk(!t.norsk || /fant på selv/.test(await t.tekst(".sladre-topp")), "«Kortet som avslørte flest» skal være kortet dere fant på selv");
  t.sjekk(!t.norsk || /Tom for liv/.test(await t.tekst(".sladre-rang li:last-child")), "Resultatlista skal vise at den siste gikk tom for liv");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk((await hendelser()).includes("ferdig"), "Spillet meldte ikke «ferdig» til statistikken");
  let k = await kveld();
  const plass = (n, navn) => (k.spill[n].resultat.find((r) => r.navn === navn) || {}).plass;
  t.sjekk(k && k.spill.length === 1 && k.spill[0].id === "sladrehanken", "Kåringen ble ikke meldt til «Kveldens gjeng» nøyaktig én gang");
  t.sjekk(plass(0, "Testspiller E") === 1 && plass(0, "Testspiller C") === 2 && plass(0, "Testspiller D") === 2 && plass(0, "Testspiller A") === 5, "«Kveldens gjeng» fikk feil plasseringer");

  // «Del kåringen» hands the titles to the share sheet
  await t.js(`navigator.share = async (d) => { window.__delt = d; }`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && (t.norsk ? /Testspiller E er uskyldigst/.test(delt.text) && /Testspiller A er mest erfaren/.test(delt.text) && /\/sladrehanken\/$/.test(delt.url) : /Testspiller E/.test(delt.text) && /Testspiller A/.test(delt.text) && new URL(delt.url).pathname === new URL(t.side).pathname), `«Del kåringen» delte ikke kåringen: ${JSON.stringify(delt)}`);

  // The crowning is final: back leads home with nothing to continue; «Nytt spill» doesn't ask
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Etter kåringen skal hjem-skjermen ikke tilby «Fortsett»");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Nytt spill» etter kåringen skal ikke spørre");

  // «Én står igjen» — what four players get by default: knock-outs, and the last one standing wins
  await t.klikk('[data-h="spiller-fjern"][data-v="4"]');
  t.sjekk((await t.antall(".spiller")) === 4 && (await regelValgt("siste")), "Med fire spillere igjen skal «Én står igjen» være valgt");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  t.sjekk((await t.tilstand()).spill.regel === "siste", "Fire spillere skal spille til én står igjen");
  // (everyone on their last life, instead of twenty cards to get there)
  await t.js(`(() => { const k = "${t.nokkel("sladrehanken.v1")}"; const s = JSON.parse(localStorage.getItem(k)); s.spill.liv = [1, 1, 1, 1]; localStorage.setItem(k, JSON.stringify(s)); })()`);
  await t.lastSide(t.side, "document.querySelector('[data-h=\"avslor-na\"]')");
  await runde([0]);
  await t.vent("document.querySelector('.sladre-ute')", 5000);
  t.sjekk((!t.norsk || /Avslørt og ute/i.test(await t.tekst(".sladre-ute .etikett"))) && (await t.antall(".sladre-stilling li")) === 3, "Ute-skjermen skal vise de tre som fortsatt er med");
  t.sjekk((!t.norsk || /^Neste kort$/.test((await t.tekst('[data-h="videre"]')).trim())) && (await t.finnes('#skjerm .dokk [data-h="avslutt"]')), "Ute-skjermen skal ha «Neste kort» og «Avslutt»");
  await t.bilde("ute-en-igjen", true);
  await pause();
  await t.klikk('[data-h="videre"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')");
  await tilVelg();
  t.sjekk(!(await t.finnes('[data-h="avslor"][data-v="0"]')), "En spiller som er ute, kan fortsatt velges");
  await t.bilde("tre-igjen");
  // All three exposed at once: the card doesn't count
  for (const i of [1, 2, 3]) await t.klikk(`[data-h="avslor"][data-v="${i}"]`);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('[data-h=\"avslor-na\"]')", 5000);
  t.sjekk((await liv()) === "0,1,1,1", "Kortet skulle ikke telle når alle ville røket ut samtidig");
  // B and C go out together → D is the most innocent
  await runde([1, 2]);
  await t.vent("document.querySelector('.sladre-ute')", 5000);
  t.sjekk((t.norsk ? /Testspiller B og Testspiller C/ : /Testspiller B\b.*Testspiller C/).test(await t.tekst("#skjerm h1")) && (!t.norsk || /Til kåringen/.test(await t.tekst('[data-h="videre"]'))) && !(await t.finnes('#skjerm .dokk [data-h="avslutt"]')), "To ute samtidig skal vises sammen, og bare én er igjen");
  await pause();
  await t.klikk('[data-h="videre"]');
  await t.vent("document.querySelector('.sladre-rang')");
  t.sjekk((t.norsk ? /Testspiller D vinner/ : /Testspiller D/).test(await t.tekst("#skjerm h1")), "Den siste med liv skal vinne");
  t.sjekk(/Testspiller A/.test(await t.tekst(".sladre-tittel")), "«Mest erfaren» skal være den første ute");
  t.sjekk(!t.norsk || /Ute på kort/.test(await t.tekst(".sladre-rang li:last-child")), "Resultatlista skal vise hvilket kort den første røk ut på");
  k = await kveld();
  t.sjekk(k.spill.length === 2 && plass(1, "Testspiller D") === 1 && plass(1, "Testspiller B") === 2 && plass(1, "Testspiller C") === 2 && plass(1, "Testspiller A") === 4, "«Kveldens gjeng» fikk feil plasseringer i spill to");
  await t.bilde("slutt-en-igjen", true);

  // «Bare kort»: next, swipe, a «Finn på et selv» card, quit («Endre oppsett» after the crowning doesn't ask)
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Endre oppsett» etter kåringen skal ikke spørre");
  await t.klikk('[data-h="modus"][data-v="kort"]');
  t.sjekk(!(await t.finnes(".spiller")) && !(await t.finnes('[data-h="regel"]')), "«Bare kort» skal ikke trenge spillere eller sluttregel");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  await t.bilde("bare-kort");
  const k1 = (await t.tilstand()).spill.kort;
  await t.klikk('[data-h="neste"]', 400);
  const k2 = (await t.tilstand()).spill.kort;
  t.sjekk(k1 !== k2, "«Neste kort» ga ikke nytt kort");
  await pause();
  await t.sveip(".storkort", 240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  t.sjekk((await t.tilstand()).spill.nr === 3, "Sveip i «Bare kort» ga ikke nytt kort");
  await pause();
  await t.klikk('[data-h="neste"]', 400);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  t.sjekk((await t.finnes(".storkort.sladre-egen")) && (!t.norsk || /Den som leser finner på resten/.test(await t.tekst(".storkort-tekst"))), "Det fjerde kortet i «Bare kort» skal være et «Finn på et selv»-kort");
  await t.bilde("bare-kort-finn-pa-selv");
  t.sjekk(!t.norsk || /^Avslutt$/.test((await t.tekst('[data-h="avslutt"]')).trim()), "Lenken for å avslutte skal bare hete «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(!t.norsk || (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Arket skal ha knappen «Spill videre»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).spill !== null, "«Spill videre» avsluttet spillet likevel");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('[data-h=\"nytt\"]')");
  t.sjekk((await t.tilstand()).spill === null, "Spillet ble ikke avsluttet");
  t.sjekk((await kveld()).spill.length === 2, "«Bare kort» skal ikke meldes til «Kveldens gjeng»");

  // Early finish: «Avslutt» goes straight to the crowning → shared win between the three still on five lives
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="liv"]');
  await t.klikk('[data-h="start"]');
  await runde([0]);
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(!t.norsk || (/kåringen/.test(await t.tekst("#ark .ingress")) && (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre"), "Arket skal si at «Avslutt» går til kåringen, og ha «Spill videre»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.sladre-rang')");
  t.sjekk(!t.norsk || /delt seier/i.test(await t.tekst(".banner .etikett")), "Lik stilling skal gi delt seier");
  t.sjekk((t.norsk ? /Testspiller B, Testspiller C og Testspiller D vinner/ : /Testspiller B, Testspiller C \S+ Testspiller D/).test(await t.tekst("#skjerm h1")), "Delt seier skal liste navnene «A, B og C»");
  await t.bilde("delt-seier");

  // Deep link: …/sladrehanken/#jul opens «Gjør klart» with only the Christmas pack
  await t.lastSide(t.side + "#jul", "document.querySelector('[data-h=\"start\"]')");
  s = await t.tilstand();
  t.sjekk(s.oppsett.pakker.join() === "jul" && (await t.finnes('[data-h="pakke"][data-v="jul"][aria-pressed="true"]')), `#jul skal velge bare julepakken: ${s.oppsett.pakker.join()}`);
  t.sjekk((await t.js("location.hash")) === "", "#jul skal fjernes fra adressen etterpå");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.storkort')");
  t.sjekk((t.sprak === "en" ? /Christmas/i : /Jul/i).test(await t.tekst(".storkort-etikett")), "Med bare julepakken skal kortet komme fra den");
  await t.bilde("jul-kort");
  // … and is ignored while a game is running
  await t.lastSide(t.side + "#jul", "document.querySelector('#skjerm h1')");
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill && s.spill.fase !== "ferdig" && s.skjerm !== "oppsett", "#jul skal ikke avbryte et spill som pågår");
}
