// Skjæra (Kim's game): level 1 alone (a right answer, a reload mid-round, a wrong answer, back +
// continue, back right after the last guess), the level result with stars that unlocks level 2; a
// shuffled level where three things are stolen; then two players taking turns through three rounds
// (one turn reloaded right after the last guess) to the winner screen.
export default async function (t) {
  const tatt = (b) => b.stjalet.map((p) => b.brett[p]);
  const tinger = (n) => `document.querySelectorAll('.skj-brett .skj-ting').length === ${n}`;
  const valg = "document.querySelector('.skj-valg:not(:disabled)')";
  const neste = "document.querySelector('[data-h=\"neste\"]')";

  // A guess is done when a right thing has landed on the board, or a wrong one is marked.
  async function gjett(x, rett) {
    await t.klikk(`.skj-valg[data-v="${x}"]`, 60);
    await t.vent(rett ? `document.querySelector('.skj-brett .skj-ting[data-ting="${x}"]')` : `document.querySelector('.skj-valg.feil[data-v="${x}"]')`, 8000);
    await t.sov(120);
  }

  // lastPaNytt: reload the page right after the last guess – the round must come back answered.
  async function spillRunde(antallTing, rett, bildeNavn, lastPaNytt) {
    await t.vent(tinger(antallTing), 8000);
    await t.klikk('[data-h="klar"]', 200);
    await t.vent(valg, 15000);
    const b = (await t.tilstand()).spill.b;
    const riktige = tatt(b);
    const gale = b.valg.filter((x) => !riktige.includes(x));
    for (let n = 0; n < riktige.length; n++) {
      const x = n < rett ? riktige[n] : gale[n];
      if (lastPaNytt && n === riktige.length - 1) {
        await t.klikk(`.skj-valg[data-v="${x}"]`, 30);
        await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
      } else await gjett(x, n < rett);
    }
    await t.vent(neste, 15000);
    if (bildeNavn) await t.bilde(bildeNavn);
  }

  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="alene"]');
  await t.bilde("nivaer");
  await t.klikk('.skj-niva[data-v="0"]');
  await t.vent(tinger(4));
  await t.sov(900);
  await t.bilde("se-godt");

  // The magpie steals
  await t.klikk('[data-h="klar"]', 620);
  await t.bilde("skjaera-stjeler");
  await t.vent(valg, 8000);
  await t.bilde("hva-tok-skjaera");
  let s = await t.tilstand();
  t.sjekk(s.spill.b.fase === "finn" && s.spill.b.stjalet.length === 1, "Skjæra stjal ikke én ting på nivå 1");

  // Reload mid-round: the gap and the options come back
  await t.lastSide(t.side, "document.querySelector('.skj-valg')");
  t.sjekk((await t.antall(".skj-rute.tom")) === 1, "Hullet på brettet forsvant etter omlasting");
  t.sjekk((await t.antall(".skj-valg")) === 4, "Valgene forsvant etter omlasting");

  // Right answer
  await gjett(tatt(s.spill.b)[0], true);
  await t.vent(neste, 8000);
  await t.bilde("riktig");
  t.sjekk((await t.tilstand()).spill.perfekte === 1, "Riktig svar ga ikke stjerne");
  await t.klikk('[data-h="neste"]');

  // Round 2: wrong answer, the magpie brings it back
  await spillRunde(4, 0, "skjaera-lurte-deg");
  t.sjekk((await t.tilstand()).spill.perfekte === 1, "Feil svar skulle ikke gi stjerne");

  // Back to home and continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(neste);
  await t.klikk('[data-h="neste"]');

  // Round 3: right, and back at once (before the animation ends) – the round must still be
  // decided and shown as answered on «Fortsett», never a dead board.
  await t.vent(tinger(4), 8000);
  await t.klikk('[data-h="klar"]', 200);
  await t.vent(valg, 15000);
  const b3 = (await t.tilstand()).spill.b;
  await t.klikk(`.skj-valg[data-v="${tatt(b3)[0]}"]`, 30);
  await t.klikk("#tilbake");
  s = await t.tilstand();
  t.sjekk(s.spill.b.fase === "svar" && s.spill.perfekte === 2, "Runden ble ikke avgjort da man gikk tilbake rett etter siste svar");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(neste, 4000);
  t.sjekk((await t.antall(".skj-ting.var-tatt.funnet")) === 1, "Svaret vises ikke etter «Fortsett»");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.skjerm-nivaklart')");
  await t.sov(1400);
  await t.bilde("niva-klart");
  s = await t.tilstand();
  t.sjekk(s.stjerner[0] === 2, `Nivå 1 skulle gi 2 stjerner, ga ${s.stjerner[0]}`);
  await t.klikk('.lenkerad [data-h="alene"]');
  t.sjekk(!(await t.js("document.querySelector('.skj-niva[data-v=\"1\"]').disabled")), "Nivå 2 ble ikke låst opp");

  // A shuffled level with three stolen things (level 11)
  await t.js("Rusj.S.stjerner = [3, 3, 2, 3, 1, 3, 2, 3, 1, 2, 0, 0]; Rusj.vis()");
  await t.bilde("nivaer-mange");
  await t.klikk('.skj-niva[data-v="10"]');
  await t.vent(tinger(16));
  await t.sov(1400);
  await t.bilde("niva-11-se");
  await t.klikk('[data-h="klar"]', 200);
  await t.vent(valg, 15000);
  await t.bilde("niva-11-rotet");
  s = await t.tilstand();
  const b11 = s.spill.b;
  t.sjekk(b11.stjalet.length === 3 && b11.plass.join() !== b11.brett.map((x, p) => (b11.stjalet.includes(p) ? -1 : x)).join(), "Nivå 11 skulle stjele tre ting og stokke brettet");
  const r11 = tatt(b11);
  const g11 = b11.valg.filter((x) => !r11.includes(x));
  await gjett(r11[0], true);
  await t.bilde("niva-11-en-funnet");
  await gjett(g11[0], false);
  await gjett(g11[1], false);
  await t.vent(neste, 15000);
  await t.sov(300);
  await t.bilde("niva-11-svar");
  t.sjekk((await t.antall(".skj-ting.var-tatt")) === 3, "De tre stjålne tingene vises ikke etter svaret");

  // Two players
  await t.klikk("#tilbake");
  await t.klikk('[data-h="sammen"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  await t.klikk('[data-h="vanskelighet"][data-v="middels"]');
  await t.bilde("oppsett", true);
  // The unfinished level is never thrown away without asking
  await t.klikk('[data-h="start"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"][data-v="ja"]'), "Spør ikke før et spill som pågår blir erstattet");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  for (let runde = 0; runde < 3; runde++) {
    for (let spiller = 0; spiller < 2; spiller++) {
      await t.vent("document.querySelector('[data-h=\"klar-spiller\"]')");
      if (runde === 0 && spiller === 0) await t.bilde("gi-mobilen");
      await t.klikk('[data-h="klar-spiller"]');
      const L = Math.min(11, 3 + runde);
      const n = [4, 6, 6, 8, 9, 9, 12, 12, 12, 16, 16, 20][L];
      await spillRunde(n, spiller === 0 ? 3 : 0, runde === 0 && spiller === 1 ? "svar-to-spillere" : null, runde === 1 && spiller === 0);
      if (runde === 1 && spiller === 0) {
        // Testspiller A finds everything: 1 thing on level 4 (round 1) + 2 things on level 5 (round 2).
        const p = (await t.tilstand()).spill.poeng;
        t.sjekk(p[0] === 3, `Poengene ble feil etter omlasting rett etter siste svar (${p.join(", ")})`);
      }
      await t.klikk('[data-h="neste"]');
    }
    if (runde < 2) {
      await t.vent("document.querySelector('[data-h=\"neste-runde\"]')");
      if (runde === 0) await t.bilde("stilling");
      await t.klikk('[data-h="neste-runde"]');
    }
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.bilde("vinner", true);
  t.sjekk(/Testspiller A vinner/.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke");
}
