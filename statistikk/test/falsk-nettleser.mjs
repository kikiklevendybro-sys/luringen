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
  const document = { visibilityState: synlig ? "visible" : "hidden", addEventListener: (type, f) => (lyttere.dok[type] ||= []).push(f) };
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
    matchMedia: (q) => ({ matches: appmodus && /standalone/.test(q) }),
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
    // The counter names sent so far, batch by batch, and all together.
    pakker: () => sendt.map((s) => JSON.parse(s.valg.body).k),
    nokler: () => sendt.flatMap((s) => JSON.parse(s.valg.body).k),
    notat: () => (lager.has("rusj.stat") ? JSON.parse(lager.get("rusj.stat")) : null),
  };
}

export const MIN = 60 * 1000;
export const DOGN = 24 * 60 * MIN;
