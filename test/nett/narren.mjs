// Narren (Idiot) on the net: A has a game against the phone saved, with the house rule «Åtteren»
// switched on, and makes a room; B joins from the link and A starts with two (of up to four); a
// third phone is told the match has begun. Each swaps on its own phone (A swaps one card, B sees
// A's open cards change), then every play, pick-up and blind card is a move – the same table on
// both phones – to the end; B closes its tab half-way and comes back; «Ny kamp» moves the dealer on
// and keeps the house rule; A leaves; A's saved game is untouched (test/nett-kamp.mjs).
// Then three phones: each sees only its own hand; a phone that sends a move out of turn changes
// nothing; C leaves in its turn, its cards go out of play, and A and B play on to the end, where C
// is listed as having left.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";

// The game's own rules and phone player, loaded without the kit (to choose a legal move).
const { Mobil } = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/narren/spill.js", import.meta.url), "utf8"), { window, console });
  return window.Narren;
})();

const nokkel = (sp) => [sp.r.hender, sp.r.opp, sp.r.ned, sp.r.bunke, sp.r.brent.length, sp.r.tur, sp.r.fase, sp.r.klar, sp.r.ute, sp.r.narr, sp.r.trekk, sp.r.borte];

// One move by p, tapped in the game: «Ferdig» after swapping, or what the phone player would play.
async function spillEtt(p) {
  await p.vent("!Rusj.nett.venter()", 8000);
  const sp = await p.spill();
  const r = sp.r;
  const meg = await p.nettMeg();
  if (r.fase === "bytte") {
    if (!r.klar[meg]) await p.trekk('#skjerm .dokk [data-h="byttferdig"]', `Rusj.S.spill.r.klar[${meg}]`);
    return;
  }
  if (r.fase !== "spill" || r.tur !== meg) return;
  const endret = `Rusj.S.spill.r.trekk !== ${r.trekk} || Rusj.S.spill.r.fase !== "spill"`;
  const v = Mobil.velg(r, meg, 2, () => 0);
  if (v.type === "blind") return p.trekk(`.nr-mittbord [data-h="blind"][data-v="${v.i}"]`, endret);
  if (v.type === "ta") return p.trekk('#skjerm .dokk [data-h="ta"]', endret);
  // A tap on a card picks every card of that rank; then «Legg».
  if (!sp.valgt.includes(v.kort[0])) await p.klikk(`.nr-meg [data-h="kort"][data-v="${v.kort[0]}"]`);
  return p.trekk('#skjerm .dokk [data-h="legg"]', endret);
}

