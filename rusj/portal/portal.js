/* rusj.no front page: filter by player count and type, "Surprise me", continue badges,
   install button. Reads window.RUSJ_SPILLISTE (written by the build). Nothing leaves the device. */
(function () {
  "use strict";

  // Old Luringen join links (rusj.no/#CODE) moved to /luringen/.
  if (/^#([0-9A-Za-z]{8}|[0-9A-Za-z]{15})$/.test(location.hash || "")) {
    location.replace("/luringen/" + location.hash);
    return;
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
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

  // ---------- Filter ----------

  const lagret = les("rusj.portal", {}) || {};
  let antall = Number.isInteger(lagret.antall) ? lagret.antall : 0; // 0 = everyone
  let tagg = typeof lagret.tagg === "string" ? lagret.tagg : "";

  function oppdater() {
    const ut = $("#antall");
    ut.textContent = antall ? String(antall) : "alle";
    $$(".antall-knapp")[0].disabled = antall === 0;
    $$(".antall-knapp")[1].disabled = antall >= 20;
    $$("#tagger .brikke").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tagg === tagg)));
    let synlige = 0;
    for (const s of SPILL) {
      const el = $(`.spillkort[data-id="${s.id}"]`);
      if (!el) continue;
      const ok = (!antall || (antall >= s.spillere[0] && antall <= s.spillere[1])) && (!tagg || s.tagger.includes(tagg));
      el.hidden = !ok;
      if (ok) synlige++;
    }
    $("#ingen-treff").hidden = synlige > 0;
    $("#treff").textContent = synlige === SPILL.length ? `${SPILL.length} spill – trykk på et for å starte` : `Viser ${synlige} av ${SPILL.length} spill`;
    skriv("rusj.portal", { antall, tagg });
  }

  document.addEventListener("click", (e) => {
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
      tagg = t.dataset.tagg === tagg ? "" : t.dataset.tagg;
      oppdater();
    }
  });

  // ---------- Continue badges ----------

  const NA = Date.now();
  for (const s of SPILL) {
    let aktiv = false;
    if (s.id === "luringen") {
      const l = les("luringen.v1", null);
      aktiv = !!(l && l.spill);
    } else {
      const l = les(`rusj.${s.id}.v1`, null);
      aktiv = !!(l && l._tid && NA - l._tid < 12 * 3600 * 1000 && l.skjerm && l.skjerm !== "hjem");
    }
    if (aktiv) {
      const merke = $(`.spillkort[data-id="${s.id}"] .kort-fortsett`);
      if (merke) merke.hidden = false;
    }
  }

  // ---------- Surprise me ----------

  let snurrer = false;
  $("#overrask").addEventListener("click", async () => {
    if (snurrer) return;
    let kandidater = $$(".spillkort:not([hidden])");
    if (!kandidater.length) {
      antall = 0;
      tagg = "";
      oppdater();
      kandidater = $$(".spillkort");
    }
    const vinner = kandidater[Math.floor(Math.random() * kandidater.length)];
    if (rolig()) {
      location.href = vinner.querySelector("a").href;
      return;
    }
    snurrer = true;
    $("#spill").scrollIntoView({ behavior: "smooth", block: "start" });
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

  // ---------- Install ----------

  const frittstaende = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  if (frittstaende || navigator.standalone) $("#installer").hidden = true;
  let installer = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installer = e;
    $("#installer-knapp").hidden = false;
    $("#installer-tekst").textContent = "Legg rusj på hjemskjermen, så starter spillene som en app – og de virker uten nett.";
  });
  $("#installer-knapp").addEventListener("click", async () => {
    if (!installer) return;
    installer.prompt();
    try {
      await installer.userChoice;
    } catch (e) {
      /* ignore */
    }
    installer = null;
    $("#installer-knapp").hidden = true;
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

  oppdater();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
