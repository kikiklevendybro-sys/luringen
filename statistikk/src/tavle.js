// The dashboard for a chosen period (?p=7|30|90|365|alt): pure functions, rows in, numbers out.
//
// Long periods are cheap because whole months that are over come from table maned (one row per
// month and counter name, added up each night), and only the days that are not a whole month come
// from table teller. Lager (the store below) holds what was read and picks, month by month, the
// days when it has them all and the month's total otherwise. Every figure is still a plain sum,
// difference or ratio of stored counters.
import { SPILL, DAGLIGE, DAGER_TILBAKE } from "./oppsett.js";
import { ENHET, UTGAVER, TYPER, KILDER, ANDRE_SIDER } from "./nokler.js";
import { flytt, dagene, dagNr, ukeStart, flyttMnd, manedene, manedSlutt } from "./dato.js";
import { periodeAvSummer, medPrefiks } from "./tall.js";

export const PERIODER = [
  { id: "7", navn: "7 dager", dager: 7 },
  { id: "30", navn: "30 dager", dager: 30 },
  { id: "90", navn: "90 dager", dager: 90 },
  { id: "365", navn: "365 dager", dager: 365 },
  { id: "alt", navn: "Alt", dager: null },
];
// How the games table can be sorted (?sort=…); the first is the default.
export const SORTERINGER = ["startet", "ferdig", "prosent", "endring", "navn"];
// Charts per day only up to this many days; the months go back this far.
export const MAKS_DAGER_I_DIAGRAM = 90;
export const MANEDER_I_DIAGRAM = 25;
// A game whose first counter came this many days after counting began is «new».
export const NY_ETTER = 7;
// New games are shown for this many days after their first day (their first four weeks and a bit).
export const NY_I = 56;

// The choices from the address, checked against fixed lists (anything else: the default).
export function lesValg(p, sort) {
  return {
    periode: PERIODER.some((x) => x.id === p) ? p : PERIODER[0].id,
    sort: SORTERINGER.includes(sort) ? sort : SORTERINGER[0],
  };
}

// The chosen period and the one just before it, of equal length. Periods end yesterday (whole
// days only). «alt» starts on the first day with counters and has nothing to compare with.
export function periodeFor(id, iDag, forste) {
  const p = PERIODER.find((x) => x.id === id) || PERIODER[0];
  const til = flytt(iDag, -1);
  if (!p.dager) {
    const fra = forste && forste <= til ? forste : til;
    return { id: p.id, navn: p.navn, fra, til, antallDager: dagNr(til) - dagNr(fra) + 1, dager: null, forrige: null };
  }
  const fra = flytt(til, -(p.dager - 1));
  return { id: p.id, navn: p.navn, fra, til, antallDager: p.dager, dager: p.dager, forrige: { fra: flytt(fra, -p.dager), til: flytt(fra, -1) } };
}

// The first day of the daily rows that are always read: enough for the week and month cards, the
// 8-week sparklines and new games, and every day of a period of up to 90 days (its day chart).
export function vinduStart(periode, iDag) {
  const dager = periode.dager && periode.dager <= MAKS_DAGER_I_DIAGRAM ? periode.dager : 0;
  return flytt(iDag, -Math.max(DAGER_TILBAKE, dager));
}

// Sorted, overlapping or touching day ranges joined: [[fra, til], …].
export function slaSammen(omrader) {
  const ut = [];
  for (const [a, b] of omrader.filter(([a, b]) => a <= b).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) {
    const siste = ut[ut.length - 1];
    if (siste && a <= flytt(siste[1], 1)) {
      if (b > siste[1]) siste[1] = b;
    } else ut.push([a, b]);
  }
  return ut;
}

