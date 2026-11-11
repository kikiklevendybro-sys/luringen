// The admin page: HTML built by the Worker from the summary in tall.js. No external files, no
// libraries. The dashboard itself contains no script at all (tabs are radio buttons and CSS);
// only the key login needs a few lines of script. All texts are Norwegian, in plain words.
import { OPPBEVARING_MND } from "./oppsett.js";
import { tall } from "./tall.js";
import { kortDato, langDato, ukedag } from "./dato.js";

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const pst = (p) => (p === null ? "–" : `${p}\u00a0%`);
const flertall = (n, en, flere) => `${tall(n)} ${n === 1 ? en : flere}`;

// ---------- Styles (the same night, paper, mint and lamp colours as rusj.no) ----------

const STIL = `
:root{--natt:#150c28;--natt-2:#21143d;--natt-3:#2e1e52;--strek:#47326f;--tekst:#fff1dd;--tekst-2:#cdbce9;--tekst-3:#a08cc8;--mynte:#3de3b0;--lampe:#ffd23f;color-scheme:dark;background:var(--natt);-webkit-text-size-adjust:100%}
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
.kort{margin:0 0 16px;padding:16px;border-radius:18px;background:var(--natt-2);border:2px solid var(--strek)}
.liten{margin-top:10px;color:var(--tekst-3);font-size:.85rem}
.tom{color:var(--tekst-2);background:var(--natt-3);border-radius:12px;padding:12px}
.fliser{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0}
.flis{display:grid;grid-row:span 2;grid-template-rows:subgrid;row-gap:2px;background:var(--natt-3);border-radius:12px;padding:10px 12px;min-width:0}
.flis dt{color:var(--tekst-2);font-size:.82rem;line-height:1.25}
.flis dd{margin:0;font-size:1.7rem;line-height:1.15;font-weight:800;letter-spacing:-.02em}
.flis dd small{display:block;margin-top:2px;color:var(--tekst-3);font-size:.78rem;font-weight:400;letter-spacing:0;line-height:1.3}
.perioder{position:relative}
.perioder>input{position:absolute;opacity:0;pointer-events:none}
.faner{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:0 -4px 14px;padding:8px 4px;background:var(--natt)}
.faner label{display:flex;align-items:center;justify-content:center;min-height:44px;padding:6px 4px;border-radius:12px;border:2px solid var(--strek);background:var(--natt-2);color:var(--tekst-2);font-weight:700;font-size:.9rem;text-align:center;line-height:1.15;cursor:pointer}
.panel{display:none}
#p-idag:checked~.panel-idag,#p-igar:checked~.panel-igar,#p-d7:checked~.panel-d7,#p-d30:checked~.panel-d30{display:block}
#p-idag:checked~.faner label[for=p-idag],#p-igar:checked~.faner label[for=p-igar],#p-d7:checked~.faner label[for=p-d7],#p-d30:checked~.faner label[for=p-d30]{background:var(--lampe);border-color:var(--lampe);color:#170e2b}
#p-idag:focus-visible~.faner label[for=p-idag],#p-igar:focus-visible~.faner label[for=p-igar],#p-d7:focus-visible~.faner label[for=p-d7],#p-d30:focus-visible~.faner label[for=p-d30]{outline:3px solid var(--mynte);outline-offset:2px}
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
figure{margin:14px 0 0}
figcaption{color:var(--tekst-2);font-size:.9rem;font-weight:600;margin-bottom:4px}
svg{display:block;width:100%;height:auto}
.s-rutenett{stroke:var(--strek);stroke-width:1}
.s-akse{fill:var(--tekst-3);font-size:10px}
.s-verdi{fill:var(--tekst);font-size:10.5px;font-weight:700;paint-order:stroke;stroke:var(--natt-2);stroke-width:3px;stroke-linejoin:round}
.s-enheter{fill:var(--mynte)}
.s-besok{fill:var(--lampe)}
.s-treff{fill:transparent}
.s-stolpe:hover path{filter:brightness(1.25)}
details{margin-top:12px}
summary{color:var(--mynte);cursor:pointer;min-height:32px;display:flex;align-items:center;font-size:.9rem}
table{width:100%;border-collapse:collapse;margin-top:6px;font-size:.88rem;font-variant-numeric:tabular-nums}
th,td{padding:5px 4px;border-bottom:1px solid var(--strek);text-align:right}
th:first-child,td:first-child{text-align:left}
th{color:var(--tekst-2);font-weight:600}
.hjelp dt{font-weight:700;margin-top:12px}
.hjelp dd{margin:2px 0 0;color:var(--tekst-2)}
.inn label{display:block;margin:14px 0 6px;font-weight:700}
.inn input{width:100%;min-height:52px;padding:10px 12px;border-radius:12px;border:2px solid var(--strek);background:var(--natt);color:var(--tekst);font:inherit}
.inn input:focus-visible{outline:3px solid var(--mynte);outline-offset:1px}
.knapp{width:100%;min-height:56px;margin-top:12px;border:0;border-radius:18px;background:var(--mynte);box-shadow:0 5px 0 #1a9a74;color:#170e2b;font:inherit;font-weight:900;font-size:1.1rem;cursor:pointer}
.status{min-height:1.5em;margin-top:12px;color:var(--lampe)}
@media (min-width:480px){.fliser.fire{grid-template-columns:repeat(4,1fr)}}
@media (prefers-reduced-motion:no-preference){.s-stolpe path{transition:filter .1s}}
`;

