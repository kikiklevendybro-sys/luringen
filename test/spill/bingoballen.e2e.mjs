// Bingoballen: number bingo with a second, separate browser as a player: the player joins with the
// link and gets a card with a four-digit number; the host draws balls (with undo, a reload, back +
// continue and one automatic draw), the player marks them and calls BINGO, the host checks a wrong
// number, a card without bingo and the player's card, approves it, plays on for two rows and ends
// at «Kåringen». The card is locked to the phone: leaving and joining again (link or typed code)
// gives the same card. Then party bingo: the host's own card, a full row, and a full card.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en bingoballen): the texts are checked in
// Norwegian only (t.norsk); elsewhere the numbers, the state and the links (t.forside, t.nokkel).
import { startChrome } from "../chrome.mjs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

const argBilder = process.argv.indexOf("--bilder");
const BILDER = join(resolve(argBilder > 0 ? process.argv[argBilder + 1] : join(tmpdir(), "rusj-e2e")), "bingoballen");

// The card must sit above the BINGO button (also on small phones).
const overDokken = (c, sel) =>
  c.js(`(() => {
    window.scrollTo(0, 0);
    const el = document.querySelector(${JSON.stringify(sel)});
    const dokk = document.querySelector("#skjerm .dokk");
    if (!el || !dokk) return true;
    // Like t.friForDokk: on a landscape phone the dock may stand beside the content instead of under it
    const a = el.getBoundingClientRect();
    const d = dokk.getBoundingClientRect();
    if (a.right <= d.left + 1 || a.left >= d.right - 1) return a.bottom <= window.innerHeight + 1;
    return a.bottom <= d.top + 1;
  })()`);

async function ja(c) {
  await c.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"ja\"]')");
  await c.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
}

const gjest = (c, nokkel) => c.js(`JSON.parse(localStorage.getItem("${nokkel}") || "null")`);

