/* Tankeleseren — "Bølgelengde".
   A spectrum card ("Kaldt ↔ Varmt") and a hidden target on a half-circle dial (0–100). The hint
   giver has two cards to choose from, holds the dial to peek at the target and says one hint;
   the others drag the needle to where they think the target is. Then the cover sweeps away:
   4, 3 or 2 points close to the centre of the target. Modes: Sammen (co-op, 8 rounds, a record
   per length) and Lag mot lag (first to 10; the other team may bet "left or right of the
   needle" for 1 point; a team that scores 4 and is still behind goes again).
   «Send en utfordring»: one dial with a typed hint travels in a link (…/#s=…), no server. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.spektrum;
  const esc = R.esc;
  let H; // the actions, so one action can reuse another

  // ---------- Content ----------

  // The order of the packs in the data file is fixed: a card is saved by its number in ALLE.
  // (New packs go last in the file; pakkerVist decides the order on the setup screen.)
  const parHash = (v, h) => R.hash(v + "↔" + h);
  const PAKKER = D.pakker;
  const ALLE = [];
  PAKKER.forEach((p) => p.par.forEach(([v, h]) => ALLE.push({ p: p.id, v, h, n: parHash(v, h) })));
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const STANDARD = PAKKER.filter((p) => p.id !== "barn" && p.id !== "jul").map((p) => p.id);
  const stokk = R.kortstokk("spektrum", ALLE.length);
  const antallKort = (pakker) => PAKKER.filter((p) => pakker.includes(p.id)).reduce((s, p) => s + p.par.length, 0);

  // «Jul» is switched on by itself from 1 November to 6 January (Oslo time), once per season:
  // S.jul is the season it was done for (the year the season started), so a player who switches
  // the pack off keeps it off, and one who switches it on in June keeps it on.
  const julesesong = (dag) => {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(dag || ""));
    if (!m) return 0;
    const mnd = Number(m[2]);
    if (mnd >= 11) return Number(m[1]);
    return mnd === 1 && Number(m[3]) <= 6 ? Number(m[1]) - 1 : 0;
  };
  const sesongNa = () => julesesong(R.dag().tekst);
  function julRegel(S) {
    const ar = sesongNa();
    if (ar && S.jul !== ar) {
      if (pakke("jul") && !S.oppsett.pakker.includes("jul")) S.oppsett.pakker.push("jul");
      S.jul = ar;
    } else if (!ar && S.jul) {
      S.oppsett.pakker = S.oppsett.pakker.filter((id) => id !== "jul");
      S.jul = 0;
    }
  }
  // In the season «Jul» is the first chip, the rest of the year the last.
  const pakkerVist = () => {
    const jul = PAKKER.filter((p) => p.id === "jul");
    const andre = PAKKER.filter((p) => p.id !== "jul");
    return sesongNa() ? [...jul, ...andre] : [...andre, ...jul];
  };

  // Sammen: 8 rounds, or one per player when there are more, so everybody gives a hint.
  const RUNDER = 8;
  const runderFor = (antall) => Math.max(RUNDER, antall);
  const runder = (sp) => sp.runder || RUNDER;
  const MAL = 10; // Lag mot lag: first to 10
  // Distance from the centre of the target → points (zones of 5 on a 0–100 dial).
  const SONER = [
    [2.5, 4],
    [7.5, 3],
    [12.5, 2],
  ];
  const poengFor = (avstand) => {
    for (const [grense, p] of SONER) if (avstand <= grense + 1e-9) return p;
    return 0;
  };

  const LAG = [
    { navn: R.t("Lag {farge}", { farge: R.t("Rosa") }), token: "--rosa", klasse: "rosa", knapp: "rosa" },
    { navn: R.t("Lag {farge}", { farge: R.t("Blå") }), token: "--himmel", klasse: "bla", knapp: "himmel" },
  ];
  // The two ends of each card get their own colours (fixed per card).
  const FARGER = [
    ["--himmel", "--oransje"],
    ["--mynte", "--rosa"],
    ["--lilla", "--lampe"],
    ["--himmel", "--rod"],
    ["--mynte", "--lilla"],
    ["--lampe", "--himmel"],
    ["--oransje", "--mynte"],
  ];
  const farger = (kort) => FARGER[(Number.isInteger(kort) ? Math.abs(kort) : 0) % FARGER.length];

  const KOMMENTAR = {
    4: [R.t("Midt i blinken!"), R.t("Tankelesere!"), R.t("Samme bølgelengde!"), R.t("Telepati!")],
    3: [R.t("Så nærme!"), R.t("Nesten tankelesere!"), R.t("Varmt, varmt!")],
    2: [R.t("Innenfor!"), R.t("Lunkent – men poeng!"), R.t("I nærheten!")],
    0: [R.t("Feil frekvens …"), R.t("Hver sin bølgelengde!"), R.t("Det knitret på linja …")],
  };
  const kommentar = (p, n) => KOMMENTAR[p][n % KOMMENTAR[p].length];
  // One sign per round in the text that is shared.
  const TEGN = { 4: "🎯", 3: "🟠", 2: "🟡", 0: "⚫" };
  const TALLORD = ["", "", R.t("To"), R.t("Tre"), R.t("Fire"), R.t("Fem"), R.t("Seks"), R.t("Sju"), R.t("Åtte"), R.t("Ni"), R.t("Ti")];

  // Rating by the share of the maximum (4 points per round), so it is fair with any number of rounds.
  function vurdering(sum, antallRunder) {
    const andel = sum / (antallRunder * 4);
    if (andel >= 0.875) return { tittel: R.t("Tankelesere!"), tekst: R.t("Dere deler visst én hjerne. Litt skummelt, egentlig.") };
    if (andel >= 0.69) return { tittel: R.t("Samme bølgelengde"), tekst: R.t("Imponerende! Dere tenker nesten helt likt.") };
    if (andel >= 0.5) return { tittel: R.t("God kontakt"), tekst: R.t("Litt støy på linja, men dere hører hverandre.") };
    if (andel >= 0.31) return { tittel: R.t("Det knitrer"), tekst: R.t("Signalet kommer og går. En runde til?") };
    return { tittel: R.t("Hver sin radio"), tekst: R.t("Dere sender på helt ulike kanaler. Prøv igjen!") };
  }

  // ---------- Scores (always computed from the log) ----------

  function poengSum(sp, antall) {
    const logg = sp.logg.slice(0, antall == null ? sp.logg.length : antall);
    if (sp.modus === "sammen") return logg.reduce((s, l) => s + l.poeng, 0);
    const p = [0, 0];
    for (const l of logg) {
      p[l.lag] += l.poeng;
      if (l.tippRiktig) p[1 - l.lag] += 1;
    }
    return p;
  }
  // Rounds whose result may be shown (the current one is hidden until the cover has opened).
  const synligeRunder = (sp) => (sp.fase === "fasit" && !sp.avslort ? sp.logg.length - 1 : sp.logg.length);
  // The last round is played (Sammen) or a team has reached the goal (Lag mot lag) …
  const iMal = (sp) => (sp.modus === "sammen" ? sp.logg.length >= runder(sp) && sp.fase === "fasit" : sp.vinner != null);
  // … or the game was ended with «Avslutt» (sp.slutt is set when «Kåringen» is first shown).
  const ferdig = (sp) => !!sp.slutt || iMal(sp);
  const pagar = (S) => !!S.spill && !ferdig(S.spill);
  // The team in the lead (null when the teams are level).
  const leder = (sp) => {
    const p = poengSum(sp);
    return p[0] === p[1] ? null : p[0] > p[1] ? 0 : 1;
  };
  // Bullseyes in a row up to and including the last round (a team's own rounds in a team game).
  function rekke(sp) {
    const siste = sp.logg[sp.logg.length - 1];
    let n = 0;
    for (let i = sp.logg.length - 1; i >= 0; i--) {
      if (sp.logg[i].lag !== siste.lag) continue;
      if (sp.logg[i].poeng !== 4) break;
      n++;
    }
    return n;
  }

  // The dial on the screen belongs to the party game, to a challenge being made («lag») or to a
  // challenge that was received («utf»). They share the fields kort, par, mal, viser and sett.
  const aktiv = (S) => (S.skjerm === "lag" ? S.utf.lag : S.skjerm === "utf" ? S.utf.mot : S.spill);

  // ---------- The dial (SVG) ----------
  // Centre (120, 122), face radius 106. Value v (0–100) runs from the left end over the top
  // to the right end.

  const CX = 120;
  const CY = 122;
  const RF = 106;
  const f = (n) => n.toFixed(2);
  const punkt = (v, r) => {
    const a = (Math.PI * v) / 100;
    return [CX - r * Math.cos(a), CY - r * Math.sin(a)];
  };
  function kile(v1, v2, r) {
    const [x1, y1] = punkt(v1, r);
    const [x2, y2] = punkt(v2, r);
    return `M${CX} ${CY}L${f(x1)} ${f(y1)}A${r} ${r} 0 0 1 ${f(x2)} ${f(y2)}Z`;
  }
  const FLATE = `M${CX - RF} ${CY}A${RF} ${RF} 0 0 1 ${CX + RF} ${CY}Z`;
  const STREKER = (() => {
    let s = "";
    for (let v = 0; v <= 100; v += 5) {
      const stor = v % 50 === 0;
      const mid = v % 25 === 0;
      const [x1, y1] = punkt(v, RF - (stor ? 15 : mid ? 11 : 7));
      const [x2, y2] = punkt(v, RF - 2);
      s += `<line class="tl-strek${stor || mid ? " stor" : ""}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
    }
    return s;
  })();

  function soner(mal) {
    const deler = [
      [-12.5, -7.5, 2],
      [-7.5, -2.5, 3],
      [-2.5, 2.5, 4],
      [2.5, 7.5, 3],
      [7.5, 12.5, 2],
    ];
    return deler
      .map(([a, b, p]) => {
        const v1 = Math.max(0, mal + a);
        const v2 = Math.min(100, mal + b);
        if (v2 - v1 <= 0.05) return "";
        const [tx, ty] = punkt((v1 + v2) / 2, RF - 22);
        return `<path class="tl-sone s${p}" d="${kile(v1, v2, RF)}"/>${v2 - v1 >= 3.5 ? `<text class="tl-sonetall" x="${f(tx)}" y="${f(ty)}">${p}</text>` : ""}`;
      })
      .join("");
  }

  const verdiTekst = (sp, v) => {
    const [venstre, hoyre] = sp.par;
    const n = Math.round(v);
    return n === 50 ? R.t("{n} av 100, midt mellom", { n }) : R.t("{n} av 100, nærmest «{ende}»", { n, ende: n < 50 ? venstre : hoyre });
  };

  // o: { modus: "kikk" (hold to peek) | "dra" (drag the needle) | "fast", mal, viser, apen }
  function skiveHtml(sp, o) {
    const [fv, fh] = farger(sp.kort);
    const [venstre, hoyre] = sp.par;
    let rolle;
    if (o.modus === "dra")
      rolle = `role="slider" tabindex="0" aria-label="${esc(R.t("Viseren mellom «{a}» og «{b}»", { a: venstre, b: hoyre }))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(sp.viser)}" aria-valuetext="${esc(verdiTekst(sp, sp.viser))}"`;
    else if (o.modus === "kikk") rolle = `role="button" tabindex="0" aria-expanded="false" aria-label="${esc(R.t("Vis målet på skiva"))}"`;
    else rolle = `role="img" aria-label="${esc(o.etikett || R.t("Skiva"))}"`;
    const viser = o.viser
      ? `<g class="tl-viser" style="transform: rotate(${f(sp.viser * 1.8)}deg)">
          <path class="tl-nal" d="M${CX} ${CY - 3.6}L${CX - 93} ${CY - 1}L${CX - 93} ${CY + 1}L${CX} ${CY + 3.6}Z"/>
          <circle class="tl-knott" cx="${CX - 89}" cy="${CY}" r="7.5"/>
        </g>`
      : "";
    return `<div class="tl-skive tl-${o.modus}${o.apen ? " apen" : ""}" style="--v: var(${fv}); --h: var(${fh})" ${rolle}>
      <svg viewBox="0 0 240 136" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id="tl-klipp"><path d="${FLATE}"/></clipPath>
          <linearGradient id="tl-tone" x1="0" x2="1" y1="0" y2="0"><stop offset="0" class="tl-tone-v"/><stop offset="0.5" class="tl-tone-m"/><stop offset="1" class="tl-tone-h"/></linearGradient>
          <pattern id="tl-striper" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" class="tl-stripe-a"/><rect width="7" height="14" class="tl-stripe-b"/></pattern>
        </defs>
        <path class="tl-hus" d="M3 ${CY}A117 117 0 0 1 237 ${CY}V128Q237 135 230 135H10Q3 135 3 128Z"/>
        <g clip-path="url(#tl-klipp)">
          <path class="tl-flate" d="${FLATE}"/>
          <path d="${FLATE}" fill="url(#tl-tone)"/>
          ${o.mal ? soner(sp.mal) : ""}
          <g class="tl-deksel">
            <path d="${FLATE}" fill="url(#tl-striper)"/>
            <path class="tl-deksel-ring" d="M${CX - RF + 30} ${CY}A${RF - 30} ${RF - 30} 0 0 1 ${CX + RF - 30} ${CY}"/>
            <text class="tl-deksel-tegn" x="${CX}" y="${CY - 50}">?</text>
          </g>
        </g>
        <path class="tl-kant" d="${FLATE}"/>
        <g class="tl-streker">${STREKER}</g>
        ${viser}
        <circle class="tl-nav" cx="${CX}" cy="${CY}" r="10.5"/>
        <circle class="tl-nav-prikk" cx="${CX}" cy="${CY}" r="3.2"/>
      </svg>
    </div>`;
  }

  // A small dial for the round list on the result screen.
  function miniSkive(l) {
    const cx = 32;
    const cy = 32;
    const r = 28;
    const p = (v, rr) => {
      const a = (Math.PI * v) / 100;
      return [cx - rr * Math.cos(a), cy - rr * Math.sin(a)];
    };
    const kil = (v1, v2) => {
      const [x1, y1] = p(Math.max(0, v1), r);
      const [x2, y2] = p(Math.min(100, v2), r);
      return `M${cx} ${cy}L${f(x1)} ${f(y1)}A${r} ${r} 0 0 1 ${f(x2)} ${f(y2)}Z`;
    };
    const [nx, ny] = p(l.viser, r - 2);
    return `<svg viewBox="0 0 64 36" aria-hidden="true" focusable="false">
      <path class="tl-mini-flate" d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}Z"/>
      <path class="tl-sone s2" d="${kil(l.mal - 12.5, l.mal + 12.5)}"/>
      <path class="tl-sone s3" d="${kil(l.mal - 7.5, l.mal + 7.5)}"/>
      <path class="tl-sone s4" d="${kil(l.mal - 2.5, l.mal + 2.5)}"/>
      <line class="tl-mini-nal" x1="${cx}" y1="${cy}" x2="${f(nx)}" y2="${f(ny)}"/>
      <circle class="tl-mini-nav" cx="${cx}" cy="${cy}" r="3"/>
    </svg>`;
  }

  // Long single words (Overvurdert oppfinnelse, Pensjonistaktivitet) get a smaller size class so a
  // label never has to break inside a word.
  function endeKlasse(tekst) {
    const lengste = Math.max(...tekst.split(/\s+/).map((o) => o.length));
    if (lengste >= 15 || tekst.length > 30) return " ekstra-lang";
    if (lengste >= 12 || tekst.length > 22) return " lang";
    return "";
  }

  function kortHtml(sp) {
    const [fv, fh] = farger(sp.kort);
    const [venstre, hoyre] = sp.par;
    return `<div class="tl-kort" style="--v: var(${fv}); --h: var(${fh})" role="group" aria-label="${esc(R.t("Skalaen går fra «{a}» til «{b}»", { a: venstre, b: hoyre }))}">
      <span class="tl-ende v${endeKlasse(venstre)}"><i aria-hidden="true">◀</i><span>${esc(venstre)}</span></span>
      <span class="tl-ende h${endeKlasse(hoyre)}"><span>${esc(hoyre)}</span><i aria-hidden="true">▶</i></span>
    </div>`;
  }

  // ---------- Moving the needle ----------

  let sisteTikk = 0;
  function tikk() {
    const na = performance.now();
    if (na - sisteTikk < 45) return;
    sisteTikk = na;
    R.lyd.tone(1900, 0, 0.018, "square", 0.025);
    R.vibrer(4);
  }

  function settViser(S, v, hopp) {
    const sp = aktiv(S);
    if (!sp) return;
    const ny = Math.round(R.klamp(v, 0, 100) * 10) / 10;
    const gammel = sp.viser;
    sp.viser = ny;
    const g = R.$(".tl-viser");
    if (g) {
      g.classList.toggle("hopp", !!hopp);
      g.style.transform = `rotate(${f(ny * 1.8)}deg)`;
    }
    const skive = R.$('.tl-skive[role="slider"]');
    if (skive) {
      skive.setAttribute("aria-valuenow", String(Math.round(ny)));
      skive.setAttribute("aria-valuetext", verdiTekst(sp, ny));
    }
    if (Math.floor(gammel / 5) !== Math.floor(ny / 5)) tikk();
  }

  function flyttViser(S, retning) {
    const sp = aktiv(S);
    if (!sp) return;
    const v = sp.viser;
    settViser(S, retning < 0 ? Math.ceil(v) - 1 : Math.floor(v) + 1, true);
    tikk();
    R.lagre();
  }

  // Drag anywhere on the dial: the needle points at the finger (also below the dial's base).
  function koblingDra(S, el) {
    if (!el) return;
    const svg = el.querySelector("svg");
    let trykket = null;
    const verdi = (e) => {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 240;
      const y = ((e.clientY - r.top) / r.height) * 136;
      let a = Math.atan2(CY - y, x - CX);
      if (a < 0) a = x < CX ? Math.PI : 0;
      return 100 - (a / Math.PI) * 100;
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || trykket != null) return;
      e.preventDefault();
      trykket = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch (feil) {
        /* not every pointer can be captured */
      }
      el.classList.add("drar");
      try {
        el.focus({ preventScroll: true });
      } catch (feil) {
        /* ignore */
      }
      settViser(S, verdi(e), true);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== trykket) return;
      settViser(S, verdi(e), false);
    });
    const slipp = (e) => {
      if (e.pointerId !== trykket) return;
      trykket = null;
      el.classList.remove("drar");
      R.lagre();
    };
    el.addEventListener("pointerup", slipp);
    el.addEventListener("pointercancel", slipp);
    el.addEventListener("keydown", (e) => {
      const sp = aktiv(S);
      if (!sp) return;
      const steg = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
      if (steg != null) {
        e.preventDefault();
        const v = sp.viser;
        const n = Math.abs(steg) * (e.shiftKey ? 5 : 1);
        settViser(S, steg < 0 ? Math.ceil(v) - n : Math.floor(v) + n, true);
        R.lagre();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        settViser(S, e.key === "Home" ? 0 : 100, true);
        R.lagre();
      }
    });
  }

  // The ◀ ▶ buttons move one step per tap and keep going while held.
  function koblingFin(S, rot) {
    rot.querySelectorAll(".tl-finknapp").forEach((b) => {
      let vent = null;
      let gjenta = null;
      const stopp = () => {
        clearTimeout(vent);
        clearInterval(gjenta);
        vent = gjenta = null;
      };
      b.addEventListener("pointerdown", () => {
        stopp();
        b.dataset.gjentatt = "";
        vent = setTimeout(() => {
          gjenta = setInterval(() => {
            b.dataset.gjentatt = "1";
            flyttViser(S, Number(b.dataset.v));
          }, 70);
        }, 380);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((t) => b.addEventListener(t, stopp));
      R.vedForlat(stopp);
    });
  }

  // ---------- Hold to peek at the target (the hint giver) ----------

  // A hold button under the dial (so the thumb doesn't hide the target), or the dial itself.
  // A finger holds: the target shows while it is down. A plain click (a screen reader's double
  // tap, a switch) or Enter/Space opens it, and the next one closes it again.
  const EKSEMPEL = R.t("Eksempel: Kaldt ↔ Varmt, målet litt mot varmt → «badevann».");
  // The line under the hold button (HTML made of our own words only). A phone that has never
  // finished a game gets an example after the first peek: the first hint is the hardest part.
  // (.tl-lede and .tl-mer give way on short screens, see spill.css.)
  function kikkHjelp(S, o) {
    const lager = S.skjerm === "lag";
    if (lager && o.delt) return esc(R.t("Vennen din ser skalaen og hintet – ikke målet. Del gjerne med flere!"));
    if (!o.sett) return esc(lager ? R.t("Vennen din ser skalaen og hintet – ikke målet.") : R.t("Bare du skal se. Slipp, så skjules målet igjen."));
    const hva = esc(lager ? R.t("Skriv ett hint som hører hjemme akkurat der målet er") : R.t("Si ett hint som hører hjemme akkurat der målet er"));
    if (!S.ferdige) return `<span class="tl-lede">${hva}.</span><span class="tl-eksempel">${esc(EKSEMPEL)}</span>`;
    return lager ? `${hva}.` : `${hva} ${esc(R.t("– ikke tall!"))}<span class="tl-mer"> ${esc(R.t("Hold inne igjen så ofte du vil."))}</span>`;
  }

  let kikk = null; // { skive, knapp, start, veksle }
  let kikkSlipp = -1e9; // when a finger or a key last let go: the click that follows is not a new command
  let tastNed = 0;
  let tastLukket = false;
  const merkKikk = (apen) => R.$$(".tl-kikk, .tl-holdknapp").forEach((el) => el.setAttribute("aria-expanded", apen ? "true" : "false"));

  function apneKikk(S, skive, knapp, veksle) {
    const o = aktiv(S);
    if (kikk || !o) return;
    kikk = { skive, knapp, start: performance.now(), veksle: !!veksle };
    skive.classList.add("apen");
    if (knapp) knapp.classList.add("holdes");
    merkKikk(true);
    R.lyd.snu();
    R.vibrer(15);
    // Said to the player who asked for it, and only then (taken away again in lukkKikk).
    R.si(R.t("Målet ligger på {verdi}.", { verdi: verdiTekst(o, o.mal) }) + (veksle ? " " + R.t("Trykk igjen for å skjule det.") : ""));
  }
  // The target has been seen: open the next step without redrawing (the finger may still be down).
  function etterKikk(S) {
    const o = aktiv(S);
    const h = R.$("#tl-kikk-hjelp");
    if (h && o) h.innerHTML = kikkHjelp(S, o);
    const k = R.$("#tl-klar");
    if (!k || !o) return;
    if (S.skjerm === "lag") oppdaterLag(S);
    else {
      k.disabled = false;
      k.textContent = R.t("Jeg har et hint!");
    }
    k.classList.add("pop");
  }
  function lukkKikk(S, stille) {
    if (!kikk) return;
    const { skive, knapp, start, veksle } = kikk;
    kikk = null;
    skive.classList.remove("apen");
    if (knapp) knapp.classList.remove("holdes");
    merkKikk(false);
    // The secret must not stay in the screen-reader message when the phone is passed on.
    R.si("");
    if (!veksle && performance.now() - start < 350) {
      if (!stille) R.toast(R.t("Hold litt lenger for å se målet"));
      return;
    }
    const o = aktiv(S);
    if (o && !o.sett) {
      o.sett = true;
      R.lagre();
      etterKikk(S);
    }
  }
  function koblingKikk(S, el, skive) {
    if (!el || !skive) return;
    const knapp = el === skive ? null : el;
    el.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch (feil) {
        /* ignore */
      }
      if (kikk && kikk.veksle) {
        // Opened with a click or a key: a finger closes it
        kikkSlipp = performance.now();
        lukkKikk(S);
        return;
      }
      apneKikk(S, skive, knapp, false);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) =>
      el.addEventListener(t, () => {
        kikkSlipp = performance.now();
        if (kikk && !kikk.veksle) lukkKikk(S);
      }),
    );
    el.addEventListener("click", () => {
      if (performance.now() - kikkSlipp < 500) return; // the click that follows a hold or a key
      if (kikk) lukkKikk(S);
      else apneKikk(S, skive, knapp, true);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && kikk) {
        lukkKikk(S);
        return;
      }
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (e.repeat) return;
      tastNed = performance.now();
      tastLukket = !!kikk;
      if (kikk) lukkKikk(S);
      else apneKikk(S, skive, knapp, true);
    });
    el.addEventListener("keyup", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      kikkSlipp = performance.now(); // (a button also sends a click for Space when the key comes up)
      // A key that was held is a hold: let go and the target hides. A short press leaves it open.
      if (kikk && !tastLukket && performance.now() - tastNed >= 350) lukkKikk(S);
    });
    el.addEventListener("blur", () => {
      if (kikk && kikk.veksle) lukkKikk(S);
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  window.addEventListener("blur", () => lukkKikk(R.S));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) lukkKikk(R.S);
  });

  // ---------- Rounds ----------

  const medlemmer = (sp, lag) => sp.lag.map((l, i) => (l === lag ? i : -1)).filter((i) => i >= 0);

  // Two cards from the deck and a target: the first card is on the table, the other one can be
  // swapped in (H["bytt-kort"]). The target stays where it is when the cards are swapped.
  function trekkKort(o, pakker) {
    const valgt = new Set(pakker);
    const a = stokk.neste((n) => valgt.has(ALLE[n].p));
    const b = stokk.neste((n) => valgt.has(ALLE[n].p) && n !== a);
    o.kort = a >= 0 ? a : 0;
    o.alt = b >= 0 && b !== o.kort ? b : -1;
    o.par = [ALLE[o.kort].v, ALLE[o.kort].h];
    o.mal = Math.round((3 + (R.nyttFro() / 4294967296) * 94) * 10) / 10;
  }

  function nyRunde(S) {
    const sp = S.spill;
    if (sp.modus === "sammen") sp.giver = (sp.runde - 1) % sp.antall;
    else {
      const m = medlemmer(sp, sp.tur);
      sp.giver = m[sp.teller[sp.tur] % m.length];
    }
    trekkKort(sp, sp.pakker);
    sp.viser = 50;
    sp.fase = "gjett";
    sp.sett = false;
    sp.tipp = null;
    sp.avslort = false;
    sp.hint = "";
  }

  // Keyboard and screen-reader focus after a redraw that removed the button that was pressed.
  function fokuser(sel) {
    const el = R.$(sel);
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch (feil) {
      /* ignore */
    }
  }
  const fokusLedig = () => !document.activeElement || document.activeElement === document.body || document.activeElement.id === "skjerm-tittel";

  // The drum roll, the cover that sweeps away and the result. A newer call takes over from an
  // older one (the player went away and came back while the drums were rolling).
  let avsloringNr = 0;
  async function spillAvsloring(S) {
    const o = aktiv(S);
    if (!o) return;
    const mitt = ++avsloringNr;
    const skjerm = S.skjerm;
    const rolig = R.rolig();
    const fortsatt = R.vakt();
    const gjelder = () => mitt === avsloringNr && fortsatt() && aktiv(S) === o && S.skjerm === skjerm;
    R.lyd.trommevirvel(rolig ? 0.3 : 1.1);
    await R.vent(rolig ? 300 : 1150);
    if (!gjelder()) return;
    const skive = R.$(".tl-skive");
    if (skive) skive.classList.add("apen");
    await R.vent(rolig ? 150 : 1050);
    if (!gjelder()) return;
    o.avslort = true;
    R.vis();
    const runde = o === S.spill ? o.logg[o.logg.length - 1] : null;
    const poeng = runde ? runde.poeng : o.poeng;
    if (poeng === 4) {
      R.lyd.fanfare();
      R.konfetti(["--aksent", "--oransje", "--lampe", "--papir"]);
      R.vibrer([40, 60, 40, 60, 120]);
    } else if (poeng > 0) {
      R.lyd.riktig();
      R.vibrer(40);
    } else {
      R.lyd.feil();
      R.vibrer(160);
    }
    R.si(`${poeng ? R.t("{n} poeng", { n: poeng }) : R.t("Bom")}. ${kommentar(poeng, runde ? o.logg.length : o.k)}${runde && runde.igjen ? " " + R.t("{lag} får en runde til.", { lag: LAG[runde.lag].navn }) : ""}`);
    if (runde) {
      const n = rekke(o);
      if (n >= 2) R.toast(R.t("{antall} på rad! 🔥", { antall: TALLORD[n] || n }));
    }
    if (fokusLedig()) fokuser("#skjerm .dokk .knapp:not([disabled])");
  }

  function avslor(S) {
    const sp = S.spill;
    const poeng = poengFor(Math.abs(sp.viser - sp.mal));
    let tippRiktig = null;
    if (sp.modus === "lag" && sp.tipp) tippRiktig = sp.tipp === "v" ? sp.mal < sp.viser : sp.mal > sp.viser;
    const runde = { par: sp.par.slice(), kort: sp.kort, mal: sp.mal, viser: sp.viser, poeng, giver: sp.giver, lag: sp.modus === "lag" ? sp.tur : null, tipp: sp.tipp, tippRiktig, hint: sp.hint || "", igjen: false };
    sp.logg.push(runde);
    sp.fase = "fasit";
    sp.avslort = false;
    if (sp.modus === "lag") {
      const p = poengSum(sp);
      if (Math.max(p[0], p[1]) >= MAL && p[0] !== p[1]) sp.vinner = p[0] > p[1] ? 0 : 1;
      // The catch-up rule: full marks and still behind → the same team goes again.
      else if (poeng === 4 && p[sp.tur] < p[1 - sp.tur]) runde.igjen = true;
    }
    R.vis();
    window.scrollTo(0, 0);
    fokuser("#skjerm-tittel");
    spillAvsloring(S);
  }

  // The "install as an app" tip at a calm moment – only if the players are still on the screen.
  // (The kit shows it after R.kveld.registrer; «Sammen» has no evening score and asks here.)
  function visTipsSnart() {
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && R.visInstallTips(), 2500);
  }

  // To «Kåringen». The game is counted once, the first time: the record («Sammen»), the
  // evening's scoreboard («Lag mot lag»), statistics. A round that was not locked does not count.
  function tilKaringen(S, avbrutt) {
    const sp = S.spill;
    if (!sp.slutt) {
      sp.slutt = true;
      sp.avbrutt = !!avbrutt;
      sp.rekord = null;
      const spilt = sp.logg.length;
      if (sp.modus === "sammen" && !avbrutt) {
        const n = runder(sp);
        const sum = poengSum(sp);
        const forrige = Number.isInteger(S.rekord[n]) ? S.rekord[n] : null;
        sp.rekord = { forrige, ny: forrige == null || sum > forrige };
        if (sp.rekord.ny) S.rekord[n] = sum;
        S.rekordSist = n;
      }
      if (sp.modus === "lag" && spilt) {
        const p = poengSum(sp);
        R.kveld.registrer(sp.lag.map((l, i) => ({ navn: R.navn(i), poeng: p[l] })));
      }
      if (spilt) S.ferdige = (S.ferdige || 0) + 1;
      R.statistikk("ferdig", { modus: sp.modus, runder: spilt, avbrutt: !!avbrutt });
    }
    R.gaTil("slutt");
  }

  // ---------- Challenge links («Send en utfordring») ----------
  // …/tankeleseren/#s=<base64url>. One dial per link. The bytes: version · length and text of
  // the pack id · a hash of the card's two ends (4) · the target in tenths, veiled (2) · length
  // (2) and text of the hint (UTF-8) · check sum (4). A link is somebody else's text: lesKode
  // takes nothing for granted and gives null for everything it does not know.

  const UTF_VERSJON = 1;
  const HINT_MAKS = 40;
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function tilB64(b) {
    let ut = "";
    for (let i = 0; i < b.length; i += 3) {
      const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      ut += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "") + (i + 2 < b.length ? B64[n & 63] : "");
    }
    return ut;
  }
  function fraB64(tekst) {
    if (tekst.length % 4 === 1) return null;
    const b = [];
    for (let i = 0; i < tekst.length; i += 4) {
      const c = [0, 1, 2, 3].map((j) => (i + j < tekst.length ? B64.indexOf(tekst[i + j]) : 0));
      if (c.some((x) => x < 0)) return null;
      const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
      b.push((n >> 16) & 255);
      if (i + 2 < tekst.length) b.push((n >> 8) & 255);
      if (i + 3 < tekst.length) b.push(n & 255);
    }
    return tilB64(b) === tekst ? b : null; // one spelling per link, no loose bits at the end
  }
  // (murmur3's last step: every bit of the input moves every bit of the output)
  const bland = (h) => {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const somTekst = (b) => b.map((x) => String.fromCharCode(x)).join("");
  const sjekksum = (b) => bland(R.hash("tl-skive:" + somTekst(b)));
  // The target cannot be read off the link: it is mixed with a number made from the card and the hint.
  const slor = (kortHash, hintBytes) => bland(kortHash ^ R.hash("tl-mal:" + somTekst(hintBytes))) & 0xffff;
  const utf8 = (tekst) => Array.from(new TextEncoder().encode(tekst));
  const fraUtf8 = (b) => new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(b));

  // What a player typed, or what a link carries, as one line of plain text: no control or
  // invisible formatting characters (they can hide or turn text around), single spaces, at
  // most 40 characters. A joiner survives only inside an emoji (👩‍🚀); stacked accents are thinned.
  const USYNLIG = /[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFEFF\uFFA0\uFFF0-\uFFFC\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}]|[\uD800-\uDFFF]/gu;
  const AKSENT = "\\u0300-\\u036F\\u0483-\\u0489\\u1AB0-\\u1AFF\\u1DC0-\\u1DFF\\u20D0-\\u20FF\\uFE20-\\uFE2F";
  const AKSENTHAUG = new RegExp(`([${AKSENT}]{2})[${AKSENT}]+`, "g");
  function rensHint(tekst) {
    let t = String(tekst == null ? "" : tekst).slice(0, 2000);
    try {
      t = t.normalize("NFC");
    } catch (e) {
      /* keep the text as it is */
    }
    t = t
      .replace(/\s+/g, " ")
      .replace(USYNLIG, "")
      .replace(/\u200D/g, (m, i, s) => (/[\u203C-\u3299\uFE0F\uDC00-\uDFFF]/.test(s[i - 1] || "") && /[\u203C-\u3299\uD83C-\uD83E]/.test(s[i + 1] || "") ? m : ""))
      .replace(AKSENTHAUG, "$1")
      .replace(/ +/g, " ")
      .trim();
    return R.kutt(t, HINT_MAKS).trim();
  }
  // Size class for the hint above the dial: long hints get smaller letters.
  const hintKlasse = (tekst) => (tekst.length > 26 ? " lang2" : tekst.length > 15 ? " lang1" : "");

  // { kort, mal, hint } → the text after «#s=» ("" when there is nothing to send).
  function lagKode(u) {
    const k = ALLE[u.kort];
    if (!k) return "";
    const hint = utf8(rensHint(u.hint));
    const id = Array.from(k.p).map((c) => c.charCodeAt(0));
    if (!hint.length || hint.length > 480 || !id.length || id.length > 16 || !/^[a-z0-9-]+$/.test(k.p)) return "";
    const mal = Math.round(u.mal * 10) ^ slor(k.n, hint);
    const b = [UTF_VERSJON, id.length, ...id, (k.n >>> 24) & 255, (k.n >>> 16) & 255, (k.n >>> 8) & 255, k.n & 255, (mal >> 8) & 255, mal & 255, (hint.length >> 8) & 255, hint.length & 255, ...hint];
    const s = sjekksum(b);
    b.push((s >>> 24) & 255, (s >>> 16) & 255, (s >>> 8) & 255, s & 255);
    return tilB64(b);
  }
  // The text after «#s=» → { k (the link's own number), kort, par, mal, hint }, or null.
  function lesKode(kode) {
    try {
      if (typeof kode !== "string" || !/^[A-Za-z0-9_-]{20,720}$/.test(kode)) return null;
      const b = fraB64(kode);
      if (!b || b.length < 16) return null;
      const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
      const slutt = b.length - 4;
      if (sjekksum(b.slice(0, slutt)) !== u32(slutt)) return null;
      let p = 0;
      if (b[p++] !== UTF_VERSJON) return null;
      const idLengde = b[p++];
      if (idLengde < 1 || idLengde > 16 || p + idLengde + 8 >= slutt) return null;
      const id = somTekst(b.slice(p, p + idLengde));
      p += idLengde;
      if (!/^[a-z0-9-]+$/.test(id)) return null;
      const n = u32(p);
      p += 4;
      const skjult = (b[p] << 8) | b[p + 1];
      p += 2;
      const lengde = (b[p] << 8) | b[p + 1];
      p += 2;
      if (lengde < 1 || lengde > 480 || p + lengde !== slutt) return null; // nothing may follow the hint
      const hintBytes = b.slice(p, slutt);
      const hint = rensHint(fraUtf8(hintBytes));
      const mal = (skjult ^ slor(n, hintBytes)) / 10;
      if (!hint || !(mal >= 3 && mal <= 97)) return null;
      let kort = ALLE.findIndex((k) => k.p === id && k.n === n);
      if (kort < 0) kort = ALLE.findIndex((k) => k.n === n); // the card may have moved to another pack
      if (kort < 0) return null;
      return { k: u32(slutt), kort, par: [ALLE[kort].v, ALLE[kort].h], mal, hint };
    } catch (e) {
      return null;
    }
  }
  const lenkeTil = (kode) => location.origin + location.pathname + "#s=" + kode;
  const SPILLADRESSE = () => location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "tankeleseren") + "/";

  // A new challenge to make: two cards and a target. One with a hint that has not been sent yet
  // is kept as it is (a reload or a trip to the home screen must not lose what was written).
  function nyUtfordring(S, tving) {
    const u = S.utf.lag;
    if (u && !u.delt && u.hint && !tving) return;
    const ny = { kort: 0, alt: -1, par: ["", ""], mal: 50, sett: false, hint: "", delt: false };
    trekkKort(ny, S.oppsett.pakker.length ? S.oppsett.pakker : STANDARD);
    S.utf.lag = ny;
  }
  const lagKnappTekst = (u) => (!u.sett ? R.t("Se målet først") : !u.hint ? R.t("Skriv et hint først") : R.t("Del utfordringen"));
  // The main button on the «lag» screen follows the peek and the typing without a redraw.
  function oppdaterLag(S) {
    const u = S.utf.lag;
    const k = R.$("#tl-klar");
    if (!u || !k) return;
    k.disabled = !(u.sett && u.hint);
    k.textContent = lagKnappTekst(u);
  }
  // An answer is kept (the 30 last), so a link that is opened again shows what was answered.
  function huskSvar(S, u) {
    S.utf.svar = S.utf.svar.filter((s) => s.k !== u.k).concat({ k: u.k, v: u.viser }).slice(-30);
  }

  // ---------- Markup ----------

  const rundeTittel = (S) => {
    const sp = S.spill;
    if (!sp) return "";
    return sp.modus === "sammen" ? R.t("Runde {n} av {av}", { n: Math.min(sp.runde, runder(sp)), av: runder(sp) }) : R.t("Runde {n} · {lag}", { n: sp.runde, lag: LAG[sp.tur].navn });
  };

  function statusHtml(sp) {
    const vis = synligeRunder(sp);
    if (sp.modus === "sammen") {
      const antall = runder(sp);
      const sum = poengSum(sp, vis);
      const poeng = `<p class="tl-sum"><b>${sum}</b> ${esc(R.t("poeng|poeng", { n: sum }))}</p>`;
      // Up to 10 rounds: one dot per round with its points. More: a bar (it must fit at 320 px).
      if (antall > 10) {
        return `<div class="tl-status sammen"><div class="tl-framdrift" aria-hidden="true"><i style="width: ${(Math.min(vis, antall) / antall) * 100}%"></i></div><span class="tl-runde-av">${Math.min(sp.runde, antall)}/${antall}</span>${poeng}</div>`;
      }
      const pips = Array.from({ length: antall }, (_, i) => {
        const l = i < vis ? sp.logg[i] : null;
        const na = !l && i === sp.runde - 1;
        return `<span class="tl-pip${l ? " p" + l.poeng : ""}${na ? " na" : ""}">${l ? l.poeng : i + 1}</span>`;
      }).join("");
      return `<div class="tl-status sammen"><div class="tl-pips" aria-hidden="true">${pips}</div>${poeng}</div>`;
    }
    const p = poengSum(sp, vis);
    const avgjort = sp.vinner != null && sp.avslort; // don't give the winner away before the cover opens
    const lag = (l) =>
      `<div class="tl-lagpoeng ${LAG[l].klasse}${sp.tur === l && !avgjort ? " aktiv" : ""}"><span>${LAG[l].navn}</span><b>${p[l]}</b><i style="width: ${Math.min(100, (p[l] / MAL) * 100)}%"></i></div>`;
    return `<div class="tl-status lag">${lag(0)}<span class="tl-mot">${esc(R.t("først til {n}", { n: MAL }))}</span>${lag(1)}</div>`;
  }

  // The stamp and the line under it when the cover has opened.
  function stempelHtml(poeng, tekstHtml, ekstraHtml) {
    const stempel = { 4: "aksent", 3: "lampe", 2: "mynte", 0: "" }[poeng];
    return `<div class="tl-resultat">
      <div class="stempel-sted"><span class="stempel ${stempel}">${poeng ? esc(R.t("{n} poeng", { n: poeng })) : esc(R.t("Bom!"))}</span></div>
      <p class="tl-kommentar">${tekstHtml}</p>
      ${ekstraHtml || ""}
    </div>`;
  }
  const VENTER = `<div class="tl-resultat venter" aria-hidden="true"><span class="tl-spenning">${esc(R.t("Og målet er …"))}</span></div>`;

  function resultatHtml(sp) {
    const l = sp.logg[sp.logg.length - 1];
    let ekstra = "";
    if (sp.modus === "lag") {
      const m = LAG[1 - l.lag];
      ekstra = l.tipp
        ? `<p class="tl-tipp">${esc(l.tipp === "v" ? R.t("{lag} tippet «venstre»", { lag: m.navn }) : R.t("{lag} tippet «høyre»", { lag: m.navn }))} – ${l.tippRiktig ? `<b>${esc(R.t("riktig, +1!"))}</b>` : esc(R.t("ikke riktig denne gangen."))}</p>`
        : `<p class="tl-tipp">${esc(R.t("{lag} sto over.", { lag: m.navn }))}</p>`;
      if (l.igjen) ekstra += `<p class="tl-igjen ${LAG[l.lag].klasse}">${esc(R.t("Full pott og fortsatt bak:"))} <b>${esc(R.t("{lag} får en runde til!", { lag: LAG[l.lag].navn }))}</b></p>`;
    }
    return stempelHtml(l.poeng, `${esc(kommentar(l.poeng, sp.logg.length))}${sp.modus === "lag" ? ` <span>${LAG[l.lag].navn} +${l.poeng}</span>` : ""}`, ekstra);
  }

  // The hint above the dial: a field while it can be typed («gjett» and when a challenge is
  // made), plain text afterwards. Everything typed is shown with esc(), as text.
  function hintFelt(o) {
    return `<div class="tl-hint${o.verdi ? " har" : ""}${hintKlasse(o.verdi)}">
      <label class="tl-hint-merke" for="tl-hint">${esc(o.merke)}</label>
      <input class="tl-hint-felt" id="tl-hint" data-felt="hint" type="text" value="${esc(o.verdi)}" maxlength="${HINT_MAKS}" placeholder="${esc(o.plass)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
    </div>`;
  }
  const hintVist = (tekst, merke) =>
    tekst ? `<p class="tl-hint vist${hintKlasse(tekst)}"><span class="tl-hint-merke">${esc(merke)}</span><span class="tl-hint-tekst">${esc(R.t("«{tekst}»", { tekst }))}</span></p>` : "";
  // The card with the hint over it (beside it on a phone on its side).
  const kortrad = (hintHtml, o) => `<div class="tl-kortrad">${hintHtml}${kortHtml(o)}</div>`;

  const finHtml = (o) => `<div class="tl-fin">
      <button class="tl-finknapp" data-h="flytt" data-v="-1" data-stille aria-label="${esc(R.t("Flytt viseren mot «{ende}»", { ende: o.par[0] }))}">◀</button>
      <span class="tl-fin-tekst" aria-hidden="true">${esc(R.t("Dra – eller finjuster"))}</span>
      <button class="tl-finknapp" data-h="flytt" data-v="1" data-stille aria-label="${esc(R.t("Flytt viseren mot «{ende}»", { ende: o.par[1] }))}">▶</button>
    </div>`;

  const HOLDKNAPP = `<button class="tl-holdknapp" type="button" aria-expanded="false" aria-describedby="tl-kikk-hjelp"><span class="tl-holdikon" aria-hidden="true">👆</span>${esc(R.t("Hold fingeren her for å se"))}</button>`;

  // The other card of the round: one tap swaps it in (the two cards change places).
  function byttKnapp(o) {
    const k = ALLE[o.alt];
    if (!k || o.alt === o.kort) return "";
    return `<button class="knapp-2 tl-bytt" data-h="bytt-kort" aria-label="${esc(R.t("Bytt skala til «{a}» – «{b}»", { a: k.v, b: k.h }))}"><span class="tl-bytt-merke">${esc(R.t("Bytt til"))}</span><span class="tl-bytt-par">${esc(k.v)} <i aria-hidden="true">↔</i> ${esc(k.h)}</span></button>`;
  }

  function loggHtml(sp) {
    return `<ol class="tl-logg">${sp.logg
      .map((l, n) => {
        const lag = l.lag != null ? ` ${LAG[l.lag].klasse}` : "";
        const hvem = l.hint
          ? esc(R.t("{hint} fra {navn}", { navn: R.navn(l.giver) })).replace("{hint}", () => `<span class="tl-logg-hint">${esc(R.t("«{tekst}»", { tekst: l.hint }))}</span>`)
          : esc(R.t("Hint fra {navn}", { navn: R.navn(l.giver) }));
        return `<li class="${lag}"><span class="tl-mini">${miniSkive(l)}</span><span class="tl-logg-tekst"><b>${esc(l.par[0])} ↔ ${esc(l.par[1])}</b><small>${n + 1}. ${hvem}${
          l.tippRiktig ? ` · ${esc(R.t("motlaget +1"))}` : ""
        }</small></span><span class="tl-logg-poeng p${l.poeng}"><span class="vh">${esc(R.t("{n} poeng", { n: l.poeng }))}</span><span aria-hidden="true">${l.poeng}</span></span></li>`;
      })
      .join("")}</ol>`;
  }

  // What «Del resultatet» sends: numbers and one sign per round, never anything a player typed.
  function delTekst(sp) {
    const rad = (logg) => logg.map((l) => TEGN[l.poeng]).join("");
    if (sp.modus === "sammen") {
      const sum = poengSum(sp);
      return `${R.t("Tankeleseren")} ${sum}/${sp.logg.length * 4} – ${vurdering(sum, sp.logg.length).tittel} ${rad(sp.logg)}`;
    }
    const p = poengSum(sp);
    const v = leder(sp);
    const topp = v == null ? R.t("uavgjort {a}–{b}", { a: p[0], b: p[1] }) : R.t("{lag} vinner {a}–{b}", { lag: LAG[v].navn, a: p[v], b: p[1 - v] });
    return `${R.t("Tankeleseren")} – ${topp}\n${[0, 1].map((l) => `${LAG[l].navn} ${rad(sp.logg.filter((x) => x.lag === l)) || "–"}`).join(" · ")}`;
  }

  function lageneHtml(S) {
    const o = S.oppsett;
    const kol = (l) => {
      const navn = [];
      for (let i = 0; i < S.antall; i++)
        if (o.lag[i] === l)
          navn.push(`<button class="tl-lagspiller" data-h="bytt-lag" data-v="${i}" aria-label="${esc(R.t("{navn} – flytt til {lag}", { navn: R.navn(i), lag: LAG[1 - l].navn }))}">${R.avatar(i)}<span>${esc(R.navn(i))}</span></button>`);
      return `<div class="tl-lagkolonne ${LAG[l].klasse}"><h3>${LAG[l].navn} <span>${navn.length}</span></h3>${navn.join("") || `<p class="hjelp">${esc(R.t("Ingen ennå"))}</p>`}</div>`;
    };
    return `<section class="seksjon">
      <div class="seksjon-hode"><h2>${esc(R.t("Lagene"))}</h2><button class="lenke" data-h="stokk-lag">🔀 ${esc(R.t("Stokk lagene"))}</button></div>
      <div class="tl-lagene">${kol(0)}${kol(1)}</div>
      <p class="hjelp">${esc(R.t("Trykk på et navn for å bytte lag."))}</p>
    </section>`;
  }

  // Keep one team value per player, balanced as players come and go.
  function ordneLag(S) {
    const o = S.oppsett;
    o.lag = (Array.isArray(o.lag) ? o.lag : []).slice(0, S.antall).map((l) => (l === 1 ? 1 : 0));
    while (o.lag.length < S.antall) {
      const rosa = o.lag.filter((l) => l === 0).length;
      o.lag.push(rosa > o.lag.length - rosa ? 1 : 0);
    }
  }

  function startHindring(S) {
    const o = S.oppsett;
    if (!o.pakker.length) return R.t("Velg minst én kortstokk.");
    if (o.modus === "lag") {
      ordneLag(S);
      const rosa = o.lag.filter((l) => l === 0).length;
      if (rosa < 2 || S.antall - rosa < 2) return R.t("Hvert lag trenger minst to spillere.");
    }
    return null;
  }

  // The record chip on the home screen: the best «Sammen» result for the length the setup gives
  // now, else for the length that was played last.
  function rekordMerke(S) {
    const n = [runderFor(S.antall), S.rekordSist, ...Object.keys(S.rekord).map(Number)].find((x) => Number.isInteger(S.rekord[x]));
    return n ? [[R.t("REKORD"), R.t("{n} av {av}", { n: S.rekord[n], av: n * 4 })]] : [];
  }

  // ---------- Saved state: everything is checked on the way in ----------

  const erObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const erHeltall = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  const erTall = (x, min, max) => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
  const erPar = (x) => Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && typeof x[1] === "string";
  const erKort = (x) => erHeltall(x, 0, ALLE.length - 1);
  const gruppe = () => R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 3, 2, 20);

  // A saved party game: tidied where that is safe, null if anything is out of range or of the
  // wrong type (then the home screen shows «Start spill» instead of a broken «Fortsett»).
  function rensSpill(sp) {
    if (!erObj(sp) || (sp.modus !== "sammen" && sp.modus !== "lag")) return null;
    const lag = sp.modus === "lag";
    if (!erHeltall(sp.antall, 2, 20)) return null;
    sp.pakker = Array.isArray(sp.pakker) ? sp.pakker.filter((id) => typeof id === "string" && pakke(id)) : [];
    if (!sp.pakker.length) sp.pakker = STANDARD.slice();
    if (lag) {
      if (!Array.isArray(sp.lag) || sp.lag.length !== sp.antall || !sp.lag.every((l) => l === 0 || l === 1)) return null;
      if (!sp.lag.includes(0) || !sp.lag.includes(1)) return null;
      if (!Array.isArray(sp.teller) || sp.teller.length !== 2 || !sp.teller.every((n) => erHeltall(n, 0, 99999))) return null;
      if (sp.tur !== 0 && sp.tur !== 1) return null;
      if (sp.vinner != null && sp.vinner !== 0 && sp.vinner !== 1) return null;
      if (sp.vinner == null) sp.vinner = null;
      sp.runder = null;
    } else {
      sp.lag = null;
      sp.vinner = null;
      sp.teller = [0, 0];
      sp.tur = sp.tur === 1 ? 1 : 0;
      if (!erHeltall(sp.runder, 1, 40)) sp.runder = runderFor(sp.antall);
    }
    if (!erHeltall(sp.runde, 1, 99999)) return null;
    if (!Array.isArray(sp.logg) || sp.logg.length > 500 || (!lag && sp.logg.length > sp.runder)) return null;
    for (const l of sp.logg) {
      if (!erObj(l) || !erPar(l.par) || !erTall(l.mal, 0, 100) || !erTall(l.viser, 0, 100) || ![0, 2, 3, 4].includes(l.poeng)) return null;
      if (!erHeltall(l.giver, 0, sp.antall - 1)) return null;
      if (lag ? l.lag !== 0 && l.lag !== 1 : false) return null;
      if (!lag) l.lag = null;
      l.tipp = l.tipp === "v" || l.tipp === "h" ? l.tipp : null;
      l.tippRiktig = lag && l.tipp ? l.tippRiktig === true : null;
      l.hint = rensHint(typeof l.hint === "string" ? l.hint : "");
      l.igjen = lag && l.igjen === true;
      if (!Number.isInteger(l.kort)) l.kort = 0;
    }
    if (!erPar(sp.par) || !erTall(sp.mal, 0, 100) || !erTall(sp.viser, 0, 100)) return null;
    if (!["gjett", "motlag", "fasit"].includes(sp.fase)) return null;
    if ((sp.fase === "motlag" && !lag) || (sp.fase === "fasit" && !sp.logg.length)) return null;
    if (!erHeltall(sp.giver, 0, sp.antall - 1)) return null;
    if (!erKort(sp.kort)) sp.kort = 0; // (only the colours of the card hang on it)
    sp.alt = erKort(sp.alt) && sp.alt !== sp.kort ? sp.alt : -1;
    sp.hint = rensHint(typeof sp.hint === "string" ? sp.hint : "");
    sp.sett = sp.sett === true;
    sp.avslort = sp.avslort === true;
    sp.tipp = sp.tipp === "v" || sp.tipp === "h" ? sp.tipp : null;
    sp.skjerm = sp.skjerm === "skive" ? "skive" : "gi";
    sp.slutt = sp.slutt === true;
    sp.avbrutt = sp.avbrutt === true;
    const r = sp.rekord;
    sp.rekord = erObj(r) ? { forrige: erHeltall(r.forrige, 0, 160) ? r.forrige : null, ny: r.ny === true } : null;
    return sp;
  }

  function rensUtf(u) {
    const ut = { lag: null, mot: null, svar: [] };
    if (!erObj(u)) return ut;
    const l = u.lag;
    if (erObj(l) && erKort(l.kort) && erTall(l.mal, 0, 100))
      ut.lag = { kort: l.kort, alt: erKort(l.alt) && l.alt !== l.kort ? l.alt : -1, par: [ALLE[l.kort].v, ALLE[l.kort].h], mal: l.mal, sett: l.sett === true, hint: rensHint(typeof l.hint === "string" ? l.hint : ""), delt: l.delt === true };
    const m = u.mot;
    if (erObj(m) && erKort(m.kort) && erPar(m.par) && erTall(m.mal, 0, 100) && erTall(m.viser, 0, 100) && (m.fase === "gjett" || m.fase === "fasit") && typeof m.hint === "string" && rensHint(m.hint)) {
      const fasit = m.fase === "fasit";
      ut.mot = {
        k: erHeltall(m.k, 0, 4294967295) ? m.k : 0,
        kort: m.kort,
        par: [m.par[0], m.par[1]],
        mal: m.mal,
        hint: rensHint(m.hint),
        viser: m.viser,
        fase: m.fase,
        avslort: fasit && m.avslort === true,
        poeng: fasit ? poengFor(Math.abs(m.viser - m.mal)) : null,
        for: m.for === true,
      };
    }
    if (Array.isArray(u.svar)) ut.svar = u.svar.filter((s) => erObj(s) && erHeltall(s.k, 0, 4294967295) && erTall(s.v, 0, 100)).slice(-30).map((s) => ({ k: s.k, v: s.v }));
    return ut;
  }

  function rensRekord(r) {
    const ut = {};
    if (erObj(r)) for (const [n, p] of Object.entries(r)) if (/^[1-9]\d?$/.test(n) && Number(n) <= 40 && erHeltall(p, 0, Number(n) * 4)) ut[n] = p;
    return ut;
  }

  let ugyldigLenke = false; // a link that could not be read: said on the home screen

  // ---------- The app ----------

  R.start({
    id: "tankeleseren",
    versjon: 1,

    // In progress until the last round is locked or the game is ended (front page «Fortsett»
    // badge, screen kept on).
    pagar: (S) => pagar(S),

    tilstand: () => ({
      antall: gruppe(),
      oppsett: { modus: "sammen", pakker: STANDARD.slice(), lag: [] },
      spill: null,
      rekord: {}, // «Sammen»: number of rounds → the best sum on this phone
      rekordSist: 0,
      ferdige: 0, // games that reached «Kåringen» (the example for the first hint)
      jul: 0, // the season «Jul» was switched on for
      utf: { lag: null, mot: null, svar: [] }, // challenges: its own part, never the party game
    }),

    lastet(S) {
      const o = erObj(S.oppsett) ? S.oppsett : {};
      S.oppsett = {
        modus: o.modus === "lag" ? "lag" : "sammen",
        pakker: Array.isArray(o.pakker) ? PAKKER.map((p) => p.id).filter((id) => o.pakker.includes(id)) : STANDARD.slice(),
        lag: Array.isArray(o.lag) ? o.lag.slice(0, 20).map((l) => (l === 1 ? 1 : 0)) : [],
      };
      S.jul = erHeltall(S.jul, 2000, 2999) ? S.jul : 0;
      julRegel(S);
      if (!S.oppsett.pakker.length) S.oppsett.pakker = STANDARD.slice();
      S.antall = erTall(S.antall, 2, 20) ? Math.round(S.antall) : gruppe();
      if (S.oppsett.modus === "lag" && S.antall < 4) S.antall = 4;
      S.rekord = rensRekord(S.rekord);
      S.rekordSist = erHeltall(S.rekordSist, 1, 40) ? S.rekordSist : 0;
      S.ferdige = erHeltall(S.ferdige, 0, 1e9) ? S.ferdige : 0;
      S.spill = rensSpill(S.spill);
      S.utf = rensUtf(S.utf);
      const sk = S.skjerm;
      if (!["hjem", "oppsett", "gi", "hint", "skive", "slutt", "lag", "utf"].includes(sk)) S.skjerm = "hjem";
      else if (!S.spill && ["gi", "hint", "skive", "slutt"].includes(sk)) S.skjerm = "hjem";
      else if (S.spill && S.spill.slutt && ["gi", "hint", "skive"].includes(sk)) S.skjerm = "hjem";
      else if ((sk === "lag" && !S.utf.lag) || (sk === "utf" && !S.utf.mot)) S.skjerm = "hjem";
    },

    // …/tankeleseren/#s=… opens a challenge. It lives in S.utf: a party game in progress is
    // still there under «Fortsett». Anything else in the address is not a link we know.
    vedHash(S, hash) {
      const m = /^s=(.+)$/.exec(String(hash || ""));
      const u = m ? lesKode(m[1]) : null;
      if (!u) {
        ugyldigLenke = true;
        return "hjem";
      }
      const svart = S.utf.svar.find((s) => s.k === u.k);
      S.utf.mot = svart
        ? Object.assign(u, { viser: svart.v, fase: "fasit", avslort: true, poeng: poengFor(Math.abs(svart.v - u.mal)), for: true })
        : Object.assign(u, { viser: 50, fase: "gjett", avslort: false, poeng: null, for: false });
      return "utf";
    },

    regler: {
      intro: R.t("Én ser et hemmelig mål på skiva og gir ett hint. De andre prøver å lese tankene – og drar viseren dit de tror målet er."),
      steg: [
        [R.t("Se målet i smug"), R.t("Hintgiveren holder inne på skiva og ser hvor målet ligger mellom de to ytterpunktene på kortet.")],
        [R.t("Gi ett hint"), R.t("Si noe som hører hjemme akkurat der. Eksempel: Kaldt ↔ Varmt, målet litt mot varmt – «badevann».")],
        [R.t("Dra viseren"), R.t("De andre diskuterer og drar viseren dit de tror. Lås svaret. Jo nærmere midten, desto flere poeng (4, 3 eller 2).")],
      ],
      tips: [
        R.t("Ikke si tall, prosent eller «litt til venstre». Bare hintet!"),
        R.t("Passer ikke skalaen? Hintgiveren har to å velge mellom – «Bytt til» nederst på skjermen bytter."),
        R.t("Skriv gjerne hintet i feltet over skiva, så husker alle hva som ble sagt."),
        R.t("Sammen: åtte runder, og alle bytter på å gi hint. Hvor mange av 32 poeng klarer dere? Mobilen husker rekorden."),
        R.t("Lag mot lag: når det ene laget har låst svaret, kan det andre tippe om målet er til venstre eller høyre for viseren. Riktig gir 1 poeng."),
        R.t("Lag mot lag: får et lag full pott (4 poeng) og ligger fortsatt bak, får det en runde til."),
        R.t("Send en utfordring: lag en skive med ett hint, og send lenken til en venn."),
        R.t("Viseren kan også flyttes med ◀ ▶ eller piltastene."),
      ],
    },

    vedSpillere(S) {
      ordneLag(S);
    },

    // The hint field: saved as it is typed, never redrawn (the caret stays where it is).
    felt: {
      hint(S, el) {
        const o = S.skjerm === "lag" ? S.utf.lag : S.skjerm === "skive" ? S.spill : null;
        if (!o) return;
        o.hint = rensHint(el.value);
        const boks = el.closest(".tl-hint");
        if (boks) boks.className = `tl-hint${o.hint ? " har" : ""}${hintKlasse(o.hint)}`;
        if (S.skjerm === "lag") oppdaterLag(S);
        R.lagre();
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          let igang = false;
          let tekst = "";
          try {
            igang = pagar(S);
            if (igang) tekst = S.spill.modus === "sammen" ? R.t("Fortsett · runde {n} av {av}", { n: S.spill.runde, av: runder(S.spill) }) : R.t("Fortsett · runde {n} · {lag}", { n: S.spill.runde, lag: LAG[S.spill.tur].navn });
          } catch (e) {
            // A saved game that cannot be read must never take the home screen down with it.
            S.spill = null;
            igang = false;
          }
          // With a game in progress there are two big buttons already: the challenge is a link then.
          const ekstra = igang
            ? R.ui.lenkerad(R.ui.lenke(R.t("Send en utfordring"), "utfordre"), R.ui.lenke(R.t("Slik spiller du"), "regler"))
            : R.ui.knapp2(R.t("Send en utfordring"), "utfordre") + R.ui.lenke(R.t("Slik spiller du"), "regler");
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Ett hint. Én skive."))}<br><em>${esc(R.t("Er dere på samme bølgelengde?"))}</em>`,
            knapperHtml: R.ui.startKnapper({ pagar: igang, fortsettTekst: tekst, ekstraHtml: ekstra }),
            merker: [...rekordMerke(S), ["2–20", R.t("spillere")], [String(ALLE.length), R.t("skalaer")], ["0", R.t("reklame")]],
          });
        },
        inn() {
          if (!ugyldigLenke) return;
          ugyldigLenke = false;
          R.toast(R.t("Lenken er ikke gyldig"), { topp: true });
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const lag = o.modus === "lag";
          if (lag) ordneLag(S);
          const hindring = startHindring(S);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${R.ui.fliser(
              "modus",
              [
                { v: "sammen", ikon: "🤝", tittel: R.t("Sammen"), tekst: R.t("Alle mot skiva, {n} runder", { n: runderFor(S.antall) }) },
                { v: "lag", ikon: "⚔️", tittel: R.t("Lag mot lag"), tekst: R.t("To lag, først til {n}", { n: MAL }) },
              ],
              o.modus,
            )}
            ${R.ui.spillere({
              min: lag ? 4 : 2,
              max: 20,
              hjelp: lag ? R.t("Lagene settes opp under. Alle bytter på å gi hint.") : S.antall > RUNDER ? R.t("Én runde per spiller – alle gir hint én gang.") : R.t("Alle bytter på å gi hint."),
            })}
            ${lag ? lageneHtml(S) : ""}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Kortstokker"))}</h2><span class="tall">${esc(R.t("{n} kort", { n: antallKort(o.pakker) }))}</span></div>
              ${R.ui.brikker(
                "pakke",
                pakkerVist().map((p) => ({ v: p.id, tekst: p.navn, ikon: p.ikon, antall: p.par.length })),
                o.pakker,
                { alle: true, etikett: R.t("Kortstokker") },
              )}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !!hindring }), hindring ? `<p class="hjelp">${esc(hindring)}</p>` : "")}`;
        },
      },

      gi: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const forrige = sp.logg[sp.logg.length - 1];
          const igjen = sp.modus === "lag" && sp.fase === "gjett" && forrige && forrige.igjen;
          const lag = sp.modus === "lag" ? `<p class="tl-lagmerke ${LAG[sp.tur].klasse}"><i aria-hidden="true"></i>${esc(igjen ? R.t("Ekstrarunde: {lag} gir hint igjen", { lag: LAG[sp.tur].navn }) : R.t("{lag} gir hint", { lag: LAG[sp.tur].navn }))}</p>` : "";
          return `${lag}${R.ui.giTil({ i: sp.giver, h: "jeg-er", tekst: R.t("Hintgiver denne runden"), knapp: R.t("Jeg er {navn}", { navn: R.navn(sp.giver) }), advarsel: R.t("Bare hintgiveren ser skiva nå") })}`;
        },
        inn(S) {
          S.spill.skjerm = "gi";
          R.holdVaken();
        },
      },

      hint: {
        tittel: rundeTittel,
        tilbake: "hjem",
        gjenoppta: "gi", // after a reload, hand the phone over again before the target can be seen
        vis(S) {
          const sp = S.spill;
          return `
            <div class="tl-hint-topp">
              <p class="etikett">${esc(R.t("Bare for {navn}", { navn: R.navn(sp.giver) }))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Se målet i smug"))}</h1>
            </div>
            ${kortHtml(sp)}
            ${skiveHtml(sp, { modus: "kikk", mal: true })}
            ${HOLDKNAPP}
            <p class="hjelp" id="tl-kikk-hjelp">${kikkHjelp(S, sp)}</p>
            ${R.ui.dokk(R.ui.knapp(sp.sett ? R.t("Jeg har et hint!") : R.t("Se målet først"), "hint-klar", { av: !sp.sett, id: "tl-klar" }), byttKnapp(sp))}`;
        },
        inn(S) {
          S.spill.skjerm = "hint";
        },
        etter(S, rot) {
          const skive = rot.querySelector(".tl-skive");
          koblingKikk(S, skive, skive);
          koblingKikk(S, rot.querySelector(".tl-holdknapp"), skive);
        },
        ut(S) {
          lukkKikk(S, true);
        },
      },

      skive: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const giver = R.navn(sp.giver);
          let topp = "";
          let hint = "";
          let skive = "";
          let dokk = "";
          let resultat = "";
          if (sp.fase === "gjett") {
            topp = `<h1 id="skjerm-tittel" tabindex="-1" class="tl-sporsmal gjett">${sp.modus === "lag" ? `<span class="tl-farge ${LAG[sp.tur].klasse}">${LAG[sp.tur].navn}:</span> ` : ""}${esc(R.t("Hvor er målet?"))}</h1>
              <p class="tl-under gjett">${esc(R.t("Hør på hintet fra {navn} og dra viseren.")).replace("{navn}", () => `<b>${esc(giver)}</b>`)}</p>`;
            hint = hintFelt({ verdi: sp.hint, merke: R.t("Hintet"), plass: R.t("Hva sa {navn}? (valgfritt)", { navn: giver }) });
            skive = `${skiveHtml(sp, { modus: "dra", viser: true })}${finHtml(sp)}`;
            dokk = R.ui.dokk(R.ui.knapp(R.t("Lås svaret"), "las"), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")));
          } else if (sp.fase === "motlag") {
            const m = LAG[1 - sp.tur];
            topp = `<h1 id="skjerm-tittel" tabindex="-1" class="tl-sporsmal"><span class="tl-farge ${m.klasse}">${m.navn}:</span> ${esc(R.t("venstre eller høyre?"))}</h1>
              <p class="tl-under">${esc(R.t("Ligger målet til venstre eller høyre for viseren? Riktig gir 1 poeng."))}</p>`;
            hint = hintVist(sp.hint, R.t("Hintet"));
            skive = skiveHtml(sp, { modus: "fast", viser: true, etikett: R.t("Viseren står på {n} av 100", { n: Math.round(sp.viser) }) });
            dokk = R.ui.dokk(
              `<div class="knapprad">${R.ui.knapp(R.t("Venstre"), "tipp", { v: "v", variant: m.knapp, ikon: "◀" })}${R.ui.knapp("", "tipp", { v: "h", variant: m.knapp, tekstHtml: `${esc(R.t("Høyre"))}<span class="ikon" aria-hidden="true">▶</span>` })}</div>`,
              R.ui.lenkerad(R.ui.lenke(R.t("Vi står over"), "tipp", { v: "-" }), R.ui.lenke(`↶ ${R.t("Angre – {lag} flytter viseren", { lag: LAG[sp.tur].navn })}`, "angre-las")),
            );
          } else {
            const l = sp.logg[sp.logg.length - 1];
            topp = `<h1 id="skjerm-tittel" tabindex="-1" class="vh">${esc(R.t("Fasit"))}</h1>`;
            hint = hintVist(l.hint, R.t("Hintet"));
            skive = skiveHtml(sp, {
              modus: "fast",
              viser: true,
              mal: true,
              apen: sp.avslort,
              etikett: sp.avslort ? R.t("Målet var ved {mal}, viseren sto ved {viser}", { mal: Math.round(sp.mal), viser: Math.round(sp.viser) }) : R.t("Skiva åpnes …"),
            });
            resultat = sp.avslort ? resultatHtml(sp) : VENTER;
            const siste = iMal(sp);
            const neste = sp.modus === "lag" ? R.t("Neste: {navn}", { navn: LAG[l.igjen ? l.lag : 1 - l.lag].navn }) : R.t("Neste runde");
            dokk = R.ui.dokk(R.ui.knapp(siste ? R.t("Til kåringen") : neste, "neste", { av: !sp.avslort }), siste ? "" : R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")));
          }
          return `${statusHtml(sp)}${topp}${kortrad(hint, sp)}${skive}${resultat}${dokk}`;
        },
        inn(S) {
          S.spill.skjerm = "skive";
          R.holdVaken();
          if (S.spill.fase === "fasit" && !S.spill.avslort) spillAvsloring(S);
        },
        etter(S, rot) {
          if (S.spill.fase !== "gjett") return;
          koblingDra(S, rot.querySelector(".tl-skive"));
          koblingFin(S, rot);
          const felt = rot.querySelector("#tl-hint");
          if (felt)
            felt.addEventListener("keydown", (e) => {
              if (e.key === "Enter") felt.blur(); // «Ferdig» on the keyboard puts it away
            });
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const spilt = sp.logg.length;
          const hale = `${spilt ? `${loggHtml(sp)}${R.ui.knapp2(R.t("Del resultatet"), "del")}` : ""}${R.ui.flereSpill({ antall: sp.antall })}${R.ui.dokk(
            R.ui.knapp(R.t("Spill igjen"), "igjen"),
            R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
          )}`;
          if (!spilt)
            return `${R.ui.banner({ klasse: "tl-banner", stemning: "", etikett: R.t("Avsluttet"), tittel: R.t("Ingen runder spilt"), tekst: R.t("Dere rakk ikke å låse noe svar denne gangen. Klar for en ny runde?") })}${hale}`;
          if (sp.modus === "sammen") {
            const sum = poengSum(sp);
            const maks = spilt * 4;
            const v = vurdering(sum, spilt);
            const andel = sum / maks;
            const rek = sp.rekord;
            const n = runder(sp);
            let rekord = "";
            if (rek && rek.ny && rek.forrige != null)
              rekord = `<div class="tl-rekord ny"><div class="stempel-sted"><span class="stempel mynte">${esc(R.t("Ny rekord!"))}</span></div><p class="hjelp">${esc(R.t("Den forrige var {n} av {av}.", { n: rek.forrige, av: n * 4 }))}</p></div>`;
            else if (rek && rek.ny) rekord = `<p class="hjelp tl-rekord">${esc(R.t("Første runde – nå har dere en rekord å slå!"))}</p>`;
            else if (rek && rek.forrige != null) rekord = `<p class="hjelp tl-rekord">${esc(R.t("Rekorden på denne mobilen:"))} <b>${esc(R.t("{n} av {av}", { n: rek.forrige, av: n * 4 }))}</b></p>`;
            return `
              ${R.ui.banner({
                klasse: "aksent tl-banner",
                stemning: andel >= 0.5 ? "jubel" : andel < 0.31 ? "lei" : "",
                etikett: sp.avbrutt ? R.t("{n} av {av} runder", { n: spilt, av: n }) : R.t("{n} runder", { n }),
                tittel: v.tittel,
                tekstHtml: `<span class="tl-total">${esc(R.t("{sum} av {maks} poeng", { maks })).replace("{sum}", () => `<b>${sum}</b>`)}</span>${esc(v.tekst)}`,
              })}
              ${rekord}
              ${hale}`;
          }
          const p = poengSum(sp);
          const vinner = leder(sp);
          const navn = vinner == null ? [] : medlemmer(sp, vinner).map((i) => R.navn(i));
          return `
            ${R.ui.banner({
              klasse: `tl-banner tl-vinner ${vinner == null ? "" : LAG[vinner].klasse}`, // sprak-ok
              stemning: vinner == null ? "" : "jubel",
              etikett: sp.avbrutt ? R.t("Avsluttet etter {runder}", { runder: R.flertall(spilt, "runde", "runder") }) : R.t("Først til {n} poeng", { n: MAL }),
              tittel: vinner == null ? R.t("Uavgjort!") : R.t("{navn} vinner!", { navn: LAG[vinner].navn }),
              tekstHtml: `<span class="tl-stilling"><span class="vh">${esc(R.t("Stillingen: {lag1} {a}, {lag2} {b}.", { lag1: LAG[0].navn, a: p[0], lag2: LAG[1].navn, b: p[1] }))}</span><span class="rosa" aria-hidden="true">${LAG[0].navn} <b>${p[0]}</b></span><span class="tl-strek" aria-hidden="true">–</span><span class="bla" aria-hidden="true"><b>${p[1]}</b> ${LAG[1].navn}</span></span>${
                navn.length && navn.length <= 6 ? `<span class="tl-vinnernavn">${esc(R.ramsOpp(navn))}</span>` : ""
              }`,
            })}
            ${hale}`;
        },
        inn(S) {
          const sp = S.spill;
          R.slippVaken();
          const spilt = sp.logg.length;
          if (sp.modus === "lag" ? spilt && leder(sp) != null : spilt && ((sp.rekord && sp.rekord.ny && sp.rekord.forrige != null) || poengSum(sp) >= spilt * 2)) {
            R.lyd.fanfare();
            R.konfetti(sp.modus === "lag" ? [LAG[leder(sp)].token, "--papir", "--aksent"] : undefined);
          } else {
            R.lyd.pling(); // a weak result gets warm words, not a party
          }
          if (sp.modus === "sammen" && spilt) visTipsSnart();
        },
      },

      // «Send en utfordring»: choose between two cards, see the target, type the hint, share.
      lag: {
        tittel: R.t("Utfordring"),
        tilbake: "hjem",
        vis(S) {
          const u = S.utf.lag;
          return `
            <div class="tl-hint-topp">
              <h1 id="skjerm-tittel">${esc(R.t("Lag en utfordring"))}</h1>
              <p class="tl-under">${esc(R.t("Se målet, skriv ett hint og send den til en venn."))}</p>
            </div>
            ${kortHtml(u)}
            ${skiveHtml(u, { modus: "kikk", mal: true })}
            ${HOLDKNAPP}
            ${hintFelt({ verdi: u.hint, merke: R.t("Hintet ditt"), plass: R.t("Skriv ett hint her") })}
            <p class="hjelp" id="tl-kikk-hjelp">${kikkHjelp(S, u)}</p>
            ${R.ui.dokk(R.ui.knapp(lagKnappTekst(u), "utf-del", { av: !(u.sett && u.hint), id: "tl-klar" }), u.delt ? R.ui.lenkerad(R.ui.lenke(R.t("Lag en ny"), "utf-ny")) : byttKnapp(u))}`;
        },
        etter(S, rot) {
          const skive = rot.querySelector(".tl-skive");
          koblingKikk(S, skive, skive);
          koblingKikk(S, rot.querySelector(".tl-holdknapp"), skive);
          const felt = rot.querySelector("#tl-hint");
          if (felt)
            felt.addEventListener("keydown", (e) => {
              if (e.key === "Enter") felt.blur();
            });
        },
        ut(S) {
          lukkKikk(S, true);
        },
      },

      // A challenge from a link: the card, the hint (somebody else's text) and a needle to place.
      utf: {
        tittel: R.t("Utfordring"),
        tilbake: "hjem",
        vis(S) {
          const u = S.utf.mot;
          const hint = hintVist(u.hint, R.t("Fra en venn"));
          if (u.fase === "gjett")
            return `
              <h1 id="skjerm-tittel" tabindex="-1" class="tl-sporsmal">${esc(R.t("Treffer du?"))}</h1>
              <p class="tl-under">${esc(R.t("En venn tenker på dette et sted mellom de to. Dra viseren dit du tror."))}</p>
              ${kortrad(hint, u)}
              ${skiveHtml(u, { modus: "dra", viser: true })}${finHtml(u)}
              ${R.ui.dokk(R.ui.knapp(R.t("Lås svaret"), "utf-las"))}`;
          const klar = u.avslort;
          return `
            <h1 id="skjerm-tittel" tabindex="-1" class="vh">${esc(R.t("Fasit"))}</h1>
            ${kortrad(hint, u)}
            ${skiveHtml(u, { modus: "fast", viser: true, mal: true, apen: klar, etikett: klar ? R.t("Målet var ved {mal}, viseren sto ved {viser}", { mal: Math.round(u.mal), viser: Math.round(u.viser) }) : R.t("Skiva åpnes …") })}
            ${klar ? stempelHtml(u.poeng, u.for ? esc(R.t("Du har svart på denne før.")) : esc(kommentar(u.poeng, u.k))) : VENTER}
            ${R.ui.dokk(
              `<div class="knapprad">${R.ui.knapp2(R.t("Del resultatet"), "utf-resultat", { av: !klar })}${R.ui.knapp(R.t("Send en tilbake"), "utf-svar", { av: !klar })}</div>`,
              R.ui.lenkerad(R.ui.lenke(R.t("Til Tankeleseren"), "hjem")),
            )}`;
        },
        inn(S) {
          const u = S.utf.mot;
          if (u.fase === "fasit" && !u.avslort) spillAvsloring(S);
        },
        etter(S, rot) {
          if (S.utf.mot.fase !== "gjett") return;
          koblingDra(S, rot.querySelector(".tl-skive"));
          koblingFin(S, rot);
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        R.gaTil(S.spill.skjerm === "skive" ? "skive" : "gi");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "lag" ? "lag" : "sammen";
        if (S.oppsett.modus === "lag" && S.antall < 4) S.antall = 4;
        ordneLag(S);
        R.vis();
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        if (id === "*") S.oppsett.pakker = liste.length === PAKKER.length ? [] : PAKKER.map((p) => p.id);
        else if (pakke(id)) S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      "bytt-lag"(el, e, S) {
        const i = Number(el.dataset.v);
        ordneLag(S);
        S.oppsett.lag[i] = 1 - S.oppsett.lag[i];
        R.vis();
      },
      "stokk-lag"(el, e, S) {
        const rekke = R.stokk(Array.from({ length: S.antall }, (_, i) => i));
        S.oppsett.lag = [];
        rekke.forEach((i, n) => (S.oppsett.lag[i] = n % 2));
        R.lyd.sveip();
        R.vis();
      },
      // Remove a player and keep the team list in step (the kit's version doesn't know about teams).
      "spiller-fjern"(el, e, S) {
        const min = S.oppsett.modus === "lag" ? 4 : 2;
        if (S.antall <= min) return;
        const i = Number(el.dataset.v);
        R.felles.navn.splice(i, 1);
        R.lagreFelles();
        S.antall -= 1;
        S.oppsett.lag.splice(i, 1);
        ordneLag(S);
        R.vis();
      },
      start(el, e, S) {
        if (startHindring(S)) return;
        const o = S.oppsett;
        S.spill = {
          modus: o.modus,
          antall: S.antall,
          pakker: o.pakker.slice(),
          lag: o.modus === "lag" ? o.lag.slice(0, S.antall) : null,
          teller: [0, 0],
          tur: R.nyttFro() % 2,
          runde: 1,
          runder: o.modus === "sammen" ? runderFor(S.antall) : null,
          logg: [],
          vinner: null,
          skjerm: "gi",
          kort: 0,
          alt: -1,
          par: ["", ""],
          mal: 50,
          viser: 50,
          fase: "gjett",
          sett: false,
          tipp: null,
          avslort: false,
          hint: "",
          slutt: false,
          avbrutt: false,
          rekord: null,
        };
        nyRunde(S);
        R.statistikk("start", { modus: o.modus, spillere: S.antall });
        R.holdVaken();
        R.gaTil("gi");
      },
      "jeg-er": () => {
        R.lyd.pop();
        R.gaTil("hint");
      },
      // The round's two cards change places (the target stays where it is).
      "bytt-kort"(el, e, S) {
        const o = S.skjerm === "lag" ? S.utf.lag : S.skjerm === "hint" ? S.spill : null;
        if (!o || !ALLE[o.alt] || o.alt === o.kort) return;
        lukkKikk(S, true);
        [o.kort, o.alt] = [o.alt, o.kort];
        o.par = [ALLE[o.kort].v, ALLE[o.kort].h];
        R.lyd.sveip();
        R.vis();
        R.si(R.t("Skalaen går nå fra «{a}» til «{b}».", { a: o.par[0], b: o.par[1] }));
      },
      "hint-klar"(el, e, S) {
        if (!S.spill.sett) return;
        R.gaTil("skive");
      },
      flytt(el, e, S) {
        if (el.dataset.gjentatt) {
          el.dataset.gjentatt = "";
          return;
        }
        flyttViser(S, Number(el.dataset.v));
      },
      las(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "gjett") return;
        R.vibrer(30);
        if (sp.modus === "lag") {
          sp.fase = "motlag";
          sp.laste = Date.now(); // the bet buttons wait a moment, so a double tap can't place a bet
          R.lyd.pop();
          R.vis();
          window.scrollTo(0, 0);
          fokuser("#skjerm-tittel");
          return;
        }
        avslor(S);
      },
      tipp(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "motlag") return;
        const tipp = el.dataset.v === "v" || el.dataset.v === "h" ? el.dataset.v : null;
        // «Venstre»/«Høyre» sit where «Lås svaret» was: ignore them for a moment after locking.
        if (tipp && Date.now() - (sp.laste || 0) < 400) return;
        sp.tipp = tipp;
        avslor(S);
      },
      // Nothing is revealed until the other team has bet: the guessing team may still move the needle.
      "angre-las"(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "motlag") return;
        sp.fase = "gjett";
        R.vis();
        window.scrollTo(0, 0);
        fokuser('.tl-skive[role="slider"]');
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "fasit" || !sp.avslort) return;
        if (ferdig(sp)) {
          tilKaringen(S, false);
          return;
        }
        if (sp.modus === "lag") {
          sp.teller[sp.tur] += 1;
          if (!sp.logg[sp.logg.length - 1].igjen) sp.tur = 1 - sp.tur;
        }
        sp.runde += 1;
        nyRunde(S);
        R.gaTil("gi");
      },
      igjen(el, e, S) {
        if (startHindring(S)) {
          R.gaTil("oppsett");
          return;
        }
        S.spill = null;
        H.start(el, e, S);
      },
      // «Avslutt» goes to «Kåringen» with what has been played so far.
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        const tekst = sp && sp.modus === "lag" ? R.t("Dere går til kåringen. Laget som leder nå, vinner.") : R.t("Dere går til kåringen med poengene dere har nå.");
        if (!(await R.bekreft(R.t("Avslutte spillet?"), tekst, R.t("Avslutt"), R.t("Spill videre"))) || !fortsatt() || S.spill !== sp || !pagar(S)) return;
        tilKaringen(S, true);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.logg.length) return;
        return R.del(R.t("Tankeleseren"), delTekst(sp), SPILLADRESSE());
      },

      // ----- Challenges -----
      utfordre(el, e, S) {
        nyUtfordring(S, false);
        R.gaTil("lag");
      },
      "utf-ny"(el, e, S) {
        lukkKikk(S, true);
        nyUtfordring(S, true);
        R.gaTil("lag");
      },
      async "utf-del"(el, e, S) {
        const u = S.utf.lag;
        if (!u || !u.sett || !u.hint) return;
        const kode = lagKode(u);
        if (!kode) return;
        const fortsatt = R.vakt();
        await R.del(R.t("Tankeleseren"), R.t("Jeg tenker på «{hint}» et sted mellom «{a}» og «{b}». Treffer du?", { hint: u.hint, a: u.par[0], b: u.par[1] }), lenkeTil(kode));
        if (u.delt || S.utf.lag !== u) return;
        u.delt = true;
        R.statistikk("utfordring", { delt: true });
        if (fortsatt() && S.skjerm === "lag") R.vis();
        else R.lagre();
      },
      "utf-las"(el, e, S) {
        const u = S.utf.mot;
        if (!u || u.fase !== "gjett") return;
        R.vibrer(30);
        u.poeng = poengFor(Math.abs(u.viser - u.mal));
        u.fase = "fasit";
        u.avslort = false;
        huskSvar(S, u);
        R.vis();
        window.scrollTo(0, 0);
        fokuser("#skjerm-tittel");
        spillAvsloring(S);
      },
      // Only the points are shared: the hint is the sender's own text.
      "utf-resultat"(el, e, S) {
        const u = S.utf.mot;
        if (!u || u.fase !== "fasit" || !u.avslort) return;
        return R.del(R.t("Tankeleseren"), R.t("Tankeleseren-utfordring: {tegn} {n} poeng", { tegn: TEGN[u.poeng], n: u.poeng }), SPILLADRESSE());
      },
      "utf-svar"(el, e, S) {
        nyUtfordring(S, false);
        R.gaTil("lag");
      },
    }),

    // For the end-to-end test (Rusj.app.test): the link format and the season rule as plain functions.
    test: { lagKode, lesKode, rensHint, julesesong, parHash },
  });
})();
