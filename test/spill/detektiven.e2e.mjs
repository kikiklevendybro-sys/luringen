// Detektiven: setup → round 1 (hold to see, draw a new secret, Ja/Nei/Kanskje/+1, hint at 10, undo,
// look at the card again, someone guesses → points, undo the points, pick another guesser) →
// round 2 (reload mid-questioning, back + continue, all 20 used → nobody → drum roll) →
// round 3 (quick solve) → podium. A landscape shot is taken with t.skjermbilde.
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
  // The smallest phones (320×568) and the short-screen rule (375×560): nothing sticks out
  // sideways, and «synlig» (the heart of the screen) is above the dock.
  const smal = async (navn, synlig) => {
    for (const [b, h] of [
      [320, 568],
      [375, 560],
    ]) {
      await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "portraitPrimary", angle: 0 } });
      await t.sov(450);
      const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
      t.sjekk(bred <= 0, `Sidelengs scrolling ved ${b}×${h} på «${navn}»: ${bred}px`);
      const utenfor = await t.js(`Array.from(document.querySelectorAll("#skjerm *, .ark *")).filter((el) => {
        if (el.closest("svg, canvas, [data-utenfor-ok]")) return false;
        if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
        const b = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return b.width && b.height && s.visibility !== "hidden" && Number(s.opacity) !== 0 && (b.right > innerWidth + 2 || b.left < -2);
      }).map((el) => el.textContent.trim().slice(0, 30))`);
      t.sjekk(!utenfor.length, `Tekst stikker utenfor ved ${b}×${h} på «${navn}»: ${utenfor.join(", ")}`);
      if (synlig) t.sjekk(await overDokk(synlig), `«${synlig}» er skjult bak knappene ved ${b}×${h} på «${navn}»`);
      if (b === 320) await t.skjermbilde(join(mappe, `S${++nr}-${navn}-320.png`));
    }
    await t.send("Emulation.setDeviceMetricsOverride", STAAENDE);
    await t.sov(400);
  };
  const landskap = async (navn) => {
    await t.send("Emulation.setDeviceMetricsOverride", LIGGENDE);
    await t.sov(600);
    const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Sidelengs scrolling i landskap på «${navn}»: ${bred}px`);
    await t.skjermbilde(join(mappe, `L${++nr}-${navn}-landskap.png`));
    await t.send("Emulation.setDeviceMetricsOverride", STAAENDE);
    await t.sov(400);
  };
  const runde = async () => (await t.tilstand()).spill.runde;
  const seKortet = async (navn) => {
    const slipp = await t.hold(".mappe", 900);
    if (navn) await t.bilde(navn);
    t.sjekk((await t.tekst(".mappe-bakside")).trim().length > 2, "Kortet viser ikke hemmeligheten mens det holdes");
    await slipp();
  };
  const tell = async (n) => {
    for (let k = 0; k < n; k++) await t.klikk('[data-h="spm"]', 40);
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  await smal("oppsett");

  // Categories: one off, then all on again; hardest level; hints stay on
  await t.klikk('[data-h="kat"][data-v="barn"]');
  t.sjekk(!(await t.tilstand()).oppsett.kategorier.includes("barn"), "Kategorien ble ikke valgt bort");
  await t.klikk('[data-h="kat"][data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.length === 10, "«Alle» valgte ikke alle kategoriene");
  await t.klikk('[data-h="nivaa"][data-v="3"]');
  t.sjekk((await t.tilstand()).oppsett.nivaa === 3, "Vanskelighet ble ikke lagret");
  await t.klikk('[data-h="start"]');

  // Round 1 — Testspiller A keeps the secret
  await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Mobilen skal gå til Testspiller A først");
  await t.bilde("gi-mobilen");
  await smal("gi-mobilen", ".gi-til h1");
  await t.klikk('[data-h="jeg-er"]');
  t.sjekk(await t.js(`document.querySelector('[data-h="start-avhor"]').disabled`), "«Start avhøret» må være låst til kortet er sett");
  t.sjekk(!(await t.tekst(".mappe-bakside")).trim(), "Hemmeligheten vises uten at kortet holdes");
  await seKortet("hemmelig-holdt");
  t.sjekk((await runde()).sett === true, "Kortet ble ikke registrert som sett");
  const forste = (await runde()).h;
  await t.klikk('[data-h="ny-hemmelighet"]');
  let r = await runde();
  t.sjekk(r.h !== forste && r.sett === false, "«Trekk en ny» ga ikke en ny, skjult hemmelighet");
  await seKortet();
  await t.bilde("hemmelig");
  await smal("hemmelig", ".mappe");
  await t.klikk('[data-h="start-avhor"]');
  await t.vent(`document.querySelector('.detektiv-lupe')`, 6000);
  await t.bilde("avhor-start");

  // Ja / Nei / Kanskje and plain +1 all count
  await t.klikk('[data-h="svar"][data-v="j"]');
  await t.bilde("avhor-ja");
  await t.klikk('[data-h="svar"][data-v="n"]');
  await t.klikk('[data-h="svar"][data-v="k"]');
  await tell(6);
  r = await runde();
  t.sjekk(r.spm === 9 && r.svar.join("") === "jnkxxxxxx", `Telleren teller feil: ${r.spm} ${r.svar.join("")}`);
  t.sjekk(!(await t.finnes('[data-h="hint"]')), "Hint skal ikke være klart før 10 spørsmål");
  await tell(1);
  await t.klikk('[data-h="hint"]');
  t.sjekk((await runde()).hint === 1, "Hintet ble ikke vist");
  t.sjekk(/kategori/i.test(await t.tekst(".detektiv-hint")), "Første hint skal være kategorien");
  await t.bilde("avhor-hint");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await runde()).spm === 9, "Angre fjernet ikke ett spørsmål");
  await t.klikk('[data-h="svar"][data-v="n"]');
  await t.klikk('[data-h="svar"][data-v="j"]');
  t.sjekk(!/\d/.test(await t.tekst(".detektiv-status")), "Teksten under forstørrelsesglasset teller også – bare glasset skal vise tallet");
  await landskap("avhor");
  await smal("avhor", ".detektiv-hint");

  // Peek at the card in a sheet
  await t.klikk('[data-h="se-kortet"]');
  t.sjekk(await t.finnes("#ark .mappe"), "«Se kortet» viser ikke kortet");
  await t.bilde("se-kortet");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Testspiller B guessed it after 11 questions: B +2, A +1
  await t.klikk('[data-h="gjettet"]');
  await t.bilde("hvem");
  t.sjekk(!(await t.finnes('[data-h="gjetter"][data-v="0"]')), "Den som har hemmeligheten kan ikke gjette selv");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  await t.vent(`document.querySelector('.detektiv-pluss-liste')`);
  let S = await t.tilstand();
  t.sjekk(S.spill.poeng.join(",") === "1,2,0", `Feil poeng etter løst runde: ${S.spill.poeng}`);
  await t.bilde("avsloring-lost", true);

  // Oops, it was C: undo the points and choose again
  await t.klikk('[data-h="angre-poeng"]');
  t.sjekk((await runde()).spm === 11, "Angre poengene tok ikke runden tilbake");
  await t.klikk('[data-h="gjettet"]');
  await t.klikk('[data-h="gjetter"][data-v="2"]');
  await t.vent(`document.querySelector('.detektiv-pluss-liste')`);
  S = await t.tilstand();
  t.sjekk(S.spill.poeng.join(",") === "1,0,2", `Feil poeng etter angring: ${S.spill.poeng}`);
  // «Avslutt» is just «Avslutt» and asks first; «Spill videre» stays on the reveal
  t.sjekk((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte heter ikke bare «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Avslutt» spør ikke først");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(await t.finnes(".detektiv-pluss-liste"), "«Spill videre» forlot avsløringen");

  // Round 2 — Testspiller B; reload in the middle of the questioning
  await t.klikk('[data-h="neste"]');
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Runde 2 skal gå til Testspiller B");
  await t.klikk('[data-h="jeg-er"]');
  await seKortet();
  await t.klikk('[data-h="start-avhor"]');
  await t.vent(`document.querySelector('.detektiv-lupe')`, 6000);
  await tell(3);
  await t.lastSide(t.side, "document.querySelector('.detektiv-lupe')");
  t.sjekk((await runde()).spm === 3, "Telleren ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» på hjem-skjermen");
  await t.bilde("hjem-fortsett");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» skal være hovedknappen mens et spill pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» spør ikke før spillet kastes");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Avbrutt «Nytt spill» slettet spillet");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`document.querySelector('.detektiv-lupe')`);
  await tell(17);
  t.sjekk(await t.js(`document.querySelector('.detektiv-lupe').disabled`), "Telleren stopper ikke på 20");
  await t.bilde("avhor-20");
  await t.klikk('[data-h="ingen"]', 300);
  await t.bilde("avsloring-spenning");
  await t.vent(`document.querySelector('.detektiv-fasit .kort-ord')`, 4000);
  S = await t.tilstand();
  t.sjekk(S.spill.poeng.join(",") === "1,3,2", `Den hemmelige skulle få 3 poeng: ${S.spill.poeng}`);
  await t.bilde("avsloring-uoppklart", true);
  await smal("avsloring", ".detektiv-fasit");

  // Round 3 — Testspiller C; B solves it fast
  await t.klikk('[data-h="neste"]');
  await t.klikk('[data-h="jeg-er"]');
  await seKortet();
  // Regression: «Tilbake» during the 3-2-1 must not be overruled when the countdown ends
  await t.klikk('[data-h="start-avhor"]', 200);
  await t.js("Rusj.tilbake()");
  await t.sov(2800);
  t.sjekk(await t.finnes('[data-h="jeg-er"]'), "Nedtellingen dro spilleren videre til avhøret etter «Tilbake»");
  await t.klikk('[data-h="jeg-er"]');
  await t.klikk('[data-h="start-avhor"]');
  await t.vent(`document.querySelector('.detektiv-lupe')`, 6000);
  await t.klikk('[data-h="svar"][data-v="n"]');
  await t.klikk('[data-h="svar"][data-v="j"]');
  // «Gi opp» asks first – and «Spill videre» keeps the round going
  await t.klikk('[data-h="gi-opp"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Gi opp» spør ikke om bekreftelse");
  await t.bilde("gi-opp");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await runde()).spm === 2, "Avbrutt «Gi opp» endret runden");
  await t.klikk('[data-h="gjettet"]');
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  await t.vent(`document.querySelector('.detektiv-pluss-liste')`);
  t.sjekk(/vinneren/i.test(await t.tekst(".dokk")), "Siste runde viser ikke «Se vinneren»");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  await smal("slutt", ".banner h1");
  t.sjekk(/Testspiller B vinner!/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke som «Testspiller B vinner!»");
  t.sjekk(await t.finnes(".flere-spill .flere-kort"), "Sluttskjermen foreslår ikke andre spill");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Mangler lenken «Alle spill»");
  t.sjekk(/Raskeste/.test(await t.tekst(".detektiv-fakta")), "Mangler morsomme fakta på slutten");
  // A reload on the secret screen goes back to «Gi mobilen til …», never straight to the card
  await t.klikk('[data-h="igjen"]');
  await t.klikk('[data-h="jeg-er"]');
  await t.vent(`document.querySelector('.mappe')`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="jeg-er"]'), "Omlasting på hemmelighet-skjermen gikk ikke tilbake til «Gi mobilen til»");
}