// What to read for the day ranges in `omrader` that lie before the window start W: whole months
// that are over from table maned, the rest (the odd days at either end) from table teller.
// A month counts as whole from the first day with counters on (nothing exists before it).
export function planlegg(omrader, W, forste, iDag) {
  const dager = [];
  const maneder = new Set();
  const denne = iDag.slice(0, 7);
  for (const { fra, til: t } of omrader) {
    const til = t < W ? t : flytt(W, -1);
    if (fra > til) continue;
    for (const M of manedene(fra.slice(0, 7), til.slice(0, 7))) {
      const start = M + "-01";
      const slutt = manedSlutt(M);
      const a = fra > start ? fra : start;
      const b = til < slutt ? til : slutt;
      const hel = (a === start || (forste && forste >= a)) && b === slutt;
      if (hel && M < denne) maneder.add(M);
      else dager.push([a, b]);
    }
  }
  return { dager: slaSammen(dager), maneder: [...maneder].sort() };
}

// ---------- The store: what was read, and sums over any range ----------

// dagRader: [{ dag, nokkel, n }] for the ranges in dagOmrader (all of them read in full).
// mndRader: [{ maned, nokkel, n }]; mndHele: the months that were read with every counter name
// (the other months only have the names the charts need).
export function lagLager({ dagRader = [], dagOmrader = [], mndRader = [], mndHele = [], forste = null }) {
  const dager = new Map();
  for (const r of dagRader) {
    let m = dager.get(r.dag);
    if (!m) dager.set(r.dag, (m = new Map()));
    m.set(r.nokkel, (m.get(r.nokkel) || 0) + Number(r.n));
  }
  const mnd = new Map();
  for (const r of mndRader) {
    let m = mnd.get(r.maned);
    if (!m) mnd.set(r.maned, (m = new Map()));
    m.set(r.nokkel, Number(r.n));
  }
  const hele = new Set(mndHele);
  const omr = slaSammen(dagOmrader.map((o) => [...o]));
  const dekket = (a, b) => omr.some(([x, y]) => x <= a && b <= y);
  const leggTil = (ut, kart) => {
    if (kart) for (const [k, n] of kart) ut.set(k, (ut.get(k) || 0) + n);
  };
  const minne = new Map();

  // Every counter added up from `fra` to `til`. utvalg: months read with only some names may be
  // used (for the charts, which ask for just those names).
  function summer(fra, til, { utvalg = false } = {}) {
    const nokkel = `${fra}|${til}|${utvalg}`;
    if (minne.has(nokkel)) return minne.get(nokkel);
    const ut = new Map();
    if (fra <= til) {
      for (const M of manedene(fra.slice(0, 7), til.slice(0, 7))) {
        const start = M + "-01";
        const slutt = manedSlutt(M);
        const a = fra > start ? fra : start;
        const b = til < slutt ? til : slutt;
        const hel = (a === start || (forste && forste >= a)) && b === slutt;
        if (!dekket(a, b) && hel && mnd.has(M) && (utvalg || hele.has(M))) leggTil(ut, mnd.get(M));
        else for (const d of dagene(a, b)) leggTil(ut, dager.get(d));
      }
    }
    minne.set(nokkel, ut);
    return ut;
  }
  // One counter added up from `fra` to `til` (cheaper than every counter, for the charts).
  function sum(fra, til, navn, { utvalg = false } = {}) {
    if (minne.has(`${fra}|${til}|${utvalg}`)) return minne.get(`${fra}|${til}|${utvalg}`).get(navn) || 0;
    let ut = 0;
    if (fra <= til) {
      for (const M of manedene(fra.slice(0, 7), til.slice(0, 7))) {
        const start = M + "-01";
        const slutt = manedSlutt(M);
        const a = fra > start ? fra : start;
        const b = til < slutt ? til : slutt;
        const hel = (a === start || (forste && forste >= a)) && b === slutt;
        if (!dekket(a, b) && hel && mnd.has(M) && (utvalg || hele.has(M))) ut += mnd.get(M).get(navn) || 0;
        else for (const d of dagene(a, b)) ut += (dager.has(d) && dager.get(d).get(navn)) || 0;
      }
    }
    return ut;
  }
  // The first day each game had a counter, among the days that were read: Map(id → day).
  let forsteDager = null;
  function forstePerSpill() {
    if (forsteDager) return forsteDager;
    forsteDager = new Map();
    const sett = new Set();
    for (const d of [...dager.keys()].sort()) {
      for (const k of dager.get(d).keys()) {
        if (sett.has(k)) continue;
        sett.add(k);
        const m = /^(?:side|start|ferdig|daglig|feil)\.([a-z0-9]{2,24})$/.exec(k);
        if (m && !ANDRE_SIDER.includes(m[1]) && !forsteDager.has(m[1])) forsteDager.set(m[1], d);
      }
    }
    return forsteDager;
  }
  return {
    summer,
    sum,
    forstePerSpill,
    dag: (d) => dager.get(d) || new Map(),
    dager: () => [...dager.keys()].sort(),
    dekket,
    harMnd: (M) => mnd.has(M),
    maneder: () => [...mnd.keys()].sort(),
    forste,
  };
}

