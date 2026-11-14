/* Brikka — ludo for 2–4 on one phone; the phone plays the empty seats.
   Roll a six to come out, go one round of the 40-square track and up your own colour into the goal.
   Land on someone and they go home (not on the star squares). One decision per roll: the pieces
   you can move pulse, one tap moves; a single option moves by itself. The rules are pure
   functions (window.RusjBrikka) tested in test/brikka.test.mjs. */
(function () {
  "use strict";

  // ---------- Rules (pure: no DOM, no kit) ----------

  const SPOR = 40; // squares round the board
  const INN = 4; // squares up your own colour
  const MAL = SPOR + INN; // 44 = in the goal
  const HJEMME = -1; // waiting in the corner
  const START = [0, 10, 20, 30]; // where each seat comes out (absolute track squares)
  const TRYGG = [4, 14, 24, 34]; // star squares: nobody can be knocked home there

  // Absolute track square of a piece of seat `sete` at relative position p (−1 when not on the track).
  const abs = (sete, p) => (p >= 0 && p < SPOR ? (START[sete] + p) % SPOR : -1);

  // All moves seat `sete` can make with `kast`. brikker[sete] = positions (−1 home, 0–39 track,
  // 40–43 own colour, 44 goal); empty seats are null. regler.eksakt: the goal needs the exact number.
  function trekk(brikker, sete, kast, regler) {
    const mine = brikker[sete];
    if (!mine) return [];
    const eksakt = !regler || regler.eksakt !== false;
    const ut = [];
    mine.forEach((p, n) => {
      let til;
      if (p === HJEMME) {
        if (kast !== 6) return;
        til = 0;
      } else if (p >= MAL) return;
      else {
        til = p + kast;
        if (til > MAL) {
          if (eksakt) return;
          til = MAL;
        }
      }
      const slaar = [];
      const a = abs(sete, til);
      if (a >= 0 && !TRYGG.includes(a)) {
        brikker.forEach((andre, s) => {
          if (!andre || s === sete) return;
          andre.forEach((q, m) => {
            if (abs(s, q) === a) slaar.push({ sete: s, brikke: m });
          });
        });
      }
      ut.push({ sete, brikke: n, fra: p, til, slaar, ut: p === HJEMME, mal: til === MAL });
    });
    return ut;
  }

  // Moves that look different (pieces on the same square are the same move).
  const distinkte = (liste) => liste.filter((t, i) => liste.findIndex((u) => u.fra === t.fra) === i);

  function utfor(brikker, t) {
    const ny = brikker.map((b) => (b ? b.slice() : b));
    ny[t.sete][t.brikke] = t.til;
    for (const s of t.slaar) ny[s.sete][s.brikke] = HJEMME;
    return ny;
  }

  const iMal = (brikker, sete) => (brikker[sete] || []).filter((p) => p >= MAL).length;
  const ferdig = (brikker, sete) => !!brikker[sete] && brikker[sete].every((p) => p >= MAL);
  // Pieces on the way (on the track or up the own colour).
  const harUte = (brikker, sete) => !!brikker[sete] && brikker[sete].some((p) => p >= 0 && p < MAL);
  // With nothing out you get three tries to roll a six.
  const forsokPerTur = (brikker, sete) => (harUte(brikker, sete) ? 1 : 3);
  // How far a seat has come (for the ranking when nobody has finished).
  const fremdrift = (brikker, sete) => (brikker[sete] || []).reduce((s, p) => s + (p === HJEMME ? 0 : p + 1), 0);

  // How many opponent pieces could land on absolute square `a` with their next roll.
  function trusler(brikker, sete, a) {
    let n = 0;
    brikker.forEach((b, s) => {
      if (!b || s === sete) return;
      b.forEach((q) => {
        if (q === HJEMME) {
          if (START[s] === a) n += 0.5; // a six brings it out right there
          return;
        }
        const qa = abs(s, q);
        if (qa < 0) return;
        const d = (a - qa + SPOR) % SPOR;
        if (d >= 1 && d <= 6 && q + d < SPOR) n += 1;
      });
    });
    return n;
  }

  // The phone's choice: finish, knock, come out, get safe, keep out of reach – and a little luck.
  function robotVelg(brikker, sete, liste, tilfeldig) {
    const rng = tilfeldig || Math.random;
    let best = null;
    let bestPoeng = -Infinity;
    for (const t of distinkte(liste)) {
      let s = 0;
      if (t.mal) s += 120;
      if (t.slaar.length) s += 80 + t.slaar.reduce((sum, k) => sum + Math.max(0, brikker[k.sete][k.brikke]) * 0.8, 0);
      if (t.ut) s += 55;
      if (t.til >= SPOR && t.fra < SPOR) s += 32; // into the own colour: safe
      const aTil = abs(sete, t.til);
      const etter = utfor(brikker, t);
      if (aTil >= 0) {
        if (TRYGG.includes(aTil)) s += 22;
        else s -= 26 * trusler(etter, sete, aTil);
      }
      const aFra = abs(sete, t.fra);
      if (aFra >= 0 && !TRYGG.includes(aFra)) s += 18 * trusler(brikker, sete, aFra);
      s += t.til * 0.35 + rng() * 6;
      if (s > bestPoeng) {
        bestPoeng = s;
        best = t;
      }
    }
    return best;
  }

  const Regler = { SPOR, INN, MAL, HJEMME, START, TRYGG, abs, trekk, distinkte, utfor, iMal, ferdig, harUte, forsokPerTur, fremdrift, trusler, robotVelg };
  window.RusjBrikka = Regler;

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") return; // loaded by the unit tests

  // ---------- Board geometry (11 × 11 units; a unit is one square) ----------

  // Track squares 0–39, clockwise, starting at the left player's start square.
  const SPORFELT = [
    [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
    [4, 3], [4, 2], [4, 1], [4, 0],
    [5, 0], [6, 0],
    [6, 1], [6, 2], [6, 3], [6, 4],
    [7, 4], [8, 4], [9, 4], [10, 4],
    [10, 5], [10, 6],
    [9, 6], [8, 6], [7, 6], [6, 6],
    [6, 7], [6, 8], [6, 9], [6, 10],
    [5, 10], [4, 10],
    [4, 9], [4, 8], [4, 7], [4, 6],
    [3, 6], [2, 6], [1, 6], [0, 6],
    [0, 5],
  ];
  const INNFELT = [
    [[1, 5], [2, 5], [3, 5], [4, 5]],
    [[5, 1], [5, 2], [5, 3], [5, 4]],
    [[9, 5], [8, 5], [7, 5], [6, 5]],
    [[5, 9], [5, 8], [5, 7], [5, 6]],
  ];
  const HJORNE = [[0, 0], [7, 0], [7, 7], [0, 7]]; // top-left of each seat's 4 × 4 corner
  const LOMMER = [[1.4, 1.2], [2.6, 1.2], [1.4, 2.4], [2.6, 2.4]]; // the four waiting places in a corner
  const MAL_RETNING = [[-1, 0], [0, -1], [1, 0], [0, 1]]; // where in the goal circle each colour sits
  const PIL = ["M-1.8 -2.4 L2.4 0 L-1.8 2.4 Z", "M-2.4 -1.8 L0 2.4 L2.4 -1.8 Z", "M1.8 -2.4 L-2.4 0 L1.8 2.4 Z", "M-2.4 1.8 L0 -2.4 L2.4 1.8 Z"];
  const SETER = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const ROBOTER = [R.t("Robo"), R.t("Bipp"), R.t("Bopp")];
  const FARGE = ["var(--rosa)", "var(--lampe)", "var(--himmel)", "var(--mynte)"];
  const FARGENAVN = [R.t("Rosa"), R.t("Gul"), R.t("Blå"), R.t("Grønn")];

  // Centre (in units) of a piece of seat s, number n, at position p.
  function sted(s, n, p) {
    if (p === HJEMME) return [HJORNE[s][0] + LOMMER[n][0], HJORNE[s][1] + LOMMER[n][1]];
    if (p >= MAL) {
      const [dx, dy] = MAL_RETNING[s];
      const side = (n - 1.5) * 0.17; // finished pieces side by side in their part of the goal
      return [5.5 + dx * 0.24 + (dy ? side : 0), 5.5 + dy * 0.24 + (dx ? side : 0)];
    }
    const [x, y] = p >= SPOR ? INNFELT[s][p - SPOR] : SPORFELT[abs(s, p)];
    return [x + 0.5, y + 0.5];
  }

  // ---------- The game ----------

  const esc = R.esc;
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const tilfeldig = () => R.nyttFro() / 4294967296;
  const nyTerning = () => 1 + Math.floor(tilfeldig() * 6);

  let H;
  let laast = false; // a move or a roll is being animated
  let drivId = null; // the next automatic step (the phone's turn, a single option, no move)

  const deltaker = (sp, s) => sp.seter.find((d) => d.sete === s) || null;
  const erRobot = (sp, s) => {
    const d = deltaker(sp, s);
    return !!d && d.type === "r";
  };
  const navnFor = (sp, s) => {
    const d = deltaker(sp, s);
    return !d ? FARGENAVN[s] : d.type === "r" ? ROBOTER[d.r] : R.navn(d.i);
  };
  const avatarFor = (sp, s, storrelse) => {
    const d = deltaker(sp, s);
    if (d && d.type === "m") return R.avatar(d.i, storrelse);
    return `<span class="avatar bk-robot ${storrelse || ""}" style="--pf: ${FARGE[s]}" aria-hidden="true">🤖</span>`;
  };
  const listeNa = (sp) => (sp.kast == null ? [] : trekk(sp.brikker, sp.tur, sp.kast, sp.regler));

  function standardRoboter(mennesker) {
    return mennesker < 2 ? 1 : 0;
  }
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
    const seter = SETER[m + r];
    const brikkerHver = S.oppsett.kjapt ? 2 : 4;
    const deltakere = seter.map((sete, k) => (k < m ? { sete, type: "m", i: k } : { sete, type: "r", r: k - m }));
    const brikker = [0, 1, 2, 3].map((s) => (seter.includes(s) ? Array.from({ length: brikkerHver }, () => HJEMME) : null));
    const forste = seter[Math.floor(tilfeldig() * seter.length)];
    S.spill = {
      seter: deltakere,
      brikker,
      regler: { seks: !!S.oppsett.seks, eksakt: !!S.oppsett.eksakt },
      tur: forste,
      kast: null,
      terning: 1 + Math.floor(Math.random() * 6),
      vri: 0,
      forsok: 0,
      ekstra: false,
      angre: null,
      ferdig: false,
      vinner: null,
      nr: 1,
      stat: { kast: 0, seksere: [0, 0, 0, 0], knuff: [0, 0, 0, 0] },
    };
    laast = false;
    R.statistikk("start", { spillere: m, roboter: r, brikker: brikkerHver });
  }

  function nesteTur(sp) {
    const seter = sp.seter.map((d) => d.sete);
    const k = seter.indexOf(sp.tur);
    sp.tur = seter[(k + 1) % seter.length];
    sp.kast = null;
    sp.forsok = 0;
    sp.ekstra = false;
    sp.nr += 1;
  }

  // ---------- Status line ----------

  function statusTekst(sp) {
    const robot = erRobot(sp, sp.tur);
    const navn = navnFor(sp, sp.tur);
    const ute = harUte(sp.brikker, sp.tur);
    if (sp.kast == null) {
      if (robot) return R.t("{navn} kaster …", { navn });
      if (sp.ekstra) return R.t("Seks! Kast en gang til");
      if (!ute) {
        const igjen = 3 - sp.forsok;
        return sp.forsok === 0 ? R.t("Slå seks for å komme ut!") : igjen === 1 ? R.t("Ikke seks. Ett forsøk igjen!") : R.t("Ikke seks. To forsøk igjen");
      }
      return R.t("Kast terningen!");
    }
    const liste = listeNa(sp);
    if (!liste.length) {
      if (sp.kast === 6 && sp.regler.seks) return R.t("Seks, men ingen kan flytte");
      if (!ute && sp.forsok < 3) return R.t("Ingen sekser – prøv igjen");
      return R.t("Ingen brikke kan flytte");
    }
    if (robot) return R.t("{navn} tenker …", { navn });
    if (distinkte(liste).length === 1) return liste[0].ut ? R.t("Ut på brettet!") : R.t("Brikka flytter …");
    return R.t("Velg en brikke som blinker");
  }

  // ---------- The die ----------
  // A real 3D die in a little wooden box, thrown with a simulated throw (R.terninger in
  // rusj/kit/terninger.js). The game decides the number; the kit lands the die on it. Tap the die or
  // swipe on the box to throw.

  const TERNING = "bk-terning";
  function terningHtml(sp) {
    const kan = sp.kast == null && !erRobot(sp, sp.tur) && !sp.ferdig;
    return R.terninger.html({
      id: TERNING,
      klasse: "bk-terning" + (kan ? " klar" : ""),
      verdier: [sp.terning],
      vri: [sp.vri || 0],
      hold: false,
      plass: 2.15, // one die in a box about twice its size
      handling: "kast",
      av: !kan,
      etikett: () => (kan ? R.t("Kast terningen") : R.t("Terningen viser {n}", { n: sp.terning })),
    });
  }
  let sveipKast = null; // a fling on the box: its direction and speed for the next throw

  // ---------- Board ----------

  const stjerne = (cx, cy, r) => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const v = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      p.push(`${(cx + rr * Math.cos(v)).toFixed(2)} ${(cy + rr * Math.sin(v)).toFixed(2)}`);
    }
    return `M${p.join(" L")} Z`;
  };

  function brettSvg(sp) {
    const d = [];
    d.push(`<rect class="bk-plate" x="0.6" y="0.6" width="108.8" height="108.8" rx="11"/>`);
    for (let s = 0; s < 4; s++) {
      const [ox, oy] = HJORNE[s];
      const med = !!sp.brikker[s];
      d.push(`<rect class="bk-hus${med ? "" : " tom"}${med && s === sp.tur && !sp.ferdig ? " na" : ""}" x="${ox * 10 + 3}" y="${oy * 10 + 3}" width="34" height="34" rx="9" style="--lf: ${FARGE[s]}"/>`);
      LOMMER.slice(0, med ? sp.brikker[s].length : 4).forEach(([x, y]) => d.push(`<circle class="bk-lomme${med ? "" : " tom"}" cx="${(ox + x) * 10}" cy="${(oy + y) * 10}" r="4.1" style="--lf: ${FARGE[s]}"/>`));
    }
    // the goal in the middle: a round target with a slice in each colour, facing its own lane
    const mx = 55;
    const my = 55;
    const r = 5.7;
    const pkt = (v) => `${(mx + r * Math.cos((v * Math.PI) / 180)).toFixed(2)} ${(my + r * Math.sin((v * Math.PI) / 180)).toFixed(2)}`;
    [[135, 225], [225, 315], [315, 405], [45, 135]].forEach(([a, b], s) =>
      d.push(`<path class="bk-malbit" d="M${mx} ${my} L${pkt(a)} A${r} ${r} 0 0 1 ${pkt(b)} Z" style="--lf: ${sp.brikker[s] ? FARGE[s] : "#d9cdea"}"/>`),
    );
    d.push(`<circle class="bk-mal" cx="${mx}" cy="${my}" r="${r}"/><circle class="bk-mal-midt" cx="${mx}" cy="${my}" r="1.3"/>`);
    SPORFELT.forEach(([x, y], a) => {
      const cx = x * 10 + 5;
      const cy = y * 10 + 5;
      const s = START.indexOf(a);
      if (s >= 0) {
        d.push(`<circle class="bk-felt start" cx="${cx}" cy="${cy}" r="4.3" style="--lf: ${sp.brikker[s] ? FARGE[s] : "#d9cdea"}"/>`);
        d.push(`<path class="bk-pil" transform="translate(${cx} ${cy})" d="${PIL[s]}"/>`);
      } else if (TRYGG.includes(a)) {
        d.push(`<circle class="bk-felt trygg" cx="${cx}" cy="${cy}" r="4.3"/><path class="bk-stjerne" d="${stjerne(cx, cy, 3)}"/>`);
      } else d.push(`<circle class="bk-felt" cx="${cx}" cy="${cy}" r="4.1"/>`);
    });
    INNFELT.forEach((felt, s) =>
      felt.forEach(([x, y]) => d.push(`<circle class="bk-felt inn" cx="${x * 10 + 5}" cy="${y * 10 + 5}" r="4.1" style="--lf: ${sp.brikker[s] ? FARGE[s] : "#d9cdea"}"/>`)),
    );
    return `<svg class="bk-bunn" viewBox="0 0 110 110" aria-hidden="true" focusable="false">${d.join("")}</svg>`;
  }

  function trekkTekst(t) {
    if (t.ut) return R.t("ut på startfeltet");
    if (t.mal) return R.t("inn i mål");
    if (t.til >= SPOR) return R.t("{n} fram, opp på din egen farge", { n: t.til - t.fra });
    return t.slaar.length ? R.t("{n} fram og knuff", { n: t.til - t.fra }) : R.t("{n} fram", { n: t.til - t.fra });
  }

  function brikkerHtml(sp, valg) {
    const ut = [];
    const kanFlytte = new Map(); // "s:n" → move
    for (const t of valg) kanFlytte.set(`${t.sete}:${t.brikke}`, t);
    // Pieces that share a square are spread a little, so every one stays visible.
    const plasser = new Map();
    sp.brikker.forEach((b, s) => {
      if (!b) return;
      b.forEach((p, n) => {
        if (p === HJEMME || p >= MAL) return;
        const k = sted(s, n, p).join(",");
        if (!plasser.has(k)) plasser.set(k, []);
        plasser.get(k).push(`${s}:${n}`);
      });
    });
    sp.brikker.forEach((b, s) => {
      if (!b) return;
      b.forEach((p, n) => {
        let [x, y] = sted(s, n, p);
        const id = `${s}:${n}`;
        const sammen = p === HJEMME || p >= MAL ? null : plasser.get(`${x},${y}`);
        if (sammen && sammen.length > 1) {
          const k = sammen.indexOf(id);
          const v = (k / sammen.length) * Math.PI * 2 - Math.PI / 4;
          x += Math.cos(v) * 0.17;
          y += Math.sin(v) * 0.17;
        }
        const t = kanFlytte.get(id);
        const klasse = `bk-brikke${p >= MAL ? " i-mal" : ""}${p === HJEMME ? " hjemme" : ""}${sammen && sammen.length > 1 ? " stablet" : ""}`;
        const stil = `--x: ${x.toFixed(3)}; --y: ${y.toFixed(3)}; --lf: ${FARGE[s]}`;
        if (t && distinkte(valg).length > 1 && !erRobot(sp, s)) {
          ut.push(`<button class="${klasse} kan" data-h="flytt" data-v="${id}" data-stille style="${stil}" aria-label="${esc(R.t("Brikke {n}: {trekk}", { n: n + 1, trekk: trekkTekst(t) }))}"><span class="bk-brikke-indre"></span></button>`); // sprak-ok
        } else {
          ut.push(`<span class="${klasse}${t ? " valgt" : ""}" data-brikke="${id}" style="${stil}"><span class="bk-brikke-indre"></span></span>`);
        }
      });
    });
    return ut.join("");
  }

  // Where each movable piece would land (also tappable).
  function malHtml(sp, valg) {
    if (erRobot(sp, sp.tur) || distinkte(valg).length < 2) return "";
    return distinkte(valg)
      .map((t) => {
        const [x, y] = t.mal ? [5.5, 5.5] : sted(t.sete, t.brikke, t.til);
        return `<button class="bk-mal-merke${t.slaar.length ? " knuff" : ""}" data-h="flytt" data-v="${t.sete}:${t.brikke}" data-stille style="--x: ${x}; --y: ${y}; --lf: ${FARGE[t.sete]}" aria-label="${esc(R.t("Flytt brikke {n} hit: {trekk}", { n: t.brikke + 1, trekk: trekkTekst(t) }))}">${t.slaar.length ? '<span class="bk-knuff" aria-hidden="true">💥</span>' : ""}</button>`;
      })
      .join("");
  }

  function navneskilt(sp) {
    return sp.seter
      .map((d) => {
        const [ox, oy] = HJORNE[d.sete];
        const imal = iMal(sp.brikker, d.sete);
        return `<span class="bk-skilt${d.sete === sp.tur && !sp.ferdig ? " na" : ""}" style="--x: ${ox + 2}; --y: ${oy + 3.35}; --lf: ${FARGE[d.sete]}">${esc(navnFor(sp, d.sete))}${imal ? ` <b>${imal}</b>` : ""}</span>`;
      })
      .join("");
  }

  // ---------- Animations ----------

  const translat = ([x, y], skala) => `translate(${((x - 0.5) * 100).toFixed(1)}%, ${((y - 0.5) * 100).toFixed(1)}%)${skala ? ` scale(${skala})` : ""}`;

  function hoppLyd(n) {
    R.lyd.tone(700 + n * 70, 0, 0.05, "triangle", 0.08, 900 + n * 70);
  }

  // Walk a piece square by square (or hop out of the corner), then send knocked pieces home.
  async function animerTrekk(sp, t) {
    const el = R.$(`#bk-brett [data-brikke="${t.sete}:${t.brikke}"], #bk-brett [data-v="${t.sete}:${t.brikke}"].bk-brikke`);
    if (!el || R.rolig() || !el.animate) return;
    el.classList.add("flytter");
    const steg = [];
    if (t.ut) steg.push(sted(t.sete, t.brikke, 0));
    else for (let p = t.fra + 1; p <= t.til; p++) steg.push(sted(t.sete, t.brikke, Math.min(p, MAL)));
    let fra = sted(t.sete, t.brikke, t.fra);
    const fortsatt = R.vakt();
    for (let i = 0; i < steg.length; i++) {
      if (!fortsatt()) return;
      const til = steg[i];
      const ms = t.ut ? 320 : 150;
      const a = el.animate(
        [
          { transform: translat(fra, 1) },
          { transform: `${translat([(fra[0] + til[0]) / 2, (fra[1] + til[1]) / 2 - 0.35], 1.25)}`, offset: 0.5 },
          { transform: translat(til, 1) },
        ],
        { duration: ms, easing: "ease-in-out", fill: "forwards" },
      );
      hoppLyd(i);
      await new Promise((r) => (a.onfinish = r));
      fra = til;
    }
    if (!fortsatt()) return;
    if (t.slaar.length) {
      R.lyd.tone(220, 0, 0.18, "sawtooth", 0.14, 90);
      R.lyd.stoy(0, 0.2, 0.3, 700, "lowpass");
      R.vibrer([40, 30, 80]);
      const flyg = t.slaar.map((k) => {
        const kel = R.$(`#bk-brett [data-brikke="${k.sete}:${k.brikke}"], #bk-brett [data-v="${k.sete}:${k.brikke}"].bk-brikke`);
        if (!kel) return Promise.resolve();
        const p = sp.brikker[k.sete][k.brikke];
        const a0 = sted(k.sete, k.brikke, p);
        const a1 = sted(k.sete, k.brikke, HJEMME);
        const topp = [(a0[0] + a1[0]) / 2, Math.min(a0[1], a1[1]) - 1.6];
        kel.style.zIndex = "6";
        const an = kel.animate([{ transform: translat(a0, 1) }, { transform: `${translat(topp, 1.6)} rotate(200deg)`, offset: 0.45 }, { transform: `${translat(a1, 1)} rotate(360deg)` }], {
          duration: 620,
          easing: "cubic-bezier(.3,.7,.4,1)",
          fill: "forwards",
        });
        return new Promise((r) => (an.onfinish = r));
      });
      await Promise.all(flyg);
    }
  }

  // ---------- Turn engine ----------

  // Marks the board while the die rolls or a piece walks (the next redraw removes it).
  function opptatt() {
    const brett = R.$("#bk-brett");
    if (brett) brett.dataset.opptatt = "1";
  }

  function stopp() {
    clearTimeout(drivId);
    drivId = null;
  }

  // Schedules what happens next by itself: the phone rolls and moves, a single option moves,
  // and a roll with no move passes on.
  function driv() {
    stopp();
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || laast) return;
    // Nothing happens by itself while a sheet is open (the rules, «Avslutte spillet?»).
    if (R.arkApent()) {
      drivId = setTimeout(driv, 400);
      return;
    }
    const robot = erRobot(sp, sp.tur);
    if (sp.kast == null) {
      if (robot) drivId = setTimeout(() => kast(S), R.rolig() ? 350 : sp.angre ? 1600 : 800);
      return;
    }
    const liste = listeNa(sp);
    if (!liste.length) drivId = setTimeout(() => ingenTrekk(S), R.rolig() ? 500 : 1300);
    else if (robot) drivId = setTimeout(() => flytt(S, robotVelg(sp.brikker, sp.tur, liste, Math.random), false), R.rolig() ? 250 : 650);
    else if (distinkte(liste).length === 1) drivId = setTimeout(() => flytt(S, liste[0], false), R.rolig() ? 250 : 600);
  }

  async function kast(S) {
    const sp = S.spill;
    if (!pagar(S) || laast || sp.kast != null || S.skjerm !== "spill") return;
    stopp();
    const vei = sveipKast;
    sveipKast = null;
    const v = nyTerning();
    sp.angre = null; // undo is possible until the next roll
    sp.terning = v;
    sp.vri = Math.round(Math.random() * 30 - 15);
    sp.kast = v;
    sp.forsok += 1;
    sp.stat.kast += 1;
    if (v === 6) sp.stat.seksere[sp.tur] += 1;
    R.lagre(); // saved before the die lands: a reload shows the result
    laast = true;
    opptatt();
    const knapp = R.$('#skjerm .dokk [data-h="kast"]');
    if (knapp) knapp.disabled = true;
    const status = R.$("#bk-status");
    if (status) status.textContent = R.t("Terningen ruller …");
    const fortsatt = R.vakt();
    await R.terninger.kast(TERNING, { verdier: [v], indekser: [0], retning: vei && vei.retning, styrke: vei && vei.styrke });
    laast = false;
    if (!fortsatt()) return;
    R.vis();
    R.si(R.t("{navn} slo {n}.", { navn: navnFor(sp, sp.tur), n: v }));
    if (v === 6) R.lyd.pling();
    driv();
  }

  function ingenTrekk(S) {
    const sp = S.spill;
    if (!pagar(S) || laast || sp.kast == null) return;
    if (listeNa(sp).length) return driv();
    const v = sp.kast;
    if (v === 6 && sp.regler.seks) {
      sp.kast = null;
      sp.forsok = 0;
      sp.ekstra = true;
    } else if (!harUte(sp.brikker, sp.tur) && sp.forsok < 3) {
      sp.kast = null; // another try for a six
    } else {
      nesteTur(sp);
    }
    R.lagre();
    R.vis();
    driv();
  }

  async function flytt(S, t, valgt) {
    const sp = S.spill;
    if (!pagar(S) || laast || !t || sp.kast == null) return;
    stopp();
    const mennesket = !erRobot(sp, sp.tur);
    // A choice by a person can be undone until the next roll.
    sp.angre = mennesket && valgt ? { brikker: sp.brikker.map((b) => (b ? b.slice() : b)), tur: sp.tur, kast: sp.kast, forsok: sp.forsok, ekstra: sp.ekstra, nr: sp.nr, stat: JSON.parse(JSON.stringify(sp.stat)) } : null;
    laast = true;
    opptatt();
    R.$$("#skjerm .bk-brikke.kan, #skjerm .bk-mal-merke").forEach((b) => (b.disabled = true));
    const forBrikker = sp.brikker;
    // The result is saved before the animation, so a reload never loses the move.
    sp.brikker = utfor(sp.brikker, t);
    sp.stat.knuff[t.sete] += t.slaar.length;
    const seks = sp.kast === 6 && sp.regler.seks;
    const vant = ferdig(sp.brikker, t.sete);
    if (vant) {
      sp.ferdig = true;
      sp.vinner = t.sete;
      sp.angre = null;
      avsluttSpill(S);
    } else if (seks) {
      sp.kast = null;
      sp.forsok = 0;
      sp.ekstra = true;
    } else nesteTur(sp);
    R.lagre();
    const fortsatt = R.vakt();
    await animerTrekk({ brikker: forBrikker }, t);
    laast = false;
    if (!fortsatt()) return;
    if (t.mal) {
      R.lyd.riktig();
      setTimeout(() => R.lyd.pling(), 180);
      R.vibrer([20, 40, 20]);
    } else if (t.ut) R.lyd.pop();
    if (t.slaar.length) {
      const offer = R.ramsOpp(t.slaar.map((k) => navnFor(sp, k.sete)).filter((n, i, a) => a.indexOf(n) === i));
      R.toast(R.t("Knuff! {navn} må hjem igjen", { navn: offer }));
    }
    if (vant) {
      R.lyd.fanfare();
      R.konfetti();
      R.vibrer([60, 40, 60, 40, 160]);
      R.vis();
      await R.vent(R.rolig() ? 400 : 1600);
      if (fortsatt()) R.gaTil("slutt");
      return;
    }
    R.vis();
    if (sp.ekstra && !erRobot(sp, sp.tur)) R.si(R.t("Seks! Du kaster en gang til."));
    else if (!erRobot(sp, sp.tur)) R.si(R.t("{navn} sin tur.", { navn: navnFor(sp, sp.tur) }));
    driv();
  }

  // Ranking: finished first, then by how far everyone has come.
  function rangering(sp) {
    return sp.seter
      .map((d) => ({ sete: d.sete, d, mal: iMal(sp.brikker, d.sete), fram: fremdrift(sp.brikker, d.sete) }))
      .sort((a, b) => (b.sete === sp.vinner) - (a.sete === sp.vinner) || b.mal - a.mal || b.fram - a.fram);
  }

  function avsluttSpill(S) {
    const sp = S.spill;
    const rang = rangering(sp);
    if (sp.vinner == null) sp.vinner = rang[0].sete;
    const mennesker = rang.filter((r) => r.d.type === "m");
    if (mennesker.length >= 2) R.kveld.registrer(mennesker.map((r, k) => ({ navn: R.navn(r.d.i), poeng: mennesker.length - k })));
    R.statistikk("ferdig", { spillere: sp.seter.length, kast: sp.stat.kast, robot: erRobot(sp, sp.vinner), fullfort: ferdig(sp.brikker, sp.vinner) });
  }

  // ---------- Start ----------

  R.start({
    id: "brikka",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { roboter: 0, seks: true, eksakt: true, kjapt: false },
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ roboter: 0, seks: true, eksakt: true, kjapt: false }, S.oppsett || {});
      S.antall = R.klamp(Number(S.antall) || 2, 1, 4);
      riktigRoboter(S);
      const sp = S.spill;
      if (sp) {
        const ok =
          Array.isArray(sp.seter) && sp.seter.length >= 2 && sp.seter.length <= 4 &&
          Array.isArray(sp.brikker) && sp.brikker.length === 4 &&
          sp.seter.every((d) => [0, 1, 2, 3].includes(d.sete) && Array.isArray(sp.brikker[d.sete]) && sp.brikker[d.sete].every((p) => Number.isInteger(p) && p >= HJEMME && p <= MAL)) &&
          !!deltaker(sp, sp.tur) &&
          (sp.kast == null || (Number.isInteger(sp.kast) && sp.kast >= 1 && sp.kast <= 6)) &&
          sp.regler && sp.stat;
        if (!ok) S.spill = null;
        else if (sp.angre && !(Array.isArray(sp.angre.brikker) && deltaker(sp, sp.angre.tur))) sp.angre = null;
      }
      if (S.skjerm === "spill" && !S.spill) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = S.spill ? "spill" : "hjem";
    },

    vedSpillere(S) {
      const m = R.klamp(Number(S.antall) || 1, 1, 4);
      if (m === 1 && !S.oppsett.roboter) S.oppsett.roboter = 1;
      riktigRoboter(S);
    },

    regler: {
      intro: R.t("Få alle brikkene dine én runde rundt brettet og inn i mål i midten – før de andre."),
      steg: [
        [R.t("Slå seks for å komme ut"), R.t("Brikkene venter i hjørnet ditt. En sekser setter en brikke på startfeltet. Har du ingen ute, får du tre forsøk.")],
        [R.t("Flytt – og knuff"), R.t("Trykk på brikka du vil flytte. Lander du på en annen spillers brikke, må den hjem igjen. På stjernene er alle trygge.")],
        [R.t("Inn i mål"), R.t("Gå en runde rundt, opp på din egen farge og inn i midten. Først med alle brikkene i mål vinner!")],
      ],
      tips: [
        R.t("En sekser gir et ekstra kast (det kan skrus av når dere gjør klart)."),
        R.t("Kan bare én brikke flytte, flytter den seg selv."),
        R.t("Mobilen kan ta de ledige plassene – også når du spiller alene."),
        R.t("Trykket på feil brikke? «Angre» tar trekket tilbake, helt til neste kast."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Slå seks, kom deg ut –"))}<br><em>${esc(R.t("og knuff de andre hjem!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · {navn} sin tur", { navn: navnFor(S.spill, S.spill.tur) }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["1–4", R.t("spillere")],
              ["15–40", R.t("min")],
              ["0", R.t("reklame")],
            ],
          }),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          riktigRoboter(S);
          const m = R.klamp(Number(S.antall) || 1, 1, 4);
          const r = S.oppsett.roboter;
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          ${R.ui.spillere({ min: 1, max: 4, tittel: R.t("Hvem spiller?"), hjelp: m === 1 ? R.t("Alene? Da spiller du mot mobilen.") : R.t("Dere sender mobilen rundt bordet.") })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Mobilen spiller også"))}</h2><span class="tall">${esc(R.t("{n} i alt", { n: m + r }))}</span></div>
            ${R.ui.seg("roboter", [[0, R.t("Ingen")], [1, "1"], [2, "2"], [3, "3"]], r, { etikett: R.t("Hvor mange plasser mobilen tar"), av: (v) => m + Number(v) > 4 || m + Number(v) < 2 })}
            <p class="hjelp">${esc(!r ? R.t("Mobilen tar de ledige plassene.") : r > 1 ? R.t("Mobilen tar de ledige plassene – de heter {navn} 🤖.", { navn: R.ramsOpp(ROBOTER.slice(0, r)) }) : R.t("Mobilen tar de ledige plassene – den heter {navn} 🤖.", { navn: R.ramsOpp(ROBOTER.slice(0, r)) }))}</p>
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Husregler"))}</h2>
            ${R.ui.bryter("seks", S.oppsett.seks, R.t("Seks gir et ekstra kast"), R.t("Slår du seks, kaster du en gang til."))}
            ${R.ui.bryter("eksakt", S.oppsett.eksakt, R.t("Nøyaktig inn i mål"), R.t("Du må slå akkurat nok for å komme i mål."))}
            ${R.ui.bryter("kjapt", S.oppsett.kjapt, R.t("Kjapt spill"), R.t("To brikker hver i stedet for fire."))}
          </section>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🎲" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.ferdig ? R.t("I mål!") : R.t("Runde {n}", { n: Math.ceil(S.spill.nr / S.spill.seter.length) })),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const robot = erRobot(sp, sp.tur);
          const valg = listeNa(sp);
          const kanKaste = sp.kast == null && !robot && !sp.ferdig;
          let knapp;
          if (sp.ferdig) knapp = R.ui.knapp(R.t("I mål!"), "kast", { variant: "stor", av: true });
          else if (kanKaste) knapp = R.ui.knapp(sp.ekstra ? R.t("Kast igjen") : sp.forsok > 0 ? R.t("Prøv igjen") : R.t("Kast terningen"), "kast", { variant: "stor", ikon: "🎲" });
          else if (robot) knapp = R.ui.knapp(R.t("{navn} spiller …", { navn: navnFor(sp, sp.tur) }), "kast", { variant: "stor", av: true });
          else if (valg.length && distinkte(valg).length > 1) knapp = R.ui.knapp(R.t("Velg en brikke"), "kast", { variant: "stor", av: true });
          else knapp = R.ui.knapp(R.t("Du slo {n}", { n: sp.kast }), "kast", { variant: "stor", av: true });
          return `
            <div class="bk-tur${robot ? " robot" : ""}" style="--lf: ${FARGE[sp.tur]}">
              ${avatarFor(sp, sp.tur, "mid")}
              <div class="bk-hvem">
                <p class="etikett">${esc(robot ? R.t("{farge} · mobilen", { farge: FARGENAVN[sp.tur] }) : sp.seter.length > 1 ? R.t("{farge} · din tur", { farge: FARGENAVN[sp.tur] }) : FARGENAVN[sp.tur])}</p>
                <h1 id="skjerm-tittel">${esc(navnFor(sp, sp.tur))}</h1>
                <p class="bk-status" id="bk-status" aria-live="polite">${esc(statusTekst(sp))}</p>
              </div>
              ${terningHtml(sp)}
            </div>
            <div class="bk-brett${sp.ferdig ? " ferdig" : ""}" id="bk-brett">
              ${brettSvg(sp)}
              ${navneskilt(sp)}
              ${malHtml(sp, valg)}
              ${brikkerHtml(sp, valg)}
            </div>
            ${R.ui.dokk(knapp, R.ui.lenkerad(sp.angre ? `<button class="lenke" data-h="angre" id="bk-angre">↶ ${esc(R.t("Angre trekket"))}</button>` : "", R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        etter: () =>
          R.terninger.koble(TERNING, {
            vedSveip(vei) {
              const sp = R.S.spill;
              if (!sp || sp.kast != null || erRobot(sp, sp.tur) || sp.ferdig || laast || R.arkApent()) return;
              sveipKast = vei;
              kast(R.S).catch((feil) => console.error(feil));
            },
          }),
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
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rang = rangering(sp);
          const vinner = rang[0];
          const fullfort = ferdig(sp.brikker, vinner.sete);
          const robotVant = vinner.d.type === "r";
          const knuffMax = Math.max(...sp.stat.knuff);
          const knuffere = sp.seter.filter((d) => sp.stat.knuff[d.sete] === knuffMax).map((d) => navnFor(sp, d.sete));
          const seksMax = Math.max(...sp.stat.seksere);
          const seksere = sp.seter.filter((d) => sp.stat.seksere[d.sete] === seksMax).map((d) => navnFor(sp, d.sete));
          const priser = [
            knuffMax ? `<li class="bk-pris"><span class="bk-pris-ikon" aria-hidden="true">💥</span><span><span class="etikett">${esc(R.t("Knuffekongen"))}</span><b>${esc(R.ramsOpp(knuffere))}</b><span>${esc(R.flertall(knuffMax, "knuff", "knuff"))}</span></span></li>` : "",
            seksMax ? `<li class="bk-pris"><span class="bk-pris-ikon" aria-hidden="true">🎲</span><span><span class="etikett">${esc(R.t("Flest seksere"))}</span><b>${esc(R.ramsOpp(seksere))}</b><span>${esc(R.flertall(seksMax, "sekser", "seksere"))}</span></span></li>` : "",
          ].join("");
          const n = sp.brikker[vinner.sete].length;
          return `
            <div class="banner aksent">
              <span class="bk-vinner" style="--lf: ${FARGE[vinner.sete]}">${avatarFor(sp, vinner.sete, "gigant")}<span class="bk-krone" aria-hidden="true">👑</span></span>
              <h1 id="skjerm-tittel">${esc(R.t("{navn} vinner!", { navn: navnFor(sp, vinner.sete) }))}</h1>
              <p class="ingress">${esc(
                fullfort
                  ? n === 2
                    ? robotVant
                      ? R.t("Begge brikkene i mål – mobilen var heldig denne gangen. Revansj?")
                      : R.t("Begge brikkene i mål. Godt jobba!")
                    : robotVant
                      ? R.t("Alle fire brikkene i mål – mobilen var heldig denne gangen. Revansj?")
                      : R.t("Alle fire brikkene i mål. Godt jobba!")
                  : R.t("Lengst framme da dere avsluttet."),
              )}</p>
            </div>
            <ol class="bk-rang">${rang
              .map(
                (r, k) => `<li class="${k === 0 ? "leder" : ""}" style="--lf: ${FARGE[r.sete]}"><span class="plass-nr">${k + 1}</span>${avatarFor(sp, r.sete)}<span class="navn">${esc(navnFor(sp, r.sete))}</span>
                  <span class="bk-rang-brikker" aria-label="${esc(R.t("{n} av {alle} i mål", { n: r.mal, alle: sp.brikker[r.sete].length }))}">${sp.brikker[r.sete].map((p) => `<i class="${p >= MAL ? "mal" : p >= 0 ? "ute" : ""}"></i>`).join("")}</span></li>`,
              )
              .join("")}</ol>
            ${priser ? `<ul class="bk-priser">${priser}</ul>` : ""}
            ${R.ui.flereSpill({ antall: sp.seter.filter((d) => d.type === "m").length })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const vinner = rangering(sp)[0];
          if (vinner.d.type === "m") {
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
      seks(el, e, S) {
        S.oppsett.seks = !S.oppsett.seks;
        R.vis();
      },
      eksakt(el, e, S) {
        S.oppsett.eksakt = !S.oppsett.eksakt;
        R.vis();
      },
      kjapt(el, e, S) {
        S.oppsett.kjapt = !S.oppsett.kjapt;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
        const sp = S.spill;
        setTimeout(() => {
          if (R.S.spill === sp && R.S.skjerm === "spill") R.toast(R.t("{navn} begynner!", { navn: navnFor(sp, sp.tur) }));
        }, 400);
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      kast(el, e, S) {
        if (S.spill && !erRobot(S.spill, S.spill.tur)) return kast(S);
      },
      flytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || laast || sp.kast == null || erRobot(sp, sp.tur)) return;
        const [s, n] = String(el.dataset.v).split(":").map(Number);
        const t = listeNa(sp).find((x) => x.sete === s && x.brikke === n);
        if (t) flytt(S, t, true);
      },
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || laast || sp.ferdig) return;
        stopp();
        sp.brikker = a.brikker;
        sp.tur = a.tur;
        sp.kast = a.kast;
        sp.terning = a.kast;
        sp.forsok = a.forsok;
        sp.ekstra = a.ekstra;
        sp.nr = a.nr;
        sp.stat = a.stat;
        sp.angre = null;
        R.lyd.snu();
        R.toast(R.t("Angret – velg en annen brikke"));
        R.vis();
        driv();
      },
      async avslutt(el, e, S) {
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        stopp();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Den som har kommet lengst, blir kåret."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt()) return;
        if (!ja || !pagar(S)) return driv();
        const sp = S.spill;
        sp.ferdig = true;
        sp.vinner = null;
        sp.angre = null;
        avsluttSpill(S);
        R.gaTil("slutt");
      },
    }),
  });
})();
