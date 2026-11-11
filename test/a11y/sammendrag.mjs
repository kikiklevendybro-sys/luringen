// rusj a11y — turns the findings of a run (test/rusj-e2e.mjs --a11y <dir>: one file per page in
// <dir>/funn/) into a ranked, de-duplicated list. The same finding on the same kind of element is
// one row, with the games and screens it was seen on. It also prints the key numbers to compare
// two runs: focus hidden behind something, focus lost after a click, and contrast pairs.
// Usage: node test/a11y/sammendrag.mjs <dir>   → writes <dir>/sammendrag.md and <dir>/sammendrag.json
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REGLER } from "./a11y.mjs";

const HER = dirname(fileURLToPath(import.meta.url));
const ROT = join(HER, "../..");
const args = process.argv.slice(2);
if (!args[0] || !existsSync(join(resolve(args[0]), "funn"))) {
  console.error("Bruk: node test/a11y/sammendrag.mjs <dir>  (mappa fra test/rusj-e2e.mjs --a11y <dir>)");
  process.exit(1);
}
const INN = resolve(args[0]);
const UT = join(INN, "sammendrag");
const les = (fil, std) => {
  try {
    return JSON.parse(readFileSync(fil, "utf8"));
  } catch (e) {
    return std;
  }
};
const data = { meta: les(join(INN, "meta.json"), {}), spill: {} };
for (const fil of readdirSync(join(INN, "funn")).filter((f) => f.endsWith(".json")).sort()) data.spill[fil.replace(/\.json$/, "")] = les(join(INN, "funn", fil), { skjermer: [] });

