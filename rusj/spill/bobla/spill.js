/* Bobla — a bubble shooter.
   Bubbles hang from the ceiling in a honeycomb: rows of 8 and 7, every other row half a bubble in.
   Aim with a finger (drag over the board, the dotted line shows the whole path and where the bubble
   lands; let go to shoot, drag below the launcher to cancel), with a mouse (move and click) or the
   keyboard (arrows aim, Space/Enter shoots, X swaps). A bubble bounces off the side walls and sticks
   where it first touches a bubble or the ceiling. Three or more of the same kind that touch pop;
   everything that no longer hangs from the ceiling falls (double points). Every kind has its own
   colour AND its own symbol (heart, star, drop, triangle, diamond, square), so no rule needs colour
   vision.
   Two ways to play: «Brett» (levels made from the level number: clear the board; every 7th miss the
   ceiling comes down a row) and «Uendelig» (endless: every few misses a new row is pushed in from
   the top; play for a record). When a bubble ends up in the row under the line, the run is over –
   no lives, try again as often as you like.
   The rules (Boble) are pure functions at the top: a shot is worked out in full when it is fired
   (the path, the landing cell, what pops and falls, the ceiling), saved, and then only drawn.
   test/bobla.test.mjs loads this file without the kit (node:vm) and checks them. */
