// Meyer on the net: A has a game on the phone saved (three lives), makes a room; B joins and A
// starts with two (of up to ten); a third phone is told the match has begun. The roll is a move:
// only the roller's phone shows the dice (the other sees the cup and «… kikker under begeret»); the
// claim is a move, and so is the answer – «Tror det» (and the next one rolls) or «Løgn!», when the
// cup is lifted on both phones. B closes its tab while dice lie under a cup and comes back; both go
// to «Kåringen»; «Ny kamp» lets B begin; A leaves; A's saved game is untouched. Then three phones:
// C leaves on its turn, A and B play on to the end (test/nett-videre.mjs).
import { nettKamp } from "../nett-kamp.mjs";
import { treSpillere } from "../nett-videre.mjs";

const nokkel = (sp) => [sp.liv, sp.fase, sp.tur, sp.kast, sp.melding, sp.kjede, sp.runde, sp.vinner, sp.utfall, sp.steg];
// One tap that sends a move (the cup shakes first, so no second tap), then wait until it is played.
const trykk = async (p, sel, ferdig) => {
  await p.klikk(sel);
  await p.vent(ferdig, 10000);
};

export default async function (t) {
  let kikket = false;
  let skjultSjekket = 0;
  let loftet = 0;
  let trodd = 0;
  // One step for the phone whose turn it is: roll, say something, answer, or begin the next round.
  const trekk = async (p, sp, andre) => {
    const endret = `JSON.stringify([Rusj.S.spill.fase, Rusj.S.spill.steg]) !== ${JSON.stringify(JSON.stringify([sp.fase, sp.steg]))}`;
    if (sp.fase === "rist") {
      await trykk(p, '#skjerm .dokk [data-h="rist"]', `${endret} && !!document.querySelector(".my-titt .mappe")`);
      // Only the roller sees the dice: the others have no card to peek at, and see the cup.
      for (const q of andre) {
        await q.vent(`Rusj.S.spill.fase === "skjult" && !!document.querySelector(".my-brett.kikker")`, 8000).catch(() => t.feil(`${q.navn} ser ikke begeret mens ${p.navn} kikker`));
        if (await q.finnes(".my-titt .mappe, [data-h='velg']")) t.feil(`${q.navn} kan se terningene til ${p.navn}`);
        skjultSjekket++;
      }
      return;
    }
    if (sp.fase === "skjult") {
      if (!kikket) {
        kikket = true;
        const slipp = await p.hold(".my-titt .mappe", 600);
        t.sjekk((await p.antall(".mappe.apen .my-bak .trn-solo")) === 2, `${p.navn}: kortet viser ikke terningene når man holder`);
        await p.bilde("kikker");
        await slipp();
      }
      const v = await p.js(`(() => {
        const s = Rusj.S.spill, M = window.RusjMeyer;
        const lov = M.lovlige(s.melding && s.melding.v, s.felles);
        const ekte = M.verdi(s.kast[0], s.kast[1]);
        return lov.includes(ekte) ? ekte : lov.filter((x) => x !== M.FELLES).pop() || lov[0];
      })()`);
      await p.klikk(`[data-h="velg"][data-v="${v}"]`);
      return trykk(p, '#skjerm .dokk [data-h="meld"]', endret);
    }
    if (sp.fase === "svar") {
      const meyer = sp.melding.v === "21";
      const valg = meyer ? "godta" : (loftet + trodd) % 3 === 1 ? "tro" : "loft";
      if (valg === "loft") loftet++;
      if (valg === "tro") trodd++;
      await trykk(p, `#skjerm .dokk [data-h="${valg}"]`, endret);
      if (valg === "loft") {
        // The cup is lifted on every phone: the same dice, the same verdict.
        for (const q of andre) await q.vent(`Rusj.S.spill.fase === "resultat" && !!document.querySelector(".my-brett.loftet")`, 8000).catch(() => t.feil(`${q.navn} ser ikke at begeret løftes`));
        if (loftet === 1) {
          await t.sov(1300); // (the stamp lands first)
          for (const q of [p, ...andre]) await q.bilde("loftet");
        }
      }
      return;
    }
    if (sp.fase === "resultat") return trykk(p, '#skjerm .dokk [data-h="runde"]', endret);
  };
  const tilKaaring = async (a, b, sp) => {
    if (sp.vinner != null) for (const p of [b, a]) if (await p.finnes('#skjerm [data-h="kaaring"]')) await p.klikk('#skjerm [data-h="kaaring"]');
    await t.sov(300);
  };

  await nettKamp(t, {
    lagret: "meyer.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="liv"][data-v="3"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.klikk('#skjerm .dokk [data-h="rist"]');
      await a.vent(`Rusj.S.spill.fase === "skjult"`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: "#skjerm .dokk .knapp",
    trekk,
    ingenTur: tilKaaring,
    nokkel,
    maksSteg: 400,
    gjenoppkoble: (sp) => sp.runde >= 2 && sp.fase === "skjult",
    async kamp2(a, b) {
      t.sjekk((await a.spill()).tur === 1 && (await b.spill()).tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk((await b.spill()).liv.join() === "3,3", "Ny kamp startet ikke med tre liv hver");
    },
  });
  t.sjekk(loftet > 0 && trodd > 0 && skjultSjekket > 0, `For lite testet: løftet ${loftet}, trodd ${trodd}, skjult sjekket ${skjultSjekket}`);

  await treSpillere(t, {
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("meyer.v1"))}, JSON.stringify({ antall: 3, oppsett: { roboter: 0, nivaa: "middels", liv: 3, felles: true }, stat: {}, sist: null, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    trekk,
    ingenTur: tilKaaring,
    nokkel,
    forlatNar: (sp) => sp.runde >= 2,
    async etterForlat(a) {
      const sp = await a.spill();
      t.sjekk(sp.liv[2] === 0 && sp.forlot.includes(2), "C er ikke ute etter å ha forlatt kampen");
    },
  });
}
