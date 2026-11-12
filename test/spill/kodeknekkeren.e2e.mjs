// Kodeknekkeren, played through:
// 1. «Lag mot lag», best of three: setup (mode first, the saved group), the key by join code on a
//    "second phone" and by hold-to-reveal (with letters, not only colours), the example on the
//    first board, the hint strip (count-down, change, undo, «Hintene så langt», typed text is
//    escaped and cut), turns, a reload, the board's result with the match score, «Neste brett» on
//    both "phones", the trap and undo, «Kåringen» (registered once in «Kveldens gjeng», shared).
// 2. «Avslutt» (never throws the match away), names with shuffled teams and code masters in turn,
//    «Ett brett», the turn clock (waits while the page is hidden).
// 3. «Sammen mot fella»: the co-op key and code, seven hints, the record, the trap.
// 4. Saved games: one from before matches had an end, a tampered one and pure garbage.
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

function bildemappe(id) {
  const i = process.argv.indexOf("--bilder");
  const rot = i > 0 ? resolve(process.argv[i + 1]) : join(tmpdir(), "rusj-e2e");
  const mappe = join(rot, id);
  mkdirSync(mappe, { recursive: true });
  return mappe;
}

// The phone size the runner uses (--bredde / --hoyde), to return to after other screen sizes.
const flaggTall = (navn, standard) => {
  const i = process.argv.indexOf(navn);
  return (i > 0 && Number(process.argv[i + 1])) || standard;
};
const MOBIL = { width: flaggTall("--bredde", 390), height: flaggTall("--hoyde", 844), deviceScaleFactor: 2, mobile: true };

// Screenshot at another screen size (tablet / laptop), then back to the phone.
async function bredBilde(t, navn, bredde, hoyde) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 1, mobile: false });
  await t.sov(500);
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const brett = await t.js("(() => { const b = document.querySelector('.kk-brett'); if (!b) return null; const r = b.getBoundingClientRect(); return { bunn: Math.round(r.bottom), bredde: Math.round(r.width) }; })()");
  if (brett) t.sjekk(brett.bunn <= hoyde + 2, `Brettet går utenfor skjermen på ${bredde}×${hoyde} (bunn ${brett.bunn}px)`);
  const kutt = await t.js("Array.from(document.querySelectorAll('.kk-ord')).filter(o => o.getBoundingClientRect().width > o.parentElement.clientWidth + 1).length");
  t.sjekk(kutt === 0, `${kutt} ord er for brede for kortet på ${bredde}×${hoyde}`);
  // On a laptop or TV, whose turn it is must be readable from across the room
  const tur = await t.js("(() => { const b = document.querySelector('.kk-tur b'); return b ? parseFloat(getComputedStyle(b).fontSize) : 0; })()");
  if (navn === "brett" && bredde >= 1200) t.sjekk(tur >= 36, `«… sin tur» er bare ${tur}px på ${bredde}×${hoyde}`);
  // The hint strip and the buttons stay inside the screen, and nothing lies on top of the strip
  const stripe = await t.js(`(() => { const h = document.querySelector(".kk-hint"); const d = document.querySelector("#skjerm .dokk"); if (!h || !d) return null; const a = h.getBoundingClientRect(), b = d.getBoundingClientRect(); return { inne: a.left >= 0 && a.right <= innerWidth + 1 && a.top >= 0 && a.bottom <= innerHeight + 1, dokk: Math.round(b.bottom), fri: a.bottom <= b.top + 1 || a.right <= b.left + 1 || a.left >= b.right - 1 }; })()`);
  if (stripe && navn === "brett") t.sjekk(stripe.inne && stripe.fri && stripe.dokk <= hoyde + 1, `Hintstripa eller knappene får ikke plass på ${bredde}×${hoyde} (${JSON.stringify(stripe)})`);
  await t.skjermbilde(join(bildemappe(t.id), `bred-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

// Two real finger taps on the same spot, quickly (a double tap).
async function dobbeltTrykk(t, sel, mellom = 110) {
  await t.js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center" })`);
  await t.sov(150);
  const p = await t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width * 0.75, y: b.y + b.height / 2 }; })()`);
  for (let n = 0; n < 2; n++) {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (n === 0) await t.sov(mellom);
  }
  await t.sov(450);
}

// Small phones: the status, the hint strip, the whole board and every button must be visible
// without scrolling — also with a hint on the strip and four links under the main button.
async function mobilBilde(t, navn, bredde, hoyde) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });
  await t.sov(450);
  await t.js("window.scrollTo(0, 0)");
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const mal = await t.js(`(() => { const b = document.querySelector('.kk-brett').getBoundingClientRect(); const k = document.querySelector('.dokk .knapp').getBoundingClientRect();
    const ord = Array.from(document.querySelectorAll('.kk-ord'));
    const s = document.querySelector('.kk-hint, .kk-eks'); const sr = s ? s.getBoundingClientRect() : null;
    const st = document.querySelector('.kk-status').getBoundingClientRect();
    const v = document.querySelector('.kk-verktoy').getBoundingClientRect();
    const sma = Array.from(document.querySelectorAll('.kk-lag-tekst')).filter((e) => e.offsetParent).map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { brettTopp: b.top, brettBunn: b.bottom, knappTopp: k.top, knappBunn: k.bottom, minste: Math.min(...ord.map(o => parseFloat(getComputedStyle(o).fontSize))),
      kutt: ord.filter(o => o.getBoundingClientRect().width > o.parentElement.clientWidth + 1).length,
      stripeTopp: sr ? sr.top : null, stripeBunn: sr ? sr.bottom : null, statusBunn: st.bottom, lenkerBunn: v.bottom, side: document.documentElement.scrollHeight, sma: sma.length ? Math.min(...sma) : 99 }; })()`);
  t.sjekk(mal.brettBunn <= mal.knappTopp + 2 && mal.knappBunn <= hoyde + 1, `Brettet og knappen får ikke plass på ${bredde}×${hoyde} uten scrolling (brett ${Math.round(mal.brettBunn)}, knapp ${Math.round(mal.knappTopp)}–${Math.round(mal.knappBunn)})`);
  t.sjekk(mal.lenkerBunn <= hoyde + 1 && mal.side <= hoyde + 1, `Lenkene under hovedknappen får ikke plass på ${bredde}×${hoyde} (slutter på ${Math.round(mal.lenkerBunn)}, siden er ${mal.side}px)`);
  if (mal.stripeTopp != null) t.sjekk(mal.stripeTopp >= mal.statusBunn - 1 && mal.stripeBunn <= mal.brettTopp + 1, `Hintstripa ligger ikke fritt mellom status og brett på ${bredde}×${hoyde} (${Math.round(mal.stripeTopp)}–${Math.round(mal.stripeBunn)}, brett fra ${Math.round(mal.brettTopp)})`);
  t.sjekk(mal.kutt === 0, `${mal.kutt} ord er for brede for kortene på ${bredde}×${hoyde}`);
  // Worst case over every possible word (measured): 11.6 px at 390, 12.9 px at 375, 10.4 px at 320.
  const minst = bredde < 360 ? 10 : 11.5;
  t.sjekk(mal.minste >= minst, `Ordene blir bare ${mal.minste.toFixed(1)}px på ${bredde}×${hoyde} (minst ${minst}px)`);
  t.sjekk(mal.sma >= 11.5, `«agenter igjen» er bare ${mal.sma.toFixed(1)}px på ${bredde}×${hoyde}`);
  await t.skjermbilde(join(bildemappe(t.id), `mobil-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E"];
// Runs in every edition (node test/rusj-e2e.mjs --sprak en kodeknekkeren): texts are checked in
// Norwegian only (nb, eq), numbers and state everywhere; the team names follow the edition.
let NB = true;
let SPRAK = "nb";
const nb = (re) => (NB ? re : /[\s\S]*/);
const eq = (a, b) => !NB || a === b;
const eqOr = (a, b, re) => (NB ? a === b : re.test(a));
const vertLag = (l) => ({ en: ["Team Pink", "Team Blue"], da: ["Hold Rosa", "Hold Blå"] }[SPRAK] || ["Lag Rosa", "Lag Blå"])[l];
const kortAv = (sp, type, unntak = []) => sp.nokkel.findIndex((x, i) => x === type && !sp.vist.includes(i) && !unntak.includes(i));
// WCAG contrast of two "rgb(r, g, b)" colours
const lys = (rgb) => {
  const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a, b) => (Math.max(lys(a), lys(b)) + 0.05) / (Math.min(lys(a), lys(b)) + 0.05);

