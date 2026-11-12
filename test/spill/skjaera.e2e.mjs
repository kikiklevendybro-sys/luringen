// Skjæra (Kim's game).
// Runs in every edition (node test/rusj-e2e.mjs --sprak en skjaera): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names and the links (t.forside, t.nokkel).
// 1 Levels alone: the map (levels 1, 4 and 7 open from the start), level 1 with a right answer, a
//   reload mid-round, a wrong answer, back + continue, back right after the last guess; the level
//   result with stars; a level where no option may lie on the board; a shuffled level with three stolen.
// 2 «Hvor langt kommer du?»: the board grows by one thing after a clean round, a miss costs a
//   feather and keeps the size, two things are stolen from nine; reload and back + continue; the
//   result with the record, sharing, the record on the home screen, «Avslutt».
// 3 Together, «Rop det ut!»: no options, the point moves when another name is tapped, «Ingen»,
//   first to three wins, the result goes to «Kveldens gjeng».
// 4 Together, turns: three players, a reload right after the last guess, «Avslutt» asks first; two
//   share the lead after the last round and play a tie-break (twice) until one of them wins.
// 5 The Christmas boards: offered in season only.
import { readFileSync } from "node:fs";

// The ordinary things come first in the game's list; the Christmas set has the numbers after them.
const VANLIGE = JSON.parse(readFileSync(new URL("../../rusj/spill/skjaera/data/ting.json", import.meta.url), "utf8")).temaer.reduce((n, tema) => n + tema.ting.length, 0);

