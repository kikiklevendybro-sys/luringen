// Tankeleseren on the net: A has a game saved on the phone, makes a room; B and C join and A starts;
// a fourth phone is told the match has begun. «Sammen»: the giver's phone has the target (hold to
// see – no other phone has it before the reveal), swaps the card once, types a hint once; every
// other phone drags its own needle and locks it (the others see only who has locked); the middle of
// the needles is scored and the cover sweeps away on every phone; the next giver starts the next
// round. B closes its tab half-way and comes back; after eight rounds every phone goes to
// «Kåringen»; «Ny kamp» lets B give the first hint. Then «Lag mot lag» for five: the team on turn
// locks, the other team bets left or right; E leaves mid-match, the four others play on to 10. Then
// two phones play «Sammen» to the end.
import { hintRom } from "../nett-hint.mjs";

const nokkel = (sp) => [sp.runde, sp.fase, sp.giver, sp.kort, sp.mal, sp.hint, sp.laste, sp.logg, sp.ute, sp.tur];

export default async function (t) {
  let byttet = false;
  let skrevet = false;
  let dratt = false;
  let tippet = 0;
  let skjult = 0;
  let runde = 0;

  const gjettere = (sp) => Array.from({ length: sp.antall }, (_, i) => i).filter((i) => !sp.ute.includes(i) && i !== sp.giver && (sp.modus !== "lag" || sp.lag[i] === sp.tur));
  const motlag = (sp) => (sp.modus === "lag" ? Array.from({ length: sp.antall }, (_, i) => i).filter((i) => !sp.ute.includes(i) && sp.lag[i] !== sp.tur) : []);

  async function steg(tlf, sp, ctx) {
    const pa = (s) => tlf.find((p) => p.sete === s);
    if (sp.fase === "gi") {
      const p = pa(sp.giver);
      if (!p) return false;
      await p.ventSkjerm("hint");
      if (!byttet && (await p.finnes('#skjerm [data-h="bytt-kort"]'))) {
        byttet = true;
        await ctx.klar(p);
        await p.klikk('#skjerm [data-h="bytt-kort"]');
        await p.vent(`Rusj.S.spill.kort !== ${sp.kort}`, 8000);
        return true;
      }
      // Hold to see the target: the cover opens on this phone.
      const slipp = await p.hold("#skjerm .tl-holdknapp", 600);
      t.sjekk(await p.finnes("#skjerm .tl-skive.apen .tl-sone"), `${p.navn} ser ikke målet når skiva holdes`);
      await slipp();
      await p.vent(`!document.querySelector("#tl-klar").disabled`, 5000);
      if (!skrevet) {
        skrevet = true;
        await p.skrivInn("#tl-hint", "Badevann");
        await p.bilde("hint");
      }
      await ctx.klar(p);
      await p.klikk("#tl-klar");
      await p.vent(`Rusj.S.spill.fase !== "gi"`, 8000);
      return true;
    }
    if (sp.fase === "gjett") {
      const s = gjettere(sp).find((i) => sp.laste[i] == null && pa(i));
      if (s == null) return false;
      const p = pa(s);
      await p.ventSkjerm("skive");
      await p.vent(`document.querySelector('#skjerm [data-h="las"]')`, 8000);
      if (!dratt) {
        // A real drag on the dial moves this phone's needle.
        dratt = true;
        await p.sveip("#skjerm .tl-skive", -120);
        t.sjekk((await p.js("Rusj.S.spill.viser")) !== 50, `${p.navn}: viseren flyttet seg ikke da skiva ble dratt`);
        await p.bilde("drar-viseren");
      } else {
        // (As if dragged: right on, a little off or far off.)
        const v = [0, 4, -11, 2][(runde + s) % 4];
        await p.js(`Rusj.S.spill.viser = Math.max(0, Math.min(100, Rusj.S.spill.mal + ${v}))`);
      }
      await ctx.klar(p);
      await p.klikk('#skjerm [data-h="las"]');
      await p.vent(`Rusj.S.spill.laste[${s}] != null || Rusj.S.spill.fase !== "gjett"`, 8000);
      return true;
    }
    if (sp.fase === "motlag") {
      const s = motlag(sp).find((i) => pa(i));
      const p = pa(s);
      await p.ventSkjerm("skive");
      await ctx.klar(p);
      await p.klikk(`#skjerm [data-h="tipp"][data-v="${["v", "h", "-"][tippet++ % 3]}"]`);
      await p.vent(`Rusj.S.spill.fase === "fasit"`, 8000);
      return true;
    }
    if (sp.fase === "fasit") {
      if (await tlf[0].js("Rusj.app.nett.ferdig(Rusj.S)")) return false;
      const p = pa(await tlf[0].js("Rusj.app.nett.tur(Rusj.S)"));
      if (!p) return false;
      await p.vent(`Rusj.S.spill.avslort && !document.querySelector('#skjerm [data-h="neste"]').disabled`, 10000);
      if (runde++ === 0) for (const q of tlf) await q.bilde("fasit");
      await ctx.klar(p);
      await p.klikk('#skjerm [data-h="neste"]');
      await p.vent(`Rusj.S.spill.runde === ${sp.runde + 1}`, 8000);
      return true;
    }
    return false;
  }

  // Before the reveal only the giver's phone has the target (under the cover until it is held).
  async function hemmelig(tlf, sp) {
    if (sp.fase === "fasit") return;
    for (const p of tlf) {
      if (p.sete === sp.giver) continue;
      if (await p.finnes("#skjerm .tl-sone")) t.feil(`${p.navn} har målet på skjermen før avsløringen`);
      skjult++;
    }
  }
  const tilSlutt = async (p) => {
    await p.vent(`document.querySelector('#skjerm [data-h="neste"]') && !document.querySelector('#skjerm [data-h="neste"]').disabled`, 10000).catch(() => {});
    if (await p.finnes('#skjerm [data-h="neste"]')) await p.klikk('#skjerm [data-h="neste"]');
  };

  await hintRom(t, {
    antall: 3,
    lagret: "tankeleseren.v1",
    // (From November to January «Jul» is added last and put in its place on the next load – any
    // reload does that, not the net.)
    lagretSom: (x) => ({ ...x, oppsett: { ...x.oppsett, pakker: [...(x.oppsett.pakker || [])].sort() } }),
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("gi");
      await a.klikk('[data-h="tilbake"]');
    },
    steg,
    hemmelig,
    nokkel,
    gjenoppkoble: (sp) => sp.runde >= 2 && sp.fase === "gjett" && Object.keys(sp.laste).length > 0,
    tilSlutt,
    async kamp2(tlf) {
      for (const p of tlf) t.sjekk((await p.spill()).giver === 1, `${p.navn}: B gir ikke første hint i kamp 2`);
    },
  });
  t.sjekk(byttet && skrevet && dratt && skjult > 10, `For lite testet: byttet ${byttet}, skrevet ${skrevet}, dratt ${dratt}, skjult sjekket ${skjult}`);

  await hintRom(t, {
    antall: 5,
    merke: "5",
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("tankeleseren.v1"))}, JSON.stringify({ antall: 5, oppsett: { modus: "lag", pakker: ["hverdag", "mat"], lag: [] }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    steg,
    hemmelig,
    nokkel,
    forlat: {
      hvem: 4,
      nar: (sp) => sp.runde >= 2 && sp.fase === "gjett",
      async etter(tlf) {
        const sp = await tlf[0].spill();
        t.sjekk(sp.ute.includes(4) && sp.laste[4] == null && sp.modus === "lag", "E er ikke tatt ut av runden");
      },
    },
    tilSlutt,
    maksSteg: 500,
  });
  t.sjekk(tippet > 0, "Motlaget tippet aldri");

  await hintRom(t, {
    antall: 2,
    merke: "2",
    steg,
    hemmelig,
    nokkel,
    tilSlutt,
  });
}
