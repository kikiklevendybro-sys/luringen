// Hopperen (Chinese checkers) on the net, a play-on game (FORTSETT): A has a game against the phone
// saved, makes a room; B and C join and A starts with three; every phone sees its own point at the
// bottom; a fourth phone finds the room full; B closes its tab and comes back; C leaves in the middle
// of the match – its pegs leave the board, its turns are skipped, and A and B play on to the end
// (no «the match is over» sheet); «Ny kamp» for the two left; A leaves, B is told; A's saved game
// is untouched.
import { readFileSync } from "node:fs";
import vm from "node:vm";

// The game's own rules and engine, loaded without the kit (to choose the moves, as a player would).
const { Stjerne, Motor } = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/hopperen/spill.js", import.meta.url), "utf8"), { window, performance, setTimeout, clearTimeout });
  return window.Hopperen;
})();
const FARGE = ["hp-rosa", "hp-gul", "hp-bla", "hp-gronn", "hp-lilla", "hp-oransje"];

export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  const c = await t.telefon("C2", { rolig: true });
  const LAGRET = t.nokkel("hopperen.v1");
  const parti = (sp) => Stjerne.spillUt(sp.plasser, sp.forste, sp.trekk, sp.seter);
  let x = 5;
  const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  // One move as a player: tap the peg, then the hole. (The room takes at most 20 messages per 10 s
  // from one phone: a robot that taps faster than anyone would is slowed down to a person's pace.)
  const sist = new Map();
  const flytt = async (p, sp) => {
    const vent = (sist.get(p) || 0) + 700 - Date.now();
    if (vent > 0) await t.sov(vent);
    sist.set(p, Date.now());
    const m = Motor.velg(parti(sp), { niva: 2, tilfeldig: rnd });
    const n = sp.trekk.length;
    await p.klikk(`#skjerm .hp-hull[data-v="${m[0]}"]`, 60);
    await p.vent(`document.querySelector('#skjerm .hp-hull.valgt[data-v="${m[0]}"]')`, 2000);
    await p.trekk(`#skjerm .hp-hull[data-v="${m[1]}"]`, `Rusj.S.spill.trekk.length > ${n}`);
  };

  await a.apne();
  await a.klikk('[data-h="nytt"]');
  await a.ventSkjerm("oppsett");
  await a.klikk('[data-h="start"]');
  await a.ventSkjerm("spill");
  await flytt(a, await a.spill());
  await a.klikk('[data-h="tilbake"]');
  await a.ventSkjerm("hjem");
  const lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
  t.sjekk(!!lagret && JSON.parse(lagret).spill, "Spillet mot mobilen ble ikke lagret før nettkampen");

  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 2`, 8000);
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`document.querySelectorAll(".nett-seter li:not(.ledig)").length === 3`, 8000);
  await a.bilde("venterom-tre");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm("spill");
  const sp0 = await a.spill();
  t.sjekk(sp0.plasser === 3 && JSON.stringify(sp0.seter) === "[0,2,4]", `Ikke tre plasser: ${JSON.stringify([sp0.plasser, sp0.seter])}`);
  // Each phone: its own pegs at the bottom of the board.
  for (const [p, s] of [[a, 0], [b, 1], [c, 2]]) {
    const topp = await p.js(`Math.min(...Array.from(document.querySelectorAll("#skjerm .hp-brikke.${FARGE[sp0.seter[s]]}")).map((el) => parseFloat(el.parentElement.style.top)))`);
    t.sjekk(topp > 70, `${p.navn}: brikkene sine står ikke nederst (top ${topp} %)`);
  }
  await b.bilde("egen-spiss-nederst");
  await t.fullt(lenke);

  const nokkel = (sp) => [sp.trekk, sp.resultat];
  let alle = [a, b, c];
  let tilbake = false;
  let borte = false;
  for (let steg = 0; steg < 600; steg++) {
    const sp = await a.spill();
    if (sp.resultat) break;
    if (!tilbake && sp.trekk.length >= 5) {
      tilbake = true;
      await t.gjenoppkoble(b, a, nokkel);
      continue;
    }
    if (!borte && sp.trekk.length >= 10) {
      borte = true;
      await c.klikk("#tilbake");
      await c.vent(`document.querySelector('#ark [data-h="ark-svar"][data-v="ja"]')`, 4000);
      if (t.norsk) t.sjekk(/spiller videre uten deg/.test(await c.tekst("#ark")), `C fikk ikke vite at de andre spiller videre: «${await c.tekst("#ark")}»`);
      await c.bilde("forlate-sporsmal");
      await c.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
      await c.ventSkjerm("hjem");
      alle = [a, b];
      for (const p of alle) await p.vent(`Rusj.S.spill.trekk.some((m) => m[0] === -1)`, 8000);
      const etter = await a.spill();
      t.sjekk(!parti(etter).b.includes(2), "Brikkene til C står fortsatt på brettet");
      t.sjekk(!(await a.finnes('#ark [data-h="nett-forlat"]')) && !(await b.finnes('#ark [data-h="nett-forlat"]')), "Kampen ble avbrutt for de andre da C gikk");
      t.sjekk(await a.js("Rusj.nett.erUte(2) && Rusj.nett.ute().length === 1"), "Kit-en vet ikke at plass 3 er ute");
      await a.bilde("c-forlot");
      await b.bilde("c-forlot");
      continue;
    }
    let p = null;
    for (const q of alle) if (await q.minTur()) p = q;
    if (!p) {
      await t.sov(150);
      continue;
    }
    const egen = await p.spill();
    if (borte) t.sjekk(parti(egen).tur !== 2, "C sin tur kom tilbake etter at C gikk");
    await flytt(p, egen);
    if (steg === 3) await p.bilde("midt-i-kampen");
  }
  t.sjekk(tilbake && borte, "Kampen ble for kort til å teste gjenoppkobling og at C går");
  for (const p of alle) await p.ventSkjerm("slutt", 15000);
  const sa = await a.spill();
  const sb = await b.spill();
  t.sjekk(JSON.stringify(nokkel(sa)) === JSON.stringify(nokkel(sb)), "Sluttstillingen er ulik på de to mobilene");
  t.sjekk([0, 1].includes(sa.resultat.vinner) && sa.resultat.grunn === "mal" && sa.resultat.plass[2] === 2, `Feil resultat: ${JSON.stringify(sa.resultat)}`);
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  await a.bilde("kaaring");
  await b.bilde("kaaring");

  await b.klikk('[data-h="nett-ny"]');
  for (const p of alle) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "spill"`, 10000);
  t.sjekk((await a.spill()).plasser === 2 && (await a.spill()).forste === 1, "Ny kamp er ikke for de to som er igjen, med B først");
  await a.bilde("ny-kamp");
  await t.forlat(a);
  await b.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await b.klikk('#ark [data-h="nett-forlat"]');
  await b.ventSkjerm("hjem");
  const utenTid = (s) => JSON.stringify({ ...JSON.parse(s), _tid: 0 });
  t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
}
