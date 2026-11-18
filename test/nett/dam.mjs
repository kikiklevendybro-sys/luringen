// Dam on the net: A has a game against the phone saved, makes a room; B joins from the link (each
// phone has its own colour at the bottom); one game to the end – captures are mandatory, a multi-jump
// is tapped square by square and sent as one move (a new game after a draw) – B closes its tab after
// 10 moves and comes back; «Ny kamp» gives the guest white; A leaves; A's saved game is untouched
// (test/nett-kamp.mjs).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";

// The game's own rules, loaded without the kit (to see the legal moves, as a player would).
const { Dam } = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/dam/spill.js", import.meta.url), "utf8"), { window, performance, setTimeout, clearTimeout });
  return window.Dam;
})();

export default async function (t) {
  await nettKamp(t, {
    lagret: "dam.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`Rusj.S.spill.trekk.length === 0`, 8000);
      await a.klikk('.dm-rute[data-v="c3"]');
      await a.klikk('.dm-rute[data-v="d4"]');
      await a.vent(`Rusj.S.spill.trekk.length >= 2`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: ".dm-rute.mork",
    async trekk(p, sp) {
      // The longest capture (captures are mandatory anyway), else a random move; tapped as a
      // person would: the piece, then each landing square until the move is played.
      const lov = Dam.lastParti(Dam.START, sp.trekk).lovlige;
      const lengst = Math.max(...lov.map((m) => m.slag.length));
      const valg = lov.filter((m) => m.slag.length === lengst);
      const m = valg[Math.floor(Math.random() * valg.length)];
      const n = sp.trekk.length;
      const rute = (s) => `.dm-rute[data-v="${Dam.navn(s)}"]`;
      await p.vent(`!!document.querySelector('${rute(m.fra)}')`, 4000);
      await p.klikk(rute(m.fra));
      await p.vent(`document.querySelector('.dm-rute.valgt')`, 4000);
      for (const s of m.sti) {
        if ((await p.spill()).trekk.length > n) break;
        await p.klikk(rute(s));
        await t.sov(120);
      }
      await p.vent(`Rusj.S.spill.trekk.length > ${n}`, 8000);
    },
    async ingenTur(a, b, sp) {
      // A draw: B starts a new game.
      if (sp.resultat && (await b.finnes('[data-h="runde"]'))) await b.klikk('[data-h="runde"]');
      await a.vent(`!Rusj.S.spill.resultat || Rusj.S.skjerm === "slutt"`, 8000);
    },
    nokkel: (sp) => [sp.trekk, sp.poeng, sp.runde],
    maksSteg: 600,
    gjenoppkoble: (sp) => !sp.resultat && sp.trekk.length >= 10,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).starter === 1 && (await b.spill()).starter === 1, "Gjesten har ikke hvit i kamp 2");
    },
  });
}
