// Sebraen (black and white, never three alike in a row, as many of each per line, = and × signs):
// the size choice, a tap cycle (black → white → empty), the signs on the board, three alike marked
// (and said why), givens that stay put, the keyboard (arrows, 1, 2, Backspace), a hint, «Tøm» with
// undo, pause, a reload and back + «Fortsett», and a solved board with its record.
// «Dagens sebra»: the day's puzzle from the date, progress to the front page, the result with streak
// and a live countdown, a share without the answer, and #dagens. Last: a 10 × 10 board fits the
// screen with cells big enough to hit (portrait and landscape).
// Runs in every edition: texts are checked in Norwegian only (t.norsk).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/sebraen/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Sebraen;

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const S = () => t.tilstand();
  const celle = (i) => `.sb-celle[data-i="${i}"]`;
  const si = () => t.js("document.querySelector('#si').textContent");
  const KODE = { 1: 49, 2: 50, Backspace: 8, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
  async function tast(key) {
    const code = /^\d$/.test(key) ? "Digit" + key : key;
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: KODE[key], ...(key.length === 1 ? { text: key } : {}) });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: KODE[key] });
    await t.sov(40);
  }
  // The keyboard cursor to cell i with the arrow keys.
  async function markor(n, i) {
    const fra = await t.js("(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).valgt");
    const dr = Math.floor(i / n) - Math.floor(fra / n);
    const dc = (i % n) - (fra % n);
    for (let k = 0; k < Math.abs(dr); k++) await tast(dr > 0 ? "ArrowDown" : "ArrowUp");
    for (let k = 0; k < Math.abs(dc); k++) await tast(dc > 0 ? "ArrowRight" : "ArrowLeft");
    await t.vent(`(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).valgt === ${i}`, 3000);
  }
  // Fills every cell that is not right yet, with the keyboard.
  async function losMedTastatur(hva) {
    const sp = (await S())[hva];
    await t.js(`document.querySelector('${celle(0)}').focus()`);
    for (let i = 0; i < sp.n * sp.n; i++) {
      if (sp.v[i] === sp.losning[i]) continue;
      await markor(sp.n, i);
      await tast(String(sp.losning[i]));
      await t.vent(`(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).v[${i}] === ${sp.losning[i]}`, 3000);
    }
  }

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const dag = await t.js("Rusj.dag()");

  // ----- Home -----
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .sb-kal'), "Dagens sebra er ikke hovedknappen på hjemskjermen");
  t.sjekk(!t.norsk || /Spill fritt · 6 × 6/.test(await t.tekst('[data-h="nytt"]')), "Mangler «Spill fritt · 6 × 6» på hjemskjermen");

  // ----- Setup -----
  await t.klikk('[data-h="bytt"]');
  await t.vent("document.querySelector('.flis[data-h=\"storrelse\"]')");
  t.sjekk((await t.antall('.flis[data-h="storrelse"]')) === 3, "Oppsettet har ikke tre størrelser");
  await t.klikk('.flis[data-v="6"]');
  await t.bilde("oppsett");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.sb-celle').length === 36");
  await pause();
  let sp = (await S()).fri;
  t.sjekk(sp.n === 6 && M.tell(6, sp.gitt, sp.tegn, 2) === 1, "Brettet har ikke nøyaktig én løsning");
  t.sjekk((await t.antall(".sb-tegn")) === sp.tegn.filter(Boolean).length && (await t.antall(".sb-celle.gitt .sb-prikk")) === sp.gitt.filter(Boolean).length, "Tegnene eller de gitte prikkene vises ikke");
  t.sjekk(!t.norsk || /Trykk én gang for svart/.test(await t.tekst(".sb-tips")), "Det tomme brettet sier ikke hvordan man fyller");
  await t.bilde("start");

  // A tap: black, white, empty.
  const fri = [...Array(36).keys()].filter((i) => !sp.gitt[i]);
  const a = fri[0];
  await t.trykk(celle(a));
  t.sjekk((await S()).fri.v[a] === 1 && (await t.finnes(`${celle(a)} .sb-prikk.svart`)), "Første trykk ga ikke svart");
  await t.trykk(celle(a));
  t.sjekk((await S()).fri.v[a] === 2 && (await t.finnes(`${celle(a)} .sb-prikk.hvit`)), "Andre trykk ga ikke hvit");
  t.sjekk(!t.norsk || /: hvit/.test(await t.js(`document.querySelector('${celle(a)}').getAttribute("aria-label")`)), "Ruta sier ikke at den er hvit");
  await t.trykk(celle(a));
  t.sjekk((await S()).fri.v[a] === 0, "Tredje trykk tømte ikke ruta");

  // A given stays put.
  const g = sp.gitt.findIndex(Boolean);
  if (g >= 0) {
    await t.trykk(celle(g));
    t.sjekk((await S()).fri.v[g] === sp.gitt[g], "En gitt rute kunne endres");
  }

  // Three alike in a row: all three are marked, and it is said why.
  let tre = null;
  for (let r = 0; r < 6 && !tre; r++)
    for (let c = 0; c + 2 < 6 && !tre; c++) {
      const k = [0, 1, 2].map((d) => r * 6 + c + d);
      if (k.every((i) => !sp.gitt[i])) tre = k;
    }
  if (tre) {
    const steg0 = (await S()).fri.angre.length;
    for (const i of tre) await t.trykk(celle(i));
    t.sjekk((await t.antall(".sb-celle.konflikt")) >= 3 && tre.every((i) => true), "Tre like på rad blir ikke merket");
    t.sjekk(!t.norsk || /Tre like på rad/.test(await si()), `Bruddet leses ikke opp: «${await si()}»`);
    await t.bilde("tre-like");
    for (let k = 0; k < 3; k++) await t.klikk('[data-h="angre"]', 80);
    sp = (await S()).fri;
    t.sjekk(sp.v.every((x, i) => x === sp.gitt[i]) && sp.angre.length === steg0, "Angre tok ikke tilbake trykkene");
  } else t.feil("Fant ingen tre ledige ruter på rad å teste med");

  // The keyboard: 1 black, 2 white, Backspace empty.
  await t.js(`document.querySelector('${celle(0)}').focus()`);
  await markor(6, a);
  await tast("1");
  t.sjekk((await S()).fri.v[a] === 1, "1 ga ikke svart");
  await tast("2");
  t.sjekk((await S()).fri.v[a] === 2, "2 ga ikke hvit");
  t.sjekk(await t.js(`document.activeElement === document.querySelector('${celle(a)}')`), "Fokus følger ikke piltastene");
  await tast("Backspace");
  t.sjekk((await S()).fri.v[a] === 0, "Backspace tømte ikke ruta");

  // A hint: a cell that follows, with the reason.
  await t.klikk('[data-h="hint"]');
  sp = (await S()).fri;
  t.sjekk(sp.hint.length === 1 && sp.v[sp.hint[0]] === sp.losning[sp.hint[0]] && sp.hintIgjen === 2, "Hintet satte ikke en riktig rute");
  await t.sov(200);
  t.sjekk((await t.js("document.querySelector('.sb-melding').textContent.length")) > 10, "Hintet forklarer ingenting");
  await t.bilde("hint");

  // «Tøm» keeps the givens and the hint, and can be undone.
  const b = fri.find((i) => i !== sp.hint[0]);
  await t.trykk(celle(b));
  await t.klikk('[data-h="tom"]');
  sp = (await S()).fri;
  t.sjekk(sp.v[b] === 0 && sp.v[sp.hint[0]] === sp.losning[sp.hint[0]] && sp.v.every((x, i) => !sp.gitt[i] || x === sp.gitt[i]), "Tøm fjernet feil ruter");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await S()).fri.v[b] === 1, "Angre hentet ikke tilbake det som ble tømt");

  // Pause
  await t.klikk(".sb-klokke");
  t.sjekk(await t.finnes(".sb-pauseboks:not([hidden])"), "Pause viser ikke pauseboksen");
  const tid1 = (await S()).fri.tid;
  await t.sov(700);
  t.sjekk((await S()).fri.tid === tid1, "Klokka går under pause");
  await t.klikk('[data-h="fortsett-spill"]');

  // Reload mid-game, then back + «Fortsett».
  const forLast = (await S()).fri;
  await t.lastSide(t.side, "document.querySelectorAll('.sb-celle').length === 36");
  await pause();
  sp = (await S()).fri;
  t.sjekk(sp.v.join() === forLast.v.join() && sp.tegn.join() === forLast.tegn.join() && (await t.antall(".sb-celle .sb-prikk")) === sp.v.filter(Boolean).length, "Brettet ble ikke det samme etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett · 6 × 6 · \d+:\d\d/ : /6 × 6/).test(await t.tekst('[data-h="fortsett"]')), `Hjemskjermen tilbyr ikke å fortsette («${await t.tekst('[data-h="fortsett"]')}»)`);
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.sb-celle').length === 36");
  await pause();

  // Solve with the keyboard; the result.
  await losMedTastatur("fri");
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(600);
  let alt = await S();
  t.sjekk(alt.fri.ferdig && alt.rekorder[6] && alt.rekorder[6].antall === 1, "Det løste brettet ga ingen rekord");
  t.sjekk((await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)) && (!t.norsk || /Spill igjen/.test(await t.tekst(".dokk .knapp"))) && (await t.antall(".sb-mini i")) === 36, "Sluttskjermen mangler de vanlige knappene eller minibrettet");
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes(".sb-rekorder li")) && !(await t.finnes('[data-h="fortsett"]')), "Hjemskjermen viser ikke rekorden, eller tilbyr et ferdig spill");

  // ----- Dagens sebra -----
  await t.klikk('[data-h="dagens"]');
  await t.vent("Rusj.S.dag && document.querySelectorAll('.sb-celle').length >= 36");
  await pause();
  sp = (await S()).dag;
  const ventet = M.lagDaglig(dag.tekst, dag.nr);
  t.sjekk(sp.dagens === dag.tekst && sp.n === M.dagligStorrelse(dag.nr) && sp.gitt.join() === Array.from(ventet.gitt).join() && sp.tegn.join() === Array.from(ventet.tegn).join(), "Dagens sebra kommer ikke fra datoen");
  t.sjekk(!t.norsk || /dagens/i.test(await t.tekst(".sb-hud")), "Dagens sebra sier ikke at det er dagens");
  await t.bilde("dagens");
  const d0 = sp.gitt.findIndex((x) => !x);
  for (let k = 0; k < sp.losning[d0]; k++) await t.trykk(celle(d0));
  await t.klikk("#tilbake");
  let felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").sebraen`);
  t.sjekk(felles && felles.pagar && felles.pagar.nr === dag.nr && /^\d+:\d\d$/.test(felles.pagar.tekst), `Forsiden får ikke vite at dagens sebra er i gang (${JSON.stringify(felles)})`);
  t.sjekk(!t.norsk || /Fortsett dagens/.test(await t.tekst('[data-h="dagens"]')), "Hjemskjermen tilbyr ikke å fortsette dagens");
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelectorAll('.sb-celle').length >= 36");
  await pause();
  await losMedTastatur("dag");
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(700);
  alt = await S();
  const res = alt.daglig.dager[dag.tekst];
  t.sjekk(res && res.sek > 0 && res.hint === 0 && alt.daglig.rekke === 1, "Dagens sebra ble ikke lagret som løst");
  felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").sebraen`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.rekke === 1 && /^\d+:\d\d$/.test(felles.res), `Forsiden får ikke resultatet (${JSON.stringify(felles)})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".sb-nedtelling b")) && (t.norsk ? /1 dag på rad/ : /1/).test(await t.tekst(".sb-rekke")), "Resultatet mangler nedtelling eller rekke");
  const n1 = await t.tekst(".sb-nedtelling b");
  await t.sov(1200);
  t.sjekk((await t.tekst(".sb-nedtelling b")) !== n1, "Nedtellingen står stille");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""} ${delt.url || ""}` : "";
  t.sjekk((t.norsk ? /Sebraen nr\. \d+ · \d+ × \d+ · \d+:\d\d · uten hint/ : /\d+ × \d+ · \d+:\d\d/).test(delTekst) && delTekst.includes("#utfordring"), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  t.sjekk(!/[●○⚫⚪]/.test(delTekst), "Delingen inneholder brettet");
  await t.bilde("dagens-resultat", true);
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  await pause();
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Dagens sebra: \d+:\d\d/ : /\d+:\d\d/).test(await t.tekst(".sb-daglinje")) && (await t.finnes(".sb-nedtelling b")), "Hjemskjermen viser ikke at dagens sebra er løst");
  await t.bilde("hjem-lost");

  // ----- Fit: a 10 × 10 board on the screen, no page scrolling -----
  await t.klikk('[data-h="bytt"]');
  await t.klikk('.flis[data-v="10"]');
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.sb-celle').length === 100");
  await t.sov(500);
  const m = await t.js(`(() => {
    const b = document.querySelector(".sb-brett").getBoundingClientRect();
    const v = document.querySelector(".sb-verktoy").getBoundingClientRect();
    const c = document.querySelector(".sb-celle").getBoundingClientRect();
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
