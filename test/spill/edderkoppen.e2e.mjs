// Edderkoppen: the daily grid (16 cells, the clock at 3:00, the grid clear of the dock); a word
// tapped letter by letter, one dragged with a finger and one typed on a keyboard are found (points,
// «Det ordet har du alt»); a two-letter word and a non-word are refused; a reload keeps the words
// and the time; back + «Fortsett dagens rutenett»; the time runs out → the result with every word,
// the day reported to the front page (points and stars, never a word), the sticker when the goal is
// reached, sharing without words; #dagens opens the result; free play stopped early with «Stopp
// klokka» and the «sist»/record line; two players together on one grid: the hand-over screen, a word
// both found is struck out at «Kåringen», the evening's scoreboard. Language-neutral (rusj/SPRAK.md).
export default async function (t) {
  const DAGLIG = t.nokkel("daglig");
  const tilstand = () => t.tilstand();
  const gang = async () => {
    const s = await tilstand();
    return s[s.modus];
  };
  const svar = (r) => t.js(`Rusj.app._svar(${JSON.stringify(r)})`);
  const sti = (r, ord) => t.js(`Rusj.app._motor.finnSti(${JSON.stringify(Array.from(r))}, ${JSON.stringify(ord)})`);
  // Tap the cells of a path one by one, then «Send».
  const trykkSti = async (celler) => {
    for (const c of celler) await t.js(`document.querySelector('.ed-celle[data-i="${c}"]').click()`);
    await t.sov(60);
    await t.klikk('.ed-knapper [data-h="send"]', 150);
  };
  // Drag a finger through the cells (pointer events at the cells' centres).
  const dra = async (celler) => {
    await t.js(`(() => {
      const midt = (i) => { const r = document.querySelector('.ed-celle[data-i="' + i + '"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
      const send = (type, i, mal) => { const [x, y] = midt(i); (mal || document.elementFromPoint(x, y)).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y, isPrimary: true })); };
      const celler = ${JSON.stringify(celler)};
      send("pointerdown", celler[0]);
      for (const i of celler.slice(1)) send("pointermove", i, document);
      send("pointerup", celler[celler.length - 1], document);
    })()`);
    await t.sov(200);
  };
  // Type on a real keyboard (key events on the page), then Enter.
  const tast = async (ord) => {
    for (const b of Array.from(ord)) {
      await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: b, text: b });
      await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: b });
    }
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await t.sov(200);
  };
  const dele = async (h) => {
    await t.js(`(() => {
      window.__delt = null;
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
    })()`);
    await t.klikk(`[data-h="${h}"]`, 500);
    return t.js("window.__delt");
  };
  const lukkArk = async () => {
    if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]', 300);
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const iDag = await t.js("Rusj.dag().nr");
  t.sjekk((await t.js("Rusj.app._motor.FORSTE")) === (await t.js("Rusj.dag(new Date(Date.UTC(2026, 10, 14, 12))).nr")), "Edderkoppen nr. 1 skal være 14. november 2026");
  t.sjekk(await t.finnes('.hjem-knapper .knapp.stor[data-h="dag"]') && (await t.finnes('[data-h="fri"]')) && (await t.finnes('[data-h="sammen"]')), "Hjem mangler dagens rutenett, fritt spill eller sammen");
  await t.bilde("hjem");

  // ---------- Today's grid ----------
  await t.klikk('[data-h="dag"]', 400);
  await t.vent("document.querySelectorAll('.ed-rute .ed-celle').length === 16");
  let g = await gang();
  t.sjekk(g.nr === iDag && g.funnet.length === 0 && g.igjen > 170000, "Dagens rutenett startet ikke på nytt med full tid");
  t.sjekk(!t.norsk || /^[23]:\d\d$/.test(await t.tekst(".ed-klokke b")), `Klokka viser ikke tre minutter: «${await t.tekst(".ed-klokke b")}»`);
  t.sjekk(await t.friForDokk(".ed-rute"), "Rutenettet ligger bak handlingsfeltet");
  await t.bilde("brett");
  const alle = await svar(g.r);
  t.sjekk(alle.length >= 40, `Dagens rutenett har bare ${alle.length} svar`);
  const kort = alle.filter((o) => Array.from(o).length <= 5);
  const [ord1, ord2, ord3] = kort;
  // Tap.
  await trykkSti(await sti(g.r, ord1));
  g = await gang();
  t.sjekk(g.funnet.includes(ord1), `«${ord1}» ble ikke funnet ved å trykke`);
  t.sjekk(!t.norsk || /\+1|\+2/.test(await t.tekst(".ed-hjelp")), "Ingen ros med poeng etter et ord");
  // The same again: refused.
  await trykkSti(await sti(g.r, ord1));
  t.sjekk(!t.norsk || /har du alt/.test(await t.tekst(".ed-hjelp")), "Et ord to ganger sier ikke «Det ordet har du alt»");
  t.sjekk((await gang()).funnet.length === 1, "Samme ord ble telt to ganger");
  // Two letters: too short.
  const p1 = await sti(g.r, ord1);
  await trykkSti(p1.slice(0, 2));
  t.sjekk(!t.norsk || /For kort/.test(await t.tekst(".ed-hjelp")), "To bokstaver sier ikke «For kort»");
  // Drag.
  await dra(await sti(g.r, ord2));
  t.sjekk((await gang()).funnet.includes(ord2), `«${ord2}» ble ikke funnet med fingeren`);
  await t.bilde("ord");
  // Keyboard.
  await tast(ord3);
  t.sjekk((await gang()).funnet.includes(ord3), `«${ord3}» ble ikke funnet med tastaturet`);
  // Typed letters that are not in the grid in that order.
  await tast("qqq");
  t.sjekk((await gang()).funnet.length === 3, "Et ord som ikke finnes, ble godtatt");
  // A reload keeps the words and the time.
  const forTid = (await gang()).igjen;
  await t.lastSide(t.side, "document.querySelector('.ed-rute')");
  g = await gang();
  t.sjekk(g.funnet.length === 3 && g.igjen <= forTid + 50 && g.igjen > 100000, "Ord eller tid forsvant ved omlasting");
  // Back home: «Fortsett dagens rutenett · m:ss».
  await t.klikk("#tilbake", 300);
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dag"]:not(.stor)'), "Hjem viser ikke «Fortsett dagens rutenett»");
  t.sjekk(!t.norsk || /Fortsett dagens rutenett · \d:\d\d/.test(await t.tekst('.hjem-knapper [data-h="dag"]')), "Fortsett-knappen viser ikke tiden som er igjen");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="dag"]', 300);
  await t.vent("document.querySelector('.ed-rute')");
  // The words sheet.
  await t.klikk('[data-h="ordene"]', 300);
  t.sjekk((await t.antall("#ark .ed-ordliste li")) === 3, "Ordarket viser ikke de tre ordene");
  await t.bilde("ordene", true);
  await lukkArk();

  // Enough words for the goal (put straight into the state), then the clock runs out.
  const poeng = (o) => [0, 0, 0, 1, 1, 2, 3, 5][Array.from(o).length] ?? 11;
  const maks = alle.reduce((s, o) => s + poeng(o), 0);
  const maal = Math.max(5, Math.round(maks * 0.2));
  const mer = [ord1, ord2, ord3];
  let p = mer.reduce((s, o) => s + poeng(o), 0);
  for (const o of alle) if (p < maal + 2 && !mer.includes(o)) (mer.push(o), (p += poeng(o)));
  await t.js(`(() => { const S = Rusj.S; S.dag.funnet = ${JSON.stringify(mer)}; S.dag.igjen = 1200; Rusj.lagre(); Rusj.vis(); })()`);
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(500);
  const s = await tilstand();
  t.sjekk(s.dag.ferdig && s.stat.spilt === 1 && s.stat.maal === 1 && s.stat.sistMaal === iDag, "Dagen ble ikke telt som nådd mål");
  const dag = await t.js(`JSON.parse(localStorage.getItem("${DAGLIG}") || "{}").edderkoppen || null`);
  t.sjekk(dag && dag.nr === iDag && dag.vunnet === true && /\d/.test(dag.res || "") && !mer.some((o) => (dag.res || "").includes(o)), `Forsiden fikk ikke beskjed om dagen: ${JSON.stringify(dag)}`);
  t.sjekk((await t.antall(".ed-ordene .ed-ordliste li")) === alle.length && (await t.antall(".ed-ordene .ed-ordliste li.glemt")) === alle.length - mer.length, "Resultatet viser ikke alle ordene med de funne merket");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(merker["seier-edderkoppen"], "Klistremerket for dagens mål ble ikke gitt");
  await t.bilde("resultat", true);
  const delt = await dele("del");
  t.sjekk(delt && /\d/.test(delt) && !mer.some((o) => new RegExp(`\\b${o}\\b`, "i").test(delt)), `Delingen røper ord eller mangler poeng: ${delt}`);
  await lukkArk();
  // #dagens opens the result; home says «Se dagens resultat».
  await t.lastSide(t.side + "#dagens", "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk(await t.finnes(".skjerm-resultat"), "#dagens åpner ikke resultatet når dagen er ferdig");
  await t.klikk("#tilbake", 300);
  t.sjekk(await t.finnes('[data-h="se-resultat"]'), "Hjem viser ikke «Se dagens resultat»");
  await t.bilde("hjem-ferdig");

  // ---------- Free play, stopped early ----------
  await t.klikk('[data-h="fri"]', 400);
  await t.vent("document.querySelector('.ed-rute')");
  g = await gang();
  t.sjekk((await tilstand()).modus === "fri" && g.r !== s.dag.r, "Fritt spill bruker dagens rutenett");
  const fri = await svar(g.r);
  await trykkSti(await sti(g.r, fri[0]));
  t.sjekk((await gang()).funnet.length === 1, "Ordet i fritt spill ble ikke funnet");
  await t.klikk('[data-h="stopp"]', 300);
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]', 300);
  t.sjekk(!(await gang()).ferdig, "«Spill videre» stoppet runden");
  await t.klikk('[data-h="stopp"]', 300);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 300);
  await t.vent("document.querySelector('.skjerm-resultat')", 5000);
  const fr = (await tilstand()).fritt;
  t.sjekk(fr.spilt === 1 && fr.sist === poeng(fri[0]) && fr.best === fr.sist, `Fritt spill ble ikke registrert: ${JSON.stringify(fr)}`);
  await t.bilde("fritt-resultat");
  await t.klikk("#tilbake", 300);
  t.sjekk(await t.finnes(".ed-sist"), "Hjem viser ikke «sist»-linja for fritt spill");

  // ---------- Two players together ----------
  await t.klikk('[data-h="sammen"]', 300);
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  t.sjekk(await t.finnes('[data-h="stryk"][aria-pressed="true"]'), "«Like ord strykes» er ikke på som standard");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start-sammen"]', 400);
  await t.vent("document.querySelector('.gi-til')");
  await t.bilde("gi-til");
  await t.klikk('.dokk [data-h="klar"]', 400);
  await t.vent("document.querySelector('.ed-rute')");
  g = await gang();
  const felles = await svar(g.r);
  await trykkSti(await sti(g.r, felles[0]));
  await trykkSti(await sti(g.r, felles[1]));
  t.sjekk((await gang()).funnet[0].length === 2, "Spiller 1 fikk ikke to ord");
  await t.bilde("sammen-brett");
  await t.js(`(() => { Rusj.S.sammen.igjen = 600; })()`);
  await t.vent("document.querySelector('.gi-til')", 6000);
  g = await gang();
  t.sjekk(g.tur === 1 && g.fase === "gi", "Turen gikk ikke videre til spiller 2");
  // A reload on the hand-over screen keeps it.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".gi-til"), "Omlasting mellom turene mistet overleveringen");
  await t.klikk('.dokk [data-h="klar"]', 400);
  await t.vent("document.querySelector('.ed-rute')");
  t.sjekk((await t.antall(".ed-celle.valgt")) === 0 && (await gang()).funnet[1].length === 0, "Spiller 2 ser spiller 1 sine ord");
  await trykkSti(await sti(g.r, felles[0]));
  await trykkSti(await sti(g.r, felles[2]));
  await t.js(`(() => { Rusj.S.sammen.igjen = 600; })()`);
  await t.vent("document.querySelector('.skjerm-kaaring')", 6000);
  await t.sov(400);
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk((await t.antall(".ed-spiller .ed-ordliste li.ut")) === 2, "Ordet begge fant, er ikke strøket hos begge");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "edderkoppen"), "Kåringen ble ikke registrert i Kveldens gjeng");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Kåringen mangler «Alle spill»");
  await t.bilde("kaaringen", true);
  const deltS = await dele("del-sammen");
  t.sjekk(deltS && /\d/.test(deltS), "Delingen etter sammen-spillet mangler poeng");
  await lukkArk();
  // Again with the same players.
  await t.klikk('.dokk [data-h="igjen-sammen"]', 400);
  t.sjekk(await t.finnes(".gi-til") && (await gang()).tur === 0, "«Spill igjen» starter ikke en ny runde sammen");
}
