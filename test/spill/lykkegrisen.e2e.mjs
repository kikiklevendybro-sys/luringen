// Lykkegrisen (10 000): two players to 5 000. A set roll: a lone 2 doesn't score (the buttons wait),
// three 2s and a 1 do, «Velg poengene» picks the most; rolling on keeps the points aside; «Stopp»
// banks them and «Angre» takes them back; an empty roll loses the turn; six scoring dice are rolled
// again; reload and back + continue keep the game; the score sheet; the last round after the target
// and «Kåringen». Then with a phone player on Vanskelig: it rolls, chooses and stops by itself without
// freezing the page, and a win against it counts in the record and gives the sticker. The dice are the
// kit's (R.terninger): the dice put aside lie on the tray's shelf, and every die shows on top what the
// game rolled. Runs in every edition (texts are checked in Norwegian only).

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#lg-brett')");
  await t.sov(400);
}
const terning = (i) => `[data-h="velg"][data-v="${i}"]`;
const sett = (verdier, ekstra = "") => `(S) => { const sp = S.spill; sp.terninger = ${JSON.stringify(verdier)}; sp.valgt = sp.terninger.map(() => false); sp.status = "velg"; sp.angre = null; ${ekstra} }`;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const klikk = (sel, ms = 420) => t.klikk(sel, ms);
  const landet = () => t.vent("document.querySelector('#lg-brett') && !document.querySelector('#lg-brett[data-ruller]')", 9000);
  // Throw (the button), wait until every die lies still.
  const kast = async () => {
    await klikk('[data-h="kast"]', 60);
    await landet();
    await t.sov(300);
  };
  // What every die shows on top, read from how each cube is turned on screen; and which lie on the shelf.
  const topp = () =>
    t.js(`Array.from(document.querySelectorAll("#lg-brett .trn-t")).map((b) => {
      const m = new DOMMatrix(getComputedStyle(b.querySelector(".trn-kube")).transform);
      const z = [m.m13, m.m23, m.m33];
      let best = -Infinity;
      let verdi = 0;
      b.querySelectorAll(".trn-flate").forEach((f, a) => {
        const opp = (a & 1 ? -1 : 1) * z[a >> 1];
        if (opp > best) {
          best = opp;
          verdi = Number(f.dataset.v);
        }
      });
      return { verdi, hylle: b.getAttribute("aria-pressed") === "true" };
    })`);
  const pafelt = async () => (await topp()).filter((d) => !d.hylle).map((d) => d.verdi).join();
  const pahylla = async () => (await topp()).filter((d) => d.hylle).map((d) => d.verdi).sort().join();
  const av = (sel) => t.js(`!!document.querySelector('${sel}') && document.querySelector('${sel}').disabled`);

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  await klikk('[data-h="roboter"][data-v="0"]');
  await klikk('[data-h="mal"][data-v="5000"]');
  await klikk('[data-h="tabell"][data-v="faste"]');
  await t.bilde("oppsett-valgt", true);
  await klikk('[data-h="tabell"][data-v="klassisk"]');
  await klikk('[data-h="start"]');
  await t.vent("document.querySelector('#lg-brett')");
  t.sjekk((await t.antall("#lg-brett .trn-t")) === 6 && (await t.finnes("#lg-brett.trn-klar")), "Seks terninger venter ikke før første kast");
  await t.bilde("start");
  t.sjekk(await t.friForDokk(".lg-brett"), "Terningbrettet ligger under dokka");
  await t.js(`(() => { const v = [1, 5, 2, 2, 2, 3]; let i = 0; crypto.getRandomValues = (a) => { a[0] = Math.floor((v[i++ % v.length] - 0.5) / 6 * 4294967296); return a; }; })()`);
  await klikk('[data-h="kast"]', 160);
  await t.bilde("i-lufta");
  await landet();
  await t.js("delete crypto.getRandomValues");
  let s = await sp();
  t.sjekk(s.terninger.join() === "1,5,2,2,2,3" && s.status === "velg", `Kastet ga ${s.terninger}, ventet 1,5,2,2,2,3`);
  t.sjekk((await pafelt()) === "1,5,2,2,2,3", `Terningene viser ${await pafelt()} på toppen, spillet kastet 1,5,2,2,2,3`);
  await t.bilde("kastet");

  // A set roll: 1 5 2 2 2 3
  await lastMed(t, sett([1, 5, 2, 2, 2, 3], "sp.tur = 0; sp.fri = 6; sp.lagt = []; sp.turPoeng = 0;"));
  await klikk(terning(2));
  t.sjekk(await av('[data-h="kast"]'), "En toer alene skal ikke kunne kastes videre på");
  t.sjekk(!t.norsk || /gir ikke poeng/.test(await t.tekst("#lg-hint")), "Hintet sier ikke at toeren ikke gir poeng");
  await t.bilde("ugyldig");
  await klikk(terning(3));
  await klikk(terning(4));
  await klikk(terning(0));
  t.sjekk(!(await av('[data-h="kast"]')) && !(await av('[data-h="stopp"]')), "Tre toere og en ener skal gi lov til å kaste videre og stoppe");
  t.sjekk(!t.norsk || /300/.test(await t.tekst('[data-h="stopp"]')), `«Stopp» viser ikke 300: «${await t.tekst('[data-h="stopp"]')}»`);
  await klikk('[data-h="beste"]');
  s = await sp();
  t.sjekk(s.valgt.join() === "true,true,true,true,true,false", "«Velg poengene» valgte ikke ener, femmer og tre toere");
  t.sjekk(/350/.test(await t.tekst(".lg-tur")), "Turens poeng viser ikke 350");
  t.sjekk((await pahylla()) === "1,2,2,2,5", `Hylla viser ${await pahylla()}, ventet de fem valgte`);
  await t.bilde("valgt");
  await kast();
  s = await sp();
  t.sjekk(s.lagt.length === 1 && s.turPoeng === 350 && s.terninger.length === 1, "Terningene ble ikke lagt til side før neste kast");
  t.sjekk((await pahylla()) === "1,2,2,2,5" && (await pafelt()) === String(s.terninger[0]), `Etter kastet: hylla ${await pahylla()}, filten ${await pafelt()} (kastet ${s.terninger})`);
  await t.bilde("lagt-til-side");

  // Stop and bank 1000, then undo it
  await lastMed(t, sett([1, 1, 1, 4, 6, 2], "sp.tur = 0; sp.fri = 6; sp.lagt = []; sp.turPoeng = 0; sp.logg = sp.logg.map(() => []); sp.totaler = sp.totaler.map(() => 0);"));
  await klikk('[data-h="beste"]');
  await klikk('[data-h="stopp"]', 700);
  s = await sp();
  t.sjekk(s.totaler[0] === 1000 && s.tur === 1 && s.logg[0].slice(-1)[0] === 1000, "«Stopp» skrev ikke opp 1000 for A");
  await t.bilde("stoppet");
  await klikk('[data-h="angre"]');
  s = await sp();
  t.sjekk(s.totaler[0] === 0 && s.tur === 0 && s.status === "velg" && !s.logg[0].length, "«Angre» tok ikke tilbake poengene");
  await klikk('[data-h="stopp"]', 700);
  t.sjekk((await sp()).totaler[0] === 1000, "Poengene ble ikke skrevet opp igjen");

  // An empty roll loses the turn
  await lastMed(t, sett([2, 3, 4, 6, 2, 3], "sp.tur = 1; sp.fri = 6; sp.lagt = [{ verdier: [1], poeng: 100 }]; sp.turPoeng = 100;"));
  s = await sp();
  t.sjekk(s.status === "tomt", "Et kast uten poeng ble ikke tomt");
  await t.bilde("tomt");
  await klikk('[data-h="neste"]', 600);
  s = await sp();
  t.sjekk(s.tur === 0 && s.totaler[1] === 0 && s.status === "kast", "Det tomme kastet ga ikke turen videre uten poeng");

  // Six scoring dice: roll all six again
  await lastMed(t, sett([1, 1, 1, 5, 5, 5], "sp.tur = 0; sp.fri = 6; sp.lagt = []; sp.turPoeng = 0;"));
  await klikk('[data-h="beste"]');
  t.sjekk(!t.norsk || /Kast alle seks igjen/.test(await t.tekst('[data-h="kast"]')), "Knappen sier ikke «Kast alle seks igjen»");
  t.sjekk((await pahylla()) === "1,1,1,5,5,5", "Alle seks skulle ligget på hylla før de kastes igjen");
  await t.js(`(() => { const v = [6, 4, 3, 1, 2, 6]; let i = 0; crypto.getRandomValues = (a) => { a[0] = Math.floor((v[i++ % v.length] - 0.5) / 6 * 4294967296); return a; }; })()`);
  await kast();
  await t.js("delete crypto.getRandomValues");
  s = await sp();
  t.sjekk(s.terninger.length === 6 && s.lagt.length === 1 && s.turPoeng === 1500, "Seks som ga poeng, ble ikke kastet på nytt");
  t.sjekk((await pahylla()) === "" && (await pafelt()) === "6,4,3,1,2,6", `Alle seks skulle ligget på filten og vist 6,4,3,1,2,6: ${await pafelt()}`);
  await t.bilde("alle-seks");

  // Reload, back + continue
  await t.lastSide(t.side, "document.querySelector('#lg-brett')");
  t.sjekk((await sp()).turPoeng === 1500, "Turen ble borte etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('#lg-brett')");
  await klikk('[data-h="lapp"]', 500);
  t.sjekk(await t.finnes("#ark:not([hidden]) .lg-lapp"), "Poenglista vises ikke");
  await t.bilde("poenglista");
  await klikk('#ark [data-h="lukk-ark"]');

  // The target and the last round: A reaches 5 000, B gets one more turn and busts
  await lastMed(t, sett([1, 1, 1, 2, 3, 4], "sp.tur = 0; sp.fri = 6; sp.lagt = []; sp.turPoeng = 0; sp.totaler = [4800, 1000]; sp.inne = [true, true];"));
  await klikk('[data-h="beste"]');
  await klikk('[data-h="stopp"]', 700);
  s = await sp();
  t.sjekk(s.totaler[0] === 5800 && s.sisteRunde === 0 && s.tur === 1, "Siste runde startet ikke da A nådde målet");
  t.sjekk(!t.norsk || /SISTE RUNDE|Siste runde/.test(await t.tekst("#topp-tittel")), "Toppen sier ikke «Siste runde»");
  await t.bilde("siste-runde");
  await lastMed(t, sett([2, 3, 4, 6, 2, 3], "sp.tur = 1;"));
  await klikk('[data-h="neste"]', 600);
  t.sjekk((await sp()).klar === true && (await t.finnes('[data-h="kaaring"]')), "«Se kåringen» kom ikke etter siste runde");
  await klikk('[data-h="kaaring"]', 900);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.bilde("kaaringen", true);
  t.sjekk(!t.norsk || /Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), `Kåringen: «${await t.tekst("#skjerm h1")}»`);
  s = await t.tilstand();
  t.sjekk(s._aktiv === false && s.spill.ferdig, "Spillet står ikke som ferdig");
  t.sjekk(await t.finnes(".lg-lapp"), "Kåringen viser ikke poenglista");

  // With a phone player on Vanskelig (A, B and Robo)
  await klikk('[data-h="endre"]');
  await klikk('[data-h="roboter"][data-v="1"]');
  await klikk('[data-h="niva"][data-v="vanskelig"]');
  await t.bilde("oppsett-mobil", true);
  await klikk('[data-h="start"]');
  await t.vent("document.querySelector('#lg-brett')");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  for (const i of [0, 1]) {
    await t.vent(`Rusj.S.spill.tur === ${i}`, 15000);
    await kast();
    if ((await sp()).status === "tomt") await klikk('[data-h="neste"]', 600);
    else {
      await klikk('[data-h="beste"]');
      if (!(await av('[data-h="stopp"]'))) await klikk('[data-h="stopp"]', 700);
      else {
        await kast();
        await klikk((await sp()).status === "tomt" ? '[data-h="neste"]' : '[data-h="beste"]', 600);
        if ((await sp()).status === "velg" && !(await av('[data-h="stopp"]'))) await klikk('[data-h="stopp"]', 700);
      }
    }
  }
  await t.vent("Rusj.S.spill.tur === 2", 8000);
  await t.sov(1500);
  await t.bilde("mobilen-spiller");
  await t.vent("Rusj.S.spill.tur === 0", 30000);
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(gap < 150, `Siden frøs i ${Math.round(gap)} ms mens mobilen spilte`);
  s = await sp();
  t.sjekk(s.logg[2].length === 1, "Mobilen skrev ikke opp turen sin");

  // A win against the phone: A reached the target, the phone busts on its last turn
  await lastMed(t, sett([2, 3, 4, 6, 2, 3], "sp.tur = 2; sp.totaler = [6000, 1200, 3000]; sp.sisteRunde = 0; sp.inne = [true, true, true];"));
  await t.vent("Rusj.S.spill.klar === true", 8000);
  await klikk('[data-h="kaaring"]', 900);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.bilde("kaaringen-mobil", true);
  s = await t.tilstand();
  t.sjekk(s.rekord && s.rekord.mobil && s.rekord.mobil.vanskelig && s.rekord.mobil.vanskelig.seier === 1, "Seieren mot mobilen teller ikke i rekorden");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(JSON.stringify(merker).includes("klassiker-lykkegrisen"), "Klistremerket «Grisflaks» ble ikke gitt");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.lg-rekorder')");
  await t.bilde("hjem-rekord", true);
}
