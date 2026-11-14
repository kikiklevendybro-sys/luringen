// Tavla (backgammon): two players with the cube in a match to 3. The opening roll decides who
// starts; a set roll (3-1) shows the legal targets for a selected checker, makes the 5-point and
// ends the turn; an illegal tap is refused; «Angre» takes one move back; reload and back + continue
// keep the game; a double is offered and taken; a last checker borne off wins a gammon worth the
// cube twice, «Angre» takes the win back, and the match ends in «Kåringen». Then against the phone
// on Vanskelig: it rolls and plays without freezing the page, and a win counts in the record on the
// home screen. The board must be clear of the dock and the page must not scroll at any size. The dice
// are the kit's (R.terninger): they roll along the bar, show on top what the game rolled, dim when used,
// and a double shows how many moves each die still gives; the doubling cube is a small 3D cube.
// Runs in every edition (texts are checked in Norwegian only).
const punkt = (n) => `.tv-p[data-v="${n}"]`;

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelectorAll('.tv-p').length === 24");
  await t.sov(400);
}

// Side 0 own point i → index in pos; side 1 own point i → 26 + i.
const tom = () => Array(52).fill(0);

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const klikk = (sel, ms = 420) => t.klikk(sel, ms);
  const landet = () => t.vent("!document.querySelector('[data-kaster]')", 9000);
  // What each die shows on top, read from how each cube is turned on screen, and whether it is dimmed.
  const terningene = () =>
    t.js(`Array.from(document.querySelectorAll("#tv-kast .trn-t")).map((b) => {
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
      return { verdi, brukt: b.classList.contains("brukt"), merke: (b.querySelector(".trn-merke") || {}).textContent || "" };
    })`);
  const topp = async () => (await terningene()).map((d) => d.verdi).join();

  async function brettSjekk(navn) {
    await t.js("window.scrollTo(0, 0)");
    const m = await t.js(`(() => {
      const b = document.querySelector('.tv-brett').getBoundingClientRect();
      const p = document.querySelector('.tv-p').getBoundingClientRect();
      const c = getComputedStyle(document.querySelector('.tv-brett')).getPropertyValue('--c');
      return { b: Math.round(b.width) + "×" + Math.round(b.height), pw: Math.round(p.width), ph: Math.round(p.height), c: parseFloat(c), scroll: document.documentElement.scrollHeight - innerHeight };
    })()`);
    t.sjekk(m.scroll <= 1, `Brettskjermen scroller ${m.scroll}px («${navn}»)`);
    t.sjekk(await t.friForDokk(".tv-brett"), `Brettet ligger under dokka («${navn}»)`);
    // Every point is a big enough target: 24 px both ways (on the 568 px tall phones at least 20 px
    // high, and then more than 130 px wide).
    const minH = (await t.js("innerHeight")) < 600 ? 20 : 24;
    t.sjekk(m.pw >= 24 && m.ph >= minH, `Punktene er for små å treffe: ${m.pw}×${m.ph} («${navn}», brett ${m.b})`);
    t.sjekk(m.c >= 14, `Brikkene er bare ${m.c}px («${navn}»)`);
  }

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  await klikk('[data-h="modus"][data-v="to"]');
  await klikk('[data-h="mal"][data-v="3"]');
  await klikk('[data-h="kube"]');
  await t.bilde("oppsett-to", true);
  await klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.tv-p').length === 24");
  await t.sov(400);
  let s = await sp();
  t.sjekk(s.apning && s.kast[0] !== s.kast[1] && s.tur === (s.kast[0] > s.kast[1] ? 0 : 1), "Åpningskastet bestemmer ikke hvem som begynner");
  t.sjekk((await topp()) === s.kast.join(), `Åpningsterningene viser ${await topp()}, kastet var ${s.kast}`);
  t.sjekk(await t.finnes("#tv-kast .trn-t.s0") && (await t.finnes("#tv-kast .trn-t.s1")), "Åpningskastet viser ikke én terning i hver farge");
  t.sjekk(await t.finnes(".tv-kube .trn-dobling"), "Doblingskuben er ikke en 3D-kube");
  t.sjekk((await t.antall(".tv-b")) >= 30, "Brettet viser ikke de 30 brikkene");
  t.sjekk((await t.antall(".tv-celle.kan")) > 0, "Ingen brikker lyser selv om spilleren skal flytte");
  await t.bilde("start");
  await brettSjekk("start");

  // A set roll: 3-1 for white, the classic 8/5 6/5.
  await lastMed(t, `(S) => { const sp = S.spill; sp.tur = 0; sp.kast = [3, 1]; sp.rest = [3, 1]; sp.steg = []; sp.apning = false; sp.valgt = -1; }`);
  t.sjekk(!t.norsk || /Flytt 3 og 1/.test(await t.tekst(".tv-melding")), `Meldingen sier ikke hva som skal flyttes: «${await t.tekst(".tv-melding")}»`);
  await klikk(punkt(8));
  t.sjekk(await t.finnes(`${punkt(8)}.valgt`), "Brikken på 8 ble ikke valgt");
  const mal = await t.js(`Array.from(document.querySelectorAll('.tv-p.mal')).map((e) => e.dataset.v).sort().join(",")`);
  t.sjekk(mal === "5,7", `Fra 8 med 3-1 skal 5 og 7 lyse, ikke «${mal}»`);
  t.sjekk((t.norsk ? /flytt hit med 3/ : /3/).test(await t.js(`document.querySelector('${punkt(5)}').getAttribute('aria-label')`)), "Målpunktet sier ikke hvilken terning som tar brikken dit");
  await t.bilde("valgt");
  // An illegal tap: point 20 (the other side's checkers) changes nothing
  await klikk(punkt(20), 300);
  t.sjekk((await sp()).steg.length === 0, "Et ulovlig trykk flyttet en brikke");
  t.sjekk(await t.finnes(`${punkt(8)}.valgt`), "Et ulovlig trykk tok bort valget");
  await klikk(punkt(5));
  s = await sp();
  t.sjekk(s.steg.length === 1 && s.pos[5] === 1 && s.pos[8] === 2, "8/5 ble ikke flyttet");
  await klikk(punkt(6));
  await klikk(punkt(5));
  s = await sp();
  t.sjekk(s.pos[5] === 2 && s.pos[6] === 4 && s.rest.length === 0, "6/5 ble ikke flyttet – 5-punktet er ikke bygget");
  t.sjekk(!(await t.js(`document.querySelector('[data-h="ferdig"]').disabled`)), "«Ferdig» er ikke klar når terningene er brukt");
  await t.bilde("femmerpunktet");
  // Undo one move, then play it again
  await klikk('[data-h="angre"]');
  s = await sp();
  t.sjekk(s.steg.length === 1 && s.rest.join() === "1", "«Angre» tok ikke tilbake det siste trekket");
  await klikk(punkt(6));
  await klikk(punkt(5));
  await klikk('[data-h="ferdig"]');
  s = await sp();
  t.sjekk(s.tur === 1 && !s.kast, "Turen gikk ikke over til svart");
  t.sjekk(await t.finnes(".tv-p.sist"), "Det siste trekket er ikke merket for neste spiller");

  // Black rolls (5-2, forced) and moves one checker; reload and back + continue keep it
  await t.js(`(() => { const v = [5, 2]; let i = 0; crypto.getRandomValues = (a) => { a[0] = Math.floor((v[i++ % v.length] - 0.5) / 6 * 4294967296); return a; }; })()`);
  await klikk('[data-h="kast"]', 150);
  await t.bilde("svart-i-lufta");
  await landet();
  await t.js("delete crypto.getRandomValues");
  await t.sov(300);
  s = await sp();
  t.sjekk(s.kast && s.kast.join() === "5,2" && s.rest.length === 2, `Svart fikk ikke kastet 5-2 (${s.kast})`);
  t.sjekk((await topp()) === "5,2", `Terningene viser ${await topp()} på toppen, svart slo 5-2`);
  t.sjekk(await t.js(`Array.from(document.querySelectorAll("#tv-kast .trn-t")).every((b) => b.classList.contains("s1"))`), "Svarts terninger er ikke svarte");
  await t.bilde("svart-kastet");
  if (!(await t.finnes(".tv-p.mal, .tv-ut.mal"))) await klikk(".tv-celle.kan");
  await klikk(".tv-p.mal, .tv-ut.mal");
  t.sjekk((await sp()).steg.length === 1, "Svart fikk ikke flyttet");
  t.sjekk((await terningene()).filter((d) => d.brukt).length === 1, "Terningen som er brukt, er ikke dimmet");
  await t.lastSide(t.side, "document.querySelectorAll('.tv-p').length === 24");
  t.sjekk((await sp()).steg.length === 1, "Trekket ble borte etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.bilde("hjem-fortsett");
  await klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.tv-p').length === 24");

  // A double (4-4): two dice, each «×2», and one used move takes one from the first die
  await lastMed(t, `(S) => { const sp = S.spill; sp.tur = 0; sp.kast = [4, 4]; sp.rest = [4, 4, 4, 4]; sp.steg = []; sp.apning = false; sp.valgt = -1; }`);
  let d = await terningene();
  t.sjekk(d.length === 2 && d.map((x) => x.verdi).join() === "4,4" && d.map((x) => x.merke).join() === "×2,×2", `En dobbel viser ${JSON.stringify(d)}`);
  await klikk(".tv-celle.kan");
  await klikk(".tv-p.mal, .tv-ut.mal");
  d = await terningene();
  t.sjekk(d.map((x) => x.merke).join() === "×1,×2", `Etter ett trekk med en dobbel: ${d.map((x) => x.merke)}`);
  await t.bilde("dobbel");
  await klikk('[data-h="angre"]');

  // The cube: white offers, black takes
  await lastMed(t, `(S) => { const sp = S.spill; sp.tur = 0; sp.kast = null; sp.rest = []; sp.steg = []; sp.apning = false; }`);
  t.sjekk(await t.finnes('[data-h="doble"]'), "«Doble» mangler før kastet");
  await klikk('[data-h="doble"]');
  t.sjekk(await t.finnes('[data-h="ta"]') && (await t.finnes('[data-h="slipp"]')), "Doblingen kan ikke tas imot eller gis opp");
  await t.bilde("dobling");
  await klikk('[data-h="ta"]');
  s = await sp();
  t.sjekk(s.kubeVerdi === 2 && s.kubeEier === 1 && s.tilbud === -1, "Doblingen ble ikke tatt imot");
  t.sjekk(!(await t.finnes('[data-h="doble"]')), "Hvit kan doble igjen uten å eie kuben");

  // The end: white bears off the last checker, black has none off → gammon × 2 = 4 → match won
  const slutt = tom();
  slutt[0] = 14;
  slutt[2] = 1;
  slutt[26 + 13] = 15;
  // (With 4-3 only one die can be used, so the larger: the 4 takes it off.)
  await lastMed(t, `(S) => { const sp = S.spill; sp.pos = ${JSON.stringify(slutt)}; sp.tur = 0; sp.kast = [4, 3]; sp.rest = [4, 3]; sp.steg = []; sp.apning = false; }`);
  await t.bilde("nesten-ferdig");
  await brettSjekk("nesten-ferdig");
  t.sjekk(await t.finnes(".tv-ut.s0.mal"), "Ut-feltet lyser ikke når den eneste brikken kan tas ut");
  await klikk(".tv-ut.s0");
  s = await sp();
  t.sjekk(s.pos[0] === 15, "Den siste brikken ble ikke tatt ut");
  await klikk('[data-h="ferdig"]', 700);
  s = await sp();
  t.sjekk(s.resultat && s.resultat.type === 2 && s.resultat.poeng === 4 && s.poeng[0] === 4, `Gammon med kuben på 2 skal gi 4 poeng: ${JSON.stringify(s.resultat)}`);
  t.sjekk(!t.norsk || /Gammon/.test(await t.tekst(".tv-melding")), "Meldingen sier ikke «Gammon»");
  await t.bilde("gammon");
  await klikk('[data-h="angre"]');
  s = await sp();
  t.sjekk(!s.resultat && s.poeng[0] === 0 && s.pos[0] === 14, "«Angre» tok ikke tilbake seieren");
  await klikk(punkt(2));
  await klikk(".tv-ut.s0");
  await klikk('[data-h="ferdig"]', 700);
  await klikk('[data-h="kaaring"]', 900);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.bilde("kaaringen", true);
  t.sjekk(!t.norsk || /Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), `Kåringen: «${await t.tekst("#skjerm h1")}»`);
  s = await t.tilstand();
  t.sjekk(s.spill.registrert === true && s._aktiv === false, "Kåringen ble ikke registrert for kvelden");
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen mangler «Del resultatet»");

  // Against the phone, Vanskelig, one game
  await klikk('[data-h="endre"]');
  await klikk('[data-h="modus"][data-v="mobil"]');
  await klikk('[data-h="niva"][data-v="3"]');
  await klikk('[data-h="mal"][data-v="1"]');
  await t.bilde("oppsett-mobil", true);
  await klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.tv-p').length === 24");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  // Play a few turns: our moves by the first legal target, the phone answers by itself.
  // (The phone may offer a double: we take it.)
  const taImot = async () => {
    if (await t.finnes('[data-h="ta"]')) {
      await t.bilde("mobilen-dobler");
      await klikk('[data-h="ta"]', 600);
    }
  };
  for (let tur = 0; tur < 3; tur++) {
    await t.vent("(Rusj.S.spill.tur === 0 && Rusj.S.spill.tilbud < 0) || Rusj.S.spill.tilbud === 1 || Rusj.S.spill.resultat", 15000);
    await taImot();
    await t.vent("Rusj.S.spill.tur === 0 || Rusj.S.spill.resultat", 15000);
    if ((await sp()).resultat) break;
    if (await t.finnes('[data-h="kast"]:not([disabled])')) {
      await klikk('[data-h="kast"]', 150);
      await landet();
      await t.sov(300);
    }
    if (tur === 0) await t.bilde("din-tur");
    for (let n = 0; n < 5 && (await t.finnes(".tv-celle.kan")); n++) {
      if (!(await t.finnes(".tv-p.mal, .tv-ut.mal"))) await klikk(".tv-celle.kan");
      if (!(await t.finnes(".tv-p.mal, .tv-ut.mal"))) break;
      await klikk(".tv-p.mal, .tv-ut.mal");
    }
    await klikk('[data-h="ferdig"]', 500);
    if (tur === 0) await t.bilde("mobilen-spiller");
  }
  await t.vent("(Rusj.S.spill.tur === 0 && Rusj.S.spill.tilbud < 0) || Rusj.S.spill.tilbud === 1 || Rusj.S.spill.resultat", 15000);
  await taImot();
  await t.vent("Rusj.S.spill.tur === 0 || Rusj.S.spill.resultat", 15000);
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(gap < 150, `Siden frøs i ${Math.round(gap)} ms mens mobilen tenkte`);
  await t.bilde("etter-mobilen");
  await brettSjekk("mot mobilen");

  // A win against the phone counts in the record
  const vinn = tom();
  vinn[0] = 14;
  vinn[1] = 1;
  vinn[26] = 3;
  vinn[26 + 6] = 12;
  await lastMed(t, `(S) => { const sp = S.spill; sp.pos = ${JSON.stringify(vinn)}; sp.tur = 0; sp.kast = [4, 2]; sp.rest = [4, 2]; sp.steg = []; sp.apning = false; sp.tilbud = -1; }`);
  await klikk(punkt(1));
  await klikk(".tv-ut.s0");
  await klikk('[data-h="ferdig"]', 700);
  s = await sp();
  t.sjekk(s.resultat && s.resultat.vinner === 0 && s.resultat.type === 1, "Seieren mot mobilen ble ikke registrert");
  await klikk('[data-h="kaaring"]', 900);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.bilde("kaaringen-mobil", true);
  s = await t.tilstand();
  t.sjekk(s.rekord && s.rekord[3] && s.rekord[3].seier === 1, "Seieren teller ikke i rekorden");
  t.sjekk(s.sist && s.sist.tekst, "«Sist»-linja ble ikke lagret");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.tv-rekorder')");
  await t.bilde("hjem-rekord", true);
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(JSON.stringify(merker).includes("klassiker-tavla"), "Klistremerket «Alle hjem» ble ikke gitt");
}
