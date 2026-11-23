// Golfballen (card golf) on the net. Part 1, two phones: A has a game against the phone saved («1
// hull», six cards), makes a room; B joins and A starts with two (of up to four); a third phone is
// told the match has begun. Every step of a turn is a move – the same deal on both phones, the first
// two cards turned at once with «Snu tilfeldig» – to the end of the hole; B closes its tab half-way
// and comes back; both go to «Kåringen»; «Ny kamp» lets B begin; A leaves; A's saved game is
// untouched (test/nett-kamp.mjs). Part 2, three phones, four cards: each looks at its own bottom two
// (the others never see them, nor a card drawn from the pile); C draws a card and leaves with it in
// hand – the card goes on the discards, C's turns are skipped – and A and B play the hole out; C is
// not in the result.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { nettKamp } from "../nett-kamp.mjs";

// The game's own rules and phone player, loaded without the kit (to choose a move as a player would).
const G = (() => {
  const window = {};
  vm.runInNewContext(readFileSync(new URL("../../rusj/spill/golfballen/spill.js", import.meta.url), "utf8"), { window, console });
  return window.Golfballen;
})();

const ROLIG = `!Rusj.nett.venter()`;
const TILSTAND = `JSON.stringify([Rusj.S.spill.hullNr, Rusj.S.spill.r.tur, Rusj.S.spill.r.hand, Rusj.S.spill.r.turer, Rusj.S.spill.r.startSnudd, Rusj.S.spill.r.tittet, Rusj.S.spill.r.maaSnu, Rusj.S.spill.r.fase, Rusj.S.spill.r.kast.length])`;
const nokkel = (sp) => [sp.hullNr, sp.poeng, sp.ute, sp.r && [sp.r.rutenett, sp.r.kast, sp.r.stokk.length, sp.r.tur, sp.r.hand, sp.r.turer, sp.r.fase, sp.r.slutt]];

// One step of p's turn, chosen by the game's own phone player (Middels) and tapped in the real UI.
// Returns the kind of step.
async function steg(t, p, valg = {}) {
  await p.vent(ROLIG, 15000);
  let sp = await p.spill();
  if (sp.viser != null) {
    // Four cards: the bottom two are showing – «Jeg husker dem» (on this phone only).
    await p.klikk('#skjerm .dokk [data-h="husker"]');
    await p.vent("Rusj.S.spill.viser == null", 5000);
    return "husker";
  }
  const meg = await p.nettMeg();
  const r = sp.r;
  const v = G.Mobil.velg(r, meg, 2, Math.random);
  const for_ = await p.js(TILSTAND);
  const endret = `${TILSTAND} !== ${JSON.stringify(for_)}`;
  if (v.type === "startsnu" && valg.tilfeldig && r.startSnudd[meg] === 0) {
    await p.trekk('#skjerm .dokk [data-h="startsnu"]', endret);
    return "tilfeldig";
  }
  if (v.type === "bank") {
    await p.klikk('#skjerm [data-h="bank"]');
    await p.klikk('#ark [data-h="ark-svar"][data-v="ja"]');
    await p.vent(endret, 8000);
    return "bank";
  }
  const sel = {
    startsnu: `#skjerm .gb-meg [data-h="startsnu"][data-v="${v.i}"]`,
    titt: '#skjerm .dokk [data-h="titt"]',
    snu: `#skjerm .gb-meg [data-h="snukort"][data-v="${v.i}"]`,
    trekk: '#skjerm .gb-stokk[data-h="trekk"]',
    ta: '#skjerm .gb-kast[data-h="ta"]',
    bytt: `#skjerm .gb-meg [data-h="bytt"][data-v="${v.i}"]`,
    kast: '#skjerm .dokk [data-h="kast"]',
  }[v.type];
  await p.trekk(sel, endret);
  return v.type;
}

