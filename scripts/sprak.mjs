#!/usr/bin/env node
// Languages on rusj.no (see rusj/SPRAK.md). Norwegian lives at the root; every other edition lives
// under /<lang>/ and is built from the same code with text tables keyed by the Norwegian text
// (gettext style): R.t("Gjør klart") in a game, t("Alle spill") in the build's page templates.
//
// This file holds
//   - the facts of each edition (locale, time zone, addresses of the fixed pages),
//   - lagT(): the translation function for Node, the same rules as R.t in rusj/kit/rusj.js
//     (test/sprak.test.mjs holds the two to the same answers),
//   - the checker: it reads every R.t("…") / t("…") / R.flertall(n, "…", "…") in the kit, the front
//     page, the page templates and each game, and fails when a table misses a key or has one nobody
//     uses, and it points at Norwegian-looking text that is not wrapped yet.
// Run alone: node scripts/sprak.mjs [--spill id] [--sprak en] [--alle]
//   (--alle also lists the unwrapped strings in the kit and the front page, which are only warnings)
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROT_HER = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// The rules of t() live in one file for the front page and the build (rusj/kit/tekst.js).
const RusjTekst = require(join(ROT_HER, "rusj/kit/tekst.js"));

// ---------- The editions ----------

export const SPRAK = ["en", "da"]; // the editions besides Norwegian, in the order of the language switch
export const ALLE_SPRAK = ["nb", ...SPRAK];
const EKSTRA = { nb: { og: "nb_NO", navn: "Norsk" }, en: { og: "en_GB", navn: "English" }, da: { og: "da_DK", navn: "Dansk" } };
// { lokale, tidssone, forside, sider: { personvern, om, merker }, og (og:locale), navn (in the switch) }
export const SPRAK_INFO = Object.fromEntries(ALLE_SPRAK.map((s) => [s, { ...RusjTekst.SPRAK[s], ...EKSTRA[s] }]));

// ---------- Translation (the same rules as R.t in the kit) ----------

const har = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

// Puts {name} values into a text. Values go in as text: escaping stays the caller's job.
export function settInn(tekst, verdier) {
  if (!verdier) return String(tekst);
  return String(tekst).replace(/\{(\w+)\}/g, (hele, k) => (har(verdier, k) ? String(verdier[k]) : hele));
}

// Everything t() needs for one edition: { t, flertall, ramsOpp, tall, side, forside, … }. The
// tables are searched in order (a game's own table first). Norwegian, or a key no table has: the
// key itself. A key "{n} runde|{n} runder" holds the Norwegian singular and plural; a table value
// may be a text or { one, other, … } by Intl.PluralRules of the edition's locale, chosen by verdier.n.
export const lagSprak = (sprak, ...tabeller) => RusjTekst.lag(sprak, () => tabeller);
export const lagT = (sprak, ...tabeller) => lagSprak(sprak, ...tabeller).t;

// Reads a table (missing file → null). Keys starting with "_" are notes for translators.
export function lesTabell(fil) {
  if (!existsSync(fil)) return null;
  let tab;
  try {
    tab = JSON.parse(readFileSync(fil, "utf8"));
  } catch (e) {
    throw new Error(`${fil}: ugyldig JSON (${e.message})`);
  }
  const ut = {};
  for (const [k, v] of Object.entries(tab)) if (!k.startsWith("_")) ut[k] = v;
  return ut;
}

// ---------- Reading JavaScript: string literals and where they stand ----------

const ORD_FOR_REGEX = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "instanceof"]);

function avkod(raa) {
  return raa.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (h, e) => {
    if (e[0] === "u" && e[1] === "{") return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === "u" && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === "x" && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0", "\n": "", "\r\n": "" }[e] ?? e;
  });
}

