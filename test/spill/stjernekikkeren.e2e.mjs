// Stjernekikkeren (one star per row, column and patch of sky; no two touch): the size choice, a tap
// cycle (dot → star → empty), auto-dots, a rule broken (both stars marked, and said why), a drag
// that dots several cells as one undo step, the keyboard (arrows, S, X, Backspace), a hint, «Tøm»
// with undo, pause, a reload and back + «Fortsett», and a solved board with its record.
// «Dagens stjernehimmel»: the day's puzzle from the date, progress to the front page, the result
// with streak and a live countdown, a share without the answer, and #dagens. Last: a 10 × 10 board
// fits the screen with cells big enough to hit (portrait and landscape).
// Runs in every edition: texts are checked in Norwegian only (t.norsk).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/stjernekikkeren/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Stjernekikkeren;

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const S = () => t.tilstand();
  const celle = (i) => `.sk-celle[data-i="${i}"]`;
  const si = () => t.js("document.querySelector('#si').textContent");
  async function tast(key, kode) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, windowsVirtualKeyCode: kode, ...(key.length === 1 ? { text: key } : {}) });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, windowsVirtualKeyCode: kode });
    await t.sov(60);
  }
  // The keyboard cursor to cell i with the arrow keys.
  async function markor(n, i) {
    const fra = await t.js("(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).valgt");
    const dr = Math.floor(i / n) - Math.floor(fra / n);
    const dc = (i % n) - (fra % n);
    for (let k = 0; k < Math.abs(dr); k++) await tast(dr > 0 ? "ArrowDown" : "ArrowUp", dr > 0 ? 40 : 38);
    for (let k = 0; k < Math.abs(dc); k++) await tast(dc > 0 ? "ArrowRight" : "ArrowLeft", dc > 0 ? 39 : 37);
    await t.vent(`(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).valgt === ${i}`, 3000);
  }
  const fasit = (sp) => sp.losning.map((c, r) => r * sp.n + c);

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const dag = await t.js("Rusj.dag()");

  // ----- Home -----
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .sk-kal'), "Dagens stjernehimmel er ikke hovedknappen på hjemskjermen");
  t.sjekk(!t.norsk || /Spill fritt · 8 × 8/.test(await t.tekst('[data-h="nytt"]')), "Mangler «Spill fritt · 8 × 8» på hjemskjermen");

  // ----- Setup: the size -----
  await t.klikk('[data-h="bytt"]');
  await t.vent("document.querySelector('.flis[data-h=\"storrelse\"]')");
  t.sjekk((await t.antall('.flis[data-h="storrelse"]')) === 5 && (!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1"))), "Oppsettet har ikke fem størrelser under «Gjør klart»");
  await t.klikk('.flis[data-v="6"]');
  t.sjekk((await t.js(`document.querySelector('.flis[data-v="6"]').getAttribute("aria-pressed")`)) === "true", "Størrelsen ble ikke valgt");
  await t.bilde("oppsett");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.sk-celle').length === 36");
  await pause();
  let sp = (await S()).fri;
  t.sjekk(!t.norsk || /Trykk én gang for prikk/.test(await t.tekst(".sk-tips")), "Det tomme brettet sier ikke hvordan man merker");
  t.sjekk(sp.n === 6 && M.tell(6, sp.felt, 2) === 1 && M.finn(6, sp.felt, 2)[0].join() === sp.losning.join(), "Brettet har ikke nøyaktig én løsning");
  const F = fasit(sp);
  await t.bilde("start");

  // A tap: dot, star, empty.
  const tom = [...Array(36).keys()].find((i) => !F.includes(i) && i > 6);
  await t.trykk(celle(tom));
  t.sjekk((await S()).fri.m[tom] === 1 && (await t.finnes(`${celle(tom)} .sk-prikk`)), "Første trykk satte ikke en prikk");
  await t.trykk(celle(tom));
  t.sjekk((await S()).fri.m[tom] === 2 && (await t.finnes(`${celle(tom)} .sk-stjerne`)), "Andre trykk satte ikke en stjerne");
  t.sjekk((await t.antall(".sk-celle.ute")) >= 8, "Autoprikk viser ikke hvor stjernen stenger");
  t.sjekk(!t.norsk || /: stjerne$/.test(await t.js(`document.querySelector('${celle(tom)}').getAttribute("aria-label")`)), "Ruta sier ikke at den har en stjerne");
  await t.trykk(celle(tom));
  t.sjekk((await S()).fri.m[tom] === 0, "Tredje trykk tømte ikke ruta");

  // Two stars in one row: both are marked, and the reason is said.
  const a = 0;
  const b = 3;
  const steg0 = (await S()).fri.angre.length;
  for (const i of [a, a, b, b]) await t.trykk(celle(i));
  t.sjekk((await t.antall(".sk-celle.konflikt")) === 2, "To stjerner i samme rad blir ikke merket");
  t.sjekk(!t.norsk || /samme rad/.test(await si()), `Konflikten leses ikke opp: «${await si()}»`);
  await t.bilde("konflikt");
  for (let k = 0; k < 4; k++) await t.klikk('[data-h="angre"]', 80);
  sp = (await S()).fri;
  t.sjekk(sp.m.every((v) => v === 0) && sp.angre.length === steg0, "Angre tok ikke tilbake alle trykkene");

  // A drag across a row puts dots on four cells, as one undo step.
  const rad = 5;
  const steg1 = (await S()).fri.angre.length;
  const p0 = await t.js(`(() => { const b = document.querySelector('${celle(rad * 6)}').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; })()`);
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p0.x, y: p0.y }] });
  for (let k = 1; k <= 12; k++) {
    await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p0.x + (p0.w * 3 * k) / 12, y: p0.y }] });
    await t.sov(16);
  }
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sov(200);
  sp = (await S()).fri;
  const prikket = [0, 1, 2, 3].map((c) => sp.m[rad * 6 + c]);
  t.sjekk(prikket.every((v) => v === 1) && sp.angre.length === steg1 + 1, `Draget prikket ikke fire ruter som ett steg (${prikket.join(",")}, ${sp.angre.length - steg1} steg)`);
  await t.bilde("prikker");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await S()).fri.m.every((v) => v === 0), "Angre tok ikke bort alle prikkene fra draget");

  // The keyboard: arrows, S for a star, X for a dot, Backspace.
  await t.js(`document.querySelector('${celle(0)}').focus()`);
  await markor(6, F[1]);
  await tast("s", 83);
  t.sjekk((await S()).fri.m[F[1]] === 2, "S satte ikke en stjerne der markøren er");
  t.sjekk(await t.js(`document.activeElement === document.querySelector('${celle(F[1])}')`), "Fokus følger ikke piltastene");
  await markor(6, tom);
  await tast("x", 88);
  t.sjekk((await S()).fri.m[tom] === 1, "X satte ikke en prikk");
  await tast("Backspace", 8);
  t.sjekk((await S()).fri.m[tom] === 0, "Backspace tømte ikke ruta");

  // A hint: a star that follows from the ones already right.
  await t.klikk('[data-h="hint"]');
  sp = (await S()).fri;
  t.sjekk(sp.hint.length === 1 && F.includes(sp.hint[0]) && sp.m[sp.hint[0]] === 2 && sp.hintIgjen === 2, "Hintet satte ikke en riktig stjerne");
  await t.sov(200);
  t.sjekk((await t.js("document.querySelector('.sk-melding').textContent.length")) > 10, "Hintet forklarer ingenting");
  await t.bilde("hint");

  // «Tøm» keeps the hint and can be undone.
  await t.klikk('[data-h="tom"]');
  sp = (await S()).fri;
  t.sjekk(sp.m[F[1]] === 0 && sp.m[sp.hint[0]] === 2, "Tøm fjernet ikke stjernene, eller fjernet hintet");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await S()).fri.m[F[1]] === 2, "Angre hentet ikke tilbake det som ble tømt");

  // Pause hides the sky; the clock stands still.
  await t.klikk(".sk-klokke");
  t.sjekk(await t.finnes(".sk-pauseboks:not([hidden])"), "Pause viser ikke pauseboksen");
  const tid1 = (await S()).fri.tid;
  await t.sov(700);
  t.sjekk((await S()).fri.tid === tid1, "Klokka går under pause");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-spill"]');

  // Reload mid-game, then back + «Fortsett».
  const forLast = (await S()).fri;
  await t.lastSide(t.side, "document.querySelectorAll('.sk-celle').length === 36");
  await pause();
  sp = (await S()).fri;
  t.sjekk(sp.m.join() === forLast.m.join() && sp.felt.join() === forLast.felt.join() && (await t.antall(".sk-celle .sk-stjerne")) === 2, "Brettet ble ikke det samme etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett · 6 × 6 · \d+:\d\d/ : /6 × 6/).test(await t.tekst('[data-h="fortsett"]')), `Hjemskjermen tilbyr ikke å fortsette («${await t.tekst('[data-h="fortsett"]')}»)`);
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.sk-celle').length === 36");
  await pause();

  // Solve: the rest of the stars (taps), and the result.
  for (const i of F) {
    const v = (await S()).fri.m[i];
    if (v === 2) continue;
    await t.trykk(celle(i));
    if (v === 0) await t.trykk(celle(i));
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(600);
  let alt = await S();
  t.sjekk(alt.fri.ferdig && alt.rekorder[6] && alt.rekorder[6].antall === 1, "Det løste brettet ga ingen rekord");
  t.sjekk((await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)) && (!t.norsk || /Spill igjen/.test(await t.tekst(".dokk .knapp"))) && (await t.antall(".sk-mini i")) === 36, "Sluttskjermen mangler de vanlige knappene eller minibrettet");
  t.sjekk(!t.norsk || /Første brett på 6 × 6/.test(await t.tekst(".hjelp")), "Sluttskjermen sier ikke at det er første brett");
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes(".sk-rekorder li")) && !(await t.finnes('[data-h="fortsett"]')), "Hjemskjermen viser ikke rekorden, eller tilbyr et ferdig spill");

  // ----- Dagens stjernehimmel -----
  await t.klikk('[data-h="dagens"]');
  await t.vent("Rusj.S.dag && document.querySelectorAll('.sk-celle').length > 30");
  await pause();
  sp = (await S()).dag;
  const ventet = M.lagDaglig(dag.tekst, dag.nr);
  t.sjekk(sp.dagens === dag.tekst && sp.n === M.dagligStorrelse(dag.nr) && sp.felt.join() === Array.from(ventet.felt).join(), "Dagens himmel kommer ikke fra datoen");
  t.sjekk(!t.norsk || /dagens/i.test(await t.tekst(".sk-hud")), "Dagens stjernehimmel sier ikke at det er dagens");
  await t.bilde("dagens");
  const DF = fasit(sp);
  await t.trykk(celle(DF[0]));
  await t.trykk(celle(DF[0]));
  await t.klikk("#tilbake");
  let felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").stjernekikkeren`);
  t.sjekk(felles && felles.pagar && felles.pagar.nr === dag.nr && /^\d+:\d\d$/.test(felles.pagar.tekst), `Forsiden får ikke vite at dagens himmel er i gang (${JSON.stringify(felles)})`);
  t.sjekk(!t.norsk || /Fortsett dagens/.test(await t.tekst('[data-h="dagens"]')), "Hjemskjermen tilbyr ikke å fortsette dagens");
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelectorAll('.sk-celle .sk-stjerne').length === 1");
  await pause();
  // The rest with the keyboard.
  await t.js(`document.querySelector('${celle(DF[0])}').focus()`);
  for (const i of DF.slice(1)) {
    await markor(sp.n, i);
    await tast("s", 83);
    await t.vent(`Rusj.S.dag.m[${i}] === 2 || Rusj.S.dag.ferdig`, 3000);
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(700);
  alt = await S();
  const res = alt.daglig.dager[dag.tekst];
  t.sjekk(res && res.sek > 0 && res.hint === 0 && alt.daglig.rekke === 1, "Dagens himmel ble ikke lagret som løst");
  felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").stjernekikkeren`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.rekke === 1 && /^\d+:\d\d$/.test(felles.res), `Forsiden får ikke resultatet (${JSON.stringify(felles)})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".sk-nedtelling b")) && (t.norsk ? /1 dag på rad/ : /1/).test(await t.tekst(".sk-rekke")), "Resultatet mangler nedtelling eller rekke");
  const n1 = await t.tekst(".sk-nedtelling b");
  await t.sov(1200);
  t.sjekk((await t.tekst(".sk-nedtelling b")) !== n1, "Nedtellingen står stille");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""} ${delt.url || ""}` : "";
  t.sjekk((t.norsk ? /Stjernekikkeren nr\. \d+ · \d+ × \d+ · \d+:\d\d · uten hint/ : /\d+ × \d+ · \d+:\d\d/).test(delTekst) && delTekst.includes("#utfordring"), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  t.sjekk(!/★|⭐.*⭐|[■□]/.test(delTekst.replace(/^⭐/, "")), "Delingen inneholder brettet");
  await t.bilde("dagens-resultat", true);
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  await pause();
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Dagens stjernehimmel: \d+:\d\d/ : /\d+:\d\d/).test(await t.tekst(".sk-daglinje")) && (await t.finnes(".sk-nedtelling b")), "Hjemskjermen viser ikke at dagens himmel er løst");
  await t.bilde("hjem-lost");

  // ----- Fit: a 10 × 10 sky on the screen, no page scrolling -----
  await t.klikk('[data-h="bytt"]');
  await t.klikk('.flis[data-v="10"]');
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.sk-celle').length === 100");
  await t.sov(500);
  const m = await t.js(`(() => {
    const b = document.querySelector(".sk-brett").getBoundingClientRect();
    const v = document.querySelector(".sk-verktoy").getBoundingClientRect();
    const c = document.querySelector(".sk-celle").getBoundingClientRect();
    const r = (x) => ({ top: x.top, bottom: x.bottom, left: x.left, right: x.right });
    return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, b: r(b), v: r(v), c: c.width, w: innerWidth, h: innerHeight };
  })()`);
  t.sjekk(m.side <= 1 && m.bred <= 0, `${m.w}×${m.h}: spillskjermen kan scrolles`);
  t.sjekk(m.c >= 26, `${m.w}×${m.h}: rutene er for små (${Math.round(m.c)} px)`);
  t.sjekk(m.v.bottom <= m.h && m.b.bottom <= m.h && m.b.right <= m.w && m.b.left >= 0, `${m.w}×${m.h}: brettet eller verktøyene går utenfor skjermen`);
  if (m.w > m.h) t.sjekk(m.b.right <= m.v.left, `${m.w}×${m.h}: verktøyene står ikke til høyre for brettet`);
  else t.sjekk(m.b.bottom <= m.v.top, `${m.w}×${m.h}: verktøyene står ikke under brettet`);
  await t.bilde("stor");
}
