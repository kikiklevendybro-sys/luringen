// Samleren (rummy) on the net: A has a game against the phone saved («Én runde»), makes a room; B
// joins from the link and A starts with two (of up to four); a third phone is told the match has
// begun. Each phone sees only its own hand. Every draw, meld, lay-off and discard is a move – chosen
// by the game's own phone player and tapped in the real UI – to the end of the match (a new round
// when the stock runs out); B closes its tab half-way and comes back; both go to the result; «Ny
// kamp» lets the next seat begin; A leaves; A's saved game is untouched (test/nett-kamp.mjs).
// Then three phones: C leaves in the middle of its turn, and A and B play on to the end.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";

// The game's own rules and phone players, loaded without the kit (to choose moves as a player would).
const { Rummy, Mobil } = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/samleren/spill.js", import.meta.url), "utf8"), { window, console });
  return window.Samleren;
})();

const nokkel = (sp) => [sp.r.hender, sp.r.stokk, sp.r.bunke, sp.r.bord, sp.r.tur, sp.r.fase, sp.poeng, sp.runde, sp.ute];
const LAGRET = { antall: 2, oppsett: { variant: "klassisk", modus: "mobil", mobiler: 1, niva: 2, mal: { klassisk: "en", 500: "500", gin: "100" } }, spill: null, rekord: {}, sorter: "farge" };

// One step of p's turn, through the real UI: draw or take, or one meld / lay-off / discard.
async function steg(p) {
  await p.vent(`!Rusj.nett.venter()`, 10000);
  const sp = await p.spill();
  const r = sp.r;
  const meg = await p.nettMeg();
  if (r.tur !== meg || r.fase === "slutt") return;
  const naa = JSON.stringify([r.tur, r.fase, r.hender, r.bunke.length, r.bord.length, r.resultat]);
  const endret = `JSON.stringify([Rusj.S.spill.r.tur, Rusj.S.spill.r.fase, Rusj.S.spill.r.hender, Rusj.S.spill.r.bunke.length, Rusj.S.spill.r.bord.length, Rusj.S.spill.r.resultat]) !== ${JSON.stringify(naa)}`;
  if (r.fase !== "spill") {
    const v = Mobil.velgTrekk(JSON.parse(JSON.stringify(r)), meg, 2, Math.random);
    if (v.type === "trekk") return p.trekk('#skjerm .dokk [data-h="trekk"]', endret);
    if (v.type === "avsla") return p.trekk('#skjerm .dokk [data-h="avsla"]', endret);
    if (v.type === "stopp") return p.trekk('#skjerm .dokk [data-h="stopp"]', endret);
    if (v.i == null || v.i === r.bunke.length - 1) return p.trekk('#skjerm .sa-bunke[data-h="ta"], #skjerm .sa-bk[data-v="' + (r.bunke.length - 1) + '"]', endret);
    await p.klikk(`#skjerm [data-h="bunkekort"][data-v="${v.i}"]`);
    return p.trekk('#skjerm .dokk [data-h="ta"]', endret);
  }
  const kopi = JSON.parse(JSON.stringify(r));
  const logg = kopi.logg; // the turn's own list (kept even when the round ends on an empty stock)
  if (!Mobil.spillResten(kopi, meg, 2, Math.random)) throw new Error("Fant ikke et trekk");
  // (The turn's log already holds what was done earlier in this turn: only the new part counts.)
  const h = logg.slice(r.logg.length).find((x) => ["meld", "til", "kast", "bank"].includes(x.type));
  const kort = h.type === "meld" || h.type === "til" ? h.kort : [h.k];
  // Pick exactly these cards in the hand.
  for (const k of new Set([...kort, ...sp.valgt])) if (kort.includes(k) !== sp.valgt.includes(k)) await p.klikk(`#skjerm .sa-hand [data-h="kortvalg"][data-v="${k}"]`, 60);
  const sel = { meld: '#skjerm .dokk [data-h="legut"]', til: `#skjerm .sa-meld[data-h="tilmeld"][data-v="${h.mi}"]`, kast: '#skjerm .dokk [data-h="kast"]', bank: '#skjerm .dokk [data-h="bank"]' }[h.type];
  return p.trekk(sel, endret);
}

// Nobody's turn: a round is over. A new round from one phone, or «Se kåringen» on every phone.
async function rundeSlutt(t, telefoner) {
  for (const p of telefoner) if (await p.finnes('#skjerm [data-h="kaaring"]')) await p.klikk('#skjerm [data-h="kaaring"]');
  const p = telefoner[0];
  if ((await p.skjerm()) === "spill" && (await p.finnes('#skjerm .dokk [data-h="runde"]'))) {
    const runde = (await p.spill()).runde;
    await p.trekk('#skjerm .dokk [data-h="runde"]', `Rusj.S.spill.runde === ${runde + 1}`);
  }
  await t.sov(300);
}

