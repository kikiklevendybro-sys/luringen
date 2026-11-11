// From counters to the numbers on the dashboard. Pure functions: rows in, numbers out.
// Every figure the owner sees is a sum, a difference or a ratio of the stored counters —
// nothing is estimated from anything else, and where a figure is an estimate the text says so.
import { SPILL, DAGLIGE } from "./oppsett.js";
import { ENHET, TID_MINUTTER, REKKE_FRA, ANDRE_SIDER, DAGENS } from "./nokler.js";
import { flytt, dagene, ukeStart, maanedStart, maanedNavn } from "./dato.js";

const prosent = (teller, nevner) => (nevner > 0 ? Math.min(100, Math.round((100 * teller) / nevner)) : null);

export const TIDSGRUPPER = [
  { id: "u1", navn: "Under 1 minutt", fra: 0, til: 1 },
  { id: "m1", navn: "1–3 minutter", fra: 1, til: 3 },
  { id: "m3", navn: "3–10 minutter", fra: 3, til: 10 },
  { id: "m10", navn: "10–30 minutter", fra: 10, til: 30 },
  { id: "m30", navn: "Over 30 minutter", fra: 30, til: null },
];

export const REKKEGRUPPER = ["1 dag", "2–3 dager", "4–6 dager", "7–13 dager", "14–29 dager", "30 dager eller mer"];

// The phones report «this visit has now passed 1, 3, 10, 30 minutes». A visit that passed 3
// minutes also passed 1, so the groups are the differences between neighbouring counters.
// (A lost message can make a difference negative; it is then counted as 0.)
export function tidsfordeling(besok, passert) {
  const [p1, p3, p10, p30] = passert;
  const antall = [besok - p1, p1 - p3, p3 - p10, p10 - p30, p30].map((n) => Math.max(0, n));
  const totalt = antall.reduce((a, b) => a + b, 0);
  return {
    totalt,
    grupper: TIDSGRUPPER.map((g, i) => ({ id: g.id, navn: g.navn, antall: antall[i], prosent: prosent(antall[i], totalt) })),
    median: medianFraGrupper(antall),
  };
}

// The middle visit, estimated from the groups: find the group that holds the middle visit and
// assume the visits in it are spread evenly. Returns { minutter } or { over: 30 }, or null.
export function medianFraGrupper(antall) {
  const totalt = antall.reduce((a, b) => a + b, 0);
  if (totalt === 0) return null;
  const midt = totalt / 2;
  let foran = 0;
  for (let i = 0; i < antall.length; i++) {
    if (antall[i] > 0 && foran + antall[i] >= midt) {
      const g = TIDSGRUPPER[i];
      if (g.til === null) return { over: g.fra };
      return { minutter: Math.round((g.fra + ((midt - foran) / antall[i]) * (g.til - g.fra)) * 10) / 10 };
    }
    foran += antall[i];
  }
  return null;
}

