// Bussen (Rød eller svart?, 18+): the age gate («Nei» leads away, «Ja» opens the game); three players
// play all four rounds (every answer checked against the rules: colour, higher/lower with ace high,
// inside/outside, suit; «likt» counts as right), «Angre» shuffles the card back, reload and back +
// «Fortsett» keep the game, water breaks show up; the one with most misses rides the bus (misses send
// it back to the start, at most three); the crowning lists right answers and feeds «Kveldens gjeng»;
// small screens keep the question above the buttons.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C"];

const sortAv = (k) => Math.floor(k / 13);
const verdi = (k) => (k % 13 === 0 ? 14 : (k % 13) + 1);
const rod = (k) => sortAv(k) === 1 || sortAv(k) === 2;
// The rules, written out once more on their own.
function fasit(hand, runde, gjett, k) {
  if (runde === 0) return gjett === (rod(k) ? "rod" : "svart");
  if (runde === 1) return verdi(k) === verdi(hand[0]) || (verdi(k) > verdi(hand[0])) === (gjett === "hoyere");
  if (runde === 2) {
    const lo = Math.min(verdi(hand[0]), verdi(hand[1]));
    const hi = Math.max(verdi(hand[0]), verdi(hand[1]));
    const v = verdi(k);
    return v === lo || v === hi || (v > lo && v < hi) === (gjett === "innenfor");
  }
  return Number(gjett) === sortAv(k);
}
const SVAR = [["rod", "svart"], ["hoyere", "lavere"], ["innenfor", "utenfor"], ["1", "2", "0", "3"]];

