// Terninga (Yatzy): two players roll, hold and roll again, score a house, undo it, reload mid-turn,
// back + continue, the pad sheet, a real double tap on «Kast», a forced Yatzy, then the whole game to
// the crowning (fast, with reduced motion). Then a solo six-dice Yatzy, saved rolls and an
// early end, plus the smallest screens. Dice are forced by stubbing crypto.getRandomValues.
const NAVN = ["Testspiller A", "Testspiller B"];

export default async function (t) {
  const landet = () => t.vent("document.querySelector('#tg-brett') && !document.querySelector('#tg-brett[data-ruller]')", 9000);
  // The next dice rolled show these values (in order); ekte() gives real randomness back.
  const terninger = (verdier) =>
    t.js(`(() => { const v = ${JSON.stringify(verdier)}; let i = 0; crypto.getRandomValues = (a) => { a[0] = Math.floor((v[i++ % v.length] - 0.5) / 6 * 4294967296); return a; }; })()`);
  const ekte = () => t.js("delete crypto.getRandomValues");
  const kast = async () => {
    await t.klikk('[data-h="kast"]', 60);
    await landet();
    await t.sov(150);
  };
  // Waits for player i's turn to be drawn (state first, then the redraw after the stamped box).
  const tur = (i) => t.vent(`(JSON.parse(localStorage.getItem("rusj.terninga.v1")).spill || {}).tur === ${i} && document.querySelector('#tg-brett') && !document.querySelector('#skjerm .tg-felt.ny')`, 5000);
  const felt = (k) => `[data-h="sett"][data-v="${k}"]`;
  const verdi = (k) => t.js(`document.querySelector('${felt(k)} .tg-verdi').textContent.trim()`);
  let s;

  // ---------- Setup: the mode comes first ----------
  await t.start({ navn: NAVN });
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.js(`!!document.querySelector('#skjerm section').querySelector('[data-h="variant"]')`), "Valget av Yatzy-variant skal være første seksjon i oppsettet");
  t.sjekk((await t.antall(".spiller")) === 2, "Oppsettet viser ikke de to spillerne");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('#tg-brett .tg-t').length === 5");
  t.sjekk((await t.antall('[data-h="sett"]')) === 15, "Blokka skal ha 15 felt");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[0], "Første spiller står ikke øverst");
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet regnes ikke som pågående");
  await t.bilde("forste-tur");

  // Nothing can be held or scored before the first roll
  await t.klikk('[data-h="hold"][data-v="0"]');
  await t.klikk(felt("sjanse"));
  s = await t.tilstand();
  t.sjekk(s.spill.holdt.every((h) => !h) && s.spill.kort[0].sjanse == null, "Man kan holde eller fylle før første kast");

  // ---------- Roll, hold, roll again ----------
  await terninger([2, 2, 5, 5, 6]);
  await kast();
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.terninger) === "[2,2,5,5,6]" && s.spill.kast === 1, `Kastet ga ${s.spill.terninger}`);
  t.sjekk((await verdi("par2")) === "14" && (await verdi("par1")) === "10" && (await verdi("sjanse")) === "20", "Blokka viser feil mulige poeng etter første kast");
  t.sjekk(await t.finnes(`${felt("hus")}.mulig.null`), "Hus skal vises som 0 (kan strykes)");
  t.sjekk(/2 kast igjen/.test(await t.js(`document.querySelector('[data-h="kast"]').getAttribute("aria-label")`)), "Kast-knappen sier ikke hvor mange kast som er igjen");
  await t.bilde("kast-1");
  await t.klikk('[data-h="hold"][data-v="0"]', 60);
  await t.klikk('[data-h="hold"][data-v="1"]', 60);
  t.sjekk((await t.antall('.tg-t[aria-pressed="true"]')) === 2, "To terninger skulle vært holdt");
  await t.bilde("holdt");
  await terninger([5, 5, 5]);
  await kast();
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.terninger) === "[2,2,5,5,5]" && s.spill.kast === 2, `Holdte terninger ble kastet på nytt: ${s.spill.terninger}`);
  t.sjekk((await verdi("hus")) === "19", "Hus skal gi 19");
  t.sjekk(await t.finnes(".tg-stempel"), "Et hus skal feires med et stempel");
  await t.bilde("hus");

  // Reload in the middle of the turn: same dice, same holds, same roll count
  await t.lastSide(t.side, "document.querySelector('#tg-brett')");
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.terninger) === "[2,2,5,5,5]" && s.spill.kast === 2 && s.spill.holdt[0] && s.spill.holdt[1], "Omlasting mistet terningene eller holdene");
  t.sjekk((await t.antall('.tg-t[aria-pressed="true"]')) === 2, "De holdte terningene vises ikke etter omlasting");

  // ---------- Score, undo, score again ----------
  await t.klikk(felt("hus"), 100);
  await tur(1);
  s = await t.tilstand();
  t.sjekk(s.spill.kort[0].hus === 19 && s.spill.kast === 0, "Hus ble ikke fylt med 19");
  t.sjekk(/Angre Hus/.test(await t.tekst('[data-h="angre"]')), "Mangler «Angre Hus» på neste spillers tur");
  await t.bilde("neste-spiller");
  await t.klikk('[data-h="angre"]');
  await tur(0);
  s = await t.tilstand();
  t.sjekk(s.spill.kort[0].hus == null && s.spill.kast === 2 && JSON.stringify(s.spill.terninger) === "[2,2,5,5,5]", "«Angre» ga ikke tilbake turen med samme terninger");
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "«Angre» skal forsvinne når den er brukt");
  await t.klikk(felt("sjanse"), 100);
  await tur(1);
  t.sjekk((await t.tilstand()).spill.kort[0].sjanse === 19, "Sjanse ble ikke 19");

  // A real double tap on «Kast» rolls only once
  await t.sov(400);
  await terninger([6, 6, 6, 6, 6]);
  const knapp = await t.js(`(() => { const b = document.querySelector('[data-h="kast"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  for (const n of [1, 2]) {
    await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: knapp.x, y: knapp.y, button: "left", buttons: 1, clickCount: n });
    await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: knapp.x, y: knapp.y, button: "left", buttons: 0, clickCount: n });
    if (n === 1) await t.sov(90);
  }
  await t.sov(300);
  await t.bilde("ruller");
  await landet();
  s = await t.tilstand();
  t.sjekk(s.spill.kast === 1, `Et dobbelttrykk på «Kast» kastet ${s.spill.kast} ganger`);
  t.sjekk((await verdi("yatzy")) === "50" && (await t.finnes(".tg-stempel")), "Yatzy feires ikke / gir ikke 50");
  await t.sov(300);
  await t.bilde("yatzy");
  await t.klikk(felt("yatzy"), 100);
  await tur(0);
  t.sjekk((await t.tilstand()).spill.kort[1].yatzy === 50, "Yatzy ble ikke fylt med 50");
  await ekte();

  // ---------- Back to home keeps the game; «Nytt spill» asks first ----------
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spurte ikke først");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om man trykket Avbryt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('#tg-brett')");
  await t.klikk('[data-h="blokka"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .tg-tabell"), "Blokka for alle vises ikke");
  await t.bilde("blokka-ark");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Play the rest quickly (reduced motion) ----------
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  for (let n = 0; n < 40; n++) {
    s = await t.tilstand();
    if (s.spill.kort.every((k) => Object.keys(k).length === 15)) break;
    const hvem = s.spill.tur;
    await kast();
    await t.klikk('[data-h="sett"].mulig', 60);
    await t.vent(`JSON.parse(localStorage.getItem("rusj.terninga.v1")).spill.tur !== ${hvem} || JSON.parse(localStorage.getItem("rusj.terninga.v1")).spill.kort.every((k) => Object.keys(k).length === 15)`, 4000);
    await t.vent("!document.querySelector('#skjerm .tg-felt.ny')", 4000);
  }
  s = await t.tilstand();
  t.sjekk(s.spill.kort.every((k) => Object.keys(k).length === 15), "Blokkene ble ikke fylt");
  await t.vent("document.querySelector('[data-h=\"kaaring\"]')");
  t.sjekk(await t.finnes('[data-h="angre"]'), "Det siste feltet skal kunne angres før kåringen");
  await t.bilde("full-blokk");
  const totaler = await t.js(`(() => { const sp = JSON.parse(localStorage.getItem("rusj.terninga.v1")).spill; return sp.kort.map((k) => RusjTerninga.summer("vanlig", k).total); })()`);
  await t.klikk('[data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.send("Emulation.setEmulatedMedia", { features: [] });
  await t.sov(600);
  await t.bilde("kaaring", true);
  const best = Math.max(...totaler);
  const vinnere = NAVN.filter((_, i) => totaler[i] === best);
  const h1 = (await t.tekst("#skjerm h1")).trim();
  t.sjekk(h1 === `${vinnere.join(" og ")} vinner!`, `Kåringen sier «${h1}», poengene var ${totaler.join(" – ")}`);
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk((await t.finnes(".poengliste")) && (await t.finnes(".tg-tabell")), "Kåringen mangler poengliste eller blokka");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  s = await t.tilstand();
  t.sjekk(s._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk(s.rekord && s.rekord.vanlig && s.rekord.vanlig.poeng === best, "Rekorden ble ikke lagret");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "terninga"), "Kåringen ble ikke registrert i «Kveldens gjeng»");

  // ---------- Solo six-dice Yatzy: 20 boxes, saved rolls ----------
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="1"]');
  await t.klikk('[data-h="variant"][data-v="maxi"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('#tg-brett .tg-t').length === 6");
  t.sjekk((await t.antall('[data-h="sett"]')) === 20, "Yatzy med seks terninger skal ha 20 felt");
  await terninger([3, 3, 3, 3, 3, 3]);
  await kast();
  t.sjekk((await verdi("yatzy")) === "100", "Seks like skal gi 100");
  await t.sov(300);
  await t.bilde("maxi-yatzy");
  await t.klikk(felt("yatzy"), 100);
  await t.vent(`JSON.parse(localStorage.getItem("rusj.terninga.v1")).spill.kast === 0 && !document.querySelector('#skjerm .tg-felt.ny')`);
  s = await t.tilstand();
  t.sjekk(s.spill.kort[0].yatzy === 100 && s.spill.spart[0] === 2, `To kast skulle vært spart (spart: ${s.spill.spart[0]})`);
  t.sjekk(/\+2/.test(await t.tekst('[data-h="kast"]')), "Kast-knappen viser ikke de sparte kastene");
  await terninger([1, 2, 3, 4, 5, 6]);
  for (let n = 0; n < 4; n++) await kast();
  s = await t.tilstand();
  t.sjekk(s.spill.kast === 4 && s.spill.spart[0] === 1, `Fjerde kast skulle brukt et spart kast (kast ${s.spill.kast}, spart ${s.spill.spart[0]})`);
  t.sjekk((await verdi("full")) === "21", "Full straight skal gi 21");
  await t.bilde("maxi-spart");
  await ekte();

  // ---------- Small screens: dice and pad stay above the dock ----------
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[320, 568], [Math.min(375, b0), 560]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    await t.js("window.scrollTo(0, 0)");
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Siden er for bred på ${b} px`);
    const over = await t.js("(() => { const d = document.querySelector('.dokk .knapp').getBoundingClientRect().top; const brett = document.querySelector('#tg-brett').getBoundingClientRect(); const over = document.querySelector('.tg-over').getBoundingClientRect(); return brett.bottom <= d && over.bottom <= d; })()");
    t.sjekk(over, `Terningene eller blokka skjules bak knappen på ${b} × ${h}`);
    await t.bilde(`maxi-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // «Avslutt» asks, then crowns the solo game (no record from an unfinished pad)
  t.sjekk((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte skal hete «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="ja"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  await t.bilde("solo-slutt", true);
  s = await t.tilstand();
  t.sjekk(!s.rekord.maxi, "Et uferdig spill skal ikke gi rekord");
  t.sjekk(/poeng/.test(await t.tekst(".tg-sluttpoeng")), "Solo-kåringen viser ikke poengene");

  // Home shows the record
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.tg-rekorder')");
  t.sjekk(/Yatzy/.test(await t.tekst(".tg-rekorder")), "Rekorden vises ikke på hjem-skjermen");
  await t.bilde("hjem-rekord");
}
