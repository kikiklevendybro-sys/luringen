// Lurendreieren on one phone («send mobilen rundt»): three people set up (three dice each, ones
// wild). The phone goes to the one whose turn it is; nobody's dice are on the page except on the
// back of the hold-card of the one who has said «Jeg er …». A bid is built (how many, which face)
// and must be higher than the last; «Løgn!» shows every die and counts the matching ones up one
// by one – a bluff costs the bidder a die, a bid that held costs the caller one; «Hopp over» ends
// the count at once. A reload never comes back with dice within reach; back + «Fortsett» keeps
// the game; the last one with dice gets «Kåringen» and the evening's scoreboard; «Spill igjen»;
// «Avslutt» with and without a lost die; without wild ones a one is a face of its own.
// The home screen fits 390 × 664 with its three buttons and the fact chips.
// (The game on the net – a phone each – is test/nett/lurendreieren.mjs.)
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

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  // Change the running game (the dice of a round, who begins) and draw it again.
  const sett = (js) => t.js(`(() => { const s = Rusj.S.spill; ${js}; Rusj.lagre(); Rusj.vis(); })()`);
  const jegEr = () => t.klikk('[data-h="jeg-er"]', 400);
  // Build a bid on the turn screen and say it.
  const by = async (n, x) => {
    await t.klikk(`[data-h="flate"][data-v="${x}"]`, 120);
    for (let k = 0; k < 20; k++) {
      const na = (await sp()).valg.n;
      if (na === n) break;
      await t.klikk(`[data-h="antall"][data-v="${na < n ? 1 : -1}"]`, 100);
    }
    await t.klikk('[data-h="si"]', 400);
  };
  const ferdigTalt = () => t.vent(`document.querySelector(".lur-avsloring.ferdig")`, 12000);
  // The dice anywhere on the page (the hold-card's back is only filled while it is held).
  const synligeTerninger = () => t.js(`document.querySelectorAll("#skjerm [data-sete] .lur-t").length`);

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk((await t.finnes('.knapp[data-h="nytt"]')) && (await t.finnes('[data-h="nett-apne"]')) && (await t.finnes('[data-h="regler"]')), "Hjem mangler en av de tre knappene (start, på nett, regler)");
  t.sjekk((await t.antall(".merker li")) === 3, "Hjem har ikke tre merker");
  await t.bilde("hjem");
  if (!LIGGENDE) {
    // A phone in the browser (390 × 664): the three buttons and the fact chips fit the first screen
    await t.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 2, mobile: true });
    await t.sov(400);
    const bunn = await t.js(`Math.round(document.querySelector(".merker li:last-child").getBoundingClientRect().bottom)`);
    t.sjekk(bunn <= 664, `Hjem-skjermen får ikke plass på 390×664 (merkene slutter på ${bunn} px)`);
    await t.skjermbilde(join(bildemappe(t.id), "hjem-390x664.png"));
    await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
    await t.sov(300);
  }

  // ----- Setup -----
  await t.klikk('[data-h="nytt"]', 450);
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  t.sjekk((await t.antall("#spillerboks input[data-navn]")) === 3, "Tre spillere er ikke ført opp");
  await t.klikk('[data-h="terninger"][data-v="3"]', 200);
  t.sjekk((await t.js(`document.querySelector('[data-h="joker"]').getAttribute("aria-pressed")`)) === "true", "Enere er ikke jokere fra start");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]', 600);
  await t.vent("Rusj.S.skjerm === 'spill'");
  let s = await sp();
  t.sjekk(s.antall === 3 && s.start === 3 && s.joker === true && s.fase === "bud" && s.runde === 1 && s.kast.every((l) => l.length === 3 && l.every((v) => v >= 1 && v <= 6)), "Spillet startet ikke med tre terninger hver og første kast");

  // ----- Round 1: A says 3 fives (true), B bluffs 4 twos, C calls -----
  await sett("s.starter = 0; s.tur = 0; s.hos = -1; s.valg = null; s.kast = [[5, 5, 1], [2, 3, 6], [4, 4, 6]]");
  await t.sov(250);
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")) && (await t.finnes('[data-h="jeg-er"]')), "Mobilen skal først til Testspiller A");
  t.sjekk((await synligeTerninger()) === 0 && !(await t.finnes(".mappe")) && !(await t.finnes(".lur-bygger")), "Terninger eller budknapper vises før noen har sagt «Jeg er …»");
  t.sjekk((await t.antall(".lur-bord-rad li")) === 3, "Raden med terninger igjen mangler");
  await t.bilde("gi-mobilen");
  await jegEr();
  t.sjekk((await t.finnes(".lur-titt .mappe")) && (await synligeTerninger()) === 0, "Kortet mangler, eller terningene vises uten at noen holder på det");
  const slipp = await t.hold(".lur-titt .mappe", 600);
  t.sjekk((await t.antall(".mappe.apen .lur-bak .lur-t")) === 3, "Kortet viser ikke de tre terningene når man holder");
  t.sjekk((await t.js(`document.querySelector(".mappe.apen .lur-bak [data-sete]").dataset.sete`)) === "0", "Kortet viser ikke terningene til den som har tur");
  await t.bilde("kikker");
  await slipp();
  t.sjekk((await synligeTerninger()) === 0, "Terningene vises fortsatt etter at kortet er sluppet");
  // The builder: with wild ones nobody bids on ones; the first bid starts from the lowest one.
  t.sjekk((await t.antall('[data-h="flate"]')) === 5 && !(await t.finnes('[data-h="flate"][data-v="1"]')), "Med jokere skal det være fem tall å by på (ikke enere)");
  s = await sp();
  t.sjekk(s.valg && s.valg.n === 1 && s.valg.x === 2, `Første bud starter ikke på det laveste (${JSON.stringify(s.valg)})`);
  t.sjekk(!(await t.finnes('[data-h="lyv"]')), "«Løgn!» finnes før noe bud er sagt");
  t.sjekk(await t.js(`document.querySelector('[data-h="antall"][data-v="-1"]').disabled`), "Man kan by færre enn én terning");
  await t.klikk('[data-h="flate"][data-v="5"]', 120);
  await t.klikk('[data-h="antall"][data-v="1"]', 100);
  await t.klikk('[data-h="antall"][data-v="1"]', 100);
  t.sjekk(!t.norsk || /^Si 3 femmere$/.test((await t.tekst('[data-h="si"]')).trim()), `Knappen sier ikke «Si 3 femmere»: «${await t.tekst('[data-h="si"]')}»`);
  if (!LIGGENDE) t.sjekk(await t.friForDokk(".lur-flater"), "Tallene å by på er skjult bak knappene");
  await t.bilde("bygger-bud");
  await t.klikk('[data-h="si"]', 400);
  s = await sp();
  t.sjekk(s.bud && s.bud.n === 3 && s.bud.x === 5 && s.bud.av === 0 && s.tur === 1 && s.hos === -1, `Budet ble ikke sagt: ${JSON.stringify(s.bud)}`);
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")) && (await synligeTerninger()) === 0 && !(await t.finnes(".mappe")), "Mobilen skal videre til Testspiller B, uten terninger på skjermen");
  t.sjekk(!t.norsk || /minst 3 femmere/.test(await t.tekst(".lur-bud")), `Budet vises ikke: «${await t.tekst(".lur-bud")}»`);
  await t.bilde("bud-staar");

  // B: the bid starts from the lowest higher one; a lower face needs one more die
  await jegEr();
  s = await sp();
  t.sjekk(s.valg.n === 3 && s.valg.x === 6, `Høyere bud starter ikke på 3 seksere (${JSON.stringify(s.valg)})`);
  t.sjekk(await t.finnes('[data-h="lyv"]'), "«Løgn!» mangler når det står et bud");
  t.sjekk(await t.js(`document.querySelector('[data-h="antall"][data-v="-1"]').disabled`), "Man kan by lavere enn budet som står");
  await t.klikk('[data-h="flate"][data-v="2"]', 150);
  s = await sp();
  t.sjekk(s.valg.n === 4 && s.valg.x === 2, `Et lavere tall krever ikke én terning mer (${JSON.stringify(s.valg)})`);
  if (!LIGGENDE) t.sjekk(await t.friForDokk(".lur-flater"), "Tallene å by på er skjult bak knappene når det står et bud");
  await t.bilde("hoyere-eller-logn");
  await t.klikk('[data-h="si"]', 400);
  // C calls: two twos (one of them a wild one) – a bluff, B loses a die
  await jegEr();
  await t.klikk('[data-h="lyv"]', 150);
  s = await sp();
  t.sjekk(s.fase === "avslort" && s.utfall.holdt === false && s.utfall.antall === 2 && s.utfall.taper === 1 && s.ant.join() === "3,2,3" && s.starter === 1, `«Løgn!» på en bløff: ${JSON.stringify(s.utfall)} ${s.ant}`);
  t.sjekk((await t.antall(".lur-bord .lur-t")) === 9 && (await t.antall(".lur-bord .lur-rad")) === 3, "Avsløringen viser ikke alle ni terningene");
  t.sjekk((await t.finnes(".lur-avsloring.teller")) && (await t.finnes('[data-h="hopp"]')) && !(await t.finnes('[data-h="runde"]')), "Opptellingen starter ikke (eller kan ikke hoppes over)");
  await t.bilde("teller-opp");
  await ferdigTalt();
  await t.sov(200);
  t.sjekk((await t.antall(".lur-t.talt")) === 2 && (await t.antall(".lur-t.treff")) === 2 && (await t.tekst("[data-lur-tall]")).trim() === "2", "Opptellingen endte ikke på to gule terninger");
  t.sjekk(!t.norsk || (/Bløff!/.test(await t.tekst("#skjerm h1")) && /Testspiller B mister en terning/.test(await t.tekst(".lur-res"))), `Dommen: «${await t.tekst("#skjerm h1")}» / «${await t.tekst(".lur-res")}»`);
  t.sjekk(await t.finnes('[data-h="runde"]'), "«Neste runde» mangler etter opptellingen");
  if (!LIGGENDE) t.sjekk(await t.friForDokk(".lur-bord .lur-rad:last-child"), "Siste rad i avsløringen er skjult bak knappene");
  await t.bilde("blof");

  // A reload during the reveal: the verdict, no new count
  await t.lastSide(t.side, "document.querySelector('.lur-avsloring')");
  await t.sov(300);
  t.sjekk((await t.finnes(".lur-avsloring.ferdig")) && (await t.antall(".lur-t.talt")) === 2 && (await t.finnes('[data-h="runde"]')), "Omlasting under avsløringen ga ikke dommen");

  // ----- Round 2: B (the loser) begins; a reload never comes back with dice within reach -----
  await t.klikk('[data-h="runde"]', 500);
  s = await sp();
  t.sjekk(s.runde === 2 && s.tur === 1 && s.fase === "bud" && s.kast.map((l) => l.length).join() === "3,2,3" && s.bud === null, `Runde 2: ${s.tur} ${s.kast.map((l) => l.length)}`);
  await sett("s.kast = [[6, 6, 2], [6, 3], [1, 4, 5]]; s.hos = -1; s.valg = null");
  await jegEr();
  t.sjekk(await t.finnes(".lur-titt .mappe"), "B har ikke fått kortet sitt");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  s = await sp();
  t.sjekk((await t.js("Rusj.S.skjerm")) === "spill" && s.hos === -1 && (await t.finnes('[data-h="jeg-er"]')) && !(await t.finnes(".mappe")) && (await synligeTerninger()) === 0, "Omlasting midt i en tur ga ikke «Gi mobilen til …» uten terninger");
  await jegEr();
  await by(4, 6);
  // Back + «Fortsett»
  await t.klikk("#tilbake", 400);
  t.sjekk(!t.norsk || /Fortsett · runde 2/.test(await t.tekst('[data-h="fortsett"]')), `Hjem sier ikke «Fortsett · runde 2»: «${await t.tekst('[data-h="fortsett"]')}»`);
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet regnes ikke som pågående (pagar)");
  await t.klikk('[data-h="fortsett"]', 400);
  t.sjekk(/Testspiller C/.test(await t.tekst("#skjerm h1")), "«Fortsett» ga ikke mobilen til Testspiller C");
  // C calls; three sixes and a wild one: the bid held, and the caller loses a die. «Hopp over».
  await jegEr();
  await t.klikk('[data-h="lyv"]', 200);
  await t.klikk('[data-h="hopp"]', 300);
  s = await sp();
  t.sjekk((await t.finnes(".lur-avsloring.ferdig.holdt")) && s.utfall.holdt === true && s.utfall.antall === 4 && s.utfall.taper === 2 && s.ant.join() === "3,2,2", `«Løgn!» på et sant bud: ${JSON.stringify(s.utfall)} ${s.ant}`);
  t.sjekk(!t.norsk || /Det stemte!/.test(await t.tekst("#skjerm h1")), `Dommen: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(s.tall[1].hjem === 0 && s.tall[2].rop === 2 && s.tall[2].treff === 1, "Statistikken over bløff og rop stemmer ikke");
  await t.bilde("det-stemte");

  // ----- The rest of the game: the lowest bid, then a call, until one is left -----
  for (let steg = 0; steg < 60; steg++) {
    s = await sp();
    if (s.vinner != null) break;
    if (s.fase === "avslort") {
      if (await t.finnes('[data-h="hopp"]')) await t.klikk('[data-h="hopp"]', 250);
      await t.klikk('[data-h="runde"]', 400);
      continue;
    }
    await jegEr();
    if (s.bud) await t.klikk('[data-h="lyv"]', 250);
    else await t.klikk('[data-h="si"]', 350);
  }
  s = await sp();
  t.sjekk(s.vinner != null && s.ant.filter((n) => n > 0).length === 1, "Spillet endte ikke med én igjen");
  if (await t.finnes('[data-h="hopp"]')) await t.klikk('[data-h="hopp"]', 300);
  t.sjekk((await t.finnes('[data-h="kaaring"]')) && !(await t.finnes('[data-h="runde"]')), "Siste avsløring mangler «Til kåringen»");
  await t.bilde("siste-avsloring");
  await t.klikk('[data-h="kaaring"]', 700);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "slutt", "Kom ikke til kåringen");
  const vinner = ["Testspiller A", "Testspiller B", "Testspiller C"][s.vinner];
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")) === `${vinner} vinner!`, `Kåringen: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".lur-plasser li")) === 3 && (await t.antall(".lur-plasser li.leder")) === 1, "Kåringen har ikke tre plasser og én vinner");
  const kveld = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("kveld"))}) || "null")`);
  t.sjekk(kveld && kveld.spill.length === 1 && kveld.spill[0].id === "lurendreieren" && kveld.spill[0].resultat[0].plass === 1, "Kvelden fikk ikke resultatet");
  t.sjekk((await t.tilstand())._aktiv !== true, "Et ferdig spill regnes som pågående");
  t.sjekk((await t.js(`document.querySelector('.dokk a.lenke').getAttribute("href")`)) === t.forside, "«Alle spill» går ikke til utgavens forside");
  await t.bilde("karing", true);

  // «Spill igjen»: the same setup, from the start
  await t.klikk('[data-h="igjen"]', 600);
  s = await sp();
  t.sjekk((await t.js("Rusj.S.skjerm")) === "spill" && s.runde === 1 && s.ant.join() === "3,3,3" && s.joker === true && s.vinner == null, "«Spill igjen» startet ikke likt fra start");
  // «Avslutt» before anyone has lost a die: the game is gone
  await t.klikk('[data-h="avslutt"]', 400);
  await t.bilde("avslutt-ark");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]', 400);
  t.sjekk(!!(await sp()), "«Spill videre» kastet spillet");
  await t.klikk('[data-h="avslutt"]', 400);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 500);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem" && !(await sp()), "«Avslutt» uten tap gikk ikke hjem uten spill");

  // ----- Without wild ones: six faces, a one is a face of its own; «Avslutt» after a lost die -----
  await t.klikk('[data-h="nytt"]', 450);
  await t.klikk('[data-h="terninger"][data-v="5"]', 200);
  await t.klikk('[data-h="joker"]', 200);
  await t.klikk('[data-h="start"]', 600);
  s = await sp();
  t.sjekk(s.joker === false && s.start === 5 && s.kast.every((l) => l.length === 5), "Oppsettet uten jokere og med fem terninger kom ikke med");
  await sett("s.starter = 0; s.tur = 0; s.hos = -1; s.valg = null; s.kast = [[1, 1, 2, 3, 4], [1, 5, 5, 6, 6], [2, 2, 3, 3, 4]]");
  await jegEr();
  t.sjekk((await t.antall('[data-h="flate"]')) === 6, "Uten jokere skal det være seks tall å by på");
  const holder = await t.hold(".lur-titt .mappe", 600);
  t.sjekk((await t.antall(".mappe.apen .lur-bak .lur-t")) === 5, "Kortet viser ikke fem terninger");
  await t.bilde("kikker-fem");
  await holder();
  await by(4, 1);
  await jegEr();
  await t.klikk('[data-h="lyv"]', 200);
  await ferdigTalt();
  s = await sp();
  t.sjekk(s.utfall.antall === 3 && s.utfall.holdt === false && s.ant.join() === "4,5,5", `Uten jokere teller bare enere som enere: ${JSON.stringify(s.utfall)}`);
  await t.bilde("uten-jokere");
  await t.klikk('[data-h="avslutt"]', 400);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 600);
  s = await sp();
  t.sjekk((await t.js("Rusj.S.skjerm")) === "slutt" && s.ferdig && s.vinner == null, "«Avslutt» etter et tap ga ikke kåring");
  t.sjekk(!t.norsk || /Testspiller B og Testspiller C leder!/.test(await t.tekst("#skjerm h1")), `Kåringen etter «Avslutt»: «${await t.tekst("#skjerm h1")}»`);

  // A damaged save: the home screen, never a blank page
  await t.js(`localStorage.setItem(${JSON.stringify(t.nokkel("lurendreieren.v1"))}, JSON.stringify({ skjerm: "spill", _tid: Date.now(), antall: 3, oppsett: { terninger: 9 }, spill: { modus: "en", antall: 3, start: 5, ant: [5, 5], fase: "bud", kast: [[7]] } }))`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem" && !(await sp()) && (await t.tilstand()).oppsett.terninger === 5, "Et ødelagt lagret spill ga ikke hjem-skjermen med standardoppsett");
}
