// Bedreviteren: saved state from the old name «Besserwisseren» is carried over; «Dagens fem» (the
// same five for everyone today, easy → hard, no repeats within a cycle, reload, share text without
// answers, #dagens, the front page's «rusj.daglig»); then a full quiz with three players (reveal,
// «Hvem hadde rett?», undo, reload mid-game, back + continue, «Nytt spill» asks first, standings,
// podium, answer key, «Kveldens gjeng»), a solo round played to the end (record per level), a team
// round where the clock runs out, a tie-break, and small phones (320 × 568) where the question, all
// four answers, the right answer and the fun fact must be visible without scrolling.
export default async function (t) {
  const fase = async () => (await t.tilstand()).spill;
  const visSvaret = async () => {
    await t.klikk('[data-h="vis"]');
    await t.vent("document.querySelector('.bw-valg.riktig')", 5000);
  };
  // Nothing inside the question card may stick out (the page clips sideways overflow, so check the card itself).
  const passerKortet = async (navn) => {
    const ut = await t.js(`(() => { const k = document.querySelector(".bw-kort"); if (!k) return 0; const r = k.getBoundingClientRect(); return Math.max(k.scrollWidth - k.clientWidth, Math.round(r.right - window.innerWidth), ...Array.from(k.querySelectorAll(".bw-kort-topp > *")).map((e) => Math.round(e.getBoundingClientRect().right - r.right + 1))); })()`);
    t.sjekk(ut <= 0, `Spørsmålskortet er ${ut}px for bredt på «${navn}»`);
  };
  // How far (px) an element reaches below the top of the sticky dock (> 0 means hidden behind it).
  // On a phone on its side the dock is a column beside the content: then the bottom of the screen counts.
  const underDokka = (sel) =>
    t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const d = document.querySelector("#skjerm .dokk .knapp"); if (!el || !d) return 999; const a = el.getBoundingClientRect(); const b = d.getBoundingClientRect(); const ved = a.right <= b.left + 1 || a.left >= b.right - 1; return Math.round(a.bottom - (ved ? window.innerHeight : b.top)); })()`);
  const overToppen = (sel) => t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? Math.round(60 - el.getBoundingClientRect().top) : 999; })()`);

  // The runner may use another phone size (--bredde/--hoyde); adapt to it and restore it at the end.
  const [B0, H0] = await t.js("[window.innerWidth, window.innerHeight]");

  const les = (nokkel) => t.js(`JSON.parse(localStorage.getItem(${JSON.stringify("rusj." + nokkel)}) || "null")`);
  const ALLE = `(() => { const A = []; Object.keys(RUSJ_DATA).filter((n) => n.startsWith("sporsmal-")).sort().forEach((n) => RUSJ_DATA[n].forEach((q) => A.push(q))); return A; })()`;

  // ---------- The old name: saved state is carried over once ----------
  await t.start();
  await t.js(`(() => {
    localStorage.removeItem("rusj.bedreviteren.v1");
    localStorage.setItem("rusj.besserwisseren.v1", JSON.stringify({ antall: 2, oppsett: { modus: "lag", lag: 3, niva: "2", lengde: 15, klokke: true, kategorier: ["norge"] }, spill: null }));
    localStorage.setItem("rusj.besserwisseren.rekord", JSON.stringify({ 10: 7 }));
    localStorage.setItem("rusj.kveld", JSON.stringify({ start: Date.now(), spill: [{ id: "besserwisseren", tid: Date.now(), resultat: [] }] }));
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  const flyttet = await t.tilstand();
  t.sjekk(flyttet && flyttet.oppsett.modus === "lag" && flyttet.oppsett.lag === 3 && flyttet.oppsett.lengde === 15, "Oppsettet fra Besserwisseren ble ikke flyttet over");
  t.sjekk((await les("besserwisseren.v1")) === null, "Den gamle lagringen ble ikke ryddet bort");
  t.sjekk(JSON.stringify(await les("bedreviteren.rekord")) === '{"blandet.10":7}', "Den gamle rekorden ble ikke flyttet over");
  t.sjekk((await les("kveld")).spill[0].id === "bedreviteren", "Kveldens gjeng har fortsatt det gamle navnet");
  // The old address still works: a small page that sends the visitor on (no script, not in the sitemap)
  const gammel = await t.js(`Promise.all([fetch("/besserwisseren/").then((r) => (r.ok ? r.text() : "")), fetch("/sitemap.xml").then((r) => (r.ok ? r.text() : "-"))])`);
  t.sjekk(/http-equiv="refresh" content="0; url=\/bedreviteren\/"/.test(gammel[0]) && /rel="canonical" href="https:\/\/rusj\.no\/bedreviteren\/"/.test(gammel[0]) && !/<script/.test(gammel[0]), "/besserwisseren/ sender ikke videre til /bedreviteren/");
  t.sjekk(!gammel[1].includes("besserwisseren"), "Den gamle adressen skal ikke stå i sitemap.xml");

  // ---------- «Dagens fem» ----------
  await t.start();
  t.sjekk(await t.finnes('.hjem-knapper .knapp.stor[data-h="dagens"]'), "«Dagens fem» skal være hovedknappen på hjem");
  t.sjekk(await t.finnes('.hjem-knapper .knapp-2[data-h="nytt"]'), "«Start quiz» skal ligge under «Dagens fem»");
  await t.bilde("hjem");
  const iDag = await t.js("Rusj.dag().nr");
  const fem = await t.js(`Rusj.app._dagens.sporsmal(${iDag})`);
  // The same five for every phone and every load, easy → hard, never the children's questions.
  const sjekkDager = await t.js(`(() => {
    const A = ${ALLE};
    const D = Rusj.app._dagens;
    const sist = new Map();
    let kortest = Infinity, feil = "";
    for (let d = D.start; d < D.start + 3 * D.syklus; d++) {
      const fem = D.sporsmal(d);
      if (new Set(fem).size !== 5 || fem.some((i) => !A[i])) feil = feil || "dag " + d + " har ikke fem ulike spørsmål";
      if (fem.some((i, n) => n && A[i].n < A[fem[n - 1]].n)) feil = feil || "dag " + d + " går ikke fra lett til vanskelig";
      if (fem.some((i) => A[i].k === "barn")) feil = feil || "dag " + d + " har et barnespørsmål";
      for (const i of fem) {
        if (sist.has(i)) kortest = Math.min(kortest, d - sist.get(i));
        sist.set(i, d);
      }
    }
    return { feil, kortest, syklus: D.syklus };
  })()`);
  t.sjekk(!sjekkDager.feil, sjekkDager.feil);
  t.sjekk(sjekkDager.syklus >= 110 && sjekkDager.kortest >= sjekkDager.syklus - 4, `Et spørsmål kom igjen etter ${sjekkDager.kortest} dager (syklus ${sjekkDager.syklus})`);
  t.sjekk(JSON.stringify(await t.js(`Rusj.app._dagens.sporsmal(${iDag + 1})`)) !== JSON.stringify(fem), "I morgen gir de samme spørsmålene som i dag");

  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelector('[data-h=\"dsvar\"]')");
  let dg = (await les("bedreviteren.dagens")).dag;
  t.sjekk(dg.nr === iDag && JSON.stringify(dg.liste) === JSON.stringify(fem), "Dagens fem er ikke dagens spørsmål");
  t.sjekk(/Dagens fem · 1\/5/i.test(await t.tekst("#topp-tittel")), "Topplinjen viser ikke «Dagens fem · 1/5»");
  t.sjekk((await t.antall('[data-h="dsvar"]')) === 4, "Dagens fem skal ha fire svarknapper");
  await t.bilde("dagens-sporsmal");
  // Answers: right, wrong, «Jeg vet ikke», right, right → 3 of 5
  const riktigPlass = (n) => t.js(`(() => { const d = JSON.parse(localStorage.getItem("rusj.bedreviteren.dagens")).dag; const q = ${ALLE}[d.liste[${n}]]; return d.rekke[${n}].indexOf(q.r); })()`);
  const svar = async (n, rett) => {
    const r = await riktigPlass(n);
    if (rett === null) await t.klikk('[data-h="dvis"]');
    else await t.klikk(`[data-h="dsvar"][data-v="${rett ? r : (r + 1) % 4}"]`);
    await t.vent("document.querySelector('.bw-dom')", 3000);
  };
  await svar(0, true);
  t.sjekk(await t.finnes(".bw-dom.riktig") && (await t.tekst(".bw-fakta")).length > 15, "Riktig svar viser ikke «Riktig!» og faktabiten");
  t.sjekk((await les("daglig")).bedreviteren.pagar.tekst === "1/5", "Forsiden får ikke vite at dagens fem er i gang (1/5)");
  await t.bilde("dagens-riktig");
  // Reload keeps the answer
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".bw-dom.riktig"), "Svaret var borte etter omlasting");
  await t.klikk('[data-h="dneste"]');
  await svar(1, false);
  t.sjekk(await t.finnes(".bw-dom.feil") && /Riktig svar er [A-D]: /.test(await t.tekst(".bw-dom")), "Feil svar viser ikke det riktige svaret");
  await t.bilde("dagens-feil");
  await t.klikk('[data-h="dneste"]');
  // Back home mid-round: «Fortsett dagens fem · 2/5»; the party quiz is untouched
  await t.klikk("#tilbake");
  t.sjekk(/Fortsett dagens fem · 2\/5/.test(await t.tekst('.hjem-knapper [data-h="dagens"]')), "Hjem viser ikke «Fortsett dagens fem · 2/5»");
  t.sjekk((await t.tilstand()).spill == null, "Dagens fem skal ikke røre festquizen");
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelector('[data-h=\"dsvar\"]')");
  await svar(2, null);
  await t.klikk('[data-h="dneste"]');
  await svar(3, true);
  await t.klikk('[data-h="dneste"]');
  await svar(4, true);
  t.sjekk(/Se resultatet/.test(await t.tekst('.dokk [data-h="dneste"]')), "Siste spørsmål skal gå til resultatet");
  await t.klikk('[data-h="dneste"]');
  await t.vent("document.querySelector('.bw-prikker')");
  t.sjekk(/3 av 5 riktige/.test(await t.tekst("#skjerm h1")), `Resultatet viser ikke «3 av 5 riktige» (${await t.tekst("#skjerm h1")})`);
  t.sjekk((await t.antall(".bw-prikker li.ja")) === 3 && (await t.antall(".bw-prikker li.nei")) === 2, "Prikkene viser ikke 3 riktige og 2 feil");
  t.sjekk(/🔥 1 dag på rad/.test(await t.tekst(".bw-dagens-rekke")), "Resultatet viser ikke rekka");
  t.sjekk(/Nye spørsmål om \d\d:\d\d:\d\d/.test(await t.tekst(".bw-nedtelling")), "Resultatet mangler nedtellingen");
  const daglig = (await les("daglig")).bedreviteren;
  t.sjekk(daglig.nr === iDag && daglig.vunnet === true && daglig.rekke === 1 && daglig.res === "3/5" && !daglig.pagar, `rusj.daglig er feil: ${JSON.stringify(daglig)}`);
  await t.bilde("dagens-resultat", true);
  // Share: the number, the score and the dots – never a question or an answer
  await t.js("window.__delt = null; navigator.canShare = undefined; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }");
  await t.klikk('.dokk [data-h="ddel"]', 300);
  const delt = await t.js("window.__delt");
  t.sjekk(delt && delt.url === "https://rusj.no/bedreviteren/#utfordring" && /^Bedreviteren · Dagens fem nr\. \d+ · 3\/5 (?:🟢|🔴){5}$/u.test(delt.text), `Delingsteksten er feil: ${JSON.stringify(delt)}`);
  t.sjekk(delt && delt.text.endsWith("🟢🔴🔴🟢🟢"), `Prikkene i delingen er i feil rekkefølge: ${delt && delt.text}`);
  const fasit = await t.js(`${JSON.stringify(fem)}.flatMap((i) => [${ALLE}[i].s, ...${ALLE}[i].a].filter((x) => x.length > 3))`);
  t.sjekk(delt && !fasit.some((x) => delt.text.includes(x)), "Delingsteksten røper et spørsmål eller svar");
  // A phone that shares files: the result goes as a 1080×1350 PNG card, with the text and the link.
  await t.js("window.__delt = null; navigator.canShare = (d) => !!(d && d.files && d.files.length); navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }");
  const fr = Date.now();
  await t.klikk('.dokk [data-h="ddel"]', 100);
  await t.vent("window.__delt", 5000);
  const ms = Date.now() - fr;
  const kort = await t.js(`(async () => {
    const d = window.__delt;
    const f = d.files && d.files[0];
    if (!f) return { feil: "ingen fil", d: JSON.stringify(d) };
    const bm = await createImageBitmap(f);
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(f); });
    return { navn: f.name, type: f.type, b: bm.width, h: bm.height, tekst: d.text, url: d.url || "", b64 };
  })()`);
  t.sjekk(kort && kort.type === "image/png" && kort.b === 1080 && kort.h === 1350 && kort.navn === "rusj-bedreviteren.png", `Delingskortet er ikke en PNG på 1080×1350: ${JSON.stringify({ ...kort, b64: undefined })}`);
  t.sjekk(kort && /^Bedreviteren · Dagens fem nr\. \d+ · 3\/5 (?:🟢|🔴){5}\nhttps:\/\/rusj\.no\/bedreviteren\/#utfordring$/u.test(kort.tekst), `Teksten ved bildet er feil: ${kort && kort.tekst}`);
  t.sjekk(kort && !fasit.some((x) => kort.tekst.includes(x)), "Teksten ved bildet røper et spørsmål eller svar");
  if (kort && kort.b64) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const mappe = new URL("../../build/", import.meta.url);
    mkdirSync(mappe, { recursive: true });
    writeFileSync(new URL("delkort-bedreviteren.png", mappe), Buffer.from(kort.b64, "base64"));
  }
  t.sjekk(ms < 3000, `Delingskortet tok ${ms} ms`);
  await t.klikk('[data-h="dfasit"]');
  t.sjekk((await t.antall("#ark .bw-fasit li")) === 5, "Fasiten for dagens fem viser ikke fem spørsmål");
  await t.klikk('#ark [data-h="lukk-ark"]');
  // #dagens opens the result; home shows the score, the streak and the countdown
  await t.lastSide(t.side + "#dagens", "document.querySelector('.bw-prikker')");
  t.sjekk(/Dagens fem nr\. \d+/i.test(await t.tekst(".banner .etikett")), "#dagens åpnet ikke resultatet");
  await t.klikk("#tilbake");
  t.sjekk(/✓ 3 av 5 · 🔥 1 dag på rad/.test(await t.tekst('.hjem-knapper [data-h="dagens"]')), `Hjem viser ikke «✓ 3 av 5 · 🔥 1 dag på rad» (${await t.tekst('.hjem-knapper [data-h="dagens"]')})`);
  const tid1 = await t.tekst(".bw-nedtelling b");
  await t.sov(1200);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(tid1) && tid1 !== (await t.tekst(".bw-nedtelling b")), "Nedtellingen på hjem går ikke");
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="nytt"]'), "«Start quiz» skal være hovedknappen når dagens fem er ferdig");
  await t.bilde("hjem-dagens-ferdig");
  // A challenge link (#utfordring): a banner above the main button on home, once.
  await t.lastSide(t.side + "#utfordring", "document.querySelector('.hjem-knapper .utfordring')");
  const utf = await t.js(`(() => { const b = document.querySelector(".hjem-knapper .utfordring"); return { forst: b === document.querySelector(".hjem-knapper").firstElementChild, tekst: b.textContent.trim(), hash: location.hash }; })()`);
  t.sjekk(utf.forst && /Noen utfordret deg på dagens oppgave – klarer du det bedre\?/.test(utf.tekst) && utf.hash === "", `Utfordringsbanneret er feil: ${JSON.stringify(utf)}`);
  await t.bilde("hjem-utfordring");
  await t.sov(420);
  await t.klikk('.hjem-knapper [data-h="dagens"]');
  await t.sov(420);
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.hjem-knapper')");
  t.sjekk(!(await t.finnes(".utfordring")), "Utfordringsbanneret vises igjen etter at hjem-skjermen er forlatt");
  await t.lastSide(t.side, "document.querySelector('.hjem-knapper')");
  t.sjekk(!(await t.finnes(".utfordring")), "Utfordringsbanneret vises igjen etter omlasting");
  // #dagens on a fresh phone opens today's first question
  await t.start();
  await t.lastSide(t.side + "#dagens", "document.querySelector('[data-h=\"dsvar\"]')");
  t.sjekk(/Dagens fem · 1\/5/i.test(await t.tekst("#topp-tittel")), "#dagens åpnet ikke dagens første spørsmål");

  // ---------- Setup ----------
  await t.start({ navn: ["Testspiller A", "Testspiller B", "Testspiller C"] });
  await t.klikk('[data-h="nytt"]');
  await t.bilde("oppsett", true);
  t.sjekk(await t.finnes('.flis[data-h="modus"][aria-pressed="true"]'), "Spillemåten skal velges med store fliser øverst");
  t.sjekk((await t.antall(".spiller")) === 3, "Oppsettet viser ikke tre spillere");
  t.sjekk(!(await t.tilstand()).oppsett.kategorier.includes("barn"), "Barn-kategorien skal ikke være valgt fra start");
  await t.klikk('[data-h="kategori"][data-v="barn"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.includes("barn"), "Barn-kategorien ble ikke valgt");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  t.sjekk((await t.tilstand()).oppsett.kategorier.length === 0, "«Alle» skal kunne velge bort alle kategorier");
  t.sjekk(await t.js(`document.querySelector('[data-h="start"]').disabled`), "Start skal være av uten kategorier");
  await t.klikk('[data-h="kategori"][data-v="*"]');
  await t.klikk('[data-h="kategori"][data-v="barn"]');
  await t.klikk('[data-h="niva"][data-v="blandet"]');
  await t.klikk('[data-h="lengde"][data-v="10"]');

  // ---------- First question ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.bw-kort')");
  await passerKortet("sporsmal");
  await t.bilde("sporsmal");
  let sp = await fase();
  t.sjekk(sp.liste.length === 10, `Runden har ${sp.liste.length} spørsmål, ventet 10`);
  t.sjekk(new Set(sp.liste).size === sp.liste.length, "Samme spørsmål kom to ganger i én runde");
  t.sjekk((await t.antall(".bw-valg")) === 4, "Spørsmålet viser ikke fire svar");
  t.sjekk(!(await t.finnes('[data-h="svar"]')), "Svarene skal ikke være knapper når flere spiller");
  t.sjekk((B0 < 380 ? /^1\/10$/ : /Spørsmål 1 av 10/i).test((await t.tekst("#topp-tittel")).trim()), "Topplinjen viser ikke hvilket spørsmål vi er på");

  await visSvaret();
  await t.bilde("svar");
  t.sjekk((await t.antall(".bw-valg.riktig")) === 1, "Det skal lyse opp nøyaktig ett riktig svar");
  t.sjekk((await t.antall(".bw-valg.dempet")) === 3, "De tre gale svarene skal dempes");
  t.sjekk((await t.tekst(".bw-fakta")).length > 20, "Faktabiten vises ikke");
  t.sjekk((await overToppen(".bw-valg.riktig")) <= 0 && (await underDokka(".bw-fakta")) <= 0, "Riktig svar og faktabiten skal synes uten å scrolle");
  await t.klikk('[data-h="stilling"]');
  t.sjekk(await t.finnes("#ark:not([hidden]) .poengliste"), "Stillingen vises ikke");
  await t.bilde("stillingen");
  await t.klikk('#ark [data-h="lukk-ark"]');

  // Who had it right: its own step
  await t.klikk('[data-h="hvem"]');
  t.sjekk(await t.finnes(".bw-fasitlinje"), "«Hvem hadde rett?» skal vise riktig svar øverst");
  await t.klikk('[data-h="riktig"][data-v="0"]');
  await t.klikk('[data-h="riktig"][data-v="2"]');
  await t.klikk('[data-h="riktig"][data-v="2"]');
  t.sjekk(JSON.stringify((await fase()).riktige) === "[0]", "Å trykke to ganger skal fjerne valget igjen");
  await t.bilde("hvem-hadde-rett");
  await t.klikk('[data-h="neste"]');
  sp = await fase();
  t.sjekk(sp.nr === 1 && sp.treff[0] === 1 && sp.poeng[0] >= 1 && sp.poeng[1] === 0, "Poenget ble ikke gitt til Testspiller A");

  // Undo the scoring, fix it, go on
  t.sjekk(await t.finnes('[data-h="angre"]'), "Mangler «Angre poengene» etter at poeng er gitt");
  await t.bilde("angre");
  await t.klikk('[data-h="angre"]');
  sp = await fase();
  t.sjekk(sp.nr === 0 && sp.fase === "hvem" && sp.poeng[0] === 0 && sp.logg.length === 0, "«Angre» tok ikke poengene tilbake");
  await t.klikk('[data-h="riktig"][data-v="2"]');
  await t.klikk('[data-h="neste"]');
  sp = await fase();
  t.sjekk(sp.nr === 1 && sp.poeng[0] > 0 && sp.poeng[2] > 0, "Poengene etter angring ble feil");

  // ---------- Reload mid-game, back + continue, «Nytt spill» asks first ----------
  await t.lastSide(t.side, "document.querySelector('.bw-kort')");
  t.sjekk((await fase()).nr === 1, "Spillet husket ikke hvor vi var etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(/spørsmål 2 av 10/.test(await t.tekst('.hjem-knapper .knapp[data-h="fortsett"]')), "«Fortsett» skal være hovedknappen mens et spill pågår");
  await t.bilde("hjem-pagar");
  await t.klikk('[data-h="nytt"]');
  t.sjekk(await t.finnes("#ark:not([hidden])"), "«Nytt spill» skal spørre før spillet forsvinner");
  await t.klikk('#ark [data-h="ark-svar"][data-v="nei"]');
  t.sjekk((await fase()) !== null, "Spillet forsvant selv om vi trykket «Avbryt»");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.bw-kort')");

  // The answer survives a reload too
  await visSvaret();
  await t.lastSide(t.side, "document.querySelector('.bw-kort')");
  t.sjekk(await t.finnes(".bw-valg.riktig"), "Svaret var borte etter omlasting");

  // ---------- Play to the end ----------
  for (let i = 1; i < 10; i++) {
    if (i > 1) await visSvaret();
    await t.klikk('[data-h="hvem"]');
    await t.klikk('[data-h="riktig"][data-v="1"]');
    await t.klikk('[data-h="neste"]', 200);
  }
  await t.vent("document.querySelector('.pall')");
  await t.bilde("slutt", true);
  t.sjekk(/Testspiller B.*vinner!/.test(await t.tekst("#skjerm h1")), "Vinnerlinjen «Testspiller B vinner!» vises ikke");
  t.sjekk((await fase()).logg.length === 10, "Loggen har ikke ti spørsmål");
  const kveld = await les("kveld");
  t.sjekk(kveld && kveld.spill.length === 1 && kveld.spill[0].id === "bedreviteren" && kveld.spill[0].resultat[0].navn === "Testspiller B", "Quizen ble ikke registrert i «Kveldens gjeng»");
  t.sjekk(await t.finnes('.dokk a.lenke[href="/"]'), "Slutten mangler lenken «Alle spill»");
  await t.klikk('[data-h="fasit"]');
  t.sjekk((await t.antall("#ark .bw-fasit li")) === 10, "Fasiten viser ikke ti spørsmål");
  await t.bilde("fasit");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="resultat"]'), "Hjem-skjermen mangler «Se kåringen» etter en ferdig quiz");

  // ---------- Solo: tap your own answer ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="2"]');
  await t.klikk('[data-h="spiller-fjern"][data-v="1"]');
  t.sjekk((await t.antall(".spiller")) === 1, "Klarte ikke å gå ned til én spiller");
  await t.klikk('[data-h="niva"][data-v="1"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('[data-h=\"svar\"]')");
  await t.bilde("solo-sporsmal");
  await t.klikk('[data-h="svar"][data-v="2"]');
  await t.vent("document.querySelector('.bw-dom')", 5000);
  await t.bilde("solo-svar");
  sp = await fase();
  t.sjekk(sp.fase === "svar" && sp.valgt === 2, "Solo-svaret ble ikke registrert");
  const traff = await t.finnes(".bw-valg.v2.riktig");
  t.sjekk(traff ? sp.riktige[0] === 0 : sp.riktige.length === 0 && (await t.finnes(".bw-valg.v2.feil")), "Solo-svaret ble ikke vurdert riktig");
  t.sjekk(!(await t.finnes('[data-h="hvem"]')), "Solo skal ikke spørre hvem som hadde rett");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('[data-h=\"svar\"]')");
  await t.klikk('[data-h="vis"]');
  await t.vent("document.querySelector('.bw-dom')", 5000);
  t.sjekk((await fase()).riktige.length === 0, "«Jeg vet ikke» skal gi null poeng");
  for (let i = 2; i < 10; i++) {
    await t.klikk('[data-h="neste"]', 200);
    await t.klikk('[data-h="svar"][data-v="0"]');
    await t.vent("document.querySelector('.bw-dom')", 5000);
  }
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.banner')");
  sp = await fase();
  t.sjekk(new RegExp(`${sp.treff[0]} av 10 riktige`).test(await t.tekst("#skjerm h1")), "Solo-resultatet viser ikke antall riktige");
  t.sjekk(!(await t.finnes(".pall")), "Solo skal ikke vise pall");
  const rekord = (await les("bedreviteren.rekord")) || {};
  t.sjekk(sp.treff[0] === 0 || (rekord["1.10"] === sp.treff[0] && Object.keys(rekord).length === 1), `Rekorden skal lagres per nivå («1.10»): ${JSON.stringify(rekord)}`);
  await t.bilde("solo-slutt", true);

  // ---------- Teams with the clock ----------
  await t.klikk('[data-h="endre"]');
  await t.klikk('[data-h="modus"][data-v="lag"]');
  // Longest category name + hardest level + clock: the tightest top row on the card
  await t.klikk('[data-h="kategori"][data-v="*"]');
  if ((await t.tilstand()).oppsett.kategorier.length) await t.klikk('[data-h="kategori"][data-v="*"]');
  await t.klikk('[data-h="kategori"][data-v="kultur"]');
  await t.klikk('[data-h="niva"][data-v="3"]');
  await t.klikk('[data-h="lag"][data-v="1"]');
  await t.klikk('[data-h="klokke"]');
  await t.bilde("oppsett-lag", true);
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('#bw-klokke')");
  await t.sov(1600);
  const tid = Number(await t.tekst("#bw-klokke .bw-tid"));
  t.sjekk(tid > 0 && tid < 20, `Klokka teller ikke ned (viser ${tid})`);
  await passerKortet("lag-klokke");
  await t.bilde("lag-klokke");
  // When the clock runs out, the answer is shown by itself
  await t.vent("document.querySelector('.bw-valg.riktig')", 25000);
  t.sjekk((await fase()).fase === "svar", "Svaret ble ikke vist da tiden var ute");
  await t.klikk('[data-h="hvem"]');
  await t.klikk('[data-h="riktig"][data-v="2"]');
  await t.bilde("lag-hvem");
  await t.klikk('[data-h="neste"]');
  sp = await fase();
  t.sjekk(sp.modus === "lag" && sp.deltakere === 3 && sp.poeng[2] > 0, "Lag Blå fikk ikke poeng");

  // ---------- Short screens: 320 × 568 and 375 × 560 ----------
  for (const [b, h] of [[320, 568], [375, 560]]) {
    const navn = `${b}x${h}`;
    await t.send("Emulation.setDeviceMetricsOverride", { width: b, height: h, deviceScaleFactor: 2, mobile: true });
    await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
    if ((await fase()).fase === "hvem") await t.klikk('[data-h="neste"]');
    await t.vent("document.querySelector('.bw-kort')");
    await t.sov(300);
    if (b < 380) t.sjekk(/^\d+\/10$/.test((await t.tekst("#topp-tittel")).trim()), "Smal skjerm skal ha kort tittel, som «2/10»");
    t.sjekk((await underDokka(".bw-valgliste li:last-child")) <= 0, `${navn}: alle fire svar skal synes over knappen`);
    await passerKortet(`${navn}-sporsmal`);
    if (b <= B0) await t.bilde(`${navn}-sporsmal`);
    await visSvaret();
    await t.sov(500);
    const bred = await t.js("document.documentElement.scrollWidth - window.innerWidth");
    t.sjekk(bred <= 0, `Siden er ${bred}px for bred på ${navn}`);
    t.sjekk((await overToppen(".bw-valg.riktig")) <= 0 && (await underDokka(".bw-valg.riktig")) <= 0, `${navn}: riktig svar skal synes etter «Vis svaret»`);
    t.sjekk((await underDokka(".bw-fakta p:last-child")) <= 24, `${navn}: faktabiten skal synes etter «Vis svaret»`);
    if (b <= B0) await t.bilde(`${navn}-svar`);
    await t.klikk('[data-h="hvem"]');
    if (b <= B0) await t.bilde(`${navn}-hvem`);
  }
  await t.send("Emulation.setDeviceMetricsOverride", { width: B0, height: H0, deviceScaleFactor: 2, mobile: true });

  // ---------- Tie-break: equal top scores after the last question ----------
  await t.js(`(() => { const sp = Rusj.S.spill; sp.nr = sp.liste.length - 1; sp.fase = "hvem"; sp.riktige = []; sp.poeng = [4, 4, 1]; sp.angre = null; Rusj.gaTil("sporsmal"); })()`);
  await t.vent("document.querySelector('[data-h=\"riktig\"]')");
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.bw-kort')");
  sp = await fase();
  t.sjekk(JSON.stringify(sp.utslag) === "[0,1]" && sp.liste.length === 11 && sp.nr === 10, `Likt på topp ga ikke et utslagsspørsmål (${JSON.stringify(sp.utslag)})`);
  t.sjekk(/Utslag/i.test(await t.tekst("#topp-tittel")) && /Utslagsspørsmål/.test(await t.tekst(".bw-hint")), "Utslagsspørsmålet er ikke merket");
  await t.bilde("utslag");
  await visSvaret();
  await t.klikk('[data-h="hvem"]');
  t.sjekk((await t.antall('[data-h="riktig"]')) === 2, "Bare lagene som står likt, skal kunne få poeng på utslaget");
  await t.klikk('[data-h="riktig"][data-v="1"]');
  await t.klikk('[data-h="neste"]');
  await t.vent("document.querySelector('.pall')");
  t.sjekk(/Lag Gul vinner!/.test(await t.tekst("#skjerm h1")) && /utslagsspørsmål/.test(await t.tekst(".banner .ingress")), "Utslaget avgjorde ikke kåringen");
  t.sjekk((await les("kveld")).spill.length === 2, "Lagquizen ble ikke registrert i «Kveldens gjeng»");
  await t.bilde("utslag-slutt");
  await t.klikk('[data-h="igjen"]');
  await t.vent("document.querySelector('.bw-kort')");
  await visSvaret();

  // ---------- Quit mid-game ----------
  await t.klikk('[data-h="avslutt"]');
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
  await t.vent("document.querySelector('.spillhjem')");
  t.sjekk((await t.tilstand()).spill === null, "Avslutt fjernet ikke spillet");
}
