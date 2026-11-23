// Tieren on the net: A has a game saved (three rounds), makes a room; B joins and A starts with two
// (of up to eight); a third phone is told the match has begun. The same cards and rings on both
// phones; the one whose turn it is picks an answer on the ring (its own phone only) and the answer
// is the move – revealed on both phones – or «Stopp»; the one who begins the next round starts it.
// A tap out of turn changes nothing. B closes its tab half-way and comes back; after the last round
// both go to «Kåringen»; «Ny kamp» lets B begin; A leaves; A's saved game is untouched. Then three
// phones: C leaves on its turn, A and B play on to the end.
import { nettKamp } from "../nett-kamp.mjs";
import { treSpillere } from "../nett-videre.mjs";

const nokkel = (sp) => [sp.runde, sp.fase, sp.tur, sp.apne, sp.pott, sp.sum, sp.status, sp.ring, sp.kort, sp.logg];

export default async function (t) {
  let svar = 0;
  let feil = 0;
  let stopp = 0;
  // One step for the phone whose turn it is: «Stopp» with two in the pot, else the first answer
  // left on the ring – right, or wrong every fifth time; between rounds, the next round.
  const trekk = async (p, sp, andre) => {
    if (sp.fase === "ferdig") {
      await p.klikk("#ti-neste");
      return p.vent(`Rusj.S.spill.fase === "velg" && Rusj.S.spill.runde === ${sp.runde + 1}`, 8000);
    }
    const tur = sp.tur;
    if (sp.pott[tur] >= 2) {
      stopp++;
      await p.klikk("#ti-stopp");
      await t.sov(300);
      if (await p.finnes('#ark [data-h="ark-svar"][data-v="ja"]')) await p.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
      return p.vent(`Rusj.S.spill.status[${tur}] === "stopp" || Rusj.S.spill.fase === "ferdig"`, 8000);
    }
    const pos = sp.apne.findIndex((x) => !x);
    await p.klikk(`#skjerm .ti-brikke[data-v="${pos}"]`);
    await p.vent(`Rusj.S.spill.valgt === ${pos} && !!document.querySelector("#skjerm .ti-svarknapp")`, 5000);
    const { fasit, galt } = await p.js(`(() => {
      const D = window.RUSJ_DATA;
      const ALLE = Object.keys(D).filter((n) => n.startsWith("kort-")).sort().flatMap((n) => D[n]);
      const s = Rusj.S.spill;
      const fasit = String(ALLE[s.kort[s.runde]].a[s.ring[${pos}]][1]);
      const galt = Array.from(document.querySelectorAll("#skjerm .ti-svarknapp")).map((k) => k.dataset.v).find((v) => v !== fasit);
      return { fasit, galt: galt ?? null };
    })()`);
    const v = svar++ % 5 === 4 && galt != null ? galt : fasit;
    if (v === galt) feil++;
    await p.js(`Array.from(document.querySelectorAll("#skjerm .ti-svarknapp")).find((k) => k.dataset.v === ${JSON.stringify(v)}).click()`);
    // The answer is revealed on every phone; then the ring is drawn again.
    for (const q of [p, ...andre]) await q.vent(`!!Rusj.S.spill.apne[${pos}] && !!document.querySelector("#skjerm div.ti-brikke.ti-p${pos}:not(.ti-vendt)")`, 10000).catch(() => t.feil(`${q.navn} viste ikke svaret`));
    if (svar === 1) for (const q of [p, ...andre]) await q.bilde("svar");
  };
  // After the last round: everyone goes to «Kåringen» alone.
  const tilKaaring = async (a, b, sp) => {
    if (sp.fase === "ferdig") for (const p of [b, a]) if ((await p.skjerm()) === "ring" && (await p.finnes("#ti-neste:not([disabled])"))) await p.klikk("#ti-neste");
    await t.sov(300);
  };

  await nettKamp(t, {
    lagret: "tieren.v1",
    vertStarter: true,
    skjerm: "ring",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="mer"]');
      await a.klikk('[data-h="runder"][data-v="3"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("ring");
      await a.klikk('#skjerm .ti-brikke[data-v="0"]');
      await a.vent(`Rusj.S.spill.valgt === 0`, 5000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: '#skjerm button.ti-brikke[data-h="velg"]',
    trekk,
    ingenTur: tilKaaring,
    nokkel,
    maksSteg: 400,
    gjenoppkoble: (sp) => sp.runde >= 1 && sp.fase === "velg",
    async kamp2(a, b) {
      const sa = await a.spill();
      t.sjekk(sa.tur === 1 && (await b.spill()).tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk(sa.runder === 3 && sa.sum.every((n) => n === 0), "Ny kamp startet ikke på null med tre runder");
    },
  });
  t.sjekk(feil > 0 && stopp > 0, `For lite testet: ${svar} svar, ${feil} feil, ${stopp} stopp`);

  await treSpillere(t, {
    skjerm: "ring",
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("tieren.v1"))}, JSON.stringify({ antall: 3, oppsett: { niva: "blandet", runder: 3 }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    trekk,
    ingenTur: tilKaaring,
    nokkel,
    forlatNar: (sp) => sp.apne.some(Boolean),
    async etterForlat(a) {
      const sp = await a.spill();
      t.sjekk(sp.ute.includes(2) && sp.tur !== 2 && (sp.fase !== "velg" || sp.status[2] === "borte"), "C er ikke tatt ut av runden");
    },
  });
}
