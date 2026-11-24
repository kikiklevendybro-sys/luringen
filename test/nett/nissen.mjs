// Nissen on the net: A has a game saved on the phone (three rounds) and makes a room; B, C and D join
// and A starts with four; a fifth phone is told the match has begun. Every round each phone holds its
// own bowl – the almond shows on the holder's phone only, and no other phone has it on screen – and
// taps «Jeg har sett»; the round's leader sends everyone to the elf, asks for a new question and opens
// the pointing; everyone points on their own phone (some right, some wrong); the points are the same
// everywhere. B closes its tab half-way and comes back. «Ny kamp»: in match 2 the almond holder
// leaves while the elf asks – the round does not count – and the three others play on to the end.
import { rollekamp } from "../nett-roller.mjs";

const nokkel = (sp) => [sp.runde, sp.fase, sp.mandel, sp.sett, sp.stemmer, sp.spurt, sp.k, sp.poeng, sp.slapp, sp.siste, sp.ute, sp.ferdig, sp.spilt];

export default async function (t) {
  let bilder = 0;
  let riktig = 0;
  let feil = 0;
  let tom = false;
  const trekk = async (p, sp, alle) => {
    const meg = await p.nettMeg();
    if (sp.fase === "se") {
      // My own bowl, behind the card: the almond only for its holder. Nobody else has one on screen.
      t.sjekk(!(await p.js(`document.querySelector('[data-h="pa-sett"]').disabled === false`)), `${p.navn}: «Jeg har sett» før bollen er sett`);
      const slipp = await p.hold('.mappe[data-mappe="nett"]', 650);
      const har = await p.finnes(".mappe-bakside .ng-se.har");
      const grot = await p.finnes(".mappe-bakside .ng-se:not(.har)");
      t.sjekk(har === (meg === sp.mandel) && grot === (meg !== sp.mandel), `${p.navn}: bollen viser feil (mandelen er hos plass ${sp.mandel + 1})`);
      for (const q of alle) if (q !== p) t.sjekk(!(await q.finnes(".ng-se")), `${q.navn} har en bolle på skjermen mens ${p.navn} ser i sin`);
      if (bilder++ < 2) await p.bilde(har ? "bolle-mandel" : "bolle-grot");
      await slipp();
      t.sjekk(!(await p.finnes(".mappe-bakside .ng-se")), `${p.navn}: bollen blir stående etter at fingeren slipper`);
      return p.trekk('[data-h="pa-sett"]', `Rusj.S.spill.sett[${meg}] != null`);
    }
    if (sp.fase === "munn") {
      if (sp.runde === 0) await p.bilde("snu-dere");
      return p.trekk('[data-h="pa-nissen"]', `Rusj.S.spill.fase !== "munn"`);
    }
    if (sp.fase === "prat") {
      if (sp.brukt.length % 2) {
        await p.bilde("nissen-spor");
        return p.trekk('[data-h="pa-sporsmal"]', `Rusj.S.spill.brukt.length === ${sp.brukt.length + 1}`);
      }
      return p.trekk('[data-h="pa-pek"]', `Rusj.S.spill.fase !== "prat"`);
    }
    if (sp.fase === "pek") {
      // Every other one points at the holder; the holder and the rest at someone else.
      const andre = [...Array(sp.antall).keys()].filter((i) => i !== meg && !sp.ute.includes(i));
      const mot = meg !== sp.mandel && (meg + sp.runde) % 2 === 0 ? sp.mandel : (andre.find((i) => i !== sp.mandel) ?? andre[0]);
      if (mot === sp.mandel) riktig++;
      else if (meg !== sp.mandel) feil++;
      await p.klikk(`[data-h="pa-marker"][data-v="${mot}"]`);
      if (sp.runde === 0 && !sp.stemmer.some((x) => x != null)) await p.bilde("pek");
      await p.trekk('[data-h="pa-stem"]', `Rusj.S.spill.stemmer[${meg}] != null || Rusj.S.spill.fase !== "pek"`);
      // Before the last one has pointed, nobody's screen says who had the almond.
      const s = await p.spill();
      if (s.fase === "pek") {
        for (const q of alle) t.sjekk(!(await q.finnes(".ng-fasit .ng-gris, .banner")), `${q.navn} viser svaret før alle har pekt`);
        if (t.norsk) t.sjekk(/av \d+ er klare/.test(await p.tekst(".ng-klar")), `${p.navn}: ingen «… av … er klare»`);
      }
      return;
    }
    if (sp.fase === "fasit") {
      if (sp.siste && sp.siste.tom) tom = true;
      await p.bilde(sp.siste && sp.siste.tom ? "runden-teller-ikke" : "fasit");
      return p.trekk('[data-h="pa-neste"]', `Rusj.S.spill.runde === ${sp.runde + 1}`);
    }
  };
  // After the last round every phone goes to «Kåringen» itself.
  const ingenTur = async (alle) => {
    for (const p of alle) if ((await p.skjerm()) === "nettspill" && (await p.finnes('[data-h="pa-kaaring"]'))) await p.klikk('[data-h="pa-kaaring"]');
    await t.sov(250);
  };

  await rollekamp(t, {
    antall: 4,
    lagret: "nissen.v2",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="runder"][data-v="3"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("gi");
      // (Not into the bowl: a reload turns «se» back into «gi», so the saved game would change.)
      await a.klikk("#tilbake");
    },
    trekk,
    ingenTur,
    nokkel,
    gjenoppkoble: (sp) => sp.runde >= 1 && sp.fase === "prat",
    // Match 2: the almond holder leaves while the elf asks (the host too, if it has the almond).
    forlatNar: (sp) => (sp.fase === "prat" ? sp.mandel : null),
    async etterForlat(alle, sp, i) {
      t.sjekk(sp.ute.includes(i), "Plassen som gikk, er ikke ute");
      if (sp.siste && sp.siste.tom) t.sjekk(sp.fase === "fasit" && sp.siste.mandel === i, "Runden ble ikke avsluttet da mandelholderen gikk");
    },
    async kamp2(alle) {
      const sp = await alle[0].spill();
      t.sjekk(sp.runder === 3 && sp.forste === 1 && sp.poeng.every((x) => x === 0), "Kamp 2 startet ikke på null med tre runder og B som leder");
    },
  });
  t.sjekk(riktig > 0 && feil > 0, `For lite testet: ${riktig} pekte riktig, ${feil} feil`);
  t.sjekk(tom, "Mandelholderen gikk aldri midt i en runde");
}
