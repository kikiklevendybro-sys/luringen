// Samleren: rummy against the phone (draw, lay out a set and a run, lay off, undo, throw; the phone
// answers, also after a reload), a whole round to its result, «Avslutt» → «Kåringen» with «Del
// resultatet»; 500 (a card deep in the spread pile is taken with every card above it and must be laid
// out at once); gin rummy (knock with ten or less, the result shows both hands); then two people on
// one phone: the hand waits behind «Vis kortene mine» at every change of turn (also after a reload),
// «Kåringen» and «Kveldens gjeng».
// Runs in every edition (node test/rusj-e2e.mjs --sprak en samleren): texts are checked in Norwegian
// only (t.norsk); elsewhere the state, the classes and the links (t.forside, t.nokkel).

// Card number: suit 0 spar, 1 hjerter, 2 ruter, 3 kløver; value 1 (ess) … 13 (konge).
const K = (s, v) => s * 13 + v - 1;

// Lay out a round exactly: hands, discard pile (top last), the next cards of the stock in order.
const ORDNE = `(S, o) => {
  const sp = S.spill;
  const r = sp.r;
  const brukt = new Set([].concat(...o.hender, o.bunke, o.stokk || []));
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  r.hender = o.hender.map((h) => h.slice());
  r.bunke = o.bunke.slice();
  r.stokk = rest.concat((o.stokk || []).slice().reverse());
  Object.assign(r, { bord: [], tur: 0, fase: o.fase || "trekk", tilbud: 0, kunStokk: false, tatt: null, maaBruke: null, omstokk: 0, turer: 0, resultat: null, logg: [], forrige: [] });
  r.tatte = r.hender.map(() => []);
  Object.assign(sp, { lagt: false, port: false, valgt: [], bunkeValg: null, angre: null, endret: false, ny: [] });
}`;

