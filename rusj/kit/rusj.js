/* rusj kit — the shared runtime for every game on rusj.no (window.Rusj).
   A game is one call to Rusj.start({...}) with screens that return HTML and actions bound
   through data-h attributes. See rusj/KIT.md for the full guide.
   Depends on window.RusjGjengen (mascots + logo). Everything stays on the device: no network,
   no cookies; localStorage only, under keys that start with "rusj.". */
(function () {
  "use strict";

  const R = (window.Rusj = {});
  const G = window.RusjGjengen;
  // Game facts from spill.json, written by the build in <id>/data.js (loaded after this file).
  const meta = () => window.RUSJ_SPILL || {};

  // ---------- Helpers ----------

  const $ = (sel, rot) => (rot || document).querySelector(sel);
  const $$ = (sel, rot) => Array.from((rot || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  R.$ = $;
  R.$$ = $$;
  R.esc = esc;
  R.tall = (n) => Number(n).toLocaleString("nb-NO");
  R.vent = (ms) => new Promise((r) => setTimeout(r, ms));
  R.rolig = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  R.klamp = (n, min, max) => Math.min(max, Math.max(min, n));
  // "1 sekund", "2 sekunder": R.flertall(n, "sekund", "sekunder")
  R.flertall = (n, entall, flertall) => `${R.tall(n)} ${Number(n) === 1 ? entall : flertall}`;
  // "A", "A og B", "A, B og C"
  R.ramsOpp = (liste) => {
    const l = (liste || []).map(String);
    return l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " og " + l[l.length - 1];
  };
  R.formaterTid = (sek) => {
    sek = Math.max(0, Math.ceil(sek));
    return Math.floor(sek / 60) + ":" + String(sek % 60).padStart(2, "0");
  };
  // Size class for big words on cards: "", "lang" or "ekstra-lang".
  R.lengdeKlasse = (tekst) => {
    tekst = String(tekst);
    const lengste = Math.max(...tekst.split(/\s+/).map((d) => d.length));
    if (lengste > 13 || tekst.length > 20) return "ekstra-lang";
    if (lengste > 9 || tekst.length > 14) return "lang";
    return "";
  };
  // For comparing typed answers: lower case, no accents (æ, ø, å kept), no punctuation, single spaces.
  R.normaliser = (tekst) =>
    String(tekst || "")
      .toLocaleLowerCase("nb")
      .replace(/[æøå]/g, (c) => ({ æ: "\u0001", ø: "\u0002", å: "\u0003" })[c])
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[\u0001-\u0003]/g, (c) => ({ "\u0001": "æ", "\u0002": "ø", "\u0003": "å" })[c])
      .replace(/[^a-z0-9æøå ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  R.iRamme = (() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  // ---------- Randomness ----------

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  R.rng = (fro) => mulberry32(fro >>> 0);
  R.nyttFro = () => {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0];
    } catch (e) {
      return Math.floor(Math.random() * 4294967296);
    }
  };
  R.stokk = (liste, tilfeldig) => {
    const t = tilfeldig || Math.random;
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(t() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  R.velg = (liste, tilfeldig) => liste[Math.floor((tilfeldig || Math.random)() * liste.length)];
  R.heltall = (min, max, tilfeldig) => min + Math.floor((tilfeldig || Math.random)() * (max - min + 1));
  R.hash = (tekst) => {
    let h = 0x811c9dc5;
    tekst = String(tekst);
    for (let i = 0; i < tekst.length; i++) {
      h ^= tekst.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  // ---------- Storage (this device only) ----------

  const PREFIKS = "rusj.";
  R.les = (nokkel, standard) => {
    try {
      const v = localStorage.getItem(PREFIKS + nokkel);
      return v == null ? standard : JSON.parse(v);
    } catch (e) {
      return standard;
    }
  };
  R.skriv = (nokkel, verdi) => {
    try {
      localStorage.setItem(PREFIKS + nokkel, JSON.stringify(verdi));
    } catch (e) {
      /* private mode or full: the game still works, it just forgets */
    }
  };
  R.fjern = (nokkel) => {
    try {
      localStorage.removeItem(PREFIKS + nokkel);
    } catch (e) {
      /* ignore */
    }
  };

  // Shared across all games: sound on/off and the player names (the same friends play several games).
  R.felles = Object.assign({ lyd: true, navn: [] }, R.les("felles", {}));
  if (!Array.isArray(R.felles.navn)) R.felles.navn = [];
  // over18 is read back from storage unless it is the thing being changed: the front page or
  // another tab may have changed it since this page loaded, and an old copy must not undo that.
  R.lagreFelles = (endring) => {
    const lagret = R.les("felles", {}) || {};
    R.felles.over18 = endring && "over18" in endring ? !!endring.over18 : !!lagret.over18;
    R.skriv("felles", {
      lyd: !!R.felles.lyd,
      navn: R.felles.navn.slice(0, 24).map((n) => String(n || "").slice(0, 16)),
      over18: R.felles.over18,
      installTips: Number(R.felles.installTips) || 0,
    });
  };

  // ---------- Daily puzzles ----------
  // The same "today" for everyone in Norway: { tekst: "2026-11-10", nr: days since 1970 }.
  // Read with formatToParts (not a locale's date format, which a browser may lack), and fall back
  // to the phone's own date if the time zone is unknown.
  R.dag = (dato) => {
    const naa = dato || new Date();
    let a, m, d;
    try {
      const deler = {};
      for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(naa)) deler[p.type] = Number(p.value);
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
    return { tekst: `${a}-${to(m)}-${to(d)}`, nr: Math.floor(Date.UTC(a, m - 1, d) / 86400000) };
  };

  // Daily puzzles call R.dagligFerdig({ vunnet, rekke }) when today's puzzle is done (won or not).
  // The front page shows «✓ i dag» and the streak (🔥) on the game's card. This phone only.
  R.dagligFerdig = (info) => {
    try {
      const id = (APP && APP.id) || meta().id;
      const alle = R.les("daglig", {}) || {};
      alle[id] = { nr: R.dag().nr, vunnet: !!(info && info.vunnet), rekke: Math.max(0, Math.min(9999, Number(info && info.rekke) || 0)) };
      R.skriv("daglig", alle);
    } catch (e) {
      /* never break a game for this */
    }
  };

  // ---------- Statistics (anonymous) ----------
  // Games report a few events: R.statistikk("start", { modus: "lag" }) when a game starts,
  // R.statistikk("ferdig", { runder: 3 }) when it ends. No names, no free text, nothing personal.
  // The kit also reports page views and time on page. Sending only happens if the site is
  // configured with a statistics endpoint (window.RUSJ_STAT); until then this does nothing.
  const statKo = [];
  R.statistikk = (hendelse, data) => {
    if (typeof hendelse !== "string" || hendelse.length > 24) return;
    const ren = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (Object.keys(ren).length >= 6) break;
      if (typeof v === "number" && Number.isFinite(v)) ren[k.slice(0, 16)] = Math.round(v * 10) / 10;
      else if (typeof v === "boolean") ren[k.slice(0, 16)] = v;
      else if (typeof v === "string" && /^[a-z0-9_-]{1,20}$/i.test(v)) ren[k.slice(0, 16)] = v; // ids only, never names
    }
    statKo.push({ h: hendelse, d: ren, t: Date.now() });
    if (statKo.length > 50) statKo.shift();
    if (R.statSend) R.statSend();
  };
  R._statKo = statKo;

  // ---------- The evening's scoreboard («Kveldens gjeng») ----------
  // At the end of a game: R.kveld.registrer(rader) with the same rows as R.ui.poengliste.
  // Places 1/2/3 give 3/2/1 evening points (ties share). Kept on this phone only, for 12 hours.
  R.kveld = {
    les() {
      const k = R.les("kveld", null);
      if (!k || !Array.isArray(k.spill) || Date.now() - (k.start || 0) > 12 * 3600 * 1000) return { start: Date.now(), spill: [] };
      return k;
    },
    registrer(rader, valg) {
      try {
        const id = (APP && APP.id) || meta().id;
        const navn = (r) => (r.navn != null ? String(r.navn) : r.lag != null ? "Lag " + R.LAG[r.lag % R.LAG.length].navn : R.navn(r.i || 0));
        const med = (rader || []).filter((r) => typeof r.poeng === "number");
        if (med.length < 2 && !(valg && valg.solo)) return;
        const sortert = med.slice().sort((a, b) => b.poeng - a.poeng);
        const resultat = sortert.map((r) => ({ navn: navn(r).slice(0, 30), plass: 1 + sortert.filter((x) => x.poeng > r.poeng).length }));
        const k = R.kveld.les();
        k.spill.push({ id, tid: Date.now(), resultat });
        k.spill = k.spill.slice(-60);
        R.skriv("kveld", k);
        R.statistikk("kveld", { spillere: resultat.length });
        // A calm moment on the end screen. Games often register just before R.gaTil("slutt"), so the
        // screen is read on the next tick; the tip only shows if the player is still there 1.8 s later.
        setTimeout(() => {
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && R.visInstallTips(), 1800);
        }, 0);
      } catch (e) {
        /* never break a game for the scoreboard */
      }
    },
    tavle() {
      const poeng = new Map();
      for (const s of R.kveld.les().spill)
        for (const r of s.resultat) {
          const p = r.plass === 1 ? 3 : r.plass === 2 ? 2 : r.plass === 3 ? 1 : 0;
          poeng.set(r.navn, (poeng.get(r.navn) || 0) + p);
        }
      return Array.from(poeng, ([navn, p]) => ({ navn, poeng: p })).sort((a, b) => b.poeng - a.poeng);
    },
  };

  // ---------- "Install as an app" tip ----------
  let installHendelse = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installHendelse = e;
  });
  R.erInstallert = () => !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone);
  // Shown at most twice per phone, at a calm moment (after a finished game).
  R.visInstallTips = (tving) => {
    if (R.iRamme || R.erInstallert()) return;
    if (!tving && (Number(R.felles.installTips) || 0) >= 2) return;
    if (R.arkApent && R.arkApent()) return;
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    R.felles.installTips = (Number(R.felles.installTips) || 0) + 1;
    R.lagreFelles();
    const tekst = installHendelse
      ? "Legg rusj på hjemskjermen, så starter spillene som en app – og de virker uten nett."
      : ios
        ? "Trykk på Del-knappen <b>⬆︎</b> nederst i Safari og velg «Legg til på Hjem-skjerm». Da starter rusj som en app – og spillene virker uten nett."
        : "Åpne menyen i nettleseren (⋮) og velg «Installer app» eller «Legg til på startsiden». Da starter rusj som en app – og spillene virker uten nett.";
    R.ark(`
      <h2 id="ark-tittel">Ha rusj som app</h2>
      <p class="ingress">${tekst}</p>
      ${installHendelse ? '<button class="knapp" data-h="installer-app">Installer rusj</button>' : ""}
      <button class="${installHendelse ? "lenke" : "knapp-2"}" data-h="lukk-ark">${installHendelse ? "Ikke nå" : "Skjønner!"}</button>`);
  };
  R._installer = async () => {
    if (!installHendelse) return R.lukkArk();
    installHendelse.prompt();
    try {
      await installHendelse.userChoice;
    } catch (e) {
      /* ignore */
    }
    installHendelse = null;
    R.lukkArk();
  };

  R.DYR = ["🦊", "🐸", "🐼", "🐙", "🦄", "🐯", "🐧", "🦉", "🐢", "🐳", "🦁", "🐨", "🐰", "🐝", "🦖", "🐷", "🐵", "🦜", "🐻", "🐞"];
  R.MAKS_SPILLERE = 20;
  R.navn = (i) => String(R.felles.navn[i] || "").trim() || `Spiller ${i + 1}`;
  R.avatar = (i, storrelse) =>
    `<span class="avatar ${storrelse || ""}" style="--pf: var(--p${(i % 20) + 1})" aria-hidden="true">${R.DYR[i % 20]}</span>`;
  R.LAG = [
    { navn: "Rosa", farge: "var(--rosa)" },
    { navn: "Gul", farge: "var(--lampe)" },
    { navn: "Blå", farge: "var(--himmel)" },
    { navn: "Grønn", farge: "var(--mynte)" },
  ];

  // ---------- Sound (synthesised, no files) ----------

  R.lyd = (() => {
    let ctx = null;
    let hoved = null;
    function sikre() {
      if (!R.felles.lyd) return null;
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
          hoved = ctx.createGain();
          hoved.gain.value = 0.55;
          hoved.connect(ctx.destination);
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
      } catch (e) {
        return null;
      }
    }
    function tone(frekvens, start, varighet, type, styrke, tilFrekvens) {
      const c = sikre();
      if (!c) return;
      const t0 = c.currentTime + start;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(frekvens, t0);
      if (tilFrekvens) o.frequency.exponentialRampToValueAtTime(tilFrekvens, t0 + varighet);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(styrke || 0.2, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + varighet);
      o.connect(g).connect(hoved);
      o.start(t0);
      o.stop(t0 + varighet + 0.05);
    }
    let stoyBuffer = null;
    function stoy(start, varighet, styrke, filterFrekvens, type) {
      const c = sikre();
      if (!c) return;
      if (!stoyBuffer) {
        stoyBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const d = stoyBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t0 = c.currentTime + start;
      const kilde = c.createBufferSource();
      kilde.buffer = stoyBuffer;
      const f = c.createBiquadFilter();
      f.type = type || "bandpass";
      f.frequency.value = filterFrekvens || 1800;
      f.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(styrke || 0.3, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + varighet);
      kilde.connect(f).connect(g).connect(hoved);
      kilde.start(t0);
      kilde.stop(t0 + varighet + 0.05);
    }
    return {
      lasOpp: sikre,
      tone: tone,
      stoy: stoy,
      klikk: () => tone(720, 0, 0.06, "triangle", 0.12),
      pop: () => tone(520, 0, 0.09, "sine", 0.22, 980),
      snu: () => {
        tone(300, 0, 0.14, "triangle", 0.16, 620);
        stoy(0, 0.08, 0.08, 3000);
      },
      sveip: () => stoy(0, 0.22, 0.18, 2400),
      tikk: () => tone(880, 0, 0.12, "square", 0.09),
      takk: () => tone(660, 0, 0.1, "square", 0.08),
      pek: () => {
        tone(196, 0, 0.35, "sawtooth", 0.18, 392);
        stoy(0, 0.25, 0.25, 900);
      },
      riktig: () => {
        tone(660, 0, 0.12, "triangle", 0.16);
        tone(990, 0.1, 0.22, "triangle", 0.16);
      },
      feil: () => {
        tone(180, 0, 0.28, "sawtooth", 0.12, 120);
      },
      pling: () => tone(1320, 0, 0.3, "sine", 0.16),
      trommevirvel: (sekunder) => {
        let t = 0;
        let avstand = 0.07;
        while (t < sekunder) {
          stoy(t, 0.06, 0.12 + (t / sekunder) * 0.22, 1400);
          t += avstand;
          avstand = Math.max(0.035, avstand * 0.97);
        }
        stoy(sekunder, 0.9, 0.35, 5200);
        tone(98, sekunder, 0.5, "sine", 0.4, 60);
      },
      fanfare: () => {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, i === 3 ? 0.6 : 0.16, "square", 0.08));
        [523.25, 659.25, 783.99].forEach((f) => tone(f, 0.44, 0.6, "triangle", 0.07));
      },
      buu: () => {
        tone(392, 0, 0.32, "sawtooth", 0.1, 370);
        tone(370, 0.34, 0.32, "sawtooth", 0.1, 349);
        tone(349, 0.68, 0.7, "sawtooth", 0.1, 262);
      },
      latter: () => {
        [0, 0.13, 0.26, 0.39].forEach((t, i) => tone(520 - i * 30, t, 0.1, "square", 0.07, 680 - i * 40));
      },
      alarm: () => {
        [0, 0.22, 0.44].forEach((t) => tone(1046, t, 0.15, "square", 0.1));
      },
      bom: () => {
        stoy(0, 1.1, 0.6, 400, "lowpass");
        tone(110, 0, 0.9, "sine", 0.5, 40);
      },
      hjerteslag: () => {
        tone(70, 0, 0.12, "sine", 0.5, 50);
        tone(70, 0.16, 0.12, "sine", 0.4, 50);
      },
    };
  })();

  R.vibrer = (monster) => {
    try {
      if (R.felles.lyd && navigator.vibrate) navigator.vibrate(monster);
    } catch (e) {
      /* not supported */
    }
  };

  // Keep the screen awake during a game (re-acquired when the tab comes back).
  // Only one lock at a time, also when holdVaken is called again while a request is on its way.
  let vekkLas = null;
  let vekkVenter = null;
  let vilVaere = false;
  R.holdVaken = async () => {
    vilVaere = true;
    if (vekkLas || vekkVenter || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      vekkVenter = navigator.wakeLock.request("screen");
      const las = await vekkVenter;
      vekkVenter = null;
      if (!vilVaere) {
        las.release().catch(() => {});
        return;
      }
      vekkLas = las;
      las.addEventListener("release", () => {
        if (vekkLas === las) vekkLas = null;
      });
    } catch (e) {
      vekkVenter = null;
      vekkLas = null;
    }
  };
  R.slippVaken = () => {
    vilVaere = false;
    const las = vekkLas;
    vekkLas = null;
    if (las) las.release().catch(() => {});
  };

  // ---------- Live announcements for screen readers ----------

  R.si = (tekst) => {
    const el = $("#si");
    if (!el) return;
    el.textContent = "";
    setTimeout(() => {
      el.textContent = tekst;
    }, 30);
  };

  // ---------- Sheet, confirm, toast ----------

  let arkSvar = null;
  let arkFokus = null;
  R.ark = (html) => {
    if (arkSvar) {
      const s = arkSvar;
      arkSvar = null;
      s(false);
    }
    const aktiv = document.activeElement;
    if (aktiv && aktiv !== document.body && !aktiv.closest("#ark")) {
      // Remember the element and how to find it again if the screen is redrawn meanwhile.
      arkFokus = { el: aktiv, id: aktiv.id, h: aktiv.dataset && aktiv.dataset.h, v: aktiv.dataset && aktiv.dataset.v };
    }
    $("#ark-innhold").innerHTML = html;
    $("#ark").hidden = false;
    const forste = $("#ark-innhold h2") || $("#ark-innhold button, #ark-innhold input");
    if (forste) {
      if (forste.tagName === "H2") forste.setAttribute("tabindex", "-1");
      forste.focus({ preventScroll: true });
    }
  };
  R.lukkArk = () => {
    const ark = $("#ark");
    if (!ark || ark.hidden) return;
    ark.hidden = true;
    $("#ark-innhold").innerHTML = "";
    const husk = arkFokus;
    arkFokus = null;
    if (husk) {
      let mal = document.contains(husk.el) ? husk.el : null;
      if (!mal && husk.id) mal = document.getElementById(husk.id);
      if (!mal && husk.h) mal = $(`#skjerm [data-h="${CSS.escape(husk.h)}"]${husk.v != null ? `[data-v="${CSS.escape(husk.v)}"]` : ""}`);
      if (mal) {
        try {
          mal.focus({ preventScroll: true });
        } catch (e) {
          /* ignore */
        }
      }
    }
    if (arkSvar) {
      const svar = arkSvar;
      arkSvar = null;
      svar(false);
    }
  };
  // Keep keyboard focus inside an open sheet (it is a modal dialog).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !R.arkApent()) return;
    const fokuserbare = $$("#ark-innhold button:not([disabled]), #ark-innhold a[href], #ark-innhold input:not([disabled]), #ark-innhold textarea").filter((el) => el.offsetParent !== null);
    if (!fokuserbare.length) return;
    const forste = fokuserbare[0];
    const siste = fokuserbare[fokuserbare.length - 1];
    if (!$("#ark-innhold").contains(document.activeElement)) {
      e.preventDefault();
      forste.focus();
    } else if (e.shiftKey && document.activeElement === forste) {
      e.preventDefault();
      siste.focus();
    } else if (!e.shiftKey && document.activeElement === siste) {
      e.preventDefault();
      forste.focus();
    }
  });
  R.arkApent = () => !$("#ark").hidden;
  R.bekreft = (tittel, tekst, ja, nei) =>
    new Promise((resolve) => {
      R.ark(`
        <h2 id="ark-tittel">${esc(tittel)}</h2>
        ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
        <div class="knapprad">
          <button class="knapp-2" data-h="ark-svar" data-v="nei">${esc(nei || "Avbryt")}</button>
          <button class="knapp rosa" data-h="ark-svar" data-v="ja">${esc(ja || "Ja")}</button>
        </div>`);
      arkSvar = resolve;
    });
  // Choose one of several options in a sheet. valg: [{ v, tekst }]. Resolves to v or null.
  // Ask before a new game replaces one in progress. Resolves true right away if nothing is running.
  // solo: talk to one person («du»). Defaults to true for one-player games; pass it for games
  // that can be played alone or together (e.g. sp.antall === 1).
  R.bekreftNytt = (pagar, solo) => {
    if (!pagar) return Promise.resolve(true);
    const alene = solo != null ? !!solo : !!(meta().spillere && meta().spillere[1] === 1);
    return R.bekreft("Starte et nytt spill?", alene ? "Spillet du holder på med, forsvinner." : "Spillet dere holder på med, og stillingen forsvinner.", "Start nytt", "Avbryt");
  };
  R.velgIArk = (tittel, valg, tekst) =>
    new Promise((resolve) => {
      R.ark(`
        <h2 id="ark-tittel">${esc(tittel)}</h2>
        ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
        <div class="stabel">${valg.map((o, i) => `<button class="knapp-2" data-h="ark-svar" data-v="${i}">${esc(o.tekst)}</button>`).join("")}</div>
        <button class="lenke" data-h="lukk-ark">Avbryt</button>`);
      arkSvar = (svar) => resolve(svar === false || svar == null ? null : valg[Number(svar)].v);
    });

  let toastId = null;
  R.skjulToast = () => {
    clearTimeout(toastId);
    const t = $("#toast");
    if (t) t.classList.remove("vis");
  };
  // R.toast(tekst) or R.toast(tekst, { topp: true }) — the top variant for screens where the area
  // above the dock is the game board.
  R.toast = (tekst, valg) => {
    const t = $("#toast");
    t.textContent = tekst;
    // Just above the action area when the screen has one (never over the heading or the buttons).
    const dokk = $("#skjerm .dokk");
    const topp = dokk ? dokk.getBoundingClientRect().top : 0;
    if (!(valg && valg.topp) && dokk && topp > 120 && topp < window.innerHeight) {
      t.style.top = "auto";
      t.style.bottom = Math.round(window.innerHeight - topp + 10) + "px";
    } else {
      t.style.top = "";
      t.style.bottom = "";
    }
    t.classList.add("vis");
    clearTimeout(toastId);
    toastId = setTimeout(() => t.classList.remove("vis"), 2200);
  };

  R.kopier = async (tekst) => {
    try {
      await navigator.clipboard.writeText(tekst);
      R.toast("Kopiert!");
      return true;
    } catch (e) {
      R.toast("Kunne ikke kopiere – marker teksten selv");
      return false;
    }
  };

  // Share a link with the phone's share sheet, or copy it.
  R.del = async (tittel, tekst, url) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: tittel, text: tekst, url: url });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    // No share sheet: copy the whole thing (e.g. a result with coloured squares), not just the link.
    R.kopier([tekst, url].filter(Boolean).join("\n"));
  };

  // ---------- Countdown overlay ----------

  // Resolves true when the countdown finished, false when the screen changed during it — so:
  //   if (!(await R.nedtelling())) return;
  R.nedtelling = async (liste, ms) => {
    liste = liste || ["3", "2", "1"];
    ms = ms || 800;
    const fortsatt = R.vakt();
    const el = $("#nedtelling");
    const hoved = $("#hoved");
    el.hidden = false;
    if (hoved) hoved.inert = true; // no tabbing to buttons behind the countdown
    const fokus = document.activeElement;
    if (fokus && fokus.blur) fokus.blur(); // Enter/space must not re-trigger the button meanwhile
    for (let i = 0; i < liste.length; i++) {
      if (!fortsatt()) return false; // the screen changed: R.gaTil already hid the overlay
      const t = String(liste[i]);
      el.innerHTML = `<span class="${t.length > 2 ? "ord" : ""}">${esc(t)}</span>`;
      if (i < liste.length - 1 || /^\d+$/.test(t)) R.lyd.tikk();
      else R.lyd.pling();
      R.vibrer(20);
      await R.vent(R.rolig() ? Math.min(ms, 500) : ms);
    }
    if (!fortsatt()) return false; // don't hide a newer countdown on the new screen
    el.hidden = true;
    el.innerHTML = "";
    if (hoved) hoved.inert = false;
    return true;
  };

  // ---------- Confetti ----------

  let konfettiNr = 0;
  R.stoppKonfetti = () => {
    konfettiNr++;
    const lerret = $("#konfetti");
    const ctx = lerret && lerret.getContext && lerret.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, lerret.width, lerret.height);
  };
  R.konfetti = (fargeTokens) => {
    if (R.rolig()) return;
    const mitt = ++konfettiNr;
    const lerret = $("#konfetti");
    const ctx = lerret && lerret.getContext && lerret.getContext("2d");
    if (!ctx) return;
    const stil = getComputedStyle(document.documentElement);
    const farger = (fargeTokens || ["--aksent", "--rosa", "--mynte", "--lampe", "--himmel", "--lilla"])
      .map((t) => (t.startsWith("--") ? stil.getPropertyValue(t).trim() : t))
      .filter(Boolean);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const b = window.innerWidth;
    const h = window.innerHeight;
    lerret.width = b * dpr;
    lerret.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const biter = Array.from({ length: 150 }, () => ({
      x: b / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.32,
      vx: (Math.random() - 0.5) * 13,
      vy: -Math.random() * 13 - 5,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 9,
      f: farger[Math.floor(Math.random() * farger.length)],
    }));
    const start = performance.now();
    function ramme(na) {
      if (mitt !== konfettiNr) return; // stopped or replaced by a newer burst
      const t = na - start;
      ctx.clearRect(0, 0, b, h);
      for (const p of biter) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - t / 3200);
        ctx.fillStyle = p.f;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (t < 3200) requestAnimationFrame(ramme);
      else ctx.clearRect(0, 0, b, h);
    }
    requestAnimationFrame(ramme);
  };

  // ---------- Timer ----------
  // new R.Timer({ id, sekunder, vedTikk(igjen), vedSlutt(), tikk: true, visning: "mm:ss" | "sek" })
  // Draws into the R.ui.timer() markup with the same id. Timers stop automatically when the
  // screen changes, unless { overlev: true }.

  const aktiveTimere = new Set();
  class Timer {
    constructor(valg) {
      this.id = valg.id || "timer";
      this.total = valg.sekunder;
      this.igjenMs = valg.sekunder * 1000;
      this.vedTikk = valg.vedTikk || null;
      this.vedSlutt = valg.vedSlutt || null;
      this.tikk = valg.tikk !== false;
      this.overlev = !!valg.overlev;
      this.visning = valg.visning || "mm:ss"; // "sek" shows only whole seconds
      this.alarm = valg.alarm !== false; // false: no alarm sound/vibration when time is up
      this.kjorer = false;
      this.ferdig = false;
      this.sisteSek = null;
      this.intervall = null;
      aktiveTimere.add(this);
    }
    get igjen() {
      const ms = this.kjorer ? this.slutt - performance.now() : this.igjenMs;
      return Math.max(0, ms / 1000);
    }
    start() {
      if (this.kjorer || this.ferdig) return this;
      this.slutt = performance.now() + this.igjenMs;
      this.kjorer = true;
      clearInterval(this.intervall);
      this.intervall = setInterval(() => this.steg(), 200);
      this.steg();
      return this;
    }
    pause() {
      if (!this.kjorer) return this;
      this.igjenMs = Math.max(0, this.slutt - performance.now());
      this.kjorer = false;
      clearInterval(this.intervall);
      this.tegn();
      return this;
    }
    fortsett() {
      return this.start();
    }
    veksle() {
      return this.kjorer ? this.pause() : this.start();
    }
    leggTil(sek) {
      if (this.ferdig) {
        this.ferdig = false;
        this.igjenMs = sek * 1000;
        this.total = Math.max(this.total, sek);
        return this.start();
      }
      if (this.kjorer) this.slutt += sek * 1000;
      else this.igjenMs += sek * 1000;
      this.total = Math.max(this.total, this.igjen);
      this.tegn();
      return this;
    }
    stopp() {
      if (this.kjorer) this.igjenMs = Math.max(0, this.slutt - performance.now());
      clearInterval(this.intervall);
      this.kjorer = false;
      aktiveTimere.delete(this);
      return this;
    }
    steg() {
      const igjen = this.igjen;
      const sek = Math.ceil(igjen);
      if (sek !== this.sisteSek) {
        this.sisteSek = sek;
        if (this.tikk && sek > 0 && sek <= 5 && this.kjorer) {
          R.lyd.tikk();
          R.vibrer(10);
        }
        if (this.vedTikk) this.vedTikk(sek);
      }
      this.tegn();
      if (igjen <= 0 && this.kjorer) {
        this.kjorer = false;
        this.igjenMs = 0; // show 0:00, not the starting time
        this.ferdig = true;
        clearInterval(this.intervall);
        this.tegn();
        if (this.alarm) {
          R.lyd.alarm();
          R.vibrer([200, 100, 200]);
        }
        if (this.vedSlutt) this.vedSlutt();
      }
    }
    tegn() {
      const el = document.getElementById(this.id);
      if (!el) return;
      const igjen = this.igjen;
      const fyll = el.querySelector(".fyll");
      if (fyll) {
        const omkrets = 2 * Math.PI * 54;
        const andel = this.total > 0 ? igjen / this.total : 0;
        fyll.style.strokeDasharray = String(omkrets);
        fyll.style.strokeDashoffset = String(omkrets * (1 - andel));
      }
      const tid = el.querySelector(".timer-tid");
      if (tid) tid.textContent = this.visning === "sek" ? String(Math.ceil(igjen)) : R.formaterTid(igjen);
      el.classList.toggle("lite", igjen <= 10 && igjen > 0);
      el.classList.toggle("ferdig", this.ferdig);
      el.classList.toggle("pause", !this.kjorer && !this.ferdig);
      const pauseKnapp = el.querySelector("[data-timer-pause]");
      if (pauseKnapp) pauseKnapp.textContent = this.kjorer ? "Pause" : this.ferdig ? "Ferdig" : "Fortsett";
    }
  }
  R.Timer = Timer;
  // The running (or paused) timer with this id, if any.
  R.timer = (id) => Array.from(aktiveTimere).reverse().find((t) => t.id === (id || "timer")) || null;
  function stoppTimere(alle) {
    for (const t of Array.from(aktiveTimere)) if (alle || !t.overlev) t.stopp();
  }
  R.stoppTimere = () => stoppTimere(true);

  // ---------- Join codes (for "each on their own phone" games) ----------
  // Values are packed into bits, written in Crockford base32 and closed with a check symbol that
  // also depends on `salt` (for example a hash of the game's word list), so a code from another
  // version of the content is rejected instead of giving different cards.

  const ALFABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  // sjekk = number of check symbols (default 1; 2 catches almost every typo, at one extra character).
  // FNV alone mixes a change near the end of the text into only a few bits, so the hash is run
  // through a finaliser (murmur3's fmix32) first: every typo or swapped pair then changes each
  // check symbol at random — one symbol misses 1 in 32, two symbols about 1 in 1000.
  const bland = (h) => {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const sjekksymboler = (symboler, salt, sjekk) =>
    Array.from({ length: sjekk || 1 }, (_, k) => bland(R.hash((salt || 0) + (k ? ":" + (k + 1) : "") + ":" + symboler.join(","))) >>> 27);
  R.kode = {
    lag(verdier, bredder, salt, sjekk) {
      const bits = [];
      verdier.forEach((v, i) => {
        const b = bredder[i];
        if (v < 0 || v >= 2 ** b) throw new Error(`Verdi ${v} passer ikke i ${b} bit`);
        for (let j = b - 1; j >= 0; j--) bits.push(Math.floor(v / 2 ** j) % 2);
      });
      while (bits.length % 5) bits.push(0);
      const symboler = [];
      for (let i = 0; i < bits.length; i += 5) symboler.push(bits.slice(i, i + 5).reduce((s, b) => s * 2 + b, 0));
      symboler.push(...sjekksymboler(symboler, salt, sjekk));
      return symboler.map((s) => ALFABET[s]).join("");
    },
    les(tekst, bredder, salt, sjekk) {
      const n = sjekk || 1;
      const kode = R.kode.normaliser(tekst);
      const totalBits = bredder.reduce((s, b) => s + b, 0);
      const lengde = Math.ceil(totalBits / 5) + n;
      if (kode.length !== lengde) return null;
      const symboler = kode.split("").map((c) => ALFABET.indexOf(c));
      const sum = symboler.splice(symboler.length - n, n);
      if (sjekksymboler(symboler, salt, n).join(",") !== sum.join(",")) return null;
      const bits = [];
      symboler.forEach((s) => {
        for (let i = 4; i >= 0; i--) bits.push((s >> i) & 1);
      });
      let p = 0;
      return bredder.map((b) => {
        let v = 0;
        for (let i = 0; i < b; i++) v = v * 2 + (bits[p++] || 0);
        return v;
      });
    },
    lengde: (bredder, sjekk) => Math.ceil(bredder.reduce((s, b) => s + b, 0) / 5) + (sjekk || 1),
    normaliser: (tekst) =>
      String(tekst || "")
        .toUpperCase()
        .replace(/O/g, "0")
        .replace(/[IL]/g, "1")
        .replace(/U/g, "V")
        .replace(/[^0-9A-Z]/g, "")
        .split("")
        .filter((c) => ALFABET.includes(c))
        .join(""),
    formater: (kode) => String(kode).replace(/(.{4})(?=.)/g, "$1 "),
    lenke: (kode) => location.origin + location.pathname + "#" + kode,
    // nivå: error correction "M" (default) or "L" for long links (more data fits).
    qr(tekst, nivå) {
      const Q = window.LuringenQr;
      if (!Q) return "";
      try {
        return Q.qrSvg(Q.lagQr(tekst, nivå || "M"), { mork: "var(--blekk)", lys: "var(--papir)", etikett: "QR-kode som åpner spillet med koden" });
      } catch (e) {
        return "";
      }
    },
  };

  // ---------- Deck without repeats ----------
  // const stokk = R.kortstokk("sporsmal", liste.length); const i = stokk.neste(i => filter);
  // Remembers which cards were shown (on this device) so the same card doesn't come back until
  // the whole deck (within the filter) has been used.

  R.kortstokk = (navn, antall) => {
    const nokkel = (APP ? APP.id : meta().id || "spill") + ".brukt." + navn;
    let brukt = new Set((R.les(nokkel, []) || []).filter((i) => Number.isInteger(i) && i >= 0 && i < antall));
    let forrige = -1;
    const lagre = () => R.skriv(nokkel, Array.from(brukt));
    return {
      neste(filter) {
        const ok = filter || (() => true);
        let kandidater = [];
        for (let i = 0; i < antall; i++) if (!brukt.has(i) && ok(i)) kandidater.push(i);
        if (!kandidater.length) {
          for (const i of Array.from(brukt)) if (ok(i)) brukt.delete(i);
          for (let i = 0; i < antall; i++) if (!brukt.has(i) && ok(i) && i !== forrige) kandidater.push(i);
          if (!kandidater.length && forrige >= 0 && ok(forrige)) kandidater.push(forrige);
        }
        if (!kandidater.length) return -1;
        const i = R.velg(kandidater);
        brukt.add(i);
        forrige = i;
        lagre();
        return i;
      },
      igjen(filter) {
        const ok = filter || (() => true);
        let n = 0;
        for (let i = 0; i < antall; i++) if (!brukt.has(i) && ok(i)) n++;
        return n;
      },
      nullstill() {
        brukt = new Set();
        lagre();
      },
    };
  };

  // ---------- Graphics ----------

  R.figur = (id, klasse, valg) => `<span class="figur-ramme ${klasse || ""}">${G.svg(id || (APP && APP.id) || meta().id, valg)}</span>`;
  R.logo = (valg) => G.logo(valg);
  const FINGER =
    '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M13 40c-2-4-3-9-3-14 0-8 6-14 14-14s14 6 14 14c0 3-1 5-2 7"/><path d="M18.5 42c-2-5-3-10-3-16 0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5c0 6-2 11-4.5 15"/><path d="M24 26c0 6-1.2 11.5-4 17"/><path d="M29 28.5c0 5-1 9-3 13"/><path d="M9.5 17.5C12.5 11 17.8 7.5 24 7.5c5 0 9.4 2 12.4 5.4"/><path d="M38.6 17c1 2.5 1.6 5.4 1.6 9"/></svg>';

  // ---------- HTML building blocks ----------
  // Text parameters are escaped. Parameters whose name ends in "Html" are inserted as-is.

  const attr = (navn, v) => (v == null || v === false ? "" : ` ${navn}="${esc(v)}"`);
  const ui = (R.ui = {});

  // Button. variant: "" (accent), "rosa", "mynte", "lampe", "lilla", "himmel", "rod", "papir"; plus "liten"/"stor".
  // o: { v, id, av (disabled), ikon, etikett (aria-label), stille (no click sound), tekstHtml }
  ui.knapp = (tekst, h, o = {}) =>
    `<button class="knapp ${o.variant || ""}"${attr("data-h", h)}${attr("data-v", o.v)}${attr("id", o.id)}${o.av ? " disabled" : ""}${o.stille ? " data-stille" : ""}${attr("aria-label", o.etikett)}>${o.ikon ? `<span class="ikon" aria-hidden="true">${o.ikon}</span>` : ""}${o.tekstHtml || esc(tekst)}</button>`;
  ui.knapp2 = (tekst, h, o = {}) =>
    `<button class="knapp-2 ${o.variant || ""}"${attr("data-h", h)}${attr("data-v", o.v)}${attr("id", o.id)}${o.av ? " disabled" : ""}${o.stille ? " data-stille" : ""}${attr("aria-label", o.etikett)}>${o.ikon ? `<span class="ikon" aria-hidden="true">${o.ikon}</span>` : ""}${o.tekstHtml || esc(tekst)}</button>`;
  ui.lenke = (tekst, h, o = {}) => `<button class="lenke"${attr("data-h", h)}${attr("data-v", o.v)}${attr("id", o.id)}>${esc(tekst)}</button>`;
  ui.dokk = (...deler) => `<div class="dokk">${deler.filter(Boolean).join("")}</div>`;
  ui.lenkerad = (...deler) => `<div class="lenkerad">${deler.filter(Boolean).join("")}</div>`;

  // Standard game home: mascot, name, genre label, slogan, buttons and facts.
  ui.spillhjem = (o = {}) => {
    const navn = o.navn || (APP && APP.navn) || meta().navn;
    const under = o.undertittel || (APP && APP.undertittel) || meta().undertittel;
    const merker = o.merker || [];
    return `
      <div class="spillhjem">
        ${R.figur(o.figur)}
        <h1 id="skjerm-tittel">${esc(navn)}</h1>
        ${under ? `<span class="undertittel">${esc(under)}</span>` : ""}
        ${o.slagordHtml ? `<p class="slagord">${o.slagordHtml}</p>` : ""}
      </div>
      <div class="hjem-knapper">${o.knapperHtml || ""}</div>
      ${merker.length ? `<ul class="merker" aria-label="Om spillet">${merker.map(([b, t]) => `<li><b>${esc(b)}</b> ${esc(t)}</li>`).join("")}</ul>` : ""}`;
  };

  // Home-screen buttons. While a game is running, "Fortsett" is the main action and starting
  // over is secondary (pair it with R.bekreftNytt in the handler).
  // o: { pagar (bool), fortsettTekst, startTekst, nyH ("nytt"), fortsettH ("fortsett"), ekstraHtml }
  ui.startKnapper = (o = {}) =>
    (o.pagar
      ? ui.knapp(o.fortsettTekst || "Fortsett spillet", o.fortsettH || "fortsett") + ui.knapp2(o.nyTekst || "Nytt spill", o.nyH || "nytt")
      : ui.knapp(o.startTekst || "Start spill", o.nyH || "nytt")) + (o.ekstraHtml || "");

  // Segmented choice: valg = [[verdi, tekst], ...]
  ui.seg = (h, valg, aktiv, o = {}) =>
    `<div class="seg" role="group"${attr("aria-label", o.etikett)}>${valg
      .map(([v, t]) => `<button data-h="${esc(h)}" data-v="${esc(v)}" aria-pressed="${String(v) === String(aktiv)}"${o.av && o.av(v) ? " disabled" : ""}>${esc(t)}</button>`)
      .join("")}</div>`;

  // Number stepper: buttons send data-v "-1" / "1".
  ui.teller = (h, verdi, min, max, o = {}) =>
    `<div class="teller"${attr("id", o.id)}>
      <button data-h="${esc(h)}" data-v="-1" aria-label="${esc(o.minus || "Færre")}"${verdi <= min ? " disabled" : ""}>−</button>
      <output aria-live="polite">${esc(o.vis ? o.vis(verdi) : verdi)}${o.enhet ? ` <small>${esc(o.enhet)}</small>` : ""}</output>
      <button data-h="${esc(h)}" data-v="1" aria-label="${esc(o.pluss || "Flere")}"${verdi >= max ? " disabled" : ""}>+</button>
    </div>`;

  // Tiles: valg = [{ v, tittel, tekst, ikon }]
  // With an array as aktiv the tiles are a multi-select: each gets a check mark.
  ui.fliser = (h, valg, aktiv, o = {}) =>
    `<div class="fliser ${o.en ? "en" : ""} ${Array.isArray(aktiv) ? "flervalg" : ""}">${valg
      .map(
        (f) => `<button class="flis" data-h="${esc(h)}" data-v="${esc(f.v)}" aria-pressed="${String(f.v) === String(aktiv) || (Array.isArray(aktiv) && aktiv.includes(f.v))}"${f.farge ? ` style="--nf: ${esc(f.farge)}"` : ""}${f.av ? " disabled" : ""}>
          ${f.ikon ? `<span class="flis-ikon" aria-hidden="true">${f.ikon}</span>` : ""}<b>${esc(f.tittel)}</b>${f.tekst ? `<span>${esc(f.tekst)}</span>` : ""}
        </button>`,
      )
      .join("")}</div>`;

  // Multi-select chips: valg = [{ v, tekst, ikon, antall }]; valgt = array of v
  ui.brikker = (h, valg, valgt, o = {}) =>
    `<div class="brikker" role="group"${attr("aria-label", o.etikett)}>${
      o.alle ? `<button class="brikke alle" data-h="${esc(h)}" data-v="*" aria-pressed="${valgt.length === valg.length}">Alle</button>` : ""
    }${valg
      .map(
        (b) =>
          `<button class="brikke" data-h="${esc(h)}" data-v="${esc(b.v)}" aria-pressed="${valgt.includes(b.v)}">${b.ikon ? `<span aria-hidden="true">${b.ikon}</span>` : ""}${esc(b.tekst)}${
            b.antall != null ? ` <span class="antall">${esc(b.antall)}</span>` : ""
          }</button>`,
      )
      .join("")}</div>`;

  // On/off switch
  ui.bryter = (h, pa, tittel, tekst) =>
    `<button class="bryter" data-h="${esc(h)}" aria-pressed="${!!pa}"><span><b>${esc(tittel)}</b>${tekst ? `<small>${esc(tekst)}</small>` : ""}</span><i aria-hidden="true"></i></button>`;

  // Player list with names (shared between games). Uses S.antall as the count.
  ui.spillere = (o = {}) => {
    const S = R.S;
    const min = o.min || 2;
    const max = Math.min(o.max || 10, R.MAKS_SPILLERE);
    const antall = R.klamp(S.antall || min, min, max);
    const rader = [];
    for (let i = 0; i < antall; i++) {
      rader.push(`<div class="spiller" style="--pf: var(--p${i + 1})">
        ${R.avatar(i)}
        <input id="navn-${i}" data-navn="${i}" value="${esc(R.felles.navn[i] || "")}" placeholder="Spiller ${i + 1}" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="next" aria-label="Navn på spiller ${i + 1}">
        ${antall > min ? `<button class="fjern" data-h="spiller-fjern" data-v="${i}" aria-label="Fjern ${esc(R.navn(i))}">×</button>` : ""}
      </div>`);
    }
    return `<section class="seksjon" id="spillerboks" data-min="${min}" data-max="${max}">
      <div class="seksjon-hode"><h2>${esc(o.tittel || "Hvem spiller?")}</h2><span class="tall">${antall} ${antall === 1 ? "spiller" : "spillere"}</span></div>
      <div class="spillere">${rader.join("")}</div>
      ${min === max ? "" : `<button class="legg-til" data-h="spiller-legg-til"${antall >= max ? " disabled" : ""}>+ Legg til spiller${antall >= max ? ` (maks ${max})` : ""}</button>`}
      ${o.hjelp ? `<p class="hjelp">${esc(o.hjelp)}</p>` : ""}
    </section>`;
  };

  // Pick a player: buttons with avatar and name. valgt = index or array; av = fn(i) → disabled.
  ui.velgere = (h, indekser, valgt, o = {}) =>
    `<div class="velgere">${indekser
      .map(
        (i) =>
          `<button class="velger" data-h="${esc(h)}" data-v="${i}" aria-pressed="${Array.isArray(valgt) ? valgt.includes(i) : valgt === i}"${o.av && o.av(i) ? " disabled" : ""}>${R.avatar(i)}<span>${esc(R.navn(i))}</span></button>`,
      )
      .join("")}</div>`;

  ui.lagmerke = (i, tekst) => `<span class="lagmerke" style="--lf: ${R.LAG[i % R.LAG.length].farge}"><i aria-hidden="true"></i>${esc(tekst || "Lag " + R.LAG[i % R.LAG.length].navn)}</span>`;

  // "Give the phone to …" screen.
  // o: { i, h (button action), v, tekst, knapp, advarsel, ikon (default 🙈, "" for none),
  //      merkeHtml (badge on the avatar), prikker: [antall, na] }
  ui.giTil = (o) => `
    ${o.prikker ? ui.fremdrift(o.prikker[0], o.prikker[1]) : ""}
    <div class="gi-til">
      <span class="gi-til-avatar">${R.avatar(o.i, "gigant")}${o.merkeHtml ? `<span class="gi-til-merke">${o.merkeHtml}</span>` : ""}</span>
      <p class="etikett">${esc(o.tekst || "Gi mobilen til")}</p>
      <h1 id="skjerm-tittel">${esc(R.navn(o.i))}</h1>
      ${o.advarsel === "" ? "" : `<p class="ikke-se">${o.ikon === "" ? "" : esc(o.ikon || "🙈") + " "}${esc(o.advarsel || "De andre ser bort")}</p>`}
    </div>
    ${ui.dokk(ui.knapp(o.knapp || `Jeg er ${R.navn(o.i)}`, o.h, { v: o.v != null ? o.v : o.i }))}`;

  // Progress dots: antall players, na = current index (−1 for none), ferdige = set/array of done indexes
  ui.fremdrift = (antall, na, ferdige) => {
    const f = new Set(ferdige || Array.from({ length: Math.max(0, na) }, (_, i) => i));
    return `<div class="fremdrift" aria-hidden="true">${Array.from(
      { length: antall },
      (_, i) => `<span class="prikk ${i === na ? "na" : f.has(i) ? "ferdig" : ""}" style="--pf: var(--p${(i % 20) + 1})"></span>`,
    ).join("")}</div>`;
  };

  // Hold-to-reveal card. The back is filled by def.hemmelig.innhold(S, id) while held.
  ui.mappe = (o = {}) => `
    <button class="mappe" data-mappe="${esc(o.id != null ? o.id : "kort")}" aria-label="${esc(o.etikettAria || "Hold inne for å se det hemmelige kortet")}">
      <span class="mappe-indre">
        <span class="mappe-forside">
          <span class="mappe-etikett">${esc(o.etikett || "Hemmelig")}</span>
          ${R.figur(o.figur)}
          <span class="mappe-finger">${FINGER}<span>${esc(o.tekst || "Hold inne for å se")}</span></span>
        </span>
        <span class="mappe-bakside" aria-live="polite"></span>
      </span>
    </button>`;

  // Big card for question decks. o: { tekst | tekstHtml, etikett, nr, fot, klasse, sveip, kompakt }
  ui.storkort = (o = {}) => {
    const tekst = o.tekstHtml || esc(o.tekst || "");
    // Size by the visible statement only: markup and a small .prefiks lead-in don't count.
    const synlig = o.tekst != null ? o.tekst : String(o.tekstHtml || "").replace(/<span class="prefiks">[\s\S]*?<\/span>/g, "").replace(/<[^>]*>/g, "");
    const lang = (o.lengde != null ? o.lengde : synlig.length) > 90 ? "lang" : "";
    return `<div class="bunke${o.kompakt ? " kompakt" : ""}"><article class="storkort ${o.klasse || ""}"${attr("data-sveip", o.sveip)}${attr("id", o.id)}>
      ${o.etikett || o.nr ? `<div class="storkort-topp">${o.etikett ? `<span class="storkort-etikett">${esc(o.etikett)}</span>` : "<span></span>"}${o.nr ? `<span class="storkort-nr">${esc(o.nr)}</span>` : ""}</div>` : ""}
      <p class="storkort-tekst ${lang}" aria-live="polite">${tekst}</p>
      ${o.fotHtml || o.fot ? `<p class="storkort-fot">${o.fotHtml || esc(o.fot)}</p>` : ""}
    </article></div>`;
  };

  // Countdown ring. Use with new R.Timer({ id }).
  ui.timer = (o = {}) => `
    <div class="timer ${o.stor ? "stor alene" : ""} ${o.alene ? "alene" : ""}" id="${esc(o.id || "timer")}" role="timer" aria-live="off">
      <div class="timer-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="spor" cx="60" cy="60" r="54"/><circle class="fyll" cx="60" cy="60" r="54"/></svg>
        <span class="timer-tid">${o.visning === "sek" ? Math.ceil(o.sekunder || 0) : R.formaterTid(o.sekunder || 0)}</span>
      </div>
      ${o.kontrollHtml ? `<div class="timer-kontroll">${o.kontrollHtml}</div>` : ""}
    </div>`;

  // Scoreboard. rader: [{ navn, i (avatar index) | lag (team index), poeng, pluss }]
  ui.poengliste = (rader, o = {}) => {
    const sortert = rader.slice().sort((a, b) => b.poeng - a.poeng);
    const topp = sortert.length ? sortert[0].poeng : 0;
    return `<ol class="poengliste">${sortert
      .map((r, n) => {
        const merke = r.lag != null ? `<span class="avatar" style="--pf: ${R.LAG[r.lag % R.LAG.length].farge}" aria-hidden="true"></span>` : R.avatar(r.i || 0);
        const navn = r.navn != null ? r.navn : r.lag != null ? "Lag " + R.LAG[r.lag % R.LAG.length].navn : R.navn(r.i);
        return `<li class="${r.poeng === topp && topp > 0 && !o.utenLeder ? "leder" : ""}"><span class="plass-nr">${n + 1}</span>${merke}<span class="navn">${esc(navn)}</span>${
          r.pluss ? `<span class="pluss">+${esc(r.pluss)}</span>` : ""
        }<span class="sum">${esc(r.poeng)}</span></li>`;
      })
      .join("")}</ol>`;
  };

  // Podium for the top three. rader as in poengliste. Equal points share a place (1, 1, 3).
  ui.pall = (rader, o = {}) => {
    const alle = rader.filter((r) => r.poeng > 0).sort((a, b) => b.poeng - a.poeng);
    if (alle.length < 2) return "";
    const s = alle.slice(0, 3);
    const rang = (r) => 1 + alle.filter((x) => x.poeng > r.poeng).length;
    const plass = (r) => {
      if (!r) return "<div></div>";
      const n = rang(r);
      const navn = r.navn != null ? r.navn : r.lag != null ? "Lag " + R.LAG[r.lag % R.LAG.length].navn : R.navn(r.i);
      const merke = r.lag != null ? `<span class="avatar stor" style="--pf: ${R.LAG[r.lag % R.LAG.length].farge}" aria-hidden="true"></span>` : R.avatar(r.i || 0, "stor");
      return `<div class="pall-plass p${Math.min(n, 3)}">${merke}<span class="navn">${esc(navn)}</span><span class="poeng">${esc(r.poeng)} ${esc(o.enhet || "p")}</span><span class="blokk">${n}</span></div>`;
    };
    return `<div class="pall" aria-label="Pallen">${plass(s[1])}${plass(s[0])}${plass(s[2])}</div>`;
  };

  // Suggest other rusj games that fit the group (window.RUSJ_ANDRE is written by the build).
  // o: { antall, tittel, maks }. With antall 1 the heading becomes «Flere spill du kan spille alene».
  ui.flereSpill = (o = {}) => {
    const andre = (window.RUSJ_ANDRE || []).filter((g) => !o.antall || (o.antall >= g.spillere[0] && o.antall <= g.spillere[1]));
    if (!andre.length) return "";
    const dag = new Date();
    const fro = R.hash(((APP && APP.id) || "") + dag.getFullYear() + "-" + dag.getMonth() + "-" + dag.getDate());
    const maks = o.maks || 3;
    const r = R.rng(fro);
    // After a drinking game: at most two other drinking games, the rest ordinary games (a pause).
    const utvalg = meta().alder18
      ? (() => {
          const drikke = R.stokk(andre.filter((g) => g.alder18), r).slice(0, Math.min(2, maks - 1));
          return [...drikke, ...R.stokk(andre.filter((g) => !g.alder18), r).slice(0, maks - drikke.length)];
        })()
      : R.stokk(andre, r).slice(0, maks);
    return `<section class="seksjon flere-spill" aria-labelledby="flere-tittel">
      <h2 id="flere-tittel">${esc(o.tittel || (o.antall === 1 ? "Flere spill du kan spille alene" : "Spill noe annet med samme gjeng"))}</h2>
      <div class="flere-liste">${utvalg
        .map(
          (g) => `<a class="flere-kort" href="/${esc(g.id)}/" style="--kf: ${esc(g.farge)}">
            <span class="flere-figur">${G.svg(g.id)}</span>
            <span class="flere-tekst"><b>${esc(g.navn)}</b><small>${esc(g.undertittel)}</small></span>
          </a>`,
        )
        .join("")}</div>
      <a class="lenke" href="/">Se alle spillene på rusj.no</a>
    </section>`;
  };

  ui.merker = (merker) => `<ul class="merker">${merker.map(([b, t]) => `<li><b>${esc(b)}</b> ${esc(t)}</li>`).join("")}</ul>`;

  // ---------- The app ----------

  let APP = null;
  let S = null;
  let NOKKEL = "";
  let ryddere = [];

  // Counts screen changes. R.vakt() gives a check that is false once the screen has changed —
  // use it after every await in an action so a late timer can't drag the player back:
  //   const fortsatt = R.vakt(); await R.vent(800); if (!fortsatt()) return;
  let skjermNr = 0;
  let sisteSkjermbytte = -1e9;
  let sisteOmtegning = -1e9;
  let sisteKlikk = null;
  let sisteKlikkPos = null;
  R.vakt = () => {
    const nr = skjermNr;
    return () => nr === skjermNr;
  };

  R.vedForlat = (fn) => {
    ryddere.push(fn);
  };
  function rydd() {
    stoppTimere(false);
    const fns = ryddere;
    ryddere = [];
    fns.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  }

  R.lagre = () => {
    if (!APP) return;
    S._tid = Date.now();
    // For the front page's «Fortsett» badge: is a game in progress? (APP.pagar decides if given.)
    try {
      S._aktiv = APP.pagar ? !!APP.pagar(S) : S.skjerm !== (APP.hjem || "hjem");
    } catch (e) {
      S._aktiv = false;
    }
    const data = APP.lagre ? APP.lagre(S) : S;
    R.skriv(NOKKEL, data);
  };

  function skjermDef(navn) {
    const sk = APP.skjermer[navn];
    if (!sk) throw new Error("Ukjent skjerm: " + navn);
    return sk;
  }

  function oppdaterTopp() {
    const sk = skjermDef(S.skjerm);
    const hjem = S.skjerm === (APP.hjem || "hjem");
    $("#tilportal").hidden = !hjem;
    $("#tilbake").hidden = hjem;
    const tittel = typeof sk.tittel === "function" ? sk.tittel(S) : sk.tittel;
    $("#topp-tittel").textContent = tittel == null ? (hjem ? "" : APP.navn) : tittel;
    $("#reglerknapp").hidden = !APP.regler || S.skjerm === "regler" || S.skjerm === "alder"; // no content before the 18+ answer
    const lyd = $("#lydknapp");
    lyd.setAttribute("aria-pressed", R.felles.lyd ? "true" : "false");
    lyd.setAttribute("aria-label", R.felles.lyd ? "Skru av lyd" : "Skru på lyd");
  }

  function tegn(valg) {
    const sk = skjermDef(S.skjerm);
    const el = $("#skjerm");
    el.innerHTML = sk.vis(S);
    el.className = "skjerm skjerm-" + S.skjerm;
    if (valg.animer) {
      void el.offsetWidth;
      el.classList.add("inn");
    }
    oppdaterTopp();
    if (sk.etter) sk.etter(S, el);
  }

  R.gaTil = (navn) => {
    if (S.skjerm && APP.skjermer[S.skjerm] && APP.skjermer[S.skjerm].ut) APP.skjermer[S.skjerm].ut(S);
    skjermNr++;
    rydd();
    lukkMappe(true);
    R.lukkArk();
    R.skjulToast();
    R.stoppKonfetti();
    const ned = $("#nedtelling");
    if (ned && !ned.hidden) {
      ned.hidden = true;
      ned.innerHTML = "";
    }
    const hoved = $("#hoved");
    if (hoved) hoved.inert = false;
    const si = $("#si");
    if (si) si.textContent = ""; // a screen-reader message (maybe a secret) must not outlive its screen
    skjermDef(navn);
    S.skjerm = navn;
    sisteSkjermbytte = performance.now(); // see the ghost-tap guard in the click handler
    // Back on the game's home screen: drop our extra history entry, so the phone's back button
    // leaves the game with one press.
    if (navn === (APP.hjem || "hjem") && harHistorikk && !R.iRamme) {
      harHistorikk = false;
      ignorerPop = true;
      try {
        history.back();
      } catch (e) {
        ignorerPop = false;
      }
    }
    tegn({ animer: true });
    window.scrollTo(0, 0);
    const h = $("#skjerm h1, #skjerm h2");
    if (h) {
      h.setAttribute("tabindex", "-1");
      try {
        h.focus({ preventScroll: true });
      } catch (e) {
        h.focus();
      }
    }
    const sk = skjermDef(navn);
    if (sk.inn) sk.inn(S);
    sikreHistorikk();
    R.lagre();
    // Keep the screen on while a game is in progress; let it sleep on the home screen.
    try {
      if (navn === (APP.hjem || "hjem")) R.slippVaken();
      else if (APP.pagar && APP.pagar(S)) R.holdVaken();
    } catch (e) {
      /* ignore */
    }
  };

  // Re-draw the current screen in place (after a state change), keeping scroll and focus.
  R.vis = () => {
    sisteOmtegning = performance.now();
    const aktiv = document.activeElement;
    const fokusId = aktiv && aktiv.id;
    const fokusH = aktiv && aktiv.dataset && aktiv.dataset.h;
    const fokusV = aktiv && aktiv.dataset && aktiv.dataset.v;
    const y = window.scrollY;
    tegn({ animer: false });
    window.scrollTo(0, y);
    let ny = fokusId ? document.getElementById(fokusId) : null;
    if (!ny && fokusH) ny = $(`#skjerm [data-h="${CSS.escape(fokusH)}"]${fokusV != null ? `[data-v="${CSS.escape(fokusV)}"]` : ""}`);
    if (ny && ny !== document.body) {
      try {
        ny.focus({ preventScroll: true });
      } catch (e) {
        /* ignore */
      }
    }
    R.lagre();
  };

  async function tilbake() {
    if (R.arkApent()) {
      R.lukkArk();
      return;
    }
    const sk = skjermDef(S.skjerm);
    let mal = sk.tilbake;
    if (typeof mal === "function") mal = await mal(S);
    if (mal === undefined) mal = APP.hjem || "hjem";
    if (mal === null) return;
    if (mal === "portal") {
      if (S.skjerm === "alder") location.replace("/"); // never back into the 18+ gate
      else location.href = "/";
      return;
    }
    R.gaTil(mal);
  }
  R.tilbake = tilbake;

  // Android back button: one history entry while away from the game's home screen.
  let harHistorikk = false;
  let ignorerPop = false;
  function sikreHistorikk() {
    if (!APP) return;
    // The 18+ gate counts as home: an extra entry there made the back button bounce between the
    // front page and the gate forever.
    const hjem = S.skjerm === (APP.hjem || "hjem") || S.skjerm === "alder";
    if (!hjem && !harHistorikk && !R.iRamme) {
      try {
        history.pushState({ rusj: 1 }, "");
        harHistorikk = true;
      } catch (e) {
        /* ignore */
      }
    }
  }
  window.addEventListener("popstate", () => {
    if (ignorerPop) {
      ignorerPop = false;
      return;
    }
    if (location.hash) return; // a join link (#code) changed the address: hashchange handles it
    if (!harHistorikk) return;
    harHistorikk = false;
    if (S && S.skjerm !== (APP.hjem || "hjem")) {
      const p = tilbake();
      // Re-arm at once: if tilbake waits for a confirm sheet, the next back press must close the
      // sheet, not leave the game.
      sikreHistorikk();
      Promise.resolve(p).then(sikreHistorikk);
    }
  });

  R.visRegler = () => {
    const r = APP.regler;
    if (!r) return;
    R.ark(`
      <h2 id="ark-tittel">Slik spiller du ${esc(APP.navn)}</h2>
      ${r.intro ? `<p class="ingress">${esc(r.intro)}</p>` : ""}
      ${r.steg ? `<ol class="steg">${r.steg.map(([t, x]) => `<li><b>${esc(t)}</b><span>${esc(x)}</span></li>`).join("")}</ol>` : ""}
      ${r.tips && r.tips.length ? `<h3>Tips</h3><ul class="tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${r.ekstraHtml || ""}
      <p class="personvern">Alt skjer på denne mobilen. Ingen konto, ingen reklame, og ingenting sendes noe sted.</p>
      <button class="knapp" data-h="lukk-ark">Skjønner!</button>`);
  };

  // Built-in actions (a game may override any of them).
  const INNEBYGD = {
    tilbake: () => tilbake(),
    lyd: () => {
      R.felles.lyd = !R.felles.lyd;
      R.lagreFelles();
      oppdaterTopp();
      if (R.felles.lyd) R.lyd.klikk();
    },
    regler: () => R.visRegler(),
    "lukk-ark": () => R.lukkArk(),
    "installer-app": () => R._installer(),
    // The 18+ gate in front of drinking games (spill.json "alder18": true)
    "alder-ja": () => {
      R.lagreFelles({ over18: true });
      R.statistikk("alder18");
      R.gaTil(APP.hjem || "hjem");
    },
    "alder-nei": () => {
      // Replace, so «back» on the front page doesn't return to the gate.
      location.replace("/");
    },
    "ark-svar": (el) => {
      const svar = arkSvar;
      arkSvar = null;
      R.lukkArk();
      if (svar) svar(el.dataset.v === "ja" ? true : el.dataset.v === "nei" ? false : el.dataset.v);
    },
    // <button data-h="timer-veksle" data-v="timer" data-timer-pause>Pause</button>
    "timer-veksle": (el) => {
      const t = R.timer(el.dataset.v);
      if (t) t.veksle();
    },
    // <button data-h="timer-pluss" data-v="timer">+30 s</button>  (data-sek to change the 30)
    "timer-pluss": (el) => {
      const t = R.timer(el.dataset.v);
      if (t) t.leggTil(Number(el.dataset.sek) || 30);
    },
    "spiller-legg-til": () => {
      const boks = $("#spillerboks");
      const max = Number(boks && boks.dataset.max) || 10;
      if ((S.antall || 0) >= max) return;
      S.antall = (S.antall || 0) + 1;
      if (APP.vedSpillere) APP.vedSpillere(S);
      R.vis();
      const ny = $(`#navn-${S.antall - 1}`);
      if (ny) ny.focus();
    },
    "spiller-fjern": (el) => {
      const boks = $("#spillerboks");
      const min = Number(boks && boks.dataset.min) || 2;
      if ((S.antall || 0) <= min) return;
      const i = Number(el.dataset.v);
      R.felles.navn.splice(i, 1);
      R.lagreFelles();
      S.antall -= 1;
      if (APP.vedSpillere) APP.vedSpillere(S, { fjernet: i });
      R.vis();
    },
  };

  function handling(navn) {
    return (APP.handlinger && APP.handlinger[navn]) || INNEBYGD[navn];
  }

  // ---------- Hold-to-reveal ----------

  let apenMappe = null;
  let apnetTid = 0;
  function apneMappe(m) {
    if (apenMappe || !APP.hemmelig) return;
    const id = m.dataset.mappe;
    const kort = APP.hemmelig.innhold(S, id) || {};
    const bak = m.querySelector(".mappe-bakside");
    bak.className = "mappe-bakside" + (kort.klasse ? " " + kort.klasse : "");
    bak.innerHTML = kort.html || "";
    m.classList.add("apen");
    apenMappe = m;
    apnetTid = performance.now();
    R.lyd.snu();
    R.vibrer(15);
  }
  function lukkMappe(stille) {
    const m = apenMappe;
    if (!m) return;
    apenMappe = null;
    m.classList.remove("apen");
    const holdt = performance.now() - apnetTid;
    setTimeout(() => {
      if (!m.classList.contains("apen")) {
        const bak = m.querySelector(".mappe-bakside");
        if (bak) {
          bak.innerHTML = "";
          bak.className = "mappe-bakside";
        }
      }
    }, 450);
    if (stille) return;
    if (holdt < 350) {
      R.toast("Hold litt lenger for å lese");
      return;
    }
    if (APP.hemmelig && APP.hemmelig.sett) APP.hemmelig.sett(S, m.dataset.mappe, m);
  }

  // ---------- Swipe cards ----------

  let sveip = null;
  function sveipStart(e, kort) {
    sveip = { kort, x: e.clientX, y: e.clientY, dx: 0, aktiv: false, id: e.pointerId };
  }
  function sveipFlytt(e) {
    if (!sveip || e.pointerId !== sveip.id) return;
    const dx = e.clientX - sveip.x;
    const dy = e.clientY - sveip.y;
    if (!sveip.aktiv) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) {
        if (Math.abs(dy) > 14) sveip = null;
        return;
      }
      sveip.aktiv = true;
      sveip.kort.classList.add("drar");
      try {
        sveip.kort.setPointerCapture(e.pointerId);
      } catch (feil) {
        /* ignore */
      }
    }
    sveip.dx = dx;
    sveip.kort.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
  }
  function sveipSlutt(e) {
    if (!sveip || (e && e.pointerId !== sveip.id)) return;
    const s = sveip;
    sveip = null;
    if (!s.aktiv) return;
    s.kort.classList.remove("drar");
    if (Math.abs(s.dx) > 90) {
      const retning = s.dx > 0 ? 1 : -1;
      s.kort.style.transform = "";
      s.kort.style.setProperty("--ut", retning * 130 + "%");
      s.kort.style.setProperty("--ut-rot", retning * 14 + "deg");
      s.kort.classList.add("ut");
      R.lyd.sveip();
      s.kort.dataset.retning = retning > 0 ? "hoyre" : "venstre";
      const h = handling(s.kort.dataset.sveip);
      setTimeout(() => h && h(s.kort, null, S), 200);
    } else {
      s.kort.style.transform = "";
    }
  }
  // Fly the current card out (used by "Next" buttons, so tapping looks like swiping).
  R.kastKort = (retning) =>
    new Promise((resolve) => {
      const kort = $("#skjerm .storkort");
      if (!kort || R.rolig()) return resolve();
      const r = retning || -1;
      kort.style.setProperty("--ut", r * 130 + "%");
      kort.style.setProperty("--ut-rot", r * 14 + "deg");
      kort.classList.add("ut");
      R.lyd.sveip();
      setTimeout(resolve, 200);
    });

  // ---------- Start ----------

  R.start = (def) => {
    if (APP) throw new Error("Rusj.start kan bare kalles én gang");
    APP = def;
    APP.navn = APP.navn || meta().navn;
    APP.undertittel = APP.undertittel || meta().undertittel;
    APP.id = APP.id || meta().id;
    NOKKEL = APP.id + ".v" + (APP.versjon || 1);
    S = Object.assign({ skjerm: null }, def.tilstand ? def.tilstand() : {});
    const lagret = R.les(NOKKEL, null);
    if (lagret && typeof lagret === "object") Object.assign(S, lagret);
    R.S = S;
    R.app = APP;
    if (APP.lastet) {
      try {
        APP.lastet(S);
      } catch (e) {
        console.error(e);
        S = Object.assign({ skjerm: null }, def.tilstand ? def.tilstand() : {});
        R.S = S;
      }
    }

    document.documentElement.lang = "nb";

    // A double tap must not run the same async action twice (skip two cards, start two countdowns).
    // The same action is ignored while it is still running, for at most 0.6 s; other actions and
    // sheets are never blocked.
    let opptatt = null;
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-h]");
      if (!el || el.disabled) return;
      const navn = el.dataset.h;
      const h = handling(navn);
      if (!h) return;
      const iArk = !!el.closest("#ark");
      if (!iArk && opptatt === navn) return;
      // Ghost-tap guard: the second tap of a double tap lands on whatever button the NEW screen
      // has in the same spot (e.g. the next player's secret). Real taps within 350 ms of a
      // screen change are ignored. (Scripted clicks in tests are not "trusted" and pass.)
      if (!iArk && e.isTrusted && performance.now() - sisteSkjermbytte < 350) return;
      // Same after an in-place redraw (R.vis): a different button may now sit under the finger —
      // but only where the finger just was. Repeating the same action stays quick (steppers,
      // flipping cards), and a deliberate tap elsewhere (a square, then «Fyr!») always counts.
      const naer = sisteKlikkPos && e.detail > 0 && Math.hypot(e.clientX - sisteKlikkPos.x, e.clientY - sisteKlikkPos.y) < 40;
      if (!iArk && e.isTrusted && performance.now() - sisteOmtegning < 350 && navn !== sisteKlikk && naer) return;
      sisteKlikk = navn;
      sisteKlikkPos = e.detail > 0 ? { x: e.clientX, y: e.clientY } : null;
      if (!el.hasAttribute("data-stille")) R.lyd.klikk();
      const svar = h(el, e, S);
      if (svar && typeof svar.then === "function" && !iArk) {
        opptatt = navn;
        const slipp = () => {
          if (opptatt === navn) opptatt = null;
        };
        setTimeout(slipp, 600);
        svar.then(slipp, (feil) => {
          slipp();
          console.error(feil);
        });
      }
    });
    document.addEventListener("click", (e) => {
      if (e.target.id === "ark") R.lukkArk();
    });
    document.addEventListener("input", (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.navn != null) {
        const i = Number(el.dataset.navn);
        while (R.felles.navn.length < i) R.felles.navn.push("");
        R.felles.navn[i] = el.value.slice(0, 16);
        R.lagreFelles();
        const fjern = el.parentElement && el.parentElement.querySelector(".fjern");
        if (fjern) fjern.setAttribute("aria-label", "Fjern " + R.navn(i));
      }
      if (el.dataset && el.dataset.felt && APP.felt && APP.felt[el.dataset.felt]) APP.felt[el.dataset.felt](S, el, e);
    });
    document.addEventListener("keydown", (e) => {
      const el = e.target;
      if (e.key === "Enter" && el.dataset && el.dataset.navn != null) {
        e.preventDefault();
        const neste = $(`#navn-${Number(el.dataset.navn) + 1}`);
        if (neste) neste.focus();
        else el.blur();
      }
      if (e.key === "Escape" && R.arkApent()) R.lukkArk();
      if ((e.key === " " || e.key === "Enter") && el.classList && el.classList.contains("mappe")) {
        e.preventDefault();
        if (!e.repeat) apneMappe(el);
      }
    });
    document.addEventListener("keyup", (e) => {
      if ((e.key === " " || e.key === "Enter") && apenMappe) {
        e.preventDefault();
        lukkMappe();
      }
    });
    document.addEventListener("submit", (e) => {
      const f = e.target;
      e.preventDefault();
      if (f.dataset && f.dataset.skjema && APP.skjema && APP.skjema[f.dataset.skjema]) APP.skjema[f.dataset.skjema](S, f, e);
    });

    document.addEventListener("pointerdown", (e) => {
      R.lyd.lasOpp();
      const m = e.target.closest(".mappe");
      if (m) {
        e.preventDefault();
        try {
          m.setPointerCapture(e.pointerId);
        } catch (feil) {
          /* not all pointers can be captured */
        }
        apneMappe(m);
        return;
      }
      const kort = e.target.closest(".storkort[data-sveip]");
      if (kort && !e.target.closest("button, a, input")) sveipStart(e, kort);
    });
    document.addEventListener("pointermove", sveipFlytt);
    ["pointerup", "pointercancel"].forEach((t) =>
      document.addEventListener(t, (e) => {
        lukkMappe();
        sveipSlutt(e);
      }),
    );
    window.addEventListener("blur", () => lukkMappe());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) lukkMappe();
      else if (vilVaere) R.holdVaken();
    });
    document.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".mappe, .storkort")) e.preventDefault();
    });

    // Drinking games: confirm age first (once per phone). The gate is a built-in screen.
    if (meta().alder18) {
      APP.skjermer.alder = {
        tittel: "18+",
        tilbake: "portal",
        gjenoppta: false,
        vis: () => `
          <div class="spillhjem">
            ${R.figur()}
            <h1 id="skjerm-tittel">Er du over 18?</h1>
            <span class="undertittel">Drikkespill · 18+</span>
            <p class="slagord">${esc(APP.navn)} er et drikkespill for voksne. Du må være over 18 år for å spille.</p>
          </div>
          <div class="papirboks alder-boks">
            <p class="etikett">Drikk med vett</p>
            <ul class="tips">
              <li>Alkoholfritt teller like mye – vann, brus og alkoholfritt er alltid lov.</li>
              <li>Ta små slurker. Ingen skal presses, og alle kan stå over.</li>
              <li>Spis, drikk vann, og sørg for trygg vei hjem.</li>
            </ul>
          </div>
          ${R.ui.dokk(R.ui.knapp("Ja, jeg er over 18", "alder-ja"), R.ui.lenkerad(R.ui.lenke("Nei, ta meg tilbake", "alder-nei")))}`,
      };
    }

    // First screen: a join link (#code), the screen we were on (if recent), or home.
    let forste = APP.hjem || "hjem";
    const hash = (location.hash || "").slice(1);
    let fraHash = null;
    // Join links are codes (or a short list of names); anything huge or malformed is cut or ignored.
    const lesHash = (h) => {
      try {
        return decodeURIComponent(h).slice(0, 2000);
      } catch (e) {
        return "";
      }
    };
    // After a reload on a game screen our history entry is still there — don't add another.
    try {
      harHistorikk = !!(history.state && history.state.rusj);
    } catch (e) {
      harHistorikk = false;
    }
    if (hash && APP.vedHash) {
      try {
        fraHash = APP.vedHash(S, lesHash(hash));
      } catch (e) {
        fraHash = null;
      }
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {
        /* ignore */
      }
    }
    const nylig = S._tid && Date.now() - S._tid < 3 * 60 * 60 * 1000;
    const forrige = S.skjerm && APP.skjermer[S.skjerm];
    if (fraHash && APP.skjermer[fraHash]) forste = fraHash;
    // gjenoppta: "skjerm" redirects (e.g. away from a screen that shows a secret); older than
    // 3 hours, every game starts on its home screen (with «Fortsett» there).
    else if (nylig && forrige && typeof forrige.gjenoppta === "string" && APP.skjermer[forrige.gjenoppta]) forste = forrige.gjenoppta;
    else if (nylig && forrige && forrige.gjenoppta !== false && typeof forrige.gjenoppta !== "string") forste = S.skjerm;
    if (meta().alder18 && !R.felles.over18) forste = "alder"; // the age gate comes before everything
    S.skjerm = null;
    R.statistikk("visning");
    try {
      R.gaTil(forste);
    } catch (e) {
      // A saved screen that can't be drawn any more (old or broken state): start from home.
      console.warn("rusj: kunne ikke gjenoppta", forste, e);
      S.skjerm = null;
      R.gaTil(APP.hjem || "hjem");
    }

    window.addEventListener("hashchange", () => {
      const h = (location.hash || "").slice(1);
      if (!h || !APP.vedHash) return;
      let sk = null;
      try {
        sk = APP.vedHash(S, lesHash(h));
      } catch (e) {
        sk = null;
      }
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {
        /* ignore */
      }
      if (sk && APP.skjermer[sk]) R.gaTil(sk);
    });

    if ("serviceWorker" in navigator && location.protocol === "https:" && !R.iRamme) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  };
})();
