// Ballongen: «Gjett sammen» (categories, a wrong letter pops a balloon, «Angre» blows it up again,
// all three hints, a real keyboard, reload mid-word, back + continue, a saved basket and a soft
// landing, «Kåringen»), «Mot hverandre» with three players (turns, points, the bonus, undo from the
// answer, the winner) and «Eget ord» (the hidden word, hold to peek, the writer's hint, guessing it).

// Runs in every edition (node test/rusj-e2e.mjs --sprak en ballongen): texts are checked in Norwegian
// only (t.norsk); the English keyboard is A–Z.
let ALFABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ".split("");
const stor = (o) => o.toLocaleUpperCase("nb");
const iOrdet = (o) => [...new Set(stor(o).replace(/[^A-ZÆØÅ]/g, "").split(""))];
const ikkeI = (o) => ALFABET.filter((b) => !stor(o).includes(b));
const feilAntall = (r) => r.gjettet.filter((b) => !stor(r.o).includes(b)).length;
// An element must be fully visible above the dock (short phones), measured from the top.
const overDokk = (sel) =>
  `(() => { window.scrollTo(0, 0); const e = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); const d = document.querySelector('#skjerm .dokk').getBoundingClientRect(); return e.bottom <= d.top + 4 || e.right <= d.left || e.left >= d.right; })()`;

async function gjett(t, b) {
  await t.klikk(`.bl-tast[data-h="bokstav"][data-v="${b}"]`, 40);
}
// Guess the letters that are still missing, until the word is found.
async function finnOrdet(t) {
  const r = (await t.tilstand()).spill.r;
  for (const b of iOrdet(r.o)) {
    if (r.gjettet.includes(b) || r.hintB === b) continue;
    if (await t.finnes(".bl-svar")) break;
    await gjett(t, b);
  }
  await t.vent("document.querySelector('.bl-svar')");
}
// Guess wrong letters until the basket lands.
async function landOrdet(t) {
  const r = (await t.tilstand()).spill.r;
  for (const b of ikkeI(r.o)) {
    if (await t.finnes(".bl-svar")) break;
    if (r.gjettet.includes(b)) continue;
    await gjett(t, b);
  }
  await t.vent("document.querySelector('.bl-svar')");
}

