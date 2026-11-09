// Kortkongen (Kabal): setup → a dealt solvable game; draw and undo; on a known deal: a tap moves a
// card to the best place, undo restores the exact position, drag & drop with the mouse and with a
// finger (and a drop on a wrong column sends the cards back), a hint, reload and back + «Fortsett»;
// a nearly finished game finishes itself and wins (statistics, records); giving up counts as a
// loss; the board fits above the dock on 320 × 568 and 375 × 560.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = {};
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/kortkongen/spill.js"), "utf8"), kontekst);
const K = kontekst.KortkongenRegler;

// A deal (draw one) where the first column move is a tap on the top of column i that goes to column j,
// and there is another column it may not go to.
function finnDeal() {
  for (let fro = 1; fro < 5000; fro++) {
    const st = K.del(fro, 0, 1);
    for (let i = 0; i < 7; i++) {
      const fra = { fra: "b", i, p: st.skjult[i] };
      const t = K.besteMal(st, fra);
      if (!t || t.til !== "b") continue;
      const feil = [0, 1, 2, 3, 4, 5, 6].find((j) => j !== i && j !== t.j && !K.lovlig(st, { ...fra, til: "b", j }));
      if (feil != null && st.bord[i].length > 1) return { fro, st, i, t, feil };
    }
  }
  throw new Error("fant ingen passende kabal");
}

const tilstand = (spill, skjerm = "spill") => ({
  oppsett: { modus: spill.modus, losbar: true },
  stat: {},
  spill,
  skjerm,
  _tid: Date.now(),
});
const nyttSpill = (st, ekstra = {}) => ({
  fro: 1,
  variant: 0,
  modus: st.modus,
  losbar: true,
  kode: K.kode(st),
  start: K.kode(st),
  angre: [],
  trekk: 0,
  tid: 0,
  hint: 0,
  startet: false,
  ferdig: false,
  vunnet: false,
  talt: false,
  resultat: null,
  ...ekstra,
});

