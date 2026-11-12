/* Stigespillet — ladders and slides for 1–4 on one phone; the phone plays the empty seats.
   A 10 × 10 board numbered 1–100 back and forth (boustrophedon). Everybody starts on square 1,
   rolls one die and hops that many squares; the foot of a ladder takes you up, the top of a
   slide takes you down. First on 100 wins. No decisions while playing: one big «Kast» button.
   Defaults (house rules): a six gives another roll (on); exact roll to 100 (off — for small
   children, going past 100 counts as home). The rules are pure functions (window.RusjStige)
   tested in test/stigespillet.test.mjs. */
(function () {
  "use strict";

  // ---------- Rules (pure: no DOM, no kit) ----------

  const MAL = 100;
  const START = 1;

  // Column and row of square n (row 0 at the bottom; odd rows run right to left).
  function rute(n) {
    const i = n - 1;
    const rad = Math.floor(i / 10);
    const k = i % 10;
    return { kol: rad % 2 ? 9 - k : k, rad };
  }
  // Centre of square n in board units (x to the right, y down, the board is 10 × 10).
  function midt(n) {
    const { kol, rad } = rute(n);
    return [kol + 0.5, 9.5 - rad];
  }

  // The boards. stiger: [foot, top]; sklier: [top, bottom].
  const BRETT = {
    hagen: {
      navn: "Hagen",
      ikon: "🌻",
      tekst: "Blomster, bier og jordbær",
      stiger: [[6, 35], [10, 31], [16, 36], [19, 39], [54, 75], [57, 82], [77, 98]],
      sklier: [[38, 17], [47, 27], [49, 8], [62, 41], [76, 56], [87, 68], [90, 53]],
      pynt: { 4: "🌷", 12: "🐞", 25: "🍓", 33: "🌼", 46: "🐝", 59: "🍄", 66: "🌻", 79: "🐛", 84: "🌷", 95: "🦋" },
      figurer: ["bonden", "sauen"],
    },
    verdensrommet: {
      navn: "Verdensrommet",
      ikon: "🚀",
      tekst: "Stjerner, planeter og raketter",
      stiger: [[3, 24], [19, 43], [48, 67], [57, 76], [69, 92], [71, 91], [80, 98]],
      sklier: [[34, 13], [50, 29], [55, 4], [62, 41], [84, 58], [87, 52], [95, 66]],
      pynt: { 7: "⭐", 16: "🌙", 22: "🪐", 37: "☄️", 59: "⭐", 73: "🛸", 78: "🌍", 85: "⭐", 93: "🌟" },
      figurer: ["ballongen", "tidsmaskinen"],
    },
    jul: {
      navn: "Jul",
      ikon: "🎄",
      tekst: "Snø, pepperkaker og pakker",
      stiger: [[5, 35], [13, 31], [21, 60], [33, 54], [37, 64], [53, 74], [80, 99]],
      sklier: [[34, 14], [36, 18], [63, 22], [66, 45], [70, 50], [84, 65], [89, 69]],
      pynt: { 4: "❄️", 16: "🎁", 23: "⛄", 39: "🔔", 44: "🍪", 57: "🎁", 68: "❄️", 79: "⭐", 82: "🦌", 93: "🕯️" },
      figurer: ["nissen", "julekalenderen"],
    },
  };
  const BRETTLISTE = Object.keys(BRETT);

  // What is wrong with a board (an empty list when it is fine).
  function sjekkBrett(b) {
    const feil = [];
    const starter = new Map();
    const ender = new Set();
    const alle = [...b.stiger.map(([f, t]) => ["stige", f, t]), ...b.sklier.map(([f, t]) => ["skli", f, t])];
    for (const [type, fra, til] of alle) {
      if (!Number.isInteger(fra) || !Number.isInteger(til) || fra < 1 || fra > MAL || til < 1 || til > MAL) feil.push(`${type} ${fra}→${til} er utenfor brettet`);
      if (fra === START || fra === MAL) feil.push(`${type} ${fra}→${til} starter på ${fra}`);
      if (type === "stige" && til <= fra) feil.push(`stigen ${fra}→${til} går ikke opp`);
      if (type === "skli" && til >= fra) feil.push(`sklia ${fra}→${til} går ikke ned`);
      if (rute(fra).rad === rute(til).rad) feil.push(`${type} ${fra}→${til} ligger på én rad`);
      if (starter.has(fra)) feil.push(`to starter på ${fra}`);
      starter.set(fra, til);
      ender.add(til);
    }
    for (const e of ender) if (starter.has(e)) feil.push(`noe starter der noe annet slutter (${e})`);
    // No loops: follow every start until it stops (no start on an end makes this trivially short).
    for (const fra of starter.keys()) {
      const sett = new Set();
      let p = fra;
      while (starter.has(p)) {
        if (sett.has(p)) {
          feil.push(`løkke fra ${fra}`);
          break;
        }
        sett.add(p);
        p = starter.get(p);
      }
    }
    return feil;
  }

  // The ladder or slide that starts on square n, or null.
  function hoppFra(b, n) {
    for (const [f, t] of b.stiger) if (f === n) return { type: "stige", til: t };
    for (const [f, t] of b.sklier) if (f === n) return { type: "skli", til: t };
    return null;
  }

  // One roll from square pos. regler: { seks (a six gives another roll), eksakt (exact roll to 100) }.
  // → { fra, kast, mal (where the walk ends), til (after a ladder/slide), via, forLangt, vant, ekstra }
  function trekk(pos, kast, b, regler) {
    const r = regler || {};
    let mal = pos + kast;
    let forLangt = false;
    if (mal > MAL) {
      if (r.eksakt) {
        mal = pos;
        forLangt = true;
      } else mal = MAL;
    }
    const h = forLangt ? null : hoppFra(b, mal);
    const til = h ? h.til : mal;
    const vant = til === MAL;
    return { fra: pos, kast, mal, til, via: h ? h.type : null, forLangt, vant, ekstra: kast === 6 && !!r.seks && !vant };
  }

  // The curve of a slide from its top (fra) to its bottom (til): a gentle S, alternating side.
  function skliKurve(fra, til, nr) {
    const [x0, y0] = midt(fra);
    const [x3, y3] = midt(til);
    const dx = x3 - x0;
    const dy = y3 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const k = Math.min(1.5, 0.3 * len) * (nr % 2 ? -1 : 1);
    const klamp = (v) => Math.min(9.6, Math.max(0.4, v));
    const c1 = [klamp(x0 + dx * 0.3 + nx * k), klamp(y0 + dy * 0.3 + ny * k)];
    const c2 = [klamp(x0 + dx * 0.7 - nx * k), klamp(y0 + dy * 0.7 - ny * k)];
    return [[x0, y0], c1, c2, [x3, y3]];
  }
  function punkt(kurve, t) {
    const [a, b, c, d] = kurve;
    const u = 1 - t;
    const f = (i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
    return [f(0), f(1)];
  }

  // Ranking: the winner first, then by square (equal squares share a place).
  function rangering(pos, seter, vinner) {
    const rader = seter.map((s) => ({ sete: s, rute: pos[s] }));
    rader.sort((a, b) => (b.sete === vinner) - (a.sete === vinner) || b.rute - a.rute);
    return rader.map((r) => ({ ...r, plass: r.sete === vinner ? 1 : 1 + rader.filter((x) => x.sete === vinner || x.rute > r.rute).length }));
  }

  const Regler = { MAL, START, BRETT, BRETTLISTE, rute, midt, sjekkBrett, hoppFra, trekk, skliKurve, punkt, rangering };
  window.RusjStige = Regler;

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") return; // loaded by the unit tests

  // ---------- The game ----------

  const esc = R.esc;
  const ROBOTER = ["Robo", "Bipp", "Bopp"];
  const FARGE = ["var(--rosa)", "var(--lampe)", "var(--himmel)", "var(--mynte)"];
  const FARGENAVN = ["Rosa", "Gul", "Blå", "Grønn"];
  const KNAPPFARGE = ["rosa", "lampe", "himmel", "mynte"];
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const nyTerning = () => 1 + Math.floor((R.nyttFro() / 4294967296) * 6);

  let H;
  let laast = false; // a roll or a move is being animated
  let drivId = null; // the phone's next roll

  const deltaker = (sp, s) => sp.seter.find((d) => d.sete === s) || null;
  const erRobot = (sp, s) => {
    const d = deltaker(sp, s);
    return !!d && d.type === "r";
  };
  const navnFor = (sp, s) => {
    const d = deltaker(sp, s);
    return !d ? FARGENAVN[s] : d.type === "r" ? ROBOTER[d.r] : R.navn(d.i);
  };
  const dyrFor = (sp, s) => {
    const d = deltaker(sp, s);
    return d && d.type === "m" ? R.DYR[d.i % R.DYR.length] : "🤖";
  };
  const avatarFor = (sp, s, storrelse) => {
    const d = deltaker(sp, s);
    if (d && d.type === "m") return R.avatar(d.i, storrelse);
    return `<span class="avatar sg-robot ${storrelse || ""}" style="--pf: ${FARGE[s]}" aria-hidden="true">🤖</span>`;
  };
  const brettFor = (sp) => BRETT[sp.brett] || BRETT.hagen;

  function riktigRoboter(S) {
    const m = R.klamp(Number(S.antall) || 1, 1, 4);
    let r = R.klamp(Number(S.oppsett.roboter) || 0, 0, 3);
    if (m + r > 4) r = 4 - m;
    if (m + r < 2) r = 2 - m;
    S.oppsett.roboter = r;
  }

  function nyttSpill(S) {
    riktigRoboter(S);
    const m = R.klamp(Number(S.antall) || 1, 1, 4);
    const r = S.oppsett.roboter;
    const n = m + r;
    const seter = Array.from({ length: n }, (_, k) => (k < m ? { sete: k, type: "m", i: k } : { sete: k, type: "r", r: k - m }));
    S.spill = {
      brett: BRETT[S.oppsett.brett] ? S.oppsett.brett : "hagen",
      seter,
      pos: [0, 1, 2, 3].map((s) => (s < n ? START : null)),
      regler: { seks: !!S.oppsett.seks, eksakt: !!S.oppsett.eksakt },
      tur: 0, // the first on the list begins (put the youngest first)
      terning: 1 + Math.floor(Math.random() * 6),
      vri: 0,
      ekstra: false,
      siste: null,
      ferdig: false,
      vinner: null,
      nr: 1,
      stat: { kast: 0, seksere: [0, 0, 0, 0], stiger: [0, 0, 0, 0], sklier: [0, 0, 0, 0], skli: null, stige: null },
    };
    laast = false;
    R.statistikk("start", { spillere: m, roboter: r, brett: S.spill.brett, seks: S.spill.regler.seks, eksakt: S.spill.regler.eksakt });
  }

  function nesteTur(sp) {
    const n = sp.seter.length;
    sp.tur = (sp.tur + 1) % n;
    sp.ekstra = false;
    sp.nr += 1;
  }

  // ---------- Status line (short, spoken style) ----------

  function statusTekst(sp) {
    if (sp.ferdig) return "I mål! 🏆";
    const navn = navnFor(sp, sp.tur);
    if (erRobot(sp, sp.tur)) return sp.ekstra ? `Seks! ${navn} kaster igjen …` : `${navn} kaster …`;
    if (sp.ekstra) return "Seks! Kast en gang til!";
    return sp.seter.filter((d) => d.type === "m").length > 1 ? "Din tur – kast terningen!" : "Kast terningen!";
  }

  function trekkTekst(t, navn) {
    if (t.forLangt) return `${t.kast}! For langt – ${navn} trenger ${MAL - t.fra}.`;
    if (t.vant) return `${t.kast}! ${navn} er på 100!`;
    if (t.via === "stige") return `${t.kast}! Opp stigen til ${t.til}! 🪜`;
    if (t.via === "skli") return `${t.kast}! Wiii – ned sklia til ${t.til}!`;
    return `${t.kast}! Hopp, hopp – til ${t.til}.`;
  }

  // ---------- 3D die (a CSS cube, as in Brikka and Terninga) ----------

  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const SIDE = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const VIPP = "rotateX(-20deg) rotateY(14deg)";
  const KUBE = [1, 2, 3, 4, 5, 6].map((n) => `<span class="sg-side s${n}">${PIPS[n].map((p) => `<i class="p${p}"></i>`).join("")}</span>`).join("");
  const pose = (v, z, tx, ty) => `${VIPP} rotateZ(${z}deg) rotateX(${SIDE[v][0] + 360 * (tx || 0)}deg) rotateY(${SIDE[v][1] + 360 * (ty || 0)}deg)`;

  function terningHtml(sp) {
    const kan = !erRobot(sp, sp.tur) && !sp.ferdig;
    return `<button class="sg-terning${kan ? " klar" : ""}" id="sg-terning" data-h="kast" data-stille style="--lf: ${FARGE[sp.tur]}" aria-label="${kan ? "Kast terningen" : `Terningen viser ${sp.terning}`}"${kan ? "" : " disabled"}>
      <span class="sg-skygge" aria-hidden="true"></span>
      <span class="sg-hopp" aria-hidden="true"><span class="sg-kube" style="transform: ${pose(sp.terning, sp.vri || 0)}">${KUBE}</span></span>
    </button>`;
  }

  function rasle() {
    for (let k = 0; k < 6; k++) R.lyd.stoy(k * 0.034 + Math.random() * 0.012, 0.024, 0.08 + Math.random() * 0.07, 2600 + Math.random() * 2800);
  }
  function klakk(t, styrke) {
    R.lyd.stoy(t, 0.04, 0.3 * styrke, 1300 + Math.random() * 700);
    R.lyd.tone(160 + Math.random() * 80, t, 0.07, "triangle", 0.15 * styrke, 105);
  }

  function animerTerning(fra, fraVri, til, tilVri) {
    return new Promise((ferdig) => {
      const el = R.$("#sg-terning");
      if (!el) return ferdig();
      const kube = el.querySelector(".sg-kube");
      const hopp = el.querySelector(".sg-hopp");
      const slutt = pose(til, tilVri);
      if (R.rolig() || !kube.animate) {
        kube.style.transform = slutt;
        setTimeout(ferdig, 120);
        return;
      }
      const ms = 880;
      const tx = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
      const ty = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
      const a = kube.animate(
        [
          { transform: pose(fra, fraVri), offset: 0 },
          { transform: pose(fra, fraVri + (tx > 0 ? 25 : -25)), offset: 0.12, easing: "cubic-bezier(.3,.55,.3,1)" },
          { transform: pose(til, tilVri, tx, ty), offset: 1 },
        ],
        { duration: ms, fill: "both" },
      );
      a.onfinish = () => {
        kube.style.transform = slutt;
        a.cancel();
      };
      const b = hopp.animate(
        [
          { transform: "translate(0, 0) scale(1)", offset: 0, easing: "ease-out" },
          { transform: "translate(-3px, 6px) scale(.88)", offset: 0.12, easing: "cubic-bezier(.2,.7,.4,1)" },
          { transform: "translate(-8px, -30px) scale(1.12)", offset: 0.42, easing: "cubic-bezier(.6,0,.9,.5)" },
          { transform: "translate(0, 0) scale(1)", offset: 0.66, easing: "cubic-bezier(.2,.7,.4,1)" },
          { transform: "translate(0, -7px) scale(1.02)", offset: 0.82, easing: "cubic-bezier(.6,0,.9,.5)" },
          { transform: "translate(0, 0) scale(1)", offset: 1 },
        ],
        { duration: ms },
      );
      b.onfinish = () => b.cancel();
      rasle();
      klakk((ms * 0.66) / 1000, 1);
      klakk((ms * 0.99) / 1000, 0.45);
      setTimeout(() => R.vibrer([14, 50, 8]), ms * 0.66);
      setTimeout(ferdig, ms + 40);
    });
  }

  // ---------- Board (an SVG in units of 10 per square, pieces as HTML on top) ----------

  const n1 = (v) => Math.round(v * 100) / 100;
  const SKLIFARGE = ["var(--rosa)", "var(--himmel)", "var(--lampe)", "var(--mynte)", "var(--lilla)"];

  // A ladder: two slightly bowed rails with rungs, an ink line under a wooden one.
  function stigeSvg(fra, til, nr) {
    const [x0, y0] = midt(fra).map((v) => v * 10);
    const [x1, y1] = midt(til).map((v) => v * 10);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy * 2.3;
    const py = ux * 2.3;
    const bue = (nr % 2 ? 1 : -1) * 0.7; // a little hand-drawn bow
    const skinne = (s) => {
      const ax = x0 - ux * 2.5 + px * s;
      const ay = y0 - uy * 2.5 + py * s;
      const bx = x1 + ux * 2.5 + px * s;
      const by = y1 + uy * 2.5 + py * s;
      return `M${n1(ax)} ${n1(ay)} Q${n1((ax + bx) / 2 - uy * bue)} ${n1((ay + by) / 2 + ux * bue)} ${n1(bx)} ${n1(by)}`;
    };
    const trinn = [];
    const antall = Math.max(2, Math.round(len / 4.6));
    for (let k = 1; k <= antall; k++) {
      const t = k / (antall + 1);
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      const skjev = ((k * 7 + nr * 3) % 5) * 0.12 - 0.24;
      trinn.push(`M${n1(cx - px + ux * skjev)} ${n1(cy - py + uy * skjev)} L${n1(cx + px - ux * skjev)} ${n1(cy + py - uy * skjev)}`);
    }
    const d = `${skinne(1)} ${skinne(-1)} ${trinn.join(" ")}`;
    return `<g class="sg-stige"><path class="sg-stige-blekk" d="${d}"/><path class="sg-stige-tre" d="${d}"/></g>`;
  }

  // A slide: a curvy coloured chute with a light stripe, a platform at the top and a puddle below.
  function skliSvg(fra, til, nr) {
    const k = skliKurve(fra, til, nr).map(([x, y]) => [n1(x * 10), n1(y * 10)]);
    const d = `M${k[0][0]} ${k[0][1]} C${k[1][0]} ${k[1][1]} ${k[2][0]} ${k[2][1]} ${k[3][0]} ${k[3][1]}`;
    const farge = SKLIFARGE[nr % SKLIFARGE.length];
    return `<g class="sg-skli" style="--sf: ${farge}">
      <ellipse class="sg-skli-dam" cx="${k[3][0]}" cy="${n1(k[3][1] + 1.6)}" rx="4.2" ry="1.9"/>
      <path class="sg-skli-blekk" d="${d}"/><path class="sg-skli-renne" d="${d}"/><path class="sg-skli-stripe" d="${d}"/>
      <circle class="sg-skli-topp" cx="${k[0][0]}" cy="${k[0][1]}" r="3"/>
    </g>`;
  }

  function brettSvg(sp) {
    const b = brettFor(sp);
    const d = [];
    d.push(`<rect class="sg-plate" x="0" y="0" width="100" height="100" rx="5"/>`);
    for (let n = 1; n <= MAL; n++) {
      const { kol, rad } = rute(n);
      const x = kol * 10;
      const y = (9 - rad) * 10;
      const klasse = n === MAL ? " mal" : n === START ? " start" : (kol + rad) % 2 ? " b" : " a";
      d.push(`<rect class="sg-rute${klasse}" x="${x}" y="${y}" width="10" height="10"/>`);
      if (b.pynt[n]) d.push(`<text class="sg-pynt" x="${x + 6.6}" y="${y + 8.4}">${b.pynt[n]}</text>`);
      if (n === MAL) d.push(`<text class="sg-pynt mal" x="${x + 5}" y="${y + 7.4}">🏆</text>`);
      d.push(`<text class="sg-nr${n === MAL ? " mal" : ""}" x="${x + 1.2}" y="${y + 3.4}">${n}</text>`);
    }
    d.push(`<rect class="sg-ramme" x="0" y="0" width="100" height="100" rx="5"/>`);
    b.sklier.forEach(([f, t], nr) => d.push(skliSvg(f, t, nr)));
    b.stiger.forEach(([f, t], nr) => d.push(stigeSvg(f, t, nr)));
    return `<svg class="sg-bunn" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${d.join("")}</svg>`;
  }

  // Where each seat's piece stands (pieces sharing a square are spread out and a little smaller).
  function plasser(sp) {
    const ut = {};
    const per = new Map();
    sp.seter.forEach((d) => {
      const p = sp.pos[d.sete];
      if (!per.has(p)) per.set(p, []);
      per.get(p).push(d.sete);
    });
    const SPRED = [[-0.2, -0.2], [0.2, 0.2], [0.2, -0.2], [-0.2, 0.2]];
    for (const [p, seter] of per) {
      const [x, y] = midt(p);
      seter.forEach((s, k) => {
        ut[s] = seter.length > 1 ? { x: x + SPRED[k][0], y: y + SPRED[k][1], sk: 0.56 } : { x, y, sk: 1 };
      });
    }
    return ut;
  }

  function brikkerHtml(sp) {
    const pl = plasser(sp);
    // The current player's piece last, so it is on top.
    const rekke = sp.seter.map((d) => d.sete).sort((a, b) => (a === sp.tur) - (b === sp.tur));
    return rekke
      .map((s) => {
        const p = pl[s];
        const na = s === sp.tur && !sp.ferdig;
        return `<span class="sg-brikke${na ? " na" : ""}" data-sete="${s}" style="--x: ${n1(p.x)}; --y: ${n1(p.y)}; --sk: ${p.sk}; --lf: ${FARGE[s]}"><span class="sg-brikke-indre"><span class="sg-dyr">${dyrFor(sp, s)}</span></span></span>`;
      })
      .join("");
  }

  function figurerHtml(sp) {
    const [a, b] = brettFor(sp).figurer;
    return `<span class="sg-figur f1" aria-hidden="true">${R.figur(a)}</span><span class="sg-figur f2" aria-hidden="true">${R.figur(b)}</span>`;
  }

  // Everyone in turn order with the square they stand on (the current player lifted).
  function rekkeHtml(sp) {
    return `<ol class="sg-rekke" aria-label="Rekkefølgen">${sp.seter
      .map((d) => `<li class="${d.sete === sp.tur && !sp.ferdig ? "na" : ""}" style="--lf: ${FARGE[d.sete]}" aria-label="${esc(`${navnFor(sp, d.sete)} på ${sp.pos[d.sete]}`)}">${avatarFor(sp, d.sete)}<b aria-hidden="true">${sp.pos[d.sete]}</b></li>`)
      .join("")}</ol>`;
  }

  function brettBeskrivelse(sp) {
    return sp.seter.map((d) => `${navnFor(sp, d.sete)} på ${sp.pos[d.sete]}`).join(", ");
  }

  // ---------- Animations ----------

  const translat = ([x, y], skala, rot) => `translate(${((x - 0.5) * 100).toFixed(1)}%, ${((y - 0.5) * 100).toFixed(1)}%) scale(${skala || 1})${rot ? ` rotate(${rot}deg)` : ""}`;

  // Nothing moves while a sheet is open: wait until it closes.
  async function ventPaArk(fortsatt) {
    while (R.arkApent() && fortsatt()) await R.vent(200);
  }

  function hoppLyd(n) {
    R.lyd.tone(620 + n * 60, 0, 0.05, "triangle", 0.08, 820 + n * 60);
  }

  async function animerTrekk(sete, t, fortsatt) {
    const el = R.$(`#sg-brett .sg-brikke[data-sete="${sete}"]`);
    const status = R.$("#sg-status");
    if (!el || R.rolig() || !el.animate) return;
    el.classList.add("flytter");
    const sp = R.S.spill;
    const start = plasser({ ...sp, pos: sp.pos.map((p, s) => (s === sete ? t.fra : p)) })[sete];
    let fra = [start.x, start.y];
    const kjor = (rammer, ms, easing) =>
      new Promise((r) => {
        const a = el.animate(rammer, { duration: ms, easing: easing || "ease-in-out", fill: "forwards" });
        a.onfinish = r;
      });
    if (t.forLangt) {
      await kjor([{ transform: translat(fra) }, { transform: translat([fra[0] + 0.12, fra[1]]) }, { transform: translat([fra[0] - 0.12, fra[1]]) }, { transform: translat(fra) }], 420);
      return;
    }
    // Hop square by square.
    for (let p = t.fra + 1, i = 0; p <= t.mal; p++, i++) {
      await ventPaArk(fortsatt);
      if (!fortsatt()) return;
      const til = midt(p);
      hoppLyd(i);
      await kjor([{ transform: translat(fra) }, { transform: translat([(fra[0] + til[0]) / 2, (fra[1] + til[1]) / 2 - 0.35], 1.2), offset: 0.5 }, { transform: translat(til) }], 210);
      fra = til;
    }
    if (!t.via) return;
    await R.vent(160);
    await ventPaArk(fortsatt);
    if (!fortsatt()) return;
    if (status) status.textContent = t.via === "stige" ? "Opp stigen! 🪜" : "Wiii – ned sklia!";
    const til = midt(t.til);
    if (t.via === "stige") {
      // Climb: rung by rung, swaying a little, with a rising little tune.
      const trinn = Math.max(3, Math.round(Math.hypot(til[0] - fra[0], til[1] - fra[1]) * 2));
      const rammer = [];
      for (let k = 0; k <= trinn; k++) {
        const u = k / trinn;
        rammer.push({ transform: translat([fra[0] + (til[0] - fra[0]) * u + (k % 2 ? 0.08 : -0.08) * (k && k < trinn ? 1 : 0), fra[1] + (til[1] - fra[1]) * u], 1.1, k % 2 ? 6 : -6) });
      }
      rammer[trinn] = { transform: translat(til) };
      for (let k = 0; k < Math.min(trinn, 10); k++) R.lyd.tone(420 + k * 70, k * 0.09, 0.08, "triangle", 0.1, 520 + k * 70);
      R.vibrer([10, 40, 10, 40, 10]);
      await kjor(rammer, Math.min(1600, 160 * trinn), "linear");
    } else {
      // Slide: follow the chute, faster and faster, spinning a little, and splash at the bottom.
      const b = brettFor(R.S.spill);
      const nr = b.sklier.findIndex(([f]) => f === t.mal);
      const kurve = skliKurve(t.mal, t.til, nr < 0 ? 0 : nr);
      const rammer = [];
      const N = 26;
      for (let k = 0; k <= N; k++) rammer.push({ transform: translat(punkt(kurve, k / N), 1.05, k === N ? 0 : Math.sin(k / 3) * 14) });
      rammer[N] = { transform: translat(til) };
      R.lyd.tone(1150, 0, 0.95, "sine", 0.12, 240);
      R.vibrer([60]);
      await kjor(rammer, 1100, "cubic-bezier(.45,0,.75,1)");
      R.lyd.stoy(0, 0.16, 0.18, 900, "lowpass");
      await kjor([{ transform: translat(til, 1.25) }, { transform: translat(til, 0.9) }, { transform: translat(til) }], 260);
    }
  }

  // ---------- Turn engine ----------

  function opptatt() {
    const brett = R.$("#sg-brett");
    if (brett) brett.dataset.opptatt = "1";
  }

  function stopp() {
    clearTimeout(drivId);
    drivId = null;
  }

  // The phone rolls by itself on its own turns — never while a sheet is open.
  function driv() {
    stopp();
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || laast) return;
    if (!erRobot(sp, sp.tur)) return;
    if (R.arkApent()) {
      drivId = setTimeout(driv, 400);
      return;
    }
    drivId = setTimeout(() => {
      if (R.arkApent()) return driv();
      kast(R.S);
    }, R.rolig() ? 450 : 1000);
  }

  async function kast(S) {
    const sp = S.spill;
    if (!pagar(S) || laast || S.skjerm !== "spill" || R.arkApent()) return;
    stopp();
    const sete = sp.tur;
    const navn = navnFor(sp, sete);
    const fra = sp.terning;
    const fraVri = sp.vri || 0;
    const v = nyTerning();
    const t = trekk(sp.pos[sete], v, brettFor(sp), sp.regler);
    sp.terning = v;
    sp.vri = Math.round(Math.random() * 30 - 15);
    sp.siste = { sete, ...t };
    sp.pos[sete] = t.til;
    sp.stat.kast += 1;
    if (v === 6) sp.stat.seksere[sete] += 1;
    if (t.via === "stige") {
      sp.stat.stiger[sete] += 1;
      if (!sp.stat.stige || t.til - t.mal > sp.stat.stige.til - sp.stat.stige.fra) sp.stat.stige = { sete, fra: t.mal, til: t.til };
    }
    if (t.via === "skli") {
      sp.stat.sklier[sete] += 1;
      if (!sp.stat.skli || t.mal - t.til > sp.stat.skli.fra - sp.stat.skli.til) sp.stat.skli = { sete, fra: t.mal, til: t.til };
    }
    if (t.vant) {
      sp.ferdig = true;
      sp.vinner = sete;
      avsluttSpill(S);
    } else if (t.ekstra) sp.ekstra = true;
    else nesteTur(sp);
    R.lagre(); // the whole move is saved before anything moves: a reload never loses it
    laast = true;
    opptatt();
    const knapp = R.$('#skjerm .dokk [data-h="kast"]');
    if (knapp) knapp.disabled = true;
    const terning = R.$("#sg-terning");
    if (terning) terning.disabled = true;
    const status = R.$("#sg-status");
    if (status) status.textContent = "Terningen ruller …";
    const fortsatt = R.vakt();
    await animerTerning(fra, fraVri, v, sp.vri);
    if (!fortsatt()) return (laast = false);
    if (status) status.textContent = trekkTekst(t, navn);
    if (v === 6) R.lyd.pling();
    await animerTrekk(sete, t, fortsatt);
    laast = false;
    if (!fortsatt()) return;
    R.si(trekkTekst(t, navn));
    if (t.via === "stige") R.lyd.riktig();
    if (t.vant) {
      R.lyd.fanfare();
      R.konfetti();
      R.vibrer([60, 40, 60, 40, 160]);
      R.vis();
      await R.vent(R.rolig() ? 400 : 1600);
      if (fortsatt()) R.gaTil("slutt");
      return;
    }
    await R.vent(R.rolig() ? 150 : t.via ? 700 : 450);
    if (!fortsatt()) return;
    R.vis();
    if (!erRobot(sp, sp.tur)) R.si(sp.ekstra ? "Seks! Kast en gang til." : `${navnFor(sp, sp.tur)} sin tur.`);
    driv();
  }

  function avsluttSpill(S) {
    const sp = S.spill;
    const seter = sp.seter.map((d) => d.sete);
    const rang = rangering(sp.pos, seter, sp.vinner);
    if (sp.vinner == null) sp.vinner = rang[0].sete;
    const mennesker = rang.filter((r) => !erRobot(sp, r.sete));
    if (mennesker.length >= 2) R.kveld.registrer(mennesker.map((r) => ({ navn: navnFor(sp, r.sete), poeng: r.rute })));
    S.sist = { navn: navnFor(sp, sp.vinner), brett: sp.brett, robot: erRobot(sp, sp.vinner) };
    R.statistikk("ferdig", { spillere: sp.seter.length, kast: sp.stat.kast, robot: erRobot(sp, sp.vinner), fullfort: sp.pos[sp.vinner] === MAL, brett: sp.brett });
  }

  // ---------- Start ----------

  const OPPSETT = { roboter: 0, brett: "hagen", seks: true, eksakt: false };

  R.start({
    id: "stigespillet",
    versjon: 1,
    pagar,

    tilstand: () => ({ antall: 2, oppsett: { ...OPPSETT }, spill: null, sist: null }),

    lastet(S) {
      S.oppsett = Object.assign({ ...OPPSETT }, S.oppsett || {});
      if (!BRETT[S.oppsett.brett]) S.oppsett.brett = "hagen";
      S.antall = R.klamp(Number(S.antall) || 2, 1, 4);
      riktigRoboter(S);
      const sp = S.spill;
      if (sp) {
        const ok =
          BRETT[sp.brett] &&
          Array.isArray(sp.seter) && sp.seter.length >= 2 && sp.seter.length <= 4 &&
          sp.seter.every((d, k) => d.sete === k && (d.type === "m" || d.type === "r")) &&
          Array.isArray(sp.pos) && sp.pos.length === 4 &&
          sp.seter.every((d) => Number.isInteger(sp.pos[d.sete]) && sp.pos[d.sete] >= START && sp.pos[d.sete] <= MAL) &&
          Number.isInteger(sp.tur) && !!deltaker(sp, sp.tur) &&
          Number.isInteger(sp.terning) && sp.terning >= 1 && sp.terning <= 6 &&
          sp.regler && sp.stat && Array.isArray(sp.stat.seksere);
        if (!ok) S.spill = null;
      }
      if (S.sist && typeof S.sist.navn !== "string") S.sist = null;
      if (S.skjerm === "spill" && !S.spill) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = S.spill ? "spill" : "hjem";
    },

    vedSpillere(S) {
      const m = R.klamp(Number(S.antall) || 1, 1, 4);
      if (m === 1 && !S.oppsett.roboter) S.oppsett.roboter = 1;
      riktigRoboter(S);
    },

    regler: {
      intro: "Først til rute 100 vinner! Stigene tar deg opp, sklia tar deg ned.",
      steg: [
        ["Kast terningen", "Trykk på den store «Kast»-knappen. Brikka di hopper like mange ruter som terningen viser."],
        ["Stiger og sklier", "Lander du nederst på en stige, klatrer du opp. Lander du øverst på en sklie, sklir du ned."],
        ["Først til 100", "Den som først kommer til rute 100 med pokalen, vinner!"],
      ],
      tips: [
        "Alle starter på rute 1. Den som står først på lista, begynner – sett gjerne den yngste først.",
        "Seks gir et ekstra kast. Det kan skrus av når dere gjør klart.",
        "Vanlig er at du kommer i mål selv om du slår for mye. Vil dere ha det vanskeligere, slå på «Nøyaktig til 100».",
        "Mobilen kan ta de ledige plassene – også når du spiller alene.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Klatre opp stigene –<br><em>og skli ned sklia!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · ${navnFor(S.spill, S.spill.tur)} sin tur` : "",
              ekstraHtml:
                (S.sist && !pagar(S) ? `<p class="hjelp sg-sist">Sist vant ${esc(S.sist.navn)} ${(BRETT[S.sist.brett] || BRETT.hagen).ikon}</p>` : "") +
                R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["1–4", "spillere"],
              ["10–25", "min"],
              ["0", "reklame"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          riktigRoboter(S);
          const m = R.klamp(Number(S.antall) || 1, 1, 4);
          const r = S.oppsett.roboter;
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          ${R.ui.spillere({ min: 1, max: 4, tittel: "Hvem spiller?", hjelp: m === 1 ? "Alene? Da spiller du mot mobilen." : "Den øverste begynner – sett gjerne den yngste først." })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Mobilen spiller også</h2><span class="tall">${m + r} i alt</span></div>
            ${R.ui.seg("roboter", [[0, "Ingen"], [1, "1"], [2, "2"], [3, "3"]], r, { etikett: "Hvor mange plasser mobilen tar", av: (v) => m + Number(v) > 4 || m + Number(v) < 2 })}
            <p class="hjelp">Mobilen tar de ledige plassene${r ? ` – ${r > 1 ? "de heter" : "den heter"} ${esc(R.ramsOpp(ROBOTER.slice(0, r)))} 🤖` : ""}.</p>
          </section>
          <section class="seksjon">
            <h2>Velg brett</h2>
            ${R.ui.fliser("brett", BRETTLISTE.map((v) => ({ v, tittel: BRETT[v].navn, tekst: BRETT[v].tekst, ikon: BRETT[v].ikon })), S.oppsett.brett)}
          </section>
          <section class="seksjon">
            <h2>Husregler</h2>
            ${R.ui.bryter("seks", S.oppsett.seks, "Seks gir et ekstra kast", "Slår du seks, kaster du en gang til.")}
            ${R.ui.bryter("eksakt", S.oppsett.eksakt, "Nøyaktig til 100", S.oppsett.eksakt ? "Du må slå akkurat nok for å komme i mål." : "Av: slår du for mye, kommer du i mål likevel.")}
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor", ikon: "🎲" }))}`;
        },
      },

      spill: {
        tittel: (S) => brettFor(S.spill).navn,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const s = sp.tur;
          const robot = erRobot(sp, s);
          let knapp;
          if (sp.ferdig) knapp = R.ui.knapp("I mål!", "kast", { variant: "stor", ikon: "🏆", av: true });
          else if (robot) knapp = R.ui.knapp(`${navnFor(sp, s)} kaster …`, "kast", { variant: "stor", ikon: "🤖", av: true });
          else knapp = R.ui.knapp(sp.ekstra ? "Kast igjen" : "Kast", "kast", { variant: `stor ${KNAPPFARGE[s]} sg-kast`, ikon: "🎲" });
          return `
            <div class="sg-tur${robot ? " robot" : ""}" style="--lf: ${FARGE[s]}">
              <span class="sg-meg">${avatarFor(sp, s, "mid")}<span class="sg-meg-rute" aria-hidden="true">${sp.pos[s]}</span></span>
              <div class="sg-hvem">
                <p class="etikett">${esc(FARGENAVN[s])}${robot ? " · mobilen" : " · din tur"}</p>
                <h1 id="skjerm-tittel">${esc(navnFor(sp, s))}</h1>
                <p class="sg-status" id="sg-status" aria-live="polite">${esc(statusTekst(sp))}</p>
              </div>
              ${terningHtml(sp)}
            </div>
            <div class="sg-brett tema-${esc(sp.brett)}${sp.ferdig ? " ferdig" : ""}" id="sg-brett" role="img" aria-label="${esc(`Brettet: ${brettBeskrivelse(sp)}`)}">
              ${brettSvg(sp)}
              ${figurerHtml(sp)}
              ${brikkerHtml(sp)}
            </div>
            ${rekkeHtml(sp)}
            ${R.ui.dokk(knapp, R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          if (S.spill.ferdig) return R.gaTil("slutt"); // reloaded during the winner's celebration
          laast = false;
          R.holdVaken();
          R.vedForlat(stopp);
          driv();
        },
        ut() {
          stopp();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const seter = sp.seter.map((d) => d.sete);
          const rang = rangering(sp.pos, seter, sp.vinner);
          const vinner = rang[0];
          const iMal = sp.pos[vinner.sete] === MAL;
          const robotVant = erRobot(sp, vinner.sete);
          const rad = (r) => {
            const d = deltaker(sp, r.sete);
            const poeng = r.sete === sp.vinner ? MAL : r.rute;
            return d.type === "m" ? { i: d.i, navn: navnFor(sp, r.sete), poeng } : { lag: r.sete, navn: navnFor(sp, r.sete), poeng };
          };
          // The kit's podium, with «rute N» under each name.
          const pall = R.ui.pall(rang.map(rad), { enhet: "#" }).replace(/<span class="poeng">(\d+) #<\/span>/g, '<span class="poeng">rute $1</span>');
          const st = sp.stat;
          const flest = (liste) => {
            const maks = Math.max(...seter.map((s) => liste[s]));
            return { maks, hvem: seter.filter((s) => liste[s] === maks).map((s) => navnFor(sp, s)) };
          };
          const seks = flest(st.seksere);
          const fakta = [
            st.skli ? ["🛝", "Lengste skli", `${st.skli.fra} → ${st.skli.til}`, navnFor(sp, st.skli.sete)] : null,
            st.stige ? ["🪜", "Lengste stige", `${st.stige.fra} → ${st.stige.til}`, navnFor(sp, st.stige.sete)] : null,
            seks.maks ? ["🎲", "Flest seksere", R.flertall(seks.maks, "sekser", "seksere"), R.ramsOpp(seks.hvem)] : null,
          ].filter(Boolean);
          return `
            <div class="banner aksent">
              <span class="sg-vinner" style="--lf: ${FARGE[vinner.sete]}">${avatarFor(sp, vinner.sete, "gigant")}<span class="sg-krone" aria-hidden="true">👑</span></span>
              <h1 id="skjerm-tittel">${esc(navnFor(sp, vinner.sete))} vinner!</h1>
              <p class="ingress">${iMal ? (robotVant ? "Først til 100 – mobilen var heldig denne gangen. Revansj?" : "Først til 100. Godt jobba!") : "Lengst fram da dere avsluttet."}</p>
            </div>
            ${pall}
            <ol class="sg-rang">${rang
              .map(
                (r) => `<li class="${r.plass === 1 ? "leder" : ""}" style="--lf: ${FARGE[r.sete]}"><span class="plass-nr">${r.plass}</span>${avatarFor(sp, r.sete)}<span class="navn">${esc(navnFor(sp, r.sete))}</span><span class="sg-rang-rute">${r.rute === MAL ? "🏆 100" : `rute ${r.rute}`}</span></li>`,
              )
              .join("")}</ol>
            ${fakta.length ? `<ul class="sg-fakta">${fakta.map(([ikon, tittel, verdi, hvem]) => `<li class="sg-faktum"><span class="sg-faktum-ikon" aria-hidden="true">${ikon}</span><span><span class="etikett">${esc(tittel)}</span><b>${esc(verdi)}</b><span>${esc(hvem)}</span></span></li>`).join("")}</ul>` : ""}
            ${R.ui.flereSpill({ antall: sp.seter.filter((d) => d.type === "m").length })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          if (!erRobot(sp, sp.vinner)) {
            R.lyd.fanfare();
            R.konfetti();
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
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil("spill");
      },
      roboter(el, e, S) {
        S.oppsett.roboter = Number(el.dataset.v) || 0;
        riktigRoboter(S);
        R.vis();
      },
      brett(el, e, S) {
        if (BRETT[el.dataset.v]) S.oppsett.brett = el.dataset.v;
        R.vis();
      },
      seks(el, e, S) {
        S.oppsett.seks = !S.oppsett.seks;
        R.vis();
      },
      eksakt(el, e, S) {
        S.oppsett.eksakt = !S.oppsett.eksakt;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
        const sp = S.spill;
        setTimeout(() => {
          if (R.S.spill === sp && R.S.skjerm === "spill") R.toast(`${navnFor(sp, sp.tur)} begynner!`);
        }, 400);
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      kast(el, e, S) {
        if (S.spill && !erRobot(S.spill, S.spill.tur)) return kast(S);
      },
      async avslutt(el, e, S) {
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        stopp();
        const ja = await R.bekreft("Avslutte spillet?", "Den som har kommet lengst, blir kåret.", "Avslutt", "Spill videre");
        if (!fortsatt()) return;
        if (!ja || !pagar(S)) return driv();
        const sp = S.spill;
        sp.ferdig = true;
        sp.vinner = null;
        avsluttSpill(S);
        R.gaTil("slutt");
      },
    }),
  });
})();