// ---------- Small helpers ----------

const tal = (S, k) => (S && S.get(k)) || 0;
const sumPrefiks = (S, prefiks) => [...medPrefiks(S, prefiks).values()].reduce((a, b) => a + b, 0);
const enheterI = (S) => ENHET.reduce((s, e) => s + tal(S, "enhet." + e), 0);
export const andel = (teller, nevner) => (nevner > 0 ? Math.min(100, Math.round((100 * teller) / nevner)) : null);

// The change from the period before: { prosent } (rounded), { ny: true } when it was 0 before,
// or null when there is nothing to compare with.
export function endring(naa, for_) {
  if (for_ === null || for_ === undefined) return null;
  if (for_ === 0) return naa > 0 ? { ny: true, prosent: null } : { ny: false, prosent: 0 };
  return { ny: false, prosent: Math.round(((naa - for_) / for_) * 100) };
}

// Different phones in the period, from «first time this week / month» (unik.*): over 7 days the
// weekly counter, over 30 days the monthly one, and for longer periods the monthly counter as an
// average per month. Rolling periods cross calendar weeks and months, so these are estimates.
export function unike(S, periode) {
  if (periode.dager === 7) return tal(S, "unik.uke");
  if (periode.dager === 30) return tal(S, "unik.mnd");
  return Math.round(tal(S, "unik.mnd") / Math.max(1, periode.antallDager / 30.44));
}

// The 8 weeks (7 days each) that end yesterday, oldest first: [{ fra, til }].
export function sparkUker(iDag, antall = 8) {
  const til = flytt(iDag, -1);
  return Array.from({ length: antall }, (_, i) => ({ fra: flytt(til, -7 * (antall - i) + 1), til: flytt(til, -7 * (antall - 1 - i)) }));
}

// The first day each game had a counter, among the days that were read: Map(id → day).
export const forsteDagPerSpill = (lager) => lager.forstePerSpill();

// Games that may be new: their first counter is more than NY_ETTER days after counting began,
// inside the window that was read (not on its first day: it may have had counters before), and no
// more than NY_I days ago. Whether a game had counters in older months is checked in table maned.
export function nyeKandidater(lager, { iDag, W, forste }) {
  if (!forste) return [];
  const grense = flytt(forste, NY_ETTER);
  const ut = [];
  for (const [id, dag] of forsteDagPerSpill(lager)) if (dag > grense && dag > W && dag >= flytt(iDag, -NY_I)) ut.push({ id, forsteDag: dag });
  return ut.sort((a, b) => (a.forsteDag < b.forsteDag ? 1 : a.forsteDag > b.forsteDag ? -1 : a.id < b.id ? -1 : 1));
}

// ---------- The dashboard ----------

const GRUPPER = {
  utgave: UTGAVER.map((id) => ({ id, navn: { nb: "Norsk", en: "Engelsk", da: "Dansk" }[id] })),
  type: TYPER.map((id) => ({ id, navn: { mobil: "Mobil", nettbrett: "Nettbrett", pc: "PC" }[id] })),
  kilde: KILDER.map((id) => ({ id, navn: { sok: "Søkemotor", sosial: "Sosiale medier", direkte: "Direkte (ingen lenke)", annen: "Andre nettsider" }[id] })),
};

