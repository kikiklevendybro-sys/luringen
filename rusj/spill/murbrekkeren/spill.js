/* Murbrekkeren — brick breaker.
   A paddle at the bottom, a ball, and a wall of bricks. Drag anywhere on the board (or under it)
   to move the paddle, let go to send the ball; arrow keys and space work too. Twelve levels, then
   they come round again, faster. Hard bricks take two hits, steel never breaks, and bricks with a
   star drop a capsule: a wider paddle, two extra balls, a slower ball or an extra life. Three balls.

   ---------- The rules (Mur, pure, unit-tested in test/murbrekkeren.test.mjs) ----------
   Fixed steps of 1/120 s (the screen interpolates), so the game is the same at any frame rate. At
   the top speed (350) the ball moves 2.9 units a step, less than its radius (5), and bricks are 13 high,
   so nothing is ever jumped over. The ball moves one axis at a time: a brick hit while moving
   sideways turns it sideways, a brick hit while moving up or down turns it up or down (two bricks
   at once break together, the ball turns once). The paddle sends the ball off at an angle set by
   where it lands: straight up in the middle, up to 60° at the ends, so the player aims. Every
   paddle hit speeds the ball up a little, up to the level's top speed; each level starts a little
   faster (215 → 300 units a second). The capsules and the launch angle come from a seed kept in
   the state (mulberry32). Unit tests let an autopilot clear all twelve levels. */
