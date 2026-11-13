// Skilpadda (mahjong solitaire): choose a board on the setup screen, then free play with real taps –
// a locked tile only shakes, a free tile is selected, a tile that does not match takes over the
// selection, a matching one takes the pair; undo, a hint (two free tiles that match, from the
// deal's own solution), the keyboard (Tab only reaches free tiles, Enter selects), a reload mid-game,
// back + «Fortsett». No pair left: the card with «Stokk om (+30 s)», which lays the tiles out again
// (penalty on the clock, undo brings the old faces back). Clearing the board: the result, the record
// per board and a new record. «Dagens brett»: the day's board from the date, progress to the front
// page, a reload, cleared → streak, countdown, the sticker, a share without the board, and #dagens.
// Last: the board fits the screen (no scrolling, clear of the dock), the tiles are big enough to
// read, and every free tile can be seen and hit at its centre (the 3D stacking never hides one) –
// for the default board of this screen and for the 144-tile turtle.
// Runs in every edition (node test/rusj-e2e.mjs --sprak en skilpadda): texts are checked in
// Norwegian only (t.norsk); elsewhere the state, the numbers and the links.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kontekst = { window: {}, console };
vm.createContext(kontekst);
vm.runInContext(readFileSync(join(ROT, "rusj/spill/skilpadda/spill.js"), "utf8"), kontekst);
const MJ = kontekst.window.Skilpadda.MJ;
const plain = (x) => JSON.parse(JSON.stringify(x));

