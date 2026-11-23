// Hviskeren on the net (test/nett-fritekst.mjs): the hint givers write at the same time on their own
// phones; nobody sees another hint before all are in, the HTML hints stay text, and the guesser's
// screen never has the secret word before the reveal. The first hint giver strikes a hint and sends
// them on; the guesser checks (or passes) and says how it went. B comes back mid-match, D leaves and
// is not waited for; «Ny kamp» lets the next seat guess first.
import { fritekst, skrivOgSend, SKRIPT } from "../nett-fritekst.mjs";

const nokkel = (sp) => [sp.nr, sp.ferdig, sp.steg, sp.ute, sp.poeng, sp.tapt, sp.logg, sp.r && [sp.r.gjetter, sp.r.ord, sp.r.per, sp.r.gitt, sp.r.hint, sp.r.fase, sp.r.utfall]];

export default async function (t) {
  let strok = false;
  let sjekket = 0;
  let utfall = 0;
  await fritekst(t, {
    lagret: "hviskeren.v1",
    skjermer: ["n-skriv", "n-sjekk", "n-gjett", "svar", "slutt"],
    slutt: "slutt",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="runder"][data-v="8"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("runde");
      await a.klikk('[data-h="tilbake"]');
    },
    // One word each: the image tag without spaces (still HTML that would run if it were not text).
    injeksjon: [SKRIPT, '<img/src="x"/onerror="window.__x=2">'],
    tekst: (navn, steg) => `Hint${navn}${steg}`,
    skriv: (p, tekst, sp) => (sp.r.per === 2 ? skrivOgSend(p, ["#hint-1", "#hint-2"], [tekst, `${tekst}q`]) : skrivOgSend(p, "#hint-1", tekst)),
    async gjor(p, sp, meg, k) {
      if (sp.r.fase === "sjekk" && !strok && (await p.finnes('[data-h="n-neste"]'))) {
        strok = true;
        await p.klikk('#skjerm [data-h="stryk"]');
        return true;
      }
      if (await p.finnes('[data-h="n-neste"]')) {
        await p.klikk('[data-h="n-neste"]');
        return true;
      }
      if (await p.finnes('[data-h="n-gjett"]')) {
        await p.klikk(`[data-h="n-gjett"][data-v="${k.steg % 5 === 4 ? "pass" : "sjekk"}"]`);
        return true;
      }
      if (await p.finnes('[data-h="n-utfall"]')) {
        utfall++;
        await p.klikk(`[data-h="n-utfall"][data-v="${utfall % 2 ? "riktig" : "feil"}"]`);
        return true;
      }
      return false;
    },
    // The guesser's screen never has the word before the reveal (text, labels, values – anywhere).
    async sjekk(inne, sp) {
      if (sp.ferdig || sp.r.fase === "svar") return;
      for (const p of inne) {
        if ((await p.nettMeg()) !== sp.r.gjetter) continue;
        const { ord, alt } = await p.js(`(() => {
          const ut = [];
          window.RUSJ_ORD.kategorier.forEach((k) => k.ord.forEach((e) => { if (!/[,!?]/.test(e[0]) && e[0].trim().split(/\\s+/).length <= 2) ut.push(e[0]); }));
          const s = document.querySelector("#skjerm");
          const alt = [s.textContent, document.querySelector("#topp-tittel").textContent, ...Array.from(s.querySelectorAll("*")).flatMap((el) => Array.from(el.attributes).map((x) => x.value))].join(" ");
          return { ord: ut[Rusj.S.spill.r.ord], alt };
        })()`);
        sjekket++;
        const re = new RegExp(`(^|[^\\p{L}])${ord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
        if (re.test(alt)) t.feil(`${p.navn} (gjetteren) ser ordet «${ord}» før avsløringen`);
      }
    },
    nokkel,
    gjenoppkoble: (sp) => sp.r.fase === "gjett",
    forlatNar: (sp) => sp.logg.length >= 1,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).r.gjetter === 1 && (await b.spill()).r.gjetter === 1, "Den neste gjetter ikke først i kamp 2");
      t.sjekk((await a.spill()).r.per === 2, "Tre spillere gir ikke to hint hver");
    },
  });
  t.sjekk(strok && sjekket > 3 && utfall > 1, `For lite testet: strøk ${strok}, gjetteren sjekket ${sjekket} ganger, ${utfall} dommer`);
}
