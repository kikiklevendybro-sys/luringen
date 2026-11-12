// «Slik spiller dere …»: a static, readable block under every game page (see build/del3, section 4
// of the SEO audit). The rules come from the game itself: each spill.js is run once in Node against
// a stand-in kit that only keeps the object passed to Rusj.start(), so the «?» sheet and the page
// can never say different things. Ordinary games also show real examples from their own data.
// No dependencies. Called from scripts/rusj.mjs.
import vm from "node:vm";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Anything a game might touch at load time: every property is itself, every call returns itself,
// it turns into "" in text and is an empty list when iterated.
function stubb() {
  const f = function () {};
  const p = new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === Symbol.iterator ? function* () {} : k === "then" ? undefined : k === "length" ? 0 : p),
    apply: () => p,
    construct: () => p,
    set: () => true,
    has: () => false,
  });
  return p;
}

const tekstfelt = (x) => typeof x === "string" && x.trim().length > 0;

// Runs a game's spill.js and returns its rules { intro, steg: [[tittel, tekst]], tips: [] }, or
// null with the reason (the build then warns and leaves the block out for that game).
// sprak: another edition's { sprak, t, flertall, ramsOpp, tall, forside } (scripts/sprak.mjs
// lagSprak with the game's table and the shared one) – the rules go through the same tables as in
// the game. Left out: Norwegian.
export function lesRegler({ m, spillJs, data, ordData, G, sprak }) {
  let def = null;
  const ingenting = stubb();
  const R = new Proxy(
    {},
    {
      get: (t, k) => {
        if (k in t) return t[k];
        if (k === "start") return (d) => void (def = d);
        if (k === "esc") return esc;
        if (sprak) {
          if (k === "t" || k === "flertall" || k === "ramsOpp" || k === "tall") return sprak[k];
          if (k === "sprak" || k === "forside" || k === "lokale" || k === "tidssone") return sprak[k];
        }
        if (k === "t") return (nokkel, v) => {
          let x = nokkel;
          if (x.includes("|")) x = x.split("|")[v && Number(v.n) === 1 ? 0 : 1];
          return v ? x.replace(/\{(\w+)\}/g, (h, n) => (n in v ? String(v[n]) : h)) : x;
        };
        if (k === "sprak") return "nb";
        if (k === "forside") return "/";
        if (k === "flertall") return (n, en, flere) => `${n} ${n === 1 ? en : flere}`;
        if (k === "ramsOpp") return (l) => (l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " og " + l[l.length - 1]);
        return ingenting;
      },
      set: (t, k, v) => ((t[k] = v), true),
    },
  );
  const vindu = {
    Rusj: R,
    RusjGjengen: G,
    RUSJ_DATA: data,
    RUSJ_ORD: ordData,
    RUSJ_SPILL: { id: m.id, navn: m.navn, undertittel: m.undertittel, kort: m.kort, spillere: m.spillere, minutter: m.minutter, farge: m.farge, alder18: !!m.alder18 },
    RUSJ_SPRAK: sprak ? sprak.sprak : undefined,
    RUSJ_ANDRE: [],
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    performance: { now: () => 0 },
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
  };
  for (const navn of ["document", "localStorage", "sessionStorage", "navigator", "location", "history", "matchMedia", "getComputedStyle", "AudioContext", "Image", "speechSynthesis", "LuringenQr", "ResizeObserver", "MutationObserver"]) vindu[navn] = stubb();
  vindu.window = vindu;
  vindu.self = vindu;
  vindu.globalThis = vindu;
  try {
    vm.runInNewContext(spillJs, vindu, { timeout: 3000, filename: `rusj/spill/${m.id}/spill.js` });
  } catch (e) {
    return { feil: `spill.js kunne ikke kjøres i bygget (${e.message})` };
  }
  if (!def) return { feil: "spill.js kalte ikke Rusj.start()" };
  // Some games word the rules after the way of playing that is chosen (a getter on R.S).
  try {
    R.S = typeof def.tilstand === "function" ? def.tilstand() : {};
  } catch (e) {
    R.S = {};
  }
  let r;
  try {
    r = def.regler;
  } catch (e) {
    return { feil: `regler feilet (${e.message})` };
  }
  if (!r || !tekstfelt(r.intro) || !Array.isArray(r.steg) || !r.steg.length || !r.steg.every((s) => Array.isArray(s) && tekstfelt(s[0]) && tekstfelt(s[1]))) return { feil: "fant ikke regler { intro, steg } i Rusj.start()" };
  return { regler: { intro: r.intro, steg: r.steg.map(([a, b]) => [a, b]), tips: Array.isArray(r.tips) ? r.tips.filter(tekstfelt) : [] } };
}

