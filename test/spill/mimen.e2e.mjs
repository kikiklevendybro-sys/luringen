// Mimen. Hurtigmim (the main mode), everyone against everyone: the big zones, taps and a double
// tap, reload and «back» in the middle of a turn, the check list, the record, Kåringen, the
// evening's scoreboard and the share text. Then «Én om gangen» in three screens (the secret card
// on the hand-over, who guessed on the answer), teams in both modes, the defaults by group size,
// the Jul deep link and settings saved by the older version.

// An element must be fully visible above the dock (short phones), measured from the top — or,
// on a phone on its side where the dock is a column on the right, beside it and inside the screen.
const overDokk = (sel) =>
  `(() => { window.scrollTo(0, 0); const e = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); const d = document.querySelector('#skjerm .dokk').getBoundingClientRect(); return e.right <= d.left + 1 || e.left >= d.right - 1 ? e.bottom <= innerHeight + 1 : e.bottom <= d.top + 20; })()`;
// Runs in every edition (node test/rusj-e2e.mjs --sprak en mimen): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names and the edition's storage keys.
const NOKKEL = (n) => `("rusj." + (window.Rusj.sprak === "nb" ? "" : window.Rusj.sprak + ".") + "${n}")`;
const REKORD = `JSON.parse(localStorage.getItem(${NOKKEL("mimen.rekord")}) || 'null')`;
const KVELD = `JSON.parse(localStorage.getItem(${NOKKEL("kveld")}) || 'null')`;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}]/u;

// Hurtigmim: from the hand-over screen through the countdown to the first task.
async function startTur(t) {
  await t.klikk('[data-h="start-tur"]', 50);
  await t.vent("document.querySelector('.mi-riktig')", 8000);
  await t.sov(300);
}
// One task answered (a second tap within 350 ms is ignored on purpose, so wait a little longer).
const riktig = (t) => t.klikk('[data-h="h-riktig"]', 420);
const pass = (t) => t.klikk('[data-h="h-pass"]', 420);
async function tidUte(t, sel) {
  await t.js("Rusj.timer('mi-tid').leggTil(-500)");
  await t.vent(`document.querySelector(${JSON.stringify(sel)})`);
  await t.sov(200);
}
// Én om gangen: read the task on the hand-over screen (hold the card) and start miming — with
// two tasks on the card, start with the one worth 1 point (valg 0) or 2 points (valg 1).
async function mim(t, bilde, valg = 0) {
  await t.vent("document.querySelector('#skjerm > .mappe')");
  t.sjekk(await t.finnes('[data-h="start-mim"]:disabled'), "Start skal være låst til oppgaven er sett");
  const slipp = await t.hold(".mappe", 650);
  if (bilde) await t.bilde(bilde);
  await slipp();
  await t.vent("!document.querySelector('[data-h=\"start-mim\"]').disabled");
  const to = await t.finnes('[data-h="start-mim"][data-v]');
  await t.klikk(to ? `[data-h="start-mim"][data-v="${valg}"]` : '[data-h="start-mim"]', 50);
  await t.vent("document.querySelector('#mi-tid')", 8000);
  await t.sov(400);
}

