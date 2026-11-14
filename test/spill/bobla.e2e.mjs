// Bobla (bubble shooter): level 1 from the home screen; a real touch drag aims (the dotted line
// shows) and letting go shoots; a known board where a shot pops three and drops what hung under
// them; dragging below the launcher cancels; the keyboard aims (held arrow), swaps (X) and shoots
// (Space); the swap button; a hidden tab pauses; a reload mid-game; back + continue; a cleared level
// (stars, the next level unlocked, «Alle brett»); the bubbles reaching the line (no lives: try
// again); level 10 gives the sticker; endless with a record. The board fits on the smallest phones
// and beside the HUD on a phone on its side.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en bobla): the texts are checked in
// Norwegian only (t.norsk); elsewhere the numbers, the state and the links (t.forside, t.nokkel).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/bobla/spill.js"), "utf8"), kontekst);
const B = kontekst.window.Bobla.Boble;

// A board from strings, one per row: digits are kinds, "." is empty.
function brett(rader, tak = 0) {
  const b = JSON.parse(JSON.stringify(B.tomt()));
  b.tak = tak;
  rader.forEach((s, r) => {
    for (let c = 0; c < s.length; c++) b.rader[r][c] = s[c] === "." ? 0 : Number(s[c]);
  });
  return b;
}

