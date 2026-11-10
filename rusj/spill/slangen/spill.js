/* Slangen — Snake.
   A classic snake on a canvas: steer with swipes, the big arrow cross under the thumb or the
   keyboard. Three speeds, walls on or off (off: out one side, in the other). The game ticks at a
   fixed pace; between ticks the head and the tail glide, so the snake moves smoothly at any frame
   rate. Up to three turns are queued, so quick double turns are never lost. The game pauses when
   the tab is hidden and is saved on every bite and every pause. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;

  const B = 15; // columns
  const H_ = 17; // rows
  // Tables without a prototype, so a saved or typed value like "__proto__" is simply not an option.
  const tabell = (o) => Object.assign(Object.create(null), o);
  const FARTER = tabell({
    rolig: { navn: "Rolig", ms: 165, ikon: "🐢", tekst: "God tid" },
    normal: { navn: "Normal", ms: 120, ikon: "🐍", tekst: "Klassisk" },
    rask: { navn: "Rask", ms: 82, ikon: "⚡", tekst: "Kjappe fingrer" },
  });
  const FART_ID = ["rolig", "normal", "rask"];
  const RETNING = tabell({ opp: [0, -1], ned: [0, 1], venstre: [-1, 0], hoyre: [1, 0] });
  const MOTSATT = tabell({ opp: "ned", ned: "opp", venstre: "hoyre", hoyre: "venstre" });
  // Warm colours only: they stand out on the purple field (a purple plum did not).
  const FRUKT = [
    { farge: "#ff5a4e", blad: "#3de3b0" },
    { farge: "#ff8a3d", blad: "#3de3b0" },
    { farge: "#ffd23f", blad: "#3de3b0" },
    { farge: "#ff4f8b", blad: "#9be15d" },
  ];
  const SVEIP = 22;

  let H; // actions
  let motor = null; // the running loop of the play screen

  // ---------- The game ----------

  const nokkel = (sp) => `${sp.fart}-${sp.vegger ? "vegg" : "fri"}`;
  const beste = (S, sp) => (S.rekorder[nokkel(sp)] || 0);

  function nyttSpill(S) {
    const y = (H_ / 2) | 0;
    const sp = {
      fart: FARTER[S.oppsett.fart] ? S.oppsett.fart : "normal",
      vegger: !!S.oppsett.vegger,
      kropp: [
        [6, y],
        [5, y],
        [4, y],
      ],
      retning: "hoyre",
      ko: [],
      mat: null,
      poeng: 0,
      fro: R.nyttFro(),
      status: "klar", // klar → spiller ⇄ pause → over
      tid: 0,
      ferdig: false,
      resultat: null,
    };
    nyMat(sp, true);
    S.spill = sp;
    R.statistikk("start", { fart: sp.fart, vegger: sp.vegger });
  }

  function nyMat(sp, forste) {
    const opptatt = new Set(sp.kropp.map(([x, y]) => x + "," + y));
    const ledige = [];
    for (let y = 0; y < (forste ? 7 : H_); y++) for (let x = 0; x < B; x++) if (!opptatt.has(x + "," + y)) ledige.push([x, y]);
    if (!ledige.length) {
      sp.mat = null;
      return false;
    }
    const tilf = R.rng(sp.fro);
    const [x, y] = ledige[Math.floor(tilf() * ledige.length)];
    sp.mat = { x, y, t: Math.floor(tilf() * FRUKT.length) };
    sp.fro = Math.floor(tilf() * 4294967296) >>> 0;
    return true;
  }

  // A turn goes into the queue unless it is the same way or straight back.
  function svingInn(sp, r) {
    const siste = sp.ko.length ? sp.ko[sp.ko.length - 1] : sp.retning;
    if (r === siste || r === MOTSATT[siste] || sp.ko.length >= 3) return false;
    sp.ko.push(r);
    return true;
  }

  // One step. Returns "spiste", "krasj" or "".
  function steg(sp) {
    if (sp.ko.length) sp.retning = sp.ko.shift();
    const [dx, dy] = RETNING[sp.retning];
    let [x, y] = sp.kropp[0];
    x += dx;
    y += dy;
    if (!sp.vegger) {
      x = (x + B) % B;
      y = (y + H_) % H_;
    } else if (x < 0 || x >= B || y < 0 || y >= H_) {
      sp.krasj = [x, y];
      return "krasj";
    }
    const spiser = sp.mat && sp.mat.x === x && sp.mat.y === y;
    // The tail moves away this step, so its cell is free – unless the snake grows.
    const kropp = spiser ? sp.kropp : sp.kropp.slice(0, -1);
    if (kropp.some(([kx, ky]) => kx === x && ky === y)) {
      sp.krasj = [x, y];
      return "krasj";
    }
    sp.kropp.unshift([x, y]);
    if (spiser) {
      sp.poeng += 1;
      return "spiste";
    }
    sp.forrigeHale = sp.kropp.pop();
    return "";
  }

  // ---------- Drawing ----------

  // The step from cell a to its neighbour b – through the wall it is one step the other way.
  function steg1(a, b) {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    if (dx > 1) dx = -1;
    else if (dx < -1) dx = 1;
    if (dy > 1) dy = -1;
    else if (dy < -1) dy = 1;
    return [dx, dy];
  }

  class Motor {
    constructor(S, rot) {
      this.S = S;
      this.flate = R.$(".sl-flate", rot);
      this.lerret = R.$(".sl-lerret", rot);
      this.ctx = this.lerret.getContext("2d");
      this.c = 20;
      this.akk = 0;
      this.sist = performance.now();
      this.fra = null; // where the head and tail glide from this step
      this.partikler = [];
      this.tekster = [];
      this.matInn = performance.now();
      this.dod = null;
      this.tunge = 0;
      this.levende = true;
      this.bakgrunn = null;
      this.tilpass();
      this.ramme = this.ramme.bind(this);
      this.id = requestAnimationFrame(this.ramme);
      this.obs = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.tilpass()) : null;
      if (this.obs) this.obs.observe(this.flate);
    }
    stopp() {
      this.levende = false;
      cancelAnimationFrame(this.id);
      if (this.obs) this.obs.disconnect();
    }
    // Start the loop again after a pause (it sleeps when nothing moves).
    vekk() {
      if (!this.levende || this.id) return;
      this.sist = performance.now();
      this.id = requestAnimationFrame(this.ramme);
    }
    tilpass() {
      const w = this.flate.clientWidth;
      const h = this.flate.clientHeight;
      if (!w || !h) return;
      const c = Math.max(8, Math.floor(Math.min((w - 8) / B, (h - 8) / H_)));
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      this.c = c;
      this.lerret.style.width = c * B + "px";
      this.lerret.style.height = c * H_ + "px";
      this.lerret.width = Math.round(c * B * dpr);
      this.lerret.height = Math.round(c * H_ * dpr);
      this.dpr = dpr;
      this.bakgrunn = null;
      this.tegn(this.sistT == null ? 1 : this.sistT);
    }
    // The checkered field, drawn once per size.
    lagBakgrunn() {
      const k = document.createElement("canvas");
      k.width = this.lerret.width;
      k.height = this.lerret.height;
      const g = k.getContext("2d");
      g.scale(this.dpr, this.dpr);
      const c = this.c;
      for (let y = 0; y < H_; y++)
        for (let x = 0; x < B; x++) {
          g.fillStyle = (x + y) % 2 ? "#21143d" : "#261848";
          g.fillRect(x * c, y * c, c, c);
        }
      this.bakgrunn = k;
    }
    ramme(na) {
      if (!this.levende) return;
      this.id = 0;
      const S = this.S;
      const sp = S.spill;
      const dt = Math.min(250, na - this.sist);
      this.sist = na;
      // A sheet over the board (the rules, a question) pauses the game.
      if (sp && sp.status === "spiller" && R.arkApent()) pause(S, true);
      if (sp && sp.status === "spiller" && !this.dod) {
        const ms = FARTER[sp.fart].ms;
        sp.tid += dt;
        this.akk += dt;
        while (this.akk >= ms && sp.status === "spiller") {
          this.akk -= ms;
          const hale = sp.kropp[sp.kropp.length - 1].slice();
          const hode = sp.kropp[0].slice();
          sp.forrigeHale = null;
          const svar = steg(sp);
          this.fra = { hode, hale: sp.forrigeHale ? hale : null };
          if (svar === "krasj") {
            this.akk = 0;
            this.fra = null;
            krasj(S, this);
            break;
          }
          if (svar === "spiste") spiste(S, this);
        }
      }
      this.tegn(sp && sp.status === "spiller" && !this.dod ? this.akk / FARTER[sp.fart].ms : 1, na);
      // The screen stays awake only while the snake moves.
      const vaken = !!(sp && sp.status === "spiller");
      if (vaken !== this.vaken) {
        this.vaken = vaken;
        if (vaken) R.holdVaken();
        else R.slippVaken();
      }
      // Sleep when nothing moves (pause, the end): no drawing 60 times a second for nothing.
      const liv = sp && (sp.status === "spiller" || sp.status === "klar" || (this.dod && na - this.dod.tid < 1500) || this.partikler.length || this.tekster.length);
      if (liv) this.id = requestAnimationFrame(this.ramme);
    }
    // Centre of a cell in pixels
    px(x, y) {
      return [(x + 0.5) * this.c, (y + 0.5) * this.c];
    }
    tegn(t, na) {
      this.sistT = t;
      const S = this.S;
      const sp = S.spill;
      const ctx = this.ctx;
      const c = this.c;
      na = na || performance.now();
      if (!sp) return;
      if (!this.bakgrunn) this.lagBakgrunn();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.lerret.width, this.lerret.height);
      ctx.drawImage(this.bakgrunn, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, B * c, H_ * c);
      ctx.clip();
      this.tegnMat(na);
      this.tegnSlange(t, na);
      this.tegnPartikler(na);
      ctx.restore();
    }
    tegnMat(na) {
      const sp = this.S.spill;
      if (!sp.mat) return;
      const ctx = this.ctx;
      const c = this.c;
      const f = FRUKT[sp.mat.t] || FRUKT[0];
      const [x, y] = this.px(sp.mat.x, sp.mat.y);
      // Pops in with a little overshoot, then bobs.
      const inn = Math.min(1, (na - this.matInn) / 320);
      const pop = R.rolig() ? 1 : inn < 1 ? 1 - Math.pow(1 - inn, 3) * Math.cos(inn * 9) : 1;
      const bob = R.rolig() ? 0 : Math.sin(na / 260) * 0.05;
      const r = c * 0.42 * Math.max(0.05, pop) * (1 + bob);
      ctx.save();
      ctx.translate(x, y + (R.rolig() ? 0 : Math.sin(na / 380) * c * 0.04));
      ctx.fillStyle = "rgba(6,2,14,0.35)";
      ctx.beginPath();
      ctx.ellipse(0, c * 0.36, r * 0.8, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, c * 0.08);
      ctx.strokeStyle = "#170e2b";
      ctx.fillStyle = f.farge;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.35, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f.blad;
      ctx.beginPath();
      ctx.ellipse(r * 0.35, -r * 1.05, r * 0.42, r * 0.2, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // The body as one continuous line through the cell centres, in "unwrapped" coordinates (it
    // may run past the edge when there are no walls); the head and the tail glide between cells.
    punkter(t) {
      const k = this.S.spill.kropp;
      const pts = [];
      let cur;
      if (this.fra && t < 1 && k.length > 1) {
        const prev = this.fra.hode; // the cell the head is coming from (k[1])
        const r = steg1(prev, k[0]);
        pts.push([prev[0] + r[0] * t, prev[1] + r[1] * t]);
        cur = [prev[0], prev[1]];
        pts.push(cur);
        for (let i = 2; i < k.length; i++) {
          const d = steg1(k[i - 1], k[i]);
          cur = [cur[0] + d[0], cur[1] + d[1]];
          pts.push(cur);
        }
        if (this.fra.hale) {
          const d = steg1(k[k.length - 1], this.fra.hale);
          pts.push([cur[0] + d[0] * (1 - t), cur[1] + d[1] * (1 - t)]);
        }
      } else {
        cur = [k[0][0], k[0][1]];
        pts.push(cur);
        for (let i = 1; i < k.length; i++) {
          const d = steg1(k[i - 1], k[i]);
          cur = [cur[0] + d[0], cur[1] + d[1]];
          pts.push(cur);
        }
      }
      return pts;
    }
    tegnSlange(t, na) {
      const ctx = this.ctx;
      const c = this.c;
      const sp = this.S.spill;
      const pts = this.punkter(t);
      // Without walls the line may run past an edge: draw it again shifted by a whole board, so
      // the part that went out on one side comes in on the other (the canvas clips the rest).
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const forskyv = [];
      for (const ox of [0, Math.min(...xs) < 0.5 ? B : 0, Math.max(...xs) > B - 1.5 ? -B : 0])
        for (const oy of [0, Math.min(...ys) < 0.5 ? H_ : 0, Math.max(...ys) > H_ - 1.5 ? -H_ : 0]) if (!forskyv.some(([a, b]) => a === ox && b === oy)) forskyv.push([ox, oy]);
      const dod = this.dod;
      const blink = dod && Math.floor((na - dod.tid) / 110) % 2 === 0;
      const kropp = blink ? "#ff5a4e" : "#6fe07a";
      const lys = blink ? "#ffb0a8" : "#b5f5ba";
      const strek = (farge, bredde) => {
        ctx.strokeStyle = farge;
        ctx.lineWidth = bredde;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const [ox, oy] of forskyv) {
          ctx.beginPath();
          pts.forEach(([x, y], i) => (i ? ctx.lineTo((x + ox + 0.5) * c, (y + oy + 0.5) * c) : ctx.moveTo((x + ox + 0.5) * c, (y + oy + 0.5) * c)));
          if (pts.length === 1) ctx.lineTo((pts[0][0] + ox + 0.5) * c + 0.01, (pts[0][1] + oy + 0.5) * c);
          ctx.stroke();
        }
      };
      ctx.save();
      if (dod && !R.rolig()) {
        const s = Math.max(0, 1 - (na - dod.tid) / 500) * c * 0.15;
        ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }
      strek("#170e2b", c * 0.78 + Math.max(3, c * 0.16));
      strek(kropp, c * 0.78);
      strek(lys, c * 0.22);
      for (const [ox, oy] of forskyv) this.tegnHode(pts[0][0] + ox, pts[0][1] + oy, kropp, na);
      ctx.restore();
    }
    // The head: eyes that look where it goes, and now and then a tongue.
    tegnHode(hx, hy, kropp, na) {
      const ctx = this.ctx;
      const c = this.c;
      const sp = this.S.spill;
      const dod = this.dod;
      const x = (hx + 0.5) * c;
      const y = (hy + 0.5) * c;
      const [rx, ry] = RETNING[sp.retning];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(ry, rx));
      if (!dod && !R.rolig() && na % 2600 < 220 && sp.status === "spiller") {
        ctx.strokeStyle = "#ff4f8b";
        ctx.lineWidth = Math.max(1.5, c * 0.07);
        ctx.beginPath();
        ctx.moveTo(c * 0.35, 0);
        ctx.lineTo(c * 0.62, 0);
        ctx.lineTo(c * 0.72, -c * 0.08);
        ctx.moveTo(c * 0.62, 0);
        ctx.lineTo(c * 0.72, c * 0.08);
        ctx.stroke();
      }
      ctx.fillStyle = kropp;
      ctx.strokeStyle = "#170e2b";
      ctx.lineWidth = Math.max(3, c * 0.16) / 2;
      ctx.beginPath();
      ctx.ellipse(c * 0.05, 0, c * 0.47, c * 0.43, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.fillStyle = "#fff1dd";
        ctx.beginPath();
        ctx.arc(c * 0.12, s * c * 0.2, c * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#170e2b";
        ctx.beginPath();
        if (dod) {
          ctx.lineWidth = Math.max(1.5, c * 0.06);
          ctx.moveTo(c * 0.05, s * c * 0.2 - c * 0.07);
          ctx.lineTo(c * 0.19, s * c * 0.2 + c * 0.07);
          ctx.moveTo(c * 0.19, s * c * 0.2 - c * 0.07);
          ctx.lineTo(c * 0.05, s * c * 0.2 + c * 0.07);
          ctx.stroke();
        } else {
          ctx.arc(c * 0.17, s * c * 0.2, c * 0.075, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    tegnPartikler(na) {
      const ctx = this.ctx;
      this.partikler = this.partikler.filter((p) => na - p.start < p.liv);
      for (const p of this.partikler) {
        const a = (na - p.start) / p.liv;
        ctx.globalAlpha = 1 - a;
        ctx.fillStyle = p.farge;
        ctx.beginPath();
        ctx.arc(p.x + p.vx * a * 40, p.y + p.vy * a * 40, p.r * (1 - a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      this.tekster = this.tekster.filter((p) => na - p.start < 900);
      for (const p of this.tekster) {
        const a = (na - p.start) / 900;
        ctx.globalAlpha = a < 0.75 ? 1 : (1 - a) / 0.25;
        ctx.font = `900 ${Math.round(this.c * 0.95)}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2.5, this.c * 0.15);
        ctx.strokeStyle = "#170e2b";
        ctx.strokeText(p.tekst, p.x, p.y - a * this.c * 1.4);
        ctx.fillStyle = "#6fe07a";
        ctx.fillText(p.tekst, p.x, p.y - a * this.c * 1.4);
      }
      ctx.globalAlpha = 1;
    }
    sprut(x, y, farge) {
      if (R.rolig()) return;
      const [px, py] = this.px(x, y);
      const na = performance.now();
      for (let i = 0; i < 12; i++) {
        const v = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const f = 0.4 + Math.random() * 0.7;
        this.partikler.push({ x: px, y: py, vx: Math.cos(v) * f, vy: Math.sin(v) * f, r: this.c * (0.08 + Math.random() * 0.07), farge: i % 3 ? farge : "#fff1dd", start: na, liv: 450 + Math.random() * 200 });
      }
      this.tekster.push({ x: px, y: py - this.c * 0.3, tekst: "+1", start: na });
    }
  }

  function spiste(S, m) {
    const sp = S.spill;
    const f = FRUKT[sp.mat.t] || FRUKT[0];
    m.sprut(sp.mat.x, sp.mat.y, f.farge);
    R.lyd.tone(520 + Math.min(sp.poeng, 30) * 14, 0, 0.09, "sine", 0.2, 980 + Math.min(sp.poeng, 30) * 20);
    R.vibrer(12);
    if (!nyMat(sp)) return fylt(S);
    m.matInn = performance.now();
    oppdaterHud(S);
    R.lagre();
  }

  // The whole board is snake: that is a win.
  function fylt(S) {
    const sp = S.spill;
    sp.status = "over";
    sp.fylt = true;
    avslutt(S);
  }

  function krasj(S, m) {
    const sp = S.spill;
    sp.status = "over";
    m.dod = { tid: performance.now() };
    R.lyd.feil();
    R.lyd.stoy(0, 0.3, 0.3, 500, "lowpass");
    R.vibrer([90, 50, 160]);
    const ramme = R.$(".sl-ramme");
    if (ramme && !R.rolig()) ramme.classList.add("risting");
    // Saved as finished at once: «tilbake» or a reload during the crash never leaves a dead snake.
    ferdigstill(S);
    R.lagre();
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && R.gaTil("slutt"), R.rolig() ? 700 : 1100);
  }

  // The result and the record (also used when a reload lands in the middle of the crash).
  function ferdigstill(S) {
    const sp = S.spill;
    if (sp.ferdig) return;
    sp.ferdig = true;
    const gml = beste(S, sp);
    sp.resultat = { poeng: sp.poeng, lengde: sp.kropp.length, sek: Math.round(sp.tid / 1000), gml, nyRekord: sp.poeng > gml && gml > 0, forste: !gml && sp.poeng > 0 };
    if (sp.poeng > gml) S.rekorder[nokkel(sp)] = sp.poeng;
    R.statistikk("ferdig", { fart: sp.fart, vegger: sp.vegger, poeng: sp.poeng, sek: sp.resultat.sek });
  }
  function avslutt(S) {
    ferdigstill(S);
    R.gaTil("slutt");
  }

  // ---------- Steering ----------

  function styr(S, r) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.status === "over" || !RETNING[r]) return;
    if (sp.status === "pause") return;
    if (sp.status === "klar") {
      // The first press decides the way – also backwards: the snake simply turns around.
      if (r === MOTSATT[sp.retning]) sp.kropp.reverse();
      sp.retning = r;
      sp.ko = [];
      sp.status = "spiller";
      if (motor) {
        motor.akk = FARTER[sp.fart].ms * 0.6; // the first step comes quickly
        motor.fra = null;
      }
      visStatus(S);
      R.lyd.tone(660, 0, 0.08, "triangle", 0.1, 880);
      R.lagre();
      return;
    }
    if (svingInn(sp, r)) R.lyd.tone(r === "opp" || r === "venstre" ? 760 : 700, 0, 0.03, "triangle", 0.05);
  }

  function pause(S, pa) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.status === "over") return;
    if (pa && sp.status === "spiller") {
      sp.status = "pause";
      R.lagre();
      visStatus(S);
    } else if (!pa && sp.status === "pause") gjenoppta(S);
  }
  let gjenopptar = false; // a «3, 2, 1» before the snake moves again is running
  let borteUnderveis = false; // the tab was hidden or the window lost focus during it

  async function gjenoppta(S) {
    if (gjenopptar) return; // P or space during the countdown: no second countdown on top
    gjenopptar = true;
    borteUnderveis = false;
    const sp = S.spill;
    const fortsatt = R.vakt();
    visStatus(S, true);
    const ok = await R.nedtelling(["3", "2", "1"], 420);
    gjenopptar = false;
    if (!ok || !fortsatt() || sp !== S.spill || sp.status !== "pause") return;
    // The tab was hidden (or the window lost focus) during the countdown: stay in pause.
    if (document.hidden || borteUnderveis) return visStatus(S);
    sp.status = "spiller";
    if (motor) {
      motor.akk = 0;
      motor.vekk();
    }
    visStatus(S);
  }

  function oppdaterHud(S) {
    const sp = S.spill;
    const p = R.$("#sl-poeng");
    if (p) p.textContent = String(sp.poeng);
    const b = R.$("#sl-beste");
    if (b) b.textContent = String(Math.max(beste(S, sp), sp.poeng));
  }

  // The message on the board: ready, paused (or nothing while playing).
  function visStatus(S, skjul) {
    const sp = S.spill;
    const el = R.$(".sl-status");
    if (!el || !sp) return;
    const knapp = R.$('[data-h="pause"]');
    if (knapp) {
      knapp.setAttribute("aria-label", sp.status === "pause" ? "Fortsett" : "Pause");
      knapp.classList.toggle("pauset", sp.status === "pause");
    }
    if (skjul || sp.status === "spiller" || sp.status === "over") {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.classList.toggle("klar", sp.status === "klar");
    el.innerHTML =
      sp.status === "klar"
        ? `<div class="sl-statuskort klar"><p class="sl-stor">Klar?</p><p>Sveip eller trykk på en pil for å starte.</p>${sp.vegger ? "" : "<p class=\"sl-fri\">Uten vegger: Ut på én side, inn på den andre.</p>"}</div>`
        : `<div class="sl-statuskort"><p class="etikett">Pause</p><p class="sl-stor">Slangen venter</p>${R.ui.knapp("Fortsett", "fortsett-spill")}${R.ui.lenke("Start på nytt", "ny")}</div>`;
  }

  function bindKontroll(S, rot) {
    const flate = R.$(".sl-spill", rot);
    if (!flate) return;
    let start = null;
    const ned = (e) => {
      const pil = e.target.closest("[data-retning]");
      if (pil) {
        // The arrows react on touch-down: no waiting for the finger to lift.
        e.preventDefault();
        pil.classList.add("trykket");
        setTimeout(() => pil.classList.remove("trykket"), 140);
        R.lyd.lasOpp();
        styr(R.S, pil.dataset.retning);
        return;
      }
      if (e.target.closest("button, a") || (e.pointerType === "mouse" && e.button !== 0)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, brukt: false };
    };
    const flytt = (e) => {
      if (!start || e.pointerId !== start.id || start.brukt) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // A long swipe may turn twice (right, then down): re-anchor after each turn, and ask for a
      // longer stretch before the next one, so a sloppy swipe never turns twice by accident.
      if (Math.max(Math.abs(dx), Math.abs(dy)) < (start.svinger ? SVEIP * 2 : SVEIP)) return;
      styr(R.S, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "hoyre" : "venstre") : dy > 0 ? "ned" : "opp");
      start.svinger = (start.svinger || 0) + 1;
      start.x = e.clientX;
      start.y = e.clientY;
    };
    const opp = (e) => {
      if (start && e.pointerId === start.id) start = null;
    };
    // Enter/Space on a focused arrow (keyboard) still steers.
    const klikk = (e) => {
      const pil = e.target.closest("[data-retning]");
      if (pil && e.detail === 0) styr(R.S, pil.dataset.retning);
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    flate.addEventListener("pointerdown", ned);
    window.addEventListener("pointermove", flytt);
    window.addEventListener("pointerup", opp);
    window.addEventListener("pointercancel", opp);
    flate.addEventListener("click", klikk);
    flate.addEventListener("touchmove", nei, { passive: false });
    flate.addEventListener("gesturestart", nei);
    flate.addEventListener("contextmenu", nei);
    R.vedForlat(() => {
      flate.removeEventListener("pointerdown", ned);
      window.removeEventListener("pointermove", flytt);
      window.removeEventListener("pointerup", opp);
      window.removeEventListener("pointercancel", opp);
      flate.removeEventListener("click", klikk);
      flate.removeEventListener("touchmove", nei, { passive: false });
      flate.removeEventListener("gesturestart", nei);
      flate.removeEventListener("contextmenu", nei);
    });
  }

  const TASTER = tabell({ ArrowUp: "opp", ArrowDown: "ned", ArrowLeft: "venstre", ArrowRight: "hoyre", w: "opp", s: "ned", a: "venstre", d: "hoyre" });
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.skjerm === "slutt" && (e.key === "Enter" || e.key === " ") && e.target === document.body) {
      e.preventDefault();
      return H.igjen(null, e, S);
    }
    if (S.skjerm !== "spill") return;
    const r = TASTER[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (r) {
      e.preventDefault();
      if (!e.repeat) styr(S, r);
    } else if (e.key === " " || e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (e.target.closest && e.target.closest("button") && e.key === " ") return;
      e.preventDefault();
      pause(S, S.spill.status !== "pause");
    }
  });

  // Hidden tab, locked phone or another app: pause at once.
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

  const fastSide = (pa) => document.documentElement.classList.toggle("sl-fast", !!pa);

  const PIL = {
    opp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg>',
    ned: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>',
    venstre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    hoyre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  };
  const PILNAVN = { opp: "Opp", ned: "Ned", venstre: "Til venstre", hoyre: "Til høyre" };
  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>';

  // The board as it ended, in miniature: the snake, the fruit it never got, and a ✕ where it crashed.
  function miniBrett(sp) {
    if (!Array.isArray(sp.kropp) || !sp.kropp.length) return "";
    const pts = [];
    let cur = [sp.kropp[0][0], sp.kropp[0][1]];
    pts.push(cur);
    for (let i = 1; i < sp.kropp.length; i++) {
      const d = steg1(sp.kropp[i - 1], sp.kropp[i]);
      cur = [cur[0] + d[0], cur[1] + d[1]];
      pts.push(cur);
    }
    const linje = pts.map(([x, y], i) => `${i ? "L" : "M"}${x + 0.5} ${y + 0.5}`).join("") + (pts.length === 1 ? "h0.01" : "");
    // Without walls the line may run past an edge: shifted copies bring it in on the other side.
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const forskyv = [];
    for (const ox of [0, Math.min(...xs) < 0 ? B : 0, Math.max(...xs) > B - 1 ? -B : 0])
      for (const oy of [0, Math.min(...ys) < 0 ? H_ : 0, Math.max(...ys) > H_ - 1 ? -H_ : 0]) if (!forskyv.some(([a, b]) => a === ox && b === oy)) forskyv.push([ox, oy]);
    const slange = forskyv
      .map(([ox, oy]) => `<g transform="translate(${ox} ${oy})"><path class="sl-mini-kant" d="${linje}"/><path class="sl-mini-kropp" d="${linje}"/><circle class="sl-mini-hode" cx="${pts[0][0] + 0.5}" cy="${pts[0][1] + 0.5}" r="0.46"/></g>`)
      .join("");
    const f = sp.mat ? FRUKT[sp.mat.t] || FRUKT[0] : null;
    const mat = f ? `<circle cx="${sp.mat.x + 0.5}" cy="${sp.mat.y + 0.5}" r="0.36" fill="${f.farge}" stroke="#170e2b" stroke-width="0.12"/>` : "";
    let kryss = "";
    if (Array.isArray(sp.krasj) && !sp.fylt) {
      // A crash into a wall is marked on the edge it hit.
      const kx = R.klamp(sp.krasj[0] + 0.5, 0.45, B - 0.45);
      const ky = R.klamp(sp.krasj[1] + 0.5, 0.45, H_ - 0.45);
      const d = `M${kx - 0.42} ${ky - 0.42}l0.84 0.84M${kx + 0.42} ${ky - 0.42}l-0.84 0.84`;
      kryss = `<path d="${d}" stroke="#170e2b" stroke-width="0.5" stroke-linecap="round"/><path d="${d}" stroke="#ff5a4e" stroke-width="0.28" stroke-linecap="round"/>`;
    }
    return `<svg class="sl-mini" viewBox="0 0 ${B} ${H_}" role="img" aria-label="Brettet da spillet var slutt">
      <defs><pattern id="sl-ruter" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#21143d"/><rect width="1" height="1" fill="#261848"/><rect x="1" y="1" width="1" height="1" fill="#261848"/></pattern></defs>
      <rect width="${B}" height="${H_}" fill="url(#sl-ruter)"/>${mat}${slange}${kryss}
    </svg>`;
  }

  const oppsettTekst = (sp) => `${FARTER[sp.fart].navn} · ${sp.vegger ? "med vegger" : "uten vegger"}`;

  // ---------- Start ----------

  R.start({
    id: "slangen",
    versjon: 1,
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      oppsett: { fart: "rolig", vegger: true },
      rekorder: {},
      spill: null,
    }),

    lastet(S) {
      if (!S.oppsett || !FARTER[S.oppsett.fart]) S.oppsett = { fart: "rolig", vegger: true };
      S.oppsett.vegger = S.oppsett.vegger !== false;
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      const sp = S.spill;
      if (sp) {
        const ok =
          FARTER[sp.fart] &&
          Array.isArray(sp.kropp) &&
          sp.kropp.length >= 1 &&
          sp.kropp.every((p) => Array.isArray(p) && p[0] >= 0 && p[0] < B && p[1] >= 0 && p[1] < H_) &&
          RETNING[sp.retning] &&
          (sp.mat === null || (sp.mat && sp.mat.x >= 0 && sp.mat.x < B && sp.mat.y >= 0 && sp.mat.y < H_));
        if (!ok) S.spill = null;
        else {
          sp.ko = [];
          sp.tid = Number(sp.tid) || 0;
          // Back after a reload: a game in motion waits in pause.
          if (sp.status === "spiller") sp.status = "pause";
          if (sp.status === "over" && !sp.ferdig) ferdigstill(S);
        }
      }
      if (S.skjerm === "slutt" && (!S.spill || !S.spill.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!S.spill || S.spill.ferdig)) S.skjerm = S.spill ? "slutt" : "hjem";
    },

    regler: {
      intro: "Styr slangen til maten. Hver bit gjør den lengre – og da blir det trangere om plassen.",
      steg: [
        ["Styr", "Sveip på brettet eller trykk på pilene. Med tastatur: piltastene eller WASD."],
        ["Spis", "Hver frukt gir ett poeng og gjør slangen ett ledd lengre."],
        ["Ikke krasj", "Treffer slangen seg selv, er det slutt. Med vegger er kanten farlig også – uten vegger kommer slangen ut på den andre siden."],
      ],
      tips: [
        "Sving i god tid. Du kan trykke to svinger raskt etter hverandre, så husker slangen begge.",
        "Hold deg langs kantene når slangen blir lang, så får du plass i midten.",
        "Spillet tar pause av seg selv hvis du bytter app. Mellomrom eller P gir pause med tastatur.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = !!(sp && !sp.ferdig);
          const rek = [];
          for (const f of FART_ID)
            for (const v of [true, false]) {
              const p = S.rekorder[`${f}-${v ? "vegg" : "fri"}`];
              if (p) rek.push(`<li><b>${FARTER[f].navn}${v ? "" : ", uten vegger"}</b> ${p}</li>`);
            }
          return (
            R.ui.spillhjem({
              slagordHtml: "Spis, voks og sving.<br><em>Bare ikke bit deg selv i halen!</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? `Fortsett · ${R.flertall(sp.poeng, "poeng", "poeng")}` : "",
                // Starts at once with the last setup («Rolig» the first time); «Bytt nivå» opens it.
                startTekst: `Start spill · ${FARTER[S.oppsett.fart].navn.toLowerCase()}${S.oppsett.vegger ? "" : ", uten vegger"}`,
                ekstraHtml: R.ui.lenkerad(R.ui.lenke("Bytt nivå", "bytt"), R.ui.lenke("Slik spiller du", "regler")),
              }),
              merker: [
                ["3", "hastigheter"],
                ["Vegger", "av/på"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="sl-rekorder" aria-label="Dine rekorder"><p class="etikett">Dine rekorder</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const vegger = S.oppsett.vegger;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Hvor fort?</h2></div>
              <div class="sl-tre">${R.ui.fliser(
                "fart",
                FART_ID.map((f) => {
                  const p = S.rekorder[`${f}-${vegger ? "vegg" : "fri"}`];
                  return { v: f, tittel: FARTER[f].navn, tekst: p ? `Rekord ${p}` : FARTER[f].tekst, ikon: FARTER[f].ikon };
                }),
                S.oppsett.fart,
              )}</div>
            </section>
            <section class="seksjon">
              ${R.ui.bryter("vegger", vegger, "Vegger rundt brettet", vegger ? "Treffer slangen kanten, er det slutt." : "Slangen kommer ut på den andre siden.")}
            </section>
            ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: (S) => FARTER[S.spill.fart].navn,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">Slangen</h1>
            <div class="sl-spill">
              <div class="sl-hud">
                <span class="sl-stat"><small>Poeng</small><b id="sl-poeng">${sp.poeng}</b></span>
                <span class="sl-stat"><small>Rekord</small><b id="sl-beste">${Math.max(beste(S, sp), sp.poeng)}</b></span>
                <button class="sl-pause${sp.status === "pause" ? " pauset" : ""}" data-h="pause" aria-label="${sp.status === "pause" ? "Fortsett" : "Pause"}">${PAUSE}</button>
              </div>
              <div class="sl-flate">
                <div class="sl-ramme${sp.vegger ? " vegger" : " fri"}">
                  <canvas class="sl-lerret" role="img" aria-label="Brettet med slangen og maten"></canvas>
                  <div class="sl-status" hidden></div>
                </div>
              </div>
              ${R.ui.dokk(`<p class="sl-tastatur">Piltaster eller WASD styrer · mellomrom = pause</p><div class="sl-kryss" role="group" aria-label="Styr slangen">
                ${["opp", "venstre", "ned", "hoyre"].map((r) => `<button class="sl-pil ${r}" data-retning="${r}" aria-label="${PILNAVN[r]}">${PIL[r]}</button>`).join("")}
              </div>`)}
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
          R.holdVaken();
        },
        ut(S) {
          const sp = S.spill;
          if (sp && sp.status === "spiller") sp.status = "pause";
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        // A solo result: the top bar says what was played ("Kåringen" is for ranked players).
        tittel: (S) => (S.spill && FARTER[S.spill.fart] ? FARTER[S.spill.fart].navn : "Snake"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { poeng: sp.poeng, lengde: sp.kropp.length, sek: 0 };
          const tittel = sp.fylt ? "Hele brettet!" : r.nyRekord ? "Ny rekord!" : r.poeng >= 15 ? "Godt jobba!" : "Godt forsøk!";
          const linje = r.nyRekord
            ? `Ny personlig rekord! Forrige: ${r.gml}.`
            : r.forste
              ? "Første runde med dette oppsettet – nå har du en rekord å slå!"
              : r.gml
                ? `Rekorden din (${oppsettTekst(sp).toLowerCase()}): ${Math.max(r.gml, r.poeng)}.`
                : "Prøv igjen – slangen blir sulten på nytt!";
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${esc(oppsettTekst(sp))}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
            </div>
            <div class="sl-resultat">
              <div class="sl-tall${r.nyRekord ? " ny" : ""}"><b>${r.poeng}</b><span>poeng</span>${r.nyRekord ? '<i class="sl-ny">Rekord!</i>' : ""}</div>
              <div class="sl-tall"><b>${r.lengde}</b><span>ledd lang</span></div>
            </div>
            <p class="hjelp">${esc(linje)}</p>
            ${miniBrett(sp)}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "bytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if (r.nyRekord || sp.fylt || r.poeng >= 25) {
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
      // «Start spill» / «Nytt spill»: a new snake at once, with the last setup.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig && S.spill.poeng > 0))) || !fortsatt()) return;
        nyttSpill(S);
        R.gaTil("spill");
      },
      bytt: () => R.gaTil("oppsett"),
      // The rules over a moving snake: pause first.
      regler(el, e, S) {
        if (S.skjerm === "spill") pause(S, true);
        R.visRegler();
      },
      fortsett: (el, e, S) => R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem"),
      fart(el, e, S) {
        S.oppsett.fart = FARTER[el.dataset.v] ? el.dataset.v : "rolig";
        R.vis();
      },
      vegger(el, e, S) {
        S.oppsett.vegger = !S.oppsett.vegger;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig && S.spill.poeng > 0))) || !fortsatt()) return;
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        if (S.spill) S.oppsett = { fart: S.spill.fart, vegger: S.spill.vegger };
        nyttSpill(S);
        R.gaTil("spill");
      },
      pause: (el, e, S) => pause(S, S.spill.status !== "pause"),
      "fortsett-spill": (el, e, S) => pause(S, false),
      // From the pause card: a fresh snake at once.
      ny(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
    }),
  });
})();
