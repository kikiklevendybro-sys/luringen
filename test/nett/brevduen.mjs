// Brevduen on the net (test/nett-fritekst.mjs): four phones write their answers at the same time;
// nobody sees another answer before all are in, and the HTML answers stay text. The answers come one
// at a time, everyone taps who wrote it (the author too, on someone else), the leader goes on. B
// comes back mid-match, D leaves and is not waited for; «Ny kamp» lets the next seat lead.
import { fritekst, skrivOgSend } from "../nett-fritekst.mjs";

const nokkel = (sp) => [sp.runde, sp.fase, sp.ferdig, sp.steg, sp.ute, sp.poeng, sp.lurt, sp.r && [sp.r.k, sp.r.leder, sp.r.svar, sp.r.rekke, sp.r.vis, sp.r.pek]];

export default async function (t) {
  let riktig = 0;
  let lurt = 0;
  await fritekst(t, {
    lagret: "brevduen.v1",
    skjermer: ["n-skriv", "n-pek", "n-fasit", "slutt"],
    slutt: "slutt",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="runder"][data-v="3"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("sporsmal");
      await a.klikk('[data-h="tilbake"]');
    },
    skriv: (p, tekst) => skrivOgSend(p, "#bd-nett-felt", tekst),
    async gjor(p, sp, meg, k) {
      if (await p.finnes('[data-h="n-pek"]')) {
        // Every other guess at the author (never myself), else at someone else.
        const forfatter = sp.r.rekke[sp.r.vis];
        const valg = await p.js(`Array.from(document.querySelectorAll('[data-h="n-pek"]')).map((b) => Number(b.dataset.v))`);
        const pa = meg !== forfatter && (k.steg + meg) % 2 === 0 ? forfatter : valg.find((i) => i !== forfatter);
        if (pa === forfatter) riktig++;
        else lurt++;
        await p.klikk(`[data-h="n-pek"][data-v="${pa}"]`);
        return true;
      }
      if (await p.finnes('[data-h="n-neste"]')) {
        await p.klikk('[data-h="n-neste"]');
        return true;
      }
      return false;
    },
    nokkel,
    gjenoppkoble: (sp) => sp.fase === "pek" && sp.r.vis >= 1,
    forlatNar: (sp) => sp.runde >= 1,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).r.leder === 1 && (await b.spill()).r.leder === 1, "Den neste leder ikke kamp 2");
    },
  });
  t.sjekk(riktig > 0 && lurt > 0, `For lite testet: ${riktig} riktige, ${lurt} lurt`);
}
