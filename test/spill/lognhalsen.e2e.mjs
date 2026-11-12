// Løgnhalsen: "Si det høyt" with five players — setup (rounds follow the group, themes chosen
// explicitly), the coach line, countdown, the teller taps the lie (and undoes), reload
// mid-reveal, «who guessed right?» with the chips and the switch, points, the story line, back +
// continue, fooling everyone, ending early → «Kåringen». Then "Skriv inn" with three players to
// its natural end, small and short screens, «Lag en utfordring» (make, open, both outcomes,
// hostile and damaged links), twenty players with and without «Stor gjeng», damaged saves and the
// «Jul» season with a faked date.
// Regression checks: «Avslutt» ends the game for good (no «Fortsett» afterwards, not «in
// progress»), the evening's scoreboard and the statistics are written exactly once per game, the
// stamp is not slammed again by every tap, the revealed numbers are not dressed as controls,
// leaving during the countdown does nothing afterwards, and a party game in progress survives a
// challenge link.
const NAVN = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E"];
const VELG = "document.querySelector('[data-h=\"velg-logn\"]')";
const RIKTIG = "document.querySelector('[data-h=\"riktig\"]')";
const HJEM = "document.querySelector('#skjerm h1')";
// Characters a hostile link may carry. They are made from their numbers: none of them is written
// in this file.
const SNU = String.fromCodePoint(0x202e); // right-to-left override
const SNU_SLUTT = String.fromCodePoint(0x202c);
const NULLBREDDE = String.fromCodePoint(0x200b); // zero-width space
const BJELLE = String.fromCodePoint(7); // a control character
const USYNLIGE = new RegExp("[\\u0000-\\u0008\\u200b-\\u200f\\u202a-\\u202e]");

// An independent copy of the challenge link format, version 1 (see «A challenge in a link» in
// spill.js). Links that people have sent must keep working: if the game's format changes, these
// checks — and the fixed link below — fail.
function uSjekk(bytes) {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  h ^= 0x4c48;
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
function uMaske(bytes, fro) {
  let a = fro >>> 0;
  return bytes.map((b) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return b ^ (((t ^ (t >>> 14)) >>> 0) & 255);
  });
}
function lagLenke({ navn, kort, logn }, versjon = 1) {
  const kropp = [logn, ...new TextEncoder().encode([navn, ...kort].join("\n"))];
  const sjekk = uSjekk([versjon, ...kropp]);
  return "u=" + Buffer.from([versjon, sjekk >>> 24, (sjekk >>> 16) & 255, (sjekk >>> 8) & 255, sjekk & 255, ...uMaske(kropp, sjekk)]).toString("base64url");
}
// «Kari»: "Jeg har sovet i en iglo" · "Jeg kan jodle" (the lie) · "Jeg har møtt en elg på do"
const FAST_LENKE = "u=AeAinVyfLoQJe3fwPZqgy5W4TZo-Cvd0lYNO9Ix_XW1UifOFU06F-9QK9Usv0cKNKHIc6cRRCkR28HItOWxXa-hQPY6v4X3XFv5lCg";

