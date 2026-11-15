// The admin page: HTML built by the Worker from the numbers in tall.js and tavle.js. No external
// files, no libraries; the charts are inline SVG drawn here. The dashboard itself contains no
// script at all (the period and the sort order are plain links); only the key login needs a few
// lines of script. All texts are Norwegian, in plain words.
import { OPPBEVARING_MND, MAKS_EKSPORT_DAGER } from "./oppsett.js";
import { tall } from "./tall.js";
import { PERIODER } from "./tavle.js";
import { kortDato, langDato, ukedag, maanedNavn, flytt, dagNr } from "./dato.js";

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const pst = (p) => (p === null ? "–" : `${p} %`);
const flertall = (n, en, flere) => `${tall(n)} ${n === 1 ? en : flere}`;
const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const desimal = (x) => String(x).replace(".", ",");

// ---------- Styles (the same night, paper, mint and lamp colours as rusj.no) ----------

const STIL = `
:root{--natt:#150c28;--natt-2:#21143d;--natt-3:#2e1e52;--strek:#47326f;--tekst:#fff1dd;--tekst-2:#cdbce9;--tekst-3:#a08cc8;--mynte:#3de3b0;--lampe:#ffd23f;--rosa:#ff9db5;color-scheme:dark;background:var(--natt);-webkit-text-size-adjust:100%}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--natt);color:var(--tekst);font:400 1rem/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.ramme{max-width:560px;margin:0 auto;padding:max(16px,env(safe-area-inset-top)) 16px 48px}
.topp{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:4px 0 16px}
.merke{margin:0;font-weight:900;font-size:1.5rem;letter-spacing:-.02em}
.merke span{color:var(--tekst-3);font-weight:600;font-size:1rem;margin-left:.35em}
a,.lenke{color:var(--mynte);text-decoration:underline;text-underline-offset:3px}
.lenke{background:none;border:0;padding:0;font:inherit;cursor:pointer}
h1,h2,h3,p{margin:0}
h1{font-size:1.35rem;line-height:1.2;margin-bottom:8px}
h2{font-size:1.1rem;line-height:1.25;margin-bottom:10px}
h3{font-size:.9rem;color:var(--tekst-2);font-weight:600;margin:16px 0 8px}
.hoved{margin:0 0 16px;padding:18px;border-radius:18px;background:var(--natt-2);border:2px solid var(--strek);border-top:4px solid var(--lampe)}
.setning{font-size:1.4rem;line-height:1.3;font-weight:700;letter-spacing:-.01em}
.setning b{color:var(--lampe);font-weight:900}
.hittil{margin-top:8px;color:var(--tekst-2)}
.kort{margin:0 0 16px;padding:16px;border-radius:18px;background:var(--natt-2);border:2px solid var(--strek);min-width:0}
.liten{margin-top:10px;color:var(--tekst-3);font-size:.85rem}
.tom{color:var(--tekst-2);background:var(--natt-3);border-radius:12px;padding:12px}
.fliser{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0}
.flis{display:grid;grid-row:span 2;grid-template-rows:subgrid;row-gap:2px;background:var(--natt-3);border-radius:12px;padding:10px 12px;min-width:0}
.flis dt{color:var(--tekst-2);font-size:.82rem;line-height:1.25}
.flis dd{margin:0;font-size:1.7rem;line-height:1.15;font-weight:800;letter-spacing:-.02em}
.flis dd small{display:block;margin-top:2px;color:var(--tekst-3);font-size:.78rem;font-weight:400;letter-spacing:0;line-height:1.3}
.endring{display:inline-block;margin-left:.35em;font-size:.8rem;font-weight:700;letter-spacing:0;white-space:nowrap;vertical-align:middle;color:var(--tekst-3)}
.endring.opp{color:var(--mynte)}
.endring.ned{color:var(--rosa)}
.faner{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:0 -4px 10px;padding:8px 4px;background:var(--natt)}
.faner a{display:flex;align-items:center;justify-content:center;min-height:44px;padding:6px 4px;border-radius:12px;border:2px solid var(--strek);background:var(--natt-2);color:var(--tekst-2);font-weight:700;font-size:.88rem;text-align:center;line-height:1.15;text-decoration:none}
.faner a[aria-current=page]{background:var(--lampe);border-color:var(--lampe);color:#170e2b}
.faner a:focus-visible{outline:3px solid var(--mynte);outline-offset:2px}
.periode-tekst{margin:0 0 12px;color:var(--tekst-2)}
.rader{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.rader li{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:baseline}
.rad-navn{min-width:0;overflow-wrap:anywhere}
.rad-tall{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.rad-tall small{color:var(--tekst-3);font-weight:400;margin-left:.4em}
.rad-ekstra{grid-column:1/-1;color:var(--tekst-3);font-size:.82rem}
progress{grid-column:1/-1;display:block;width:100%;height:10px;border:0;border-radius:5px;background:var(--natt-3);overflow:hidden;-webkit-appearance:none;appearance:none}
progress::-webkit-progress-bar{background:var(--natt-3);border-radius:5px}
progress::-webkit-progress-value{background:var(--mynte);border-radius:5px}
progress::-moz-progress-bar{background:var(--mynte);border-radius:5px}
progress.ned::-webkit-progress-value{background:var(--rosa)}
progress.ned::-moz-progress-bar{background:var(--rosa)}
figure{margin:14px 0 0}
figcaption{color:var(--tekst-2);font-size:.9rem;font-weight:600;margin-bottom:4px}
svg{display:block;width:100%;height:auto}
.s-rutenett{stroke:var(--strek);stroke-width:1}
.s-akse{fill:var(--tekst-3);font-size:10px}
.s-verdi{fill:var(--tekst);font-size:10.5px;font-weight:700;paint-order:stroke;stroke:var(--natt-2);stroke-width:3px;stroke-linejoin:round}
.s-enheter{fill:var(--mynte)}
.s-besok{fill:var(--lampe)}
.s-delvis{opacity:.5}
.s-treff{fill:transparent}
.s-stolpe:hover path{filter:brightness(1.25)}
svg.s-spark{display:inline-block;width:56px;height:18px;vertical-align:middle}
.s-spark rect{fill:var(--mynte)}
.s-spark .s-tom{fill:var(--strek)}
details{margin-top:12px}
summary{color:var(--mynte);cursor:pointer;min-height:32px;display:flex;align-items:center;font-size:.9rem}
.rull{overflow-x:auto;margin:0 -4px;padding:0 4px}
table{width:100%;border-collapse:collapse;margin-top:6px;font-size:.88rem;font-variant-numeric:tabular-nums}
th,td{padding:6px 4px;border-bottom:1px solid var(--strek);text-align:right;vertical-align:middle}
th:first-child,td:first-child{text-align:left}
th{color:var(--tekst-2);font-weight:600;white-space:nowrap}
th a{color:var(--tekst-2)}
th[aria-sort] a{color:var(--lampe);font-weight:800}
td .endring{margin-left:0}
.spilltabell th,.spilltabell td{padding:6px 3px}
.spilltabell td:first-child{min-width:6em;hyphens:auto;-webkit-hyphens:auto}
.spilltabell small{display:block;color:var(--tekst-3);font-size:.75rem;font-weight:400}
.spilltabell th small{font-size:.8rem}
.spilltabell th[aria-sort] small a{color:var(--tekst-2);font-weight:600}
.hjelp dt{font-weight:700;margin-top:12px}
.hjelp dd{margin:2px 0 0;color:var(--tekst-2)}
.helse{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.helse li{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:baseline}
.helse b{grid-column:2}
.helse span:last-child{grid-column:2;color:var(--tekst-2);font-size:.88rem}
.merkelapp{grid-row:span 2;display:inline-block;min-width:3.6em;padding:2px 8px;border-radius:999px;font-size:.78rem;font-weight:800;text-align:center;background:var(--natt-3);color:var(--tekst-2)}
.merkelapp.ok{background:var(--mynte);color:#170e2b}
.merkelapp.feil{background:var(--rosa);color:#170e2b}
.merkelapp.obs{background:var(--lampe);color:#170e2b}
.lenker{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:8px}
.inn label{display:block;margin:14px 0 6px;font-weight:700}
.inn input{width:100%;min-height:52px;padding:10px 12px;border-radius:12px;border:2px solid var(--strek);background:var(--natt);color:var(--tekst);font:inherit}
.inn input:focus-visible{outline:3px solid var(--mynte);outline-offset:1px}
.knapp{width:100%;min-height:56px;margin-top:12px;border:0;border-radius:18px;background:var(--mynte);box-shadow:0 5px 0 #1a9a74;color:#170e2b;font:inherit;font-weight:900;font-size:1.1rem;cursor:pointer}
.status{min-height:1.5em;margin-top:12px;color:var(--lampe)}
@media (min-width:480px){.fliser.fire,.fliser.seks{grid-template-columns:repeat(3,1fr)}.fliser.fire{grid-template-columns:repeat(4,1fr)}}
@media (min-width:900px){.ramme.bred{max-width:1120px}.tavle{display:grid;grid-template-columns:1fr 1fr;column-gap:16px;align-items:start}.tavle>*{grid-column:1/-1}.tavle>.halv{grid-column:auto}.over-tid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));column-gap:28px;align-items:start}.fliser.seks{grid-template-columns:repeat(6,1fr)}}
@media (prefers-reduced-motion:no-preference){.s-stolpe path{transition:filter .1s}}
`;

