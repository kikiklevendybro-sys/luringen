// Sporhunden: a trail from another day is dropped for today's; the board shows 6 × 7 letter cells
// under the theme, clear of the dock; a theme word traced with a finger (drag), one tapped letter by
// letter (the last one again), one chosen with the keyboard and «Prøv ordet» are found and stay as
// trails; a too short word is refused; three extra words give a hint (a dashed ring), a second hint
// shows the order; a reload keeps it all; back + «Fortsett dagens spor · …»; the rest solves the day
// (the result shows the words, the countdown and the numbers, and shares paws, never the words);
// #dagens opens the result; an older trail is given up with «Vis svarene»; the classic word search
// is played with a drag, two taps and clicks, and ends with «Godt jobba!». Language-neutral.
export default async function (t) {
  const DAGLIG = t.nokkel("daglig");
  const pause = () => t.sov(420);
  const tilstand = () => t.tilstand();
  const daglig = () => t.js(`JSON.parse(localStorage.getItem("${DAGLIG}") || "{}").sporhunden || null`);
  const sp = async () => {
    const s = await tilstand();
    return s[s.modus];
  };
  const midt = (sel) => t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  // Drag a finger through the centres of the cells (touch events, a few steps between cells).
  const dra = async (celler, rute = ".sh-rute") => {
    await t.js("document.querySelector('#merke-pop') && document.querySelector('#merke-pop').remove()");
    await t.js(`document.querySelector("${rute}").scrollIntoView({ block: "center" })`);
    await t.sov(150);
    const pkt = [];
    for (const c of celler) pkt.push(await midt(`${rute} .sh-celle[data-i="${c}"]`));
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pkt[0]] });
    for (let i = 1; i < pkt.length; i++)
      for (let s = 1; s <= 4; s++) {
        await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pkt[i - 1].x + ((pkt[i].x - pkt[i - 1].x) * s) / 4, y: pkt[i - 1].y + ((pkt[i].y - pkt[i - 1].y) * s) / 4 }] });
        await t.sov(12);
      }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(500);
  };
  // Tap the cells one by one (real taps), then the last one again.
  const trykkOrd = async (celler) => {
    await t.js("document.querySelector('#merke-pop') && document.querySelector('#merke-pop').remove()");
    for (const c of celler) await t.trykk(`.sh-rute .sh-celle[data-i="${c}"]`, 40);
    await t.trykk(`.sh-rute .sh-celle[data-i="${celler[celler.length - 1]}"]`, 40);
    await t.sov(400);
  };
  // Click the cells (a keyboard or a screen reader), then the last one again.
  const klikkOrd = async (celler, rute = ".sh-rute") => {
    for (const c of celler) await t.klikk(`${rute} .sh-celle[data-i="${c}"]`, 30);
    await t.klikk(`${rute} .sh-celle[data-i="${celler[celler.length - 1]}"]`, 200);
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
  t.sjekk((await t.js("Rusj.app._motor.FORSTE")) === (await t.js("Rusj.dag(new Date(Date.UTC(2026, 10, 13, 12))).nr")), "Sporhunden nr. 1 skal være 13. november 2026");
  await t.js(`(() => {
    const S = Rusj.S;
    S.stat = { spilt: 2, vunnet: 2, utenHint: 1, rekke: 2, best: 2, sistVunnet: ${iDag - 1}, sistSpilt: ${iDag - 1} };
    S.dag = { nr: ${iDag - 2}, funnet: [1], ekstra: [], hint: null, hintBrukt: 0, logg: ["o"], lukket: false };
    Rusj.lagre();
  })()`);
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes('.hjem-knapper .knapp.stor[data-h="dag"]'), "Et spor fra en annen dag skal ikke gi «Fortsett» i dag");
  t.sjekk(/2/.test(await t.tekst(".merker")), "Rekka (2 dager på rad) vises ikke");
  await t.bilde("hjem");

  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelectorAll('.sh-rute .sh-celle').length === 42");
  const spor = await t.js(`Rusj.app._spor(${iDag})`);
  t.sjekk((await sp()).nr === iDag && (await sp()).funnet.length === 0, "Dagens spor startet ikke på nytt");
  t.sjekk((await t.tekst(".sh-tema")).includes(spor.t), "Ledetråden vises ikke");
  t.sjekk(await t.friForDokk(".sh-rute"), "Rutenettet ligger bak dokka");
  await t.bilde("brett");

  // The sticker note at the top must not catch the real taps below (it would open the sticker book).
  const utenMerke = () => t.js("document.querySelector('#merke-pop') && document.querySelector('#merke-pop').remove()");
  // 1: a drag
  const ordNr = [1, 2, 3, 4, 5, 6].filter((w) => w < spor.ord.length);
  await dra(spor.stier[ordNr[0]]);
  let s = await sp();
  t.sjekk(s.funnet.includes(ordNr[0]), `Ordet «${spor.ord[ordNr[0]]}» ble ikke funnet med fingeren (${JSON.stringify(s)})`);
  t.sjekk((await t.antall(".sh-rute .sh-celle.funnet")) === spor.stier[ordNr[0]].length, "Sporet etter ordet vises ikke");
  const d0 = await daglig();
  t.sjekk(d0 && d0.pagar && d0.pagar.nr === iDag, `R.dagligIGang ble ikke kalt: ${JSON.stringify(d0)}`);
  await t.bilde("ett-ord");
  // 2: tapped letter by letter
  await pause();
  await utenMerke();
  await trykkOrd(spor.stier[ordNr[1]]);
  t.sjekk((await sp()).funnet.includes(ordNr[1]), `Ordet «${spor.ord[ordNr[1]]}» ble ikke funnet med trykk`);
  // 3: keyboard (Space on focused cells) and «Prøv ordet»
  await pause();
  for (const c of spor.stier[ordNr[2]]) {
    await t.js(`document.querySelector('.sh-rute .sh-celle[data-i="${c}"]').focus()`);
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await t.sov(60);
  }
  t.sjekk(!(await t.js(`document.querySelector("#sh-prov").disabled`)), "«Prøv ordet» er ikke på når ord er valgt");
  await t.klikk("#sh-prov", 400);
  t.sjekk((await sp()).funnet.includes(ordNr[2]), `Ordet «${spor.ord[ordNr[2]]}» ble ikke funnet med tastaturet`);
  // Too short
  await pause();
  const ledig = await t.js(`[...document.querySelectorAll(".sh-rute .sh-celle:not(.funnet)")].map((k) => Number(k.dataset.i))`);
  const par = ledig.flatMap((a) => ledig.filter((b) => b !== a && Math.abs(Math.floor(a / 6) - Math.floor(b / 6)) <= 1 && Math.abs((a % 6) - (b % 6)) <= 1).map((b) => [a, b]))[0];
  await klikkOrd(par);
  t.sjekk((await sp()).funnet.length === 3 && (await t.finnes(".sh-varsel.feil")), "Et ord på to bokstaver ble ikke avvist");

  // Extra words: three give a hint
  const ekstra = await t.js(`(() => {
    const S = Rusj.S; const sp = S.dag; const d = Rusj.app._spor(sp.nr);
    const tatt = new Set(sp.funnet.flatMap((w) => d.stier[w]));
    const ord = window.RUSJ_DATA.spor.ekstra.split(" ");
    const nab = (i) => { const r = Math.floor(i / 6), c = i % 6, u = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { if (!a && !b) continue; const rr = r + a, cc = c + b; if (rr >= 0 && rr < 7 && cc >= 0 && cc < 6) u.push(rr * 6 + cc); } return u; };
    const finn = (o) => { const b = Array.from(o); let ut = null; const gaa = (i, k, sti) => { if (ut) return; if (k === b.length - 1) { ut = sti.slice(); return; } for (const j of nab(i)) if (!tatt.has(j) && !sti.includes(j) && d.celler[j] === b[k + 1]) gaa(j, k + 1, sti.concat(j)); }; for (let i = 0; i < 42 && !ut; i++) if (!tatt.has(i) && d.celler[i] === b[0]) gaa(i, 0, [i]); return ut; };
    const tema = new Set(d.ord);
    const ut = [];
    for (const o of ord) { if (tema.has(o)) continue; const sti = finn(o); if (sti) ut.push({ o, sti }); if (ut.length >= 4) break; }
    return ut;
  })()`);
  if (ekstra.length >= 3) {
    for (const e of ekstra.slice(0, 3)) {
      await pause();
      await klikkOrd(e.sti);
    }
    s = await sp();
    t.sjekk(s.ekstra.length === 3, `Tre ekstraord ble ikke talt: ${JSON.stringify(s.ekstra)}`);
    t.sjekk(!(await t.js(`document.querySelector(".sh-hint").disabled`)), "Hint-knappen er ikke klar etter tre ekstraord");
    await t.klikk(".sh-hint", 300);
    t.sjekk((await t.antall(".sh-rute .sh-celle.hint")) > 0 && (await sp()).hintBrukt === 1, "Hintet ringet ikke inn et ord");
    await t.bilde("hint");
  } else t.sjekk(true, "");

  // Reload, back and continue
  await t.lastSide(t.side, "document.querySelector('.sh-rute')");
  t.sjekk((await sp()).funnet.length === 3 && (await tilstand()).skjerm === "brett", "Ordene forsvant etter omlasting");
  await t.klikk("#tilbake");
  t.sjekk(!t.norsk || (await t.tekst('.hjem-knapper [data-h="dag"]')).includes(`Fortsett dagens spor · 3 av ${spor.ord.length}`), "Hjem viser ikke «Fortsett dagens spor · 3 av …»");
  t.sjekk((await tilstand())._aktiv === true, "Et påbegynt spor er ikke merket som pågående");
  await t.klikk('[data-h="dag"]');
  await t.vent("document.querySelector('.sh-rute')");

  // The rest (the key word last)
  const rest = [...spor.ord.keys()].filter((w) => !(ordNr.slice(0, 3).includes(w)) && w !== 0).concat(0);
  for (const w of rest) {
    await pause();
    await klikkOrd(spor.stier[w]);
    if ((await tilstand()).skjerm !== "brett") break;
  }
  await t.vent("document.querySelector('.skjerm-resultat')", 8000);
  await t.sov(600);
  s = await tilstand();
  t.sjekk(s.dag.funnet.length === spor.ord.length && s.stat.spilt === 3 && s.stat.rekke === 3, `Statistikken er feil: ${JSON.stringify(s.stat)}`);
  const d = await daglig();
  t.sjekk(d && d.nr === iDag && d.vunnet === true && d.rekke === 3 && !d.pagar && d.res.length <= 14, `R.dagligFerdig ble ikke kalt riktig: ${JSON.stringify(d)}`);
  if (t.norsk) t.sjekk(d.res === (s.dag.hintBrukt ? `${s.dag.hintBrukt} hint` : "Uten hint"), `Resultatet er feil: ${d.res}`);
  t.sjekk((await t.antall(".sh-funnetliste li")) === spor.ord.length, "Ordene vises ikke på resultatet");
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".skjerm-resultat .sh-nedtelling b")), "Nedtellingen mangler");
  await t.bilde("resultat", true);
  const delt = await dele();
  const navn = await t.js("window.RUSJ_SPILL.navn");
  t.sjekk(delt && delt.startsWith(navn + " ") && delt.includes(spor.t) && /🐾/.test(delt) && /🦴/.test(delt), `Delingsteksten er feil: ${delt}`);
  t.sjekk(delt && !spor.ord.some((o) => delt.toLowerCase().includes(o)), "Delingsteksten røper et temaord");

  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('.hjem-knapper [data-h="se-resultat"]'), "Hjem viser ikke «Se dagens resultat»");
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-resultat')");
  t.sjekk(await t.finnes(".skjerm-resultat"), "#dagens åpner ikke dagens resultat");

  // An older trail, given up
  if (iDag > (await t.js("Rusj.app._motor.FORSTE"))) {
    await t.klikk('.lenkerad [data-h="arkiv"]');
    await t.vent("document.querySelector('.sh-arkiv')");
    await t.bilde("arkiv");
    await t.klikk(".sh-arkivrad");
    await t.vent("document.querySelector('.sh-rute')");
    await pause();
    await t.klikk('.lenkerad [data-h="vis-svar"]', 300);
    await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 300);
    await t.vent("document.querySelector('.skjerm-resultat')", 4000);
    t.sjekk((await t.antall(".sh-funnetliste li.glemt")) > 0 && (await tilstand()).stat.spilt === 3, "«Vis svarene» viser ikke ordene, eller øvingen telte i statistikken");
    await t.bilde("ov-svar", true);
    await t.klikk('.lenkerad [data-h="hjem"]');
  } else await t.klikk("#tilbake");

  // The classic word search
  await t.vent("document.querySelector('[data-h=\"leting-oppsett\"]')");
  await t.klikk('[data-h="leting-oppsett"]');
  await t.vent("document.querySelector('.fliser')");
  await t.klikk('.flis[data-v="middels"]', 200);
  await t.bilde("oppsett");
  // Choose a theme from the sheet (alphabetical), then back to a random one is a link
  await t.klikk('[data-h="velg-tema"]', 300);
  await t.vent("document.querySelectorAll('#ark .stabel button').length > 300");
  const valgtTema = await t.tekst("#ark .stabel button:nth-child(5)");
  await t.klikk("#ark .stabel button:nth-child(5)", 400);
  t.sjekk((await tilstand()).oppsett.tema >= 0 && (await t.tekst(".sh-temavalg b")) === valgtTema, `Valgt tema vises ikke: ${valgtTema}`);
  await t.klikk('[data-h="tilfeldig-tema"]', 200);
  t.sjekk((await tilstand()).oppsett.tema === -1, "«Tilfeldig tema» virket ikke");
  await t.klikk('.dokk [data-h="start-leting"]');
  await t.vent("document.querySelectorAll('.sh-let .sh-celle').length === 81");
  t.sjekk(await t.friForDokk(".sh-let"), "Ordletingen ligger bak dokka");
  await t.bilde("leting");
  let L = (await tilstand()).leting;
  const linje = (a, b, str) => {
    const ra = Math.floor(a / str), ca = a % str, rb = Math.floor(b / str), cb = b % str;
    const dr = Math.sign(rb - ra), dc = Math.sign(cb - ca);
    const ut = [];
    for (let r = ra, c = ca; ; r += dr, c += dc) {
      ut.push(r * str + c);
      if (r === rb && c === cb) break;
    }
    return ut;
  };
  // A drag along the first word, two taps for the second, clicks for the rest
  await dra(linje(L.plass[0].a, L.plass[0].b, 9), ".sh-let");
  t.sjekk((await tilstand()).leting.funnet.includes(0), `Ordet «${L.plass[0].o}» ble ikke funnet med fingeren`);
  await pause();
  await t.js("document.querySelector('#merke-pop') && document.querySelector('#merke-pop').remove()");
  await t.trykk(`.sh-let .sh-celle[data-i="${L.plass[1].b}"]`, 40);
  await t.trykk(`.sh-let .sh-celle[data-i="${L.plass[1].a}"]`, 40);
  await t.sov(300);
  t.sjekk((await tilstand()).leting.funnet.includes(1), `Ordet «${L.plass[1].o}» ble ikke funnet med to trykk (baklengs)`);
  await t.bilde("leting-to");
  for (let i = 2; i < L.plass.length; i++) {
    await pause();
    await t.klikk(`.sh-let .sh-celle[data-i="${L.plass[i].a}"]`, 40);
    await t.klikk(`.sh-let .sh-celle[data-i="${L.plass[i].b}"]`, 200);
  }
  await t.vent("document.querySelector('.skjerm-letferdig')", 6000);
  await t.sov(500);
  L = (await tilstand()).leting;
  t.sjekk(L.ferdig && L.funnet.length === L.plass.length, "Ordletingen ble ikke ferdig");
  await t.bilde("leting-ferdig", true);
  await t.klikk('.dokk [data-h="start-leting"]');
  await t.vent("document.querySelectorAll('.sh-let .sh-celle').length === 81");
  t.sjekk(!(await tilstand()).leting.ferdig, "«Spill igjen» lagde ikke et nytt brett");
  await t.klikk('[data-h="avslutt-leting"]', 300);
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 400);
  t.sjekk((await tilstand()).skjerm === "hjem" && (await t.finnes('[data-h="fortsett-leting"]')), "«Avslutt» ga ikke «Fortsett ordletingen» på hjem");

  await t.klikk("#reglerknapp");
  t.sjekk(await t.finnes("#ark h2, #ark h3"), "Reglene åpnet ikke");
  await t.klikk('#ark [data-h="lukk-ark"]');
}
