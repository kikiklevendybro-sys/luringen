// Makes Globetrotteren's map data from Natural Earth (public domain, naturalearthdata.com):
// 1:50m Admin 0 – Countries as GeoJSON (ne_50m_admin_0_countries.geojson).
//
//   node rusj/spill/globetrotteren/kilde/lag-kart.mjs <ne_50m_admin_0_countries.geojson>
//
// For each country in LAND: the polygons of its mainland and the islands that belong with it
// (far-off territories are left out), Mercator-projected around the country, scaled so the longest
// side is 200, simplified (Douglas–Peucker) and written as a small SVG path with whole numbers. Also
// its label point (latitude/longitude, for distance and direction), its area in 1000 km² and its
// continent. The result replaces the block between «KART-START» and «KART-SLUTT» in spill.js.
// The source file is not kept in the repository.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HER = dirname(fileURLToPath(import.meta.url));
const SPILL = join(HER, "..", "spill.js");
const kilde = process.argv[2];
if (!kilde) throw new Error("Bruk: node lag-kart.mjs <ne_50m_admin_0_countries.geojson>");

// The 193 UN members, plus Vatican City, Palestine, Kosovo and Taiwan. Natural Earth codes
// (ADM0_A3); Somaliland and Northern Cyprus are joined to Somalia and Cyprus.
const LAND = `AFG ALB DZA AND AGO ATG ARG ARM AUS AUT AZE BHS BHR BGD BRB BLR BEL BLZ BEN BTN BOL BIH BWA BRA BRN BGR
BFA BDI CPV KHM CMR CAN CAF TCD CHL CHN COL COM COG COD CRI CIV HRV CUB CYP CZE DNK DJI DMA DOM ECU EGY SLV GNQ ERI EST
SWZ ETH FJI FIN FRA GAB GMB GEO DEU GHA GRC GRD GTM GIN GNB GUY HTI HND HUN ISL IND IDN IRN IRQ IRL ISR ITA JAM JPN JOR
KAZ KEN KIR PRK KOR KWT KGZ LAO LVA LBN LSO LBR LBY LIE LTU LUX MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX FSM MDA MCO MNG
MNE MAR MOZ MMR NAM NRU NPL NLD NZL NIC NER NGA MKD NOR OMN PAK PLW PAN PNG PRY PER PHL POL PRT QAT ROU RUS RWA KNA LCA
VCT WSM SMR STP SAU SEN SRB SYC SLE SGP SVK SVN SLB SOM ZAF SDS ESP LKA SDN SUR SWE CHE SYR TJK TZA THA TLS TGO TON TTO
TUN TUR TKM TUV UGA UKR ARE GBR USA URY UZB VUT VEN VNM YEM ZMB ZWE VAT PSX KOS TWN`
  .split(/\s+/)
  .filter(Boolean);
const SLA_SAMMEN = { SOL: "SOM", CYN: "CYP" };
// The id we use (ISO 3166 alpha-3 where Natural Earth differs).
const ID = { SDS: "SSD", PSX: "PSE", KOS: "XKX" };
// Parts left out on purpose: [country, test on a polygon's centre (lon, lat)].
const UTE = {
  USA: ([x]) => x < -130 || x > 0, // Alaska and Hawaii (the familiar outline is the 48 states)
  NOR: ([, y]) => y > 74, // Svalbard and Jan Mayen
  FRA: ([x, y]) => x < -10 || y < 35, // overseas departments
  NLD: ([, y]) => y < 40, // the Caribbean islands
  ESP: ([, y]) => y < 34, // the Canary Islands
  PRT: ([x]) => x < -12, // the Azores and Madeira
  ECU: ([x]) => x < -85, // Galápagos
  CHL: ([x]) => x < -80, // Easter Island and Juan Fernández
  NZL: ([x, y]) => x > 179 || x < 0 || y > -30, // the Chathams and the far islands
  COL: ([x]) => x < -80, // San Andrés
  YEM: ([x]) => x > 52.5, // Socotra
  ZAF: ([, y]) => y < -40, // Prince Edward Islands
};
// Countries whose far parts belong in the familiar outline: a wider reach for the islands.
const NAER = { MYS: 0.7, DNK: 0.4 };
const VERDENSDEL = { Africa: "af", Asia: "as", Europe: "eu", "North America": "na", "South America": "sa", Oceania: "oc" };
const HAV = { MUS: "af", SYC: "af", MDV: "as" }; // «Seven seas» in Natural Earth