// ---------- Small building blocks ----------

// The change from the period before, as a small coloured note: «+12 %», «−5 %», «ny».
export function endringTekst(e) {
  if (!e) return "";
  if (e.ny) return "ny";
  if (e.prosent === 0) return "±0 %";
  return `${e.prosent > 0 ? "+" : "−"}${tall(Math.abs(e.prosent))} %`;
}
const endringHtml = (e) => {
  if (!e) return "";
  const klasse = e.ny || e.prosent > 0 ? "opp" : e.prosent < 0 ? "ned" : "lik";
  return `<span class="endring ${klasse}" title="Endring fra perioden før">${esc(endringTekst(e))}</span>`;
};

const flis = (navn, verdi, under, ekstraHtml = "") => `<div class="flis"><dt>${esc(navn)}</dt><dd>${esc(verdi)}${ekstraHtml}${under ? `<small>${esc(under)}</small>` : ""}</dd></div>`;

// Escapes a sentence and makes its numbers bold ("12 345" with its space is one number).
const uthev = (tekst) =>
  String(tekst)
    .split(/(\d(?:[\d ]*\d)?)/)
    .map((del, i) => (i % 2 ? `<b>${esc(del)}</b>` : esc(del)))
    .join("");

// A list of named rows, each with a figure and a bar. `maks` is the value a full bar stands for.
function rader(liste, maks) {
  const topp = Math.max(1, maks);
  return `<ul class="rader">${liste
    .map(
      (r) =>
        `<li><span class="rad-navn">${esc(r.navn)}</span><span class="rad-tall">${esc(tall(r.antall))}${r.ved ? `<small>${esc(r.ved)}</small>` : ""}${r.endring ? endringHtml(r.endring) : ""}</span>` +
        `<progress${r.ned ? ' class="ned"' : ""} max="${topp}" value="${Math.min(topp, Math.max(0, r.antall))}" aria-hidden="true"></progress>` +
        (r.ekstra ? `<span class="rad-ekstra">${esc(r.ekstra)}</span>` : "") +
        `</li>`,
    )
    .join("")}</ul>`;
}

// A round number at or above n for the top of an axis, and the step between its lines.
export function akse(maks) {
  if (maks <= 4) return { topp: Math.max(1, maks), steg: 1 };
  const tier = Math.pow(10, Math.floor(Math.log10(maks)));
  const steg = [0.2, 0.5, 1, 2, 5].map((f) => f * tier).find((s) => maks / s <= 4) || tier * 10;
  return { topp: Math.ceil(maks / steg) * steg, steg };
}

// How a bar is named: per day by default; per week and per month for the other charts.
const DAG = { kort: (d, mange) => (mange ? kortDato(d.dag) : ukedag(d.dag)), lang: (d) => `${ukedag(d.dag)} ${kortDato(d.dag)}` };
const UKE = { kort: (d) => kortDato(d.dag), lang: (d) => `uka fra ${kortDato(d.dag)}` };
const MANED = { kort: (d) => `${maanedNavn(d.dag).slice(0, 3)} ${d.dag.slice(2, 4)}`, lang: (d) => `${maanedNavn(d.dag)} ${d.dag.slice(0, 4)}` };

