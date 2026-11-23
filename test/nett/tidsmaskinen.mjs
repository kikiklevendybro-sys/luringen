// Tidsmaskinen on the net: A has a game saved («Først til 5»), makes a room; B joins and A starts
// with two (of up to ten); a third phone is told the match has begun. The same deck on both phones;
// the one whose turn it is puts the card in a gap (its own phone only) and «Sjekk året» is the move
// – the year rolls in on both phones – then «Neste». A tap out of turn changes nothing. B closes its
// tab half-way and comes back; both see «Kåringen»; «Ny kamp» lets B begin; A leaves; A's saved
// game is untouched. Then three phones: C leaves on its turn, A and B play on to the end.
import { nettKamp } from "../nett-kamp.mjs";
import { treSpillere } from "../nett-videre.mjs";

const nokkel = (sp) => [sp.linjer, sp.tur, sp.kort, sp.fase, sp.svar, sp.runde, sp.ferdig, sp.brukt, sp.ute];

export default async function (t) {
  let forsok = 0;
  let feil = 0;
  // One step for the phone whose turn it is: put the card in the right gap (a wrong one every fourth
  // time) and check the year – or go on to the next player.
  const trekk = async (p, sp, andre) => {
    if (sp.fase === "plasser") {
      const { ok, galt } = await p.js(`(() => {
        const D = window.RUSJ_DATA;
        const ALLE = Object.keys(D).filter((n) => n.startsWith("hendelser-")).sort().flatMap((n) => D[n]);
        const s = Rusj.S.spill;
        const linje = s.linjer[s.tur];
        const a = ALLE[s.kort].a;
        const luker = Array.from({ length: linje.length + 1 }, (_, g) => g);
        const passer = (g) => (g === 0 || ALLE[linje[g - 1]].a <= a) && (g === linje.length || ALLE[linje[g]].a >= a);
        return { ok: luker.find(passer), galt: luker.find((g) => !passer(g)) ?? null };
      })()`);
      const g = forsok++ % 4 === 3 && galt != null ? galt : ok;
      if (g === galt) feil++;
      await p.klikk(`#skjerm [data-h="plasser"][data-v="${g}"]`);
      await p.vent(`Rusj.S.spill.plass === ${g}`, 5000);
      if (forsok === 1) await p.bilde("lagt-i-tidslinja");
      await p.klikk("#tm-sjekk");
      // The year rolls in on every phone, then the verdict.
      for (const q of [p, ...andre]) await q.vent(`Rusj.S.spill.fase === "svar" && !!document.querySelector("#skjerm .tm-dom")`, 12000).catch(() => t.feil(`${q.navn} viste ikke året for kortet`));
      if (forsok === 1) for (const q of [p, ...andre]) await q.bilde("aaret");
      return;
    }
    await p.klikk("#tm-neste");
    await p.vent(`Rusj.S.spill.kort !== ${sp.kort} || Rusj.S.spill.ferdig`, 8000);
  };

  await nettKamp(t, {
    lagret: "tidsmaskinen.v1",
    vertStarter: true,
    skjerm: "tur",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="mer"]');
      await a.klikk('[data-h="mal"][data-v="5"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("tur");
      await a.klikk('#skjerm [data-h="plasser"][data-v="0"]');
      await a.vent(`Rusj.S.spill.plass === 0`, 5000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: '#skjerm [data-h="plasser"]',
    trekk,
    nokkel,
    maksSteg: 300,
    gjenoppkoble: (sp) => sp.forsok.reduce((s, n) => s + n, 0) >= 3 && sp.fase === "plasser",
    async kamp2(a, b) {
      const sa = await a.spill();
      t.sjekk(sa.tur === 1 && (await b.spill()).tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk(sa.mal === 5 && sa.linjer.every((l) => l.length === 1), "Ny kamp startet ikke med ett kort hver og målet 5");
    },
  });
  t.sjekk(feil > 0 && forsok > feil, `For lite testet: ${forsok} forsøk, ${feil} feil`);

  await treSpillere(t, {
    skjerm: "tur",
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("tidsmaskinen.v1"))}, JSON.stringify({ antall: 3, oppsett: { modus: "spillere", niva: "blandet", mal: 5 }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    trekk,
    nokkel,
    forlatNar: (sp) => sp.forsok.some((n) => n > 0),
    async etterForlat(a) {
      const sp = await a.spill();
      t.sjekk(sp.ute.includes(2) && sp.tur !== 2, "C er ikke tatt ut av turene");
    },
  });
}
