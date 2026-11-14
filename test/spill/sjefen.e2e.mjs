// Sjefen: the 18+ gate («Nei» leads away, «Ja» opens the game), packs (Flørt off by default), the
// length, cards with the players' names (every name on the card, the same after a reload), swipe
// and «Neste kort», a rule with «Gjelder nå» and its end with the same names, the water card, the
// last card and Kåringen (sharing, the «sist» line on home), back + continue, «Nytt spill» asks
// first, small screens and a phone on its side, quitting early and «Spill igjen».
// Language-neutral (rusj/SPRAK.md): words are checked per edition through ORD.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const ORD = {
  nb: { navn: "Sjefen", alkfri: /alkoholfritt/i, over: /stå over/i, vann: /vann/i, skal: "Skål for gjengen!", fot: /alle kan stå over/ },
  en: { navn: "Bossy", alkfri: /alcohol-free/i, over: /sit .*out/i, vann: /water/i, skal: "Cheers to the crew!", fot: /anyone can sit out/ },
  da: { navn: "Chefen", alkfri: /alkoholfrit/i, over: /stå over/i, vann: /vand/i, skal: "Skål for banden!", fot: /alle kan stå over/ },
};
const KORT = "document.querySelector('#sj-kort:not(.ut)')";

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
  const NOKKEL = t.nokkel("sjefen.v1");
  const endre = async (kode, vent = KORT) => {
    await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); ${kode}; localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
    await t.lastSide(t.side, vent);
    await t.sov(450);
  };
  // Every player the card names is on it, and no placeholder is left.
  const navnPaKortet = async (hva) => {
    const st = await s();
    const tekst = await t.tekst(".storkort-tekst");
    t.sjekk(!/\{[abc]\}/.test(tekst), `Plassholder igjen på kortet (${hva}): «${tekst}»`);
    const x = st.spill.plan[st.spill.pos];
    const hvem = x.s != null ? st.spill.regelNavn[x.s] || [] : st.spill.hvem;
    for (const i of hvem) t.sjekk(tekst.includes(NAVN[i]), `${NAVN[i]} står ikke på kortet (${hva}): «${tekst}»`);
    return { st, tekst, hvem };
  };
  const neste = async () => {
    await pause();
    await t.klikk('[data-h="neste"]', 50);
    await t.sov(500);
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
  let st = await s();
  t.sjekk(st.oppsett.pakker.join() === "oppvarming,fest,utfordring" && st.oppsett.lengde === 50, `Standardoppsettet er feil: ${JSON.stringify(st.oppsett)}`);
  t.sjekk((await t.antall(".spiller")) === 4, "Oppsettet viser ikke de fire lagrede spillerne");
  t.sjekk(await t.finnes(".sj-vett"), "Oppsettet mangler «Slik er slurkene»");
  await t.bilde("oppsett", true);
  for (const id of ["oppvarming", "fest", "utfordring"]) await t.klikk(`[data-h="pakke"][data-v="${id}"]`, 40);
  t.sjekk(await t.js("document.querySelector('[data-h=\"start\"]').disabled"), "Start skal være av når ingen pakker er valgt");
  for (const id of ["fest", "flort"]) await t.klikk(`[data-h="pakke"][data-v="${id}"]`, 40);
  await t.klikk('[data-h="lengde"][data-v="30"]');
  t.sjekk((await s()).oppsett.lengde === 30, "Lengden kan ikke velges");
  await t.klikk('[data-h="start"]');
  await t.vent(KORT);
  st = await s();
  t.sjekk(st._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  const antallKort = st.spill.plan.filter((x) => x.k != null).length;
  t.sjekk(antallKort >= 28 && antallKort <= 30, `Spillet har ikke rundt 30 kort (${antallKort})`);
  t.sjekk(!t.norsk || (await t.tekst("#topp-tittel")).includes(`AV ${antallKort}`) || (await t.tekst("#topp-tittel")).includes(`av ${antallKort}`), `Toppen viser ikke «Kort 1 av ${antallKort}»`);
  t.sjekk(st.spill.pakker.join() === "fest,flort", "Spillet bruker ikke de valgte pakkene");
  const pakkeAv = await t.js(`(() => { const ut = []; for (const p of RUSJ_DATA.kort.pakker) for (const k of p.kort) ut.push(p.id); return ut; })()`);
  t.sjekk(st.spill.plan.every((x) => x.k == null || ["fest", "flort"].includes(pakkeAv[x.k])), "Et kort fra en pakke som ikke er valgt");
  await navnPaKortet("første kort");
  await t.sov(300);
  await t.bilde("kort");

  // ---------- Next card (button and swipe); the names survive a reload ----------
  await neste();
  st = await s();
  t.sjekk(st.spill.pos === 1, "«Neste kort» ga ikke neste kort");
  await pause();
  await t.sveip(".storkort", -240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  await t.sov(400);
  st = await s();
  t.sjekk(st.spill.pos === 2, "Sveip ga ikke neste kort");
  const { tekst: for1 } = await navnPaKortet("etter sveip");
  await t.lastSide(t.side, KORT);
  await t.sov(400);
  t.sjekk((await t.tekst(".storkort-tekst")) === for1, "Kortet eller navnene endret seg ved omlasting");

  // Back + continue; «Nytt spill» asks first
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await s()).spill !== null, "Spillet forsvant selv om vi avbrøt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(KORT);

  // ---------- A rule, «Gjelder nå», its end with the same names, water, the last card ----------
  const [regel, vanlig, to] = await t.js(`(() => { const k = []; for (const p of RUSJ_DATA.kort.pakker) for (const x of p.kort) k.push(x); const r = k.findIndex((x) => x.type === "regel" && /\\{b\\}/.test(x.t)); const v = k.findIndex((x) => typeof x === "string" && /\\{b\\}/.test(x)); const w = k.findIndex((x, i) => i > v && typeof x !== "string" && x.type === "alle"); return [r, v, w]; })()`);
  await endre(`s.spill.plan = [{ k: ${regel} }, { k: ${vanlig} }, { s: 0 }, { v: 1 }, { k: ${to} }, { f: 1 }]; s.spill.pos = 0; s.spill.hvem = []; s.spill.regelNavn = {}`);
  t.sjekk(await t.finnes(".storkort.sj-regel"), "Regelkortet ser ikke ut som en regel");
  const regelKort = await navnPaKortet("regel");
  await t.bilde("regel");
  await neste();
  t.sjekk(await t.finnes('[data-h="regler-na"]'), "«Gjelder nå» vises ikke mens regelen gjelder");
  await navnPaKortet("kort med en regel som gjelder");
  await t.bilde("gjelder-na");
  await t.klikk('[data-h="regler-na"]');
  const ark = await t.tekst("#ark");
  t.sjekk(regelKort.hvem.every((i) => ark.includes(NAVN[i])), "«Gjelder nå» viser ikke regelen med navnene");
  await t.bilde("gjelder-na-ark");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await neste();
  t.sjekk(await t.finnes(".storkort.sj-slutt"), "Regelen ble ikke opphevet");
  const slutt = await navnPaKortet("regelen er over");
  t.sjekk(slutt.hvem.join() === regelKort.hvem.join(), "Kortet som opphever regelen, har ikke de samme navnene");
  t.sjekk(!(await t.finnes('[data-h="regler-na"]')), "«Gjelder nå» vises etter at regelen er over");
  await t.bilde("regel-over");
  await neste();
  await t.vent("document.querySelector('.sj-vann')", 5000);
  t.sjekk(O.vann.test(await t.tekst("#skjerm h1")), "Vannkortet har ikke en tydelig overskrift");
  await t.bilde("vannkort");

  // ---------- Small screens and a phone on its side ----------
  await neste();
  await t.vent(KORT);
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  const fot = () => t.js(`(() => { const e = document.querySelector('.sj-fot-linje'); return !!e && getComputedStyle(e).display !== 'none' && ${O.fot}.test(e.textContent); })()`);
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".storkort-tekst"), `Kortteksten skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await t.friForDokk(".sj-fot-linje"), `Bunnlinjen skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await fot(), `Bunnlinjen «alle kan stå over» mangler på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`kort-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  await neste();
  t.sjekk(await t.finnes(".storkort.sj-finale"), "Siste kort vises ikke");
  await navnPaKortet("siste kort");
  await t.bilde("siste-kort");
  await neste();
  await t.vent("document.querySelector('.sj-banner')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === O.skal, `Kåringen har ikke overskriften «${O.skal}»`);
  t.sjekk(await t.finnes('[data-h="del"]'), "Kåringen mangler «Del kvelden»");
  if (await t.js("(window.RUSJ_ANDRE || []).length > 0")) t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await s())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  await t.sov(500);
  await t.bilde("kaaring", true);
  await t.klikk('[data-h="del"]');
  await t.sov(400);

  // ---------- «Spill igjen»; quitting before anything happened; quitting midway ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent(KORT);
  st = await s();
  t.sjekk(st.spill.pos === 0 && st.spill.pakker.join() === "fest,flort" && st.spill.lengde === 30, "«Spill igjen» startet ikke et nytt spill med samme oppsett");
  await pause();
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await s()).spill === null, "«Avslutt» før noe har skjedd skal bare avslutte");
  t.sjekk(await t.finnes(".sj-sist"), "Hjem viser ikke «Sist: …» etter et spill");
  await t.bilde("hjem-sist");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent(KORT);
  await neste();
  await neste();
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.sj-banner')");
  t.sjekk((await s()).spill.ferdig === true, "«Avslutt» midt i ga ikke kåringen");
  await t.bilde("kaaring-tidlig");
}
