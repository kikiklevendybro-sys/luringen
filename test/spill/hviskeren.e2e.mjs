// Hviskeren, played through in both ways of playing.
// Setup: the saved group decides the player count, the mode tiles come first, the deck length
// follows the group until it is chosen by hand, «Alle samtidig» is suggested from eight players.
// One phone (hard mode on): the word-matching rules (pure functions), one screen per hand-over
// (the previous hint is gone from the page, a reload shows the same screen with an empty field),
// the forbidden hint, the error state of the hint field, the field staying visible above the
// keyboard, automatic and manual striking, a right answer, a pass, a wrong answer, a round where
// every hint is struck, reloads on secret screens, back + continue through the gate.
// «Kåringen»: the recap with struck hints, the record (first, new, home chip), the share text
// (no words, no hints), statistics, no evening points, ending early with «Avslutt».
// Everyone at once: the clock (runs, pause, reload, runs out), the three verdicts, undo.
// Also: three players with two hints each, a narrow phone, an old save, damaged saves.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en hviskeren): texts are checked in
// Norwegian only (t.norsk); the word rules and the test hints follow the edition's language.

const SEND = '.hv-skriv button[type="submit"]';

// The secret word is random, so a fixed test hint could clash with it (Pannekakefjellet is rightly
// refused when the word is Pannekake). Each list holds alternatives; the first set that the game
// accepts for the current word is used.
const SETT_NB = {
  likeOgEtTil: [["Kosmokatt", "kosmokattene", "Glitrefjell"], ["Plimpelo", "plimpeloene", "Snurrevandel"], ["Fjompen", "fjompene", "Kvarkelis"]],
  tre: [["Zorblik", "Kvaxum", "Blimsteg"], ["Frunkel", "Plimsa", "Tjuxi"], ["Vrimpel", "Snorkus", "Glimrok"], ["Qwasp", "Zinko", "Brumfel"]],
  alleLike: [["Snurrebass", "snurrebassen", "Snurrebassene"], ["Plopptopp", "plopptoppen", "plopptoppene"]],
  toHver: [["Plaskedam", "plaskedammen", "Gummistøvel", "Gummistøvler", "Vasstrekk"], ["Fnokkel", "fnokkelen", "Brisnapp", "Brisnapper", "Klonkeli"]],
};
// The same in English and Danish word forms (zorbcat/zorbcats, kosmokat/kosmokattene).
const SETT_EN = {
  likeOgEtTil: [["Cosmocat", "cosmocats", "Glitterpeak"], ["Plimpelo", "plimpeloes", "Snurrywhistle"], ["Fjompy", "fjompies", "Kwarkelis"]],
  tre: SETT_NB.tre,
  alleLike: [["Whirlybob", "whirlybobs", "WHIRLYBOBS"], ["Ploptop", "ploptops", "Ploptops"]],
  toHver: [["Splashpond", "splashponds", "Wellyboot", "wellyboots", "Drizzlewick"], ["Fnokkle", "fnokkles", "Brisnap", "brisnaps", "Klonkeli"]],
};
const SETT_DA = {
  likeOgEtTil: [["Kosmokat", "kosmokattene", "Glitrebjerg"], ["Plimpelo", "plimpeloerne", "Snurrevandel"], ["Fjompen", "fjompene", "Kvarkelis"]],
  tre: SETT_NB.tre,
  alleLike: [["Snurrebasse", "snurrebassen", "Snurrebasserne"], ["Ploptop", "ploptoppen", "ploptoppene"]],
  toHver: [["Plaskedam", "plaskedammen", "Gummistøvle", "Gummistøvler", "Vandtræk"], ["Fnokkel", "fnokkelen", "Brisnap", "Brisnapper", "Klonkeli"]],
};
let SETT = SETT_NB;
const MERKE = { riktig: "✅", feil: "❌", pass: "➖" };

