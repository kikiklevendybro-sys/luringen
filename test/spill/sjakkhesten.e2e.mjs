// Sjakkhesten: two players play en passant, a promotion (with the choice of piece), undo, flip and
// a reload mid-game, agree on a draw, then Scholar's mate with colours swapped; castling from a
// saved position; threefold repetition; a clock running out; then games against the phone: it
// answers within 2 s without freezing the page, «Angre» takes back its answer, and as black the
// phone moves first. The board must fit above the dock on small phones.
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
const flaggTall = (navn, standard) => {
  const i = process.argv.indexOf(navn);
  return (i > 0 && Number(process.argv[i + 1])) || standard;
};
const MOBIL = { width: flaggTall("--bredde", 390), height: flaggTall("--hoyde", 844), deviceScaleFactor: 2, mobile: true };

const rute = (v) => `[data-h="rute"][data-v="${v}"]`;

// Another screen size: everything must fit (board above the dock, no sideways scrolling).
async function storrelse(t, navn, bredde, hoyde, mobil = true) {
  await t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: mobil ? 2 : 1, mobile: mobil });
  await t.sov(500);
  await t.js("window.scrollTo(0, 0)");
  const over = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(over <= 0, `Sidelengs scrolling på ${bredde}×${hoyde} («${navn}»): ${over}px`);
  const mal = await t.js(`(() => {
    const b = document.querySelector('.skjerm-spill .sh-brett').getBoundingClientRect();
    const d = document.querySelector('.skjerm-spill .dokk').getBoundingClientRect();
    const v = document.querySelector('.sh-verktoy').getBoundingClientRect();
    const bunn = document.querySelector('.sh-spiller.bunn').getBoundingClientRect();
    return { brett: Math.round(b.bottom), bredde: Math.round(b.width), venstre: Math.round(b.left), dokkTopp: Math.round(d.top), bunnBar: Math.round(bunn.bottom), verktoy: Math.round(v.bottom), scroll: document.documentElement.scrollHeight - window.innerHeight };
  })()`);
  t.sjekk(mal.scroll <= 1, `Brettskjermen scroller ${mal.scroll}px på ${bredde}×${hoyde}`);
  t.sjekk(mal.verktoy <= hoyde + 1, `Verktøyene havner under skjermkanten på ${bredde}×${hoyde}`);
  t.sjekk(mal.bredde >= 230, `Brettet er bare ${mal.bredde}px på ${bredde}×${hoyde}`);
  await t.skjermbilde(join(bildemappe(t.id), `str-${navn}-${bredde}x${hoyde}.png`));
  await t.send("Emulation.setDeviceMetricsOverride", MOBIL);
  await t.sov(400);
}

// Change the saved game (also in memory, since the page saves on unload) and reload.
async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(300);
}

