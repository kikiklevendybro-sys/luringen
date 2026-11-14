// Makkeren (Amerikaner): setup («Gjør klart»: three levels, 26 or 52); a deal where you bid first:
// the bid buttons (7–13, Amerikaner, Pass), you bid 13 and the phones pass; you name hearts as trumps
// and call hjerter ess; only trumps may be led; the holder of the ace must play it and is shown as the
// makker; only legal cards can be played (follow suit); the phones play by themselves (never behind a
// sheet, also after a reload); «Meldingene» and «Siste stikk»; a whole round → the round's points;
// the last trick of a match → «Kåringen» with the podium, the record and the sticker.
// Runs in every edition (texts are checked in Norwegian only).

const C = (s, v) => s * 13 + v - 1; // 0 spar, 1 hjerter, 2 ruter, 3 kløver; 1 = ess

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const lagret = () => `JSON.parse(localStorage.getItem('${t.nokkel("makkeren.v1")}')).spill`;
  const lastMed = async (endring) => {
    await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
  };
  const spillRunde = async (maks = 400) => {
    for (let n = 0; n < maks; n++) {
      const s = await sp();
      if (s.r.fase === "ferdig") return s;
      const gjort = await t.js(`(() => { const b = document.querySelector('.ma-hand.min-tur .ma-hk.lovlig'); if (b) { b.click(); return 1; } return 0; })()`);
      await t.sov(gjort ? 200 : 250);
    }
    return sp();
  };

  // A deal: seat 0 has nine hearts and three aces; the hearts ess, konge, dame and knekt are spread.
  const hender = [[], [], [], []];
  for (let v = 2; v <= 10; v++) hender[0].push(C(1, v));
  hender[0].push(C(0, 1), C(0, 13), C(2, 1), C(3, 1));
  const resten = [];
  for (let k = 0; k < 52; k++) if (!hender[0].includes(k) && ![C(1, 1), C(1, 11), C(1, 12), C(1, 13)].includes(k)) resten.push(k);
  hender[1] = [C(1, 13)].concat(resten.slice(0, 12));
  hender[2] = [C(1, 1)].concat(resten.slice(12, 24));
  hender[3] = [C(1, 12), C(1, 11)].concat(resten.slice(24, 35));

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ma-hk').length === 13");
  let s = await sp();
  t.sjekk(s.niva === 2 && s.mal === "52" && s.r.hender.every((h) => h.length === 13) && s.r.fase === "melding", "Første runde er ikke 13 kort hver og melding på middels, til 52");

  // ---------- Bidding ----------
  await lastMed(`(S) => {
    const r = S.spill.r;
    S.spill.giver = 3;
    S.spill.omgjort = 0;
    Object.assign(r, { giver: 3, tur: 0, hender: ${JSON.stringify(hender)}, meldinger: [], passet: [false, false, false, false], hoyest: null, fase: "melding" });
  }`);
  t.sjekk((await t.antall('.ma-budknapp:not([disabled])')) === 7 && (await t.finnes('[data-h="meld"][data-v="0"]:not([disabled])')) && (await t.finnes('[data-h="meld"][data-v="14"]:not([disabled])')), "Meldeknappene 7–13, Pass og Amerikaner er ikke klare");
  t.sjekk(await t.friForDokk(".ma-bord"), "Bordet ligger bak handlingsfeltet under meldingen");
  await t.bilde("melding");
  await t.klikk('[data-h="meld"][data-v="13"]', 300);
  await t.vent(`${lagret()}.r.fase !== "melding"`, 12000);
  s = await sp();
  t.sjekk(s.r.fase === "velg" && s.r.spillforer === 0 && s.r.bud === 13, `Du fikk ikke meldingen på 13: ${s.r.fase}`);
  await t.klikk('[data-h="meldinger"]', 300);
  t.sjekk((await t.antall("#ark .ma-meldinger li")) === 4, "«Meldingene» viser ikke fire meldinger");
  await t.klikk('#ark [data-h="lukk-ark"]', 200);

  // ---------- Trumps and the card asked for ----------
  t.sjekk(await t.finnes('.dokk [data-h="bekreft"][disabled]'), "Du kan spørre etter et kort før trumf er valgt");
  await t.klikk('[data-h="trumf"][data-v="1"]', 300);
  t.sjekk(await t.finnes(`.ma-sporkort[data-v="${C(1, 1)}"][aria-pressed="true"]`), "Hjerter ess er ikke valgt som kortet du spør etter");
  await t.bilde("velg-trumf");
  await t.klikk('.dokk [data-h="bekreft"]', 300);
  s = await sp();
  t.sjekk(s.r.fase === "spill" && s.r.trumf === 1 && s.r.spurt === C(1, 1) && s.r.makker === 2 && !s.r.avslort, "Trumf og makker ble ikke satt");
  const lov = await t.js(`Array.from(document.querySelectorAll('.ma-hk.lovlig')).map((b) => Number(b.dataset.v))`);
  t.sjekk(lov.length === 9 && lov.every((k) => Math.floor(k / 13) === 1), "Første utspill er ikke bare trumf");
  await t.klikk(`.ma-hk[data-v="${C(0, 1)}"]`, 250);
  t.sjekk((await sp()).r.hender[0].includes(C(0, 1)), "Et kort som ikke kan legges, ble lagt");
  await t.klikk(`.ma-hk[data-v="${C(1, 2)}"]`, 300);
  await t.vent(`${lagret()}.r.avslort === true`, 12000);
  await t.sov(300);
  t.sjekk(await t.finnes(".ma-rolle.mk") || (await sp()).r.spilt.length === 1, "Makkeren vises ikke etter at esset er lagt");
  await t.bilde("makker");

  // A reload keeps the round; the phones never play behind the rules.
  await t.lastSide(t.side, "document.querySelector('.ma-hand')");
  s = await sp();
  t.sjekk(s.r.avslort && s.r.hender[0].length === 12, "Runden ble ikke gjenopprettet etter omlasting");
  if (s.r.tur !== 0) {
    const for0 = s.r.hender.reduce((a, h) => a + h.length, 0);
    await t.klikk("#reglerknapp", 100);
    await t.sov(2200);
    t.sjekk((await sp()).r.hender.reduce((a, h) => a + h.length, 0) === for0, "Mobilene spilte mens reglene var åpne");
    await t.bilde("regler", true);
    await t.klikk('#ark [data-h="lukk-ark"]');
  }
  // The rest of the round.
  s = await spillRunde();
  t.sjekk(s.r.fase === "ferdig" && s.lagt, "Runden ble ikke ferdig");
  t.sjekk(s.r.tatt.reduce((a, b) => a + b, 0) === 13, "Stikkene i runden er ikke 13");
  const forventet = s.r.tatt[0] + s.r.tatt[2] >= 13 ? 13 : -13;
  t.sjekk(s.r.resultat.poeng[0] === forventet && s.r.resultat.poeng[2] === forventet && s.r.resultat.poeng[1] === s.r.tatt[1], `Poengene er feil: ${s.r.resultat.poeng.join(", ")}`);
  await t.sov(1500);
  await t.klikk('.dokk [data-h="poeng"]', 400);
  await t.vent("document.querySelector('.ma-resultat')");
  t.sjekk((await t.antall(".ma-resultat li")) === 4 && (await t.antall(".ma-resultat li.lag")) === 2, "Resultatet viser ikke alle fire og laget som meldte");
  await t.bilde("runde-ferdig", true);
  await t.klikk('.dokk [data-h="ny-runde"]', 400);
  s = await sp();
  t.sjekk(s.runde === 2 && s.r.fase === "melding" && s.r.giver === 0, "Runde 2 starter ikke med neste giver og melding");
  // Home: «Fortsett» while the match runs.
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ma-hand')");

  // ---------- The last trick of a match: you win it as a defender and reach 52 ----------
  const sist = [C(1, 1), C(1, 2), C(1, 3), C(1, 4)]; // hjerter ess for you, low hearts for the phones
  const andre = [];
  for (let k = 0; k < 52; k++) if (!sist.includes(k) && k !== C(0, 1)) andre.push(k);
  const vinnere = [3, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3]; // tricks so far: you 4, Mobil 1 3, Mobil 2 2, Mobil 3 3
  const spilt = [];
  for (let i = 0; i < 12; i++) {
    const kort = i === 0 ? [C(0, 1)].concat(andre.splice(0, 3)) : andre.splice(0, 4);
    spilt.push({ kort: kort.map((k, p) => ({ p: i === 0 ? (p + 3) % 4 : p, k })), vinner: vinnere[i] });
  }
  await lastMed(`(S) => {
    const sp = S.spill;
    sp.poeng = [48, 20, 30, 15];
    sp.lagt = false;
    Object.assign(sp.r, { fase: "spill", giver: 0, spillforer: 1, bud: 7, trumf: 0, spurt: ${C(0, 1)}, makker: 3, avslort: true,
      hender: ${JSON.stringify(sist.map((k) => [k]))}, stikk: [], spilt: ${JSON.stringify(spilt)}, tatt: [4, 3, 2, 3], stikkNr: 12, tur: 0, resultat: null });
  }`);
  t.sjekk(await t.finnes(`.ma-hk.lovlig[data-v="${C(1, 1)}"]`), "Hjerter ess kan ikke spilles ut i siste stikk");
  await t.klikk(`.ma-hk[data-v="${C(1, 1)}"]`, 300);
  await t.vent(`${lagret()}.r.fase === "ferdig"`, 12000);
  s = await sp();
  t.sjekk(s.r.resultat.poeng.join() === "5,-7,2,-7", `Rundens poeng er feil: ${s.r.resultat.poeng.join(", ")}`);
  t.sjekk(s.poeng.join() === "53,13,32,8", `Stillingen er feil: ${s.poeng.join(", ")}`);
  await t.sov(1500);
  await t.klikk('.dokk [data-h="poeng"]', 400);
  await t.vent("document.querySelector('.ma-resultat')");
  t.sjekk(!t.norsk || /Du vinner kampen!/.test(await t.tekst("#skjerm h1")), "Rundeskjermen sier ikke at du vant kampen");
  await t.klikk('.dokk [data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(!t.norsk || /Du vinner!/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke at du vant");
  const st = await t.tilstand();
  t.sjekk(st.rekord[2] && st.rekord[2].seier === 1, "Seieren ble ikke telt i rekorden");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(merker["klassiker-makkeren"], "Klistremerket for å slå mobilene ble ikke gitt");
  t.sjekk(await t.finnes('.dokk [data-h="del"]') && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler «Del resultatet» eller «Alle spill»");
  await t.bilde("kaaringen", true);
  await t.klikk("#tilbake", 300);
  t.sjekk(await t.finnes(".ma-rekorder"), "Rekorden mot mobilene vises ikke på hjem");

  // ---------- A new match at Vanskelig, to 26: a few moves, «Siste stikk», then «Avslutt» ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="mal"][data-v="26"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.ma-hand')");
  s = await sp();
  t.sjekk(s.niva === 3 && s.mal === "26", "Oppsettet ble ikke vanskelig, til 26");
  for (let n = 0; n < 120 && (await sp()).r.spilt.length < 2; n++) {
    const r = (await sp()).r;
    if (r.fase === "melding" && r.tur === 0) await t.js(`document.querySelector('[data-h="meld"][data-v="0"]').click()`);
    else if (r.fase === "velg" && r.spillforer === 0) {
      await t.js(`document.querySelector('[data-h="trumf"]:not([disabled])').click()`);
      await t.sov(150);
      await t.js(`document.querySelector('.dokk [data-h="bekreft"]').click()`);
    } else await t.js(`(() => { const b = document.querySelector('.ma-hand.min-tur .ma-hk.lovlig'); if (b) b.click(); })()`);
    await t.sov(300);
  }
  await t.bilde("vanskelig");
  if ((await sp()).r.spilt.length) {
    await t.vent(`document.querySelector('.dokk [data-h="siste"]')`, 8000);
    await t.klikk('.dokk [data-h="siste"]', 300);
    t.sjekk((await t.antall("#ark .ma-siste li")) === 4, "«Siste stikk» viser ikke fire kort");
    await t.klikk('#ark [data-h="lukk-ark"]');
  }
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.sov(400);
  t.sjekk(await t.finnes(".spillhjem"), "Å avslutte i første runde går ikke hjem");
}
