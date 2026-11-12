/* rusj.no – the language of a page (rusj/SPRAK.md). One edition per page: Norwegian at the root,
   English under /en/, Danish under /da/. The table is keyed by the Norwegian text (gettext style),
   so Norwegian needs no table at all: t("Alle spill") is "Alle spill" there.
   Used by the front page and the pages about rusj (window.RusjTekst, loaded before portal.js) and by
   the build in Node (scripts/sprak.mjs). The kit (rusj.js) carries its own copy of these rules so a
   game page needs no extra file; test/sprak.test.mjs holds the two to the same answers.
   /felles/tekst.<lang>.js sets window.RUSJ_SPRAK and window.RUSJ_TEKST on the other editions. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RusjTekst = Object.assign(api.lag(root.RUSJ_SPRAK, () => [root.RUSJ_TEKST]), api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // The facts of each edition. The kit has the same three in SPRAKENE (rusj/kit/rusj.js).
  const SPRAK = {
    nb: { lokale: "nb-NO", tidssone: "Europe/Oslo", forside: "/", sider: { personvern: "personvern", om: "om", merker: "merker" } },
    en: { lokale: "en-GB", tidssone: "Europe/London", forside: "/en/", sider: { personvern: "privacy", om: "about", merker: "stickers" } },
    da: { lokale: "da-DK", tidssone: "Europe/Copenhagen", forside: "/da/", sider: { personvern: "privatliv", om: "om", merker: "klistermaerker" } },
  };

  const har = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

  // tabeller: () => [table, …] (read at every call, so a table loaded later still counts).
  function lag(sprak, tabeller) {
    sprak = har(SPRAK, sprak) ? sprak : "nb";
    const info = SPRAK[sprak];
    let regler = null;
    const form = (n) => {
      try {
        regler = regler || new Intl.PluralRules(info.lokale);
        return regler.select(Number(n));
      } catch (e) {
        return Number(n) === 1 ? "one" : "other";
      }
    };
    const oppslag = (nokkel) => {
      if (sprak === "nb") return undefined;
      for (const tab of (tabeller && tabeller()) || []) if (har(tab, nokkel)) return tab[nokkel];
      return undefined;
    };
    const velg = (v, n) => (typeof v === "object" ? (har(v, form(n)) ? v[form(n)] : v.other) : v);
    const settInn = (tekst, verdier) => (verdier ? String(tekst).replace(/\{(\w+)\}/g, (hele, k) => (har(verdier, k) ? String(verdier[k]) : hele)) : String(tekst));
    // t("{navn} vant!", { navn }): values go in as text; escaping stays the caller's job.
    // A key "{n} runde|{n} runder" carries the Norwegian singular and plural (chosen by verdier.n);
    // a table value may be { one, other, … } by Intl.PluralRules.
    const t = (nokkel, verdier) => {
      let v = oppslag(nokkel);
      if (v == null) {
        v = nokkel;
        if (typeof v === "string" && v.includes("|")) {
          const [en, flere] = v.split("|");
          v = verdier && Number(verdier.n) === 1 ? en : flere;
        }
      } else v = velg(v, verdier && verdier.n);
      return settInn(v, verdier);
    };
    const tall = (n) => Number(n).toLocaleString(info.lokale);
    // flertall(3, "spill", "spill") → "3 spill"; another edition looks up "spill|spill".
    const flertall = (n, entall, flere) => {
      const v = oppslag(entall + "|" + flere);
      return `${tall(n)} ${v == null ? (Number(n) === 1 ? entall : flere) : velg(v, n)}`;
    };
    // ["A", "B", "C"] → "A, B og C" / "A, B and C".
    const ramsOpp = (liste) => {
      const l = (liste || []).map(String);
      if (sprak !== "nb" && l.length > 1) {
        try {
          return new Intl.ListFormat(info.lokale, { style: "long", type: "conjunction" }).format(l);
        } catch (e) {
          /* fall through */
        }
      }
      return l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " " + t("og") + " " + l[l.length - 1];
    };
    // The address of a fixed page in this edition: side("personvern") → "/en/privacy/".
    const side = (navn) => info.forside + info.sider[navn] + "/";
    return { sprak, lokale: info.lokale, tidssone: info.tidssone, forside: info.forside, side, t, tall, flertall, ramsOpp };
  }

  return { SPRAK, lag };
});
