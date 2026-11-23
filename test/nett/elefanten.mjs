// Elefanten on the net: A has a game for two saved (12 cards), makes a room; B joins and A starts
// with two (of up to four); a third phone is told the match has begun. The same deal on both phones
// (7 pairs for two, so somebody wins); every card turned is a move from the one whose turn it is –
// a pair gives another turn, a miss passes it; a tap out of turn changes nothing. B closes its tab
// half-way and comes back; both see «Kåringen»; «Ny kamp» lets B begin; A leaves (the back
// button); A's saved game is untouched. Then three phones: C leaves on its turn (maybe with a card
// up), A and B play the board to the end – a tie-break board too, if they end level.
import { nettKamp } from "../nett-kamp.mjs";
import { treSpillere } from "../nett-videre.mjs";

const nokkel = (sp) => [sp.kort, sp.funnet, sp.opp, sp.tur, sp.poeng, sp.trekk, sp.omkamp, sp.ferdig];

export default async function (t) {
  let bom = 0;
  let par = 0;
  // One card for the phone whose turn it is: the first card not found; then its mate, or (every
  // third turn) a card that is not – a miss.
  const trekk = async (p, sp, andre) => {
    for (const q of [p, ...andre]) if ((await q.skjerm()) === "omkamp") await q.klikk('[data-h="start-omkamp"]');
    if ((await p.skjerm()) === "omkamp") await p.ventSkjerm("spill");
    sp = await p.spill();
    const fri = sp.kort.map((_, i) => i).filter((i) => sp.funnet[i] < 0 && !sp.opp.includes(i));
    let i;
    if (!sp.opp.length) i = fri[0];
    else {
      const a = sp.opp[0];
      const make = fri.find((k) => sp.kort[k] === sp.kort[a]);
      const ikke = fri.find((k) => sp.kort[k] !== sp.kort[a]);
      i = (par + bom) % 3 === 2 && ikke != null ? ikke : make;
      if (i === make) par++;
      else bom++;
    }
    await p.trekk(`.ele-kort[data-v="${i}"]`, `Rusj.S.spill.trekk !== ${sp.trekk} || Rusj.S.spill.opp.includes(${i}) || Rusj.S.spill.ferdig || Rusj.S.spill.omkamp !== ${sp.omkamp}`);
  };

  await nettKamp(t, {
    lagret: "elefanten.v1",
    vertStarter: true,
    forlat: '[data-h="tilbake"]',
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="modus"][data-v="sammen"]');
      await a.klikk('[data-h="storrelse"][data-v="14"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`document.querySelector('.ele-kort[data-v="0"]')`, 8000);
      await t.sov(700);
      await a.klikk('.ele-kort[data-v="0"]');
      await a.vent(`Rusj.S.spill.opp.length === 1`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: ".ele-kort:not(.funnet)",
    trekk,
    nokkel,
    maksSteg: 300,
    gjenoppkoble: (sp) => sp.funnet.filter((f) => f >= 0).length >= 4 && !sp.opp.length,
    async kamp2(a, b) {
      const sa = await a.spill();
      t.sjekk(sa.tur === 1 && (await b.spill()).tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk(sa.kort.length === 14 && sa.funnet.every((f) => f < 0), "Ny kamp fikk ikke et nytt brett med 14 kort");
      t.sjekk(JSON.stringify(sa.kort) === JSON.stringify((await b.spill()).kort), "Ny kamp: ulike brett på de to mobilene");
    },
  });
  t.sjekk(par > 0 && bom > 0, `For lite testet: ${par} par, ${bom} bom`);

  await treSpillere(t, {
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("elefanten.v1"))}, JSON.stringify({ antall: 3, oppsett: { modus: "sammen", styrke: "unge", tema: "dyr", kort: 12, kikk: false }, rekorder: {}, elefant: {}, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    trekk,
    nokkel,
    forlatNar: (sp) => sp.funnet.some((f) => f >= 0),
    async etterForlat(a) {
      const sp = await a.spill();
      t.sjekk(sp.ute.includes(2) && sp.tur !== 2, "C er ikke tatt ut av turene");
      t.sjekk(!sp.opp.length || sp.opp.every((i) => sp.funnet[i] < 0), "Et kort C hadde snudd, ligger igjen");
      t.sjekk(await a.finnes(".ele-spiller.ute"), "C vises ikke som ute i poenglista");
    },
  });
}
