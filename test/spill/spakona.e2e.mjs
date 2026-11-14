// Spåkona: the 18+ gate, setup, a hint («higher») that greys out the impossible keys and a right
// second guess (one point, the dealer drinks), three misses in a row that hand the deck on, the
// cards on the table, reload in the middle of a guess, back + continue, «Nytt spill» asks first,
// the water break after twelve cards, small screens and a phone on its side, the last card and
// Kåringen (podium, the evening's scoreboard, sharing, the «sist» line), «Spill igjen», quitting.
// Language-neutral (rusj/SPRAK.md): words are checked per edition through ORD.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const ORD = {
  nb: { navn: "Spåkona", alkfri: /alkoholfritt/i, over: /stå over/i, vann: /vann/i, hoyere: "Høyere!", fot: /alle kan stå over/ },
  en: { navn: "Mystic", alkfri: /alcohol-free/i, over: /sit .*out/i, vann: /water/i, hoyere: "Higher!", fot: /anyone can sit out/ },
  da: { navn: "Spåkonen", alkfri: /alkoholfrit/i, over: /stå over/i, vann: /vand/i, hoyere: "Højere!", fot: /alle kan stå over/ },
};
const SPILL = "document.querySelector('.spa-taster, .spa-utfall') && document.querySelector('#spa-kort')";