// ---------- Examples from the game's own content ----------

// A few items from each list, spread over the whole list (not just the first), taken in turn so
// the packs mix. The same every build.
function spre(lister, antall) {
  lister = lister.filter((l) => l.length);
  if (!lister.length) return [];
  const per = Math.ceil(antall / lister.length);
  const valgt = lister.map((l) => Array.from({ length: Math.min(per, l.length) }, (_, i) => l[Math.floor((i * l.length) / Math.min(per, l.length))]));
  const ut = [];
  const sett = new Set();
  for (let i = 0; ut.length < antall && i < per; i++) {
    for (const l of valgt) {
      if (ut.length >= antall) break;
      if (i < l.length && !sett.has(l[i])) {
        sett.add(l[i]);
        ut.push(l[i]);
      }
    }
  }
  return ut;
}

// The packs a game's page may show examples from: named ones, never one marked for adults.
function pakker(liste, ider, id) {
  return ider.map((pid) => {
    const p = liste.find((x) => x.id === pid);
    if (!p) throw new Error(`rusj/spill/${id}: eksempelpakken «${pid}» finnes ikke`);
    if (p.voksen) throw new Error(`rusj/spill/${id}: eksempler kan ikke hentes fra «${pid}», som er merket voksen`);
    return p;
  });
}
const sum = (lister) => lister.reduce((s, l) => s + l.length, 0);
const ord = (o) => (Array.isArray(o) ? o[0] : o);

