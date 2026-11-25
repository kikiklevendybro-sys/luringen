// Grådigper (Ett kort til?): three players round one phone, with decided cards. Setup (the
// target); everyone starts with one card; «Ett til» gives a new number and the turn passes on at
// once (the buttons rest for a moment, so a double tap cannot draw for the next player); «Stopp»
// keeps the points and «Angre» takes it back; two alike lose the round; the cheek pouch swallows
// a number that comes again; a treat and «Dobbel» count; the round is counted; reload, back +
// «Fortsett», the score sheet and «Kortene»; the next round is begun by the next seat; seven
// different end the round at once with 15 extra; reaching the target ends the game after the
// round – «Kåringen» and «Kveldens gjeng»; «Spill igjen», «Avslutt» (two kinds); eight players
// (the seat on turn is always in view), two players, and damaged saves.
// Runs in every edition (texts are checked in Norwegian only) and at every size.
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

function bildemappe(id) {
  const i = process.argv.indexOf("--bilder");
  const rot = i > 0 ? resolve(process.argv[i + 1]) : join(tmpdir(), "rusj-e2e");
  const mappe = join(rot, id);
  mkdirSync(mappe, { recursive: true });
  return mappe;
}
const flaggTall = (navn, standard) => {
  const i = process.argv.indexOf(navn);
  return (i > 0 && Number(process.argv[i + 1])) || standard;
};
const MOBIL = { width: flaggTall("--bredde", 390), height: flaggTall("--hoyde", 844), deviceScaleFactor: 2, mobile: true };
const LIGGENDE = MOBIL.width > MOBIL.height;

