// Kortkongen (Kabal): «Bytt oppsett» → a dealt solvable game; draw and undo; on a known deal: a tap
// moves a card to the best place, undo restores the exact position, drag & drop with the mouse and
// with a finger (and a drop on a wrong column sends the cards back), a hint, reload and back +
// «Fortsett»; a nearly finished game finishes itself and wins (statistics, records); giving up counts
// as a loss. «Dagens kabal»: the day's fixed deal in its own slot beside free play, the result with
// countdown, days in a row and a text to share, rusj.daglig and #dagens. The live «Kan gå opp» /
// «Låst» chip and «Spol tilbake»; a tap chooses between two places; the keyboard order follows the
// table; «Ny kabal» from home deals at once; the board fits on 320 × 568, 375 × 560 and on its side.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en kortkongen): the texts are checked in
// Norwegian only (t.norsk); elsewhere the numbers, the state, the storage keys and the links.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = {};
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/kortkongen/spill.js"), "utf8"), kontekst);
const K = kontekst.KortkongenRegler;
const LOSBARE = JSON.parse(readFileSync(join(ROT, "rusj/spill/kortkongen/data/losbare.json"), "utf8"));

// Every legal move of a position.
function alleTrekk(st) {
  const ut = [];
  if (st.bunke.length || st.avfall.length) ut.push({ fra: "s" });
  const kilder = st.avfall.length ? [{ fra: "a" }] : [];
  for (let i = 0; i < 7; i++) for (let p = st.skjult[i]; p < st.bord[i].length; p++) kilder.push({ fra: "b", i, p });
  for (const f of kilder) {
    for (const til of ["g", "b"]) {
      for (let j = 0; j < (til === "g" ? 4 : 7); j++) {
        const m = { ...f, til, j };
        if (K.lovlig(st, m)) ut.push(m);
      }
    }
  }
  return ut;
}

