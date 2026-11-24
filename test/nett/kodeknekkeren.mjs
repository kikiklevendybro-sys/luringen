// Kodeknekkeren on the net: A has a game saved on the phone («Ett brett»), makes a room; B, C and D
// join and A starts; a fifth phone is told the match has begun. Four seats play «Lag mot lag»
// (Rosa: A and C, Blå: B and D): the code masters' phones show the board with the key, every other
// phone only the board. The code master on turn puts the hint on the strip (it shows on every
// phone); a guesser of the team on turn taps the cards – its own agents, a neutral word, the other
// team's agent, the trap – and «Lag X er ferdig». B closes its tab half-way and comes back; the
// board ends, every phone goes to «Kåringen»; «Ny kamp» gives the key to C and D and lets Blå begin.
// Then five phones play «Best av 3» on the trap: in board 2 C (Rosa's code master) leaves, the key
// goes to E and the others play the match out. Then two phones play «Sammen mot fella» to the end.
import { hintRom } from "../nett-hint.mjs";

const nokkel = (sp) => [sp.brett, sp.tur, sp.vist, sp.hist.length, sp.hint, sp.mester, sp.stilling, sp.ute, sp.grunn];
const over = (sp) => sp.grunn != null;
const avgjort = (sp) => over(sp) && (sp.modus === "sammen" || sp.kamp === "ett" || (sp.kamp === "best3" && Math.max(...sp.stilling) >= 2));

