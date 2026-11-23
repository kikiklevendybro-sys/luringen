// Vri åtter on the net: A has a game against the phone saved («Først til 3», house rule «Toer»),
// makes a room; B joins from the link and A starts with two (of up to four); a third phone is told
// the match has begun. Every card, colour, draw and pass is a move – each phone shows only its own
// hand – round after round to three wins; B closes its tab half-way and comes back; «Ny kamp» lets
// the other seat begin; A leaves; A's saved game is untouched (test/nett-kamp.mjs). Then three
// phones play «Én runde»: C leaves on its own turn, and A and B play the round to the end.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";

// The game's own rules and phone player, loaded without the kit (to pick a card as a player would).
const { Mobil } = (() => {
  const kontekst = { window: {}, console };
  vm.createContext(kontekst);
  vm.runInContext(readFileSync(new URL("../../rusj/spill/vriatter/spill.js", import.meta.url), "utf8"), kontekst);
  return kontekst.window.VriAtter;
})();

const BILDE = `JSON.stringify([Rusj.S.spill.r.hender, Rusj.S.spill.r.bunke, Rusj.S.spill.r.tur, Rusj.S.spill.r.venter, Rusj.S.spill.r.trukket, Rusj.S.spill.runde])`;
// One move for p, whose turn it is: the colour after an eight, a card, a draw or a pass.
async function trekk(p) {
  const sp = await p.spill();
  const r = sp.r;
  const meg = await p.nettMeg();
  const endret = `${BILDE} !== ${JSON.stringify(JSON.stringify([r.hender, r.bunke, r.tur, r.venter, r.trukket, sp.runde]))}`;
  if (r.venter === meg) return p.trekk('#skjerm .vr-farge[data-v="1"]', endret);
  const v = Mobil.velg(r, meg, 2, () => 0.5);
  if (v.type === "legg") return p.trekk(`#skjerm .vr-hand [data-h="legg"][data-v="${v.k}"]`, endret);
  return p.trekk(v.type === "trekk" ? '#skjerm .dokk [data-h="trekk"]' : '#skjerm .dokk [data-h="pass"]', endret);
}
const nokkel = (sp) => [sp.runde, sp.poeng, sp.r.hender, sp.r.bunke, sp.r.stokk.length, sp.r.tur, sp.r.venter, sp.r.sort, sp.ute];
const skjulte = (p) => p.js(`(() => { const meg = Rusj.nett.meg(); const vist = [...document.querySelectorAll("#skjerm .vr-hand [data-k]")].map((el) => Number(el.dataset.k)).sort((x, y) => x - y); return JSON.stringify(vist) === JSON.stringify(Rusj.S.spill.r.hender[meg].slice().sort((x, y) => x - y)) && !document.querySelector("#skjerm .vr-andre .sk-opp"); })()`);

export default async function (t) {
  const { a, b } = await nettKamp(t, {
    lagret: "vriatter.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="mal"][data-v="tre"]');
      await a.klikk('[data-h="toer"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.vent(`Rusj.S.spill && Rusj.S.spill.r`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: "#skjerm .vr-hand .vr-hk",
    async trekk(p) {
      t.sjekk(await skjulte(p), `${p.navn}: viser ikke nøyaktig sin egen hånd (eller en annens kort)`);
      await trekk(p);
    },
    // The round is over: «Ny runde» from one phone, or «Se kåringen» on both after the last.
    async ingenTur(a, b, sp) {
      if (sp.r.vinner != null) {
        const p = (await b.finnes('#skjerm .dokk [data-h="runde"]')) ? b : (await a.finnes('#skjerm .dokk [data-h="runde"]')) ? a : null;
        if (p) await p.trekk('#skjerm .dokk [data-h="runde"]', `Rusj.S.spill.runde > ${sp.runde}`);
        else for (const q of [b, a]) if (await q.finnes('[data-h="kaaring"]')) await q.klikk('[data-h="kaaring"]');
      }
      await t.sov(300);
    },
    nokkel,
    maksSteg: 900,
    gjenoppkoble: (sp) => sp.r.vinner == null && sp.r.bunke.length >= 5,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).r.tur === 1 && (await b.spill()).r.tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk((await b.spill()).poeng.join() === "0,0" && (await b.spill()).toer, "Ny kamp startet ikke på null, med vertens husregel");
    },
  });

  // Three phones, «Én runde»: C leaves on its own turn; the other two play on to the end.
  const c = await t.telefon("C");
  await a.apne();
  await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("vriatter.v1"))}, JSON.stringify({ antall: 2, oppsett: { modus: "mobil", mobiler: 1, niva: 2, mal: "en", toer: false }, spill: null, rekord: {} }))`);
  await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`document.querySelectorAll(".nett-seter li.med").length === 3 && document.querySelector('[data-h="nett-start"]')`, 10000);
  await a.bilde("tre-venterom");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm("spill");
  t.sjekk((await c.nettMeg()) === 2 && (await c.spill()).r.hender[2].length === 5, "C har ikke plass 3 med fem kort");
  const likt = async (p, andre, hva) => {
    const mal = JSON.stringify(nokkel(await p.spill()));
    for (const q of andre) {
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        ok = JSON.stringify(nokkel(await q.spill())) === mal;
        if (!ok) await t.sov(200);
      }
      if (!ok) t.feil(`${q.navn} er uenig etter ${hva}`);
    }
  };
  let ute = false;
  for (let steg = 0; steg < 400; steg++) {
    const sp = await a.spill();
    if (sp.r.vinner != null) break;
    const inne = ute ? [a, b] : [a, b, c];
    let p = null;
    for (const q of inne) if (!p && (await q.minTur())) p = q;
    if (!p) {
      await t.sov(200);
      continue;
    }
    if (!ute && p === c && steg >= 3) {
      await c.bilde("tre-for-forlat");
      await t.forlat(c);
      ute = true;
      for (const q of [a, b]) await q.vent(`Rusj.S.spill.ute.includes(2) && Rusj.S.spill.r.tur !== 2 && Rusj.S.spill.r.hender[2].length === 0`, 8000);
      t.sjekk(!(await b.finnes('#ark [data-h="nett-forlat"]')) && (await b.js("Rusj.nett.aktiv()")), "B fikk «kampen er over» selv om to er igjen");
      await likt(a, [b], "at C gikk");
      await b.bilde("tre-c-forlot");
      continue;
    }
    await t.sov(600);
    await trekk(p);
    await likt(p, inne.filter((q) => q !== p), `steg ${steg}`);
  }
  t.sjekk(ute, "C forlot aldri kampen");
  for (const p of [a, b]) {
    await p.vent(`document.querySelector('[data-h="kaaring"]')`, 10000);
    await p.klikk('[data-h="kaaring"]');
    await p.ventSkjerm("slutt");
  }
  const sa = await a.spill();
  t.sjekk(JSON.stringify(nokkel(sa)) === JSON.stringify(nokkel(await b.spill())) && sa.r.vinner !== 2 && sa.poeng[2] === 0, "Slutten er ulik, eller C vant uten å være med");
  await a.bilde("tre-kaaring");
  await t.forlat(b);
  await t.forlat(a);
}
