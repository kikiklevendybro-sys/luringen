// Leppeleseren («Les leppene»): home (the headphones badge) and rules, «Gjør klart», the turn
// screen before each turn (who reads to whom, the hearing warning, the volume slider, the styles,
// «Prøv musikken»), the music starting from the tap and running across the countdown – also with the
// kit's sound switched off –, «Riktig!», «Hopp over» and «Angre», the in-game music switch, a phone
// that hides the page (the music stops and the turn pauses), a reload mid-turn (paused, no music
// until «Fortsett»), the time running out (the music stops), the check list, the rotation, small
// screens and a phone on its side, «Avslutt» → Kåringen with the podium, teams, «Spill igjen».
// Language-neutral (rusj/SPRAK.md): words are checked only in Norwegian.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C"];

export default async function (t) {
  const s = () => t.tilstand();
  const pause = () => t.sov(420);
  const NOKKEL = t.nokkel("leppeleseren.v1");
  const musikk = () => t.js("[document.documentElement.dataset.lpMusikk || 'av', document.documentElement.dataset.lpAc || 'ingen']");
  const endre = async (kode, vent) => {
    await t.js(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(NOKKEL)})); ${kode}; localStorage.setItem(${JSON.stringify(NOKKEL)}, JSON.stringify(s)); })()`);
    await t.lastSide(t.side, vent);
    await t.sov(450);
  };
  const KLAR = "document.querySelector('[data-h=\"start-tur\"]')";
  const FRASE = "document.querySelector('.lp-frase')";
  const SJEKK = "document.querySelector('.lp-ordliste')";
  // From «klar»: start the turn and wait for the phrase (the countdown takes about 3 s).
  const startTur = async () => {
    await t.vent(KLAR);
    await pause();
    await t.klikk('[data-h="start-tur"]');
    await t.vent(FRASE, 8000);
  };
  // A paused turn with 2 s left: «Fortsett», and wait for the time to run out.
  const tidUte = async () => {
    if (await t.finnes('[data-h="pause"]')) {
      await pause();
      await t.klikk('[data-h="pause"]'); // a running clock saves every second
      await t.sov(300);
    }
    await endre("s.spill.igjen = 2", "document.querySelector('[data-h=\"fortsett-tur\"]')");
    await t.klikk('[data-h="fortsett-tur"]');
    await t.vent(SJEKK, 9000);
  };

  // ---------- Home and rules ----------
  await t.start({ navn: NAVN });
  t.sjekk(await t.finnes(".merker"), "Hjem-skjermen mangler merkene");
  if (t.norsk) {
    t.sjekk((await t.tekst("#skjerm h1")).trim() === "Leppeleseren", "Hjem-skjermen viser ikke «Leppeleseren»");
    t.sjekk((await t.tekst(".merker")).includes("Hodetelefoner"), "Hjem-skjermen sier ikke at dere trenger hodetelefoner");
  }
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark ol li, #ark .steg li, #ark li")) >= 4, "Reglene mangler stegene");
  if (t.norsk) t.sjekk((await t.tekst("#ark")).includes("Dere trenger: hodetelefoner til mobilen"), "Reglene sier ikke at dere trenger hodetelefoner");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // ---------- Setup ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes(".lp-trenger"), "Oppsettet sier ikke at dere trenger hodetelefoner");
  t.sjekk((await t.antall(".spiller")) === 3 && (await t.finnes('[data-h="modus"]')), "Oppsettet mangler spillerne eller modusvalget");
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent(KLAR);
  let st = await s();
  t.sjekk(st.spill.turer === 3 && st.spill.modus === "par" && st._aktiv === true, `Spillet startet ikke med 3 turer (${st.spill && st.spill.turer})`);
  const a0 = st.spill.start;
  t.sjekk((await t.antall(".lp-rolle")) === 2 && (await t.finnes(".lp-varsel")) && (await t.finnes("#lp-volum")), "Før turen mangler roller, hørselsvarselet eller volumet");
  if (t.norsk) t.sjekk((await t.tekst(".lp-varsel")).includes("Skru ned hvis det gjør vondt"), "Hørselsvarselet har feil tekst");
  t.sjekk((await t.tekst(".lp-hvem")).includes(NAVN[(a0 + 1) % 3]) && (await t.tekst(".lp-hvem")).includes(NAVN[a0]), "Feil leser eller lytter");

  // The volume slider is saved; «Prøv musikken» starts and stops the music (the kit's sound is off).
  t.sjekk(!(await t.js("Rusj.felles.lyd")), "Testen skal kjøre med lyden i kit-et av");
  await t.js("(() => { const el = document.querySelector('#lp-volum'); el.value = 35; el.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await t.sov(200);
  t.sjekk((await s()).volum === 35, "Volumet ble ikke lagret");
  t.sjekk((await musikk())[0] === "av", "Musikken spiller før noen har trykket");
  await t.klikk('[data-h="prov"]');
  await t.sov(400);
  let [m, ac] = await musikk();
  t.sjekk(m === "pa" && ac === "running", `«Prøv musikken» startet ikke musikken (${m}, ${ac})`);
  await t.klikk('[data-h="stil"][data-v="rock"]');
  await t.sov(300);
  t.sjekk((await s()).stil === "rock" && (await musikk())[0] === "pa", "Stilen ble ikke byttet mens musikken spiller");
  await t.bilde("klar", true);
  await t.klikk('[data-h="prov"]');
  await t.sov(200);
  t.sjekk((await musikk())[0] === "av", "«Stopp musikken» stoppet ikke");

  // ---------- The turn ----------
  await startTur();
  [m, ac] = await musikk();
  t.sjekk(m === "pa" && ac === "running", `Musikken spiller ikke i turen (${m}, ${ac}) – også når lyden i kit-et er av`);
  st = await s();
  t.sjekk(st.spill.runde && st.spill.runde.ord.length === 1 && !st.spill.pause, "Turen startet ikke med én frase");
  await t.bilde("tur");
  for (const h of ["riktig", "riktig", "hopp"]) {
    await pause();
    await t.klikk(`[data-h="${h}"]`);
  }
  st = await s();
  t.sjekk(st.spill.runde.ord.filter((w) => w.s === 1).length === 2 && st.spill.runde.ord.length === 4, "«Riktig!» og «Hopp over» telte feil");
  await pause();
  await t.klikk('[data-h="angre"]');
  st = await s();
  t.sjekk(st.spill.runde.ord.length === 3 && st.spill.runde.ord[2].s === null, "«Angre» tok ikke tilbake siste svar");
  t.sjekk((await t.tekst(".lp-teller b")).trim() === "2", "Telleren viser ikke 2 riktige");

  // The in-game switch: the group's own choice silences the music.
  await t.klikk('[data-h="musikk"]');
  await t.sov(200);
  t.sjekk((await musikk())[0] === "av" && (await s()).musikk === false, "Musikk-bryteren stoppet ikke musikken");
  await t.klikk('[data-h="musikk"]');
  await t.sov(300);
  t.sjekk((await musikk())[0] === "pa" && (await s()).musikk === true, "Musikk-bryteren startet ikke musikken igjen");

  // Small screens and a phone on its side.
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  for (const [b, h] of [[Math.min(375, b0), 560], [320, 568], [844, 390]]) {
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sov(500);
    t.sjekk(await t.friForDokk(".lp-kort"), `Frasen skjules bak knappene på ${b} × ${h}`);
    t.sjekk(await t.friForDokk(".lp-status"), `Klokka skjules bak knappene på ${b} × ${h}`);
    if (b <= b0) await t.bilde(`tur-${b}x${h}`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: b0, height: h0, deviceScaleFactor: 2, mobile: true });
  await t.sov(300);

  // The page is hidden (locked phone, another app): the music stops and the turn pauses.
  await t.js("(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); })()");
  await t.sov(300);
  st = await s();
  t.sjekk((await musikk())[0] === "av" && st.spill.pause === true, "Musikken stoppet ikke, eller turen pauset ikke, da siden ble skjult");
  await t.js("(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); })()");
  t.sjekk(await t.finnes('[data-h="fortsett-tur"]') && !(await t.finnes(".lp-frase")), "Pause-skjermen viser frasen");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-tur"]');
  await t.sov(300);
  t.sjekk((await musikk())[0] === "pa" && (await t.finnes(".lp-frase")), "«Fortsett» startet ikke musikken og frasen igjen");

  // A reload mid-turn: paused, no music, the answers kept.
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.sov(450);
  st = await s();
  t.sjekk(st.skjerm === "spill" && st.spill.pause === true && st.spill.runde.ord.length === 3, "Omlasting midt i turen mistet turen");
  t.sjekk((await musikk())[0] === "av" && !(await t.finnes(".lp-frase")), "Etter omlasting spiller musikken eller frasen vises uten trykk");

  // ---------- Time is up: the music stops, the check list ----------
  await tidUte();
  t.sjekk((await musikk())[0] === "av", "Musikken stoppet ikke da tiden var ute");
  st = await s();
  t.sjekk(st.skjerm === "sjekk" && st.spill.runde.ute, "Tiden ute gikk ikke til sjekklista");
  t.sjekk((await t.antall(".lp-ord")) === 3, `Sjekklista har ${await t.antall(".lp-ord")} fraser (ventet 3)`);
  await t.klikk('.lp-ord[data-v="1"]');
  st = await s();
  t.sjekk(st.spill.runde.ord.filter((w) => w.s === 1).length === 1, "Å rette i sjekklista virket ikke");
  await t.klikk('.lp-ord[data-v="1"]');
  await t.bilde("sjekk", true);
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(KLAR);
  st = await s();
  const leser0 = a0;
  const lytter0 = (a0 + 1) % 3;
  t.sjekk(st.spill.tur === 1 && st.spill.poeng[leser0] === 2 && st.spill.poeng[lytter0] === 2, `Poengene etter tur 1 er feil (${st.spill.poeng.join()})`);
  t.sjekk((await t.tekst(".lp-hvem")).includes(NAVN[(a0 + 2) % 3]), "Lytteren ble ikke leser i neste tur");

  // Back + continue; «Nytt spill» asks first.
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-h="ark-svar"]'), "«Nytt spill» spør ikke før spillet slettes");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');

  // ---------- «Avslutt» in the middle of a turn → Kåringen ----------
  await startTur();
  await pause();
  await t.klikk('[data-h="riktig"]');
  await pause();
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Avslutt» spurte ikke først");
  t.sjekk((await musikk())[0] === "av", "Musikken spiller mens «Avslutt» spør");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner') && document.querySelector('.poengliste')", 6000);
  st = await s();
  t.sjekk(st.spill.ferdig && st._aktiv === false && st.spill.poeng.reduce((a, b) => a + b, 0) === 6, `Kåringen etter avbrutt spill er feil (${st.spill.poeng.join()})`);
  t.sjekk((await t.finnes(".pall")) && (await t.finnes(".lp-best")), "Kåringen mangler pallen eller beste par");
  t.sjekk((await musikk())[0] === "av", "Musikken spiller på kåringen");
  if (await t.js("(window.RUSJ_ANDRE || []).length > 0")) t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill» på sluttskjermen");
  await t.sov(500);
  await t.bilde("kaaring", true);

  // ---------- Teams ----------
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  t.sjekk((await t.finnes('[data-h="lag"]')) && !(await t.finnes(".spiller")), "Lag mot lag viser ikke lagvalget");
  await t.klikk('[data-h="lag"][data-v="3"]');
  await t.klikk('[data-h="runder"][data-v="2"]');
  await t.bilde("oppsett-lag");
  await t.klikk('[data-h="start"]');
  await t.vent(KLAR);
  st = await s();
  t.sjekk(st.spill.modus === "lag" && st.spill.n === 3 && st.spill.turer === 6 && (await t.finnes(".lp-hvem.lag")), "Lag mot lag startet ikke med 3 lag og 6 turer");
  await t.bilde("klar-lag");
  // The music switched off for the group: the turn plays without it.
  await t.klikk('[data-h="stil"][data-v="av"]');
  t.sjekk((await s()).musikk === false && !(await t.finnes("#lp-volum")), "«Av» slo ikke av musikken");
  await startTur();
  t.sjekk((await musikk())[0] === "av", "Musikken spiller selv om gruppa har slått den av");
  await pause();
  await t.klikk('[data-h="riktig"]');
  await tidUte();
  await t.klikk('[data-h="neste"]');
  await t.vent(KLAR);
  st = await s();
  t.sjekk(st.spill.tur === 1 && st.spill.poeng[st.spill.start] === 1, `Laget fikk ikke poenget (${st.spill.poeng.join()})`);

  // ---------- A whole game to the end, «Spill igjen» ----------
  await endre("s.spill.tur = 5", KLAR);
  await startTur();
  await tidUte();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner') && document.querySelector('.poengliste')", 6000);
  st = await s();
  t.sjekk(st.spill.ferdig && st.skjerm === "slutt", "Spillet ble ikke ferdig etter siste tur");
  await t.klikk('[data-h="igjen"]');
  await t.vent(KLAR);
  st = await s();
  t.sjekk(st.spill.tur === 0 && !st.spill.ferdig && st.spill.turer === 6, "«Spill igjen» startet ikke et nytt spill med samme oppsett");
}
