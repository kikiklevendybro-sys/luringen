/* rusj.no – «Dagens rusj»: the pure helpers behind the «I dag» strip on the front page.
   Reads the storage format described in rusj/DAGLIG.md (old and new), counts the site streak
   with one rest day a week, and writes the text for «Del dagen».
   No DOM and no storage access here: everything is passed in, so the same code runs in the
   browser (window.RusjDaglig) and in the tests (CommonJS). */
(function (root) {
  "use strict";

  // The page's edition (rusj/SPRAK.md): /felles/tekst.js is loaded first in the browser. In Node
  // (the tests) there is none, and everything is Norwegian as before.
  const T = root.RusjTekst || null;
  const NB = !T || T.sprak === "nb";
  const TIDSSONE = T ? T.tidssone : "Europe/Oslo";
  const t = (nokkel, verdier) => (T ? T.t(nokkel, verdier) : verdier ? nokkel.replace(/\{(\w+)\}/g, (h, k) => (k in verdier ? String(verdier[k]) : h)) : nokkel);

  const MAKS_DAGER = 400; // how far back a streak can be read
  const UKEDAGER = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
  const MANEDER = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

  // ---------- Today ----------

  // The same «today» for everyone in Norway, exactly as R.dag in the kit: nr = days since 1970 of
  // the date in Oslo. Plus the weekday (0 = Monday … 6 = Sunday; day 0 was a Thursday).
  function dag(dato) {
    const naa = dato || new Date();
    let a, m, d;
    try {
      const deler = {};
      for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: TIDSSONE, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(naa)) deler[p.type] = Number(p.value);
      a = deler.year;
      m = deler.month;
      d = deler.day;
    } catch (e) {
      /* fall through */
    }
    if (!(a > 0 && m > 0 && d > 0)) {
      a = naa.getFullYear();
      m = naa.getMonth() + 1;
      d = naa.getDate();
    }
    const to = (n) => String(n).padStart(2, "0");
    const nr = Math.floor(Date.UTC(a, m - 1, d) / 86400000);
    return { nr, tekst: `${a}-${to(m)}-${to(d)}`, a, m, d, ukedag: ukedag(nr) };
  }
  const ukedag = (nr) => (((nr + 3) % 7) + 7) % 7;
  const uke = (nr) => Math.floor((nr + 3) / 7); // Monday–Sunday

  // «onsdag 11. november»
  const datoTekst = (iDag) => {
    if (!NB) {
      try {
        return new Intl.DateTimeFormat(T.lokale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(iDag.a, iDag.m - 1, iDag.d)));
      } catch (e) {
        /* fall through */
      }
    }
    return `${UKEDAGER[iDag.ukedag]} ${iDag.d}. ${MANEDER[iDag.m - 1]}`;
  };

  // Seconds until the next day begins in Norway (at least 1). The two nights a year the clocks
  // change, the day is 23 or 25 hours long.
  function sekunderTilMidnatt(dato) {
    const na = (dato || new Date()).getTime();
    const deler = {};
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: TIDSSONE, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(na))
        .forEach((p) => (deler[p.type] = Number(p.value)));
    } catch (e) {
      const l = new Date(na);
      deler.hour = l.getHours();
      deler.minute = l.getMinutes();
      deler.second = l.getSeconds();
    }
    let igjen = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const nr = dag(new Date(na)).nr;
    if (dag(new Date(na + igjen * 1000)).nr === nr) igjen += 3600;
    else if (igjen > 3600 && dag(new Date(na + (igjen - 3600) * 1000)).nr !== nr) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const to = (n) => String(n).padStart(2, "0");
  const klokke = (s) => `${to(Math.floor(s / 3600))}:${to(Math.floor((s % 3600) / 60))}:${to(s % 60)}`; // HH:MM:SS

  // ---------- Reading rusj.daglig (see rusj/DAGLIG.md) ----------

  // A short, plain text from storage: never trusted, never long. (Cut by code point, so an emoji
  // is not split in two.)
  function kortTekst(v, maks) {
    if (typeof v !== "string") return "";
    return Array.from(v.replace(/\s+/g, " ").trim()).slice(0, maks).join("");
  }
  const erDag = (v, iDag) => Number.isInteger(v) && v > 0 && v <= iDag; // a day in the future is a wrong clock
  const heltall = (v, maks) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(maks, Math.floor(Number(v)))) : 0);

  // raa: the parsed value of localStorage «rusj.daglig» (anything at all – it is never trusted).
  // ider: the daily games on the page, in the order they are shown. iDag: today's day number.
  // → { spill: [{ id, tilstand: "ny" | "pagar" | "ferdig", vunnet, res, tekst, rekke }],
  //     antall, ferdige, pagar, dager: Set of day numbers with a finished daily, noenGang }
  function status(raa, ider, iDag) {
    const alle = raa && typeof raa === "object" && !Array.isArray(raa) ? raa : {};
    const dager = new Set();
    let noenGang = false;

    // The kit's day log (new format). Keys are day numbers; a day counts when something was finished.
    const logg = alle._ && typeof alle._ === "object" && alle._.dager;
    if (Array.isArray(logg)) {
      for (const nr of logg) if (erDag(nr, iDag)) dager.add(nr);
    } else if (logg && typeof logg === "object") {
      for (const [k, v] of Object.entries(logg)) {
        const nr = Number(k);
        if (erDag(nr, iDag) && (Array.isArray(v) ? v.length > 0 : !!v)) dager.add(nr);
      }
    }

    // Every game's own entry (old and new format): the day it was last finished, and its own
    // streak – «rekke» days in a row ending that day – which says those days were played too.
    const oppforing = (id) => {
      const e = Object.prototype.hasOwnProperty.call(alle, id) ? alle[id] : null;
      return e && typeof e === "object" && !Array.isArray(e) ? e : null;
    };
    for (const id of Object.keys(alle)) {
      const e = id === "_" ? null : oppforing(id);
      if (!e || !erDag(e.nr, iDag)) continue;
      noenGang = true;
      const n = Math.max(1, heltall(e.rekke, MAKS_DAGER));
      for (let k = 0; k < n && e.nr - k > 0; k++) dager.add(e.nr - k);
    }
    if (dager.size) noenGang = true;

    const spill = ider.map((id) => {
      const e = oppforing(id) || {};
      if (e.nr === iDag) return { id, tilstand: "ferdig", vunnet: !!e.vunnet, res: kortTekst(e.res, 14), tekst: "", rekke: heltall(e.rekke, 9999) };
      const p = e.pagar && typeof e.pagar === "object" && e.pagar.nr === iDag ? e.pagar : null;
      // The game's streak is alive while its last finished daily was yesterday.
      const rekke = e.nr === iDag - 1 ? heltall(e.rekke, 9999) : 0;
      return { id, tilstand: p ? "pagar" : "ny", vunnet: false, res: "", tekst: p ? kortTekst(p.tekst, 14) : "", rekke };
    });
    return {
      spill,
      antall: spill.length,
      ferdige: spill.filter((s) => s.tilstand === "ferdig").length,
      pagar: spill.filter((s) => s.tilstand === "pagar").length,
      dager,
      noenGang,
    };
  }

  // ---------- The site streak ----------

  // Days in a row with at least one finished daily. Rules (rusj/DAGLIG.md):
  //  - Today never breaks a streak while it lasts: until something is finished today, the
  //    streak is counted up to yesterday.
  //  - Each week (Monday–Sunday) forgives ONE missed day – the rest day. A second missed day in
  //    the same week ends the streak. Rest days hold the streak together but are not counted.
  // dager: Set of day numbers. → { rekke, hvile: [day numbers used as rest days], spiltIDag }
  function rekke(dager, iDag) {
    const spiltIDag = dager.has(iDag);
    const hvile = [];
    let venter = []; // missed days that count as rest days only if an older played day follows
    const bruktUke = new Set();
    let n = 0;
    for (let d = spiltIDag ? iDag : iDag - 1, i = 0; d > 0 && i < 10 * MAKS_DAGER; d--, i++) {
      if (dager.has(d)) {
        n++;
        hvile.push(...venter);
        venter = [];
      } else if (bruktUke.has(uke(d))) {
        break;
      } else {
        bruktUke.add(uke(d));
        venter.push(d);
      }
    }
    return { rekke: n, hvile, spiltIDag };
  }

  // The week on the strip, Monday to Sunday: what to draw for each day.
  // → [{ nr, navn, tilstand: "spilt" | "hvile" | "tom" | "kommer", iDag: boolean }]
  function ukeprikker(dager, hvile, iDag) {
    const mandag = iDag - ukedag(iDag);
    return UKEDAGER.map((nbNavn, i) => {
      const nr = mandag + i;
      let navn = nbNavn;
      if (!NB) {
        try {
          navn = new Intl.DateTimeFormat(T.lokale, { weekday: "long", timeZone: "UTC" }).format(new Date(nr * 86400000));
        } catch (e) {
          /* keep it */
        }
      }
      const tilstand = dager.has(nr) && nr <= iDag ? "spilt" : hvile.includes(nr) ? "hvile" : nr > iDag ? "kommer" : "tom";
      return { nr, navn, tilstand, iDag: nr === iDag };
    });
  }
  // For screen readers: what was done – never a list of what was not.
  function ukeTekst(prikker) {
    const liste = (a) => (a.length > 1 && T ? T.ramsOpp(a) : a.length > 1 ? a.slice(0, -1).join(", ") + " og " + a[a.length - 1] : a[0]);
    const spilt = prikker.filter((p) => p.tilstand === "spilt").map((p) => p.navn);
    const hvile = prikker.filter((p) => p.tilstand === "hvile").map((p) => p.navn);
    return t("Denne uka:") + " " + (spilt.length ? t("spilt {dager}", { dager: liste(spilt) }) : t("ingen dager ennå")) + "." + (hvile.length ? " " + t("Hviledag {dager}.", { dager: liste(hvile) }) : "");
  }

  // ---------- Words ----------

  const TALLORD = ["null", "én", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "elleve", "tolv"];
  const tallord = (n) => (NB && TALLORD[n]) || String(n);
  const stor = (s) => s.charAt(0).toLocaleUpperCase(NB ? "nb" : T.lokale) + s.slice(1);

  // A result as it should be read aloud: «4/6» → «4 av 6», «3:42» → «3 minutter og 42 sekunder».
  function lesbart(res) {
    let m = /^(\d+)\/(\d+)$/.exec(res);
    if (m) return t("{n} av {alle}", { n: m[1], alle: m[2] });
    m = /^(\d+):(\d\d)$/.exec(res);
    if (m) {
      const min = Number(m[1]);
      const sek = Number(m[2]);
      const deler = [];
      if (min) deler.push(T ? T.flertall(min, "minutt", "minutter") : `${min} ${min === 1 ? "minutt" : "minutter"}`);
      if (sek || !min) deler.push(T ? T.flertall(sek, "sekund", "sekunder") : `${sek} ${sek === 1 ? "sekund" : "sekunder"}`);
      return T ? T.ramsOpp(deler) : deler.join(" og ");
    }
    return res;
  }

  // The state of one daily as words: for the eye (kort) and for the ear (lang).
  function tilstandTekst(s) {
    if (s.tilstand === "ferdig") {
      const ord = s.vunnet ? t("løst") : t("ferdig");
      return { kort: s.res || stor(ord), lang: ord + (s.res ? ", " + lesbart(s.res) : "") };
    }
    if (s.tilstand === "pagar") return { kort: s.tekst ? t("I gang") + " · " + s.tekst : t("I gang"), lang: t("i gang") + (s.tekst ? ", " + lesbart(s.tekst) : "") };
    return { kort: t("Ny"), lang: t("ny") };
  }

  // The one line under the week: where the day stands. Calm – a broken streak is a new start.
  // → { tekst, klokke: true when the countdown to the next day belongs after the text }
  function statuslinje(st, r) {
    if (st.antall && st.ferdige === st.antall) return { tekst: t("Nye oppgaver om"), klokke: true };
    if (r.spiltIDag) {
      const igjen = st.antall - st.ferdige;
      return { tekst: t("{n} igjen i dag.", { n: stor(tallord(igjen)) }), klokke: false };
    }
    if (r.rekke >= 2) return { tekst: t("Én oppgave i dag holder rekka i gang."), klokke: false };
    if (r.rekke === 1) return { tekst: t("Én oppgave i dag, så er det to dager på rad."), klokke: false };
    return { tekst: t("Ny rekke starter i dag."), klokke: false };
  }

  // «Del dagen»: one text with today's results – never an answer – ready for a chat.
  // linjer: [{ navn, tilstand, vunnet, res }] for the day's dailies (finished ones are listed).
  function delTekst(o) {
    const ferdige = o.linjer.filter((l) => l.tilstand === "ferdig");
    const ut = [t("rusj i dag · {dato}", { dato: datoTekst(o.iDag) })];
    for (const l of ferdige) ut.push(`${l.navn}: ${l.res || (l.vunnet ? t("løst") : t("ferdig"))}`);
    const alle = ferdige.length === o.linjer.length;
    const sum = alle ? t("Dagen er i boks – {n} av {alle}", { n: ferdige.length, alle: o.linjer.length }) : t("{n} av {alle} i dag", { n: ferdige.length, alle: o.linjer.length });
    ut.push(sum + (o.rekke >= 2 ? " · 🔥 " + t("{n} dager på rad", { n: o.rekke }) : ""));
    return ut.join("\n");
  }

  // Opened inside an app's own browser (Instagram, Facebook, Snapchat, TikTok)? There a page can't be
  // installed and storage may vanish, so the front page suggests the real browser. Only the
  // user-agent string, read on the device; nothing is stored or sent. Returns the app's name or "".
  function innebygdNettleser(ua) {
    const u = String(ua || "");
    if (/Instagram/i.test(u)) return "Instagram";
    if (/\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bFBIOS\b|\[FB/i.test(u)) return "Facebook";
    if (/Snapchat/i.test(u)) return "Snapchat";
    if (/TikTok|musical_ly|BytedanceWebview|\btrill_/i.test(u)) return "TikTok";
    return "";
  }

  const api = { innebygdNettleser, dag, ukedag, uke, datoTekst, sekunderTilMidnatt, klokke, status, rekke, ukeprikker, ukeTekst, tallord, stor, lesbart, tilstandTekst, statuslinje, delTekst, MAKS_DAGER };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RusjDaglig = api;
})(typeof self !== "undefined" ? self : this);
