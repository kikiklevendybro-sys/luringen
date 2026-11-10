/* Luringen – user interface.
   Depends on window.LURINGEN_DATA (word list), LuringenKjerne (game core) and LuringenQr. */
(function () {
  "use strict";

  const K = window.LuringenKjerne;
  const Q = window.LuringenQr;
  const DATA = window.LURINGEN_DATA;
  const NETTSIDE = !!window.LURINGEN_WEB;

  document.documentElement.lang = "nb";

  // ---------- Helpers ----------

  const $ = (sel, rot) => (rot || document).querySelector(sel);
  const $$ = (sel, rot) => Array.from((rot || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tall = (n) => n.toLocaleString("nb-NO");
  const vent = (ms) => new Promise((r) => setTimeout(r, ms));
  const rolig = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const iRamme = (() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();
  const kanDeleLenke = !iRamme && /^https?:$/.test(location.protocol);
  const KODE_I_ADRESSE = /^#([0-9A-Za-z]{8}|[0-9A-Za-z]{15})$/;

  const DYR = ["🦊", "🐸", "🐼", "🐙", "🦄", "🐯", "🐧", "🦉", "🐢", "🐳"];
  const ANTALL_ORD = DATA.kategorier.reduce((sum, k) => sum + k.ord.length, 0);
  const NIVA_TEKST = [
    { navn: "Lett", kort: "Luringen får kategori og et hint." },
    { navn: "Middels", kort: "Luringen får bare kategorien." },
    { navn: "Vanskelig", kort: "Luringen får ingenting. Vanskeligere ord." },
    { navn: "Kaos", kort: "Luringen får et nesten-likt ord – og vet ikke at hen er luringen." },
  ];
  const TIDER = [0, 120, 180, 300];

  // ---------- Storage (this device only) ----------

  const LAGRING = "luringen.v1";
  function lesLagret() {
    try {
      return JSON.parse(localStorage.getItem(LAGRING) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function lagre() {
    try {
      localStorage.setItem(
        LAGRING,
        JSON.stringify({
          navn: S.navn,
          oppsett: S.oppsett,
          lyd: S.lyd,
          nylige: S.nylige.slice(-400),
          spill: S.spill,
          gjest: S.gjest,
          laste: S.laste,
          _tid: Date.now(), // lets the front page drop «Fortsett» for a game left long ago
        }),
      );
    } catch (e) {
      /* storage can be blocked; the game works without it */
    }
  }

  // ---------- State ----------

  const S = {
    skjerm: "hjem",
    navn: new Array(10).fill(""),
    oppsett: { modus: "en", spillere: 5, luringer: 1, niva: 1, kategorier: null, tid: 180 },
    lyd: true,
    nylige: [],
    spill: null,
    gjest: null,
    // Seats a guest has seen a card for, per game code: the seat can't be changed afterwards,
    // also not by leaving and joining again with the same code.
    laste: {},
    reglerFra: "hjem",
    velgKategorier: false,
  };

  function gyldigeKategorier(liste) {
    if (!Array.isArray(liste)) return null;
    const ider = new Set(DATA.kategorier.map((k) => k.id));
    const ok = liste.filter((id) => ider.has(id));
    return ok.length ? ok : null;
  }

  function hentTilstand(lagret) {
    if (!lagret || typeof lagret !== "object") return;
    if (Array.isArray(lagret.navn)) for (let i = 0; i < 10; i++) S.navn[i] = String(lagret.navn[i] || "").slice(0, 16);
    if (lagret.oppsett && typeof lagret.oppsett === "object") {
      const o = lagret.oppsett;
      S.oppsett.modus = o.modus === "hver" ? "hver" : "en";
      S.oppsett.spillere = Math.min(K.MAKS_SPILLERE, Math.max(K.MIN_SPILLERE, Number(o.spillere) || 5));
      S.oppsett.niva = [0, 1, 2, 3].includes(o.niva) ? o.niva : 1;
      S.oppsett.luringer = Math.min(K.maksLuringer(S.oppsett.spillere), Math.max(1, Number(o.luringer) || 1));
      S.oppsett.kategorier = gyldigeKategorier(o.kategorier);
      S.oppsett.tid = TIDER.includes(o.tid) ? o.tid : 180;
    }
    S.lyd = lagret.lyd !== false;
    S.nylige = Array.isArray(lagret.nylige) ? lagret.nylige.slice(-400) : [];
    // A saved game is only restored if it still matches the current word list.
    if (lagret.spill && lagret.spill.datahash === DATA.hash && lagret.spill.r) S.spill = lagret.spill;
    if (lagret.gjest && lagret.gjest.datahash === DATA.hash) S.gjest = lagret.gjest;
    if (lagret.laste && typeof lagret.laste === "object") {
      for (const [k, v] of Object.entries(lagret.laste).slice(-30)) if (Number.isInteger(v)) S.laste[k] = v;
    }
    if (lagret.skjerm && SKJERMER[lagret.skjerm]) S.skjerm = lagret.skjerm;
  }

  const navn = (i) => (S.navn[i] || "").trim() || `Spiller ${i + 1}`;
  const plassNavn = (i) => `Plass ${i + 1}`;

  // ---------- Sound (synthesised, no files) ----------

  const Lyd = (() => {
    let ctx = null;
    let hoved = null;
    function sikre() {
      if (!S.lyd) return null;
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
    function stoy(start, varighet, styrke, filterFrekvens) {
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
      f.type = "bandpass";
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
      klikk: () => tone(720, 0, 0.06, "triangle", 0.12),
      snu: () => {
        tone(300, 0, 0.14, "triangle", 0.16, 620);
        stoy(0, 0.08, 0.08, 3000);
      },
      tikk: () => tone(880, 0, 0.12, "square", 0.09),
      pek: () => {
        tone(196, 0, 0.35, "sawtooth", 0.18, 392);
        stoy(0, 0.25, 0.25, 900);
      },
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
    };
  })();

  function vibrer(monster) {
    try {
      if (S.lyd && navigator.vibrate) navigator.vibrate(monster);
    } catch (e) {
      /* not supported */
    }
  }

  // Keep the screen awake while a game is running.
  let vekkLas = null;
  async function holdVaken() {
    try {
      if ("wakeLock" in navigator && !vekkLas && document.visibilityState === "visible") {
        vekkLas = await navigator.wakeLock.request("screen");
        vekkLas.addEventListener("release", () => {
          vekkLas = null;
        });
      }
    } catch (e) {
      vekkLas = null;
    }
  }

  // ---------- Graphics ----------

  function logoSvg() {
    const bokstaver = [
      ["M0 0V56H34", 34],
      ["M0 0V37A19 19 0 0 0 38 37V0", 38],
      ["M0 56V0H18A14 14 0 0 1 18 28H0M16 28L36 56", 36],
      ["M0 0V56", 0],
      ["M0 56V0L34 56V0", 34],
      ["M34 8A20 28 0 1 0 40 28H22", 40],
      ["M34 0H0V56H34M0 28H28", 34],
      ["M0 56V0L34 56V0", 34],
    ];
    let x = 0;
    let stier = "";
    for (const [d, bredde] of bokstaver) {
      stier += `<path transform="translate(${x} 0)" d="${d}"/>`;
      x += bredde + 22;
    }
    const b = x - 22;
    return `<svg class="logo-svg" viewBox="-9 -9 ${b + 24} 82" aria-hidden="true" focusable="false"><g class="logo-bak" transform="translate(5 7)">${stier}</g><g class="logo-for">${stier}</g></svg>`;
  }

  function maskotSvg(type) {
    type = type || "lur";
    const munn =
      type === "glad"
        ? '<path d="M42 95 Q60 116 78 95 Q60 104 42 95Z" class="m-blekk"/>'
        : type === "tatt"
          ? '<ellipse cx="60" cy="101" rx="7" ry="6.5" class="m-blekk"/>'
          : '<path d="M57 99 Q69 104 79 95" class="m-strek" stroke-width="4.5"/>';
    const svette = type === "tatt" ? '<path d="M101 34 q8 12 0 17 q-8 -5 0 -17z" class="m-svette"/>' : "";
    const pupiller =
      type === "tatt"
        ? '<circle cx="40" cy="54" r="4" class="m-blekk"/><circle cx="80" cy="54" r="4" class="m-blekk"/>'
        : '<circle cx="44" cy="56" r="5.5" class="m-blekk"/><circle cx="84" cy="56" r="5.5" class="m-blekk"/>';
    const brynV = type === "tatt" ? "M25 30 Q38 22 53 30" : "M24 32 Q37 18 53 29";
    const brynH = type === "tatt" ? "M67 30 Q82 22 95 30" : "M67 36 Q80 31 96 36";
    return `<svg class="maskot maskot-${type}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle cx="60" cy="64" r="48" class="m-hode"/>
      <circle cx="40" cy="54" r="12.5" class="m-hvit"/><circle cx="80" cy="54" r="12.5" class="m-hvit"/>
      <g class="m-pupiller">${pupiller}</g>
      <circle cx="40" cy="54" r="15" class="m-strek" stroke-width="6"/><circle cx="80" cy="54" r="15" class="m-strek" stroke-width="6"/>
      <path d="M55 52 Q60 47 65 52" class="m-strek" stroke-width="5"/>
      <path d="${brynV}" class="m-strek" stroke-width="7"/><path d="${brynH}" class="m-strek" stroke-width="7"/>
      <ellipse cx="60" cy="74" rx="11" ry="9" class="m-nese"/>
      <path d="M60 82 C53 78 42 79 36 86 C32 90 26 90 23 86 C25 96 41 99 51 91 C55 88 58 87 60 87 C62 87 65 88 69 91 C79 99 95 96 97 86 C94 90 88 90 84 86 C78 79 67 78 60 82 Z" class="m-blekk"/>
      ${munn}${svette}
    </svg>`;
  }

  const FINGER =
    '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M13 40c-2-4-3-9-3-14 0-8 6-14 14-14s14 6 14 14c0 3-1 5-2 7"/><path d="M18.5 42c-2-5-3-10-3-16 0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5c0 6-2 11-4.5 15"/><path d="M24 26c0 6-1.2 11.5-4 17"/><path d="M29 28.5c0 5-1 9-3 13"/><path d="M9.5 17.5C12.5 11 17.8 7.5 24 7.5c5 0 9.4 2 12.4 5.4"/><path d="M38.6 17c1 2.5 1.6 5.4 1.6 9"/></svg>';

  const ETT_TELEFON =
    '<svg viewBox="0 0 44 30" aria-hidden="true"><rect x="15" y="2" width="14" height="26" rx="3"/><path d="M4 15h6M34 15h6M7 12l3 3-3 3M37 12l3 3-3 3"/></svg>';
  const MANGE_TELEFONER =
    '<svg viewBox="0 0 44 30" aria-hidden="true"><rect x="2" y="6" width="11" height="20" rx="2.5"/><rect x="16.5" y="2" width="11" height="20" rx="2.5"/><rect x="31" y="6" width="11" height="20" rx="2.5"/></svg>';

  const avatar = (i, storrelse) =>
    `<span class="avatar ${storrelse || ""}" style="--pf: var(--p${i + 1})" aria-hidden="true">${DYR[i]}</span>`;

  function lengdeKlasse(ord) {
    const lengste = Math.max(...String(ord).split(/\s+/).map((d) => d.length));
    if (lengste > 13 || ord.length > 20) return "ekstra-lang";
    if (lengste > 9 || ord.length > 14) return "lang";
    return "";
  }

  // ---------- Navigation ----------

  const TITLER = {
    hjem: "",
    oppsett: "Nytt spill",
    del: "Send mobilen rundt",
    kode: "Hver sin mobil",
    diskusjon: "Snakk sammen",
    pek: "Avstemning",
    avslor: "Avsløring",
    resultat: "Resultat",
    "bli-med": "Bli med",
    plass: "Velg plass",
    gjest: "Ditt kort",
    regler: "Slik spiller du",
  };
  const SPILLSKJERMER = ["del", "kode", "diskusjon", "pek", "avslor", "resultat"];

  let avslorNummer = 0;

  function gaTil(navnet) {
    stoppTimer();
    avslorNummer++;
    lukkArk();
    S.skjerm = navnet;
    if (S.spill && SPILLSKJERMER.includes(navnet)) S.spill.skjerm = navnet;
    // Only the visible screen keeps its markup, so ids are never duplicated in hidden screens.
    $$(".skjerm").forEach((el) => {
      const synlig = el.id === "s-" + navnet;
      el.hidden = !synlig;
      if (!synlig) el.innerHTML = "";
    });
    SKJERMER[navnet]();
    oppdaterTopp();
    window.scrollTo(0, 0);
    const h = $(`#s-${navnet} h1`);
    if (h) {
      h.setAttribute("tabindex", "-1");
      try {
        h.focus({ preventScroll: true });
      } catch (e) {
        h.focus();
      }
    }
    lagre();
  }

  function oppdaterTopp() {
    const hjem = S.skjerm === "hjem";
    $("#tilbake").hidden = hjem;
    // On rusj.no the home screen gets the same "‹ rusj" button as every other game.
    const portal = $("#tilportal");
    if (portal) portal.hidden = !(NETTSIDE && hjem);
    $("#topp-tittel").textContent = TITLER[S.skjerm] || "";
    $("#lydknapp").setAttribute("aria-pressed", S.lyd ? "true" : "false");
    $("#lydknapp").setAttribute("aria-label", S.lyd ? "Skru av lyd" : "Skru på lyd");
  }

  function tilbake() {
    const s = S.skjerm;
    if (s === "regler") return gaTil(S.reglerFra && S.reglerFra !== "regler" ? S.reglerFra : "hjem");
    if (s === "plass") return gaTil("bli-med");
    if (s === "gjest") return gaTil(S.gjest && S.gjest.sett ? "hjem" : "plass");
    if (s === "del" || s === "kode" || s === "diskusjon" || s === "pek" || s === "avslor" || s === "resultat") return gaTil("hjem");
    return gaTil("hjem");
  }

  // ---------- Screens ----------

  function visHjem() {
    const pagaende = S.spill
      ? `<button class="knapp-2" data-h="fortsett">Fortsett spillet · runde ${S.spill.runde}</button>
         <button class="lenke" data-h="avslutt-spill">Avslutt spillet og start på nytt</button>`
      : S.gjest && S.gjest.plass != null
        ? `<button class="knapp-2" data-h="fortsett-gjest">Tilbake til kortet ditt</button>`
        : "";
    $("#s-hjem").innerHTML = `
      <div class="hjem-scene">
        <div class="maskot-stor">${maskotSvg()}</div>
        <h1 class="logo" id="t-hjem"><span class="vh">Luringen</span>${logoSvg()}</h1>
        <p class="slagord">Alle får det hemmelige ordet.<br><em>Nesten alle.</em></p>
      </div>
      <div class="hjem-knapper">
        <button class="knapp" data-h="nytt">Start spill</button>
        ${pagaende}
        <button class="knapp-2" data-h="bli-med">Bli med i et spill</button>
        <button class="lenke" data-h="regler">Slik spiller du</button>
        ${NETTSIDE ? '<a class="lenke" href="/">Flere festspill på rusj.no</a>' : ""}
      </div>
      <ul class="merker" aria-label="Om spillet">
        <li><b>3–10</b> spillere</li>
        <li><b>${tall(ANTALL_ORD)}</b> norske ord</li>
        <li><b>${DATA.kategorier.length}</b> kategorier</li>
        <li><b>0</b> reklame</li>
      </ul>`;
  }

  function visOppsett() {
    const o = S.oppsett;
    const maks = K.maksLuringer(o.spillere);
    if (o.luringer > maks) o.luringer = maks;
    const alle = K.erAlleKategorier(DATA, o.kategorier);
    const valgt = new Set(alle ? [] : o.kategorier);
    const antall = K.antallOrd(DATA, o.kategorier, o.niva);
    const velgSelv = S.velgKategorier || !alle;

    const spillere = Array.from({ length: o.spillere }, (_, i) => `
      <label class="spiller">${avatar(i)}<span class="vh">Navn på spiller ${i + 1}</span>
        <input id="navn-${i}" data-navn="${i}" value="${esc(S.navn[i])}" placeholder="Spiller ${i + 1}" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="next" spellcheck="false">
      </label>`).join("");

    const nivaer = NIVA_TEKST.map((n, i) => `
      <button class="flis niva-${i}" data-h="niva" data-v="${i}" aria-pressed="${o.niva === i}">
        <span class="pips" aria-hidden="true">${[0, 1, 2, 3].map((p) => `<i class="${p <= i ? "pa" : ""}"></i>`).join("")}</span>
        <b>${n.navn}</b><span>${n.kort}</span>
      </button>`).join("");

    const kategorier = DATA.kategorier.map((k) => `
      <button class="brikke" data-h="kat" data-id="${k.id}" aria-pressed="${valgt.has(k.id)}"><span aria-hidden="true">${k.ikon}</span>${esc(k.navn)}</button>`).join("");

    $("#s-oppsett").innerHTML = `
      <h1>Nytt spill</h1>
      <div class="seksjon">
        <h2 class="etikett">Hvordan spiller dere?</h2>
        <div class="modusvalg">
          <button class="modus" data-h="modus" data-v="en" aria-pressed="${o.modus === "en"}">${ETT_TELEFON}<b>Én mobil</b><span>Send den rundt bordet</span></button>
          <button class="modus" data-h="modus" data-v="hver" aria-pressed="${o.modus === "hver"}">${MANGE_TELEFONER}<b>Hver sin mobil</b><span>Bli med med en kode</span></button>
        </div>
      </div>
      <div class="seksjon">
        <h2 class="etikett">Spillere</h2>
        <div class="teller">
          <button data-h="spillere" data-d="-1" aria-label="Færre spillere" ${o.spillere <= K.MIN_SPILLERE ? "disabled" : ""}>−</button>
          <output aria-live="polite">${o.spillere} <small>spillere</small></output>
          <button data-h="spillere" data-d="1" aria-label="Flere spillere" ${o.spillere >= K.MAKS_SPILLERE ? "disabled" : ""}>+</button>
        </div>
        <div class="spillere">${spillere}</div>
        <p class="hjelp">Skriv navn hvis dere vil – ellers heter dere Spiller 1, 2, 3 …</p>
      </div>
      <div class="seksjon">
        <h2 class="etikett">Nivå</h2>
        <div class="nivaer">${nivaer}</div>
      </div>
      <div class="seksjon">
        <div class="seksjon-hode"><h2 class="etikett">Kategorier</h2><span class="tall">${tall(antall)} ord i potten</span></div>
        <div class="seg" role="group" aria-label="Kategorier">
          <button data-h="kat-alle" aria-pressed="${!velgSelv}">Alle ${DATA.kategorier.length}</button>
          <button data-h="kat-velg" aria-pressed="${velgSelv}">Velg selv${alle ? "" : ` (${valgt.size})`}</button>
        </div>
        ${velgSelv ? `<div class="kategorier">${kategorier}</div>${alle ? '<p class="hjelp">Trykk på kategoriene dere vil ha med.</p>' : ""}` : ""}
      </div>
      <div class="seksjon">
        <h2 class="etikett">Antall luringer</h2>
        <div class="seg" role="group" aria-label="Antall luringer">
          ${[1, 2, 3].map((n) => `<button data-h="luringer" data-v="${n}" aria-pressed="${o.luringer === n}" ${n > maks ? "disabled" : ""}>${n}</button>`).join("")}
        </div>
        ${maks < 3 ? `<p class="hjelp">${maks === 1 ? "6 spillere eller flere gir mulighet for 2 luringer." : "9 spillere eller flere gir mulighet for 3 luringer."}</p>` : ""}
      </div>
      <div class="seksjon">
        <h2 class="etikett">Tid til å diskutere</h2>
        <div class="seg" role="group" aria-label="Tid til å diskutere">
          ${TIDER.map((t) => `<button data-h="tid" data-v="${t}" aria-pressed="${o.tid === t}">${t === 0 ? "Av" : t / 60 + " min"}</button>`).join("")}
        </div>
      </div>
      <div class="dokk">
        <button class="knapp" data-h="start">${o.modus === "hver" ? "Lag kode og start" : "Start runde"}</button>
      </div>`;
  }

  function oppfriskOppsett() {
    const y = window.scrollY;
    visOppsett();
    window.scrollTo(0, y);
    lagre();
  }

  function mappeHtml(plass) {
    const sak = String(((S.spill && S.spill.oppsett.seed) || (S.gjest && S.gjest.oppsett.seed) || 0) % 9000 + 1000);
    return `
      <button class="mappe" data-mappe="${plass}" aria-describedby="mappe-hjelp" aria-label="Hold inne for å se kortet ditt">
        <span class="mappe-indre">
          <span class="mappe-forside" aria-hidden="true">
            <span class="mappe-fane">Sak ${sak}</span>
            <span class="mappe-stempel">Hemmelig</span>
            <span class="sladd" style="--b: 74%"></span>
            <span class="sladd" style="--b: 56%"></span>
            <span class="sladd" style="--b: 88%"></span>
            <span class="sladd" style="--b: 40%"></span>
            <span class="mappe-finger">${FINGER}<span>Hold inne</span></span>
          </span>
          <span class="mappe-bakside"></span>
        </span>
      </button>`;
  }

  function kortHtml(kort) {
    if (kort.type === "ord") {
      return `
        <span class="kort-etikett">Det hemmelige ordet er</span>
        <span class="kort-ord ${lengdeKlasse(kort.ord)}" lang="nb">${esc(kort.ord)}</span>
        <span class="kort-kat">${kort.kategori.ikon} ${esc(kort.kategori.navn)}</span>
        <span class="kort-fot">Ikke si ordet høyt!</span>`;
    }
    const linjer = [];
    if (kort.kategori) linjer.push(`<span class="kort-linje"><b>Kategori</b>${kort.kategori.ikon} ${esc(kort.kategori.navn)}</span>`);
    if (kort.hint) linjer.push(`<span class="kort-linje"><b>Hint</b>${esc(kort.hint)}</span>`);
    if (!kort.kategori) linjer.push('<span class="kort-linje">Ingen hint denne gangen</span>');
    return `
      <span class="kort-etikett">Du er</span>
      <span class="kort-luring">Luringen</span>
      <span class="kort-maskot">${maskotSvg()}</span>
      <span class="kort-linjer">${linjer.join("")}</span>
      <span class="kort-fot">Lytt godt, og bløff deg gjennom!</span>`;
  }

  function kortForPlass(plass) {
    if (S.skjerm === "gjest" && S.gjest) {
      const r = K.lagRunde(DATA, S.gjest.oppsett, S.gjest.runde);
      return K.kortFor(r, S.gjest.oppsett, plass);
    }
    return K.kortFor(S.spill.r, S.spill.oppsett, plass);
  }

  function visDel() {
    const sp = S.spill;
    const i = sp.visning.i;
    const n = sp.oppsett.spillere;
    const siste = i === n - 1;
    const prikker = Array.from(
      { length: n },
      (_, j) => `<span class="prikk ${j < i ? "ferdig" : ""} ${j === i ? "na" : ""}" style="--pf: var(--p${j + 1})"></span>`,
    ).join("");
    $("#s-del").innerHTML = `
      <div class="fremdrift" role="img" aria-label="Spiller ${i + 1} av ${n}">${prikker}</div>
      <div class="gi-til">
        <p class="etikett">Gi mobilen til</p>
        <h1 class="spillernavn">${avatar(i, "stor")}<span>${esc(navn(i))}</span></h1>
      </div>
      ${mappeHtml(i)}
      <p class="hjelp" id="mappe-hjelp">Hold inne for å se. Slipp for å skjule. Bare ${esc(navn(i))} skal se skjermen.</p>
      <div class="dokk">
        <button class="knapp" id="neste-spiller" data-h="neste-spiller" ${sp.visning.sett ? "" : "disabled"}>
          ${siste ? "Alle har sett – start!" : `Ferdig – gi til ${esc(navn(i + 1))}`}
        </button>
      </div>`;
  }

  function delLenke(kode) {
    return location.href.split("#")[0] + "#" + kode;
  }

  function visKode() {
    const sp = S.spill;
    const kode = sp.kode;
    const lang = kode.length > 8;
    let qr = "";
    if (kanDeleLenke) {
      try {
        qr = `<div class="qr">${Q.qrSvg(Q.lagQr(delLenke(kode), "M"), { mork: "var(--blekk)", lys: "var(--papir)", etikett: "QR-kode som åpner spillet med koden" })}</div>`;
      } catch (e) {
        qr = "";
      }
    }
    const plasser = Array.from({ length: sp.oppsett.spillere }, (_, i) => `
      <button class="plass" data-h="vert-plass" data-v="${i}" aria-pressed="${sp.vertPlass === i}" ${sp.vertLaast && sp.vertPlass !== i ? "disabled" : ""}>${avatar(i)}<span>${i + 1} · ${esc(navn(i))}</span></button>`).join("");
    $("#s-kode").innerHTML = `
      <div class="piller"><span class="pille">Runde ${sp.runde}</span><span class="pille">${sp.oppsett.spillere} spillere</span><span class="pille">${NIVA_TEKST[sp.oppsett.niva].navn}</span></div>
      <h1>${sp.runde === 1 ? "Del koden med de andre" : `Runde ${sp.runde}: alle trykker «Neste runde»`}</h1>
      <div class="kodekort">
        <span class="etikett">Koden til spillet</span>
        <span class="kode ${lang ? "lang" : ""}" id="spillkode">${K.formaterKode(kode)}</span>
        ${qr}
        ${kanDeleLenke
          ? '<div class="knapprad"><button class="knapp-2 liten" data-h="kopier-kode">Kopier kode</button><button class="knapp-2 liten" data-h="del-lenke">Del lenke</button></div>'
          : '<button class="knapp-2 liten" data-h="kopier-kode">Kopier kode</button>'}
      </div>
      <div class="seksjon" id="vertsplass">
        <h2 class="etikett">1 · Hvilken plass har du?</h2>
        <div class="plasser">${plasser}</div>
      </div>
      ${sp.vertPlass != null
        ? `<div class="seksjon" id="vertskort"><h2 class="etikett">2 · Se ordet ditt</h2>${mappeHtml(sp.vertPlass)}<p class="hjelp" id="mappe-hjelp">Hold inne for å se. De andre ser sitt ord på sin egen mobil.</p></div>`
        : ""}
      <ol class="steg">
        <li><b>De andre åpner Luringen</b><span>og trykker «Bli med i et spill».</span></li>
        <li><b>De skriver koden${kanDeleLenke ? " eller skanner QR-koden" : ""}</b><span>Alle må bruke samme versjon av siden.</span></li>
        <li><b>Alle velger sin plass</b><span>Én plass per person – samme nummer som her.</span></li>
      </ol>
      <div class="dokk">
        <button class="knapp" id="vert-start" data-h="til-diskusjon" ${sp.visning.sett ? "" : "disabled"}>${vertKnappTekst()}</button>
      </div>`;
  }

  function vertKnappTekst() {
    const sp = S.spill;
    if (sp.vertPlass == null) return "Velg plassen din først";
    if (!sp.visning.sett) return "Hold inne på kortet for å se ordet";
    return "Alle har sett ordet – start";
  }

  // ---------- Discussion and timer ----------

  let timerId = null;
  const RING = 2 * Math.PI * 82;

  function visDiskusjon() {
    const sp = S.spill;
    const s = sp.r.starter;
    const antall = sp.oppsett.luringer;
    if (sp.tid > 0 && !sp.timer) sp.timer = { slutt: Date.now() + sp.tid * 1000, gjenstar: sp.tid * 1000, pauset: false, ferdig: false };
    const timer =
      sp.tid > 0
        ? `<div class="timer" id="timer">
            <div class="timer-ring">
              <svg viewBox="0 0 190 190" aria-hidden="true"><circle class="spor" cx="95" cy="95" r="82"/><circle class="fyll" id="timer-fyll" cx="95" cy="95" r="82" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="0"/></svg>
              <span class="timer-tid" id="timer-tid" role="timer" aria-live="off">0:00</span>
            </div>
            <div class="timer-kontroll">
              <span class="etikett">Tid til å snakke</span>
              <button class="knapp-2 liten" data-h="timer-pause" id="timer-pause">Pause</button>
              <button class="knapp-2 liten" data-h="timer-pluss">+30 sek</button>
            </div>
          </div>`
        : "";
    $("#s-diskusjon").innerHTML = `
      <div class="piller">
        <span class="pille">Runde ${sp.runde}</span>
        <span class="pille rosa">${antall === 1 ? "1 luring" : antall + " luringer"} blant dere</span>
        <span class="pille">${NIVA_TEKST[sp.oppsett.niva].navn}</span>
      </div>
      <div class="starter">${avatar(s, "stor")}<h1>${esc(spillerEllerPlass(s))} starter!</h1></div>
      ${timer}
      <ol class="steg">
        <li><b>Si ett ord hver om det hemmelige ordet</b><span>Gå med klokka. Ta gjerne to runder.</span></li>
        <li><b>Ikke for tydelig, ikke for vagt</b><span>For tydelig: luringen skjønner ordet. For vagt: du blir mistenkt.</span></li>
        <li><b>Snakk sammen</b><span>Hvem virket usikre? Hvem kopierte de andre?</span></li>
      </ol>
      ${sp.modus === "en" || sp.vertPlass != null ? '<button class="lenke" data-h="se-igjen">Glemt ordet? Se kortet ditt igjen</button>' : ""}
      <div class="dokk">
        <button class="knapp rosa" data-h="til-pek">Klare til å peke</button>
      </div>`;
    if (sp.timer) startTimer();
  }

  function spillerEllerPlass(i) {
    return navn(i);
  }

  function formaterTid(ms) {
    const sek = Math.ceil(ms / 1000);
    return `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, "0")}`;
  }

  function gjenstar() {
    const t = S.spill && S.spill.timer;
    if (!t) return 0;
    return t.pauset ? t.gjenstar : Math.max(0, t.slutt - Date.now());
  }

  function tegnTimer() {
    const sp = S.spill;
    const el = $("#timer");
    if (!sp || !sp.timer || !el) return;
    const igjen = gjenstar();
    const total = Math.max(sp.tid * 1000, igjen);
    $("#timer-tid").textContent = formaterTid(igjen);
    $("#timer-fyll").setAttribute("stroke-dashoffset", (RING * (1 - igjen / total)).toFixed(1));
    el.classList.toggle("lite", igjen <= 30000);
    $("#timer-pause").textContent = sp.timer.pauset ? "Fortsett" : "Pause";
    if (igjen <= 0 && !sp.timer.ferdig) {
      sp.timer.ferdig = true;
      el.classList.add("ferdig");
      $("#timer-tid").textContent = "Tid!";
      Lyd.alarm();
      vibrer([200, 100, 200, 100, 400]);
      visToast("Tiden er ute – tell ned og pek!");
      lagre();
    }
  }

  function startTimer() {
    stoppTimer();
    tegnTimer();
    timerId = setInterval(tegnTimer, 250);
  }

  function stoppTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  // ---------- Vote ----------

  function visPek() {
    const sp = S.spill;
    const n = sp.oppsett.spillere;
    const rekke = Array.from({ length: n }, (_, i) => `
      <button class="mistenkt" data-h="velg-mistenkt" data-v="${i}" aria-pressed="${sp.mistenkt === i}">
        ${avatar(i)}<span class="navn">${esc(navn(i))}</span><span class="skilt">#${String(i + 1).padStart(2, "0")}</span>
      </button>`).join("");
    const valgt = sp.mistenkt != null && sp.mistenkt >= 0;
    $("#s-pek").innerHTML = `
      <h1>Tell ned og pek!</h1>
      <p class="ingress">Alle peker samtidig på den de tror er luringen.</p>
      <button class="knapp-2" data-h="nedtelling">3 · 2 · 1 · Pek!</button>
      <div class="seksjon">
        <h2 class="etikett">Hvem fikk flest pekefingre?</h2>
        <div class="rekke">${rekke}</div>
      </div>
      <button class="lenke" data-h="ingen-enighet">Uavgjort eller uenige? Da slipper luringen unna</button>
      <div class="dokk">
        <button class="knapp rosa" id="avslor-knapp" data-h="avslor" ${valgt ? "" : "disabled"}>
          ${valgt ? `Avslør ${esc(navn(sp.mistenkt))}` : "Velg en mistenkt"}
        </button>
      </div>`;
  }

  async function nedtelling() {
    const el = $("#nedtelling");
    el.hidden = false;
    for (const t of ["3", "2", "1"]) {
      el.innerHTML = `<span>${t}</span>`;
      Lyd.tikk();
      vibrer(30);
      await vent(rolig() ? 400 : 800);
    }
    el.innerHTML = '<span class="pek">PEK!</span>';
    Lyd.pek();
    vibrer([80, 40, 160]);
    await vent(rolig() ? 600 : 1100);
    el.hidden = true;
    el.innerHTML = "";
  }

  // ---------- Reveal ----------

  const erKaos = () => K.NIVAER[S.spill.oppsett.niva].luringFar === "lignende";

  function luringerHtml() {
    const sp = S.spill;
    return `<div class="luringer-rad">${sp.r.luringer.map((i) => `<div>${avatar(i, "stor")}<span>${esc(navn(i))}</span></div>`).join("")}</div>`;
  }

  async function visAvslor() {
    const sp = S.spill;
    const el = $("#s-avslor");
    const mitt = avslorNummer;
    const m = sp.mistenkt;
    const flere = sp.r.luringer.length > 1;

    if (m == null || m < 0) {
      el.innerHTML = `
        <div class="spotlys">
          <h1>Ingen ble tatt</h1>
          <div class="stempel-sted"><span class="stempel">Slapp unna!</span></div>
        </div>
        <div class="avslor-tekst"><p>${flere ? "Luringene var:" : "Luringen var:"}</p>${luringerHtml()}</div>
        <div class="dokk"><button class="knapp" data-h="ferdig" data-v="luring">Se resultatet</button></div>`;
      Lyd.latter();
      return;
    }

    const erLuring = sp.r.luringer.includes(m);
    el.innerHTML = `
      <div class="spotlys">
        ${avatar(m, "gigant skjelv")}
        <h1>Er ${esc(navn(m))} ${flere ? "en luring" : "luringen"} …?</h1>
        <div class="stempel-sted" id="stempel-sted"></div>
      </div>
      <div class="avslor-tekst" id="avslor-tekst"></div>
      <div class="dokk" id="avslor-dokk"></div>`;
    Lyd.trommevirvel(rolig() ? 0.6 : 2.0);
    await vent(rolig() ? 700 : 2150);
    if (mitt !== avslorNummer) return;

    $(".spotlys .avatar").classList.remove("skjelv");
    const sted = $("#stempel-sted");
    sted.innerHTML = erLuring ? '<span class="stempel">Avslørt!</span>' : '<span class="stempel mynte">Uskyldig!</span>';
    el.classList.remove("risting");
    void el.offsetWidth;
    el.classList.add("risting");
    vibrer(erLuring ? [60, 30, 120] : [200]);

    const tekst = $("#avslor-tekst");
    const dokk = $("#avslor-dokk");
    if (erLuring && erKaos()) {
      Lyd.fanfare();
      tekst.innerHTML = `<p>${esc(navn(m))} hadde ordet <b>«${esc(sp.r.lignende)}»</b> og ante ingenting.</p>`;
      dokk.innerHTML = '<button class="knapp mynte" data-h="ferdig" data-v="gruppa">Se resultatet</button>';
    } else if (erLuring) {
      Lyd.fanfare();
      tekst.innerHTML = `
        <p><b>Men vent …</b> ${flere ? "Luringene" : "Luringen"} kan fortsatt vinne!</p>
        <p>${esc(navn(m))} får ett forsøk på å gjette det hemmelige ordet. Si det høyt – nå.</p>`;
      dokk.innerHTML = '<button class="knapp" data-h="vis-ordet">Vis det hemmelige ordet</button>';
    } else {
      Lyd.buu();
      tekst.innerHTML = `<p>${esc(navn(m))} var uskyldig. ${flere ? "Luringene" : "Luringen"} var:</p>${luringerHtml()}`;
      dokk.innerHTML = '<button class="knapp rosa" data-h="ferdig" data-v="luring">Se resultatet</button>';
    }
  }

  function visOrdetForGjetting() {
    const sp = S.spill;
    $("#avslor-tekst").innerHTML = `
      <div class="ordboks">
        <span class="etikett">Det hemmelige ordet var</span>
        <span class="kort-ord ${lengdeKlasse(sp.r.ord)}" lang="nb">${esc(sp.r.ord)}</span>
      </div>
      <p>Gjettet ${esc(navn(sp.mistenkt))} riktig?</p>`;
    $("#avslor-dokk").innerHTML = `
      <div class="knapprad">
        <button class="knapp rosa" data-h="ferdig" data-v="luring">Ja, riktig</button>
        <button class="knapp mynte" data-h="ferdig" data-v="gruppa">Nei, feil</button>
      </div>`;
    Lyd.snu();
  }

  function ferdigRunde(luringVant) {
    const sp = S.spill;
    const pluss = K.poengForRunde(sp.oppsett.spillere, sp.r.luringer, luringVant);
    sp.poeng = sp.poeng.map((p, i) => p + pluss[i]);
    sp.utfall = { luringVant, pluss };
    gaTil("resultat");
    if (luringVant) {
      Lyd.latter();
      konfetti(["--luring", "--lilla", "--papir"]);
    } else {
      Lyd.fanfare();
      konfetti(["--lampe", "--mynte", "--luring", "--himmel", "--papir"]);
    }
  }

  function visResultat() {
    const sp = S.spill;
    if (!sp.utfall) return gaTil("diskusjon");
    const { luringVant, pluss } = sp.utfall;
    const flere = sp.r.luringer.length > 1;
    const rekkefolge = sp.poeng.map((p, i) => i).sort((a, b) => sp.poeng[b] - sp.poeng[a] || a - b);
    const ekstra = [];
    if (erKaos()) ekstra.push(`<span class="liten">${flere ? "Luringene" : "Luringen"} hadde ordet «${esc(sp.r.lignende)}».</span>`);
    else if (K.NIVAER[sp.oppsett.niva].luringFar === "hint") ekstra.push(`<span class="liten">Hintet var «${esc(sp.r.hint)}».</span>`);
    $("#s-resultat").innerHTML = `
      <div class="banner ${luringVant ? "luringen" : "gruppa"}">
        ${maskotSvg(luringVant ? "glad" : "tatt")}
        <h1>${luringVant ? (flere ? "Luringene lurte dere!" : "Luringen lurte dere!") : flere ? "Dere tok luringene!" : "Dere tok luringen!"}</h1>
      </div>
      <div class="fakta">
        <div class="fakta-rad"><span class="etikett">Ordet var</span><strong lang="nb">${esc(sp.r.ord)}</strong><span class="liten">${sp.r.kategori.ikon} ${esc(sp.r.kategori.navn)}</span></div>
        <div class="fakta-rad"><span class="etikett">${flere ? "Luringene var" : "Luringen var"}</span>
          <span class="navnerad">${sp.r.luringer.map((i) => `<span>${avatar(i)}${esc(navn(i))}</span>`).join("")}</span>
          ${ekstra.join("")}
        </div>
      </div>
      <div class="seksjon">
        <h2 class="etikett">Poeng etter ${sp.runde} ${sp.runde === 1 ? "runde" : "runder"}</h2>
        <ol class="poengliste">
          ${rekkefolge.map((i) => `<li>${avatar(i)}<span class="navn">${esc(navn(i))}</span>${pluss[i] ? `<span class="pluss ${sp.r.luringer.includes(i) ? "rosa" : ""}">+${pluss[i]}</span>` : ""}<span class="sum">${sp.poeng[i]}</span></li>`).join("")}
        </ol>
        <p class="hjelp">Gruppa vinner: +1 hver. Luringen vinner: +2.</p>
      </div>
      <div class="lenkerad">
        <button class="lenke" data-h="endre-oppsett">Endre oppsett</button>
        <button class="lenke" data-h="nullstill">Nullstill poengene</button>
        <button class="lenke" data-h="avslutt-spill">Avslutt spillet</button>
      </div>
      <div class="dokk">
        <button class="knapp" data-h="ny-runde">Ny runde</button>
      </div>`;
  }

  // ---------- Join with a code ----------

  const KODEFEIL = {
    tom: "Skriv inn koden først.",
    kort: "Koden er for kort. Den har 8 tegn (eller 15 hvis dere har valgt kategorier).",
    lang: "Koden er for lang. Den har 8 tegn (eller 15 hvis dere har valgt kategorier).",
    ugyldig: "Koden stemmer ikke. Sjekk at den er skrevet riktig.",
    sjekksum: "Koden stemmer ikke. Sjekk skrivefeil – og at dere bruker samme versjon av siden (last inn på nytt).",
    versjon: "Koden er fra en nyere versjon av spillet. Last inn siden på nytt.",
  };

  function visBliMed(forhand) {
    $("#s-bli-med").innerHTML = `
      <h1>Bli med i et spill</h1>
      <p class="ingress">Skriv koden fra mobilen til den som startet spillet.</p>
      <form id="kodeskjema" class="seksjon" autocomplete="off" novalidate>
        <label class="vh" for="kodefelt">Spillkode</label>
        <input class="kodefelt" id="kodefelt" name="kode" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="22" placeholder="ABCD-1234" value="${esc(forhand || "")}">
        <p class="feil" id="kodefeil" role="alert"></p>
        <div class="dokk"><button class="knapp" type="submit">Bli med</button></div>
      </form>`;
  }

  function sendKode() {
    const felt = $("#kodefelt");
    const svar = K.lesKode(felt.value, DATA);
    if (!svar.ok) {
      $("#kodefeil").textContent = KODEFEIL[svar.feil] || KODEFEIL.ugyldig;
      felt.classList.remove("risting");
      void felt.offsetWidth;
      felt.classList.add("risting");
      vibrer(120);
      return;
    }
    const laast = S.laste[svar.kode];
    S.gjest = { kode: svar.kode, oppsett: svar.oppsett, runde: 1, plass: laast != null ? laast : null, sett: laast != null, datahash: DATA.hash };
    holdVaken();
    gaTil(laast != null ? "gjest" : "plass");
  }

  function visPlass() {
    const g = S.gjest;
    if (!g) return gaTil("bli-med");
    if (g.sett && g.plass != null) return gaTil("gjest"); // seat locked once the card was seen
    const o = g.oppsett;
    const kat = o.kategorier ? `${o.kategorier.length} ${o.kategorier.length === 1 ? "kategori" : "kategorier"}` : "Alle kategorier";
    $("#s-plass").innerHTML = `
      <h1>Hvilken plass er din?</h1>
      <p class="ingress">Velg samme plass som verten har gitt deg. Plassen låses når du har sett kortet ditt.</p>
      <div class="piller"><span class="pille">${o.spillere} spillere</span><span class="pille">${NIVA_TEKST[o.niva].navn}</span><span class="pille">${kat}</span><span class="pille rosa">${o.luringer === 1 ? "1 luring" : o.luringer + " luringer"}</span></div>
      <div class="plasser">${Array.from({ length: o.spillere }, (_, i) => `<button class="plass" data-h="gjest-plass" data-v="${i}" aria-pressed="${g.plass === i}">${avatar(i)}<span>${plassNavn(i)}</span></button>`).join("")}</div>`;
  }

  function visGjest() {
    const g = S.gjest;
    if (!g || g.plass == null) return gaTil("plass");
    const r = K.lagRunde(DATA, g.oppsett, g.runde);
    $("#s-gjest").innerHTML = `
      <div class="piller"><span class="pille">Runde ${g.runde}</span><span class="pille">${NIVA_TEKST[g.oppsett.niva].navn}</span></div>
      <div class="gi-til"><p class="etikett">Du er</p><h1 class="spillernavn">${avatar(g.plass, "stor")}<span>${plassNavn(g.plass)}</span></h1></div>
      ${mappeHtml(g.plass)}
      <p class="hjelp" id="mappe-hjelp">Hold inne for å se. ${esc(plassNavn(r.starter))} begynner å si ord. Verten styrer pekingen og avsløringen.</p>
      <div class="rundevelger" aria-label="Velg runde">
        <button data-h="gjest-runde" data-d="-1" aria-label="Forrige runde" ${g.runde <= 1 ? "disabled" : ""}>−</button>
        <span>Runde ${g.runde}</span>
        <button data-h="gjest-runde" data-d="1" aria-label="Neste runde">+</button>
      </div>
      <button class="lenke" data-h="forlat">Forlat spillet</button>
      <div class="dokk">
        <button class="knapp" data-h="gjest-runde" data-d="1">Neste runde</button>
      </div>`;
  }

  // ---------- Rules ----------

  function visRegler() {
    $("#s-regler").innerHTML = `
      <h1>Slik spiller du</h1>
      <ol class="steg">
        <li><b>Alle får samme hemmelige ord</b><span>Bortsett fra luringen. Hen må late som hen vet det.</span></li>
        <li><b>Si ett ord hver</b><span>Vis at du kan ordet uten å avsløre det for luringen.</span></li>
        <li><b>Snakk sammen, tell ned og pek</b><span>Den som får flest pekefingre, blir avslørt.</span></li>
        <li><b>Luringen får en siste sjanse</b><span>Blir luringen tatt, kan hen fortsatt vinne ved å gjette ordet.</span></li>
      </ol>
      <div class="seksjon">
        <h2 class="etikett">Poeng</h2>
        <p class="ingress">Gruppa vinner: +1 til hver. Luringen vinner: +2 til hver luring.</p>
      </div>
      <div class="seksjon">
        <h2 class="etikett">Nivåene</h2>
        <div class="regel-nivaer">
          ${NIVA_TEKST.map((n) => `<div><b>${n.navn}</b><p>${n.kort}</p></div>`).join("")}
        </div>
      </div>
      <div class="seksjon">
        <h2 class="etikett">To måter å spille på</h2>
        <div class="regel-nivaer">
          <div><b>Én mobil</b><p>Send mobilen rundt. Hver person holder inne for å se sitt kort.</p></div>
          <div><b>Hver sin mobil</b><p>Én starter spillet og får en kode. De andre trykker «Bli med», skriver koden og velger plass. Det trengs ingen innlogging, og ingenting sendes over nettet – koden inneholder alt.</p></div>
        </div>
      </div>
      <p class="personvern">Luringen har ingen reklame og ingen innlogging. Navn og innstillinger lagres bare på denne enheten.</p>
      <div class="dokk"><button class="knapp" data-h="nytt">Start et spill</button></div>`;
  }

  const SKJERMER = {
    hjem: visHjem,
    oppsett: visOppsett,
    del: visDel,
    kode: visKode,
    diskusjon: visDiskusjon,
    pek: visPek,
    avslor: visAvslor,
    resultat: visResultat,
    "bli-med": () => visBliMed(""),
    plass: visPlass,
    gjest: visGjest,
    regler: visRegler,
  };

  // ---------- Game flow ----------

  function startSpill() {
    const o = S.oppsett;
    const oppsett = {
      spillere: o.spillere,
      luringer: Math.min(o.luringer, K.maksLuringer(o.spillere)),
      niva: o.niva,
      kategorier: K.erAlleKategorier(DATA, o.kategorier) ? null : o.kategorier.slice(),
      seed: K.nyttFro(window.crypto),
    };
    S.spill = {
      modus: o.modus,
      oppsett,
      tid: o.tid,
      runde: 0,
      posisjon: -1,
      poeng: new Array(o.spillere).fill(0),
      vertPlass: null,
      kode: o.modus === "hver" ? K.lagKode(oppsett, DATA) : null,
      datahash: DATA.hash,
    };
    holdVaken();
    nyRunde();
  }

  function nyRunde() {
    const sp = S.spill;
    sp.runde++;
    let r;
    if (sp.modus === "en") {
      r = K.lagRunde(DATA, sp.oppsett, sp.runde, { posisjon: sp.posisjon + 1, unnga: new Set(S.nylige) });
      S.nylige.push(r.nokkel);
      if (S.nylige.length > 400) S.nylige.splice(0, S.nylige.length - 400);
    } else {
      r = K.lagRunde(DATA, sp.oppsett, sp.runde);
    }
    sp.posisjon = r.posisjon;
    sp.r = r;
    sp.visning = { i: 0, sett: false };
    sp.mistenkt = null;
    sp.utfall = null;
    sp.timer = null;
    gaTil(sp.modus === "en" ? "del" : "kode");
  }

  // ---------- Dossier card: hold to reveal ----------

  let apenMappe = null;
  let apnetTid = 0;

  function apneMappe(m) {
    if (apenMappe) return;
    const plass = Number(m.dataset.mappe);
    const kort = kortForPlass(plass);
    const bak = m.querySelector(".mappe-bakside");
    bak.className = "mappe-bakside" + (kort.type === "luring" ? " luring" : "");
    bak.innerHTML = kortHtml(kort);
    m.classList.add("apen");
    apenMappe = m;
    // Seeing a card (even a quick peek) locks the seat: no going back to look at other seats.
    if (S.skjerm === "gjest" && S.gjest && S.gjest.plass != null && !S.gjest.sett) {
      S.gjest.sett = true;
      S.laste[S.gjest.kode] = S.gjest.plass;
      lagre();
    }
    if (S.skjerm === "kode" && S.spill && S.spill.vertPlass != null && !S.spill.vertLaast && !m.closest("#ark")) {
      S.spill.vertLaast = true; // the host's seat is fixed for the rest of the game
      lagre();
    }
    apnetTid = performance.now();
    Lyd.snu();
    vibrer(15);
  }

  function lukkMappe() {
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
    if (holdt < 350) {
      visToast("Hold litt lenger for å lese");
      return;
    }
    if ((S.skjerm === "del" || S.skjerm === "kode") && S.spill && !S.spill.visning.sett && !m.closest("#ark")) {
      S.spill.visning.sett = true;
      const knapp = $("#neste-spiller") || $("#vert-start");
      if (knapp) {
        if (knapp.id === "vert-start") knapp.textContent = vertKnappTekst();
        knapp.disabled = false;
        knapp.classList.add("pop");
      }
      lagre();
    }
  }

  document.addEventListener("pointerdown", (e) => {
    Lyd.lasOpp();
    const m = e.target.closest(".mappe");
    if (!m) return;
    e.preventDefault();
    try {
      m.setPointerCapture(e.pointerId);
    } catch (feil) {
      /* not all pointers can be captured */
    }
    apneMappe(m);
  });
  ["pointerup", "pointercancel"].forEach((t) => document.addEventListener(t, lukkMappe));
  window.addEventListener("blur", lukkMappe);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) lukkMappe();
    else if (S.spill || S.gjest) holdVaken();
  });
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".mappe")) e.preventDefault();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && e.target.classList && e.target.classList.contains("mappe")) {
      e.preventDefault();
      if (!e.repeat) apneMappe(e.target);
    }
    if (e.key === "Escape" && !$("#ark").hidden) lukkArk();
  });
  document.addEventListener("keyup", (e) => {
    if ((e.key === " " || e.key === "Enter") && apenMappe) {
      e.preventDefault();
      lukkMappe();
    }
  });

  // ---------- Sheet, confirm, toast ----------

  let arkSvar = null;

  function apneArk(html) {
    $("#ark-innhold").innerHTML = html;
    $("#ark").hidden = false;
    const forste = $("#ark-innhold button, #ark-innhold input");
    if (forste) forste.focus();
  }

  function lukkArk() {
    const ark = $("#ark");
    if (!ark || ark.hidden) return;
    ark.hidden = true;
    $("#ark-innhold").innerHTML = "";
    if (arkSvar) {
      const svar = arkSvar;
      arkSvar = null;
      svar(false);
    }
  }

  function bekreft(tittel, tekst, ja, nei) {
    return new Promise((resolve) => {
      apneArk(`
        <h2 id="ark-tittel">${esc(tittel)}</h2>
        <p class="ingress">${esc(tekst)}</p>
        <div class="knapprad">
          <button class="knapp-2" data-h="ark-svar" data-v="nei">${esc(nei || "Avbryt")}</button>
          <button class="knapp rosa" data-h="ark-svar" data-v="ja">${esc(ja || "Ja")}</button>
        </div>`);
      arkSvar = resolve;
    });
  }

  function seIgjen() {
    const sp = S.spill;
    if (sp.modus === "hver") {
      apneArk(`<h2 id="ark-tittel">Ditt kort</h2>${mappeHtml(sp.vertPlass)}<p class="hjelp" id="mappe-hjelp">Hold inne for å se.</p><button class="knapp-2" data-h="lukk-ark">Lukk</button>`);
      return;
    }
    apneArk(`
      <h2 id="ark-tittel">Hvem vil se kortet sitt?</h2>
      <p class="ingress">Bare den som velges, skal se på skjermen.</p>
      <div class="plasser">${Array.from({ length: sp.oppsett.spillere }, (_, i) => `<button class="plass" data-h="se-igjen-velg" data-v="${i}">${avatar(i)}<span>${esc(navn(i))}</span></button>`).join("")}</div>
      <button class="knapp-2" data-h="lukk-ark">Lukk</button>`);
  }

  let toastId = null;
  function visToast(tekst) {
    const t = $("#toast");
    t.textContent = tekst;
    t.classList.add("vis");
    clearTimeout(toastId);
    toastId = setTimeout(() => t.classList.remove("vis"), 2200);
  }

  async function kopier(tekst) {
    try {
      await navigator.clipboard.writeText(tekst);
      visToast("Kopiert!");
    } catch (e) {
      const el = $("#spillkode");
      if (el) {
        const omrade = document.createRange();
        omrade.selectNodeContents(el);
        const valg = window.getSelection();
        valg.removeAllRanges();
        valg.addRange(omrade);
      }
      visToast("Marker og kopier koden");
    }
  }

  // ---------- Confetti ----------

  function konfetti(fargeTokens) {
    if (rolig()) return;
    const lerret = $("#konfetti");
    const ctx = lerret.getContext && lerret.getContext("2d");
    if (!ctx) return;
    const stil = getComputedStyle(document.documentElement);
    const farger = fargeTokens.map((t) => stil.getPropertyValue(t).trim()).filter(Boolean);
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
  }

  // ---------- Actions ----------

  const H = {
    hjem: () => gaTil("hjem"),
    tilbake: () => tilbake(),
    lyd: () => {
      S.lyd = !S.lyd;
      oppdaterTopp();
      lagre();
      if (S.lyd) Lyd.klikk();
    },
    nytt: () => gaTil("oppsett"),
    "bli-med": () => gaTil("bli-med"),
    regler: () => {
      S.reglerFra = S.skjerm;
      gaTil("regler");
    },
    fortsett: () => gaTil(S.spill.skjerm || (S.spill.modus === "en" ? "del" : "kode")),
    "fortsett-gjest": () => gaTil("gjest"),
    modus: (el) => {
      S.oppsett.modus = el.dataset.v === "hver" ? "hver" : "en";
      oppfriskOppsett();
    },
    spillere: (el) => {
      const o = S.oppsett;
      o.spillere = Math.min(K.MAKS_SPILLERE, Math.max(K.MIN_SPILLERE, o.spillere + Number(el.dataset.d)));
      o.luringer = Math.min(o.luringer, K.maksLuringer(o.spillere));
      oppfriskOppsett();
    },
    niva: (el) => {
      S.oppsett.niva = Number(el.dataset.v);
      oppfriskOppsett();
    },
    "kat-alle": () => {
      S.oppsett.kategorier = null;
      S.velgKategorier = false;
      oppfriskOppsett();
    },
    "kat-velg": () => {
      S.velgKategorier = true;
      oppfriskOppsett();
    },
    kat: (el) => {
      const o = S.oppsett;
      const sett = new Set(K.erAlleKategorier(DATA, o.kategorier) ? [] : o.kategorier);
      if (sett.has(el.dataset.id)) sett.delete(el.dataset.id);
      else sett.add(el.dataset.id);
      o.kategorier = sett.size && sett.size < DATA.kategorier.length ? DATA.kategorier.map((k) => k.id).filter((id) => sett.has(id)) : null;
      oppfriskOppsett();
    },
    luringer: (el) => {
      S.oppsett.luringer = Number(el.dataset.v);
      oppfriskOppsett();
    },
    tid: (el) => {
      S.oppsett.tid = Number(el.dataset.v);
      oppfriskOppsett();
    },
    start: () => startSpill(),
    "neste-spiller": () => {
      const sp = S.spill;
      if (!sp.visning.sett) return;
      if (sp.visning.i < sp.oppsett.spillere - 1) {
        sp.visning = { i: sp.visning.i + 1, sett: false };
        gaTil("del");
      } else {
        gaTil("diskusjon");
      }
    },
    "vert-plass": (el) => {
      const ny = Number(el.dataset.v);
      if (S.spill.vertLaast && S.spill.vertPlass !== ny) return visToast("Plassen er låst når du har sett kortet");
      if (S.spill.vertPlass !== ny) S.spill.visning.sett = false;
      S.spill.vertPlass = ny;
      visKode();
      const kort = $("#vertskort");
      if (kort) kort.scrollIntoView({ behavior: rolig() ? "auto" : "smooth", block: "center" });
      lagre();
    },
    "kopier-kode": () => kopier(K.formaterKode(S.spill.kode)),
    "del-lenke": async () => {
      const lenke = delLenke(S.spill.kode);
      if (navigator.share) {
        try {
          await navigator.share({ title: "Luringen", text: `Bli med i Luringen! Koden er ${K.formaterKode(S.spill.kode)}`, url: lenke });
          return;
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
      }
      kopier(lenke);
    },
    "til-diskusjon": () => gaTil("diskusjon"),
    "timer-pause": () => {
      const t = S.spill.timer;
      if (!t || t.ferdig) return;
      if (t.pauset) {
        t.slutt = Date.now() + t.gjenstar;
        t.pauset = false;
      } else {
        t.gjenstar = Math.max(0, t.slutt - Date.now());
        t.pauset = true;
      }
      tegnTimer();
      lagre();
    },
    "timer-pluss": () => {
      const t = S.spill.timer;
      if (!t) return;
      if (t.ferdig) {
        t.ferdig = false;
        t.slutt = Date.now() + 30000;
        t.pauset = false;
        $("#timer").classList.remove("ferdig");
      } else if (t.pauset) t.gjenstar += 30000;
      else t.slutt += 30000;
      tegnTimer();
      lagre();
    },
    "se-igjen": () => seIgjen(),
    "se-igjen-velg": (el) => {
      const i = Number(el.dataset.v);
      $("#ark-innhold").innerHTML = `<h2 id="ark-tittel">${esc(navn(i))}</h2>${mappeHtml(i)}<p class="hjelp" id="mappe-hjelp">Hold inne for å se.</p><button class="knapp-2" data-h="lukk-ark">Lukk</button>`;
    },
    "lukk-ark": () => lukkArk(),
    "ark-svar": (el) => {
      const svar = arkSvar;
      arkSvar = null;
      lukkArk();
      if (svar) svar(el.dataset.v === "ja");
    },
    "til-pek": () => gaTil("pek"),
    nedtelling: () => nedtelling(),
    "velg-mistenkt": (el) => {
      const sp = S.spill;
      const i = Number(el.dataset.v);
      sp.mistenkt = sp.mistenkt === i ? null : i;
      $$(".mistenkt").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.v) === sp.mistenkt)));
      const knapp = $("#avslor-knapp");
      knapp.disabled = sp.mistenkt == null;
      knapp.textContent = sp.mistenkt == null ? "Velg en mistenkt" : `Avslør ${navn(sp.mistenkt)}`;
      Lyd.klikk();
      lagre();
    },
    avslor: () => {
      if (S.spill.mistenkt == null) return;
      gaTil("avslor");
    },
    "ingen-enighet": async () => {
      const ok = await bekreft("Slipper luringen unna?", "Hvis dere ikke blir enige, vinner luringen runden.", "Ja, avslør", "Pek en gang til");
      if (!ok) return;
      S.spill.mistenkt = -1;
      gaTil("avslor");
    },
    "vis-ordet": () => visOrdetForGjetting(),
    ferdig: (el) => ferdigRunde(el.dataset.v === "luring"),
    "ny-runde": () => nyRunde(),
    "endre-oppsett": () => gaTil("oppsett"),
    nullstill: async () => {
      const ok = await bekreft("Nullstille poengene?", "Alle poeng i dette spillet settes til 0.", "Nullstill", "Avbryt");
      if (!ok) return;
      S.spill.poeng = S.spill.poeng.map(() => 0);
      gaTil("resultat");
    },
    "avslutt-spill": async () => {
      const ok = await bekreft("Avslutte spillet?", "Runden og poengene slettes. Navn og innstillinger beholdes.", "Avslutt", "Avbryt");
      if (!ok) return;
      S.spill = null;
      gaTil("oppsett");
    },
    "gjest-plass": (el) => {
      const g = S.gjest;
      if (g.sett && g.plass != null && g.plass !== Number(el.dataset.v)) return visToast("Plassen er låst når du har sett kortet");
      g.plass = Number(el.dataset.v);
      gaTil("gjest");
    },
    "gjest-runde": (el) => {
      const g = S.gjest;
      g.runde = Math.max(1, g.runde + Number(el.dataset.d));
      gaTil("gjest");
    },
    forlat: async () => {
      const ok = await bekreft("Forlate spillet?", "Du kan bli med igjen med samme kode.", "Forlat", "Bli");
      if (!ok) return;
      S.gjest = null;
      gaTil("hjem");
    },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-h]");
    if (!el || el.disabled) return;
    const handling = H[el.dataset.h];
    if (!handling) return;
    if (el.dataset.h !== "velg-mistenkt") Lyd.klikk();
    handling(el, e);
  });

  document.addEventListener("click", (e) => {
    if (e.target.id === "ark") lukkArk();
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.navn != null) {
      S.navn[Number(el.dataset.navn)] = el.value.slice(0, 16);
      lagre();
    }
    if (el.id === "kodefelt") {
      const for_ = el.value;
      const ren = K.normaliserKode(for_);
      const pen = K.formaterKode(ren);
      if (pen !== for_) {
        el.value = pen;
        el.setSelectionRange(pen.length, pen.length);
      }
      $("#kodefeil").textContent = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (e.key === "Enter" && el.dataset && el.dataset.navn != null) {
      e.preventDefault();
      const neste = $(`#navn-${Number(el.dataset.navn) + 1}`);
      if (neste) neste.focus();
      else el.blur();
    }
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "kodeskjema") {
      e.preventDefault();
      sendKode();
    }
  });

  // ---------- Start ----------

  function apneFraAdresse() {
    const treff = KODE_I_ADRESSE.exec(location.hash || "");
    if (!treff) return false;
    gaTil("bli-med");
    visBliMed(K.formaterKode(treff[1]));
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {
      /* not allowed in every frame */
    }
    return true;
  }

  function start(varmData) {
    hentTilstand(lesLagret());
    if (varmData && varmData.tilstand) hentTilstand(varmData.tilstand);
    if (apneFraAdresse()) return;
    let skjerm = S.skjerm;
    if (SPILLSKJERMER.includes(skjerm) && !S.spill) skjerm = "hjem";
    if ((skjerm === "gjest" || skjerm === "plass") && !S.gjest) skjerm = "hjem";
    if (skjerm === "avslor") skjerm = "pek";
    gaTil(skjerm);
  }

  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === "function") {
    try {
      hot.snapshot(() => ({ tilstand: { navn: S.navn, oppsett: S.oppsett, lyd: S.lyd, nylige: S.nylige, spill: S.spill, gjest: S.gjest, skjerm: S.skjerm } }));
    } catch (e) {
      /* optional */
    }
  }
  if (hot && typeof hot.ready === "function") hot.ready(start);
  else start((hot && hot.data) || {});

  window.addEventListener("hashchange", apneFraAdresse);

  if (NETTSIDE && "serviceWorker" in navigator && location.protocol === "https:" && !iRamme) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
