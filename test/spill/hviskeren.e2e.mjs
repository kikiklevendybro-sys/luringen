// Hviskeren: the word-matching rules (pure functions), setup, rounds with a right answer, a pass
// and a wrong answer, automatic and manual striking, a round where every hint is struck, a reload
// on a secret screen, back + continue, the field staying visible above the keyboard, the
// three-player mode with two hints each, a narrow phone, and the final rating.

const SEND = '.hv-skriv button[type="submit"]';

// The secret word is random, so a fixed test hint could clash with it (Pannekakefjellet is rightly
// refused when the word is Pannekake). Each list holds alternatives; the first set that the game
// accepts for the current word is used.
const SETT = {
  likeOgEtTil: [["Kosmokatt", "kosmokattene", "Glitrefjell"], ["Plimpelo", "plimpeloene", "Snurrevandel"], ["Fjompen", "fjompene", "Kvarkelis"]],
  tre: [["Zorblik", "Kvaxum", "Blimsteg"], ["Frunkel", "Plimsa", "Tjuxi"], ["Vrimpel", "Snorkus", "Glimrok"], ["Qwasp", "Zinko", "Brumfel"]],
  alleLike: [["Snurrebass", "snurrebassen", "Snurrebassene"], ["Plopptopp", "plopptoppen", "plopptoppene"]],
  toHver: [["Plaskedam", "plaskedammen", "Gummistøvel", "Gummistøvler", "Vasstrekk"], ["Fnokkel", "fnokkelen", "Brisnapp", "Brisnapper", "Klonkeli"]],
};

