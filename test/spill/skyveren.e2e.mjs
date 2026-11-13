// Skyveren (sliding puzzle): 3 × 3 with numbers – a tile slides into the empty square, a tile out
// of line refuses, a far tap slides a whole row, the arrow keys, the answer sheet, a reload and back
// + «Fortsett», then solved along a shortest path (breadth-first search here in the test) with its
// record and share. Picture mode: the tiles are pieces of a mascot, solved, its name on the result.
// Last: a 5 × 5 board fits the screen with tiles big enough to hit.
// Runs in every edition: texts are checked in Norwegian only (t.norsk).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/skyveren/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Skyveren;

// The places to tap, in order, to solve a 3 × 3 board (shortest path).
function vei(brett) {
  const mal = M.ferdigBrett(3, 3).join();
  const fra = new Map([[brett.join(), null]]);
  const ko = [brett];
  for (let k = 0; k < ko.length; k++) {
    const b = ko[k];
    const key = b.join();
    if (key === mal) {
      const steg = [];
      for (let x = key; fra.get(x); x = fra.get(x).fra) steg.unshift(fra.get(x).plass);
      return steg;
    }
    const tom = b.indexOf(0);
    for (const p of [tom - 3, tom + 3, tom % 3 ? tom - 1 : -1, tom % 3 < 2 ? tom + 1 : -1]) {
      if (p < 0 || p > 8) continue;
      const ny = M.flytt(3, 3, b, p);
      const nk = ny.join();
      if (!fra.has(nk)) {
        fra.set(nk, { fra: key, plass: p });
        ko.push(ny);
      }
    }
  }
  return null;
}

