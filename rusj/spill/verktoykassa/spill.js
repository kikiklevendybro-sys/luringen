/* Verktøykassa — small tools for game night, each one tap away from the home screen:
   «Hvem starter?» (everyone puts a finger on the screen; the phone picks one, an order or two teams),
   3D dice, fair teams from the shared names, rock-paper-scissors, a coin, a random number, a score
   counter for up to eight with a crowning, and a countdown / stopwatch. The pure parts are in
   window.RusjVerktoy (tested in test/verktoykassa.test.mjs). */
(function () {
  "use strict";

  // ---------- Pure helpers (no DOM) ----------

  const stokk = (liste, rng) => {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Fair teams: shuffled, dealt round-robin from a random team, so sizes differ by at most one.
  function delLag(antall, antallLag, rng) {
    const lag = Array.from({ length: antallLag }, () => []);
    const forste = Math.floor(rng() * antallLag);
    stokk(Array.from({ length: antall }, (_, i) => i), rng).forEach((i, n) => lag[(forste + n) % antallLag].push(i));
    return lag;
  }

  // Rock-paper-scissors: 0 = draw, 1 = a wins, 2 = b wins.
  const SLAR = { stein: "saks", saks: "papir", papir: "stein" };
  const sspVinner = (a, b) => (a === b ? 0 : SLAR[a] === b ? 1 : 2);

  // A random whole number in [fra, til]; with `unik`, never one of `trukket` (null when all are taken).
  function trekkTall(fra, til, trukket, unik, rng) {
    const lav = Math.min(fra, til);
    const hoy = Math.max(fra, til);
    const storrelse = hoy - lav + 1;
    if (!unik) return lav + Math.floor(rng() * storrelse);
    const brukt = new Set((trukket || []).filter((n) => n >= lav && n <= hoy));
    if (brukt.size >= storrelse) return null;
    if (storrelse - brukt.size > 50 || storrelse > 5000) {
      for (;;) {
        const n = lav + Math.floor(rng() * storrelse);
        if (!brukt.has(n)) return n;
      }
    }
    const ledige = [];
    for (let n = lav; n <= hoy; n++) if (!brukt.has(n)) ledige.push(n);
    return ledige[Math.floor(rng() * ledige.length)];
  }

  // «Hvem starter?»: an order 1…n for n fingers, or team numbers (balanced) for each finger.
  const rekkefolge = (n, rng) => stokk(Array.from({ length: n }, (_, i) => i + 1), rng);
  function fingerLag(n, antallLag, rng) {
    const ut = Array(n);
    delLag(n, antallLag, rng).forEach((lag, k) => lag.forEach((i) => (ut[i] = k)));
    return ut;
  }

  // 0:00,0 for the stopwatch (minutes may pass 60).
  const stoppetid = (ms) => {
    const t = Math.max(0, Math.floor(ms / 100));
    const tideler = t % 10;
    const sek = Math.floor(t / 10) % 60;
    const min = Math.floor(t / 600);
    return `${min}:${String(sek).padStart(2, "0")},${tideler}`;
  };

  const Hjelp = { stokk, delLag, sspVinner, trekkTall, rekkefolge, fingerLag, stoppetid };
  window.RusjVerktoy = Hjelp;

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") return; // loaded by the unit tests

  const esc = R.esc;
  const tilfeldig = () => R.nyttFro() / 4294967296;
  let H;
  let sistFjernet = -1e9; // when a player was last removed from the score counter
  const travelt = { ruller: false, ssp: false, mynt: false, tall: false }; // an animation is running

  const VERKTOY = [
    { id: "starter", navn: "Hvem starter?", tekst: "Alle legger en finger på skjermen – mobilen velger", ikon: "👆", farge: "var(--rosa)" },
    { id: "terninger", navn: "Terninger", tekst: "Kast 1–6 terninger", ikon: "🎲", farge: "var(--aksent)" },
    { id: "lag", navn: "Lagdeler", tekst: "Rettferdige lag", ikon: "👥", farge: "var(--himmel)" },
    { id: "ssp", navn: "Stein, saks, papir", tekst: "Mot mobilen eller hverandre", ikon: "✊", farge: "var(--lilla)" },
    { id: "mynt", navn: "Mynt", tekst: "Kron eller mynt?", ikon: "🪙", farge: "var(--lampe)" },
    { id: "tall", navn: "Tilfeldig tall", tekst: "Velg fra og til – uten å gjenta tall", ikon: "🔢", farge: "var(--mynte)" },
    { id: "poeng", navn: "Poengteller", tekst: "Opptil åtte spillere", ikon: "🏆", farge: "var(--oransje)" },
    { id: "klokke", navn: "Klokke", tekst: "Nedtelling og stoppeklokke", ikon: "⏱️", farge: "var(--rod)" },
  ];
  const verktoy = (id) => VERKTOY.find((v) => v.id === id);

  const HENDER = {
    stein: { navn: "Stein", ikon: "✊" },
    saks: { navn: "Saks", ikon: "✌️" },
    papir: { navn: "Papir", ikon: "✋" },
  };

  // ---------- 3D dice (a CSS cube, as in Terninga) ----------

  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const SIDE = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const VIPP = "rotateX(-21deg) rotateY(12deg)";
  const KUBE = [1, 2, 3, 4, 5, 6].map((n) => `<span class="vk-side s${n}">${PIPS[n].map((p) => `<i class="p${p}"></i>`).join("")}</span>`).join("");
  const pose = (v, z, tx, ty) => `${VIPP} rotateZ(${z}deg) rotateX(${SIDE[v][0] + 360 * (tx || 0)}deg) rotateY(${SIDE[v][1] + 360 * (ty || 0)}deg)`;
  const nyTerning = () => 1 + Math.floor(tilfeldig() * 6);

  function rasle() {
    for (let k = 0; k < 7; k++) R.lyd.stoy(k * 0.034 + Math.random() * 0.012, 0.024, 0.08 + Math.random() * 0.07, 2600 + Math.random() * 2800);
  }
  function klakk(t, styrke) {
    R.lyd.stoy(t, 0.04, 0.3 * styrke, 1300 + Math.random() * 700);
    R.lyd.tone(160 + Math.random() * 80, t, 0.07, "triangle", 0.15 * styrke, 105);
  }

  function animerTerninger(fra, fraVri, til, tilVri) {
    return new Promise((ferdig) => {
      const kuber = R.$$("#vk-terninger .vk-kube");
      if (!kuber.length) return ferdig();
      if (R.rolig() || !kuber[0].animate) {
        kuber.forEach((k, i) => (k.style.transform = pose(til[i], tilVri[i])));
        setTimeout(ferdig, 120);
        return;
      }
      let lengst = 0;
      kuber.forEach((kube, i) => {
        const ms = 860 + i * 70 + Math.random() * 120;
        lengst = Math.max(lengst, ms);
        const tx = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
        const ty = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
        const v0 = fra[i] || 1;
        const z0 = fraVri[i] || 0;
        // From where it rests (a new die appears from the cup): a dip, a tumbling flight, landing, bounce.
        const a = kube.animate(
          [
            { transform: pose(v0, z0), offset: 0 },
            { transform: pose(v0, z0 + (tx > 0 ? 25 : -25)), offset: 0.12, easing: "cubic-bezier(.3,.55,.3,1)" },
            { transform: pose(til[i], tilVri[i], tx, ty), offset: 1 },
          ],
          { duration: ms, fill: "both" },
        );
        a.onfinish = () => {
          kube.style.transform = pose(til[i], tilVri[i]);
          a.cancel();
        };
        const dx = Math.round((Math.random() * 2 - 1) * 22);
        const hopp = kube.parentElement.animate(
          [
            { transform: "translate(0, 0) scale(1)", offset: 0, easing: "ease-out" },
            { transform: `translate(${Math.round(dx * 0.3)}px, 12px) scale(.88)`, offset: 0.12, easing: "cubic-bezier(.2,.7,.4,1)" },
            { transform: `translate(${dx}px, -48px) scale(1.1)`, offset: 0.42, easing: "cubic-bezier(.6,0,.9,.5)" },
            { transform: "translate(0, 0) scale(1)", offset: 0.66, easing: "cubic-bezier(.2,.7,.4,1)" },
            { transform: "translate(0, -9px) scale(1.02)", offset: 0.82, easing: "cubic-bezier(.6,0,.9,.5)" },
            { transform: "translate(0, 0) scale(1)", offset: 1 },
          ],
          { duration: ms },
        );
        hopp.onfinish = () => hopp.cancel();
        klakk((ms * 0.66) / 1000, 1);
        klakk((ms * 0.99) / 1000, 0.45);
      });
      rasle();
      setTimeout(() => R.vibrer([14, 60, 10, 50, 8]), 570); // when the first die lands
      setTimeout(ferdig, lengst + 40);
    });
  }

  // ---------- «Hvem starter?» – fingers on the screen ----------
  // The fingers are not part of the saved state: they only exist while they touch the glass.

  const FINGERFARGER = [1, 4, 9, 7, 6, 5, 2, 13, 11, 10, 3, 18].map((n) => `var(--p${n})`);
  const fingre = new Map(); // pointerId → { x, y, el, farge }
  let padFase = "klar"; // klar → venter (two or more fingers, held still) → teller → valgt
  let padTid = null;
  let padNullstill = null;
  let fargeNr = 0;

  const pad = () => document.getElementById("vk-pad");

  function padHjelp(tittel, tekst) {
    const p = pad();
    if (!p) return;
    const t = p.querySelector(".vk-pad-hjelp b");
    const s = p.querySelector(".vk-pad-hjelp span:last-child");
    if (t) t.textContent = tittel;
    if (s) s.textContent = tekst;
  }

  function nullstillPad(beholdFingre) {
    clearTimeout(padTid);
    clearTimeout(padNullstill);
    padTid = null;
    padNullstill = null;
    padFase = "klar";
    const p = pad();
    if (p) {
      p.classList.remove("venter", "teller", "valgt", "har-fingre");
      p.style.removeProperty("--vx");
      p.style.removeProperty("--vy");
      p.querySelectorAll(".vk-resultat").forEach((el) => el.remove());
    }
    for (const [id, f] of fingre) {
      if (!beholdFingre) {
        f.el.remove();
        fingre.delete(id);
      } else f.el.className = "vk-finger";
    }
    if (p) p.querySelectorAll(".vk-finger").forEach((el) => {
      if (![...fingre.values()].some((f) => f.el === el)) el.remove();
    });
    oppdaterPad();
  }

  function oppdaterPad() {
    const p = pad();
    if (!p) return;
    const n = fingre.size;
    p.classList.toggle("har-fingre", n > 0);
    if (padFase === "valgt") return;
    if (n === 0) padHjelp("Alle legger en finger på skjermen", "Hold den i ro – så velger mobilen.");
    else if (n === 1) padHjelp("Én finger …", "Flere må være med!");
    else padHjelp(`${n} fingrer`, "Hold stille …");
  }

  function fingerEndret() {
    if (padFase === "valgt") return;
    clearTimeout(padTid);
    const p = pad();
    if (!p) return;
    p.classList.remove("teller");
    if (fingre.size >= 2) {
      padFase = "venter";
      p.classList.add("venter");
      padTid = setTimeout(startTelling, 1100);
    } else {
      padFase = "klar";
      p.classList.remove("venter");
    }
    oppdaterPad();
  }

  function startTelling() {
    const p = pad();
    if (!p || fingre.size < 2) return;
    padFase = "teller";
    p.classList.add("teller");
    const ms = R.rolig() ? 600 : 1500;
    for (let k = 0; k < 3; k++) R.lyd.tone(660 + k * 110, (k * ms) / 3000, 0.08, "triangle", 0.1);
    R.vibrer(10);
    padTid = setTimeout(velgFinger, ms);
  }

  function velgFinger() {
    const p = pad();
    const liste = [...fingre.values()];
    if (!p || liste.length < 2) return;
    padFase = "valgt";
    p.classList.remove("venter", "teller");
    p.classList.add("valgt");
    const modus = R.S.starter.modus;
    const rng = tilfeldig;
    const merke = (f, html) => {
      if (f.y < 120) f.el.classList.add("nede"); // near the top edge: the label goes under the finger
      f.el.insertAdjacentHTML("beforeend", `<span class="vk-resultat">${html}</span>`);
    };
    if (modus === "rekke") {
      const nr = rekkefolge(liste.length, rng);
      liste.forEach((f, i) => {
        f.el.dataset.nr = nr[i];
        f.el.classList.add("nummer");
        f.el.style.setProperty("--forsinkelse", `${(nr[i] - 1) * (R.rolig() ? 0 : 0.28)}s`);
        merke(f, `<b>${nr[i]}</b>`);
        if (nr[i] === 1) f.el.classList.add("vinner");
      });
      liste.forEach((_, i) => setTimeout(() => R.lyd.tone(520 + i * 90, 0, 0.12, "triangle", 0.14), R.rolig() ? 0 : i * 280));
      R.si(`Rekkefølgen er klar for ${liste.length} fingrer.`);
      padHjelp("Rekkefølgen er klar!", "Nummer 1 begynner.");
    } else if (modus === "lag") {
      const lag = fingerLag(liste.length, 2, rng);
      liste.forEach((f, i) => {
        f.el.dataset.lag = lag[i];
        f.el.classList.add("lag");
        f.el.style.setProperty("--ff", R.LAG[lag[i]].farge); // the circle takes the team colour
        merke(f, `<b>Lag ${esc(R.LAG[lag[i]].navn)}</b>`);
      });
      R.lyd.riktig();
      R.si("Lagene er klare: Lag Rosa og Lag Gul.");
      padHjelp("Lag Rosa mot Lag Gul!", "Fargen under fingeren viser laget ditt.");
    } else {
      const vinner = liste[Math.floor(rng() * liste.length)];
      liste.forEach((f) => f.el.classList.add(f === vinner ? "vinner" : "taper"));
      merke(vinner, "<b>Du starter!</b>");
      const r = p.getBoundingClientRect();
      p.style.setProperty("--vx", `${((vinner.x / r.width) * 100).toFixed(1)}%`);
      p.style.setProperty("--vy", `${((vinner.y / r.height) * 100).toFixed(1)}%`);
      R.lyd.fanfare();
      R.si("En finger er valgt. Den som har den lysende ringen, starter!");
      padHjelp("", "");
    }
    R.vibrer([60, 40, 120]);
    R.statistikk("starter", { modus, fingre: liste.length });
  }

  function padStart(e) {
    const p = e.target.closest && e.target.closest("#vk-pad");
    if (!p) return;
    e.preventDefault();
    if (padFase === "valgt") {
      if (fingre.size > 0) return; // the result stays until every finger is lifted
      nullstillPad(false);
    }
    const r = p.getBoundingClientRect();
    const el = document.createElement("span");
    const farge = FINGERFARGER[fargeNr++ % FINGERFARGER.length];
    el.className = "vk-finger";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--ff", farge);
    const f = { x: e.clientX - r.left, y: e.clientY - r.top, el, farge };
    el.style.transform = `translate(${f.x}px, ${f.y}px)`;
    el.innerHTML = '<svg class="vk-finger-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" pathLength="100"/></svg>';
    p.appendChild(el);
    fingre.set(e.pointerId, f);
    try {
      p.setPointerCapture(e.pointerId);
    } catch (feil) {
      /* not all pointers can be captured */
    }
    R.lyd.pop();
    R.vibrer(8);
    fingerEndret();
  }
  function padFlytt(e) {
    const f = fingre.get(e.pointerId);
    const p = pad();
    if (!f || !p) return;
    const r = p.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // A finger that slides far counts as a new placement (wait again), small tremors don't.
    const langt = Math.hypot(x - f.x, y - f.y) > 30;
    f.x = x;
    f.y = y;
    f.el.style.transform = `translate(${x}px, ${y}px)`;
    if (langt && padFase !== "valgt") fingerEndret();
  }
  function padSlutt(e) {
    const f = fingre.get(e.pointerId);
    if (!f) return;
    fingre.delete(e.pointerId);
    if (padFase === "valgt") {
      f.el.classList.add("loftet");
      if (!fingre.size) {
        clearTimeout(padNullstill);
        padNullstill = setTimeout(() => nullstillPad(false), 3500);
      }
      return;
    }
    f.el.classList.add("borte");
    setTimeout(() => f.el.remove(), 260);
    fingerEndret();
  }
  document.addEventListener("pointerdown", padStart);
  document.addEventListener("pointermove", padFlytt);
  document.addEventListener("pointerup", padSlutt);
  document.addEventListener("pointercancel", padSlutt);
  // No magnifier, text selection or context menu while fingers rest on the pad (iOS/Android).
  document.addEventListener("touchstart", (e) => {
    if (e.target.closest && e.target.closest("#vk-pad")) e.preventDefault();
  }, { passive: false });
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest && e.target.closest("#vk-pad")) e.preventDefault();
  });

  // ---------- Coin ----------

  const KRONE_SVG =
    '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M22 70 L16 34 L34 50 L50 26 L66 50 L84 34 L78 70 Z" fill="#fff2c4" stroke="#7a4f00" stroke-width="5" stroke-linejoin="round"/><path d="M24 78 H76" stroke="#7a4f00" stroke-width="6" stroke-linecap="round"/><circle cx="16" cy="32" r="5" fill="#fff2c4" stroke="#7a4f00" stroke-width="4"/><circle cx="50" cy="23" r="5" fill="#fff2c4" stroke="#7a4f00" stroke-width="4"/><circle cx="84" cy="32" r="5" fill="#fff2c4" stroke="#7a4f00" stroke-width="4"/></svg>';
  const myntHtml = (side) => `<span class="vk-mynt-skive" style="transform: rotateX(${side === "mynt" ? 180 : 0}deg)">
      ${Array.from({ length: 7 }, (_, k) => `<span class="vk-mynt-kant" style="transform: translateZ(${k - 3}px)"></span>`).join("")}
      <span class="vk-mynt-side kron">${KRONE_SVG}</span>
      <span class="vk-mynt-side mynt"><b>1</b><small>KRONE</small></span>
    </span>`;

  // ---------- Score counter ----------

  const poengRader = (S) => S.poeng.verdier.slice(0, S.poeng.antall).map((p, i) => ({ i, poeng: p }));
  const pagar = (S) => S.poeng.verdier.slice(0, S.poeng.antall).some((p) => p !== 0);

  // ---------- Clock ----------

  const igjenMs = (k) => (k.slutt ? Math.max(0, k.slutt - Date.now()) : k.pause != null ? k.pause : k.sekunder * 1000);
  const stoppMs = (st) => st.akk + (st.start ? Date.now() - st.start : 0);
  const minSek = (sek) => (sek >= 60 ? `${Math.floor(sek / 60)} min${sek % 60 ? ` ${sek % 60} s` : ""}` : `${sek} s`);

  function startNedtelling(S) {
    const k = S.klokke;
    const igjen = igjenMs(k);
    if (igjen <= 0) return;
    const tidligere = R.timer("vk-ned");
    if (tidligere) tidligere.stopp();
    new R.Timer({
      id: "vk-ned",
      sekunder: igjen / 1000,
      vedSlutt() {
        k.slutt = null;
        k.pause = null;
        k.ferdig = true;
        R.lagre();
        if (R.S.skjerm === "klokke") {
          R.vis();
          const ring = R.$("#vk-ned");
          if (ring) ring.classList.add("ute");
        }
        R.si("Tiden er ute!");
      },
    }).start();
  }

  // ---------- Start ----------

  R.start({
    id: "verktoykassa",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: Math.max(2, Math.min(20, R.felles.navn.filter((n) => String(n || "").trim()).length || 4)),
      starter: { modus: "en" },
      terninger: { antall: 2, verdier: [3, 5], vri: [0, 0], historikk: [] },
      lag: { antall: 2, fordeling: null },
      ssp: { modus: "mobil", du: 0, mobil: 0, likt: 0, siste: null, a: null, b: null, poengA: 0, poengB: 0, resultat: null },
      mynt: { side: "kron", kron: 0, mynt: 0, rekke: [] },
      tall: { fra: 1, til: 100, unik: false, trukket: [], siste: null },
      poeng: { antall: 2, verdier: [0, 0, 0, 0, 0, 0, 0, 0], steg: 1, angre: null },
      klokke: { modus: "ned", sekunder: 60, slutt: null, pause: null, ferdig: false, stopp: { start: null, akk: 0, runder: [] } },
    }),

    lastet(S) {
      const d = R.app.tilstand();
      for (const k of ["starter", "terninger", "lag", "ssp", "mynt", "tall", "poeng", "klokke"]) {
        if (!S[k] || typeof S[k] !== "object") S[k] = d[k];
        else S[k] = Object.assign({}, d[k], S[k]);
      }
      S.antall = R.klamp(Number(S.antall) || 4, 2, 20);
      if (!["en", "rekke", "lag"].includes(S.starter.modus)) S.starter.modus = "en";
      const t = S.terninger;
      t.antall = R.klamp(Number(t.antall) || 2, 1, 6);
      if (!Array.isArray(t.verdier) || t.verdier.length !== t.antall || !t.verdier.every((v) => v >= 1 && v <= 6)) t.verdier = Array.from({ length: t.antall }, () => 1 + Math.floor(Math.random() * 6));
      if (!Array.isArray(t.vri) || t.vri.length !== t.antall) t.vri = t.verdier.map(() => 0);
      if (!Array.isArray(t.historikk)) t.historikk = [];
      S.lag.antall = R.klamp(Number(S.lag.antall) || 2, 2, 4);
      const f = S.lag.fordeling;
      if (f && !(Array.isArray(f) && f.length === S.lag.antall && f.flat().length === S.antall)) S.lag.fordeling = null;
      if (!["mobil", "to"].includes(S.ssp.modus)) S.ssp.modus = "mobil";
      if (!["kron", "mynt"].includes(S.mynt.side)) S.mynt.side = "kron";
      if (!Array.isArray(S.mynt.rekke)) S.mynt.rekke = [];
      if (!Array.isArray(S.tall.trukket)) S.tall.trukket = [];
      S.poeng.antall = R.klamp(Number(S.poeng.antall) || 2, 1, 8);
      if (!Array.isArray(S.poeng.verdier) || S.poeng.verdier.length !== 8) S.poeng.verdier = Array(8).fill(0);
      if (![1, 5, 10].includes(S.poeng.steg)) S.poeng.steg = 1;
      const k = S.klokke;
      if (!["ned", "stopp"].includes(k.modus)) k.modus = "ned";
      k.sekunder = R.klamp(Number(k.sekunder) || 60, 10, 5940);
      if (!k.stopp || typeof k.stopp !== "object") k.stopp = d.klokke.stopp;
      if (!Array.isArray(k.stopp.runder)) k.stopp.runder = [];
      if (S.skjerm === "kaaring" && !pagar(S)) S.skjerm = "poeng";
    },

    vedSpillere(S) {
      S.lag.fordeling = null;
      S.lag.antall = Math.min(S.lag.antall, Math.max(2, Math.min(4, S.antall)));
    },

    regler: {
      intro: "Små verktøy til spillkvelden. Alt virker uten nett, og ingenting sendes noe sted.",
      steg: [
        ["Hvem starter?", "Alle legger en finger på skjermen og holder den i ro. Etter et lite øyeblikk velger mobilen én – eller en rekkefølge, eller to lag."],
        ["Kast, trekk og del", "Terninger, rettferdige lag, «Stein, saks, papir», kron eller mynt og et tilfeldig tall – ett trykk unna."],
        ["Tell poeng og ta tiden", "Poengtelleren holder styr på opptil åtte spillere. Klokka teller ned eller tar tiden."],
      ],
      tips: [
        "«Hvem starter?» virker best når mobilen ligger flatt på bordet.",
        "Navnene du skriver inn, huskes i alle spillene på rusj.no.",
        "Trykket feil i poengtelleren? «Angre» tar det siste trykket tilbake.",
        "Ingen berøringsskjerm? Bruk «Trekk et navn i stedet».",
      ],
    },

    skjermer: {
      // ---------- The toolbox ----------
      hjem: {
        tilbake: "portal",
        vis(S) {
          const k = S.klokke;
          const merknad = {
            poeng: pagar(S) ? `Pågår · ${R.flertall(S.poeng.antall, "spiller", "spillere")}` : null,
            klokke: k.slutt ? `Går · ${R.formaterTid(igjenMs(k) / 1000)} igjen` : k.stopp.start ? "Stoppeklokka går" : null,
          };
          const [helt, ...resten] = VERKTOY;
          return `
            <div class="vk-topp">
              ${R.figur()}
              <div class="vk-topp-tekst">
                <h1 id="skjerm-tittel">Verktøykassa</h1>
                <span class="undertittel">Festverktøy</span>
              </div>
            </div>
            <button class="vk-helt" data-h="apne" data-v="${helt.id}">
              <span class="vk-helt-fingre" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
              <span class="vk-helt-tekst"><b>${esc(helt.navn)}</b><span>${esc(helt.tekst)}</span></span>
            </button>
            <div class="vk-verktoy">${resten
              .map(
                (v) => `<button class="vk-flis" data-h="apne" data-v="${v.id}" style="--vf: ${v.farge}">
                  <span class="vk-flis-ikon" aria-hidden="true">${v.ikon}</span>
                  <b>${esc(v.navn)}</b>
                  <span>${esc(merknad[v.id] || v.tekst)}</span>
                </button>`,
              )
              .join("")}</div>
            ${R.ui.merker([["8", "verktøy"], ["1–20", "spillere"], ["0", "reklame"]])}`;
        },
      },

      // ---------- Hvem starter? ----------
      starter: {
        tittel: "Hvem starter?",
        tilbake: "hjem",
        vis: (S) => `
          <h1 class="vh" id="skjerm-tittel">Hvem starter?</h1>
          ${R.ui.seg("starter-modus", [["en", "Én starter"], ["rekke", "Rekkefølge"], ["lag", "To lag"]], S.starter.modus, { etikett: "Hva skal mobilen velge?" })}
          <div class="vk-pad" id="vk-pad" data-modus="${esc(S.starter.modus)}" role="application" aria-label="Legg en finger hver på denne flaten">
            <div class="vk-pad-hjelp" aria-live="polite">
              <span class="vk-pad-ikon" aria-hidden="true"><i></i><i></i><i></i></span>
              <b>Alle legger en finger på skjermen</b>
              <span>Hold den i ro – så velger mobilen.</span>
            </div>
          </div>
          ${R.ui.lenkerad(R.ui.lenke("Trekk et navn i stedet", "starter-navn"))}`,
        inn() {
          R.holdVaken();
          fingre.clear();
          nullstillPad(false);
          R.vedForlat(() => {
            clearTimeout(padTid);
            clearTimeout(padNullstill);
            fingre.clear();
            padFase = "klar";
          });
        },
        etter() {
          // A redraw (mode change) removes the circles: start over.
          fingre.clear();
          padFase = "klar";
          clearTimeout(padTid);
        },
      },

      // ---------- Dice ----------
      terninger: {
        tittel: "Terninger",
        tilbake: "hjem",
        vis(S) {
          const t = S.terninger;
          const sum = t.verdier.reduce((a, b) => a + b, 0);
          return `
            <h1 class="vh" id="skjerm-tittel">Terninger</h1>
            <div class="vk-brett" id="vk-terninger" style="--n: ${t.antall}" role="img" aria-label="${esc(`Terningene viser ${R.ramsOpp(t.verdier.map(String))}`)}">
              ${t.verdier
                .map(
                  (v, i) => `<span class="vk-t"><span class="vk-skygge"></span><span class="vk-hopp"><span class="vk-kube" style="transform: ${pose(v, t.vri[i] || 0)}">${KUBE}</span></span></span>`,
                )
                .join("")}
            </div>
            <div class="vk-sum" aria-live="polite">${t.antall > 1 ? `<span class="etikett">Sum</span><b id="vk-sum">${t.historikk.length ? sum : "–"}</b>` : `<b id="vk-sum">${t.historikk.length ? sum : "–"}</b>`}</div>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Antall terninger</h2></div>
              ${R.ui.teller("terning-antall", t.antall, 1, 6, { minus: "Færre terninger", pluss: "Flere terninger" })}
            </section>
            ${t.historikk.length > 1 ? `<p class="vk-historikk"><span class="etikett">Forrige kast</span>${t.historikk.slice(1, 9).map((h) => `<span>${h}</span>`).join("")}</p>` : ""}
            ${R.ui.dokk(R.ui.knapp(t.antall === 1 ? "Kast terningen" : "Kast terningene", "terning-kast", { variant: "stor", ikon: "🎲" }))}`;
        },
        inn: () => R.holdVaken(),
      },

      // ---------- Teams ----------
      lag: {
        tittel: "Lagdeler",
        tilbake: "hjem",
        vis(S) {
          const L = S.lag;
          const maks = Math.min(4, S.antall);
          if (L.fordeling) {
            return `
              <h1 id="skjerm-tittel">${L.antall === 2 ? "To lag" : L.antall === 3 ? "Tre lag" : "Fire lag"}</h1>
              <div class="vk-lagene">${L.fordeling
                .map(
                  (lag, k) => `<section class="vk-lag" style="--lf: ${R.LAG[k].farge}; --k: ${k}">
                    <h2>${R.ui.lagmerke(k)}<span class="vk-lag-antall">${R.flertall(lag.length, "spiller", "spillere")}</span></h2>
                    <ul>${lag.map((i, n) => `<li style="--n: ${n + k * 0.5}">${R.avatar(i)}<span>${esc(R.navn(i))}</span></li>`).join("")}</ul>
                  </section>`,
                )
                .join("")}</div>
              ${R.ui.dokk(R.ui.knapp("Bland på nytt", "lag-del", { variant: "stor", ikon: "🔀" }), R.ui.lenkerad(R.ui.lenke("Endre navn og lag", "lag-endre")))}`;
          }
          return `
            <h1 id="skjerm-tittel">Del inn i lag</h1>
            <section class="seksjon">
              <h2>Hvor mange lag?</h2>
              ${R.ui.seg("lag-antall", [[2, "To"], [3, "Tre"], [4, "Fire"]], L.antall, { etikett: "Antall lag", av: (v) => Number(v) > maks })}
            </section>
            ${R.ui.spillere({ min: 2, max: 20, tittel: "Hvem er med?", hjelp: "Lagene blir like store – eller så like som mulig." })}
            ${R.ui.dokk(R.ui.knapp("Del inn i lag", "lag-del", { variant: "stor", ikon: "👥" }))}`;
        },
      },

      // ---------- Rock, paper, scissors ----------
      ssp: {
        tittel: "Stein, saks, papir",
        tilbake: "hjem",
        vis(S) {
          const P = S.ssp;
          const modus = R.ui.seg("ssp-modus", [["mobil", "Mot mobilen"], ["to", "To spillere"]], P.modus, { etikett: "Hvem spiller?" });
          if (P.modus === "to") {
            const halv = (hvem) => {
              const valg = hvem === "a" ? P.a : P.b;
              const motsatt = hvem === "a" ? P.b : P.a;
              const navn = hvem === "a" ? R.navn(0) : R.navn(1);
              const res = P.resultat;
              let midt;
              if (res) {
                const egen = res[hvem];
                const andre = res[hvem === "a" ? "b" : "a"];
                const v = sspVinner(egen, andre);
                midt = `<div class="vk-ssp-avsl"><span class="vk-hand stor">${HENDER[egen].ikon}</span><span class="vk-mot">mot</span><span class="vk-hand">${HENDER[andre].ikon}</span></div>
                  <p class="vk-ssp-res ${v === 1 ? "vant" : v === 2 ? "tapte" : "likt"}">${v === 1 ? "Du vant!" : v === 2 ? "Du tapte" : "Uavgjort!"}</p>`;
              } else if (valg) {
                midt = `<p class="vk-ssp-klar">✓ Klar!</p><p class="hjelp">${motsatt ? "" : "Venter på den andre …"}</p>`;
              } else {
                midt = `<div class="knapprad tre vk-ssp-valg">${Object.entries(HENDER)
                  .map(([id, h]) => `<button class="vk-ssp-knapp" data-h="ssp-to" data-v="${hvem}:${id}" data-stille aria-label="${esc(`${navn}: ${h.navn}`)}"><span aria-hidden="true">${h.ikon}</span><small>${h.navn}</small></button>`)
                  .join("")}</div>`;
              }
              const poeng = hvem === "a" ? P.poengA : P.poengB;
              return `<section class="vk-ssp-halv ${hvem}" aria-label="${esc(`${navn}, ${R.flertall(poeng, "poeng", "poeng")}`)}">
                <p class="vk-ssp-hvem"><span class="etikett">${esc(navn)}</span><b>${R.flertall(poeng, "poeng", "poeng")}</b></p>${midt}</section>`;
            };
            return `
              <h1 class="vh" id="skjerm-tittel">Stein, saks, papir for to</h1>
              ${modus}
              <div class="vk-ssp-to">
                ${halv("b")}
                <div class="vk-ssp-midt">
                  ${P.resultat ? R.ui.knapp("Ny runde", "ssp-ny", { variant: "liten" }) : `<span class="hjelp">Velg i hemmelighet – den andre ser bort 🙈</span>`}
                </div>
                ${halv("a")}
              </div>`;
          }
          const s = P.siste;
          const v = s ? sspVinner(s.du, s.mobil) : null;
          return `
            <h1 class="vh" id="skjerm-tittel">Stein, saks, papir mot mobilen</h1>
            ${modus}
            <div class="vk-ssp-stilling-rad" aria-label="${esc(`Du ${P.du}, mobilen ${P.mobil}, uavgjort ${P.likt}`)}">
              <span><small>Du</small><b>${P.du}</b></span><span class="vk-ssp-likt"><small>Likt</small><b>${P.likt}</b></span><span><small>Mobilen</small><b>${P.mobil}</b></span>
            </div>
            <div class="vk-arena" id="vk-arena">
              <span class="vk-hand-boks"><span class="vk-hand du" id="vk-hand-du">${s ? HENDER[s.du].ikon : "✊"}</span><small>Du</small></span>
              <span class="vk-hand-boks"><span class="vk-hand mobil" id="vk-hand-mobil">${s ? HENDER[s.mobil].ikon : "✊"}</span><small>Mobilen</small></span>
            </div>
            <p class="vk-ssp-res ${v === 1 ? "vant" : v === 2 ? "tapte" : v === 0 ? "likt" : ""}" id="vk-ssp-res" aria-live="polite">${
              s ? (v === 1 ? "Du vant!" : v === 2 ? "Mobilen vant!" : "Uavgjort!") : "Velg – mobilen velger samtidig"
            }</p>
            ${R.ui.dokk(
              `<div class="knapprad tre vk-ssp-valg">${Object.entries(HENDER)
                .map(([id, h]) => `<button class="vk-ssp-knapp" data-h="ssp-spill" data-v="${id}" aria-label="${h.navn}"><span aria-hidden="true">${h.ikon}</span><small>${h.navn}</small></button>`)
                .join("")}</div>`,
              P.du + P.mobil + P.likt ? R.ui.lenkerad(R.ui.lenke("Nullstill", "ssp-nullstill")) : "",
            )}`;
        },
      },

      // ---------- Coin ----------
      mynt: {
        tittel: "Mynt",
        tilbake: "hjem",
        vis(S) {
          const M = S.mynt;
          const kastet = M.kron + M.mynt > 0;
          return `
            <h1 class="vh" id="skjerm-tittel">Kron eller mynt</h1>
            <div class="vk-mynt-scene">
              <button class="vk-mynt" id="vk-mynt" data-h="mynt-kast" data-stille aria-label="Kast mynten">
                <span class="vk-mynt-skygge" aria-hidden="true"></span>
                <span class="vk-mynt-hopp" aria-hidden="true"><span class="vk-mynt-vipp">${myntHtml(M.side)}</span></span>
              </button>
            </div>
            <p class="vk-mynt-res" id="vk-mynt-res" aria-live="polite">${kastet ? (M.side === "kron" ? "Kron!" : "Mynt!") : "Kron eller mynt?"}</p>
            <div class="vk-mynt-tall"><span><small>Kron</small><b>${M.kron}</b></span><span><small>Mynt</small><b>${M.mynt}</b></span></div>
            ${M.rekke.length ? `<p class="vk-mynt-rekke" aria-label="De siste kastene">${M.rekke.slice(0, 12).map((s) => `<i class="${s}">${s === "kron" ? "K" : "M"}</i>`).join("")}</p>` : ""}
            ${R.ui.dokk(R.ui.knapp("Kast mynten", "mynt-kast", { variant: "stor", ikon: "🪙" }), kastet ? R.ui.lenkerad(R.ui.lenke("Nullstill", "mynt-nullstill")) : "")}`;
        },
        inn: () => R.holdVaken(),
      },

      // ---------- Random number ----------
      tall: {
        tittel: "Tilfeldig tall",
        tilbake: "hjem",
        vis(S) {
          const T = S.tall;
          const lav = Math.min(T.fra, T.til);
          const hoy = Math.max(T.fra, T.til);
          const igjen = T.unik ? hoy - lav + 1 - new Set(T.trukket.filter((n) => n >= lav && n <= hoy)).size : null;
          const tom = T.unik && igjen <= 0;
          return `
            <h1 class="vh" id="skjerm-tittel">Tilfeldig tall</h1>
            <div class="vk-tall-vindu"><output class="vk-tall" id="vk-tall" aria-live="polite">${T.siste == null ? "?" : esc(R.tall(T.siste))}</output></div>
            <p class="hjelp" id="vk-tall-info">${tom ? "Alle tallene er trukket!" : `Mellom ${esc(R.tall(lav))} og ${esc(R.tall(hoy))}${T.unik ? ` · ${R.flertall(igjen, "tall", "tall")} igjen` : ""}`}</p>
            <section class="seksjon">
              <div class="vk-tall-felt">
                <label><span class="etikett">Fra</span><input class="tekstfelt" id="vk-fra" data-felt="tall-fra" type="number" inputmode="numeric" value="${T.fra}" min="-999999" max="999999"></label>
                <label><span class="etikett">Til</span><input class="tekstfelt" id="vk-til" data-felt="tall-til" type="number" inputmode="numeric" value="${T.til}" min="-999999" max="999999"></label>
              </div>
              <div class="brikker" role="group" aria-label="Vanlige valg">${[[1, 6], [1, 10], [1, 20], [1, 100]]
                .map(([a, b]) => `<button class="brikke" data-h="tall-fast" data-v="${a}-${b}" aria-pressed="${T.fra === a && T.til === b}">${a}–${b}</button>`)
                .join("")}</div>
              ${R.ui.bryter("tall-unik", T.unik, "Ikke samme tall to ganger", "Som et lotteri: hvert tall trekkes bare én gang.")}
            </section>
            ${T.trukket.length ? `<p class="vk-historikk"><span class="etikett">Trukket</span>${T.trukket.slice(0, 30).map((n) => `<span>${esc(R.tall(n))}</span>`).join("")}</p>` : ""}
            ${R.ui.dokk(
              tom ? R.ui.knapp("Start på nytt", "tall-nullstill", { variant: "stor", ikon: "🔄" }) : R.ui.knapp("Trekk et tall", "tall-trekk", { variant: "stor", ikon: "🔢" }),
              T.trukket.length && !tom ? R.ui.lenkerad(R.ui.lenke("Nullstill", "tall-nullstill")) : "",
            )}`;
        },
      },

      // ---------- Score counter ----------
      poeng: {
        tittel: "Poengteller",
        tilbake: "hjem",
        vis(S) {
          const P = S.poeng;
          const rader = poengRader(S);
          const topp = Math.max(...rader.map((r) => r.poeng));
          const a = P.angre;
          return `
            <h1 class="vh" id="skjerm-tittel">Poengteller</h1>
            ${R.ui.seg("poeng-steg", [[1, "±1"], [5, "±5"], [10, "±10"]], P.steg, { etikett: "Hvor mye hvert trykk gir" })}
            <ul class="vk-pt">${rader
              .map(
                (r) => `<li class="vk-pt-rad${r.poeng === topp && topp !== 0 && rader.length > 1 ? " leder" : ""}" style="--pf: var(--p${r.i + 1})">
                  <span class="vk-pt-avatar">${R.avatar(r.i)}${r.poeng === topp && topp > 0 && rader.length > 1 ? '<span class="vk-pt-krone" aria-hidden="true">👑</span>' : ""}</span>
                  <input class="vk-pt-navn" id="navn-${r.i}" data-navn="${r.i}" value="${esc(R.felles.navn[r.i] || "")}" placeholder="Spiller ${r.i + 1}" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Navn på spiller ${r.i + 1}">
                  <button class="vk-pt-knapp" data-h="poeng-endre" data-v="${r.i}:-1" aria-label="${esc(`Trekk fra ${P.steg} for ${R.navn(r.i)}`)}">−</button>
                  <output class="vk-pt-sum" id="vk-pt-${r.i}" aria-live="polite">${r.poeng}</output>
                  <button class="vk-pt-knapp pluss" data-h="poeng-endre" data-v="${r.i}:1" aria-label="${esc(`Legg til ${P.steg} for ${R.navn(r.i)}`)}">+</button>
                  ${P.antall > 1 ? `<button class="vk-pt-fjern" data-h="poeng-fjern" data-v="${r.i}" aria-label="${esc(`Fjern ${R.navn(r.i)}`)}">×</button>` : ""}
                </li>`,
              )
              .join("")}</ul>
            <button class="legg-til" data-h="poeng-legg-til"${P.antall >= 8 ? " disabled" : ""}>+ Legg til spiller${P.antall >= 8 ? " (maks 8)" : ""}</button>
            ${R.ui.dokk(
              R.ui.knapp("Kår vinneren", "poeng-kaar", { variant: "stor", ikon: "🏆", av: !pagar(S) }),
              R.ui.lenkerad(
                a ? `<button class="lenke" data-h="poeng-angre" id="vk-angre">↶ Angre ${a.endring > 0 ? "+" : "−"}${Math.abs(a.endring)} til ${esc(R.navn(a.i))}</button>` : "",
                pagar(S) ? R.ui.lenke("Nullstill", "poeng-nullstill") : "",
              ),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      kaaring: {
        tittel: "Kåringen",
        tilbake: "poeng",
        gjenoppta: "poeng",
        vis(S) {
          const rader = poengRader(S);
          const best = Math.max(...rader.map((r) => r.poeng));
          const vinnere = rader.filter((r) => r.poeng === best);
          return `
            <div class="banner aksent">
              ${vinnere.length === 1 ? `<span class="vk-vinner">${R.avatar(vinnere[0].i, "gigant")}<span class="vk-krone" aria-hidden="true">👑</span></span>` : R.figur()}
              <h1 id="skjerm-tittel">${esc(R.ramsOpp(vinnere.map((r) => R.navn(r.i))))} vinner!</h1>
              <p class="ingress">${vinnere.length > 1 ? `Likt med ${R.flertall(best, "poeng", "poeng")} hver.` : `${R.flertall(best, "poeng", "poeng")}. Godt jobba!`}</p>
            </div>
            ${R.ui.pall(rader)}
            ${R.ui.poengliste(rader)}
            ${R.ui.flereSpill({ antall: S.poeng.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "poeng-igjen"), R.ui.lenkerad(R.ui.lenke("Til Verktøykassa", "hjem"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn() {
          R.lyd.fanfare();
          R.vibrer([40, 60, 120]);
          R.konfetti();
        },
      },

      // ---------- Countdown and stopwatch ----------
      klokke: {
        tittel: "Klokke",
        tilbake: "hjem",
        vis(S) {
          const k = S.klokke;
          const modus = R.ui.seg("klokke-modus", [["ned", "Nedtelling"], ["stopp", "Stoppeklokke"]], k.modus, { etikett: "Klokke" });
          if (k.modus === "stopp") {
            const st = k.stopp;
            const ms = stoppMs(st);
            const gar = !!st.start;
            const runder = st.runder;
            return `
              <h1 class="vh" id="skjerm-tittel">Stoppeklokke</h1>
              ${modus}
              <output class="vk-stoppur${gar ? " gar" : ""}" id="vk-stoppur" aria-live="off">${stoppetid(ms)}</output>
              ${runder.length ? `<ol class="vk-runder" reversed>${runder
                .map((r, n) => [r, n])
                .reverse()
                .map(([r, n]) => `<li><span>Runde ${n + 1}</span><b>${stoppetid(r - (n ? runder[n - 1] : 0))}</b><small>${stoppetid(r)}</small></li>`)
                .join("")}</ol>` : ""}
              ${R.ui.dokk(
                R.ui.knapp(gar ? "Stopp" : ms ? "Fortsett" : "Start", "stopp-veksle", { variant: gar ? "stor rosa" : "stor mynte", ikon: gar ? "⏸" : "▶" }),
                R.ui.lenkerad(gar ? R.ui.lenke("Runde", "stopp-runde") : "", !gar && ms ? R.ui.lenke("Nullstill", "stopp-nullstill") : ""),
              )}`;
          }
          const igjen = igjenMs(k);
          const gar = !!k.slutt;
          const pauset = !gar && k.pause != null;
          const ferdig = k.ferdig && !gar && !pauset;
          return `
            <h1 class="vh" id="skjerm-tittel">Nedtelling</h1>
            ${modus}
            <div class="vk-ned${ferdig ? " ute" : ""}">${R.ui.timer({ id: "vk-ned", sekunder: ferdig ? 0 : igjen / 1000, stor: true })}</div>
            ${ferdig ? `<p class="vk-ute" aria-live="assertive">Tiden er ute!</p>` : ""}
            ${gar || pauset
              ? ""
              : `<section class="seksjon">
                  <div class="brikker vk-klokke-valg" role="group" aria-label="Velg tid">${[30, 60, 120, 180, 300, 600]
                    .map((s) => `<button class="brikke" data-h="klokke-tid" data-v="${s}" aria-pressed="${k.sekunder === s}">${minSek(s)}</button>`)
                    .join("")}</div>
                  ${R.ui.teller("klokke-juster", k.sekunder, 10, 5940, { vis: (s) => R.formaterTid(s), minus: "30 sekunder mindre", pluss: "30 sekunder mer" })}
                </section>`}
            ${R.ui.dokk(
              R.ui.knapp(gar ? "Pause" : pauset ? "Fortsett" : ferdig ? "Start igjen" : "Start", "klokke-veksle", { variant: gar ? "stor rosa" : "stor mynte", ikon: gar ? "⏸" : "▶" }),
              gar || pauset || ferdig ? R.ui.lenkerad(R.ui.lenke("Nullstill", "klokke-nullstill")) : "",
            )}`;
        },
        inn(S) {
          R.holdVaken();
          const k = S.klokke;
          if (k.modus === "ned" && k.slutt) {
            if (igjenMs(k) <= 0) {
              k.slutt = null;
              k.ferdig = true;
              R.lagre();
              R.vis();
            } else startNedtelling(S);
          }
          const id = setInterval(() => {
            const el = document.getElementById("vk-stoppur");
            if (el && R.S.klokke.stopp.start) el.textContent = stoppetid(stoppMs(R.S.klokke.stopp));
          }, 100);
          R.vedForlat(() => clearInterval(id));
        },
      },
    },

    handlinger: (H = {
      apne(el, e, S) {
        const id = el.dataset.v;
        if (!verktoy(id)) return;
        R.statistikk("start", { verktoy: id });
        R.gaTil(id);
      },
      hjem: () => R.gaTil("hjem"),

      // Hvem starter?
      "starter-modus"(el, e, S) {
        S.starter.modus = ["en", "rekke", "lag"].includes(el.dataset.v) ? el.dataset.v : "en";
        R.vis();
      },
      async "starter-navn"(el, e, S) {
        const n = R.klamp(S.antall, 2, 20);
        const navn = Array.from({ length: n }, (_, i) => R.navn(i));
        R.ark(`
          <h2 id="ark-tittel">Hvem starter?</h2>
          <p class="ingress">Mobilen trekker blant ${R.flertall(n, "navn", "navn")} fra lagdeleren.</p>
          <p class="vk-trekk" id="vk-trekk" aria-live="polite">…</p>
          <div class="knapprad"><button class="knapp-2" data-h="apne" data-v="lag">Endre navn</button><button class="knapp" data-h="starter-navn">Trekk igjen</button></div>`);
        const ut = document.getElementById("vk-trekk");
        const vinner = Math.floor(tilfeldig() * n);
        const runder = R.rolig() ? 1 : 14;
        for (let k = 0; k < runder; k++) {
          if (!ut || !ut.isConnected) return;
          ut.textContent = navn[(vinner + k + 1 + Math.floor(Math.random() * (n - 1))) % n];
          R.lyd.tone(700 + k * 30, 0, 0.04, "triangle", 0.06);
          await R.vent(40 + k * k * 1.4);
        }
        if (!ut.isConnected) return;
        ut.textContent = `${navn[vinner]} starter!`;
        ut.classList.add("ferdig");
        R.lyd.fanfare();
        R.vibrer([40, 40, 90]);
        R.si(`${navn[vinner]} starter!`);
      },

      // Dice
      "terning-antall"(el, e, S) {
        const t = S.terninger;
        const n = R.klamp(t.antall + Number(el.dataset.v), 1, 6);
        if (n === t.antall) return;
        if (n > t.antall) {
          t.verdier.push(nyTerning());
          t.vri.push(Math.round(Math.random() * 30 - 15));
        } else {
          t.verdier.pop();
          t.vri.pop();
        }
        t.antall = n;
        R.vis();
      },
      async "terning-kast"(el, e, S) {
        const t = S.terninger;
        if (travelt.ruller) return;
        const fra = t.verdier.slice();
        const fraVri = t.vri.slice();
        t.verdier = t.verdier.map(nyTerning);
        t.vri = t.verdier.map(() => Math.round(Math.random() * 30 - 15));
        const sum = t.verdier.reduce((a, b) => a + b, 0);
        t.historikk = [sum, ...t.historikk].slice(0, 12);
        R.lagre();
        travelt.ruller = true;
        const knapp = R.$('.dokk [data-h="terning-kast"]');
        if (knapp) knapp.disabled = true;
        const sumEl = document.getElementById("vk-sum");
        if (sumEl) sumEl.classList.add("skjult");
        const fortsatt = R.vakt();
        await animerTerninger(fra, fraVri, t.verdier, t.vri);
        travelt.ruller = false;
        if (!fortsatt()) return;
        R.vis();
        const ny = document.getElementById("vk-sum");
        if (ny) ny.classList.add("ny");
        R.si(t.antall > 1 ? `Terningene viser ${R.ramsOpp(t.verdier.map(String))}. Sum ${sum}.` : `Terningen viser ${sum}.`);
      },

      // Teams
      "lag-antall"(el, e, S) {
        S.lag.antall = R.klamp(Number(el.dataset.v) || 2, 2, Math.min(4, S.antall));
        R.vis();
      },
      "lag-del"(el, e, S) {
        const n = R.klamp(S.antall, 2, 20);
        S.lag.antall = R.klamp(S.lag.antall, 2, Math.min(4, n));
        S.lag.fordeling = delLag(n, S.lag.antall, tilfeldig);
        R.lyd.sveip();
        setTimeout(() => R.lyd.riktig(), R.rolig() ? 0 : 450);
        R.vibrer([20, 40, 20]);
        R.statistikk("lag", { spillere: n, lag: S.lag.antall });
        if (S.skjerm === "lag") R.vis();
        window.scrollTo(0, 0);
        R.si(S.lag.fordeling.map((lag, k) => `Lag ${R.LAG[k].navn}: ${R.ramsOpp(lag.map((i) => R.navn(i)))}`).join(". "));
      },
      "lag-endre"(el, e, S) {
        S.lag.fordeling = null;
        R.vis();
        window.scrollTo(0, 0);
      },

      // Rock, paper, scissors
      "ssp-modus"(el, e, S) {
        S.ssp.modus = el.dataset.v === "to" ? "to" : "mobil";
        R.vis();
      },
      async "ssp-spill"(el, e, S) {
        const P = S.ssp;
        if (travelt.ssp) return;
        const du = el.dataset.v;
        if (!HENDER[du]) return;
        const mobil = ["stein", "saks", "papir"][Math.floor(tilfeldig() * 3)];
        travelt.ssp = true;
        R.$$(".dokk .vk-ssp-knapp").forEach((b) => (b.disabled = true));
        const arena = document.getElementById("vk-arena");
        const res = document.getElementById("vk-ssp-res");
        const hDu = document.getElementById("vk-hand-du");
        const hMobil = document.getElementById("vk-hand-mobil");
        const fortsatt = R.vakt();
        if (hDu) hDu.textContent = "✊";
        if (hMobil) hMobil.textContent = "✊";
        if (res) res.className = "vk-ssp-res";
        const ord = ["Stein …", "saks …", "papir!"];
        try {
          for (let k = 0; k < 3; k++) {
            if (!fortsatt()) return;
            if (res) res.textContent = ord[k];
            if (arena) {
              arena.classList.remove("rist");
              void arena.offsetWidth;
              arena.classList.add("rist");
            }
            R.lyd.tikk();
            R.vibrer(12);
            await R.vent(R.rolig() ? 120 : 380);
          }
        } finally {
          travelt.ssp = false; // never leave the buttons dead, also when the player leaves mid-count
        }
        if (!fortsatt()) return;
        const v = sspVinner(du, mobil);
        P.siste = { du, mobil };
        if (v === 1) P.du += 1;
        else if (v === 2) P.mobil += 1;
        else P.likt += 1;
        travelt.ssp = false;
        R.vis();
        if (v === 1) {
          R.lyd.riktig();
          R.vibrer([30, 40, 60]);
        } else if (v === 2) R.lyd.tone(330, 0, 0.16, "triangle", 0.1, 220);
        else R.lyd.pling();
        const ny = document.getElementById("vk-arena");
        if (ny) ny.classList.add("avslort");
        R.si(`${HENDER[du].navn} mot ${HENDER[mobil].navn}. ${v === 1 ? "Du vant!" : v === 2 ? "Mobilen vant!" : "Uavgjort!"}`);
      },
      // Two players: each chooses in secret on their half; both shown when both are ready.
      "ssp-to"(el, e, S) {
        const P = S.ssp;
        if (P.resultat) return;
        const [hvem, valg] = String(el.dataset.v).split(":");
        if (!["a", "b"].includes(hvem) || !HENDER[valg] || P[hvem]) return;
        P[hvem] = valg;
        R.lyd.pop();
        R.vibrer(10);
        if (P.a && P.b) {
          P.resultat = { a: P.a, b: P.b };
          const v = sspVinner(P.a, P.b);
          if (v === 1) P.poengA += 1;
          else if (v === 2) P.poengB += 1;
          R.lyd.trommevirvel(R.rolig() ? 0.1 : 0.5);
          R.si(`${R.navn(0)}: ${HENDER[P.a].navn}. ${R.navn(1)}: ${HENDER[P.b].navn}. ${v === 0 ? "Uavgjort!" : `${v === 1 ? R.navn(0) : R.navn(1)} vant!`}`);
        }
        R.vis();
      },
      "ssp-ny"(el, e, S) {
        Object.assign(S.ssp, { a: null, b: null, resultat: null });
        R.vis();
      },
      "ssp-nullstill"(el, e, S) {
        Object.assign(S.ssp, { du: 0, mobil: 0, likt: 0, siste: null });
        R.vis();
      },

      // Coin
      async "mynt-kast"(el, e, S) {
        const M = S.mynt;
        if (travelt.mynt) return;
        const fra = M.side;
        const side = tilfeldig() < 0.5 ? "kron" : "mynt";
        M.side = side;
        M[side] += 1;
        M.rekke = [side, ...M.rekke].slice(0, 30);
        R.lagre();
        travelt.mynt = true;
        const skive = R.$("#vk-mynt .vk-mynt-skive");
        const hopp = R.$("#vk-mynt .vk-mynt-hopp");
        const skygge = R.$("#vk-mynt .vk-mynt-skygge");
        const res = document.getElementById("vk-mynt-res");
        if (res) res.textContent = "…";
        R.lyd.tone(2600, 0, 0.09, "sine", 0.12);
        R.lyd.tone(3900, 0.01, 0.14, "sine", 0.06);
        R.vibrer(10);
        const fortsatt = R.vakt();
        if (skive && skive.animate && !R.rolig()) {
          const a0 = fra === "mynt" ? 180 : 0;
          const halve = 8 + Math.floor(Math.random() * 4) * 2 + (fra === side ? 0 : 1);
          const a1 = a0 + halve * 180;
          const ms = 1350;
          const rull = skive.animate([{ transform: `rotateX(${a0}deg)` }, { transform: `rotateX(${a1}deg)` }], { duration: ms, easing: "cubic-bezier(.25,.7,.35,1)", fill: "both" });
          hopp.animate(
            [
              { transform: "translateY(0) scale(1)", easing: "cubic-bezier(.2,.8,.4,1)" },
              { transform: "translateY(-140px) scale(1.25)", offset: 0.45, easing: "cubic-bezier(.6,0,.9,.4)" },
              { transform: "translateY(0) scale(1)", offset: 0.85, easing: "ease-out" },
              { transform: "translateY(-10px) scale(1.02)", offset: 0.93 },
              { transform: "translateY(0) scale(1)" },
            ],
            { duration: ms },
          );
          if (skygge) skygge.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.45)", opacity: 0.35, offset: 0.45 }, { transform: "scale(1)", opacity: 1, offset: 0.85 }, { transform: "scale(1)", opacity: 1 }], { duration: ms });
          R.lyd.tone(1800, (ms * 0.85) / 1000, 0.06, "triangle", 0.12);
          R.lyd.stoy((ms * 0.85) / 1000, 0.05, 0.2, 4200);
          R.lyd.tone(2200, (ms * 0.95) / 1000, 0.05, "triangle", 0.06);
          await new Promise((r) => (rull.onfinish = r));
        } else await R.vent(150);
        travelt.mynt = false;
        if (!fortsatt()) return;
        R.vis();
        R.vibrer([20, 50, 20]);
        const nyRes = document.getElementById("vk-mynt-res");
        if (nyRes) nyRes.classList.add("ny");
        R.si(side === "kron" ? "Kron!" : "Mynt!");
      },
      "mynt-nullstill"(el, e, S) {
        Object.assign(S.mynt, { kron: 0, mynt: 0, rekke: [] });
        R.vis();
      },

      // Random number
      "tall-fast"(el, e, S) {
        const [a, b] = String(el.dataset.v).split("-").map(Number);
        S.tall.fra = a;
        S.tall.til = b;
        S.tall.trukket = [];
        S.tall.siste = null;
        R.vis();
      },
      "tall-unik"(el, e, S) {
        S.tall.unik = !S.tall.unik;
        R.vis();
      },
      async "tall-trekk"(el, e, S) {
        const T = S.tall;
        if (travelt.tall) return;
        const n = trekkTall(T.fra, T.til, T.trukket, T.unik, tilfeldig);
        if (n == null) {
          R.toast("Alle tallene er trukket");
          return;
        }
        T.siste = n;
        // Without repeats every drawn number must be remembered (up to a generous cap); otherwise the last 500.
        T.trukket = [n, ...T.trukket].slice(0, T.unik ? 20000 : 500);
        R.lagre();
        travelt.tall = true;
        const ut = document.getElementById("vk-tall");
        const lav = Math.min(T.fra, T.til);
        const hoy = Math.max(T.fra, T.til);
        const fortsatt = R.vakt();
        const runder = R.rolig() ? 0 : 16;
        if (ut) ut.classList.add("ruller");
        for (let k = 0; k < runder; k++) {
          if (!fortsatt() || !ut) break;
          ut.textContent = R.tall(lav + Math.floor(Math.random() * (hoy - lav + 1)));
          R.lyd.tone(900 + k * 25, 0, 0.03, "square", 0.04);
          await R.vent(30 + k * 6);
        }
        travelt.tall = false;
        if (!fortsatt()) return;
        R.vis();
        const ny = document.getElementById("vk-tall");
        if (ny) ny.classList.add("ny");
        R.lyd.pling();
        R.vibrer(20);
        R.si(`Tallet er ${n}.`);
      },
      "tall-nullstill"(el, e, S) {
        S.tall.trukket = [];
        S.tall.siste = null;
        R.vis();
      },

      // Score counter
      "poeng-steg"(el, e, S) {
        const v = Number(el.dataset.v);
        S.poeng.steg = [1, 5, 10].includes(v) ? v : 1;
        R.vis();
      },
      "poeng-endre"(el, e, S) {
        const P = S.poeng;
        const [i, fortegn] = String(el.dataset.v).split(":").map(Number);
        if (!(i >= 0 && i < P.antall)) return;
        const endring = fortegn * P.steg;
        P.verdier[i] += endring;
        P.angre = { i, endring };
        P.kaaret = null;
        R.lyd.tone(endring > 0 ? 660 : 440, 0, 0.07, "triangle", 0.12, endring > 0 ? 880 : 330);
        R.vibrer(8);
        R.vis();
        const sum = document.getElementById(`vk-pt-${i}`);
        if (sum) sum.classList.add(endring > 0 ? "opp" : "ned");
      },
      "poeng-angre"(el, e, S) {
        const P = S.poeng;
        const a = P.angre;
        if (!a) return;
        P.verdier[a.i] -= a.endring;
        P.angre = null;
        P.kaaret = null;
        R.lyd.snu();
        R.toast(`Angret ${a.endring > 0 ? "+" : "−"}${Math.abs(a.endring)} til ${R.navn(a.i)}`);
        R.vis();
      },
      "poeng-legg-til"(el, e, S) {
        const P = S.poeng;
        if (P.antall >= 8) return;
        P.verdier[P.antall] = 0;
        P.antall += 1;
        P.angre = null;
        R.vis();
        const ny = document.getElementById(`navn-${P.antall - 1}`);
        if (ny) ny.focus();
      },
      "poeng-fjern"(el, e, S) {
        const P = S.poeng;
        const i = Number(el.dataset.v);
        if (P.antall <= 1 || !(i >= 0 && i < P.antall)) return;
        // A double tap on × must not remove (and forget the shared name of) the next player too.
        if (performance.now() - sistFjernet < 700) return;
        sistFjernet = performance.now();
        R.felles.navn.splice(i, 1);
        R.lagreFelles();
        P.verdier.splice(i, 1);
        P.verdier.push(0);
        P.antall -= 1;
        P.angre = null;
        R.vis();
      },
      async "poeng-nullstill"(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Nullstille poengene?", "Alle får 0 poeng. Navnene blir stående.", "Nullstill", "Avbryt")) || !fortsatt()) return;
        S.poeng.verdier = Array(8).fill(0);
        S.poeng.angre = null;
        S.poeng.kaaret = null;
        R.vis();
      },
      "poeng-kaar"(el, e, S) {
        if (!pagar(S)) return;
        S.poeng.angre = null;
        const rader = poengRader(S);
        // The same result is registered once, also after «tilbake» and «Kår vinneren» again.
        const merke = JSON.stringify(rader.map((x) => [R.navn(x.i), x.poeng]));
        if (S.poeng.kaaret !== merke) {
          S.poeng.kaaret = merke;
          R.kveld.registrer(rader);
        }
        R.statistikk("ferdig", { verktoy: "poeng", spillere: rader.length });
        R.gaTil("kaaring");
      },
      "poeng-igjen"(el, e, S) {
        S.poeng.verdier = Array(8).fill(0);
        S.poeng.angre = null;
        S.poeng.kaaret = null;
        R.gaTil("poeng");
      },

      // Clock
      "klokke-modus"(el, e, S) {
        S.klokke.modus = el.dataset.v === "stopp" ? "stopp" : "ned";
        R.vis();
        if (S.klokke.modus === "ned" && S.klokke.slutt) startNedtelling(S);
      },
      "klokke-tid"(el, e, S) {
        const k = S.klokke;
        k.sekunder = R.klamp(Number(el.dataset.v) || 60, 10, 5940);
        k.ferdig = false;
        k.pause = null;
        R.vis();
      },
      "klokke-juster"(el, e, S) {
        const k = S.klokke;
        k.sekunder = R.klamp(k.sekunder + Number(el.dataset.v) * 30, 10, 5940);
        k.ferdig = false;
        k.pause = null;
        R.vis();
      },
      "klokke-veksle"(el, e, S) {
        const k = S.klokke;
        if (k.slutt) {
          // pause
          k.pause = Math.max(0, k.slutt - Date.now());
          k.slutt = null;
          const t = R.timer("vk-ned");
          if (t) t.stopp();
          R.vis();
          return;
        }
        if (k.ferdig && k.pause == null) k.ferdig = false;
        k.slutt = Date.now() + igjenMs(k);
        k.pause = null;
        k.ferdig = false;
        R.vis();
        startNedtelling(S);
      },
      "klokke-nullstill"(el, e, S) {
        const k = S.klokke;
        const t = R.timer("vk-ned");
        if (t) t.stopp();
        k.slutt = null;
        k.pause = null;
        k.ferdig = false;
        R.vis();
      },
      "stopp-veksle"(el, e, S) {
        const st = S.klokke.stopp;
        if (st.start) {
          st.akk += Date.now() - st.start;
          st.start = null;
        } else st.start = Date.now();
        R.vis();
      },
      "stopp-runde"(el, e, S) {
        const st = S.klokke.stopp;
        if (!st.start) return;
        st.runder.push(stoppMs(st));
        R.lyd.takk();
        R.vis();
      },
      "stopp-nullstill"(el, e, S) {
        S.klokke.stopp = { start: null, akk: 0, runder: [] };
        R.vis();
      },
    }),

    felt: {
      "tall-fra"(S, el) {
        const v = Math.round(Number(el.value));
        if (Number.isFinite(v)) {
          S.tall.fra = R.klamp(v, -999999, 999999);
          S.tall.trukket = [];
          S.tall.siste = null;
          R.lagre();
          oppdaterTallInfo(S);
        }
      },
      "tall-til"(S, el) {
        const v = Math.round(Number(el.value));
        if (Number.isFinite(v)) {
          S.tall.til = R.klamp(v, -999999, 999999);
          S.tall.trukket = [];
          S.tall.siste = null;
          R.lagre();
          oppdaterTallInfo(S);
        }
      },
    },
  });

  // Typing in Fra/Til updates the line under the number without redrawing (keeps the keyboard up).
  function oppdaterTallInfo(S) {
    const T = S.tall;
    const info = document.getElementById("vk-tall-info");
    const lav = Math.min(T.fra, T.til);
    const hoy = Math.max(T.fra, T.til);
    if (info) info.textContent = `Mellom ${R.tall(lav)} og ${R.tall(hoy)}${T.unik ? ` · ${R.flertall(hoy - lav + 1, "tall", "tall")} igjen` : ""}`;
    const ut = document.getElementById("vk-tall");
    if (ut) ut.textContent = "?";
    R.$$('[data-h="tall-fast"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === `${T.fra}-${T.til}`)));
  }
})();