// One entry per game that has examples worth reading: the heading, the items (plain text) and
// how many items of that kind the game has in all. Not for 18+ games, daily puzzles (no spoilers),
// games whose content is pictures, or games that draw from the shared word bank.
export const EKSEMPLER = {
  sladrehanken: (D) => {
    const alle = D.kort.pakker;
    return { tittel: "«Jeg har aldri»-spørsmål fra spillet", ting: spre(pakker(alle, ["familie", "venner", "jul", "blikjent", "hytte", "reise", "mat"], "sladrehanken").map((p) => p.kort), 26).map((t) => `Jeg har aldri ${t}.`), totalt: sum(alle.map((p) => p.kort)) };
  },
  pekefingeren: (D) => {
    const alle = D.utsagn.pakker;
    return { tittel: "Spørsmål til pekeleken", ting: spre(pakker(alle, ["familie", "venner", "jul", "jobb", "reise", "barn"], "pekefingeren").map((p) => p.utsagn), 24).map((t) => `Hvem er mest sannsynlig til å ${t}?`), totalt: sum(alle.map((p) => p.utsagn)) };
  },
  vaghalsen: (D) => {
    const alle = D.kort.pakker;
    const valgt = pakker(alle, ["familie", "venner", "barn", "jul", "hytte"], "vaghalsen");
    return {
      tittel: "Sannhet og nødt: eksempler fra spillet",
      grupper: [
        { navn: "Sannhet", ting: spre(valgt.map((p) => p.sannhet), 13) },
        { navn: "Nødt", ting: spre(valgt.map((p) => p.konsekvens), 13) },
      ],
      totalt: sum(alle.map((p) => p.sannhet)) + sum(alle.map((p) => p.konsekvens)),
    };
  },
  vinglepetter: (D) => {
    const alle = D.dilemmaer.pakker;
    return { tittel: "Dilemmaer fra spillet", ting: spre(pakker(alle, ["barn", "familie", "mat", "fantasi", "venner", "jul", "sport", "sommer", "blikjent"], "vinglepetter").map((p) => p.dilemmaer), 24).map(([a, b]) => `Vil du heller ${a} eller ${b}?`), totalt: sum(alle.map((p) => p.dilemmaer)) };
  },
  papegoyen: (D) => {
    const alle = D.sporsmal.pakker;
    return { tittel: "Spørsmål fra spillet", ting: spre(pakker(alle, ["barn", "familie"], "papegoyen").map((p) => p.sporsmal), 24), totalt: sum(alle.map((p) => p.sporsmal)) };
  },
  femmeren: (D) => {
    const alle = D.kort.pakker;
    const prefiks = D.kort.prefiks || "Nevn tre";
    return { tittel: "Oppgaver fra spillet", ting: spre(pakker(alle, ["familie", "norge", "jul"], "femmeren").map((p) => p.kort), 24).map((t) => `${prefiks} ${t}`), totalt: sum(alle.map((p) => p.kort)) };
  },
  lognhalsen: (D) => {
    const alle = D.temaer.temaer;
    return { tittel: "Temaer å fortelle om", ting: spre(pakker(alle, ["barndom", "mat", "reise", "talenter", "skole", "uhell", "jul", "bilturen"], "lognhalsen").map((p) => p.kort.map(ord)), 24), totalt: sum(alle.map((p) => p.kort)) };
  },
  sauen: (D) => {
    const alle = D.sporsmal.pakker;
    return { tittel: "Spørsmål fra spillet", ting: spre(pakker(alle, ["mat", "dyr", "hverdag", "norsk", "fritid", "reise", "barn", "jul"], "sauen").map((p) => p.sporsmal), 24), totalt: sum(alle.map((p) => p.sporsmal)) };
  },
  tankeleseren: (D) => {
    const alle = D.spektrum.pakker;
    return { tittel: "Skalaer fra spillet", ting: spre(pakker(alle, ["hverdag", "mat", "norge", "folk", "kultur", "feiring", "barn", "jul"], "tankeleseren").map((p) => p.par), 24).map(([a, b]) => `${a} – ${b}`), totalt: sum(alle.map((p) => p.par)) };
  },
  mimen: (D) => {
    const alle = D.oppgaver.kategorier;
    return { tittel: "Ord å mime fra spillet", ting: spre(pakker(alle, ["dyr", "yrker", "sport", "hverdag", "eventyr", "handlinger", "jul"], "mimen").map((p) => p.oppgaver.map(ord)), 28), totalt: sum(alle.map((p) => p.oppgaver)) };
  },
  panna: (D) => {
    const alle = D.kortstokker.kortstokker;
    return { tittel: "Ord fra kortstokkene", ting: spre(pakker(alle, ["dyr", "mat", "yrker", "sport", "eventyr", "huset", "norge", "steder"], "panna").map((p) => p.ord), 28), totalt: sum(alle.map((p) => p.ord || [])) };
  },
  hatten: (D) => {
    const alle = D.ord.kategorier;
    return { tittel: "Ord fra hatten", ting: spre(pakker(alle, ["ting", "dyr", "mat", "norge", "eventyr", "yrker", "aktivitet"], "hatten").map((p) => p.ord), 28), totalt: sum(alle.map((p) => p.ord)) };
  },
  kunstneren: (D) => {
    const alle = D.ord.kategorier;
    const stor = (t) => t.charAt(0).toLocaleUpperCase("nb") + t.slice(1);
    return { tittel: "Ord å tegne fra spillet", ting: spre(pakker(alle, ["dyr", "mat", "ting", "hjemme", "natur", "kjoretoy", "sport", "fantasi"], "kunstneren").map((p) => [...p.lett, ...p.middels]), 28).map(stor), totalt: sum(alle.map((p) => [...(p.lett || []), ...(p.middels || []), ...(p.vanskelig || [])])) };
  },
  detektiven: (D) => {
    const alle = D.hemmeligheter.kategorier;
    return { tittel: "«Hvem er jeg?»-forslag fra spillet", ting: spre(pakker(alle, ["dyr", "ting", "mat", "yrker", "norge", "fantasi", "sport", "jul"], "detektiven").map((p) => p.liste.map(ord)), 26), totalt: sum(alle.map((p) => p.liste)) };
  },
  nynneren: (D) => {
    const alle = D.laater.kategorier;
    return { tittel: "Sanger å nynne fra spillet", ting: spre(pakker(alle, ["jul", "barn", "norske"], "nynneren").map((p) => p.laater.map(ord)), 24), totalt: sum(alle.map((p) => p.laater)) };
  },
  bokstavtrollet: (D) => {
    const alle = D.kategorier.kategorier;
    return { tittel: "Kategorier fra spillet", ting: spre([alle.filter((k) => k.n === 1), alle.filter((k) => k.n === 2)].map((l) => l.map((k) => k.t)), 24), totalt: alle.length };
  },
  bedreviteren: (D) => {
    const filer = Object.keys(D).filter((f) => f.startsWith("sporsmal-")).sort();
    const lister = filer.map((f) => D[f].filter((q) => q.n === 1));
    return { tittel: "Quizspørsmål med svar", ting: spre(lister, 20).map((q) => `${q.s} Svar: ${q.a[q.r]}.`), totalt: sum(filer.map((f) => D[f])) };
  },
  tidsmaskinen: (D) => {
    const filer = Object.keys(D).filter((f) => f.startsWith("hendelser-")).sort();
    return { tittel: "Hendelser dere skal plassere på tidslinja", ting: spre(filer.map((f) => D[f].filter((h) => h.n <= 2).map((h) => h.t)), 24), totalt: sum(filer.map((f) => D[f])) };
  },
  tieren: (D) => {
    const filer = Object.keys(D).filter((f) => f.startsWith("kort-")).sort();
    // The question and a few of its ten answers (which of them are right is not said).
    return { tittel: "Spørsmål fra spillet", ting: spre(filer.map((f) => D[f].map((k) => `${k.s} (${k.a.slice(0, 4).map(ord).join(", ")} …)`)), 24), totalt: sum(filer.map((f) => D[f])) };
  },
  spionen: (D) => {
    const alle = D.steder.pakker;
    return { tittel: "Steder spionen må gjette", ting: spre(pakker(alle, ["hverdag", "norge", "reise", "sommer", "barn", "jul"], "spionen").map((p) => p.steder.map((s) => s.navn.replace(/­/g, ""))), 24), totalt: sum(alle.map((p) => p.steder)) };
  },
  nissen: (D) => {
    const lister = ["liten", "mellom", "middels", "stor"].map((k) => D.ideer[k] || []);
    return { tittel: "Gaveideer fra spillet", ting: spre(lister, 24), totalt: sum(Object.values(D.ideer)) };
  },
  bingoballen: (D) => {
    const tema = (id) => {
      const t = D.temaer.find((x) => x.id === id);
      if (!t) throw new Error(`rusj/spill/bingoballen: temaet «${id}» finnes ikke`);
      return t.oyeblikk.map((o) => o[1]);
    };
    return {
      tittel: "Øyeblikk på bingobrettene",
      grupper: [
        { navn: "Julebord", ting: spre([tema("julebord")], 14) },
        { navn: "Julaften", ting: spre([tema("julaften")], 12) },
      ],
      totalt: sum(D.temaer.map((t) => t.oyeblikk)),
    };
  },
  skravla: (D) => {
    const kat = ["mat", "dyr", "hjemme", "sport", "norge", "eventyr", "transport", "hoytid"].map((k) => {
      if (!D.forbudt[k]) throw new Error(`rusj/spill/skravla: kategorien «${k}» finnes ikke`);
      return Object.entries(D.forbudt[k]);
    });
    const ramsOpp = (l) => l.slice(0, -1).join(", ") + " eller " + l[l.length - 1];
    return { tittel: "Ord å forklare – uten de forbudte ordene", ting: spre(kat, 24).map(([o, f]) => `${o} – uten å si ${ramsOpp(f)}`), totalt: sum(Object.values(D.forbudt).map((k) => Object.keys(k))) };
  },
};