export default async function (t) {
  const pause = () => t.sov(420);
  const S = () => t.tilstand();
  const KODE = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
  async function tast(key) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: KODE[key] });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: KODE[key] });
    await t.sov(60);
  }
  async function trykkPlass(plass) {
    const x = (await S()).spill.brett[plass];
    await t.klikk(`.sk-bit[data-v="${x}"]`, 90);
  }
  async function los() {
    const b = (await S()).spill.brett;
    const steg = vei(b);
    t.sjekk(steg && steg.length, "Fant ingen vei til løsningen");
    for (const p of steg || []) await trykkPlass(p);
  }

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(!t.norsk || /Skyv · 4 × 4 · tall/.test(await t.tekst(".hjem-knapper .knapp")), "Hjemskjermen starter ikke 4 × 4 med tall");
  await t.bilde("hjem");

  // ----- 3 × 3, numbers -----
  await t.klikk('[data-h="oppsett"]');
  await t.vent("document.querySelector('.flis[data-h=\"storrelse\"]')");
  await t.klikk('.flis[data-h="storrelse"][data-v="3"]');
  await t.bilde("oppsett");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.sk-bit').length === 8");
  await pause();
  let sp = (await S()).spill;
  t.sjekk(sp.n === 3 && M.losbar(3, 3, sp.brett) && !M.lost(sp.brett), "Blandingen kan ikke løses, eller er løst");
  await t.bilde("start");
  // A tile next to the empty square slides in.
  let tom = sp.brett.indexOf(0);
  const ved = [tom - 3, tom + 3, tom % 3 ? tom - 1 : -1, tom % 3 < 2 ? tom + 1 : -1].filter((p) => p >= 0 && p < 9)[0];
  await trykkPlass(ved);
  sp = (await S()).spill;
  t.sjekk(sp.brett[ved] === 0 && sp.trekk === 1, "Biten gled ikke inn i det tomme feltet");
  t.sjekk(!t.norsk || (await t.tekst("#sk-trekk")) === "1", "Trekk-telleren viser ikke 1");
  // A tile out of line refuses.
  tom = sp.brett.indexOf(0);
  const skra = [...Array(9).keys()].find((p) => Math.floor(p / 3) !== Math.floor(tom / 3) && p % 3 !== tom % 3);
  const for1 = sp.brett.join();
  await trykkPlass(skra);
  t.sjekk((await S()).spill.brett.join() === for1, "En bit på skrå flyttet seg");
  // A far tap in the same row slides two.
  sp = (await S()).spill;
  tom = sp.brett.indexOf(0);
  const rad = Math.floor(tom / 3);
  const langt = tom % 3 === 0 ? rad * 3 + 2 : tom % 3 === 2 ? rad * 3 : -1;
  if (langt >= 0) {
    await trykkPlass(langt);
    t.sjekk((await S()).spill.trekk === sp.trekk + 2, "Et langt trykk skjøv ikke hele rekka");
  }
  // The arrow keys.
  await t.js("document.querySelector('.sk-brett').focus()");
  const forPil = (await S()).spill;
  const pil = M.pilPlass(3, 3, forPil.brett, "ned") >= 0 ? "ArrowDown" : "ArrowUp";
  await tast(pil);
  t.sjekk((await S()).spill.trekk === forPil.trekk + 1, "Piltasten flyttet ingen bit");
  await t.bilde("spill");
  // The answer sheet.
  await t.klikk('.dokk [data-h="fasit"]');
  await t.vent("document.querySelector('.ark .sk-fasit')");
  await t.bilde("fasit");
  await t.klikk('.ark [data-h="lukk-ark"]');
  await t.sov(300);

  // Reload, back + «Fortsett».
  const forLast = (await S()).spill;
  await t.lastSide(t.side, "document.querySelectorAll('.sk-bit').length === 8");
  await pause();
  t.sjekk((await S()).spill.brett.join() === forLast.brett.join(), "Brettet ble ikke det samme etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett · 3 × 3 · \d+ trekk/ : /3 × 3/).test(await t.tekst('[data-h="fortsett"]')), "Hjemskjermen tilbyr ikke å fortsette");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.sk-bit').length === 8");
  await pause();

  await los();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(500);
  let alt = await S();
  t.sjekk(alt.spill.ferdig && alt.rekord["tall-3"] && alt.rekord["tall-3"].trekk === alt.spill.trekk, "Den løste blandingen ga ingen rekord");
  t.sjekk((await t.finnes(".sk-fasit-tall")) && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Sluttskjermen mangler fasit eller de vanlige knappene");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  t.sjekk(delt && /3 × 3/.test(delt.text || "") && (!t.norsk || /\d+ trekk/.test(delt.text)), `Delingen mangler resultatet (${JSON.stringify(delt)})`);
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes(".sk-rekorder li")) && (await t.finnes(".sk-sist")), "Hjemskjermen viser ikke rekord og «sist»");
  await t.bilde("hjem-rekord");

  // ----- Picture mode -----
  await t.klikk('[data-h="oppsett"]');
  await t.klikk('.flis[data-h="modus"][data-v="bilde"]');
  t.sjekk(await t.finnes('.bryter[data-h="tallpa"]'), "Bildemodus har ikke valget for små tall");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.sk-bit svg.sk-bilde').length === 8");
  await pause();
  sp = (await S()).spill;
  t.sjekk(sp.modus === "bilde" && sp.bilde && (await t.antall(".sk-lite")) === 8, "Bildemodus viser ikke bildebiter med små tall");
  await t.bilde("bilde");
  await los();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(500);
  t.sjekk((await t.finnes(".sk-fasit svg")) && (!t.norsk || /Det var /.test(await t.tekst(".banner"))), "Sluttskjermen sier ikke hvem bildet var");
  await t.bilde("bilde-slutt", true);
  await t.klikk("#tilbake");

  // ----- Fit: 5 × 5 -----
  await t.klikk('[data-h="oppsett"]');
  await t.klikk('.flis[data-h="modus"][data-v="tall"]');
  await t.klikk('.flis[data-h="storrelse"][data-v="5"]');
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.sk-bit').length === 24");
  await t.sov(500);
  const m = await t.js(`(() => {
    const b = document.querySelector(".sk-brett").getBoundingClientRect();
    const d = document.querySelector(".sk-spill .dokk").getBoundingClientRect();
    const r = (x) => ({ top: x.top, bottom: x.bottom, left: x.left, right: x.right });
    return { side: document.documentElement.scrollHeight - innerHeight, b: r(b), d: r(d), bit: document.querySelector(".sk-bit").getBoundingClientRect().width, w: innerWidth, h: innerHeight };
  })()`);
  t.sjekk(m.side <= 1, `${m.w}×${m.h}: spillskjermen kan scrolles`);
  t.sjekk(m.bit >= 40, `${m.w}×${m.h}: bitene er for små (${Math.round(m.bit)} px)`);
  t.sjekk(m.b.bottom <= m.h && m.d.bottom <= m.h && m.b.right <= m.w && m.b.left >= 0, `${m.w}×${m.h}: brettet eller knappene går utenfor skjermen`);
  if (m.w > m.h) t.sjekk(m.b.right <= m.d.left, `${m.w}×${m.h}: knappene står ikke til høyre for brettet`);
  else t.sjekk(m.b.bottom <= m.d.top + 1, `${m.w}×${m.h}: knappene står ikke under brettet`);
  await t.bilde("stor");
}
