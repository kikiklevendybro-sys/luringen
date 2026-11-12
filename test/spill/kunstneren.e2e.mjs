// Kunstneren: play "Tegn og gjett" with real mouse and touch strokes — three screens per turn
// (hand-over with the secret card, the drawing, the answer with the chips for who guessed): tools,
// undo/redo/clear, saved = drawn pixel check, peek (finger, keyboard, screen reader), reload
// mid-drawing, time up, give up, back + continue, Kåringen (podium, exhibition, share picture,
// statistics, «Kveldens gjeng», record). Then "Hviskeleken": a full chain for four (secrets behind
// "Jeg er …" after a reload, escaping, the stroke-by-stroke gallery), «Avslutt» in the middle of
// a chain, an odd chain where the whole table makes the last guess, and the mode switched off
// below four players. Team mode, two players playing together for a record, finished drawings
// in their own storage keys, small and sideways screens.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en kunstneren): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names and the edition's storage keys.

// Points as fractions of the sheet (0–1).
const sirkel = (cx, cy, r, n = 28) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
const linje = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
const sti = (...hjorner) => hjorner.slice(1).flatMap((p, i) => linje(hjorner[i][0], hjorner[i][1], p[0], p[1], 8).slice(i ? 1 : 0));

async function rekt(t) {
  return t.js(`(() => { const b = document.querySelector(".kunst-lerret").getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
}

// One stroke with the mouse (default) or a finger.
async function strek(t, punkter, { touch = false } = {}) {
  const r = await rekt(t);
  const P = punkter.map(([fx, fy]) => ({ x: r.x + fx * r.w, y: r.y + fy * r.h }));
  const sist = P[P.length - 1];
  if (touch) {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: P[0].x, y: P[0].y }] });
    for (const p of P.slice(1)) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y }] });
      await t.sov(6);
    }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: P[0].x, y: P[0].y });
    await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: P[0].x, y: P[0].y, button: "left", buttons: 1, clickCount: 1 });
    for (const p of P.slice(1)) {
      await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "left", buttons: 1 });
      await t.sov(6);
    }
    await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: sist.x, y: sist.y, button: "left", buttons: 0, clickCount: 1 });
  }
  await t.sov(90);
}

// "Del som bilde": the picture is made on the phone and shown in a sheet.
async function delBilde(t, navn) {
  await t.klikk('[data-h="lag-bilde"]');
  await t.vent("(() => { const i = document.querySelector('#ark:not([hidden]) img.kunst-delbilde'); return i && i.complete && i.naturalHeight > 400; })()", 8000);
  await t.bilde(navn);
  await t.klikk('#ark [data-h="last-ned"]');
  t.sjekk((!t.norsk || /lastet ned/i.test(await t.tekst("#toast"))), "«Last ned» ga ingen beskjed");
  await t.klikk('#ark [data-h="lukk-ark"]');
}

// How much of a canvas is not blank paper (sampled pixels).
const blekk = (t, sel = ".kunst-lerret") =>
  t.js(`(() => { const c = document.querySelector(${JSON.stringify(sel)}); if (!c || !c.width) return -1; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 32) { if (Math.abs(d[i] - 255) + Math.abs(d[i + 1] - 241) + Math.abs(d[i + 2] - 221) > 60) n++; } return n; })()`);

const antallStreker = async (t) => (await t.tilstand()).spill.strek.length;

async function seOrdet(t) {
  await t.vent("document.querySelector('.mappe')");
  const slipp = await t.hold(".mappe", 700);
  await slipp();
  await t.vent("!document.querySelector('[data-h=\"tegn-start\"]').disabled");
}

async function startTegning(t) {
  await seOrdet(t);
  await t.klikk('[data-h="tegn-start"]', 50);
  await t.vent("document.querySelector('.kunst-lerret') && document.getElementById('nedtelling').hidden", 8000);
  await t.sov(400);
}

// "Nytt spill" from the game's start screen; confirms when a game is running.
async function nyttSpill(t) {
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes('#ark:not([hidden]) [data-v="ja"]')) await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('[data-h=\"start\"]')");
}

// A little house with a sun: a few strokes that look like a drawing in the screenshots.
async function tegnHus(t, { touch = false } = {}) {
  await strek(t, sti([0.22, 0.86], [0.22, 0.52], [0.5, 0.3], [0.78, 0.52], [0.78, 0.86], [0.22, 0.86]), { touch });
  await strek(t, sti([0.42, 0.86], [0.42, 0.68], [0.56, 0.68], [0.56, 0.86]), { touch });
}

// What the game has in memory (the saved copy leaves finished drawings out, see below).
const minne = (t, uttrykk) => t.js(`(() => { const sp = Rusj.S.spill; return ${uttrykk}; })()`);
// The edition's own storage key (rusj.<lang>.… outside Norwegian).
const lagretNokkel = (t, nokkel) => t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel(nokkel))}) || "null")`);
const hendelser = (t, navn) => t.js(`Rusj._statKo.filter((e) => e.h === ${JSON.stringify(navn)}).map((e) => e.d)`);
const tast = async (t, key, vk, text) => {
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: vk });
  await t.sov(80);
};
// No "install as an app" sheet in the scripted run (the kit offers it after a finished game).
// Written straight to storage and loaded again: the kit's own save would cut the long test name.
async function utenInstallTips(t) {
  await t.js(`(() => { const f = JSON.parse(localStorage.getItem("rusj.felles")); f.installTips = 2; localStorage.setItem("rusj.felles", JSON.stringify(f)); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
}

// «Neste» with the dice held at one value while the next turn is dealt (0 gives a «Kunstnerkrav»
// whenever the rules allow one). The action runs inside the click, so nothing else sees the held dice.
const nesteMedTerning = (t, verdi) =>
  t.js(`(() => { const ekte = Math.random; Math.random = () => ${Number(verdi)}; try { document.querySelector('[data-h="neste"]').click(); } finally { Math.random = ekte; } })()`);

// One step of a Hviskeleken chain: through the hand-over, then a quick drawing or a typed guess.
async function kjedesteg(t, k, gjetning) {
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  t.sjekk(await t.finnes('[data-h="avslutt"]'), `«Avslutt» mangler på overleveringen til steg ${k + 1} i Hviskeleken`);
  await t.klikk('[data-h="hjeg"]');
  if (k % 2 === 0) {
    await t.vent("document.querySelector('.kunst-lerret')");
    await t.sov(300);
    await strek(t, sirkel(0.5, 0.45, 0.22));
    await t.klikk('[data-h="hferdig"]');
  } else {
    await t.vent("document.querySelector('#kunst-gjett')");
    await t.skrivInn("#kunst-gjett", gjetning || `gjetning ${k}`);
    await t.klikk("#kunst-send");
  }
}

export default async function (t) {
  const skjerm = await t.js("({ b: window.innerWidth, h: window.innerHeight })"); // the phone this run plays on

  // ---------- The gang decides the defaults: how many players, and how many rounds ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E", "Testspiller F", "Testspiller G"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 7, `Sju navn er lagret, men oppsettet viser ${await t.antall(".spiller")} spillere`);
  t.sjekk((t.norsk ? /^7 tegninger/ : /^7\D/).test(await t.tekst(".kunst-estimat")), `Sju spillere skal få én runde som standard («${await t.tekst(".kunst-estimat")}»)`);
  // The chain rule for every group size, one and two rounds: everyone is in it equally often and
  // nobody sits out, it ends on a guess (by the whole table when the number of steps is odd), nobody
  // is handed a drawing of their own guess, and the one who saw the secret word never guesses last.
  const kjedefeil = await t.js(`(() => {
    const S = Rusj.S;
    const feil = [];
    for (const lengde of [1, 2]) {
      for (let n = 4; n <= 20; n++) {
        S.antall = n;
        S.oppsett.modus = "hvisk";
        S.oppsett.lengde = lengde;
        Rusj.app.handlinger.start(null, null, S);
        const r = S.spill.rekke;
        const L = r.length;
        const ganger = {};
        for (const i of r) if (i >= 0) ganger[i] = (ganger[i] || 0) + 1;
        const alleMed = Object.keys(ganger).length === n && Object.values(ganger).every((g) => g === lengde);
        const bord = r.indexOf(-1);
        let egen = false;
        for (let k = 2; k < L; k++) if (r[k] >= 0 && (r[k] === r[k - 1] || r[k] === r[k - 2])) egen = true;
        const ok = S.spill.modus === "hvisk" && L % 2 === 0 && alleMed && !egen && r[L - 1] !== r[0] && (bord === -1 ? (n * lengde) % 2 === 0 : bord === L - 1 && (n * lengde) % 2 === 1);
        if (!ok) feil.push(n + " spillere, " + lengde + " runde(r): " + r.join(","));
      }
    }
    return feil;
  })()`);
  t.sjekk(kjedefeil.length === 0, `Kjederegelen i Hviskeleken holder ikke: ${kjedefeil.join(" | ")}`);

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 2 && (t.norsk ? /^6 tegninger/ : /^6\D/).test(await t.tekst(".kunst-estimat")), `To spillere skal få tre runder som standard («${await t.tekst(".kunst-estimat")}»)`);
  t.sjekk(await t.js(`document.querySelector('[data-h="modus"][data-v="hvisk"]').disabled`), "Hviskeleken skal ikke kunne velges med to spillere");

  // Player D has a very long name: every screen must wrap or shorten it, never overflow.
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller Dobbeltnavn-Langnavnesen"] });
  await utenInstallTips(t);

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4, "Spillerlista viser ikke fire spillere");
  t.sjekk((t.norsk ? /^8 tegninger/ : /^8\D/).test(await t.tekst(".kunst-estimat")), `Fire spillere skal få to runder som standard («${await t.tekst(".kunst-estimat")}»)`);
  t.sjekk(!(await t.js(`document.querySelector('[data-h="modus"][data-v="hvisk"]').disabled`)), "Hviskeleken skal kunne velges med fire spillere");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="mer"]');
  t.sjekk((await t.js(`document.querySelector('[data-h="runder"][data-v="2"]').getAttribute("aria-pressed")`)) === "true", "«Flere valg» viser ikke rundene som faktisk gjelder");
  await t.klikk('[data-h="runder"][data-v="1"]');
  t.sjekk(await t.finnes(".kunst-mer.apen"), "«Flere valg» lukket seg etter et valg");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  t.sjekk(await t.js("document.querySelector('[data-h=\"start\"]').disabled"), "Start skulle være av uten kategorier");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  // «Kunstnerkrav»: off until asked for
  t.sjekk((await t.js(`document.querySelector('[data-h="krav"]').getAttribute("aria-pressed")`)) === "false", "«Kunstnerkrav» skal være av som standard");
  await t.klikk('[data-h="krav"]');
  t.sjekk((await t.tilstand()).oppsett.krav === true, "«Kunstnerkrav» lot seg ikke slå på");
  await t.bilde("oppsett-flere-valg", true);
  await t.klikk('[data-h="start"]');

  // ---------- Tegn og gjett, screen 1 of 3: the hand-over with the secret word on it ----------
  await t.vent("document.querySelector('.mappe')");
  t.sjekk(!(await t.finnes(".kunst-krav")), "Første tegning i et spill skal aldri ha et kunstnerkrav");
  t.sjekk(await t.js("document.querySelector('[data-h=\"tegn-start\"]').disabled"), "Tegningen kan startes uten å ha sett ordet");
  t.sjekk(!t.norsk || (await t.js("document.getElementById('topp-tittel').textContent")) === "Tegning 1/4", "Tittelen øverst skal være kort («Tegning 1/4»)");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Første spill skal begynne med første spiller");
  t.sjekk((await hendelser(t, "start")).some((d) => d.modus === "tegn" && d.spillere === 4 && d.tegninger === 4), "Statistikken fikk ikke vite at et spill startet");
  await t.bilde("gi-mobilen");
  const forsteOrd = (await t.tilstand()).spill.ord.o;
  await t.klikk('[data-h="bytt-ord"]');
  const andreOrd = (await t.tilstand()).spill.ord.o;
  t.sjekk(andreOrd !== forsteOrd, "«Bytt ord» ga ikke et nytt ord");
  const slipp = await t.hold(".mappe", 700);
  t.sjekk((await t.tekst(".mappe-bakside")).toLowerCase().includes(andreOrd.toLowerCase()), "Kortet viser ikke ordet");
  await t.bilde("ordet");
  await slipp();
  t.sjekk((await t.tilstand()).spill.sett === true, "Ordet ble ikke merket som sett");
  t.sjekk(!/[^\s\wæøåÆØÅ–]/.test((await t.tekst('[data-h="tegn-start"]')).replace(/\d+ s(ek\.)?/, "")), `Startknappen skal være ren tekst («${await t.tekst('[data-h="tegn-start"]')}»)`);
  await t.klikk('[data-h="tegn-start"]', 50);
  await t.vent("document.querySelector('.kunst-lerret') && document.getElementById('nedtelling').hidden", 8000);
  await t.sov(400);
  await t.bilde("tomt-ark");

  // ---------- Screen 2: drawing — mouse, touch, tools ----------
  t.sjekk((await t.js("getComputedStyle(document.querySelector('.kunst-lerret')).touchAction")) === "none", "Lerretet mangler touch-action: none");
  t.sjekk((await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1")), "Tegneskjermen kan scrolles");
  t.sjekk(await t.js("(() => { const c = document.querySelector('.kunst-lerret'); return c.width >= c.getBoundingClientRect().width * 1.9; })()"), "Lerretet er ikke skarpt på retina (for få piksler)");
  await tegnHus(t);
  t.sjekk((await antallStreker(t)) === 2, "Musestrekene havnet ikke i tilstanden");
  // What you see while drawing must be what is saved: the live canvas vs. a full redraw
  // from the stored strokes (undo + redo), pixel by pixel.
  const likhet = await t.js(`(() => {
    const c = document.querySelector(".kunst-lerret");
    const les = () => c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const levende = les();
    document.querySelector('[data-h="angre"]').click();
    document.querySelector('[data-h="gjenta"]').click();
    const lagret = les();
    let ulik = 0;
    let blekk = 0;
    for (let i = 0; i < levende.length; i += 4) {
      if (Math.abs(levende[i] - 255) + Math.abs(levende[i + 1] - 241) + Math.abs(levende[i + 2] - 221) > 60) blekk++;
      if (Math.abs(levende[i] - lagret[i]) + Math.abs(levende[i + 1] - lagret[i + 1]) + Math.abs(levende[i + 2] - lagret[i + 2]) > 150) ulik++;
    }
    return { ulik, blekk };
  })()`);
  t.sjekk(likhet.blekk > 0 && likhet.ulik < likhet.blekk * 0.04, `Lagret tegning ser annerledes ut enn den som ble tegnet (${likhet.ulik} av ${likhet.blekk} piksler)`);
  await t.klikk('[data-h="farge"][data-v="4"]');
  await t.klikk('[data-h="storrelse"][data-v="1"]');
  await strek(t, sirkel(0.8, 0.16, 0.08), { touch: true });
  await strek(t, linje(0.62, 0.08, 0.68, 0.12, 4), { touch: true });
  const s = (await t.tilstand()).spill;
  t.sjekk(s.strek.length === 4, `Fingerstrekene havnet ikke i tilstanden (${s.strek.length})`);
  t.sjekk(s.strek[2].startsWith("41"), "Gul tykk strek ble ikke lagret med farge og størrelse");
  t.sjekk(s.strek.every((x) => x.length < 400), "Strekene er ikke kompakte");
  t.sjekk((await blekk(t)) > 50, "Strekene vises ikke på lerretet");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await antallStreker(t)) === 3, "Angre fjernet ikke én strek");
  await t.klikk('[data-h="gjenta"]');
  t.sjekk((await antallStreker(t)) === 4, "Gjør om la ikke streken tilbake");
  await t.klikk('[data-h="tom"]');
  t.sjekk((await blekk(t)) === 0, "Tøm tømte ikke arket");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await blekk(t)) > 50 && (await antallStreker(t)) === 4, "Angre etter Tøm hentet ikke tegningen tilbake");
  await t.klikk('[data-h="farge"][data-v="1"]');
  await strek(t, sti([0.3, 0.6], [0.36, 0.6], [0.36, 0.66], [0.3, 0.66], [0.3, 0.6]));
  await t.klikk('[data-h="visk"]');
  await strek(t, linje(0.1, 0.95, 0.9, 0.95, 6));
  t.sjekk((await t.tilstand()).spill.strek.slice(-1)[0].startsWith("x"), "Viskelæret ble ikke lagret");
  await t.klikk('[data-h="farge"][data-v="3"]');
  await strek(t, sti([0.05, 0.92], [0.2, 0.88], [0.35, 0.92], [0.5, 0.88], [0.65, 0.92], [0.8, 0.88], [0.95, 0.92]), { touch: true });

  // Peek at the word while holding the eye
  const slippTitt = await t.hold("#kunst-titt", 300);
  t.sjekk((await t.tekst("#kunst-titt-boble b")).toLowerCase() === andreOrd.toLowerCase(), "Øyet viser ikke ordet");
  // The peek is small and sits by the button, not big in the middle of the sheet the others watch.
  const titt = await t.js(`(() => {
    const b = document.getElementById("kunst-titt-boble").getBoundingClientRect();
    const a = document.querySelector(".kunst-lerret").getBoundingClientRect();
    const cx = a.left + a.width / 2;
    const cy = a.top + a.height / 2;
    const str = parseFloat(getComputedStyle(document.querySelector("#kunst-titt-boble b")).fontSize);
    return { str, midt: b.left < cx && b.right > cx && b.top < cy && b.bottom > cy, hint: document.querySelector("#kunst-titt-boble small").textContent };
  })()`);
  t.sjekk(titt.str <= 18 && !titt.midt && (!t.norsk || /Snu mobilen/.test(titt.hint)), `Ordet vises for stort eller midt på arket (${JSON.stringify(titt)})`);
  await t.bilde("titt");
  await slippTitt();
  t.sjekk(await t.js("document.getElementById('kunst-titt-boble').hidden"), "Ordet forsvant ikke da øyet ble sluppet");
  // Without a finger to hold with (keyboard, screen reader) the eye is a switch that says its state.
  // (What is announced is caught at the kit's R.si, whatever the kit does with it on the page.)
  await t.js(`window.__sagt = []; (() => { const si = Rusj.si; Rusj.si = (tekst) => { window.__sagt.push(String(tekst)); return si(tekst); }; })()`);
  const tittTilstand = () => t.js(`({ skjult: document.getElementById("kunst-titt-boble").hidden, trykket: document.getElementById("kunst-titt").getAttribute("aria-pressed"), sagt: window.__sagt[window.__sagt.length - 1] || "" })`);
  await t.sov(600); // (the click that follows a hold is not a switch)
  await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await t.js(`document.getElementById("kunst-titt").focus()`);
  await tast(t, "Enter", 13, "\r");
  let oye = await tittTilstand();
  t.sjekk(!oye.skjult && oye.trykket === "true" && (!t.norsk || /Ordet vises/.test(oye.sagt)), `Enter på øyet viser ikke ordet og sier fra (${JSON.stringify(oye)})`);
  t.sjekk(!(await t.js(`window.__sagt.join(" ")`)).toLowerCase().includes(andreOrd.toLowerCase()), "Det hemmelige ordet skal aldri leses opp av seg selv");
  await tast(t, "Escape", 27);
  oye = await tittTilstand();
  t.sjekk(oye.skjult && oye.trykket === "false" && (!t.norsk || /skjult/.test(oye.sagt)), `Escape skjuler ikke ordet igjen (${JSON.stringify(oye)})`);
  await t.js(`document.getElementById("kunst-titt").click()`); // a screen reader's activation: a click with no pointer
  t.sjekk(!(await tittTilstand()).skjult, "Et klikk uten finger (skjermleser) viser ikke ordet");
  await t.js(`document.getElementById("kunst-titt").click()`);
  t.sjekk((await tittTilstand()).skjult, "Et nytt klikk skjuler ikke ordet igjen");
  await t.js(`document.activeElement && document.activeElement.blur()`);
  await t.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await t.bilde("tegning");

  // ---------- Reload in the middle of the drawing ----------
  const forReload = await antallStreker(t);
  await t.lastSide(t.side, "document.querySelector('.kunst-lerret')");
  await t.sov(300);
  t.sjekk((await t.js("document.querySelector('#skjerm').className")).includes("skjerm-tegn"), "Tegningen ble ikke gjenopptatt etter omlasting");
  t.sjekk((await antallStreker(t)) === forReload, "Streker forsvant ved omlasting");
  t.sjekk((await blekk(t)) > 50, "Tegningen vises ikke etter omlasting");
  t.sjekk(await t.finnes('.kunst-slor [data-h="fortsett-tegning"]'), "Klokka står ikke på pause etter omlasting");
  await t.bilde("gjenopptatt");
  await t.klikk('[data-h="fortsett-tegning"]');
  await t.sov(300);
  await strek(t, linje(0.5, 0.12, 0.5, 0.2, 4));
  t.sjekk((await antallStreker(t)) === forReload + 1, "Kan ikke tegne videre etter omlasting");

  // ---------- Screen 3: the answer, where the table taps who guessed ----------
  await t.klikk('[data-h="gjettet"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  t.sjekk((await t.js("document.querySelector('#skjerm').className")).includes("skjerm-resultat") && (await t.tekst("#skjerm h1")).toLowerCase() === andreOrd.toLowerCase(), "«Gjettet!» skal gå rett til svaret (tre skjermer per tur)");
  t.sjekk((await t.antall('[data-h="gjetter"]')) === 3 && !(await t.finnes('[data-h="gjetter"][data-v="0"]')), "Svarskjermen skal ha en brikke for hver som kan ha gjettet – ikke tegneren");
  t.sjekk(await t.js(`document.querySelector(".dokk .knapp").disabled`), "«Neste» skal vente til det er valgt hvem som gjettet");
  t.sjekk(await t.friForDokk(".kunst-hvem-valg .velger:last-child"), "Brikkene for hvem som gjettet, havner bak knappene");
  let tilst = await t.tilstand();
  t.sjekk(tilst.spill.poeng.join() === "1,0,0,0", `Tegneren skal ha fått poenget sitt med en gang (${tilst.spill.poeng.join()})`);
  t.sjekk((await t.js(`getComputedStyle(document.querySelector(".kunst-innramming .stempel")).color`)) === "rgb(15, 110, 84)", "«Riktig!»-stempelet på papir er ikke mørkt nok til å leses");
  await t.bilde("hvem-gjettet");
  // A wrong name is put right by tapping the right one: the point moves.
  await t.klikk('[data-h="gjetter"][data-v="2"]');
  t.sjekk((await t.tilstand()).spill.poeng.join() === "1,0,1,0", "Brikken ga ikke poeng til den som gjettet");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  tilst = await t.tilstand();
  t.sjekk(tilst.spill.poeng.join() === "1,1,0,0" && tilst.spill.historikk[0].g === 1, `Poenget flyttet seg ikke da en annen brikke ble valgt (${tilst.spill.poeng.join()})`);
  t.sjekk((await t.js(`document.querySelector('[data-h="gjetter"][data-v="1"]').getAttribute("aria-pressed")`)) === "true" && !(await t.js(`document.querySelector(".dokk .knapp").disabled`)), "Valgt gjetter vises ikke, eller «Neste» åpnet seg ikke");
  t.sjekk((!t.norsk || /Neste: Testspiller B/.test(await t.tekst(".dokk .knapp"))), `Hovedknappen skal være «Neste: Testspiller B» i ren tekst («${await t.tekst(".dokk .knapp")}»)`);
  // The finished drawing has its own storage key and is left out of the save made on every stroke.
  const egen = await lagretNokkel(t, "kunstneren.tegn.0");
  t.sjekk(tilst.spill.historikk[0].s === null && egen && egen.id === tilst.spill.id && egen.s.length === forReload + 1, "Den ferdige tegningen ligger ikke i sin egen nøkkel");
  t.sjekk((await minne(t, "sp.historikk[0].s.length")) === forReload + 1, "Tegningen ble ikke lagret i historikken");
  t.sjekk((await blekk(t, ".kunst-resultat canvas")) > 50, "Tegningen vises ikke på resultatet");
  await t.bilde("resultat");
  await t.lastSide(t.side, "document.querySelector('.kunst-resultat canvas')");
  await t.sov(300);
  t.sjekk((await blekk(t, ".kunst-resultat canvas")) > 50 && (await minne(t, "sp.historikk[0].s.length")) === forReload + 1, "Den ferdige tegningen kom ikke tilbake etter omlasting");
  // «Angre» takes the points back and returns to the drawing (paused)
  await t.klikk('[data-h="angre-poeng"]');
  await t.vent("document.querySelector('.kunst-lerret')");
  tilst = await t.tilstand();
  t.sjekk(tilst.spill.poeng.every((p) => p === 0) && !tilst.spill.historikk.length && tilst.spill.strek.length === forReload + 1, "«Angre» tok ikke poengene tilbake");
  t.sjekk(await t.finnes('.kunst-slor [data-h="fortsett-tegning"]'), "Etter «Angre» skal tegningen stå på pause");
  await t.klikk('[data-h="gjettet"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  t.sjekk((await t.tilstand()).spill.poeng.join() === "1,1,0,0", "Poengene ble ikke gitt på nytt etter «Angre»");
  t.sjekk((!t.norsk || /Godt jobba! \+1 til Testspiller B og Testspiller A – gjettet på \d+ sekund/.test(await t.tekst(".kunst-pluss"))), "Resultatlinja følger ikke felles ordbruk");
  t.sjekk((await lagretNokkel(t, "kunstneren.tegn.0")).s.length === forReload + 1, "Tegningen ble ikke skrevet på nytt etter «Angre»");

  // ---------- Time runs out — on a drawing with a «Kunstnerkrav» (the dice are held for the test) ----------
  await nesteMedTerning(t, 0);
  await t.vent("document.querySelector('.mappe')");
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Neste tegner er ikke Testspiller B");
  t.sjekk((!t.norsk || /Tegn med feil hånd/.test(await t.tekst(".kunst-krav"))) && (await t.tilstand()).spill.krav === 0, "Kunstnerkravet vises ikke på overleveringen");
  t.sjekk(await t.friForDokk(".mappe"), "Kortet med ordet havner bak knappene når et kunstnerkrav vises");
  await t.bilde("gi-mobilen-krav");
  await startTegning(t);
  t.sjekk((!t.norsk || /Feil hånd/i.test(await t.tekst(".kunst-hvem small"))), "Kunstnerkravet står ikke på tegneskjermen");
  await t.bilde("tegning-krav");
  await tegnHus(t, { touch: true });
  await t.js("Rusj.timer('kunst-tid').leggTil(-200)");
  await t.vent("document.querySelector('.kunst-slor.ute')", 4000);
  await t.sov(300);
  const forLas = await antallStreker(t);
  await strek(t, linje(0.2, 0.2, 0.8, 0.8, 6), { touch: true });
  t.sjekk((await antallStreker(t)) === forLas, "Man kan tegne etter at tiden er ute");
  t.sjekk((await t.js(`getComputedStyle(document.querySelector(".kunst-slor.ute .stempel")).color`)) === "rgb(181, 35, 88)", "«Tiden er ute!»-stempelet på papir er ikke mørkt nok til å leses");
  await t.bilde("tiden-ute");
  await t.klikk('[data-h="ingen"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  t.sjekk((!t.norsk || /Uløst/i.test(await t.tekst(".kunst-resultat"))), "Mangler «Uløst» når ingen gjettet");
  t.sjekk(!(await t.finnes('[data-h="gjetter"]')) && !(await t.js(`document.querySelector(".dokk .knapp").disabled`)), "Ingen gjettet: da skal det ikke spørres om hvem, og «Neste» skal være klar");
  t.sjekk((await t.js(`getComputedStyle(document.querySelector(".kunst-innramming .stempel")).color`)) === "rgb(181, 35, 88)", "«Uløst»-stempelet på papir er ikke mørkt nok til å leses");
  t.sjekk((!t.norsk || /feil hånd/.test(await t.tekst(".kunst-kravlinje"))) && (await t.tilstand()).spill.historikk[1].krav === 0, "Svarskjermen forteller ikke hvilket kunstnerkrav tegningen hadde");
  await t.bilde("ingen-gjettet");

  // ---------- Back + continue ----------
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.kunst-resultat')");

  // ---------- Give up (with confirmation) ----------
  await nesteMedTerning(t, 0);
  await t.vent("document.querySelector('.mappe')");
  t.sjekk((await t.tilstand()).spill.krav === -1 && !(await t.finnes(".kunst-krav")), "To tegninger på rad skal aldri få kunstnerkrav");
  await startTegning(t);
  await strek(t, sirkel(0.5, 0.5, 0.3), { touch: true });
  await t.klikk('[data-h="ingen"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  t.sjekk((await t.tilstand()).spill.historikk.length === 3, "Tre tegninger skulle være spilt");

  // ---------- «Avslutt» asks first; then Kåringen with podium and exhibition ----------
  t.sjekk(!(await t.finnes('[data-h="slutt"]')), "Lenken for å avslutte skal hete «Avslutt» og spørre først");
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  t.sjekk(!t.norsk || ((await t.tekst('#ark [data-v="nei"]')) === "Spill videre" && (await t.tekst('#ark [data-v="ja"]')) === "Avslutt"), "Arket for «Avslutt» skal ha knappene «Avslutt» og «Spill videre»");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(await t.finnes(".kunst-resultat") && !(await t.tilstand()).spill.ferdig, "«Spill videre» i Avslutt-arket avsluttet likevel");
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.pall')");
  t.sjekk(!t.norsk || (await t.js("document.getElementById('topp-tittel').textContent")) === "Kåringen", "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk((!t.norsk || /Testspiller A og Testspiller B/.test(await t.tekst("#skjerm h1"))), "Delt seier vises ikke");
  t.sjekk((await t.antall(".kunst-galleri .kunst-flis")) === 3, "Utstillingen viser ikke tre tegninger");
  t.sjekk((await t.antall(".kunst-flis-krav")) === 1 && (!t.norsk || /Feil hånd/.test(await t.tekst(".kunst-flis-krav"))), "Utstillingen merker ikke tegningen som hadde et kunstnerkrav");
  t.sjekk((!t.norsk || /vinner!/.test(await t.tekst("#skjerm h1"))), "Vinnerlinja sier ikke «… vinner!»");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk(await t.finnes(".banner .figur-ramme.jubel"), "Figuren jubler ikke for vinnerne");
  // The share button sits in the page after the scoreboard; the dock has «Spill igjen» and the links.
  t.sjekk((await t.finnes('#skjerm > [data-h="lag-bilde"]')) && !(await t.finnes('.dokk [data-h="lag-bilde"]')) && (await t.antall(".dokk .knapp, .dokk .knapp-2")) === 1, "Deleknappen skal stå i innholdet, og dokken bare ha «Spill igjen» og lenkene");
  // The game is reported once: statistics, the evening's scoreboard and the record.
  const ferdig = await hendelser(t, "ferdig");
  t.sjekk(ferdig.length === 1 && ferdig[0].modus === "tegn" && ferdig[0].tegninger === 3 && ferdig[0].gjettet === 1, `Statistikken fikk ikke ett «ferdig» med riktige tall (${JSON.stringify(ferdig)})`);
  const kveld = await lagretNokkel(t, "kveld");
  t.sjekk(kveld && kveld.spill.length === 1 && kveld.spill[0].id === "kunstneren" && kveld.spill[0].resultat.length === 4 && kveld.spill[0].resultat.filter((r) => r.plass === 1).length === 2, `Kåringen ble ikke meldt til «Kveldens gjeng» (${JSON.stringify(kveld && kveld.spill)})`);
  const rekord = await lagretNokkel(t, "kunstneren.rekord");
  t.sjekk(rekord && rekord.raskest && rekord.raskest.sek >= 1 && rekord.raskest.ord.toLowerCase() === andreOrd.toLowerCase(), `Raskeste gjetning ble ikke lagret som rekord (${JSON.stringify(rekord)})`);
  await t.klikk('.kunst-flis[data-v="t0"]', 600);
  t.sjekk(await t.finnes(".kunst-flis .kunst-ark.spiller"), "Tegningen spilles ikke av");
  await t.sov(5000);
  t.sjekk((await blekk(t, '.kunst-ark[data-ark="t0"] canvas')) > 50, "Avspillingen tegnet ikke ferdig");
  await t.bilde("slutt", true);
  await delBilde(t, "utstilling-bilde");
  // Kåringen is final: no way back into the game, and the record is on the home screen.
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.tilstand())._aktiv === false, "Etter kåringen skal spillet være ferdig – uten «Fortsett» på hjem-skjermen");
  t.sjekk(new RegExp(`${rekord && rekord.raskest ? rekord.raskest.sek : "x"} s${t.norsk ? "\\s+rekord" : ""}`, "i").test(await t.tekst(".merker")), `Hjem-skjermen viser ikke rekorden («${(await t.tekst(".merker")).replace(/\s+/g, " ")}»)`);
  await t.bilde("hjem-rekord");

  // ---------- Hviskeleken ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "Et ferdig spill skal ikke kreve bekreftelse");
  await t.klikk('[data-h="modus"][data-v="hvisk"]');
  t.sjekk((await t.tilstand()).oppsett.htid === 30, "Hviskeleken skal ha 30 sekunder per tegning som standard");
  await t.bilde("oppsett-hviskeleken", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  // Four players: everyone once, and the next player in the list starts this game.
  t.sjekk((await t.tilstand()).spill.rekke.join() === "1,2,3,0", `Kjeden med fire spillere skal ha fire steg, alle én gang, og neste spiller skal begynne (${(await t.tilstand()).spill.rekke.join()})`);
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")) && (await t.finnes('[data-h="avslutt"]')), "Kjeden starter ikke hos Testspiller B, eller «Avslutt» mangler");
  t.sjekk((await lagretNokkel(t, "kunstneren.tegn.0")) === null, "Tegningene fra forrige spill ble ikke ryddet bort da et nytt startet");
  await t.bilde("h-gi-mobilen");
  await t.klikk('[data-h="hjeg"]');
  await t.vent("document.querySelector('.kunst-lerret')");
  await t.sov(300);
  const startord = (await t.tilstand()).spill.ord.o;
  t.sjekk((await t.tekst("#skjerm h1")).toLowerCase() === startord.toLowerCase(), "Første tegner ser ikke startordet");
  t.sjekk(!(await t.js("Rusj.timer('kunst-tid').kjorer")), "Klokka går før første strek");
  const arkFor = JSON.stringify(await rekt(t));
  await tegnHus(t);
  t.sjekk(JSON.stringify(await rekt(t)) === arkFor, "Arket flyttet seg da første strek startet klokka");
  t.sjekk(await t.js("Rusj.timer('kunst-tid').kjorer"), "Klokka startet ikke ved første strek");
  await t.klikk('[data-h="farge"][data-v="1"]');
  await strek(t, sirkel(0.5, 0.2, 0.07));
  await t.bilde("h-tegn");
  await t.klikk('[data-h="hferdig"]');
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  t.sjekk(/Testspiller C/.test(await t.tekst("#skjerm h1")), "Mobilen går ikke videre til Testspiller C");
  t.sjekk(await t.finnes('[data-h="avslutt"]'), "«Avslutt» skal finnes på hver overlevering i Hviskeleken, ikke bare den første");
  tilst = await t.tilstand();
  t.sjekk(tilst.spill.steg[0].s === null && ((await lagretNokkel(t, "kunstneren.tegn.0")) || {}).id === tilst.spill.id, "Tegningen i kjeden ligger ikke i sin egen nøkkel");
  await t.klikk('[data-h="hjeg"]');
  await t.vent("document.querySelector('#kunst-gjett')");
  await t.sov(400);
  t.sjekk(!(await t.tekst("#skjerm")).toLowerCase().includes(startord.toLowerCase()), "Gjetteren ser startordet");
  t.sjekk((await blekk(t, ".kunst-gjettbilde canvas")) > 50, "Gjetteren ser ikke tegningen");
  t.sjekk(await t.js("document.getElementById('kunst-send').disabled"), "Send videre skulle være av uten tekst");
  await t.skrivInn("#kunst-gjett", "Ketchup <b>&</b> sennep");
  await t.bilde("h-gjett");
  await t.klikk("#kunst-send");
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  await t.klikk('[data-h="hjeg"]');
  await t.vent("document.querySelector('.kunst-lerret')");
  await t.sov(300);
  t.sjekk((await t.tekst("#skjerm h1")) === "Ketchup <b>&</b> sennep", "Tredje spiller ser ikke gjetningen som ren tekst");
  t.sjekk(!(await t.finnes("#skjerm h1 b")), "Gjetningen ble tolket som HTML");
  await strek(t, sti([0.15, 0.7], [0.15, 0.4], [0.85, 0.4], [0.85, 0.7], [0.15, 0.7]), { touch: true });
  await strek(t, sirkel(0.3, 0.74, 0.07), { touch: true });
  await strek(t, sirkel(0.7, 0.74, 0.07), { touch: true });
  // A reload must not show the secret to whoever holds the phone: back through "Jeg er …".
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="hjeg"]'), "Omlasting midt i Hviskeleken hoppet over «Jeg er …»");
  t.sjekk(!(await t.tekst("#skjerm")).includes("Ketchup"), "Det hemmelige ordet vises før «Jeg er …»");
  await t.klikk('[data-h="hjeg"]');
  await t.vent("document.querySelector('.kunst-lerret')");
  await t.sov(300);
  t.sjekk((await antallStreker(t)) === 3 && (await blekk(t)) > 50, "Hviskeleken-tegningen overlevde ikke omlasting");
  t.sjekk((await minne(t, "sp.steg[0].s.length")) === 3, "Den første tegningen i kjeden kom ikke tilbake etter omlasting");
  await t.klikk('[data-h="hferdig"]');
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  await t.klikk('[data-h="hjeg"]');
  await t.vent("document.querySelector('#kunst-gjett')");
  await t.skrivInn("#kunst-gjett", "  ketchup <b>&</b>   SENNEP ");
  await t.klikk("#kunst-send");
  await t.vent("document.querySelector('[data-h=\"vis-kjede\"]')");
  t.sjekk((await t.tilstand()).spill.steg[3].g === "ketchup <b>&</b> SENNEP", "Gjetningen ble ikke ryddet for mellomrom");
  await t.bilde("h-klar");
  await t.klikk('[data-h="vis-kjede"]');
  await t.vent("document.querySelector('.kunst-kjede')");
  t.sjekk((await t.antall(".kunst-ledd")) === 1, "Galleriet skal starte med bare startordet");
  await t.klikk('[data-h="vis-neste"]', 700);
  t.sjekk(await t.finnes('.kunst-ark[data-ark="h0"].spiller'), "Tegningen spilles ikke av når den vises");
  await t.bilde("h-galleri-avspilling");
  await t.sov(5200);
  t.sjekk((await blekk(t, '.kunst-ark[data-ark="h0"] canvas')) > 50, "Avspillingen i galleriet tegnet ikke ferdig");
  // «Vis neste» only adds the new link: drawings already shown keep their canvas (memory).
  await t.js(`document.querySelector('.kunst-ark[data-ark="h0"] canvas').dataset.merke = "beholdt"`);
  await t.klikk('[data-h="vis-neste"]', 400);
  t.sjekk((await t.js(`document.querySelector('.kunst-ark[data-ark="h0"] canvas').dataset.merke`)) === "beholdt", "«Vis neste» tegnet hele galleriet på nytt");
  t.sjekk((await t.tekst(".kunst-kjede")).includes("Ketchup <b>&</b> sennep"), "Gjetningen vises ikke som ren tekst i galleriet");
  await t.lastSide(t.side, "document.querySelector('.kunst-kjede')");
  t.sjekk((await t.antall(".kunst-ledd")) === 3, "Galleriet husket ikke hvor langt det var kommet");
  await t.klikk('[data-h="vis-neste"]', 400);
  await t.klikk('[data-h="vis-neste"]', 1500);
  t.sjekk((await t.antall(".kunst-ledd")) === 5 && (await t.finnes('[data-h="hkaring"]')), "Hele kjeden vises ikke til slutt");
  t.sjekk(!(await t.finnes(".kunst-boble b")), "Spillertekst ble tolket som HTML");
  t.sjekk((await t.antall(".kunst-boble.treff")) === 1, "Gjetningen som traff, er ikke merket");
  await t.sov(4000);
  await t.bilde("h-galleri", true);
  // The finale is its own moment: stamp and «from … to …» fully visible above the dock.
  await t.klikk('[data-h="hkaring"]');
  await t.vent("document.querySelector('.kunst-finale')");
  await t.sov(500);
  const finale = await t.js(`(() => {
    const s = document.querySelector(".kunst-finale .stempel").getBoundingClientRect();
    const p = document.querySelector(".kunst-finale-par").getBoundingClientRect();
    const d = document.querySelector(".dokk").getBoundingClientRect();
    // Above the dock — or, on a phone on its side where the dock is a column on the right, beside it and inside the screen.
    const fri = (r) => (r.right <= d.left + 1 || r.left >= d.right - 1 ? r.bottom <= window.innerHeight + 1 : r.bottom <= d.top);
    return { stempel: s.top >= 0 && fri(s), par: fri(p), dokkKnapper: document.querySelectorAll(".dokk .knapp, .dokk .knapp-2").length };
  })()`);
  t.sjekk(finale.stempel && finale.par && finale.dokkKnapper === 1, `Finalen havner under knappene (${JSON.stringify(finale)})`);
  t.sjekk((t.norsk ? /1 av 2/ : /1\D+2/).test(await t.tekst(".kunst-finale")), "Finalen teller ikke treffene");
  t.sjekk((await t.tilstand()).spill.ferdig === true, "Kjeden er ikke ferdig etter kåringen");
  t.sjekk((await hendelser(t, "ferdig")).some((d) => d.modus === "hvisk" && d.steg === 4 && d.traff === 1), "Statistikken fikk ikke vite at kjeden ble ferdig");
  t.sjekk((await lagretNokkel(t, "kveld")).spill.length === 1, "En kjede har ingen rangering og skal ikke meldes til «Kveldens gjeng»");
  await t.bilde("h-kaaring", true);
  await delBilde(t, "kjede-bilde");
  await t.klikk('[data-h="hny"]');
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  t.sjekk(/Testspiller C/.test(await t.tekst("#skjerm h1")), "Ny kjede starter ikke med neste spiller");

  // ---------- A game in progress is kept; «Avslutt» in a chain shows it as far as it came ----------
  await t.klikk("#tilbake");
  t.sjekk((!t.norsk || /Fortsett/.test(await t.tekst(".hjem-knapper .knapp"))), "«Fortsett» er ikke hovedknappen mens et spill pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spør ikke før et pågående spill kastes");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.tilstand()).spill && (await t.tilstand()).spill.modus === "hvisk", "«Avbryt» kastet spillet likevel");
  await t.klikk('[data-h="fortsett"]');
  await kjedesteg(t, 0);
  await kjedesteg(t, 1, "en liten sol");
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  t.sjekk(!t.norsk || (/så langt/.test(await t.tekst("#ark")) && (await t.tekst('#ark [data-v="nei"]')) === "Spill videre"), "«Avslutt» midt i en kjede skal tilby å vise kjeden så langt, og «Spill videre»");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.kunst-kjede')");
  tilst = await t.tilstand();
  t.sjekk(tilst.spill.rekke.join() === "2,3" && tilst.spill.steg.length === 2, `En avbrutt kjede skal vises med stegene som ble spilt (${tilst.spill.rekke.join()})`);
  await t.klikk('[data-h="vis-neste"]', 300);
  await t.klikk('[data-h="vis-neste"]', 900);
  await t.klikk('[data-h="hkaring"]');
  await t.vent("document.querySelector('.kunst-finale')");
  t.sjekk((!t.norsk || /Så langt kom kjeden/i.test(await t.tekst(".kunst-finale"))) && /en liten sol/.test(await t.tekst(".kunst-finale")), "Finalen for en avbrutt kjede viser ikke det siste svaret");

  // ---------- Team mode ----------
  await t.klikk("#tilbake");
  await nyttSpill(t);
  await t.klikk('[data-h="modus"][data-v="tegn"]');
  if (!(await t.finnes(".kunst-mer.apen"))) await t.klikk('[data-h="mer"]');
  await t.klikk('[data-h="lag"][data-v="2"]');
  t.sjekk(await t.finnes(".kunst-lagliste"), "Laglista vises ikke");
  await t.bilde("oppsett-lag", true);
  await t.klikk('[data-h="start"]');
  await startTegning(t);
  await tegnHus(t);
  await t.klikk('[data-h="gjettet"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  tilst = await t.tilstand();
  // The fourth game of the evening: the fourth player draws first, for her team (Lag Gul).
  t.sjekk(tilst.spill.lag === 2 && tilst.spill.tegner === 3 && tilst.spill.poeng.join() === "0,1", `Laget til tegneren fikk ikke poenget, eller tegneren roterte ikke (${JSON.stringify({ tegner: tilst.spill.tegner, poeng: tilst.spill.poeng })})`);
  t.sjekk(!(await t.finnes('[data-h="gjetter"]')) && !(await t.js(`document.querySelector(".dokk .knapp").disabled`)), "Med lag skal det ikke spørres om hvem som gjettet");
  await t.bilde("lag-resultat");

  // ---------- Hviskeleken with an odd number: everyone once, and the table takes the last guess ----------
  await t.klikk("#tilbake");
  await nyttSpill(t);
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.klikk('[data-h="modus"][data-v="hvisk"]');
  t.sjekk((!t.norsk || /^3 tegninger og 3 gjetninger/.test(await t.tekst(".kunst-estimat"))) && (!t.norsk || /hele bordet/.test(await t.tekst("#spillerboks .hjelp"))), `Oppsettet for fem spillere forteller ikke om bordets gjetning («${await t.tekst(".kunst-estimat")}»)`);
  await t.klikk('[data-h="start"]');
  const femkjede = (await t.tilstand()).spill.rekke;
  t.sjekk(femkjede.length === 6 && femkjede[5] === -1 && new Set(femkjede.slice(0, 5)).size === 5, `Med fem spillere skal alle være med én gang, og bordet ta siste gjetning (${femkjede.join()})`);
  for (let k = 0; k < 5; k++) await kjedesteg(t, k);
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  t.sjekk((!t.norsk || /Samle gjengen/.test(await t.tekst("#skjerm h1"))) && (!t.norsk || /Vis tegningen/.test(await t.tekst('[data-h="hjeg"]'))) && (await t.finnes('[data-h="avslutt"]')), "Siste tegning skal gå til hele bordet («Samle gjengen!»)");
  await t.bilde("h-bordet-samles");
  await t.klikk('[data-h="hjeg"]');
  await t.vent("document.querySelector('#kunst-gjett')");
  await t.sov(400);
  t.sjekk((!t.norsk || /Hva tror dere dette er\?/.test(await t.tekst("#skjerm h1"))) && (!t.norsk || /holder tett/.test(await t.tekst(".kunst-vet"))), "Bordets gjetning spør ikke «Hva tror dere dette er?»");
  t.sjekk((await blekk(t, ".kunst-gjettbilde canvas")) > 50, "Bordet ser ikke den siste tegningen");
  await t.bilde("h-bordet-gjetter");
  await t.skrivInn("#kunst-gjett", "en rund ting");
  await t.klikk("#kunst-send");
  await t.vent("document.querySelector('.kunst-kjede')"); // everyone is gathered already: straight to the chain
  for (let k = 0; k < 6; k++) await t.klikk('[data-h="vis-neste"]', 250);
  t.sjekk((await t.antall(".kunst-ledd")) === 7 && (!t.norsk || /Hele bordet\s+gjettet/.test(await t.tekst(".kunst-ledd:last-child"))) && /en rund ting/.test(await t.tekst(".kunst-ledd:last-child")), "Bordets gjetning er ikke siste ledd i kjeden");
  await t.sov(900);
  await t.bilde("h-galleri-bordet", true);
  await t.klikk('[data-h="hkaring"]');
  await t.vent("document.querySelector('.kunst-finale')");
  t.sjekk(/en rund ting/.test(await t.tekst(".kunst-finale")) && (!t.norsk || /gjetning/.test(await t.tekst(".kunst-dom"))), "Finalen bruker ikke bordets gjetning som siste svar");
  await delBilde(t, "kjede-bilde-bordet");

  // ---------- Fewer than four: Hviskeleken is switched off (it used to hand a guesser a drawing of their own guess) ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('[data-h=\"start\"]')");
  await t.klikk('[data-h="spiller-fjern"][data-v="4"]');
  t.sjekk((await t.tilstand()).oppsett.modus === "hvisk", "Med fire spillere skal Hviskeleken fortsatt være valgt");
  await t.klikk('[data-h="spiller-fjern"][data-v="3"]');
  tilst = await t.tilstand();
  const flis = await t.js(`(() => { const f = document.querySelector('[data-h="modus"][data-v="hvisk"]'); return { av: f.disabled, tekst: f.innerText, valgt: document.querySelector('[data-h="modus"][data-v="tegn"]').getAttribute("aria-pressed") }; })()`);
  t.sjekk(tilst.oppsett.modus === "tegn" && flis.av && (!t.norsk || /Trenger fire eller flere/.test(flis.tekst)) && flis.valgt === "true", `Med tre spillere skal Hviskeleken være slått av, og Tegn og gjett valgt (${JSON.stringify(flis)})`);
  t.sjekk((!t.norsk || /fire spillere/.test(await t.tekst("#toast"))), "Det sies ikke fra om at Hviskeleken trenger fire spillere");
  await t.js(`document.querySelector('[data-h="modus"][data-v="hvisk"]').click()`);
  t.sjekk((await t.tilstand()).oppsett.modus === "tegn" && (!t.norsk || /tegninger · ca\./.test(await t.tekst(".kunst-estimat"))), "Hviskeleken lot seg velge med tre spillere");
  await t.bilde("oppsett-tre-spillere", true);

  // ---------- Two players play together: no shared «win», a record to beat instead ----------
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  t.sjekk((await t.tilstand()).oppsett.lag === 0, "Lag ble ikke slått av med for få spillere");
  t.sjekk((!t.norsk || /spiller sammen/.test(await t.tekst("#spillerboks .hjelp"))), "Oppsettet sier ikke at to spillere spiller sammen");
  await t.bilde("oppsett-to-spillere", true);
  await t.klikk('[data-h="start"]');
  await startTegning(t);
  await strek(t, sirkel(0.5, 0.4, 0.2), { touch: true });
  // A full sketchbook stops drawing with a friendly message (localStorage is small and shared).
  const forFull = await antallStreker(t);
  await t.js(`Rusj.S.spill.historikk.push({ t: 1, o: Rusj.S.spill.ord, s: ["00" + "A".repeat(1499990)], ok: false, g: -1, sek: 1, pluss: {} })`);
  await strek(t, linje(0.2, 0.7, 0.8, 0.7, 6), { touch: true });
  t.sjekk((await antallStreker(t)) === forFull && (!t.norsk || /fullt/.test(await t.tekst("#toast"))), "Full skissebok stoppet ikke tegningen med en beskjed");
  await t.js(`Rusj.S.spill.historikk.pop()`);
  await t.klikk('[data-h="gjettet"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  tilst = await t.tilstand();
  t.sjekk(tilst.spill.antall === 2 && tilst.spill.samarbeid === true && tilst.spill.poeng.join() === "0,0", `To spillere skal spille sammen, uten poeng til hver (${tilst.spill.poeng.join()})`);
  t.sjekk(!(await t.finnes('[data-h="gjetter"]')) && !(await t.finnes(".poengliste")) && (await t.tekst(".kunst-duo-tall b")) === "1", "Svarskjermen for to skal vise hva de har klart sammen, ikke en poengliste");
  t.sjekk(JSON.stringify(tilst).length < 30000, `Tilstanden er for stor (${JSON.stringify(tilst).length} tegn)`);
  await t.bilde("duo-svar");
  await t.klikk('[data-h="neste"]');
  await startTegning(t);
  await strek(t, sirkel(0.5, 0.5, 0.25), { touch: true });
  await t.klikk('[data-h="ingen"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  t.sjekk((!t.norsk || /Til kåringen/.test(await t.tekst(".dokk .knapp"))), `Etter siste tegning skal hovedknappen hete «Til kåringen» («${await t.tekst(".dokk .knapp")}»)`);
  await t.klikk('[data-h="slutt"]');
  await t.vent("document.querySelector('.banner')");
  let duo = await t.tekst("#skjerm h1");
  t.sjekk((!t.norsk || /Dere klarte 1 av 2/.test(duo)) && !/vinner/.test(await t.tekst(".banner")) && !(await t.finnes(".pall")) && !(await t.finnes(".poengliste")), `To spillere skal ikke ende i delt seier («${duo}»)`);
  t.sjekk((!t.norsk || /rekord å slå/.test(await t.tekst(".banner"))), "Første spill for to skal gi en rekord å slå");
  t.sjekk(((await lagretNokkel(t, "kunstneren.rekord")).duo || {})["2-60"] === 1, `Rekorden for to ble ikke lagret (${JSON.stringify(await lagretNokkel(t, "kunstneren.rekord"))})`);
  t.sjekk((await lagretNokkel(t, "kveld")).spill.length === 1, "Et spill for to har ingen vinner og skal ikke meldes til «Kveldens gjeng»");
  t.sjekk((!t.norsk || (await t.js("document.getElementById('topp-tittel').textContent")) === "Kåringen") && (await t.tilstand())._aktiv === false, "Spillet for to endte ikke i en ferdig kåring");
  await t.bilde("duo-kaaring", true);

  // Once more — both drawings guessed this time — with the small and sideways screens on the way.
  await t.klikk('[data-h="igjen"]');
  await startTegning(t);
  await strek(t, sirkel(0.5, 0.4, 0.2), { touch: true });
  await t.klikk('[data-h="gjettet"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  t.sjekk((!t.norsk || /Rekorden deres: 1 av 2/.test(await t.tekst(".kunst-duo"))), "Svarskjermen for to viser ikke rekorden de jakter på");

  // ---------- Small and sideways screens ----------
  await t.klikk('[data-h="neste"]');
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await startTegning(t);
  await tegnHus(t, { touch: true });
  const liten = await t.js(`(() => {
    const d = document.querySelector(".dokk").getBoundingClientRect();
    const a = document.querySelector(".kunst-ark").getBoundingClientRect();
    return { bred: document.documentElement.scrollWidth - innerWidth, dokk: d.bottom - innerHeight, ark: a.width, scroll: document.documentElement.scrollHeight - innerHeight };
  })()`);
  t.sjekk(liten.bred <= 0, `Sidelengs scrolling på 320 px (${liten.bred} px)`);
  t.sjekk(liten.dokk <= 1 && liten.scroll <= 1, `Tegneskjermen får ikke plass på 320×568 (${JSON.stringify(liten)})`);
  t.sjekk(liten.ark >= 150, `Arket blir for lite på 320×568 (${liten.ark} px)`);
  await t.bilde("liten-skjerm");
  await t.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await t.sov(500);
  const ligg = await t.js(`(() => {
    const d = document.querySelector(".dokk").getBoundingClientRect();
    const a = document.querySelector(".kunst-ark").getBoundingClientRect();
    const verktoy = Array.from(document.querySelectorAll(".kunst-verktoy button")).map((b) => b.getBoundingClientRect());
    return { dokk: d.bottom - innerHeight, ark: a.height, arkBunn: a.bottom - innerHeight, utenfor: verktoy.filter((b) => b.right > innerWidth || b.bottom > innerHeight).length };
  })()`);
  t.sjekk(ligg.dokk <= 1 && ligg.ark >= 200 && ligg.arkBunn <= 0 && !ligg.utenfor, `Tegneskjermen virker ikke liggende (${JSON.stringify(ligg)})`);
  // A laptop: the sheet gets the full height, the tools sit beside it.
  await t.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await t.sov(500);
  const pc = await t.js(`(() => {
    const d = document.querySelector(".dokk").getBoundingClientRect();
    const a = document.querySelector(".kunst-ark").getBoundingClientRect();
    const knapper = Array.from(document.querySelectorAll(".kunst-verktoy button")).map((b) => b.getBoundingClientRect());
    return { ark: Math.round(a.height), dokk: d.bottom - innerHeight, enRad: (() => { const y = Array.from(document.querySelectorAll(".kunst-palett button")).map((b) => b.getBoundingClientRect().top); return Math.max(...y) - Math.min(...y) < 12 ? 1 : 2; })(), utenfor: knapper.filter((b) => b.right > innerWidth || b.bottom > innerHeight).length };
  })()`);
  t.sjekk(pc.ark >= 600 && pc.dokk <= 1 && pc.enRad === 1 && !pc.utenfor, `Tegneskjermen på PC er ikke som den skal (${JSON.stringify(pc)})`);
  await t.send("Emulation.setDeviceMetricsOverride", { width: skjerm.b, height: skjerm.h, deviceScaleFactor: 2, mobile: true }); // back to the size of this run
  await t.sov(400);
  t.sjekk((await blekk(t)) > 50, "Tegningen forsvant da skjermen ble snudd");

  // ---------- …and the two beat their record ----------
  await t.klikk('[data-h="gjettet"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  await t.klikk('[data-h="slutt"]');
  await t.vent("document.querySelector('.banner')");
  duo = await t.tekst(".banner");
  t.sjekk((!t.norsk || /Dere klarte 2 av 2/.test(duo)) && (!t.norsk || /Ny rekord!/i.test(duo)) && (await t.finnes(".banner .figur-ramme.jubel")), `Ny rekord for to ble ikke feiret («${duo.replace(/\s+/g, " ")}»)`);
  t.sjekk((await lagretNokkel(t, "kunstneren.rekord")).duo["2-60"] === 2, "Den nye rekorden for to ble ikke lagret");
  await t.bilde("duo-rekord", true);
}
