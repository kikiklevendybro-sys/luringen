// Admiralen: against the computer – place the fleet (dice, select + turn, tap to move, drag with
// the mouse), fire (aim + «Fyr!», and a second tap on the same cell), watch the computer's turn,
// reload and back + continue mid-battle, sink the whole enemy fleet and reach «Kåringen» with the
// score. Then two players on one phone: gates between placements and turns, the other fleet never
// visible, and a win for one of them.
const flate = (t, s) => t.js(`JSON.parse(localStorage.getItem("rusj.admiralen.v1")).spill.flate[${s}]`);

// Cells of a ship, as the game counts them.
const celler = (s, n) => Array.from({ length: s.lengde }, (_, k) => (s.y + (s.r === "v" ? k : 0)) * n + s.x + (s.r === "h" ? k : 0));

// The board must sit above the dock, also on small phones.
const overDokken = (t, sel) =>
  t.js(`(() => {
    window.scrollTo(0, 0);
    const el = document.querySelector(${JSON.stringify(sel)});
    const dokk = document.querySelector("#skjerm .dokk");
    if (!el || !dokk) return true;
    // Like t.friForDokk: on a landscape phone the dock may stand beside the content instead of under it
    const a = el.getBoundingClientRect();
    const d = dokk.getBoundingClientRect();
    if (a.right <= d.left + 1 || a.left >= d.right - 1) return a.bottom <= window.innerHeight + 1;
    return a.bottom <= d.top + 1;
  })()`);

async function ja(t) {
  await t.vent("document.querySelector('#ark:not([hidden]) [data-h=\"ark-svar\"][data-v=\"ja\"]')");
  await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
}

// Wait until it is the player's turn again (the computer may fire a few times).
const minTur = (t, s = 0) =>
  t.vent(`(() => { const sp = JSON.parse(localStorage.getItem("rusj.admiralen.v1")).spill; return !sp || sp.vinner != null || (sp.tur === ${s} && !document.querySelector(".ad-melding.venter")); })()`, 15000);

