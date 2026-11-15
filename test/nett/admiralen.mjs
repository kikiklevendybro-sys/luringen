// Admiralen on the net: A makes a room (8 × 8), B joins; each places a fleet that never leaves its
// phone (only a commitment goes to the room); A aims at B's ships, B at empty water; every shot is
// answered by the defender's phone; B closes its tab mid-battle and comes back with its fleet; a
// third phone finds the room full; when A has sunk everything, both fleets are shown and checked
// against the commitments and the answers; «Ny kamp»; both leave.
export default async function (t) {
  const a = await t.telefon("A");
  const b = await t.telefon("B", { rolig: true });
  await a.apne();
  await a.js(`localStorage.setItem(${JSON.stringify(t.nokkel("admiralen.v1"))}, JSON.stringify({ antall: 2, oppsett: { modus: "maskin", niva: "middels", brett: 8, ekstra: false }, spill: null, stilling: {} }))`);
  await a.lastSide(a.side, "document.querySelector('#skjerm h1')");
  const lenke = await t.lagRom(a, "Testspiller A");
  await t.bliMed(b, lenke, "Testspiller B");
  await a.ventSkjerm("plasser");
  await b.ventSkjerm("plasser");
  await t.fullt(lenke);
  t.sjekk((await a.spill()).flate[1] === null && (await b.spill()).flate[0] === null, "En mobil kjenner den andres flåte");

  await b.klikk('[data-h="tilfeldig"]');
  await b.bilde("plasserer");
  await b.klikk('[data-h="klar"]');
  await b.ventSkjerm("kamp");
  await b.bilde("venter-pa-motstander");
  await a.klikk('[data-h="klar"]');
  await a.ventSkjerm("kamp");
  await b.vent(`Rusj.S.spill.klar[0] && Rusj.S.spill.klar[1]`, 8000);
  const flateB = (await b.spill()).flate[1];
  t.sjekk((await a.spill()).flate[1] === null && /^[0-9a-f]{64}$/.test((await a.spill()).hash[1]), "A har B sin flåte, eller ingen forpliktelse fra B");
  const n = 8;
  const celler = (s) => Array.from({ length: s.lengde }, (_, k) => (s.y + (s.r === "v" ? k : 0)) * n + s.x + (s.r === "h" ? k : 0));
  const maal = flateB.flatMap(celler);
  const skipB = new Set(maal);
  const vannForB = []; // cells of A's waters that B fires at: well away from A's ships
  const eierA = new Set((await a.spill()).flate[0].flatMap(celler));
  for (let i = 0; i < n * n; i++) if (!eierA.has(i)) vannForB.push(i);

  let tilbake = false;
  let bilder = 0;
  for (let steg = 0; steg < 200; steg++) {
    const sp = await a.spill();
    if (sp.vinner != null) break;
    if (!tilbake && sp.skudd[0].length === 5 && !sp.venter) {
      tilbake = true;
      await t.gjenoppkoble(b, a, (sp) => [sp.skudd, sp.svar, sp.klar, sp.flate, sp.tur, sp.vinner]);
      t.sjekk(JSON.stringify((await b.spill()).flate[1]) === JSON.stringify(flateB), "B fikk ikke tilbake sin egen flåte etter gjenoppkobling");
    }
    const p = (await a.minTur()) ? a : (await b.minTur()) ? b : null;
    if (!p) {
      await t.sov(150);
      continue;
    }
    const egen = await p.spill();
    const liste = p === a ? maal : vannForB;
    const i = liste.find((c) => !egen.skudd[egen.meg].includes(c));
    const antall = egen.svar[egen.meg].length;
    await p.klikk(`.ad-mal-boks [data-h="sikt"][data-v="${i}"]`);
    await p.trekk(`.ad-mal-boks [data-h="sikt"][data-v="${i}"]`, `Rusj.S.spill.skudd[${egen.meg}].includes(${i})`);
    await p.vent(`Rusj.S.spill.svar[${egen.meg}].length > ${antall}`, 10000);
    const svar = (await p.spill()).svar[egen.meg].at(-1);
    t.sjekk((svar.r === 1) === !(p === a ? skipB.has(i) : eierA.has(i)), `Feil svar på skudd ${i}: ${JSON.stringify(svar)}`);
    if (bilder < 3 && p === a) {
      bilder++;
      await a.bilde("skjoet");
      await b.bilde("ble-skutt-pa");
    }
    t.sjekk((await a.spill()).flate[1] === null, "A fikk se B sin flåte midt i slaget");
  }
  t.sjekk(tilbake, "Gjenoppkoblingen ble aldri testet");
  await a.ventSkjerm("slutt", 10000);
  await b.ventSkjerm("slutt", 10000);
  for (const p of [a, b]) {
    try {
      await p.vent(`document.querySelector(".ad-sjekk") && /✓|⚠/.test(document.querySelector(".ad-sjekk").textContent)`, 10000);
    } catch (e) {
      const sp = await p.spill();
      const sb = await b.spill();
      const kit = await b.js("JSON.stringify([Rusj.nett.venter(), Rusj.nett.tilkoblet(), Rusj.S.skjerm])");
      throw new Error(`B: vist ${JSON.stringify(sb.avslort.map(Boolean))} salt ${!!sb.salt} vinner ${sb.vinner} kit ${kit}; ${p.navn}: ingen sjekk av flåtene (vinner ${sp.vinner}, vist ${JSON.stringify(sp.avslort.map(Boolean))}, salt ${!!sp.salt}, mistet ${sp.mistet}, «${await p.tekst(".ad-sjekk")}»)`);
    }
  }
  for (const p of [a, b]) t.sjekk((await p.tekst(".ad-sjekk")).startsWith("✓"), `${p.navn}: flåten ble ikke godkjent: «${await p.tekst(".ad-sjekk")}»`);
  t.sjekk(JSON.stringify((await a.spill()).avslort[1].flate) === JSON.stringify(flateB), "Flåten B viste til slutt, er ikke den B spilte med");
  await a.bilde("kaaring-vinner");
  await b.bilde("kaaring-taper");

  await a.klikk('[data-h="nett-ny"]');
  for (const p of [a, b]) await p.vent(`Rusj.nett.kamp() === 2 && Rusj.S.skjerm === "plasser"`, 10000);
  t.sjekk((await a.spill()).skudd[0].length === 0 && !(await a.spill()).klar[0], "Ny kamp startet ikke på nytt");
  await a.bilde("ny-kamp");
  await t.forlat(b);
  await a.vent(`document.querySelector('#ark [data-h="nett-forlat"]')`, 8000);
  await a.klikk('#ark [data-h="nett-forlat"]');
  await a.ventSkjerm("hjem");
}
