// Kodeknekkeren: set up, fetch the key with the join code on a "second phone" (a fresh page load
// with #CODE) and check it matches the board, play turns (right, neutral, wrong team, end turn,
// undo, timer), survive a reload, win a board, start the next board on both "phones", hit the
// trap and undo it, and look at the board on a tablet and a laptop.
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";

function bildemappe(id) {
  const i = process.argv.indexOf("--bilder");
  const rot = i > 0 ? resolve(process.argv[i + 1]) : join(tmpdir(), "rusj-e2e");
  const mappe = join(rot, id);
  mkdirSync(mappe, { recursive: true });
  return mappe;
}

// The phone size the runner uses (--bredde / --hoyde), to return to after other screen sizes.
const flaggTall = (navn, standard) => {
  const i = process.argv.indexOf(navn);
  return (i > 0 && Number(process.argv[i + 1])) || standard;
};
const MOBIL = { width: flaggTall("--bredde", 390), height: flaggTall("--hoyde", 844), deviceScaleFactor: 2, mobile: true };

// Screenshot at another screen size (tablet / laptop), then back to the phone.
async function bredBilde(t, navn, bredde, hoyde) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 1, mobile: false });
  await t.sov(500);
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const brett = await t.js("(() => { const b = document.querySelector('.kk-brett'); if (!b) return null; const r = b.getBoundingClientRect(); return { bunn: Math.round(r.bottom), bredde: Math.round(r.width) }; })()");
  if (brett) t.sjekk(brett.bunn <= hoyde + 2, `Brettet går utenfor skjermen på ${bredde}×${hoyde} (bunn ${brett.bunn}px)`);
  const kutt = await t.js("Array.from(document.querySelectorAll('.kk-ord')).filter(o => o.getBoundingClientRect().width > o.parentElement.clientWidth + 1).length");
  t.sjekk(kutt === 0, `${kutt} ord er for brede for kortet på ${bredde}×${hoyde}`);
  // On a laptop or TV, whose turn it is must be readable from across the room
  const tur = await t.js("(() => { const b = document.querySelector('.kk-tur b'); return b ? parseFloat(getComputedStyle(b).fontSize) : 0; })()");
  if (navn === "brett" && bredde >= 1200) t.sjekk(tur >= 36, `«… sin tur» er bare ${tur}px på ${bredde}×${hoyde}`);
  await t.skjermbilde(join(bildemappe(t.id), `bred-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

// Two real finger taps on the same spot, quickly (a double tap).
async function dobbeltTrykk(t, sel, mellom = 110) {
  await t.js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center" })`);
  await t.sov(150);
  const p = await t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width * 0.75, y: b.y + b.height / 2 }; })()`);
  for (let n = 0; n < 2; n++) {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (n === 0) await t.sov(mellom);
  }
  await t.sov(450);
}

// Small phones: the whole board and the main button must be visible without scrolling.
async function mobilBilde(t, navn, bredde, hoyde) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });
  await t.sov(450);
  await t.js("window.scrollTo(0, 0)");
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const mal = await t.js(`(() => { const b = document.querySelector('.kk-brett').getBoundingClientRect(); const k = document.querySelector('.dokk .knapp').getBoundingClientRect();
    const ord = Array.from(document.querySelectorAll('.kk-ord'));
    return { brettBunn: b.bottom, knappTopp: k.top, knappBunn: k.bottom, minste: Math.min(...ord.map(o => parseFloat(getComputedStyle(o).fontSize))),
      kutt: ord.filter(o => o.getBoundingClientRect().width > o.parentElement.clientWidth + 1).length }; })()`);
  t.sjekk(mal.brettBunn <= mal.knappTopp + 2 && mal.knappBunn <= hoyde + 1, `Brettet og knappen får ikke plass på ${bredde}×${hoyde} uten scrolling (brett ${Math.round(mal.brettBunn)}, knapp ${Math.round(mal.knappTopp)}–${Math.round(mal.knappBunn)})`);
  t.sjekk(mal.kutt === 0, `${mal.kutt} ord er for brede for kortene på ${bredde}×${hoyde}`);
  // Worst case over every possible word (measured): 11.6 px at 390, 12.9 px at 375, 10.4 px at 320.
  const minst = bredde < 360 ? 10 : 11.5;
  t.sjekk(mal.minste >= minst, `Ordene blir bare ${mal.minste.toFixed(1)}px på ${bredde}×${hoyde} (minst ${minst}px)`);
  await t.skjermbilde(join(bildemappe(t.id), `mobil-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