export default async function (t) {
  // The real thing has focus (a headless page does not): :focus styles and focus events count here.
  await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  SETT = t.sprak === "en" ? SETT_EN : t.sprak === "da" ? SETT_DA : SETT_NB;
  await t.start({ navn: ["A", "B", "C", "D", "E", "F", "G"].map((b) => `Testspiller ${b}`) });
  const fra = await t.js("({ b: window.innerWidth, h: window.innerHeight })");

  const trygge = (ord, sett) =>
    t.js(`(() => {
      const O = window.HviskerenOrd;
      const sett = ${JSON.stringify(sett)};
      return sett.find((s) => s.every((h) => O.sjekkHint(h, ${JSON.stringify(ord)}, []) === null)) || sett[0];
    })()`);
  const hemmelig = async () => (await t.tekst("#hv-ord")).trim();
  const side = () => t.js("document.documentElement.innerHTML");
  const trykket = (sel) => t.js(`document.querySelector(${JSON.stringify(sel)})?.getAttribute("aria-pressed") === "true"`);
  const statistikk = (h) => t.js(`(window.Rusj._statKo.filter((x) => x.h === ${JSON.stringify(h)}).pop() || {}).d || null`);
  // navigator.share is replaced, so the text that would be shared can be read.
  const del = async () => {
    await t.js(`(() => { window.__delt = null; Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.__delt = d; } }); })()`);
    await t.klikk('[data-h="del"]');
    return (await t.js("window.__delt")) || {};
  };
  const merkerad = (logg) => logg.map((l) => MERKE[l.u] + (l.x ? "▪️" : "")).join("");
  // Is the word in the text as a word of its own? («Te» is a part of «Testspiller».)
  const harOrd = (tekst, o) => new RegExp("(^|[^\\p{L}\\p{N}])" + o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\\p{L}\\p{N}]|$)", "u").test(tekst);

  // ---------- Word matching rules ----------
  // English and Danish: the edition's own word forms.
  if (!t.norsk) {
    const like = {
      en: [["cat", "cats"], ["box", "boxes"], ["baby", "babies"], ["wolf", "wolves"], ["knife", "knives"], ["man", "men"], ["child", "children"], ["run", "running"], ["bake", "baking"], ["jump", "jumped"], ["glass", "glasses"], ["mouse", "mice"], ["banana", "bannana"]],
      da: [["bil", "bilen"], ["bil", "bilerne"], ["hus", "huset"], ["hus", "husene"], ["kat", "katte"], ["kat", "kattene"], ["dam", "dammen"], ["æble", "æblet"], ["mand", "mænd"], ["bog", "bøger"], ["barn", "børn"], ["øje", "øjne"], ["rød", "rødt"], ["cykel", "cykler"]],
    }[t.sprak];
    const ulike = {
      en: [["cat", "dog"], ["car", "card"], ["hat", "hate"], ["tea", "team"], ["bus", "bu"], ["sun", "sunny"]],
      da: [["kat", "hund"], ["bil", "bilde"], ["ko", "kone"], ["sol", "sko"], ["is", "iskage"]],
    }[t.sprak];
    const hint = {
      en: [["Cats", "Cat", "samme"], ["Ball", "Football", "del"], ["Snowman", "Snow", "del"], ["Mobile", "Bile", null], ["Two words", "Cat", "flere"]],
      da: [["Katten", "Kat", "samme"], ["Bold", "Fodbold", "del"], ["Hestesko", "Hest", "del"], ["Mobil", "Bil", null], ["To ord", "Kat", "flere"]],
    }[t.sprak];
    const feil = await t.js(`(() => {
      const O = window.HviskerenOrd;
      const ut = [];
      for (const [a, b] of ${JSON.stringify(like)}) if (!O.likeOrd(O.nokkel(a), O.nokkel(b))) ut.push(a + " skulle vært lik " + b);
      for (const [a, b] of ${JSON.stringify(ulike)}) if (O.likeOrd(O.nokkel(a), O.nokkel(b))) ut.push(a + " skulle vært ulik " + b);
      for (const [h, o, svar] of ${JSON.stringify(hint)}) { const r = O.sjekkHint(h, o, [], ""); if (r !== svar) ut.push("sjekkHint(" + h + ", " + o + ") ga " + r); }
      return ut;
    })()`);
    t.sjekk(!feil.length, "Ordregler (" + t.sprak + "): " + feil.join(" | "));
  }
  const regelfeil = !t.norsk ? [] : await t.js(`(() => {
    const O = window.HviskerenOrd;
    const ut = [];
    const like = [
      ["bil", "bilen"], ["bil", "biler"], ["Bil", "BILENE"], ["jente", "jenta"], ["jente", "jenter"], ["jenta", "jentene"],
      ["hus", "huset"], ["hus", "husa"], ["hus", "husene"], ["eple", "eplet"], ["eple", "epler"], ["eple", "eplene"],
      ["katt", "katter"], ["Katt", "kattene"], ["gutt", "guttene"], ["mann", "menn"], ["mann", "mennene"], ["bok", "bøker"],
      ["fot", "føttene"], ["tann", "tennene"], ["ku", "kyr"], ["øye", "øyne"], ["rød", "rødt"], ["rød", "røde"], ["blå", "blått"],
      ["ny", "nytt"], ["kaste", "kastet"], ["kaste", "kaster"], ["is", "isen"],
      ["ku", "kua"], ["by", "byene"], ["banan", "bannan"], ["sjokolade", "sjokollade"], ["spagetti", "spaggetti"],
      ["T-skjorte", "t-skjorter"], ["Café", "cafe"], ["Kosmokatt", "kosmokattene"], ["Snø!", "snø"], ["dam", "dammen"],
      ["grønn", "grønt"], ["trygg", "trygt"], ["Plaskedam", "plaskedammen"], ["støvel", "støvler"], ["sykkel", "syklene"],
      ["finger", "fingre"], ["nøkkel", "nøkler"],
    ];
    const ulike = [
      ["katt", "hund"], ["hatt", "hat"], ["mat", "matt"], ["tak", "takk"], ["mann", "man"], ["is", "iskrem"], ["sol", "sko"],
      ["bil", "mobil"], ["ost", "kost"], ["banan", "ananas"], ["hest", "fest"], ["kake", "kakao"], ["sol", "salt"],
      ["bil", "bilde"], ["mat", "matte"], ["ku", "kur"], ["os", "ost"], ["Island", "Irland"], ["bjørn", "bjørk"],
      ["hjerte", "hjerne"], ["frosk", "frost"], ["tegning", "terning"], ["ballett", "billett"], ["constructor", "tostring"],
    ];
    for (const [a, b] of like) if (!O.likeOrd(O.nokkel(a), O.nokkel(b))) ut.push(a + " skulle vært lik " + b);
    for (const [a, b] of ulike) if (O.likeOrd(O.nokkel(a), O.nokkel(b))) ut.push(a + " skulle vært ulik " + b);
    // [hint, the secret word, own earlier hints, expected, the forbidden hint (hard mode)]
    const hint = [
      ["", "Katt", [], "tom"], ["   ", "Katt", [], "tom"], ["Søt katt", "Hund", [], "flere"], ["!!!", "Hund", [], "tegn"],
      ["Katten", "Katt", [], "samme"], ["katter", "Katt", [], "samme"], ["KATT", "Katt", [], "samme"], ["Bannan", "Banan", [], "samme"],
      ["Ball", "Fotball", [], "del"], ["Fotballbane", "Fotball", [], "del"], ["Kokosnøtt", "Nøtt", [], "del"], ["Hestesko", "Hest", [], "del"],
      ["Mat", "Matematikk", [], null], ["Vestlandet", "And", [], null], ["Laser", "Lasagne", [], null], ["Sportsbil", "Bil", [], null],
      ["Fiskestang", "Fisk", [], "del"], ["Mai", "17. mai", [], "samme"], ["Pommes", "Pommes frites", [], "samme"],
      ["Mobil", "Bil", [], null], ["Kakao", "Kake", [], null], ["Pote", "Katt", [], null], ["T-skjorte", "Sommer", [], null],
      ["Pote", "Katt", ["poter"], "egen"], ["Værhår", "Katt", ["Pote"], null], ["Bil", "Bilde", [], null], ["Sko", "Skole", [], null],
      ["Kattunge", "Katt", [], "del"], ["Gyngehest", "Hest", [], "del"], ["Tannbørste", "Tennene", [], "del"],
      ["Desember", "Julaften", [], "forbudt", "Desember"], ["desemberen", "Julaften", [], "forbudt", "Desember"], ["DESEMBER!", "Julaften", [], "forbudt", "Desember"],
      ["Gave", "Julaften", [], null, "Desember"], ["Desember", "Julaften", [], null, ""], ["Desember", "Julaften", [], null],
      ["Hvit", "Fiskebolle", [], "forbudt", "Hvit saus"], ["Sausen", "Fiskebolle", [], "forbudt", "Hvit saus"], ["Mai", "Eggedosis", [], "forbudt", "17. mai"],
      ["Potet", "Fiskebolle", [], null, "Hvit saus"], ["Julaften", "Julaften", [], "samme", "Desember"], ["Pote", "Katt", ["poter"], "egen", "Mus"],
    ];
    for (const [h, o, egne, svar, forbudt] of hint) {
      const r = O.sjekkHint(h, o, egne, forbudt);
      if (r !== svar) ut.push("sjekkHint(" + JSON.stringify(h) + ", " + o + (forbudt ? ", forbudt " + forbudt : "") + ") ga " + r + ", ventet " + svar);
    }
    const dupl = [
      [["Kosmokatt", "kosmokattene", "Regnbue", "Sky"], [true, true, false, false]],
      [["Bil", "bilene", "BILEN", "Vei"], [true, true, true, false]],
      [["Mann", "menn"], [true, true]],
      [["Hav", "Fisk", "Båt"], [false, false, false]],
    ];
    for (const [liste, svar] of dupl) {
      const r = O.finnLike(liste);
      if (JSON.stringify(r) !== JSON.stringify(svar)) ut.push("finnLike(" + liste.join(",") + ") ga " + JSON.stringify(r));
    }
    return ut;
  })()`);
  t.sjekk(!regelfeil.length, "Ordregler: " + regelfeil.join(" | "));
  const titler = await t.js(`Array.from({ length: 14 }, (_, p) => window.HviskerenOrd.vurdering(p, 13))`);
  t.sjekk(!t.norsk || (titler[12] === "Hjernetvillinger" && titler[13] === "Telepater!" && !titler.some((x) => /tankeleser/i.test(x))), "Vurderingene: " + titler.join(", "));

  // ---------- Setup: the group, the mode, the length ----------
  t.sjekk(!/REKORD|BEST/.test(await t.tekst(".merker")), "Hjem-skjermen viser en rekord før noen har spilt");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")).trim() === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  t.sjekk((await t.antall(".spiller")) === 7, "Et nytt oppsett starter ikke med de sju lagrede spillerne");
  t.sjekk(await t.js(`(() => { const s = document.querySelector("#skjerm .seksjon"); const f = s && s.querySelectorAll(".flis"); return !!f && f.length === 2 && !s.querySelector(".spiller"); })()`), "Valget av spillemåte er ikke første seksjon, med to fliser");
  t.sjekk((await trykket('[data-h="modus"][data-v="en"]')) && /3–7/.test(await t.tekst('[data-h="modus"][data-v="en"]')), "«Én mobil» er ikke valgt fra start, eller flisa sier ikke «Best med 3–7»");
  t.sjekk(await trykket('[data-h="runder"][data-v="8"]'), "Sju spillere på én mobil skulle gi kort spill (8 ord)");
  t.sjekk(!(await t.finnes(".hv-forslag")), "«Alle samtidig» foreslås allerede med sju spillere");
  await t.klikk('[data-h="spiller-fjern"][data-v="6"]');
  t.sjekk(await trykket('[data-h="runder"][data-v="13"]'), "Seks spillere på én mobil skulle gi vanlig spill (13 ord)");
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  t.sjekk((await t.antall(".spiller")) === 8 && (await t.finnes(".hv-forslag")), "Med åtte spillere foreslås ikke «Alle samtidig»");
  await t.bilde("oppsett-atte", true);
  await t.klikk('.hv-forslag [data-h="modus"]');
  let s = await t.tilstand();
  t.sjekk(s.oppsett.modus === "alle" && !(await t.finnes(".hv-forslag")) && (await trykket('[data-h="modus"][data-v="alle"]')), "Forslaget byttet ikke til «Alle samtidig»");
  t.sjekk(await trykket('[data-h="runder"][data-v="13"]'), "«Alle samtidig» skulle gi vanlig spill (13 ord) også med åtte spillere");
  await t.klikk('[data-h="modus"][data-v="en"]');
  t.sjekk(await trykket('[data-h="runder"][data-v="8"]'), "Lengden følger ikke gjengen etter bytte tilbake til én mobil");
  for (const i of [7, 6, 5, 4]) await t.klikk(`[data-h="spiller-fjern"][data-v="${i}"]`);
  t.sjekk((await t.antall(".spiller")) === 4 && (await trykket('[data-h="runder"][data-v="13"]')), "Fire spillere skulle gi vanlig spill (13 ord)");
  t.sjekk(/\d+ min/.test(await t.tekst("#skjerm")), "Oppsettet sier ikke omtrent hvor lenge spillet varer");
  await t.klikk('[data-h="runder"][data-v="8"]');
  await t.klikk('[data-h="spiller-legg-til"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="4"]');
  s = await t.tilstand();
  t.sjekk(s.oppsett.lengdeValgt === true && s.oppsett.runder === 8 && (await trykket('[data-h="runder"][data-v="8"]')), "En lengde valgt for hånd ble ikke stående");

  await t.klikk('[data-h="kategorier"]');
  await t.bilde("kategorier");
  await t.klikk('#hv-kat [data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.length === 0, "«Alle» skulle velge bort alle kategorier");
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skulle være av uten kategorier");
  await t.klikk('#hv-kat [data-v="dyr"]');
  await t.klikk('#hv-kat [data-v="mat"]');
  t.sjekk(JSON.stringify((await t.tilstand()).oppsett.kategorier) === JSON.stringify(["mat", "dyr"]), "Kategoriene ble ikke valgt");
  await t.klikk('#ark [data-h="lukk-ark"]');
  t.sjekk(!t.norsk || /Mat og retter · Dyr/.test(await t.tekst(".hv-katknapp")), "Kategoriknappen viser ikke valget");
  await t.klikk('[data-h="niva"][data-v="lett"]');
  await t.klikk('[data-h="forbudt"]');
  t.sjekk((await trykket('[data-h="forbudt"]')) && (await t.tilstand()).oppsett.forbudt === true, "Bryteren «Vanskelig – forbudt hint» virker ikke");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');

  // ---------- Round 1 on one phone: the forbidden hint, one screen per hand-over ----------
  await t.vent("document.querySelector('.skjerm-runde')");
  await t.bilde("runde");
  s = await t.tilstand();
  t.sjekk(s.spill.runder === 8 && s.spill.per === 1 && s.spill.modus === "en" && s.spill.forbudt === true, "Feil oppsett av spillet");
  const start = await statistikk("start");
  t.sjekk(start && start.modus === "en" && start.spillere === 4 && start.kort === 8 && start.forbudt === true, "Statistikken «start» mangler eller er feil: " + JSON.stringify(start));
  t.sjekk(await t.friForDokk(".gi-til"), "Hvem som gjetter, havner bak knappene");
  t.sjekk((await t.antall(".dokk .ikon")) === 0, "Hovedknappen har et ikon (skal være ren tekst)");
  await t.klikk("#reglerknapp");
  t.sjekk(!t.norsk || (/Send mobilen rundt/.test(await t.tekst("#ark .steg")) && /forbudt/.test(await t.tekst("#ark .tips"))), "Reglene for én mobil mangler «Send mobilen rundt» eller tipset om forbudt hint");
  await t.klikk('#ark [data-h="lukk-ark"]');
  const gjetter = s.spill.r.gjetter;
  const navn = (i) => `Testspiller ${"ABCD"[i % 4]}`;
  await t.klikk('[data-h="vis-ordet"]');
  await t.bilde("ordet");
  const ord1 = await hemmelig();
  await t.klikk('[data-h="bytt-ord"]');
  const ord = await hemmelig();
  t.sjekk(ord && ord !== ord1, "«Bytt ord» ga ikke et nytt ord");
  t.sjekk(!t.norsk || /dyr|mat/i.test(await t.tekst(".hv-ordkort .storkort-etikett")), "Ordet er ikke fra de valgte kategoriene");
  t.sjekk(["dyr", "mat"].includes(await t.js(`window.RUSJ_ORD.kategorier.find((k) => k.ord.some((o) => o[0] === ${JSON.stringify(await hemmelig())})).id`)), "Ordet er ikke fra de valgte kategoriene (ordbanken)");
  t.sjekk(!(await t.tekst("#skjerm h1")).includes(ord), "Overskriften på ordskjermen er selve ordet (leses høyt av skjermlesere)");
  t.sjekk(await t.friForDokk(".hv-ordkort"), "Ordkortet havner bak knappene");
  const forbudt = (await t.tekst(".hv-forbudt b")).trim();
  t.sjekk(forbudt && (!t.norsk || /forbudt hint/i.test(await t.tekst(".hv-forbudt"))), "Ordkortet viser ikke «Forbudt hint»");
  const forbudtDel = forbudt.split(/\s+/)[0];

  const hint1 = await trygge(ord, SETT.likeOgEtTil);
  await t.klikk('[data-h="skriv"]');
  await t.vent("document.querySelector('.skjerm-skriv')");
  const overskrift = () => t.js(`document.querySelector("#skjerm h1").innerText.replace(/\\s+/g, " ")`);
  t.sjekk((await overskrift()).includes(navn(gjetter + 1)), "Feil hintgiver først");
  t.sjekk(!(await t.finnes(".skjerm-gi")) && (await t.finnes(".hv-tur .avatar")) && (await t.tekst(".hv-minne b")).trim() === ord, "Navn, ord og hintfelt står ikke på samme skjerm");
  t.sjekk(await t.js(`document.activeElement && document.activeElement.id === "hint-1"`), "Hint-feltet får ikke fokus");
  const attr = await t.js(`(() => { const f = document.querySelector("#hint-1"); return [f.getAttribute("enterkeyhint"), f.getAttribute("autocomplete"), f.getAttribute("autocapitalize"), f.maxLength].join(","); })()`);
  t.sjekk(attr === "done,off,sentences,24", "Hint-feltet har feil tastaturinnstillinger: " + attr);
  t.sjekk((await t.tekst(".hv-nei")).includes(forbudt), "Hintskjermen minner ikke om det forbudte hintet");

  // The error state: said in text, tied to the field, and the focus is still shown.
  const feltstil = () =>
    t.js(`(() => { const f = document.querySelector("#hint-1"); const s = getComputedStyle(f); return { ugyldig: f.getAttribute("aria-invalid"), beskrevet: f.getAttribute("aria-describedby"), fokus: document.activeElement === f, ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2, kant: s.borderTopColor, direkte: document.querySelector("#hint-feil").getAttribute("aria-live") }; })()`);
  const vanlig = await feltstil();
  await t.skrivInn("#hint-1", ord.split(/\s+/)[0]);
  await t.klikk(SEND);
  t.sjekk((t.norsk ? /selve ordet/ : /\S/).test(await t.tekst("#hint-feil")), "Det hemmelige ordet ble godtatt som hint");
  const feilstil = await feltstil();
  t.sjekk(feilstil.ugyldig === "true" && feilstil.beskrevet === "hint-feil" && feilstil.direkte === "assertive", "Feilmeldingen er ikke knyttet til hintfeltet (aria-invalid, aria-describedby)");
  t.sjekk(feilstil.fokus && feilstil.ring && feilstil.kant !== vanlig.kant, `Feiltilstanden viser ikke både feil og fokus (ring: ${feilstil.ring}, kant: ${feilstil.kant})`);
  await t.bilde("skriv-feil");
  await t.skrivInn("#hint-1", "to ord");
  t.sjekk((await t.tekst("#hint-feil")) === "" && (await feltstil()).ugyldig === null, "Feilmeldingen forsvinner ikke når man skriver");
  await t.klikk(SEND);
  t.sjekk((t.norsk ? /ett ord/i : /\S/).test(await t.tekst("#hint-feil")), "To ord ble godtatt");
  for (const forsok of [forbudtDel, forbudtDel + ({ en: "s", da: "erne" }[t.sprak] || "ene")]) {
    await t.skrivInn("#hint-1", forsok);
    await t.klikk(SEND);
    t.sjekk((t.norsk ? /forbudt/ : /\S/).test(await t.tekst("#hint-feil")) && (await t.tilstand()).spill.r.hint.length === 0, `Det forbudte hintet ble godtatt («${forsok}»)`);
  }
  await t.bilde("skriv-forbudt");
  await t.skrivInn("#hint-1", hint1[0]);
  await t.bilde("skriv");
  // With the keyboard open only the top ~460 px are visible: the field and the button must be there.
  // (Keep the runner's width – 390 by default, or --bredde – and restore its size afterwards.)
  await t.send("Emulation.setDeviceMetricsOverride", { width: fra.b, height: 460, deviceScaleFactor: 2, mobile: true });
  await t.js("window.scrollTo(0, 0)");
  await t.sov(250);
  const synlig = await t.js(`(() => { const f = document.querySelector("#hint-1").getBoundingClientRect(); const b = document.querySelector(${JSON.stringify(SEND)}).getBoundingClientRect(); return f.top >= 0 && b.bottom <= window.innerHeight; })()`);
  t.sjekk(synlig, "Hint-feltet og «Ferdig» er ikke synlige over tastaturet");
  await t.bilde("skriv-tastatur");
  await t.send("Emulation.setDeviceMetricsOverride", { width: fra.b, height: fra.h, deviceScaleFactor: 2, mobile: true });
  await t.sov(150);
  t.sjekk(await t.js(`document.querySelector(${JSON.stringify(SEND)}).getBoundingClientRect().bottom <= window.innerHeight`), "«Ferdig» får ikke plass på hintskjermen uten rulling");
  // Enter submits – and the same screen comes back for the next hint giver, with nothing left of the hint.
  await t.js(`document.querySelector("#hint-1").focus()`);
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await t.vent(`document.querySelector(".skjerm-skriv #hint-1") && document.querySelector("#hint-1").value === ""`);
  await t.sov(200);
  s = await t.tilstand();
  t.sjekk(s.spill.r.hint.length === 1 && s.spill.r.na === 1, "Enter sendte ikke hintet");
  t.sjekk((await overskrift()).includes(navn(gjetter + 2)), "Neste hintgiver vises ikke etter «Ferdig»");
  t.sjekk(!(await side()).includes(hint1[0]), "Forrige hint ligger igjen på siden hos neste hintgiver");
  t.sjekk(await t.js(`document.activeElement && document.activeElement.id === "hint-1"`), "Hint-feltet får ikke fokus hos neste hintgiver");
  await t.bilde("skriv-neste");
  // A reload: the same screen, an empty field, and the first hint is still in the game.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.finnes(".skjerm-skriv")) && (await overskrift()).includes(navn(gjetter + 2)), "Omlasting på hintskjermen viste ikke samme skjerm");
  t.sjekk((await t.js(`document.querySelector("#hint-1").value`)) === "" && !(await side()).includes(hint1[0]), "Hintfeltet er ikke tomt etter omlasting");
  t.sjekk((await t.tilstand()).spill.r.hint.length === 1, "Hintet forsvant ved omlasting");
  // Back + «Fortsett»: through the gate where the guesser looks away, then back to the same hint giver.
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens et spill pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('.hjem-knapper [data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» spør ikke før det pågående spillet forsvinner");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om man valgte Avbryt");
  await t.klikk('[data-h="fortsett"]');
  t.sjekk((await t.finnes(".skjerm-runde")) && !harOrd(await t.tekst("#skjerm"), ord), "«Fortsett» gikk ikke via porten der gjetteren ser bort");
  await t.klikk('[data-h="vis-ordet"]');
  t.sjekk((await t.finnes(".skjerm-skriv")) && (await overskrift()).includes(navn(gjetter + 2)), "Porten gikk ikke tilbake til riktig hintgiver");
  for (const h of hint1.slice(1)) {
    await t.skrivInn("#hint-1", h);
    await t.klikk(SEND);
  }
  await t.vent("document.querySelector('.skjerm-sjekk')");
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.r.hint.map((h) => h.s)) === "[true,true,false]", "Like hint ble ikke strøket automatisk: " + JSON.stringify(s.spill.r.hint));
  await t.bilde("sjekk", true);
  t.sjekk(await t.friForDokk('.hv-lapp[data-v="1"]'), "Hintene på sjekkskjermen havner bak knappen");
  await t.klikk('[data-h="stryk"][data-v="2"]');
  t.sjekk((await t.tilstand()).spill.r.hint[2].s === true, "Trykk strøk ikke hintet");
  await t.klikk('[data-h="stryk"][data-v="0"]');
  t.sjekk((await t.tilstand()).spill.r.hint[0].s === false, "Trykk hentet ikke tilbake et strøket hint");
  await t.klikk('[data-h="stryk"][data-v="0"]');
  await t.klikk('[data-h="stryk"][data-v="2"]');
  // Reload on the check screen → the guesser-looks-away gate, then straight back to the hints
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".skjerm-runde"), "Omlasting på sjekkskjermen viste ikke porten");
  t.sjekk(!t.norsk || /hintene/.test(await t.tekst('[data-h="vis-ordet"]')), "Porten sier ikke at hintene vises");
  await t.klikk('[data-h="vis-ordet"]');
  t.sjekk(await t.finnes(".skjerm-sjekk"), "Porten gikk ikke tilbake til sjekkskjermen");
  await t.klikk('[data-h="til-gjetter"]');
  await t.bilde("gjetter");
  t.sjekk(await t.friForDokk(".gi-til"), "Gjetterens navn havner bak knappen");
  t.sjekk(!harOrd(await t.tekst("#skjerm"), ord), "Skjermen «Gi mobilen til gjetteren» viser ordet");
  await t.klikk('[data-h="jeg-gjetter"]');
  await t.bilde("gjett");
  t.sjekk((await t.antall(".hv-lapper .hv-lapp")) === 1, "Gjetteren skulle se ett hint");
  t.sjekk(!harOrd(await t.js(`document.querySelector("#skjerm").textContent`), ord), "Gjetteren ser det hemmelige ordet");
  t.sjekk(await t.friForDokk(".hv-lapper"), "Hintene til gjetteren havner bak knappene");
  await t.klikk('[data-h="sjekk-svar"]');
  await t.sov(1200);
  await t.bilde("svar");
  t.sjekk((await hemmelig()) === ord && (await t.finnes("#skjerm h1 #hv-ord")), "Fasiten viser ikke ordet");
  await t.klikk('[data-h="riktig"]');
  await t.bilde("svar-riktig", true);
  t.sjekk((t.norsk ? /^1 poeng · 7 kort igjen$/ : /\b1\b.*\b7\b/).test((await t.tekst(".hv-stand")).replace(/\s+/g, " ").trim()), "Stillingen etter første ord er feil: " + (await t.tekst(".hv-stand")));
  t.sjekk(await t.friForDokk(".hv-stand"), "Stillingen havner bak knappene på fasitskjermen");
  t.sjekk((await t.finnes('.dokk [data-h="avslutt"]')) && (await t.finnes('.dokk [data-h="angre"]')), "Fasitskjermen mangler «Angre» eller «Avslutt»");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await t.tilstand()).spill.r.utfall === null, "Angre virket ikke");
  await t.klikk('[data-h="riktig"]');
  await t.klikk('[data-h="neste"]');
  s = await t.tilstand();
  t.sjekk(s.spill.poeng === 1 && s.spill.logg.length === 1, "Riktig svar ga ikke poeng");
  t.sjekk(s.spill.r.gjetter === (gjetter + 1) % 4, "Gjetteren går ikke videre");
  t.sjekk(JSON.stringify(s.spill.logg[0].h.map((h) => [h.t, h.s])) === JSON.stringify(hint1.map((h, n) => [h, n < 2])), "Loggen tok ikke vare på hintene (også de strøkne): " + JSON.stringify(s.spill.logg[0]));

  // One round on one phone: every hint giver types one hint, then the verdict.
  async function spillRunde(sett, utfall) {
    await t.klikk('[data-h="vis-ordet"]');
    const hint = await trygge(await hemmelig(), sett);
    await t.klikk('[data-h="skriv"]');
    for (const h of hint) {
      await t.skrivInn("#hint-1", h);
      await t.klikk(SEND);
    }
    await t.klikk('[data-h="til-gjetter"]');
    await t.klikk('[data-h="jeg-gjetter"]');
    if (utfall === "pass") await t.klikk('[data-h="pass"]');
    else {
      await t.klikk('[data-h="sjekk-svar"]');
      await t.klikk(`[data-h="${utfall}"]`);
    }
    await t.klikk('[data-h="neste"]');
  }

  // ---------- Round 2: pass (free) · Round 3: wrong (costs an extra card) ----------
  await spillRunde(SETT.tre, "pass");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng === 1 && s.spill.tapt === 0 && s.spill.logg[1].u === "pass", "Pass ble ikke registrert riktig");
  await spillRunde(SETT.tre.slice(1), "feil");
  s = await t.tilstand();
  t.sjekk(s.spill.tapt === 1 && s.spill.logg[2].u === "feil" && s.spill.logg[2].x === 1, "Feil svar kostet ikke et ekstra kort");
  await t.bilde("runde-bunke");

  // ---------- Every hint the same: all struck, the guesser gets nothing ----------
  await t.klikk('[data-h="vis-ordet"]');
  const hint4 = await trygge(await hemmelig(), SETT.alleLike);
  await t.klikk('[data-h="skriv"]');
  for (const h of hint4) {
    await t.skrivInn("#hint-1", h);
    await t.klikk(SEND);
  }
  t.sjekk(!t.norsk || /alle hintene er strøket/i.test(await t.tekst(".dokk")), "Sjekkskjermen sier ikke at alle hint er strøket");
  await t.klikk('[data-h="til-gjetter"]');
  t.sjekk(!t.norsk || /ingen hint/i.test(await t.tekst(".gi-til")), "Gjetteren får ikke vite at ingen hint overlevde");
  await t.klikk('[data-h="jeg-gjetter"]');
  t.sjekk(await t.finnes(".skjerm-gjett .tom"), "Gjetteskjermen viser ikke at alle hint ble strøket");
  await t.bilde("gjett-tomt");
  await t.klikk('[data-h="pass"]');
  await t.klikk('[data-h="neste"]');

  // ---------- Play out the deck → «Kåringen» ----------
  for (let n = 0; n < 10 && !(await t.finnes(".skjerm-slutt")); n++) await spillRunde(SETT.tre, "riktig");
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  await t.bilde("slutt", true);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.logg.length + s.spill.tapt === 8 && s.spill.poeng === 4, "Spillet stoppet ikke etter 8 kort med 4 poeng");
  t.sjekk(s._aktiv === false, "Spillet står fortsatt som pågående på «Kåringen»");
  t.sjekk(/\b4 \S+ 8\b/.test((await t.tekst(".banner")).toLowerCase()), "Resultatet viser ikke poengene");
  t.sjekk((t.norsk ? /Første runde – nå har dere en rekord å slå!/ : /\S/).test(await t.tekst(".hv-rekord")), "Første fullførte spill sier ikke «Første runde – nå har dere en rekord å slå!»");
  t.sjekk(s.rekorder["8f"] === 4 && Object.keys(s.rekorder).length === 1, "Rekorden ble ikke lagret for 8 ord med forbudt hint: " + JSON.stringify(s.rekorder));
  t.sjekk(await t.friForDokk(".banner"), "Resultatet havner bak knappene på «Kåringen»");
  t.sjekk((await t.antall(".hv-logg li")) === s.spill.logg.length, "Ordlista på slutten mangler ord");
  const alleHint = s.spill.logg.flatMap((l) => l.h);
  t.sjekk(alleHint.length === s.spill.logg.length * 3 && (await t.antall(".hv-logg .hv-hint")) === alleHint.length, "«Kåringen» viser ikke hintene til hvert ord");
  const strokne = alleHint.filter((h) => h.s).length;
  t.sjekk(strokne >= 5 && (await t.antall(".hv-logg s.hv-hint")) === strokne, "Strøkne hint er ikke strøket i oppsummeringen");
  t.sjekk(await t.js(`Array.from(document.querySelectorAll(".hv-logg s.hv-hint")).every((h) => ${t.norsk ? "/strøket/" : "/\\(/"}.test(h.textContent) && getComputedStyle(h).textDecorationLine.includes("line-through"))`), "Strøkne hint er ikke merket både synlig og i tekst");
  t.sjekk((!t.norsk || (await t.tekst(".dokk .knapp")).trim() === "Spill igjen") && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)) && (await t.finnes('.dokk [data-h="nytt"]')), "Sluttskjermen mangler «Spill igjen», «Endre oppsett» eller «Alle spill»");
  t.sjekk(await t.js(`(() => { const d = document.querySelector('#skjerm [data-h="del"]'); const f = document.querySelector("#skjerm .flere-spill"); return !!d && (${!t.norsk} || d.textContent.trim() === "Del resultatet") && (!f || !!(d.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING)); })()`), "«Del resultatet» mangler eller står etter «Spill noe annet»");
  let delt = await del();
  t.sjekk(t.norsk ? delt.text === `Hviskeren 4/8 med forbudt hint – Lovende gjeng\n${merkerad(s.spill.logg)}` : (delt.text || "").startsWith(`${await t.js("window.RUSJ_SPILL.navn")} 4/8 `) && delt.text.endsWith(`\n${merkerad(s.spill.logg)}`), "Deleteksten er feil: " + JSON.stringify(delt.text));
  t.sjekk((delt.url || "").endsWith(new URL(t.side).pathname) && delt.title === (await t.js("window.RUSJ_SPILL.navn")), "Delingen peker ikke til spillet");
  t.sjekk(![...s.spill.logg.map((l) => l.o), ...alleHint.map((h) => h.t)].some((x) => (delt.text || "").toLowerCase().includes(x.toLowerCase())), "Deleteksten røper et ord eller et hint");
  let ferdig = await statistikk("ferdig");
  t.sjekk(ferdig && ferdig.runder === 7 && ferdig.avbrutt === false && ferdig.poeng === 4, "Statistikken «ferdig» mangler eller er feil: " + JSON.stringify(ferdig));
  t.sjekk((await t.js(`localStorage.getItem("${t.nokkel("kveld")}")`)) === null, "Et samarbeidsspill ga poeng i Kveldens gjeng");
  // A reload on «Kåringen»: the same screen, nothing is counted twice.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.finnes(".skjerm-slutt")) && (!t.norsk || /Første runde/.test(await t.tekst(".hv-rekord"))), "Omlasting på «Kåringen» viste ikke samme resultat");
  t.sjekk((await statistikk("ferdig")) === null && (await t.tilstand()).rekorder["8f"] === 4, "Omlasting på «Kåringen» telte spillet en gang til");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /^REKORD 4 av 8 · vanskelig$/ : /^\S+ 4 \S+ 8 · \S+$/).test((await t.tekst(".merker li")).replace(/\s+/g, " ").trim()), "Rekorden er ikke første merke på hjem-skjermen: " + (await t.tekst(".merker li")));
  t.sjekk((await t.finnes('.hjem-knapper .knapp[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), "Hjem-skjermen viser «Fortsett» etter et ferdig spill");
  await t.bilde("hjem-rekord");

  // ---------- «Alle samtidig»: the clock, the three verdicts, undo, a new record ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes(".skjerm-oppsett"), "«Start spill» etter et ferdig spill gikk ikke rett til oppsettet");
  await t.klikk('[data-h="modus"][data-v="alle"]');
  await t.bilde("oppsett-alle", true);
  await t.klikk('[data-h="start"]');
  s = await t.tilstand();
  t.sjekk(s.spill.modus === "alle" && s.spill.runder === 8 && s.spill.forbudt === true, "«Alle samtidig» startet med feil oppsett");
  await t.klikk('[data-h="vis-ordet"]');
  const ordA = await hemmelig();
  const forbudtA = (await t.tekst(".hv-forbudt b")).trim();
  t.sjekk((!t.norsk || /lapp/.test(await t.tekst(".hjelp"))) && (await t.finnes('[data-h="start-klokka"]')) && !!forbudtA, "Ordskjermen i «Alle samtidig» forklarer ikke lapper, eller mangler klokka eller det forbudte hintet");
  await t.bilde("alle-ordet");
  await t.klikk('[data-h="start-klokka"]');
  await t.vent("document.querySelector('.skjerm-tid')");
  const klokke = async () => Number((await t.tekst("#hv-klokke .timer-tid")).trim());
  const tid0 = await klokke();
  t.sjekk(!t.norsk || (/Skriv hintet ditt/.test(await t.tekst("#skjerm h1")) && /på en lapp eller på din egen mobil/i.test(await t.tekst(".hv-tid-tekst"))), "Klokkeskjermen sier ikke «Skriv hintet ditt – på en lapp eller på din egen mobil»");
  t.sjekk((await t.tekst(".hv-minne")).includes(ordA) && (await t.tekst(".hv-nei")).includes(forbudtA), "Klokkeskjermen viser ikke ordet og det forbudte hintet til hintgiverne");
  t.sjekk((await t.friForDokk(".hv-tid")) && (await t.friForDokk('[data-h="klokke"]')), "Klokka eller pauseknappen havner bak «Ferdig»");
  await t.sov(1300);
  await t.bilde("alle-tid");
  const tid1 = await klokke();
  t.sjekk(tid0 === 45 && tid1 < 45 && tid1 >= 36, `Klokka går ikke fra 45 s (${tid0} → ${tid1})`);
  await t.klikk('[data-h="klokke"]');
  const pause1 = await klokke();
  await t.sov(1200);
  s = await t.tilstand();
  t.sjekk((await klokke()) === pause1 && s.spill.r.pause === true && (!t.norsk || (await t.tekst('[data-h="klokke"]')).trim() === "Fortsett"), "Pause stopper ikke klokka");
  // A reload: the gate first, then the clock where it was – still paused.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".skjerm-runde"), "Omlasting på klokkeskjermen viste ikke porten");
  await t.klikk('[data-h="vis-ordet"]');
  t.sjekk((await t.finnes(".skjerm-tid")) && (await klokke()) === pause1 && (!t.norsk || (await t.tekst('[data-h="klokke"]')).trim() === "Fortsett"), "Klokka fortsatte ikke fra der den sto etter omlasting");
  await t.klikk('[data-h="klokke"]');
  await t.sov(1300);
  t.sjekk((await klokke()) < pause1 && (await t.tilstand()).spill.r.pause === false, "Klokka gikk ikke videre etter pausen");
  await t.klikk('[data-h="ferdig-skrevet"]');
  await t.vent("document.querySelector('.skjerm-lapper')");
  await t.bilde("alle-lapper");
  t.sjekk((await t.antall(".dokk .knapprad button")) === 3 && (await t.finnes('.dokk [data-h="feil"]')) && (await t.finnes('.dokk [data-h="pass"]')) && (await t.finnes('.dokk [data-h="riktig"]')), "Sammenligningsskjermen mangler «Riktig», «Feil» eller «Pass»");
  t.sjekk((await t.friForDokk(".hv-steg")) && (await t.antall(".hv-steg li")) === 3, "De tre stegene havner bak knappene");
  t.sjekk((await t.tekst(".hv-steg")).includes(forbudtA), "Sammenligningsskjermen minner ikke om det forbudte hintet");
  await t.klikk("#reglerknapp");
  t.sjekk((!t.norsk || (/Alle skriver samtidig/.test(await t.tekst("#ark .steg")) && /lapp/.test(await t.tekst("#ark .steg")))) && /45 s/.test(await t.tekst("#ark .steg")), "Reglene er ikke oppdatert for «Alle samtidig»");
  await t.bilde("alle-regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  const rader = await t.js(`new Set(Array.from(document.querySelectorAll(".dokk .knapprad button")).map((b) => Math.round(b.getBoundingClientRect().top))).size`);
  t.sjekk(rader === 1 || rader === 3, "De tre svarknappene står som to pluss én");
  // Reload here as well: the gate, then back to the notes.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".skjerm-runde"), "Omlasting på sammenligningsskjermen viste ikke porten");
  await t.klikk('[data-h="vis-ordet"]');
  t.sjekk(await t.finnes(".skjerm-lapper"), "Porten gikk ikke tilbake til sammenligningsskjermen");
  await t.klikk('[data-h="feil"]');
  await t.vent("document.querySelector('.skjerm-svar')");
  t.sjekk((await t.tilstand()).spill.r.utfall === "feil" && (!t.norsk || /ekstra kort/.test(await t.tekst(".hv-utfall"))), "«Feil» ble ikke registrert");
  t.sjekk(!(await t.finnes(".hv-runden")), "«Alle samtidig» viser hint som ingen har skrevet inn");
  await t.klikk('[data-h="angre"]');
  t.sjekk((await t.finnes(".skjerm-lapper")) && (await t.tilstand()).spill.r.utfall === null, "Angre gikk ikke tilbake til sammenligningsskjermen");
  await t.klikk('[data-h="pass"]');
  t.sjekk((await t.tilstand()).spill.r.utfall === "pass" && (!t.norsk || /gratis/.test(await t.tekst(".hv-utfall"))), "«Pass» ble ikke registrert");
  await t.klikk('[data-h="angre"]');
  await t.klikk('[data-h="riktig"]');
  await t.sov(300);
  await t.bilde("alle-svar");
  t.sjekk((await hemmelig()) === ordA && (await t.tilstand()).spill.r.utfall === "riktig" && (!t.norsk || /Ett poeng/.test(await t.tekst(".hv-utfall"))), "«Riktig» ble ikke registrert");
  await t.klikk('[data-h="neste"]');
  s = await t.tilstand();
  t.sjekk(s.spill.poeng === 1 && s.spill.logg.length === 1 && s.spill.logg[0].h.length === 0, "Første kort i «Alle samtidig» ble ikke bokført riktig");
  // The clock runs out by itself → the compare screen.
  await t.klikk('[data-h="vis-ordet"]');
  await t.klikk('[data-h="start-klokka"]');
  await t.vent("document.querySelector('.skjerm-tid') && window.Rusj.timer('hv-klokke')");
  await t.js(`window.Rusj.timer("hv-klokke").slutt = performance.now() + 300`);
  await t.vent("document.querySelector('.skjerm-lapper')", 4000);
  await t.klikk('[data-h="riktig"]');
  await t.klikk('[data-h="neste"]');
  async function spillAlle(utfall) {
    await t.klikk('[data-h="vis-ordet"]');
    await t.klikk('[data-h="start-klokka"]');
    await t.klikk('[data-h="ferdig-skrevet"]');
    await t.klikk(`[data-h="${utfall}"]`);
    await t.klikk('[data-h="neste"]');
  }
  for (let n = 0; n < 10 && !(await t.finnes(".skjerm-slutt")); n++) await spillAlle("riktig");
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  await t.bilde("slutt-rekord", true);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng === 8 && s.rekorder["8f"] === 8, "Åtte av åtte ble ikke ny rekord: " + JSON.stringify(s.rekorder));
  t.sjekk((!t.norsk || /Ny rekord!/.test(await t.tekst(".hv-rekord"))) && /4 \S+ 8/.test(await t.tekst(".hv-rekord")) && (await t.finnes(".hv-rekord.ny")), "«Kåringen» sier ikke «Ny rekord!» med den forrige rekorden");
  t.sjekk((!t.norsk || /Telepater/.test(await t.tekst(".banner"))) && (await t.finnes(".banner .figur-ramme.jubel")), "Åtte av åtte gir ikke toppvurderingen med jublende maskot");
  t.sjekk((await t.antall(".hv-logg li")) === 8 && (await t.antall(".hv-logg .hv-hint")) === 0, "Oppsummeringen i «Alle samtidig» skal bare vise ord og utfall");
  delt = await del();
  t.sjekk(t.norsk ? delt.text === `Hviskeren 8/8 med forbudt hint – Telepater!\n${"✅".repeat(8)}` : (delt.text || "").startsWith(`${await t.js("window.RUSJ_SPILL.navn")} 8/8 `) && delt.text.endsWith(`\n${"✅".repeat(8)}`), "Deleteksten etter åtte av åtte er feil: " + JSON.stringify(delt.text));
  ferdig = await statistikk("ferdig");
  t.sjekk(ferdig && ferdig.modus === "alle" && ferdig.avbrutt === false && ferdig.runder === 8, "Statistikken «ferdig» er feil i «Alle samtidig»: " + JSON.stringify(ferdig));

  // ---------- «Avslutt»: to «Kåringen» with the result so far, and the game is over ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.skjerm-runde')");
  await spillAlle("riktig");
  await t.klikk('[data-h="vis-ordet"]');
  await t.klikk('[data-h="start-klokka"]');
  await t.klikk('[data-h="ferdig-skrevet"]');
  await t.klikk('[data-h="feil"]');
  await t.klikk('.dokk [data-h="avslutt"]');
  const ark = await t.js(`Array.from(document.querySelectorAll("#ark:not([hidden]) button")).map((b) => b.textContent.trim()).join("|")`);
  t.sjekk(!t.norsk || (ark === "Spill videre|Avslutt" && /Avslutte spillet\?/.test(await t.tekst("#ark"))), "Arket for «Avslutt» har feil knapper: " + ark);
  await t.bilde("avslutt-ark");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await t.finnes(".skjerm-svar")) && (await t.tilstand()).spill.ferdig === false, "«Spill videre» avsluttet spillet likevel");
  await t.klikk('.dokk [data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(300);
  await t.bilde("slutt-avsluttet", true);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.avbrutt && s._aktiv === false, "«Avslutt» gjorde ikke spillet ferdig");
  t.sjekk(s.spill.logg.length === 2 && s.spill.poeng === 1 && s.spill.tapt === 1, "Runden som var dømt, ble ikke med til «Kåringen»: " + JSON.stringify(s.spill.logg));
  t.sjekk((t.norsk ? /avsluttet etter 3 av 8 kort/i.test(await t.tekst(".banner")) && /1 riktig/.test(await t.tekst(".banner")) : /3 \S+ 8/.test(await t.tekst(".banner"))), "«Kåringen» viser ikke resultatet så langt: " + (await t.tekst(".banner")));
  t.sjekk(s.rekorder["8f"] === 8 && !(await t.finnes(".hv-rekord")), "Et avsluttet spill rørte rekorden");
  delt = await del();
  t.sjekk(t.norsk ? delt.text === "Hviskeren 1/2 – avsluttet etter 3 av 8 kort\n✅❌▪️" : /^\S+ 1\/2 – .*\b3\b.*\b8\b.*\n✅❌▪️$/.test(delt.text || ""), "Deleteksten for et avsluttet spill er feil: " + JSON.stringify(delt.text));
  ferdig = await statistikk("ferdig");
  t.sjekk(ferdig && ferdig.avbrutt === true && ferdig.runder === 2, "Statistikken «ferdig» sier ikke at spillet ble avbrutt: " + JSON.stringify(ferdig));
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes('.hjem-knapper .knapp[data-h="nytt"]')) && !(await t.finnes('[data-h="fortsett"]')), "Hjem-skjermen viser «Fortsett» etter «Avslutt»");
  t.sjekk((t.norsk ? /REKORD 8 av 8/ : /\S+ 8 \S+ 8/).test((await t.tekst(".merker li")).replace(/\s+/g, " ")), "Hjem-skjermen viser ikke den nye rekorden");
  // «Avslutt» before the first card: still «Kåringen», with nothing to share.
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk((!t.norsk || /Spillet ble avsluttet/.test(await t.tekst(".banner"))) && !(await t.finnes('[data-h="del"]')) && (await t.tilstand())._aktiv === false, "«Avslutt» før første kort gikk ikke til en tom kåring");
  await t.bilde("slutt-tom");

  // ---------- Three players on one phone: two hints each ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="en"]');
  await t.klikk('[data-h="forbudt"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="3"]');
  t.sjekk(!t.norsk || /to hint/.test(await t.tekst("#spillerboks")), "Oppsettet forklarer ikke to hint for tre spillere");
  await t.klikk('[data-h="start"]');
  s = await t.tilstand();
  t.sjekk(s.spill.per === 2 && s.spill.forbudt === false && s.spill.modus === "en", "Tre spillere startet med feil oppsett");
  await t.klikk('[data-h="vis-ordet"]');
  t.sjekk(!(await t.finnes(".hv-forbudt")), "Ordkortet viser et forbudt hint selv om «Vanskelig» er av");
  const to = await trygge(await hemmelig(), SETT.toHver);
  await t.klikk('[data-h="skriv"]');
  t.sjekk(await t.finnes("#hint-2"), "Tre spillere skulle gi to hint hver");
  await t.skrivInn("#hint-1", to[0]);
  await t.skrivInn("#hint-2", to[1]);
  await t.klikk(SEND);
  t.sjekk((t.norsk ? /allerede/ : /\S/).test(await t.tekst("#hint-feil")), "Samme hint to ganger ble godtatt");
  await t.skrivInn("#hint-2", to[2]);
  await t.bilde("skriv-to");
  await t.klikk(SEND);
  await t.vent(`document.querySelector("#hint-1") && document.querySelector("#hint-1").value === ""`);
  t.sjekk((await t.js(`document.querySelector("#hint-2").value`)) === "" && !(await side()).includes(to[0]), "Hintene til forrige spiller ligger igjen i feltene");
  await t.skrivInn("#hint-1", to[3]);
  await t.skrivInn("#hint-2", to[4]);
  await t.klikk(SEND);
  await t.vent("document.querySelector('.skjerm-sjekk')");
  s = await t.tilstand();
  t.sjekk(s.spill.r.hint.length === 4 && s.spill.r.hint.filter((h) => h.s).length === 2, "Tre spillere: feil antall hint eller strøkne hint");

  // ---------- A small phone (320×568) ----------
  await t.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);
  t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), "Sjekkskjermen er for bred på 320 px");
  await t.bilde("sjekk-320");
  await t.klikk('[data-h="til-gjetter"]');
  await t.klikk('[data-h="jeg-gjetter"]');
  t.sjekk(await t.js("document.documentElement.scrollWidth <= window.innerWidth"), "Gjetteskjermen er for bred på 320 px");
  await t.bilde("gjett-320");
  await t.send("Emulation.setDeviceMetricsOverride", { width: fra.b, height: fra.h, deviceScaleFactor: 2, mobile: true });
  await t.sov(200);

  // ---------- Records are kept apart: 8 words without the forbidden hint has its own ----------
  await t.klikk("#tilbake");
  await t.klikk('.hjem-knapper [data-h="nytt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.klikk('[data-h="modus"][data-v="alle"]');
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="vis-ordet"]');
  t.sjekk(!t.norsk || /to hint hver/.test(await t.tekst(".hjelp")), "Tre spillere i «Alle samtidig»: ordskjermen sier ikke to hint hver");
  await t.klikk('[data-h="start-klokka"]');
  t.sjekk((!t.norsk || /Skriv to hint hver/.test(await t.tekst("#skjerm h1"))) && !(await t.finnes(".hv-nei")), "Tre spillere i «Alle samtidig»: klokkeskjermen sier ikke «Skriv to hint hver»");
  await t.klikk('[data-h="ferdig-skrevet"]');
  await t.klikk('[data-h="riktig"]');
  await t.klikk('[data-h="neste"]');
  for (const utfall of ["riktig", "pass", "feil", "riktig", "riktig", "riktig"]) await spillAlle(utfall);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng === 5 && s.rekorder["8"] === 5 && s.rekorder["8f"] === 8, "Rekorden uten forbudt hint ble ikke holdt for seg: " + JSON.stringify(s.rekorder));
  t.sjekk((t.norsk ? /Første runde med dette oppsettet – nå har dere en rekord å slå!/ : /\S/).test(await t.tekst(".hv-rekord")), "Første spill med et nytt oppsett: " + (await t.tekst(".hv-rekord")));
  delt = await del();
  t.sjekk(t.norsk ? delt.text === "Hviskeren 5/8 – Godt samkjørt\n✅✅➖❌▪️✅✅✅" : /^\S+ 5\/8 – .+\n✅✅➖❌▪️✅✅✅$/.test(delt.text || ""), "Deleteksten med pass og tapt kort er feil: " + JSON.stringify(delt.text));
  await t.bilde("slutt-oppsett", true);
  // The same deck once more, with a weaker result: the record stands, and nobody is shamed.
  await t.klikk('[data-h="igjen"]');
  for (const utfall of ["riktig", "pass", "pass", "pass", "pass", "pass", "pass", "pass"]) await spillAlle(utfall);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng === 1 && s.rekorder["8"] === 5, "Et svakere spill endret rekorden: " + JSON.stringify(s.rekorder));
  t.sjekk((t.norsk ? /Rekorden å slå er 5 av 8/ : /5 \S+ 8/).test(await t.tekst(".hv-rekord")) && !(await t.finnes(".hv-rekord.ny")) && (await t.finnes(".banner .figur-ramme.lei")), "Et svakere spill: " + (await t.tekst(".hv-rekord")));
  await t.bilde("slutt-svak");
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /^REKORD 5 av 8$/ : /^\S+ 5 \S+ 8$/).test((await t.tekst(".merker li")).replace(/\s+/g, " ").trim()), "Hjem-skjermen viser ikke rekorden for oppsettet som er valgt: " + (await t.tekst(".merker li")));

  // ---------- A game saved by the version before this one is picked up where it was ----------
  const lagre = (tilstand) => t.js(`localStorage.setItem("${t.nokkel("hviskeren.v1")}", ${JSON.stringify(JSON.stringify(tilstand))})`);
  await lagre({
    _tid: Date.now(),
    _aktiv: true,
    skjerm: "gi",
    antall: 4,
    oppsett: { kategorier: ["dyr"], niva: "lett", runder: 8 },
    spill: {
      antall: 4, per: 1, runder: 8, start: 0, poeng: 1, tapt: 0, skjerm: "gi", ferdig: false,
      logg: [{ o: "Katt", u: "riktig", g: 0, x: 0 }],
      r: { gjetter: 1, ord: 3, givere: [2, 3, 0], na: 1, hint: [{ i: 2, t: "Glimmerpote", a: false, s: false }], utfall: null, mal: "ordet" },
    },
  });
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk((await t.finnes(".skjerm-skriv")) && (await overskrift()).includes(await t.js("window.Rusj.navn(3)")), "Et spill lagret av forrige versjon åpnet ikke på hintskjermen til neste hintgiver");
  t.sjekk(s.spill && s.spill.modus === "en" && s.spill.r.hint.length === 1 && Array.isArray(s.spill.logg[0].h) && s.oppsett.lengdeValgt === true && s.oppsett.modus === "en", "Et spill lagret av forrige versjon ble ikke ført over riktig");
  t.sjekk(!(await side()).includes("Glimmerpote"), "Et hint fra det lagrede spillet vises på hintskjermen");

  // ---------- Damaged saves never give a blank page ----------
  const skadde = [
    { skjerm: "skriv", antall: "mange", oppsett: { kategorier: 7, niva: "toString", runder: "x", modus: 5, forbudt: "ja" }, rekorder: [3, 4], spill: { antall: 4, runder: 8, logg: "nei", r: {} } },
    { skjerm: "tid", antall: 4, oppsett: null, rekorder: { 13: 99, "8f": -2, x: 1 }, spill: { antall: 4, runder: 8, modus: "alle", start: 9, logg: [{ o: "Katt", u: "vant", g: 0 }], r: { ord: 1 } } },
    { skjerm: "slutt", antall: 3, oppsett: { kategorier: ["finnes-ikke"], niva: "lett", runder: 13 }, spill: { antall: 3, runder: 13, ferdig: true, logg: [], r: { ord: "length" } } },
    { skjerm: "sjekk", antall: 5, oppsett: { kategorier: ["dyr"], niva: "lett", runder: 8 }, spill: { antall: 5, runder: 8, start: 0, logg: [], skjerm: "gjett", r: { ord: 2, na: 4, hint: [{ t: 5 }, null, { i: 77, t: "Pote" }], utfall: "kanskje", mal: "slutt", igjen: "nå" } } },
    { skjerm: "svar", antall: 4, oppsett: { kategorier: ["dyr"], niva: "lett", runder: 8 }, spill: { antall: 4, runder: 8, modus: "alle", start: 1, logg: Array.from({ length: 9 }, () => ({ o: "Katt", u: "riktig", g: 0 })), r: { ord: 2 } } },
  ];
  for (const [n, skadd] of skadde.entries()) {
    await lagre({ _tid: Date.now(), _aktiv: true, ...skadd });
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    const h1 = (await t.tekst("#skjerm h1")).trim();
    t.sjekk(h1.length > 0 && (await t.antall("#skjerm button, #skjerm a")) > 0, `Skadd lagring ${n + 1} ga en tom side`);
    // Whatever was kept of it must be playable: home → setup (or the game) without errors.
    if (await t.finnes(".spillhjem")) {
      await t.klikk((await t.finnes('[data-h="fortsett"]')) ? '[data-h="fortsett"]' : '[data-h="nytt"]');
      t.sjekk((await t.tekst("#skjerm h1")).trim().length > 0, `Skadd lagring ${n + 1}: neste skjerm er tom`);
    }
  }
  await t.bilde("etter-skadd-lagring");
}