const geo = JSON.parse(readFileSync(kilde, "utf8"));
const etter = new Map();
for (const f of geo.features) {
  let a3 = f.properties.ADM0_A3;
  if (SLA_SAMMEN[a3]) a3 = SLA_SAMMEN[a3];
  if (!LAND.includes(a3)) continue;
  if (!etter.has(a3)) etter.set(a3, []);
  etter.get(a3).push(f);
}
const mangler = LAND.filter((a3) => !etter.has(a3));
if (mangler.length) throw new Error("Mangler i Natural Earth: " + mangler.join(" "));

const RAD = Math.PI / 180;
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * RAD) / 2)) / RAD;
const ringAreal = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(s / 2);
};
// Area on the sphere (km²) of a lon/lat ring, small-polygon approximation.
const kmAreal = (r) => {
  const lat0 = r.reduce((s, p) => s + p[1], 0) / r.length;
  const k = 111.32;
  return ringAreal(r.map(([x, y]) => [x * k * Math.cos(lat0 * RAD), y * k]));
};
const boks = (pts) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of pts) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
};
function dp(pts, eps) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a];
    const [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > eps) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// A closed ring: split at the point farthest from the start, simplify both halves.
function dpRing(pts, eps) {
  const r = pts.slice();
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  if (r.length < 4) return r;
  let k = 0, best = -1;
  r.forEach(([x, y], i) => {
    const d = Math.hypot(x - r[0][0], y - r[0][1]);
    if (d > best) {
      best = d;
      k = i;
    }
  });
  const a = dp(r.slice(0, k + 1), eps);
  const b = dp(r.slice(k).concat([r[0]]), eps);
  return a.concat(b.slice(1, -1));
}

