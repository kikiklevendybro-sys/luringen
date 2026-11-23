// Låsesmeden on the net: A has «lett» in its own settings (the room's setup), makes a room; B joins;
// each makes a secret code on its own phone – only a commitment goes to the room; they guess in
// turn, every guess answered by the code owner's phone; B closes its tab mid-match and comes back
// with its code; a third phone finds the room full; A cracks B's code, B gets its last guess of the
// same number and misses; both codes are revealed and checked against the commitments and every
// answer; «Ny kamp» lets B guess first; B leaves, A is told; A's own game is untouched.
import { createRequire } from "node:module";

const M = createRequire(import.meta.url)("../../rusj/spill/lasesmeden/spill.js");

export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  const LAGRET = t.nokkel("lasesmeden.v1");
  await a.apne();
  await a.js(`localStorage.setItem(${JSON.stringify(LAGRET)}, JSON.stringify({ oppsett: { modus: "mobil", niva: 1, starter: 0 }, rekord: {}, spill: null }))`);
  await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
  const lagret = await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`);
  t.sjekk(await a.finnes('[data-h="nett-apne"]'), "Ingen «Spill med en venn på nett» på hjemskjermen");
  const lenke = await t.lagRom(a);
  await t.bliMed(b, lenke, "Testspiller B");
  await a.ventSkjerm("lag");
  await b.ventSkjerm("lag");
  t.sjekk((await a.nettMeg()) === 0 && (await b.nettMeg()) === 1, "Plassene er ikke 0 (vert) og 1 (venn)");
  t.sjekk((await a.spill()).niva === 1, "Rommet fikk ikke vertens nivå (lett)");
  await a.bilde("lag-kode");
  await t.fullt(lenke);

  const legg = async (p, kode) => {
    for (const f of kode) await p.klikk(`.ls-palett [data-h="legg"][data-v="${f}"]`, 60);
  };
  const kodeA = [0, 1, 2, 3];
  const kodeB = [5, 4, 3, 2];
  await legg(b, kodeB);
  await b.bilde("lager-kode");
  await b.klikk('[data-h="laas"]');
  await b.ventSkjerm("spill");
  await b.bilde("venter-pa-koden");
  await legg(a, kodeA);
  await a.klikk('[data-h="laas"]');
  await a.ventSkjerm("spill");
  await b.vent(`Rusj.S.spill.klar[0] && Rusj.S.spill.klar[1]`, 8000);
  const sa = await a.spill();
  const sb = await b.spill();
  t.sjekk(JSON.stringify(sa.egen) === JSON.stringify(kodeA) && JSON.stringify(sb.egen) === JSON.stringify(kodeB), "Kodene ble ikke de som ble lagt");
  t.sjekk(sa.runder[0].kode === null && sa.avslort[1] === null && /^[0-9a-f]{64}$/.test(sa.hash[1]), "A kjenner koden til B, eller har ingen forpliktelse fra B");
  t.sjekk(!(await a.js(`document.body.innerHTML.includes('"egen"')`)), "Koden står i siden");

  const nokkel = (sp) => [sp.klar, sp.hash, sp.runder.map((r) => r.gjett), sp.tur, sp.resultat, sp.egen];
  const dum = [5, 4, 1, 0]; // B's guess, every time: it never cracks A's code
  let tilbake = false;
  let utenTur = false;
  for (let steg = 0; steg < 60; steg++) {
    const sp = await a.spill();
    if (sp.resultat) break;
    if (!tilbake && sp.runder[0].gjett.length === 2 && !sp.venter) {
      tilbake = true;
      await t.gjenoppkoble(b, a, nokkel);
      t.sjekk(JSON.stringify((await b.spill()).egen) === JSON.stringify(kodeB), "B fikk ikke tilbake koden sin etter gjenoppkobling");
      continue;
    }
    const p = (await a.minTur()) ? a : (await b.minTur()) ? b : null;
    if (!p) {
      await t.sov(150);
      continue;
    }
    const annen = p === a ? b : a;
    if (!utenTur) {
      // Out of turn the other phone can build a row, but not send it.
      utenTur = true;
      await legg(annen, dum);
      t.sjekk(await annen.js(`document.querySelector('[data-h="sjekk"]').disabled`), "Sjekk virker utenom tur");
      for (let k = 0; k < dum.length; k++) await annen.klikk('[data-h="slett"]', 40);
    }
    const egen = await p.spill();
    const s = egen.meg;
    const n = egen.runder[s].gjett.length;
    const g = s === 0 ? M.mulige(1, egen.runder[s].gjett)[0] : dum;
    await legg(p, g);
    await p.trekk('[data-h="sjekk"]', `Rusj.S.spill.venter || Rusj.S.spill.runder[${s}].gjett.length > ${n}`);
    await p.vent(`Rusj.S.spill.runder[${s}].gjett.length > ${n}`, 10000);
    const svar = (await p.spill()).runder[s].gjett.at(-1);
    const fasit = M.vurder(s === 0 ? kodeB : kodeA, g);
    t.sjekk(svar.svart === fasit.svart && svar.hvit === fasit.hvit, `Feil svar på ${g}: ${JSON.stringify(svar)}`);
    if (steg === 2) {
      await p.bilde("har-gjettet");
      await annen.bilde("ser-gjettet");
    }
  }
  t.sjekk(tilbake, "Gjenoppkoblingen ble aldri testet");
  await a.ventSkjerm("slutt", 10000);
  await b.ventSkjerm("slutt", 10000);
  const slutt = await a.spill();
  t.sjekk(slutt.resultat && slutt.resultat.vinner === 0, `A knekte først, men vant ikke: ${JSON.stringify(slutt.resultat)}`);
  t.sjekk(slutt.runder[0].gjett.length === slutt.runder[1].gjett.length, "B fikk ikke like mange forsøk som A");
  for (const p of [a, b]) {
    await p.vent(`document.querySelector(".ls-sjekk") && /✓|⚠/.test(document.querySelector(".ls-sjekk").textContent)`, 10000);
    t.sjekk((await p.tekst(".ls-sjekk")).startsWith("✓"), `${p.navn}: koden ble ikke godkjent: «${await p.tekst(".ls-sjekk")}»`);
  }
  t.sjekk(JSON.stringify((await a.spill()).avslort[1].kode) === JSON.stringify(kodeB), "Koden B viste til slutt, er ikke den B spilte med");
  t.sjekk(JSON.stringify(nokkel(await a.spill()).slice(0, 5)) === JSON.stringify(nokkel(await b.spill()).slice(0, 5)), "Mobilene er uenige om kampen");
  await a.bilde("kaaring-vinner");
  await b.bilde("kaaring-taper");

  await b.klikk('[data-h="nett-ny"]');
  for (const p of [a, b]) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "lag"`, 10000);
  t.sjekk((await a.spill()).starter === 1 && (await a.spill()).egen === null, "Kamp 2: B gjetter ikke først, eller koden henger igjen");
  await b.bilde("ny-kamp");
  await t.forlat(b);
  await a.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  if (t.norsk) t.sjekk(/forlot kampen/.test(await a.tekst("#ark h2")), `A fikk ikke beskjed om at B gikk: «${await a.tekst("#ark h2")}»`);
  await a.klikk('#ark [data-h="nett-forlat"]');
  await a.ventSkjerm("hjem");
  const utenTid = (x) => JSON.stringify({ ...JSON.parse(x), _tid: 0 });
  t.sjekk(utenTid(await a.js(`localStorage.getItem(${JSON.stringify(LAGRET)})`)) === utenTid(lagret), "Spillet A hadde lagret, ble endret av nettkampen");
}
