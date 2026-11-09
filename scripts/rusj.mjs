// Builds rusj.no: the front page (portal), one page per game under /<id>/, shared files under
// /felles/, offline support (sw.js), manifest, sitemap and 404 page. No dependencies.
// Called from scripts/bygg.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const DOMENE = "https://rusj.no";

// Content Security Policy: only files from rusj.no itself; no inline scripts, no outside requests.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function hashTekst(tekst) {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Darker shade of an accent colour for the 3D button edge.
export function morkere(hex, mengde = 0.3) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  // Mix towards a deep purple-black so shadows stay in the night palette.
  const [mr, mg, mb] = [40, 14, 60];
  r = Math.round(r * (1 - mengde) + mr * mengde - 18 * mengde);
  g = Math.round(g * (1 - mengde) + mg * mengde - 18 * mengde);
  b = Math.round(b * (1 - mengde) + mb * mengde - 4 * mengde);
  const k = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return "#" + k(r) + k(g) + k(b);
}

const PAKREVD = ["id", "navn", "undertittel", "beskrivelse", "kort", "spillere", "minutter", "mobiler", "tagger", "rekkefolge"];
export const TAGGER = {
  fest: "Fest",
  familie: "Familie",
  barn: "Barn",
  blof: "Bløff",
  ord: "Ord",
  lag: "Lag mot lag",
  quiz: "Quiz",
  tegning: "Tegning",
  hukommelse: "Hukommelse",
  sporsmal: "Prat",
  klassiker: "Klassikere",
  daglig: "Dagens",
  tenke: "Hjernetrim",
  alene: "Alene",
  kort: "Kortspill",
  verktoy: "Verktøy",
  drikke: "Drikkespill 18+",
};

export function lesSpill(rot, utvalg) {
  const mappe = join(rot, "rusj/spill");
  const G = require(join(rot, "rusj/kit/gjengen.js"));
  const spill = [];
  for (const id of readdirSync(mappe)) {
    const fil = join(mappe, id, "spill.json");
    if (!existsSync(fil)) continue;
    const m = JSON.parse(readFileSync(fil, "utf8"));
    for (const felt of PAKREVD) if (m[felt] == null) throw new Error(`${fil}: mangler "${felt}"`);
    if (m.id !== id) throw new Error(`${fil}: id "${m.id}" matcher ikke mappenavnet`);
    if (!G.finnes(id)) throw new Error(`${fil}: ingen figur for "${id}" i rusj/kit/gjengen.js`);
    if (!["en", "hver", "begge"].includes(m.mobiler)) throw new Error(`${fil}: mobiler må være en, hver eller begge`);
    for (const t of m.tagger) if (!TAGGER[t]) throw new Error(`${fil}: ukjent tagg "${t}"`);
    if (m.beskrivelse.length > 170) console.warn(`  ⚠ ${id}: beskrivelse er ${m.beskrivelse.length} tegn (bør være under 160)`);
    m.farge = m.farge || G.farge(id);
    m.mappe = join(mappe, id);
    if (utvalg && !utvalg.includes(id)) continue;
    spill.push(m);
  }
  spill.sort((a, b) => a.rekkefolge - b.rekkefolge);
  return spill;
}

export function spillereTekst(m) {
  const [a, b] = m.spillere;
  return a === b ? `${a}` : `${a}–${b}`;
}
export function tidTekst(m) {
  const [a, b] = m.minutter;
  return a === b ? `${a} min` : `${a}–${b} min`;
}