// Every string literal and every piece of text in a template literal, with its position:
// [{ start, slutt, tekst, mal (true = a template), uttrykk (true = a template with ${}), del (the
// piece's index in its template) }]. Comments and regular expressions are skipped.
export function strenger(kilde) {
  const ut = [];
  let i = 0;
  let forrige = ""; // the last significant character or word: decides whether "/" starts a regex
  const n = kilde.length;
  const hoppKommentar = () => {
    if (kilde[i] === "/" && kilde[i + 1] === "/") {
      while (i < n && kilde[i] !== "\n") i++;
      return true;
    }
    if (kilde[i] === "/" && kilde[i + 1] === "*") {
      const e = kilde.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      return true;
    }
    return false;
  };
  const streng = (q) => {
    const start = i;
    i++;
    let raa = "";
    while (i < n && kilde[i] !== q) {
      if (kilde[i] === "\\") {
        raa += kilde[i] + kilde[i + 1];
        i += 2;
      } else raa += kilde[i++];
    }
    i++;
    ut.push({ start, slutt: i, tekst: avkod(raa), mal: false });
    forrige = "a";
  };
  const regex = () => {
    i++;
    let klasse = false;
    while (i < n) {
      const c = kilde[i];
      if (c === "\\") i += 2;
      else if (c === "[") (klasse = true), i++;
      else if (c === "]") (klasse = false), i++;
      else if (c === "/" && !klasse) break;
      else if (c === "\n") break;
      else i++;
    }
    i++;
    while (i < n && /[a-z]/i.test(kilde[i])) i++;
    forrige = "a";
  };
  // A template: its text pieces become entries; the code in ${…} is read like any other code.
  const mal = () => {
    const start = i;
    i++;
    const deler = [];
    let raa = "";
    let delStart = i;
    let uttrykk = false;
    const lukkDel = () => {
      deler.push({ start: delStart, slutt: i, tekst: avkod(raa) });
      raa = "";
    };
    while (i < n && kilde[i] !== "`") {
      if (kilde[i] === "\\") {
        raa += kilde[i] + kilde[i + 1];
        i += 2;
      } else if (kilde[i] === "$" && kilde[i + 1] === "{") {
        uttrykk = true;
        lukkDel();
        i += 2;
        kode("}");
        i++;
        delStart = i;
      } else raa += kilde[i++];
    }
    lukkDel();
    i++;
    deler.forEach((d, k) => ut.push({ ...d, mal: true, uttrykk, del: k, malStart: start, malSlutt: i }));
    forrige = "a";
  };
  // Code until the closing character `slutt` at depth 0 (or the end).
  function kode(slutt) {
    let dybde = 0;
    while (i < n) {
      const c = kilde[i];
      if (hoppKommentar()) continue;
      if (c === '"' || c === "'") streng(c);
      else if (c === "`") mal();
      else if (c === "/") {
        if (/[(,=:[!&|?{};+\-*%<>~^]/.test(forrige) || forrige === "" || ORD_FOR_REGEX.has(forrige)) regex();
        else {
          forrige = "/";
          i++;
        }
      } else if (c === "{" || c === "(" || c === "[") {
        dybde++;
        forrige = c;
        i++;
      } else if (c === "}" || c === ")" || c === "]") {
        if (c === slutt && dybde === 0) return;
        dybde--;
        forrige = c === "}" ? "}" : "a";
        i++;
      } else if (/\s/.test(c)) i++;
      else if (/[\w$]/.test(c)) {
        let ord = "";
        while (i < n && /[\w$]/.test(kilde[i])) ord += kilde[i++];
        forrige = ORD_FOR_REGEX.has(ord) ? ord : "a";
      } else {
        forrige = c;
        i++;
      }
    }
  }
  kode(null);
  return ut;
}

// The keys a source asks for, and the literals that are keys (by start position).
// Calls: R.t("…") / Rusj.t("…") / t("…") (build templates) / N_("…") (marks a key without
// translating it), and R.flertall(n, "en", "flere") (the key "en|flere").
export function nokler(kilde, alle = strenger(kilde)) {
  const funnet = new Map(); // key -> first line
  const somNokkel = new Set(); // start positions of literals that are keys
  const feil = [];
  const linje = (pos) => kilde.slice(0, pos).split("\n").length;
  const forStart = new Map(alle.filter((s) => !s.mal || s.del === 0).map((s) => [s.mal ? s.malStart : s.start, s]));
  const KALL = /(?:^|[^\w$.])(?:[A-Z]\w*\.(?:t|th)|t|th|N_)\(\s*$/;
  for (const s of alle) {
    const st = s.mal ? s.malStart : s.start;
    if (s.mal && s.del !== 0) continue;
    if (!KALL.test(kilde.slice(Math.max(0, st - 24), st))) continue;
    if (s.uttrykk) {
      feil.push(`linje ${linje(st)}: nøkkelen i t(\`…\`) har \${…} – skriv {navn} og gi verdien i andre argument`);
      continue;
    }
    if (!funnet.has(s.tekst)) funnet.set(s.tekst, linje(st));
    somNokkel.add(st);
  }
  // R.flertall(n, "en", "flere"): the second and third arguments.
  const lit = String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`;
  const re = new RegExp(String.raw`[A-Z]\w*\.flertall\(([^,;]*?),\s*` + lit + String.raw`\s*,\s*` + lit + String.raw`\s*\)`, "g");
  for (const m of kilde.matchAll(re)) {
    const a = m.index + m[0].indexOf(m[2], m[0].indexOf("(") + 1 + m[1].length);
    const b = m.index + m[0].lastIndexOf(m[3]);
    const sa = forStart.get(a);
    const sb = forStart.get(b);
    if (!sa || !sb) continue;
    const k = `${sa.tekst}|${sb.tekst}`;
    if (!funnet.has(k)) funnet.set(k, linje(a));
    somNokkel.add(a);
    somNokkel.add(b);
  }
  // A key that is not a literal can't be checked.
  const dynamisk = [];
  for (const m of kilde.matchAll(/(?:^|[^\w$.])(?:R|Rusj)\.t\(\s*(?=[^\s"'`)])/g)) dynamisk.push(linje(m.index + m[0].length));
  for (const m of kilde.matchAll(/[A-Z]\w*\.flertall\(([^,;]*?),\s*(?=[^\s"'])/g)) dynamisk.push(linje(m.index));
  return { funnet, somNokkel, feil, dynamisk };
}

// ---------- Does a text look like Norwegian UI text? ----------

const NORSKE_ORD = new Set(
  ("og ikke er på til med som har kan vil det et av du dere deg din ditt dine jeg meg vi oss hva hvem hvor når nå ny nytt nye igjen " +
    "spill spillet spiller spillere spillerne mobilen runde runder trekk poeng vinner vant tapte uavgjort alle ingen mot fra eller så også " +
    "skal må får trykk velg slipp prøv nivå lett middels vanskelig neste forrige ferdig tilbake avslutt fortsett angre lukk start gjør klart " +
    "seier seirer kåringen sekund sekunder minutter tur din hvit svart rød gul blå grønn rosa").split(" "),
);
const ENKELTORD = new Set("angre avslutt lukk neste ferdig fortsett tilbake regler poeng runde seier uavgjort vinner kåringen igjen ja nei spill mobilen trekk nivå".split(" "));

// The readable text of a piece of markup: text between tags and the values of attributes a person reads.
function lesbar(tekst) {
  const attr = [...tekst.matchAll(/(?:aria-label|aria-description|title|placeholder|alt|data-tittel)="([^"]*)"/g)].map((m) => m[1]);
  const kropp = tekst
    .replace(/<[^>]*>/g, " ")
    .replace(/^[^<>]*"[^<>]*>/, " ") // the end of a tag that began before this piece
    .replace(/<[a-z/][^>]*$/i, " ") // a tag that ends after it
    .replace(/&[#\w]+;/g, " ");
  return [kropp, ...attr].join(" ").replace(/\s+/g, " ").trim();
}

export function serNorskUt(raa) {
  const tekst = lesbar(raa);
  if (!/[A-Za-zÆØÅæøå]{2,}/.test(tekst)) return false;
  // Code, not text: identifiers, selectors, CSS, URLs, file names, keys.
  if (/^[\w$.#:\-[\]=*>+~,()'" /%]*$/.test(tekst) && !/\s/.test(tekst.trim()) && !/[æøå]/i.test(tekst)) {
    return ENKELTORD.has(tekst.toLocaleLowerCase("nb")) && /^[A-ZÆØÅ]/.test(tekst);
  }
  if (/^(https?:|\/|\.\/|rusj\.|data:|#)/.test(tekst) || /[{};]\s*$/.test(tekst) && /:/.test(tekst)) return false;
  if (/[æøåÆØÅ]/.test(tekst)) return true;
  const ord = tekst.toLocaleLowerCase("nb").match(/[a-zæøå]+/g) || [];
  return ord.length >= 2 && ord.some((o) => NORSKE_ORD.has(o));
}

// Literals in a source that look like Norwegian UI text and are not keys. A line with
// «sprak-ok» in a comment is skipped (code, a developer message, a word that is the same in every
// language). Messages to developers (console.*, throw new Error) are skipped.
export function uoversatt(kilde, alle = strenger(kilde), somNokkel = nokler(kilde, alle).somNokkel) {
  const linjer = kilde.split("\n");
  const linjeAv = (pos) => kilde.slice(0, pos).split("\n").length;
  const ut = [];
  const sett = new Set();
  for (const s of alle) {
    const st = s.mal ? s.malStart : s.start;
    if (somNokkel.has(st)) continue;
    const ln = linjeAv(s.start);
    const l = linjer[ln - 1] || "";
    if (/sprak-ok/.test(l) || /sprak-ok/.test(linjer[ln - 2] || "") && /^\s*\/\/.*sprak-ok/.test(linjer[ln - 2])) continue;
    const foran = kilde.slice(Math.max(0, st - 40), st);
    if (/(console\.\w+|new Error|throw new \w+)\(\s*$/.test(foran)) continue;
    if (/(querySelector(All)?|getElementById|matches|closest|classList\.\w+|\$\$?|getItem|setItem|removeItem|addEventListener|getAttribute|setAttribute|hasAttribute|removeAttribute)\(\s*$/.test(foran)) continue;
    if (!serNorskUt(s.tekst)) continue;
    const nokkel = `${ln}:${s.tekst}`;
    if (sett.has(nokkel)) continue;
    sett.add(nokkel);
    ut.push({ linje: ln, tekst: lesbar(s.tekst).slice(0, 80) });
  }
  return ut;
}

// ---------- The checker ----------

// The shared table (rusj/kit/tekst.<lang>.json) covers these sources and the sticker catalogue.
export const FELLES_KILDER = [
  "rusj/kit/rusj.js",
  "rusj/portal/portal.js",
  "rusj/portal/daglig.js",
  "rusj/portal/merkebok.js",
  "rusj/portal/sider.js",
  "scripts/rusj.mjs",
  "scripts/om-spillet.mjs",
  "scripts/bygg.mjs",
];

// The stickers of an edition (rusj/merker.json): those for a game that is published in it, and
// those its games can give. spill: the edition's games ({ id, tagger, alder18, spillere }).
export function merkerIUtgave(katalog, spill) {
  const ider = new Set(spill.map((g) => g.id));
  const vanlige = spill.filter((g) => !g.alder18);
  const daglige = vanlige.some((g) => g.tagger.includes("daglig"));
  const spillFor = (mk) => mk.regel.spill || (mk.regel.type === "merke" ? (mk.id.startsWith("luke-") ? "julekalenderen" : mk.figur || mk.id.replace(/^klassiker-/, "")) : null);
  const merker = katalog.merker.filter((mk) => {
    const r = mk.regel;
    const g = spillFor(mk);
    if (g) return ider.has(g);
    if (["dager", "rekke", "alleIdag"].includes(r.type)) return daglige;
    if (r.type === "provd") return r.n === "alle" ? vanlige.length > 1 : Number(r.n) <= vanlige.length;
    if (r.type === "provdTagg") return vanlige.some((x) => x.tagger.includes(r.tagg));
    // the evening scoreboard: games for several, and for as many as the sticker asks
    if (r.type === "kveldFolk") return vanlige.some((x) => !x.spillere || x.spillere[1] >= r.n);
    if (r.type === "kveldSpill" || r.type === "kronet") return vanlige.some((x) => !x.spillere || x.spillere[1] >= 2);
    return true;
  });
  return { ...katalog, grupper: katalog.grupper.filter((gr) => merker.some((mk) => mk.gruppe === gr.id)), merker };
}

// Keys the shared table must have that live in data, not in code: the sticker book. With spill:
// only the stickers of that edition (the rest may wait in the table until their game comes).
export function katalogNokler(rot, spill = null) {
  const fil = join(rot, "rusj/merker.json");
  const ut = new Map();
  if (!existsSync(fil)) return ut;
  let k = JSON.parse(readFileSync(fil, "utf8"));
  if (spill) k = merkerIUtgave(k, spill);
  for (const g of k.grupper || []) for (const f of ["navn", "tekst"]) if (g[f]) ut.set(g[f], `merker.json ${g.id}`);
  for (const m of k.merker || []) for (const f of ["navn", "hvordan", "tekst"]) if (m[f]) ut.set(m[f], `merker.json ${m.id}`);
  return ut;
}

const plassholdere = (t) => new Set([...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

// Compares a table with the keys the code asks for. Returns error lines.
// tillatt: keys that may stay in the table although nothing asks for them yet.
export function sjekkTabell({ navn, tabell, krevd, sprak, tillatt = null }) {
  const feil = [];
  if (!tabell) return [`${navn} finnes ikke (${krevd.size} nøkler)`];
  const former = new Set(["zero", "one", "two", "few", "many", "other"]);
  for (const [k, hvor] of krevd) {
    if (!har(tabell, k)) {
      feil.push(`${navn}: mangler «${k}» (${hvor})`);
      continue;
    }
    const v = tabell[k];
    const verdier = typeof v === "string" ? [v] : v && typeof v === "object" && typeof v.other === "string" ? Object.values(v) : null;
    if (!verdier || verdier.some((x) => typeof x !== "string")) {
      feil.push(`${navn}: «${k}» skal være en tekst eller { "one": …, "other": … }`);
      continue;
    }
    if (typeof v === "object") for (const f of Object.keys(v)) if (!former.has(f)) feil.push(`${navn}: «${k}» har ukjent flertallsform «${f}»`);
    if (!verdier.every((x) => x.trim())) feil.push(`${navn}: «${k}» er tom`);
    const inn = plassholdere(k);
    for (const x of verdier) {
      for (const p of plassholdere(x)) if (!inn.has(p)) feil.push(`${navn}: «${k}» → «${x}» har {${p}}, som nøkkelen ikke har`);
      for (const p of inn) if (!plassholdere(x).has(p) && !(p === "n" && typeof v === "object")) feil.push(`${navn}: «${k}» → «${x}» mangler {${p}}`);
    }
  }
  for (const k of Object.keys(tabell)) if (!krevd.has(k) && !(tillatt && tillatt.has(k))) feil.push(`${navn}: «${k}» brukes ikke lenger (slett den)`);
  void sprak;
  return feil;
}

// The keys of the shared sources: Map(key → "file:line").
export function felleskrav(rot) {
  const krevd = new Map();
  const varsler = [];
  for (const rel of FELLES_KILDER) {
    const fil = join(rot, rel);
    if (!existsSync(fil)) continue;
    const kilde = readFileSync(fil, "utf8");
    const alle = strenger(kilde);
    const n = nokler(kilde, alle);
    for (const [k, l] of n.funnet) if (!krevd.has(k)) krevd.set(k, `${rel}:${l}`);
    for (const f of n.feil) varsler.push(`${rel} ${f}`);
    for (const u of uoversatt(kilde, alle, n.somNokkel)) varsler.push(`${rel}:${u.linje} ikke oversatt: «${u.tekst}»`);
  }
  return { krevd, varsler };
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const I18N_FELT = ["navn", "undertittel", "kort", "beskrivelse", "slug", "sok"];

// One game in one language. Returns { publiseres, feil, varsler, krevd }.
// A game is published in a language when spill.json has i18n.<lang>, its data.<lang>/ has every
// file of data/, and nothing is wrong (a wrong or incomplete one stops the build).
// A key the shared table (rusj/kit/tekst.<lang>.json) already has needs no line in the game's own
// table: R.t looks in the game's table first, then in the shared one (so «Avslutt» reads the same in
// every game). fellesTabell: the shared table (read here when left out).
export function sjekkSpill(rot, id, sprak, kilde = null, fellesTabell = undefined) {
  const mappe = join(rot, "rusj/spill", id);
  const m = JSON.parse(readFileSync(join(mappe, "spill.json"), "utf8"));
  const i = m.i18n && m.i18n[sprak];
  const feil = [];
  const varsler = [];
  if (!i) return { publiseres: false, feil, varsler, krevd: new Map(), grunn: "ingen i18n" };
  for (const f of I18N_FELT) if (i[f] == null || (f === "sok" ? !Array.isArray(i[f]) : typeof i[f] !== "string" || !i[f].trim())) feil.push(`${id}: i18n.${sprak}.${f} mangler`);
  if (typeof i.slug === "string" && !SLUG.test(i.slug)) feil.push(`${id}: i18n.${sprak}.slug «${i.slug}» kan bare ha små bokstaver a–z, tall og bindestrek`);
  if (i.tagger && !Array.isArray(i.tagger)) feil.push(`${id}: i18n.${sprak}.tagger må være en liste`);
  // Content: every file in data/ needs its translation in data.<lang>/.
  const data = join(mappe, "data");
  if (existsSync(data)) {
    const mangler = readdirSync(data).filter((f) => f.endsWith(".json") && !existsSync(join(mappe, `data.${sprak}`, f)));
    if (mangler.length) return { publiseres: false, feil: [], varsler: [`${id} (${sprak}): data.${sprak}/ mangler ${mangler.join(", ")} – ikke publisert`], krevd: new Map(), grunn: "data" };
  }
  const js = kilde ?? readFileSync(join(mappe, "spill.js"), "utf8");
  const alle = strenger(js);
  const n = nokler(js, alle);
  for (const f of n.feil) feil.push(`${id}/spill.js ${f}`);
  for (const l of n.dynamisk) feil.push(`${id}/spill.js linje ${l}: R.t/R.flertall med en nøkkel som ikke er en tekst i anførselstegn – checkeren kan ikke se den`);
  for (const u of uoversatt(js, alle, n.somNokkel)) feil.push(`${id}/spill.js:${u.linje} ikke oversatt: «${u.tekst}» (pakk inn i R.t, eller merk linjen // sprak-ok)`);
  const felles = fellesTabell === undefined ? lesTabell(join(rot, `rusj/kit/tekst.${sprak}.json`)) || {} : fellesTabell || {};
  const egen = lesTabell(join(mappe, `tekst.${sprak}.json`));
  const krevd = new Map([...n.funnet].filter(([k]) => !har(felles, k) || har(egen, k)).map(([k, l]) => [k, `spill.js:${l}`]));
  feil.push(...sjekkTabell({ navn: `rusj/spill/${id}/tekst.${sprak}.json`, tabell: egen || (krevd.size ? null : {}), krevd, sprak }));
  return { publiseres: !feil.length, feil, varsler, krevd, i18n: i };
}

// The whole check. o: { rot, spill: [ids] | null, sprak: [langs] | null, alle: show the shared
// unwrapped strings too }. Returns { feil, varsler, publisert: { en: [ids], … } }.
export function sjekkSprak(o = {}) {
  const rot = o.rot || ROT_HER;
  const sprakene = o.sprak || SPRAK;
  const feil = [];
  const varsler = [];
  const publisert = {};
  const { krevd, varsler: fellesVarsler } = felleskrav(rot);
  if (o.alle) varsler.push(...fellesVarsler);
  else if (fellesVarsler.length) varsler.push(`${fellesVarsler.length} tekster i kit/forside/maler ser norske ut og er ikke pakket inn (node scripts/sprak.mjs --alle)`);
  const ider = o.spill || readdirSync(join(rot, "rusj/spill")).filter((d) => existsSync(join(rot, "rusj/spill", d, "spill.json")));
  const katalog = katalogNokler(rot);
  for (const sprak of sprakene) {
    const seoFil = join(rot, `rusj/seo.${sprak}.json`);
    const seo = existsSync(seoFil) ? JSON.parse(readFileSync(seoFil, "utf8")) : null;
    if (!seo) feil.push(`rusj/seo.${sprak}.json finnes ikke`);
    publisert[sprak] = [];
    const slugs = new Map(Object.entries(SPRAK_INFO[sprak].sider).map(([, s]) => [s, "en fast side"]));
    for (const id of ider) {
      const r = sjekkSpill(rot, id, sprak);
      varsler.push(...r.varsler);
      if (r.grunn === "ingen i18n" || r.grunn === "data") continue;
      const egne = [...r.feil];
      if (seo && !(seo.spill || {})[id]) egne.push(`${id}: mangler i rusj/seo.${sprak}.json`);
      if (r.i18n && slugs.has(r.i18n.slug)) egne.push(`${id}: i18n.${sprak}.slug «${r.i18n.slug}» er allerede ${slugs.get(r.i18n.slug)}`);
      if (r.i18n) slugs.set(r.i18n.slug, `spillet ${id}`);
      feil.push(...egne.map((f) => `[${sprak}] ${f}`));
      if (!egne.length) publisert[sprak].push(id);
    }
    // The shared table: the code's keys and the stickers of this edition's games.
    const utgave = publisert[sprak].map((id) => {
      const m = JSON.parse(readFileSync(join(rot, "rusj/spill", id, "spill.json"), "utf8"));
      return { id, tagger: m.i18n[sprak].tagger || m.tagger, alder18: !!m.alder18, spillere: m.spillere };
    });
    const alleKrav = new Map([...krevd, ...[...katalogNokler(rot, utgave)].filter(([k]) => !krevd.has(k))]);
    feil.push(...sjekkTabell({ navn: `rusj/kit/tekst.${sprak}.json`, tabell: lesTabell(join(rot, `rusj/kit/tekst.${sprak}.json`)), krevd: alleKrav, sprak, tillatt: katalog }));
  }
  return { feil, varsler, publisert };
}

// ---------- Run alone ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (navn) => {
    const i = process.argv.indexOf(navn);
    return i > 0 ? process.argv[i + 1] : null;
  };
  const spill = arg("--spill") ? arg("--spill").split(",") : null;
  const sprak = arg("--sprak") ? arg("--sprak").split(",") : null;
  if (sprak && sprak.some((s) => !SPRAK.includes(s))) {
    console.error(`Ukjent språk. Velg blant: ${SPRAK.join(", ")}`);
    process.exit(2);
  }
  const r = sjekkSprak({ spill, sprak, alle: process.argv.includes("--alle") || !!spill });
  // With --spill, the shared warnings are noise: show only that game's own lines.
  for (const v of spill ? r.varsler.filter((v) => !/^(rusj|scripts)\//.test(v)) : r.varsler) console.log("⚠ " + v);
  for (const f of r.feil) console.log("✗ " + f);
  for (const [s, ider] of Object.entries(r.publisert)) console.log(`✓ ${s}: ${ider.length} spill publiseres${ider.length ? " (" + ider.join(", ") + ")" : ""}`);
  process.exit(r.feil.length ? 1 : 0);
}