export default async function (t) {
  await t.start({ navn: ["Testspiller A", "Testspiller B"] });
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()"); // no "install as an app" sheet in the scripted run
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelector('.skjerm-oppsett')");
  await t.klikk('[data-h="niva"][data-v="lett"]');
  t.sjekk((await t.tilstand()).oppsett.niva === "lett", "Nivået ble ikke valgt");
  await t.klikk('[data-h="ekstra"]');
  t.sjekk((await t.tilstand()).oppsett.ekstra === true, "«Treff gir et skudd til» ble ikke slått på");
  await t.bilde("oppsett", true);

  // ---------- Placement ----------
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.ad-plassering')");
  t.sjekk((await t.antall(".ad-plassering .ad-rute")) === 100, "Brettet har ikke 10 × 10 ruter");
  t.sjekk((await t.antall(".ad-plassering .ad-rute.skip")) === 17, "Flåten er ikke plassert (17 ruter)");
  t.sjekk(await overDokken(t, ".ad-plassering"), "Brettet ligger bak «Klar!»-knappen");
  await t.bilde("plasser");
  const for_ = JSON.stringify(await flate(t, 0));
  await t.klikk('[data-h="tilfeldig"]');
  t.sjekk(JSON.stringify(await flate(t, 0)) !== for_, "«Tilfeldig» flyttet ikke skipene");
  // Select the destroyer in the list and turn it (the game moves it inside the board if needed)
  await t.klikk('[data-h="velg-skip"][data-v="4"]');
  const torpedo = (await flate(t, 0))[4];
  await t.klikk('[data-h="snu"]');
  const snudd = (await flate(t, 0))[4];
  t.sjekk(snudd.r !== torpedo.r || (await t.js("document.querySelector('#toast').textContent")).length > 0, "«Snu skipet» gjorde ingenting");
  await t.bilde("plasser-valgt");
  // Tap an empty cell far from the others: the selected ship moves there if it fits
  const ledig = await t.js(`(() => {
    const sp = JSON.parse(localStorage.getItem("rusj.admiralen.v1")).spill;
    const n = sp.n; const f = sp.flate[0]; const s = f[4];
    const opptatt = new Set(); f.forEach((x, k) => { if (k === 4) return; for (let j = 0; j < x.lengde; j++) opptatt.add((x.y + (x.r === "v" ? j : 0)) * n + x.x + (x.r === "h" ? j : 0)); });
    const nabo = (c) => { const x = c % n, y = Math.floor(c / n); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < n && ny < n && opptatt.has(ny * n + nx)) return true; } return false; };
    for (let i = 0; i < n * n; i++) { const x = i % n, y = Math.floor(i / n); const cs = []; for (let j = 0; j < s.lengde; j++) cs.push((y + (s.r === "v" ? j : 0)) * n + x + (s.r === "h" ? j : 0));
      // (not on the selected ship itself: tapping it again turns it instead of moving it)
      const egne = new Set(Array.from({ length: s.lengde }, (_, j) => (s.y + (s.r === "v" ? j : 0)) * n + s.x + (s.r === "h" ? j : 0)));
      if ((s.r === "h" ? x + s.lengde <= n : y + s.lengde <= n) && cs.every((c) => !nabo(c)) && !egne.has(i) && !(x === s.x && y === s.y)) return i; }
    return -1; })()`);
  if (ledig >= 0) {
    await t.klikk(`[data-h="plass-celle"][data-v="${ledig}"]`);
    const flyttet = (await flate(t, 0))[4];
    t.sjekk(flyttet.y * 10 + flyttet.x === ledig, `Skipet ble ikke flyttet til ruta (${JSON.stringify(flyttet)})`);
  }
  // Drag a ship with the mouse: it either moves to a free spot or goes back – never breaks the rules
  const f0 = await flate(t, 0);
  const forste = celler(f0[1], 10)[0];
  await t.sveip(`[data-h="plass-celle"][data-v="${forste}"]`, -70);
  const f1 = await flate(t, 0);
  t.sjekk(f1.length === 5 && f1.every((s) => s.x >= 0 && s.y >= 0), "Dra-og-slipp ødela flåten");
  await t.klikk('[data-h="klar"]');

  // ---------- Battle against the computer ----------
  await t.vent("document.querySelector('.skjerm-kamp .ad-brett.mal')");
  t.sjekk((await t.antall(".ad-brett.mal .ad-rute.skip")) === 0, "Fiendens skip vises på kartet!");
  t.sjekk(await overDokken(t, ".ad-brett.mal"), "Fiendens farvann ligger bak «Fyr!»-knappen");
  await t.bilde("kamp");
  // Keyboard: arrow keys move between the cells
  await t.js(`document.querySelector('.ad-brett.mal [data-celle="0"]').focus()`);
  for (const type of ["keyDown", "keyUp"]) await t.send("Input.dispatchKeyEvent", { type, key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  for (const type of ["keyDown", "keyUp"]) await t.send("Input.dispatchKeyEvent", { type, key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
  t.sjekk((await t.js("document.activeElement && document.activeElement.dataset.celle")) === "11", "Piltastene flytter ikke fokus mellom rutene");
  const fiende = await flate(t, 1);
  const skipRuter = new Set(fiende.flatMap((s) => celler(s, 10)));
  const vann = Array.from({ length: 100 }, (_, i) => i).filter((i) => !skipRuter.has(i));
  // A miss: aim, then fire with the button
  await t.klikk(`[data-h="sikt"][data-v="${vann[0]}"]`);
  t.sjekk(/Fyr på/.test(await t.tekst('[data-h="fyr"]')), "«Fyr»-knappen sier ikke hvor det siktes");
  await t.bilde("sikte");
  await t.klikk('[data-h="fyr"]');
  t.sjekk((await t.tilstand()).spill.skudd[0].length === 1, "Skuddet ble ikke avfyrt");
  await t.vent("document.querySelector('.ad-melding.venter, .ad-melding')");
  await t.sov(400);
  await t.bilde("bom");
  await minTur(t);
  let S = await t.tilstand();
  t.sjekk(S.spill.skudd[1].length >= 1, "Datamaskinen skjøt ikke");
  await t.bilde("maskin-skjot");
  // Reload mid-battle, back + «Fortsett»
  await t.lastSide(t.side, "document.querySelector('.skjerm-kamp')");
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» midt i slaget");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.skjerm-kamp')");
  await minTur(t);

  // Sink everything: hits give another shot. The first hit with a double tap on the same cell.
  const mal = fiende.flatMap((s) => celler(s, 10));
  for (let k = 0; k < mal.length; k++) {
    await minTur(t);
    if ((await t.tilstand()).spill.vinner != null) break;
    const i = mal[k];
    if (k === 0) {
      await t.klikk(`[data-h="sikt"][data-v="${i}"]`, 120);
      await t.klikk(`[data-h="sikt"][data-v="${i}"]`, 200);
    } else {
      await t.klikk(`[data-h="sikt"][data-v="${i}"]`, 60);
      await t.klikk('[data-h="fyr"]', 120);
    }
    if (k === 1) await t.bilde("treff");
    if (k === 4) {
      t.sjekk((await t.antall(".ad-brett.mal .ad-rute.senket")) === 5, "Hangarskipet vises ikke som senket");
      t.sjekk((await t.antall(".ad-brett.mal .ad-rute.vann")) > 0, "Vannet rundt det senkede skipet er ikke merket");
      await t.bilde("senket");
    }
  }
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  S = await t.tilstand();
  t.sjekk(S.spill.vinner === 0, "Spilleren vant ikke selv om alle skip ble senket");
  t.sjekk(/vinner!/.test(await t.tekst("#skjerm h1")), "Kåringen viser ikke vinneren");
  t.sjekk(await t.finnes('.skjerm-slutt a[href="/"]'), "Kåringen mangler «Alle spill»");
  const stilling = Object.values(S.stilling)[0];
  t.sjekk(stilling && stilling[0] === 1 && stilling[1] === 0, `Stillingen ble ikke talt: ${JSON.stringify(S.stilling)}`);
  await t.bilde("slutt", true);
  await t.klikk("#tilbake");
  t.sjekk(!(await t.finnes('[data-h="fortsett"]')), "Et ferdig slag vises fortsatt som «Fortsett»");

  // ---------- Two players on one phone ----------
  await t.klikk('[data-h="nytt"]');
  await t.klikk('[data-h="modus"][data-v="to"]');
  await t.klikk('[data-h="brett"][data-v="8"]');
  await t.klikk('[data-h="ekstra"]');
  t.sjekk((await t.tilstand()).oppsett.ekstra === false, "«Treff gir et skudd til» ble ikke slått av");
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(!(await t.finnes(".ad-brett")), "Porten viser et brett");
  await t.bilde("to-port");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.ad-plassering')");
  t.sjekk((await t.antall(".ad-plassering .ad-rute")) === 64, "Rask kamp har ikke 8 × 8 ruter");
  await t.klikk('[data-h="klar"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(/Testspiller B|x-q/.test(await t.tekst("#skjerm h1")), "Mobilen går ikke videre til spiller B");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.ad-plassering')");
  await t.bilde("to-plasser-b");
  await t.klikk('[data-h="klar"]');
  await t.vent("document.querySelector('.gi-til')");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.skjerm-kamp')");
  S = await t.tilstand();
  const a = S.spill.ser;
  t.sjekk((await t.antall(".ad-brett.mal .ad-rute.skip")) === 0, "Motstanderens skip vises i to-spiller");
  const motFlate = S.spill.flate[1 - a];
  const motRuter = new Set(motFlate.flatMap((s) => celler(s, 8)));
  const bom = Array.from({ length: 64 }, (_, i) => i).find((i) => !motRuter.has(i));
  await t.klikk(`[data-h="sikt"][data-v="${bom}"]`);
  await t.klikk('[data-h="fyr"]');
  await t.vent("document.querySelector('[data-h=\"bytt\"]')");
  await t.bilde("to-bytt");
  await t.klikk('[data-h="bytt"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(!(await t.finnes(".ad-brett")), "Porten mellom turene viser et brett");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.skjerm-kamp')");
  S = await t.tilstand();
  t.sjekk(S.spill.ser === 1 - a, "Det ble ikke den andre spillerens tur");
  // The second player's own fleet is the one drawn on the small board
  const egne = await t.antall(".ad-egen .ad-rute.skip");
  t.sjekk(egne === 12, `Den lille kartet viser ikke egen flåte (${egne} ruter)`);
  await t.bilde("to-kamp");
  // Fast forward: every ship of the first player but one cell already hit by the second player
  const b = 1 - a;
  const aRuter = S.spill.flate[a].flatMap((s) => celler(s, 8));
  await t.js(`(() => { const k = "rusj.admiralen.v1"; const s = JSON.parse(localStorage.getItem(k)); s.spill.skudd[${b}] = ${JSON.stringify(aRuter.slice(0, -1))}; localStorage.setItem(k, JSON.stringify(s)); })()`);
  // A reload never opens a secret fleet directly: the gate comes first
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  t.sjekk(await t.finnes(".gi-til") && !(await t.finnes(".ad-brett")), "Omlasting i to-spiller åpnet en flåte uten «Gi mobilen til»");
  // … and so does «Fortsett» on the home screen
  await t.klikk("#tilbake");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.gi-til')");
  t.sjekk(!(await t.finnes(".ad-brett")), "«Fortsett» i to-spiller åpnet en flåte uten «Gi mobilen til»");
  await t.klikk('[data-h="jeg-er"]');
  await t.vent("document.querySelector('.skjerm-kamp')");
  await t.klikk(`[data-h="sikt"][data-v="${aRuter[aRuter.length - 1]}"]`);
  await t.klikk('[data-h="fyr"]');
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  t.sjekk(/vinner!/.test(await t.tekst("#skjerm h1")), "To-spiller-kåringen viser ikke vinneren");
  t.sjekk(await t.js(`(() => { const k = JSON.parse(localStorage.getItem("rusj.kveld") || "null"); return !!(k && k.spill.some((s) => s.id === "admiralen")); })()`), "Slaget ble ikke registrert i «Kveldens gjeng»");
  await t.bilde("to-slutt", true);
}
