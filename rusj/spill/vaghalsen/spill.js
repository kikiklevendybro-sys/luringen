/* Våghalsen — «Sannhet eller konsekvens» (truth or dare).
   A bottle spins in the middle of a ring of players and stops on whoever is next (or the turn
   simply goes round). The player picks Sannhet (+1) or Konsekvens (+2) and gets a card, and can
   always pass («Står over», 0 points) — saying no is fine and is never pointed out.
   The bottle can be spun with the big button, a tap on the table, or a flick with a finger;
   the result is always drawn at random (with a nudge towards players who have had fewer turns). */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;

  const PAKKER = D.pakker;
  const STANDARD = ["familie", "venner"];
  const pakke = (id) => PAKKER.find((p) => p.id === id);

  const TYPER = {
    s: { navn: "Sannhet", ikon: "😇", poeng: 1, kort: "lilla" },
    k: { navn: "Konsekvens", ikon: "🔥", poeng: 2, kort: "aksent" },
  };
  const ALLE = { s: [], k: [] };
  PAKKER.forEach((p) => {
    p.sannhet.forEach((t) => ALLE.s.push({ p: p.id, t }));
    p.konsekvens.forEach((t) => ALLE.k.push({ p: p.id, t }));
  });
  const STOKK = { s: R.kortstokk("sannhet", ALLE.s.length), k: R.kortstokk("konsekvens", ALLE.k.length) };
  const ANTALL_KORT = ALLE.s.length + ALLE.k.length;

  let H; // the actions, so one can call another
  let laast = false; // a result stamp is showing; ignore taps until the next screen
  let animasjon = null; // the running bottle animation, if any

  // ---------- Small helpers ----------

  const norm = (a) => ((a % 360) + 360) % 360;
  // Seats around the table, clockwise from the top. With an odd number of players the ring is
  // turned half a seat, so someone always sits at the bottom (closest to the name below).
  const forskyv = (n) => (n % 2 ? 180 / n : 0);
  const vinkelFor = (i, n) => forskyv(n) + (i * 360) / n;
  const pekerPa = (a, n) => (((Math.round((norm(a) - forskyv(n)) / (360 / n)) % n) + n) % n);
  const poengFor = (st) => st.s + st.k * 2;
  const tom = () => ({ s: 0, k: 0, f: 0, turer: 0 });
  const navneliste = (indekser) => {
    const navn = indekser.map((i) => R.navn(i));
    return navn.length < 2 ? navn.join("") : navn.slice(0, -1).join(", ") + " og " + navn[navn.length - 1];
  };
  const antallOrd = (n, en, flere) => (n === 1 ? en : `${n} ${flere}`);

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, 2, 20);
  }

  // ---------- Cards ----------

  function trekk(S) {
    const sp = S.spill;
    const valgt = new Set(sp.pakker);
    const liste = ALLE[sp.type];
    sp.kort = STOKK[sp.type].neste((n) => valgt.has(liste[n].p));
    sp.andre = null;
    if (liste[sp.kort] && liste[sp.kort].t.includes("{spiller}")) {
      const andre = [];
      for (let i = 0; i < sp.antall; i++) if (i !== sp.tur) andre.push(i);
      sp.andre = R.velg(andre);
    }
  }

  function kortTekst(sp) {
    const k = ALLE[sp.type][sp.kort];
    const navn = sp.andre != null ? `<em class="vh-andre">${esc(R.navn(sp.andre))}</em>` : "en annen";
    return esc(k.t).split("{spiller}").join(navn);
  }

  // Who the bottle stops on: random, but players with fewer turns are more likely, and (with
  // three or more players) never the one who just played.
  function velgMal(sp, rng) {
    const n = sp.antall;
    const turer = sp.stat.map((st) => st.turer);
    const min = Math.min(...turer);
    const vekter = turer.map((t, i) => (n >= 3 && i === sp.tur ? 0 : t === min ? 4 : t === min + 1 ? 1.3 : 0.4));
    let x = rng() * vekter.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      x -= vekter[i];
      if (x < 0) return i;
    }
    return vekter.findIndex((v) => v > 0);
  }

  // ---------- The table with the bottle ----------

  const BLEKK = "#170e2b";
  const flaske = (silhuett) => {
    const f = (farge) => (silhuett ? "#06020e" : farge);
    const s = silhuett ? "#06020e" : BLEKK;
    return `<svg class="vh-flaske-svg" viewBox="0 0 64 224" aria-hidden="true" focusable="false">
      <path d="M24 26 V62 C24 82 7 90 7 114 V202 Q7 216 21 216 H43 Q57 216 57 202 V114 C57 90 40 82 40 62 V26 Z" fill="${silhuett ? "#06020e" : "url(#vh-glass) #3de3b0"}" stroke="${s}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M7 140 H57 V182 H7 Z" fill="${f("#ffd23f")}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      ${silhuett ? "" : `<path d="M32 146 L36 155 L45.5 156 L38.5 162.5 L40.5 172 L32 167 L23.5 172 L25.5 162.5 L18.5 156 L28 155 Z" fill="#ff5a4e" stroke="${BLEKK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M15.5 117 V134 M15.5 189 V198" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>
      <path d="M29.5 32 V60" stroke="#fff" stroke-opacity=".6" stroke-width="3.5" stroke-linecap="round"/>`}
      <rect x="20" y="17" width="24" height="12" rx="4" fill="${f("#3de3b0")}" stroke="${s}" stroke-width="4"/>
      <rect x="22" y="3" width="20" height="17" rx="5.5" fill="${f("#ff5a4e")}" stroke="${s}" stroke-width="4"/>
      ${silhuett ? "" : `<path d="M26 8 H30" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`}
    </svg>`;
  };
  const FLASKE = flaske(false);
  const SKYGGE = flaske(true);
  const MINI_FLASKE = FLASKE.replace('class="vh-flaske-svg"', 'class="vh-mini-flaske"');
  const SNURR_IKON =
    '<svg class="vh-snurrikon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12.5a8 8 0 1 1-2.6-6.4"/><path d="M19.5 3.5v4.4h-4.4"/></svg>';

  // A wedge of the table for player i (viewBox 0 0 200 200, centre 100,100).
  function kile(fra, til, r) {
    const p = (v) => {
      const rad = (v * Math.PI) / 180;
      return `${(100 + r * Math.sin(rad)).toFixed(2)} ${(100 - r * Math.cos(rad)).toFixed(2)}`;
    };
    return `M100 100 L${p(fra)} A${r} ${r} 0 ${til - fra > 180 ? 1 : 0} 1 ${p(til)} Z`;
  }

  function hjulHtml(sp, o) {
    const n = sp.antall;
    const s = 360 / n;
    const as = n <= 4 ? 17 : n <= 6 ? 15.5 : n <= 8 ? 14 : n <= 10 ? 12.5 : n <= 12 ? 11 : n <= 16 ? 9.6 : 8.4;
    const skilt = n <= 4 ? 124 : n <= 6 ? 106 : n <= 8 ? 92 : 80; // max name tag width in px
    const kiler = [];
    const plasser = [];
    for (let i = 0; i < n; i++) {
      const v = vinkelFor(i, n);
      const rad = (v * Math.PI) / 180;
      const x = 50 + 41 * Math.sin(rad);
      const y = 50 - 41 * Math.cos(rad);
      const pf = `var(--p${(i % 20) + 1})`;
      const valgt = i === o.valgt;
      kiler.push(`<path class="vh-kile${valgt ? " valgt" : ""}" data-kile="${i}" d="${kile(v - s / 2, v + s / 2, 54)}" style="--pf: ${pf}"/>`);
      const p = poengFor(sp.stat[i]);
      const side = x < 20 ? " venstre" : x > 80 ? " hoyre" : "";
      plasser.push(
        `<span class="vh-plass${valgt ? " valgt" : ""}${y < 31 ? " topp" : ""}${side}" data-plass="${i}" style="--x: ${x.toFixed(2)}%; --y: ${y.toFixed(2)}%; --pf: ${pf}">` +
          `${R.avatar(i)}${p ? `<span class="vh-poeng">${p}</span>` : ""}<span class="vh-navn">${esc(R.navn(i))}</span></span>`,
      );
    }
    const linjer = Array.from({ length: n }, (_, i) => {
      const rad = ((vinkelFor(i, n) + s / 2) * Math.PI) / 180;
      return `M100 100 L${(100 + 54 * Math.sin(rad)).toFixed(2)} ${(100 - 54 * Math.cos(rad)).toFixed(2)}`;
    }).join(" ");
    const rot = `transform: rotate(${(o.vinkel || 0).toFixed(2)}deg)`;
    const etikett = o.valgt != null ? `Flaska peker på ${R.navn(o.valgt)}` : `Bord med flaske og ${n} spillere`;
    return `
      <div class="vh-hjul${n > 10 ? " mange" : ""}${o.valgt != null ? " har-valgt" : ""}${o.vent ? " vent" : ""}" id="vh-hjul" style="--as: ${as}%; --asn: ${as}; --skilt: ${skilt}px" role="img" aria-label="${esc(etikett)}">
        <svg class="vh-bord" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <defs><radialGradient id="vh-filtfarge" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#42306f"/><stop offset="1" stop-color="#1f1338"/></radialGradient><linearGradient id="vh-glass" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#8af7d6"/><stop offset=".42" stop-color="#3de3b0"/><stop offset="1" stop-color="#159170"/></linearGradient></defs>
          <circle class="vh-kant-skygge" cx="100" cy="104.5" r="63"/>
          <circle class="vh-kant" cx="100" cy="100" r="63"/>
          <circle cx="100" cy="100" r="54" fill="url(#vh-filtfarge)"/>
          <g class="vh-kiler">${kiler.join("")}</g>
          <path class="vh-linjer" d="${linjer}"/>
          <circle class="vh-filt-ring" cx="100" cy="100" r="54"/>
          <circle class="vh-lys-glod" cx="100" cy="100" r="58.5" pathLength="360"/>
          <circle class="vh-lys en" cx="100" cy="100" r="58.5" pathLength="360"/>
          <circle class="vh-lys to" cx="100" cy="100" r="58.5" pathLength="360"/>
        </svg>
        <div class="vh-lag vh-strale" data-roter style="${rot}"></div>
        ${plasser.join("")}
        <div class="vh-skygge"><div class="vh-lag" data-roter style="${rot}">${SKYGGE}</div></div>
        <div class="vh-lag vh-spokelse" data-spokelse></div>
        <div class="vh-lag vh-spokelse" data-spokelse></div>
        <div class="vh-lag vh-spokelse" data-spokelse></div>
        <div class="vh-lag vh-flaske" data-roter style="${rot}">${FLASKE}</div>
      </div>`;
  }

  // ---------- Bottle animation ----------

  const kurver = {
    ut: (p) => (t) => 1 - Math.pow(1 - t, p),
    innUt: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };

  function tikk() {
    R.lyd.tone(1900, 0, 0.022, "square", 0.035);
    R.lyd.stoy(0, 0.025, 0.07, 5200);
  }

  // Turns the bottle from `fra` to `til` (degrees) over `ms`. Highlights the player the neck
  // passes, clicks like a prize wheel and draws a motion trail while it is fast.
  function animer(o) {
    const hjul = document.getElementById("vh-hjul");
    if (!hjul || o.ms <= 0) {
      o.vedSlutt();
      return null;
    }
    const roter = R.$$("[data-roter]", hjul);
    const spokelser = R.$$("[data-spokelse]", hjul);
    const plasser = R.$$("[data-plass]", hjul);
    const kiler = R.$$("[data-kile]", hjul);
    if (!spokelser[0].innerHTML) spokelser.forEach((el) => (el.innerHTML = FLASKE));
    const n = plasser.length;
    let pekt = -1;
    let sisteTikk = 0;
    let forrigeA = o.fra;
    let forrigeT = performance.now();
    const start = forrigeT;
    let id = 0;
    let ferdig = false;
    const marker = (i) => {
      if (pekt >= 0) {
        plasser[pekt].classList.remove("pekt");
        kiler[pekt].classList.remove("pekt");
      }
      pekt = i;
      plasser[i].classList.add("pekt");
      kiler[i].classList.add("pekt");
      if (o.vedPekt) o.vedPekt(i);
    };
    const slutt = () => {
      ferdig = true;
      spokelser.forEach((el) => (el.style.opacity = "0"));
      if (pekt >= 0) {
        plasser[pekt].classList.remove("pekt");
        kiler[pekt].classList.remove("pekt");
      }
      o.vedSlutt();
    };
    function ramme(na) {
      if (ferdig) return;
      if (!hjul.isConnected) return slutt();
      const t = Math.min(1, (na - start) / o.ms);
      const a = o.fra + (o.til - o.fra) * o.kurve(t);
      const rot = `rotate(${a.toFixed(2)}deg)`;
      for (const el of roter) el.style.transform = rot;
      const fart = (a - forrigeA) / Math.max(1, na - forrigeT); // degrees per ms
      const etter = R.klamp(fart * 15, -38, 38);
      const synlig = R.klamp((Math.abs(fart) - 0.25) / 1.1, 0, 1);
      spokelser.forEach((el, k) => {
        el.style.transform = `rotate(${(a - etter * (k + 1)).toFixed(2)}deg)`;
        el.style.opacity = String(synlig * [0.3, 0.17, 0.08][k]);
      });
      forrigeA = a;
      forrigeT = na;
      const i = pekerPa(a, n);
      if (i !== pekt) {
        marker(i);
        if (o.lyd !== false && na - sisteTikk > 38) {
          tikk();
          if (Math.abs(fart) < 0.45) R.vibrer(5);
          sisteTikk = na;
        }
      }
      if (t < 1) id = requestAnimationFrame(ramme);
      else slutt();
    }
    id = requestAnimationFrame(ramme);
    return {
      avbryt() {
        ferdig = true;
        cancelAnimationFrame(id);
      },
    };
  }

  function stoppAnimasjon() {
    if (animasjon) animasjon.avbryt();
    animasjon = null;
  }

  // Start a spin. retning: 1 clockwise, -1 counter-clockwise; fart: flick speed in degrees per
  // second (null = button). The result is drawn and saved right away, so a reload mid-spin
  // simply shows where the bottle stopped.
  function snurr(retning, fart, fra) {
    const S = R.S;
    const sp = S.spill;
    if (!sp || sp.fase !== "snurr" || sp.snurr || animasjon || laast) return;
    const n = sp.antall;
    const rng = R.rng(R.nyttFro());
    const mal = velgMal(sp, rng);
    const s = 360 / n;
    // Land close to the player (so the neck clearly points at them); with many players, now
    // and then only just past the line, for suspense.
    const spenn = Math.min(0.33 * s, 24);
    let forskyvning = (rng() * 2 - 1) * spenn;
    if (n >= 6 && rng() < 0.3) forskyvning = -retning * (0.34 + rng() * 0.08) * s;
    const start = fra == null ? sp.vinkel : fra;
    const avstand = norm((vinkelFor(mal, n) + forskyvning - start) * retning);
    const runder = fart ? R.klamp(Math.round(fart / 330), 2, 8) : 4 + Math.floor(rng() * 2);
    const total = runder * 360 + avstand;
    const P = 3.1;
    let ms = fart ? ((P * total) / fart) * 1000 : 4300 + rng() * 800;
    ms = R.rolig() ? 700 : R.klamp(ms, 2900, 6400);
    const til = start + retning * total;
    sp.snurr = { mal, vinkel: norm(til) };
    sp.angre = null;
    R.lagre();

    const hjul = document.getElementById("vh-hjul");
    if (hjul) {
      hjul.classList.remove("vent");
      hjul.classList.add("snurrer");
    }
    R.$$('#skjerm [data-h="snurr"]').forEach((b) => (b.disabled = true));
    const etikett = R.$("#vh-info .etikett");
    if (etikett) etikett.textContent = "Flaska snurrer …";
    const ingress = R.$("#vh-info .ingress");
    if (ingress) ingress.textContent = "Hvem blir det?";
    const tittel = R.$("#vh-info h1");
    const vedPekt = (i) => {
      if (tittel) tittel.textContent = R.navn(i);
    };
    R.lyd.sveip();
    R.vibrer(15);
    const ferdig = () => {
      animasjon = null;
      fullforSnurr(R.S, true);
    };
    if (fart || R.rolig()) {
      animasjon = animer({ fra: start, til, ms, kurve: kurver.ut(P), vedPekt, vedSlutt: ferdig });
    } else {
      // A little wind-up backwards before the push.
      animasjon = animer({
        fra: start,
        til: start - 16,
        ms: 170,
        kurve: kurver.ut(2),
        lyd: false,
        vedSlutt: () => {
          animasjon = animer({ fra: start - 16, til, ms, kurve: kurver.ut(P), vedPekt, vedSlutt: ferdig });
        },
      });
    }
  }

  function fullforSnurr(S, effekt) {
    const sp = S.spill;
    if (!sp || !sp.snurr) return;
    const r = sp.snurr;
    sp.snurr = null;
    sp.tur = r.mal;
    sp.vinkel = r.vinkel;
    sp.fase = "valg";
    if (S.skjerm !== "runde") {
      R.lagre();
      return;
    }
    R.vis();
    // The spin button is gone now: move focus to the name, so keyboard users land on the choice.
    const h = R.$("#skjerm h1");
    if (h && (!document.activeElement || document.activeElement === document.body)) {
      h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
    if (effekt) feireValgt(r.mal);
    R.si(`Flaska peker på ${R.navn(r.mal)}. Sannhet eller konsekvens?`);
  }

  function feireValgt(i) {
    const hjul = document.getElementById("vh-hjul");
    if (!hjul) return;
    hjul.classList.add("stoppet", "har-valgt");
    const plass = R.$(`[data-plass="${i}"]`, hjul);
    if (plass) plass.classList.add("valgt", "ny");
    const k = R.$(`[data-kile="${i}"]`, hjul);
    if (k) k.classList.add("valgt");
    const info = R.$("#vh-info");
    if (info) info.classList.add("ny");
    R.lyd.pop();
    R.lyd.pling();
    R.vibrer([30, 50, 90]);
  }

  // In "på rekke og rad" mode the bottle turns to the next player instead of spinning.
  function snuTilNeste(S) {
    const sp = S.spill;
    const n = sp.antall;
    const fra = sp.vinkel;
    const mal = vinkelFor(sp.tur, n);
    let avstand = norm(mal - fra);
    if (avstand > 0 && avstand < 30) avstand += 360;
    sp.vinkel = norm(mal);
    R.lagre();
    if (!avstand || R.rolig()) {
      R.$$("#vh-hjul [data-roter]").forEach((el) => (el.style.transform = `rotate(${sp.vinkel}deg)`));
      feireValgt(sp.tur);
      return;
    }
    animasjon = animer({
      fra,
      til: fra + avstand,
      ms: 450 + avstand * 2.4,
      kurve: kurver.innUt,
      vedSlutt: () => {
        animasjon = null;
        feireValgt(sp.tur);
      },
    });
  }

  // ---------- Dragging the bottle ----------

  let dra = null;
  function draStart(e) {
    const hjul = e.target.closest && e.target.closest("#vh-hjul");
    const S = R.S;
    if (!hjul || !S || !S.spill || S.spill.fase !== "snurr" || S.spill.snurr || animasjon || laast) return;
    if (e.button != null && e.button > 0) return;
    const b = hjul.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const vinkel = (x, y) => (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
    const iMidten = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2 < 20 * 20;
    dra = {
      id: e.pointerId,
      hjul,
      cx,
      cy,
      vinkel,
      // Grabbed right at the centre: no angle yet, start measuring from the first move.
      siste: iMidten ? null : vinkel(e.clientX, e.clientY),
      a: S.spill.vinkel,
      flyttet: 0,
      x0: e.clientX,
      y0: e.clientY,
      piksler: 0,
      spor: [{ t: performance.now(), a: S.spill.vinkel }],
      roter: R.$$("[data-roter]", hjul),
      plasser: R.$$("[data-plass]", hjul),
      pekt: -1,
    };
    try {
      hjul.setPointerCapture(e.pointerId);
    } catch (feil) {
      /* not all pointers can be captured */
    }
    hjul.classList.add("drar");
    e.preventDefault();
  }
  function draFlytt(e) {
    if (!dra || e.pointerId !== dra.id) return;
    dra.piksler = Math.max(dra.piksler, Math.hypot(e.clientX - dra.x0, e.clientY - dra.y0));
    const dx = e.clientX - dra.cx;
    const dy = e.clientY - dra.cy;
    if (dx * dx + dy * dy < 20 * 20) return; // too close to the centre to read an angle
    const v = dra.vinkel(e.clientX, e.clientY);
    if (dra.siste == null) {
      dra.siste = v;
      return;
    }
    const d = ((v - dra.siste + 540) % 360) - 180;
    dra.siste = v;
    dra.a += d;
    dra.flyttet += Math.abs(d);
    const rot = `rotate(${dra.a.toFixed(2)}deg)`;
    dra.roter.forEach((el) => (el.style.transform = rot));
    const i = pekerPa(dra.a, dra.plasser.length);
    if (i !== dra.pekt) {
      if (dra.pekt >= 0) dra.plasser[dra.pekt].classList.remove("pekt");
      dra.pekt = i;
      dra.plasser[i].classList.add("pekt");
      tikk();
    }
    const na = performance.now();
    dra.spor.push({ t: na, a: dra.a });
    while (dra.spor.length > 2 && na - dra.spor[0].t > 140) dra.spor.shift();
  }
  function draSlutt(e) {
    if (!dra || e.pointerId !== dra.id) return;
    const d = dra;
    dra = null;
    d.hjul.classList.remove("drar");
    if (d.pekt >= 0) d.plasser[d.pekt].classList.remove("pekt");
    const S = R.S;
    if (!S.spill || S.spill.fase !== "snurr") return;
    if (e.type === "pointercancel") {
      S.spill.vinkel = norm(d.a);
      R.vis();
      return;
    }
    const na = performance.now();
    const forste = d.spor.find((p) => na - p.t <= 110) || d.spor[d.spor.length - 1];
    const fart = na - forste.t > 8 ? ((d.a - forste.a) / (na - forste.t)) * 1000 : 0;
    if (d.piksler < 12 && d.flyttet < 4) return snurr(1, null, d.a); // a tap spins it like the button
    if (Math.abs(fart) >= 220) return snurr(Math.sign(fart), Math.min(Math.abs(fart), 3600), d.a);
    S.spill.vinkel = norm(d.a);
    R.lagre();
    R.toast("Gi den mer fart – eller trykk på knappen!");
  }
  document.addEventListener("pointerdown", draStart);
  document.addEventListener("pointermove", draFlytt);
  document.addEventListener("pointerup", draSlutt);
  document.addEventListener("pointercancel", draSlutt);

  // ---------- Results ----------

  async function utfall(S, ok) {
    const sp = S.spill;
    if (!sp || sp.fase !== "kort" || laast) return;
    laast = true;
    const i = sp.tur;
    const T = TYPER[sp.type];
    const st = sp.stat[i];
    // «Angre» stays possible until the next action (spin, choice or skip).
    sp.angre = { i, ok, type: sp.type, kort: sp.kort, andre: sp.andre, byttet: sp.byttet, vinkel: sp.vinkel };
    if (ok) st[sp.type] += 1;
    else st.f += 1;
    st.turer += 1;
    sp.nr += 1;

    const kort = R.$("#vh-kort");
    if (kort) {
      kort.insertAdjacentHTML(
        "beforeend",
        `<span class="vh-stempel" aria-hidden="true"><span class="stempel ${ok ? "mynte" : "lampe"}">${ok ? "Fullført!" : "Står over"}</span>${
          ok ? `<span class="vh-fly">+${T.poeng}</span>` : ""
        }</span>`,
      );
    }
    R.$$("#skjerm .dokk button").forEach((b) => (b.disabled = true));
    if (ok) {
      R.lyd.riktig();
      if (sp.type === "k") setTimeout(() => R.lyd.pling(), 220);
      R.vibrer(30);
    } else {
      R.lyd.sveip();
      R.vibrer(20);
    }
    R.si(ok ? `${R.navn(i)} får ${T.poeng} poeng.` : `${R.navn(i)} står over.`);

    // Set up the next turn now, so a reload during the stamp lands in the right place.
    sp.type = null;
    sp.kort = null;
    sp.andre = null;
    sp.byttet = false;
    if (sp.modus === "rekke") {
      sp.tur = (i + 1) % sp.antall;
      sp.fase = "valg";
      sp.animer = true;
    } else {
      sp.fase = "snurr";
    }
    R.lagre();
    const fortsatt = R.vakt();
    await R.vent(R.rolig() ? 650 : 1350);
    laast = false;
    if (!fortsatt()) return;
    R.gaTil("runde");
  }

  // ---------- Awards ----------

  function topp(sp, felt) {
    const max = Math.max(0, ...sp.stat.map((st) => (felt === "p" ? poengFor(st) : st[felt])));
    if (!max) return null;
    const hvem = [];
    sp.stat.forEach((st, i) => {
      if ((felt === "p" ? poengFor(st) : st[felt]) === max) hvem.push(i);
    });
    return { verdi: max, hvem };
  }

  function prisHtml(ikon, tittel, vinner, tekst, farge) {
    return `<li class="vh-pris" style="--vf: ${farge}">
      <span class="vh-pris-ikon" aria-hidden="true">${ikon}</span>
      <span class="vh-pris-tekst"><span class="etikett">${esc(tittel)}</span><b>${esc(vinner)}</b><span>${esc(tekst)}</span></span>
    </li>`;
  }

  function poengRader(sp) {
    return sp.stat
      .map((st, i) => ({ i, st, p: poengFor(st) }))
      .sort((a, b) => b.p - a.p || b.st.k - a.st.k || a.i - b.i);
  }

  function tavleHtml(sp) {
    const rader = poengRader(sp);
    const best = rader.length ? rader[0].p : 0;
    return `<ol class="poengliste vh-tavle">${rader
      .map(
        (r, n) => `<li class="${r.p === best && best > 0 ? "leder" : ""}"><span class="plass-nr">${n + 1}</span>${R.avatar(r.i)}` +
          `<span class="navn"><span class="vh-tavle-navn">${esc(R.navn(r.i))}</span>` +
          `<span class="vh-stat"><span class="vh">${antallOrd(r.st.k, "1 konsekvens", "konsekvenser")} og ${antallOrd(r.st.s, "1 sannhet", "sannheter")}</span><span aria-hidden="true">🔥 ${r.st.k} · 😇 ${r.st.s}</span></span></span>` +
          `<span class="sum">${r.p}</span></li>`,
      )
      .join("")}</ol>`;
  }

  // ---------- The game ----------

  R.start({
    id: "vaghalsen",
    versjon: 1,
    pagar: (S) => !!S.spill && S.skjerm !== "slutt",

    tilstand: () => ({
      antall: standardAntall(),
      oppsett: { pakker: STANDARD.slice(), tur: "flaske" },
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ pakker: STANDARD.slice(), tur: "flaske" }, S.oppsett || {});
      S.oppsett.pakker = (Array.isArray(S.oppsett.pakker) ? S.oppsett.pakker : []).filter((id) => pakke(id));
      if (!S.oppsett.pakker.length) S.oppsett.pakker = STANDARD.slice();
      if (!["flaske", "rekke"].includes(S.oppsett.tur)) S.oppsett.tur = "flaske";
      S.antall = R.klamp(Number(S.antall) || standardAntall(), 2, 20);
      const sp = S.spill;
      if (sp) {
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= 2 && sp.antall <= 20 &&
          Array.isArray(sp.stat) && sp.stat.length === sp.antall &&
          Array.isArray(sp.pakker) && sp.pakker.some((id) => pakke(id)) &&
          ["snurr", "valg", "kort"].includes(sp.fase) && typeof sp.vinkel === "number";
        if (!ok) S.spill = null;
        else {
          sp.pakker = sp.pakker.filter((id) => pakke(id));
          if (sp.fase !== "snurr" && !(Number.isInteger(sp.tur) && sp.tur < sp.antall)) {
            sp.fase = "snurr";
            sp.tur = null;
          }
          if (sp.fase === "kort" && !(TYPER[sp.type] && ALLE[sp.type][sp.kort])) sp.fase = "valg";
          if (sp.andre != null && !(sp.andre < sp.antall)) sp.andre = null;
          const a = sp.angre;
          if (a && !(Number.isInteger(a.i) && a.i < sp.antall && TYPER[a.type] && ALLE[a.type][a.kort])) sp.angre = null;
        }
      }
      // Never come back to a card screen without a card (e.g. reloaded during the stamp).
      if (S.skjerm === "kort" && !(S.spill && S.spill.fase === "kort")) S.skjerm = S.spill ? "runde" : "hjem";
      if (["runde", "slutt"].includes(S.skjerm) && !S.spill) S.skjerm = "hjem";
    },

    regler: {
      intro: "Flaska bestemmer hvem som står for tur. Velg sannhet eller konsekvens – og gjennomfør!",
      steg: [
        ["Snurr flaska", "Trykk på knappen, trykk på bordet eller gi flaska et spinn med fingeren. Den peker ut hvem som står for tur."],
        ["Sannhet eller konsekvens?", "Sannhet: svar ærlig på spørsmålet. Konsekvens: gjør utfordringen – med en gang."],
        ["Fullført – eller stå over", "Sannhet gir 1 poeng og konsekvens 2. Står du over, får du 0 – og det er helt greit."],
      ],
      tips: [
        "Alle kan si nei takk. Trykk «Står over» – det er alltid lov.",
        "Passer ikke kortet? Du kan bytte det én gang per tur.",
        "Nevner kortet en annen spiller? Den personen kan også si nei – da bytter dere kort.",
        "«Barn» passer fra 6 år. «Fest» er for voksne (18+).",
        "Vil dere heller gå på rekke og rad? Velg det når dere gjør klart.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Snurr flaska. Velg sannhet<br>eller konsekvens. <em>Tør du?</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: !!S.spill,
              fortsettTekst: S.spill ? `Fortsett · tur ${S.spill.nr + 1}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–20", "spillere"],
              [String(ANTALL_KORT), "kort"],
              ["0", "reklame"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <h2>Hvem står for tur?</h2>
            ${R.ui.fliser(
              "turmodus",
              [
                { v: "flaske", tittel: "Flaska bestemmer", tekst: "Snurr flaska og se hvem den peker på.", ikon: MINI_FLASKE },
                { v: "rekke", tittel: "På rekke og rad", tekst: "Alle får tur, én etter én.", ikon: "🔁" },
              ],
              S.oppsett.tur,
            )}
          </section>
          ${R.ui.spillere({ min: 2, max: 20, hjelp: "Navnene vises rundt bordet. Dyrene viser hvem som er hvem." })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Hvilke kort?</h2><span class="tall">${S.oppsett.pakker.length} valgt</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: p.tekst, ikon: p.ikon })),
              S.oppsett.pakker,
            )}
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !S.oppsett.pakker.length }))}`,
      },

      runde: {
        tittel: (S) => `Tur ${S.spill.nr + 1}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const valg = sp.fase !== "snurr";
          const synlig = valg && !sp.animer ? sp.tur : null;
          let info;
          if (valg) {
            info = `<p class="etikett">${sp.modus === "rekke" ? "Din tur" : "Flaska har talt"}</p>
              <h1 id="skjerm-tittel">${esc(R.navn(sp.tur))}</h1>
              <p class="ingress">Sannhet eller konsekvens?</p>`;
          } else if (sp.tur == null) {
            info = `<p class="etikett">Første tur</p>
              <h1 id="skjerm-tittel">Hvem begynner?</h1>
              <p class="ingress">Trykk på knappen – eller gi flaska et spinn med fingeren.</p>`;
          } else {
            info = `<p class="etikett">Neste tur</p>
              <h1 id="skjerm-tittel">${esc(R.navn(sp.tur))} snurrer</h1>
              <p class="ingress">Trykk på knappen – eller gi flaska et spinn med fingeren.</p>`;
          }
          const dokk = valg
            ? R.ui.dokk(
                `<div class="vh-valg">
                  <button class="knapp lilla" data-h="velg" data-v="s"><span class="vh-valg-ikon" aria-hidden="true">😇</span>Sannhet <small>+1 poeng</small></button>
                  <button class="knapp" data-h="velg" data-v="k"><span class="vh-valg-ikon" aria-hidden="true">🔥</span>Konsekvens <small>+2 poeng</small></button>
                </div>`,
                R.ui.lenkerad(
                  sp.angre ? R.ui.lenke("Angre", "angre") : "",
                  sp.modus === "rekke" ? R.ui.lenke("Hopp over", "hopp") : R.ui.lenke("Snurr på nytt", "snurr-igjen"),
                  R.ui.lenke("Poeng", "poeng"),
                ),
              )
            : R.ui.dokk(
                R.ui.knapp("Snurr flaska!", "snurr", { variant: "stor", ikon: SNURR_IKON, id: "vh-snurrknapp" }),
                R.ui.lenkerad(sp.angre ? R.ui.lenke("Angre", "angre") : "", R.ui.lenke("Poeng", "poeng"), R.ui.lenke("Avslutt", "kaaring")),
              );
          return `
            <div class="vh-scene">${hjulHtml(sp, { vinkel: sp.vinkel, valgt: synlig, vent: !valg && !sp.snurr })}</div>
            <div class="vh-info" id="vh-info">${info}</div>
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.snurr) fullforSnurr(S, false);
          else if (sp.animer) {
            sp.animer = false;
            snuTilNeste(S);
          }
          R.vedForlat(stoppAnimasjon);
        },
      },

      kort: {
        tittel: (S) => `Tur ${S.spill.nr + 1}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const T = TYPER[sp.type];
          const p = pakke(ALLE[sp.type][sp.kort].p);
          return `
            <div class="vh-hvem">
              ${R.avatar(sp.tur, "mid")}
              <div><p class="etikett">${sp.type === "s" ? "Svar ærlig" : "Gjør det nå"}</p><h1 id="skjerm-tittel">${esc(R.navn(sp.tur))}</h1></div>
            </div>
            <div class="vh-bunke ${sp.type}">${R.ui.storkort({
              etikett: `${T.ikon} ${T.navn}`,
              nr: `${p.ikon} ${p.navn}`,
              tekstHtml: kortTekst(sp),
              klasse: `vh-kort ${T.kort}`,
              id: "vh-kort",
            })}</div>
            ${R.ui.dokk(
              `<div class="knapprad vh-utfall">
                ${R.ui.knapp2("Står over", "staover")}
                ${R.ui.knapp("", "fullfort", { variant: "mynte", tekstHtml: `Fullført! <span class="vh-pluss">+${T.poeng}</span>` })}
              </div>`,
              sp.byttet ? `<p class="hjelp vh-byttet">Kortet er byttet – nå gjelder det!</p>` : R.ui.lenkerad(R.ui.lenke("Bytt kort (én gang)", "bytt")),
            )}`;
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: (S) => (S.spill.fase === "kort" ? "kort" : "runde"),
        vis(S) {
          const sp = S.spill;
          const vinner = topp(sp, "p");
          const vaghals = topp(sp, "k");
          const aerlig = topp(sp, "s");
          const priser = [
            vaghals
              ? prisHtml("🔥", "Største våghals", navneliste(vaghals.hvem), `${antallOrd(vaghals.verdi, "Én konsekvens", "konsekvenser")} fullført. Godt jobba!`, "var(--aksent)")
              : prisHtml("🔥", "Største våghals", "Ingen ennå", "Ingen tok en eneste konsekvens. Neste gang!", "var(--aksent)"),
            aerlig
              ? prisHtml("😇", "Ærligste", navneliste(aerlig.hvem), `${antallOrd(aerlig.verdi, "Ett ærlig svar", "ærlige svar")}. Ærlig talt imponerende.`, "var(--lilla)")
              : prisHtml("😇", "Ærligste", "Ingen ennå", "Ingen valgte sannhet. Hva skjuler dere?", "var(--lilla)"),
          ];
          const rader = sp.stat.map((st, i) => ({ i, poeng: poengFor(st) }));
          return `
            <div class="banner aksent">
              ${R.figur()}
              <h1 id="skjerm-tittel">${vinner ? `${esc(navneliste(vinner.hvem))} vinner!` : "Ingen poeng ennå"}</h1>
              <p class="ingress">${vinner ? `${vinner.verdi} poeng etter ${antallOrd(sp.nr, "én tur", "turer")}` : "Spill noen runder først – så blir det kåring!"}</p>
            </div>
            ${R.ui.pall(rader)}
            <ul class="vh-priser">${priser.join("")}</ul>
            <section class="seksjon">
              <h2>Poengtavla</h2>
              ${tavleHtml(sp)}
            </section>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          if (topp(S.spill, "p")) {
            R.lyd.fanfare();
            R.konfetti();
          }
        },
      },
    },

    handlinger: (H = {
      // A running game is never thrown away without asking.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!S.spill)) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      hjem: () => R.gaTil("hjem"),
      fortsett: (el, e, S) => R.gaTil(S.spill && S.spill.fase === "kort" ? "kort" : "runde"),
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      turmodus(el, e, S) {
        S.oppsett.tur = el.dataset.v === "rekke" ? "rekke" : "flaske";
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        const n = R.klamp(S.antall, 2, 20);
        const rekke = S.oppsett.tur === "rekke";
        S.spill = {
          antall: n,
          pakker: S.oppsett.pakker.slice(),
          modus: rekke ? "rekke" : "flaske",
          fase: rekke ? "valg" : "snurr",
          tur: rekke ? R.heltall(0, n - 1) : null,
          vinkel: Math.floor(Math.random() * 360),
          animer: rekke,
          snurr: null,
          angre: null,
          type: null,
          kort: null,
          andre: null,
          byttet: false,
          nr: 0,
          stat: Array.from({ length: n }, tom),
        };
        R.gaTil("runde");
      },
      snurr: (el, e, S) => snurr(1, null, S.spill.vinkel),
      "snurr-igjen"(el, e, S) {
        const sp = S.spill;
        if (animasjon) return;
        sp.fase = "snurr";
        R.vis();
        snurr(1, null, sp.vinkel);
      },
      hopp(el, e, S) {
        const sp = S.spill;
        if (animasjon) return;
        sp.tur = (sp.tur + 1) % sp.antall;
        sp.animer = true;
        sp.angre = null;
        R.vis();
        sp.animer = false;
        snuTilNeste(S);
      },
      velg(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "valg") return;
        sp.angre = null;
        sp.type = el.dataset.v === "k" ? "k" : "s";
        sp.byttet = false;
        trekk(S);
        sp.fase = "kort";
        R.lyd.snu();
        R.gaTil("kort");
      },
      async bytt(el, e, S) {
        const sp = S.spill;
        if (sp.byttet || laast) return;
        sp.byttet = true;
        trekk(S);
        R.lagre();
        const fortsatt = R.vakt();
        await R.kastKort(-1);
        if (fortsatt()) R.vis();
      },
      fullfort: (el, e, S) => utfall(S, true),
      // Take back the last «Fullført» or «Står over» and show the card again.
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || animasjon || sp.snurr || laast) return;
        const st = sp.stat[a.i];
        if (a.ok) st[a.type] = Math.max(0, st[a.type] - 1);
        else st.f = Math.max(0, st.f - 1);
        st.turer = Math.max(0, st.turer - 1);
        sp.nr = Math.max(0, sp.nr - 1);
        Object.assign(sp, { tur: a.i, type: a.type, kort: a.kort, andre: a.andre, byttet: a.byttet, vinkel: a.vinkel, fase: "kort", animer: false, angre: null });
        R.toast(a.ok ? `Angret – ${a.type === "k" ? "poengene" : "poenget"} er tatt bort` : "Angret – kortet er tilbake");
        R.gaTil("kort");
      },
      staover: (el, e, S) => utfall(S, false),
      poeng(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">Poengtavla</h2>
          ${tavleHtml(S.spill)}
          <p class="hjelp vh-forklaring"><span>🔥 Konsekvens 2 p</span><span>😇 Sannhet 1 p</span><span>Står over 0 p</span></p>
          <button class="knapp" data-h="lukk-ark">Spill videre</button>`);
      },
      async kaaring(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", "Dere får se kåringen med stillingen så langt.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt()) return;
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        S.antall = R.klamp(S.antall, 2, 20);
        H.start(el, e, S);
      },
    }),
  });
})();