export default async function (t) {
  const pause = () => t.sov(420);
  const tilstand = () => t.tilstand();
  // The kit offers «install as app» a moment after a finished game; close it if it shows.
  const lukkTips = async () => {
    await t.sov(2100);
    if (await t.finnes('#ark:not([hidden]) [data-h="lukk-ark"]')) await t.klikk('#ark [data-h="lukk-ark"]');
  };

  // 1. The 18+ gate: «Nei» leads away from the game, «Ja» opens it (and is remembered)
  // Language-neutral (rusj/SPRAK.md): the words checked on screen, per edition.
  const O = {
    nb: { navn: "Bussen", over: /stå over/, runde1: /Rød eller svart/, slurk: /1 slurk/, angre: /Angre – nytt kort/, tom: /tom/, vinner: /vinner!|vant/, kaar: /KÅRINGEN|Kåringen/, alle: /alle fire/, gikkAv: /gikk av bussen – helt greit/, slurker: /\d+ slurk/ },
    en: { navn: "Party Bus", over: /sit out/, runde1: /Red or black/, slurk: /1 sip/, angre: /Undo – new card/, tom: /empty/, vinner: /wins?!|won/, kaar: /results/i, alle: /all four/, gikkAv: /got off the bus – that's fine/, slurker: /\d+ sip/ },
    da: { navn: "Bussen", over: /stå over/, runde1: /Rød eller sort/, slurk: /1 slurk/, angre: /Fortryd – nyt kort/, tom: /tom/, vinner: /vinder!|vandt/, kaar: /kåringen/i, alle: /alle fire/, gikkAv: /stod af bussen – helt i orden/, slurker: /\d+ slurk/ },
  }[t.sprak];
  await t.start({ navn: NAVN });
  t.sjekk(/18/.test(await t.tekst("#skjerm h1")), "18-årsgrensen vises ikke før spillet");
  t.sjekk(/vann|Alkoholfrit|water|alcohol-free|vand/i.test(await t.tekst("#skjerm")), "18-årsgrensen mangler drikk med vett-teksten");
  await t.bilde("alder");
  await t.klikk('[data-h="alder-nei"]');
  await t.vent(`location.pathname === ${JSON.stringify(t.forside)}`, 8000);
  t.sjekk((await t.js("location.pathname")) === t.forside, "«Nei» skulle føre bort fra spillet");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('[data-h="alder-ja"]'), "Spillet åpnet uten 18-årsbekreftelse etter «Nei»");
  await t.klikk('[data-h="alder-ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === O.navn, "«Ja» åpnet ikke spillet");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === O.navn, "18-årsbekreftelsen ble ikke husket");
  await t.bilde("hjem");

  // 2. Setup: sips level as tiles first, players
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall('.fliser [data-h="niva"]')) === 2, "Oppsettet mangler valget for slurker");
  t.sjekk(await t.finnes('[data-h="niva"][data-v="rolig"][aria-pressed="true"]'), "«Rolig» skal være valgt som standard");
  t.sjekk(O.over.test(await t.tekst("#skjerm")), "Oppsettet sier ikke at alle kan stå over");
  await t.klikk('[data-h="niva"][data-v="klassisk"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke de tre spillerne");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.bu-intro')");
  t.sjekk(O.runde1.test(await t.tekst("#skjerm h1")), "Runde 1 skal være «Rød eller svart?»");
  t.sjekk(O.slurk.test(await t.tekst(".bu-pris")), "Runde 1 sier ikke hvor mange slurker et feil svar koster");
  t.sjekk((await tilstand())._aktiv === true, "Spillet regnes ikke som pågående");
  await t.bilde("intro-1");

  // 3. Four rounds × three players; check every answer against the rules
  let sjekket = 0;
  let vannSett = false;
  for (let runde = 0; runde < 4; runde++) {
    if (runde > 0) {
      await t.vent("document.querySelector('.bu-intro')");
      if (await t.finnes(".bu-vann")) vannSett = true;
      if (runde === 2) await t.bilde("intro-3-vann");
    }
    await pause();
    await t.klikk('[data-h="runde"]');
    for (let n = 0; n < 3; n++) {
      await t.vent("document.querySelector('[data-h=\"gjett\"]')");
      let s = await tilstand();
      const i = (s.spill.forste + s.spill.teller) % 3;
      t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[i], `Feil spiller står for tur i runde ${runde + 1}`);
      if (runde === 0 && n === 0) await t.bilde("tur-rod-svart");
      if (runde === 3 && n === 0) await t.bilde("tur-sort");
      const valg = SVAR[runde][(runde + n) % SVAR[runde].length];
      const hand = s.spill.hender[i].slice();
      await pause();
      await t.klikk(`[data-h="gjett"][data-v="${valg}"]`);
      await t.vent("document.querySelector('.bu-utfall')");
      s = await tilstand();
      const k = s.spill.hender[i][runde];
      const svar = s.spill.svar[i][runde];
      t.sjekk(svar.riktig === fasit(hand, runde, valg, k), `Svaret «${valg}» på kort ${k} i runde ${runde + 1} ble vurdert feil`);
      t.sjekk(svar.slurker === (svar.riktig ? 0 : runde + 1), `«Klassisk» skal gi ${runde + 1} slurker for feil i runde ${runde + 1}`);
      sjekket++;
      if (runde === 0 && n === 0) {
        await t.sov(500);
        await t.bilde("svar");
        // «Angre»: the card goes back into the deck, the same player answers again
        t.sjekk(O.angre.test(await t.tekst('[data-h="angre"]')), "«Angre» sier ikke at det gir et nytt kort");
        await t.klikk('[data-h="angre"]');
        s = await tilstand();
        t.sjekk(s.spill.fase === "gjett" && s.spill.hender[i].length === 0 && s.spill.svar[i].length === 0, "«Angre» tok ikke tilbake svaret");
        t.sjekk(s.spill.stokk.length === 52 && s.spill.stokk.includes(k), "«Angre» la ikke kortet tilbake i bunken");
        await pause();
        await t.klikk(`[data-h="gjett"][data-v="${valg}"]`);
        await t.vent("document.querySelector('.bu-utfall')");
        s = await tilstand();
        t.sjekk(s.spill.svar[i][0].riktig === fasit([], 0, valg, s.spill.hender[i][0]), "Svaret etter angring ble vurdert feil");
        // Reload in the middle: the answer stays
        await t.lastSide(t.side, "document.querySelector('.bu-utfall')");
        t.sjekk((await tilstand()).spill.svar[i].length === 1, "Svaret forsvant ved omlasting");
        // Back to home and continue
        await t.klikk("#tilbake");
        t.sjekk(await t.finnes('.hjem-knapper [data-h="fortsett"]'), "Mangler «Fortsett» mens spillet pågår");
        await t.klikk('[data-h="nytt"]');
        t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spør ikke før spillet kastes");
        await t.klikk('#ark [data-v="nei"]');
        await t.klikk('[data-h="fortsett"]');
        await t.vent("document.querySelector('.bu-utfall')");
      }
      await pause();
      await t.klikk('[data-h="neste"]');
    }
  }
  t.sjekk(sjekket === 12, `Bare ${sjekket} av 12 svar ble spilt`);
  t.sjekk(vannSett, "Ingen vannpause underveis");

  // 4. Who takes the bus: the most misses
  await t.vent("document.querySelector('.skjerm-bussvalg')");
  let s = await tilstand();
  const feil = s.spill.svar.map((liste) => liste.filter((x) => !x.riktig).length);
  const maks = Math.max(...feil);
  await t.sov(900);
  await t.bilde("bussvalg");
  if (maks === 0) {
    t.sjekk(O.tom.test(await t.tekst("#skjerm h1")), "Ingen feil: bussen skal kjøre tom");
    await t.klikk('[data-h="kaaring"]');
  } else {
    const hvem = s.spill.buss.hvem;
    t.sjekk(feil[hvem] === maks, "Bussen ble ikke gitt til den med flest feil");
    t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[hvem]), "Navnet på den som tar bussen vises ikke");
    await t.klikk('[data-h="kjor"]');
    await t.vent("document.querySelector('.bu-rute')");
    await t.sov(400);
    await t.bilde("buss");
    t.sjekk((await t.antall(".bu-rute .sk-kort")) === 6, "Bussruta skal ha seks kort");
    // Ride: one deliberate miss first (to try «Angre»), then guess sensibly until the end
    let vakt = 0;
    let bomBilde = false;
    for (;;) {
      if (++vakt > 40) {
        t.feil("Bussturen tok aldri slutt");
        break;
      }
      s = await tilstand();
      const b = s.spill.buss;
      if (b.fase === "framme" || b.fase === "sjafor") break;
      if (b.fase === "bom") {
        t.sjekk(b.bom <= 3, "Mer enn tre bom på bussen");
        if (!bomBilde) {
          bomBilde = true;
          await t.bilde("buss-bom");
          // «Angre» on the bus: the miss is taken back and that stop gets a fresh card
          const gammelt = b.rute[b.vist];
          t.sjekk(O.angre.test(await t.tekst('[data-h="bussangre"]')), "«Angre» på bussen sier ikke at det gir et nytt kort");
          await t.klikk('[data-h="bussangre"]');
          const etter = (await tilstand()).spill.buss;
          t.sjekk(etter.fase === "gjett" && etter.bom === b.bom - 1 && etter.pos === b.pos, "«Angre» på bussen tok ikke tilbake bommet");
          t.sjekk(etter.rute[b.vist] !== gammelt || etter.rute.length === 6, "Holdeplassen fikk ikke et nytt kort etter angring");
          await pause();
          continue;
        }
        await t.klikk('[data-h="nytur"]');
        await t.vent("document.querySelector('[data-h=\"buss\"]')");
        s = await tilstand();
        t.sjekk(s.spill.buss.pos === 0 && s.spill.buss.forsok === b.forsok + 1, "En ny tur startet ikke fra start med nye kort");
        await pause();
        continue;
      }
      const naa = b.rute[b.pos];
      const neste = b.rute[b.pos + 1];
      let gjett = verdi(naa) < 8 ? "hoyere" : "lavere";
      if (!bomBilde && verdi(neste) !== verdi(naa)) gjett = verdi(neste) > verdi(naa) ? "lavere" : "hoyere"; // one sure miss, to try «Angre»
      const riktig = verdi(neste) === verdi(naa) || (verdi(neste) > verdi(naa)) === (gjett === "hoyere");
      await t.klikk(`[data-h="buss"][data-v="${gjett}"]`, 900);
      s = await tilstand();
      const etter = s.spill.buss;
      if (riktig) t.sjekk(etter.pos === b.pos + 1, "Et riktig svar flyttet ikke bussen én holdeplass");
      else t.sjekk(etter.bom === b.bom + 1, "Et bom ble ikke talt");
    }
    s = await tilstand();
    t.sjekk(s.spill.buss.bom <= 3, "Sjåføren skulle gitt seg etter tre bom");
    await t.sov(600);
    await t.bilde("buss-slutt");
    await t.klikk('[data-h="kaaring"]');
  }

  // 5. The crowning: most right answers wins, the bus is summed up, water reminder, evening scoreboard
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(700);
  s = await tilstand();
  const riktige = s.spill.svar.map((liste) => liste.filter((x) => x.riktig).length);
  const best = Math.max(...riktige);
  const vinnere = NAVN.filter((_, i) => riktige[i] === best);
  const h1 = (await t.tekst("#skjerm h1")).trim();
  t.sjekk(best === 0 || vinnere.every((v) => h1.includes(v)), `Feil vinner: «${h1}»`);
  t.sjekk(O.vinner.test(h1), "Vinnerlinja mangler");
  t.sjekk(O.kaar.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk(await t.finnes(".bu-vann"), "Sluttskjermen mangler vannpåminnelsen");
  t.sjekk(await t.finnes(`.dokk a.lenke[href="${t.forside}"]`), "Mangler «Alle spill»");
  t.sjekk(!/fyllik|taper|full/i.test(await t.tekst("#skjerm")), "Sluttskjermen har ord som kan henge ut noen");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "bussen"), "Resultatet ble ikke registrert i «Kveldens gjeng»");
  t.sjekk(s._aktiv === false, "Et ferdig spill skal ikke regnes som pågående");
  await t.bilde("kaaring", true);
  await lukkTips();

  // 6. Small screens: the question and the answer stay above the buttons (also the four-suit round)
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  const sjekkSkjerm = async (navn, velger) => {
    const ok = await t.js(`(() => { const d = document.querySelector("#skjerm .dokk").getBoundingClientRect(); const e = document.querySelector(${JSON.stringify(velger)}).getBoundingClientRect(); return e.bottom <= d.top + 2; })()`);
    t.sjekk(ok, `«${velger}» skjules bak knappene på ${navn}`);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `Siden er for bred på ${navn}`);
  };
  for (const [b, h, navn] of [[320, 568, "320"], [Math.min(375, b0), 560, "375x560"]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.klikk('[data-h="igjen"]');
    await t.vent("document.querySelector('.bu-intro')");
    await pause();
    await t.bilde(`intro-${navn}`);
    await t.klikk('[data-h="runde"]');
    await t.vent("document.querySelector('[data-h=\"gjett\"]')");
    await sjekkSkjerm(navn, ".bu-sporsmal h2");
    await t.bilde(`tur-${navn}`);
    await pause();
    await t.klikk('[data-h="gjett"][data-v="rod"]');
    await t.vent("document.querySelector('.bu-utfall')");
    await t.sov(500);
    await sjekkSkjerm(navn, ".bu-utfall-tekst");
    await t.bilde(`svar-${navn}`);
    // Jump to round four for the four suit buttons
    const sp = (await tilstand()).spill;
    sp.runde = 3;
    sp.fase = "gjett";
    sp.teller = 0;
    sp.sist = null;
    sp.angre = null;
    sp.hender = sp.hender.map(() => [0, 1, 2]);
    sp.svar = sp.svar.map(() => [{ gjett: "rod", riktig: true, likt: false, slurker: 0 }, { gjett: "hoyere", riktig: true, likt: false, slurker: 0 }, { gjett: "innenfor", riktig: false, likt: false, slurker: 3 }]);
    sp.stokk = sp.stokk.filter((k) => k > 2);
    await t.js(`localStorage.setItem("${t.nokkel("bussen.v1")}", ${JSON.stringify(JSON.stringify({ ...(await tilstand()), spill: sp, skjerm: "tur", _tid: Date.now() }))})`);
    await t.lastSide(t.side, "document.querySelector('.bu-sorter')");
    await sjekkSkjerm(navn, ".bu-sporsmal h2");
    await t.bilde(`tur-sort-${navn}`);
    await t.klikk('[data-h="avslutt"]');
    t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="ja"]'), "«Avslutt» spør ikke først");
    await t.klikk('#ark [data-v="ja"]');
    await t.vent("document.querySelector('.skjerm-slutt')");
    await lukkTips();
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });

  // 7. Two players work too; the bus screen at 375 × 560
  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.klikk('[data-h="alder-ja"]');
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 2, "Oppsettet viser ikke to spillere");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.bu-intro')");
  const sp2 = (await tilstand()).spill;
  sp2.runde = 4;
  sp2.fase = "bussvalg";
  const rett = { riktig: true, likt: false, slurker: 0 };
  sp2.svar = [[{ riktig: false, slurker: 1 }, rett, rett, rett], [rett, rett, rett, rett]];
  sp2.hender = [[5, 20, 30, 40], [6, 21, 31, 41]];
  sp2.buss = { hvem: 0, kandidater: [0], maks: 1, rute: [], pos: 0, vist: 0, forsok: 0, bom: 0, slurker: 0, fase: "klar", utfall: null, sist: null, angre: null };
  await t.js(`localStorage.setItem("${t.nokkel("bussen.v1")}", ${JSON.stringify(JSON.stringify({ ...(await tilstand()), spill: sp2, skjerm: "bussvalg", _tid: Date.now() }))})`);
  await t.send("Emulation.setDeviceMetricsOverride", { width: Math.min(375, b0), height: 560, deviceScaleFactor: 2, mobile: true });
  await t.lastSide(t.side, "document.querySelector('[data-h=\"kjor\"]')");
  t.sjekk((await t.tekst("#skjerm h1")).includes("Testspiller A"), "Bussvalget med to spillere viser feil person");
  await t.bilde("bussvalg-375x560");
  await t.klikk('[data-h="kjor"]');
  await t.vent("document.querySelector('.bu-rute')");
  await sjekkSkjerm("375x560", ".bu-sporsmal h2");
  await t.bilde("buss-375x560");

  // 8. Landscape (844 × 390): the cards, the question and the answer buttons are on screen together
  const iVinduet = (velger) =>
    t.js(`(() => { const e = document.querySelector(${JSON.stringify(velger)}); if (!e) return false; const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight + 1 && b.left >= 0 && b.right <= window.innerWidth + 1; })()`);
  const liggende = async (hvor, velgere) => {
    for (const v of velgere) t.sjekk(await iVinduet(v), `Liggende mobil, ${hvor}: «${v}» er ikke synlig uten å rulle`);
  };
  // (Screenshots only when the whole run is in landscape: the runner compares widths with its own.)
  const bildeLiggende = async (navn) => {
    if (b0 >= 844) await t.bilde(navn);
  };
  await t.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await t.sov(400);
  await liggende("bussen", [".bu-rute", ".bu-sporsmal h2", '[data-h="buss"][data-v="hoyere"]', '[data-h="buss"][data-v="lavere"]']);
  await bildeLiggende("liggende-buss");
  // «Gå av bussen» is always there – and the crowning has the «Synsk» award for four of four
  await t.klikk('[data-h="gaav"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(/Testspiller B/.test(await t.tekst(".bu-synsk")) && O.alle.test(await t.tekst(".bu-synsk")), "Kåringen mangler «Synsk» for fire av fire");
  t.sjekk(O.gikkAv.test(await t.tekst("#skjerm")), "Å gå av bussen skal omtales vennlig");
  t.sjekk(!O.slurker.test(await t.tekst("#skjerm")), "Kåringen viser slurker");
  await t.sov(500);
  await bildeLiggende("liggende-kaaring");
  await lukkTips();
  // (The same crowning at the run's own size, so «Synsk» is in a picture at every size.)
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  await t.bilde("kaaring-synsk", true);
  await t.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.bu-intro')");
  await pause();
  await liggende("rundeintro", [".bu-intro h1", ".bu-intro .ingress", ".bu-forst", '[data-h="runde"]']);
  await bildeLiggende("liggende-intro");
  await t.klikk('[data-h="runde"]');
  await t.vent("document.querySelector('[data-h=\"gjett\"]')");
  await liggende("tur", [".bu-hand", ".bu-sporsmal h2", '[data-h="gjett"][data-v="rod"]', '[data-h="gjett"][data-v="svart"]']);
  await bildeLiggende("liggende-tur");
  await pause();
  await t.klikk('[data-h="gjett"][data-v="svart"]');
  await t.vent("document.querySelector('.bu-utfall')");
  await t.sov(500);
  await liggende("svar", [".bu-hand", ".bu-utfall-tekst", '[data-h="neste"]']);
  await bildeLiggende("liggende-svar");
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
}