const navnene = (n) => Array.from({ length: n }, (_, i) => `Testspiller ${String.fromCharCode(65 + i)}`);
// The buttons are awake again after the beat that follows every card.
const KLAR = `!document.querySelector("#skjerm .dokk [data-laast]")`;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const sett = (endring) => t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.vis(); })()`);
  // The next card drawn is this one: the game takes card number floor(chance × cards left).
  const tving = (kort) =>
    t.js(`(() => { const b = Rusj.S.spill.bunke; const i = b.indexOf(${JSON.stringify(kort)}); if (i < 0) throw new Error("kortet ligger ikke i bunken: " + ${JSON.stringify(String(kort))});
      crypto.getRandomValues = (a) => { a[0] = Math.floor(((i + 0.5) / b.length) * 4294967296); return a; }; })()`);
  const trekk = async (kort) => {
    await t.vent(KLAR, 5000);
    await tving(kort);
    await t.klikk("#gp-til", 60);
    await t.js("delete crypto.getRandomValues");
    await t.vent(KLAR, 5000);
  };
  const stopp = async () => {
    await t.vent(KLAR, 5000);
    await t.klikk("#gp-stopp", 60);
    await t.vent(KLAR, 5000);
  };
  const kortene = (i) => t.js(`Array.from(document.querySelectorAll(".gp-bord > li")[${i}].querySelectorAll(".gp-rad .gp-kort")).map((k) => k.textContent.trim() || (k.classList.contains("pose") ? "kp" : "?")).join(" ")`);
  // The seat on turn is not hidden behind the buttons (it is scrolled into view when it has to be).
  const paTurSynlig = async () => {
    try {
      await t.vent(
        `(() => { const el = document.querySelector(".gp-plass.na"); const d = document.querySelector("#skjerm .dokk"); if (!el || !d) return false;
      const a = el.getBoundingClientRect(); const b = d.getBoundingClientRect();
      return a.top >= -2 && (a.bottom <= b.top + 2 || a.right <= b.left + 2 || a.left >= b.right - 2) && a.bottom <= innerHeight + 2; })()`,
        5000,
      );
      return true;
    } catch (e) {
      return false;
    }
  };

  // ---------- Home: three buttons and the facts fit a phone in the browser (390 × 664) ----------
  await t.start({ navn: navnene(3) });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const hjemFar = async (navn) => {
    if (LIGGENDE) return;
    await t.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 2, mobile: true });
    await t.sov(400);
    await t.js("window.scrollTo(0, 0)");
    const m = await t.js(`({ merker: Math.round(document.querySelector(".merker li:last-child").getBoundingClientRect().bottom), knapper: document.querySelectorAll(".hjem-knapper button").length, bred: document.documentElement.scrollWidth - window.innerWidth })`);
    t.sjekk(m.merker <= 664 && m.bred <= 0, `Hjem-skjermen («${navn}», ${m.knapper} knapper) får ikke plass på 390×664 (merkene slutter på ${m.merker} px)`);
    await t.skjermbilde(join(bildemappe(t.id), `${navn}-390x664.png`));
    await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
    await t.sov(300);
    return m.knapper;
  };
  const knapper = await hjemFar("hjem");
  if (!LIGGENDE && (await t.js("!!Rusj.nett"))) t.sjekk(knapper === 3 && (await t.finnes('[data-h="nett-apne"]')), `Hjem skal ha «Start spill», «Spill med en venn på nett» og «Slik spiller du» (${knapper} knapper)`);

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.tilstand()).antall === 3 && (await t.tilstand()).oppsett.mal === 200, "Oppsettet starter ikke med tre spillere og 200 poeng");
  await t.klikk('[data-h="mal"][data-v="100"]');
  t.sjekk((await t.tilstand()).oppsett.mal === 100, "Målet ble ikke 100");
  await t.bilde("oppsett", true);

  // ---------- Round 1: everyone has one card ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gp-bord')");
  await t.sov(450);
  let s = await sp();
  t.sjekk(s.antall === 3 && s.mal === 100 && s.runde === 0 && s.fase === "spill" && s.tur === 0 && s.rader.every((r) => r.length === 1) && s.bunke.length === 86 && s.status.every((x) => x === "med"), `Spillet startet feil: ${JSON.stringify([s.rader, s.bunke.length, s.tur])}`);
  t.sjekk((await t.antall(".gp-bord > li")) === 3 && (await t.antall(".gp-plass.na")) === 1 && (await t.antall(".gp-bord .gp-rad .gp-kort")) === 3, "Bordet viser ikke tre spillere med ett kort hver");
  t.sjekk((await t.finnes("#gp-til:not([disabled])")) && (await t.finnes("#gp-stopp:not([disabled])")), "«Ett til» og «Stopp» er ikke klare");
  for (const sel of [".gp-topp", ".gp-hendelse", ".gp-plass.na"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak dokka ved start`);
  if (t.norsk) t.sjekk(/sin tur/.test(await t.tekst("#skjerm h1")) && /Runde 1 · først til 100/i.test(await t.tekst(".gp-topp .etikett")), `Overskriften ved start: «${await t.tekst("#skjerm h1")}»`);
  await t.bilde("start");

  // A new number: the turn passes on at once, and the buttons rest for a moment
  await sett(`(S) => { const s = S.spill; s.rader = [[3, 7], [5], [12]]; s.tur = 0; s.siste = null; }`);
  await tving(9);
  // (The tap, what the screen shows right after it, and a second tap in the same instant.)
  const rett = await t.js(`(() => { document.querySelector("#gp-til").click(); const til = document.querySelector("#gp-til"); const st = document.querySelector("#gp-stopp");
    const ut = { hviler: til.disabled && st.disabled, stort: !!document.querySelector(".gp-blink .gp-kort.stor") }; til.click(); st.click(); return ut; })()`);
  await t.js("delete crypto.getRandomValues");
  s = await sp();
  t.sjekk(s.rader[0].join() === "3,7,9" && s.tur === 1 && s.siste.hva === "tall" && s.siste.kort === 9 && s.bunke.length === 85, `Et nytt tall: ${JSON.stringify([s.rader[0], s.tur, s.siste])}`);
  t.sjekk(rett.hviler && rett.stort, `Knappene hviler ikke rett etter et kort, eller kortet vises ikke stort: ${JSON.stringify(rett)}`);
  t.sjekk(s.rader[1].join() === "5" && s.status[1] === "med", "Et dobbelttrykk trakk kort eller stoppet for neste spiller");
  await t.bilde("trakk-9");
  await t.vent(KLAR, 5000);
  t.sjekk((await t.finnes("#gp-til:not([disabled])")) && (await kortene(0)) === "3 7 9", `Knappene våknet ikke, eller raden viser «${await kortene(0)}»`);
  if (t.norsk) t.sjekk(/trakk 9/.test(await t.tekst("#gp-hendelse")) && /Testspiller B sin tur|sin tur/.test(await t.tekst("#skjerm h1")), `Linja etter kortet: «${await t.tekst("#gp-hendelse")}»`);

  // «Stopp», «Angre», «Stopp» again
  await stopp();
  s = await sp();
  t.sjekk(s.status[1] === "stopp" && s.tur === 2 && typeof s.angre === "string", `«Stopp»: ${JSON.stringify([s.status, s.tur])}`);
  t.sjekk(await t.finnes('#skjerm [data-h="angre"]'), "Ingen «Angre» etter «Stopp»");
  await t.bilde("stoppet");
  await t.klikk('#skjerm [data-h="angre"]');
  s = await sp();
  t.sjekk(s.status[1] === "med" && s.tur === 1 && s.angre === null, "«Angre» tok ikke «Stopp» tilbake");
  await stopp();
  t.sjekk((await sp()).tur === 2, "Den andre «Stopp» ble ikke brukt");

  // Two alike: the round's points are gone
  await trekk(12);
  s = await sp();
  t.sjekk(s.status[2] === "ute" && s.like[2] === 12 && s.siste.hva === "like" && s.tur === 0 && s.angre === null, `To like: ${JSON.stringify([s.status, s.like, s.siste])}`);
  t.sjekk((await t.finnes(".gp-plass.ute .gp-kort.to")) && !(await t.finnes('#skjerm [data-h="angre"]')), "Raden viser ikke kortet som kom to ganger, eller «Angre» står igjen etter et kort");
  if (t.norsk) t.sjekk(/fikk 12 en gang til og mister rundens poeng/.test(await t.tekst("#gp-hendelse")), `Linja etter to like: «${await t.tekst("#gp-hendelse")}»`);

  // The cheek pouch swallows a number that comes again; a treat and «Dobbel» count
  await tving("kp");
  await t.klikk("#gp-til", 400);
  await t.js("delete crypto.getRandomValues");
  await t.bilde("kinnpose");
  s = await sp();
  t.sjekk(s.rader[0].join() === "3,7,9,kp" && s.tur === 0, "Kinnposen ble ikke lagt i raden, eller turen gikk ikke tilbake til den eneste som er med");
  await tving(3);
  await t.vent(KLAR, 5000);
  await t.klikk("#gp-til", 400);
  await t.js("delete crypto.getRandomValues");
  await t.bilde("reddet");
  s = await sp();
  t.sjekk(s.rader[0].join() === "3,7,9" && s.status[0] === "med" && s.siste.hva === "reddet", `Kinnposen reddet ikke: ${JSON.stringify([s.rader[0], s.status[0], s.siste])}`);
  await trekk("+5");
  await trekk("x2");
  s = await sp();
  t.sjekk(s.rader[0].join() === "3,7,9,+5,x2" && (await t.tekst(".gp-plass.na .gp-rp")).trim() === "43", `Godbit og «Dobbel»: ${s.rader[0]} gir «${await t.tekst(".gp-plass.na .gp-rp")}», ventet 43`);
  t.sjekk(/43/.test(await t.tekst("#gp-stopp")), "«Stopp»-knappen viser ikke poengene man beholder");
  await t.bilde("for-stopp");

  // The last one stops: the round is counted
  await stopp();
  s = await sp();
  t.sjekk(s.fase === "ferdig" && s.sum.join() === "43,5,0" && s.logg.length === 1 && s.logg[0].pluss.join() === "43,5,0" && !s.slutt, `Runden ble ikke talt opp riktig: ${JSON.stringify([s.fase, s.sum, s.logg])}`);
  t.sjekk((await t.finnes("#gp-neste")) && !(await t.finnes("#gp-til")), "Etter runden vises ikke «Neste runde»");
  if (t.norsk) t.sjekk(/Runde 1 er ferdig/i.test(await t.tekst(".gp-topp .etikett")) && /leder/.test(await t.tekst("#skjerm h1")), `Overskriften etter runden: «${await t.tekst("#skjerm h1")}»`);
  await t.bilde("runde-ferdig");

  // Reload, back + «Fortsett», the score sheet, the cards
  await t.lastSide(t.side, "document.querySelector('.gp-bord')");
  await t.sov(300);
  let s2 = await sp();
  t.sjekk(JSON.stringify([s2.sum, s2.rader, s2.status, s2.fase, s2.logg]) === JSON.stringify([s.sum, s.rader, s.status, s.fase, s.logg]) && (await t.tilstand()).skjerm === "spill", "Spillet ble ikke likt etter en omlasting");
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes('[data-h="fortsett"]')) && (await t.finnes('[data-h="nytt"]')), "Hjem mangler «Fortsett» og «Nytt spill» midt i et spill");
  if (t.norsk) t.sjekk(/Fortsett · runde 1/.test(await t.tekst('[data-h="fortsett"]')), `«Fortsett»-knappen: «${await t.tekst('[data-h="fortsett"]')}»`);
  await t.bilde("hjem-fortsett");
  await hjemFar("hjem-fortsett"); // four buttons while a game is running
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.gp-bord')");
  await t.klikk('#skjerm [data-h="lapp"]');
  t.sjekk((await t.antall("#ark .gp-lapp tbody tr")) === 1 && (await t.js(`Array.from(document.querySelectorAll("#ark .gp-lapp tfoot td")).map((c) => c.textContent.trim()).join()`)) === "43,5,0", "Poenglista viser ikke runden og summene");
  await t.bilde("poenglista");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('#skjerm [data-h="kortene"]');
  t.sjekk((await t.antall("#ark .gp-forklaring li")) === 4, "«Kortene» forklarer ikke de fire slagene kort");
  await t.bilde("kortene");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Round 2: the next seat begins; seven different end it at once ----------
  await t.klikk("#gp-neste", 500);
  await t.vent(KLAR, 5000);
  s = await sp();
  t.sjekk(s.runde === 1 && s.fase === "spill" && s.starter === 1 && s.tur === 1 && s.rader.every((r) => r.length === 1) && s.bunke.length === 86 && s.status.every((x) => x === "med") && s.sum.join() === "43,5,0", `Runde 2 startet feil: ${JSON.stringify([s.runde, s.tur, s.rader, s.status])}`);
  await sett(`(S) => { const s = S.spill; s.rader = [[11], [0, 1, 2, 4, 6, 8], [4, "+3"]]; s.siste = null; }`);
  t.sjekk((await t.tekst(".gp-plass.na .gp-merke")).trim() === "6/7", `Telleren for ulike tall viser «${await t.tekst(".gp-plass.na .gp-merke")}»`);
  await tving(10);
  await t.klikk("#gp-til", 450);
  await t.js("delete crypto.getRandomValues");
  await t.bilde("sju-ulike");
  s = await sp();
  t.sjekk(s.fase === "ferdig" && s.sju === 1 && s.siste.hva === "sju" && s.logg[1].pluss.join() === "11,46,7" && s.sum.join() === "54,51,7" && s.logg[1].sju === 1, `Sju ulike: ${JSON.stringify([s.fase, s.sju, s.logg[1], s.sum])}`);
  if (t.norsk) t.sjekk(/Sju ulike til/.test(await t.tekst("#skjerm h1")), `Overskriften etter sju ulike: «${await t.tekst("#skjerm h1")}»`);
  await t.vent(KLAR, 5000);

  // ---------- Round 3: the target is reached – the round is played out, then «Kåringen» ----------
  await t.klikk("#gp-neste", 500);
  await t.vent(KLAR, 5000);
  s = await sp();
  t.sjekk(s.runde === 2 && s.tur === 2 && s.starter === 2, "Runde 3 begynner ikke med den tredje spilleren");
  await sett(`(S) => { const s = S.spill; s.sum = [90, 51, 20]; s.rader = [[12], [5], [4]]; s.siste = null; }`);
  await stopp(); // C
  await stopp(); // A: 102 – but B still has the turn
  s = await sp();
  t.sjekk(s.fase === "spill" && s.tur === 1 && !s.slutt, "Runden ble avbrutt da målet var innen rekkevidde");
  await stopp(); // B
  s = await sp();
  t.sjekk(s.fase === "ferdig" && s.slutt === true && s.sum.join() === "102,56,24" && !s.ferdig, `Målet ble ikke nådd: ${JSON.stringify([s.fase, s.slutt, s.sum])}`);
  t.sjekk((await t.finnes('#skjerm .dokk [data-h="kaaring"]')) && !(await t.finnes("#gp-neste")), "Etter at målet er nådd, vises ikke «Se kåringen»");
  await t.bilde("i-maal");
  await t.klikk('#skjerm .dokk [data-h="kaaring"]');
  await t.vent(`Rusj.S.skjerm === "slutt"`, 4000);
  await t.sov(500);
  s = await sp();
  t.sjekk(s.ferdig && s.vinnere.join() === "0" && s.komplett === true, `Kåringen: ${JSON.stringify([s.ferdig, s.vinnere])}`);
  if (t.norsk) t.sjekk(/Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), `Overskriften på kåringen: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".poengliste li")) === 3 && (await t.antall(".gp-lapp tbody tr")) === 3, "Kåringen viser ikke tre spillere og tre runder");
  const kveld = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("kveld"))}) || "null")`);
  t.sjekk(kveld && kveld.spill.length === 1 && kveld.spill[0].id === "gradigper" && kveld.spill[0].resultat.map((r) => r.plass).join() === "1,2,3", `«Kveldens gjeng»: ${JSON.stringify(kveld)}`);
  t.sjekk((await t.finnes('[data-h="igjen"]')) && (await t.finnes(`a.lenke[href="${t.forside}"]`)) && (await t.finnes('[data-h="endre"]')), "Kåringen mangler «Spill igjen», «Endre oppsett» eller «Alle spill»");
  await t.bilde("kaaring", true);
  // «Del resultatet»: the points and the winner, with the address of this edition's game
  // (caught here: a headless browser has no share sheet and no clipboard).
  await t.js(`(() => { window.__delt = []; const fang = (x) => { window.__delt.push(typeof x === "string" ? { text: x, url: "" } : { title: x.title, text: x.text, url: x.url }); return Promise.resolve(); };
    Object.defineProperty(navigator, "share", { value: fang, configurable: true }); Object.defineProperty(navigator, "clipboard", { value: { writeText: fang }, configurable: true }); })()`);
  await t.klikk('#skjerm [data-h="del"]', 700);
  const delt = await t.js("window.__delt[window.__delt.length - 1] || null");
  t.sjekk(delt && /102/.test(delt.text) && `${delt.url} ${delt.text}`.includes(new URL(t.side).pathname), `«Del resultatet» delte ikke poengene og adressen: ${JSON.stringify(delt)}`);
  if (t.norsk) t.sjekk(delt && /Testspiller A vant Grådigper med 102 poeng/.test(delt.text), `Delingsteksten: «${delt && delt.text}»`);
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.tilstand())._aktiv === false, "«Fortsett» står igjen på hjem etter et ferdig spill");
  await hjemFar("hjem-etter-spill");

  // ---------- «Spill igjen» and «Avslutt» ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gp-bord')");
  s = await sp();
  t.sjekk(s.mal === 100 && s.runde === 0 && s.sum.every((p) => p === 0) && !s.ferdig, "Et nytt spill startet ikke på null");
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.bilde("avslutt-sporsmal");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.tilstand()).skjerm === "spill", "«Spill videre» avsluttet spillet");
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.sov(400);
  t.sjekk((await t.tilstand()).skjerm === "hjem" && (await sp()) === null, "«Avslutt» før en runde er ferdig ga ikke hjem-skjermen uten spill");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gp-bord')");
  await sett(`(S) => { const s = S.spill; s.rader = [[8], [8], [2]]; s.siste = null; }`);
  await stopp();
  await stopp();
  await stopp();
  await t.klikk("#gp-neste", 500);
  await t.vent(KLAR, 5000);
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(`Rusj.S.skjerm === "slutt"`, 4000);
  s = await sp();
  t.sjekk(s.ferdig && s.komplett === false && s.vinnere.join() === "0,1" && s.sum.join() === "8,8,2", `«Avslutt» midt i spillet: ${JSON.stringify([s.vinnere, s.sum])}`);
  if (t.norsk) t.sjekk(/Testspiller A og Testspiller B vinner!/.test(await t.tekst("#skjerm h1")), `Delt seier: «${await t.tekst("#skjerm h1")}»`);
  await t.bilde("kaaring-delt");
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.gp-bord')");
  t.sjekk((await sp()).runde === 0 && !(await sp()).ferdig, "«Spill igjen» startet ikke et nytt spill");

  // ---------- Eight players ----------
  await t.start({ navn: navnene(8) });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.tilstand()).antall === 8 && (await t.js(`document.querySelector('[data-h="spiller-legg-til"]').disabled`)), "Åtte navn ga ikke åtte spillere, eller en niende kan legges til");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gp-bord.n8')");
  await t.sov(400);
  t.sjekk((await t.antall(".gp-bord > li")) === 8 && (await sp()).bunke.length === 81, "Åtte spillere fikk ikke ett kort hver");
  await t.bilde("atte", true);
  await sett(`(S) => { const s = S.spill; s.rader = s.rader.map((_, i) => (i ? [0, 1, 2, 3, 4, 5 + i] : [0, 1, 2, 3, 4]).concat(i % 2 ? ["+3", "kp", "x2"] : ["+7"])); s.status = ["med", "stopp", "ute", "med", "med", "stopp", "med", "med"]; s.like[2] = 7; s.sum = [12, 140, 77, 0, 199, 65, 31, 108]; s.tur = 7; s.siste = null; }`);
  t.sjekk(await paTurSynlig(), "Den som har tur (plass 8), ligger bak knappene");
  await t.bilde("atte-fullt", true);
  await sett(`(S) => { S.spill.tur = 0; }`);
  t.sjekk(await paTurSynlig(), "Den som har tur (plass 1), kom ikke til syne igjen");
  await trekk(12);
  s = await sp();
  t.sjekk(s.rader[0].length === 7 && s.fase === "spill" && s.tur === 3, "Turen hoppet ikke over dem som har stoppet eller røket");
  t.sjekk(await paTurSynlig(), "Den som har tur (plass 4), ligger bak knappene");

  // ---------- Two players ----------
  await t.start({ navn: navnene(2) });
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gp-bord.n2')");
  await sett(`(S) => { const s = S.spill; s.rader = [[12, 7, 3, 0, "+5"], [9, 10, "kp"]]; s.siste = null; }`);
  for (const sel of [".gp-topp", ".gp-plass.na"]) t.sjekk(await t.friForDokk(sel), `${sel} ligger bak dokka med to spillere`);
  await t.bilde("to", true);

  // ---------- Damaged saves never give a blank page ----------
  for (const skadet of [`{ "skjerm": "spill", "spill": { "antall": 3, "rader": "x" } }`, `{ "skjerm": "slutt", "spill": null, "oppsett": "tull", "antall": 99 }`, `{ "skjerm": "spill", "oppsett": { "mal": 7 }, "spill": { "modus": "nett", "antall": 2 } }`]) {
    await t.js(`(() => { const n = ${JSON.stringify(t.nokkel("gradigper.v1"))}; const v = ${JSON.stringify(skadet)}; window.addEventListener("pagehide", () => localStorage.setItem(n, v)); localStorage.setItem(n, v); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(250);
    const st = await t.tilstand();
    t.sjekk(st.skjerm === "hjem" && st.spill === null && st.antall >= 2 && st.antall <= 8 && st.oppsett.mal === 200, `En skadet lagring ga ikke hjem-skjermen: ${JSON.stringify(st).slice(0, 160)}`);
  }
  await t.bilde("etter-skadet-lagring");
}
