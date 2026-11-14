/* Planeten — drop and merge.
   Planets fall into a glass jar. Two alike that touch melt into the next, bigger one: asteroid,
   the Moon, Mercury, Mars, Venus, the Earth, Neptune, Uranus, Saturn, Jupiter and at last the Sun
   (the real order by size). Two suns go supernova. Whatever stays above the dashed line for a few
   seconds ends the game.

   ---------- The physics (Fys, pure, unit-tested in test/planeten.test.mjs) ----------
   Circles in a box, stepped at a fixed 120 Hz, so the game behaves the same at any frame rate (the
   screen only interpolates between the last two steps). Each step: gravity and motion (explicit
   Euler), then merges (two alike that touch become one at their midpoint, with their mean speed;
   the new planet grows to its size over a few steps so neighbours are pushed, not thrown), then
   8 rounds of position projection (walls, floor, every pair pushed apart in proportion to the
   other's mass, r²), and the new speed is the distance moved (position-based dynamics: stable
   stacks, no tunnelling). Speeds are capped; touching planets lose a little sideways speed and
   roll. The random planets come from a seeded generator kept in the state (mulberry32), so a
   saved game and a test replay deal the same planets. The first four drops are the three smallest
   kinds; after that the five smallest, small ones more often. */
(function () {
  "use strict";

  // R.t before the kit's R is in scope (the physics also loads in the unit tests, without the kit).
  const Rt = { t: (s) => (window.Rusj && window.Rusj.t ? window.Rusj.t(s) : s) };

  const Fys = (() => {
    const W = 300;
    const H = 400;
    const LINJE = 72; // the dashed line
    const HENG = 36; // where the next planet hangs before it is dropped
    const HZ = 120;
    const DT = 1 / HZ;
    const G = 1500;
    const ITER = 8;
    const VMAKS = 1000;
    const RAD = [10, 14, 19, 24, 30, 37, 45, 53, 62, 72, 84];
    // Points for making each kind; two suns: a supernova.
    const POENG = [0, 2, 4, 8, 12, 18, 25, 34, 45, 60, 80];
    const SUPERNOVA = 150;
    const SIST = RAD.length - 1;
    const VOKS = 10; // steps a merged planet takes to grow to its size
    const PUST = 48; // steps between two drops (0.4 s)
    const NAADE = 90; // steps a new planet may be above the line (0.75 s)
    const FARE = 300; // steps above the line before the game is over (2.5 s)
    const VEKT = [6, 5, 4, 3, 2];
    const NAVN = [Rt.t("Asteroide"), Rt.t("Månen"), Rt.t("Merkur"), Rt.t("Mars"), Rt.t("Venus"), Rt.t("Jorda"), Rt.t("Neptun"), Rt.t("Uranus"), Rt.t("Saturn"), Rt.t("Jupiter"), Rt.t("Sola")];

    // mulberry32 with its state in the game, so a saved game deals on as before.
    function tilf(st) {
      const a = (st.fro + 0x6d2b79f5) | 0;
      st.fro = a >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    function trekk(st) {
      const v = VEKT.slice(0, st.trukket < 4 ? 3 : 5);
      let x = tilf(st) * v.reduce((a, b) => a + b, 0);
      st.trukket++;
      for (let i = 0; i < v.length; i++) {
        x -= v[i];
        if (x < 0) return i;
      }
      return v.length - 1;
    }

    function nytt(fro) {
      const st = { b: [], nesteId: 1, fro: fro >>> 0, trukket: 0, poeng: 0, slipp: 0, n: 0, fare: 0, over: false, pust: 0, storst: 0, slatt: 0, soler: 0, sikte: W / 2 };
      st.hold = trekk(st);
      st.neste = trekk(st);
      return st;
    }

    const radius = (b) => (b.vokser > 0 && b.n > 0 ? RAD[b.n] - (RAD[b.n] - RAD[b.n - 1]) * (b.vokser / VOKS) : RAD[b.n]);
    const kanSlippe = (st) => !st.over && st.pust === 0;
    const klampX = (n, x) => Math.min(W - RAD[n], Math.max(RAD[n], x));

    // Drops the hanging planet at x. Returns the new planet, or null while it is not ready.
    function slipp(st, x) {
      if (!kanSlippe(st)) return null;
      const n = st.hold;
      x = klampX(n, Number.isFinite(x) ? x : W / 2);
      const b = { id: st.nesteId++, n, x, y: HENG, px: x, py: HENG, vx: 0, vy: 0, a: 0, w: 0, alder: 0, vokser: 0 };
      st.b.push(b);
      st.hold = st.neste;
      st.neste = trekk(st);
      st.pust = PUST;
      st.slipp++;
      if (n > st.storst) st.storst = n;
      return b;
    }

    // One step of 1/120 s. Returns what happened: merges, a supernova, the hardest bump, the end.
    function steg(st) {
      const ut = [];
      if (st.over) return ut;
      st.n++;
      if (st.pust > 0) st.pust--;
      let L = st.b;
      for (const b of L) {
        b.px = b.x;
        b.py = b.y;
        b.vy += G * DT;
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        b.alder++;
        if (b.vokser > 0) b.vokser--;
        b.rorer = false;
      }
      // Merges: two alike that touch (lowest ids first, each planet once per step).
      let borte = false;
      for (let i = 0; i < L.length; i++) {
        const a = L[i];
        if (a.borte || a.ny === st.n) continue;
        for (let j = i + 1; j < L.length; j++) {
          const c = L[j];
          if (c.borte || c.n !== a.n || c.ny === st.n) continue;
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const min = radius(a) + radius(c) + 0.5;
          if (dx * dx + dy * dy > min * min) continue;
          a.borte = c.borte = true;
          borte = true;
          const x = (a.x + c.x) / 2;
          const y = (a.y + c.y) / 2;
          if (a.n === SIST) {
            st.poeng += SUPERNOVA;
            st.soler++;
            ut.push({ type: "nova", n: SIST, x, y, poeng: SUPERNOVA });
          } else {
            const n = a.n + 1;
            const vx = (a.vx + c.vx) / 2;
            const vy = (a.vy + c.vy) / 2;
            L.push({ id: st.nesteId++, n, x, y, px: x - vx * DT, py: y - vy * DT, vx, vy, a: (a.a + c.a) / 2, w: (a.w + c.w) / 2, alder: Math.min(a.alder, c.alder), vokser: VOKS, ny: st.n });
            st.poeng += POENG[n];
            st.slatt++;
            if (n > st.storst) st.storst = n;
            ut.push({ type: "slatt", n, x, y, poeng: POENG[n] });
          }
          break;
        }
      }
      if (borte) L = st.b = L.filter((b) => !b.borte);
      // Position projection: every overlapping pair, then walls and floor (last, so they always hold).
      for (let it = 0; it < ITER; it++) {
        for (let i = 0; i < L.length; i++) {
          const a = L[i];
          const ra = radius(a);
          for (let j = i + 1; j < L.length; j++) {
            const c = L[j];
            const rc = radius(c);
            const min = ra + rc;
            const dx = c.x - a.x;
            const dy = c.y - a.y;
            if (dx >= min || dx <= -min || dy >= min || dy <= -min) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            let d = Math.sqrt(d2);
            let nx = 0;
            let ny = 1;
            if (d > 1e-9) {
              nx = dx / d;
              ny = dy / d;
            } else d = 0;
            const dyp = min - d;
            const ma = ra * ra;
            const mc = rc * rc;
            const sa = (dyp * mc) / (ma + mc);
            const sc = (dyp * ma) / (ma + mc);
            a.x -= nx * sa;
            a.y -= ny * sa;
            c.x += nx * sc;
            c.y += ny * sc;
            a.rorer = c.rorer = true;
          }
        }
        for (const b of L) {
          const r = radius(b);
          if (b.x < r) {
            b.x = r;
            b.rorer = true;
          } else if (b.x > W - r) {
            b.x = W - r;
            b.rorer = true;
          }
          if (b.y > H - r) {
            b.y = H - r;
            b.rorer = true;
          }
        }
      }
      // New speeds from the distance moved; the hardest bump of the step (for the sound).
      let dunk = null;
      for (const b of L) {
        let vx = (b.x - b.px) / DT;
        let vy = (b.y - b.py) / DT;
        const fart = Math.sqrt(vx * vx + vy * vy);
        if (fart > VMAKS) {
          vx *= VMAKS / fart;
          vy *= VMAKS / fart;
        }
        const tap = Math.sqrt((b.vx - vx) * (b.vx - vx) + (b.vy - vy) * (b.vy - vy));
        if (tap > 240 && (!dunk || tap > dunk.styrke)) dunk = { type: "dunk", styrke: tap, n: b.n, x: b.x, y: b.y };
        if (b.rorer) {
          vx *= 0.996;
          b.w += (vx / radius(b) - b.w) * 0.2;
        } else b.w *= 0.998;
        b.vx = vx;
        b.vy = vy;
        b.a += b.w * DT;
        if (b.a > Math.PI) b.a -= 2 * Math.PI;
        else if (b.a < -Math.PI) b.a += 2 * Math.PI;
      }
      if (dunk) ut.push(dunk);
      // The line: something that stays above it too long ends the game.
      let over = false;
      for (const b of L)
        if (b.alder > NAADE && b.y - radius(b) < LINJE) {
          over = true;
          break;
        }
      st.fare = over ? st.fare + 1 : Math.max(0, st.fare - 3);
      if (st.fare >= FARE) {
        st.over = true;
        ut.push({ type: "over" });
      }
      return ut;
    }

    // Where the hanging planet would land if dropped straight down at x (its centre's y).
    function lander(st, x) {
      const rh = RAD[st.hold];
      x = klampX(st.hold, x);
      let y = H - rh;
      for (const b of st.b) {
        const dx = Math.abs(b.x - x);
        const R2 = radius(b) + rh;
        if (dx >= R2) continue;
        y = Math.min(y, b.y - Math.sqrt(R2 * R2 - dx * dx));
      }
      return Math.max(HENG, y);
    }

    // Fixed steps for a frame of ms milliseconds (the remainder is carried to the next frame).
    function stegFor(k, ms) {
      k.akk = (k.akk || 0) + (Math.min(Math.max(ms, 0), 250) * HZ) / 1000;
      const n = Math.floor(k.akk + 1e-9);
      k.akk -= n;
      return n;
    }

    return { W, H, LINJE, HENG, HZ, DT, RAD, POENG, SUPERNOVA, SIST, VOKS, PUST, NAADE, FARE, NAVN, nytt, slipp, steg, trekk, radius, kanSlippe, klampX, lander, stegFor };
  })();

  const R = window.Rusj;
  if (!R) {
    window.Planeten = { Fys };
    return;
  }
  const esc = R.esc;
  const TAU = Math.PI * 2;
  const BLEKK = "#170e2b";
  // The main colour of each kind (sparks, the result screen)
  const FARGE = ["#9a8d84", "#ece6d6", "#bca18c", "#ec6a43", "#f4c66e", "#3a8ef0", "#4b6cf0", "#86e6e6", "#ecc979", "#e4b27c", "#ffcf3f"];
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "planeten") + "/";

  let H; // actions
  let motor = null; // the running loop of the play screen

  // ---------- The art: one planet at the origin, radius r ----------

  function rund(g, x, y, r, farge) {
    g.fillStyle = farge;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  function krater(g, r, liste, farge) {
    for (const [x, y, s] of liste) {
      rund(g, x * r, y * r, s * r, farge);
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.beginPath();
      g.arc(x * r + s * r * 0.18, y * r + s * r * 0.22, s * r * 0.78, 0.2, Math.PI - 0.2);
      g.fill();
    }
  }
  function band(g, r, liste) {
    for (const [y, h, farge] of liste) {
      g.fillStyle = farge;
      g.fillRect(-r, y * r, 2 * r, h * r);
    }
  }
  function ring(g, r, front, farge) {
    g.save();
    g.rotate(-0.38);
    g.beginPath();
    g.ellipse(0, 0, r * 0.98, r * 0.3, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    g.lineWidth = r * 0.13;
    g.strokeStyle = BLEKK;
    g.stroke();
    g.lineWidth = r * 0.085;
    g.strokeStyle = farge;
    g.stroke();
    g.restore();
  }

  function tegnPlanet(g, n, r) {
    const kant = Math.max(1.4, r * 0.075);
    // Saturn and Uranus wear rings inside their circle: the ball itself is smaller.
    const k = n === 8 ? r * 0.64 : n === 7 ? r * 0.86 : n === 10 ? r * 0.84 : r - kant / 2;
    if (n === 8) ring(g, r - kant / 2, false, "#f6e2ae");
    if (n === 10) {
      // The Sun's corona: a soft glow and short, round-tipped rays
      const glod = g.createRadialGradient(0, 0, k * 0.9, 0, 0, r);
      glod.addColorStop(0, "rgba(255, 200, 70, 0.75)");
      glod.addColorStop(1, "rgba(255, 160, 40, 0)");
      g.fillStyle = glod;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.save();
      g.fillStyle = "rgba(255, 214, 92, 0.95)";
      for (let i = 0; i < 16; i++) {
        g.rotate(TAU / 16);
        g.beginPath();
        g.moveTo(-r * 0.07, -k * 0.96);
        g.quadraticCurveTo(0, -r * (i % 2 ? 0.98 : 1.04), r * 0.07, -k * 0.96);
        g.fill();
      }
      g.restore();
    }
    g.save();
    g.beginPath();
    g.arc(0, 0, k, 0, TAU);
    g.clip();
    const grunn = FARGE[n];
    rund(g, 0, 0, k, grunn);
    switch (n) {
      case 0:
        rund(g, -k * 0.05, k * 0.1, k * 0.95, "#8a7d74");
        krater(g, k, [[-0.35, -0.25, 0.26], [0.38, 0.22, 0.2], [-0.1, 0.5, 0.15], [0.3, -0.45, 0.12]], "#6d6159");
        break;
      case 1:
        krater(g, k, [[-0.3, -0.3, 0.22], [0.35, 0.05, 0.28], [-0.25, 0.42, 0.16], [0.15, -0.55, 0.1], [-0.6, 0.1, 0.1]], "#cfc7b0");
        break;
      case 2:
        krater(g, k, [[-0.4, -0.2, 0.2], [0.25, 0.35, 0.24], [0.4, -0.38, 0.14], [-0.15, 0.55, 0.12], [-0.05, -0.05, 0.1]], "#9a806c");
        break;
      case 3:
        g.fillStyle = "#c4462a";
        g.beginPath();
        g.ellipse(-k * 0.25, k * 0.15, k * 0.45, k * 0.2, 0.4, 0, TAU);
        g.ellipse(k * 0.4, -k * 0.2, k * 0.25, k * 0.14, -0.3, 0, TAU);
        g.fill();
        g.fillStyle = "#fff1dd";
        g.beginPath();
        g.ellipse(0, -k * 0.95, k * 0.55, k * 0.22, 0, 0, TAU);
        g.fill();
        break;
      case 4:
        g.strokeStyle = "#e3a64a";
        g.lineWidth = k * 0.14;
        g.lineCap = "round";
        for (const [y, s] of [[-0.45, 1], [0, -1], [0.45, 1]]) {
          g.beginPath();
          g.moveTo(-k, y * k);
          g.bezierCurveTo(-k * 0.3, (y - 0.25 * s) * k, k * 0.3, (y + 0.25 * s) * k, k, y * k);
          g.stroke();
        }
        break;
      case 5:
        g.fillStyle = "#4cc76a";
        g.beginPath();
        g.ellipse(-k * 0.35, -k * 0.2, k * 0.32, k * 0.42, 0.5, 0, TAU);
        g.ellipse(k * 0.42, k * 0.3, k * 0.28, k * 0.22, -0.4, 0, TAU);
        g.ellipse(k * 0.2, -k * 0.55, k * 0.18, k * 0.12, 0.2, 0, TAU);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.85)";
        g.lineWidth = k * 0.1;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(-k * 0.7, k * 0.45);
        g.quadraticCurveTo(-k * 0.2, k * 0.3, k * 0.1, k * 0.5);
        g.moveTo(k * 0.05, -k * 0.15);
        g.quadraticCurveTo(k * 0.4, -k * 0.3, k * 0.75, -k * 0.1);
        g.stroke();
        break;
      case 6:
        band(g, k, [[-0.55, 0.16, "#6b88f6"], [-0.1, 0.12, "#3a57d8"], [0.3, 0.18, "#6b88f6"]]);
        g.fillStyle = "#2a3fa8";
        g.beginPath();
        g.ellipse(-k * 0.3, k * 0.05, k * 0.2, k * 0.12, 0, 0, TAU);
        g.fill();
        break;
      case 7:
        band(g, k, [[-0.35, 0.18, "#a8f2ef"], [0.25, 0.14, "#6fd6d9"]]);
        break;
      case 8:
        band(g, k, [[-0.6, 0.18, "#d9ab5c"], [-0.2, 0.14, "#f6dc9a"], [0.15, 0.2, "#d9ab5c"], [0.55, 0.15, "#c99a4c"]]);
        break;
      case 9:
        band(g, k, [[-0.75, 0.22, "#c98a52"], [-0.4, 0.16, "#f3d8ae"], [-0.15, 0.2, "#c27b45"], [0.15, 0.14, "#f3d8ae"], [0.42, 0.2, "#c98a52"], [0.72, 0.2, "#b67444"]]);
        g.fillStyle = "#d1543a";
        g.beginPath();
        g.ellipse(k * 0.3, k * 0.28, k * 0.2, k * 0.12, 0, 0, TAU);
        g.fill();
        g.strokeStyle = BLEKK;
        g.lineWidth = Math.max(1, k * 0.03);
        g.stroke();
        break;
      case 10: {
        const sg = g.createRadialGradient(-k * 0.25, -k * 0.3, k * 0.1, 0, 0, k);
        sg.addColorStop(0, "#fff7c2");
        sg.addColorStop(0.55, "#ffd23f");
        sg.addColorStop(1, "#ff9f1c");
        g.fillStyle = sg;
        g.fillRect(-k, -k, 2 * k, 2 * k);
        krater(g, k, [[-0.3, 0.35, 0.08], [0.4, -0.1, 0.06], [0.1, 0.55, 0.05]], "rgba(255,140,30,0.55)");
        break;
      }
    }
    // Light from the upper left, shade to the lower right
    if (n !== 10) {
      const lys = g.createRadialGradient(-k * 0.4, -k * 0.45, k * 0.05, 0, 0, k * 1.05);
      lys.addColorStop(0, "rgba(255,255,255,0.32)");
      lys.addColorStop(0.5, "rgba(255,255,255,0)");
      lys.addColorStop(1, "rgba(10,4,30,0.38)");
      g.fillStyle = lys;
      g.fillRect(-k, -k, 2 * k, 2 * k);
    }
    g.restore();
    g.lineWidth = kant;
    g.strokeStyle = BLEKK;
    g.beginPath();
    g.arc(0, 0, k, 0, TAU);
    g.stroke();
    // A small shine
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath();
    g.ellipse(-k * 0.42, -k * 0.48, k * 0.16, k * 0.09, -0.7, 0, TAU);
    g.fill();
    if (n === 8) ring(g, r - kant / 2, true, "#f6e2ae");
    if (n === 7) {
      // Uranus lies on its side: a thin ring standing almost upright
      g.save();
      g.rotate(1.35);
      g.beginPath();
      g.ellipse(0, 0, r * 0.97, r * 0.22, 0, 0, Math.PI);
      g.lineWidth = r * 0.07;
      g.strokeStyle = BLEKK;
      g.stroke();
      g.lineWidth = r * 0.035;
      g.strokeStyle = "#e6fbff";
      g.stroke();
      g.restore();
    }
  }

  // A planet drawn once per size into a small canvas (sprites), so a frame only copies pictures.
  function lagSprite(n, r, dpr) {
    const k = document.createElement("canvas");
    const s = Math.ceil((r * 2 + 4) * dpr);
    k.width = s;
    k.height = s;
    const g = k.getContext("2d");
    g.scale(dpr, dpr);
    g.translate(r + 2, r + 2);
    tegnPlanet(g, n, r);
    return k;
  }

  // A row of planets, smallest to biggest (home and result screens). naadd: the biggest reached
  // (the others are dimmed), or -1 for all in colour.
  function tegnRekke(lerret, naadd) {
    const w = lerret.clientWidth;
    if (!w) return;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const h = Math.round(Math.min(56, Math.max(34, w / 8.2)));
    lerret.style.height = h + "px";
    lerret.width = Math.round(w * dpr);
    lerret.height = Math.round(h * dpr);
    const g = lerret.getContext("2d");
    g.scale(dpr, dpr);
    const N = Fys.RAD.length;
    const rr = Fys.RAD.map((r) => 0.3 + (0.7 * (r - Fys.RAD[0])) / (Fys.RAD[N - 1] - Fys.RAD[0]));
    const sum = rr.reduce((a, b) => a + b, 0);
    const skala = Math.min((w - 2) / (2 * sum + (N - 1) * 0.12), (h - 4) / 2);
    let x = (w - skala * (2 * sum + (N - 1) * 0.12)) / 2;
    for (let i = 0; i < N; i++) {
      const r = rr[i] * skala;
      g.save();
      g.translate(x + r, h / 2);
      if (naadd >= 0 && i > naadd) g.globalAlpha = 0.28;
      tegnPlanet(g, i, r);
      g.restore();
      x += 2 * r + 0.12 * skala;
    }
  }
  const rekkeHtml = (naadd) =>
    `<canvas class="pl-rekke" data-naadd="${naadd}" role="img" aria-label="${esc(
      naadd >= 0
        ? R.t("Planetene du nådde: {liste}", { liste: Fys.NAVN.slice(0, naadd + 1).join(", ") })
        : R.t("Fra minst til størst: {liste}", { liste: Fys.NAVN.join(", ") }),
    )}"></canvas>`;
  function tegnRekker(rot) {
    for (const el of R.$$(".pl-rekke", rot)) tegnRekke(el, Number(el.dataset.naadd));
  }

  // ---------- The game ----------

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  function nyttSpill(S) {
    const st = Fys.nytt(R.nyttFro());
    S.spill = { st, status: "spiller", ferdig: false, resultat: null, tid: 0 };
    R.statistikk("start", {});
  }

  class Motor {
    constructor(S, rot) {
      this.S = S;
      this.flate = R.$(".pl-flate", rot);
      this.lerret = R.$(".pl-lerret", rot);
      this.ctx = this.lerret.getContext("2d");
      this.nesteLerret = R.$(".pl-neste canvas", rot);
      this.s = 1;
      this.klokke = { akk: 0 };
      this.sist = performance.now();
      this.partikler = [];
      this.tekster = [];
      this.bolger = [];
      this.taster = { v: false, h: false };
      this.sikter = false;
      this.slutt = null;
      this.levende = true;
      this.sistDunk = 0;
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
    tilpass() {
      const w = this.flate.clientWidth;
      const h = this.flate.clientHeight;
      if (!w || !h) return;
      const s = Math.max(0.5, Math.min((w - 10) / Fys.W, (h - 10) / Fys.H));
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      this.s = s;
      this.dpr = dpr;
      this.lerret.style.width = Math.round(Fys.W * s) + "px";
      this.lerret.style.height = Math.round(Fys.H * s) + "px";
      this.lerret.width = Math.round(Fys.W * s * dpr);
      this.lerret.height = Math.round(Fys.H * s * dpr);
      this.sprites = Fys.RAD.map((r, n) => lagSprite(n, r * s, dpr));
      this.bakgrunn = null;
      this.tegnNeste();
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
      bg.addColorStop(0, "#160b33");
      bg.addColorStop(1, "#24124a");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // Stars from a fixed seed: the same sky every time
      const t = R.rng(7);
      for (let i = 0; i < 70; i++) {
        const r = (0.4 + t() * 1.1) * this.dpr * Math.max(0.8, this.s);
        g.globalAlpha = 0.25 + t() * 0.6;
        g.fillStyle = i % 9 === 0 ? "#ffd23f" : "#fff1dd";
        g.beginPath();
        g.arc(t() * w, t() * h, r, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      // A faint glow at the bottom of the jar
      const glod = g.createRadialGradient(w / 2, h * 1.05, 0, w / 2, h * 1.05, h * 0.6);
      glod.addColorStop(0, "rgba(255,179,92,0.18)");
      glod.addColorStop(1, "rgba(255,179,92,0)");
      g.fillStyle = glod;
      g.fillRect(0, 0, w, h);
      this.bakgrunn = k;
    }
    tegnNeste() {
      const el = this.nesteLerret;
      const sp = this.S.spill;
      if (!el || !sp) return;
      const w = el.clientWidth || 34;
      const dpr = this.dpr || 1;
      el.width = Math.round(w * dpr);
      el.height = Math.round(w * dpr);
      const g = el.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, w);
      const n = sp.st.neste;
      const r = (w / 2 - 2) * (0.55 + (0.45 * n) / 4);
      g.translate(w / 2, w / 2);
      tegnPlanet(g, n, r);
      el.parentElement.setAttribute("aria-label", R.t("Neste: {planet}", { planet: Fys.NAVN[n] }));
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
        // Held arrow keys move the aim smoothly
        const retning = (this.taster.h ? 1 : 0) - (this.taster.v ? 1 : 0);
        if (retning) st.sikte = Fys.klampX(st.hold, st.sikte + retning * 240 * (dt / 1000));
        sp.tid += dt;
        const n = Fys.stegFor(this.klokke, dt);
        for (let i = 0; i < n && sp.status === "spiller"; i++) {
          for (const h of Fys.steg(st)) this.hendelse(h);
        }
        alfa = this.klokke.akk;
      }
      this.tegn(alfa, na);
      const vaken = !!(sp && sp.status === "spiller");
      if (vaken !== this.vaken) {
        this.vaken = vaken;
        if (vaken) R.holdVaken();
        else R.slippVaken();
      }
      const liv = sp && (sp.status === "spiller" || (this.slutt && na - this.slutt < 1600) || this.partikler.length || this.tekster.length);
      if (liv) this.id = requestAnimationFrame(this.ramme);
    }
    hendelse(h) {
      const S = this.S;
      if (h.type === "slatt") {
        this.sprut(h.x, h.y, h.n, 12 + h.n * 2);
        this.tekster.push({ x: h.x, y: h.y, tekst: "+" + h.poeng, start: performance.now() });
        R.lyd.tone(330 * Math.pow(1.12, h.n), 0, 0.12, "sine", 0.18 + h.n * 0.01, 520 * Math.pow(1.12, h.n));
        R.vibrer(h.n >= 6 ? 22 : 10);
        oppdaterHud(S);
        if (h.n === Fys.SIST) {
          R.lyd.fanfare();
          R.merke("arkade-planeten");
          R.si(R.t("Du laget sola!"));
        }
      } else if (h.type === "nova") {
        this.sprut(h.x, h.y, Fys.SIST, 40);
        this.tekster.push({ x: h.x, y: h.y, tekst: "+" + h.poeng, start: performance.now() });
        R.lyd.fanfare();
        if (!R.rolig()) R.konfetti();
        R.vibrer([30, 40, 60]);
        oppdaterHud(S);
      } else if (h.type === "dunk") {
        const na = performance.now();
        if (na - this.sistDunk > 70) {
          this.sistDunk = na;
          R.lyd.tone(Math.max(90, 260 - h.n * 16), 0, 0.09, "sine", Math.min(0.22, h.styrke / 3000), Math.max(60, 180 - h.n * 12));
        }
      } else if (h.type === "over") {
        tapt(S, this);
      }
    }
    sprut(x, y, n, antall) {
      if (R.rolig()) return;
      const na = performance.now();
      const r = Fys.RAD[n];
      for (let i = 0; i < antall; i++) {
        const v = (i / antall) * TAU + Math.random() * 0.3;
        const f = 0.6 + Math.random() * 0.8;
        this.partikler.push({ x, y, vx: Math.cos(v) * f, vy: Math.sin(v) * f, r: 1.4 + Math.random() * 2.2, d: r * 0.9 + 22, farge: i % 3 ? FARGE[n] : "#fff1dd", start: na, liv: 420 + Math.random() * 260 });
      }
      this.bolger.push({ x, y, r, start: na, farge: FARGE[n] });
    }
    tegn(alfa, na) {
      const S = this.S;
      const sp = S.spill;
      const ctx = this.ctx;
      if (!sp) return;
      const st = sp.st;
      const s = this.s;
      if (!this.bakgrunn) this.lagBakgrunn();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.bakgrunn, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // The line: dashed, and red and pulsing while something is above it
      const fare = st.fare > 0 && !st.over;
      ctx.save();
      ctx.setLineDash([7 * s, 6 * s]);
      ctx.lineWidth = Math.max(1.5, 2.4 * s);
      ctx.strokeStyle = fare ? `rgba(255,90,78,${0.55 + 0.45 * Math.abs(Math.sin(na / 140))})` : "rgba(255,241,221,0.32)";
      ctx.beginPath();
      ctx.moveTo(0, Fys.LINJE * s);
      ctx.lineTo(Fys.W * s, Fys.LINJE * s);
      ctx.stroke();
      ctx.restore();
      if (fare && !R.rolig()) {
        const andel = Math.min(1, st.fare / Fys.FARE);
        ctx.fillStyle = `rgba(255,90,78,${0.06 + 0.14 * andel})`;
        ctx.fillRect(0, 0, Fys.W * s, Fys.LINJE * s);
      }
      // The hanging planet, its fall line and where it lands
      if (sp.status !== "over" && !this.slutt) {
        const n = st.hold;
        const x = Fys.klampX(n, st.sikte);
        const inn = 1 - st.pust / Fys.PUST;
        const skala = R.rolig() ? 1 : 1 - Math.pow(1 - inn, 3);
        if (inn > 0.2) {
          const y = Fys.lander(st, x);
          ctx.save();
          ctx.globalAlpha = 0.5 * inn;
          ctx.setLineDash([2 * s, 6 * s]);
          ctx.lineCap = "round";
          ctx.lineWidth = Math.max(1.5, 2 * s);
          ctx.strokeStyle = "#fff1dd";
          ctx.beginPath();
          ctx.moveTo(x * s, (Fys.HENG + Fys.RAD[n]) * s);
          ctx.lineTo(x * s, (y - Fys.RAD[n]) * s);
          ctx.stroke();
          ctx.setLineDash([4 * s, 4 * s]);
          ctx.globalAlpha = 0.35 * inn;
          ctx.beginPath();
          ctx.arc(x * s, y * s, Fys.RAD[n] * s - 1, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        this.tegnSprite(n, x, Fys.HENG, 0, skala);
      }
      // The planets, between the last two steps
      const rist = this.slutt && !R.rolig() ? Math.max(0, 1 - (na - this.slutt) / 600) * 4 : 0;
      for (const b of st.b) {
        const x = b.px + (b.x - b.px) * alfa + (rist ? (Math.random() - 0.5) * rist : 0);
        const y = b.py + (b.y - b.py) * alfa;
        const skala = Fys.radius(b) / Fys.RAD[b.n];
        this.tegnSprite(b.n, x, y, b.n === 7 || b.n === 8 ? 0 : b.a, skala);
        if (this.slutt && b.y - Fys.radius(b) < Fys.LINJE) {
          ctx.save();
          ctx.globalAlpha = 0.45 + 0.35 * Math.sin(na / 90);
          ctx.strokeStyle = "#ff5a4e";
          ctx.lineWidth = 3 * s;
          ctx.beginPath();
          ctx.arc(x * s, y * s, Fys.radius(b) * s + 2, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }
      this.tegnEffekter(na);
    }
    tegnSprite(n, x, y, vinkel, skala) {
      const ctx = this.ctx;
      const sp = this.sprites[n];
      const s = this.s;
      const half = sp.width / this.dpr / 2;
      ctx.save();
      ctx.translate(x * s, y * s);
      if (vinkel) ctx.rotate(vinkel);
      if (skala !== 1) ctx.scale(skala, skala);
      ctx.drawImage(sp, -half, -half, half * 2, half * 2);
      ctx.restore();
    }
    tegnEffekter(na) {
      const ctx = this.ctx;
      const s = this.s;
      this.bolger = this.bolger.filter((b) => na - b.start < 450);
      for (const b of this.bolger) {
        const a = (na - b.start) / 450;
        ctx.globalAlpha = 1 - a;
        ctx.strokeStyle = b.farge;
        ctx.lineWidth = 3 * s * (1 - a) + 1;
        ctx.beginPath();
        ctx.arc(b.x * s, b.y * s, (b.r + 6 + a * 26) * s, 0, TAU);
        ctx.stroke();
      }
      this.partikler = this.partikler.filter((p) => na - p.start < p.liv);
      for (const p of this.partikler) {
        const a = (na - p.start) / p.liv;
        const e = 1 - Math.pow(1 - a, 2);
        ctx.globalAlpha = 1 - a;
        ctx.fillStyle = p.farge;
        ctx.beginPath();
        ctx.arc((p.x + p.vx * e * p.d) * s, (p.y + p.vy * e * p.d) * s, p.r * s * (1 - a * 0.5), 0, TAU);
        ctx.fill();
      }
      this.tekster = this.tekster.filter((p) => na - p.start < 900);
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      for (const p of this.tekster) {
        const a = (na - p.start) / 900;
        ctx.globalAlpha = a < 0.7 ? 1 : (1 - a) / 0.3;
        ctx.font = `900 ${Math.round(20 * s)}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
        ctx.lineWidth = Math.max(3, 4 * s);
        ctx.strokeStyle = BLEKK;
        const y = (p.y - 6 - a * 30) * s;
        ctx.strokeText(p.tekst, p.x * s, y);
        ctx.fillStyle = "#ffd23f";
        ctx.fillText(p.tekst, p.x * s, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // The jar is full: the board stays a moment with the culprits marked, then the result.
  function tapt(S, m) {
    const sp = S.spill;
    sp.status = "over";
    m.slutt = performance.now();
    R.lyd.tone(330, 0, 0.5, "sine", 0.2, 140);
    R.vibrer([60, 40, 90]);
    const ramme = R.$(".pl-ramme");
    if (ramme && !R.rolig()) ramme.classList.add("risting");
    ferdigstill(S);
    R.lagre();
    visStatus(S);
    R.si(R.t("Glasset er fullt! {poeng}.", { poeng: R.flertall(sp.st.poeng, "poeng", "poeng") }));
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && S.spill === sp && R.gaTil("slutt"), R.rolig() ? 900 : 1700);
  }

  function ferdigstill(S) {
    const sp = S.spill;
    if (sp.ferdig) return;
    sp.ferdig = true;
    const st = sp.st;
    const gml = S.rekord || 0;
    const gmlStorst = S.storst || 0;
    sp.resultat = { poeng: st.poeng, storst: st.storst, slatt: st.slatt, soler: st.soler, gml, nyRekord: st.poeng > gml && gml > 0, forste: !gml && st.poeng > 0, nyPlanet: st.storst > gmlStorst && S.spilt > 0 };
    if (st.poeng > gml) S.rekord = st.poeng;
    if (st.storst > gmlStorst) S.storst = st.storst;
    S.sist = { poeng: st.poeng, storst: st.storst };
    S.spilt = (S.spilt || 0) + 1;
    R.statistikk("ferdig", { poeng: st.poeng, storst: st.storst, sek: Math.round(sp.tid / 1000) });
  }

  function slipp(S) {
    const sp = S.spill;
    if (!sp || sp.status !== "spiller" || !motor) return;
    const b = Fys.slipp(sp.st, sp.st.sikte);
    if (!b) return;
    R.lyd.tone(520 - b.n * 40, 0, 0.06, "triangle", 0.1, 380 - b.n * 30);
    if (motor) motor.tegnNeste();
    R.lagre();
  }

  function pause(S, pa) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.status === "over") return;
    if (pa && sp.status === "spiller") {
      sp.status = "pause";
      if (motor) {
        motor.sikter = false;
        motor.taster = { v: false, h: false };
      }
      R.lagre();
      visStatus(S);
    } else if (!pa && sp.status === "pause") {
      sp.status = "spiller";
      if (motor) {
        motor.klokke.akk = 0;
        motor.vekk();
      }
      visStatus(S);
    }
  }

  function oppdaterHud(S) {
    const sp = S.spill;
    if (!sp) return;
    const p = R.$("#pl-poeng");
    if (p) p.textContent = R.tall(sp.st.poeng);
    const b = R.$("#pl-beste");
    if (b) b.textContent = R.tall(Math.max(S.rekord || 0, sp.st.poeng));
  }

  function visStatus(S) {
    const sp = S.spill;
    const el = R.$(".pl-status");
    if (!el || !sp) return;
    const knapp = R.$('[data-h="pause"]');
    if (knapp) {
      knapp.setAttribute("aria-label", sp.status === "pause" ? R.t("Fortsett") : R.t("Pause"));
      knapp.classList.toggle("pauset", sp.status === "pause");
    }
    if (sp.status === "pause") {
      el.hidden = false;
      el.className = "pl-status";
      el.innerHTML = `<div class="pl-statuskort"><p class="etikett">${esc(R.t("Pause"))}</p><p class="pl-stor">${esc(R.t("Planetene venter"))}</p>${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}${R.ui.lenke(R.t("Start på nytt"), "ny")}</div>`;
    } else if (sp.status === "over") {
      el.hidden = false;
      el.className = "pl-status over";
      el.innerHTML = `<div class="pl-statuskort over"><p class="pl-stor">${esc(R.t("Glasset er fullt!"))}</p><p>${esc(R.flertall(sp.st.poeng, "poeng", "poeng"))}</p></div>`;
    } else {
      el.hidden = true;
      el.innerHTML = "";
    }
  }

  // ---------- Steering: drag to aim, let go to drop; or arrows and space ----------

  function bindKontroll(S, rot) {
    const flate = R.$(".pl-flate", rot);
    if (!flate) return;
    let finger = null;
    const tilX = (e) => {
      const b = motor.lerret.getBoundingClientRect();
      return ((e.clientX - b.left) / b.width) * Fys.W;
    };
    const ned = (e) => {
      const sp = R.S.spill;
      if (!motor || !sp || sp.status !== "spiller") return;
      if (e.target.closest("button, a") || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      R.lyd.lasOpp();
      finger = e.pointerId;
      motor.sikter = true;
      sp.st.sikte = Fys.klampX(sp.st.hold, tilX(e));
      try {
        flate.setPointerCapture(e.pointerId);
      } catch (x) {
        /* not supported */
      }
    };
    const flytt = (e) => {
      const sp = R.S.spill;
      if (!motor || !sp || sp.status !== "spiller") return;
      // A mouse aims just by hovering; a finger while it is down.
      if (finger === e.pointerId || (e.pointerType === "mouse" && finger === null)) sp.st.sikte = Fys.klampX(sp.st.hold, tilX(e));
    };
    const opp = (e) => {
      if (finger !== e.pointerId) return;
      finger = null;
      const S2 = R.S;
      if (motor) motor.sikter = false;
      if (e.type === "pointerup" && S2.spill && S2.spill.status === "spiller") {
        S2.spill.st.sikte = Fys.klampX(S2.spill.st.hold, tilX(e));
        slipp(S2);
      }
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    flate.addEventListener("pointerdown", ned);
    flate.addEventListener("pointermove", flytt);
    flate.addEventListener("pointerup", opp);
    flate.addEventListener("pointercancel", opp);
    flate.addEventListener("touchmove", nei, { passive: false });
    flate.addEventListener("gesturestart", nei);
    flate.addEventListener("contextmenu", nei);
    R.vedForlat(() => {
      flate.removeEventListener("pointerdown", ned);
      flate.removeEventListener("pointermove", flytt);
      flate.removeEventListener("pointerup", opp);
      flate.removeEventListener("pointercancel", opp);
      flate.removeEventListener("touchmove", nei, { passive: false });
      flate.removeEventListener("gesturestart", nei);
      flate.removeEventListener("contextmenu", nei);
    });
  }

  const PILER = { ArrowLeft: "v", ArrowRight: "h", a: "v", d: "h" };
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.skjerm === "slutt" && (e.key === "Enter" || e.key === " ") && e.target === document.body) {
      e.preventDefault();
      return H.igjen(null, e, S);
    }
    if (S.skjerm !== "spill") return;
    // Keys go to the game unless a control has focus (then Space and Enter press that control).
    const m = e.target;
    const fritt = !(m && m.closest && m.closest("button, a, input, textarea, select, [contenteditable]"));
    if (!fritt && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const sp = S.spill;
    const pil = PILER[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (pil) {
      e.preventDefault();
      if (motor && sp.status === "spiller") motor.taster[pil] = true;
    } else if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
      e.preventDefault();
      if (!e.repeat && sp.status === "spiller") slipp(S);
    } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      e.preventDefault();
      pause(S, sp.status !== "pause");
    }
  });
  document.addEventListener("keyup", (e) => {
    const pil = PILER[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (pil && motor) motor.taster[pil] = false;
  });

  // Hidden tab, locked phone or another app: pause at once.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "spill") pause(S, true);
  });
  window.addEventListener("blur", () => {
    const S = R.S;
    if (S && S.skjerm === "spill") pause(S, true);
  });

  const fastSide = (pa) => document.documentElement.classList.toggle("pl-fast", !!pa);
  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>';

  function gyldig(sp) {
    if (!sp || typeof sp !== "object" || !sp.st || typeof sp.st !== "object") return false;
    const st = sp.st;
    const n = (v) => Number.isInteger(v) && v >= 0 && v <= Fys.SIST;
    const tall = (v) => typeof v === "number" && Number.isFinite(v);
    if (!Array.isArray(st.b) || st.b.length > 200 || !n(st.hold) || !n(st.neste) || !tall(st.poeng) || !tall(st.fro)) return false;
    return st.b.every((b) => b && n(b.n) && ["x", "y", "px", "py", "vx", "vy", "a", "w", "alder", "vokser"].every((k) => tall(b[k])));
  }

  // ---------- Start ----------

  R.start({
    id: "planeten",
    versjon: 1,
    pagar,

    tilstand: () => ({ rekord: 0, storst: 0, sist: null, spilt: 0, spill: null }),

    lastet(S) {
      S.rekord = Number.isFinite(S.rekord) && S.rekord > 0 ? Math.floor(S.rekord) : 0;
      S.storst = Number.isInteger(S.storst) && S.storst >= 0 && S.storst <= Fys.SIST ? S.storst : 0;
      S.spilt = Number.isInteger(S.spilt) && S.spilt >= 0 ? S.spilt : 0;
      if (S.sist && !(Number.isFinite(S.sist.poeng) && Number.isInteger(S.sist.storst))) S.sist = null;
      const sp = S.spill;
      if (sp) {
        if (!gyldig(sp)) S.spill = null;
        else {
          sp.tid = Number(sp.tid) || 0;
          // Back after a reload: a game in motion waits in pause.
          if (sp.status === "spiller") sp.status = "pause";
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
      intro: R.t("Slipp planeter ned i glasset. Når to like planeter treffer hverandre, smelter de sammen til den neste og større planeten."),
      steg: [
        [R.t("Sikt"), R.t("Dra fingeren til siden, eller bruk piltastene. Den prikkete streken viser hvor planeten lander.")],
        [R.t("Slipp"), R.t("Slipp fingeren – eller trykk på mellomrom – så faller planeten.")],
        [R.t("Slå sammen"), R.t("To like blir én større: asteroide, månen, Merkur, Mars, Venus, jorda, Neptun, Uranus, Saturn, Jupiter – og til slutt sola.")],
      ],
      tips: [
        R.t("Blir noe liggende over den stiplede streken i noen sekunder, er glasset fullt og spillet slutt."),
        R.t("Se på «Neste» øverst, så kan du planlegge hvor den neste planeten skal."),
        R.t("Samle de store planetene i ett hjørne, og bygg mot dem."),
        R.t("To soler blir en supernova – og masse poeng."),
        R.t("Planetene kommer i riktig rekkefølge etter størrelse: Merkur er den minste planeten, Jupiter den største."),
        R.t("Spillet tar pause av seg selv hvis du bytter app. P eller Esc gir pause med tastatur."),
        R.t("Planeten går i sanntid og kan dessverre ikke spilles med skjermleser."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const linjer = [];
          if (S.rekord) linjer.push(`<li><b>${esc(R.t("Rekord"))}</b> ${esc(R.tall(S.rekord))}</li>`);
          if (S.spilt) linjer.push(`<li><b>${esc(R.t("Størst"))}</b> ${esc(Fys.NAVN[S.storst])}</li>`);
          if (S.sist) linjer.push(`<li><b>${esc(R.t("Sist"))}</b> ${esc(R.flertall(S.sist.poeng, "poeng", "poeng"))}</li>`);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("To like planeter blir én større."))}<br><em>${esc(R.t("Klarer du å lage sola?"))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · {stilling}", { stilling: R.flertall(sp.st.poeng, "poeng", "poeng") }) : "",
                // The record line and the eleven planets in order, right under the buttons.
                ekstraHtml:
                  R.ui.lenkerad(R.ui.lenke(R.t("Slik spiller du"), "regler")) +
                  (linjer.length ? `<section class="pl-rekorder" aria-label="${esc(R.t("Dine resultater"))}"><ul>${linjer.join("")}</ul></section>` : "") +
                  `<div class="pl-hjemrekke">${rekkeHtml(-1)}</div>`,
              }),
              merker: [
                ["11", R.t("planeter")],
                ["1", R.t("finger")],
                ["0", R.t("reklame")],
              ],
            })
          );
        },
        etter: (S, rot) => tegnRekker(rot),
        inn: () => R.slippVaken(),
      },

      spill: {
        tittel: () => R.t("Planeten"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Planeten"))}</h1>
            <div class="pl-spill">
              <div class="pl-hud">
                <span class="pl-stat"><small>${esc(R.t("Poeng"))}</small><b id="pl-poeng">${esc(R.tall(sp.st.poeng))}</b></span>
                <span class="pl-stat"><small>${esc(R.t("Rekord"))}</small><b id="pl-beste">${esc(R.tall(Math.max(S.rekord || 0, sp.st.poeng)))}</b></span>
                <span class="pl-stat pl-neste" role="img" aria-label="${esc(R.t("Neste: {planet}", { planet: Fys.NAVN[sp.st.neste] }))}"><small aria-hidden="true">${esc(R.t("Neste"))}</small><canvas aria-hidden="true"></canvas></span>
                <button class="pl-pause${sp.status === "pause" ? " pauset" : ""}" data-h="pause" aria-label="${esc(sp.status === "pause" ? R.t("Fortsett") : R.t("Pause"))}">${PAUSE}</button>
              </div>
              <div class="pl-flate">
                <div class="pl-ramme">
                  <canvas class="pl-lerret" role="img" aria-label="${esc(R.t("Glasset med planetene"))}"></canvas>
                  <div class="pl-status" hidden></div>
                </div>
              </div>
              <p class="pl-hint"><span class="pl-finger">${esc(R.t("Dra for å sikte – slipp, så faller planeten."))}</span><span class="pl-tast">${esc(R.t("Piltaster sikter · mellomrom slipper · P = pause"))}</span></p>
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
          if (sp && sp.status === "spiller") sp.status = "pause";
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: () => R.t("Planeten"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { poeng: sp.st.poeng, storst: sp.st.storst };
          const tittel = r.nyRekord ? R.t("Ny rekord!") : r.storst === Fys.SIST ? R.t("Du laget sola!") : r.poeng >= 1000 ? R.t("Godt jobba!") : R.t("Godt forsøk!");
          const linje = r.nyRekord
            ? R.t("Ny personlig rekord! Forrige: {n}.", { n: R.tall(r.gml) })
            : r.forste
              ? R.t("Første runde – nå har du en rekord å slå!")
              : r.gml
                ? R.t("Rekorden din er {n}.", { n: R.tall(Math.max(r.gml, r.poeng)) })
                : R.t("Prøv igjen – glasset er tomt og klart.");
          const stor = r.nyRekord || r.storst >= 9 || r.poeng >= 1500;
          return `
            ${R.ui.banner({ tittel, etikett: R.t("Glasset er fullt"), stemning: stor ? "jubel" : "" })}
            <div class="pl-resultat">
              <div class="pl-tall${r.nyRekord ? " ny" : ""}"><b>${esc(R.tall(r.poeng))}</b><span>${esc(R.t("poeng|poeng", { n: r.poeng }))}</span>${r.nyRekord ? `<i class="pl-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="pl-tall"><b class="pl-navn">${esc(Fys.NAVN[r.storst])}</b><span>${esc(R.t("Største planet"))}</span>${r.nyPlanet ? `<i class="pl-ny">${esc(R.t("Ny!"))}</i>` : ""}</div>
            </div>
            ${rekkeHtml(r.storst)}
            <p class="hjelp">${esc(linje)}</p>
            <div class="pl-del">${R.ui.knapp2(R.t("Del resultatet"), "del")}</div>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(`<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        etter: (S, rot) => tegnRekker(rot),
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if (r.nyRekord || r.storst === Fys.SIST || r.poeng >= 2000) {
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
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig && S.spill.st.slipp > 0))) || !fortsatt()) return;
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
      pause: (el, e, S) => pause(S, S.spill.status !== "pause"),
      "fortsett-spill": (el, e, S) => pause(S, false),
      ny(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      del(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.resultat;
        if (!r) return;
        const poeng = R.flertall(r.poeng, "poeng", "poeng");
        const planet = R.t("Største planet: {planet}", { planet: Fys.NAVN[r.storst] });
        const tekst = `🪐 ${R.t("Planeten")} · ${poeng} · ${planet}. ${R.t("Klarer du å lage sola?")}`;
        R.del(R.t("Planeten"), tekst, ADRESSE, { kort: { tittel: R.t("Planeten"), linjer: [poeng, planet] } });
      },
    }),
  });
})();