// One bar per day (or week, or month), drawn as inline SVG. One series per chart, so the caption
// names it. A bar for a period that is not over yet (d.delvis) is drawn paler; a month whose total
// is missing (d.mangler) has no bar.
export function stolper(serie, felt, klasse, navn, { navngi = DAG } = {}) {
  const verdier = serie.map((d) => d[felt]);
  const maks = Math.max(0, ...verdier);
  if (maks === 0) return `<p class="tom">Ingen tall for ${navngi === DAG ? "disse dagene" : "denne tiden"} ennå.</p>`;
  const { topp, steg } = akse(maks);
  const B = 340;
  const H = 150;
  // Room on the left for the longest number on the axis ("12 000" needs more than "40").
  const venstre = Math.max(30, Math.ceil(8 + tall(topp).length * 5.8));
  const hoyre = 8;
  const oppe = 16;
  const nede = 22;
  const flateB = B - venstre - hoyre;
  const flateH = H - oppe - nede;
  const y = (v) => oppe + flateH - (v / topp) * flateH;
  const felt_ = flateB / serie.length;
  const bredde = Math.max(2, Math.min(24, felt_ - 2));
  const f = (n) => Number(n.toFixed(1));

  let ut = "";
  for (let v = 0; v <= topp + 1e-9; v += steg) {
    ut += `<line class="s-rutenett" x1="${venstre}" x2="${B - hoyre}" y1="${f(y(v))}" y2="${f(y(v))}"/>`;
    ut += `<text class="s-akse" x="${venstre - 5}" y="${f(y(v) + 3.5)}" text-anchor="end">${esc(tall(v))}</text>`;
  }
  const iMaks = verdier.indexOf(maks);
  const iSist = serie.length - 1;
  const merk = new Set([iMaks]);
  if (Math.abs(iSist - iMaks) * felt_ >= 30) merk.add(iSist);
  serie.forEach((d, i) => {
    const v = d[felt];
    const x = venstre + i * felt_ + (felt_ - bredde) / 2;
    const h = (v / topp) * flateH;
    const r = Math.min(4, bredde / 2, h);
    const bunn = oppe + flateH;
    // Rounded at the top (the data end), square at the baseline.
    const form = h > 0 ? `<path class="${klasse}${d.delvis ? " s-delvis" : ""}" d="M${f(x)} ${f(bunn)}V${f(bunn - h + r)}Q${f(x)} ${f(bunn - h)} ${f(x + r)} ${f(bunn - h)}H${f(x + bredde - r)}Q${f(x + bredde)} ${f(bunn - h)} ${f(x + bredde)} ${f(bunn - h + r)}V${f(bunn)}Z"/>` : "";
    const verdiTekst = d.mangler ? "mangler" : tall(v) + (d.delvis ? " (hittil)" : "");
    ut += `<g class="s-stolpe"><title>${esc(`${navngi.lang(d)}: ${verdiTekst}`)}</title><rect class="s-treff" x="${f(venstre + i * felt_)}" y="${oppe}" width="${f(felt_)}" height="${flateH}"/>${form}</g>`;
    if (merk.has(i) && !d.mangler) {
      const tekst = tall(v);
      const halv = tekst.length * 3.2;
      const tx = Math.min(B - hoyre - halv, Math.max(venstre + halv, x + bredde / 2));
      ut += `<text class="s-verdi" x="${f(tx)}" y="${f(bunn - h - 4)}" text-anchor="middle">${esc(tekst)}</text>`;
    }
  });
  const mange = serie.length > 7;
  const xTekst = (i, anker) => `<text class="s-akse" x="${f(venstre + i * felt_ + felt_ / 2)}" y="${H - 6}" text-anchor="${anker}">${esc(navngi.kort(serie[i], mange))}</text>`;
  if (!mange) serie.forEach((_, i) => (ut += xTekst(i, "middle")));
  else ut += xTekst(0, "start") + xTekst(Math.floor(iSist / 2), "middle") + xTekst(iSist, "end");

  const fraTil = navngi === DAG ? `${kortDato(serie[0].dag)} til ${kortDato(serie[iSist].dag)}` : `${navngi.lang(serie[0])} til ${navngi.lang(serie[iSist])}`;
  const beskrivelse = `${navn}, ${fraTil}. Høyest: ${tall(maks)} (${navngi.lang(serie[iMaks])}).`;
  return `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="${esc(beskrivelse)}">${ut}</svg>`;
}

// A tiny bar chart in a table row: starts per week over the last 8 weeks.
export function spark(verdier) {
  const maks = Math.max(1, ...verdier);
  const f = (n) => Number(n.toFixed(1));
  const staver = verdier
    .map((v, i) => {
      const h = v > 0 ? Math.max(1.5, (v / maks) * 16) : 1;
      return `<rect${v > 0 ? "" : ' class="s-tom"'} x="${i * 7}" y="${f(18 - h)}" width="5" height="${f(h)}"/>`;
    })
    .join("");
  return `<svg class="s-spark" viewBox="0 0 56 18" role="img" aria-label="${esc(`Startet per uke, siste 8 uker: ${verdier.map((v) => tall(v)).join(", ")}`)}">${staver}</svg>`;
}

// ---------- The usual sections, for one period ----------

function delTilbake(p) {
  const t = p.tilbake;
  if (p.enheter === 0) {
    return `<section class="kort halv"><h2>Kommer de tilbake?</h2><p class="tom">Ingen tall ennå. Dette fylles ut når enheter har vært innom – og «kom tilbake dagen etter» tidligst dagen etter at tellingen ble slått på.</p></section>`;
  }
  const fliser =
    flis("Tilbake dagen etter", pst(t.nesteDag.prosent), t.nesteDag.nevner > 0 ? `${tall(t.nesteDag.teller)} av ${tall(t.nesteDag.nevner)} som var her dagen før` : "ingen ble talt dagen før") +
    flis("Var her uka før", pst(t.innenUke.prosent), `${tall(t.innenUke.teller)} av ${tall(t.innenUke.nevner)} enheter`);
  const liste = rader(
    [
      { navn: "Første gang på rusj", antall: t.ny },
      { navn: "Var her også dagen før", antall: t.igar },
      { navn: "Var her 2–7 dager før", antall: t.uke },
      { navn: "Mer enn en uke siden sist", antall: t.lenge },
    ],
    p.enheter,
  );
  return `<section class="kort halv"><h2>Kommer de tilbake?</h2><dl class="fliser">${fliser}</dl><h3>Når var enhetene sist innom?</h3>${liste}<p class="liten">Over flere dager telles en enhet én gang for hver dag den er innom.</p></section>`;
}

