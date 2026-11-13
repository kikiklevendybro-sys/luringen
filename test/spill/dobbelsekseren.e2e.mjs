// Dobbelsekseren (dominoes): two people on one phone, draw game to 50. The gate hides the tiles
// between turns and tells what happened; a tile that doesn't fit is refused, one that fits one end
// is laid with one tap, one that fits both ends asks where; drawing when nothing fits; the last tile
// wins the round («Angre» takes it back); reload and back + continue; «Kåringen». Then the block game
// against two phone players on Vanskelig: they play by themselves without freezing the page, passing
// works, and a win counts in the record and gives the sticker. The line must fit above the hand and
// the dock at every size. Runs in every edition (texts are checked in Norwegian only).

async function lastMed(t, endring) {
  await t.js(`(() => { const S = Rusj.S; (${endring})(S); Rusj.lagre(); })()`);
  await t.lastSide(t.side, "document.querySelector('#do-bord, .gi-til')");
  await t.sov(400);
}
// A round with these hands and this line; every other tile in the boneyard (so all 28 are there).
const runde = (hender, rekke, ekstra = "") => `(S) => {
  const sp = S.spill; const alle = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) alle.push([a, b]);
  const hender = ${JSON.stringify(hender)}; const rekke = ${JSON.stringify(rekke)};
  const brukt = new Set(hender.flat().concat(rekke).map((t) => Math.min(t[0], t[1]) * 7 + Math.max(t[0], t[1])));
  sp.r = { hender, rekke, bunke: alle.filter((t) => !brukt.has(t[0] * 7 + t[1])), tur: 0, krav: null, pass: 0, mangler: hender.map(() => []), logg: [], sett: hender.map(() => 0), valgt: null, angre: null, resultat: null };
  sp.port = false; ${ekstra}
}`;
const brikke = (i) => `.do-hand [data-h="brikke"][data-v="${i}"]`;

