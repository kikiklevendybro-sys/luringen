/* rusj.no front page: «Dagens rusj» (the «I dag» strip with today's puzzles and the streak), search,
   category shelves, filters by player count and type, the 18+ gate for drinking games, «Kveldens
   gjeng» (the evening's scoreboard), «Overrask meg» (a slot machine), «Fortsett der dere slapp»,
   the mascot parade and the install-as-app tip.
   Reads window.RUSJ_SPILLISTE (written by the build). Nothing leaves the device. */
(function () {
  "use strict";

  // Old Luringen join links (rusj.no/#CODE) moved to /luringen/. Only real codes are sent on: eight
  // or fifteen characters from Luringen's own alphabet (digits and capital letters without I, L, O
  // and U) – never a place on this page (#fortsett, #overrask, #spill …).
  const hash = location.hash || "";
  if (/^#([0-9A-HJKMNP-TV-Z]{8}|[0-9A-HJKMNP-TV-Z]{15})$/.test(hash) && !document.getElementById(hash.slice(1))) {
    location.replace("/luringen/" + hash);
    return;
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
        <h2 id="dialog-tittel">Er du 18 år eller eldre?</h2>
        <p>Drikkespillene er for voksne. Alkoholfritt teller like mye, ingen skal presses, og vann er alltid lov.</p>
        <div class="dialog-knapper stabel">
          <button type="button" class="knapp" value="ja">Ja, jeg er 18 eller eldre</button>
          <button type="button" class="knapp-2" value="nei" autofocus>Nei</button>
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

  const lagret = les("rusj.portal", {}) || {};
  let antall = Number.isInteger(lagret.antall) ? lagret.antall : 0; // 0 = everyone
  let tagg = typeof lagret.tagg === "string" ? lagret.tagg : "";
  let sok = "";
  if (tagg === "drikke" && !over18) tagg = "";

  const passerAntall = (s) => !antall || (antall >= s.spillere[0] && antall <= s.spillere[1]);
  // The facts on the cards can be searched for in whole phrases: «én mobil», «flere mobiler»,
  // «alene», «mot mobilen». (Word by word they would fit almost every game: «en» is in most texts.)
  const FAKTASOK = [
    [/(^| )(en|1|samme) mobil( |$)/, (s) => s.mobiler !== "hver"],
    [/(^| )(flere mobiler|hver sin mobil)( |$)/, (s) => s.mobiler !== "en"],
    [/(^| )(alene|solo|en spiller|1 spiller)( |$)/, (s) => s.spillere[0] === 1],
    [/(^| )mot (mobilen|maskinen|datamaskinen|pc|pcen)( |$)/, (s) => !!s.motMobilen],
  ];
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
    $("#antall").textContent = antall ? String(antall) : "alle";
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
    $("#alle-tittel").textContent = filtrert ? (synlige ? "Treff" : "") : "Alle spill";
    $("#alle-tittel").classList.toggle("vh", filtrert);
    // A search that (also) fits drinking games, before anyone has said they are 18: one row
    // «Drikkespill (18+)» that opens the question – not «no games fit».
    const bakDora = !over18 && sok ? SPILL.filter((s) => s.alder18 && passerValg(s)).length : 0;
    $("#atten-dor").hidden = !bakDora;
    $("#atten-dor-antall").textContent = bakDora ? `${bakDora} spill for voksne – trykk for å vise` : "";
    $("#ingen-treff").hidden = synlige > 0 || bakDora > 0;
    // The numbers must add up with the badge in the hero (every game) and with «Overrask meg»
    // (the games that can be shown now): while the drinking games are hidden, say so.
    const voksne = SPILL.length - tilgjengelige;
    $("#treff").textContent = filtrert
      ? `Viser ${synlige} av ${tilgjengelige} spill` + (bakDora ? ` + ${bakDora} for voksne (18+)` : "")
      : voksne
        ? `${tilgjengelige} spill + ${voksne} for voksne (18+)`
        : `${tilgjengelige} spill – trykk på ett for å starte`;
    // How many filters are on, on the button (the panel itself may be closed).
    const valgt = (antall ? 1 : 0) + (tagg ? 1 : 0);
    $("#filter-antall").hidden = !valgt;
    $("#filter-antall").textContent = String(valgt);
    filterKnapp.classList.toggle("aktiv", valgt > 0);
    filterKnapp.setAttribute("aria-label", valgt ? `Filter, ${valgt} valgt` : "Filter");
    skriv("rusj.portal", { antall, tagg });
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
    const t = e.target.closest("[data-tagg]");
    if (t) {
      const ny = t.dataset.tagg === tagg ? "" : t.dataset.tagg;
      const var18 = over18;
      if (ny === "drikke" && !over18 && !(await bekreft18())) return;
      tagg = ny;
      if (over18 !== var18) nyAlder();
      else oppdater();
      // «Se alle» on a shelf: the shelves hide, so take the reader to the results and the filter.
      if (t.classList.contains("hylle-alle")) {
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
    { tagg: "fest", tittel: "Til festen", ikon: "🎉" },
    { tagg: "familie", tittel: "Hele familien", ikon: "🏡" },
    { tagg: "barn", tittel: "For barna", ikon: "🧸" },
    { tagg: "daglig", tittel: "Dagens utfordringer", ikon: "📅" },
    { tagg: "klassiker", tittel: "Klassikere", ikon: "👑" },
    { tagg: "tenke", tittel: "Hjernetrim", ikon: "🧠" },
    { tagg: "alene", tittel: "Spill alene", ikon: "🙋" },
    { tagg: "quiz", tittel: "Quiz og kunnskap", ikon: "💡" },
    { tagg: "kort", tittel: "Kortspill", ikon: "🃏" },
    { tagg: "verktoy", tittel: "Nyttige verktøy", ikon: "🧰" },
    { tagg: "drikke", tittel: "Drikkespill 18+", ikon: "🍻", alder18: true },
  ];

  function byggHyller() {
    const ut = [];
    for (const h of HYLLER) {
      // The «I dag» strip already shows today's puzzles: one of the two, not both.
      if (h.tagg === "daglig" && stripeVises) continue;
      // Games where this category is their main thing come first (e.g. a party game on «Til festen»).
      const spill = SPILL.filter((s) => s.tagger.includes(h.tagg) && (h.alder18 || !s.alder18))
        .map((s, n) => ({ s, n, vekt: s.tagger.indexOf(h.tagg) }))
        .sort((a, b) => a.vekt - b.vekt || a.n - b.n)
        .map((x) => x.s);
      if (spill.length < 2) continue;
      let innhold;
      if (h.alder18 && !over18) {
        innhold = `<li class="hylle-port"><button type="button" data-vis18><span class="hylle-port-ikon" aria-hidden="true">🔞</span><b>Vis drikkespillene</b><span>${spill.length} spill for voksne (18+)</span></button></li>`;
      } else {
        innhold = spill.map((s) => kopi(s.id, "hyllekort")).join("");
      }
      // Shown drinking games can be hidden again (a shared family tablet).
      const skjul = h.alder18 && over18 ? `<button type="button" class="hylle-alle hylle-skjul" data-skjul18>Skjul</button>` : "";
      ut.push(`<section class="hylle${h.alder18 ? " hylle-18" : ""}" id="hylle-${h.tagg}" aria-label="${esc(h.tittel)}">
        <div class="hylle-topp"><h3${h.alder18 || h.tagg === "daglig" ? ' tabindex="-1"' : ""}><span aria-hidden="true">${h.ikon}</span> ${esc(h.tittel)}</h3>${skjul}<button type="button" class="hylle-alle" data-tagg="${h.tagg}" aria-label="Se alle: ${esc(h.tittel)}">Se alle</button></div>
        <ul class="hylle-rad">${innhold}</ul>
      </section>`);
    }
    $("#hyller").innerHTML = ut.join("");
    merkFortsett();
  }

  // ---------- Fortsett (games left in the middle) ----------

  // The newest saved state of a game, whatever its version number (rusj.<id>.v1, .v2 …).
  function lagretSpill(id) {
    let beste = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const n = localStorage.key(i);
        if (!n || !n.startsWith(`rusj.${id}.v`) || !/^\d+$/.test(n.slice(`rusj.${id}.v`.length))) continue;
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
      a.setAttribute("aria-label", (pa ? "Fortsett. " : "") + a.dataset.etikett);
      let merke = $(".kort-fortsett", k);
      if (pa && !merke) {
        merke = document.createElement("span");
        merke.className = "kort-fortsett";
        merke.setAttribute("aria-hidden", "true");
        merke.textContent = "Fortsett";
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

  // ---------- Dagens rusj: the «I dag» strip ----------
  // Today's puzzles, what is done, the week and the streak – read from «rusj.daglig», which the
  // games write through the kit (the format is in rusj/DAGLIG.md; the counting in daglig.js).
  // Returning players get the strip at the top; a new visitor gets one slim row under the buttons.

  const D = window.RusjDaglig;
  // The daily puzzles: every game with the tag «daglig» (never a drinking game).
  const DAGLIGE = D ? SPILL.filter((s) => s.tagger.includes("daglig") && !s.alder18 && kilde(s.id)) : [];
  const idag = $("#idag");
  const idagNy = $("#idag-ny");
  const MND = ["JAN", "FEB", "MAR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DES"];
  let stripeVises = false; // the strip is shown – then the shelf «Dagens utfordringer» is left out
  let tegnetDag = 0; // the day the strip was last drawn for
  let idagTikker = null;

  function lesIdag() {
    const iDag = D.dag();
    const st = D.status(les("rusj.daglig", null), DAGLIGE.map((s) => s.id), iDag.nr);
    return { iDag, st, r: D.rekke(st.dager, iDag.nr) };
  }
  const dagligSpill = (id) => DAGLIGE.find((s) => s.id === id);

  function tegnIdag({ iDag, st, r }) {
    const alt = st.ferdige === st.antall;
    const hvert = st.spill.map((x) => ({ x, s: dagligSpill(x.id), t: D.tilstandTekst(x) }));
    const neste = hvert.find((h) => h.x.tilstand === "pagar") || hvert.find((h) => h.x.tilstand === "ny");
    // One round mascot per puzzle (state classes are prefixed: bare words like «tom» mean other
    // things in the kit's stylesheet). The state is in the shape (dashed ring, half ring, ring with a
    // ✓), in the words under it and in the link's name: «Dagens ord, løst, 4 av 6».
    const fliser = hvert
      .map(
        ({ x, s, t }) => `<li><a class="idag-flis t-${x.tilstand}${x.tilstand === "ferdig" && !x.vunnet ? " t-ikke-lost" : ""}" href="/${s.id}/#dagens" style="--kf: ${s.farge}" aria-label="${esc(`${s.dagnavn || s.undertittel}, ${t.lang}`)}">
          <span class="idag-figur">${figur(s.id)}${x.tilstand === "ferdig" ? '<span class="idag-hake">✓</span>' : ""}</span>
          <span class="idag-navn">${esc(s.dagnavn || s.undertittel)}</span>
          <span class="idag-res">${esc(t.kort)}</span>
        </a></li>`,
      )
      .join("");
    const prikker = D.ukeprikker(st.dager, r.hvile, iDag.nr);
    const uke = prikker.map((p) => `<span class="idag-prikk p-${p.tilstand}${p.iDag ? " p-i-dag" : ""}"><i></i>${p.navn.charAt(0).toUpperCase()}</span>`).join("");
    const linje = D.statuslinje(st, r);
    const del = (klasse) => `<button type="button" class="${klasse}" id="idag-del">Del dagen</button>`;
    const knapper = alt
      ? del("knapp mynte")
      : `<a class="knapp rosa" id="idag-neste" href="/${neste.s.id}/#dagens">${neste.x.tilstand === "pagar" ? "Fortsett" : st.ferdige ? "Neste" : "Start"}: ${esc(neste.s.dagnavn || neste.s.undertittel)}</a>` + (st.ferdige ? del("knapp-2") : "");
    // Drawn again on return from a game: keep the keyboard where it was.
    const fokus = idag.contains(document.activeElement) ? document.activeElement.id : "";
    idag.classList.toggle("i-boks", alt);
    idag.innerHTML = `
      <div class="idag-topp">
        <span class="idag-dato" aria-hidden="true"><b>${MND[iDag.m - 1]}</b><i>${iDag.d}</i></span>
        <div class="idag-overskrift"><h2 id="idag-tittel">${alt ? "Dagen er i boks" : "I dag"}</h2><p>${esc(D.datoTekst(iDag))}</p></div>
        ${r.rekke >= 2 ? `<p class="idag-rekke"><span class="vh">${r.rekke} dager på rad</span><span class="idag-flamme" aria-hidden="true">🔥</span><b aria-hidden="true">${r.rekke}</b><span class="idag-rekke-tekst" aria-hidden="true"><i>dager </i>på rad</span></p>` : ""}
      </div>
      <ul class="idag-spill">${fliser}</ul>
      <div class="idag-bunn">
        <div class="idag-uke" role="img" aria-label="${esc(D.ukeTekst(prikker))}">${uke}</div>
        <p class="idag-antall"><b>${st.ferdige} av ${st.antall}</b> i dag</p>
      </div>
      <p class="idag-status" id="idag-status">${esc(linje.tekst)}${linje.klokke ? ` <b id="idag-klokke" role="timer">${D.klokke(D.sekunderTilMidnatt())}</b>` : ""}</p>
      <div class="idag-knapper">${knapper}</div>
      <p class="idag-melding" id="idag-melding" role="status"></p>`;
    if (fokus && $("#" + fokus, idag)) $("#" + fokus, idag).focus({ preventScroll: true });
  }

  // New visitors: one slim row, «I dag: tre nye oppgaver», that leads to the shelf with them.
  function tegnIdagNy(st) {
    $("#idag-ny-figurer").innerHTML = DAGLIGE.slice(0, 4)
      .map((s) => `<span style="--kf: ${s.farge}">${figur(s.id)}</span>`)
      .join("");
    $("#idag-ny-tekst").innerHTML = `<b>I dag:</b> ${st.antall === 1 ? "én ny oppgave" : `${esc(D.tallord(st.antall))} nye oppgaver`}`;
    // A shelf needs two games; with a single daily puzzle the row goes straight to it.
    idagNy.setAttribute("href", DAGLIGE.length >= 2 ? "#hylle-daglig" : `/${DAGLIGE[0].id}/#dagens`);
  }

  function visIdag() {
    clearInterval(idagTikker);
    idagTikker = null;
    if (!DAGLIGE.length || !idag || !idagNy) return;
    const na = lesIdag();
    tegnetDag = na.iDag.nr;
    // The strip is for those who have finished a daily puzzle before, or are in the middle of one.
    stripeVises = na.st.noenGang || na.st.pagar > 0;
    document.body.classList.toggle("daglig-spiller", stripeVises);
    idag.hidden = !stripeVises;
    idagNy.hidden = stripeVises;
    if (stripeVises) tegnIdag(na);
    else tegnIdagNy(na.st);
    // The clock: every second while the countdown to the next day is on the page, otherwise now
    // and then – only to notice that a new day has begun. Never while the page is out of sight.
    if (!document.hidden) idagTikker = setInterval(idagTikk, $("#idag-klokke") ? 1000 : 30000);
  }
  function idagTikk() {
    if (D.dag().nr !== tegnetDag) return oppdaterIdag(); // midnight: new puzzles
    const k = $("#idag-klokke");
    if (k) k.textContent = D.klokke(D.sekunderTilMidnatt());
  }
  // After anything that may have changed the day's state: draw again, and give the shelf «Dagens
  // utfordringer» back or take it away if the strip came or went.
  function oppdaterIdag() {
    const for_ = stripeVises;
    visIdag();
    if (for_ !== stripeVises) byggHyller();
  }

  // «Del dagen»: one text with today's results (never an answer) and the address. The phone's
  // share sheet if there is one, else the clipboard, else the text itself to mark and copy.
  async function delDagen() {
    const { iDag, st, r } = lesIdag();
    const tekst = D.delTekst({ iDag, rekke: r.rekke, linjer: st.spill.map((x) => ({ navn: dagligSpill(x.id).dagnavn || dagligSpill(x.id).undertittel, tilstand: x.tilstand, vunnet: x.vunnet, res: x.res })) });
    const url = "https://rusj.no/";
    try {
      if (navigator.share) {
        await navigator.share({ title: "rusj i dag", text: tekst, url });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // the share sheet was closed
    }
    const hele = tekst + "\n" + url;
    try {
      await navigator.clipboard.writeText(hele);
      const m = $("#idag-melding");
      if (m) m.textContent = "Kopiert! Lim inn der du vil dele.";
    } catch (e) {
      const d = $("#dialog");
      d.innerHTML = `
        <h2 id="dialog-tittel">Del dagen</h2>
        <p>Marker teksten og kopier den dit du vil dele.</p>
        <textarea class="dialog-tekst" id="dialog-tekst" readonly rows="6" aria-label="Dagens resultat">${esc(hele)}</textarea>
        <div class="dialog-knapper"><button type="button" class="knapp" value="ok">Ferdig</button></div>`;
      d.querySelector('[value="ok"]').addEventListener("click", () => d.close());
      d.showModal();
      d.querySelector("textarea").focus();
      d.querySelector("textarea").select();
    }
  }
  if (idag)
    idag.addEventListener("click", (e) => {
      if (e.target.closest("#idag-del")) delDagen();
    });

  if (idagNy)
    idagNy.addEventListener("click", (e) => {
      const hylle = $("#hylle-daglig");
      if (!hylle) return; // a single daily puzzle: the link goes straight to the game
      e.preventDefault();
      if ($("#hyller").hidden) {
        // A filter from last time hides the shelves: show the daily puzzles in the list instead.
        tagg = "daglig";
        sok = "";
        $("#sok").value = "";
        oppdater();
        visFiltre(true);
        $("#spill").focus({ preventScroll: true });
        $("#spill").scrollIntoView({ behavior: rolig() ? "auto" : "smooth", block: "start" });
        return;
      }
      $("h3", hylle).focus({ preventScroll: true });
      hylle.scrollIntoView({ behavior: rolig() ? "auto" : "smooth", block: "center" });
    });

  // Out of sight: no clock. Back in sight, or changed in another tab: up to date.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(idagTikker);
      idagTikker = null;
    } else oppdaterIdag();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === "rusj.daglig") oppdaterIdag();
  });

  // ---------- Mascot parade under the hero (never drinking games) ----------

  function byggParade() {
    const figurer = SPILL.filter((s) => !s.alder18)
      .map((s) => `<a class="parade-figur" href="/${s.id}/" tabindex="-1" style="--kf: ${s.farge}">${figur(s.id)}</a>`)
      .join("");
    // Two copies for a seamless loop; the second one is only for the eye.
    $("#parade").innerHTML = figurer + figurer.replace(/<a /g, '<a aria-hidden="true" ');
  }

  // ---------- Kveldens gjeng ----------

  // Collapsed: the podium, the (up to) three best with points. «Vis alle» shows everyone.
  const KVELD_TOPP = 3;
  let kveldAlle = false;
  function visKveld() {
    const k = les("rusj.kveld", null);
    const fersk = k && Array.isArray(k.spill) && k.spill.length && Date.now() - (k.start || 0) < 12 * 3600 * 1000;
    $("#kveld").hidden = !fersk;
    if (!fersk) return;
    const poeng = new Map();
    for (const s of k.spill)
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
        return `<li class="${plass === 1 && r.p > 0 ? "leder" : ""}"${skjult}><span class="kveld-plass">${merke}</span><span class="kveld-navn">${esc(r.navn)}</span><span class="kveld-poeng">${r.p}<span class="vh"> poeng</span></span></li>`;
      })
      .join("");
    const alle = $("#kveld-alle");
    alle.hidden = tavle.length <= topp.length;
    if (alle.hidden) kveldAlle = false;
    alle.setAttribute("aria-expanded", String(kveldAlle));
    alle.textContent = kveldAlle ? "Vis færre" : `Vis alle ${tavle.length}`;
    const n = k.spill.length;
    $("#kveld-antall").textContent = `${n} spill i kveld`;
  }
  $("#kveld-alle").addEventListener("click", () => {
    kveldAlle = !kveldAlle;
    visKveld();
  });
  $("#kveld-nullstill").addEventListener("click", () => {
    try {
      localStorage.removeItem("rusj.kveld");
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
      <button type="button" class="automat-lukk" data-lukk aria-label="Lukk">×</button>
      <h2 id="automat-tittel">Overrask meg</h2>
      <p class="automat-under" id="automat-under"></p>
      <div class="automat-maskin" aria-hidden="true">
        <span class="automat-lys"></span>
        <div class="automat-vindu"><div class="automat-hjul"></div></div>
        <span class="automat-lys"></span>
      </div>
      <p class="automat-svar" id="automat-svar" aria-live="polite"></p>
      <div class="dialog-knapper">
        <button type="button" class="knapp-2" data-en-til><span aria-hidden="true">🎲</span> En til</button>
        <button type="button" class="knapp" data-spill>Spill!</button>
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
    $("#automat-under").textContent = antall && liste.every(passerAntall) ? `Blant ${liste.length} spill for ${antall} spillere` : `Blant ${liste.length} spill`;
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
    else if (e.target.closest("[data-spill]") && valgt) location.href = `/${valgt.id}/`;
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
  if (!installert && !les("rusj.portal.installSkjult", false)) $("#installtips").hidden = false;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installer = e;
    if (innebygd) return; // the app's browser can't install rusj, whatever it says
    $("#installer-knapp").hidden = false;
    $("#installer-tekst").textContent = "Legg rusj på hjemskjermen, så starter spillene som en app – og de virker uten nett.";
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
      <h2 id="dialog-tittel">Ha rusj som app</h2>
      ${
        ios
          ? `<ol class="dialog-steg"><li>Trykk på <b>Del</b>-knappen <span aria-hidden="true">⬆︎</span> nederst i Safari.</li><li>Velg <b>«Legg til på Hjem-skjerm»</b>.</li><li>Trykk <b>Legg til</b>.</li></ol>`
          : `<ol class="dialog-steg"><li>Åpne menyen i nettleseren <span aria-hidden="true">⋮</span>.</li><li>Velg <b>«Installer app»</b> eller <b>«Legg til på startsiden»</b>.</li></ol>`
      }
      <p>Da starter rusj som en app fra hjemskjermen – og spillene virker uten nett.</p>
      <div class="dialog-knapper"><button type="button" class="knapp" value="ok">Skjønner!</button></div>`;
    d.querySelector('[value="ok"]').addEventListener("click", () => d.close());
    d.showModal();
  }
  $("#installer-knapp").addEventListener("click", installer_);
  $("#installtips-vis").addEventListener("click", installer_);
  $("#installtips-lukk").addEventListener("click", () => {
    $("#installtips").hidden = true;
    skriv("rusj.portal.installSkjult", true);
    $("#spill").focus({ preventScroll: true });
  });

  // ---------- «Send rusj til gjengen»: a big QR code for the table, and the link ----------

  // Inside Instagram/Facebook/Snapchat/TikTok a page can't be installed: say so instead of the steps.
  if (innebygd && !installert) $("#installer-tekst").textContent = `Du er inne i ${innebygd}. Åpne rusj.no i nettleseren for å installere og lagre.`;
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
  if (sendKnapp)
    sendKnapp.addEventListener("click", async () => {
      const d = $("#dialog");
      if (d.open) return;
      const Q = await lastQr(sendKnapp.dataset.qr);
      let qr = "";
      try {
        qr = Q ? Q.qrSvg(Q.lagQr("https://rusj.no/", "M"), { mork: "var(--blekk)", lys: "var(--papir)", kant: 2, etikett: "QR-kode som åpner rusj.no" }) : "";
      } catch (e) {
        qr = "";
      }
      if (d.open) return;
      d.innerHTML = `
        <div class="qr-ark">
          <h2 id="dialog-tittel">Send rusj til gjengen</h2>
          ${qr ? `<div class="qr-stor">${qr}</div>` : `<b class="qr-adresse">rusj.no</b>`}
          <p class="qr-tekst">Skann for å bli med</p>
          ${innebygd ? `<p class="innebygd-tips">Åpne i nettleseren for å installere og lagre.</p>` : ""}
          <p class="qr-melding" id="qr-melding" role="status"></p>
          <div class="dialog-knapper">
            <button type="button" class="knapp-2" value="ok">Lukk</button>
            <button type="button" class="knapp" id="del-lenken">Del lenken</button>
          </div>
        </div>`;
      d.querySelector('[value="ok"]').addEventListener("click", () => d.close());
      d.querySelector("#del-lenken").addEventListener("click", async () => {
        const url = "https://rusj.no/";
        try {
          if (navigator.share) {
            await navigator.share({ title: "rusj", text: "Bli med på rusj – gratis spill for hele gjengen, rett i nettleseren.", url });
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
        $("#qr-melding").textContent = ok ? "Lenken er kopiert. Lim den inn i gruppechatten." : "Kopier lenken: rusj.no";
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
        const navn = (rad.closest("section") && rad.closest("section").getAttribute("aria-label")) || "raden";
        const p = document.createElement("div");
        p.className = "rad-piler";
        p.hidden = true;
        p.innerHTML = `<button type="button" data-rull="-1" aria-label="Bla tilbake i ${esc(navn)}">‹</button><button type="button" data-rull="1" aria-label="Bla videre i ${esc(navn)}">›</button>`;
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
  visIdag(); // before the shelves: it decides whether «Dagens utfordringer» is one of them
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
    oppdaterIdag(); // a daily puzzle may be finished since the page was left
    visFortsett();
    visKveld();
    oppdater();
    sjekkFast();
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
