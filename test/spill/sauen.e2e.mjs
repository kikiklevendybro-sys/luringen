// Sauen: the grouping and scoring rules (pure functions), the setup (the way of answering first,
// the saved group, the target that follows the group, «på beite» with three), and then:
// · «Én mobil», six rounds: one screen per hand-over (the answer before is gone, a reload gives
//   the same player an empty field), the reveal, merging and splitting, the black sheep, «Angre»,
//   a tie, everyone agreeing, reloads on every kind of screen, back + «Fortsett», a shared win,
//   «Kåringen» (once in «Kveldens gjeng», statistics, «Del resultatet», «SIST» on the home screen).
// · «Alle samtidig», four rounds with five players: the get-ready screen, the clock (pause, a new
//   question, running out by itself), «Hvem er i flokken?», «Sto noen helt alene?» only when it
//   can matter, undo, «Avslutt» → «Kåringen» with the result so far.
// · Three players: the sheep is out of play in both ways of answering.
// · Damaged saved states, the «Jul» season with a faked date, and short and narrow screens.

const SEND = '.sau-skriv button[type="submit"]';
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E", "Testspiller F", "Testspiller G"];

export default async function (t) {
  await t.start({ navn: NAVN });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no «install as an app» sheet in the scripted run

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

    // «Alle samtidig»: when the phone has to ask who stood alone, and what the taps give.
    const lik = (navn, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) ut.push(navn + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
    lik("flokk på 3 av 5 → spør de to andre", O.aleneSporsmal(5, "flokk", [0, 1, 2]), { sporr: true, kandidater: [3, 4], alene: [] });
    lik("flokk på 2 av 5 → resten er alene", O.aleneSporsmal(5, "flokk", [1, 3]), { sporr: false, kandidater: [], alene: [0, 2, 4] });
    lik("flokk på 4 av 5 → den siste er alene", O.aleneSporsmal(5, "flokk", [0, 1, 2, 3]), { sporr: false, kandidater: [], alene: [4] });
    lik("alle i flokken", O.aleneSporsmal(4, "flokk", [0, 1, 2, 3]), { sporr: false, kandidater: [], alene: [] });
    lik("uavgjort med fire", O.aleneSporsmal(4, "uavgjort", []), { sporr: false, kandidater: [], alene: [] });
    lik("uavgjort med fem", O.aleneSporsmal(5, "uavgjort", []), { sporr: true, kandidater: [0, 1, 2, 3, 4], alene: [] });
    lik("ingen flokk", O.aleneSporsmal(3, "ingen", []), { sporr: false, kandidater: [], alene: [0, 1, 2] });
    lik("4 av 5: sauen til den siste", O.regnUtAlle(5, "flokk", [3, 0, 1, 2], -1, 0), { flokk: [0, 1, 2, 3], uavgjort: false, alene: [4], sau: 4 });
    lik("3 av 5, én alene", O.regnUtAlle(5, "flokk", [0, 1, 2], 4, 3), { flokk: [0, 1, 2], uavgjort: false, alene: [4], sau: 4 });
    lik("3 av 5, «Nei»", O.regnUtAlle(5, "flokk", [0, 1, 2], -1, 3), { flokk: [0, 1, 2], uavgjort: false, alene: [], sau: 3 });
    lik("en som er i flokken kan ikke stå alene", O.regnUtAlle(5, "flokk", [0, 1, 2], 1, 3).sau, 3);
    lik("ingen flokk: sauen blir", O.regnUtAlle(4, "ingen", [], -1, 2), { flokk: null, uavgjort: false, alene: [0, 1, 2, 3], sau: 2 });

    // The season, the target and the time
    lik("julesesong", ["2026-10-31", "2026-11-01", "2026-12-31", "2027-01-06", "2027-01-07", "2027-06-23", ""].map(O.julesesong), [0, 2026, 2026, 2026, 0, 0, 0]);
    lik("standardMal", [3, 4, 5, 7, 8, 12].map(O.standardMal), [8, 8, 6, 6, 5, 5]);
    lik("anslag", [O.anslag(4, 8, "en"), O.anslag(8, 5, "en"), O.anslag(8, 5, "alle")], [20, 15, 10]);
    if (!(O.anslag(12, 12, "en") > O.anslag(12, 12, "alle") && O.anslag(4, 12, "en") > O.anslag(4, 5, "en"))) ut.push("anslag: flere poeng eller én mobil skal ta lengre tid");

    // The content: «Jul» is there, no question twice, and the widest ones are tagged.
    const P = window.RUSJ_DATA.sporsmal.pakker;
    const tekst = (q) => (typeof q === "string" ? q : q.t);
    const jul = P.find((p) => p.id === "jul");
    if (!jul || jul.navn !== "Jul" || jul.ikon !== "🎄" || jul.sporsmal.length < 32 || jul.sporsmal.length > 34) ut.push("Jul-pakka mangler eller har feil størrelse");
    if (new Set(P.map((p) => p.ikon)).size !== P.length) ut.push("to pakker har samme ikon");
    const alle = P.flatMap((p) => p.sporsmal.map(tekst));
    if (new Set(alle.map((x) => x.toLowerCase())).size !== alle.length) ut.push("et spørsmål står to ganger");
    if (alle.some((x) => typeof x !== "string" || x.length < 4 || x.length > 60)) ut.push("et spørsmål er tomt eller for langt");
    const brede = P.flatMap((p) => p.sporsmal.filter((q) => q.bred).map(tekst));
    if (brede.length < 10 || !brede.includes("Et tall mellom 1 og 100")) ut.push("de bredeste spørsmålene er ikke merket");
    return ut;
  })()`);
  t.sjekk(!regelfeil.length, "Regler: " + regelfeil.join(" | "));

  // ---------- Helpers ----------
  // The phone size the runner uses (390×844 by default, or --bredde/--hoyde): restore it after each check.
  const fra = await t.js("({ b: window.innerWidth, h: window.innerHeight })");
  const smal = async (navn, onsket, hoyde) => {
    // Never wider than the runner's own phone: its checks of every screenshot count from that width.
    const bredde = Math.min(onsket, fra.b);
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
  const poeng = async () => (await t.tilstand()).spill.poeng.join(",");
  const sau = async () => (await t.tilstand()).spill.sau;
  const last = () => t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  const kveld = () => t.js(`(JSON.parse(localStorage.getItem("rusj.kveld") || "null") || { spill: [] }).spill.filter((x) => x.id === "sauen")`);
  const statistikk = (hendelse) => t.js(`Rusj._statKo.filter((x) => x.h === ${JSON.stringify(hendelse)}).map((x) => x.d)`);
  // What the setup screen shows.
  const oppsett = () =>
    t.js(`(() => {
      const s = document.querySelector("#skjerm");
      const trykket = (h) => (s.querySelector('[data-h="' + h + '"][aria-pressed="true"]') || { dataset: {} }).dataset.v;
      return {
        modusForst: !!s.querySelector(".seksjon").querySelector('.fliser [data-h="modus"]') && s.querySelectorAll('[data-h="modus"]').length === 2,
        modus: trykket("modus"),
        spillere: s.querySelectorAll(".spiller").length,
        mal: Number(trykket("mal")),
        anslag: Number((/ca\\. (\\d+) min/.exec(s.querySelector(".sau-mal .tall").textContent) || [])[1]),
        beite: /på beite/.test(s.innerText),
        pakker: Array.from(s.querySelectorAll('[data-h="pakke"]:not([data-v="*"])')).map((b) => b.dataset.v + (b.getAttribute("aria-pressed") === "true" ? "+" : "")),
      };
    })()`);
  // Exactly these packs, whatever was chosen before (and whatever the season is).
  const velgPakker = async (...ider) => {
    const antall = await t.antall('[data-h="pakke"]:not([data-v="*"])');
    if ((await t.tilstand()).oppsett.pakker.length !== antall) await t.klikk('[data-h="pakke"][data-v="*"]', 60);
    await t.klikk('[data-h="pakke"][data-v="*"]', 60);
    t.sjekk((await t.tilstand()).oppsett.pakker.length === 0, "«Alle» skulle velge bort alle pakker");
    t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skulle være av uten pakker");
    for (const id of ider) await t.klikk(`[data-h="pakke"][data-v="${id}"]`, 60);
  };
  // «Én mobil»: everyone types an answer, one screen per player. svar: by player letter.
  async function svarRunde(svar, forste) {
    await t.klikk('[data-h="send-rundt"]');
    await t.vent("document.querySelector('.skjerm-skriv')");
    const antall = (await t.tilstand()).spill.antall;
    for (let k = 0; k < antall; k++) {
      const i = (await t.tilstand()).spill.r.rekke[k];
      const tekst = svar["ABCDEFG"[i]];
      if (forste && k === 0) {
        // The hand-over and the answer are one screen: the name is the heading, the field has the focus.
        t.sjekk(!(await t.finnes('[data-h="jeg-er"]')), "«Jeg er …» er fortsatt en egen skjerm");
        t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[i], `Svarskjermen har ikke navnet som overskrift: «${await t.tekst("#skjerm h1")}»`);
        t.sjekk(/gi mobilen til/i.test(await t.tekst(".sau-tur")), "Svarskjermen sier ikke «Gi mobilen til»");
        const felt = await t.js(`(() => { const f = document.querySelector("#svar-felt"); return { fokus: document.activeElement === f, verdi: f.value, auto: f.getAttribute("autocomplete"), skjema: f.form.getAttribute("autocomplete"), navn: f.name, etikett: f.getAttribute("aria-label"), plass: f.placeholder }; })()`);
        t.sjekk(felt.fokus, "Svarfeltet får ikke fokus");
        t.sjekk(felt.verdi === "" && felt.auto === "off" && felt.skjema === "off", "Svarfeltet er ikke tomt, eller kan fylles ut av nettleseren");
        t.sjekk(felt.etikett.includes(NAVN[i]) && /skriv/i.test(felt.plass), `Svarfeltet mangler navn eller hjelpetekst («${felt.etikett}», «${felt.plass}»)`);
        await t.skrivInn("#svar-felt", tekst);
        await t.bilde("skriv");
        // With the keyboard open only the top ~460 px are visible: the name, the field and the button must be there.
        await smal("skriv-tastatur", fra.b, 460);
        const synlig = await t.js(`(() => { const h = document.querySelector("#skjerm h1").getBoundingClientRect(); const b = document.querySelector(${JSON.stringify(SEND)}).getBoundingClientRect(); return h.top >= 0 && b.bottom <= window.innerHeight; })()`);
        t.sjekk(synlig, "Navnet, svarfeltet og «Ferdig» er ikke synlige samtidig over tastaturet");
        await vanlig();
        await t.klikk(SEND);
        // «Ferdig» → the next player, on a new screen: nothing of the answer is left.
        const neste = (await t.tilstand()).spill.r.rekke[1];
        const etter = await t.js(`(() => { const f = document.querySelector("#svar-felt"); return { skjerm: document.querySelector("#skjerm").className, h1: document.querySelector("#skjerm h1").innerText.trim(), verdi: f.value, navn: f.name, fokus: document.activeElement === f, rest: document.body.innerHTML.includes(${JSON.stringify(tekst)}) }; })()`);
        t.sjekk(/skjerm-skriv/.test(etter.skjerm) && etter.h1 === NAVN[neste], `«Ferdig» viste ikke neste spiller (${etter.h1})`);
        t.sjekk(etter.verdi === "" && !etter.rest && etter.navn !== felt.navn, "Forrige svar ligger igjen i feltet eller på siden");
        t.sjekk(etter.fokus, "Feltet til neste spiller får ikke fokus");
        continue;
      }
      await t.skrivInn("#svar-felt", tekst);
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
  // «Alle samtidig»: «Vis nå» → «3 – 2 – 1 – vis!» → «Hvem er i flokken?»
  async function visNa() {
    await t.klikk('[data-h="vis-na"]');
    t.sjekk(await t.finnes("#nedtelling:not([hidden])"), "«Vis nå» starter ikke nedtellingen");
    await t.vent("document.querySelector('.skjerm-flokk')", 8000);
  }
  const velgFlokk = async (...spillere) => {
    for (const i of spillere) await t.klikk(`[data-h="flokk-velg"][data-v="${i}"]`, 60);
  };

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  let o = await oppsett();
  t.sjekk(o.modusForst && o.modus === "en", "Måten å svare på er ikke første seksjon i oppsettet, med «Én mobil» valgt");
  t.sjekk(o.spillere === 7, `Oppsettet starter ikke med gjengen som er lagret (${o.spillere} spillere, ventet 7)`);
  t.sjekk(o.mal === 6 && o.anslag > 0, `Sju spillere skal gi «Først til 6» og et tidsanslag (fikk ${o.mal}, ${o.anslag} min)`);
  await t.klikk('[data-h="modus"][data-v="alle"]');
  const raskere = await oppsett();
  t.sjekk(raskere.modus === "alle" && raskere.anslag < o.anslag, `«Alle samtidig» skal gi et kortere anslag (${o.anslag} → ${raskere.anslag} min)`);
  await t.klikk('[data-h="modus"][data-v="en"]');
  for (const i of [6, 5, 4]) await t.klikk(`[data-h="spiller-fjern"][data-v="${i}"]`, 60);
  o = await oppsett();
  t.sjekk(o.spillere === 4 && o.mal === 8 && !o.beite, `Fire spillere skal gi «Først til 8» (fikk ${o.mal})`);
  await t.klikk('[data-h="mal"][data-v="5"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  t.sjekk((await oppsett()).mal === 5, "Et mål som er valgt for hånd, skal ikke følge gruppa");
  await t.klikk('[data-h="spiller-fjern"][data-v="4"]');
  await velgPakker("mat", "dyr");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-sporsmal')");
  await t.bilde("sporsmal");
  t.sjekk(/\bmat\b|dyr og natur/i.test(await t.tekst(".storkort-etikett")), "Spørsmålet er ikke fra de valgte pakkene");
  t.sjekk(await t.friForDokk(".sau-kort"), "Spørsmålskortet går inn under knappene");
  t.sjekk(await t.js(`!document.querySelector(".dokk .knapp .ikon")`), "Hovedknappen har emoji");
  t.sjekk(JSON.stringify(await statistikk("start")) === JSON.stringify([{ modus: "en", spillere: 4 }]), "Statistikk: «start» mangler eller har feil innhold: " + JSON.stringify(await statistikk("start")));
  const q1 = await t.tekst("#skjerm h1");
  await t.klikk('[data-h="bytt-sporsmal"]');
  t.sjekk((await t.tekst("#skjerm h1")) !== q1, "«Bytt spørsmål» ga ikke et nytt spørsmål");
  // Four players: the widest questions are saved for bigger groups (the two packs have one, and
  // 70 draws go through the whole deck), and no question comes twice before the deck is used up.
  const trukket = await t.js(`(() => {
    const flat = window.RUSJ_DATA.sporsmal.pakker.flatMap((p) => p.sporsmal.map((q) => ({ p: p.id, bred: !!q.bred })));
    const ut = { brede: 0, feilPakke: 0, like: 0, finnes: flat.filter((q) => q.bred && (q.p === "mat" || q.p === "dyr")).length };
    const sett = new Set();
    for (let k = 0; k < 70; k++) {
      document.querySelector('[data-h="bytt-sporsmal"]').click();
      const q = Rusj.S.spill.r.q;
      if (flat[q].bred) ut.brede++;
      if (flat[q].p !== "mat" && flat[q].p !== "dyr") ut.feilPakke++;
      if (k < 55 && sett.has(q)) ut.like++;
      sett.add(q);
    }
    return ut;
  })()`);
  t.sjekk(trukket.finnes > 0 && trukket.brede === 0, `Fire spillere fikk ${trukket.brede} av de bredeste spørsmålene (${trukket.finnes} finnes i pakkene)`);
  t.sjekk(trukket.feilPakke === 0 && trukket.like === 0, `Kortstokken: ${trukket.feilPakke} spørsmål fra andre pakker, ${trukket.like} gjentatt for tidlig`);

  // ---------- Round 1: one screen per hand-over, reveal, merge and split, the black sheep, «Angre» ----------
  const SPILLER = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  await svarRunde({ A: "Banan", B: "bananer", C: "Gul banan", D: "Sitron" }, true);
  t.sjekk(!/sitron|banan/i.test(await t.tekst("#skjerm")), "Svarene vises før avsløringen");
  await t.bilde("avslor-start");
  await avslorAlt(true);
  t.sjekk((await t.antall(".sau-gruppe")) === 3, "Banan og bananer ble ikke gruppert automatisk");
  t.sjekk(await t.js(`document.activeElement === document.querySelector('[data-h="del-ut"]')`), "Fokus havner ikke på «Del ut poengene» etter avsløringen");
  await t.bilde("avslort", true);
  await t.klikk(`[data-h="del-opp"][data-v="${await gruppe("bananer")}"]`);
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
  // A reload keeps the merged groups, and «Angre» still knows how they were.
  await last();
  t.sjekk((await t.antall(".sau-gruppe")) === 2 && (await t.finnes('[data-h="angre"]')), "Omlasting etter sammenslåing mistet gruppene eller «Angre»");
  await delUt();
  t.sjekk((await poeng()) === "1,1,1,0", "Flokken fikk ikke poeng: " + (await poeng()));
  t.sjekk((await sau()) === SPILLER.D, "Den som sto alene fikk ikke den svarte sauen");
  t.sjekk(/banan/i.test(await t.tekst("#skjerm h1")), "Flokkens svar vises ikke");
  t.sjekk(await t.finnes(".sau-nyhet.ny"), "Nyheten om den svarte sauen vises ikke");
  t.sjekk(await t.finnes('.dokk [data-h="avslutt"]'), "Poengskjermen mangler «Avslutt»");
  await t.bilde("poeng", true);
  await last();
  t.sjekk((await t.finnes(".skjerm-poeng")) && /banan/i.test(await t.tekst("#skjerm h1")), "Omlasting på poengskjermen viste noe annet");
  await t.klikk('[data-h="angre-poeng"]');
  t.sjekk((await poeng()) === "0,0,0,0" && (await sau()) === -1, "«Angre» tok ikke tilbake poengene");
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
  t.sjekk((await sau()) === SPILLER.D, "Sauen skulle bli værende ved uavgjort");
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
  let s = await t.tilstand();
  const forstemann = NAVN[s.spill.r.rekke[0]];
  await t.skrivInn("#svar-felt", "Hemmelig");
  await last();
  const omlastet = await t.js(`({ skriv: !!document.querySelector(".skjerm-skriv"), h1: document.querySelector("#skjerm h1").innerText.trim(), verdi: (document.querySelector("#svar-felt") || {}).value, rest: /hemmelig/i.test(document.body.innerHTML) })`);
  t.sjekk(omlastet.skriv && omlastet.h1 === forstemann, `Omlasting på svarskjermen viste ikke samme spiller (${omlastet.h1})`);
  t.sjekk(omlastet.verdi === "" && !omlastet.rest, "Omlasting på svarskjermen viste det som var skrevet");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens et spill pågår");
  await t.bilde("hjem-fortsett");
  // In the middle of a round the way to «Kåringen» goes by here: «Avslutt» asks first.
  await t.klikk('.hjem-knapper [data-h="avslutt"]');
  t.sjekk((await t.tekst('#ark [data-v="nei"]')).trim() === "Spill videre", "«Avslutt» på hjem-skjermen spør ikke først");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.finnes(".skjerm-hjem")) && (await t.tilstand())._aktiv === true, "«Spill videre» på hjem-skjermen avsluttet spillet");
  await t.klikk('.hjem-knapper [data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» spør ikke før det pågående spillet forsvinner");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om man valgte Avbryt");
  await t.klikk('[data-h="fortsett"]');
  t.sjekk((await t.finnes(".skjerm-skriv")) && (await t.tekst("#skjerm h1")).trim() === forstemann, "«Fortsett» gikk ikke til riktig spiller");
  t.sjekk(await t.js(`document.activeElement && document.activeElement.id === "svar-felt"`), "Svarfeltet får ikke fokus etter «Fortsett»");
  // Empty answer is refused, Enter submits
  await t.klikk(SEND);
  t.sjekk(/skriv et svar/i.test(await t.tekst("#svar-feil")), "Tomt svar ble godtatt");
  const svar4 = { A: "Ost", B: "Ost", C: "osten", D: "Brød" };
  await t.skrivInn("#svar-felt", svar4["ABCD"[s.spill.r.rekke[0]]]);
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await t.vent("Rusj.S.spill.r.na === 1");
  for (let k = 1; k < 4; k++) {
    s = await t.tilstand();
    await t.skrivInn("#svar-felt", svar4["ABCD"[s.spill.r.rekke[k]]]);
    await t.klikk(SEND);
  }
  await t.vent("document.querySelector('.skjerm-avslor')");
  // A reload in the middle of the reveal carries on from the same card.
  await t.klikk('[data-h="neste-svar"]', 100);
  await last();
  t.sjekk((await t.finnes(".skjerm-avslor")) && (await t.antall(".sau-gruppe")) === 1, "Omlasting midt i avsløringen startet den på nytt");
  await avslorAlt();
  await delUt();
  t.sjekk((await poeng()) === "3,3,3,1", "Runde 4 ga feil poeng: " + (await poeng()));
  t.sjekk((await sau()) === SPILLER.D, "D skulle beholde sauen");
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
  t.sjekk((await sau()) === SPILLER.A, "Sauen gikk ikke videre til A");
  await t.klikk('[data-h="neste-runde"]');

  // ---------- Round 6: B and C reach 5 at the same time → shared win, «Kåringen» ----------
  await svarRunde({ A: "Kaffe", B: "kaffe", C: "Kaffe", D: "Te" });
  await avslorAlt();
  await delUt();
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && JSON.stringify(s.spill.vinnere) === "[1,2]", "B og C skulle dele seieren: " + JSON.stringify(s.spill.vinnere));
  t.sjekk(s.spill.sau === SPILLER.D, "Sauen skulle gå til D");
  t.sjekk(s._aktiv === true && (await kveld()).length === 0, "Spillet skal regnes som pågående helt til «Kåringen» er vist");
  t.sjekk((await t.tekst('.dokk .knapp')).trim() === "Til kåringen" && !(await t.finnes('.dokk [data-h="avslutt"]')), "Siste poengskjerm skal ha «Til kåringen» som hovedknapp");
  await t.klikk('[data-h="til-vinner"]');
  await t.vent("document.querySelector('.skjerm-vinner')");
  await t.sov(500);
  await t.bilde("vinner", true);
  t.sjekk(/Testspiller B og Testspiller C vinner!/.test(await t.tekst("#skjerm h1")), "Vinnerne vises ikke: " + (await t.tekst("#skjerm h1")));
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === "kåringen", "Sluttskjermen heter ikke «Kåringen»");
  const rekke = await t.js(`Array.from(document.querySelectorAll("#skjerm > *")).map((e) => String(e.className).split(" ")[0]).join(" ")`);
  t.sjekk(rekke === "banner pall sau-tavle sau-titler knapp-2 seksjon dokk", "«Kåringen» har ikke rekkefølgen banner, pall, poeng, titler, del, flere spill: " + rekke);
  t.sjekk(/flokkdyret/i.test(await t.tekst(".sau-titler")) && /den svarte sauen/i.test(await t.tekst(".sau-titler")), "Titlene «Flokkdyret» og «Den svarte sauen» mangler");
  t.sjekk((await t.tekst('.dokk .knapp')).trim() === "Spill igjen" && (await t.finnes('.dokk [data-h="nytt"]')) && (await t.finnes('.dokk a.lenke[href="/"]')), "Sluttskjermen mangler «Spill igjen», «Endre oppsett» eller «Alle spill»");
  t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  // Once in «Kveldens gjeng» (the winners first), one «ferdig» event, and the game is over.
  let k = await kveld();
  t.sjekk(k.length === 1, `Resultatet skal ligge én gang i «Kveldens gjeng» (${k.length})`);
  t.sjekk(k.length === 1 && k[0].resultat.filter((r) => r.plass === 1).map((r) => r.navn).sort().join("+") === "Testspiller B+Testspiller C" && k[0].resultat.length === 4, "«Kveldens gjeng» har ikke B og C på førsteplass: " + JSON.stringify(k[0] && k[0].resultat));
  t.sjekk(JSON.stringify(await statistikk("ferdig")) === JSON.stringify([{ runder: 6, avbrutt: false }]), "Statistikk: «ferdig» mangler eller har feil innhold: " + JSON.stringify(await statistikk("ferdig")));
  t.sjekk((await t.tilstand())._aktiv === false, "Spillet regnes fortsatt som pågående på «Kåringen»");
  // «Del resultatet»: names of the winners and the title holders, never an answer.
  await t.js(`window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }`);
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt");
  t.sjekk(!!delt && delt.title === "Sauen" && /\/sauen\/$/.test(delt.url), "«Del resultatet» deler ikke med navn og lenke: " + JSON.stringify(delt));
  t.sjekk(!!delt && /^Sauen 🐑 Testspiller B og Testspiller C vant med 5 poeng\./.test(delt.text) && /Flokkdyret i kveld: /.test(delt.text) && /Kveldens svarte sau: Testspiller D 🖤$/.test(delt.text), "Delingsteksten: " + (delt && delt.text));
  t.sjekk(!!delt && !/banan|sitron|kaffe|juice|ost|eple|hund|katt|#/i.test(delt.text) && delt.text.length < 200, "Delingsteksten inneholder svar, emneknagger eller er for lang");
  // A reload on «Kåringen»: still there, and not registered again.
  await last();
  k = await kveld();
  t.sjekk((await t.finnes(".skjerm-vinner")) && k.length === 1 && (await statistikk("ferdig")).length === 0, "Omlasting på «Kåringen» registrerte resultatet på nytt");
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Et ferdig spill skal ikke kunne fortsettes");
  t.sjekk(/SIST\s+Testspiller B og Testspiller C vant/.test(await t.tekst(".merker")), "Hjem-skjermen viser ikke hvem som vant sist: " + (await t.tekst(".merker")).replace(/\s+/g, " "));
  await t.bilde("hjem-sist");

  // ---------- «Alle samtidig»: five players, the clock, the flock, the one alone ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes(".skjerm-oppsett"), "«Start spill» etter et ferdig spill skal ikke spørre");
  await t.klikk('[data-h="modus"][data-v="alle"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.skrivInn("#navn-4", "Testspiller E");
  o = await oppsett();
  t.sjekk(o.modus === "alle" && o.spillere === 5 && o.mal === 5, `Oppsettet husket ikke valgene (${o.modus}, ${o.spillere} spillere, først til ${o.mal})`);
  await velgPakker("mat", "dyr");
  await t.bilde("oppsett-alle");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-klar')");
  t.sjekk(/lapper/i.test(await t.tekst("#skjerm h1")) && (await t.antall(".sau-klar li")) === 3, "«Alle samtidig» starter ikke med hva alle trenger");
  t.sjekk(await t.friForDokk(".sau-klar"), "Stegene på klar-skjermen går inn under knappen");
  t.sjekk(JSON.stringify(await statistikk("start")) === JSON.stringify([{ modus: "alle", spillere: 5 }]), "Statistikk: «start» for «Alle samtidig»: " + JSON.stringify(await statistikk("start")));
  await t.bilde("klar");
  await smal("klar-375", 375, 560);
  t.sjekk(await t.friForDokk(".sau-klar"), "Stegene på klar-skjermen går inn under knappen på en kort skjerm");
  await vanlig();
  await last();
  t.sjekk(await t.finnes(".skjerm-klar"), "Omlasting på klar-skjermen viste noe annet");
  await t.klikk('[data-h="klar"]');
  await t.vent("document.querySelector('.skjerm-sporsmal #sau-ring')");

  // Round 1: the clock runs, pauses and starts over with a new question
  const klokke = () => t.js(`({ tid: Number(document.querySelector("#sau-ring .timer-tid").textContent), knapp: (document.querySelector("[data-timer-pause]") || {}).textContent })`);
  t.sjekk((await klokke()).tid === 20, "Klokka starter ikke på 20 s");
  await t.sov(1300);
  let kl = await klokke();
  t.sjekk(kl.tid < 20 && kl.tid >= 17 && kl.knapp === "Pause", `Klokka går ikke av seg selv (${kl.tid} s, «${kl.knapp}»)`);
  await t.bilde("alle-sporsmal");
  t.sjekk(await t.friForDokk(".sau-kort"), "Spørsmålet og klokka går inn under knappene");
  await t.klikk("[data-timer-pause]");
  kl = await klokke();
  await t.sov(1200);
  t.sjekk((await klokke()).tid === kl.tid && (await klokke()).knapp === "Fortsett", "«Pause» stopper ikke klokka");
  const q2 = await t.tekst("#skjerm h1");
  await t.klikk('[data-h="bytt-sporsmal"]');
  kl = await klokke();
  t.sjekk((await t.tekst("#skjerm h1")) !== q2 && kl.tid === 20 && kl.knapp === "Pause", `Et nytt spørsmål skal få hele tiden (${kl.tid} s, «${kl.knapp}»)`);
  await t.klikk('[data-h="stilling"]');
  await t.klikk('#ark [data-h="lukk-ark"]');
  t.sjekk((await klokke()).knapp === "Fortsett", "Klokka skal vente mens stillingen er åpen");
  await smal("alle-sporsmal-375", 375, 560);
  t.sjekk(await t.friForDokk(".sau-kort"), "Spørsmålet og klokka går inn under knappene på en kort skjerm");
  await vanlig();
  await visNa();

  // «Hvem er i flokken?»: at least two, or one of the two results without a flock
  t.sjekk(/hvem er i flokken/i.test(await t.tekst("#skjerm h1")) && (await t.antall('[data-h="flokk-velg"]')) === 5, "Flokkskjermen viser ikke alle spillerne");
  t.sjekk(await t.js(`document.querySelector('[data-h="flokk-klar"]').disabled && document.querySelector('.sau-velg').getAttribute("role") === "group" && !!document.querySelector('.sau-velg').getAttribute("aria-label")`), "Flokkvelgeren mangler etikett, eller knappen er på uten flokk");
  await velgFlokk(0);
  t.sjekk(await t.js(`document.querySelector('[data-h="flokk-klar"]').disabled`), "Én spiller er ingen flokk");
  await velgFlokk(1, 2);
  t.sjekk(await t.js(`!document.querySelector('[data-h="flokk-klar"]').disabled && document.querySelectorAll('[data-h="flokk-velg"][aria-pressed="true"]').length === 3`), "Tre valgte spillere gir ikke en flokk som kan godkjennes");
  await t.bilde("flokk");
  t.sjekk((await t.friForDokk(".sau-velg")) && (await t.friForDokk(".sau-utfall")), "Spillerne eller «Ingen flokk»/«Uavgjort» går inn under knappen");
  await smal("flokk-375", 375, 560);
  t.sjekk((await t.friForDokk(".sau-velg")) && (await t.friForDokk(".sau-utfall")), "Flokkskjermen får ikke plass over knappen på en kort skjerm");
  await vanlig();
  // Three of five in the flock: the other two may be a pair or two loners — the phone asks.
  await t.klikk('[data-h="flokk-klar"]');
  await t.vent("document.querySelector('.skjerm-alene')");
  const kandidater = () => t.js(`Array.from(document.querySelectorAll('.sau-velg [data-h="alene-velg"]')).map((b) => b.dataset.v).join(",")`);
  t.sjekk((await kandidater()) === "3,4" && /helt alene/i.test(await t.tekst("#skjerm h1")), "«Sto noen helt alene?» viser ikke de to utenfor flokken: " + (await kandidater()));
  t.sjekk((await t.tekst('.dokk .knapp')).trim() === "Nei", "«Sto noen helt alene?» mangler «Nei»");
  await t.bilde("alene");
  t.sjekk(await t.friForDokk(".sau-velg"), "De som kan ha stått alene, går inn under knappen");
  await last();
  t.sjekk((await t.finnes(".skjerm-alene")) && (await kandidater()) === "3,4", "Omlasting på «Sto noen helt alene?» viste noe annet");
  await t.klikk('.sau-velg [data-h="alene-velg"][data-v="3"]');
  await t.vent("document.querySelector('.skjerm-poeng')");
  t.sjekk((await poeng()) === "1,1,1,0,0" && (await sau()) === SPILLER.D, "Flokken fikk ikke poeng, eller D fikk ikke sauen: " + (await poeng()));
  t.sjekk(/tre tenkte likt/i.test(await t.tekst("#skjerm h1")) && (await t.finnes(".sau-nyhet.ny")), "Poengskjermen viser ikke flokken og den svarte sauen");
  await t.bilde("alle-poeng");
  // «Angre»: back to the taps with the flock still marked; «Nei» gives nobody the sheep
  await t.klikk('[data-h="angre-poeng"]');
  t.sjekk((await t.finnes(".skjerm-flokk")) && (await poeng()) === "0,0,0,0,0" && (await sau()) === -1, "«Angre» tok ikke tilbake poengene og sauen");
  t.sjekk((await t.antall('[data-h="flokk-velg"][aria-pressed="true"]')) === 3, "«Angre» glemte hvem som var i flokken");
  await t.klikk('[data-h="flokk-klar"]');
  await t.klikk('[data-h="alene-angre"]');
  t.sjekk(await t.finnes(".skjerm-flokk"), "«Angre» på «Sto noen helt alene?» går ikke tilbake til flokken");
  await t.klikk('[data-h="flokk-klar"]');
  await t.klikk('.dokk [data-h="alene-velg"]');
  await t.vent("document.querySelector('.skjerm-poeng')");
  t.sjekk((await poeng()) === "1,1,1,0,0" && (await sau()) === -1 && !(await t.finnes(".sau-nyhet")), "«Nei» skal ikke gi noen den svarte sauen");
  await t.klikk('[data-h="angre-poeng"]');
  await t.klikk('[data-h="flokk-klar"]');
  await t.klikk('.sau-velg [data-h="alene-velg"][data-v="3"]');
  await t.vent("document.querySelector('.skjerm-poeng')");
  await t.klikk('[data-h="neste-runde"]');

  // Round 2: the clock runs out by itself (also after a reload) → countdown → the flock. A tie:
  // with five players one can be alone, so the phone asks — anyone can be the one.
  await t.vent("document.querySelector('.skjerm-sporsmal #sau-ring')");
  t.sjekk(await t.finnes(".sau-holder"), "Spørsmålsskjermen viser ikke hvem som har den svarte sauen");
  await t.js("Rusj.timer('sau-ring').pause(); Rusj.S.spill.r.tid = 1; Rusj.lagre()");
  await last();
  await t.vent("document.querySelector('.skjerm-flokk')", 9000);
  await t.klikk('[data-h="flokk-uavgjort"]');
  await t.vent("document.querySelector('.skjerm-alene')");
  t.sjekk((await kandidater()) === "0,1,2,3,4", "Uavgjort med fem: alle kan ha stått alene: " + (await kandidater()));
  await smal("alene-375", 375, 560);
  t.sjekk(await t.friForDokk(".sau-velg"), "«Sto noen helt alene?» får ikke plass over knappen på en kort skjerm");
  await vanlig();
  await t.klikk('.sau-velg [data-h="alene-velg"][data-v="4"]');
  await t.vent("document.querySelector('.skjerm-poeng')");
  t.sjekk((await poeng()) === "1,1,1,0,0" && (await sau()) === SPILLER.E, "Uavgjort: ingen poeng, og sauen skulle gå til E");
  t.sjekk(/ingen poeng/i.test(await t.tekst("#skjerm h1")) && /er kvitt den/.test(await t.tekst(".sau-nyhet")), "Uavgjort og sauebyttet vises ikke");
  await t.klikk('[data-h="neste-runde"]');

  // Round 3: «Ingen flokk» — everyone is alone, so nothing to ask and the sheep stays.
  // (First: the clock waits behind the «Avslutt» sheet and carries on after «Spill videre».)
  await t.vent("document.querySelector('.skjerm-sporsmal #sau-ring')");
  await t.klikk('.dokk [data-h="avslutt"]');
  t.sjekk((await klokke()).knapp === "Fortsett", "Klokka skal vente mens «Avslutt» spør");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await klokke()).knapp === "Pause", "Klokka skal gå videre etter «Spill videre»");
  await visNa();
  await t.klikk('[data-h="flokk-ingen"]');
  await t.vent("document.querySelector('.skjerm-poeng')");
  t.sjekk((await poeng()) === "1,1,1,0,0" && (await sau()) === SPILLER.E && (await t.finnes(".sau-nyhet:not(.ny)")), "«Ingen flokk» skal ikke gi poeng eller flytte sauen");
  await t.klikk('[data-h="neste-runde"]');

  // Round 4: a flock of two — the three others must all be alone, so nothing to ask
  await visNa();
  await velgFlokk(0, 1);
  await t.klikk('[data-h="flokk-klar"]');
  await t.vent("document.querySelector('.skjerm-poeng')");
  t.sjekk((await poeng()) === "2,2,1,0,0" && (await sau()) === SPILLER.E, "En flokk på to: +1 til de to, sauen blir: " + (await poeng()));

  // «Avslutt»: the sheet offers «Spill videre»; ending goes to «Kåringen» with the result so far
  await t.klikk('.dokk [data-h="avslutt"]');
  const ark = await t.js(`({ tittel: document.querySelector("#ark-tittel").innerText, tekst: document.querySelector("#ark .ingress").innerText, nei: document.querySelector('#ark [data-v="nei"]').innerText.trim(), ja: document.querySelector('#ark [data-v="ja"]').innerText.trim() })`);
  t.sjekk(ark.tittel === "Avslutte spillet?" && ark.nei === "Spill videre" && ark.ja === "Avslutt" && /kåringen/i.test(ark.tekst), "Arket for «Avslutt»: " + JSON.stringify(ark));
  await t.bilde("avslutt");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.finnes(".skjerm-poeng")) && (await t.tilstand())._aktiv === true, "«Spill videre» avsluttet spillet");
  await t.klikk('.dokk [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-vinner')");
  await t.sov(400);
  t.sjekk(/Testspiller A og Testspiller B vinner!/.test(await t.tekst("#skjerm h1")) && /Etter 4 runder/.test(await t.tekst(".banner")), "«Avslutt» viste ikke lederne som vinnere: " + (await t.tekst(".banner")).replace(/\s+/g, " "));
  await t.bilde("vinner-avsluttet", true);
  k = await kveld();
  t.sjekk(k.length === 2 && k[1].resultat.filter((r) => r.plass === 1).length === 2, "Et spill som ble avsluttet etter fire runder, skal også ligge i «Kveldens gjeng»");
  t.sjekk(JSON.stringify(await statistikk("ferdig")) === JSON.stringify([{ runder: 4, avbrutt: true }]), "Statistikk: «ferdig» etter «Avslutt»: " + JSON.stringify(await statistikk("ferdig")));
  s = await t.tilstand();
  t.sjekk(s._aktiv === false && s.spill.tidlig === true, "Etter «Avslutt» regnes spillet fortsatt som pågående");
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.finnes('.hjem-knapper [data-h="nytt"]')), "Hjem-skjermen viser «Fortsett» etter «Avslutt»");

  // ---------- Three players: the sheep is at pasture ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="en"]');
  for (const i of [4, 3]) await t.klikk(`[data-h="spiller-fjern"][data-v="${i}"]`, 60);
  o = await oppsett();
  t.sjekk(o.spillere === 3 && o.beite, "Oppsettet sier ikke at sauen er på beite med tre spillere");
  await velgPakker("mat");
  await t.bilde("oppsett-tre");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-sporsmal')");
  await svarRunde({ A: "Sau", B: "sauer", C: "Geit" });
  await avslorAlt();
  t.sjekk((await t.antall(".sau-gruppe")) === 2 && !(await t.finnes(".sau-gruppe.svart")) && (await t.finnes(".sau-gruppe-alene")), "Med tre spillere skal den som står alene, ikke få den svarte sauen");
  await delUt();
  t.sjekk((await poeng()) === "1,1,0" && (await sau()) === -1 && !(await t.finnes(".sau-nyhet")), "Med tre spillere skal ingen få den svarte sauen");
  await t.klikk('.dokk [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-vinner')");
  t.sjekk(!/svarte sauen/i.test(await t.tekst("#skjerm")), "«Kåringen» nevner den svarte sauen med tre spillere");
  // The same with «Alle samtidig»: a flock of two leaves one alone — and nobody is asked.
  await t.klikk('.dokk [data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="alle"]');
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="klar"]');
  await visNa();
  await velgFlokk(0, 1);
  const ekte = await t.tilstand(); // a real saved game, for the damaged saves below

  // ---------- Damaged saved states never give a blank page ----------
  const medLagret = async (lagret) => {
    await t.js(`localStorage.setItem("rusj.sauen.v1", ${JSON.stringify(JSON.stringify(lagret))})`);
    await last();
    return t.js(`({ skjerm: document.querySelector("#skjerm").className, h1: document.querySelector("#skjerm h1").innerText.trim(), fortsett: !!document.querySelector('[data-h="fortsett"]'), start: !!document.querySelector('.hjem-knapper [data-h="nytt"]') })`);
  };
  const skadet = (endre) => {
    const kopi = JSON.parse(JSON.stringify(ekte));
    endre(kopi);
    return kopi;
  };
  const skader = [
    ["bare tull", { skjerm: "flokk", spill: "tull", oppsett: 7, antall: "mange", jul: "x", sist: { v: 5 }, _tid: Date.now() }],
    ["flokken er ikke en liste", skadet((x) => (x.spill.r.flokk = "x"))],
    ["spørsmålet finnes ikke", skadet((x) => (x.spill.r.q = 99999))],
    ["sauen hos en spiller som ikke finnes", skadet((x) => (x.spill.sau = 9))],
    ["poengskjerm uten resultat", skadet((x) => (x.skjerm = x.spill.skjerm = "poeng"))],
    ["svarskjerm i feil spillmåte", skadet((x) => (x.skjerm = x.spill.skjerm = "skriv"))],
    ["oppsett og runde er borte", skadet((x) => { delete x.oppsett; delete x.spill.r; })],
  ];
  for (const [navn, lagret] of skader) {
    const side = await medLagret(lagret);
    t.sjekk(/skjerm-hjem/.test(side.skjerm) && side.h1 === "Sauen" && side.start && !side.fortsett, `Skadet lagring (${navn}) ga ikke en ren hjem-skjerm: ${JSON.stringify(side)}`);
  }
  await t.klikk('.hjem-knapper [data-h="nytt"]');
  t.sjekk(/gjør klart/i.test(await t.tekst("#skjerm h1")) && (await oppsett()).spillere >= 3, "Oppsettet kan ikke åpnes etter en skadet lagring");
  // … and the real one is still welcome: back on «Hvem er i flokken?» with the two marked.
  let side = await medLagret(ekte);
  t.sjekk(/skjerm-flokk/.test(side.skjerm) && (await t.antall('[data-h="flokk-velg"][aria-pressed="true"]')) === 2, "En gyldig lagring ble ikke gjenopptatt: " + JSON.stringify(side));
  await t.klikk('[data-h="flokk-klar"]');
  await t.vent("document.querySelector('.skjerm-poeng')");
  t.sjekk((await poeng()) === "1,1,0" && (await sau()) === -1 && !(await t.finnes(".sau-nyhet")), "«Alle samtidig» med tre: +1 til flokken og ingen svart sau");
  await t.klikk('.dokk [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-vinner')");
  // «Spill igjen»: the same setup, straight to the first question (the notes are already out)
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.skjerm-sporsmal #sau-ring')");
  s = await t.tilstand();
  t.sjekk(s.spill.modus === "alle" && s.spill.nr === 1 && s.spill.poeng.every((p) => p === 0) && s.spill.sau === -1, "«Spill igjen» startet ikke et nytt spill på samme måte");

  // ---------- «Jul»: on in the season (1 November – 6 January), first among the packs then ----------
  const medDato = async (iso, fn) => {
    const kilde = `(() => { const Ekte = Date; const start = Ekte.now(); const fast = new Ekte(${JSON.stringify(iso)}).getTime(); class Falsk extends Ekte { constructor(...a) { if (a.length) super(...a); else super(fast + (Ekte.now() - start)); } static now() { return fast + (Ekte.now() - start); } } window.Date = Falsk; })();`;
    const { identifier } = await t.send("Page.addScriptToEvaluateOnNewDocument", { source: kilde });
    try {
      await last();
      await fn();
    } finally {
      await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  };
  const harJul = async () => ((await t.tilstand()).oppsett.pakker.includes("jul") ? "på" : "av") + " " + (await t.tilstand()).jul;
  await t.js(`localStorage.removeItem("rusj.sauen.v1")`);
  await medDato("2026-07-01T12:00:00Z", async () => {
    t.sjekk((await harJul()) === "av 0", "1. juli: «Jul» skal være av (" + (await harJul()) + ")");
    await t.klikk('[data-h="nytt"]');
    const p = (await oppsett()).pakker;
    t.sjekk(p[p.length - 1] === "jul" && p.filter((x) => x.endsWith("+")).length === p.length - 1, "1. juli: «Jul» skal stå sist og være eneste pakke som er av: " + p.join(" "));
  });
  await medDato("2026-11-01T08:00:00+01:00", async () => {
    t.sjekk((await harJul()) === "på 2026", "1. november: «Jul» skal være på (" + (await harJul()) + ")");
    await t.klikk('[data-h="nytt"]');
    const p = (await oppsett()).pakker;
    t.sjekk(p[0] === "jul+" && /Jul/.test(await t.tekst('[data-h="pakke"][data-v="jul"]')), "1. november: «Jul» skal stå først blant pakkene: " + p.join(" "));
    await t.bilde("oppsett-jul");
    await t.klikk('[data-h="pakke"][data-v="jul"]'); // a player switches it off …
  });
  await medDato("2026-12-24T12:00:00Z", async () => {
    t.sjekk((await harJul()) === "av 2026", "Julaften: «Jul» skal forbli av når en spiller har skrudd den av (" + (await harJul()) + ")");
    await t.klikk('[data-h="nytt"]');
    await t.klikk('[data-h="pakke"][data-v="jul"]'); // … and on again
  });
  await medDato("2027-01-07T12:00:00Z", async () => {
    t.sjekk((await harJul()) === "av 0", "7. januar: sesongen er over, «Jul» skal være av (" + (await harJul()) + ")");
  });
  await last();

  // ---------- Narrow phones (320×568), «Én mobil» with a long answer ----------
  await t.klikk('[data-h="nytt"]');
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="modus"][data-v="en"]');
  await velgPakker("mat", "dyr");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-sporsmal')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.every((p) => p === 0) && s.spill.sau === -1 && s.spill.modus === "en", "Et nytt spill startet ikke på null");
  await smal("sporsmal-320", 320, 568);
  await t.klikk('[data-h="send-rundt"]');
  await smal("skriv-320", 320, 568);
  await t.js("history.back()"); // the phone's back button: home, and «Fortsett» comes back to the same player
  await t.vent("document.querySelector('.skjerm-hjem')");
  await t.klikk('[data-h="fortsett"]');
  await t.klikk("#tilbake");
  await t.klikk('[data-h="fortsett"]');
  t.sjekk(await t.finnes(".skjerm-skriv"), "«Fortsett» etter tilbake-knappen gikk ikke til svarskjermen");
  const antall = s.spill.antall;
  const lange = ["Pannekaker med blåbærsyltetøy", "Vafler", "vaffel", "Rømmegrøt", "Lapper", "Sveler", "Boller"];
  for (let n = 0; n < antall; n++) {
    await t.skrivInn("#svar-felt", lange[(await t.tilstand()).spill.r.rekke[n]]);
    await t.klikk(SEND);
  }
  await t.vent("document.querySelector('.skjerm-avslor')");
  await smal("avslor-start-320", 320, 568);
  await avslorAlt();
  await smal("avslort-320", 320, 568);
  await delUt();
  await smal("poeng-320", 320, 568);
  await vanlig();
}