// One move for the person whose hand is shown: through the buttons only. Draw from the stock; lay out
// any set or run in the hand; throw the highest card that may be thrown. Returns what it did.
const GJOR = `(() => {
  const q = (s) => document.querySelector(s);
  if (q('[data-h="vis"]')) { q('[data-h="vis"]').click(); return "vis"; }
  const dokk = q('#skjerm .dokk');
  if (!dokk) return "";
  const hoved = dokk.querySelector('.knapp:not([disabled])');
  const h = hoved && hoved.dataset.h;
  if (h === "runde" || h === "kaaring") return "";
  if (h === "trekk" || h === "stopp") { hoved.click(); return h; }
  if (h === "ta" && !q('.sa-hand .sa-hk.valgt')) { const nei = dokk.querySelector('[data-h="avsla"]'); (nei || hoved).click(); return "tilbud"; }
  const hand = Array.from(document.querySelectorAll('.sa-hand .sa-hk')).map((b) => Number(b.dataset.v));
  if (!hand.length || !q('.sa-hand.min-tur')) return "";
  const velg = (kort) => { for (const b of document.querySelectorAll('.sa-hand .sa-hk.valgt')) b.click(); for (const k of kort) q('.sa-hk[data-v="' + k + '"]').click(); };
  const gin = !!q('.sa-gin');
  if (!gin) {
    const like = {};
    for (const k of hand) (like[k % 13] = like[k % 13] || []).push(k);
    let meld = Object.values(like).find((g) => g.length >= 3);
    if (!meld) for (const k of hand) { const s = Math.floor(k / 13), v = k % 13; if (v <= 10 && hand.includes(k + 1) && hand.includes(k + 2) && Math.floor((k + 2) / 13) === s) { meld = [k, k + 1, k + 2]; break; } }
    if (meld && hand.length > meld.length) { velg(meld.slice(0, 4)); const b = q('.dokk [data-h="legut"]'); if (b && !b.disabled) { b.click(); return "legut"; } }
  }
  const sortert = hand.slice().sort((a, b) => Math.min(10, (b % 13) + 1) - Math.min(10, (a % 13) + 1));
  for (const k of sortert) {
    velg([k]);
    const til = q('.sa-meld.mal');
    if (til && hand.length > 1) { til.click(); return "til"; }
    const bank = q('.dokk [data-h="bank"]');
    if (bank) { bank.click(); return "bank"; }
    const kast = q('.dokk .knapp[data-h="kast"]:not([disabled]), .dokk .knapp-2[data-h="kast"]');
    if (kast) { kast.click(); return "kast"; }
  }
  return "";
})()`;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const lastMed = async (endring) => {
    await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
  };
  const ordne = (o) => lastMed(`(S) => (${ORDNE})(S, ${JSON.stringify(o)})`);
  const lagret = () => `JSON.parse(localStorage.getItem('${t.nokkel("samleren.v1")}')).spill`;
  const minTur = () => t.vent(`(() => { const s = ${lagret()}; return s.r.fase === "slutt" || (s.r.tur === 0 && document.querySelector('.sa-melding.din')); })()`, 15000);
  const velg = async (kort) => {
    for (const k of kort) await t.klikk(`.sa-hk[data-v="${k}"]`, 120);
  };
  const spillRunde = async (maks = 400) => {
    for (let n = 0; n < maks; n++) {
      const s = await sp();
      if (s.r.fase === "slutt") return s;
      const gjort = await t.js(GJOR);
      await t.sov(gjort ? 260 : 300);
    }
    return sp();
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");

  // ---------- Rummy against the phone ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  t.sjekk((await t.antall('.flis[data-h="variant"]')) === 3, "Oppsettet viser ikke de tre spillene som fliser");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sa-hk').length === 10");
  await t.sov(400);
  let s = await sp();
  t.sjekk(s.variant === "klassisk" && s.modus === "mobil" && s.n === 2 && s.niva === 2 && s.mal === "100", "Standardoppsettet er ikke rummy mot én mobil på middels, først til 100");
  t.sjekk(s.r.hender[0].length === 10 && s.r.hender[1].length === 10 && s.r.bunke.length === 1, "To spillere skal få ti kort hver, og ett kort skal ligge i kastebunken");
  const navn = await t.js(`Array.from(document.querySelectorAll('.sa-hk')).map((b) => b.getAttribute('aria-label'))`);
  t.sjekk(navn.every((n) => (t.norsk ? /^(spar|hjerter|ruter|kløver) (ess|to|tre|fire|fem|seks|sju|åtte|ni|ti|knekt|dame|konge)$/ : /^\S+( \S+){1,2}$/).test(n)), `Kortene heter ikke «farge verdi»: ${navn.join(", ")}`);
  t.sjekk(await t.friForDokk(".sa-hand"), "Hånda ligger bak handlingsfeltet");
  await t.bilde("din-tur");

  // A set-up: a run and a set on the hand; the stock gives hjerter ti, which fits the run.
  await ordne({
    hender: [[K(1, 7), K(1, 8), K(1, 9), K(0, 5), K(1, 5), K(2, 5), K(3, 13), K(2, 2), K(0, 11), K(3, 4)], [K(0, 2), K(0, 3), K(2, 7), K(2, 9), K(3, 1), K(3, 6), K(3, 8), K(0, 9), K(2, 12), K(0, 13)]],
    bunke: [K(3, 10)],
    stokk: [K(1, 10), K(2, 11), K(0, 12), K(3, 3)],
  });
  t.sjekk(!t.norsk || /Trekk fra bunken/.test(await t.tekst(".sa-melding")), "Meldingen ber ikke om å trekke");
  await t.klikk(`.sa-hk[data-v="${K(1, 7)}"]`, 200);
  t.sjekk(!(await t.finnes(".sa-hk.valgt")), "Et kort kan velges før man har trukket");
  await t.klikk('.dokk [data-h="trekk"]', 400);
  s = await sp();
  t.sjekk(s.r.fase === "spill" && s.r.hender[0].includes(K(1, 10)) && s.r.hender[0].length === 11, "Trekket ga ikke hjerter ti");
  await velg([K(1, 7), K(1, 8)]);
  t.sjekk(await t.finnes('.dokk .knapp[data-h="kast"][disabled]'), "To kort som ikke er en kombinasjon, gir ikke en deaktivert knapp");
  await velg([K(1, 9)]);
  t.sjekk(await t.finnes('.dokk [data-h="legut"]'), "Tre på rad gir ikke «Legg ut»");
  await t.bilde("velger-rekke");
  await t.klikk('.dokk [data-h="legut"]', 400);
  s = await sp();
  t.sjekk(s.r.bord.length === 1 && s.r.bord[0].kort.length === 3 && s.r.hender[0].length === 8, "Rekka ble ikke lagt ut");
  // Undo the run, then lay it out again.
  t.sjekk(await t.finnes('.dokk [data-h="angre"]'), "«Angre» mangler etter å ha lagt ut");
  await t.klikk('.dokk [data-h="angre"]', 300);
  s = await sp();
  t.sjekk(!s.r.bord.length && s.r.hender[0].length === 11 && s.r.fase === "spill", "«Angre» la ikke kortene tilbake på hånda");
  await velg([K(1, 7), K(1, 8), K(1, 9)]);
  await t.klikk('.dokk [data-h="legut"]', 300);
  await velg([K(0, 5), K(1, 5), K(2, 5)]);
  await t.klikk('.dokk [data-h="legut"]', 300);
  // Lay off hjerter ti onto the run: the run glows, a tap on it lays the card off.
  await velg([K(1, 10)]);
  t.sjekk(await t.finnes(".sa-meld.mal"), "Kombinasjonen kortet passer på, lyser ikke");
  await t.bilde("legg-til");
  await t.klikk(".sa-meld.mal", 400);
  s = await sp();
  t.sjekk(s.r.bord.length === 2 && s.r.bord.some((m) => m.kort.length === 4 && m.kort.includes(K(1, 10))) && s.r.hender[0].length === 4, "Hjerter ti ble ikke lagt til på rekka");
  // A reload mid-turn: the same table and hand.
  await t.lastSide(t.side, "document.querySelector('.sa-hand')");
  await t.sov(300);
  t.sjekk((await t.antall(".sa-meld")) === 2 && (await t.antall(".sa-hk")) === 4, "Bordet eller hånda ble ikke gjenopprettet etter omlasting");
  await velg([K(3, 13)]);
  t.sjekk(await t.finnes('.dokk .knapp[data-h="kast"]:not([disabled])'), "Ett kort gir ikke «Kast»");
  await t.klikk('.dokk .knapp[data-h="kast"]', 300);
  s = await sp();
  t.sjekk(s.r.tur === 1 && s.r.bunke[s.r.bunke.length - 1] === K(3, 13), "Kløver konge ble ikke kastet, eller turen gikk ikke til mobilen");
  await minTur();
  s = await sp();
  t.sjekk(s.r.fase === "slutt" || s.r.tur === 0, "Mobilen gjorde ikke trekket sitt");
  t.sjekk(!t.norsk || /Mobilen (trakk|tok)/.test(await t.tekst(".sa-sist")), "Linja om hva mobilen gjorde mangler");
  await t.bilde("mobilen-svarte");

  // The phone never moves while a sheet is open, and moves after a reload in its turn.
  await t.js(`(() => { const S = Rusj.S; if (S.spill.r.fase !== "slutt") { S.spill.r.tur = 1; S.spill.r.fase = "trekk"; } Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  if ((await sp()).r.fase !== "slutt") {
    await t.klikk("#reglerknapp", 100);
    await t.sov(2200);
    t.sjekk((await sp()).r.tur === 1, "Mobilen spilte mens reglene var åpne");
    await t.bilde("regler", true);
    await t.klikk('#ark [data-h="lukk-ark"]');
    await minTur();
  }

  // Home shows «Fortsett» while the game runs.
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.sa-bord')");

  // The rest of the round, played through the buttons.
  s = await spillRunde();
  t.sjekk(s.r.fase === "slutt" && s.lagt, "Runden ble ikke ferdig");
  t.sjekk(s.poeng.reduce((a, b) => a + b, 0) === s.r.resultat.poeng.reduce((a, b) => a + b, 0), "Poengene fra runden ble ikke lagt til stillingen");
  t.sjekk(await t.finnes('.dokk [data-h="runde"], .dokk [data-h="kaaring"]'), "Mangler «Ny runde» eller «Se kåringen» etter runden");
  await t.bilde("runde-ferdig", true);

  // «Avslutt» → «Kåringen»
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(await t.finnes('.dokk [data-h="del"]') && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler «Del resultatet» eller «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  await t.bilde("kaaringen-mobil", true);
  await t.klikk('[data-h="del"]', 600);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- 500: take a card deep in the pile ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="variant"][data-v="500"]');
  await t.klikk('[data-h="mobiler"][data-v="2"]');
  t.sjekk((await t.js(`document.querySelector('[data-h="mal"][aria-pressed="true"]').dataset.v`)) === "500", "500 starter ikke med «Først til 500»");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sa-spredt')");
  s = await sp();
  t.sjekk(s.variant === "500" && s.n === 3 && s.r.hender.every((h) => h.length === 7), "500 for tre gir ikke sju kort hver");
  // Three in a row with spar seks deep in the pile.
  await ordne({
    hender: [[K(0, 4), K(0, 5), K(2, 13), K(3, 9), K(1, 2), K(2, 3), K(3, 12)], [K(1, 6), K(1, 7), K(2, 7), K(2, 9), K(3, 1), K(3, 6), K(0, 13)], [K(0, 2), K(1, 11), K(2, 4), K(3, 5), K(1, 13), K(2, 10), K(3, 2)]],
    bunke: [K(1, 3), K(0, 6), K(3, 7), K(2, 8)],
  });
  t.sjekk((await t.antall(".sa-bk")) === 4, "Kastebunken ligger ikke spredt med fire kort");
  await t.klikk(`.sa-bk[data-v="0"]`, 250);
  t.sjekk(!(await t.finnes(".sa-bk.valgt")), "Et kort som ikke kan brukes, kan velges dypt i bunken");
  await t.klikk(`.sa-bk[data-v="1"]`, 250);
  t.sjekk((await t.antall(".sa-bk.valgt")) === 3 && (await t.finnes('.dokk .knapp[data-h="ta"]')), "Spar seks og kortene over er ikke valgt, eller «Ta 3 kort» mangler");
  await t.bilde("500-dypt");
  await t.klikk('.dokk .knapp[data-h="ta"]', 400);
  s = await sp();
  t.sjekk(s.r.hender[0].length === 10 && s.r.maaBruke === K(0, 6) && s.r.bunke.length === 1, "Spar seks og kortene over kom ikke på hånda");
  t.sjekk(await t.finnes('.dokk .knapp[data-h="kast"][disabled]'), "Man kan kaste før spar seks er lagt ut");
  await velg([K(0, 4), K(0, 5)]);
  await t.bilde("500-maa-bruke");
  await t.klikk('.dokk [data-h="legut"]', 400);
  s = await sp();
  t.sjekk(s.r.maaBruke == null && s.r.bord.length === 1 && s.r.bord[0].av.every((p) => p === 0), "Spar 4–6 ble ikke lagt ut");
  t.sjekk(!t.norsk || /Ute: 15/.test(await t.tekst(".sa-handtopp")), "Poengene for det som er lagt ut, vises ikke");
  await velg([K(3, 12)]);
  await t.klikk('.dokk .knapp[data-h="kast"]', 300);
  await t.vent(`${lagret()}.r.tur === 0`, 15000);
  await t.bilde("500-mobilene");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-hjem')");

  // ---------- Gin rummy: knock ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="variant"][data-v="gin"]');
  t.sjekk(!(await t.finnes('[data-h="mobiler"]')), "Gin rummy spør etter antall mobilspillere");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.sa-gin')");
  s = await sp();
  t.sjekk(s.variant === "gin" && s.n === 2 && s.r.fase === "tilbud" && s.r.hender.every((h) => h.length === 10), "Gin rummy starter ikke med ti kort hver og tilbudet om det første kortet");
  await t.bilde("gin-tilbud");
  // Melds 3–5 spar, three kings and 7–9 ruter, and kløver sju; taking the upcard (ruter ess) and throwing kløver sju leaves one loose point.
  await ordne({
    fase: "tilbud",
    hender: [[K(0, 3), K(0, 4), K(0, 5), K(0, 13), K(1, 13), K(2, 13), K(2, 7), K(2, 8), K(2, 9), K(3, 7)], [K(1, 2), K(1, 3), K(1, 9), K(3, 2), K(3, 5), K(3, 9), K(3, 11), K(0, 8), K(0, 10), K(1, 1)]],
    bunke: [K(2, 1)],
  });
  await t.klikk('.dokk .knapp[data-h="ta"]', 400);
  s = await sp();
  t.sjekk(s.r.fase === "spill" && s.r.hender[0].includes(K(2, 1)), "Det første kortet ble ikke tatt");
  t.sjekk((await t.antall(".sa-hk.i-meld")) === 9, "Hånda er ikke gruppert etter kombinasjonene i gin");
  await velg([K(2, 1)]);
  t.sjekk(!(await t.finnes('.dokk [data-h="bank"]')), "Kortet man nettopp tok, kan brukes til å banke på");
  await velg([K(3, 7)]);
  t.sjekk(await t.finnes('.dokk [data-h="bank"]'), "«Bank på» mangler med to løse poeng");
  await t.bilde("gin-bank");
  await t.klikk('.dokk [data-h="bank"]', 600);
  s = await sp();
  t.sjekk(s.r.fase === "slutt" && s.r.resultat.type === "bank" && s.r.resultat.banker === 0, "Banket ikke på");
  t.sjekk((await t.antall(".sa-oppstilling")) === 2, "Resultatet viser ikke begge hendene");
  await t.bilde("gin-resultat", true);
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.bilde("gin-kaaring", true);

  // ---------- Two people on one phone ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="variant"][data-v="klassisk"]');
  await t.klikk('[data-h="modus"][data-v="flere"]');
  await t.js("Rusj.S.antall = 2; Rusj.vis()");
  await t.sov(200);
  await t.klikk('[data-h="mal"][data-v="en"]');
  await t.bilde("oppsett-flere", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"vis\"]')");
  s = await sp();
  t.sjekk(s.modus === "flere" && s.n === 2 && s.port, "Flere på én mobil starter ikke bak porten");
  t.sjekk(!(await t.finnes(".sa-hk")), "Kortene vises før «Vis kortene mine»");
  t.sjekk((await t.tekst("#skjerm h1")).includes(s.r.tur === 0 ? "Testspiller A" : "Testspiller B"), "Porten sier ikke hvem som skal ha mobilen");
  await t.bilde("port");
  await t.klikk('[data-h="vis"]', 300);
  t.sjekk((await t.antall(".sa-hk")) === 10, "Kortene vises ikke etter «Vis kortene mine»");
  await t.bilde("flere-hand");
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk(await t.finnes('[data-h="vis"]') && !(await t.finnes(".sa-hk")), "Kortene vises rett etter omlasting – porten mangler");
  await t.klikk('[data-h="vis"]', 300);
  const forste = (await sp()).r.tur;
  for (let n = 0; n < 6 && (await sp()).r.tur === forste && (await sp()).r.fase !== "slutt"; n++) {
    await t.js(GJOR);
    await t.sov(300);
  }
  s = await sp();
  if (s.r.fase !== "slutt") {
    t.sjekk(s.r.tur !== forste && s.port && (await t.finnes('[data-h="vis"]')) && !(await t.finnes(".sa-hk")), "Porten kom ikke tilbake da turen gikk videre");
    t.sjekk((t.norsk ? /trakk fra bunken/ : /Testspiller [AB]/).test(await t.tekst(".sa-sist-port")), "Porten sier ikke hva forrige spiller gjorde");
  }
  s = await spillRunde(800);
  // A round without a winner (the stock ran out twice): play another one.
  for (let n = 0; n < 3 && s.r.fase === "slutt" && s.r.resultat.vinner == null; n++) {
    await t.klikk('[data-h="runde"]', 500);
    s = await spillRunde(800);
  }
  t.sjekk(s.r.fase === "slutt", "Runden for to på én mobil ble ikke ferdig");
  await t.bilde("flere-ferdig");
  if (s.r.resultat.vinner != null) {
    await t.klikk('[data-h="kaaring"]');
    await t.vent("document.querySelector('.skjerm-slutt')");
    await t.sov(400);
    const vinner = s.r.resultat.vinner === 0 ? "Testspiller A" : "Testspiller B";
    t.sjekk((await t.tekst("#skjerm h1")).includes(vinner), `Kåringen viser feil vinner: «${await t.tekst("#skjerm h1")}»`);
    const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
    const siste = kveld && kveld.spill && kveld.spill[kveld.spill.length - 1];
    t.sjekk(siste && siste.id === "samleren" && siste.resultat.length === 2, "Kåringen ble ikke registrert i Kveldens gjeng");
    await t.bilde("kaaringen-flere", true);
  }
}