export default async function (t) {
  const pause = () => t.sov(420);
  const kode = async () => (await t.tilstand()).spill.kode;
  // The visible top of a card (cards lower in a column cover the rest of it).
  const punkt = (k, dy = 0.5) =>
    t.js(`(() => { const b = document.getElementById("kk-k${k}").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + Math.min(b.height * ${dy}, b.height - 4) }; })()`);
  const plassPunkt = (id) => t.js(`(() => { const b = document.getElementById("${id}").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  async function dra(fra, til, beroring) {
    const steg = 10;
    const p = (i) => ({ x: fra.x + ((til.x - fra.x) * i) / steg, y: fra.y + ((til.y - fra.y) * i) / steg });
    if (beroring) {
      await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fra.x, y: fra.y }] });
      for (let i = 1; i <= steg; i++) {
        await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p(i)] });
        await t.sov(16);
      }
      await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fra.x, y: fra.y });
      await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: fra.x, y: fra.y, button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i <= steg; i++) {
        await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...p(i), button: "left", buttons: 1 });
        await t.sov(16);
      }
      await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...til, button: "left", buttons: 0, clickCount: 1 });
    }
    await t.sov(500);
  }
  // Put a position in storage and open the game on it. (Via the front page: the game itself saves its
  // own state when the page is hidden, which would overwrite the injected one.)
  async function lastInn(S) {
    await t.lastSide(t.url + "/", "document.querySelector('.spillgrid')");
    await t.js(`localStorage.setItem("rusj.kortkongen.v1", ${JSON.stringify(JSON.stringify(S))})`);
    await t.lastSide(t.side, "document.querySelectorAll('.kk-kort').length === 52");
    await t.sov(400);
  }
  const brettOverDokk = () =>
    t.js(`(() => { const d = document.querySelector("#skjerm .dokk").getBoundingClientRect(); let maks = 0;
      for (const el of document.querySelectorAll(".kk-kort:not(.kk-av), .kk-plass")) maks = Math.max(maks, el.getBoundingClientRect().bottom);
      return maks <= d.top + 2; })()`);

  // 1. Setup: draw one, only solvable deals (default). The deal flies out.
  await t.start();
  t.sjekk(await t.finnes('.merker'), "Hjem-skjermen mangler merkene");
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall('.fliser [data-h="modus"]')) === 2, "Oppsettet skal ha to valg for antall kort");
  t.sjekk(await t.finnes('[data-h="losbar"][aria-pressed="true"]'), "«Bare løsbare kabaler» skal være på som standard");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 52");
  await t.sov(250);
  await t.bilde("deler-ut");
  await t.sov(1900);
  let s = await t.tilstand();
  t.sjekk(s.spill && s.spill.losbar && s.spill.modus === 1, "Spillet startet ikke med en løsbar kabal og ett kort");
  let st = K.fraKode(s.spill.kode);
  t.sjekk(st && st.bunke.length === 24 && st.bord.every((k, i) => k.length === i + 1), "Kabalen er ikke delt ut riktig");
  t.sjekk((await t.antall(".kk-kort.sk-opp")) === 7, "Sju kort skal ligge med bildet opp etter utdelingen");
  t.sjekk(await brettOverDokk(), "Kortene stikker inn under knappene nederst");
  t.sjekk(s._aktiv === true, "En kabal i gang skal regnes som pågående");
  await t.bilde("brett");

  // 2. Draw from the stock, then undo
  await t.klikk("#kk-bunke");
  s = await t.tilstand();
  st = K.fraKode(s.spill.kode);
  t.sjekk(st.avfall.length === 1 && st.bunke.length === 23 && s.spill.trekk === 1, "Et trykk på bunken trakk ikke ett kort");
  await t.sov(300);
  await t.bilde("trukket");
  await t.klikk('[data-h="angre"]');
  s = await t.tilstand();
  st = K.fraKode(s.spill.kode);
  t.sjekk(st.avfall.length === 0 && st.bunke.length === 24 && s.spill.trekk === 0, "«Angre» la ikke kortet tilbake i bunken");
  t.sjekk(await t.js('document.getElementById("kk-angre").disabled'), "«Angre» skal være grått når det ikke er noe å angre");

  // 3. A known deal: tap → best place; undo gives back exactly the same position
  const d = finnDeal();
  await lastInn(tilstand(nyttSpill(d.st)));
  const start = K.kode(d.st);
  const topp = d.st.bord[d.i][d.st.bord[d.i].length - 1];
  await t.klikk(`#kk-k${topp}`);
  const etterTrykk = K.kopi(d.st);
  K.utfor(etterTrykk, d.t);
  t.sjekk((await kode()) === K.kode(etterTrykk), "Et trykk flyttet ikke kortet til den beste plassen");
  t.sjekk((await t.tilstand()).spill.trekk === 1, "Trekket ble ikke talt");
  t.sjekk((await t.antall(".kk-kort.sk-opp")) === 8, "Kortet under ble ikke snudd");
  await t.sov(400);
  await t.bilde("etter-trykk");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await kode()) === start, "«Angre» ga ikke tilbake nøyaktig samme stilling");
  await t.sov(500);
  t.sjekk((await t.antall(".kk-kort.sk-opp")) === 7, "Det snudde kortet ble ikke snudd tilbake ved angring");

  // 4. Drag with the mouse to the same column; a drop on a wrong column sends the card back
  const mal = d.st.bord[d.t.j][d.st.bord[d.t.j].length - 1];
  const feilMal = d.st.bord[d.feil].length ? `kk-k${d.st.bord[d.feil][d.st.bord[d.feil].length - 1]}` : `kk-b${d.feil}`;
  await dra(await punkt(topp), d.st.bord[d.feil].length ? await punkt(d.st.bord[d.feil][d.st.bord[d.feil].length - 1]) : await plassPunkt(feilMal));
  t.sjekk((await kode()) === start, "Et kort sluppet på feil kolonne ble flyttet");
  t.sjekk((await t.tilstand()).spill.trekk === 0, "Et ugyldig slipp ble talt som trekk");
  const tilbake = await t.js(`document.getElementById("kk-k${topp}").style.transform`);
  t.sjekk(!/NaN/.test(tilbake), "Kortet fikk ingen gyldig plass etter et ugyldig slipp");
  await dra(await punkt(topp), await punkt(mal));
  t.sjekk((await kode()) === K.kode(etterTrykk), "Dra og slipp med mus flyttet ikke kortet");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await kode()) === start, "Angre etter dra og slipp virket ikke");
  await t.sov(400);

  // 5. Drag with a finger
  await dra(await punkt(topp), await punkt(mal), true);
  t.sjekk((await kode()) === K.kode(etterTrykk), "Dra og slipp med fingeren flyttet ikke kortet");
  await t.sov(300);

  // 6. Hint shows a move; real taps on the stock work
  await t.klikk('[data-h="hint"]');
  t.sjekk((await t.antall(".kk-hint")) >= 1, "«Hint» viste ikke noe trekk");
  await t.bilde("hint");
  await t.trykk("#kk-bunke");
  await t.sov(200);
  t.sjekk(K.fraKode(await kode()).avfall.length === 1, "Et ekte trykk på bunken trakk ikke");

  // 7. Reload keeps the game; back to home keeps it too
  const forOmlasting = await kode();
  await t.lastSide(t.side, "document.querySelectorAll('.kk-kort').length === 52");
  t.sjekk((await kode()) === forOmlasting, "Stillingen forsvant ved omlasting");
  t.sjekk((await t.tilstand()).spill.angre.length >= 2, "Angre-historikken forsvant ved omlasting");
  await t.klikk('[data-h="angre"]');
  t.sjekk(K.fraKode(await kode()).avfall.length === 0, "Angre etter omlasting virket ikke");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="fortsett"]'), "Mangler «Fortsett» på hjem-skjermen");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 52");
  await pause();

  // 8. «Ny kabal» → «Start denne på nytt» gives the same deal from the start
  await t.klikk('[data-h="ny"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Ny kabal» åpnet ikke valgene");
  await t.bilde("ny-kabal-ark");
  await t.klikk('#ark [data-h="ark-svar"][data-v="1"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 52");
  await t.sov(2200);
  s = await t.tilstand();
  t.sjekk(s.spill.kode === start && s.spill.trekk === 0, "«Start denne kabalen på nytt» ga ikke samme kabal");
  t.sjekk(s.stat[1] && s.stat[1].spilt === 1 && s.stat[1].vunnet === 0, "Den forlatte kabalen ble ikke talt som tapt");

  // 9. A nearly finished game: Q♠ on the waste, K♠ alone on the table. One tap, the rest goes home
  // by itself → victory.
  const nesten = { bunke: [], avfall: [11], vifte: 1, grunn: [11, 13, 13, 13], bord: [[12], [], [], [], [], [], []], skjult: [0, 0, 0, 0, 0, 0, 0], modus: 1 };
  t.sjekk(K.gyldig(nesten), "Teststillingen er ugyldig");
  await lastInn(tilstand(nyttSpill(nesten), "spill"));
  await t.klikk("#kk-k11");
  await t.vent("document.querySelector('.kk-kaskade')", 4000);
  await t.sov(1200);
  await t.bilde("seier-kaskade");
  await t.vent("document.querySelector('.skjerm-slutt')", 12000);
  await t.sov(800);
  await t.bilde("seier", true);
  t.sjekk(/gikk opp/.test(await t.tekst("#skjerm h1")), "Seieren vises ikke");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.stat[1] && s.stat[1].vunnet === 1 && s.stat[1].rekke === 1 && s.stat[1].besteTid > 0, "Seieren ble ikke lagret i statistikken");
  t.sjekk(s._aktiv === false, "En vunnet kabal skal ikke regnes som pågående");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet»");

  // 10. Statistics on the home screen
  await t.klikk("#tilbake");
  t.sjekk(/Vunnet 1 av 1/.test(await t.tekst(".kk-hjemstat")), "Statistikken vises ikke på hjem-skjermen");
  await t.klikk('[data-h="statistikk"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .kk-tabell"), "Statistikk-arket vises ikke");
  t.sjekk(/100 %/.test(await t.tekst("#ark .kk-tabell")), "Statistikken viser ikke vinnerandelen");
  await t.bilde("statistikk");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // 11. Three cards: a new deal; give up after a move → «Den var vrien!», counted as a loss
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="3"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 52");
  await t.sov(2200);
  await t.klikk("#kk-bunke");
  st = K.fraKode(await kode());
  t.sjekk(st.modus === 3 && st.avfall.length === 3, "Med tre kort skal bunken gi tre kort");
  await t.sov(400);
  await t.bilde("tre-kort");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(/tapt/.test(await t.tekst("#ark")), "«Avslutt» sier ikke at kabalen teller som tapt");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(/vrien/.test(await t.tekst("#skjerm h1")), "Et tap skal få varme ord, ikke seier");
  s = await t.tilstand();
  t.sjekk(s.stat[3] && s.stat[3].spilt === 1 && s.stat[3].vunnet === 0, "Tapet med tre kort ble ikke talt");
  await t.bilde("tap", true);

  // 11b. Out of moves: only black cards on top, nothing fits anywhere → a calm note, not a dead end
  const fastSt = { bunke: [], avfall: [], vifte: 0, grunn: [0, 0, 0, 0], bord: [[], [], [], [], [], [], []], skjult: [0, 0, 0, 0, 0, 0, 0], modus: 1 };
  const topper = [12, 10, 8, 6, 4, 2, 51]; // K♠ J♠ 9♠ 7♠ 5♠ 3♠ K♣
  const resten = Array.from({ length: 52 }, (_, k) => k).filter((k) => !topper.includes(k));
  topper.forEach((k, i) => {
    const skjulte = resten.splice(0, i === 6 ? resten.length : 6);
    fastSt.bord[i] = [...skjulte, k];
    fastSt.skjult[i] = skjulte.length;
  });
  t.sjekk(K.gyldig(fastSt) && K.fast(fastSt), "Teststillingen uten trekk er feil satt opp");
  await lastInn(tilstand(nyttSpill(fastSt, { startet: true, trekk: 40 })));
  await t.vent("document.querySelector('#kk-fast:not([hidden])')", 3000);
  t.sjekk(await t.finnes('#kk-fast [data-h="ny"]'), "Meldingen om at trekkene er brukt opp mangler «Ny kabal»");
  await t.bilde("tomt-for-trekk");

  // 12. Small phones: the whole table stays above the dock, nothing sticks out
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  const midt = K.del(d.fro, 0, 1);
  for (const [b, h, navn] of [[320, 568, "brett-320"], [Math.min(375, b0), 560, "brett-375x560"]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await lastInn(tilstand(nyttSpill(midt)));
    await t.sov(300);
    t.sjekk(await brettOverDokk(), `Kortene stikker inn under knappene på ${b} × ${h}`);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Brettet er for bredt på ${b} px`);
    await t.bilde(navn);
  }
  // A long column on the small phone still fits (squeezed): six face-down cards and K♠ Q♥ J♠ … A♠
  const rekke = [];
  for (let v = 13; v >= 1; v--) rekke.push(v % 2 ? v - 1 : 13 + v - 1);
  const skjulte = [26, 27, 28, 29, 30, 31];
  const lang = { bunke: [], avfall: [], vifte: 0, grunn: [0, 0, 0, 0], bord: [[...skjulte, ...rekke], [], [], [], [], [], []], skjult: [6, 0, 0, 0, 0, 0, 0], modus: 1 };
  for (let k = 0; k < 52; k++) if (!lang.bord[0].includes(k)) lang.bunke.push(k);
  if (K.gyldig(lang)) {
    await lastInn(tilstand(nyttSpill(lang)));
    t.sjekk(await brettOverDokk(), "En lang kolonne stikker inn under knappene på liten skjerm");
    await t.bilde("lang-kolonne-liten");
  } else t.feil("Teststillingen med lang kolonne er ugyldig");
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
}
