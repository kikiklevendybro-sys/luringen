// Stigespillet (ladders and slides): two players + one phone seat on the «Jul» board, seeded dice.
// Setup defaults and board choice; a ladder; a six gives another roll; the phone never rolls while
// a sheet is open; a reload in the middle of a slide keeps the move; back + continue; a roll past
// 100 is home (default rule) and «Kåringen» with the podium, the places, «Lengste skli» and the
// evening's scoreboard. The board must be clear of the dock at every size (also on its side).
// Dice are forced by stubbing crypto.getRandomValues; positions are set through Rusj.S.
const NAVN = ["Testspiller A", "Testspiller B"];
const SP = `JSON.parse(localStorage.getItem("rusj.stigespillet.v1")).spill`;

export default async function (t) {
  const terninger = (verdier) =>
    t.js(`(() => { const v = ${JSON.stringify(verdier)}; let i = 0; crypto.getRandomValues = (a) => { a[0] = Math.floor((v[i++ % v.length] - 0.5) / 6 * 4294967296); return a; }; })()`);
  const ekte = () => t.js("delete crypto.getRandomValues");
  const stille = () => t.vent("document.querySelector('#sg-brett') && !document.querySelector('#sg-brett[data-opptatt]')", 12000);
  const kast = async () => {
    await stille();
    await t.klikk('.dokk [data-h="kast"]', 60);
  };
  let s;

  // ---------- Setup: defaults, one phone seat, the «Jul» board ----------
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 2, "Oppsettet viser ikke de to spillerne");
  t.sjekk(await t.finnes('[data-h="seks"][aria-pressed="true"]'), "«Seks gir et ekstra kast» skal være på fra start");
  t.sjekk(await t.finnes('[data-h="eksakt"][aria-pressed="false"]'), "«Nøyaktig til 100» skal være av fra start (for de minste)");
  t.sjekk((await t.antall('.flis[data-h="brett"]')) === 3, "Det skal være tre brett å velge mellom");
  await t.klikk('[data-h="roboter"][data-v="1"]');
  await t.klikk('.flis[data-h="brett"][data-v="jul"]');
  t.sjekk(await t.finnes('.flis[data-v="jul"][aria-pressed="true"]'), "Julebrettet ble ikke valgt");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#sg-brett .sg-bunn')");
  s = await t.tilstand();
  t.sjekk(s.spill.brett === "jul" && (await t.finnes("#sg-brett.tema-jul")), "Spillet bruker ikke julebrettet");
  t.sjekk(s.spill.seter.length === 3 && s.spill.seter[2].type === "r", "To spillere og én mobil skulle sitte rundt brettet");
  t.sjekk(JSON.stringify(s.spill.pos.slice(0, 3)) === "[1,1,1]", "Alle skal starte på rute 1");
  t.sjekk((await t.antall("#sg-brett .sg-brikke")) === 3, "Brettet skal vise tre brikker");
  t.sjekk((await t.antall("#sg-brett .sg-stige")) === 7 && (await t.antall("#sg-brett .sg-skli")) === 7, "Julebrettet skal ha sju stiger og sju sklier");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[0], "Den første på lista skal begynne");
  t.sjekk(await t.friForDokk("#sg-brett"), "Brettet ligger bak knappene");
  t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), "Siden er for bred");
  if (await t.js("document.documentElement.dataset.liggende === 'side'")) {
    t.sjekk(await t.js("document.querySelector('#sg-brett').getBoundingClientRect().right <= document.querySelector('.sg-tur').getBoundingClientRect().left + 1"), "Liggende: brettet skal stå til venstre for hvem sin tur");
  }
  await t.sov(500);
  await t.bilde("brett");

  // ---------- A ladder: 1 + 4 = 5, up to 35 ----------
  await terninger([4]);
  await kast();
  await t.vent(`${SP}.tur === 1`, 9000);
  s = await t.tilstand();
  t.sjekk(s.spill.pos[0] === 35, `Stigen fra 5 skulle ført til 35 (${s.spill.pos[0]})`);
  t.sjekk(s.spill.stat.stiger[0] === 1, "Stigen ble ikke telt");
  await stille();
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[1], "Turen gikk ikke videre til neste spiller");

  // ---------- A six: another roll ----------
  await terninger([6]);
  await kast();
  await t.vent(`${SP}.pos[1] === 7`, 9000);
  s = await t.tilstand();
  t.sjekk(s.spill.tur === 1 && s.spill.ekstra, "En sekser skal gi et ekstra kast");
  await stille();
  t.sjekk(/Kast igjen/.test(await t.tekst(".dokk .knapp")), "Knappen skal si «Kast igjen» etter en sekser");
  await t.bilde("seks");
  await terninger([4]);
  await kast();
  await t.vent(`${SP}.tur === 2`, 9000);
  t.sjekk((await t.tilstand()).spill.pos[1] === 11, "Det andre kastet (4 fra rute 7) kom ikke fram");

  // ---------- The phone's turn: it waits while a sheet is open ----------
  await t.klikk("#reglerknapp", 60);
  t.sjekk(await t.finnes("#ark:not([hidden])"), "Reglene åpnet seg ikke");
  const kastFor = (await t.tilstand()).spill.stat.kast;
  await terninger([5]);
  await t.sov(2600);
  s = await t.tilstand();
  t.sjekk(s.spill.stat.kast === kastFor && s.spill.tur === 2, "Mobilen kastet mens reglene var åpne");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent(`${SP}.tur === 0`, 9000);
  t.sjekk((await t.tilstand()).spill.pos[2] === 6, "Mobilen kastet ikke selv (5 fra rute 1)");
  await stille();

  // ---------- Reload in the middle of a slide: 59 + 4 = 63, down to 22 ----------
  await t.js(`(() => { const sp = Rusj.S.spill; sp.pos[0] = 59; Rusj.lagre(); Rusj.vis(); })()`);
  await terninger([4]);
  await kast();
  await t.sov(1500);
  t.sjekk(await t.finnes("#sg-brett[data-opptatt]"), "Brikka skulle vært på vei da siden ble lastet på nytt");
  await t.lastSide(t.side, "document.querySelector('#sg-brett .sg-bunn')");
  s = await t.tilstand();
  t.sjekk(s.spill.pos[0] === 22 && s.spill.tur === 1, `Trekket forsvant ved omlasting (rute ${s.spill.pos[0]}, tur ${s.spill.tur})`);
  t.sjekk(s.spill.stat.skli && s.spill.stat.skli.fra === 63 && s.spill.stat.skli.til === 22, "Sklia ble ikke telt");
  t.sjekk(!(await t.finnes("#sg-brett[data-opptatt]")), "Brettet står fast etter omlasting");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[1], "Feil spiller etter omlasting");
  await t.bilde("etter-omlasting");

  // ---------- Back keeps the game; «Nytt spill» asks first ----------
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spurte ikke først");
  await t.klikk('#ark [data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('#sg-brett .sg-bunn')");

  // ---------- Past 100 is home (default): 97 + 5 ----------
  await stille();
  await t.js(`(() => { const sp = Rusj.S.spill; sp.pos[1] = 97; Rusj.lagre(); Rusj.vis(); })()`);
  await terninger([5]);
  await kast();
  await t.vent("document.querySelector('.skjerm-slutt')", 12000);
  await ekte();
  await t.sov(800);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === `${NAVN[1]} vinner!`, `Vinneren vises ikke: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes(".pall"), "Kåringen mangler pallen");
  t.sjekk((await t.antall(".sg-rang li")) === 3, "Plasseringene skal vise alle tre");
  t.sjekk(/63 → 22/.test(await t.tekst(".sg-fakta")), "«Lengste skli: 63 → 22» mangler");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Kåringen mangler «Alle spill»");
  await t.bilde("kaaring", true);
  await t.sov(2000);
  if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  const kveld = await t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "stigespillet"), "Kåringen ble ikke registrert i «Kveldens gjeng»");

  // ---------- Play again: same setup, the other boards look right too ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('#sg-brett .sg-bunn')");
  t.sjekk((await t.tilstand()).spill.brett === "jul", "«Spill igjen» skulle brukt samme brett");
  for (const brett of ["hagen", "verdensrommet"]) {
    await stille();
    await t.js(`(() => { Rusj.S.spill.brett = "${brett}"; Rusj.vis(); })()`);
    await t.sov(300);
    await t.bilde(`brett-${brett}`);
  }
  // Home shows who won last time once the game is over
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(2200);
  if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake");
  t.sjekk(/Sist vant/.test(await t.tekst(".hjem-knapper")), "Hjem viser ikke hvem som vant sist");
}