export function byggRusj({ ROT, WEB, ordData, utvalg, luringen }) {
  const G = require(join(ROT, "rusj/kit/gjengen.js"));
  const kilde = (sti) => readFileSync(join(ROT, sti), "utf8");
  const filer = []; // every published path, for the service worker
  const skriv = (sti, innhold) => {
    const fil = join(WEB, sti);
    mkdirSync(join(fil, ".."), { recursive: true });
    writeFileSync(fil, innhold);
    filer.push("/" + sti);
    return "/" + sti + "?v=" + hashTekst(typeof innhold === "string" ? innhold : innhold.toString("base64"));
  };
  const kopier = (fra, til) => {
    if (!existsSync(fra)) return null;
    return skriv(til, readFileSync(fra));
  };

  // ---------- Shared files ----------
  const felles = {
    css: skriv("felles/rusj.css", kilde("rusj/kit/rusj.css")),
    gjengen: skriv("felles/gjengen.js", kilde("rusj/kit/gjengen.js")),
    js: skriv("felles/rusj.js", kilde("rusj/kit/rusj.js")),
    qr: skriv("felles/qr.js", kilde("src/qr.js")),
    ord: skriv("felles/ord.js", "window.RUSJ_ORD=" + JSON.stringify(ordData).replace(/</g, "\\u003c") + ";"),
  };

  // Icons and share images (drawn by scripts/lag-bilder.mjs, committed in rusj/bilder)
  const BILDER = join(ROT, "rusj/bilder");
  const bilde = (navn) => (existsSync(join(BILDER, navn)) ? kopier(join(BILDER, navn), navn) : null);
  const ikoner = {
    svg: bilde("ikon.svg"),
    p180: bilde("ikon-180.png"),
    p192: bilde("ikon-192.png"),
    p512: bilde("ikon-512.png"),
    maske: bilde("ikon-maskerbar-512.png"),
    deling: bilde("deling.png"),
  };
  for (const [k, v] of Object.entries(ikoner)) if (!v) console.warn(`  ⚠ mangler rusj/bilder for ${k} (kjør node scripts/lag-bilder.mjs)`);

  const spill = lesSpill(ROT, utvalg);
  const LOGO = G.logo();
  const spillFiler = []; // every game page and its files, stored by the service worker on install
  // Every game can suggest the others (also those not built in a partial test build).
  const alleSpillKort = [...(luringen ? [luringen] : []), ...lesSpill(ROT, null)].sort((a, b) => a.rekkefolge - b.rekkefolge);

  const hode = (o) => `<!doctype html>
<html lang="nb"${o.htmlAttr || ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<title>${esc(o.tittel)}</title>
<meta name="description" content="${esc(o.beskrivelse)}">
<link rel="canonical" href="${DOMENE}${o.sti}">
<meta name="theme-color" content="#150c28">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${esc(o.kortnavn || "rusj")}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="rusj">
<meta property="og:locale" content="nb_NO">
<meta property="og:title" content="${esc(o.ogTittel || o.tittel)}">
<meta property="og:description" content="${esc(o.beskrivelse)}">
<meta property="og:url" content="${DOMENE}${o.sti}">
${o.deling ? `<meta property="og:image" content="${DOMENE}${o.deling.split("?")[0]}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="manifest" href="/manifest.webmanifest">
${o.ikon ? `<link rel="icon" href="${o.ikon}" type="image/svg+xml">` : ""}
${ikoner.p180 ? `<link rel="apple-touch-icon" href="${ikoner.p180}">` : ""}
${o.css.map((c) => `<link rel="stylesheet" href="${c}">`).join("\n")}
</head>`;

  const STEMPEL_FILTER = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="stempel-ruff" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="stoy"/><feDisplacementMap in="SourceGraphic" in2="stoy" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`;

  // ---------- One page per game ----------
  for (const m of spill) {
    const id = m.id;
    const js = join(m.mappe, "spill.js");
    if (!existsSync(js)) throw new Error(`rusj/spill/${id}/spill.js mangler`);
    const spillJs = readFileSync(js, "utf8");
    if (/<\/script/i.test(spillJs)) throw new Error(`${id}: spill.js inneholder </script>`);

    const data = {};
    const dataMappe = join(m.mappe, "data");
    if (existsSync(dataMappe)) {
      for (const f of readdirSync(dataMappe).sort()) {
        if (!f.endsWith(".json")) continue;
        try {
          data[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dataMappe, f), "utf8"));
        } catch (e) {
          throw new Error(`rusj/spill/${id}/data/${f}: ugyldig JSON (${e.message})`);
        }
      }
    }
    const meta = {
      id,
      navn: m.navn,
      undertittel: m.undertittel,
      kort: m.kort,
      spillere: m.spillere,
      minutter: m.minutter,
      farge: m.farge,
      alder18: !!m.alder18,
    };
    // Drinking games only suggest each other; other games never suggest a drinking game.
    const andre = alleSpillKort.filter((g) => g.id !== id && !!g.alder18 === !!m.alder18).map((g) => ({ id: g.id, navn: g.navn, undertittel: g.undertittel, spillere: g.spillere, farge: g.farge }));
    const dataJs =
      "window.RUSJ_SPILL=" + JSON.stringify(meta) + ";\nwindow.RUSJ_ANDRE=" + JSON.stringify(andre).replace(/</g, "\\u003c") + ";\nwindow.RUSJ_DATA=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";\n";
    const dataSti = skriv(`${id}/data.js`, dataJs);
    const spillSti = skriv(`${id}/spill.js`, spillJs);
    const css = [felles.css];
    if (existsSync(join(m.mappe, "spill.css"))) css.push(skriv(`${id}/spill.css`, readFileSync(join(m.mappe, "spill.css"), "utf8")));
    const ikon = skriv(`${id}/ikon.svg`, ikonSvg(G, id));
    const deling = existsSync(join(BILDER, `deling-${id}.png`)) ? kopier(join(BILDER, `deling-${id}.png`), `${id}/deling.png`) : ikoner.deling;
    spillFiler.push(`/${id}/`, dataSti, spillSti, ...css.slice(1), ikon); // offline: the whole game

    const skript = [felles.gjengen, felles.js];
    if (m.qr) skript.push(felles.qr);
    if (m.ordbank) skript.push(felles.ord);
    skript.push(dataSti, spillSti);

    const dyp = m.fargeDyp || morkere(m.farge);
    const tittel = `${m.navn} – ${m.undertittel} | rusj`;
    const side = `${hode({
      tittel,
      ogTittel: `${m.navn} – ${m.undertittel}`,
      beskrivelse: m.beskrivelse,
      sti: `/${id}/`,
      kortnavn: m.navn,
      ikon,
      deling,
      css,
      htmlAttr: ` data-spill="${id}" style="--aksent: ${m.farge}; --aksent-dyp: ${dyp}"`,
    })}
<body>
<div class="scene" aria-hidden="true"></div>
<div class="app">
  <header class="topp">
    <a class="topp-merke" id="tilportal" href="/" aria-label="Alle spill på rusj.no"><svg class="pil" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>${LOGO}</a>
    <button class="ikonknapp" id="tilbake" data-h="tilbake" aria-label="Tilbake" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
    <span class="topp-tittel" id="topp-tittel"></span>
    <div class="topp-hoyre">
      <button class="ikonknapp" id="reglerknapp" data-h="regler" aria-label="Slik spiller du"><span class="sporsmal" aria-hidden="true">?</span></button>
      <button class="ikonknapp" id="lydknapp" data-h="lyd" aria-label="Lyd" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="fylt" d="M4 9h4l5-4v14l-5-4H4z"/><path class="bolge" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="kryss" d="M17 9l5 6M22 9l-5 6"/></svg></button>
    </div>
  </header>
  <main id="hoved">
    <section class="skjerm" id="skjerm">
      <div class="spillhjem">
        <span class="figur-ramme">${G.svg(id)}</span>
        <h1>${esc(m.navn)}</h1>
        <span class="undertittel">${esc(m.undertittel)}</span>
        <p class="slagord">${esc(m.beskrivelse)}</p>
      </div>
      <noscript><p class="personvern">${esc(m.navn)} trenger JavaScript for å kjøre.</p></noscript>
    </section>
  </main>
</div>
<div class="ark-bakgrunn" id="ark" hidden><div class="ark" role="dialog" aria-modal="true" aria-labelledby="ark-tittel" id="ark-innhold"></div></div>
<div class="nedtelling" id="nedtelling" hidden aria-live="assertive"></div>
<canvas class="konfetti" id="konfetti" aria-hidden="true"></canvas>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="vh" id="si" aria-live="polite"></div>
${STEMPEL_FILTER}
${skript.map((s) => `<script src="${s}"></script>`).join("\n")}
</body>
</html>
`;
    skriv(`${id}/index.html`, side);
  }

  // ---------- Front page ----------
  const alleKort = [];
  if (luringen) alleKort.push(luringen);
  alleKort.push(...spill);
  alleKort.sort((a, b) => a.rekkefolge - b.rekkefolge);

  const portalCss = skriv("felles/portal.css", kilde("rusj/portal/portal.css"));
  const portalJs = skriv("felles/portal.js", kilde("rusj/portal/portal.js"));
  const spillData = alleKort.map((m) => ({
    id: m.id,
    navn: m.navn,
    undertittel: m.undertittel,
    kort: m.kort,
    spillere: m.spillere,
    tagger: m.tagger,
    mobiler: m.mobiler,
    alder18: !!m.alder18,
    sok: Array.isArray(m.sok) ? m.sok : [],
  }));
  const portalData = skriv("felles/spilliste.js", "window.RUSJ_SPILLISTE=" + JSON.stringify(spillData) + ";");
  const MOBIL = { en: "Én mobil", hver: "Hver sin mobil", begge: "Én eller flere mobiler" };
  const kort = alleKort
    .map(
      (m, n) => `<li class="spillkort" data-id="${m.id}"${m.alder18 ? " data-alder18" : ""} style="--kf: ${m.farge}; --i: ${n}">
        <a href="/${m.id}/" aria-label="${esc(`${m.navn}: ${m.undertittel}. ${m.kort}`)}">
          <span class="kort-figur">${G.svg(m.id)}</span>
          <span class="kort-tekst">
            <span class="kort-sjanger">${esc(m.undertittel)}</span>
            <span class="kort-navn">${esc(m.navn)}</span>
            <span class="kort-linje">${esc(m.kort)}</span>
            <span class="kort-fakta"><span>👥 ${spillereTekst(m)}</span><span>⏱ ${tidTekst(m)}</span><span>📱 ${MOBIL[m.mobiler]}</span></span>
          </span>
          <span class="kort-fortsett" hidden>Fortsett</span>
          ${m.alder18 ? '<span class="kort-18" aria-hidden="true">18+</span>' : ""}
        </a>
      </li>`,
    )
    .join("\n");
  const parade = alleKort
    .filter((m) => !m.alder18)
    .map((m) => `<a class="parade-figur" href="/${m.id}/" style="--kf: ${m.farge}" aria-label="${esc(m.navn)}">${G.svg(m.id)}</a>`)
    .join("");
  const brukteTagger = Object.keys(TAGGER).filter((t) => alleKort.some((m) => m.tagger.includes(t)));
  const portalSide = `${hode({
    tittel: "rusj – gratis festspill på norsk, rett i nettleseren",
    ogTittel: "rusj – gratis festspill på norsk",
    beskrivelse: `${alleKort.length} gratis fest- og familiespill på norsk: Luringen, Spionen, Jeg har aldri, quiz, tegn og gjett – og mye mer. Ingen app, ingen konto, ingen reklame.`,
    sti: "/",
    ikon: ikoner.svg,
    deling: ikoner.deling,
    css: [felles.css, portalCss],
  })}
<body class="portal">
<div class="scene" aria-hidden="true"></div>
<header class="helt">
  <h1 class="helt-logo"><span class="vh">rusj</span>${G.logo({ klasse: "tegnes" })}</h1>
  <p class="helt-slagord">Festspill på norsk.<br><em>Rett i nettleseren.</em></p>
  <ul class="helt-fakta" aria-label="Om rusj">
    <li><b>${alleKort.length}</b> spill</li><li><b>0</b> kr</li><li><b>0</b> apper</li><li><b>0</b> reklame</li>
  </ul>
  <div class="helt-knapper">
    <a class="knapp" href="#spill">Finn et spill</a>
    <button class="knapp-2" id="overrask" type="button"><span aria-hidden="true">🎲</span> Overrask meg</button>
  </div>
  <span class="filter-vakt" aria-hidden="true"></span>
  <nav class="parade" aria-label="Rusj-gjengen"><div class="parade-spor">${parade}${parade.replace(/<a /g, '<a tabindex="-1" aria-hidden="true" ')}</div></nav>
</header>
<main class="portal-hoved">
  <div class="installtips" id="installtips" hidden>
    <span class="installtips-ikon" aria-hidden="true">📲</span>
    <span class="installtips-tekst"><b>Tips:</b> Legg rusj på hjemskjermen – da starter spillene som en app og virker uten nett.</span>
    <button type="button" class="installtips-vis" id="installtips-vis">Vis meg</button>
    <button type="button" class="installtips-lukk" id="installtips-lukk" aria-label="Skjul tipset">×</button>
  </div>
  <section class="kveld" id="kveld" hidden aria-labelledby="kveld-tittel">
    <div class="kveld-topp"><h2 id="kveld-tittel">🏆 Kveldens gjeng</h2><span class="kveld-antall" id="kveld-antall"></span></div>
    <ol class="kveld-liste" id="kveld-liste"></ol>
    <p class="kveld-fot">3 poeng for seier, 2 for andreplass og 1 for tredje – i alle spillene dere spiller i kveld.</p>
    <button type="button" class="lenke" id="kveld-nullstill">Start en ny kveld</button>
  </section>
  <h2 class="filter-overskrift" id="spill" tabindex="-1">Hva skal vi spille?</h2>
  <div class="filter" role="region" aria-label="Søk og filter">
    <div class="sok">
      <span class="sok-ikon" aria-hidden="true">🔎</span>
      <input type="search" id="sok" placeholder="Søk: quiz, kortspill, barn …" aria-label="Søk etter spill" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <button type="button" class="sok-tom" id="sok-tom" aria-label="Tøm søket" hidden>×</button>
    </div>
    <div class="filter-rad">
      <div class="antall" role="group" aria-label="Hvor mange spillere er dere?">
        <span class="antall-tekst">Spillere</span>
        <button type="button" class="antall-knapp" data-antall="-1" aria-label="Færre">−</button>
        <output id="antall" aria-live="polite">alle</output>
        <button type="button" class="antall-knapp" data-antall="1" aria-label="Flere">+</button>
      </div>
      <div class="brikker" id="tagger" role="group" aria-label="Type spill">
        <button type="button" class="brikke alle" data-tagg="" aria-pressed="true">Alle</button>
        ${brukteTagger.map((t) => `<button type="button" class="brikke" data-tagg="${t}" aria-pressed="false">${esc(TAGGER[t])}</button>`).join("")}
      </div>
    </div>
  </div>
  <p class="treff" id="treff" aria-live="polite"></p>
  <div class="hyller" id="hyller"></div>
  <h2 class="alle-tittel" id="alle-tittel">Alle spill</h2>
  <ul class="spillgrid" id="spillgrid">
${kort}
  </ul>
  <p class="ingen-treff" id="ingen-treff" hidden>Ingen spill passer akkurat det. Prøv et annet søkeord, et annet antall eller en annen type.</p>
  <dialog class="dialog" id="dialog" aria-labelledby="dialog-tittel"></dialog>

  <section class="slik" aria-labelledby="slik-tittel">
    <h2 id="slik-tittel">Så enkelt er det</h2>
    <ol class="slik-steg">
      <li><b>Velg et spill</b><span>Alt er gratis og klart med en gang.</span></li>
      <li><b>Skriv inn navnene</b><span>Én gang. Alle spillene husker gjengen din.</span></li>
      <li><b>Send mobilen rundt</b><span>Eller bruk hver sin mobil i spillene som har det.</span></li>
    </ol>
  </section>

  <section class="installer" id="installer" aria-labelledby="installer-tittel">
    <span class="installer-figur" aria-hidden="true">${G.svg("panna")}</span>
    <div>
      <h2 id="installer-tittel">Ha rusj på hjemskjermen</h2>
      <p id="installer-tekst">Åpne delingsmenyen i nettleseren og velg «Legg til på Hjem-skjerm». Da starter rusj som en app – og spillene virker uten nett.</p>
      <button class="knapp-2 liten" id="installer-knapp" type="button" hidden>Installer rusj</button>
    </div>
  </section>
</main>
<footer class="bunn">
  <p class="bunn-logo">${G.logo()}</p>
  <p><b>Ingen konto. Ingen sporing. Ingen reklame.</b><br>Navn og spill lagres bare på mobilen din, og ingenting sendes noe sted.</p>
  <p class="bunn-liten">rusj.no · laget i Norge</p>
</footer>
<script src="${portalData}"></script>
<script src="${portalJs}"></script>
</body>
</html>
`;
  skriv("index.html", portalSide);

  // ---------- 404 ----------
  skriv(
    "404.html",
    `${hode({ tittel: "Fant ikke siden | rusj", beskrivelse: "Denne siden finnes ikke. Gå til rusj.no for alle spillene.", sti: "/404.html", ikon: ikoner.svg, css: [felles.css, portalCss] })}
<body class="portal">
<div class="scene" aria-hidden="true"></div>
<main class="borte">
  <span class="borte-figur">${G.svg("detektiven")}</span>
  <h1>Her var det tomt.</h1>
  <p>Detektiven har lett overalt, men denne siden finnes ikke.</p>
  <a class="knapp" href="/">Til alle spillene</a>
</main>
</body>
</html>
`,
  );

  // ---------- Manifest, robots, sitemap ----------
  skriv(
    "manifest.webmanifest",
    JSON.stringify(
      {
        name: "rusj – festspill",
        short_name: "rusj",
        description: "Gratis festspill på norsk, rett i nettleseren.",
        lang: "nb",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#150c28",
        theme_color: "#150c28",
        icons: [
          ikoner.p192 && { src: ikoner.p192.split("?")[0], sizes: "192x192", type: "image/png" },
          ikoner.p512 && { src: ikoner.p512.split("?")[0], sizes: "512x512", type: "image/png" },
          ikoner.maske && { src: ikoner.maske.split("?")[0], sizes: "512x512", type: "image/png", purpose: "maskable" },
          ikoner.svg && { src: ikoner.svg.split("?")[0], sizes: "any", type: "image/svg+xml" },
        ].filter(Boolean),
      },
      null,
      2,
    ),
  );
  skriv("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${DOMENE}/sitemap.xml\n`);
  skriv(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/", ...alleKort.map((m) => `/${m.id}/`)]
      .map((s) => `  <url><loc>${DOMENE}${s}</loc></url>`)
      .join("\n")}\n</urlset>\n`,
  );

  return {
    spill,
    filer,
    forhand: [...Object.values(felles), portalCss, portalJs, portalData, ...Object.values(ikoner).filter((f) => f && !/deling/.test(f)), ...spillFiler],
  };
}

// Square icon with the game's mascot on the night background.
export function ikonSvg(G, id) {
  const fig = G.svg(id).replace(/^<svg [^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><radialGradient id="g" cx="50%" cy="18%" r="80%"><stop offset="0" stop-color="#4a2b80"/><stop offset=".55" stop-color="#21143d"/><stop offset="1" stop-color="#150c28"/></radialGradient></defs><rect width="512" height="512" rx="116" fill="url(#g)"/><g transform="translate(85 96) scale(2.85)">${fig}</g></svg>`;
}