async function aldersport(t, sjekkNei) {
  if (!(await t.finnes('[data-h="alder-ja"]'))) {
    await t.js(`(() => { const f = JSON.parse(localStorage.getItem("rusj.felles") || "{}"); delete f.over18; localStorage.setItem("rusj.felles", JSON.stringify(f)); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  }
  t.sjekk(await t.finnes('[data-h="alder-ja"]'), "18-årsgrensen vises ikke før spillet");
  if (sjekkNei) {
    await t.bilde("aldersgrense");
    await t.klikk('[data-h="alder-nei"]', 50);
    await t.vent(`location.pathname === ${JSON.stringify(t.forside)} && document.readyState === 'complete'`, 8000);
    t.sjekk((await t.js("location.pathname")) === t.forside, "«Nei, ta meg tilbake» ble på spillsiden");
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    t.sjekk(await t.finnes('[data-h="alder-ja"]'), "Etter «Nei» skal aldersgrensen vises igjen");
  }
  await t.klikk('[data-h="alder-ja"]');
  await t.vent("document.querySelector('.spillhjem h1')");
}

export default async function (t) {
  const O = ORD[t.sprak];
  const s = () => t.tilstand();
  const pause = () => t.sov(420);
  const NOKKEL = t.nokkel("spakona.v1");
  const endre = async (kode, vent = SPILL) => {
    await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); ${kode}; localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
    await t.lastSide(t.side, vent);
    await t.sov(450);
  };
  const verdi = (k) => (k % 13) + 1;
  const tast = async (v) => {
    await t.klikk(`.spa-tast[data-v="${v}"]`, 60);
    await t.sov(650);
  };
  // A miss on purpose: a first guess at the far end, then a wrong value on the right side.
  const bom = async () => {
    const st = await s();
    const v = verdi(st.spill.stokk[st.spill.pos]);
    const forste = v >= 7 ? 1 : 13;
    await tast(forste);
    const mulige = await t.js(`Array.from(document.querySelectorAll('.spa-tast:not(:disabled)')).map((b) => Number(b.dataset.v))`);
    await tast(mulige.find((x) => x !== v));
    return (await s()).spill.utfall;
  };

  // ---------- 18+ gate, home, rules ----------
  await aldersport(t, true);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === O.navn, `Hjem-skjermen viser ikke «${O.navn}» etter aldersgrensen`);
  await t.klikk("#reglerknapp");
  t.sjekk(O.alkfri.test(await t.tekst("#ark")) && O.over.test(await t.tekst("#ark")), "Reglene sier ikke at alkoholfritt teller og at alle kan stå over");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Setup ----------
  await t.start({ navn: NAVN });
  await aldersport(t, false);
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 4, "Oppsettet viser ikke de fire lagrede spillerne");
  t.sjekk(await t.finnes(".spa-vett"), "Oppsettet mangler «Slik er slurkene»");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent(SPILL);
  let st = await s();
  t.sjekk(st._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  t.sjekk(st.spill.giver !== st.spill.gjetter, "Giveren gjetter selv");
  t.sjekk((await t.antall(".spa-tast")) === 13 && (await t.antall(".spa-tast:disabled")) === 0, "Tastene for 13 verdier mangler");
  t.sjekk((await t.antall(".spa-bord-liste li")) === 13, "Bordet viser ikke 13 verdier");
  t.sjekk((await t.tekst(".spa-giver")).includes(NAVN[st.spill.giver]) && (await t.tekst(".spa-navn")).includes(NAVN[st.spill.gjetter]), "Skjermen viser ikke hvem som gjetter og hvem som gir");
  await t.bilde("gjett");

  // ---------- A hint, then a right second guess ----------
  await endre("const i = s.spill.stokk.indexOf(6); s.spill.stokk[i] = s.spill.stokk[0]; s.spill.stokk[0] = 6");
  const gjetter0 = (await s()).spill.gjetter;
  const giver0 = (await s()).spill.giver;
  await tast(3);
  st = await s();
  t.sjekk(st.spill.fase === "gjett2" && st.spill.hint === "hoyere", "Spåkona sa ikke «høyere»");
  t.sjekk((await t.tekst(".spa-hint .stempel")).trim().toLowerCase() === O.hoyere.toLowerCase(), "Stempelet sier ikke «Høyere!»");
  t.sjekk(await t.js(`[1, 2, 3].every((v) => document.querySelector('.spa-tast[data-v="' + v + '"]').disabled) && !document.querySelector('.spa-tast[data-v="4"]').disabled`), "Umulige verdier er ikke grået ut etter «høyere»");
  await t.bilde("hint");
  // Reload in the middle of a guess
  await t.lastSide(t.side, SPILL);
  await t.sov(400);
  t.sjekk((await s()).spill.fase === "gjett2" && (await t.js(`document.querySelector('.spa-tast[data-v="2"]').disabled`)), "Hintet forsvant ved omlasting");
  await tast(7);
  st = await s();
  t.sjekk(st.spill.utfall && st.spill.utfall.type === "andre" && st.spill.poeng[gjetter0] === 1, "Riktig på andre forsøk ga ikke ett poeng");
  t.sjekk(await t.finnes("#spa-kort.sk-opp"), "Kortet ble ikke snudd");
  t.sjekk((await t.tekst(".spa-hvem-drikker")).includes(NAVN[giver0]), "Det står ikke at giveren drikker");
  t.sjekk(await t.finnes(".spa-fot-linje"), "Bunnlinjen «alle kan stå over» mangler etter svaret");
  await t.sov(300);
  await t.bilde("riktig");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.sov(400);
  st = await s();
  t.sjekk(st.spill.pos === 1 && st.spill.gjetter !== gjetter0 && st.spill.gjetter !== st.spill.giver, "Neste kort fikk ikke neste gjetter");
  t.sjekk(/1/.test(await t.tekst(".spa-bord-tittel")), "Bordet teller ikke kortet som er spilt");

  // ---------- Three misses in a row: the deck moves on ----------
  for (let n = 0; n < 3; n++) {
    const u = await bom();
    t.sjekk(u && u.type === "bom" && u.slurker >= 1 && u.slurker <= 3, `Bom nr. ${n + 1} ga ikke 1–3 slurker`);
    if (n === 0) await t.bilde("bom");
    if (n < 2) {
      await pause();
      await t.klikk('[data-h="neste"]');
      await t.sov(400);
    }
  }
  st = await s();
  t.sjekk(st.spill.byttes === (giver0 + 1) % 4 && (await t.finnes(".spa-bytt")), "Tre bom på rad ga ikke kortstokken videre");
  await t.bilde("bytt-giver");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.sov(400);
  st = await s();
  t.sjekk(st.spill.giver === (giver0 + 1) % 4 && st.spill.gjetter === (giver0 + 2) % 4, "Ny giver eller første gjetter etter byttet er feil");

  // Back + continue; «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent(SPILL);

  // ---------- Small screens and a phone on its side ----------
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".spa-midt"), `Kortet og hintet skjules bak tastene på ${b} × ${h}`);
    t.sjekk(await t.friForDokk(".spa-bord"), `Bordet skjules bak tastene på ${b} × ${h}`);
    t.sjekk(await t.js(`(() => { const r = document.querySelector('.spa-taster').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; })()`), `Tastene går utenfor skjermen på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`gjett-${b}x${h}`);
  }
  await bom();
  for (const [b, h] of [[320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".spa-utfall"), `Svaret skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await t.js(`(() => { const e = document.querySelector('.spa-fot-linje'); return !!e && ${O.fot}.test(e.textContent); })()`), `Bunnlinjen mangler på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`svar-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // ---------- Water after twelve cards ----------
  await endre("s.spill.pos = 11; s.spill.fase = 'svar'; s.spill.byttes = null; s.spill.utfall = { type: 'bom', avstand: 1, slurker: 1 }; s.spill.g1 = 1; s.spill.g2 = 2; s.spill.hint = 'hoyere'", "document.querySelector('.spa-utfall')");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.spa-vann')", 5000);
  t.sjekk(O.vann.test(await t.tekst("#skjerm h1")) && (await s()).spill.fase === "vann", "Vannpausen kom ikke etter tolv kort");
  await t.bilde("vannpause");
  await pause();
  await t.klikk('[data-h="vann-ferdig"]');
  await t.vent(SPILL);
  t.sjekk((await s()).spill.fase === "gjett1" && (await s()).spill.pos === 12, "Etter vannpausen kom ikke neste kort");

  // ---------- The last card and Kåringen ----------
  await endre("s.spill.pos = 51; s.spill.fase = 'svar'; s.spill.byttes = null; s.spill.utfall = { type: 'forste', avstand: 0, slurker: 2 }; s.spill.g1 = 1; s.spill.g2 = null; s.spill.hint = null", "document.querySelector('.spa-utfall')");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.spa-banner')");
  t.sjekk((await t.tekst("#skjerm h1")).includes(NAVN[gjetter0]), "Kåringen kårer ikke den med flest poeng");
  t.sjekk(await t.finnes(".poengliste"), "Kåringen mangler poenglista");
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen mangler «Del kvelden»");
  if (await t.js("(window.RUSJ_ANDRE || []).length > 0")) t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await s())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  const kveld = await t.js(`JSON.parse(localStorage.getItem(${JSON.stringify(t.nokkel("kveld"))}) || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "spakona"), "Kåringen ble ikke registrert i «Kveldens gjeng»");
  await t.sov(500);
  await t.bilde("kaaring", true);
  await t.klikk('[data-h="del"]');
  await t.sov(400);
  // A reload on Kåringen goes home with the «sist» line
  await t.lastSide(t.side, "document.querySelector('.spillhjem')");
  t.sjekk(await t.finnes(".spa-sist"), "Hjem viser ikke «Sist …» etter et spill");
  await t.bilde("hjem-sist");

  // ---------- «Spill igjen»; quitting before anything happened; quitting midway ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent(SPILL);
  await pause();
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await s()).spill === null, "«Avslutt» før noe har skjedd skal bare avslutte");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent(SPILL);
  await bom();
  await pause();
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.spa-banner')");
  st = await s();
  t.sjekk(st.spill.ferdig === true && st.spill.pos === 0, "«Avslutt» midt i ga ikke kåringen etter ett kort");
  await t.bilde("kaaring-ingen");
  await t.klikk('[data-h="igjen"]');
  await t.vent(SPILL);
  t.sjekk((await s()).spill.pos === 0 && !(await s()).spill.ferdig, "«Spill igjen» startet ikke et nytt spill");
}