export default async function (t) {
  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  t.sjekk(await t.finnes('[data-h="bli-med"]'), "Mangler «Bli med i et spill» på hjem-skjermen");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.skjerm-oppsett')");
  await t.klikk('[data-h="modus"][data-v="fest"]');
  t.sjekk((await t.antall('[data-h="tema"]')) >= 6, "Festbingo viser ikke temaene");
  await t.bilde("oppsett-fest", true);
  await t.klikk('[data-h="modus"][data-v="tall"]');
  await t.bilde("oppsett-tall");

  // ---------- Number bingo ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#bb-kode')");
  let S = await t.tilstand();
  const kode = S.spill.kode;
  t.sjekk(/^[0-9A-Z]{8}$/.test(kode), `Koden skal ha 8 tegn (to kontrolltegn): ${kode}`);
  t.sjekk((await t.tekst("#bb-kode")).replace(/\s/g, "") === kode, "Koden på skjermen stemmer ikke");
  t.sjekk(await t.finnes(".bb-kodekort .qr svg"), "QR-koden mangler");
  await t.bilde("kode", true);

  const [bredde, hoyde] = await t.js("[window.innerWidth, window.innerHeight]");
  const c2 = await startChrome({ bredde, hoyde });
  mkdirSync(BILDER, { recursive: true });
  let nr = 0;
  const bilde2 = async (navn) => {
    await c2.sov(350);
    const bred = await c2.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Sidelengs scrolling på spillerens «${navn}»`);
    await c2.skjermbilde(join(BILDER, `g${++nr}-${navn}.png`));
  };
  try {
    await c2.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await c2.js(`localStorage.setItem("rusj.felles", JSON.stringify({ lyd: false, navn: [] }))`);
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${kode}`, "document.querySelector('.skjerm-brett')");
    const g = (await gjest(c2, t.nokkel("bingoballen.v1"))).gjest;
    t.sjekk(g.nr >= 100000 && g.nr <= 999999, `Brettnummeret skal ha seks sifre: ${g.nr}`);
    t.sjekk((await c2.tekst("#skjerm h1")).includes(String(g.nr)), "Brettnummeret står ikke øverst");
    t.sjekk((await c2.antall(".bb-brett.fem .bb-rute")) === 25, "Tallbrettet har ikke 25 ruter");
    t.sjekk(await c2.finnes('[data-h="bingo"]:disabled'), "BINGO kan trykkes uten en hel rekke");
    t.sjekk(await overDokken(c2, ".bb-brett"), "Brettet ligger bak BINGO-knappen");
    await bilde2("brett");
    const celler = await c2.js(`Array.from(document.querySelectorAll('.bb-brett .bb-rute')).map((r) => Number(r.textContent) || 0)`);
    const midt = [10, 11, 13, 14].map((i) => celler[i]);

    // The host's draw: the player's middle row comes first (the order is stored in the game)
    S = await t.tilstand();
    const rekke = [...midt, ...S.spill.rekke.filter((x) => !midt.includes(x))];
    await t.js(`(() => { const k = "${t.nokkel("bingoballen.v1")}"; const s = JSON.parse(localStorage.getItem(k)); s.spill.rekke = ${JSON.stringify(rekke)}; localStorage.setItem(k, JSON.stringify(s)); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    if (!(await t.finnes(".skjerm-kode"))) await t.klikk('[data-h="fortsett"]');
    await t.klikk('[data-h="til-trekk"]');
    await t.vent("document.querySelector('.skjerm-trekk')");
    await t.bilde("trekk-tom");
    await t.klikk('[data-h="trekk"]', 250);
    await t.vent("document.querySelector('.bb-ball.stor')");
    t.sjekk((await t.tilstand()).spill.trukket === 1, "Første ball ble ikke trukket");
    t.sjekk((await t.tekst(".bb-ball.stor")).includes(String(midt[0])), "Ballen viser ikke tallet som ble trukket");
    await t.sov(600);
    await t.bilde("trekk");
    // A quick double tap draws only one ball
    await t.klikk('[data-h="trekk"]', 90);
    await t.klikk('[data-h="trekk"]', 850);
    t.sjekk((await t.tilstand()).spill.trukket === 2, "Et dobbelttrykk trakk to baller");
    // Undo a ball drawn by mistake
    await t.klikk('[data-h="angre"]');
    t.sjekk((await t.tilstand()).spill.trukket === 1, "«Angre ball» la ikke ballen tilbake");
    for (let i = 0; i < 3; i++) await t.klikk('[data-h="trekk"]', 850);
    t.sjekk((await t.tilstand()).spill.trukket === 4, "Feil antall baller etter fire trekk");
    // A reload keeps the draw; back + «Fortsett» returns to it
    await t.lastSide(t.side, "document.querySelector('.skjerm-trekk')");
    t.sjekk((await t.tilstand()).spill.trukket === 4, "Trekningen ble borte etter omlasting");
    await t.klikk("#tilbake");
    t.sjekk((t.norsk ? /4 av 75/ : /4\D+75/).test(await t.tekst('[data-h="fortsett"]')), "«Fortsett» viser ikke antall baller");
    await t.klikk('[data-h="fortsett"]');
    await t.vent("document.querySelector('.skjerm-trekk')");
    await t.bilde("tavla", true);

    // The player marks the four numbers and calls BINGO
    for (const x of midt) {
      const i = celler.indexOf(x);
      await c2.klikk(`[data-h="merk"][data-v="${i}"]`, 120);
    }
    t.sjekk(!(await c2.finnes('[data-h="bingo"]:disabled')), "BINGO er ikke klar etter en hel rekke");
    t.sjekk((await c2.antall(".bb-rute.linje")) === 5, "Den hele rekka er ikke markert");
    await bilde2("rekke");
    await c2.klikk('[data-h="bingo"]');
    await c2.vent("document.querySelector('#ark:not([hidden]) .bb-ark-nr')");
    t.sjekk((await c2.tekst(".bb-ark-nr")).includes(String(g.nr)), "BINGO-arket viser ikke brettnummeret");
    await bilde2("bingo-ark");
    await c2.klikk('#ark [data-h="lukk-ark"]');
    // Unmark and mark again (a mis-tap)
    await c2.klikk(`[data-h="merk"][data-v="${celler.indexOf(midt[0])}"]`);
    t.sjekk(await c2.finnes('[data-h="bingo"]:disabled'), "BINGO er fortsatt klar etter at en rute ble avmerket");
    await c2.klikk(`[data-h="merk"][data-v="${celler.indexOf(midt[0])}"]`);

    // The host checks: a typo, a card without bingo, then the player's card
    await t.klikk('[data-h="til-sjekk"]');
    await t.vent("document.querySelector('#bb-sjekknr')");
    await t.skrivInn("#bb-sjekknr", "12");
    await t.klikk('.bb-sjekkskjema button[type="submit"]');
    t.sjekk((await t.tekst("#bb-sjekkfeil")).length > 5, "Et for kort brettnummer ga ingen melding");
    const annet = g.nr === 999999 ? 100000 : g.nr + 1;
    await t.skrivInn("#bb-sjekknr", String(annet));
    await t.klikk('.bb-sjekkskjema button[type="submit"]');
    await t.vent("document.querySelector('.bb-svar')");
    const annetOk = (await t.tilstand()).spill.sjekk.ok;
    if (!annetOk) {
      t.sjekk(!t.norsk || /mangler/.test(await t.tekst(".bb-svar")), "«Ikke ennå» sier ikke hva som mangler");
      t.sjekk(!t.norsk || /Ikke bingo/.test(await t.tekst("#skjerm h1")), "Overskriften sier ikke «Ikke bingo ennå»");
      await t.bilde("sjekk-nei");
    }
    await t.klikk('[data-h="ny-sjekk"]');
    await t.skrivInn("#bb-sjekknr", String(g.nr));
    await t.klikk('.bb-sjekkskjema button[type="submit"]');
    await t.vent("document.querySelector('.bb-svar.ok')");
    t.sjekk((await t.antall(".bb-kort-ramme .bb-rute.linje")) === 5, "Vertens sjekk viser ikke rekka");
    t.sjekk((await t.tekst("#skjerm h1")).includes(t.norsk ? `Brett ${g.nr} har bingo` : String(g.nr)), "Overskriften sier ikke at brettet har bingo");
    await t.sov(400);
    await t.bilde("sjekk-bingo", true);
    await t.klikk('[data-h="godkjenn"]');
    S = await t.tilstand();
    t.sjekk(S.spill.vinnere.length === 1 && S.spill.vinnere[0].nr === g.nr, "Vinneren ble ikke registrert");
    // Undo the approval, approve again
    await t.klikk('[data-h="angre-godkjenn"]');
    t.sjekk((await t.tilstand()).spill.vinnere.length === 0, "«Angre» tok ikke bort vinneren");
    await t.klikk('[data-h="godkjenn"]');
    t.sjekk((await t.tekst("#skjerm h1")).includes(t.norsk ? `Brett ${g.nr} vinner` : String(g.nr)), "Overskriften sier ikke at brettet vinner");
    t.sjekk(!t.norsk || /^Avslutt$/.test((await t.tekst('.dokk [data-h="avslutt"]')).trim()), "Lenken heter ikke bare «Avslutt»");
    await t.bilde("godkjent");
    await t.klikk('[data-h="neste-maal"]');
    await t.vent("document.querySelector('.skjerm-trekk')");
    t.sjekk((await t.tilstand()).spill.maal === "to", "Spillet gikk ikke videre til to rekker");

    // One automatic draw
    await t.klikk('[data-h="auto-veksle"]');
    const for_ = (await t.tilstand()).spill.trukket;
    await t.sov(10600);
    t.sjekk((await t.tilstand()).spill.trukket === for_ + 1, "Automatisk trekning trakk ikke en ball");
    await t.klikk('[data-h="auto-veksle"]');
    t.sjekk((await t.tilstand()).spill.auto === false, "Pause stoppet ikke den automatiske trekningen");

    // The card is locked to the phone: leave and join again
    await c2.klikk('[data-h="forlat"]');
    await ja(c2);
    await c2.vent("document.querySelector('.skjerm-hjem')");
    await c2.lastSide("about:blank");
    await c2.lastSide(`${t.side}#${kode}`, "document.querySelector('.skjerm-brett')");
    t.sjekk((await gjest(c2, t.nokkel("bingoballen.v1"))).gjest.nr === g.nr, "Samme kode på nytt ga et annet brett");
    await c2.klikk("#tilbake");
    await c2.klikk('[data-h="bli-med"]');
    await c2.skrivInn("#kodefelt", "abcd efgh");
    await c2.klikk('button[type="submit"]');
    t.sjekk((await c2.tekst("#kodefeil")).length > 5, "Feil kode ga ingen feilmelding");
    await bilde2("feil-kode");
    await c2.skrivInn("#kodefelt", kode.toLowerCase().replace(/(.{4})/, "$1-"));
    await c2.klikk('button[type="submit"]');
    await c2.vent("document.querySelector('.skjerm-brett')");
    t.sjekk((await gjest(c2, t.nokkel("bingoballen.v1"))).gjest.nr === g.nr, "Koden skrevet inn ga et annet brett");
    if (c2.feil.length) c2.feil.forEach((f) => t.feil(`Spillerens mobil: ${f}`));
  } finally {
    await c2.lukk();
  }

  // «Avslutt» → «Kåringen»
  await t.klikk('[data-h="avslutt"]');
  await ja(t);
  await t.vent("document.querySelector('.skjerm-slutt .bb-premier')");
  t.sjekk((t.norsk ? /vinner!/ : /!/).test(await t.tekst("#skjerm h1")), "Kåringen viser ikke vinneren");
  t.sjekk(await t.finnes(`.skjerm-slutt a[href="${t.forside}"]`), "Kåringen mangler «Alle spill»");
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Et ferdig spill vises fortsatt som «Fortsett»");

  // ---------- Party bingo ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="fest"]');
  // Elsewhere the fourth theme (Danish «slik» means sweets, but the language check reads it as Norwegian)
  const tema = t.norsk ? "17mai" : await t.js("document.querySelectorAll('[data-h=\"tema\"]')[3].dataset.v");
  await t.klikk(`[data-h="tema"][data-v="${tema}"]`);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#bb-kode')");
  await t.klikk('[data-h="eget-brett"]');
  await t.vent("document.querySelector('.bb-brett.fire')");
  t.sjekk((await t.antall(".bb-brett.fire .bb-rute")) === 16, "Festbrettet har ikke 16 ruter");
  t.sjekk(await overDokken(t, ".bb-brett"), "Festbrettet ligger bak BINGO-knappen");
  const ordBrudd = await t.js("Array.from(document.querySelectorAll('.bb-tekst')).filter((s) => s.scrollWidth > s.clientWidth + 1).length");
  t.sjekk(ordBrudd === 0, `${ordBrudd} øyeblikk er for brede for ruta`);
  await t.bilde("festbrett");
  for (const i of [4, 5, 6, 7]) await t.klikk(`[data-h="merk"][data-v="${i}"]`, 120);
  t.sjekk(!(await t.finnes('[data-h="bingo"]:disabled')), "BINGO er ikke klar etter en hel rad i festbingo");
  await t.bilde("festbrett-rekke");
  await t.klikk('[data-h="bingo"]');
  await t.vent("document.querySelector('.skjerm-bingo .bb-bevis')");
  t.sjekk((await t.antall(".bb-bevis li")) === 4, "Bingo-skjermen viser ikke de fire øyeblikkene");
  await t.bilde("fest-bingo", true);
  await t.klikk('[data-h="til-brett"]');
  for (let i = 0; i < 16; i++) if (![4, 5, 6, 7].includes(i)) await t.klikk(`[data-h="merk"][data-v="${i}"]`, 60);
  await t.vent("document.querySelector('.skjerm-bingo')", 4000);
  t.sjekk((t.norsk ? /Fullt brett/ : /!/).test(await t.tekst("#skjerm h1")), "Fullt brett ble ikke feiret");
  await t.bilde("fest-full");
}
