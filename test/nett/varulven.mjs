// Varulven on the net, both ways of playing, with no game leader.
// «Én natt» on six phones (A's setup: three rounds): every phone holds its own role card (no other
// phone has one on screen) and does its night job at the same time – the troublemaker picks two – then
// the day, the vote on the phones and the reveal; the leader of the next round starts it. B closes its
// tab half-way and comes back. «Ny kamp»: in match 2 a player leaves at night – the round does not
// count – and the five others play on to the end.
// «Klassisk» on six phones (A's game on the phone is saved first): roles, a peaceful first night, the
// first day votes out a villager (a hunter shoots), the wolf strikes, the second day catches the wolf:
// the village wins. During the night no villager's phone shows a wolf. In match 2 a villager leaves at
// night and the others play the match out.
import { rollekamp } from "../nett-roller.mjs";

const IKON = { varulv: "🐺", synsk: "🔮", lege: "🩺", jeger: "🏹", landsby: "🏡", bytter: "🔄", brak: "😈" };
const nokkel = (sp) => [sp.type, sp.fase, sp.runde, sp.natt, sp.dag, sp.roller, sp.levende, sp.valg, sp.stemmer, sp.klar, sp.slutt, sp.pekt, sp.poeng, sp.hendelser, sp.jeger, sp.utkastet, sp.vinner, sp.ute, sp.ferdig];