// «… og over 1 400 til i spillet»: rounded down, so «over» is always true. (Norwegian only: the
// examples are not shown in the other editions yet.)
export function flereTil(antall) {
  if (antall <= 0) return "";
  const steg = antall >= 2000 ? 100 : antall >= 500 ? 50 : antall >= 60 ? 10 : 1;
  const rund = Math.floor(antall / steg) * steg;
  const tall = (n) => n.toLocaleString("nb-NO").replace(/\s/g, " ");
  return rund < antall ? `… og over ${tall(rund)} til i spillet.` : `… og ${tall(antall)} til i spillet.`;
}

// The examples of one game, checked: 20–30 items, all text. null when the game has none.
export function eksemplerFor(m, data) {
  if (m.alder18 || !EKSEMPLER[m.id]) return null;
  const e = EKSEMPLER[m.id](data);
  const alle = e.grupper ? e.grupper.flatMap((g) => g.ting) : e.ting;
  if (alle.length < 20 || alle.length > 30) throw new Error(`rusj/spill/${m.id}: ${alle.length} eksempler (skal være 20–30)`);
  if (!alle.every(tekstfelt)) throw new Error(`rusj/spill/${m.id}: et eksempel er ikke tekst`);
  return { ...e, antall: alle.length };
}

// RUSinfo (rusinfo.no, 915 08 588) is the national information service on alcohol and drugs;
// checked 2026-11-12. Its phone is open on weekdays.
export const RUSINFO = { navn: "RUSinfo", url: "https://rusinfo.no/", telefon: "915 08 588" };

