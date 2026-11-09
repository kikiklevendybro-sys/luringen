/* Tankeleseren — "Bølgelengde".
   A spectrum card ("Kaldt ↔ Varmt") and a hidden target on a half-circle dial (0–100). The hint
   giver holds the dial to peek at the target, says one hint, and the others drag the needle to
   where they think the target is. Then the cover sweeps away: 4, 3 or 2 points close to the
   centre of the target. Modes: Sammen (co-op, 8 rounds) and Lag mot lag (first to 10, and the
   other team may bet "left or right of the needle" for 1 point). */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.spektrum;
  const esc = R.esc;
  let H; // the actions, so one action can reuse another

  // ---------- Content ----------

  const PAKKER = D.pakker;
  const ALLE = [];
  PAKKER.forEach((p) => p.par.forEach(([v, h]) => ALLE.push({ p: p.id, v, h })));
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const STANDARD = PAKKER.filter((p) => p.id !== "barn").map((p) => p.id);
  const stokk = R.kortstokk("spektrum", ALLE.length);
  const antallKort = (pakker) => PAKKER.filter((p) => pakker.includes(p.id)).reduce((s, p) => s + p.par.length, 0);

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
    { navn: "Lag Rosa", token: "--rosa", klasse: "rosa", knapp: "rosa" },
    { navn: "Lag Blå", token: "--himmel", klasse: "bla", knapp: "himmel" },
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
  const farger = (kort) => FARGER[Math.abs(kort) % FARGER.length];

  const KOMMENTAR = {
    4: ["Midt i blinken!", "Tankelesere!", "Samme bølgelengde!", "Telepati!"],
    3: ["Så nærme!", "Nesten tankelesere!", "Varmt, varmt!"],
    2: ["Innenfor!", "Lunkent – men poeng!", "I nærheten!"],
    0: ["Feil frekvens …", "Hver sin bølgelengde!", "Det knitret på linja …"],
  };
  const kommentar = (p, n) => KOMMENTAR[p][n % KOMMENTAR[p].length];

  // Rating by the share of the maximum (4 points per round), so it is fair with any number of rounds.
  function vurdering(sum, antallRunder) {
    const andel = sum / (antallRunder * 4);
    if (andel >= 0.875) return { tittel: "Tankelesere!", tekst: "Dere deler visst én hjerne. Litt skummelt, egentlig." };
    if (andel >= 0.69) return { tittel: "Samme bølgelengde", tekst: "Imponerende! Dere tenker nesten helt likt." };
    if (andel >= 0.5) return { tittel: "God kontakt", tekst: "Litt støy på linja, men dere hører hverandre." };
    if (andel >= 0.31) return { tittel: "Det knitrer", tekst: "Signalet kommer og går. En runde til?" };
    return { tittel: "Hver sin radio", tekst: "Dere sender på helt ulike kanaler. Prøv igjen!" };
  }
  const flottResultat = (sp) => poengSum(sp) >= runder(sp) * 2; // half of the maximum or more

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
  const ferdig = (sp) => (sp.modus === "sammen" ? sp.logg.length >= runder(sp) && sp.fase === "fasit" : sp.vinner != null);
  const pagar = (S) => !!S.spill && !ferdig(S.spill);

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
    return n === 50 ? `${n} av 100, midt mellom` : `${n} av 100, nærmest «${n < 50 ? venstre : hoyre}»`;
  };

  // o: { modus: "kikk" (hold to peek) | "dra" (drag the needle) | "fast", mal, viser, apen }
  function skiveHtml(sp, o) {
    const [fv, fh] = farger(sp.kort);
    const [venstre, hoyre] = sp.par;
    let rolle;
    if (o.modus === "dra")
      rolle = `role="slider" tabindex="0" aria-label="Viseren mellom «${esc(venstre)}» og «${esc(hoyre)}»" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(sp.viser)}" aria-valuetext="${esc(verdiTekst(sp, sp.viser))}"`;
    else if (o.modus === "kikk") rolle = `role="button" tabindex="0" aria-label="Hold fingeren her for å se målet"`;
    else rolle = `role="img" aria-label="${esc(o.etikett || "Skiva")}"`;
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
    return `<div class="tl-kort" style="--v: var(${fv}); --h: var(${fh})" role="group" aria-label="Skalaen går fra «${esc(venstre)}» til «${esc(hoyre)}»">
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
    const sp = S.spill;
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
    const v = S.spill.viser;
    settViser(S, retning < 0 ? Math.ceil(v) - 1 : Math.floor(v) + 1, true);
    tikk();
    R.lagre();
  }

  // Drag anywhere on the dial: the needle points at the finger (also below the dial's base).
  function koblingDra(S, el) {
    if (!el) return;
    const svg = el.querySelector("svg");
    let aktiv = null;
    const verdi = (e) => {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 240;
      const y = ((e.clientY - r.top) / r.height) * 136;
      let a = Math.atan2(CY - y, x - CX);
      if (a < 0) a = x < CX ? Math.PI : 0;
      return 100 - (a / Math.PI) * 100;
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || aktiv != null) return;
      e.preventDefault();
      aktiv = e.pointerId;
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
      if (e.pointerId !== aktiv) return;
      settViser(S, verdi(e), false);
    });
    const slipp = (e) => {
      if (e.pointerId !== aktiv) return;
      aktiv = null;
      el.classList.remove("drar");
      R.lagre();
    };
    el.addEventListener("pointerup", slipp);
    el.addEventListener("pointercancel", slipp);
    el.addEventListener("keydown", (e) => {
      const steg = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
      if (steg != null) {
        e.preventDefault();
        const v = S.spill.viser;
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
  const FOR_KIKK = "Bare du skal se. Slipp, så skjules målet igjen.";
  const ETTER_KIKK = "Si ett hint som hører hjemme akkurat der målet er – ikke tall! Hold inne igjen så ofte du vil.";
  let kikk = null;
  function apneKikk(S, skive, knapp) {
    if (kikk || !S.spill) return;
    kikk = { skive, knapp, start: performance.now() };
    skive.classList.add("apen");
    if (knapp) knapp.classList.add("holdes");
    R.lyd.snu();
    R.vibrer(15);
    R.si(`Målet ligger ved ${Math.round(S.spill.mal)} av 100.`);
  }
  function lukkKikk(S) {
    if (!kikk) return;
    const { skive, knapp, start } = kikk;
    kikk = null;
    skive.classList.remove("apen");
    if (knapp) knapp.classList.remove("holdes");
    // The secret must not stay in the screen-reader message when the phone is passed on.
    const si = R.$("#si");
    if (si) si.textContent = "";
    if (performance.now() - start < 350) {
      R.toast("Hold litt lenger for å se målet");
      return;
    }
    const sp = S.spill;
    if (sp && !sp.sett) {
      sp.sett = true;
      R.lagre();
      const k = R.$("#tl-klar");
      if (k) {
        k.disabled = false;
        k.textContent = "Jeg har et hint!";
        k.classList.add("pop");
      }
      const h = R.$("#tl-kikk-hjelp");
      if (h) h.textContent = ETTER_KIKK;
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
      apneKikk(S, skive, knapp);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => el.addEventListener(t, () => lukkKikk(S)));
    el.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        apneKikk(S, skive, knapp);
      }
    });
    el.addEventListener("keyup", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        lukkKikk(S);
      }
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  window.addEventListener("blur", () => lukkKikk(R.S));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) lukkKikk(R.S);
  });

  // ---------- Rounds ----------

  const medlemmer = (sp, lag) => sp.lag.map((l, i) => (l === lag ? i : -1)).filter((i) => i >= 0);

  function trekkKort(S) {
    const sp = S.spill;
    const valgt = new Set(sp.pakker);
    const i = stokk.neste((n) => valgt.has(ALLE[n].p));
    sp.kort = i;
    sp.par = [ALLE[i].v, ALLE[i].h];
    sp.mal = Math.round((3 + (R.nyttFro() / 4294967296) * 94) * 10) / 10;
  }

  function nyRunde(S) {
    const sp = S.spill;
    if (sp.modus === "sammen") sp.giver = (sp.runde - 1) % sp.antall;
    else {
      const m = medlemmer(sp, sp.tur);
      sp.giver = m[sp.teller[sp.tur] % m.length];
    }
    trekkKort(S);
    sp.viser = 50;
    sp.fase = "gjett";
    sp.sett = false;
    sp.tipp = null;
    sp.avslort = false;
  }

  let avsloringPagar = false;
  async function spillAvsloring(S) {
    if (avsloringPagar) return;
    avsloringPagar = true;
    const sp = S.spill;
    const rolig = R.rolig();
    const fortsatt = R.vakt();
    try {
      R.lyd.trommevirvel(rolig ? 0.3 : 1.1);
      await R.vent(rolig ? 300 : 1150);
      if (!fortsatt() || S.spill !== sp || S.skjerm !== "skive") return;
      const skive = R.$(".tl-skive");
      if (skive) skive.classList.add("apen");
      await R.vent(rolig ? 150 : 1050);
      if (!fortsatt() || S.spill !== sp || S.skjerm !== "skive") return;
      sp.avslort = true;
      R.vis();
      const l = sp.logg[sp.logg.length - 1];
      if (l.poeng === 4) {
        R.lyd.fanfare();
        R.konfetti(["--aksent", "--oransje", "--lampe", "--papir"]);
        R.vibrer([40, 60, 40, 60, 120]);
      } else if (l.poeng > 0) {
        R.lyd.riktig();
        R.vibrer(40);
      } else {
        R.lyd.feil();
        R.vibrer(160);
      }
      R.si(`${l.poeng ? l.poeng + " poeng" : "Bom"}. ${kommentar(l.poeng, sp.logg.length)}`);
    } finally {
      avsloringPagar = false;
    }
  }

  function avslor(S) {
    const sp = S.spill;
    const poeng = poengFor(Math.abs(sp.viser - sp.mal));
    let tippRiktig = null;
    if (sp.modus === "lag" && sp.tipp) tippRiktig = sp.tipp === "v" ? sp.mal < sp.viser : sp.mal > sp.viser;
    sp.logg.push({ par: sp.par.slice(), kort: sp.kort, mal: sp.mal, viser: sp.viser, poeng, giver: sp.giver, lag: sp.modus === "lag" ? sp.tur : null, tipp: sp.tipp, tippRiktig });
    sp.fase = "fasit";
    sp.avslort = false;
    if (sp.modus === "lag") {
      const p = poengSum(sp);
      if (Math.max(p[0], p[1]) >= MAL && p[0] !== p[1]) sp.vinner = p[0] > p[1] ? 0 : 1;
    }
    R.vis();
    window.scrollTo(0, 0);
    spillAvsloring(S);
  }

  // ---------- Markup ----------

  const rundeTittel = (S) => {
    const sp = S.spill;
    if (!sp) return "";
    return sp.modus === "sammen" ? `Runde ${Math.min(sp.runde, runder(sp))} av ${runder(sp)}` : `Runde ${sp.runde} · ${LAG[sp.tur].navn}`;
  };

  function statusHtml(sp) {
    const vis = synligeRunder(sp);
    if (sp.modus === "sammen") {
      const antall = runder(sp);
      const sum = poengSum(sp, vis);
      const poeng = `<p class="tl-sum"><b>${sum}</b> poeng</p>`;
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
    return `<div class="tl-status lag">${lag(0)}<span class="tl-mot">først til ${MAL}</span>${lag(1)}</div>`;
  }

  function resultatHtml(sp) {
    const l = sp.logg[sp.logg.length - 1];
    const stempel = { 4: "aksent", 3: "lampe", 2: "mynte", 0: "" }[l.poeng];
    let tipp = "";
    if (sp.modus === "lag") {
      const m = LAG[1 - l.lag];
      tipp = l.tipp
        ? `<p class="tl-tipp">${m.navn} tippet «${l.tipp === "v" ? "venstre" : "høyre"}» – ${l.tippRiktig ? "<b>riktig, +1!</b>" : "ikke riktig denne gangen."}</p>`
        : `<p class="tl-tipp">${m.navn} sto over.</p>`;
    }
    return `<div class="tl-resultat">
      <div class="stempel-sted"><span class="stempel ${stempel}">${l.poeng ? `${l.poeng} poeng` : "Bom!"}</span></div>
      <p class="tl-kommentar">${esc(kommentar(l.poeng, sp.logg.length))}${sp.modus === "lag" ? ` <span>${LAG[l.lag].navn} +${l.poeng}</span>` : ""}</p>
      ${tipp}
    </div>`;
  }

  function loggHtml(sp) {
    return `<ol class="tl-logg">${sp.logg
      .map((l, n) => {
        const lag = l.lag != null ? ` ${LAG[l.lag].klasse}` : "";
        return `<li class="${lag}"><span class="tl-mini">${miniSkive(l)}</span><span class="tl-logg-tekst"><b>${esc(l.par[0])} ↔ ${esc(l.par[1])}</b><small>${n + 1}. Hint fra ${esc(R.navn(l.giver))}${
          l.tippRiktig ? ` · motlaget +1` : ""
        }</small></span><span class="tl-logg-poeng p${l.poeng}">${l.poeng}</span></li>`;
      })
      .join("")}</ol>`;
  }

  function lageneHtml(S) {
    const o = S.oppsett;
    const kol = (l) => {
      const navn = [];
      for (let i = 0; i < S.antall; i++)
        if (o.lag[i] === l)
          navn.push(`<button class="tl-lagspiller" data-h="bytt-lag" data-v="${i}" aria-label="${esc(R.navn(i))} – flytt til ${LAG[1 - l].navn}">${R.avatar(i)}<span>${esc(R.navn(i))}</span></button>`);
      return `<div class="tl-lagkolonne ${LAG[l].klasse}"><h3>${LAG[l].navn} <span>${navn.length}</span></h3>${navn.join("") || '<p class="hjelp">Ingen ennå</p>'}</div>`;
    };
    return `<section class="seksjon">
      <div class="seksjon-hode"><h2>Lagene</h2><button class="lenke" data-h="stokk-lag">🔀 Stokk lagene</button></div>
      <div class="tl-lagene">${kol(0)}${kol(1)}</div>
      <p class="hjelp">Trykk på et navn for å bytte lag.</p>
    </section>`;
  }

  // Keep one team value per player, balanced as players come and go.
  function ordneLag(S) {
    const o = S.oppsett;
    o.lag = (o.lag || []).slice(0, S.antall).map((l) => (l === 1 ? 1 : 0));
    while (o.lag.length < S.antall) {
      const rosa = o.lag.filter((l) => l === 0).length;
      o.lag.push(rosa > o.lag.length - rosa ? 1 : 0);
    }
  }

  function startHindring(S) {
    const o = S.oppsett;
    if (!o.pakker.length) return "Velg minst én kortstokk.";
    if (o.modus === "lag") {
      ordneLag(S);
      const rosa = o.lag.filter((l) => l === 0).length;
      if (rosa < 2 || S.antall - rosa < 2) return "Hvert lag trenger minst to spillere.";
    }
    return null;
  }

  // ---------- The app ----------

  R.start({
    id: "tankeleseren",
    versjon: 1,

    // In progress until the last round is revealed (front page «Fortsett» badge, screen kept on).
    pagar: (S) => pagar(S),

    tilstand: () => ({
      antall: 3,
      oppsett: { modus: "sammen", pakker: STANDARD.slice(), lag: [] },
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ modus: "sammen", pakker: STANDARD.slice(), lag: [] }, S.oppsett);
      if (!["sammen", "lag"].includes(S.oppsett.modus)) S.oppsett.modus = "sammen";
      S.oppsett.pakker = (S.oppsett.pakker || []).filter((id) => pakke(id));
      if (!S.oppsett.pakker.length) S.oppsett.pakker = STANDARD.slice();
      if (!Array.isArray(S.oppsett.lag)) S.oppsett.lag = [];
      S.antall = R.klamp(Number(S.antall) || 3, 2, 20);
      const sp = S.spill;
      const ok =
        sp &&
        ["sammen", "lag"].includes(sp.modus) &&
        Array.isArray(sp.logg) &&
        Array.isArray(sp.par) &&
        sp.par.length === 2 &&
        typeof sp.mal === "number" &&
        typeof sp.viser === "number" &&
        ["gjett", "motlag", "fasit"].includes(sp.fase) &&
        (sp.modus === "sammen" || (Array.isArray(sp.lag) && Array.isArray(sp.teller)));
      if (!ok) S.spill = null;
      else if (sp.modus === "sammen" && !Number.isInteger(sp.runder)) sp.runder = runderFor(sp.antall || 2);
      if (!S.spill && ["gi", "hint", "skive", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Én ser et hemmelig mål på skiva og gir ett hint. De andre prøver å lese tankene – og drar viseren dit de tror målet er.",
      steg: [
        ["Se målet i smug", "Hintgiveren holder inne på skiva og ser hvor målet ligger mellom de to ytterpunktene på kortet."],
        ["Gi ett hint", "Si noe som hører hjemme akkurat der. Eksempel: Kaldt ↔ Varmt, målet litt mot varmt – «badevann»."],
        ["Dra viseren", "De andre diskuterer og drar viseren dit de tror. Lås svaret. Jo nærmere midten, desto flere poeng (4, 3 eller 2)."],
      ],
      tips: [
        "Ikke si tall, prosent eller «litt til venstre». Bare hintet!",
        "Sammen: åtte runder, og alle bytter på å gi hint. Hvor mange av 32 poeng klarer dere?",
        "Lag mot lag: når det ene laget har låst svaret, kan det andre tippe om målet er til venstre eller høyre for viseren. Riktig gir 1 poeng.",
        "Står du fast? «Bytt kort» gir deg en ny skala.",
        "Viseren kan også flyttes med ◀ ▶ eller piltastene.",
      ],
    },

    vedSpillere(S) {
      ordneLag(S);
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Ett hint. Én skive.<br><em>Er dere på samme bølgelengde?</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S)
                ? S.spill.modus === "sammen"
                  ? `Fortsett · runde ${S.spill.runde} av ${runder(S.spill)}`
                  : `Fortsett · runde ${S.spill.runde} · ${LAG[S.spill.tur].navn}`
                : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–20", "spillere"],
              [String(ALLE.length), "skalaer"],
              ["0", "reklame"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const lag = o.modus === "lag";
          if (lag) ordneLag(S);
          const hindring = startHindring(S);
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            ${R.ui.fliser(
              "modus",
              [
                { v: "sammen", ikon: "🤝", tittel: "Sammen", tekst: `Alle mot skiva, ${runderFor(S.antall)}\u00a0runder` },
                { v: "lag", ikon: "⚔️", tittel: "Lag mot lag", tekst: `To lag, først\u00a0til\u00a0${MAL}` },
              ],
              o.modus,
            )}
            ${R.ui.spillere({
              min: lag ? 4 : 2,
              max: 20,
              hjelp: lag ? "Lagene settes opp under. Alle bytter på å gi hint." : S.antall > RUNDER ? "Én runde per spiller – alle gir hint én gang." : "Alle bytter på å gi hint.",
            })}
            ${lag ? lageneHtml(S) : ""}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Kortstokker</h2><span class="tall">${antallKort(o.pakker)} kort</span></div>
              ${R.ui.brikker(
                "pakke",
                PAKKER.map((p) => ({ v: p.id, tekst: p.navn, ikon: p.ikon, antall: p.par.length })),
                o.pakker,
                { alle: true, etikett: "Kortstokker" },
              )}
            </section>
            ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !!hindring }), hindring ? `<p class="hjelp">${esc(hindring)}</p>` : "")}`;
        },
      },

      gi: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const lag = sp.modus === "lag" ? `<p class="tl-lagmerke ${LAG[sp.tur].klasse}"><i aria-hidden="true"></i>${LAG[sp.tur].navn} gir hint</p>` : "";
          return `${lag}${R.ui.giTil({ i: sp.giver, h: "jeg-er", tekst: "Hintgiver denne runden", knapp: `Jeg er ${R.navn(sp.giver)}`, advarsel: "Bare hintgiveren ser skiva nå" })}`;
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
              <p class="etikett">Bare for ${esc(R.navn(sp.giver))}</p>
              <h1 id="skjerm-tittel">Se målet i smug</h1>
            </div>
            ${kortHtml(sp)}
            ${skiveHtml(sp, { modus: "kikk", mal: true })}
            <button class="tl-holdknapp" type="button"><span class="tl-holdikon" aria-hidden="true">👆</span>Hold fingeren her for å se</button>
            <p class="hjelp" id="tl-kikk-hjelp">${sp.sett ? ETTER_KIKK : FOR_KIKK}</p>
            ${R.ui.dokk(R.ui.knapp(sp.sett ? "Jeg har et hint!" : "Se målet først", "hint-klar", { av: !sp.sett, id: "tl-klar" }), R.ui.lenkerad(R.ui.lenke("Bytt kort", "bytt-kort")))}`;
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
          lukkKikk(S);
        },
      },

      skive: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const giver = R.navn(sp.giver);
          const [venstre, hoyre] = sp.par;
          let topp = "";
          let skive = "";
          let dokk = "";
          let resultat = "";
          if (sp.fase === "gjett") {
            topp = `<h1 id="skjerm-tittel" class="tl-sporsmal">${sp.modus === "lag" ? `<span class="tl-farge ${LAG[sp.tur].klasse}">${LAG[sp.tur].navn}:</span> ` : ""}Hvor er målet?</h1>
              <p class="tl-under">Hør på hintet fra <b>${esc(giver)}</b> og dra viseren.</p>`;
            skive = `${skiveHtml(sp, { modus: "dra", viser: true })}
              <div class="tl-fin">
                <button class="tl-finknapp" data-h="flytt" data-v="-1" data-stille aria-label="Flytt viseren mot «${esc(venstre)}»">◀</button>
                <span class="tl-fin-tekst" aria-hidden="true">Dra – eller finjuster</span>
                <button class="tl-finknapp" data-h="flytt" data-v="1" data-stille aria-label="Flytt viseren mot «${esc(hoyre)}»">▶</button>
              </div>`;
            dokk = R.ui.dokk(R.ui.knapp("Lås svaret", "las", { ikon: "🔒" }), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")));
          } else if (sp.fase === "motlag") {
            const m = LAG[1 - sp.tur];
            topp = `<h1 id="skjerm-tittel" class="tl-sporsmal"><span class="tl-farge ${m.klasse}">${m.navn}:</span> venstre eller høyre?</h1>
              <p class="tl-under">Ligger målet til venstre eller høyre for viseren? Riktig gir 1 poeng.</p>`;
            skive = skiveHtml(sp, { modus: "fast", viser: true, etikett: `Viseren står på ${Math.round(sp.viser)} av 100` });
            dokk = R.ui.dokk(
              `<div class="knapprad">${R.ui.knapp("Venstre", "tipp", { v: "v", variant: m.knapp, ikon: "◀" })}${R.ui.knapp("", "tipp", { v: "h", variant: m.knapp, tekstHtml: 'Høyre<span class="ikon" aria-hidden="true">▶</span>' })}</div>`,
              R.ui.lenkerad(R.ui.lenke("Vi står over", "tipp", { v: "-" }), R.ui.lenke(`↶ Angre – ${LAG[sp.tur].navn} flytter viseren`, "angre-las")),
            );
          } else {
            const l = sp.logg[sp.logg.length - 1];
            topp = `<h1 id="skjerm-tittel" class="vh">Fasit</h1>`;
            skive = skiveHtml(sp, {
              modus: "fast",
              viser: true,
              mal: true,
              apen: sp.avslort,
              etikett: sp.avslort ? `Målet var ved ${Math.round(sp.mal)}, viseren sto ved ${Math.round(sp.viser)}` : "Skiva åpnes …",
            });
            resultat = sp.avslort ? resultatHtml(sp) : `<div class="tl-resultat venter" aria-hidden="true"><span class="tl-spenning">Og målet er …</span></div>`;
            const siste = ferdig(sp);
            const neste = sp.modus === "lag" ? `Neste: ${LAG[1 - l.lag].navn}` : "Neste runde";
            dokk = R.ui.dokk(
              R.ui.knapp(siste ? "Se kåringen" : neste, "neste", { av: !sp.avslort, ikon: siste ? "🏆" : "" }),
              siste ? "" : R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")),
            );
          }
          return `${statusHtml(sp)}${topp}${kortHtml(sp)}${skive}${resultat}${dokk}`;
        },
        inn(S) {
          S.spill.skjerm = "skive";
          R.holdVaken();
          if (S.spill.fase === "fasit" && !S.spill.avslort) spillAvsloring(S);
        },
        etter(S, rot) {
          if (S.spill.fase === "gjett") {
            koblingDra(S, rot.querySelector(".tl-skive"));
            koblingFin(S, rot);
          }
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const igjen = `${R.ui.flereSpill({ antall: sp.antall })}${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), '<a class="lenke" href="/">Alle spill</a>'))}`;
          if (sp.modus === "sammen") {
            const sum = poengSum(sp);
            const v = vurdering(sum, runder(sp));
            return `
              <div class="banner aksent tl-banner">
                ${R.figur()}
                <p class="etikett">${runder(sp)} runder</p>
                <h1 id="skjerm-tittel">${esc(v.tittel)}</h1>
                <p class="tl-total"><b>${sum}</b> av ${runder(sp) * 4} poeng</p>
                <p class="ingress">${esc(v.tekst)}</p>
              </div>
              ${loggHtml(sp)}
              ${igjen}`;
          }
          const p = poengSum(sp);
          const vinner = sp.vinner;
          return `
            <div class="banner tl-banner tl-vinner ${LAG[vinner].klasse}">
              ${R.figur()}
              <p class="etikett">Først til ${MAL} poeng</p>
              <h1 id="skjerm-tittel">${LAG[vinner].navn} vinner!</h1>
              <p class="tl-stilling" aria-label="Stillingen: ${LAG[0].navn} ${p[0]}, ${LAG[1].navn} ${p[1]}"><span class="rosa">${LAG[0].navn} <b>${p[0]}</b></span><span class="tl-strek">–</span><span class="bla"><b>${p[1]}</b> ${LAG[1].navn}</span></p>
            </div>
            ${loggHtml(sp)}
            ${igjen}`;
        },
        inn(S) {
          const sp = S.spill;
          R.slippVaken();
          if (sp.modus === "lag") {
            R.lyd.fanfare();
            R.konfetti([LAG[sp.vinner].token, "--papir", "--aksent"]);
          } else if (flottResultat(sp)) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.pling(); // a weak result gets warm words, not a party
          }
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
        const sp = S.spill;
        if (!sp) return;
        R.gaTil(sp.skjerm === "skive" ? "skive" : "gi");
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
        else S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
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
          par: ["", ""],
          mal: 50,
          viser: 50,
          fase: "gjett",
          sett: false,
          tipp: null,
          avslort: false,
        };
        nyRunde(S);
        R.holdVaken();
        R.gaTil("gi");
      },
      "jeg-er": () => {
        R.lyd.pop();
        R.gaTil("hint");
      },
      "bytt-kort"(el, e, S) {
        trekkKort(S);
        S.spill.sett = false;
        R.lyd.sveip();
        R.vis();
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
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "fasit" || !sp.avslort) return;
        if (ferdig(sp)) {
          R.gaTil("slutt");
          return;
        }
        if (sp.modus === "lag") {
          sp.teller[sp.tur] += 1;
          sp.tur = 1 - sp.tur;
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
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Avslutte spillet?", "Poengene forsvinner. Dere kan alltid starte et nytt.", "Avslutt", "Fortsett")) || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },
    }),
  });
})();
