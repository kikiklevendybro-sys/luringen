// Dommeren on the net: A has a game saved on the phone (to 3 points), makes a room; B and C join
// and A starts; a fourth phone is told the match has begun. Every phone sees the question card at
// once: the judge's phone the card (and «Bytt kort»), the others their own five answer cards – never
// another phone's hand, and never a card someone has laid until everyone has. Then the options are
// on every phone without names, the judge crowns one, the next judge starts the next round. B
// closes its tab half-way and comes back; at 3 points every phone goes to «Kåringen»; «Ny kamp» lets
// B judge first. Then four phones: C leaves mid-match, the three others play on to the end.
import { hintRom, synligTekst } from "../nett-hint.mjs";

const nokkel = (sp) => [sp.runde, sp.fase, sp.dommer, sp.poeng, sp.lagt, sp.valg, sp.vinner, sp.hender, sp.sporsmal, sp.ute];

export default async function (t) {
  let byttet = false;
  let angret = false;
  let sjekket = 0;
  const tekstAv = (p, k) => p.js(`(() => { const SV = []; window.RUSJ_DATA.kort.pakker.forEach((x) => x.svar.forEach((s) => SV.push(s))); return SV[${k}]; })()`);
  const venterPa = (p, uttrykk) => p.vent(uttrykk, 10000);

  // One step: the judge swaps the card once; a player who has not chosen lays a card (once taking it
  // back first); the judge crowns an option; the next judge starts the next round.
  async function steg(tlf, sp, ctx) {
    const pa = (sete) => tlf.find((p) => p.sete === sete);
    if (sp.fase === "velg") {
      const dommer = pa(sp.dommer);
      if (!byttet && dommer && sp.lagt.every((k) => k < 0)) {
        byttet = true;
        await ctx.klar(dommer);
        await dommer.klikk('#skjerm [data-h="bytt"]');
        await venterPa(dommer, `Rusj.S.spill.sporsmal !== ${sp.sporsmal}`);
        return true;
      }
      const p = tlf.find((q) => q.sete !== sp.dommer && !sp.ute.includes(q.sete) && sp.lagt[q.sete] < 0);
      if (!p) return false;
      await p.ventSkjerm("hand");
      await p.klikk('#skjerm [data-h="merk"][data-v="1"]');
      await ctx.klar(p);
      await p.klikk("#dom-legg");
      await venterPa(p, `Rusj.S.spill.lagt[${p.sete}] >= 0`);
      if (!angret) {
        angret = true;
        await p.bilde("kortet-lagt");
        await ctx.klar(p);
        await p.klikk('#skjerm [data-h="angre-legg"]');
        await venterPa(p, `Rusj.S.spill.lagt[${p.sete}] < 0 && Rusj.S.spill.hender[${p.sete}].length === 5`);
      }
      return true;
    }
    if (sp.fase === "dom") {
      const p = pa(sp.dommer);
      await p.ventSkjerm("dom");
      // The options carry no names.
      const tekst = await synligTekst(p);
      for (const q of tlf) if (q !== p && tekst.includes(`Testspiller ${q.navn.charAt(0)}`)) t.feil(`Dommeren ser navnet til ${q.navn} ved svarene`);
      await p.klikk(`#skjerm [data-h="velg"][data-v="${sp.runde % sp.valg.length}"]`);
      await ctx.klar(p);
      await p.klikk("#dom-kar");
      await venterPa(p, `Rusj.S.spill.fase === "resultat"`);
      if (sp.runde === 1) for (const q of tlf) await q.bilde("runden-kaaret");
      return true;
    }
    if (sp.fase === "resultat") {
      if (await tlf[0].js("Rusj.app.nett.ferdig(Rusj.S)")) return false;
      const neste = await tlf[0].js("Rusj.app.nett.tur(Rusj.S)");
      const p = pa(neste);
      if (!p) return false;
      await ctx.klar(p);
      await p.klikk('#skjerm [data-h="videre"]');
      await venterPa(p, `Rusj.S.spill.fase === "velg" && Rusj.S.spill.runde === ${sp.runde + 1}`);
      return true;
    }
    return false;
  }

  // Before everyone has laid: no phone shows another phone's hand, nor a card someone else has laid.
  async function hemmelig(tlf, sp) {
    if (sp.fase !== "velg") return;
    for (const p of tlf) {
      const tekst = await synligTekst(p);
      for (const q of tlf) {
        if (q === p) continue;
        const skjulte = [...sp.hender[q.sete], ...(sp.lagt[q.sete] >= 0 ? [sp.lagt[q.sete]] : [])];
        for (const k of skjulte) {
          const kort = await tekstAv(p, k);
          if (kort && kort.length > 3 && tekst.includes(kort) && !sp.hender[p.sete].includes(k)) t.feil(`${p.navn} ser kortet «${kort}» til ${q.navn}`);
        }
      }
      sjekket++;
    }
    if (sp.dommer != null) {
      const d = tlf.find((p) => p.sete === sp.dommer);
      if (d && (await d.finnes("#skjerm .dom-svarkort"))) t.feil(`Dommeren (${d.navn}) har svarkort på skjermen`);
    }
  }

  await hintRom(t, {
    antall: 3,
    lagret: "dommeren.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="maal"][data-v="3"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("kort");
      await a.klikk('[data-h="tilbake"]');
    },
    steg,
    hemmelig,
    nokkel,
    gjenoppkoble: (sp) => sp.runde >= 2 && sp.fase === "velg" && sp.lagt.some((k) => k >= 0),
    tilSlutt: async (p) => {
      if (await p.finnes('#skjerm [data-h="videre"]')) await p.klikk('#skjerm [data-h="videre"]');
    },
    async kamp2(tlf) {
      for (const p of tlf) t.sjekk((await p.spill()).dommer === 1, `${p.navn}: B dømmer ikke først i kamp 2`);
    },
  });
  t.sjekk(byttet && angret && sjekket > 6, `For lite testet: byttet ${byttet}, angret ${angret}, hemmelig sjekket ${sjekket}`);

  await hintRom(t, {
    antall: 4,
    merke: "4",
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("dommeren.v1"))}, JSON.stringify({ antall: 4, oppsett: { pakker: ["familie"], maal: 3 }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    steg,
    nokkel,
    forlat: {
      hvem: 2,
      nar: (sp) => sp.runde >= 2 && sp.fase === "velg",
      async etter(tlf) {
        const sp = await tlf[0].spill();
        t.sjekk(sp.ute.includes(2) && sp.hender[2].length === 0 && sp.dommer !== 2, "C er ikke tatt ut av runden");
      },
    },
    tilSlutt: async (p) => {
      if (await p.finnes('#skjerm [data-h="videre"]')) await p.klikk('#skjerm [data-h="videre"]');
    },
  });
}