export default async function (t) {
  let tilfeldig = false;
  const { a, b } = await nettKamp(t, {
    lagret: "golfballen.v1",
    vertStarter: true,
    async offline(a) {
      await a.klikk('[data-h="nytt"]');
      await a.ventSkjerm("oppsett");
      await a.klikk('[data-h="hull"][data-v="1"]');
      await a.klikk('[data-h="start"]');
      await a.ventSkjerm("spill");
      await a.klikk('#skjerm .gb-meg [data-h="startsnu"]');
      await a.vent("Rusj.S.spill.r.startSnudd[0] === 1", 5000);
      await a.klikk("#tilbake");
    },
    utenTur: '#skjerm .gb-stokk[data-h="trekk"]',
    async trekk(p) {
      if ((await steg(t, p, { tilfeldig: !tilfeldig })) === "tilfeldig") {
        tilfeldig = true;
        t.sjekk((await p.spill()).r.startSnudd[await p.nettMeg()] === 2, "«Snu tilfeldig» snudde ikke to kort");
      }
    },
    async ingenTur(a, b, sp) {
      // The hole is over: with one hole the match is too – both go to «Kåringen».
      if (sp.r && sp.r.fase === "ferdig") for (const p of [b, a]) if (await p.finnes('#skjerm [data-h="kaaring"]')) await p.klikk('#skjerm [data-h="kaaring"]');
      await t.sov(300);
    },
    nokkel,
    maksSteg: 800,
    gjenoppkoble: (sp) => sp.r.fase === "spill" && sp.r.turer[0] >= 2 && sp.r.turer[1] >= 2,
    async kamp2(a, b) {
      t.sjekk((await a.spill()).r.tur === 1 && (await b.spill()).r.tur === 1, "Den andre begynner ikke kamp 2");
      t.sjekk((await b.spill()).poeng.every((x) => !x.length), "Ny kamp startet ikke på null");
    },
  });
  t.sjekk(tilfeldig, "«Snu tilfeldig» ble ikke testet på nett");

  // ---------- Part 2: three phones, four cards; C leaves mid-turn ----------
  const c = await t.telefon("C3");
  await a.apne();
  await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("golfballen.v1"))}, JSON.stringify({ antall: 2, oppsett: { modus: "mobil", mobiler: 1, niva: 2, var: "fire", hull: 1, toer: true, snu: false }, spill: null, rekord: {} }))`);
  await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await t.bliMed(c, lenke, "Testspiller C");
  await a.vent(`Rusj.nett.antall() === 3 && document.querySelector('[data-h="nett-start"]')`, 15000);
  if (t.norsk) t.sjekk(/4 kort · 1 hull · Toer minus to/.test(await c.tekst("#skjerm .seksjon .hjelp")), `Oppsettet i venterommet: «${await c.tekst("#skjerm .seksjon .hjelp")}»`);
  await c.bilde("venterom-tre");
  await a.klikk('[data-h="nett-start"]');
  for (const p of [a, b, c]) await p.ventSkjerm("spill");
  t.sjekk((await c.nettMeg()) === 2, "C har ikke plass 3");
  await a.bilde("fire-kort-start");

  const inne = [a, b, c];
  let cUte = false;
  let sett = false; // the bottom two seen on one phone and hidden on the others
  let handSjekket = false;
  const sist = new Map();
  for (let n = 0; n < 900; n++) {
    const sp = await a.spill();
    if (sp.r.fase === "ferdig") break;
    let p = null;
    for (const q of inne) if (await q.minTur()) p = q;
    if (!p) {
      await t.sov(200);
      continue;
    }
    const meg = await p.nettMeg();
    const egen = await p.spill();
    if (!cUte && p === c && egen.r.tittet[2] && egen.viser == null && egen.r.hand == null && egen.r.turer[0] >= 1) {
      // C draws a card and leaves with it in hand; A and B play on.
      await c.trekk('#skjerm .gb-stokk[data-h="trekk"]', "Rusj.S.spill.r.hand != null");
      const kort = (await c.spill()).r.hand;
      await c.bilde("trakk-for-forlat");
      await t.forlat(c);
      inne.pop();
      cUte = true;
      for (const q of [a, b]) await q.vent(`Rusj.S.spill.ute.includes(2) && Rusj.S.spill.r.tur !== 2`, 10000);
      const etter = await a.spill();
      t.sjekk(etter.r.hand == null && etter.r.kast.at(-1) === kort, `Kortet C hadde i hånda, havnet ikke i kastebunken (${kort}, ${JSON.stringify(etter.r.kast.slice(-2))})`);
      t.sjekk(await a.finnes("#skjerm .gb-sete.borte"), "A viser ikke at C har forlatt kampen");
      if (t.norsk) t.sjekk(/Forlot kampen/.test(await a.tekst("#skjerm .gb-sete.borte")), "Ingen «Forlot kampen» hos A");
      t.sjekk(!(await a.finnes('#ark [data-h="nett-forlat"]')) && (await a.js("Rusj.nett.aktiv()")), "Kampen stoppet hos A da C gikk");
      await a.bilde("c-forlot");
      await b.bilde("c-forlot");
      continue;
    }
    const vent = (sist.get(p) || 0) + 600 - Date.now();
    if (vent > 0) await t.sov(vent);
    sist.set(p, Date.now());
    const type = await steg(t, p);
    // The others agree (C until it has left).
    const mal = JSON.stringify(nokkel(await p.spill()));
    for (const q of inne) {
      if (q === p) continue;
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        ok = JSON.stringify(nokkel(await q.spill())) === mal;
        if (!ok) await t.sov(200);
      }
      t.sjekk(ok, `${q.navn} er uenig med ${p.navn} etter steg ${n} (${meg})`);
    }
    if (type === "titt" && !sett) {
      // Only this phone shows its bottom two; the others see four cards face down.
      sett = true;
      await p.vent("Rusj.S.spill.viser != null", 5000);
      t.sjekk((await p.js(`document.querySelectorAll("#skjerm .gb-meg .sk-opp").length`)) === 2, `${p.navn} ser ikke de to nederste kortene sine`);
      await p.bilde("ser-de-to-nederste");
      for (const q of inne) if (q !== p) t.sjekk((await q.js(`document.querySelectorAll("#skjerm .gb-andre .sk-opp, #skjerm .gb-meg .sk-opp").length`)) === 0, `${q.navn} ser kort som skal være skjult`);
    }
    if (type === "trekk" && !handSjekket) {
      handSjekket = true;
      await t.sov(300);
      for (const q of inne) if (q !== p) t.sjekk((await q.finnes("#skjerm .gb-handkort")) && !(await q.finnes("#skjerm .gb-handkort.sk-opp")), `${q.navn} ser kortet ${p.navn} trakk (eller ser ikke at det er trukket)`);
      t.sjekk(await p.finnes("#skjerm .gb-handkort.sk-opp"), `${p.navn} ser ikke kortet sitt`);
      await (inne.find((q) => q !== p)).bilde("andre-trakk");
    }
  }
  t.sjekk(cUte && sett && handSjekket, `Tre-mobilers-delen ble ikke fullført (C ute ${cUte}, titt ${sett}, hånd ${handSjekket})`);
  for (const p of [a, b]) {
    await p.vent(`document.querySelector('#skjerm [data-h="kaaring"]')`, 10000);
    await p.klikk('#skjerm [data-h="kaaring"]');
    await p.ventSkjerm("slutt");
  }
  t.sjekk(JSON.stringify(nokkel(await a.spill())) === JSON.stringify(nokkel(await b.spill())), "A og B er uenige om slutten");
  t.sjekk((await a.js(`document.querySelectorAll("#skjerm .gb-plasser li").length`)) === 2, "C er med i resultatet etter å ha forlatt kampen");
  t.sjekk(await a.finnes('[data-h="nett-ny"]'), "Ingen «Ny kamp» på kåringen");
  await a.bilde("kaaring-to-igjen");
  await b.bilde("kaaring-to-igjen");
  await t.forlat(b);
  await a.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await a.klikk('#ark [data-h="nett-forlat"]');
  await a.ventSkjerm("hjem");
}
