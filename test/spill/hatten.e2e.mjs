// Hatten: four players in two teams with words «Fra rusj». Setup (teams, a player moved and
// back, the limits), a turn with «Riktig», «Pass» (the word goes to the bottom of the hat, the pass
// limit holds), «Angre», swipes, a reload mid-turn (paused, word hidden), time up with a correction
// in the list and «Angre» after it. Then the hat is emptied: round 1 → 2 → 3 with the same words,
// the explainers rotate, and Kåringen (podium, table, evening scoreboard, share). Last «Skriv selv»:
// every player behind a «Gi mobilen til …» gate, typed words never visible to the next player, a
// reload while typing goes back to the gate, and the typed words are the words in the hat.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en hatten): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names and the edition's storage keys.
const NOKKEL = `("rusj." + (window.Rusj.sprak === "nb" ? "" : window.Rusj.sprak + ".") + "hatten.v1")`;
const S = `JSON.parse(localStorage.getItem(${NOKKEL}))`;
const SP = `${S}.spill`;

// Set something in the saved game and reload (resumes on the same screen).
async function endre(t, kode) {
  await t.js(`(() => { const s = ${S}; const sp = s.spill; ${kode}; localStorage.setItem(${NOKKEL}, JSON.stringify(s)); })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
}

// From the board: start the turn and wait for the word.
async function startTur(t) {
  await t.klikk('[data-h="start-tur"]', 50);
  await t.vent("document.querySelector('.storkort:not(.ut) .ha-ordet')", 8000);
}
async function riktig(t) {
  const n = await t.js(`${SP}.tur.riktige.length`);
  await t.klikk('[data-h="riktig"]', 60);
  await t.vent(`${SP}.tur.riktige.length === ${n + 1}`);
  await t.vent("document.querySelector('.storkort:not(.ut) .ha-ordet') || document.querySelector('[data-h=\"tur-ferdig\"]')");
}
// Empties the hat down to `igjen` words (between turns), then plays one turn that takes them all.
async function tomHatten(t, igjen) {
  await endre(t, `sp.hatt = sp.hatt.slice(0, ${igjen})`);
  await startTur(t);
  for (let k = 0; k < igjen; k++) await riktig(t);
  await t.vent("document.querySelector('[data-h=\"tur-ferdig\"]')");
}

export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  t.sjekk(!t.norsk || /ord/.test(await t.tekst(".merker")), "Hjem-skjermen viser ikke antall ord");
  await t.bilde("hjem");

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('[data-h=\"start\"]')");
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")) === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  t.sjekk(await t.finnes('.fliser [data-h="kilde"][data-v="rusj"][aria-pressed="true"]'), "«Fra rusj» skal være valgt først");
  t.sjekk(await t.js(`document.querySelector('[data-h="lag"][data-v="3"]').disabled`), "Tre lag kan velges med bare fire spillere");
  t.sjekk((await t.antall(".ha-lagkol")) === 2 && (await t.antall(".ha-lagspiller")) === 4, "Lagene viser ikke to lag med fire spillere");
  t.sjekk(!t.norsk || /Rosa/.test(await t.tekst(".ha-lagkol")), "Lagene heter ikke «Rosa» og «Gul»");
  // Move a player to the other team: 1 against 3 can't start
  await t.klikk('[data-h="bytt-lag"][data-v="0"]');
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "«Start» er åpen med én spiller på et lag");
  t.sjekk(!t.norsk || /minst to/.test(await t.tekst("#ha-hindring")), "Mangler forklaringen når et lag har for få spillere");
  await t.klikk('[data-h="bytt-lag"][data-v="0"]');
  t.sjekk(!(await t.js(`document.querySelector('[data-h="start"]').disabled`)), "«Start» er stengt med to og to på lagene");
  await t.klikk('[data-h="ord"][data-v="30"]');
  await t.klikk('[data-h="tid"][data-v="30"]');
  await t.klikk('[data-h="pass"][data-v="1"]');
  await t.bilde("oppsett", true);
  let s = await t.tilstand();
  t.sjekk(s.oppsett.ord === 30 && s.oppsett.tid === 30 && s.oppsett.pass === 1, "Oppsettet ble ikke lagret");

  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.ha-gi')");
  s = await t.tilstand();
  const sp0 = s.spill;
  t.sjekk(sp0.ord.length === 30 && new Set(sp0.ord).size === 30 && sp0.hatt.length === 30, `Hatten har ikke 30 ulike ord (${sp0.ord.length})`);
  t.sjekk(sp0.lag.length === 2 && sp0.lag.every((m) => m.length === 2), "Spillet har ikke to lag med to spillere");
  t.sjekk(!t.norsk || /Runde 1/.test(await t.tekst(".ha-steg .na")) || /Forklar/.test(await t.tekst(".ha-steg .na")), "Tavla viser ikke runde 1");
  t.sjekk(!(await t.finnes(".ha-ordet")), "Et ord vises før turen er startet");
  t.sjekk(await t.friForDokk(".ha-gi h1"), "«Gi mobilen til …» skjules bak knappene");
  const f1 = { lag: sp0.lagNr, spiller: sp0.lag[sp0.lagNr][0] };
  t.sjekk((await t.tekst("#skjerm h1")).trim() === sp0.navn[f1.spiller], "Tavla sier ikke hvem som skal forklare");
  await t.bilde("tavle-start");

  // ---------- A turn ----------
  await startTur(t);
  t.sjekk(await t.friForDokk(".storkort.ha-kort"), "Ordkortet skjules bak knappene");
  t.sjekk(await t.finnes(".ha-status .timer"), "Mangler klokka i turen");
  await t.bilde("tur");
  await riktig(t);
  s = await t.tilstand();
  t.sjekk(s.spill.tur.riktige.length === 1 && s.spill.hatt.length === 28, `«Riktig» tok ikke ordet ut av hatten (${s.spill.hatt.length} igjen)`);
  // Pass: the word goes to the bottom of the hat, the next one is on the card
  const passet = s.spill.tur.ord;
  await t.klikk('[data-h="pass"]', 60);
  await t.vent(`${SP}.tur.pass === 1`);
  await t.vent("document.querySelector('.storkort:not(.ut) .ha-ordet')");
  s = await t.tilstand();
  t.sjekk(s.spill.hatt[s.spill.hatt.length - 1] === passet && s.spill.tur.ord !== passet, "«Pass» la ikke ordet tilbake nederst i hatten");
  t.sjekk(await t.js(`document.querySelector('[data-h="pass"]').disabled`), "«Pass» kan trykkes igjen selv om grensen er ett pass");
  // A left swipe with no passes left: the card comes back and nothing changes
  await t.sveip(".storkort", -240);
  await t.vent("document.querySelector('.storkort:not(.ut) .ha-ordet')");
  t.sjekk((await t.tilstand()).spill.tur.pass === 1, "Et sveip ga et pass for mye");
  // «Angre» takes the pass back
  await t.klikk('[data-h="angre-ord"]');
  s = await t.tilstand();
  t.sjekk(s.spill.tur.ord === passet && s.spill.tur.pass === 0 && s.spill.hatt.length === 28, "«Angre» tok ikke tilbake passet");
  t.sjekk((await t.tekst(".ha-ordet")) === s.spill.ord[passet], "Ordet som ble angret, vises ikke på kortet");
  // Swipe right = correct
  await t.sveip(".storkort", 240);
  await t.vent(`${SP}.tur.riktige.length === 2`);
  await t.vent("document.querySelector('.storkort:not(.ut) .ha-ordet')");

  // Reload mid-turn: paused, the word hidden
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "tur" && s.spill.tur.pause === true, "Turen sto ikke på pause etter omlasting");
  t.sjekk(!(await t.finnes(".ha-ordet")), "Ordet vises mens turen står på pause");
  t.sjekk(!t.norsk || (await t.tekst('[data-h="fortsett-tur"]')).trim() === "Fortsett", "Pausekortet mangler «Fortsett»");
  t.sjekk(await t.finnes('.dokk [data-h="avslutt"]'), "Mangler «Avslutt» på pausekortet");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-tur"]');
  await t.vent("document.querySelector('.ha-ordet')");
  await riktig(t);

  // Time is up: the list, one word corrected back into the hat
  await t.js("Rusj.timer('ha-tid').leggTil(-500)");
  await t.vent("document.querySelector('[data-h=\"tur-ferdig\"]')");
  t.sjekk(!t.norsk || /Tiden er ute/.test(await t.tekst("#skjerm")), "Mangler «Tiden er ute!»");
  s = await t.tilstand();
  t.sjekk(s.spill.tur.ord === null && s.spill.hatt.length === 27, `Ordet på kortet gikk ikke tilbake i hatten (${s.spill.hatt.length})`);
  t.sjekk((await t.antall(".ha-ord")) === 3, "Lista viser ikke de tre riktige ordene");
  await t.klikk('[data-h="veksle"][data-v="1"]');
  t.sjekk(/\+2/.test(await t.tekst("#skjerm h1")), "Retting i lista endret ikke poengene");
  await t.bilde("tid-ute", true);
  await t.klikk('[data-h="tur-ferdig"]');
  await t.vent("document.querySelector('.ha-gi')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[f1.lag][0] === 2 && s.spill.hatt.length === 28, `Poeng eller hatt stemmer ikke etter turen (${s.spill.poeng[f1.lag][0]} p, ${s.spill.hatt.length} lapper)`);
  t.sjekk(s.spill.lagNr !== f1.lag, "Det samme laget skal ikke forklare to ganger på rad");
  // «Angre» brings the list back
  await t.klikk('[data-h="angre-tur"]');
  await t.vent("document.querySelector('[data-h=\"tur-ferdig\"]')");
  t.sjekk((await t.tilstand()).spill.poeng[f1.lag][0] === 0, "«Angre» tok ikke tilbake poengene");
  await t.klikk('[data-h="tur-ferdig"]');
  await t.vent("document.querySelector('.ha-gi')");

  // Back and «Fortsett» keep the game
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('[data-h=\"fortsett\"]')");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.ha-gi')");

  // ---------- Round 1 → 2: the hat is emptied ----------
  const f2 = await t.js(`(() => { const sp = ${SP}; return { lag: sp.lagNr, spiller: sp.lag[sp.lagNr][sp.peker[sp.lagNr] % sp.lag[sp.lagNr].length] }; })()`);
  t.sjekk(f2.lag !== f1.lag, "Lagene bytter ikke på");
  await tomHatten(t, 2);
  t.sjekk(!t.norsk || /Hatten er tom/.test(await t.tekst("#skjerm")), "Mangler «Hatten er tom!» når siste lapp er tatt");
  await t.bilde("hatten-tom");
  await t.klikk('[data-h="tur-ferdig"]');
  await t.vent("document.querySelector('[data-h=\"til-tavle\"]')");
  s = await t.tilstand();
  t.sjekk(s.spill.runde === 2 && s.spill.hatt.length === 30, `Runde 2 startet ikke med full hatt (runde ${s.spill.runde}, ${s.spill.hatt.length} lapper)`);
  t.sjekk(JSON.stringify(s.spill.ord) === JSON.stringify(sp0.ord), "Runde 2 bruker ikke de samme ordene");
  t.sjekk(!t.norsk || /Ett ord/.test(await t.tekst(".ha-neste")), "Rundeskiftet sier ikke hva runde 2 går ut på");
  t.sjekk(await t.friForDokk(".ha-tom h1"), "«Hatten er tom!» skjules bak knappene");
  await t.bilde("runde-2", true);
  await t.klikk('[data-h="til-tavle"]');
  await t.vent("document.querySelector('.ha-gi')");
  t.sjekk(!t.norsk || /Ett ord/.test(await t.tekst(".ha-steg .na")), "Tavla viser ikke runde 2");
  // The rotation: team 1 has had one turn, so its second player explains next time
  const f3 = await t.js(`(() => { const sp = ${SP}; return { lag: sp.lagNr, spiller: sp.lag[sp.lagNr][sp.peker[sp.lagNr] % sp.lag[sp.lagNr].length] }; })()`);
  t.sjekk(f3.lag === f1.lag && f3.spiller !== f1.spiller, "Den samme spilleren forklarer to ganger for laget sitt");
  await t.bilde("tavle-runde-2");

  // Round 2 → 3 → Kåringen
  await startTur(t);
  t.sjekk(!t.norsk || /ett ord/i.test(await t.tekst(".storkort-etikett")), "Kortet sier ikke at det er runde 2");
  await t.klikk('[data-h="pause"]');
  await t.klikk('[data-h="fortsett-tur"]');
  await t.vent("document.querySelector('.ha-ordet')");
  await t.js("Rusj.timer('ha-tid').leggTil(-500)");
  await t.vent("document.querySelector('[data-h=\"tur-ferdig\"]')");
  await t.klikk('[data-h="tur-ferdig"]');
  await t.vent("document.querySelector('.ha-gi')");
  await tomHatten(t, 3);
  await t.klikk('[data-h="tur-ferdig"]');
  await t.vent("document.querySelector('[data-h=\"til-tavle\"]')");
  t.sjekk((await t.tilstand()).spill.runde === 3 && (!t.norsk || /Mim/.test(await t.tekst(".ha-neste"))), "Runde 3 (mim) startet ikke");
  await t.klikk('[data-h="til-tavle"]');
  await t.vent("document.querySelector('.ha-gi')");
  await tomHatten(t, 4);
  t.sjekk(!t.norsk || /Til kåringen/.test(await t.tekst('[data-h="tur-ferdig"]')), "Siste tur i runde 3 skal gå til kåringen");
  await t.klikk('[data-h="tur-ferdig"]');
  await t.vent("document.querySelector('.ha-tabell')");

  // ---------- Kåringen ----------
  s = await t.tilstand();
  const sum = s.spill.poeng.map((p) => p.reduce((a, b) => a + b, 0));
  t.sjekk(s.spill.ferdig && s.skjerm === "slutt", "Spillet ble ikke avsluttet etter runde 3");
  t.sjekk(!t.norsk || /vinner/.test(await t.tekst("#skjerm h1")), "Kåringen sier ikke hvem som vant");
  t.sjekk(await t.finnes(".pall"), "Mangler pallen");
  t.sjekk((await t.antall(".ha-tabell tbody tr")) === 2, "Tabellen viser ikke begge lagene");
  t.sjekk(sum.reduce((a, b) => a + b, 0) === 2 + 2 + 3 + 4, `Poengsummen stemmer ikke: ${sum}`);
  const kveld = await t.js(`JSON.parse(localStorage.getItem('${t.nokkel("kveld")}') || 'null')`);
  const siste = kveld && kveld.spill && kveld.spill[kveld.spill.length - 1];
  t.sjekk(siste && siste.id === "hatten" && siste.resultat.length === 4, `Kveldens gjeng fikk ikke de fire spillerne (${JSON.stringify(siste && siste.resultat)})`);
  t.sjekk(kveld.spill.filter((x) => x.id === "hatten").length === 1, "Kveldens gjeng fikk spillet mer enn én gang");
  t.sjekk(await t.finnes('[data-h="del"]'), "Mangler «Del kåringen»");
  t.sjekk(await t.finnes('.dokk [data-h="igjen"]') && (await t.finnes('.dokk [data-h="nytt"]')), "Mangler «Spill igjen» eller «Endre oppsett»");
  await t.bilde("karingen");
  await t.bilde("karingen-hel", true);
  // A reload on Kåringen stays there and doesn't register again
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  const kveld2 = await t.js(`JSON.parse(localStorage.getItem('${t.nokkel("kveld")}') || 'null')`);
  t.sjekk(kveld2.spill.filter((x) => x.id === "hatten").length === 1, "Omlasting på kåringen registrerte spillet på nytt");
  // The home screen remembers the last game
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.ha-sist')");
  t.sjekk(!t.norsk || /Sist:/.test(await t.tekst(".ha-sist")), "Hjem-skjermen viser ikke forrige spill");

  // ---------- «Skriv selv» ----------
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('[data-h=\"start\"]')");
  await t.klikk('[data-h="kilde"][data-v="selv"]');
  await t.klikk('[data-h="per"][data-v="3"]');
  t.sjekk(/12/.test(await t.tekst("#skjerm")), "Oppsettet sier ikke hvor mange ord som blir i hatten");
  await t.bilde("oppsett-skriv-selv", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"skriv-klar\"]')");
  t.sjekk(!(await t.finnes("#ha-ord")), "Skrivefeltet vises før spilleren har sagt «Jeg er …»");
  t.sjekk(await t.finnes(".ikke-se"), "Porten ber ikke de andre se bort");
  await t.bilde("skriv-port");
  const skrevet = [];
  for (let p = 0; p < 4; p++) {
    await t.vent("document.querySelector('[data-h=\"skriv-klar\"]')");
    if (p > 0) {
      // The gate before the next player shows nothing of what the last one wrote
      const tekst = await t.tekst("#skjerm");
      t.sjekk(!skrevet.some((o) => tekst.includes(o)), `Porten til spiller ${p + 1} viser ordene til forrige spiller`);
    }
    await t.klikk('[data-h="skriv-klar"]');
    await t.vent("document.querySelector('#ha-ord')");
    for (let k = 0; k < 3; k++) {
      const ord = p === 1 && k === 0 ? "<x-q>Krone</x-q>" : `Hemmelig${p}${k}`;
      await t.skrivInn("#ha-ord", ord);
      await t.klikk('.ha-skriv button[type="submit"]');
      await t.vent(`${SP}.skriv.lister[${p}].length === ${k + 1}`);
      skrevet.push(ord);
      // The typed words are not on the screen (only behind the card)
      const synlig = await t.js(`document.querySelector('#skjerm').innerText`);
      t.sjekk(!synlig.includes(ord.replace(/<[^>]+>/g, "")), `Ordet «${ord}» står synlig på skjermen etter at det er lagt i hatten`);
      if (p === 0 && k === 1) {
        await t.bilde("skriv");
        // Hold the card: the player's own words show
        const slipp = await t.hold(".mappe", 500);
        t.sjekk(/Hemmelig00/.test(await t.tekst(".mappe-bakside")), "Kortet viser ikke ordene dine når du holder det");
        await t.bilde("skriv-holdt");
        await slipp();
        // Reload while typing: back to the gate, nothing shows
        await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
        s = await t.tilstand();
        t.sjekk(s.skjerm === "skrivGi" && !(await t.finnes("#ha-ord")), `Omlasting mens man skriver gikk ikke tilbake til porten (${s.skjerm})`);
        await t.klikk('[data-h="skriv-klar"]');
        await t.vent("document.querySelector('#ha-ord')");
      }
    }
    t.sjekk(await t.js(`document.querySelector('#ha-ord').disabled`), "Feltet er åpent etter at alle ordene er skrevet");
    t.sjekk((await t.js(`document.querySelectorAll('#skjerm x-q').length`)) === 0, "Et skrevet ord ble tolket som HTML");
    await t.klikk('[data-h="skriv-ferdig"]');
  }
  await t.vent("document.querySelector('.ha-gi')");
  s = await t.tilstand();
  t.sjekk(s.spill.ord.length === 12 && s.spill.hatt.length === 12 && !s.spill.skriv, `Hatten har ikke de tolv skrevne ordene (${s.spill.ord.length})`);
  t.sjekk(s.spill.ord.includes("Hemmelig32") && s.spill.ord.includes("<x-q>Krone</x-q>"), "De skrevne ordene er ikke i hatten");
  await startTur(t);
  t.sjekk((await t.js(`document.querySelectorAll('#skjerm x-q').length`)) === 0, "Et skrevet ord ble tolket som HTML på kortet");
  await t.bilde("tur-skriv-selv");
  // «Avslutt» mid-turn with no points: back home, the game is gone
  await t.klikk('[data-h="pause"]');
  await t.klikk('.dokk [data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden])')");
  await t.bilde("avslutt");
  await t.klikk('#ark .knapp');
  await t.vent("document.querySelector('[data-h=\"nytt\"]') && !document.querySelector('[data-h=\"fortsett\"]')");
  t.sjekk(!(await t.tilstand()).spill, "Spillet ble ikke kastet etter «Avslutt» uten poeng");
}