// rader: [{ dag, nokkel, n }]. iDag: today's Oslo date. forsteDag: the oldest day with counters.
export function sammendrag(rader, iDag, { forsteDag = null, oppsett = { SPILL, DAGLIGE } } = {}) {
  const perDag = new Map();
  for (const r of rader) {
    if (!perDag.has(r.dag)) perDag.set(r.dag, new Map());
    perDag.get(r.dag).set(r.nokkel, (perDag.get(r.dag).get(r.nokkel) || 0) + Number(r.n));
  }
  const tell = (dag, nokkel) => (perDag.get(dag) && perDag.get(dag).get(nokkel)) || 0;
  const sum = (dager, nokkel) => dager.reduce((s, d) => s + tell(d, nokkel), 0);
  const enheter = (dag) => ENHET.reduce((s, n) => s + tell(dag, "enhet." + n), 0);
  // Sum of every counter that starts with a prefix, per id after the prefix.
  const medPrefiks = (dager, prefiks) => {
    const ut = new Map();
    for (const d of dager)
      for (const [nokkel, n] of perDag.get(d) || []) if (nokkel.startsWith(prefiks)) ut.set(nokkel.slice(prefiks.length), (ut.get(nokkel.slice(prefiks.length)) || 0) + n);
    return ut;
  };

  const periode = (id, navn, fra, til) => {
    const dager = dagene(fra, til);
    const enh = dager.reduce((s, d) => s + enheter(d), 0);
    const besok = sum(dager, "besok");
    const sider = medPrefiks(dager, "side.");
    const startet = medPrefiks(dager, "start.");
    const ferdig = medPrefiks(dager, "ferdig.");
    const fullfort = medPrefiks(dager, "daglig.");

    const kat = Object.fromEntries(ENHET.map((n) => [n, sum(dager, "enhet." + n)]));
    const dagenFor = dager.reduce((s, d) => s + enheter(flytt(d, -1)), 0);

    const spillIder = new Set([...startet.keys(), ...ferdig.keys(), ...[...sider.keys()].filter((s) => !ANDRE_SIDER.includes(s))]);
    const spill = [...spillIder]
      .map((sid) => ({ id: sid, navn: oppsett.SPILL[sid] || sid, startet: startet.get(sid) || 0, ferdig: ferdig.get(sid) || 0, apnet: sider.get(sid) || 0 }))
      .sort((a, b) => b.startet - a.startet || b.apnet - a.apnet || a.navn.localeCompare(b.navn, "nb"));

    // The dailies in the config first (front-page order), then any other game with finished
    // dailies in the period — so a daily that is newer than this list still shows.
    const daglige = [...oppsett.DAGLIGE, ...[...fullfort.keys()].filter((sid) => !oppsett.DAGLIGE.includes(sid)).sort()];
    const antallDaglige = oppsett.DAGLIGE.length;
    const trinn = DAGENS.filter((n) => n <= antallDaglige || sum(dager, "dagens." + n) > 0);
    return {
      id,
      navn,
      fra,
      til,
      antallDager: dager.length,
      enheter: enh,
      enheterPerDag: Math.round(enh / dager.length),
      besok,
      sider: [...sider.values()].reduce((a, b) => a + b, 0),
      forside: sider.get("forside") || 0,
      nye: kat.ny,
      tilbake: {
        ...kat,
        // Of the phones that were here the day before, how many came back the next day.
        nesteDag: { teller: kat.igar, nevner: dagenFor, prosent: prosent(kat.igar, dagenFor) },
        // Of the phones that were here, how many had also been here during the week before.
        innenUke: { teller: kat.igar + kat.uke, nevner: enh, prosent: prosent(kat.igar + kat.uke, enh) },
      },
      spill,
      tid: tidsfordeling(besok, TID_MINUTTER.map((m) => sum(dager, "tid." + m))),
      daglig: {
        antallDaglige,
        spill: daglige.map((sid) => ({ id: sid, navn: oppsett.SPILL[sid] || sid, fullfort: fullfort.get(sid) || 0 })),
        minst: trinn.map((n) => ({ n, antall: sum(dager, "dagens." + n) })),
        minstEn: sum(dager, "dagens.1"),
        alle: antallDaglige ? sum(dager, "dagens." + antallDaglige) : 0,
        rekker: REKKE_FRA.map((fraDag, i) => ({ fra: fraDag, navn: REKKEGRUPPER[i], antall: sum(dager, "rekke." + fraDag) })),
      },
      app: { antall: sum(dager, "app"), av: enh, prosent: prosent(sum(dager, "app"), enh) },
      serie: dager.map((d) => ({ dag: d, enheter: enheter(d), besok: tell(d, "besok") })),
    };
  };

  const iGar = flytt(iDag, -1);
  const perioder = [
    periode("idag", "I dag", iDag, iDag),
    periode("igar", "I går", iGar, iGar),
    periode("d7", "Siste 7 dager", flytt(iDag, -7), iGar),
    periode("d30", "Siste 30 dager", flytt(iDag, -30), iGar),
  ];

  // Phones that were here at least once in a calendar week or month: each phone says «first
  // time this week» / «first time this month» once, so these can be added up across days.
  const denneUka = ukeStart(iDag);
  const denneMnd = maanedStart(iDag);
  const forrigeMnd = maanedStart(flytt(denneMnd, -1));
  const kalender = [
    { id: "uka", navn: "Denne uka (hittil)", fra: denneUka, til: iDag, enheter: sum(dagene(denneUka, iDag), "unik.uke") },
    { id: "forrigeUke", navn: "Forrige uke", fra: flytt(denneUka, -7), til: flytt(denneUka, -1), enheter: sum(dagene(flytt(denneUka, -7), flytt(denneUka, -1)), "unik.uke") },
    { id: "maaneden", navn: `${stor(maanedNavn(iDag))} (hittil)`, fra: denneMnd, til: iDag, enheter: sum(dagene(denneMnd, iDag), "unik.mnd") },
    { id: "forrigeMaaned", navn: stor(maanedNavn(forrigeMnd)), fra: forrigeMnd, til: flytt(denneMnd, -1), enheter: sum(dagene(forrigeMnd, flytt(denneMnd, -1)), "unik.mnd") },
  ];

  const harTall = rader.length > 0;
  const [idag, igar] = perioder;
  return {
    iDag,
    forsteDag,
    harTall,
    setning: setning(harTall, igar),
    hittil: !harTall ? "" : idag.enheter > 0 ? `Hittil i dag: ${tall(idag.enheter)} innom.` : idag.sider > 0 ? `Hittil i dag: ${tall(idag.sider)} sider åpnet.` : "Ingen er talt i dag ennå.",
    kalender,
    perioder,
  };
}

const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The plain sentence at the top of the dashboard. Always about yesterday: the last whole day.
function setning(harTall, igar) {
  if (!harTall) return "Ingen tall ennå. De kommer når tellingen er slått på på rusj.no.";
  if (igar.enheter > 0) {
    const tilbake = igar.tilbake.igar;
    return tilbake > 0 ? `I går var ${tall(igar.enheter)} innom, ${tall(tilbake)} av dem var også her dagen før.` : `I går var ${tall(igar.enheter)} innom. Ingen av dem var her dagen før.`;
  }
  if (igar.sider > 0) return `I går ble ${tall(igar.sider)} sider åpnet. Hvor mange som var innom, ble ikke talt.`;
  return "I går ble ingen talt.";
}

// 12345 → "12 345" (Norwegian: a non-breaking space between thousands).
export function tall(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}
