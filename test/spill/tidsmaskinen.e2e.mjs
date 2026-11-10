// Tidsmaskinen: setup with «Flere valg», three players to 5 cards (tap a gap, drag with the mouse
// and with a finger, move the card, a right and a wrong year, the standings, reload mid-turn and
// during the roll, back + continue, «Nytt spill» asks), the crowning with the award and the
// timelines, Rekordjakt to the first miss (the record is kept), teams, and short phones and a phone
// on its side, where the card and every gap of a new timeline must be in view at once.
export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const spill = async () => (await t.tilstand()).spill;
  const [B0, H0] = await t.js("[window.innerWidth, window.innerHeight]");
  const LIGGENDE = "(orientation: landscape) and (max-height: 600px) and (min-width: 560px)";
  const liggende = () => t.js(`window.matchMedia(${JSON.stringify(LIGGENDE)}).matches`);

  // Where the drawn card belongs in the current timeline: any gap from lo to hi.
  const fasit = () =>
    t.js(`(() => {
      const sp = JSON.parse(localStorage.getItem("rusj.tidsmaskinen.v1")).spill;
      const D = window.RUSJ_DATA, alle = [];
      Object.keys(D).filter((n) => n.startsWith("hendelser-")).sort().forEach((n) => D[n].forEach((h) => alle.push(h)));
      const a = alle[sp.kort].a, linje = sp.linjer[sp.tur];
      let lo = 0; while (lo < linje.length && alle[linje[lo]].a < a) lo++;
      let hi = lo; while (hi < linje.length && alle[linje[hi]].a <= a) hi++;
      return { lo, hi, m: linje.length, aar: a };
    })()`);
  const feilLuke = (f) => (f.lo > 0 ? 0 : f.hi < f.m ? f.m : -1);
  // The longest span of years in one timeline, and who has it (for the award at the crowning).
  const lengsteReise = () =>
    t.js(`(() => {
      const sp = JSON.parse(localStorage.getItem("rusj.tidsmaskinen.v1")).spill;
      const D = window.RUSJ_DATA, alle = [];
      Object.keys(D).filter((n) => n.startsWith("hendelser-")).sort().forEach((n) => D[n].forEach((h) => alle.push(h)));
      const spenn = sp.linjer.map((l) => { const fra = alle[l[0]].a, til = alle[l[l.length - 1]].a; return til - fra - (fra < 0 && til > 0 ? 1 : 0); });
      const lengst = Math.max(...spenn);
      return { lengst, tekst: Number(lengst).toLocaleString("nb-NO"), hvem: spenn.map((s, i) => (s === lengst ? i : -1)).filter((i) => i >= 0) };
    })()`);
  const midten = (sel) =>
    t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: "center" }); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const punkt = (sel) => t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  // Drag from one element to another with the mouse, or with a finger (touch events). With
  // `bilde`, a screenshot is taken while the card is still held over the target.
  async function dra(fra, til, finger = false, bilde = null) {
    const p = await midten(fra);
    await t.sov(150);
    const q = await punkt(til);
    const steg = 14;
    if (finger) {
      await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
      for (let i = 1; i <= steg; i++) {
        await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + ((q.x - p.x) * i) / steg, y: p.y + ((q.y - p.y) * i) / steg }] });
        await t.sov(20);
      }
      await t.sov(250);
      await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
      await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i <= steg; i++) {
        await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + ((q.x - p.x) * i) / steg, y: p.y + ((q.y - p.y) * i) / steg, button: "left", buttons: 1 });
        await t.sov(20);
      }
      await t.sov(250);
      if (bilde) {
        t.sjekk(await t.finnes(".tm-flyt") && (await t.finnes(".tm-luke.tm-mal")), "Kortet følger ikke musa, eller tidslinja viser ikke hvor det havner");
        const under = await t.js(`(() => { const k = document.querySelector(".tm-flyt").getBoundingClientRect(); return ${q.x} >= k.left && ${q.x} <= k.right && ${q.y} >= k.top && ${q.y} <= k.bottom; })()`);
        t.sjekk(under, "Kortet som dras, skal ligge under fingeren");
        if (typeof bilde === "string") await t.bilde(bilde);
      }
      await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: q.x, y: q.y, button: "left", buttons: 0, clickCount: 1 });
    }
    await t.sov(600);
  }
  const legg = async (g) => {
    await t.klikk(`[data-h="plasser"][data-v="${g}"]`, 250);
  };
  // «Sjekk året» and wait until the year has rolled in and the verdict is drawn.
  const sjekk = async () => {
    await t.klikk('[data-h="sjekk"]');
    await t.vent("document.querySelector('.tm-dom')", 8000);
    await t.sov(300);
  };
  const neste = async () => {
    await t.klikk('[data-h="neste"]');
    await pause();
  };
  // How many of the elements are not in view right now: not drawn, outside the window, or under
  // what the dock paints (its buttons and links).
  const skjult = (sel) =>
    t.js(`(() => {
      const kutt = Array.from(document.querySelectorAll("#skjerm .dokk > *")).map((c) => c.getBoundingClientRect()).filter((k) => k.height > 0);
      const alle = Array.from(document.querySelectorAll(${JSON.stringify(sel)}));
      if (!alle.length) return 99;
      return alle.filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.top < 0 || r.left < 0 || r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1) return true;
        return !el.closest(".dokk") && kutt.some((k) => r.bottom > k.top + 1 && r.top < k.bottom - 1 && r.right > k.left + 1 && r.left < k.right - 1);
      }).length;
    })()`);

  // ---------- Setup ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk(/Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet skal hete «Gjør klart»");
  t.sjekk(await t.finnes('.flis[data-h="modus"][aria-pressed="true"]'), "Spillemåten skal velges med store fliser øverst");
  const fliser = await t.js(`Array.from(document.querySelectorAll('.flis[data-h="modus"]')).map((f) => { const r = f.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width), f.scrollWidth > f.clientWidth + 1]; })`);
  t.sjekk(fliser.length === 3 && new Set(fliser.map((x) => x[0])).size === 1 && new Set(fliser.map((x) => x[1])).size === 1, "De tre spillemåtene skal stå på én rad, like brede (aldri 2 + 1)");
  t.sjekk(!fliser.some((x) => x[2]), "Navnet på en spillemåte stikker ut av flisa");
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke tre spillere");
  t.sjekk((await t.tekst('[data-h="start"]')).trim() === "Start", `Startknappen skal bare hete «Start»: «${await t.tekst('[data-h="start"]')}»`);
  // Categories, difficulty and the target are folded into one row with a summary
  t.sjekk(!(await t.finnes('[data-h="kategori"]')), "«Flere valg» skal være lukket til å begynne med");
  t.sjekk(/Alle kategorier · Blandet · Først til 10/.test(await t.tekst('[data-h="mer"]')), `«Flere valg» skal vise valgene: «${await t.tekst('[data-h="mer"]')}»`);
  if (H0 >= 800) t.sjekk((await skjult('[data-h="mer"], [data-h="start"]')) === 0, "«Flere valg» og «Start» skal synes uten å rulle");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="mer"]');
  t.sjekk((await t.js(`document.querySelector('[data-h="mer"]').getAttribute("aria-expanded")`)) === "true", "«Flere valg» ble ikke åpnet");
  await t.bilde("oppsett-flere", true);
  await t.klikk('[data-h="kategori"][data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.length === 0, "«Alle» skal kunne velge bort alle kategorier");
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skal være av uten kategorier");
  t.sjekk(/Velg minst én kategori/.test(await t.tekst("#skjerm .dokk")), "Mangler forklaringen når ingen kategori er valgt");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  await t.klikk('[data-h="mal"][data-v="5"]');
  t.sjekk((await t.tilstand()).oppsett.mal === 5, "Målet ble ikke 5 kort");
  t.sjekk(/Først til 5/.test(await t.tekst('[data-h="mer"]')), "Sammendraget i «Flere valg» fulgte ikke med");

  // ---------- First turn: tap a gap, drag the card along, check the year ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#tm-hand')");
  let sp = await spill();
  t.sjekk(sp.linjer.length === 3 && sp.linjer.every((l) => l.length === 1), "Alle skal starte med ett kort i tidslinja");
  t.sjekk((await t.antall(".tm-gap")) === 2, "Ett startkort skal gi to luker");
  t.sjekk(await t.js(`document.querySelector("#tm-sjekk").disabled`), "«Sjekk året» skal være av før kortet ligger i tidslinja");
  t.sjekk(/Testspiller A/.test(await t.tekst("#skjerm h1")), "Det er ikke Testspiller A sin tur først");
  t.sjekk((await t.antall("#skjerm h1")) === 1, "Turskjermen skal ha nøyaktig én h1");
  t.sjekk(await t.finnes(".tm-hand .tm-hjelp"), "Første kort skal ha forklaringen «Dra kortet inn i tidslinja …»");
  t.sjekk((await skjult("#tm-hand, .tm-gap, .tm-linje > .tm-rad")) === 0, "Kortet og hele den nye tidslinja skal synes uten å rulle");
  let f = await fasit();
  t.sjekk(!(await t.tekst("#tm-hand")).includes(String(Math.abs(f.aar))), "Året på kortet skal være skjult");
  await t.bilde("tur");
  await t.trykk("#tm-hand .tm-kort-tekst");
  t.sjekk((await spill()).plass === null, "Et trykk på kortet skal ikke legge det ut");
  // The how-to line under the card lights up; no toast says the same thing once more
  t.sjekk((await t.finnes(".tm-hjelp.tm-blunk")) && !(await t.finnes("#toast.vis")), "Et trykk på kortet skal lyse opp forklaringen under det (uten toast)");

  await legg(0);
  sp = await spill();
  t.sjekk(sp.plass === 0 && (await t.finnes(".tm-luke.tm-her .tm-ny-kort")), "Kortet ble ikke lagt i luke 0");
  t.sjekk(!(await t.finnes("#tm-hand")) && !(await t.js(`document.querySelector("#tm-sjekk").disabled`)), "Etter at kortet er lagt, skal «Sjekk året» være på");
  t.sjekk((await t.tekst("#tm-sjekk")).trim() === "Sjekk året!", `Hovedknappen skal hete «Sjekk året!»: «${await t.tekst("#tm-sjekk")}»`);
  t.sjekk((await skjult(".tm-ny-kort, #tm-sjekk")) === 0, "Kortet i tidslinja og «Sjekk året!» skal synes samtidig");
  await t.bilde("lagt");
  await dra(".tm-ny-kort", '.tm-luke[data-luke="1"]');
  t.sjekk((await spill()).plass === 1, `Å dra kortet til luke 1 virket ikke (plass ${(await spill()).plass})`);
  t.sjekk(!(await t.finnes(".tm-flyt")) && !(await t.js("document.documentElement.classList.contains('tm-drar')")), "Kopien av kortet ble liggende igjen etter slipp");
  // Drag it up into the hand again: back to the start
  await dra(".tm-ny-kort", "#skjerm .tm-hode");
  t.sjekk((await spill()).plass === null && (await t.finnes("#tm-hand")), "Kortet skulle tilbake til hånda");
  await pause();
  f = await fasit();
  await dra("#tm-hand", `.tm-luke[data-luke="${f.lo}"]`, false, "drar");
  t.sjekk((await spill()).plass === f.lo, "Å dra kortet fra hånda inn i tidslinja virket ikke");
  await t.klikk('[data-h="sjekk"]', 100);
  await t.bilde("ruller");
  await t.vent("document.querySelector('.tm-dom')", 8000);
  await t.sov(300);
  sp = await spill();
  t.sjekk(sp.fase === "svar" && sp.svar.riktig && sp.linjer[0].length === 2 && sp.treff[0] === 1, "Riktig plass ga ikke kortet til Testspiller A");
  t.sjekk(await t.finnes(".tm-dom.riktig") && (await t.finnes(".tm-rad.tm-fersk")), "Riktig svar vises ikke");
  t.sjekk((await t.tekst('[data-h="neste"]')).trim() === "Neste: Testspiller B", `Neste-knappen skal si hvem som er neste: «${await t.tekst('[data-h="neste"]')}»`);
  await t.bilde("riktig");

  // ---------- Second turn: a finger drags the card to a wrong place ----------
  await neste();
  t.sjekk(/Testspiller B/.test(await t.tekst("#skjerm h1")), "Det ble ikke Testspiller B sin tur");
  f = await fasit();
  const feil = feilLuke(f);
  if (feil >= 0) {
    await dra("#tm-hand", `.tm-luke[data-luke="${feil}"]`, true);
    t.sjekk((await spill()).plass === feil, "Å dra med fingeren virket ikke");
    await sjekk();
    sp = await spill();
    t.sjekk(sp.fase === "svar" && !sp.svar.riktig && sp.linjer[1].length === 1, "Feil plass skulle kaste kortet");
    t.sjekk((await t.finnes(".tm-dom.feil")) && (await t.finnes(".tm-spokelse")) && (await t.finnes(".tm-kastet")), "Feil svar skal vise hvor kortet hørte hjemme");
    t.sjekk((await t.tekst(".tm-dom-ord")).trim() === "Nesten!", `Feil plass skal hete «Nesten!»: «${await t.tekst(".tm-dom-ord")}»`);
    await t.bilde("feil");
  } else t.feil("Fant ingen feil luke å teste med");
  await t.klikk('[data-h="stilling"]');
  t.sjekk((await t.antall("#ark:not([hidden]) .poengliste li")) === 3, "Stillingen viser ikke tre spillere");
  await t.bilde("stillingen");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Reload mid-turn and during the roll, back + continue, «Nytt spill» asks ----------
  await neste();
  await legg(0);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.tm-ny-kort')");
  sp = await spill();
  t.sjekk(sp.tur === 2 && sp.plass === 0, "Spillet husket ikke kortet i tidslinja etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(/runde 1/i.test(await t.tekst('.hjem-knapper .knapp[data-h="fortsett"]')), "«Fortsett» skal være hovedknappen mens et spill pågår");
  t.sjekk((await t.tilstand())._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  await t.bilde("hjem-pagar");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» skal spørre før spillet forsvinner");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await spill()) !== null, "Spillet forsvant selv om vi trykket «Avbryt»");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.tm-ny-kort')");
  await t.klikk('[data-h="sjekk"]', 300);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.tm-dom')");
  t.sjekk((await spill()).fase === "svar", "En omlasting mens året ruller skal ikke gi et nytt forsøk");

  // ---------- Play on: Testspiller A always right, the others wrong, until A has 5 cards ----------
  let toastSett = false;
  for (let n = 0; n < 40; n++) {
    if (/Til kåringen/.test(await t.tekst('[data-h="neste"]'))) break;
    await neste();
    sp = await spill();
    f = await fasit();
    const g = sp.tur === 0 ? f.lo : feilLuke(f) >= 0 ? feilLuke(f) : f.lo;
    // The how-to line is only for a player's first card. Later, a tap on the card gives the
    // hint as a toast at the top – and it goes away when the card is placed.
    if (sp.forsok[sp.tur] > 0) {
      t.sjekk(!(await t.finnes(".tm-hand .tm-hjelp")), "Forklaringen under kortet skal bare vises på første kort");
      if (!toastSett) {
        toastSett = true;
        await t.trykk("#tm-hand .tm-kort-tekst");
        t.sjekk(await t.js(`(() => { const x = document.querySelector("#toast.vis"); return !!x && x.getBoundingClientRect().top < 200; })()`), "Et trykk på kortet skal gi et hint øverst på skjermen");
        await legg(g);
        t.sjekk(!(await t.finnes("#toast.vis")), "Hintet «Dra kortet inn i tidslinja!» skal bort når kortet er lagt");
      }
    }
    if ((await spill()).plass === null) await legg(g);
    await t.sov(450);
    t.sjekk((await skjult(".tm-ny-kort, #tm-sjekk")) === 0, "Kortet i tidslinja skal rulles fram over «Sjekk året!»");
    await sjekk();
  }
  t.sjekk(toastSett, "Fikk ikke testet hintet som toast");
  t.sjekk((await t.tekst('[data-h="neste"]')).trim() === "Til kåringen", `Siste knapp skal hete «Til kåringen»: «${await t.tekst('[data-h="neste"]')}»`);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  sp = await spill();
  t.sjekk(sp.ferdig && sp.linjer[0].length === 5, "Testspiller A skulle vinne med 5 kort");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk(/Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), `Vinnerlinjen er feil: «${await t.tekst("#skjerm h1")}»`);
  // The award: the longest journey through time
  const reise = await lengsteReise();
  const pris = await t.tekst(".tm-pris");
  t.sjekk(/Lengste tidsreise/i.test(pris) && pris.includes(reise.tekst) && reise.hvem.every((i) => pris.includes(`Testspiller ${"ABC"[i]}`)), `Prisen «Lengste tidsreise» er feil (ventet ${reise.tekst} år): «${pris}»`);
  t.sjekk((await t.tekst('#skjerm .dokk [data-h="igjen"]')).trim() === "Spill igjen", "Hovedknappen på kåringen skal hete «Spill igjen»");
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Slutten mangler lenken «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  t.sjekk(kveld && kveld.spill.some((s) => s.id === "tidsmaskinen"), "Resultatet kom ikke med i «Kveldens gjeng»");
  // The kit may offer «Ha rusj som app» right after a finished game: close it first.
  await t.sov(2000);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.bilde("slutt", true);
  await t.klikk('[data-h="tidslinjer"]');
  t.sjekk((await t.antall("#ark .tm-tavle")) === 3, "«Se tidslinjene» viser ikke tre tidslinjer");
  await t.bilde("tidslinjene");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake");
  t.sjekk(/Til kåringen/.test(await t.tekst('[data-h="resultat"]')), "Hjem-skjermen mangler «Til kåringen» etter et ferdig spill");

  // ---------- Rekordjakt: three right, then a miss ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="rekord"]');
  t.sjekk(!(await t.finnes('[data-h="mal"]')) && !(await t.finnes(".spiller")), "Rekordjakt trenger verken spillere eller mål");
  t.sjekk(!/Først til/.test(await t.tekst('[data-h="mer"]')), "Sammendraget skal ikke nevne et mål i Rekordjakt");
  await t.bilde("oppsett-rekord", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#tm-hand')");
  for (let n = 0; n < 3; n++) {
    f = await fasit();
    await legg(f.lo);
    await sjekk();
    if (n === 0) {
      t.sjekk((await t.tekst('[data-h="neste"]')).trim() === "Trekk neste kort", `Rekordjakt: knappen skal hete «Trekk neste kort»: «${await t.tekst('[data-h="neste"]')}»`);
      await t.bilde("rekord-riktig");
    }
    await neste();
  }
  f = await fasit();
  t.sjekk(/3 på rad/.test(await t.tekst("#skjerm h1")), "Rekka teller ikke riktig");
  await legg(feilLuke(f) >= 0 ? feilLuke(f) : f.lo);
  await sjekk();
  t.sjekk((await t.tekst(".tm-dom-ord")).trim() === "Nesten!", `Rekordjakt: feil plass skal også hete «Nesten!»: «${await t.tekst(".tm-dom-ord")}»`);
  t.sjekk(!(await t.finnes("#toast.vis")), "Ingen toast oppå tidslinja etter «Sjekk året!»");
  await t.bilde("rekord-feil");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner')");
  t.sjekk(/3 på rad!/.test(await t.tekst("#skjerm h1")), `Resultatet viser ikke «3 på rad!»: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(/REKORDJAKT|Rekordjakt/.test(await t.tekst("#topp-tittel")), `Alene skal sluttskjermen hete «Rekordjakt», ikke «Kåringen»: «${await t.tekst("#topp-tittel")}»`);
  t.sjekk(Number((await t.js(`JSON.parse(localStorage.getItem("rusj.tidsmaskinen.rekord") || "{}")`)).blandet) === 3, "Rekorden ble ikke lagret");
  await t.sov(2000);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.bilde("rekord-slutt", true);
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('#tm-hand')");
  t.sjekk(/rekord\s*3/i.test(await t.tekst(".tm-best")), "Rekorden vises ikke under spillet");

  // ---------- Teams ----------
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  t.sjekk(/3 på rad/.test(await t.tekst(".tm-rekordlinje")), "Oppsettet for Rekordjakt skal vise rekorden så langt");
  await t.klikk('[data-h="modus"][data-v="lag"]');
  await t.klikk('[data-h="lag"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#tm-hand')");
  sp = await spill();
  t.sjekk(sp.modus === "lag" && sp.deltakere === 3 && /Lag Rosa/.test(await t.tekst("#skjerm h1")), "Lag mot lag starter ikke med Lag Rosa");
  t.sjekk(await t.finnes(".tm-hode .tm-lagfigur svg"), "Laget skal ha en figur i lagfargen, ikke en tom sirkel");
  await t.bilde("lag");

  // ---------- Short phones and a phone on its side ----------
  // Each team begins with one card: the card in the hand and both gaps must be in view at once,
  // and after placing, the card and «Sjekk året!».
  for (const [b, h] of [[320, 568], [375, 560], [844, 390]]) {
    const navn = `${b}x${h}`;
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
    if ((await spill()).fase === "svar") await neste();
    await t.js("window.scrollTo(0, 0)");
    await t.sov(200);
    sp = await spill();
    t.sjekk(sp.linjer[sp.tur].length === 1 && sp.plass === null, `${navn}: ventet et nytt lag med ett kort i tidslinja`);
    const borte = await skjult("#tm-hand, .tm-gap, .tm-linje > .tm-rad");
    t.sjekk(borte === 0, `${navn}: kortet og hele den nye tidslinja skal synes over knappene (${borte} deler synes ikke)`);
    t.sjekk((await skjult("#tm-sjekk")) > 0, `${navn}: «Sjekk året!» skal ikke oppta plass før kortet er lagt`);
    const side = b > h;
    t.sjekk((await liggende()) === side && (await t.finnes(".tm-venstre")) === side, `${navn}: feil oppstilling for ${side ? "liggende" : "stående"} skjerm`);
    if (side) {
      const ved = await t.js(`document.querySelector(".tm-linje").getBoundingClientRect().left > document.querySelector("#tm-hand").getBoundingClientRect().right`);
      t.sjekk(ved, `${navn}: tidslinja skal ligge til høyre for kortet`);
    }
    if (b <= B0) await t.bilde(`${navn}-tur`);
    f = await fasit();
    // On its side the card is dragged across from the left column; otherwise a tap on the gap.
    if (side) await dra("#tm-hand", `.tm-luke[data-luke="${f.lo}"]`, false, true);
    else await legg(f.lo);
    t.sjekk((await spill()).plass === f.lo, `${navn}: kortet ble ikke lagt i tidslinja`);
    await t.sov(450);
    t.sjekk((await skjult(".tm-ny-kort, #tm-sjekk")) === 0, `${navn}: kortet i tidslinja og «Sjekk året!» skal synes samtidig`);
    if (b <= B0) await t.bilde(`${navn}-lagt`);
    await sjekk();
    const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Siden er ${bred}px for bred på ${navn}`);
    await t.sov(450);
    t.sjekk((await skjult(".tm-fersk, .tm-dom, #tm-neste")) === 0, `${navn}: dommen, det nye kortet og neste-knappen skal synes etter «Sjekk året»`);
    if (b <= B0) await t.bilde(`${navn}-svar`);
  }
  // Turning the phone redraws the turn with the layout that fits (no reload)
  await t.send("Emulation.setDeviceMetricsOverride", { width: B0, height: H0, deviceScaleFactor: 2, mobile: true });
  await t.sov(400);
  t.sjekk((await t.finnes(".tm-venstre")) === (await liggende()), "Skjermen ble ikke tegnet på nytt da mobilen ble snudd");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");

  // ---------- Quit mid-game: teams with cards go to the crowning ----------
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(/Avslutt/.test(await t.tekst('[data-h="avslutt"]')), "Lenken for å avslutte skal bare hete «Avslutt»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  sp = await spill();
  const ventet = sp.vinnere.map((i) => "Lag " + ["Rosa", "Gul", "Blå", "Grønn"][i]);
  t.sjekk(sp.slutt === "avsluttet" && ventet.includes("Lag Rosa"), "Avslutt skulle kåre laget med flest kort");
  t.sjekk(new RegExp(`${ventet.length > 1 ? ventet.slice(0, -1).join(", ") + " og " + ventet[ventet.length - 1] : ventet[0]} vinner!`).test(await t.tekst("#skjerm h1")), `Vinnerlinjen er feil: «${await t.tekst("#skjerm h1")}»`);
}
