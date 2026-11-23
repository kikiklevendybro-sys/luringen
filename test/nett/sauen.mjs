// Sauen on the net (test/nett-fritekst.mjs): four phones answer at the same time; nobody sees another
// answer before all are in, and the HTML answers stay text. The leader reveals the groups, merges two
// and takes it back, and gives out the points; the black sheep goes to the one alone; everyone goes
// to «Kåringen» when someone wins. B comes back mid-match, D leaves and is not waited for; «Ny kamp»
// lets the next seat lead.
import { fritekst, skrivOgSend } from "../nett-fritekst.mjs";

const nokkel = (sp) => [sp.nr, sp.ferdig, sp.steg, sp.ute, sp.poeng, sp.sau, sp.vinnere, sp.r && [sp.r.q, sp.r.leder, sp.r.inn, sp.r.grupper, sp.r.rekkefolge, sp.r.vist, sp.r.avslort, sp.r.fase]];

export default async function (t) {
  let slatt = 0; // 1: two groups merged, 2: and taken back
  let sau = false;
  await fritekst(t, {
    lagret: "sauen.v1",
    skjermer: ["n-skriv", "avslor", "poeng", "vinner"],
    slutt: "vinner",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="mal"][data-v="5"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("sporsmal");
      await a.klikk('[data-h="tilbake"]');
    },
    // The flock answers «Sol»; C stands alone every other round.
    tekst: (navn, steg) => (navn === "C" && steg % 2 ? "Luna" : "Sol"),
    skriv: (p, tekst) => skrivOgSend(p, "#svar-felt", tekst),
    async gjor(p, sp) {
      if (sp.sau >= 0) sau = true;
      if (await p.finnes('[data-h="til-vinner"]')) {
        await p.klikk('[data-h="til-vinner"]');
        return true;
      }
      if (await p.finnes('[data-h="neste-svar"]')) {
        await p.klikk('[data-h="neste-svar"]');
        return true;
      }
      if (slatt === 0 && (await p.finnes('[data-h="velg"][data-v="1"]'))) {
        slatt = 1;
        await p.klikk('[data-h="velg"][data-v="0"]');
        await p.klikk('[data-h="velg"][data-v="1"]');
        return true;
      }
      if (slatt === 1 && (await p.finnes('[data-h="angre"]'))) {
        slatt = 2;
        await p.klikk('[data-h="angre"]');
        return true;
      }
      for (const h of ["del-ut", "neste-runde"]) {
        if (await p.finnes(`[data-h="${h}"]`)) {
          await p.klikk(`[data-h="${h}"]`);
          return true;
        }
      }
      return false;
    },
    nokkel,
    gjenoppkoble: (sp) => sp.r.fase === "avslor" && sp.nr >= 2,
    forlatNar: (sp) => sp.nr >= 2,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).r.leder === 1 && (await b.spill()).r.leder === 1, "Den neste leder ikke kamp 2");
      t.sjekk((await a.spill()).mal === 5, "Kamp 2 har ikke vertens mål");
    },
  });
  t.sjekk(slatt === 2 && sau, `For lite testet: slått sammen og angret ${slatt}, svart sau ${sau}`);
}
