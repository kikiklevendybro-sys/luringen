// What the kit promises every game, for keyboards, screen readers and switches: the dock never hides
// focus, sheets are modal and give focus back, focus survives redraws, toasts are read out and stay
// longer for longer text, a failed save is said once, and an exception offers «Start spillet på nytt».
// Run from test/spill/pekefingeren.e2e.mjs on its set-up screen (that game uses only the kit's parts).
export default async function kitTilgjengelighet(t) {
  await t.send("Emulation.setFocusEmulationEnabled", { enabled: true }); // a headless page has no focus
  const fokusPa = (h, v) => t.js(`!!document.activeElement && document.activeElement.dataset.h === ${JSON.stringify(h)} && document.activeElement.dataset.v === ${JSON.stringify(v)}`);

  // The dock never hides the control that has focus: every stop on the screen, focused in turn.
  const dokk = await t.js(`(() => {
    const d = document.querySelector("#skjerm .dokk");
    const stopp = Array.from(document.querySelectorAll("#skjerm button, #skjerm input, #skjerm a[href]")).filter((e) => !e.disabled && !d.contains(e) && e.getClientRects().length);
    const bak = [];
    for (const e of stopp) {
      e.focus();
      const a = e.getBoundingClientRect();
      const r = d.getBoundingClientRect();
      if (a.left < r.right - 1 && a.right > r.left + 1 && a.top < r.bottom - 1 && a.bottom > r.top + 1) bak.push(e.getAttribute("aria-label") || e.textContent.trim().slice(0, 20));
    }
    document.activeElement.blur();
    window.scrollTo(0, 0);
    return { antall: stopp.length, bak };
  })()`);
  t.sjekk(dokk.antall > 5 && dokk.bak.length === 0, `${dokk.bak.length} av ${dokk.antall} kontroller havner bak knappen nederst når de får fokus: ${dokk.bak.slice(0, 4).join(", ")}`);

  // A sheet: the page behind it is out of reach, and focus comes back to the button that opened it.
  await t.js(`document.querySelector("#reglerknapp").focus()`);
  await t.klikk("#reglerknapp");
  t.sjekk(await t.js(`document.querySelector(".app").inert === true && document.querySelector("#ark-innhold").contains(document.activeElement)`), "Arket: siden bak kan fortsatt nås, eller fokus ble ikke flyttet inn i arket");
  await t.klikk('#ark [data-h="lukk-ark"]');
  t.sjekk(await t.js(`document.querySelector(".app").inert === false && document.activeElement === document.querySelector("#reglerknapp")`), "Etter arket: siden er fortsatt sperret, eller fokus kom ikke tilbake til «?»");

  // Focus survives a redraw: on the same control when it is still there …
  await t.js(`document.querySelector('[data-h="pakke"][data-v="kaos"]').focus()`);
  await t.klikk('[data-h="pakke"][data-v="kaos"]');
  t.sjekk(await fokusPa("pakke", "kaos"), "Fokus forsvant fra pakken som ble slått av/på");
  // … and when that control is gone, on one of its kind — never on <body>.
  const siste = (await t.antall('[data-h="spiller-fjern"]')) - 1;
  await t.js(`document.querySelector('[data-h="spiller-fjern"][data-v="${siste}"]').focus()`);
  await t.klikk(`[data-h="spiller-fjern"][data-v="${siste}"]`);
  t.sjekk(await t.js(`document.querySelector("#skjerm").contains(document.activeElement)`), "Fokus falt ut av skjermen da den siste spilleren ble fjernet");

  // A toast stays longer the more it says, and is read out through the kit's one live region.
  t.sjekk(await t.js(`Rusj._toastTid("Kopiert!") === 2200 && Rusj._toastTid("x".repeat(60)) === 5700 && Rusj._toastTid("x".repeat(400)) === 8000`), "Toasten varer ikke lenger for lengre tekst");
  await t.js(`Rusj.toast("Prøvemelding fra testen")`);
  t.sjekk(await t.js(`/Prøvemelding fra testen/.test(document.querySelector("#si").textContent) && document.querySelector("#toast").getAttribute("aria-live") === "off"`), "En toast leses ikke opp gjennom #si (eller leses to ganger)");
  await t.js(`Rusj.skjulToast()`);

  // A browser that will not save: said once, calmly, and the game goes on.
  const toast = () => t.js(`document.querySelector("#toast.vis") ? document.querySelector("#toast").textContent : ""`);
  await t.js(`(() => { window.__ekteSett = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); }; })()`);
  await t.klikk('[data-h="pakke"][data-v="kaos"]');
  t.sjekk(/lar oss ikke lagre/.test(await toast()), `Et lagringsforsøk som feiler, sier ingenting (toast: «${await toast()}»)`);
  await t.sov(2700);
  await t.js(`Rusj.skjulToast()`);
  await t.js(`document.querySelector('[data-h="pakke"][data-v="kaos"]').focus()`);
  await t.klikk('[data-h="pakke"][data-v="kaos"]');
  t.sjekk((await toast()) === "", "Beskjeden om lagring kom en gang til");
  t.sjekk(await fokusPa("pakke", "kaos"), "Spillet virket ikke videre uten lagring");
  await t.js(`Storage.prototype.setItem = window.__ekteSett`);

  // Last resort: an exception in the game gives a calm sheet with a way on and a way out — once
  // for each thing the player tries. (The event is made by hand: a real exception fails the test run.)
  const feil = () => t.js(`window.dispatchEvent(new ErrorEvent("error", { error: new Error("prøve"), message: "prøve", filename: location.origin + "/pekefingeren/spill.js" }))`);
  await feil();
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="start-pa-nytt"]'), "En feil i spillet gir ikke tilbud om å starte på nytt");
  await t.bilde("noe-gikk-galt");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await feil();
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "Feilarket kom en gang til uten at spilleren prøvde noe nytt");
  await t.klikk('[data-h="pakke"][data-v="kaos"]');
  await feil();
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="start-pa-nytt"]'), "Feilarket kom ikke igjen da neste forsøk også feilet");
  await t.klikk('#ark [data-h="start-pa-nytt"]', 400);
  await t.vent("document.querySelector('.spillhjem h1') && !document.querySelector('#ark:not([hidden])')", 8000);
  const ny = await t.tilstand();
  t.sjekk(ny && !ny.spill && ny.skjerm === "hjem", "«Start spillet på nytt» ga ikke et friskt spill på hjem-skjermen");
  t.sjekk((await t.js(`JSON.parse(localStorage.getItem("rusj.felles")).navn.length`)) >= 3, "«Start spillet på nytt» glemte navnene");
}
