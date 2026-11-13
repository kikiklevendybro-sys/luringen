// Snekkeren: two players on 3 × 3 draw lines, a box is closed and its owner draws again, a tap
// beside a line draws the nearest free one, undo, a reload and back + continue, then the last line
// of a game and «Kåringen», and «Sist» on the home screen. Against the phone: it answers in time
// without freezing the page, «Angre» takes back its answer too, it never draws while a sheet is open,
// and a win counts in the record.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en snekkeren): texts are checked in
// Norwegian only (t.norsk).

const linje = (v) => `.sn-linje[data-v="${v}"]`;
// A whole 3 × 3 game (player 1 wins 6–3; the last line, 20, closes the last box). Found by a seeded
// self-play with the game's own rules.
const SLUTT = [6, 8, 12, 17, 14, 23, 0, 21, 4, 5, 10, 18, 7, 19, 11, 22, 16, 3, 13, 1, 2, 15, 9, 20];

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

async function brettPasser(t, navn) {
  await t.js("window.scrollTo(0, 0)");
  const mal = await t.js(`(() => {
    const b = document.querySelector('.skjerm-spill .sn-brett').getBoundingClientRect();
    const l = document.querySelector('.skjerm-spill .sn-linje').getBoundingClientRect();
    return { bredde: Math.round(b.width), linje: Math.round(Math.max(l.width, l.height)), tykk: Math.round(Math.min(l.width, l.height)), scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px («${navn}»)`);
  t.sjekk(mal.bredde >= 232, `Brettet er bare ${mal.bredde}px («${navn}»)`);
  t.sjekk(mal.linje >= 28 && mal.tykk >= 18, `Strekene er for små å trykke på: ${mal.linje}×${mal.tykk}px («${navn}»)`);
  t.sjekk(await t.friForDokk(".sn-brett"), `Brettet ligger under dokka («${navn}»)`);
}

