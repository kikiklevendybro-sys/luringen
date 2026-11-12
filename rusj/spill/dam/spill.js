/* Dam — Nordic draughts on an 8 × 8 board, on one phone: two players, or against the phone at four
   levels. The rules (mandatory capture, multi-jumps, flying kings, promotion, draws) and the engine
   (alpha-beta, searched in small slices so the page never freezes) are pure functions at the top of
   this file. test/dam.test.mjs loads the file without the kit and checks them. */
(function () {
  "use strict";

  // ---------- The rules ----------
  // The board: square s = row * 8 + column, a1 = 0 (white's left corner), h8 = 63. Only the dark
  // squares are used (a1 is dark). A piece: 1 white man, 2 white king, -1 black man, -2 black king.
  // White starts on rows 1–3 and moves up; black starts on rows 6–8 and moves down.
  // The rules, exactly as the rules sheet states them:
  //  - Men move one square diagonally forward and capture forwards and backwards.
  //  - Capturing is mandatory, but you choose which capture. A capture must be completed: as long
  //    as the piece can capture again, it goes on (multi-jump).
  //  - A piece can be jumped only once; captured pieces leave the board when the whole capture is
  //    done (until then they block the way).
  //  - A man that ends its move on the far row becomes a king («dame»). A man that only passes the
  //    far row in the middle of a capture goes on as a man.
  //  - Kings move any distance diagonally and capture from a distance: over one piece with empty
  //    squares between, landing on any empty square beyond it.
  //  - You lose when you cannot move (no pieces, or all blocked).
  //  - Draw: the same position (same side to move) for the third time, or 40 moves in a row
  //    (20 each) without a capture and without a man moving.

  const Dam = (() => {
    const HVIT = 0, SVART = 1;
    const STILLE_GRENSE = 40;
    const navn = (s) => "abcdefgh"[s & 7] + ((s >> 3) + 1);
    const rute = (t) => {
      const c = String(t).charCodeAt(0) - 97, r = String(t).charCodeAt(1) - 49;
      return c >= 0 && c < 8 && r >= 0 && r < 8 && String(t).length === 2 ? r * 8 + c : -1;
    };
    const mork = (s) => (((s >> 3) + (s & 7)) & 1) === 0;
    const eier = (p) => (p > 0 ? HVIT : SVART);

    // Rays: STRALE[s * 4 + d] = the squares from s in direction d (not s itself).
    // d 0 and 1 go up the board (white's forward), 2 and 3 down (black's forward).
    const RETNING = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const STRALE = [];
    for (let s = 0; s < 64; s++)
      for (const [dr, dc] of RETNING) {
        const ray = [];
        for (let r = (s >> 3) + dr, c = (s & 7) + dc; r >= 0 && r < 8 && c >= 0 && c < 8; r += dr, c += dc) ray.push(r * 8 + c);
        STRALE.push(ray);
      }
    const FRAM = [[0, 1], [2, 3]];
    const sisteRad = (side) => (side === HVIT ? 7 : 0);

    // Zobrist keys (two 32-bit halves) from a fixed seed.
    let fro = 0x6a09e667;
    const tall32 = () => {
      fro ^= fro << 13;
      fro ^= fro >>> 17;
      fro ^= fro << 5;
      return fro | 0;
    };
    const Z1 = new Int32Array(4 * 64), Z2 = new Int32Array(4 * 64);
    for (let i = 0; i < 256; i++) {
      Z1[i] = tall32();
      Z2[i] = tall32();
    }
    const ZS1 = tall32(), ZS2 = tall32();
    const zi = (p, s) => (p === 1 ? 0 : p === 2 ? 1 : p === -1 ? 2 : 3) * 64 + s;

    function hash(pos) {
      let h1 = 0, h2 = 0;
      for (let s = 0; s < 64; s++)
        if (pos.b[s]) {
          h1 ^= Z1[zi(pos.b[s], s)];
          h2 ^= Z2[zi(pos.b[s], s)];
        }
      if (pos.side) {
        h1 ^= ZS1;
        h2 ^= ZS2;
      }
      pos.h1 = h1;
      pos.h2 = h2;
    }

    // A position as text: the 64 squares from a8 to h1 row by row ('.' empty, w/W white man/king,
    // b/B black man/king), then a space and the side to move (w/b), optionally the quiet-move count.
    const START = ".b.b.b.b/b.b.b.b./.b.b.b.b/......../......../w.w.w.w./.w.w.w.w/w.w.w.w. w 0";
    function lesStilling(tekst) {
      const [brett, side, stille] = String(tekst).trim().split(/\s+/);
      const rader = (brett || "").split("/");
      if (rader.length !== 8) return null;
      const pos = { b: new Int8Array(64), side: side === "b" ? SVART : HVIT, stille: Number(stille) || 0, h1: 0, h2: 0 };
      for (let r = 0; r < 8; r++) {
        if (rader[r].length !== 8) return null;
        for (let c = 0; c < 8; c++) {
          const t = rader[r][c];
          const p = { ".": 0, w: 1, W: 2, b: -1, B: -2 }[t];
          if (p === undefined) return null;
          const s = (7 - r) * 8 + c;
          if (p && !mork(s)) return null;
          pos.b[s] = p;
        }
      }
      hash(pos);
      return pos;
    }
    function skrivStilling(pos) {
      const rader = [];
      for (let r = 7; r >= 0; r--) {
        let t = "";
        for (let c = 0; c < 8; c++) t += { 0: ".", 1: "w", 2: "W", "-1": "b", "-2": "B" }[pos.b[r * 8 + c]];
        rader.push(t);
      }
      return `${rader.join("/")} ${pos.side ? "b" : "w"} ${pos.stille}`;
    }
    const kopi = (pos) => ({ b: Int8Array.from(pos.b), side: pos.side, stille: pos.stille, h1: pos.h1, h2: pos.h2 });

    // ----- Moves. A move: { fra, sti: [landing squares], slag: [captured squares], p, blir } -----

    function slagSok(b, fra, p, side, start, sti, slag, ut) {
      let videre = false;
      const dame = p === 2 || p === -2;
      for (let d = 0; d < 4; d++) {
        const ray = STRALE[fra * 4 + d];
        if (!dame) {
          if (ray.length < 2) continue;
          const n = ray[0], l = ray[1];
          const q = b[n];
          if (q && eier(q) !== side && b[l] === 0 && !slag.includes(n)) {
            videre = true;
            sti.push(l);
            slag.push(n);
            slagSok(b, l, p, side, start, sti, slag, ut);
            sti.pop();
            slag.pop();
          }
          continue;
        }
        let i = 0;
        while (i < ray.length && b[ray[i]] === 0) i++;
        if (i >= ray.length - 1) continue;
        const n = ray[i];
        if (eier(b[n]) === side || slag.includes(n)) continue;
        for (let j = i + 1; j < ray.length && b[ray[j]] === 0; j++) {
          videre = true;
          sti.push(ray[j]);
          slag.push(n);
          slagSok(b, ray[j], p, side, start, sti, slag, ut);
          sti.pop();
          slag.pop();
        }
      }
      if (!videre && slag.length) {
        const til = sti[sti.length - 1];
        ut.push({ fra: start, sti: sti.slice(), slag: slag.slice(), p, blir: !dame && til >> 3 === sisteRad(side) });
      }
    }

    // All legal moves for the side to move: only captures if there is one.
    function trekkListe(pos) {
      const b = pos.b, side = pos.side;
      const ut = [];
      for (let s = 0; s < 64; s++) {
        const p = b[s];
        if (!p || eier(p) !== side) continue;
        b[s] = 0; // the moving piece has left its square (a king may pass over or land on it)
        slagSok(b, s, p, side, s, [], [], ut);
        b[s] = p;
      }
      if (ut.length) return ut;
      for (let s = 0; s < 64; s++) {
        const p = b[s];
        if (!p || eier(p) !== side) continue;
        if (p === 1 || p === -1) {
          for (const d of FRAM[side]) {
            const ray = STRALE[s * 4 + d];
            if (ray.length && b[ray[0]] === 0) ut.push({ fra: s, sti: [ray[0]], slag: [], p, blir: ray[0] >> 3 === sisteRad(side) });
          }
        } else {
          for (let d = 0; d < 4; d++) {
            const ray = STRALE[s * 4 + d];
            for (let j = 0; j < ray.length && b[ray[j]] === 0; j++) ut.push({ fra: s, sti: [ray[j]], slag: [], p, blir: false });
          }
        }
      }
      return ut;
    }

    // Does the side to move have a capture? (cheaper than the full list)
    function harSlag(pos) {
      const ms = [];
      const b = pos.b;
      for (let s = 0; s < 64 && !ms.length; s++) {
        const p = b[s];
        if (!p || eier(p) !== pos.side) continue;
        b[s] = 0;
        slagSok(b, s, p, pos.side, s, [], [], ms);
        b[s] = p;
      }
      return ms.length > 0;
    }

    const tilRute = (m) => m.sti[m.sti.length - 1];

    // Make a move; returns what is needed to take it back.
    function gjor(pos, m) {
      const b = pos.b;
      const til = tilRute(m);
      const fangne = m.slag.map((s) => b[s]);
      const ny = m.blir ? m.p * 2 : m.p;
      let h1 = pos.h1 ^ Z1[zi(m.p, m.fra)] ^ Z1[zi(ny, til)] ^ ZS1;
      let h2 = pos.h2 ^ Z2[zi(m.p, m.fra)] ^ Z2[zi(ny, til)] ^ ZS2;
      b[m.fra] = 0;
      for (let i = 0; i < m.slag.length; i++) {
        const s = m.slag[i];
        h1 ^= Z1[zi(fangne[i], s)];
        h2 ^= Z2[zi(fangne[i], s)];
        b[s] = 0;
      }
      b[til] = ny;
      const u = { fangne, stille: pos.stille, h1: pos.h1, h2: pos.h2 };
      pos.stille = m.slag.length || m.p === 1 || m.p === -1 ? 0 : pos.stille + 1;
      pos.side ^= 1;
      pos.h1 = h1;
      pos.h2 = h2;
      return u;
    }
    function angre(pos, m, u) {
      const b = pos.b;
      b[tilRute(m)] = 0;
      for (let i = 0; i < m.slag.length; i++) b[m.slag[i]] = u.fangne[i];
      b[m.fra] = m.p;
      pos.side ^= 1;
      pos.stille = u.stille;
      pos.h1 = u.h1;
      pos.h2 = u.h2;
    }

    // Notation: c3-d4 for a move, c3xe5xc7 for a capture (every landing square).
    const notasjon = (m) => navn(m.fra) + (m.slag.length ? "x" : "-") + m.sti.map(navn).join("x");

    // ----- A game: the position plus its history -----
    function nyttParti(startTekst) {
      const pos = lesStilling(startTekst || START);
      if (!pos) return null;
      const p = { start: startTekst || START, startSide: pos.side, pos, trekk: [], tekst: [], hist: [], nokler: [pos.h1 + ":" + pos.h2], lovlige: [] };
      p.lovlige = trekkListe(pos);
      return p;
    }
    function spill(p, m) {
      const side = p.pos.side;
      const u = gjor(p.pos, m);
      p.trekk.push(m);
      p.tekst.push(notasjon(m));
      p.hist.push({ u, side });
      p.nokler.push(p.pos.h1 + ":" + p.pos.h2);
      p.lovlige = trekkListe(p.pos);
    }
    function tilbake(p) {
      const m = p.trekk.pop();
      if (!m) return null;
      const h = p.hist.pop();
      p.tekst.pop();
      p.nokler.pop();
      angre(p.pos, m, h.u);
      p.lovlige = trekkListe(p.pos);
      return m;
    }
    const finn = (p, tekst) => p.lovlige.find((m) => notasjon(m) === tekst) || null;
    function lastParti(startTekst, liste) {
      const p = nyttParti(startTekst);
      if (!p || !Array.isArray(liste)) return null;
      for (const t of liste) {
        if (status(p).slutt) return null;
        const m = finn(p, t);
        if (!m) return null;
        spill(p, m);
      }
      return p;
    }
    function antallBrikker(pos) {
      const n = [0, 0];
      for (let s = 0; s < 64; s++) if (pos.b[s]) n[eier(pos.b[s])]++;
      return n;
    }
    // { slutt, vinner (colour | null), grunn: "tom" | "fast" | "gjentakelse" | "stille" }
    function status(p) {
      const pos = p.pos;
      if (!p.lovlige.length) return { slutt: true, vinner: pos.side ^ 1, grunn: antallBrikker(pos)[pos.side] ? "fast" : "tom" };
      const n = p.nokler[p.nokler.length - 1];
      let like = 0;
      for (const k of p.nokler) if (k === n) like++;
      if (like >= 3) return { slutt: true, vinner: null, grunn: "gjentakelse" };
      if (pos.stille >= STILLE_GRENSE) return { slutt: true, vinner: null, grunn: "stille" };
      return { slutt: false, vinner: null, grunn: "" };
    }

    return { HVIT, SVART, START, STILLE_GRENSE, STRALE, navn, rute, mork, eier, lesStilling, skrivStilling, kopi, trekkListe, harSlag, gjor, angre, tilRute, notasjon, nyttParti, spill, tilbake, finn, lastParti, status, antallBrikker };
  })();

  // ---------- The engine ----------
  // Negamax alpha-beta with iterative deepening, a transposition table, killer/history move
  // ordering and a capture extension (a position with a capture pending is never evaluated: the
  // captures are searched first). The search is a generator that yields every few hundred nodes;
  // Motor.tenk() runs it in slices of a few milliseconds, so the page stays responsive.

  const Motor = (() => {
    const { trekkListe, gjor, angre, tilRute, HVIT } = Dam;
    const MANN = 100, DAME = 330;
    const VINN = 30000, UENDELIG = 32000, MAKS_PLY = 80;
    // Men: a bonus for each row forward, more in the middle of the board, and for the guards on
    // the own back row (they stop the other side's men from becoming kings).
    const FRAMOVER = [0, 3, 6, 10, 15, 22, 30, 0];
    const MANN_HVIT = new Int16Array(64), MANN_SVART = new Int16Array(64), DAME_POS = new Int16Array(64);
    for (let s = 0; s < 64; s++) {
      const r = s >> 3, c = s & 7;
      const midt = c >= 2 && c <= 5 ? 4 : c === 0 || c === 7 ? -3 : 0;
      MANN_HVIT[s] = FRAMOVER[r] + (r >= 2 && r <= 5 ? midt : 0) + (r === 0 && (c === 2 || c === 6) ? 8 : 0);
      const rs = 7 - r;
      MANN_SVART[s] = FRAMOVER[rs] + (rs >= 2 && rs <= 5 ? midt : 0) + (rs === 0 && (c === 1 || c === 5) ? 8 : 0);
      // Kings: the long diagonal a1–h8 and the double diagonals are strong; the edges weak.
      DAME_POS[s] = (r === c ? 14 : 0) + (Math.abs(r - c) === 1 || r + c === 6 || r + c === 8 ? 5 : 0) - (r === 0 || r === 7 || c === 0 || c === 7 ? 4 : 0);
    }

    // From the side to move.
    function evaluer(pos) {
      const b = pos.b;
      let s = 0, mat = 0, antall = 0, damer = [0, 0];
      for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p) continue;
        antall++;
        if (p === 1) {
          s += MANN + MANN_HVIT[i];
          mat += MANN;
        } else if (p === -1) {
          s -= MANN + MANN_SVART[i];
          mat -= MANN;
        } else if (p === 2) {
          s += DAME + DAME_POS[i];
          mat += DAME;
          damer[0]++;
        } else {
          s -= DAME + DAME_POS[i];
          mat -= DAME;
          damer[1]++;
        }
      }
      // Ahead in material: trade down (fewer pieces left makes the lead count for more).
      if (mat > 0) s += ((24 - antall) * Math.min(mat, 400)) / 40;
      else if (mat < 0) s -= ((24 - antall) * Math.min(-mat, 400)) / 40;
      return pos.side === HVIT ? s : -s;
    }

    const EKSAKT = 1, NEDRE = 2, OVRE = 3;
    const TT_STR = 1 << 17;
    let tt = null;
    const lagTt = () => ({ sjekk: new Int32Array(TT_STR), verdi: new Int16Array(TT_STR), dybde: new Int8Array(TT_STR), flagg: new Int8Array(TT_STR), trekk: new Int16Array(TT_STR) });
    const nullstill = () => {
      tt = null;
    };

    function lagKontekst(valg, nokler) {
      if (!tt) tt = lagTt();
      const sti1 = [], sti2 = [];
      for (const k of nokler || []) {
        const [a, b] = k.split(":");
        sti1.push(Number(a));
        sti2.push(Number(b));
      }
      return { noder: 0, sistPause: 0, sti1, sti2, killer: new Int32Array(MAKS_PLY + 2).fill(-1), historie: new Int32Array(64 * 64), maksNoder: valg.maksNoder || 0, stopp: false };
    }

    function gjentatt(pos, ctx) {
      const s1 = ctx.sti1, s2 = ctx.sti2;
      const n = s1.length - 1;
      const grense = Math.max(0, n - pos.stille);
      for (let i = n - 4; i >= grense; i -= 2) if (s1[i] === pos.h1 && s2[i] === pos.h2) return true;
      return false;
    }

    // Move order: the table's move, then the biggest captures, promotions, killers, history.
    function ordne(ms, ttIdx, ply, ctx) {
      const poeng = new Int32Array(ms.length);
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        const nr = m.fra * 64 + tilRute(m);
        if (i === ttIdx) poeng[i] = 1 << 30;
        else if (m.slag.length) poeng[i] = (1 << 28) + m.slag.length * 1000 + (m.blir ? 500 : 0);
        else if (m.blir) poeng[i] = 1 << 27;
        else if (nr === ctx.killer[ply]) poeng[i] = 1 << 26;
        else poeng[i] = ctx.historie[nr];
      }
      const rekke = Array.from(ms.keys());
      rekke.sort((a, b) => poeng[b] - poeng[a]);
      return rekke;
    }

    function* sok(pos, dybde, alfa, beta, ply, ctx) {
      ctx.noder++;
      if (ctx.noder - ctx.sistPause >= 256) {
        ctx.sistPause = ctx.noder;
        yield;
      }
      if (ctx.stopp || (ctx.maksNoder && ctx.noder >= ctx.maksNoder)) {
        ctx.stopp = true;
        return 0;
      }
      if (ply && (gjentatt(pos, ctx) || pos.stille >= Dam.STILLE_GRENSE)) return 0;
      const ms = trekkListe(pos);
      if (!ms.length) return -VINN + ply;
      const slag = ms[0].slag.length > 0;
      if (ply >= MAKS_PLY) return evaluer(pos);
      if (dybde <= 0 && !slag) return evaluer(pos);
      // One forced move (often a capture) costs no depth.
      const ny = ms.length === 1 && ply < 40 ? dybde : dybde - 1;
      const idx = pos.h1 & (TT_STR - 1);
      let ttIdx = -1;
      if (tt.sjekk[idx] === pos.h2 && tt.trekk[idx] < ms.length) {
        ttIdx = tt.trekk[idx];
        if (ply && tt.dybde[idx] >= dybde) {
          const v = tt.verdi[idx], f = tt.flagg[idx];
          if (f === EKSAKT || (f === NEDRE && v >= beta) || (f === OVRE && v <= alfa)) return v;
        }
      }
      const alfa0 = alfa;
      let best = -UENDELIG, bestIdx = -1;
      const rekke = ordne(ms, ttIdx, ply, ctx);
      for (const i of rekke) {
        const m = ms[i];
        const u = gjor(pos, m);
        ctx.sti1.push(pos.h1);
        ctx.sti2.push(pos.h2);
        const v = -(yield* sok(pos, ny, -beta, -alfa, ply + 1, ctx));
        ctx.sti1.pop();
        ctx.sti2.pop();
        angre(pos, m, u);
        if (ctx.stopp) return 0;
        if (v > best) {
          best = v;
          bestIdx = i;
        }
        if (v > alfa) alfa = v;
        if (alfa >= beta) {
          if (!m.slag.length) {
            ctx.killer[ply] = m.fra * 64 + tilRute(m);
            ctx.historie[m.fra * 64 + tilRute(m)] += dybde * dybde;
          }
          break;
        }
      }
      if (dybde > 0 || slag) {
        tt.sjekk[idx] = pos.h2;
        tt.verdi[idx] = best;
        tt.dybde[idx] = Math.max(0, dybde);
        tt.flagg[idx] = best <= alfa0 ? OVRE : best >= beta ? NEDRE : EKSAKT;
        tt.trekk[idx] = bestIdx;
      }
      return best;
    }

    // The root: iterative deepening. With stoy (noise), every root move gets an exact score (full
    // window) plus a random number up to ±stoy, so the weaker levels make human-like mistakes.
    function* rot(pos, valg, ctx, resultat) {
      const ms = trekkListe(pos);
      resultat.trekk = ms[0] || null;
      if (ms.length <= 1) return resultat;
      const rnd = valg.tilfeldig || Math.random;
      const stoy = ms.map(() => (valg.stoy ? (rnd() * 2 - 1) * valg.stoy : 0));
      let rekke = Array.from(ms.keys());
      for (let d = 1; d <= (valg.dybde || 30); d++) {
        const poeng = [];
        let alfa = -UENDELIG, bestI = -1, bestV = -UENDELIG;
        for (const i of rekke) {
          const m = ms[i];
          const u = gjor(pos, m);
          ctx.sti1.push(pos.h1);
          ctx.sti2.push(pos.h2);
          const ny = d - 1;
          const v = valg.stoy ? -(yield* sok(pos, ny, -UENDELIG, UENDELIG, 1, ctx)) : -(yield* sok(pos, ny, -UENDELIG, -alfa, 1, ctx));
          ctx.sti1.pop();
          ctx.sti2.pop();
          angre(pos, m, u);
          if (ctx.stopp) return resultat; // keep the last complete depth
          const s = v + stoy[i];
          poeng[i] = s;
          if (s > bestV) {
            bestV = s;
            bestI = i;
          }
          if (v > alfa) alfa = v;
        }
        resultat.trekk = ms[bestI];
        resultat.verdi = bestV;
        resultat.dybde = d;
        rekke = rekke.slice().sort((a, b) => (a === bestI ? -1 : b === bestI ? 1 : (poeng[b] || 0) - (poeng[a] || 0)));
        if (Math.abs(bestV) > VINN - 500) break;
      }
      return resultat;
    }

    function kjor(gen, valg, ferdig) {
      const start = performance.now();
      const skive = valg.skive || 12;
      const grense = start + (valg.tid || 1e9);
      let stoppet = false;
      const steg = () => {
        if (stoppet) return;
        const slutt = Math.min(performance.now() + skive, grense);
        let r;
        do r = gen.next();
        while (!r.done && performance.now() < slutt);
        if (r.done || performance.now() >= grense) {
          stoppet = true;
          ferdig();
          return;
        }
        setTimeout(steg, 0);
      };
      setTimeout(steg, 0);
      return () => {
        stoppet = true;
      };
    }

    // A wild move now and then (the beginner level): any legal move.
    function vill(p, valg, resultat) {
      const rnd = valg.tilfeldig || Math.random;
      if (valg.villTrekk && p.lovlige.length > 1 && rnd() < valg.villTrekk) resultat.trekk = p.lovlige[Math.floor(rnd() * p.lovlige.length)];
    }
    // Moves of game p are given back as the same objects as in p.lovlige.
    const somLovlig = (p, m) => (m ? p.lovlige.find((x) => Dam.notasjon(x) === Dam.notasjon(m)) || null : null);

    // Think in slices; ferdig({ trekk, verdi, dybde, noder }) comes later. Returns a stop function.
    function tenk(p, valg, ferdig) {
      const pos = Dam.kopi(p.pos);
      const ctx = lagKontekst(valg, p.nokler);
      const resultat = { trekk: null, verdi: 0, dybde: 0 };
      const gen = rot(pos, valg, ctx, resultat);
      return kjor(gen, valg, () => {
        resultat.noder = ctx.noder;
        resultat.trekk = somLovlig(p, resultat.trekk);
        vill(p, valg, resultat);
        ferdig(resultat);
      });
    }
    // The same without slices (tests, self-play): to the end, to maksNoder, or to tid ms.
    function velg(p, valg) {
      const pos = Dam.kopi(p.pos);
      const ctx = lagKontekst(valg, p.nokler);
      const resultat = { trekk: null, verdi: 0, dybde: 0 };
      const gen = rot(pos, valg, ctx, resultat);
      const slutt = performance.now() + (valg.tid || 1e9);
      let r, skiver = 0;
      do {
        r = gen.next();
        skiver++;
      } while (!r.done && performance.now() < slutt);
      resultat.noder = ctx.noder;
      resultat.skiver = skiver;
      resultat.trekk = somLovlig(p, resultat.trekk);
      vill(p, valg, resultat);
      return resultat;
    }

    // The four levels (measured in self-play, see the report in test/dam.test.mjs).
    const NIVA = {
      1: { dybde: 1, stoy: 80, villTrekk: 0.35, tid: 400 },
      2: { dybde: 2, stoy: 35, villTrekk: 0.08, tid: 600 },
      3: { dybde: 4, stoy: 10, tid: 900 },
      4: { dybde: 30, stoy: 0, tid: 1500 },
    };
    function valgFor(niva, p) {
      const v = Object.assign({}, NIVA[niva] || NIVA[2]);
      if (niva === 4 && p && p.trekk.length < 4) Object.assign(v, { stoy: 6, dybde: 6 }); // a little variety in the opening
      return v;
    }

    return { evaluer, tenk, velg, kjor, nullstill, valgFor, NIVA, VINN };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules and the engine.
    window.Dam = { Dam, Motor };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { HVIT, SVART } = Dam;
  const FARGENAVN = ["hvit", "svart"];
  const NIVANAVN = { 1: "Nybegynner", 2: "Lett", 3: "Middels", 4: "Vanskelig" };
  const NIVATEKST = {
    1: "Mobilen flytter nesten på måfå. Fint for å lære reglene.",
    2: "Mobilen slår når den kan, men ser ikke langt. Fin første motstander.",
    3: "Mobilen ser noen trekk fram og straffer feil. Passe utfordring.",
    4: "Mobilen tenker dypt. Klarer du å slå den?",
  };
  const NIVAER = [1, 2, 3, 4];
  const MAL = [1, 3, 0]; // «Ett parti», «Først til 3», «Uten slutt»
  const MALNAVN = { 1: "Ett parti", 3: "Først til 3", 0: "Uten slutt" };
  const MIN_TENK = 600; // ms: the phone's move never comes faster than this
  let H;

  // S.spill: { id, modus "mobil" | "to", niva, mal, starter (player with white this round),
  //   trekk (notation list), poeng [p0, p1], uavgjort, runde, resultat { vinner (player | null),
  //   grunn } | null, ferdig (match over), registrert, snu, snudd, fra (optional start position) }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erMaskin = (sp, i) => sp.modus === "mobil" && i === 1;
  const navn = (sp, i) => (sp.modus === "mobil" ? (i === 1 ? "Mobilen" : "Du") : R.navn(i));
  const spillerFor = (sp, farge) => (farge === HVIT ? sp.starter : 1 - sp.starter);
  const fargeFor = (sp, i) => (i === sp.starter ? HVIT : SVART);

  let parti = null;
  let partiFor = "";
  const partiNokkel = (sp) => `${sp.id}:${sp.runde}:${sp.trekk.length}:${sp.trekk[sp.trekk.length - 1] || ""}`;
  function hentParti(S) {
    const sp = S.spill;
    const n = partiNokkel(sp);
    if (parti && partiFor === n) return parti;
    parti = Dam.lastParti(sp.fra || Dam.START, sp.trekk);
    partiFor = n;
    return parti;
  }
  const merkParti = (S) => (partiFor = partiNokkel(S.spill));
  const tur = (S) => spillerFor(S.spill, hentParti(S).pos.side);
  const rundeFerdig = (S) => !!S.spill.resultat;
  const kampVunnet = (sp) => !!sp.mal && Math.max(sp.poeng[0], sp.poeng[1]) >= sp.mal;

  // UI-only state (not saved)
  let valgt = null; // { fra, sti: [landing squares chosen so far] }
  let animer = null; // { trekk, fangne, fraSti } for the next draw
  let tenkStopp = null;
  let tenkerPa = "";
  let trekkId = null;
  let hint = null; // { fra, til }
  let hintStopp = null;
  let bunnVist = null;
  let snuId = null;
  let kaaringId = null;

  // The colour at the bottom: against the phone your own; two players with «snu» the side to move.
  function onsketBunn(S) {
    const sp = S.spill;
    let b = sp.modus === "mobil" ? fargeFor(sp, 0) : sp.snu ? hentParti(S).pos.side : fargeFor(sp, 0);
    if (sp.snudd) b ^= 1;
    return b;
  }

  // ---------- Sounds ----------
  const lyd = {
    flytt: () => {
      R.lyd.stoy(0, 0.04, 0.18, 1500);
      R.lyd.tone(260, 0, 0.07, "sine", 0.15, 160);
    },
    hopp: (i) => {
      R.lyd.stoy(i * 0.16, 0.08, 0.3, 1000);
      R.lyd.tone(330 + i * 70, i * 0.16, 0.1, "triangle", 0.18, 180);
    },
    dame: () => R.lyd.riktig(),
    tap: () => {
      R.lyd.tone(392, 0, 0.22, "triangle", 0.13);
      R.lyd.tone(311, 0.2, 0.42, "triangle", 0.12);
    },
  };

  // ---------- Words ----------
  const brikkeOrd = (p) => (p === 2 || p === -2 ? "dame" : "brikke");
  const brikkeNavn = (p) => `${FARGENAVN[Dam.eier(p)]} ${brikkeOrd(p)}`;
  function beskriv(m) {
    const til = Dam.navn(Dam.tilRute(m));
    let t = m.slag.length ? `${Dam.navn(m.fra)} slår ${R.flertall(m.slag.length, "brikke", "brikker")}, ${[m.fra, ...m.sti].map(Dam.navn).join(" til ")}` : `${Dam.navn(m.fra)} til ${til}`;
    if (m.blir) t += ", blir dame";
    return t;
  }

  // ---------- Playing moves ----------
  const kanFlytte = (S) => {
    const sp = S.spill;
    return !!sp && !sp.ferdig && !sp.resultat && !erMaskin(sp, tur(S));
  };

  function spillTrekk(S, m, dratt) {
    const sp = S.spill;
    const p = hentParti(S);
    const hvem = navn(sp, spillerFor(sp, p.pos.side));
    const fraSti = valgt && valgt.fra === m.fra && !dratt ? valgt.sti.length : 0;
    stoppHint();
    Dam.spill(p, m);
    sp.trekk.push(Dam.notasjon(m));
    merkParti(S);
    valgt = null;
    animer = { trekk: m, fangne: p.hist[p.hist.length - 1].u.fangne, fraSti, dratt: !!dratt };
    if (m.slag.length) m.slag.forEach((_, i) => lyd.hopp(i));
    else lyd.flytt();
    if (m.blir) setTimeout(lyd.dame, R.rolig() ? 0 : 160 * Math.max(1, m.sti.length));
    R.vibrer(m.slag.length ? [14, 30, 14] : 10);
    const st = Dam.status(p);
    let linje = `${hvem}: ${beskriv(m)}.`;
    if (st.slutt) {
      avsluttRunde(S, st);
      linje += " " + resultatLinje(S);
    } else {
      const neste = spillerFor(sp, p.pos.side);
      const ma = p.lovlige[0].slag.length ? " – og må slå" : "";
      linje += erMaskin(sp, neste) ? "" : sp.modus === "mobil" ? ` Din tur${ma}.` : ` ${navn(sp, neste)} sin tur${ma}.`;
    }
    R.si(linje);
    if (st.slutt) {
      R.vis();
      return;
    }
    const snur = sp.modus === "to" && onsketBunn(S) !== bunnVist;
    R.vis();
    if (snur) {
      clearTimeout(snuId);
      const fortsatt = R.vakt();
      const id = sp.id;
      snuId = setTimeout(() => {
        if (!fortsatt() || !R.S.spill || R.S.spill.id !== id) return;
        bunnVist = onsketBunn(R.S);
        R.lyd.snu();
        R.vis();
      }, R.rolig() ? 150 : 650 + 140 * m.sti.length);
    }
    startTenking(S);
  }

  function resultatLinje(S) {
    const sp = S.spill;
    const r = sp.resultat;
    if (!r) return "";
    if (r.vinner == null) return r.grunn === "gjentakelse" ? "Samme stilling tre ganger – remis!" : "40 trekk uten slag – remis!";
    const v = navn(sp, r.vinner);
    const grunn = r.grunn === "tom" ? "Alle brikkene er slått" : "Ingen trekk igjen";
    return sp.modus === "mobil" ? `${grunn}. ${r.vinner === 0 ? "Du vinner!" : "Mobilen vinner!"}` : `${grunn}. ${v} vinner!`;
  }

  function avsluttRunde(S, st) {
    const sp = S.spill;
    stoppTenking();
    const vinner = st.vinner == null ? null : spillerFor(sp, st.vinner);
    sp.resultat = { vinner, grunn: st.grunn };
    if (vinner == null) sp.uavgjort++;
    else sp.poeng[vinner]++;
    telRekord(S, vinner);
    if (sp.modus === "mobil" && vinner === 0) R.merke("klassiker-dam");
    const fortsatt = R.vakt();
    const runde = sp.runde;
    setTimeout(() => {
      if (!fortsatt() || !R.S.spill || R.S.spill.runde !== runde || !R.S.spill.resultat) return;
      feir(R.S);
    }, R.rolig() ? 100 : 500);
    if (kampVunnet(sp)) tilKaaringOm(S, 2600);
  }

  function feir(S) {
    const sp = S.spill;
    const v = sp.resultat.vinner;
    if (v == null) return R.lyd.pling();
    if (sp.modus === "mobil" && v === 1) return lyd.tap();
    R.lyd.fanfare();
    R.vibrer([40, 60, 120]);
    R.konfetti();
  }

  function telRekord(S, vinner) {
    const sp = S.spill;
    if (sp.modus !== "mobil") return;
    const r = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, uavgjort: 0, tap: 0 });
    if (vinner == null) r.uavgjort++;
    else if (vinner === 0) r.seier++;
    else r.tap++;
  }
  function angreRekord(S, vinner) {
    const sp = S.spill;
    const r = sp.modus === "mobil" && S.rekord[sp.niva];
    if (!r) return;
    if (vinner == null) r.uavgjort = Math.max(0, r.uavgjort - 1);
    else if (vinner === 0) r.seier = Math.max(0, r.seier - 1);
    else r.tap = Math.max(0, r.tap - 1);
  }

  function tilKaaringOm(S, ms) {
    clearTimeout(kaaringId);
    const fortsatt = R.vakt();
    const id = S.spill.id;
    kaaringId = setTimeout(() => {
      kaaringId = null;
      const sp = R.S.spill;
      if (fortsatt() && sp && sp.id === id && !sp.ferdig && kampVunnet(sp) && R.S.skjerm === "spill" && !R.arkApent()) avsluttKamp(R.S);
    }, R.rolig() ? Math.min(ms, 1500) : ms);
  }
  // The match ends: to «Kåringen» (an unfinished round doesn't count).
  function avsluttKamp(S) {
    const sp = S.spill;
    clearTimeout(kaaringId);
    stoppTenking();
    stoppHint();
    if (!sp.resultat) sp.trekk = [];
    sp.ferdig = true;
    parti = null;
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.modus === "mobil" ? sp.niva : 0, runder: sp.poeng[0] + sp.poeng[1] + sp.uavgjort, uavgjort: sp.uavgjort, mal: sp.mal || 0 });
    R.gaTil("slutt");
  }

  // ---------- The phone's turn ----------
  function startTenking(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.resultat || S.skjerm !== "spill" || !erMaskin(sp, tur(S))) return;
    const nokkel = partiNokkel(sp);
    if ((tenkStopp || trekkId) && tenkerPa === nokkel) return;
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    const start = performance.now();
    const gjelder = () => fortsatt() && R.S.spill && !R.S.spill.resultat && partiNokkel(R.S.spill) === nokkel;
    const p = hentParti(S);
    tenkStopp = Motor.tenk(p, Motor.valgFor(sp.niva, p), (svar) => {
      tenkStopp = null;
      if (!gjelder()) return;
      // The move waits a moment (never faster than MIN_TENK), and never lands behind a sheet.
      const spillNaa = () => {
        trekkId = null;
        if (!gjelder()) return;
        if (R.arkApent()) {
          trekkId = setTimeout(spillNaa, 300);
          return;
        }
        tenkerPa = "";
        const q = hentParti(R.S);
        const m = (svar.trekk && q.lovlige.find((x) => Dam.notasjon(x) === Dam.notasjon(svar.trekk))) || q.lovlige[0];
        spillTrekk(R.S, m);
      };
      trekkId = setTimeout(spillNaa, Math.max(0, MIN_TENK - (performance.now() - start)));
    });
  }
  function stoppTenking() {
    if (tenkStopp) tenkStopp();
    tenkStopp = null;
    clearTimeout(trekkId);
    trekkId = null;
    tenkerPa = "";
  }
  function stoppHint() {
    if (hintStopp) hintStopp();
    hintStopp = null;
    hint = null;
  }
  const hjelpVises = (S) => {
    const sp = S.spill;
    return sp.modus === "mobil" && sp.niva <= 2 && !sp.resultat && !sp.ferdig && !erMaskin(sp, tur(S));
  };

  // How many moves «Angre» takes back: two players one; against the phone back to before your
  // last move (its answer too). Never the phone's opening move.
  function angreAntall(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const n = p.trekk.length;
    if (!n) return 0;
    if (sp.modus !== "mobil") return 1;
    const meg = fargeFor(sp, 0);
    for (let i = n - 1; i >= 0; i--) if (p.hist[i].side === meg) return n - i;
    return 0;
  }

  // ---------- Selection: the moves that fit what has been tapped so far ----------
  function kandidater(p) {
    if (!valgt) return [];
    const k = valgt.sti.length;
    return p.lovlige.filter((m) => m.fra === valgt.fra && m.sti.length > k && valgt.sti.every((s, i) => m.sti[i] === s));
  }
  // Tap (or drop) on square s while a piece is selected. Returns true if it did something.
  function velgMal(S, s, dratt) {
    const p = hentParti(S);
    const kand = kandidater(p);
    if (!kand.length) return false;
    const k = valgt.sti.length;
    const neste = kand.filter((m) => m.sti[k] === s);
    if (neste.length) {
      if (neste.length === 1) {
        spillTrekk(S, neste[0], dratt);
        return true;
      }
      // Several ways on from here: the piece stops on s and waits for the next jump.
      valgt.sti.push(s);
      R.lyd.klikk();
      R.si(`${Dam.navn(s)}. Slå videre.`);
      R.vis();
      return true;
    }
    const slutt = kand.filter((m) => Dam.tilRute(m) === s);
    if (slutt.length === 1) {
      spillTrekk(S, slutt[0], dratt);
      return true;
    }
    if (slutt.length > 1) {
      R.toast("Flere veier dit – trykk på ruta brikka skal hoppe til først");
      return true;
    }
    if (k) {
      R.toast("Fullfør slaget – brikka må slå videre");
      R.lyd.feil();
      return true;
    }
    return false;
  }
  function trykkRute(S, s, dratt) {
    const p = hentParti(S);
    if (valgt && velgMal(S, s, dratt)) return;
    const brikke = p.pos.b[s];
    if (brikke && Dam.eier(brikke) === p.pos.side) {
      if (valgt && valgt.fra === s && !dratt) {
        valgt = null;
        R.vis();
        return;
      }
      if (!p.lovlige.some((m) => m.fra === s)) {
        R.lyd.feil();
        R.toast(p.lovlige[0] && p.lovlige[0].slag.length ? "Du må slå – bruk en av brikkene som blinker" : "Denne brikka kan ikke flytte nå");
        valgt = null;
        R.vis();
        return;
      }
      valgt = { fra: s, sti: [] };
      R.lyd.klikk();
      R.vis();
      return;
    }
    if (valgt) {
      valgt = null;
      R.vis();
    }
  }

  // ---------- Markup ----------

  const KRONE = `<svg class="dm-krone" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M7 29L4 12L13.5 19L20 8L26.5 19L36 12L33 29Z"/><rect x="7" y="30" width="26" height="4.5" rx="2"/></svg>`;
  const brikkeHtml = (p, klasse, stil) => `<span class="dm-brikke ${Dam.eier(p) ? "svart" : "hvit"}${p === 2 || p === -2 ? " dame" : ""}${klasse ? " " + klasse : ""}"${stil ? ` style="${stil}"` : ""} aria-hidden="true">${p === 2 || p === -2 ? KRONE : ""}</span>`;

  function brettHtml(S, o) {
    const sp = S.spill;
    const p = hentParti(S);
    const bunn = o.bunn;
    const interaktiv = o.interaktiv && !sp.resultat;
    const sist = p.trekk[p.trekk.length - 1];
    const sistSti = new Set(sist ? [sist.fra, ...sist.sti] : []);
    const menneske = interaktiv && kanFlytte(S);
    const tvang = new Set(menneske && p.lovlige[0] && p.lovlige[0].slag.length ? p.lovlige.map((m) => m.fra) : []);
    const kand = menneske ? kandidater(p) : [];
    const k = valgt ? valgt.sti.length : 0;
    const mal = new Map();
    for (const m of kand) if (m.sti[k] != null) mal.set(m.sti[k], m.slag.length > 0);
    // Mid-capture: the piece stands on its last landing square; what it has jumped is greyed.
    const midt = kand.length && k ? { fra: valgt.fra, her: valgt.sti[k - 1], slatt: new Set(kand[0].slag.slice(0, k)) } : null;
    const ghost = new Map();
    if (o.interaktiv && animer && animer.trekk === sist && !R.rolig()) animer.trekk.slag.forEach((s, i) => ghost.set(s, [animer.fangne[i], i]));
    let fokus = valgt ? (midt ? midt.her : valgt.fra) : sist ? Dam.tilRute(sist) : -1;
    if (fokus < 0) for (let s = 0; s < 64 && fokus < 0; s++) if (p.pos.b[s] && Dam.eier(p.pos.b[s]) === p.pos.side) fokus = s;
    const ruter = [];
    for (let rr = 7; rr >= 0; rr--)
      for (let ff = 0; ff < 8; ff++) {
        const rad = bunn === HVIT ? rr : 7 - rr;
        const kol = bunn === HVIT ? ff : 7 - ff;
        const s = rad * 8 + kol;
        const koord = (rr === 0 ? `<span class="dm-koord fil" aria-hidden="true">${"abcdefgh"[kol]}</span>` : "") + (ff === 0 ? `<span class="dm-koord rad" aria-hidden="true">${rad + 1}</span>` : "");
        if (!Dam.mork(s)) {
          ruter.push(`<span class="dm-rute lys">${koord}</span>`);
          continue;
        }
        let brikke = p.pos.b[s];
        if (midt && s === midt.fra) brikke = 0;
        if (midt && s === midt.her) brikke = p.pos.b[valgt.fra];
        const kl = ["dm-rute", "mork"];
        if (sistSti.has(s)) kl.push("sist");
        if (valgt && s === (midt ? midt.her : valgt.fra) && interaktiv) kl.push("valgt");
        if (mal.has(s)) kl.push(mal.get(s) ? "mal slag" : "mal");
        if (tvang.has(s) && !valgt) kl.push("tvang");
        if (interaktiv && hint && (hint.fra === s || hint.til === s)) kl.push("hint");
        let etikett = Dam.navn(s) + ", " + (brikke ? brikkeNavn(brikke) : "tom");
        if (midt && midt.slatt.has(s)) etikett += ", slått";
        if (valgt && s === (midt ? midt.her : valgt.fra) && interaktiv) etikett += ", valgt";
        if (tvang.has(s) && !valgt) etikett += ", må slå";
        if (mal.has(s)) etikett += mal.get(s) ? ", kan hoppe hit" : ", mulig trekk";
        if (interaktiv && hint && hint.fra === s) etikett += ", tips: flytt denne";
        if (interaktiv && hint && hint.til === s) etikett += ", tips: flytt hit";
        let innhold = koord;
        if (brikke) innhold += brikkeHtml(brikke, midt && midt.slatt.has(s) ? "slatt" : "");
        if (ghost.has(s)) innhold += brikkeHtml(ghost.get(s)[0], "borte", `--i:${ghost.get(s)[1]}`);
        ruter.push(
          o.interaktiv
            ? `<button class="${kl.join(" ")}" data-h="rute" data-v="${Dam.navn(s)}" data-stille tabindex="${s === fokus ? 0 : -1}" aria-label="${esc(etikett)}"${valgt && s === valgt.fra && !midt ? ' aria-pressed="true"' : ""}>${innhold}</button>`
            : `<span class="${kl.join(" ")}">${innhold}</span>`,
        );
      }
    const stempel = o.stempel ? `<span class="dm-stempel" aria-hidden="true"><span class="stempel ${o.stempel.klasse}">${esc(o.stempel.tekst)}</span></span>` : "";
    return `<div class="dm-brett${o.liten ? " liten" : ""}"${o.interaktiv ? ' role="group" aria-label="Dambrettet"' : ' aria-hidden="true"'}>${ruter.join("")}${stempel}</div>`;
  }

  const tallTekst = (sp) => [sp.mal ? (sp.mal === 1 ? "ett parti" : `først til ${sp.mal}`) : "", sp.uavgjort ? `${sp.uavgjort} remis` : ""].filter(Boolean).join("<br>");

  function poengHtml(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const antall = Dam.antallBrikker(p.pos);
    const naa = rundeFerdig(S) ? -1 : tur(S);
    const kort = (i) => {
      const f = fargeFor(sp, i);
      return `<div class="dm-spiller${naa === i ? " aktiv" : ""}${sp.resultat && sp.resultat.vinner === i ? " vant" : ""}">
        <span class="dm-merke" aria-hidden="true">${erMaskin(sp, i) ? `<span class="dm-maskin">${R.figur()}</span>` : R.avatar(i)}<i class="dm-stein ${FARGENAVN[f]}"></i></span>
        <b class="dm-navn">${esc(navn(sp, i))}</b>
        <small class="dm-igjen" aria-hidden="true">${FARGENAVN[f]} · ${antall[f]}</small>
      </div>`;
    };
    return `<div class="dm-stilling" role="group" aria-label="${esc(`Stillingen: ${navn(sp, 0)} ${sp.poeng[0]}, ${navn(sp, 1)} ${sp.poeng[1]}. ${navn(sp, 0)} har ${FARGENAVN[fargeFor(sp, 0)]} med ${antall[fargeFor(sp, 0)]} brikker, ${navn(sp, 1)} ${FARGENAVN[fargeFor(sp, 1)]} med ${antall[fargeFor(sp, 1)]}.`)}">
      ${kort(0)}
      <div class="dm-tall" aria-hidden="true"><b>${sp.poeng[0]}</b><span>–</span><b>${sp.poeng[1]}</b>${tallTekst(sp) ? `<small>${tallTekst(sp)}</small>` : ""}</div>
      ${kort(1)}
    </div>`;
  }

  function meldingHtml(S) {
    const sp = S.spill;
    const p = hentParti(S);
    if (sp.resultat) {
      const v = sp.resultat.vinner;
      let tekst = resultatLinje(S);
      if (v != null && kampVunnet(sp) && sp.mal > 1) tekst = sp.modus === "mobil" ? (v === 0 ? `Du vinner kampen – først til ${sp.mal}!` : "Mobilen vinner kampen!") : `${navn(sp, v)} vinner kampen!`;
      return `<p class="dm-melding ${v == null ? "remis" : "vinner"}"><span>${esc(tekst)}</span></p>`;
    }
    const i = tur(S);
    const f = fargeFor(sp, i);
    const ma = p.lovlige[0] && p.lovlige[0].slag.length;
    const forste = sp.trekk.length === 0;
    let tekst;
    if (erMaskin(sp, i)) tekst = `<span class="dm-tenker">Mobilen ${forste ? "begynner" : "tenker"}<i>.</i><i>.</i><i>.</i></span>`;
    else if (valgt && valgt.sti.length) tekst = "<b>Slå videre!</b>";
    else if (ma) tekst = sp.modus === "mobil" ? "<b>Du må slå!</b>" : `<b>${esc(navn(sp, i))} må slå!</b>`;
    else if (sp.modus === "mobil") tekst = forste ? "Du begynner! Trykk på en brikke." : "Din tur";
    else tekst = esc(`${navn(sp, i)} ${forste ? "begynner!" : "sin tur"}`);
    return `<p class="dm-melding${ma && !erMaskin(sp, i) ? " tvang" : ""}"><i class="dm-stein ${FARGENAVN[f]}" aria-hidden="true"></i><span>${tekst}</span></p>`;
  }

  // ---------- Board size: the whole board above the dock (or beside the tools in landscape) ----------
  // Same query as the two-column layout in spill.css (wide screens and phones on their side).
  const TO_KOLONNER = "(min-width: 900px) and (min-aspect-ratio: 5/4), (orientation: landscape) and (max-height: 600px) and (min-width: 560px)";
  function tilpass() {
    const brett = R.$(".skjerm-spill .dm-brett");
    if (!brett) return;
    const ramme = brett.parentElement;
    const toKolonner = window.matchMedia && window.matchMedia(TO_KOLONNER).matches;
    let b;
    if (toKolonner) {
      // The board's column is as wide as the board: size it from the height and what the tools leave.
      const skjerm = ramme.parentElement;
      const topp = skjerm.getBoundingClientRect().top + window.scrollY;
      b = Math.min(window.innerHeight - topp - 16, skjerm.clientWidth - 254, 640);
    } else b = Math.min(ramme.clientWidth, 640);
    b = Math.floor(b / 8) * 8;
    brett.style.width = b + "px";
    for (let n = 0; n < 3; n++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || b <= 224) break;
      b = Math.max(224, Math.floor((b - over) / 8) * 8);
      brett.style.width = b + "px";
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => R.S && R.S.skjerm === "spill" && tilpass());
  });

  // The piece that just moved slides along its path; jumped pieces fade one after the other.
  function spillAnimasjon(rot) {
    const a = animer;
    animer = null;
    if (!a || R.rolig() || a.dratt) return;
    const m = a.trekk;
    const til = Dam.tilRute(m);
    const el = rot.querySelector(`.dm-rute[data-v="${Dam.navn(til)}"] .dm-brikke:not(.borte)`);
    const tilEl = rot.querySelector(`.dm-rute[data-v="${Dam.navn(til)}"]`);
    if (!el || !tilEl || !el.animate) return;
    const t = tilEl.getBoundingClientRect();
    const punkter = [m.fra, ...m.sti].slice(a.fraSti);
    const ramme = punkter.map((s) => {
      const r = rot.querySelector(`.dm-rute[data-v="${Dam.navn(s)}"]`).getBoundingClientRect();
      return { transform: `translate(${r.left - t.left}px, ${r.top - t.top}px)` };
    });
    ramme[ramme.length - 1] = { transform: "translate(0, 0)" };
    if (ramme.length < 2) return;
    el.style.zIndex = "3";
    const anim = el.animate(ramme, { duration: 170 * (ramme.length - 1) + 60, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" });
    anim.onfinish = () => (el.style.zIndex = "");
  }

  // ---------- Drag and drop (taps work too) ----------
  let dra = null;
  let draSlutt = 0;
  const rutePa = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest(".skjerm-spill .dm-rute[data-v]") : null;
  };
  document.addEventListener("pointerdown", (e) => {
    const S = R.S;
    const ruteEl = e.target.closest && e.target.closest(".skjerm-spill .dm-rute[data-v]");
    if (!ruteEl || !S || S.skjerm !== "spill" || !S.spill || e.button > 0 || !kanFlytte(S)) return;
    const s = Dam.rute(ruteEl.dataset.v);
    const p = hentParti(S);
    const her = valgt && valgt.sti.length ? valgt.sti[valgt.sti.length - 1] : -1;
    const egen = s === her || (p.pos.b[s] && Dam.eier(p.pos.b[s]) === p.pos.side && p.lovlige.some((m) => m.fra === s));
    if (!egen) return;
    dra = { s, x: e.clientX, y: e.clientY, id: e.pointerId, aktiv: false, el: null };
  });
  document.addEventListener("pointermove", (e) => {
    if (!dra || e.pointerId !== dra.id) return;
    const dx = e.clientX - dra.x, dy = e.clientY - dra.y;
    if (!dra.aktiv) {
      if (dx * dx + dy * dy < 64) return;
      dra.aktiv = true;
      const S = R.S;
      const her = valgt && valgt.sti.length ? valgt.sti[valgt.sti.length - 1] : -1;
      if (dra.s !== her && (!valgt || valgt.fra !== dra.s)) {
        valgt = { fra: dra.s, sti: [] };
        R.vis();
      }
      const kilde = R.$(`.skjerm-spill .dm-rute[data-v="${Dam.navn(dra.s)}"]`);
      const brikke = kilde && kilde.querySelector(".dm-brikke:not(.borte)");
      if (!brikke || !S) {
        dra = null;
        return;
      }
      const b = kilde.getBoundingClientRect();
      const el = brikke.cloneNode(true);
      el.classList.add("dm-svever");
      el.style.width = el.style.height = b.width * 1.15 + "px";
      document.body.appendChild(el);
      brikke.style.opacity = "0.25";
      dra.el = el;
      dra.str = b.width * 1.15;
    }
    dra.el.style.transform = `translate(${e.clientX - dra.str / 2}px, ${e.clientY - dra.str * 0.75}px)`;
    const over = rutePa(e.clientX, e.clientY);
    R.$$(".skjerm-spill .dm-rute.over").forEach((x) => x !== over && x.classList.remove("over"));
    if (over && over.classList.contains("mal")) over.classList.add("over");
  });
  function slippDra(e, avbryt) {
    if (!dra || (e && e.pointerId !== dra.id)) return;
    const d = dra;
    dra = null;
    if (!d.aktiv) return;
    draSlutt = performance.now();
    if (d.el) d.el.remove();
    const S = R.S;
    const over = !avbryt && e ? rutePa(e.clientX, e.clientY) : null;
    if (over && S && S.spill && kanFlytte(S) && valgt && velgMal(S, Dam.rute(over.dataset.v), true)) return;
    R.vis();
  }
  document.addEventListener("pointerup", (e) => slippDra(e, false));
  document.addEventListener("pointercancel", (e) => slippDra(e, true));

  // ---------- Keyboard on the board: arrows move between the dark squares ----------
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("dm-rute") || !el.dataset.v) return;
    const steg = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!steg) return;
    e.preventDefault();
    const S = R.S;
    const retning = (bunnVist == null ? onsketBunn(S) : bunnVist) === HVIT ? 1 : -1;
    const s = Dam.rute(el.dataset.v);
    let r = s >> 3, c = s & 7;
    if (steg[0]) {
      // Up or down one row: to the dark square on the right (or the left at the edge).
      r += steg[0] * retning;
      const hoyre = c + retning;
      c = hoyre >= 0 && hoyre < 8 && Dam.mork(r * 8 + hoyre) ? hoyre : c - retning;
    } else c += steg[1] * 2 * retning;
    if (r < 0 || r > 7 || c < 0 || c > 7) return;
    const ny = R.$(`.dm-rute[data-v="${Dam.navn(r * 8 + c)}"]`);
    if (ny && ny.tagName === "BUTTON") {
      el.tabIndex = -1;
      ny.tabIndex = 0;
      ny.focus();
    }
  });

  // ---------- Setup and flow ----------
  function nyKamp(S) {
    const o = S.oppsett;
    const starter = o.starter === 1 ? 1 : 0;
    // Fair by default: the next match is opened by the other one (the choice can still be changed).
    o.starter = 1 - starter;
    S.spill = {
      id: R.nyttFro() % 1e9,
      modus: o.modus,
      niva: o.niva,
      mal: o.mal,
      starter,
      trekk: [],
      poeng: [0, 0],
      uavgjort: 0,
      runde: 1,
      resultat: null,
      ferdig: false,
      registrert: false,
      snu: o.modus === "to" && !!o.snu,
      snudd: false,
    };
    nullstillVisning();
    Motor.nullstill();
    R.statistikk("start", { modus: o.modus, niva: o.modus === "mobil" ? o.niva : 0, mal: o.mal });
  }
  function nyRunde(S) {
    const sp = S.spill;
    sp.runde++;
    sp.starter = 1 - sp.starter; // who starts alternates
    sp.trekk = [];
    sp.resultat = null;
    sp.snudd = false;
    delete sp.fra;
    nullstillVisning();
    Motor.nullstill();
    bunnVist = onsketBunn(S);
  }
  function nullstillVisning() {
    parti = null;
    valgt = null;
    animer = null;
    bunnVist = null;
    stoppTenking();
    stoppHint();
    clearTimeout(snuId);
    clearTimeout(kaaringId);
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.uavgjort + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${r.seier === 1 ? "seier" : "seirer"}</span><span><b>${r.uavgjort}</b> remis</span><span><b>${r.tap}</b> tap</span>`;
  }

  const DAM_IKON = `<span class="dm-knappebrikke" aria-hidden="true">${KRONE}</span>`;

  R.start({
    id: "dam",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, mal: 1, starter: 0, snu: true },
      spill: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, mal: 1, starter: 0, snu: true }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!MAL.includes(o.mal)) o.mal = 1;
      o.starter = o.starter === 1 ? 1 : 0;
      o.snu = !!o.snu;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      const sp = S.spill;
      if (sp) {
        const ok =
          Array.isArray(sp.trekk) && Array.isArray(sp.poeng) && sp.poeng.length === 2 && [0, 1].includes(sp.starter) && ["mobil", "to"].includes(sp.modus) && NIVAER.includes(sp.niva) && MAL.includes(sp.mal) && Dam.lastParti(sp.fra || Dam.START, sp.trekk);
        if (!ok) S.spill = null;
        else {
          // The round's result must match the board.
          const st = Dam.status(Dam.lastParti(sp.fra || Dam.START, sp.trekk));
          if (st.slutt && !sp.resultat) {
            const v = st.vinner == null ? null : spillerFor(sp, st.vinner);
            sp.resultat = { vinner: v, grunn: st.grunn };
            if (v == null) sp.uavgjort++;
            else sp.poeng[v]++;
          }
          if (!st.slutt && !sp.ferdig) sp.resultat = null;
        }
      }
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: "Dam for to på samme mobil – eller mot mobilen på fire nivåer. Slå alle brikkene til motstanderen, eller steng dem inne, så vinner du.",
      steg: [
        ["Flytt på skrå", "Brikkene står på de mørke rutene og går én rute på skrå framover. Trykk på en brikke og så på ruta den skal til – eller dra den dit."],
        ["Hopp og slå", "Står en av motstanderens brikker på skrå inntil din, med en ledig rute bak, hopper du over og slår den – framover eller bakover. Du må slå når du kan, og kan brikka slå videre, må den det."],
        ["Bli dame", "Ender en brikke på bakerste rad, blir den dame. En dame går så langt den vil på skrå. Den som ikke kan flytte, har tapt."],
      ],
      tips: [
        "Kan flere brikker slå, velger du selv hvilket slag du tar – men slaget må fullføres. Brikkene som kan slå, blinker.",
        "En brikke kan bare hoppes over én gang. De slåtte brikkene tas av brettet når hele slaget er ferdig.",
        "Damen slår på avstand: over én brikke på samme skrålinje, med bare ledige ruter imellom, og lander på hvilken som helst ledig rute bak den.",
        "Passerer en vanlig brikke bakerste rad midt i et slag og slår videre, blir den ikke dame. Den blir dame bare når trekket ender der.",
        "Remis (uavgjort): samme stilling for tredje gang, eller 40 trekk på rad (20 hver) uten slag og uten at en vanlig brikke flytter.",
        "Hvit begynner, og dere bytter på å begynne for hver runde. Først til 3: Den som først vinner tre partier, vinner kampen.",
        "Mot mobilen på nybegynner og lett foreslår «Tips» et trekk. Trykket feil? «Angre» tar tilbake trekket.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const rek = NIVAER.map((n) => [n, rekordHtml(S, n)]).filter(([, h]) => h);
          return (
            R.ui.spillhjem({
              slagordHtml: "Hopp over brikkene.<br><em>Kom deg fram og bli dame!</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? (sp.mal === 1 ? `Fortsett · trekk ${Math.floor(sp.trekk.length / 2) + 1}` : `Fortsett · ${sp.poeng[0]}–${sp.poeng[1]}`) : "",
                ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
              }),
              merker: [
                ["1–2", "spillere"],
                ["4", "nivåer"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="dm-rekorder" aria-label="Mot mobilen"><p class="etikett">Mot mobilen</p><ul>${rek.map(([n, h]) => `<li><b class="dm-niva">${NIVANAVN[n]}</b>${h}</li>`).join("")}</ul></section>` : "")
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const mot = o.modus === "mobil";
          const hvem = mot ? [[0, "Du"], [1, "Mobilen"]] : [[0, R.kutt(R.navn(0), 14)], [1, R.kutt(R.navn(1), 14)]];
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <h2>Hvordan vil du spille?</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: "Mot mobilen", tekst: "Fire nivåer" },
                  { v: "to", ikon: "👥", tittel: "To spillere", tekst: "På samme mobil" },
                ],
                o.modus,
              )}
            </section>
            ${
              mot
                ? `<section class="seksjon">
                    <h2>Hvor flink er mobilen?</h2>
                    ${R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), o.niva, { etikett: "Nivå" })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>`
                : R.ui.spillere({ min: 2, max: 2, tittel: "Spillerne" })
            }
            <section class="seksjon">
              <h2>Hvem begynner?</h2>
              ${R.ui.seg("starter", hvem, o.starter, { etikett: "Hvem begynner" })}
              <p class="hjelp">Den som begynner, har de hvite brikkene. ${mot ? "Du og mobilen" : "Dere"} bytter på å begynne for hver runde.</p>
            </section>
            <section class="seksjon">
              <h2>Hvor lenge?</h2>
              ${R.ui.seg("mal", MAL.map((m) => [m, MALNAVN[m]]), o.mal, { etikett: "Hvor lenge" })}
              <p class="hjelp">${o.mal === 1 ? "Ett parti – den som vinner det, vinner." : o.mal ? `Den som først vinner ${o.mal} partier, vinner kampen.` : "Dere spiller så mange partier dere vil, og avslutter når dere vil."}</p>
            </section>
            ${mot ? "" : R.ui.bryter("snu", o.snu, "Snu brettet for hver tur", "Den som skal flytte, har alltid sine brikker nederst.")}
            ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor", ikon: DAM_IKON }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.mal === 1 ? (S.spill.modus === "mobil" ? "Mot mobilen" : "To spillere") : `Runde ${S.spill.runde}`),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const p = hentParti(S);
          if (bunnVist == null) bunnVist = onsketBunn(S);
          const ferdig = rundeFerdig(S);
          const kanAngre = angreAntall(S) > 0 && !sp.ferdig;
          const medHint = sp.modus === "mobil" && sp.niva <= 2;
          const st = ferdig ? stempelFor(sp) : null;
          const verktoy = [
            `<button class="lenke" data-h="angre"${kanAngre ? "" : " disabled"}>↶ Angre</button>`,
            ferdig ? "" : medHint ? `<button class="lenke" data-h="hint"${hjelpVises(S) && !hintStopp && !(valgt && valgt.sti.length) ? "" : " disabled"}>💡 Tips</button>` : sp.modus === "to" ? `<button class="lenke" data-h="snu" aria-pressed="${!!sp.snudd}">⇅ Snu</button>` : "",
            R.ui.lenke("Avslutt", "avslutt"),
          ];
          return `
            <h1 class="vh" id="skjerm-tittel">Dam${sp.mal === 1 ? "" : `, runde ${sp.runde}`}: ${ferdig ? "partiet er ferdig" : erMaskin(sp, tur(S)) ? "mobilen sin tur" : sp.modus === "mobil" ? "din tur" : `${esc(navn(sp, tur(S)))} sin tur`}</h1>
            ${poengHtml(S)}
            ${meldingHtml(S)}
            <span class="dm-luft" aria-hidden="true"></span>
            <div class="dm-brettramme">${brettHtml(S, { bunn: bunnVist, interaktiv: true, stempel: st })}</div>
            <span class="dm-luft under" aria-hidden="true"></span>
            ${R.ui.dokk(ferdig ? (kampVunnet(sp) ? R.ui.knapp("Se kåringen", "kaaring", { ikon: "🏆" }) : R.ui.knapp("Ny runde", "runde", { ikon: DAM_IKON })) : "", R.ui.lenkerad(...verktoy.filter(Boolean)))}`;
        },
        etter(S, rot) {
          tilpass();
          spillAnimasjon(rot);
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          bunnVist = onsketBunn(S);
          R.holdVaken();
          startTenking(S);
          if (kampVunnet(S.spill) && S.spill.resultat) tilKaaringOm(S, 1800);
        },
        ut() {
          stoppTenking();
          stoppHint();
          clearTimeout(kaaringId);
          clearTimeout(snuId);
          valgt = null;
          animer = null;
          dra = null;
          R.$$(".dm-svever").forEach((el) => el.remove());
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = [0, 1].map((i) => ({ navn: navn(sp, i), i, poeng: sp.poeng[i] }));
          const [a, b] = sp.poeng;
          const vinner = a === b ? null : a > b ? 0 : 1;
          let tittel;
          if (vinner == null) tittel = a === 0 && !sp.uavgjort ? "Ingen vinner denne gangen" : "Uavgjort!";
          else if (sp.modus === "mobil") tittel = vinner === 0 ? "Du vinner!" : "Mobilen vinner!";
          else tittel = `${navn(sp, vinner)} vinner!`;
          const runder = a + b + sp.uavgjort;
          const etikett = `${R.flertall(runder, "parti", "partier")}${sp.uavgjort ? ` · ${sp.uavgjort} remis` : ""}`;
          const figur = vinner != null && !(sp.modus === "mobil" && vinner === 1) ? `<span class="dm-vinner">${R.avatar(vinner, "gigant")}<span class="dm-kroneemoji" aria-hidden="true">👑</span></span>` : R.figur();
          const tekst = sp.modus === "mobil" && vinner === 1 ? (sp.niva > 1 ? "Godt kjempa! Prøv igjen – eller velg et lettere nivå." : "Godt kjempa! Prøv igjen.") : vinner == null && runder > 0 ? "Like mange seirer hver. Det får avgjøres neste gang!" : "";
          let rekord = "";
          if (sp.modus === "mobil") {
            const rek = rekordHtml(S, sp.niva);
            rekord = rek ? `<p class="dm-rekordlinje"><span class="etikett">Mot mobilen · ${NIVANAVN[sp.niva].toLowerCase()}</span>${rek}</p>` : "";
          }
          return `
            <div class="banner ${sp.modus === "mobil" && vinner === 1 ? "" : "aksent"}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>
            ${R.ui.poengliste(rader)}
            ${rekord}
            ${R.ui.flereSpill({ antall: sp.modus === "to" ? 2 : 1 })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen", { ikon: DAM_IKON }), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const [a, b] = sp.poeng;
          if (sp.modus === "to" && !sp.registrert) {
            sp.registrert = true;
            R.kveld.registrer([0, 1].map((i) => ({ i, poeng: sp.poeng[i] })));
            R.lagre();
          }
          if (a !== b && !(sp.modus === "mobil" && b > a)) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else if (sp.modus === "mobil" && b > a) lyd.tap();
          else R.lyd.pling();
          R.slippVaken();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), !!S.spill && S.spill.modus === "mobil")) || !fortsatt()) return;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (S.spill) R.gaTil(S.spill.ferdig ? "slutt" : "spill");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "to" ? "to" : "mobil";
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = R.klamp(Number(el.dataset.v) || 2, 1, 4);
        R.vis();
      },
      starter(el, e, S) {
        S.oppsett.starter = el.dataset.v === "1" ? 1 : 0;
        R.vis();
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = MAL.includes(m) ? m : 1;
        R.vis();
      },
      snu(el, e, S) {
        if (S.skjerm === "oppsett") {
          S.oppsett.snu = !S.oppsett.snu;
          R.vis();
          return;
        }
        if (!S.spill) return;
        S.spill.snudd = !S.spill.snudd;
        bunnVist = onsketBunn(S);
        R.lyd.snu();
        R.vis();
      },
      start(el, e, S) {
        nyKamp(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyKamp(S);
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        if (S.spill && !S.spill.ferdig && kampVunnet(S.spill)) avsluttKamp(S);
      },
      runde(el, e, S) {
        if (!S.spill || !rundeFerdig(S)) return;
        if (kampVunnet(S.spill)) return avsluttKamp(S);
        nyRunde(S);
        R.lyd.snu();
        R.vis();
        startTenking(S);
      },
      rute(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.resultat || performance.now() - draSlutt < 150) return;
        if (!kanFlytte(S)) {
          R.toast("Vent litt – mobilen tenker");
          return;
        }
        trykkRute(S, Dam.rute(el.dataset.v), false);
      },
      // Against the two easiest levels: the phone suggests a good move (it thinks like Middels).
      hint(el, e, S) {
        const sp = S.spill;
        if (!sp || hintStopp || !hjelpVises(S)) return;
        const fortsatt = R.vakt();
        const nokkel = partiNokkel(sp);
        const p = hentParti(S);
        hintStopp = Motor.tenk(p, Object.assign({}, Motor.NIVA[3], { stoy: 0, dybde: 6, tid: 600 }), (svar) => {
          hintStopp = null;
          if (!fortsatt() || !R.S.spill || partiNokkel(R.S.spill) !== nokkel || !svar.trekk) return R.vis();
          hint = { fra: svar.trekk.fra, til: Dam.tilRute(svar.trekk) };
          valgt = null;
          R.lyd.pling();
          R.vis();
          R.toast(`Tips: ${beskriv(svar.trekk)}`);
        });
        R.vis();
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const n = angreAntall(S);
        if (n <= 0) return;
        stoppTenking();
        stoppHint();
        clearTimeout(kaaringId);
        clearTimeout(snuId);
        if (sp.resultat) {
          if (sp.resultat.vinner != null) sp.poeng[sp.resultat.vinner] = Math.max(0, sp.poeng[sp.resultat.vinner] - 1);
          else sp.uavgjort = Math.max(0, sp.uavgjort - 1);
          angreRekord(S, sp.resultat.vinner);
          sp.resultat = null;
        }
        const p = hentParti(S);
        for (let i = 0; i < n; i++) {
          Dam.tilbake(p);
          sp.trekk.pop();
        }
        merkParti(S);
        valgt = null;
        animer = null;
        bunnVist = onsketBunn(S);
        R.lyd.snu();
        R.toast(n >= 2 ? "Angret – din tur igjen" : "Angret");
        R.vis();
        startTenking(S);
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        const runder = sp.poeng[0] + sp.poeng[1] + sp.uavgjort;
        // The phone waits while the sheet is open, and thinks on after «Spill videre».
        stoppTenking();
        const ja = await R.bekreft(
          "Avslutte spillet?",
          runder ? `Dere går til kåringen. Stillingen er ${sp.poeng[0]}–${sp.poeng[1]}. Et parti som ikke er ferdig, teller ikke.` : "Partiet som er i gang, teller ikke. Dere kan alltid starte et nytt.",
          "Avslutt",
          "Spill videre",
        );
        if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!ja) return startTenking(S);
        if (!runder) {
          S.spill = null;
          nullstillVisning();
          R.gaTil("hjem");
          return;
        }
        avsluttKamp(S);
      },
    }),
  });

  function stempelFor(sp) {
    const r = sp.resultat || {};
    if (r.vinner == null) return { tekst: "Remis!", klasse: "lampe" };
    if (sp.modus === "mobil") return r.vinner === 0 ? { tekst: "Du vant!", klasse: "aksent" } : { tekst: "Mobilen vant", klasse: "" };
    return { tekst: `${FARGENAVN[fargeFor(sp, r.vinner)] === "hvit" ? "Hvit" : "Svart"} vant!`, klasse: "aksent" };
  }
})();
