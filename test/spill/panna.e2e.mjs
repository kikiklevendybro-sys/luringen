// Panna: setup → a round played by tilting (synthetic sensor events, iOS permission stubbed) and
// tapping → landscape → pause → reload → time runs out → fix a word → next player plays in tap mode
// → final podium → a declined iPhone and a game without points.
// Regression checks from the review: a round interrupted before the first word and reopened hours
// later, back twice before the first word, the last deck can't be switched off, a tilt during the
// answer lock, tap mode says who taps, no extra iPhone button, short and landscape-short screens.
// From the design round: feedback that needs neither sound nor vibration (full-screen flash with
// symbol and word, the trail of answers, the last seconds, «Tiden er ute!» over the whole stage),
// records and stars per deck and round length (also after a corrected word), the new decks with
// their own kind of clue, deck links (#mim, #jul), the player count from the gang's names, a new
// first player in every game, «Avslutt» on the ready screen, the crowning reported once to
// «Kveldens gjeng», sharing, plain dock buttons and a top bar that is out of reach behind the stage.
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
// Started on a phone on its side (--bredde 844 --hoyde 390): the browser has already turned the page,
// so the stage must NOT turn itself (that is only for a portrait screen with the rotation lock on).
const STARTER_LIGGENDE = STAAENDE.width > STAAENDE.height;
const ROT_SIDELENGS = STARTER_LIGGENDE ? "0" : "-90";
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
  // (The kit offers «Ha rusj som app» in a sheet after a finished game, at most twice per phone.
  // This phone has seen it twice, so the sheet doesn't cover the crowning in the test.)
  await t.js(`(() => { Rusj.felles.installTips = 2; Rusj.lagreFelles(); })()`);
  // Pretend to be an iPhone: the motion sensor needs permission, asked for in a tap.
  await t.js(`window.__spurt = 0; DeviceOrientationEvent.requestPermission = () => { window.__spurt++; return Promise.resolve("granted"); }`);
  await t.klikk('[data-h="nytt"]');
  // The gang has typed two names (in any game), so two players are set up – not three
  t.sjekk((await t.antall(".spiller")) === 2, `Oppsettet følger ikke gjengens navn: ${await t.antall(".spiller")} spillere for to navn`);
  await t.bilde("oppsett", true);
  // Sixteen decks: the four new ones are there, and Jul is first while it is the season, else last
  const stokkIder = await t.js(`Array.from(document.querySelectorAll(".panna-stokk")).map((b) => b.dataset.v)`);
  t.sjekk(stokkIder.length >= 16, "Mangler kortstokker i oppsettet");
  for (const id of ["mim", "lyd", "si", "jul"]) t.sjekk(stokkIder.includes(id), `Mangler kortstokken «${id}»`);
  const juletid = await t.js(`(() => { const d = new Date(); const m = d.getMonth() + 1; return m >= 11 || (m === 1 && d.getDate() <= 6); })()`);
  t.sjekk(juletid ? stokkIder[0] === "jul" : stokkIder[stokkIder.length - 1] === "jul", `Jul står ikke ${juletid ? "først i sesongen" : "sist utenfor sesongen"}: ${stokkIder.join(", ")}`);
  t.sjekk((await t.antall(".panna-stokk .panna-stjerner i")) === stokkIder.length * 3, "Kortstokkflisene viser ikke tre stjerner hver");
  t.sjekk(/5\D+8\D+11\D+60 s/.test(await t.tekst(".panna-stjernehjelp")), `Stjernehjelpen sier ikke 5, 8 og 11 riktige på 60 s: «${await t.tekst(".panna-stjernehjelp")}»`);
  const rekordLager = () => t.js(`JSON.parse(localStorage.getItem("rusj.panna.rekord") || "{}")`);
  const delStubb = () => t.js(`window.__delt = []; navigator.share = (d) => { window.__delt.push(d); return Promise.resolve(); }`);
  const sistDelt = async () => (await t.js("window.__delt || []")).pop() || {};

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
  t.sjekk(!(await t.finnes('.dokk .knapp .ikon')), "Hovedknappen «Start runden» skal være ren tekst");
  t.sjekk((await t.tekst('.dokk [data-h="avslutt"]')).trim() === "Avslutt", "Klar-skjermen mangler «Avslutt»");
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
  // The countdown faces the others: it tells them what to do
  t.sjekk(/uten å si ordet/.test(await t.js(`(document.querySelector(".panna-klargjor .panna-under") || {}).textContent || ""`)), "Nedtellingen sier ikke hva de andre skal gjøre");
  await t.bilde("nedtelling");
  await t.vent(fase("spill"), 6000);
  // The stage covers the top bar: its buttons must not be reachable behind it
  t.sjekk((await t.js(`getComputedStyle(document.querySelector(".topp")).visibility`)) === "hidden", "Toppknappene kan nås bak scenen");
  await t.sov(600);
  t.sjekk(
    (await t.js(`document.querySelector('#panna-scene').dataset.rot`)) === ROT_SIDELENGS,
    STARTER_LIGGENDE ? "Scenen snudde seg selv om skjermen alt ligger på siden" : "Scenen snudde seg ikke med rotasjonslås på",
  );
  t.sjekk((await t.tekst("#panna-ord")).trim().length > 0, "Ingen ord på panna");
  await t.bilde("runde-rotert");

  // Tilt down = correct, back to neutral, tilt up = pass
  // (Every answer is shown without sound: colour, symbol and word over the whole stage, and a
  // mark that stays in the trail on the card.)
  const blinket = () => t.js(`(() => { const b = document.querySelector("#panna-blink"); return { klasse: b.className, ord: b.querySelector("b").textContent, tegn: b.querySelector("i").textContent }; })()`);
  await vinkel(...NED);
  await t.vent(`(JSON.parse(localStorage.getItem("rusj.panna.v1")).spill.runde.ord[0] || {}).ok === true`, 3000);
  let blink = await blinket();
  t.sjekk(/riktig/.test(blink.klasse) && blink.ord === "Riktig!" && blink.tegn === "✓", `Riktig svar vises ikke med farge, tegn og ord (${JSON.stringify(blink)})`);
  await vinkel(...NOYTRAL);
  await t.sov(800);
  await vinkel(...OPP);
  await t.vent(`(JSON.parse(localStorage.getItem("rusj.panna.v1")).spill.runde.ord[1] || {}).ok === false`, 3000);
  blink = await blinket();
  t.sjekk(/pass/.test(blink.klasse) && blink.ord === "Pass" && blink.tegn === "»", `Pass vises ikke med farge, tegn og ord (${JSON.stringify(blink)})`);
  await vinkel(...NOYTRAL);
  await t.sov(800);
  t.sjekk((await runde()).ord.length === 3, "Vipping ga ikke nytt ord");
  const spor = () => t.js(`Array.from(document.querySelectorAll("#panna-spor i")).map((i) => i.className.split(" ")[0]).join("")`);
  t.sjekk((await spor()) === "rp", `Sporet på kortet viser ikke ett riktig og ett pass («${await spor()}»)`);

  // Tap zones: right = correct, left = pass
  await t.klikk(".panna-sone.riktig", 800);
  await t.klikk(".panna-sone.pass", 800);
  let r = await runde();
  t.sjekk(r.ord[2].ok === true && r.ord[3].ok === false, "Trykkfeltene virker ikke");
  t.sjekk((await t.tekst("#panna-poeng")).includes("2"), "Poengtelleren viser ikke 2");

  // Regression: a tilt that starts while the answer flash locks input must not count afterwards
  await t.klikk(".panna-sone.riktig", 60);
  const dekker = await t.js(`(() => {
    const b = document.querySelector("#panna-blink.vis");
    if (!b) return "ikke synlig";
    const r = b.getBoundingClientRect();
    return r.width >= innerWidth - 2 && r.height >= innerHeight - 2 && Number(getComputedStyle(b).opacity) > 0.9 ? "ok" : "dekker ikke skjermen";
  })()`);
  t.sjekk(dekker === "ok", `Blinket fyller ikke hele skjermen rett etter et svar (${dekker})`);
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
  await t.js(`document.querySelector('#panna-blink i').textContent = "»"; document.querySelector('#panna-blink b').textContent = "Pass"; document.querySelector('#panna-blink').className = "panna-blink vis pass"`);
  await t.sov(150);
  await t.skjermbilde(join(mappe, `F2-blink-pass.png`));
  await t.js(`document.querySelector('#panna-blink').className = "panna-blink"`);

  // Landscape: the browser rotates, the stage fills the screen
  await landskap("runde");
  // Back in portrait with the phone still sideways: the stage turns itself again after a moment
  await t.vent(`document.querySelector('#panna-scene[data-rot="${ROT_SIDELENGS}"]')`, 3000);

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

  // Let the clock run out. The last seconds are counted down in big digits behind the word, then
  // the whole stage says «Tiden er ute!» – long enough to be seen, with a symbol and the words.
  await t.js(`window.__konfetti = 0; Rusj.konfetti = () => { window.__konfetti++; }`);
  await t.js(`(() => { const k = Rusj.timer("panna-tid"); k.leggTil(-(k.igjen - 4.4)); })()`);
  await t.vent(`document.querySelector('#panna-scene.siste')`, 3000);
  const sisteTall = (await t.js(`document.querySelector("#panna-siste").textContent`)).trim();
  t.sjekk(/^[1-5]$/.test(sisteTall), `De siste sekundene telles ikke ned med store tall («${sisteTall}»)`);
  await t.bilde("siste-sekunder");
  await t.vent(fase("slutt"), 7000);
  const uteStart = Date.now();
  const ute = await t.js(`(() => {
    const l = document.querySelector(".panna-ute");
    if (!l) return null;
    const r = l.getBoundingClientRect();
    return { dekker: r.width >= innerWidth - 2 && r.height >= innerHeight - 2, tekst: l.querySelector(".panna-ute-tekst").textContent, ikon: !!l.querySelector(".panna-ute-ikon svg") };
  })()`);
  t.sjekk(ute && ute.dekker && /Tiden er ute/.test(ute.tekst) && ute.ikon, `«Tiden er ute!» fyller ikke hele skjermen med tegn og ord (${JSON.stringify(ute)})`);
  await t.bilde("tiden-ute");
  await t.vent(`document.querySelector('.panna-ordliste')`, 6000);
  t.sjekk(Date.now() - uteStart >= 2000, `«Tiden er ute!» ble borte etter ${Date.now() - uteStart} ms (skal stå i minst to sekunder)`);
  t.sjekk((await t.js(`getComputedStyle(document.querySelector(".topp")).visibility`)) === "visible", "Toppknappene kom ikke tilbake etter runden");
  await t.bilde("resultat", true);
  await smal("resultat", ".panna-banner");
  S = await t.tilstand();
  const h = S.spill.historikk[0];
  t.sjekk(h && h.ord.length === 6 && h.ord[5].ute, "Siste ord ble ikke merket som «tiden gikk ut»");
  t.sjekk(h.ord.filter((o) => o.ok).length === 3, "Feil antall riktige etter første runde");
  // Several decks were in play: the round counts for the record of a mix, and three right in
  // 60 s is no reason for confetti
  t.sjekk((await rekordLager())["miks:60"] === 3, `Rekorden for flere kortstokker ble ikke lagret (${JSON.stringify(await rekordLager())})`);
  t.sjekk(/rekord 3 flere kortstokker · 60 s/i.test((await t.tekst(".panna-rek")).replace(/\s+/g, " ")), `Resultatet viser ikke rekorden: «${await t.tekst(".panna-rek")}»`);
  t.sjekk((await t.js("window.__konfetti")) === 0, "Tre riktige på 60 s skal ikke feires med konfetti");

  // Fix a mistake: the passed word was right after all – and the record follows
  await t.klikk('[data-h="rett"][data-v="1"]');
  S = await t.tilstand();
  t.sjekk(S.spill.historikk[0].ord[1].ok === true, "Kunne ikke rette et ord");
  t.sjekk(/4/.test(await t.tekst(".panna-stortall")), "Resultatet ble ikke oppdatert etter retting");
  t.sjekk((await rekordLager())["miks:60"] === 4, "Rekorden fulgte ikke med da et ord ble rettet");
  // «Utfordre noen» shares the round
  await delStubb();
  await t.klikk('[data-h="utfordre"]');
  let delt = await sistDelt();
  t.sjekk(/klarte 4 riktige på 60 s i Panna/.test(delt.text || "") && /\/panna\/$/.test(delt.url || ""), `«Utfordre noen» deler ikke runden (${JSON.stringify(delt)})`);
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
  t.sjekk(/Til kåringen/.test(await t.tekst(".dokk")) && !(await t.finnes(".dokk .knapp .ikon")), "Siste runde viser ikke «Til kåringen» som ren tekst");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  await smal("slutt", ".banner h1");
  t.sjekk(/Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke som «Testspiller A vinner!»");
  t.sjekk(await t.finnes(".flere-spill .flere-kort"), "Sluttskjermen foreslår ikke andre spill");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Mangler lenken «Alle spill»");
  // The crowning is reported once to «Kveldens gjeng» and the statistics, and it can be shared
  const kveld = () => t.js(`(JSON.parse(localStorage.getItem("rusj.kveld") || "{}").spill || []).filter((s) => s.id === "panna")`);
  let kv = await kveld();
  t.sjekk(kv.length === 1 && kv[0].resultat.length === 2 && kv[0].resultat[0].plass === 1 && kv[0].resultat[1].plass === 2, `Kåringen ble ikke meldt til «Kveldens gjeng» én gang (${JSON.stringify(kv)})`);
  const stat = await t.js(`Rusj._statKo.map((h) => h.h)`);
  t.sjekk(stat.filter((x) => x === "ferdig").length === 1 && stat.includes("runde"), `Statistikken fikk ikke «runde» og ett «ferdig» (${stat.join(", ")})`);
  await delStubb();
  await t.klikk('[data-h="del"]');
  delt = await sistDelt();
  t.sjekk(/Testspiller A vant Panna med 4 riktige\. Testspiller B 2\./.test(delt.text || "") && /\/panna\/$/.test(delt.url || ""), `«Del kåringen» deler ikke resultatet (${JSON.stringify(delt)})`);
  // The crowning is final: back leads home, where nothing is left to continue – but the record is there
  await t.klikk("#tilbake");
  await t.vent(`document.querySelector('.hjem-knapper')`);
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.finnes('.hjem-knapper .knapp[data-h="nytt"]')), "Etter kåringen skal hjem-skjermen ikke tilby «Fortsett»");
  t.sjekk(/4\s*rekord/.test(await t.tekst(".merker")), `Hjem-skjermen viser ikke rekorden («${await t.tekst(".merker")}»)`);
  t.sjekk((await kveld()).length === 1, "Kåringen ble meldt flere ganger");
  await t.bilde("hjem-rekord");

  // An iPhone that says no, in a game without points – 30 s rounds this time
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.js(`DeviceOrientationEvent.requestPermission = () => Promise.resolve("denied")`);
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Start spill» etter kåringen skal ikke spørre");
  await t.klikk('[data-h="poeng"]');
  await t.klikk('[data-h="tid"][data-v="30"]');
  t.sjekk(/3\D+4\D+6\D+30 s/.test(await t.tekst(".panna-stjernehjelp")), `Stjernegrensene følger ikke rundelengden: «${await t.tekst(".panna-stjernehjelp")}»`);

  // Regression: the last deck can't be switched off
  if ((await t.tilstand()).oppsett.ordbank.length) await t.klikk('[data-h="ob"][data-v="rommet"]');
  for (const id of (await t.tilstand()).oppsett.stokker.slice(1)) await t.klikk(`[data-h="stokk"][data-v="${id}"]`);
  const sisteStokk = (await t.tilstand()).oppsett.stokker;
  t.sjekk(sisteStokk.length === 1, "Fikk ikke valgt bort kortstokker");
  await t.klikk(`[data-h="stokk"][data-v="${sisteStokk[0]}"]`);
  S = await t.tilstand();
  t.sjekk(S.oppsett.stokker.length === 1 && (await t.js(`document.querySelector('[data-h="stokk"][aria-pressed="true"]') !== null`)), "Den siste kortstokken kunne velges bort");
  await t.klikk('[data-h="start"]');

  // One deck alone: the round counts for that deck. Four right in 30 s is two stars – and worth
  // confetti, which the same four in 60 s would not be.
  await t.js(`window.__konfetti = 0; Rusj.konfetti = () => { window.__konfetti++; }`);
  await t.klikk('[data-h="kjor"]', 300);
  await t.vent(fase("spill"), 8000);
  for (let n = 0; n < 4; n++) await t.klikk(".panna-sone.riktig", 800);
  await t.klikk(".panna-pauseknapp", 300);
  await t.klikk('[data-h="avslutt-runde"]');
  await t.vent(`document.querySelector('.panna-ordliste')`);
  t.sjekk(!(await t.finnes(".poengliste")) && /Neste spiller/.test(await t.tekst(".dokk")), "Uten poeng skal resultatet vise «Neste spiller» og ingen poengliste");
  t.sjekk((await t.antall(".panna-rek .panna-stjerner i.pa")) === 2, `Fire riktige på 30 s skal gi to stjerner, ikke ${await t.antall(".panna-rek .panna-stjerner i.pa")}`);
  t.sjekk((await rekordLager())[`${sisteStokk[0]}:30`] === 4, `Rekorden for kortstokken ble ikke lagret (${JSON.stringify(await rekordLager())})`);
  t.sjekk((await t.js("window.__konfetti")) === 1, "Fire riktige på 30 s skal feires med konfetti");
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
  // (The stars from that deck count on the home screen.)
  t.sjekk(/2 av \d+\s*stjerner/.test(await t.tekst(".merker")), `Hjem-skjermen teller ikke stjernene («${await t.tekst(".merker")}»)`);

  // A link to one deck: /panna/#mim chooses «Mim det!» alone and opens the setup
  await t.lastSide("about:blank");
  await t.lastSide(t.side + "#mim", `document.querySelector('[data-h="start"]')`);
  S = await t.tilstand();
  t.sjekk(S.oppsett.stokker.join() === "mim" && !S.oppsett.ordbank.length && (await t.js("location.hash")) === "", `Lenken #mim valgte ikke bare «Mim det!» (${S.oppsett.stokker.join()}; «${await t.js("location.hash")}»)`);
  // Points on, 60 s, one round each – and a record of 2 to beat
  await t.js(`(() => { const r = JSON.parse(localStorage.getItem("rusj.panna.rekord") || "{}"); r["mim:60"] = 2; localStorage.setItem("rusj.panna.rekord", JSON.stringify(r)); })()`);
  await t.klikk('[data-h="poeng"]');
  await t.klikk('[data-h="tid"][data-v="60"]');
  t.sjekk(/rekord 2/.test(await t.tekst('.panna-stokk[data-v="mim"]')), `Flisen viser ikke rekorden («${await t.tekst('.panna-stokk[data-v="mim"]')}»)`);
  t.sjekk(/2 av 3 stjerner/.test(await t.js(`document.querySelector('.panna-stokk[data-v="${sisteStokk[0]}"]').textContent`)), "Flisen sier ikke i ord hvor mange stjerner kortstokken har");
  await t.bilde("oppsett-stjerner", true);
  await smal("oppsett-stjerner");
  await t.klikk('[data-h="start"]');
  // A new first player in every game: the last game with points started with Testspiller A
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), `Mobilen starter hos samme spiller hver gang («${await t.tekst("#skjerm h1")}»)`);
  t.sjekk(/rekord 2/.test(await t.js(`document.querySelector(".panna-valgte").textContent`)), "Klar-skjermen viser ikke rekorden som skal slås");
  await t.bilde("klar-mim");
  // The countdown tells the others how this deck is played, and the card's label stands out
  await t.klikk('[data-h="kjor"]', 300);
  await t.vent(fase("nedtelling"), 8000);
  t.sjekk(/bare mim/.test(await t.js(`(document.querySelector(".panna-under.slik") || {}).textContent || ""`)), "Nedtellingen forteller ikke hjelperne at de skal mime");
  await t.bilde("nedtelling-mim");
  await t.vent(fase("spill"), 6000);
  t.sjekk(/Mim det!/.test(await t.js(`(document.querySelector("#panna-kilde.slik") || {}).textContent || ""`)), "Merkelappen «Mim det!» er ikke framhevet på kortet");
  for (let n = 0; n < 3; n++) await t.klikk(".panna-sone.riktig", 800);
  t.sjekk((await spor()) === "rrr", `Sporet viser ikke tre riktige («${await spor()}»)`);
  await t.bilde("runde-mim");
  await smal("runde-mim");
  await landskap("runde-mim");
  await t.klikk(".panna-pauseknapp", 300);
  await t.klikk('[data-h="avslutt-runde"]');
  await t.vent(`document.querySelector('.panna-ordliste')`);
  // Three beats two: a new record (but no star yet – five in 60 s gives the first)
  t.sjekk((await t.finnes(".panna-rek.ny")) && /Ny rekord/i.test(await t.tekst(".panna-rek")) && /Mim det!/.test(await t.tekst(".panna-rek")), `Resultatet sier ikke «Ny rekord» for kortstokken: «${await t.tekst(".panna-rek")}»`);
  t.sjekk(/2 til for én stjerne/.test(await t.tekst(".panna-rek-hint")), `Resultatet sier ikke hvor mye som mangler til en stjerne: «${await t.tekst(".panna-rek-hint")}»`);
  t.sjekk((await rekordLager())["mim:60"] === 3, "Den nye rekorden ble ikke lagret");
  await t.bilde("resultat-rekord", true);
  await smal("resultat-rekord", ".panna-rek");
  await landskap("resultat-rekord");
  // A corrected word takes the record back – and gives it again
  await t.klikk('[data-h="rett"][data-v="0"]');
  t.sjekk((await rekordLager())["mim:60"] === 2 && !(await t.finnes(".panna-rek.ny")), "Rekorden ble stående etter at et ord ble rettet til feil");
  await t.klikk('[data-h="rett"][data-v="0"]');
  t.sjekk((await rekordLager())["mim:60"] === 3 && (await t.finnes(".panna-rek.ny")), "Rekorden kom ikke tilbake da ordet ble rettet til riktig igjen");
  // «Utfordre noen» links to the deck
  await delStubb();
  await t.klikk('[data-h="utfordre"]');
  delt = await sistDelt();
  t.sjekk(/Testspiller B klarte 3 i .*Mim det! på 60 s i Panna/.test(delt.text || "") && /\/panna\/#mim$/.test(delt.url || ""), `«Utfordre noen» lenker ikke til kortstokken (${JSON.stringify(delt)})`);

  // A deck link never interrupts a game that is running
  await t.lastSide("about:blank");
  await t.lastSide(t.side + "#jul", "document.querySelector('#skjerm h1')");
  S = await t.tilstand();
  t.sjekk(S.oppsett.stokker.join() === "mim" && !!S.spill && !(await t.finnes('[data-h="start"]')), "En kortstokklenke avbrøt et spill som pågår");
  if (!(await t.finnes('[data-h="neste"]'))) await t.klikk('[data-h="fortsett"]');

  // Testspiller A plays the last round; then the crowning – and «Spill igjen» starts with A,
  // since this game started with B
  await t.klikk('[data-h="neste"]');
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Neste spiller er ikke Testspiller A");
  await t.klikk('[data-h="kjor"]', 300);
  await t.vent(fase("spill"), 8000);
  await t.klikk(".panna-sone.riktig", 800);
  await t.klikk(".panna-pauseknapp", 300);
  await t.klikk('[data-h="avslutt-runde"]');
  await t.vent(`document.querySelector('.panna-ordliste')`);
  t.sjekk(!(await t.finnes(".panna-rek.ny")) && /rekord 3 .*Mim det! · 60 s/i.test((await t.tekst(".panna-rek")).replace(/\s+/g, " ")), `Resultatet viser ikke rekorden som står: «${await t.tekst(".panna-rek")}»`);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  t.sjekk(/Testspiller B vinner!/.test(await t.tekst("#skjerm h1")), `Feil vinner: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await kveld()).length === 2, "Det andre spillet med poeng ble ikke meldt til «Kveldens gjeng»");
  await landskap("slutt");
  await t.klikk('[data-h="igjen"]');
  await t.vent(`document.querySelector('[data-h="kjor"]')`);
  S = await t.tilstand();
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")) && S.spill.start === 0 && !S.spill.historikk.length, `«Spill igjen» startet ikke et nytt spill hos neste spiller («${await t.tekst("#skjerm h1")}»)`);
}
