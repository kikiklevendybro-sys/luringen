/* rusj.no front page: search, category shelves («Dagens utfordringer» with what is done today and
   the streak), filters by player count and type, the 18+ gate for drinking games, «Kveldens
   gjeng» (the evening's scoreboard), «Overrask meg» (a slot machine), «Fortsett der dere slapp»,
   the mascot parade and the install-as-app tip.
   Reads window.RUSJ_SPILLISTE (written by the build). Nothing leaves the device.
   The same file runs every edition (rusj/SPRAK.md): texts through t() from /felles/tekst.js. */
(function () {
  "use strict";

  const T = window.RusjTekst;
  const t = T.t;
  // Another edition keeps its own front-page state (rusj.en.kveld …); rusj.felles is shared.
  const k = (n) => "rusj." + (T.sprak === "nb" ? "" : T.sprak + ".") + n;
  const url = (s) => s.url || "/" + s.id + "/";

  // Old Luringen join links (rusj.no/#CODE) moved to /luringen/. Only real codes are sent on: eight
  // or fifteen characters from Luringen's own alphabet (digits and capital letters without I, L, O
  // and U) – never a place on this page (#fortsett, #overrask, #spill …).
  const hash = location.hash || "";
  if (T.sprak === "nb" && /^#([0-9A-HJKMNP-TV-Z]{8}|[0-9A-HJKMNP-TV-Z]{15})$/.test(hash) && !document.getElementById(hash.slice(1))) {
    location.replace("/luringen/" + hash);
    return;
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // A sentence with markup in it: the text is escaped, then the {places} get the markup.
  const th = (nokkel, html) => esc(t(nokkel)).replace(/\{(\w+)\}/g, (hele, n) => (n in html ? html[n] : hele));
  const SPILL = window.RUSJ_SPILLISTE || [];
  const rolig = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const fra = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

  const les = (n, std) => {
    try {
      const v = localStorage.getItem(n);
      return v == null ? std : JSON.parse(v);
    } catch (e) {
      return std;
    }
  };
  const skriv = (n, v) => {
    try {
      localStorage.setItem(n, JSON.stringify(v));
    } catch (e) {
      /* ignore */
    }
  };

  // Every game has one card in «Alle spill» (built into the page). The shelves, the «Fortsett» row,
  // the parade and «Overrask meg» use copies of it.
  const kilde = (id) => $(`#spillgrid .spillkort[data-id="${id}"]`);
  function kopi(id, klasse) {
    const k = kilde(id);
    if (!k) return "";
    const c = k.cloneNode(true);
    c.hidden = false;
    c.classList.add(klasse);
    return c.outerHTML;
  }
  const figur = (id) => {
    const svg = $(`#spillgrid .spillkort[data-id="${id}"] .kort-figur svg`);
    return svg ? svg.outerHTML : "";
  };

  // ---------- 18+ (shared with the games: rusj.felles.over18) ----------

  const felles = () => les("rusj.felles", {}) || {};
  let over18 = !!felles().over18;
  const visAlder = () => document.body.classList.toggle("over18", over18);
  visAlder();

  function bekreft18() {
    return new Promise((ferdig) => {
      const d = $("#dialog");
      d.innerHTML = `
        <h2 id="dialog-tittel">${esc(t("Er du 18 år eller eldre?"))}</h2>
        <p>${esc(t("Drikkespillene er for voksne. Alkoholfritt teller like mye, ingen skal presses, og vann er alltid lov."))}</p>
        <div class="dialog-knapper stabel">
          <button type="button" class="knapp" value="ja">${esc(t("Ja, jeg er 18 eller eldre"))}</button>
          <button type="button" class="knapp-2" value="nei" autofocus>${esc(t("Nei"))}</button>
        </div>`;
      const svar = (ja) => {
        d.close();
        if (ja) {
          over18 = true;
          skriv("rusj.felles", Object.assign(felles(), { over18: true }));
          visAlder();
        }
        ferdig(ja);
      };
      d.querySelector('[value="ja"]').addEventListener("click", () => svar(true));
      d.querySelector('[value="nei"]').addEventListener("click", () => svar(false));
      d.addEventListener("cancel", () => ferdig(false), { once: true });
      d.showModal();
    });
  }

  // Everything that depends on the 18+ answer.
  function nyAlder() {
    byggHyller();
    visFortsett();
    oppdater();
  }

  // ---------- Search and filters ----------

  const TAGG_NAVN = {};
  $$("#tagger .brikke[data-tagg]").forEach((b) => (TAGG_NAVN[b.dataset.tagg] = b.textContent.trim()));
  const ren = (t) =>
    String(t || "")
      .toLocaleLowerCase("nb")
      .replace(/[æøå]/g, (c) => ({ æ: "\u0001", ø: "\u0002", å: "\u0003" })[c])
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[\u0001-\u0003]/g, (c) => ({ "\u0001": "æ", "\u0002": "ø", "\u0003": "å" })[c])
      .replace(/[^a-z0-9æøå ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // What a search looks in: the game's name, genre, one-liner and search words – and the words
  // people use for its kind of game («selskapsleker», «vors», «bursdag» …), from rusj/seo.json.
  const TAGGSOK = window.RUSJ_TAGGSOK || {};
  const HAYSTACK = new Map(
    SPILL.map((s) => [s.id, ren([s.navn, s.undertittel, s.kort, ...(s.sok || []), ...s.tagger.map((t) => TAGG_NAVN[t] || t), ...s.tagger.flatMap((t) => TAGGSOK[t] || [])].join(" "))]),
  );

  const lagret = les(k("portal"), {}) || {};
  let antall = Number.isInteger(lagret.antall) ? lagret.antall : 0; // 0 = everyone
  let tagg = typeof lagret.tagg === "string" ? lagret.tagg : "";
  let sok = "";
  if (tagg === "drikke" && !over18) tagg = "";

  const passerAntall = (s) => !antall || (antall >= s.spillere[0] && antall <= s.spillere[1]);
  // The facts on the cards can be searched for in whole phrases: «én mobil», «flere mobiler»,
  // «alene», «mot mobilen». (Word by word they would fit almost every game: «en» is in most texts.)
  const FAKTASOK = {
    nb: [
      [/(^| )(en|1|samme) mobil( |$)/, (s) => s.mobiler !== "hver"],
      [/(^| )(flere mobiler|hver sin mobil)( |$)/, (s) => s.mobiler !== "en"],
      [/(^| )(alene|solo|en spiller|1 spiller)( |$)/, (s) => s.spillere[0] === 1],
      [/(^| )mot (mobilen|maskinen|datamaskinen|pc|pcen)( |$)/, (s) => !!s.motMobilen],
    ],
    en: [
      [/(^| )(one|1|same) (phone|mobile)( |$)/, (s) => s.mobiler !== "hver"],
      [/(^| )(several|more|own|their own) (phones|mobiles|phone)( |$)/, (s) => s.mobiler !== "en"],
      [/(^| )(alone|solo|single player|one player|1 player)( |$)/, (s) => s.spillere[0] === 1],
      [/(^| )(against|vs|versus) (the )?(phone|computer|cpu|ai|machine)( |$)/, (s) => !!s.motMobilen],
    ],
    da: [
      [/(^| )(en|1|samme) (mobil|telefon)( |$)/, (s) => s.mobiler !== "hver"],
      [/(^| )(flere mobiler|hver sin mobil|egen mobil)( |$)/, (s) => s.mobiler !== "en"],
      [/(^| )(alene|solo|en spiller|1 spiller)( |$)/, (s) => s.spillere[0] === 1],
      [/(^| )mod (mobilen|computeren|maskinen|pc en|pc)( |$)/, (s) => !!s.motMobilen],
    ],
  }[T.sprak];
  // Search and filters, without the 18+ question.
  const passerValg = (s) => {
    if (!passerAntall(s)) return false;
    if (tagg && !s.tagger.includes(tagg)) return false;
    if (sok) {
      let q = ren(sok);
      for (const [frase, passerSpill] of FAKTASOK) {
        if (!frase.test(q)) continue;
        if (!passerSpill(s)) return false;
        q = q.replace(frase, " ").trim();
      }
      const h = HAYSTACK.get(s.id) || "";
      if (q && !q.split(/ +/).every((ord) => h.includes(ord))) return false;
    }
    return true;
  };
  const passer = (s) => (over18 || !s.alder18) && passerValg(s);

  const filterKnapp = $("#filter-knapp");
  const filtre = $("#filtre");

  function oppdater() {
    $("#antall").textContent = antall ? String(antall) : t("alle");
    $$(".antall-knapp")[0].disabled = antall === 0;
    $$(".antall-knapp")[1].disabled = antall >= 20;
    $$("#tagger .brikke").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tagg === tagg)));
    $("#sok-tom").hidden = !sok;
    let synlige = 0;
    const tilgjengelige = SPILL.filter((s) => over18 || !s.alder18).length;
    for (const s of SPILL) {
      const el = kilde(s.id);
      if (!el) continue;
      const ok = passer(s);
      el.hidden = !ok;
      if (ok) synlige++;
    }
    const filtrert = !!(sok || antall || tagg);
    $("#hyller").hidden = filtrert;
    // With a search or filter on, the line «Viser 3 av 42 spill» is heading enough for the eye: the
    // matches come right under it (and above the keyboard). Screen readers still get «Treff».
    $("#alle-tittel").textContent = filtrert ? (synlige ? t("Treff") : "") : t("Alle spill");
    $("#alle-tittel").classList.toggle("vh", filtrert);
    // A search that (also) fits drinking games, before anyone has said they are 18: one row
    // «Drikkespill (18+)» that opens the question – not «no games fit».
    const bakDora = !over18 && sok ? SPILL.filter((s) => s.alder18 && passerValg(s)).length : 0;
    $("#atten-dor").hidden = !bakDora;
    $("#atten-dor-antall").textContent = bakDora ? t("{n} spill for voksne – trykk for å vise", { n: bakDora }) : "";
    $("#ingen-treff").hidden = synlige > 0 || bakDora > 0;
    // The numbers must add up with the badge in the hero (every game) and with «Overrask meg»
    // (the games that can be shown now): while the drinking games are hidden, say so.
    const voksne = SPILL.length - tilgjengelige;
    $("#treff").textContent = filtrert
      ? t("Viser {synlige} av {n} spill", { synlige, n: tilgjengelige }) + (bakDora ? " " + t("+ {n} for voksne (18+)", { n: bakDora }) : "")
      : voksne
        ? t("{n} spill + {voksne} for voksne (18+)", { n: tilgjengelige, voksne })
        : t("{n} spill – trykk på ett for å starte", { n: tilgjengelige });
    // How many filters are on, on the button (the panel itself may be closed).
    const valgt = (antall ? 1 : 0) + (tagg ? 1 : 0);
    $("#filter-antall").hidden = !valgt;
    $("#filter-antall").textContent = String(valgt);
    filterKnapp.classList.toggle("aktiv", valgt > 0);
    filterKnapp.setAttribute("aria-label", valgt ? t("Filter, {n} valgt", { n: valgt }) : t("Filter"));
    skriv(k("portal"), { antall, tagg });
    sjekkFastSnart(); // the list changed length: the search row may have come loose or stuck
  }

  function visFiltre(apen) {
    filtre.hidden = !apen;
    filterKnapp.setAttribute("aria-expanded", String(apen));
  }
  filterKnapp.addEventListener("click", () => {
    const apen = filtre.hidden;
    visFiltre(apen);
    // Opened from the stuck bar further down: the panel sits under the heading, so go there.
    if (apen && $("#filter").classList.contains("fast")) $("#spill").scrollIntoView({ behavior: rolig() ? "auto" : "smooth", block: "start" });
  });
  filtre.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      visFiltre(false);
      filterKnapp.focus();
    }
  });

  document.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-antall]");
    if (a) {
      const d = Number(a.dataset.antall);
      if (antall === 0 && d > 0) antall = 2;
      else if (antall === 2 && d < 0) antall = 0;
      else antall = Math.max(0, Math.min(20, antall + d));
      oppdater();
      return;
    }
    const b = e.target.closest("[data-tagg]");
    if (b) {
      const ny = b.dataset.tagg === tagg ? "" : b.dataset.tagg;
      const var18 = over18;
      if (ny === "drikke" && !over18 && !(await bekreft18())) return;
      tagg = ny;
      if (over18 !== var18) nyAlder();
      else oppdater();
      // «Se alle» on a shelf: the shelves hide, so take the reader to the results and the filter.
      if (b.classList.contains("hylle-alle")) {
        visFiltre(true);
        $("#spill").focus({ preventScroll: true });
        $("#spill").scrollIntoView({ behavior: rolig() ? "auto" : "smooth", block: "start" });
      }
      return;
    }
    if (e.target.closest("[data-vis18]")) {
      if (await bekreft18()) {
        nyAlder();
        // The button that was pressed is gone: go on to the first drinking game (on its shelf, or
        // among the matches when a search or filter is on).
        const forste = $("#hyller").hidden ? $("#spillgrid .spillkort[data-alder18]:not([hidden]) a") : $(".hylle-18 .spillkort a");
        (forste || $("#spill")).focus();
      }
      return;
    }
    if (e.target.closest("[data-skjul18]")) {
      over18 = false;
      skriv("rusj.felles", Object.assign(felles(), { over18: false }));
      visAlder();
      if (tagg === "drikke") tagg = "";
      nyAlder();
      const h = $(".hylle-18 h3");
      (h || $("#spill")).focus();
    }
  });
  // On a phone the keyboard covers the lower half of the screen. Bring the search row to the top,
  // so the matches right under it can be seen while typing. (This only scrolls the page; the bar
  // itself never changes height, see .filter in portal.css.)
  const beroring = navigator.maxTouchPoints > 0 || !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  // ogsaOpp: also when the page is scrolled past the row (it sticks to the top then). A new search
  // starts a new list, and its matches begin right under the row's own place in the page.
  function sokTilTopps(ogsaOpp) {
    const linje = $("#filter");
    let topp = linje.getBoundingClientRect().top;
    if (ogsaOpp && topp <= 1) {
      // It sticks to the top now: find its own place in the page, where it would be if it did not.
      linje.style.position = "static";
      topp = linje.getBoundingClientRect().top;
      linje.style.position = "";
    }
    if (Math.abs(topp) > 1) {
      const langt = Math.abs(topp) > 2 * window.innerHeight;
      window.scrollTo({ top: Math.max(0, topp + window.scrollY), behavior: rolig() || langt ? "auto" : "smooth" });
    }
  }
  $("#sok").addEventListener("focus", () => {
    // A little later, so the browser's own scrolling for the keyboard is done first.
    if (beroring) setTimeout(() => document.activeElement === $("#sok") && sokTilTopps(false), 250);
  });
  $("#sok").addEventListener("input", (e) => {
    sok = e.target.value.slice(0, 40);
    // An open filter panel that fills much of what the keyboard leaves would hide the matches.
    const synligHoyde = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (sok && !filtre.hidden && filtre.getBoundingClientRect().height > synligHoyde * 0.35) visFiltre(false);
    oppdater();
    sokTilTopps(true);
  });
  $("#sok").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      // «Søk» on the keyboard: put it away; the matches stay right under the search row.
      e.preventDefault();
      e.target.blur();
      sokTilTopps(true);
    }
  });
  $("#sok-tom").addEventListener("click", () => {
    sok = "";
    $("#sok").value = "";
    oppdater();
    $("#sok").focus();
  });

  // ---------- Category shelves ----------

  const HYLLER = [
    { tagg: "fest", tittel: t("Til festen"), ikon: "🎉" },
    { tagg: "familie", tittel: t("Hele familien"), ikon: "🏡" },
    { tagg: "barn", tittel: t("For barna"), ikon: "🧸" },
    { tagg: "daglig", tittel: t("Dagens utfordringer"), ikon: "📅" },
    { tagg: "klassiker", tittel: t("Klassikere"), ikon: "👑" },
    { tagg: "tenke", tittel: t("Hjernetrim"), ikon: "🧠" },
    { tagg: "alene", tittel: t("Spill alene"), ikon: "🙋" },
    { tagg: "quiz", tittel: t("Quiz og kunnskap"), ikon: "💡" },
    { tagg: "kort", tittel: t("Kortspill"), ikon: "🃏" },
    { tagg: "verktoy", tittel: t("Nyttige verktøy"), ikon: "🧰" },
    { tagg: "drikke", tittel: t("Drikkespill 18+"), ikon: "🍻", alder18: true },
  ];

  function byggHyller() {
    const ut = [];
    // Returning players (a daily finished or started before) get «Dagens utfordringer» first.
    const dag = lesDagens();
    const hyller = dag && dag.vendt ? [...HYLLER.filter((h) => h.tagg === "daglig"), ...HYLLER.filter((h) => h.tagg !== "daglig")] : HYLLER;
    for (const h of hyller) {
      // Games where this category is their main thing come first (e.g. a party game on «Til festen»).
      const spill = SPILL.filter((s) => s.tagger.includes(h.tagg) && (h.alder18 || !s.alder18))
        .map((s, n) => ({ s, n, vekt: s.tagger.indexOf(h.tagg) }))
        .sort((a, b) => a.vekt - b.vekt || a.n - b.n)
        .map((x) => x.s);
      if (spill.length < 2) continue;
      let innhold;
      if (h.alder18 && !over18) {
        innhold = `<li class="hylle-port"><button type="button" data-vis18><span class="hylle-port-ikon" aria-hidden="true">🔞</span><b>${esc(t("Vis drikkespillene"))}</b><span>${esc(t("{n} spill for voksne (18+)", { n: spill.length }))}</span></button></li>`;
      } else {
        innhold = spill.map((s) => kopi(s.id, "hyllekort")).join("");
      }
      // Shown drinking games can be hidden again (a shared family tablet).
      const skjul = h.alder18 && over18 ? `<button type="button" class="hylle-alle hylle-skjul" data-skjul18>${esc(t("Skjul"))}</button>` : "";
      ut.push(`<section class="hylle${h.alder18 ? " hylle-18" : ""}" id="hylle-${h.tagg}" aria-label="${esc(h.tittel)}">
        <div class="hylle-topp"><h3${h.alder18 ? ' tabindex="-1"' : ""}><span aria-hidden="true">${h.ikon}</span> ${esc(h.tittel)}</h3>${skjul}<button type="button" class="hylle-alle" data-tagg="${h.tagg}" aria-label="${esc(t("Se alle: {hylle}", { hylle: h.tittel }))}">${esc(t("Se alle"))}</button></div>
        <ul class="hylle-rad">${innhold}</ul>
      </section>`);
    }
    $("#hyller").innerHTML = ut.join("");
    merkDagens();
  }

  // ---------- Fortsett (games left in the middle) ----------

  // The newest saved state of a game, whatever its version number (rusj.<id>.v1, .v2 …).
  function lagretSpill(id) {
    let beste = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const n = localStorage.key(i);
        if (!n || !n.startsWith(`${k(id)}.v`) || !/^\d+$/.test(n.slice(`${k(id)}.v`.length))) continue;
        const l = les(n, null);
        if (l && (!beste || (l._tid || 0) > (beste._tid || 0))) beste = l;
      }
    } catch (e) {
      /* storage blocked */
    }
    return beste;
  }
  const aktive = new Map(); // id -> when it was last played
  function finnAktive() {
    const na = Date.now();
    aktive.clear();
    for (const s of SPILL) {
      if (s.id === "luringen") {
        // Luringen keeps its own state (with the time it was saved): in progress for 12 hours,
        // like the rest. No time stamp = saved by an older version, long ago.
        const l = les("luringen.v1", null);
        if (l && l.spill && l._tid && na - l._tid < 12 * 3600 * 1000) aktive.set(s.id, l._tid);
        continue;
      }
      const l = lagretSpill(s.id);
      // _aktiv is written by the kit (the game decides what counts as "in progress").
      const pagar = l && (l._aktiv != null ? l._aktiv : l.skjerm && l.skjerm !== "hjem");
      if (pagar && l._tid && na - l._tid < 12 * 3600 * 1000) aktive.set(s.id, l._tid);
    }
  }
  finnAktive();

  // A «Fortsett» badge on every copy of a game that is in progress (and in its link text).
  function merkFortsett() {
    for (const k of $$(".spillkort[data-id]")) {
      const pa = aktive.has(k.dataset.id);
      const a = $("a", k);
      if (!a) continue;
      if (a.dataset.etikett == null) a.dataset.etikett = a.getAttribute("aria-label") || "";
      a.setAttribute("aria-label", (pa ? t("Fortsett.") + " " : "") + a.dataset.etikett + (a.dataset.dagens || ""));
      let merke = $(".kort-fortsett", k);
      if (pa && !merke) {
        merke = document.createElement("span");
        merke.className = "kort-fortsett";
        merke.setAttribute("aria-hidden", "true");
        merke.textContent = t("Fortsett");
        a.append(merke);
      } else if (!pa && merke) merke.remove();
    }
  }

  function visFortsett() {
    const ids = SPILL.filter((s) => aktive.has(s.id) && (over18 || !s.alder18))
      .sort((a, b) => aktive.get(b.id) - aktive.get(a.id))
      .map((s) => s.id);
    $("#fortsett").hidden = !ids.length;
    $("#fortsett-rad").innerHTML = ids.map((id) => kopi(id, "rad-kort")).join("");
    merkFortsett();
  }

  // ---------- «Dagens utfordringer»: today on the daily cards ----------
  // What is done today and the streak, read from «rusj.daglig», which the games write through the
  // kit (the format is in rusj/DAGLIG.md; the reading and the counting in daglig.js). Only the
  // phone's own storage: when it is blocked, the page reads as for a new visitor.

  const D = window.RusjDaglig;
  let dagens = null; // { nr, st, rekke, vendt }: what the shelf was last drawn from

  function lesDagens() {
    if (!D) return (dagens = null);
    const nr = D.dag().nr;
    const ider = SPILL.filter((s) => s.tagger.includes("daglig") && !s.alder18).map((s) => s.id);
    const st = D.status(les(k("daglig"), null), ider, nr);
    // A returning player has finished a daily before, or is in the middle of one.
    return (dagens = { nr, st, rekke: D.rekke(st.dager, nr).rekke, vendt: st.noenGang || st.pagar > 0 });
  }

  // A small badge on the picture of each daily card – «✓ 4/6» or «I gang» – and the same in its
  // link name; the streak beside the shelf's heading. Texts from storage only ever go in as text.
  function merkDagens() {
    const hylle = $("#hylle-daglig");
    if (hylle && dagens) {
      const topp = $(".hylle-topp", hylle);
      let flamme = $(".hylle-rekke", topp);
      if (dagens.rekke >= 2) {
        if (!flamme) {
          flamme = document.createElement("span");
          flamme.className = "hylle-rekke";
          flamme.setAttribute("role", "img");
          $("h3", topp).after(flamme);
        }
        flamme.setAttribute("aria-label", t("{n} dager på rad", { n: dagens.rekke }));
        flamme.innerHTML = `<span aria-hidden="true">🔥</span>${dagens.rekke}`;
      } else if (flamme) flamme.remove();

      const stand = new Map(dagens.st.spill.map((x) => [x.id, x]));
      for (const k of $$(".spillkort[data-id]", hylle)) {
        const a = $("a", k);
        const x = stand.get(k.dataset.id);
        if (!a || !x) continue;
        // Straight to today's round, as the old «I dag» strip did (rusj/DAGLIG.md: #dagens).
        const href = a.getAttribute("href") || "";
        if (href && !href.includes("#")) a.setAttribute("href", href + "#dagens");
        const ferdig = x.tilstand === "ferdig";
        a.dataset.dagens = ferdig ? " – " + t("ferdig i dag") + (x.res ? ", " + D.lesbart(x.res) : "") : x.tilstand === "pagar" ? " – " + t("i gang") : "";
        let merke = $(".kort-dagens", k);
        if (!a.dataset.dagens) {
          if (merke) merke.remove();
          continue;
        }
        if (!merke) {
          merke = document.createElement("span");
          merke.className = "kort-dagens";
          merke.setAttribute("aria-hidden", "true");
          $(".kort-figur", a).append(merke);
        }
        merke.classList.toggle("ferdig", ferdig);
        merke.textContent = ferdig ? "✓" + (x.res ? " " + x.res : "") : t("I gang");
      }
    }
    merkFortsett(); // writes the link names, with today's state in them
  }

  // Back from a game, changed in another tab, a new day: up to date. The shelves are built anew
  // only when «Dagens utfordringer» has to move (that would reset how far each row is scrolled).
  function oppdaterDagens() {
    const for_ = !!(dagens && dagens.vendt);
    lesDagens();
    if (dagens && dagens.vendt !== for_) byggHyller();
    else merkDagens();
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) oppdaterDagens();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === k("daglig")) oppdaterDagens();
  });
  // A page left open past midnight: yesterday's ticks go away.
  setInterval(() => {
    if (D && dagens && !document.hidden && D.dag().nr !== dagens.nr) oppdaterDagens();
  }, 60000);

  // ---------- Mascot parade under the hero (never drinking games) ----------

  function byggParade() {
    if (SPILL.filter((s) => !s.alder18).length < 6) {
      const p = $("#parade");
      if (p && p.parentElement) p.parentElement.hidden = true;
      return;
    }
    const figurer = SPILL.filter((s) => !s.alder18)
      .map((s) => `<a class="parade-figur" href="${url(s)}" tabindex="-1" style="--kf: ${s.farge}">${figur(s.id)}</a>`)
      .join("");
    // Two copies for a seamless loop; the second one is only for the eye.
    $("#parade").innerHTML = figurer + figurer.replace(/<a /g, '<a aria-hidden="true" ');
  }

  // ---------- Kveldens gjeng ----------

  // Collapsed: the podium, the (up to) three best with points. «Vis alle» shows everyone.
  const KVELD_TOPP = 3;
  let kveldAlle = false;
  function visKveld() {
    const kv = les(k("kveld"), null);
    const fersk = kv && Array.isArray(kv.spill) && kv.spill.length && Date.now() - (kv.start || 0) < 12 * 3600 * 1000;
    $("#kveld").hidden = !fersk;
    if (!fersk) return;
    const poeng = new Map();
    for (const s of kv.spill)
      for (const r of s.resultat || []) {
        const p = r.plass === 1 ? 3 : r.plass === 2 ? 2 : r.plass === 3 ? 1 : 0;
        poeng.set(r.navn, (poeng.get(r.navn) || 0) + p);
      }
    const tavle = Array.from(poeng, ([navn, p]) => ({ navn, p })).sort((a, b) => b.p - a.p);
    let topp = tavle.filter((r) => r.p > 0).slice(0, KVELD_TOPP);
    if (!topp.length) topp = tavle.slice(0, KVELD_TOPP); // nobody has points yet: never an empty board
    const medaljer = ["🥇", "🥈", "🥉"];
    $("#kveld-liste").innerHTML = tavle
      .map((r) => {
        const plass = 1 + tavle.filter((x) => x.p > r.p).length;
        const skjult = !kveldAlle && !topp.includes(r) ? " hidden" : "";
        // Medals (and the leader's glow) are for points: nobody gets bronze for sharing third place with 0.
        const merke = (r.p > 0 && medaljer[plass - 1]) || plass + ".";
        return `<li class="${plass === 1 && r.p > 0 ? "leder" : ""}"${skjult}><span class="kveld-plass">${merke}</span><span class="kveld-navn">${esc(r.navn)}</span><span class="kveld-poeng">${r.p}<span class="vh"> ${esc(t("poeng"))}</span></span></li>`;
      })
      .join("");
    const alle = $("#kveld-alle");
    alle.hidden = tavle.length <= topp.length;
    if (alle.hidden) kveldAlle = false;
    alle.setAttribute("aria-expanded", String(kveldAlle));
    alle.textContent = kveldAlle ? t("Vis færre") : t("Vis alle {n}", { n: tavle.length });
    const n = kv.spill.length;
    $("#kveld-antall").textContent = t("{n} spill i kveld", { n });
  }
  $("#kveld-alle").addEventListener("click", () => {
    kveldAlle = !kveldAlle;
    visKveld();
  });
  $("#kveld-nullstill").addEventListener("click", () => {
    try {
      localStorage.removeItem(k("kveld"));
    } catch (e) {
      /* ignore */
    }
    visKveld();
    $("#spill").focus();
  });

  // ---------- Overrask meg: a little slot machine ----------

  const automat = $("#automat");
  automat.innerHTML = `
    <div class="automat-inn">
      <button type="button" class="automat-lukk" data-lukk aria-label="${esc(t("Lukk"))}">×</button>
      <h2 id="automat-tittel">${esc(t("Overrask meg"))}</h2>
      <p class="automat-under" id="automat-under"></p>
      <div class="automat-maskin" aria-hidden="true">
        <span class="automat-lys"></span>
        <div class="automat-vindu"><div class="automat-hjul"></div></div>
        <span class="automat-lys"></span>
      </div>
      <p class="automat-svar" id="automat-svar" aria-live="polite"></p>
      <div class="dialog-knapper">
        <button type="button" class="knapp-2" data-en-til><span aria-hidden="true">🎲</span> ${esc(t("En til"))}</button>
        <button type="button" class="knapp" data-spill>${esc(t("Spill!"))}</button>
      </div>
    </div>`;
  const maskin = $(".automat-maskin", automat);
  const hjul = $(".automat-hjul", automat);
  const svar = $("#automat-svar");
  let valgt = null;
  let snurrer = false;
  let hjulAnim = null;

  function kandidater() {
    const alle = SPILL.filter((s) => (over18 || !s.alder18) && kilde(s.id));
    const passende = alle.filter(passerAntall);
    return passende.length ? passende : alle;
  }
  function klar(ja) {
    for (const b of $$("[data-en-til], [data-spill]", automat)) b.setAttribute("aria-disabled", String(!ja));
  }

  async function snurr() {
    const liste = kandidater();
    if (!liste.length) return;
    let vinner = liste[Math.floor(Math.random() * liste.length)];
    for (let n = 0; n < 6 && liste.length > 1 && valgt && vinner.id === valgt.id; n++) vinner = liste[Math.floor(Math.random() * liste.length)];
    valgt = vinner;
    $("#automat-under").textContent = antall && liste.every(passerAntall) ? t("Blant {n} spill for {antall} spillere", { n: liste.length, antall }) : t("Blant {n} spill", { n: liste.length });
    // The reel: random mascots, the winner last.
    const rolle = rolig() ? [] : Array.from({ length: 16 }, () => liste[Math.floor(Math.random() * liste.length)]);
    rolle.push(vinner);
    hjul.innerHTML = rolle.map((s) => `<span class="automat-figur" style="--kf: ${s.farge}">${figur(s.id)}</span>`).join("");
    maskin.classList.remove("ferdig");
    svar.textContent = "";
    if (hjulAnim) hjulAnim.cancel();
    hjulAnim = null;
    if (rolle.length > 1 && hjul.animate) {
      snurrer = true;
      klar(false);
      maskin.classList.add("snurrer");
      const h = hjul.firstElementChild.getBoundingClientRect().height;
      hjulAnim = hjul.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-(rolle.length - 1) * h}px)` }], {
        duration: 1900,
        easing: "cubic-bezier(0.12, 0.72, 0.2, 1.03)",
        fill: "forwards",
      });
      try {
        await hjulAnim.finished;
      } catch (e) {
        return; // cancelled: a new spin or the page came back from memory
      }
      maskin.classList.remove("snurrer");
      snurrer = false;
    } else {
      hjul.style.transform = "none";
    }
    maskin.style.setProperty("--kf", vinner.farge);
    maskin.classList.add("ferdig");
    svar.innerHTML = `<b>${esc(vinner.navn)}</b><span>${esc(vinner.undertittel)}</span><span class="automat-fakta">👥 ${fra(...vinner.spillere)} · ⏱ ${fra(...(vinner.minutter || [5, 15]))} min</span>`;
    klar(true);
    if (automat.open) $("[data-spill]", automat).focus();
  }

  $("#overrask").addEventListener("click", () => {
    if (automat.open) return;
    automat.showModal();
    snurr();
  });
  automat.addEventListener("click", (e) => {
    // A click on the backdrop lands on the <dialog> itself (its content fills it).
    if (e.target === automat || e.target.closest("[data-lukk]")) {
      automat.close();
      return;
    }
    if (snurrer) return;
    if (e.target.closest("[data-en-til]")) snurr();
    else if (e.target.closest("[data-spill]") && valgt) location.href = url(valgt);
  });
  automat.addEventListener("close", () => {
    if (hjulAnim) hjulAnim.cancel();
    hjulAnim = null;
    snurrer = false;
    $("#overrask").focus();
  });

  // ---------- Install as an app ----------

  const installert = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Inside an app's own browser (Instagram, Facebook, Snapchat, TikTok): see «Send rusj til gjengen» below.
  const innebygd = D && D.innebygdNettleser ? D.innebygdNettleser(navigator.userAgent) : "";
  let installer = null;
  if (installert) $("#installer").hidden = true;
  // The quick tip at the top: until it's dismissed or rusj is installed.
  if (!installert && !les(k("portal.installSkjult"), false)) $("#installtips").hidden = false;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installer = e;
    if (innebygd) return; // the app's browser can't install rusj, whatever it says
    $("#installer-knapp").hidden = false;
    $("#installer-tekst").textContent = t("Legg rusj på hjemskjermen, så starter spillene som en app – og de virker uten nett.");
  });
  async function installer_() {
    if (installer) {
      const sporsmal = installer;
      installer = null;
      $("#installer-knapp").hidden = true;
      try {
        await sporsmal.prompt();
        await sporsmal.userChoice;
        return;
      } catch (e) {
        /* the browser would not show its own question after all: show the steps instead */
      }
    }
    const d = $("#dialog");
    d.innerHTML = `
      <h2 id="dialog-tittel">${esc(t("Ha rusj som app"))}</h2>
      ${
        ios
          ? `<ol class="dialog-steg"><li>${th("Trykk på {del}-knappen {pil} nederst i Safari.", { del: `<b>${esc(t("Del"))}</b>`, pil: '<span aria-hidden="true">⬆︎</span>' })}</li><li>${th("Velg {valg}.", { valg: `<b>${esc(t("«Legg til på Hjem-skjerm»"))}</b>` })}</li><li>${th("Trykk {knapp}.", { knapp: `<b>${esc(t("Legg til"))}</b>` })}</li></ol>`
          : `<ol class="dialog-steg"><li>${th("Åpne menyen i nettleseren {meny}.", { meny: '<span aria-hidden="true">⋮</span>' })}</li><li>${th("Velg {valg} eller {annet}.", { valg: `<b>${esc(t("«Installer app»"))}</b>`, annet: `<b>${esc(t("«Legg til på startsiden»"))}</b>` })}</li></ol>`
      }
      <p>${esc(t("Da starter rusj som en app fra hjemskjermen – og spillene virker uten nett."))}</p>
      <div class="dialog-knapper"><button type="button" class="knapp" value="ok">${esc(t("Skjønner!"))}</button></div>`;
    d.querySelector('[value="ok"]').addEventListener("click", () => d.close());
    d.showModal();
  }
  $("#installer-knapp").addEventListener("click", installer_);
  $("#installtips-vis").addEventListener("click", installer_);
  $("#installtips-lukk").addEventListener("click", () => {
    $("#installtips").hidden = true;
    skriv(k("portal.installSkjult"), true);
    $("#spill").focus({ preventScroll: true });
  });

  // ---------- «Send rusj til gjengen»: a big QR code for the table, and the link ----------

  // Inside Instagram/Facebook/Snapchat/TikTok a page can't be installed: say so instead of the steps.
  if (innebygd && !installert) $("#installer-tekst").textContent = t("Du er inne i {app}. Åpne rusj.no i nettleseren for å installere og lagre.", { app: innebygd });
  // The QR encoder is loaded the first time the sheet opens, not with the page.
  let qrLaster = null;
  const lastQr = (src) => {
    if (window.LuringenQr) return Promise.resolve(window.LuringenQr);
    if (!qrLaster)
      qrLaster = new Promise((ok) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = () => ok(window.LuringenQr || null);
        el.onerror = () => {
          qrLaster = null;
          ok(null);
        };
        document.head.appendChild(el);
      });
    return qrLaster;
  };
  const sendKnapp = $("#send-rusj");
  const ADRESSE = "https://rusj.no" + T.forside; // this edition's front page
  const VIST = "rusj.no" + T.forside.replace(/\/$/, "");
  if (sendKnapp)
    sendKnapp.addEventListener("click", async () => {
      const d = $("#dialog");
      if (d.open) return;
      const Q = await lastQr(sendKnapp.dataset.qr);
      let qr = "";
      try {
        qr = Q ? Q.qrSvg(Q.lagQr(ADRESSE, "M"), { mork: "var(--blekk)", lys: "var(--papir)", kant: 2, etikett: t("QR-kode som åpner rusj.no") }) : "";
      } catch (e) {
        qr = "";
      }
      if (d.open) return;
      d.innerHTML = `
        <div class="qr-ark">
          <h2 id="dialog-tittel">${esc(t("Send rusj til gjengen"))}</h2>
          ${qr ? `<div class="qr-stor">${qr}</div>` : `<b class="qr-adresse">${esc(VIST)}</b>`}
          <p class="qr-tekst">${esc(t("Skann for å bli med"))}</p>
          ${innebygd ? `<p class="innebygd-tips">${esc(t("Åpne i nettleseren for å installere og lagre."))}</p>` : ""}
          <p class="qr-melding" id="qr-melding" role="status"></p>
          <div class="dialog-knapper">
            <button type="button" class="knapp-2" value="ok">${esc(t("Lukk"))}</button>
            <button type="button" class="knapp" id="del-lenken">${esc(t("Del lenken"))}</button>
          </div>
        </div>`;
      d.querySelector('[value="ok"]').addEventListener("click", () => d.close());
      d.querySelector("#del-lenken").addEventListener("click", async () => {
        const url = ADRESSE;
        try {
          if (navigator.share) {
            await navigator.share({ title: "rusj", text: t("Bli med på rusj – gratis spill for hele gjengen, rett i nettleseren."), url });
            return;
          }
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
        let ok = false;
        try {
          await navigator.clipboard.writeText(url);
          ok = true;
        } catch (e) {
          ok = false;
        }
        $("#qr-melding").textContent = ok ? t("Lenken er kopiert. Lim den inn i gruppechatten.") : t("Kopier lenken: {adresse}", { adresse: VIST });
      });
      d.addEventListener("close", () => sendKnapp.focus(), { once: true });
      d.showModal();
      d.querySelector("#del-lenken").focus();
    });

  // ---------- Reveal sections on scroll ----------

  if ("IntersectionObserver" in window && !rolig()) {
    const obs = new IntersectionObserver(
      (oppf) => {
        for (const o of oppf) {
          if (o.isIntersecting) {
            o.target.classList.add("synlig");
            obs.unobserve(o.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    $$(".slik, .gjengen, .installer, .bunn").forEach((el) => {
      el.classList.add("avdekk");
      obs.observe(el);
    });
  }

  // The search bar gets a solid background (and a soft shadow) once the page has scrolled in under
  // it: when its heading is a little more than out of sight above. Not at the very point where it
  // starts to stick – that is where a search puts it, and the line right below it must stay clear.
  // Only the background changes, never the height: see .filter.fast in portal.css.
  // (Read from the scroll position, once per frame. An IntersectionObserver on the heading misses a
  // jump straight past it – the End key, a restored scroll position – and leaves the bar see-through.)
  function sjekkFast() {
    sjekkFast.venter = false;
    $("#filter").classList.toggle("fast", $("#spill").getBoundingClientRect().bottom < -14);
  }
  function sjekkFastSnart() {
    if (sjekkFast.venter) return;
    sjekkFast.venter = true;
    requestAnimationFrame(sjekkFast);
  }
  window.addEventListener("scroll", sjekkFastSnart, { passive: true });
  window.addEventListener("resize", sjekkFastSnart);
  sjekkFast();

  // «Finn et spill» goes to the search field.
  const finn = $('a.knapp[href="#spill"]');
  if (finn)
    finn.addEventListener("click", (e) => {
      e.preventDefault();
      // With an on-screen keyboard coming up, start at the search row itself; otherwise at its heading.
      $(beroring ? "#filter" : "#spill").scrollIntoView({ behavior: rolig() ? "auto" : "smooth", block: "start" });
      setTimeout(() => $("#sok").focus({ preventScroll: true }), rolig() ? 0 : 450);
    });

  // The badge in the hero counts every game (the build wrote the same number into the page).
  if ($("#helt-antall")) $("#helt-antall").textContent = String(SPILL.length);

  // ---------- Card rows for mouse users ----------
  // The rows scroll sideways with a finger or a trackpad, but a mouse wheel only scrolls the page.
  // With a mouse: arrow buttons on each row (shown when there is more to see that way), and
  // click-and-drag that never turns into a click on a card.
  const RADER = ".hylle-rad, .fortsett-rad";
  const finPeker = window.matchMedia("(hover: hover) and (pointer: fine)");
  const pilerFor = new WeakMap(); // row → its arrows
  const radFor = new WeakMap(); // arrows → their row
  function oppdaterPiler(rad) {
    const p = pilerFor.get(rad);
    if (!p || !p.isConnected) return;
    const mer = rad.scrollWidth - rad.clientWidth > 4;
    p.hidden = !mer || !finPeker.matches;
    p.querySelector("[data-rull='-1']").disabled = rad.scrollLeft <= 2;
    p.querySelector("[data-rull='1']").disabled = rad.scrollLeft >= rad.scrollWidth - rad.clientWidth - 2;
  }
  function lagPiler() {
    for (const rad of $$(RADER)) {
      if (!(pilerFor.get(rad) && pilerFor.get(rad).isConnected)) {
        const navn = (rad.closest("section") && rad.closest("section").getAttribute("aria-label")) || t("raden");
        const p = document.createElement("div");
        p.className = "rad-piler";
        p.hidden = true;
        p.innerHTML = `<button type="button" data-rull="-1" aria-label="${esc(t("Bla tilbake i {rad}", { rad: navn }))}">‹</button><button type="button" data-rull="1" aria-label="${esc(t("Bla videre i {rad}", { rad: navn }))}">›</button>`;
        // In a shelf the arrows sit in its header, next to «Se alle»; elsewhere just above the row.
        const topp = rad.closest(".hylle") && rad.closest(".hylle").querySelector(".hylle-topp");
        if (topp) topp.insertBefore(p, topp.querySelector(".hylle-alle"));
        else rad.before(p);
        pilerFor.set(rad, p);
        radFor.set(p, rad);
        rad.addEventListener("scroll", () => oppdaterPiler(rad), { passive: true });
      }
      oppdaterPiler(rad);
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".rad-piler [data-rull]");
    if (!b) return;
    const rad = radFor.get(b.parentElement);
    if (!rad) return;
    rad.scrollBy({ left: Number(b.dataset.rull) * Math.max(160, rad.clientWidth * 0.85), behavior: rolig() ? "auto" : "smooth" });
  });
  let dra = null;
  document.addEventListener("pointerdown", (e) => {
    const rad = e.pointerType === "mouse" && e.button === 0 && e.target.closest(RADER);
    if (rad) dra = { rad, x: e.clientX, start: rad.scrollLeft, flyttet: false };
  });
  document.addEventListener("pointermove", (e) => {
    if (!dra) return;
    const dx = e.clientX - dra.x;
    if (!dra.flyttet && Math.abs(dx) < 6) return;
    if (!dra.flyttet) {
      dra.flyttet = true;
      dra.rad.classList.add("drar");
    }
    dra.rad.scrollLeft = dra.start - dx;
  });
  const slipp = () => {
    if (!dra) return;
    const var_ = dra;
    dra = null;
    var_.rad.classList.remove("drar");
    // A drag must not also open the card it started on.
    if (var_.flyttet) document.addEventListener("click", (e) => (e.preventDefault(), e.stopPropagation()), { capture: true, once: true });
  };
  document.addEventListener("pointerup", slipp);
  document.addEventListener("pointercancel", slipp);
  document.addEventListener("dragstart", (e) => {
    if (e.target.closest && e.target.closest(RADER)) e.preventDefault(); // links and images would start a browser drag
  });
  const radObservator = new MutationObserver(lagPiler);
  for (const el of [$("#hyller"), $("#fortsett-rad")]) if (el) radObservator.observe(el, { childList: true, subtree: true });
  window.addEventListener("resize", () => $$(RADER).forEach(oppdaterPiler));
  if (finPeker.addEventListener) finPeker.addEventListener("change", () => $$(RADER).forEach(oppdaterPiler));

  byggParade();
  byggHyller();
  visFortsett();
  visKveld();
  visFiltre(!!(antall || tagg)); // open when filters from last time are still on
  oppdater();

  // The app shortcut «Overrask meg» (a long press on the app icon) opens /#overrask: spin at once.
  if (hash === "#overrask" && automat.showModal) {
    try {
      history.replaceState(null, "", location.pathname + location.search); // not again on a reload
    } catch (e) {
      /* ignore */
    }
    automat.showModal();
    snurr();
  }

  // Back from a game, the browser may show this page from its memory (bfcache) exactly as it was
  // left: an open «Overrask meg», and an old scoreboard and badges. Bring it up to date.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    if (automat.open) automat.close();
    if (!over18 && felles().over18) {
      over18 = true; // confirmed in a game's 18+ gate meanwhile
      visAlder();
      byggHyller();
    }
    finnAktive();
    oppdaterDagens(); // a daily puzzle may be finished since the page was left
    visFortsett();
    visKveld();
    oppdater();
    sjekkFast();
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
