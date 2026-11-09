// Sauen: the grouping and scoring rules (pure functions), setup, six rounds — the reveal with no
// answers shown before it, merging and splitting on the revealed cards, the black sheep arriving,
// «Angre» after the points, a tie, everyone agreeing, the sheep staying and moving — a reload on
// the answer screen, back + «Fortsett», «Nytt spill» asking first, the standings sheet, a shared
// win with the end screen, and narrow phones (320×568, and a short screen as with the keyboard open).

const SEND = '.sau-skriv button[type="submit"]';

export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"] });

  // ---------- Grouping and scoring rules ----------
  const regelfeil = await t.js(`(() => {
    const O = window.SauenSvar;
    const ut = [];
    const like = [
      ["Banan", "banan"], ["Banan", "bananer"], ["en banan", "Banan"], ["Bananen", "BANANER"], ["Is krem", "iskrem"],
      ["Gul banan", "gule bananer"], ["Pommes frites", "pommes frites!"], ["Sjokolade", "sjokollade"], ["Elg", "elgen"],
      ["Mann", "menn"], ["Kosmokatt", "kosmokattene"], ["17. mai", "17 mai"], ["Støvel", "støvler"], ["Crème brûlée", "creme brulee"],
    ];
    const ulike = [
      ["Banan", "Sitron"], ["Is", "Iskrem"], ["Gul banan", "Grønn banan"], ["Katt", "Hatt"], ["Hund", "Hunder og katter"],
      ["Ost", "Kost"], ["Mat", "Matt"], ["Rød", "Blå"], ["7", "17"], ["Bil", "Bilde"], ["Mat", "Matte"], ["Island", "Irland"],
      ["Bjørn", "Bjørk"], ["Konge", "Kongle"],
    ];
    for (const [a, b] of like) if (!O.likeSvar(a, b)) ut.push(a + " skulle vært lik " + b);
    for (const [a, b] of ulike) if (O.likeSvar(a, b)) ut.push(a + " skulle vært ulik " + b);

    const g = O.grupperSvar(["Banan", "banan", "Bananer", "Sitron", "sitronen", "Mango"]);
    if (JSON.stringify(g.enheter) !== "[[0,1],[2],[3],[4],[5]]") ut.push("enheter: " + JSON.stringify(g.enheter));
    if (JSON.stringify(g.grupper) !== "[[0,1],[2,3],[4]]") ut.push("grupper: " + JSON.stringify(g.grupper));

    const sjekk = (navn, ok) => { if (!ok) ut.push("regnUt: " + navn); };
    let r = O.regnUt([[0, 1], [2], [3]], -1);
    sjekk("flokk med to alene", JSON.stringify(r.flokk) === "[0,1]" && r.sau === -1 && !r.uavgjort);
    r = O.regnUt([[0, 1, 2], [3]], -1);
    sjekk("én alene får sauen", JSON.stringify(r.flokk) === "[0,1,2]" && r.sau === 3);
    r = O.regnUt([[0, 1], [2, 3]], 3);
    sjekk("uavgjort gir ingen flokk, sauen blir", r.flokk === null && r.uavgjort && r.sau === 3);
    r = O.regnUt([[0], [1], [2]], 1);
    sjekk("alle alene", r.flokk === null && !r.uavgjort && r.sau === 1);
    r = O.regnUt([[0, 1, 2, 3]], 2);
    sjekk("alle likt", JSON.stringify(r.flokk) === "[0,1,2,3]" && r.sau === 2);
    r = O.regnUt([[0, 1, 2], [3, 4], [5]], 0);
    sjekk("sauen flytter seg", r.sau === 5 && JSON.stringify(r.flokk) === "[0,1,2]");

    if (JSON.stringify(O.vinnere([8, 5, 9, 2], 2, 8)) !== "[0]") ut.push("vinnere: den med svart sau kan ikke vinne");
    if (JSON.stringify(O.vinnere([8, 8, 3], -1, 8)) !== "[0,1]") ut.push("vinnere: delt seier");
    if (JSON.stringify(O.vinnere([9, 3, 3], 0, 8)) !== "[]") ut.push("vinnere: ingen");
    return ut;
  })()`);
  t.sjekk(!regelfeil.length, "Svarregler: " + regelfeil.join(" | "));

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="pakke"][data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.pakker.length === 0, "«Alle» skulle velge bort alle pakker");
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skulle være av uten pakker");
  await t.klikk('[data-h="pakke"][data-v="mat"]');
  await t.klikk('[data-h="pakke"][data-v="dyr"]');
  await t.klikk('[data-h="mal"][data-v="5"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-sporsmal')");
  await t.bilde("sporsmal");
  t.sjekk(/\bmat\b|dyr og natur/i.test(await t.tekst(".storkort-etikett")), "Spørsmålet er ikke fra de valgte pakkene");
  const q1 = await t.tekst("#skjerm h1");
  await t.klikk('[data-h="bytt-sporsmal"]');
  t.sjekk((await t.tekst("#skjerm h1")) !== q1, "«Bytt spørsmål» ga ikke et nytt spørsmål");

  // ---------- Helpers ----------
  const SPILLER = { A: 0, B: 1, C: 2, D: 3 };
  // The phone size the runner uses (390×844 by default, or --bredde/--hoyde): restore it after each check.
  const fra = await t.js("({ b: window.innerWidth, h: window.innerHeight })");
  const smal = async (navn, bredde, hoyde) => {
    await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });
    await t.js("window.scrollTo(0, 0)");
    await t.sov(250);
    t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), `«${navn}» er for bred på ${bredde} px`);
    await t.bilde(navn);
  };
  const vanlig = async () => {
    await t.send("Emulation.setDeviceMetricsOverride", { width: fra.b, height: fra.h, deviceScaleFactor: 2, mobile: true });
    await t.sov(150);
  };
  async function svarRunde(svar, bilder) {
    await t.klikk('[data-h="send-rundt"]');
    for (let k = 0; k < 4; k++) {
      const s = await t.tilstand();
      const i = s.spill.r.rekke[k];
      if (bilder && k === 0) await t.bilde("gi");
      await t.klikk('[data-h="jeg-er"]');
      await t.skrivInn("#svar-felt", svar["ABCD"[i]]);
      if (bilder && k === 0) {
        await t.bilde("skriv");
        // With the keyboard open only the top ~460 px are visible: the field and the button must be there.
        await smal("skriv-tastatur", fra.b, 460);
        const synlig = await t.js(`(() => { const f = document.querySelector("#svar-felt").getBoundingClientRect(); const b = document.querySelector(${JSON.stringify(SEND)}).getBoundingClientRect(); return f.top >= 0 && b.bottom <= window.innerHeight; })()`);
        t.sjekk(synlig, "Svarfeltet og «Ferdig» er ikke synlige over tastaturet");
        await vanlig();
      }
      await t.klikk(SEND);
    }
    await t.vent("document.querySelector('.skjerm-avslor')");
  }
  // Reveal every group (the last one after a drum roll) until merging and «Del ut poengene» are there.
  async function avslorAlt(bilder) {
    let n = 0;
    while (!(await t.finnes('[data-h="del-ut"]'))) {
      await t.vent(`document.querySelector('[data-h="del-ut"]') || document.querySelector('[data-h="neste-svar"]:not([disabled])')`, 6000);
      if (await t.finnes('[data-h="del-ut"]')) break;
      await t.klikk('[data-h="neste-svar"]', 100);
      if (bilder && ++n === 1) await t.bilde("avslor");
    }
    await t.sov(300);
  }
  async function delUt() {
    await t.klikk('[data-h="del-ut"]');
    await t.vent("document.querySelector('.skjerm-poeng')");
  }
  // The data-v of the revealed card that shows this answer (as the main text or a variant).
  const gruppe = (tekst) =>
    t.js(`(() => {
      const li = Array.from(document.querySelectorAll(".sau-gruppe")).find((l) => {
        const deler = [l.querySelector(".sau-gruppe-svar").innerText].concat((l.querySelector(".sau-varianter")?.innerText || "").split(" · "));
        return deler.map((d) => d.trim().toLowerCase()).includes(${JSON.stringify(tekst)});
      });
      return li ? li.querySelector(".sau-gruppeknapp").dataset.v : "-1";
    })()`);
  const poeng = async () => (await t.tilstand()).spill.poeng.join(",");

  // ---------- Round 1: reveal, merge and split on the cards, the black sheep arrives, «Angre» ----------
  await svarRunde({ A: "Banan", B: "bananer", C: "Gul banan", D: "Sitron" }, true);
  t.sjekk(!/sitron|banan/i.test(await t.tekst("#skjerm")), "Svarene vises før avsløringen");
  await t.bilde("avslor-start");
  await avslorAlt(true);
  t.sjekk((await t.antall(".sau-gruppe")) === 3, "Banan og bananer ble ikke gruppert automatisk");
  await t.bilde("avslort", true);
  await t.klikk(`[data-h="del"][data-v="${await gruppe("bananer")}"]`);
  t.sjekk((await t.antall(".sau-gruppe")) === 4, "«Del opp» delte ikke gruppen");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await t.antall(".sau-gruppe")) === 3, "«Angre» virket ikke etter oppdeling");
  await t.klikk(`[data-h="velg"][data-v="${await gruppe("gul banan")}"]`);
  t.sjekk(await t.finnes(".sau-gruppe.valgt"), "Svaret ble ikke valgt");
  await t.bilde("valgt");
  await t.klikk(`[data-h="velg"][data-v="${await gruppe("bananer")}"]`);
  t.sjekk((await t.antall(".sau-gruppe")) === 2, "Svarene ble ikke slått sammen");
  t.sjekk(await t.finnes(".sau-gruppe.flokk") && (await t.finnes(".sau-gruppe.svart")), "Flokken og den svarte sauen vises ikke etter sammenslåingen");
  await t.bilde("slatt-sammen", true);
  await delUt();
  t.sjekk((await poeng()) === "1,1,1,0", "Flokken fikk ikke poeng: " + (await poeng()));
  t.sjekk((await t.tilstand()).spill.sau === SPILLER.D, "Den som sto alene fikk ikke den svarte sauen");
  t.sjekk(/banan/i.test(await t.tekst("#skjerm h1")), "Flokkens svar vises ikke");
  t.sjekk(await t.finnes(".sau-nyhet.ny"), "Nyheten om den svarte sauen vises ikke");
  await t.bilde("poeng", true);
  await t.klikk('[data-h="angre-poeng"]');
  t.sjekk((await poeng()) === "0,0,0,0" && (await t.tilstand()).spill.sau === -1, "«Angre» tok ikke tilbake poengene");
  t.sjekk(await t.finnes('[data-h="del-ut"]'), "«Angre» gikk ikke tilbake til svarene");
  await delUt();
  t.sjekk((await poeng()) === "1,1,1,0", "Poengene ble ikke delt ut igjen etter «Angre»");
  await t.klikk('[data-h="neste-runde"]');

  // ---------- Round 2: a tie gives no points; the sheep stays ----------
  t.sjekk(await t.finnes(".sau-holder"), "Spørsmålsskjermen viser ikke hvem som har den svarte sauen");
  await svarRunde({ A: "Hund", B: "hund", C: "Katt", D: "katter" });
  await avslorAlt();
  t.sjekk(/uavgjort/i.test(await t.tekst("#skjerm h1")), "Uavgjort vises ikke etter avsløringen");
  await delUt();
  t.sjekk((await poeng()) === "1,1,1,0", "Uavgjort skulle ikke gi poeng");
  t.sjekk((await t.tilstand()).spill.sau === SPILLER.D, "Sauen skulle bli værende ved uavgjort");
  t.sjekk(/ingen poeng/i.test(await t.tekst("#skjerm h1")), "Uavgjort vises ikke");
  await t.bilde("poeng-uavgjort");
  await t.klikk('[data-h="neste-runde"]');

  // ---------- Round 3: everyone agrees ----------
  await svarRunde({ A: "Eple", B: "eple", C: "Epler", D: "et eple" });
  await avslorAlt();
  t.sjekk((await t.antall(".sau-gruppe")) === 1 && !(await t.finnes(".sau-gruppeknapp")), "Like svar ble ikke samlet i én gruppe");
  await delUt();
  t.sjekk((await poeng()) === "2,2,2,1", "Alle skulle få poeng");
  await t.klikk('[data-h="neste-runde"]');

  // ---------- Round 4: reload on the answer screen; back, «Nytt spill» asks, «Fortsett» ----------
  await t.klikk('[data-h="send-rundt"]');
  await t.klikk('[data-h="jeg-er"]');
  await t.skrivInn("#svar-felt", "Hemmelig");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".skjerm-gi"), "Omlasting på svarskjermen viste ikke porten");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens et spill pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('.hjem-knapper [data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» spør ikke før det pågående spillet forsvinner");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om man valgte Avbryt");
  await t.klikk('[data-h="fortsett"]');
  t.sjekk(await t.finnes(".skjerm-gi"), "«Fortsett» gikk ikke til riktig spiller");
  // Empty answer is refused, Enter submits
  await t.klikk('[data-h="jeg-er"]');
  t.sjekk(await t.js(`document.activeElement && document.activeElement.id === "svar-felt"`), "Svarfeltet får ikke fokus");
  await t.klikk(SEND);
  t.sjekk(/skriv et svar/i.test(await t.tekst("#svar-feil")), "Tomt svar ble godtatt");
  const svar4 = { A: "Ost", B: "Ost", C: "osten", D: "Brød" };
  let s = await t.tilstand();
  await t.skrivInn("#svar-felt", svar4["ABCD"[s.spill.r.rekke[0]]]);
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await t.vent("document.querySelector('.skjerm-gi')");
  for (let k = 1; k < 4; k++) {
    s = await t.tilstand();
    await t.klikk('[data-h="jeg-er"]');
    await t.skrivInn("#svar-felt", svar4["ABCD"[s.spill.r.rekke[k]]]);
    await t.klikk(SEND);
  }
  await t.vent("document.querySelector('.skjerm-avslor')");
  await avslorAlt();
  await delUt();
  t.sjekk((await poeng()) === "3,3,3,1", "Runde 4 ga feil poeng: " + (await poeng()));
  t.sjekk((await t.tilstand()).spill.sau === SPILLER.D, "D skulle beholde sauen");
  await t.klikk('[data-h="neste-runde"]');
  await t.klikk('[data-h="stilling"]');
  await t.bilde("stilling");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Round 5: "Jus" is merged into "Juice" by hand; the sheep moves to A ----------
  await svarRunde({ A: "Melk", B: "Juice", C: "juice", D: "Jus" });
  await avslorAlt();
  await t.klikk(`[data-h="velg"][data-v="${await gruppe("jus")}"]`);
  await t.klikk(`[data-h="velg"][data-v="${await gruppe("juice")}"]`);
  await delUt();
  t.sjekk((await poeng()) === "3,4,4,2", "Runde 5 ga feil poeng: " + (await poeng()));
  t.sjekk((await t.tilstand()).spill.sau === SPILLER.A, "Sauen gikk ikke videre til A");
  await t.klikk('[data-h="neste-runde"]');

  // ---------- Round 6: B and C reach 5 at the same time → shared win ----------
  await svarRunde({ A: "Kaffe", B: "kaffe", C: "Kaffe", D: "Te" });
  await avslorAlt();
  await delUt();
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && JSON.stringify(s.spill.vinnere) === "[1,2]", "B og C skulle dele seieren: " + JSON.stringify(s.spill.vinnere));
  t.sjekk(s.spill.sau === SPILLER.D, "Sauen skulle gå til D");
  await t.klikk('[data-h="til-vinner"]');
  await t.vent("document.querySelector('.skjerm-vinner')");
  await t.sov(500);
  await t.bilde("vinner", true);
  t.sjekk(/Testspiller B og Testspiller C vinner!/.test(await t.tekst("#skjerm h1")), "Vinnerne vises ikke: " + (await t.tekst("#skjerm h1")));
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Et ferdig spill skal ikke kunne fortsettes");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes(".skjerm-oppsett"), "«Start spill» etter et ferdig spill skal ikke spørre");

  // ---------- Play again; narrow phones ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-sporsmal')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.every((p) => p === 0) && s.spill.sau === -1, "Et nytt spill startet ikke på null");
  await smal("sporsmal-320", 320, 568);
  await svarRunde({ A: "Pannekaker med blåbærsyltetøy", B: "Vafler", C: "vaffel", D: "Rømmegrøt" });
  await smal("avslor-start-320", 320, 568);
  await avslorAlt();
  await smal("avslort-320", 320, 568);
  await delUt();
  await smal("poeng-320", 320, 568);
  await vanlig();
}