// Where a finding belongs: the kit (fix once), the front page, Luringen, or one game.
// A selector is the kit's when its class or id is defined in the kit's stylesheet or page template.
const klasser = (fil) => new Set(Array.from(readFileSync(join(ROT, fil), "utf8").matchAll(/\.(-?[a-zA-Z_][\w-]*)/g), (m) => m[1]));
const KIT = klasser("rusj/kit/rusj.css");
const KIT_ID = new Set(["tilportal", "tilbake", "topp-tittel", "reglerknapp", "lydknapp", "hoved", "skjerm", "ark", "ark-innhold", "ark-tittel", "nedtelling", "konfetti", "toast", "si", "skjerm-tittel", "spillerboks", "navn-N", "flere-tittel"]);
function hjemme(id, f) {
  if (id === "forside") return "FORSIDE";
  if (id === "luringen") return "LURINGEN";
  // Focus hidden behind something: the thing in front is the cause, whatever control is behind it.
  if (/^fokus-(delvis-)?skjult$/.test(f.regel) && f.av) f = { sig: f.av, sti: "" };
  const deler = (f.sig + " " + (f.sti || "")).match(/[.#][\w-]+/g) || [];
  const egne = (f.sig.match(/[.#][\w-]+/g) || []).filter((d) => !/^\.(liten|stor|rosa|mynte|lampe|lilla|himmel|rod|papir|aksent|vis|inn|apen|ut)$/.test(d));
  const iKit = (d) => (d[0] === "#" ? KIT_ID.has(d.slice(1)) : KIT.has(d.slice(1)));
  // The element's own names decide; an element without any is judged by where it sits.
  if (egne.length) return egne.some((d) => !iKit(d)) ? "SPILL" : "KIT";
  return deler.length && deler.every(iKit) ? "KIT" : deler.length ? "SPILL" : "KIT";
}

const rader = new Map();
const leggTil = (id, skjerm, f) => {
  const [wcag, alvor, hva] = REGLER[f.regel] || ["?", 5, f.regel];
  const sted = hjemme(id, f);
  // Game-specific findings are one row per game; kit findings are one row for all games.
  // What makes two findings "the same": for focus hidden behind something, the thing in front (not
  // each control behind it); for contrast, the element and its text colour (the background follows
  // the game's accent colour); otherwise the element.
  const hva2 = /^fokus-(delvis-)?skjult$/.test(f.regel) ? "bak " + f.av : f.regel.startsWith("kontrast") ? f.sig + (f.del || "") + (f.fg || "") + (sted === "KIT" ? "" : f.bg || "") : f.sig;
  const nokkel = [f.regel, sted === "SPILL" ? id : sted, hva2, f.regel === "navn-bare-symbol" ? f.navn : "", f.regel === "engelsk-mistenkt" ? f.ord : ""].join("|");
  let r = rader.get(nokkel);
  if (!r) rader.set(nokkel, (r = { regel: f.regel, wcag, alvor, hva, sted, sig: f.sig, sti: f.sti, spill: new Map(), elementer: new Set(), forekomster: 0, eksempel: f, verst: null }));
  r.elementer.add(f.sig);
  r.forekomster += f.antall || 1;
  if (!r.spill.has(id)) r.spill.set(id, new Set());
  r.spill.get(id).add(skjerm);
  // Keep the worst case as the example: lowest contrast, smallest target.
  const mal = f.forhold != null ? f.forhold : f.b != null && f.h != null ? Math.min(f.b, f.h) : null;
  if (mal != null && (r.verst == null || mal < r.verst)) {
    r.verst = mal;
    r.eksempel = f;
  }
};

let skjermer = 0;
const flyt = [];
for (const [id, g] of Object.entries(data.spill)) {
  for (const s of g.skjermer) {
    skjermer++;
    if (s.feil) flyt.push(`${id} «${s.navn}»: sjekken feilet (${s.feil})`);
    for (const f of [...s.funn, ...s.usikre]) leggTil(id, s.navn, f);
  }
  // What the scripted clicks showed: steps a keyboard cannot take, and focus that is dropped.
  for (const k of g.klikk || []) {
    const felles = { sig: k.sig, sti: k.sti, tekst: k.tekst };
    // (A test may click a hidden copy of a button: nobody can press that one, with or without a keyboard.)
    if ((!k.tabbar || !k.innfodt) && k.synlig !== false) leggTil(id, k.skjerm, { regel: "e2e-klikk-uten-tastatur", ...felles, antall: k.antall, innfodt: k.innfodt, tabbar: k.tabbar });
    if (k.tapt) leggTil(id, k.skjerm, { regel: "fokus-tapt", ...felles, antall: k.tapt, av: k.antall, ...(k.varig != null ? { varig: k.varig } : {}) });
  }
  for (const k of g.gester || []) if (!k.innfodt) leggTil(id, k.skjerm, { regel: "e2e-gest", sig: k.sig, sti: k.sti, tekst: k.tekst, antall: k.antall, gest: k.type, touchAction: k.touchAction });
  for (const f of g.feil || []) flyt.push(`${id}: ${f}`);
}

const liste = Array.from(rader.values())
  .map((r) => ({ ...r, elementer: Array.from(r.elementer), antallSpill: r.spill.size, antallSkjermer: Array.from(r.spill.values()).reduce((s, x) => s + x.size, 0), spill: Object.fromEntries(Array.from(r.spill, ([id, s]) => [id, Array.from(s)])) }))
  .sort((a, b) => a.alvor - b.alvor || b.antallSpill - a.antallSpill || b.antallSkjermer - a.antallSkjermer || a.regel.localeCompare(b.regel));

const ALVOR = ["", "Blocker", "Serious", "Moderate", "Minor", "Note"];
const detalj = (f) =>
  Object.entries(f)
    .filter(([k]) => !["regel", "sig", "sti", "tekst", "boks", "antall", "nokkel"].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
const md = [`# rusj a11y — automated findings`, ``, `${Object.keys(data.spill).length} pages, ${skjermer} screens, ${data.meta.bredde}×${data.meta.hoyde}, ${data.meta.dato}. Source: ${data.meta.web}`, ``];
for (const sted of ["KIT", "FORSIDE", "LURINGEN", "SPILL"]) {
  const del = liste.filter((r) => r.sted === sted);
  if (!del.length) continue;
  md.push(`## ${sted} (${del.length})`, ``, `| Severity | Rule (WCAG) | Element | Seen | Example |`, `|---|---|---|---|---|`);
  for (const r of del) {
    const hvor = r.antallSpill > 3 ? `${r.antallSpill} games, ${r.antallSkjermer} screens` : Object.entries(r.spill).map(([id, s]) => `${id} (${s.slice(0, 3).join(", ")}${s.length > 3 ? ` +${s.length - 3}` : ""})`).join("; ");
    const celle = (t) => String(t).replace(/\|/g, "\\|").replace(/\n/g, " ");
    md.push(`| ${ALVOR[r.alvor]} | ${r.regel} · ${r.wcag} | ${r.elementer.length > 1 ? `${r.elementer.length} kinds of element, e.g. ` : ""}\`${celle(r.eksempel.sig)}\`${r.eksempel.sti ? ` in \`${celle(r.eksempel.sti)}\`` : ""} | ${hvor}${r.forekomster > r.antallSkjermer ? ` · ${r.forekomster}×` : ""} | ${celle(`«${r.eksempel.tekst || ""}» ${detalj(r.eksempel)}`)} |`);
  }
  md.push(``);
}
if (flyt.length) md.push(`## Test run notes`, ``, ...flyt.map((f) => `- ${f}`), ``);

// Key numbers, to compare one run with another (straight counts over every screen, not de-duplicated
// by kind): controls hidden when they get focus, clicks after which nothing had focus, text/background
// pairs below the contrast limit, live regions that arrived with their text already in them.
const tall = { sider: Object.keys(data.spill).length, skjermer, fokusSkjult: 0, fokusSkjultSkjermer: 0, fokusDelvisSkjult: 0, klikk: 0, fokusTapt: 0, fokusTaptVarig: 0, kontrastPar: 0, kontrastSkjermer: 0, kontrastElementer: 0 };
const par = new Set();
for (const g of Object.values(data.spill)) {
  for (const s of g.skjermer || []) {
    const skjult = (s.funn || []).filter((f) => f.regel === "fokus-skjult").reduce((n, f) => n + (f.antall || 1), 0);
    tall.fokusSkjult += skjult;
    if (skjult) tall.fokusSkjultSkjermer++;
    tall.fokusDelvisSkjult += (s.funn || []).filter((f) => f.regel === "fokus-delvis-skjult").reduce((n, f) => n + (f.antall || 1), 0);
    const kontrast = (s.funn || []).filter((f) => f.regel === "kontrast");
    if (kontrast.length) tall.kontrastSkjermer++;
    for (const f of kontrast) {
      tall.kontrastElementer += f.antall || 1;
      par.add((f.fg || "?") + " på " + (f.bg || "?"));
    }
  }
  for (const k of g.klikk || []) {
    tall.klikk += k.antall || 0;
    tall.fokusTapt += k.tapt || 0;
    tall.fokusTaptVarig += k.varig || 0;
  }
}
tall.kontrastPar = par.size;
md.push(`## Key numbers`, ``, ...Object.entries(tall).map(([k, v]) => `- ${k}: ${v}`), ``);
writeFileSync(UT + ".md", md.join("\n"));
writeFileSync(UT + ".json", JSON.stringify({ meta: data.meta, spill: Object.keys(data.spill).length, skjermer, tall, flyt, funn: liste }, null, 1));

const antall = (a) => liste.filter((r) => r.alvor === a).length;
console.log(`${liste.length} ulike funn (${[1, 2, 3, 4, 5].map((a) => `${ALVOR[a]}: ${antall(a)}`).join(", ")}) fra ${skjermer} skjermer på ${tall.sider} sider`);
console.log(`Fokus skjult: ${tall.fokusSkjult} kontroller på ${tall.fokusSkjultSkjermer} skjermer (delvis: ${tall.fokusDelvisSkjult}) · fokus tapt: ${tall.fokusTapt} av ${tall.klikk} klikk (varig: ${tall.fokusTaptVarig}) · kontrast: ${tall.kontrastPar} par, ${tall.kontrastElementer} tekster på ${tall.kontrastSkjermer} skjermer`);
console.log(`→ ${UT}.md og ${UT}.json`);
