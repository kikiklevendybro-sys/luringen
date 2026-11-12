// Vri åtter: a whole round against the phone (cards are buttons named «hjerter åtte», the phone
// moves by itself, a reload mid-turn keeps the round), choosing a colour after an eight, drawing
// three and passing, the record on home, «Avslutt» → «Kåringen» with «Del resultatet»; then two
// people on one phone: the hand waits behind «Vis kortene mine» at every change of turn (also after a
// reload), a whole round, «Kåringen» and «Kveldens gjeng».

// Card number: suit 0 spar, 1 hjerter, 2 ruter, 3 kløver; value 1 (ess) … 13 (konge).
const K = (s, v) => s * 13 + v - 1;

// Lay out a round exactly: hands, discard pile (top last), the next cards of the draw pile in order.
const ORDNE = `(S, o) => {
  const r = S.spill.r;
  const brukt = new Set([].concat(...o.hender, o.bunke, o.stokk || []));
  const rest = [];
  for (let k = 0; k < 52; k++) if (!brukt.has(k)) rest.push(k);
  r.hender = o.hender.map((h) => h.slice());
  r.bunke = o.bunke.slice();
  r.stokk = rest.concat((o.stokk || []).slice().reverse());
  r.sort = o.sort != null ? o.sort : Math.floor(o.bunke[o.bunke.length - 1] / 13);
  Object.assign(r, { tur: 0, trukket: 0, venter: null, vinner: null, straff: 0, passRad: 0, lost: false, logg: [] });
  r.mangler = r.hender.map(() => []);
  S.spill.resultat = null;
  S.spill.port = false;
}`;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const lastMed = async (endring) => {
    await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    await t.sov(300);
  };
  const ordne = (o) => lastMed(`(S) => (${ORDNE})(S, ${JSON.stringify(o)})`);

  // One move for whoever holds the shown hand: a legal card (not an eight if anything else goes),
  // else draw or pass. Returns false when it isn't a person's turn.
  const gjorTrekk = () =>
    t.js(`(() => {
      if (document.querySelector('[data-h="vis"]')) { document.querySelector('[data-h="vis"]').click(); return "vis"; }
      if (document.querySelector('.vr-farge')) { document.querySelector('.vr-farge').click(); return "farge"; }
      const lov = Array.from(document.querySelectorAll('.vr-hand.min-tur .vr-hk.lovlig'));
      if (lov.length) { (lov.find((b) => !/åtte$/.test(b.getAttribute('aria-label'))) || lov[0]).click(); return "legg"; }
      const k = document.querySelector('.dokk .knapp[data-h="trekk"]:not([disabled]), .dokk .knapp[data-h="pass"]');
      if (k) { k.click(); return k.dataset.h; }
      return "";
    })()`);
  const spillRunde = async (maks = 260) => {
    for (let n = 0; n < maks; n++) {
      const s = await sp();
      if (s.r.vinner != null) return s;
      const gjort = await gjorTrekk();
      await t.sov(gjort ? 380 : 250);
    }
    return sp();
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");

  // ---------- Against the phone ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(/Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet heter ikke «Gjør klart»");
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.vr-hk').length === 7");
  await t.sov(400);
  let s = await sp();
  t.sjekk(s.modus === "mobil" && s.n === 2 && s.niva === 2 && s.mal === "tre" && !s.toer, "Standardoppsettet er ikke du mot én mobil på middels, først til 3, uten toer-regel");
  t.sjekk(s.r.hender[0].length === 7 && s.r.hender[1].length === 7, "To spillere skal få sju kort hver");
  t.sjekk(s.r.bunke.length === 1 && s.r.bunke[0] % 13 !== 7, "Startkortet er en åtter");
  const navn = await t.js(`Array.from(document.querySelectorAll('.vr-hk')).map((b) => b.getAttribute('aria-label'))`);
  t.sjekk(navn.every((n) => /^(spar|hjerter|ruter|kløver) (ess|to|tre|fire|fem|seks|sju|åtte|ni|ti|knekt|dame|konge)$/.test(n)), `Kortene heter ikke «farge verdi»: ${navn.join(", ")}`);
  t.sjekk(await t.friForDokk(".vr-hand"), "Hånda ligger bak handlingsfeltet");
  await t.bilde("din-tur");

  // A whole round against the phone
  s = await spillRunde();
  t.sjekk(s.r.vinner != null && s.resultat, "Runden mot mobilen ble ikke ferdig");
  t.sjekk(s.poeng[s.r.vinner] === 1, "Vinneren av runden fikk ikke en seier");
  const rek = (await t.tilstand()).rekord[2];
  t.sjekk(rek && rek.seier + rek.tap === 1, "Runden ble ikke telt i rekorden mot mobilen");
  t.sjekk(await t.finnes('.dokk [data-h="runde"]'), "Mangler «Ny runde» etter runden");
  await t.bilde("runde-ferdig");

  // New round, then a set-up: an eight on hand → choose the colour
  await t.klikk('[data-h="runde"]', 500);
  await t.vent("document.querySelector('.vr-hand')");
  await ordne({ hender: [[K(1, 8), K(2, 3), K(3, 9)], [K(0, 6), K(0, 7), K(1, 2), K(2, 13), K(3, 12)]], bunke: [K(0, 5)] });
  t.sjekk(await t.finnes('.vr-hk[aria-label="hjerter åtte"].lovlig'), "Hjerter åtte er ikke en knapp som kan legges");
  t.sjekk(await t.js(`document.querySelector('.vr-hk[aria-label="ruter tre"]').getAttribute('aria-disabled') === 'true'`), "Ruter tre er ikke merket som et kort som ikke passer");
  await t.klikk('.vr-hk[aria-label="ruter tre"]', 300);
  t.sjekk((await sp()).r.hender[0].length === 3, "Et kort som ikke passer, ble lagt");
  await t.klikk('.vr-hk[aria-label="hjerter åtte"]', 400);
  t.sjekk((await t.antall(".vr-farge")) === 4, "Fire farger å vri til vises ikke etter åtteren");
  s = await sp();
  t.sjekk(s.r.venter === 0 && s.r.tur === 0, "Runden venter ikke på fargevalget");
  await t.bilde("vri");
  // A reload while choosing: the choice is still there
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk((await t.antall(".vr-farge")) === 4, "Fargevalget forsvant etter omlasting");
  await t.klikk('.vr-farge[data-v="2"]', 300);
  s = await sp();
  t.sjekk(s.r.sort === 2 && s.r.venter == null && s.r.tur === 1, "Åtteren vred ikke til ruter, eller turen gikk ikke videre");
  t.sjekk(/vrir til ruter/.test(await t.tekst(".vr-melding")), "Meldingen sier ikke at du vrir til ruter");
  await t.vent("JSON.parse(localStorage.getItem('rusj.vriatter.v1')).spill.r.tur === 0", 5000);
  s = await sp();
  t.sjekk(s.r.hender[1].length === 4 && s.r.bunke[s.r.bunke.length - 1] === K(2, 13), "Mobilen fulgte ikke ruter med ruter konge");
  await t.bilde("mobilen-svarte");

  // Reload mid-turn: the same hand, the same turn
  const hand = (await sp()).r.hender[0].slice().sort().join();
  await t.lastSide(t.side, "document.querySelector('.vr-hand')");
  await t.sov(300);
  s = await sp();
  t.sjekk(s.r.tur === 0 && s.r.hender[0].slice().sort().join() === hand && (await t.antall(".vr-hk")) === s.r.hender[0].length, "Runden ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.vr-hand')");

  // Nothing to play: draw up to three, then pass; the phone then plays (also after a reload in its turn)
  await ordne({ hender: [[K(1, 3), K(1, 4), K(2, 9)], [K(3, 2), K(3, 3), K(3, 4), K(3, 5), K(3, 6)]], bunke: [K(0, 2)], stokk: [K(2, 5), K(1, 10), K(2, 7)] });
  t.sjekk(/ingenting å legge/.test(await t.tekst(".vr-melding")), "Meldingen sier ikke at du har ingenting å legge");
  for (let n = 0; n < 3; n++) await t.klikk('.dokk [data-h="trekk"]', 350);
  s = await sp();
  t.sjekk(s.r.hender[0].length === 6 && s.r.trukket === 3, "Tre kort ble ikke trukket");
  t.sjekk(await t.finnes('.dokk [data-h="pass"]') && !(await t.finnes('.dokk [data-h="trekk"]')), "«Stå over» vises ikke etter tre trukne kort");
  await t.bilde("sta-over");
  await t.klikk('.dokk [data-h="pass"]', 200);
  s = await sp();
  t.sjekk(s.r.tur === 1, "Turen gikk ikke til mobilen etter «Stå over»");
  await t.lastSide(t.side, "document.querySelector('.vr-hand')");
  await t.vent("JSON.parse(localStorage.getItem('rusj.vriatter.v1')).spill.r.tur === 0", 5000);
  s = await sp();
  t.sjekk(s.r.bunke[s.r.bunke.length - 1] === K(3, 2), "Mobilen la ikke kløver to på spar to etter omlasting");

  // The phone never moves while a sheet is open
  await ordne({ hender: [[K(1, 3), K(1, 4), K(2, 9)], [K(3, 2), K(3, 3), K(3, 4), K(3, 5), K(3, 6)]], bunke: [K(0, 2)], stokk: [K(2, 5), K(1, 10), K(2, 7)] });
  await t.js(`(() => { const S = Rusj.S; S.spill.r.tur = 1; Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('.vr-hand')");
  await t.klikk("#reglerknapp", 100);
  await t.sov(2200);
  t.sjekk((await sp()).r.tur === 1, "Mobilen spilte mens reglene var åpne");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.vent("JSON.parse(localStorage.getItem('rusj.vriatter.v1')).spill.r.tur === 0", 5000);

  // Home shows the record against the phone
  await t.klikk("#tilbake");
  t.sjekk(/Middels/.test(await t.tekst(".vr-rekorder")), "Rekorden mot mobilen vises ikke på hjem");
  await t.bilde("hjem-rekord");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.vr-hand')");

  // «Avslutt» → «Kåringen»
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  t.sjekk(/Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(/vinner!/.test(await t.tekst("#skjerm h1")), `Kåringen sier ikke hvem som vant: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes('.dokk [data-h="del"]') && (await t.finnes('.dokk a.lenke[href="/"]')), "Kåringen mangler «Del resultatet» eller «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  await t.bilde("kaaringen-mobil", true);
  await t.klikk('[data-h="del"]', 600);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Two people on one phone ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="flere"]');
  await t.js("Rusj.S.antall = 2; Rusj.vis()");
  await t.sov(200);
  await t.klikk('[data-h="mal"][data-v="en"]');
  await t.bilde("oppsett-flere", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"vis\"]')");
  s = await sp();
  t.sjekk(s.modus === "flere" && s.n === 2 && s.port, "Flere på én mobil starter ikke bak porten");
  t.sjekk(!(await t.finnes(".vr-hk")), "Kortene vises før «Vis kortene mine»");
  t.sjekk((await t.tekst("#skjerm h1")).includes(s.r.tur === 0 ? "Testspiller A" : "Testspiller B"), "Porten sier ikke hvem som skal ha mobilen");
  await t.bilde("port");
  await t.klikk('[data-h="vis"]', 300);
  t.sjekk((await t.antall(".vr-hk")) === 7, "Kortene vises ikke etter «Vis kortene mine»");
  await t.bilde("flere-hand");
  // A reload with the hand showing: back behind the gate
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
  t.sjekk(await t.finnes('[data-h="vis"]') && !(await t.finnes(".vr-hk")), "Kortene vises rett etter omlasting – porten mangler");
  await t.klikk('[data-h="vis"]', 300);
  // After a move that ends the turn, the gate comes back for the other player
  const forste = (await sp()).r.tur;
  for (let n = 0; n < 6 && (await sp()).r.tur === forste; n++) {
    await gjorTrekk();
    await t.sov(300);
  }
  s = await sp();
  if (s.r.vinner == null) {
    t.sjekk(s.r.tur !== forste && s.port && (await t.finnes('[data-h="vis"]')) && !(await t.finnes(".vr-hk")), "Porten kom ikke tilbake da turen gikk videre");
    t.sjekk(/la |står over/.test(await t.tekst(".vr-sist-port")), "Porten sier ikke hva forrige spiller gjorde");
  }
  s = await spillRunde();
  t.sjekk(s.r.vinner != null && s.resultat, "Runden for to på én mobil ble ikke ferdig");
  await t.bilde("flere-ferdig");
  await t.klikk('[data-h="kaaring"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.sov(400);
  const vinner = s.r.vinner === 0 ? "Testspiller A" : "Testspiller B";
  t.sjekk((await t.tekst("#skjerm h1")) === `${vinner} vinner!`, `Kåringen viser feil vinner: «${await t.tekst("#skjerm h1")}»`);
  const kveld = await t.js(`JSON.parse(localStorage.getItem("rusj.kveld") || "null")`);
  const siste = kveld && kveld.spill && kveld.spill[kveld.spill.length - 1];
  t.sjekk(siste && siste.id === "vriatter" && siste.resultat.length === 2, "Kåringen ble ikke registrert i Kveldens gjeng (bare menneskene)");
  await t.bilde("kaaringen-flere", true);
}