export default async function (t) {
  const stille = () => t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  const stat = (h) => t.js(`Rusj._statKo.filter((x) => x.h === ${JSON.stringify(h)}).map((x) => x.d)`);
  const kveld = () => t.js(`((JSON.parse(localStorage.getItem("rusj.kveld") || "null") || {}).spill || []).filter((s) => s.id === "lognhalsen")`);
  const ren = (tekst) => String(tekst).replace(/\s+/g, " ").trim();
  const fri = async (sel, hva) => t.sjekk(await t.friForDokk(sel), `${hva} skjules bak knappene`);
  // The phone's share sheet: remember what the game hands it.
  const fangDeling = () => t.js(`(() => { window.__delt = null; Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.__delt = d; } }); })()`);
  const kjerne = (sp) => JSON.stringify(sp && [sp.antall, sp.modus, sp.runder, sp.k, sp.start, sp.fase, sp.tema, sp.poeng, sp.lurt, sp.treff, sp.fortalt, sp.ferdig]);
  const [b0, h0] = await t.js("[window.innerWidth, window.innerHeight]");
  const skjerm = (bredde, hoyde) => t.send("Emulation.setDeviceMetricsOverride", { width: bredde, height: hoyde, deviceScaleFactor: 2, mobile: true });
  const tipsVises = () => t.vent(`Number(getComputedStyle(document.querySelector(".lh-tips")).opacity) > 0.95`, 6000);
  let s;

  // ---------- Setup ----------
  await t.start({ navn: NAVN });
  await stille();
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 5, "Oppsettet viser ikke de fem lagrede spillerne");
  // The rounds follow the group until the stepper is used: two up to five players, one from six.
  const lengde = async () => `${ren(await t.tekst(".teller output"))} / ${ren(await t.tekst("#lh-lengde"))}`;
  t.sjekk((await lengde()) === "2 runder / 10 turer · ca. 20 min", `Fem spillere skal få to runder: «${await lengde()}»`);
  await t.klikk('[data-h="spiller-legg-til"]');
  t.sjekk((await lengde()) === "1 runde / 6 turer · ca. 10 min", `Seks spillere skal få én runde: «${await lengde()}»`);
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="runder"][data-v="1"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="5"]');
  t.sjekk((await lengde()) === "3 runder / 15 turer · ca. 30 min", `Runder valgt for hånd skal bli stående: «${await lengde()}»`);
  // The kit's stepper is drawn anew by every press. Focus must stay with it — on the other button
  // when the one that was pressed has reached its limit — and the new number is read out through
  // the kit's one live region (the number on the screen is switched off: it would say nothing).
  await t.js(`document.querySelector('[data-h="runder"][data-v="-1"]').focus()`);
  await t.klikk('[data-h="runder"][data-v="-1"]');
  await t.klikk('[data-h="runder"][data-v="-1"]');
  t.sjekk(await t.js(`!!document.activeElement && document.activeElement.dataset.h === "runder" && document.activeElement.dataset.v === "1"`), "Fokus ble ikke med til «Flere runder» da «Færre runder» nådde bunnen");
  t.sjekk(await t.js(`document.querySelector(".teller output").getAttribute("aria-live") === "off"`), "Tallet i telleren er fortsatt en egen live-region (leses to ganger, eller aldri)");
  // TODO: Løgnhalsen updates the stepper in place, so the kit's status voice (#si) does not read it yet.
  s = await t.tilstand();
  t.sjekk(s.oppsett.runder === 1 && s.oppsett.runderValgt === true, "Antall runder endret seg ikke");
  t.sjekk(!(await t.finnes('[data-h="stor"]')), "«Stor gjeng» tilbys med færre enn ni spillere");
  // Themes are chosen explicitly, so the run does not depend on the date («Jul» follows the season).
  await t.klikk('[data-h="vis-temaer"]');
  await t.klikk('#ark [data-h="temavalg"][data-v="*"]');
  s = await t.tilstand();
  t.sjekk(s.oppsett.temaer.length === 16 && s.oppsett.temaer.includes("jul"), "«Alle» valgte ikke alle temaene");
  await t.klikk('#ark [data-h="temavalg"][data-v="mat"]');
  t.sjekk(!(await t.tilstand()).oppsett.temaer.includes("mat"), "Temaet ble ikke valgt bort");
  t.sjekk(/15 av 16/.test(await t.tekst("#skjerm")) && /Alle unntatt Mat/.test(await t.tekst(".lh-temaknapp")), "Oppsettet viser ikke hvilke temaer som er valgt");
  await t.bilde("temaer");
  await t.klikk('#ark [data-h="temavalg"][data-v="mat"]');
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.lh-temakort')");
  s = await t.tilstand();
  t.sjekk(s._aktiv === true && s.spill.runder === 1 && s.spill.temaer.length === 16, "Spillet startet ikke med oppsettet (pagar, runder, temaer)");
  t.sjekk((await stat("start")).some((d) => d.modus === "hoyt" && d.spillere === 5), "Statistikken fikk ikke «start»");
  const teller1 = (s.spill.start + s.spill.k) % 5;
  t.sjekk((await t.tekst("#skjerm h1")).trim() === NAVN[teller1], "Fortelleren vises ikke som overskrift");

  // ---------- The coach line: there from the start, invisible; after about three seconds it is
  // shown, and the card has not moved ----------
  const tips = () => t.js(`(() => { const el = document.querySelector(".lh-tips"); const k = document.querySelector(".lh-temakort .storkort").getBoundingClientRect(); return { tekst: el.textContent, synlig: Number(getComputedStyle(el).opacity), topp: Math.round(k.top), hoyde: Math.round(k.height) }; })()`);
  await t.sov(650); // the card's own entrance is over
  const tips0 = await tips();
  t.sjekk(/^Tips: \S/.test(tips0.tekst) && tips0.synlig < 0.2, `Tipset skal ligge klart, men usynlig, de første sekundene (synlighet ${tips0.synlig})`);
  await tipsVises();
  const tips1 = await tips();
  t.sjekk(tips1.topp === tips0.topp && tips1.hoyde === tips0.hoyde, `Temakortet flytter seg når tipset kommer (${tips0.topp}/${tips0.hoyde} → ${tips1.topp}/${tips1.hoyde})`);
  await t.bilde("tur");
  await fri(".lh-temakort .storkort-tekst", "Temaet");
  const tema1 = s.spill.tema;
  await t.klikk('[data-h="nytt-tema"]');
  t.sjekk((await t.tilstand()).spill.tema !== tema1, "«Nytt tema» ga ikke et nytt tema");
  const tips2 = await tips();
  t.sjekk(tips2.tekst === tips1.tekst && tips2.synlig > 0.95, "Tipset forsvant eller byttet da temaet ble byttet");
  t.sjekk((await t.tekst('#skjerm [data-h="avslutt"]')).trim() === "Avslutt", "Turskjermen mangler lenken «Avslutt»");

  // ---------- 3 · 2 · 1 – the teller taps the lie, regrets, taps again ----------
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.bilde("hvilken-var-logn");
  await t.klikk('[data-h="velg-logn"][data-v="1"]');
  await t.vent("document.querySelector('.lh-tall.logn .lh-stempel')");
  t.sjekk(await t.js(`getComputedStyle(document.querySelector("div.lh-tall")).cursor !== "pointer"`), "De avslørte tallene har pekerhånd, men er ikke knapper");
  await t.klikk('[data-h="angre-logn"]');
  await t.klikk('[data-h="velg-logn"][data-v="2"]');
  await t.vent(RIKTIG);
  t.sjekk((await t.tilstand()).spill.logn === 2, "Løgnen ble ikke registrert");

  // Reload in the middle of the reveal
  await t.lastSide(t.side, RIKTIG);
  t.sjekk((await t.antall('[data-h="riktig"]')) === 4, "Fortelleren skal ikke kunne velges som gjetter");

  // ---------- Who guessed right: names, «Alle» / «Ingen», and the switch for the other way ----------
  const g1 = (teller1 + 2) % 5;
  const g2 = (teller1 + 3) % 5;
  const hvem = () =>
    t.js(`(() => { const a = (sel) => (document.querySelector(sel) || { getAttribute: () => null }).getAttribute("aria-pressed"); const f = document.activeElement; return {
      h1: document.querySelector("#lh-hvem h1").textContent.trim(),
      trykket: Array.from(document.querySelectorAll('[data-h="riktig"][aria-pressed="true"]')).map((b) => Number(b.dataset.v)),
      alle: a('[data-h="hurtig"][data-v="alle"]'), ingen: a('[data-h="hurtig"][data-v="ingen"]'), bryter: a('[data-h="lurte"]'),
      knapp: document.querySelector("#lh-ferdig-tur").textContent.trim(),
      fokus: f && f.dataset && f.dataset.h ? f.dataset.h + ":" + f.dataset.v : "",
      stempel: !!document.querySelector('.lh-stempel[data-merke]') }; })()`);
  await t.js(`document.querySelector(".lh-stempel").dataset.merke = "1"`); // the stamp must be the same element afterwards
  await t.klikk(`[data-h="riktig"][data-v="${g1}"]`);
  let h = await hvem();
  t.sjekk(h.trykket.join() === String(g1) && h.knapp === "Ferdig – 1 hadde rett" && h.ingen === "false" && h.alle === "false", `Ett trykk på et navn: ${JSON.stringify(h)}`);
  t.sjekk(h.fokus === `riktig:${g1}`, `Fokus forsvinner fra navnet som ble trykket (${h.fokus})`);
  await t.klikk('[data-h="hurtig"][data-v="alle"]');
  h = await hvem();
  t.sjekk(h.trykket.length === 4 && h.knapp === "Ferdig – alle hadde rett" && h.alle === "true", `«Alle»: ${JSON.stringify(h)}`);
  await t.klikk('[data-h="hurtig"][data-v="ingen"]');
  h = await hvem();
  t.sjekk(h.trykket.length === 0 && h.knapp === "Ferdig – ingen hadde rett" && h.ingen === "true", `«Ingen»: ${JSON.stringify(h)}`);
  // Nothing tapped yet: the switch starts an empty list the other way («nobody was fooled»)
  await t.klikk('[data-h="lurte"]');
  h = await hvem();
  s = await t.tilstand();
  t.sjekk(h.h1 === "Hvem ble lurt?" && h.trykket.length === 0 && h.bryter === "true" && h.knapp === "Ferdig – ingen ble lurt", `Bryteren «Trykk heller på dem som ble lurt»: ${JSON.stringify(h)}`);
  t.sjekk(s.oppsett.lurte === true && s.spill.riktige.length === 4, "Bryteren ble ikke husket, eller svaret ble ikke snudd");
  const lurte = [0, 1, 2, 3, 4].filter((i) => i !== teller1 && i !== g1 && i !== g2);
  await t.klikk(`[data-h="riktig"][data-v="${lurte[0]}"]`);
  await t.klikk(`[data-h="riktig"][data-v="${lurte[1]}"]`);
  h = await hvem();
  t.sjekk(h.knapp === "Ferdig – 2 ble lurt" && h.trykket.slice().sort().join() === lurte.join(), `To som ble lurt: ${JSON.stringify(h)}`);
  // Switched back with names tapped: the same answer, shown the other way round
  await t.klikk('[data-h="lurte"]');
  h = await hvem();
  t.sjekk(h.h1 === "Hvem pekte på nr. 3?" && h.trykket.slice().sort().join() === [g1, g2].sort().join() && h.knapp === "Ferdig – 2 hadde rett" && h.bryter === "false", `Bryteren tilbake: ${JSON.stringify(h)}`);
  t.sjekk(h.stempel, "«LØGN!» stemples på nytt for hvert trykk (hele skjermen tegnes om)");
  t.sjekk((await t.tilstand()).oppsett.lurte === false, "Bryteren ble ikke husket som av");
  await t.sov(400);
  await t.bilde("hvem-pekte");
  await fri("#lh-hvem h1", "«Hvem pekte på …?»");
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  await t.sov(1300);
  await t.bilde("resultat");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[teller1] === 2 && s.spill.poeng[g1] === 1 && s.spill.poeng[g2] === 1 && s.spill.poeng[lurte[0]] === 0, "Feil poeng: fortelleren skal ha 2 og de to gjetterne 1 hver");

  // The story line: one of the two true claims — and the same one after a reload
  const sann = s.spill.siste.sann;
  const historie = ren(await t.tekst(".lh-historie"));
  t.sjekk([0, 1].includes(sann) && historie.endsWith(`fortell historien bak nr. ${sann + 1}!`), `Historielinja peker ikke på en sann påstand: «${historie}» (løgnen var nr. 3)`);
  await fri(".lh-historie", "Historielinja");
  await t.lastSide(t.side, "document.querySelector('.lh-historie')");
  t.sjekk(ren(await t.tekst(".lh-historie")) === historie, "Historielinja byttet påstand etter omlasting");

  // «Angre» takes the points back and returns to «who guessed right?» with the same choice
  await t.klikk('[data-h="angre"]');
  await t.vent(RIKTIG);
  s = await t.tilstand();
  t.sjekk(s.spill.poeng.every((p) => p === 0) && s.spill.riktige.includes(g1) && s.spill.riktige.includes(g2), "«Angre» tok ikke tilbake poengene");
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[teller1] === 2 && s.spill.poeng[g1] === 1, "Poengene ble feil etter angring");

  // Back to home keeps the game; «Nytt spill» asks first (cancel keeps it); continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes('#ark:not([hidden]) [data-v="nei"]'), "«Nytt spill» spurte ikke før spillet ble kastet");
  await t.klikk('#ark [data-v="nei"]');
  t.sjekk(!!(await t.tilstand()).spill, "Spillet forsvant selv om man trykket Avbryt");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.lh-resultat')");

  // ---------- Next teller fools everyone ----------
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.lh-temakort')");
  s = await t.tilstand();
  const teller2 = (s.spill.start + s.spill.k) % 5;
  t.sjekk(teller2 === (teller1 + 1) % 5, "Turen gikk ikke videre til neste spiller");
  // Leaving during the countdown: nothing may happen afterwards (no jump to the reveal)
  await t.klikk('[data-h="pek"]', 50);
  await t.klikk("#tilbake");
  await t.sov(3600);
  s = await t.tilstand();
  t.sjekk(s.skjerm === "hjem" && s.spill.fase === "tema", "Nedtellingen fortsatte etter at man gikk ut av skjermen");
  t.sjekk(await t.js("document.querySelector('#nedtelling').hidden"), "Nedtellingen ble liggende over hjem-skjermen");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.lh-temakort')");
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.klikk('[data-h="velg-logn"][data-v="0"]');
  await t.vent(RIKTIG);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  await t.sov(1400);
  await t.bilde("lurte-alle");
  t.sjekk(/alle/i.test(await t.tekst("#skjerm h1")), "Skulle stått «Lurte alle sammen!»");

  // ---------- End early: «Avslutt» asks first («Spill videre» stays), then «Kåringen» — and the
  // game is over for good ----------
  t.sjekk((await t.tekst('[data-h="avslutt"]')).trim() === "Avslutt", "Lenken for å avslutte skal hete «Avslutt»");
  await t.klikk('[data-h="avslutt"]');
  t.sjekk((await t.tekst('#ark:not([hidden]) [data-v="nei"]')).trim() === "Spill videre" && (await t.tekst('#ark [data-v="ja"]')).trim() === "Avslutt", "«Avslutt» skal spørre først, med knappene «Avslutt» og «Spill videre»");
  await t.klikk('#ark [data-v="nei"]');
  s = await t.tilstand();
  t.sjekk(s.skjerm === "resultat" && !s.spill.ferdig && s._aktiv === true, "«Spill videre» avsluttet spillet likevel");
  await fangDeling();
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.pall')");
  s = await t.tilstand();
  t.sjekk(s._aktiv === false && s.spill.ferdig === true, "Kåringen skal ikke regnes som et pågående spill (pagar)");
  t.sjekk(!(await t.finnes("#skjerm .banner .etikett")), "«Kåringen» står både i toppfeltet og i banneret");
  const h1 = (await t.tekst("#skjerm h1")).trim();
  t.sjekk(h1 === `${NAVN[teller2]} vinner!`, `Overskriften skulle vært «${NAVN[teller2]} vinner!», men er «${h1}»`);
  await fri("#skjerm h1", "Vinneren på «Kåringen»");
  const priser = await t.js(`Array.from(document.querySelectorAll(".lh-pris .etikett")).map((e) => e.textContent.trim()).join(", ")`);
  t.sjekk(priser === "Mesterløgner, Løgndetektor, Ærligste fjes", `Kåringen skal ha de tre prisene (fant: ${priser})`);
  t.sjekk(!(await t.finnes(".lh-rekord")), "«Ny rekord!» vises etter det aller første spillet");
  t.sjekk(await t.finnes(".flere-spill"), "Sluttskjermen mangler «Spill noe annet med samme gjeng»");
  t.sjekk((await t.tekst(".dokk .knapp")).trim() === "Spill igjen" && (await t.finnes('.dokk [data-h="endre"]')) && (await t.finnes('.dokk a.lenke[href="/"]')), "Sluttskjermen mangler «Spill igjen», «Endre oppsett» eller «Alle spill»");
  // «Del resultatet»: the winner and the awards — names and numbers only
  await t.klikk('[data-h="del"]');
  const delt = await t.js("window.__delt");
  t.sjekk(
    delt && delt.title === "Løgnhalsen" && /^Løgnhalsen 🤥 .+ vant med 4 poeng\.\nMesterløgner: .+ – lurte 4 · Løgndetektor: .+ og .+ – avslørte 1$/.test(delt.text) && /\/lognhalsen\/$/.test(delt.url),
    `«Del resultatet» delte ikke det ventede: ${JSON.stringify(delt)}`,
  );
  // The evening's scoreboard and the statistics: once — not again after a reload
  let k = await kveld();
  t.sjekk(k.length === 1 && k[0].resultat.length === 5 && k[0].resultat[0].plass === 1, `Kåringen ble ikke registrert én gang i «Kveldens gjeng» (${k.length})`);
  const ferdig1 = await stat("ferdig");
  t.sjekk(ferdig1.length === 1 && ferdig1[0].avbrutt === true && ferdig1[0].turer === 2, `Statistikken fikk ikke «ferdig» én gang: ${JSON.stringify(ferdig1)}`);
  await t.lastSide(t.side, "document.querySelector('.pall')");
  t.sjekk((await kveld()).length === 1 && (await stat("ferdig")).length === 0, "Kåringen ble registrert på nytt etter omlasting");
  await t.sov(600);
  await t.bilde("pallen", true);
  // Regression: after «Avslutt» the home screen offers a new game, not «Fortsett»
  await t.klikk("#tilbake");
  s = await t.tilstand();
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')) && (await t.finnes('.hjem-knapper .knapp[data-h="nytt"]')) && s._aktiv === false, "Etter «Avslutt» står spillet fortsatt som pågående (hjem-skjermen viser «Fortsett»)");
  t.sjekk(ren(await t.tekst(".merker li")) === "REKORD lurte 4", `Hjem-skjermen viser ikke rekorden først blant merkene («${ren(await t.tekst(".merker li"))}»)`);
  await t.bilde("hjem-rekord");

  // ---------- "Skriv inn" with three players, to its natural end ----------
  await t.klikk('[data-h="nytt"]');
  t.sjekk(!(await t.finnes("#ark:not([hidden])")), "«Start spill» spør om å kaste et spill som er ferdig");
  await t.klikk('[data-h="modus"][data-v="skriv"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="4"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="3"]');
  t.sjekk((await t.antall(".spiller")) === 3 && (await lengde()) === "1 runde / 3 turer · ca. 5 min", `Fikk ikke tre spillere og én runde: «${await lengde()}»`);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  t.sjekk((await t.tekst('.dokk [data-h="avslutt"]')).trim() === "Avslutt", "«Gi mobilen til»-skjermen mangler lenken «Avslutt»");
  await t.bilde("gi-mobilen");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#lh-felt-0')");
  t.sjekk(await t.js("document.querySelector('#lh-ferdig').disabled"), "«Ferdig» skal være av før alle tre er skrevet");
  t.sjekk(/^Tips: \S/.test(await t.tekst(".lh-temaboks .lh-tips")), "Skriveskjermen mangler tipset");
  await t.skrivInn("#lh-felt-0", "Jeg har sovet i en hengekøye i tre netter");
  await t.skrivInn("#lh-felt-1", "Jeg har sovet på en flyplass");
  await tipsVises();
  await t.bilde("skriv");

  // Reload while typing: back to the hand-over screen, the text is kept
  await t.lastSide(t.side, HJEM);
  t.sjekk(!(await t.finnes("#lh-felt-0")) && (await t.finnes('[data-h="jeg-er"]')), "Etter omlasting skal mobilen gis til fortelleren igjen, ikke vise det som er skrevet");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#lh-felt-1')");
  t.sjekk((await t.js("document.querySelector('#lh-felt-1').value")) === "Jeg har sovet på en flyplass", "Teksten forsvant etter omlasting");
  await t.skrivInn("#lh-felt-2", "Jeg har sovet i en iglo på Svalbard");
  await t.klikk('[data-h="ferdig-skrevet"]');
  await t.vent("document.querySelector('.lh-pastand')");
  t.sjekk((await t.antall(".lh-pastand")) === 3, "Viser ikke tre påstander");
  s = await t.tilstand();
  t.sjekk(s.spill.kort[s.spill.logn] === "Jeg har sovet i en iglo på Svalbard", "Appen husket feil løgn");
  t.sjekk(s.spill.utkast.every((x) => !x), "Utkastet (med svaret) ble liggende igjen i lagringen");
  await t.sov(500);
  await t.bilde("pek-skriv");
  await t.klikk('[data-h="pek"]', 50);
  await t.vent("document.querySelector('[data-h=\"vis-logn\"]')", 8000);
  await t.klikk('[data-h="vis-logn"]');
  await t.vent("document.querySelector('.lh-pastand.logn')", 6000);
  t.sjekk((await t.tekst(".lh-pastand.logn")).includes("iglo"), "Feil påstand ble stemplet som løgn");
  t.sjekk(!(await t.finnes('[data-h="hurtig"]')) && !(await t.finnes('[data-h="lurte"]')), "Med to lyttere trengs verken «Alle» / «Ingen» eller bryteren");
  await t.sov(800);
  await t.bilde("avslort-skriv");
  const teller3 = (await t.tilstand()).spill.start % 3;
  const gjetter = [0, 1, 2].find((i) => i !== teller3);
  await t.klikk(`[data-h="riktig"][data-v="${gjetter}"]`);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  s = await t.tilstand();
  t.sjekk(s.spill.poeng[teller3] === 1 && s.spill.poeng[gjetter] === 1, "Feil poeng i «Skriv inn»");
  // In "Skriv inn" the story line quotes one of the two true claims
  const sitat = ren(await t.tekst(".lh-historie"));
  t.sjekk(/fortell historien bak «Jeg har sovet (i en hengekøye i tre netter|på en flyplass)»!$/.test(sitat), `Historielinja siterer ikke en sann påstand: «${sitat}»`);
  await t.sov(900);
  await t.bilde("resultat-skriv");
  // Two more turns: fooling both, then being found out by both
  const skrivTur = async (alleRiktig) => {
    await t.klikk('[data-h="neste"]');
    await t.klikk('[data-h="jeg-er"]');
    await t.skrivInn("#lh-felt-0", "Jeg har badet i februar");
    await t.skrivInn("#lh-felt-1", "Jeg kan stå på hendene");
    await t.skrivInn("#lh-felt-2", "Jeg har vunnet en sykkel");
    await t.klikk('[data-h="ferdig-skrevet"]');
    await t.klikk('[data-h="pek"]', 50);
    await t.vent("document.querySelector('[data-h=\"vis-logn\"]')", 8000);
    await t.klikk('[data-h="vis-logn"]');
    await t.vent(RIKTIG, 6000);
    if (alleRiktig) for (const i of await t.js(`Array.from(document.querySelectorAll('[data-h="riktig"]')).map((b) => b.dataset.v)`)) await t.klikk(`[data-h="riktig"][data-v="${i}"]`);
    await t.klikk('[data-h="ferdig"]');
    await t.vent("document.querySelector('.lh-resultat')");
  };
  await skrivTur(false);
  await skrivTur(true);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Avslørt!" && (await t.finnes(".lh-historie")), "Den siste turen skulle endt med «Avslørt!» og en historielinje");
  t.sjekk((await t.tekst(".dokk .knapp")).trim() === "Til kåringen" && !(await t.finnes('.dokk [data-h="avslutt"]')), "Etter siste tur skal knappen hete «Til kåringen» (og «Avslutt» trengs ikke)");
  t.sjekk((await t.tilstand())._aktiv === true, "Spillet er ikke lenger pågående før «Kåringen» er vist");
  await t.klikk('[data-h="slutt"]');
  await t.vent("document.querySelector('.banner')");
  s = await t.tilstand();
  const ferdig2 = await stat("ferdig");
  t.sjekk(s.spill.ferdig === true && s._aktiv === false && (await kveld()).length === 2, "Et spill som er spilt ferdig, ble ikke avsluttet og registrert");
  t.sjekk(ferdig2.length === 1 && ferdig2[0].avbrutt === false && ferdig2[0].turer === 3 && ferdig2[0].runder === 1, `Statistikken etter et helt spill: ${JSON.stringify(ferdig2)}`);
  t.sjekk(!(await t.finnes(".lh-rekord")), "«Ny rekord!» vises uten at rekorden er slått");
  await t.sov(700);
  await t.bilde("pallen-skriv", true);
  // «Spill igjen»: the same setup, a new game
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('[data-h=\"jeg-er\"]')");
  s = await t.tilstand();
  t.sjekk(s.spill.modus === "skriv" && s.spill.antall === 3 && !s.spill.ferdig && s._aktiv === true && s.spill.poeng.every((p) => p === 0), "«Spill igjen» startet ikke et nytt spill med samme oppsett");

  // ---------- Small phone (320 × 568) ----------
  await skjerm(320, 568);
  await t.sov(1200);
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('#lh-felt-0')");
  await tipsVises();
  await t.bilde("smal-320-skriv");
  // The "Si det høyt" turn on the small phone
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.klikk('[data-h="modus"][data-v="hoyt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.lh-temakort')");
  await tipsVises();
  await t.bilde("smal-320-tur");
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.bilde("smal-320-velg");
  await t.klikk('[data-h="velg-logn"][data-v="1"]');
  await t.vent(RIKTIG);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  await t.sov(1300);
  const bredt = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(bredt <= 0, `Siden er ${bredt}px for bred på 320 px skjerm`);
  await t.bilde("smal-320-resultat");
  await fri(".lh-historie", "Historielinja på 320 × 568");
  // 375 × 560 (or narrower when the runner itself is narrower): what each screen is about stays
  // above the dock
  await skjerm(Math.min(375, b0), 560);
  await t.sov(500);
  await fri("#skjerm h1", "Resultatet på 375 × 560");
  await fri(".lh-historie", "Historielinja på 375 × 560");
  await t.bilde("resultat-hoyde-560");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.lh-temakort')");
  await tipsVises();
  await fri(".lh-temakort .storkort-tekst", "Temaet på 375 × 560");
  // With a theme of ordinary length (two lines) the links under the card stay clear of the dock
  await t.js(`(() => { let n = 0; for (const tema of window.RUSJ_DATA.temaer.temaer) for (const k of tema.kort) { if (k[0] === "Noe du har sett på havet") Rusj.S.spill.tema = n; n++; } Rusj.vis(); })()`);
  await t.sov(200);
  t.sjekk((await t.tekst(".lh-temakort .storkort-tekst")).trim() === "Noe du har sett på havet", "Fikk ikke satt et kjent tema");
  await fri('#skjerm .lenkerad [data-h="avslutt"]', "«Nytt tema» og «Avslutt» på 375 × 560");
  await t.bilde("tur-hoyde-560");
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await fri("#skjerm h1", "«Hvilken var løgnen?» på 375 × 560");
  await t.bilde("velg-hoyde-560");
  await t.klikk('[data-h="velg-logn"][data-v="2"]');
  await t.vent(RIKTIG);
  await fri("#skjerm h1", "«Hvem pekte på …?» på 375 × 560");
  await skjerm(b0, h0);
  await t.sov(400);

  // ---------- «Lag en utfordring» — with the party game above still in progress ----------
  await t.klikk("#tilbake");
  const spillFor = kjerne((await t.tilstand()).spill);
  const kveldFor = (await kveld()).length;
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Selskapsspillet står ikke som pågående før utfordringen");
  await t.bilde("hjem-pagar");
  await t.klikk('[data-h="utfordre"]');
  await t.vent("document.querySelector('#lh-u-0')");
  t.sjekk(await t.js("document.querySelector('#lh-u-del').disabled"), "«Del utfordringen» skal være av før alle tre påstandene er skrevet");
  t.sjekk(await t.js(`["lh-u-0", "lh-u-1", "lh-u-2", "lh-u-navn"].every((id) => { const l = document.querySelector('label[for="' + id + '"]'); return l && l.textContent.trim().length > 2; })`), "Et felt i utfordringsskjemaet mangler ledetekst");
  await t.skrivInn("#lh-u-0", "Jeg har klappet en elg");
  await t.skrivInn("#lh-u-1", "Jeg kan sjonglere med fire baller");
  await t.skrivInn("#lh-u-2", "Jeg har aldri spist pizza");
  await t.skrivInn("#lh-u-navn", "Testvenn A");
  t.sjekk(!(await t.js("document.querySelector('#lh-u-del').disabled")), "«Del utfordringen» ble ikke slått på");
  await t.bilde("utfordring-skjema", true);
  // The private form is not resumed after a reload (it says which claim is the lie); the draft is kept
  await t.lastSide(t.side, HJEM);
  t.sjekk(!(await t.finnes("#lh-u-0")) && (await t.tekst("#skjerm h1")).trim() === "Løgnhalsen", "Utfordringsskjemaet (med løgnen) vises rett etter omlasting");
  await t.klikk('[data-h="utfordre"]');
  t.sjekk((await t.js("document.querySelector('#lh-u-2').value")) === "Jeg har aldri spist pizza", "Utkastet til utfordringen forsvant etter omlasting");
  await fangDeling();
  await t.klikk('[data-h="utf-del"]');
  await t.vent("document.querySelector('#lh-lenke')");
  s = await t.tilstand();
  const lenke1 = s.utf.lenke;
  const delt2 = await t.js("window.__delt");
  t.sjekk(/^u=[A-Za-z0-9_-]{40,}$/.test(lenke1) && (await t.tekst("#lh-lenke")).trim() === `${t.side}#${lenke1}`, `Lenken står ikke i tilstanden og på skjermen (${lenke1})`);
  t.sjekk(delt2 && delt2.text === "To sannheter og en løgn om meg 🤥 Finner du løgnen?" && delt2.url === `${t.side}#${lenke1}`, `«Del utfordringen» delte ikke det ventede: ${JSON.stringify(delt2)}`);
  // Neither the claims nor the name can be read in the address
  t.sjekk(!/pizza|elg|sjongl|Testvenn/i.test(Buffer.from(lenke1.slice(2), "base64url").toString("latin1")), "Påstandene kan leses rett ut av lenken");
  await t.bilde("utfordring-klar");
  await fri(".lh-melding", "Meldingen med lenken");
  // «Endre» shows the claims again; from the home screen a challenge that is sent is not shown again
  await t.klikk('[data-h="utf-endre"]');
  t.sjekk((await t.js("document.querySelector('#lh-u-0').value")) === "Jeg har klappet en elg", "«Endre» viser ikke påstandene");
  await t.klikk("#tilbake");
  await t.klikk('[data-h="utfordre"]');
  t.sjekk((await t.js("[document.querySelector('#lh-u-0').value, document.querySelector('#lh-u-navn').value].join('|')")) === "|Testvenn A", "En utfordring som er sendt, vises igjen fra hjem-skjermen (eller navnet ble glemt)");
  await t.klikk("#tilbake");

  // The receiver opens the link: three claims as plain text, framed as written by the sender
  const apne = async (lenke, ventPa = "document.querySelector('.lh-fra')") => {
    await t.lastSide("about:blank");
    await t.lastSide(`${t.side}#${lenke}`, ventPa);
  };
  const kortene = () => t.js(`Array.from(document.querySelectorAll(".lh-valg .lh-ptekst")).map((e) => e.textContent.replace(/^Nummer \\d: /, ""))`);
  await apne(lenke1);
  let kort = await kortene();
  t.sjekk(kort.slice().sort().join("|") === ["Jeg har aldri spist pizza", "Jeg har klappet en elg", "Jeg kan sjonglere med fire baller"].join("|"), `Mottakeren ser ikke de tre påstandene: ${kort.join(" | ")}`);
  t.sjekk((await t.js("location.hash")) === "", "Lenken blir stående i adressefeltet");
  t.sjekk(/fra en venn/i.test(await t.tekst(".lh-fra .etikett")) && /Testvenn A har sendt deg/.test(ren(await t.tekst(".lh-fra .ingress"))) && ren(await t.tekst(".lh-skrevet")) === "«Testvenn A» skrev dette – ikke rusj.no.", "Utfordringen er ikke rammet inn som skrevet av avsenderen");
  await t.sov(500);
  await t.bilde("svar-sporsmal", true);
  await t.klikk(`[data-h="svar-velg"][data-v="${kort.indexOf("Jeg har aldri spist pizza")}"]`);
  await t.vent("document.querySelector('.lh-fra.svart')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Avslørt!" && (await t.tekst(".lh-pastand.logn.valgt")).includes("pizza") && !(await t.finnes(".lh-nese")), "Riktig svar skal gi «Avslørt!» og stempel på løgnen");
  t.sjekk((await t.tekst(".dokk .knapp")).trim() === "Send en tilbake" && (await t.tekst(".dokk .knapp-2")).trim() === "Spill med flere", "Svarskjermen mangler «Send en tilbake» og «Spill med flere»");
  await fri("#skjerm h1", "«Avslørt!»");
  await t.sov(800);
  await t.bilde("svar-avslort", true);
  // The same link again: the answer that was given, no second try
  await apne(lenke1);
  t.sjekk((await t.finnes(".lh-fra.svart")) && !(await t.finnes('[data-h="svar-velg"]')), "Samme lenke gir et nytt forsøk");
  await fangDeling();
  await t.klikk('[data-h="svar-del"]');
  t.sjekk((await t.js("window.__delt && window.__delt.text")) === "Jeg avslørte løgnen din! 🕵️", "«Del svaret» deler noe annet enn hvordan det gikk");

  // The other outcome, with a link made by this test (the format on its own) and no name
  const lenke2 = lagLenke({ navn: "", kort: ["Jeg har badet i februar", "Jeg har vunnet en sykkel", "Jeg kan spille trekkspill"], logn: 1 });
  await apne(lenke2);
  kort = await kortene();
  t.sjekk(kort.join("|") === "Jeg har badet i februar|Jeg har vunnet en sykkel|Jeg kan spille trekkspill", `En lenke laget utenfor spillet leses feil: ${kort.join(" | ")}`);
  t.sjekk(/En venn har sendt deg/.test(ren(await t.tekst(".lh-fra .ingress"))) && ren(await t.tekst(".lh-skrevet")) === "Avsenderen skrev dette – ikke rusj.no.", "Uten navn skal det stå «En venn» og «Avsenderen»");
  await t.klikk('[data-h="svar-velg"][data-v="0"]');
  await t.vent("document.querySelector('.lh-fra.svart')");
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Lurt!" && (await t.finnes(".lh-nese")) && (await t.tekst(".lh-pastand.logn")).includes("sykkel") && (await t.finnes(".lh-pastand.sant.valgt")) && /Løgnen var nr\. 2/.test(await t.tekst(".lh-fra .ingress")), "Feil svar skal gi «Lurt!», nesen og stempel på den riktige løgnen");
  await t.sov(1500);
  await t.bilde("svar-lurt", true);
  await fangDeling();
  await t.klikk('[data-h="svar-del"]');
  t.sjekk((await t.js("window.__delt && window.__delt.text")) === "Du lurte meg! 🤥", "«Del svaret» etter feil svar");
  // A link that is already out there must keep working (the format is frozen)
  await apne(FAST_LENKE);
  t.sjekk((await kortene()).join("|") === "Jeg har sovet i en iglo|Jeg kan jodle|Jeg har møtt en elg på do" && /Kari har sendt deg/.test(ren(await t.tekst(".lh-fra .ingress"))), "En lenke fra før kan ikke lenger åpnes (lenkeformatet er endret)");
  // A new address in the same tab (hashchange), with punctuation glued to the end
  await t.js(`location.hash = ${JSON.stringify("#" + lenke2 + ".")}`);
  await t.vent(`(document.querySelector(".lh-valg .lh-ptekst") || { textContent: "" }).textContent.includes("februar")`);
  t.sjekk((await t.js("location.hash")) === "", "En lenke limt inn i samme fane blir stående i adressefeltet");

  // Markup, control and invisible characters in every field: shown as text, never as elements
  const farlig = lagLenke({
    navn: "<x-q>N</x-q>",
    kort: ['<x-q>A</x-q><img src=x onerror="window.__xss=1">', '<a href="https://example.com/">Trykk her</a> ' + SNU + "txet" + SNU_SLUTT + NULLBREDDE, "<script>window.__xss = 2</script>" + BJELLE + " javascript:alert(1)"],
    logn: 2,
  });
  const farligSjekk = async (hvor) => {
    const f = await t.js(`({ el: document.querySelectorAll("#skjerm x-q, #skjerm img, #skjerm script, #skjerm a, #skjerm iframe").length, xss: window.__xss || 0, tekst: document.querySelector("#skjerm").innerText })`);
    t.sjekk(f.el === 0 && f.xss === 0, `HTML fra en lenke ble tolket som HTML ${hvor} (${f.el} element, skript kjørt: ${f.xss})`);
    t.sjekk(f.tekst.includes('<x-q>A</x-q><img src=x onerror="window.__xss=1">') && f.tekst.includes('<a href="https://example.com/">Trykk her</a> txet') && f.tekst.includes("<script>window.__xss = 2</script> javascript:alert(1)"), `Teksten fra lenken vises ikke som ren tekst ${hvor}`);
    t.sjekk(!USYNLIGE.test(f.tekst), `Usynlige tegn eller styretegn fra lenken ble med ${hvor}`);
    t.sjekk(f.tekst.includes("«x-qNx-q» skrev dette – ikke rusj.no."), `Navnet fra lenken ble ikke renset ${hvor}`);
  };
  await apne(farlig);
  await farligSjekk("før svaret");
  await t.bilde("svar-markup", true);
  await t.klikk('[data-h="svar-velg"][data-v="0"]');
  await t.vent("document.querySelector('.lh-fra.svart')");
  await farligSjekk("etter svaret");
  await t.bilde("svar-markup-avslort", true);
  // Too long: each claim is cut at 100 characters and the name at 16
  await apne(lagLenke({ navn: "Abcdefghijklmnopqrstuvwxyz", kort: ["a".repeat(300), "Lang ".repeat(60), "ccc"], logn: 0 }));
  kort = await kortene();
  t.sjekk(kort[0].length === 100 && kort[1].length <= 100 && kort[2] === "ccc" && /«Abcdefghijklmnop» skrev/.test(await t.tekst(".lh-skrevet")), `For lange tekster i en lenke ble ikke kuttet (${kort.map((x) => x.length).join(", ")})`);
  await t.bilde("svar-lang", true);
  // Damaged or wrong links: «Lenken er ikke gyldig», and the home screen
  const ugyldige = {
    "kuttet": lenke1.slice(0, -3),
    "ett tegn endret": lenke1.slice(0, 12) + (lenke1[12] === "A" ? "B" : "A") + lenke1.slice(13),
    "tom": "u=",
    "ikke base64": "u=%%%",
    "bare tull": "u=" + "A".repeat(40),
    "tom påstand": lagLenke({ navn: "", kort: ["a", "", "c"], logn: 0 }),
    "bare usynlige tegn": lagLenke({ navn: "", kort: ["a", NULLBREDDE + SNU, "c"], logn: 0 }),
    "løgn nr. 4": lagLenke({ navn: "", kort: ["a", "b", "c"], logn: 3 }),
    "fire påstander": lagLenke({ navn: "", kort: ["a", "b", "c", "d"], logn: 0 }),
    "ukjent versjon": lagLenke({ navn: "", kort: ["a", "b", "c"], logn: 0 }, 2),
  };
  for (const [hva, lenke] of Object.entries(ugyldige)) {
    await apne(lenke, HJEM);
    const u = await t.js(`({ h1: document.querySelector("#skjerm h1").textContent.trim(), toast: document.querySelector("#toast").classList.contains("vis") ? document.querySelector("#toast").textContent : "", hash: location.hash })`);
    t.sjekk(u.h1 === "Løgnhalsen" && u.toast === "Lenken er ikke gyldig" && u.hash === "", `En ugyldig lenke (${hva}) skal gi «Lenken er ikke gyldig» på hjem-skjermen: ${JSON.stringify(u)}`);
  }
  await t.bilde("lenke-ugyldig");
  // Something else after # is not a challenge: nothing is said about it
  await apne("noe-annet", HJEM);
  t.sjekk(!(await t.js(`document.querySelector("#toast").classList.contains("vis")`)), "En adresse med noe annet etter # gir en feilmelding");

  // Nothing from a challenge in the statistics or the evening's scoreboard — and the party game
  // is exactly where it was: «Fortsett» still works
  await apne(lenke2);
  await t.klikk('[data-h="svar-velg"][data-v="1"]');
  await t.vent("document.querySelector('.lh-fra.svart')");
  await t.klikk('.dokk [data-h="utfordre"]'); // «Send en tilbake» opens the form
  await t.vent("document.querySelector('#lh-u-0')");
  const logg = await t.js("JSON.stringify(Rusj._statKo)");
  t.sjekk(!/sykkel|februar|trekkspill|pizza|x-q|Testvenn/i.test(logg) && JSON.parse(logg).filter((x) => x.h === "utfordring").every((x) => Object.keys(x.d).join() === "steg"), `Statistikken inneholder noe fra en utfordring: ${logg}`);
  await t.klikk("#tilbake");
  s = await t.tilstand();
  t.sjekk(kjerne(s.spill) === spillFor && s._aktiv === true && (await kveld()).length === kveldFor, "Selskapsspillet eller «Kveldens gjeng» ble endret av en utfordring");
  await t.klikk('[data-h="fortsett"]');
  await t.vent(RIKTIG);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");

  // ---------- Twenty players: every listener by name, then «Stor gjeng» ----------
  await t.start({ navn: Array.from({ length: 20 }, (_, i) => `Testspiller ${i + 1}`) });
  await stille();
  await t.js(`localStorage.setItem("rusj.lognhalsen.v1", JSON.stringify({ rekord: 3 }))`); // a record from an earlier evening
  await t.lastSide(t.side, HJEM);
  t.sjekk(ren(await t.tekst(".merker li")) === "REKORD lurte 3", "Rekorden fra før vises ikke på hjem-skjermen");
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) === 20 && (await lengde()) === "1 runde / 20 turer · ca. 40 min", `Oppsettet viser ikke 20 spillere og én runde: «${await lengde()}»`);
  t.sjekk((await t.js(`(document.querySelector('[data-h="stor"]') || { getAttribute: () => "" }).getAttribute("aria-pressed")`)) === "false", "«Stor gjeng» tilbys ikke (avslått) fra ni spillere");
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.klikk('[data-h="velg-logn"][data-v="1"]');
  await t.vent(RIKTIG);
  t.sjekk((await t.antall('[data-h="riktig"]')) === 19, "Ikke alle 19 lytterne kan velges");
  t.sjekk(await t.js(`!!(document.querySelector('[data-h="lurte"]').compareDocumentPosition(document.querySelector('[data-h="riktig"]')) & Node.DOCUMENT_POSITION_FOLLOWING)`), "Med en lang navneliste skal bryteren stå over navnene, ikke nederst");
  await t.klikk('[data-h="hurtig"][data-v="alle"]');
  t.sjekk((await t.tekst("#lh-ferdig-tur")).trim() === "Ferdig – alle hadde rett" && (await t.tilstand()).spill.riktige.length === 19, "«Alle» valgte ikke alle 19");
  await t.bilde("tjue-spillere", true);
  const bred20 = await t.js("document.documentElement.scrollWidth - window.innerWidth");
  t.sjekk(bred20 <= 0, `Siden er ${bred20}px for bred med 20 spillere`);
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  t.sjekk(/De 19 som gjettet riktig, får 1 poeng hver\./.test(await t.tekst(".lh-resultat .ingress")), "Med mange riktige skal resultatet ikke ramse opp alle navnene");
  // «Stor gjeng»: no names — count the fooled; only the teller scores
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.klikk('[data-h="stor"]');
  t.sjekk((await t.tilstand()).oppsett.stor === true, "«Stor gjeng» ble ikke slått på");
  await t.bilde("oppsett-stor-gjeng", true);
  await t.klikk('[data-h="start"]');
  await t.klikk('[data-h="pek"]', 50);
  await t.vent(VELG, 8000);
  await t.klikk('[data-h="velg-logn"][data-v="0"]');
  await t.vent("document.querySelector('[data-h=\"lurt-antall\"]')");
  t.sjekk(!(await t.finnes('[data-h="riktig"]')) && (await t.tekst("#lh-hvem h1")).trim() === "Hvor mange ble lurt?", "«Stor gjeng» skal spørre hvor mange som ble lurt, uten navn");
  for (let i = 0; i < 7; i++) await t.klikk('[data-h="lurt-antall"][data-v="1"]', 60);
  t.sjekk((await t.tekst("#lh-ferdig-tur")).trim() === "Ferdig – 7 ble lurt" && ren(await t.tekst("#lh-hvem .teller output")) === "7 av 19", "Telleren i «Stor gjeng» teller ikke");
  t.sjekk(await t.js(`document.activeElement && document.activeElement.dataset.h === "lurt-antall" && document.activeElement.dataset.v === "1"`), "Fokus forsvinner fra pluss-knappen i «Stor gjeng»");
  await t.sov(300);
  await t.bilde("stor-gjeng");
  await fri("#lh-hvem .teller", "Telleren i «Stor gjeng»");
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  s = await t.tilstand();
  const teller20 = (s.spill.start + s.spill.k) % 20;
  t.sjekk(s.spill.poeng[teller20] === 7 && sumAv(s.spill.poeng) === 7 && (await t.tekst("#skjerm h1")).trim() === "Lurte 7 av 19!", "I «Stor gjeng» skal bare fortelleren få poeng");
  // «Angre» gives the count back; one less, and on
  await t.klikk('[data-h="angre"]');
  await t.vent("document.querySelector('[data-h=\"lurt-antall\"]')");
  t.sjekk(ren(await t.tekst("#lh-hvem .teller output")) === "7 av 19" && sumAv((await t.tilstand()).spill.poeng) === 0, "«Angre» i «Stor gjeng» tok ikke poengene tilbake");
  await t.klikk('[data-h="lurt-antall"][data-v="-1"]');
  await t.klikk('[data-h="ferdig"]');
  await t.vent("document.querySelector('.lh-resultat')");
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.lh-priser')");
  const priser20 = await t.js(`Array.from(document.querySelectorAll(".lh-pris .etikett")).map((e) => e.textContent.trim()).join(", ")`);
  t.sjekk(priser20 === "Mesterløgner" && (await t.js(`(document.querySelector(".lh-rekord") || { textContent: "" }).textContent.trim()`)) === "Ny rekord!", `«Stor gjeng»: ventet bare Mesterløgner, med «Ny rekord!» (fant: ${priser20})`);
  k = await kveld();
  t.sjekk(k.length === 1 && k[0].resultat.length === 20, "«Stor gjeng» ble ikke registrert i «Kveldens gjeng» med alle 20");
  await t.sov(700);
  await t.bilde("pallen-stor-gjeng", true);
  await t.klikk("#tilbake");
  t.sjekk(ren(await t.tekst(".merker li")) === "REKORD lurte 6", "Den nye rekorden vises ikke på hjem-skjermen");

  // ---------- Ending before anybody has told anything: «Kåringen» without a ranking ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.lh-temakort')");
  await t.klikk('#skjerm [data-h="avslutt"]');
  await t.klikk('#ark [data-v="ja"]');
  await t.vent("document.querySelector('.banner')");
  s = await t.tilstand();
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Ingen poeng ennå" && !(await t.finnes(".pall, .lh-priser, [data-h='del']")) && s._aktiv === false && (await kveld()).length === 1, "Et spill som avsluttes før første tur, skal gi en tom kåring og ikke telle for kvelden");
  await t.bilde("kaaring-tom");

  // ---------- A damaged save never gives a blank page ----------
  const lagre = (tilstand) => t.js(`localStorage.setItem("rusj.lognhalsen.v1", ${JSON.stringify(JSON.stringify(tilstand))})`);
  await lagre({ skjerm: "svar", _tid: Date.now(), antall: "mange", oppsett: 7, jul: {}, rekord: "høy", utf: { utkast: 5, lenke: "u=tull", mottatt: { v: "u=AAAA", valgt: 9 } }, spill: { fase: "resultat", antall: 5, modus: "skriv", poeng: "x" } });
  await t.lastSide(t.side, HJEM);
  t.sjekk((await t.tekst("#skjerm h1")).trim() === "Løgnhalsen" && !(await t.finnes('[data-h="fortsett"]')), "En ødelagt lagret tilstand ga ikke en ren hjem-skjerm");
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall(".spiller")) >= 3 && (await t.finnes('[data-h="start"]')), "Oppsettet virker ikke etter en ødelagt lagret tilstand");
  // A game whose last turn is broken: back to the start of the turn, never a dead screen
  const tall = [0, 0, 0, 0];
  await lagre({ skjerm: "resultat", _tid: Date.now(), antall: 4, spill: { antall: 4, modus: "skriv", runder: 1, k: 0, start: 0, tema: 0, temaer: [], fase: "resultat", siste: { teller: 9 }, kort: [1, 2], logn: 7, poeng: tall, lurt: tall, treff: tall, fortalt: tall } });
  await t.lastSide(t.side, HJEM);
  t.sjekk(await t.finnes('[data-h="jeg-er"]'), "Et spill med en ødelagt tur ble ikke sendt tilbake til starten av turen");
  await lagre({ skjerm: "avslor", _tid: Date.now(), antall: 4, spill: { antall: 4, modus: "hoyt", runder: 1, k: 0, start: 0, tema: 0, temaer: ["finnes-ikke"], fase: "hvem", logn: null, riktige: "alle", poeng: tall, lurt: tall, treff: tall, fortalt: tall } });
  await t.lastSide(t.side, HJEM);
  t.sjekk(await t.finnes('[data-h="velg-logn"]'), "«Hvem pekte på …?» uten en løgn ble ikke sendt tilbake til «Hvilken var løgnen?»");

  // ---------- The «Jul» season: 1 November – 6 January, with a faked date ----------
  const medDato = async (iso, fn) => {
    const { identifier } = await t.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => { const Ekte = Date; const forskyv = ${Date.parse(iso)} - Ekte.now(); class Falsk extends Ekte { constructor(...a) { if (a.length) super(...a); else super(Ekte.now() + forskyv); } static now() { return Ekte.now() + forskyv; } } window.Date = Falsk; })();`,
    });
    try {
      await t.lastSide(t.side, HJEM);
      await fn();
    } finally {
      await t.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  };
  const jul = async () => {
    const x = await t.tilstand();
    return `${x.jul}/${x.oppsett.temaer.includes("jul") ? "på" : "av"}`;
  };
  const brikker = async () => {
    if (!(await t.finnes('[data-h="vis-temaer"]'))) await t.klikk('[data-h="nytt"]');
    await t.klikk('[data-h="vis-temaer"]');
    return t.js(`Array.from(document.querySelectorAll('#ark [data-h="temavalg"]')).map((b) => b.dataset.v)`);
  };
  await t.start({ navn: NAVN });
  await stille();
  await medDato("2026-06-15T12:00:00+02:00", async () => {
    await t.js(`localStorage.removeItem("rusj.lognhalsen.v1")`);
    await t.lastSide(t.side, HJEM);
    t.sjekk((await jul()) === "0/av", `I juni skal «Jul» være av i et nytt oppsett (${await jul()})`);
    const rekke = await brikker();
    t.sjekk(rekke[0] === "*" && rekke[rekke.length - 1] === "jul", `Utenfor sesongen skal «Jul» stå sist blant temaene (${rekke.join(" ")})`);
    // Switched on by hand in June: it stays on
    await t.klikk('#ark [data-h="temavalg"][data-v="jul"]');
    await t.lastSide(t.side, HJEM);
    t.sjekk((await jul()) === "0/på", `«Jul» slått på for hånd i juni ble slått av igjen (${await jul()})`);
    await brikker();
    await t.klikk('#ark [data-h="temavalg"][data-v="jul"]');
    t.sjekk((await jul()) === "0/av", "Fikk ikke slått av «Jul» igjen");
  });
  await medDato("2026-11-01T08:00:00+01:00", async () => {
    t.sjekk((await jul()) === "2026/på", `1. november skal «Jul» slås på (${await jul()})`);
    const rekke = await brikker();
    t.sjekk(rekke[0] === "*" && rekke[1] === "jul", `I sesongen skal «Jul» stå først blant temaene (${rekke.join(" ")})`);
    await t.sov(300);
    await t.bilde("temaer-jul");
    // Switched off by hand: it stays off for the rest of the season
    await t.klikk('#ark [data-h="temavalg"][data-v="jul"]');
    await t.lastSide(t.side, HJEM);
    t.sjekk((await jul()) === "2026/av", `«Jul» slått av for hånd i sesongen ble slått på igjen (${await jul()})`);
  });
  await medDato("2027-01-06T20:00:00+01:00", async () => {
    t.sjekk((await jul()) === "2026/av", `6. januar er fortsatt samme sesong (${await jul()})`);
    await brikker();
    await t.klikk('#ark [data-h="temavalg"][data-v="jul"]');
    t.sjekk((await jul()) === "2026/på", "Fikk ikke slått på «Jul» igjen");
  });
  await medDato("2027-01-07T08:00:00+01:00", async () => {
    t.sjekk((await jul()) === "0/av", `7. januar er sesongen over, og «Jul» skal slås av (${await jul()})`);
  });
  await medDato("2027-12-24T17:00:00+01:00", async () => {
    t.sjekk((await jul()) === "2027/på", `Neste sesong skal «Jul» slås på igjen (${await jul()})`);
  });
  await t.lastSide(t.side, HJEM);
}

const sumAv = (liste) => liste.reduce((a, b) => a + b, 0);
