// Kunstneren: play "Tegn og gjett" with real mouse and touch strokes (tools, undo/redo/clear,
// saved = drawn pixel check, peek, reload mid-drawing, time up, give up, back + continue, final
// exhibition + share picture), then a full "Hviskeleken" chain (secrets behind "Jeg er …" after a
// reload, escaping, the stroke-by-stroke replay gallery), team mode, two players, small and
// sideways screens.

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
  t.sjekk(/lastet ned/i.test(await t.tekst("#toast")), "«Last ned» ga ingen beskjed");
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

export default async function (t) {
  // Player D has a very long name: every screen must wrap or shorten it, never overflow.
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller Dobbeltnavn-Langnavnesen"] });

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4, "Spillerlista viser ikke fire spillere");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="mer"]');
  await t.klikk('[data-h="runder"][data-v="1"]');
  t.sjekk(await t.finnes(".kunst-mer.apen"), "«Flere valg» lukket seg etter et valg");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  t.sjekk(await t.js("document.querySelector('[data-h=\"start\"]').disabled"), "Start skulle være av uten kategorier");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  await t.bilde("oppsett-flere-valg", true);
  await t.klikk('[data-h="start"]');

  // ---------- Tegn og gjett: the secret word ----------
  await t.vent("document.querySelector('.mappe')");
  t.sjekk(await t.js("document.querySelector('[data-h=\"tegn-start\"]').disabled"), "Tegningen kan startes uten å ha sett ordet");
  t.sjekk((await t.js("document.getElementById('topp-tittel').textContent")) === "Tegning 1/4", "Tittelen øverst skal være kort («Tegning 1/4»)");
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
  await t.klikk('[data-h="tegn-start"]', 50);
  await t.vent("document.querySelector('.kunst-lerret') && document.getElementById('nedtelling').hidden", 8000);
  await t.sov(400);
  await t.bilde("tomt-ark");

  // ---------- Drawing: mouse, touch, tools ----------
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
  t.sjekk(titt.str <= 18 && !titt.midt && /Snu mobilen/.test(titt.hint), `Ordet vises for stort eller midt på arket (${JSON.stringify(titt)})`);
  await t.bilde("titt");
  await slippTitt();
  t.sjekk(await t.js("document.getElementById('kunst-titt-boble').hidden"), "Ordet forsvant ikke da øyet ble sluppet");
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

  // ---------- Guessed! ----------
  await t.klikk('[data-h="gjettet"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  t.sjekk(!(await t.finnes('[data-h="gjetter"][data-v="0"]')), "Tegneren kan velges som gjetter");
  await t.bilde("hvem-gjettet");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  let tilst = await t.tilstand();
  t.sjekk(tilst.spill.poeng[1] === 1 && tilst.spill.poeng[0] === 1, "Gjetter og tegner fikk ikke 1 poeng hver");
  t.sjekk(tilst.spill.historikk[0].s.length === forReload + 1, "Tegningen ble ikke lagret i historikken");
  t.sjekk((await blekk(t, ".kunst-resultat canvas")) > 50, "Tegningen vises ikke på resultatet");
  await t.bilde("resultat");
  // «Angre» takes the points back and returns to the choice
  await t.klikk('[data-h="angre-poeng"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  tilst = await t.tilstand();
  t.sjekk(tilst.spill.poeng.every((p) => p === 0) && !tilst.spill.historikk.length && tilst.spill.strek.length === forReload + 1, "«Angre» tok ikke poengene tilbake");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  t.sjekk((await t.tilstand()).spill.poeng.join() === "1,1,0,0", "Poengene ble ikke gitt på nytt etter «Angre»");
  t.sjekk(/Godt jobba! \+1 til Testspiller B og Testspiller A – gjettet på \d+ sekund/.test(await t.tekst(".kunst-pluss")), "Resultatlinja følger ikke felles ordbruk");

  // ---------- Time runs out ----------
  await t.klikk('[data-h="neste"]');
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Neste tegner er ikke Testspiller B");
  await startTegning(t);
  await tegnHus(t, { touch: true });
  await t.js("Rusj.timer('kunst-tid').leggTil(-200)");
  await t.vent("document.querySelector('.kunst-slor.ute')", 4000);
  await t.sov(300);
  const forLas = await antallStreker(t);
  await strek(t, linje(0.2, 0.2, 0.8, 0.8, 6), { touch: true });
  t.sjekk((await antallStreker(t)) === forLas, "Man kan tegne etter at tiden er ute");
  await t.bilde("tiden-ute");
  await t.klikk('[data-h="ingen"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  t.sjekk(/Uløst/i.test(await t.tekst(".kunst-resultat")), "Mangler «Uløst» når ingen gjettet");
  await t.bilde("ingen-gjettet");

  // ---------- Back + continue ----------
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.kunst-resultat')");

  // ---------- Give up (with confirmation) ----------
  await t.klikk('[data-h="neste"]');
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
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(await t.finnes(".kunst-resultat") && !(await t.tilstand()).spill.ferdig, "«Fortsett» i Avslutt-arket avsluttet likevel");
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.pall')");
  t.sjekk((await t.js("document.getElementById('topp-tittel').textContent")) === "Kåringen", "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(/Testspiller A og Testspiller B/.test(await t.tekst("#skjerm h1")), "Delt seier vises ikke");
  t.sjekk((await t.antall(".kunst-galleri .kunst-flis")) === 3, "Utstillingen viser ikke tre tegninger");
  t.sjekk(/vinner!/.test(await t.tekst("#skjerm h1")), "Vinnerlinja sier ikke «… vinner!»");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  await t.klikk('.kunst-flis[data-v="t0"]', 600);
  t.sjekk(await t.finnes(".kunst-flis .kunst-ark.spiller"), "Tegningen spilles ikke av");
  await t.sov(5000);
  t.sjekk((await blekk(t, '.kunst-ark[data-ark="t0"] canvas')) > 50, "Avspillingen tegnet ikke ferdig");
  await t.bilde("slutt", true);
  await delBilde(t, "utstilling-bilde");

  // ---------- Hviskeleken ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "Et ferdig spill skal ikke kreve bekreftelse");
  await t.klikk('[data-h="modus"][data-v="hvisk"]');
  await t.bilde("oppsett-hviskeleken", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  t.sjekk((await t.tilstand()).spill.rekke.length === 4, "Kjeden med fire spillere skal ha fire steg");
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
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Mobilen går ikke videre til Testspiller B");
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
  t.sjekk((await t.tekst(".kunst-kjede")).includes("«Ketchup <b>&</b> sennep»"), "Gjetningen vises ikke som ren tekst i galleriet");
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
  t.sjekk(/1 av 2/.test(await t.tekst(".kunst-finale")), "Finalen teller ikke treffene");
  t.sjekk((await t.tilstand()).spill.ferdig === true, "Kjeden er ikke ferdig etter kåringen");
  await t.bilde("h-kaaring", true);
  await delBilde(t, "kjede-bilde");
  await t.klikk('[data-h="hny"]');
  await t.vent("document.querySelector('[data-h=\"hjeg\"]')");
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Ny kjede starter ikke med neste spiller");

  // ---------- Team mode ----------
  await t.klikk("#tilbake");
  t.sjekk(/Fortsett/.test(await t.tekst(".hjem-knapper .knapp")), "«Fortsett» er ikke hovedknappen mens et spill pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spør ikke før et pågående spill kastes");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.tilstand()).spill && (await t.tilstand()).spill.modus === "hvisk", "«Avbryt» kastet spillet likevel");
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
  t.sjekk(tilst.spill.lag === 2 && tilst.spill.poeng[0] === 1, "Laget fikk ikke poeng");
  await t.bilde("lag-resultat");

  // ---------- Odd counts: the one who saw the secret word never makes the last guess ----------
  await t.klikk("#tilbake");
  await nyttSpill(t);
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.klikk('[data-h="modus"][data-v="hvisk"]');
  await t.klikk('[data-h="start"]');
  t.sjekk((await t.tilstand()).spill.rekke.join() === "0,1,2,3", "Med fem spillere skal én stå over (fire steg)");
  await t.klikk("#tilbake");
  await nyttSpill(t);
  await t.klikk('[data-h="spiller-fjern"][data-v="4"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="3"]');
  await t.klikk('[data-h="start"]');
  t.sjekk((await t.tilstand()).spill.rekke.join() === "0,1,2,1", "Med tre spillere skal første gjetter ta siste steg");

  // ---------- Two players: "Gjettet!" goes straight to the other one ----------
  await t.klikk("#tilbake");
  await nyttSpill(t);
  await t.klikk('[data-h="modus"][data-v="tegn"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  t.sjekk((await t.tilstand()).oppsett.lag === 0, "Lag ble ikke slått av med for få spillere");
  await t.klikk('[data-h="start"]');
  await startTegning(t);
  await strek(t, sirkel(0.5, 0.4, 0.2), { touch: true });
  // A full sketchbook stops drawing with a friendly message (localStorage is small and shared).
  const forFull = await antallStreker(t);
  await t.js(`Rusj.S.spill.historikk.push({ t: 1, o: Rusj.S.spill.ord, s: ["00" + "A".repeat(1499990)], ok: false, g: -1, sek: 1, pluss: {} })`);
  await strek(t, linje(0.2, 0.7, 0.8, 0.7, 6), { touch: true });
  t.sjekk((await antallStreker(t)) === forFull && /fullt/.test(await t.tekst("#toast")), "Full skissebok stoppet ikke tegningen med en beskjed");
  await t.js(`Rusj.S.spill.historikk.pop()`);
  await t.klikk('[data-h="gjettet"]');
  await t.vent("document.querySelector('.kunst-resultat')");
  tilst = await t.tilstand();
  t.sjekk(tilst.spill.antall === 2 && tilst.spill.poeng.join() === "1,1", "To spillere: begge skulle fått 1 poeng");
  t.sjekk(JSON.stringify(tilst).length < 30000, `Tilstanden er for stor (${JSON.stringify(tilst).length} tegn)`);

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
  await t.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await t.sov(400);
  t.sjekk((await blekk(t)) > 50, "Tegningen forsvant da skjermen ble snudd");
}
