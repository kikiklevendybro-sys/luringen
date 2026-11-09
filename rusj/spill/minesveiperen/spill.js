/* Minesveiperen — Minesweeper.
   Three boards: Lett 9 × 9 with 10 mines, Middels 16 × 16 with 40, Ekspert 16 × 30 with 99 (turned
   on its side so it suits a phone held upright; it scrolls inside its own frame and can be zoomed).
   The mines are laid after the first tap, never on or around it, so the first tap always opens an
   area. Tap opens (or flags in flag mode), a long press flags, a tap on a number whose flags are all
   placed opens the rest around it («chording»). The board is drawn once per game; taps update the
   cells in place. Everything is saved after every move. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;

  const NIVAER = {
    lett: { navn: "Lett", b: 9, h: 9, miner: 10 },
    middels: { navn: "Middels", b: 16, h: 16, miner: 40 },
    ekspert: { navn: "Ekspert", b: 16, h: 30, miner: 99 },
  };
  const NIVA_ID = ["lett", "middels", "ekspert"];
  // Cell sizes for the zoom buttons (0 = the whole board on the screen).
  const ZOOM = [0, 30, 36, 44];
  const LANGT_TRYKK = 380; // ms

  let H; // actions
  let klokkeFra = null;
  let celler = [];
  let tegnet = [];
  let las = false; // the end animation is playing
  let markor = -1; // keyboard cursor
  let arkPause = false; // the clock was stopped because a sheet opened

  // ---------- The board ----------

  const antallCeller = (sp) => sp.b * sp.h;
  function naboer(sp, i) {
    const x = i % sp.b;
    const y = (i / sp.b) | 0;
    const ut = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < sp.b && ny >= 0 && ny < sp.h) ut.push(ny * sp.b + nx);
      }
    return ut;
  }
  const tall = (sp, i) => naboer(sp, i).reduce((s, j) => s + (sp.mine[j] ? 1 : 0), 0);
  const flaggRundt = (sp, i) => naboer(sp, i).reduce((s, j) => s + (sp.flagg[j] ? 1 : 0), 0);
  const avstand = (sp, a, b) => Math.max(Math.abs((a % sp.b) - (b % sp.b)), Math.abs(((a / sp.b) | 0) - ((b / sp.b) | 0)));

  function nyttSpill(S, niva) {
    const N = NIVAER[niva] || NIVAER.lett;
    const n = N.b * N.h;
    S.spill = {
      niva: NIVAER[niva] ? niva : "lett",
      b: N.b,
      h: N.h,
      miner: N.miner,
      fro: R.nyttFro(),
      mine: null, // laid after the first tap
      apen: new Array(n).fill(0),
      flagg: new Array(n).fill(0),
      tid: 0,
      startet: false,
      ferdig: false,
      vunnet: false,
      smell: -1,
      resultat: null,
    };
    S.oppsett.niva = S.spill.niva;
    S.flaggmodus = false;
    klokkeFra = null;
    las = false;
    markor = -1;
    R.statistikk("start", { niva: S.spill.niva });
  }

  // The mines go anywhere except the first cell and its neighbours.
  function leggMiner(sp, forste) {
    const n = antallCeller(sp);
    const fri = new Set([forste, ...naboer(sp, forste)]);
    let kandidater = [];
    for (let i = 0; i < n; i++) if (!fri.has(i)) kandidater.push(i);
    if (kandidater.length < sp.miner) kandidater = Array.from({ length: n }, (_, i) => i).filter((i) => i !== forste);
    const valgt = R.stokk(kandidater, R.rng(sp.fro)).slice(0, sp.miner);
    sp.mine = new Array(n).fill(0);
    for (const i of valgt) sp.mine[i] = 1;
  }

  // Opens a cell (and the empty area around it). Returns the opened cells with their distance from
  // the start (for the ripple), and whether a mine went off.
  function apne(sp, start) {
    if (sp.apen[start] || sp.flagg[start]) return { smell: false, apnet: [] };
    sp.apen[start] = 1;
    if (sp.mine[start]) return { smell: true, apnet: [[start, 0]] };
    const apnet = [[start, 0]];
    const ko = [[start, 0]];
    while (ko.length) {
      const [i, d] = ko.shift();
      if (tall(sp, i)) continue;
      for (const j of naboer(sp, i))
        if (!sp.apen[j] && !sp.flagg[j] && !sp.mine[j]) {
          sp.apen[j] = 1;
          apnet.push([j, d + 1]);
          ko.push([j, d + 1]);
        }
    }
    return { smell: false, apnet };
  }

  const apneTrygge = (sp) => sp.apen.reduce((s, a, i) => s + (a && !sp.mine[i] ? 1 : 0), 0);
  const vunnet = (sp) => apneTrygge(sp) === antallCeller(sp) - sp.miner;
  const flaggTotalt = (sp) => sp.flagg.reduce((s, f) => s + f, 0);

  // ---------- Clock ----------

  const tidMs = (sp) => sp.tid + (klokkeFra != null ? performance.now() - klokkeFra : 0);
  function startKlokke(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || !sp.startet || klokkeFra != null || document.hidden || S.skjerm !== "spill") return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && S.spill;
    if (sp && klokkeFra != null) sp.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }
  function visTid(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  // ---------- Drawing ----------

  // What a cell shows: u (closed), f (flag), a0–a8 (open), m (mine), x (the mine that went off),
  // w (a flag that was wrong), mf (a mine that was flagged).
  function tilstand(sp, i) {
    if (sp.ferdig && sp.mine) {
      if (i === sp.smell) return "x";
      if (sp.mine[i]) return sp.flagg[i] || sp.vunnet ? "mf" : "m";
      if (sp.flagg[i]) return "w";
    }
    if (sp.flagg[i]) return "f";
    if (!sp.apen[i]) return "u";
    return "a" + tall(sp, i);
  }
  function etikett(sp, i, t) {
    const sted = `Rad ${((i / sp.b) | 0) + 1}, kolonne ${(i % sp.b) + 1}`;
    if (t === "u") return `${sted}: lukket`;
    if (t === "f") return `${sted}: flagg`;
    if (t === "a0") return `${sted}: tom`;
    if (t[0] === "a") return `${sted}: ${t.slice(1)} ${t === "a1" ? "mine" : "miner"} rundt`;
    if (t === "x") return `${sted}: minen som smalt`;
    if (t === "w") return `${sted}: feil flagg`;
    return `${sted}: mine`;
  }
  const innhold = (t) => (t[0] === "a" && t !== "a0" ? t.slice(1) : "");

  function brettHtml(sp) {
    let html = "";
    for (let i = 0; i < antallCeller(sp); i++) {
      const t = tilstand(sp, i);
      html += `<button class="ms-c ${t}" data-i="${i}" tabindex="-1" aria-label="${etikett(sp, i, t)}">${innhold(t)}</button>`;
    }
    return html;
  }

  function oppdater(S, forsinkelse) {
    const sp = S.spill;
    if (!sp || !celler.length) return;
    for (let i = 0; i < celler.length; i++) {
      const t = tilstand(sp, i);
      if (tegnet[i] === t) continue;
      const el = celler[i];
      tegnet[i] = t;
      el.className = "ms-c " + t + (forsinkelse && forsinkelse.has(i) ? " ny" : "");
      if (forsinkelse && forsinkelse.has(i)) el.style.setProperty("--f", forsinkelse.get(i) + "ms");
      el.textContent = innhold(t);
      el.setAttribute("aria-label", etikett(sp, i, t));
    }
    const igjen = R.$("#ms-igjen");
    if (igjen) igjen.textContent = String(sp.miner - flaggTotalt(sp));
    const fjes = R.$(".ms-fjes");
    if (fjes) {
      fjes.classList.toggle("tapt", sp.ferdig && !sp.vunnet);
      fjes.classList.toggle("vant", sp.ferdig && sp.vunnet);
    }
  }

  // Cell size: Lett always fits; Middels and Ekspert follow the zoom buttons (0 = the whole board).
  function tilpass(S) {
    const rulle = R.$(".ms-rulle");
    const brett = R.$(".ms-brett");
    const sp = S.spill;
    if (!rulle || !brett || !sp) return;
    // The frame's padding (2 × 6 px) and the gaps between the cells count too.
    const w = rulle.clientWidth - 14;
    const h = rulle.clientHeight - 14;
    const mellom = (c) => (c >= 26 ? 3 : c >= 16 ? 2 : 1);
    const storst = (g) => Math.floor(Math.min((w - (sp.b - 1) * g) / sp.b, (h - (sp.h - 1) * g) / sp.h));
    // The biggest cell that fits with the gap that size of cell will actually get.
    let passer = 8;
    for (const g of [3, 2, 1]) {
      const c = storst(g);
      if (mellom(c) <= g) {
        passer = Math.max(8, c);
        break;
      }
    }
    const z = sp.niva === "lett" ? 0 : R.klamp(Number(S.zoom[sp.niva]) || 0, 0, ZOOM.length - 1);
    const c = z === 0 ? Math.min(passer, 52) : Math.max(passer, ZOOM[z]);
    // Keep the point in the middle of the view in the middle when the size changes.
    const gml = Number(brett.dataset.c) || c;
    const mx = (rulle.scrollLeft + rulle.clientWidth / 2) / Math.max(1, rulle.scrollWidth);
    const my = (rulle.scrollTop + rulle.clientHeight / 2) / Math.max(1, rulle.scrollHeight);
    brett.style.setProperty("--c", c + "px");
    brett.style.setProperty("--gap", mellom(c) + "px");
    brett.dataset.c = String(c);
    if (gml !== c) {
      rulle.scrollLeft = mx * rulle.scrollWidth - rulle.clientWidth / 2;
      rulle.scrollTop = my * rulle.scrollHeight - rulle.clientHeight / 2;
    }
    const minus = R.$('[data-h="zoom"][data-v="-1"]');
    const pluss = R.$('[data-h="zoom"][data-v="1"]');
    if (minus) minus.disabled = z <= 0;
    if (pluss) pluss.disabled = z >= ZOOM.length - 1;
    // A board bigger than the screen: say that it can be dragged.
    rulle.classList.toggle("stor", rulle.scrollWidth > rulle.clientWidth + 1 || rulle.scrollHeight > rulle.clientHeight + 1);
    visTips(S);
    kanter();
  }

  // Shaded edges where a big board goes on beyond the frame.
  function kanter() {
    const rulle = R.$(".ms-rulle");
    const vindu = R.$(".ms-vindu");
    if (!rulle || !vindu) return;
    const x = rulle.scrollLeft;
    const y = rulle.scrollTop;
    vindu.classList.toggle("mer-v", x > 2);
    vindu.classList.toggle("mer-h", x < rulle.scrollWidth - rulle.clientWidth - 2);
    vindu.classList.toggle("mer-o", y > 2);
    vindu.classList.toggle("mer-n", y < rulle.scrollHeight - rulle.clientHeight - 2);
  }

  function visTips(S) {
    const tips = R.$(".ms-tips");
    const rulle = R.$(".ms-rulle");
    if (!tips) return;
    const stor = rulle && rulle.classList.contains("stor");
    if (S.flaggmodus) tips.textContent = stor ? "Dra for å se resten · trykk for flagg" : "Trykk for å sette flagg";
    else tips.textContent = stor ? "Dra for å se resten · hold inne for flagg" : "Trykk for å åpne · hold inne for flagg";
  }

  // ---------- Moves ----------

  function forsteTrykk(S, i) {
    const sp = S.spill;
    if (sp.startet) return;
    leggMiner(sp, i);
    sp.startet = true;
    startKlokke(S);
  }

  function apneCelle(S, i) {
    const sp = S.spill;
    if (sp.ferdig || las || sp.flagg[i]) return;
    if (sp.apen[i]) return akkord(S, i);
    forsteTrykk(S, i);
    const r = apne(sp, i);
    if (r.smell) return smell(S, i);
    vis(S, r.apnet, i);
  }

  // A tap on a number with all its flags placed opens the rest around it.
  function akkord(S, i) {
    const sp = S.spill;
    const n = tall(sp, i);
    if (!n) return;
    const lukket = naboer(sp, i).filter((j) => !sp.apen[j] && !sp.flagg[j]);
    if (!lukket.length) return;
    if (flaggRundt(sp, i) !== n) {
      // Not enough flags yet: the closed neighbours just wink.
      for (const j of lukket) blink(j);
      R.lyd.tone(300, 0, 0.07, "triangle", 0.07);
      return;
    }
    let smalt = -1;
    const alle = [];
    for (const j of lukket) {
      const r = apne(sp, j);
      if (r.smell && smalt < 0) smalt = j;
      alle.push(...r.apnet.map(([k, d]) => [k, d + 1]));
    }
    if (smalt >= 0) return smell(S, smalt);
    vis(S, alle, i);
  }

  function vis(S, apnet, fra) {
    const sp = S.spill;
    const forsinkelse = new Map();
    if (!R.rolig()) for (const [k, d] of apnet) forsinkelse.set(k, Math.min(d, 14) * 28);
    oppdater(S, forsinkelse);
    if (apnet.length > 8) {
      R.lyd.stoy(0, 0.25, 0.12, 1800);
      R.lyd.tone(520, 0, 0.12, "triangle", 0.1, 880);
    } else if (apnet.length) R.lyd.tone(700 + Math.random() * 120, 0, 0.05, "triangle", 0.1, 560);
    R.vibrer(apnet.length > 8 ? 18 : 6);
    if (vunnet(sp)) return vinn(S, fra);
    R.lagre();
  }

  function flagg(S, i, langt) {
    const sp = S.spill;
    if (sp.ferdig || las || sp.apen[i]) return;
    sp.flagg[i] = sp.flagg[i] ? 0 : 1;
    if (sp.flagg[i]) {
      R.lyd.tone(880, 0, 0.06, "square", 0.06);
      R.lyd.tone(1320, 0.05, 0.08, "square", 0.05);
    } else R.lyd.tone(600, 0, 0.06, "triangle", 0.07, 420);
    R.vibrer(langt ? 30 : 10);
    oppdater(S);
    const el = celler[i];
    if (el && sp.flagg[i] && !R.rolig()) {
      el.classList.remove("plant");
      void el.offsetWidth;
      el.classList.add("plant");
    }
    R.lagre();
  }

  function blink(i) {
    const el = celler[i];
    if (!el || R.rolig()) return;
    el.classList.remove("blunk");
    void el.offsetWidth;
    el.classList.add("blunk");
    setTimeout(() => el.classList.remove("blunk"), 380);
  }

  // ---------- The end ----------

  function smell(S, i) {
    const sp = S.spill;
    stoppKlokke(S);
    sp.ferdig = true;
    sp.vunnet = false;
    sp.smell = i;
    const trygge = antallCeller(sp) - sp.miner;
    sp.resultat = { sek: Math.round(sp.tid / 1000), andel: Math.floor((apneTrygge(sp) / trygge) * 100) };
    S.stat[sp.niva] = S.stat[sp.niva] || { spilt: 0, vunnet: 0 };
    S.stat[sp.niva].spilt += 1;
    R.statistikk("ferdig", { niva: sp.niva, vunnet: false, sek: sp.resultat.sek });
    R.lagre();
    las = true;
    // The mines go off one after another, nearest first.
    const forsinkelse = new Map();
    if (!R.rolig())
      sp.mine.forEach((m, k) => {
        if (m && k !== i) forsinkelse.set(k, 250 + avstand(sp, i, k) * 70 + Math.random() * 60);
      });
    oppdater(S, forsinkelse);
    R.lyd.bom();
    R.vibrer([120, 60, 220]);
    const spillEl = R.$(".ms-spill");
    if (spillEl && !R.rolig()) spillEl.classList.add("risting");
    const fortsatt = R.vakt();
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 900 : 1900,
    );
  }

  function vinn(S, fra) {
    const sp = S.spill;
    stoppKlokke(S);
    sp.ferdig = true;
    sp.vunnet = true;
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const gml = S.rekorder[sp.niva] || null;
    sp.resultat = { sek, gml: gml ? gml.tid : null, nyRekord: !!gml && sek < gml.tid, forste: !gml };
    S.rekorder[sp.niva] = { tid: gml ? Math.min(gml.tid, sek) : sek };
    S.stat[sp.niva] = S.stat[sp.niva] || { spilt: 0, vunnet: 0 };
    S.stat[sp.niva].spilt += 1;
    S.stat[sp.niva].vunnet += 1;
    R.statistikk("ferdig", { niva: sp.niva, vunnet: true, sek });
    R.lagre();
    las = true;
    const forsinkelse = new Map();
    if (!R.rolig()) sp.mine.forEach((m, k) => m && forsinkelse.set(k, 150 + avstand(sp, fra, k) * 45));
    oppdater(S, forsinkelse);
    R.lyd.riktig();
    R.vibrer([30, 50, 30, 50, 120]);
    const brett = R.$(".ms-brett");
    if (brett && !R.rolig()) {
      celler.forEach((el, k) => el.style.setProperty("--b", avstand(sp, fra, k) * 40 + "ms"));
      brett.classList.add("vant");
    }
    const fortsatt = R.vakt();
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 800 : 1700,
    );
  }

  // ---------- Touch, mouse and keyboard on the board ----------

  function bindBrett(S, rot) {
    celler = R.$$(".ms-c", rot);
    tegnet = celler.map((el) => el.className.split(" ")[1]);
    const brett = R.$(".ms-brett", rot);
    const rulle = R.$(".ms-rulle", rot);
    if (!brett || !rulle) return;
    let trykk = null; // { i, x, y, id, tid, langt }
    const merket = [];
    const slippMerker = () => {
      while (merket.length) merket.pop().classList.remove("trykk");
    };
    const merk = (i) => {
      const sp = R.S.spill;
      const liste = sp.apen[i] ? naboer(sp, i).filter((j) => !sp.apen[j] && !sp.flagg[j]) : sp.flagg[i] ? [] : [i];
      for (const j of liste) {
        celler[j].classList.add("trykk");
        merket.push(celler[j]);
      }
    };
    const avbryt = () => {
      if (trykk) clearTimeout(trykk.tid);
      trykk = null;
      slippMerker();
    };
    const ned = (e) => {
      const el = e.target.closest(".ms-c");
      const sp = R.S.spill;
      if (!el || !sp || sp.ferdig || las) return;
      const i = Number(el.dataset.i);
      if (e.pointerType === "mouse" && e.button === 2) {
        e.preventDefault();
        if (!sp.apen[i]) flagg(R.S, i, false);
        else akkord(R.S, i);
        return;
      }
      if (e.pointerType === "mouse" && e.button === 1) {
        e.preventDefault();
        if (sp.apen[i]) akkord(R.S, i);
        return;
      }
      if (e.button > 0) return;
      avbryt();
      trykk = { i, x: e.clientX, y: e.clientY, id: e.pointerId, langt: false };
      merk(i);
      // A long press flags (on a closed cell), with a buzz so the finger knows.
      if (!sp.apen[i])
        trykk.tid = setTimeout(() => {
          if (!trykk || trykk.i !== i) return;
          trykk.langt = true;
          slippMerker();
          flagg(R.S, i, true);
        }, LANGT_TRYKK);
    };
    const flytt = (e) => {
      if (!trykk || e.pointerId !== trykk.id) return;
      if (Math.hypot(e.clientX - trykk.x, e.clientY - trykk.y) > 10) avbryt(); // it is a scroll
    };
    const opp = (e) => {
      if (!trykk || e.pointerId !== trykk.id) return;
      const t = trykk;
      avbryt();
      if (t.langt) return;
      const S2 = R.S;
      const sp = S2.spill;
      if (!sp || sp.ferdig || las) return;
      markor = t.i;
      if (sp.apen[t.i]) akkord(S2, t.i);
      else if (S2.flaggmodus) flagg(S2, t.i, false);
      else apneCelle(S2, t.i);
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    const klikk = (e) => {
      // Keyboard (Enter/Space on a focused cell) acts like a tap.
      const el = e.target.closest(".ms-c");
      if (!el || e.detail !== 0) return;
      handlingPa(R.S, Number(el.dataset.i), false);
    };
    brett.addEventListener("pointerdown", ned);
    window.addEventListener("pointermove", flytt);
    window.addEventListener("pointerup", opp);
    window.addEventListener("pointercancel", avbryt);
    rulle.addEventListener("scroll", avbryt, { passive: true });
    rulle.addEventListener("scroll", kanter, { passive: true });
    brett.addEventListener("contextmenu", nei);
    brett.addEventListener("click", klikk);
    // Ctrl/Cmd + wheel zooms (computers); never the page itself.
    const hjul = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      H.zoom({ dataset: { v: e.deltaY > 0 ? "-1" : "1" } }, e, R.S);
    };
    rulle.addEventListener("wheel", hjul, { passive: false });
    const fast = R.$(".ms-spill", rot);
    const flere = (e) => {
      if (e.touches && e.touches.length > 1) nei(e);
    };
    if (fast) {
      fast.addEventListener("touchmove", flere, { passive: false });
      fast.addEventListener("gesturestart", nei);
    }
    R.vedForlat(() => {
      avbryt();
      brett.removeEventListener("pointerdown", ned);
      window.removeEventListener("pointermove", flytt);
      window.removeEventListener("pointerup", opp);
      window.removeEventListener("pointercancel", avbryt);
      rulle.removeEventListener("scroll", avbryt);
      rulle.removeEventListener("scroll", kanter);
      brett.removeEventListener("contextmenu", nei);
      brett.removeEventListener("click", klikk);
      rulle.removeEventListener("wheel", hjul);
      if (fast) {
        fast.removeEventListener("touchmove", flere, { passive: false });
        fast.removeEventListener("gesturestart", nei);
      }
    });
  }

  function handlingPa(S, i, somFlagg) {
    const sp = S.spill;
    if (!sp || sp.ferdig || las) return;
    markor = i;
    if (sp.apen[i]) akkord(S, i);
    else if (somFlagg || S.flaggmodus) flagg(S, i, false);
    else apneCelle(S, i);
  }

  function flyttMarkor(S, i) {
    const sp = S.spill;
    markor = R.klamp(i, 0, antallCeller(sp) - 1);
    celler.forEach((el, k) => (el.tabIndex = k === markor ? 0 : -1));
    const el = celler[markor];
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  // Keyboard: arrows move, Enter/Space opens (or chords), F flags, + and − zoom.
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    const sp = S.spill;
    const k = e.key;
    if (k === "+" || k === "=" || k === "-") {
      e.preventDefault();
      return H.zoom({ dataset: { v: k === "-" ? "-1" : "1" } }, e, S);
    }
    if (sp.ferdig) return;
    const PIL = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (PIL[k]) {
      e.preventDefault();
      if (markor < 0) return flyttMarkor(S, ((sp.h / 2) | 0) * sp.b + ((sp.b / 2) | 0));
      const x = R.klamp((markor % sp.b) + PIL[k][0], 0, sp.b - 1);
      const y = R.klamp(((markor / sp.b) | 0) + PIL[k][1], 0, sp.h - 1);
      flyttMarkor(S, y * sp.b + x);
    } else if ((k === "Enter" || k === " ") && markor >= 0 && (e.target === document.body || e.target === document.documentElement)) {
      // A focused cell or button gets its own click from the browser; with nothing focused the cursor acts.
      e.preventDefault();
      handlingPa(S, markor, false);
    } else if ((k === "f" || k === "F") && markor >= 0) {
      e.preventDefault();
      handlingPa(S, markor, true);
    }
  });

  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass(R.S);
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill) return;
    if (document.hidden) {
      stoppKlokke(S);
      R.lagre();
    } else startKlokke(S);
  });

  const fastSide = (pa) => document.documentElement.classList.toggle("ms-fast", !!pa);

  // ---------- Pieces of the screens ----------

  const FLAGG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M7 4.5c3-1.6 5.5 1.4 9.5-.5v8c-4 1.9-6.5-1.1-9.5.5Z" fill="var(--rosa)" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  const HAKKE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5 14.6 9.4" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M9.6 4.2c4.4-1.1 8.6.4 10.2 3.4 1.2 2.2.6 5.6-1.6 8.6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';

  function hudHtml(S) {
    const sp = S.spill;
    const rek = S.rekorder[sp.niva];
    return `<div class="ms-hud">
      <span class="ms-stat"><small>Miner</small><b><span class="ms-bombe" aria-hidden="true"></span><span id="ms-igjen">${sp.miner - flaggTotalt(sp)}</span></b></span>
      <button class="ms-fjes" data-h="ny" aria-label="Nytt brett">${R.figur()}</button>
      <span class="ms-stat"><small>Tid${rek ? ` · 🏆 ${visTid(rek.tid * 1000)}` : ""}</small><b id="ms-tid">${visTid(tidMs(sp))}</b></span>
    </div>`;
  }

  function kontrollHtml(S) {
    const sp = S.spill;
    const zoom = sp.niva !== "lett";
    return `<div class="ms-kontroll${zoom ? " med-zoom" : ""}">
      <div class="ms-modus" role="group" aria-label="Hva skjer når du trykker">
        <button data-h="modus" data-v="apne" aria-pressed="${!S.flaggmodus}">${HAKKE}<span>Åpne</span></button>
        <button data-h="modus" data-v="flagg" aria-pressed="${!!S.flaggmodus}">${FLAGG}<span>Flagg</span></button>
      </div>
      ${
        zoom
          ? `<div class="ms-zoom" role="group" aria-label="Størrelse">
              <button data-h="zoom" data-v="-1" aria-label="Zoom ut">−</button>
              <button data-h="zoom" data-v="1" aria-label="Zoom inn">+</button>
            </div>`
          : ""
      }
    </div>
    <p class="ms-tastatur">Piltaster flytter · Enter åpner · F setter flagg · + og − zoomer</p>
    <p class="ms-tips">${S.flaggmodus ? "Trykk for å sette flagg" : "Trykk for å åpne · hold inne for flagg"}</p>`;
  }

  // The board in miniature for the result screen.
  function miniBrett(sp) {
    const c = Math.max(8, Math.min(28, Math.floor(330 / sp.b), Math.floor(380 / sp.h)));
    let html = "";
    for (let i = 0; i < antallCeller(sp); i++) {
      const t = tilstand(sp, i);
      html += `<i class="${t}">${innhold(t)}</i>`;
    }
    return `<div class="ms-mini" style="--kol:${sp.b}; --c:${c}px" aria-hidden="true">${html}</div>`;
  }

  // A tiny board for the level tiles: bigger boards get more and smaller cells.
  function flisIkon(niva) {
    const [k, r, s] = { lett: [4, 4, 9], middels: [6, 6, 6], ekspert: [5, 9, 4] }[niva];
    let celler = "";
    for (let i = 0; i < k * r; i++) celler += `<i class="${(i * 7) % 11 === 3 ? "f" : (i * 5) % 9 < 3 ? "a" : ""}"></i>`;
    return `<span class="ms-flisbrett" style="--kol:${k}; --s:${s}px" aria-hidden="true">${celler}</span>`;
  }

  function prosent(stat) {
    return stat && stat.spilt ? `${stat.vunnet} av ${stat.spilt} vunnet` : "";
  }

  // ---------- Start ----------

  R.start({
    id: "minesveiperen",
    versjon: 1,
    pagar: (S) => !!(S.spill && !S.spill.ferdig && S.spill.startet),

    tilstand: () => ({
      oppsett: { niva: "lett" },
      rekorder: {},
      stat: {},
      zoom: { middels: 0, ekspert: 1 },
      flaggmodus: false,
      spill: null,
    }),

    lastet(S) {
      if (!S.oppsett || !NIVAER[S.oppsett.niva]) S.oppsett = { niva: "lett" };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      if (!S.stat || typeof S.stat !== "object") S.stat = {};
      if (!S.zoom || typeof S.zoom !== "object") S.zoom = { middels: 0, ekspert: 1 };
      S.flaggmodus = !!S.flaggmodus;
      const sp = S.spill;
      if (sp) {
        const N = NIVAER[sp.niva];
        const n = N ? N.b * N.h : 0;
        const ok =
          N &&
          sp.b === N.b &&
          sp.h === N.h &&
          Array.isArray(sp.apen) &&
          sp.apen.length === n &&
          Array.isArray(sp.flagg) &&
          sp.flagg.length === n &&
          (sp.mine === null || (Array.isArray(sp.mine) && sp.mine.length === n && sp.mine.reduce((s, m) => s + m, 0) === N.miner));
        if (!ok) S.spill = null;
        else {
          sp.tid = Number(sp.tid) || 0;
          if (!sp.mine) sp.startet = false;
        }
      }
      if (S.skjerm === "slutt" && (!S.spill || !S.spill.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!S.spill || S.spill.ferdig)) S.skjerm = S.spill ? "slutt" : "hjem";
    },

    regler: {
      intro: "Under rutene ligger det miner. Åpne alle de trygge rutene – uten å trykke på en mine.",
      steg: [
        ["Trykk for å åpne", "Første trykk er alltid trygt. Et tall forteller hvor mange miner som ligger rundt ruta – også på skrå."],
        ["Sett flagg", "Hold fingeren på en rute (eller slå på Flagg) for å merke en mine du har funnet."],
        ["Rydd hele brettet", "Når alle trygge ruter er åpne, har du vunnet. Klarer du det raskere neste gang?"],
      ],
      tips: [
        "Står det 1 ved siden av bare én lukket rute, ligger minen der.",
        "Trykk på et tall når alle flaggene rundt det er satt. Da åpnes resten rundt det på en gang.",
        "Middels og ekspert er store: Dra for å flytte rundt, og bruk − og + for å zoome.",
        "Trykk på fjeset øverst for å starte et nytt brett.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = !!(sp && !sp.ferdig && sp.startet);
          const rek = NIVA_ID.filter((n) => S.rekorder[n]).map((n) => `<li><b>${esc(NIVAER[n].navn)}</b> ${visTid(S.rekorder[n].tid * 1000)}</li>`);
          return (
            R.ui.spillhjem({
              slagordHtml: "Finn de trygge rutene.<br><em>Ikke trå på en mine!</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? `Fortsett · ${NIVAER[sp.niva].navn.toLowerCase()} · ${visTid(sp.tid)}` : "",
                startTekst: `Start spill · ${NIVAER[S.oppsett.niva].navn.toLowerCase()}`,
                ekstraHtml: R.ui.lenkerad(R.ui.lenke("Bytt nivå", "bytt"), R.ui.lenke("Slik spiller du", "regler")),
              }),
              merker: [
                ["3", "nivåer"],
                ["1.", "trykk er trygt"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="ms-rekorder" aria-label="Dine beste tider"><p class="etikett">Dine beste tider</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            ${R.ui.fliser(
              "niva",
              NIVA_ID.map((n) => {
                const N = NIVAER[n];
                const rek = S.rekorder[n];
                const st = prosent(S.stat[n]);
                return {
                  v: n,
                  tittel: N.navn,
                  tekst: `${N.b} × ${N.h} · ${N.miner} miner${rek ? ` · 🏆 ${visTid(rek.tid * 1000)}` : ""}${st ? ` · ${st}` : ""}`,
                  ikon: flisIkon(n),
                };
              }),
              S.oppsett.niva,
              { en: true },
            )}
            <p class="hjelp">Første trykk er alltid trygt.</p>
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`,
      },

      spill: {
        tittel: (S) => NIVAER[S.spill.niva].navn,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">Minesveiper, ${esc(NIVAER[sp.niva].navn.toLowerCase())}</h1>
            <div class="ms-spill">
              ${hudHtml(S)}
              <div class="ms-vindu${S.flaggmodus ? " flaggmodus" : ""}">
                <div class="ms-rulle">
                  <div class="ms-brett" style="--kol:${sp.b}" role="group" aria-label="Brettet, ${sp.b} ganger ${sp.h} ruter">${brettHtml(sp)}</div>
                </div>
                <div class="ms-kanter" aria-hidden="true"><i class="v"></i><i class="h"></i><i class="o"></i><i class="n"></i></div>
              </div>
              ${R.ui.dokk(kontrollHtml(S))}
            </div>`;
        },
        etter(S, rot) {
          bindBrett(S, rot);
          tilpass(S);
          const rulle = R.$(".ms-rulle", rot);
          if (rulle && typeof ResizeObserver === "function") {
            const obs = new ResizeObserver(() => tilpass(S));
            obs.observe(rulle);
            R.vedForlat(() => obs.disconnect());
          }
        },
        inn(S) {
          if (!S.spill || S.spill.ferdig) return R.gaTil(S.spill ? "slutt" : "hjem");
          fastSide(true);
          tilpass(S);
          // A big board opens at its top-left corner (whole cells, the frame visible); shaded edges
          // show where it goes on.
          const rulle = R.$(".ms-rulle");
          if (rulle && !S.spill.startet) {
            rulle.scrollLeft = 0;
            rulle.scrollTop = 0;
          }
          kanter();
          R.holdVaken();
          startKlokke(S);
          const id = setInterval(() => {
            const S2 = R.S;
            if (!S2 || !S2.spill) return;
            if (R.arkApent()) {
              if (klokkeFra != null) {
                stoppKlokke(S2);
                arkPause = true;
              }
            } else if (arkPause) {
              arkPause = false;
              startKlokke(S2);
            }
            const el = R.$("#ms-tid");
            if (el) el.textContent = visTid(tidMs(S2.spill));
          }, 250);
          R.vedForlat(() => clearInterval(id));
        },
        ut(S) {
          stoppKlokke(S);
          arkPause = false;
          las = false;
          celler = [];
          tegnet = [];
          markor = -1;
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const N = NIVAER[sp.niva];
          const r = sp.resultat || { sek: Math.round(sp.tid / 1000), andel: 0 };
          const dokk =
            R.ui.flereSpill({ antall: 1 }) +
            R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "bytt"), '<a class="lenke" href="/">Alle spill</a>'));
          if (sp.vunnet) {
            const linje = r.nyRekord
              ? `Ny personlig rekord på ${N.navn.toLowerCase()}! Forrige: ${visTid(r.gml * 1000)}.`
              : r.gml
                ? `Rekorden din på ${N.navn.toLowerCase()}: ${visTid(Math.min(r.gml, r.sek) * 1000)}.`
                : `Første seier på ${N.navn.toLowerCase()} – nå har du en rekord å slå!`;
            return `
              <div class="banner aksent">
                ${R.figur()}
                <p class="etikett">${esc(N.navn)} · ${N.b} × ${N.h} · ${N.miner} miner</p>
                <h1 id="skjerm-tittel">${r.nyRekord ? "Ny rekord!" : "Godt jobba!"}</h1>
              </div>
              <div class="ms-resultat">
                <div class="ms-tall${r.nyRekord ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>tid</span>${r.nyRekord ? '<i class="ms-ny">Rekord!</i>' : ""}</div>
                <div class="ms-tall"><b>${N.miner}</b><span>miner funnet</span></div>
              </div>
              <p class="hjelp">${esc(linje)}</p>
              ${miniBrett(sp)}
              ${dokk}`;
          }
          return `
            <div class="banner">
              ${R.figur("minesveiperen", "ms-sotet")}
              <p class="etikett">${esc(N.navn)} · ${N.b} × ${N.h} · ${N.miner} miner</p>
              <h1 id="skjerm-tittel">Kabom!</h1>
            </div>
            <div class="ms-resultat">
              <div class="ms-tall"><b>${r.andel} %</b><span>ryddet</span></div>
              <div class="ms-tall"><b>${visTid(r.sek * 1000)}</b><span>tid</span></div>
            </div>
            <p class="hjelp">${r.andel >= 80 ? "Det var nære på! Én mine skilte deg fra seieren." : "Minene gjemmer seg godt. Første trykk er alltid trygt – prøv igjen!"}</p>
            ${miniBrett(sp)}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          // A real win gets the fanfare; a mine a gentle sound and warm words.
          if (sp.vunnet) {
            R.lyd.fanfare();
            R.konfetti();
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
          } else R.lyd.tone(392, 0, 0.3, "triangle", 0.1, 330);
        },
      },
    },

    handlinger: (H = {
      // «Start spill» / «Nytt spill»: a new board at once, on the last level played.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig && S.spill.startet))) || !fortsatt()) return;
        nyttSpill(S, S.oppsett.niva);
        R.gaTil("spill");
      },
      bytt: () => R.gaTil("oppsett"),
      fortsett: (el, e, S) => R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem"),
      niva(el, e, S) {
        S.oppsett.niva = NIVAER[el.dataset.v] ? el.dataset.v : "lett";
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig && S.spill.startet))) || !fortsatt()) return;
        nyttSpill(S, S.oppsett.niva);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S, S.spill ? S.spill.niva : S.oppsett.niva);
        R.gaTil("spill");
      },
      // The face: a new board at once (asks first when a game is well under way).
      async ny(el, e, S) {
        const sp = S.spill;
        const iGang = sp && !sp.ferdig && sp.startet && apneTrygge(sp) > 0;
        if (iGang) {
          const fortsatt = R.vakt();
          if (!(await R.bekreft("Nytt brett?", "Brettet du holder på med, forsvinner.", "Nytt brett", "Avbryt")) || !fortsatt()) return;
        }
        nyttSpill(S, sp ? sp.niva : S.oppsett.niva);
        R.gaTil("spill");
      },
      modus(el, e, S) {
        S.flaggmodus = el.dataset.v === "flagg";
        R.$$(".ms-modus button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.v === "flagg") === S.flaggmodus)));
        const vindu = R.$(".ms-vindu");
        if (vindu) vindu.classList.toggle("flaggmodus", S.flaggmodus);
        visTips(S);
        R.lagre();
      },
      zoom(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.niva === "lett") return;
        S.zoom[sp.niva] = R.klamp((Number(S.zoom[sp.niva]) || 0) + Number(el.dataset.v), 0, ZOOM.length - 1);
        tilpass(S);
        R.lagre();
      },
    }),
  });
})();
