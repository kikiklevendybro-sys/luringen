// Lykkegrisen (10 000) on the net: A has a game against the phone saved («Mål 5000»), makes a room;
// B joins from the link and A starts with two (of up to eight); a third phone is told the match has
// begun. Every roll, «Velg poengene», «Stopp» and «Gi turen videre» is a move – the same dice on both
// phones – to the end of the last round; B closes its tab half-way and comes back; both go to the
// result; «Ny kamp» lets the next seat begin; A leaves; A's saved game is untouched (test/nett-kamp.mjs).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";

// The game's own rules, loaded without the kit (to count the points chosen, as a player would).
const L = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/lykkegrisen/spill.js", import.meta.url), "utf8"), { window, performance, setTimeout, clearTimeout, document: { querySelector: () => null } });
  return window.RusjLykkegrisen;
})();

const ROLIG = `!document.querySelector('#lg-brett[data-ruller]') && !Rusj.nett.venter()`;

export default async function (t) {
  await nettKamp(t, {
    lagret: "lykkegrisen.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="mal"][data-v="5000"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`document.querySelector('#skjerm [data-h="kast"]')`, 8000);
      await a.klikk('#skjerm [data-h="kast"]');
      await a.vent(`Rusj.S.spill.status !== "kast" && !document.querySelector('#lg-brett[data-ruller]')`, 15000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: '#skjerm [data-h="velg"]',
    // One step of the turn: roll, take the best points, stop at 400 (or roll on), or pass on.
    async trekk(p, sp) {
      await p.vent(ROLIG, 15000);
      sp = await p.spill();
      const naa = JSON.stringify([sp.status, sp.terninger, sp.valgt, sp.tur, sp.klar]);
      const endret = `JSON.stringify([Rusj.S.spill.status, Rusj.S.spill.terninger, Rusj.S.spill.valgt, Rusj.S.spill.tur, Rusj.S.spill.klar]) !== ${JSON.stringify(naa)}`;
      if (sp.status === "kast") return p.trekk('#skjerm .dokk [data-h="kast"]', endret);
      if (sp.status === "tomt") return p.trekk('#skjerm .dokk [data-h="neste"]', endret);
      if (!sp.valgt.some(Boolean)) return p.trekk('#skjerm [data-h="beste"]', endret);
      const v = L.verdi(sp.terninger.filter((_, i) => sp.valgt[i]), sp.tabell);
      const stopp = sp.turPoeng + v >= 400 && (await p.finnes('#skjerm .dokk [data-h="stopp"]:not([disabled])'));
      return p.trekk(stopp ? '#skjerm .dokk [data-h="stopp"]' : '#skjerm .dokk [data-h="kast"]', endret);
    },
    async ingenTur(a, b, sp) {
      // The last round is over: both go to «Kåringen».
      if (sp.klar) for (const p of [b, a]) if (await p.finnes('[data-h="kaaring"]')) await p.klikk('[data-h="kaaring"]');
      await t.sov(300);
    },
    nokkel: (sp) => [sp.totaler, sp.logg, sp.tur, sp.terninger, sp.valgt, sp.status, sp.klar],
    maksSteg: 1500,
    gjenoppkoble: (sp) => !sp.klar && sp.logg.flat().length >= 4,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).tur === 1 && (await b.spill()).tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk((await b.spill()).totaler.join() === "0,0", "Ny kamp startet ikke på null");
    },
  });
}