export default async function (t) {
  const pause = () => t.sov(420); // taps right after a screen change are ignored on purpose
  const S = () => t.tilstand();
  const aktivt = async () => {
    const s = await S();
    return s.modus === "dag" ? s.dag : s.fri;
  };
  const brikke = (i) => `.sp-b[data-v="${i}"]`;
  const stilling = (sp) => ({ g: MJ.geo(sp.brett), borte: MJ.spillAv(sp.brett, sp.ansikt, sp.hist) });
  const parAv = (hist) => hist.filter((h) => Array.isArray(h)).length;
  // A known position in the game on the table, saved and reloaded like a real one.
  async function sett(hvilket, endring) {
    await t.js(`(() => { const sp = Rusj.S.${hvilket}; Object.assign(sp, ${JSON.stringify(endring)}); Rusj.lagre(); })()`);
    await t.lastSide(t.side, "document.querySelector('.sp-b')");
    await pause();
  }
  async function tast(key, kode, shift = false) {
    const mod = shift ? 8 : 0;
    await t.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: kode, modifiers: mod, ...(key === "Enter" ? { text: "\r" } : {}) });
    await t.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: kode, modifiers: mod });
    await t.sov(90);
  }
  const si = () => t.js("document.querySelector('#si').textContent");
  // Free tiles that can be seen and hit: the element at the centre of each is the tile itself.
  const synligeFrie = () =>
    t.js(`(() => {
      document.querySelectorAll("#merke-pop, .toast").forEach((el) => (el.style.display = "none"));
      const ut = { frie: 0, skjult: [], minste: 1e9 };
      for (const el of document.querySelectorAll(".sp-b:not(.last):not(.ut)")) {
        ut.frie++;
        const b = el.getBoundingClientRect();
        ut.minste = Math.min(ut.minste, b.width);
        const over = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!over || over.closest(".sp-b") !== el) ut.skjult.push(el.dataset.v);
      }
      return ut;
    })()`);

  await t.start();
  await t.js("Rusj.felles.installTips = 2; Rusj.lagreFelles()");
  const dag = await t.js("Rusj.dag()");
  // The kit celebrates new stickers with a card at the top of the screen (on a phone on its side it
  // lies over the board): the ones a first game gives are already in the book here.
  await t.js(`localStorage.setItem("${t.nokkel("merker")}", JSON.stringify({ "provd-alene": ${dag.nr}, "dagens-forste": ${dag.nr} }))`);

  // ----- Home -----
  t.sjekk(await t.finnes('.hjem-knapper .knapp[data-h="dagens"] .sp-kal'), "Dagens brett er ikke hovedknappen på hjemskjermen");
  t.sjekk(!t.norsk || /Nytt brett · (Fjellet|Borgen|Skilpadda)/.test(await t.tekst('[data-h="nytt"]')), `Mangler «Nytt brett» på hjemskjermen («${await t.tekst('[data-h="nytt"]')}»)`);
  await t.bilde("hjem");

  // ----- Setup: five boards, each drawn from above -----
  await t.klikk('[data-h="endre"]');
  await t.vent("document.querySelectorAll('.flis[data-h=\"brett\"]').length === 5");
  t.sjekk((await t.antall(".flis .sp-mini")) === 5, "Brettene på oppsettet mangler tegning");
  t.sjekk(!t.norsk || /144 brikker/.test(await t.tekst('.flis[data-v="skilpadda"]')), "Skilpadda viser ikke antall brikker");
  await t.bilde("oppsett");
  await t.klikk('.flis[data-v="hytta"]');
  t.sjekk((await t.js(`document.querySelector('.flis[data-v="hytta"]').getAttribute("aria-pressed")`)) === "true", "Valget av brett vises ikke");
  await t.klikk('.dokk [data-h="start"]');
  await t.vent("document.querySelectorAll('.sp-b').length === 44");
  await pause();
  let sp = await aktivt();
  t.sjekk(sp && sp.brett === "hytta" && sp.hist.length === 0 && sp.ansikt.length === 44, "Et nytt spill på Hytta ble ikke laget");
  let { g, borte } = stilling(sp);
  const frie = MJ.frie(g, borte);
  t.sjekk((await t.antall(".sp-b:not(.last)")) === frie.length, `Feil antall ledige brikker på skjermen (${await t.antall(".sp-b:not(.last)")} av ${frie.length})`);
  t.sjekk((await t.antall(".sp-flate.vis-frie")) === 1, "Låste brikker er ikke merket");
  let syn = await synligeFrie();
  t.sjekk(!syn.skjult.length, `Ledige brikker er skjult under andre: ${syn.skjult.join(", ")}`);
  t.sjekk(!(await t.finnes('.sp-knapp[data-h="angre"]:not([disabled])')), "Angre er mulig før første trekk");
  await t.bilde("start");

  // A locked tile only shakes.
  const last = borte.findIndex((v, i) => !v && !MJ.ledig(g, borte, i));
  await t.trykk(brikke(last));
  t.sjekk((await t.antall(".sp-b.valgt")) === 0 && (await t.js(`document.querySelector('${brikke(last)}').getAttribute("aria-disabled")`)) === "true", "En låst brikke ble valgt");
  t.sjekk(!t.norsk || /er låst/.test(await si()), `Låst brikke leses ikke opp («${await si()}»)`);

  // A free tile is selected; one that does not match takes over; the matching one takes the pair.
  const par = MJ.parene(g, borte, sp.ansikt)[0];
  const ulik = frie.find((i) => !MJ.passer(sp.ansikt[i], sp.ansikt[par[0]]));
  await t.trykk(brikke(ulik));
  t.sjekk((await t.js(`document.querySelector('${brikke(ulik)}').getAttribute("aria-pressed")`)) === "true", "En ledig brikke ble ikke valgt");
  await t.trykk(brikke(par[0]));
  t.sjekk((await t.antall(".sp-b.valgt")) === 1 && (await t.finnes(`${brikke(par[0])}.valgt`)), "Valget flyttet seg ikke til en brikke som ikke passet");
  t.sjekk(!t.norsk || /Ikke like/.test(await si()), "Ulike brikker sies ikke fra om");
  await t.bilde("valgt");
  await t.trykk(brikke(par[1]));
  await t.sov(400);
  sp = await aktivt();
  t.sjekk(parAv(sp.hist) === 1 && !(await t.finnes(brikke(par[0]))) && !(await t.finnes(brikke(par[1]))) && (await t.antall(".sp-b")) === 42, "Paret ble ikke tatt");
  t.sjekk((t.norsk ? /^42 brikker$/ : /42/).test((await t.tekst("#sp-igjen")).replace(/\s+/g, " ").trim()), `Telleren viser ikke 42 brikker («${await t.tekst("#sp-igjen")}»)`);
  t.sjekk(sp.startet && (await t.finnes('.sp-knapp[data-h="angre"]:not([disabled])')), "Angre er ikke mulig etter et par");

  // Undo
  await t.klikk('.sp-knapp[data-h="angre"]');
  sp = await aktivt();
  t.sjekk(sp.hist.length === 0 && (await t.antall(".sp-b")) === 44 && sp.angre === 1, "Angre la ikke paret tilbake");

  // Hint: two free tiles that match, from the deal's own solution
  await t.klikk('.sp-knapp[data-h="hint"]');
  sp = await aktivt();
  const hint = await t.js(`Array.from(document.querySelectorAll(".sp-b.hint")).map((el) => Number(el.dataset.v))`);
  ({ g, borte } = stilling(sp));
  t.sjekk(hint.length === 2 && hint.every((i) => MJ.ledig(g, borte, i)) && MJ.passer(sp.ansikt[hint[0]], sp.ansikt[hint[1]]) && sp.hint === 1, `Hintet viser ikke to like, ledige brikker (${hint.join(", ")})`);
  const losning = MJ.delUt(sp.brett, sp.fro).losning;
  t.sjekk(JSON.stringify([...hint].sort((a, b) => a - b)) === JSON.stringify([...losning[0]].sort((a, b) => a - b)), "Hintet følger ikke brettets egen løsning");
  await t.bilde("hint");
  await t.trykk(brikke(hint[0]));
  await t.trykk(brikke(hint[1]));
  await t.sov(400);
  t.sjekk(parAv((await aktivt()).hist) === 1, "Hint-paret kunne ikke tas");

  // The keyboard: Tab reaches only free tiles, Enter selects.
  await t.js("document.querySelector('.sp-brett').focus(); document.activeElement.blur();");
  let fokusFri = true;
  for (let n = 0; n < 6; n++) {
    await tast("Tab", 9);
    const f = await t.js(`(() => { const el = document.activeElement; return el && el.classList.contains("sp-b") ? { v: el.dataset.v, last: el.classList.contains("last") } : null; })()`);
    if (f && f.last) fokusFri = false;
  }
  t.sjekk(fokusFri, "Tab stoppet på en låst brikke");
  const fokus = await t.js(`(() => { const el = document.querySelector(".sp-b:not(.last)"); el.focus(); return el.dataset.v; })()`);
  await tast("Enter", 13);
  t.sjekk((await t.js(`document.querySelector('${brikke(fokus)}').getAttribute("aria-pressed")`)) === "true", "Enter valgte ikke brikken");
  await t.bilde("tastatur");

  // Reload mid-game: the same board
  const forLast = await aktivt();
  await t.lastSide(t.side, "document.querySelector('.sp-b')");
  await pause();
  sp = await aktivt();
  t.sjekk(JSON.stringify(sp.ansikt) === JSON.stringify(forLast.ansikt) && JSON.stringify(sp.hist) === JSON.stringify(forLast.hist) && (await t.antall(".sp-b")) === 42, "Spillet ble ikke det samme etter omlasting");

  // Back + «Fortsett»
  await t.klikk("#tilbake");
  t.sjekk((t.norsk ? /Fortsett · Hytta, 42 igjen/ : /42/).test(await t.tekst('[data-h="fortsett"]')), `Hjemskjermen tilbyr ikke å fortsette («${await t.tekst('[data-h="fortsett"]')}»)`);
  await t.klikk('[data-h="fortsett"]');
  await t.vent("document.querySelectorAll('.sp-b').length === 42");
  await pause();

  // ----- No pair left: every free tile has its own face, the partners lie locked -----
  ({ g, borte } = stilling({ brett: "hytta", ansikt: sp.ansikt, hist: [] }));
  const fri0 = MJ.frie(g, MJ.spillAv("hytta", sp.ansikt, []));
  const fast = new Array(44);
  fri0.forEach((i, n) => (fast[i] = MJ.SLAG[n]));
  const resten = [...Array(44).keys()].filter((i) => !fast[i]);
  resten.forEach((i, n) => (fast[i] = n < fri0.length ? MJ.SLAG[n] : MJ.SLAG[fri0.length + ((n - fri0.length) >> 1)]));
  await sett("fri", { ansikt: fast, hist: [], stokk: 0 });
  await t.vent("document.querySelector('.sp-stopp:not([hidden])')", 3000);
  t.sjekk((t.norsk ? /Ingen ledige par/ : /\S/).test(await t.tekst(".sp-stopp")) && (await t.finnes("#sp-stokk-na")), "Kortet «Ingen ledige par» vises ikke");
  t.sjekk((await t.tekst("#sp-par")).trim().startsWith("0"), "Telleren viser ikke 0 ledige par");
  await t.bilde("ingen-par");
  await t.klikk("#sp-stokk-na");
  await t.sov(300);
  sp = await aktivt();
  ({ g, borte } = stilling(sp));
  t.sjekk(sp.stokk === 1 && sp.hist.length === 1 && MJ.parene(g, borte, sp.ansikt).length > 0 && !(await t.finnes(".sp-stopp:not([hidden])")), "Stokkingen ga ikke nye par");
  t.sjekk(JSON.stringify([...sp.ansikt].sort()) === JSON.stringify([...fast].sort()), "Stokkingen byttet ut brikker");
  t.sjekk(/^0:3\d$/.test((await t.tekst("#sp-tid")).trim()), `Stokkingen la ikke 30 s til tida («${await t.tekst("#sp-tid")}»)`);
  await t.bilde("stokket");
  // Undo the shuffle: the old faces – and the card – come back; the penalty stays.
  await t.klikk('.sp-knapp[data-h="angre"]');
  sp = await aktivt();
  t.sjekk(JSON.stringify(sp.ansikt) === JSON.stringify(fast) && sp.stokk === 1 && (await t.finnes(".sp-stopp:not([hidden])")), "Angre etter stokking ga ikke tilbake brikkene som før");
  // «Stokk om» in the toolbar asks first when pairs are left; here none are: it shuffles at once.
  await t.klikk('.sp-knapp[data-h="stokk"]');
  await t.sov(300);
  t.sjekk((await aktivt()).stokk === 2, "Stokk om i verktøylinja virket ikke");

  // ----- Clearing the board: the last pair -----
  const deal = MJ.delUt("hytta", sp.fro);
  await sett("fri", { ansikt: deal.ansikt, hist: deal.losning.slice(0, -1), stokk: 1, hint: 2, tid: 61000, startet: true });
  t.sjekk((await t.antall(".sp-b")) === 2, "To brikker skulle vært igjen");
  const siste = deal.losning[deal.losning.length - 1];
  await t.trykk(brikke(siste[0]));
  await t.trykk(brikke(siste[1]));
  t.sjekk((await S()).fri.ferdig === true, "Det ryddede brettet ble ikke lagret som ferdig med en gang");
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(700);
  let alt = await S();
  t.sjekk(alt.fri.vunnet && alt.stat.hytta && alt.stat.hytta.vunnet === 1 && alt.stat.hytta.besteTid >= 91 && alt.stat.hytta.besteTid <= 99, `Seieren ble ikke talt (${JSON.stringify(alt.stat.hytta)})`);
  t.sjekk(/^1:3\d$/.test((await t.tekst(".sp-tall b")).trim()), `Tida på resultatet er ikke 61 s + 30 s straff («${await t.tekst(".sp-tall b")}»)`);
  t.sjekk((await t.finnes(".sp-straff")) && (!t.norsk || /Brettet er ryddet!/.test(await t.tekst("h1"))), "Resultatet sier ikke fra om stokkingen, eller mangler tittel");
  t.sjekk((await t.finnes(`.dokk a.lenke[href="${t.forside}"]`)) && (!t.norsk || /Spill igjen/.test(await t.tekst(".dokk .knapp"))), "Sluttskjermen mangler de vanlige knappene");
  await t.bilde("ryddet", true);
  // Again, faster: a new record
  await t.klikk('.dokk [data-h="igjen"]');
  await t.vent("document.querySelectorAll('.sp-b').length === 44");
  await pause();
  sp = await aktivt();
  const deal2 = MJ.delUt("hytta", sp.fro);
  await sett("fri", { hist: deal2.losning.slice(0, -1), tid: 40000, startet: true });
  const siste2 = deal2.losning[deal2.losning.length - 1];
  await t.trykk(brikke(siste2[0]));
  await t.trykk(brikke(siste2[1]));
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(500);
  alt = await S();
  t.sjekk(alt.stat.hytta.vunnet === 2 && alt.stat.hytta.besteTid <= 41 && (await t.finnes(".sp-tall.ny .sp-ny")), `Ny rekord ble ikke vist (${JSON.stringify(alt.stat.hytta)})`);
  t.sjekk(!t.norsk || /Ny rekord!/.test(await t.tekst("h1")), "Tittelen sier ikke «Ny rekord!»");

  // ----- Dagens brett -----
  await t.klikk('.dokk [data-h="dagens"]');
  await t.vent("document.querySelectorAll('.sp-b').length > 40");
  await pause();
  sp = (await S()).dag;
  const dagens = MJ.dagens(dag.tekst);
  const dagDeal = MJ.delUt(dagens.brett, dagens.fro);
  t.sjekk(sp && sp.dato === dag.tekst && sp.brett === dagens.brett && JSON.stringify(sp.ansikt) === JSON.stringify(plain(dagDeal.ansikt)), `Dagens brett kommer ikke fra datoen (${sp && sp.brett})`);
  t.sjekk(!t.norsk || /dagens brett/i.test(await t.tekst("#topp-tittel")), "Dagens brett har ikke tittel");
  syn = await synligeFrie();
  t.sjekk(!syn.skjult.length, `Ledige brikker er skjult på dagens brett: ${syn.skjult.join(", ")}`);
  await t.bilde("dagens");
  const [d1, d2] = dagDeal.losning[0];
  await t.trykk(brikke(d1));
  await t.trykk(brikke(d2));
  await t.sov(300);
  let felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").skilpadda`);
  t.sjekk(felles && felles.pagar && felles.pagar.nr === dag.nr && /^2\D+\d+$/.test(felles.pagar.tekst), `Forsiden får ikke vite at dagens brett er i gang (${JSON.stringify(felles)})`);
  await t.lastSide(t.side, "document.querySelector('.sp-b')");
  await pause();
  t.sjekk(parAv((await S()).dag.hist) === 1 && (await S()).modus === "dag", "Dagens brett overlevde ikke omlasting");
  await t.klikk("#tilbake");
  t.sjekk(!t.norsk || /Fortsett dagens brett/.test(await t.tekst('[data-h="dagens"]')), "Hjemskjermen tilbyr ikke å fortsette dagens brett");
  await t.klikk('[data-h="dagens"]');
  await t.vent("document.querySelector('.sp-b')");
  await pause();
  await sett("dag", { hist: dagDeal.losning.slice(0, -1), tid: 200000, hint: 0, stokk: 0, startet: true });
  const dsiste = dagDeal.losning[dagDeal.losning.length - 1];
  await t.trykk(brikke(dsiste[0]));
  await t.trykk(brikke(dsiste[1]));
  await t.vent("document.querySelector('.skjerm-slutt')", 6000);
  await t.sov(700);
  alt = await S();
  t.sjekk(alt.dstat.rekke === 1 && alt.dstat.sist === dag.nr && alt.dag.ferdig && alt.dag.resultat.sek >= 200, `Dagens brett ble ikke lagret som ryddet (${JSON.stringify(alt.dstat)})`);
  felles = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("daglig")}") || "{}").skilpadda`);
  t.sjekk(felles && felles.nr === dag.nr && felles.vunnet === true && felles.rekke === 1 && /^3:2\d$/.test(felles.res), `Forsiden får ikke resultatet (${JSON.stringify(felles)})`);
  const merker = await t.js(`JSON.parse(localStorage.getItem("${t.nokkel("merker")}") || "{}")`);
  t.sjekk(!!merker["seier-skilpadda"], `Klistremerket for dagens brett ble ikke gitt (${Object.keys(merker).join(", ")})`);
  t.sjekk(/^\d\d:\d\d:\d\d$/.test(await t.tekst(".sp-nedtelling b")), "Resultatet mangler nedtelling til neste brett");
  await t.js("window.__delt = null; navigator.share = (d) => { window.__delt = d; return Promise.resolve(); }; navigator.canShare = () => false;");
  await t.klikk('.dokk [data-h="del"]', 400);
  const delt = await t.js("window.__delt");
  const delTekst = delt ? `${delt.text || ""} ${delt.url || ""}` : "";
  t.sjekk(/3:2\d/.test(delTekst) && delTekst.includes("#utfordring") && delTekst.includes(`https://rusj.no${t.forside}`), `«Del resultatet» deler ikke resultatet (${JSON.stringify(delt)})`);
  t.sjekk(!/[\u{1F000}-\u{1F02B}]|\b[rbkpdfa]\d\b/u.test(delTekst.replace(/https?:\S+/, "")), "Delingen inneholder brettet");
  await t.bilde("dagens-ryddet", true);
  await t.lastSide(t.side + "#dagens", "document.querySelector('.skjerm-slutt')");
  await pause();
  await t.klikk("#tilbake");
  t.sjekk((await t.finnes(".sp-dagboks .sp-nedtelling b")) && (await t.finnes('.sp-dagboks [data-h="dagens"]')), "Hjemskjermen viser ikke at dagens brett er ryddet");
  await t.bilde("hjem-ryddet");

  // ----- Fit: the board of this screen, and the turtle -----
  const standard = await t.js("innerWidth >= 700 && innerHeight >= 560 ? 'skilpadda' : innerWidth > innerHeight ? 'borgen' : 'fjellet'");
  for (const id of [standard, "skilpadda"]) {
    await t.klikk('[data-h="endre"]');
    await t.klikk(`.flis[data-v="${id}"]`);
    await t.klikk('.dokk [data-h="start"]');
    await t.vent(`document.querySelectorAll('.sp-b').length === ${MJ.geo(id).n}`);
    await t.sov(500);
    const m = await t.js(`(() => {
      const b = document.querySelector(".sp-brett").getBoundingClientRect();
      const r = (x) => ({ top: Math.round(x.top), bottom: Math.round(x.bottom), left: Math.round(x.left), right: Math.round(x.right) });
      return { side: document.documentElement.scrollHeight - innerHeight, bred: document.documentElement.scrollWidth - innerWidth, b: r(b), w: innerWidth, h: innerHeight };
    })()`);
    syn = await synligeFrie();
    t.sjekk(m.side <= 1 && m.bred <= 0, `${id} ${m.w}×${m.h}: spillskjermen kan scrolles`);
    t.sjekk(m.b.top >= 0 && m.b.left >= 0 && m.b.right <= m.w && m.b.bottom <= m.h, `${id} ${m.w}×${m.h}: brettet går utenfor skjermen (${JSON.stringify(m.b)})`);
    t.sjekk(await t.friForDokk(".sp-brett", 2), `${id} ${m.w}×${m.h}: brettet ligger under verktøylinja`);
    t.sjekk(!syn.skjult.length, `${id} ${m.w}×${m.h}: ledige brikker er skjult: ${syn.skjult.join(", ")}`);
    // Readable: the phone boards get proper tiles; the turtle at least small ones (it says «best on a big screen»).
    const min = id === "skilpadda" ? (m.w > m.h ? 26 : 17) : m.h <= 600 && m.w < m.h ? 30 : 34;
    t.sjekk(syn.minste >= min, `${id} ${m.w}×${m.h}: brikkene er for små (${Math.round(syn.minste)} px, minst ${min})`);
    await t.bilde("passer-" + id);
    await t.klikk('.sp-knapp[data-h="avslutt"]');
    await t.vent("document.querySelector('.ark')");
    await t.bilde("avslutt-" + id);
    t.sjekk(!t.norsk || /Avslutt[\s\S]*Spill videre|Spill videre[\s\S]*Avslutt/.test(await t.tekst(".ark")), "Avslutt-arket har ikke «Avslutt» og «Spill videre»");
    await t.klikk('.ark [data-h="ark-svar"][data-v="ja"]');
    await t.vent("document.querySelector('.skjerm-hjem')", 4000);
    await pause();
  }
}
