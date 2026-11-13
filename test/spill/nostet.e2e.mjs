// Nøstet (one thread through every cell, the numbers in order, walls): the size choice, a real
// touch drag from 1 along the path (one undo step), dragging back, a refused move that says why, a
// tap on the thread that cuts it, a tap that draws on, the keyboard (arrows, Backspace), undo, a
// hint that leads the thread to the next number, «Tøm» with undo, pause, a reload and back +
// «Fortsett», and a solved board with its record. «Dagens nøste»: the day's puzzle from the date,
// progress to the front page, the result with streak and a live countdown, a share without the
// answer, and #dagens. Last: an 8 × 8 board fits the screen with cells big enough to hit.
// Runs in every edition: texts are checked in Norwegian only (t.norsk).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/nostet/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Nostet;

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const S = () => t.tilstand();
  const sti = async () => (await t.js("(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).sti"));
  const KODE = { Backspace: 8, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
  async function tast(key) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: KODE[key] });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: KODE[key] });
    await t.sov(40);
  }
  // The centre of cell i on the screen.
  const midt = (i) =>
    t.js(`(() => { const b = document.querySelector(".ns-ruter").getBoundingClientRect(); const n = ${"(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).n"}; const c = b.width / n; return { x: b.left + ((${i}) % n + 0.5) * c, y: b.top + (Math.floor((${i}) / n) + 0.5) * c }; })()`);
  // A real touch drag through the centres of the given cells.
  async function dra(celler) {
    const p = [];
    for (const i of celler) p.push(await midt(i));
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p[0]] });
    for (let k = 1; k < p.length; k++)
      for (let s = 1; s <= 4; s++) {
        await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p[k - 1].x + ((p[k].x - p[k - 1].x) * s) / 4, y: p[k - 1].y + ((p[k].y - p[k - 1].y) * s) / 4 }] });
        await t.sov(12);
      }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(200);
  }
  async function trykkCelle(i) {
    const p = await midt(i);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    await t.sov(50);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(200);
  }
  const pil = (n, a, b) => (b === a + 1 ? "ArrowRight" : b === a - 1 ? "ArrowLeft" : b === a + n ? "ArrowDown" : "ArrowUp");
  // Draws the rest of the solution with the arrow keys (the thread must be a start of it).
  async function losMedTastatur(sp) {
    await t.js("document.querySelector('.ns-brett').focus()");
    let s = await sti();
    let k = 0;
    while (k < s.length && s[k] === sp.losning[k]) k++;
    for (let j = s.length; j > k; j--) await tast("Backspace");
    for (let j = Math.max(1, k); j < sp.losning.length; j++) {
      await tast(pil(sp.n, sp.losning[j - 1], sp.losning[j]));
      await t.vent(`(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).sti.length === ${j + 1} || (Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri).ferdig`, 3000);
    }
  }

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const dag = await t.js("Rusj.dag()");

  // ----- Home -----
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .ns-kal'), "Dagens nøste er ikke hovedknappen på hjemskjermen");
  t.sjekk(!t.norsk || /Spill fritt · 6 × 6/.test(await t.tekst('[data-h="nytt"]')), "Mangler «Spill fritt · 6 × 6» på hjemskjermen");

  // ----- Setup -----
  await t.klikk('[data-h="bytt"]');
  await t.vent("document.querySelector('.flis[data-h=\"storrelse\"]')");
  t.sjekk((await t.antall('.flis[data-h="storrelse"]')) === 4, "Oppsettet har ikke fire størrelser");
  await t.klikk('.flis[data-v="6"]');
  await t.bilde("oppsett");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.ns-ruter i').length === 36");
  await pause();
  let sp = (await S()).fri;
  const L = sp.losning;
  t.sjekk(sp.n === 6 && M.tell(6, sp.tall, sp.vegger, 2) === 1, "Brettet har ikke nøyaktig én løsning");
  t.sjekk((await t.antall(".ns-tallknapp")) === sp.tall.filter(Boolean).length && sp.sti.length === 1 && sp.tall[sp.sti[0]] === 1, "Tallene vises ikke, eller tråden starter ikke på 1");
  t.sjekk(!t.norsk || /Dra fra 1/.test(await t.tekst(".ns-tips")), "Det tomme brettet sier ikke hvordan man starter");
  await t.bilde("start");

  // A drag from 1 along the path: one undo step.
  await dra(L.slice(0, 5));
  sp = (await S()).fri;
  t.sjekk(sp.sti.join() === L.slice(0, 5).join() && sp.angre.length === 1, `Draget fulgte ikke fingeren (${sp.sti.join()} / ${L.slice(0, 5).join()})`);
  t.sjekk((await t.antall(".ns-ruter i.med")) === 5 && /M/.test(await t.js("document.querySelector('.ns-traad').getAttribute('d')")), "Tråden tegnes ikke");
  await t.bilde("dra");
  // Back along the thread.
  await dra([L[4], L[3]]);
  t.sjekk((await sti()).join() === L.slice(0, 4).join(), "Å dra tilbake tok ikke tråden tilbake");
  // A refused move: a cell that is not next to the end nor in line with it.
  const ende = L[3];
  const langt = [...Array(36).keys()].find((i) => !L.slice(0, 4).includes(i) && Math.floor(i / 6) !== Math.floor(ende / 6) && i % 6 !== ende % 6);
  await trykkCelle(langt);
  t.sjekk((await sti()).length === 4 && (await t.js("document.querySelector('.ns-melding').textContent.length")) > 5, "Et ulovlig trekk ble ikke stoppet med en forklaring");
  await t.bilde("nei");
  // A tap on the thread cuts it there; a tap next to the end draws on.
  await trykkCelle(L[1]);
  t.sjekk((await sti()).join() === L.slice(0, 2).join(), "Trykk på tråden kuttet den ikke");
  await trykkCelle(L[2]);
  t.sjekk((await sti()).join() === L.slice(0, 3).join(), "Trykk ved enden trakk ikke tråden videre");
  // The keyboard.
  await t.js("document.querySelector('.ns-brett').focus()");
  await tast(pil(6, L[2], L[3]));
  await tast(pil(6, L[3], L[4]));
  t.sjekk((await sti()).join() === L.slice(0, 5).join(), "Piltastene trakk ikke tråden");
  await tast("Backspace");
  t.sjekk((await sti()).length === 4, "Backspace tok ikke tråden ett steg tilbake");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await sti()).length === 5, "Angre hentet ikke tilbake steget");

  // A hint leads the thread on to the next number.
  await t.klikk('[data-h="hint"]');
  sp = (await S()).fri;
  const s1 = sp.sti;
  t.sjekk(s1.length > 5 && s1.join() === L.slice(0, s1.length).join() && sp.tall[s1[s1.length - 1]] > 0 && sp.hintIgjen === 2, "Hintet førte ikke tråden riktig fram til et tall");
  await t.sov(150);
  t.sjekk((await t.antall(".ns-ruter i.hintet")) > 0 && (await t.js("document.querySelector('.ns-melding').textContent.length")) > 5, "Hintet vises eller forklares ikke");
  await t.bilde("hint");

  // «Tøm» and undo
  await t.klikk('[data-h="tom"]');
  t.sjekk((await sti()).length === 1, "Tøm tok ikke tråden tilbake til 1");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await sti()).length === s1.length, "Angre hentet ikke tilbake tråden");

  // Pause
  await t.klikk(".ns-klokke");
  t.sjekk(await t.finnes(".ns-pauseboks:not([hidden])"), "Pause viser ikke pauseboksen");
  const tid1 = (await S()).fri.tid;
  await t.sov(700);
  t.sjekk((await S()).fri.tid === tid1, "Klokka går under pause");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-spill"]');

  // Reload mid-game, then back + «Fortsett».
  const forLast = (await S()).fri;
  await t.lastSide(t.side, "document.querySelectorAll('.ns-ruter i').length === 36");
  await pause();
  sp = (await S()).fri;
  t.sjekk(sp.sti.join() === forLast.sti.join() && (await t.antall(".ns-ruter i.med")) === sp.sti.length, "Tråden ble ikke den samme etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett · 6 × 6 · \d+:\d\d/ : /6 × 6/).test(await t.tekst('[data-h="fortsett"]')), `Hjemskjermen tilbyr ikke å fortsette («${await t.tekst('[data-h="fortsett"]')}»)`);
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.ns-ruter i').length === 36");
  await pause();

  // Solve with the keyboard; the result.
  await losMedTastatur(sp);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(600);
  let alt = await S();
  t.sjekk(alt.fri.ferdig && alt.rekorder[6] && alt.rekorder[6].antall === 1, "Det løste brettet ga ingen rekord");
  t.sjekk((await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)) && (!t.norsk || /Spill igjen/.test(await t.tekst(".dokk .knapp"))) && (await t.finnes(".ns-mini path")), "Sluttskjermen mangler de vanlige knappene eller minibrettet");
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes(".ns-rekorder li")) && !(await t.finnes('[data-h="fortsett"]')), "Hjemskjermen viser ikke rekorden, eller tilbyr et ferdig spill");

  // ----- Dagens nøste -----
  await t.klikk('[data-h="dagens"]');
  await t.vent("Rusj.S.dag && document.querySelectorAll('.ns-ruter i').length >= 25");
  await pause();
  sp = (await S()).dag;
  const ventet = M.lagDaglig(dag.tekst, dag.nr);
  t.sjekk(sp.dagens === dag.tekst && sp.n === M.dagligStorrelse(dag.nr) && sp.tall.join() === Array.from(ventet.tall).join() && sp.vegger.join() === Array.from(ventet.vegger).join(), "Dagens nøste kommer ikke fra datoen");
  t.sjekk(!t.norsk || /dagens/i.test(await t.tekst(".ns-hud")), "Dagens nøste sier ikke at det er dagens");
  await t.bilde("dagens");
  await dra(sp.losning.slice(0, 3));
  await t.klikk("#tilbake");
  let felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").nostet`);
  t.sjekk(felles && felles.pagar && felles.pagar.nr === dag.nr && /^\d+:\d\d$/.test(felles.pagar.tekst), `Forsiden får ikke vite at dagens nøste er i gang (${JSON.stringify(felles)})`);
  t.sjekk(!t.norsk || /Fortsett dagens/.test(await t.tekst('[data-h="dagens"]')), "Hjemskjermen tilbyr ikke å fortsette dagens");
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelectorAll('.ns-ruter i.med').length === 3");
  await pause();
  await losMedTastatur(sp);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(700);
  alt = await S();
  const res = alt.daglig.dager[dag.tekst];
  t.sjekk(res && res.sek > 0 && res.hint === 0 && alt.daglig.rekke === 1, "Dagens nøste ble ikke lagret som løst");
  felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").nostet`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.rekke === 1 && /^\d+:\d\d$/.test(felles.res), `Forsiden får ikke resultatet (${JSON.stringify(felles)})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".ns-nedtelling b")) && (t.norsk ? /1 dag på rad/ : /1/).test(await t.tekst(".ns-rekke")), "Resultatet mangler nedtelling eller rekke");
  const n1 = await t.tekst(".ns-nedtelling b");
  await t.sov(1200);
  t.sjekk((await t.tekst(".ns-nedtelling b")) !== n1, "Nedtellingen står stille");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""} ${delt.url || ""}` : "";
  t.sjekk((t.norsk ? /Nøstet nr\. \d+ · \d+ × \d+ · \d+:\d\d · uten hint/ : /\d+ × \d+ · \d+:\d\d/).test(delTekst) && delTekst.includes("#utfordring"), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  t.sjekk(!/[←→↑↓]/.test(delTekst), "Delingen inneholder veien");
  await t.bilde("dagens-resultat", true);
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  await pause();
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Dagens nøste: \d+:\d\d/ : /\d+:\d\d/).test(await t.tekst(".ns-daglinje")) && (await t.finnes(".ns-nedtelling b")), "Hjemskjermen viser ikke at dagens nøste er løst");
  await t.bilde("hjem-lost");

  // ----- Fit: an 8 × 8 board on the screen, no page scrolling -----
  await t.klikk('[data-h="bytt"]');
  await t.klikk('.flis[data-v="8"]');
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.ns-ruter i').length === 64");
  await t.sov(500);
  const m = await t.js(`(() => {
    const b = document.querySelector(".ns-brett").getBoundingClientRect();
    const v = document.querySelector(".ns-verktoy").getBoundingClientRect();
    const r = (x) => ({ top: x.top, bottom: x.bottom, left: x.left, right: x.right });
    return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, b: r(b), v: r(v), c: b.width / 8, w: innerWidth, h: innerHeight };
  })()`);
  t.sjekk(m.side <= 1 && m.bred <= 0, `${m.w}×${m.h}: spillskjermen kan scrolles`);
  t.sjekk(m.c >= 30, `${m.w}×${m.h}: rutene er for små (${Math.round(m.c)} px)`);
  t.sjekk(m.v.bottom <= m.h && m.b.bottom <= m.h && m.b.right <= m.w && m.b.left >= 0, `${m.w}×${m.h}: brettet eller verktøyene går utenfor skjermen`);
  if (m.w > m.h) t.sjekk(m.b.right <= m.v.left, `${m.w}×${m.h}: verktøyene står ikke til høyre for brettet`);
  else t.sjekk(m.b.bottom <= m.v.top, `${m.w}×${m.h}: verktøyene står ikke under brettet`);
  await t.bilde("stor");
}