export default async function (t) {
  const tegn = async (v, ms = 450) => t.klikk(linje(v), ms);
  const sp = async () => (await t.tilstand()).spill;

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem", true);
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.klikk('[data-h="n"][data-v="3"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.bilde("oppsett-to", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sn-linje').length === 24");
  await t.sov(300);
  await t.bilde("start");
  await brettPasser(t, "start");
  t.sjekk((t.norsk ? /^Vannrett strek, rad 1, mellom kolonne 1 og 2/ : /\S/).test(await t.js(`document.querySelector('${linje(0)}').getAttribute('aria-label')`)), "Streken har ikke et godt navn");

  // Lines, and a box that gives another turn: box 1 (lines 0, 3, 12, 13)
  await tegn(0);
  t.sjekk((await sp()).trekk.join() === "0" && !(await t.finnes(linje(0))), "Streken ble ikke tegnet");
  await tegn(11);
  await tegn(3);
  await tegn(23);
  await tegn(12);
  t.sjekk((await t.tilstand()).spill.trekk.length === 5, "Fem streker skal være tegnet");
  await tegn(13, 700);
  let s = await sp();
  t.sjekk(s.trekk.length === 6, "Den fjerde siden ble ikke tegnet");
  t.sjekk((await t.antall(".sn-boks.bla")) === 1, "Testspiller B fikk ikke boksen");
  t.sjekk(!t.norsk || /Boks!/.test(await t.tekst(".sn-melding")), "Meldingen sier ikke at B tegner igjen");
  await t.bilde("boks");

  // A tap beside a line (inside box 5, near its top line) draws the nearest free line: line 4
  const punkt = await t.js(`(() => {
    const b = document.querySelector('.sn-brett').getBoundingClientRect();
    const s = b.width * 0.88 / 3;
    return { x: b.left + b.width * 0.06 + s * 1.5, y: b.top + b.width * 0.06 + s * 1.38 };
  })()`);
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: punkt.x, y: punkt.y }] });
  await t.sov(60);
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sov(500);
  s = await sp();
  t.sjekk(s.trekk[s.trekk.length - 1] === 4, `Et trykk ved siden av streken tegnet ikke den nærmeste (${s.trekk.join(",")})`);

  // Undo, reload, back + continue
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 6, "«Angre» tok ikke tilbake én strek");
  await t.lastSide(t.side, "document.querySelectorAll('.sn-linje').length > 0");
  t.sjekk((await sp()).trekk.length === 6 && (await t.antall(".sn-boks")) === 1, "Spillet ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.sn-linje').length > 0");

  // The last line of a game
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.starter = 0; }`);
  await t.bilde("nesten-ferdig");
  await tegn(SLUTT[SLUTT.length - 1], 900);
  s = await sp();
  t.sjekk(s.resultat && s.resultat.vinner === 0 && s.resultat.bokser.join() === "6,3", `Spillet endte ikke 6–3 til Testspiller A: ${JSON.stringify(s.resultat)}`);
  t.sjekk(await t.finnes(".sn-stempel"), "Brettet viser ikke resultatet");
  await t.bilde("ferdig");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(400);
  await t.bilde("kaaringen", true);
  t.sjekk((t.norsk ? /Testspiller A vinner/ : /\S/).test(await t.tekst("#skjerm h1")), `Kåringen har feil vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(!t.norsk || /KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.spill.registrert === true && s._aktiv === false, "Kåringen ble ikke registrert for kvelden");
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen har ingen «Del resultatet»");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes(".sn-sist"), "Hjemskjermen viser ikke det siste spillet");
  t.sjekk(!t.norsk || /6–3/.test(await t.tekst(".sn-sist")), "«Sist» viser ikke stillingen");
  await t.bilde("hjem-sist", true);

  // Against the phone, Vanskelig on 5 × 5
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="n"][data-v="5"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sn-linje').length === 60");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  const t0 = Date.now();
  await tegn(0, 60);
  await t.bilde("mobilen-tenker");
  await t.vent("Rusj.S.spill.trekk.length === 2", 6000);
  const brukt = Date.now() - t0;
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(brukt < 2800, `Mobilen brukte ${brukt} ms på å svare`);
  t.sjekk(gap < 120, `Siden frøs i ${Math.round(gap)} ms mens mobilen tenkte`);
  await t.sov(600);
  await t.bilde("mobilen-svarte");
  await brettPasser(t, "5 × 5");
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 0, "«Angre» mot mobilen skal ta tilbake to streker");

  // Late in a 5 × 5 game Vanskelig searches the last safe lines: the page still does not freeze
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  for (let k = 0; k < 8; k++) {
    const fri = await t.js(`(() => { const p = Rusj.S.spill; return p && !p.resultat && document.querySelector('.sn-brett.fri') ? [...document.querySelectorAll('.sn-linje')].map((b) => Number(b.dataset.v)) : null; })()`);
    if (!fri || !fri.length) break;
    const n0 = (await sp()).trekk.length;
    await tegn(fri[(k * 7) % fri.length], 80);
    await t.vent(`!Rusj.S.spill || Rusj.S.spill.resultat || (Rusj.S.spill.trekk.length > ${n0 + 1} && document.querySelector('.sn-brett.fri'))`, 9000);
  }
  const gap2 = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(gap2 < 150, `Siden frøs i ${Math.round(gap2)} ms mens mobilen tenkte (senere i spillet)`);
  await t.bilde("midt-i");

  // The phone never draws while a sheet is open
  await t.js(`(() => { const S = Rusj.S; S.spill.starter = 1; S.spill.trekk = []; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.js(`document.querySelector('[data-h="regler"]').click()`);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen tegnet før regelarket ble åpnet (testen kom for sent)");
  await t.sov(2600);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen tegnet en strek mens regelarket var åpent");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent("Rusj.S.spill.trekk.length === 1", 5000);

  // Lett on 3 × 3: a win counts in the record
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="niva"][data-v="1"]');
  await t.klikk('[data-h="n"][data-v="3"]');
  await t.klikk('[data-h="starter"][data-v="0"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sn-linje').length === 24");
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.starter = 0; }`);
  await tegn(SLUTT[SLUTT.length - 1], 900);
  t.sjekk((await sp()).resultat && (await sp()).resultat.vinner === 0, "Seieren mot mobilen ble ikke registrert");
  t.sjekk((await t.tilstand()).rekord[1].seier === 1, "Seieren ble ikke telt mot Lett");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  t.sjekk(!t.norsk || /Du vinner/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke «Du vinner!»");
  await t.bilde("du-vinner", true);
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Lett/ : /\S/).test(await t.tekst(".sn-rekorder")), "Rekorden mot mobilen vises ikke på hjemskjermen");
  const merker = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "[]")`);
  t.sjekk(JSON.stringify(merker).includes("klassiker-snekkeren"), "Klistremerket for å slå mobilen ble ikke gitt");
  await t.bilde("hjem-rekord", true);
}
