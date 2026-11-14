// Musa (maze). Runs in every edition: texts are checked in Norwegian only (t.norsk).
// 1 Home, rules, setup with four sizes (small maze picked first).
// 2 A middle maze: a wall stops the mouse; arrow keys run along the corridors; a reload and back +
//   «Fortsett» keep the mouse and the crumbs; «Vis veien» shows dots; the arrows under the board
//   finish it; the result has a time and a record.
// 3 «Ny labyrint»: a swipe, dragging the mouse and a tap all move it.
// 4 The giant maze fits the screen with cells big enough, is solved, and gives the sticker.
export default async function (t) {
  const spillet = async () => (await t.tilstand()).spill;
  const mal = (sp) => sp.str * sp.str - 1;
  // The directions of the way from the mouse to the cheese, one per corridor run.
  const veien = () =>
    t.js(`(() => {
      const sp = Rusj.S.spill, L = Musa.labyrint();
      const vei = Musa.Labyrint.vei(L, sp.pos, sp.str * sp.str - 1);
      const ut = []; let a = sp.pos;
      for (const c of vei) { ut.push(Musa.Labyrint.retning(L, a, c)); a = c; }
      return ut;
    })()`);
  const tast = (key) => t.js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }))`);
  const TAST = { opp: "ArrowUp", ned: "ArrowDown", venstre: "ArrowLeft", hoyre: "ArrowRight" };
  // Run towards the cheese with keys (or the arrows under the board) until it is found or n runs are made.
  // forMal: stop before the run that would reach the cheese.
  async function lop(n, medKnapper, forMal) {
    for (let i = 0; i < n; i++) {
      const sp = await spillet();
      if (!sp || sp.pos === mal(sp)) return;
      const [r] = await veien();
      if (forMal && (await t.js(`(() => { const s = Rusj.S.spill, v = Musa.Labyrint.glid(Musa.labyrint(), s.pos, ${JSON.stringify(r)}, s.str * s.str - 1); return v[v.length - 1] === s.str * s.str - 1; })()`))) return;
      if (medKnapper) await t.klikk(`[data-h="gaa"][data-v="${r}"]`, 40);
      else await tast(TAST[r]);
      await t.sov(40);
    }
  }
  const brettFarPlass = async (hvor) => {
    t.sjekk(await t.friForDokk(".mu-brett"), `Labyrinten ligger under pilene (${hvor})`);
    t.sjekk(await t.js("document.documentElement.scrollHeight <= window.innerHeight + 1"), `Siden scroller på labyrinten (${hvor})`);
    const b = await t.js(`(() => { const r = document.querySelector(".mu-brett").getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, left: r.left, right: r.right }; })()`);
    t.sjekk(b.left >= 0 && b.right <= (await t.js("window.innerWidth")) && b.top >= 0, `Labyrinten stikker utenfor skjermen (${hvor}: ${JSON.stringify(b)})`);
    return b;
  };
  // A touch gesture from one point to another (CSS px).
  async function beroring(fra, til, steg = 8) {
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fra.x, y: fra.y }] });
    for (let i = 1; i <= steg; i++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: fra.x + ((til.x - fra.x) * i) / steg, y: fra.y + ((til.y - fra.y) * i) / steg }] });
      await t.sov(16);
    }
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(450);
  }
  const musSentrum = () => t.js(`(() => { const b = document.querySelector(".mu-figur").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  const celle = () => t.js(`(() => { const b = document.querySelector(".mu-brett").getBoundingClientRect(); return b.width / (Rusj.S.spill.str + 1); })()`);
  const VEKTOR = { opp: [0, -1], ned: [0, 1], venstre: [-1, 0], hoyre: [1, 0] };

  // ---------- 1 Home, rules, setup ----------
  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  await t.bilde("hjem");
  await t.klikk("#reglerknapp");
  await t.bilde("regler");
  await t.klikk('#ark [data-h="lukk-ark"]');
  await t.klikk('[data-h="nytt"]');
  t.sjekk((await t.antall('[data-h="str"]')) === 4, "Oppsettet skal ha fire størrelser");
  t.sjekk((await t.js(`document.querySelector('[data-h="str"][data-v="5"]').getAttribute("aria-pressed")`)) === "true", "Den lille labyrinten er ikke valgt fra start");
  t.sjekk(!t.norsk || (await t.tekst("#skjerm h1")).trim() === "Gjør klart", "Oppsettet heter ikke «Gjør klart»");
  await t.bilde("oppsett", true);
  await t.klikk('[data-h="str"][data-v="7"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.mu-brett')");
  await t.sov(400);
  await brettFarPlass("7 × 7");
  await t.bilde("spill");

  // ---------- 2 A middle maze ----------
  // The start is the top-left corner: up and left are always hedges.
  await tast("ArrowUp");
  await tast("ArrowLeft");
  await t.sov(200);
  let sp = await spillet();
  t.sjekk(sp.pos === 0 && sp.steg === 0, `Musa gikk gjennom en hekk (${sp.pos}, ${sp.steg} steg)`);
  // Two runs along the way, then a reload: the mouse and the crumbs stay.
  await lop(2, false, true);
  await t.sov(900);
  sp = await spillet();
  t.sjekk(sp.pos !== 0 && sp.steg > 0 && sp.spor[sp.spor.length - 1] === sp.pos && sp.spor[0] === 0, `Piltastene flyttet ikke musa (${JSON.stringify({ pos: sp.pos, steg: sp.steg })})`);
  await t.bilde("underveis");
  const for_ = { pos: sp.pos, spor: sp.spor.join() };
  await t.lastSide(t.side, "document.querySelector('#skjerm h1')");
  await t.vent("document.querySelector('.mu-brett')");
  sp = await spillet();
  t.sjekk(sp.pos === for_.pos && sp.spor.join() === for_.spor, "Musa eller prikkene forsvant etter omlasting");
  t.sjekk(
    await t.js(`(() => { const s = Rusj.S.spill, L = Musa.labyrint(), b = document.querySelector(".mu-brett").getBoundingClientRect(), f = document.querySelector(".mu-figur").getBoundingClientRect(); const u = b.width / (s.str + 1); const x = (f.left + f.width / 2 - b.left) / u - 0.5, y = (f.top + f.height / 2 - b.top) / u - 0.5; return Math.abs(x - (s.pos % s.str + 0.5)) < 0.3 && Math.abs(y - (Math.floor(s.pos / s.str) + 0.5)) < 0.3; })()`),
    "Musa står ikke der den skal etter omlasting",
  );
  await t.klikk("#tilbake");
  t.sjekk(await t.finnes('[data-h="fortsett"]'), "Mangler «Fortsett» etter å ha gått tilbake");
  await t.bilde("hjem-fortsett");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelector('.mu-brett')");
  t.sjekk((await spillet()).pos === for_.pos, "«Fortsett» startet en ny labyrint");
  // «Vis veien»
  await t.klikk('[data-h="hint"]', 300);
  t.sjekk(await t.finnes(".mu-hint.vis"), "«Vis veien» viser ingen prikker");
  t.sjekk((await spillet()).hjelp === 1, "«Vis veien» ble ikke telt");
  await t.bilde("vis-veien");
  // The arrows under the board finish it.
  await lop(60, true);
  await t.vent("document.querySelector('.skjerm-slutt')", 8000);
  await t.sov(500);
  await t.bilde("funnet", true);
  let s = await t.tilstand();
  t.sjekk(s.spill.ferdig && s.rekorder["7"] && s.rekorder["7"].sek >= 1 && s.funnet === 1, `Resultatet ble ikke lagret (${JSON.stringify({ r: s.rekorder, f: s.funnet })})`);
  t.sjekk(!t.norsk || /Du fant osten/.test(await t.tekst("#skjerm h1")), "Resultatet sier ikke «Du fant osten!»");
  t.sjekk(await t.finnes('.dokk [data-h="igjen"]'), "Mangler «Ny labyrint» i dokken");

  // ---------- 3 Swipe, drag, tap ----------
  await t.klikk('.dokk [data-h="igjen"]');
  await t.vent("document.querySelector('.mu-brett')");
  await t.sov(400);
  sp = await spillet();
  t.sjekk(sp.pos === 0 && sp.steg === 0 && sp.str === 7, "«Ny labyrint» startet ikke en ny labyrint i samme størrelse");
  // A swipe on the board (away from the mouse) in the first direction of the way.
  let [r] = await veien();
  const b = await t.js(`(() => { const r = document.querySelector(".mu-flate").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await beroring(b, { x: b.x + VEKTOR[r][0] * 90, y: b.y + VEKTOR[r][1] * 90 });
  await t.sov(700);
  sp = await spillet();
  t.sjekk(sp.pos !== 0, `Sveipet flyttet ikke musa (${r})`);
  // (A maze that is one long corridor is finished by the swipe: then there is nothing to drag.)
  if (!sp.ferdig) {
    // Drag the mouse one cell along the way.
    [r] = await veien();
    const fra = await musSentrum();
    const u = await celle();
    const forPos = sp.pos;
    await beroring(fra, { x: fra.x + VEKTOR[r][0] * u, y: fra.y + VEKTOR[r][1] * u }, 6);
    await t.sov(300);
    sp = await spillet();
    t.sjekk(sp.pos !== forPos, "Musa ble ikke med da den ble dratt");
    // A tap ahead of the mouse.
    [r] = await veien();
    if (!r) r = "venstre";
    const m = await musSentrum();
    const forTrykk = sp.pos;
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: m.x + VEKTOR[r][0] * u * 1.6, y: m.y + VEKTOR[r][1] * u * 1.6 }] });
    await t.sov(60);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(700);
    t.sjekk(sp.ferdig || (await spillet()).pos !== forTrykk, "Et trykk foran musa flyttet den ikke");
  }

  // ---------- 4 The giant maze ----------
  await t.klikk("#tilbake");
  await t.klikk('[data-h="nytt"]');
  if (!(await spillet()).ferdig) {
    await t.vent(`document.querySelector('#ark [data-h="ark-svar"][data-v="ja"]')`);
    await t.bilde("bekreft-nytt");
    await t.klikk('#ark [data-h="ark-svar"][data-v="ja"]', 400);
  }
  await t.vent("document.querySelector('[data-h=\"str\"]')");
  await t.klikk('[data-h="str"][data-v="14"]');
  await t.klikk('[data-h="start"]');
  await t.vent("document.querySelector('.mu-brett')");
  await t.sov(400);
  const stor = await brettFarPlass("14 × 14");
  t.sjekk(stor.w / 15 >= 17, `Rutene i den kjempestore labyrinten er for små (${Math.round(stor.w / 15)} px)`);
  await t.bilde("kjempestor");
  await lop(400);
  await t.vent("document.querySelector('.skjerm-slutt')", 15000);
  await t.sov(600);
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(!!merker["musa-ost"], "Klistremerket «Ostejeger» ble ikke gitt for en stor labyrint");
  await t.bilde("kjempestor-funnet");
  await t.klikk("#tilbake");
  await t.vent("document.querySelector('.mu-rekorder')");
  t.sjekk((await t.antall(".mu-rekorder li")) === 2, "Hjem viser ikke rekordene for begge størrelsene");
  await t.bilde("hjem-rekorder", true);
}
