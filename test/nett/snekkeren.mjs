// Snekkeren (dots and boxes) on the net: A has a game against the phone saved, makes a room; B joins
// from the link; one 4 × 4 game to the end (a closed box gives another line) – B closes its tab after
// 8 lines and comes back; «Ny kamp» lets the guest open; A leaves; A's saved game is untouched
// (test/nett-kamp.mjs).
import { nettKamp } from "../nett-kamp.mjs";

const FRI = ".sn-brett.fri .sn-linje";

export default async function (t) {
  await nettKamp(t, {
    lagret: "snekkeren.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`document.querySelector('${FRI}')`, 8000);
      await a.klikk(FRI);
      await a.vent(`Rusj.S.spill.trekk.length >= 2 && document.querySelector('${FRI}')`, 15000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: ".sn-linje",
    async trekk(p, sp) {
      const n = sp.trekk.length;
      await p.vent(`document.querySelector('${FRI}')`, 8000);
      await p.trekk(FRI, `Rusj.S.spill.trekk.length > ${n}`);
    },
    nokkel: (sp) => [sp.trekk, sp.resultat],
    gjenoppkoble: (sp) => !sp.resultat && sp.trekk.length >= 8,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).starter === 1 && (await b.spill()).starter === 1, "Gjesten begynner ikke kamp 2");
    },
  });
}