(function () {
  "use strict";

  const Rt = { t: (s) => (window.Rusj && window.Rusj.t ? window.Rusj.t(s) : s) };

  const Mur = (() => {
    const W = 300;
    const H = 420;
    const TOPP = 38;
    const KOL = 10;
    const CW = 30;
    const CH = 16;
    const BW = 28;
    const BH = 13;
    const PY = H - 36; // the top of the paddle
    const PH = 10;
    const PB = 62;
    const PB_BRED = 96;
    const BR = 5;
    const HZ = 120;
    const DT = 1 / HZ;
    const VINKEL = (60 * Math.PI) / 180;
    const KAPSEL_FART = 85;
    const LIV = 3;
    const LIV_MAKS = 5;
    // [name, rows]. . empty · 1–6 a brick of that colour · H hard (two hits) · S steel · + a brick with a capsule
    const BRETT = [
      [Rt.t("Muren"), ["1111111111", "222+222222", "333333+333"]],
      [Rt.t("Pila"), ["1........1", "22......22", "333....333", "4444..4444", "555+55+555", ".66666666.", "..111111.."]],
      [Rt.t("Sjakkbrettet"), ["1.2.3.4.5.", ".2.3.4.5.6", "1.2.+.4.5.", ".2.3.4.5.6", "1.2.3.4.+.", ".2.3.4.5.6"]],
      [Rt.t("Hjertet"), [".11....11.", "1111..1111", "11111+1111", ".11111111.", "..111+11..", "...1111...", "....11...."]],
      [Rt.t("Festningen"), ["HHHHHHHHHH", "H33333333H", "H3+3333+3H", "H33333333H", "HHHH..HHHH"]],
      [Rt.t("Fisken"), ["...5555...", ".55555555.", "55.555555.", "55555+5555", ".55555555.", "...5555..5", "........55"]],
      [Rt.t("Raketten"), ["....66....", "...6666...", "...6+66...", "...6666...", "..666666..", ".66.66.66.", "6...HH...6", "...3..3..."]],
      [Rt.t("Diamanten"), ["....HH....", "...H22H...", "..H2222H..", ".H22+222H.", "..H2222H..", "...H22H...", "....HH...."]],
      [Rt.t("Labyrinten"), ["1111111111", "..SS..SS..", "2222+22222", "S...SS...S", "3333333+33", "..S....S.."]],
      [Rt.t("Regnbuen"), ["..111111..", ".22222222.", "333.++.333", "44..55..44", "5..6666..5", "..66..66.."]],
      [Rt.t("Borgen"), ["S.S....S.S", "SSS.HH.SSS", "S3S4444S3S", "S3S4+44S3S", "S3S4444S3S", "SHHHHHHHHS"]],
      [Rt.t("Finalen"), ["HHHHHHHHHH", "1234561234", "HHH+HH+HHH", "5612345612", "HHHHHHHHHH", "S...SS...S"]],
    ];
    const KRAFTER = [
      ["bred", 35],
      ["multi", 30],
      ["sakte", 25],
      ["liv", 10],
    ];

    function tilf(st) {
      const a = (st.fro + 0x6d2b79f5) | 0;
      st.fro = a >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    const grunnfart = (nr) => Math.min(300, 215 + 9 * (nr - 1));
    const toppfart = (nr) => grunnfart(nr) + 50;
    const monster = (nr) => BRETT[(nr - 1) % BRETT.length];

    // The bricks of a level: [{ k, r, x, y, type, hp, farge, kraft }]
    function lagBrett(st, nr) {
      const [, rader] = monster(nr);
      const ut = [];
      rader.forEach((rad, r) => {
        for (let k = 0; k < KOL; k++) {
          const c = rad[k];
          if (!c || c === ".") continue;
          const x = k * CW + (CW - BW) / 2;
          const y = TOPP + r * CH;
          const b = { k, r, x, y, type: "vanlig", hp: 1, farge: ((r % 6) + 1) | 0, kraft: null };
          if (c >= "1" && c <= "6") b.farge = Number(c);
          else if (c === "H") Object.assign(b, { type: "hard", hp: 2, farge: 0 });
          else if (c === "S") Object.assign(b, { type: "stal", hp: -1, farge: 0 });
          else if (c === "+") {
            let x2 = tilf(st) * 100;
            for (const [navn, vekt] of KRAFTER) {
              x2 -= vekt;
              if (x2 < 0) {
                b.kraft = navn;
                break;
              }
            }
            b.kraft = b.kraft || "bred";
          }
          ut.push(b);
        }
      });
      return ut;
    }

    const igjen = (st) => st.steiner.filter((b) => b.type !== "stal" && b.hp > 0).length;

    function venteBall(st) {
      return { x: st.padX, y: PY - BR - 0.5, px: st.padX, py: PY - BR - 0.5, vx: 0, vy: 0 };
    }

    function startBrett(st, nr) {
      st.brett = nr;
      st.steiner = lagBrett(st, nr);
      st.fart = grunnfart(nr);
      st.baller = [venteBall(st)];
      st.venter = true;
      st.kapsler = [];
      st.bredTid = 0;
      st.sakteTid = 0;
      st.padW = PB;
      st.klart = false;
    }

    function nytt(fro, nr = 1) {
      const st = { fro: fro >>> 0, brett: nr, start: nr, poeng: 0, liv: LIV, padX: W / 2, padW: PB, n: 0, over: false, klart: false, knust: 0, steiner: [], baller: [], kapsler: [] };
      startBrett(st, nr);
      return st;
    }

    const klampPad = (st, x) => Math.min(W - st.padW / 2, Math.max(st.padW / 2, x));
    // The paddle goes where the finger is (the screen calls this between steps).
    function styr(st, x) {
      st.padX = klampPad(st, x);
      if (st.venter) for (const b of st.baller) b.x = b.px = st.padX;
    }

    // Send the waiting ball off: up, a little to one side.
    function skyt(st) {
      if (!st.venter || st.over || st.klart) return false;
      st.venter = false;
      const v = (tilf(st) * 2 - 1) * 0.35;
      const b = st.baller[0];
      b.vx = st.fart * Math.sin(v);
      b.vy = -st.fart * Math.cos(v);
      return true;
    }

    const overlapp = (b, s) => b.x + BR > s.x && b.x - BR < s.x + BW && b.y + BR > s.y && b.y - BR < s.y + BH;

    function slaa(st, s, ut) {
      if (s.type === "stal") {
        ut.push({ type: "stal", x: s.x + BW / 2, y: s.y + BH / 2 });
        return;
      }
      s.hp--;
      st.poeng += 10;
      if (s.hp > 0) {
        ut.push({ type: "sprekk", x: s.x + BW / 2, y: s.y + BH / 2 });
        return;
      }
      st.knust++;
      if (s.type === "hard") st.poeng += 10;
      ut.push({ type: "knust", x: s.x + BW / 2, y: s.y + BH / 2, farge: s.farge, hard: s.type === "hard" });
      if (s.kraft) st.kapsler.push({ x: s.x + BW / 2, y: s.y + BH / 2, py: s.y + BH / 2, type: s.kraft });
    }

    // Moves the ball along one axis and bounces it off walls and bricks.
    function flytt(st, b, akse, d, ut) {
      if (akse === "x") {
        b.x += d;
        if (b.x < BR) {
          b.x = BR;
          b.vx = Math.abs(b.vx);
          ut.push({ type: "vegg" });
        } else if (b.x > W - BR) {
          b.x = W - BR;
          b.vx = -Math.abs(b.vx);
          ut.push({ type: "vegg" });
        }
      } else {
        b.y += d;
        if (b.y < BR) {
          b.y = BR;
          b.vy = Math.abs(b.vy);
          ut.push({ type: "vegg" });
        }
      }
      const treff = st.steiner.filter((s) => s.hp !== 0 && overlapp(b, s));
      if (!treff.length) return;
      if (akse === "x") {
        b.x -= d;
        b.vx = -b.vx;
      } else {
        b.y -= d;
        b.vy = -b.vy;
      }
      for (const s of treff) slaa(st, s, ut);
    }

    function steg(st) {
      const ut = [];
      if (st.over || st.klart) return ut;
      st.n++;
      if (st.bredTid > 0 && --st.bredTid === 0) {
        st.padW = PB;
        st.padX = klampPad(st, st.padX);
      }
      if (st.sakteTid > 0) st.sakteTid--;
      if (st.venter) {
        for (const b of st.baller) {
          b.px = b.x = st.padX;
          b.py = b.y = PY - BR - 0.5;
        }
        return ut;
      }
      const f = (st.sakteTid > 0 ? 0.68 : 1) * DT;
      for (const b of st.baller) {
        b.px = b.x;
        b.py = b.y;
        flytt(st, b, "x", b.vx * f, ut);
        flytt(st, b, "y", b.vy * f, ut);
        // The paddle: only from above, only while falling
        if (b.vy > 0 && b.y + BR >= PY && b.py + BR <= PY + 3 && Math.abs(b.x - st.padX) <= st.padW / 2 + BR) {
          const del = Math.max(-1, Math.min(1, (b.x - st.padX) / (st.padW / 2 + BR)));
          st.fart = Math.min(toppfart(st.brett), st.fart + 2);
          const v = del * VINKEL;
          b.vx = st.fart * Math.sin(v);
          b.vy = -st.fart * Math.cos(v);
          b.y = PY - BR;
          ut.push({ type: "racket", del });
        }
      }
      // Balls that fell out
      const for_ = st.baller.length;
      st.baller = st.baller.filter((b) => b.y - BR <= H);
      if (st.baller.length < for_) ut.push({ type: "borte" });
      // Capsules
      for (const k of st.kapsler) {
        k.py = k.y;
        k.y += KAPSEL_FART * DT;
        if (!k.tatt && k.y + 6 >= PY && k.y - 6 <= PY + PH && Math.abs(k.x - st.padX) <= st.padW / 2 + 8) {
          k.tatt = true;
          ta(st, k.type);
          ut.push({ type: "kraft", kraft: k.type, x: k.x });
        }
      }
      st.kapsler = st.kapsler.filter((k) => !k.tatt && k.y < H + 12);
      // The level is cleared
      if (!igjen(st)) {
        st.klart = true;
        const bonus = 50 * st.brett + 25 * st.liv;
        st.poeng += bonus;
        ut.push({ type: "klart", brett: st.brett, bonus });
        return ut;
      }
      // Every ball lost: a life
      if (!st.baller.length) {
        st.liv--;
        st.kapsler = [];
        st.bredTid = 0;
        st.sakteTid = 0;
        st.padW = PB;
        st.padX = klampPad(st, st.padX);
        if (st.liv <= 0) {
          st.over = true;
          ut.push({ type: "over" });
        } else {
          st.baller = [venteBall(st)];
          st.venter = true;
          ut.push({ type: "liv", liv: st.liv });
        }
      }
      return ut;
    }

    function ta(st, type) {
      if (type === "bred") {
        st.bredTid = 12 * HZ;
        st.padW = PB_BRED;
        st.padX = klampPad(st, st.padX);
      } else if (type === "sakte") st.sakteTid = 10 * HZ;
      else if (type === "liv") st.liv = Math.min(LIV_MAKS, st.liv + 1);
      else if (type === "multi") {
        const b = st.baller[0];
        if (!b || st.venter) return;
        const fart = Math.hypot(b.vx, b.vy) || st.fart;
        const v = Math.atan2(b.vx, -b.vy);
        for (const dv of [-0.45, 0.45]) {
          const n = Math.max(-VINKEL, Math.min(VINKEL, v + dv));
          st.baller.push({ x: b.x, y: b.y, px: b.x, py: b.y, vx: fart * Math.sin(n), vy: -fart * Math.cos(n) });
        }
      }
    }

    // After a cleared level: the next one (the same score, lives and seed).
    function neste(st) {
      if (!st.klart) return false;
      startBrett(st, st.brett + 1);
      return true;
    }

    function stegFor(k, ms) {
      k.akk = (k.akk || 0) + (Math.min(Math.max(ms, 0), 250) * HZ) / 1000;
      const n = Math.floor(k.akk + 1e-9);
      k.akk -= n;
      return n;
    }

    return { W, H, TOPP, KOL, CW, CH, BW, BH, PY, PH, PB, PB_BRED, BR, HZ, DT, VINKEL, LIV, LIV_MAKS, BRETT, grunnfart, toppfart, monster, lagBrett, igjen, nytt, styr, skyt, steg, ta, neste, overlapp, klampPad, stegFor };
  })();

  const R = window.Rusj;
  if (!R) {
    window.Murbrekkeren = { Mur };
    return;
  }
  const esc = R.esc;
  const TAU = Math.PI * 2;
  const BLEKK = "#170e2b";
  const FARGER = ["#8f86a8", "#ff4f8b", "#ff8a3d", "#ffd23f", "#3de3b0", "#59b9ff", "#b48cff"];
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "murbrekkeren") + "/";
  const ANTALL = Mur.BRETT.length;

  let H; // actions
  let motor = null;

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const brettNavn = (nr) => Mur.monster(nr)[0];
  const brettTekst = (nr) => R.t("Brett {n}", { n: nr });

  function nyttSpill(S, nr) {
    nr = Math.max(1, Math.min(nr || 1, Math.min(ANTALL, S.naadd || 1)));
    S.spill = { st: Mur.nytt(R.nyttFro(), nr), status: "spiller", ferdig: false, resultat: null, tid: 0 };
    R.statistikk("start", { brett: nr });
  }

  // ---------- Drawing ----------

  function rundRekt(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function tegnStein(g, s, k) {
    const x = s.x * k;
    const y = s.y * k;
    const w = Mur.BW * k;
    const h = Mur.BH * k;
    const farge = s.type === "hard" ? "#6b5aa6" : s.type === "stal" ? "#aeb6c8" : FARGER[s.farge];
    rundRekt(g, x, y, w, h, 3 * k);
    g.fillStyle = farge;
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = "rgba(255,255,255,0.32)";
    g.fillRect(x, y, w, h * 0.32);
    g.fillStyle = "rgba(10,4,30,0.22)";
    g.fillRect(x, y + h * 0.72, w, h * 0.28);
    g.restore();
    g.lineWidth = Math.max(1.2, 1.6 * k);
    g.strokeStyle = BLEKK;
    g.stroke();
    if (s.type === "stal") {
      g.fillStyle = "#6d7488";
      for (const dx of [0.18, 0.82]) {
        g.beginPath();
        g.arc(x + w * dx, y + h * 0.5, 1.6 * k, 0, TAU);
        g.fill();
      }
    } else if (s.type === "hard") {
      g.strokeStyle = "rgba(255,241,221,0.55)";
      g.lineWidth = 1.4 * k;
      g.beginPath();
      if (s.hp === 1) {
        // cracked
        g.moveTo(x + w * 0.3, y + 1.5 * k);
        g.lineTo(x + w * 0.42, y + h * 0.5);
        g.lineTo(x + w * 0.34, y + h - 1.5 * k);
        g.moveTo(x + w * 0.42, y + h * 0.5);
        g.lineTo(x + w * 0.62, y + h * 0.42);
      } else {
        g.rect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.4);
      }
      g.stroke();
    } else if (s.kraft) {
      // a star: there is something inside
      g.fillStyle = "#fff1dd";
      g.beginPath();
      const cx = x + w / 2;
      const cy = y + h / 2;
      for (let i = 0; i < 10; i++) {
        const r = (i % 2 ? 2.2 : 5) * k;
        const v = (i / 10) * TAU - Math.PI / 2;
        g.lineTo(cx + Math.cos(v) * r, cy + Math.sin(v) * r);
      }
      g.closePath();
      g.fill();
      g.lineWidth = 1 * k;
      g.strokeStyle = BLEKK;
      g.stroke();
    }
  }

  const KAPSEL = { bred: "#3de3b0", multi: "#ffd23f", sakte: "#59b9ff", liv: "#ff4f8b" };
  function tegnKapsel(g, x, y, type, k) {
    const w = 22 * k;
    const h = 11 * k;
    rundRekt(g, x * k - w / 2, y * k - h / 2, w, h, h / 2);
    g.fillStyle = KAPSEL[type];
    g.fill();
    g.lineWidth = 1.6 * k;
    g.strokeStyle = BLEKK;
    g.stroke();
    g.fillStyle = BLEKK;
    g.strokeStyle = BLEKK;
    const cx = x * k;
    const cy = y * k;
    g.lineWidth = 1.5 * k;
    g.beginPath();
    if (type === "bred") {
      g.moveTo(cx - 6 * k, cy);
      g.lineTo(cx + 6 * k, cy);
      g.moveTo(cx - 3.5 * k, cy - 2.5 * k);
      g.lineTo(cx - 6 * k, cy);
      g.lineTo(cx - 3.5 * k, cy + 2.5 * k);
      g.moveTo(cx + 3.5 * k, cy - 2.5 * k);
      g.lineTo(cx + 6 * k, cy);
      g.lineTo(cx + 3.5 * k, cy + 2.5 * k);
      g.stroke();
    } else if (type === "multi") {
      for (const dx of [-4.5, 0, 4.5]) {
        g.moveTo(cx + dx * k + 1.8 * k, cy);
        g.arc(cx + dx * k, cy, 1.8 * k, 0, TAU);
      }
      g.fill();
    } else if (type === "sakte") {
      // a little clock
      g.arc(cx, cy, 3.4 * k, 0, TAU);
      g.moveTo(cx, cy);
      g.lineTo(cx, cy - 2.4 * k);
      g.moveTo(cx, cy);
      g.lineTo(cx + 1.8 * k, cy);
      g.stroke();
    } else {
      const s = 2.8 * k;
      g.moveTo(cx, cy + s);
      g.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 1.1, cy - s * 1.3, cx, cy - s * 0.45);
      g.bezierCurveTo(cx + s * 1.1, cy - s * 1.3, cx + s * 1.6, cy - s * 0.1, cx, cy + s);
      g.fill();
    }
  }

  class Motor {
    constructor(S, rot) {
      this.S = S;
      this.flate = R.$(".mu-flate", rot);
      this.lerret = R.$(".mu-lerret", rot);
      this.ctx = this.lerret.getContext("2d");
      this.klokke = { akk: 0 };
      this.sist = performance.now();
      this.taster = { v: false, h: false };
      this.biter = [];
      this.tekster = [];
      this.spor = [];
      this.levende = true;
      this.slutt = null;
      this.k = 1;
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
      const k = Math.max(0.5, Math.min((w - 14) / Mur.W, (h - 20) / Mur.H));
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      this.k = k;
      this.dpr = dpr;
      this.lerret.style.width = Math.round(Mur.W * k) + "px";
      this.lerret.style.height = Math.round(Mur.H * k) + "px";
      this.lerret.width = Math.round(Mur.W * k * dpr);
      this.lerret.height = Math.round(Mur.H * k * dpr);
      this.bakgrunn = null;
      this.tegn(1, performance.now());
    }
    lagBakgrunn() {
      const c = document.createElement("canvas");
      c.width = this.lerret.width;
      c.height = this.lerret.height;
      const g = c.getContext("2d");
      const bg = g.createLinearGradient(0, 0, 0, c.height);
      bg.addColorStop(0, "#1b1140");
      bg.addColorStop(1, "#24164e");
      g.fillStyle = bg;
      g.fillRect(0, 0, c.width, c.height);
      // A faint grid, like a gym floor at night
      g.strokeStyle = "rgba(255,241,221,0.04)";
      g.lineWidth = 1;
      const steg = 30 * this.k * this.dpr;
      for (let x = steg; x < c.width; x += steg) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, c.height);
        g.stroke();
      }
      for (let y = steg; y < c.height; y += steg) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(c.width, y);
        g.stroke();
      }
      this.bakgrunn = c;
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
        const retning = (this.taster.h ? 1 : 0) - (this.taster.v ? 1 : 0);
        if (retning) Mur.styr(st, st.padX + retning * 330 * (dt / 1000));
        sp.tid += dt;
        const n = Mur.stegFor(this.klokke, dt);
        for (let i = 0; i < n && sp.status === "spiller"; i++) for (const h of Mur.steg(st)) this.hendelse(h);
        alfa = sp.status === "spiller" ? this.klokke.akk : 1;
      }
      this.tegn(alfa, na);
      const vaken = !!(sp && sp.status === "spiller");
      if (vaken !== this.vaken) {
        this.vaken = vaken;
        if (vaken) R.holdVaken();
        else R.slippVaken();
      }
      const liv = sp && (sp.status === "spiller" || (this.slutt && na - this.slutt < 1600) || this.biter.length || this.tekster.length);
      if (liv) this.id = requestAnimationFrame(this.ramme);
    }
    hendelse(h) {
      const S = this.S;
      const na = performance.now();
      if (h.type === "knust") {
        R.lyd.tone(h.hard ? 330 : 440 + (h.farge || 0) * 55, 0, 0.06, "triangle", 0.12);
        R.vibrer(6);
        if (!R.rolig())
          for (let i = 0; i < 8; i++) {
            const v = (i / 8) * TAU + Math.random() * 0.5;
            this.biter.push({ x: h.x, y: h.y, vx: Math.cos(v) * (30 + Math.random() * 50), vy: Math.sin(v) * (30 + Math.random() * 50) - 30, farge: h.hard ? "#6b5aa6" : FARGER[h.farge], start: na, liv: 500 });
          }
        oppdaterHud(S);
      } else if (h.type === "sprekk") {
        R.lyd.tone(260, 0, 0.05, "triangle", 0.1);
        oppdaterHud(S);
      } else if (h.type === "stal") R.lyd.tone(1200, 0, 0.04, "sine", 0.06);
      else if (h.type === "racket") R.lyd.tone(520 + h.del * 80, 0, 0.05, "sine", 0.1, 620 + h.del * 80);
      else if (h.type === "vegg") R.lyd.tone(700, 0, 0.03, "sine", 0.04);
      else if (h.type === "kraft") {
        R.lyd.pling();
        R.vibrer(14);
        this.tekster.push({ x: h.x, y: Mur.PY - 14, tekst: KRAFTNAVN[h.kraft], start: na });
        oppdaterHud(S);
      } else if (h.type === "liv") {
        R.lyd.tone(300, 0, 0.3, "sine", 0.16, 180);
        R.vibrer([40, 30, 60]);
        oppdaterHud(S);
        R.si(R.flertall(h.liv, "ball igjen", "baller igjen"));
        R.lagre();
      } else if (h.type === "klart") klartBrett(S, h);
      else if (h.type === "over") tapt(S, this);
    }
    tegn(alfa, na) {
      const S = this.S;
      const sp = S.spill;
      const g = this.ctx;
      if (!sp) return;
      const st = sp.st;
      const k = this.k;
      if (!this.bakgrunn) this.lagBakgrunn();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.bakgrunn, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      for (const s of st.steiner) if (s.hp !== 0) tegnStein(g, s, k);
      for (const c of st.kapsler) tegnKapsel(g, c.x, c.py + (c.y - c.py) * alfa, c.type, k);
      // The paddle
      const pw = st.padW * k;
      const px = st.padX * k - pw / 2;
      const py = Mur.PY * k;
      rundRekt(g, px, py, pw, Mur.PH * k, (Mur.PH * k) / 2);
      const grad = g.createLinearGradient(0, py, 0, py + Mur.PH * k);
      grad.addColorStop(0, "#a8ecff");
      grad.addColorStop(1, st.bredTid > 0 ? "#3de3b0" : "#5fd0ff");
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 2 * k;
      g.strokeStyle = BLEKK;
      g.stroke();
      // The balls (with a short trail)
      const rolig = R.rolig();
      for (const b of st.baller) {
        const x = (b.px + (b.x - b.px) * alfa) * k;
        const y = (b.py + (b.y - b.py) * alfa) * k;
        if (!rolig && !st.venter) {
          g.fillStyle = st.sakteTid > 0 ? "rgba(89,185,255,0.25)" : "rgba(255,241,221,0.18)";
          for (let i = 1; i <= 3; i++) {
            g.beginPath();
            g.arc(x - b.vx * 0.012 * i * k, y - b.vy * 0.012 * i * k, Mur.BR * k * (1 - i * 0.2), 0, TAU);
            g.fill();
          }
        }
        g.beginPath();
        g.arc(x, y, Mur.BR * k, 0, TAU);
        g.fillStyle = "#fff1dd";
        g.fill();
        g.lineWidth = 1.8 * k;
        g.strokeStyle = BLEKK;
        g.stroke();
      }
      // A waiting ball: a dotted hint of where it goes
      if (st.venter && sp.status === "spiller" && !this.slutt) {
        g.save();
        g.globalAlpha = 0.45 + 0.25 * Math.sin(na / 220);
        g.setLineDash([2 * k, 5 * k]);
        g.lineCap = "round";
        g.strokeStyle = "#fff1dd";
        g.lineWidth = 2 * k;
        g.beginPath();
        g.moveTo(st.padX * k, (Mur.PY - 14) * k);
        g.lineTo(st.padX * k, (Mur.PY - 60) * k);
        g.stroke();
        g.restore();
        g.font = `800 ${Math.round(13 * k)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
        g.textAlign = "center";
        g.fillStyle = "rgba(255,241,221,0.8)";
        g.fillText(SKYT_TEKST(), (Mur.W / 2) * k, (Mur.PY - 72) * k);
      }
      // Bits and texts
      this.biter = this.biter.filter((p) => na - p.start < p.liv);
      for (const p of this.biter) {
        const a = (na - p.start) / p.liv;
        const t = a * (p.liv / 1000);
        g.globalAlpha = 1 - a;
        g.fillStyle = p.farge;
        const s = 3.4 * k * (1 - a * 0.5);
        g.fillRect((p.x + p.vx * t) * k - s / 2, (p.y + p.vy * t + 160 * t * t) * k - s / 2, s, s);
      }
      g.globalAlpha = 1;
      this.tekster = this.tekster.filter((p) => na - p.start < 1000);
      g.textAlign = "center";
      g.lineJoin = "round";
      for (const p of this.tekster) {
        const a = (na - p.start) / 1000;
        g.globalAlpha = a < 0.7 ? 1 : (1 - a) / 0.3;
        g.font = `900 ${Math.round(14 * k)}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
        g.lineWidth = Math.max(3, 3.5 * k);
        g.strokeStyle = BLEKK;
        const tx = Math.min(Mur.W - 50, Math.max(50, p.x)) * k;
        const ty = (p.y - a * 24) * k;
        g.strokeText(p.tekst, tx, ty);
        g.fillStyle = "#ffd23f";
        g.fillText(p.tekst, tx, ty);
      }
      g.globalAlpha = 1;
    }
  }

  const KRAFTNAVN = { bred: R.t("Bred racket!"), multi: R.t("Tre baller!"), sakte: R.t("Sakte ball!"), liv: R.t("Ekstra ball!") };
  const SKYT_TEKST = () => (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches ? R.t("Mellomrom skyter ballen") : R.t("Slipp fingeren for å skyte"));

  // ---------- The game ----------

  function klartBrett(S, h) {
    const sp = S.spill;
    sp.status = "klart";
    R.lyd.fanfare();
    R.vibrer([20, 30, 40]);
    if (h.brett >= 5) R.merke("arkade-murbrekkeren");
    const nesteNr = h.brett + 1;
    if (nesteNr <= ANTALL && nesteNr > (S.naadd || 1)) S.naadd = nesteNr;
    S.lengst = Math.max(S.lengst || 1, h.brett + 1);
    oppdaterHud(S);
    R.lagre();
    visStatus(S);
    R.si(R.t("Brett {n} klart! Bonus {bonus}.", { n: h.brett, bonus: h.bonus }));
  }

  function nesteBrett(S) {
    const sp = S.spill;
    if (!sp || sp.status !== "klart") return;
    Mur.neste(sp.st);
    sp.status = "spiller";
    // Drawn anew: the top bar says the new level, and the board starts fresh
    R.vis();
  }

  function tapt(S, m) {
    const sp = S.spill;
    sp.status = "over";
    m.slutt = performance.now();
    R.lyd.tone(330, 0, 0.5, "sine", 0.2, 140);
    R.vibrer([60, 40, 90]);
    ferdigstill(S);
    R.lagre();
    visStatus(S);
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && S.spill === sp && R.gaTil("slutt"), R.rolig() ? 900 : 1600);
  }

  function ferdigstill(S) {
    const sp = S.spill;
    if (sp.ferdig) return;
    sp.ferdig = true;
    const st = sp.st;
    const gml = S.rekord || 0;
    sp.resultat = { poeng: st.poeng, brett: st.brett, start: st.start, knust: st.knust, gml, nyRekord: st.poeng > gml && gml > 0, forste: !gml && st.poeng > 0 };
    if (st.poeng > gml) S.rekord = st.poeng;
    S.lengst = Math.max(S.lengst || 1, st.brett);
    S.sist = { poeng: st.poeng, brett: st.brett };
    S.spilt = (S.spilt || 0) + 1;
    R.statistikk("ferdig", { poeng: st.poeng, brett: st.brett, sek: Math.round(sp.tid / 1000) });
  }

  // Launch the waiting ball, or (after a cleared level) go on.
  function skyt(S) {
    const sp = S.spill;
    if (!sp) return;
    if (sp.status === "klart") return nesteBrett(S);
    if (sp.status !== "spiller") return;
    if (Mur.skyt(sp.st)) {
      R.lyd.tone(600, 0, 0.06, "sine", 0.1, 820);
      R.lagre();
    }
  }

  function pause(S, pa) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.status === "over" || sp.status === "klart") return;
    if (pa && sp.status === "spiller") {
      sp.status = "pause";
      if (motor) motor.taster = { v: false, h: false };
      R.lagre();
      visStatus(S);
    } else if (!pa && sp.status === "pause") gjenoppta(S);
  }
  let gjenopptar = false;
  let borteUnderveis = false;
  async function gjenoppta(S) {
    if (gjenopptar) return;
    const sp = S.spill;
    // A ball waiting on the paddle needs no countdown
    if (sp.st.venter) {
      sp.status = "spiller";
      if (motor) {
        motor.klokke.akk = 0;
        motor.vekk();
      }
      return visStatus(S);
    }
    gjenopptar = true;
    borteUnderveis = false;
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

  function hjerter(n) {
    return Array.from({ length: Math.max(n, 3) }, (_, i) => `<i class="${i < n ? "" : "mu-tom"}"></i>`).join("");
  }
  function oppdaterHud(S) {
    const sp = S.spill;
    if (!sp) return;
    const st = sp.st;
    const p = R.$("#mu-poeng");
    if (p) p.textContent = R.tall(st.poeng);
    const b = R.$("#mu-brett");
    if (b) b.textContent = String(st.brett);
    const l = R.$("#mu-liv");
    if (l) {
      l.innerHTML = hjerter(st.liv);
      l.parentElement.setAttribute("aria-label", R.flertall(st.liv, "ball igjen", "baller igjen"));
    }
  }

  function visStatus(S, skjul) {
    const sp = S.spill;
    const el = R.$(".mu-status");
    if (!el || !sp) return;
    const knapp = R.$('[data-h="pause"]');
    if (knapp) {
      knapp.setAttribute("aria-label", sp.status === "pause" ? R.t("Fortsett") : R.t("Pause"));
      knapp.classList.toggle("pauset", sp.status === "pause");
    }
    el.className = "mu-status";
    if (sp.status === "pause" && !skjul) {
      el.hidden = false;
      el.innerHTML = `<div class="mu-statuskort"><p class="etikett">${esc(R.t("Pause"))}</p><p class="mu-stor">${esc(R.t("Ballen venter"))}</p>${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}${R.ui.lenke(R.t("Start på nytt"), "ny")}</div>`;
    } else if (sp.status === "klart") {
      const st = sp.st;
      el.hidden = false;
      el.classList.add("klart");
      const siste = st.brett % ANTALL === 0;
      el.innerHTML = `<div class="mu-statuskort klart"><p class="etikett">${esc(brettTekst(st.brett))} · ${esc(brettNavn(st.brett))}</p><p class="mu-stor">${esc(siste ? R.t("Alle tolv brett!") : R.t("Brett klart!"))}</p><p>${esc(siste ? R.t("Nå kommer de igjen – litt raskere.") : R.t("Neste: {navn}", { navn: brettNavn(st.brett + 1) }))}</p>${R.ui.knapp(R.t("Neste brett"), "neste", { variant: "stor" })}</div>`;
    } else if (sp.status === "over") {
      el.hidden = false;
      el.classList.add("over");
      el.innerHTML = `<div class="mu-statuskort over"><p class="mu-stor">${esc(R.t("Ingen baller igjen"))}</p><p>${esc(R.flertall(sp.st.poeng, "poeng", "poeng"))}</p></div>`;
    } else {
      el.hidden = true;
      el.innerHTML = "";
    }
  }

  // ---------- Controls ----------

  function bindKontroll(S, rot) {
    const flate = R.$(".mu-spill", rot);
    if (!flate) return;
    let finger = null;
    const tilX = (e) => {
      const b = motor.lerret.getBoundingClientRect();
      return ((e.clientX - b.left) / b.width) * Mur.W;
    };
    const ned = (e) => {
      const sp = R.S.spill;
      if (!motor || !sp || e.target.closest("button, a") || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      R.lyd.lasOpp();
      if (sp.status !== "spiller" && sp.status !== "klart") return;
      finger = e.pointerId;
      // After a cleared level a tap anywhere goes on (on letting go)
      if (sp.status === "spiller") Mur.styr(sp.st, tilX(e));
    };
    const flytt = (e) => {
      const sp = R.S.spill;
      if (!motor || !sp || sp.status !== "spiller") return;
      if (finger === e.pointerId || (e.pointerType === "mouse" && finger === null)) Mur.styr(sp.st, tilX(e));
    };
    const opp = (e) => {
      if (finger !== e.pointerId) return;
      finger = null;
      if (e.type === "pointerup") skyt(R.S);
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    flate.addEventListener("pointerdown", ned);
    window.addEventListener("pointermove", flytt);
    window.addEventListener("pointerup", opp);
    window.addEventListener("pointercancel", opp);
    flate.addEventListener("touchmove", nei, { passive: false });
    flate.addEventListener("gesturestart", nei);
    flate.addEventListener("contextmenu", nei);
    R.vedForlat(() => {
      flate.removeEventListener("pointerdown", ned);
      window.removeEventListener("pointermove", flytt);
      window.removeEventListener("pointerup", opp);
      window.removeEventListener("pointercancel", opp);
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
    const m = e.target;
    const fritt = !(m && m.closest && m.closest("button, a, input, textarea, select"));
    if (!fritt && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const sp = S.spill;
    const pil = PILER[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (pil) {
      e.preventDefault();
      if (motor && sp.status === "spiller") motor.taster[pil] = true;
    } else if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      if (!e.repeat) skyt(S);
    } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      e.preventDefault();
      pause(S, sp.status !== "pause");
    }
  });
  document.addEventListener("keyup", (e) => {
    const pil = PILER[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (pil && motor) motor.taster[pil] = false;
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && gjenopptar) borteUnderveis = true;
    if (document.hidden && S && S.skjerm === "spill") pause(S, true);
  });
  window.addEventListener("blur", () => {
    const S = R.S;
    if (gjenopptar) borteUnderveis = true;
    if (S && S.skjerm === "spill") pause(S, true);
  });

  const fastSide = (pa) => document.documentElement.classList.toggle("mu-fast", !!pa);
  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>';

  function gyldig(sp) {
    if (!sp || typeof sp !== "object" || !sp.st || typeof sp.st !== "object") return false;
    const st = sp.st;
    const tall = (v) => typeof v === "number" && Number.isFinite(v);
    if (!["fro", "brett", "start", "poeng", "liv", "padX", "padW", "fart", "bredTid", "sakteTid"].every((k) => tall(st[k]))) return false;
    if (!Number.isInteger(st.brett) || st.brett < 1 || st.brett > 999) return false;
    if (!Array.isArray(st.steiner) || st.steiner.length > 200 || !st.steiner.every((s) => s && tall(s.x) && tall(s.y) && tall(s.hp) && ["vanlig", "hard", "stal"].includes(s.type))) return false;
    if (!Array.isArray(st.baller) || st.baller.length > 30 || !st.baller.every((b) => b && ["x", "y", "px", "py", "vx", "vy"].every((k) => tall(b[k])))) return false;
    return Array.isArray(st.kapsler) && st.kapsler.every((c) => c && tall(c.x) && tall(c.y) && Object.prototype.hasOwnProperty.call(KAPSEL, c.type));
  }

  // ---------- Start ----------

  R.start({
    id: "murbrekkeren",
    versjon: 1,
    pagar,

    tilstand: () => ({ rekord: 0, lengst: 1, naadd: 1, valgt: 1, sist: null, spilt: 0, spill: null }),

    lastet(S) {
      S.rekord = Number.isFinite(S.rekord) && S.rekord > 0 ? Math.floor(S.rekord) : 0;
      S.lengst = Number.isInteger(S.lengst) && S.lengst > 0 && S.lengst < 1000 ? S.lengst : 1;
      S.naadd = Number.isInteger(S.naadd) ? Math.max(1, Math.min(ANTALL, S.naadd)) : 1;
      S.valgt = Number.isInteger(S.valgt) ? Math.max(1, Math.min(S.naadd, S.valgt)) : 1;
      S.spilt = Number.isInteger(S.spilt) && S.spilt >= 0 ? S.spilt : 0;
      if (S.sist && !(Number.isFinite(S.sist.poeng) && Number.isInteger(S.sist.brett))) S.sist = null;
      const sp = S.spill;
      if (sp) {
        if (!gyldig(sp)) S.spill = null;
        else {
          sp.tid = Number(sp.tid) || 0;
          if (sp.status === "spiller") sp.status = "pause";
          if (!["pause", "klart", "over"].includes(sp.status)) sp.status = "pause";
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
      intro: R.t("Send ballen opp mot muren og knus alle klossene. Racketen nederst skal passe på at ballen ikke faller ned."),
      steg: [
        [R.t("Styr"), R.t("Dra fingeren hvor som helst på brettet – også under det – så følger racketen etter. Med tastatur: piltastene.")],
        [R.t("Skyt"), R.t("Slipp fingeren, så går ballen. Med tastatur: mellomrom.")],
        [R.t("Knus muren"), R.t("Når alle klossene er borte, er brettet klart. Du har tre baller – mister du alle, er spillet slutt.")],
      ],
      tips: [
        R.t("Der ballen treffer racketen, bestemmer retningen: midt på går den rett opp, ytterst går den skrått."),
        R.t("Mørke klosser tåler to treff. Stål går aldri i stykker – sikt forbi."),
        R.t("Klosser med en stjerne slipper en kapsel. Ta den med racketen: bred racket, tre baller, sakte ball eller en ekstra ball."),
        R.t("Brettene du har kommet til, kan du starte på igjen med «Velg brett»."),
        R.t("Spillet tar pause av seg selv hvis du bytter app. P eller Esc gir pause med tastatur."),
        R.t("Murbrekkeren går i sanntid og kan dessverre ikke spilles med skjermleser."),
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
          if (S.spilt) linjer.push(`<li><b>${esc(R.t("Lengst"))}</b> ${esc(brettTekst(S.lengst).toLowerCase())}</li>`);
          if (S.sist) linjer.push(`<li><b>${esc(R.t("Sist"))}</b> ${esc(R.flertall(S.sist.poeng, "poeng", "poeng"))}</li>`);
          const lenker = [S.naadd > 1 ? R.ui.lenke(R.t("Velg brett"), "velg") : "", R.ui.lenke(R.t("Slik spiller du"), "regler")].filter(Boolean);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Racket, ball og en mur som skal ned."))}<br><em>${esc(R.t("Hvor mange brett klarer du?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: aktiv,
              fortsettTekst: aktiv ? R.t("Fortsett · {brett}", { brett: brettTekst(sp.st.brett) }) : "",
              startTekst: S.valgt > 1 ? R.t("Start spill · {brett}", { brett: brettTekst(S.valgt).toLowerCase() }) : R.t("Start spill"),
              ekstraHtml: R.ui.lenkerad(...lenker) + (linjer.length ? `<section class="mu-rekorder" aria-label="${esc(R.t("Dine resultater"))}"><ul>${linjer.join("")}</ul></section>` : ""),
            }),
            merker: [
              [String(ANTALL), R.t("brett")],
              ["3", R.t("baller")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: () => R.t("Velg brett"),
        tilbake: "hjem",
        vis(S) {
          const fliser = Mur.BRETT.map((b, i) => ({ v: i + 1, tittel: brettTekst(i + 1), tekst: i + 1 <= S.naadd ? b[0] : R.t("Ikke nådd ennå"), av: i + 1 > S.naadd, ikon: i + 1 <= S.naadd ? "" : "🔒" }));
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvilket brett?"))}</h2></div>
              <p class="hjelp">${esc(R.t("Du kan starte på alle brettene du har kommet til."))}</p>
              <div class="mu-brettvalg">${R.ui.fliser("brettvalg", fliser, S.valgt)}</div>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: (S) => brettTekst(S.spill.st.brett),
        tilbake: "hjem",
        vis(S) {
          const st = S.spill.st;
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Murbrekkeren"))}</h1>
            <div class="mu-spill">
              <div class="mu-hud">
                <span class="mu-stat"><small>${esc(R.t("Poeng"))}</small><b id="mu-poeng">${esc(R.tall(st.poeng))}</b></span>
                <span class="mu-stat"><small>${esc(R.t("Brett"))}</small><b id="mu-brett">${st.brett}</b></span>
                <span class="mu-stat" role="img" aria-label="${esc(R.flertall(st.liv, "ball igjen", "baller igjen"))}"><small aria-hidden="true">${esc(R.t("Baller"))}</small><b class="mu-liv" id="mu-liv" aria-hidden="true">${hjerter(st.liv)}</b></span>
                <button class="mu-pause${sp.status === "pause" ? " pauset" : ""}" data-h="pause" aria-label="${esc(sp.status === "pause" ? R.t("Fortsett") : R.t("Pause"))}">${PAUSE}</button>
              </div>
              <div class="mu-flate">
                <div class="mu-ramme">
                  <canvas class="mu-lerret" role="img" aria-label="${esc(R.t("Brettet med muren, ballen og racketen"))}"></canvas>
                  <div class="mu-status" hidden></div>
                </div>
              </div>
              <p class="mu-hint"><span class="mu-finger">${esc(R.t("Dra hvor som helst for å styre – slipp for å skyte."))}</span><span class="mu-tast">${esc(R.t("Piltaster styrer · mellomrom skyter · P = pause"))}</span></p>
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
        tittel: () => R.t("Murbrekkeren"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { poeng: sp.st.poeng, brett: sp.st.brett, start: sp.st.start };
          const klarte = r.brett - r.start;
          const tittel = r.nyRekord ? R.t("Ny rekord!") : klarte >= 3 ? R.t("Godt jobba!") : R.t("Godt forsøk!");
          const linje = r.nyRekord
            ? R.t("Ny personlig rekord! Forrige: {n}.", { n: R.tall(r.gml) })
            : r.forste
              ? R.t("Første runde – nå har du en rekord å slå!")
              : r.gml
                ? R.t("Rekorden din er {n}.", { n: R.tall(Math.max(r.gml, r.poeng)) })
                : R.t("Prøv igjen – muren står der fortsatt.");
          const stor = r.nyRekord || klarte >= 3;
          return `
            ${R.ui.banner({ tittel, etikett: R.t("Ingen baller igjen"), stemning: stor ? "jubel" : "" })}
            <div class="mu-resultat">
              <div class="mu-tall${r.nyRekord ? " ny" : ""}"><b>${esc(R.tall(r.poeng))}</b><span>${esc(R.t("poeng|poeng", { n: r.poeng }))}</span>${r.nyRekord ? `<i class="mu-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="mu-tall"><b>${esc(R.tall(klarte))}</b><span>${esc(R.t("brett klart|brett klart", { n: klarte }))}</span></div>
            </div>
            <p class="hjelp">${esc(R.t("Du kom til brett {n}: {navn}.", { n: r.brett, navn: brettNavn(r.brett) }))} ${esc(linje)}</p>
            <div class="mu-del">${R.ui.knapp2(R.t("Del resultatet"), "del")}</div>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Velg brett"), "velg"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if (r.nyRekord || r.brett - r.start >= 5) {
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
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig && S.spill.st.knust > 0))) || !fortsatt()) return;
        nyttSpill(S, S.valgt);
        R.gaTil("spill");
      },
      velg: (el, e, S) => R.gaTil("oppsett"),
      brettvalg(el, e, S) {
        const n = Number(el.dataset.v);
        if (Number.isInteger(n) && n >= 1 && n <= S.naadd) S.valgt = n;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig && S.spill.st.knust > 0))) || !fortsatt()) return;
        nyttSpill(S, S.valgt);
        R.gaTil("spill");
      },
      regler(el, e, S) {
        if (S.skjerm === "spill") pause(S, true);
        R.visRegler();
      },
      fortsett: (el, e, S) => R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem"),
      igjen(el, e, S) {
        nyttSpill(S, S.spill && S.spill.resultat ? S.spill.resultat.start : S.valgt);
        R.gaTil("spill");
      },
      neste: (el, e, S) => nesteBrett(S),
      pause: (el, e, S) => pause(S, S.spill.status !== "pause"),
      "fortsett-spill": (el, e, S) => pause(S, false),
      ny(el, e, S) {
        nyttSpill(S, S.spill ? S.spill.st.start : S.valgt);
        R.gaTil("spill");
      },
      del(el, e, S) {
        const r = S.spill && S.spill.resultat;
        if (!r) return;
        const poeng = R.flertall(r.poeng, "poeng", "poeng");
        const brett = R.t("Kom til brett {n}", { n: r.brett });
        const tekst = `🧱 ${R.t("Murbrekkeren")} · ${poeng} · ${brett}. ${R.t("Hvor mange brett klarer du?")}`;
        R.del(R.t("Murbrekkeren"), tekst, ADRESSE, { kort: { tittel: R.t("Murbrekkeren"), linjer: [poeng, brett] } });
      },
    }),
  });
})();
