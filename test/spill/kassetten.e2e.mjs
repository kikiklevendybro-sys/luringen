// Kassetten with Chrome's fake microphone (a test tone): setup, the secret word and «Bytt ord»,
// recording (tap to start, tap to stop), the copy, the answer, the verdict with points to both,
// «Angre», reload (the sound is gone: the turn starts over with the same word), a refused
// microphone, the saved state holding no sound, ending early and «Kåringen».
// Runs in every edition (node test/rusj-e2e.mjs --sprak en kassetten).

const ORD = {
  nb: { vinner: (n) => `${n} vinner!`, kaaring: "kåringen", nektet: /ikke tillatt/ },
  en: { vinner: (n) => `${n} wins!`, kaaring: "the results", nektet: /wasn't allowed/ },
  da: { vinner: (n) => `${n} vinder!`, kaaring: "kåringen", nektet: /ikke tilladt/ },
};
const ordNa = `(() => { const d = window.RUSJ_DATA.kassett; const alle = d.ord.concat(d.setninger); return alle[Rusj.S.spill.na.q]; })()`;

async function taOpp(t, h) {
  await t.klikk(`[data-h="${h}"]`, 50);
  await t.vent(`document.querySelector('#ka-ta-opp.ka-pa')`, 5000);
  await t.sov(1300);
  await t.klikk(`[data-h="${h}"]`, 50);
}

export default async function (t) {
  const O = ORD[t.sprak];
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.bilde("hjem");
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  await t.klikk('[data-h="type"][data-v="ord"]');
  t.sjekk(await t.finnes('[data-h="type"][data-v="ord"][aria-pressed="true"]'), "«Ord» ble ikke valgt");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  await t.bilde("gi");
  let s = await t.tilstand();
  const a = (s.spill.start + 0) % 3;
  t.sjekk((await t.tekst("#skjerm h1")).includes(`Testspiller ${"ABC"[a]}`), "Gi-skjermen viser ikke fortelleren");

  // The secret word, «Bytt ord» and the recording
  await t.klikk('[data-h="se-ord"]');
  await t.vent("document.querySelector('.ka-ordkort')");
  const q1 = (await t.tilstand()).spill.na.q;
  const ord1 = await t.js(ordNa);
  t.sjekk((await t.tekst(".ka-ordkort h1")) === ord1, "Ordkortet viser ikke ordet");
  t.sjekk(!(await t.js(`window.RUSJ_DATA.kassett.setninger.includes(${JSON.stringify(ord1)})`)), "«Ord» ga en setning");
  await t.bilde("si");
  await t.klikk('[data-h="bytt-ord"]');
  t.sjekk((await t.tilstand()).spill.na.q !== q1, "«Bytt ord» ga ikke et nytt ord");
  const ord = await t.js(ordNa);
  await taOpp(t, "ta-a");
  await t.vent("document.querySelector('[data-h=\"til-hermer\"]')", 6000);
  await t.bilde("si-tatt-opp");
  await t.klikk('[data-h="til-hermer"]');
  await t.vent("document.querySelector('[data-h=\"ta-b\"]')");
  t.sjekk((await t.tekst("#skjerm h1")).includes(`Testspiller ${"ABC"[(a + 1) % 3]}`), "Hermeren er ikke neste spiller");
  t.sjekk(!(await t.tekst("#skjerm")).includes(ord), "Ordet vises for hermeren");
  await t.klikk('[data-h="hor-a-sakte"]');
  await t.bilde("herm");
  await taOpp(t, "ta-b");
  await t.vent("document.querySelector('[data-h=\"vis-ord\"]')", 6000);
  t.sjekk(!(await t.tekst("#skjerm")).includes(ord), "Ordet vises før «Vis ordet»");
  await t.bilde("fasit");
  await t.klikk('[data-h="vis-ord"]');
  t.sjekk((await t.tekst("#skjerm h1")) === ord, "«Vis ordet» viser ikke ordet");
  t.sjekk(await t.friForDokk(".ka-fasit"), "Fasiten skjules bak knappene");
  await t.bilde("fasit-vist");

  // The verdict: 2 points to both; «Angre» takes them back and the pair records again
  await t.klikk('[data-h="dom"][data-v="likt"]');
  await t.vent("document.querySelector('.ka-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[a] === 2 && s.spill.poeng[(a + 1) % 3] === 2 && s.spill.poeng[(a + 2) % 3] === 0, `Feil poeng: ${JSON.stringify(s.spill.poeng)}`);
  // The saved state is small and has no sound in it
  t.sjekk(!(await t.tekst(".poengliste")).includes("++"), "Poenglista viser «++»");
  t.sjekk(JSON.stringify(s).length < 4000, "Den lagrede tilstanden er mistenkelig stor");
  await t.sov(800);
  await t.bilde("poeng", true);
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('.gi-til')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.every((p) => p === 0) && s.spill.logg.length === 0 && (await t.js(ordNa)) === ord, "«Angre» tok ikke poengene tilbake, eller ordet ble byttet");

  // Reload in the middle of a turn: the sound is gone, so the turn starts over with the same word
  await t.klikk('[data-h="se-ord"]');
  await taOpp(t, "ta-a");
  await t.vent("document.querySelector('[data-h=\"til-hermer\"]')", 6000);
  await t.klikk('[data-h="til-hermer"]');
  await t.vent("document.querySelector('[data-h=\"ta-b\"]')");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gi" && (await t.js(ordNa)) === ord, `Omlasting ga ikke en ny start på turen: ${s.skjerm}`);

  // A refused microphone shows a clear message
  await t.klikk('[data-h="se-ord"]');
  await t.js(`navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("nei"), { name: "NotAllowedError" }))`);
  await t.klikk('[data-h="ta-a"]', 400);
  t.sjekk(O.nektet.test(await t.tekst(".ka-varsel")), "Ingen melding når mikrofonen ble nektet");
  await t.bilde("nektet");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");

  // One more turn, «Nesten»: 1 point each, then the next pair
  await t.klikk('[data-h="se-ord"]');
  await taOpp(t, "ta-a");
  await t.vent("document.querySelector('[data-h=\"til-hermer\"]')", 6000);
  await t.klikk('[data-h="til-hermer"]');
  await t.vent("document.querySelector('[data-h=\"ta-b\"]')");
  await taOpp(t, "ta-b");
  await t.vent("document.querySelector('[data-h=\"vis-ord\"]')", 6000);
  await t.klikk('[data-h="vis-ord"]');
  await t.klikk('[data-h="dom"][data-v="nesten"]');
  await t.vent("document.querySelector('.ka-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[a] === 1 && s.spill.poeng[(a + 1) % 3] === 1, `«Nesten» ga ikke 1 poeng hver: ${JSON.stringify(s.spill.poeng)}`);
  await t.klikk('[data-h="neste-tur"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk((await t.tekst("#skjerm h1")).includes(`Testspiller ${"ABC"[(a + 1) % 3]}`), "Fortelleren gikk ikke videre");

  // End early: the pair with points wins (shared)
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt .banner')");
  await t.sov(400);
  await t.bilde("slutt", true);
  const h1 = await t.tekst("#skjerm h1");
  t.sjekk(!h1.includes("|") && !(await t.tekst(".poengliste")).includes("++"), `Rå flertallstekst eller dobbelt pluss: ${h1}`);
  t.sjekk(h1.includes(`Testspiller ${"ABC"[a]}`) && h1.includes(`Testspiller ${"ABC"[(a + 1) % 3]}`), `Vinnerne vises ikke: ${h1}`);
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === O.kaaring, "Sluttskjermen heter ikke «Kåringen»");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "kassetten"), "Resultatet ble ikke lagt i «Kveldens gjeng»");
}
