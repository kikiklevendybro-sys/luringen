// Golfballen (card golf): six cards against the phone — turn two to begin, draw and swap, take a
// discard, the phone answering, a reload with a card in hand, an arranged last card that gives the
// phone one more turn, the hole's points and «Neste hull», «Fortsett» on home, «Avslutt» → «Kåringen»;
// four cards against the phone over one hole — look at the bottom two, knock, the record, the sticker
// and «Del resultatet»; then two people on one phone: six cards without a gate (everything is open)
// over a whole hole to «Kåringen» and «Kveldens gjeng», and four cards with a gate before every turn.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en golfballen): the texts are checked in
// Norwegian only (t.norsk); elsewhere the names, the state and the links (t.forside, t.nokkel).

// Card number: suit 0 spar, 1 hjerter, 2 ruter, 3 kløver; value 1 (ess) … 13 (konge).
const K = (s, v) => s * 13 + v - 1;

// Lay out a hole exactly (player 0 to play, past the start): grids (face up where `opp` says),
// the discards (top last) and the next cards of the draw pile in order.
const ORDNE = `(S, o) => {
  const r = S.spill.r;
  const n = o.nett.length;
  const brukt = new Set([].concat(...o.nett, o.kast || [], o.stokk || []));
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  r.rutenett = o.nett.map((g, p) => g.map((k, i) => ({ k, opp: !!(o.opp && o.opp[p] && o.opp[p][i]) })));
  r.kjent = r.rutenett.map((g) => g.map((c) => c.opp));
  r.offentlig = r.rutenett.map((g) => g.map(() => false));
  r.kast = (o.kast || []).slice();
  r.stokk = rest.concat((o.stokk || []).slice().reverse());
  Object.assign(r, { tur: o.tur || 0, hand: null, fra: null, maaSnu: false, startSnudd: Array(n).fill(2), tittet: Array(n).fill(true), slutt: null, igjen: 0, turer: Array(n).fill(1), fase: "spill", resultat: null, logg: [] });
  S.spill.port = false;
  S.spill.viser = null;
  S.spill.telt = false;
}`;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const NOKKEL = t.nokkel("golfballen.v1");
  const lastMed = async (endring) => {
    await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
  };
  const ordne = (o) => lastMed(`(S) => (${ORDNE})(S, ${JSON.stringify(o)})`);
  const venterPa = (uttrykk, ms = 8000) => t.vent(`(() => { const S = JSON.parse(localStorage.getItem('${NOKKEL}')); return ${uttrykk}; })()`, ms);

  // One step for whoever holds the phone: open the gate, look and remember, turn a start card, draw,
  // then put the card on the first hidden spot (or throw it when all are open).
  const gjorTrekk = () =>
    t.js(`(() => {
      const k = (sel) => document.querySelector(sel);
      for (const [sel, navn] of [['[data-h="vis"]', "vis"], ['.dokk [data-h="titt"]', "titt"], ['.dokk [data-h="husker"]', "husker"], ['.gb-meg [data-h="startsnu"]', "startsnu"], ['.gb-meg [data-h="snukort"]', "snu"]])
        if (k(sel)) { k(sel).click(); return navn; }
      const bytt = Array.from(document.querySelectorAll('.gb-meg button[data-h="bytt"]'));
      if (bytt.length) {
        const S = Rusj.S, r = S.spill.r, p = r.tur;
        const skjult = bytt.find((b) => !r.rutenett[p][Number(b.dataset.v)].opp);
        if (skjult) { skjult.click(); return "bytt"; }
        if (k('.dokk [data-h="kast"]')) { k('.dokk [data-h="kast"]').click(); return "kast"; }
        bytt[0].click();
        return "bytt";
      }
      const trekk = k('.dokk .knapp[data-h="trekk"]:not([disabled])');
      if (trekk) { trekk.click(); return "trekk"; }
      return "";
    })()`);
  const spillHull = async (maks = 200) => {
    for (let n = 0; n < maks; n++) {
      const s = await sp();
      if (s.r.fase === "ferdig") return s;
      const gjort = await gjorTrekk();
      await t.sov(gjort ? 380 : 250);
    }
    return sp();
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");

  // ---------- Six cards against the phone ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  t.sjekk((await t.antall(".bryter")) === 2, "Seks kort skal ha to husregler");
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.gb-meg .gb-plass').length === 6");
  await t.sov(300);
  let s = await sp();
  t.sjekk(s.modus === "mobil" && s.n === 2 && s.niva === 2 && s.var === "seks" && s.hull === 9 && s.regler.toer && !s.regler.snu, "Standardoppsettet er ikke seks kort, ni hull, middels, toer minus to");
  t.sjekk(s.r.tur === 0 && s.r.rutenett[0].every((c) => !c.opp), "Du begynner ikke med alle kortene skjult");
  t.sjekk(!t.norsk || /Snu to/.test(await t.tekst(".gb-melding")), "Meldingen ber deg ikke snu to kort");
  t.sjekk((await t.antall('.gb-meg button[data-h="startsnu"]')) === 6, "De skjulte kortene kan ikke snus");
  await t.bilde("start");
  await t.klikk('.gb-meg [data-h="startsnu"][data-v="0"]', 300);
  await t.klikk('.gb-meg [data-h="startsnu"][data-v="4"]', 300);
  s = await sp();
  t.sjekk(s.r.rutenett[0][0].opp && s.r.rutenett[0][4].opp && s.r.startSnudd[0] === 2, "To kort ble ikke snudd");
  t.sjekk(await t.finnes('.dokk .knapp[data-h="trekk"]:not([disabled])'), "«Trekk et kort» er ikke klar etter to snudde kort");
  t.sjekk(await t.friForDokk(".gb-meg"), "Rutenettet ligger bak handlingsfeltet");
  // Draw and swap with a hidden card
  await t.klikk(".gb-stokk", 350);
  s = await sp();
  const trukket = s.r.hand;
  t.sjekk(trukket != null && s.r.fra === "stokk", "Kortet ble ikke trukket");
  t.sjekk(await t.finnes('.dokk [data-h="kast"]') && (await t.antall('.gb-meg button[data-h="bytt"]')) === 6, "Etter trekket kan du ikke bytte eller kaste");
  await t.bilde("trukket");
  // A reload with the card in hand: still there
  await t.lastSide(t.side, "document.querySelector('.gb-meg')");
  await t.sov(300);
  t.sjekk((await sp()).r.hand === trukket, "Kortet i hånda forsvant ved omlasting");
  const gammel = s.r.rutenett[0][2].k;
  await t.klikk('.gb-meg [data-h="bytt"][data-v="2"]', 350);
  s = await sp();
  t.sjekk(s.r.rutenett[0][2].k === trukket && s.r.rutenett[0][2].opp && s.r.kast[s.r.kast.length - 1] === gammel, "Byttet la ikke det nye kortet åpent og det gamle i kastebunken");
  t.sjekk(s.r.tur === 1, "Turen gikk ikke til mobilen");
  await venterPa("S.spill.r.tur === 0", 12000);
  s = await sp();
  t.sjekk(s.r.startSnudd[1] === 2 && s.r.turer[1] === 1, "Mobilen snudde ikke to kort og tok en tur");
  await t.bilde("mobilen-svarte");
  // Take the discard: it must be swapped
  await t.klikk(".gb-kast", 350);
  s = await sp();
  t.sjekk(s.r.fra === "kast" && !(await t.finnes('.dokk [data-h="kast"]')), "Et kort fra kastebunken kan kastes rett tilbake");
  await t.klikk('.gb-meg [data-h="bytt"][data-v="1"]', 350);
  t.sjekk((await sp()).r.tur === 1, "Byttet med kastebunken avsluttet ikke turen");
  await venterPa("S.spill.r.tur === 0", 12000);

  // The phone never moves while a sheet is open
  await ordne({ nett: [[K(0, 1), K(0, 2), K(0, 3), K(0, 4), K(0, 5), K(0, 6)], [K(1, 1), K(1, 2), K(1, 3), K(1, 4), K(1, 5), K(1, 6)]], opp: [[true, true, false, false, false, false], [true, true, false, false, false, false]], kast: [K(2, 9)], tur: 1 });
  await t.klikk("#reglerknapp", 100);
  await t.sov(2400);
  t.sjekk((await sp()).r.tur === 1 && (await sp()).r.hand == null, "Mobilen spilte mens reglene var åpne");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await venterPa("S.spill.r.tur === 0", 12000);

  // An arranged ending: your last hidden card turns face up (a pair of fours) → the phone's last turn → the hole
  await ordne({
    nett: [[K(0, 5), K(0, 13), K(0, 4), K(1, 5), K(1, 13), K(0, 9)], [K(2, 1), K(2, 2), K(2, 3), K(2, 4), K(2, 6), K(2, 7)]],
    opp: [[true, true, true, true, true, false], [true, true, false, false, false, false]],
    kast: [K(1, 10)],
    stokk: [K(1, 4), K(3, 12), K(3, 13)],
  });
  await t.klikk(".gb-stokk", 350);
  await t.klikk('.gb-meg [data-h="bytt"][data-v="5"]', 400);
  s = await sp();
  t.sjekk(s.r.slutt === 0 && s.r.igjen === 1 && s.r.fase === "spill", "Det siste åpne kortet ga ikke mobilen én tur til");
  t.sjekk(!t.norsk || /én tur til/.test(await t.tekst(".gb-melding")), "Meldingen sier ikke at de andre får én tur til");
  await venterPa("S.spill.r.fase === 'ferdig'", 12000);
  await t.sov(400);
  s = await sp();
  t.sjekk(s.r.resultat[0] === 0 && s.poeng[0].length === 1 && s.poeng[0][0] === 0, `Hullet ble ikke telt riktig (${s.r.resultat})`);
  t.sjekk((await t.antall(".gb-hullres li")) === 2 && (await t.finnes('.dokk [data-h="neste"]')), "Poengene for hullet eller «Neste hull» vises ikke");
  t.sjekk((await t.antall(".gb-meg .gb-plass.par")) === 6, "De like parene er ikke merket");
  await t.bilde("hull-ferdig");
  await t.klikk('.dokk [data-h="neste"]', 500);
  s = await sp();
  t.sjekk(s.hullNr === 2 && s.r.fase === "spill" && s.r.rutenett[0].every((c) => !c.opp), "Neste hull startet ikke");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.gb-meg')");

  // «Avslutt» → «Kåringen» with the hole that was played
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk((await t.antall(".gb-plasser li")) === 2, "Kåringen viser ikke begge spillerne");
  t.sjekk(await t.finnes('.dokk [data-h="del"]') && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler «Del resultatet» eller «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  await t.bilde("kaaringen-avsluttet", true);

  // ---------- Four cards against the phone, one hole ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="var"][data-v="fire"]');
  await t.klikk('[data-h="hull"][data-v="1"]');
  t.sjekk((await t.antall(".bryter")) === 1, "Fire kort skal bare ha toer-regelen");
  await t.bilde("oppsett-fire", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.gb-meg .gb-plass').length === 4");
  await t.sov(300);
  t.sjekk(await t.finnes('.dokk [data-h="titt"]'), "Fire kort starter ikke med å se på de to nederste");
  await t.klikk('.dokk [data-h="titt"]', 350);
  s = await sp();
  t.sjekk(s.r.tittet[0] && s.viser === 0, "Du fikk ikke se de to nederste kortene");
  t.sjekk((await t.antall(".gb-meg .gb-plass .sk-opp")) === 2, "De to nederste kortene vises ikke");
  await t.bilde("titt");
  await t.klikk('.dokk [data-h="husker"]', 350);
  t.sjekk((await t.antall(".gb-meg .gb-plass .sk-opp")) === 0 && (await t.finnes('.lenkerad [data-h="bank"]')), "Kortene ble ikke skjult igjen, eller «Bank på» mangler");
  // Arranged: four kings (0) against queens and jacks; knock and win
  await ordne({ nett: [[K(0, 13), K(1, 13), K(2, 13), K(3, 13)], [K(0, 12), K(1, 12), K(0, 11), K(1, 11)]], kast: [K(2, 9)], stokk: [K(2, 10), K(3, 10)] });
  await t.klikk('.lenkerad [data-h="bank"]', 300);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 400);
  s = await sp();
  t.sjekk(s.r.slutt === 0 && s.r.tur === 1, "Bankingen ga ikke mobilen én tur til");
  await venterPa("S.spill.r.fase === 'ferdig'", 12000);
  await t.sov(400);
  s = await sp();
  t.sjekk(s.r.resultat[0] === 0 && s.r.resultat[1] > 0, `Hullet med fire kort ble ikke telt riktig (${s.r.resultat})`);
  t.sjekk(await t.finnes('.dokk [data-h="kaaring"]'), "Mangler «Se kåringen» etter siste hull");
  const rek = (await t.tilstand()).rekord[2];
  t.sjekk(rek && rek.seier === 1, "Seieren ble ikke telt i rekorden mot mobilen");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(merker && merker["klassiker-golfballen"] != null, "Klistremerket for å slå mobilen ble ikke gitt");
  await t.bilde("fire-ferdig");
  await t.klikk('.dokk [data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")) === "Du vinner!", `Kåringen sier ikke «Du vinner!»: «${await t.tekst("#skjerm h1")}»`);
  await t.bilde("kaaringen-mobil", true);
  await t.klikk('[data-h="del"]', 600);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Middels/ : /\S/).test(await t.tekst(".gb-rekorder")), "Rekorden mot mobilen vises ikke på hjem");
  await t.bilde("hjem-rekord");

  // ---------- Two on one phone, six cards: no gate, a whole hole ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="flere"]');
  await t.js("Rusj.S.antall = 2; Rusj.vis()");
  await t.sov(200);
  await t.klikk('[data-h="var"][data-v="seks"]');
  await t.klikk('[data-h="hull"][data-v="1"]');
  await t.bilde("oppsett-flere", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gb-meg')");
  s = await sp();
  t.sjekk(s.modus === "flere" && s.n === 2 && !s.port, "Seks kort på én mobil skal ikke ha port – alt er åpent");
  const forste = s.r.tur;
  t.sjekk((await t.tekst(".gb-status")).includes(forste === 0 ? "Testspiller A" : "Testspiller B"), "Rutenettet viser ikke hvem som har turen");
  for (let n = 0; n < 6 && (await sp()).r.tur === forste; n++) {
    await gjorTrekk();
    await t.sov(380);
  }
  s = await sp();
  t.sjekk(s.r.tur !== forste && (await t.tekst(".gb-status")).includes(forste === 0 ? "Testspiller B" : "Testspiller A"), "Rutenettet byttet ikke til neste spiller");
  await t.bilde("flere-tur");
  s = await spillHull();
  t.sjekk(s.r.fase === "ferdig" && s.poeng[0].length === 1, "Hullet for to på én mobil ble ikke ferdig");
  await t.bilde("flere-ferdig");
  await t.klikk('[data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  const summer = s.poeng.map((p) => p.reduce((a, b) => a + b, 0));
  const best = Math.min(...summer);
  const vinnere = ["Testspiller A", "Testspiller B"].filter((x, p) => summer[p] === best);
  const h1 = await t.tekst("#skjerm h1");
  t.sjekk(vinnere.every((v) => h1.includes(v)), `Kåringen viser feil vinner: «${h1}»`);
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  const siste = kveld && kveld.spill && kveld.spill[kveld.spill.length - 1];
  t.sjekk(siste && siste.id === "golfballen" && siste.resultat.length === 2, "Kåringen ble ikke registrert i Kveldens gjeng");
  await t.bilde("kaaringen-flere", true);

  // ---------- Two on one phone, four cards: a gate before every turn ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="var"][data-v="fire"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"vis\"]')");
  s = await sp();
  t.sjekk(s.port && !(await t.finnes(".gb-meg")), "Fire kort på én mobil starter ikke bak porten");
  t.sjekk((await t.tekst("#skjerm h1")).includes(s.r.tur === 0 ? "Testspiller A" : "Testspiller B"), "Porten sier ikke hvem som skal ha mobilen");
  await t.bilde("port");
  await t.klikk('[data-h="vis"]', 300);
  await t.klikk('.dokk [data-h="titt"]', 300);
  // A reload while looking: back behind the gate, and the look goes on after it
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk(await t.finnes('[data-h="vis"]') && !(await t.finnes(".gb-meg")), "Kortene vises rett etter omlasting – porten mangler");
  await t.klikk('[data-h="vis"]', 300);
  t.sjekk((await t.antall(".gb-meg .gb-plass .sk-opp")) === 2, "De to nederste vises ikke igjen etter porten");
  await t.klikk('.dokk [data-h="husker"]', 300);
  const forsteFire = (await sp()).r.tur;
  await t.klikk(".gb-stokk", 350);
  await t.klikk('.gb-meg [data-h="bytt"][data-v="0"]', 400);
  s = await sp();
  t.sjekk(s.r.tur !== forsteFire && s.port && (await t.finnes('[data-h="vis"]')) && !(await t.finnes(".gb-meg")), "Porten kom ikke tilbake da turen gikk videre");
  t.sjekk((t.norsk ? /byttet et skjult kort/ : /Testspiller [AB]/).test(await t.tekst(".gb-sist-port")), "Porten sier ikke hva forrige spiller gjorde");
  await t.bilde("port-neste");
  await t.klikk('[data-h="vis"]', 300);
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk(!(await t.tilstand()).spill, "«Avslutt» før første hull var ferdig tok ikke spillet bort");
}