// ---------- Small building blocks ----------

const flis = (navn, verdi, under) => `<div class="flis"><dt>${esc(navn)}</dt><dd>${esc(verdi)}${under ? `<small>${esc(under)}</small>` : ""}</dd></div>`;

// Escapes a sentence and makes its numbers bold ("12 345" with its space is one number).
const uthev = (tekst) =>
  String(tekst)
    .split(/(\d(?:[\d\u00a0]*\d)?)/)
    .map((del, i) => (i % 2 ? `<b>${esc(del)}</b>` : esc(del)))
    .join("");

// A list of named rows, each with a figure and a bar. `maks` is the value a full bar stands for.
function rader(liste, maks) {
  const topp = Math.max(1, maks);
  return `<ul class="rader">${liste
    .map(
      (r) =>
        `<li><span class="rad-navn">${esc(r.navn)}</span><span class="rad-tall">${esc(tall(r.antall))}${r.ved ? `<small>${esc(r.ved)}</small>` : ""}</span>` +
        `<progress max="${topp}" value="${Math.min(topp, Math.max(0, r.antall))}" aria-hidden="true"></progress>` +
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

// One bar per day, drawn as inline SVG. One series per chart, so the caption names it.
export function stolper(serie, felt, klasse, navn) {
  const verdier = serie.map((d) => d[felt]);
  const maks = Math.max(0, ...verdier);
  if (maks === 0) return `<p class="tom">Ingen tall for disse dagene ennå.</p>`;
  const B = 340;
  const H = 150;
  const venstre = 30;
  const hoyre = 8;
  const oppe = 16;
  const nede = 22;
  const flateB = B - venstre - hoyre;
  const flateH = H - oppe - nede;
  const { topp, steg } = akse(maks);
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
    const form = h > 0 ? `<path class="${klasse}" d="M${f(x)} ${f(bunn)}V${f(bunn - h + r)}Q${f(x)} ${f(bunn - h)} ${f(x + r)} ${f(bunn - h)}H${f(x + bredde - r)}Q${f(x + bredde)} ${f(bunn - h)} ${f(x + bredde)} ${f(bunn - h + r)}V${f(bunn)}Z"/>` : "";
    ut += `<g class="s-stolpe"><title>${esc(`${ukedag(d.dag)} ${kortDato(d.dag)}: ${tall(v)}`)}</title><rect class="s-treff" x="${f(venstre + i * felt_)}" y="${oppe}" width="${f(felt_)}" height="${flateH}"/>${form}</g>`;
    if (merk.has(i)) {
      const tekst = tall(v);
      const halv = tekst.length * 3.2;
      const tx = Math.min(B - hoyre - halv, Math.max(venstre + halv, x + bredde / 2));
      ut += `<text class="s-verdi" x="${f(tx)}" y="${f(bunn - h - 4)}" text-anchor="middle">${esc(tekst)}</text>`;
    }
  });
  const xTekst = (i, anker) => `<text class="s-akse" x="${f(venstre + i * felt_ + felt_ / 2)}" y="${H - 6}" text-anchor="${anker}">${esc(serie.length <= 7 ? ukedag(serie[i].dag) : kortDato(serie[i].dag))}</text>`;
  if (serie.length <= 7) serie.forEach((_, i) => (ut += xTekst(i, "middle")));
  else ut += xTekst(0, "start") + xTekst(Math.floor(iSist / 2), "middle") + xTekst(iSist, "end");

  const beskrivelse = `${navn}, ${kortDato(serie[0].dag)} til ${kortDato(serie[iSist].dag)}. Høyest: ${tall(maks)} (${ukedag(serie[iMaks].dag)} ${kortDato(serie[iMaks].dag)}).`;
  return `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="${esc(beskrivelse)}">${ut}</svg>`;
}

// ---------- One period (a tab) ----------

function periodeTekst(p) {
  if (p.antallDager === 1) return `${ukedag(p.fra)} ${langDato(p.fra)}${p.id === "idag" ? " – dagen er ikke ferdig, så tallene vokser" : ""}`;
  return `${kortDato(p.fra)} til ${kortDato(p.til)} – ${p.antallDager} hele dager, til og med i går`;
}

function delBesok(p) {
  const enDag = p.antallDager === 1;
  const fliser = [
    enDag ? flis("Enheter innom", tall(p.enheter), "anslag") : flis("Enheter per dag", tall(p.enheterPerDag), "snitt, anslag"),
    flis("Besøk", tall(p.besok)),
    flis("Nye enheter", tall(p.nye), "første gang på rusj"),
    flis("Sider åpnet", tall(p.sider)),
  ].join("");
  let diagram = "";
  if (!enDag) {
    diagram =
      `<figure><figcaption>Enheter innom per dag</figcaption>${stolper(p.serie, "enheter", "s-enheter", "Enheter innom per dag")}</figure>` +
      `<figure><figcaption>Besøk per dag</figcaption>${stolper(p.serie, "besok", "s-besok", "Besøk per dag")}</figure>` +
      `<details><summary>Vis tallene dag for dag</summary><table><thead><tr><th scope="col">Dag</th><th scope="col">Enheter</th><th scope="col">Besøk</th></tr></thead><tbody>${p.serie
        .slice()
        .reverse()
        .map((d) => `<tr><td>${esc(`${ukedag(d.dag)} ${kortDato(d.dag)}`)}</td><td>${esc(tall(d.enheter))}</td><td>${esc(tall(d.besok))}</td></tr>`)
        .join("")}</tbody></table></details>`;
  }
  const tomt = p.sider === 0 && p.besok === 0 && p.enheter === 0 ? `<p class="tom">Ingen er talt i denne perioden.</p>` : "";
  return `<section class="kort"><h2>Hvor mange var innom?</h2>${tomt || `<dl class="fliser">${fliser}</dl>${diagram}`}</section>`;
}

function delTilbake(p) {
  const t = p.tilbake;
  if (p.enheter === 0) {
    return `<section class="kort"><h2>Kommer de tilbake?</h2><p class="tom">Ingen tall ennå. Dette fylles ut når enheter har vært innom – og «kom tilbake dagen etter» tidligst dagen etter at tellingen ble slått på.</p></section>`;
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
  return `<section class="kort"><h2>Kommer de tilbake?</h2><dl class="fliser">${fliser}</dl><h3>Når var enhetene sist innom?</h3>${liste}</section>`;
}

function delSpill(p) {
  if (p.spill.length === 0) {
    return `<section class="kort"><h2>Mest spilt</h2><p class="tom">Ingen spill er åpnet eller startet i denne perioden.</p></section>`;
  }
  const maks = Math.max(...p.spill.map((s) => s.startet), 0);
  const somRad = (s) => ({ navn: s.navn, antall: s.startet, ved: "startet", ekstra: `åpnet ${tall(s.apnet)} · spilt ferdig ${tall(s.ferdig)}` });
  const topp = p.spill.slice(0, 10).map(somRad);
  const resten = p.spill.slice(10).map(somRad);
  return (
    `<section class="kort"><h2>Mest spilt</h2><p class="periode-tekst">Rangert etter hvor mange ganger et spill ble startet.</p>${rader(topp, maks)}` +
    (resten.length ? `<details><summary>Vis de ${tall(resten.length)} andre spillene</summary>${rader(resten, maks)}</details>` : "") +
    `<p class="liten">Forsiden ble åpnet ${flertall(p.forside, "gang", "ganger")}.</p></section>`
  );
}

function delTid(p) {
  const t = p.tid;
  if (t.totalt === 0) {
    return `<section class="kort"><h2>Hvor lenge er de innom?</h2><p class="tom">Ingen besøk er talt i denne perioden.</p></section>`;
  }
  const m = t.median;
  const typisk = !m ? "" : m.over ? `over ${m.over} minutter` : m.minutter < 1 ? "under 1 minutt" : `ca. ${String(m.minutter >= 10 ? Math.round(m.minutter) : m.minutter).replace(".", ",")} ${m.minutter === 1 ? "minutt" : "minutter"}`;
  return (
    `<section class="kort"><h2>Hvor lenge er de innom?</h2>` +
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
    return `<section class="kort"><h2>Dagens rusj</h2><p class="tom">Ingen har fullført en av dagens oppgaver i denne perioden.</p></section>`;
  }
  const ord = ["én", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni"];
  const trinn = d.minst.map((m) => ({ navn: m.n === d.antallDaglige && m.n > 1 ? `Fullførte alle ${ord[m.n - 1] || m.n}` : `Fullførte minst ${ord[m.n - 1] || m.n}`, antall: m.antall }));
  return (
    `<section class="kort"><h2>Dagens rusj</h2>` +
    `<h3>Fullførte dagens oppgave</h3>${rader(d.spill.map((s) => ({ navn: s.navn, antall: s.fullfort })), Math.max(...d.spill.map((s) => s.fullfort), 0))}` +
    `<h3>Hvor mange av dagens oppgaver?</h3>${rader(trinn, d.minstEn)}` +
    `<h3>Dager på rad (for dem som fullførte minst én)</h3>${rader(d.rekker.map((r) => ({ navn: r.navn, antall: r.antall })), Math.max(...d.rekker.map((r) => r.antall), 0))}` +
    (p.antallDager > 1 ? `<p class="liten">Over flere dager telles en enhet én gang per dag den fullfører.</p>` : "") +
    `</section>`
  );
}

function delApp(p) {
  const a = p.app;
  const innhold = a.av === 0 ? `<p class="tom">Ingen enheter er talt i denne perioden.</p>` : `<p><b>${esc(tall(a.antall))} av ${esc(tall(a.av))}</b> enheter (${esc(pst(a.prosent))}) åpnet rusj fra hjemskjermen, altså som en app.</p>`;
  return `<section class="kort"><h2>Lagt til på hjemskjermen</h2>${innhold}</section>`;
}

const panel = (p) => `<div class="panel panel-${p.id}"><p class="periode-tekst">${esc(periodeTekst(p))}</p>${delBesok(p)}${delTilbake(p)}${delSpill(p)}${delTid(p)}${delDaglig(p)}${delApp(p)}</div>`;

// ---------- The dashboard ----------

const HJELP = `<section class="kort"><details><summary>Slik leser du tallene</summary><dl class="hjelp">
<dt>Enhet</dt><dd>Én mobil, ett nettbrett eller én PC – egentlig én nettleser. Samme person på to mobiler telles to ganger, og en privat fane telles som ny hver gang. Derfor er tallene anslag.</dd>
<dt>Besøk</dt><dd>Én økt på rusj. Er det stille i 30 minutter, telles neste gang som et nytt besøk.</dd>
<dt>Ikke alle telles</dt><dd>De som har bedt nettleseren om ikke å bli sporet, eller bruker datasparing, sender ingenting. Spilling uten nett telles heller ikke. De ekte tallene er altså litt høyere.</dd>
<dt>Ingen personer</dt><dd>Tallene inneholder ingen navn, ID-er eller IP-adresser. Enheten husker selv når den sist var innom, og melder bare «i går», «siste uke» eller «lenge siden». Vi kan ikke følge noen fra dag til dag.</dd>
<dt>Flere dager</dt><dd>«Enheter per dag» er et snitt. Tallene for uke og måned øverst er derimot ulike enheter, fordi hver enhet melder fra én gang per uke og én gang per måned.</dd>
<dt>De første ukene</dt><dd>Rett etter at tellingen er slått på, telles alle som «første gang», fordi ingen enhet er talt før.</dd>
<dt>Sletting</dt><dd>Tall som er eldre enn ${OPPBEVARING_MND} måneder, slettes automatisk.</dd>
</dl></details></section>`;

// innlogging: "access" (Cloudflare Access) or "nokkel" (the admin key).
export function tavle(data, { klokke, innlogging }) {
  const kal = data.kalender;
  const noeIKalender = kal.some((k) => k.enheter > 0);
  const start = data.forsteDag ? `<p class="liten">Tellingen har tall fra og med ${esc(langDato(data.forsteDag))} ${esc(data.forsteDag.slice(0, 4))}.</p>` : "";
  const loggUt = innlogging === "access" ? `<a href="/cdn-cgi/access/logout">Logg ut</a>` : `<button type="button" class="lenke" data-logg-ut>Logg ut</button>`;
  return `<main id="innhold">
<section class="hoved"><h1 class="setning">${uthev(data.setning)}</h1>${data.hittil ? `<p class="hittil">${esc(data.hittil)}</p>` : ""}</section>
<section class="kort"><h2>Hvor mange bruker rusj?</h2>${
    noeIKalender
      ? `<dl class="fliser fire">${kal.map((k) => flis(k.navn, tall(k.enheter))).join("")}</dl><p class="liten">Ulike enheter som var innom minst én gang i perioden. Anslag.</p>`
      : `<p class="tom">Ingen enheter er talt ennå. Tallene for uke og måned kommer her.</p>`
  }${start}</section>
<div class="perioder">
<input type="radio" name="periode" id="p-idag"><input type="radio" name="periode" id="p-igar"><input type="radio" name="periode" id="p-d7" checked><input type="radio" name="periode" id="p-d30">
<div class="faner"><label for="p-idag">I dag</label><label for="p-igar">I går</label><label for="p-d7">7 dager</label><label for="p-d30">30 dager</label></div>
${data.perioder.map(panel).join("\n")}
</div>
${HJELP}
<p class="liten">Hentet kl. ${esc(klokke)}. <a href="/admin">Hent på nytt</a> · ${loggUt}</p>
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
const INN_SKRIPT = `(function(){
"use strict";
var LAGER="rusj-admin";
function les(){try{return sessionStorage.getItem(LAGER)||""}catch(e){return ""}}
function glem(){try{sessionStorage.removeItem(LAGER)}catch(e){}}
function si(t){var s=document.getElementById("status");if(s)s.textContent=t}
function hent(nokkel,fraSkjema){
si("Henter tallene …");
fetch("/admin",{headers:{"X-Admin-Nokkel":nokkel},cache:"no-store",credentials:"same-origin",redirect:"error"}).then(function(svar){
if(svar.status===401)throw new Error("feil");
if(!svar.ok)throw new Error("nede");
return svar.text();
}).then(function(html){
var fra=html.indexOf('<main id="innhold">'),til=html.lastIndexOf("</main>");
if(fra<0||til<fra)throw new Error("nede");
var ny=new DOMParser().parseFromString(html.slice(fra,til+7),"text/html").getElementById("innhold");
if(!ny)throw new Error("nede");
try{sessionStorage.setItem(LAGER,nokkel)}catch(e){}
document.getElementById("innhold").replaceWith(document.importNode(ny,true));
}).catch(function(e){
if(e&&e.message==="feil"){glem();si(fraSkjema?"Nøkkelen stemmer ikke. Prøv igjen.":"")}
else si("Fikk ikke hentet tallene. Prøv igjen om litt.");
});
}
document.addEventListener("submit",function(e){
if(!e.target||e.target.id!=="inn")return;
e.preventDefault();
var n=document.getElementById("nokkel").value.trim();
if(n)hent(n,true);
});
document.addEventListener("click",function(e){
if(e.target&&e.target.closest&&e.target.closest("[data-logg-ut]")){glem();location.reload()}
});
var lagret=les();
if(lagret)hent(lagret,false);
})();`;

// ---------- The whole page ----------

// data: the summary (when logged in) or null (the login page). nonce: for the inline style/script.
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
<title>rusj – tallene</title>
<style nonce="${esc(nonce)}">${STIL}</style>
</head>
<body>
<div class="ramme">
<header class="topp"><p class="merke">rusj<span>tallene</span></p></header>
${hoved}
</div>
${skript}
</body>
</html>`;
}
