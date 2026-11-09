// Ringen: the 18+ gate («Nei» leads away, «Ja» opens the game), setup, drawing from the ring (a tap
// on a card and the button), a rule with typed text (escaped), a mate picked in a sheet, a thumb
// master, «Gjelder nå», the water break after 12 cards, reload mid-card, back + continue, «Nytt spill»
// asks first, three King toasts and the finale with the crowning, then small screens (375 × 560 and
// 320 × 568), «Spill igjen» and «Avslutt».
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const NOKKEL = "rusj.ringen.v1";
const RING = "document.querySelector('#ring-bord') && !document.querySelector('#nedtelling:not([hidden])')";
const KORT = "document.querySelector('#ring-kort')";

// The kit shows its 18+ gate before the game on a fresh phone.
async function aldersport(t, sjekkNei) {
  if (!(await t.finnes('[data-h="alder-ja"]'))) {
    await t.js(`(() => { const f = JSON.parse(localStorage.getItem("rusj.felles") || "{}"); delete f.over18; localStorage.setItem("rusj.felles", JSON.stringify(f)); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  }
  t.sjekk(await t.finnes('[data-h="alder-ja"]'), "18-årsgrensen vises ikke før spillet");
  if (sjekkNei) {
    t.sjekk(/over 18/i.test(await t.tekst("#skjerm h1")), "Aldersgrensen spør ikke om man er over 18");
    t.sjekk(/alkoholfritt/i.test(await t.tekst("#skjerm")), "Aldersgrensen nevner ikke at alkoholfritt teller");
    await t.bilde("aldersgrense");
    await t.klikk('[data-h="alder-nei"]', 50);
    await t.vent("location.pathname === '/' && document.readyState === 'complete'", 8000);
    t.sjekk(!/\/ringen\//.test(await t.js("location.pathname")), "«Nei, ta meg tilbake» ble på spillsiden");
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    t.sjekk(await t.finnes('[data-h="alder-ja"]'), "Etter «Nei» skal aldersgrensen vises igjen");
  }
  await t.klikk('[data-h="alder-ja"]');
  await t.vent("document.querySelector('.spillhjem h1')");
}

// Put cards of the given values at the given ring positions (swapping, so the ring stays a full
// deck), then reload. plasser: [[pos, value 0–12], ...]
async function leggKort(t, plasser) {
  const ok = await t.js(`(() => {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)}));
    const r = s.spill.ring;
    const satt = new Set();
    for (const [pos, v] of ${JSON.stringify(plasser)}) {
      const j = r.findIndex((id, p) => id >= 0 && id % 13 === v && !satt.has(p));
      if (j < 0) return false;
      [r[pos], r[j]] = [r[j], r[pos]];
      satt.add(pos);
    }
    localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s));
    return true;
  })()`);
  t.sjekk(ok, `Fant ikke kortene ${JSON.stringify(plasser)} i ringen`);
  await t.lastSide(t.side, RING);
  await t.sov(420);
}

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const s = () => t.tilstand();

  // ---------- 18+ gate and home ----------
  await aldersport(t, true);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Ringen", "Hjem-skjermen viser ikke «Ringen» etter aldersgrensen");
  t.sjekk(await t.finnes("#tilportal:not([hidden])"), "Mangler rusj-knappen øverst på hjem-skjermen");
  await t.bilde("hjem-etter-18");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(!(await t.finnes('[data-h="alder-ja"]')), "Aldersgrensen kom tilbake selv om den var godkjent");
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark .ring-tabell li")) === 13, "Reglene viser ikke alle de 13 kortverdiene");
  t.sjekk(/alkoholfritt/i.test(await t.tekst("#ark")), "Reglene sier ikke at alkoholfritt teller like mye");
  await t.bilde("regler-kortene");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Setup ----------
  await t.start({ navn: NAVN });
  await aldersport(t, false);
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4, "Oppsettet viser ikke de fire lagrede spillerne");
  t.sjekk(/alle kan stå over/i.test(await t.tekst("#skjerm")), "Oppsettet sier ikke at alle kan stå over");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent(RING);
  let st = await s();
  t.sjekk(st._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  t.sjekk((await t.antall(".ring-rygg")) === 52, "Ringen har ikke 52 kort");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[st.spill.tur], "Overskriften viser ikke hvem som har tur");
  await t.sov(300);
  await t.bilde("ring");

  // ---------- A real tap on one card in the ring takes exactly that card ----------
  await pause();
  const iRingen = st.spill.ring[13];
  const forsteTur = st.spill.tur;
  await t.trykk('#ring-bord [data-pos="13"]');
  await t.vent(KORT, 5000);
  st = await s();
  t.sjekk(st.spill.kort === iRingen && st.spill.ring[13] === -1, "Trykk på et kort i ringen tok ikke det kortet");
  t.sjekk(st.spill.nr === 1, "Kortet ble ikke talt");
  await t.sov(500);
  await t.bilde("kort");
  t.sjekk((await t.antall("#skjerm h1")) === 1, "Kortskjermen skal ha nøyaktig én h1");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(RING);
  st = await s();
  t.sjekk(st.spill.tur === (forsteTur + 1) % 4, "Turen gikk ikke videre til neste spiller");
  t.sjekk((await t.antall(".ring-rygg")) === 51, "Kortet er ikke borte fra ringen");

  // ---------- A rule with typed text (and an idea) ----------
  await leggKort(t, [[0, 10], [26, 7], [39, 4]]);
  await t.trykk('#ring-bord [data-pos="0"]');
  await t.vent(KORT, 5000);
  t.sjekk(/Regel/.test(await t.tekst("#ring-kort h1")), "Knekt skal gi «Regel»");
  const ide1 = await t.tekst(".ring-ide-tekst");
  for (let n = 0; n < 3 && (await t.tekst(".ring-ide-tekst")) === ide1; n++) await t.klikk('[data-h="ide"]');
  t.sjekk((await t.tekst(".ring-ide-tekst")) !== ide1, "🎲 ga ikke et nytt forslag");
  await t.klikk('[data-h="ide-bruk"]');
  t.sjekk((await t.js("document.querySelector('#ring-utkast').value")).length > 3, "«Bruk» fylte ikke inn forslaget");
  await t.skrivInn("#ring-utkast", "Ingen får si <x-q>ja</x-q>");
  await t.bilde("regel");
  await t.lastSide(t.side, KORT);
  t.sjekk((await t.js("document.querySelector('#ring-utkast').value")) === "Ingen får si <x-q>ja</x-q>", "Regelteksten forsvant ved omlasting");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(RING);
  st = await s();
  t.sjekk(st.spill.regler.length >= 1 && st.spill.regler[st.spill.regler.length - 1].t === "Ingen får si <x-q>ja</x-q>", "Regelen ble ikke lagret");

  // ---------- A mate, picked in a sheet ----------
  await pause();
  await t.trykk('#ring-bord [data-pos="26"]');
  await t.vent(KORT, 5000);
  t.sjekk(/Kompis/.test(await t.tekst("#ring-kort h1")), "Åtter skal gi «Kompis»");
  const kompisTur = (await s()).spill.tur;
  await t.klikk('[data-h="kompis"]');
  t.sjekk((await t.antall('#ark [data-h="ark-svar"]')) === 3, "Kompis-arket skal vise de tre andre spillerne");
  await t.klikk('#ark [data-h="ark-svar"][data-v="0"]');
  st = await s();
  t.sjekk(Array.isArray(st.spill.roller.kompis) && st.spill.roller.kompis[0] === kompisTur && st.spill.roller.kompis[1] !== kompisTur, "Kompisen ble ikke valgt");
  t.sjekk(await t.finnes(".ring-valgt"), "Kortet viser ikke hvem som er kompis");
  await t.bilde("kompis");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(RING);

  // ---------- Thumb master, then «Gjelder nå» ----------
  await pause();
  await t.trykk('#ring-bord [data-pos="39"]');
  await t.vent(KORT, 5000);
  st = await s();
  t.sjekk(/Tommelmester/.test(await t.tekst("#ring-kort h1")) && st.spill.roller.tommel === st.spill.tur, "Femmer skal gjøre spilleren til tommelmester");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(RING);
  t.sjekk(await t.finnes(".ring-roller"), "Ringen viser ikke hva som gjelder nå");
  await t.bilde("ring-med-roller");
  await t.klikk('[data-h="roller"]');
  const ark = await t.tekst("#ark");
  t.sjekk(/Tommelmester/.test(ark) && /Kompiser/.test(ark) && ark.includes("Ingen får si <x-q>ja</x-q>"), "«Gjelder nå» viser ikke roller og regler");
  t.sjekk(!(await t.finnes("x-q")), "Regelteksten ble tolket som HTML");
  await t.bilde("gjelder-na");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Draw until the water break after 12 cards (taps on non-Kings, one with the button) ----------
  for (let n = (await s()).spill.nr; n < 12; n++) {
    await pause();
    st = await s();
    if (n === 6) await t.klikk('[data-h="trekk"]', 50); // at most the 2nd King: the finale can't come yet
    else await t.trykk(`#ring-bord [data-pos="${st.spill.ring.findIndex((id) => id >= 0 && id % 13 !== 12)}"]`);
    await t.vent(KORT, 5000);
    await pause();
    await t.klikk('[data-h="neste"]');
    await t.vent(n < 11 ? RING : "document.querySelector('.ring-vann')", 5000);
  }
  st = await s();
  t.sjekk(st.spill.fase === "vann" && st.spill.nr === 12, `Vannpausen kom ikke etter 12 kort (fase ${st.spill.fase}, kort ${st.spill.nr})`);
  t.sjekk(/vann/i.test(await t.tekst("#skjerm h1")), "Vannpausen har ikke en tydelig overskrift");
  await t.bilde("vannpause");
  await pause();
  await t.klikk('[data-h="vann-ferdig"]');
  await t.vent(RING);
  t.sjekk((await s()).spill.vann === 1, "Vannpausen ble ikke talt");

  // ---------- Reload mid-card, back + continue, «Nytt spill» asks first ----------
  await pause();
  await t.klikk('[data-h="trekk"]', 50);
  await t.vent(KORT, 5000);
  const kortFor = (await s()).spill.kort;
  await t.lastSide(t.side, KORT);
  t.sjekk((await s()).spill.kort === kortFor, "Et annet kort viste seg etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await s()).spill !== null, "Spillet forsvant selv om vi avbrøt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(KORT);
  t.sjekk((await s()).spill.kort === kortFor, "«Fortsett» viste ikke det samme kortet");

  // ---------- Small screens: what the screen is about stays above the dock ----------
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  const over = (sel) => t.js(`(() => { const a = document.querySelector(${JSON.stringify(sel)}); const d = document.querySelector('#skjerm .dokk'); if (!a || !d) return false; return a.getBoundingClientRect().bottom <= d.getBoundingClientRect().top + 2; })()`);
  // Landscape (844 × 390): the card and the ring sit beside the dock, never under it
  const fri = (sel) => t.js(`(() => { const a = document.querySelector(${JSON.stringify(sel)}); if (!a) return false; const r = a.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight + 1) return false; const d = document.querySelector('#skjerm .dokk'); if (!d) return true; const q = d.getBoundingClientRect(); return q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom; })()`);
  const synlig = (sel) => t.js(`(() => { const a = document.querySelector(${JSON.stringify(sel)}); return !!a && getComputedStyle(a).display !== "none" && a.getBoundingClientRect().height > 0; })()`);
  t.sjekk((await t.tekst(".ring-neste-linje")).includes("trekker neste") && (await t.tekst('[data-h="neste"]')).trim() === "Neste kort", "Kortet viser ikke «X trekker neste» over «Neste kort»");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    await t.js("window.scrollTo(0, 0)");
    if (b > h) t.sjekk(await fri("#ring-kort .ring-tekst"), `Regelteksten dekkes av knappene på ${b} × ${h}`);
    else t.sjekk(await over("#ring-kort .ring-tekst"), `Regelteksten skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await synlig(".ring-fot"), `Bunnlinjen «Alkoholfritt teller like mye» mangler på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`kort-${b}x${h}`);
  }
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('#ring-bord, .ring-vann')");
  await t.js("window.scrollTo(0, 0)");
  if (await t.finnes(".ring-vann")) {
    await pause();
    await t.klikk('[data-h="vann-ferdig"]');
    await t.vent(RING);
  }
  for (const [b, h] of [[320, 568], [Math.min(375, b0), 560], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    await t.js("window.scrollTo(0, 0)");
    if (b > h) {
      t.sjekk(await fri("#ring-bord"), `Ringen dekkes av knappene på ${b} × ${h}`);
      t.sjekk(await fri("#skjerm h1"), `Navnet dekkes av knappene på ${b} × ${h}`);
    } else {
      t.sjekk(await over("#ring-bord"), `Ringen skjules bak knappene på ${b} × ${h}`);
      t.sjekk(await over("#skjerm h1"), `Navnet skjules bak knappene på ${b} × ${h}`);
    }
    // Short screens: «Gjelder nå» is one line with the role written out
    t.sjekk(await synlig(".ring-roller-linje") && /Tommel: /.test(await t.tekst(".ring-roller-linje")), `«Gjelder nå» er ikke én linje med rollen skrevet ut på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`ring-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // ---------- The Kings: three toasts, then the finale ----------
  st = await s();
  const kongerIgjen = 4 - st.spill.konger;
  const plasser = [];
  for (let n = 0, p = 0; n < kongerIgjen; p++) if (st.spill.ring[p] >= 0) plasser.push([p, 12]), n++;
  await leggKort(t, plasser);
  let skrevSkal = false;
  for (let n = 0; n < plasser.length; n++) {
    await pause();
    await t.trykk(`#ring-bord [data-pos="${plasser[n][0]}"]`);
    await t.vent(KORT, 5000);
    st = await s();
    if (st.spill.konger < 4) {
      t.sjekk(/Kongeskål/.test(await t.tekst("#ring-kort h1")), "Kongen skal gi «Kongeskål»");
      if (!skrevSkal) {
        skrevSkal = true;
        await t.skrivInn("#ring-utkast", "Skål for testgjengen!");
        await t.bilde("kongeskal");
      }
      await pause();
      await t.klikk('[data-h="neste"]');
      await t.vent("document.querySelector('#ring-bord, .ring-vann')");
      if (await t.finnes(".ring-vann")) {
        await pause();
        await t.klikk('[data-h="vann-ferdig"]');
        await t.vent(RING);
      }
    }
  }
  st = await s();
  t.sjekk(st.spill.konger === 4 && st.spill.kronet === st.spill.tur, "Den fjerde kongen ga ikke finale");
  t.sjekk(await t.finnes("#ring-kort.finale"), "Finalekortet vises ikke");
  t.sjekk(!skrevSkal || (await t.tekst(".ring-skaler")).includes("Skål for testgjengen!"), "Finalen viser ikke skålene");
  t.sjekk(!/drikk (opp|ut)|hele glasset|chug|shot/i.test(await t.tekst("#ring-kort")), "Finalen må aldri be noen drikke opp");
  await t.sov(400);
  await t.bilde("finale");
  const kronet = st.spill.kronet;
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.ring-banner')");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === `${NAVN[kronet]} ble kronet!`, `Feil kåring: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(!skrevSkal || (await t.tekst("#skjerm")).includes("Skål for testgjengen!"), "Kåringen viser ikke kveldens skåler");
  t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await s())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk(!(await t.finnes("x-q")), "Brukertekst ble tolket som HTML på kåringen");
  await t.sov(600);
  await t.bilde("kaaring", true);

  // ---------- «Spill igjen», then «Avslutt» asks and ends ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent(RING);
  st = await s();
  t.sjekk(st.spill.nr === 0 && st.spill.antall === 4 && st.spill.konger === 0, "«Spill igjen» startet ikke en ny ring med samme gjeng");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await s()).skjerm === "ring", "«Spill videre» skulle bli i spillet");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await s()).spill === null, "«Avslutt» avsluttet ikke spillet");

  // ---------- Three players (minimum), wide 16-letter names on a 320 px phone ----------
  await t.start({ navn: ["Testspiller A", "WWWWWWWWWWWWWWWW", "Bestemor Gunhild"] });
  await aldersport(t, false);
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes('[data-h="spiller-fjern"]')), "Det skal ikke gå an å spille med færre enn tre");
  await t.klikk('[data-h="start"]');
  await t.vent(RING);
  await endreTur(t, 0); // Testspiller A draws, so the widest name is next
  await pause();
  await t.klikk('[data-h="trekk"]', 50);
  await t.vent(KORT, 5000);
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(500);
  const knappBred = await t.js("(() => { const b = document.querySelector('[data-h=\"neste\"]').getBoundingClientRect(); const l = document.querySelector('.ring-neste-linje').getBoundingClientRect(); return b.right <= innerWidth + 1 && l.right <= innerWidth + 1; })()");
  t.sjekk(knappBred, "«Neste kort» eller navnelinja stikker utenfor skjermen med et langt navn på 320 px");
  await t.bilde("langt-navn-320");
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // ---------- «Avslutt»: «Spill videre» stays, «Ta finalen nå» gives the finale and the crowning ----------
  await pause();
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="finale-na"]') && (await t.finnes('#ark [data-h="avslutt-uten"]')), "«Avslutt» tilbyr ikke «Ta finalen nå»");
  await t.bilde("avslutt-ark");
  await t.klikk('#ark [data-h="lukk-ark"]');
  t.sjekk((await s()).skjerm === "kort" && (await s()).spill.kort != null, "«Spill videre» skulle bli i spillet");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="finale-na"]');
  await t.vent("document.querySelector('#ring-kort.finale')");
  st = await s();
  t.sjekk(st.spill.tidlig === true && st.spill.kronet === st.spill.tur, "«Ta finalen nå» ga ikke finalen");
  t.sjekk(/Finale/.test(await t.tekst("#skjerm h1")), "Finalekortet har ikke overskriften «Finale!»");
  await t.lastSide(t.side, "document.querySelector('#ring-kort.finale')");
  t.sjekk((await s()).spill.tidlig === true, "Finalen forsvant ved omlasting");
  await t.bilde("finale-tidlig");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.ring-banner')");
  t.sjekk(/ble kronet!/.test(await t.tekst("#skjerm h1")) && /Finalen/i.test(await t.tekst(".ring-banner .etikett")), "Tidlig finale ga ikke kåring");
  await t.bilde("kaaring-tidlig", true);

  // ---------- «Avslutt» → «Avslutt» ends without a finale ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent(RING);
  await pause();
  await t.klikk('[data-h="trekk"]', 50);
  await t.vent(KORT, 5000);
  await pause();
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="avslutt-uten"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await s()).spill === null, "«Avslutt» uten finale avsluttet ikke spillet");
}

// Give the turn to player i (and reload), for a predictable "next" player.
async function endreTur(t, i) {
  await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); s.spill.tur = ${i}; localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
  await t.lastSide(t.side, RING);
  await t.sov(420);
}