export default async function (t) {
  if (t.sprak === "en") ALFABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });

  // ---------- Setup: Gjett sammen, only animals, three words ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!t.norsk || /Hvordan vil dere spille\?/.test(await t.tekst("#skjerm")), "Oppsettet mangler overskriften over spillemåtene");
  t.sjekk((await t.antall('.fliser [data-h="modus"]')) === 3, "Oppsettet skal ha tre spillemåter");
  t.sjekk(!(await t.finnes("#spillerboks")), "«Gjett sammen» skal ikke vise spillerlista");
  await t.klikk('[data-h="kategorier"]');
  await t.klikk('#bl-kat [data-v="*"]');
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skal være av uten kategorier");
  await t.klikk('#bl-kat [data-v="dyr"]');
  await t.bilde("kategorier");
  await t.klikk('#ark [data-h="lukk-ark"]');
  t.sjekk(!t.norsk || /Dyr/.test(await t.tekst(".bl-katknapp")), "Kategoriknappen viser ikke valget");
  await t.klikk('[data-h="runder"][data-v="3"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.bl-tastatur')");
  await t.sov(400);
  await t.bilde("gjett");
  let s = await t.tilstand();
  t.sjekk(s.spill.r.k === "dyr" && s.spill.runder === 3 && s.spill.ballonger === 8, "Spillet startet med feil oppsett");
  t.sjekk((await t.antall(".bl-ballong")) === 8, "Det skal være åtte ballonger");
  t.sjekk(await t.js(overDokk(".bl-ord")), "Ordet skjules bak tastaturet");
  t.sjekk((await t.antall(".bl-ord .bl-rute:not(.tegn)")) === stor(s.spill.r.o).replace(/[^A-ZÆØÅ]/g, "").length, "Feil antall ruter for ordet");
  t.sjekk(!(await t.tekst("#skjerm")).includes(stor(s.spill.r.o)), "Ordet vises før det er gjettet");

  // A wrong letter pops a balloon; «Angre» blows it up again
  const ord1 = s.spill.r.o;
  const bom = ikkeI(ord1);
  await gjett(t, bom[0]);
  await t.sov(120);
  await t.bilde("pang");
  t.sjekk((await t.antall(".bl-ballong")) === 7, "En feil bokstav fikk ikke en ballong til å sprekke");
  t.sjekk((t.norsk ? /7 ballonger igjen/ : /7/).test(await t.tekst(".bl-igjen")), "Telleren viser ikke sju ballonger igjen");
  t.sjekk(await t.finnes(`.bl-tast.feil[data-v="${bom[0]}"][aria-disabled="true"]`), "Den feile bokstaven er ikke merket og låst");
  t.sjekk(await t.finnes('.dokk .lenkerad [data-h="angre"]'), "«Angre» vises ikke som lenke under tastaturet rett etter et trykk");
  await t.klikk('[data-h="angre"]');
  s = await t.tilstand();
  t.sjekk(s.spill.r.gjettet.length === 0 && (await t.antall(".bl-ballong")) === 8, "«Angre» ga ikke ballongen tilbake");
  // Only once per word: a new mis-tap can't be undone, and the link goes away
  await gjett(t, bom[1]);
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "«Angre» kan bare brukes én gang per ord");
  // Focus stays on a used key (it is aria-disabled, not disabled)
  await t.js(`document.querySelector('.bl-tast[data-v="${bom[2]}"]').focus()`);
  await t.klikk(`.bl-tast[data-h="bokstav"][data-v="${bom[2]}"]`, 60);
  t.sjekk(await t.js(`document.activeElement && document.activeElement.dataset.v === "${bom[2]}"`), "Fokus forsvant fra tasten etter trykket");

  // The hints: category, a word to think of, then a letter
  await t.klikk('[data-h="hint"]');
  t.sjekk(!t.norsk || /Dyr/.test(await t.tekst(".bl-hintrad")), "Første hint viser ikke kategorien");
  await t.klikk('[data-h="hint"]');
  t.sjekk((await t.antall(".bl-hintbrikke")) === 2 && (!t.norsk || /Tenk på/.test(await t.tekst(".bl-hintrad"))), "Andre hint viser ikke tipsordet");
  await t.klikk('[data-h="hint"]');
  s = await t.tilstand();
  t.sjekk(s.spill.r.hint === 3 && (s.spill.r.hintB || iOrdet(ord1).length <= 1), "Tredje hint viste ingen bokstav");
  t.sjekk(await t.finnes('[data-h="hint"][aria-disabled="true"]'), "Hint-knappen skal være av når hintene er brukt opp");
  await t.bilde("hint");

  // A real keyboard works too
  const riktig = iOrdet(ord1).find((b) => b !== s.spill.r.hintB);
  if (riktig) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: riktig.toLowerCase(), text: riktig.toLowerCase() });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: riktig.toLowerCase() });
    await t.sov(200);
    t.sjekk((await t.tilstand()).spill.r.gjettet.includes(riktig), "Tastaturet på maskinen gjettet ikke bokstaven");
  }

  // Reload mid-word: same word, same letters
  const for1 = (await t.tilstand()).spill.r;
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gjett" && s.spill.r.o === ord1 && s.spill.r.gjettet.join() === for1.gjettet.join(), "Ordet ble ikke gjenopptatt etter omlasting");
  // Back home and continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="fortsett"]'), "Mangler «Fortsett» mens et spill pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om «Avbryt» ble valgt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.bl-tastatur')");

  // Word 1 is saved
  await finnOrdet(t);
  await t.sov(1800);
  await t.bilde("reddet", true);
  t.sjekk(!t.norsk || /reddet/i.test(await t.tekst("#skjerm h1")), "Mangler «Reddet!» når ordet er funnet");
  t.sjekk((await t.tekst(".bl-ord")).replace(/\s/g, "") === stor(ord1).replace(/\s/g, ""), "Ordet vises ikke helt på svaret");

  // Word 2 lands softly
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.bl-tastatur')");
  s = await t.tilstand();
  t.sjekk(s.spill.nr === 1 && s.spill.r.o !== ord1, "Neste ord kom ikke");
  await landOrdet(t);
  await t.sov(1600);
  await t.bilde("landet", true);
  t.sjekk(!t.norsk || /myk landing/i.test(await t.tekst("#skjerm h1")), "Mangler «Myk landing» når ballongene er brukt opp");
  t.sjekk((await t.antall(".bl-rute.mistet")) > 0, "Bokstavene som manglet vises ikke når kurven lander");
  t.sjekk(await t.finnes(".bl-fallskjerm"), "Fallskjermen vises ikke");

  // Word 3, then «Kåringen»
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.bl-tastatur')");
  await finnOrdet(t);
  t.sjekk(await t.finnes('[data-h="neste"]') && (!t.norsk || /resultatet/i.test(await t.tekst('[data-h="neste"]'))), "Siste ord skal gå videre til resultatet");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.skjerm-slutt .banner')");
  await t.sov(400);
  await t.bilde("slutt-sammen", true);
  t.sjekk(!t.norsk || (await t.tekst("#topp-tittel")).trim().toLowerCase() === "kåringen", "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(/2 \S+ 3/i.test(await t.tekst(".banner")), "Kåringen viser ikke 2 av 3 reddet");
  t.sjekk((await t.antall(".bl-logg li")) === 3, "Ordlista på slutten mangler ord");
  t.sjekk(await t.finnes(".flere-spill") && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler andre spill eller «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Spillet regnes fortsatt som pågående på «Kåringen»");

  // ---------- Mot hverandre: three players take turns ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="tur"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  await t.klikk('[data-h="kategorier"]');
  await t.klikk('#bl-kat [data-v="*"]');
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="niva"][data-v="2"]');
  await t.bilde("oppsett-tur", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.bl-tastatur')");
  s = await t.tilstand();
  const forsteTur = s.spill.r.tur;
  t.sjekk(new RegExp(`Testspiller ${"ABC"[forsteTur]}`).test(await t.tekst(".bl-hvem")), "Skjermen viser ikke hvem sin tur det er");
  await t.bilde("tur");
  const ord2 = s.spill.r.o;
  const treff = iOrdet(ord2)[0];
  const antallTreff = stor(ord2).split(treff).length - 1;
  await gjett(t, treff);
  s = await t.tilstand();
  t.sjekk(s.spill.r.tur === (forsteTur + 1) % 3, "Turen gikk ikke videre etter en bokstav");
  t.sjekk(s.spill.r.hvem[0] === forsteTur, "Bokstaven ble ikke kreditert spilleren som hadde tur");
  // A wrong letter passes the turn as well
  await gjett(t, ikkeI(ord2)[0]);
  s = await t.tilstand();
  t.sjekk(s.spill.r.tur === (forsteTur + 2) % 3 && feilAntall(s.spill.r) === 1, "Feil bokstav ga ikke turen videre");
  await finnOrdet(t);
  s = await t.tilstand();
  const fullforte = s.spill.r.hvem[s.spill.r.hvem.length - 1];
  // «Angre» on the answer (right after the last tap) takes the last letter and the bonus back
  await t.klikk('[data-h="angre"]');
  s = await t.tilstand();
  t.sjekk(!s.spill.r.utfall && s.spill.r.tur === fullforte && (await t.finnes(".bl-tastatur")), "«Angre» på svaret tok ikke tilbake siste bokstav");
  await finnOrdet(t);
  t.sjekk((t.norsk ? /ekstra/ : /\+2/).test(await t.tekst(".bl-bonus")), "Bonusen for siste bokstav vises ikke");
  const r2 = (await t.tilstand()).spill.r;
  t.sjekk(await t.finnes(".poengliste .pluss"), "Poenglista viser ikke poengene for ordet");
  // The first player found «treff» (one point per time it shows) – plus the bonus if they also found the last letter
  const venterForste = antallTreff + (r2.hvem[r2.hvem.length - 1] === forsteTur ? 2 : 0) + r2.gjettet.slice(1).reduce((sum, b, n) => sum + (r2.hvem[n + 1] === forsteTur ? stor(ord2).split(b).length - 1 : 0), 0);
  const forstePoeng = await t.js(`(() => { const li = Array.from(document.querySelectorAll('.poengliste li')).find((l) => l.querySelector('.navn').textContent === 'Testspiller ${"ABC"[forsteTur]}'); return li ? Number(li.querySelector('.sum').textContent) : -1; })()`);
  t.sjekk(forstePoeng === venterForste, `Feil poeng til første spiller: ${forstePoeng}, ventet ${venterForste}`);
  await t.bilde("tur-svar", true);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.bl-tastatur')");
  t.sjekk((await t.tilstand()).spill.r.tur === ((await t.tilstand()).spill.start + 1) % 3, "Neste ord startet ikke med neste spiller");
  // End early from the next answer: the leader wins
  await finnOrdet(t);
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt .banner')");
  await t.sov(400);
  await t.bilde("slutt-tur", true);
  t.sjekk((t.norsk ? /vinner!/ : /Testspiller/).test(await t.tekst("#skjerm h1")), "Kåringen viser ingen vinner");
  t.sjekk(await t.finnes(".poengliste"), "Kåringen mangler poenglista");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "ballongen"), "Resultatet ble ikke lagt i «Kveldens gjeng»");
  // The kit may show its "install as app" tip after a finished game: close it
  await t.sov(2000);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Eget ord: two players ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="eget"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  await t.bilde("oppsett-eget", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Testspiller A skal lage det første ordet");
  await t.bilde("eget-gi");
  await t.klikk('[data-h="lag-ord"]');
  await t.vent("document.querySelector('.bl-utkast')");
  t.sjekk(await t.finnes('[data-h="ferdig"]:disabled'), "«Ferdig» skal være av før ordet har to bokstaver");
  for (const b of ["S", "O", "L"]) await t.klikk(`.bl-tast[data-h="skriv"][data-v="${b}"]`, 40);
  await t.klikk('.bl-tast[data-v="mellomrom"]', 40);
  await t.klikk('.bl-tast[data-v="E"]', 40);
  await t.klikk('.bl-tast[data-v="slett"]', 40);
  await t.klikk('.bl-tast[data-v="slett"]', 40);
  t.sjekk((await t.tilstand()).spill.utkast === "SOL", "Skrivingen ble ikke riktig (bokstaver, mellomrom og slett)");
  t.sjekk(!/SOL/.test(await t.tekst(".bl-utkast")), "Det hemmelige ordet vises uten at man holder på øyet");
  const slipp = await t.hold(".bl-oye", 500);
  t.sjekk(/S\s*O\s*L/.test(await t.tekst(".bl-utkast")), "Ordet vises ikke når man holder på øyet");
  await t.bilde("eget-titt");
  await slipp();
  t.sjekk(!/SOL/.test(await t.tekst(".bl-utkast")), "Ordet skjules ikke igjen når man slipper øyet");
  await t.klikk('[data-h="velg-hint"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="6"]');
  t.sjekk((await t.tilstand()).spill.ekat === "natur", "Hintet fra den som skriver ble ikke valgt");
  await t.bilde("eget-skriv");
  // Reload while writing: back to the gate, the draft is kept
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".skjerm-gi"), "Omlasting mens man skriver skal gå tilbake til «Gi mobilen til»");
  await t.klikk('[data-h="lag-ord"]');
  t.sjekk((await t.tilstand()).spill.utkast === "SOL", "Utkastet forsvant ved omlasting");
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.bl-tastatur')");
  t.sjekk((await t.antall(".bl-ord .bl-rute")) === 3 && !(await t.tekst(".bl-ord")).trim(), "Gjetterne ser ikke tre tomme ruter");
  t.sjekk(/Testspiller A/.test(await t.tekst(".bl-hvem")), "Gjetteskjermen viser ikke hvem som laget ordet");
  await t.klikk('[data-h="hint"]');
  t.sjekk((t.norsk ? /Natur og vær/ : /\S/).test(await t.tekst(".bl-hintrad")), "Hintet fra den som skrev vises ikke");
  await t.bilde("eget-gjett");
  await finnOrdet(t);
  t.sjekk((t.norsk ? /Neste: Testspiller B/ : /Testspiller B/).test(await t.tekst('[data-h="neste"]')), "Neste ord skal lages av Testspiller B");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  await t.klikk('[data-h="lag-ord"]');
  for (const b of t.sprak === "en" ? ["I", "V", "Y"] : ["Ø", "Y", "E"]) await t.klikk(`.bl-tast[data-h="skriv"][data-v="${b}"]`, 40);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.bl-tastatur')");
  await landOrdet(t);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.skjerm-slutt .banner')");
  await t.sov(300);
  await t.bilde("slutt-eget", true);
  t.sjekk(/1 \S+ 2/i.test(await t.tekst(".banner")), "Kåringen for «Eget ord» viser ikke 1 av 2");
  t.sjekk(/Sol/.test(await t.tekst(".bl-logg")) && /Testspiller B/.test(await t.tekst(".bl-logg")), "Ordlista viser ikke ordene og hvem som laget dem");
}
