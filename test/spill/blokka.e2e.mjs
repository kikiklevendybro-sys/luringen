// Blokka (block puzzle, 8 × 8): free play with a real touch drag (the piece floats above the
// finger, the shadow and the lines it would clear show before the drop) that clears a row, a tap
// on a piece and then a cell, the keyboard (1–3, arrows, Enter), one undo per set of three, the
// board as text for a screen reader, a reload mid-game, and game over (the pieces that don't fit
// are marked, then the result, which can take the last piece back). «Dagens blokk»: the day's
// pieces from the date, no undo, progress to the front page, a reload, the result with streak and
// a live countdown, a share without the board, and #dagens. The board and the tray fit the screen
// (portrait: the tray under the board; landscape: board left, pieces right).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/blokka/spill.js"), "utf8"), kontekst);
const B = kontekst.window.Blokka.Blokk;

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const S = () => t.tilstand();
  const fri = async () => (await S()).fri;
  const geo = () =>
    t.js(`(() => { const r = document.querySelectorAll(".bk-ruter i"); const a = r[0].getBoundingClientRect(), b = r[1].getBoundingClientRect(); return { x: a.left, y: a.top, c: a.width, steg: b.left - a.left }; })()`);
  const tom = (n = 64) => new Array(n).fill(0);
  const sjakk = () => Array.from({ length: 64 }, (_, i) => (((i % 8) + Math.floor(i / 8)) % 2 ? 4 : 0));

  // A known position in the game on the screen, saved and reloaded like a real one.
  async function sett(hvilket, endring) {
    await t.js(`(() => { const sp = Rusj.S.${hvilket}; Object.assign(sp, ${JSON.stringify(endring)}); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelectorAll('.bk-ruter i').length === 64");
    await pause();
  }
  // A real touch drag: from piece i in the tray to the cell (cx, cy) as the piece's top-left.
  async function dra(i, id, cx, cy, sjekk) {
    const g = await geo();
    const f = B.FORMER[id];
    const gap = g.steg - g.c;
    const pw = f.b * g.steg - gap;
    const ph = f.h * g.steg - gap;
    const mal = { x: g.x + cx * g.steg + pw / 2, y: g.y + cy * g.steg + ph + 64 };
    const fra = await t.js(`(() => { const b = document.querySelector('.bk-brikke[data-v="${i}"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fra.x, y: fra.y }] });
    for (let k = 1; k <= 10; k++) {
      await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: fra.x + ((mal.x - fra.x) * k) / 10, y: fra.y + ((mal.y - fra.y) * k) / 10 }] });
      await t.sov(16);
    }
    await t.sov(60);
    if (sjekk) await sjekk(mal);
    await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await t.sov(300);
  }
  // A tap on a cell of the board.
  const celle = (x, y) => `.bk-ruter i:nth-child(${y * 8 + x + 1})`;
  async function tast(key, kode) {
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: kode, ...(key.length === 1 ? { text: key } : {}) });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: kode });
    await t.sov(80);
  }
  const si = () => t.js("document.querySelector('#si').textContent");
  const fylteSkjerm = () => t.antall(".bk-ruter i.fylt");
  const fylte = (b) => b.filter(Boolean).length;

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const dag = await t.js("Rusj.dag()");

  // ----- Home -----
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .bk-kal'), "Dagens blokk er ikke hovedknappen på hjemskjermen");
  t.sjekk(/Spill fritt/.test(await t.tekst('[data-h="nytt"]')), "Mangler «Spill fritt» på hjemskjermen");
  await t.bilde("hjem");

  // ----- Free play -----
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelectorAll('.bk-ruter i').length === 64 && document.querySelectorAll('.bk-brikke').length === 3");
  await pause();
  let s = await fri();
  t.sjekk(s && s.tilbud.length === 3 && s.tilbud.every((id) => B.FORMER[id]) && fylte(s.brett) === 0, "Et nytt spill har ikke tomt brett og tre brikker");
  t.sjekk(!(await t.finnes('[data-h="angre"]:not([disabled])')), "Angre er mulig før første brikke");
  await t.bilde("start");

  // Row 1 lacks two cells; a horizontal 2 dragged there clears it.
  const start = tom();
  for (let x = 2; x < 8; x++) start[x] = 4;
  for (const x of [0, 2, 4, 6]) start[56 + x] = 6;
  await sett("fri", { brett: start, tilbud: ["2h", "o4", "1"], sett: 0, poeng: 0, linjer: 0, lagt: 1, rekke: 0, siden: 0, forrige: null, angretSett: -1 });
  t.sjekk((await fylteSkjerm()) === 10, "Brettet tegnes ikke fra lagret tilstand");
  // The board for a screen reader: one short line per row.
  const linjer = await t.js(`Array.from(document.querySelectorAll("#bk-tekst li")).map((l) => l.textContent)`);
  t.sjekk(linjer.length === 8 && linjer[0] === "Rad 1: 3–8" && linjer[1] === "Rad 2: tom" && linjer[7] === "Rad 8: 1, 3, 5, 7", `Brettet som tekst for skjermleser er feil: ${linjer.join(" | ")}`);
  t.sjekk(/Brikke 1: Strek på 2, liggende, 2 ruter/.test(await t.js(`document.querySelector('.bk-brikke[data-v="0"]').getAttribute("aria-label")`)), "Brikkene har ikke navn for skjermleser");

  await dra(0, "2h", 0, 0, async (mal) => {
    const m = await t.js(`(() => {
      const sv = document.querySelector(".bk-sveve");
      const b = sv && sv.getBoundingClientRect();
      return { sveve: !!sv, bunn: b ? b.bottom : 0, skygge: document.querySelectorAll(".bk-ruter i.skygge").length, snart: document.querySelectorAll(".bk-ruter i.snart").length };
    })()`);
    t.sjekk(m.sveve && m.bunn < mal.y - 30, `Brikken løftes ikke over fingeren mens den dras (bunn ${Math.round(m.bunn)}, finger ${Math.round(mal.y)})`);
    t.sjekk(m.skygge === 2 && m.snart === 8, `Skyggen eller raden som ryddes vises ikke under draget (skygge ${m.skygge}, snart ${m.snart})`);
    await t.bilde("dra");
  });
  s = await fri();
  t.sjekk(s.tilbud[0] === null && s.linjer === 1 && s.poeng === 12 && s.rekke === 1, `Draget ryddet ikke raden (poeng ${s.poeng}, linjer ${s.linjer})`);
  t.sjekk(s.brett.slice(0, 8).every((v) => v === 0) && !(await t.finnes(".bk-sveve")), "Raden ble ikke tømt, eller brikken henger igjen");
  await t.sov(60);
  t.sjekk(/Strek på 2, liggende lagt i rad 1, kolonne 1\. Rad 1 ryddet\. Pluss 12\. 12 poeng\./.test(await si()), `Plasseringen leses ikke opp: «${await si()}»`);
  t.sjekk(await t.finnes('[data-h="angre"]:not([disabled])'), "Angre er ikke mulig etter første brikke");

  // Tap a piece, then a cell: the 2 × 2 lands around the tapped cell.
  await t.trykk('.bk-brikke[data-v="1"]');
  t.sjekk((await t.js(`document.querySelector('.bk-brikke[data-v="1"]').getAttribute("aria-pressed")`)) === "true", "Brikken ble ikke valgt med et trykk");
  await t.bilde("valgt");
  await t.trykk(celle(3, 3));
  s = await fri();
  t.sjekk([27, 28, 35, 36].every((i) => s.brett[i]) && s.tilbud[1] === null && s.poeng === 16, `Trykk på brikke og rute la ikke brikken (poeng ${s.poeng})`);
  // Undo: back to before the 2 × 2, once per set.
  await t.klikk('[data-h="angre"]');
  s = await fri();
  t.sjekk(s.tilbud[1] === "o4" && s.poeng === 12 && !s.brett[27], "Angre tok ikke tilbake den siste brikken");
  await t.trykk('.bk-brikke[data-v="1"]');
  await t.trykk(celle(3, 3));
  s = await fri();
  t.sjekk(s.tilbud[1] === null && s.poeng === 16, "Brikken ble ikke lagt igjen etter angring");
  t.sjekk(!(await t.finnes('[data-h="angre"]:not([disabled])')), "Angre er mulig to ganger i samme runde");

  // The keyboard: 3 picks the single cell, the arrows move its shadow, Enter places it. The last
  // piece of the set brings three new ones.
  await tast("3");
  t.sjekk(await t.js("document.activeElement && document.activeElement.classList.contains('bk-brett')"), "Tastene 1–3 flytter ikke fokus til brettet");
  await tast("ArrowRight", 39);
  await tast("ArrowRight", 39);
  await tast("ArrowDown", 40);
  t.sjekk((await t.antall(".bk-ruter i.skygge")) === 1 && (await t.finnes(`${celle(2, 1)}.skygge`)), "Skyggen følger ikke piltastene");
  t.sjekk(/Prikk: rad 2, kolonne 3\. Passer\./.test(await si()), `Piltastene leses ikke opp: «${await si()}»`);
  await t.bilde("tastatur");
  await tast("Enter", 13);
  s = await fri();
  t.sjekk(s.brett[10] && s.sett === 1 && s.tilbud.every((id) => B.FORMER[id]), "Enter la ikke brikken, eller det kom ikke tre nye brikker");
  t.sjekk(s.tilbud.some((id) => B.finnesPlass(s.brett, B.FORMER[id])), "De nye brikkene passer ikke på brettet");
  // A new set: undo is possible again after its first piece.
  const forste = s.tilbud.findIndex((id) => B.finnesPlass(s.brett, B.FORMER[id]));
  await tast(String(forste + 1));
  await tast("Enter", 13);
  s = await fri();
  t.sjekk(s.lagt === 5 && (await t.finnes('[data-h="angre"]:not([disabled])')), "Angre er ikke mulig igjen i en ny runde");

  // Reload mid-game: the same board and pieces.
  const forLast = await fri();
  await t.lastSide(t.side, "document.querySelectorAll('.bk-ruter i').length === 64");
  await pause();
  s = await fri();
  t.sjekk(JSON.stringify(s.brett) === JSON.stringify(forLast.brett) && JSON.stringify(s.tilbud) === JSON.stringify(forLast.tilbud) && s.poeng === forLast.poeng, "Spillet ble ikke det samme etter omlasting");
  t.sjekk((await fylteSkjerm()) === fylte(s.brett) && (await t.antall(".bk-brikke")) === s.tilbud.filter(Boolean).length, "Brettet ble ikke tegnet riktig etter omlasting");
  t.sjekk(/blokka/i.test(await t.tekst("#topp-tittel")), "Omlasting havnet ikke i spillet");

  // Back + «Fortsett»
  await t.klikk("#tilbake");
  t.sjekk(/Fortsett · 2\d poeng/.test(await t.tekst('[data-h="fortsett"]')), "Hjemskjermen tilbyr ikke å fortsette");
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.bk-ruter i').length === 64");
  await pause();

  // Game over: a checkerboard – only the single cell fits; after it, nothing does.
  await sett("fri", { brett: sjakk(), tilbud: ["1", "o4", "2h"], poeng: 50, lagt: 20, forrige: null, angretSett: -1, rekke: 0, siden: 0 });
  t.sjekk((await t.antall(".bk-brikke.ikke")) === 2 && /Passer ikke/.test(await t.tekst('.bk-brikke[data-v="1"]')), "Brikker som ikke passer, er ikke merket med tekst");
  await t.trykk('.bk-brikke[data-v="0"]');
  await t.trykk(celle(0, 0));
  await t.vent("document.querySelector('.bk-melding:not([hidden])')", 3000);
  t.sjekk(/Ingen brikker passer!/.test(await t.tekst(".bk-melding")) && (await t.antall(".bk-brikker.over .bk-brikke.ikke")) === 2, "Slutten viser ikke hvilke brikker som ikke passer");
  t.sjekk((await S()).fri.ferdig === true, "Spillet ble ikke lagret som ferdig med en gang");
  await t.bilde("ingen-passer");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(700);
  let alt = await S();
  t.sjekk(alt.rekord === 51 && /51/.test(await t.tekst(".bk-tall b")), `Rekorden ble ikke lagret (${alt.rekord})`);
  t.sjekk(!/kåringen/i.test(await t.tekst("#topp-tittel")) && (await t.finnes('.dokk a.lenke[href="/"]')) && /Spill igjen/.test(await t.tekst(".dokk .knapp")), "Sluttskjermen mangler de vanlige knappene");
  await t.bilde("slutt", true);
  // The result can take the last piece back; the record forgets it again.
  await t.klikk('[data-h="angre-slutt"]');
  await t.vent("document.querySelectorAll('.bk-brikke').length === 3");
  alt = await S();
  t.sjekk(!alt.fri.ferdig && alt.fri.poeng === 50 && alt.rekord === 0, "Angre fra sluttskjermen ga ikke tilbake brettet, eller rekorden beholdt brikken");
  await pause();
  await t.trykk('.bk-brikke[data-v="0"]');
  await t.trykk(celle(2, 0));
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(500);
  t.sjekk((await S()).rekord === 51, "Rekorden ble ikke lagret på nytt");
  t.sjekk(!(await t.finnes('[data-h="angre-slutt"]')), "Sluttskjermen tilbyr å angre en gang til i samme runde");
  await t.klikk("#tilbake");
  t.sjekk(/Rekord i fritt spill: 51 poeng/.test(await t.tekst(".bk-rekordlinje")) && !(await t.finnes('[data-h="fortsett"]')), "Hjemskjermen viser ikke rekorden, eller tilbyr et ferdig spill");

  // ----- Dagens blokk -----
  await t.klikk('[data-h="dagens"]');
  await t.vent("Rusj.S.dag && document.querySelectorAll('.bk-brikke').length > 0");
  await pause();
  s = (await S()).dag;
  t.sjekk(s.dagens === dag.tekst && JSON.stringify(s.tilbud) === JSON.stringify([...B.dagSett(dag.tekst, 0)]), `Dagens brikker kommer ikke fra datoen (${s.tilbud.join(", ")})`);
  t.sjekk(/dagens blokk/i.test(await t.tekst("#topp-tittel")) && !(await t.finnes('[data-h="angre"]')) && /0 av 60/.test(await t.tekst(".bk-hud")), "Dagens blokk skal ha tittel, 60 brikker og ingen angreknapp");
  await t.bilde("dagens");
  await t.trykk('.bk-brikke[data-v="0"]');
  await t.trykk(celle(3, 3));
  s = (await S()).dag;
  t.sjekk(s.lagt === 1 && s.forrige === null, "Dagens blokk: brikken ble ikke lagt (eller kan angres)");
  let felles = await t.js(`JSON.parse(localStorage.getItem("rusj.daglig") || "{}").blokka`);
  t.sjekk(felles && felles.pagar && felles.pagar.nr === dag.nr && /^\d+p$/.test(felles.pagar.tekst.replace(/\s/g, "")), `Forsiden får ikke vite at dagens blokk er i gang (${JSON.stringify(felles)})`);
  // Reload mid-daily
  await t.lastSide(t.side, "document.querySelectorAll('.bk-ruter i').length === 64");
  await pause();
  t.sjekk(/dagens blokk/i.test(await t.tekst("#topp-tittel")) && (await S()).dag.lagt === 1 && (await fylteSkjerm()) === fylte((await S()).dag.brett), "Dagens blokk overlevde ikke omlasting");
  // Home in between: «Fortsett dagens blokk»
  await t.klikk("#tilbake");
  t.sjekk(/Fortsett dagens blokk/.test(await t.tekst('[data-h="dagens"]')), "Hjemskjermen tilbyr ikke å fortsette dagens blokk");
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelectorAll('.bk-ruter i').length === 64");
  await pause();
  // The end of the try: nothing fits after the next piece.
  await sett("dag", { brett: sjakk(), tilbud: ["1", "o4", null], poeng: 1838, linjer: 14, lagt: 30, besteRekke: 3 });
  await t.trykk('.bk-brikke[data-v="0"]');
  await t.trykk(celle(2, 0));
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(700);
  alt = await S();
  const res = alt.daglig.dager[dag.tekst];
  t.sjekk(res && res.poeng === 1839 && alt.daglig.rekke === 1, "Dagens blokk ble ikke lagret som tatt");
  felles = await t.js(`JSON.parse(localStorage.getItem("rusj.daglig") || "{}").blokka`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.rekke === 1 && felles.res === "1\u00a0839 p", `Forsiden får ikke resultatet (${JSON.stringify(felles)})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".bk-nedtelling b")) && /1 dag på rad/.test(await t.tekst(".bk-dagrekke")), "Resultatet mangler nedtelling eller rekke");
  const n1 = await t.tekst(".bk-nedtelling b");
  await t.sov(1200);
  t.sjekk((await t.tekst(".bk-nedtelling b")) !== n1, "Nedtellingen står stille");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""} ${delt.url || ""}` : "";
  t.sjekk(/Blokka \d+\.\d+ · 1\s839 poeng · 14 linjer/.test(delTekst) && delTekst.includes("https://rusj.no/blokka/#utfordring"), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  t.sjekk(!/[■□#.]{4,}|🟦{2,}|🟩|⬛|⬜/.test(delTekst.replace("#utfordring", "")), "Delingen inneholder brettet");
  await t.bilde("dagens-resultat", true);
  // #dagens shows the result
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  t.sjekk(/dagens blokk/i.test(await t.tekst("#topp-tittel")), "#dagens åpnet ikke resultatet");
  await pause();
  await t.klikk("#tilbake");
  t.sjekk(/Dagens blokk: 1\s839 poeng/.test(await t.tekst(".bk-daglinje")) && (await t.finnes(".bk-nedtelling b")), "Hjemskjermen viser ikke at dagens blokk er tatt");
  await t.bilde("hjem-tatt");

  // ----- Fit: the board and the tray on the screen, no page scrolling -----
  await t.klikk('[data-h="nytt"]');
  await t.vent("document.querySelectorAll('.bk-brikke').length === 3");
  await t.sov(400);
  const m = await t.js(`(() => {
    const b = document.querySelector(".bk-ruter").getBoundingClientRect();
    const p = document.querySelector(".bk-brikker").getBoundingClientRect();
    const c = document.querySelector(".bk-ruter i").getBoundingClientRect();
    const r = (x) => ({ top: x.top, bottom: x.bottom, left: x.left, right: x.right });
    return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, b: r(b), p: r(p), c: c.width, w: innerWidth, h: innerHeight };
  })()`);
  t.sjekk(m.side <= 1 && m.bred <= 0, `${m.w}×${m.h}: spillskjermen kan scrolles`);
  t.sjekk(m.c >= 28, `${m.w}×${m.h}: rutene er for små (${Math.round(m.c)} px)`);
  t.sjekk(m.p.bottom <= m.h && m.b.bottom <= m.h && m.b.right <= m.w, `${m.w}×${m.h}: brettet eller brikkene går utenfor skjermen`);
  if (m.w > m.h) t.sjekk(m.b.right <= m.p.left, `${m.w}×${m.h}: brikkene står ikke til høyre for brettet`);
  else t.sjekk(m.b.bottom <= m.p.top, `${m.w}×${m.h}: brikkene står ikke under brettet`);
  t.sjekk((await t.js(`document.querySelector(".bk-brikke").getBoundingClientRect().height`)) >= 44, "Brikkene er for små å treffe");
  await t.bilde("passer");
}