// A trap: a position on the way through a solvable deal («for»), and a card move from it that the
// full search proves fatal («etter»). «historie» holds the undo steps that lead to «for».
function finnFelle() {
  for (const fro of LOSBARE.tre.slice(0, 80)) {
    const st = K.del(fro, 0, 1);
    const historie = [];
    for (let steg = 0; steg < 45; steg++) {
      const vei = K.los(st, 20000);
      if (!vei.trekk || !vei.trekk.length) break;
      for (const m of alleTrekk(st)) {
        if (m.fra === "s") continue;
        const etter = K.kopi(st);
        K.utfor(etter, m);
        if (K.vunnet(etter) || K.los(etter, 20000).trekk) continue;
        if (K.los(etter, 150000, { full: true }).uttomt) return { fro, for: K.kopi(st), m, etter, historie };
      }
      const neste = K.forsteSteg(st, vei.trekk[0]);
      if (!neste || !K.lovlig(st, neste)) break;
      historie.push(K.kode(st) + "|" + steg);
      K.utfor(st, neste);
    }
  }
  throw new Error("fant ingen felle");
}

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
    await t.js(`localStorage.setItem("${t.nokkel("kortkongen.v1")}", ${JSON.stringify(JSON.stringify(S))})`);
    await t.lastSide(t.side, "document.querySelectorAll('.kk-kort').length === 52");
    await t.sov(400);
  }
  // Every card and place is clear of the toolbar: above it, or (a phone on its side) beside it and
  // inside the screen.
  const brettOverDokk = () =>
    t.js(`(() => { const d = document.querySelector("#skjerm .dokk").getBoundingClientRect();
      for (const el of document.querySelectorAll(".kk-kort:not(.kk-av), .kk-plass")) {
        const b = el.getBoundingClientRect();
        const ved = b.right <= d.left + 1 || b.left >= d.right - 1;
        if (ved ? b.bottom > window.innerHeight + 1 : b.bottom > d.top + 2) return false;
      }
      return true; })()`);
  const toast = () => t.js(`(document.querySelector("#toast") || { textContent: "" }).textContent`);
  const brettKlart = "document.querySelectorAll('.kk-kort').length === 52";

  // 1. Home: «Dagens kabal» is the main button. «Bytt oppsett»: draw one, only solvable deals
  // (default) → «Start». The deal flies out.
  await t.start();
  t.sjekk(await t.finnes('.merker'), "Hjem-skjermen mangler merkene");
  t.sjekk(!t.norsk || /^Dagens kabal$/.test((await t.tekst(".hjem-knapper .knapp")).trim()), "«Dagens kabal» skal være hovedknappen på hjem-skjermen");
  t.sjekk(!t.norsk || /Ny kabal · ett kort/.test(await t.tekst('.hjem-knapper [data-h="nytt"]')), "Hjem mangler «Ny kabal · ett kort»");
  await t.klikk('.hjem-knapper [data-h="endre"]');
  t.sjekk((await t.antall('.fliser [data-h="modus"]')) === 2, "Oppsettet skal ha to valg for antall kort");
  t.sjekk(await t.finnes('[data-h="losbar"][aria-pressed="true"]'), "«Bare løsbare kabaler» skal være på som standard");
  await t.bilde("oppsett", true);
  await t.klikk('.dokk [data-h="nytt"]');
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
  await t.vent("document.querySelector('#kk-status .kk-losbar')", 3000);
  t.sjekk(!t.norsk || /Kan gå opp/.test(await t.tekst("#kk-status")), "En løsbar kabal skal starte med «Kan gå opp»");
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
  await t.vent("document.querySelector('.kk-hint')", 5000);
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
  t.sjekk(!t.norsk || /gikk opp/.test(await t.tekst("#skjerm h1")), "Seieren vises ikke");
  t.sjekk(!t.norsk || /KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  s = await t.tilstand();
  t.sjekk(s.stat[1] && s.stat[1].vunnet === 1 && s.stat[1].rekke === 1 && s.stat[1].besteTid > 0, "Seieren ble ikke lagret i statistikken");
  t.sjekk(s._aktiv === false, "En vunnet kabal skal ikke regnes som pågående");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Sluttskjermen mangler «Alle spill»");
  // (An edition built with this game alone has no other games to suggest.)
  t.sjekk((await t.finnes(".flere-spill")) || !(await t.js("(window.RUSJ_ANDRE || []).length")), "Sluttskjermen mangler «Spill noe annet»");

  // 10. Statistics on the home screen
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Vunnet 1 av 1/ : /1\D+1/).test(await t.tekst(".kk-hjemstat")), "Statistikken vises ikke på hjem-skjermen");
  await t.klikk('[data-h="statistikk"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .kk-tabell"), "Statistikk-arket vises ikke");
  t.sjekk(/100 %/.test(await t.tekst("#ark .kk-tabell")), "Statistikken viser ikke vinnerandelen");
  await t.bilde("statistikk");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // 11. Three cards: a new deal; give up after a move → «Den var vrien!», counted as a loss
  await t.klikk('.hjem-knapper [data-h="endre"]');
  await t.klikk('[data-h="modus"][data-v="3"]');
  await t.klikk('.dokk [data-h="nytt"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 52");
  await t.sov(2200);
  await t.klikk("#kk-bunke");
  st = K.fraKode(await kode());
  t.sjekk(st.modus === 3 && st.avfall.length === 3, "Med tre kort skal bunken gi tre kort");
  await t.sov(400);
  await t.bilde("tre-kort");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk((t.norsk ? /tapt/ : /\S/).test(await t.tekst("#ark")), "«Avslutt» sier ikke at kabalen teller som tapt");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(!t.norsk || /vrien/.test(await t.tekst("#skjerm h1")), "Et tap skal få varme ord, ikke seier");
  s = await t.tilstand();
  t.sjekk(s.stat[3] && s.stat[3].spilt === 1 && s.stat[3].vunnet === 0, "Tapet med tre kort ble ikke talt");
  await t.bilde("tap", true);

  // 11b. Out of moves: only black cards on top, nothing fits anywhere → the search proves it, and a
  // calm note says so (there is nothing to go back to: «Spol tilbake» is not offered)
  const fastSt = { bunke: [], avfall: [], vifte: 0, grunn: [0, 0, 0, 0], bord: [[], [], [], [], [], [], []], skjult: [0, 0, 0, 0, 0, 0, 0], modus: 1 };
  const topper = [12, 10, 8, 6, 4, 2, 51]; // K♠ J♠ 9♠ 7♠ 5♠ 3♠ K♣
  const resten = Array.from({ length: 52 }, (_, k) => k).filter((k) => !topper.includes(k));
  topper.forEach((k, i) => {
    const skjulte = resten.splice(0, i === 6 ? resten.length : 6);
    fastSt.bord[i] = [...skjulte, k];
    fastSt.skjult[i] = skjulte.length;
  });
  t.sjekk(K.gyldig(fastSt) && K.fast(fastSt), "Teststillingen uten trekk er feil satt opp");
  await lastInn(tilstand(nyttSpill(fastSt, { startet: true, trekk: 40, losbar: false })));
  await t.vent("document.querySelector('#kk-fast:not([hidden])')", 5000);
  t.sjekk(!t.norsk || /kan ikke gå opp/.test(await t.tekst("#kk-fast-tekst")), "Meldingen sier ikke at kabalen ikke kan gå opp");
  t.sjekk(await t.finnes('#kk-fast [data-h="ny"]'), "Meldingen om at kabalen er låst mangler «Ny kabal»");
  t.sjekk(await t.js('document.getElementById("kk-spol").hidden'), "«Spol tilbake» tilbys selv om det ikke er noe å spole tilbake til");
  t.sjekk(await t.finnes("#kk-status .kk-laast"), "Statusen skal vise «Låst»");
  await t.bilde("tomt-for-trekk");

  // 13. «Dagens kabal»: the day's fixed, proven deal – in its own slot beside free play
  await t.lastSide(t.url + "/", "document.querySelector('.spillgrid')");
  await t.js(`localStorage.removeItem("${t.nokkel("kortkongen.v1")}"); localStorage.removeItem("${t.nokkel("daglig")}")`);
  await t.lastSide(t.side, "document.querySelector('.hjem-knapper')");
  const dag = await t.js("window.Rusj.dag()");
  const fast = K.dagens(dag.tekst, LOSBARE.tre);
  await t.klikk('.hjem-knapper [data-h="dagens"]');
  await t.vent(brettKlart);
  await t.sov(2200);
  s = await t.tilstand();
  t.sjekk(s.spill.dag === dag.nr && s.spill.dato === dag.tekst && s.spill.fro === fast.fro && s.spill.variant === fast.variant, "Dagens kabal er ikke dagens faste kabal");
  t.sjekk(s.spill.kode === K.kode(K.del(fast.fro, fast.variant, 1)) && s.spill.losbar, "Dagens kabal er ikke delt ut som den løsbare kabalen den skal være");
  t.sjekk(!t.norsk || /dagens kabal/i.test(await t.tekst("#topp-tittel")), "Brettet skal hete «Dagens kabal»");
  await t.vent("document.querySelector('#kk-status .kk-losbar')", 3000);
  await t.bilde("dagens-brett");
  await t.klikk("#kk-bunke");
  const dagKode = await kode();
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett dagens kabal · 1 trekk/ : /1/).test(await t.tekst(".hjem-knapper .knapp")), "Hjem viser ikke «Fortsett dagens kabal»");
  await t.bilde("hjem-dagens-i-gang");
  // «Ny kabal» from home deals at once – and the daily keeps its own slot
  await t.klikk('.hjem-knapper [data-h="nytt"]');
  await t.vent(brettKlart);
  await t.sov(2200);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "spill" && s.spill.dag == null && s.spill.trekk === 0, "«Ny kabal» fra hjem skal dele ut med en gang");
  t.sjekk(s.annet && s.annet.dag === dag.nr && s.annet.kode === dagKode, "Dagens kabal ble borte da en fri kabal startet");
  await t.klikk("#kk-bunke");
  const friKode = await kode();
  await t.lastSide(t.side, brettKlart);
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett dagens kabal/ : /1/).test(await t.tekst(".hjem-knapper")) && (t.norsk ? /Fortsett · 1 trekk/ : /1/).test(await t.tekst('.hjem-knapper [data-h="fortsett"]')), "Hjem skal vise begge kabalene som er i gang");
  await t.klikk('.hjem-knapper [data-h="dagens"]');
  await t.vent(brettKlart);
  s = await t.tilstand();
  t.sjekk(s.spill.kode === dagKode && s.annet.kode === friKode, "De to kabalene har ikke hver sin lagringsplass");
  // «På nytt»: the same cards from the start; never a loss in the statistics
  await pause();
  await t.klikk('[data-h="ny"]');
  t.sjekk((t.norsk ? /Kortene er de samme/ : /\S/).test(await t.tekst("#ark")), "«På nytt» for dagens kabal forklarer ikke hva som skjer");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(brettKlart);
  await t.sov(2200);
  s = await t.tilstand();
  t.sjekk(s.spill.dag === dag.nr && s.spill.trekk === 0 && s.spill.kode === K.kode(K.del(fast.fro, fast.variant, 1)) && !s.stat[1], "«På nytt» ga ikke dagens kabal fra start (uten tap i statistikken)");

  // Solving it (three days in a row before today): result, countdown, streak, share, rusj.daglig
  const friSpill = s.annet;
  await lastInn({ ...tilstand(nyttSpill(nesten, { dag: dag.nr, dato: dag.tekst, startet: true, trekk: 97, tid: 191000 })), annet: friSpill, dstat: { rekke: 3, sist: dag.nr - 1, beste: 3, lost: 3 } });
  await t.klikk("#kk-k11");
  await t.vent("document.querySelector('.skjerm-slutt')", 16000);
  await t.sov(800);
  t.sjekk((!t.norsk || /Dagens kabal gikk opp/.test(await t.tekst("#skjerm h1"))), "Resultatet for dagens kabal vises ikke");
  t.sjekk((t.norsk ? /4 dager på rad/ : /4/).test(await t.tekst(".banner")), "Resultatet viser ikke dager på rad");
  await t.bilde("dagens-resultat", true);
  const nedtelling = await t.tekst(".kk-nedtelling b");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(nedtelling), `Nedtellingen til neste kabal vises ikke: «${nedtelling}»`);
  await t.sov(1300);
  t.sjekk((await t.tekst(".kk-nedtelling b")) !== nedtelling, "Nedtellingen står stille");
  s = await t.tilstand();
  t.sjekk(s.dstat.rekke === 4 && s.dstat.sist === dag.nr && s.stat[1] && s.stat[1].vunnet === 1, "Rekka eller statistikken ble ikke oppdatert");
  t.sjekk(s.annet && s.annet.kode === friKode, "Den frie kabalen forsvant da dagens ble løst");
  const daglig = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").kortkongen`);
  t.sjekk(daglig && daglig.nr === dag.nr && daglig.vunnet === true && daglig.rekke === 4, `Dagens kabal ble ikke meldt til «I dag»: ${JSON.stringify(daglig)}`);
  t.sjekk(!daglig || daglig.res == null || /^\d+:\d\d$/.test(daglig.res), "Resultatteksten til «I dag» skal være tiden");
  await t.js(`(() => {
    window.__delt = null;
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
  })()`);
  await t.klikk('[data-h="del"]', 300);
  const delt = await t.js("window.__delt");
  // Elsewhere: the numbers and the edition's own address (https://rusj.no/en/card-king/ …).
  const adresse = "https://rusj.no" + new URL(t.side).pathname;
  t.sjekk(delt && (t.norsk ? /^Kortkongen \d+\.\d+\. · gikk opp på \d+:\d\d · \d+ trekk\n🔥 4 dager på rad\nhttps:\/\/rusj\.no\/kortkongen\/$/ : /^\S.* \d+[./]\d+\.? · .*\d+:\d\d · \d+ .*\n🔥 4 .*\n/).test(delt) && delt.endsWith("\n" + adresse), `Delingsteksten er feil: ${delt}`);
  // Home: the daily is a note with the result; free play is the main button again
  // (The «install as app» tip may have come up by now: close it first.)
  if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /gikk opp/ : /\d:\d\d/).test(await t.tekst(".kk-dagboks")) && /^\d\d:\d\d:\d\d$/.test(await t.tekst(".kk-dagboks .kk-nedtelling b")), "Hjem viser ikke at dagens kabal er løst, med nedtelling");
  t.sjekk((t.norsk ? /Fortsett · 1 trekk/ : /1/).test(await t.tekst(".hjem-knapper .knapp")), "Etter dagens kabal skal fritt spill være hovedknappen");
  await t.bilde("hjem-dagens-lost", true);
  await t.klikk('.kk-dagboks [data-h="dagens"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk((!t.norsk || /Dagens kabal gikk opp/.test(await t.tekst("#skjerm h1"))), "«Se resultatet» åpner ikke dagens resultat");
  // …/kortkongen/#dagens: the result when it is solved, the board when it is not
  await t.lastSide(t.url + "/", "document.querySelector('.spillgrid')");
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  t.sjekk((!t.norsk || /Dagens kabal gikk opp/.test(await t.tekst("#skjerm h1"))), "#dagens skal vise resultatet når dagens kabal er løst");
  await t.lastSide(t.url + "/", "document.querySelector('.spillgrid')");
  await t.js(`localStorage.removeItem("${t.nokkel("kortkongen.v1")}")`);
  await t.lastSide(t.side + "#dagens", brettKlart);
  s = await t.tilstand();
  t.sjekk(s.spill && s.spill.dag === dag.nr && s.skjerm === "spill", "#dagens skal åpne dagens kabal");

  // 14. «Kan fortsatt gå opp?»: a fatal move turns the chip to «Låst»; «Spol tilbake» finds the
  // newest position that can be solved
  const felle = finnFelle();
  const n = felle.historie.length;
  await lastInn(tilstand(nyttSpill(felle.etter, { fro: felle.fro, start: K.kode(K.del(felle.fro, 0, 1)), angre: [...felle.historie, K.kode(felle.for) + "|" + n], trekk: n + 1, startet: true })));
  await t.vent("document.querySelector('#kk-status .kk-laast')", 8000);
  t.sjekk(await t.finnes("#kk-fast:not([hidden]) #kk-spol:not([hidden])"), "En låst kabal skal tilby «Spol tilbake»");
  t.sjekk(!t.norsk || /Herfra kan ikke kabalen gå opp/.test(await t.tekst("#kk-fast-tekst")), "Meldingen sier ikke at kabalen er låst herfra");
  await t.sov(300);
  await t.bilde("laast");
  await t.klikk("#kk-spol");
  await t.vent(`window.Rusj.S.spill.angre.length === ${n}`, 8000);
  s = await t.tilstand();
  t.sjekk(s.spill.kode === K.kode(felle.for) && s.spill.trekk === n && s.spill.ok === n && s.spill.dod === -1, "«Spol tilbake» gikk ikke til siste stilling som kan gå opp");
  t.sjekk((t.norsk ? /Spolt tilbake 1 trekk/ : /1/).test(await toast()), "«Spol tilbake» sier ikke hvor langt det gikk");
  t.sjekk((await t.finnes("#kk-status .kk-losbar")) && (await t.js('document.getElementById("kk-fast").hidden')), "Etter «Spol tilbake» skal statusen være «Kan gå opp»");
  await t.sov(500);
  await t.bilde("spolt-tilbake");
  // The same fatal move again, by hand: the chip turns to «Låst» by itself; «Angre» clears it
  const fraKort = K.loft(felle.for, felle.m)[0];
  const tilKol = felle.for.bord[felle.m.j];
  const tilPunkt = felle.m.til === "g" ? await plassPunkt(felle.for.grunn[felle.m.j] ? `kk-k${felle.m.j * 13 + felle.for.grunn[felle.m.j] - 1}` : `kk-g${felle.m.j}`) : tilKol.length ? await punkt(tilKol[tilKol.length - 1], 0.8) : await plassPunkt(`kk-b${felle.m.j}`);
  await dra(await punkt(fraKort, 0.12), tilPunkt);
  t.sjekk((await kode()) === K.kode(felle.etter), "Fellen ble ikke spilt med dra og slipp");
  await t.vent("document.querySelector('#kk-status .kk-laast')", 8000);
  await t.klikk('#skjerm .dokk [data-h="hint"]');
  await t.sov(300);
  t.sjekk((t.norsk ? /Spol tilbake/ : /\S/).test(await toast()) && !(await t.finnes(".kk-hint")), "«Hint» i en låst stilling skal vise til «Spol tilbake»");
  await t.klikk('#skjerm .dokk [data-h="angre"]');
  await t.vent("document.querySelector('#kk-status .kk-losbar')", 5000);
  t.sjekk((await kode()) === K.kode(felle.for), "«Angre» etter fellen ga ikke stillingen tilbake");

  // 15. A card with two places to go: the first tap picks it and lights the places up, the next
  // tap chooses (a place, or the card again for the best one). The keyboard order follows the table.
  const valg = { bunke: [], avfall: [19], vifte: 1, grunn: [0, 0, 0, 0], bord: [[0, 7], [13, 46], [], [], [], [], []], skjult: [1, 1, 0, 0, 0, 0, 0], modus: 1 }; // 7♥ on the waste; 8♠ and 8♣ on the table (each on a face-down card)
  for (let k = 51; k >= 0; k--) if (![19, 7, 46, 0, 13].includes(k)) valg.bunke.push(k);
  t.sjekk(K.gyldig(valg) && K.alleMal(valg, { fra: "a" }).length === 2, "Teststillingen med to plasser er feil satt opp");
  await lastInn(tilstand(nyttSpill(valg, { losbar: false })));
  await t.sov(700);
  const rekkefolge = await t.js(`[...document.querySelectorAll("#kk-brett .kk-kort:not(.kk-av), #kk-bunke")].map((e) => e.id).join(" ")`);
  t.sjekk(rekkefolge === "kk-k19 kk-bunke kk-k7 kk-k46", `Tastaturrekkefølgen følger ikke bordet: ${rekkefolge}`);
  await t.trykk("#kk-k19");
  await t.sov(250);
  s = await t.tilstand();
  t.sjekk(s.spill.trekk === 0 && (await t.antall(".kk-valgt")) === 1 && (await t.antall(".kk-velg")) === 2, "Et kort med to plasser skal velges, ikke flyttes");
  await t.bilde("velg-plass");
  await t.trykk("#kk-k46");
  await t.sov(400);
  st = K.fraKode(await kode());
  t.sjekk(st.bord[1].join() === "13,46,19" && st.bord[0].join() === "0,7" && !(await t.finnes(".kk-valgt, .kk-velg")), "Trykket på den andre plassen la ikke kortet der");
  await t.klikk('#skjerm .dokk [data-h="angre"]');
  await pause();
  await t.klikk("#kk-k19");
  await t.klikk("#kk-k19");
  await t.sov(300);
  st = K.fraKode(await kode());
  t.sjekk(st.bord[0].join() === "0,7,19", "To trykk på kortet skal sende det til beste plass");
  await t.sov(600);
  const etterFlytt = await t.js(`[...document.querySelectorAll("#kk-brett .kk-kort:not(.kk-av), #kk-bunke")].map((e) => e.id).join(" ")`);
  t.sjekk(/^kk-bunke kk-k7 kk-k19 kk-k46$/.test(etterFlytt), `Tastaturrekkefølgen fulgte ikke med etter trekket: ${etterFlytt}`);

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

  await varianter(t);
}

