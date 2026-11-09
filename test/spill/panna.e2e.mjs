// Panna: setup → a round played by tilting (synthetic sensor events, iOS permission stubbed) and
// tapping → landscape → pause → reload → time runs out → fix a word → next player plays in tap mode
// → final podium → a declined iPhone and a game without points.
// Regression checks from the review: a round interrupted before the first word and reopened hours
// later, back twice before the first word, the last deck can't be switched off, a tilt during the
// answer lock, tap mode says who taps, no extra iPhone button, short and landscape-short screens.
// Extra screen sizes are shot with t.skjermbilde (the runner's own checks use its start size).
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

// Back to the size the runner was started with (--bredde / --hoyde, default 390×844).
const flagg = (n, std) => {
  const i = process.argv.indexOf(n);
  return (i > 0 && Number(process.argv[i + 1])) || std;
};
const STAAENDE = { width: flagg("--bredde", 390), height: flagg("--hoyde", 844), deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "portraitPrimary", angle: 0 } };
const LIGGENDE = { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "landscapePrimary", angle: 90 } };
const LITEN_LIGGENDE = { width: 568, height: 320, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "landscapePrimary", angle: 90 } };
const staaende = (b, h) => ({ width: b, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "portraitPrimary", angle: 0 } });

export default async function (t) {
  const i = process.argv.indexOf("--bilder");
  const mappe = join(i > 0 ? resolve(process.argv[i + 1]) : join(tmpdir(), "rusj-e2e"), t.id);
  mkdirSync(mappe, { recursive: true });
  let nr = 0;

  // Is this element above the dock (what the screen is about must not hide behind the buttons)?
  const overDokk = (sel) =>
    t.js(`(() => {
      window.scrollTo(0, 0);
      const el = document.querySelector(${JSON.stringify(sel)});
      const d = document.querySelector("#skjerm .dokk");
      if (!el || !d) return true;
      return el.getBoundingClientRect().bottom <= d.getBoundingClientRect().top + 8;
    })()`);
  const utenforSkjermen = () =>
    t.js(`Array.from(document.querySelectorAll("#skjerm *, .ark *")).filter((el) => {
      if (el.closest("svg, canvas, [data-utenfor-ok]")) return false;
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return b.width && b.height && s.visibility !== "hidden" && Number(s.opacity) !== 0 && (b.right > innerWidth + 2 || b.left < -2);
    }).map((el) => el.textContent.trim().slice(0, 30))`);

  // The smallest phones (320×568) and the short-screen rule (375×560): nothing sticks out
  // sideways, and «synlig» (the heart of the screen) is above the dock.
  const smal = async (navn, synlig) => {
    for (const [b, h] of [
      [320, 568],
      [375, 560],
    ]) {
      await t.send("Emulation.setDeviceMetricsOverride", staaende(b, h));
      await t.sov(450);
      const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
      t.sjekk(bred <= 0, `Sidelengs scrolling ved ${b}×${h} på «${navn}»: ${bred}px`);
      const utenfor = await utenforSkjermen();
      t.sjekk(!utenfor.length, `Tekst stikker utenfor ved ${b}×${h} på «${navn}»: ${utenfor.join(", ")}`);
      if (synlig) t.sjekk(await overDokk(synlig), `«${synlig}» er skjult bak knappene ved ${b}×${h} på «${navn}»`);
      if (b === 320) await t.skjermbilde(join(mappe, `S${++nr}-${navn}-320.png`));
    }
    await t.send("Emulation.setDeviceMetricsOverride", STAAENDE);
    await t.sov(400);
  };
  const landskap = async (navn) => {
    await t.send("Emulation.setDeviceMetricsOverride", LIGGENDE);
    await t.sov(700);
    const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Sidelengs scrolling i landskap på «${navn}»: ${bred}px`);
    await t.skjermbilde(join(mappe, `L${++nr}-${navn}-landskap.png`));
    await t.send("Emulation.setDeviceMetricsOverride", STAAENDE);
    await t.sov(500);
  };
  // A small phone on its side (568×320): the ready screen fits above the dock, and the player's
  // name only wraps between words.
  const liggendeLiten = async (navn, ord) => {
    await t.send("Emulation.setDeviceMetricsOverride", LITEN_LIGGENDE);
    await t.sov(700);
    t.sjekk(await overDokk(".panna-klar-b"), `Forklaringen er skjult bak knappene ved 568×320 på «${navn}»`);
    if (ord) {
      const hel = await t.js(`(() => {
        const h = document.querySelector("#skjerm h1");
        const tekst = h && h.firstChild;
        const i = tekst ? tekst.textContent.indexOf(${JSON.stringify(ord)}) : -1;
        if (i < 0) return true;
        const r = document.createRange();
        r.setStart(tekst, i);
        r.setEnd(tekst, i + ${ord.length});
        return r.getClientRects().length === 1;
      })()`);
      t.sjekk(hel, `Navnet brytes midt i et ord ved 568×320 på «${navn}»`);
    }
    t.sjekk(!(await utenforSkjermen()).length, `Tekst stikker utenfor ved 568×320 på «${navn}»`);
    await t.skjermbilde(join(mappe, `K${++nr}-${navn}-568x320.png`));
    await t.send("Emulation.setDeviceMetricsOverride", STAAENDE);
    await t.sov(500);
  };
  const runde = async () => (await t.tilstand()).spill.runde;
  const fase = (f) => `document.querySelector('#panna-scene[data-fase="${f}"]')`;
  // A fake motion sensor: the page sends the current angle 25 times a second, like a real phone.
  const sensor = () =>
    t.js(`(() => {
      window.__vinkel = { beta: 0, gamma: 88 };
      clearInterval(window.__sensor);
      window.__sensor = setInterval(() => window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: 0, beta: window.__vinkel.beta, gamma: window.__vinkel.gamma })), 40);
    })()`);
  const vinkel = (beta, gamma) => t.js(`window.__vinkel = { beta: ${beta}, gamma: ${gamma} }`);
  const NOYTRAL = [0, 88]; // phone on its side, screen facing straight out
  const NED = [180, -45]; // screen tipped 45° towards the floor
  const OPP = [0, 45]; // screen tipped 45° towards the ceiling

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  // Pretend to be an iPhone: the motion sensor needs permission, asked for in a tap.
  await t.js(`window.__spurt = 0; DeviceOrientationEvent.requestPermission = () => { window.__spurt++; return Promise.resolve("granted"); }`);
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk((await t.antall(".panna-stokk")) >= 12, "Mangler kortstokker i oppsettet");

  // Decks: Kaos on, Mat off; a word-bank category at the easiest level; one round each
  await t.klikk('[data-h="stokk"][data-v="kaos"]');
  await t.klikk('[data-h="stokk"][data-v="mat"]');
  let S = await t.tilstand();
  t.sjekk(S.oppsett.stokker.includes("kaos") && !S.oppsett.stokker.includes("mat"), "Kortstokkvalget ble ikke lagret");
  await t.klikk('[data-h="vis-ob"]');
  await t.klikk('[data-h="ob"][data-v="rommet"]');
  await t.klikk('[data-h="nivaa"][data-v="1"]');
  await t.klikk('[data-h="runder"][data-v="1"]');
  if ((await t.antall(".spiller")) > 2) await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  t.sjekk((await t.antall(".spiller")) === 2, "Fikk ikke fjernet en spiller");
  S = await t.tilstand();
  t.sjekk(S.oppsett.ordbank.includes("rommet") && S.oppsett.nivaa === 1 && S.oppsett.runder === 1, "Ordbank/nivå/runder ble ikke lagret");
  await t.bilde("oppsett-ordbank", true);
  await smal("oppsett");
  await t.klikk('[data-h="start"]');

  // Ready screen for player 1 on an «iPhone»: no extra permission button – «Start runden» asks
  await t.vent(`/Tillat/.test((document.querySelector(".panna-status") || {}).textContent || "")`);
  t.sjekk(!(await t.finnes('[data-h="tillat"]')), "Klar-skjermen har en egen «Slå på vipping»-knapp i tillegg til «Start runden»");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Klar-skjermen viser ikke Testspiller A");
  await t.bilde("klar-iphone");
  await smal("klar-iphone", ".panna-forklaring");
  await liggendeLiten("klar", "Testspiller");
  await sensor();

  // Start: asks for the sensor, waits for the phone on the forehead, counts down, shows a word
  await t.klikk('[data-h="kjor"]', 100);
  t.sjekk((await t.js("window.__spurt")) === 1, "«Start runden» spurte ikke om lov til bevegelsessensoren");
  await t.vent(fase("plasser"), 3000);
  await t.bilde("plasser");
  await t.vent(fase("nedtelling"), 5000);
  await t.bilde("nedtelling");
  await t.vent(fase("spill"), 6000);
  await t.sov(600);
  t.sjekk((await t.js(`document.querySelector('#panna-scene').dataset.rot`)) === "-90", "Scenen snudde seg ikke med rotasjonslås på");
  t.sjekk((await t.tekst("#panna-ord")).trim().length > 0, "Ingen ord på panna");
  await t.bilde("runde-rotert");

  // Tilt down = correct, back to neutral, tilt up = pass
  await vinkel(...NED);
  await t.vent(`(JSON.parse(localStorage.getItem("rusj.panna.v1")).spill.runde.ord[0] || {}).ok === true`, 3000);
  await vinkel(...NOYTRAL);
  await t.sov(800);
  await vinkel(...OPP);
  await t.vent(`(JSON.parse(localStorage.getItem("rusj.panna.v1")).spill.runde.ord[1] || {}).ok === false`, 3000);
  await vinkel(...NOYTRAL);
  await t.sov(800);
  t.sjekk((await runde()).ord.length === 3, "Vipping ga ikke nytt ord");

  // Tap zones: right = correct, left = pass
  await t.klikk(".panna-sone.riktig", 800);
  await t.klikk(".panna-sone.pass", 800);
  let r = await runde();
  t.sjekk(r.ord[2].ok === true && r.ord[3].ok === false, "Trykkfeltene virker ikke");
  t.sjekk((await t.tekst("#panna-poeng")).includes("2"), "Poengtelleren viser ikke 2");

  // Regression: a tilt that starts while the answer flash locks input must not count afterwards
  await t.klikk(".panna-sone.riktig", 60);
  await vinkel(...NED);
  await t.sov(1100);
  r = await runde();
  t.sjekk(r.ord.length === 6 && r.ord[4].ok === true && r.ord[5].ok === null, "En vipp som startet under låsen ble talt på neste ord");
  await vinkel(...NOYTRAL);
  await t.sov(600);

  // The flash, frozen for the picture
  await t.js(`document.querySelector('#panna-blink i').textContent = "✓"; document.querySelector('#panna-blink b').textContent = "Riktig!"; document.querySelector('#panna-blink').className = "panna-blink vis riktig"`);
  await t.sov(150);
  await t.skjermbilde(join(mappe, `F1-blink-riktig.png`));
  await t.js(`document.querySelector('#panna-blink').className = "panna-blink"`);

  // Landscape: the browser rotates, the stage fills the screen
  await landskap("runde");
  // Back in portrait with the phone still sideways: the stage turns itself again after a moment
  await t.vent(`document.querySelector('#panna-scene[data-rot="-90"]')`, 3000);

  // Pause button, then a reload in the middle of the round
  await t.klikk(".panna-pauseknapp", 300);
  t.sjekk((await runde()).fase === "pause", "Pause virket ikke");
  await t.bilde("pause");
  const igjen = (await runde()).igjen;
  await t.lastSide(t.side, "document.querySelector('#panna-scene')");
  r = await runde();
  t.sjekk(r && r.fase === "pause" && r.ord.length === 6, "Runden ble ikke gjenopprettet på pause etter omlasting");
  t.sjekk(Math.abs(r.igjen - igjen) < 1.5, "Tiden ble ikke tatt vare på etter omlasting");
  await t.klikk('[data-h="fortsett-runde"]');
  await t.vent(fase("spill"), 6000);

  // Back button during play pauses instead of leaving
  await t.js(`Rusj.tilbake()`);
  await t.sov(200);
  t.sjekk((await runde()).fase === "pause", "Tilbake-knappen satte ikke runden på pause");
  await t.klikk('[data-h="fortsett-runde"]');
  await t.vent(fase("spill"), 6000);

  // Let the clock run out
  await t.js(`Rusj.timer("panna-tid").leggTil(-500)`);
  await t.vent(fase("slutt"), 3000);
  await t.bilde("tiden-ute");
  await t.vent(`document.querySelector('.panna-ordliste')`, 5000);
  await t.bilde("resultat", true);
  await smal("resultat", ".panna-banner");
  S = await t.tilstand();
  const h = S.spill.historikk[0];
  t.sjekk(h && h.ord.length === 6 && h.ord[5].ute, "Siste ord ble ikke merket som «tiden gikk ut»");
  t.sjekk(h.ord.filter((o) => o.ok).length === 3, "Feil antall riktige etter første runde");

  // Fix a mistake: the passed word was right after all
  await t.klikk('[data-h="rett"][data-v="1"]');
  S = await t.tilstand();
  t.sjekk(S.spill.historikk[0].ord[1].ok === true, "Kunne ikke rette et ord");
  t.sjekk(/4/.test(await t.tekst(".panna-stortall")), "Resultatet ble ikke oppdatert etter retting");
  await landskap("resultat");

  // Change decks in the sheet without losing the score
  await t.klikk('[data-h="bytt"]');
  await t.klikk('#ark [data-h="stokk"][data-v="film"]');
  t.sjekk((await t.js(`document.querySelector('#ark [data-h="stokk"][data-v="film"]').getAttribute("aria-pressed")`)) === "true", "Bytt kortstokk oppdaterte ikke flisen");
  await t.bilde("bytt-kortstokk");
  await t.klikk('[data-h="bytt-ferdig"]');
  t.sjekk((await t.tilstand()).oppsett.stokker.includes("film"), "Filmfigurer ble ikke valgt");

  // Next player: Testspiller B, tap mode (no sensor after the reload) – and it says who taps
  await t.klikk('[data-h="neste"]');
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Neste spiller er ikke Testspiller B");
  await t.vent(`document.querySelector('.panna-mini')`, 4000);
  t.sjekk(/En av de andre trykker/.test(await t.tekst(".panna-steg")), "Trykkmodus sier ikke at en av de andre trykker");
  await t.bilde("klar-trykk");
  await landskap("klar");
  await smal("klar", ".panna-forklaring");

  // Home and back: the game survives
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» på hjem-skjermen");
  await t.bilde("hjem-fortsett");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» skal være hovedknappen mens et spill pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» spør ikke før spillet kastes");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Avbrutt «Nytt spill» slettet spillet");
  await t.klikk('[data-h="fortsett"]');
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Fortsett gikk ikke tilbake til Testspiller B");

  // Regression: a round interrupted during the countdown and the page opened hours later –
  // «Fortsett» brings the player back to the ready screen, with the score intact
  await t.js(`(() => {
    const s = JSON.parse(localStorage.getItem("rusj.panna.v1"));
    s.spill.runde = { fase: "nedtelling", ord: [], tid: 60, igjen: 60 };
    s.spill.skjerm = "runde";
    s.skjerm = "runde";
    s._tid = Date.now() - 4 * 3600 * 1000;
    localStorage.setItem("rusj.panna.v1", JSON.stringify(s));
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.klikk('[data-h="fortsett"]');
  t.sjekk((await t.finnes('[data-h="kjor"]')) && /Testspiller B/.test(await t.tekst("#skjerm h1")), "«Fortsett» virker ikke etter en avbrutt runde som åpnes timer senere");
  S = await t.tilstand();
  t.sjekk(!S.spill.runde && S.spill.historikk.length === 1, "Den avbrutte runden ødela stillingen");

  // Cancel while getting ready: back to the ready screen, the turn is not used up
  await t.klikk('[data-h="kjor"]', 100);
  await t.vent(fase("plasser"), 3000);
  await t.klikk(".panna-pauseknapp", 200);
  t.sjekk((await runde()).fase === "pause", "Kunne ikke pause mens mobilen gjøres klar");
  await t.klikk('[data-h="avslutt-runde"]');
  S = await t.tilstand();
  t.sjekk(!S.spill.runde && S.spill.historikk.length === 1 && /Testspiller B/.test(await t.tekst("#skjerm h1")), "Avbryt før start brukte opp turen");

  // Regression: back twice before the first word also keeps the turn
  await t.klikk('[data-h="kjor"]', 100);
  await t.vent(fase("plasser"), 3000);
  await t.js(`Rusj.tilbake()`);
  await t.sov(150);
  await t.js(`Rusj.tilbake()`);
  await t.vent(`document.querySelector('[data-h="kjor"]')`, 3000);
  S = await t.tilstand();
  t.sjekk(!S.spill.runde && S.spill.historikk.length === 1, "To ganger tilbake før første ord brukte opp turen");

  await t.klikk('[data-h="kjor"]', 300);
  await t.vent(fase("spill"), 8000);
  t.sjekk((await t.js(`document.querySelector('#panna-scene').dataset.rot`)) === "0", "Scenen snudde seg uten sensor");
  await t.bilde("runde-trykk");
  await smal("runde-trykk");
  await t.klikk(".panna-sone.riktig", 800);
  await t.klikk(".panna-sone.riktig", 800);
  // Keyboard works too (arrow left = pass)
  await t.js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))`);
  await t.sov(800);
  r = await runde();
  t.sjekk(r.ord.length === 4 && r.ord[2].ok === false, "Piltastene virker ikke");
  await landskap("runde-trykk");
  // The phone locks or another app opens: the round pauses by itself
  await t.js(`Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"))`);
  await t.sov(200);
  t.sjekk((await runde()).fase === "pause", "Runden pauset ikke da fanen ble skjult");
  await t.js(`delete document.hidden`);
  await t.klikk('[data-h="avslutt-runde"]');
  await t.vent(`document.querySelector('.panna-ordliste')`);
  t.sjekk(/vinneren/i.test(await t.tekst(".dokk")), "Siste runde viser ikke «Se vinneren»");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  await smal("slutt", ".banner h1");
  t.sjekk(/Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke som «Testspiller A vinner!»");
  t.sjekk(await t.finnes(".flere-spill .flere-kort"), "Sluttskjermen foreslår ikke andre spill");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Mangler lenken «Alle spill»");

  // An iPhone that says no, in a game without points
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.js(`DeviceOrientationEvent.requestPermission = () => Promise.resolve("denied")`);
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="poeng"]');

  // Regression: the last deck can't be switched off
  if ((await t.tilstand()).oppsett.ordbank.length) await t.klikk('[data-h="ob"][data-v="rommet"]');
  for (const id of (await t.tilstand()).oppsett.stokker.slice(1)) await t.klikk(`[data-h="stokk"][data-v="${id}"]`);
  const sisteStokk = (await t.tilstand()).oppsett.stokker;
  t.sjekk(sisteStokk.length === 1, "Fikk ikke valgt bort kortstokker");
  await t.klikk(`[data-h="stokk"][data-v="${sisteStokk[0]}"]`);
  S = await t.tilstand();
  t.sjekk(S.oppsett.stokker.length === 1 && (await t.js(`document.querySelector('[data-h="stokk"][aria-pressed="true"]') !== null`)), "Den siste kortstokken kunne velges bort");
  await t.klikk('[data-h="start"]');

  await t.klikk('[data-h="kjor"]', 300);
  await t.vent(fase("spill"), 8000);
  await t.klikk(".panna-sone.riktig", 800);
  await t.klikk(".panna-pauseknapp", 300);
  await t.klikk('[data-h="avslutt-runde"]');
  await t.vent(`document.querySelector('.panna-ordliste')`);
  t.sjekk(!(await t.finnes(".poengliste")) && /Neste spiller/.test(await t.tekst(".dokk")), "Uten poeng skal resultatet vise «Neste spiller» og ingen poengliste");
  await t.bilde("resultat-uten-poeng");
  await t.klikk('[data-h="neste"]');
  t.sjekk(/ikke tillatt/.test(await t.tekst(".panna-status")) && (await t.finnes('[data-h="tillat"]')), "Avslått vipping vises ikke med «Prøv igjen»");
  await t.bilde("klar-nektet");

  // «Avslutt» asks first and ends the game
  await t.klikk('[data-h="kjor"]', 300);
  await t.vent(fase("spill"), 8000);
  await t.klikk(".panna-sone.pass", 800);
  await t.klikk(".panna-pauseknapp", 300);
  await t.klikk('[data-h="avslutt-runde"]');
  await t.vent(`document.querySelector('.panna-ordliste')`);
  t.sjekk((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte heter ikke bare «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent(`document.querySelector('[data-h="nytt"]')`);
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Spillet ble ikke avsluttet");
}
