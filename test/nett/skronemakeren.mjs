// Skrønemakeren on the net (test/nett-fritekst.mjs): four phones write their fakes at the same time;
// nobody sees another fake before all are in, and the HTML fakes stay text. Everyone votes on their
// own phone (never on their own fake), the leader reveals one option at a time. B comes back
// mid-match, D leaves and is not waited for; «Ny kamp» lets the next seat lead.
import { fritekst, skrivOgSend } from "../nett-fritekst.mjs";

const nokkel = (sp) => [sp.rn, sp.fase, sp.ferdig, sp.kort, sp.steg, sp.ute, sp.poeng, sp.lurt, sp.funnet, sp.r && [sp.r.leder, sp.r.skrevet, sp.r.sann, sp.r.valg, sp.r.srekke, sp.r.stemmer, sp.r.vist]];

export default async function (t) {
  let sant = 0;
  let lurt = 0;
  await fritekst(t, {
    lagret: "skronemakeren.v1",
    skjermer: ["n-skriv", "n-stem", "avslor", "resultat", "slutt"],
    slutt: "slutt",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="runder"][data-v="3"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("kort");
      await a.klikk('[data-h="tilbake"]');
    },
    skriv: (p, tekst) => skrivOgSend(p, "#skrone-nett-felt", tekst),
    async gjor(p, sp, meg, k) {
      if (await p.finnes('[data-h="n-velg"]')) {
        // Every other vote on the truth, else on a fake that is not mine.
        const sann = sp.r.valg.findIndex((v) => v.sann);
        const skrone = sp.r.valg.findIndex((v) => !v.sann && !v.av.includes(meg));
        const valg = (k.steg + meg) % 2 === 0 || skrone < 0 ? sann : skrone;
        if (valg === sann) sant++;
        else lurt++;
        await p.klikk(`[data-h="n-velg"][data-v="${valg}"]`);
        await p.vent(`!document.querySelector('[data-h="n-stem"]').disabled`, 4000);
        await p.klikk('[data-h="n-stem"]');
        return true;
      }
      if (await p.finnes('[data-h="n-neste"]')) {
        await p.klikk('[data-h="n-neste"]');
        return true;
      }
      return false;
    },
    nokkel,
    gjenoppkoble: (sp) => sp.fase === "avslor" && sp.r.vist >= 1,
    forlatNar: (sp) => sp.rn >= 1,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).r.leder === 1 && (await b.spill()).r.leder === 1, "Den neste leder ikke kamp 2");
      t.sjekk((await a.spill()).runder === 3, "Kamp 2 har ikke vertens tre runder");
    },
  });
  t.sjekk(sant > 0 && lurt > 0, `For lite testet: ${sant} på sannheten, ${lurt} på skrøner`);
}