export default async function (t) {
  const sp = async () => (await t.tilstand()).spill;
  const klikk = (sel, ms = 450) => t.klikk(sel, ms);
  const sjekkPlass = async (navn) => {
    t.sjekk(await t.friForDokk(".do-hand, .do-resultat"), `Hånda ligger under dokka («${navn}»)`);
    const m = await t.js(`(() => { const r = document.querySelector('.do-rekke'); const b = document.querySelector('#do-bord').getBoundingClientRect(); const s = Array.from(document.querySelectorAll('.do-lagt')).map((e) => e.getBoundingClientRect()); return { ute: s.filter((x) => x.bottom > b.bottom + 1 || x.top < b.top - 1 || x.right > b.right + 1 || x.left < b.left - 1).length, h: parseFloat(getComputedStyle(r).getPropertyValue('--h')) }; })()`);
    t.sjekk(m.ute === 0, `${m.ute} brikker i rekka er utenfor bordet («${navn}»)`);
    t.sjekk(m.h >= 12, `Brikkene i rekka er bare ${m.h}px («${navn}»)`);
  };

  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  await klikk('[data-h="modus"][data-v="flere"]');
  await klikk('[data-h="mal"][data-v="50"]');
  await t.bilde("oppsett-flere", true);
  await klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  let s = await sp();
  t.sjekk(s.r.krav && s.r.krav[0] === s.r.krav[1], "Første runde begynner ikke med den høyeste dobbelen");
  t.sjekk(s.r.hender.every((h) => h.length === 7), "To spillere i trekkdomino skal få sju brikker hver");
  await t.bilde("port");
  t.sjekk(!(await t.finnes(".do-hand")), "Brikkene vises før spilleren har trykket «Vis brikkene mine»");
  await klikk('[data-h="vis"]');
  t.sjekk((await t.antall(".do-hb.lovlig")) === 1, "Bare den tvungne dobbelen skal lyse i første trekk");
  await t.bilde("forste-trekk");
  await klikk(".do-hb.lovlig", 600);
  s = await sp();
  t.sjekk(s.r.rekke.length === 1 && s.port, "Dobbelen ble ikke lagt, eller porten kom ikke før neste spiller");

  // A set position: ends 3 and 5
  await lastMed(t, runde([[[5, 6], [1, 3], [0, 0], [2, 4]], [[1, 1], [2, 2], [4, 4], [6, 6]]], [[3, 5]]));
  await t.bilde("satt-opp");
  await klikk(brikke(2), 300);
  t.sjekk((await sp()).r.rekke.length === 1, "En brikke som ikke passer, ble lagt");
  await klikk(brikke(0), 700);
  s = await sp();
  t.sjekk(s.r.rekke.length === 2 && s.r.rekke[1].join() === "5,6" && s.r.tur === 1 && s.port, "5|6 ble ikke lagt til høyre med ett trykk");
  t.sjekk(!t.norsk || /Testspiller A la 5 og 6/.test(await t.tekst(".do-sist-port")), "Porten forteller ikke hva som skjedde");
  await t.bilde("port-sist");
  await klikk('[data-h="vis"]');
  await klikk(brikke(3), 700); // 6|6 on the right
  s = await sp();
  t.sjekk(s.r.rekke[2].join() === "6,6", "Dobbelen ble ikke lagt");
  await klikk('[data-h="vis"]');
  await t.bilde("dobbel-lagt");

  // A tile that fits both ends: the two targets
  await lastMed(t, runde([[[4, 6], [0, 2]], [[1, 1], [5, 5]]], [[4, 1], [1, 6]]));
  await klikk(brikke(0));
  t.sjekk((await t.antall(".do-mal")) === 2, "En brikke som passer i begge ender, viser ikke to mål");
  await t.bilde("begge-ender");
  await klikk(".do-mal.hoyre", 700);
  s = await sp();
  t.sjekk(s.r.rekke.length === 3 && s.r.rekke[2].join() === "6,4", "4|6 ble ikke lagt til høyre, snudd");

  // Nothing fits: draw from the pile
  await lastMed(t, runde([[[1, 2], [3, 4]], [[1, 1], [5, 5]]], [[0, 6], [6, 6]]));
  t.sjekk(!(await t.js(`document.querySelector('[data-h="trekk"]').disabled`)), "«Trekk fra bunken» er ikke klar når ingenting passer");
  const for_ = (await sp()).r.bunke.length;
  await klikk('[data-h="trekk"]', 600);
  s = await sp();
  t.sjekk(s.r.hender[0].length === 3 && s.r.bunke.length === for_ - 1 && s.r.tur === 0, "Trekket ga ikke én brikke fra bunken");
  await t.bilde("trukket");

  // The last tile wins the round; «Angre» takes it back
  await lastMed(t, runde([[[2, 3]], [[1, 1], [5, 6], [4, 4]]], [[3, 0], [0, 0]], "sp.poeng = [0, 0];"));
  await klikk(brikke(0), 700);
  s = await sp();
  t.sjekk(s.r.resultat && s.r.resultat.vinner === 0 && s.r.resultat.poeng === 21 && s.poeng[0] === 21, `Siste brikke ga ikke 21 poeng: ${JSON.stringify(s.r.resultat)}`);
  t.sjekk(!t.norsk || /Domino!/.test(await t.tekst(".do-melding")), "Meldingen sier ikke «Domino!»");
  await t.bilde("domino");
  await sjekkPlass("domino");
  await klikk('[data-h="angre"]');
  s = await sp();
  t.sjekk(!s.r.resultat && s.poeng[0] === 0 && s.r.hender[0].length === 1, "«Angre» tok ikke tilbake den siste brikken");
  await klikk(brikke(0), 700);

  // Reload, back + continue
  await t.lastSide(t.side, "document.querySelector('#do-bord')");
  t.sjekk((await sp()).r.resultat, "Rundens resultat ble borte etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('#do-bord')");

  // Next round; then a win to 50 ends the match
  await klikk('[data-h="runde"]', 600);
  s = await sp();
  t.sjekk(s.runde === 2 && s.r.tur === 0 && !s.r.krav, "Vinneren av runden begynner ikke neste runde fritt");
  await lastMed(t, runde([[[6, 6]], [[5, 5], [4, 6], [3, 3], [2, 5]]], [[6, 1]], "sp.poeng = [21, 0];"));
  await klikk(brikke(0), 700);
  t.sjekk((await sp()).poeng[0] >= 50, "Poengene nådde ikke 50");
  await klikk('[data-h="kaaring"]', 900);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.bilde("kaaringen", true);
  t.sjekk(!t.norsk || /Testspiller A vinner!/.test(await t.tekst("#skjerm h1")), `Kåringen: «${await t.tekst("#skjerm h1")}»`);
  s = await t.tilstand();
  t.sjekk(s.spill.registrert === true && s._aktiv === false, "Kåringen ble ikke registrert for kvelden");

  // Against two phone players on Vanskelig, block game, one round
  await klikk('[data-h="nytt"]');
  await klikk('[data-h="modus"][data-v="mobil"]');
  await klikk('[data-h="mobiler"][data-v="2"]');
  await klikk('[data-h="niva"][data-v="3"]');
  await klikk('[data-h="variant"][data-v="blokk"]');
  await klikk('[data-h="mal"][data-v="en"]');
  await t.bilde("oppsett-mobil", true);
  await klikk('[data-h="start"]');
  await t.vent("document.querySelector('#do-bord')");
  s = await sp();
  t.sjekk(s.r.hender.every((h) => h.length === 7) && !s.port, "Blokkdomino skal gi sju brikker hver, uten port mot mobilen");
  await t.js(`window.__gap = 0; window.__sist = performance.now(); window.__probe = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - window.__sist); window.__sist = n; }, 8);`);
  let bilde = false;
  for (let n = 0; n < 12; n++) {
    await t.vent("Rusj.S.spill.r.tur === 0 || Rusj.S.spill.r.resultat", 15000);
    if ((await sp()).r.resultat) break;
    if (!bilde) {
      await t.bilde("din-tur");
      await sjekkPlass("mot mobilen");
      bilde = true;
    }
    if (await t.finnes('[data-h="pass"]')) await klikk('[data-h="pass"]', 600);
    else {
      await klikk(".do-hb.lovlig", 500);
      if (await t.finnes(".do-mal")) await klikk(".do-mal", 600);
    }
  }
  const gap = await t.js("(clearInterval(window.__probe), window.__gap)");
  t.sjekk(gap < 150, `Siden frøs i ${Math.round(gap)} ms mens mobilen spilte`);
  await t.bilde("mot-mobilen");
  await sjekkPlass("etter mobilen");

  // A win against the phones: our last tile
  await lastMed(t, runde([[[2, 3]], [[1, 1], [5, 6]], [[4, 4], [0, 5]]], [[3, 0], [0, 0]], "sp.poeng = [0, 0, 0];"));
  await klikk(brikke(0), 800);
  await klikk('[data-h="kaaring"]', 900);
  await t.vent("document.querySelector('.skjerm-slutt')");
  await t.bilde("kaaringen-mobil", true);
  s = await t.tilstand();
  t.sjekk(s.rekord && s.rekord[3] && s.rekord[3].seier === 1, "Seieren mot mobilen teller ikke i rekorden");
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(JSON.stringify(merker).includes("klassiker-dobbelsekseren"), "Klistremerket «Domino!» ble ikke gitt");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.do-rekorder')");
  await t.bilde("hjem-rekord", true);
}
