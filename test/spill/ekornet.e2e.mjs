// Ekornet (match-3): level 1 from the home screen; a real swipe swaps two pieces and clears a line;
// a tap and a tap swap too; a swap that makes no line slides back and costs nothing; the keyboard
// (arrows, Enter, an arrow to swap) and the hint key; a hidden tab pauses; a reload mid-game;
// back + continue; a level won (stars, the next level, «Alle brett»), a level lost (no lives: try
// again), level 10 gives the sticker; 30 moves with a record. The board fits on the smallest phones
// and beside the HUD on a phone on its side.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en ekornet): the texts are checked in
// Norwegian only (t.norsk); elsewhere the numbers, the state and the links (t.forside, t.nokkel).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/ekornet/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Ekornet.Match;
const N = M.N;

export default async function (t) {
  const live = () => t.js("JSON.parse(JSON.stringify(Rusj.S.spill))");
  const ro = () => t.vent("!window.Ekornet.opptatt()", 8000);
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  async function sett(endring) {
    await t.js(`(() => { Object.assign(Rusj.S.spill, ${JSON.stringify(endring)}); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('.ek-lerret')");
    await pause();
  }
  const geo = () => t.js(`(() => { const b = document.querySelector(".ek-lerret").getBoundingClientRect(); return { x: b.left, y: b.top, D: b.width / ${N} }; })()`);
  const midt = (g, c) => ({ x: g.x + ((c % N) + 0.5) * g.D, y: g.y + (Math.floor(c / N) + 0.5) * g.D });
  // A real finger: down on cell a, a short swipe towards cell b, up.
  async function sveip(a, b) {
    const g = await geo();
    const p = midt(g, a);
    const q = midt(g, b);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    for (let k = 1; k <= 4; k++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + ((q.x - p.x) * k * 0.2), y: p.y + ((q.y - p.y) * k * 0.2) }] });
      await t.sov(16);
    }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  async function trykk(c) {
    const g = await geo();
    const p = midt(g, c);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    await t.sov(40);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(60);
  }
  async function tast(key) {
    const code = key === " " ? "Space" : key.length === 1 ? "Key" + key.toUpperCase() : key;
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Enter: 13 }[key] || 0 });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
    await t.sov(30);
  }
  // The kind that makes the line when a and b swap.
  function linjeSort(b, a, c) {
    const k = b.slice();
    [k[a], k[c]] = [k[c], k[a]];
    return M.iRekke(k, c) ? M.T(k[c]) : M.T(k[a]);
  }
  // A move from the saved board, a different one each time.
  const ettTrekk = async (n = 0) => {
    const tr = M.finnTrekk((await live()).brett);
    return tr[n % tr.length];
  };

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(!t.norsk || /Brett 1/.test(await t.tekst('[data-h="brett"]')), "Hovedknappen på hjem er ikke «Brett 1»");
  t.sjekk(await t.finnes('[data-h="trekk30"]'), "Mangler «30 trekk» på hjem");
  await t.klikk('[data-h="brett"]');
  await t.vent("document.querySelector('.ek-lerret') && document.querySelector('.ek-lerret').width > 0");
  await pause();
  let s = await live();
  t.sjekk(s.modus === "brett" && s.niva === 1 && s.trekk === 0 && s.mal.length === 1 && M.gyldigBrett(s.brett, s.k), "Brett 1 startet ikke med ett mål og et gyldig brett");
  t.sjekk((await t.antall(".ek-mal")) === 1, "Målet vises ikke over brettet");
  const plass = await t.js(`(() => { const l = document.querySelector(".ek-lerret").getBoundingClientRect(); return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, inne: l.top >= 0 && l.bottom <= innerHeight + 1 && l.left >= 0 && l.right <= innerWidth + 1, b: l.width }; })()`);
  t.sjekk(plass.side <= 1 && plass.bred <= 0 && plass.inne && plass.b >= 200, `Brettet får ikke plass på skjermen (${JSON.stringify(plass)})`);
  await t.bilde("brett-1");

  // A real swipe: the two swap, a line clears, new pieces fall in.
  let [a, b] = await ettTrekk();
  await sveip(a, b);
  await t.vent("Rusj.S.spill.trekk === 1", 3000);
  await t.sov(260);
  await t.bilde("rydder");
  await ro();
  s = await live();
  t.sjekk(s.poeng >= 30 && M.gyldigBrett(s.brett, s.k), `Sveipet ryddet ikke en linje (${s.poeng} poeng)`);
  t.sjekk((await t.tekst("#ek-trekk")) === String(s.maks - 1), "Trekkene igjen vises ikke");

  // A tap and a tap
  [a, b] = await ettTrekk(3);
  await trykk(a);
  await trykk(b);
  await t.vent("Rusj.S.spill.trekk === 2", 3000);
  await ro();

  // A swap that makes no line: it slides back, and no move is used.
  s = await live();
  let feil = null;
  for (let c = 0; c < N * N && !feil; c++) if (c % N < N - 1 && !M.gyldig(s.brett, c, c + 1) && M.T(s.brett[c]) !== M.T(s.brett[c + 1])) feil = [c, c + 1];
  await sveip(feil[0], feil[1]);
  await t.sov(500);
  await ro();
  t.sjekk((await live()).trekk === 2 && JSON.stringify((await live()).brett) === JSON.stringify(s.brett), "Et bytte uten linje ble gjort likevel");
  t.sjekk(!t.norsk || /ingen rad/.test(await t.js("document.querySelector('#si').textContent")), "Et bytte uten linje ble ikke lest opp");

  // The keyboard: Enter selects at the cursor, arrows move it, an arrow next to a selected piece swaps.
  await t.js("document.querySelector('.ek-ramme').focus()");
  [a, b] = await ettTrekk(1);
  await tast("Enter"); // cursor at (3,3), selected
  await tast("Enter"); // deselected again
  const [ax, ay] = M.xy(a);
  for (let k = 0; k < Math.abs(ax - 3); k++) await tast(ax > 3 ? "ArrowRight" : "ArrowLeft");
  for (let k = 0; k < Math.abs(ay - 3); k++) await tast(ay > 3 ? "ArrowDown" : "ArrowUp");
  await tast("Enter");
  await tast(b === a + 1 ? "ArrowRight" : "ArrowDown");
  await t.vent("Rusj.S.spill.trekk === 3", 3000);
  await ro();
  await tast("h");
  t.sjekk(!t.norsk || (await t.js(`new Promise((ok) => { const slutt = Date.now() + 2500; (function se() { if (/Tips: bytt/.test(document.querySelector("#si").textContent)) ok(true); else if (Date.now() > slutt) ok(false); else setTimeout(se, 50); })(); })`)), "H ga ikke et tips");
  await t.sov(300);
  await t.bilde("tips");

  // A hidden tab pauses at once; «Fortsett» goes on.
  await t.js(`Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"))`);
  t.sjekk(await t.finnes(".ek-status:not([hidden]) [data-h='fortsett-spill']"), "Spillet tok ikke pause da fanen ble skjult");
  await t.js(`delete document.hidden`);
  await t.bilde("pause");
  [a, b] = await ettTrekk(2);
  await sveip(a, b);
  await t.sov(300);
  t.sjekk((await live()).trekk === 3, "Det gikk an å bytte under pause");
  await t.klikk('[data-h="fortsett-spill"]');
  t.sjekk(await t.finnes(".ek-status[hidden]"), "Pausen forsvant ikke");

  // Reload mid-game: the same board, score and moves.
  s = await live();
  await t.lastSide(t.side, "document.querySelector('.ek-lerret')");
  let etter = await live();
  t.sjekk(JSON.stringify(etter.brett) === JSON.stringify(s.brett) && etter.poeng === s.poeng && etter.trekk === 3, "Spillet ble ikke som før etter omlasting");

  // Back + continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ek-lerret')");
  await pause();

  // Winning: one more of the kind the next move clears.
  s = await live();
  [a, b] = M.finnTrekk(s.brett)[0];
  await sett({ mal: [{ t: linjeSort(s.brett, a, b), n: 1 }], samlet: {} });
  await sveip(a, b);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(900);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.slutt === "vunnet" && s.niva === 2 && s.stjerner["1"] === 3, `Brettet ble ikke vunnet med tre stjerner (${JSON.stringify({ slutt: s.spill.slutt, niva: s.niva, st: s.stjerner })})`);
  t.sjekk(!t.norsk || /Brettet er klart/.test(await t.tekst("#skjerm h1")), "Sluttskjermen sier ikke «Brettet er klart!»");
  t.sjekk((await t.antall(".ek-stjerner i.pa")) === 3, "Tre stjerner vises ikke");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");
  await t.bilde("klart", true);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.ek-lerret')");
  s = await live();
  t.sjekk(s.modus === "brett" && s.niva === 2 && s.trekk === 0, "«Neste brett» startet ikke brett 2");
  await pause();

  // Out of moves: the level is lost – no lives, try again.
  s = await live();
  await sett({ trekk: s.maks - 1, mal: [{ t: 1, n: 99 }], samlet: {} });
  [a, b] = await ettTrekk();
  await sveip(a, b);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(700);
  s = await t.tilstand();
  t.sjekk(s.spill.slutt === "tapt" && s.niva === 2, "Brettet ble ikke tapt da trekkene tok slutt");
  t.sjekk(!t.norsk || /Nesten/.test(await t.tekst("#skjerm h1")), "Tapt brett sier ikke «Nesten!»");
  await t.bilde("nesten");
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.ek-lerret')");
  s = await live();
  t.sjekk(s.niva === 2 && s.trekk === 0, "«Prøv igjen» startet ikke det samme brettet på nytt");

  // Level 10 won: the sticker.
  await t.js(`(() => { Rusj.S.niva = 10; Rusj.S.spill = null; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await pause();
  await t.klikk('[data-h="brett"]');
  await t.vent("document.querySelector('.ek-lerret')");
  await pause();
  s = await live();
  t.sjekk(s.niva === 10 && s.mal.length === 3, "Brett 10 har ikke tre mål");
  await t.bilde("brett-10");
  [a, b] = M.finnTrekk(s.brett)[0];
  await sett({ mal: [{ t: linjeSort(s.brett, a, b), n: 1 }], samlet: {} });
  await sveip(a, b);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(400);
  const merker = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "{}")`);
  t.sjekk(!!merker["arkade-ekornet"], "Brett 10 ga ikke klistremerket");

  // «Alle brett»
  await t.klikk('[data-h="tilbake"]');
  await t.vent("document.querySelector('[data-h=\"brettene\"]')");
  await t.klikk('[data-h="brettene"]');
  await t.vent("document.querySelector('.ek-brettgrid')");
  t.sjekk((await t.antall(".ek-brettflis")) === 11, `«Alle brett» viser ikke 11 brett (${await t.antall(".ek-brettflis")})`);
  await t.klikk('.ek-brettflis[data-v="1"]');
  await t.vent("document.querySelector('.ek-lerret')");
  t.sjekk((await live()).niva === 1, "En flis i «Alle brett» startet ikke det brettet");
  await t.klikk("#tilbake");

  // 30 moves: the last move ends it, with a record.
  await t.vent("document.querySelector('[data-h=\"trekk30\"]')");
  await t.klikk('[data-h="trekk30"]');
  await t.vent("document.querySelector('.ek-lerret')");
  await pause();
  s = await live();
  t.sjekk(s.modus === "trekk30" && s.maks === 30 && s.mal.length === 0 && !(await t.finnes(".ek-maal")), "30 trekk startet ikke uten mål");
  // The three special pieces as they look on the board (they keep their kind, so no line appears).
  const med = s.brett.slice();
  med[0] = M.lag(M.T(med[0]), M.RAD);
  med[9] = M.lag(M.T(med[9]), M.KOL);
  med[18] = M.lag(M.T(med[18]), M.STJERNE);
  await sett({ brett: med });
  await t.bilde("trekk30");
  await sett({ trekk: 29, poeng: 1200 });
  [a, b] = await ettTrekk();
  await sveip(a, b);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(800);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.slutt === "ferdig" && s.rekord >= 1230 && s.rekord === s.spill.poeng, `Rekorden på 30 trekk ble ikke lagret (${s.rekord})`);
  await t.bilde("trekk30-slutt");
  await t.klikk('[data-h="tilbake"]');
  await t.vent("document.querySelector('.ek-sistlinje')");
  t.sjekk((t.norsk ? /på 30 trekk/ : new RegExp(String(s.rekord).slice(0, 1))).test(await t.tekst(".ek-sistlinje")), "Hjem viser ikke siste runde på 30 trekk");
  await t.bilde("hjem-rekord");

  // The smallest phones: the board fits, the page never scrolls.
  await t.klikk('[data-h="brett"]');
  await t.vent("document.querySelector('.ek-lerret')");
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [w, h] of [
    [320, 568],
    [375, 560],
  ].filter(([w]) => w <= bredde0)) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(700);
    const m = await t.js(`(() => {
      const l = document.querySelector(".ek-lerret").getBoundingClientRect();
      const mal = document.querySelector(".ek-maal").getBoundingClientRect();
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, b: l.width, bunn: l.bottom, topp: l.top, mal: mal.bottom, h: innerHeight };
    })()`);
    t.sjekk(m.side <= 1 && m.bred <= 0, `${w}×${h}: siden kan scrolles`);
    t.sjekk(m.b >= 230 && m.bunn <= m.h && m.topp >= m.mal, `${w}×${h}: brettet får ikke plass (${JSON.stringify(m)})`);
    await t.bilde(`${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  if (bredde0 > hoyde0) {
    const m = await t.js(`(() => { const l = document.querySelector(".ek-lerret").getBoundingClientRect(); const hud = document.querySelector(".ek-hud").getBoundingClientRect(); return { lerretHoyre: l.right, hudVenstre: hud.left, bunn: l.bottom, h: innerHeight }; })()`);
    t.sjekk(m.hudVenstre >= m.lerretHoyre - 1 && m.bunn <= m.h + 1, `Liggende: HUD og brett overlapper eller brettet er for høyt (${JSON.stringify(m)})`);
  }

  // A tampered saved board (a line already on it) is not loaded.
  await t.js(`(() => { const b = Rusj.S.spill.brett; b[0] = b[1] = b[2] = 1; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.tilstand()).spill === null, "Et ugyldig lagret brett ble lastet");
}
