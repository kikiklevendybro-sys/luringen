// Kameleonen: setup (tempo, time, rounds), the scene card with the two actors and their roles,
// «Bytt scene», a running scene where the emotion switches by itself (new emotion, new colour,
// the plan kept in S), a reload mid-scene (same plan, same emotion, paused at the same second,
// then on), «Kutt!», the verdict (best, both, undo), back + continue, «Avslutt» → «Spill videre»,
// the rotation through a whole round, Kåringen (podium, «Kveldens gjeng», share) and a game ended
// early without points.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en kameleonen): the texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the names and the links.

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const enH1 = async (hvor) => t.sjekk((await t.antall("#skjerm h1")) === 1, `Skjermen «${hvor}» skal ha nøyaktig én h1`);
  const kveld = () => t.js(`JSON.parse(localStorage.getItem("${t.nokkel("kveld")}") || "null")`);
  const hendelser = () => t.js(`window.Rusj._statKo.map((s) => s.h)`);
  const sp = async () => (await t.tilstand()).spill;

  const navn = ["Testspiller A", "Testspiller B", "Testspiller C", "Testspiller D", "Testspiller E"];
  await t.start({ navn });
  await t.klikk('[data-h="nytt"]');
  await enH1("gjør klart");
  t.sjekk(!t.norsk || /Gjør klart/.test(await t.tekst("#skjerm h1")), "Oppsettet skal hete «Gjør klart»");
  t.sjekk((await t.antall(".spiller")) === 5, `Spillerlista skal følge gjengens fem navn, viser ${await t.antall(".spiller")}`);
  let s = await t.tilstand();
  t.sjekk(s.oppsett.tid === 60 && s.oppsett.tempo === "vanlig" && s.oppsett.runder === 1, "Standardoppsettet skal være 60 s, vanlig tempo og én runde");
  await t.klikk('[data-h="tempo"][data-v="kaos"]');
  await t.klikk('[data-h="tid"][data-v="45"]');
  await t.klikk('[data-h="runder"][data-v="2"]');
  await t.klikk('[data-h="runder"][data-v="1"]');
  s = await t.tilstand();
  t.sjekk(s.oppsett.tid === 45 && s.oppsett.tempo === "kaos" && s.oppsett.runder === 1, "Valgene i oppsettet ble ikke lagret");
  t.sjekk(!t.norsk || /4\.–9\./.test(await t.tekst("#skjerm")), "Kaos skal forklare 4–9 sekunder");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="start-scene"]')`);
  await enH1("klar");
  t.sjekk((await hendelser()).includes("start"), "Spillet meldte ikke «start» til statistikken");

  // The first scene: two actors with roles, the title in the h1
  s = await sp();
  t.sjekk(s.turer === 5 && s.par.length === 5, `Fem spillere skal gi fem scener i én runde (${s.turer})`);
  let [a, b] = s.par[0];
  t.sjekk((await t.antall(".kam-aktor")) === 2, "Scenen skal vise to skuespillere");
  const aktorer = await t.tekst(".kam-aktorer");
  t.sjekk(aktorer.includes(navn[a]) && aktorer.includes(navn[b]), `Skuespillerne er ikke ${navn[a]} og ${navn[b]}: ${aktorer}`);
  t.sjekk((await t.antall(".kam-rolle")) === 2, "Begge skal få en rolle");
  t.sjekk(!t.norsk || /Runde 1 av 1/i.test(await t.tekst("#topp-tittel")), `Topplinja skal si «Runde 1 av 1»: ${await t.tekst("#topp-tittel")}`);
  t.sjekk(await t.friForDokk(".kam-aktorer"), "Skuespillerne havner bak knappene");
  await t.bilde("klar");

  // «Bytt scene»
  const forste = s.scene;
  await pause();
  await t.klikk('[data-h="bytt"]');
  s = await sp();
  t.sjekk(s.scene !== forste && s.tur === 0, "«Bytt scene» skal gi en ny scene på samme tur");

  // Start: 3-2-1, then the emotion fills the screen
  await pause();
  await t.klikk('[data-h="start-scene"]', 50);
  await t.vent("document.querySelector('.kam-folelse')", 7000);
  await enH1("scenen");
  s = await sp();
  t.sjekk(s.fase === "scene" && s.plan && s.plan.bytt.length >= 3 && s.plan.f.length === s.plan.bytt.length + 1, "Scenen har ingen plan for byttene");
  t.sjekk(s.plan.bytt.every((x, i) => x - (i ? s.plan.bytt[i - 1] : 0) >= 4 && x - (i ? s.plan.bytt[i - 1] : 0) <= 9), `Byttene i kaos skal komme hvert 4.–9. sekund: ${s.plan.bytt}`);
  t.sjekk(await t.finnes(`#kam-tid .timer-ring`), "Klokka mangler");
  t.sjekk(await t.friForDokk(".kam-folelse"), "Følelsen havner bak knappene");
  t.sjekk(await t.friForDokk("#kam-tid"), "Klokka havner bak knappene");
  const for1 = await t.js(`document.querySelector('.kam-folelse').dataset.folelse`);
  const farge1 = await t.js(`getComputedStyle(document.querySelector('.kam-folelse')).backgroundColor`);
  await t.bilde("scene");

  // A switch happens by itself: new emotion, new colour
  await t.vent(`document.querySelector('.kam-folelse') && document.querySelector('.kam-folelse').dataset.folelse !== ${JSON.stringify(for1)}`, 11000);
  s = await sp();
  t.sjekk(s.fi >= 1 && s.bytter >= 1, `Byttet ble ikke lagret (fi ${s.fi})`);
  const farge2 = await t.js(`getComputedStyle(document.querySelector('.kam-folelse')).backgroundColor`);
  t.sjekk(farge1 !== farge2, `Kameleonen skiftet ikke farge (${farge1} → ${farge2})`);
  t.sjekk(s.plan.f[s.fi] !== s.plan.f[s.fi - 1], "Samme følelse to ganger på rad");
  await t.bilde("bytte");

  // Reload mid-scene: same plan, same emotion, paused at about the same second — then on
  const planFor = JSON.stringify(s.plan);
  const fiFor = s.fi;
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.kam-folelse')");
  s = await sp();
  t.sjekk(JSON.stringify(s.plan) === planFor, "Planen for byttene endret seg ved omlasting");
  t.sjekk(s.fi >= fiFor && s.fase === "scene" && s.pause === true, `Omlasting midt i scenen skal fortsette samme scene, på pause (fi ${s.fi}, fase ${s.fase})`);
  t.sjekk(await t.finnes('[data-h="fortsett-scene"]'), "Etter omlasting mangler «Fortsett»");
  t.sjekk((await t.js(`document.querySelector('.kam-folelse').dataset.folelse`)) === (await t.js(`window.RUSJ_DATA.innhold.folelser[${s.plan.f[s.fi]}].id`)), "Følelsen på skjermen passer ikke planen etter omlasting");
  await t.bilde("omlastet");
  const igjen = s.igjen;
  await pause();
  await t.klikk('[data-h="fortsett-scene"]');
  await t.sov(2300);
  s = await sp();
  t.sjekk(s.pause === false && s.igjen < igjen && s.igjen >= igjen - 4, `Klokka gikk ikke videre fra samme sekund (${igjen} → ${s.igjen})`);

  // «Kutt!» → the verdict
  await t.klikk('[data-h="kutt"]');
  await t.vent(`document.querySelector('[data-h="dom"]')`);
  await enH1("dommen");
  t.sjekk(!t.norsk || /Hvem var best\?/.test(await t.tekst("#skjerm h1")), "Dommen skal spørre «Hvem var best?»");
  s = await sp();
  t.sjekk((await t.antall(".kam-chip")) === s.fi + 1, "Følelsene i scenen vises ikke");
  t.sjekk(await t.js(`document.querySelector('.dokk [data-h="neste"]').disabled`), "«Neste» skal vente på dommen");
  await t.bilde("dom");
  await pause();
  await t.klikk(`[data-h="dom"][data-v="${a}"]`);
  s = await sp();
  t.sjekk(s.dom === "a" && /\+2/.test(await t.tekst(".poengliste")), "Best skulle gi +2");
  await t.bilde("dom-valgt");
  await t.klikk("#angre");
  s = await sp();
  t.sjekk(s.dom === null, "«Angre» tok ikke dommen tilbake");
  t.sjekk(!t.norsk || /Angret/.test(await t.tekst("#toast")), "«Angre» sier ikke fra");
  await pause();
  await t.klikk('[data-h="dom"][data-v="begge"]');
  s = await sp();
  t.sjekk(s.dom === "begge" && (await t.js(`document.querySelector('.kam-begge').getAttribute('aria-pressed')`)) === "true", "«Like gode» ble ikke valgt");
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent(`document.querySelector('[data-h="start-scene"]')`);
  s = await sp();
  t.sjekk(s.poeng[a] === 1 && s.poeng[b] === 1 && s.tur === 1, `«Like gode» skulle gi ett poeng hver (${s.poeng})`);
  const [c, d] = s.par[1];
  t.sjekk(![a, b].includes(c) && ![a, b].includes(d), "Med fem spillere skal ingen spille to scener på rad");

  // One scene: Start, Kutt!, a verdict, Neste
  async function scene(v) {
    await pause();
    await t.klikk('[data-h="start-scene"]', 50);
    await t.vent("document.querySelector('.kam-folelse')", 7000);
    await pause();
    await t.klikk('[data-h="kutt"]');
    await t.vent(`document.querySelector('[data-h="dom"]')`);
    const na = await sp();
    await pause();
    await t.klikk(v === "begge" ? '[data-h="dom"][data-v="begge"]' : `[data-h="dom"][data-v="${na.par[na.tur][v === "a" ? 0 : 1]}"]`);
    await pause();
    await t.klikk('[data-h="neste"]');
    await t.vent(`document.querySelector('[data-h="start-scene"], .pall, .banner')`);
  }

  await scene("a");
  // Back + continue
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="fortsett"]'), "«Fortsett» er ikke hovedknappen mens spillet pågår");
  t.sjekk(!t.norsk || /scene 3 av 5/.test(await t.tekst('[data-h="fortsett"]')), `«Fortsett» sier ikke hvor langt spillet er kommet: ${await t.tekst('[data-h="fortsett"]')}`);
  await pause();
  await t.klikk('[data-h="fortsett"]');
  await t.vent(`document.querySelector('[data-h="start-scene"]')`);
  // «Avslutt» asks, staying is «Spill videre»
  await pause();
  await t.klikk('[data-h="avslutt"]');
  t.sjekk(!t.norsk || (await t.tekst('#ark [data-h="ark-svar"][data-v="nei"]')).trim() === "Spill videre", "Arket skal ha knappen «Spill videre»");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await sp()).ferdig === false, "«Spill videre» avsluttet spillet likevel");

  for (const v of ["b", "begge"]) await scene(v);
  // The last scene: the button says «Til kåringen»
  await pause();
  await t.klikk('[data-h="start-scene"]', 50);
  await t.vent("document.querySelector('.kam-folelse')", 7000);
  await pause();
  await t.klikk('[data-h="kutt"]');
  await t.vent(`document.querySelector('[data-h="dom"]')`);
  s = await sp();
  await pause();
  await t.klikk(`[data-h="dom"][data-v="${s.par[s.tur][0]}"]`);
  t.sjekk(!t.norsk || /Til kåringen/.test(await t.tekst('[data-h="neste"]')), "Etter siste scene skal knappen hete «Til kåringen»");
  const teller = Array(5).fill(0);
  s.par.forEach(([x, y]) => (teller[x]++, teller[y]++));
  t.sjekk(teller.every((n) => n === 2), `Alle skal spille to scener i runden: ${teller}`);
  await pause();
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  t.sjekk(!t.norsk || /Kåringen/i.test(await t.tekst("#topp-tittel")), "Sluttskjermen skal hete «Kåringen»");
  await enH1("kåringen");
  s = await sp();
  t.sjekk(s.ferdig && s.poeng.reduce((x, y) => x + y, 0) === 10, `Fem scener skal gi 10 poeng til sammen (${s.poeng})`);
  const topp = Math.max(...s.poeng);
  const vinner = navn[s.poeng.indexOf(topp)];
  t.sjekk((await t.tekst("#skjerm h1")).includes(vinner), `${vinner} skal stå i vinnerlinja: «${await t.tekst("#skjerm h1")}»`);
  t.sjekk(await t.finnes(`#skjerm a.lenke[href="${t.forside}"]`), "Mangler «Alle spill»");
  t.sjekk((await t.tilstand())._aktiv === false, "Et ferdig spill skal ikke være merket som pågående");
  t.sjekk((await hendelser()).includes("ferdig"), "Spillet meldte ikke «ferdig» til statistikken");
  await t.bilde("slutt", true);
  const k = await kveld();
  t.sjekk(k && k.spill.length === 1 && k.spill[0].id === "kameleonen", "Kåringen ble ikke meldt til «Kveldens gjeng»");

  await t.js(`navigator.share = async (d) => { window.__delt = d; }; navigator.canShare = () => false;`);
  await t.klikk('[data-h="del"]');
  await t.sov(300);
  const delt = await t.js("window.__delt || null");
  t.sjekk(delt && delt.text.includes(vinner) && delt.url.endsWith(new URL(t.side).pathname), `«Del resultatet» delte ikke resultatet: ${JSON.stringify(delt)}`);

  // A new game ended early without points: straight home, no results
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Etter kåringen skal hjem-skjermen ikke tilby «Fortsett»");
  await t.klikk('[data-h="nytt"]');
  await t.vent(`document.querySelector('[data-h="start"]')`);
  await pause();
  await t.klikk('[data-h="start"]');
  await t.vent(`document.querySelector('[data-h="start-scene"]')`);
  await pause();
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent(`document.querySelector('[data-h="nytt"]')`);
  t.sjekk((await t.tilstand()).spill === null, "Avslutt uten poeng skal kaste spillet");
}
