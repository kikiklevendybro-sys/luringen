/* Låsesmeden — crack the colour code. The code is a row of pegs; after every guess the lock says
   how many pegs are the right colour in the right place (a filled pin) and how many are the right
   colour in the wrong place (a ring). Every peg has its own colour AND its own shape, so the game
   never depends on telling colours apart.
   Against the phone (it picks the code with a seeded generator, three levels) or two players on one
   phone: each makes a code for the other, fewest guesses wins. The engine at the top is pure and
   also runs under node (test/lasesmeden.test.mjs). */
(function () {
  "use strict";

  // ======================= Engine =======================

  const motor = (function () {
    // The kit's generator (mulberry32): the same seed gives the same code everywhere.
    function rng(fro) {
      let a = fro >>> 0;
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    // lengde: pegs in the code, farger: colours to choose from, like: may a colour come twice,
    // forsok: guesses before the lock wins.
    const NIVAER = Object.freeze({
      1: Object.freeze({ lengde: 4, farger: 6, like: false, forsok: 10 }),
      2: Object.freeze({ lengde: 4, farger: 6, like: true, forsok: 10 }),
      3: Object.freeze({ lengde: 5, farger: 8, like: true, forsok: 12 }),
    });
    const niva = (n) => NIVAER[n] || NIVAER[2];

    // A code: `lengde` colour numbers 0 … farger − 1 (all different when `like` is false).
    function lagKode(n, fro) {
      const N = niva(n);
      const tilf = rng(fro);
      const ut = [];
      while (ut.length < N.lengde) {
        const f = Math.floor(tilf() * N.farger);
        if (N.like || !ut.includes(f)) ut.push(f);
      }
      return ut;
    }
    const gyldig = (n, kode) => {
      const N = niva(n);
      return Array.isArray(kode) && kode.length === N.lengde && kode.every((f) => Number.isInteger(f) && f >= 0 && f < N.farger) && (N.like || new Set(kode).size === kode.length);
    };

    // The lock's answer: svart = right colour, right place; hvit = right colour, wrong place.
    function vurder(kode, gjett) {
      let svart = 0;
      const k = {};
      const g = {};
      for (let i = 0; i < kode.length; i++) {
        if (kode[i] === gjett[i]) svart++;
        else {
          k[kode[i]] = (k[kode[i]] || 0) + 1;
          g[gjett[i]] = (g[gjett[i]] || 0) + 1;
        }
      }
      let hvit = 0;
      for (const f of Object.keys(g)) hvit += Math.min(g[f], k[f] || 0);
      return { svart, hvit };
    }

    // Every possible code of a level.
    function alleKoder(n) {
      const N = niva(n);
      const ut = [];
      const kode = new Array(N.lengde).fill(0);
      (function legg(i) {
        if (i === N.lengde) {
          if (N.like || new Set(kode).size === N.lengde) ut.push(kode.slice());
          return;
        }
        for (let f = 0; f < N.farger; f++) {
          kode[i] = f;
          legg(i + 1);
        }
      })(0);
      return ut;
    }
    // The codes that would have given every answer so far. historikk: [{ gjett, svart, hvit }]
    function mulige(n, historikk) {
      return alleKoder(n).filter((k) =>
        historikk.every((h) => {
          const v = vurder(k, h.gjett);
          return v.svart === h.svart && v.hvit === h.hvit;
        }),
      );
    }
    // A hint: one code that fits everything the lock has said (picked with the seed).
    function hint(n, historikk, fro) {
      const m = mulige(n, historikk);
      if (!m.length) return null;
      return m[Math.floor(rng(fro)() * m.length)];
    }

    return { rng, NIVAER, niva, lagKode, gyldig, vurder, alleKoder, mulige, hint };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    if (typeof window === "object" && window) window.Lasesmeden = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;
  const NIVAER = [1, 2, 3];
  const NIVANAVN = Object.assign(Object.create(null), { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") });
  const NIVANAVN_LITEN = Object.assign(Object.create(null), { 1: R.t("lett"), 2: R.t("middels"), 3: R.t("vanskelig") });
  const NIVATEKST = Object.assign(Object.create(null), {
    1: R.t("Fire knapper, seks farger, ingen like. Ti forsøk."),
    2: R.t("Fire knapper, seks farger, og samme farge kan komme flere ganger. Ti forsøk."),
    3: R.t("Fem knapper, åtte farger, like farger tillatt. Tolv forsøk."),
  });
  // The pegs: a colour and a shape each, and a name for the screen reader.
  const KNAPPER = [
    { farge: "#ff5a4e", form: "sirkel", navn: R.t("rød sirkel") },
    { farge: "#3d8bff", form: "firkant", navn: R.t("blå firkant") },
    { farge: "#ffd23f", form: "trekant", navn: R.t("gul trekant") },
    { farge: "#3ddc84", form: "rombe", navn: R.t("grønn rombe") },
    { farge: "#b07cff", form: "stjerne", navn: R.t("lilla stjerne") },
    { farge: "#ff9a3c", form: "hjerte", navn: R.t("oransje hjerte") },
    { farge: "#ff7eb6", form: "sekskant", navn: R.t("rosa sekskant") },
    { farge: "#f4ecff", form: "pluss", navn: R.t("hvitt kryss") },
  ];
  const FORM = {
    sirkel: '<circle cx="12" cy="12" r="8.6"/>',
    firkant: '<rect x="4" y="4" width="16" height="16" rx="2.6"/>',
    trekant: '<path d="M12 3.2 21.2 19.6H2.8Z"/>',
    rombe: '<path d="M12 2.4 21.6 12 12 21.6 2.4 12Z"/>',
    stjerne: '<path d="m12 2.6 2.75 6.2 6.7.55-5.1 4.4 1.55 6.6L12 16.9l-5.9 3.45 1.55-6.6-5.1-4.4 6.7-.55Z"/>',
    hjerte: '<path d="M12 20.6C5 15.8 2.6 12.4 2.6 8.9A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 9.4 2.3c0 3.5-2.4 6.9-9.4 11.7Z"/>',
    sekskant: '<path d="M7.2 3.6h9.6l4.8 8.4-4.8 8.4H7.2L2.4 12Z"/>',
    pluss: '<path d="M9 2.8h6v6.2h6.2v6H15v6.2H9V15H2.8V9H9Z"/>',
  };
  const knapp = (f, klasse = "") => (f == null || !KNAPPER[f] ? `<span class="ls-hull ${klasse}" aria-hidden="true"></span>` : `<span class="ls-knapp ${klasse}" style="--kf:${KNAPPER[f].farge}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${FORM[KNAPPER[f].form]}</svg></span>`);
  const kodeNavn = (kode) => kode.map((f) => (f == null ? R.t("tom") : KNAPPER[f].navn)).join(", ");
  const svarTekst = (s, h) => R.t("{s} på riktig plass, {h} riktig farge på feil plass", { s, h });
  const HINT = 1;
  const NAVN = () => (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || R.t("Låsesmeden");
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/lasesmeden/" }).href;

  let H;
  let las = false;

  // ---------- The game state ----------
  // S.spill: { modus, niva, runder: [{ lager, gjetter, kode, gjett: [{ gjett, svart, hvit }], hint, ferdig, lost }],
  //   runde, rad (the row being built), valgt (the slot in it), fase: "lag" | "gjett" | "slutt" }
  // Against the phone there is one round; two players play two (each makes one code).

  const mot = (sp) => sp.modus === "mobil";
  const runde = (sp) => sp.runder[sp.runde];
  const N = (sp) => M.niva(sp.niva);
  const iGang = (S) => !!(S.spill && S.spill.fase !== "slutt");

  function nyttSpill(S) {
    const o = S.oppsett;
    const fro = R.nyttFro();
    const sp = {
      modus: o.modus,
      niva: o.niva,
      fro,
      runder: [],
      runde: 0,
      rad: [],
      valgt: 0,
      fase: "gjett",
      start: Date.now(),
    };
    if (mot(sp)) {
      sp.runder.push({ lager: 1, gjetter: 0, kode: M.lagKode(o.niva, fro), gjett: [], hint: HINT, ferdig: false, lost: false });
    } else {
      const forst = o.starter === 1 ? 1 : 0;
      sp.runder.push({ lager: forst, gjetter: 1 - forst, kode: null, gjett: [], hint: HINT, ferdig: false, lost: false });
      sp.runder.push({ lager: 1 - forst, gjetter: forst, kode: null, gjett: [], hint: HINT, ferdig: false, lost: false });
      sp.fase = "lag";
    }
    sp.rad = new Array(M.niva(o.niva).lengde).fill(null);
    S.spill = sp;
    las = false;
    R.statistikk("start", { modus: o.modus, niva: o.niva });
  }

  // Where a running game goes on: the code maker's screen behind a «give the phone to» gate.
  function nesteSkjerm(S) {
    const sp = S.spill;
    if (!sp) return "hjem";
    if (sp.fase === "slutt") return "slutt";
    if (sp.fase === "mellom") return "mellom";
    if (mot(sp)) return "spill";
    return "gi";
  }

  // ---------- Pieces of the board ----------

  function pinner(svart, hvit, lengde) {
    const ut = [];
    for (let i = 0; i < lengde; i++) ut.push(i < svart ? '<i class="s"></i>' : i < svart + hvit ? '<i class="h"></i>' : "<i></i>");
    return `<span class="ls-pinner" data-n="${lengde}" aria-hidden="true">${ut.join("")}</span>`;
  }

  function historikkHtml(sp) {
    const r = runde(sp);
    const L = N(sp).lengde;
    return r.gjett
      .map(
        (g, k) => `<li class="ls-rad${g.svart === L ? " vant" : ""}">
          <span class="ls-nr" aria-hidden="true">${k + 1}</span>
          <span class="ls-knapper">${g.gjett.map((f) => knapp(f)).join("")}</span>
          ${pinner(g.svart, g.hvit, L)}
          <span class="vh">${esc(R.t("Forsøk {n}: {kode}. {svar}.", { n: k + 1, kode: kodeNavn(g.gjett), svar: svarTekst(g.svart, g.hvit) }))}</span>
        </li>`,
      )
      .join("");
  }

  // The row being built: each slot is a button (tap: choose it, or take its peg out).
  function radHtml(sp, h) {
    return `<div class="ls-bygg" role="group" aria-label="${esc(R.t("Raden du bygger"))}">${sp.rad
      .map(
        (f, i) =>
          `<button type="button" class="ls-plass${i === sp.valgt ? " valgt" : ""}" data-h="${h}" data-v="${i}" aria-pressed="${i === sp.valgt}" aria-label="${esc(R.t("Plass {n}: {hva}", { n: i + 1, hva: f == null ? R.t("tom") : KNAPPER[f].navn }))}"${i === sp.valgt ? " data-fokus" : ""}>${knapp(f)}</button>`,
      )
      .join("")}</div>`;
  }

  function palettHtml(sp) {
    const n = N(sp);
    return `<div class="ls-palett" data-n="${n.farger}" role="group" aria-label="${esc(R.t("Knappene"))}">${KNAPPER.slice(0, n.farger)
      .map((k, f) => {
        const brukt = !n.like && sp.rad.includes(f);
        return `<button type="button" class="ls-velg" data-h="legg" data-v="${f}" aria-label="${esc(k.navn)}"${brukt ? " disabled" : ""}><span class="ls-tast" aria-hidden="true">${f + 1}</span>${knapp(f)}</button>`;
      })
      .join("")}</div>`;
  }

  const IKON = {
    slett: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6H9l-6 6 6 6h11z"/><path d="m12 10 4 4M16 10l-4 4"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
    las: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  };

  // ---------- Moves ----------

  function legg(S, f) {
    const sp = S.spill;
    if (!sp || las) return;
    const n = N(sp);
    if (!Number.isInteger(f) || f < 0 || f >= n.farger) return;
    if (!n.like && sp.rad.includes(f)) {
      R.toast(R.t("Hver farge bare én gang på lett."));
      return;
    }
    sp.rad[sp.valgt] = f;
    R.lyd.tone(420 + f * 60, 0, 0.07, "triangle", 0.07);
    R.vibrer(8);
    // On to the next empty slot (to the right, then from the start).
    const L = sp.rad.length;
    for (let k = 1; k <= L; k++) {
      const j = (sp.valgt + k) % L;
      if (sp.rad[j] == null) {
        sp.valgt = j;
        break;
      }
    }
    R.si(`${KNAPPER[f].navn}.`);
    R.vis();
  }

  function slett(S) {
    const sp = S.spill;
    if (!sp || las) return;
    // The chosen slot if it has a peg, else the last filled one.
    let i = sp.rad[sp.valgt] != null ? sp.valgt : sp.rad.map((f) => f != null).lastIndexOf(true);
    if (i < 0) return;
    sp.rad[i] = null;
    sp.valgt = i;
    R.lyd.tone(360, 0, 0.06, "triangle", 0.06, 300);
    R.vis();
  }

  function sjekk(S) {
    const sp = S.spill;
    if (!sp || las || sp.fase !== "gjett") return;
    const r = runde(sp);
    if (sp.rad.some((f) => f == null)) {
      R.toast(R.t("Fyll alle plassene først."));
      return;
    }
    const gjett = sp.rad.slice();
    const v = M.vurder(r.kode, gjett);
    r.gjett.push({ gjett, svart: v.svart, hvit: v.hvit });
    const L = N(sp).lengde;
    sp.rad = new Array(L).fill(null);
    sp.valgt = 0;
    if (v.svart === L) {
      r.ferdig = true;
      r.lost = true;
      R.lyd.riktig();
      R.vibrer([30, 50, 30, 50, 120]);
      return ferdigRunde(S);
    }
    if (r.gjett.length >= N(sp).forsok) {
      r.ferdig = true;
      R.lyd.tone(220, 0, 0.3, "triangle", 0.1, 160);
      return ferdigRunde(S);
    }
    R.lyd.tone(v.svart ? 700 : 520, 0, 0.09, "sine", 0.08);
    for (let k = 0; k < v.svart + v.hvit; k++) R.lyd.tone(880 + k * 90, 0.08 + k * 0.07, 0.06, "sine", 0.05);
    R.si(`${svarTekst(v.svart, v.hvit)}. ${R.t("{n} forsøk igjen.", { n: N(sp).forsok - r.gjett.length })}`);
    R.vis();
  }

  function brukHint(S) {
    const sp = S.spill;
    if (!sp || las || sp.fase !== "gjett") return;
    const r = runde(sp);
    if (r.hint <= 0) return R.toast(R.t("Du har brukt hintet i denne runden."));
    const k = M.hint(sp.niva, r.gjett, sp.fro + r.gjett.length * 7919 + sp.runde);
    if (!k) return;
    r.hint -= 1;
    sp.rad = k.slice();
    sp.valgt = 0;
    R.lyd.tone(990, 0, 0.12, "sine", 0.12);
    R.lyd.tone(1480, 0.1, 0.22, "sine", 0.1);
    R.toast(r.gjett.length ? R.t("Denne koden passer med alt låsen har sagt så langt.") : R.t("Et godt første forsøk – trykk Sjekk."));
    R.vis();
  }

  // A round is over: against the phone that is the game; two players go on to the next code.
  function ferdigRunde(S) {
    const sp = S.spill;
    const r = runde(sp);
    las = true;
    R.vis();
    const fortsatt = R.vakt();
    const brett = R.$(".ls-las");
    if (brett && !R.rolig()) brett.classList.add(r.lost ? "apen" : "laast");
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        if (!mot(sp) && sp.runde === 0) {
          sp.runde = 1;
          sp.fase = "mellom";
          return R.gaTil("mellom");
        }
        avslutt(S);
        R.gaTil("slutt");
      },
      R.rolig() ? 600 : 1300,
    );
  }

  // The score of one round: guesses used, or forsøk + 1 when the code held.
  const poengFor = (sp, r) => (r.lost ? r.gjett.length : N(sp).forsok + 1);

  function avslutt(S) {
    const sp = S.spill;
    sp.fase = "slutt";
    const r0 = sp.runder[0];
    if (mot(sp)) {
      const gml = S.rekord[sp.niva] || { beste: 0, antall: 0, spilt: 0 };
      const ny = { beste: gml.beste, antall: gml.antall + (r0.lost ? 1 : 0), spilt: gml.spilt + 1, sist: r0.lost ? r0.gjett.length : 0 };
      sp.resultat = { nyRekord: r0.lost && gml.beste > 0 && r0.gjett.length < gml.beste, forste: r0.lost && !gml.beste, gml: gml.beste };
      if (r0.lost) ny.beste = gml.beste ? Math.min(gml.beste, r0.gjett.length) : r0.gjett.length;
      S.rekord[sp.niva] = ny;
      if (r0.lost) R.merke("klassiker-lasesmeden");
    } else {
      const p = [0, 1].map((i) => poengFor(sp, sp.runder.find((r) => r.gjetter === i)));
      sp.resultat = { poeng: p, vinner: p[0] === p[1] ? null : p[0] < p[1] ? 0 : 1 };
      R.kveld.registrer([0, 1].map((i) => ({ i, poeng: sp.resultat.vinner === i ? 1 : 0 })));
    }
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.niva, forsok: r0.gjett.length, lost: !!r0.lost });
    R.lagre();
  }

  // ---------- Keyboard: 1–8 lay a peg, arrows choose a slot, Backspace takes one out, Enter checks ----------

  document.addEventListener("keydown", (e) => {
    const S = R.S;
    const sp = S && S.spill;
    if (!S || !sp || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    const skjerm = S.skjerm;
    if (skjerm !== "spill" && skjerm !== "lag") return;
    const el = e.target;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    const k = e.key;
    if (/^[1-8]$/.test(k)) {
      e.preventDefault();
      legg(S, Number(k) - 1);
    } else if (k === "Backspace" || k === "Delete") {
      e.preventDefault();
      slett(S);
    } else if ((k === "ArrowLeft" || k === "ArrowRight") && !(el && el.closest && el.closest(".ls-palett"))) {
      e.preventDefault();
      sp.valgt = (sp.valgt + (k === "ArrowLeft" ? sp.rad.length - 1 : 1)) % sp.rad.length;
      R.vis();
    } else if (k === "Enter" && !(el && el.closest && el.closest("button, a"))) {
      e.preventDefault();
      if (skjerm === "spill") sjekk(S);
      else H.laas(null, e, S);
    } else if ((k === "h" || k === "H") && skjerm === "spill") {
      e.preventDefault();
      brukHint(S);
    }
  });

  // ---------- Screens ----------

  function gyldigSpill(sp) {
    if (!sp || typeof sp !== "object" || !["mobil", "to"].includes(sp.modus) || !NIVAER.includes(sp.niva)) return false;
    const n = M.niva(sp.niva);
    if (!Array.isArray(sp.runder) || sp.runder.length !== (sp.modus === "mobil" ? 1 : 2)) return false;
    for (const r of sp.runder) {
      if (!r || ![0, 1].includes(r.gjetter) || ![0, 1].includes(r.lager) || !Array.isArray(r.gjett)) return false;
      if (r.kode != null && !M.gyldig(sp.niva, r.kode)) return false;
      if (!r.gjett.every((g) => g && Array.isArray(g.gjett) && g.gjett.length === n.lengde && g.gjett.every((f) => Number.isInteger(f) && f >= 0 && f < n.farger))) return false;
      if (r.kode) for (const g of r.gjett) Object.assign(g, M.vurder(r.kode, g.gjett));
      r.hint = R.klamp(Number(r.hint) || 0, 0, HINT);
      r.lost = !!r.lost;
      r.ferdig = !!r.ferdig;
    }
    if (![0, 1].includes(sp.runde) || sp.runde >= sp.runder.length) return false;
    if (!Array.isArray(sp.rad) || sp.rad.length !== n.lengde) sp.rad = new Array(n.lengde).fill(null);
    sp.rad = sp.rad.map((f) => (Number.isInteger(f) && f >= 0 && f < n.farger ? f : null));
    sp.valgt = R.klamp(Number(sp.valgt) || 0, 0, n.lengde - 1);
    if (!["lag", "gjett", "mellom", "slutt"].includes(sp.fase)) sp.fase = "gjett";
    if (sp.fase === "gjett" && !runde(sp).kode) sp.fase = "lag";
    if (sp.fase === "slutt" && !sp.resultat) return false;
    return true;
  }

  const hvemTekst = (sp) => (mot(sp) ? R.t("Du mot mobilen") : R.t("{a} mot {b}", { a: R.navn(0), b: R.navn(1) }));
  const rekordLinje = (S) => {
    const rader = NIVAER.filter((n) => S.rekord[n] && S.rekord[n].spilt).map((n) => {
      const r = S.rekord[n];
      return `<li><b>${esc(NIVANAVN[n])}</b> ${r.beste ? esc(R.t("rekord {n}", { n: r.beste })) : "–"}<small> · ${esc(r.sist ? R.t("sist {n}", { n: r.sist }) : R.t("sist ikke knekt"))}</small></li>`;
    });
    return rader.length ? `<section class="ls-rekorder" aria-label="${esc(R.t("Dine rekorder mot mobilen"))}"><p class="etikett">${esc(R.t("Forsøk mot mobilen"))}</p><ul>${rader.join("")}</ul></section>` : "";
  };

  R.start({
    id: "lasesmeden",
    versjon: 1,
    pagar: (S) => iGang(S),

    tilstand: () => ({
      oppsett: { modus: "mobil", niva: 2, starter: 0 },
      rekord: {},
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, starter: 0 }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      o.starter = o.starter === 1 ? 1 : 0;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      for (const k of Object.keys(S.rekord)) {
        const r = S.rekord[k];
        if (!NIVAER.includes(Number(k)) || !r || typeof r !== "object") delete S.rekord[k];
        else {
          r.beste = Math.max(0, Math.floor(Number(r.beste) || 0));
          r.antall = Math.max(0, Math.floor(Number(r.antall) || 0));
          r.spilt = Math.max(r.antall, Math.floor(Number(r.spilt) || 0));
          r.sist = Math.max(0, Math.floor(Number(r.sist) || 0));
        }
      }
      if (S.spill && !gyldigSpill(S.spill)) S.spill = null;
      const sp = S.spill;
      if (!sp && ["spill", "lag", "gi", "mellom", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (sp && sp.fase !== "slutt" && S.skjerm === "slutt") S.skjerm = "hjem";
      if (sp && sp.fase === "slutt" && ["spill", "lag", "gi", "mellom"].includes(S.skjerm)) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Knekk fargekoden! Låsen har en hemmelig rekke med knapper. Etter hvert forsøk forteller den hvor nær du er."),
      steg: [
        [R.t("Legg en rekke"), R.t("Trykk på knappene nederst for å fylle raden, og trykk Sjekk. Hver knapp har sin egen farge og sin egen form.")],
        [R.t("Les svaret"), R.t("En fylt prikk betyr riktig knapp på riktig plass. En ring betyr riktig knapp, men på feil plass. Prikkene sier ikke hvilke knapper det gjelder.")],
        [R.t("Knekk koden"), R.t("Bruk svarene til å snevre inn. Får du alle prikkene fylt før forsøkene er brukt opp, har du knekt låsen.")],
      ],
      tips: [
        R.t("Mot mobilen lager mobilen koden. To spillere lager hver sin kode til hverandre – den som bruker færrest forsøk, vinner."),
        R.t("På lett er alle knappene i koden forskjellige. På middels og vanskelig kan samme knapp komme flere ganger."),
        R.t("Bytt ut én eller to knapper om gangen, så ser du hva som gjorde forskjellen."),
        R.t("Hintet fyller raden med en kode som passer med alt låsen har sagt så langt."),
        R.t("Med tastatur: tallene 1–8 legger en knapp, piltastene velger plass, Backspace tar den bort og Enter sjekker."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const pagar = iGang(S);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Én hemmelig kode. Ti forsøk."))}<br><em>${esc(R.t("Prikkene sier hvor nær du er."))}</em>`,
              knapperHtml:
                R.ui.startKnapper({
                  pagar,
                  fortsettTekst: pagar ? R.t("Fortsett · {hvem}", { hvem: hvemTekst(sp) }) : "",
                  startTekst: S.oppsett.modus === "mobil" ? R.t("Knekk koden · {niva}", { niva: NIVANAVN_LITEN[S.oppsett.niva] }) : R.t("Start spill"),
                }) + R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "oppsett"), R.ui.lenke(R.t("Slik spiller du"), "regler")),
              merker: [
                ["1–2", R.t("spillere")],
                ["8", R.t("farger og former")],
                ["3", R.t("nivåer")],
              ],
            }) + rekordLinje(S)
          );
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const motM = o.modus === "mobil";
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan vil du spille?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🔐", tittel: R.t("Mot mobilen"), tekst: R.t("Mobilen lager koden") },
                  { v: "to", ikon: "👥", tittel: R.t("To spillere"), tekst: R.t("Lag koder til hverandre") },
                ],
                o.modus,
              )}
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor vanskelig?"))}</h2>
              ${R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), o.niva, { etikett: R.t("Nivå") })}
              <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
              <div class="ls-eksempel" aria-hidden="true">${KNAPPER.slice(0, M.niva(o.niva).farger).map((k, f) => knapp(f)).join("")}</div>
            </section>
            ${
              motM
                ? ""
                : `${R.ui.spillere({ min: 2, max: 2, tittel: R.t("Spillerne") })}
                  <section class="seksjon">
                    <h2>${esc(R.t("Hvem lager den første koden?"))}</h2>
                    ${R.ui.seg("starter", [[0, R.kutt(R.navn(0), 14)], [1, R.kutt(R.navn(1), 14)]], o.starter, { etikett: R.t("Hvem lager den første koden?") })}
                  </section>`
            }
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      // «Gi mobilen til …»: the code maker first, then the one who guesses.
      gi: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = runde(sp);
          const lage = sp.fase === "lag";
          const i = lage ? r.lager : r.gjetter;
          return R.ui.giTil({
            i,
            h: "jeg-er",
            tekst: lage ? R.t("Lag en hemmelig kode – gi mobilen til") : R.t("Knekk koden – gi mobilen til"),
            advarsel: lage ? R.t("{navn} ser bort", { navn: R.navn(r.gjetter) }) : "",
            ikon: lage ? "🙈" : "",
            prikker: [2, sp.runde],
          });
        },
      },

      // The code maker builds the secret.
      lag: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = runde(sp);
          const fylt = sp.rad.every((f) => f != null);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Lag koden, {navn}", { navn: R.navn(r.lager) }))}</h1>
            <p class="ingress">${esc(R.t("Velg {n} knapper. {navn} skal prøve å knekke koden.", { n: N(sp).lengde, navn: R.navn(r.gjetter) }))}</p>
            <div class="ls-lag">
              <div class="ls-las lukket">${IKON.las}</div>
              ${radHtml(sp, "plass")}
              ${palettHtml(sp)}
            </div>
            ${R.ui.dokk(
              `<div class="ls-handling">${R.ui.knapp2(R.t("Slett"), "slett", { ikon: IKON.slett })}${R.ui.knapp(R.t("Lås koden"), "laas", { av: !fylt })}</div>`,
            )}`;
        },
      },

      spill: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = S.spill;
          const r = runde(sp);
          const n = N(sp);
          const igjen = n.forsok - r.gjett.length;
          const slutt = r.ferdig;
          const fylt = sp.rad.every((f) => f != null);
          const hvem = mot(sp) ? "" : `<p class="ls-hvem">${esc(R.t("{navn} knekker koden", { navn: R.navn(r.gjetter) }))}</p>`;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Knekk koden"))}</h1>
            <div class="ls-spill" style="--n:${n.lengde}">
              <div class="ls-topp">
                ${hvem}
                <div class="ls-las${slutt ? (r.lost ? " apen" : " laast") : ""}" role="img" aria-label="${esc(slutt ? R.t("Koden var: {kode}", { kode: kodeNavn(r.kode) }) : R.t("Den hemmelige koden"))}">
                  <span class="ls-lasikon" aria-hidden="true">${IKON.las}</span>
                  <span class="ls-knapper">${r.kode.map((f) => (slutt ? knapp(f) : '<span class="ls-skjult" aria-hidden="true">?</span>')).join("")}</span>
                </div>
                <p class="ls-status" role="status">${esc(slutt ? (r.lost ? R.t("Knekt på {n} forsøk!", { n: r.gjett.length }) : R.t("Låsen holdt.")) : R.t("{n} forsøk igjen", { n: igjen }))}</p>
              </div>
              <ol class="ls-historikk" aria-label="${esc(R.t("Forsøkene dine"))}">${historikkHtml(sp)}</ol>
              <div class="ls-nede">
                ${slutt ? "" : radHtml(sp, "plass")}
                ${slutt ? "" : palettHtml(sp)}
                ${R.ui.dokk(
                  slutt
                    ? ""
                    : `<div class="ls-handling">
                        <button type="button" class="ls-verk" data-h="slett" data-stille aria-label="${esc(R.t("Slett"))}"${sp.rad.some((f) => f != null) ? "" : " disabled"}>${IKON.slett}<span>${esc(R.t("Slett"))}</span></button>
                        ${R.ui.knapp(R.t("Sjekk"), "sjekk", { av: !fylt, id: "ls-sjekk" })}
                        <button type="button" class="ls-verk" data-h="hint" data-stille${r.hint > 0 ? "" : " disabled"} aria-label="${esc(R.t("Hint, {n} igjen", { n: r.hint }))}">${IKON.hint}<span>${esc(R.t("Hint"))}</span></button>
                      </div>`,
                )}
              </div>
            </div>`;
        },
        etter(S, rot) {
          // The newest guess in view (the list scrolls on short screens).
          const liste = R.$(".ls-historikk", rot);
          if (liste) liste.scrollTop = liste.scrollHeight;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || sp.fase !== "gjett") return R.gaTil(nesteSkjerm(S));
          las = false;
          document.documentElement.classList.add("ls-fast");
          R.holdVaken();
        },
        ut() {
          document.documentElement.classList.remove("ls-fast");
          R.slippVaken();
        },
      },

      // Between the two rounds of two players: what happened, then the swap.
      mellom: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r0 = sp.runder[0];
          return `
            ${R.ui.banner({ etikett: R.t("Runde 1 av 2"), tittel: r0.lost ? R.t("{navn} knekte koden!", { navn: R.navn(r0.gjetter) }) : R.t("Låsen holdt!"), tekst: r0.lost ? R.t("{n} forsøk. Nå er det {navn} sin tur til å knekke.", { n: r0.gjett.length, navn: R.navn(sp.runder[1].gjetter) }) : R.t("Nå er det {navn} sin tur til å knekke.", { navn: R.navn(sp.runder[1].gjetter) }), stemning: r0.lost ? "jubel" : "" })}
            <div class="ls-fasit"><p class="etikett">${esc(R.t("Koden var"))}</p><span class="ls-knapper">${r0.kode.map((f) => knapp(f)).join("")}</span><span class="vh">${esc(kodeNavn(r0.kode))}</span></div>
            ${R.ui.dokk(R.ui.knapp(R.t("Neste runde"), "neste"))}`;
        },
      },

      slutt: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const dokk = R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), mot(sp) && sp.runder[0].lost ? R.ui.knapp2(R.t("Del resultatet"), "del") : "", R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "oppsett"), alle));
          if (mot(sp)) {
            const r = sp.runder[0];
            const res = sp.resultat || {};
            const linje = r.lost
              ? res.nyRekord
                ? R.t("Ny rekord på {niva}! Forrige: {n} forsøk.", { niva: NIVANAVN_LITEN[sp.niva], n: res.gml })
                : res.forste
                  ? R.t("Første knekte kode på {niva} – nå har du en rekord å slå.", { niva: NIVANAVN_LITEN[sp.niva] })
                  : R.t("Rekorden din på {niva}: {n} forsøk.", { niva: NIVANAVN_LITEN[sp.niva], n: S.rekord[sp.niva].beste })
              : R.t("Ingen fare – en ny kode venter, og hvert forsøk lærer deg noe.");
            return `
              ${R.ui.banner({ etikett: `${R.t("Du mot mobilen")} · ${NIVANAVN_LITEN[sp.niva]}`, tittel: r.lost ? R.t("Koden er knekt!") : R.t("Låsen holdt"), tekst: r.lost ? R.t("{n} av {alle} forsøk", { n: r.gjett.length, alle: N(sp).forsok }) : "", stemning: r.lost ? "jubel" : "lei" })}
              <div class="ls-fasit"><p class="etikett">${esc(R.t("Koden var"))}</p><span class="ls-knapper">${r.kode.map((f) => knapp(f)).join("")}</span><span class="vh">${esc(kodeNavn(r.kode))}</span></div>
              <p class="hjelp">${esc(linje)}</p>
              <ol class="ls-historikk ls-kort" aria-label="${esc(R.t("Forsøkene dine"))}">${historikkHtml(Object.assign({}, sp, { runde: 0 }))}</ol>
              ${R.ui.flereSpill({ antall: 1 })}
              ${dokk}`;
          }
          const res = sp.resultat;
          const tabell = [0, 1]
            .map((i) => {
              const r = sp.runder.find((x) => x.gjetter === i);
              return `<li class="${res.vinner === i ? "vinner" : ""}">${R.avatar(i)}<span class="navn">${esc(R.navn(i))}</span><b>${esc(r.lost ? R.t("{n} forsøk", { n: r.gjett.length }) : R.t("ikke knekt"))}</b></li>`;
            })
            .join("");
          return `
            ${R.ui.banner({ etikett: R.t("Kåringen"), tittel: res.vinner == null ? R.t("Uavgjort!") : R.t("{navn} vinner!", { navn: R.navn(res.vinner) }), tekst: res.vinner == null ? R.t("Like mange forsøk – dere er like gode låsesmeder.") : R.t("Færrest forsøk på å knekke koden."), stemning: res.vinner == null ? "" : "jubel" })}
            <ul class="ls-tabell">${tabell}</ul>
            ${R.ui.flereSpill({ antall: 2 })}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || sp.fase !== "slutt") return R.gaTil(nesteSkjerm(S));
          const vant = mot(sp) ? sp.runder[0].lost : sp.resultat.vinner != null;
          if (vant) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.pling();
          }
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S), S.oppsett.modus === "mobil")) || !fortsatt()) return;
        nyttSpill(S);
        R.gaTil(nesteSkjerm(S));
      },
      fortsett: (el, e, S) => R.gaTil(nesteSkjerm(S)),
      oppsett: () => R.gaTil("oppsett"),
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "to" ? "to" : "mobil";
        R.vis();
      },
      niva(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.niva = NIVAER.includes(n) ? n : 2;
        R.vis();
      },
      starter(el, e, S) {
        S.oppsett.starter = el.dataset.v === "1" ? 1 : 0;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S), S.oppsett.modus === "mobil")) || !fortsatt()) return;
        nyttSpill(S);
        R.gaTil(nesteSkjerm(S));
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil(nesteSkjerm(S));
      },
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.gaTil(sp.fase === "lag" ? "lag" : "spill");
      },
      plass(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!sp || las || !(i >= 0 && i < sp.rad.length)) return;
        // A tap on the chosen slot takes its peg out; on another slot it chooses that one.
        if (i === sp.valgt && sp.rad[i] != null) {
          sp.rad[i] = null;
          R.lyd.tone(360, 0, 0.06, "triangle", 0.06, 300);
        } else sp.valgt = i;
        R.vis();
      },
      legg: (el, e, S) => legg(S, Number(el.dataset.v)),
      slett: (el, e, S) => slett(S),
      sjekk: (el, e, S) => sjekk(S),
      hint: (el, e, S) => brukHint(S),
      laas(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "lag") return;
        if (sp.rad.some((f) => f == null)) return R.toast(R.t("Fyll alle plassene først."));
        runde(sp).kode = sp.rad.slice();
        sp.rad = new Array(N(sp).lengde).fill(null);
        sp.valgt = 0;
        sp.fase = "gjett";
        R.lyd.tone(300, 0, 0.12, "square", 0.06);
        R.lyd.tone(200, 0.1, 0.18, "square", 0.06);
        R.vibrer([20, 40, 20]);
        R.gaTil("gi");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "mellom") return;
        sp.fase = "lag";
        R.gaTil("gi");
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !mot(sp) || !sp.runder[0].lost) return;
        const r = sp.runder[0];
        const L = N(sp).lengde;
        // The lock's answers only (filled pins and rings) – never the pegs.
        const rader = r.gjett.map((g) => "●".repeat(g.svart) + "○".repeat(g.hvit) + "·".repeat(L - g.svart - g.hvit));
        const hode = R.t("{navn} · {niva} · knekt på {n} av {alle}", { navn: NAVN(), niva: NIVANAVN_LITEN[sp.niva], n: r.gjett.length, alle: N(sp).forsok });
        R.del(R.t("{navn} – knekk fargekoden", { navn: NAVN() }), `🔐 ${hode}\n\n${rader.join("\n")}\n\n${R.t("Klarer du å knekke en kode på færre forsøk?")}`, ADRESSE, {
          kort: { tittel: NAVN(), linjer: [R.t("{n} forsøk", { n: r.gjett.length }), NIVANAVN[sp.niva], ...rader.slice(-6)] },
        });
      },
    }),
  });

  window.Lasesmeden = motor;
})();
