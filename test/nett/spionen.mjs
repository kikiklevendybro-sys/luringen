// Spionen on the net: A has a game saved on the phone (three rounds, five minutes) and makes a room;
// B, C and D join and A starts with four; a fifth phone is told the match has begun. Every round each
// phone holds its own card – the place and a role, or «Du er spionen» on the spy's phone only, and no
// other phone has a card on screen – and taps «Klar»; then the clock runs. Round 1: someone calls
// «Stopp», everyone votes on their own phone, the spy is accused and guesses wrong. Round 2: the spy
// stops the clock on its own and names the place. Round 3: the group votes out an innocent. The
// leader of the next round starts it. B closes its tab half-way and comes back. «Ny kamp»: in match 2
// the spy leaves mid-round – the round does not count – and the three others play on to the end.
import { rollekamp } from "../nett-roller.mjs";

const nokkel = (sp) => [sp.runde, sp.fase, sp.r, sp.klar, sp.stemmer, sp.stopper, sp.anklaget, sp.gjett, sp.gjetter, sp.utfall, sp.poeng, sp.seire, sp.fangst, sp.ute, sp.ferdig, sp.spilt];
// The place's name in the page's own language, and in the order of the data (soft hyphens out).
const STED = `((i) => window.RUSJ_DATA.steder.pakker.flatMap((p) => p.steder)[i].navn.replace(/\\u00ad/g, ""))`;