export default async function (t) {
  const tatt = (b) => b.stjalet.map((p) => b.brett[p]);
  const tinger = (n) => `document.querySelectorAll('.skj-brett .skj-ting').length === ${n}`;
  const valg = "document.querySelector('.skj-valg:not(:disabled)')";
  const neste = "document.querySelector('[data-h=\"neste\"]')";
  const brettet = async () => (await t.tilstand()).spill.b;
  const brettTopp = () => t.js("Math.round(document.querySelector('.skj-brett').getBoundingClientRect().top + window.scrollY)");
  const rolig = (pa) => t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: pa ? "reduce" : "no-preference" }] });
  const kveld = () => t.js(`(JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "{}").spill || []).filter((s) => s.id === "skjaera")`);
  // The board never lies behind what is under the thumb (beside it on a phone on its side).
  const sjekkPlass = async (hvor) => t.sjekk(await t.friForDokk(".skj-brett", 2), `Brettet ligger bak knappene (${hvor})`);

  // A guess is done when a right thing has landed on the board, or a wrong one is marked.
  async function gjett(x, rett) {
    await t.klikk(`.skj-valg[data-v="${x}"]`, 60);
    await t.vent(rett ? `document.querySelector('.skj-brett .skj-ting[data-ting="${x}"]')` : `document.querySelector('.skj-valg.feil[data-v="${x}"]')`, 8000);
    await t.sov(120);
  }

  // One board: look, let the magpie steal, guess `rett` things right and the rest wrong.
  // lastPaNytt: reload the page right after the last guess – the round must come back answered.
  async function spillRunde(antallTing, rett, bildeNavn, lastPaNytt) {
    await t.vent(tinger(antallTing), 8000);
    await t.klikk('[data-h="klar"]', 200);
    await t.vent(valg, 15000);
    const b = await brettet();
    const riktige = tatt(b);
    const gale = b.valg.filter((x) => !riktige.includes(x));
    // No option may still lie on the board in plain sight (it never fooled anyone).
    t.sjekk(gale.every((x) => !b.brett.includes(x)), `Et galt svaralternativ ligger fortsatt på brettet (${antallTing} ting)`);
    for (let n = 0; n < riktige.length; n++) {
      const x = n < rett ? riktige[n] : gale[n];
      if (lastPaNytt && n === riktige.length - 1) {
        await t.klikk(`.skj-valg[data-v="${x}"]`, 30);
        await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
      } else await gjett(x, n < rett);
    }
    await t.vent(neste, 15000);
    if (bildeNavn) await t.bilde(bildeNavn);
    return b;
  }

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  t.sjekk(!(await t.finnes(".skj-rek")), "Hjem-skjermen viser en rekord før noen er satt");

  // ---------- 1 Levels alone ----------
  await t.klikk('[data-h="alene"]');
  await t.bilde("nivaer");
  t.sjekk((await t.antall('.skjerm-nivaer .flis')) === 2 && (await t.js(`document.querySelector('.flis[data-v="nivaer"]').getAttribute("aria-pressed")`)) === "true", "«Alene» mangler valget mellom nivåer og «Hvor langt kommer du?»");
  const apne = await t.js(`Array.from(document.querySelectorAll(".skj-niva")).filter((k) => !k.disabled).map((k) => Number(k.dataset.v)).join()`);
  t.sjekk(apne === "0,3,6", `Nivå 1, 4 og 7 skal være åpne fra start (åpne: ${apne})`);
  const radnavn = await t.js(`Array.from(document.querySelectorAll(".skj-rad-navn")).map((r) => r.textContent).join()`);
  t.sjekk(!t.norsk || radnavn === "Små,Større,Proff", `Nivåkartet mangler radene «Små», «Større» og «Proff» (${radnavn})`);
  // All twelve levels show above the button at first view on an ordinary phone.
  if ((await t.js("window.innerHeight")) >= 800) t.sjekk(await t.friForDokk('.skj-niva[data-v="11"]', 2), "Nivå 12 ligger bak knappen på nivåkartet");
  const navn1 = await t.js(`document.querySelector('.skj-niva[data-v="0"]').getAttribute("aria-label")`);
  t.sjekk(t.norsk ? /Nivå 1/.test(navn1) && /4 ting/.test(navn1) : /1\D+4/.test(navn1), `Navnet på nivåknappen inneholder ikke det som står på den («${navn1}»)`);
  await t.klikk('.skj-niva[data-v="0"]');
  await t.vent(tinger(4));
  await t.sov(900);
  await t.bilde("se-godt");
  await sjekkPlass("se godt");

  // The magpie steals
  await t.klikk('[data-h="klar"]', 620);
  await t.bilde("skjaera-stjeler");
  await t.vent(valg, 8000);
  await t.bilde("hva-tok-skjaera");
  await sjekkPlass("hva tok skjæra");
  let s = await t.tilstand();
  t.sjekk(s.spill.b.fase === "finn" && s.spill.b.stjalet.length === 1, "Skjæra stjal ikke én ting på nivå 1");
  // The button that was pressed is gone: focus is on the first option, not lost.
  t.sjekk(await t.js(`document.activeElement && document.activeElement.matches(".skj-valg")`), "Fokus er ikke på et svaralternativ etter at skjæra har stjålet");
  t.sjekk(await t.js(`document.querySelector(".skj-luker").getAttribute("role") === "group"`), "Forsøkene har navn uten rolle");

  // Reload mid-round: the gap and the options come back
  await t.lastSide(t.side, "document.querySelector('.skj-valg')");
  t.sjekk((await t.antall(".skj-rute.tom")) === 1, "Hullet på brettet forsvant etter omlasting");
  t.sjekk((await t.antall(".skj-valg")) === 4, "Valgene forsvant etter omlasting");

  // Right answer
  await gjett(tatt(s.spill.b)[0], true);
  await t.vent(neste, 8000);
  await t.bilde("riktig");
  t.sjekk((await t.tilstand()).spill.perfekte === 1, "Riktig svar ga ikke stjerne");
  t.sjekk(await t.js(`document.activeElement && document.activeElement.matches('[data-h="neste"]')`), "Fokus er ikke på «Neste runde» etter svaret");
  t.sjekk(!t.norsk || (await t.tekst('[data-h="neste"]')).trim() === "Neste runde", `Hovedknappen skal være ren tekst («${await t.tekst('[data-h="neste"]')}»)`);
  await t.klikk('[data-h="neste"]');

  // Round 2: wrong answer, the magpie brings it back
  await spillRunde(4, 0, "skjaera-lurte-deg");
  t.sjekk((await t.tilstand()).spill.perfekte === 1, "Feil svar skulle ikke gi stjerne");

  // Back to home and continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(neste);
  await t.klikk('[data-h="neste"]');

  // Round 3: right, and back at once (before the animation ends) – the round must still be
  // decided and shown as answered on «Fortsett», never a dead board.
  await t.vent(tinger(4), 8000);
  await t.klikk('[data-h="klar"]', 200);
  await t.vent(valg, 15000);
  const b3 = await brettet();
  await t.klikk(`.skj-valg[data-v="${tatt(b3)[0]}"]`, 30);
  await t.klikk("#tilbake");
  s = await t.tilstand();
  t.sjekk(s.spill.b.fase === "svar" && s.spill.perfekte === 2, "Runden ble ikke avgjort da man gikk tilbake rett etter siste svar");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(neste, 4000);
  t.sjekk((await t.antall(".skj-ting.var-tatt.funnet")) === 1, "Svaret vises ikke etter «Fortsett»");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.skjerm-nivaklart')");
  await t.sov(1400);
  await t.bilde("niva-klart");
  s = await t.tilstand();
  t.sjekk(s.stjerner[0] === 2, `Nivå 1 skulle gi 2 stjerner, ga ${s.stjerner[0]}`);
  t.sjekk(await t.js(`document.querySelector(".skj-store-stjerner").getAttribute("role") === "img"`), "Stjernene på resultatet har navn uten rolle");
  await t.klikk('.lenkerad [data-h="alene"]');
  t.sjekk(!(await t.js("document.querySelector('.skj-niva[data-v=\"1\"]').disabled")), "Nivå 2 ble ikke låst opp");

  // Level 4 (open from the start; it used to offer a thing that was still on the board)
  await t.klikk('.skj-niva[data-v="3"]');
  await spillRunde(8, 1, null);
  await t.klikk("#tilbake");

  // A shuffled level with three stolen things (level 11)
  await t.klikk('[data-h="alene"]');
  await t.js("Rusj.S.stjerner = [3, 3, 2, 3, 1, 3, 2, 3, 1, 2, 0, 0]; Rusj.vis()");
  await t.bilde("nivaer-mange", true);
  await t.klikk('.skj-niva[data-v="10"]');
  // The unfinished level is never thrown away without asking – and one player is asked as «du»
  t.sjekk(!t.norsk || /du holder på med/.test(await t.tekst("#ark")), "Spør ikke (eller ikke med «du») før nivået som pågår blir erstattet");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(tinger(16));
  await t.sov(1400);
  await t.bilde("niva-11-se");
  await sjekkPlass("nivå 11");
  await t.klikk('[data-h="klar"]', 200);
  await t.vent(valg, 15000);
  await t.bilde("niva-11-rotet");
  await sjekkPlass("nivå 11, svaralternativene");
  s = await t.tilstand();
  const b11 = s.spill.b;
  t.sjekk(b11.stjalet.length === 3 && b11.plass.join() !== b11.brett.map((x, p) => (b11.stjalet.includes(p) ? -1 : x)).join(), "Nivå 11 skulle stjele tre ting og stokke brettet");
  const r11 = tatt(b11);
  const g11 = b11.valg.filter((x) => !r11.includes(x));
  await gjett(r11[0], true);
  await t.bilde("niva-11-en-funnet");
  await gjett(g11[0], false);
  await gjett(g11[1], false);
  await t.vent(neste, 15000);
  await t.sov(300);
  await t.bilde("niva-11-svar");
  t.sjekk((await t.antall(".skj-ting.var-tatt")) === 3, "De tre stjålne tingene vises ikke etter svaret");

  // ---------- 2 «Hvor langt kommer du?» ----------
  await t.klikk("#tilbake");
  await t.klikk('[data-h="alene"]');
  await t.klikk('.flis[data-v="langt"]');
  await t.bilde("hvor-langt");
  t.sjekk(!t.norsk || /Ingen rekord/.test(await t.tekst(".skj-rekordlinje")), "«Hvor langt kommer du?» viser en rekord før noen er satt");
  await t.klikk('[data-h="langt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]'), "Spør ikke før nivået som pågår blir erstattet av et rekordforsøk");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(tinger(4));
  await t.sov(700);
  s = await t.tilstand();
  t.sjekk(s.spill.modus === "langt" && s.spill.fjaer === 3 && s.spill.b.brett.length === 4 && s.spill.b.stjalet.length === 1, "Rekordforsøket starter ikke med fire ting, én stjålet og tre fjær");
  t.sjekk((await t.antall(".skj-fjaer i:not(.brukt)")) === 3, "De tre fjærene vises ikke");
  await t.bilde("langt-se");
  await sjekkPlass("hvor langt, se godt");
  const toppLangt = await brettTopp();
  await spillRunde(4, 1, "langt-klart");
  await sjekkPlass("hvor langt, svaret");
  // What lies under the thumb keeps its height through the round: the board never jumps.
  t.sjekk(Math.abs((await brettTopp()) - toppLangt) <= 2, `Brettet flyttet seg da svaret kom (${toppLangt} → ${await brettTopp()})`);
  t.sjekk((t.norsk ? /Neste: 5 ting/ : /5/).test(await t.tekst(".skj-svar")), `Svaret sier ikke at neste brett har fem ting («${await t.tekst(".skj-svar")}»)`);
  await t.klikk('[data-h="neste"]');

  // The rest of the run without the flying (reduced motion): the same rules, a third of the time.
  await rolig(true);
  await spillRunde(5, 1);
  await t.klikk('[data-h="neste"]');
  // 6 things: reload mid-round
  await t.vent(tinger(6), 8000);
  await t.klikk('[data-h="klar"]', 200);
  await t.vent(valg, 15000);
  await t.lastSide(t.side, "document.querySelector('.skj-valg')");
  s = await t.tilstand();
  t.sjekk(s.spill.modus === "langt" && s.spill.b.brett.length === 6 && (await t.antall(".skj-rute.tom")) === 1, "Rekordforsøket kom ikke tilbake etter omlasting");
  await gjett(tatt(s.spill.b)[0], true);
  await t.vent(neste, 8000);
  await t.klikk('[data-h="neste"]');
  // 7 things: a miss costs a feather, and the next board is as big as this one
  await spillRunde(7, 0, "langt-fjaer");
  s = await t.tilstand();
  t.sjekk(s.spill.fjaer === 2 && s.spill.klart === 6, `Et bom skal koste én fjær og ikke telle (fjær ${s.spill.fjaer}, klart ${s.spill.klart})`);
  t.sjekk((await t.antall(".skj-fjaer i.brukt")) === 1 && (t.norsk ? /2 fjær igjen/ : /2/).test(await t.tekst(".skj-svar")), "Den tapte fjæra vises ikke");
  await t.klikk('[data-h="neste"]');
  await spillRunde(7, 1);
  await t.klikk('[data-h="neste"]');
  // 8 things: back to home and continue
  await t.vent(tinger(8), 8000);
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /8 ting/ : /8/).test(await t.tekst('[data-h="fortsett"]')), `«Fortsett» sier ikke hvor langt man er kommet («${await t.tekst('[data-h="fortsett"]')}»)`);
  await t.klikk('[data-h="fortsett"]');
  await spillRunde(8, 1);
  await t.klikk('[data-h="neste"]');
  // 9 things: two are stolen. Two misses end the run.
  const b9 = await spillRunde(9, 1);
  t.sjekk(b9.stjalet.length === 2, `Fra ni ting skal skjæra stjele to (stjal ${b9.stjalet.length})`);
  t.sjekk((!t.norsk || (await t.tekst('[data-h="neste"]')).trim() === "Neste brett") && (await t.finnes('.skj-dokk [data-h="avslutt"]')), "Mangler «Neste brett» og «Avslutt» mens forsøket pågår");
  await t.klikk('[data-h="neste"]');
  await spillRunde(9, 0);
  s = await t.tilstand();
  t.sjekk(s.spill.fjaer === 0 && (!t.norsk || (await t.tekst('[data-h="neste"]')).trim() === "Se resultatet") && !(await t.finnes('.skj-dokk [data-h="avslutt"]')), "Etter den tredje fjæra skal det bare stå «Se resultatet»");
  await rolig(false);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.skjerm-langtslutt')");
  await t.sov(900);
  await t.bilde("langt-resultat");
  await t.bilde("langt-resultat-hel", true);
  s = await t.tilstand();
  t.sjekk(s.langt.rekord === 8 && s.langt.spilt === 1 && s.spill.ferdig, `Rekorden skulle bli 8 ting (ble ${s.langt.rekord})`);
  t.sjekk((t.norsk ? /8 ting/ : /8/).test(await t.tekst("#skjerm h1")) && (await t.finnes(".skj-stempel")), "Resultatet viser ikke «8 ting!» og «Ny rekord!»");
  const toppTittel = (await t.tekst("#topp-tittel")).trim();
  t.sjekk(toppTittel !== "" && !/Kåringen/i.test(toppTittel), `Resultatet for én spiller heter «${toppTittel}»`);
  t.sjekk((!t.norsk || (await t.tekst('.dokk [data-h="langt"]')).trim() === "Spill igjen") && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Resultatet mangler «Spill igjen» og «Alle spill»");
  // Sharing: the text says how far, and links to the game
  await t.js(`navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && (t.norsk ? /8 ting/ : /8/).test(delt.text) && delt.url === (t.norsk ? "https://rusj.no/skjaera/" : `https://rusj.no${t.side.replace(/^https?:\/\/[^/]+/, "")}`), `«Del resultatet» delte ikke resultatet (${JSON.stringify(delt)})`);

  // The record is on the home screen, and starts a new run
  await t.klikk("#tilbake");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.skj-rek')");
  t.sjekk(t.norsk ? /Rekord/i.test(await t.tekst(".skj-rek")) && /8 ting/.test(await t.tekst(".skj-rek")) : /8/.test(await t.tekst(".skj-rek")), `Rekorden vises ikke på hjem-skjermen («${await t.tekst(".skj-rek")}»)`);
  await t.bilde("hjem-rekord");
  await t.klikk(".skj-rek");
  await t.vent(tinger(4), 8000);
  t.sjekk(/8/.test(await t.tekst(".skj-status-rek")), "Rekorden vises ikke under forsøket");
  // «Avslutt» asks first, and «Spill videre» stays
  await rolig(true);
  await spillRunde(4, 1);
  await t.klikk('.skj-dokk [data-h="avslutt"]');
  t.sjekk(!t.norsk || (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre" && (await t.tekst('#ark [data-h="ark-svar"][data-v="ja"]')).trim() === "Avslutt", "«Avslutt» spør ikke med «Avslutt» og «Spill videre»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.js("Rusj.S.skjerm")) === "brett" && !(await t.tilstand()).spill.ferdig, "«Spill videre» avsluttet forsøket");
  await t.klikk('.skj-dokk [data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-langtslutt')");
  await rolig(false);
  s = await t.tilstand();
  t.sjekk(s.langt.rekord === 8 && s.langt.spilt === 2 && !(await t.finnes(".skj-stempel")), "Et kortere forsøk skal ikke endre rekorden eller gi «Ny rekord!»");
  t.sjekk(t.norsk ? /4 ting/.test(await t.tekst("#skjerm h1")) && /4 ting unna/.test(await t.tekst(".skj-rekordlinje")) : /4/.test(await t.tekst("#skjerm h1")) && /4/.test(await t.tekst(".skj-rekordlinje")), `Resultatet sier ikke hvor langt unna rekorden det var («${await t.tekst(".skj-rekordlinje")}»)`);
  await t.bilde("langt-avsluttet");

  // ---------- 3 Together: «Rop det ut!» ----------
  await t.klikk("#tilbake");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="sammen"]');
  t.sjekk((await t.js(`document.querySelector('.flis[data-v="rop"]').getAttribute("aria-pressed")`)) === "true", "«Rop det ut!» er ikke valgt som standard");
  t.sjekk((await t.tekst('.dokk [data-h="start"]')).trim() === "Start", "Startknappen skal være ren tekst");
  await t.klikk('[data-h="runder"][data-v="3"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent(tinger(4), 8000);
  await t.sov(700);
  s = await t.tilstand();
  t.sjekk(s.spill.modus === "rop" && s.spill.mal === 3 && (await t.js("Rusj.S.skjerm")) === "brett", "«Rop det ut!» startet ikke rett på brettet");
  t.sjekk((await t.antall(".skj-poengrad li")) === 3, "Poengene til de tre spillerne vises ikke");
  await t.bilde("rop-se");
  await sjekkPlass("rop det ut, se godt");
  const toppRop = await brettTopp();
  await t.klikk('[data-h="klar"]', 200);
  await t.vent("document.querySelector('[data-h=\"vis\"]')", 15000);
  t.sjekk((await t.antall(".skj-valg")) === 0, "«Rop det ut!» viser svaralternativer");
  await t.bilde("rop-rop");
  await t.klikk('[data-h="vis"]');
  await t.vent("document.querySelector('.skj-hvem-valg')", 15000);
  await t.sov(300);
  await t.bilde("rop-hvem");
  await sjekkPlass("rop det ut, hvem ropte");
  t.sjekk(Math.abs((await brettTopp()) - toppRop) <= 2, `Brettet flyttet seg da navnene kom (${toppRop} → ${await brettTopp()})`);
  t.sjekk((await t.antall(".skj-hvem-valg")) === 4 && (await t.js(`document.querySelector('.skj-dokk [data-h="neste"]').disabled`)), "Velgeren skal ha tre navn og «Ingen», og «Neste brett» venter på et valg");
  t.sjekk((await t.antall(".skj-ting.var-tatt.her")) === 1 && (await t.antall(".skj-tok span")) === 1, "Det skjæra tok, vises ikke");
  // A tap on the wrong name is put right by tapping another: the point is not counted twice
  await t.klikk('.skj-hvem-valg[data-v="0"]');
  await t.klikk('.skj-hvem-valg[data-v="1"]');
  t.sjekk((await t.js(`Array.from(document.querySelectorAll('.skj-hvem-valg[aria-pressed="true"]')).map((k) => k.dataset.v).join()`)) === "1", "Poenget flyttet seg ikke til den andre spilleren");
  await t.lastSide(t.side, "document.querySelector('.skj-hvem-valg')");
  t.sjekk((await t.js(`document.querySelector('.skj-hvem-valg[aria-pressed="true"]')?.dataset.v`)) === "1", "Valget av hvem som ropte først, forsvant etter omlasting");
  await t.bilde("rop-valgt");
  await t.klikk('.skj-dokk [data-h="neste"]');
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join() === "0,1,0", `Poenget ble feil (${s.spill.poeng.join()})`);
  await rolig(true);
  async function rop(hvem) {
    await t.vent("document.querySelector('[data-h=\"klar\"]')", 8000);
    await t.klikk('[data-h="klar"]', 200);
    await t.vent("document.querySelector('[data-h=\"vis\"]')", 15000);
    await t.klikk('[data-h="vis"]');
    await t.vent("document.querySelector('.skj-hvem-valg')", 15000);
    await t.klikk(`.skj-hvem-valg[data-v="${hvem}"]`);
  }
  await rop(-1); // nobody
  await t.klikk('.skj-dokk [data-h="neste"]');
  t.sjekk((await t.tilstand()).spill.poeng.join() === "0,1,0", "«Ingen» ga noen et poeng");
  await rop(1);
  await t.klikk('.skj-dokk [data-h="neste"]');
  await rop(1);
  t.sjekk(!t.norsk || (await t.tekst('.skj-dokk [data-h="neste"]')).trim() === "Se vinneren", "Knappen sier ikke «Se vinneren» når noen når målet");
  await rolig(false);
  await t.klikk('.skj-dokk [data-h="neste"]');
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.bilde("rop-vinner", true);
  t.sjekk((t.norsk ? /Testspiller B vinner/ : /Testspiller B/).test(await t.tekst("#skjerm h1")), "Vinneren av «Rop det ut!» vises ikke");
  let k = await kveld();
  t.sjekk(k.length === 1 && k[0].resultat.length === 3 && k[0].resultat[0].plass === 1 && k[0].resultat.filter((r) => r.plass === 1).length === 1, `«Rop det ut!» ble ikke sendt til Kveldens gjeng (${JSON.stringify(k)})`);

  // Eight players: everyone can be picked, the board stays clear of the names, and «Avslutt»
  // counts the point that was chosen before it goes to the result.
  await t.klikk('.lenkerad [data-h="sammen"]');
  for (let n = 0; n < 5; n++) await t.klikk('[data-h="spiller-legg-til"]');
  await t.klikk('[data-h="start"]');
  await rolig(true);
  await rop(7);
  await rolig(false);
  await t.sov(300);
  t.sjekk((await t.antall(".skj-hvem-valg")) === 9 && (await t.antall(".skj-poengrad li")) === 8, "Åtte spillere får ikke plass i velgeren");
  await sjekkPlass("rop det ut, åtte spillere");
  t.sjekk(await t.js(`Array.from(document.querySelectorAll(".skj-hvem-valg")).every((k) => { const b = k.getBoundingClientRect(); return b.width >= 24 && b.height >= 24 && b.left >= 0 && b.right <= window.innerWidth; })`), "Navnene i velgeren er for små eller stikker utenfor");
  await t.bilde("rop-atte");
  await t.klikk('.skj-dokk [data-h="avslutt"]');
  t.sjekk(!t.norsk || (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "«Avslutt» i «Rop det ut!» spør ikke med «Spill videre»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.poeng.join("") === "00000001", `«Avslutt» talte ikke poenget som var valgt (${s.spill.poeng.join()})`);
  t.sjekk((await kveld()).length === 2, "Spillet som ble avsluttet, ble ikke sendt til Kveldens gjeng");

  // ---------- 4 Together: turns, and a tie-break ----------
  await t.klikk('.lenkerad [data-h="sammen"]');
  for (let n = 0; n < 5; n++) await t.klikk('[data-h="spiller-fjern"][data-v="3"]');
  await t.klikk('.flis[data-v="tur"]');
  await t.klikk('[data-h="vanskelighet"][data-v="lett"]');
  await t.klikk('[data-h="runder"][data-v="3"]');
  await t.bilde("oppsett-tur", true);
  await t.klikk('[data-h="start"]');
  const TING_PA_NIVA = [4, 6, 6, 8, 9, 9, 12, 12, 12, 16, 16, 20];
  for (let runde = 0; runde < 3; runde++) {
    for (let spiller = 0; spiller < 3; spiller++) {
      await t.vent("document.querySelector('[data-h=\"klar-spiller\"]')");
      if (runde === 0 && spiller === 0) await t.bilde("gi-mobilen");
      await t.klikk('[data-h="klar-spiller"]');
      if (runde === 0 && spiller === 1) await rolig(true);
      // Testspiller A and B find everything, Testspiller C nothing: A and B share the lead.
      await spillRunde(TING_PA_NIVA[runde], spiller < 2 ? 3 : 0, runde === 0 && spiller === 0 ? "svar-etter-tur" : null, runde === 1 && spiller === 0);
      if (runde === 1 && spiller === 0) {
        const p = (await t.tilstand()).spill.poeng;
        t.sjekk(p[0] === 2, `Poengene ble feil etter omlasting rett etter siste svar (${p.join(", ")})`);
      }
      await t.klikk('[data-h="neste"]');
    }
    if (runde < 2) {
      await t.vent("document.querySelector('[data-h=\"neste-runde\"]')");
      if (runde === 0) {
        await t.bilde("stilling");
        // «Avslutt» asks first; «Spill videre» stays in the game
        await t.klikk('.dokk [data-h="avslutt"]');
        t.sjekk(!t.norsk || (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "«Avslutt» mellom rundene spør ikke med «Spill videre»");
        await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
        t.sjekk((await t.js("Rusj.S.skjerm")) === "stilling", "«Spill videre» forlot stillingen");
      }
      await t.klikk('[data-h="neste-runde"]');
    }
  }
  // 3–3–0 after the last round: no shared win, but a tie-break for the two at the top
  await t.vent("document.querySelector('.skjerm-omkamp')", 8000);
  await t.sov(500);
  await t.bilde("omkamp");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join() === "3,3,0" && s.spill.omkamp === 1 && s.spill.ko.join() === "0,1" && !s.spill.ferdig, `Likt på topp ga ikke omkamp for de to (${JSON.stringify({ p: s.spill.poeng, o: s.spill.omkamp, ko: s.spill.ko })})`);
  t.sjekk(s.spill.b.niva === 4, `Omkampen skal være vanskeligere enn siste runde (nivå ${s.spill.b.niva + 1})`);
  t.sjekk((t.norsk ? /Testspiller A og Testspiller B/ : /Testspiller A.+Testspiller B/).test(await t.tekst(".banner .ingress")), "Omkampen sier ikke hvem som står likt");
  await t.klikk('[data-h="start-omkamp"]');
  // First tie-break: both find both things – still level. Second: A finds both, B nothing.
  for (const [omgang, treff] of [[1, [2, 2]], [2, [2, 0]]]) {
    for (let n = 0; n < 2; n++) {
      await t.vent("document.querySelector('[data-h=\"klar-spiller\"]')");
      t.sjekk(new RegExp(`Testspiller ${"AB"[n]}`).test(await t.tekst("#skjerm h1")), `Omkamp ${omgang}: feil spiller fikk mobilen («${await t.tekst("#skjerm h1")}»)`);
      if (omgang === 1 && n === 0) await t.bilde("omkamp-gi");
      await t.klikk('[data-h="klar-spiller"]');
      await spillRunde(TING_PA_NIVA[2 + 2 * omgang], treff[n]);
      await t.klikk('[data-h="neste"]');
    }
    if (omgang === 1) {
      await t.vent("document.querySelector('.skjerm-omkamp')", 8000);
      s = await t.tilstand();
      t.sjekk(s.spill.omkamp === 2 && s.spill.poeng.join() === "5,5,0" && s.spill.b.niva === 6, `Fortsatt likt skulle gi en ny og vanskeligere omkamp (${JSON.stringify({ p: s.spill.poeng, o: s.spill.omkamp, n: s.spill.b.niva })})`);
      await t.klikk('[data-h="start-omkamp"]');
    }
  }
  await rolig(false);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.bilde("vinner", true);
  s = await t.tilstand();
  t.sjekk(t.norsk ? /Testspiller A vinner/.test(await t.tekst("#skjerm h1")) && /omkampen/i.test(await t.tekst(".banner .etikett")) : /Testspiller A/.test(await t.tekst("#skjerm h1")), "Vinneren av omkampen vises ikke");
  t.sjekk(s.spill.poeng.join() === "7,5,0" && s.spill.ferdig, `Poengene etter omkampen ble feil (${s.spill.poeng.join()})`);
  k = await kveld();
  t.sjekk(k.length === 3 && k[2].resultat.map((r) => r.plass).join() === "1,2,3", `Resultatet etter omkampen ble ikke sendt til Kveldens gjeng med én vinner (${JSON.stringify(k[2])})`);
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Kåringen mangler «Alle spill»");

  // ---------- 5 Christmas boards, in season only ----------
  await t.klikk("#tilbake");
  await t.js(`Rusj.dag = () => ({ tekst: "2026-07-01", nr: 20635 }); Rusj.vis()`);
  t.sjekk(!(await t.finnes('[data-h="jul"]')), "Julebrettene tilbys midt på sommeren");
  await t.js(`Rusj.dag = () => ({ tekst: "2026-12-10", nr: 20797 }); Rusj.vis()`);
  t.sjekk(await t.finnes('[data-h="jul"]'), "Julebrettene tilbys ikke i desember");
  await t.klikk('[data-h="jul"]');
  await t.bilde("hjem-jul");
  await t.klikk('[data-h="alene"]');
  await t.klikk('.flis[data-v="nivaer"]');
  await t.klikk('.skj-niva[data-v="1"]');
  await t.vent(tinger(6), 8000);
  await t.sov(900);
  const jul = await brettet();
  t.sjekk(jul.brett.every((x) => x >= VANLIGE), `Julebrettet har andre ting enn julepynt (${jul.brett.join()})`);
  await t.bilde("jul-brett");
  // Out of season the switch is gone and the boards are ordinary again, whatever was chosen
  await t.klikk("#tilbake");
  await t.js(`Rusj.dag = () => ({ tekst: "2026-02-01", nr: 20485 }); Rusj.vis()`);
  await t.klikk('[data-h="alene"]');
  await t.klikk('.skj-niva[data-v="0"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(tinger(4), 8000);
  t.sjekk((await brettet()).brett.every((x) => x < VANLIGE), "Julebrett utenfor sesongen");
}
