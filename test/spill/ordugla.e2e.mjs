// Ordugla: an unfinished word from yesterday is dropped for today's word; invalid guesses (too
// short, not a word, the same word twice) shake and don't count; guesses typed on the screen and on
// a real keyboard; a reload keeps the typed letters; back + «Fortsett»; the right word wins (the
// streak goes on from yesterday) without the board moving, the result screen shows the numbers and
// the countdown and shares owls and moons through R.del (never the word, never coloured squares);
// home shows the countdown. Then practice: six wrong guesses show the word, «Gi opp» on the next
// one, and the rules explain rusj's own tile language (solid mint, yellow ring, flat and dim).
// Language-neutral (rusj/SPRAK.md): texts are checked only in Norwegian; the words come from the
// edition's own lists, and the keyboard is the edition's (English a–z, Danish … æ ø, Norwegian … ø æ).
export default async function (t) {
  const LAGER = t.nokkel("ordugla.v1");
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
    await t.vent(`(() => { const s = JSON.parse(localStorage.getItem("${LAGER}")); const sp = s[s.modus]; return sp.gjett.length === ${for_ + 1}; })()`, 4000);
    await t.vent(`!!document.querySelector('.ou-rad.na[data-rad="${for_ + 1}"]') || !!document.querySelector('.skjerm-resultat') || !!document.querySelector('.ou-tastatur.av')`, 6000);
    await t.sov(120);
  };
  const toast = () => t.js(`document.querySelector("#toast.vis") ? document.querySelector("#toast").textContent : ""`);
  // Messages on the board stand in the helper line under it, never in a toast on top of it.
  const varsel = () => t.js(`document.querySelector(".ou-hjelp .ou-varsel") ? document.querySelector(".ou-hjelp .ou-varsel").textContent : ""`);
  const brettTopp = () => t.js("Math.round(document.querySelector('.ou-brett').getBoundingClientRect().top)");
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
    S.dag = { nr: ${iDag - 2}, ord: RUSJ_DATA.svar.dagens[2], gjett: [RUSJ_DATA.svar.dagens[0]], rad: "", ferdig: false, vunnet: false };
    Rusj.lagre();
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.finnes('.hjem-knapper .knapp.stor[data-h="dag"]')) && (!t.norsk || (/Dagens ord/.test(await t.tekst('.hjem-knapper [data-h="dag"]')) && !/Fortsett/.test(await t.tekst(".hjem-knapper")))), "Et uferdig ord fra en annen dag skal ikke gi «Fortsett» i dag");
  // The edition's keyboard: English has no æ ø å; Danish ends its middle row in æ ø, Norwegian in ø æ.
  const midtrad = await t.js(`(() => { const r = document.querySelectorAll(".ou-tastrad"); return r.length ? Array.from(r[1].querySelectorAll(".ou-tast")).map((k) => k.dataset.v).join("") : ""; })()`);
  if (midtrad) t.sjekk(midtrad === { nb: "asdfghjkløæ", da: "asdfghjklæø", en: "asdfghjkl" }[t.sprak], `Feil tastatur for ${t.sprak}: ${midtrad}`);
  t.sjekk(/3/.test(await t.tekst(".merker")), "Rekka (3 dager på rad) vises ikke på hjem-skjermen");
  await t.bilde("hjem-rekke");

  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.ou-tastatur')");
  const tastene = await t.js(`Array.from(document.querySelectorAll(".ou-tast[data-v]")).map((k) => k.dataset.v).filter((v) => v.length === 1).join("")`);
  t.sjekk(tastene === { nb: "qwertyuiopåasdfghjkløæzxcvbnm", da: "qwertyuiopåasdfghjklæøzxcvbnm", en: "qwertyuiopasdfghjklzxcvbnm" }[t.sprak], `Feil tastatur for ${t.sprak}: ${tastene}`);
  let s = await tilstand();
  t.sjekk(s.dag.nr === iDag && s.dag.gjett.length === 0, "Dagens ord startet ikke på nytt");
  t.sjekk((await t.antall(".ou-rad")) === 6 && (await t.antall(".ou-rad .ou-rute")) === 30, "Brettet skal ha seks rader med fem ruter");
  const svar = s.dag.ord;
  t.sjekk(svar === (await t.js(`Rusj.app._dagensOrd(${iDag})`)), "Dagens ord kommer ikke fra den faste rekka");
  // Frozen daily order: these must never change (data/svar.json «dagens» is append-only).
  const forste = await t.js("Rusj.dag(new Date(Date.UTC(2026, 10, 9, 12))).nr");
  const fast = {
    nb: { 0: "glede", 1: "pizza", 2: "fjell", 3: "banan", 4: "sykle", 5: "kaffe", 6: "bjørn", 7: "hytte", 8: "gitar", 9: "jakke", 30: "langs", 100: "dusin", 364: "uenig" },
    en: { 0: "smile", 1: "pizza", 2: "beach", 3: "tiger", 4: "bread", 5: "cloud", 6: "house", 7: "happy", 8: "piano", 9: "lemon", 30: "solve", 100: "union", 364: "thick", 729: "grant" },
    da: { 0: "hygge", 1: "pizza", 2: "kaffe", 3: "bjørn", 4: "hytte", 5: "jakke", 6: "skole", 7: "tiger", 8: "frost", 9: "kanin", 30: "skade", 100: "fæste", 364: "lunge", 729: "tømme" },
  }[t.sprak];
  for (const [k, o] of Object.entries(fast)) {
    const fakt = await t.js(`Rusj.app._dagensOrd(${forste} + ${k})`);
    t.sjekk(fakt === o, `Dagens ord dag ${Number(k) + 1} skal være «${o}», er «${fakt}» – rekkefølgen er endret`);
  }
  await t.bilde("brett-tomt");

  // Too short, not a word, then deleting
  await skriv("kat");
  await t.klikk('.ou-tast[data-v="gjett"]', 80);
  t.sjekk(t.norsk ? /For få bokstaver/.test(await varsel()) : !!(await varsel()), "Mangler «For få bokstaver» i hjelpelinja");
  t.sjekk((await toast()) === "", "Meldinger på brettet skal ikke komme som toast");
  await skriv("qq");
  await t.klikk('.ou-tast[data-v="gjett"]', 80);
  t.sjekk(t.norsk ? /Ikke i ordlista/.test(await varsel()) : !!(await varsel()), "Mangler «Ikke i ordlista» i hjelpelinja");
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
  t.sjekk((await t.antall(".ou-hjelp .ou-forklaring i")) === 3, "Forklaringen av rutene vises ikke under brettet etter første forsøk");
  await pause();
  // The same word twice
  await skriv(ord1);
  await t.klikk('.ou-tast[data-v="gjett"]', 80);
  t.sjekk((t.norsk ? /prøvd/.test(await varsel()) : !!(await varsel())) && (await tilstand()).dag.gjett.length === 1, "Samme ord to ganger skal avvises");
  for (let i = 0; i < 5; i++) await t.klikk('.ou-tast[data-v="slett"]', 25);

  // A real keyboard: letters, Backspace and Enter
  await t.js("document.activeElement && document.activeElement.blur && document.activeElement.blur()");
  for (const b of ord2.slice(0, 4) + "x") await tast(b);
  await tast("Backspace");
  await tast(ord2[4]);
  await tast("x"); // a sixth letter is ignored
  await tast("Enter");
  await t.vent(`JSON.parse(localStorage.getItem("${LAGER}")).dag.gjett.length === 2`, 4000);
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
  t.sjekk((t.norsk ? /Fortsett dagens ord · 2\/6/ : /2\/6/).test(await t.tekst('.hjem-knapper [data-h="dag"]')), "Hjem viser ikke «Fortsett dagens ord · 2/6»");
  t.sjekk((await tilstand())._aktiv === true, "Et påbegynt dagens ord er ikke merket som pågående");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.ou-tastatur')");
  await pause();

  // The right word wins
  const toppFor = await brettTopp();
  await skriv(svar);
  await t.klikk('.ou-tast[data-v="gjett"]', 60);
  // The celebration: the keyboard rests in place, the praise stands in the helper line, nothing jumps.
  await t.vent("document.querySelector('.ou-tastatur.av')", 5000);
  t.sjekk(t.norsk ? /Kjempebra!/.test(await varsel()) : !!(await varsel()), `Rosen skal stå i hjelpelinja (${await varsel()})`);
  t.sjekk((await brettTopp()) === toppFor, `Brettet flyttet seg da ordet ble funnet (${toppFor} → ${await brettTopp()})`);
  await t.sov(700);
  await t.bilde("vunnet-brett");
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(600);
  s = await tilstand();
  t.sjekk(s.dag.ferdig && s.dag.vunnet, "Riktig ord ble ikke vunnet");
  const daglig = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").ordugla || null`);
  t.sjekk(daglig && daglig.nr === iDag && daglig.vunnet === true && daglig.rekke === 4, `R.dagligFerdig ble ikke kalt riktig: ${JSON.stringify(daglig)}`);
  t.sjekk(s.stat.spilt === 4 && s.stat.vunnet === 4 && s.stat.rekke === 4 && s.stat.best === 4 && s.stat.fordeling[2] === 2, `Statistikken er feil: ${JSON.stringify(s.stat)}`);
  t.sjekk(s._aktiv === false, "Et ferdig dagens ord skal ikke være merket som pågående");
  t.sjekk((t.norsk ? /Du fant ordet på 3 forsøk/ : /3/).test(await t.tekst("#skjerm h1")), `Feil overskrift: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".ou-mini .ou-rad")) === 3, "Forsøkene vises ikke på resultatet");
  t.sjekk((await t.antall(".skjerm-resultat .ou-tall > div")) === 4 && !(await t.finnes(".skjerm-resultat .ou-fordeling")), "Resultatet skal vise de fire tallene, og stolpene skal ligge i Statistikk-arket");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på resultatet");
  t.sjekk((await t.finnes('.dokk .knapp[data-h="del"]')) && (!t.norsk || (await t.tekst(".dokk .knapp")).trim() === "Del resultatet"), `Hovedknappen på dagens resultat skal være «Del resultatet» (${await t.tekst(".dokk .knapp")})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".skjerm-resultat .ou-nedtelling b")), "Nedtellingen (TT:MM:SS) mangler på resultatet");
  await t.bilde("resultat", true);
  await t.klikk('.ou-stat [data-h="statistikk"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .ou-fordeling li.na"), "Dagens antall forsøk er ikke uthevet i statistikken");
  await t.bilde("statistikk");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Share: owls and moons and the address through R.del – never the word, never coloured squares
  await t.js(`(() => {
    window.__delt = null;
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
  })()`);
  await t.klikk('[data-h="del"]', 300);
  const delt = await t.js("window.__delt");
  // The edition's name and address: «Ordugla nr. 4 · 3/6 · 🔥 4 på rad», «Word Owl #4 · 3/6 · 🔥 4 in a row» …
  const adresse = "https://rusj.no" + (await t.js("location.pathname")) + "#utfordring";
  const navn = await t.js("window.RUSJ_SPILL.navn");
  t.sjekk(delt && delt.startsWith(navn + " ") && /^[^\n]* · 3\/6 · 🔥 4 [^\n]+\n\n/.test(delt) && delt.endsWith("\n🦉🦉🦉🦉🦉\n\n" + adresse), `Delingsteksten er feil: ${delt}`);
  if (t.norsk) t.sjekk(delt && /^Ordugla nr\. \d+ · 3\/6 · 🔥 4 på rad\n\n/.test(delt) && /\n🦉🦉🦉🦉🦉\n\nhttps:\/\/rusj\.no\/ordugla\/#utfordring$/.test(delt), `Delingsteksten er feil: ${delt}`);
  const delRader = delt ? delt.split("\n").slice(2, 5) : [];
  t.sjekk(delRader.length === 3 && delRader.every((r) => /^(?:🦉|🌙|🌑){5}$/u.test(r)), `Delingsteksten skal ha tre rader med ugler og måner: ${delt}`);
  t.sjekk(delt && !/[🟩🟨🟧🟦⬛⬜]/u.test(delt), "Delingsteksten skal ikke bruke fargede firkanter");
  t.sjekk(delt && !delt.toLowerCase().includes(svar), "Delingsteksten røper ordet");
  t.sjekk(t.norsk ? /Kopiert/.test(await toast()) : !!(await toast()), "Mangler «Kopiert» etter deling");

  // Home: today's result and the countdown
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="se-resultat"]'), "Hjem viser ikke «Se dagens resultat»");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".ou-nedtelling b")), "Nedtellingen til neste ord vises ikke");
  t.sjekk(/4/.test(await t.tekst(".merker")), "Rekka på hjem-skjermen ble ikke 4");
  await t.bilde("hjem-ferdig");

  // A challenge link («Slå meg»: the shared address ends in #utfordring): a banner above the main
  // button on home, once – gone after leaving home and after a reload; the address is cleaned.
  await t.lastSide(t.side + "#utfordring", "document.querySelector('.hjem-knapper .utfordring')");
  const utf = await t.js(`(() => { const b = document.querySelector(".hjem-knapper .utfordring"); return { forst: b === document.querySelector(".hjem-knapper").firstElementChild, tekst: b.textContent.trim(), hash: location.hash }; })()`);
  t.sjekk(utf.forst && (!t.norsk || /Noen utfordret deg på dagens oppgave – klarer du det bedre\?/.test(utf.tekst)) && !!utf.tekst && utf.hash === "", `Utfordringsbanneret er feil: ${JSON.stringify(utf)}`);
  await t.bilde("hjem-utfordring");
  await pause();
  await t.klikk('[data-h="se-resultat"]');
  await pause();
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.hjem-knapper')");
  t.sjekk(!(await t.finnes(".utfordring")), "Utfordringsbanneret vises igjen etter at hjem-skjermen er forlatt");
  await t.lastSide(t.side, "document.querySelector('.hjem-knapper')");
  t.sjekk(!(await t.finnes(".utfordring")), "Utfordringsbanneret vises igjen etter omlasting");
  await t.klikk('[data-h="statistikk"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .ou-fordeling"), "Statistikken vises ikke");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="se-resultat"]');
  t.sjekk(await t.finnes(".skjerm-resultat"), "«Se dagens resultat» viser ikke resultatet");

  // Practice: six wrong words show the answer
  await t.klikk('.lenkerad [data-h="ov"]');
  await t.vent("document.querySelector('.ou-tastatur')");
  s = await tilstand();
  t.sjekk(s.modus === "ov" && s.ov && s.ov.ord !== svar, "Øving startet ikke med et annet ord enn dagens");
  if (t.norsk) t.sjekk(/ØVING|Øving/.test(await t.tekst("#topp-tittel")), "Øvingen er ikke merket «Øving»");
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

  // The rules explain rusj's own tile language: solid mint, a yellow ring on a dark tile, flat and dim
  await t.klikk("#reglerknapp");
  t.sjekk(!(await t.finnes('#ark [data-h="kontrast"]')), "Fargeblind-valget skal være borte (rutene skilles på form)");
  if (t.norsk) t.sjekk(/mintgrønn rute/.test(await t.tekst("#ark .steg")) && /Gul ring/.test(await t.tekst("#ark .steg")), "Reglene forklarer ikke rutene");
  // The examples use the edition's own words, with the marked letter in bold.
  const eks = await t.js(`Array.from(document.querySelectorAll("#ark .ou-eksempel")).map((e) => Array.from(e.querySelectorAll(".ou-rute")).map((r) => r.textContent).join("") + ":" + (e.querySelector("p b") || {}).textContent)`);
  t.sjekk(eks.join(" ") === { nb: "fjell:F glede:L bobil:I", en: "plant:P smile:M lunch:C", da: "fjeld:F glæde:L kanin:I" }[t.sprak], `Eksemplene i reglene er feil: ${eks.join(" ")}`);
  const stil = await t.js(`(() => {
    const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, p) : null; };
    const rett = cs("#ark .ou-eksempel .ou-rute.rett"), med = cs("#ark .ou-eksempel .ou-rute.med"), ring = cs("#ark .ou-eksempel .ou-rute.med", "::before"), ikke = cs("#ark .ou-eksempel .ou-rute.ikke");
    return rett && med && ring && ikke ? { rett: rett.backgroundColor, med: med.backgroundColor, ring: ring.borderTopColor, rund: ring.borderTopLeftRadius, bredde: parseFloat(ring.borderTopWidth), ikke: ikke.borderTopColor } : null;
  })()`);
  t.sjekk(stil && stil.rett === "rgb(61, 227, 176)", `Riktig plass skal være en hel mynterute: ${JSON.stringify(stil)}`);
  t.sjekk(stil && stil.ring === "rgb(255, 210, 63)" && stil.rund === "50%" && stil.bredde >= 3 && stil.med !== stil.ring, `Annet sted skal være en mørk rute med tykk gul ring: ${JSON.stringify(stil)}`);
  t.sjekk(stil && /rgba\(0, 0, 0, 0\)|transparent/.test(stil.ikke), `Finnes ikke skal være en flat rute uten kant: ${JSON.stringify(stil)}`);
  await t.bilde("regler");
  await t.js("document.querySelector('#ark .ou-eksempel').scrollIntoView({ block: 'start' })");
  await t.sov(200);
  await t.bilde("regler-eksempler");
  await t.klikk('#ark [data-h="lukk-ark"]');
}