export default async function (t) {
  const { a, b } = await nettKamp(t, {
    lagret: "samleren.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="mal"][data-v="en"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.klikk('#skjerm .dokk [data-h="trekk"]');
      await a.vent(`Rusj.S.spill.r.fase === "spill"`, 8000);
      await a.klikk('[data-h="tilbake"]');
    },
    utenTur: "#skjerm .sa-stokk",
    trekk: (p) => steg(p),
    async ingenTur(a, b, sp) {
      if (sp.r.fase === "slutt") await rundeSlutt(t, [a, b]);
      else await t.sov(200);
    },
    nokkel,
    maksSteg: 900,
    gjenoppkoble: (sp) => sp.r.turer >= 2 && sp.r.fase !== "slutt", // early: a round can end within a few turns
    async kamp2(a, b) {
      const sa = await a.spill();
      t.sjekk(sa.r.tur === 1 && (await b.spill()).r.tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk(sa.poeng.join() === "0,0" && sa.runde === 1, "Ny kamp startet ikke på null");
      t.sjekk(sa.r.hender[0].length === 10 && (await a.finnes("#skjerm .sa-hand .sa-hk")), "A ser ikke sin egen hånd");
    },
  });

  // ---------- Three phones: C leaves mid-turn, A and B play on ----------
  const c = await t.telefon("C3");
  await a.apne();
  await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("samleren.v1"))}, ${JSON.stringify(JSON.stringify(LAGRET))})`);
  await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`Rusj.nett.antall() === 3 && document.querySelector('[data-h="nett-start"]')`, 10000);
  if (t.norsk) t.sjekk(/Rummy · Én runde/.test(await a.tekst("#skjerm .seksjon .hjelp")), `Oppsettet i venterommet: «${await a.tekst("#skjerm .seksjon .hjelp")}»`);
  await a.bilde("tre-venterom");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm("spill");
  const tre = [a, b, c];
  t.sjekk((await c.spill()).r.hender[2].length === 7 && (await c.nettMeg()) === 2, "C har ikke sete 2 med sju kort");
  const ikkeEgne = await a.js(`document.querySelectorAll("#skjerm .sa-hand .sa-hk").length === Rusj.S.spill.r.hender[0].length && document.querySelectorAll(".sa-andre .sa-plass").length === 2`);
  t.sjekk(ikkeEgne, "A ser ikke nøyaktig sin egen hånd og to andre plasser");
  const likt = async (p, andre, hva) => {
    const mal = JSON.stringify(nokkel(await p.spill()));
    for (const q of andre) {
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        ok = JSON.stringify(nokkel(await q.spill())) === mal;
        if (!ok) await t.sov(200);
      }
      if (!ok) t.feil(`${q.navn} er uenig med ${p.navn} etter ${hva}`);
    }
  };
  let gikk = false;
  let inne = tre;
  for (let n = 0; n < 900; n++) {
    if ((await a.skjerm()) === "slutt" && (await b.skjerm()) === "slutt") break;
    const sp = await a.spill();
    if (sp.r.fase === "slutt") {
      await rundeSlutt(t, inne);
      continue;
    }
    if (!gikk && sp.r.turer >= 4 && sp.r.tur === 2 && sp.r.fase === "trekk") {
      // C draws, then leaves in the middle of its turn.
      await steg(c);
      await likt(c, [a, b], "C sitt trekk");
      await c.bilde("tre-for-c-gaar");
      await t.forlat(c);
      gikk = true;
      inne = [a, b];
      await a.vent(`Rusj.S.spill.ute.includes(2) && Rusj.S.spill.r.tur === 0`, 10000);
      await likt(a, [b], "at C gikk");
      const etter = await a.spill();
      t.sjekk(etter.r.hender[2].length === 0, "Kortene til C ble ikke tatt ut av spillet");
      t.sjekk(Rummy.hel(etter.r), "Kortstokken er ikke hel etter at C gikk");
      t.sjekk(!(await a.finnes('#ark [data-h="nett-forlat"]')), "A fikk «kampen er over» selv om to er igjen");
      if (t.norsk) t.sjekk(/Forlot kampen/.test(await a.tekst(".sa-andre")), "C står ikke som «forlot kampen» hos A");
      await a.bilde("tre-c-gikk");
      continue;
    }
    const p = inne.find((q, i) => tre.indexOf(q) === sp.r.tur) || null;
    if (!p) {
      await t.sov(200);
      continue;
    }
    if (gikk) t.sjekk(sp.r.tur !== 2, "C fikk tur etter at C gikk");
    await t.sov(300);
    await steg(p);
    await likt(p, inne.filter((q) => q !== p), `steg ${n}`);
  }
  t.sjekk(gikk, "C gikk aldri ut av kampen");
  await a.ventSkjerm("slutt", 15000);
  await b.ventSkjerm("slutt", 15000);
  t.sjekk(JSON.stringify(nokkel(await a.spill())) === JSON.stringify(nokkel(await b.spill())), "Sluttstillingen er ulik hos A og B");
  t.sjekk((await a.spill()).ute.join() === "2", "C er ikke ute på slutten");
  await a.bilde("tre-kaaring");
  await t.forlat(b);
  await a.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await a.klikk('#ark [data-h="nett-forlat"]');
  await a.ventSkjerm("hjem");
}
