// Bonden (tic-tac-toe) on the net: A has a game against the phone saved, makes a room; B joins from
// the link; «Først til 3» to the end, each drawing in the first free cell (B closes its tab in
// round 2 and comes back; B starts the next round), «Ny kamp» lets the guest open; A leaves; A's
// saved game is untouched (test/nett-kamp.mjs).
import { nettKamp } from "../nett-kamp.mjs";

const FRI = '.bo-celle:not([aria-disabled="true"])';

export default async function (t) {
  await nettKamp(t, {
    lagret: "bonden.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`document.querySelector('${FRI}')`, 8000);
      const n = (await a.spill()).trekk.length;
      await a.klikk(FRI);
      await a.vent(`Rusj.S.spill.trekk.length >= ${n + 2} && document.querySelector('${FRI}')`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: ".bo-celle",
    async trekk(p, sp) {
      const n = sp.trekk.length;
      await p.vent(`document.querySelector('${FRI}')`, 8000);
      await p.trekk(FRI, `Rusj.S.spill.trekk.length > ${n} || !!Rusj.S.spill.resultat`);
    },
    async ingenTur(a, b, sp) {
      // The round is over: whoever is quicker starts the next one (here B); the last one ends the match.
      if (sp.resultat && (await b.finnes('[data-h="runde"]'))) await b.klikk('[data-h="runde"]');
      await a.vent(`!Rusj.S.spill.resultat || Rusj.S.skjerm === "slutt"`, 8000);
    },
    nokkel: (sp) => [sp.trekk, sp.poeng, sp.runde],
    gjenoppkoble: (sp) => sp.runde === 2 && sp.trekk.length === 3,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).starter === 1 && (await b.spill()).starter === 1, "Gjesten begynner ikke kamp 2");
      t.sjekk((await b.spill()).poeng.join() === "0,0", "Ny kamp startet ikke på null");
    },
  });
}
