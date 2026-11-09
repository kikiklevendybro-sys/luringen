/* Kunstneren — "Tegn og gjett" (draw and guess) on one phone.
   Two modes:
   - Tegn og gjett: the drawer peeks at a secret word, draws it against the clock, the others
     shout their guesses. "Gjettet!" → pick who guessed → +1 guesser, +1 drawer (or +1 team).
   - Hviskeleken: telephone with pictures. Word → drawing → guess → drawing … passed around,
     each player seeing only the step before. At the end a gallery replays every drawing stroke
     by stroke next to the guesses.
   Drawings are kept as compact stroke strings (normalised, delta-encoded points), never as
   images, so a game survives a reload and the saved state stays small. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.ord;
  const esc = R.esc;
  let H; // the actions, so one action can reuse another

  // ---------- Words ----------

  const NIVAFELT = [null, "lett", "middels", "vanskelig"];
  const NIVANAVN = ["Blandet", "Lett", "Middels", "Vanskelig"];
  const KATEGORIER = D.kategorier;
  const ALLE = [];
  KATEGORIER.forEach((k) => [1, 2, 3].forEach((n) => (k[NIVAFELT[n]] || []).forEach((o) => ALLE.push({ o, n, k: k.id }))));
  const kategori = (id) => KATEGORIER.find((k) => k.id === id);
  const ALLE_KAT = KATEGORIER.map((k) => k.id);
  const stokk = R.kortstokk("ord", ALLE.length);
  const stor = (t) => {
    t = String(t || "");
    return t.charAt(0).toLocaleUpperCase("nb") + t.slice(1);
  };

  // ---------- Strokes as text ----------
  // Logical drawing surface: 900 × 1200 units (3:4), the same on every screen.
  // A stroke is one string: tool ("0"–"5" = colour, "x" = eraser), size ("0" thin, "1" thick),
  // then x0, y0 and the deltas to each next point as zigzag varints in base 32 (5 bits per
  // character, the 6th bit means "more"). "C" alone means "the sheet was cleared" (undoable).

  const B = 900;
  const HOY = 1200;
  const FORHOLD = B / HOY;
  const PAPIR = "#fff1dd";
  const FARGER = [
    ["Svart", "#21173a"],
    ["Rød", "#e5383b"],
    ["Blå", "#2b6fd6"],
    ["Grønn", "#2a9d55"],
    ["Gul", "#f7b801"],
    ["Brun", "#8a5530"],
  ];
  const PENN = [10, 27]; // line widths in logical units: thin, thick
  const VISK = [42, 90]; // eraser widths
  const MIN_AVSTAND = 4; // points closer than this are skipped while drawing
  const FORENKLING = 1.2; // tolerance when a finished stroke is simplified
  const MAKS_SPRANG = 26; // …but never more than this between two saved points
  const MAKS_PUNKTER = 1500; // per stroke (a longer one is split)
  const MAKS_TEGN = 40000; // characters of stroke data per drawing
  const MAKS_TOTALT = 1500000; // …and in the whole game: localStorage is small and shared by all games
  const TOM = "C";

  const ALFABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const VERDI = {};
  for (let i = 0; i < ALFABET.length; i++) VERDI[ALFABET[i]] = i;

  function skrivTall(ut, v) {
    let z = v < 0 ? -2 * v - 1 : 2 * v;
    while (z >= 32) {
      ut.push(ALFABET[32 + (z % 32)]);
      z = Math.floor(z / 32);
    }
    ut.push(ALFABET[z]);
  }

  function kodStrek(f, s, p) {
    const ut = [f < 0 ? "x" : String(f), String(s)];
    let fx = 0;
    let fy = 0;
    for (let i = 0; i + 1 < p.length; i += 2) {
      skrivTall(ut, p[i] - fx);
      skrivTall(ut, p[i + 1] - fy);
      fx = p[i];
      fy = p[i + 1];
    }
    return ut.join("");
  }

  // Returns { f, s, p: [x0, y0, x1, y1, …] }, { tom: true } for a clear, or null if broken.
  function lesStrek(tekst) {
    if (tekst === TOM) return { tom: true };
    if (typeof tekst !== "string" || tekst.length < 4) return null;
    const f = tekst[0] === "x" ? -1 : Number(tekst[0]);
    const s = Number(tekst[1]);
    if (!(f === -1 || (f >= 0 && f < FARGER.length)) || !(s === 0 || s === 1)) return null;
    const p = [];
    let i = 2;
    let fx = 0;
    let fy = 0;
    while (i < tekst.length) {
      let z = 0;
      let gang = 1;
      let c;
      do {
        c = VERDI[tekst[i++]];
        if (c === undefined) return null;
        z += (c % 32) * gang;
        gang *= 32;
      } while (c >= 32 && i < tekst.length);
      const d = z % 2 ? -(z + 1) / 2 : z / 2;
      if (p.length % 2 === 0) p.push((fx += d));
      else p.push((fy += d));
    }
    if (p.length % 2) p.pop();
    return p.length ? { f, s, p } : null;
  }

  // Decoded strokes are cached: the same strings are drawn again and again.
  const lest = new Map();
  function les(tekst) {
    if (lest.has(tekst)) return lest.get(tekst);
    if (lest.size > 6000) lest.clear();
    const s = lesStrek(tekst);
    lest.set(tekst, s);
    return s;
  }

  // Ramer–Douglas–Peucker without recursion drops points that add nothing to the line. Two more
  // rules keep the saved stroke looking exactly like the one you drew: the smoothing rounds a
  // corner by up to half a segment, so straight runs keep a point every MAKS_SPRANG units, and
  // sharp turns keep their neighbours.
  function forenkle(p, eps) {
    const n = p.length / 2;
    if (n < 3) return p.slice();
    const behold = new Uint8Array(n);
    behold[0] = 1;
    behold[n - 1] = 1;
    const stabel = [0, n - 1];
    const e2 = eps * eps;
    while (stabel.length) {
      const b = stabel.pop();
      const a = stabel.pop();
      const ax = p[2 * a];
      const ay = p[2 * a + 1];
      const dx = p[2 * b] - ax;
      const dy = p[2 * b + 1] - ay;
      const l2 = dx * dx + dy * dy;
      let maks = -1;
      let hvor = -1;
      for (let i = a + 1; i < b; i++) {
        let t = l2 ? ((p[2 * i] - ax) * dx + (p[2 * i + 1] - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = p[2 * i] - ax - t * dx;
        const ey = p[2 * i + 1] - ay - t * dy;
        const d = ex * ex + ey * ey;
        if (d > maks) {
          maks = d;
          hvor = i;
        }
      }
      if (maks > e2) {
        behold[hvor] = 1;
        stabel.push(a, hvor, hvor, b);
      }
    }
    for (let i = 1; i < n - 1; i++) {
      if (behold[i] !== 1) continue;
      const ax = p[2 * i] - p[2 * i - 2];
      const ay = p[2 * i + 1] - p[2 * i - 1];
      const bx = p[2 * i + 2] - p[2 * i];
      const by = p[2 * i + 3] - p[2 * i + 1];
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la && lb && (ax * bx + ay * by) / (la * lb) < 0.64) {
        behold[i - 1] = behold[i - 1] || 2;
        behold[i + 1] = behold[i + 1] || 2;
      }
    }
    for (let i = 1, sist = 0; i < n - 1; i++) {
      if (behold[i]) {
        sist = i;
        continue;
      }
      const dx = p[2 * i + 2] - p[2 * sist];
      const dy = p[2 * i + 3] - p[2 * sist + 1];
      if (dx * dx + dy * dy > MAKS_SPRANG * MAKS_SPRANG) {
        behold[i] = 3;
        sist = i;
      }
    }
    const ut = [];
    for (let i = 0; i < n; i++) if (behold[i]) ut.push(p[2 * i], p[2 * i + 1]);
    return ut;
  }

  // Strokes after the last clear are the ones you can see.
  const synlige = (strek) => strek.length - 1 - strek.lastIndexOf(TOM);
  const harTegnet = (strek) => synlige(strek) > 0;
  const datamengde = (strek) => strek.reduce((s, t) => s + t.length, 0);
  // All stroke data a game keeps: finished drawings plus the one in progress.
  const spilldata = (sp) =>
    (sp.historikk || []).reduce((s, t) => s + datamengde(t.s || []), 0) +
    (sp.steg || []).reduce((s, t) => s + (t.s ? datamengde(t.s) : 0), 0) +
    datamengde(sp.strek || []);
  const plassTil = (sp, mer) => datamengde(sp.strek) + mer <= MAKS_TEGN && spilldata(sp) + mer <= MAKS_TOTALT;
  const FULLT = "Nå er det fullt i skisseboka – denne tegningen er ferdig!";

  // ---------- Drawing on a canvas ----------
  // Smoothing: a straight line to the midpoint of the first two points, then quadratic curves
  // from midpoint to midpoint with each point as control, and a straight line to the end.
  // The live board draws the same curve piece by piece (segment + avslutt), so a stroke looks
  // the same while drawn, after an undo, after a reload and in a replay.

  function stil(ctx, s) {
    const farge = s.f < 0 ? PAPIR : (FARGER[s.f] || FARGER[0])[1];
    ctx.strokeStyle = farge;
    ctx.fillStyle = farge;
    ctx.lineWidth = s.f < 0 ? VISK[s.s] || VISK[0] : PENN[s.s] || PENN[0];
  }

  function blankt(ctx) {
    ctx.fillStyle = PAPIR;
    ctx.fillRect(0, 0, B, HOY);
  }

  function prikk(ctx, p) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // The piece of the curve that is final once point k is known (k ≥ 1).
  function segment(ctx, p, k) {
    const x0 = p[2 * k - 2];
    const y0 = p[2 * k - 1];
    const x1 = p[2 * k];
    const y1 = p[2 * k + 1];
    ctx.beginPath();
    if (k === 1) {
      ctx.moveTo(x0, y0);
      ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
    } else {
      ctx.moveTo((p[2 * k - 4] + x0) / 2, (p[2 * k - 3] + y0) / 2);
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.stroke();
  }

  function avslutt(ctx, p) {
    const n = p.length / 2;
    if (n < 2) return;
    ctx.beginPath();
    ctx.moveTo((p[2 * n - 4] + p[2 * n - 2]) / 2, (p[2 * n - 3] + p[2 * n - 1]) / 2);
    ctx.lineTo(p[2 * n - 2], p[2 * n - 1]);
    ctx.stroke();
  }

  function helStrek(ctx, s) {
    if (!s) return;
    if (s.tom) return blankt(ctx);
    stil(ctx, s);
    const p = s.p;
    const n = p.length / 2;
    if (n === 1) return prikk(ctx, p);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo((p[0] + p[2]) / 2, (p[1] + p[3]) / 2);
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(p[2 * i], p[2 * i + 1], (p[2 * i] + p[2 * i + 2]) / 2, (p[2 * i + 1] + p[2 * i + 3]) / 2);
    ctx.lineTo(p[2 * n - 2], p[2 * n - 1]);
    ctx.stroke();
  }

  function tegnAlle(ctx, strek) {
    blankt(ctx);
    for (const t of strek) helStrek(ctx, les(t));
  }

  // Backing store in device pixels (crisp on retina); drawing happens in logical units.
  function klargjor(lerret, bredde, hoyde, maksDpr) {
    const dpr = Math.min(maksDpr || 3, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.round(bredde * dpr));
    const h = Math.max(1, Math.round(hoyde * dpr));
    if (lerret.width !== w || lerret.height !== h) {
      lerret.width = w;
      lerret.height = h;
    }
    const ctx = lerret.getContext("2d");
    ctx.setTransform(w / B, 0, 0, h / HOY, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }

  // Everything bound to the canvases of the current render; stopped before the next render.
  let aktive = [];
  function ryddLerreter() {
    const liste = aktive;
    aktive = [];
    for (const a of liste) a.stopp();
  }

  // ---------- The live drawing board ----------
  // o: { strek() → string[], verktoy() → { f, s }, kan() → bool, vedStrek(tekst), vedStart(), vedLast() }

  class Brett {
    constructor(ark, o) {
      this.ark = ark;
      this.flate = ark.parentElement;
      this.lerret = ark.querySelector(".kunst-lerret");
      this.hale = ark.querySelector(".kunst-hale");
      this.o = o;
      this.ctx = null;
      this.hctx = null;
      this.peker = null;
      this.na = null;
      this.w = 0;
      this.h = 0;
      this.lyttere = [];
      const l = this.lerret;
      this.lytt(l, "pointerdown", (e) => this.ned(e));
      this.lytt(l, "pointermove", (e) => this.flytt(e));
      this.lytt(l, "pointerup", (e) => this.opp(e));
      this.lytt(l, "pointercancel", (e) => this.opp(e));
      this.lytt(l, "lostpointercapture", (e) => this.opp(e));
      // No scrolling, rubber-banding, double-tap zoom or callouts from touches on the canvas
      // (touch-action: none handles modern browsers; this covers older iOS).
      const nei = (e) => {
        if (e.cancelable) e.preventDefault();
      };
      this.lytt(l, "touchstart", nei, { passive: false });
      this.lytt(l, "touchmove", nei, { passive: false });
      this.lytt(l, "contextmenu", nei);
      this.obs = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.tilpass()) : null;
      if (this.obs) this.obs.observe(this.flate);
      else this.lytt(window, "resize", () => this.tilpass());
      this.tilpass();
    }
    lytt(el, type, fn, valg) {
      el.addEventListener(type, fn, valg);
      this.lyttere.push([el, type, fn, valg]);
    }
    // The biggest 3:4 sheet that fits the free space, on whole pixels (no blurry canvas).
    tilpass() {
      const fw = this.flate.clientWidth;
      const fh = this.flate.clientHeight;
      if (!fw || !fh) return;
      let w = Math.min(fw, Math.floor(fh * FORHOLD));
      let h = Math.round(w / FORHOLD);
      if (h > fh) {
        h = fh;
        w = Math.floor(h * FORHOLD);
      }
      if (w === this.w && h === this.h) return;
      this.w = w;
      this.h = h;
      this.ark.style.width = w + "px";
      this.ark.style.height = h + "px";
      this.ark.style.left = Math.round((fw - w) / 2) + "px";
      this.ark.style.top = Math.round((fh - h) / 2) + "px";
      this.ctx = klargjor(this.lerret, w, h, 3);
      this.hctx = klargjor(this.hale, w, h, 3);
      if (this.na) this.r = this.lerret.getBoundingClientRect();
      this.tegnAlt();
    }
    tegnAlt() {
      if (!this.ctx) return;
      tegnAlle(this.ctx, this.o.strek());
      if (this.na) helStrek(this.ctx, this.na);
    }
    punkt(e) {
      const r = this.r;
      return [R.klamp(Math.round(((e.clientX - r.left) / r.width) * B), 0, B), R.klamp(Math.round(((e.clientY - r.top) / r.height) * HOY), 0, HOY)];
    }
    ned(e) {
      if (!this.ctx) return;
      if (this.peker != null) {
        // A pen arriving while a finger "draws" means the finger was a resting palm: drop it.
        if (e.pointerType === "pen" && this.type === "touch") this.forkast();
        else return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!this.o.kan()) {
        if (this.o.vedLast) this.o.vedLast();
        return;
      }
      e.preventDefault();
      try {
        this.lerret.setPointerCapture(e.pointerId);
      } catch (feil) {
        /* not every pointer can be captured */
      }
      this.peker = e.pointerId;
      this.type = e.pointerType;
      this.r = this.lerret.getBoundingClientRect();
      const v = this.o.verktoy();
      this.na = { f: v.f, s: v.s, p: [] };
      if (this.o.vedStart) this.o.vedStart();
      this.leggTil(this.punkt(e));
    }
    leggTil(pkt) {
      const s = this.na;
      const p = s.p;
      const n = p.length / 2;
      if (n) {
        const dx = pkt[0] - p[p.length - 2];
        const dy = pkt[1] - p[p.length - 1];
        if (dx * dx + dy * dy < MIN_AVSTAND * MIN_AVSTAND) return;
      }
      p.push(pkt[0], pkt[1]);
      stil(this.ctx, s);
      if (n === 0) prikk(this.ctx, p);
      else segment(this.ctx, p, n);
      if (n + 1 >= MAKS_PUNKTER) this.del();
    }
    // A very long stroke is saved in parts so no single stroke grows without limit.
    del() {
      const s = this.na;
      const id = this.peker;
      const sist = s.p.slice(-2);
      this.fullfor();
      this.peker = id;
      this.na = { f: s.f, s: s.s, p: [] };
      this.leggTil(sist);
    }
    flytt(e) {
      if (e.pointerId !== this.peker || !this.na) return;
      // Read the sheet's position again: it may move under the finger (an animation ending, a
      // browser bar sliding away), and a stale position would bend the line.
      this.r = this.lerret.getBoundingClientRect();
      const liste = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      for (const ev of liste && liste.length ? liste : [e]) this.leggTil(this.punkt(ev));
      this.tegnHale(this.punkt(e));
    }
    // The last half segment up to the finger goes on a see-through canvas on top, so the line
    // follows the finger at once instead of waiting for the next point.
    tegnHale(fingr) {
      const c = this.hctx;
      const s = this.na;
      if (!c || !s || !s.p.length) return;
      c.clearRect(0, 0, B, HOY);
      const p = s.p;
      const n = p.length / 2;
      stil(c, s);
      c.beginPath();
      if (n >= 2) c.moveTo((p[2 * n - 4] + p[2 * n - 2]) / 2, (p[2 * n - 3] + p[2 * n - 1]) / 2);
      else c.moveTo(p[0], p[1]);
      c.lineTo(p[2 * n - 2], p[2 * n - 1]);
      c.lineTo(fingr[0], fingr[1]);
      c.stroke();
    }
    opp(e) {
      if (e.pointerId !== this.peker) return;
      if (e.type === "pointerup" && this.na) this.leggTil(this.punkt(e));
      this.fullfor();
    }
    forkast() {
      this.peker = null;
      this.na = null;
      if (this.hctx) this.hctx.clearRect(0, 0, B, HOY);
      this.tegnAlt();
    }
    fullfor() {
      const s = this.na;
      this.peker = null;
      this.na = null;
      if (this.hctx) this.hctx.clearRect(0, 0, B, HOY);
      if (!s || !s.p.length) return;
      stil(this.ctx, s);
      avslutt(this.ctx, s.p);
      this.o.vedStrek(kodStrek(s.f, s.s, forenkle(s.p, FORENKLING)));
    }
    stopp() {
      if (this.na) this.fullfor();
      if (this.obs) this.obs.disconnect();
      for (const [el, type, fn, valg] of this.lyttere) el.removeEventListener(type, fn, valg);
      this.lyttere = [];
      // Give the pixels back at once (phones, iOS in particular, have little canvas memory).
      for (const c of [this.lerret, this.hale]) c.width = c.height = 0;
    }
  }

  // ---------- Showing and replaying a finished drawing ----------
  // The sheet (.kunst-ark) gets its size from CSS (width + aspect-ratio); the canvas follows.

  class Visning {
    constructor(ark, strek, spillAv) {
      this.ark = ark;
      this.lerret = ark.querySelector("canvas");
      this.strek = strek;
      this.ctx = null;
      this.ramme = 0;
      this.w = 0;
      this.obs = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.tilpass()) : null;
      if (this.obs) this.obs.observe(ark);
      this.tilpass();
      if (spillAv) this.spillAv();
      else this.tegnFerdig();
    }
    tilpass() {
      const w = this.ark.clientWidth;
      if (!w || w === this.w) return;
      this.w = w;
      this.ctx = klargjor(this.lerret, w, w / FORHOLD, 2);
      // A resize mid-replay just shows the finished drawing.
      this.stoppAvspilling();
      this.tegnFerdig();
    }
    tegnFerdig() {
      if (this.ctx) tegnAlle(this.ctx, this.strek);
    }
    stoppAvspilling() {
      if (this.ramme) cancelAnimationFrame(this.ramme);
      this.ramme = 0;
      this.ark.classList.remove("spiller");
    }
    // Stroke by stroke, point by point, with a short breath between strokes (as when the pen
    // is lifted): 1.6–6 seconds per drawing.
    spillAv() {
      this.stoppAvspilling();
      if (!this.ctx) return;
      const liste = this.strek.map(les).filter(Boolean);
      const PUST = 9;
      const total = liste.reduce((sum, s) => sum + PUST + (s.tom ? 1 : s.p.length / 2), 0);
      if (!liste.length || R.rolig()) return this.tegnFerdig();
      const ctx = this.ctx;
      const varighet = R.klamp(total * 9, 1600, 6000);
      let si = 0;
      let pi = 0;
      let gjort = 0;
      let start = 0;
      let vent = PUST;
      blankt(ctx);
      this.ark.classList.add("spiller");
      const steg = () => {
        gjort++;
        if (vent > 0) {
          vent--;
          return;
        }
        const s = liste[si];
        if (s.tom) {
          blankt(ctx);
          si++;
          vent = PUST;
          return;
        }
        const n = s.p.length / 2;
        stil(ctx, s);
        if (pi === 0) prikk(ctx, s.p);
        else segment(ctx, s.p, pi);
        if (pi >= n - 1) {
          avslutt(ctx, s.p);
          si++;
          pi = 0;
          vent = PUST;
        } else pi++;
      };
      const ramme = (na) => {
        if (!start) start = na;
        const mal = Math.min(total, Math.ceil(((na - start) / varighet) * total));
        while (gjort < mal && si < liste.length) steg();
        if (si < liste.length) this.ramme = requestAnimationFrame(ramme);
        else {
          this.ramme = 0;
          this.ark.classList.remove("spiller");
        }
      };
      this.ramme = requestAnimationFrame(ramme);
    }
    stopp() {
      this.stoppAvspilling();
      if (this.obs) this.obs.disconnect();
      this.lerret.width = this.lerret.height = 0; // free the canvas memory right away
    }
  }

  // Markup for a sheet: the live board (two canvases) or a finished drawing.
  const levendeArk = (slorHtml) =>
    `<div class="kunst-flate"><div class="kunst-ark levende"><canvas class="kunst-lerret" role="img" aria-label="Tegneark – tegn med fingeren eller musa"></canvas><canvas class="kunst-hale" aria-hidden="true"></canvas><p class="kunst-tegnher" aria-hidden="true" hidden>Tegn her ✏️</p>${slorHtml || ""}</div></div>`;
  const visArk = (nokkel, tekst, klasse) =>
    `<span class="kunst-ark ${klasse || ""}" data-ark="${esc(nokkel)}"><canvas role="img" aria-label="${esc(tekst || "Tegning")}"></canvas></span>`;

  // ---------- Icons ----------

  const svg = (d, klasse) => `<svg class="${klasse || ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const IKON = {
    angre: svg('<path d="M8.5 4 3.5 9l5 5"/><path d="M3.5 9H15a5.5 5.5 0 0 1 0 11h-3.5"/>'),
    gjenta: svg('<path d="m15.5 4 5 5-5 5"/><path d="M20.5 9H9a5.5 5.5 0 0 0 0 11h3.5"/>'),
    tom: svg('<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.2 7l1.1 13h9.4l1.1-13"/><path d="M10 11v5.5M14 11v5.5"/>'),
    visk: svg('<path d="M14.5 3.5 21 10l-9 9H7.5L3 14.5z"/><path d="m8.5 9.5 6.5 6.5"/><path d="M13 21h8"/>'),
    oye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/>'),
    pause: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
    spill: svg('<path class="fylt" d="M8 5.5v13l10.5-6.5z"/>'),
    bytt: svg('<path d="M3 7h3.6c2 0 3.2.9 4.2 2.6l2.4 4.8c1 1.7 2.2 2.6 4.2 2.6H21"/><path d="m18 14 3 3-3 3"/><path d="M3 17h3.6c1.1 0 2-.3 2.7-.9"/><path d="M14.7 7.9c.7-.6 1.6-.9 2.7-.9H21"/><path d="m18 4 3 3-3 3"/>'),
  };

  // ---------- Game state ----------

  const lagFor = (sp, i) => i % sp.lag;
  function lagMedlemmer(antall, lag) {
    const ut = Array.from({ length: lag }, () => []);
    for (let i = 0; i < antall; i++) ut[i % lag].push(i);
    return ut;
  }
  // Who draws when: everyone in seat order, or the teams taking turns (each team equally often).
  function tegneRekke(antall, lag, runder) {
    const rekke = [];
    if (!lag) {
      for (let r = 0; r < runder; r++) for (let i = 0; i < antall; i++) rekke.push(i);
      return rekke;
    }
    const grupper = lagMedlemmer(antall, lag);
    const perLag = runder * Math.max(...grupper.map((g) => g.length));
    for (let k = 0; k < perLag; k++) for (const g of grupper) rekke.push(g[k % g.length]);
    return rekke;
  }
  const lagLov = (antall, lag) => !lag || antall >= lag * 2;

  // A word that matches the chosen categories and level, not used before in this game.
  function trekkOrd(S, unntak) {
    const o = S.oppsett;
    const kat = new Set(o.kategorier.length ? o.kategorier : ALLE_KAT);
    const brukt = new Set((S.spill && S.spill.brukt) || []);
    const passer = (i) => kat.has(ALLE[i].k) && (!o.niva || ALLE[i].n === o.niva) && ALLE[i].o !== unntak;
    let i = stokk.neste((n) => passer(n) && !brukt.has(ALLE[n].o));
    if (i < 0) i = stokk.neste(passer);
    if (i < 0) i = stokk.neste();
    const w = ALLE[i];
    if (S.spill && S.spill.brukt) S.spill.brukt.push(w.o);
    return { o: w.o, n: w.n, k: w.k };
  }
  const ordTekst = (ord) => stor(ord.o);
  // Same word, give or take an article or a Norwegian ending (bil, en bil, bilen, biler …).
  const rot = (t) =>
    R.normaliser(t)
      .replace(/^(en|ei|et|ett) /, "")
      .split(" ")
      .map((o) => (o.length > 4 ? o.replace(/(ene|ane|en|et|er|ar|a|e)$/, "") : o))
      .join(" ");
  const likOrd = (a, b) => R.normaliser(a) === R.normaliser(b) || rot(a) === rot(b);
  const ordPille = (ord) => {
    const k = kategori(ord.k);
    return `${k ? `${esc(k.ikon)} ${esc(k.navn)} · ` : ""}${esc(NIVANAVN[ord.n] || "")}`;
  };

  // A game is in progress until it reaches Kåringen (the home screen, the front page and the
  // kit's wake lock all ask this).
  const iGang = (S) => !!(S.spill && !S.spill.ferdig);

  // --- Tegn og gjett ---

  function startTegn(S) {
    const o = S.oppsett;
    const antall = S.antall;
    const lag = lagLov(antall, o.lag) ? o.lag : 0;
    S.spill = {
      modus: "tegn",
      antall,
      lag,
      tid: o.tid,
      rekke: tegneRekke(antall, lag, o.runder),
      tur: 0,
      poeng: Array(lag || antall).fill(0),
      historikk: [],
      brukt: [],
      her: "ord",
    };
    nyTur(S);
  }

  function nyTur(S) {
    const sp = S.spill;
    sp.tegner = sp.rekke[sp.tur];
    Object.assign(sp, { ord: trekkOrd(S), sett: false, byttet: 0, strek: [], angret: [], verktoy: { f: 0, s: 0 }, igjen: sp.tid, pause: false, fase: "ord" });
  }

  // ok: guessed or not; gjetter: the player who guessed (everyone-against-everyone).
  // The turn remembers where the decision was made, so «Angre» on the result can take it back.
  function avsluttTur(S, ok, gjetter) {
    const sp = S.spill;
    const angre = { skjerm: S.skjerm === "hvem" ? "hvem" : "tegn", fase: sp.fase === "ute" ? "ute" : "tegn", igjen: sp.igjen };
    const pluss = {};
    if (ok) {
      if (sp.lag) pluss[lagFor(sp, sp.tegner)] = 1;
      else {
        pluss[gjetter] = 1;
        pluss[sp.tegner] = 1;
      }
      for (const k of Object.keys(pluss)) sp.poeng[k] += 1;
    }
    sp.historikk.push({ t: sp.tegner, o: sp.ord, s: sp.strek, ok: !!ok, g: ok && !sp.lag ? gjetter : -1, sek: Math.max(1, Math.round(sp.tid - sp.igjen)), pluss, angre });
    sp.strek = [];
    sp.angret = [];
    sp.fase = "resultat";
  }

  function rader(sp, pluss) {
    return sp.poeng.map((p, n) => Object.assign(sp.lag ? { lag: n } : { i: n }, { poeng: p, pluss: pluss && pluss[n] ? pluss[n] : 0 }));
  }

  // --- Hviskeleken ---

  // Who plays each step of a chain. Always an even number of steps (it ends on a guess), at least
  // draw–guess–draw–guess. One round: everyone once in seat order. With an odd count the one who saw
  // the secret word must not get the last guess, so from five players the one before the starter sits
  // this chain out (it rotates, since every new chain starts one seat later); with three, the first
  // guesser also takes the last step. Two rounds: everyone twice.
  function kjedeRekke(antall, start, runder) {
    const sete = (k) => (start + k) % antall;
    let lengde;
    if (runder === 2) lengde = Math.max(8, antall * 2);
    else if (antall % 2 === 0) lengde = Math.max(4, antall);
    else if (antall >= 5) lengde = antall - 1;
    else return [sete(0), sete(1), sete(2), sete(1)];
    return Array.from({ length: lengde }, (_, k) => sete(k));
  }

  function startHvisk(S, start) {
    const o = S.oppsett;
    const antall = S.antall;
    const forste = (start || 0) % antall;
    S.spill = {
      modus: "hvisk",
      antall,
      tid: o.htid,
      start: forste,
      rekke: kjedeRekke(antall, forste, o.lengde),
      steg: [],
      na: 0,
      vist: 1,
      brukt: [],
      strek: [],
      angret: [],
      verktoy: { f: 0, s: 0 },
      igjen: o.htid,
      ute: false,
      utkast: "",
      her: "hgi",
    };
    S.spill.ord = trekkOrd(S);
  }
  const hTegner = (k) => k % 2 === 0;
  // What a drawing step has to draw: the word (first step) or the guess before it.
  const hMotiv = (sp, k) => (k === 0 ? ordTekst(sp.ord) : sp.steg[k - 1].g);

  function nyttHSteg(S) {
    const sp = S.spill;
    Object.assign(sp, { strek: [], angret: [], verktoy: { f: 0, s: 0 }, igjen: sp.tid, ute: false, utkast: "" });
  }

  // Stroke list behind a data-ark key: "na" (the drawing in progress), "t3" (turn 3), "h2" (chain step 2).
  function strekFor(S, nokkel) {
    const sp = S.spill;
    if (!sp) return null;
    if (nokkel === "na") return sp.strek || null;
    const n = Number(nokkel.slice(1));
    if (nokkel[0] === "t" && sp.historikk && sp.historikk[n]) return sp.historikk[n].s;
    if (nokkel[0] === "h" && sp.steg && sp.steg[n]) return sp.steg[n].s;
    return null;
  }

  // ---------- Timer ----------

  function lagKlokke(S, autostart) {
    const sp = S.spill;
    if (!sp.tid) return null;
    const t = new R.Timer({
      id: "kunst-tid",
      sekunder: Math.max(0.2, sp.igjen),
      vedTikk: (sek) => {
        sp.igjen = t.igjen;
        if (sek % 5 === 0) R.lagre(); // often enough for a reload, rarely enough to stay smooth
      },
      vedSlutt: () => {
        t.igjenMs = 0; // a finished kit timer would otherwise show its start time again
        tidUte(S);
      },
    });
    t.total = sp.tid;
    if (autostart) t.start();
    else t.tegn();
    return t;
  }

  // Draws the ring for the current state, also when no timer is running (after time is up).
  function tegnKlokke(S) {
    const t = R.timer("kunst-tid");
    if (t) return t.tegn();
    const el = document.getElementById("kunst-tid");
    if (!el || !S.spill || !S.spill.tid) return;
    const fyll = el.querySelector(".fyll");
    const omkrets = 2 * Math.PI * 54;
    if (fyll) {
      fyll.style.strokeDasharray = String(omkrets);
      fyll.style.strokeDashoffset = String(omkrets * (1 - Math.max(0, S.spill.igjen) / S.spill.tid));
    }
    el.classList.toggle("ferdig", S.spill.igjen <= 0);
    el.classList.toggle("pause", S.spill.igjen > 0);
  }

  function stoppKlokke(S) {
    const t = R.timer("kunst-tid");
    if (!t) return;
    if (S.spill && !t.ferdig) S.spill.igjen = t.igjen;
    t.stopp();
  }

  function tidUte(S) {
    const sp = S.spill;
    if (!sp) return;
    sp.igjen = 0;
    if (sp.modus === "tegn") {
      if (sp.fase !== "tegn") return;
      sp.fase = "ute";
    } else sp.ute = true;
    R.vis();
  }

  // ---------- Binding canvases and tools after each render ----------

  let brett = null; // the live board on screen, if any
  const visninger = new Map(); // data-ark key → Visning
  let spillAvNeste = null; // key of a drawing that should replay as soon as it is shown

  function kanTegne(S) {
    const sp = S.spill;
    if (!sp) return false;
    if (sp.modus === "tegn") return sp.fase === "tegn" && !sp.pause;
    return !sp.ute;
  }

  function nyStrek(S, tekst) {
    const sp = S.spill;
    if (!plassTil(sp, tekst.length)) {
      R.toast(FULLT);
      if (brett) brett.tegnAlt();
      return;
    }
    sp.strek.push(tekst);
    sp.angret = [];
    R.lagre();
    oppdaterVerktoy(S);
    // The word is settled once the drawing has begun (the button keeps its space, so nothing moves).
    const bytt = R.$('#skjerm [data-h="hbytt"]');
    if (bytt) {
      bytt.disabled = true;
      bytt.style.visibility = "hidden";
    }
  }

  // A finger on the sheet: hide the "Tegn her" hint, and in a chain drawing start the clock
  // ("time runs while you draw").
  function vedStrekStart(S) {
    const sp = S.spill;
    const tips = R.$("#skjerm .kunst-tegnher");
    if (tips) tips.hidden = true;
    if (sp.modus !== "hvisk") return;
    const t = R.timer("kunst-tid");
    if (t && !t.kjorer && !t.ferdig) {
      t.start();
      // Keep the hint's space: the sheet must not move under the finger mid-stroke.
      const hint = R.$("#kunst-tidhint");
      if (hint) hint.style.visibility = "hidden";
    }
  }

  function oppdaterVerktoy(S) {
    const sp = S.spill;
    const rot = R.$("#skjerm");
    if (!sp || !rot || !sp.verktoy) return;
    const v = sp.verktoy;
    R.$$('[data-h="farge"]', rot).forEach((b) => b.setAttribute("aria-pressed", String(v.f === Number(b.dataset.v))));
    R.$$('[data-h="visk"]', rot).forEach((b) => b.setAttribute("aria-pressed", String(v.f < 0)));
    R.$$('[data-h="storrelse"]', rot).forEach((b) => b.setAttribute("aria-pressed", String(v.s === Number(b.dataset.v))));
    const boks = R.$(".kunst-verktoy", rot);
    if (boks) boks.style.setProperty("--kunst-farge", v.f < 0 ? PAPIR : FARGER[v.f][1]);
    const sett = (h, av) => {
      const b = R.$(`[data-h="${h}"]`, rot);
      if (b) b.disabled = av;
    };
    sett("angre", !sp.strek.length);
    sett("gjenta", !sp.angret.length);
    sett("tom", !harTegnet(sp.strek));
    const tips = R.$(".kunst-tegnher", rot);
    if (tips) tips.hidden = harTegnet(sp.strek) || !kanTegne(S);
  }

  // Hold the eye to peek at the word while drawing (Tegn og gjett).
  function bindTitt(S, rot) {
    const knapp = R.$("#kunst-titt", rot);
    const boble = R.$("#kunst-titt-boble", rot);
    if (!knapp || !boble) return;
    // Small and right by the button (under the drawer's thumb), never big on the sheet the others watch.
    const vis = (pa) => {
      boble.innerHTML = pa && S.spill && S.spill.ord ? `<small>Snu mobilen før du titter</small><b>${esc(ordTekst(S.spill.ord))}</b>` : "";
      boble.hidden = !pa;
      knapp.setAttribute("aria-pressed", String(pa));
    };
    const lyttere = [
      ["pointerdown", (e) => {
        e.preventDefault();
        try {
          knapp.setPointerCapture(e.pointerId);
        } catch (feil) {
          /* ignore */
        }
        vis(true);
      }],
      ["pointerup", () => vis(false)],
      ["pointercancel", () => vis(false)],
      ["lostpointercapture", () => vis(false)],
      ["keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          vis(true);
        }
      }],
      ["keyup", (e) => {
        if (e.key === " " || e.key === "Enter") vis(false);
      }],
      ["blur", () => vis(false)],
      ["contextmenu", (e) => e.preventDefault()],
    ];
    lyttere.forEach(([t, fn]) => knapp.addEventListener(t, fn));
    aktive.push({ stopp: () => lyttere.forEach(([t, fn]) => knapp.removeEventListener(t, fn)) });
  }

  function bindLerreter(S, rot) {
    ryddLerreter();
    visninger.clear();
    brett = null;
    const levende = R.$(".kunst-ark.levende", rot);
    if (levende && S.spill) {
      const sp = S.spill;
      brett = new Brett(levende, {
        strek: () => sp.strek,
        verktoy: () => sp.verktoy,
        kan: () => kanTegne(S) && plassTil(sp, 8),
        vedStrek: (t) => nyStrek(S, t),
        vedStart: () => vedStrekStart(S),
        vedLast: () => {
          if (sp.modus === "tegn" && sp.pause) R.toast("Trykk «Fortsett» for å tegne videre");
          else if (!plassTil(sp, 8)) R.toast(FULLT);
          else R.toast("Tiden er ute!");
        },
      });
      aktive.push(brett);
      oppdaterVerktoy(S);
    }
    R.$$(".kunst-ark[data-ark]", rot).forEach((ark) => {
      const strek = strekFor(S, ark.dataset.ark);
      if (!strek) return;
      const v = new Visning(ark, strek, ark.dataset.ark === spillAvNeste);
      visninger.set(ark.dataset.ark, v);
      aktive.push(v);
    });
    spillAvNeste = null;
    bindTitt(S, rot);
    tegnKlokke(S);
    // No pinch-zoom, scrolling or iOS page gestures anywhere on a drawing screen.
    const fast = R.$(".kunst-fast", rot);
    if (fast) {
      const nei = (e) => {
        if (e.cancelable) e.preventDefault();
      };
      const flyttNei = (e) => {
        if (e.touches && e.touches.length > 1) nei(e);
      };
      fast.addEventListener("touchmove", flyttNei, { passive: false });
      fast.addEventListener("gesturestart", nei);
      aktive.push({
        stopp() {
          fast.removeEventListener("touchmove", flyttNei, { passive: false });
          fast.removeEventListener("gesturestart", nei);
        },
      });
    }
  }

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) while drawing with a keyboard.
  document.addEventListener("keydown", (e) => {
    if (!brett || !(e.ctrlKey || e.metaKey) || R.arkApent()) return;
    const el = e.target;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "z" || k === "y") {
      e.preventDefault();
      if (k === "y" || e.shiftKey) H.gjenta(null, e, R.S);
      else H.angre(null, e, R.S);
    }
  });

  // A hidden tab (phone locked, app switch) pauses the clock, so nobody loses time.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    const sp = S && S.spill;
    if (!sp) return;
    const t = R.timer("kunst-tid");
    if (document.hidden) {
      if (t && t.kjorer) {
        t.pause();
        sp.igjen = t.igjen;
        if (sp.modus === "tegn") sp.pause = true;
        R.lagre();
      }
    } else if (sp.modus === "tegn" && sp.pause && S.skjerm === "tegn") R.vis();
  });

  // Drawing screens fill the screen exactly: no page scroll, no pull-to-refresh, no zoom.
  const fastSide = (pa) => document.documentElement.classList.toggle("kunst-lerretside", !!pa);

  // ---------- A picture to share: the chain or the exhibition on one canvas ----------

  const BILDEFONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  const BILDE_B = 960;
  const KANT = 56;

  function brytLinjer(ctx, tekst, maks) {
    const ut = [];
    let linje = "";
    // Words too long for a line are split into pieces that fit.
    const ordene = [];
    for (const o of String(tekst).split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(o).width <= maks) {
        ordene.push(o);
        continue;
      }
      let bit = "";
      for (const tegn of o) {
        if (bit && ctx.measureText(bit + tegn).width > maks) {
          ordene.push(bit);
          bit = "";
        }
        bit += tegn;
      }
      if (bit) ordene.push(bit);
    }
    for (const o of ordene) {
      const prov = linje ? linje + " " + o : o;
      if (!linje || ctx.measureText(prov).width <= maks) linje = prov;
      else {
        ut.push(linje);
        linje = o;
      }
    }
    if (linje) ut.push(linje);
    return ut.length ? ut : [""];
  }

  function rundRekt(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function bildeTegning(ctx, strek, x, y, w) {
    const h = w / FORHOLD;
    ctx.save();
    ctx.fillStyle = "#f1dcc0";
    rundRekt(ctx, x, y + 8, w, h, 22);
    ctx.fill();
    rundRekt(ctx, x, y, w, h, 22);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(w / B, h / HOY);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    tegnAlle(ctx, strek);
    ctx.restore();
    return h + 8;
  }

  function bildeTekst(ctx, tekst, x, y, maks, storrelse, farge, vekt, midt) {
    ctx.font = `${vekt || 900} ${storrelse}px ${BILDEFONT}`;
    ctx.fillStyle = farge;
    ctx.textAlign = midt ? "center" : "left";
    ctx.textBaseline = "top";
    const linjer = brytLinjer(ctx, tekst, maks);
    linjer.forEach((l, i) => ctx.fillText(l, midt ? x + maks / 2 : x, y + i * storrelse * 1.18));
    return linjer.length * storrelse * 1.18;
  }

  // Lays out the picture. Called twice: first only measuring (tegn = false) to know the height,
  // then drawing on a canvas of exactly that height.
  function bildeOppsett(S, ctx, tegn) {
    const sp = S.spill;
    const bredde = BILDE_B - 2 * KANT;
    // Draws (or only measures) wrapped text with its top at ty; returns its height.
    const skriv = (t, x, ty, maks, str, farge, vekt, midt) => {
      if (tegn) return bildeTekst(ctx, t, x, ty, maks, str, farge, vekt, midt);
      ctx.font = `${vekt || 900} ${str}px ${BILDEFONT}`;
      return brytLinjer(ctx, t, maks).length * str * 1.18;
    };
    let y = KANT;
    if (sp.modus === "hvisk") {
      const L = sp.rekke.length;
      const sist = sp.steg[L - 1] ? sp.steg[L - 1].g : "";
      y += skriv("KUNSTNEREN · HVISKELEKEN", KANT, y, bredde, 26, "#a08cc8", 800, true) + 14;
      y += skriv(`Fra «${ordTekst(sp.ord)}» til «${sist}»`, KANT, y, bredde, 52, "#fff1dd", 900, true) + 44;
      const venstre = 430;
      const hx = KANT + venstre + 48;
      const hb = BILDE_B - KANT - hx;
      for (let k = 0; k < L; k += 2) {
        const tegning = sp.steg[k];
        const gjett = sp.steg[k + 1];
        const motiv = hMotiv(sp, k);
        // Left: who drew what, and the drawing. Right: the guess that came of it.
        let vy = y + skriv(`${R.navn(tegning.i)} tegnet «${motiv}»`, KANT, y, venstre, 28, "#cdbce9", 800) + 12;
        vy += tegn ? bildeTegning(ctx, tegning.s, KANT, vy, venstre) : venstre / FORHOLD + 8;
        let hy = y + 96;
        if (gjett) {
          if (tegn) {
            ctx.strokeStyle = "#6a4fa0";
            ctx.lineWidth = 6;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(hx - 40, hy + 120);
            ctx.lineTo(hx - 12, hy + 120);
            ctx.moveTo(hx - 22, hy + 108);
            ctx.lineTo(hx - 10, hy + 120);
            ctx.lineTo(hx - 22, hy + 132);
            ctx.stroke();
          }
          hy += skriv(`${R.navn(gjett.i)} gjettet`, hx, hy, hb, 28, "#cdbce9", 800) + 12;
          ctx.font = `900 44px ${BILDEFONT}`;
          const linjer = brytLinjer(ctx, `«${gjett.g}»`, hb - 48);
          const bobleH = linjer.length * 52 + 40;
          if (tegn) {
            ctx.fillStyle = likOrd(gjett.g, motiv) ? "#3de3b0" : "#f7a6ff";
            rundRekt(ctx, hx, hy, hb, bobleH, 28);
            ctx.fill();
            ctx.fillStyle = "#170e2b";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            linjer.forEach((l, i) => ctx.fillText(l, hx + 24, hy + 22 + i * 52));
          }
          hy += bobleH;
        }
        y = Math.max(vy, hy) + 52;
      }
    } else {
      const r = rader(sp);
      const topp = Math.max(0, ...r.map((x) => x.poeng));
      const vinnere = topp > 0 ? r.filter((x) => x.poeng === topp).map((x) => (x.lag != null ? lagNavn(x.lag) : R.navn(x.i))) : [];
      y += skriv("KUNSTNEREN · TEGN OG GJETT", KANT, y, bredde, 26, "#a08cc8", 800, true) + 14;
      y += skriv("Kveldens utstilling", KANT, y, bredde, 56, "#fff1dd", 900, true) + 10;
      if (vinnere.length) y += skriv(`${R.ramsOpp(vinnere)} vinner! · ${topp} poeng`, KANT, y, bredde, 32, "#f7a6ff", 800, true) + 10;
      y += 30;
      const kol = sp.historikk.length > 12 ? 3 : 2;
      const mellom = 28;
      const w = (bredde - (kol - 1) * mellom) / kol;
      for (let n = 0; n < sp.historikk.length; n += kol) {
        let radH = 0;
        for (let c = 0; c < kol && n + c < sp.historikk.length; c++) {
          const tur = sp.historikk[n + c];
          const x = KANT + c * (w + mellom);
          let h = (tegn ? bildeTegning(ctx, tur.s, x, y, w) : w / FORHOLD + 8) + 12;
          h += skriv(ordTekst(tur.o), x, y + h, w, kol === 3 ? 30 : 36, "#fff1dd", 900);
          h += skriv(`${R.navn(tur.t)} ${tur.ok ? "✓" : "✗"}`, x, y + h, w, kol === 3 ? 22 : 26, "#a08cc8", 700);
          radH = Math.max(radH, h);
        }
        y += radH + 36;
      }
    }
    y += skriv("Tegnet på rusj.no", KANT, y, bredde, 28, "#a08cc8", 800, true) + KANT;
    return Math.ceil(y);
  }

  let delbilde = null;
  async function lagDelbilde(S) {
    const lerret = document.createElement("canvas");
    lerret.width = BILDE_B;
    lerret.height = 10;
    const hoyde = bildeOppsett(S, lerret.getContext("2d"), false);
    lerret.height = Math.min(hoyde, 16000);
    const ctx = lerret.getContext("2d");
    ctx.fillStyle = "#150c28";
    ctx.fillRect(0, 0, lerret.width, lerret.height);
    bildeOppsett(S, ctx, true);
    const blob = await new Promise((ok) => lerret.toBlob(ok, "image/png"));
    if (!blob) throw new Error("Kunne ikke lage bildet");
    if (delbilde) URL.revokeObjectURL(delbilde.url);
    const navn = S.spill.modus === "hvisk" ? "kunstneren-hviskeleken.png" : "kunstneren-utstilling.png";
    delbilde = { blob, url: URL.createObjectURL(blob), navn, fil: typeof File === "function" ? new File([blob], navn, { type: "image/png" }) : null };
    return delbilde;
  }

  const kanDeleFil = () => {
    try {
      return !!(delbilde && delbilde.fil && navigator.canShare && navigator.canShare({ files: [delbilde.fil] }));
    } catch (e) {
      return false;
    }
  };

  // ---------- Markup ----------

  function verktoyHtml(sp, last) {
    const v = sp.verktoy;
    const farger = FARGER.map(
      ([navn, hex], i) => `<button type="button" class="kunst-farge" data-h="farge" data-v="${i}" data-stille style="--f: ${hex}" aria-pressed="${v.f === i}" aria-label="${navn}"></button>`,
    ).join("");
    return `<fieldset class="kunst-verktoy"${last ? " disabled" : ""} style="--kunst-farge: ${v.f < 0 ? PAPIR : FARGER[v.f][1]}">
      <legend class="vh">Tegneverktøy</legend>
      <div class="kunst-palett">${farger}<button type="button" class="kunst-visk" data-h="visk" data-stille aria-pressed="${v.f < 0}" aria-label="Viskelær">${IKON.visk}</button></div>
      <div class="kunst-rad">
        <button type="button" class="kunst-str" data-h="storrelse" data-v="0" data-stille aria-pressed="${v.s === 0}" aria-label="Tynn strek"><i></i></button>
        <button type="button" class="kunst-str tykk" data-h="storrelse" data-v="1" data-stille aria-pressed="${v.s === 1}" aria-label="Tykk strek"><i></i></button>
        <span class="kunst-luft"></span>
        <button type="button" class="kunst-handling" data-h="angre" aria-label="Angre"${sp.strek.length ? "" : " disabled"}>${IKON.angre}<span>Angre</span></button>
        <button type="button" class="kunst-handling" data-h="gjenta" aria-label="Gjør om"${sp.angret.length ? "" : " disabled"}>${IKON.gjenta}</button>
        <button type="button" class="kunst-handling" data-h="tom" aria-label="Tøm arket"${harTegnet(sp.strek) ? "" : " disabled"}>${IKON.tom}<span>Tøm</span></button>
      </div>
    </fieldset>`;
  }

  // Progress dots in the colour of the player who has (or had) each step.
  const kjedePrikker = (sp) =>
    `<div class="fremdrift" aria-hidden="true">${sp.rekke
      .map((i, k) => `<span class="prikk ${k === sp.na ? "na" : k < sp.na ? "ferdig" : ""}" style="--pf: var(--p${(i % 20) + 1})"></span>`)
      .join("")}</div>`;

  // One link of the chain in the gallery: k = -1 is the starting word, then step k.
  function leddHtml(sp, k, ny) {
    const klasse = ny ? " ny" : "";
    if (k < 0) {
      return `<li class="kunst-ledd start${klasse}"><p class="etikett">Startordet</p><p class="kunst-ordet">${esc(ordTekst(sp.ord))}</p><p class="kort-pille">${ordPille(sp.ord)}</p></li>`;
    }
    const st = sp.steg[k];
    const navn = R.navn(st.i);
    const hvem = `<p class="kunst-hvem-liten">${R.avatar(st.i)}<span><b>${esc(navn)}</b> ${hTegner(k) ? "tegnet" : "gjettet"}</span></p>`;
    if (hTegner(k)) {
      return `<li class="kunst-ledd tegning${klasse}">${hvem}<button type="button" class="kunst-spillknapp" data-h="spill-av" data-v="h${k}" aria-label="Spill av tegningen til ${esc(navn)}">${visArk("h" + k, `Tegningen til ${navn}`)}<span class="kunst-spill-ikon">${IKON.spill}</span></button></li>`;
    }
    const treff = likOrd(st.g, hMotiv(sp, k - 1));
    return `<li class="kunst-ledd gjett${klasse}">${hvem}<p class="kunst-boble${treff ? " treff" : ""}">«${esc(st.g)}»${
      treff ? '<span class="kunst-blink" aria-hidden="true">🎯</span><span class="vh"> – traff blink</span>' : ""
    }</p></li>`;
  }

  // The gallery's dock: one link at a time, then on to the finale.
  const galleriDokk = (sp) => {
    const igjen = sp.rekke.length + 1 - Math.min(sp.vist, sp.rekke.length + 1);
    return R.ui.dokk(igjen ? R.ui.knapp(`Vis neste · ${igjen} igjen`, "vis-neste", { ikon: "👀" }) : R.ui.knapp("Til kåringen", "hkaring", { ikon: "🏆" }));
  };

  const lagNavn = (l) => "Lag " + R.LAG[l % R.LAG.length].navn;
  const turTittel = (S) => `Tegning ${S.spill.tur + 1}/${S.spill.rekke.length}`;
  const stegTittel = (S) => `Steg ${Math.min(S.spill.na + 1, S.spill.rekke.length)}/${S.spill.rekke.length}`;

  function estimat(S) {
    const o = S.oppsett;
    if (o.modus === "tegn") {
      const lag = lagLov(S.antall, o.lag) ? o.lag : 0;
      const turer = tegneRekke(S.antall, lag, o.runder).length;
      return `${R.flertall(turer, "tegning", "tegninger")} · ca. ${Math.max(2, Math.round((turer * (o.tid + 30)) / 60))} min`;
    }
    const steg = kjedeRekke(S.antall, 0, o.lengde).length;
    return `${R.flertall(steg / 2, "tegning", "tegninger")} og ${R.flertall(steg / 2, "gjetning", "gjetninger")} · ca. ${Math.max(3, Math.round(((steg / 2) * ((o.htid || 70) + 15) + (steg / 2) * 25) / 60 + 2))} min`;
  }

  function oppsettHtml(S) {
    const o = S.oppsett;
    const tegn = o.modus === "tegn";
    const antall = S.antall;
    const valgte = new Set(o.kategorier);
    const ordAntall = ALLE.filter((w) => valgte.has(w.k) && (!o.niva || w.n === o.niva)).length;
    const lag = lagLov(antall, o.lag) ? o.lag : 0;
    const sammendrag = [
      o.kategorier.length === ALLE_KAT.length ? "Alle kategorier" : R.flertall(o.kategorier.length, "kategori", "kategorier"),
      tegn ? `${o.tid} s` : o.htid ? `${o.htid} s` : "Fri tid",
      tegn ? (o.runder === 1 ? "1 runde" : `${o.runder} runder`) : o.lengde === 1 ? "Én runde" : "To runder",
      tegn ? (lag ? `${lag} lag` : "Alle mot alle") : "",
    ].filter(Boolean);
    const lagliste = lag
      ? `<div class="kunst-lagliste">${lagMedlemmer(antall, lag)
          .map((g, l) => `<p>${R.ui.lagmerke(l)}<span>${g.map((i) => esc(R.navn(i))).join(", ")}</span></p>`)
          .join("")}</div><p class="hjelp">Lagene fordeles annenhver etter lista. Laget til tegneren gjetter.</p>`
      : "";
    return `
      <h1 id="skjerm-tittel">Gjør klart</h1>
      ${R.ui.fliser(
        "modus",
        [
          { v: "tegn", tittel: "Tegn og gjett", tekst: "Én tegner, resten gjetter i kor", ikon: "🎨" },
          { v: "hvisk", tittel: "Hviskeleken", tekst: "Tegning blir gjetning blir tegning …", ikon: "🔁" },
        ],
        o.modus,
      )}
      ${R.ui.spillere({
        min: 2,
        max: 20,
        hjelp: tegn
          ? "Alle tegner etter tur, i denne rekkefølgen."
          : antall < 4
            ? "Mobilen går rundt i denne rekkefølgen. Hviskeleken blir morsomst med fire eller flere."
            : "Mobilen går rundt i denne rekkefølgen.",
      })}
      <section class="seksjon">
        <div class="seksjon-hode"><h2>Ordene</h2><span class="tall">${ordAntall} ord</span></div>
        ${R.ui.seg("niva", [["1", "Lett"], ["2", "Middels"], ["3", "Vanskelig"], ["0", "Blandet"]], o.niva, { etikett: "Vanskelighetsgrad" })}
      </section>
      <section class="kunst-mer${o.mer ? " apen" : ""}">
        <button type="button" class="kunst-mer-knapp" data-h="mer" aria-expanded="${o.mer}"><span><b>Flere valg</b><small>${esc(sammendrag.join(" · "))}</small></span><i aria-hidden="true"></i></button>
        ${o.mer ? `<div class="kunst-mer-innhold">
          <section class="seksjon">
            <div class="seksjon-hode"><h3>Kategorier</h3><span class="tall">${o.kategorier.length} av ${ALLE_KAT.length}</span></div>
            ${R.ui.brikker(
              "kategori",
              KATEGORIER.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon })),
              o.kategorier,
              { alle: true, etikett: "Kategorier" },
            )}
          </section>
          ${
            tegn
              ? `<section class="seksjon"><h3>Tid per tegning</h3>${R.ui.seg("tid", [["45", "45 s"], ["60", "60 s"], ["90", "90 s"]], o.tid, { etikett: "Tid per tegning" })}</section>
                 <section class="seksjon"><h3>Runder</h3>${R.ui.seg("runder", [["1", "1 runde"], ["2", "2 runder"], ["3", "3 runder"]], o.runder, { etikett: "Antall runder" })}<p class="hjelp">Alle tegner én gang per runde.</p></section>
                 <section class="seksjon"><h3>Lag</h3>${R.ui.seg("lag", [["0", "Alle mot alle"], ["2", "2 lag"], ["3", "3 lag"], ["4", "4 lag"]], lag, {
                   etikett: "Lag",
                   av: (v) => !lagLov(antall, Number(v)),
                 })}${lagliste}</section>`
              : `<section class="seksjon"><h3>Tid per tegning</h3>${R.ui.seg("htid", [["0", "Fri"], ["45", "45 s"], ["60", "60 s"], ["90", "90 s"]], o.htid, { etikett: "Tid per tegning" })}<p class="hjelp">Klokka starter når tegneren setter første strek.</p></section>
                 <section class="seksjon"><h3>Lengde</h3>${R.ui.seg("lengde", [["1", "Én runde"], ["2", "To runder"]], o.lengde, { etikett: "Lengde" })}<p class="hjelp">Én runde: alle tegner eller gjetter én gang.</p></section>`
          }
        </div>` : ""}
      </section>
      ${R.ui.dokk(
        `<p class="hjelp kunst-estimat">${o.kategorier.length ? esc(estimat(S)) : "Velg minst én kategori under «Flere valg»"}</p>`,
        R.ui.knapp("Start", "start", { av: !o.kategorier.length }),
      )}`;
  }

  const standardOppsett = () => ({ modus: "tegn", niva: 0, kategorier: ALLE_KAT.slice(), tid: 60, runder: 2, lag: 0, htid: 60, lengde: 1, mer: false });

  // A saved game must fit what the screens expect; anything odd starts fresh.
  function gyldigSpill(sp) {
    if (!sp || typeof sp !== "object") return false;
    const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
    const strekliste = (l) => Array.isArray(l) && l.every((t) => typeof t === "string");
    if (!heltall(sp.antall, 2, R.MAKS_SPILLERE)) return false;
    if (!Array.isArray(sp.rekke) || !sp.rekke.length || !sp.rekke.every((i) => heltall(i, 0, sp.antall - 1))) return false;
    if (!sp.ord || typeof sp.ord.o !== "string") return false;
    if (!strekliste(sp.strek) || !strekliste(sp.angret) || !sp.verktoy || !Array.isArray(sp.brukt)) return false;
    if (!heltall(sp.tid, 0, 90) || typeof sp.igjen !== "number") return false;
    if (sp.modus === "tegn") {
      return (
        heltall(sp.tur, 0, sp.rekke.length - 1) &&
        ["ord", "tegn", "ute", "resultat"].includes(sp.fase) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === (sp.lag || sp.antall) &&
        Array.isArray(sp.historikk) &&
        sp.historikk.every((t) => t && t.o && strekliste(t.s)) &&
        (sp.fase !== "resultat" || sp.historikk.length > 0)
      );
    }
    if (sp.modus === "hvisk") {
      return (
        heltall(sp.na, 0, sp.rekke.length) &&
        Array.isArray(sp.steg) &&
        sp.steg.length === sp.na &&
        sp.steg.every((s, k) => s && (hTegner(k) ? strekliste(s.s) : typeof s.g === "string")) &&
        heltall(sp.vist, 1, sp.rekke.length + 1)
      );
    }
    return false;
  }

  const SPILLSKJERMER = { tegn: ["ord", "tegn", "hvem", "resultat"], hvisk: ["hgi", "htegn", "hgjett", "hklar", "galleri", "hkaring"] };

  function fullforStrek() {
    if (brett && brett.na) brett.fullfor();
  }

  function fullforTur(S, ok, gjetter) {
    fullforStrek();
    stoppKlokke(S);
    avsluttTur(S, ok, gjetter);
    if (ok) {
      R.lyd.riktig();
      R.vibrer([30, 40, 70]);
    } else R.lyd.snu(); // a miss or a skip is fine: a soft sound, never a boo
    R.gaTil("resultat");
  }

  // ---------- Screens ----------

  const SKJERMER = {
    hjem: {
      tilbake: "portal",
      vis(S) {
        const sp = S.spill;
        const pagar = iGang(S);
        const status = !pagar
          ? ""
          : sp.modus === "tegn"
            ? `tegning ${sp.tur + 1} av ${sp.rekke.length}`
            : sp.na >= sp.rekke.length
              ? "se kjeden"
              : `steg ${sp.na + 1} av ${sp.rekke.length}`;
        return R.ui.spillhjem({
          slagordHtml: "Tegn med fingeren.<br><em>De andre gjetter i vilt kor.</em>",
          knapperHtml: R.ui.startKnapper({ pagar, fortsettTekst: `Fortsett · ${status}`, ekstraHtml: R.ui.lenke("Slik spiller du", "regler") }),
          merker: [
            ["2–20", "spillere"],
            [String(ALLE.length), "ord å tegne"],
            ["2", "spillmåter"],
          ],
        });
      },
    },

    oppsett: {
      tittel: "Nytt spill",
      tilbake: "hjem",
      vis: oppsettHtml,
    },

    // Tegn og gjett: give the phone to the drawer, who holds the card to see the word.
    ord: {
      tittel: turTittel,
      tilbake: "hjem",
      vis(S) {
        const sp = S.spill;
        return `
          <div class="kunst-gi">
            ${R.avatar(sp.tegner, "stor")}
            <div>
              <p class="etikett">Gi mobilen til</p>
              <h1 id="skjerm-tittel">${esc(R.navn(sp.tegner))}</h1>
              ${sp.lag ? R.ui.lagmerke(lagFor(sp, sp.tegner)) : ""}
            </div>
          </div>
          ${R.ui.mappe({ id: "ord", etikett: "Hemmelig ord", tekst: "Hold fingeren på kortet for å se", etikettAria: "Hold fingeren på kortet for å se det hemmelige ordet" })}
          ${R.ui.dokk(
            R.ui.knapp(sp.sett ? `Start – ${sp.tid} s` : "Se ordet først", "tegn-start", { av: !sp.sett, ikon: sp.sett ? "✏️" : "" }),
            R.ui.lenkerad(R.ui.lenke("Bytt ord", "bytt-ord"), R.ui.lenke("Avslutt", "avslutt")),
          )}`;
      },
      inn(S) {
        S.spill.her = "ord";
      },
    },

    tegn: {
      tittel: turTittel,
      tilbake: "hjem",
      fast: true,
      vis(S) {
        const sp = S.spill;
        const ute = sp.fase === "ute";
        const navn = R.navn(sp.tegner);
        const slor = ute
          ? `<div class="kunst-slor ute"><span class="stempel">Tiden er ute!</span><p>Ropte noen riktig i siste liten?</p></div>`
          : sp.pause
            ? `<div class="kunst-slor"><p class="etikett">Pause</p>${R.ui.knapp("Fortsett", "fortsett-tegning", { ikon: "▶" })}</div>`
            : "";
        return `<div class="kunst-fast">
          <h1 class="vh" id="skjerm-tittel">${esc(navn)} tegner</h1>
          <div class="kunst-topp">
            <button type="button" class="timer kunst-klokke" id="kunst-tid" data-h="pause" aria-label="Pause"${ute || sp.pause ? " disabled" : ""}><span class="timer-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="spor" cx="60" cy="60" r="54"/><circle class="fyll" cx="60" cy="60" r="54"/></svg><span class="timer-tid">${R.formaterTid(sp.igjen)}</span></span><span class="kunst-klokke-merke" aria-hidden="true">${IKON.pause}</span></button>
            <p class="kunst-hvem">${R.avatar(sp.tegner)}<span><small>${sp.lag ? esc(lagNavn(lagFor(sp, sp.tegner))) : "Tegner"}</small><b>${esc(navn)}</b></span></p>
            <button type="button" class="kunst-titt" id="kunst-titt" aria-pressed="false" aria-label="Hold fingeren her for å se ordet">${IKON.oye}<span>Ordet</span></button>
            <p class="kunst-titt-boble" id="kunst-titt-boble" hidden></p>
          </div>
          ${levendeArk(slor)}
          ${verktoyHtml(sp, ute || sp.pause)}
          ${R.ui.dokk(
            `<div class="knapprad kunst-dokkrad${ute ? " lik" : ""}">${
              ute
                ? R.ui.knapp2("Ingen gjettet", "ingen") + R.ui.knapp("Noen gjettet!", "gjettet", { variant: "mynte" })
                : R.ui.knapp2("Hopp over", "ingen") + R.ui.knapp("Gjettet!", "gjettet", { variant: "mynte", ikon: "🎉" })
            }</div>`,
          )}
        </div>`;
      },
      inn(S) {
        const sp = S.spill;
        sp.her = "tegn";
        R.holdVaken();
        if (sp.fase === "tegn") lagKlokke(S, !sp.pause);
      },
      ut(S) {
        const sp = S.spill;
        fullforStrek();
        const t = R.timer("kunst-tid");
        if (sp && t && sp.fase === "tegn" && t.kjorer) sp.pause = true;
        stoppKlokke(S);
      },
    },

    hvem: {
      tittel: "Hvem gjettet?",
      tilbake: "tegn",
      vis(S) {
        const sp = S.spill;
        const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== sp.tegner);
        return `
          <div class="kunst-hvem-topp">
            ${visArk("na", `Tegningen til ${R.navn(sp.tegner)}`, "mini")}
            <div>
              <p class="etikett">Riktig svar!</p>
              <h1 id="skjerm-tittel">Hvem gjettet det?</h1>
            </div>
          </div>
          ${R.ui.velgere("gjetter", andre, null)}
          ${R.ui.dokk(R.ui.lenke("Ups, tilbake til tegningen", "tilbake-tegning"))}`;
      },
      inn(S) {
        S.spill.her = "hvem";
      },
    },

    resultat: {
      tittel: turTittel,
      tilbake: "hjem",
      vis(S) {
        const sp = S.spill;
        const n = sp.historikk.length - 1;
        const tur = sp.historikk[n];
        const siste = sp.tur + 1 >= sp.rekke.length;
        const ord = ordTekst(tur.o);
        let tekst;
        const tid = R.flertall(tur.sek, "sekund", "sekunder");
        if (!tur.ok) tekst = ["Ingen poeng denne gangen.", "Den var visst vrien!", "Noen ord er rett og slett vriene.", "Neste gang sitter den!"][n % 4];
        else if (sp.lag) tekst = `Godt jobba! +1 til ${lagNavn(lagFor(sp, tur.t))} – gjettet på ${tid}.`;
        else tekst = `Godt jobba! +1 til ${R.ramsOpp([R.navn(tur.g), R.navn(tur.t)])} – gjettet på ${tid}.`;
        return `
          <div class="kunst-resultat">
            <div class="kunst-innramming">${visArk("t" + n, `Tegning av ${ord}`)}<span class="stempel ${tur.ok ? "mynte" : ""}">${tur.ok ? "Riktig!" : "Uløst"}</span></div>
            <div class="kunst-resultat-tekst">
              <p class="etikett">Ordet var</p>
              <h1 id="skjerm-tittel" class="kunst-ordet ${R.lengdeKlasse(ord)}">${esc(ord)}</h1>
              <p class="kunst-pluss">${esc(tekst)}</p>
            </div>
          </div>
          ${R.ui.poengliste(rader(sp, tur.pluss))}
          ${R.ui.dokk(
            siste ? R.ui.knapp("Se hvem som vant", "slutt", { ikon: "🏆" }) : R.ui.knapp(`Neste: ${R.navn(sp.rekke[sp.tur + 1])}`, "neste", { ikon: "✏️" }),
            R.ui.lenkerad(R.ui.lenke("Angre", "angre-poeng"), siste ? "" : R.ui.lenke("Avslutt", "avslutt")),
          )}`;
      },
      inn(S) {
        S.spill.her = "resultat";
      },
    },

    slutt: {
      tittel: "Kåringen",
      tilbake: "hjem",
      vis(S) {
        const sp = S.spill;
        const r = rader(sp);
        const topp = Math.max(0, ...r.map((x) => x.poeng));
        const vinnere = topp > 0 ? r.filter((x) => x.poeng === topp) : [];
        const navn = (x) => (x.lag != null ? lagNavn(x.lag) : R.navn(x.i));
        const etikett = !vinnere.length ? "Kunstutstillingen" : vinnere.length > 1 ? "Delt seier" : sp.lag ? "Vinnerlaget" : "Kveldens kunstner";
        const tittel = !vinnere.length ? "Ingen poeng denne gangen" : `${R.ramsOpp(vinnere.map(navn))} vinner!`;
        const fakta = [];
        const ok = sp.historikk.filter((t) => t.ok);
        if (ok.length) {
          const raskest = ok.slice().sort((a, b) => a.sek - b.sek)[0];
          fakta.push(`⚡ Raskest: «${ordTekst(raskest.o)}» ble gjettet på ${R.flertall(raskest.sek, "sekund", "sekunder")}.`);
        }
        const uloste = sp.historikk.filter((t) => !t.ok);
        if (uloste.length) fakta.push(`🕵️ Uløst mysterium: «${ordTekst(uloste[uloste.length - 1].o)}».`);
        if (sp.historikk.length) fakta.push(`🖼️ ${ok.length} av ${R.flertall(sp.historikk.length, "tegning", "tegninger")} ble gjettet.`);
        const galleri = sp.historikk
          .map((t, n) => {
            const ord = ordTekst(t.o);
            return `<li><button type="button" class="kunst-flis" data-h="spill-av" data-v="t${n}" aria-label="Spill av tegningen av ${esc(ord)}">${visArk("t" + n, `Tegning av ${ord}`)}<span class="kunst-flis-tekst"><b>${esc(ord)}</b><small>${esc(R.navn(t.t))} ${t.ok ? "✓" : "✗"}</small></span></button></li>`;
          })
          .join("");
        return `
          <div class="banner aksent">
            ${R.figur()}
            <p class="etikett">${esc(etikett)}</p>
            <h1 id="skjerm-tittel">${esc(tittel)}</h1>
          </div>
          ${vinnere.length ? R.ui.pall(r) : ""}
          ${R.ui.poengliste(r)}
          ${fakta.length ? `<ul class="kunst-fakta">${fakta.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
          ${
            galleri
              ? `<section class="seksjon"><div class="seksjon-hode"><h2>Utstillingen</h2><span class="tall">Trykk for å spille av</span></div><ol class="kunst-galleri">${galleri}</ol></section>`
              : ""
          }
          ${R.ui.flereSpill({ antall: sp.antall })}
          ${R.ui.dokk(
            R.ui.knapp("Spill igjen", "igjen"),
            sp.historikk.length ? R.ui.knapp2("Del utstillingen som bilde", "lag-bilde", { ikon: "📸" }) : "",
            R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'),
          )}`;
      },
      inn(S) {
        const sp = S.spill;
        R.slippVaken();
        if (sp.feiret) return;
        sp.feiret = true;
        if (sp.poeng.some((p) => p > 0)) {
          R.lyd.fanfare();
          R.konfetti();
        }
      },
    },

    // ---------- Hviskeleken ----------

    hgi: {
      tittel: stegTittel,
      tilbake: "hjem",
      vis(S) {
        const sp = S.spill;
        const k = sp.na;
        const i = sp.rekke[k];
        const oppdrag = k === 0 ? "Du skal tegne et hemmelig ord" : hTegner(k) ? "Du skal tegne det forrige svaret" : "Du skal gjette hva tegningen er";
        return `
          ${kjedePrikker(sp)}
          <div class="gi-til">
            ${R.avatar(i, "gigant")}
            <p class="etikett">Gi mobilen til</p>
            <h1 id="skjerm-tittel">${esc(R.navn(i))}</h1>
            <p class="kunst-oppdrag">${hTegner(k) ? "✏️" : "🤔"} ${esc(oppdrag)}</p>
            <p class="ikke-se">🙈 Ikke vis skjermen til de andre</p>
          </div>
          ${R.ui.dokk(R.ui.knapp(`Jeg er ${R.navn(i)}`, "hjeg"), k === 0 ? R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")) : "")}`;
      },
      inn(S) {
        S.spill.her = "hgi";
      },
    },

    // Shows the secret to draw, so a reload (or "Fortsett") goes through the hand-over again.
    htegn: {
      tittel: stegTittel,
      tilbake: "hjem",
      gjenoppta: "hgi",
      fast: true,
      vis(S) {
        const sp = S.spill;
        const motiv = hMotiv(sp, sp.na);
        const urort = sp.tid && sp.igjen >= sp.tid && !sp.ute;
        return `<div class="kunst-fast">
          <div class="kunst-topp">
            ${sp.tid ? R.ui.timer({ id: "kunst-tid", sekunder: Math.ceil(sp.igjen) }) : ""}
            <div class="kunst-oppgave">
              <p class="etikett">${sp.na === 0 ? "Tegn dette ordet" : "Tegn dette"}</p>
              <h1 id="skjerm-tittel" class="${R.lengdeKlasse(motiv)}">${esc(motiv)}</h1>
              ${urort ? `<p class="kunst-tidhint" id="kunst-tidhint">Klokka starter når du tegner</p>` : ""}
            </div>
            ${sp.na === 0 && !sp.strek.length ? `<button type="button" class="kunst-bytt" data-h="hbytt" aria-label="Bytt ord">${IKON.bytt}<span>Bytt</span></button>` : ""}
          </div>
          ${levendeArk(sp.ute ? `<div class="kunst-slor ute"><span class="stempel">Tiden er ute!</span><p>Send tegningen videre.</p></div>` : "")}
          ${verktoyHtml(sp, sp.ute)}
          ${R.ui.dokk(R.ui.knapp(sp.ute ? "Send videre" : "Ferdig – send videre", "hferdig", { ikon: "📨" }))}
        </div>`;
      },
      inn(S) {
        const sp = S.spill;
        sp.her = "htegn";
        R.holdVaken();
        if (sp.tid && !sp.ute) lagKlokke(S, false);
      },
      ut(S) {
        fullforStrek();
        stoppKlokke(S);
      },
    },

    // Shows the drawing only this player may see: resumes through the hand-over too.
    hgjett: {
      tittel: stegTittel,
      tilbake: "hjem",
      gjenoppta: "hgi",
      vis(S) {
        const sp = S.spill;
        const k = sp.na;
        return `
          <div class="kunst-gjett-topp">
            <p class="etikett">${esc(R.navn(sp.rekke[k]))} gjetter</p>
            <h1 id="skjerm-tittel">Hva er dette?</h1>
          </div>
          <div class="kunst-innramming kunst-gjettbilde">
            ${visArk("h" + (k - 1), "Tegningen du skal gjette")}
            <button type="button" class="kunst-spillav" data-h="spill-av" data-v="h${k - 1}">${IKON.spill}<span>Se den bli tegnet</span></button>
          </div>
          <form class="kunst-gjettskjema" data-skjema="gjett" autocomplete="off">
            <label class="vh" for="kunst-gjett">Hva tror du tegningen er?</label>
            <input class="tekstfelt" id="kunst-gjett" data-felt="gjett" maxlength="40" enterkeyhint="send" autocapitalize="sentences" autocomplete="off" spellcheck="false" placeholder="Jeg tror det er …" value="${esc(sp.utkast || "")}">
            ${R.ui.dokk(`<button class="knapp" type="submit" id="kunst-send"${(sp.utkast || "").trim() ? "" : " disabled"}><span class="ikon" aria-hidden="true">📨</span>Send videre</button>`)}
          </form>`;
      },
      inn(S) {
        S.spill.her = "hgjett";
      },
    },

    hklar: {
      tittel: "Kjeden er ferdig",
      tilbake: "hjem",
      vis: () => `
        <div class="banner aksent kunst-klar">
          ${R.figur()}
          <p class="etikett">Alle har tegnet og gjettet</p>
          <h1 id="skjerm-tittel">Samle gjengen!</h1>
          <p class="ingress">Nå får dere se hva ordet ble til på veien rundt bordet.</p>
        </div>
        ${R.ui.dokk(R.ui.knapp("Vis kjeden", "vis-kjede", { ikon: "🎬", variant: "stor" }))}`,
      inn(S) {
        S.spill.her = "hklar";
        R.lyd.pling();
      },
    },

    galleri: {
      tittel: "Kjeden",
      tilbake: "hjem",
      vis(S) {
        const sp = S.spill;
        const vist = Math.min(sp.vist, sp.rekke.length + 1);
        const ledd = [];
        for (let k = -1; k < vist - 1; k++) ledd.push(leddHtml(sp, k, k === vist - 2));
        return `
          <h1 id="skjerm-tittel" class="kunst-galleri-tittel">Hva ble det til?</h1>
          <ol class="kunst-kjede">${ledd.join("")}</ol>
          ${galleriDokk(sp)}`;
      },
      inn(S) {
        S.spill.her = "galleri";
      },
    },

    // The end of a chain: its own moment, centred on the screen.
    hkaring: {
      tittel: "Kåringen",
      tilbake: "hjem",
      vis(S) {
        const sp = S.spill;
        const L = sp.rekke.length;
        const sist = sp.steg[L - 1].g;
        const treff = likOrd(sist, sp.ord.o);
        const gjetninger = L / 2;
        let traff = 0;
        for (let k = 1; k < L; k += 2) if (likOrd(sp.steg[k].g, hMotiv(sp, k - 1))) traff += 1;
        const dom = !traff
          ? "Ingen gjetninger traff blink. Herlig kaos!"
          : traff === gjetninger
            ? "Alle gjetningene traff blink. Er dere tankelesere?"
            : `${traff} av ${R.flertall(gjetninger, "gjetning", "gjetninger")} traff blink.`;
        return `
          <div class="kunst-finale">
            <p class="etikett">Kjeden er ferdig</p>
            <span class="stempel ${treff ? "mynte" : ""}">${treff ? "Hele veien!" : "På jordet!"}</span>
            <div class="kunst-finale-par">
              <p class="kunst-finale-kort"><small>Startordet</small><b>${esc(ordTekst(sp.ord))}</b></p>
              <span class="kunst-finale-pil" aria-hidden="true">↓</span>
              <p class="kunst-finale-kort sist"><small>Ble til slutt</small><b>«${esc(sist)}»</b></p>
            </div>
            <h1 id="skjerm-tittel" class="vh">Fra «${esc(ordTekst(sp.ord))}» til «${esc(sist)}»</h1>
            <p class="kunst-dom">${esc(dom)}</p>
          </div>
          <div class="stabel">
            ${R.ui.knapp2("Se kjeden på nytt", "se-igjen", { ikon: "🎬" })}
            ${R.ui.knapp2("Del kjeden som bilde", "lag-bilde", { ikon: "📸" })}
          </div>
          ${R.ui.flereSpill({ antall: sp.antall })}
          ${R.ui.dokk(R.ui.knapp("Spill igjen", "hny", { ikon: "🔁" }), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
      },
      inn(S) {
        const sp = S.spill;
        sp.her = "hkaring";
        sp.ferdig = true;
        R.slippVaken();
        if (sp.feiret) return;
        sp.feiret = true;
        // In proportion: the word made it all the way → fanfare; otherwise the laugh it deserves.
        if (likOrd(sp.steg[sp.rekke.length - 1].g, sp.ord.o)) {
          R.lyd.fanfare();
          R.konfetti();
        } else R.lyd.latter();
      },
    },
  };

  // Every screen binds its canvases after a render and lets go of them when it is left.
  for (const sk of Object.values(SKJERMER)) {
    const egenEtter = sk.etter;
    const egenUt = sk.ut;
    sk.etter = (S, rot) => {
      fastSide(sk.fast);
      bindLerreter(S, rot);
      if (egenEtter) egenEtter(S, rot);
    };
    sk.ut = (S) => {
      if (egenUt) egenUt(S);
      ryddLerreter();
      brett = null;
      fastSide(false);
    };
  }

  let opptatt = false; // a countdown is running
  let sisteAvsloring = -1e9; // when the gallery last revealed a link

  R.start({
    id: "kunstneren",
    versjon: 1,

    tilstand: () => ({ antall: 4, oppsett: standardOppsett(), spill: null }),

    pagar: iGang,

    lastet(S) {
      S.oppsett = Object.assign(standardOppsett(), S.oppsett || {});
      const o = S.oppsett;
      if (!["tegn", "hvisk"].includes(o.modus)) o.modus = "tegn";
      if (![0, 1, 2, 3].includes(o.niva)) o.niva = 0;
      o.kategorier = ALLE_KAT.filter((id) => (Array.isArray(o.kategorier) ? o.kategorier : ALLE_KAT).includes(id));
      if (![45, 60, 90].includes(o.tid)) o.tid = 60;
      if (![1, 2, 3].includes(o.runder)) o.runder = 2;
      if (![0, 2, 3, 4].includes(o.lag)) o.lag = 0;
      if (![0, 45, 60, 90].includes(o.htid)) o.htid = 60;
      if (![1, 2].includes(o.lengde)) o.lengde = 1;
      o.mer = !!o.mer;
      S.antall = R.klamp(Number(S.antall) || 4, 2, R.MAKS_SPILLERE);
      if (!gyldigSpill(S.spill)) S.spill = null;
      // Back after a reload in the middle of a drawing: the clock waits until they are ready.
      else if (S.spill.modus === "tegn" && S.spill.fase === "tegn") S.spill.pause = true;
    },

    regler: {
      intro: "Ett spill, to måter: tegn og gjett i kor – eller send tegningene rundt bordet i Hviskeleken.",
      steg: [
        ["Se ordet i smug", "Tegneren holder fingeren på kortet og ser det hemmelige ordet. De andre ser bort."],
        ["Tegn mot klokka", "Tegn før tiden renner ut. Ingen bokstaver, tall eller lyder – bare streker!"],
        ["Rop ut svaret", "Den som gjetter riktig først, får 1 poeng – og tegneren får 1. Trykk «Gjettet!»"],
      ],
      tips: [
        "Start med store, enkle former. Detaljer kan komme etterpå.",
        "«Angre» tar bort én strek om gangen – og selv «Tøm» kan angres.",
        "Glemt ordet midt i tegningen? Snu mobilen og hold fingeren på øyet øverst.",
      ],
      ekstraHtml: `<h3>Hviskeleken</h3>
        <ol class="steg">
          <li><b>Tegn ordet</b><span>Den første får et hemmelig ord og tegner det.</span></li>
          <li><b>Gjett tegningen</b><span>Neste ser bare tegningen og skriver hva den forestiller.</span></li>
          <li><b>Tegn svaret</b><span>Neste ser bare svaret og tegner det – og slik går mobilen rundt.</span></li>
        </ol>
        <p class="ingress">Til slutt spilles hele kjeden av, strek for strek. Hvor langt fra startordet havnet dere?</p>`,
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp || !sp.ord) return { html: "" };
        const t = ordTekst(sp.ord);
        return {
          klasse: "aksent",
          html: `<span class="kort-etikett">Tegn dette</span><span class="kort-ord ${R.lengdeKlasse(t)}">${esc(t)}</span><span class="kort-pille">${ordPille(sp.ord)}</span><span class="kort-fot">Ingen bokstaver, tall eller lyder!</span>`,
        };
      },
      sett(S) {
        if (S.spill && !S.spill.sett) {
          S.spill.sett = true;
          R.vis();
          R.lyd.pop();
        }
      },
    },

    vedSpillere(S) {
      if (!lagLov(S.antall, S.oppsett.lag)) S.oppsett.lag = 0;
    },

    felt: {
      gjett(S, el) {
        if (!S.spill) return;
        S.spill.utkast = el.value.slice(0, 40);
        const knapp = R.$("#kunst-send");
        if (knapp) knapp.disabled = !el.value.trim();
        R.lagre();
      },
    },

    skjema: {
      gjett(S, form) {
        const sp = S.spill;
        if (!sp || sp.modus !== "hvisk" || hTegner(sp.na)) return;
        const felt = form.querySelector("#kunst-gjett");
        const tekst = String(felt ? felt.value : "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40);
        if (!tekst) {
          if (felt) felt.focus();
          R.toast("Skriv hva du tror tegningen er");
          return;
        }
        if (felt) felt.blur();
        sp.steg[sp.na] = { i: sp.rekke[sp.na], g: tekst };
        sp.na += 1;
        nyttHSteg(S);
        R.lyd.pop();
        R.gaTil(sp.na >= sp.rekke.length ? "hklar" : "hgi");
      },
    },

    skjermer: SKJERMER,

    handlinger: (H = {
      async nytt(el, e, S) {
        const pagar = iGang(S);
        if (pagar) {
          const fortsatt = R.vakt();
          if (!(await R.bekreftNytt(pagar)) || !fortsatt()) return;
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp) return R.gaTil("hjem");
        R.holdVaken();
        const lov = SPILLSKJERMER[sp.modus] || [];
        let mal = lov.includes(sp.her) ? sp.her : lov[0];
        if (mal === "htegn" || mal === "hgjett") mal = "hgi"; // secrets only after "Jeg er …"
        R.gaTil(mal);
      },

      // --- Setup ---
      mer(el, e, S) {
        S.oppsett.mer = !S.oppsett.mer;
        R.vis();
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "hvisk" ? "hvisk" : "tegn";
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = Number(el.dataset.v) || 0;
        R.vis();
      },
      kategori(el, e, S) {
        const o = S.oppsett;
        const v = el.dataset.v;
        if (v === "*") o.kategorier = o.kategorier.length === ALLE_KAT.length ? [] : ALLE_KAT.slice();
        else o.kategorier = o.kategorier.includes(v) ? o.kategorier.filter((x) => x !== v) : [...o.kategorier, v];
        o.kategorier = ALLE_KAT.filter((id) => o.kategorier.includes(id));
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v) || 60;
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v) || 2;
        R.vis();
      },
      lag(el, e, S) {
        const lag = Number(el.dataset.v) || 0;
        if (lagLov(S.antall, lag)) S.oppsett.lag = lag;
        R.vis();
      },
      htid(el, e, S) {
        S.oppsett.htid = Number(el.dataset.v) || 0;
        R.vis();
      },
      lengde(el, e, S) {
        S.oppsett.lengde = Number(el.dataset.v) === 2 ? 2 : 1;
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.kategorier.length) return;
        R.holdVaken();
        if (S.oppsett.modus === "hvisk") {
          startHvisk(S, 0);
          R.gaTil("hgi");
        } else {
          startTegn(S);
          R.gaTil("ord");
        }
      },
      // «Avslutt»: with drawings played it ends in Kåringen, otherwise back to the start screen.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return R.gaTil("hjem");
        const fortsatt = R.vakt();
        const kare = sp.modus === "tegn" && sp.historikk.length > 0;
        const ok = kare
          ? await R.bekreft("Avslutte nå?", "Dere går rett til kåringen, og resten av tegningene hoppes over.", "Avslutt", "Fortsett")
          : await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Fortsett");
        if (!ok || !fortsatt()) return;
        if (kare) {
          sp.ferdig = true;
          return R.gaTil("slutt");
        }
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },

      // --- Tegn og gjett ---
      "bytt-ord"(el, e, S) {
        const sp = S.spill;
        sp.ord = trekkOrd(S, sp.ord.o);
        sp.sett = false;
        sp.byttet += 1;
        R.vis();
        R.lyd.sveip();
        R.toast("Nytt ord! Hold fingeren på kortet for å se det.");
      },
      async "tegn-start"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.sett || opptatt) return;
        opptatt = true;
        const fortsatt = R.vakt();
        let ferdigTalt = false;
        try {
          ferdigTalt = await R.nedtelling(["3", "2", "1", "TEGN!"], 700);
        } finally {
          opptatt = false;
        }
        if (!ferdigTalt || !fortsatt() || S.spill !== sp) return;
        Object.assign(sp, { fase: "tegn", pause: false, igjen: sp.tid });
        R.gaTil("tegn");
      },
      pause(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "tegn") return;
        fullforStrek();
        const t = R.timer("kunst-tid");
        if (t) {
          t.pause();
          sp.igjen = t.igjen;
        }
        sp.pause = true;
        R.vis();
      },
      "fortsett-tegning"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "tegn") return;
        sp.pause = false;
        R.vis();
        const t = R.timer("kunst-tid");
        if (t) t.start();
        else lagKlokke(S, true);
      },
      gjettet(el, e, S) {
        const sp = S.spill;
        if (!sp || !["tegn", "ute"].includes(sp.fase)) return;
        if (sp.lag) return fullforTur(S, true, null);
        const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== sp.tegner);
        if (andre.length === 1) return fullforTur(S, true, andre[0]);
        R.gaTil("hvem");
      },
      gjetter(el, e, S) {
        const i = Number(el.dataset.v);
        if (!S.spill || !Number.isInteger(i) || i === S.spill.tegner) return;
        fullforTur(S, true, i);
      },
      "tilbake-tegning": () => R.gaTil("tegn"),
      // Takes back the last scoring decision (wrong name, mis-tap) until the next action.
      "angre-poeng"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.modus !== "tegn" || sp.fase !== "resultat" || !sp.historikk.length) return;
        const tur = sp.historikk.pop();
        for (const [k, v] of Object.entries(tur.pluss || {})) sp.poeng[k] -= v;
        const a = tur.angre || { skjerm: "tegn", fase: "ute", igjen: 0 };
        Object.assign(sp, { tegner: tur.t, ord: tur.o, strek: tur.s, angret: [], fase: a.fase, igjen: a.igjen, pause: a.fase === "tegn" });
        R.toast(tur.ok ? "Angret – poengene er tatt tilbake" : "Angret");
        R.gaTil(a.skjerm);
      },
      async ingen(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        if (sp.fase === "tegn") {
          const t = R.timer("kunst-tid");
          const gikk = !!(t && t.kjorer);
          if (gikk) t.pause();
          const fortsatt = R.vakt();
          const ok = await R.bekreft("Hoppe over dette ordet?", "Helt greit! Ingen får poeng, og ordet blir vist.", "Hopp over", "Tegn videre");
          if (!fortsatt()) return;
          if (!ok) {
            if (gikk && R.timer("kunst-tid") === t) t.start();
            return;
          }
        }
        if (!["tegn", "ute"].includes(sp.fase)) return;
        fullforTur(S, false, null);
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "resultat") return;
        if (sp.tur + 1 >= sp.rekke.length) return H.slutt(el, e, S);
        sp.tur += 1;
        nyTur(S);
        R.gaTil("ord");
      },
      slutt(el, e, S) {
        if (!S.spill) return R.gaTil("hjem");
        S.spill.ferdig = true;
        R.gaTil("slutt");
      },
      // «Spill igjen» on the Tegn og gjett end screen: same setup, same mode.
      igjen(el, e, S) {
        S.oppsett.modus = "tegn";
        H.start(el, e, S);
      },

      // --- Drawing tools ---
      farge(el, e, S) {
        if (!S.spill || !S.spill.verktoy) return;
        S.spill.verktoy.f = R.klamp(Number(el.dataset.v) || 0, 0, FARGER.length - 1);
        oppdaterVerktoy(S);
        R.lagre();
      },
      visk(el, e, S) {
        if (!S.spill || !S.spill.verktoy) return;
        S.spill.verktoy.f = -1;
        oppdaterVerktoy(S);
        R.lagre();
      },
      storrelse(el, e, S) {
        if (!S.spill || !S.spill.verktoy) return;
        S.spill.verktoy.s = Number(el.dataset.v) === 1 ? 1 : 0;
        oppdaterVerktoy(S);
        R.lagre();
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || !brett || !kanTegne(S)) return;
        fullforStrek();
        if (!sp.strek.length) return;
        sp.angret.push(sp.strek.pop());
        brett.tegnAlt();
        oppdaterVerktoy(S);
        R.lagre();
        R.vibrer(8);
      },
      gjenta(el, e, S) {
        const sp = S.spill;
        if (!sp || !brett || !kanTegne(S) || !sp.angret.length) return;
        sp.strek.push(sp.angret.pop());
        brett.tegnAlt();
        oppdaterVerktoy(S);
        R.lagre();
        R.vibrer(8);
      },
      tom(el, e, S) {
        const sp = S.spill;
        if (!sp || !brett || !kanTegne(S)) return;
        fullforStrek();
        if (!harTegnet(sp.strek)) return;
        sp.strek.push(TOM);
        sp.angret = [];
        brett.tegnAlt();
        oppdaterVerktoy(S);
        R.lagre();
        R.lyd.sveip();
        R.toast("Tømt! «Angre» henter tegningen tilbake.");
      },
      async "lag-bilde"(el, e, S) {
        if (!S.spill || opptatt) return;
        opptatt = true;
        const fortsatt = R.vakt();
        try {
          const bilde = await lagDelbilde(S);
          if (!fortsatt()) return;
          R.ark(`
            <h2 id="ark-tittel">${S.spill.modus === "hvisk" ? "Kjeden som bilde" : "Utstillingen som bilde"}</h2>
            <img class="kunst-delbilde" src="${bilde.url}" alt="${S.spill.modus === "hvisk" ? "Hele kjeden med tegninger og gjetninger" : "Alle tegningene fra spillet"}">
            <div class="${kanDeleFil() ? "knapprad" : "stabel"}">
              ${R.ui.knapp2("Last ned", "last-ned", { ikon: "⬇️" })}
              ${kanDeleFil() ? R.ui.knapp("Del", "del-bilde", { ikon: "📤" }) : ""}
            </div>
            <p class="hjelp">Bildet lages her på mobilen og sendes ingen steder før du deler det selv.</p>
            <button class="lenke" data-h="lukk-ark">Lukk</button>`);
        } catch (feil) {
          R.toast("Klarte ikke å lage bildet");
        } finally {
          opptatt = false;
        }
      },
      "last-ned"() {
        if (!delbilde) return;
        const a = document.createElement("a");
        a.href = delbilde.url;
        a.download = delbilde.navn;
        document.body.appendChild(a);
        a.click();
        a.remove();
        R.toast("Bildet er lastet ned");
      },
      async "del-bilde"() {
        if (!kanDeleFil()) return H["last-ned"]();
        const fortsatt = R.vakt();
        try {
          await navigator.share({ files: [delbilde.fil], title: "Kunstneren", text: "Se hva tegningene våre ble til! 🎨" });
        } catch (feil) {
          if (fortsatt() && (!feil || feil.name !== "AbortError")) H["last-ned"]();
        }
      },
      "spill-av"(el) {
        const v = visninger.get(el.dataset.v);
        if (v) v.spillAv();
      },

      // --- Hviskeleken ---
      hjeg(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.na >= sp.rekke.length) return;
        R.gaTil(hTegner(sp.na) ? "htegn" : "hgjett");
      },
      hbytt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.na !== 0 || sp.strek.length) return;
        sp.ord = trekkOrd(S, sp.ord.o);
        R.vis();
        R.lyd.sveip();
      },
      async hferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || !hTegner(sp.na)) return;
        fullforStrek();
        const fortsatt = R.vakt();
        if (!harTegnet(sp.strek) && !(await R.bekreft("Sende et tomt ark?", "Den neste må gjette hva ingenting er …", "Send tomt", "Tegn litt"))) return;
        if (!fortsatt() || S.spill !== sp) return;
        stoppKlokke(S);
        sp.steg[sp.na] = { i: sp.rekke[sp.na], s: sp.strek };
        sp.na += 1;
        nyttHSteg(S);
        R.lyd.sveip();
        R.gaTil(sp.na >= sp.rekke.length ? "hklar" : "hgi");
      },
      "vis-kjede"(el, e, S) {
        S.spill.vist = 1;
        R.gaTil("galleri");
      },
      // Reveals the next link. Only the new link is added to the page: the drawings already shown
      // keep their canvases (a full redraw per tap used hundreds of canvases in a long chain).
      "vis-neste"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.vist > sp.rekke.length) return;
        sp.vist += 1;
        const k = sp.vist - 2;
        if (hTegner(k)) R.lyd.sveip();
        else R.lyd.pop();
        const liste = R.$("#skjerm .kunst-kjede");
        const dokk = R.$("#skjerm .dokk");
        if (!liste || !dokk) {
          if (hTegner(k)) spillAvNeste = "h" + k;
          return R.vis();
        }
        R.$$(".kunst-ledd.ny", liste).forEach((li) => li.classList.remove("ny"));
        liste.insertAdjacentHTML("beforeend", leddHtml(sp, k, true));
        const ny = liste.lastElementChild;
        const ark = R.$(".kunst-ark[data-ark]", ny);
        if (ark) {
          const v = new Visning(ark, strekFor(S, ark.dataset.ark), true);
          visninger.set(ark.dataset.ark, v);
          aktive.push(v);
        }
        dokk.outerHTML = galleriDokk(sp);
        const knapp = R.$("#skjerm .dokk .knapp");
        if (knapp) knapp.focus({ preventScroll: true });
        R.lagre();
        sisteAvsloring = performance.now();
        ny.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "center" });
      },
      // The button that replaced «Vis neste» must not be hit by the same double tap.
      hkaring() {
        if (performance.now() - sisteAvsloring < 700) return;
        R.gaTil("hkaring");
      },
      "se-igjen"(el, e, S) {
        S.spill.vist = 1;
        if (S.skjerm !== "galleri") return R.gaTil("galleri");
        R.vis();
        window.scrollTo({ top: 0, behavior: R.rolig() ? "auto" : "smooth" });
      },
      hny(el, e, S) {
        const forrige = S.spill;
        if (forrige && forrige.antall !== S.antall) startHvisk(S, 0);
        else startHvisk(S, forrige ? forrige.start + 1 : 0);
        R.holdVaken();
        R.gaTil("hgi");
      },
    }),
  });
})();