function gruppe(S, F, type) {
  const rader = GRUPPER[type].map((g) => ({ ...g, antall: tal(S, `${type}.${g.id}`), forrige: F ? tal(F, `${type}.${g.id}`) : null }));
  const total = rader.reduce((s, r) => s + r.antall, 0);
  for (const r of rader) {
    r.andel = andel(r.antall, total);
    r.endring = endring(r.antall, r.forrige);
  }
  return { total, rader };
}

function sorter(rader, sort) {
  const navn = (a, b) => a.navn.localeCompare(b.navn, "nb");
  const storst = (f) => (a, b) => (b[f] ?? -1) - (a[f] ?? -1) || b.startet - a.startet || navn(a, b);
  const sammenlign = {
    startet: (a, b) => b.startet - a.startet || b.apnet - a.apnet || navn(a, b),
    ferdig: storst("ferdig"),
    prosent: storst("prosent"),
    endring: (a, b) => (b.forrige === null ? -Infinity : b.startet - b.forrige) - (a.forrige === null ? -Infinity : a.startet - a.forrige) || navn(a, b),
    navn,
  }[sort];
  return rader.slice().sort(sammenlign);
}

// lager: the store. periode: from periodeFor. W: the window start. gamle: game ids that turned
// out to have counters in older months (not new after all). helse: from the health check.
export function byggTavle(lager, { iDag, periode, sort = "startet", W, gamle = new Set(), oppsett = { SPILL, DAGLIGE } }) {
  const p = periode;
  const forste = lager.forste;
  const S = lager.summer(p.fra, p.til);
  // A comparison only when the whole period before was counted.
  const kanSammenligne = !!(p.forrige && forste && p.forrige.fra >= forste);
  const F = kanSammenligne ? lager.summer(p.forrige.fra, p.forrige.til) : null;
  const navnPa = (id) => oppsett.SPILL[id] || id;
  const naaFor = (verdi) => (kanSammenligne ? verdi : null);

  // The usual sections (returning, time, dailies, installed) for the chosen period.
  const enheterDag = (d) => ENHET.reduce((s, e) => s + lager.sum(d, d, "enhet." + e), 0);
  const dagenFor = enheterDag(flytt(p.fra, -1)) + enheterI(S) - enheterDag(p.til);
  const dagSerie =
    p.antallDager <= MAKS_DAGER_I_DIAGRAM
      ? dagene(p.fra, p.til).map((d) => {
          const m = lager.dag(d);
          return { dag: d, enheter: enheterI(m), besok: tal(m, "besok") };
        })
      : [];
  const vanlig = periodeAvSummer({ id: p.id, navn: p.navn, fra: p.fra, til: p.til, antallDager: p.antallDager, S, dagenFor, serie: dagSerie, oppsett });

  // Key figures.
  const figurer = (kart) => ({
    besok: tal(kart, "besok"),
    unike: unike(kart, p),
    nye: tal(kart, "enhet.ny"),
    startet: sumPrefiks(kart, "start."),
    ferdig: sumPrefiks(kart, "ferdig."),
    installert: tal(kart, "app.ny"),
  });
  const na = figurer(S);
  const for_ = F ? figurer(F) : null;
  const langt = !(p.dager === 7 || p.dager === 30);
  const nokkeltall = [
    { id: "besok", navn: "Besøk", under: "økter på rusj" },
    { id: "unike", navn: "Ulike enheter", under: langt ? "snitt per måned, anslag" : `i perioden, anslag` },
    { id: "nye", navn: "Nye enheter", under: "første gang på rusj" },
    { id: "startet", navn: "Spill startet", under: "alle spill" },
    { id: "ferdig", navn: "Spill fullført", under: "spilt ferdig" },
    { id: "installert", navn: "Nye installasjoner", under: "første gang fra hjemskjermen" },
  ].map((k) => ({ ...k, verdi: na[k.id], forrige: for_ ? for_[k.id] : null, endring: for_ ? endring(na[k.id], for_[k.id]) : null }));

  // Charts: per week (calendar weeks in the window, this one so far) and per month (back to the
  // first month with counters, at most 25), each with different phones and visits.
  const uker = [];
  for (let man = ukeStart(W) < W ? flytt(ukeStart(W), 7) : ukeStart(W); man <= iDag; man = flytt(man, 7)) {
    const son = flytt(man, 6);
    const til = son < iDag ? son : iDag;
    uker.push({ dag: man, unike: lager.sum(man, til, "unik.uke"), besok: lager.sum(man, til, "besok"), delvis: son >= iDag });
  }
  const denne = iDag.slice(0, 7);
  const forsteMnd = forste ? forste.slice(0, 7) : denne;
  const fraMnd = flyttMnd(denne, -(MANEDER_I_DIAGRAM - 1)) > forsteMnd ? flyttMnd(denne, -(MANEDER_I_DIAGRAM - 1)) : forsteMnd;
  const maneder = manedene(fraMnd, denne).map((M) => {
    const slutt = manedSlutt(M);
    const til = slutt < iDag ? slutt : iDag;
    const unikeM = lager.sum(M + "-01", til, "unik.mnd", { utvalg: true });
    const besokM = lager.sum(M + "-01", til, "besok", { utvalg: true });
    // A month that is over but has neither its total nor all its days here (the nightly job has
    // not added it up yet): shown as missing rather than as a low number.
    const fraDag = forste && forste > M + "-01" ? forste : M + "-01";
    const mangler = M !== denne && !lager.harMnd(M) && !lager.dekket(fraDag, til);
    return { dag: M + "-01", unike: unikeM, besok: besokM, delvis: M === denne, mangler };
  });

  // The games: starts, finishes, share finished, change, and the last 8 weeks of starts.
  const uke8 = sparkUker(iDag).map((u) => lager.summer(u.fra, u.til));
  const startet = medPrefiks(S, "start.");
  const ferdig = medPrefiks(S, "ferdig.");
  const apnet = medPrefiks(S, "side.");
  const startetFor = F ? medPrefiks(F, "start.") : null;
  const ider = new Set([...startet.keys(), ...ferdig.keys(), ...[...apnet.keys()].filter((id) => !ANDRE_SIDER.includes(id)), ...(startetFor ? [...startetFor.keys()] : [])]);
  const spillRader = [...ider].map((id) => {
    const s = startet.get(id) || 0;
    const f = ferdig.get(id) || 0;
    const forrige = startetFor ? startetFor.get(id) || 0 : null;
    return { id, navn: navnPa(id), startet: s, ferdig: f, apnet: apnet.get(id) || 0, prosent: andel(f, s), forrige, endring: endring(s, forrige), spark: uke8.map((U) => tal(U, "start." + id)) };
  });
  const spill = sorter(spillRader, SORTERINGER.includes(sort) ? sort : "startet");

  // Rising and falling: the biggest changes in starts (at least 3 starts in one of the periods).
  const flytting = kanSammenligne ? spillRader.filter((r) => Math.max(r.startet, r.forrige) >= 3).map((r) => ({ ...r, forskjell: r.startet - r.forrige })) : [];
  const stiger = flytting.filter((r) => r.forskjell > 0).sort((a, b) => b.forskjell - a.forskjell || a.navn.localeCompare(b.navn, "nb")).slice(0, 5);
  const faller = flytting.filter((r) => r.forskjell < 0).sort((a, b) => a.forskjell - b.forskjell || a.navn.localeCompare(b.navn, "nb")).slice(0, 5);

  // New games: their first four weeks, a week (7 days from the first day) at a time.
  const nyeSpill = nyeKandidater(lager, { iDag, W, forste })
    .filter((k) => !gamle.has(k.id))
    .map(({ id, forsteDag }) => {
      const ukene = [0, 1, 2, 3].map((i) => {
        const fra = flytt(forsteDag, 7 * i);
        const til = flytt(fra, 6);
        if (fra > iDag) return { nr: i + 1, fra, til, framtid: true, startet: 0, ferdig: 0, apnet: 0 };
        const t = til < iDag ? til : iDag;
        return { nr: i + 1, fra, til, framtid: false, delvis: til >= iDag, startet: lager.sum(fra, t, "start." + id), ferdig: lager.sum(fra, t, "ferdig." + id), apnet: lager.sum(fra, t, "side." + id) };
      });
      const sum = (f) => ukene.reduce((s, u) => s + u[f], 0);
      return { id, navn: navnPa(id), forsteDag, uker: ukene, startet: sum("startet"), ferdig: sum("ferdig"), apnet: sum("apnet") };
    });

  // From a visit to a game started to a game finished.
  const trakt = { besok: na.besok, startet: na.startet, ferdig: na.ferdig, perBesok: na.besok > 0 ? Math.round((na.startet / na.besok) * 10) / 10 : null, ferdigAndel: andel(na.ferdig, na.startet) };

  // The Christmas calendar and playing on the net.
  const julTall = (kart) => ({
    apnet: tal(kart, "side.julekalenderen"),
    luker: tal(kart, "start.julekalenderen"),
    ferdig: tal(kart, "ferdig.julekalenderen"),
    utskrift: tal(kart, "jul.utskrift"),
    paminnelse: tal(kart, "jul.paminnelse"),
    tre: tal(kart, "jul.tre"),
  });
  const julNa = julTall(S);
  const julFor = F ? julTall(F) : null;
  const jul = Object.fromEntries(Object.entries(julNa).map(([k, v]) => [k, { antall: v, endring: julFor ? endring(v, julFor[k]) : null }]));
  const rom = medPrefiks(S, "nett.rom.");
  const romStart = medPrefiks(S, "nett.start.");
  const romFerdig = medPrefiks(S, "nett.ferdig.");
  const nettRader = [...new Set([...rom.keys(), ...romStart.keys(), ...romFerdig.keys()])]
    .map((id) => ({ id, navn: navnPa(id), rom: rom.get(id) || 0, startet: romStart.get(id) || 0, ferdig: romFerdig.get(id) || 0 }))
    .sort((a, b) => b.rom - a.rom || b.startet - a.startet || a.navn.localeCompare(b.navn, "nb"));
  const nett = { rader: nettRader, rom: sumPrefiks(S, "nett.rom."), startet: sumPrefiks(S, "nett.start."), ferdig: sumPrefiks(S, "nett.ferdig.") };

  // Errors per game, also per 100 times the game's page was opened.
  const feilNa = medPrefiks(S, "feil.");
  const feilFor = F ? medPrefiks(F, "feil.") : null;
  const feil = [...feilNa.keys()]
    .map((id) => ({ id, navn: navnPa(id), antall: feilNa.get(id), apnet: apnet.get(id) || 0, per100: apnet.get(id) ? Math.round((1000 * feilNa.get(id)) / apnet.get(id)) / 10 : null, endring: feilFor ? endring(feilNa.get(id), feilFor.get(id) || 0) : null }))
    .sort((a, b) => b.antall - a.antall || a.navn.localeCompare(b.navn, "nb"));

  return {
    periode: { id: p.id, navn: p.navn, fra: p.fra, til: p.til, antallDager: p.antallDager, forrige: p.forrige, kanSammenligne },
    sort: SORTERINGER.includes(sort) ? sort : "startet",
    nokkeltall,
    diagram: { dag: dagSerie, uke: uker, maned: maneder },
    vanlig,
    spill,
    stiger,
    faller,
    nyeSpill,
    trakt,
    utgaver: gruppe(S, F, "utgave"),
    typer: gruppe(S, F, "type"),
    kilder: gruppe(S, F, "kilde"),
    jul,
    nett,
    feil,
    feilTotalt: [...feilNa.values()].reduce((a, b) => a + b, 0),
  };
}