function delTid(p) {
  const t = p.tid;
  if (t.totalt === 0) {
    return `<section class="kort halv"><h2>Hvor lenge er de innom?</h2><p class="tom">Ingen besøk er talt i denne perioden.</p></section>`;
  }
  const m = t.median;
  const typisk = !m ? "" : m.over ? `over ${m.over} minutter` : m.minutter < 1 ? "under 1 minutt" : `ca. ${desimal(m.minutter >= 10 ? Math.round(m.minutter) : m.minutter)} ${m.minutter === 1 ? "minutt" : "minutter"}`;
  return (
    `<section class="kort halv"><h2>Hvor lenge er de innom?</h2>` +
    (typisk ? `<dl class="fliser"><div class="flis"><dt>Et typisk besøk varer</dt><dd>${esc(typisk)}<small>anslag ut fra gruppene under</small></dd></div>${flis("Besøk talt", tall(t.totalt))}</dl><h3>Besøk etter lengde</h3>` : "") +
    rader(
      t.grupper.map((g) => ({ navn: g.navn, antall: g.antall, ved: pst(g.prosent) })),
      t.totalt,
    ) +
    `<p class="liten">Tiden telles bare mens rusj er framme på skjermen, og bare i grove grupper.</p></section>`
  );
}

function delDaglig(p) {
  const d = p.daglig;
  const noe = d.minstEn > 0 || d.spill.some((s) => s.fullfort > 0);
  if (!noe) {
    return `<section class="kort halv"><h2>Dagens rusj</h2><p class="tom">Ingen har fullført en av dagens oppgaver i denne perioden.</p></section>`;
  }
  const ord = ["én", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni"];
  const trinn = d.minst.map((m) => ({ navn: m.n === d.antallDaglige && m.n > 1 ? `Fullførte alle ${ord[m.n - 1] || m.n}` : `Fullførte minst ${ord[m.n - 1] || m.n}`, antall: m.antall }));
  return (
    `<section class="kort halv"><h2>Dagens rusj</h2>` +
    `<h3>Fullførte dagens oppgave</h3>${rader(d.spill.map((s) => ({ navn: s.navn, antall: s.fullfort })), Math.max(...d.spill.map((s) => s.fullfort), 0))}` +
    `<h3>Hvor mange av dagens oppgaver?</h3>${rader(trinn, d.minstEn)}` +
    `<h3>Dager på rad (for dem som fullførte minst én)</h3>${rader(d.rekker.map((r) => ({ navn: r.navn, antall: r.antall })), Math.max(...d.rekker.map((r) => r.antall), 0))}` +
    (p.antallDager > 1 ? `<p class="liten">Over flere dager telles en enhet én gang per dag den fullfører.</p>` : "") +
    `</section>`
  );
}

// ---------- The dashboard's own sections ----------

const lenke = (p, sort) => `/admin?p=${encodeURIComponent(p)}${sort && sort !== "startet" ? `&sort=${encodeURIComponent(sort)}` : ""}`;

function periodeTekst(t) {
  const p = t.periode;
  const tekst = `${kortDato(p.fra)} ${p.fra.slice(0, 4)} til ${kortDato(p.til)} ${p.til.slice(0, 4)} – ${flertall(p.antallDager, "hel dag", "hele dager")}, til og med i går.`;
  if (p.kanSammenligne) return `${tekst} Endringene sammenligner med ${kortDato(p.forrige.fra)} til ${kortDato(p.forrige.til)}.`;
  if (p.forrige) return `${tekst} Ingen sammenligning: perioden før ble ikke talt hele.`;
  return `${tekst} «Alt» har ingen periode før seg å sammenligne med.`;
}

function delFaner(t) {
  return `<nav class="faner" aria-label="Periode">${PERIODER.map((p) => `<a href="${esc(lenke(p.id, t.sort))}"${p.id === t.periode.id ? ' aria-current="page"' : ""}>${esc(p.navn)}</a>`).join("")}</nav>`;
}

function delNokkeltall(t) {
  const fliser = t.nokkeltall
    .map((k) => flis(k.navn, tall(k.verdi), k.forrige === null ? k.under : `${k.under} · før: ${tall(k.forrige)}`, endringHtml(k.endring)))
    .join("");
  return `<section class="kort"><h2>Nøkkeltall</h2><dl class="fliser seks">${fliser}</dl></section>`;
}

function tabell(serie, kolonner, navngi) {
  return `<details><summary>Vis tallene</summary><div class="rull"><table><thead><tr><th scope="col">${esc(navngi === MANED ? "Måned" : navngi === UKE ? "Uke" : "Dag")}</th>${kolonner.map(([, n]) => `<th scope="col">${esc(n)}</th>`).join("")}</tr></thead><tbody>${serie
    .slice()
    .reverse()
    .map((d) => `<tr><td>${esc(navngi.lang(d))}${d.delvis ? " (hittil)" : ""}</td>${kolonner.map(([f]) => `<td>${esc(d.mangler ? "–" : tall(d[f]))}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div></details>`;
}

function delOverTid(t) {
  const d = t.diagram;
  let ut = "";
  if (d.dag.length) {
    ut +=
      `<div><h3>Per dag</h3>` +
      `<figure><figcaption>Enheter innom per dag</figcaption>${stolper(d.dag, "enheter", "s-enheter", "Enheter innom per dag")}</figure>` +
      `<figure><figcaption>Besøk per dag</figcaption>${stolper(d.dag, "besok", "s-besok", "Besøk per dag")}</figure>` +
      tabell(d.dag, [["enheter", "Enheter"], ["besok", "Besøk"]], DAG) +
      `</div>`;
  }
  if (d.uke.length) {
    ut +=
      `<div><h3>Per uke</h3>` +
      `<figure><figcaption>Ulike enheter per uke</figcaption>${stolper(d.uke, "unike", "s-enheter", "Ulike enheter per uke", { navngi: UKE })}</figure>` +
      `<figure><figcaption>Besøk per uke</figcaption>${stolper(d.uke, "besok", "s-besok", "Besøk per uke", { navngi: UKE })}</figure>` +
      tabell(d.uke, [["unike", "Ulike enheter"], ["besok", "Besøk"]], UKE) +
      `</div>`;
  }
  if (d.maned.length) {
    ut +=
      `<div><h3>Per måned</h3>` +
      `<figure><figcaption>Ulike enheter per måned</figcaption>${stolper(d.maned, "unike", "s-enheter", "Ulike enheter per måned", { navngi: MANED })}</figure>` +
      `<figure><figcaption>Besøk per måned</figcaption>${stolper(d.maned, "besok", "s-besok", "Besøk per måned", { navngi: MANED })}</figure>` +
      tabell(d.maned, [["unike", "Ulike enheter"], ["besok", "Besøk"]], MANED) +
      (d.maned.some((m) => m.mangler) ? `<p class="liten">Måneder uten søyle venter på nattjobben som legger sammen månedstallene.</p>` : "") +
      `</div>`;
  }
  return `<section class="kort"><h2>Over tid</h2>${ut ? `<div class="over-tid">${ut}</div>` : `<p class="tom">Ingen tall ennå.</p>`}<p class="liten">Den bleke søylen er uka eller måneden som ikke er over ennå. Ulike enheter per uke og måned er ekte tall: hver enhet melder fra én gang per uke og én gang per måned.</p></section>`;
}

function delTrakt(t) {
  const k = t.trakt;
  if (!k.besok && !k.startet) return `<section class="kort halv"><h2>Fra besøk til ferdig spill</h2><p class="tom">Ingen besøk er talt i denne perioden.</p></section>`;
  const liste = rader(
    [
      { navn: "Besøk", antall: k.besok },
      { navn: "Spill startet", antall: k.startet, ekstra: k.perBesok === null ? "" : `${desimal(k.perBesok)} spill per besøk` },
      { navn: "Spill fullført", antall: k.ferdig, ekstra: k.ferdigAndel === null ? "" : `${pst(k.ferdigAndel)} av spillene som startes, blir spilt ferdig` },
    ],
    Math.max(k.besok, k.startet, k.ferdig),
  );
  return `<section class="kort halv"><h2>Fra besøk til ferdig spill</h2>${liste}<p class="liten">Ett besøk kan starte mange spill, og ikke alle spill melder «ferdig».</p></section>`;
}

// Spill | Startet | Fullført (and the share finished under it) | Endring | 8 uker. Every heading
// is a link that sorts by it («%» sorts by the share finished).
function spillTabell(rader_, t) {
  const sortert = (id) => (t.sort === id ? ` aria-sort="${id === "navn" ? "ascending" : "descending"}"` : "");
  const a = (id, n, tittel) => `<a href="${esc(lenke(t.periode.id, id))}"${tittel ? ` title="${esc(tittel)}"` : ""}>${esc(n)}</a>`;
  const hode =
    `<thead><tr><th scope="col"${sortert("navn")}>${a("navn", "Spill")}</th><th scope="col"${sortert("startet")}>${a("startet", "Startet")}</th>` +
    `<th scope="col"${t.sort === "ferdig" || t.sort === "prosent" ? ' aria-sort="descending"' : ""}>${a("ferdig", "Fullført")}<small>${a("prosent", "%", "Sorter etter andelen fullført")}</small></th>` +
    `<th scope="col"${sortert("endring")}>${a("endring", "Endring")}</th><th scope="col">8 uker</th></tr></thead>`;
  const rad = (r) =>
    `<tr><td>${esc(r.navn)}</td><td>${esc(tall(r.startet))}</td><td>${esc(tall(r.ferdig))}<small>${esc(pst(r.prosent))}</small></td><td>${r.endring ? endringHtml(r.endring) : "–"}</td><td>${spark(r.spark)}</td></tr>`;
  return `<div class="rull"><table class="spilltabell">${hode}<tbody>${rader_.map(rad).join("")}</tbody></table></div>`;
}

function delSpill(t) {
  if (!t.spill.length) return `<section class="kort"><h2>Spillene</h2><p class="tom">Ingen spill er åpnet eller startet i denne perioden.</p></section>`;
  const TOPP = 25;
  const resten = t.spill.slice(TOPP);
  return (
    `<section class="kort"><h2>Spillene</h2><p class="periode-tekst">Trykk på en overskrift for å sortere. Under «Fullført» står andelen av startede spill som ble spilt ferdig. «8 uker» viser startet per uke de siste åtte ukene.</p>` +
    spillTabell(t.spill.slice(0, TOPP), t) +
    (resten.length ? `<details><summary>Vis de ${tall(resten.length)} andre spillene</summary>${spillTabell(resten, t)}</details>` : "") +
    `<p class="liten">Forsiden ble åpnet ${flertall(t.vanlig.forside, "gang", "ganger")}. Fullført % kan ikke bli over 100.</p></section>`
  );
}

function delFlytting(t) {
  if (!t.periode.kanSammenligne) return `<section class="kort halv"><h2>Stiger mest og faller mest</h2><p class="tom">Ingen periode før denne å sammenligne med.</p></section>`;
  const liste = (l) =>
    l.length
      ? rader(
          l.map((r) => ({ navn: r.navn, antall: Math.abs(r.forskjell), ved: r.forskjell > 0 ? "flere" : "færre", ekstra: `startet ${tall(r.forrige)} → ${tall(r.startet)}`, endring: r.endring, ned: r.forskjell < 0 })),
          Math.max(...l.map((r) => Math.abs(r.forskjell))),
        )
      : `<p class="tom">Ingen.</p>`;
  return `<section class="kort halv"><h2>Stiger mest og faller mest</h2><h3>Stiger mest</h3>${liste(t.stiger)}<h3>Faller mest</h3>${liste(t.faller)}<p class="liten">Endring i hvor mange ganger spillet ble startet, mot perioden før. Bare spill med minst 3 starter.</p></section>`;
}

function delNyeSpill(t) {
  if (!t.nyeSpill.length) return `<section class="kort halv"><h2>Nye spill</h2><p class="tom">Ingen nye spill de siste åtte ukene.</p></section>`;
  const celle = (u) => (u.framtid ? "–" : `${tall(u.startet)}${u.delvis ? "*" : ""}`);
  const tabell_ = `<div class="rull"><table><thead><tr><th scope="col">Spill</th>${[1, 2, 3, 4].map((n) => `<th scope="col">Uke ${n}</th>`).join("")}</tr></thead><tbody>${t.nyeSpill
    .map((s) => `<tr><td>${esc(s.navn)}<br><small>fra ${esc(kortDato(s.forsteDag))}</small></td>${s.uker.map((u) => `<td>${esc(celle(u))}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
  const summer = t.nyeSpill.map((s) => `${s.navn}: åpnet ${tall(s.apnet)}, startet ${tall(s.startet)}, fullført ${tall(s.ferdig)}`).join(". ");
  return `<section class="kort halv"><h2>Nye spill</h2><p class="periode-tekst">De første fire ukene, regnet fra den første dagen spillet ble talt. Tallene er startet per uke.</p>${tabell_}<p class="liten">${esc(summer)}. * = uka er ikke over.</p></section>`;
}

function gruppeDel(tittel, g, tomTekst) {
  if (!g.total) return `<h3>${esc(tittel)}</h3><p class="tom">${esc(tomTekst)}</p>`;
  return `<h3>${esc(tittel)}</h3>${rader(
    g.rader.map((r) => ({ navn: r.navn, antall: r.antall, ved: pst(r.andel), endring: r.endring })),
    g.total,
  )}`;
}

function delHvem(t) {
  const ny = "Ingen tall ennå. Denne tellingen er ny.";
  return (
    `<section class="kort halv"><h2>Hvem, hvor og hvordan</h2>` +
    gruppeDel("Utgave", t.utgaver, ny) +
    gruppeDel("Type enhet", t.typer, ny) +
    gruppeDel("Hvor besøket kom fra", t.kilder, ny) +
    `<p class="liten">Telles én gang per besøk. Mobilen avgjør selv gruppen ut fra skjermen og fra en fast liste over søkemotorer og sosiale medier; adressen besøket kom fra, sendes aldri. Lenker inne på rusj teller ikke.</p></section>`
  );
}

function delJul(t) {
  const j = t.jul;
  if (Object.values(j).every((x) => x.antall === 0)) return `<section class="kort halv"><h2>Julekalenderen</h2><p class="tom">Ingen har brukt julekalenderen i denne perioden.</p></section>`;
  const fliser = [
    ["apnet", "Kalenderen åpnet"],
    ["luker", "Luker åpnet"],
    ["ferdig", "Luker fullført"],
    ["utskrift", "Skrevet ut"],
    ["paminnelse", "Påminnelser lastet ned"],
    ["tre", "Juletreet lastet ned eller delt"],
  ]
    .map(([id, navn]) => flis(navn, tall(j[id].antall), "", endringHtml(j[id].endring)))
    .join("");
  return `<section class="kort halv"><h2>Julekalenderen</h2><dl class="fliser">${fliser}</dl></section>`;
}

function delNett(t) {
  const n = t.nett;
  if (!n.rom && !n.startet && !n.ferdig) return `<section class="kort halv"><h2>Spill på nett</h2><p class="tom">Ingen rom er laget i denne perioden.</p><p class="liten">Telles på mobilen som lager rommet: rom laget, kamper startet og kamper spilt ferdig.</p></section>`;
  return (
    `<section class="kort halv"><h2>Spill på nett</h2><dl class="fliser">${flis("Rom laget", tall(n.rom))}${flis("Kamper startet", tall(n.startet))}${flis("Kamper ferdige", tall(n.ferdig))}</dl>` +
    `<div class="rull"><table><thead><tr><th scope="col">Spill</th><th scope="col">Rom</th><th scope="col">Startet</th><th scope="col">Ferdig</th></tr></thead><tbody>${n.rader
      .map((r) => `<tr><td>${esc(r.navn)}</td><td>${esc(tall(r.rom))}</td><td>${esc(tall(r.startet))}</td><td>${esc(tall(r.ferdig))}</td></tr>`)
      .join("")}</tbody></table></div><p class="liten">Telles på mobilen som lager rommet, så hver kamp telles én gang.</p></section>`
  );
}

function helseRad(merke, klasse, tittel, tekst) {
  return `<li><span class="merkelapp ${klasse}">${esc(merke)}</span><b>${esc(tittel)}</b><span>${esc(tekst)}</span></li>`;
}

function delDrift(t, drift, s) {
  const d = drift;
  const iDag = s.iDag;
  const linjer = [];
  linjer.push(helseRad("OK", "ok", "Statistikk-tjenesten", `Svarer. Databasen brukte ${tall(d.db.ms)} ms og leste ${tall(d.db.rader)} rader for denne siden.`));
  if (!d.manedTabell) linjer.push(helseRad("Mangler", "feil", "Månedstall", "Tabellen for månedstall finnes ikke ennå. Kjør schema-2.sql (se README). Til da hentes alt fra dagstallene."));
  else if (d.manglerMnd.length) linjer.push(helseRad("Venter", "obs", "Månedstall", `Ikke lagt sammen ennå: ${d.manglerMnd.map((m) => `${maanedNavn(m + "-01")} ${m.slice(0, 4)}`).join(", ")}. Nattjobben gjør det.`));
  else linjer.push(helseRad("OK", "ok", "Månedstall", d.sisteRull ? `Lagt sammen til og med ${maanedNavn(d.sisteRull + "-01")} ${d.sisteRull.slice(0, 4)}.` : "Ingen hel måned å legge sammen ennå. Det skjer natten etter at en måned er over."));
  const nett = d.nett || { av: true };
  if (nett.av) linjer.push(helseRad("Av", "", "Spill på nett", "Sjekkes ikke."));
  else if (nett.ok) linjer.push(helseRad("OK", "ok", "Spill på nett (rusj-nett)", `Svarer (${tall(nett.ms)} ms).`));
  else linjer.push(helseRad("Feil", "feil", "Spill på nett (rusj-nett)", `Svarer ikke som det skal: ${nett.grunn}.`));
  if (!d.sisteDag) linjer.push(helseRad("Ingen", "obs", "Siste tellinger", "Ingen tellinger er kommet ennå."));
  else if (d.sisteDag === iDag) linjer.push(helseRad("OK", "ok", "Siste tellinger", `I dag: ${flertall(d.iDag, "telling", "tellinger")} så langt. Klokkeslett lagres ikke, bare datoen.`));
  else {
    const dager = dagNr(iDag) - dagNr(d.sisteDag);
    linjer.push(helseRad(dager > 1 ? "Feil" : "Obs", dager > 1 ? "feil" : "obs", "Siste tellinger", `Siste dag med tellinger: ${langDato(d.sisteDag)} (${flertall(dager, "dag", "dager")} siden). Ingen i dag ennå.`));
  }

  const feil = t.feil.length
    ? rader(
        t.feil.map((f) => ({ navn: f.navn, antall: f.antall, ved: f.per100 === null ? "" : `${desimal(f.per100)} per 100 åpninger`, endring: f.endring })),
        Math.max(...t.feil.map((f) => f.antall)),
      )
    : `<p class="tom">Ingen feil er meldt i denne perioden.</p>`;

  const p = t.periode;
  const forste = s.forsteDag || flytt(iDag, -30);
  const altFra = dagNr(iDag) - dagNr(forste) + 1 > MAKS_EKSPORT_DAGER ? flytt(iDag, -(MAKS_EKSPORT_DAGER - 1)) : forste;
  const csv = (fra, til, tekst) => `<a href="${esc(`/admin/eksport.csv?fra=${fra}&til=${til}`)}" data-eksport>${esc(tekst)}</a>`;
  const eksport = `<div class="lenker">${csv(p.fra, p.til, "Denne perioden")}${csv(flytt(iDag, -29), iDag, "Siste 30 dager")}${csv(altFra, iDag, "Alt")}</div>`;

  return (
    `<section class="kort"><h2>Drift</h2><ul class="helse">${linjer.join("")}</ul>` +
    `<h3>Feil i spillene (${tall(t.feilTotalt)})</h3>${feil}<p class="liten">Høyst én per sidevisning. Ingenting om selve feilen sendes, bare hvilket spill.</p>` +
    `<h3>Last ned tallene (CSV)</h3><p class="periode-tekst">Én rad per dag og teller: dag, nokkel, n.</p>${eksport}</section>`
  );
}

// ---------- The dashboard ----------

const HJELP = `<section class="kort"><details><summary>Slik leser du tallene</summary><dl class="hjelp">
<dt>Enhet</dt><dd>Én mobil, ett nettbrett eller én PC – egentlig én nettleser. Samme person på to mobiler telles to ganger, og en privat fane telles som ny hver gang. Derfor er tallene anslag.</dd>
<dt>Besøk</dt><dd>Én økt på rusj. Er det stille i 30 minutter, telles neste gang som et nytt besøk.</dd>
<dt>Periode og endring</dt><dd>En periode er hele dager til og med i går. Prosenten ved et tall er endringen fra like mange dager rett før. Den vises bare når hele perioden før ble talt.</dd>
<dt>Ulike enheter</dt><dd>Hver enhet melder fra første gang den er innom i en kalenderuke og i en kalendermåned. For 7 dager brukes uke-tallet, for 30 dager måneds-tallet, og for lengre perioder snittet per måned. Siste 7 og 30 dager krysser uke- og månedsskifter, så tallet er et anslag.</dd>
<dt>Nye installasjoner</dt><dd>Første gang en enhet åpner rusj fra hjemskjermen. De første dagene etter at denne tellingen kom, telles også de som hadde rusj på hjemskjermen fra før.</dd>
<dt>Utgave, type og kilde</dt><dd>Mobilen avgjør selv: utgaven ut fra adressen, typen ut fra skjermen (mobil, nettbrett eller PC), og kilden ut fra en fast liste (søkemotor, sosiale medier, direkte eller annen). Bare ordet sendes.</dd>
<dt>Ikke alle telles</dt><dd>De som har bedt nettleseren om ikke å bli sporet, eller bruker datasparing, sender ingenting. Spilling uten nett telles heller ikke. De ekte tallene er altså litt høyere.</dd>
<dt>Ingen personer</dt><dd>Tallene inneholder ingen navn, ID-er eller IP-adresser. Enheten husker selv når den sist var innom, og melder bare «i går», «siste uke» eller «lenge siden». Vi kan ikke følge noen fra dag til dag.</dd>
<dt>De første ukene</dt><dd>Rett etter at tellingen er slått på, telles alle som «første gang», fordi ingen enhet er talt før.</dd>
<dt>Månedstall</dt><dd>Natten etter at en måned er over, legges dagstallene sammen til ett tall per måned. Lange perioder leses derfra, så siden blir billig å hente.</dd>
<dt>Sletting</dt><dd>Tall som er eldre enn ${OPPBEVARING_MND} måneder, slettes automatisk.</dd>
</dl></details></section>`;

// data: { sammendrag, tavle, drift } from hentTavle. innlogging: "access" (Cloudflare Access) or
// "nokkel" (the admin key).
export function tavle(data, { klokke, innlogging }) {
  const s = data.sammendrag;
  const t = data.tavle;
  const kal = s.kalender;
  const noeIKalender = kal.some((k) => k.enheter > 0);
  const start = s.forsteDag ? `<p class="liten">Tellingen har tall fra og med ${esc(langDato(s.forsteDag))} ${esc(s.forsteDag.slice(0, 4))}.</p>` : "";
  const loggUt = innlogging === "access" ? `<a href="/cdn-cgi/access/logout">Logg ut</a>` : `<button type="button" class="lenke" data-logg-ut>Logg ut</button>`;
  return `<main id="innhold" class="tavle">
<section class="hoved"><h1 class="setning">${uthev(s.setning)}</h1>${s.hittil ? `<p class="hittil">${esc(s.hittil)}</p>` : ""}</section>
<section class="kort"><h2>Hvor mange bruker rusj?</h2>${
    noeIKalender
      ? `<dl class="fliser fire">${kal.map((k) => flis(k.navn, tall(k.enheter))).join("")}</dl><p class="liten">Ulike enheter som var innom minst én gang i perioden. Anslag.</p>`
      : `<p class="tom">Ingen enheter er talt ennå. Tallene for uke og måned kommer her.</p>`
  }${start}</section>
${delFaner(t)}
<p class="periode-tekst">${esc(stor(periodeTekst(t)))}</p>
${delNokkeltall(t)}
${delOverTid(t)}
${delSpill(t)}
${delFlytting(t)}
${delNyeSpill(t)}
${delTrakt(t)}
${delTilbake(t.vanlig)}
${delTid(t.vanlig)}
${delHvem(t)}
${delDaglig(t.vanlig)}
${delJul(t)}
${delNett(t)}
${delDrift(t, data.drift, s)}
${HJELP}
<p class="liten">Hentet kl. ${esc(klokke)}. <a href="${esc(lenke(t.periode.id, t.sort))}">Hent på nytt</a> · ${loggUt}</p>
</main>`;
}

// ---------- The key login (shown with status 401) ----------

function innlogging(nokkelPaa) {
  if (!nokkelPaa) {
    return `<main id="innhold"><section class="kort inn"><h1>Tallene for rusj.no</h1><p>Denne siden er bare for eieren. Innlogging er ikke satt opp ennå, så siden er stengt for alle.</p></section></main>`;
  }
  return `<main id="innhold"><section class="kort inn"><h1>Tallene for rusj.no</h1>
<p>Denne siden er bare for eieren. Lim inn nøkkelen for å se tallene.</p>
<form id="inn" method="post" action="/admin">
<label for="nokkel">Nøkkel</label>
<input id="nokkel" name="nokkel" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required maxlength="200">
<button class="knapp" type="submit">Vis tallene</button>
</form>
<p class="status" id="status" role="status" aria-live="polite"></p>
<p class="liten">Nøkkelen huskes bare til du lukker fanen, og den sendes aldri i adressen.</p>
<noscript><p class="liten">Innloggingen trenger JavaScript.</p></noscript>
</section></main>`;
}

// The key is kept in sessionStorage (this tab only) and sent in a header, never in the address.
// The answer is the same page with the numbers in it; its <main> replaces the form. (Only the
// <main> part is parsed: the answer's own <style> carries another nonce and would be reported.)
// With the key, the dashboard's links (period, sort order) are fetched the same way, and the CSV
// links are fetched with the key and saved as a file.
const INN_SKRIPT = `(function(){
"use strict";
var LAGER="rusj-admin";
function les(){try{return sessionStorage.getItem(LAGER)||""}catch(e){return ""}}
function glem(){try{sessionStorage.removeItem(LAGER)}catch(e){}}
function si(t){var s=document.getElementById("status");if(s)s.textContent=t}
function adresse(a){return /^\\/admin(\\?[A-Za-z0-9=&%._-]*)?$/.test(a||"")?a:"/admin"}
function hent(nokkel,fraSkjema,mal){
var url=adresse(mal||location.pathname+location.search);
si("Henter tallene …");
fetch(url,{headers:{"X-Admin-Nokkel":nokkel},cache:"no-store",credentials:"same-origin",redirect:"error"}).then(function(svar){
if(svar.status===401)throw new Error("feil");
if(!svar.ok)throw new Error("nede");
return svar.text();
}).then(function(html){
var fra=html.indexOf('<main id="innhold"'),til=html.lastIndexOf("</main>");
if(fra<0||til<fra)throw new Error("nede");
var ny=new DOMParser().parseFromString(html.slice(fra,til+7),"text/html").getElementById("innhold");
if(!ny)throw new Error("nede");
try{sessionStorage.setItem(LAGER,nokkel)}catch(e){}
document.getElementById("innhold").replaceWith(document.importNode(ny,true));
var ramme=document.querySelector(".ramme");if(ramme)ramme.classList.add("bred");
if(mal&&mal!==location.pathname+location.search)history.pushState(null,"",url);
}).catch(function(e){
if(e&&e.message==="feil"){glem();si(fraSkjema?"Nøkkelen stemmer ikke. Prøv igjen.":"")}
else si("Fikk ikke hentet tallene. Prøv igjen om litt.");
});
}
function lastNed(href,nokkel){
fetch(href,{headers:{"X-Admin-Nokkel":nokkel},cache:"no-store",credentials:"same-origin",redirect:"error"}).then(function(svar){
if(!svar.ok)throw new Error("nede");
var navn=(/filename="([^"]+)"/.exec(svar.headers.get("Content-Disposition")||"")||[])[1]||"rusj-tall.csv";
return svar.blob().then(function(b){var u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=navn;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},1000)});
}).catch(function(){alert("Fikk ikke lastet ned tallene.")});
}
document.addEventListener("submit",function(e){
if(!e.target||e.target.id!=="inn")return;
e.preventDefault();
var n=document.getElementById("nokkel").value.trim();
if(n)hent(n,true);
});
document.addEventListener("click",function(e){
var el=e.target&&e.target.closest&&e.target.closest("a,[data-logg-ut]");
if(!el)return;
if(el.hasAttribute("data-logg-ut")){glem();location.replace("/admin");return}
var href=el.getAttribute("href")||"",nokkel=les();
if(!nokkel)return;
if(el.hasAttribute("data-eksport")&&/^\\/admin\\/eksport\\.csv\\?/.test(href)){e.preventDefault();lastNed(href,nokkel);return}
if(/^\\/admin(\\?|$)/.test(href)){e.preventDefault();hent(nokkel,false,href)}
});
window.addEventListener("popstate",function(){var n=les();if(n)hent(n,false)});
var lagret=les();
if(lagret)hent(lagret,false);
})();`;

// ---------- The whole page ----------

// data: the dashboard (when logged in) or null (the login page). nonce: for the inline style/script.
export function adminSide({ data, nonce, klokke, innlogging: metode, nokkelPaa }) {
  const hoved = data ? tavle(data, { klokke, innlogging: metode }) : innlogging(nokkelPaa);
  // The login page carries the script; the dashboard served directly has none.
  const skript = data ? "" : `<script nonce="${esc(nonce)}">${INN_SKRIPT}</script>`;
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#150c28">
<meta name="apple-mobile-web-app-title" content="rusj admin">
<title>rusj – tallene</title>
<link rel="manifest" href="/admin/manifest.webmanifest" crossorigin="use-credentials">
<link rel="icon" href="/admin/ikon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/admin/ikon-180.png">
<style nonce="${esc(nonce)}">${STIL}</style>
</head>
<body>
<div class="ramme${data ? " bred" : ""}">
<header class="topp"><p class="merke">rusj<span>tallene</span></p></header>
${hoved}
</div>
${skript}
</body>
</html>`;
}
