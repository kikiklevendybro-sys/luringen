// Grådigper (Ett kort til?) on the net: A has a game saved on the phone (first to 100), makes a
// room; B joins from the link and A starts with two (of up to eight); a third phone is told the
// match has begun. The same deal on both phones; the one whose turn it is taps «Ett til» or «Stopp»
// – each a move that names its round and step – and the card shows on both phones; the one who
// begins the next round deals it. A move sent out of turn and a tap sent twice change nothing on
// either phone. B closes its tab half-way and comes back; when somebody has reached 100 both go to
// «Kåringen»; «Ny kamp» lets B begin; A leaves; A's saved game is untouched (test/nett-kamp.mjs).
// Then three phones: C leaves on its turn, A and B play on to the end (test/nett-videre.mjs).
// (Every card lies face up: there is no secret to keep off the other phones – what is checked is
// that all phones show the same table.)
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";
import { treSpillere } from "../nett-videre.mjs";

// The game's own rules, loaded without the kit (to choose as a player would).
const G = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/gradigper/spill.js", import.meta.url), "utf8"), { window, console });
  return window.RusjGradigper;
})();

const nokkel = (sp) => [sp.runde, sp.fase, sp.tur, sp.rader, sp.status, sp.like, sp.sum, sp.bunke, sp.steg, sp.logg, sp.slutt, sp.ute];
// The buttons are awake (the beat after a card is over) and no move of ours is on its way.
const KLAR = `!document.querySelector("#skjerm .dokk [data-laast]") && !Rusj.nett.venter()`;
// What a phone shows of the table: every seat's cards and points, as it is read out.
const BORD = `Array.from(document.querySelectorAll(".gp-bord > li > .vh")).map((x) => x.textContent).join(" | ")`;

export default async function (t) {
  let trukket = 0;
  let stoppet = 0;
  let utenTur = false;
  let dobbelt = false;
  let bordSjekket = false;
  const trekk = async (p, sp, andre) => {
    if (sp.fase === "ferdig") {
      // The one who begins the next round deals it.
      await p.vent(`document.querySelector("#gp-neste:not([disabled])")`, 8000);
      return p.trekk("#gp-neste", `Rusj.S.spill.fase === "spill" && Rusj.S.spill.runde === ${sp.runde + 1}`);
    }
    await p.vent(KLAR, 8000);
    sp = await p.spill();
    const tur = sp.tur;
    if (!utenTur && sp.steg >= 2 && andre.length) {
      // A move from a phone that does not have the turn goes through the room – and counts for nothing.
      utenTur = true;
      const for_ = JSON.stringify(nokkel(sp));
      t.sjekk(await andre[0].js(`Rusj.nett.send({ til: 1, r: Rusj.S.spill.runde, n: Rusj.S.spill.steg })`), "Trekket utenom tur ble ikke sendt");
      await andre[0].vent(`!Rusj.nett.venter()`, 8000);
      await t.sov(300);
      for (const q of [p, ...andre]) t.sjekk(JSON.stringify(nokkel(await q.spill())) === for_, `${q.navn}: et trekk utenom tur ble spilt`);
    }
    const stopp = G.poeng(sp.rader[tur]) >= 14 || G.risiko(sp, tur) > 0.25;
    if (stopp) stoppet++;
    else trukket++;
    await p.trekk(stopp ? "#gp-stopp" : "#gp-til", `Rusj.S.spill.steg > ${sp.steg}`);
    if (!dobbelt && !stopp) {
      // The same tap once more (a double tap that got through, a slow line): the step it names is old.
      dobbelt = true;
      await p.vent(`!Rusj.nett.venter()`, 8000);
      const etter = JSON.stringify(nokkel(await p.spill()));
      t.sjekk(await p.js(`Rusj.nett.send({ til: 1, r: ${sp.runde}, n: ${sp.steg} })`), "Det doble trekket ble ikke sendt");
      await p.vent(`!Rusj.nett.venter()`, 8000);
      await t.sov(300);
      for (const q of [p, ...andre]) t.sjekk(JSON.stringify(nokkel(await q.spill())) === etter, `${q.navn}: et dobbelt trykk trakk to kort`);
    }
    if (!bordSjekket && trukket >= 2) {
      // Every phone shows the same cards (the table is open: nothing is hidden on any of them).
      bordSjekket = true;
      await t.sov(400);
      const mitt = await p.js(BORD);
      for (const q of andre) t.sjekk((await q.js(BORD)) === mitt, `${q.navn} viser et annet bord enn ${p.navn}:\n      ${await q.js(BORD)}\n      ${mitt}`);
      t.sjekk(/\d/.test(mitt), `Bordet leses ikke opp med kortene: «${mitt}»`);
      for (const q of [p, ...andre]) await q.bilde("samme-bord");
    }
  };
  // Somebody has reached the target: everyone goes to «Kåringen» alone.
  const tilKaaring = async (a, b, sp) => {
    if (sp.slutt) for (const p of [b, a]) if ((await p.skjerm()) === "spill" && (await p.finnes('#skjerm [data-h="kaaring"]'))) await p.klikk('#skjerm [data-h="kaaring"]');
    await t.sov(300);
  };

  await nettKamp(t, {
    lagret: "gradigper.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="mal"][data-v="100"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.klikk("#gp-til");
      await a.vent(`Rusj.S.spill.steg === 2`, 5000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: "#skjerm .dokk .knapp",
    trekk,
    ingenTur: tilKaaring,
    nokkel,
    maksSteg: 900,
    gjenoppkoble: (sp) => sp.runde >= 1 && sp.fase === "spill" && sp.steg % 2 === 0,
    async kamp2(a, b) {
      const sa = await a.spill();
      t.sjekk(sa.tur === 1 && (await b.spill()).tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk(sa.mal === 100 && sa.sum.every((p) => p === 0) && sa.rader.every((r) => r.length === 1), "Ny kamp startet ikke på null med ett kort hver (først til 100)");
      if (t.norsk) t.sjekk(/Din tur/.test(await b.tekst("#skjerm h1")) && !/Din tur/.test(await a.tekst("#skjerm h1")), "Overskriften sier ikke «Din tur» bare hos den som har tur");
    },
  });
  t.sjekk(trukket > 3 && stoppet > 1 && utenTur && dobbelt && bordSjekket, `For lite testet: ${trukket} kort, ${stoppet} stopp, utenom tur ${utenTur}, dobbelt ${dobbelt}, bord ${bordSjekket}`);

  await treSpillere(t, {
    async forbered(a) {
      await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("gradigper.v1"))}, JSON.stringify({ antall: 3, oppsett: { mal: 100 }, spill: null }))`);
      await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
    },
    trekk,
    ingenTur: tilKaaring,
    nokkel,
    maksSteg: 900,
    forlatNar: (sp) => sp.fase === "spill" && sp.steg >= 3,
    async etterForlat(a, b) {
      for (const p of [a, b]) {
        const sp = await p.spill();
        t.sjekk(sp.ute.includes(2) && sp.tur !== 2 && sp.rader[2].length === 0 && (sp.fase !== "spill" || sp.status[2] === "borte"), `${p.navn}: C er ikke tatt ut av runden`);
        t.sjekk(await p.finnes(".gp-plass.borte"), `${p.navn}: plassen til C vises ikke som forlatt`);
      }
    },
  });
}
