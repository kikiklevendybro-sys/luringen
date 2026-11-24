// Lurendreieren on the net: A has a game on the phone saved (three dice each), makes a room; B
// joins and A starts with two (of up to eight); a third phone is told the match has begun. The
// dice come from the room and are the same on both phones – but while the bidding goes on, each
// phone's page has only its own dice. A bid is a move, and so is «Løgn!»: then every die is on
// both phones, the matching ones are counted up (or skipped) and the loser has one die less; the
// one who begins the next round starts it. A tap out of turn changes nothing. B closes its tab
// mid-round and comes back; both go to «Kåringen»; «Ny kamp» lets B begin; A leaves; A's saved
// game is untouched. Then three phones: C leaves on its turn, A and B play on to the end
// (test/nett-videre.mjs).
import { nettKamp } from "../nett-kamp.mjs";
import { treSpillere } from "../nett-videre.mjs";

const nokkel = (sp) => [sp.ant, sp.fase, sp.tur, sp.starter, sp.kast, sp.bud, sp.kjede, sp.runde, sp.vinner, sp.utfall, sp.forlot, sp.ute];

export default async function (t) {
  let bud = 0;
  let ropt = 0;
  let hoyere = 0;
  let skjultSjekket = 0;
  let avslort = 0;
  let hoppet = 0;
  // The seats whose dice are on a phone's page right now.
  const seterPaSiden = (p) => p.js(`Array.from(new Set(Array.from(document.querySelectorAll("#skjerm [data-sete]")).map((e) => Number(e.dataset.sete)))).sort()`);
  // One step for the phone whose turn it is: a bid, «Løgn!», or the next round.
  const trekk = async (p, sp, andre) => {
    const endret = `JSON.stringify([Rusj.S.spill.fase, Rusj.S.spill.steg]) !== ${JSON.stringify(JSON.stringify([sp.fase, sp.steg]))}`;
    if (sp.fase === "avslort") {
      // The count on this phone is skipped (or over); then this phone begins the next round.
      if (await p.finnes('#skjerm [data-h="hopp"]')) await p.klikk('#skjerm [data-h="hopp"]');
      await p.vent(`document.querySelector('#skjerm .dokk [data-h="runde"]:not([disabled])')`, 12000);
      await p.klikk('#skjerm .dokk [data-h="runde"]');
      await p.vent(endret, 10000);
      // New dice on every phone: as many as each one has left.
      for (const q of [p, ...andre]) {
        const meg = await q.nettMeg();
        await q.vent(`Rusj.S.spill.fase === "bud" && document.querySelectorAll("#skjerm .lur-hand .lur-t").length === Rusj.S.spill.ant[${meg}]`, 8000).catch(() => t.feil(`${q.navn} fikk ikke nye terninger på skjermen`));
      }
      return;
    }
    // While the bidding goes on: only one's own dice on the page, on every phone.
    for (const q of [p, ...andre]) {
      const meg = await q.nettMeg();
      const seter = await seterPaSiden(q);
      const egne = (await q.spill()).ant[meg] > 0;
      if (seter.some((s) => s !== meg) || (egne && !seter.includes(meg))) t.feil(`${q.navn} (plass ${meg}) har terningene til plass ${seter.join()} på siden`);
      skjultSjekket++;
    }
    const kan = await p.finnes('#skjerm .dokk [data-h="si"]:not([disabled])');
    if (sp.bud && (!kan || (bud + ropt) % 3 === 2)) {
      ropt++;
      await p.klikk('#skjerm .dokk [data-h="lyv"]');
      await p.vent(endret, 10000);
      // Every die is on every phone, and the same verdict.
      const medTerninger = sp.kast.filter((l) => l.length).length;
      for (const q of [p, ...andre]) {
        await q.vent(`Rusj.S.spill.fase === "avslort" && document.querySelectorAll("#skjerm .lur-bord [data-sete]").length === ${medTerninger}`, 8000).catch(() => t.feil(`${q.navn} ser ikke alle terningene etter «Løgn!»`));
        avslort++;
      }
      if (ropt === 1) {
        for (const q of [p, ...andre]) await q.vent(`document.querySelector(".lur-avsloring.ferdig")`, 12000).catch(() => t.feil(`${q.navn}: opptellingen ble aldri ferdig`));
        for (const q of [p, ...andre]) await q.bilde("avslort");
      }
      // The second time: the phone that shows the count (A; the others have reduced motion) skips it.
      if (ropt === 2) {
        const med = [p, ...andre].find((q) => q.navn.startsWith("A"));
        if (med && (await med.finnes('#skjerm .lur-avsloring.teller [data-lur-tall]')) && (await med.finnes('#skjerm [data-h="hopp"]'))) {
          await med.klikk('#skjerm [data-h="hopp"]');
          await med.vent(`document.querySelector(".lur-avsloring.ferdig")`, 3000).catch(() => t.feil("«Hopp over» avsluttet ikke opptellingen"));
          hoppet++;
        }
      }
      return;
    }
    // A bid: the lowest one, or – every other time – one die more.
    if (bud % 2 === 1 && (await p.js(`!document.querySelector('[data-h="antall"][data-v="1"]').disabled`))) {
      hoyere++;
      await p.klikk('[data-h="antall"][data-v="1"]', 80);
    }
    bud++;
    if (bud === 1) await p.bilde("byr");
    await p.klikk('#skjerm .dokk [data-h="si"]');
    await p.vent(endret, 10000);
    // The bid stands on every phone.
    for (const q of andre) await q.vent(`!!Rusj.S.spill.bud && !!document.querySelector("#skjerm .lur-bud-verdi")`, 8000).catch(() => t.feil(`${q.navn} ser ikke budet`));
  };
  // The last one with dice is known: everyone goes to «Kåringen» alone.
  const tilKaaring = async (a, b, sp) => {
    if (sp.vinner != null)
      for (const p of [b, a]) {
        if (await p.finnes('#skjerm [data-h="hopp"]')) await p.klikk('#skjerm [data-h="hopp"]');
        if (await p.finnes('#skjerm [data-h="kaaring"]')) await p.klikk('#skjerm [data-h="kaaring"]');
      }
    await t.sov(300);
  };

  await nettKamp(t, {
    lagret: "lurendreieren.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="terninger"][data-v="3"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.klikk('[data-h="jeg-er"]');
      await a.vent(`Rusj.S.spill.hos >= 0`, 5000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: "#skjerm .dokk .knapp",
    trekk,
    ingenTur: tilKaaring,
    nokkel,
    maksSteg: 400,
    gjenoppkoble: (sp) => sp.runde >= 2 && sp.fase === "bud" && !!sp.bud,
    async kamp2(a, b) {
      const sa = await a.spill();
      t.sjekk(sa.tur === 1 && (await b.spill()).tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk(sa.ant.join() === "3,3" && sa.runde === 1, "Ny kamp startet ikke med tre terninger hver");
    },
  });
  t.sjekk(bud > 0 && ropt > 0 && hoyere > 0 && skjultSjekket > 0 && avslort > 0 && hoppet > 0, `For lite testet: bud ${bud}, ropt ${ropt}, høyere ${hoyere}, skjult ${skjultSjekket}, avslørt ${avslort}, hoppet over ${hoppet}`);

  await treSpillere(t, {
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("lurendreieren.v1"))}, JSON.stringify({ antall: 3, oppsett: { terninger: 3, joker: true }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    trekk,
    ingenTur: tilKaaring,
    nokkel,
    forlatNar: (sp) => sp.runde >= 2,
    async etterForlat(a) {
      const sp = await a.spill();
      t.sjekk(sp.ant[2] === 0 && sp.forlot.includes(2) && (sp.fase === "bud" ? sp.tur !== 2 : sp.starter !== 2), "C er ikke ute etter å ha forlatt kampen");
      // (C left on its turn, so it had dice: they stay on the table until the next round.)
      t.sjekk(sp.fase !== "bud" || sp.kast[2].length > 0, "Terningene til C forsvant midt i runden");
    },
  });
}
