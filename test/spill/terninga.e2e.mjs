// Terninga (Yatzy): two players roll (a swipe on the tray, then the button), hold and roll again,
// score a house, undo it, reload mid-turn, back + continue, the pad sheet, a real double tap on
// «Kast», a forced Yatzy, then the whole game to the crowning (fast, with reduced motion). Then a
// solo six-dice Yatzy, saved rolls and an early end, plus the smallest screens. Dice are forced by
// stubbing crypto.getRandomValues; the tray is the kit's (R.terninger, rusj/kit/terninger.js).
// Runs in every edition (node test/rusj-e2e.mjs --sprak en terninga): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names and the links (t.forside, t.nokkel).
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
  // A real fling with a finger: from the middle of `fra` (a die or the tray) upwards, fast.
  const sveip = async (fra, dy = -150) => {
    await t.js(`document.querySelector(${JSON.stringify(fra)}).scrollIntoView({ block: "center" })`);
    await t.sov(150);
    const p = await t.js(`(() => { const b = document.querySelector(${JSON.stringify(fra)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    for (let i = 1; i <= 6; i++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + i * 3, y: p.y + (dy * i) / 6 }] });
      await t.sov(12);
    }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  // The value on the face that points up on every die, read from how the cube is turned on screen.
  const topp = () =>
    t.js(`Array.from(document.querySelectorAll("#tg-brett .trn-t")).map((b) => {
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
    }).join(",")`);
  // Waits for player i's turn to be drawn (state first, then the redraw after the stamped box).
  const tur = (i) => t.vent(`(JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill || {}).tur === ${i} && document.querySelector('#tg-brett') && !document.querySelector('#skjerm .tg-felt.ny')`, 5000);
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
  await t.vent("document.querySelectorAll('#tg-brett .trn-t').length === 5");
  t.sjekk((await t.antall('[data-h="sett"]')) === 15, "Blokka skal ha 15 felt");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[0], "Første spiller står ikke øverst");
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet regnes ikke som pågående");
  await t.bilde("forste-tur");

  // Nothing can be held or scored before the first roll
  await t.klikk('[data-h="hold"][data-v="0"]');
  await t.klikk(felt("sjanse"));
  s = await t.tilstand();
  t.sjekk(s.spill.holdt.every((h) => !h) && s.spill.kort[0].sjanse == null, "Man kan holde eller fylle før første kast");

  t.sjekk(await t.finnes("#tg-brett.trn-klar .trn-sveip"), "Brettet viser ikke at man kan sveipe for å kaste");
  t.sjekk(await t.js(`Array.from(document.querySelectorAll("#tg-brett .trn-t")).every((b) => /[0-9]/.test(b.getAttribute("aria-label")) && b.getAttribute("aria-pressed") === "false")`), "Terningene mangler etikett eller aria-pressed");

  // ---------- Roll with a swipe (it starts on a die: a fling never holds it), hold, roll again ----------
  await terninger([2, 2, 5, 5, 6]);
  await sveip('#tg-brett .trn-t[data-v="2"]');
  await t.sov(220);
  await t.bilde("sveip-i-lufta");
  await landet();
  await t.sov(200);
  await t.bilde("sveip-landet");
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.terninger) === "[2,2,5,5,6]" && s.spill.kast === 1, `Sveipet ga ${s.spill.terninger} (kast ${s.spill.kast})`);
  t.sjekk(s.spill.holdt.every((h) => !h), "Et sveip som startet på en terning holdt den");
  // what the dice show on top is what the game rolled (the kit relabels the dice, never the result)
  t.sjekk((await topp()) === "2,2,5,5,6", `Terningene viser ${await topp()} på toppen, spillet kastet 2,2,5,5,6`);
  t.sjekk((await verdi("par2")) === "14" && (await verdi("par1")) === "10" && (await verdi("sjanse")) === "20", "Blokka viser feil mulige poeng etter første kast");
  t.sjekk(await t.finnes(`${felt("hus")}.mulig.null`), "Hus skal vises som 0 (kan strykes)");
  t.sjekk((t.norsk ? /2 kast igjen/ : /2/).test(await t.js(`document.querySelector('[data-h="kast"]').getAttribute("aria-label")`)), "Kast-knappen sier ikke hvor mange kast som er igjen");
  await t.bilde("kast-1");
  await t.klikk('[data-h="hold"][data-v="0"]', 60);
  await t.klikk('[data-h="hold"][data-v="1"]', 60);
  t.sjekk((await t.antall('.trn-t[aria-pressed="true"]')) === 2, "To terninger skulle vært holdt");
  await t.sov(350);
  const paHylla = await t.js(`(() => {
    const h = document.querySelector("#tg-brett .trn-hylle").getBoundingClientRect();
    return Array.from(document.querySelectorAll('.trn-t[aria-pressed="true"]')).every((b) => { const r = b.getBoundingClientRect(); const y = r.y + r.height / 2; return y > h.top && y < h.bottom; });
  })()`);
  t.sjekk(paHylla, "De holdte terningene ligger ikke på hylla");
  // With the keyboard: a die is a button – Enter holds it, Enter again lets it go
  const tast = async () => {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await t.sov(450);
  };
  await t.js(`document.querySelector('#tg-brett .trn-t[data-v="3"]').focus()`);
  await tast();
  t.sjekk((await t.tilstand()).spill.holdt[3] && (await t.finnes('#tg-brett .trn-t[data-v="3"][aria-pressed="true"]')), "Enter på en terning holdt den ikke");
  t.sjekk(await t.js(`document.activeElement === document.querySelector('#tg-brett .trn-t[data-v="3"]')`), "Fokus forsvant fra terningen som ble holdt");
  await tast();
  t.sjekk(!(await t.tilstand()).spill.holdt[3] && (await t.antall('.trn-t[aria-pressed="true"]')) === 2, "Enter en gang til slapp ikke terningen");
  await t.js("document.activeElement.blur()");
  await t.bilde("holdt");
  await terninger([5, 5, 5]);
  await t.klikk('[data-h="kast"]', 60);
  await t.sov(200);
  await t.bilde("knapp-i-lufta");
  await landet();
  await t.sov(150);
  t.sjekk((await topp()) === "2,2,5,5,5", `Terningene viser ${await topp()} på toppen etter andre kast`);
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.terninger) === "[2,2,5,5,5]" && s.spill.kast === 2, `Holdte terninger ble kastet på nytt: ${s.spill.terninger}`);
  t.sjekk((await verdi("hus")) === "19", "Hus skal gi 19");
  t.sjekk(await t.finnes(".tg-stempel"), "Et hus skal feires med et stempel");
  await t.bilde("hus");

  // Reload in the middle of the turn: same dice, same holds, same roll count
  await t.lastSide(t.side, "document.querySelector('#tg-brett')");
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.terninger) === "[2,2,5,5,5]" && s.spill.kast === 2 && s.spill.holdt[0] && s.spill.holdt[1], "Omlasting mistet terningene eller holdene");
  t.sjekk((await t.antall('.trn-t[aria-pressed="true"]')) === 2, "De holdte terningene vises ikke etter omlasting");
  t.sjekk((await topp()) === "2,2,5,5,5", `Etter omlasting viser terningene ${await topp()}`);

  // ---------- Score, undo, score again ----------
  await t.klikk(felt("hus"), 100);
  await tur(1);
  s = await t.tilstand();
  t.sjekk(s.spill.kort[0].hus === 19 && s.spill.kast === 0, "Hus ble ikke fylt med 19");
  t.sjekk((t.norsk ? /Angre Hus/ : /↶/).test(await t.tekst('[data-h="angre"]')), "Mangler «Angre Hus» på neste spillers tur");
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
    await t.vent(`JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill.tur !== ${hvem} || JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill.kort.every((k) => Object.keys(k).length === 15)`, 4000);
    await t.vent("!document.querySelector('#skjerm .tg-felt.ny')", 4000);
  }
  s = await t.tilstand();
  t.sjekk(s.spill.kort.every((k) => Object.keys(k).length === 15), "Blokkene ble ikke fylt");
  await t.vent("document.querySelector('[data-h=\"kaaring\"]')");
  t.sjekk(await t.finnes('[data-h="angre"]'), "Det siste feltet skal kunne angres før kåringen");
  await t.bilde("full-blokk");
  const totaler = await t.js(`(() => { const sp = JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill; return sp.kort.map((k) => RusjTerninga.summer("vanlig", k).total); })()`);
  await t.klikk('[data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.send("Emulation.setEmulatedMedia", { features: [] });
  await t.sov(600);
  await t.bilde("kaaring", true);
  const best = Math.max(...totaler);
  const vinnere = NAVN.filter((_, i) => totaler[i] === best);
  const h1 = (await t.tekst("#skjerm h1")).trim();
  t.sjekk(t.norsk ? h1 === `${vinnere.join(" og ")} vinner!` : vinnere.every((n) => h1.includes(n)) && NAVN.every((n) => vinnere.includes(n) || !h1.includes(n)), `Kåringen sier «${h1}», poengene var ${totaler.join(" – ")}`);
  t.sjekk(!t.norsk || /KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk((await t.finnes(".poengliste")) && (await t.finnes(".tg-tabell")), "Kåringen mangler poengliste eller blokka");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");
  s = await t.tilstand();
  t.sjekk(s._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk(s.rekord && s.rekord.vanlig && s.rekord.vanlig.poeng === best, "Rekorden ble ikke lagret");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "terninga"), "Kåringen ble ikke registrert i «Kveldens gjeng»");

  // ---------- Solo six-dice Yatzy: 20 boxes, saved rolls ----------
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="1"]');
  await t.klikk('[data-h="variant"][data-v="maxi"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('#tg-brett .trn-t').length === 6");
  t.sjekk((await t.antall('[data-h="sett"]')) === 20, "Yatzy med seks terninger skal ha 20 felt");
  await terninger([3, 3, 3, 3, 3, 3]);
  await kast();
  t.sjekk((await verdi("yatzy")) === "100", "Seks like skal gi 100");
  await t.sov(300);
  await t.bilde("maxi-yatzy");
  await t.klikk(felt("yatzy"), 100);
  await t.vent(`JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill.kast === 0 && !document.querySelector('#skjerm .tg-felt.ny')`);
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
    const over = (await t.friForDokk("#tg-brett")) && (await t.friForDokk(".tg-over"));
    t.sjekk(over, `Terningene eller blokka skjules bak knappen på ${b} × ${h}`);
    // the whole pad stays above the dock's button (only the dock's soft fade may reach it)
    const blokk = await t.js(`(() => { window.scrollTo(0, 0); const p = document.querySelector(".tg-blokk").getBoundingClientRect(); const k = document.querySelector("#skjerm .dokk .knapp").getBoundingClientRect(); return [Math.round(p.bottom), Math.round(k.top)]; })()`);
    t.sjekk(blokk[0] <= blokk[1], `Blokka går bak kast-knappen på ${b} × ${h} (${blokk[0]} > ${blokk[1]})`);
    const side = await t.js(`parseFloat(getComputedStyle(document.querySelector("#tg-brett")).getPropertyValue("--trn-s"))`);
    t.sjekk(side >= 26, `Terningene er bare ${side} px på ${b} × ${h}`);
    await t.bilde(`maxi-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // «Avslutt» asks, then crowns the solo game (no record from an unfinished pad)
  t.sjekk(!t.norsk || (await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte skal hete «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="ja"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  await t.bilde("solo-slutt", true);
  s = await t.tilstand();
  t.sjekk(!s.rekord.maxi, "Et uferdig spill skal ikke gi rekord");
  t.sjekk((t.norsk ? /poeng/ : /\d/).test(await t.tekst(".tg-sluttpoeng")), "Solo-kåringen viser ikke poengene");

  // Home shows the record
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.tg-rekorder')");
  t.sjekk(/Yatzy/.test(await t.tekst(".tg-rekorder")), "Rekorden vises ikke på hjem-skjermen");
  await t.bilde("hjem-rekord");

  // ---------- Against the phone: one person and «Robo» (Vanskelig) to the end ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="variant"][data-v="vanlig"]');
  await t.klikk('[data-h="roboter"][data-v="1"]');
  t.sjekk(await t.finnes('[data-h="nivaa"][data-v="middels"][aria-pressed="true"]'), "Middels skal være valgt fra start");
  await t.klikk('[data-h="nivaa"][data-v="vanskelig"]');
  await t.bilde("oppsett-mot-mobilen", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#tg-brett')");
  s = await t.tilstand();
  t.sjekk(s.spill.antall === 2 && s.spill.mennesker === 1 && s.spill.nivaa === "vanskelig", "Spillet mot mobilen ble ikke satt opp riktig");
  // Our first box, then the phone's turn plays by itself (visibly: held dice, then rolls)
  await kast();
  await t.klikk('[data-h="sett"].mulig', 60);
  await t.vent(`(JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill || {}).tur === 1`, 5000);
  await t.vent("/Robo/.test(document.querySelector('#skjerm h1').textContent) && document.querySelector('[data-h=\"hopp-anim\"]')", 5000);
  t.sjekk(await t.js(`document.querySelector('.dokk [data-h="kast"]').disabled`), "Kast-knappen skal være av mens mobilen spiller");
  await t.klikk('[data-h="hold"][data-v="0"]');
  t.sjekk(!(await t.tilstand()).spill.holdt[0] || (await t.tilstand()).spill.kast > 0, "Man kan ikke holde terninger for mobilen");
  await t.vent(`JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill.kast >= 1 && !document.querySelector('#tg-brett[data-ruller]')`, 8000);
  await t.sov(700);
  await t.bilde("mobilen-spiller");
  // Reload in the middle of the phone's turn: it carries on and finishes its box
  await t.lastSide(t.side, "document.querySelector('#tg-brett')");
  await t.vent(`(() => { const sp = JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill; return sp.tur === 0 && Object.keys(sp.kort[1]).length === 1; })()`, 20000);
  // The rest quickly: «Hopp over animasjonen» on every phone turn, our own boxes as they come
  await t.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  for (let n = 0; n < 800; n++) {
    s = await t.tilstand();
    if (s.spill.kort.every((k) => Object.keys(k).length === 15)) break;
    if (s.spill.tur === 0 && !(await t.finnes("#tg-brett[data-ruller]")) && !(await t.finnes("#skjerm .tg-felt.ny"))) {
      if (s.spill.kast === 0) await kast();
      else if (await t.finnes('[data-h="sett"].mulig')) await t.klikk('[data-h="sett"].mulig', 60);
    } else if (await t.finnes('[data-h="hopp-anim"]:not(:disabled)')) await t.klikk('[data-h="hopp-anim"]:not(:disabled)', 60);
    await t.sov(150);
  }
  s = await t.tilstand();
  t.sjekk(s.spill.kort.every((k) => Object.keys(k).length === 15), "Spillet mot mobilen ble ikke ferdig: " + JSON.stringify({ tur: s.spill.tur, kast: s.spill.kast, holdt: s.spill.holdt, fylt: s.spill.kort.map((k) => Object.keys(k).length) }) + " " + (await t.js("document.querySelector('.tg-felt.ny') ? 'ny' : '-'")));
  await t.vent("document.querySelector('[data-h=\"kaaring\"]')", 8000);
  const robo = await t.js(`RusjTerninga.summer("vanlig", JSON.parse(localStorage.getItem("${t.nokkel("terninga.v1")}")).spill.kort[1]).total`);
  t.sjekk(robo >= 120, `Vanskelig fikk bare ${robo} poeng`);
  await t.klikk('[data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.send("Emulation.setEmulatedMedia", { features: [] });
  t.sjekk((t.norsk ? /vinner!/ : /!/).test(await t.tekst("#skjerm h1")), "Kåringen mot mobilen mangler vinner");
  t.sjekk(/Robo/.test(await t.tekst(".poengliste")), "Robo står ikke i poenglista");
  const kveld2 = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(!kveld2 || !JSON.stringify(kveld2).includes("Robo"), "Mobilen skal ikke stå i Kveldens gjeng");
  await t.sov(400);
  await t.bilde("kaaring-mot-mobilen", true);
}
