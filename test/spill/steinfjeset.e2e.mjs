// Steinfjeset: setup (mode, time, rounds), the pair screen with the secret task (Start locked until
// the clown has seen it, «Bytt oppgave» hides it again), back during the countdown, «Hen lo!» gives
// the clown a point, «Angre» gives the turn back paused, reload mid-duel (comes back paused, same
// task), back + continue, the time running out gives the stone face the point, «Stå over»,
// «Kåringen» with podium and the evening's scoreboard, then «Dobbel trøbbel» and ending early.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en steinfjeset): texts are only checked in
// Norwegian (or through ORD); the state and links come from t.tilstand, t.nokkel and t.forside.

const ORD = {
  nb: { vinner: (n) => `${n} vinner!`, vant: /vinner!/, kaaring: "kåringen", fikk: /fikk .+ til å le!/, holdt: /holdt maska!/ },
  en: { vinner: (n) => `${n} wins!`, vant: /wins?!/, kaaring: "the results", fikk: /made .+ laugh!/, holdt: /straight face!/ },
  da: { vinner: (n) => `${n} vinder!`, vant: /vinder!/, kaaring: "kåringen", fikk: /fik .+ til at grine!/, holdt: /holdt masken!/ },
};
const navn = (i) => `Testspiller ${"ABC"[i]}`;

