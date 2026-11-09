// Tieren: three players over three rounds – pick an answer and change your mind, a right and a
// wrong answer (the pot bursts), «Stopp» with «Angre», the last player stops and the round ends
// with every answer shown, reload mid-round and during a reveal, back + continue, «Nytt spill»
// asks, the crowning with the answer key, small phones (question and ring above the action area,
// the answer pad in reach) and «Avslutt» before any round is done.
export default async function (t) {
  const spill = async () => (await t.tilstand()).spill;
  const [B0, H0] = await t.js("[window.innerWidth, window.innerHeight]");

  // The right answer (as the button's data-v) for a ring position, and one that is wrong.
  const fasit = (pos) =>
    t.js(`(() => {
      const sp = JSON.parse(localStorage.getItem("rusj.tieren.v1")).spill;
      const D = window.RUSJ_DATA, alle = [];
      Object.keys(D).filter((n) => n.startsWith("kort-")).sort().forEach((n) => D[n].forEach((k) => alle.push(k)));
      return String(alle[sp.kort[sp.runde]].a[sp.ring[${pos}]][1]);
    })()`);
  const feil = async (pos) => {
    const riktig = await fasit(pos);
    const alle = await t.js(`Array.from(document.querySelectorAll('[data-h="svar"]')).map((b) => b.dataset.v)`);
    return alle.find((v) => v !== riktig);
  };
  // The first free answer on the ring.
  const ledig = () => t.js(`(() => { const sp = JSON.parse(localStorage.getItem("rusj.tieren.v1")).spill; return sp.apne.findIndex((a) => !a); })()`);
  const velg = async (pos) => {
    await t.klikk(`.ti-brikke[data-h="velg"][data-v="${pos}"]`, 200);
    await t.vent(`document.querySelector('[data-h="svar"]')`);
  };
  // Answer the chosen one, right or wrong, and wait until the reveal is over.
  async function svar(riktig) {
    const pos = (await spill()).valgt;
    const v = riktig ? await fasit(pos) : await feil(pos);
    await t.klikk(`[data-h="svar"][data-v=${JSON.stringify(v)}]`, 100);
    await t.vent(`!document.querySelector('[data-h="svar"]') && !document.querySelector('.ti-utfall')`, 6000);
    await t.sov(250);
  }
  const underDokka = (sel) =>
    t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const d = document.querySelector("#skjerm .dokk"); if (!el || !d) return 999; const dt = Array.from(d.children).reduce((m, c) => Math.min(m, c.getBoundingClientRect().top), Infinity); return Math.round(el.getBoundingClientRect().bottom - dt); })()`);

  // ---------- Setup ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke tre spillere");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skal være av uten kategorier");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  await t.klikk('[data-h="runder"][data-v="3"]');
  t.sjekk((await t.tilstand()).oppsett.runder === 3, "Antall runder ble ikke 3");

  // ---------- Round 1 ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.ti-ring')");
  let sp = await spill();
  t.sjekk(sp.kort.length === 3 && new Set(sp.kort).size === 3, "Spillet skal ha tre ulike kort");
  t.sjekk((await t.antall('.ti-brikke[data-h="velg"]')) === 10, "Ringen viser ikke ti svar");
  t.sjekk((await t.antall("#skjerm h1")) === 1, "Ringskjermen skal ha nøyaktig én h1");
  t.sjekk(/Testspiller A/.test(await t.tekst(".ti-midt")), "Testspiller A skal begynne");
  await t.bilde("ring");

  // Pick, change your mind, pick again
  await velg(0);
  t.sjekk((await spill()).valgt === 0 && (await t.finnes('.ti-brikke[data-v="0"][aria-pressed="true"]')), "Valget vises ikke på ringen");
  await t.klikk('.dokk [data-h="velg"]');
  t.sjekk((await spill()).valgt === null && !(await t.finnes('[data-h="svar"]')), "«Velg et annet svar» skal slippe valget");
  await velg(0);
  await t.bilde("valgt");
  await svar(true);
  sp = await spill();
  t.sjekk(sp.pott[0] === 1 && sp.tur === 1 && sp.apne[0] && sp.apne[0].riktig, "Riktig svar ga ikke 1 i potten, eller turen gikk ikke videre");
  t.sjekk(await t.finnes(".ti-brikke.ti-p0.riktig"), "Svaret vises ikke som riktig på ringen");
  await t.bilde("riktig");

  // Testspiller B answers wrong: out of the round
  await velg(await ledig());
  await svar(false);
  sp = await spill();
  t.sjekk(sp.status[1] === "ute" && sp.pott[1] === 0 && sp.tur === 2, "Feil svar skulle sende Testspiller B ut av runden");
  t.sjekk(await t.finnes(".ti-brikke.feil"), "Feil svar vises ikke på ringen");
  await t.bilde("feil");

  // Testspiller C right, then Testspiller A stops (and undoes it)
  await velg(await ledig());
  await svar(true);
  sp = await spill();
  t.sjekk(sp.pott[2] === 1 && sp.tur === 0, "Turen skulle gå tilbake til Testspiller A");
  t.sjekk(/Stopp/.test(await t.tekst("#ti-stopp")), "Mangler «Stopp» når potten ikke er tom");
  await t.klikk("#ti-stopp", 20);
  await t.js(`document.querySelector("#ti-stopp") && document.querySelector("#ti-stopp").click()`); // a double tap
  await t.sov(150);
  sp = await spill();
  t.sjekk(sp.status[2] === "med", "Et dobbelttrykk på «Stopp» stoppet også nestemann");
  t.sjekk(sp.status[0] === "stopp" && sp.tur === 2, "«Stopp» ga ikke turen videre");
  t.sjekk(await t.finnes('[data-h="angre"]'), "Mangler «Angre» etter «Stopp»");
  await t.bilde("stopp");
  await t.klikk('[data-h="angre"]');
  sp = await spill();
  t.sjekk(sp.status[0] === "med" && sp.tur === 0, "«Angre» tok ikke tilbake «Stopp»");
  await t.klikk("#ti-stopp");
  await t.klikk('[data-h="stilling"]');
  t.sjekk((await t.antall("#ark:not([hidden]) .poengliste li")) === 3, "Stillingen viser ikke tre spillere");
  await t.bilde("stillingen");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Testspiller C is alone: stopping ends the round, so the game asks first
  await t.klikk("#ti-stopp");
  t.sjekk(await t.finnes("#ark:not([hidden])"), "Siste spiller som stopper, skal få et spørsmål først");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.ti-oppsummering')");
  await t.sov(900);
  sp = await spill();
  t.sjekk(sp.fase === "ferdig" && sp.sum.join(",") === "1,0,1", `Poengene etter runde 1 er feil: ${sp.sum.join(",")}`);
  t.sjekk((await t.antall(".ti-brikke.fasit")) === 7, "Svarene ingen tok, skal vises når runden er over");
  t.sjekk(/Neste runde/.test(await t.tekst("#ti-neste")), "Mangler «Neste runde»");
  await t.bilde("runde-slutt", true);

  // ---------- Round 2: Testspiller B begins; reloads and back + continue ----------
  await t.klikk("#ti-neste");
  await t.vent("document.querySelector('.ti-brikke[data-h=\"velg\"]')");
  sp = await spill();
  t.sjekk(sp.runde === 1 && sp.tur === 1, "Runde 2 skal begynne med Testspiller B");
  await velg(await ledig());
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await spill()).valgt !== null && (await t.finnes('[data-h="svar"]')), "Valget ble borte etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(/runde 2 av 3/i.test(await t.tekst('.hjem-knapper .knapp[data-h="fortsett"]')), "«Fortsett» skal være hovedknappen mens et spill pågår");
  await t.bilde("hjem-pagar");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» skal spørre før spillet forsvinner");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`document.querySelector('[data-h="svar"]')`);
  // A reload during the reveal must not give a second try
  const pos = (await spill()).valgt;
  await t.klikk(`[data-h="svar"][data-v=${JSON.stringify(await feil(pos))}]`, 200);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  sp = await spill();
  t.sjekk(sp.apne[pos] && sp.status[1] === "ute" && sp.valgt === null, "En omlasting under avsløringen skal ikke gi et nytt forsøk");
  // Testspiller C and A: A takes one right and stops
  await velg(await ledig());
  await svar(false); // C out
  await velg(await ledig());
  await svar(true); // A +1, alone
  await t.klikk("#ti-stopp");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.ti-oppsummering')");
  sp = await spill();
  t.sjekk(sp.sum.join(",") === "2,0,1", `Poengene etter runde 2 er feil: ${sp.sum.join(",")}`);

  // ---------- Round 3: everybody misses; the crowning ----------
  await t.klikk("#ti-neste");
  await t.vent("document.querySelector('.ti-brikke[data-h=\"velg\"]')");
  for (let n = 0; n < 3; n++) {
    await velg(await ledig());
    await svar(false);
  }
  await t.vent("document.querySelector('.ti-oppsummering')");
  t.sjekk(/Til kåringen/.test(await t.tekst("#ti-neste")), "Siste runde skal ende med «Til kåringen»");
  await t.klikk("#ti-neste");
  await t.vent("document.querySelector('.pall')");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk(/Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), `Vinnerlinjen er feil: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Slutten mangler lenken «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  t.sjekk(kveld && kveld.spill.some((s) => s.id === "tieren"), "Resultatet kom ikke med i «Kveldens gjeng»");
  await t.sov(2000);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.bilde("slutt", true);
  await t.klikk('[data-h="fasit"]');
  t.sjekk((await t.antall("#ark .ti-fasit")) === 3 && (await t.antall("#ark .ti-fasit-liste li")) === 30, "Fasiten viser ikke tre runder med ti svar");
  await t.bilde("fasit");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="resultat"]'), "Hjem-skjermen mangler «Se kåringen» etter et ferdig spill");

  // ---------- Small phones ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.ti-ring')");
  for (const [b, h] of [[320, 568], [375, 560]]) {
    const navn = `${b}x${h}`;
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
    await t.js("window.scrollTo(0, 0)");
    t.sjekk((await underDokka(".ti-kort")) <= 0, `${navn}: spørsmålet skal synes over knappene`);
    t.sjekk((await underDokka(".ti-p2")) <= 0, `${navn}: midten av ringen skal synes over knappene`);
    const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Siden er ${bred}px for bred på ${navn}`);
    if (b <= B0) await t.bilde(`${navn}-ring`);
    await velg(await ledig());
    await t.js("window.scrollTo(0, 0)");
    await t.sov(300);
    const synlig = await t.js(`(() => {
      const ark = document.querySelector("#skjerm .dokk").getBoundingClientRect();
      const valgt = document.querySelector(".ti-midt-valgt").getBoundingClientRect();
      const knapper = Array.from(document.querySelectorAll('[data-h="svar"]')).every((b) => b.getBoundingClientRect().bottom <= window.innerHeight + 1);
      return knapper && valgt.bottom <= ark.top && document.querySelector(".ti-kort").getBoundingClientRect().top >= 0;
    })()`);
    t.sjekk(synlig, `${navn}: spørsmålet, valget og alle svarknappene skal synes samtidig`);
    if (b <= B0) await t.bilde(`${navn}-valgt`);
    await svar(true);
    if (b <= B0) await t.bilde(`${navn}-svar`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: B0, height: H0, deviceScaleFactor: 2, mobile: true });
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");

  // ---------- «Avslutt» before any round is done: no crowning ----------
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(/Avslutt/.test(await t.tekst('[data-h="avslutt"]')), "Lenken for å avslutte skal bare hete «Avslutt»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await t.tilstand()).spill === null, "Avslutt uten ferdige runder skal ta spillet bort");
}
