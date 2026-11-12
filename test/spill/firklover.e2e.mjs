// Firkløveren: a puzzle from another day is dropped for today's; the board shows sixteen toggle
// tiles (aria-pressed) above the dock; three of four right gives «Én unna!» and costs a leaf; the
// same guess twice costs nothing; a right group locks in as a strip with its theme; «Stokk» shuffles;
// a reload mid-puzzle keeps the strip and the chosen tiles; back + «Fortsett … · 1 av 4»; the rest
// solves the day (streak goes on from yesterday), the result shows the attempts, the groups, the
// numbers and the countdown, and shares hearts through R.del (never the words); home shows the
// countdown; #dagens opens the result. Then a failed day (four mistakes), keyboard toggling, practice
// with an older clover, and the rules' key to the levels.
export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const tilstand = () => t.tilstand();
  const hjelp = () => t.tekst(".fk-hjelp");
  const velg = async (...ider) => {
    for (const i of ider) await t.klikk(`.fk-rute[data-v="${i}"]`, 40);
  };
  // Choose four tiles and press «Prøv»; done when the guess is saved and the board is drawn again.
  const prov = async (...ider) => {
    const for_ = (await tilstand())[(await tilstand()).modus].forsok.length;
    await velg(...ider);
    await t.klikk("#fk-prov", 60);
    await t.vent(`(() => { const s = JSON.parse(localStorage.getItem("rusj.firklover.v1")); return s[s.modus].forsok.length === ${for_ + 1}; })()`, 4000);
    await t.vent(`!document.querySelector(".fk-rute.hopp, .fk-rute.risting") || !!document.querySelector(".fk-klover .faller") || !!document.querySelector(".skjerm-resultat")`, 4000);
    await t.sov(700);
  };
  const daglig = () => t.js(`JSON.parse(localStorage.getItem("rusj.daglig") || "{}").firklover || null`);
  const ordene = async () => {
    const s = await tilstand();
    const sp = s[s.modus];
    return t.js(`(() => { const k = window.RUSJ_DATA.klovere.dagens; const M = Rusj.app._motor; return k[M.indeksFor(${sp.nr}, k.length)].flatMap((g) => g.o); })()`);
  };
  const dele = async () => {
    await t.js(`(() => {
      window.__delt = null;
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", { value: { writeText: (x) => { window.__delt = x; return Promise.resolve(); } }, configurable: true });
    })()`);
    await t.klikk('[data-h="del"]', 400);
    return t.js("window.__delt");
  };

  await t.start();
  const iDag = await t.js("Rusj.dag().nr");
  const M = { forste: await t.js("Rusj.app._motor.FORSTE") };
  t.sjekk(M.forste === (await t.js("Rusj.dag(new Date(Date.UTC(2026, 10, 1, 12))).nr")), "Firkløveren nr. 1 skal være 1. november 2026");
  // Yesterday solved (streak 2), and an unfinished clover from the day before that must not come back.
  await t.js(`(() => {
    const S = Rusj.S;
    S.stat = { spilt: 2, vunnet: 2, perfekt: 1, rekke: 2, best: 2, sistVunnet: ${iDag - 1}, sistSpilt: ${iDag - 1} };
    S.dag = { nr: ${iDag - 2}, rekkefolge: [...Array(16).keys()], valgt: [1], forsok: [[0, 1, 2, 4]] };
    Rusj.lagre();
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(/Dagens kløver/.test(await t.tekst('.hjem-knapper [data-h="dag"]')) && !/Fortsett dagens/.test(await t.tekst(".hjem-knapper")), "En kløver fra en annen dag skal ikke gi «Fortsett» i dag");
  t.sjekk(/2/.test(await t.tekst(".merker")), "Rekka (2 dager på rad) vises ikke på hjem-skjermen");
  await t.bilde("hjem");

  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelectorAll('.fk-rute').length === 16");
  let s = await tilstand();
  t.sjekk(s.dag.nr === iDag && s.dag.forsok.length === 0 && s.dag.valgt.length === 0, "Dagens kløver startet ikke på nytt");
  t.sjekk(JSON.stringify(s.dag.rekkefolge) === JSON.stringify(await t.js(`Rusj.app._motor.startRekkefolge(${iDag})`)), "Startrekkefølgen er ikke dagens faste");
  t.sjekk((await t.antall('.fk-rute[aria-pressed="false"]')) === 16, "Rutene skal være av/på-knapper (aria-pressed)");
  t.sjekk((await t.antall(".fk-klover .blad:not(.borte)")) === 4, "Kløveren skal ha fire blader");
  t.sjekk(/4 feil igjen/.test(await t.js(`document.querySelector(".fk-klover").getAttribute("aria-label")`)), "Kløveren mangler «4 feil igjen» for skjermleser");
  t.sjekk(await t.friForDokk(".fk-brett"), "Brettet ligger bak dokka");
  t.sjekk(await t.js(`document.querySelector("#fk-prov").disabled`), "«Prøv» skal være av før fire ord er valgt");
  const ord = await ordene();
  t.sjekk(ord.length === 16 && (await t.tekst(".fk-brett")).includes(ord[0]), "Ordene på brettet kommer ikke fra dagens kløver");
  await t.bilde("brett");

  // Three of one group and one of another: «Én unna!» and a leaf falls
  await prov(0, 1, 2, 4);
  s = await tilstand();
  t.sjekk(s.dag.forsok.length === 1 && s.dag.valgt.length === 4, `Feil gjett skal lagres, og valget skal stå (${JSON.stringify(s.dag)})`);
  t.sjekk(/Én unna!/.test(await hjelp()), `Mangler «Én unna!» (${await hjelp()})`);
  t.sjekk((await t.antall(".fk-klover .blad.borte")) === 1, "Et blad skulle falle av kløveren");
  t.sjekk(JSON.stringify((await daglig()) && (await daglig()).pagar) === JSON.stringify({ nr: iDag, tekst: "0 av 4" }), `R.dagligIGang ble ikke kalt: ${JSON.stringify(await daglig())}`);
  await t.bilde("en-unna");
  // The same four again: no new mistake
  await t.klikk("#fk-prov", 300);
  t.sjekk(/prøvd/.test(await hjelp()) && (await tilstand()).dag.forsok.length === 1, "Samme gjett to ganger skal avvises uten å koste et blad");
  await t.klikk('[data-h="fjern"]', 120);
  t.sjekk((await t.antall('.fk-rute[aria-pressed="true"]')) === 0 && (await tilstand()).dag.valgt.length === 0, "«Fjern valg» tømte ikke valget");

  // A right group (level 2) locks in as a strip with its theme
  await prov(7, 5, 6, 4);
  s = await tilstand();
  t.sjekk((await t.antall(".fk-stripe.fk-himmel")) === 1 && (await t.antall(".fk-rute")) === 12, "Riktig gruppe ble ikke en strimmel");
  const stripe = await t.js(`document.querySelector(".fk-stripe").getAttribute("aria-label")`);
  t.sjekk(/^Riktig gruppe, middels: /.test(stripe) && stripe.includes(ord[4]), `Strimmelen mangler tema og ord for skjermleser: ${stripe}`);
  t.sjekk((await t.antall(".fk-stripe .fk-niva .fylt")) === 2, "Nivået skal også vises som et kløvermerke (to blader for middels)");
  t.sjekk(JSON.stringify((await daglig()).pagar) === JSON.stringify({ nr: iDag, tekst: "1 av 4" }), "R.dagligIGang skulle si «1 av 4»");
  await t.bilde("en-gruppe");

  // «Stokk» shuffles the remaining words
  await pause();
  const for_ = (await tilstand()).dag.rekkefolge.join();
  await t.klikk('[data-h="stokk"]', 300);
  t.sjekk((await tilstand()).dag.rekkefolge.join() !== for_ && (await t.antall(".fk-rute")) === 12 && (await t.antall(".fk-stripe")) === 1, "«Stokk» stokket ikke ordene");

  // Reload mid-puzzle: the strip, the mistakes and the chosen tiles come back
  await pause();
  await velg(8, 9);
  await t.lastSide(t.side, "document.querySelector('.fk-brett')");
  s = await tilstand();
  t.sjekk(s.skjerm === "brett" && s.dag.valgt.join() === "8,9" && (await t.antall('.fk-rute[aria-pressed="true"]')) === 2, "Valget forsvant etter omlasting");
  t.sjekk((await t.antall(".fk-stripe")) === 1 && (await t.antall(".fk-klover .blad.borte")) === 1, "Strimmelen eller feilen forsvant etter omlasting");

  // Back to home and continue
  await t.klikk("#tilbake");
  t.sjekk(/Fortsett dagens kløver · 1 av 4/.test(await t.tekst('.hjem-knapper [data-h="dag"]')), "Hjem viser ikke «Fortsett dagens kløver · 1 av 4»");
  t.sjekk((await tilstand())._aktiv === true, "En påbegynt kløver er ikke merket som pågående");
  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.fk-brett')");
  await pause();

  // Solve the rest: the day is won with one mistake
  await prov(10, 11);
  await prov(0, 1, 2, 3);
  await prov(15, 14, 13, 12);
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(600);
  s = await tilstand();
  t.sjekk(s.stat.spilt === 3 && s.stat.vunnet === 3 && s.stat.rekke === 3 && s.stat.best === 3 && s.stat.perfekt === 1, `Statistikken er feil: ${JSON.stringify(s.stat)}`);
  const d = await daglig();
  t.sjekk(d && d.nr === iDag && d.vunnet === true && d.rekke === 3 && d.res === "1 feil" && !d.pagar, `R.dagligFerdig ble ikke kalt riktig: ${JSON.stringify(d)}`);
  t.sjekk(s._aktiv === false, "En løst kløver skal ikke være merket som pågående");
  t.sjekk(/Alle fire grupper/.test(await t.tekst("#skjerm h1")), `Feil overskrift: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk((await t.antall(".fk-minirad")) === 5 && (await t.antall(".fk-minirad .fk-mini")) === 20, "Forsøkene vises ikke som rader på resultatet");
  t.sjekk((await t.antall(".fk-grupper .fk-stripe")) === 4, "Gruppene vises ikke på resultatet");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".skjerm-resultat .fk-nedtelling b")), "Nedtellingen (TT:MM:SS) mangler på resultatet");
  const klokke1 = await t.tekst(".skjerm-resultat .fk-nedtelling b");
  await t.sov(1300);
  t.sjekk((await t.tekst(".skjerm-resultat .fk-nedtelling b")) !== klokke1, "Nedtellingen går ikke");
  t.sjekk((await t.tekst(".dokk .knapp")).trim() === "Del resultatet", "Hovedknappen på resultatet skal være «Del resultatet»");
  t.sjekk(await t.finnes('#skjerm a.lenke[href="/"]'), "Mangler «Alle spill» på resultatet");
  await t.bilde("resultat", true);

  // Share: hearts and the address, never the words
  let delt = await dele();
  t.sjekk(delt && /^Firkløveren nr\. \d+ · 1 feil · 🔥 3 på rad\n\n/.test(delt) && /\n\nhttps:\/\/rusj\.no\/firklover\/#utfordring$/.test(delt), `Delingsteksten er feil: ${delt}`);
  const rader = delt ? delt.split("\n").slice(2, 7) : [];
  t.sjekk(rader.length === 5 && rader.every((r) => /^(?:💚|💙|💛|💗){4}$/u.test(r)) && rader[0] === "💚💚💚💙", `Delingsteksten skal ha fem rader med hjerter: ${JSON.stringify(rader)}`);
  const lav = (delt || "").toLowerCase();
  t.sjekk(delt && !ord.some((o) => lav.includes(o.toLowerCase())), "Delingsteksten røper ord fra kløveren");
  t.sjekk(delt && !/[🟩🟨🟦🟪]/u.test(delt), "Delingsteksten skal ikke bruke fargede firkanter");

  // Home: today's result and the countdown; #dagens opens the result
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="se-resultat"]'), "Hjem viser ikke «Se dagens resultat»");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".hjem-knapper .fk-nedtelling b")), "Nedtellingen vises ikke på hjem");
  t.sjekk(/3/.test(await t.tekst(".merker")), "Rekka på hjem-skjermen ble ikke 3");
  await t.bilde("hjem-ferdig");
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-resultat')");
  t.sjekk(await t.finnes(".skjerm-resultat"), "#dagens åpner ikke dagens resultat");

  // A failed day: four mistakes show every group, the day counts as lost
  await t.js(`(() => {
    const S = Rusj.S;
    S.dag = null;
    S.stat = { spilt: 0, vunnet: 0, perfekt: 0, rekke: 0, best: 0, sistVunnet: null, sistSpilt: null };
    S.skjerm = "hjem";
    Rusj.lagre();
    localStorage.removeItem("rusj.daglig");
  })()`);
  await t.lastSide(t.side + "#dagens", "document.querySelector('.fk-brett')");
  t.sjekk((await t.antall(".fk-rute")) === 16 && (await tilstand()).dag.forsok.length === 0, "#dagens åpner ikke et nytt brett");
  await pause();
  for (const g of [[0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14]]) {
    await prov(...g);
    await t.klikk('[data-h="fjern"]', 80);
  }
  t.sjekk((await t.antall(".fk-klover .blad.borte")) === 3, "Tre feil skal gi tre falne blader");
  await t.bilde("tre-feil");
  await prov(3, 7, 11, 15);
  await t.vent("document.querySelectorAll('.fk-stripe.avslort').length === 4", 3000);
  await t.bilde("tapt-brett");
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(500);
  s = await tilstand();
  const d2 = await daglig();
  t.sjekk(d2 && d2.nr === iDag && d2.vunnet === false && d2.rekke === 0 && d2.res === "Ikke løst", `Et tapt døgn ble ikke meldt riktig: ${JSON.stringify(d2)}`);
  t.sjekk(s.stat.spilt === 1 && s.stat.vunnet === 0 && s.stat.rekke === 0, `Statistikken etter tap er feil: ${JSON.stringify(s.stat)}`);
  t.sjekk(/0 av 4/.test(await t.tekst("#skjerm h1")) && (await t.antall(".fk-grupper .fk-stripe")) === 4, "Resultatet etter tap viser ikke gruppene");
  await t.bilde("tapt", true);
  delt = await dele();
  t.sjekk(delt && /^Firkløveren nr\. \d+ · Ikke løst\n\n/.test(delt) && delt.split("\n").slice(2, 6).every((r) => /^(?:💚|💙|💛|💗){4}$/u.test(r)), `Delingsteksten etter tap er feil: ${delt}`);
  t.sjekk(delt && !ord.some((o) => delt.toLowerCase().includes(o.toLowerCase())), "Delingsteksten etter tap røper ord");

  // Practice: older clovers, newest first; one is solved, the day's statistics stay as they were
  await t.klikk('.lenkerad [data-h="arkiv"]');
  await t.vent("document.querySelector('.fk-arkiv')");
  const antall = iDag - M.forste;
  t.sjekk((await t.antall(".fk-arkivrad")) === Math.min(antall, 126), `Arkivet skal ha ${antall} eldre kløvere (har ${await t.antall(".fk-arkivrad")})`);
  t.sjekk(new RegExp(`^Nr\\. ${antall}\\b`).test(await t.tekst(".fk-arkivrad")), "Den nyeste eldre kløveren skal stå først");
  await t.bilde("arkiv");
  await t.klikk(".fk-arkivrad");
  await t.vent("document.querySelectorAll('.fk-rute').length === 16");
  s = await tilstand();
  t.sjekk(s.modus === "ov" && s.ov.nr === iDag - 1, "Øvingen startet ikke med gårsdagens kløver");
  t.sjekk(/øving/i.test(await t.tekst("#topp-tittel")), "Øvingen er ikke merket «Øving»");
  // Keyboard: Space on a focused tile toggles it
  await pause();
  await t.js(`document.querySelector('.fk-rute[data-v="0"]').focus()`);
  await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
  await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await t.sov(200);
  t.sjekk((await t.js(`document.querySelector('.fk-rute[data-v="0"]').getAttribute("aria-pressed")`)) === "true", "Mellomrom på en fokusert rute valgte den ikke");
  await t.klikk('[data-h="fjern"]', 120);
  await pause();
  for (const g of [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]]) await prov(...g);
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(400);
  s = await tilstand();
  t.sjekk(s.ovLost[iDag - 1] === 1 && s.stat.spilt === 1, `Øving skal lagres for seg og ikke telle i dagens statistikk (${JSON.stringify(s.ovLost)}, ${JSON.stringify(s.stat)})`);
  t.sjekk((await daglig()).res === "Ikke løst", "Øving skal ikke meldes til forsiden");
  t.sjekk(/uten en eneste feil/.test(await t.tekst("#skjerm h1")), "Øvingen ble ikke perfekt");
  await t.bilde("ov-resultat", true);
  await t.klikk('[data-h="arkiv"]');
  await t.vent("document.querySelector('.fk-arkiv')");
  t.sjekk(/✓/.test(await t.tekst(".fk-arkivrad")), "Løst kløver er ikke merket i arkivet");

  // The rules: the key to the levels (colour + clover mark + name)
  await t.klikk("#reglerknapp");
  t.sjekk((await t.antall("#ark .fk-nivaliste li")) === 4 && /Vriest/.test(await t.tekst("#ark .fk-nivaliste")), "Reglene forklarer ikke nivåene");
  await t.js("document.querySelector('#ark .fk-nivaliste').scrollIntoView({ block: 'start' })");
  await t.bilde("regler-nivaer");
  await t.klikk('#ark [data-h="lukk-ark"]');
}