// ---------- The other solitaires: Golf, Tre topper, Pyramide, FreeCell, Edderkopp ----------
// Each from its tile on the home screen: a proven deal (Edderkopp after the suit choice), the table
// clear of the toolbar, a tap that makes a legal move (or picks the card), undo, a hint, reload and
// back + «Fortsett»; then a nearly won game finishes with a tap → the result, the statistics and the
// record line on the tile. Plus: Pyramide's choice between two partners, a drag in FreeCell (mouse)
// and Edderkopp (finger), Edderkopp refusing to deal onto an empty column, the rules of the solitaire
// on the table, and Klondike's own state left alone.
const V = kontekst.KortkongenVarianter;
const KABALER = JSON.parse(readFileSync(join(ROT, "rusj/spill/kortkongen/data/kabaler.json"), "utf8"));
const ANTALL = { golf: 52, topper: 52, pyramide: 52, freecell: 52, edderkopp: 104 };
const vSpill = (id, st, ekstra = {}) => ({
  id,
  fro: 1,
  bytte: 0,
  sorter: id === "edderkopp" ? st.sorter : 0,
  losbar: false,
  kode: V[id].kode(st),
  start: V[id].kode(st),
  angre: [],
  trekk: 0,
  tid: 0,
  hint: 0,
  spolt: 0,
  ok: -1,
  dod: -1,
  startet: false,
  ferdig: false,
  vunnet: false,
  talt: false,
  resultat: null,
  ...ekstra,
});
const vTilstand = (sp, skjerm = "vspill", ekstra = {}) => ({ oppsett: { modus: 1, losbar: true }, stat: {}, spill: null, v: { [sp.id]: sp }, vid: sp.id, vstat: {}, vopp: { sorter: sp.sorter || 1 }, skjerm, _tid: Date.now(), ...ekstra });
const ALLE = Array.from({ length: 52 }, (_, k) => k);
// One tap from the end of each solitaire.
function nesten(id) {
  if (id === "golf") return { kol: [[4], [], [], [], [], [], []], bunke: [], avfall: ALLE.filter((k) => k !== 4 && k !== 16).concat([16]) }; // 5♠ onto 4♥
  if (id === "topper") {
    const bord = Array(28).fill(-1);
    bord[18] = 4;
    return { bord, bunke: [], avfall: ALLE.filter((k) => k !== 4 && k !== 16).concat([16]) };
  }
  if (id === "pyramide") {
    const bord = Array(28).fill(-1);
    bord[0] = 12; // K♠ alone at the top
    return { bord, bunke: [], trukket: -1, avfall: [], kast: ALLE.filter((k) => k !== 12) };
  }
  if (id === "freecell") return { bord: [[12], [], [], [], [], [], [], []], celle: [-1, -1, -1, -1], grunn: [12, 13, 13, 13] };
  const bord = Array.from({ length: 10 }, () => []);
  bord[0] = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]; // K … 2 of spades; the ace beside it
  bord[1] = [0];
  const hjem = [];
  for (let c = 1; c < 8; c++) for (let v = 12; v >= 0; v--) hjem.push(c * 13 + v);
  return { bord, skjult: Array(10).fill(0), bunke: [], hjem, sorter: 1 };
}
const nestenKort = { golf: 4, topper: 4, pyramide: 12, freecell: 12, edderkopp: 0 };