const vertLag = (l) => (l === 0 ? "Lag Rosa" : "Lag Blå");
const kortAv = (sp, type, unntak = []) => sp.nokkel.findIndex((x, i) => x === type && !sp.vist.includes(i) && !unntak.includes(i));

export default async function (t) {
  await t.start();
  t.sjekk(await t.finnes('[data-h="bli-med"]'), "Mangler «Jeg er kodemester» på hjem-skjermen");

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="ord"][data-v="lett"]');
  t.sjekk((await t.tilstand()).oppsett.lett === true, "«Bare lette ord» ble ikke valgt");
  await t.klikk('[data-h="ord"][data-v="alle"]');
  await t.klikk('[data-h="start"]');

  // ---------- Key screen: join code + QR ----------
  await t.vent("document.querySelector('#kk-kode')");
  t.sjekk(await t.finnes(".kk-kodekort .qr svg"), "QR-koden vises ikke");
  await t.bilde("nokkel-kode");
  const kode = await t.js("document.querySelector('#kk-kode').dataset.kode");
  t.sjekk(/^[0-9A-Z]{8}$/.test(kode), `Koden ser rar ut: ${kode}`);
  let S = await t.tilstand();
  let sp = S.spill;
  t.sjekk(sp.ord.length === 25 && new Set(sp.ord.map((o) => o.toLowerCase())).size === 25, "Brettet har ikke 25 ulike ord");
  t.sjekk(sp.ord.every((o) => /^[A-Za-zÆØÅæøåÉé]{3,11}$/.test(o)), "Brettet har ord som ikke er enkle ord på 3–11 bokstaver");
  const telling = [0, 1, 2, 3].map((x) => sp.nokkel.filter((y) => y === x).length);
  t.sjekk(telling[sp.start] === 9 && telling[1 - sp.start] === 8 && telling[2] === 7 && telling[3] === 1, `Feil fordeling i nøkkelen: ${telling.join("/")}`);

  // Hold-to-reveal on this screen
  await t.klikk('[data-h="nokkelmodus"][data-v="skjerm"]');
  t.sjekk((await t.tilstand()).oppsett.nokkel === "skjerm", "Nøkkel-modus ble ikke byttet");
  const slipp = await t.hold(".mappe", 800);
  t.sjekk((await t.antall(".mappe.apen .kk-n")) === 25, "Hold-kortet viser ikke 25 ruter i nøkkelen");
  const minstNokkel = await t.js("Math.min(...Array.from(document.querySelectorAll('.mappe.apen .kk-ord')).map(o => parseFloat(getComputedStyle(o).fontSize)))");
  t.sjekk(minstNokkel >= (MOBIL.width < 360 ? 9 : 11), `Ordene på «Kun kodemestere»-kortet er bare ${minstNokkel.toFixed(1)}px`);
  await t.bilde("nokkel-holdt");
  await slipp();
  t.sjekk(!(await t.finnes(".mappe.apen")), "Hold-kortet lukket seg ikke");
  await t.klikk('[data-h="nokkelmodus"][data-v="mobil"]');

  // ---------- The board ----------
  await t.klikk('[data-h="til-brett"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 25");
  await t.bilde("brett");
  const kutt = await t.js("Array.from(document.querySelectorAll('.kk-ord')).filter(o => o.getBoundingClientRect().width > o.parentElement.clientWidth + 1).length");
  t.sjekk(kutt === 0, `${kutt} ord er for brede for kortene på mobil`);
  const minsteFont = await t.js("Math.min(...Array.from(document.querySelectorAll('.kk-ord')).map(o => parseFloat(getComputedStyle(o).fontSize)))");
  t.sjekk(minsteFont >= (MOBIL.width < 360 ? 10 : 11.5), `Minste ord på brettet er bare ${minsteFont.toFixed(1)}px`);

  // Right guess: the team keeps the turn
  const lag = sp.tur;
  const eget = kortAv(sp, lag);
  await t.klikk(`.kk-kort[data-v="${eget}"]`);
  S = await t.tilstand();
  t.sjekk(S.spill.vist.includes(eget) && S.spill.tur === lag, "Riktig gjetning skulle beholde turen");
  t.sjekk(await t.finnes(".kk-melding.riktig"), "Mangler melding etter riktig gjetning");
  await t.bilde("riktig");

  // Neutral word: the turn goes over
  const noytral = kortAv(S.spill, 2);
  await t.klikk(`.kk-kort[data-v="${noytral}"]`);
  S = await t.tilstand();
  t.sjekk(S.spill.tur === 1 - lag, "Nøytralt ord skulle gi turen til det andre laget");

  // Undo brings the card back and the turn with it
  await t.klikk('[data-h="angre"]');
  S = await t.tilstand();
  t.sjekk(!S.spill.vist.includes(noytral) && S.spill.tur === lag, "Angre virket ikke");

  // The other team's agent: turn goes over
  const motstander = kortAv(S.spill, 1 - lag);
  await t.klikk(`.kk-kort[data-v="${motstander}"]`);
  S = await t.tilstand();
  t.sjekk(S.spill.tur === 1 - lag && (await t.finnes(".kk-melding.feil")), "Motstanderens ord skulle gi turen videre");
  await t.bilde("feil-lag");

  // End the turn by hand: the button has the colour of the team playing and says who is next.
  // A double tap (two real taps 110 ms apart) hands the turn over once – not over and back.
  t.sjekk(new RegExp(`${vertLag(1 - lag)} er ferdig`).test(await t.tekst('[data-h="ferdig"]')), "Hovedknappen sier ikke hvilket lag som er ferdig");
  t.sjekk(new RegExp(`Turen går til ${vertLag(lag)}`).test(await t.tekst('[data-h="ferdig"]')), "Hovedknappen sier ikke hvem som får turen");
  await dobbeltTrykk(t, '[data-h="ferdig"]');
  S = await t.tilstand();
  t.sjekk(S.spill.tur === lag, "Dobbelttrykk på «… er ferdig» ga turen over og tilbake igjen");

  // ---------- Second phone: the join link shows the same key ----------
  const vert = S.spill;
  await t.lastSide(`${t.side}#${kode}`, "document.querySelector('.kk-nokkel')");
  t.sjekk((await t.antall(".kk-nokkel .kk-n")) === 25, "Kodemesteren ser ikke 25 ruter");
  const gjest = await t.js("Array.from(document.querySelectorAll('.kk-nokkel .kk-n')).map(b => ({ o: b.querySelector('.kk-ord .hel').textContent, t: Number(b.className.match(/\\bt(\\d)\\b/)[1]) }))");
  t.sjekk(gjest.every((g, i) => g.o === vert.ord[i] && g.t === vert.nokkel[i]), "Nøkkelen fra koden stemmer ikke med brettet");
  t.sjekk(new RegExp(vert.start === 0 ? "Rosa" : "Blå").test(await t.tekst(".kk-starter")), "Kodemesteren ser feil lag som begynner");
  await t.bilde("kodemester");
  await t.js("window.scrollTo(0, document.documentElement.scrollHeight)");
  await t.bilde("kodemester-lister");
  await t.js("window.scrollTo(0, 0)");
  await t.klikk(`.kk-n[data-v="${eget}"]`);
  t.sjekk((await t.tilstand()).gjest.tatt.includes(eget), "Kodemesteren kunne ikke krysse ut et ord");
  await t.klikk('[data-h="skjul"]');
  t.sjekk(await t.finnes(".kk-dekke"), "Nøkkelen ble ikke skjult");
  await t.bilde("kodemester-skjult");
  await t.klikk('[data-h="skjul"]');

  // Typing a code: wrong, then right (lower case with a dash)
  await t.klikk('[data-h="bli-med"]');
  await t.skrivInn("#kk-kodefelt", "abcd");
  await t.klikk('button[type="submit"]');
  t.sjekk(/tegn/.test(await t.tekst("#kk-kodefeil")), "Mangler feilmelding for for kort kode");
  const feilKode = kode.slice(0, 7) + (kode[7] === "0" ? "1" : "0");
  await t.skrivInn("#kk-kodefelt", feilKode);
  await t.klikk('button[type="submit"]');
  t.sjekk(/stemmer ikke/.test(await t.tekst("#kk-kodefeil")), "En feil kode ble godtatt");
  await t.bilde("bli-med-feil");
  await t.skrivInn("#kk-kodefelt", kode.slice(0, 4).toLowerCase() + "-" + kode.slice(4).toLowerCase());
  await t.vent("document.querySelector('.kk-nokkel')", 4000);
  t.sjekk((await t.tilstand()).gjest.fro === vert.fro, "Koden skrevet med små bokstaver ga feil brett");

  // A broken link goes to the form with a message
  await t.lastSide(`${t.side}#XYZ`, "document.querySelector('#kk-kodefelt')");
  t.sjekk(/gyldig/.test(await t.tekst("#kk-kodefeil")), "Ugyldig lenke viser ingen feilmelding");

  // ---------- Back on the board device: the game is still there ----------
  // (A reload never opens the key by itself: it shows the join screen with a button back to it.)
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(!(await t.finnes(".kk-nokkel")), "Omlasting viste nøkkelen uten at kodemesteren ba om det");
  t.sjekk(await t.finnes('.dokk .knapp[data-h="til-gjest"]'), "Med en lagret nøkkel skulle «Vis nøkkelen til brett …» være hovedknappen");
  t.sjekk(/ny kode/i.test(await t.tekst('label[for="kk-kodefelt"]')),"Kodefeltet skulle hete «Ny kode» når en nøkkel er lagret");
  await t.bilde("bli-med-igjen");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.knapp[data-h="fortsett"]'), "«Fortsett» skulle være hovedknappen mens et spill pågår");
  // «Nytt spill» asks first and keeps the game when you say no
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  await t.bilde("bekreft-nytt");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.tilstand()).spill !== null, "Spillet forsvant selv om vi trykket «Avbryt»");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 25");
  S = await t.tilstand();
  t.sjekk(S.spill.vist.length === 2 && S.spill.tur === lag, "Brettet ble ikke gjenopptatt riktig");

  // Reload mid-game
  await t.lastSide(t.side, "document.querySelectorAll('.kk-kort').length === 25");
  t.sjekk((await t.antall(".kk-kort.vist")) === 2, "Avslørte kort forsvant etter omlasting");

  // The key sheet on the board
  await t.klikk('[data-h="nokkel-ark"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) #kk-kode"), "Nøkkel-arket viser ikke koden");
  await t.bilde("nokkel-ark");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Small phones, tablet and laptop
  await mobilBilde(t, "brett", 375, 667);
  await mobilBilde(t, "brett", 375, 560);
  await mobilBilde(t, "brett", 320, 568);
  await bredBilde(t, "brett", 768, 1024);
  await bredBilde(t, "brett", 1024, 768);
  await bredBilde(t, "brett", 1440, 900);
  await bredBilde(t, "brett", 844, 390);

  // Keyboard: Enter on a hidden card flips it, and focus stays on the board (not on <body>)
  S = await t.tilstand();
  const medTast = kortAv(S.spill, S.spill.tur);
  await t.js(`document.querySelector('.kk-kort[data-v="${medTast}"]').focus()`);
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await t.sov(300);
  t.sjekk((await t.tilstand()).spill.vist.includes(medTast), "Enter på et kort snudde det ikke");
  t.sjekk(await t.js("!!document.activeElement && document.activeElement.classList.contains('kk-kort')"), "Fokus falt ut av brettet da et kort ble snudd med tastaturet");

  // ---------- Win: the team on turn finds all its agents ----------
  S = await t.tilstand();
  const vinnerLag = S.spill.tur;
  for (;;) {
    const sp2 = (await t.tilstand()).spill;
    if (sp2.vinner != null) break;
    const i = kortAv(sp2, vinnerLag);
    if (i < 0) break;
    await t.klikk(`.kk-kort[data-v="${i}"]`, 60);
  }
  await t.vent("document.querySelector('.kk-banner')", 6000);
  S = await t.tilstand();
  t.sjekk(S.spill.vinner === vinnerLag && S.spill.grunn === "alle", "Laget som fant alle agentene vant ikke");
  t.sjekk(S.spill.stilling[vinnerLag] === 1, "Stillingen ble ikke oppdatert");
  t.sjekk((await t.antall(".kk-kort.fasit")) > 0, "Resultatet viser ikke hele nøkkelen");
  await t.bilde("slutt", true);
  await bredBilde(t, "slutt", 1440, 900);

  // ---------- Next board on both "phones" ----------
  await t.klikk('[data-h="nytt-brett"]');
  await t.vent("document.querySelector('#kk-kode')");
  const kode2 = await t.js("document.querySelector('#kk-kode').dataset.kode");
  t.sjekk(kode2 !== kode, "Nytt brett ga samme kode");
  S = await t.tilstand();
  const vert2 = S.spill;
  t.sjekk(vert2.brett === 1 && vert2.start === 1 - vert.start && vert2.stilling[vinnerLag] === 1, "Brett 2 er ikke satt opp riktig");
  await t.bilde("nokkel-brett-2");
  // The code master who already has the old code just taps "Neste brett"
  await t.lastSide(`${t.side}#${kode}`, "document.querySelector('.kk-nokkel')");
  await t.klikk('[data-h="gjest-neste"]');
  await t.bilde("kodemester-neste-brett");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('#skjerm h1').textContent.includes('2')");
  const gjest2 = await t.js("Array.from(document.querySelectorAll('.kk-nokkel .kk-n')).map(b => ({ o: b.querySelector('.kk-ord .hel').textContent, t: Number(b.className.match(/\\bt(\\d)\\b/)[1]) }))");
  t.sjekk(gjest2.every((g, i) => g.o === vert2.ord[i] && g.t === vert2.nokkel[i]), "«Neste brett» på kodemesterens mobil stemmer ikke med brett 2");
  // …and the new code gives the same
  await t.lastSide(`${t.side}#${kode2}`, "document.querySelector('.kk-nokkel')");
  const gjest3 = await t.js("Array.from(document.querySelectorAll('.kk-nokkel .kk-ord .hel')).map(o => o.textContent)");
  t.sjekk(gjest3.join() === vert2.ord.join(), "Den nye koden gir ikke brett 2");

  // ---------- The trap ends the board; undo saves the day ----------
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 25");
  S = await t.tilstand();
  const felle = S.spill.nokkel.indexOf(3);
  const taper = S.spill.tur;
  await t.klikk(`.kk-kort[data-v="${felle}"]`, 300);
  await t.bilde("fella");
  await t.vent("document.querySelector('.kk-banner')", 6000);
  S = await t.tilstand();
  t.sjekk(S.spill.vinner === 1 - taper && S.spill.grunn === "fella", "Fella ga ikke seieren til det andre laget");
  t.sjekk(/fella/.test(await t.tekst(".kk-banner")), "Resultatet sier ikke at noen gikk i fella");
  await t.bilde("slutt-fella");
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelectorAll('.kk-kort').length === 25 && !document.querySelector('.kk-banner')");
  S = await t.tilstand();
  t.sjekk(S.spill.vinner == null && !S.spill.vist.includes(felle) && S.spill.stilling[1 - taper] === (1 - taper === vinnerLag ? 1 : 0), "Angre etter fella virket ikke");

  // ---------- «Endre oppsett» after a board keeps the score; turn timer ----------
  await t.klikk(`.kk-kort[data-v="${felle}"]`, 300);
  await t.vent("document.querySelector('.kk-banner')", 6000);
  const stillingFor = (await t.tilstand()).spill.stilling.join("-");
  await t.klikk('[data-h="endre"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Endre oppsett» skulle ikke spørre – stillingen beholdes");
  await t.klikk('[data-h="tid"][data-v="60"]');
  await t.klikk('[data-h="start"]');
  t.sjekk((await t.tilstand()).spill.stilling.join("-") === stillingFor, "Stillingen forsvant da oppsettet ble endret");
  await t.klikk('[data-h="til-brett"]');
  await t.vent("document.querySelector('#kk-tid .timer-tid')");
  const forTur = (await t.tilstand()).spill.tur;
  await t.bilde("brett-med-tidsur");
  await t.js("Rusj.timer('kk-tid').leggTil(-59)");
  await t.vent(`JSON.parse(localStorage.getItem("rusj.kodeknekkeren.v1")).spill.tur === ${1 - forTur}`, 5000);
  t.sjekk(await t.finnes(".kk-melding.tid"), "Mangler melding når tiden er ute");
  t.sjekk(/1:0\d|0:5\d/.test(await t.tekst("#kk-tid .timer-tid")), "Tidsuret startet ikke på nytt for neste lag");

  // «Avslutt» ends the whole game after a confirmation
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  t.sjekk((await t.tilstand()).spill === null, "Avslutt fjernet ikke spillet");
  t.sjekk(await t.finnes('.knapp[data-h="nytt"]'), "Uten spill skulle «Start spill» være hovedknappen");
}
