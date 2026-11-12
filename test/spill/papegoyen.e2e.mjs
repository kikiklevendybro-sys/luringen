// Papegøyen: setup (packs, time, nodding rule), the chair, back during the countdown, questions
// by button and by swipe (only from the chosen packs), «Sa det!» with the squawk, «Angre» gives the
// time back, pause, reload mid-turn (comes back paused), back + continue, a turn that lasts the whole
// time, a player who stands over, «Kåringen» in seconds, then «Spill igjen» and ending early.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en papegoyen): the words it reads come from
// ORD below; the state and the links from t.nokkel and t.forside.

// The words the scenario reads, per edition.
const ORD = {
  nb: { nikk: /nikk/, ja: /ja/, streng: /jepp/, folgOpp: /Følg opp: «/, lurt: /Lurt av: «.+\?»/, vinner: (n) => `${n} vinner!`, vant: /vinner!/, kaaring: "kåringen" },
  en: { nikk: /nodding/, ja: /yes/, streng: /yep/, folgOpp: /Follow up: ‘/, lurt: /‘.+\?’/, vinner: (n) => `${n} wins!`, vant: /wins?!/, kaaring: "the results" },
  da: { nikk: /nik/, ja: /ja/, streng: /jep/, folgOpp: /Følg op: »/, lurt: /».+\?«/, vinner: (n) => `${n} vinder!`, vant: /vinder!/, kaaring: "kåringen" },
};

const S = "Rusj.S";
// An element must be fully visible above the dock (short phones), measured from the top.
const overDokk = (sel) =>
  `(() => { window.scrollTo(0, 0); const e = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); const d = document.querySelector('#skjerm .dokk').getBoundingClientRect(); return e.bottom <= d.top + 4 || e.right <= d.left || e.left >= d.right; })()`;
// Which pack the question on screen comes from.
const pakkeNa = `(() => { const ut = []; window.RUSJ_DATA.sporsmal.pakker.forEach((p) => p.sporsmal.forEach(() => ut.push(p.id))); return ut[${S}.spill.na.q]; })()`;