export default async function (t) {
  const sett = { brak: false, jeger: false, landsby: false, ulv: false, tom: false, kort: 0 };
  const inne = (sp) => [...Array(sp.n).keys()].filter((i) => !sp.ute.includes(i));
  const levende = (sp) => inne(sp).filter((i) => sp.type === "en" || sp.levende[i]);

  // Hold my own role card: my role only, and no other phone has a card on screen.
  async function rollekort(p, sp, alle) {
    const meg = await p.nettMeg();
    for (const q of alle) t.sjekk(!(await q.tekst(".mappe-bakside")).trim(), `${q.navn} har et rollekort framme før det holdes`);
    const slipp = await p.hold('.mappe[data-mappe="nett"]', 650);
    const ikon = await p.tekst(".mappe-bakside .vu-kort-ikon");
    t.sjekk(ikon.includes(IKON[sp.roller[meg]]), `${p.navn}: kortet viser ikke rollen (${sp.roller[meg]}): «${ikon}»`);
    for (const q of alle) if (q !== p) t.sjekk(!(await q.tekst(".mappe-bakside")).trim(), `${q.navn} ser et kort mens ${p.navn} ser sitt`);
    if (sett.kort++ < 2) await p.bilde(`rolle-${sp.roller[meg]}`);
    await slipp();
    t.sjekk(!(await p.tekst(".mappe-bakside")).trim(), `${p.navn}: kortet blir stående etter at fingeren slipper`);
  }

  const trekk = async (p, sp, alle) => {
    const meg = await p.nettMeg();
    const rolle = sp.roller[meg];
    if (sp.fase === "roller") {
      await rollekort(p, sp, alle);
      return p.trekk('[data-h="pa-klar"]', `Rusj.S.spill.klar[${meg}] != null`);
    }
    if (sp.fase === "natt") {
      // During the night no villager's phone shows a wolf (the wolves see each other; the seer may have found one).
      if (sp.type !== "en" && sp.natt === 1) {
        for (const q of alle) {
          const r = sp.roller[await q.nettMeg()];
          if (r !== "varulv" && r !== "synsk") t.sjekk(!(await q.js(`document.querySelector("#skjerm").innerText.includes("🐺")`)), `${q.navn} (${r}) ser en varulv om natta`);
        }
      }
      const andre = levende(sp).filter((i) => i !== meg);
      const ulver = inne(sp).filter((i) => sp.roller[i] === "varulv");
      let mal;
      if (sp.type === "en" && rolle === "brak") {
        sett.brak = true;
        await p.klikk(`[data-h="pa-marker"][data-v="${andre[0]}"]`);
        await p.klikk(`[data-h="pa-marker"][data-v="${andre[1]}"]`);
        await p.bilde("brakmaker");
        return p.trekk('[data-h="pa-velg"]', `Rusj.S.spill.valg[${meg}] != null`);
      }
      if (rolle === "varulv") mal = andre.find((i) => !ulver.includes(i));
      else if (rolle === "lege") mal = [meg, ...andre].find((i) => i !== sp.forrigeBeskyttet);
      else mal = andre[0];
      await p.klikk(`[data-h="pa-marker"][data-v="${mal}"]`);
      await p.trekk('[data-h="pa-velg"]', `Rusj.S.spill.valg[${meg}] != null || Rusj.S.spill.fase !== "natt"`);
      if (rolle === "synsk" || rolle === "varulv") await p.bilde(`natt-${rolle}`);
      return;
    }
    if (sp.fase === "stemme") {
      // «Klassisk»: day 1 a villager goes, then the wolf. «Én natt»: round 1 the wolf, then spread votes.
      const med = levende(sp).filter((i) => i !== meg);
      let mot;
      if (sp.type === "en") {
        const ulv = sp.slutt.indexOf("varulv");
        mot = sp.runde % 2 ? (meg === ulv ? med[0] : ulv) : med[(meg + 1) % med.length];
      } else {
        const ulv = inne(sp).find((i) => sp.roller[i] === "varulv" && sp.levende[i]);
        const offer = levende(sp).find((i) => i !== ulv && i !== 0);
        mot = sp.dag === 1 ? (meg === offer ? med.find((i) => i !== ulv) : offer) : meg === ulv ? med[0] : ulv;
      }
      await p.klikk(`[data-h="pa-marker"][data-v="${mot}"]`);
      if (!sp.stemmer.some((x) => x != null)) await p.bilde("stemme");
      return p.trekk('[data-h="pa-mot"]', `Rusj.S.spill.stemmer == null || Rusj.S.spill.stemmer[${meg}] != null`);
    }
    if (sp.jeger && sp.jeger.mal == null && sp.jeger.av === meg) {
      // The hunter takes a villager along (not the wolf: the game goes on).
      const mal = levende(sp).find((i) => i !== meg && sp.roller[i] !== "varulv");
      sett.jeger = true;
      await p.klikk(`[data-h="pa-marker"][data-v="${mal}"]`);
      await p.bilde("jeger");
      return p.trekk('[data-h="pa-skyt"]', `Rusj.S.spill.jeger.mal != null`);
    }
    if (sp.fase === "utkastet") {
      await p.bilde(`utkastet-${sp.dag}`);
      return p.trekk('[data-h="pa-kveld"]', `Rusj.S.spill.fase === "natt"`);
    }
    if (sp.fase === "avsloring" || sp.fase === "tom") {
      if (sp.fase === "tom") sett.tom = true;
      await p.bilde(`avsloring-${sp.runde}`);
      return p.trekk('[data-h="pa-runde"]', `Rusj.S.spill.runde === ${sp.runde + 1}`);
    }
  };

  // Nobody's turn: the day (the leader starts the vote), or «Se hvem som vant» / «Til kåringen».
  const ingenTur = async (alle, sp) => {
    if (sp.ferdig) {
      if (sp.vinner) sett[sp.vinner] = true;
      for (const p of alle) if ((await p.skjerm()) === "nettvarulv" && (await p.finnes('[data-h="pa-kaaring"]'))) await p.klikk('[data-h="pa-kaaring"]');
      return t.sov(250);
    }
    if (sp.fase === "dag") {
      for (const p of alle) {
        if (await p.finnes('[data-h="pa-stemme"]:not([disabled])')) {
          await p.bilde(`dag-${sp.type === "en" ? sp.runde : sp.dag}`);
          return p.trekk('[data-h="pa-stemme"]', `Rusj.S.spill.fase === "stemme"`);
        }
      }
    }
    await t.sov(200);
  };

  // «Én natt» on six phones (the troublemaker comes in from six).
  const en = await rollekamp(t, {
    antall: 6,
    skjermer: ["nettvarulv"],
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("varulven.v1"))}, JSON.stringify({ antall: 6, oppsett: { modus: "en", runder: 3 }, spill: null, stilling: { landsby: 0, ulv: 0 } }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    trekk,
    ingenTur,
    nokkel,
    gjenoppkoble: (sp) => sp.runde >= 1 && sp.fase === "avsloring" && !sp.ferdig,
    forlatNar: (sp) => (sp.fase === "natt" && sp.runde === 1 ? 4 : null),
    async etterForlat(alle, sp, i) {
      t.sjekk(sp.fase === "tom" && sp.borte === i, "Runden ble ikke avsluttet da en spiller gikk");
    },
    async kamp2(alle) {
      const sp = await alle[0].spill();
      t.sjekk(sp.type === "en" && sp.runder === 3 && sp.forste === 1 && sp.poeng.every((x) => x === 0), "Kamp 2 startet ikke på null");
    },
  });
  for (const p of en) await p.lukk();

  // «Klassisk» on six phones (A's game on the phone first).
  await rollekamp(t, {
    antall: 6,
    lagret: "varulven.v1",
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      if (await a.finnes('[data-h="modus"][data-v="klassisk"]')) await a.klikk('[data-h="modus"][data-v="klassisk"]');
      await a.klikk('[data-h="rolle"][data-v="jeger"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("roller");
      await a.klikk("#tilbake");
    },
    skjermer: ["nettvarulv"],
    trekk,
    ingenTur,
    nokkel,
    gjenoppkoble: (sp) => sp.fase === "utkastet" && !sp.ferdig && !(sp.jeger && sp.jeger.mal == null),
    // Match 2: a villager (not the host) leaves during the first night.
    forlatNar: (sp) => (sp.type === "klassisk" && sp.fase === "natt" && sp.natt === 1 ? [5, 4, 3].find((i) => sp.roller[i] === "landsby" || sp.roller[i] === "synsk") ?? null : null),
    async etterForlat(alle, sp, i) {
      t.sjekk(!sp.levende[i] && sp.hendelser.some((h) => h.type === "borte" && h.i === i), "Den som gikk, er ikke ute av landsbyen");
    },
    async kamp2(alle) {
      const sp = await alle[0].spill();
      t.sjekk(sp.type === "klassisk" && sp.fase === "roller" && sp.roller.includes("jeger"), "Kamp 2 er ikke en ny klassisk kamp med jeger");
    },
  });
  t.sjekk(sett.brak && sett.landsby && sett.tom, `For lite testet: ${JSON.stringify(sett)}`);
}
