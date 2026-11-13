// Hopperen: two people on two seats pick a peg (the holes it can reach get dots), step, and the
// other moves; a tap a little beside a peg still picks it (the board snaps taps to the nearest hole
// that means something – the star must be playable at 320 px); a wrong hole is refused; undo, a
// reload and back + continue; the last move of a game and «Kåringen» with places. Against five
// phones (six seats): every phone moves in turn without freezing the page, «Angre» takes back the
// phones' moves and yours, they never move while a sheet is open; a win counts in the record.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en hopperen): texts are checked in
// Norwegian only (t.norsk).

const hull = (v) => `.hp-hull[data-v="${v}"]`;
// A whole two-seat game (seat 1, the bottom point, wins: peg 18 to hole 9 fills the goal). Found by
// a seeded self-play with the game's own rules.
const SLUTT = [[117,106],[5,16],[120,104],[0,18],[114,94],[18,30],[116,82],[4,42],[112,92],[1,4],[113,72],[7,52],[104,0],[3,104],[106,5],[2,29],[94,83],[4,40],[83,18],[16,81],[82,63],[104,103],[111,70],[42,43],[92,28],[40,80],[118,91],[29,27],[115,116],[9,54],[119,32],[8,16],[28,8],[43,83],[63,4],[81,102],[116,112],[52,53],[112,71],[102,111],[91,79],[30,42],[79,62],[42,82],[70,61],[54,91],[62,43],[83,115],[72,2],[111,118],[71,70],[103,112],[70,7],[80,116],[61,52],[6,14],[52,9],[115,120],[8,1],[16,15],[43,31],[82,83],[32,19],[118,119],[19,17],[112,115],[18,3],[14,62],[17,8],[53,54],[31,18],[115,117],[8,6],[15,38],[9,8],[62,72],[18,9]];

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

async function brettPasser(t, navn) {
  await t.js("window.scrollTo(0, 0)");
  const mal = await t.js(`(() => {
    const b = document.querySelector('.skjerm-spill .hp-brett').getBoundingClientRect();
    return { b: Math.round(b.width), enhet: b.width / 13, venstre: b.left, hoyre: window.innerWidth - b.right, scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px («${navn}»)`);
  t.sjekk(mal.enhet >= 19, `Hullene står bare ${mal.enhet.toFixed(1)}px fra hverandre («${navn}»)`);
  t.sjekk(mal.venstre >= 0 && mal.hoyre >= 0, `Stjerna går utenfor skjermen («${navn}»)`);
  t.sjekk(await t.friForDokk(".hp-brett"), `Brettet ligger under dokka («${navn}»)`);
}

