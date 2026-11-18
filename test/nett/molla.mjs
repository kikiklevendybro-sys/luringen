// Mølla on the net: A has a game against the phone saved, makes a room; B joins from the link; one
// game to the end – placing, mills that take a piece (picked on the phone, sent as one move), then
// moving (a new game after a draw) – B closes its tab after 12 moves and comes back; «Ny kamp» gives
// the guest white; A leaves; A's saved game is untouched (test/nett-kamp.mjs).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";

// The game's own rules, loaded without the kit (to find a mill, as a player would see one).
const { Molle } = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/molla/spill.js", import.meta.url), "utf8"), { window, performance, setTimeout, clearTimeout });
  return window.Molla;
})();

export default async function (t) {
  await nettKamp(t, {
    lagret: "molla.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`document.querySelector('.ml-punkt.mulig')`, 8000);
      await a.klikk(".ml-punkt.mulig");
      await a.vent(`Rusj.S.spill.trekk.length >= 2 && document.querySelector('.ml-punkt.mulig')`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: ".ml-punkt",
    async trekk(p, sp) {
      // A mill whenever there is one (and the capture with it), else a random move: tapped point
      // by point as a person would (pick up, put down, take).
      const pp = Molle.spillUt(sp.trekk);
      const lov = Molle.lovlige(pp);
      const moller = lov.filter((m) => m[2] >= 0);
      const m = moller.length ? moller[Math.floor(Math.random() * moller.length)] : lov[Math.floor(Math.random() * lov.length)];
      const n = sp.trekk.length;
      const punkt = (i) => `.ml-punkt[data-v="${Molle.navn(i)}"]`;
      await p.vent(`document.querySelector('.ml-punkt.mulig, .ml-punkt.kan')`, 8000);
      if (m[0] >= 0) {
        await p.klikk(punkt(m[0]));
        await p.vent(`document.querySelector('.ml-punkt.valgt')`, 4000);
      }
      if (m[2] < 0) return p.trekk(punkt(m[1]), `Rusj.S.spill.trekk.length > ${n}`);
      await p.klikk(punkt(m[1]));
      await p.vent(`!!Rusj.S.spill.venter && document.querySelector('.ml-punkt.ta')`, 4000);
      await p.trekk(punkt(m[2]), `Rusj.S.spill.trekk.length > ${n}`);
    },
    async ingenTur(a, b, sp) {
      // A draw (50 moves without a capture): B starts a new game.
      if (sp.resultat && (await b.finnes('[data-h="runde"]'))) await b.klikk('[data-h="runde"]');
      await a.vent(`!Rusj.S.spill.resultat || Rusj.S.skjerm === "slutt"`, 8000);
    },
    nokkel: (sp) => [sp.trekk, sp.poeng, sp.runde],
    maksSteg: 600,
    gjenoppkoble: (sp) => sp.trekk.length >= 12,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).starter === 1 && (await b.spill()).starter === 1, "Gjesten har ikke hvit i kamp 2");
    },
  });
}
