// Narren (Idiot): against the phone — swapping before the game, picking one and several cards and
// playing them, a card that doesn't fit, the ten that burns (and you go again), picking up the pile,
// the open table cards and a hidden one played blind, the phone answering (also after a reload), the
// phone waiting behind the rules sheet, «Fortsett» on home, an arranged end → «Kåringen», the record
// and «Del resultatet»; then two people on one phone: a gate before each swap and each turn (also after
// a reload), a whole game from the deal to the fool, «Kåringen» and «Kveldens gjeng».
// Runs in every edition (node test/rusj-e2e.mjs --sprak en narren): the texts are checked in
// Norwegian only (t.norsk); elsewhere the names, the state and the links (t.forside, t.nokkel).

// Card number: suit 0 spar, 1 hjerter, 2 ruter, 3 kløver; value 1 (ess) … 13 (konge).
const K = (s, v) => s * 13 + v - 1;

// Lay out a game exactly (already playing, player 0's turn): hands, open and hidden table cards,
// the pile (top last) and the next cards of the draw pile in order; the rest is burnt.
const ORDNE = `(S, o) => {
  const r = S.spill.r;
  const n = r.n;
  const opp = o.opp || o.hender.map(() => [null, null, null]);
  const ned = o.ned || o.hender.map(() => [null, null, null]);
  const brukt = new Set([].concat(...o.hender, ...opp.map((a) => a.filter((k) => k != null)), ...ned.map((a) => a.filter((k) => k != null)), o.bunke || [], o.stokk || []));
  const brent = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) brent.push(k);
  Object.assign(r, { hender: o.hender.map((h) => h.slice()), opp, ned, bunke: (o.bunke || []).slice(), stokk: (o.stokk || []).slice().reverse(), brent, fase: "spill", klar: Array(n).fill(true), tur: o.tur || 0, igjen: false, ute: [], narr: null, logg: [] });
  S.spill.valgt = [];
  S.spill.bytte = null;
  S.spill.port = false;
}`;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const NOKKEL = t.nokkel("narren.v1");
  const lastMed = async (endring) => {
    await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
  };
  const ordne = (o) => lastMed(`(S) => (${ORDNE})(S, ${JSON.stringify(o)})`);
  const hand = async () => (await sp()).r.hender[0].slice().sort((a, b) => a - b);

  // One step for whoever holds the shown cards: open the gate, finish swapping, play what is picked,
  // pick up or turn blind; else pick the lowest card that fits. Returns what it did.
  const gjorTrekk = () =>
    t.js(`(() => {
      const k = (sel) => document.querySelector(sel);
      for (const [sel, navn] of [['[data-h="vis"]', "vis"], ['.dokk [data-h="byttferdig"]', "bytte"], ['.dokk .knapp[data-h="legg"]:not([disabled])', "legg"], ['.dokk [data-h="ta"]', "ta"], ['.dokk [data-h="blind"]', "blind"]])
        if (k(sel)) { k(sel).click(); return navn; }
      const kort = Array.from(document.querySelectorAll('.nr-meg.min-tur.kilde-hand .nr-hk.lovlig[data-h="kort"], .nr-meg.min-tur.kilde-opp .nr-opp.lovlig'));
      if (kort.length) { kort[0].click(); return "velg"; }
      return "";
    })()`);
  const spillFerdig = async (maks = 900) => {
    for (let n = 0; n < maks; n++) {
      const s = await sp();
      if (s.r.fase === "slutt") return s;
      const gjort = await gjorTrekk();
      await t.sov(gjort ? 390 : 250);
    }
    return sp();
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");

  // ---------- Against the phone ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  t.sjekk((await t.antall(".bryter")) === 3, "Oppsettet har ikke tre husregler");
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.nr-hk').length === 3");
  await t.sov(400);
  let s = await sp();
  t.sjekk(s.modus === "mobil" && s.n === 2 && s.niva === 2 && s.regler.fire && !s.regler.sju && !s.regler.atter, "Standardoppsettet er ikke du mot én mobil på middels, med fire like og uten sjuer- og åtterregel");
  t.sjekk(s.r.fase === "bytte" && s.r.klar[1] && !s.r.klar[0], "Spillet starter ikke med at du bytter kort (mobilen ferdig)");
  t.sjekk((await t.antall(".nr-mittbord .nr-opp")) === 3 && (await t.antall(".nr-mittbord .nr-ned")) === 3, "Tre åpne og tre skjulte bordkort vises ikke");
  t.sjekk((await t.antall(".nr-mini .nr-opp")) === 3, "Mobilens åpne bordkort vises ikke");
  // Swap: a card on the hand, then an open card
  const forHand = s.r.hender[0][0];
  const forOpp = s.r.opp[0][1];
  await t.klikk(`.nr-hk[data-v="${forHand}"]`, 250);
  t.sjekk(await t.js(`document.querySelector('.nr-hk[data-v="${forHand}"]').getAttribute('aria-pressed') === 'true'`), "Kortet på hånda ble ikke valgt for bytte");
  await t.klikk(`.nr-opp[data-v="${forOpp}"]`, 300);
  s = await sp();
  t.sjekk(s.r.hender[0].includes(forOpp) && s.r.opp[0][1] === forHand, "Kortene ble ikke byttet");
  await t.bilde("bytte");
  await t.klikk('.dokk [data-h="byttferdig"]', 400);
  s = await sp();
  t.sjekk(s.r.fase === "spill", "Spillet startet ikke etter byttingen");
  t.sjekk(await t.friForDokk(".nr-hand"), "Hånda ligger bak handlingsfeltet");
  await t.bilde("start");

  // Pick and play: a five doesn't go on a six; a nine does, and the hand fills up to three
  await ordne({ hender: [[K(0, 5), K(1, 5), K(2, 9)], [K(3, 4), K(3, 7), K(3, 12)]], bunke: [K(1, 6)], stokk: [K(2, 12)] });
  t.sjekk(await t.js(`document.querySelector('.nr-hk[data-v="${K(0, 5)}"]').getAttribute('aria-disabled') === 'true'`), "Femmeren er ikke merket som et kort som ikke passer");
  await t.klikk(`.nr-hk[data-v="${K(0, 5)}"]`, 300);
  t.sjekk(!(await sp()).valgt.length, "Et kort som ikke passer, ble valgt");
  t.sjekk(await t.finnes('.dokk .knapp[data-h="legg"][disabled]'), "«Legg» er ikke av uten valgte kort");
  await t.klikk(`.nr-hk[data-v="${K(2, 9)}"]`, 300);
  t.sjekk((await sp()).valgt.join() === String(K(2, 9)), "Nieren ble ikke valgt");
  t.sjekk(!t.norsk || /Legg ruter ni/.test(await t.tekst(".dokk .knapp")), "Knappen sier ikke «Legg ruter ni»");
  await t.bilde("valgt");
  await t.klikk('.dokk [data-h="legg"]', 400);
  s = await sp();
  t.sjekk(s.r.bunke[s.r.bunke.length - 1] === K(2, 9) && s.r.hender[0].length === 3 && s.r.hender[0].includes(K(2, 12)), "Nieren ble ikke lagt, eller hånda ble ikke fylt opp til tre");
  // The phone answers (it has to pick up: nothing goes on a nine but the queen)
  await t.vent(`JSON.parse(localStorage.getItem('${NOKKEL}')).spill.r.tur === 0`, 6000);
  s = await sp();
  t.sjekk(s.r.bunke[s.r.bunke.length - 1] === K(3, 12), "Mobilen la ikke kløver dame på nieren");
  await t.bilde("mobilen-svarte");

  // Several equal cards at once, by tapping one of them
  await ordne({ hender: [[K(0, 5), K(1, 5), K(2, 9)], [K(3, 4), K(3, 7), K(3, 12)]], bunke: [], stokk: [K(2, 12), K(3, 13)] });
  await t.klikk(`.nr-hk[data-v="${K(0, 5)}"]`, 300);
  t.sjekk((await sp()).valgt.length === 2, "Begge femmerne ble ikke valgt med ett trykk");
  t.sjekk(!t.norsk || /Legg 2 femmere/.test(await t.tekst(".dokk .knapp")), "Knappen sier ikke «Legg 2 femmere»");
  // Tap the pile to play
  await t.klikk("#nr-haug", 400);
  s = await sp();
  t.sjekk(s.r.bunke.length === 2 && s.r.hender[0].length === 3, "To femmere ble ikke lagt ved trykk på bunken");

  // The ten burns the pile, and you go again
  await ordne({ hender: [[K(0, 10), K(1, 4), K(2, 4)], [K(3, 4), K(3, 7), K(3, 12)]], bunke: [K(1, 6), K(2, 13)] });
  await t.klikk(`.nr-hk[data-v="${K(0, 10)}"]`, 300);
  await t.klikk('.dokk [data-h="legg"]', 400);
  s = await sp();
  t.sjekk(!s.r.bunke.length && s.r.tur === 0 && s.r.igjen, "Tieren brant ikke bunken, eller du fikk ikke legge igjen");
  t.sjekk(!t.norsk || /brenner/.test(await t.tekst(".nr-melding")), "Meldingen sier ikke at bunken brenner");
  await t.bilde("brent");

  // Nothing fits: pick up the pile
  await ordne({ hender: [[K(0, 3), K(1, 4)], [K(3, 4), K(3, 7), K(3, 12)]], bunke: [K(1, 6), K(2, 13)] });
  t.sjekk(await t.finnes('.dokk [data-h="ta"]'), "«Ta opp bunken» vises ikke når ingenting passer");
  t.sjekk(!t.norsk || /ta opp bunken/.test(await t.tekst(".nr-melding")), "Meldingen sier ikke at du må ta opp bunken");
  await t.bilde("ta-opp");
  await t.klikk('.dokk [data-h="ta"]', 400);
  s = await sp();
  t.sjekk(s.r.hender[0].length === 4 && !s.r.bunke.length && s.r.tur === 1, "Bunken ble ikke tatt opp");

  // The open table cards after the hand; then a hidden card blind
  await ordne({ hender: [[], [K(3, 4), K(3, 7), K(3, 12)]], opp: [[K(0, 11), null, K(1, 11)], [null, null, null]], ned: [[K(0, 13), K(2, 3), null], [null, null, null]], bunke: [K(1, 8)] });
  t.sjekk(!t.norsk || /åpne kortene/.test(await t.tekst(".nr-melding")), "Meldingen sier ikke at du spiller fra de åpne kortene");
  await t.klikk(`.nr-opp[data-v="${K(0, 11)}"]`, 300);
  t.sjekk((await sp()).valgt.length === 2, "Begge de åpne knektene ble ikke valgt");
  await t.klikk('.dokk [data-h="legg"]', 400);
  s = await sp();
  t.sjekk(s.r.opp[0].every((k) => k == null) && s.r.bunke.length === 3, "De åpne knektene ble ikke lagt");
  await t.vent(`JSON.parse(localStorage.getItem('${NOKKEL}')).spill.r.tur === 0`, 6000);
  t.sjekk(await t.finnes('.dokk [data-h="blind"]') && (await t.antall("button.nr-ned")) === 2, "De skjulte kortene kan ikke snus");
  await t.bilde("blindt");
  // Reload mid-turn: the same cards, the same turn
  const forBlind = JSON.stringify((await sp()).r);
  await t.lastSide(t.side, "document.querySelector('.nr-hand')");
  await t.sov(300);
  t.sjekk(JSON.stringify((await sp()).r) === forBlind, "Spillet ble ikke gjenopprettet etter omlasting");
  await t.klikk('button.nr-ned[data-v="0"]', 400);
  s = await sp();
  t.sjekk(s.r.ned[0][0] == null && s.r.logg.some((h) => h.type === "blind"), "Det skjulte kortet ble ikke snudd");

  // The phone never moves while a sheet is open
  await ordne({ hender: [[K(0, 3), K(1, 4)], [K(3, 4), K(3, 7), K(3, 12)]], bunke: [K(1, 2)], tur: 1 });
  await t.klikk("#reglerknapp", 100);
  await t.sov(2200);
  t.sjekk((await sp()).r.tur === 1, "Mobilen spilte mens reglene var åpne");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent(`JSON.parse(localStorage.getItem('${NOKKEL}')).spill.r.tur === 0`, 6000);
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.nr-hand')");

  // An arranged end: your last card goes out → you win; the phone is the fool
  await ordne({ hender: [[K(0, 13)], [K(3, 4), K(3, 7), K(3, 12)]], bunke: [K(1, 6)] });
  await t.klikk(`.nr-hk[data-v="${K(0, 13)}"]`, 300);
  await t.klikk('.dokk [data-h="legg"]', 500);
  s = await sp();
  t.sjekk(s.r.fase === "slutt" && s.r.ute[0] === 0 && s.r.narr === 1, "Du ble ikke ute først, eller mobilen ble ikke narren");
  t.sjekk(await t.finnes('.dokk [data-h="kaaring"]'), "Mangler «Se kåringen» når spillet er over");
  await t.bilde("slutt-bord");
  const rek = (await t.tilstand()).rekord[2];
  t.sjekk(rek && rek.seier === 1, "Seieren ble ikke telt i rekorden mot mobilen");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(merker && merker["klassiker-narren"] != null, "Klistremerket for å slå mobilen ble ikke gitt");
  await t.klikk('.dokk [data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")) === "Du vinner!", `Kåringen sier ikke «Du vinner!»: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".nr-plasser li")) === 2, "Rekkefølgen viser ikke begge spillerne");
  t.sjekk(await t.finnes('.dokk [data-h="del"]') && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler «Del resultatet» eller «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  await t.bilde("kaaringen-mobil", true);
  await t.klikk('[data-h="del"]', 600);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Middels/ : /\S/).test(await t.tekst(".nr-rekorder")), "Rekorden mot mobilen vises ikke på hjem");
  await t.bilde("hjem-rekord");

  // Four at the table (you and three phones): the hand clears the dock, also a big one in rows
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="mobiler"][data-v="3"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.nr-plass').length === 3 && document.querySelector('[data-h=\"byttferdig\"]')");
  await t.klikk('.dokk [data-h="byttferdig"]', 400);
  t.sjekk((await sp()).n === 4, "Tre mobilspillere ga ikke fire ved bordet");
  t.sjekk(await t.friForDokk(".nr-hand"), "Hånda ligger bak handlingsfeltet med fire spillere");
  await t.bilde("fire-spillere");
  const stor = [];
  for (let v = 3; v <= 12; v++) stor.push(K(0, v), K(1, v));
  await ordne({ hender: [stor, [K(2, 1), K(2, 2), K(2, 3)], [K(2, 4), K(2, 5), K(2, 6)], [K(2, 7), K(2, 8), K(2, 9)]], bunke: [K(3, 6)] });
  t.sjekk((await t.antall(".nr-rad")) === 2 && (await t.antall(".nr-hk")) === 20, "En stor hånd ligger ikke i to rader");
  t.sjekk(await t.friForDokk(".nr-hand"), "En stor hånd ligger bak handlingsfeltet");
  await t.bilde("stor-hand");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk(!(await t.tilstand()).spill, "«Avslutt» midt i et spill tok ikke spillet bort");

  // ---------- Two people on one phone: a whole game ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="flere"]');
  await t.js("Rusj.S.antall = 2; Rusj.vis()");
  await t.sov(200);
  await t.bilde("oppsett-flere", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"vis\"]')");
  s = await sp();
  t.sjekk(s.modus === "flere" && s.n === 2 && s.port && s.r.fase === "bytte", "Flere på én mobil starter ikke bak porten med bytting");
  t.sjekk(!(await t.finnes(".nr-hk")), "Kortene vises før «Vis kortene mine»");
  const forsteBytter = (s.r.giver + 1) % 2;
  t.sjekk((await t.tekst("#skjerm h1")).includes(forsteBytter === 0 ? "Testspiller A" : "Testspiller B"), "Porten sier ikke hvem som skal bytte");
  await t.bilde("port-bytte");
  await t.klikk('[data-h="vis"]', 300);
  t.sjekk((await t.antall(".nr-hk")) === 3, "Kortene vises ikke etter «Vis kortene mine»");
  // A reload with the cards showing: back behind the gate
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk(await t.finnes('[data-h="vis"]') && !(await t.finnes(".nr-hk")), "Kortene vises rett etter omlasting – porten mangler");
  await t.klikk('[data-h="vis"]', 300);
  await t.klikk('.dokk [data-h="byttferdig"]', 400);
  s = await sp();
  t.sjekk(s.r.fase === "bytte" && s.port && (await t.finnes('[data-h="vis"]')), "Porten kom ikke før neste spiller bytter");
  await t.klikk('[data-h="vis"]', 300);
  await t.klikk('.dokk [data-h="byttferdig"]', 400);
  s = await sp();
  t.sjekk(s.r.fase === "spill", "Spillet startet ikke etter at begge byttet");
  // After a move that ends the turn, the gate comes back for the other player
  if (s.port) await t.klikk('[data-h="vis"]', 300);
  const forste = (await sp()).r.tur;
  for (let n = 0; n < 8 && (await sp()).r.tur === forste && (await sp()).r.fase === "spill"; n++) {
    await gjorTrekk();
    await t.sov(400);
  }
  s = await sp();
  if (s.r.fase === "spill") {
    t.sjekk(s.r.tur !== forste && s.port && (await t.finnes('[data-h="vis"]')) && !(await t.finnes(".nr-hk")), "Porten kom ikke tilbake da turen gikk videre");
    t.sjekk((t.norsk ? /la |tok opp/ : /Testspiller [AB]/).test(await t.tekst(".nr-sist-port")), "Porten sier ikke hva forrige spiller gjorde");
    await t.bilde("port");
  }
  s = await spillFerdig();
  t.sjekk(s.r.fase === "slutt" && s.r.ute.length === 1 && s.r.narr != null, "Spillet for to på én mobil ble ikke ferdig");
  await t.bilde("flere-ferdig");
  await t.klikk('[data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  const vinner = s.r.ute[0] === 0 ? "Testspiller A" : "Testspiller B";
  t.sjekk(t.norsk ? (await t.tekst("#skjerm h1")) === `${vinner} vinner!` : (await t.tekst("#skjerm h1")).includes(vinner), `Kåringen viser feil vinner: «${await t.tekst("#skjerm h1")}»`);
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  const siste = kveld && kveld.spill && kveld.spill[kveld.spill.length - 1];
  t.sjekk(siste && siste.id === "narren" && siste.resultat.length === 2, "Kåringen ble ikke registrert i Kveldens gjeng");
  await t.bilde("kaaringen-flere", true);
}
