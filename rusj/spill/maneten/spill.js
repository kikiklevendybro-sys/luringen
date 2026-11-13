/* Maneten — a one-tap game. Hold a finger down (anywhere on the board, or on the big pad under it)
   and the jellyfish swims up; let go and it sinks. It drifts right through an underwater cave:
   dodge the walls, the rocks and the sea urchins, collect pearls, and see how far you get.

   ---------- The sea (Dyp, pure, unit-tested in test/maneten.test.mjs) ----------
   Fixed steps of 1/120 s, so the game is the same at any frame rate (the screen interpolates).
   Holding accelerates upwards, letting go lets gravity pull; both speeds are capped. The cave is
   generated ahead from a seed kept in the state (mulberry32), in one fixed order, so a saved game
   and a test replay meet the same cave:
     - the walls: a point every 60 units; the middle wanders a little (more as you get further),
       the gap shrinks from 330 to 175 of the 440 units of height;
     - an obstacle every 360 units at first, every 190 at the end (plus a random bit): a rock from
       the floor or the ceiling, or (from 72 m) a sea urchin; from 120 m some urchins bob up and
       down. Every obstacle leaves a passage of at least 165 units at first, 112 at the end; a bobbing
       urchin always leaves it above itself;
     - the speed grows from 120 to 200 units a second (25 units are one metre).
   Fair by construction, and tested: a simple autopilot in the unit tests swims 1 000 m through
   the caves of many seeds. The hit circle is the bell only, a little smaller than drawn; the
   tentacles never count. */