export default async function (t) {
  const o = ORD[t.sprak];
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  t.sjekk(await t.finnes('[data-h="modus"][data-v="klassisk"][aria-pressed="true"]'), "Klovn mot steinfjes skal være forvalgt");
  t.sjekk(await t.js(`document.querySelector('#skjerm .seksjon [data-h="modus"]') === document.querySelector('#skjerm [data-h]:not([data-h="tilbake"])')`), "Valget av spillemåte skal være først i oppsettet");
  await t.klikk('[data-h="tid"][data-v="20"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-par .mappe')");
  await t.bilde("par");
  let s = await t.tilstand();
  t.sjekk(s.spill.turer === 3 && s.spill.tid === 20, `Feil oppsett: ${JSON.stringify([s.spill.turer, s.spill.tid])}`);
  const k1 = s.spill.na.klovn;
  const s1 = s.spill.na.stein;
  t.sjekk(k1 !== s1 && s1 === (k1 + 1) % 3, "Første par er feil");
  t.sjekk((await t.tekst(".sf-duell")).includes(navn(k1)) && (await t.tekst(".sf-duell")).includes(navn(s1)), "Paret vises ikke");
  t.sjekk(await t.finnes('[data-h="klar"]:disabled'), "Start skal være låst til klovnen har sett oppgaven");
  t.sjekk(await t.friForDokk(".mappe"), "Det hemmelige kortet skjules bak knappene nederst");

  // The secret card; «Bytt oppgave» draws a new task and locks Start again
  let slipp = await t.hold(".mappe", 650);
  t.sjekk(await t.finnes(".mappe .sf-bak .kort-ord"), "Kortet viser ikke oppgaven");
  await t.bilde("kort");
  await slipp();
  await t.vent("!document.querySelector('[data-h=\"klar\"]').disabled");
  const q0 = (await t.tilstand()).spill.na.q;
  await t.klikk('[data-h="bytt"]');
  s = await t.tilstand();
  t.sjekk(s.spill.na.q !== q0 && !s.spill.na.sett && (await t.finnes('[data-h="klar"]:disabled')), "«Bytt oppgave» ga ikke en ny, skjult oppgave");
  slipp = await t.hold(".mappe", 650);
  await slipp();
  await t.vent("!document.querySelector('[data-h=\"klar\"]').disabled");

  // Back during the countdown must not start the clock by itself
  await t.klikk('[data-h="klar"]', 300);
  await t.klikk("#tilbake", 100);
  await t.sov(3200);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && !(await t.finnes("#sf-tid")), "Klokka startet av seg selv etter «tilbake» under nedtellingen");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.skjerm-par .mappe')");

  // The duel: «Hen lo!» gives the clown the point
  await t.klikk('[data-h="klar"]', 50);
  await t.vent("document.querySelector('#sf-tid')", 8000);
  await t.sov(1300);
  await t.bilde("spill");
  t.sjekk(await t.friForDokk(".sf-kort"), "Oppgavekortet skjules bak knappene nederst");
  await t.klikk('[data-h="lo"]');
  await t.vent("document.querySelector('.sf-knakk')");
  await t.sov(500);
  await t.bilde("lo", true);
  s = await t.tilstand();
  let l = s.spill.logg[0];
  t.sjekk(l && l.lo === s1 && s.spill.poeng[k1] === 1 && l.igjen > 10, `Poenget gikk ikke til klovnen: ${JSON.stringify([l, s.spill.poeng])}`);
  t.sjekk(o.fikk.test(await t.tekst("#skjerm h1")), "Overskriften sier ikke hvem som fikk hvem til å le");

  // «Angre» takes the point back; the duel is paused with the time it had
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"fortsett-tur\"]')");
  s = await t.tilstand();
  t.sjekk(s.spill.logg.length === 0 && s.spill.poeng[k1] === 0 && s.spill.na.pause && s.spill.na.igjen > 10, "«Angre» ga ikke turen tilbake");
  await t.bilde("pause");

  // Reload mid-duel: back paused, same task
  const qFor = s.spill.na.q;
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "spill" && (await t.finnes('[data-h="fortsett-tur"]')) && s.spill.na.q === qFor, "Duellen ble ikke gjenopptatt på pause etter omlasting");
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
  // The time runs out: the stone face held
  await t.js("Rusj.timer('sf-tid').leggTil(-500)");
  await t.vent("document.querySelector('.sf-holdt')");
  await t.sov(900);
  await t.bilde("holdt", true);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[s1] === 1 && s.spill.poeng[k1] === 0 && s.spill.logg[0].lo === -1, "Tiden ute ga ikke steinfjeset poenget");
  t.sjekk(o.holdt.test(await t.tekst("#skjerm h1")), "Overskriften sier ikke at steinfjeset holdt maska");
  // «Angre» after the time ran out: judge by hand – it was a laugh after all
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"klarte\"]')");
  await t.bilde("dom");
  await t.klikk('[data-h="lo"]');
  await t.vent("document.querySelector('.sf-knakk')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[k1] === 1 && s.spill.poeng[s1] === 0, "Dommen etter «Angre» ble feil");

  // Next pair: the next seat is the clown; then a pair stands over
  await t.klikk('[data-h="neste-par"]');
  await t.vent("document.querySelector('.skjerm-par .mappe')");
  s = await t.tilstand();
  const k2 = s.spill.na.klovn;
  t.sjekk(k2 === s1 && s.spill.na.stein === (k2 + 1) % 3, "Turen gikk ikke videre til neste par");
  slipp = await t.hold(".mappe", 650);
  await slipp();
  await t.klikk('[data-h="klar"]', 50);
  await t.vent("document.querySelector('#sf-tid')", 8000);
  await t.sov(300);
  await t.js("Rusj.timer('sf-tid').leggTil(-500)");
  await t.vent("document.querySelector('.sf-holdt')");
  await t.sov(400);
  await t.klikk('[data-h="neste-par"]');
  await t.vent("document.querySelector('.skjerm-par .mappe')");
  await t.klikk('[data-h="sta-over"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');

  // Kåringen: two players on 1 point, a shared win
  await t.vent("document.querySelector('.skjerm-slutt .banner')");
  await t.sov(400);
  await t.bilde("slutt", true);
  s = await t.tilstand();
  t.sjekk(JSON.stringify(s.spill.poeng.slice().sort()) === "[0,1,1]", `Feil sluttstilling: ${JSON.stringify(s.spill.poeng)}`);
  t.sjekk(o.vant.test(await t.tekst("#skjerm h1")), "Vinneren vises ikke");
  t.sjekk((await t.tekst("#topp-tittel")).trim().toLowerCase() === o.kaaring, "Sluttskjermen heter ikke «Kåringen»");
  t.sjekk((await t.finnes(".pall")) && (await t.finnes(".poengliste")) && (await t.finnes(".sf-priser")), "Kåringen mangler pall, poengliste eller priser");
  t.sjekk(((await t.finnes(".flere-spill")) || (!t.norsk && !(await t.js("(window.RUSJ_ANDRE || []).length")))) && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler andre spill eller «Alle spill»");
  const kveld = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  t.sjekk(kveld && kveld.spill.some((x) => x.id === "steinfjeset"), "Resultatet ble ikke lagt i «Kveldens gjeng»");
  t.sjekk((await t.tilstand())._aktiv === false, "Spillet regnes fortsatt som pågående på «Kåringen»");
  await t.sov(2000);
  if (await t.finnes("#ark:not([hidden])")) await t.klikk('#ark [data-h="lukk-ark"]');

  // Dobbel trøbbel: the task is open, a laugh gives the other one the point; then end early
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="dobbel"]');
  await t.klikk('[data-h="runder"][data-v="2"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.skjerm-par .sf-kort')");
  t.sjekk(!(await t.finnes(".skjerm-par .mappe")) && !(await t.finnes('[data-h="klar"]:disabled')), "I Dobbel trøbbel skal oppgaven vises åpent");
  await t.bilde("dobbel-par");
  s = await t.tilstand();
  t.sjekk(s.spill.turer === 6 && s.spill.modus === "dobbel", "To runder med tre spillere skal gi seks dueller");
  const a = s.spill.na.klovn;
  const b = s.spill.na.stein;
  await t.klikk('[data-h="klar"]', 50);
  await t.vent("document.querySelector('#sf-tid')", 8000);
  await t.sov(800);
  t.sjekk((await t.antall('.sf-knapper [data-h="lo"]')) === 2, "Dobbel trøbbel skal ha én «lo»-knapp per spiller");
  await t.bilde("dobbel-spill");
  await t.klikk(`[data-h="lo"][data-v="${a}"]`);
  await t.vent("document.querySelector('.sf-knakk')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[b] === 1 && s.spill.poeng[a] === 0, "Den som lo først, ga ikke den andre poenget");
  await t.klikk('[data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.skjerm-slutt .banner')");
  t.sjekk((await t.tekst("#skjerm h1")).includes(o.vinner(navn(b))), "Avslutt ga feil vinner");
  await t.bilde("slutt-tidlig", true);
}