async function varianter(t) {
  const kode = async (id) => (await t.tilstand()).v[id].kode;
  const kortKlart = (id) => `document.querySelectorAll('#kv-brett .kk-kort').length === ${ANTALL[id]}`;
  async function lastInn(S, ventPa) {
    await t.lastSide(t.url + "/", "document.querySelector('.spillgrid')");
    await t.js(`localStorage.setItem("${t.nokkel("kortkongen.v1")}", ${JSON.stringify(JSON.stringify(S))})`);
    await t.lastSide(t.side, ventPa || "document.querySelector('#skjerm h1')");
    await t.sov(400);
  }
  const brettOverDokk = () =>
    t.js(`(() => { const d = document.querySelector("#skjerm .dokk").getBoundingClientRect();
      for (const el of document.querySelectorAll("#kv-brett .kk-kort:not(.kk-av), #kv-brett .kk-plass")) {
        const b = el.getBoundingClientRect();
        if (!b.width) continue;
        const ved = b.right <= d.left + 1 || b.left >= d.right - 1;
        if (ved ? b.bottom > window.innerHeight + 1 : b.bottom > d.top + 2) return false;
        if (b.left < -1 || b.right > window.innerWidth + 1) return false;
      }
      return true; })()`);
  const toast = () => t.js(`(document.querySelector("#toast") || { textContent: "" }).textContent`);
  const punkt = (k, dy = 0.5) =>
    t.js(`(() => { const b = document.getElementById("kv-k${k}").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + Math.min(b.height * ${dy}, b.height - 4) }; })()`);
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
  // The positions one legal move away (to check that a tap made a legal move).
  const etterfolgere = (id, st) =>
    V[id].trekk(st).map((m) => {
      const c = V[id].fraKode(V[id].kode(st));
      V[id].utfor(c, m);
      return V[id].kode(c);
    });

  // Klondike's own state before the other solitaires are played: it must come through untouched.
  await lastInn({ oppsett: { modus: 3, losbar: false }, stat: { 3: { spilt: 4, vunnet: 2, rekke: 1, besteRekke: 2, besteTid: 300, faerrest: 120 } }, spill: null, skjerm: "hjem", _tid: Date.now() }, "document.querySelector('.kk-varianter')");
  t.sjekk((await t.antall(".kk-vknapp")) === 5, "Hjem skal vise de fem andre kabalene");
  t.sjekk(!t.norsk || /flere kabaler/i.test(await t.tekst(".kk-varianter h2")), "Hjem mangler «Flere kabaler»");
  t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), "Hjem-skjermen er for bred");
  await t.bilde("hjem-kabaler", true);

  for (const id of ["golf", "topper", "pyramide", "freecell", "edderkopp"]) {
    // A new deal from the tile
    await t.klikk(`.kk-vknapp[data-v="${id}"]`);
    if (id === "edderkopp") {
      t.sjekk((await t.antall('.fliser [data-h="vsorter"]')) === 3, "Edderkopp skal kunne velge 1, 2 eller 4 sorter");
      t.sjekk(await t.finnes('[data-h="vsorter"][data-v="1"][aria-pressed="true"]'), "Edderkopp skal starte med én sort");
      await t.klikk('[data-h="vsorter"][data-v="2"]');
      await t.bilde("edderkopp-oppsett", true);
      await t.klikk('.dokk [data-h="vstart"]');
    }
    await t.vent(kortKlart(id));
    await t.sov(300);
    await t.bilde(`${id}-deler-ut`);
    await t.sov(2400);
    let s = await t.tilstand();
    let sp = s.v && s.v[id];
    let st = sp && V[id].fraKode(sp.kode);
    t.sjekk(s.vid === id && st && s.skjerm === "vspill", `${id}: ingen kabal på bordet`);
    if (!st) continue;
    t.sjekk(sp.kode === V[id].kode(V[id].del(sp.fro, id === "edderkopp" ? sp.sorter : sp.bytte)), `${id}: kabalen er ikke delt ut som frøet sier`);
    if (id === "edderkopp") t.sjekk(sp.sorter === 2 && s.vopp.sorter === 2, "Edderkopp ble ikke delt ut med to sorter");
    else t.sjekk(sp.losbar && KABALER[id].includes(sp.fro), `${id}: kabalen er ikke fra listen over løsbare`);
    t.sjekk(s.spill === null && s.stat[3] && s.stat[3].spilt === 4 && s.oppsett.modus === 3, `${id}: Klondike-lagringen ble endret`);
    t.sjekk(await brettOverDokk(), `${id}: kortene stikker inn under knappene eller ut av skjermen`);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `${id}: brettet er for bredt`);
    t.sjekk(!t.norsk || (await t.tekst("#topp-tittel")).toLowerCase().includes({ golf: "golf", topper: "tre topper", pyramide: "pyramide", freecell: "freecell", edderkopp: "edderkopp" }[id]), `${id}: tittelen viser ikke navnet på kabalen`);
    if (id === "edderkopp") {
      const bredde = await t.js(`parseFloat(document.getElementById("kv-brett").style.getPropertyValue("--kortbredde"))`);
      t.sjekk(bredde >= 26, `Edderkopp-kortene er for små: ${bredde} px`);
    }
    if (id !== "edderkopp") await t.vent("document.querySelector('#kv-status .kk-stat')", 8000).catch(() => t.feil(`${id}: «Kan gå opp»-merket kom aldri`));
    await t.bilde(`${id}-brett`);

    // A tap: a legal move (or the card is picked, with its places lit up)
    const start = sp.kode;
    const lovlige = etterfolgere(id, st);
    const trykkbar = await t.js(`[...document.querySelectorAll("#kv-brett .kk-kort:not(.kk-av)")].map((e) => Number(e.dataset.k))`);
    let gjort = false;
    for (const k of trykkbar) {
      await t.klikk(`#kv-k${k}`, 250);
      const ny = await kode(id);
      if (ny !== start) {
        t.sjekk(lovlige.includes(ny), `${id}: et trykk ga et ulovlig trekk`);
        gjort = true;
        break;
      }
      if (await t.finnes("#kv-brett .kk-valgt")) {
        t.sjekk((await t.antall("#kv-brett .kk-velg")) >= 2, `${id}: et valgt kort uten plasser som lyser`);
        await t.bilde(`${id}-velg`);
        await t.klikk("#kv-brett .kk-velg", 300);
        const ny2 = await kode(id);
        t.sjekk(lovlige.includes(ny2), `${id}: trykket på en plass som lyste ga ikke et lovlig trekk`);
        gjort = ny2 !== start;
        break;
      }
    }
    if (!gjort && (await t.finnes("#kv-s-bunke:not([disabled])"))) {
      await t.klikk("#kv-s-bunke", 300);
      gjort = (await kode(id)) !== start;
      t.sjekk(lovlige.includes(await kode(id)), `${id}: bunken ga et ulovlig trekk`);
    }
    t.sjekk(gjort, `${id}: ingen trykk flyttet noe`);
    s = await t.tilstand();
    t.sjekk(s.v[id].trekk === 1 && s.v[id].startet, `${id}: trekket ble ikke talt`);
    await t.sov(400);
    await t.bilde(`${id}-etter-trykk`);
    await t.klikk("#kv-angre", 400);
    t.sjekk((await kode(id)) === start, `${id}: «Angre» ga ikke tilbake samme stilling`);
    t.sjekk(await t.js('document.getElementById("kv-angre").disabled'), `${id}: «Angre» skal være grått når det ikke er noe å angre`);

    // A hint, then reload and back + «Fortsett»
    await t.klikk('#skjerm .dokk [data-h="vhint"]');
    await t.vent("document.querySelector('#kv-brett .kk-hint')", 8000).catch(() => t.feil(`${id}: «Hint» viste ikke noe trekk`));
    await t.bilde(`${id}-hint`);
    if (await t.finnes("#kv-s-bunke:not([disabled])")) await t.klikk("#kv-s-bunke", 300);
    else await t.klikk(`#kv-k${trykkbar[0]}`, 300);
    const forOmlasting = await kode(id);
    await t.lastSide(t.side, kortKlart(id));
    t.sjekk((await kode(id)) === forOmlasting && (await t.tilstand()).skjerm === "vspill", `${id}: stillingen forsvant ved omlasting`);
    await t.klikk("#tilbake");
    await t.vent("document.querySelector('.kk-varianter')");
    t.sjekk(await t.finnes(`.kk-vknapp.i-gang[data-v="${id}"]`), `${id}: flisen viser ikke at kabalen er i gang`);
    t.sjekk(!t.norsk || /I gang · 1 trekk/.test(await t.tekst(`.kk-vknapp[data-v="${id}"]`)), `${id}: flisen mangler «I gang · 1 trekk»`);
    await t.klikk(`.kk-vknapp[data-v="${id}"]`);
    await t.vent(kortKlart(id));
    t.sjekk((await kode(id)) === forOmlasting, `${id}: «Fortsett» fra flisen ga ikke samme kabal`);
    await t.klikk("#reglerknapp");
    t.sjekk(!t.norsk || (await t.tekst("#ark h2")).toLowerCase().includes({ golf: "golf", topper: "tre topper", pyramide: "pyramide", freecell: "freecell", edderkopp: "edderkopp" }[id]), `${id}: «?» viser ikke reglene for denne kabalen`);
    t.sjekk((await t.antall("#ark .steg li")) === 3, `${id}: reglene skal ha tre steg`);
    if (id === "pyramide") await t.bilde("pyramide-regler");
    await t.klikk('#ark [data-h="lukk-ark"]');

    // One tap from the end: it goes out, and the result shows (with the statistics)
    await lastInn(vTilstand(vSpill(id, nesten(id)), "vspill", { vstat: s.vstat, stat: s.stat, oppsett: s.oppsett }), kortKlart(id));
    await t.klikk(`#kv-k${nestenKort[id]}`);
    await t.vent("document.querySelector('.skjerm-vslutt')", 6000);
    await t.sov(700);
    t.sjekk(!t.norsk || /gikk opp/.test(await t.tekst("#skjerm h1")), `${id}: seieren vises ikke`);
    s = await t.tilstand();
    const sid = id === "edderkopp" ? "edderkopp1" : id;
    t.sjekk(s.vstat[sid] && s.vstat[sid].vunnet === 1 && s.vstat[sid].besteTid > 0, `${id}: seieren ble ikke lagret i statistikken`);
    t.sjekk(s._aktiv === false, `${id}: en vunnet kabal skal ikke regnes som pågående`);
    t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), `${id}: sluttskjermen mangler «Alle spill»`);
    t.sjekk((await t.finnes(".flere-spill")) || !(await t.js("(window.RUSJ_ANDRE || []).length")), `${id}: sluttskjermen mangler «Spill noe annet»`);
    if (id === "golf" || id === "edderkopp") await t.bilde(`${id}-seier`, true);
    await t.klikk('.dokk [data-h="vhjem"]');
    await t.vent("document.querySelector('.kk-varianter')");
    if (id === "edderkopp") await t.klikk('.dokk [data-h="vhjem"]').catch(() => {});
    t.sjekk(!t.norsk || /Rekord/.test(await t.tekst(`.kk-vknapp[data-v="${id}"]`)) || id === "edderkopp", `${id}: flisen viser ikke rekorden`);
  }

  // Pyramide: a card with two partners – the first tap picks, the second chooses
  const to = Array(28).fill(-1);
  to[27] = 5; // 6♠
  to[26] = 19; // 7♥
  to[25] = 45; // 7♣
  to[24] = 18; // 6♥ (so the game can still come out)
  const pyr = { bord: to, bunke: [], trukket: -1, avfall: [], kast: ALLE.filter((k) => ![5, 19, 45, 18].includes(k)) };
  await lastInn(vTilstand(vSpill("pyramide", pyr)), kortKlart("pyramide"));
  await t.trykk("#kv-k5");
  t.sjekk((await t.antall("#kv-brett .kk-valgt")) === 1 && (await t.antall("#kv-brett .kk-velg")) === 2, "Pyramide: et kort med to partnere skal velges, og begge skal lyse");
  await t.bilde("pyramide-to-valg");
  await t.trykk("#kv-k45");
  await t.sov(300);
  let st = V.pyramide.fraKode(await kode("pyramide"));
  t.sjekk(st.bord[27] === -1 && st.bord[25] === -1 && st.bord[26] === 19, "Pyramide: trykket på den andre partneren fjernet ikke det paret");

  // FreeCell: drag a card onto a column with the mouse; a drop where it can't go sends it back
  const fc = V.freecell.del(KABALER.freecell[3], 0);
  await lastInn(vTilstand(vSpill("freecell", fc)), kortKlart("freecell"));
  const flytt = V.freecell.trekk(fc).find((m) => m.fra === "b" && m.til === "b" && fc.bord[m.j].length);
  if (flytt) {
    const kortet = fc.bord[flytt.i][flytt.p];
    const mal = fc.bord[flytt.j][fc.bord[flytt.j].length - 1];
    const feil = [0, 1, 2, 3, 4, 5, 6, 7].find((j) => j !== flytt.i && fc.bord[j].length && !V.freecell.lovlig(fc, { ...flytt, j }));
    if (feil != null) {
      await dra(await punkt(kortet, 0.15), await punkt(fc.bord[feil][fc.bord[feil].length - 1], 0.8));
      t.sjekk((await kode("freecell")) === V.freecell.kode(fc), "FreeCell: et kort sluppet der det ikke kan ligge, ble flyttet");
    }
    await dra(await punkt(kortet, 0.15), await punkt(mal, 0.8));
    const etter = V.freecell.fraKode(V.freecell.kode(fc));
    V.freecell.utfor(etter, flytt);
    t.sjekk((await kode("freecell")) === V.freecell.kode(etter), "FreeCell: dra og slipp med mus flyttet ikke kortet");
    await t.bilde("freecell-dratt");
  } else t.feil("Fant ikke noe FreeCell-trekk å dra");

  // Edderkopp: no deal while a column is empty; a drag with a finger
  const ed = V.edderkopp.del(7, 1);
  const ekstra = ed.bord[9].splice(0);
  ed.bord[8].push(...ekstra);
  ed.skjult[9] = 0;
  ed.skjult[8] = ed.bord[8].length - 1;
  await lastInn(vTilstand(vSpill("edderkopp", V.edderkopp.fraKode(V.edderkopp.kode(ed)))), kortKlart("edderkopp"));
  const forDeling = await kode("edderkopp");
  await t.klikk("#kv-s-bunke", 300);
  t.sjekk((await kode("edderkopp")) === forDeling, "Edderkopp: bunken delte ut selv om en kolonne er tom");
  t.sjekk((t.norsk ? /tomme|må ha kort/ : /\S/).test(await toast()), "Edderkopp: ingen beskjed om at alle kolonnene må ha kort");
  await t.bilde("edderkopp-tom-kolonne");
  const edSt = V.edderkopp.fraKode(forDeling);
  const edFlytt = V.edderkopp.trekk(edSt).find((m) => m.fra === "b" && edSt.bord[m.j].length);
  if (edFlytt) {
    const kortet = edSt.bord[edFlytt.i][edFlytt.p];
    await dra(await punkt(kortet, 0.15), await punkt(edSt.bord[edFlytt.j][edSt.bord[edFlytt.j].length - 1], 0.8), true);
    const etter = V.edderkopp.fraKode(forDeling);
    V.edderkopp.utfor(etter, edFlytt);
    t.sjekk((await kode("edderkopp")) === V.edderkopp.kode(etter), "Edderkopp: dra og slipp med fingeren flyttet ikke kortet");
  }

  // Small phones: Edderkopp's ten columns and a long column stay above the toolbar and readable
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  if (b0 > 320) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
    // Six face-down cards and twenty face-up ones in the first column, two in each of the others.
    const ids = V.stokk(104, 11);
    const bord = [ids.slice(0, 26), ...Array.from({ length: 9 }, (_, i) => ids.slice(26 + i * 2, 28 + i * 2))];
    const lang = { bord, skjult: bord.map((k, i) => (i === 0 ? 6 : 1)), bunke: ids.slice(44), hjem: [], sorter: 4 };
    const gyldig = V.edderkopp.fraKode(V.edderkopp.kode(lang));
    if (gyldig) {
      await lastInn(vTilstand(vSpill("edderkopp", gyldig, { startet: true })), kortKlart("edderkopp"));
      t.sjekk(await brettOverDokk(), "Edderkopp: en lang kolonne stikker inn under knappene på 320 × 568");
      await t.bilde("edderkopp-320-lang");
    } else t.feil("Teststillingen med lang Edderkopp-kolonne er ugyldig");
    await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  }
}