export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  t.sjekk((await t.antall('[data-h="pakke"]')) === 3, "Oppsettet skal ha tre spørsmålspakker");
  await t.klikk('[data-h="pakke"][data-v="voksen"]');
  let s = await t.tilstand();
  t.sjekk(JSON.stringify(s.oppsett.pakker) === '["barn","familie"]', `Voksen ble ikke valgt bort: ${JSON.stringify(s.oppsett.pakker)}`);
  await t.klikk('[data-h="tid"][data-v="30"]');
  await t.klikk('[data-h="nikk"]');
  t.sjekk(await t.finnes('[data-h="nikk"][aria-pressed="true"]'), "Nikkeforbudet ble ikke skrudd på");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.pa-stol')");
  await t.bilde("stol");
  s = await t.tilstand();
  const forste = s.spill.na.i;
  t.sjekk(new RegExp(`Testspiller ${"ABC"[forste]}`).test(await t.tekst("#skjerm h1")), "Stolen viser ikke hvem som skal svare");
  t.sjekk(ORD[t.sprak].nikk.test(await t.tekst(".pa-forbud")) && ORD[t.sprak].ja.test(await t.tekst(".pa-forbud")), "Forbudene vises ikke");

  // Back during the countdown must not start the clock by itself
  await t.klikk('[data-h="klar"]', 300);
  await t.klikk("#tilbake", 100);
  await t.sov(3200);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && !(await t.finnes("#pa-tid")), "Klokka startet av seg selv etter «tilbake» under nedtellingen");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.pa-stol')");

  // The turn: countdown, the clock runs, questions come by button and by swipe
  await t.klikk('[data-h="klar"]', 50);
  await t.vent("document.querySelector('#pa-tid')", 8000);
  await t.sov(1300);
  await t.bilde("spill");
  t.sjekk(await t.js(overDokk(".pa-kort")), "Spørsmålskortet skjules bak knappene nederst");
  t.sjekk(["barn", "familie"].includes(await t.js(pakkeNa)), "Spørsmålet er fra en pakke som er valgt bort");
  const q1 = (await t.tilstand()).spill.na.q;
  await t.klikk('[data-h="neste"]', 450);
  s = await t.tilstand();
  t.sjekk(s.spill.na.q !== q1 && s.spill.na.spm === 2, "«Neste spørsmål» ga ikke et nytt spørsmål");
  await t.sveip(".storkort", -220);
  await t.sov(300);
  s = await t.tilstand();
  t.sjekk(s.spill.na.spm === 3, "Et sveip ga ikke et nytt spørsmål");
  t.sjekk(!(await t.tekst(".storkort-tekst")).includes("{"), "Et navn i spørsmålet ble ikke fylt inn");
  t.sjekk(ORD[t.sprak].folgOpp.test(await t.tekst(".storkort-fot")), "Kortet foreslår ingen oppfølger");
  await t.sov(900);

  // «Sa det!» ends the turn with the squawk; «Angre» gives the time back (paused)
  await t.klikk('[data-h="sa-det"]');
  await t.vent("document.querySelector('.pa-skrik')");
  await t.sov(500);
  await t.bilde("sa-det", true);
  s = await t.tilstand();
  let l = s.spill.logg[0];
  t.sjekk(l && l.sek >= 2 && l.sek < 30 && s.spill.tider[forste] === l.sek, `Tiden ble ikke registrert riktig: ${JSON.stringify(l)}`);
  t.sjekk((t.norsk ? new RegExp(`holdt ut i ${l.sek} sekund`) : new RegExp(`\\b${l.sek}\\b`)).test(await t.tekst("#skjerm h1")), "Overskriften viser ikke hvor lenge spilleren holdt ut");
  t.sjekk(ORD[t.sprak].lurt.test(await t.tekst(".pa-lurt")), "Papegøyeskjermen viser ikke spørsmålet som lurte spilleren");
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"fortsett-tur\"]')");
  s = await t.tilstand();
  t.sjekk(s.spill.logg.length === 0 && s.spill.tider[forste] === 0 && s.spill.na.spm === 3, "«Angre» ga ikke tiden tilbake");
  await t.bilde("pause");
  await t.klikk('[data-h="fortsett-tur"]');
  await t.sov(700);

  // Reload mid-turn: the turn comes back paused, with the same question
  const qFor = (await t.tilstand()).spill.na.q;
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "spill" && (await t.finnes('[data-h="fortsett-tur"]')) && s.spill.na.q === qFor, "Turen ble ikke gjenopptatt på pause etter omlasting");
  // Back home and continue («Nytt spill» asks first)
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="fortsett"]'), "Mangler «Fortsett» mens et spill pågår");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  await t.klikk('#ark [data-v="nei"]');
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('[data-h=\"fortsett-tur\"]')");
  await t.klikk('[data-h="fortsett-tur"]');
  await t.sov(500);
  await t.klikk('[data-h="sa-det"]');
  await t.vent("document.querySelector('.pa-skrik')");
  s = await t.tilstand();
  t.sjekk(s.spill.logg.length === 1 && s.spill.tider[forste] >= 2, "Tiden etter omlasting ble ikke registrert");

  // The next player lasts the whole time
  await t.klikk('[data-h="neste-spiller"]');
  await t.vent("document.querySelector('.pa-stol')");
  const andre = (await t.tilstand()).spill.na.i;
  t.sjekk(andre === (forste + 1) % 3, "Turen gikk ikke videre til neste spiller");
  await t.klikk('[data-h="klar"]', 50);
  await t.vent("document.querySelector('#pa-tid')", 8000);
  await t.sov(300);
  await t.js("Rusj.timer('pa-tid').leggTil(-500)");
  await t.vent("document.querySelector('.pa-klarte')");
  await t.sov(1000);
  await t.bilde("klarte", true);
  s = await t.tilstand();
  t.sjekk(s.spill.tider[andre] === 30 && s.spill.logg[1].klarte, "Hele tiden ga ikke 30 sekunder");
  t.sjekk(!(await t.finnes('[data-h="angre"]')), "«Angre» skal ikke vises når tiden gikk ut");

  // The third player stands over; that was the last turn
  await t.klikk('[data-h="neste-spiller"]');
  await t.vent("document.querySelector('.pa-stol')");
  await t.klikk('[data-h="sta-over"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt .banner')");
  await t.sov(400);
  await t.bilde("slutt", true);
  t.sjekk((await t.tekst("#skjerm h1")).includes(ORD[t.sprak].vinner(`Testspiller ${"ABC"[andre]}`)), "Vinneren vises ikke");
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === ORD[t.sprak].kaaring, "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk(/30 s/.test(await t.tekst(".pall")), "Pallen viser ikke sekunder");
  t.sjekk(await t.finnes(".pa-sek .poengliste") && (await t.finnes(".pa-priser")), "Kåringen mangler poengliste eller priser");
  // (a one-game test build of another edition has no other games to suggest)
  t.sjekk(((await t.finnes(".flere-spill")) || (!t.norsk && !(await t.js("(window.RUSJ_ANDRE || []).length")))) && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler andre spill eller «Alle spill»");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "papegoyen"), "Resultatet ble ikke lagt i «Kveldens gjeng»");
  t.sjekk((await t.tilstand())._aktiv === false, "Spillet regnes fortsatt som pågående på «Kåringen»");
  await t.sov(2000);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');

  // «Spill igjen» keeps the setup; strict rules show the extra forbidden words; end early
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="streng"]');
  await t.klikk('[data-h="runder"][data-v="2"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.pa-stol')");
  t.sjekk(ORD[t.sprak].streng.test(await t.tekst(".pa-forbud")), "Strenge regler vises ikke");
  t.sjekk((await t.tilstand()).spill.turer === 6, "To runder med tre spillere skal gi seks turer");
  await t.klikk('[data-h="klar"]', 50);
  await t.vent("document.querySelector('#pa-tid')", 8000);
  await t.sov(1200);
  await t.klikk('[data-h="sa-det"]');
  await t.vent("document.querySelector('.pa-skrik')");
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt .banner')");
  t.sjekk(ORD[t.sprak].vant.test(await t.tekst("#skjerm h1")), "Avslutt ga ingen vinner");
  await t.bilde("slutt-tidlig", true);
}
