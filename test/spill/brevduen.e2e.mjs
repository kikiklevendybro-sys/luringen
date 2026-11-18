// Brevduen («Hvem skrev det?»): home and rules, «Gjør klart» (players, rounds, the grown-up pack),
// the pigeon's question and «Nytt spørsmål», the phone going round («Jeg er …» gate before each
// writer), an empty answer refused, a reload mid-writing (back to the gate, nothing typed shown,
// no draft kept), the answers one by one with the author hidden (also after a reload), «3 · 2 · 1
// – Pek!», the reveal and who pointed right (1 point each, 1 to the author per player fooled),
// «Angre», answers wiped as the game moves on, small screens and a phone on its side, back +
// «Fortsett», Kåringen (podium, «Kveldens luring»), «Spill igjen» and a whole game to the end.
// Typed answers carry markup (<x-q> in --probe) that must show as text. Language-neutral: the
// typed answers are nonsense words, texts are compared through the page's own R.t.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"];
const NAVN_UTGAVE = { nb: "Brevduen", en: "The Pigeon", da: "Brevduen" };

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const s = () => t.tilstand();
  const NOKKEL = t.nokkel("brevduen.v1");
  const lagret = () => t.js(`localStorage.getItem(${JSON.stringify(NOKKEL)}) || ""`);
  const tr = (nokkel, verdier) => t.js(`Rusj.t(${JSON.stringify(nokkel)}, ${JSON.stringify(verdier || null)})`);
  const navn = (i) => t.js(`Rusj.navn(${i})`);
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const GI = "document.querySelector('.gi-til') && document.querySelector('[data-h=\"jeg-er\"]')";
  const LES = "document.querySelector('.bd-svar') && document.querySelector('[data-h=\"avslor\"]')";
  const iProbe = () => t.js(`Rusj.navn(0).includes("<x-q>")`);
  const endre = async (kode, vent) => {
    await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); ${kode}; localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
    await t.lastSide(t.side, vent);
    await t.sov(450);
  };

  // ---------- Home and rules ----------
  await t.start({ navn: NAVN });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN_UTGAVE[t.sprak], `Hjem-skjermen viser ikke «${NAVN_UTGAVE[t.sprak]}»`);
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark li")) >= 3, "Reglene mangler stegene");
  await t.klikk('#ark [data-h="lukk-ark"]');
  const probe = await iProbe();
  // What the players type: nonsense words with markup that must show as text.
  const merk = (tekst) => (probe ? `<x-q>${tekst}</x-q>` : `<b class="bd-test">${tekst}</b>`);
  const SVAR = (i, runde) => `${merk("Zqx")} plonk ${runde}${"ABCD"[i]} wibble`;
  const ingenMarkup = async (hvor) => t.sjekk(!(await t.js(`!!document.querySelector("#skjerm b.bd-test, #skjerm x-q")`)), `Spillerskrevet markup ble tolket som HTML på «${hvor}»`);

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  await enH1("gjør klart");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === (await tr("Gjør klart")), "Oppsettet skal hete «Gjør klart»");
  t.sjekk((await t.antall(".spiller")) === 4 && (await t.finnes('[data-h="runder"]')), "Oppsettet mangler spillerne eller rundevalget");
  t.sjekk((await t.js(`document.querySelector('[data-h="voksen"]').getAttribute("aria-pressed")`)) === "false", "Voksenpakken skal være av som standard");
  await t.klikk('[data-h="voksen"]');
  t.sjekk((await s()).voksen === true, "Voksenpakken ble ikke slått på");
  await t.klikk('[data-h="voksen"]');
  await t.klikk('[data-h="runder"][data-v="3"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.bd-brev') && document.querySelector('[data-h=\"begynn\"]')");
  let st = await s();
  t.sjekk(st.spill.runder === 3 && st._aktiv === true && st.spill.fase === "sporsmal" && st.spill.voksen === false, "Spillet startet ikke med 3 runder og spørsmålet");
  t.sjekk(st.spill.r.k < (await t.js("RUSJ_DATA.familie.length")), "Et voksenspørsmål kom uten voksenpakken");
  t.sjekk((await t.js(`Rusj._statKo.map((x) => x.h)`)).includes("start"), "Statistikken fikk ikke «start»");
  await enH1("spørsmålet");
  t.sjekk(await t.friForDokk(".bd-brev"), "Brevet havner bak knappene");
  await t.bilde("sporsmal");
  const k0 = st.spill.r.k;
  await pause();
  await t.klikk('[data-h="bytt"]');
  st = await s();
  t.sjekk(st.spill.r.k !== k0 && (await t.tekst(".bd-brev-tekst")).trim() === (await t.js(`RUSJ_DATA.familie[${st.spill.r.k}]`)), "«Nytt spørsmål» ga ikke et nytt spørsmål");

  // ---------- Writing: the phone goes round ----------
  await pause();
  await t.klikk('[data-h="begynn"]');
  await t.vent(GI);
  t.sjekk(!(await t.finnes("#bd-felt")), "Skrivefeltet vises før «Jeg er …»");
  t.sjekk((await t.tekst("#skjerm h1")).includes(await navn(0)), "«Gi mobilen til» viser ikke den første spilleren");
  await t.bilde("gi");
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#bd-felt')");
  await enH1("skriv");
  t.sjekk(await t.friForDokk("#bd-felt"), "Skrivefeltet havner bak knappen");
  // An empty answer is refused.
  await t.skrivInn("#bd-felt", "   \n  ");
  await pause();
  await t.klikk("#bd-ferdig", 300);
  t.sjekk((await t.tekst("#bd-feil")).trim() === (await tr("Skriv et svar først.")) && (await s()).spill.r.na === 0, "Et tomt svar ble godtatt");
  // A reload mid-writing: back to the gate, nothing on screen, no draft kept.
  await t.skrivInn("#bd-felt", SVAR(0, 1));
  await t.bilde("skriv");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(400);
  st = await s();
  t.sjekk((await t.finnes('[data-h="jeg-er"]')) && !(await t.finnes("#bd-felt")), "Etter omlasting midt i skrivingen skal mobilen gis til samme spiller igjen");
  t.sjekk(st.spill.fase === "gi" && st.spill.r.na === 0, "Omlastingen mistet hvem som skriver");
  t.sjekk(!(await t.tekst("#skjerm")).includes("plonk") && !(await lagret()).includes("plonk"), "Det halvskrevne svaret ble tatt vare på eller vist");
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#bd-felt')");
  t.sjekk((await t.js(`document.querySelector("#bd-felt").value`)) === "", "Skrivefeltet skal være tomt etter omlasting");

  // Everyone writes once; returns the answers by player.
  const skrivAlle = async (runde, fra = "skriv") => {
    const svar = [];
    for (let n = 0; n < 12; n++) {
      if (!(fra === "skriv" && n === 0)) {
        await t.vent(`(${GI}) || (${LES})`);
        if (await t.finnes(".bd-svar")) break;
        await pause();
        await t.klikk('[data-h="jeg-er"]');
        await t.vent("document.querySelector('#bd-felt')");
      }
      const sp = (await s()).spill;
      const i = (sp.r.start + sp.r.na) % sp.antall;
      svar[i] = SVAR(i, runde);
      await t.skrivInn("#bd-felt", `  ${svar[i]}  `);
      await pause();
      await t.klikk("#bd-ferdig", 300);
      await t.vent(`(${GI}) || (${LES})`);
      if (await t.finnes(".gi-til")) t.sjekk(!(await t.tekst("#skjerm")).includes("plonk"), "Forrige svar vises på neste gi-skjerm");
    }
    return svar;
  };
  const svar1 = await skrivAlle(1);
  st = await s();
  t.sjekk(st.spill.fase === "les" && st.spill.r.svar.every((x, i) => x === svar1[i]), "Svarene ble ikke lagret, trimmet, for hver spiller");

  // ---------- The answers one by one ----------
  await enH1("les");
  const visesNa = async () => {
    const sp = (await s()).spill;
    return { sp, a: sp.r.rekke[sp.r.vis] };
  };
  let { sp, a } = await visesNa();
  t.sjekk((await t.tekst(".bd-svar .storkort-tekst")).trim() === svar1[a], "Svaret på skjermen er feil");
  await ingenMarkup("les");
  const skjerm = await t.tekst("#skjerm");
  t.sjekk(!(await Promise.all([0, 1, 2, 3].map(navn))).some((n) => skjerm.includes(n)), "Navnet til noen vises før avsløringen");
  t.sjekk([0, 1, 2, 3].filter((i) => i !== a).every((i) => !skjerm.includes(`${"ABCD"[i]} wibble`)), "Andre svar vises samtidig");
  t.sjekk(await t.friForDokk(".bd-svar"), "Svarkortet havner bak knappene");
  // Reload: the same answer, the author still hidden.
  await t.lastSide(t.side, LES);
  await t.sov(400);
  t.sjekk((await t.tekst(".bd-svar .storkort-tekst")).trim() === svar1[a] && !(await t.finnes(".banner")), "Etter omlasting viser ikke mobilen det samme svaret, eller avslører forfatteren");
  await t.bilde("les");
  await pause();
  await t.klikk('[data-h="pek"]');
  await t.sov(3400);
  await pause();
  await t.klikk('[data-h="avslor"]');
  await t.vent("document.querySelector('[data-h=\"gi-poeng\"]')", 6000);
  await enH1("hvem");
  t.sjekk((await t.tekst(".banner h1")).trim() === (await navn(a)), "Avsløringen viser ikke hvem som skrev svaret");
  t.sjekk(!(await t.finnes(`.velger[data-h="pekt"][data-v="${a}"]`)), "Forfatteren kan velges som en som pekte riktig");
  await ingenMarkup("hvem");
  await t.bilde("hvem");
  // Nobody pointed right: the author fooled all three.
  await t.klikk('[data-h="gi-poeng"]');
  await t.vent("document.querySelector('.poengliste') && document.querySelector('[data-h=\"neste\"]')", 6000);
  st = await s();
  t.sjekk(st.spill.poeng[a] === 3 && st.spill.poeng.reduce((x, y) => x + y, 0) === 3, `Forfatteren lurte alle, men fikk ikke 3 poeng (${st.spill.poeng.join()})`);
  await t.bilde("fasit-lurte-alle", true);
  // «Angre», then two of three pointed right.
  await pause();
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"gi-poeng\"]')");
  st = await s();
  t.sjekk(st.spill.fase === "hvem" && st.spill.poeng.every((p) => p === 0), "«Angre» tok ikke poengene tilbake");
  const andre = [0, 1, 2, 3].filter((i) => i !== a);
  await t.klikk(`.velger[data-h="pekt"][data-v="${andre[0]}"]`);
  await t.klikk(`.velger[data-h="pekt"][data-v="${andre[1]}"]`);
  await t.klikk('[data-h="gi-poeng"]');
  await t.vent("document.querySelector('.poengliste') && document.querySelector('[data-h=\"neste\"]')", 6000);
  st = await s();
  t.sjekk(st.spill.poeng[a] === 1 && st.spill.poeng[andre[0]] === 1 && st.spill.poeng[andre[1]] === 1 && st.spill.poeng[andre[2]] === 0, `Poengene for riktig og feil er feil (${st.spill.poeng.join()})`);
  await t.bilde("fasit");

  // The next answer: the one just shown is wiped from the phone.
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(LES);
  st = await s();
  t.sjekk(st.spill.r.vis === 1 && st.spill.r.svar[a] === null && !(await lagret()).includes(`${"ABCD"[a]} wibble`), "Det forrige svaret ligger igjen på mobilen");
  // Small screens and a phone on its side.
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".bd-svar"), `Svarkortet skjules bak knappene på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`les-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  // The rest of the round, quickly.
  for (;;) {
    await pause();
    await t.klikk('[data-h="avslor"]');
    await t.vent("document.querySelector('[data-h=\"gi-poeng\"]')", 6000);
    await pause();
    await t.klikk('[data-h="gi-poeng"]');
    await t.vent("document.querySelector('[data-h=\"neste\"]')", 6000);
    await pause();
    await t.klikk('[data-h="neste"]');
    await t.vent(`(${LES}) || document.querySelector('.bd-brev')`);
    if (await t.finnes(".bd-brev")) break;
  }
  st = await s();
  t.sjekk(st.spill.runde === 1 && st.spill.fase === "sporsmal" && st.spill.r.svar.every((x) => x === null) && st.spill.vist === 4, "Runde 2 startet ikke, eller svarene ble ikke slettet");
  t.sjekk(!(await lagret()).includes("wibble"), "Svar fra runde 1 ligger igjen i lagringen");

  // ---------- Round 2: back + continue, small screens while writing ----------
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent('document.querySelector(\'[data-h="begynn"]\')');
  await pause();
  await t.klikk('[data-h="begynn"]');
  await t.vent(GI);
  st = await s();
  t.sjekk(st.spill.r.start === 1 && (await t.tekst("#skjerm h1")).includes(await navn(1)), "Runde 2 startet ikke med neste spiller");
  await pause();
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#bd-felt')");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk("#bd-felt"), `Skrivefeltet skjules bak knappen på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`skriv-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  await skrivAlle(2);
  ({ sp, a } = await visesNa());
  t.sjekk(sp.fase === "les", "Runde 2 kom ikke til svarene");

  // ---------- Kåringen (quit early) ----------
  await pause();
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner') && document.querySelector('.poengliste')", 6000);
  st = await s();
  t.sjekk(st.spill.ferdig && st.spill.r === null && st._aktiv === false, "Kåringen etter avbrutt spill er feil");
  t.sjekk(!(await lagret()).includes("wibble"), "Svarene ligger igjen etter at spillet er avsluttet");
  t.sjekk(!JSON.stringify(await t.js("Rusj._statKo")).includes("wibble"), "Et svar havnet i statistikken");
  t.sjekk((await t.finnes(".pall")) && (await t.finnes(".bd-luring")), "Kåringen mangler pallen eller luring-linja");
  if (await t.js("(window.RUSJ_ANDRE || []).length > 0")) t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  await enH1("kåringen");
  await t.sov(500);
  await t.bilde("kaaring", true);

  // ---------- «Spill igjen» ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.bd-brev')");
  st = await s();
  t.sjekk(st.spill.runde === 0 && !st.spill.ferdig && st.spill.runder === 3 && st.spill.poeng.every((p) => p === 0), "«Spill igjen» startet ikke et nytt spill med samme oppsett");

  // ---------- A whole game to the end ----------
  await endre("s.spill.runde = 2; s.spill.r.start = 2", "document.querySelector('[data-h=\"begynn\"]')");
  await pause();
  await t.klikk('[data-h="begynn"]');
  await skrivAlle(3, "gi");
  for (;;) {
    await pause();
    await t.klikk('[data-h="avslor"]');
    await t.vent("document.querySelector('[data-h=\"gi-poeng\"]')", 6000);
    await pause();
    await t.klikk('[data-h="gi-poeng"]');
    await t.vent("document.querySelector('[data-h=\"neste\"]')", 6000);
    await pause();
    await t.klikk('[data-h="neste"]');
    await t.vent(`(${LES}) || document.querySelector('.pall, .poengliste')`, 6000);
    if (!(await t.finnes(".bd-svar"))) break;
  }
  st = await s();
  t.sjekk(st.spill.ferdig && st.spill.runde === 3 && st.spill.vist === 4 && st.spill.r === null, "Spillet ble ikke ferdig etter siste runde");
  t.sjekk(!(await lagret()).includes("wibble"), "Svarene ligger igjen etter siste runde");
}
