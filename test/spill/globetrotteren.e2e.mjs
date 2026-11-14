// Globetrotteren («Which country?»): «Dagens land» from the date – suggestions while typing, a
// wrong guess with distance, an arrow and nearness, the hint (continent), progress to the front
// page, a reload, the answer typed in full and sent with Enter, the result with streak, the
// distribution and a live countdown, a share without the answer, and #dagens. Free play with flags:
// six wrong guesses, the answer shown, the counts on home and «Neste land».
// Runs in every edition: texts are checked in Norwegian only (t.norsk).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/globetrotteren/spill.js"), "utf8"), kontekst);
const M = kontekst.window.Globetrotteren;

export default async function (t) {
  const pause = () => t.sov(420);
  const S = () => t.tilstand();
  const navn = (id) => t.js(`(window.RUSJ_DATA.land.land[${JSON.stringify(id)}] || [])[0]`);
  async function enter() {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await t.sov(250);
  }

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const dag = await t.js("Rusj.dag()");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .gt-dagknapp'), "Dagens land er ikke hovedknappen på hjemskjermen");
  await t.bilde("hjem");

  // ----- Dagens land -----
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelector('.gt-omriss path')");
  await pause();
  let r = (await S()).dag;
  const svar = M.dagens(dag.nr);
  t.sjekk(r && r.id === svar && r.dagens === dag.tekst, "Dagens land kommer ikke fra datoen");
  t.sjekk((await t.antall(".gt-rad.tom")) === 6, "Brettet har ikke seks tomme rader");
  await t.bilde("dagens");

  // A wrong guess through the suggestions (a country far away).
  const feil = svar === "NZL" ? "ISL" : "NZL";
  const feilNavn = await navn(feil);
  await t.skrivInn("#gt-felt", feilNavn.slice(0, 3));
  await t.vent("document.querySelectorAll('.gt-forslag').length > 0");
  t.sjekk(await t.finnes(`.gt-forslag[data-v="${feil}"]`), `Forslagene viser ikke ${feilNavn}`);
  await t.bilde("forslag");
  await t.klikk(`.gt-forslag[data-v="${feil}"]`);
  r = (await S()).dag;
  t.sjekk(r.gjett.length === 1 && r.gjett[0] === feil, "Gjettet ble ikke lagret");
  const rad = await t.tekst(".gt-rad:not(.tom)");
  t.sjekk(new RegExp(t.sprak === "en" ? "\\d mi" : "\\d km").test(rad) && /\d\s?%/.test(rad) && (await t.finnes(".gt-rad .gt-pil")), `Raden viser ikke avstand, prosent og pil («${rad}»)`);
  const vinkel = await t.js("document.querySelector('.gt-rad .gt-pil').style.transform");
  t.sjekk(new RegExp(`rotate\\(${Math.round(M.retning(feil, svar))}deg\\)`).test(vinkel), `Pila peker feil vei (${vinkel})`);
  // The hint.
  await t.klikk('.gt-verktoy [data-h="hint"]');
  t.sjekk((await S()).dag.hint && (await t.finnes(".gt-hint")), "Hintet viser ikke verdensdelen");
  await t.bilde("gjett");
  let felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").globetrotteren`);
  t.sjekk(felles && felles.pagar && felles.pagar.nr === dag.nr && felles.pagar.tekst === "1/6", `Forsiden får ikke vite at dagens land er i gang (${JSON.stringify(felles)})`);
  // A name that is no country.
  await t.skrivInn("#gt-felt", "Xyzzyland");
  await enter();
  t.sjekk((await S()).dag.gjett.length === 1, "Et ukjent navn ble godtatt");

  // Reload: the guesses stay.
  await t.lastSide(t.side + "#dagens", "document.querySelector('.gt-omriss')");
  await pause();
  t.sjekk((await t.antall(".gt-rad:not(.tom)")) === 1, "Gjettet ble borte etter omlasting");

  // The answer, typed in full and sent with Enter.
  await t.skrivInn("#gt-felt", await navn(svar));
  await t.js("document.querySelector('#gt-felt').focus()");
  await enter();
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(600);
  let alt = await S();
  const res = alt.daglig.dager[dag.tekst];
  t.sjekk(res && res.vunnet && res.n === 2 && alt.daglig.rekke === 1, `Dagens land ble ikke lagret som funnet (${JSON.stringify(res)})`);
  felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").globetrotteren`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.res === "2/6", `Forsiden får ikke resultatet (${JSON.stringify(felles)})`);
  t.sjekk((await t.finnes(".gt-svar .gt-omriss")) && (await t.finnes(".gt-svar .gt-flagg")) && (await t.antall(".gt-fordeling li")) === 6, "Resultatet viser ikke landet, flagget og fordelingen");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".gt-nedtelling b")), "Resultatet mangler nedtelling");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""} ${delt.url || ""}` : "";
  t.sjekk(/2\/6/.test(delTekst) && /🟩/.test(delTekst) && delTekst.includes("#utfordring"), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  const allenavn = await t.js(`window.RUSJ_DATA.land.land[${JSON.stringify(svar)}]`);
  t.sjekk(!allenavn.some((n) => delTekst.toLowerCase().includes(n.toLowerCase())) && !delTekst.includes(feilNavn), "Delingen avslører et land");
  await t.bilde("dagens-resultat", true);
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  await pause();
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Dagens land: 2\/6/ : /2\/6/).test(await t.tekst(".gt-daglinje")) && (await t.finnes(".gt-nedtelling b")), "Hjemskjermen viser ikke at dagens land er funnet");
  await t.bilde("hjem-ferdig");

  // ----- Free play with flags: six wrong guesses -----
  await t.klikk('[data-h="oppsett"]');
  await t.klikk('.flis[data-h="modus"][data-v="flagg"]');
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelector('.gt-flagg')");
  await pause();
  r = (await S()).fri;
  t.sjekk(r && r.modus === "flagg" && M.FLAGG[r.id], "Fritt spill med flagg startet ikke");
  await t.bilde("flagg");
  const andre = M.IDER.filter((id) => id !== r.id).slice(0, 6);
  for (const id of andre) {
    if (await t.finnes(".skjerm-slutt")) break;
    await t.skrivInn("#gt-felt", await navn(id));
    await t.js("document.querySelector('#gt-felt').focus()");
    await enter();
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(500);
  alt = await S();
  t.sjekk(alt.fri.ferdig && !alt.fri.vunnet && alt.stat.spilt === 1 && alt.stat.riktige === 0, "Seks feil ga ikke tap");
  t.sjekk(await t.finnes(".gt-svar b"), "Svaret vises ikke etter tap");
  await t.bilde("tapt", true);
  await t.klikk('.dokk [data-h="neste"]');
  await t.vent("document.querySelector('.gt-flagg')");
  t.sjekk((await S()).fri.gjett.length === 0, "«Neste land» startet ikke en ny runde");
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes(".gt-rekorder")) && (await t.finnes(".gt-sist")), "Hjemskjermen viser ikke tellingen og «sist»");
  await t.bilde("hjem-fritt");
}
