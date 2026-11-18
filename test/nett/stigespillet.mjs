// Stigespillet on the net: A has a game saved on the phone, makes a room; B joins from the link and A
// starts with two (of up to four); a third phone is told the match has begun. They throw to the end –
// every throw the same on both phones (from the room's chance), a six gives another throw – B closes
// its tab after 8 throws and comes back; «Ny kamp» lets the next seat begin; A leaves; A's saved game
// is untouched (test/nett-kamp.mjs).
import { nettKamp } from "../nett-kamp.mjs";

const KAST = '#skjerm .dokk [data-h="kast"]:not([disabled])';

export default async function (t) {
  await nettKamp(t, {
    lagret: "stigespillet.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`document.querySelector('${KAST}')`, 8000);
      await a.klikk(KAST);
      await a.vent(`Rusj.S.spill.stat.kast >= 1 && !document.querySelector('#sg-brett[data-opptatt]')`, 15000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: '#skjerm .dokk [data-h="kast"]',
    async trekk(p, sp) {
      const n = sp.stat.kast;
      await p.vent(`document.querySelector('${KAST}') && !document.querySelector('#sg-brett[data-opptatt]')`, 15000);
      await p.trekk(KAST, `Rusj.S.spill.stat.kast > ${n}`);
    },
    nokkel: (sp) => [sp.pos, sp.tur, sp.stat.kast, sp.ferdig, sp.vinner],
    maksSteg: 900,
    gjenoppkoble: (sp) => !sp.ferdig && sp.stat.kast >= 8,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).tur === 1 && (await b.spill()).tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk((await b.spill()).pos.slice(0, 2).join() === "1,1", "Ny kamp startet ikke på rute 1");
    },
  });
}
