// Vinglepetter. «Alle velger»: the one-tap vote count (split bar + verdict), swipe, reload in the
// middle of the count, back + continue, a ghost tap after «Neste dilemma», the defence speech
// («Bytter noen side?»), «Er dere ikke 4?», a session of ten that ends by itself with the group's
// verdict («Del dommen»); then a round without counting, and quitting. «I vinglestolen» with three
// players (secret choice, guess, reveal, undo, awards) and with two (who knows the other best), and
// the Christmas pack (#jul).
// Regression checks: three taps per counted dilemma (it was N + 3), «Spill videre» in the confirm
// sheets, plain text on the dock buttons, Kåringen is final and reached without «Avslutt», the
// secret choice is never on the screen before the reveal (also not after a reload).

// Two real finger taps on the same spot (a nervous double tap). The kit only drops a
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
    // «Neste dilemma» redraws a moment later: the second tap comes as soon as another button is there.
    for (let n = 0; i === 0 && n < 40; n++) {
      await t.sov(20);
      if ((await t.js(`document.elementFromPoint(${p.x}, ${p.y})?.closest("[data-h]")?.dataset.h ?? null`)) !== under[0]) break;
    }
  }
  return under; // the buttons under the finger at each tap
}

const NOKKEL = "rusj.vinglepetter.v1";
const TALL = "document.querySelector('.vingle-tall')";
const STOLPE = "document.querySelector('.vingle-stolpe')";

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const topp = async () => (await t.tekst("#topp-tittel")).trim();
  const stempel = async () => (await t.tekst(".vingle-dom")).trim();
  const kveldsspill = () => t.js(`((JSON.parse(localStorage.getItem("rusj.kveld") || "null") || {}).spill || []).filter((s) => s.id === "vinglepetter").length`);
  // Change the saved game and load the page again (the kit only saves on screen changes and redraws).
  const settTilstand = async (endre) => {
    await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); (${endre.toString()})(s); s._tid = Date.now(); localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  };
  // Count down and tap how many chose ☝️: the three taps of a counted dilemma (the third is «Neste dilemma»).
  const stem = async (n) => {
    await t.klikk('[data-h="velg"]', 50);
    await t.vent(TALL, 8000);
    await t.klikk(`.vingle-tall [data-v="${n}"]`, 50);
    await t.vent(STOLPE, 5000);
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('[data-h="modus"][data-v="alle"][aria-pressed="true"]'), "«Alle velger» skal være valgt fra start");
  t.sjekk((await t.js(`document.querySelector("#skjerm h2").textContent`)) === "Hvordan vil dere spille?", "Valget av spillemåte skal stå først på «Gjør klart»");
  t.sjekk(await t.finnes('[data-h="telle"][aria-pressed="true"]'), "«Tell stemmer» skal være på fra start");
  let o = (await t.tilstand()).oppsett;
  t.sjekk(!o.pakker.includes("fest") && !o.pakker.includes("jul"), "Festpakken (18+) og julepakken skal ikke være med fra start");
  t.sjekk(/^4\b/.test((await t.tekst("#vingle-antall output")).trim()), `«Hvor mange er dere?» skal følge gjengens fire navn («${await t.tekst("#vingle-antall output")}»)`);
  t.sjekk(await t.finnes('[data-h="lengde"][data-v="10"][aria-pressed="true"]'), "«10 dilemmaer» skal være valgt fra start");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="pakke"][data-v="ekkelt"]');
  await t.klikk('[data-h="pakke"][data-v="fest"]');
  o = (await t.tilstand()).oppsett;
  t.sjekk(o.pakker.includes("fest") && !o.pakker.includes("ekkelt"), "Pakkevalget ble ikke lagret");
  await t.klikk('#vingle-antall [data-v="1"]');
  await t.klikk('#vingle-antall [data-v="-1"]');
  t.sjekk((await t.tilstand()).antall === 4, "Telleren for «Hvor mange er dere?» virker ikke");

  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.vingle-kort')");
  await t.bilde("kort");
  t.sjekk((await t.antall(".vingle-halv")) === 2, "Kortet er ikke delt i to");
  t.sjekk((await t.tilstand())._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  t.sjekk(/^Dilemma 1 av 10$/i.test(await topp()), `Toppfeltet viser «${await topp()}», ventet «Dilemma 1 av 10»`);
  t.sjekk((await t.antall(".vingle-gang i")) === 10 && (await t.antall(".vingle-gang i.na")) === 1, "Kortet viser ikke hvor langt økten har kommet (ti streker)");
  const forste = (await t.tilstand()).spill.kort;
  await t.sveip(".storkort", 240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  let s = await t.tilstand();
  t.sjekk(s.spill.kort !== forste, "Sveip ga ikke nytt dilemma");
  t.sjekk(s.spill.nr === 1, "Et dilemma dere hoppet over, skal ikke telle med i de ti");
  await pause();

  // Countdown → one tap on how many chose ☝️ → result: 3 against 1
  await t.klikk('[data-h="velg"]', 50);
  await t.vent(TALL, 8000);
  await enH1("tell");
  t.sjekk((await t.antall(".vingle-tall button")) === 5, `Fire spillere skal gi knappene 0–4 (fant ${await t.antall(".vingle-tall button")})`);
  t.sjekk(!(await t.finnes(".teller")) && !(await t.finnes('[data-h="vis-svar"]')), "De gamle tellerne (pluss og minus per side) er der fortsatt");
  t.sjekk(await t.friForDokk(".vingle-tall"), "Tallknappene havner bak knappene nederst");
  await t.bilde("tell");
  await t.klikk('.vingle-tall [data-v="3"]', 50);
  t.sjekk(await t.finnes('.vingle-tall [data-v="3"][aria-pressed="true"]'), "Tallet dere trykket på, lyser ikke under trommevirvelen");
  await t.vent(STOLPE, 5000);
  s = await t.tilstand();
  t.sjekk(s.spill.a === 3 && s.spill.b === 1 && s.spill.fase === "svar", `Ett trykk på 3 skal gi 3–1 (ble ${s.spill.a}–${s.spill.b})`);
  await enH1("resultat");
  await t.sov(1100);
  await t.bilde("svar");
  t.sjekk(/vinglepetter|resten|ulv/i.test(await stempel()), `Feil kommentar for 3 mot 1: ${await stempel()}`);
  t.sjekk(/75 %/.test(await t.tekst(".vingle-stolpe")), "Stolpen viser ikke 75 %");
  t.sjekk((await t.tekst('.dokk .knapp[data-h="neste"]')).trim() === "Neste dilemma", `Hovedknappen skal være ren tekst («${await t.tekst('.dokk .knapp[data-h="neste"]')}»)`);
  t.sjekk(await t.friForDokk(".vingle-dom"), "Resultatet havner bak knappene nederst");

  // Wrong tap? «Endre tallet» asks again, and the result is not counted twice
  await t.klikk('[data-h="endre-tall"]');
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "tell" && s.spill.logg.length === 0 && (await t.finnes(".vingle-tall")), "«Endre tallet» førte ikke tilbake til tellingen");
  await t.klikk('.vingle-tall [data-v="3"]', 50);
  await t.vent(STOLPE, 5000);
  t.sjekk((await t.tilstand()).spill.logg.length === 1, "Resultatet ble ikke talt nøyaktig én gang etter «Endre tallet»");

  // The minority gets a defence speech of 20 s; then «Bytter noen side?»
  t.sjekk(/Forsvarstale – 20 s/.test(await t.tekst('[data-h="forsvar"]')), "Ujevnt resultat gir ikke tilbud om forsvarstale");
  await t.klikk('[data-h="forsvar"]');
  t.sjekk((await t.finnes("#vingle-klokke .timer-ring")) && (await t.tilstand()).spill.fase === "tale", "Forsvarstalen startet ikke klokka");
  await t.sov(1200);
  t.sjekk(Number((await t.tekst("#vingle-klokke .timer-tid")).trim()) < 20, "Klokka for forsvarstalen teller ikke ned");
  t.sjekk(await t.friForDokk("#vingle-klokke"), "Klokka for forsvarstalen havner bak knappene");
  await t.bilde("forsvarstale");
  await t.klikk('[data-h="tale-ferdig"]');
  t.sjekk(/Bytter noen side\?/.test(await t.tekst("#skjerm h2")), "Etter forsvarstalen spør ikke spillet om noen bytter side");
  t.sjekk(await t.finnes('.vingle-tall [data-v="3"][aria-pressed="true"]'), "Tallet fra før forsvarstalen er ikke merket");
  await t.bilde("bytter-noen-side");
  await t.klikk('.vingle-tall [data-v="2"]', 50);
  await t.vent(STOLPE, 5000);
  s = await t.tilstand();
  t.sjekk(s.spill.a === 2 && s.spill.b === 2 && s.spill.logg.length === 1 && s.spill.logg[0].a === 2, "Byttet side ble ikke ført i resultatet");
  t.sjekk(/Én byttet side/i.test(await stempel()), `Feil kommentar når én bytter side: ${await stempel()}`);
  t.sjekk(!(await t.finnes('[data-h="forsvar"]')), "Det går an å holde forsvarstale to ganger på samme dilemma");
  await t.sov(900);
  await t.bilde("byttet-side");

  // A ghost tap on «3 · 2 · 1 – Velg!», which appears under the finger after «Neste dilemma», is ignored
  await pause();
  const under = await dobbeltrykk(t, '[data-h="neste"]'); // the second tap lands on what the redraw put there
  t.sjekk(under[0] === "neste" && under[1] && under[1] !== "neste", `Det andre trykket traff ingen ny knapp (${under.join(" → ")}), så spøketrykket ble ikke prøvd`);
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "les" && (await t.finnes("#nedtelling[hidden]")), "Et spøketrykk rett etter «Neste dilemma» startet nedtellingen");
  t.sjekk(s.spill.nr === 2 && /^Dilemma 2 av 10$/i.test(await topp()), `Etter ett spilt dilemma skal neste være nummer 2 («${await topp()}»)`);

  // 2 against 2, with a reload in the middle of the counting; the clock runs out on the next speech
  await t.klikk('[data-h="velg"]', 50);
  await t.vent(TALL, 8000);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1, #skjerm h2')");
  t.sjekk((await t.finnes(".vingle-tall")) && (await t.tilstand()).spill.fase === "tell", "Tellingen fortsatte ikke etter omlasting");
  await t.klikk('.vingle-tall [data-v="2"]', 50);
  await t.vent(STOLPE, 5000);
  t.sjekk(/midten|Dødt|likt/i.test(await stempel()), `Feil kommentar for 2 mot 2: ${await stempel()}`);
  t.sjekk(!(await t.finnes('[data-h="forsvar"]')), "Likt resultat har ikke noe mindretall som kan holde forsvarstale");

  // Back to home keeps the game: «Fortsett» is the main button, «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent(STOLPE);

  // «Er dere ikke 4?»: one more joined. Unanimous: 0 against 5
  await t.klikk('[data-h="neste"]', 800);
  await t.klikk('[data-h="velg"]', 50);
  await t.vent(TALL, 8000);
  t.sjekk(/Er dere ikke 4\?/.test(await t.tekst('[data-h="antall-ark"]')), "Mangler lenken for å endre hvor mange som stemmer");
  await t.klikk('[data-h="antall-ark"]');
  await t.klikk('#ark [data-h="antall-spill"][data-v="1"]');
  t.sjekk(/^5\b/.test((await t.tekst("#ark .teller output")).trim()) && (await t.antall(".vingle-tall button")) === 6, "Én spiller til ga ikke knappene 0–5");
  await t.bilde("hvor-mange-er-dere");
  await t.klikk('#ark [data-h="lukk-ark"]');
  s = await t.tilstand();
  t.sjekk(s.spill.antall === 5 && s.antall === 5, "Det nye antallet ble ikke husket");
  await t.klikk('.vingle-tall [data-v="0"]', 50);
  await t.vent(STOLPE, 5000);
  t.sjekk(/Enstemmig|Alle som én|enighet/i.test(await stempel()), "Feil kommentar for 0 mot 5");
  await t.sov(1100);
  await t.bilde("enstemmig");

  // From here on with reduced motion, so the countdowns and drum rolls are quick.
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  // The tenth dilemma is the last: «Til kåringen» comes by itself (no «Avslutt» needed)
  await settTilstand((st) => {
    st.spill.nr = 9;
  });
  await t.vent(STOLPE);
  t.sjekk((await t.finnes('.dokk .knapp[data-h="neste"]')) && !(await t.finnes('[data-h="til-kaaring"]')), "Det niende dilemmaet skal ha «Neste dilemma»");
  await t.klikk('[data-h="neste"]', 600);
  t.sjekk(/^Dilemma 10 av 10$/i.test(await topp()), `Toppfeltet viser «${await topp()}», ventet «Dilemma 10 av 10»`);
  await stem(4);
  t.sjekk((await t.tekst('.dokk .knapp[data-h="til-kaaring"]')).trim() === "Til kåringen" && !(await t.finnes('.dokk [data-h="neste"]')), "Etter det tiende dilemmaet skal hovedknappen være «Til kåringen»");
  t.sjekk((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte skal bare hete «Avslutt»");
  await t.sov(500);
  await t.bilde("siste-dilemma");
  await t.klikk('[data-h="til-kaaring"]');
  await t.vent("document.querySelector('.vingle-boks')");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await topp()), "Sluttskjermen skal hete «Kåringen»");
  await t.sov(600);
  await t.bilde("slutt", true);
  t.sjekk(/4 dilemmaer/.test(await t.tekst(".merker")) && /1 enstemmig\b/.test(await t.tekst(".merker")) && /2 delt på midten/.test(await t.tekst(".merker")), `Dommen teller feil: ${await t.tekst(".merker")}`);
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk(/mest uenige/i.test(await t.tekst("#skjerm")), "Dommen viser ikke dilemmaet dere var mest uenige om");
  s = await t.tilstand();
  t.sjekk(s._aktiv === false && s.spill.ferdig === true, "Et ferdig spill skal ikke være merket som pågående");
  const ferdig = await t.js(`window.Rusj._statKo.filter((h) => h.h === "ferdig").map((h) => h.d)`);
  t.sjekk(ferdig.length === 1 && ferdig[0].modus === "alle" && ferdig[0].dilemmaer === 4 && ferdig[0].imal === true, `Statistikken fikk ikke nøyaktig én «ferdig» (${JSON.stringify(ferdig)})`);
  t.sjekk((await kveldsspill()) === 0, "«Alle velger» rangerer ingen og skal ikke meldes til «Kveldens gjeng»");
  await t.js(`window.__delt = null; navigator.share = async (d) => { window.__delt = d; };`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt");
  t.sjekk(delt && /dommen over gjengen/.test(delt.text) && /% enige på 4 dilemmaer/.test(delt.text) && /Mest uenige om: «/.test(delt.text) && /\/vinglepetter\/$/.test(delt.url) && !/https?:/.test(delt.text), `«Del dommen» delte ikke dommen (${JSON.stringify(delt)})`);
  // Kåringen is final: back leads home, with nothing to continue
  await t.klikk("#tilbake");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && !(await t.finnes('[data-h="fortsett"]')), "Etter Kåringen skal hjem-skjermen ikke ha «Fortsett»");

  // Play again: a fresh game
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Start spill» etter Kåringen skal ikke spørre");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.vingle-kort')");
  s = await t.tilstand();
  t.sjekk(s.spill.nr === 1 && s.spill.logg.length === 0 && s.spill.antall === 5 && !s.spill.ferdig, "Et nytt spill startet ikke med blanke ark");

  // Without counting: countdown → a prompt to defend the choice → next. No length, no count.
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="telle"]');
  t.sjekk((await t.tilstand()).oppsett.telle === false, "«Tell stemmer» ble ikke skrudd av");
  t.sjekk(!(await t.finnes("#vingle-antall")) && !(await t.finnes('[data-h="lengde"]')), "Uten telling trengs verken antall spillere eller antall dilemmaer");
  await t.klikk('[data-h="start"]');
  await pause();
  t.sjekk(/^Dilemma 1$/i.test(await topp()), `Uten telling skal økten være fri («${await topp()}»)`);
  await t.klikk('[data-h="velg"]', 50);
  await t.vent("document.querySelector('.vingle-prompt')", 8000);
  t.sjekk(!(await t.finnes(".vingle-tall")), "Tallknappene vises selv om tellingen er av");
  await t.bilde("uten-telling");
  await t.klikk('[data-h="neste"]', 400);
  t.sjekk((await t.tilstand()).spill.fase === "les", "«Neste dilemma» ga ikke nytt kort");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk((await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", `Den som vil bli, skal trykke «Spill videre» («${await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')}»)`);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('[data-h=\"nytt\"]')");
  t.sjekk((await t.tilstand()).spill === null, "Spillet ble ikke avsluttet");

  // ---------- «I vinglestolen» with three players ----------
  const A = "Testspiller A";
  const B = "Testspiller B";
  const C = "Testspiller C";
  const ingenAvsloring = async (hvor) =>
    t.sjekk(!(await t.finnes(".vingle-halv.valgt, .vingle-halv.ikke, .vingle-valgt-merke, .vingle-dom")), `Det hemmelige valget vises på skjermen (${hvor})`);
  const HEMMELIG = "document.querySelector('button.vingle-halv[data-h=\"stol-velg\"]')";
  const FLERTALL = "document.querySelector('button.vingle-halv[data-h=\"flertall\"]')";
  const AVSLORT = "document.querySelector('.vingle-halv.valgt')";
  // One whole round with three or more players: secret choice, countdown, what most guessed.
  const stolrunde = async (valg, gjett) => {
    await t.vent(HEMMELIG);
    await t.klikk(`[data-h="stol-velg"][data-v="${valg}"]`);
    await t.klikk('[data-h="gjett"]', 50);
    await t.vent(FLERTALL, 8000);
    await t.klikk(`[data-h="flertall"][data-v="${gjett}"]`, 50);
    await t.vent(AVSLORT, 5000);
  };

  await t.start({ navn: [A, B, C] });
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="stol"]');
  t.sjekk((await t.antall(".spiller")) === 3, "«I vinglestolen» viser ikke gjengens tre spillere");
  t.sjekk(await t.finnes('[data-h="runder"][data-v="2"][aria-pressed="true"]'), "Tre spillere skal få to runder som forslag");
  t.sjekk(!(await t.finnes('[data-h="telle"]')), "«Tell stemmer» hører ikke hjemme i vinglestolen");
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.bilde("oppsett-stol", true);
  await t.klikk('[data-h="start"]');
  await t.vent(HEMMELIG);
  s = await t.tilstand();
  t.sjekk(s.spill.modus === "stol" && s.spill.antall === 3 && s.spill.runder === 1 && s.spill.start === 0 && s.spill.fase === "stol", `Spillet startet ikke i vinglestolen (${JSON.stringify({ m: s.spill.modus, n: s.spill.antall, r: s.spill.runder })})`);
  t.sjekk(/^Runde 1 av 3$/i.test(await topp()) && (await t.tekst("#skjerm h1")).trim() === A, `Første runde skal ha spiller A i stolen («${await topp()}», «${await t.tekst("#skjerm h1")}»)`);
  await enH1("stolen");
  t.sjekk((await t.antall('button.vingle-halv[data-h="stol-velg"]')) === 2, "Halvdelene av kortet er ikke knapper for den som sitter i stolen");
  await t.bilde("stol-velger");
  // «Bytt dilemma»: another card for the same player
  const kortFor = s.spill.kort;
  await t.klikk('[data-h="bytt"]', 500);
  s = await t.tilstand();
  t.sjekk(s.spill.kort !== kortFor && s.spill.nr === 1 && s.spill.fase === "stol", "«Bytt dilemma» ga ikke et nytt dilemma til samme spiller");
  // The secret choice: the phone only says «Valgt ✓» — also after a reload
  await t.klikk('[data-h="stol-velg"][data-v="b"]');
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "gjett" && s.spill.valg === "b", "Valget i stolen ble ikke husket");
  t.sjekk(/Valgt ✓/.test(await t.tekst(".vingle-valgt")), "Mobilen viser ikke «Valgt ✓»");
  await ingenAvsloring("etter valget");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.tilstand()).spill.fase === "gjett" && (await t.finnes('[data-h="gjett"]')), "Runden fortsatte ikke etter omlasting");
  await ingenAvsloring("etter omlasting");
  await t.bilde("stol-valgt");
  await t.klikk('[data-h="gjett"]', 50);
  await t.vent(FLERTALL, 8000);
  await ingenAvsloring("før flertallet er ført");
  t.sjekk(await t.finnes('[data-h="flertall"][data-v="delt"]'), "To som gjetter, kan være uenige: «Like mange på hver» mangler");
  await t.bilde("stol-flertall");
  await t.klikk('[data-h="flertall"][data-v="b"]', 50);
  await t.vent(AVSLORT, 5000);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "avslort" && s.spill.logg.length === 1 && s.spill.logg[0].i === 0, "Runden ble ikke ført");
  t.sjekk((await t.finnes(".vingle-halv.b.valgt")) && (await t.finnes(".vingle-halv.a.ikke")), "Den valgte halvdelen lyser ikke opp");
  t.sjekk((await t.tekst(".vingle-valgt-merke")).includes(A), "Kortet sier ikke hvem som valgte");
  t.sjekk(/Gjengen traff/i.test(await stempel()), `Riktig gjettet skal gi «Gjengen traff!» («${await stempel()}»)`);
  t.sjekk(await t.friForDokk(".vingle-dom"), "Avsløringen havner bak knappene nederst");
  await t.sov(700);
  await t.bilde("stol-avslort");
  // Wrong tap: «Endre» asks again
  await t.klikk('[data-h="endre-gjett"]');
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "flertall" && s.spill.logg.length === 0, "«Endre» tok ikke tilbake det som var ført");
  await t.klikk('[data-h="flertall"][data-v="delt"]', 50);
  await t.vent(AVSLORT, 5000);
  t.sjekk(/Delt gjeng/i.test(await stempel()), `Like mange på hver skal gi «Delt gjeng!» («${await stempel()}»)`);
  await t.klikk('[data-h="endre-gjett"]');
  await t.klikk('[data-h="flertall"][data-v="a"]', 50);
  await t.vent(AVSLORT, 5000);
  t.sjekk((await stempel()).toLowerCase().includes(`${A} lurte dere`.toLowerCase()), `Feil gjettet skal gi «… lurte dere!» («${await stempel()}»)`);
  t.sjekk((await t.tekst('.dokk .knapp[data-h="neste-stol"]')).trim() === `Neste: ${B} i stolen`, `Hovedknappen sier ikke hvem som er neste («${await t.tekst('.dokk .knapp[data-h="neste-stol"]')}»)`);
  await t.klikk('[data-h="neste-stol"]', 500);
  await t.vent(HEMMELIG);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === B && /^Runde 2 av 3$/i.test(await topp()), "Stolen gikk ikke videre til spiller B");
  await stolrunde("a", "a"); // B is guessed
  await t.klikk('[data-h="neste-stol"]', 500);
  await stolrunde("a", "b"); // C is not
  t.sjekk((await t.finnes('.dokk .knapp[data-h="til-kaaring"]')) && !(await t.finnes('[data-h="neste-stol"]')), "Etter siste runde skal hovedknappen være «Til kåringen»");
  await t.klikk('[data-h="til-kaaring"]');
  await t.vent("document.querySelector('.vingle-pris')");
  await t.sov(600);
  await t.bilde("slutt-stol", true);
  const priser = await t.js(`Array.from(document.querySelectorAll(".vingle-pris")).map((p) => p.innerText.replace(/\\s+/g, " "))`);
  t.sjekk(priser.length === 2 && /Åpen bok/i.test(priser[0]) && priser[0].includes(B) && /Mysteriet/i.test(priser[1]) && priser[1].includes(`${A} og ${C}`), `Kåringen i vinglestolen deler ikke ut riktige titler (${priser.join(" | ")})`);
  t.sjekk(/riktig 1 av 3 ganger/.test(await t.tekst(".banner")), `Banneret teller feil («${await t.tekst(".banner")}»)`);
  s = await t.tilstand();
  t.sjekk(s._aktiv === false && s.spill.ferdig === true && (await kveldsspill()) === 0, "Tre i vinglestolen rangeres ikke og skal ikke meldes til «Kveldens gjeng»");
  await t.js(`window.__delt = null; navigator.share = async (d) => { window.__delt = d; };`);
  await t.klikk('[data-h="del"]');
  const deltStol = await t.js("window.__delt");
  t.sjekk(deltStol && /I vinglestolen/.test(deltStol.text) && deltStol.text.includes(`Åpen bok 📖: ${B}`) && /\/vinglepetter\/$/.test(deltStol.url), `«Del kåringen» delte ikke titlene (${JSON.stringify(deltStol)})`);
  // «Spill igjen»: the chair starts one seat further round
  await t.klikk('[data-h="igjen"]');
  await t.vent(HEMMELIG);
  s = await t.tilstand();
  t.sjekk(s.spill.start === 1 && (await t.tekst("#skjerm h1")).trim() === B && s.spill.logg.length === 0, `Neste spill skal starte med spiller B i stolen («${await t.tekst("#skjerm h1")}»)`);

  // ---------- Two players: who knows the other best? ----------
  await t.start({ navn: [A, B] });
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="stol"]');
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent(HEMMELIG);
  await t.klikk('[data-h="stol-velg"][data-v="a"]');
  await t.vent(FLERTALL);
  s = await t.tilstand();
  t.sjekk(s.spill.fase === "flertall" && !(await t.finnes('[data-h="gjett"]')), "Med to spillere trengs ingen nedtelling: den andre gjetter med en gang");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === B && /gjette/i.test(await t.tekst(".vingle-stol .etikett")), "Skjermen sier ikke at det er den andres tur til å gjette");
  t.sjekk(!(await t.finnes('[data-h="flertall"][data-v="delt"]')), "Én som gjetter, kan ikke være delt");
  await ingenAvsloring("mens den andre gjetter");
  await t.bilde("to-gjetter");
  await t.klikk('[data-h="flertall"][data-v="a"]', 50);
  await t.vent(AVSLORT, 5000);
  t.sjekk((await stempel()).toLowerCase().includes(`${B} traff`.toLowerCase()), `Med to spillere skal stempelet si hvem som traff («${await stempel()}»)`);
  await t.klikk('[data-h="neste-stol"]', 500);
  await t.vent(HEMMELIG);
  await t.klikk('[data-h="stol-velg"][data-v="b"]');
  await t.vent(FLERTALL);
  await t.klikk('[data-h="flertall"][data-v="a"]', 50);
  await t.vent(AVSLORT, 5000);
  t.sjekk((await stempel()).toLowerCase().includes(`${B} lurte ${A}`.toLowerCase()), `Med to spillere skal stempelet si hvem som lurte hvem («${await stempel()}»)`);
  await t.klikk('[data-h="til-kaaring"]');
  await t.vent("document.querySelector('.poengliste')");
  await t.sov(600);
  await t.bilde("slutt-to", true);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === `${B} vinner!`, `Den som gjettet flest riktige, skal vinne («${await t.tekst("#skjerm h1")}»)`);
  t.sjekk((await kveldsspill()) === 1, "To spillere rangeres, og kåringen skal meldes til «Kveldens gjeng» én gang");

  // ---------- The Christmas pack: rusj.no/vinglepetter/#jul ----------
  await t.start();
  await t.lastSide(t.side + "#jul", "document.querySelector('[data-h=\"start\"]')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "oppsett" && s.oppsett.pakker.join() === "jul", `#jul valgte ikke bare julepakken (${s.skjerm}: ${s.oppsett.pakker})`);
  const iDag = new Date();
  const iSesong = iDag.getMonth() >= 10 || (iDag.getMonth() === 0 && iDag.getDate() <= 6);
  const pakker = await t.js(`Array.from(document.querySelectorAll('[data-h="pakke"]')).map((b) => b.dataset.v)`);
  t.sjekk(pakker.indexOf("jul") === (iSesong ? 0 : pakker.length - 1), `Julepakken står på feil plass (${pakker.join(", ")}; sesong: ${iSesong})`);
  const jul = await t.js(`(window.RUSJ_DATA.dilemmaer.pakker.find((p) => p.id === "jul") || { dilemmaer: [] }).dilemmaer.length`);
  t.sjekk(jul >= 50, `Julepakken skal ha minst 50 dilemmaer (har ${jul})`);
  await t.bilde("oppsett-jul", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.vingle-kort')");
  t.sjekk(/jul/i.test(await t.tekst(".storkort-etikett")), `Kortet kom ikke fra julepakken («${await t.tekst(".storkort-etikett")}»)`);
  await t.sov(400);
  await t.bilde("julekort");
  // A running game is left alone by the link
  await t.lastSide(t.side + "#jul", "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.spill && !s.spill.ferdig && s.skjerm === "kort", `#jul skal ikke rive med seg et spill som pågår (skjerm: ${s.skjerm})`);
  await t.send("Emulation.setEmulatedMedia", { features: [] });
}