(function () {
  "use strict";

  // ---------- The rules ----------

  const Boble = (() => {
    const K = 8; // bubbles in a wide row (a shifted row has K - 1)
    const LINJE = 11; // a bubble in this row (counting the ceiling's drop) ends the run
    const RH = Math.sqrt(3) / 2; // row height in bubble diameters
    const LINJE_Y = 0.5 + (LINJE - 1) * RH + 0.62; // the line, just under the last safe row
    const SKYT_Y = LINJE_Y + 1.02; // the launcher's centre
    const HOYDE = SKYT_Y + 0.8; // the whole field, in bubble diameters (the width is K)
    const TREFF = 0.8; // centre distance that counts as a touch (a little under one diameter)
    const MAKS = (80 * Math.PI) / 180; // the widest aim from straight up
    const STEG = 0.04;

    const tomRad = () => new Array(K).fill(0);
    const tomt = () => ({ rader: Array.from({ length: LINJE + 1 }, tomRad), forskyv: 0, tak: 0 });
    const kopi = (b) => ({ rader: b.rader.map((r) => r.slice()), forskyv: b.forskyv, tak: b.tak });

    // A shifted row has K - 1 bubbles and starts half a bubble in.
    const skjev = (b, r) => ((r + b.forskyv) & 1) === 1;
    const bredde = (b, r) => (skjev(b, r) ? K - 1 : K);
    const px = (b, r, c) => (skjev(b, r) ? 1 : 0.5) + c;
    const py = (b, r) => 0.5 + (r + b.tak) * RH;
    const inne = (b, r, c) => r >= 0 && r <= LINJE && c >= 0 && c < bredde(b, r);
    const verdi = (b, r, c) => (inne(b, r, c) ? b.rader[r][c] : 0);

    // The six neighbours of a cell (fewer at the edges).
    function naboer(b, r, c) {
      const d = skjev(b, r) ? 0 : -1;
      return [
        [r, c - 1],
        [r, c + 1],
        [r - 1, c + d],
        [r - 1, c + d + 1],
        [r + 1, c + d],
        [r + 1, c + d + 1],
      ].filter(([rr, cc]) => inne(b, rr, cc));
    }

    function alle(b) {
      const ut = [];
      for (let r = 0; r <= LINJE; r++) for (let c = 0; c < bredde(b, r); c++) if (b.rader[r][c]) ut.push([r, c]);
      return ut;
    }
    const antall = (b) => alle(b).length;
    const tom = (b) => antall(b) === 0;
    const farger = (b) => [...new Set(alle(b).map(([r, c]) => b.rader[r][c]))].sort((a, c) => a - c);
    const nederst = (b) => alle(b).reduce((m, [r]) => Math.max(m, r + b.tak), -1);
    const overLinja = (b) => nederst(b) >= LINJE;

    // The bubbles of the same kind that touch (r, c), the cell itself included.
    function klynge(b, r, c) {
      const f = verdi(b, r, c);
      if (!f) return [];
      const sett = new Set([r * 16 + c]);
      const ut = [[r, c]];
      for (let i = 0; i < ut.length; i++)
        for (const [rr, cc] of naboer(b, ut[i][0], ut[i][1])) {
          const k = rr * 16 + cc;
          if (!sett.has(k) && b.rader[rr][cc] === f) {
            sett.add(k);
            ut.push([rr, cc]);
          }
        }
      return ut;
    }

    // The bubbles that no longer hang from the ceiling (row 0), in reading order.
    function flytende(b) {
      const fast = new Set();
      const ko = [];
      for (let c = 0; c < bredde(b, 0); c++)
        if (b.rader[0][c]) {
          fast.add(c);
          ko.push([0, c]);
        }
      for (let i = 0; i < ko.length; i++)
        for (const [rr, cc] of naboer(b, ko[i][0], ko[i][1])) {
          const k = rr * 16 + cc;
          if (!fast.has(k) && b.rader[rr][cc]) {
            fast.add(k);
            ko.push([rr, cc]);
          }
        }
      return alle(b).filter(([r, c]) => !fast.has(r * 16 + c));
    }

    // The empty cell a bubble at (x, y) sticks to: the nearest one that hangs from the ceiling or
    // touches a bubble.
    function fest(b, x, y) {
      let best = null;
      const midt = Math.round((y - 0.5) / RH - b.tak);
      for (const vidde of [2, LINJE + 1]) {
        for (let r = Math.max(0, midt - vidde); r <= Math.min(LINJE, midt + vidde); r++)
          for (let c = 0; c < bredde(b, r); c++) {
            if (b.rader[r][c]) continue;
            if (r > 0 && !naboer(b, r, c).some(([rr, cc]) => b.rader[rr][cc])) continue;
            const d = (px(b, r, c) - x) ** 2 + (py(b, r) - y) ** 2;
            if (!best || d < best.d - 1e-9) best = { r, c, d };
          }
        if (best) return best;
      }
      return best;
    }

    function rorer(b, x, y) {
      const rr = Math.floor((y - 0.5) / RH - b.tak);
      for (let r = Math.max(0, rr - 1); r <= Math.min(LINJE, rr + 2); r++)
        for (let c = 0; c < bredde(b, r); c++) if (b.rader[r][c] && (px(b, r, c) - x) ** 2 + (py(b, r) - y) ** 2 < TREFF * TREFF) return true;
      return false;
    }

    const klampVinkel = (v) => Math.max(-MAKS, Math.min(MAKS, Number(v) || 0));

    // The whole path of a shot at angle v (radians from straight up, positive to the right):
    // { punkter: [[x, y] …] from the launcher via the wall bounces to the cell, r, c, sprett }.
    function bane(b, v) {
      v = klampVinkel(v);
      let x = K / 2;
      let y = SKYT_Y;
      let dx = Math.sin(v);
      const dy = -Math.cos(v);
      const punkter = [[x, y]];
      const tak = 0.5 + b.tak * RH;
      let sprett = 0;
      for (let i = 0; i < 6000; i++) {
        const fx = x;
        const fy = y;
        x += dx * STEG;
        y += dy * STEG;
        if (x < 0.5 || x > K - 0.5) {
          const vegg = x < 0.5 ? 0.5 : K - 0.5;
          const f = (vegg - fx) / (x - fx);
          punkter.push([vegg, fy + (y - fy) * f]);
          x = 2 * vegg - x;
          dx = -dx;
          sprett++;
        }
        if (y <= tak) {
          y = tak;
          break;
        }
        if (rorer(b, x, y)) break;
      }
      const celle = fest(b, x, y);
      punkter.push([px(b, celle.r, celle.c), py(b, celle.r)]);
      return { punkter, r: celle.r, c: celle.c, sprett };
    }

    // ---------- Random numbers (the kit's generator, kept here so the levels never change) ----------
    function fnv(tekst) {
      let h = 0x811c9dc5;
      for (let i = 0; i < tekst.length; i++) {
        h ^= tekst.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    function rng(fro) {
      let a = fro >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const heltall = (tilf, n) => Math.min(n - 1, Math.floor(tilf() * n));
    function stokk(liste, tilf) {
      const a = liste.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = heltall(tilf, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // A colour for a cell: often the same as a neighbour above or to the left (so kinds come in
    // little clusters), else any of the palette.
    function klasefarge(b, r, c, pal, tilf, p) {
      const nb = naboer(b, r, c).filter(([rr, cc]) => (rr < r || (rr === r && cc < c)) && b.rader[rr][cc] && pal.includes(b.rader[rr][cc]));
      if (nb.length && tilf() < p) {
        const [rr, cc] = nb[heltall(tilf, nb.length)];
        return b.rader[rr][cc];
      }
      return pal[heltall(tilf, pal.length)];
    }

    // Level n: the same board on every phone. More kinds and rows as n grows; six shapes in turn.
    const nivaFarger = (n) => (n <= 2 ? 3 : n <= 6 ? 4 : n <= 14 ? 5 : 6);
    const nivaRader = (n) => Math.min(7, 4 + Math.floor((n - 1) / 3));
    function nivaBrett(n) {
      const tilf = rng(fnv(`bobla:${n}`));
      const k = nivaFarger(n);
      const rader = nivaRader(n);
      const pal = stokk([1, 2, 3, 4, 5, 6], tilf).slice(0, k);
      const form = (n - 1) % 6;
      const b = tomt();
      for (let r = 0; r < rader; r++)
        for (let c = 0; c < bredde(b, r); c++) {
          const x = px(b, r, c);
          let med = true;
          if (form === 1) med = r === 0 || Math.abs(x - K / 2) <= (rader - r) * 0.85 + 0.2;
          else if (form === 3) med = !(r % 2 === 1 && r < rader - 1 && c % 3 === 1);
          else if (form === 4) med = r < rader - 1 || Math.floor(x) % 3 !== 1;
          if (!med) continue;
          if (form === 2) b.rader[r][c] = tilf() < 0.15 ? pal[heltall(tilf, k)] : pal[Math.floor(x / 2) % k];
          else if (form === 5) b.rader[r][c] = pal[(Math.floor(r / 2) + Math.floor(x / 2)) % k];
          else b.rader[r][c] = klasefarge(b, r, c, pal, tilf, 0.55);
        }
      for (const [r, c] of flytende(b)) b.rader[r][c] = 0;
      return b;
    }

    // Endless: a fresh board with four kinds.
    function startBrett(tilf) {
      const b = tomt();
      const pal = [1, 2, 3, 4];
      for (let r = 0; r < 5; r++) for (let c = 0; c < bredde(b, r); c++) b.rader[r][c] = klasefarge(b, r, c, pal, tilf, 0.5);
      return b;
    }
    const uendeligFarger = (poeng) => (poeng < 1500 ? 4 : poeng < 5000 ? 5 : 6);

    // Endless: everything moves down a row and a new full row comes in at the top.
    function nyRad(b, tilf, k) {
      b.forskyv ^= 1;
      b.rader.pop();
      b.rader.unshift(tomRad());
      for (let c = 0; c < bredde(b, 0); c++) {
        const under = naboer(b, 0, c).filter(([rr, cc]) => rr === 1 && b.rader[1][cc]);
        if (under.length && tilf() < 0.4) b.rader[0][c] = b.rader[1][under[heltall(tilf, under.length)][1]];
        else b.rader[0][c] = 1 + heltall(tilf, k);
      }
    }

    // How many misses before the ceiling comes down (levels) or a new row comes in (endless).
    const bomGrense = (sp) => (sp.modus === "brett" ? 7 : sp.poeng < 2000 ? 6 : sp.poeng < 6000 ? 5 : sp.poeng < 12000 ? 4 : 3);

    // The next bubble: a kind that is still on the board (any kind when it is empty).
    function nyKule(b, tilf, k) {
      const f = farger(b);
      if (f.length) return f[heltall(tilf, f.length)];
      return 1 + heltall(tilf, k);
    }

    function nyttSpill(modus, niva, fro) {
      const tilf = rng(fro >>> 0);
      const brett = modus === "brett";
      const b = brett ? nivaBrett(niva) : startBrett(tilf);
      const k = brett ? nivaFarger(niva) : 4;
      const sp = { modus, niva: brett ? niva : 0, brett: b, kule: 0, neste: 0, fro: 0, poeng: 0, bom: 0, skudd: 0, sprukket: 0, falt: 0, besteFall: 0, slutt: null, vinkel: 0 };
      sp.kule = nyKule(b, tilf, k);
      sp.neste = nyKule(b, tilf, k);
      sp.fro = Math.floor(tilf() * 4294967296) >>> 0;
      return sp;
    }

    // Stars for a level: by how far the ceiling came down.
    const stjerner = (tak) => (tak <= 1 ? 3 : tak <= 3 ? 2 : 1);

    // One shot at angle v. Changes sp and returns what happened (for the drawing and the sounds):
    // { bane, r, c, farge, pop: [{ r, c, f }], fall: [{ r, c, f }], poeng, bonus, senket, nyeRader,
    //   rent, slutt: null | "vunnet" | "tapt", gml: { forskyv, tak } (the board as it was) }.
    function skyt(sp, v) {
      const b = sp.brett;
      const farge = sp.kule;
      const gml = { forskyv: b.forskyv, tak: b.tak };
      const ba = bane(b, v);
      b.rader[ba.r][ba.c] = farge;
      const h = { bane: ba.punkter, sprett: ba.sprett, r: ba.r, c: ba.c, farge, pop: [], fall: [], poeng: 0, bonus: 0, senket: false, nyeRader: 0, rent: false, slutt: null, gml };
      const kl = klynge(b, ba.r, ba.c);
      if (kl.length >= 3) {
        for (const [r, c] of kl) {
          h.pop.push({ r, c, f: b.rader[r][c] });
          b.rader[r][c] = 0;
        }
        for (const [r, c] of flytende(b)) {
          h.fall.push({ r, c, f: b.rader[r][c] });
          b.rader[r][c] = 0;
        }
        h.poeng = h.pop.length * 10 + h.fall.length * 20 * (h.fall.length >= 6 ? 2 : 1);
      } else sp.bom += 1;
      sp.skudd += 1;
      sp.sprukket += h.pop.length;
      sp.falt += h.fall.length;
      sp.besteFall = Math.max(sp.besteFall || 0, h.fall.length);
      const tilf = rng(sp.fro);
      if (tom(b)) {
        h.rent = true;
        if (sp.modus === "brett") {
          h.slutt = "vunnet";
          h.bonus = 100 * stjerner(b.tak);
        } else {
          h.bonus = 500;
          for (let i = 0; i < 4; i++) nyRad(b, tilf, uendeligFarger(sp.poeng));
          h.nyeRader = 4;
          sp.bom = 0;
        }
      }
      sp.poeng += h.poeng + h.bonus;
      if (!h.slutt && sp.bom >= bomGrense(sp)) {
        sp.bom = 0;
        if (sp.modus === "brett") {
          b.tak += 1;
          h.senket = true;
        } else {
          nyRad(b, tilf, uendeligFarger(sp.poeng));
          h.nyeRader += 1;
        }
      }
      if (!h.slutt && overLinja(b)) h.slutt = "tapt";
      const k = sp.modus === "brett" ? nivaFarger(sp.niva) : uendeligFarger(sp.poeng);
      sp.kule = sp.neste;
      sp.neste = nyKule(b, tilf, k);
      // A kind that is gone from the board is never handed out.
      if (!tom(b)) {
        const finnes = farger(b);
        if (!finnes.includes(sp.kule)) sp.kule = nyKule(b, tilf, k);
        if (!finnes.includes(sp.neste)) sp.neste = nyKule(b, tilf, k);
      }
      sp.fro = Math.floor(tilf() * 4294967296) >>> 0;
      sp.vinkel = klampVinkel(v);
      if (h.slutt) sp.slutt = h.slutt;
      return h;
    }

    function bytt(sp) {
      [sp.kule, sp.neste] = [sp.neste, sp.kule];
    }

    // A saved board from storage: the right shape and kinds only, nothing floating.
    function gyldigBrett(b) {
      if (!b || typeof b !== "object" || !Array.isArray(b.rader) || b.rader.length !== LINJE + 1) return false;
      if (!(b.forskyv === 0 || b.forskyv === 1) || !Number.isInteger(b.tak) || b.tak < 0 || b.tak > LINJE) return false;
      for (let r = 0; r <= LINJE; r++) {
        const rad = b.rader[r];
        if (!Array.isArray(rad) || rad.length !== K || !rad.every((v) => Number.isInteger(v) && v >= 0 && v <= 6)) return false;
        if (skjev(b, r) && rad[K - 1]) return false;
      }
      return flytende(b).length === 0;
    }

    return { K, LINJE, RH, LINJE_Y, SKYT_Y, HOYDE, TREFF, MAKS, tomt, kopi, skjev, bredde, px, py, naboer, alle, antall, tom, farger, nederst, overLinja, klynge, flytende, fest, bane, fnv, rng, stokk, nivaFarger, nivaRader, nivaBrett, startBrett, uendeligFarger, nyRad, bomGrense, nyKule, nyttSpill, stjerner, skyt, bytt, klampVinkel, gyldigBrett };
  })();

  const R = window.Rusj;
  window.Bobla = { Boble, opptatt: () => !!anim || las };
  if (!R) return;
  const esc = R.esc;
  const { K, LINJE, RH, SKYT_Y, HOYDE } = Boble;

  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  // Each kind: a colour and a symbol of its own (the symbol carries the rule, the colour helps).
  const SORT = [
    null,
    { hex: "#ff5d73", navn: R.t("rødt hjerte"), form: "hjerte" },
    { hex: "#ffd23f", navn: R.t("gul stjerne"), form: "stjerne" },
    { hex: "#4d8dff", navn: R.t("blå dråpe"), form: "drape" },
    { hex: "#43d17a", navn: R.t("grønn trekant"), form: "trekant" },
    { hex: "#b580ff", navn: R.t("lilla diamant"), form: "diamant" },
    { hex: "#36d3cf", navn: R.t("turkis firkant"), form: "firkant" },
  ];
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/bobla/" }).href;
  const FART = 27; // bubble diameters per second
  const STJERNE = "★";

  let H; // actions
  let tegner = null; // the drawing of the play screen
  let anim = null; // the shot being drawn
  let sikter = false; // the aim line shows
  let pauset = false;
  let pauseStart = 0;
  let las = false; // the run is over and the result is on its way
  const taster = { venstre: false, hoyre: false, fin: false };

  // ---------- The game state ----------

  const iGang = (sp) => !!(sp && !sp.ferdig && !sp.slutt);
  const modusTekst = (sp) => (sp.modus === "brett" ? R.t("Brett {n}", { n: sp.niva }) : R.t("Uendelig"));

  function nyttSpill(S, modus, niva) {
    S.spill = Boble.nyttSpill(modus, niva, R.nyttFro());
    S.spill.startRekord = S.rekord || 0;
    anim = null;
    sikter = false;
    pauset = false;
    las = false;
    R.statistikk("start", { modus, niva: S.spill.niva });
  }

  // The result, the record and the level progress; saved at once, so a reload or «tilbake»
  // during the last pop never leaves a locked board.
  function ferdigstill(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || !sp.slutt) return;
    sp.ferdig = true;
    const res = { slutt: sp.slutt, poeng: sp.poeng };
    if (sp.modus === "brett") {
      if (sp.slutt === "vunnet") {
        res.stjerner = Boble.stjerner(sp.brett.tak);
        const gml = S.stjerner[sp.niva] || 0;
        res.nyeStjerner = res.stjerner > gml;
        S.stjerner[sp.niva] = Math.max(gml, res.stjerner);
        S.niva = Math.max(S.niva, sp.niva + 1);
        if (sp.niva >= 10) R.merke("arkade-bobla");
      }
      S.sist = { modus: "brett", niva: sp.niva, vunnet: sp.slutt === "vunnet", stjerner: res.stjerner || 0, poeng: sp.poeng };
    } else {
      const gml = sp.startRekord || 0;
      res.gml = gml;
      res.nyRekord = sp.poeng > gml && gml > 0;
      res.forste = !gml && sp.poeng > 0;
      S.rekord = Math.max(S.rekord || 0, sp.poeng);
      S.sist = { modus: "uendelig", poeng: sp.poeng };
    }
    sp.resultat = res;
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.niva, vunnet: sp.slutt === "vunnet", poeng: sp.poeng, skudd: sp.skudd });
  }

  // ---------- Drawing ----------

  const BLEKK = "#170e2b";
  function blandHex(hex, til, t) {
    const a = parseInt(hex.slice(1), 16);
    const b = parseInt(til.slice(1), 16);
    const k = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return `rgb(${k(16)},${k(8)},${k(0)})`;
  }

  // The symbol of a kind, centred on 0,0 for a bubble of radius 1.
  function symbol(g, form) {
    g.beginPath();
    if (form === "hjerte") {
      g.moveTo(0, 0.44);
      g.bezierCurveTo(-0.66, 0.02, -0.52, -0.56, 0, -0.2);
      g.bezierCurveTo(0.52, -0.56, 0.66, 0.02, 0, 0.44);
    } else if (form === "stjerne") {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.22 : 0.52;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 0.03);
      }
    } else if (form === "drape") {
      g.moveTo(0, -0.5);
      g.bezierCurveTo(0.16, -0.26, 0.36, -0.06, 0.36, 0.17);
      g.arc(0, 0.17, 0.36, 0, Math.PI);
      g.bezierCurveTo(-0.36, -0.06, -0.16, -0.26, 0, -0.5);
    } else if (form === "trekant") {
      g.moveTo(0, -0.46);
      g.lineTo(0.48, 0.36);
      g.lineTo(-0.48, 0.36);
    } else if (form === "diamant") {
      g.moveTo(0, -0.52);
      g.lineTo(0.4, 0);
      g.lineTo(0, 0.52);
      g.lineTo(-0.4, 0);
    } else {
      g.rect(-0.34, -0.34, 0.68, 0.68);
    }
    g.closePath();
  }

  // One bubble of kind f at (x, y) with radius rad (pixels).
  function tegnBoble(g, x, y, rad, f) {
    const s = SORT[f];
    if (!s) return;
    g.save();
    g.translate(x, y);
    const grad = g.createRadialGradient(-rad * 0.35, -rad * 0.4, rad * 0.1, 0, 0, rad);
    grad.addColorStop(0, blandHex(s.hex, "#ffffff", 0.45));
    grad.addColorStop(0.55, s.hex);
    grad.addColorStop(1, blandHex(s.hex, BLEKK, 0.35));
    g.beginPath();
    g.arc(0, 0, rad * 0.94, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = Math.max(1.2, rad * 0.1);
    g.strokeStyle = BLEKK;
    g.stroke();
    g.save();
    g.scale(rad, rad);
    symbol(g, s.form);
    g.restore();
    g.fillStyle = "rgba(23,14,43,0.62)";
    g.fill();
    g.lineJoin = "round";
    g.lineWidth = Math.max(1, rad * 0.06);
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.stroke();
    g.beginPath();
    g.ellipse(-rad * 0.42, -rad * 0.5, rad * 0.2, rad * 0.11, -0.7, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fill();
    g.restore();
  }

  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  class Tegner {
    constructor(rot) {
      this.flate = R.$(".bo-flate", rot);
      this.lerret = R.$(".bo-lerret", rot);
      this.byttKnapp = R.$(".bo-bytt", rot);
      this.g = this.lerret.getContext("2d");
      this.D = 0;
      this.dpr = 1;
      this.id = 0;
      this.levende = true;
      this.sprites = [];
      this.bakgrunn = null;
      this.partikler = [];
      this.tekster = [];
      this.sist = performance.now();
      this.tegn = this.tegn.bind(this);
      this.tilpass();
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
      this.id = requestAnimationFrame(this.tegn);
    }
    tilpass() {
      const w = this.flate.clientWidth;
      const h = this.flate.clientHeight;
      if (!w || !h) return;
      const D = Math.max(14, Math.floor(Math.min((w - 6) / K, (h - 6) / HOYDE)));
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      if (D === this.D && dpr === this.dpr) return this.vekk();
      this.D = D;
      this.dpr = dpr;
      this.lerret.style.width = D * K + "px";
      this.lerret.style.height = Math.round(D * HOYDE) + "px";
      this.lerret.width = Math.round(D * K * dpr);
      this.lerret.height = Math.round(D * HOYDE * dpr);
      this.sprites = [];
      this.bakgrunn = null;
      // The swap button sits on the next bubble.
      const b = this.byttKnapp;
      if (b) {
        const s = Math.round(D * 1.25);
        b.style.width = s + "px";
        b.style.height = s + "px";
        b.style.left = Math.round((K / 2 - 1.75) * D - s / 2) + "px";
        b.style.top = Math.round((SKYT_Y + 0.12) * D - s / 2) + "px";
      }
      this.vekk();
    }
    sprite(f) {
      if (this.sprites[f]) return this.sprites[f];
      const s = Math.ceil(this.D * this.dpr) + 2;
      const k = document.createElement("canvas");
      k.width = s;
      k.height = s;
      tegnBoble(k.getContext("2d"), s / 2, s / 2, (this.D * this.dpr) / 2, f);
      this.sprites[f] = k;
      return k;
    }
    // A bubble at (x, y) in bubble units, scaled.
    boble(x, y, f, skala = 1, alfa = 1) {
      if (!SORT[f] || alfa <= 0) return;
      const g = this.g;
      const s = this.sprite(f);
      const d = (s.width / this.dpr) * skala;
      if (alfa < 1) g.globalAlpha = alfa;
      g.drawImage(s, x * this.D - d / 2, y * this.D - d / 2, d, d);
      g.globalAlpha = 1;
    }
    lagBakgrunn() {
      const D = this.D;
      const k = document.createElement("canvas");
      k.width = this.lerret.width;
      k.height = this.lerret.height;
      const g = k.getContext("2d");
      g.scale(this.dpr, this.dpr);
      const w = K * D;
      const h = HOYDE * D;
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#24174d");
      grad.addColorStop(1, "#140b2e");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // Faint dots where bubbles can sit
      g.fillStyle = "rgba(255,241,221,0.06)";
      for (let r = 0; r < LINJE; r++)
        for (let c = 0; c < (r % 2 ? K - 1 : K); c++) {
          g.beginPath();
          g.arc(((r % 2 ? 1 : 0.5) + c) * D, (0.5 + r * RH) * D, D * 0.07, 0, Math.PI * 2);
          g.fill();
        }
      // The launcher's floor
      g.fillStyle = "rgba(255,241,221,0.05)";
      g.fillRect(0, (Boble.LINJE_Y + 0.14) * D, w, h);
      this.bakgrunn = k;
    }

    tegn(na) {
      this.id = 0;
      if (!this.levende || !this.D) return;
      na = na || performance.now();
      const dt = Math.min(0.05, Math.max(0, (na - this.sist) / 1000));
      this.sist = na;
      const S = R.S;
      const sp = S && S.spill;
      if (!sp) return;
      // The keyboard turns the aim while an arrow is held.
      if ((taster.venstre || taster.hoyre) && !pauset && !anim) {
        const fart = taster.fin ? 0.3 : 1.05;
        sp.vinkel = Boble.klampVinkel(sp.vinkel + (taster.hoyre ? 1 : -1) * fart * dt);
        sikter = true;
      }
      const g = this.g;
      const D = this.D;
      if (!this.bakgrunn) this.lagBakgrunn();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.bakgrunn, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const b = sp.brett;
      const a = anim;
      let landet = !a;
      let flyt = 0; // rows the board is still drawn above where it is (the drop slides)
      let t = 0;
      if (a) {
        t = (na - a.t0) / 1000;
        landet = t >= a.flytid;
        const steg = a.nyeRader + (a.senket ? 1 : 0);
        if (steg) flyt = steg * (1 - ease((t - a.flytid - a.popTid) / 0.32));
      }
      const forskyvY = -flyt * RH;
      // The ceiling (levels: a plate that comes down)
      const takY = (b.tak * RH + forskyvY) * D;
      if (takY > 0) {
        g.fillStyle = "#3b2b70";
        g.fillRect(0, 0, K * D, takY);
        g.save();
        g.beginPath();
        g.rect(0, 0, K * D, takY);
        g.clip();
        g.strokeStyle = "rgba(255,241,221,0.1)";
        g.lineWidth = D * 0.16;
        for (let x = -takY; x < K * D + takY; x += D * 0.6) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + takY, takY);
          g.stroke();
        }
        g.restore();
      }
      g.fillStyle = "#6a58b8";
      g.fillRect(0, Math.max(0, takY) - 2, K * D, 4);
      // The line (brighter when the bubbles are close)
      const fare = Boble.nederst(b) >= LINJE - 2;
      g.save();
      g.setLineDash([D * 0.22, D * 0.16]);
      g.lineWidth = fare ? 3 : 2;
      g.strokeStyle = fare ? "rgba(255,120,104,0.95)" : "rgba(255,120,104,0.5)";
      g.beginPath();
      g.moveTo(0, Boble.LINJE_Y * D);
      g.lineTo(K * D, Boble.LINJE_Y * D);
      g.stroke();
      g.restore();
      // The board (the cell the flying bubble lands in waits until it is there)
      const skjultR = a && !landet ? a.r + a.nyeRader : -1;
      for (let r = 0; r <= LINJE; r++)
        for (let c = 0; c < K; c++) {
          const f = b.rader[r][c];
          if (!f || (r === skjultR && c === a.c)) continue;
          this.boble(Boble.px(b, r, c), Boble.py(b, r) + forskyvY, f);
        }
      // What popped and fell is drawn where it was, on the board as it was.
      if (a) {
        const gb = a.gml;
        for (const p of a.pop) {
          const x = Boble.px(gb, p.r, p.c);
          const y = Boble.py(gb, p.r);
          const lt = t - a.flytid - p.d;
          if (!landet) {
            if (!(p.r === a.r && p.c === a.c)) this.boble(x, y, p.f);
          } else if (lt < 0) this.boble(x, y, p.f);
          else if (lt < 0.2) {
            if (!p.gnist) {
              p.gnist = true;
              this.gnister(x, y, p.f);
            }
            this.boble(x, y, p.f, 1 + lt * 2, 1 - lt / 0.2);
          }
        }
        for (const p of a.fall) {
          const x0 = Boble.px(gb, p.r, p.c);
          const y0 = Boble.py(gb, p.r);
          const lt = t - a.flytid - a.fallStart;
          if (!landet || lt < 0) this.boble(x0, y0, p.f);
          else {
            const x = x0 + p.vx * lt;
            const y = y0 + p.vy * lt + 0.5 * 34 * lt * lt;
            if (y < HOYDE + 1) this.boble(x, y, p.f, 1, y > Boble.LINJE_Y ? 1 - (y - Boble.LINJE_Y) / 1.6 : 1);
          }
        }
        // The flying bubble
        if (!landet) {
          const [x, y] = punktPa(a, t * FART);
          this.boble(x, y, a.farge);
        } else if (!a.landet) {
          a.landet = true;
          landing(a);
        }
        if (t > a.ferdigTid) {
          anim = null;
          etterAnim();
        }
      }
      // The aim line and where the bubble would land
      if (sikter && !anim && !pauset && !las && !sp.ferdig) this.siktelinje(Boble.bane(b, sp.vinkel), sp.kule);
      // The launcher, the bubble in it and the next one
      this.utskyter(sp, na);
      // Sparks and words
      this.effekter(dt);
      const liv = anim || this.partikler.length || this.tekster.length || taster.venstre || taster.hoyre;
      if (liv && !pauset && this.levende && !this.id) this.id = requestAnimationFrame(this.tegn);
    }

    siktelinje(ba, f) {
      const g = this.g;
      const D = this.D;
      const p = ba.punkter;
      let rest = 0.75;
      g.fillStyle = "rgba(255,241,221,0.85)";
      for (let i = 1; i < p.length; i++) {
        const [x0, y0] = p[i - 1];
        const [x1, y1] = p[i];
        const l = Math.hypot(x1 - x0, y1 - y0);
        let s = rest;
        for (; s < l - 0.3; s += 0.4) {
          g.beginPath();
          g.arc((x0 + ((x1 - x0) * s) / l) * D, (y0 + ((y1 - y0) * s) / l) * D, Math.max(1.6, D * 0.065), 0, Math.PI * 2);
          g.fill();
        }
        rest = Math.max(0, s - l);
      }
      // The landing cell: a dashed ring with the bubble faint inside it.
      const [lx, ly] = p[p.length - 1];
      this.boble(lx, ly, f, 0.85, 0.45);
      g.save();
      g.setLineDash([D * 0.12, D * 0.09]);
      g.lineWidth = Math.max(2, D * 0.07);
      g.strokeStyle = "rgba(255,241,221,0.95)";
      g.beginPath();
      g.arc(lx * D, ly * D, D * 0.47, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    utskyter(sp, na) {
      const g = this.g;
      const D = this.D;
      const cx = (K / 2) * D;
      const cy = SKYT_Y * D;
      // A pointer that always shows the aim
      g.save();
      g.translate(cx, cy);
      g.rotate(sp.vinkel);
      g.fillStyle = "rgba(255,241,221,0.92)";
      g.strokeStyle = BLEKK;
      g.lineWidth = 2;
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(-D * 0.12, -D * 0.52);
      g.lineTo(-D * 0.12, -D * 0.8);
      g.lineTo(-D * 0.26, -D * 0.8);
      g.lineTo(0, -D * 1.1);
      g.lineTo(D * 0.26, -D * 0.8);
      g.lineTo(D * 0.12, -D * 0.8);
      g.lineTo(D * 0.12, -D * 0.52);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      // The ring
      g.beginPath();
      g.arc(cx, cy, D * 0.64, 0, Math.PI * 2);
      g.fillStyle = "#2d2060";
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,241,221,0.28)";
      g.stroke();
      // The bubble in it grows in after a shot
      if (!sp.ferdig) {
        const inn = anim ? ease((na - anim.t0) / 240) : 1;
        this.boble(K / 2, SKYT_Y, sp.kule, 0.35 + 0.65 * inn);
      }
      // The next one, small, with the swap arrow
      const nx = K / 2 - 1.75;
      const ny = SKYT_Y + 0.12;
      g.beginPath();
      g.arc(nx * D, ny * D, D * 0.45, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,241,221,0.08)";
      g.fill();
      if (!sp.ferdig) this.boble(nx, ny, sp.neste, 0.68);
      g.save();
      g.strokeStyle = "rgba(255,241,221,0.6)";
      g.fillStyle = "rgba(255,241,221,0.6)";
      g.lineWidth = Math.max(1.5, D * 0.06);
      g.lineCap = "round";
      const ax = (K / 2 - 0.88) * D;
      const ay = (SKYT_Y + 0.05) * D;
      g.beginPath();
      g.arc(ax, ay, D * 0.3, Math.PI * 1.15, Math.PI * 1.8);
      g.stroke();
      const ex = ax + Math.cos(Math.PI * 1.8) * D * 0.3;
      const ey = ay + Math.sin(Math.PI * 1.8) * D * 0.3;
      g.beginPath();
      g.moveTo(ex + D * 0.1, ey + D * 0.02);
      g.lineTo(ex - D * 0.06, ey - D * 0.1);
      g.lineTo(ex - D * 0.04, ey + D * 0.1);
      g.closePath();
      g.fill();
      g.restore();
      // The misses left before the ceiling (or a new row): dots to the right
      const grense = Boble.bomGrense(sp);
      const igjen = grense - sp.bom;
      const x0 = K / 2 + 1.05;
      const steg = Math.min(0.36, (K - 0.35 - x0) / Math.max(1, grense - 1));
      for (let i = 0; i < grense; i++) {
        g.beginPath();
        g.arc((x0 + i * steg) * D, (SKYT_Y + 0.12) * D, D * 0.11, 0, Math.PI * 2);
        if (i < igjen) {
          g.fillStyle = igjen <= 2 ? "#ff8a7a" : "rgba(255,241,221,0.88)";
          g.fill();
        } else {
          g.lineWidth = 1.5;
          g.strokeStyle = "rgba(255,241,221,0.35)";
          g.stroke();
        }
      }
    }

    gnister(x, y, f) {
      if (R.rolig()) return;
      const farge = SORT[f].hex;
      for (let i = 0; i < 6; i++) {
        const v = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 3;
        this.partikler.push({ x, y, vx: Math.cos(v) * s, vy: Math.sin(v) * s - 1, liv: 0.45, farge, r: 0.06 + Math.random() * 0.06 });
      }
    }
    tekst(x, y, tekst, stor) {
      this.tekster.push({ x, y, tekst, liv: 1.1, stor });
      this.vekk();
    }
    effekter(dt) {
      const g = this.g;
      const D = this.D;
      this.partikler = this.partikler.filter((p) => (p.liv -= dt) > 0);
      for (const p of this.partikler) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 12 * dt;
        g.globalAlpha = Math.min(1, p.liv * 2.5);
        g.fillStyle = p.farge;
        g.beginPath();
        g.arc(p.x * D, p.y * D, p.r * D, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      this.tekster = this.tekster.filter((t) => (t.liv -= dt) > 0);
      for (const t of this.tekster) {
        const y = Math.max(1, t.y) - (1.1 - t.liv) * 0.9 + 0.3;
        const x = Math.min(K - 1.5, Math.max(1.5, t.x));
        g.globalAlpha = Math.min(1, t.liv * 2);
        g.font = `900 ${Math.round(D * (t.stor ? 0.6 : 0.48))}px ui-rounded, system-ui, sans-serif`;
        g.textAlign = "center";
        g.lineJoin = "round";
        g.lineWidth = 4;
        g.strokeStyle = BLEKK;
        g.strokeText(t.tekst, x * D, y * D);
        g.fillStyle = t.stor ? "#ffd23f" : "#fff1dd";
        g.fillText(t.tekst, x * D, y * D);
      }
      g.globalAlpha = 1;
    }
  }

  // The point at distance s along the shot's path.
  function punktPa(a, s) {
    for (let i = 1; i < a.punkter.length; i++) {
      if (s <= a.lengder[i] || i === a.punkter.length - 1) {
        const [x0, y0] = a.punkter[i - 1];
        const [x1, y1] = a.punkter[i];
        const del = a.lengder[i] - a.lengder[i - 1];
        const f = del ? Math.max(0, Math.min(1, (s - a.lengder[i - 1]) / del)) : 1;
        return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
      }
    }
    return a.punkter[a.punkter.length - 1];
  }

  // ---------- Shooting ----------

  function skyt(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.slutt || anim || pauset || las || R.arkApent() || !tegner) return;
    const h = Boble.skyt(sp, sp.vinkel);
    sikter = false;
    // The path with its lengths (for the flight)
    const lengder = [0];
    for (let i = 1; i < h.bane.length; i++) lengder.push(lengder[i - 1] + Math.hypot(h.bane[i][0] - h.bane[i - 1][0], h.bane[i][1] - h.bane[i - 1][1]));
    const rolig = R.rolig();
    const flytid = rolig ? 0.05 : lengder[lengder.length - 1] / FART;
    // Pops go out from where the bubble landed, one after the other.
    const [lx, ly] = h.bane[h.bane.length - 1];
    const gb = h.gml;
    const avstand = (p) => Math.hypot(Boble.px(gb, p.r, p.c) - lx, Boble.py(gb, p.r) - ly);
    h.pop.sort((p, q) => avstand(p) - avstand(q));
    h.pop.forEach((p, i) => (p.d = rolig ? 0 : i * 0.03));
    for (const p of h.fall) {
      p.vx = (Math.random() - 0.5) * 2.4;
      p.vy = -1 - Math.random() * 2.5;
    }
    const popTid = h.pop.length ? (rolig ? 0.1 : h.pop.length * 0.03 + 0.18) : 0.05;
    const fallStart = h.pop.length ? Math.min(popTid, 0.12) : 0;
    const steg = h.nyeRader + (h.senket ? 1 : 0);
    anim = {
      ...h,
      t0: performance.now(),
      punkter: h.bane,
      lengder,
      flytid,
      popTid,
      fallStart,
      ferdigTid: flytid + Math.max(popTid + (steg ? 0.36 : 0), h.fall.length ? fallStart + 0.9 : 0) + 0.05,
    };
    R.lyd.tone(520, 0, 0.07, "sine", 0.06, 820);
    R.vibrer(5);
    oppdaterHud(S);
    if (sp.slutt) {
      ferdigstill(S);
      las = true;
    }
    R.lagre();
    tegner.vekk();
  }

  // When the bubble is there: sounds, words, what the screen reader hears.
  function landing(a) {
    const sp = R.S.spill;
    const n = a.pop.length;
    const [lx, ly] = a.punkter[a.punkter.length - 1];
    if (a.sprett) R.lyd.tone(880, 0, 0.03, "triangle", 0.03);
    if (n) {
      for (let i = 0; i < Math.min(8, n); i++) R.lyd.tone(560 + i * 70, i * 0.03, 0.07, "triangle", 0.08);
      if (a.fall.length) R.lyd.tone(1046.5, 0.12 + Math.min(8, n) * 0.03, 0.12, "triangle", 0.08, 523);
      if (a.fall.length >= 6) setTimeout(() => R.lyd.pling(), 280);
      R.vibrer(a.fall.length ? [12, 30, 18] : 10);
      if (tegner) {
        tegner.tekst(lx, ly, `+${R.tall(a.poeng)}`, a.fall.length >= 6);
        if (a.fall.length >= 6) tegner.tekst(K / 2, Math.min(ly + 1.4, Boble.LINJE_Y - 0.6), R.t("Stort fall!"), true);
      }
    } else {
      R.lyd.tone(240, 0, 0.08, "sine", 0.08);
      R.vibrer(6);
    }
    if (a.senket || a.nyeRader) {
      setTimeout(() => {
        R.lyd.stoy(0, 0.25, 0.1, 420, "lowpass");
        R.vibrer(20);
      }, (a.popTid || 0) * 1000);
    }
    if (a.rent && tegner) tegner.tekst(K / 2, 4, a.slutt === "vunnet" ? R.t("Alt borte!") : R.t("Rent brett! +{n}", { n: a.bonus }), true);
    // One sentence for a screen reader
    const deler = [];
    if (n) deler.push(R.t("{n} sprakk.", { n }) + (a.fall.length ? " " + R.t("{n} falt ned.", { n: a.fall.length }) : "") + " " + R.t("Pluss {n}.", { n: a.poeng + a.bonus }));
    else deler.push(R.t("Boblen ble sittende i rad {rad}.", { rad: a.r + 1 }));
    if (a.senket) deler.push(R.t("Taket kom ned en rad."));
    if (a.nyeRader) deler.push(R.t("En ny rad kom inn ovenfra."));
    if (!a.slutt && sp && !sp.ferdig) {
      const igjen = Boble.bomGrense(sp) - sp.bom;
      if (!n && !a.senket && !a.nyeRader) deler.push(sp.modus === "brett" ? R.t("Taket senkes om {n} bom.", { n: igjen }) : R.t("Ny rad om {n} bom.", { n: igjen }));
      deler.push(R.t("Neste: {kule}.", { kule: SORT[sp.kule].navn }));
    }
    R.si(deler.join(" "));
  }

  function etterAnim() {
    const S = R.S;
    const sp = S.spill;
    if (!sp) return;
    oppdaterHud(S);
    if (sp.ferdig && las) {
      const fortsatt = R.vakt();
      const vunnet = sp.slutt === "vunnet";
      R.si(vunnet ? R.t("Alle boblene er borte!") : R.t("Boblene nådde streken."));
      if (!vunnet) {
        R.lyd.tone(392, 0, 0.18, "triangle", 0.08);
        R.lyd.tone(330, 0.16, 0.24, "triangle", 0.07);
      }
      setTimeout(() => fortsatt() && R.gaTil("slutt"), R.rolig() ? 500 : 900);
    }
  }

  function bytt(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || anim || pauset || las || !sp.neste) return;
    Boble.bytt(sp);
    R.lyd.tone(700, 0, 0.05, "sine", 0.06, 520);
    R.vibrer(4);
    R.si(R.t("Byttet. Nå: {kule}. Neste: {neste}.", { kule: SORT[sp.kule].navn, neste: SORT[sp.neste].navn }));
    oppdaterHud(S);
    R.lagre();
    if (tegner) tegner.vekk();
  }

  function oppdaterHud(S) {
    const sp = S.spill;
    if (!sp) return;
    const p = R.$("#bo-poeng");
    if (p) p.textContent = R.tall(sp.poeng);
    const b = R.$("#bo-beste");
    if (b) b.textContent = R.tall(Math.max(S.rekord || 0, sp.poeng));
    const knapp = R.$(".bo-bytt");
    if (knapp && SORT[sp.neste]) knapp.setAttribute("aria-label", R.t("Bytt boble. Nå: {kule}. Neste: {neste}.", { kule: SORT[sp.kule].navn, neste: SORT[sp.neste].navn }));
    const tekst = R.$("#bo-tekst");
    if (tekst) tekst.textContent = brettTekst(sp);
  }

  // The board for a screen reader, in short.
  function brettTekst(sp) {
    const b = sp.brett;
    const tell = {};
    for (const [r, c] of Boble.alle(b)) tell[b.rader[r][c]] = (tell[b.rader[r][c]] || 0) + 1;
    const liste = Object.keys(tell).map((f) => `${tell[f]} ${SORT[f].navn}`);
    const igjen = Boble.bomGrense(sp) - sp.bom;
    return `${R.t("{n} boble på brettet:|{n} bobler på brettet:", { n: Boble.antall(b) })} ${liste.join(", ")}. ${R.t("Den nederste er {n} rad over streken.|Den nederste er {n} rader over streken.", { n: Math.max(0, LINJE - Boble.nederst(b)) })} ${sp.modus === "brett" ? R.t("Taket senkes om {n} bom.", { n: igjen }) : R.t("Ny rad om {n} bom.", { n: igjen })}`;
  }

  // ---------- Pause ----------

  function pause(S, pa) {
    const sp = S.spill;
    if (!sp || sp.ferdig || pa === pauset) return;
    pauset = pa;
    if (pa) {
      pauseStart = performance.now();
      taster.venstre = taster.hoyre = false;
      sikter = false;
    } else if (anim) anim.t0 += performance.now() - pauseStart; // a shot in the air goes on from where it stopped
    visStatus();
    if (!pa && tegner) tegner.vekk();
  }

  function visStatus() {
    const el = R.$(".bo-status");
    const knapp = R.$('[data-h="pause"]');
    if (knapp) {
      knapp.setAttribute("aria-label", pauset ? R.t("Fortsett") : R.t("Pause"));
      knapp.classList.toggle("pauset", pauset);
    }
    if (!el) return;
    if (!pauset) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="bo-statuskort"><p class="etikett">${esc(R.t("Pause"))}</p><p class="bo-stor">${esc(R.t("Boblene venter"))}</p>${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}</div>`;
  }

  // ---------- Pointer and keyboard ----------

  function vinkelFra(e) {
    const l = R.$(".bo-lerret");
    if (!l || !tegner || !tegner.D) return null;
    const b = l.getBoundingClientRect();
    const x = (e.clientX - b.left) / tegner.D;
    const y = (e.clientY - b.top) / tegner.D;
    if (y > SKYT_Y - 0.35) return null; // below the launcher: no aim (drag down there to cancel)
    return Boble.klampVinkel(Math.atan2(x - K / 2, SKYT_Y - y));
  }

  function bindSpill(S, rot) {
    const ramme = R.$(".bo-ramme", rot);
    if (!ramme) return;
    let peker = null;
    const kanSikte = () => {
      const sp = R.S.spill;
      return !!(sp && !sp.ferdig && !pauset && !las && !R.arkApent());
    };
    const sikt = (e) => {
      const v = vinkelFra(e);
      if (v == null) sikter = false;
      else {
        R.S.spill.vinkel = v;
        sikter = true;
      }
      if (tegner) tegner.vekk();
    };
    const ned = (e) => {
      if (e.target.closest("button") || (e.pointerType === "mouse" && e.button !== 0) || !kanSikte()) return;
      peker = { id: e.pointerId };
      R.lyd.lasOpp();
      try {
        ramme.setPointerCapture(e.pointerId);
      } catch (x) {
        /* ignore */
      }
      sikt(e);
      if (e.cancelable) e.preventDefault();
    };
    const flytt = (e) => {
      if (peker && e.pointerId === peker.id) {
        sikt(e);
        if (e.cancelable) e.preventDefault();
      } else if (!peker && e.pointerType === "mouse" && !anim && kanSikte()) sikt(e);
    };
    const opp = (e) => {
      if (!peker || e.pointerId !== peker.id) return;
      peker = null;
      const v = vinkelFra(e);
      if (v == null || !kanSikte()) {
        sikter = false;
        if (tegner) tegner.vekk();
        return;
      }
      R.S.spill.vinkel = v;
      skyt(R.S);
    };
    const avbryt = (e) => {
      if (!peker || e.pointerId !== peker.id) return;
      peker = null;
      sikter = false;
      if (tegner) tegner.vekk();
    };
    const ut = (e) => {
      if (e.pointerType === "mouse" && !peker && !taster.venstre && !taster.hoyre) {
        sikter = false;
        if (tegner) tegner.vekk();
      }
    };
    const ingen = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    ramme.addEventListener("pointerdown", ned);
    ramme.addEventListener("pointermove", flytt);
    ramme.addEventListener("pointerup", opp);
    ramme.addEventListener("pointercancel", avbryt);
    ramme.addEventListener("pointerleave", ut);
    ramme.addEventListener("touchmove", ingen, { passive: false });
    ramme.addEventListener("contextmenu", ingen);
    R.vedForlat(() => {
      ramme.removeEventListener("pointerdown", ned);
      ramme.removeEventListener("pointermove", flytt);
      ramme.removeEventListener("pointerup", opp);
      ramme.removeEventListener("pointercancel", avbryt);
      ramme.removeEventListener("pointerleave", ut);
      ramme.removeEventListener("touchmove", ingen, { passive: false });
      ramme.removeEventListener("contextmenu", ingen);
    });
  }

  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    const sp = S.spill;
    const m = e.target;
    // The letter keys and Space/Enter work with nothing focused or from the board, so they never
    // get in the way of a button. The arrow keys always work.
    const fritt = m === document.body || m === document.documentElement || !!(m && m.closest && m.closest(".bo-ramme"));
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "Escape" || (k === "p" && fritt)) {
      e.preventDefault();
      return pause(S, !pauset);
    }
    if (pauset || sp.ferdig) return;
    taster.fin = e.shiftKey;
    if (k === "ArrowLeft" || (k === "a" && fritt)) {
      e.preventDefault();
      if (!taster.venstre) {
        sp.vinkel = Boble.klampVinkel(sp.vinkel - 0.02);
        taster.venstre = true;
        sikter = true;
        if (tegner) tegner.vekk();
      }
    } else if (k === "ArrowRight" || (k === "d" && fritt)) {
      e.preventDefault();
      if (!taster.hoyre) {
        sp.vinkel = Boble.klampVinkel(sp.vinkel + 0.02);
        taster.hoyre = true;
        sikter = true;
        if (tegner) tegner.vekk();
      }
    } else if (k === "ArrowUp" || ((k === " " || k === "Enter" || k === "w") && fritt)) {
      e.preventDefault();
      if (!e.repeat) skyt(S);
    } else if (k === "ArrowDown" || (k === "x" && fritt)) {
      e.preventDefault();
      if (!e.repeat) bytt(S);
    }
  });
  document.addEventListener("keyup", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const for1 = taster.venstre || taster.hoyre;
    if (k === "ArrowLeft" || k === "a") taster.venstre = false;
    if (k === "ArrowRight" || k === "d") taster.hoyre = false;
    taster.fin = e.shiftKey;
    const S = R.S;
    if (for1 && !taster.venstre && !taster.hoyre && S && S.spill && S.skjerm === "spill") {
      R.lagre();
      const grader = Math.round((Math.abs(S.spill.vinkel) * 180) / Math.PI);
      R.si(grader === 0 ? R.t("Sikter rett opp.") : S.spill.vinkel < 0 ? R.t("Sikter {n} grad mot venstre.|Sikter {n} grader mot venstre.", { n: grader }) : R.t("Sikter {n} grad mot høyre.|Sikter {n} grader mot høyre.", { n: grader }));
    }
  });

  // Hidden tab, locked phone or another app: pause at once.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "spill") pause(S, true);
  });
  window.addEventListener("blur", () => {
    taster.venstre = taster.hoyre = false;
    const S = R.S;
    if (S && S.skjerm === "spill" && !las) pause(S, true);
  });
  window.addEventListener("resize", () => {
    if (tegner) tegner.tilpass();
  });

  const fastSide = (pa) => document.documentElement.classList.toggle("bo-fast", !!pa);

  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>';

  const stjerneHtml = (n) => `<p class="bo-stjerner" role="img" aria-label="${esc(R.t("{n} av 3 stjerner", { n }))}">${[0, 1, 2].map((i) => `<i class="${i < n ? "pa" : ""}" aria-hidden="true">${STJERNE}</i>`).join("")}</p>`;

  // ---------- Start ----------

  function gyldigSpill(sp) {
    if (!sp || typeof sp !== "object") return false;
    if (sp.modus !== "brett" && sp.modus !== "uendelig") return false;
    if (sp.modus === "brett" && !(Number.isInteger(sp.niva) && sp.niva >= 1 && sp.niva <= 9999)) return false;
    if (!Boble.gyldigBrett(sp.brett)) return false;
    if (!SORT[sp.kule] || !SORT[sp.neste]) return false;
    for (const k of ["poeng", "bom", "skudd", "sprukket", "falt", "besteFall", "startRekord"]) sp[k] = Math.max(0, Math.floor(Number(sp[k]) || 0));
    sp.fro = Number(sp.fro) >>> 0;
    sp.vinkel = Boble.klampVinkel(sp.vinkel);
    if (sp.slutt !== "vunnet" && sp.slutt !== "tapt") sp.slutt = null;
    sp.ferdig = !!sp.ferdig && !!sp.slutt;
    return true;
  }

  R.start({
    id: "bobla",
    versjon: 1,
    pagar: (S) => iGang(S.spill) && S.spill.skudd > 0,

    tilstand: () => ({ niva: 1, stjerner: {}, rekord: 0, sist: null, spill: null }),

    lastet(S) {
      S.niva = Math.min(9999, Math.max(1, Math.floor(Number(S.niva) || 1)));
      S.rekord = Math.max(0, Math.floor(Number(S.rekord) || 0));
      const st = {};
      if (S.stjerner && typeof S.stjerner === "object") for (const k of Object.keys(S.stjerner)) if (/^\d{1,4}$/.test(k) && [1, 2, 3].includes(S.stjerner[k])) st[k] = S.stjerner[k];
      S.stjerner = st;
      if (!S.sist || typeof S.sist !== "object" || (S.sist.modus !== "brett" && S.sist.modus !== "uendelig")) S.sist = null;
      else {
        S.sist.niva = Math.max(1, Math.floor(Number(S.sist.niva) || 1));
        S.sist.stjerner = Math.min(3, Math.max(0, Math.floor(Number(S.sist.stjerner) || 0)));
        S.sist.poeng = Math.max(0, Math.floor(Number(S.sist.poeng) || 0));
      }
      if (S.spill && !gyldigSpill(S.spill)) S.spill = null;
      // A run that ended during the last pop goes to its result.
      if (S.spill && S.spill.slutt && !S.spill.ferdig) ferdigstill(S);
      const sp = S.spill;
      if (S.skjerm === "slutt" && (!sp || !sp.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!sp || sp.ferdig)) S.skjerm = sp ? "slutt" : "hjem";
      anim = null;
      las = false;
      pauset = false;
    },

    regler: {
      intro: R.t("Skyt bobler opp på brettet. Henger tre eller flere like sammen, spretter de – og alt som hang fast under dem, faller ned."),
      steg: [
        [R.t("Sikt"), R.t("Dra fingeren over brettet. Den prikkete linja viser hvor boblen havner. Slipp for å skyte – boblen spretter i veggene.")],
        [R.t("Tre like spretter"), R.t("Lag en gruppe på tre eller flere med samme farge og form. Bobler som ikke lenger henger i taket, faller ned og gir dobbelt poeng.")],
        [R.t("Pass på streken"), R.t("Prikkene nederst viser hvor mange bom du har igjen før taket senkes eller en ny rad kommer. Når boblene når streken, er runden over – da prøver du bare igjen.")],
      ],
      tips: [
        R.t("Trykk på den lille boblen ved siden av for å bytte til den neste."),
        R.t("Bruk veggene: Et skudd i veggen kommer seg ofte bak de andre boblene."),
        R.t("Skyt bort boblene som holder en stor klase oppe, så faller hele klasen."),
        R.t("Hver boble har sin egen form, så du trenger ikke skille fargene."),
        R.t("Ombestemt deg? Dra fingeren ned under utskyteren før du slipper, så blir det ikke noe skudd."),
        R.t("Med tastatur: Piltastene sikter (hold Shift for å sikte fint), mellomrom eller Enter skyter, X bytter boble og P gir pause."),
        R.t("Ingen liv og ingenting å kjøpe: Du kan prøve et brett så mange ganger du vil."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = iGang(sp) && sp.skudd > 0;
          const regler = R.ui.lenke(R.t("Slik spiller du"), "regler");
          const brettene = S.niva > 1 ? R.ui.lenke(R.t("Alle brett"), "brettene") : "";
          let knapper;
          if (aktiv) {
            knapper =
              R.ui.knapp(R.t("Fortsett · {hva}", { hva: `${modusTekst(sp)}, ${R.flertall(sp.poeng, "poeng", "poeng")}` }), "fortsett") +
              R.ui.knapp2(sp.modus === "brett" ? R.t("Uendelig") : R.t("Brett {n}", { n: S.niva }), sp.modus === "brett" ? "uendelig" : "brett") +
              R.ui.lenkerad(brettene, regler);
          } else {
            knapper =
              R.ui.knapp("", "brett", { variant: "stor", tekstHtml: `<span class="bo-knapp"><b>${esc(R.t("Brett {n}", { n: S.niva }))}</b><small>${esc(S.niva > 1 ? R.t("Neste brett") : R.t("Start her"))}</small></span>` }) +
              R.ui.knapp2(R.t("Uendelig"), "uendelig") +
              R.ui.lenkerad(brettene, regler);
          }
          const s = S.sist;
          const sist = s
            ? s.modus === "brett"
              ? s.vunnet
                ? R.t("Sist: brett {n} klart {stjerner}", { n: s.niva, stjerner: STJERNE.repeat(s.stjerner) })
                : R.t("Sist: brett {n} – nesten!", { n: s.niva })
              : R.t("Sist: {poeng} i uendelig", { poeng: R.flertall(s.poeng, "poeng", "poeng") })
            : "";
          // The record line only when it says something the «Sist» line does not.
          const rekord = S.rekord && !(s && s.modus === "uendelig" && s.poeng === S.rekord) ? R.t("Rekord i uendelig: {poeng}", { poeng: R.flertall(S.rekord, "poeng", "poeng") }) : "";
          const linjer = [sist, rekord].filter(Boolean);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Sikt, skyt og la dem sprette."))}<br><em>${esc(R.t("Tre like – og alt under faller!"))}</em>`,
            knapperHtml: knapper + (linjer.length ? `<div class="bo-sistlinje">${linjer.map((l) => `<p>${esc(l)}</p>`).join("")}</div>` : ""),
            merker: [
              ["∞", R.t("brett")],
              ["6", R.t("former")],
              ["0", R.t("reklame")],
            ],
          });
        },
      },

      brettene: {
        tittel: R.t("Alle brett"),
        tilbake: "hjem",
        vis(S) {
          const fliser = [];
          for (let n = 1; n <= S.niva; n++) {
            const st = S.stjerner[n] || 0;
            const etikett = st ? R.t("Brett {n}, {stjerner} av 3 stjerner", { n, stjerner: st }) : R.t("Brett {n}, ikke klart ennå", { n });
            fliser.push(`<button class="bo-brettflis${st ? "" : " ny"}" data-h="velg-brett" data-v="${n}" aria-label="${esc(etikett)}"><b>${n}</b><span aria-hidden="true">${st ? STJERNE.repeat(st) + "☆".repeat(3 - st) : "☆☆☆"}</span></button>`); // sprak-ok
          }
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Alle brett"))}</h1>
            <p class="ingress">${esc(R.t("Spill et brett på nytt og jakt på tre stjerner."))}</p>
            <div class="bo-brettgrid">${fliser.join("")}</div>`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? modusTekst(S.spill) : R.t("Bobla")),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = S.spill;
          const brett = sp.modus === "brett";
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Bobla, {hva}", { hva: modusTekst(sp) }))}</h1>
            <div class="bo-spill">
              <div class="bo-hud">
                <span class="bo-stat bo-poengboks"><small>${esc(R.t("Poeng"))}</small><b id="bo-poeng">${R.tall(sp.poeng)}</b></span>
                ${
                  brett
                    ? `<span class="bo-stat"><small>${esc(R.t("Brett"))}</small><b>${sp.niva}</b></span>`
                    : `<span class="bo-stat"><small>${esc(R.t("Rekord"))}</small><b id="bo-beste">${R.tall(Math.max(S.rekord || 0, sp.poeng))}</b></span>`
                }
                <button class="bo-pause${pauset ? " pauset" : ""}" data-h="pause" aria-label="${esc(pauset ? R.t("Fortsett") : R.t("Pause"))}">${PAUSE}</button>
              </div>
              <div class="bo-flate">
                <div class="bo-ramme" tabindex="0" role="group" aria-label="${esc(R.t("Brettet. Sikt med piltastene, skyt med mellomrom eller Enter, bytt boble med X."))}" aria-describedby="bo-tekst">
                  <canvas class="bo-lerret" aria-hidden="true"></canvas>
                  <button class="bo-bytt" data-h="bytt" data-stille aria-label="${esc(R.t("Bytt boble. Nå: {kule}. Neste: {neste}.", { kule: SORT[sp.kule].navn, neste: SORT[sp.neste].navn }))}"></button>
                  <div class="bo-status" hidden></div>
                </div>
              </div>
              <p class="vh" id="bo-tekst">${esc(brettTekst(sp))}</p>
              <p class="bo-tips" aria-hidden="true"><span class="bo-finger">${esc(R.t("Dra for å sikte – slipp for å skyte"))}</span><span class="bo-tast">${esc(R.t("Piltaster sikter · mellomrom skyter · X bytter"))}</span></p>
            </div>`;
        },
        etter(S, rot) {
          if (tegner) tegner.stopp();
          tegner = new Tegner(rot);
          bindSpill(S, rot);
          visStatus();
          R.vedForlat(() => {
            if (tegner) tegner.stopp();
            tegner = null;
          });
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || sp.ferdig) return R.gaTil(sp ? "slutt" : "hjem");
          anim = null;
          las = false;
          sikter = false;
          fastSide(true);
          if (tegner) tegner.tilpass();
          R.holdVaken();
        },
        ut() {
          anim = null;
          sikter = false;
          pauset = false;
          taster.venstre = taster.hoyre = false;
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.spill ? modusTekst(S.spill) : R.t("Bobla")),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { poeng: sp.poeng };
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const tall = (verdi, tekst, ny) => `<div class="bo-tall${ny ? " ny" : ""}"><b>${verdi}</b><span>${esc(tekst)}</span>${ny ? `<i class="bo-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>`;
          if (sp.modus === "brett") {
            const vunnet = sp.slutt === "vunnet";
            const tekst = vunnet ? (r.stjerner === 3 ? R.t("Tre stjerner – helt rått!") : R.t("Godt jobba! Spill igjen for flere stjerner.")) : R.t("Boblene nådde streken. Prøv igjen – du har så mange forsøk du vil.");
            return `
              ${R.ui.banner({ etikett: R.t("Brett {n}", { n: sp.niva }), tittel: vunnet ? R.t("Brettet er klart!") : R.t("Nesten!"), tekst, klasse: "aksent", stemning: vunnet ? "jubel" : "" })}
              ${vunnet ? stjerneHtml(r.stjerner || 1) : ""}
              <div class="bo-resultat">
                ${tall(R.tall(sp.poeng), R.t("poeng|poeng", { n: sp.poeng }))}
                ${tall(R.tall(sp.skudd), R.t("skudd|skudd", { n: sp.skudd }))}
                ${tall(R.tall(sp.falt), R.t("falt ned|falt ned", { n: sp.falt }))}
              </div>
              ${R.ui.flereSpill({ antall: 1 })}
              ${R.ui.dokk(
                vunnet ? R.ui.knapp(R.t("Brett {n}", { n: sp.niva + 1 }), "neste") : R.ui.knapp(R.t("Prøv igjen"), "igjen"),
                R.ui.lenkerad(vunnet ? R.ui.lenke(R.t("Spill igjen"), "igjen") : "", vunnet ? R.ui.lenke(R.t("Del"), "del") : "", R.ui.lenke(R.t("Til Bobla"), "tilbake"), alle),
              )}`;
          }
          const tittel = r.nyRekord ? R.t("Ny rekord!") : sp.poeng >= 1000 ? R.t("Godt jobba!") : R.t("Godt forsøk!");
          const linje = r.nyRekord ? R.t("Forrige rekord: {poeng}.", { poeng: R.flertall(r.gml, "poeng", "poeng") }) : r.forste ? R.t("Første runde – nå har du en rekord å slå!") : R.t("Rekorden din: {poeng}.", { poeng: R.flertall(S.rekord, "poeng", "poeng") });
          return `
            ${R.ui.banner({ etikett: R.t("Uendelig"), tittel, tekst: linje, klasse: "aksent", stemning: r.nyRekord || sp.poeng >= 1000 ? "jubel" : "" })}
            <div class="bo-resultat">
              ${tall(R.tall(sp.poeng), R.t("poeng|poeng", { n: sp.poeng }), r.nyRekord)}
              ${tall(R.tall(sp.sprukket), R.t("sprakk|sprakk", { n: sp.sprukket }))}
              ${tall(R.tall(sp.falt), R.t("falt ned|falt ned", { n: sp.falt }))}
            </div>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Del"), "del"), R.ui.lenke(R.t("Til Bobla"), "tilbake"), alle))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if ((sp.modus === "brett" && sp.slutt === "vunnet") || r.nyRekord || (r.forste && sp.poeng >= 1000)) {
            R.lyd.fanfare();
            if (sp.modus !== "brett" || r.stjerner >= 2) R.konfetti();
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async brett(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.spill) && S.spill.skudd > 0)) || !fortsatt()) return;
        nyttSpill(S, "brett", S.niva);
        R.gaTil("spill");
      },
      async uendelig(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.spill) && S.spill.skudd > 0)) || !fortsatt()) return;
        nyttSpill(S, "uendelig");
        R.gaTil("spill");
      },
      brettene: () => R.gaTil("brettene"),
      async "velg-brett"(el, e, S) {
        const n = Math.floor(Number(el.dataset.v));
        if (!(n >= 1 && n <= S.niva)) return;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.spill) && S.spill.skudd > 0)) || !fortsatt()) return;
        nyttSpill(S, "brett", n);
        R.gaTil("spill");
      },
      fortsett: (el, e, S) => R.gaTil(iGang(S.spill) ? "spill" : "hjem"),
      neste(el, e, S) {
        const n = S.spill && S.spill.modus === "brett" ? S.spill.niva + 1 : S.niva;
        nyttSpill(S, "brett", Math.min(n, S.niva));
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        const sp = S.spill;
        if (sp && sp.modus === "brett") nyttSpill(S, "brett", sp.niva);
        else nyttSpill(S, "uendelig");
        R.gaTil("spill");
      },
      regler(el, e, S) {
        if (S.skjerm === "spill") pause(S, true);
        R.visRegler();
      },
      pause: (el, e, S) => pause(S, !pauset),
      "fortsett-spill"(el, e, S) {
        pause(S, false);
        const r = R.$(".bo-ramme");
        if (r) r.focus({ preventScroll: true });
      },
      bytt: (el, e, S) => bytt(S),
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const r = sp.resultat || {};
        const poeng = R.flertall(sp.poeng, "poeng", "poeng");
        if (sp.modus === "brett") {
          const st = STJERNE.repeat(r.stjerner || 0);
          const tekst = `🫧 ${R.t("Bobla")} · ${R.t("Brett {n}", { n: sp.niva })} ${st} · ${poeng}. ${R.t("Klarer du tre stjerner?")}`;
          R.del(R.t("Bobla"), tekst, ADRESSE, { kort: { tittel: R.t("Brett {n}", { n: sp.niva }), linjer: [st, poeng, R.flertall(sp.skudd, "skudd", "skudd")] } });
        } else {
          const tekst = `🫧 ${R.t("Bobla")} · ${R.t("Uendelig")} · ${poeng}. ${R.t("Klarer du flere?")}`;
          R.del(R.t("Bobla"), tekst, ADRESSE, { kort: { tittel: R.t("Uendelig"), linjer: [R.tall(sp.poeng), poeng, R.t("{n} sprakk", { n: R.tall(sp.sprukket) })] } });
        }
      },
    }),
  });
})();
