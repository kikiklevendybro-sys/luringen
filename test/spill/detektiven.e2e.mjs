// Detektiven: setup (mode tiles first, length as a number of secrets, eleven categories with «Jul») →
// game 1, «20 spørsmål» with three: hold to see, draw a new secret, no countdown, the meter
//   (Ja/Nei/Kanskje/+1, «Angre» at the magnifier, hint at 10 with focus), the points (2 for the guess,
//   1 for the other detectives within 10 questions, the keeper's 1/2/3), undo the points, «Avslutt»
//   asks, reload mid-questioning, back + continue, all 20 used → nobody → drum roll, «Gi opp» gives no
//   free points → «Kåringen», registered for the evening →
// game 2 with two players: no «Hvem gjettet det?», equal points → the fastest solve wins →
// game 3, «Hvem er jeg?»: the others see the card, 3/2/1 points, «Avslutt» in the middle of a secret →
// game 4, «Alle mot hemmeligheten»: no points, the report, sharing, the record on the home screen →
// «Avslutt» before anything is revealed, and a game saved by the first version still opens.
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
  // The smallest phones (320×568) and the short-screen rule (375×560): nothing sticks out
  // sideways, and «synlig» (the heart of the screen) is clear of the dock.
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
      for (const sel of [].concat(synlig || [])) t.sjekk(await t.friForDokk(sel, 8), `«${sel}» er skjult bak knappene ved ${b}×${h} på «${navn}»`);
      if (b === 320) await t.skjermbilde(join(mappe, `S${++nr}-${navn}-320.png`));
    }
    await t.send("Emulation.setDeviceMetricsOverride", STAAENDE);
    await t.sov(400);
  };
  // A phone on its side: no sideways scrolling, and «synlig» is clear of the dock there too.
  const landskap = async (navn, synlig) => {
    await t.send("Emulation.setDeviceMetricsOverride", LIGGENDE);
    await t.sov(600);
    const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Sidelengs scrolling i landskap på «${navn}»: ${bred}px`);
    for (const sel of [].concat(synlig || [])) t.sjekk(await t.friForDokk(sel, 4), `«${sel}» er skjult bak knappene i landskap på «${navn}»`);
    await t.skjermbilde(join(mappe, `L${++nr}-${navn}-landskap.png`));
    await t.send("Emulation.setDeviceMetricsOverride", STAAENDE);
    await t.sov(400);
  };
  const runde = async () => (await t.tilstand()).spill.runde;
  const poeng = async () => (await t.tilstand()).spill.poeng.join(",");
  const N = t.norsk; // the texts are checked in Norwegian only; other editions check the state and the numbers
  const stat = () => t.js(`JSON.parse(localStorage.getItem("${t.nokkel("detektiven.stat")}") || "null")`);
  const kveld = () => t.js(`(JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null") || { spill: [] }).spill.filter((s) => s.id === "detektiven").map((s) => s.resultat.map((r) => r.navn.slice(-1) + r.plass).join(" "))`);
  const seKortet = async (navn) => {
    const slipp = await t.hold(".mappe", 900);
    if (navn) await t.bilde(navn);
    t.sjekk((await t.tekst(".mappe-bakside")).trim().length > 2, "Kortet viser ikke hemmeligheten mens det holdes");
    const bak = await t.tekst(".mappe-bakside");
    await slipp();
    return bak;
  };
  const tell = async (n) => {
    for (let k = 0; k < n; k++) await t.klikk('[data-h="spm"]', 40);
  };
  // From «Gi mobilen til …» to the meter: look at the card, start the questioning.
  const tilAvhor = async () => {
    await t.klikk('[data-h="jeg-er"]');
    await seKortet();
    await t.klikk('[data-h="start-avhor"]');
    await t.vent(`document.querySelector('.detektiv-lupe')`);
  };
  const fasit = () => t.vent(`document.querySelector('.detektiv-fasit .kort-ord')`, 5000);

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  t.sjekk(!(await t.finnes(".detektiv-rekord")), "Hjem-skjermen viser en rekord før noe er spilt");
  await t.klikk('[data-h="nytt"]');

  // ---------- Setup: the mode comes first, the length is a number of secrets ----------
  t.sjekk((await t.antall('.flis[data-h="modus"]')) === 3, "Oppsettet skal ha tre spillemåter som fliser");
  t.sjekk((await t.js(`document.querySelector("#skjerm section").querySelector('[data-h="modus"]') !== null`)) === true, "Spillemåten skal være første seksjon i oppsettet");
  t.sjekk((await t.js(`document.querySelector('.flis[aria-pressed="true"]').dataset.v`)) === "spm", "«20 spørsmål» skal være valgt fra start");
  const lengde = () => t.js(`({ tall: document.querySelector(".teller output").innerText.replace(/\\s+/g, " ").trim(), hjelp: document.querySelector(".teller + .hjelp").innerText, lagret: Rusj.S.oppsett.antallH })`);
  let l = await lengde();
  t.sjekk(/^3 \S/.test(l.tall) && l.lagret === null && (!N || /Alle får ha hemmeligheten én gang/.test(l.hjelp)), `Lengden følger ikke gruppa: ${JSON.stringify(l)}`);
  await t.klikk('[data-h="antall-h"][data-v="1"]');
  l = await lengde();
  t.sjekk(l.lagret === 4 && (!N || /Ikke alle får ha hemmeligheten like mange ganger/.test(l.hjelp)), `Fire hemmeligheter på tre spillere: ${JSON.stringify(l)}`);
  await t.klikk('[data-h="antall-h"][data-v="-1"]');
  t.sjekk((await lengde()).lagret === null, "Tilbake på «én hver» skal lengden følge gruppa igjen");
  await t.klikk('[data-h="modus"][data-v="jeg"]');
  t.sjekk(!N || /Alle får gjette én gang/.test((await lengde()).hjelp), "«Hvem er jeg?» skal la alle gjette én gang");
  await t.klikk('[data-h="modus"][data-v="sammen"]');
  t.sjekk(/^5 \S/.test((await lengde()).tall), "«Alle mot hemmeligheten» skal starte på fem hemmeligheter");
  await t.klikk('[data-h="modus"][data-v="spm"]');

  // Categories: one off, then all on again (eleven with «Jul»); hardest level; hints stay on
  await t.klikk('[data-h="kat"][data-v="barn"]');
  t.sjekk(!(await t.tilstand()).oppsett.kategorier.includes("barn"), "Kategorien ble ikke valgt bort");
  await t.klikk('[data-h="kat"][data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.length === 11 && (await t.finnes('[data-h="kat"][data-v="jul"][aria-pressed="true"]')), "«Alle» valgte ikke alle de elleve kategoriene (med Jul)");
  await t.klikk('[data-h="nivaa"][data-v="3"]');
  t.sjekk((await t.tilstand()).oppsett.nivaa === 3, "Vanskelighet ble ikke lagret");
  await t.bilde("oppsett", true);
  await smal("oppsett");
  await landskap("oppsett");
  await t.klikk('[data-h="start"]');

  // ---------- Game 1: «20 spørsmål», three players, three secrets ----------
  // Secret 1 — Testspiller A keeps it
  await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Mobilen skal gå til Testspiller A først");
  t.sjekk((N ? /Hemmelighet 1 av 3/i : /1 \S+ 3/).test(await t.tekst("#topp-tittel")), `Topplinja skal si «Hemmelighet 1 av 3»: «${await t.tekst("#topp-tittel")}»`);
  t.sjekk(N ? (await t.tekst('.dokk [data-h="avslutt"]')).trim() === "Avslutt" : await t.finnes('.dokk [data-h="avslutt"]'), "«Gi mobilen til»-skjermen mangler «Avslutt»");
  await t.bilde("gi-mobilen");
  await smal("gi-mobilen", ".gi-til h1");
  await t.klikk('[data-h="jeg-er"]');
  t.sjekk(await t.js(`document.querySelector('[data-h="start-avhor"]').disabled`), "«Start avhøret» må være låst til kortet er sett");
  t.sjekk(!(await t.tekst(".mappe-bakside")).trim(), "Hemmeligheten vises uten at kortet holdes");
  t.sjekk(/Du er|You are/i.test(await seKortet("hemmelig-holdt")), "Kortet skal si «Du er» i 20 spørsmål");
  t.sjekk((await runde()).sett === true, "Kortet ble ikke registrert som sett");
  const forste = (await runde()).h;
  await t.klikk('[data-h="ny-hemmelighet"]');
  let r = await runde();
  t.sjekk(r.h !== forste && r.sett === false, "«Trekk en ny» ga ikke en ny, skjult hemmelighet");
  t.sjekk((N ? /Ny hemmelighet/ : /\S/).test(await t.tekst(".skjerm-hemmelig > .hjelp")) && !(await t.finnes("#toast.vis")), "Ny hemmelighet skal sies i linja under kortet, ikke i en melding over overskriften");
  await seKortet();
  await t.bilde("hemmelig");
  await smal("hemmelig", [".mappe", ".skjerm-hemmelig > .hjelp"]);
  // No countdown before the questioning: the meter is there at once
  await t.klikk('[data-h="start-avhor"]', 250);
  t.sjekk((await t.finnes(".detektiv-lupe")) && (await t.js(`document.querySelector("#nedtelling").hidden`)), "Avhøret skal starte uten nedtelling");
  await t.bilde("avhor-start");
  t.sjekk(/^\+1 \S/.test(await t.js(`document.querySelector(".detektiv-lupe").getAttribute("aria-label")`)), "Navnet på telleren skal begynne med teksten som står på den («+1 spørsmål»)");
  t.sjekk(!(await t.finnes(".detektiv-angre")), "«Angre» skal ikke vises før noe er talt");

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
  t.sjekk(!(await t.finnes("#toast.vis")), "Et klart hint skal ikke gi en melding oppå skjermen");
  await t.klikk('[data-h="hint"]');
  t.sjekk((await runde()).hint === 1, "Hintet ble ikke vist");
  t.sjekk(/kategori|category/i.test(await t.tekst(".detektiv-hint")), "Første hint skal være kategorien");
  t.sjekk(await t.js(`document.activeElement.classList.contains("detektiv-hintkort")`), "Etter «Vis hint» skal fokus stå på hintet (knappen er borte)");
  await t.bilde("avhor-hint");
  // «Angre» sits at the foot of the magnifier and takes one question back
  const angre = await t.js(`(() => { const a = document.querySelector(".detektiv-angre").getBoundingClientRect(); const g = document.querySelector(".detektiv-lupe").getBoundingClientRect(); const s = document.querySelector(".detektiv-status").getBoundingClientRect(); const cx = g.left + g.width * 104 / 240, cy = g.top + g.height * 104 / 240, rad = g.width * 102 / 240; const dx = Math.max(a.left - cx, 0, cx - a.right), dy = Math.max(a.top - cy, 0, cy - a.bottom); return { fri: Math.hypot(dx, dy) >= rad, inne: a.left >= 0 && a.right <= innerWidth, overStatus: a.bottom <= s.top + 2 || a.right <= s.left || a.left >= s.right }; })()`);
  if (STAAENDE.width < STAAENDE.height) t.sjekk(angre.fri && angre.inne && angre.overStatus, `«Angre» ligger oppå forstørrelsesglasset eller teksten under: ${JSON.stringify(angre)}`);
  t.sjekk(await t.friForDokk(".detektiv-angre"), "«Angre» er skjult bak knappene");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await runde()).spm === 9, "Angre fjernet ikke ett spørsmål");
  await t.klikk('[data-h="svar"][data-v="n"]');
  t.sjekk(!/\d/.test(await t.tekst(".detektiv-status")), "Teksten under forstørrelsesglasset teller også – bare glasset skal vise tallet");
  t.sjekk((await t.antall(".dokk .lenke")) === 3 && (!N || (await t.tekst('.dokk [data-h="avslutt"]')).trim() === "Avslutt"), "Avhøret skal ha lenkene «Se kortet», «Gi opp» og «Avslutt»");
  await landskap("avhor", [".detektiv-hint", ".detektiv-angre", ".detektiv-svar"]);
  await smal("avhor", [".detektiv-hint", ".detektiv-angre"]);

  // Peek at the card in a sheet
  await t.klikk('[data-h="se-kortet"]');
  t.sjekk(await t.finnes("#ark .mappe"), "«Se kortet» viser ikke kortet");
  await t.bilde("se-kortet");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Ten questions on the meter and then the right guess = solved on 11: two points for the guess,
  // nothing for teamwork (over 10) and nothing for the keeper (the secret did not last 15).
  await t.klikk('[data-h="gjettet"]');
  await t.bilde("hvem");
  t.sjekk((N ? /Løst på 11 spørsmål/i : /11/).test(await t.tekst(".banner .etikett")) && !/samarbeid|teamwork|samarbejde/.test(await t.tekst("#skjerm .hjelp")), `«Hvem gjettet det?» etter 10 talte spørsmål: «${await t.tekst(".banner .etikett")}» / «${await t.tekst("#skjerm .hjelp")}»`);
  t.sjekk(!(await t.finnes('[data-h="gjetter"][data-v="0"]')), "Den som har hemmeligheten kan ikke gjette selv");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  await t.vent(`document.querySelector('.detektiv-pluss-liste')`);
  t.sjekk((await poeng()) === "0,2,0", `Feil poeng etter løst på 11 spørsmål: ${await poeng()}`);
  t.sjekk((N ? /Løst på 11 spørsmål/ : /11/).test(await t.tekst(".detektiv-avsloring .ingress")), "Avsløringen og poengene er uenige om antall spørsmål");
  await t.bilde("avsloring-lost", true);

  // Oops, one question too many and it was C: undo the points, undo a question, choose again.
  // Solved on 10: C gets 2 and B 1 for the teamwork.
  await t.klikk('[data-h="angre-poeng"]');
  t.sjekk((await runde()).spm === 10 && (await poeng()) === "0,0,0" && (await stat()).lost === 0, "Angre poengene tok ikke runden (og rekorden) tilbake");
  await t.klikk('[data-h="angre"]');
  await t.klikk('[data-h="gjettet"]');
  t.sjekk((N ? /Løst på 10 spørsmål/i : /10/).test(await t.tekst(".banner .etikett")) && /godt samarbeid|good teamwork|godt samarbejde/.test(await t.tekst("#skjerm .hjelp")), "Løst på 10 spørsmål skal gi de andre detektivene poeng for samarbeid");
  await t.klikk('[data-h="gjetter"][data-v="2"]');
  await t.vent(`document.querySelector('.detektiv-pluss-liste')`);
  t.sjekk((await poeng()) === "0,1,2", `Feil poeng etter løst på 10 spørsmål: ${await poeng()}`);
  t.sjekk((await t.antall(".detektiv-pluss-liste li")) === 2 && /godt samarbeid|good teamwork|godt samarbejde/.test(await t.tekst(".detektiv-pluss-liste")), "Poenglista for runden skal vise gjetteren og samarbeidspoenget");
  t.sjekk(await t.js(`Array.from(document.querySelectorAll(".detektiv-pluss-liste .grunn")).every((g) => g.scrollWidth <= g.clientWidth + 1)`), "Begrunnelsen for poengene er kuttet");
  await t.bilde("avsloring-samarbeid", true);
  // «Avslutt» is just «Avslutt» and asks first; «Spill videre» stays on the reveal
  t.sjekk(!N || (await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte heter ikke bare «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk((await t.finnes("#ark:not([hidden])")) && (!N || (await t.tekst('#ark [data-v="nei"]')).trim() === "Spill videre"), "«Avslutt» spør ikke først med «Spill videre»");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(await t.finnes(".detektiv-pluss-liste"), "«Spill videre» forlot avsløringen");

  // Secret 2 — Testspiller B; reload in the middle of the questioning
  await t.klikk('[data-h="neste"]');
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Hemmelighet 2 skal gå til Testspiller B");
  await tilAvhor();
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
  // After 15 questions the keeper has earned one point – «Gi opp» says so, and «Spill videre» goes on
  await tell(12);
  await t.klikk('[data-h="gi-opp"]');
  t.sjekk(/får 1 poeng|gets 1 point|får 1 point/.test(await t.tekst("#ark .ingress")), `«Gi opp» etter 15 spørsmål skal love 1 poeng: «${await t.tekst("#ark .ingress")}»`);
  await t.bilde("gi-opp");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await runde()).spm === 15, "Avbrutt «Gi opp» endret runden");
  await tell(5);
  t.sjekk(await t.js(`document.querySelector('.detektiv-lupe').disabled`), "Telleren stopper ikke på 20");
  t.sjekk(!(await t.finnes('[data-h="gi-opp"]')) && (await t.finnes('[data-h="ingen"]')), "Etter 20 spørsmål skal «Ingen klarte det» ta over for «Gi opp»");
  t.sjekk(!(await t.finnes(".detektiv-svar")), "Etter 20 spørsmål har svarknappene ikke mer å gjøre og skal være borte");
  await t.bilde("avhor-20");
  await landskap("avhor-20", [".detektiv-hint", ".detektiv-status"]);
  await smal("avhor-20", [".detektiv-hint", ".detektiv-status"]);
  await t.klikk('[data-h="ingen"]', 300);
  await t.bilde("avsloring-spenning");
  await fasit();
  t.sjekk((await poeng()) === "0,4,2", `Den hemmelige skulle få 3 poeng: ${await poeng()}`);
  await t.bilde("avsloring-uoppklart", true);
  await smal("avsloring", ".detektiv-fasit");

  // Secret 3 — Testspiller C; the detectives give up after two questions: no points for anyone
  await t.klikk('[data-h="neste"]');
  await tilAvhor();
  await t.klikk('[data-h="svar"][data-v="n"]');
  await t.klikk('[data-h="svar"][data-v="j"]');
  await t.klikk('[data-h="gi-opp"]');
  t.sjekk(/ingen får poeng|nobody scores|ingen får point/.test(await t.tekst("#ark .ingress")), `«Gi opp» etter to spørsmål skal ikke gi poeng: «${await t.tekst("#ark .ingress")}»`);
  await t.klikk('#ark [data-v="ja"]');
  await fasit();
  t.sjekk((await poeng()) === "0,4,2" && (await t.finnes(".detektiv-ingen-poeng")), `«Gi opp» etter to spørsmål ga poeng likevel: ${await poeng()}`);
  t.sjekk(!N || /Til kåringen/.test(await t.tekst(".dokk .knapp")), `Siste hemmelighet skal lede «Til kåringen»: «${await t.tekst(".dokk .knapp")}»`);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  await smal("slutt", ".banner h1");
  await landskap("slutt");
  t.sjekk((N ? /Testspiller B vinner!/ : /Testspiller B/).test(await t.tekst("#skjerm h1")), "Vinneren vises ikke som «Testspiller B vinner!»");
  t.sjekk(!N || (await t.tekst("#topp-tittel")).trim().toLowerCase() === "kåringen", "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk((await t.finnes(".flere-spill .flere-kort")) || !(await t.js(`(window.RUSJ_ANDRE || []).some((g) => g.spillere[0] <= ${(await t.tilstand()).spill.antall} && ${(await t.tilstand()).spill.antall} <= g.spillere[1])`)), "Sluttskjermen foreslår ikke andre spill");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Mangler lenken «Alle spill»");
  t.sjekk(/Raskeste|Fastest|Hurtigste/.test(await t.tekst(".detektiv-fakta")), "Mangler morsomme fakta på slutten");
  t.sjekk((await kveld()).join("|") === "B1 C2 A3", `Kåringen ble ikke meldt til «Kveldens gjeng»: ${(await kveld()).join("|")}`);
  t.sjekk((await t.tilstand())._aktiv === false, "Spillet regnes fortsatt som pågående på «Kåringen»");

  // ---------- Game 2: two players – the only detective is picked by the phone, a tie is broken ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  t.sjekk(/^2 \S/.test((await lengde()).tall), "Med to spillere skal lengden følge med til to hemmeligheter");
  await t.klikk('[data-h="start"]');
  await tilAvhor();
  await tell(3);
  t.sjekk((N ? /Testspiller B gjettet det!/ : /Testspiller B/).test(await t.tekst(".dokk .knapp")), `Med to spillere skal knappen navngi detektiven: «${await t.tekst(".dokk .knapp")}»`);
  await t.klikk('[data-h="gjettet"]');
  await t.vent(`document.querySelector('.detektiv-fasit .kort-ord')`);
  t.sjekk(!(await t.finnes('[data-h="gjetter"]')) && (await poeng()) === "0,2", `Med to spillere skal «Hvem gjettet det?» hoppes over: ${await poeng()}`);
  t.sjekk((N ? /Løst på 4 spørsmål/ : / 4 /).test(await t.tekst(".detektiv-avsloring .ingress")), "Tre talte spørsmål og gjetningen skal være «løst på 4 spørsmål»");
  await t.bilde("avsloring-to-spillere");
  await t.klikk('[data-h="neste"]');
  await tilAvhor();
  await tell(6);
  await t.klikk('[data-h="gjettet"]');
  await t.vent(`document.querySelector('.detektiv-fasit .kort-ord')`);
  t.sjekk((await poeng()) === "2,2", `Begge skulle ha to poeng: ${await poeng()}`);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt-likt", true);
  t.sjekk((N ? /Testspiller B vinner!/ : /Testspiller B/).test(await t.tekst("#skjerm h1")) && (!N || /raskeste oppklaring/.test(await t.tekst(".banner .ingress"))), `Likt på poeng skal avgjøres på raskeste oppklaring: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.js(`Array.from(document.querySelectorAll(".pall .blokk")).map((b) => b.textContent).sort().join("")`)) === "12" && (await t.antall(".poengliste li.leder")) === 1, "Pallen og lista skal vise én vinner etter omkampen på tall");
  t.sjekk((await kveld())[1] === "B1 A2", `«Kveldens gjeng» skal få vinneren etter avgjørelsen: ${(await kveld())[1]}`);

  // ---------- Game 3: «Hvem er jeg?» ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.skrivInn("#navn-2", "Testspiller C");
  await t.klikk('[data-h="modus"][data-v="jeg"]');
  await t.bilde("oppsett-hvem-er-jeg", true);
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="jeg-er"]')`);
  t.sjekk(!N || (/ser bort/.test(await t.tekst(".ikke-se")) && /Vis kortet til de andre/.test(await t.tekst(".dokk .knapp"))), "«Hvem er jeg?» skal be den som gjetter om å se bort");
  await t.bilde("gi-hvem-er-jeg");
  await smal("gi-hvem-er-jeg", ".gi-til h1");
  await t.klikk('[data-h="jeg-er"]');
  t.sjekk(/Hvem er|Who is/.test(await t.tekst("#skjerm h1")), "Kortskjermen i «Hvem er jeg?» skal spørre hvem spilleren er");
  t.sjekk((N ? /Testspiller A er/i : /Testspiller A/i).test(await seKortet("hemmelig-hvem-er-jeg")), "Kortet skal si «Testspiller A er» til de andre");
  await smal("hemmelig-hvem-er-jeg", [".mappe", ".skjerm-hemmelig > .hjelp"]);
  await t.klikk('[data-h="start-avhor"]');
  await t.vent(`document.querySelector('.detektiv-lupe')`);
  t.sjekk((!N || /spør – dere andre svarer/.test(await t.tekst(".detektiv-status"))) && (N ? /Testspiller A gjettet det!/ : /Testspiller A/).test(await t.tekst(".dokk .knapp")), "Avhøret i «Hvem er jeg?» skal si hvem som spør og hvem som kan gjette");
  await t.bilde("avhor-hvem-er-jeg");
  await landskap("avhor-hvem-er-jeg", ".detektiv-svar");
  await tell(6);
  await t.klikk('[data-h="gjettet"]');
  await t.vent(`document.querySelector('.detektiv-fasit .kort-ord')`);
  t.sjekk((await poeng()) === "3,0,0" && (N ? /fant det ut på 7 spørsmål/ : / 7 /).test(await t.tekst(".detektiv-pluss-liste")), `Sju spørsmål skal gi den som gjetter 3 poeng: ${await poeng()}`);
  await t.bilde("avsloring-hvem-er-jeg", true);
  await t.klikk('[data-h="neste"]');
  await tilAvhor();
  await tell(12);
  await t.klikk('[data-h="gjettet"]');
  await t.vent(`document.querySelector('.detektiv-fasit .kort-ord')`);
  t.sjekk((await poeng()) === "3,2,0", `13 spørsmål skal gi 2 poeng: ${await poeng()}`);
  // «Avslutt» in the middle of the third secret: it does not count, and only those who guessed are ranked
  await t.klikk('[data-h="neste"]');
  await tilAvhor();
  await tell(2);
  await t.klikk('.dokk [data-h="avslutt"]');
  t.sjekk(/teller ikke|doesn't count|tæller ikke/.test(await t.tekst("#ark .ingress")), `«Avslutt» midt i en hemmelighet skal si at den ikke teller: «${await t.tekst("#ark .ingress")}»`);
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.poengliste')");
  await t.bilde("slutt-hvem-er-jeg", true);
  let S = await t.tilstand();
  t.sjekk(S.spill.ferdig === true && S.spill.runde === null && S.spill.logg.length === 2, "«Avslutt» midt i en hemmelighet skal gå til kåringen uten å telle den");
  t.sjekk((await t.antall(".poengliste li")) === 2 && (!N || /Bare de som rakk å gjette/.test(await t.tekst("#skjerm"))), "Bare de som rakk å gjette, skal være med i kåringen");
  t.sjekk((N ? /Testspiller A vinner!/ : /Testspiller A/).test(await t.tekst("#skjerm h1")), "Vinneren av «Hvem er jeg?» vises ikke");

  // ---------- Game 4: «Alle mot hemmeligheten» – no points, a report and a record ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="sammen"]');
  for (let k = 0; k < 3; k++) await t.klikk('[data-h="antall-h"][data-v="-1"]', 60);
  t.sjekk(/^2 \S/.test((await lengde()).tall), "Lengden lot seg ikke sette til to hemmeligheter");
  await t.klikk('[data-h="start"]');
  await tilAvhor();
  await tell(3);
  await t.klikk('[data-h="gjettet"]');
  await t.vent(`document.querySelector('.detektiv-fasit .kort-ord')`);
  t.sjekk((N ? /Løst på 4 spørsmål!/ : /4/).test(await t.tekst("#skjerm h1")) && !(await t.finnes(".detektiv-pluss-liste, .poengliste, [data-h='gjetter']")), "Uten poeng skal avsløringen bare si hvor mange spørsmål det tok");
  t.sjekk((await t.antall(".detektiv-saker li.lost")) === 1 && (N ? /5 løst på rad/ : /5/).test(await t.tekst(".detektiv-nyrekord")), `Avsløringen uten poeng skal vise sakene og rekka: «${await t.tekst(".detektiv-nyrekord")}»`);
  await t.bilde("avsloring-sammen", true);
  await t.klikk('[data-h="neste"]');
  await tilAvhor();
  await tell(1);
  await t.klikk('[data-h="gi-opp"]');
  await t.klikk('#ark [data-v="ja"]');
  await fasit();
  t.sjekk(!N || /Til rapporten/.test(await t.tekst(".dokk .knapp")), "Siste hemmelighet uten poeng skal lede «Til rapporten»");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.detektiv-saker')");
  await t.bilde("rapporten", true);
  await smal("rapporten", ".banner h1");
  t.sjekk((!N || (await t.tekst("#topp-tittel")).trim().toLowerCase() === "rapporten") && (N ? /1 av 2 oppklart!/ : /1 \S+ 2/).test(await t.tekst("#skjerm h1")), `Sluttskjermen uten poeng: «${await t.tekst("#topp-tittel")}» / «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".detektiv-saker li")) === 2 && !(await t.finnes(".pall")) && (await kveld()).length === 3, "Et spill uten poeng skal ikke kåre noen eller meldes til «Kveldens gjeng»");
  await t.js(`Rusj.del = (tittel, tekst, url) => { window.__delt = { tittel, tekst, url }; }`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt");
  t.sjekk(delt && (N ? /^Detektiven 🔎 Vi oppklarte 1 av 2 hemmeligheter – raskest på 4 spørsmål!\n🟩🟥$/.test(delt.tekst) : /🟩🟥$/u.test(delt.tekst)) && delt.url === "https://rusj.no" + (N ? "/detektiven/" : new URL(t.side).pathname), `«Del resultatet» delte ikke resultatet: ${JSON.stringify(delt)}`);
  const st = await stat();
  t.sjekk(st && st.lost === 6 && st.rad === 0 && st.bestRad === 5 && st.raskest === 4, `Rekorden på mobilen stemmer ikke: ${JSON.stringify(st)}`);
  // The record on the home screen
  await t.klikk("#tilbake");
  t.sjekk((N ? /5 løst på rad · raskest på 4 spørsmål/ : /5 .+ · .+ 4 /).test(await t.tekst(".detektiv-rekord")) && (N ? /6\s*oppklart/ : /6\s*\S/).test(await t.tekst(".merker")), `Hjem-skjermen viser ikke rekorden: «${await t.tekst(".detektiv-rekord")}»`);
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="nytt"]'), "Etter et ferdig spill skal «Start spill» være hovedknappen");
  await t.bilde("hjem-rekord");
  await landskap("hjem-rekord");

  // «Avslutt» before anything is revealed: the game just goes away
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.klikk('.dokk [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent(`document.querySelector('.spillhjem')`);
  t.sjekk((await t.tilstand()).spill === null, "«Avslutt» før noe er avslørt skal bare fjerne spillet");

  // A reload on the secret screen goes back to «Gi mobilen til …», never straight to the card
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="jeg-er"]');
  await t.vent(`document.querySelector('.mappe')`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="jeg-er"]'), "Omlasting på hemmelighet-skjermen gikk ikke tilbake til «Gi mobilen til»");

  // A game saved by the first version (no mode, «to hver», the old log) opens and goes on
  await t.js(`localStorage.setItem("${t.nokkel("detektiven.v1")}", JSON.stringify({ skjerm: "avhor", antall: 3, _tid: Date.now(),
    oppsett: { kategorier: ["dyr", "ting", "mat", "yrker", "norge", "kjoretoy", "fantasi", "natur", "sport", "barn"], nivaa: 2, runder: 2, hint: true },
    spill: { antall: 3, runder: 2, kategorier: ["dyr"], nivaa: 2, hint: true, poeng: [1, 2, 0], skjerm: "avhor",
      logg: [{ k: 0, h: 3, spm: 11, g: 1, pluss: { 0: 1, 1: 2 }, svar: [], hint: 0 }],
      runde: { h: 5, sett: true, spm: 4, svar: ["j", "n", "x", "x"], hint: 0 } } }))`);
  await t.lastSide(t.side, "document.querySelector('.detektiv-lupe')");
  S = await t.tilstand();
  t.sjekk(S.spill.modus === "spm" && S.spill.totalt === 6 && S.spill.start === 0 && S.spill.logg[0].lost === true && S.spill.runde.spm === 4, `Et gammelt lagret spill ble ikke ført over: ${JSON.stringify({ m: S.spill.modus, t: S.spill.totalt, l: S.spill.logg[0].lost })}`);
  t.sjekk(S.oppsett.kategorier.includes("jul") && S.oppsett.antallH === null && S.oppsett.modus === "spm", "Et gammelt oppsett med alle kategoriene skal få med «Jul»");
  await t.klikk('[data-h="gjettet"]');
  await t.klikk('[data-h="gjetter"][data-v="2"]');
  await t.vent(`document.querySelector('.detektiv-pluss-liste')`);
  t.sjekk((await poeng()) === "2,2,2", `Det gamle spillet regnet ikke poeng videre: ${await poeng()}`);
}
