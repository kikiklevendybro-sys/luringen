// A pretend browser for rusj/kit/stat.js: just the parts the script touches (a window with a
// document, navigator, location, localStorage, fetch, timers and a clock the test controls).
import vm from "node:vm";
import { readFileSync } from "node:fs";

export const KILDE = readFileSync(new URL("../../rusj/kit/stat.js", import.meta.url), "utf8");
export const MAL = "https://stat.example";

export function nettleser(valg = {}) {
  // `stat: undefined` means «RUSJ_STAT is not set at all», so it cannot be a default parameter.
  const stat = "stat" in valg ? valg.stat : MAL;
  return lagNettleser({ ...valg, stat });
}

function lagNettleser({
  url = "https://rusj.no/",
  stat,
  lager = new Map(), // localStorage; pass the same Map to several pages to make them one phone
  naa = Date.parse("2026-11-11T12:00:00Z"), // 13:00 in Norway, a Wednesday
  nav = {},
  synlig = true,
  appmodus = false,
  iRamme = false,
  lagerFeil = false,
  hentFeil = null, // "kast" or "avvis"
  fra = "", // document.referrer: the page the visitor came from
  peker = "fin", // "grov" = a touch screen (pointer: coarse)
  vindu = [1280, 800], // the viewport in CSS pixels, [width, height]
  ekstra = {},
} = {}) {
  const klokke = { naa };
  const lyttere = { dok: {}, vindu: {} };
  let tidtakere = [];
  let neste = 1;
  const sendt = []; // every fetch: { url, valg }
  const lagerKall = []; // every localStorage call: "get rusj.stat", "set rusj.stat"

  class Dato extends Date {
    constructor(...a) {
      if (a.length) super(...a);
      else super(klokke.naa);
    }
    static now() {
      return klokke.naa;
    }
  }
  const localStorage = {
    getItem: (k) => (lagerKall.push("get " + k), lager.has(k) ? lager.get(k) : null),
    setItem: (k, v) => {
      lagerKall.push("set " + k);
      if (lagerFeil) throw new Error("QuotaExceededError");
      lager.set(k, String(v));
    },
    removeItem: (k) => (lagerKall.push("del " + k), lager.delete(k)),
  };
  const document = { visibilityState: synlig ? "visible" : "hidden", referrer: fra, addEventListener: (type, f) => (lyttere.dok[type] ||= []).push(f) };
  const medier = []; // every media query asked
  const passer = (q) => {
    medier.push(q);
    if (/display-mode: standalone/.test(q)) return appmodus;
    if (q === "(pointer: coarse)") return peker === "grov";
    const m = /^\(max-width: (\d+)px\), \(max-height: (\d+)px\)$/.exec(q);
    if (m) return vindu[0] <= Number(m[1]) || vindu[1] <= Number(m[2]);
    return false;
  };
  const window = {
    document,
    navigator: { ...nav },
    location: new URL(url),
    localStorage,
    Intl,
    Date: Dato,
    fetch: (adresse, valg) => {
      sendt.push({ url: adresse, valg });
      if (hentFeil === "kast") throw new TypeError("Failed to fetch");
      if (hentFeil === "avvis") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve({ ok: true, status: 204 });
    },
    setTimeout: (fn, ms) => (tidtakere.push({ id: neste, fn, ved: klokke.naa + ms }), neste++),
    clearTimeout: (id) => void (tidtakere = tidtakere.filter((t) => t.id !== id)),
    setInterval: (fn, ms) => (tidtakere.push({ id: neste, fn, ved: klokke.naa + ms, hver: ms }), neste++),
    addEventListener: (type, f) => (lyttere.vindu[type] ||= []).push(f),
    matchMedia: (q) => ({ matches: passer(q) }),
    URL,
    ...ekstra,
  };
  if (stat !== undefined) window.RUSJ_STAT = stat;
  window.window = window;
  window.self = window;
  window.top = iRamme ? {} : window;
  vm.runInNewContext(KILDE, window, { filename: "stat.js" });

  const kall = (hvor, type, hendelse = {}) => (lyttere[hvor][type] || []).forEach((f) => f(hendelse));
  return {
    window,
    lager,
    sendt,
    lagerKall,
    medier,
    stat: window.RusjStat,
    klokke,
    antallTidtakere: () => tidtakere.length,
    // Moves the clock forward and runs the timers that fall due, in order.
    fram(ms) {
      const mal = klokke.naa + ms;
      for (;;) {
        const forfalt = tidtakere.filter((t) => t.ved <= mal).sort((a, b) => a.ved - b.ved)[0];
        if (!forfalt) break;
        klokke.naa = forfalt.ved;
        if (forfalt.hver) forfalt.ved += forfalt.hver;
        else tidtakere = tidtakere.filter((t) => t !== forfalt);
        forfalt.fn();
      }
      klokke.naa = mal;
    },
    // Moves the clock without running any timer: the phone was asleep.
    sov(ms) {
      klokke.naa += ms;
      for (const t of tidtakere) if (t.ved < klokke.naa) t.ved = klokke.naa;
    },
    skjul() {
      document.visibilityState = "hidden";
      kall("dok", "visibilitychange");
    },
    vis() {
      document.visibilityState = "visible";
      kall("dok", "visibilitychange");
    },
    lukk() {
      document.visibilityState = "hidden";
      kall("dok", "visibilitychange");
      kall("vindu", "pagehide", { persisted: false });
    },
    tilbakeFraBuffer() {
      document.visibilityState = "visible";
      kall("vindu", "pageshow", { persisted: true });
    },
    // A script error on the page, and a promise nobody caught.
    feil(melding = "TypeError: x is undefined") {
      kall("vindu", "error", { message: melding, filename: "https://rusj.no/x/spill.js", lineno: 1 });
    },
    avvist(grunn = new Error("hemmelig")) {
      kall("vindu", "unhandledrejection", { reason: grunn });
    },
    // The counter names sent so far, batch by batch, and all together.
    pakker: () => sendt.map((s) => JSON.parse(s.valg.body).k),
    nokler: () => sendt.flatMap((s) => JSON.parse(s.valg.body).k),
    notat: () => (lager.has("rusj.stat") ? JSON.parse(lager.get("rusj.stat")) : null),
  };
}

export const MIN = 60 * 1000;
export const DOGN = 24 * 60 * MIN;
