// Tørsten: the 18+ gate («Nei» leads away, «Ja» opens the game), packs and the «Drikk eller fortell»
// switch, cards with a rotating reader, swipe and «Hopp over», stars, the «SKÅL!» countdown, a ghost
// tap after «Neste kort», a twist card, the water card after ten cards, reload mid-card, back +
// continue, «Nytt spill» asks first, small screens (375 × 560 and 320 × 568), the vote for the
// evening's best story (back from it keeps the game), «Spill igjen» and a crowning without a vote.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const NOKKEL = "rusj.torsten.v1";
const KORT = "document.querySelector('#torst-kort') && !document.querySelector('#nedtelling:not([hidden])')";

async function aldersport(t, sjekkNei) {
  if (!(await t.finnes('[data-h="alder-ja"]'))) {
    await t.js(`(() => { const f = JSON.parse(localStorage.getItem("rusj.felles") || "{}"); delete f.over18; localStorage.setItem("rusj.felles", JSON.stringify(f)); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  }
  t.sjekk(await t.finnes('[data-h="alder-ja"]'), "18-årsgrensen vises ikke før spillet");
  if (sjekkNei) {
    await t.bilde("aldersgrense");
    await t.klikk('[data-h="alder-nei"]', 50);
    await t.vent("location.pathname === '/' && document.readyState === 'complete'", 8000);
    t.sjekk(!/\/torsten\//.test(await t.js("location.pathname")), "«Nei, ta meg tilbake» ble på spillsiden");
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    t.sjekk(await t.finnes('[data-h="alder-ja"]'), "Etter «Nei» skal aldersgrensen vises igjen");
  }
  await t.klikk('[data-h="alder-ja"]');
  await t.vent("document.querySelector('.spillhjem h1')");
}

// Change the saved game and reload (to reach a twist card or the water card without luck).
async function endre(t, kode, vent = KORT) {
  await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); ${kode}; localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
  await t.lastSide(t.side, vent);
  await t.sov(420);
}

export default async function (t) {
  const pause = () => t.sov(420);
  const s = () => t.tilstand();
  const skal = async () => {
    await pause();
    await t.klikk('[data-h="skal"]', 50);
    await t.vent("document.querySelector('.torst-feiring')", 8000);
  };

  // ---------- 18+ gate, home ----------
  await aldersport(t, true);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Tørsten", "Hjem-skjermen viser ikke «Tørsten» etter aldersgrensen");
  t.sjekk(await t.finnes("#tilportal:not([hidden])"), "Mangler rusj-knappen øverst på hjem-skjermen");
  await t.bilde("hjem-etter-18");
  await t.klikk("#reglerknapp");
  t.sjekk(/alkoholfritt/i.test(await t.tekst("#ark")) && /stå over/i.test(await t.tekst("#ark")), "Reglene sier ikke at alkoholfritt teller og at alle kan stå over");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Setup ----------
  await t.start({ navn: NAVN });
  await aldersport(t, false);
  await t.klikk('[data-h="nytt"]');
  let st = await s();
  t.sjekk(st.oppsett.pakker.length === 7 && st.oppsett.vri === true, "Alle pakkene og vrien skal være valgt fra start");
  t.sjekk(await t.finnes('.fliser.flervalg [data-h="pakke"]'), "Pakkene ser ikke ut som flervalg");
  t.sjekk((await t.antall(".spiller")) === 4, "Oppsettet viser ikke de fire lagrede spillerne");
  await t.bilde("oppsett", true);
  for (const id of ["vors", "student", "reise", "jobb", "pinlig", "flort", "kaos"]) await t.klikk(`[data-h="pakke"][data-v="${id}"]`, 40);
  t.sjekk(await t.js("document.querySelector('[data-h=\"start\"]').disabled"), "Start skal være av når ingen pakker er valgt");
  for (const id of ["vors", "pinlig", "flort"]) await t.klikk(`[data-h="pakke"][data-v="${id}"]`, 40);
  await t.klikk('[data-h="vri"]');
  t.sjekk((await s()).oppsett.vri === false, "Bryteren for «Drikk eller fortell» virker ikke");
  await t.klikk('[data-h="vri"]');
  await t.klikk('[data-h="start"]');
  await t.vent(KORT);
  st = await s();
  t.sjekk(st._aktiv === true, "Et pågående spill er ikke merket som aktivt");
  t.sjekk(/^Jeg har aldri/.test(await t.tekst(".storkort-tekst")), "Kortet begynner ikke med «Jeg har aldri»");
  t.sjekk((await t.tekst(".torst-leser")).includes(NAVN[st.spill.leser]), "Kortet viser ikke hvem som leser");
  t.sjekk(["vors", "pinlig", "flort"].some((p) => st.spill.pakker.includes(p)) && st.spill.pakker.length === 3, "Spillet bruker ikke de valgte pakkene");
  await t.sov(400);
  await t.bilde("kort");

  // ---------- Swipe and «Hopp over» give new cards, same reader ----------
  const forste = st.spill.kort;
  const leser0 = st.spill.leser;
  await pause();
  await t.sveip(".storkort", -240);
  await t.vent("document.querySelector('.storkort:not(.ut)')");
  st = await s();
  t.sjekk(st.spill.kort !== forste && st.spill.leser === leser0, "Sveip ga ikke nytt kort til samme leser");
  await pause();
  await t.klikk('[data-h="hopp"]', 450);
  st = await s();
  t.sjekk(st.spill.nr === 3 && st.spill.leser === leser0, "«Hopp over» ga ikke nytt kort");

  // ---------- Stars ----------
  await pause();
  await t.klikk('[data-h="favoritt"]');
  st = await s();
  t.sjekk(st.spill.fav.includes(st.spill.kort), "Stjerna la ikke kortet til i favoritter");
  t.sjekk((await t.js("document.querySelector('[data-h=\"favoritt\"]').getAttribute('aria-pressed')")) === "true", "Stjerna viser ikke at den er på");
  await t.klikk('[data-h="favoritt"]');
  t.sjekk(!(await s()).spill.fav.length, "Stjerna kunne ikke skrus av igjen");
  await t.klikk('[data-h="favoritt"]');
  const favKort = (await s()).spill.kort;
  const favTekst = (await t.tekst(".storkort-tekst")).replace(/^Jeg har aldri …\s*/, "").trim();

  // ---------- «SKÅL!» ----------
  await skal();
  st = await s();
  t.sjekk(st.spill.fase === "skal", "Nedtellingen endte ikke i «Skål»");
  t.sjekk((st.spill.vriKort ? /fortell/i : /slurk/i).test(await t.tekst(".torst-etter")), "Etter «Skål» står det ikke hva som skal skje");
  t.sjekk(/Jeg har aldri/.test(await t.tekst(".storkort-tekst")), "Kortteksten skal fortsatt synes etter «Skål»");
  await t.sov(600);
  await t.bilde("skal");
  // A ghost tap right after «Neste kort» (the new screen's «Skål»-button under the finger) is ignored
  await pause();
  await t.klikk('[data-h="neste"]', 20);
  await t.trykk('[data-h="skal"]');
  await t.sov(300);
  st = await s();
  t.sjekk(st.spill.fase === "les" && (await t.finnes("#nedtelling[hidden]")), "Et spøketrykk rett etter «Neste kort» startet nedtellingen");
  t.sjekk(st.spill.leser === (leser0 + 1) % 4, "Neste kort fikk ikke neste leser");

  // ---------- A twist card ----------
  await endre(t, "s.spill.vriKort = true; s.spill.fase = 'les'");
  t.sjekk(await t.finnes(".torst-vri-merke"), "Vri-kortet viser ikke «Drikk eller fortell»");
  await t.bilde("vri-kort");
  await skal();
  t.sjekk(/fortell/i.test(await t.tekst(".torst-etter")), "Vri-kortet sier ikke at man kan fortelle i stedet");
  await t.bilde("vri-skal");

  // ---------- Reload mid-card; back + continue; «Nytt spill» asks first ----------
  const kortFor = (await s()).spill.kort;
  await t.lastSide(t.side, "document.querySelector('.torst-feiring')");
  t.sjekk((await s()).spill.kort === kortFor && (await s()).spill.fase === "skal", "Kortet eller «Skål» forsvant ved omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await s()).spill !== null, "Spillet forsvant selv om vi avbrøt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.torst-feiring')");

  // ---------- Water card after ten cards ----------
  await endre(t, "s.spill.nr = 10; s.spill.sisteVann = 0; s.spill.fase = 'skal'", "document.querySelector('.torst-feiring')");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.torst-vann')", 5000);
  st = await s();
  t.sjekk(st.spill.fase === "vann" && st.spill.vann === 1, "Vannkortet kom ikke etter ti kort");
  t.sjekk(/vann/i.test(await t.tekst("#skjerm h1")), "Vannkortet har ikke en tydelig overskrift");
  await t.bilde("vannkort");
  await pause();
  await t.klikk('[data-h="vann-ferdig"]');
  await t.vent(KORT);
  t.sjekk((await s()).spill.nr === 11, "Etter vannkortet kom ikke et nytt kort");

  // ---------- Small screens ----------
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  const over = (sel) => t.js(`(() => { const a = document.querySelector(${JSON.stringify(sel)}); const d = document.querySelector('#skjerm .dokk'); if (!a || !d) return false; return a.getBoundingClientRect().bottom <= d.getBoundingClientRect().top + 2; })()`);
  const fri = (sel) => t.js(`(() => { const a = document.querySelector(${JSON.stringify(sel)}); if (!a) return false; const r = a.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight + 1) return false; const d = document.querySelector("#skjerm .dokk"); if (!d) return true; const q = d.getBoundingClientRect(); return q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom; })()`);
  const fotSynlig = () => t.js("(() => { const e = document.querySelector('.torst-fot-linje'); return !!e && getComputedStyle(e).display !== 'none' && /alle kan stå over/.test(e.textContent); })()");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    await t.js("window.scrollTo(0, 0)");
    t.sjekk(await (b > h ? fri : over)(".storkort-tekst"), `Kortteksten skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await fotSynlig(), `Bunnlinjen «alle kan stå over» mangler på kortet på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`kort-${b}x${h}`);
  }
  await skal();
  t.sjekk((await t.tekst(".torst-neste-linje")).includes("leser neste") && (await t.tekst('[data-h="neste"]')).trim() === "Neste kort", "Knappen skal bare si «Neste kort», med «X leser neste» over");
  for (const [b, h] of [[320, 568], [Math.min(375, b0), 560], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    await t.js("window.scrollTo(0, 0)");
    t.sjekk(await (b > h ? fri : over)(".torst-etter"), `Teksten etter «Skål» skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await fotSynlig(), `Bunnlinjen mangler etter «Skål» på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`skal-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // ---------- The vote: back keeps the game, then Testspiller B wins ----------
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('[data-h=\"kaar\"]')");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Avstemningen skal høre til «Kåringen»");
  t.sjekk((await t.antall('.velger[data-h="kaar"]')) === 4, "Avstemningen viser ikke alle fire spillerne");
  await t.bilde("stem");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.torst-feiring')");
  t.sjekk((await s()).spill.fase === "skal", "Tilbake fra avstemningen ga ikke spillet tilbake");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('[data-h=\"kaar\"]')");
  await pause();
  await t.klikk('.velger[data-h="kaar"][data-v="1"]');
  await t.vent("document.querySelector('.torst-banner')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Testspiller B vinner!", `Feil kåring: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.tekst(".torst-favoritter")).includes(favTekst.replace(/\.$/, "")), "Kåringen viser ikke favorittkortet");
  t.sjekk((await s()).spill.fav.includes(favKort), "Favorittkortet ble borte");
  t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på sluttskjermen");
  t.sjekk((await s())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  await t.sov(700);
  await t.bilde("kaaring", true);

  // ---------- «Spill igjen»; quitting before anything happened; a crowning without a vote ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent(KORT);
  st = await s();
  t.sjekk(st.spill.nr === 1 && st.spill.pakker.length === 3 && !st.spill.fav.length, "«Spill igjen» startet ikke et nytt spill med samme oppsett");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(/Avslutte spillet/.test(await t.tekst("#ark")), "Avslutt før noe har skjedd skal bare spørre om å avslutte");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await s()).spill === null, "«Avslutt» avsluttet ikke spillet");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent(KORT);
  await skal();
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(KORT);
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('[data-h=\"kaar\"]')");
  await pause();
  await t.klikk('[data-h="kaar"][data-v="-1"]');
  await t.vent("document.querySelector('.torst-banner')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Skål for gjengen!", "Uten kåring skal overskriften være «Skål for gjengen!»");
  await t.bilde("skal-for-gjengen");

  // Without «Drikk eller fortell»: «Avslutt» goes straight to the toast, no story vote
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="vri"]');
  await t.klikk('[data-h="start"]');
  await t.vent(KORT);
  await skal();
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(KORT);
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.torst-banner')");
  t.sjekk(!(await t.finnes('[data-h="kaar"]')) && (await t.tekst("#skjerm h1")).trim() === "Skål for gjengen!", "Uten vrien skal kåringen ikke spørre om beste historie");
}