// A real tap (touch) at an offset from a hole's centre, in hole widths.
async function trykkVed(t, i, dx, dy) {
  const p = await t.js(`(() => { const b = document.querySelector('${hull(i)}').getBoundingClientRect(); const e = document.querySelector('.hp-brett').getBoundingClientRect().width / 13; return { x: b.x + b.width / 2 + ${dx} * e, y: b.y + b.height / 2 + ${dy} * e }; })()`);
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
  await t.sov(60);
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sov(450);
}

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem", true);
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="flere"]');
  await t.klikk('[data-h="plasser"][data-v="2"]');
  await t.bilde("oppsett-flere", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.hp-hull').length === 121");
  await t.sov(300);
  await t.bilde("start");
  await brettPasser(t, "start");
  t.sjekk((await t.antall(".hp-brikke")) === 20, "To plasser skal gi 20 brikker");
  t.sjekk((await t.antall(".hp-hull.kan")) >= 4 && !(await t.finnes(`${hull(120)}.kan`)), "Den fremste rekka (og hopp over den) skal kunne flytte, ikke den bakerste brikka");

  // Pick a peg: its holes get dots; a step
  await t.klikk(hull(111), 300);
  t.sjekk(await t.finnes(`${hull(111)}.valgt`), "Brikka ble ikke valgt");
  t.sjekk((await t.antall(".hp-hull.mal")) === 2, `Brikka på 111 skal ha to mål, fikk ${await t.antall(".hp-hull.mal")}`);
  await t.bilde("valgt");
  await t.klikk(hull(60), 300);
  t.sjekk((await sp()).trekk.length === 0, "Et ulovlig hull ble godtatt");
  await t.klikk(hull(102), 500);
  let s = await sp();
  t.sjekk(JSON.stringify(s.trekk) === "[[111,102]]", `Steget ble ikke spilt: ${JSON.stringify(s.trekk)}`);
  // The other player: a tap a little beside peg 9 picks it, a tap a little beside hole 18 moves there
  await trykkVed(t, 9, 0.35, -0.3);
  t.sjekk(await t.finnes(`${hull(9)}.valgt`), "Et trykk ved siden av brikka valgte den ikke");
  const mal9 = await t.js(`[...document.querySelectorAll('.hp-hull.mal')].map((b) => Number(b.dataset.v))`);
  await trykkVed(t, mal9[0], -0.3, 0.3);
  s = await sp();
  t.sjekk(s.trekk.length === 2 && s.trekk[1][0] === 9, `Et trykk ved siden av målet flyttet ikke brikka: ${JSON.stringify(s.trekk)}`);
  await t.bilde("to-trekk");

  // Undo, reload, back + continue
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === 1, "«Angre» tok ikke tilbake ett trekk");
  await t.lastSide(t.side, "document.querySelectorAll('.hp-hull').length === 121");
  t.sjekk((await sp()).trekk.length === 1, "Spillet ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.hp-hull').length === 121");

  // The last move of a game
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.forste = 0; }`);
  await t.bilde("nesten-ferdig");
  const [fra, til] = SLUTT[SLUTT.length - 1];
  await t.klikk(hull(fra), 300);
  await t.klikk(hull(til), 900);
  s = await sp();
  t.sjekk(s.resultat && s.resultat.vinner === 0 && s.resultat.iMal[0] === 10, `Spillet ble ikke vunnet: ${JSON.stringify(s.resultat)}`);
  t.sjekk(await t.finnes(".hp-stempel"), "Brettet viser ikke resultatet");
  await t.bilde("ferdig");
  await t.vent("document.querySelector('.skjerm-slutt')", 7000);
  await t.sov(400);
  await t.bilde("kaaringen", true);
  t.sjekk((t.norsk ? /Testspiller A vinner/ : /\S/).test(await t.tekst("#skjerm h1")), `Kåringen har feil vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(!t.norsk || /KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.spill.registrert === true && s._aktiv === false, "Kåringen ble ikke registrert");
  t.sjekk((await t.antall(".poengliste li, .poengliste .rad, .poengliste > *")) >= 2, "Kåringen viser ikke plassene");
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen har ingen «Del resultatet»");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes(".hp-sist"), "Hjemskjermen viser ikke det siste spillet");

  // Against five phones (six seats), Vanskelig: every phone moves in turn, and the page doesn't freeze
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="plasser"][data-v="6"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.bilde("oppsett-seks", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.hp-brikke').length === 60");
  // (the first game of a setup may be started by another seat: wait for your turn)
  await t.vent("document.querySelector('.hp-brett.fri')", 12000);
  await t.bilde("seks-plasser");
  await brettPasser(t, "seks plasser");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  const n0 = (await sp()).trekk.length;
  const min = await t.js(`Number(document.querySelector('.hp-hull.kan').dataset.v)`);
  await t.klikk(hull(min), 200);
  const maal = await t.js(`Number(document.querySelector('.hp-hull.mal').dataset.v)`);
  const t0 = Date.now();
  await t.klikk(hull(maal), 100);
  await t.bilde("mobilene-tenker");
  await t.vent(`Rusj.S.spill.trekk.length >= ${n0 + 6} && document.querySelector('.hp-brett.fri')`, 15000);
  const brukt = Date.now() - t0;
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(brukt < 9000, `Fem mobiler brukte ${brukt} ms`);
  t.sjekk(gap < 120, `Siden frøs i ${Math.round(gap)} ms mens mobilene tenkte`);
  await t.bilde("mobilene-flyttet");
  await t.klikk('[data-h="angre"]', 400);
  t.sjekk((await sp()).trekk.length === n0, "«Angre» skal ta tilbake mobilenes trekk og ditt");

  // The phones never move while a sheet is open
  await t.js(`(() => { const S = Rusj.S; S.spill.forste = 1; S.spill.trekk = []; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.js(`document.querySelector('[data-h="regler"]').click()`);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen flyttet før regelarket ble åpnet (testen kom for sent)");
  await t.sov(2400);
  t.sjekk((await sp()).trekk.length === 0, "Mobilen flyttet mens regelarket var åpent");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent("Rusj.S.spill.trekk.length >= 1", 5000);

  // Two seats against the phone: a win counts in the record
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]')) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="plasser"][data-v="2"]');
  await t.klikk('[data-h="niva"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.hp-brikke').length === 20");
  await lastMed(t, `(S) => { S.spill.trekk = ${JSON.stringify(SLUTT.slice(0, -1))}; S.spill.forste = 0; }`);
  await t.klikk(hull(fra), 300);
  await t.klikk(hull(til), 900);
  t.sjekk((await sp()).resultat && (await sp()).resultat.vinner === 0, "Seieren mot mobilen ble ikke registrert");
  t.sjekk((await t.tilstand()).rekord["2-1"].seier === 1, "Seieren ble ikke telt");
  await t.vent("document.querySelector('.skjerm-slutt')", 7000);
  t.sjekk(!t.norsk || /Du vinner/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke «Du vinner!»");
  await t.bilde("du-vinner", true);
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes(".hp-rekorder"), "Rekorden mot mobilen vises ikke på hjemskjermen");
  const merker = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "[]")`);
  t.sjekk(JSON.stringify(merker).includes("klassiker-hopperen"), "Klistremerket for å slå mobilen ble ikke gitt");
  await t.bilde("hjem-rekord", true);
}