export default async function (t) {
  let kort = 0;
  const plan = { tatt: false, modig: false, uskyldig: false, tom: false };
  const ren = (s) => String(s).replace(/­/g, "");
  // In round r (match 1): 1 the spy is voted out and misses, 2 the spy guesses on its own, 3 an innocent goes.
  const rundePlan = (sp, kamp) => (kamp === 2 ? 1 : sp.runde);

  const trekk = async (p, sp, alle) => {
    const meg = await p.nettMeg();
    const spion = sp.r.spioner.includes(meg);
    if (sp.fase === "kort") {
      t.sjekk(!(await p.js(`document.querySelector('[data-h="pa-klar"]').disabled === false`)), `${p.navn}: «Klar» før kortet er sett`);
      const sted = await p.js(`${STED}(${sp.r.sted})`);
      for (const q of alle) t.sjekk(!(await q.tekst(".mappe-bakside")).trim(), `${q.navn} har et kort framme før det holdes`);
      const slipp = await p.hold('.mappe[data-mappe="nett"]', 650);
      const bak = ren(await p.tekst(".mappe-bakside"));
      const html = await p.js(`document.querySelector(".mappe-bakside").innerHTML`);
      t.sjekk(html.includes("🕵️") === spion, `${p.navn}: kortet sier feil om spionen`);
      t.sjekk(bak.includes(sted) === !spion, `${p.navn}: ${spion ? "spionen ser stedet" : "stedet mangler på kortet"} («${bak.replace(/\s+/g, " ")}»)`);
      for (const q of alle) if (q !== p) t.sjekk(!(await q.tekst(".mappe-bakside")).trim(), `${q.navn} ser et kort mens ${p.navn} ser sitt`);
      if (kort++ < 2) await p.bilde(spion ? "kort-spion" : "kort-sted");
      await slipp();
      t.sjekk(!(await p.tekst(".mappe-bakside")).trim(), `${p.navn}: kortet blir stående etter at fingeren slipper`);
      return p.trekk('[data-h="pa-klar"]', `Rusj.S.spill.klar[${meg}] != null`);
    }
    if (sp.fase === "stem") {
      // Round 3: everyone (the spy too) votes for the same innocent; else for the spy (the spy for someone else).
      const kamp = await p.js("Rusj.nett.kamp()");
      const andre = [...Array(sp.antall).keys()].filter((i) => i !== meg && !sp.ute.includes(i));
      const s = sp.r.spioner[0];
      const offer = andre.concat(meg).filter((i) => i !== s).sort()[0];
      const mot = rundePlan(sp, kamp) === 3 ? (meg === offer ? andre.find((i) => i !== s) : offer) : meg === s ? andre[0] : s;
      await p.klikk(`[data-h="pa-marker"][data-v="${mot}"]`);
      if (!sp.stemmer.some((x) => x != null)) await p.bilde("stem");
      await p.trekk('[data-h="pa-stem"]', `Rusj.S.spill.stemmer == null || Rusj.S.spill.stemmer[${meg}] != null`);
      const etter = await p.spill();
      if (etter.fase === "stem") for (const q of alle) t.sjekk(!(await q.finnes(".sp-fasit, .banner")), `${q.navn} viser svaret før alle har stemt`);
      return;
    }
    if (sp.fase === "gjett") {
      // The accused spy misses: the first place in the list that is not the right one.
      const feil = await p.js(`Array.from(document.querySelectorAll('[data-h="pa-sted"]')).map((b) => Number(b.dataset.v)).find((i) => i !== ${sp.r.sted})`);
      await p.bilde("spionen-gjetter");
      await p.klikk(`[data-h="pa-sted"][data-v="${feil}"]`);
      await p.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
      plan.tatt = true;
      return p.vent(`Rusj.S.spill.fase === "resultat"`, 8000);
    }
    if (sp.fase === "resultat") {
      merk(sp);
      await p.bilde(sp.utfall.tom ? "runden-teller-ikke" : `resultat-${sp.runde}`);
      return p.trekk('[data-h="pa-neste"]', `Rusj.S.spill.runde === ${sp.runde + 1}`);
    }
  };

  // Nobody's turn: the round is on (someone calls «Stopp», or the spy guesses), or «Til kåringen».
  const merk = (sp) => {
    if (sp.utfall && sp.utfall.tom) plan.tom = true;
    if (sp.utfall && sp.utfall.grunn === "uskyldig") plan.uskyldig = true;
  };
  const ingenTur = async (alle, sp) => {
    if (sp.ferdig) {
      merk(sp);
      for (const p of alle) if ((await p.skjerm()) === "nettresultat" && (await p.finnes('[data-h="pa-kaaring"]'))) await p.klikk('[data-h="pa-kaaring"]');
      return t.sov(250);
    }
    if (sp.fase !== "runde") return t.sov(200);
    for (const p of alle) if ((await p.skjerm()) !== "nettrunde") return t.sov(200);
    const kamp = await alle[0].js("Rusj.nett.kamp()");
    const meg = await Promise.all(alle.map((p) => p.nettMeg()));
    const spion = alle[meg.findIndex((i) => sp.r.spioner.includes(i))];
    const ikke = alle[meg.findIndex((i) => !sp.r.spioner.includes(i))];
    // The spy's screen never names the place outside the list of all places.
    if (spion) {
      const sted = await spion.js(`${STED}(${sp.r.sted})`);
      const tekst = ren(await spion.js(`(() => { const k = document.querySelector("#skjerm").cloneNode(true); k.querySelector("#sp-apent")?.remove(); return k.innerText; })()`));
      t.sjekk(!tekst.includes(sted), `Spionen (${spion.navn}) ser stedet på skjermen`);
    }
    if (rundePlan(sp, kamp) === 2 && spion) {
      // The spy stops the clock on its own and names the place: a bold spy.
      await spion.bilde("runde");
      await spion.klikk('[data-h="pa-spion"]');
      await spion.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
      await spion.ventSkjerm("nettgjett");
      await spion.bilde("modig-spion");
      await spion.klikk(`[data-h="pa-sted"][data-v="${sp.r.sted}"]`);
      await spion.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
      await spion.vent(`Rusj.S.spill.fase === "resultat"`, 8000);
      plan.modig = (await spion.spill()).utfall.modig;
      return;
    }
    // «Spionen gjetter» on a phone that is not the spy: a message, nothing else.
    if (kamp === 1 && sp.runde === 1) {
      await ikke.klikk('[data-h="pa-spion"]');
      t.sjekk((await ikke.skjerm()) === "nettrunde" && !(await ikke.finnes("#ark .knapp")), `${ikke.navn}: kunne gjette stedet uten å være spion`);
    }
    await ikke.trekk('[data-h="pa-stopp"]', `Rusj.S.spill.fase !== "runde"`);
  };

  await rollekamp(t, {
    antall: 4,
    lagret: "spionen.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="runder"][data-v="3"]');
      await a.klikk('[data-h="tid"][data-v="5"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("vis");
      await a.klikk("#tilbake");
    },
    skjermer: ["nettkort", "nettrunde", "nettstem", "nettgjett", "nettresultat"],
    trekk,
    ingenTur,
    nokkel,
    gjenoppkoble: (sp) => sp.runde >= 1 && sp.fase === "resultat" && !sp.ferdig,
    // Match 2: the spy leaves as soon as the first round is on (the host too, if it is the spy).
    forlatNar: (sp) => (sp.fase === "runde" ? sp.r.spioner[0] : null),
    async etterForlat(alle, sp, i) {
      t.sjekk(sp.ute.includes(i), "Plassen som gikk, er ikke ute");
      if (sp.utfall && sp.utfall.tom) t.sjekk(sp.fase === "resultat" && sp.utfall.borte === i, "Runden ble ikke avsluttet da spionen gikk");
    },
    async kamp2(alle) {
      const sp = await alle[0].spill();
      t.sjekk(sp.runder === 3 && sp.tid === 5 && sp.forste === 1 && sp.poeng.every((x) => x === 0), "Kamp 2 startet ikke på null med tre runder");
    },
  });
  t.sjekk(plan.tatt && plan.modig && plan.uskyldig && plan.tom, `For lite testet: ${JSON.stringify(plan)}`);
}
