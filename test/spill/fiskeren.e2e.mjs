// Fiskeren (Kasino): setup («Gjør klart»: one to three phones, three levels, 11 or 21), four cards
// each and four on the table; a card from the hand lights up what it can take; «Ta» without a choice
// takes as much as it can (same rank and a sum at once); a build of 8 (and «Legg ut» refused while you
// own it); a tabbe; an impossible choice leaves «Ta» and «Bygg» off; the phones play by themselves
// (never behind a sheet, also after a reload); the last cards of a round → the round's points table
// → «Kåringen» with the podium, the record and the sticker; three phones round the table.
// Runs in every edition (texts are checked in Norwegian only).

const C = (s, v) => s * 13 + v - 1; // 0 spar, 1 hjerter, 2 ruter, 3 kløver
const L = (k) => ({ t: "k", k });

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const lagret = () => `JSON.parse(localStorage.getItem('${t.nokkel("fiskeren.v1")}')).spill`;
  const lastMed = async (endring) => {
    await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
  };
  // A position for seat 0 to move in: the given hand and table, everything else in the deck or taken.
  const still = async ({ hand, mobil, bord, bunke = true }) => {
    const brukt = new Set([...hand, ...mobil, ...bord.flatMap((x) => (x.t === "b" ? x.kort : [x.k]))]);
    const rest = [];
    for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
    await lastMed(`(S) => {
      const r = S.spill.r;
      r.hender = [${JSON.stringify(hand)}, ${JSON.stringify(mobil)}];
      r.bord = ${JSON.stringify(bord)};
      r.bunke = ${bunke ? JSON.stringify(rest) : "[]"};
      r.tatt = [[], ${bunke ? "[]" : JSON.stringify(rest)}];
      r.tabber = [0, 0];
      r.tur = 0; r.fase = "spill"; r.sist = null; r.sisteTaker = -1;
      S.spill.valgt = null;
    }`);
  };
  const minTur = () => t.vent(`(() => { const s = ${lagret()}; return s.r.tur === 0 || s.r.fase !== "spill"; })()`, 15000);

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.ka-hk').length === 4");
  let s = await sp();
  t.sjekk(s.antall === 2 && s.niva === 2 && s.mal === "21" && s.r.bord.length === 4 && s.r.hender.every((h) => h.length === 4), "Første runde er ikke fire kort hver og fire på bordet mot én mobil på middels, til 21");
  t.sjekk(await t.friForDokk(".ka-hand"), "Hånda ligger bak handlingsfeltet");
  await minTur();
  await t.bilde("start");

  // ---------- Taking: same rank and a sum at once ----------
  await still({ hand: [C(0, 7), C(1, 3), C(3, 8), C(2, 13)], mobil: [C(1, 9), C(2, 6), C(3, 12), C(0, 11)], bord: [L(C(1, 7)), L(C(2, 4)), L(C(3, 3)), L(C(0, 5))] });
  t.sjekk(await t.finnes('.dokk [data-h="ta"][disabled]'), "«Ta» kan trykkes før et kort er valgt");
  await t.klikk(`.ka-hk[data-v="${C(0, 7)}"]`, 200);
  t.sjekk((await t.antall(".ka-ting.kan")) === 3, "Kortene 7-eren kan ta, lyser ikke opp");
  await t.bilde("velger");
  // A card it cannot take: «Ta» and «Bygg» stay off.
  await t.klikk(`.ka-ting[data-v="3"]`, 200);
  t.sjekk(await t.finnes('.dokk [data-h="ta"][disabled]'), "«Ta» kan trykkes med et kort som ikke kan tas");
  await t.klikk(`.ka-ting[data-v="3"]`, 200);
  await t.klikk('.dokk [data-h="ta"]', 400);
  s = await sp();
  t.sjekk(s.r.tatt[0].length === 4 && s.r.bord.length === 1, "«Ta» tok ikke 7-eren og 4 + 3");
  t.sjekk(!t.norsk || /Du tok 3 kort med spar sju/.test(await t.tekst(".ka-melding")), "Meldingen sier ikke hva du tok");
  // The phone plays by itself.
  await minTur();
  s = await sp();
  t.sjekk(s.r.hender[1].length === 3, "Mobilen spilte ikke");

  // ---------- A build of 8, and no laying out while you own it ----------
  await still({ hand: [C(1, 3), C(3, 8), C(2, 13), C(2, 1)], mobil: [C(1, 9), C(2, 6), C(3, 12), C(0, 11)], bord: [L(C(0, 5)), L(C(1, 12)), L(C(3, 10))] });
  await t.klikk(`.ka-hk[data-v="${C(1, 3)}"]`, 150);
  await t.klikk(`.ka-ting[data-v="0"]`, 150);
  t.sjekk(!t.norsk || /bygg 8/.test(await t.tekst(".ka-melding")), "Meldingen sier ikke at du kan bygge 8");
  await t.klikk('.dokk [data-h="bygg"]', 400);
  s = await sp();
  const b = s.r.bord.find((x) => x.t === "b");
  t.sjekk(b && b.verdi === 8 && b.eier === 0 && b.kort.length === 2, "Bygg 8 ble ikke laget");
  t.sjekk(await t.finnes(".ka-bygg.min"), "Bygget ditt vises ikke");
  await t.bilde("bygg");
  await minTur();
  s = await sp();
  if (s.r.bord.some((x) => x.t === "b" && x.eier === 0)) {
    await t.klikk(`.ka-hk[data-v="${C(2, 13)}"]`, 150);
    t.sjekk(await t.finnes('.dokk [data-h="legg"][disabled]'), "«Legg ut» kan trykkes mens du eier et bygg");
    await t.klikk(`.ka-hk[data-v="${C(2, 13)}"]`, 150);
  }

  // ---------- A tabbe ----------
  await still({ hand: [C(0, 9), C(1, 2)], mobil: [C(1, 9), C(2, 6)], bord: [L(C(2, 4)), L(C(3, 5))] });
  await t.klikk(`.ka-hk[data-v="${C(0, 9)}"]`, 150);
  await t.klikk('.dokk [data-h="ta"]', 400);
  s = await sp();
  t.sjekk(s.r.tabber[0] === 1 && s.r.bord.length === 0, "Å ta hele bordet ga ingen tabbe");
  t.sjekk(!t.norsk || /Tabbe!/.test(await t.tekst(".ka-melding")), "Meldingen sier ikke «Tabbe!»");
  await t.bilde("tabbe");
  // A reload keeps the round; the phone never plays behind the rules.
  await t.lastSide(t.side, "document.querySelector('.ka-hand')");
  t.sjekk((await sp()).r.tabber[0] === 1, "Runden ble ikke gjenopprettet etter omlasting");
  s = await sp();
  if (s.r.tur !== 0 && s.r.fase === "spill") {
    const for0 = s.r.hender[1].length;
    await t.klikk("#reglerknapp", 100);
    await t.sov(2600);
    t.sjekk((await sp()).r.hender[1].length === for0, "Mobilen spilte mens reglene var åpne");
    await t.bilde("regler", true);
    await t.klikk('#ark [data-h="lukk-ark"]');
  }
  await minTur();
  await t.klikk('[data-h="hjelp"]', 300);
  t.sjekk(await t.finnes("#ark .ka-forklar li"), "«Bordet forklart» viser ingen forklaring");
  await t.klikk('#ark [data-h="lukk-ark"]', 200);

  // ---------- The end of the round and of the match ----------
  await lastMed(`(S) => { S.spill.poeng = [19, 3]; }`);
  await still({ hand: [C(0, 1)], mobil: [C(1, 6)], bord: [L(C(1, 1)), L(C(2, 13))], bunke: false });
  await t.klikk(`.ka-hk[data-v="${C(0, 1)}"]`, 150);
  await t.klikk('.dokk [data-h="ta"]', 400);
  await t.vent(`${lagret()}.r.fase === "ferdig"`, 10000);
  await t.sov(300);
  t.sjekk(await t.finnes('.dokk [data-h="poeng"]'), "Runden er ferdig, men «Se rundens poeng» mangler");
  await t.klikk('.dokk [data-h="poeng"]', 400);
  await t.vent("document.querySelector('.ka-tabell')");
  s = await sp();
  t.sjekk(s.lagt && s.r.resultat.poeng.reduce((a, b) => a + b, 0) >= 7, "Rundens poeng ble ikke regnet ut");
  t.sjekk(s.poeng[0] >= 21, `Du skulle ha nådd 21: ${s.poeng.join("–")}`);
  await t.bilde("rundens-poeng", true);
  await t.klikk('.dokk [data-h="kaaring"]', 400);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(!t.norsk || /Du vinner!/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke at du vant");
  const st = await t.tilstand();
  t.sjekk(st.rekord[2] && st.rekord[2].seier === 1, "Seieren ble ikke telt i rekorden");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(merker["klassiker-fiskeren"], "Klistremerket for å slå mobilen ble ikke gitt");
  t.sjekk(await t.finnes('.dokk [data-h="del"]') && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler «Del resultatet» eller «Alle spill»");
  await t.bilde("kaaringen", true);
  await t.klikk("#tilbake", 300);
  t.sjekk(await t.finnes(".ka-rekorder"), "Rekorden mot mobilen vises ikke på hjem");

  // ---------- Three phones at Vanskelig, to 11 ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="motstandere"][data-v="3"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="mal"][data-v="11"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.ka-hand')");
  s = await sp();
  t.sjekk(s.antall === 4 && s.niva === 3 && s.mal === "11" && (await t.antall(".ka-sete")) === 3, "Oppsettet ble ikke tre mobiler på vanskelig, til 11");
  t.sjekk(await t.friForDokk(".ka-hand"), "Hånda ligger bak handlingsfeltet med tre mobiler");
  await minTur();
  await t.bilde("tre-mobiler");
  // Play a few turns: the first card, laid out or taken.
  for (let n = 0; n < 3; n++) {
    await minTur();
    s = await sp();
    if (s.r.fase !== "spill") break;
    await t.js(`document.querySelector('.ka-hk').click()`);
    await t.sov(150);
    const ta = await t.finnes('.dokk [data-h="ta"]:not([disabled])');
    await t.klikk(ta ? '.dokk [data-h="ta"]' : '.dokk [data-h="legg"]', 300);
  }
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.sov(400);
  t.sjekk(await t.finnes(".spillhjem"), "Å avslutte i første runde går ikke hjem");
}
