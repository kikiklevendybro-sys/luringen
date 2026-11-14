// Brikka (ludo): two players – no six (three tries), a six brings a piece out by itself and
// gives another roll, a single option moves by itself, a real choice with target markers, reload
// mid-choice, a knock-out, undo, back + continue, «Avslutt»; then one player against three phones
// (reduced motion) that play by themselves, an exact roll into the goal and the crowning; small
// screens. Dice are forced by stubbing crypto.getRandomValues; positions are set up through Rusj.S.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en brikka): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names and the links (t.forside, t.nokkel).
const NAVN = ["Testspiller A", "Testspiller B"];
const SP = (t) => `JSON.parse(localStorage.getItem("${t.nokkel("brikka.v1")}")).spill`;

export default async function (t) {
  const terninger = (verdier) =>
    t.js(`(() => { const v = ${JSON.stringify(verdier)}; let i = 0; crypto.getRandomValues = (a) => { a[0] = Math.floor((v[i++ % v.length] - 0.5) / 6 * 4294967296); return a; }; })()`);
  const ekte = () => t.js("delete crypto.getRandomValues");
  // What the die shows on top, read from how the cube is turned on screen (the kit's R.terninger).
  const topp = (sel) =>
    t.js(`(() => {
      const b = document.querySelector("${sel} .trn-t");
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
      return verdi;
    })()`);

  // Waits until nothing moves on the board (the die has landed, no piece is walking).
  const stille = () => t.vent("document.querySelector('#bk-brett') && !document.querySelector('#bk-brett[data-opptatt]')", 9000);
  const kast = async () => {
    await stille();
    await t.klikk('.dokk [data-h="kast"]', 60);
  };
  let s;

  // ---------- Setup ----------
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 2, "Oppsettet viser ikke de to spillerne");
  t.sjekk(await t.finnes('[data-h="roboter"][data-v="0"][aria-pressed="true"]'), "To spillere skal starte uten mobil-motspillere");
  t.sjekk(await t.js(`document.querySelector('[data-h="roboter"][data-v="3"]').disabled`), "To spillere + tre roboter (fem) skulle ikke vært mulig");
  t.sjekk((await t.antall('.bryter[aria-pressed="true"]')) === 2, "«Seks gir ekstra kast» og «Nøyaktig inn i mål» skal være på fra start");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#bk-brett .bk-bunn')");
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.seter.map((d) => d.sete)) === "[0,2]", "To spillere skal sitte overfor hverandre (Rosa og Blå)");
  t.sjekk((await t.antall("#bk-brett .bk-brikke")) === 8, "Brettet skal vise åtte brikker");
  t.sjekk(s._aktiv === true, "Spillet regnes ikke som pågående");
  const A = s.spill.tur;
  const B = A === 0 ? 2 : 0;
  const navnA = NAVN[s.spill.seter.find((d) => d.sete === A).i];
  t.sjekk((await t.tekst("#skjerm h1")).trim() === navnA, "Overskriften viser ikke hvem som skal kaste");
  await t.sov(500);
  await t.bilde("brett");

  // ---------- No six: try again (three tries with nothing out) ----------
  await terninger([3]);
  await kast();
  await t.vent(`${SP(t)}.kast === null && ${SP(t)}.forsok === 1`, 7000);
  s = await t.tilstand();
  t.sjekk(s.spill.tur === A, "Uten brikker ute skal man få prøve igjen");
  t.sjekk((await topp("#bk-terning")) === 3, `Terningen viser ${await topp("#bk-terning")} på toppen, kastet var 3`);
  t.sjekk(!t.norsk || /forsøk/.test(await t.tekst("#bk-status")), "Statuslinja forteller ikke om forsøkene");
  t.sjekk(!t.norsk || /Prøv igjen/.test(await t.tekst(".dokk .knapp")), "Knappen skal si «Prøv igjen»");
  await t.bilde("ikke-seks");

  // ---------- A six: out by itself, and another roll ----------
  await terninger([6]);
  await kast();
  await t.vent(`${SP(t)}.brikker[${A}].includes(0) && ${SP(t)}.kast === null`, 7000);
  s = await t.tilstand();
  t.sjekk(s.spill.tur === A && s.spill.ekstra, "En sekser skal gi et ekstra kast");
  await t.sov(400);
  await t.bilde("ute");

  // ---------- One piece out: it moves by itself (onto the star square), then the turn passes ----------
  await terninger([4]);
  await kast();
  await t.vent(`${SP(t)}.tur === ${B} && ${SP(t)}.kast === null`, 8000);
  s = await t.tilstand();
  t.sjekk(s.spill.brikker[A].includes(4), `Brikken flyttet ikke fire felt (${s.spill.brikker[A]})`);
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "Et trekk mobilen gjorde selv, skal ikke kunne angres");

  // ---------- A real choice: two pieces, one can knock ----------
  await stille();
  await t.js(`(() => {
    const F = RusjBrikka, sp = Rusj.S.spill;
    const mal = (F.START[${A}] + 11) % 40;
    sp.tur = ${A}; sp.kast = null; sp.forsok = 0; sp.ekstra = false; sp.angre = null;
    sp.brikker[${A}] = [8, 20, -1, -1];
    sp.brikker[${B}] = [(mal - F.START[${B}] + 40) % 40, -1, -1, -1];
    Rusj.vis();
  })()`);
  await terninger([3]);
  await kast();
  await t.vent("document.querySelectorAll('#bk-brett .bk-brikke.kan').length === 2", 7000);
  t.sjekk(await t.finnes(".bk-mal-merke.knuff"), "Målet som gir knuff, er ikke merket");
  t.sjekk(!t.norsk || /Velg en brikke/.test(await t.tekst("#bk-status")), "Statuslinja ber ikke om å velge en brikke");
  await t.bilde("velg-brikke");
  await t.lastSide(t.side, "document.querySelector('#bk-brett .bk-bunn')");
  s = await t.tilstand();
  t.sjekk(s.spill.kast === 3 && (await t.antall("#bk-brett .bk-brikke.kan")) === 2, "Valget forsvant etter omlasting");
  await t.klikk(`#bk-brett .bk-brikke.kan[data-v="${A}:0"]`, 60);
  await t.vent(`${SP(t)}.brikker[${B}][0] === -1 && ${SP(t)}.tur === ${B}`, 7000);
  await stille();
  await t.sov(200);
  await t.bilde("knuff");
  t.sjekk(await t.finnes('[data-h="angre"]'), "Mangler «Angre trekket» etter et valgt trekk");
  await t.klikk('[data-h="angre"]');
  s = await t.tilstand();
  t.sjekk(s.spill.tur === A && s.spill.kast === 3 && s.spill.brikker[A][0] === 8 && s.spill.brikker[B][0] !== -1, "«Angre» satte ikke brikkene tilbake");
  await t.klikk(`#bk-brett .bk-mal-merke[data-v="${A}:1"]`, 60);
  await t.vent(`${SP(t)}.brikker[${A}][1] === 23 && ${SP(t)}.tur === ${B}`, 7000);
  s = await t.tilstand();
  t.sjekk(s.spill.brikker[B][0] !== -1, "Den andre brikken skulle ikke knuffet noen");
  await stille();
  await ekte();

  // ---------- Back to home keeps the game; «Nytt spill» asks first ----------
  await t.sov(500);
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spurte ikke først");
  await t.klikk('#ark [data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('#bk-brett .bk-bunn')");

  // «Avslutt» asks, and the one who has come furthest is crowned
  t.sjekk(!t.norsk || (await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte skal hete «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(t.norsk ? (await t.tekst("#skjerm h1")).trim() === `${navnA} vinner!` : (await t.tekst("#skjerm h1")).includes(navnA), `Den som har kommet lengst, skal kåres: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.tilstand())._aktiv === false, "Et avsluttet spill skal ikke være merket som pågående");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");
  await t.bilde("avsluttet", true);
  // The kit offers «Ha rusj som app» a moment after a crowning with points: close it.
  await t.sov(2000);
  if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "brikka"), "Kåringen ble ikke registrert i «Kveldens gjeng»");

  // ---------- One player against three phones ----------
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="1"]');
  t.sjekk(await t.finnes('[data-h="roboter"][data-v="1"][aria-pressed="true"]'), "Alene skal mobilen spille mot deg");
  await t.klikk('[data-h="roboter"][data-v="3"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('#bk-brett .bk-brikke').length === 16");
  // Play our own turns while the phones play theirs, until everyone has had a couple of turns.
  for (let n = 0; n < 120; n++) {
    s = await t.tilstand();
    if (s.spill.nr >= 9 && s.spill.tur === 0 && s.spill.kast === null) break;
    if (s.spill.tur === 0 && !(await t.finnes("#bk-brett[data-opptatt]"))) {
      if (s.spill.kast === null) await kast();
      else if (await t.finnes("#bk-brett .bk-brikke.kan")) await t.klikk("#bk-brett .bk-brikke.kan", 60);
    }
    await t.sov(250);
  }
  s = await t.tilstand();
  t.sjekk(s.spill.nr >= 9 && s.spill.tur === 0, `Mobilen spilte ikke turene sine (tur nr. ${s.spill.nr})`);
  t.sjekk(s.spill.seter.filter((d) => d.type === "r").length === 3, "Tre plasser skulle vært mobilen");
  await stille();
  await t.bilde("mot-mobilen");

  // An exact roll into the goal wins
  await stille();
  await t.js(`(() => { const sp = Rusj.S.spill; sp.brikker[0] = [44, 44, 44, 40]; sp.kast = null; sp.forsok = 0; sp.ekstra = false; Rusj.vis(); })()`);
  await terninger([5]);
  await kast();
  await t.vent(`${SP(t)}.kast === null && ${SP(t)}.tur !== 0`, 8000);
  t.sjekk((await t.tilstand()).spill.brikker[0][3] === 40, "5 fra felt 40 skulle ikke kunne gå i mål (nøyaktig kast)");
  await t.vent(`${SP(t)}.tur === 0 && ${SP(t)}.kast === null`, 30000);
  await stille();
  await t.js(`(() => { const sp = Rusj.S.spill; sp.brikker[0] = [44, 44, 44, 40]; Rusj.vis(); })()`);
  await terninger([4]);
  await kast();
  await t.vent("document.querySelector('.skjerm-slutt')", 9000);
  await ekte();
  await t.send("Emulation.setEmulatedMedia", { features: [] });
  await t.sov(700);
  await t.bilde("kaaring", true);
  t.sjekk(t.norsk ? (await t.tekst("#skjerm h1")).trim() === "Testspiller A vinner!" : (await t.tekst("#skjerm h1")).includes("Testspiller A"), `Vinneren vises ikke: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".bk-rang li")) === 4, "Rangeringen skal vise alle fire");

  // ---------- Small screens: the whole board above the dock ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('#bk-brett .bk-bunn')");
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[320, 568], [Math.min(375, b0), 560]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    await t.js("window.scrollTo(0, 0)");
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Siden er for bred på ${b} px`);
    const synlig = await t.js("(() => { const d = document.querySelector('.dokk .knapp').getBoundingClientRect().top; const brett = document.querySelector('#bk-brett').getBoundingClientRect(); return brett.bottom <= d + 1 && brett.top >= 0; })()");
    t.sjekk(synlig, `Brettet skjules bak knappen på ${b} × ${h}`);
    await t.bilde(`brett-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.send("Emulation.setEmulatedMedia", { features: [] });
}
