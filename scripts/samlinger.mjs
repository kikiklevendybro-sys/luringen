// Collection pages: rusj/samlinger/<slug>.json → /<slug>/ («Julebordleker», «Spill for to» …).
// Hand-written pages for the words people search for, each with the games that fit and why.
// Read and checked here; the page around them is drawn by scripts/rusj.mjs. No dependencies.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ord = (t) => String(t).split(/\s+/).filter(Boolean).length;
const tekst = (x) => typeof x === "string" && x.trim().length > 0;

// Reads every collection and stops the build on anything that would make a poor page:
// o: { rot, spillIder (every game, also Luringen), atten (ids of 18+ games), tittelMaks,
//      beskrivelse: [min, maks], merke (a function that finds a brand name in a text) }
export function lesSamlinger(o) {
  const mappe = join(o.rot, "rusj/samlinger");
  if (!existsSync(mappe)) return [];
  const feil = [];
  const samlinger = [];
  for (const fil of readdirSync(mappe).sort()) {
    if (!fil.endsWith(".json")) continue;
    const slug = fil.slice(0, -5);
    const hvor = `rusj/samlinger/${fil}`;
    let s;
    try {
      s = JSON.parse(readFileSync(join(mappe, fil), "utf8"));
    } catch (e) {
      feil.push(`${hvor}: ugyldig JSON (${e.message})`);
      continue;
    }
    const f = (t) => feil.push(`${hvor}: ${t}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) f("filnavnet må være små bokstaver a–z, tall og bindestrek");
    for (const felt of ["tittel", "navn", "h1", "beskrivelse"]) if (!tekst(s[felt])) f(`mangler "${felt}"`);
    if (!Array.isArray(s.ingress) || !s.ingress.every(tekst)) f(`"ingress" må være en liste med avsnitt`);
    if (!Array.isArray(s.spill) || s.spill.length < 4) f(`"spill" må ha minst fire spill`);
    if (!Array.isArray(s.kvelden) || s.kvelden.length !== 3 || !s.kvelden.every((k) => Array.isArray(k) && tekst(k[0]) && tekst(k[1]))) f(`"kvelden" må ha tre steg [tittel, tekst]`);
    if (!Array.isArray(s.faq) || s.faq.length < 2 || s.faq.length > 4 || !s.faq.every((q) => Array.isArray(q) && tekst(q[0]) && tekst(q[1]))) f(`"faq" må ha 2–4 [spørsmål, svar]`);
    if (!Array.isArray(s.naboer) || s.naboer.length < 2) f(`"naboer" må ha minst to andre samlinger`);
    if (feil.length) continue;
    const tittel = `${s.tittel} | rusj`;
    if (tittel.length > o.tittelMaks || tittel.length < 25) f(`tittelen er ${tittel.length} tegn (25–${o.tittelMaks} med « | rusj»)`);
    const [min, maks] = o.beskrivelse;
    if (s.beskrivelse.length < min || s.beskrivelse.length > maks) f(`beskrivelsen er ${s.beskrivelse.length} tegn (${min}–${maks})`);
    const ingressOrd = ord(s.ingress.join(" "));
    if (ingressOrd < 60 || ingressOrd > 170) f(`ingressen er ${ingressOrd} ord (60–170)`);
    const sett = new Set();
    for (const rad of s.spill) {
      const [id, hvorfor] = Array.isArray(rad) ? rad : [];
      if (!o.spillIder.includes(id)) f(`spillet «${id}» finnes ikke`);
      else if (!!s.alder18 !== o.atten.includes(id)) f(s.alder18 ? `«${id}» er ikke et 18+-spill` : `«${id}» er et 18+-spill og kan bare stå i en 18+-samling`);
      if (!tekst(hvorfor)) f(`«${id}» mangler en linje om hvorfor det passer`);
      if (sett.has(id)) f(`«${id}» står to ganger`);
      sett.add(id);
    }
    // Every visible text: never another company's game name.
    const synlig = [s.tittel, s.navn, s.h1, s.undertittel || "", s.beskrivelse, ...s.ingress, ...s.spill.map((r) => r[1]), ...s.kvelden.flat(), ...s.faq.flat()];
    for (const t of synlig) {
      const merke = o.merke(t);
      if (merke) f(`«${merke}» er en annens merkevare og kan ikke stå på siden`);
    }
    samlinger.push({ ...s, slug, alder18: !!s.alder18, rekkefolge: s.rekkefolge ?? 99 });
  }
  const slugs = new Set(samlinger.map((s) => s.slug));
  const titler = new Map();
  const beskrivelser = new Map();
  for (const s of samlinger) {
    for (const n of s.naboer) {
      if (!slugs.has(n) || n === s.slug) feil.push(`rusj/samlinger/${s.slug}.json: nabosamlingen «${n}» finnes ikke`);
      // Ordinary pages never point to the drinking games (the same rule as for the games).
      else if (!s.alder18 && samlinger.find((x) => x.slug === n).alder18) feil.push(`rusj/samlinger/${s.slug}.json: en vanlig samling kan ikke lenke til 18+-samlingen «${n}»`);
    }
    if (titler.has(s.tittel)) feil.push(`rusj/samlinger: ${s.slug} og ${titler.get(s.tittel)} har samme tittel`);
    if (beskrivelser.has(s.beskrivelse)) feil.push(`rusj/samlinger: ${s.slug} og ${beskrivelser.get(s.beskrivelse)} har samme beskrivelse`);
    titler.set(s.tittel, s.slug);
    beskrivelser.set(s.beskrivelse, s.slug);
  }
  if (feil.length) throw new Error("Samlingene har feil:\n  " + feil.join("\n  "));
  return samlinger.sort((a, b) => a.rekkefolge - b.rekkefolge || a.slug.localeCompare(b.slug));
}

// The content of one collection page (inside <main class="side">).
// o: { spill (Map id → game facts), frase (id → search phrase), figur (id → svg), naboer (slug → collection), rusinfo }
export function samlingInnhold(s, o) {
  const fakta = (m) => {
    const [a, b] = m.spillere;
    const [fra, til] = m.minutter;
    const mob = { en: "1 mobil", hver: "hver sin mobil", begge: "1 eller flere mobiler" }[m.mobiler];
    return [a === b ? (a === 1 ? "1 spiller" : `${a} spillere`) : `${a}–${b} spillere`, fra === til ? `${fra} min` : `${fra}–${til} min`, mob].map((t) => t.replace(/ /g, "\u00a0")).join(" · "); // breaks only between the facts
  };
  const rader = s.spill.map(([id, hvorfor]) => ({ m: o.spill.get(id), hvorfor })).filter((r) => r.m);
  const kort = s.alder18
    ? `<ul class="samling-liste">
${rader.map(({ m, hvorfor }) => `      <li><b>${esc(m.navn)}</b> – ${esc(hvorfor)} <a href="/${m.id}/">Slik spiller dere ${esc(m.navn)}</a></li>`).join("\n")}
    </ul>`
    : `<ul class="samling-kort">
${rader
  .map(
    ({ m, hvorfor }) => `      <li style="--kf: ${esc(m.farge)}"><a href="/${m.id}/">
        <span class="samling-figur" aria-hidden="true">${o.figur(m.id)}</span>
        <span class="samling-tekst"><span class="samling-navn">${esc(m.navn)}</span><span class="samling-sjanger">${esc(o.frase(m))}</span><span class="samling-hvorfor">${esc(hvorfor)}</span><span class="samling-fakta">${esc(fakta(m))}</span></span>
      </a></li>`,
  )
  .join("\n")}
    </ul>`;
  const naboer = s.naboer.map((n) => o.naboer(n)).filter(Boolean);
  const r = o.rusinfo;
  return `  <h1>${esc(s.h1)}${s.undertittel ? ` <span class="samling-under">${esc(s.undertittel)}</span>` : ""}</h1>
${s.ingress.map((p, i) => `  <p class="${i ? "samling-avsnitt" : "side-ingress"}">${esc(p)}</p>`).join("\n")}
${
  s.alder18
    ? `  <section class="samling-vett" aria-labelledby="samling-vett">
    <h2 id="samling-vett">Bare for voksne – og drikk med vett</h2>
    <ul>
      <li>Spillene er for voksne over 18 år, og hvert spill spør om alderen før det starter.</li>
      <li>Alkoholfritt teller like mye – vann, brus og alkoholfritt er alltid lov.</li>
      <li>Ta små slurker. Ingen skal presses, og alle kan stå over.</li>
      <li>Spis, drikk vann, og sørg for trygg vei hjem. Trenger noen akutt hjelp, ring 113.</li>
    </ul>
    <p>Lurer du på noe om alkohol, for deg selv eller noen andre? ${esc(r.navn)} svarer på telefon ${esc(r.telefon)} (hverdager) og anonymt på <a href="${esc(r.url)}" rel="noopener">rusinfo.no</a>.</p>
  </section>
`
    : ""
}  <section class="samling-spill" aria-labelledby="samling-spill">
    <h2 id="samling-spill">${esc(s.spillTittel || `${rader.length} spill som passer`)}</h2>
    ${kort}
  </section>
  <section aria-labelledby="samling-kvelden">
    <h2 id="samling-kvelden">${esc(s.kveldenTittel || "Slik legger dere opp kvelden")}</h2>
    <ol class="samling-steg">
${s.kvelden.map(([t, x]) => `      <li><b>${esc(t)}</b> ${esc(x)}</li>`).join("\n")}
    </ol>
  </section>
  <section aria-labelledby="samling-faq">
    <h2 id="samling-faq">Spørsmål og svar</h2>
    <dl class="samling-faq">
${s.faq.map(([q, a]) => `      <dt>${esc(q)}</dt>\n      <dd>${esc(a)}</dd>`).join("\n")}
    </dl>
  </section>
  <nav class="samling-naboer" aria-labelledby="samling-naboer">
    <h2 id="samling-naboer">Flere samlinger</h2>
    <ul>
${naboer.map((n) => `      <li><a href="/${n.slug}/">${esc(n.navn)}</a></li>`).join("\n")}
      <li><a href="/">Alle spill</a></li>
    </ul>
  </nav>`;
}

// Structured data: the list of games and the path from the front page.
export function samlingJsonLd(s, o) {
  const url = `${o.domene}/${s.slug}/`;
  const spill = s.spill.map(([id]) => o.spill.get(id)).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#side`,
        name: s.h1,
        url,
        description: s.beskrivelse,
        inLanguage: "nb",
        isPartOf: { "@id": `${o.domene}/#nettsted` },
        publisher: { "@id": o.utgiver["@id"] },
        mainEntity: { "@id": `${url}#spill` },
      },
      {
        "@type": "ItemList",
        "@id": `${url}#spill`,
        name: s.h1,
        numberOfItems: spill.length,
        itemListElement: spill.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.navn, url: `${o.domene}/${m.id}/` })),
      },
      o.utgiver,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "rusj", item: `${o.domene}/` },
          { "@type": "ListItem", position: 2, name: s.navn, item: url },
        ],
      },
    ],
  };
}