export default async function (t) {
  let hint = 0;
  let typer = new Set();
  let skjult = 0;

  // One step. plan[n]: what the team does on its turn n of the board – "egen" (one of its agents),
  // "andre" (the other team's), "noytral", "felle", "ferdig". medHint: the code master writes the hint first.
  const steg = (plan, medHint) => async (tlf, sp, ctx) => {
    const pa = (s) => tlf.find((p) => p.sete === s);
    const sammen = sp.modus === "sammen";
    if (sp.ferdig) return false;
    if (over(sp)) {
      if (avgjort(sp)) return false;
      const p = pa(await tlf[0].js("Rusj.app.nett.tur(Rusj.S)"));
      if (!p) return false;
      await p.ventSkjerm("resultat");
      await ctx.klar(p);
      await p.klikk('#skjerm [data-h="neste-brett"]');
      await p.vent(`Rusj.S.spill.brett === ${sp.brett + 1} && Rusj.S.skjerm === "brett"`, 8000);
      return true;
    }
    const bytte = (h) => h.t === "ferdig" || (h.t === "kort" && sp.nokkel[h.i] !== (sammen ? 0 : h.tur));
    const bytter = sp.hist.filter(bytte).length;
    let fra = 0;
    sp.hist.forEach((h, n) => {
      if (bytte(h)) fra = n + 1;
    });
    const turen = sp.hist.slice(fra);
    const mester = pa(sp.mester[sammen ? 0 : sp.tur]);
    if (medHint && !turen.some((h) => h.t === "hint") && mester) {
      await mester.ventSkjerm("brett");
      await mester.skrivInn("#kk-hintfelt", "Hav");
      await ctx.klar(mester);
      await mester.klikk('#skjerm [data-h="hint-tall"][data-v="2"]');
      await mester.vent("!!Rusj.S.spill.hint", 8000);
      for (const p of tlf) await p.vent(`!!document.querySelector("#skjerm .kk-hint.satt")`, 8000).catch(() => t.feil(`${p.navn} viser ikke hintet på stripa`));
      if (hint++ === 0) for (const p of tlf) await p.bilde("hint");
      return true;
    }
    const liste = plan[Math.min(bytter, plan.length - 1)];
    const hva = liste[Math.min(turen.filter((h) => h.t === "kort").length, liste.length - 1)];
    const g = pa(
      Array.from({ length: sp.antall }, (_, i) => i).find((i) => pa(i) && !sp.ute.includes(i) && !sp.mester.includes(i) && (sammen || sp.lag[sp.tur].includes(i))),
    );
    if (!g) return false;
    await g.ventSkjerm("brett");
    typer.add(hva);
    if (hva === "ferdig") {
      await ctx.klar(g);
      await g.klikk('#skjerm [data-h="ferdig"]');
      await g.vent(`Rusj.S.spill.hist.length > ${sp.hist.length}`, 8000);
      return true;
    }
    const type = { egen: sammen ? 0 : sp.tur, andre: 1 - sp.tur, noytral: 2, felle: 3 }[hva];
    const i = sp.nokkel.findIndex((x, n) => x === type && !sp.vist.includes(n));
    await ctx.klar(g);
    await g.klikk(`#skjerm .kk-kort[data-v="${i}"]`);
    await g.vent(`Rusj.S.spill.vist.includes(${i})`, 8000);
    return true;
  };

  // Only the code masters' phones have the key on the board.
  async function hemmelig(tlf, sp) {
    if (over(sp) || sp.ferdig) return;
    for (const p of tlf) {
      if ((await p.skjerm()) !== "brett") continue;
      const mester = sp.mester.includes(p.sete);
      const har = await p.finnes("#skjerm .kk-brett.med-fasit");
      if (!mester && (har || (await p.finnes("#skjerm .kk-kort.fasit")))) t.feil(`${p.navn} ser nøkkelen uten å være kodemester`);
      if (mester && !har) t.feil(`${p.navn} er kodemester, men ser ikke nøkkelen`);
      skjult++;
    }
  }
  const tilSlutt = async (p) => {
    await p.vent(`document.querySelector('#skjerm [data-h="til-karing"], #skjerm [data-h="til-resultat"]')`, 8000).catch(() => {});
    if (await p.finnes('#skjerm [data-h="til-resultat"]')) await p.klikk('#skjerm [data-h="til-resultat"]');
    await p.vent(`document.querySelector('#skjerm [data-h="til-karing"]')`, 8000).catch(() => {});
    if (await p.finnes('#skjerm [data-h="til-karing"]')) await p.klikk('#skjerm [data-h="til-karing"]');
  };

  await hintRom(t, {
    antall: 4,
    slutt: "karing",
    lagret: "kodeknekkeren.v1",
    // (A game without names gets its code-master counter back at 0 on every load – any reload
    // does that, not the net.)
    lagretSom: (x) => ({ ...x, spill: x.spill && !x.spill.navn ? { ...x.spill, mstart: [0, 0] } : x.spill }),
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="kamp"][data-v="ett"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("nokkel");
      await a.klikk('[data-h="tilbake"]');
    },
    steg: steg([["egen", "egen", "ferdig"], ["egen", "noytral"], ["andre"], ["felle"]], true),
    hemmelig,
    nokkel,
    gjenoppkoble: (sp) => sp.hist.length >= 3 && !over(sp),
    tilSlutt,
    async kamp2(tlf) {
      for (const p of tlf) {
        const sp = await p.spill();
        t.sjekk(sp.mester.join() === "2,3" && sp.start === 1, `${p.navn}: kamp 2 har ikke C og D som kodemestere med Lag Blå først (${sp.mester}, ${sp.start})`);
      }
    },
  });
  t.sjekk(hint >= 3 && ["egen", "noytral", "andre", "felle", "ferdig"].every((x) => typer.has(x)) && skjult > 10, `For lite testet: hint ${hint}, ${[...typer]}, nøkkel sjekket ${skjult}`);

  await hintRom(t, {
    antall: 5,
    merke: "5",
    slutt: "karing",
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("kodeknekkeren.v1"))}, JSON.stringify({ antall: 5, oppsett: { modus: "lag", kamp: "best3", navn: false, lag: [], nokkel: "mobil", lett: true, tid: 0 }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    steg: steg([["felle"]], false),
    hemmelig,
    nokkel,
    forlat: {
      hvem: 2,
      nar: (sp) => sp.brett === 1 && sp.mester[0] === 2 && !over(sp),
      async etter(tlf) {
        const sp = await tlf[0].spill();
        t.sjekk(sp.ute.includes(2) && sp.mester[0] === 4, `Nøkkelen gikk ikke videre til E da C gikk (${sp.mester})`);
        const e = tlf.find((p) => p.sete === 4);
        await e.vent(`document.querySelector("#skjerm .kk-brett.med-fasit")`, 8000).catch(() => t.feil("E ser ikke nøkkelen etter å ha blitt kodemester"));
        await e.bilde("ny-kodemester");
      },
    },
    tilSlutt,
  });

  await hintRom(t, {
    antall: 2,
    merke: "2",
    slutt: "karing",
    steg: steg([["egen", "noytral"], ["ferdig"]], true),
    hemmelig,
    nokkel,
    tilSlutt,
  });
}