export default async function (t) {
  const flytt = async (fra, til, ms = 90) => {
    await t.klikk(rute(fra), 40);
    await t.klikk(rute(til), ms);
  };
  const trekk = async () => (await t.tilstand()).spill.trekk;
  const brikke = (v) => t.js(`(() => { const u = document.querySelector('${rute(v)} use'); return u ? u.getAttribute('href') : ''; })()`);

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  // The kit's «install as app» tip opens 1.8 s after a finished game, also over the next one;
  // count it as already shown so it doesn't cover the screenshots.
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett-mobil", true);
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.klikk('[data-h="klokke"][data-v="0"]');
  await t.bilde("oppsett-to", true);
  t.sjekk((await t.antall(".spiller")) === 2, "To spillere skal ha to navnefelt");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sh-rute').length === 64");
  await t.sov(300);
  await t.bilde("start");
  t.sjekk((await t.tilstand())._aktiv === true, "Et pågående parti er ikke merket som aktivt");

  // Select a pawn: two dots; a knight jumps
  await t.klikk(rute("e2"));
  t.sjekk((await t.antall(".sh-rute.mal")) === 2, "Bonden på e2 skal ha to mulige trekk");
  await t.bilde("valgt");
  await t.klikk(rute("e4"), 200);
  t.sjekk((await trekk()).join() === "e2e4", "Trekket e2–e4 ble ikke spilt");
  await t.sov(700); // the board turns to black
  t.sjekk((await t.js("document.querySelector('.sh-rute').dataset.v")) === "h1", "Brettet snudde ikke til svart etter hvit sitt trekk");

  // En passant
  await flytt("d7", "d5");
  await flytt("e4", "e5");
  await flytt("f7", "f5");
  await t.klikk(rute("e5"));
  t.sjekk(await t.finnes(`${rute("f6")}.mal.slag`), "En passant vises ikke som mulig slag");
  await t.klikk(rute("f6"), 200);
  t.sjekk(!(await brikke("f5")), "Bonden på f5 ble ikke slått en passant");
  await t.bilde("en-passant");

  // Promotion with a choice
  await flytt("b8", "c6");
  await flytt("f6", "g7");
  await flytt("c6", "e5");
  await flytt("g7", "h8", 300);
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="forfrem"]'), "Valget av brikke kom ikke da bonden nådde fram");
  await t.bilde("forfremming");
  await t.klikk('#ark [data-h="forfrem"][data-v="5"]', 250);
  t.sjekk((await brikke("h8")) === "#sh-05", "Bonden ble ikke til en hvit dronning");
  t.sjekk(/=D/.test(await t.js("document.querySelector('#si').textContent + ' ' + Rusj.S.spill.trekk.join(' ')")) || (await trekk()).includes("g7h8q"), "Forfremmingen ble ikke lagret som dronning");

  // Undo, then promote to a knight instead
  await t.sov(700);
  await t.klikk('[data-h="angre"]', 300);
  t.sjekk((await brikke("h8")) === "#sh-14" && (await brikke("g7")) === "#sh-01", "«Angre» tok ikke tilbake forfremmingen");
  await flytt("g7", "h8", 300);
  await t.klikk('#ark [data-h="forfrem"][data-v="2"]', 250);
  t.sjekk((await trekk()).includes("g7h8n"), "Bonden ble ikke til springer");

  // Flip by hand, reload, back + continue
  await t.sov(800); // the automatic turn of the board after the move
  const forste = await t.js("document.querySelector('.sh-rute').dataset.v");
  await t.klikk('[data-h="snu"]', 700);
  t.sjekk((await t.js("document.querySelector('.sh-rute').dataset.v")) !== forste, "«Snu» snudde ikke brettet");
  const lengde = (await trekk()).length;
  await t.lastSide(t.side, "document.querySelectorAll('.sh-rute').length === 64");
  t.sjekk((await trekk()).length === lengde && (await brikke("h8")) === "#sh-02", "Partiet ble ikke gjenopprettet etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens partiet pågår");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.sh-rute').length === 64");

  // Agree on a draw
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Avslutt» spør ikke");
  await t.bilde("avslutt-valg");
  await t.klikk('#ark [data-h="ark-svar"][data-v="0"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(/Remis/.test(await t.tekst("#skjerm h1")), "Remis vises ikke på sluttskjermen");
  t.sjekk(/KÅRINGEN|Kåringen/.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");

  // Colours swap: Testspiller B has white and gives Scholar's mate
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelectorAll('.sh-rute').length === 64");
  t.sjekk((await t.tilstand()).spill.hvit === 1, "Fargene byttet ikke ved «Spill igjen»");
  for (const [fra, til] of [["e2", "e4"], ["e7", "e5"], ["f1", "c4"], ["b8", "c6"], ["d1", "h5"], ["g8", "f6"]]) await flytt(fra, til);
  await t.sov(650);
  await t.bilde("for-matt");
  await flytt("h5", "f7", 500);
  t.sjekk(await t.finnes(".sh-stempel"), "«Sjakkmatt!» vises ikke på brettet");
  await t.bilde("sjakkmatt");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(400);
  await t.bilde("slutt-matt", true);
  t.sjekk(/Testspiller B vinner/.test(await t.tekst("#skjerm h1")), `Vinneren vises ikke: «${await t.tekst("#skjerm h1")}»`);
  let s = await t.tilstand();
  t.sjekk(s.stilling.seire[1] === 1 && s.stilling.remis === 1, "Stillingen telte ikke seieren og remisen");
  t.sjekk(s._aktiv === false, "Et ferdig parti skal ikke være merket som pågående");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Sluttskjermen mangler «Alle spill»");

  // Castling from a saved position (and the rook jumps)
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelectorAll('.sh-rute').length === 64");
  await lastMed(t, `(S) => { S.spill.trekk = ["e2e4","e7e5","g1f3","b8c6","f1c4","f8c5"]; S.spill.hvit = 0; }`);
  await t.klikk(rute("e1"));
  t.sjekk(await t.finnes(`${rute("g1")}.mal`), "Kort rokade vises ikke som mulig trekk");
  await t.klikk(rute("g1"), 400);
  t.sjekk((await brikke("f1")) === "#sh-04" && (await brikke("g1")) === "#sh-06", "Rokaden flyttet ikke kongen og tårnet");
  await t.bilde("rokade");

  // Threefold repetition: the knights go out and back; the start position comes a third time
  await lastMed(t, `(S) => { S.spill.trekk = ["g1f3","g8f6","f3g1","f6g8","g1f3","g8f6","f3g1"]; }`);
  await flytt("f6", "g8", 400);
  t.sjekk(/gjentakelse|Tre like/i.test(JSON.stringify((await t.tilstand()).spill.resultat) + (await t.tekst("#skjerm"))), "Tre like stillinger ga ikke remis");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  t.sjekk(/tre like stillinger/i.test(await t.tekst(".banner")), "Sluttskjermen forklarer ikke trekkgjentakelsen");
  await t.bilde("gjentakelse");

  // A clock that runs out
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="klokke"][data-v="5"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sh-rute').length === 64");
  t.sjekk(await t.finnes("#sh-klokke-0"), "Sjakklokka vises ikke");
  await flytt("e2", "e4", 300);
  await t.bilde("klokke");
  await lastMed(t, `(S) => { S.spill.klokke.igjen = [300000, 1200]; }`);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  t.sjekk(/tiden er ute/i.test(await t.tekst(".banner")) && /Testspiller A vinner/.test(await t.tekst("#skjerm h1")), "Tiden ute ga ikke riktig resultat");
  await t.bilde("tid-ute");

  // Against the phone (Vanskelig, white): it answers in time, and the page keeps breathing
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="mobil"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="farge"][data-v="hvit"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelectorAll('.sh-rute').length === 64");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  const t0 = Date.now();
  await flytt("e2", "e4", 50);
  await t.bilde("mobilen-tenker");
  await t.vent("Rusj.S.spill.trekk.length === 2", 6000);
  const brukt = Date.now() - t0;
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(brukt < 2600, `Mobilen brukte ${brukt} ms på å svare`);
  t.sjekk(gap < 120, `Siden frøs i ${Math.round(gap)} ms mens mobilen tenkte`);
  await t.sov(400);
  await t.bilde("mobilen-svarte");
  await flytt("g1", "f3", 50);
  await t.vent("Rusj.S.spill.trekk.length === 4", 6000);
  await t.sov(300);
  await t.klikk('[data-h="angre"]', 300);
  t.sjekk((await trekk()).length === 2, "«Angre» mot mobilen skal ta tilbake to halvtrekk");
  await t.bilde("angret");

  // Drag and drop with the mouse: d2 → d4
  const midt = (v) => t.js(`(() => { const b = document.querySelector('${rute(v)}').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const a = await midt("d2");
  const b = await midt("d4");
  await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
  await t.send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    await t.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x + ((b.x - a.x) * i) / 10, y: a.y + ((b.y - a.y) * i) / 10, button: "left", buttons: 1 });
    await t.sov(16);
  }
  t.sjekk(await t.finnes(".sh-svever"), "Brikka følger ikke fingeren når den dras");
  await t.skjermbilde(join(bildemappe(t.id), "dra.png"));
  await t.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await t.sov(200);
  t.sjekk((await trekk())[2] === "d2d4", `Dra-og-slipp spilte ikke d2–d4 (${(await trekk())[2]})`);
  t.sjekk(!(await t.finnes(".sh-svever")), "Den dratte brikka ble liggende igjen");
  await t.vent("Rusj.S.spill.trekk.length === 4", 6000);

  // A win against the phone, then «Angre» from the result screen takes the mate back
  await lastMed(t, `(S) => { S.spill.trekk = ["e2e4","e7e5","f1c4","b8c6","d1h5","g8f6"]; S.spill.meg = 0; }`);
  await flytt("h5", "f7", 300);
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  t.sjekk(/Du vinner/.test(await t.tekst("#skjerm h1")), `Seier mot mobilen vises ikke: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.tilstand()).rekord[3].seier === 1, "Seieren ble ikke telt mot Vanskelig");
  await t.bilde("du-vinner", true);
  await t.klikk('.dokk [data-h="angre"]');
  await t.vent("document.querySelectorAll('.sh-rute').length === 64");
  t.sjekk((await trekk()).length === 6 && (await t.tilstand()).rekord[3].seier === 0 && !(await t.tilstand()).spill.ferdig, "«Angre» på sluttskjermen tok ikke tilbake matten");

  // Small phones: everything fits
  await storrelse(t, "brett", 375, 560);
  await storrelse(t, "brett", 320, 568);
  await storrelse(t, "brett", 1280, 800, false);
  await storrelse(t, "brett", 768, 1024, false);

  // Give up → the phone wins; then as black the phone moves first
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt')");
  t.sjekk(/Mobilen vinner/.test(await t.tekst("#skjerm h1")), "Å gi opp skal la mobilen vinne");
  await t.bilde("ga-opp", true);
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="niva"][data-v="1"]');
  await t.klikk('[data-h="farge"][data-v="svart"]');
  await t.klikk('[data-h="start"]');
  await t.vent("Rusj.S.spill && Rusj.S.spill.trekk.length === 1", 5000);
  t.sjekk((await t.js("document.querySelector('.sh-rute').dataset.v")) === "h1", "Som svart skal svarte brikker stå nederst");
  t.sjekk(await t.js("document.querySelector('[data-h=angre]').disabled"), "«Angre» skal være av før du har flyttet");
  await t.bilde("svart-mot-lett");

  // Leaving while the phone thinks must not make it move on another screen
  const rad = await t.js("Rusj.S.spill.trekk.length");
  await flytt("e7", "e5", 30);
  await t.klikk("#tilbake");
  await t.sov(1500);
  t.sjekk((await t.js("Rusj.S.skjerm")) === "hjem", "Mobilen sitt trekk dro spilleren tilbake til brettet");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`Rusj.S.spill.trekk.length === ${rad + 2}`, 6000);
}