export default async function (t) {
  const h1 = async () => (await t.tekst("#skjerm h1")).trim();

  // ---------- Setup: Hurtigmim first, defaults by group size, Jul listed but not chosen ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 3, "Spillerlista viser ikke tre spillere");
  t.sjekk(!t.norsk || /Hvordan spiller dere\?/.test(await t.tekst("#skjerm")), "Oppsettet mangler overskriften over spillemåtene");
  let s = await t.tilstand();
  t.sjekk(s.oppsett.form === "hurtig" && (await t.js(`document.querySelector('[data-h="form"]').dataset.v + document.querySelector('[data-h="form"]').getAttribute("aria-pressed")`)) === "hurtigtrue", "Hurtigmim skal være den første flisa og forhåndsvalgt");
  t.sjekk(await t.finnes('[data-h="modus"][data-v="alle"][aria-pressed="true"]'), "Tre spillere skal få «Alle mot alle» som forvalg");
  t.sjekk(await t.finnes('[data-h="runder"][data-v="2"][aria-pressed="true"]'), "Tre spillere skal få to runder som forvalg");
  for (let i = 0; i < 3; i++) await t.klikk('[data-h="spiller-legg-til"]');
  t.sjekk(await t.finnes('[data-h="runder"][data-v="1"][aria-pressed="true"]'), "Seks spillere skal få én runde som forvalg");
  t.sjekk((t.norsk ? /^6 turer · ca\. \d+ min$/ : /^6\D.*\d+ min/).test((await t.tekst(".mi-estimat")).trim()), `Start-knappen skal ha «6 turer · ca. N min» under seg, fikk «${await t.tekst(".mi-estimat")}»`);
  for (const i of [5, 4, 3]) await t.klikk(`[data-h="spiller-fjern"][data-v="${i}"]`);
  t.sjekk(await t.finnes('[data-h="runder"][data-v="2"][aria-pressed="true"]'), "Tilbake på tre spillere skal forvalget være to runder igjen");
  const naa = new Date();
  const sesong = naa.getMonth() >= 10 || (naa.getMonth() === 0 && naa.getDate() <= 6);
  const rekke = await t.js(`Array.from(document.querySelectorAll('[data-h="kat"]')).map((b) => b.dataset.v)`);
  t.sjekk(rekke[0] === "*" && rekke.indexOf("jul") === (sesong ? 1 : rekke.length - 1), `Jul skal stå først i jula og sist ellers (${rekke.join(" ")})`);
  t.sjekk(await t.finnes('[data-h="kat"][data-v="jul"][aria-pressed="false"]'), "Jul skal ikke være forhåndsvalgt");
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="kat"][data-v="barn"]');
  s = await t.tilstand();
  t.sjekk(Array.isArray(s.oppsett.kat) && !s.oppsett.kat.includes("barn") && !s.oppsett.kat.includes("jul"), "Barn-kategorien ble ikke valgt bort");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller A/.test(await h1()), "Testspiller A skal mime først");
  t.sjekk(await t.js(overDokk(".ikke-se")), "Overleveringen (hvem, hva, «bare mimeren ser skjermen») skjules bak knappene nederst");
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="avslutt"]'), "Overleveringen mangler «Avslutt»");
  await t.bilde("gi");

  // ---------- Hurtigmim, turn 1 (A): the phone is a card in the hand ----------
  await startTur(t);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hurtig" && s.spill.runde.ord.length === 1 && s.spill.runde.ord[0].k !== "barn", "Turen startet ikke med én oppgave fra de valgte kategoriene");
  const m = await t.js(`(() => {
    const b = (q) => document.querySelector(q).getBoundingClientRect();
    const r = b(".mi-riktig"), p = b(".mi-pass"), k = b(".mi-hkort"), l = b('#skjerm [data-h="pause"]');
    return { rA: r.width * r.height, pA: p.width * p.height, rT: r.top, kB: k.bottom, kT: k.top, kL: k.left, kR: k.right, rL: r.left, lB: l.bottom, pH: p.height, skjerm: innerWidth * innerHeight, h: innerHeight, rull: document.documentElement.scrollHeight - innerHeight };
  })()`);
  t.sjekk(m.rull <= 0 && m.lB <= m.h + 1, `Hurtigmim-skjermen skal fylle mobilen uten å rulle (${m.rull} px for høy)`);
  t.sjekk(m.rA >= 0.16 * m.skjerm && m.rA >= 2 * m.pA, `«Riktig» skal være en stor sone og «Pass» en smal stripe (${Math.round((100 * m.rA) / m.skjerm)} % av skjermen, pass ${Math.round(m.pH)} px høy)`);
  t.sjekk(m.kB <= m.rT + 1 || m.kR <= m.rL + 1, "Oppgaven skal stå over (eller til venstre for) «Riktig»-sonen");
  const forste = s.spill.runde.ord[0].t;
  t.sjekk((await t.tekst(".mi-hord")).trim() === forste, "Oppgaven vises ikke i stor skrift");
  await t.bilde("hurtig");
  await riktig(t);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hurtig" && s.spill.runde.ord.length === 2 && s.spill.runde.ord[0].s === 1, "«Riktig» skal gi neste oppgave med en gang, uten skjermbytte");
  t.sjekk((await t.tekst(".mi-hord")).trim() === s.spill.runde.ord[1].t && (await t.tekst(".mi-teller b")).trim() === "1", "Neste oppgave og telleren ble ikke oppdatert etter «Riktig»");
  // A nervous double tap must not burn the next task
  await t.klikk('[data-h="h-riktig"]', 30);
  await t.klikk('[data-h="h-riktig"]', 420);
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord.length === 3, `Et dobbelttrykk skal bare telle én oppgave (telte ${s.spill.runde.ord.length - 2})`);
  await pass(t);
  await riktig(t);
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord.map((w) => String(w.s)).join(",") === "1,1,0,1,null", `Riktig, riktig, pass, riktig ble lagret som ${s.spill.runde.ord.map((w) => w.s).join(",")}`);
  t.sjekk(s.spill.poeng.join(",") === "0,0,0", "Poengene skal ikke telles før turen er sjekket");

  // Reload in the middle of the turn: it comes back paused, with the task hidden
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hurtig" && (await t.finnes('[data-h="fortsett-mim"]')) && !(await t.finnes(".mi-hord")), "Etter omlasting skal turen stå på pause med oppgaven skjult");
  t.sjekk(!EMOJI.test(await t.tekst('[data-h="fortsett-mim"]')), "«Fortsett» skal være ren tekst");
  await t.bilde("hurtig-pause");
  // Home and back: «Fortsett» leads to the paused turn
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('[data-h=\"fortsett-mim\"]')");
  await t.klikk('[data-h="fortsett-mim"]');
  await t.vent("document.querySelector('.mi-riktig')");
  // «Avslutt» in the middle of a turn: the clock waits, the sheet says «Spill videre», and the turn goes on
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  t.sjekk(!t.norsk || (await t.tekst('#ark [data-v="nei"]')).trim() === "Spill videre" && (await t.tekst('#ark [data-v="ja"]')).trim() === "Avslutt", "Arket for «Avslutt» skal ha knappene «Avslutt» og «Spill videre»");
  t.sjekk((await t.tilstand()).spill.pause === true, "Klokka skal vente mens «Avslutte spillet?» vises");
  await t.klikk('#ark [data-v="nei"]');
  await t.vent("document.querySelector('.mi-riktig')");
  s = await t.tilstand();
  t.sjekk(s.spill.pause === false && s.spill.runde.ord.length === 5, "«Spill videre» skal fortsette turen der den var");

  // Time is up: the check list
  await tidUte(t, ".mi-ordliste");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "sjekk" && s.spill.runde.ute === true, "Når tiden er ute, skal sjekklista komme");
  t.sjekk((await t.antall(".mi-ord")) === 5, `Sjekklista skal vise alle fem oppgavene, også den klokka stoppet (viser ${await t.antall(".mi-ord")})`);
  t.sjekk((t.norsk ? /^\+3\s*poeng$/ : /^\+3/).test(await h1()), `Tre riktige skal gi «+3 poeng», fikk «${await h1()}»`);
  t.sjekk(!t.norsk || /rakk ikke/.test(await t.tekst(".mi-ordliste li:last-child")), "Oppgaven klokka stoppet på, skal stå som «rakk ikke»");
  t.sjekk((await t.tekst(".poengliste li:first-child .pluss")).trim() === "+3", "Stillingen skal vise turens poeng som «+3»");
  await t.bilde("sjekk", true);
  // A wrong tap is corrected by tapping the task — and back again
  await t.klikk('.mi-ord[data-v="2"]');
  t.sjekk(/^\+4/.test(await h1()) && (await t.tilstand()).spill.runde.ord[2].s === 1, "Et trykk på en oppgave i sjekklista skal rette den");
  await t.klikk('.mi-ord[data-v="2"]');
  t.sjekk(/^\+3/.test(await h1()), "Et nytt trykk skal rette tilbake");
  t.sjekk((await t.tekst('[data-h="neste"]')).trim().endsWith("Testspiller B"), `Hovedknappen skal sende mobilen videre: «${await t.tekst('[data-h="neste"]')}»`);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "3,0,0" && s.spill.tur === 1 && s.spill.runde === null, `Turens poeng ble ikke talt riktig: ${s.spill.poeng.join(",")}`);
  t.sjekk(/Testspiller B/.test(await h1()), "Testspiller B skal mime nå");
  t.sjekk(((await t.js(REKORD)) || { hurtig: {} }).hurtig["60"] === 3, "Rekorden for 60 s ble ikke lagret");

  // Turn 2 (B): one task. Turn 3 (C): none — the last turn leads to Kåringen.
  await startTur(t);
  await riktig(t);
  await tidUte(t, ".mi-ordliste");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  await startTur(t);
  await tidUte(t, ".mi-ordliste");
  t.sjekk((t.norsk ? /^0\s*poeng$/ : /^0/).test(await h1()), "En tur uten riktige skal vise «0 poeng»");
  t.sjekk((!t.norsk || (await t.tekst('[data-h="neste"]')).trim() === "Til kåringen") && !(await t.finnes('#skjerm [data-h="avslutt"]')), "Siste tur skal gå videre til kåringen (ren tekst, uten «Avslutt»)");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner')");
  await t.bilde("slutt", true);
  t.sjekk(!t.norsk || /kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  t.sjekk((t.norsk ? /^Testspiller A vinner!$/ : /^Testspiller A\b/).test(await h1()), `Vinneren vises ikke riktig: «${await h1()}»`);
  t.sjekk(await t.finnes(".pall") && (await t.finnes(".poengliste")), "Kåringen mangler pall eller poengliste");
  t.sjekk((await t.finnes('#skjerm [data-h="del"]')) && !(await t.finnes('#skjerm .dokk [data-h="del"]')), "«Del kåringen» skal stå under poenglista, ikke i knapperaden nederst");
  t.sjekk(await t.finnes(".flere-spill") && (await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)), "Kåringen mangler andre spill eller «Alle spill»");
  t.sjekk(!t.norsk || (await t.tekst('.dokk [data-h="igjen"]')).trim() === "Spill igjen", "Hovedknappen på kåringen skal hete «Spill igjen»");
  s = await t.tilstand();
  t.sjekk(s._aktiv === false && s.spill.ferdig === true, "Et ferdig spill skal ikke være merket som pågående");
  let kv = await t.js(KVELD);
  t.sjekk(kv && kv.spill.length === 1 && kv.spill[0].id === "mimen" && kv.spill[0].resultat.length === 3 && kv.spill[0].resultat[0].plass === 1 && kv.spill[0].resultat[2].plass === 3, "Kåringen ble ikke meldt til «Kveldens gjeng»");
  // The share sheet gets a sentence and the address separately
  await t.js(`window.__delt = null; navigator.share = async (d) => { window.__delt = d; };`);
  await t.klikk('#skjerm [data-h="del"]');
  const delt = await t.js("window.__delt");
  t.sjekk(delt && (!t.norsk || (delt.title === "Mimen" && /vant mimeleken med 3 poeng!/.test(delt.text) && /Beste tur: .* 3 oppgaver på 60 s/.test(delt.text))) && !/https?:|rusj\.no/.test(delt.text) && delt.url.endsWith(new URL(t.side).pathname), `Delingen fikk ikke riktig tekst og adresse: ${JSON.stringify(delt)}`);
  // Kåringen is final: a reload shows it again (nothing is registered twice) …
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk((await t.tilstand()).skjerm === "slutt" && (await t.js(KVELD)).spill.length === 1, "Omlasting på kåringen skal vise kåringen igjen uten å melde spillet én gang til");

  // ---------- «Spill igjen»: the next player starts, and four beats the record of three ----------
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller B/.test(await h1()), `Neste spill skal starte med nestemann, ikke samme spiller hver gang: «${await h1()}»`);
  await startTur(t);
  for (let i = 0; i < 4; i++) await riktig(t);
  await tidUte(t, ".mi-ordliste");
  t.sjekk(!t.norsk || /Ny rekord!/.test(await t.tekst(".mi-dom")), `Fire riktige skal gi «Ny rekord!» når den gamle var tre: «${await t.tekst(".mi-dom")}»`);
  await t.bilde("sjekk-rekord");
  // «Avslutt» from the check list: the turn counts, and the game ends at Kåringen
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,4,0" && (t.norsk ? /^Testspiller B vinner!$/ : /^Testspiller B\b/).test(await h1()), `«Avslutt» fra sjekklista skal telle turen: ${s.spill.poeng.join(",")} «${await h1()}»`);
  t.sjekk((await t.js(REKORD)).hurtig["60"] === 4 && (await t.js(KVELD)).spill.length === 2, "Rekorden eller kveldens tavle ble ikke oppdatert etter spill nummer to");
  const stat = await t.js("Rusj._statKo.map((e) => e.h + ':' + (e.d.form || '')).join(',')");
  t.sjekk(/start:hurtig/.test(stat) && /ferdig:hurtig/.test(stat), `Statistikken fikk ikke «start» og «ferdig» for spillet: ${stat}`);
  // … and from Kåringen «back» leads home, where nothing is left to continue
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Etter kåringen skal hjem-skjermen ikke tilby «Fortsett»");
  t.sjekk((t.norsk ? /4\s*rekord på 60 s/ : /4\s*\D*60/).test(await t.tekst(".merker")), `Rekorden vises ikke på hjem-skjermen: «${await t.tekst(".merker")}»`);
  await t.bilde("hjem-rekord");

  // ---------- Én om gangen: three screens (the third game starts with Testspiller C) ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="form"][data-v="en"]');
  t.sjekk((await t.tilstand()).oppsett.form === "en" && (await t.finnes('[data-h="tid"][data-v="45"]')), "«Én om gangen» ble ikke valgt (tidene skal være 45, 60 og 90 s)");
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.bilde("oppsett-en", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#skjerm > .mappe')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gi" && /Testspiller C/.test(await h1()), `Det tredje spillet skal starte med Testspiller C, på skjermen med det hemmelige kortet: «${await h1()}»`);
  // Screen 1: the secret card sits on the hand-over screen
  t.sjekk(!t.norsk || /hold fingeren på kortet for å se/i.test(await t.tekst("#skjerm .hjelp")), "Overleveringen skal si «… hold fingeren på kortet for å se»");
  t.sjekk((await t.js(overDokk(".mappe"))) && (await t.js(overDokk(".mappe-finger"))), "Det hemmelige kortet skjules bak knappene nederst");
  t.sjekk(await t.finnes('[data-h="start-mim"]:disabled'), "Start skal være låst til oppgaven er sett");
  await t.bilde("gi-kort");
  const slipp = await t.hold(".mappe", 650);
  await slipp();
  await t.vent("!document.querySelector('[data-h=\"start-mim\"]').disabled");
  // On «middels» the card offers two tasks: the lighter one for 1 point, the harder one for 2
  s = await t.tilstand();
  t.sjekk(Array.isArray(s.spill.valg) && s.spill.valg.length === 2 && s.spill.valg[0].n === 1 && s.spill.valg[1].n === 2, `På middels skal kortet tilby en lett og en middels oppgave: ${JSON.stringify(s.spill.valg)}`);
  t.sjekk((await t.antall('[data-h="start-mim"]')) === 2 && (!t.norsk || ((await t.tekst('[data-h="start-mim"][data-v="0"]')).trim() === "1 poeng" && (await t.tekst('[data-h="start-mim"][data-v="1"]')).trim() === "2 poeng")), "Etter kortet skal mimeren velge mellom «1 poeng» og «2 poeng»");
  t.sjekk(await t.js(overDokk(".mappe")), "Kortet skjules bak de to valgknappene");
  await t.bilde("gi-valg");
  const forsteValg = s.spill.valg.map((o) => o.t).join("|");
  await t.klikk('[data-h="bytt"]');
  s = await t.tilstand();
  t.sjekk(s.spill.valg.every((o) => !forsteValg.split("|").includes(o.t)) && s.spill.bytt === 1 && (await t.finnes('[data-h="start-mim"]:disabled')), "«Bytt» ga ikke to nye oppgaver som må ses før start");
  t.sjekk(s.spill.valg.every((o) => o.k !== "barn"), "En oppgave fra en bortvalgt kategori dukket opp");
  const slipp2 = await t.hold(".mappe", 650);
  t.sjekk((await t.antall(".mappe .mi-valgpanel")) === 2 && (!t.norsk || /1 poeng/i.test(await t.tekst(".mappe .mi-valgpanel"))) && (await t.js(`(() => { const k = document.querySelector(".mappe").getBoundingClientRect(); return Array.from(document.querySelectorAll(".mappe .mi-valgpanel .kort-ord")).every((o) => { const b = o.getBoundingClientRect(); return b.top >= k.top && b.bottom <= k.bottom && b.left >= k.left && b.right <= k.right && o.scrollWidth <= o.clientWidth + 1; }); })()`)), "De to oppgavene får ikke plass på kortet");
  await t.bilde("oppgave");
  await slipp2();
  await t.vent("!document.querySelector('[data-h=\"start-mim\"]').disabled");
  // Going back during the countdown must not start the clock by itself
  await t.klikk('[data-h="start-mim"][data-v="1"]', 300);
  await t.klikk("#tilbake", 100);
  await t.sov(3600);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && !(await t.finnes("#mi-tid")) && s.spill.valg.length === 2, "Klokka startet av seg selv etter «tilbake» under nedtellingen");
  await t.klikk('[data-h="fortsett"]');
  // Screen 2: miming — the mimer dares the harder task
  await mim(t, null, 1);
  s = await t.tilstand();
  t.sjekk(s.spill.verdi === 2 && s.spill.valg === null && s.spill.oppgave.n === 2, `Valget «2 poeng» ble ikke oppgaven som mimes: ${JSON.stringify(s.spill.oppgave)}`);
  await t.sov(900);
  await t.bilde("mim");
  t.sjekk(/Testspiller C/.test(await t.tekst(".mi-mimer")), "Mimeskjermen viser ikke hvem som mimer");
  t.sjekk(await t.js(overDokk(".mi-titt")), "Klokka og titte-kortet skjules bak knappene nederst");
  t.sjekk(await t.finnes('#skjerm .dokk [data-h="avslutt"]'), "Mimeskjermen mangler «Avslutt»");
  // Screen 3: «Riktig!» leads straight to the answer, where the guesser is picked
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('.mi-fasit')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "svar" && (await t.antall('[data-h="gjetter"]')) === 2 && !(await t.finnes('[data-h="gjetter"][data-v="2"]')), "Svarskjermen skal la dere velge gjetter blant de to andre (ikke mimeren)");
  t.sjekk(await t.finnes('[data-h="neste"]:disabled'), "«Neste» skal vente til gjetteren er valgt");
  await t.bilde("svar-hvem");
  await t.klikk('[data-h="gjetter"][data-v="1"]');
  s = await t.tilstand();
  t.sjekk(s.spill.gjetter === 1 && (await t.antall(".poengliste .pluss")) === 2 && (await t.tekst(".poengliste .pluss")).trim() === "+2" && !(await t.finnes('[data-h="neste"]:disabled')), "Valgt gjetter skal gi «+2» til gjetter og mimer i stillingen (oppgaven til 2 poeng)");
  // The wrong person: tap the right one and the point moves. «Angre» sends the mimer back to the clock.
  await t.klikk('[data-h="gjetter"][data-v="0"]');
  t.sjekk((await t.tilstand()).spill.gjetter === 0 && (t.norsk ? /Testspiller A gjettet det .* To poeng til gjetteren og to til mimeren!/ : /Testspiller A/).test(await t.tekst(".mi-svartekst")), "Et trykk på en annen spiller skal flytte poengene");
  await t.klikk('[data-h="angre-svar"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "mim" && s.spill.resultat === null && s.spill.gjetter === null && s.spill.poeng.join(",") === "0,0,0", "«Angre» skal ta dere tilbake til mimingen uten poeng");
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('[data-h=\"gjetter\"]')");
  await t.klikk('[data-h="gjetter"][data-v="0"]');
  await t.bilde("svar", true);
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('#skjerm > .mappe')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "2,0,2", `Gjetter og mimer skulle få to poeng hver, fikk ${s.spill.poeng.join(",")}`);
  t.sjekk(/Testspiller A/.test(await h1()), "Testspiller A skal mime nå");
  t.sjekk(((await t.js(REKORD)).raskest || {}).sek >= 1, "Raskeste gjetning ble ikke lagret som rekord");

  // Turn 2 (A): a reload on the hand-over keeps the card closed; then A passes (confirmed in a sheet)
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "gi" && (await t.finnes('[data-h="start-mim"]:disabled')) && !(await t.finnes(".mappe.apen")), "Omlasting på overleveringen skal vise kortet lukket, med start låst");
  await mim(t);
  await t.klikk('[data-h="pass"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"ja\"]')");
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.mi-fasit')");
  await t.bilde("svar-pass");
  t.sjekk(!(await t.finnes('[data-h="gjetter"]')) && !(await t.finnes('[data-h="neste"]:disabled')), "Etter pass skal ingen velges som gjetter");
  await t.klikk('[data-h="neste"]');
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "2,0,2", "Pass skal ikke gi poeng");

  // Turn 3 (B): a reload in the middle of miming comes back paused; peek; the clock runs out
  await mim(t);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "mim" && (await t.finnes('[data-h="fortsett-mim"]')), "Mimingen står ikke på pause etter omlasting");
  await t.bilde("mim-pause");
  await t.klikk('[data-h="fortsett-mim"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  const slipp3 = await t.hold(".mi-titt .mappe", 600);
  await t.bilde("titt");
  await slipp3();
  await t.js("Rusj.timer('mi-tid').leggTil(-500)");
  await t.vent("document.querySelector('.mi-fasit')");
  t.sjekk(!t.norsk || /Tiden er ute/i.test(await h1()), "Mangler «Tiden er ute»");
  t.sjekk(!t.norsk || (await t.tekst('[data-h="neste"]')).trim() === "Til kåringen", "Siste tur skal gå videre til kåringen");
  // Leave and come back («Nytt spill» asks first), then the result: A and C share the win
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('#ark:not([hidden]) [data-v=\"nei\"]')");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk((await t.tilstand()).spill.logg.length === 2, "Spillet forsvant selv om «Avbryt» ble valgt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.mi-fasit')");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner')");
  await t.bilde("slutt-en", true);
  t.sjekk((t.norsk ? /^Testspiller A og Testspiller C vinner!$/ : /Testspiller A.*Testspiller C/).test(await h1()), `Delt seier vises ikke riktig: «${await h1()}»`);
  t.sjekk((await t.antall(".pall .pall-plass.p1")) === 2, "Pallen skal vise to på delt førsteplass");

  // ---------- Teams: Hurtigmim ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="form"][data-v="hurtig"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  t.sjekk(!(await t.finnes("#spillerboks")), "Lag mot lag skal ikke vise spillerlista");
  t.sjekk(await t.finnes('[data-h="runder"][data-v="3"][aria-pressed="true"]'), "Lag i Hurtigmim skal få tre runder som forvalg");
  await t.bilde("oppsett-lag", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(!t.norsk || /Lag Rosa/.test(await h1()), "Lag Rosa skal mime først");
  await t.bilde("gi-lag");
  await startTur(t);
  await riktig(t);
  await riktig(t);
  await t.bilde("hurtig-lag");
  await tidUte(t, ".mi-ordliste");
  t.sjekk((t.norsk ? /^\+2\s*poeng$/ : /^\+2/).test(await h1()) && (!t.norsk || /Lag Rosa fikk/i.test(await t.tekst(".mi-resultat"))), "Lagets tur skal gi «Lag Rosa fikk +2 poeng»");
  t.sjekk((await t.antall(".poengliste .mi-lagfigur")) === 2, "Poenglista viser ikke lagfigurene");
  await t.bilde("sjekk-lag");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.gi-til')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "2,0" && (!t.norsk || /Lag Gul/.test(await h1())), `Lag Rosa skulle få to poeng og Lag Gul stå for tur: ${s.spill.poeng.join(",")}`);
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  t.sjekk(await t.finnes(".poengliste") && !(await t.finnes(".pall")), "Med bare ett lag på poeng skal det være poengliste, men ingen pall");
  t.sjekk(!t.norsk || /Lag Rosa vinner!/.test(await h1()), "Lag Rosa vises ikke som vinner");
  kv = await t.js(KVELD);
  t.sjekk(kv.spill.length === 4 && (!t.norsk || kv.spill[3].resultat.map((r) => r.navn).join(",") === "Lag Rosa,Lag Gul"), "Lagspillet ble ikke meldt til «Kveldens gjeng» med lagnavn");
  await t.bilde("slutt-lag", true);

  // ---------- Teams: Én om gangen (the next team starts this time) ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="form"][data-v="en"]');
  t.sjekk(await t.finnes('[data-h="runder"][data-v="5"][aria-pressed="true"]'), "Lag i «Én om gangen» skal få fem runder som forvalg");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#skjerm > .mappe')");
  t.sjekk(!t.norsk || /Lag Gul\s+mimer/.test(await h1()), `Neste lagspill skal starte med Lag Gul: «${await h1()}»`);
  await t.bilde("gi-kort-lag");
  await mim(t);
  // A «Riktig!» by mistake can be undone from the answer screen
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('.mi-fasit')");
  t.sjekk(!(await t.finnes('[data-h="gjetter"]')) && !(await t.finnes('[data-h="neste"]:disabled')), "Lag mot lag skal ikke spørre hvem som gjettet");
  await t.klikk('[data-h="angre-svar"]');
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,0" && s.spill.logg.length === 0 && s.spill.resultat === null, "«Angre» tok ikke tilbake poenget");
  await t.klikk('[data-h="riktig"]');
  await t.vent("document.querySelector('.mi-fasit')");
  t.sjekk((await t.antall(".poengliste .mi-lagfigur")) === 2 && (await t.tekst(".poengliste li:first-child .pluss")).trim() === "+1", "Svarskjermen skal vise lagets poeng som «+1»");
  await t.bilde("svar-lag");
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.join(",") === "0,1" && (!t.norsk || /Lag Gul vinner!/.test(await h1())), `Lag Gul skulle vinne med ett poeng: ${s.spill.poeng.join(",")}`);

  // ---------- Nine names from another game: «Lag mot lag» is preselected, until the group chooses ----------
  await t.start({ navn: Array.from({ length: 9 }, (_, i) => `Testspiller ${String.fromCharCode(65 + i)}`) });
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.finnes('[data-h="modus"][data-v="lag"][aria-pressed="true"]')) && !(await t.finnes("#spillerboks")), "Ni spillere skal få «Lag mot lag» som forvalg");
  t.sjekk(!t.norsk || /Dere er mange/.test(await t.tekst("#skjerm")), "Forvalget «Lag mot lag» skal forklares");
  await t.bilde("oppsett-ni", true);
  await t.klikk('[data-h="modus"][data-v="alle"]');
  t.sjekk((await t.antall(".spiller")) === 9 && (await t.finnes('[data-h="runder"][data-v="1"][aria-pressed="true"]')), "«Alle mot alle» med ni spillere skal vise alle ni og én runde");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('[data-h="modus"][data-v="alle"][aria-pressed="true"]'), "Når gjengen har valgt «Alle mot alle», skal valget stå");

  // ---------- rusj.no/mimen/#jul: «Gjør klart» with only the Jul tasks ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.lastSide("about:blank");
  await t.lastSide(t.side + "#jul", "document.querySelector('[data-h=\"start\"]')");
  s = await t.tilstand();
  t.sjekk(s.skjerm === "oppsett" && JSON.stringify(s.oppsett.kat) === '["jul"]' && (await t.antall('[data-h="kat"][aria-pressed="true"]')) === 1, "Lenken #jul skal åpne «Gjør klart» med bare Jul valgt");
  t.sjekk((await t.js("location.hash")) === "", "Lenken #jul skal ikke bli stående i adressen");
  await t.bilde("oppsett-jul", true);
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  await startTur(t);
  s = await t.tilstand();
  t.sjekk(s.spill.runde.ord[0].k === "jul" && (!t.norsk || /jul/i.test(await t.tekst(".mi-hetikett"))), "Med bare Jul valgt skal oppgavene komme fra Jul");
  await t.bilde("hurtig-jul");
  // In the middle of a game the link is ignored (the game is not thrown away)
  await t.lastSide("about:blank");
  await t.lastSide(t.side + "#jul", "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  t.sjekk(s.spill && s.spill.runde && s.skjerm === "hurtig", "Lenken #jul skal ikke forstyrre et spill som pågår");

  // ---------- Three turns without a single task guessed: Kåringen without a winner ----------
  await t.klikk('[data-h="fortsett-mim"]');
  await t.vent("document.querySelector('.mi-riktig')");
  await tidUte(t, ".mi-ordliste");
  t.sjekk((await t.antall(".mi-ord")) === 1 && (!t.norsk || /rakk ikke/.test(await t.tekst(".mi-ordliste"))), "En tur uten trykk skal vise den ene oppgaven som «rakk ikke»");
  for (let i = 0; i < 2; i++) {
    await t.klikk('[data-h="neste"]');
    await t.vent("document.querySelector('.gi-til')");
    await startTur(t);
    await tidUte(t, ".mi-ordliste");
  }
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner')");
  t.sjekk(!t.norsk || /^Ingen fikk poeng$/.test(await h1()) && /Godt jobba likevel!/.test(await t.tekst(".banner")), `Uten poeng skal kåringen si «Ingen fikk poeng» med varme ord: «${await h1()}»`);
  t.sjekk(!(await t.finnes(".pall")) && !(await t.finnes('#skjerm [data-h="del"]')) && (await t.finnes('.dokk [data-h="igjen"]')), "Uten poeng: ingen pall og ingenting å dele, men «Spill igjen»");
  kv = await t.js(KVELD);
  t.sjekk(kv.spill.length === 1 && kv.spill[0].resultat.length === 3 && kv.spill[0].resultat.every((r) => r.plass === 0), "Et spill uten poeng skal telle for kvelden uten å plassere noen");
  await t.bilde("slutt-ingen", true);

  // ---------- Settings and a game saved by the version before Hurtigmim ----------
  await t.js(`localStorage.setItem("${t.nokkel("mimen.v1")}", JSON.stringify({ skjerm: "se", _tid: Date.now(), antall: 3,
    oppsett: { modus: "lag", lag: 3, runder: { alle: 3, lag: 5 }, tid: 90, niva: 1, kat: ["dyr"], lyder: true },
    spill: { modus: "lag", lag: 3, antall: 0, runder: 5, tid: 90, niva: 1, kat: ["dyr"], lyder: true, poeng: [1, 0, 0], tur: 1, turer: 15, logg: [], oppgave: { t: "Ape", k: "dyr", n: 1 }, skjerm: "se", ferdig: false } }))`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  s = await t.tilstand();
  const o = s.oppsett;
  t.sjekk(s.skjerm === "hjem" && s.spill === null, "Et spill lagret av den gamle versjonen skal legges bort, og siden skal åpne på hjem-skjermen");
  t.sjekk(o.form === "hurtig" && o.modus === "lag" && o.modusValgt === true && o.lag === 3 && o.tid.en === 90 && o.tid.hurtig === 60 && o.runder.en.alle === 3 && o.runder.en.lag === null && o.niva === 1 && o.lyder === true && JSON.stringify(o.kat) === '["dyr"]', `Gamle innstillinger ble ikke tatt med: ${JSON.stringify(o)}`);
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('[data-h="modus"][data-v="lag"][aria-pressed="true"]'), "Oppsettet kunne ikke tegnes med gamle innstillinger");
  // «Lett» has one level: one task on the card and a plain «Start»
  await t.klikk('[data-h="form"][data-v="en"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#skjerm > .mappe')");
  const slippLett = await t.hold(".mappe", 650);
  await slippLett();
  await t.vent("!document.querySelector('[data-h=\"start-mim\"]').disabled");
  s = await t.tilstand();
  t.sjekk(s.spill.valg === null && s.spill.oppgave.k === "dyr" && s.spill.oppgave.n === 1 && (await t.antall('[data-h="start-mim"]')) === 1 && (await t.tekst('[data-h="start-mim"]')).trim() === "Start", "På lett skal kortet ha én oppgave og hovedknappen hete «Start»");
}
