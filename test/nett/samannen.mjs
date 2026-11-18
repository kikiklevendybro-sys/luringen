// Såmannen (kalaha) on the net: A has a game against the phone saved, makes a room; B joins from the
// link (each phone has its own side near); one game to the end – B closes its tab after 6 moves
// and comes back; «Ny kamp» lets the guest open; A leaves; A's saved game is untouched
// (test/nett-kamp.mjs).
import { nettKamp } from "../nett-kamp.mjs";

export default async function (t) {
  await nettKamp(t, {
    lagret: "samannen.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`document.querySelector('.sa-brett.fri .sa-hull.kan')`, 8000);
      await a.klikk(".sa-hull.kan");
      await a.vent(`Rusj.S.spill.trekk.length >= 1 && document.querySelector('.sa-brett.fri .sa-hull.kan')`, 15000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: ".sa-hull",
    async trekk(p, sp) {
      const n = sp.trekk.length;
      await p.vent(`document.querySelector('.sa-brett.fri .sa-hull.kan')`, 8000);
      await p.trekk(".sa-hull.kan", `Rusj.S.spill.trekk.length > ${n}`);
    },
    nokkel: (sp) => [sp.trekk, sp.resultat],
    gjenoppkoble: (sp) => !sp.resultat && sp.trekk.length >= 6,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).starter === 1 && (await b.spill()).starter === 1, "Gjesten begynner ikke kamp 2");
    },
  });
}