// The block itself. o: regler, eksempler, frase, lenker ([[href, tekst]]), sprak (the edition, from
// byggRusj: { t, forside }; left out = Norwegian), sprakvalg (the language switch, markup).
export function omSpilletHtml(m, o) {
  const t = o.sprak ? o.sprak.t : (k, v) => (v ? k.replace(/\{(\w+)\}/g, (h, n) => (n in v ? String(v[n]) : h)) : k);
  const [a, b] = m.spillere;
  const solo = b === 1;
  const spillere = a === b ? (a === 1 ? t("1 spiller") : t("{n} spillere", { n: a })) : t("{a}–{b} spillere", { a, b });
  const [fra, til] = m.minutter;
  const mobiler = { en: t("1 mobil"), hver: t("Hver sin mobil"), begge: t("1 eller flere mobiler") }[m.mobiler];
  const r = o.regler;
  const fakta = [spillere, fra === til ? `${fra} min` : `${fra}–${til} min`, mobiler, m.alder18 ? t("Bare for voksne (18+)") : null].filter(Boolean);
  const deler = [
    `<section class="om-spillet" id="om-spillet" aria-labelledby="om-spillet-tittel">`,
    `  <p class="om-etikett">${esc(t("Om spillet"))}</p>`,
    `  <h2 id="om-spillet-tittel">${esc(solo ? t("Slik spiller du {navn}", { navn: m.navn }) : t("Slik spiller dere {navn}", { navn: m.navn }))}</h2>`,
    `  <p class="om-sjanger">${esc(o.frase)}</p>`,
    `  <ul class="om-fakta">${fakta.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`,
    `  <p class="om-ingress">${esc(r.intro)}</p>`,
    `  <ol class="om-steg">${r.steg.map(([t, x]) => `<li><b>${esc(t)}</b> ${esc(x)}</li>`).join("")}</ol>`,
    r.tips.length ? `  <h3>${esc(t("Tips"))}</h3>\n  <ul class="om-tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "",
  ];
  if (m.alder18) {
    deler.push(
      `  <div class="om-vett">`,
      `    <h3>${esc(t("Drikk med vett"))}</h3>`,
      `    <ul>`,
      `      <li>${esc(t("Alkoholfritt teller like mye – vann, brus og alkoholfritt er alltid lov."))}</li>`,
      `      <li>${esc(t("Ta små slurker. Ingen skal presses, og alle kan stå over."))}</li>`,
      `      <li>${esc(t("Spis, drikk vann, og sørg for trygg vei hjem. Trenger noen akutt hjelp, ring 113."))}</li>`,
      `    </ul>`,
      // RUSinfo is a Norwegian service: another edition needs its own (rusj/SPRAK.md).
      !o.sprak || o.sprak.sprak === "nb" ? `    <p>Lurer du på noe om alkohol, for deg selv eller noen andre? ${RUSINFO.navn} svarer på telefon ${RUSINFO.telefon} (hverdager) og anonymt på <a href="${RUSINFO.url}" rel="noopener">rusinfo.no</a>.</p>` : "", // sprak-ok
      `  </div>`,
    );
  } else if (o.eksempler) {
    const e = o.eksempler;
    const liste = (ting) => `<ul class="om-eksempler">${ting.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
    deler.push(`  <h3>${esc(e.tittel)}</h3>`);
    if (e.grupper) for (const g of e.grupper) deler.push(`  <h4>${esc(g.navn)}</h4>`, `  ${liste(g.ting)}`);
    else deler.push(`  ${liste(e.ting)}`);
    const mer = flereTil(e.totalt - e.antall);
    if (mer) deler.push(`  <p class="om-mer">${esc(mer)}</p>`);
  }
  const lenker = o.lenker || [];
  deler.push(`  <nav class="om-lenker" aria-label="${esc(t("Flere spill"))}">${[...lenker, [o.sprak ? o.sprak.forside : "/", t("Alle spill på rusj")]].map(([h, x]) => `<a href="${esc(h)}">${esc(x)}</a>`).join("")}</nav>`);
  if (o.sprakvalg) deler.push(`  ${o.sprakvalg}`);
  deler.push(`</section>`);
  return deler.filter(Boolean).join("\n");
}
