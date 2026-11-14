// Blekkspruten (nonogram): the size choice, a real touch tap that inks a cell and a second tap that
// rubs it out, a drag along a row (one undo step), the cross tool, a hint, pause, a reload and back +
// «Fortsett», a board solved with the keyboard and its record. The picture gallery: a hand-made
// picture solved, its name on the result and «Neste bilde». «Dagens nonogram»: the day's puzzle
// from the date, progress to the front page, the result with streak and a live countdown, a share
// without the picture, and #dagens. Last: a 12 × 12 board fits the screen with cells big enough.
// Runs in every edition: texts are checked in Norwegian only (t.norsk).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/blekkspruten/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Blekkspruten;

export default async function (t) {
  const pause = () => t.sov(420);
  const S = () => t.tilstand();
  const AKTIV = "(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri)";
  const rute = async () => t.js(`${AKTIV}.rute`);
  const KODE = { " ": 32, Enter: 13, x: 88, Backspace: 8, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
  async function tast(key) {
    const code = key === " " ? "Space" : key.length === 1 ? "Key" + key.toUpperCase() : key;
    const tekst = key.length === 1 ? { text: key } : {};
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: KODE[key], ...tekst });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: KODE[key] });
    await t.sov(25);
  }
  const midt = (i) =>
    t.js(`(() => { const b = document.querySelector(".bs-ruter").getBoundingClientRect(); const sp = ${AKTIV}; const c = b.width / sp.C; return { x: b.left + ((${i}) % sp.C + 0.5) * c, y: b.top + (Math.floor((${i}) / sp.C) + 0.5) * c }; })()`);
  async function trykkCelle(i) {
    const p = await midt(i);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    await t.sov(50);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(150);
  }
  async function dra(a, b) {
    const p = await midt(a);
    const q = await midt(b);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    for (let s = 1; s <= 8; s++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + ((q.x - p.x) * s) / 8, y: p.y + ((q.y - p.y) * s) / 8 }] });
      await t.sov(16);
    }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(200);
  }
  // Inks the solution with the keyboard: to the top left, then row by row in a snake.
  async function losMedTastatur() {
    await t.js("document.querySelector('.bs-brett').focus()");
    const sp = await t.js(AKTIV);
    for (let k = 0; k < sp.R; k++) await tast("ArrowUp");
    for (let k = 0; k < sp.C; k++) await tast("ArrowLeft");
    for (let r = 0; r < sp.R; r++) {
      for (let k = 0; k < sp.C; k++) {
        const c = r % 2 ? sp.C - 1 - k : k;
        const i = r * sp.C + c;
        const na = (await rute())[i];
        const vil = sp.losning[i] === "1";
        if (vil && na !== "1") await tast(" ");
        else if (!vil && na === "1") await tast("Backspace");
        if (await t.js(`${AKTIV}.ferdig`)) return;
        if (k < sp.C - 1) await tast(r % 2 ? "ArrowLeft" : "ArrowRight");
      }
      if (r < sp.R - 1) await tast("ArrowDown");
    }
  }

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const dag = await t.js("Rusj.dag()");

  // ----- Home -----
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .bs-kal'), "Dagens nonogram er ikke hovedknappen på hjemskjermen");
  t.sjekk(!t.norsk || /Spill fritt · 10 × 10/.test(await t.tekst('[data-h="nytt"]')), "Mangler «Spill fritt · 10 × 10» på hjemskjermen");
  await t.bilde("hjem");

  // ----- Setup: random, 5 × 5 -----
  await t.klikk('[data-h="bytt"]');
  await t.vent("document.querySelector('.flis[data-h=\"modus\"]')");
  t.sjekk((await t.antall('.flis[data-h="storrelse"]')) === 4, "Oppsettet har ikke fire størrelser");
  await t.klikk('.flis[data-v="5"]');
  await t.bilde("oppsett");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.bs-ruter i').length === 25");
  await pause();
  let sp = (await S()).fri;
  t.sjekk(sp.R === 5 && sp.rute === "0".repeat(25), "Brettet starter ikke tomt");
  t.sjekk((await t.antall(".bs-kolhint span")) === 5 && (await t.antall(".bs-radhint span")) === 5, "Tallene vises ikke");
  t.sjekk(!t.norsk || /Trykk eller dra/.test(await t.tekst(".bs-tips")), "Det tomme brettet sier ikke hvordan man starter");
  await t.bilde("start");

  // A tap inks, a second tap rubs out.
  await trykkCelle(6);
  t.sjekk((await rute())[6] === "1" && (await t.finnes(".bs-ruter i.f")), "Et trykk fylte ikke ruta");
  await trykkCelle(6);
  t.sjekk((await rute())[6] === "0", "Et nytt trykk visket ikke ut ruta");
  // A drag along a row: one undo step.
  await dra(10, 14);
  sp = (await S()).fri;
  t.sjekk(sp.rute.slice(10, 15) === "11111" && sp.angre.length === 3, `Draget fylte ikke raden (${sp.rute.slice(10, 15)}, ${sp.angre.length} angresteg)`);
  await t.bilde("dra");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await rute()).slice(10, 15) === "00000", "Angre tok ikke bort draget");
  // The cross tool.
  await t.klikk('.bs-v[data-v="2"]');
  t.sjekk((await t.js("document.querySelector('.bs-v[data-v=\"2\"]').getAttribute('aria-pressed')")) === "true", "Kryss-verktøyet er ikke valgt");
  await trykkCelle(0);
  t.sjekk((await rute())[0] === "2" && (await t.finnes(".bs-ruter i.x")), "Kryss-verktøyet satte ikke kryss");
  await t.klikk('.bs-v[data-v="1"]');
  // A hint: if the cross is wrong it is rubbed out, else a line is filled in.
  await t.klikk('[data-h="hint"]');
  await t.sov(150);
  sp = (await S()).fri;
  t.sjekk(sp.hintIgjen === 2 && (await t.js("document.querySelector('.bs-melding').textContent.length")) > 5, "Hintet sier ingenting");
  t.sjekk((await t.antall(".bs-ruter i.h, .bs-ruter i.feil")) > 0, "Hintet viser ikke hvor");
  const losning = sp.losning;
  t.sjekk([...sp.rute].every((x, i) => x === "0" || (x === "1") === (losning[i] === "1")), "Hintet satte noe feil");
  await t.bilde("hint");

  // Pause
  await t.klikk(".bs-klokke");
  t.sjekk(await t.finnes(".bs-pauseboks:not([hidden])"), "Pause viser ikke pauseboksen");
  const tid1 = (await S()).fri.tid;
  await t.sov(600);
  t.sjekk((await S()).fri.tid === tid1, "Klokka går under pause");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-spill"]');

  // Reload mid-game, then back + «Fortsett».
  const forLast = (await S()).fri;
  await t.lastSide(t.side, "document.querySelectorAll('.bs-ruter i').length === 25");
  await pause();
  sp = (await S()).fri;
  t.sjekk(sp.rute === forLast.rute && (await t.antall(".bs-ruter i.f")) === (sp.rute.match(/1/g) || []).length, "Brettet ble ikke det samme etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett · 5 × 5 · \d+:\d\d/ : /5 × 5/).test(await t.tekst('[data-h="fortsett"]')), `Hjemskjermen tilbyr ikke å fortsette («${await t.tekst('[data-h="fortsett"]')}»)`);
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.bs-ruter i').length === 25");
  await pause();

  await losMedTastatur();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(500);
  let alt = await S();
  t.sjekk(alt.fri.ferdig && alt.rekorder[5] && alt.rekorder[5].antall === 1, "Det løste brettet ga ingen rekord");
  t.sjekk((await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)) && (!t.norsk || /Spill igjen/.test(await t.tekst(".dokk .knapp"))) && (await t.finnes(".bs-mini path")), "Sluttskjermen mangler de vanlige knappene eller bildet");
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes(".bs-rekorder li")) && !(await t.finnes('[data-h="fortsett"]')), "Hjemskjermen viser ikke rekorden, eller tilbyr et ferdig spill");

  // ----- A picture from the gallery -----
  await t.klikk('[data-h="bytt"]');
  await t.klikk('.flis[data-h="modus"][data-v="bilde"]');
  await t.vent("document.querySelectorAll('.bs-bildevalg').length > 20");
  t.sjekk((await t.antall(".bs-bildevalg .bs-ukjent")) === (await t.antall(".bs-bildevalg")), "Galleriet viser bilder som ikke er malt");
  await t.klikk('.bs-bildevalg[data-v="hjertelite"]');
  await t.bilde("galleri");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.bs-ruter i').length === 25");
  await pause();
  t.sjekk((await S()).fri.bilde === "hjertelite", "Bildet ble ikke valgt");
  await losMedTastatur();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(500);
  t.sjekk((await t.finnes(".bs-ferdig figcaption")) && (!t.norsk || /Lite hjerte/.test(await t.tekst(".bs-ferdig figcaption"))), "Sluttskjermen sier ikke hva bildet var");
  t.sjekk((await S()).bilder.hjertelite && (await t.finnes('.dokk [data-h="nestebilde"]')), "Bildet ble ikke lagret, eller «Neste bilde» mangler");
  await t.bilde("bilde-ferdig", true);
  await t.klikk("#tilbake");
  await t.klikk('[data-h="bytt"]');
  t.sjekk(await t.finnes('.bs-bildevalg[data-v="hjertelite"] .bs-tommel'), "Galleriet viser ikke det malte bildet");
  await t.klikk("#tilbake");

  // ----- Dagens nonogram -----
  await t.klikk('[data-h="dagens"]');
  await t.vent("Rusj.S.dag && document.querySelectorAll('.bs-ruter i').length >= 64");
  await pause();
  sp = (await S()).dag;
  const ventet = M.lagDaglig(dag.tekst, dag.nr);
  t.sjekk(sp.dagens === dag.tekst && sp.R === M.dagligStorrelse(dag.nr) && sp.losning === Array.from(ventet.celler).join(""), "Dagens nonogram kommer ikke fra datoen");
  t.sjekk(!t.norsk || /dagens/i.test(await t.tekst(".bs-hud")), "Dagens nonogram sier ikke at det er dagens");
  await t.bilde("dagens");
  await trykkCelle(sp.losning.indexOf("1"));
  await t.klikk("#tilbake");
  let felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").blekkspruten`);
  t.sjekk(felles && felles.pagar && felles.pagar.nr === dag.nr && /^\d+:\d\d$/.test(felles.pagar.tekst), `Forsiden får ikke vite at dagens nonogram er i gang (${JSON.stringify(felles)})`);
  t.sjekk(!t.norsk || /Fortsett dagens/.test(await t.tekst('[data-h="dagens"]')), "Hjemskjermen tilbyr ikke å fortsette dagens");
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelectorAll('.bs-ruter i.f').length === 1");
  await pause();
  await losMedTastatur();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(700);
  alt = await S();
  const res = alt.daglig.dager[dag.tekst];
  t.sjekk(res && res.sek > 0 && res.hint === 0 && alt.daglig.rekke === 1, "Dagens nonogram ble ikke lagret som løst");
  felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").blekkspruten`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.rekke === 1 && /^\d+:\d\d$/.test(felles.res), `Forsiden får ikke resultatet (${JSON.stringify(felles)})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".bs-nedtelling b")) && (t.norsk ? /1 dag på rad/ : /1/).test(await t.tekst(".bs-rekke")), "Resultatet mangler nedtelling eller rekke");
  const n1 = await t.tekst(".bs-nedtelling b");
  await t.sov(1200);
  t.sjekk((await t.tekst(".bs-nedtelling b")) !== n1, "Nedtellingen står stille");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""} ${delt.url || ""}` : "";
  t.sjekk((t.norsk ? /Blekkspruten nr\. \d+ · \d+ × \d+ · \d+:\d\d · uten hint/ : /\d+ × \d+ · \d+:\d\d/).test(delTekst) && delTekst.includes("#utfordring"), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  t.sjekk(!/[■□⬛⬜]/.test(delTekst) && !delTekst.includes(sp.losning.slice(0, 12)), "Delingen viser bildet");
  await t.bilde("dagens-resultat", true);
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  await pause();
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Dagens nonogram: \d+:\d\d/ : /\d+:\d\d/).test(await t.tekst(".bs-daglinje")) && (await t.finnes(".bs-nedtelling b")), "Hjemskjermen viser ikke at dagens nonogram er løst");
  await t.bilde("hjem-lost");

  // ----- Fit: a 12 × 12 board on the screen, no page scrolling -----
  await t.klikk('[data-h="bytt"]');
  await t.klikk('.flis[data-h="modus"][data-v="fri"]');
  await t.klikk('.flis[data-v="12"]');
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.bs-ruter i').length === 144");
  await t.sov(500);
  const m = await t.js(`(() => {
    const b = document.querySelector(".bs-brett").getBoundingClientRect();
    const v = document.querySelector(".bs-verktoy").getBoundingClientRect();
    const r = (x) => ({ top: x.top, bottom: x.bottom, left: x.left, right: x.right });
    return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, b: r(b), v: r(v), c: document.querySelector(".bs-ruter").getBoundingClientRect().width / 12, w: innerWidth, h: innerHeight };
  })()`);
  t.sjekk(m.side <= 1 && m.bred <= 0, `${m.w}×${m.h}: spillskjermen kan scrolles`);
  t.sjekk(m.c >= 17, `${m.w}×${m.h}: rutene er for små (${Math.round(m.c)} px)`);
  t.sjekk(m.v.bottom <= m.h && m.b.bottom <= m.h && m.b.right <= m.w && m.b.left >= 0, `${m.w}×${m.h}: brettet eller verktøyene går utenfor skjermen`);
  if (m.w > m.h) t.sjekk(m.b.right <= m.v.left, `${m.w}×${m.h}: verktøyene står ikke til høyre for brettet`);
  else t.sjekk(m.b.bottom <= m.v.top, `${m.w}×${m.h}: verktøyene står ikke under brettet`);
  await t.bilde("stor");
}
