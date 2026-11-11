/* Blyanten — «Minikryss»: small crosswords made for a phone.
   A generator lays 6–10 words from a theme into a free-form crossing grid (every word crosses
   another, letters only touch where words cross) and numbers the clues the usual way: row by row,
   a number on every cell where a word starts. The same day gives the same crossword on every phone
   (R.dag + a fixed seed); «Flere kryss» makes new ones by theme and level.
   The player types on an on-screen keyboard: tap a cell (twice to switch direction), tap the clue
   bar for all clues. While solving, the grid and the clue bar are redrawn in place (never R.vis),
   so quick typing is never caught by the kit's ghost-tap guard. The result of a check stands in
   the clue bar for a moment (never in a toast on top of the grid). The day's result is shared as
   a row of pencils, one per word (never the answers). */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const TEMAER = window.RUSJ_DATA.temaer.temaer;
  const tema = (id) => TEMAER.find((t) => t.id === id);
  const ANTALL_ORD = new Set(TEMAER.flatMap((t) => t.ord.map(([o]) => o))).size;
  const NIVA = {
    lett: { navn: "Lett", antall: 6, maksOrd: 6, maksB: 8, maksH: 8, tekst: "6 korte ord\u00a0– fint for barn og nybegynnere" },
    middels: { navn: "Middels", antall: 8, maksOrd: 8, maksB: 9, maksH: 9, tekst: "8 ord\u00a0– like stort som dagens kryss" },
    vanskelig: { navn: "Vanskelig", antall: 10, maksOrd: 9, maksB: 10, maksH: 10, tekst: "10 ord, også lange\u00a0– for kryssordeksperter" },
  };
  const DAGENS_NIVA = "middels";
  const FORSTE_DAG = R.dag(new Date(Date.UTC(2026, 10, 9, 12))).nr; // the first «Dagens kryss»
  // FROZEN daily plan (data/dagens.json): the theme of each day and how many words of each theme
  // the dailies may use. Never reorder or shrink it – new days, themes and words only go at the end,
  // and a word that must go is replaced in place – or today's and later crosswords change. The
  // generator below is part of the frozen recipe too: changing it changes every daily.
  const PLAN = window.RUSJ_DATA.dagens;
  const RADER = ["qwertyuiopå", "asdfghjkløæ", "zxcvbnm"];
  const BOKSTAV = /^[a-zæøå]$/;
  const RETNING = { v: "vannrett", l: "loddrett" };
  const PIL = { v: "→", l: "↓" };
  const SLETT_IKON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/></svg>';
  const FLERE = { antall: 1 }; // the kit titles it «Flere spill du kan spille alene»
  const DEL_URL = "https://rusj.no/blyanten/";
  // «Flere kryss» shows a handful of themes first; the rest are one tap away.
  const UTVALGTE = ["garden", "skogsdyr", "mat", "hjemme", "sport", "musikk", "naturen", "eventyr"];

  let H; // the actions
  let nyFeiring = false; // celebrate once on the result screen right after solving
  let ferdigNa = false; // the solved animation is running: keys wait
  let klokke = null; // the timer on the crossword screen
  let sistTikk = 0;
  let tikkTeller = 0;
  let tikker = null; // countdown to tomorrow's crossword
  let varsel = null; // a short message in the clue bar: { tekst, type ("feil", "rett" or "") }
  let varselId = null;
  let alleTemaer = false; // the setup screen shows every theme

  const bokstaver = (o) => Array.from(String(o || ""));
  const stor = (o) => String(o).toLocaleUpperCase("nb");
  const iDag = () => R.dag().nr;
  const nrFor = (dag) => dag - FORSTE_DAG + 1; // «Blyanten nr. 1» is the first daily

  // ---------- The generator ----------
  // Words are tried in a random order; each one is placed where it crosses the most letters and
  // keeps the grid small and square. 60 attempts, the best grid wins. Everything random comes from
  // the seed, so the same seed gives the same crossword on every phone.

  // antallOrd: use only the first words of the theme (the frozen dailies); all words if left out.
  function lagKryss(temaId, nivaId, fro, antallOrd) {
    const t = tema(temaId);
    const N = NIVA[nivaId];
    if (!t || !N) return null;
    const rng = R.rng(fro >>> 0);
    const pool = t.ord
      .slice(0, antallOrd > 0 ? antallOrd : t.ord.length)
      .map(([o, hint]) => ({ o, hint, b: bokstaver(o) }))
      .filter((w) => w.b.length <= N.maksOrd);
    let best = null;
    for (let n = 0; n < 60 || (!best && n < 400); n++) {
      const k = provKryss(pool, N, rng);
      if (k && (!best || k.poeng > best.poeng)) best = k;
    }
    return best ? ferdigKryss(best, temaId, nivaId) : null;
  }

  function provKryss(pool, N, rng) {
    const kand = R.stokk(pool, rng);
    const lang = Math.min(N.maksOrd, N.maksB);
    const s = kand.findIndex((w) => w.b.length >= Math.min(6, lang) && w.b.length <= lang);
    if (s < 0) return null;
    const forste = kand.splice(s, 1)[0];
    const celler = new Map(); // "x,y" → { b: letter, v: across word here, l: down word here }
    const plassert = [];
    const boks = { x0: 0, y0: 0, x1: 0, y1: 0 };
    legg(celler, plassert, boks, forste, 0, 0, "v");
    let kryss = 0;
    for (const w of kand) {
      if (plassert.length >= N.antall) break;
      let best = null;
      for (const p of plasseringer(celler, boks, w, N)) {
        p.poeng = p.kryss * 10 - p.areal * 0.4 - Math.abs(p.bredde - p.hoyde) * 1.2 + rng() * 3;
        if (!best || p.poeng > best.poeng) best = p;
      }
      if (!best) continue;
      legg(celler, plassert, boks, w, best.x, best.y, best.r);
      kryss += best.kryss;
    }
    if (plassert.length < N.antall) return null;
    const b = boks.x1 - boks.x0 + 1;
    const h = boks.y1 - boks.y0 + 1;
    return { plassert, boks, kryss, poeng: kryss * 8 - b * h * 0.5 - Math.abs(b - h) * 2 + rng() * 2 };
  }

  // Every place the word can cross a letter already in the grid.
  function plasseringer(celler, boks, w, N) {
    const ut = [];
    const n = w.b.length;
    for (const [nokkel, c] of celler) {
      const komma = nokkel.indexOf(",");
      const cx = Number(nokkel.slice(0, komma));
      const cy = Number(nokkel.slice(komma + 1));
      for (let i = 0; i < n; i++) {
        if (w.b[i] !== c.b) continue;
        for (const r of ["v", "l"]) {
          if (c[r]) continue; // a word in this direction already runs through here
          const x = r === "v" ? cx - i : cx;
          const y = r === "l" ? cy - i : cy;
          const kryssinger = passer(celler, w, x, y, r);
          if (!kryssinger) continue;
          const x0 = Math.min(boks.x0, x);
          const y0 = Math.min(boks.y0, y);
          const x1 = Math.max(boks.x1, r === "v" ? x + n - 1 : x);
          const y1 = Math.max(boks.y1, r === "l" ? y + n - 1 : y);
          const bredde = x1 - x0 + 1;
          const hoyde = y1 - y0 + 1;
          if (bredde > N.maksB || hoyde > N.maksH) continue;
          ut.push({ x, y, r, kryss: kryssinger, areal: bredde * hoyde, bredde, hoyde });
        }
      }
    }
    return ut;
  }

  // The number of crossings if the word fits here, else 0. New letters may not touch other
  // letters from the side, and nothing may sit right before or after the word.
  function passer(celler, w, x, y, r) {
    const dx = r === "v" ? 1 : 0;
    const dy = 1 - dx;
    const n = w.b.length;
    const har = (cx, cy) => celler.get(cx + "," + cy);
    if (har(x - dx, y - dy) || har(x + n * dx, y + n * dy)) return 0;
    let kryss = 0;
    for (let i = 0; i < n; i++) {
      const cx = x + i * dx;
      const cy = y + i * dy;
      const c = har(cx, cy);
      if (c) {
        if (c.b !== w.b[i] || c[r]) return 0;
        kryss++;
      } else if (har(cx + dy, cy + dx) || har(cx - dy, cy - dx)) return 0;
    }
    return kryss < n ? kryss : 0;
  }

  function legg(celler, plassert, boks, w, x, y, r) {
    const dx = r === "v" ? 1 : 0;
    const dy = 1 - dx;
    w.b.forEach((b, i) => {
      const k = x + i * dx + "," + (y + i * dy);
      const c = celler.get(k) || { b, v: false, l: false };
      c[r] = true;
      celler.set(k, c);
    });
    plassert.push({ w, x, y, r });
    boks.x0 = Math.min(boks.x0, x);
    boks.y0 = Math.min(boks.y0, y);
    boks.x1 = Math.max(boks.x1, x + (w.b.length - 1) * dx);
    boks.y1 = Math.max(boks.y1, y + (w.b.length - 1) * dy);
  }

  // Coordinates from 0, numbers row by row, across clues first.
  function ferdigKryss(k, temaId, nivaId) {
    const { x0, y0, x1, y1 } = k.boks;
    const b = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const ord = k.plassert.map((p) => ({ o: p.w.o, hint: p.w.hint, x: p.x - x0, y: p.y - y0, r: p.r, nr: 0 }));
    const starter = [...new Set(ord.map((w) => w.y * b + w.x))].sort((a, c) => a - c);
    ord.forEach((w) => (w.nr = starter.indexOf(w.y * b + w.x) + 1));
    ord.sort((a, c) => (a.r === c.r ? a.nr - c.nr : a.r === "v" ? -1 : 1));
    return { tema: temaId, niva: nivaId, b, h, ord };
  }

  function dagensKryss(nr) {
    const plan = PLAN.temaer;
    const n = plan.length;
    for (let i = 0; i < n; i++) {
      const id = plan[(((nr - FORSTE_DAG + i) % n) + n) % n];
      const k = lagKryss(id, DAGENS_NIVA, R.hash(`blyanten:${nr}:${i}`), PLAN.ordAntall[id]);
      if (k) return k;
    }
    return null;
  }

  function nyttFriKryss(S) {
    const valgte = S.oppsett.temaer.filter((id) => tema(id));
    const liste = valgte.length ? valgte : TEMAER.map((t) => t.id);
    const forst = R.stokk(liste.length > 1 ? liste.filter((id) => id !== S.sistTema) : liste);
    for (const id of forst.concat(R.stokk(TEMAER.map((t) => t.id)))) {
      const k = lagKryss(id, S.oppsett.niva, R.nyttFro());
      if (k) {
        S.sistTema = id;
        return k;
      }
    }
    return null;
  }

  // ---------- The crossword in play ----------

  const INFO = new WeakMap();
  const cellerI = (k, w) => bokstaver(w.o).map((_, i) => (w.y + (w.r === "l" ? i : 0)) * k.b + w.x + (w.r === "v" ? i : 0));
  // Per cell: the letter, the across and down word (index into k.ord, −1 = none) and its number.
  function info(k) {
    if (INFO.has(k)) return INFO.get(k);
    const celler = Array(k.b * k.h).fill(null);
    k.ord.forEach((w, wi) => {
      const b = bokstaver(w.o);
      cellerI(k, w).forEach((c, i) => {
        celler[c] = celler[c] || { b: b[i], v: -1, l: -1, nr: 0 };
        celler[c][w.r] = wi;
      });
    });
    k.ord.forEach((w) => (celler[w.y * k.b + w.x].nr = w.nr));
    INFO.set(k, celler);
    return celler;
  }

  const aktiv = (S) => (S.modus === "fri" ? S.fri : S.dag);
  const harBokstaver = (sp) => sp.fylt.some(Boolean);
  const iGang = (sp) => !!(sp && !sp.ferdig);
  const dagenIGang = (S) => iGang(S.dag) && S.dag.nr === iDag() && (harBokstaver(S.dag) || S.dag.tid > 0);
  const pagar = (S) => dagenIGang(S) || iGang(S.fri);

  function nyttSpill(kryss, ekstra) {
    const forste = kryss.ord[0];
    return Object.assign(
      {
        kryss,
        fylt: Array(kryss.b * kryss.h).fill(""),
        vist: [], // revealed with help (fixed)
        feil: [], // marked wrong by a check (until changed)
        rett: [], // confirmed right by a check
        valgt: { c: forste.y * kryss.b + forste.x, r: forste.r },
        tid: 0,
        hjelp: 0,
        ferdig: false,
        gaOpp: false,
        nestenVist: false,
      },
      ekstra,
    );
  }

  function valgtOrd(sp) {
    const ci = info(sp.kryss)[sp.valgt.c];
    if (!ci) return 0;
    return ci[sp.valgt.r] >= 0 ? ci[sp.valgt.r] : ci[sp.valgt.r === "v" ? "l" : "v"];
  }

  function velgCelle(sp, c, r) {
    const ci = info(sp.kryss)[c];
    if (!ci) return;
    sp.valgt = { c, r: ci[r] >= 0 ? r : r === "v" ? "l" : "v" };
  }

  function velgOrd(sp, wi) {
    const k = sp.kryss;
    const w = k.ord[wi];
    const cs = cellerI(k, w);
    const tom = cs.find((c) => !sp.fylt[c]);
    sp.valgt = { c: tom != null ? tom : cs[0], r: w.r };
  }

  const ordFylt = (sp, wi) => cellerI(sp.kryss, sp.kryss.ord[wi]).every((c) => sp.fylt[c]);

  // After a letter in an empty cell: the next empty cell in the word, else the next word with room.
  function videre(sp) {
    const k = sp.kryss;
    const wi = valgtOrd(sp);
    const cs = cellerI(k, k.ord[wi]);
    const pos = cs.indexOf(sp.valgt.c);
    const tom = cs.slice(pos + 1).find((c) => !sp.fylt[c]) ?? cs.slice(0, pos).find((c) => !sp.fylt[c]);
    if (tom != null) return velgCelle(sp, tom, k.ord[wi].r);
    for (let n = 1; n < k.ord.length; n++) {
      const neste = (wi + n) % k.ord.length;
      if (!ordFylt(sp, neste)) return velgOrd(sp, neste);
    }
  }

  // ---------- Markup ----------

  function cellEtikett(k, c, sp) {
    const x = c % k.b;
    const y = Math.floor(c / k.b);
    const b = sp.fylt[c];
    return `Rad ${y + 1}, kolonne ${x + 1}: ${b ? stor(b) : "tom"}`;
  }

  function rutenettHtml(sp, o = {}) {
    const k = sp.kryss;
    const I = info(k);
    const wi = o.statisk ? -1 : valgtOrd(sp);
    const iOrd = new Set(wi >= 0 ? cellerI(k, k.ord[wi]) : []);
    const vist = new Set(sp.vist);
    const feil = new Set(sp.feil);
    const rett = new Set(sp.rett);
    let html = "";
    for (let c = 0; c < k.b * k.h; c++) {
      const ci = I[c];
      if (!ci) {
        html += '<span class="bly-tom" aria-hidden="true"></span>';
        continue;
      }
      const b = o.losning ? ci.b : sp.fylt[c];
      const kl = ["bly-celle"];
      if (!o.statisk && c === sp.valgt.c) kl.push("aktiv");
      else if (iOrd.has(c)) kl.push("ord");
      if (vist.has(c)) kl.push("vist");
      else if (feil.has(c) && b) kl.push("feil");
      else if (rett.has(c)) kl.push("rett");
      const nr = ci.nr ? `<span class="bly-nr" aria-hidden="true">${ci.nr}</span>` : "";
      const bolge = (c % k.b) + Math.floor(c / k.b); // diagonal order for the solved wave
      html += o.statisk
        ? `<span class="${kl.join(" ")}" style="--n:${bolge}">${nr}<span class="bly-b">${esc(b || "")}</span></span>`
        : `<button class="${kl.join(" ")}" data-h="celle" data-v="${c}" data-stille style="--n:${bolge}" aria-label="${esc(cellEtikett(k, c, sp))}">${nr}<span class="bly-b">${esc(b || "")}</span></button>`;
    }
    return html;
  }

  const rutenett = (sp, o = {}) =>
    `<div class="bly-rutenett${o.statisk ? " statisk" : ""}" style="--b:${sp.kryss.b}; --h:${sp.kryss.h}"${o.statisk ? ` role="img" aria-label="${esc(o.etikett || "Krysset")}"` : ' role="group" aria-label="Krysset"'}>${rutenettHtml(sp, o)}</div>`;

  function hintlinjeHtml(sp) {
    const w = sp.kryss.ord[valgtOrd(sp)];
    // A short message (the result of a check) takes the clue's place for a moment.
    const tegn = varsel && varsel.type ? `<span class="bly-varsel-tegn" aria-hidden="true">${varsel.type === "feil" ? "✗" : "✓"}</span>` : "";
    const midt = varsel
      ? `<button class="bly-hint bly-varsel ${varsel.type}" data-h="hintliste" aria-label="${esc(`${varsel.tekst}. Trykk for alle stikkord`)}">${tegn}<span class="bly-hint-tekst">${esc(varsel.tekst)}</span></button>`
      : `<button class="bly-hint" data-h="hintliste" aria-label="${esc(`${w.nr} ${RETNING[w.r]}: ${w.hint}. Trykk for alle stikkord`)}">
        <span class="bly-hint-nr">${w.nr}<i>${PIL[w.r]}</i></span><span class="bly-hint-tekst">${esc(w.hint)}</span>
      </button>`;
    return `<div class="bly-hintlinje">
      <button class="bly-pil" data-h="forrige" data-stille aria-label="Forrige stikkord">‹</button>
      ${midt}
      <button class="bly-pil" data-h="neste" data-stille aria-label="Neste stikkord">›</button>
    </div>`;
  }

  function tastaturHtml() {
    const tast = (b) => `<button class="bly-tast" data-h="tast" data-v="${b}" data-stille aria-label="${stor(b)}">${esc(b)}</button>`;
    return `<div class="bly-tastatur" role="group" aria-label="Tastatur">
      <div class="bly-tastrad">${bokstaver(RADER[0]).map(tast).join("")}</div>
      <div class="bly-tastrad">${bokstaver(RADER[1]).map(tast).join("")}</div>
      <div class="bly-tastrad">${bokstaver(RADER[2]).map(tast).join("")}<button class="bly-tast bred" data-h="tast" data-v="slett" data-stille aria-label="Slett">${SLETT_IKON}</button></div>
    </div>`;
  }

  function hintlisteArk(sp) {
    const k = sp.kryss;
    const na = valgtOrd(sp);
    const liste = (r) =>
      `<ol class="bly-hintliste">${k.ord
        .map((w, wi) => (w.r !== r ? "" : `<li><button class="bly-hintvalg${wi === na ? " na" : ""}${ordFylt(sp, wi) ? " fylt" : ""}" data-h="velg-ord" data-v="${wi}"><b>${w.nr}</b><span>${esc(w.hint)}</span><small>${bokstaver(w.o).length}</small></button></li>`))
        .join("")}</ol>`;
    return `
      <h2 id="ark-tittel">Alle stikkord</h2>
      <h3 class="bly-h3">Vannrett ${PIL.v}</h3>${liste("v")}
      <h3 class="bly-h3">Loddrett ${PIL.l}</h3>${liste("l")}
      <p class="hjelp">Tallet til høyre er antall bokstaver. Trykk på et stikkord for å hoppe dit.</p>
      <button class="knapp" data-h="lukk-ark">Lukk</button>`;
  }

  // The four kinds of help as tiles. The little letter tiles are the icons: they show what each
  // kind does to the grid (blue with a corner = shown, green = checked and right, red = wrong).
  const merke = (b, type) => `<span class="bly-merke ${type}">${b}</span>`;
  const HJELPVALG = [
    ["vis-bokstav", "Vis én bokstav", merke("A", "vist"), ""],
    ["vis-ord", "Vis hele ordet", merke("A", "vist") + merke("B", "vist") + merke("C", "vist"), ""],
    ["sjekk-ord", "Sjekk ordet", merke("A", "rett") + merke("B", "feil") + merke("C", "rett"), ""],
    ["sjekk-alt", "Sjekk hele krysset", merke("A", "rett") + merke("B", "rett") + merke("C", "feil") + merke("D", "rett"), " kryss"],
  ];
  function hjelpArk(sp) {
    const w = sp.kryss.ord[valgtOrd(sp)];
    return `
      <h2 id="ark-tittel">Trenger du hjelp?</h2>
      <p class="ingress">Ordet du står på: <b>${w.nr} ${RETNING[w.r]}</b> – «${esc(w.hint)}».</p>
      <div class="bly-hjelpvalg">
        ${HJELPVALG.map(([h, tekst, ikon, form]) => `<button class="bly-hjelpknapp" data-h="${h}"><span class="bly-merker${form}" aria-hidden="true">${ikon}</span>${tekst}</button>`).join("")}
      </div>
      ${R.ui.lenkerad(R.ui.lenke("Gi opp og se løsningen", "vis-losning"), R.ui.lenke("Avbryt", "lukk-ark"))}`;
  }

  const tidTekst = (ms) => {
    const s = Math.floor(Math.max(0, ms) / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };

  // «9.11.2026» — in numbers, so a month name can never give away an answer.
  function datoTekst(nr) {
    const d = new Date(nr * 86400000 + 43200000);
    return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
  }

  // ---------- Updating the screen in place ----------

  // Redraws the grid and the clue bar in place. Keyboard and screen-reader users keep their place:
  // focus in the grid follows the selected cell, focus on a clue-bar button comes back to it.
  function oppdater(S, beholdVarsel) {
    const sp = aktiv(S);
    if (!beholdVarsel) fjernVarsel(); // the next thing the player does brings the clue back
    const fokus = document.activeElement;
    const iNett = !!(fokus && fokus.closest && fokus.closest(".bly-rutenett"));
    const iLinje = fokus && fokus.closest && fokus.closest(".bly-hintlinje") ? fokus.dataset.h : null;
    const nett = R.$(".bly-rutenett");
    if (nett) nett.innerHTML = rutenettHtml(sp);
    const linje = R.$(".bly-hintlinje");
    if (linje) linje.outerHTML = hintlinjeHtml(sp);
    const mal = iNett ? R.$(`.bly-celle[data-v="${sp.valgt.c}"]`) : iLinje ? R.$(`.bly-hintlinje [data-h="${iLinje}"]`) : null;
    if (mal) {
      try {
        mal.focus({ preventScroll: true });
      } catch (e) {
        /* ignore */
      }
    }
  }

  // A short message where the clue stands (the result of a check): it never covers the grid.
  function fjernVarsel() {
    clearTimeout(varselId);
    varselId = null;
    varsel = null;
  }
  function melding(S, tekst, type) {
    fjernVarsel();
    varsel = { tekst, type: type || "" };
    oppdater(S, true);
    R.si(tekst);
    varselId = setTimeout(() => {
      fjernVarsel();
      if (R.S && R.S.skjerm === "kryss" && aktiv(R.S) && !ferdigNa) oppdater(R.S);
    }, 3000);
  }

  function siOrd(sp) {
    const w = sp.kryss.ord[valgtOrd(sp)];
    R.si(`${w.nr} ${RETNING[w.r]}, ${bokstaver(w.o).length} bokstaver: ${w.hint}`);
  }

  // The grid gets the room that is left above the keyboard.
  function tilpass() {
    const nett = R.$(".bly-rutenett:not(.statisk)");
    const bord = R.$(".bly-bord");
    const sp = R.S && aktiv(R.S);
    if (!nett || !bord || !sp) return;
    const k = sp.kryss;
    const gap = window.innerHeight < 640 ? 2 : 3;
    const skjerm = R.$("#skjerm");
    const mellom = parseFloat(getComputedStyle(skjerm).rowGap) || 12;
    const dokk = R.$("#skjerm .dokk");
    const topp = bord.getBoundingClientRect().top + window.scrollY;
    // A phone lying down: the keyboard sits beside the grid (see spill.css), so the grid gets the full height.
    const ved = !!dokk && dokk.getBoundingClientRect().left > bord.getBoundingClientRect().left + 40;
    const hoyde = window.innerHeight - topp - (ved ? 12 : (dokk ? dokk.offsetHeight : 0) + mellom) - 2;
    const bredde = bord.clientWidth;
    const s = Math.floor(Math.max(18, Math.min((bredde - gap * (k.b - 1)) / k.b, (hoyde - gap * (k.h - 1)) / k.h, 48)));
    nett.style.setProperty("--s", s + "px");
    nett.style.setProperty("--gap", gap + "px");
  }
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "kryss") tilpass();
  });

  // ---------- The clock ----------

  function visTid(sp) {
    const el = R.$(".bly-tid b");
    if (el) el.textContent = tidTekst(sp.tid);
  }
  function tikk(S) {
    const sp = aktiv(S);
    const na = Date.now();
    if (!sp || sp.ferdig || S.skjerm !== "kryss" || document.hidden) {
      sistTikk = na;
      return;
    }
    sp.tid += Math.min(na - sistTikk, 5000); // a phone that slept doesn't count
    sistTikk = na;
    visTid(sp);
    if (++tikkTeller % 5 === 0) R.lagre();
  }
  function startKlokke(S) {
    clearInterval(klokke);
    sistTikk = Date.now();
    klokke = setInterval(() => tikk(S), 1000);
    R.vedForlat(() => {
      tikk(S);
      clearInterval(klokke);
      klokke = null;
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sistTikk = Date.now();
  });

  // ---------- Playing ----------

  const lyd = {
    tast: () => R.lyd.tone(1180, 0, 0.03, "sine", 0.05),
    slett: () => R.lyd.tone(520, 0, 0.04, "sine", 0.05),
    ord: () => {
      R.lyd.tone(660, 0, 0.08, "triangle", 0.09);
      R.lyd.tone(880, 0.07, 0.1, "triangle", 0.09);
    },
  };

  function skriv(S, b) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || ferdigNa || S.skjerm !== "kryss") return;
    const k = sp.kryss;
    const wi = valgtOrd(sp);
    const cs = cellerI(k, k.ord[wi]);
    const vist = new Set(sp.vist);
    let c = sp.valgt.c;
    if (vist.has(c)) {
      // revealed letters are fixed: write in the next free cell of the word
      const neste = cs.slice(cs.indexOf(c) + 1).find((x) => !vist.has(x));
      if (neste == null) return;
      c = neste;
    }
    const varTom = !sp.fylt[c];
    sp.fylt[c] = b;
    sp.feil = sp.feil.filter((x) => x !== c);
    sp.rett = sp.rett.filter((x) => x !== c);
    sp.valgt = { c, r: k.ord[wi].r };
    const fullt = varTom && ordFylt(sp, wi);
    if (varTom) videre(sp);
    else {
      const neste = cs[cs.indexOf(c) + 1];
      if (neste != null) sp.valgt.c = neste;
    }
    oppdater(S);
    R.lagre();
    if (fullt) lyd.ord();
    else lyd.tast();
    if (valgtOrd(sp) !== wi) siOrd(sp);
    sjekkFerdig(S, sp);
  }

  function slett(S) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || ferdigNa || S.skjerm !== "kryss") return;
    const k = sp.kryss;
    const wi = valgtOrd(sp);
    const cs = cellerI(k, k.ord[wi]);
    const vist = new Set(sp.vist);
    let c = sp.valgt.c;
    if (!sp.fylt[c] || vist.has(c)) {
      const pos = cs.indexOf(c);
      if (pos <= 0) return;
      c = cs[pos - 1];
    }
    if (!vist.has(c)) {
      sp.fylt[c] = "";
      sp.feil = sp.feil.filter((x) => x !== c);
      sp.rett = sp.rett.filter((x) => x !== c);
    }
    sp.valgt = { c, r: k.ord[wi].r };
    oppdater(S);
    R.lagre();
    lyd.slett();
  }

  function trykkCelle(S, c) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || ferdigNa) return;
    const ci = info(sp.kryss)[c];
    if (!ci) return;
    const for_ = valgtOrd(sp);
    if (c === sp.valgt.c) {
      const annen = sp.valgt.r === "v" ? "l" : "v";
      if (ci[annen] >= 0) sp.valgt.r = annen;
    } else velgCelle(sp, c, sp.valgt.r);
    oppdater(S);
    R.lagre();
    R.lyd.klikk();
    if (valgtOrd(sp) !== for_) siOrd(sp);
  }

  function byttOrd(S, steg) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || ferdigNa) return;
    const n = sp.kryss.ord.length;
    velgOrd(sp, (valgtOrd(sp) + steg + n) % n);
    oppdater(S);
    R.lagre();
    R.lyd.klikk();
    siOrd(sp);
  }

  // Arrow keys move in the grid; across the direction they first turn (like on paper crosswords).
  function flytt(S, dx, dy) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig) return;
    const k = sp.kryss;
    const r = dx ? "v" : "l";
    const ci = info(k)[sp.valgt.c];
    if (sp.valgt.r !== r && ci && ci[r] >= 0) sp.valgt.r = r;
    else {
      let x = sp.valgt.c % k.b;
      let y = Math.floor(sp.valgt.c / k.b);
      for (;;) {
        x += dx;
        y += dy;
        if (x < 0 || y < 0 || x >= k.b || y >= k.h) return;
        if (info(k)[y * k.b + x]) break;
      }
      velgCelle(sp, y * k.b + x, r);
    }
    oppdater(S);
    R.lagre();
  }

  function telling(sp) {
    const I = info(sp.kryss);
    let tomme = 0;
    let feil = 0;
    I.forEach((ci, c) => {
      if (!ci) return;
      if (!sp.fylt[c]) tomme++;
      else if (sp.fylt[c] !== ci.b) feil++;
    });
    return { tomme, feil };
  }

  function sjekkFerdig(S, sp) {
    const { tomme, feil } = telling(sp);
    // Today's crossword in progress: the front page's «I dag» shows how many words are done.
    if (sp === S.dag && sp.nr === iDag() && !sp.ferdig) {
      const ferdigeOrd = sp.kryss.ord.filter((w, wi) => ordFylt(sp, wi)).length;
      if (ferdigeOrd !== sp.sistMeldt) {
        sp.sistMeldt = ferdigeOrd;
        R.dagligIGang({ tekst: `${ferdigeOrd} av ${sp.kryss.ord.length} ord` });
      }
    }
    if (tomme) return;
    if (!feil) return fullfor(S, sp, false);
    if (sp.nestenVist) return melding(S, "Noe er fortsatt feil", "feil");
    sp.nestenVist = true;
    R.lagre();
    R.ark(`
      <h2 id="ark-tittel">Nesten!</h2>
      <p class="ingress">Alle rutene er fylt, men noe stemmer ikke helt.</p>
      ${R.ui.knapp("Vis meg feilene", "sjekk-alt")}
      <button class="knapp-2" data-h="lukk-ark">Jeg finner dem selv</button>`);
  }

  function registrerDag(S, sp) {
    const st = S.stat;
    if (st.sistSpilt === sp.nr) return;
    st.sistSpilt = sp.nr;
    if (sp.gaOpp) st.rekke = 0;
    else {
      st.lost += 1;
      st.rekke = st.sistLost === sp.nr - 1 ? st.rekke + 1 : 1;
      st.sistLost = sp.nr;
      st.best = Math.max(st.best, st.rekke);
      if (!sp.hjelp && (st.bestTid == null || sp.tid < st.bestTid)) st.bestTid = sp.tid;
    }
    // The front page shows «✓ i dag» and the streak.
    if (sp.nr === iDag()) R.dagligFerdig({ vunnet: !sp.gaOpp, rekke: st.rekke, res: sp.gaOpp ? "Gitt opp" : tidTekst(sp.tid) });
  }
  const rekkeNa = (S) => (S.stat.sistLost != null && S.stat.sistLost >= iDag() - 1 ? S.stat.rekke : 0);

  // Solved (or given up): decided and saved at once; then a short show and the result screen.
  function fullfor(S, sp, gaOpp) {
    if (sp.ferdig) return;
    tikk(S);
    sp.ferdig = true;
    sp.gaOpp = gaOpp;
    if (gaOpp) {
      const I = info(sp.kryss);
      I.forEach((ci, c) => {
        if (ci && sp.fylt[c] !== ci.b) {
          sp.fylt[c] = ci.b;
          sp.vist.push(c);
        }
      });
      sp.feil = [];
    }
    if (S.modus === "dag") registrerDag(S, sp);
    else if (!gaOpp) S.friStat.lost += 1;
    R.statistikk("ferdig", { modus: S.modus, niva: sp.kryss.niva, hint: sp.hjelp, sek: Math.round(sp.tid / 1000), gaOpp });
    R.lagre();
    nyFeiring = true;
    const fortsatt = R.vakt();
    ferdigNa = true;
    oppdater(S);
    const nett = R.$(".bly-rutenett");
    if (!gaOpp) {
      if (nett) nett.classList.add("lost");
      R.lyd.riktig();
      R.vibrer([30, 50, 30]);
    }
    setTimeout(
      () => {
        ferdigNa = false;
        if (fortsatt()) R.gaTil("resultat");
      },
      R.rolig() || gaOpp ? 500 : 1500,
    );
  }

  // The day's result as a row of pencils: one per word, a light bulb where letters were shown
  // (a small square where the solution was shown after giving up). Never the answers.
  // R.del adds the link.
  function delTekst(S) {
    const sp = S.dag;
    const k = sp.kryss;
    const t = tema(k.tema);
    const vist = new Set(sp.vist);
    const rad = k.ord.map((w) => (cellerI(k, w).some((c) => vist.has(c)) ? (sp.gaOpp ? "▫️" : "💡") : "✏️")).join("");
    const rekke = rekkeNa(S);
    const linje = sp.gaOpp
      ? "Ga opp i dag – i morgen tar jeg det!"
      : `Løst på ${tidTekst(sp.tid)} ${sp.hjelp ? `med ${R.flertall(sp.hjelp, "hint", "hint")}` : "uten hjelp"}${rekke > 1 ? ` · 🔥 ${rekke} på rad` : ""}`;
    return `Blyanten nr. ${nrFor(sp.nr)}${t ? ` · ${t.ikon} ${t.navn}` : ""}\n${rad}\n${linje}\n`;
  }

  // ---------- Countdown to tomorrow's crossword ----------

  function sekunderTilNytt() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(na))
      .forEach((p) => (deler[p.type] = Number(p.value)));
    let igjen = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const dag = R.dag(new Date(na)).nr;
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const to = (n) => String(n).padStart(2, "0");
  const klokkeslett = (s) => `${to(Math.floor(s / 3600))}:${to(Math.floor((s % 3600) / 60))}:${to(s % 60)}`; // HH:MM:SS
  const nedtellingHtml = () => `<p class="bly-nedtelling">Nytt kryss om <b>${klokkeslett(sekunderTilNytt())}</b></p>`;
  function startNedtelling() {
    clearInterval(tikker);
    const dag = iDag();
    tikker = setInterval(() => {
      const el = R.$(".bly-nedtelling b");
      if (!el) return clearInterval(tikker);
      if (iDag() !== dag) {
        clearInterval(tikker);
        return R.vis();
      }
      el.textContent = klokkeslett(sekunderTilNytt());
    }, 1000);
    R.vedForlat(() => clearInterval(tikker));
  }

  function statistikkHtml(S) {
    const st = S.stat;
    return `<div class="bly-tall">
      <div><b>${R.tall(st.lost)}</b><span>løst</span></div>
      <div><b>${R.tall(rekkeNa(S))}</b><span>på rad</span></div>
      <div><b>${R.tall(st.best)}</b><span>beste rekke</span></div>
      <div><b>${st.bestTid == null ? "–" : tidTekst(st.bestTid)}</b><span>beste tid</span></div>
    </div>
    <p class="hjelp">Beste tid gjelder kryss løst helt uten hjelp.</p>`;
  }

  // Physical keyboard: letters, Backspace, arrows, Enter (next clue, with Shift the one before), space (turn).
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "kryss" || e.ctrlKey || e.metaKey || e.altKey || (R.arkApent && R.arkApent())) return;
    const el = e.target;
    if (el && el.closest && el.closest("input, textarea, select")) return;
    if ((e.key === "Enter" || e.key === " ") && el && el.closest && el.closest("button, a")) return;
    const sp = aktiv(S);
    if (!sp || sp.ferdig) return;
    const k = e.key;
    let handlet = true;
    if (k === "Backspace" || k === "Delete") slett(S);
    else if (k === "ArrowLeft") flytt(S, -1, 0);
    else if (k === "ArrowRight") flytt(S, 1, 0);
    else if (k === "ArrowUp") flytt(S, 0, -1);
    else if (k === "ArrowDown") flytt(S, 0, 1);
    else if (k === "Enter") byttOrd(S, e.shiftKey ? -1 : 1); // Tab stays free for moving the focus
    else if (k === " ") trykkCelle(S, sp.valgt.c);
    else if (k && k.length === 1 && BOKSTAV.test(k.toLocaleLowerCase("nb"))) skriv(S, k.toLocaleLowerCase("nb"));
    else handlet = false;
    if (handlet) e.preventDefault();
  });
  // On-screen keys never take the focus from a finger or a mouse.
  document.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.closest && e.target.closest(".bly-tast, .bly-celle, .bly-pil")) e.preventDefault();
  });

  // ---------- The game ----------

  // Top bar: «Dagens kryss», or the level of a crossword from «Flere kryss» (short: fits 320 px).
  const tittel = (S) => (S.modus === "fri" ? (NIVA[aktiv(S).kryss.niva] || NIVA.middels).navn : "Dagens kryss");

  const gyldigKryss = (k) =>
    k &&
    Number.isInteger(k.b) &&
    Number.isInteger(k.h) &&
    k.b > 0 &&
    k.h > 0 &&
    k.b <= 14 &&
    k.h <= 14 &&
    Array.isArray(k.ord) &&
    k.ord.length > 0 &&
    k.ord.every(
      (w) =>
        w &&
        typeof w.o === "string" &&
        /^[a-zæøå]+$/.test(w.o) &&
        typeof w.hint === "string" &&
        Number.isInteger(w.x) &&
        Number.isInteger(w.y) &&
        (w.r === "v" || w.r === "l") &&
        w.x >= 0 &&
        w.y >= 0 &&
        w.x + (w.r === "v" ? bokstaver(w.o).length : 1) <= k.b &&
        w.y + (w.r === "l" ? bokstaver(w.o).length : 1) <= k.h,
    );

  function rensSpill(sp) {
    if (!sp || !gyldigKryss(sp.kryss)) return null;
    const n = sp.kryss.b * sp.kryss.h;
    if (!Array.isArray(sp.fylt) || sp.fylt.length !== n) return null;
    sp.fylt = sp.fylt.map((b) => (typeof b === "string" && BOKSTAV.test(b) ? b : ""));
    const tall = (a) => (Array.isArray(a) ? a.filter((c) => Number.isInteger(c) && c >= 0 && c < n) : []);
    sp.vist = tall(sp.vist);
    sp.feil = tall(sp.feil);
    sp.rett = tall(sp.rett);
    sp.tid = Number.isFinite(sp.tid) && sp.tid > 0 ? sp.tid : 0;
    sp.hjelp = Number.isInteger(sp.hjelp) && sp.hjelp > 0 ? sp.hjelp : 0;
    sp.ferdig = !!sp.ferdig;
    sp.gaOpp = !!sp.gaOpp;
    if (!sp.valgt || !info(sp.kryss)[sp.valgt.c]) {
      const w = sp.kryss.ord[0];
      sp.valgt = { c: w.y * sp.kryss.b + w.x, r: w.r };
    }
    velgCelle(sp, sp.valgt.c, sp.valgt.r === "l" ? "l" : "v");
    return sp;
  }

  R.start({
    id: "blyanten",
    versjon: 1,
    pagar,
    _lagKryss: lagKryss, // for the generator test (build/blyord/test-generator.mjs)
    _dagensKryss: dagensKryss, // for the test that pins the dailies (test/spill/blyanten.e2e.mjs)

    tilstand: () => ({
      modus: "dag", // which crossword the screens show: "dag" or "fri"
      dag: null, // today's crossword in play: { nr, kryss, fylt, … }
      fri: null, // a crossword from «Flere kryss»
      oppsett: { niva: "middels", temaer: [] }, // temaer: [] = all themes
      stat: { lost: 0, rekke: 0, best: 0, bestTid: null, sistLost: null, sistSpilt: null },
      friStat: { lost: 0 },
      sistTema: null,
    }),

    lastet(S) {
      S.dag = rensSpill(S.dag);
      if (S.dag && !Number.isInteger(S.dag.nr)) S.dag = null;
      S.fri = rensSpill(S.fri);
      if (S.modus !== "fri") S.modus = "dag";
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      S.oppsett = {
        niva: NIVA[o.niva] ? o.niva : "middels",
        temaer: Array.isArray(o.temaer) ? o.temaer.filter((id) => tema(id)) : [],
      };
      if (S.oppsett.temaer.length >= TEMAER.length) S.oppsett.temaer = []; // every theme chosen = «Alle temaer»
      const st = S.stat && typeof S.stat === "object" ? S.stat : {};
      const heltall = (n) => (Number.isInteger(n) && n > 0 ? n : 0);
      S.stat = {
        lost: heltall(st.lost),
        rekke: heltall(st.rekke),
        best: heltall(st.best),
        bestTid: Number.isFinite(st.bestTid) && st.bestTid > 0 ? st.bestTid : null,
        sistLost: Number.isInteger(st.sistLost) ? st.sistLost : null,
        sistSpilt: Number.isInteger(st.sistSpilt) ? st.sistSpilt : null,
      };
      S.friStat = { lost: heltall(S.friStat && S.friStat.lost) };
      // Keep the front page's «✓ i dag» in step (also for days finished before this existed).
      if (S.dag && S.dag.ferdig && S.dag.nr === iDag()) R.dagligFerdig({ vunnet: !S.dag.gaOpp, rekke: S.dag.gaOpp ? 0 : S.stat.rekke, res: S.dag.gaOpp ? "Gitt opp" : tidTekst(S.dag.tid) });
      const sp = aktiv(S);
      if ((S.skjerm === "kryss" || S.skjerm === "resultat") && !sp) S.skjerm = "hjem";
      if (S.skjerm === "resultat" && sp && !sp.ferdig) S.skjerm = "kryss";
    },

    regler: {
      intro: "Små kryssord laget for mobilen. Alle ordene i et kryss hører til samme tema.",
      steg: [
        ["Velg en rute", "Trykk på en rute i krysset. Trykk en gang til for å bytte mellom vannrett → og loddrett ↓."],
        ["Les stikkordet", "Stikkordet til ordet står over tastaturet. Trykk på det for å se alle stikkordene, eller bla med pilene."],
        ["Skriv svaret", "Skriv med tastaturet. Når alle rutene er riktige, er krysset løst!"],
      ],
      tips: [
        "Står du fast? «Hjelp» viser en bokstav eller sjekker ordet ditt.",
        "Bokstavene der to ord krysser, hjelper deg med begge ordene.",
        "Dagens kryss er det samme for alle. Et nytt kryss kommer ved midnatt.",
        "«Flere kryss» lager nye kryss så lenge du vil – velg tema og nivå.",
      ],
      get ekstraHtml() {
        return `<h3>Fargene i krysset</h3>
          <ul class="bly-farger">
            <li>${merke("A", "rett")}Grønn bokstav: sjekket og riktig</li>
            <li>${merke("A", "feil")}Rød rute: sjekket og feil</li>
            <li>${merke("A", "vist")}Blå bokstav med hjørne: fått som hjelp</li>
          </ul>`;
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = S.dag && S.dag.nr === iDag() ? S.dag : null;
          const ferdig = !!(d && d.ferdig);
          const iGangD = !!(d && !d.ferdig && (harBokstaver(d) || d.tid > 0));
          const fylte = iGangD ? d.kryss.ord.filter((_, wi) => ordFylt(d, wi)).length : 0;
          const hoved = ferdig
            ? R.ui.knapp("Se dagens resultat", "se-resultat")
            : iGangD
              ? // The progress moves to its own line on narrow phones (see .bly-fremdrift), never «… ·» alone at a line end.
                R.ui.knapp("", "dag", {
                  tekstHtml: `<span>Fortsett dagens kryss<span class="bly-fremdrift"><i> · </i>${fylte}/${d.kryss.ord.length} ord</span></span>`,
                  etikett: `Fortsett dagens kryss, ${fylte} av ${d.kryss.ord.length} ord`,
                })
              : R.ui.knapp("Dagens kryss", "dag", { variant: "stor" });
          const fri = iGang(S.fri);
          const friTema = fri && tema(S.fri.kryss.tema);
          const rekke = rekkeNa(S);
          return R.ui.spillhjem({
            slagordHtml: "Små kryssord til mobilen.<br><em>Nytt kryss hver dag.</em>",
            knapperHtml:
              hoved +
              (ferdig ? nedtellingHtml() : "") +
              R.ui.knapp2(fri ? `Fortsett krysset${friTema ? ` · ${friTema.navn}` : ""}` : "Flere kryss", "fri") +
              R.ui.lenkerad(fri ? R.ui.lenke("Nytt kryss", "oppsett") : "", R.ui.lenke("Statistikk", "statistikk"), R.ui.lenke("Slik spiller du", "regler")),
            merker: [
              [String(TEMAER.length), "temaer"],
              [R.tall(ANTALL_ORD), "ord"],
              rekke ? [`🔥 ${rekke}`, rekke === 1 ? "dag på rad" : "dager på rad"] : ["3", "nivåer"],
            ],
          });
        },
        inn(S) {
          if (S.dag && S.dag.nr === iDag() && S.dag.ferdig) startNedtelling();
        },
      },

      oppsett: {
        tittel: "Flere kryss",
        tilbake: "hjem",
        vis(S) {
          const valgt = S.oppsett.temaer; // [] = all themes
          // A handful of themes first (and the ones already chosen); the rest are one tap away.
          const vises = alleTemaer ? TEMAER : TEMAER.filter((t) => UTVALGTE.includes(t.id) || valgt.includes(t.id));
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Hvor vanskelig?</h2></div>
              ${R.ui.seg(
                "niva",
                Object.entries(NIVA).map(([v, N]) => [v, N.navn]),
                S.oppsett.niva,
                { etikett: "Hvor vanskelig" },
              )}
              <p class="hjelp">${esc(`${NIVA[S.oppsett.niva].navn}: ${NIVA[S.oppsett.niva].tekst}.`)}</p>
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Tema</h2><span class="tall">${valgt.length ? `${valgt.length} valgt` : "Alle"}</span></div>
              ${R.ui.brikker(
                "tema",
                [{ v: "*", tekst: `Alle temaer (${TEMAER.length})`, ikon: "✨" }].concat(vises.map((t) => ({ v: t.id, tekst: t.navn, ikon: esc(t.ikon) }))),
                valgt.length ? valgt : ["*"],
                { etikett: "Tema" },
              )}
              ${R.ui.lenkerad(R.ui.lenke(alleTemaer ? "Vis færre temaer" : `Vis alle ${TEMAER.length} temaene`, "alle-temaer"))}
              <p class="hjelp">${valgt.length > 1 ? "Krysset lages av ett av temaene du har valgt." : valgt.length ? "Krysset lages av temaet du har valgt." : "Du får et kryss fra et tilfeldig tema."}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp("Start", "start"))}`;
        },
        ut() {
          alleTemaer = false;
        },
      },

      kryss: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const t = tema(sp.kryss.tema);
          const navn = t ? t.navn : "Kryss";
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(S.modus === "fri" ? `Kryss: ${navn}` : `Dagens kryss: ${navn}`)}</h1>
            <div class="bly-info">
              <span class="bly-tema">${t ? `<span aria-hidden="true">${esc(t.ikon)}</span> ` : ""}${esc(navn)}</span>
              <span class="bly-tid" role="timer" aria-label="Tid">⏱ <b>${tidTekst(sp.tid)}</b></span>
              ${sp.ferdig ? "" : R.ui.knapp2("Hjelp", "hjelp", { variant: "liten", ikon: "💡" })}
            </div>
            <div class="bly-bord">${rutenett(sp)}</div>
            ${R.ui.dokk(sp.ferdig ? R.ui.knapp("Se resultatet", "resultat") : hintlinjeHtml(sp) + tastaturHtml())}`;
        },
        etter() {
          tilpass();
        },
        inn(S) {
          ferdigNa = false;
          const sp = aktiv(S);
          if (sp && !sp.ferdig) {
            startKlokke(S);
            R.holdVaken(); // solving takes thinking time: the screen stays on
            siOrd(sp);
          }
        },
        ut() {
          ferdigNa = false;
          fjernVarsel();
          R.slippVaken();
        },
      },

      resultat: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const t = tema(sp.kryss.tema);
          const fri = S.modus === "fri";
          const gammel = !fri && sp.nr !== iDag();
          const etikett = sp.gaOpp ? "Neste gang!" : sp.hjelp ? "Godt jobba!" : "Helt uten hjelp!";
          const tittel = sp.gaOpp ? "Her er løsningen" : "Krysset er løst!";
          const fakta = `<ul class="merker bly-fakta" aria-label="Resultat">
              <li>⏱ <b>${tidTekst(sp.tid)}</b></li>
              ${sp.gaOpp ? "<li>📖 Løsning vist</li>" : `<li>💡 <b>${sp.hjelp}</b> hint</li>`}
              ${t ? `<li>${esc(t.ikon)} ${esc(t.navn)}</li>` : ""}
            </ul>`;
          const banner = `
            <div class="banner bly-banner">
              ${R.figur()}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${fakta}
              ${fri ? "" : gammel ? `<p class="bly-nedtelling"><b>Et nytt kryss er klart!</b></p>` : nedtellingHtml()}
            </div>
            <div class="bly-losning">${rutenett(sp, { statisk: true, losning: true, etikett: "Løsningen" })}</div>
            ${sp.vist.length || sp.rett.length ? `<p class="hjelp bly-fargeforklaring">${sp.rett.length ? '<span class="bly-merke rett">A</span> grønn = sjekket og riktig' : ""}${sp.rett.length && sp.vist.length ? " · " : ""}${sp.vist.length ? '<span class="bly-merke vist">A</span> blå = fått som hjelp' : ""}</p>` : ""}`;
          if (fri) {
            const n = S.friStat.lost;
            return `${banner}
              ${n ? `<p class="hjelp">Du har løst ${esc(R.flertall(n, "kryss", "kryss"))} fra «Flere kryss».</p>` : ""}
              ${R.ui.flereSpill(FLERE)}
              ${R.ui.dokk(R.ui.knapp("Nytt kryss", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "oppsett"), '<a class="lenke" href="/">Alle spill</a>'))}`;
          }
          return `${banner}
            <section class="seksjon bly-stat" aria-labelledby="bly-stat-tittel">
              <h2 id="bly-stat-tittel">Dagens kryss</h2>
              ${statistikkHtml(S)}
            </section>
            ${R.ui.flereSpill(FLERE)}
            ${R.ui.dokk(
              gammel ? R.ui.knapp("Løs dagens kryss", "dag") : R.ui.knapp("Del resultatet", "del"),
              R.ui.lenkerad(R.ui.lenke("Løs flere kryss", "fri"), '<a class="lenke" href="/">Alle spill</a>'),
            )}`;
        },
        inn(S) {
          R.slippVaken();
          const sp = aktiv(S);
          if (S.modus === "dag" && sp.nr === iDag()) startNedtelling();
          if (!nyFeiring) return;
          nyFeiring = false;
          if (sp.gaOpp) R.lyd.pling();
          else if (sp.hjelp <= 2) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
          if (S.modus === "dag") {
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 3000);
          }
        },
      },
    },

    // rusj.no/blyanten/#dagens (the front page's «I dag»): today's crossword, or its result.
    vedHash(S, hash) {
      if (hash !== "dagens") return null;
      if (!S.dag || S.dag.nr !== iDag()) {
        const k = dagensKryss(iDag());
        if (!k) return null;
        S.dag = nyttSpill(k, { nr: iDag() });
      }
      S.modus = "dag";
      return S.dag.ferdig ? "resultat" : "kryss";
    },
    handlinger: (H = {
      dag(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag()) {
          const k = dagensKryss(iDag());
          if (!k) return R.toast("Fant ikke dagens kryss");
          S.dag = nyttSpill(k, { nr: iDag() });
          R.statistikk("start", { modus: "dag", niva: k.niva });
        }
        S.modus = "dag";
        R.gaTil(S.dag.ferdig ? "resultat" : "kryss");
      },
      "se-resultat"(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag() || !S.dag.ferdig) return H.dag(el, e, S);
        S.modus = "dag";
        R.gaTil("resultat");
      },
      fri(el, e, S) {
        if (iGang(S.fri)) {
          S.modus = "fri";
          return R.gaTil("kryss");
        }
        R.gaTil("oppsett");
      },
      oppsett() {
        R.gaTil("oppsett");
      },
      niva(el, e, S) {
        if (NIVA[el.dataset.v]) S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      tema(el, e, S) {
        const v = el.dataset.v;
        const valgt = S.oppsett.temaer;
        // «Alle temaer» is the empty list; taking away the last theme (or choosing every one) gives all again.
        if (v === "*") S.oppsett.temaer = [];
        else if (tema(v)) S.oppsett.temaer = valgt.includes(v) ? valgt.filter((x) => x !== v) : TEMAER.map((t) => t.id).filter((x) => x === v || valgt.includes(x));
        if (S.oppsett.temaer.length >= TEMAER.length) S.oppsett.temaer = [];
        R.vis();
      },
      "alle-temaer"() {
        alleTemaer = !alleTemaer;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        const k = nyttFriKryss(S);
        if (!k) return R.toast("Fant ikke noe kryss – prøv et annet tema");
        S.fri = nyttSpill(k);
        S.modus = "fri";
        R.statistikk("start", { modus: "fri", niva: k.niva });
        R.gaTil("kryss");
      },
      igjen(el, e, S) {
        const k = nyttFriKryss(S);
        if (!k) return R.toast("Fant ikke noe kryss – prøv et annet tema");
        S.fri = nyttSpill(k);
        S.modus = "fri";
        R.statistikk("start", { modus: "fri", niva: k.niva });
        R.gaTil("kryss");
      },
      resultat(el, e, S) {
        const sp = aktiv(S);
        if (sp && sp.ferdig) R.gaTil("resultat");
      },
      tast(el, e, S) {
        if (el.dataset.v === "slett") slett(S);
        else if (BOKSTAV.test(el.dataset.v)) skriv(S, el.dataset.v);
      },
      celle(el, e, S) {
        trykkCelle(S, Number(el.dataset.v));
      },
      forrige(el, e, S) {
        byttOrd(S, -1);
      },
      neste(el, e, S) {
        byttOrd(S, 1);
      },
      hintliste(el, e, S) {
        const sp = aktiv(S);
        if (!sp || sp.ferdig) return;
        if (varsel) oppdater(S); // the clue comes back under the sheet
        R.ark(hintlisteArk(sp));
      },
      "velg-ord"(el, e, S) {
        const sp = aktiv(S);
        const wi = Number(el.dataset.v);
        if (!sp || sp.ferdig || !sp.kryss.ord[wi]) return;
        R.lukkArk();
        velgOrd(sp, wi);
        oppdater(S);
        R.lagre();
        siOrd(sp);
      },
      hjelp(el, e, S) {
        const sp = aktiv(S);
        if (sp && !sp.ferdig) R.ark(hjelpArk(sp));
      },
      "vis-bokstav"(el, e, S) {
        const sp = aktiv(S);
        if (!sp || sp.ferdig) return;
        const I = info(sp.kryss);
        const wi = valgtOrd(sp);
        const cs = cellerI(sp.kryss, sp.kryss.ord[wi]);
        // The selected cell, or else the first cell in the word that isn't right yet.
        const c = [sp.valgt.c, ...cs].find((x) => sp.fylt[x] !== I[x].b);
        R.lukkArk();
        if (c == null) return melding(S, "Ordet er allerede riktig!", "rett");
        sp.fylt[c] = I[c].b;
        if (!sp.vist.includes(c)) sp.vist.push(c);
        sp.feil = sp.feil.filter((x) => x !== c);
        sp.hjelp += 1;
        sp.valgt = { c, r: sp.kryss.ord[wi].r };
        if (ordFylt(sp, wi)) videre(sp);
        oppdater(S);
        R.lagre();
        R.lyd.pling();
        sjekkFerdig(S, sp);
      },
      "vis-ord"(el, e, S) {
        const sp = aktiv(S);
        if (!sp || sp.ferdig) return;
        const I = info(sp.kryss);
        const wi = valgtOrd(sp);
        const cs = cellerI(sp.kryss, sp.kryss.ord[wi]).filter((c) => sp.fylt[c] !== I[c].b);
        R.lukkArk();
        if (!cs.length) return melding(S, "Ordet er allerede riktig!", "rett");
        cs.forEach((c) => {
          sp.fylt[c] = I[c].b;
          if (!sp.vist.includes(c)) sp.vist.push(c);
        });
        sp.feil = sp.feil.filter((c) => !cs.includes(c));
        sp.hjelp += 1;
        videre(sp);
        oppdater(S);
        R.lagre();
        R.lyd.pling();
        siOrd(sp);
        sjekkFerdig(S, sp);
      },
      "sjekk-ord"(el, e, S) {
        const sp = aktiv(S);
        if (!sp || sp.ferdig) return;
        sjekk(S, sp, cellerI(sp.kryss, sp.kryss.ord[valgtOrd(sp)]), "ordet");
      },
      "sjekk-alt"(el, e, S) {
        const sp = aktiv(S);
        if (!sp || sp.ferdig) return;
        sjekk(S, sp, info(sp.kryss).map((ci, c) => (ci ? c : -1)).filter((c) => c >= 0), "krysset");
      },
      async "vis-losning"(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Gi opp krysset?", "Du får se hele løsningen. Neste kryss klarer du!", "Vis løsningen", "Fortsett");
        const sp = aktiv(S);
        if (!ja || !fortsatt() || !sp || sp.ferdig) return;
        fullfor(S, sp, true);
      },
      statistikk(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">Statistikk</h2>
          ${S.stat.lost || S.stat.sistSpilt != null ? statistikkHtml(S) : '<p class="ingress">Du har ikke løst dagens kryss ennå. Gjør det, så dukker statistikken opp her.</p>'}
          ${S.friStat.lost ? `<p class="hjelp">Flere kryss: ${esc(R.flertall(S.friStat.lost, "kryss", "kryss"))} løst.</p>` : ""}
          <button class="knapp" data-h="lukk-ark">Lukk</button>`);
      },
      del(el, e, S) {
        if (S.dag && S.dag.ferdig) return R.del("Blyanten", delTekst(S), DEL_URL);
      },
    }),
  });

  // Check letters: wrong ones turn red until they are changed, right ones get a green mark.
  function sjekk(S, sp, celler, hva) {
    const I = info(sp.kryss);
    const fylte = celler.filter((c) => sp.fylt[c]);
    R.lukkArk();
    if (!fylte.length) return melding(S, `Skriv noe først, så sjekker vi ${hva}`);
    const feil = fylte.filter((c) => sp.fylt[c] !== I[c].b);
    sp.feil = [...new Set(sp.feil.concat(feil))];
    sp.rett = [...new Set(sp.rett.concat(fylte.filter((c) => sp.fylt[c] === I[c].b)))];
    sp.hjelp += 1;
    R.lagre();
    if (feil.length) {
      R.lyd.feil();
      melding(S, feil.length === 1 ? "Én bokstav er feil" : `${feil.length} bokstaver er feil`, "feil");
    } else {
      R.lyd.riktig();
      melding(S, fylte.length < celler.length ? "Riktig så langt!" : "Alt riktig!", "rett");
    }
  }
})();