export default async function (t) {
  const live = () => t.js("JSON.parse(JSON.stringify(Rusj.S.spill))");
  const ro = () => t.vent("!window.Bobla.opptatt()", 6000);
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  async function sett(endring) {
    await t.js(`(() => { Object.assign(Rusj.S.spill, ${JSON.stringify(endring)}); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('.bo-lerret')");
    await pause();
  }
  const geo = () => t.js(`(() => { const b = document.querySelector(".bo-lerret").getBoundingClientRect(); return { x: b.left, y: b.top, D: b.width / 8, w: b.width, h: b.height, bunn: b.bottom, hoyre: b.right }; })()`);
  // A real finger: down on the line from the launcher at angle v, a short drag along it, then up
  // (or down below the launcher to cancel).
  async function finger(v, { slipp = true, avbryt = false } = {}) {
    const g = await geo();
    const pt = (d) => ({ x: g.x + (4 + Math.sin(v) * d) * g.D, y: g.y + (B.SKYT_Y - Math.cos(v) * d) * g.D });
    const a = pt(3);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
    for (let i = 1; i <= 4; i++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(3 + i * 0.5)] });
      await t.sov(16);
    }
    if (avbryt) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: g.x + 4 * g.D, y: g.y + (B.SKYT_Y + 0.3) * g.D }] });
      await t.sov(16);
    }
    if (!slipp) return async () => t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  const mot = (b, r, c) => Math.atan2(B.px(b, r, c) - B.K / 2, B.SKYT_Y - B.py(b, r));
  async function tast(key, ms = 0) {
    const code = key === " " ? "Space" : key.length === 1 ? "Key" + key.toUpperCase() : key;
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, " ": 32 }[key] || 0 });
    if (ms) await t.sov(ms);
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  }

  await t.start();
  // The install tip (shown at most twice per phone after a good result) would cover the screenshots.
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(!t.norsk || /Brett 1/.test(await t.tekst('[data-h="brett"]')), "Hovedknappen på hjem er ikke «Brett 1»");
  t.sjekk(await t.finnes('[data-h="uendelig"]'), "Mangler «Uendelig» på hjem");
  await t.klikk('[data-h="brett"]');
  await t.vent("document.querySelector('.bo-lerret') && document.querySelector('.bo-lerret').width > 0");
  await pause();
  let s = await live();
  t.sjekk(s.modus === "brett" && s.niva === 1 && s.skudd === 0 && B.farger(s.brett).length <= 3, "Brett 1 startet ikke med tre sorter");
  // The board fits the screen: nothing scrolls, the whole canvas shows.
  const plass = await t.js(`(() => { const l = document.querySelector(".bo-lerret").getBoundingClientRect(); return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, inne: l.top >= 0 && l.bottom <= innerHeight + 1 && l.left >= 0 && l.right <= innerWidth + 1, b: l.width }; })()`);
  t.sjekk(plass.side <= 1 && plass.bred <= 0 && plass.inne && plass.b >= 180, `Brettet får ikke plass på skjermen (${JSON.stringify(plass)})`);
  await t.bilde("brett-1");

  // A real touch drag aims: the line shows while the finger is down; letting go shoots.
  const slipp = await finger(-0.35, { slipp: false });
  await t.sov(120);
  await t.bilde("sikter");
  t.sjekk((await live()).skudd === 0, "Skuddet gikk før fingeren slapp");
  await slipp();
  await t.vent("Rusj.S.spill.skudd === 1", 3000);
  await ro();
  s = await live();
  t.sjekk(Math.abs(s.vinkel + 0.35) < 0.08, `Skuddet gikk ikke dit fingeren pekte (${s.vinkel})`);
  t.sjekk(B.antall(s.brett) >= 1 && B.flytende(s.brett).length === 0, "Brettet ble rart etter første skudd");

  // Drag below the launcher: no shot.
  await finger(0.4, { avbryt: true });
  await t.sov(300);
  t.sjekk((await live()).skudd === 1, "Å dra ned under utskyteren skjøt likevel");

  // A known board: shooting the 1 into the gap pops three and drops the 2s that hung under them.
  const kjent = brett(["11...343", "2......", "2.......", "2......"]);
  await sett({ brett: kjent, kule: 1, neste: 3, bom: 0, poeng: 0, sprukket: 0, falt: 0 });
  await finger(mot(kjent, 0, 2));
  await t.vent("Rusj.S.spill.skudd === 2", 3000);
  await t.sov(200);
  await t.bilde("spretter");
  await ro();
  s = await live();
  t.sjekk(s.sprukket === 3 && s.falt === 3 && s.poeng === 90 && !s.brett.rader[1][0], `Skuddet sprengte ikke tre og felte de tre under (${s.sprukket} sprakk, ${s.falt} falt, ${s.poeng} poeng)`);
  t.sjekk((await t.tekst("#bo-poeng")).replace(/\D/g, "") === "90", "Poengene vises ikke");

  // The keyboard: a held arrow turns the aim, X swaps, Space shoots.
  await t.js("document.querySelector('.bo-ramme').focus()");
  const v0 = (await live()).vinkel;
  await tast("ArrowRight", 350);
  const v1 = (await live()).vinkel;
  t.sjekk(v1 > v0 + 0.1, `Piltasten snudde ikke siktet (${v0} → ${v1})`);
  const for1 = await live();
  await tast("x");
  s = await live();
  t.sjekk(s.kule === for1.neste && s.neste === for1.kule, "X byttet ikke boble");
  await tast(" ");
  await t.vent("Rusj.S.spill.skudd === 3", 3000);
  await ro();
  // The swap button (tap on the small bubble)
  const for2 = await live();
  await t.klikk(".bo-bytt", 100);
  s = await live();
  t.sjekk(s.kule === for2.neste && s.neste === for2.kule, "Byttknappen byttet ikke boble");
  t.sjekk((await t.js("document.querySelector('.bo-bytt').getAttribute('aria-label')")).length > 10, "Byttknappen har ikke navn");

  // A hidden tab pauses at once; «Fortsett» goes on.
  await t.js(`Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"))`);
  t.sjekk(await t.finnes(".bo-status:not([hidden]) [data-h='fortsett-spill']"), "Spillet tok ikke pause da fanen ble skjult");
  await t.js(`delete document.hidden`);
  await t.bilde("pause");
  const skuddFor = (await live()).skudd;
  await finger(0.2);
  await t.sov(300);
  t.sjekk((await live()).skudd === skuddFor, "Det gikk an å skyte under pause");
  await t.klikk('[data-h="fortsett-spill"]');
  t.sjekk(await t.finnes(".bo-status[hidden]"), "Pausen forsvant ikke");

  // Reload mid-game: the same board and score.
  s = await live();
  await t.lastSide(t.side, "document.querySelector('.bo-lerret')");
  const etter = await live();
  t.sjekk(JSON.stringify(etter.brett) === JSON.stringify(s.brett) && etter.poeng === s.poeng && etter.kule === s.kule, "Spillet ble ikke som før etter omlasting");

  // Back + continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.bo-lerret')");
  await pause();

  // Clearing the level: two 1s left, a third pops them all.
  const sist = brett(["..11...."]);
  await sett({ brett: sist, kule: 1, neste: 1 });
  await finger(mot(sist, 0, 4));
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(900);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.slutt === "vunnet" && s.niva === 2 && s.stjerner["1"] === 3, `Brettet ble ikke klart med tre stjerner (${JSON.stringify({ slutt: s.spill.slutt, niva: s.niva, st: s.stjerner })})`);
  t.sjekk(!t.norsk || /Brettet er klart/.test(await t.tekst("#skjerm h1")), "Sluttskjermen sier ikke «Brettet er klart!»");
  t.sjekk((await t.antall(".bo-stjerner i.pa")) === 3, "Tre stjerner vises ikke");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");
  await t.bilde("klart", true);
  // «Brett 2» goes straight on.
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.bo-lerret')");
  s = await live();
  t.sjekk(s.modus === "brett" && s.niva === 2 && s.skudd === 0, "«Neste brett» startet ikke brett 2");
  await pause();

  // The bubbles reach the line: the round is over, no lives – try again.
  const lav = brett(["12121212", "2121212", "12121212"], 7);
  await sett({ brett: lav, kule: 3, neste: 3, bom: 6 });
  await finger(0.05);
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(700);
  s = await t.tilstand();
  t.sjekk(s.spill.slutt === "tapt" && s.niva === 2, "Brettet ble ikke tapt da boblene nådde streken");
  t.sjekk(!t.norsk || /Nesten/.test(await t.tekst("#skjerm h1")), "Tapt brett sier ikke «Nesten!»");
  t.sjekk(await t.finnes('.dokk [data-h="igjen"]'), "Mangler «Prøv igjen»");
  await t.bilde("nesten");
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.bo-lerret')");
  s = await live();
  t.sjekk(s.niva === 2 && s.skudd === 0 && s.brett.tak === 0, "«Prøv igjen» startet ikke det samme brettet på nytt");

  // Level 10 cleared: the sticker.
  await t.js(`(() => { Rusj.S.niva = 10; Rusj.S.spill = null; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await pause();
  await t.klikk('[data-h="brett"]');
  await t.vent("document.querySelector('.bo-lerret')");
  await pause();
  const ti = brett(["5.5....."]);
  await sett({ brett: ti, kule: 5, neste: 5 });
  await finger(mot(ti, 0, 1));
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(400);
  const merker = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("merker"))}) || "{}")`);
  t.sjekk(!!merker["arkade-bobla"], "Brett 10 ga ikke klistremerket");

  // «Alle brett»: one tile per unlocked level, the stars on the cleared ones.
  await t.klikk('[data-h="tilbake"]');
  await t.vent("document.querySelector('[data-h=\"brettene\"]')");
  await t.klikk('[data-h="brettene"]');
  await t.vent("document.querySelector('.bo-brettgrid')");
  t.sjekk((await t.antall(".bo-brettflis")) === 11, `«Alle brett» viser ikke 11 brett (${await t.antall(".bo-brettflis")})`);
  await t.bilde("alle-brett");
  await t.klikk('.bo-brettflis[data-v="1"]');
  await t.vent("document.querySelector('.bo-lerret')");
  t.sjekk((await live()).niva === 1, "En flis i «Alle brett» startet ikke det brettet");
  await t.klikk("#tilbake");

  // Endless: a run, a crash at the line, the record.
  await t.vent("document.querySelector('[data-h=\"uendelig\"]')");
  await t.klikk('[data-h="uendelig"]');
  await t.vent("document.querySelector('.bo-lerret')");
  await pause();
  s = await live();
  t.sjekk(s.modus === "uendelig" && B.antall(s.brett) >= 30, "Uendelig startet ikke med et fullt brett");
  await t.bilde("uendelig");
  const full = brett(["12121212", "2121212", "12121212", "2121212", "12121212", "2121212", "12121212", "2121212", "12121212", "2121212"]);
  await sett({ brett: full, kule: 3, neste: 3, bom: 5, poeng: 480 });
  await finger(0.1);
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(800);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.rekord === 480, `Rekorden i uendelig ble ikke lagret (${s.rekord})`);
  await t.klikk('[data-h="tilbake"]');
  await t.vent("document.querySelector('.bo-sistlinje')");
  t.sjekk((t.norsk ? /480 poeng i uendelig/ : /480/).test(await t.tekst(".bo-sistlinje")), "Hjem viser ikke siste runde i uendelig");
  await t.bilde("hjem-rekord");

  // The smallest phones: the board fits, the page never scrolls.
  await t.klikk('[data-h="brett"]');
  await t.vent("document.querySelector('.bo-lerret')");
  const [bredde0, hoyde0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [w, h] of [
    [320, 568],
    [375, 560],
  ].filter(([w]) => w <= bredde0)) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(700);
    const m = await t.js(`(() => {
      const l = document.querySelector(".bo-lerret").getBoundingClientRect();
      const hud = document.querySelector(".bo-hud").getBoundingClientRect();
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, b: l.width, bunn: l.bottom, topp: l.top, hud: hud.bottom, h: innerHeight };
    })()`);
    t.sjekk(m.side <= 1 && m.bred <= 0, `${w}×${h}: siden kan scrolles`);
    t.sjekk(m.b >= 200 && m.bunn <= m.h && m.topp >= m.hud, `${w}×${h}: brettet får ikke plass (${JSON.stringify(m)})`);
    await t.bilde(`${w}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde0, height: hoyde0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  // On a phone on its side the HUD stands beside the board, not on top of it.
  if (bredde0 > hoyde0) {
    const m = await t.js(`(() => { const l = document.querySelector(".bo-lerret").getBoundingClientRect(); const hud = document.querySelector(".bo-hud").getBoundingClientRect(); return { lerretHoyre: l.right, hudVenstre: hud.left, bunn: l.bottom, h: innerHeight }; })()`);
    t.sjekk(m.hudVenstre >= m.lerretHoyre - 1 && m.bunn <= m.h + 1, `Liggende: HUD og brett overlapper eller brettet er for høyt (${JSON.stringify(m)})`);
  }

  // A tampered saved board (a bubble floating in the air) is not loaded.
  await t.js(`(() => { Rusj.S.spill.brett.rader[9][0] = 2; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.tilstand()).spill === null, "Et ugyldig lagret brett ble lastet");
}