const SIDE = 200;
const ut = {};
for (const a3 of LAND) {
  const fs = etter.get(a3);
  const hoved = fs.find((f) => f.properties.ADM0_A3 === a3);
  const p = hoved.properties;
  // Outer rings, and the big holes (Lesotho in South Africa) drawn with the even-odd rule.
  let ringer = [];
  let hull = [];
  for (const f of fs) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      ringer.push(poly[0]);
      for (const h of poly.slice(1)) if (kmAreal(h) > 5000) hull.push(h);
    }
  }
  // Unwrap longitudes around the biggest ring (Russia, Fiji, Kiribati cross 180°).
  ringer.sort((a, b) => kmAreal(b) - kmAreal(a));
  const lon0 = ringer[0].reduce((s, q) => s + q[0], 0) / ringer[0].length;
  const pakkUt = (r) => r.map(([x, y]) => [x - lon0 > 180 ? x - 360 : x - lon0 < -180 ? x + 360 : x, y]);
  ringer = ringer.map(pakkUt);
  hull = hull.map(pakkUt);
  if (UTE[a3]) ringer = ringer.filter((r) => !UTE[a3](boks(r).reduce((s, v, i) => (s[i % 2] += v / 2, s), [0, 0])));
  // Keep the islands that belong with it: grow a cluster from the biggest ring, taking in rings
  // that lie close to it (gap under a quarter of its size); drop crumbs.
  const arealer = ringer.map(kmAreal);
  const storst = arealer[0];
  const med = [0];
  let b = boks(ringer[0]);
  let endret = true;
  while (endret) {
    endret = false;
    const diag = Math.hypot(b[2] - b[0], b[3] - b[1]);
    for (let i = 1; i < ringer.length; i++) {
      if (med.includes(i)) continue;
      const rb = boks(ringer[i]);
      const gap = Math.hypot(Math.max(0, rb[0] - b[2], b[0] - rb[2]), Math.max(0, rb[1] - b[3], b[1] - rb[3]));
      if (gap <= Math.max((NAER[a3] || 0.25) * diag, 1.2)) {
        med.push(i);
        b = [Math.min(b[0], rb[0]), Math.min(b[1], rb[1]), Math.max(b[2], rb[2]), Math.max(b[3], rb[3])];
        endret = true;
      }
    }
  }
  let valgt = med.filter((i) => arealer[i] >= storst * 0.004 || i === 0);
  const km2 = valgt.reduce((s, i) => s + arealer[i], 0);
  // Project and scale.
  const proj = valgt.map((i) => ringer[i].map(([x, y]) => [x, merc(y)]));
  const projHull = hull.map((r) => r.map(([x, y]) => [x, merc(y)]));
  const [x0, y0, x1, y1] = boks(proj.flat());
  const s = SIDE / Math.max(x1 - x0, y1 - y0);
  const W = Math.max(1, Math.round((x1 - x0) * s));
  const Hh = Math.max(1, Math.round((y1 - y0) * s));
  const eps = 0.7;
  let stier = [];
  for (const r of proj) {
    const pts = r.map(([x, y]) => [(x - x0) * s, (y1 - y) * s]);
    let enkel = dpRing(pts, eps).map(([x, y]) => [Math.round(x), Math.round(y)]);
    enkel = enkel.filter((q, i) => i === 0 || q[0] !== enkel[i - 1][0] || q[1] !== enkel[i - 1][1]);
    if (enkel.length > 1 && enkel[0][0] === enkel[enkel.length - 1][0] && enkel[0][1] === enkel[enkel.length - 1][1]) enkel.pop();
    const a = ringAreal(enkel);
    stier.push({ enkel, a });
  }
  stier.sort((p1, p2) => p2.a - p1.a);
  for (const r of projHull) {
    const pts = r.map(([x, y]) => [(x - x0) * s, (y1 - y) * s]);
    const enkel = dpRing(pts, eps).map(([x, y]) => [Math.round(x), Math.round(y)]);
    if (enkel.length >= 3 && ringAreal(enkel) >= 4) stier.push({ enkel, a: ringAreal(enkel), hull: true });
  }
  // Crumbs that rounded away are dropped, but a country made of crumbs keeps its biggest ones as dots.
  let beholdt = stier.filter((x) => x.enkel.length >= 3 && x.a >= 2);
  if (!beholdt.some((x) => !x.hull)) beholdt = stier.filter((x) => !x.hull).slice(0, 12);
  let d = "";
  for (const { enkel } of beholdt) {
    if (enkel.length < 3) {
      const [x, y] = enkel[0];
      d += `M${x - 1} ${y - 1}h2v2h-2z`;
      continue;
    }
    d += `M${enkel[0][0]} ${enkel[0][1]}l`;
    const deler = [];
    for (let i = 1; i < enkel.length; i++) deler.push(`${enkel[i][0] - enkel[i - 1][0]} ${enkel[i][1] - enkel[i - 1][1]}`);
    d += deler.join(" ").replace(/ -/g, "-") + "z";
  }
  const id = ID[a3] || a3;
  const del = HAV[a3] || VERDENSDEL[p.CONTINENT];
  if (!del) throw new Error(a3 + ": ukjent verdensdel " + p.CONTINENT);
  ut[id] = { d, w: W, h: Hh, x: Math.round(p.LABEL_X * 100) / 100, y: Math.round(p.LABEL_Y * 100) / 100, a: Math.max(1, Math.round(km2 / 1000)), v: del };
}

const linjer = Object.entries(ut)
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([id, o]) => `      ${id}: [${JSON.stringify(o.d)}, ${o.w}, ${o.h}, ${o.y}, ${o.x}, ${o.a}, "${o.v}"],`);
const blokk = `    // KART-START (made by kilde/lag-kart.mjs from Natural Earth 1:50m, public domain – do not edit by hand)
    // id: [outline path, width, height, label latitude, label longitude, area in 1000 km², continent]
    const KART = Object.freeze({
${linjer.join("\n")}
    });
    // KART-SLUTT`;
const js = readFileSync(SPILL, "utf8");
const a = js.indexOf("    // KART-START");
const b = js.indexOf("// KART-SLUTT");
if (a < 0 || b < 0) throw new Error("spill.js mangler KART-START/KART-SLUTT");
writeFileSync(SPILL, js.slice(0, a) + blokk + js.slice(b + "// KART-SLUTT".length));
const storrelse = linjer.join("\n").length;
console.log(`${Object.keys(ut).length} land, ${Math.round(storrelse / 1024)} kB`);