(function () {
  "use strict";

  const Rt = { t: (s) => (window.Rusj && window.Rusj.t ? window.Rusj.t(s) : s) };

  const Dyp = (() => {
    const H = 440;
    const SEG = 60;
    const R = 11;
    const HZ = 120;
    const DT = 1 / HZ;
    const GRAV = 1150;
    const LOFT = 2500;
    const VOPP = 390;
    const VNED = 430;
    const V0 = 120;
    const VMAKS = 200;
    const AKS = 0.007;
    const GAP0 = 330;
    const GAPMIN = 175;
    const PASS0 = 165;
    const PASSMIN = 112;
    const AVST0 = 360;
    const AVSTMIN = 190;
    const FORSTE = 420;
    const MARG = 24;
    const PER_METER = 25;
    const FORAN = 900;
    const BAK = 260;
    const PERLE = 7;
    const TAU = Math.PI * 2;

    const fart = (d) => Math.min(VMAKS, V0 + Math.max(0, d) * AKS);
    const gap = (d) => Math.max(GAPMIN, GAP0 - Math.max(0, d) * 0.012);
    const pass = (d) => Math.max(PASSMIN, PASS0 - Math.max(0, d) * 0.005);
    const avstand = (d) => Math.max(AVSTMIN, AVST0 - Math.max(0, d) * 0.012);
    const meter = (d) => Math.floor(Math.max(0, d) / PER_METER);

    function tilf(st) {
      const a = (st.fro + 0x6d2b79f5) | 0;
      st.fro = a >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // The walls at x: the ceiling c and the floor f (straight lines between the points).
    function vegg(st, x) {
      const p = st.punkter;
      if (!p.length) return { c: 0, f: H };
      if (x <= p[0].x) return { c: p[0].c, f: p[0].f };
      for (let i = 1; i < p.length; i++)
        if (x <= p[i].x) {
          const a = p[i - 1];
          const b = p[i];
          const t = (x - a.x) / (b.x - a.x);
          return { c: a.c + (b.c - a.c) * t, f: a.f + (b.f - a.f) * t };
        }
      const s = p[p.length - 1];
      return { c: s.c, f: s.f };
    }

    function nyttPunkt(st) {
      const x = st.genX + SEG;
      const inn = Math.min(1, Math.max(0, x) / FORSTE); // calm water at the start
      const g = gap(x);
      const vandre = Math.min(45, 18 + Math.max(0, x) * 0.003) * inn;
      let m = st.genMidt + (tilf(st) * 2 - 1) * vandre;
      m = Math.min(H - MARG - g / 2, Math.max(MARG + g / 2, m));
      const ru = 10 * inn;
      st.punkter.push({ x, c: m - g / 2 - tilf(st) * ru, f: m + g / 2 + tilf(st) * ru });
      st.genX = x;
      st.genMidt = m;
    }

    // Where a bobbing urchin is when the jellyfish has come d units.
    const bolleY = (h, d) => (h.a ? h.y0 + h.a * Math.sin(d * 0.011 + h.fase) : h.y0);

    function nyttHinder(st) {
      const x = st.nesteHinder;
      const { c, f } = vegg(st, x);
      const p = pass(x);
      let h;
      if (x < 1800 || tilf(st) < 0.55) {
        const b = 26 + tilf(st) * 14;
        const ekstra = tilf(st) * 24;
        // From the floor (side "ned": the passage is above it) or from the ceiling.
        if (tilf(st) < 0.5) h = { t: "stein", side: "ned", x, b, spiss: c + p + ekstra };
        else h = { t: "stein", side: "opp", x, b, spiss: f - p - ekstra };
        h.fot = [vegg(st, x - b), vegg(st, x + b)].map((v) => (h.side === "ned" ? v.f + 8 : v.c - 8));
      } else {
        const r = 15 + tilf(st) * 5;
        if (x > 3000 && tilf(st) < 0.4) {
          const topp = c + p + r;
          const bunn = f - r - 8;
          h = { t: "bolle", side: "opp", x, r, y0: (topp + bunn) / 2, a: Math.max(0, (bunn - topp) / 2), fase: tilf(st) * TAU };
        } else if (tilf(st) < 0.5) h = { t: "bolle", side: "opp", x, r, y0: c + p + r + tilf(st) * 12, a: 0, fase: 0 };
        else h = { t: "bolle", side: "ned", x, r, y0: f - p - r - tilf(st) * 12, a: 0, fase: 0 };
      }
      h.id = st.nesteId++;
      st.hindre.push(h);
      // A pearl in the middle of the passage, now and then
      if (tilf(st) < 0.55) {
        let y;
        if (h.t === "stein") y = h.side === "ned" ? (c + h.spiss) / 2 : (h.spiss + f) / 2;
        else y = h.side === "opp" ? c + p / 2 : f - p / 2;
        st.perleliste.push({ id: st.nesteId++, x, y, tatt: false });
      }
      st.nesteHinder = x + avstand(x) + tilf(st) * 70;
    }

    // The cave ahead is made, the cave far behind forgotten (the saved game stays small).
    function generer(st) {
      while (st.genX < st.d + FORAN) nyttPunkt(st);
      while (st.nesteHinder < st.genX - SEG) nyttHinder(st);
      const grense = st.d - BAK;
      while (st.punkter.length > 2 && st.punkter[1].x < grense) st.punkter.shift();
      st.hindre = st.hindre.filter((h) => h.x + 60 > grense);
      st.perleliste = st.perleliste.filter((p) => p.x + 20 > grense);
    }

    function nytt(fro) {
      const st = { fro: fro >>> 0, d: 0, pd: 0, y: H / 2, py: H / 2, vy: 0, n: 0, over: false, krasj: null, perler: 0, punkter: [], hindre: [], perleliste: [], genX: -SEG * 6, genMidt: H / 2, nesteHinder: FORSTE, nesteId: 1 };
      generer(st);
      return st;
    }

    // ---------- Collisions ----------

    function iTrekant(px, py, a, b, c) {
      const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
      const p = [px, py];
      const d1 = s(p, a, b);
      const d2 = s(p, b, c);
      const d3 = s(p, c, a);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    }
    function avstSeg(px, py, a, b) {
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)));
      return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t);
    }
    const steinHjorner = (h) => [[h.x - h.b, h.fot[0]], [h.x + h.b, h.fot[1]], [h.x, h.spiss]];

    // What the jellyfish at (x, y) hits, or null.
    function treff(st, x, y) {
      for (const k of [-0.9, -0.5, 0, 0.5, 0.9]) {
        const v = vegg(st, x + k * R);
        const rr = R * Math.sqrt(1 - k * k);
        if (y - rr < v.c || y + rr > v.f) return "vegg";
      }
      for (const h of st.hindre) {
        if (Math.abs(h.x - x) > 70) continue;
        if (h.t === "stein") {
          const [a, b, c] = steinHjorner(h);
          if (iTrekant(x, y, a, b, c) || avstSeg(x, y, a, b) < R || avstSeg(x, y, b, c) < R || avstSeg(x, y, c, a) < R) return "stein";
        } else if (Math.hypot(h.x - x, bolleY(h, st.d) - y) < h.r + R - 3) return "bolle";
      }
      return null;
    }

    // One step of 1/120 s. holder: the finger (or the key) is down.
    function steg(st, holder) {
      const ut = [];
      if (st.over) return ut;
      st.n++;
      st.py = st.y;
      st.pd = st.d;
      st.vy = Math.max(-VOPP, Math.min(VNED, st.vy + (holder ? GRAV - LOFT : GRAV) * DT));
      st.y += st.vy * DT;
      st.d += fart(st.d) * DT;
      const m = meter(st.d);
      if (m > meter(st.pd) && m % 100 === 0) ut.push({ type: "milepel", m });
      generer(st);
      const hva = treff(st, st.d, st.y);
      if (hva) {
        st.over = true;
        st.krasj = hva;
        ut.push({ type: "krasj", hva });
        return ut;
      }
      for (const p of st.perleliste)
        if (!p.tatt && Math.abs(p.x - st.d) < 30 && Math.hypot(p.x - st.d, p.y - st.y) < R + PERLE + 5) {
          p.tatt = true;
          st.perler++;
          ut.push({ type: "perle", x: p.x, y: p.y });
        }
      return ut;
    }

    function stegFor(k, ms) {
      k.akk = (k.akk || 0) + (Math.min(Math.max(ms, 0), 250) * HZ) / 1000;
      const n = Math.floor(k.akk + 1e-9);
      k.akk -= n;
      return n;
    }

    return { H, SEG, R, HZ, DT, GAPMIN, PASSMIN, AVSTMIN, PER_METER, FORSTE, PERLE, fart, gap, pass, avstand, meter, nytt, steg, vegg, bolleY, treff, steinHjorner, stegFor, generer };
  })();

  const R = window.Rusj;
  if (!R) {
    window.Maneten = { Dyp };
    return;
  }
  const esc = R.esc;
  const TAU = Math.PI * 2;
  const BLEKK = "#170e2b";
  const KROPP = "#ff86c8";
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "maneten") + "/";
  const FOR = 70; // the jellyfish swims this far from the left edge of the view

  let H; // actions
  let motor = null;
  let omstartKlar = false;

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const m = (d) => Dyp.meter(d);
  const metTekst = (n) => R.t("{n} m", { n: R.tall(n) });

  function nyttSpill(S) {
    S.spill = { st: Dyp.nytt(R.nyttFro()), status: "klar", ferdig: false, resultat: null, tid: 0 };
    omstartKlar = false;
    R.statistikk("start", {});
  }

  // ---------- Drawing ----------

  // The jellyfish at the origin, facing right. puls 0–1 squeezes the bell (a stroke while holding).
  function tegnManet(g, s, tid, puls, dod) {
    g.save();
    g.scale(s, s);
    g.translate(0, 6); // the bell's middle on the hit circle's centre
    // Tentacles: four soft, parallel waves trailing a little behind (they never cross)
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let lag = 0; lag < 2; lag++) {
      g.strokeStyle = lag ? "#ffc4e4" : BLEKK;
      g.lineWidth = lag ? 2.2 : 4.2;
      for (let i = 0; i < 4; i++) {
        const x0 = -10.5 + i * 7;
        const lengde = i === 1 || i === 2 ? 1 : 0.8;
        g.beginPath();
        g.moveTo(x0, 5);
        for (let k = 1; k <= 8; k++) {
          const yy = 5 + k * 2.6 * lengde * (1 - puls * 0.3);
          const bolge = Math.sin(tid / 170 - k * 0.8 + i * 0.25) * Math.min(2.4, k * 0.4);
          g.lineTo(x0 - k * 0.9 + bolge, yy);
        }
        g.stroke();
      }
    }
    // The bell
    const bx = 1 + puls * 0.18;
    const by = 1 - puls * 0.2;
    g.save();
    g.scale(bx, by);
    const grad = g.createLinearGradient(0, -17, 0, 6);
    grad.addColorStop(0, dod ? "#c9b8d6" : "#ffb3dc");
    grad.addColorStop(1, dod ? "#9c8aa9" : KROPP);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-17, 5);
    g.bezierCurveTo(-18, -12, -8, -18, 0, -18);
    g.bezierCurveTo(8, -18, 18, -12, 17, 5);
    // The frilled rim: five little scallops from right to left
    for (let i = 0; i < 5; i++) g.quadraticCurveTo(17 - i * 6.8 - 3.4, 9, 17 - (i + 1) * 6.8, 5);
    g.closePath();
    g.lineWidth = 2.6;
    g.strokeStyle = BLEKK;
    g.fill();
    g.stroke();
    // Shine
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath();
    g.ellipse(-7, -10, 4.2, 2.4, -0.5, 0, TAU);
    g.fill();
    g.restore();
    // Face (it looks the way it swims)
    const ey = -4 * by;
    if (dod) {
      g.strokeStyle = BLEKK;
      g.lineWidth = 1.8;
      for (const ex of [1, 9]) {
        g.beginPath();
        g.moveTo(ex - 2.4, ey - 2.4);
        g.lineTo(ex + 2.4, ey + 2.4);
        g.moveTo(ex + 2.4, ey - 2.4);
        g.lineTo(ex - 2.4, ey + 2.4);
        g.stroke();
      }
    } else {
      for (const ex of [1, 9]) {
        g.fillStyle = "#fff1dd";
        g.beginPath();
        g.ellipse(ex, ey, 3.3, 3.8, 0, 0, TAU);
        g.fill();
        g.lineWidth = 1.3;
        g.strokeStyle = BLEKK;
        g.stroke();
        g.fillStyle = BLEKK;
        g.beginPath();
        g.arc(ex + 1, ey + 0.3, 1.8, 0, TAU);
        g.fill();
      }
      g.fillStyle = "rgba(255, 79, 139, 0.55)";
      g.beginPath();
      g.ellipse(13, ey + 4, 2.6, 1.5, 0, 0, TAU);
      g.ellipse(-3, ey + 4, 2.6, 1.5, 0, 0, TAU);
      g.fill();
      g.strokeStyle = BLEKK;
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(5, ey + 3.6, 2.4, 0.3, Math.PI - 0.3);
      g.stroke();
    }
    g.restore();
  }

  function tegnBolle(g, x, y, r, s, tid) {
    g.save();
    g.translate(x, y);
    g.rotate(tid / 2400);
    g.strokeStyle = BLEKK;
    g.lineCap = "round";
    for (let lag = 0; lag < 2; lag++) {
      g.lineWidth = (lag ? 2.2 : 4.2) * s;
      g.strokeStyle = lag ? "#b77bff" : BLEKK;
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const v = (i / 14) * TAU;
        g.moveTo(Math.cos(v) * r * 0.8 * s, Math.sin(v) * r * 0.8 * s);
        g.lineTo(Math.cos(v) * r * 1.45 * s, Math.sin(v) * r * 1.45 * s);
      }
      g.stroke();
    }
    const grad = g.createRadialGradient(-r * 0.3 * s, -r * 0.3 * s, 1, 0, 0, r * s);
    grad.addColorStop(0, "#9a5cf0");
    grad.addColorStop(1, "#5a2aa8");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r * s, 0, TAU);
    g.fill();
    g.lineWidth = 2.6 * s;
    g.strokeStyle = BLEKK;
    g.stroke();
    g.restore();
    // Little grumpy eyes (they do not turn)
    g.fillStyle = "#fff1dd";
    for (const ex of [-0.32, 0.32]) {
      g.beginPath();
      g.arc(x + ex * r * s, y - 0.05 * r * s, 0.2 * r * s, 0, TAU);
      g.fill();
    }
    g.fillStyle = BLEKK;
    for (const ex of [-0.32, 0.32]) {
      g.beginPath();
      g.arc(x + ex * r * s, y, 0.1 * r * s, 0, TAU);
      g.fill();
    }
  }

  function tegnPerle(g, x, y, s, tid) {
    const r = Dyp.PERLE * s * (1 + Math.sin(tid / 260 + x) * 0.06);
    g.save();
    g.fillStyle = "rgba(255, 241, 221, 0.22)";
    g.beginPath();
    g.arc(x, y, r * 1.9, 0, TAU);
    g.fill();
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.6, "#ffe1f0");
    grad.addColorStop(1, "#d7b4ff");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.lineWidth = 1.6 * s;
    g.strokeStyle = BLEKK;
    g.stroke();
    g.restore();
  }

  class Motor {
    constructor(S, rot) {
      this.S = S;
      this.flate = R.$(".ma-flate", rot);
      this.lerret = R.$(".ma-lerret", rot);
      this.ctx = this.lerret.getContext("2d");
      this.klokke = { akk: 0 };
      this.sist = performance.now();
      this.holder = false;
      this.puls = 0;
      this.bobler = [];
      this.tekster = [];
      this.dod = null;
      this.levende = true;
      this.s = 1;
      this.bredde = 300;
      this.tilpass();
      this.ramme = this.ramme.bind(this);
      this.id = requestAnimationFrame(this.ramme);
      this.obs = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.tilpass()) : null;
      if (this.obs) this.obs.observe(this.flate);
    }
    stopp() {
      this.levende = false;
      cancelAnimationFrame(this.id);
      this.id = 0;
      if (this.obs) this.obs.disconnect();
    }
    vekk() {
      if (!this.levende || this.id) return;
      this.sist = performance.now();
      this.id = requestAnimationFrame(this.ramme);
    }
    // The height of the sea always fits; the width shows at least 300 units, at most 760.
    tilpass() {
      const w = this.flate.clientWidth;
      const h = this.flate.clientHeight;
      if (!w || !h) return;
      // Room for the frame (5 px padding, the 3 px ring and its 9 px drop shadow)
      const s = Math.max(0.4, Math.min((h - 20) / Dyp.H, (w - 14) / 300));
      const bredde = Math.min(760, (w - 14) / s);
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      this.s = s;
      this.dpr = dpr;
      this.bredde = bredde;
      this.lerret.style.width = Math.round(bredde * s) + "px";
      this.lerret.style.height = Math.round(Dyp.H * s) + "px";
      this.lerret.width = Math.round(bredde * s * dpr);
      this.lerret.height = Math.round(Dyp.H * s * dpr);
      this.bakgrunn = null;
      this.tegn(1, performance.now());
    }
    lagBakgrunn() {
      const k = document.createElement("canvas");
      k.width = this.lerret.width;
      k.height = this.lerret.height;
      const g = k.getContext("2d");
      const w = k.width;
      const h = k.height;
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#1d4f8f");
      bg.addColorStop(0.55, "#163a78");
      bg.addColorStop(1, "#0f2152");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // Light falling in from above
      g.globalAlpha = 0.07;
      g.fillStyle = "#fff1dd";
      for (let i = 0; i < 6; i++) {
        const x = (i / 6) * w + w * 0.05;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + w * 0.06, 0);
        g.lineTo(x + w * 0.2, h);
        g.lineTo(x + w * 0.1, h);
        g.fill();
      }
      g.globalAlpha = 1;
      this.bakgrunn = k;
    }
    ramme(na) {
      if (!this.levende) return;
      this.id = 0;
      const S = this.S;
      const sp = S.spill;
      const dt = Math.min(250, na - this.sist);
      this.sist = na;
      if (sp && sp.status === "spiller" && R.arkApent()) pause(S, true);
      let alfa = 1;
      if (sp && sp.status === "spiller") {
        const st = sp.st;
        sp.tid += dt;
        const n = Dyp.stegFor(this.klokke, dt);
        for (let i = 0; i < n && sp.status === "spiller"; i++) for (const h of Dyp.steg(st, this.holder)) this.hendelse(h);
        alfa = sp.status === "spiller" ? this.klokke.akk : 1;
        this.oppdaterMeter();
      }
      // The bell squeezes while the finger is down
      this.puls += ((this.holder && sp && sp.status === "spiller" ? 1 : 0) - this.puls) * Math.min(1, dt / 90);
      this.tegn(alfa, na);
      const vaken = !!(sp && (sp.status === "spiller" || sp.status === "klar"));
      if (vaken !== this.vaken) {
        this.vaken = vaken;
        if (vaken) R.holdVaken();
        else R.slippVaken();
      }
      const liv = sp && (sp.status === "spiller" || sp.status === "klar" || (this.dod && na - this.dod < 1500) || this.bobler.length || this.tekster.length);
      if (liv) this.id = requestAnimationFrame(this.ramme);
    }
    oppdaterMeter() {
      const sp = this.S.spill;
      const n = m(sp.st.d);
      if (n !== this.vistMeter) {
        this.vistMeter = n;
        const el = R.$("#ma-meter");
        if (el) el.textContent = R.tall(n);
        const b = R.$("#ma-beste");
        if (b) b.textContent = R.tall(Math.max(this.S.rekord || 0, n));
      }
    }
    hendelse(h) {
      const S = this.S;
      const na = performance.now();
      if (h.type === "perle") {
        R.lyd.tone(990, 0, 0.09, "sine", 0.16, 1480);
        R.vibrer(8);
        this.tekster.push({ x: h.x, y: h.y, tekst: "+1", start: na });
        for (let i = 0; i < 8; i++) this.bobler.push({ x: h.x, y: h.y, vx: Math.cos(i) * 40, vy: Math.sin(i) * 40 - 20, r: 1.6 + (i % 3), start: na, liv: 500, farge: "#ffe1f0" });
        const p = R.$("#ma-perler");
        if (p) p.textContent = R.tall(S.spill.st.perler);
      } else if (h.type === "milepel") {
        R.lyd.pling();
        this.tekster.push({ x: S.spill.st.d + 60, y: 60, tekst: metTekst(h.m), start: na, stor: true });
        if (h.m >= 300) R.merke("arkade-maneten");
      } else if (h.type === "krasj") {
        krasj(S, this);
      }
    }
    tegn(alfa, na) {
      const S = this.S;
      const sp = S.spill;
      const ctx = this.ctx;
      if (!sp) return;
      const st = sp.st;
      const s = this.s;
      const rolig = R.rolig();
      if (!this.bakgrunn) this.lagBakgrunn();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.bakgrunn, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const d = st.pd + (st.d - st.pd) * alfa;
      const x0 = d - FOR; // world x at the left edge
      const X = (x) => (x - x0) * s;
      const B = this.bredde;
      // Drifting specks (slow parallax)
      ctx.fillStyle = "rgba(255,241,221,0.22)";
      for (let i = 0; i < 26; i++) {
        const px = (((i * 97.3 - d * 0.35) % (B + 20)) + B + 20) % (B + 20);
        const py = (i * 53.7 + Math.sin(i + na / 1800) * 8) % Dyp.H;
        ctx.beginPath();
        ctx.arc(px * s, py * s, (0.8 + (i % 3) * 0.5) * s, 0, TAU);
        ctx.fill();
      }
      // The cave walls
      if (st.punkter.length < 2) Dyp.generer(st);
      const pkt = st.punkter;
      const tak = new Path2D();
      const bunn = new Path2D();
      tak.moveTo(X(pkt[0].x), 0);
      bunn.moveTo(X(pkt[0].x), Dyp.H * s);
      for (const p of pkt) {
        tak.lineTo(X(p.x), p.c * s);
        bunn.lineTo(X(p.x), p.f * s);
      }
      tak.lineTo(X(pkt[pkt.length - 1].x), 0);
      bunn.lineTo(X(pkt[pkt.length - 1].x), Dyp.H * s);
      tak.closePath();
      bunn.closePath();
      const stein = ctx.createLinearGradient(0, 0, 0, Dyp.H * s);
      stein.addColorStop(0, "#3b2a6e");
      stein.addColorStop(0.5, "#2b1d55");
      stein.addColorStop(1, "#3b2a6e");
      ctx.fillStyle = stein;
      ctx.fill(tak);
      ctx.fill(bunn);
      ctx.lineJoin = "round";
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = BLEKK;
      ctx.stroke(tak);
      ctx.stroke(bunn);
      // Seaweed and coral along the walls (the same for a place every time)
      for (const p of pkt) {
        const k = (Math.abs(Math.sin(p.x * 12.9898)) * 43758.5453) % 1;
        if (k < 0.45) {
          // seaweed swaying from the floor
          const sx = X(p.x + k * 40);
          const v = st.punkter.length ? Dyp.vegg(st, p.x + k * 40) : p;
          const hoyde = (18 + k * 40) * s;
          ctx.strokeStyle = k < 0.2 ? "#3de3b0" : "#2fbf8f";
          ctx.lineWidth = 3.2 * s;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(sx, v.f * s + 2);
          const sving = rolig ? 0 : Math.sin(na / 700 + p.x) * 5 * s;
          ctx.quadraticCurveTo(sx + sving, v.f * s - hoyde * 0.6, sx + sving * 1.6, v.f * s - hoyde);
          ctx.stroke();
        } else if (k > 0.8) {
          const v = Dyp.vegg(st, p.x + 20);
          ctx.fillStyle = k > 0.9 ? "#ff8fb8" : "#ffb35c";
          ctx.beginPath();
          ctx.arc(X(p.x + 20), v.c * s + 3, 4.5 * s, 0, TAU);
          ctx.arc(X(p.x + 28), v.c * s + 1, 3 * s, 0, TAU);
          ctx.fill();
        }
      }
      // Obstacles
      for (const h of st.hindre) {
        if (X(h.x) < -80 * s || X(h.x) > (B + 80) * s) continue;
        if (h.t === "stein") {
          const [a, b, c] = Dyp.steinHjorner(h);
          ctx.beginPath();
          ctx.moveTo(X(a[0]), a[1] * s);
          ctx.quadraticCurveTo(X(h.x - h.b * 0.35), (c[1] + a[1]) / 2 * s, X(c[0]), c[1] * s);
          ctx.quadraticCurveTo(X(h.x + h.b * 0.35), (c[1] + b[1]) / 2 * s, X(b[0]), b[1] * s);
          ctx.closePath();
          ctx.fillStyle = "#4a3687";
          ctx.fill();
          ctx.lineWidth = 3 * s;
          ctx.strokeStyle = BLEKK;
          ctx.stroke();
          // a lighter stripe
          ctx.strokeStyle = "rgba(255,241,221,0.18)";
          ctx.lineWidth = 2.4 * s;
          ctx.beginPath();
          ctx.moveTo(X(h.x - h.b * 0.25), (c[1] * 0.75 + a[1] * 0.25) * s);
          ctx.lineTo(X(h.x - h.b * 0.05), (c[1] * 0.92 + a[1] * 0.08) * s);
          ctx.stroke();
        } else {
          const by = st.pd + (st.d - st.pd) * alfa;
          tegnBolle(ctx, X(h.x), Dyp.bolleY(h, by) * s, h.r, s, rolig ? 0 : na);
        }
      }
      for (const p of st.perleliste) if (!p.tatt) tegnPerle(ctx, X(p.x), p.y * s, s, rolig ? 0 : na);
      // The jellyfish
      const y = st.py + (st.y - st.py) * alfa;
      let jy = y;
      if (sp.status === "klar" && !rolig) jy = y + Math.sin(na / 380) * 6;
      if (this.dod) jy = y + Math.min(60, (na - this.dod) / 25);
      ctx.save();
      ctx.translate(FOR * s, jy * s);
      ctx.rotate(this.dod ? 0.5 : Math.max(-0.35, Math.min(0.35, st.vy / 900)));
      tegnManet(ctx, s, rolig ? 0 : na, this.puls, !!this.dod);
      ctx.restore();
      // Bubbles and texts
      this.bobler = this.bobler.filter((b) => na - b.start < b.liv);
      for (const b of this.bobler) {
        const a = (na - b.start) / b.liv;
        ctx.globalAlpha = 1 - a;
        ctx.strokeStyle = b.farge;
        ctx.lineWidth = 1.4 * s;
        ctx.beginPath();
        ctx.arc(X(b.x + (b.vx * a * b.liv) / 1000), (b.y + (b.vy * a * b.liv) / 1000) * s, b.r * s, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      this.tekster = this.tekster.filter((p) => na - p.start < 1000);
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      for (const p of this.tekster) {
        const a = (na - p.start) / 1000;
        ctx.globalAlpha = a < 0.7 ? 1 : (1 - a) / 0.3;
        ctx.font = `900 ${Math.round((p.stor ? 26 : 16) * s)}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
        ctx.lineWidth = Math.max(3, 4 * s);
        ctx.strokeStyle = BLEKK;
        const tx = p.stor ? (B / 2) * s : X(p.x);
        const ty = (p.y - 8 - a * 24) * s;
        ctx.strokeText(p.tekst, tx, ty);
        ctx.fillStyle = p.stor ? "#ffd23f" : "#fff1dd";
        ctx.fillText(p.tekst, tx, ty);
      }
      ctx.globalAlpha = 1;
    }
    // A stroke of the bell: a few bubbles from under it
    pust() {
      if (R.rolig()) return;
      const st = this.S.spill.st;
      const na = performance.now();
      for (let i = 0; i < 3; i++) this.bobler.push({ x: st.d - 6 + i * 5, y: st.y + 14, vx: -30 - i * 10, vy: 40 + i * 12, r: 1.4 + i * 0.6, start: na, liv: 600, farge: "rgba(255,241,221,0.7)" });
    }
  }

  // ---------- The game ----------

  function krasj(S, mo) {
    const sp = S.spill;
    sp.status = "over";
    mo.dod = performance.now();
    mo.holder = false;
    R.lyd.tone(260, 0, 0.35, "sine", 0.2, 120);
    R.lyd.stoy(0, 0.25, 0.2, 700, "lowpass");
    R.vibrer([70, 40, 120]);
    const ramme = R.$(".ma-ramme");
    if (ramme && !R.rolig()) ramme.classList.add("risting");
    ferdigstill(S);
    R.lagre();
    const fortsatt = R.vakt();
    const r = sp.resultat;
    if (r.nyRekord) {
      R.si(R.t("Au! {meter} – ny rekord.", { meter: metTekst(r.meter) }));
      setTimeout(() => fortsatt() && S.spill === sp && R.gaTil("slutt"), R.rolig() ? 700 : 1300);
      return;
    }
    omstartKlar = false;
    setTimeout(
      () => {
        if (!fortsatt() || S.spill !== sp) return;
        omstartKlar = true;
        visStatus(S);
        R.si(R.t("Au! {meter}. Trykk for å prøve igjen.", { meter: metTekst(r.meter) }));
      },
      R.rolig() ? 400 : 700,
    );
  }

  function ferdigstill(S) {
    const sp = S.spill;
    if (sp.ferdig) return;
    sp.ferdig = true;
    const st = sp.st;
    const meter = m(st.d);
    const gml = S.rekord || 0;
    sp.resultat = { meter, perler: st.perler, hva: st.krasj, gml, nyRekord: meter > gml && gml > 0, forste: !gml && meter > 0 };
    if (meter > gml) S.rekord = meter;
    S.perler = (S.perler || 0) + st.perler;
    S.sist = { meter, perler: st.perler };
    S.spilt = (S.spilt || 0) + 1;
    R.statistikk("ferdig", { meter, perler: st.perler, sek: Math.round(sp.tid / 1000) });
  }

  // A press: start, or (after a crash) a new run at once, or just hold.
  function trykkNed(S) {
    const sp = S.spill;
    if (!sp || !motor) return;
    R.lyd.lasOpp();
    if (sp.ferdig || sp.status === "over") {
      if (omstartKlar && S.skjerm === "spill") nyRunde(S);
      return;
    }
    if (sp.status === "pause") return;
    if (sp.status === "klar") {
      sp.status = "spiller";
      motor.klokke.akk = 0;
      visStatus(S);
      R.lagre();
    }
    if (!motor.holder) {
      motor.holder = true;
      motor.pust();
      R.lyd.tone(330, 0, 0.07, "sine", 0.05, 460);
    }
    const pad = R.$(".ma-pad");
    if (pad) pad.classList.add("trykket");
  }
  function slippOpp() {
    if (motor) motor.holder = false;
    const pad = R.$(".ma-pad");
    if (pad) pad.classList.remove("trykket");
  }

  function nyRunde(S) {
    nyttSpill(S);
    if (motor) {
      motor.dod = null;
      motor.bobler = [];
      motor.tekster = [];
      motor.klokke.akk = 0;
      motor.vistMeter = -1;
      motor.vekk();
    }
    const ramme = R.$(".ma-ramme");
    if (ramme) ramme.classList.remove("risting");
    oppdaterHud(S);
    trykkNed(S);
  }

  function pause(S, pa) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.status === "over") return;
    if (pa && sp.status === "spiller") {
      sp.status = "pause";
      slippOpp();
      R.lagre();
      visStatus(S);
    } else if (!pa && sp.status === "pause") gjenoppta(S);
  }
  let gjenopptar = false;
  let borteUnderveis = false;
  async function gjenoppta(S) {
    if (gjenopptar) return;
    gjenopptar = true;
    borteUnderveis = false;
    const sp = S.spill;
    const fortsatt = R.vakt();
    visStatus(S, true);
    const ok = await R.nedtelling(["3", "2", "1"], 420);
    gjenopptar = false;
    if (!ok || !fortsatt() || sp !== S.spill || sp.status !== "pause") return;
    if (document.hidden || borteUnderveis) return visStatus(S);
    sp.status = "spiller";
    if (motor) {
      motor.klokke.akk = 0;
      motor.vekk();
    }
    visStatus(S);
  }

  function oppdaterHud(S) {
    const sp = S.spill;
    if (!sp) return;
    const el = R.$("#ma-meter");
    if (el) el.textContent = R.tall(m(sp.st.d));
    const b = R.$("#ma-beste");
    if (b) b.textContent = R.tall(Math.max(S.rekord || 0, m(sp.st.d)));
    const p = R.$("#ma-perler");
    if (p) p.textContent = R.tall(sp.st.perler);
  }

  function visStatus(S, skjul) {
    const sp = S.spill;
    const el = R.$(".ma-status");
    if (!el || !sp) return;
    const knapp = R.$('[data-h="pause"]');
    if (knapp) {
      knapp.setAttribute("aria-label", sp.status === "pause" ? R.t("Fortsett") : R.t("Pause"));
      knapp.classList.toggle("pauset", sp.status === "pause");
    }
    el.className = "ma-status";
    if (sp.status === "over" && omstartKlar && !skjul) {
      const r = sp.resultat || { meter: m(sp.st.d) };
      el.hidden = false;
      el.classList.add("over");
      el.innerHTML = `<div class="ma-statuskort over">
        <p class="ma-stor">${esc(metTekst(r.meter))}</p>
        <p>${esc(r.forste ? R.t("Din første rekord!") : R.t("Rekord {n}.", { n: metTekst(Math.max(S.rekord || 0, r.meter)) }))} <span class="ma-finger">${esc(R.t("Trykk for å prøve igjen."))}</span><span class="ma-tast">${esc(R.t("Trykk på mellomrom for å prøve igjen."))}</span></p>
        ${R.ui.lenke(R.t("Se resultatet"), "resultat")}
      </div>`;
      return;
    }
    if (skjul || sp.status === "spiller" || sp.status === "over") {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    if (sp.status === "klar") {
      el.classList.add("klar");
      el.innerHTML = `<div class="ma-statuskort klar"><p class="ma-stor">${esc(R.t("Klar?"))}</p><p><span class="ma-finger">${esc(R.t("Hold fingeren nede for å svømme opp – slipp for å synke."))}</span><span class="ma-tast">${esc(R.t("Hold mellomrom nede for å svømme opp – slipp for å synke."))}</span></p></div>`;
    } else el.innerHTML = `<div class="ma-statuskort"><p class="etikett">${esc(R.t("Pause"))}</p><p class="ma-stor">${esc(R.t("Maneten venter"))}</p>${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}${R.ui.lenke(R.t("Start på nytt"), "ny")}</div>`;
  }

  // ---------- Controls: a finger anywhere on the board or the pad; Space, ↑ or W ----------

  function bindKontroll(S, rot) {
    const flate = R.$(".ma-spill", rot);
    if (!flate) return;
    const nede = new Set();
    const ned = (e) => {
      if (e.target.closest("button:not(.ma-pad), a") || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      nede.add(e.pointerId);
      try {
        e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId);
      } catch (x) {
        /* fine */
      }
      trykkNed(R.S);
    };
    const opp = (e) => {
      if (!nede.has(e.pointerId)) return;
      nede.delete(e.pointerId);
      if (!nede.size) slippOpp();
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    // The pad is a button for keyboards and switches too: Enter/Space on it is a short stroke.
    const klikk = (e) => {
      if (e.target.closest(".ma-pad") && e.detail === 0) {
        trykkNed(R.S);
        setTimeout(slippOpp, 180);
      }
    };
    flate.addEventListener("pointerdown", ned);
    window.addEventListener("pointerup", opp);
    window.addEventListener("pointercancel", opp);
    flate.addEventListener("click", klikk);
    flate.addEventListener("touchmove", nei, { passive: false });
    flate.addEventListener("gesturestart", nei);
    flate.addEventListener("contextmenu", nei);
    R.vedForlat(() => {
      flate.removeEventListener("pointerdown", ned);
      window.removeEventListener("pointerup", opp);
      window.removeEventListener("pointercancel", opp);
      flate.removeEventListener("click", klikk);
      flate.removeEventListener("touchmove", nei, { passive: false });
      flate.removeEventListener("gesturestart", nei);
      flate.removeEventListener("contextmenu", nei);
      slippOpp();
    });
  }

  const HOLD = new Set([" ", "ArrowUp", "w", "W"]);
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.skjerm === "slutt" && (e.key === "Enter" || e.key === " ") && e.target === document.body) {
      e.preventDefault();
      return H.igjen(null, e, S);
    }
    if (S.skjerm !== "spill") return;
    const m2 = e.target;
    const fritt = !(m2 && m2.closest && m2.closest("button:not(.ma-pad), a, input, textarea, select"));
    if (HOLD.has(e.key) && (fritt || e.key === "ArrowUp")) {
      e.preventDefault();
      if (!e.repeat) trykkNed(S);
    } else if ((e.key === "p" || e.key === "P" || e.key === "Escape") && fritt) {
      e.preventDefault();
      pause(S, S.spill.status !== "pause");
    }
  });
  document.addEventListener("keyup", (e) => {
    if (HOLD.has(e.key)) slippOpp();
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && gjenopptar) borteUnderveis = true;
    if (document.hidden && S && S.skjerm === "spill") pause(S, true);
  });
  window.addEventListener("blur", () => {
    const S = R.S;
    if (gjenopptar) borteUnderveis = true;
    slippOpp();
    if (S && S.skjerm === "spill") pause(S, true);
  });

  const fastSide = (pa) => document.documentElement.classList.toggle("ma-fast", !!pa);
  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>';
  const PIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 14l7-7 7 7"/></svg>';

  function gyldig(sp) {
    if (!sp || typeof sp !== "object" || !sp.st || typeof sp.st !== "object") return false;
    const st = sp.st;
    const tall = (v) => typeof v === "number" && Number.isFinite(v);
    if (!["d", "pd", "y", "py", "vy", "fro", "genX", "genMidt", "nesteHinder", "perler"].every((k) => tall(st[k]))) return false;
    if (!Array.isArray(st.punkter) || st.punkter.length < 2 || st.punkter.length > 80 || !st.punkter.every((p) => p && tall(p.x) && tall(p.c) && tall(p.f))) return false;
    if (!Array.isArray(st.hindre) || st.hindre.length > 40 || !st.hindre.every((h) => h && (h.t === "stein" ? tall(h.x) && tall(h.b) && tall(h.spiss) && Array.isArray(h.fot) && h.fot.every(tall) : h.t === "bolle" && tall(h.x) && tall(h.r) && tall(h.y0) && tall(h.a) && tall(h.fase)))) return false;
    return Array.isArray(st.perleliste) && st.perleliste.length <= 40 && st.perleliste.every((p) => p && tall(p.x) && tall(p.y));
  }

  // ---------- Start ----------

  R.start({
    id: "maneten",
    versjon: 1,
    pagar,

    tilstand: () => ({ rekord: 0, perler: 0, sist: null, spilt: 0, spill: null }),

    lastet(S) {
      S.rekord = Number.isFinite(S.rekord) && S.rekord > 0 ? Math.floor(S.rekord) : 0;
      S.perler = Number.isFinite(S.perler) && S.perler > 0 ? Math.floor(S.perler) : 0;
      S.spilt = Number.isInteger(S.spilt) && S.spilt >= 0 ? S.spilt : 0;
      if (S.sist && !(Number.isFinite(S.sist.meter) && Number.isFinite(S.sist.perler))) S.sist = null;
      const sp = S.spill;
      if (sp) {
        if (!gyldig(sp)) S.spill = null;
        else {
          sp.tid = Number(sp.tid) || 0;
          if (sp.status === "spiller") sp.status = "pause";
          if (!["klar", "pause", "over"].includes(sp.status)) sp.status = "pause";
          if (sp.status === "over" || sp.st.over) {
            sp.status = "over";
            ferdigstill(S);
          }
        }
      }
      if (S.skjerm === "slutt" && (!S.spill || !S.spill.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!S.spill || S.spill.ferdig)) S.skjerm = S.spill ? "slutt" : "hjem";
    },

    regler: {
      intro: R.t("Maneten svømmer gjennom en undervannshule. Du styrer bare én ting: opp eller ned."),
      steg: [
        [R.t("Hold"), R.t("Hold fingeren nede – hvor som helst på brettet – så svømmer maneten opp. Med tastatur: hold mellomrom eller pil opp.")],
        [R.t("Slipp"), R.t("Slipp, så synker maneten sakte.")],
        [R.t("Unngå"), R.t("Ikke treff veggene, steinene eller kråkebollene. Ta med deg perlene på veien – alle blir talt.")],
      ],
      tips: [
        R.t("Korte trykk gir små hopp. Lange trykk tar deg langt opp."),
        R.t("Hulen blir trangere og maneten raskere jo lenger du kommer."),
        R.t("Fra 120 meter begynner noen kråkeboller å vippe opp og ned. Det er alltid plass over dem."),
        R.t("Krasjet du? Trykk en gang til, så er du i gang igjen. Slår du rekorden, får du se hele resultatet."),
        R.t("Spillet tar pause av seg selv hvis du bytter app. P eller Esc gir pause med tastatur."),
        R.t("Maneten går i sanntid og kan dessverre ikke spilles med skjermleser."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const linjer = [];
          if (S.rekord) linjer.push(`<li><b>${esc(R.t("Rekord"))}</b> ${esc(metTekst(S.rekord))}</li>`);
          if (S.perler) linjer.push(`<li><b>${esc(R.t("Perler"))}</b> ${esc(R.tall(S.perler))}</li>`);
          if (S.sist) linjer.push(`<li><b>${esc(R.t("Sist"))}</b> ${esc(metTekst(S.sist.meter))}</li>`);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Hold for å svømme opp – slipp for å synke."))}<br><em>${esc(R.t("Hvor langt kommer du?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: aktiv,
              fortsettTekst: aktiv ? R.t("Fortsett · {stilling}", { stilling: metTekst(m(sp.st.d)) }) : "",
              ekstraHtml: R.ui.lenkerad(R.ui.lenke(R.t("Slik spiller du"), "regler")) + (linjer.length ? `<section class="ma-rekorder" aria-label="${esc(R.t("Dine resultater"))}"><ul>${linjer.join("")}</ul></section>` : ""),
            }),
            merker: [
              ["1", R.t("finger")],
              ["3", R.t("farer")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      spill: {
        tittel: () => R.t("Maneten"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = m(sp.st.d);
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Maneten"))}</h1>
            <div class="ma-spill">
              <div class="ma-hud">
                <span class="ma-stat"><small>${esc(R.t("Meter"))}</small><b id="ma-meter">${esc(R.tall(n))}</b></span>
                <span class="ma-stat"><small>${esc(R.t("Rekord"))}</small><b id="ma-beste">${esc(R.tall(Math.max(S.rekord || 0, n)))}</b></span>
                <span class="ma-stat ma-perlestat"><small>${esc(R.t("Perler"))}</small><b id="ma-perler">${esc(R.tall(sp.st.perler))}</b></span>
                <button class="ma-pause${sp.status === "pause" ? " pauset" : ""}" data-h="pause" aria-label="${esc(sp.status === "pause" ? R.t("Fortsett") : R.t("Pause"))}">${PAUSE}</button>
              </div>
              <div class="ma-flate">
                <div class="ma-ramme">
                  <canvas class="ma-lerret" role="img" aria-label="${esc(R.t("Hulen med maneten"))}"></canvas>
                  <div class="ma-status" hidden></div>
                </div>
              </div>
              <button class="ma-pad" aria-label="${esc(R.t("Hold for å svømme opp"))}">${PIL}<span>${esc(R.t("Hold for å svømme opp"))}</span></button>
            </div>`;
        },
        etter(S, rot) {
          if (motor) motor.stopp();
          motor = new Motor(S, rot);
          bindKontroll(S, rot);
          visStatus(S);
          R.vedForlat(() => {
            if (motor) motor.stopp();
            motor = null;
          });
        },
        inn(S) {
          if (!S.spill || S.spill.ferdig) return R.gaTil(S.spill ? "slutt" : "hjem");
          fastSide(true);
          if (motor) motor.tilpass();
        },
        ut(S) {
          const sp = S.spill;
          omstartKlar = false;
          slippOpp();
          if (sp && sp.status === "spiller") sp.status = "pause";
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: () => R.t("Maneten"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { meter: m(sp.st.d), perler: sp.st.perler };
          const tittel = r.nyRekord ? R.t("Ny rekord!") : r.meter >= 200 ? R.t("Godt jobba!") : R.t("Godt forsøk!");
          const linje = r.nyRekord
            ? R.t("Ny personlig rekord! Forrige: {n}.", { n: metTekst(r.gml) })
            : r.forste
              ? R.t("Første tur – nå har du en rekord å slå!")
              : r.gml
                ? R.t("Rekorden din er {n}.", { n: metTekst(Math.max(r.gml, r.meter)) })
                : R.t("Prøv igjen – havet venter.");
          const hva = r.hva === "stein" ? R.t("Maneten traff en stein.") : r.hva === "bolle" ? R.t("Maneten traff en kråkebolle.") : R.t("Maneten traff veggen.");
          const stor = r.nyRekord || r.meter >= 300;
          return `
            ${R.ui.banner({ tittel, etikett: hva, stemning: stor ? "jubel" : "" })}
            <div class="ma-resultat">
              <div class="ma-tall${r.nyRekord ? " ny" : ""}"><b>${esc(R.tall(r.meter))}</b><span>${esc(R.t("meter"))}</span>${r.nyRekord ? `<i class="ma-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="ma-tall"><b>${esc(R.tall(r.perler))}</b><span>${esc(R.t("perle|perler", { n: r.perler }))}</span></div>
            </div>
            <p class="hjelp">${esc(linje)}</p>
            <div class="ma-del">${R.ui.knapp2(R.t("Del resultatet"), "del")}</div>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(`<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if (r.nyRekord || r.meter >= 400) {
            R.lyd.fanfare();
            R.konfetti();
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig && S.spill.st.d > 200))) || !fortsatt()) return;
        nyttSpill(S);
        R.gaTil("spill");
      },
      regler(el, e, S) {
        if (S.skjerm === "spill") pause(S, true);
        R.visRegler();
      },
      fortsett: (el, e, S) => R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem"),
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      resultat(el, e, S) {
        if (S.spill && S.spill.ferdig) R.gaTil("slutt");
      },
      pause: (el, e, S) => pause(S, S.spill.status !== "pause"),
      "fortsett-spill": (el, e, S) => pause(S, false),
      ny(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      del(el, e, S) {
        const r = S.spill && S.spill.resultat;
        if (!r) return;
        const perler = R.flertall(r.perler, "perle", "perler");
        const tekst = `🪼 ${R.t("Maneten")} · ${metTekst(r.meter)} · ${perler}. ${R.t("Hvor langt kommer du?")}`;
        R.del(R.t("Maneten"), tekst, ADRESSE, { kort: { tittel: R.t("Maneten"), linjer: [metTekst(r.meter), perler] } });
      },
    }),
  });
})();
