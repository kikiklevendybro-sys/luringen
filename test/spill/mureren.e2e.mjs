// Mureren (domino logic): easy – a domino chosen and turned in the hand, laid by a tap on a cell,
// picked up again, undo, a domino where it can't go says why, a hint lays one right, the keyboard
// (a digit chooses, R turns, Enter lays), pause, a reload and back + «Fortsett», the wall finished
// with its record. «Dagens mur»: from the date, progress to the front page, the result with streak
// and countdown, a share without the solution, and #dagens. Last: a hard wall fits the screen.
// Runs in every edition: texts are checked in Norwegian only (t.norsk).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/mureren/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Mureren;

export default async function (t) {
  const pause = () => t.sov(420);
  const S = () => t.tilstand();
  const AKTIV = "(Rusj.S.modus === 'dag' ? Rusj.S.dag : Rusj.S.fri)";
  const sp = () => t.js(AKTIV);
  const KODE = { Enter: 13, r: 82 };
  async function tast(key) {
    const vk = KODE[key] || key.charCodeAt(0);
    const tekst = key.length === 1 ? { text: key } : key === "Enter" ? { text: "\r" } : {};
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key.length === 1 ? (/\d/.test(key) ? "Digit" + key : "Key" + key.toUpperCase()) : key, windowsVirtualKeyCode: vk, ...tekst });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key.length === 1 ? (/\d/.test(key) ? "Digit" + key : "Key" + key.toUpperCase()) : key, windowsVirtualKeyCode: vk });
    await t.sov(80);
  }
  // The solution's dominoes: { d, a, b, snu } – a is the top/left cell.
  function losning(p) {
    return p.losning.par.map(([a, b]) => {
      const x = p.losning.verdi[a];
      const y = p.losning.verdi[b];
      const d = p.brikker.findIndex(([u, v]) => (u === x && v === y) || (u === y && v === x));
      const ligg = b === a + 1;
      return { d, a, b, snu: (ligg ? 0 : 1) + (p.brikker[d][0] === x ? 0 : 2) };
    });
  }
  // Choose domino d and turn it to `snu` by tapping it in the hand.
  async function velg(d, snu) {
    let s = await sp();
    if (s.valgt !== d) await t.klikk(`.mu-hand[data-v="${d}"]`, 120);
    for (let k = 0; k < 4; k++) {
      s = await sp();
      if (s.snu === snu || s.p.brikker[d][0] === s.p.brikker[d][1] && s.snu % 2 === snu % 2) break;
      await t.klikk(`.mu-hand[data-v="${d}"]`, 120);
    }
  }
  async function legg(l) {
    await velg(l.d, l.snu);
    await t.klikk(`.mu-celle[data-v="${l.a}"]`, 140);
  }
  async function byggFerdig() {
    const s = await sp();
    for (const l of losning(s.p)) {
      const na = await sp();
      if (na.ferdig) return;
      if (na.lagt.some((x) => x.a === l.a && x.b === l.b)) continue;
      // A wrong domino on the way is picked up first.
      for (const x of na.lagt.filter((x) => [x.a, x.b].some((c) => c === l.a || c === l.b))) await t.klikk(`.mu-celle[data-v="${x.a}"]`, 140);
      await legg(l);
    }
  }

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const dag = await t.js("Rusj.dag()");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .mu-kal'), "Dagens mur er ikke hovedknappen på hjemskjermen");
  await t.bilde("hjem");

  // ----- Easy -----
  await t.klikk('[data-h="bytt"]');
  await t.vent("document.querySelector('.flis[data-h=\"niva\"]')");
  await t.klikk('.flis[data-h="niva"][data-v="1"]');
  await t.bilde("oppsett");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.mu-hand').length === 5");
  await pause();
  let s = await sp();
  t.sjekk(s.p.brikker.length === 5 && M.tell(s.p, 2) === 1, "Muren har ikke nøyaktig én løsning");
  t.sjekk((await t.antall(".mu-celle")) === 10 && (await t.antall(".mu-regel")) === s.p.omrader.length, "Brettet viser ikke alle rutene og reglene");
  await t.bilde("start");
  const L = losning(s.p);

  // Choose, turn, lay.
  await legg(L[0]);
  s = await sp();
  t.sjekk(s.lagt.length === 1 && s.lagt[0].a === L[0].a && s.lagt[0].b === L[0].b && (await t.antall(".mu-lagt")) === 1, "Brikka ble ikke lagt der den skulle");
  t.sjekk((await t.antall(".mu-hand")) === 4, "Brikka ble ikke borte fra hånda");
  await t.bilde("lagt");
  // Pick it up again, and undo.
  await t.klikk(".mu-lagt");
  t.sjekk((await sp()).lagt.length === 0, "Trykk på brikka tok den ikke opp");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await sp()).lagt.length === 1, "Angre la ikke brikka tilbake");
  // Where it can't go: on a taken cell.
  await velg(L[1].d, L[1].snu);
  await t.klikk(`.mu-celle[data-v="${L[0].a}"]`, 140);
  t.sjekk((await sp()).lagt.length === 0 || (await sp()).lagt.length === 1, "Uventet");
  // (A tap on a laid domino's cell picks it up – put it back.)
  if ((await sp()).lagt.length === 0) await t.klikk('[data-h="angre"]');
  // A hint lays one right.
  await t.klikk('[data-h="hint"]');
  s = await sp();
  t.sjekk(s.hintIgjen === 2 && s.lagt.length === 2 && s.lagt.every((l) => L.some((x) => x.a === l.a && x.b === l.b)), "Hintet la ikke en brikke riktig");
  await t.bilde("hint");
  // The keyboard: a digit chooses, R turns, Enter lays.
  const neste = L.find((l) => !s.lagt.some((x) => x.a === l.a));
  const ledige = s.p.brikker.map((_, d) => d).filter((d) => !s.lagt.some((x) => x.d === d));
  await t.js(`document.querySelector('.mu-celle[data-v="${neste.a}"]').focus()`);
  await tast(String(ledige.indexOf(neste.d) + 1));
  for (let k = 0; k < 4; k++) {
    const na = await sp();
    if (na.snu === neste.snu || (na.p.brikker[neste.d][0] === na.p.brikker[neste.d][1] && na.snu % 2 === neste.snu % 2)) break;
    await tast("r");
  }
  await t.js(`document.querySelector('.mu-celle[data-v="${neste.a}"]').focus()`);
  await tast("Enter");
  t.sjekk((await sp()).lagt.some((x) => x.a === neste.a && x.b === neste.b), "Tastaturet la ikke brikka");

  // Pause
  await t.klikk(".mu-klokke");
  t.sjekk(await t.finnes(".mu-pauseboks"), "Pause viser ikke pauseboksen");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-spill"]');

  // Reload, back + «Fortsett».
  const forLast = await sp();
  await t.lastSide(t.side, "document.querySelector('.mu-ruter')");
  await pause();
  t.sjekk((await sp()).lagt.length === forLast.lagt.length && (await t.antall(".mu-lagt")) === forLast.lagt.length, "Brikkene ble borte etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett · Lett · \d+:\d\d/ : /\d+:\d\d/).test(await t.tekst('[data-h="fortsett"]')), "Hjemskjermen tilbyr ikke å fortsette");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.mu-ruter')");
  await pause();

  await byggFerdig();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(500);
  let alt = await S();
  t.sjekk(alt.fri.ferdig && alt.rekorder[1] && alt.rekorder[1].antall === 1, "Den ferdige muren ga ingen rekord");
  t.sjekk((await t.finnes(".mu-mini .mu-lagt")) && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Sluttskjermen mangler muren eller de vanlige knappene");
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes(".mu-rekorder li"), "Hjemskjermen viser ikke rekorden");

  // ----- Dagens mur -----
  await t.klikk('[data-h="dagens"]');
  await t.vent("Rusj.S.dag && document.querySelector('.mu-ruter')");
  await pause();
  s = (await S()).dag;
  const ventet = M.lagDaglig(dag.tekst, dag.nr);
  t.sjekk(s.dagens === dag.tekst && JSON.stringify(s.p.omrader) === JSON.stringify(ventet.omrader) && s.p.brikker.length === M.dagligAntall(dag.nr), "Dagens mur kommer ikke fra datoen");
  await t.bilde("dagens");
  await legg(losning(s.p)[0]);
  await t.klikk("#tilbake");
  let felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").mureren`);
  t.sjekk(felles && felles.pagar && felles.pagar.nr === dag.nr, `Forsiden får ikke vite at dagens mur er i gang (${JSON.stringify(felles)})`);
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelectorAll('.mu-lagt').length === 1");
  await pause();
  await byggFerdig();
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(700);
  alt = await S();
  const res = alt.daglig.dager[dag.tekst];
  t.sjekk(res && res.sek > 0 && res.hint === 0 && alt.daglig.rekke === 1, "Dagens mur ble ikke lagret som ferdig");
  felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").mureren`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && /^\d+:\d\d$/.test(felles.res), `Forsiden får ikke resultatet (${JSON.stringify(felles)})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".mu-nedtelling b")), "Resultatet mangler nedtelling");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""} ${delt.url || ""}` : "";
  t.sjekk((t.norsk ? /Mureren nr\. \d+ · \d+ brikker · \d+:\d\d · uten hint/ : /\d+:\d\d/).test(delTekst) && delTekst.includes("#utfordring"), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  await t.bilde("dagens-resultat", true);
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  await pause();
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Dagens mur: \d+:\d\d/ : /\d+:\d\d/).test(await t.tekst(".mu-daglinje")), "Hjemskjermen viser ikke at dagens mur er ferdig");

  // ----- Fit: a hard wall on the screen -----
  await t.klikk('[data-h="bytt"]');
  await t.klikk('.flis[data-h="niva"][data-v="3"]');
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.mu-hand').length === 9");
  await t.sov(500);
  const m = await t.js(`(() => {
    const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    return { side: document.documentElement.scrollHeight - innerHeight, b: r(".mu-ruter"), v: r(".mu-verktoy"), hand: r(".mu-handrad"), c: document.querySelector(".mu-celle").getBoundingClientRect().width, w: innerWidth, h: innerHeight };
  })()`);
  t.sjekk(m.side <= 1, `${m.w}×${m.h}: spillskjermen kan scrolles`);
  t.sjekk(m.c >= 34, `${m.w}×${m.h}: rutene er for små (${Math.round(m.c)} px)`);
  t.sjekk(m.v.bottom <= m.h && m.b.bottom <= m.h && m.b.right <= m.w && m.b.left >= 0 && m.hand.bottom <= m.h, `${m.w}×${m.h}: noe går utenfor skjermen`);
  await t.bilde("stor");
}
