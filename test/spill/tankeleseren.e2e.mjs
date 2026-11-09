// Tankeleseren: co-op game of 8 rounds (hold to peek, change card, drag the needle with a real
// touch, keyboard and ◀ ▶, lock, reveal, reload and continue), then a team game with the
// left/right bet until a team reaches 10. Also checks a narrow 320 px phone.
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

async function smalBilde(t, navn) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(400);
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på 320 px («${navn}»): ${over}px`);
  await t.js("window.scrollTo(0, 0)");
  // The controls under the dial must not hide behind the dock
  const m = await t.js(`(() => { const f = document.querySelector('.tl-fin, .tl-holdknapp'); const k = document.querySelector('.dokk .knapp');
    return f && k ? { f: f.getBoundingClientRect().bottom, k: k.getBoundingClientRect().top } : null; })()`);
  if (m) t.sjekk(m.f <= m.k + 2, `Knappene under skiva gjemmer seg bak dokken på 320×568 («${navn}»)`);
  await t.skjermbilde(join(bildemappe(t.id), `smal-${navn}-320.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(300);
}

// Player names as stored (the runner may replace them, e.g. with --probe).
const navnet = (t, i) => t.js(`JSON.parse(localStorage.getItem("rusj.felles")).navn[${i}]`);

// Tablet / computer: the dial and the main button must fit without scrolling.
async function bredBilde(t, navn, bredde, hoyde) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 1, mobile: false });
  await t.sov(450);
  await t.js("window.scrollTo(0, 0)");
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const m = await t.js(`(() => { const s = document.querySelector('.tl-skive').getBoundingClientRect(); const k = document.querySelector('.dokk .knapp').getBoundingClientRect();
    const f = document.querySelector('.tl-fin, .tl-holdknapp'); return { skive: s.bottom, fin: f ? f.getBoundingClientRect().bottom : s.bottom, knapp: k.top, bunn: k.bottom }; })()`);
  t.sjekk(m.fin <= m.knapp + 2 && m.bunn <= hoyde + 1, `Skiva og knappene får ikke plass på ${bredde}×${hoyde} («${navn}»)`);
  await t.skjermbilde(join(bildemappe(t.id), `bred-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(300);
}

const spill = async (t) => (await t.tilstand()).spill;

// Client coordinates of value v (0–100) on the dial, r = distance from the centre in SVG units.
const punkt = (t, v, r = 80) =>
  t.js(`(() => { const s = document.querySelector('.tl-skive svg').getBoundingClientRect(); const a = Math.PI * ${v} / 100;
    const x = 120 - ${r} * Math.cos(a), y = 122 - ${r} * Math.sin(a);
    return { x: s.left + x / 240 * s.width, y: s.top + y / 136 * s.height }; })()`);

// A real finger drag from one value to another.
async function dra(t, fra, til) {
  await t.js("document.querySelector('.tl-skive').scrollIntoView({ block: 'center' })");
  await t.sov(150);
  const a = await punkt(t, fra);
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 12; i++) {
    const p = await punkt(t, fra + ((til - fra) * i) / 12);
    await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y }] });
    await t.sov(16);
  }
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sov(200);
}

async function tast(t, key, tallkode, n = 1) {
  for (let i = 0; i < n; i++) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: tallkode });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: tallkode });
  }
  await t.sov(80);
}

// Put the needle on a value with the keyboard (Home, then → steps), as a keyboard user would.
async function settMedTaster(t, verdi) {
  await t.js(`(() => { const s = document.querySelector('.tl-skive[role="slider"]'); s.focus();
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    for (let i = 0; i < ${Math.round(verdi)}; i++) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); })()`);
  await t.sov(60);
}

async function holdOgSe(t) {
  const slipp = await t.hold(".tl-holdknapp", 700);
  t.sjekk(await t.finnes(".tl-skive.apen"), "Skiva åpnet seg ikke når hintgiveren holdt knappen");
  await slipp();
  await t.vent("!document.querySelector('#tl-klar').disabled", 3000);
  // The target must not stay in the hidden screen-reader message when the phone is passed on
  t.sjekk(!/Målet ligger/.test(await t.tekst("#si")), "Hvor målet ligger, ble liggende i skjermleser-meldingen");
}

// A double tap: a real tap on `sel`, then 110 ms later a second real tap on `nesteSel` (the button
// that appears under the finger on the next screen). Aiming at it covers every layout, worst case.
async function dobbeltTrykk(t, sel, nesteSel) {
  await t.js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center" })`);
  await t.sov(150);
  const midt = (s) => t.js(`(() => { const e = document.querySelector(${JSON.stringify(s)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const trykk = async (p) => {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const forste = await midt(sel);
  await trykk(forste);
  await t.sov(110);
  await trykk((nesteSel && (await midt(nesteSel))) || forste);
  await t.sov(500);
}

// Every card at this screen width: labels may only break between words (no «sam-le»).
async function sjekkEtiketter(t, bredde) {
  const ord = await t.js(`(() => {
    const D = window.RUSJ_DATA.spektrum;
    const kort = document.querySelector('.tl-kort');
    const tegn = kort.cloneNode(true);
    tegn.style.cssText = "position: fixed; left: -9999px; top: 0; width: " + kort.getBoundingClientRect().width + "px";
    document.body.appendChild(tegn);
    const ut = [];
    const sjekk = (el, tekst) => {
      const s = el.querySelector('span');
      s.textContent = tekst;
      // Measure each word on its own: no word may be wider than the line it sits on.
      const linje = s.getBoundingClientRect().width;
      for (const w of tekst.split(/\\s+/)) {
        const m = document.createElement('span');
        m.style.whiteSpace = 'nowrap';
        m.textContent = w;
        s.appendChild(m);
        const b = m.getBoundingClientRect().width;
        m.remove();
        if (b > linje + 1) ut.push(w);
      }
      s.textContent = tekst;
    };
    for (const p of D.pakker) for (const [v, h] of p.par) {
      const [a, b] = tegn.querySelectorAll('.tl-ende');
      a.className = 'tl-ende v' + (Math.max(...v.split(/\\s+/).map(o => o.length)) >= 15 || v.length > 30 ? ' ekstra-lang' : Math.max(...v.split(/\\s+/).map(o => o.length)) >= 12 || v.length > 22 ? ' lang' : '');
      b.className = 'tl-ende h' + (Math.max(...h.split(/\\s+/).map(o => o.length)) >= 15 || h.length > 30 ? ' ekstra-lang' : Math.max(...h.split(/\\s+/).map(o => o.length)) >= 12 || h.length > 22 ? ' lang' : '');
      sjekk(a, v);
      sjekk(b, h);
    }
    tegn.remove();
    return ut;
  })()`);
  t.sjekk(ord.length === 0, `${ord.length} ord må deles midt i ordet på ${bredde} px: ${ord.slice(0, 6).join(", ")}`);
}

const poengFor = (d) => (d <= 2.5 + 1e-9 ? 4 : d <= 7.5 + 1e-9 ? 3 : d <= 12.5 + 1e-9 ? 2 : 0);

async function ventResultat(t) {
  await t.vent("document.querySelector('.tl-resultat .stempel')", 9000);
  await t.vent("!document.querySelector('[data-h=\"neste\"]').disabled", 3000);
}

export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke tre spillere");
  await t.klikk('[data-h="pakke"][data-v="barn"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.includes("barn"), "Barn-pakken ble ikke valgt");
  await t.klikk('[data-h="start"]');

  // ---------- Round 1: hand over, peek, change card ----------
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  t.sjekk((await t.tekst("#skjerm h1")).includes(await navnet(t, 0)), "Første hintgiver er ikke spiller 1");
  await t.bilde("gi");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.tl-kikk')");
  t.sjekk(await t.js("document.querySelector('#tl-klar').disabled"), "«Jeg har et hint» skulle være låst før målet er sett");
  t.sjekk((await t.antall(".tl-skive .tl-sone")) >= 3, "Målet er ikke tegnet under dekselet");
  await t.bilde("hint");
  await smalBilde(t, "hint");
  await bredBilde(t, "hint", 1024, 768);
  // A reload on the secret screen goes back to "give the phone to …"
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="jeg-er"]'), "Omlasting på hint-skjermen skulle gå tilbake til «Gi mobilen til»");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.tl-kikk')");
  const slipp = await t.hold(".tl-skive", 900);
  t.sjekk(await t.finnes(".tl-skive.apen"), "Skiva åpnet seg ikke når hintgiveren holdt inne");
  await t.bilde("hint-holdt");
  await slipp();
  t.sjekk(!(await t.finnes(".tl-skive.apen")), "Skiva lukket seg ikke igjen");
  t.sjekk(!(await t.js("document.querySelector('#tl-klar').disabled")), "Knappen ble ikke åpnet etter at målet var sett");

  const forKort = (await spill(t)).par.join("|");
  await t.klikk('[data-h="bytt-kort"]');
  let sp = await spill(t);
  t.sjekk(sp.par.join("|") !== forKort && sp.sett === false, "«Bytt kort» ga ikke ny skala");
  await holdOgSe(t);
  await t.klikk('[data-h="hint-klar"]');

  // ---------- Guessing: drag, keys, buttons ----------
  await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
  await dra(t, 50, 22);
  sp = await spill(t);
  t.sjekk(Math.abs(sp.viser - 22) <= 1.5, `Viseren fulgte ikke fingeren (står på ${sp.viser}, ventet 22)`);
  await dra(t, 22, 81);
  sp = await spill(t);
  t.sjekk(Math.abs(sp.viser - 81) <= 1.5, `Viseren fulgte ikke fingeren andre gang (står på ${sp.viser}, ventet 81)`);
  const vinkel = await t.js("document.querySelector('.tl-viser').style.transform");
  t.sjekk(/rotate\(14[0-9]/.test(vinkel), `Viseren er ikke tegnet der den skal (${vinkel})`);
  await t.js("document.querySelector('.tl-skive').focus()");
  await tast(t, "ArrowLeft", 37, 3);
  const etterTaster = (await spill(t)).viser;
  t.sjekk(Math.abs(etterTaster - (Math.ceil(sp.viser) - 3)) < 0.01, `Piltastene flyttet ikke viseren riktig (${sp.viser} → ${etterTaster})`);
  await t.klikk('[data-h="flytt"][data-v="1"]', 120);
  t.sjekk(Math.abs((await spill(t)).viser - (etterTaster + 1)) < 0.01, "▶-knappen flyttet ikke viseren ett steg");
  t.sjekk((await t.js("document.querySelector('.tl-skive').getAttribute('aria-valuenow')")) === String(Math.round(etterTaster + 1)), "aria-valuenow følger ikke viseren");
  await t.bilde("gjett");
  await bredBilde(t, "gjett", 1024, 768);
  await bredBilde(t, "gjett", 1440, 900);
  await bredBilde(t, "gjett", 768, 1024);
  // No scale label may break inside a word, on any card, at the normal and the narrowest phone
  await sjekkEtiketter(t, MOBIL.width);
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  await sjekkEtiketter(t, 320);
  // Short screen (375×560): the dial, its buttons and the main button all show without scrolling
  await t.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 560, deviceScaleFactor: 2, mobile: true });
  await t.sov(400);
  await t.js("window.scrollTo(0, 0)");
  const kort = await t.js(`(() => { const f = document.querySelector('.tl-fin').getBoundingClientRect(); const s = document.querySelector('.tl-skive').getBoundingClientRect(); const k = document.querySelector('.dokk .knapp').getBoundingClientRect(); return { fin: f.bottom, skiveTopp: s.top, knapp: k.top, bunn: k.bottom }; })()`);
  t.sjekk(kort.fin <= kort.knapp + 2 && kort.skiveTopp >= 0 && kort.bunn <= 561, "Skiva og knappene får ikke plass på 375×560");
  await t.skjermbilde(join(bildemappe(t.id), "kort-gjett-375x560.png"));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(300);
  // The front page sees a game in progress
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet regnes ikke som pågående (pagar)");

  // Reload while guessing keeps the needle
  const forLast = await spill(t);
  await t.lastSide(t.side, "document.querySelector('.tl-skive[role=\"slider\"]')");
  t.sjekk(Math.abs((await spill(t)).viser - forLast.viser) < 0.01, "Viseren flyttet seg etter omlasting");

  // Lock and reveal
  await t.klikk('[data-h="las"]', 100);
  await t.bilde("avsloring");
  await ventResultat(t);
  sp = await spill(t);
  const l1 = sp.logg[0];
  t.sjekk(l1.poeng === poengFor(Math.abs(l1.viser - l1.mal)), `Feil poeng: ${l1.poeng} for avstand ${Math.abs(l1.viser - l1.mal)}`);
  t.sjekk(await t.finnes(".tl-skive.apen .tl-sone.s4"), "Målet vises ikke etter avsløringen");
  await t.bilde("fasit");
  await smalBilde(t, "fasit");

  // ---------- Rounds 2–8 ----------
  for (let runde = 2; runde <= 8; runde++) {
    await t.klikk('[data-h="neste"]');
    await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
    const forventet = await navnet(t, (runde - 1) % 3);
    t.sjekk((await t.tekst("#skjerm h1")).includes(forventet), `Runde ${runde}: feil hintgiver`);
    if (runde === 3) {
      // Back to the home screen and continue
      await t.klikk("#tilbake");
      t.sjekk(await t.finnes('.knapp[data-h="fortsett"]'), "Mangler «Fortsett» som hovedknapp midt i spillet");
      await t.klikk('[data-h="nytt"]');
      await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
      await t.klikk('#ark [data-v="nei"]');
      t.sjekk((await spill(t)) !== null, "Spillet forsvant selv om vi trykket «Avbryt»");
      await t.klikk('[data-h="fortsett"]');
      await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
    }
    await t.klikk('[data-h="jeg-er"]');
    await holdOgSe(t);
    await t.klikk('[data-h="hint-klar"]');
    await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
    const mal = (await spill(t)).mal;
    // Bullseye on even rounds, a miss on round 5, near on the others
    const sikte = runde === 5 ? (mal > 50 ? mal - 40 : mal + 40) : runde % 2 === 0 ? mal : mal + (mal > 50 ? -6 : 6);
    await settMedTaster(t, sikte);
    await t.klikk('[data-h="las"]', 100);
    await ventResultat(t);
    if (runde === 2) await t.bilde("fasit-full-pott");
    if (runde === 5) await t.bilde("fasit-bom");
  }
  sp = await spill(t);
  t.sjekk(sp.logg.length === 8, `Spillet har ${sp.logg.length} runder, ventet 8`);
  t.sjekk(/Se kåringen/.test(await t.tekst('[data-h="neste"]')), "Siste runde viser ikke «Se kåringen»");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.tl-logg')");
  t.sjekk((await t.antall(".tl-logg li")) === 8, "Resultatet viser ikke alle åtte rundene");
  const sum = sp.logg.reduce((s, l) => s + l.poeng, 0);
  t.sjekk((await t.tekst(".tl-total")).includes(String(sum)), "Resultatet viser feil poengsum");
  await t.bilde("slutt-sammen", true);
  await smalBilde(t, "slutt-sammen");
  t.sjekk((await t.tilstand())._aktiv === false, "Kåringen skulle ikke regnes som et pågående spill");

  // ---------- Lag mot lag ----------
  t.sjekk(await t.finnes('a.lenke[href="/"]'), "Sluttskjermen mangler lenken «Alle spill»");
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  await t.vent("document.querySelectorAll('.spiller').length === 4");
  await t.skrivInn("#navn-3", "Testspiller D");
  let S = await t.tilstand();
  t.sjekk(S.oppsett.lag.filter((l) => l === 0).length === 2, "Lagene er ikke delt likt");
  await t.klikk('[data-h="bytt-lag"][data-v="0"]');
  t.sjekk(await t.js("document.querySelector('[data-h=\"start\"]').disabled"), "Start skulle være låst når et lag har én spiller");
  await t.klikk('[data-h="bytt-lag"][data-v="0"]');
  await t.bilde("oppsett-lag", true);
  await smalBilde(t, "oppsett-lag");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.tl-lagmerke')");
  await t.bilde("gi-lag");

  let runder = 0;
  let tippet = false;
  for (;;) {
    runder++;
    if (runder > 14) {
      t.feil("Lag mot lag ble aldri ferdig");
      break;
    }
    if (!(await t.finnes('[data-h="jeg-er"]'))) await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
    const forSp = await spill(t);
    t.sjekk(forSp.lag[forSp.giver] === forSp.tur, `Runde ${runder}: hintgiveren er ikke på laget som har tur`);
    await t.klikk('[data-h="jeg-er"]');
    await holdOgSe(t);
    await t.klikk('[data-h="hint-klar"]');
    await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
    const mal = (await spill(t)).mal;
    await settMedTaster(t, mal);
    if (runder === 1) {
      await smalBilde(t, "gjett-lag");
      // A double tap on «Lås svaret» (real taps, 110 ms apart) locks the answer but must not place
      // the other team's bet, even when «Høyre» lands right under the finger.
      await dobbeltTrykk(t, '[data-h="las"]', '[data-h="tipp"][data-v="h"]');
      const etterDobbelt = await spill(t);
      t.sjekk(etterDobbelt.fase === "motlag" && etterDobbelt.tipp == null && etterDobbelt.logg.length === 0, "Dobbelttrykk på «Lås svaret» la inn motlagets tips");
      // Nothing is revealed yet, so the guessing team may still move the needle
      t.sjekk(await t.finnes('[data-h="angre-las"]'), "Mangler «Angre» på motlagets skjerm");
      await t.klikk('[data-h="angre-las"]');
      await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
      t.sjekk((await spill(t)).fase === "gjett", "«Angre» ga ikke viseren tilbake til laget");
      await settMedTaster(t, mal);
    }
    await t.klikk('[data-h="las"]');
    await t.vent("document.querySelector('[data-h=\"tipp\"]')");
    if (!tippet) {
      await t.bilde("motlag"); // (also lets the short guard on the bet buttons pass)
      const sp2 = await spill(t);
      const svar = sp2.mal < sp2.viser ? "v" : "h";
      await t.klikk(`[data-h="tipp"][data-v="${svar}"]`);
      tippet = true;
      await ventResultat(t);
      const l = (await spill(t)).logg[0];
      t.sjekk(l.poeng === 4 && l.tipp === svar, "Første lagrunde ga ikke full pott og registrert tips");
      const fasitRiktig = svar === "v" ? l.mal < l.viser : l.mal > l.viser;
      t.sjekk(l.tippRiktig === fasitRiktig, "Tipset til motlaget ble vurdert feil");
      await t.bilde("fasit-lag");
    } else {
      await t.klikk('[data-h="tipp"][data-v="-"]');
      await ventResultat(t);
    }
    const etter = await spill(t);
    if (etter.vinner != null) break;
    await t.klikk('[data-h="neste"]');
  }
  sp = await spill(t);
  const p = [0, 0];
  for (const l of sp.logg) {
    p[l.lag] += l.poeng;
    if (l.tippRiktig) p[1 - l.lag] += 1;
  }
  t.sjekk(sp.vinner != null && p[sp.vinner] >= 10 && p[sp.vinner] > p[1 - sp.vinner], `Feil vinner: ${JSON.stringify(p)}, vinner ${sp.vinner}`);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.tl-vinner')");
  t.sjekk(new RegExp(sp.vinner === 0 ? "Rosa" : "Blå").test(await t.tekst("#skjerm h1")), "Vinnerlaget vises ikke");
  await t.bilde("slutt-lag", true);

  // "Spill igjen" starts a fresh team game with the same teams
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  const ny = await spill(t);
  t.sjekk(ny.modus === "lag" && ny.logg.length === 0 && ny.runde === 1, "«Spill igjen» startet ikke et nytt spill");

  // ---------- Sammen with 10 players: one round per player, so everybody gives a hint ----------
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.klikk('[data-h="modus"][data-v="sammen"]');
  for (let i = (await t.antall(".spiller")); i < 10; i++) await t.klikk('[data-h="spiller-legg-til"]', 60);
  t.sjekk((await t.antall(".spiller")) === 10, "Fikk ikke lagt til ti spillere");
  t.sjekk(/10/.test(await t.tekst('[data-h="modus"][data-v="sammen"]')), "Oppsettet sier ikke at det blir 10 runder");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  t.sjekk((await spill(t)).runder === 10, "Med ti spillere skulle det bli ti runder");
  await t.klikk('[data-h="jeg-er"]');
  await holdOgSe(t);
  await t.klikk('[data-h="hint-klar"]');
  await t.vent("document.querySelector('.tl-skive[role=\"slider\"]')");
  t.sjekk(/Runde 1 av 10/i.test(await t.tekst("#topp-tittel")), "Toppen viser ikke «Runde 1 av 10»");
  await t.bilde("sammen-10-spillere");
}
