/* rusj.no front page: search, category shelves, filters by player count and type, the 18+ gate
   for drinking games, «Kveldens gjeng» (the evening's scoreboard), "Surprise me", continue badges
   and the install-as-app tip. Reads window.RUSJ_SPILLISTE (written by the build).
   Nothing leaves the device. */
(function () {
  "use strict";

  // Old Luringen join links (rusj.no/#CODE) moved to /luringen/.
  if (/^#([0-9A-Za-z]{8}|[0-9A-Za-z]{15})$/.test(location.hash || "")) {
    location.replace("/luringen/" + location.hash);
    return;
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const SPILL = window.RUSJ_SPILLISTE || [];
  const rolig = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

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

  // ---------- 18+ (shared with the games: rusj.felles.over18) ----------

  const felles = () => les("rusj.felles", {}) || {};
  let over18 = !!felles().over18;
  const visAlder = () => document.body.classList.toggle("over18", over18);
  visAlder();

  function bekreft18() {
    return new Promise((ferdig) => {
      const d = $("#dialog");
      d.innerHTML = `
        <h2 id="dialog-tittel">Er du over 18?</h2>
        <p>Drikkespillene er for voksne. Alkoholfritt teller like mye, ingen skal presses, og vann er alltid lov.</p>
        <div class="dialog-knapper">
          <button type="button" class="knapp-2" value="nei">Nei</button>
          <button type="button" class="knapp" value="ja">Ja, jeg er over 18</button>
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
  const HAYSTACK = new Map(
    SPILL.map((s) => [s.id, ren([s.navn, s.undertittel, s.kort, ...(s.sok || []), ...s.tagger.map((t) => TAGG_NAVN[t] || t)].join(" "))]),
  );

  const lagret = les("rusj.portal", {}) || {};
  let antall = Number.isInteger(lagret.antall) ? lagret.antall : 0; // 0 = everyone
  let tagg = typeof lagret.tagg === "string" ? lagret.tagg : "";
  let sok = "";
  if (tagg === "drikke" && !over18) tagg = "";

  const passer = (s) => {
    if (s.alder18 && !over18) return false;
    if (antall && (antall < s.spillere[0] || antall > s.spillere[1])) return false;
    if (tagg && !s.tagger.includes(tagg)) return false;
    if (sok) {
      const h = HAYSTACK.get(s.id) || "";
      if (!ren(sok).split(" ").every((ord) => h.includes(ord))) return false;
    }
    return true;
  };

  function oppdater() {
    $("#antall").textContent = antall ? String(antall) : "alle";
    $$(".antall-knapp")[0].disabled = antall === 0;
    $$(".antall-knapp")[1].disabled = antall >= 20;
    $$("#tagger .brikke").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tagg === tagg)));
    $("#sok-tom").hidden = !sok;
    let synlige = 0;
    const tilgjengelige = SPILL.filter((s) => over18 || !s.alder18).length;
    for (const s of SPILL) {
      const el = $(`#spillgrid .spillkort[data-id="${s.id}"]`);
      if (!el) continue;
      const ok = passer(s);
      el.hidden = !ok;
      if (ok) synlige++;
    }
    const filtrert = !!(sok || antall || tagg);
    $("#hyller").hidden = filtrert;
    $("#alle-tittel").textContent = filtrert ? (synlige ? "Treff" : "") : "Alle spill";
    $("#ingen-treff").hidden = synlige > 0;
    $("#treff").textContent = !filtrert ? `${tilgjengelige} spill – trykk på ett for å starte` : `Viser ${synlige} av ${tilgjengelige} spill`;
    skriv("rusj.portal", { antall, tagg });
  }

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
      if (ny === "drikke" && !over18 && !(await bekreft18())) return;
      tagg = ny;
      oppdater();
      byggHyller();
      return;
    }
    const port = e.target.closest("[data-vis18]");
    if (port && (await bekreft18())) {
      byggHyller();
      oppdater();
    }
  });
  $("#sok").addEventListener("input", (e) => {
    sok = e.target.value.slice(0, 40);
    oppdater();
  });
  $("#sok").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
      const forste = $("#spillgrid .spillkort:not([hidden])");
      if (forste) forste.scrollIntoView({ behavior: rolig() ? "auto" : "smooth", block: "center" });
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
    { tagg: "klassiker", tittel: "Klassikere", ikon: "♟️" },
    { tagg: "tenke", tittel: "Hjernetrim", ikon: "🧠" },
    { tagg: "alene", tittel: "Når du er alene", ikon: "🙋" },
    { tagg: "quiz", tittel: "Quiz og kunnskap", ikon: "🎓" },
    { tagg: "kort", tittel: "Kortspill", ikon: "🃏" },
    { tagg: "verktoy", tittel: "Nyttige verktøy", ikon: "🧰" },
    { tagg: "drikke", tittel: "Drikkespill 18+", ikon: "🍻", alder18: true },
  ];

  function byggHyller() {
    const ut = [];
    for (const h of HYLLER) {
      // Games where this category is their main thing come first (e.g. a party game on «Til festen»).
      const spill = SPILL.filter((s) => s.tagger.includes(h.tagg) && (h.alder18 || !s.alder18))
        .map((s, n) => ({ s, n, vekt: s.tagger.indexOf(h.tagg) }))
        .sort((a, b) => a.vekt - b.vekt || a.n - b.n)
        .map((x) => x.s);
      if (spill.length < 2) continue;
      let innhold;
      if (h.alder18 && !over18) {
        innhold = `<li class="hylle-port"><button type="button" data-vis18><span class="hylle-port-ikon" aria-hidden="true">🔞</span><b>Vis drikkespillene</b><span>${spill.length} spill for voksne over 18</span></button></li>`;
      } else {
        innhold = spill
          .map((s) => {
            const kilde = $(`#spillgrid .spillkort[data-id="${s.id}"]`);
            if (!kilde) return "";
            const kopi = kilde.cloneNode(true);
            kopi.hidden = false;
            kopi.classList.add("mini");
            return kopi.outerHTML;
          })
          .join("");
      }
      ut.push(`<section class="hylle${h.alder18 ? " hylle-18" : ""}" aria-label="${esc(h.tittel)}">
        <div class="hylle-topp"><h3><span aria-hidden="true">${h.ikon}</span> ${esc(h.tittel)}</h3><button type="button" class="hylle-alle" data-tagg="${h.tagg}">Se alle</button></div>
        <ul class="hylle-rad">${innhold}</ul>
      </section>`);
    }
    $("#hyller").innerHTML = ut.join("");
    merkFortsett();
  }

  // ---------- Continue badges ----------

  const NA = Date.now();
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
  const aktive = new Set();
  for (const s of SPILL) {
    let aktiv = false;
    if (s.id === "luringen") {
      const l = les("luringen.v1", null);
      aktiv = !!(l && l.spill);
    } else {
      const l = lagretSpill(s.id);
      // _aktiv is written by the kit (the game decides what counts as "in progress").
      const pagar = l && (l._aktiv != null ? l._aktiv : l.skjerm && l.skjerm !== "hjem");
      aktiv = !!(pagar && l._tid && NA - l._tid < 12 * 3600 * 1000);
    }
    if (aktiv) aktive.add(s.id);
  }
  function merkFortsett() {
    for (const id of aktive) $$(`.spillkort[data-id="${id}"] .kort-fortsett`).forEach((m) => (m.hidden = false));
  }

  // ---------- Kveldens gjeng ----------

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
    const tavle = Array.from(poeng, ([navn, p]) => ({ navn, p })).sort((a, b) => b.p - a.p).slice(0, 8);
    const medaljer = ["🥇", "🥈", "🥉"];
    $("#kveld-liste").innerHTML = tavle
      .map((r, n) => {
        const plass = 1 + tavle.filter((x) => x.p > r.p).length;
        return `<li class="${plass === 1 ? "leder" : ""}"><span class="kveld-plass">${medaljer[plass - 1] || plass + "."}</span><span class="kveld-navn">${esc(r.navn)}</span><span class="kveld-poeng">${r.p}</span></li>`;
      })
      .join("");
    const n = k.spill.length;
    $("#kveld-antall").textContent = `${n} ${n === 1 ? "spill" : "spill"} i kveld`;
  }
  $("#kveld-nullstill").addEventListener("click", () => {
    try {
      localStorage.removeItem("rusj.kveld");
    } catch (e) {
      /* ignore */
    }
    visKveld();
  });

  // ---------- Surprise me ----------

  let snurrer = false;
  $("#overrask").addEventListener("click", async () => {
    if (snurrer) return;
    let kandidater = $$("#spillgrid .spillkort:not([hidden])").filter((k) => over18 || !k.hasAttribute("data-alder18"));
    if (!kandidater.length) {
      antall = 0;
      tagg = "";
      sok = "";
      $("#sok").value = "";
      oppdater();
      kandidater = $$("#spillgrid .spillkort:not([hidden])");
    }
    const vinner = kandidater[Math.floor(Math.random() * kandidater.length)];
    if (rolig()) {
      location.href = vinner.querySelector("a").href;
      return;
    }
    snurrer = true;
    $("#alle-tittel").scrollIntoView({ behavior: "smooth", block: "start" });
    await new Promise((r) => setTimeout(r, 450));
    let pause = 60;
    let forrige = null;
    for (let n = 0; n < 16; n++) {
      const k = n === 15 ? vinner : kandidater[Math.floor(Math.random() * kandidater.length)];
      if (forrige) forrige.classList.remove("lyser");
      k.classList.add("lyser");
      if (n > 10) k.scrollIntoView({ behavior: "smooth", block: "center" });
      forrige = k;
      await new Promise((r) => setTimeout(r, pause));
      pause *= 1.17;
    }
    vinner.classList.add("vinner");
    await new Promise((r) => setTimeout(r, 1100));
    location.href = vinner.querySelector("a").href;
  });

  // ---------- Install as an app ----------

  const installert = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installer = null;
  if (installert) $("#installer").hidden = true;
  // The quick tip at the top: until it's dismissed or rusj is installed.
  if (!installert && !les("rusj.portal.installSkjult", false)) $("#installtips").hidden = false;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installer = e;
    $("#installer-knapp").hidden = false;
    $("#installer-tekst").textContent = "Legg rusj på hjemskjermen, så starter spillene som en app – og de virker uten nett.";
  });
  async function installer_() {
    if (installer) {
      installer.prompt();
      try {
        await installer.userChoice;
      } catch (e) {
        /* ignore */
      }
      installer = null;
      $("#installer-knapp").hidden = true;
      return;
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
    $$(".slik, .installer, .bunn").forEach((el) => {
      el.classList.add("avdekk");
      obs.observe(el);
    });
  }

  // The filter bar gets a solid background only while it is stuck to the top.
  const vakt = $(".filter-vakt");
  if (vakt && "IntersectionObserver" in window) {
    new IntersectionObserver(([o]) => $(".filter").classList.toggle("fast", !o.isIntersecting)).observe(vakt);
  }

  // «Finn et spill» goes to the search field.
  const finn = $('a.knapp[href="#spill"]');
  if (finn)
    finn.addEventListener("click", (e) => {
      e.preventDefault();
      $("#spill").scrollIntoView({ behavior: rolig() ? "auto" : "smooth", block: "start" });
      setTimeout(() => $("#sok").focus({ preventScroll: true }), rolig() ? 0 : 450);
    });

  byggHyller();
  visKveld();
  merkFortsett();
  oppdater();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