export default async function (t) {
  let byttet = false;
  const { a, b } = await nettKamp(t, {
    lagret: "narren.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="atter"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.klikk('[data-h="byttferdig"]');
      await a.vent(`Rusj.S.spill.r.fase === "spill"`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    async trekk(p, sp) {
      const meg = await p.nettMeg();
      if (!byttet && sp.r.fase === "bytte" && !sp.r.klar[meg]) {
        // One swap: a hand card for an open table card – the others see the open cards change.
        byttet = true;
        const [h, o] = [sp.r.hender[meg][0], sp.r.opp[meg][0]];
        await p.klikk(`.nr-hand [data-h="kort"][data-v="${h}"]`);
        await p.klikk(`.nr-mittbord [data-h="kort"][data-v="${o}"]`);
        await p.vent(`Rusj.S.spill.r.opp[${meg}].includes(${h}) && Rusj.S.spill.r.hender[${meg}].includes(${o})`, 8000);
        await p.bilde("byttet");
      }
      await spillEtt(p);
    },
    async ingenTur(a, b, sp) {
      // The game is over: both go to «Kåringen».
      if (sp.r.fase === "slutt") for (const p of [b, a]) if (await p.finnes('[data-h="kaaring"]')) await p.klikk('[data-h="kaaring"]');
      await t.sov(300);
    },
    nokkel,
    maksSteg: 700,
    gjenoppkoble: (sp) => sp.r.fase === "spill" && sp.r.trekk >= 8,
    async kamp2(a, b) {
      const sa = await a.spill();
      const sb = await b.spill();
      t.sjekk(sa.r.giver === 0 && sb.r.giver === 0 && sa.r.fase === "bytte", "Giveren flyttet seg ikke én plass i kamp 2");
      t.sjekk(sa.r.regler.atter && sb.r.regler.atter && sa.r.regler.fire, "Husreglene fra verten ble ikke med i rommet");
      t.sjekk(JSON.stringify(sa.r.hender) === JSON.stringify(sb.r.hender), "Kamp 2 er ikke delt likt ut på mobilene");
    },
  });
  t.sjekk(byttet, "Byttet før spillet ble ikke testet");

  // ---------- Three phones; C leaves, A and B play on ----------
  const c = await t.telefon("C", { rolig: true });
  await a.apne();
  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`Rusj.nett.antall() === 3 && document.querySelector('[data-h="nett-start"]')`, 10000);
  await a.bilde("venterom-tre");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm("spill");
  t.sjekk((await c.nettMeg()) === 2, "C har ikke plass 2");
  let med = [a, b, c];
  const likt = async (hva) => {
    const mal = JSON.stringify(nokkel(await a.spill()));
    for (let i = 0; i < 40; i++) {
      let alle = true;
      for (const p of med) if (JSON.stringify(nokkel(await p.spill())) !== mal) alle = false;
      if (alle) return;
      await t.sov(200);
    }
    t.feil(`Mobilene er uenige etter ${hva}`);
  };
  const sist = new Map();
  let utenTur = false;
  let borte = false;
  for (let steg = 0; steg < 900; steg++) {
    const sp = await a.spill();
    if (sp.r.fase === "slutt") break;
    if (sp.r.fase === "spill" && !utenTur && sp.r.trekk >= 4) {
      // Only one's own hand face up; the others' hands are backs with a count.
      utenTur = true;
      for (const [i, p] of med.entries()) {
        const egen = await p.spill();
        const apne = [0, 1, 2].filter((q) => q !== i).reduce((n, q) => n + egen.r.opp[q].filter((k) => k != null).length, 0);
        t.sjekk((await p.js(`document.querySelectorAll(".nr-hand .sk-opp").length`)) === egen.r.hender[i].length, `${p.navn}: ser ikke hele sin egen hånd`);
        t.sjekk((await p.js(`document.querySelectorAll(".nr-andre .sk-opp").length`)) === apne, `${p.navn}: ser mer enn de åpne bordkortene til de andre`);
      }
      await c.bilde("egen-hand");
      // A move sent out of turn, straight to the room: every phone ignores it.
      const ikke = med[(sp.r.tur + 1) % 3];
      const for_ = JSON.stringify(nokkel(sp));
      await ikke.js(`Rusj.nett.send({ ta: 1 })`);
      await t.sov(900);
      await ikke.js(`Rusj.nett.send({ l: [Rusj.S.spill.r.hender[Rusj.nett.meg()][0]] })`);
      await t.sov(900);
      for (const p of med) t.sjekk(JSON.stringify(nokkel(await p.spill())) === for_, `${p.navn}: et trekk utenom tur ble spilt`);
      continue;
    }
    if (!borte && sp.r.fase === "spill" && sp.r.trekk >= 10 && sp.r.tur === 2) {
      // C leaves in its own turn: skipped from now on, its cards out of play.
      borte = true;
      await c.bilde("for-forlat");
      await t.forlat(c);
      med = [a, b];
      for (const p of med) {
        await p.vent(`Rusj.nett.erUte(2) && (Rusj.S.spill.r.borte || []).includes(2) && Rusj.S.spill.r.tur !== 2`, 10000);
        t.sjekk(await p.js("Rusj.nett.aktiv()"), `${p.navn}: kampen stoppet da C gikk`);
      }
      const etter = await a.spill();
      t.sjekk(etter.r.hender[2].length === 0 && etter.r.opp[2].every((k) => k == null) && etter.r.ned[2].every((k) => k == null), "C sine kort er fortsatt i spill");
      if (t.norsk) t.sjekk(/Forlot kampen/.test(await a.tekst(".nr-andre")), "A ser ikke at C forlot kampen");
      await a.bilde("c-forlot");
      await likt("at C forlot kampen");
      continue;
    }
    let p = null;
    for (const q of med) if (await q.minTur()) p = q;
    if (!p) {
      await t.sov(200);
      continue;
    }
    const vent = (sist.get(p) || 0) + 600 - Date.now();
    if (vent > 0) await t.sov(vent);
    sist.set(p, Date.now());
    await spillEtt(p);
    await likt(`steg ${steg}`);
  }
  t.sjekk(utenTur && borte, "Trekk utenom tur eller at C forlot kampen ble ikke testet");
  t.sjekk((await a.spill()).r.fase === "slutt", "A og B spilte ikke kampen ferdig etter at C gikk");
  await likt("slutten");
  for (const p of med) {
    await p.vent(`document.querySelector('[data-h="kaaring"]')`, 8000);
    await p.klikk('[data-h="kaaring"]');
    await p.ventSkjerm("slutt");
  }
  const slutt = await a.spill();
  t.sjekk(!slutt.r.ute.includes(2) && slutt.r.narr !== 2, "C fikk en plass på kåringen");
  if (t.norsk) t.sjekk(/Forlot kampen/.test(await a.tekst(".nr-plasser")), "Kåringen viser ikke at C forlot kampen");
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  await a.bilde("kaaring-tre");
  await b.bilde("kaaring-tre");
  await t.forlat(b);
  await a.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await a.klikk('#ark [data-h="nett-forlat"]');
  await a.ventSkjerm("hjem");
}