export default async function (t) {
  NB = t.norsk;
  SPRAK = t.sprak;
  const tilstand = () => t.tilstand();
  const kveld = () => t.js(`((JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null") || {}).spill || []).filter((s) => s.id === "kodeknekkeren")`);
  const stat = (h) => t.js(`Rusj._statKo.filter((x) => x.h === ${JSON.stringify(h)}).map((x) => x.d)`);
  const snu = (i, ms = 140) => t.klikk(`.kk-kort[data-v="${i}"]`, ms);
  const angre = () => t.klikk('[data-h="angre"]', 460); // (a second «Angre» within 0.4 s is taken as a double tap)
  const ferdig = () => t.klikk('[data-h="ferdig"]', 780); // (and a second «… er ferdig» within 0.7 s)
  const ventBrett = () => t.vent("document.querySelector('#skjerm.skjerm-brett') && document.querySelectorAll('.kk-kort').length === 25");
  const ventResultat = () => t.vent("document.querySelector('#skjerm.skjerm-resultat .banner')", 7000);
  const ventKaring = () => t.vent("document.querySelector('#skjerm.skjerm-karing .banner')", 7000);
  const stripe = () => t.tekst(".kk-hint");
  const arkSvar = (v) => t.klikk(`#ark [data-h="ark-svar"][data-v="${v}"]`);
  // What «Del resultatet» hands to the phone's share sheet
  const delt = async () => {
    await t.js(`window.__delt = null; Rusj.del = (tittel, tekst, url) => { window.__delt = { tittel, tekst, url }; }`);
    await t.klikk('[data-h="del"]');
    return t.js("window.__delt");
  };

  await t.start({ navn: NAVN });
  t.sjekk(await t.finnes('[data-h="bli-med"]'), "Mangler «Jeg er kodemester» på hjem-skjermen");
  t.sjekk(nb(/2–20\s*spillere/).test(await t.tekst(".merker")) && /2–20/.test(await t.tekst(".merker")), `Hjem-skjermen sier ikke «2–20 spillere» («${(await t.tekst(".merker")).replace(/\s+/g, " ")}»)`);
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && !/REKORD|BEST/.test(await t.tekst(".merker")), "En ny mobil skal ikke ha «Fortsett» eller rekord på hjem-skjermen");

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  const opp = await t.js(`(() => {
    const forste = document.querySelector("#skjerm .fliser, #skjerm .seg, #skjerm .bryter, #skjerm section");
    const na = document.querySelector('.kk-vei li[aria-current="step"]');
    return { modusForst: !!forste && forste.matches(".fliser") && !!forste.querySelector('[data-h="modus"]'), fliser: document.querySelectorAll('[data-h="modus"]').length,
      vei: Array.from(document.querySelectorAll(".kk-vei li span")).map((s) => s.textContent).join(" → "), na: na ? na.innerText.trim() : "",
      tips: /Tips: åpne brettet på nettbrett eller TV/.test(document.querySelector("#skjerm").innerText), kamp: (document.querySelector('[data-h="kamp"][aria-pressed="true"]') || {}).innerText,
      navn: !!document.querySelector("#spillerboks"), tittel: document.querySelector("#skjerm h1").innerText, start: document.querySelector(".dokk .knapp").innerText.trim() }; })()`);
  t.sjekk(opp.modusForst && opp.fliser === 2, "Valget mellom «Lag mot lag» og «Sammen mot fella» skal være det første på oppsettet, som to fliser");
  t.sjekk(eq(opp.vei, "Lag → Nøkkel → Brett") && nb(/Lag/).test(opp.na) && opp.vei.split(" → ").length === 3, `Starten skal vises som tre prikker «Lag → Nøkkel → Brett» med «Lag» som nå (${opp.vei}, nå: ${opp.na})`);
  t.sjekk(!NB || opp.tips, "Oppsettet mangler tipset om nettbrett eller TV");
  t.sjekk(eq(opp.kamp, "Best av 3"), `«Kampen» skal stå på «Best av 3» fra start (står på «${opp.kamp}»)`);
  t.sjekk(!opp.navn, "Navn skal være valgfritt: spillerlista skal ikke vises før man ber om den");
  t.sjekk(eq(opp.tittel, "Gjør klart") && opp.start === "Start", `Oppsettet heter «${opp.tittel}» og hovedknappen «${opp.start}»`);
  t.sjekk((await tilstand()).antall === 5, `Et nytt oppsett skal starte fra den lagrede gjengen på 5 (fikk ${(await tilstand()).antall})`);
  await t.klikk('[data-h="kamp"][data-v="fri"]');
  t.sjekk((await tilstand()).oppsett.kamp === "fri", "«Fri» ble ikke valgt");
  await t.klikk('[data-h="kamp"][data-v="best3"]');
  await t.klikk('[data-h="ord"][data-v="lett"]');
  t.sjekk((await tilstand()).oppsett.lett === true, "«Bare lette ord» ble ikke valgt");
  await t.klikk('[data-h="ord"][data-v="alle"]');
  await t.klikk('[data-h="start"]');

  // ---------- Key screen: join code + QR ----------
  await t.vent("document.querySelector('#kk-kode')");
  t.sjekk(await t.finnes(".kk-kodekort .qr svg"), "QR-koden vises ikke");
  t.sjekk(nb(/Nøkkel/).test(await t.tekst('.kk-vei li[aria-current="step"]')), "Nøkkel-skjermen viser ikke «Nøkkel» som steget vi er på");
  await t.bilde("nokkel-kode");
  const kode = await t.js("document.querySelector('#kk-kode').dataset.kode");
  t.sjekk(/^[0-9A-Z]{8}$/.test(kode), `Koden ser rar ut: ${kode}`);
  let S = await tilstand();
  let sp = S.spill;
  t.sjekk(sp.modus === "lag" && sp.kamp === "best3" && sp.navn === null, "Spillet startet ikke som «Lag mot lag», best av 3, uten navn");
  t.sjekk(sp.ord.length === 25 && new Set(sp.ord.map((o) => o.toLowerCase())).size === 25, "Brettet har ikke 25 ulike ord");
  t.sjekk(sp.ord.every((o) => /^[A-Za-zÆØÅæøåÉé]{3,11}$/.test(o)), "Brettet har ord som ikke er enkle ord på 3–11 bokstaver");
  const telling = [0, 1, 2, 3].map((x) => sp.nokkel.filter((y) => y === x).length);
  t.sjekk(telling[sp.start] === 9 && telling[1 - sp.start] === 8 && telling[2] === 7 && telling[3] === 1, `Feil fordeling i nøkkelen: ${telling.join("/")}`);
  let hendelser = await stat("start");
  t.sjekk(hendelser.length === 1 && hendelser[0].modus === "lag" && hendelser[0].kamp === "best3" && hendelser[0].spillere === 0, `Statistikken «start» ble ikke sendt riktig: ${JSON.stringify(hendelser)}`);

  // Hold-to-reveal on this screen: the key tells the teams apart by letters too (R, B, ✕)
  await t.klikk('[data-h="nokkelmodus"][data-v="skjerm"]');
  t.sjekk((await tilstand()).oppsett.nokkel === "skjerm", "Nøkkel-modus ble ikke byttet");
  const slipp = await t.hold(".mappe", 800);
  t.sjekk((await t.antall(".mappe.apen .kk-n")) === 25, "Hold-kortet viser ikke 25 ruter i nøkkelen");
  const minstNokkel = await t.js("Math.min(...Array.from(document.querySelectorAll('.mappe.apen .kk-ord')).map(o => parseFloat(getComputedStyle(o).fontSize)))");
  t.sjekk(minstNokkel >= (MOBIL.width < 360 ? 9 : 11), `Ordene på «Kun kodemestere»-kortet er bare ${minstNokkel.toFixed(1)}px`);
  const bokstaver = (rot) => t.js(`Array.from(document.querySelectorAll(${JSON.stringify(rot)})).map((b) => ({ t: Number(b.className.match(/\\bt(\\d)\\b/)[1]), b: (b.querySelector(".kk-b") || {}).textContent || "" }))`);
  const holdt = await bokstaver(".mappe.apen .kk-n");
  t.sjekk(holdt.length === 25 && holdt.every((m) => m.b === ["R", "B", "", "✕"][m.t]), "Hold-kortet skiller ikke lagene med bokstaver (R, B og ✕ for fella)");
  const forklaring = await t.js("(document.querySelector('.mappe.apen .kk-fordeling') || {}).textContent || ''");
  t.sjekk(new RegExp(`R\\s*${vertLag(0)}: \\d`).test(forklaring) && new RegExp(`B\\s*${vertLag(1)}: \\d`).test(forklaring) && /✕\s*[^:]+: 1/.test(forklaring), `Forklaringen under nøkkelen mangler bokstavene («${forklaring}»)`);
  await t.bilde("nokkel-holdt");
  await slipp();
  t.sjekk(!(await t.finnes(".mappe.apen")), "Hold-kortet lukket seg ikke");
  await t.klikk('[data-h="nokkelmodus"][data-v="mobil"]');

  // ---------- The first board on this phone: the three-frame example ----------
  await t.klikk('[data-h="til-brett"]');
  await ventBrett();
  await t.bilde("brett-eksempel");
  t.sjekk((await t.antall(".kk-eks li")) === 3 && !(await t.finnes(".kk-hint")), "Første brett på mobilen skal vise eksempelet i tre ruter");
  t.sjekk(nb(/Kodemesteren sier «HAV, 2».*To av ordene passer.*Laget trykker Krabbe og Måke/s).test(await t.tekst(".kk-eks")), `Eksempelet sier ikke det det skal: «${(await t.tekst(".kk-eks")).replace(/\s+/g, " ")}»`);
  t.sjekk((await t.friForDokk(".kk-brett")) && (await t.friForDokk(".kk-eks")), "Eksempelet eller brettet havner bak knappene");
  const kutt = await t.js("Array.from(document.querySelectorAll('.kk-ord')).filter(o => o.getBoundingClientRect().width > o.parentElement.clientWidth + 1).length");
  t.sjekk(kutt === 0, `${kutt} ord er for brede for kortene på mobil`);
  const minsteFont = await t.js("Math.min(...Array.from(document.querySelectorAll('.kk-ord')).map(o => parseFloat(getComputedStyle(o).fontSize)))");
  t.sjekk(minsteFont >= (MOBIL.width < 360 ? 10 : 11.5), `Minste ord på brettet er bare ${minsteFont.toFixed(1)}px`);

  // Right guess: the team keeps the turn — and the example steps aside once the game is on
  const lag = sp.tur;
  const eget = kortAv(sp, lag);
  await snu(eget);
  S = await tilstand();
  t.sjekk(S.spill.vist.includes(eget) && S.spill.tur === lag, "Riktig gjetning skulle beholde turen");
  t.sjekk(await t.finnes(".kk-melding.riktig"), "Mangler melding etter riktig gjetning");
  t.sjekk(!(await t.finnes(".kk-eks")) && (await t.finnes(".kk-hint")), "Eksempelet skal vike for hintstripa når første kort er snudd");
  await t.bilde("riktig");
  // …undo brings it back, and ✕ closes it for good
  await angre();
  t.sjekk(await t.finnes(".kk-eks"), "Eksempelet skal være der igjen når brettet er urørt");
  await t.klikk('[data-h="eks-lukk"]');
  t.sjekk(!(await t.finnes(".kk-eks")) && (await tilstand()).laert === true, "✕ lukket ikke eksempelet for godt");
  await t.bilde("brett");

  // ---------- The hint strip ----------
  const st = await t.js(`(() => { const k = Array.from(document.querySelectorAll('.kk-tall [data-h="hint-tall"]')); const f = document.querySelector("#kk-hintfelt");
    return { tall: k.map((b) => b.innerText.trim()).join(" "), ikkeTrykket: k.filter((b) => b.getAttribute("aria-pressed") === "false").length, gruppe: document.querySelector(".kk-tall").getAttribute("aria-label"),
      uendelig: k[5].getAttribute("aria-label"), etikett: (document.querySelector('label[for="kk-hintfelt"]') || {}).textContent || "", maks: f.maxLength, skrift: parseFloat(getComputedStyle(f).fontSize) }; })()`);
  t.sjekk(st.tall === "1 2 3 4 5 ∞" && st.ikkeTrykket === 6, `Hintstripa skal ha tallene «1 2 3 4 5 ∞» med aria-pressed (har «${st.tall}»)`);
  t.sjekk(!!st.gruppe && eq(st.uendelig, "Uendelig") && nb(/valgfritt/).test(st.etikett) && st.maks === 20, "Hintstripa mangler etiketter (gruppe, ∞, feltet) eller grensen på 20 tegn");
  t.sjekk(st.skrift >= 16, `Hintfeltet har ${st.skrift}px skrift – under 16px zoomer iPhone inn på siden`);
  t.sjekk((await t.friForDokk(".kk-hint")) && (await t.friForDokk(".kk-brett")), "Hintstripa eller brettet havner bak knappene");
  await t.skrivInn("#kk-hintfelt", "hav");
  await t.klikk('[data-h="hint-tall"][data-v="2"]');
  t.sjekk(/HAV · 2/.test(await stripe()) && nb(/to forsøk igjen \(\+1\)/).test(await stripe()) && /\(\+1\)/.test(await stripe()), `Stripa skal vise «HAV · 2 – to forsøk igjen (+1)» (viser «${(await stripe()).replace(/\s+/g, " ")}»)`);
  t.sjekk(await t.js("document.activeElement && document.activeElement.id === 'kk-hint-vis'"), "Fokus skal stå på hintet når tallet er trykket (knappen forsvant)");
  S = await tilstand();
  t.sjekk(S.spill.hint && S.spill.hint.ord === "hav" && S.spill.hint.n === 2 && S.spill.hintlogg.length === 1, "Hintet ble ikke lagret");
  t.sjekk(await t.finnes('.kk-verktoy [data-h="hint-logg"]'), "«Hintene» skal dukke opp under hovedknappen når et hint er skrevet inn");
  await t.bilde("hint");
  // It counts down as cards are turned …
  await snu(eget);
  t.sjekk(nb(/ett forsøk igjen \(\+1\)/).test(await stripe()), `Etter ett kort: «${(await stripe()).replace(/\s+/g, " ")}»`);
  S = await tilstand();
  const eget2 = kortAv(S.spill, lag);
  await snu(eget2);
  t.sjekk(nb(/ekstraforsøket igjen/).test(await stripe()), `Etter to kort: «${(await stripe()).replace(/\s+/g, " ")}»`);
  const eget3 = kortAv((await tilstand()).spill, lag);
  await snu(eget3);
  // … and says the team is done when the guesses are used (the team may still go on: the game is not a referee)
  t.sjekk((NB ? new RegExp(`${vertLag(lag)} er ferdig`) : new RegExp(vertLag(lag))).test(await stripe()) && (await t.finnes(".kk-hint.brukt")), `Når forsøkene er brukt, skal stripa si «${vertLag(lag)} er ferdig» (sier «${(await stripe()).replace(/\s+/g, " ")}»)`);
  t.sjekk(await t.finnes('.dokk .knapp.kk-klar[data-h="ferdig"]'), "Hovedknappen skal lyse opp når forsøkene er brukt");
  t.sjekk((await tilstand()).spill.tur === lag, "Turen skal ikke gå videre av seg selv når forsøkene er brukt");
  await t.bilde("hint-brukt");
  // Undo: the card is hidden again and the count is back
  await angre();
  S = await tilstand();
  t.sjekk(!S.spill.vist.includes(eget3) && nb(/ekstraforsøket igjen/).test(await stripe()) && !(await t.finnes(".knapp.kk-klar")), "Angre tok ikke tilbake kortet og tellingen på stripa");
  // Change the hint: the field has the word and the number is pressed
  await t.klikk("#kk-hint-vis");
  const endre = await t.js(`({ ord: document.querySelector("#kk-hintfelt").value, trykket: Array.from(document.querySelectorAll('[data-h="hint-tall"][aria-pressed="true"]')).map((b) => b.dataset.v).join(), fokus: document.activeElement.id })`);
  t.sjekk(endre.ord === "hav" && endre.trykket === "2" && endre.fokus === "kk-hintfelt", `Et trykk på hintet skal åpne det for endring (${JSON.stringify(endre)})`);
  await t.klikk('[data-h="hint-tall"][data-v="3"]');
  S = await tilstand();
  t.sjekk(/HAV · 3/.test(await stripe()) && nb(/ett forsøk igjen \(\+1\)/).test(await stripe()) && S.spill.hintlogg.length === 1 && S.spill.hintlogg[0].n === 3, `Hintet ble ikke endret til 3 («${(await stripe()).replace(/\s+/g, " ")}»)`);
  await angre();
  S = await tilstand();
  t.sjekk(S.spill.hint.n === 2 && S.spill.hintlogg[0].n === 2 && /HAV · 2/.test(await stripe()) && S.spill.vist.length === 2, "Angre skulle ta tilbake endringen av hintet (og ikke et kort)");
  // «Hintene så langt»
  await t.klikk('[data-h="hint-logg"]');
  const logg = await t.tekst("#ark");
  t.sjekk(nb(/Hintene så langt/).test(logg) && /HAV · 2/.test(logg) && logg.includes(vertLag(lag).toUpperCase()) && logg.includes(sp.ord[eget]) && logg.includes(sp.ord[eget2]), `Arket «Hintene så langt» viser ikke hintet, laget og ordene som ble tatt: «${logg.replace(/\s+/g, " ").slice(0, 160)}»`);
  await t.bilde("hintene");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Neutral word: the turn goes over, and the strip is empty for the other team
  const noytral = kortAv(S.spill, 2);
  await snu(noytral);
  S = await tilstand();
  t.sjekk(S.spill.tur === 1 - lag, "Nøytralt ord skulle gi turen til det andre laget");
  t.sjekk(S.spill.hint === null && (await t.js("document.querySelector('#kk-hintfelt') && document.querySelector('#kk-hintfelt').value === ''")), "Hintstripa skal være tom når turen går videre");
  // Undo brings the card back and the turn with it — and the hint the team was on
  await angre();
  S = await tilstand();
  t.sjekk(!S.spill.vist.includes(noytral) && S.spill.tur === lag, "Angre virket ikke");
  t.sjekk(S.spill.hint && S.spill.hint.ord === "hav" && /HAV · 2/.test(await stripe()) && nb(/ekstraforsøket igjen/).test(await stripe()), "Angre skulle hente hintet tilbake da turen kom tilbake");

  // The other team's agent: turn goes over
  const motstander = kortAv(S.spill, 1 - lag);
  await snu(motstander);
  S = await tilstand();
  t.sjekk(S.spill.tur === 1 - lag && (await t.finnes(".kk-melding.feil")), "Motstanderens ord skulle gi turen videre");
  await t.bilde("feil-lag");

  // The word alone (Enter in the field), then ∞
  await t.skrivInn("#kk-hintfelt", "fjell");
  await t.js(`document.querySelector("form.kk-hint").requestSubmit()`);
  await t.sov(200);
  t.sjekk(/FJELL/.test(await stripe()) && (!NB || !/forsøk/.test(await stripe())), `Enter i feltet skal skrive inn ordet uten tall («${(await stripe()).replace(/\s+/g, " ")}»)`);
  await t.klikk("#kk-hint-vis");
  await t.klikk('[data-h="hint-tall"][data-v="99"]');
  t.sjekk(/FJELL · ∞/.test(await stripe()) && nb(/så mange forsøk dere vil/).test(await stripe()), `∞ gir ikke fritt antall forsøk («${(await stripe()).replace(/\s+/g, " ")}»)`);
  // A word that lies on the board: the phone says so (the classic rule)
  S = await tilstand();
  await t.klikk("#kk-hint-vis");
  await t.skrivInn("#kk-hintfelt", S.spill.ord[kortAv(S.spill, 2)].toLowerCase());
  await t.klikk('[data-h="hint-tall"][data-v="1"]');
  t.sjekk(nb(/ikke være et ord på brettet/).test(await t.tekst("#toast")) && (await t.finnes("#toast.vis")), "Et hint som står på brettet, skulle gi beskjed");
  // Typed text is text: never markup, never longer than 20 characters (an emoji counts as one)
  await t.klikk("#kk-hint-vis");
  await t.skrivInn("#kk-hintfelt", '<b id="kk-x">x</b>');
  await t.klikk('[data-h="hint-tall"][data-v="1"]');
  t.sjekk(!(await t.finnes("#kk-x")) && /<B ID="KK-X">X<\/B>/.test(await stripe()), "Tekst i hintfeltet ble tolket som HTML");
  await t.klikk('[data-h="hint-logg"]');
  t.sjekk(!(await t.finnes("#kk-x")), "Tekst i hintfeltet ble tolket som HTML i «Hintene så langt»");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#kk-hint-vis");
  await t.skrivInn("#kk-hintfelt", "x".repeat(17) + "🕵️🕵️🕵️🕵️🕵️");
  await t.klikk('[data-h="hint-tall"][data-v="1"]');
  S = await tilstand();
  const tegn = Array.from(new Intl.Segmenter("nb", { granularity: "grapheme" }).segment(S.spill.hint.ord)).length;
  t.sjekk(tegn === 20 && S.spill.hint.ord.endsWith("🕵️"), `Hintet skal kuttes på 20 hele tegn (ble ${tegn}: «${S.spill.hint.ord}»)`);
  t.sjekk(await t.js("(() => { const b = document.querySelector('#kk-hint-vis b').getBoundingClientRect(); const s = document.querySelector('.kk-hint').getBoundingClientRect(); return b.right <= s.right && document.documentElement.scrollWidth <= innerWidth; })()"), "Et langt hint sprenger hintstripa");
  await t.bilde("hint-langt");

  // End the turn by hand: the button has the colour of the team playing and says who is next.
  // A double tap (two real taps 110 ms apart) hands the turn over once – not over and back.
  t.sjekk((NB ? new RegExp(`${vertLag(1 - lag)} er ferdig`) : new RegExp(vertLag(1 - lag))).test(await t.tekst('[data-h="ferdig"]')), "Hovedknappen sier ikke hvilket lag som er ferdig");
  t.sjekk(new RegExp(NB ? `Turen går til ${vertLag(lag)}` : vertLag(lag)).test(await t.tekst('[data-h="ferdig"]')), "Hovedknappen sier ikke hvem som får turen");
  t.sjekk(!/[^\s\wæøåÆØÅ]/.test((await t.tekst('[data-h="ferdig"]')).replace(/\s+/g, "")), `Hovedknappen skal være ren tekst uten emoji («${(await t.tekst('[data-h="ferdig"]')).replace(/\s+/g, " ")}»)`);
  await t.sov(400);
  await dobbeltTrykk(t, '[data-h="ferdig"]');
  S = await tilstand();
  t.sjekk(S.spill.tur === lag, "Dobbelttrykk på «… er ferdig» ga turen over og tilbake igjen");
  t.sjekk(S.spill.hint === null && S.spill.hintlogg.length === 2, "Hintstripa ble ikke tømt da laget var ferdig (eller loggen mistet et hint)");

  // ---------- Second phone: the join link shows the same key ----------
  const vert = S.spill;
  await t.lastSide(`${t.side}#${kode}`, "document.querySelector('.kk-nokkel')");
  t.sjekk((await t.antall(".kk-nokkel .kk-n")) === 25, "Kodemesteren ser ikke 25 ruter");
  const gjest = await t.js("Array.from(document.querySelectorAll('.kk-nokkel .kk-n')).map(b => ({ o: b.querySelector('.kk-ord .hel').textContent, t: Number(b.className.match(/\\bt(\\d)\\b/)[1]) }))");
  t.sjekk(gjest.every((g, i) => g.o === vert.ord[i] && g.t === vert.nokkel[i]), "Nøkkelen fra koden stemmer ikke med brettet");
  t.sjekk(new RegExp(vertLag(vert.start)).test(await t.tekst(".kk-starter")), "Kodemesteren ser feil lag som begynner");
  // Not by colour alone: every agent has its team's letter, the trap a ✕ — in the grid and in the lists
  const pa = await bokstaver(".kk-nokkel .kk-n");
  t.sjekk(pa.every((m) => m.b === ["R", "B", "", "✕"][m.t]), "Nøkkelen på kodemesterens mobil skiller ikke lagene med bokstaver");
  await t.bilde("kodemester");
  await t.js("window.scrollTo(0, document.documentElement.scrollHeight)");
  t.sjekk((await t.js(`Array.from(document.querySelectorAll(".kk-gruppe h2 i")).map((i) => i.textContent).sort().join("")`)) === "BR✕", "Listene under nøkkelen mangler bokstavene R, B og ✕");
  await t.bilde("kodemester-lister");
  await t.js("window.scrollTo(0, 0)");
  await t.klikk(`.kk-n[data-v="${eget}"]`);
  t.sjekk((await tilstand()).gjest.tatt.includes(eget), "Kodemesteren kunne ikke krysse ut et ord");
  await t.klikk('[data-h="skjul"]');
  t.sjekk(await t.finnes(".kk-dekke"), "Nøkkelen ble ikke skjult");
  await t.bilde("kodemester-skjult");
  await t.klikk('[data-h="skjul"]');

  // Typing a code: wrong, then right (lower case with a dash)
  await t.klikk('[data-h="bli-med"]');
  await t.skrivInn("#kk-kodefelt", "abcd");
  await t.klikk('button[type="submit"]');
  t.sjekk(nb(/tegn/).test(await t.tekst("#kk-kodefeil")) && /\S/.test(await t.tekst("#kk-kodefeil")), "Mangler feilmelding for for kort kode");
  const feilKode = kode.slice(0, 7) + (kode[7] === "0" ? "1" : "0");
  await t.skrivInn("#kk-kodefelt", feilKode);
  await t.klikk('button[type="submit"]');
  t.sjekk(nb(/stemmer ikke/).test(await t.tekst("#kk-kodefeil")) && /\S/.test(await t.tekst("#kk-kodefeil")), "En feil kode ble godtatt");
  await t.bilde("bli-med-feil");
  await t.skrivInn("#kk-kodefelt", kode.slice(0, 4).toLowerCase() + "-" + kode.slice(4).toLowerCase());
  await t.vent("document.querySelector('.kk-nokkel')", 4000);
  t.sjekk((await tilstand()).gjest.fro === vert.fro && (await tilstand()).gjest.modus === "lag", "Koden skrevet med små bokstaver ga feil brett");

  // A broken link goes to the form with a message
  await t.lastSide(`${t.side}#XYZ`, "document.querySelector('#kk-kodefelt')");
  t.sjekk(nb(/gyldig/).test(await t.tekst("#kk-kodefeil")) && /\S/.test(await t.tekst("#kk-kodefeil")), "Ugyldig lenke viser ingen feilmelding");

  // ---------- Back on the board device: the game is still there ----------
  // (A reload never opens the key by itself: it shows the join screen with a button back to it.)
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(!(await t.finnes(".kk-nokkel")), "Omlasting viste nøkkelen uten at kodemesteren ba om det");
  t.sjekk(await t.finnes('.dokk .knapp[data-h="til-gjest"]'), "Med en lagret nøkkel skulle «Vis nøkkelen til brett …» være hovedknappen");
  t.sjekk(nb(/ny kode/i).test(await t.tekst('label[for="kk-kodefelt"]')), "Kodefeltet skulle hete «Ny kode» når en nøkkel er lagret");
  await t.bilde("bli-med-igjen");
  await t.klikk("#tilbake");
  t.sjekk((NB ? /Fortsett · brett 1/ : /· \S+ 1/).test(await t.tekst('.hjem-knapper .knapp[data-h="fortsett"]')), `Mens et brett pågår, skal hovedknappen være «Fortsett · brett 1» (er «${await t.tekst(".hjem-knapper .knapp")}»)`);
  // «Nytt spill» asks first, says what is lost, and keeps the game when the answer is «Spill videre»
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  t.sjekk(nb(/Brettet dere holder på med, forsvinner\./).test(await t.tekst("#ark")) && eq((await t.tekst('#ark [data-v="nei"]')).trim(), "Spill videre"), `«Nytt spill» midt i første brett: «${(await t.tekst("#ark")).replace(/\s+/g, " ")}»`);
  await t.bilde("bekreft-nytt");
  await arkSvar("nei");
  t.sjekk((await tilstand()).spill !== null && (await t.finnes('[data-h="fortsett"]')), "Spillet forsvant selv om vi trykket «Spill videre»");
  await t.klikk('[data-h="fortsett"]');
  await ventBrett();
  S = await tilstand();
  t.sjekk(S.spill.vist.length === 3 && S.spill.tur === lag, "Brettet ble ikke gjenopptatt riktig");

  // Reload mid-game
  await t.lastSide(t.side, "document.querySelectorAll('.kk-kort').length === 25");
  t.sjekk((await t.antall(".kk-kort.vist")) === 3, "Avslørte kort forsvant etter omlasting");
  t.sjekk(!(await t.finnes(".kk-eks")), "Eksempelet kom tilbake etter at det var lukket");

  // The key sheet on the board
  await t.klikk('[data-h="nokkel-ark"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) #kk-kode"), "Nøkkel-arket viser ikke koden");
  await t.bilde("nokkel-ark");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // «agenter igjen»: readable (at least 4.5:1) in both boxes
  const sma = await t.js(`Array.from(document.querySelectorAll(".kk-lag")).map((b) => { const e = b.querySelector(".kk-lag-tekst"); const s = getComputedStyle(e); return { farge: s.color, bak: getComputedStyle(b).backgroundColor, synlig: Number(s.opacity), px: parseFloat(s.fontSize), vises: !!e.offsetParent }; })`);
  for (const m of sma) if (m.vises) t.sjekk(m.synlig === 1 && kontrast(m.farge, m.bak) >= 4.5 && m.px >= 11.5, `«agenter igjen» har kontrast ${kontrast(m.farge, m.bak).toFixed(2)}:1 ved ${m.px}px (minst 4,5:1 og 11,5px)`);

  // Small phones, tablet and laptop — first with the empty strip, then with a hint on it
  await mobilBilde(t, "brett", 375, 667);
  await t.skrivInn("#kk-hintfelt", "sommerferie");
  await t.klikk('[data-h="hint-tall"][data-v="3"]');
  await mobilBilde(t, "brett-hint", 375, 560);
  await mobilBilde(t, "brett-hint", 320, 568);
  await bredBilde(t, "brett", 768, 1024);
  await bredBilde(t, "brett", 1024, 768);
  await bredBilde(t, "brett", 1440, 900);
  await bredBilde(t, "brett", 844, 390);
  await angre();
  await mobilBilde(t, "brett", 375, 560);
  await mobilBilde(t, "brett", 320, 568);
  await bredBilde(t, "brett-tom-stripe", 844, 390);

  // Keyboard: Enter on a hidden card flips it, and focus stays on the board (not on <body>)
  S = await tilstand();
  const medTast = kortAv(S.spill, S.spill.tur);
  await t.js(`document.querySelector('.kk-kort[data-v="${medTast}"]').focus()`);
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await t.sov(300);
  t.sjekk((await tilstand()).spill.vist.includes(medTast), "Enter på et kort snudde det ikke");
  t.sjekk(await t.js("!!document.activeElement && document.activeElement.classList.contains('kk-kort')"), "Fokus falt ut av brettet da et kort ble snudd med tastaturet");

  // ---------- The team on turn finds all its agents: the board's result, the match goes on ----------
  S = await tilstand();
  const vinnerLag = S.spill.tur;
  for (;;) {
    const sp2 = (await tilstand()).spill;
    if (sp2.grunn != null) break;
    const i = kortAv(sp2, vinnerLag);
    if (i < 0) break;
    await snu(i, 60);
  }
  await ventResultat();
  S = await tilstand();
  t.sjekk(S.spill.vinner === vinnerLag && S.spill.grunn === "alle", "Laget som fant alle agentene vant ikke");
  t.sjekk(S.spill.stilling[vinnerLag] === 1 && S.spill.spilt === 1, "Stillingen ble ikke oppdatert");
  t.sjekk(S.spill.ferdig === false && S._aktiv === true, "Etter ett brett av «Best av 3» skal kampen fortsatt være i gang");
  t.sjekk((await t.antall(".kk-kort.fasit")) > 0, "Resultatet viser ikke hele nøkkelen");
  const res = await t.js(`({ h1: document.querySelector("#skjerm h1").innerText, stilling: document.querySelector(".kk-stilling").innerText.replace(/\\s+/g, " ").trim(), knapp: document.querySelector(".dokk .knapp").innerText.trim(), h: document.querySelector(".dokk .knapp").dataset.h,
    lenker: Array.from(document.querySelectorAll(".dokk .lenke")).map((l) => l.innerText.trim()).join("|"), topp: document.querySelector("#topp-tittel").textContent })`);
  t.sjekk(eq(res.h1, `${vertLag(vinnerLag)} tok brettet!`) && res.h1.includes(vertLag(vinnerLag)), `Brettets resultat har overskriften «${res.h1}»`);
  t.sjekk(res.stilling === (vinnerLag === 0 ? `${vertLag(0)} 1 – 0 ${vertLag(1)}` : `${vertLag(0)} 0 – 1 ${vertLag(1)}`), `Brettets resultat viser stillingen «${res.stilling}»`);
  t.sjekk(eq(res.knapp, "Neste brett") && res.h === "neste-brett" && nb(/Angre/).test(res.lenker) && nb(/Avslutt/).test(res.lenker), `Etter et brett skal hovedknappen være «Neste brett», med «Angre» og «Avslutt» under (${res.knapp}: ${res.lenker})`);
  t.sjekk((await kveld()).length === 0, "Kampen ble registrert i Kveldens gjeng før kåringen");
  const fasit = await bokstaver(".kk-brett .kk-kort.fasit, .kk-brett .kk-kort.vist");
  t.sjekk(fasit.length === 25 && fasit.every((m) => m.b === ["R", "B", "", "✕"][m.t]), "Nøkkelen på resultatet skiller ikke lagene med bokstaver");
  t.sjekk(await t.friForDokk("#skjerm h1"), "Overskriften på brettets resultat havner bak knappene");
  await t.bilde("resultat", true);
  await bredBilde(t, "resultat", 1440, 900);
  await bredBilde(t, "resultat", 844, 390);

  // Between two boards: the home screen says so, and «Nytt spill» says what would be lost
  await t.klikk("#tilbake");
  const mellom = `Fortsett · ${vertLag(0)} ${vinnerLag === 0 ? "1 – 0" : "0 – 1"} ${vertLag(1)}`;
  t.sjekk((await t.tekst('.hjem-knapper .knapp[data-h="fortsett"]')).replace(/\s+/g, " ").trim().endsWith(NB ? mellom : mellom.replace("Fortsett ", "")), `Mellom to brett skal hovedknappen være «${mellom}» (er «${(await t.tekst(".hjem-knapper .knapp")).replace(/\s+/g, " ")}»)`);
  await t.bilde("hjem-mellom-brett");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  t.sjekk(!NB || new RegExp(`Stillingen ${vinnerLag === 0 ? "1–0" : "0–1"} nullstilles\\.`).test(await t.tekst("#ark")) && !/holder på med/.test(await t.tekst("#ark")), `«Nytt spill» mellom to brett skal si at stillingen nullstilles: «${(await t.tekst("#ark")).replace(/\s+/g, " ")}»`);
  await t.bilde("bekreft-nytt-stilling");
  await arkSvar("nei");
  await t.klikk('[data-h="fortsett"]');
  await ventResultat();

  // ---------- Next board on both "phones" ----------
  await t.klikk('[data-h="neste-brett"]');
  await t.vent("document.querySelector('#kk-kode')");
  const kode2 = await t.js("document.querySelector('#kk-kode').dataset.kode");
  t.sjekk(kode2 !== kode, "Nytt brett ga samme kode");
  S = await tilstand();
  const vert2 = S.spill;
  t.sjekk(vert2.brett === 1 && vert2.start === 1 - vert.start && vert2.stilling[vinnerLag] === 1 && vert2.spilt === 1 && vert2.hintlogg.length === 0, "Brett 2 er ikke satt opp riktig");
  await t.bilde("nokkel-brett-2");
  // The code master who already has the old code just taps "Neste brett"
  await t.lastSide(`${t.side}#${kode}`, "document.querySelector('.kk-nokkel')");
  await t.klikk('[data-h="gjest-neste"]');
  t.sjekk(eq((await t.tekst('#ark [data-v="nei"]')).trim(), "Ikke ennå"), "Arket «Gå til brett 2?» skal ha «Ikke ennå» som nei-svar");
  await t.bilde("kodemester-neste-brett");
  await arkSvar("ja");
  await t.vent("document.querySelector('#skjerm h1').textContent.includes('2')");
  const gjest2 = await t.js("Array.from(document.querySelectorAll('.kk-nokkel .kk-n')).map(b => ({ o: b.querySelector('.kk-ord .hel').textContent, t: Number(b.className.match(/\\bt(\\d)\\b/)[1]) }))");
  t.sjekk(gjest2.every((g, i) => g.o === vert2.ord[i] && g.t === vert2.nokkel[i]), "«Neste brett» på kodemesterens mobil stemmer ikke med brett 2");
  // …and the new code gives the same
  await t.lastSide(`${t.side}#${kode2}`, "document.querySelector('.kk-nokkel')");
  const gjest3 = await t.js("Array.from(document.querySelectorAll('.kk-nokkel .kk-ord .hel')).map(o => o.textContent)");
  t.sjekk(gjest3.join() === vert2.ord.join(), "Den nye koden gir ikke brett 2");

  // ---------- The trap ends the board; undo saves the day; the second win decides the match ----------
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.klikk("#tilbake");
  t.sjekk((NB ? /Fortsett · brett 2/ : /· \S+ 2/).test(await t.tekst('.hjem-knapper .knapp[data-h="fortsett"]')), "Hjem-skjermen sier ikke «Fortsett · brett 2»");
  await t.klikk('[data-h="fortsett"]');
  await ventBrett();
  t.sjekk(!(await t.finnes(".kk-eks")) && (await t.finnes(".kk-hint")), "Eksempelet skal aldri vises igjen etter første ferdige brett");
  S = await tilstand();
  const taper = 1 - vinnerLag; // the team that walks into the trap
  if (S.spill.tur !== taper) await ferdig();
  await t.klikk('[data-h="hint-tall"][data-v="1"]');
  const felle = S.spill.nokkel.indexOf(3);
  await snu(felle, 300);
  await t.bilde("fella");
  await ventResultat();
  S = await tilstand();
  t.sjekk(S.spill.vinner === vinnerLag && S.spill.grunn === "fella" && S.spill.stilling[vinnerLag] === 2, "Fella ga ikke seieren til det andre laget");
  t.sjekk(nb(/fella/).test(await t.tekst(".kk-banner")), "Resultatet sier ikke at noen gikk i fella");
  const avgjort = await t.js(`({ knapp: document.querySelector(".dokk .knapp").innerText.trim(), h: document.querySelector(".dokk .knapp").dataset.h, etikett: document.querySelector(".kk-banner .etikett").innerText, avslutt: !!document.querySelector('.dokk [data-h="avslutt"]') })`);
  t.sjekk(eq(avgjort.knapp, "Til kåringen") && avgjort.h === "til-karing" && nb(/avgjort/i).test(avgjort.etikett) && !avgjort.avslutt, `Når kampen er avgjort, skal hovedknappen være «Til kåringen» (${JSON.stringify(avgjort)})`);
  await t.bilde("resultat-fella");
  await angre();
  await ventBrett();
  S = await tilstand();
  t.sjekk(S.spill.grunn == null && S.spill.vinner == null && !S.spill.vist.includes(felle) && S.spill.stilling[vinnerLag] === 1 && S.spill.spilt === 1, "Angre etter fella virket ikke");
  t.sjekk(S.spill.tur === taper && S.spill.hint && S.spill.hint.n === 1, "Angre etter fella skulle gi laget turen og hintet tilbake");
  await snu(felle, 300);
  await ventResultat();
  t.sjekk((await kveld()).length === 0, "Kampen ble registrert i Kveldens gjeng før kåringen");

  // ---------- «Kåringen» ----------
  await t.klikk('[data-h="til-karing"]');
  await ventKaring();
  await t.bilde("karing", true);
  S = await tilstand();
  const kar = await t.js(`({ topp: document.querySelector("#topp-tittel").textContent, h1: document.querySelector("#skjerm h1").innerText, tekst: document.querySelector(".banner").innerText.replace(/\\s+/g, " "),
    vinner: (document.querySelector(".kk-lagkort.vinner h2") || {}).innerText, kort: Array.from(document.querySelectorAll(".kk-lagkort .kk-lagkort-tall b")).map((b) => b.textContent).join("–"),
    knapp: document.querySelector(".dokk .knapp").innerText.trim(), lenker: Array.from(document.querySelectorAll(".dokk .lenke")).map((l) => l.innerText.trim()).join("|"), alle: !!document.querySelector('.dokk a.lenke[href="${t.forside}"]'),
    del: !!document.querySelector('.knapp-2[data-h="del"]'), flere: !!document.querySelector(".flere-spill"), jubel: !!document.querySelector(".banner .figur-ramme.jubel") })`);
  t.sjekk(nb(/kåringen/i).test(kar.topp) && eq(kar.h1, `${vertLag(vinnerLag)} vinner!`) && kar.h1.includes(vertLag(vinnerLag)) && nb(/2–0 etter 2 brett/).test(kar.tekst) && /2–0/.test(kar.tekst) && nb(/Best av 3/i).test(kar.tekst), `Kåringen: «${kar.h1}» – «${kar.tekst}»`);
  t.sjekk(kar.vinner === vertLag(vinnerLag) && kar.kort === (vinnerLag === 0 ? "2–0" : "0–2") && kar.jubel, `Kåringen viser ikke lagene med stillingen (${kar.vinner}, ${kar.kort})`);
  t.sjekk(eq(kar.knapp, "Spill igjen") && eq(kar.lenker, "Endre oppsett|Alle spill") && kar.alle && kar.del && kar.flere, `Kåringen skal ha «Spill igjen», «Endre oppsett», «Alle spill», «Del resultatet» og flere spill (${kar.knapp}: ${kar.lenker})`);
  t.sjekk(S.spill.ferdig === true && S._aktiv === false, "Etter kåringen skal spillet være ferdig (ikke «pågår»)");
  t.sjekk(await t.friForDokk("#skjerm h1"), "Overskriften på kåringen havner bak knappene");
  // Registered once in «Kveldens gjeng»: the two teams, with boards won
  let kv = await kveld();
  t.sjekk(kv.length === 1 && kv[0].resultat.length === 2 && kv[0].resultat[0].navn === vertLag(vinnerLag) && kv[0].resultat[0].plass === 1 && kv[0].resultat[1].navn === vertLag(1 - vinnerLag) && kv[0].resultat[1].plass === 2, `Kveldens gjeng fikk ikke de to lagene: ${JSON.stringify(kv)}`);
  hendelser = await stat("ferdig");
  t.sjekk(hendelser.length === 1 && hendelser[0].modus === "lag" && hendelser[0].runder === 2 && hendelser[0].avbrutt === false, `Statistikken «ferdig»: ${JSON.stringify(hendelser)}`);
  let deling = await delt();
  t.sjekk(deling && deling.tittel === (await t.js("window.RUSJ_SPILL.navn")) && eqOr(deling.tekst, `Kodeknekkeren: ${vertLag(vinnerLag)} vant 2–0 🕵️`, new RegExp(`${vertLag(vinnerLag)}.*2–0 🕵️$`)) && deling.url.endsWith(new URL(t.side).pathname), `«Del resultatet» delte: ${JSON.stringify(deling)}`);
  // A reload shows «Kåringen» again without registering the match twice
  await t.lastSide(t.side, "document.querySelector('#skjerm.skjerm-karing .banner')");
  t.sjekk((await kveld()).length === 1 && (await stat("ferdig")).length === 0, "Kampen ble registrert en gang til etter omlasting");

  // ---------- «Spill igjen», and «Avslutt» before any board is finished ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('#kk-kode')");
  S = await tilstand();
  t.sjekk(S.spill.brett === 2 && S.spill.stilling.join() === "0,0" && S.spill.spilt === 0 && S.spill.ferdig === false && S.spill.kamp === "best3" && S.spill.start === vert.start, "«Spill igjen» skal starte en ny kamp på neste brett, 0–0");
  t.sjekk((await stat("start")).length === 1, "«Spill igjen» sendte ikke statistikken «start»");
  await t.klikk('[data-h="til-brett"]');
  await ventBrett();
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  const ark = await t.js(`({ tittel: document.querySelector("#ark h2").innerText, tekst: document.querySelector("#ark .ingress").innerText, ja: document.querySelector('#ark [data-v="ja"]').innerText.trim(), nei: document.querySelector('#ark [data-v="nei"]').innerText.trim() })`);
  t.sjekk(eq(ark.tittel, "Avslutte spillet?") && eq(ark.ja, "Avslutt") && eq(ark.nei, "Spill videre") && nb(/uten vinner/).test(ark.tekst), `Arket for «Avslutt»: ${JSON.stringify(ark)}`);
  await t.bilde("bekreft-avslutt");
  await arkSvar("nei");
  t.sjekk((await tilstand()).spill.ferdig === false && (await t.finnes("#skjerm.skjerm-brett")), "«Spill videre» avsluttet spillet likevel");
  await t.klikk('[data-h="avslutt"]');
  await arkSvar("ja");
  await ventKaring();
  S = await tilstand();
  t.sjekk(nb(/Ingen vinner/).test(await t.tekst("#skjerm h1")) && !(await t.finnes('[data-h="del"]')) && !(await t.finnes(".kk-lagkort")), `«Avslutt» før første brett er ferdig: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(S.spill !== null && S.spill.ferdig === true && S._aktiv === false, "«Avslutt» skal gå til kåringen og gjøre spillet ferdig (ikke kaste det)");
  t.sjekk((await kveld()).length === 1, "En kamp uten ferdige brett skal ikke registreres i Kveldens gjeng");
  hendelser = await stat("ferdig");
  t.sjekk(hendelser.length === 1 && hendelser[0].runder === 0 && hendelser[0].avbrutt === true, `Statistikken «ferdig» etter «Avslutt»: ${JSON.stringify(hendelser)}`);
  await t.bilde("karing-avsluttet");
  // Finished: the home screen has «Start spill» and no «Fortsett», and a new game doesn't ask
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes('.hjem-knapper .knapp[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), "Etter kåringen skal hjem-skjermen ha «Start spill» og ingen «Fortsett»");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")) && (await t.finnes("#skjerm.skjerm-oppsett")), "Et nytt spill etter kåringen skal ikke spørre");

  // ---------- Names: two teams, «Stokk lagene», code masters in turn; «Ett brett»; the turn clock ----------
  await t.klikk('[data-h="kamp"][data-v="ett"]');
  await t.klikk('[data-h="navn"]');
  let lagene = await t.js(`({ rader: document.querySelectorAll("#spillerboks .spiller").length, rosa: document.querySelectorAll(".kk-lagkol.rosa .kk-lagspiller").length, bla: document.querySelectorAll(".kk-lagkol.bla .kk-lagspiller").length, min: document.querySelector("#spillerboks").dataset.min })`);
  t.sjekk(lagene.rader === 5 && lagene.rosa + lagene.bla === 5 && Math.abs(lagene.rosa - lagene.bla) === 1 && lagene.min === "4", `Med navn skal de fem lagrede spillerne deles på to lag (${JSON.stringify(lagene)})`);
  await t.klikk('[data-h="stokk-lag"]');
  lagene = await t.js(`({ rosa: document.querySelectorAll(".kk-lagkol.rosa .kk-lagspiller").length, bla: document.querySelectorAll(".kk-lagkol.bla .kk-lagspiller").length })`);
  t.sjekk(lagene.rosa + lagene.bla === 5 && Math.abs(lagene.rosa - lagene.bla) === 1, "«Stokk lagene» ga skjeve lag");
  // A tap on a name moves the player; a team of one can't start
  while ((await t.antall(".kk-lagkol.bla .kk-lagspiller")) > 1) await t.klikk(".kk-lagkol.bla .kk-lagspiller");
  t.sjekk((await t.js("document.querySelector('[data-h=\"start\"]').disabled")) && nb(/minst to spillere/).test(await t.tekst(".dokk")), "Et lag med én spiller skulle sperre «Start» med en forklaring");
  await t.klikk(".kk-lagkol.rosa .kk-lagspiller");
  t.sjekk(!(await t.js("document.querySelector('[data-h=\"start\"]').disabled")), "«Start» skal åpne seg når begge lag har to spillere");
  // A player leaves and comes back: the teams follow
  await t.klikk('#spillerboks [data-h="spiller-fjern"][data-v="4"]');
  t.sjekk((await t.antall(".kk-lagspiller")) === 4 && (await tilstand()).oppsett.lag.length === 4, "Lagene fulgte ikke med da en spiller ble fjernet");
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.skrivInn("#navn-4", NAVN[4]);
  await t.klikk('[data-h="stokk-lag"]');
  await t.klikk('[data-h="tid"][data-v="60"]');
  await t.bilde("oppsett-navn", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#kk-kode')");
  S = await tilstand();
  sp = S.spill;
  const mester = (s, l) => s.navn[s.lag[l][(s.mstart[l] + s.mnr) % s.lag[l].length]];
  t.sjekk(sp.kamp === "ett" && sp.navn.length === 5 && sp.lag[0].length + sp.lag[1].length === 5 && sp.antall === 5, "Kampen med navn ble ikke satt opp riktig");
  const nokkelTekst = (await t.tekst("#skjerm")).replace(/\s+/g, " ");
  t.sjekk(NB ? nokkelTekst.includes(`Kodemestere nå: ${mester(sp, 0)} (Lag Rosa) og ${mester(sp, 1)} (Lag Blå)`) : nokkelTekst.includes(`${mester(sp, 0)} (${vertLag(0)})`) && nokkelTekst.includes(`${mester(sp, 1)} (${vertLag(1)})`), `Nøkkel-skjermen sier ikke hvem som er kodemestere («${nokkelTekst.slice(0, 200)}»)`);
  t.sjekk((await t.antall(".kk-lagliste p")) === 2 && NAVN.every((n) => nokkelTekst.includes(n)), "Nøkkel-skjermen viser ikke hvem som er på hvilket lag");
  t.sjekk((await stat("start")).some((h) => h.modus === "lag" && h.spillere === 5 && h.kamp === "ett"), "Statistikken «start» mangler antall spillere");
  await t.bilde("nokkel-navn");
  await t.klikk('[data-h="til-brett"]');
  await t.vent("document.querySelector('#kk-tid .timer-tid')");
  t.sjekk((await t.tekst(".kk-melding")).includes(NB ? `${mester(sp, sp.start)} gir ett ord og et tall` : mester(sp, sp.start)), `Meldingen sier ikke hvem som gir hintet («${await t.tekst(".kk-melding")}»)`);
  await t.bilde("brett-med-tidsur");

  // The turn clock waits while the page is hidden (a locked phone): the turn stays where it is
  const forTur = (await tilstand()).spill.tur;
  await t.js("Rusj.timer('kk-tid').leggTil(-58.6)");
  await t.js(`Object.defineProperty(document, "hidden", { get: () => true, configurable: true }); document.dispatchEvent(new Event("visibilitychange"))`);
  await t.sov(2600);
  t.sjekk((await t.js("Rusj.timer('kk-tid').kjorer")) === false && (await tilstand()).spill.tur === forTur, "Tidsuret ga turen videre mens siden var skjult");
  await t.js(`delete document.hidden; document.dispatchEvent(new Event("visibilitychange"))`);
  t.sjekk((await t.js("document.hidden")) === false && (await t.js("Rusj.timer('kk-tid').kjorer")) === true, "Tidsuret startet ikke igjen da siden ble synlig");
  // …and a clock the players paused themselves stays paused
  await t.js("Rusj.timer('kk-tid').leggTil(40); Rusj.timer('kk-tid').pause()");
  await t.js(`Object.defineProperty(document, "hidden", { get: () => true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); delete document.hidden; document.dispatchEvent(new Event("visibilitychange"))`);
  t.sjekk((await t.js("Rusj.timer('kk-tid').kjorer")) === false, "Et tidsur spillerne selv har satt på pause, skal ikke starte av seg selv");
  await t.js("Rusj.timer('kk-tid').start(); Rusj.timer('kk-tid').leggTil(-45)");
  await t.vent(`JSON.parse(localStorage.getItem("${t.nokkel("kodeknekkeren.v1")}")).spill.tur === ${1 - forTur}`, 5000);
  t.sjekk(await t.finnes(".kk-melding.tid"), "Mangler melding når tiden er ute");
  t.sjekk(/1:0\d|0:5\d/.test(await t.tekst("#kk-tid .timer-tid")), "Tidsuret startet ikke på nytt for neste lag");
  await mobilBilde(t, "brett-tidsur", 375, 560);
  await mobilBilde(t, "brett-tidsur", 320, 568);
  await bredBilde(t, "brett-tidsur", 844, 390);

  // «Ett brett»: the first board decides, and every player is registered with the team's result
  S = await tilstand();
  const ettVinner = S.spill.tur;
  for (;;) {
    const sp2 = (await tilstand()).spill;
    if (sp2.grunn != null) break;
    await snu(kortAv(sp2, ettVinner), 60);
  }
  await ventResultat();
  const ettRes = await t.js(`({ knapp: document.querySelector(".dokk .knapp").innerText.trim(), stilling: !!document.querySelector(".kk-stilling") })`);
  t.sjekk(eq(ettRes.knapp, "Til kåringen") && !ettRes.stilling, "«Ett brett» skal gå rett til kåringen etter brettet, uten stilling");
  await t.klikk('[data-h="til-karing"]');
  await ventKaring();
  S = await tilstand();
  kv = await kveld();
  const vinnere = S.spill.lag[ettVinner].map((i) => S.spill.navn[i]);
  t.sjekk(kv.length === 2 && kv[1].resultat.length === 5 && kv[1].resultat.filter((r) => r.plass === 1).map((r) => r.navn).sort().join() === vinnere.slice().sort().join() && kv[1].resultat.filter((r) => r.plass === 1 + vinnere.length).length === 5 - vinnere.length, `Med navn skal alle spillerne registreres med lagets resultat: ${JSON.stringify(kv[1])}`);
  const vinnerkort = (await t.tekst(".kk-lagkort.vinner")).replace(/\s+/g, " ");
  t.sjekk(vinnere.every((n) => vinnerkort.includes(n)), `Kåringen viser ikke hvem som er på vinnerlaget («${vinnerkort}»)`);
  deling = await delt();
  t.sjekk(deling && (NB ? deling.tekst.startsWith(`Kodeknekkeren: ${vertLag(ettVinner)} vant brettet 🕵️`) : deling.tekst.includes(vertLag(ettVinner))) && vinnere.every((n) => deling.tekst.includes(n)), `«Del resultatet» med navn: ${JSON.stringify(deling)}`);
  await t.bilde("karing-navn", true);
  // «Spill igjen»: the same teams, and the next player in each team is code master
  const forrige = [mester(S.spill, 0), mester(S.spill, 1)];
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('#kk-kode')");
  S = await tilstand();
  t.sjekk(S.spill.mnr === sp.mnr + 1 && mester(S.spill, 0) !== forrige[0] && mester(S.spill, 1) !== forrige[1] && S.spill.lag.join("|") === sp.lag.join("|"), "Neste brett skal ha nye kodemestere på de samme lagene");
  await t.klikk('[data-h="til-brett"]');
  await ventBrett();
  await t.klikk('[data-h="avslutt"]');
  await arkSvar("ja");
  await ventKaring();

  // ---------- «Sammen mot fella» ----------
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="modus"][data-v="sammen"]');
  S = await tilstand();
  const sm = await t.js(`({ rader: document.querySelectorAll("#spillerboks .spiller").length, maks: document.querySelector("#spillerboks").dataset.max, kamp: !!document.querySelector('[data-h="kamp"]'), lag: !!document.querySelector(".kk-lagene"), tid: Array.from(document.querySelectorAll("#skjerm h2")).map((h) => h.innerText).join("|") })`);
  t.sjekk(S.oppsett.modus === "sammen" && S.antall === 4 && sm.rader === 4 && sm.maks === "4" && !sm.kamp && !sm.lag && nb(/Tidsur for hvert hint/).test(sm.tid), `Oppsettet for «Sammen mot fella»: ${JSON.stringify(sm)} (antall ${S.antall})`);
  await t.klikk('[data-h="tid"][data-v="0"]');
  await t.bilde("oppsett-sammen", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#kk-kode')");
  S = await tilstand();
  sp = S.spill;
  const smTelling = [0, 1, 2, 3].map((x) => sp.nokkel.filter((y) => y === x).length);
  t.sjekk(sp.modus === "sammen" && smTelling.join("/") === "9/0/15/1", `«Sammen mot fella» skal ha 9 agenter, 15 nøytrale og 1 felle (${smTelling.join("/")})`);
  const smMester = (s) => s.navn[(s.mstart[0] + s.mnr) % s.antall];
  t.sjekk((await t.tekst("#skjerm")).replace(/\s+/g, " ").includes(NB ? `Kodemester nå: ${smMester(sp)}` : smMester(sp)) && nb(/Kodemester, hent nøkkelen/).test(await t.tekst("#skjerm h1")), "Nøkkel-skjermen sier ikke hvem som er kodemester");
  const smKode = await t.js("document.querySelector('#kk-kode').dataset.kode");
  await t.bilde("nokkel-sammen");
  // The code master's phone: the code says which mode it is, and the key has agents (A), neutral words and the trap
  await t.lastSide(`${t.side}#${smKode}`, "document.querySelector('.kk-nokkel')");
  const smGjest = await t.js("Array.from(document.querySelectorAll('.kk-nokkel .kk-n')).map(b => ({ o: b.querySelector('.kk-ord .hel').textContent, t: Number(b.className.match(/\\bt(\\d)\\b/)[1]), b: (b.querySelector('.kk-b') || {}).textContent || '' }))");
  t.sjekk((await tilstand()).gjest.modus === "sammen" && smGjest.every((g, i) => g.o === sp.ord[i] && g.t === sp.nokkel[i]) && (await t.finnes(".kk-nokkel.sammen")), "Koden fra «Sammen mot fella» ga ikke den samme nøkkelen på kodemesterens mobil");
  t.sjekk(smGjest.every((g) => g.b === ["A", "", "", "✕"][g.t]) && nb(/Sammen mot fella/).test(await t.tekst(".kk-starter")), "Nøkkelen for «Sammen mot fella» mangler bokstaven A, ✕ for fella eller merkelappen");
  t.sjekk((await t.js(`Array.from(document.querySelectorAll(".kk-gruppe h2")).map((h) => h.innerText.replace(/\\s+/g, " ").trim()).join("|")`)).match(NB ? /^A Agenter 9 igjen\|Nøytrale 15 igjen\|✕ Fella/ : /^A \D*9\D*\|\D*15\D*\|✕/), "Listene under nøkkelen for «Sammen mot fella» er feil");
  await t.bilde("kodemester-sammen");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.klikk("#tilbake");
  t.sjekk((NB ? /Fortsett · hint 1 av 7/ : /1 \S+ 7/).test(await t.tekst('.hjem-knapper .knapp[data-h="fortsett"]')), `Hjem-skjermen under «Sammen mot fella»: «${await t.tekst(".hjem-knapper .knapp")}»`);
  await t.klikk('[data-h="fortsett"]');
  await ventBrett();
  // (textContent: on a phone on its side the small «igjen» under the numbers is not shown)
  const smStatus = () => t.js(`document.querySelector(".kk-status").textContent.replace(/\\s+/g, " ").trim()`);
  t.sjekk((NB ? /Agenter 9 igjen Hint 1 av 7 Hint 6 igjen/i : /9\D+1\D+7\D+6/).test(await smStatus()), `Status for «Sammen mot fella»: «${await smStatus()}»`);
  t.sjekk(nb(/Neste hint/).test(await t.tekst('[data-h="ferdig"]')) && (await t.tekst(".kk-melding")).includes(NB ? `${smMester(sp)} gir ett ord og et tall` : smMester(sp)), "Brettet for «Sammen mot fella» mangler «Neste hint» eller navnet på kodemesteren");
  await t.bilde("sammen-brett");
  const agent = async (ms = 140) => snu(kortAv((await tilstand()).spill, 0), ms);
  const noytralt = async () => snu(kortAv((await tilstand()).spill, 2), 200);
  // Hint 1: two agents on «2» (the strip counts without the +1), then a neutral word ends the hint
  await t.klikk('[data-h="hint-tall"][data-v="2"]');
  t.sjekk(nb(/to forsøk igjen/).test(await stripe()) && !/\+1/.test(await stripe()), `Stripa i «Sammen mot fella»: «${(await stripe()).replace(/\s+/g, " ")}»`);
  await agent();
  await agent();
  t.sjekk(nb(/forsøkene er brukt/).test(await stripe()) && (await t.finnes(".dokk .knapp.kk-klar")), "Når forsøkene er brukt, skal stripa si det og «Neste hint» lyse opp");
  await t.bilde("sammen-hint");
  await noytralt();
  S = await tilstand();
  t.sjekk(S.spill.grunn == null && S.spill.hint === null && (NB ? /Hint 2 av 7/i : /\b2\b\D+7/).test(await smStatus()) && nb(/Agenter 7 igjen/i).test(await smStatus()) && (await t.finnes(".kk-melding.noytral")), `Et nøytralt ord skal bruke opp hintet: «${await smStatus()}»`);
  // Undo: back on hint 1 with its hint; again: on to hint 2
  await angre();
  t.sjekk((NB ? /Hint 1 av 7/i : /\b1\b\D+7/).test(await smStatus()) && nb(/forsøkene er brukt/).test(await stripe()), "Angre skulle gå tilbake til hint 1");
  await noytralt();
  // Hints 2–5: two, two, one and one agent, each ended with «Neste hint»
  for (const n of [2, 2, 1, 1]) {
    for (let k = 0; k < n; k++) await agent();
    await ferdig();
  }
  t.sjekk((NB ? /Hint 6 av 7/i : /\b6\b\D+7/).test(await smStatus()) && nb(/Agenter 1 igjen/i).test(await smStatus()), `Etter fem hint: «${await smStatus()}»`);
  await noytralt();
  t.sjekk((NB ? /Hint 7 av 7/i : /\b7\b\D+7/).test(await smStatus()) && nb(/Hint 0 igjen/i).test(await smStatus()) && nb(/Ferdig med siste hint/).test(await t.tekst('[data-h="ferdig"]')), `På siste hint: «${await smStatus()}»`);
  await mobilBilde(t, "sammen", 375, 560);
  await mobilBilde(t, "sammen", 320, 568);
  await bredBilde(t, "sammen", 844, 390);
  // The seventh hint is used: the board is over
  await noytralt();
  await ventResultat();
  S = await tilstand();
  t.sjekk(S.spill.grunn === "hint" && nb(/Hintene er brukt/).test(await t.tekst("#skjerm h1")) && (NB ? /8 av 9 agenter funnet/ : /8 \S+ 9/).test(await t.tekst(".kk-banner")) && eq((await t.tekst(".dokk .knapp")).trim(), "Til kåringen"), `Brettets resultat i «Sammen mot fella»: «${await t.tekst(".kk-banner")}»`);
  await t.bilde("sammen-resultat", true);
  const kveldFor = (await kveld()).length;
  await t.klikk('[data-h="til-karing"]');
  await ventKaring();
  S = await tilstand();
  let smKar = await t.js(`({ h1: document.querySelector("#skjerm h1").innerText, tekst: document.querySelector(".banner").innerText.replace(/\\s+/g, " "), rekord: (document.querySelector(".kk-rekord") || {}).innerText, pips: document.querySelectorAll(".kk-pips i.funnet").length, na: (document.querySelector(".kk-stige li.na b") || {}).innerText, trinn: document.querySelectorAll(".kk-stige li").length, knapp: document.querySelector(".dokk .knapp").innerText.trim() })`);
  t.sjekk(eq(smKar.h1, "Skarpe spioner") && (NB ? /8 av 9 agenter på 7 hint/ : /8 \S+ 9\D+7/).test(smKar.tekst) && smKar.pips === 8 && smKar.na === smKar.h1 && smKar.trinn === 4 && eq(smKar.knapp, "Spill igjen"), `Kåringen for «Sammen mot fella»: ${JSON.stringify(smKar)}`);
  t.sjekk(nb(/Første runde – nå har dere en rekord å slå!/).test(smKar.rekord) && !!smKar.rekord && S.rekord.f === 8 && S.rekord.h === 7, `Første resultat skal bli rekorden uten «Ny rekord!» (${smKar.rekord}, ${JSON.stringify(S.rekord)})`);
  t.sjekk((await kveld()).length === kveldFor, "«Sammen mot fella» skal ikke gi poeng i Kveldens gjeng");
  hendelser = await stat("ferdig");
  t.sjekk(hendelser.some((h) => h.modus === "sammen" && h.funnet === 8 && h.avbrutt === false), `Statistikken «ferdig» for «Sammen mot fella»: ${JSON.stringify(hendelser)}`);
  deling = await delt();
  t.sjekk(deling && eqOr(deling.tekst, "Kodeknekkeren – Sammen mot fella: 8 av 9 🕵️ ✅✅✅✅✅✅✅✅▫️", /8 \S+ 9 🕵️ ✅✅✅✅✅✅✅✅▫️$/), `«Del resultatet»: ${JSON.stringify(deling)}`);
  await t.bilde("sammen-karing", true);
  // The record is the first thing on the home screen
  await t.klikk("#tilbake");
  t.sjekk(eqOr((await t.tekst(".merker li:first-child")).replace(/\s+/g, " ").trim(), "REKORD 8 av 9", /8 \S+ 9/) && !(await t.finnes('[data-h="fortsett"]')), `Rekorden skal stå først på hjem-skjermen («${await t.tekst(".merker li:first-child")}»)`);
  await t.bilde("hjem-rekord");

  // A second game, the next code master: all nine on two hints is a new record
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#kk-kode')");
  await t.klikk('[data-h="til-brett"]');
  await ventBrett();
  for (let k = 0; k < 4; k++) await agent(60);
  await ferdig();
  for (let k = 0; k < 5; k++) await agent(60);
  await ventResultat();
  t.sjekk(nb(/Alle ni funnet!/).test(await t.tekst("#skjerm h1")), `Alle ni funnet: «${await t.tekst("#skjerm h1")}»`);
  await t.klikk('[data-h="til-karing"]');
  await ventKaring();
  S = await tilstand();
  smKar = await t.js(`({ h1: document.querySelector("#skjerm h1").innerText, tekst: document.querySelector(".banner").innerText.replace(/\\s+/g, " "), rekord: (document.querySelector(".kk-rekord") || {}).innerText, ny: !!document.querySelector(".kk-rekord.ny") })`);
  t.sjekk(eq(smKar.h1, "Mesterspioner!") && (NB ? /Alle 9 agentene på 2 hint/ : /9\D+2/).test(smKar.tekst) && smKar.ny && nb(/Ny rekord!/).test(smKar.rekord) && S.rekord.f === 9 && S.rekord.h === 2, `Ny rekord: ${JSON.stringify(smKar)} ${JSON.stringify(S.rekord)}`);
  deling = await delt();
  t.sjekk(deling && eqOr(deling.tekst, "Kodeknekkeren – Sammen mot fella: 9 av 9 på 2 hint 🕵️ ✅✅✅✅✅✅✅✅✅", /9 \S+ 9\D+2\D+ 🕵️ ✅✅✅✅✅✅✅✅✅$/), `«Del resultatet» med alle ni: ${JSON.stringify(deling)}`);
  await t.bilde("sammen-rekord", true);
  // «Spill igjen»: the next player is code master. The trap ends the board at once; undo; «Avslutt» sets no record
  const forrigeMester = smMester(S.spill);
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('#kk-kode')");
  S = await tilstand();
  t.sjekk(smMester(S.spill) !== forrigeMester && S.spill.modus === "sammen", "«Spill igjen» i «Sammen mot fella» skal gi neste kodemester");
  await t.klikk('[data-h="til-brett"]');
  await ventBrett();
  await agent();
  await snu(S.spill.nokkel.indexOf(3), 300);
  await ventResultat();
  t.sjekk(nb(/Rett i fella!/).test(await t.tekst("#skjerm h1")) && (NB ? /1 av 9 agenter funnet/ : /1 \S+ 9/).test(await t.tekst(".kk-banner")), `Fella i «Sammen mot fella»: «${await t.tekst(".kk-banner")}»`);
  await t.bilde("sammen-fella");
  await angre();
  await ventBrett();
  S = await tilstand();
  t.sjekk(S.spill.grunn == null && S.spill.vist.length === 1, "Angre etter fella virket ikke i «Sammen mot fella»");
  await snu(S.spill.nokkel.indexOf(3), 300);
  await ventResultat();
  await t.klikk('[data-h="til-karing"]');
  await ventKaring();
  S = await tilstand();
  smKar = await t.js(`({ h1: document.querySelector("#skjerm h1").innerText, tekst: document.querySelector(".banner").innerText.replace(/\\s+/g, " "), rekord: (document.querySelector(".kk-rekord") || {}).innerText, lei: !!document.querySelector(".banner .figur-ramme.lei"), felle: !!document.querySelector(".kk-pips .felle") })`);
  t.sjekk(eq(smKar.h1, "Spionlærlinger") && (NB ? /1 av 9 agenter før fella klappet igjen på hint 1/ : /1 \S+ 9/).test(smKar.tekst) && smKar.lei && smKar.felle && (NB ? /Rekorden å slå: 9 av 9 på 2 hint/ : /9 \S+ 9\D+2/).test(smKar.rekord) && S.rekord.f === 9, `Kåringen etter fella: ${JSON.stringify(smKar)}`);
  deling = await delt();
  t.sjekk(deling && eqOr(deling.tekst, "Kodeknekkeren – Sammen mot fella: 1 av 9 🕵️ ✅▫️▫️▫️▫️▫️▫️▫️▫️ 💥", /1 \S+ 9 🕵️ ✅▫️▫️▫️▫️▫️▫️▫️▫️ 💥$/), `«Del resultatet» etter fella: ${JSON.stringify(deling)}`);
  await t.bilde("sammen-karing-fella", true);
  await t.klikk("#tilbake");
  t.sjekk(eqOr((await t.tekst(".merker li:first-child")).replace(/\s+/g, " ").trim(), "REKORD 9 av 9 på 2 hint", /9 \S+ 9\D+2/), `Rekorden på hjem-skjermen: «${await t.tekst(".merker li:first-child")}»`);

  // ---------- Saved games ----------
  // One from before matches had an end (a finished board on the old result screen): the match goes on
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  await t.klikk('[data-h="navn"]');
  await t.klikk('[data-h="kamp"][data-v="best3"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#kk-kode')");
  await t.klikk('[data-h="til-brett"]');
  await ventBrett();
  S = await tilstand();
  const gVinner = S.spill.tur;
  await snu(kortAv(S.spill, 2));
  await snu(kortAv((await tilstand()).spill, 2));
  for (;;) {
    const sp2 = (await tilstand()).spill;
    if (sp2.grunn != null) break;
    await snu(kortAv(sp2, gVinner), 60);
  }
  await ventResultat();
  S = await tilstand();
  const g = S.spill;
  const gammel = {
    skjerm: "slutt",
    _tid: Date.now(),
    oppsett: { nokkel: "mobil", lett: false, tid: 0 },
    spill: { hash: g.hash, fro: g.fro, brett: g.brett, start: g.start, lett: g.lett, tid: g.tid, ord: g.ord, nokkel: g.nokkel, vist: g.vist, tur: g.tur, vinner: g.vinner, grunn: g.grunn, hist: g.hist.map((h) => (h.t === "kort" ? { t: h.t, i: h.i, tur: h.tur } : { t: h.t, tur: h.tur })), stilling: [g.stilling[0] + 1, g.stilling[1] + 2], melding: g.melding, sist: null },
    gjest: null,
    kodeUtkast: "",
    kodeFeil: null,
  };
  const lagre = (verdi) => t.js(`localStorage.setItem("${t.nokkel("kodeknekkeren.v1")}", ${JSON.stringify(JSON.stringify(verdi))})`);
  await lagre(gammel);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  S = await tilstand();
  t.sjekk((await t.finnes("#skjerm.skjerm-resultat")) && eq((await t.tekst(".dokk .knapp")).trim(), "Neste brett") && S.spill && S.spill.kamp === "fri" && S.spill.stilling.join() === gammel.spill.stilling.join() && S.spill.vist.join() === g.vist.join() && S.spill.vinner === g.vinner, `Et spill lagret før kampene fikk en slutt, ble ikke hentet opp riktig (skjerm ${S.skjerm}, ${JSON.stringify(S.spill && { kamp: S.spill.kamp, stilling: S.spill.stilling })})`);
  // Steps that don't add up (someone edited the save): the game is dropped, the page is fine
  const fusk = JSON.parse(JSON.stringify(S));
  fusk.spill.hist[0].tur = 1 - fusk.spill.hist[0].tur;
  await lagre(fusk);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await tilstand()).spill === null && (await t.finnes('.hjem-knapper .knapp[data-h="nytt"]')), "Et lagret spill der trekkene ikke går opp, skulle forkastes");
  // Pure garbage: never a blank page
  await lagre({ skjerm: "brett", _tid: Date.now(), spill: { hash: g.hash, fro: "x", hist: 7 }, oppsett: 5, antall: "mange", rekord: "?", gjest: [1, 2], laert: "ja", kodeUtkast: { a: 1 } });
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  S = await tilstand();
  t.sjekk((await t.finnes(".spillhjem")) && S.spill === null && S.gjest === null && S.rekord === null && S.oppsett.modus === "lag" && S.oppsett.kamp === "best3" && S.antall === 5, `Søppel i lagringen ga ikke en ren start: ${JSON.stringify({ oppsett: S.oppsett, antall: S.antall })}`);
  await lagre({ skjerm: "karing", _tid: Date.now(), spill: "tull", oppsett: { modus: "sammen", lag: "x", tid: 7 }, antall: 19 });
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  S = await tilstand();
  t.sjekk((await t.finnes(".spillhjem")) && S.spill === null && S.oppsett.modus === "sammen" && S.antall === 4 && S.oppsett.tid === 0, `Halvveis ødelagt lagring: ${JSON.stringify({ oppsett: S.oppsett, antall: S.antall })}`);
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#skjerm.skjerm-oppsett [data-h="modus"][data-v="sammen"][aria-pressed="true"]'), "Oppsettet åpnet seg ikke etter en ødelagt lagring");
}
