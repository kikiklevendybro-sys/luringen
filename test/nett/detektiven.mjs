// Detektiven on the net: A has a game saved on the phone (three secrets), makes a room; B and C join
// and A starts; a fourth phone is told the match has begun. «20 spørsmål»: only the keeper's phone
// has the card (hold to see) and the answer buttons – the others see the meter and the hints, never
// the secret, until it is revealed on every phone. The keeper draws another secret once, counts,
// takes a count back; a detective shows a hint; one secret is guessed (who guessed it is picked on
// the keeper's phone), one given up, one lasts all 20. B closes its tab half-way and comes back;
// every phone goes to «Kåringen»; «Ny kamp» lets B keep the first secret. Then three phones: C
// leaves while holding a secret, A and B play on (a new secret for the next seat). Then two phones
// play «Hvem er jeg?» to the end: the guesser's phone never has the card.
import { hintRom, synligTekst } from "../nett-hint.mjs";

const nokkel = (sp) => [sp.k, sp.logg, sp.poeng, sp.runde && [sp.runde.h, sp.runde.startet, sp.runde.svar, sp.runde.hint], sp.ute, sp.rNr];

export default async function (t) {
  let byttet = false;
  let angret = false;
  let hint = 0;
  let sett = 0;
  let skjult = 0;
  const navnAv = (p, h) => p.js(`(() => { const A = []; window.RUSJ_DATA.hemmeligheter.kategorier.forEach((k) => k.liste.forEach((w) => A.push(w[0]))); return A[${h}]; })()`);

  // One step. plan: per secret { spm: questions to count, slutt: "gjettet" | "opp" | "ingen", angre, hint }.
  const steg = (plan) => async (tlf, sp, ctx) => {
    const pa = (s) => tlf.find((p) => p.sete === s);
    const r = sp.runde;
    if (!r) {
      if (sp.logg.length >= sp.totalt) return false;
      const p = pa(sp.k);
      if (!p) return false;
      await p.ventSkjerm("avsloring");
      await ctx.klar(p);
      await p.klikk('#skjerm [data-h="neste"]');
      await p.vent("!!Rusj.S.spill.runde", 8000);
      return true;
    }
    // The phone with the card: the keeper – in «Hvem er jeg?» one of the others.
    const styr = sp.modus === "jeg" ? tlf.find((p) => p.sete !== sp.k) : pa(sp.k);
    if (!styr) return false;
    if (!r.startet) {
      await styr.ventSkjerm("hemmelig");
      if (!byttet) {
        byttet = true;
        await ctx.klar(styr);
        await styr.klikk('#skjerm [data-h="ny-hemmelighet"]');
        await styr.vent(`Rusj.S.spill.runde.h !== ${r.h}`, 8000);
        return true;
      }
      const slipp = await styr.hold("#skjerm .mappe", 600);
      const bak = await styr.js(`document.querySelector(".mappe.apen .mappe-bakside")?.innerText || ""`);
      const navn = await navnAv(styr, r.h);
      t.sjekk(bak.includes(navn), `${styr.navn} ser ikke hemmeligheten «${navn}» når kortet holdes («${bak.slice(0, 40)}»)`);
      if (sett++ === 0) await styr.bilde("ser-hemmeligheten");
      await slipp();
      await ctx.klar(styr);
      await styr.klikk('#skjerm [data-h="start-avhor"]');
      await styr.vent("Rusj.S.spill.runde && Rusj.S.spill.runde.startet", 8000);
      return true;
    }
    const mal = plan[sp.logg.length % plan.length];
    if (r.spm < mal.spm) {
      await styr.ventSkjerm("avhor");
      if (mal.hint && r.spm >= 10 && !r.hint) {
        // A detective shows the hint (on every phone).
        const d = tlf.find((p) => p !== styr && p.sete !== sp.k) || tlf.find((p) => p !== styr);
        await ctx.klar(d);
        await d.klikk('#skjerm [data-h="hint"]');
        for (const p of tlf) await p.vent(`document.querySelector(".detektiv-hintkort")`, 8000).catch(() => t.feil(`${p.navn} viser ikke hintet`));
        hint++;
        return true;
      }
      await ctx.klar(styr);
      await styr.klikk(`#skjerm [data-h="svar"][data-v="${["j", "n", "k"][r.spm % 3]}"]`);
      await styr.vent(`Rusj.S.spill.runde.spm === ${r.spm + 1}`, 8000);
      if (mal.angre && !angret && r.spm === 1) {
        angret = true;
        await ctx.klar(styr);
        await styr.klikk("#detektiv-angre");
        await styr.vent(`Rusj.S.spill.runde.spm === 1`, 8000);
      }
      return true;
    }
    await ctx.klar(styr);
    if (mal.slutt === "gjettet") {
      await styr.klikk('#skjerm .dokk [data-h="gjettet"]');
      await t.sov(300);
      if ((await styr.skjerm()) === "hvem") {
        await styr.bilde("hvem-gjettet");
        await styr.klikk('#skjerm [data-h="gjetter"]');
      }
    } else if (mal.slutt === "opp") {
      await styr.klikk('#skjerm [data-h="gi-opp"]');
      await styr.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
    } else await styr.klikk('#skjerm [data-h="ingen"]');
    await styr.vent("!Rusj.S.spill.runde", 8000);
    for (const p of tlf) await p.ventSkjerm("avsloring");
    if (sp.logg.length === 0) for (const p of tlf) await p.bilde("avsloring");
    return true;
  };

  // While a secret is in play: no phone shows it (the card shows only while held), and only the
  // phones with the card have the answer buttons.
  async function hemmelig(tlf, sp) {
    const r = sp.runde;
    if (!r) return;
    const navn = await navnAv(tlf[0], r.h);
    for (const p of tlf) {
      if ((await synligTekst(p)).includes(navn)) t.feil(`${p.navn} viser hemmeligheten «${navn}» før avsløringen`);
      const ser = sp.modus === "jeg" ? p.sete !== sp.k : p.sete === sp.k;
      if (!ser && ((await p.finnes('#skjerm [data-h="svar"]')) || (await p.finnes("#skjerm .mappe")))) t.feil(`${p.navn} har kortet eller svarknappene uten å ha hemmeligheten`);
      skjult++;
    }
  }
  // (After an unsolved secret the drum roll comes first, then the button.)
  const tilSlutt = async (p) => {
    await p.vent(`document.querySelector('#skjerm [data-h="neste"]')`, 8000).catch(() => {});
    if (await p.finnes('#skjerm [data-h="neste"]')) await p.klikk('#skjerm [data-h="neste"]');
  };

  await hintRom(t, {
    antall: 3,
    lagret: "detektiven.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("gi");
      await a.klikk('[data-h="tilbake"]');
    },
    steg: steg([
      { spm: 2, angre: true, slutt: "gjettet" },
      { spm: 11, hint: true, slutt: "opp" },
      { spm: 20, slutt: "ingen" },
    ]),
    hemmelig,
    nokkel,
    gjenoppkoble: (sp) => sp.logg.length >= 1 && !!sp.runde && sp.runde.startet && sp.runde.spm >= 2,
    tilSlutt,
    async kamp2(tlf) {
      for (const p of tlf) t.sjekk((await p.spill()).k === 1, `${p.navn}: B har ikke første hemmelighet i kamp 2`);
    },
  });
  t.sjekk(byttet && angret && hint > 0 && skjult > 10, `For lite testet: byttet ${byttet}, angret ${angret}, hint ${hint}, skjult sjekket ${skjult}`);

  await hintRom(t, {
    antall: 3,
    merke: "3",
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("detektiven.v1"))}, JSON.stringify({ antall: 3, oppsett: { modus: "spm", nivaa: 2, antallH: 3, hint: true }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    steg: steg([{ spm: 2, slutt: "gjettet" }]),
    hemmelig,
    nokkel,
    forlat: {
      hvem: 2,
      nar: (sp) => sp.k === 2 && !!sp.runde && sp.runde.startet,
      async etter(tlf) {
        const sp = await tlf[0].spill();
        t.sjekk(sp.ute.includes(2) && sp.k === 0 && sp.runde && !sp.runde.startet, "Neste plass fikk ikke en ny hemmelighet da C gikk");
      },
    },
    tilSlutt,
  });

  await hintRom(t, {
    antall: 2,
    merke: "2",
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("detektiven.v1"))}, JSON.stringify({ antall: 2, oppsett: { modus: "jeg", nivaa: 1, antallH: 2, hint: true }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    steg: steg([
      { spm: 3, slutt: "gjettet" },
      { spm: 1, slutt: "opp" },
    ]),
    hemmelig,
    nokkel,
    tilSlutt,
  });
}