export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"] });

  const trygge = (ord, sett) =>
    t.js(`(() => {
      const O = window.HviskerenOrd;
      const sett = ${JSON.stringify(sett)};
      return sett.find((s) => s.every((h) => O.sjekkHint(h, ${JSON.stringify(ord)}, []) === null)) || sett[0];
    })()`);
  const hemmelig = async () => (await t.tekst(".hv-ordkort h1")).trim();

  // ---------- Word matching rules ----------
  const regelfeil = await t.js(`(() => {
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
      ["hjerte", "hjerne"], ["frosk", "frost"], ["tegning", "terning"], ["ballett", "billett"],
    ];
    for (const [a, b] of like) if (!O.likeOrd(O.nokkel(a), O.nokkel(b))) ut.push(a + " skulle vært lik " + b);
    for (const [a, b] of ulike) if (O.likeOrd(O.nokkel(a), O.nokkel(b))) ut.push(a + " skulle vært ulik " + b);
    const hint = [
      ["", "Katt", [], "tom"], ["   ", "Katt", [], "tom"], ["Søt katt", "Hund", [], "flere"], ["!!!", "Hund", [], "tegn"],
      ["Katten", "Katt", [], "samme"], ["katter", "Katt", [], "samme"], ["KATT", "Katt", [], "samme"], ["Bannan", "Banan", [], "samme"],
      ["Ball", "Fotball", [], "del"], ["Fotballbane", "Fotball", [], "del"], ["Kokosnøtt", "Nøtt", [], "del"], ["Hestesko", "Hest", [], "del"],
      ["Mat", "Matematikk", [], null], ["Vestlandet", "And", [], null], ["Laser", "Lasagne", [], null], ["Sportsbil", "Bil", [], null],
      ["Fiskestang", "Fisk", [], "del"], ["Mai", "17. mai", [], "samme"], ["Pommes", "Pommes frites", [], "samme"],
      ["Mobil", "Bil", [], null], ["Kakao", "Kake", [], null], ["Pote", "Katt", [], null], ["T-skjorte", "Sommer", [], null],
      ["Pote", "Katt", ["poter"], "egen"], ["Værhår", "Katt", ["Pote"], null], ["Bil", "Bilde", [], null], ["Sko", "Skole", [], null],
      ["Kattunge", "Katt", [], "del"], ["Gyngehest", "Hest", [], "del"], ["Tannbørste", "Tennene", [], "del"],
    ];
    for (const [h, o, egne, svar] of hint) {
      const r = O.sjekkHint(h, o, egne);
      if (r !== svar) ut.push("sjekkHint(" + JSON.stringify(h) + ", " + o + ") ga " + r + ", ventet " + svar);
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

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk((await t.antall(".spiller")) === 4, "Spillerlista viser ikke fire spillere");

  await t.klikk('[data-h="kategorier"]');
  await t.bilde("kategorier");
  await t.klikk('#hv-kat [data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.length === 0, "«Alle» skulle velge bort alle kategorier");
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skulle være av uten kategorier");
  await t.klikk('#hv-kat [data-v="dyr"]');
  await t.klikk('#hv-kat [data-v="mat"]');
  t.sjekk(JSON.stringify((await t.tilstand()).oppsett.kategorier) === JSON.stringify(["mat", "dyr"]), "Kategoriene ble ikke valgt");
  await t.klikk('#ark [data-h="lukk-ark"]');
  t.sjekk(/Mat og retter · Dyr/.test(await t.tekst(".hv-katknapp")), "Kategoriknappen viser ikke valget");
  await t.klikk('[data-h="niva"][data-v="lett"]');
  await t.klikk('[data-h="runder"][data-v="8"]');
  await t.klikk('[data-h="start"]');

  // ---------- Round 1: auto-strike, manual strike, a right answer ----------
  await t.vent("document.querySelector('.skjerm-runde')");
  await t.bilde("runde");
  let s = await t.tilstand();
  t.sjekk(s.spill.runder === 8 && s.spill.per === 1, "Feil oppsett av spillet");
  const gjetter = s.spill.r.gjetter;
  await t.klikk('[data-h="vis-ordet"]');
  await t.bilde("ordet");
  const ord1 = await t.tekst(".hv-ordkort h1");
  await t.klikk('[data-h="bytt-ord"]');
  const ord = (await t.tekst(".hv-ordkort h1")).trim();
  t.sjekk(ord && ord !== ord1, "«Bytt ord» ga ikke et nytt ord");
  t.sjekk(/dyr|mat/i.test(await t.tekst(".hv-ordkort .storkort-etikett")), "Ordet er ikke fra de valgte kategoriene");

  const hint1 = await trygge(ord, SETT.likeOgEtTil);
  await t.klikk('[data-h="skriv"]');
  await t.bilde("gi");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === `Testspiller ${"ABCD"[(gjetter + 1) % 4]}`, "Feil hintgiver først");
  await t.klikk('[data-h="jeg-er"]');
  t.sjekk(await t.js(`document.activeElement && document.activeElement.id === "hint-1"`), "Hint-feltet får ikke fokus");
  const attr = await t.js(`(() => { const f = document.querySelector("#hint-1"); return [f.getAttribute("enterkeyhint"), f.getAttribute("autocomplete"), f.getAttribute("autocapitalize"), f.maxLength].join(","); })()`);
  t.sjekk(attr === "done,off,sentences,24", "Hint-feltet har feil tastaturinnstillinger: " + attr);
  await t.skrivInn("#hint-1", ord.split(/\s+/)[0]);
  await t.klikk(SEND);
  t.sjekk(/selve ordet/.test(await t.tekst("#hint-feil")), "Det hemmelige ordet ble godtatt som hint");
  await t.bilde("skriv-feil");
  await t.skrivInn("#hint-1", "to ord");
  t.sjekk((await t.tekst("#hint-feil")) === "", "Feilmeldingen forsvinner ikke når man skriver");
  await t.klikk(SEND);
  t.sjekk(/ett ord/i.test(await t.tekst("#hint-feil")), "To ord ble godtatt");
  await t.skrivInn("#hint-1", hint1[0]);
  await t.bilde("skriv");
  // With the keyboard open only the top ~460 px are visible: the field and the button must be there.
  // (Keep the runner's width – 390 by default, or --bredde – and restore its size afterwards.)
  const fra = await t.js("({ b: window.innerWidth, h: window.innerHeight })");
  await t.send("Emulation.setDeviceMetricsOverride", { width: fra.b, height: 460, deviceScaleFactor: 2, mobile: true });
  await t.js("window.scrollTo(0, 0)");
  await t.sov(250);
  const synlig = await t.js(`(() => { const f = document.querySelector("#hint-1").getBoundingClientRect(); const b = document.querySelector(${JSON.stringify(SEND)}).getBoundingClientRect(); return f.top >= 0 && b.bottom <= window.innerHeight; })()`);
  t.sjekk(synlig, "Hint-feltet og «Ferdig» er ikke synlige over tastaturet");
  await t.bilde("skriv-tastatur");
  await t.send("Emulation.setDeviceMetricsOverride", { width: fra.b, height: fra.h, deviceScaleFactor: 2, mobile: true });
  await t.sov(150);
  // Enter submits
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await t.vent("document.querySelector('.skjerm-gi')");
  t.sjekk((await t.tilstand()).spill.r.hint.length === 1, "Enter sendte ikke hintet");

  for (const h of hint1.slice(1)) {
    await t.klikk('[data-h="jeg-er"]');
    await t.skrivInn("#hint-1", h);
    await t.klikk(SEND);
  }
  await t.vent("document.querySelector('.skjerm-sjekk')");
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.r.hint.map((h) => h.s)) === "[true,true,false]", "Like hint ble ikke strøket automatisk: " + JSON.stringify(s.spill.r.hint));
  await t.bilde("sjekk", true);
  await t.klikk('[data-h="stryk"][data-v="2"]');
  t.sjekk((await t.tilstand()).spill.r.hint[2].s === true, "Trykk strøk ikke hintet");
  await t.klikk('[data-h="stryk"][data-v="0"]');
  t.sjekk((await t.tilstand()).spill.r.hint[0].s === false, "Trykk hentet ikke tilbake et strøket hint");
  await t.klikk('[data-h="stryk"][data-v="0"]');
  await t.klikk('[data-h="stryk"][data-v="2"]');
  await t.klikk('[data-h="til-gjetter"]');
  await t.bilde("gjetter");
  await t.klikk('[data-h="jeg-gjetter"]');
  await t.bilde("gjett");
  t.sjekk((await t.antall(".hv-lapper .hv-lapp")) === 1, "Gjetteren skulle se ett hint");
  t.sjekk(!(await t.tekst("#skjerm")).includes(ord), "Gjetteren ser det hemmelige ordet");
  await t.klikk('[data-h="sjekk-svar"]');
  await t.sov(1200);
  await t.bilde("svar");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === ord, "Fasiten viser ikke ordet");
  await t.klikk('[data-h="riktig"]');
  await t.bilde("svar-riktig", true);
  await t.klikk('[data-h="angre"]');
  t.sjekk((await t.tilstand()).spill.r.utfall === null, "Angre virket ikke");
  await t.klikk('[data-h="riktig"]');
  await t.klikk('[data-h="neste"]');
  s = await t.tilstand();
  t.sjekk(s.spill.poeng === 1 && s.spill.logg.length === 1, "Riktig svar ga ikke poeng");
  t.sjekk(s.spill.r.gjetter === (gjetter + 1) % 4, "Gjetteren går ikke videre");

  async function spillRunde(sett, utfall) {
    await t.klikk('[data-h="vis-ordet"]');
    const hint = await trygge(await hemmelig(), sett);
    await t.klikk('[data-h="skriv"]');
    for (const h of hint) {
      await t.klikk('[data-h="jeg-er"]');
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
  t.sjekk(s.spill.tapt === 1 && s.spill.logg[2].u === "feil", "Feil svar kostet ikke et ekstra kort");
  await t.bilde("runde-bunke");

  // ---------- Reload on a secret screen → back to the gate; back + continue ----------
  await t.klikk('[data-h="vis-ordet"]');
  const hint4 = await trygge(await hemmelig(), SETT.tre.slice(2).concat(SETT.tre.slice(0, 2)));
  await t.klikk('[data-h="skriv"]');
  await t.klikk('[data-h="jeg-er"]');
  await t.skrivInn("#hint-1", hint4[0]);
  await t.klikk(SEND);
  await t.klikk('[data-h="jeg-er"]');
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".skjerm-gi"), "Omlasting på skriveskjermen viste ikke porten «Gi mobilen til»");
  t.sjekk((await t.tilstand()).spill.r.hint.length === 1, "Hintet forsvant ved omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens et spill pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('.hjem-knapper [data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» spør ikke før det pågående spillet forsvinner");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om man valgte Avbryt");
  await t.klikk('[data-h="fortsett"]');
  t.sjekk(await t.finnes(".skjerm-gi"), "«Fortsett» gikk ikke tilbake til riktig hintgiver");
  for (const h of hint4.slice(1)) {
    await t.klikk('[data-h="jeg-er"]');
    await t.skrivInn("#hint-1", h);
    await t.klikk(SEND);
  }
  // Reload on the check screen → the guesser-looks-away gate, then straight back to the hints
  await t.vent("document.querySelector('.skjerm-sjekk')");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".skjerm-runde"), "Omlasting på sjekkskjermen viste ikke porten");
  t.sjekk(/hintene/.test(await t.tekst('[data-h="vis-ordet"]')), "Porten sier ikke at hintene vises");
  await t.klikk('[data-h="vis-ordet"]');
  t.sjekk(await t.finnes(".skjerm-sjekk"), "Porten gikk ikke tilbake til sjekkskjermen");
  await t.klikk('[data-h="til-gjetter"]');
  await t.klikk('[data-h="jeg-gjetter"]');
  await t.klikk('[data-h="sjekk-svar"]');
  await t.klikk('[data-h="riktig"]');
  await t.klikk('[data-h="neste"]');

  // ---------- Every hint the same: all struck, the guesser gets nothing ----------
  await t.klikk('[data-h="vis-ordet"]');
  const hint5 = await trygge(await hemmelig(), SETT.alleLike);
  await t.klikk('[data-h="skriv"]');
  for (const h of hint5) {
    await t.klikk('[data-h="jeg-er"]');
    await t.skrivInn("#hint-1", h);
    await t.klikk(SEND);
  }
  t.sjekk(/alle hintene er strøket/i.test(await t.tekst(".dokk")), "Sjekkskjermen sier ikke at alle hint er strøket");
  await t.klikk('[data-h="til-gjetter"]');
  t.sjekk(/ingen hint/i.test(await t.tekst(".gi-til")), "Gjetteren får ikke vite at ingen hint overlevde");
  await t.klikk('[data-h="jeg-gjetter"]');
  t.sjekk(await t.finnes(".skjerm-gjett .tom"), "Gjetteskjermen viser ikke at alle hint ble strøket");
  await t.bilde("gjett-tomt");
  await t.klikk('[data-h="pass"]');
  await t.klikk('[data-h="neste"]');

  // ---------- Play out the deck ----------
  for (let n = 0; n < 10 && !(await t.finnes(".skjerm-slutt")); n++) await spillRunde(SETT.tre, "riktig");
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  await t.bilde("slutt", true);
  s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.spill.logg.length + s.spill.tapt === 8, "Spillet stoppet ikke etter 8 kort");
  t.sjekk((await t.tekst(".banner")).toLowerCase().includes(`${s.spill.poeng} av 8`), "Resultatet viser ikke poengene");
  t.sjekk((await t.antall(".hv-logg li")) === s.spill.logg.length, "Ordlista på slutten mangler ord");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");

  // ---------- Three players: two hints each ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="3"]');
  t.sjekk(/to hint/.test(await t.tekst("#spillerboks")), "Oppsettet forklarer ikke to hint for tre spillere");
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="vis-ordet"]');
  const to = await trygge(await hemmelig(), SETT.toHver);
  await t.klikk('[data-h="skriv"]');
  await t.klikk('[data-h="jeg-er"]');
  t.sjekk(await t.finnes("#hint-2"), "Tre spillere skulle gi to hint hver");
  await t.skrivInn("#hint-1", to[0]);
  await t.skrivInn("#hint-2", to[1]);
  await t.klikk(SEND);
  t.sjekk(/allerede/.test(await t.tekst("#hint-feil")), "Samme hint to ganger ble godtatt");
  await t.skrivInn("#hint-2", to[2]);
  await t.bilde("skriv-to");
  await t.klikk(SEND);
  await t.klikk('[data-h="jeg-er"]');
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
}
