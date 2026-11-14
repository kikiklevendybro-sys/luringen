/* Musa — a maze for children. Help the mouse through the hedges to the cheese in the far corner.
   Every maze is new (a seeded generator: a «perfect» maze, so there is exactly one way between any
   two cells). A swipe, an arrow or a key sends the mouse along the corridor to the next crossing;
   a finger on the mouse drags it cell by cell. No clock while playing, no failure: a dead end just
   means going back. The maze rules at the top are pure functions; test/musa.test.mjs loads this
   file without the kit. */
(function () {
  "use strict";

  // ---------- The maze (no kit needed) ----------
  // A cell is a number of open sides: 1 up, 2 right, 4 down, 8 left. Cell c is (c % b, c / b).
  const RETNINGER = {
    opp: { dx: 0, dy: -1, bit: 1, mot: 4 },
    hoyre: { dx: 1, dy: 0, bit: 2, mot: 8 },
    ned: { dx: 0, dy: 1, bit: 4, mot: 1 },
    venstre: { dx: -1, dy: 0, bit: 8, mot: 2 },
  };
  const RETNINGSLISTE = Object.keys(RETNINGER);
  // Square mazes in four sizes (cells per side).
  const STORRELSER = [5, 7, 10, 14];

  const Labyrint = {
    // A random spanning tree of the grid (depth-first with backtracking): long winding corridors,
    // every cell reachable, no loops. rng: a function that gives numbers from 0 to 1.
    lag(b, h, rng) {
      const n = b * h;
      const celler = new Array(n).fill(0);
      const sett = new Array(n).fill(false);
      const forste = Math.floor(rng() * n);
      const stabel = [forste];
      sett[forste] = true;
      while (stabel.length) {
        const c = stabel[stabel.length - 1];
        const x = c % b;
        const y = (c / b) | 0;
        const nye = [];
        for (const r of RETNINGSLISTE) {
          const d = RETNINGER[r];
          const nx = x + d.dx;
          const ny = y + d.dy;
          if (nx < 0 || ny < 0 || nx >= b || ny >= h) continue;
          const m = ny * b + nx;
          if (!sett[m]) nye.push([m, d]);
        }
        if (!nye.length) {
          stabel.pop();
          continue;
        }
        const [m, d] = nye[Math.floor(rng() * nye.length)];
        celler[c] |= d.bit;
        celler[m] |= d.mot;
        sett[m] = true;
        stabel.push(m);
      }
      return { b, h, celler };
    },
    // The cell one step in direction r from c, or -1 behind a wall.
    steg(lab, c, r) {
      const d = RETNINGER[r];
      if (!d || !(lab.celler[c] & d.bit)) return -1;
      return c + d.dx + d.dy * lab.b;
    },
    // Open sides of a cell.
    utganger(lab, c) {
      return RETNINGSLISTE.filter((r) => lab.celler[c] & RETNINGER[r].bit).length;
    },
    // Along the corridor: from c in direction r, through every cell with exactly two open sides
    // (turning with the corridor), to the next crossing, a dead end or the goal. The cells passed,
    // without c; empty behind a wall.
    glid(lab, c, r, mal) {
      let forrige = c;
      let na = Labyrint.steg(lab, c, r);
      if (na < 0) return [];
      const vei = [na];
      while (na !== mal && Labyrint.utganger(lab, na) === 2 && vei.length <= lab.celler.length) {
        const neste = RETNINGSLISTE.map((x) => Labyrint.steg(lab, na, x)).find((m) => m >= 0 && m !== forrige);
        forrige = na;
        na = neste;
        vei.push(na);
      }
      return vei;
    },
    // Distances from c to every cell (breadth first); -1 where there is no way.
    avstander(lab, c) {
      const avst = new Array(lab.celler.length).fill(-1);
      avst[c] = 0;
      const ko = [c];
      for (let i = 0; i < ko.length; i++) {
        const a = ko[i];
        for (const r of RETNINGSLISTE) {
          const m = Labyrint.steg(lab, a, r);
          if (m >= 0 && avst[m] < 0) {
            avst[m] = avst[a] + 1;
            ko.push(m);
          }
        }
      }
      return avst;
    },
    // The way from a to b (the cells after a, ending with b); [] when a === b or there is none.
    vei(lab, a, b) {
      const fra = new Array(lab.celler.length).fill(-1);
      fra[a] = a;
      const ko = [a];
      for (let i = 0; i < ko.length && fra[b] < 0; i++) {
        const c = ko[i];
        for (const r of RETNINGSLISTE) {
          const m = Labyrint.steg(lab, c, r);
          if (m >= 0 && fra[m] < 0) {
            fra[m] = c;
            ko.push(m);
          }
        }
      }
      if (a === b || fra[b] < 0) return [];
      const ut = [];
      for (let c = b; c !== a; c = fra[c]) ut.push(c);
      return ut.reverse();
    },
    // The walk so far as the way from the start to here: a step back onto the cell before
    // removes the last cell (in a perfect maze that is the only way back).
    spor(spor, m) {
      if (spor.length >= 2 && spor[spor.length - 2] === m) spor.pop();
      else spor.push(m);
      return spor;
    },
    // The direction from cell a to its neighbour b, or null.
    retning(lab, a, b) {
      return RETNINGSLISTE.find((r) => Labyrint.steg(lab, a, r) === b) || null;
    },
  };

  // Rough praise for a solved maze by how many cells were walked compared to the shortest way.
  const omvei = (steg, korteste) => (korteste > 0 ? steg / korteste : 1);

  const R = window.Rusj;
  if (!R) {
    window.Musa = { Labyrint, RETNINGER, STORRELSER, omvei };
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "musa") + "/";
  const STR_NAVN = { 5: R.t("Liten"), 7: R.t("Middels"), 10: R.t("Stor"), 14: R.t("Kjempestor") };
  const STR_LABYRINT = { 5: R.t("liten labyrint"), 7: R.t("middels labyrint"), 10: R.t("stor labyrint"), 14: R.t("kjempestor labyrint") };
  const ROS = [R.t("Bra!"), R.t("Supert!"), R.t("Godt jobba!"), R.t("Knallbra!"), R.t("Du klarte det!")];
  const PILNAVN = { opp: R.t("Opp"), ned: R.t("Ned"), venstre: R.t("Til venstre"), hoyre: R.t("Til høyre") };
  const PIL = {
    opp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg>',
    ned: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>',
    venstre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    hoyre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  };
  const STEG_MS = 85; // one cell of running

  window.Musa = { Labyrint, RETNINGER, STORRELSER, omvei };

  // The maze of a saved game is drawn again from its seed (only the seed is stored).
  let lab = null;
  let labFor = "";
  function labyrint(sp) {
    const nokkel = sp.str + ":" + sp.fro;
    if (labFor !== nokkel) {
      lab = Labyrint.lag(sp.str, sp.str, R.rng(sp.fro >>> 0));
      labFor = nokkel;
    }
    return lab;
  }
  window.Musa.labyrint = () => (R.S && R.S.spill ? labyrint(R.S.spill) : null);
  const mal = (sp) => sp.str * sp.str - 1;

  // ---------- Clock (only shown afterwards: no clock that pushes) ----------
  let klokkeFra = null;
  function startKlokke(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || klokkeFra != null || document.hidden) return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && S.spill;
    if (sp && klokkeFra != null) sp.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }
  const visTid = (sek) => Math.floor(sek / 60) + ":" + String(sek % 60).padStart(2, "0");
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill") return;
    if (document.hidden) {
      stoppKlokke(S);
      R.lagre();
    } else startKlokke(S);
  });

  function nyttSpill(S) {
    const str = STORRELSER.includes(S.oppsett.str) ? S.oppsett.str : 5;
    S.spill = { str, fro: R.nyttFro() >>> 0, pos: 0, spor: [0], steg: 0, tid: 0, hjelp: 0, ferdig: false, resultat: null };
    R.statistikk("start", { str });
  }

  // ---------- Drawing ----------

  // The mouse, facing right, in a 100 × 100 box (the cell is 1 × 1).
  const MUS = `<g transform="translate(-.5 -.55) scale(.01)">
      <path d="M22 66 Q4 70 6 52 Q8 40 18 42" fill="none" stroke="#170e2b" stroke-width="9" stroke-linecap="round"/>
      <path d="M22 66 Q4 70 6 52 Q8 40 18 42" fill="none" stroke="#ff9ec4" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="46" cy="64" rx="28" ry="21" fill="var(--mu-mus)" stroke="#170e2b" stroke-width="5"/>
      <ellipse cx="34" cy="83" rx="7" ry="4.5" fill="#ff9ec4" stroke="#170e2b" stroke-width="3.5"/>
      <ellipse cx="58" cy="84" rx="7" ry="4.5" fill="#ff9ec4" stroke="#170e2b" stroke-width="3.5"/>
      <circle cx="58" cy="30" r="15" fill="var(--mu-mus)" stroke="#170e2b" stroke-width="5"/>
      <circle cx="58" cy="30" r="8" fill="#ff9ec4"/>
      <path d="M50 50 Q60 32 80 40 Q96 46 96 56 Q92 66 72 68 Q54 68 50 50Z" fill="var(--mu-mus)" stroke="#170e2b" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="96" cy="55" r="5.5" fill="#ff6f9f" stroke="#170e2b" stroke-width="3"/>
      <circle cx="76" cy="49" r="5.4" fill="#170e2b"/><circle cx="74.5" cy="47.3" r="1.8" fill="#fff"/>
      <ellipse cx="70" cy="59" rx="5" ry="3" fill="rgba(255,79,139,.45)"/>
      <path d="M86 62 L100 66 M84 65 L96 72" stroke="#170e2b" stroke-width="2.4" stroke-linecap="round"/>
    </g>`;
  // The cheese: a wedge with holes.
  const OST = `<g transform="translate(-.5 -.5) scale(.01)">
      <path d="M12 74 L12 56 L80 26 L90 46 L90 66 Z" fill="#ffd23f" stroke="#170e2b" stroke-width="5" stroke-linejoin="round"/>
      <path d="M12 56 L80 26 L90 46 Z" fill="#ffe788" stroke="#170e2b" stroke-width="5" stroke-linejoin="round"/>
      <path d="M12 56 L90 46" stroke="#170e2b" stroke-width="5"/>
      <circle cx="34" cy="62" r="5.5" fill="#e8a91e"/><circle cx="58" cy="60" r="4" fill="#e8a91e"/><circle cx="74" cy="58" r="6" fill="#e8a91e"/><circle cx="48" cy="70" r="3" fill="#e8a91e"/>
    </g>`;

  const midt = (lab, c) => [(c % lab.b) + 0.5, ((c / lab.b) | 0) + 0.5];
  function veggSti(lab) {
    const { b, h, celler } = lab;
    let d = `M0 0H${b}M0 0V${h}`;
    for (let c = 0; c < celler.length; c++) {
      const x = c % b;
      const y = (c / b) | 0;
      if (!(celler[c] & 2)) d += `M${x + 1} ${y}V${y + 1}`;
      if (!(celler[c] & 4)) d += `M${x} ${y + 1}H${x + 1}`;
    }
    return d;
  }
  const punkter = (lab, liste) => liste.map((c) => midt(lab, c).join(",")).join(" ");

  function brettHtml(S) {
    const sp = S.spill;
    const L = labyrint(sp);
    const [mx, my] = midt(L, sp.pos);
    const [ox, oy] = midt(L, mal(sp));
    const v = 0.5;
    return `<svg class="mu-brett" viewBox="${-v} ${-v} ${L.b + 2 * v} ${L.h + 2 * v}" role="img" aria-label="${esc(R.t("Labyrinten. Musa skal fram til osten nede i hjørnet til høyre."))}" data-n="${L.b}">
        <rect class="mu-gulv" x="-.32" y="-.32" width="${L.b + 0.64}" height="${L.h + 0.64}" rx=".55"/>
        <rect class="mu-start" x=".1" y=".1" width=".8" height=".8" rx=".25"/>
        <polyline class="mu-hint" points=""/>
        <polyline class="mu-spor" points="${punkter(L, sp.spor)}"/>
        <path class="mu-vegg-kant" d="${veggSti(L)}"/>
        <path class="mu-vegg" d="${veggSti(L)}"/>
        <g class="mu-ost" style="transform: translate(${ox}px, ${oy}px)"><g class="mu-ost-indre">${OST}</g></g>
        <g class="mu-figur" style="transform: translate(${mx}px, ${my}px)"><g class="mu-snu"><g class="mu-hopp">${MUS}</g></g></g>
      </svg>`;
  }

  // The board is as big as the room allows, always square.
  function tilpass() {
    const flate = R.$(".mu-flate");
    const svg = R.$(".mu-brett");
    if (!flate || !svg) return;
    const w = flate.clientWidth;
    const h = flate.clientHeight;
    if (!w || !h) return;
    const s = Math.max(120, Math.floor(Math.min(w, h, 640)));
    svg.style.width = s + "px";
    svg.style.height = s + "px";
  }

  // ---------- Moving (the logical position moves at once; the mouse runs after it) ----------

  let ko = []; // cells the mouse still has to run through
  let viser = null; // { pos, spor } what is drawn now
  let lopId = null;
  let las = false;
  let hintId = null;

  function tegnFigur(L, c, retning) {
    const fig = R.$(".mu-figur");
    if (!fig) return;
    const [x, y] = midt(L, c);
    fig.style.transform = `translate(${x}px, ${y}px)`;
    if (retning === "venstre" || retning === "hoyre") fig.querySelector(".mu-snu").classList.toggle("venstre", retning === "venstre");
  }
  function tegnSpor(L, spor) {
    const p = R.$(".mu-spor");
    if (p) p.setAttribute("points", punkter(L, spor));
  }

  function lop(S) {
    const sp = S.spill;
    if (!sp || lopId != null) return;
    const L = labyrint(sp);
    const fortsatt = R.vakt();
    const neste = () => {
      lopId = null;
      if (!fortsatt() || S.spill !== sp) return;
      if (!ko.length) {
        if (viser.pos === mal(sp) && !sp.ferdig) fant(S);
        return;
      }
      const c = ko.shift();
      const r = Labyrint.retning(L, viser.pos, c);
      viser.pos = c;
      Labyrint.spor(viser.spor, c);
      tegnFigur(L, c, r);
      tegnSpor(L, viser.spor);
      lopId = setTimeout(neste, R.rolig() ? 20 : STEG_MS);
    };
    neste();
  }

  // Move along the cells in `vei` (each a neighbour of the one before).
  function flytt(S, vei) {
    const sp = S.spill;
    if (!sp || sp.ferdig || las || !vei.length) return false;
    if (!sp.startet) {
      sp.startet = true;
      startKlokke(S);
    }
    for (const c of vei) {
      Labyrint.spor(sp.spor, c);
      sp.steg += 1;
      ko.push(c);
    }
    sp.pos = vei[vei.length - 1];
    if (sp.pos === mal(sp)) {
      las = true;
      stoppKlokke(S);
    }
    R.lagre();
    skjulHint();
    lop(S);
    return true;
  }

  function dunk() {
    // A soft bump into the hedge – never a buzzer.
    R.lyd.tone(196, 0, 0.09, "sine", 0.06, 150);
    R.vibrer(6);
    const fig = R.$(".mu-hopp");
    if (fig && !R.rolig()) {
      fig.classList.remove("dunk");
      void fig.getBoundingClientRect();
      fig.classList.add("dunk");
    }
  }

  // One swipe, arrow or key: run along the corridor in that direction.
  function glid(S, r) {
    const sp = S.spill;
    if (!sp || sp.ferdig || las || !RETNINGER[r]) return;
    const L = labyrint(sp);
    const vei = Labyrint.glid(L, sp.pos, r, mal(sp));
    if (!vei.length) {
      dunk();
      R.si(R.t("Det er en hekk der."));
      return;
    }
    R.lyd.tone(660 + Math.random() * 60, 0, 0.05, "sine", 0.05);
    flytt(S, vei);
    const igjen = vei[vei.length - 1] === mal(sp) ? "" : beskriv(L, vei[vei.length - 1], sp);
    if (igjen) R.si(igjen);
  }

  // Which ways are open here, for screen readers.
  function beskriv(L, c, sp) {
    const apne = RETNINGSLISTE.filter((r) => Labyrint.steg(L, c, r) >= 0);
    if (apne.length === 1 && c !== 0) return R.t("Blindvei. Gå tilbake: {veier}.", { veier: PILNAVN[apne[0]].toLowerCase() });
    return R.t("Du kan gå: {veier}.", { veier: R.ramsOpp(apne.map((r) => PILNAVN[r].toLowerCase())) });
  }

  function skjulHint() {
    clearTimeout(hintId);
    const h = R.$(".mu-hint");
    if (h) {
      h.classList.remove("vis");
    }
  }
  function visHint(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || las) return;
    const L = labyrint(sp);
    const vei = [sp.pos, ...Labyrint.vei(L, sp.pos, mal(sp)).slice(0, Math.max(6, Math.round(L.b * 1.2)))];
    const h = R.$(".mu-hint");
    if (!h) return;
    sp.hjelp += 1;
    R.lagre();
    h.setAttribute("points", punkter(L, vei));
    h.classList.remove("vis");
    void h.getBoundingClientRect();
    h.classList.add("vis");
    R.lyd.pling();
    R.si(R.t("Prikkene viser et stykke av veien."));
    clearTimeout(hintId);
    hintId = setTimeout(skjulHint, 3200);
  }

  // The cheese is found: the mouse hops, then the result.
  function fant(S) {
    const sp = S.spill;
    sp.ferdig = true;
    const L = labyrint(sp);
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const n = String(sp.str);
    const gml = S.rekorder[n] || null;
    const korteste = Labyrint.vei(L, 0, mal(sp)).length;
    sp.resultat = { sek, steg: sp.steg, korteste, gml: gml ? gml.sek : null, ny: !!gml && sek < gml.sek, forste: !gml };
    S.rekorder[n] = { sek: gml ? Math.min(gml.sek, sek) : sek };
    S.funnet = (S.funnet || 0) + 1;
    S.sist = { str: sp.str, sek };
    if (sp.str >= 10) R.merke("musa-ost");
    R.statistikk("ferdig", { str: sp.str, sek, hjelp: sp.hjelp, omvei: Math.round(omvei(sp.steg, korteste) * 10) / 10 });
    R.lagre();
    const fortsatt = R.vakt();
    R.lyd.riktig();
    R.vibrer([20, 40, 20]);
    const fig = R.$(".mu-hopp");
    if (fig && !R.rolig()) fig.classList.add("jubel");
    const ost = R.$(".mu-ost-indre");
    if (ost && !R.rolig()) ost.classList.add("spist");
    setTimeout(() => {
      if (fortsatt()) R.gaTil("slutt");
    }, R.rolig() ? 500 : 1100);
  }

  // ---------- Touch: swipe, drag the mouse, or tap the way to go ----------

  function bindBrett(S, rot) {
    const flate = rot.querySelector(".mu-flate");
    if (!flate) return;
    let start = null;
    const celle = (e) => {
      const svg = R.$(".mu-brett");
      const L = labyrint(S.spill);
      const b = svg.getBoundingClientRect();
      const enhet = b.width / (L.b + 1);
      const x = Math.floor((e.clientX - b.left) / enhet - 0.5);
      const y = Math.floor((e.clientY - b.top) / enhet - 0.5);
      return { x, y, enhet, inni: x >= 0 && y >= 0 && x < L.b && y < L.h };
    };
    const figurSentrum = () => {
      const f = R.$(".mu-figur");
      const b = f ? f.getBoundingClientRect() : null;
      return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
    };
    const ned = (e) => {
      const sp = S.spill;
      if (!sp || sp.ferdig || las || start) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const k = celle(e);
      const f = figurSentrum();
      const dra = !!f && Math.hypot(e.clientX - f.x, e.clientY - f.y) < k.enhet * 0.95;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, dra, brukt: false };
      if (dra) R.$(".mu-figur").classList.add("dras");
    };
    const flyttPeker = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const sp = S.spill;
      if (!sp || sp.ferdig || las) return;
      if (start.dra) {
        const k = celle(e);
        if (!k.inni) return;
        const L = labyrint(sp);
        const c = k.y * L.b + k.x;
        if (c === sp.pos) return;
        const vei = Labyrint.vei(L, sp.pos, c);
        if (vei.length && vei.length <= 3) {
          start.brukt = true;
          flytt(S, vei);
        }
        return;
      }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (start.brukt || Math.hypot(dx, dy) < 26) return;
      start.brukt = true;
      glid(S, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "hoyre" : "venstre") : dy > 0 ? "ned" : "opp");
    };
    const opp = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start;
      start = null;
      const f = R.$(".mu-figur");
      if (f) f.classList.remove("dras");
      if (s.brukt || e.type === "pointercancel" || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) return;
      // A tap: go the way of the tap, seen from the mouse (the stronger direction first).
      const m = figurSentrum();
      if (!m) return;
      const dx = e.clientX - m.x;
      const dy = e.clientY - m.y;
      const k = celle(e);
      if (Math.hypot(dx, dy) < k.enhet * 0.5) return;
      const forst = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "hoyre" : "venstre") : dy > 0 ? "ned" : "opp";
      const sa = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? "ned" : "opp") : dx > 0 ? "hoyre" : "venstre";
      const L = labyrint(S.spill);
      if (Labyrint.steg(L, S.spill.pos, forst) >= 0 || Math.min(Math.abs(dx), Math.abs(dy)) < k.enhet * 0.6) glid(S, forst);
      else glid(S, sa);
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    flate.addEventListener("pointerdown", ned);
    window.addEventListener("pointermove", flyttPeker);
    window.addEventListener("pointerup", opp);
    window.addEventListener("pointercancel", opp);
    flate.addEventListener("touchmove", nei, { passive: false });
    flate.addEventListener("contextmenu", nei);
    const obs = typeof ResizeObserver === "function" ? new ResizeObserver(tilpass) : null;
    if (obs) obs.observe(flate);
    R.vedForlat(() => {
      flate.removeEventListener("pointerdown", ned);
      window.removeEventListener("pointermove", flyttPeker);
      window.removeEventListener("pointerup", opp);
      window.removeEventListener("pointercancel", opp);
      flate.removeEventListener("touchmove", nei, { passive: false });
      flate.removeEventListener("contextmenu", nei);
      if (obs) obs.disconnect();
    });
  }

  const TASTER = { ArrowUp: "opp", ArrowDown: "ned", ArrowLeft: "venstre", ArrowRight: "hoyre", w: "opp", s: "ned", a: "venstre", d: "hoyre" };
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.skjerm !== "spill") return;
    const m = e.target;
    const fritt = m === document.body || m === document.documentElement || !!(m && m.closest && m.closest(".mu-flate, .mu-pil"));
    if (e.key.length === 1 && !fritt) return;
    const r = TASTER[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!r) return;
    if (m && m.closest && m.closest("input, textarea")) return;
    e.preventDefault();
    if (e.repeat && ko.length) return;
    glid(S, r);
  });
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass();
  });

  // The page must not scroll under a swipe while the maze is on.
  const fastSide = (pa) => document.documentElement.classList.toggle("mu-fast", !!pa);

  // ---------- Small pictures of a maze for the size tiles ----------
  function miniHtml(str) {
    const L = Labyrint.lag(str, str, R.rng(str * 7919 + 13));
    return `<svg class="mu-mini" viewBox="-0.6 -0.6 ${str + 1.2} ${str + 1.2}" aria-hidden="true"><rect x="-.4" y="-.4" width="${str + 0.8}" height="${str + 0.8}" rx="${str / 8}" fill="#f7e7c6"/><path d="${veggSti(L)}" fill="none" stroke="#2f8a4e" stroke-width="${0.12 + str / 60}" stroke-linecap="round"/><circle cx="${str - 0.5}" cy="${str - 0.5}" r=".33" fill="#ffd23f" stroke="#170e2b" stroke-width=".12"/></svg>`;
  }

  // ---------- Result ----------

  function delTekst(S) {
    const sp = S.spill;
    const r = sp.resultat || {};
    return R.t("Musa 🐭🧀 Jeg fant osten i en {hva} på {tid}! Klarer du det?", { hva: STR_LABYRINT[sp.str], tid: visTid(r.sek || 0) });
  }

  function rekordListe(S) {
    const rader = STORRELSER.filter((n) => S.rekorder[n]).map((n) => `<li><b>${esc(STR_NAVN[n])}</b> ${esc(visTid(S.rekorder[n].sek))}</li>`);
    if (!rader.length) return "";
    return `<section class="mu-rekorder" aria-label="${esc(R.t("Raskeste tid"))}">
      <p class="etikett">${esc(R.t("Raskeste tid"))}</p><ul>${rader.join("")}</ul>
      ${S.sist ? `<p class="mu-sist">${esc(R.t("Sist: {hva} på {tid}", { hva: STR_LABYRINT[S.sist.str], tid: visTid(S.sist.sek) }))} · ${esc(R.t("{n} oster funnet|{n} oster funnet", { n: S.funnet || 0 }))}</p>` : ""}
    </section>`;
  }

  // ---------- Start ----------

  R.start({
    id: "musa",
    versjon: 1,
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      oppsett: { str: 5 },
      rekorder: {},
      funnet: 0,
      sist: null,
      spill: null,
    }),

    lastet(S) {
      const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      S.oppsett = { str: STORRELSER.includes(o.str) ? o.str : 5 };
      const rek = S.rekorder && typeof S.rekorder === "object" ? S.rekorder : {};
      S.rekorder = {};
      for (const n of STORRELSER) if (rek[n] && heltall(rek[n].sek, 1, 1e6)) S.rekorder[n] = { sek: rek[n].sek };
      S.funnet = heltall(S.funnet, 0, 1e7) ? S.funnet : 0;
      S.sist = S.sist && STORRELSER.includes(S.sist.str) && heltall(S.sist.sek, 1, 1e6) ? { str: S.sist.str, sek: S.sist.sek } : null;
      const sp = S.spill;
      if (sp) {
        const ok = sp && STORRELSER.includes(sp.str) && Number.isFinite(sp.fro) && heltall(sp.pos, 0, sp.str * sp.str - 1);
        if (!ok) S.spill = null;
        else {
          const L = labyrint(sp);
          // The walk must be a way from the start to where the mouse stands; else it is drawn again.
          const spor = Array.isArray(sp.spor) ? sp.spor : [];
          const gyldig = spor.length >= 1 && spor[0] === 0 && spor[spor.length - 1] === sp.pos && spor.every((c, i) => heltall(c, 0, sp.str * sp.str - 1) && (i === 0 || Labyrint.retning(L, spor[i - 1], c)));
          if (!gyldig) sp.spor = [0, ...Labyrint.vei(L, 0, sp.pos)];
          sp.steg = heltall(sp.steg, 0, 1e7) ? sp.steg : sp.spor.length - 1;
          sp.tid = Number.isFinite(sp.tid) && sp.tid >= 0 ? sp.tid : 0;
          sp.hjelp = heltall(sp.hjelp, 0, 1e6) ? sp.hjelp : 0;
          sp.ferdig = !!sp.ferdig && sp.pos === mal(sp);
          if (sp.ferdig && !sp.resultat) sp.resultat = { sek: Math.max(1, Math.round(sp.tid / 1000)), steg: sp.steg, korteste: Labyrint.vei(L, 0, mal(sp)).length, gml: null, ny: false, forste: false };
        }
      }
      const s = S.spill;
      if (S.skjerm === "spill" && !s) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(s && s.ferdig)) S.skjerm = s ? "spill" : "hjem";
      if (S.skjerm === "spill" && s && s.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Musa er sulten! Hjelp den gjennom labyrinten og fram til osten i hjørnet."),
      steg: [
        [R.t("Sveip eller dra"), R.t("Sveip den veien musa skal gå, eller trykk på pilene. Du kan også dra musa med fingeren.")],
        [R.t("Musa løper til neste kryss"), R.t("Ett sveip, og musa løper gjennom gangen til den må velge vei.")],
        [R.t("Finn osten"), R.t("Kommer du til en blindvei, går du bare tilbake. Prikkene viser veien du har gått.")],
      ],
      tips: [
        R.t("Står du fast? Trykk «Vis veien», så viser prikkene et stykke av veien."),
        R.t("Med tastatur: piltastene eller W, A, S og D."),
        R.t("Hver labyrint er ny – og det finnes alltid akkurat én vei fram til osten."),
        R.t("Begynn med en liten labyrint, og prøv en større når det går lett."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = !!(sp && !sp.ferdig);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Hjelp musa gjennom labyrinten."))}<br><em>${esc(R.t("Osten venter!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: aktiv,
              fortsettTekst: aktiv ? R.t("Fortsett · {hva}", { hva: STR_LABYRINT[sp.str] }) : "",
              startTekst: R.t("Start"),
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + rekordListe(S),
            }),
            merker: [
              ["4", R.t("størrelser")],
              ["1", R.t("vei fram")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => fastSide(false),
      },

      oppsett: {
        tittel: R.t("Ny labyrint"),
        tilbake: "hjem",
        vis(S) {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon mu-storrelser">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor stor labyrint?"))}</h2></div>
              ${R.ui.fliser(
                "str",
                STORRELSER.map((n) => ({ v: n, tittel: STR_NAVN[n], tekst: R.t("{n} × {n} ruter", { n }), ikon: miniHtml(n) })),
                S.oppsett.str,
              )}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? STR_NAVN[S.spill.str] : ""),
        tilbake: "hjem",
        // The board and the arrows side by side on a phone on its side (spill.css).
        liggende: false,
        vis(S) {
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Finn osten"))}</h1>
            <div class="mu-spill">
              <div class="mu-flate">${brettHtml(S)}</div>
              ${R.ui.dokk(`<div class="mu-styr">
                <div class="mu-kryss" role="group" aria-label="${esc(R.t("Styr musa"))}">
                  ${["opp", "venstre", "ned", "hoyre"].map((r) => `<button class="mu-pil ${r}" data-h="gaa" data-v="${r}" data-stille aria-label="${esc(PILNAVN[r])}">${PIL[r]}</button>`).join("")}
                </div>
                <button class="mu-hjelp" data-h="hint"><span aria-hidden="true">💡</span> ${esc(R.t("Vis veien"))}</button>
              </div>`)}
            </div>`;
        },
        etter(S, rot) {
          tilpass();
          bindBrett(S, rot);
          const sp = S.spill;
          if (sp) {
            const L = labyrint(sp);
            viser = { pos: sp.pos, spor: sp.spor.slice() };
            ko = [];
            clearTimeout(lopId);
            lopId = null;
            tegnFigur(L, sp.pos);
          }
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          if (S.spill.ferdig) return R.gaTil("slutt");
          las = false;
          fastSide(true);
          tilpass();
          if (S.spill.startet) startKlokke(S);
          R.holdVaken();
        },
        ut(S) {
          stoppKlokke(S);
          clearTimeout(lopId);
          lopId = null;
          ko = [];
          skjulHint();
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.spill ? STR_NAVN[S.spill.str] : ""),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { sek: 1, steg: sp.steg, korteste: sp.steg };
          const linje = r.ny
            ? R.t("Ny rekord! Forrige: {tid}", { tid: visTid(r.gml) })
            : r.forste
              ? R.t("Første gang på denne størrelsen – nå har du en rekord å slå!")
              : r.gml != null
                ? R.t("Rekorden din: {tid}", { tid: visTid(Math.min(r.gml, r.sek)) })
                : "";
          const storre = STORRELSER[STORRELSER.indexOf(sp.str) + 1];
          return `
            ${R.ui.banner({ etikett: STR_LABYRINT[sp.str].charAt(0).toUpperCase() + STR_LABYRINT[sp.str].slice(1), tittel: R.t("Du fant osten!"), tekst: R.velg(ROS), klasse: "aksent" })}
            <div class="mu-resultat">
              <div class="mu-tall${r.ny ? " ny" : ""}"><b>${esc(visTid(r.sek))}</b><span>${esc(R.t("tid"))}</span>${r.ny ? `<i class="mu-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="mu-tall"><b>${esc(String(r.steg))}</b><span>${esc(R.t("steg"))}</span></div>
            </div>
            ${linje ? `<p class="hjelp mu-linje">${esc(linje)}</p>` : ""}
            ${storre ? `<div class="knapprad">${R.ui.knapp2(R.t("Prøv en større"), "storre")}${R.ui.knapp2(R.t("Del resultatet"), "del")}</div>` : R.ui.knapp2(R.t("Del resultatet"), "del")}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Ny labyrint"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          if (!S.spill || !S.spill.ferdig) return;
          R.lyd.fanfare();
          R.vibrer([40, 60, 120]);
          R.konfetti();
        },
      },
    },

    handlinger: {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        if ((await R.bekreftNytt(!!(sp && !sp.ferdig && sp.steg > 0), true)) && fortsatt()) R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem");
      },
      str(el, e, S) {
        const n = Number(el.dataset.v);
        if (!STORRELSER.includes(n)) return;
        S.oppsett.str = n;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      storre(el, e, S) {
        const n = STORRELSER[STORRELSER.indexOf(S.spill ? S.spill.str : 5) + 1];
        if (!n) return;
        S.oppsett.str = n;
        nyttSpill(S);
        R.gaTil("spill");
      },
      gaa(el, e, S) {
        glid(S, el.dataset.v);
      },
      hint(el, e, S) {
        visHint(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const r = sp.resultat || {};
        R.del(R.app.navn, delTekst(S), DEL_URL, { kort: { tittel: R.app.navn, linjer: [visTid(r.sek || 0), R.t("Fant osten i en {hva}", { hva: STR_LABYRINT[sp.str] })] } });
      },
    },
  });
})();
