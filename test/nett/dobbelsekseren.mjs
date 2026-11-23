// Dobbelsekseren (dominoes) on the net, a play-on game (FORTSETT): A has a draw game «først til 50»
// against the phone saved (the room's setup), makes a room; B and C join and A starts with three;
// each phone shows only its own tiles (the others' as backs); a fourth phone finds the room full; B
// closes its tab and comes back; C leaves in the middle of the first round – its tiles leave the
// game, its turns are skipped – and A and B play on, round after round, to the end of the match;
// «Ny kamp» for the two left; A leaves, B is told; A's saved game is untouched.
import { readFileSync } from "node:fs";
import vm from "node:vm";

// The game's own rules, loaded without the kit (to choose the moves, as a player would).
const D = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/dobbelsekseren/spill.js", import.meta.url), "utf8"), { window, performance, setTimeout, clearTimeout, document: { querySelector: () => null } });
  return window.RusjDobbelsekseren;
})();

export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  const c = await t.telefon("C2", { rolig: true });
  const LAGRET = t.nokkel("dobbelsekseren.v1");
  const nokkel = (sp) => [sp.r.hender, sp.r.rekke, sp.r.bunke, sp.r.tur, sp.r.logg, sp.r.resultat, sp.poeng, sp.runde, sp.ute];
  // One move as a player: the first tile that fits (and the left end when it fits both), else draw,
  // else pass. Paced to a person's speed (the room takes at most 20 messages per 10 s per phone).
  const sist = new Map();
  const trekk = async (p) => {
    const vent = (sist.get(p) || 0) + 700 - Date.now();
    if (vent > 0) await t.sov(vent);
    sist.set(p, Date.now());
    const sp = await p.spill();
    const r = sp.r;
    const n = r.logg.length;
    const ferdig = `Rusj.S.spill.r.logg.length > ${n} || Rusj.S.spill.runde !== ${sp.runde}`;
    const lov = D.trekk(r.hender[r.tur], r.rekke, r.krav);
    if (lov.length) {
      const m = lov[0];
      if (D.sider(r.hender[r.tur][m.i], r.rekke).length > 1) {
        await p.klikk(`#skjerm .do-hand [data-h="brikke"][data-v="${m.i}"]`, 60);
        await p.trekk(`#skjerm [data-h="side"][data-v="${m.side}"]`, ferdig);
      } else await p.trekk(`#skjerm .do-hand [data-h="brikke"][data-v="${m.i}"]`, ferdig);
    } else if (sp.variant === "trekk" && r.bunke.length) await p.trekk('#skjerm [data-h="trekk"]', ferdig);
    else await p.trekk('#skjerm [data-h="pass"]', ferdig);
  };

  await a.apne();
  await a.klikk('[data-h="nytt"]');
  await a.ventSkjerm("oppsett");
  await a.klikk('[data-h="mal"][data-v="50"]');
  await a.klikk('[data-h="start"]');
  await a.ventSkjerm("spill");
  await t.sov(300);
  await a.klikk('[data-h="tilbake"]');
  await a.ventSkjerm("hjem");
  const lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
  t.sjekk(!!lagret && JSON.parse(lagret).spill, "Spillet mot mobilen ble ikke lagret før nettkampen");

  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 2`, 8000);
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 3`, 8000);
  if (t.norsk) t.sjekk(/Først til 50/.test(await a.tekst(".nett-seter + .hjelp")), "Oppsettet til verten vises ikke i venterommet");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm("spill");
  const sp0 = await a.spill();
  t.sjekk(sp0.n === 3 && sp0.mal === 50 && sp0.variant === "trekk", `Oppsettet ble ikke tre i trekkdomino til 50: ${JSON.stringify([sp0.n, sp0.mal, sp0.variant])}`);
  // Each phone: its own tiles face up, the others' only as a count.
  for (const [p, s] of [[a, 0], [b, 1], [c, 2]]) {
    const vist = await p.js(`Array.from(document.querySelectorAll("#skjerm .do-hand .do-hb")).map((el) => el.getAttribute("aria-label").split(",")[0]).join("|")`);
    const egen = sp0.r.hender[s].map((x) => (x[0] === x[1] ? `dobbel ${x[0]}` : `${x[0]} og ${x[1]}`)).join("|");
    if (t.norsk) t.sjekk(vist === egen, `${p.navn} viser ikke sine egne brikker: ${vist} ≠ ${egen}`);
    t.sjekk((await p.js(`document.querySelectorAll("#skjerm .do-andre li:not(.do-bunke)").length`)) === 2, `${p.navn} ser ikke de to andre`);
  }
  await b.bilde("egne-brikker");
  await t.fullt(lenke);

  let alle = [a, b, c];
  let tilbake = false;
  let borte = false;
  for (let steg = 0; steg < 700; steg++) {
    if ((await a.skjerm()) === "slutt") break;
    const sp = await a.spill();
    if (sp.r.resultat) {
      // A round is over: B deals the next one (or everyone goes to «Kåringen»).
      if (await b.finnes('#skjerm [data-h="runde"]')) {
        await b.trekk('#skjerm [data-h="runde"]', `Rusj.S.spill.runde > ${sp.runde}`);
      } else for (const p of alle) if (await p.finnes('#skjerm [data-h="kaaring"]')) await p.klikk('#skjerm [data-h="kaaring"]');
      await t.sov(200);
      continue;
    }
    if (!tilbake && sp.r.logg.length >= 2) {
      tilbake = true;
      await t.gjenoppkoble(b, a, nokkel);
      continue;
    }
    if (!borte && sp.r.logg.length >= 5) {
      borte = true;
      await c.klikk("#tilbake");
      await c.vent(`document.querySelector('#ark [data-h="ark-svar"][data-v="ja"]')`, 4000);
      await c.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
      await c.ventSkjerm("hjem");
      alle = [a, b];
      for (const p of alle) await p.vent(`Rusj.S.spill.ute.includes(2)`, 8000);
      const etter = await a.spill();
      t.sjekk(etter.r.hender[2].length === 0 && etter.r.vekk.length > 0 && etter.r.tur !== 2, "Brikkene til C er ikke ute av spillet, eller C har fortsatt tur");
      t.sjekk(!(await a.finnes('#ark [data-h="nett-forlat"]')) && !(await b.finnes('#ark [data-h="nett-forlat"]')), "Kampen ble avbrutt for de andre da C gikk");
      await b.bilde("c-forlot");
      continue;
    }
    let p = null;
    for (const q of alle) if (await q.minTur()) p = q;
    if (!p) {
      await t.sov(150);
      continue;
    }
    await trekk(p);
    if (steg === 6) {
      await p.bilde("midt-i-runden");
      await (p === a ? b : a).bilde("ser-trekket");
    }
  }
  t.sjekk(tilbake && borte, "Kampen ble for kort til å teste gjenoppkobling og at C går");
  for (const p of alle) await p.ventSkjerm("slutt", 15000);
  const sa = await a.spill();
  const sb = await b.spill();
  t.sjekk(JSON.stringify(nokkel(sa)) === JSON.stringify(nokkel(sb)), "Sluttstillingen er ulik på de to mobilene");
  t.sjekk(Math.max(...sa.poeng) >= 50, `Kampen sluttet før noen nådde 50: ${sa.poeng}`);
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  await a.bilde("kaaring");
  await b.bilde("kaaring");

  await b.klikk('[data-h="nett-ny"]');
  for (const p of alle) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  const ny = await a.spill();
  t.sjekk(ny.n === 2 && ny.poeng.join() === "0,0" && ny.r.hender.every((h) => h.length === 7), "Ny kamp er ikke for de to som er igjen, med sju brikker hver");
  await a.bilde("ny-kamp");
  await t.forlat(a);
  await b.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await b.klikk('#ark [data-h="nett-forlat"]');
  await b.ventSkjerm("hjem");
  const utenTid = (s) => JSON.stringify({ ...JSON.parse(s), _tid: 0 });
  t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
}
