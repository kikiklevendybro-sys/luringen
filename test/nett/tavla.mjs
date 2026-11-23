// Tavla (backgammon) on the net: A has a game against the phone saved, with the doubling cube on
// (the room's setup), makes a room; B joins from the link; each roll is a move (the same dice on both
// phones), each turn is tapped checker by checker on the mover's phone and sent as one move; one
// double is offered and taken; B closes its tab half-way and comes back; both see the result;
// «Ny kamp»; A leaves; A's saved game is untouched (test/nett-kamp.mjs).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";

// The game's own rules, loaded without the kit (to choose the moves, as a player would).
const T = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/tavla/spill.js", import.meta.url), "utf8"), { window, performance, setTimeout, clearTimeout, document: { querySelector: () => null } });
  return window.RusjTavla;
})();
const egen = (s, punkt) => (s === 0 ? punkt : 25 - punkt);
const pips = (sp) => T.pip(Int8Array.from(sp.pos), 0) + T.pip(Int8Array.from(sp.pos), 1);

export default async function (t) {
  const rnd = T.rng(11);
  let doblet = false;
  await nettKamp(t, {
    lagret: "tavla.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="kube"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`Rusj.S.spill && Rusj.S.spill.kube`, 4000);
      await t.sov(400);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: "#skjerm .tv-p",
    async trekk(p, sp) {
      const s = sp.tur;
      if (sp.tilbud >= 0) {
        await p.trekk('#skjerm [data-h="ta"]', "Rusj.S.spill.tilbud < 0");
        return;
      }
      if (!sp.kast) {
        if (!doblet && pips(sp) < 260 && (await p.finnes('#skjerm [data-h="doble"]'))) {
          doblet = true;
          await p.trekk('#skjerm [data-h="doble"]', "Rusj.S.spill.tilbud >= 0");
          return;
        }
        await p.trekk('#skjerm .dokk [data-h="kast"]', "!!Rusj.S.spill.kast");
        return;
      }
      // Each checker: tap it, then where it goes (the phone's own choice of play, one step at a time).
      await p.vent(`document.querySelector("#skjerm .tv-brett.din")`, 8000);
      for (let k = 0; k < 5; k++) {
        const naa = await p.spill();
        if (!T.lovligeSteg(Int8Array.from(naa.pos), s, naa.rest).length) break;
        const m = T.velgTrekk(Int8Array.from(naa.pos), s, naa.rest, 2, rnd)[0];
        const n = naa.steg.length;
        await p.klikk(m.f === 25 ? `#skjerm .tv-bar[data-side="${s}"]` : `#skjerm .tv-p[data-v="${egen(s, m.f)}"]`, 60);
        await p.klikk(m.t === 0 ? `#skjerm .tv-ut[data-side="${s}"]` : `#skjerm .tv-p[data-v="${egen(s, m.t)}"]`, 60);
        await p.vent(`Rusj.S.spill.steg.length > ${n} || Rusj.S.spill.resultat`, 4000);
      }
      await p.trekk('#skjerm .dokk [data-h="ferdig"]', `Rusj.S.spill.tur !== ${s} || !!Rusj.S.spill.resultat`);
    },
    async ingenTur(a, b, sp) {
      // The game is over: both go to «Kåringen» (one game in this match).
      if (sp.resultat) for (const p of [b, a]) if (await p.finnes('#skjerm [data-h="kaaring"]')) await p.klikk('#skjerm [data-h="kaaring"]');
      await t.sov(200);
    },
    nokkel: (sp) => [sp.pos, sp.tur, sp.kast, sp.poeng, sp.kubeVerdi, sp.kubeEier, sp.tilbud, sp.resultat],
    maksSteg: 900,
    gjenoppkoble: (sp) => !sp.kast && !sp.resultat && sp.tilbud < 0 && pips(sp) < 300,
    async kamp2(a, b) {
      t.sjekk(doblet, "Ingen dobling ble tilbudt");
      const sp = await a.spill();
      t.sjekk(sp.poeng.join() === "0,0" && sp.kube && sp.kubeVerdi === 1, "Ny kamp startet ikke på nytt med doblingskuben");
    },
  });
}
