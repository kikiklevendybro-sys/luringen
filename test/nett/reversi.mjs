// Reversi on the net: A has a game against the phone saved («Ett parti»), makes a room; B joins from
// the link; they play the game to the end on the dots (B closes its tab after 20 discs and comes
// back), «Ny kamp» gives the guest black; A leaves; A's saved game is untouched (test/nett-kamp.mjs).
import { nettKamp } from "../nett-kamp.mjs";

export default async function (t) {
  await nettKamp(t, {
    lagret: "reversi.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="mal"][data-v="1"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`document.querySelector('.rv-rute.mulig')`, 8000);
      await a.klikk(".rv-rute.mulig");
      await a.vent(`Rusj.S.spill.trekk.length >= 2 && document.querySelector('.rv-rute.mulig')`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: ".rv-rute",
    async trekk(p, sp) {
      const n = sp.trekk.length;
      await p.vent(`document.querySelector('.rv-rute.mulig')`, 8000);
      await p.trekk(".rv-rute.mulig", `Rusj.S.spill.trekk.length > ${n} || !!Rusj.S.spill.resultat`);
    },
    nokkel: (sp) => [sp.trekk, sp.poeng, sp.runde],
    gjenoppkoble: (sp) => sp.trekk.length >= 20,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).starter === 1 && (await b.spill()).starter === 1, "Gjesten har ikke svart i kamp 2");
      t.sjekk((await b.spill()).trekk.length === 0, "Ny kamp startet ikke på et nytt brett");
    },
  });
}
