/* Sjakkhesten — chess on one phone: two players, or against the phone at three levels.
   The rules (moves, check, mate, stalemate and every draw rule) and the engine (alpha-beta with
   piece-square tables, searched in small slices so the page never freezes) are pure functions at
   the top of this file. test/sjakkhesten.test.mjs loads the file without the kit and checks them. */
(function () {
  "use strict";

  // ---------- The rules ----------

  const Sjakk = (() => {
    const BONDE = 1, SPRINGER = 2, LOPER = 3, TAARN = 4, DRONNING = 5, KONGE = 6;
    const HVIT = 0, SVART = 1;
    const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    // A piece is type | colour << 3 (white 1–6, black 9–14). The board is 0x88: square =
    // rank * 16 + file, a1 = 0, h8 = 119; (square & 0x88) !== 0 means off the board.
    // A move is one integer: from | to << 7 | promotion type << 14 | kind << 17.
    const VANLIG = 0, DOBBEL = 1, EP = 2, ROKADE = 3;
    const trekk = (f, t, p, a) => f | (t << 7) | (p << 14) | (a << 17);
    const fra = (m) => m & 127;
    const til = (m) => (m >> 7) & 127;
    const forfremming = (m) => (m >> 14) & 7;
    const art = (m) => (m >> 17) & 3;

    const navn = (s) => "abcdefgh"[s & 7] + ((s >> 4) + 1);
    const rute = (t) => (t.charCodeAt(1) - 49) * 16 + (t.charCodeAt(0) - 97);

    const SPRINGER_STEG = [33, 31, 18, 14, -14, -18, -31, -33];
    const KONGE_STEG = [1, 15, 16, 17, -1, -15, -16, -17];
    const SKRA = [15, 17, -15, -17];
    const RETT = [1, -1, 16, -16];

    // Castling rights: 1 white short, 2 white long, 4 black short, 8 black long. A move from or
    // to one of these squares (king or rook moved, rook captured) clears the rights it touches.
    const ROK_MASKE = new Int8Array(128).fill(15);
    ROK_MASKE[0] = 13;
    ROK_MASKE[7] = 14;
    ROK_MASKE[4] = 12;
    ROK_MASKE[112] = 7;
    ROK_MASKE[119] = 11;
    ROK_MASKE[116] = 3;
    // The rook's jump in castling, by the king's target square: [from, to]
    const ROK_TAARN = { 6: [7, 5], 2: [0, 3], 118: [119, 117], 114: [112, 115] };

    // Zobrist keys (two 32-bit halves), from a fixed seed so every phone hashes the same way.
    let fro = 0x2545f491;
    const tall32 = () => {
      fro ^= fro << 13;
      fro ^= fro >>> 17;
      fro ^= fro << 5;
      return fro | 0;
    };
    const lagNokler = (n) => {
      const a = new Int32Array(n);
      for (let i = 0; i < n; i++) a[i] = tall32();
      return a;
    };
    const Z1 = lagNokler(16 * 128), Z2 = lagNokler(16 * 128);
    const ZS1 = tall32(), ZS2 = tall32();
    const ZR1 = lagNokler(16), ZR2 = lagNokler(16);
    const ZE1 = lagNokler(8), ZE2 = lagNokler(8);

    function hash(pos) {
      let h1 = 0, h2 = 0;
      for (let s = 0; s < 120; s++) {
        if (s & 0x88) {
          s += 7;
          continue;
        }
        const p = pos.b[s];
        if (p) {
          h1 ^= Z1[p * 128 + s];
          h2 ^= Z2[p * 128 + s];
        }
      }
      if (pos.side) {
        h1 ^= ZS1;
        h2 ^= ZS2;
      }
      h1 ^= ZR1[pos.rokade];
      h2 ^= ZR2[pos.rokade];
      if (pos.ep >= 0) {
        h1 ^= ZE1[pos.ep & 7];
        h2 ^= ZE2[pos.ep & 7];
      }
      pos.h1 = h1;
      pos.h2 = h2;
    }

    function lesFen(tekst) {
      const deler = String(tekst).trim().split(/\s+/);
      const pos = { b: new Int8Array(128), side: deler[1] === "b" ? SVART : HVIT, rokade: 0, ep: -1, halv: Number(deler[4]) || 0, hel: Number(deler[5]) || 1, konge: [-1, -1], h1: 0, h2: 0, u: [] };
      const rader = (deler[0] || "").split("/");
      if (rader.length !== 8) throw new Error("Ugyldig FEN: " + tekst);
      for (let r = 0; r < 8; r++) {
        let f = 0;
        for (const c of rader[r]) {
          if (c >= "1" && c <= "8") {
            f += Number(c);
            continue;
          }
          const t = "pnbrqk".indexOf(c.toLowerCase()) + 1;
          if (!t || f > 7) throw new Error("Ugyldig FEN: " + tekst);
          const farge = c === c.toLowerCase() ? SVART : HVIT;
          const s = (7 - r) * 16 + f;
          pos.b[s] = t | (farge << 3);
          if (t === KONGE) pos.konge[farge] = s;
          f++;
        }
      }
      if (pos.konge[0] < 0 || pos.konge[1] < 0) throw new Error("Ugyldig FEN (konge mangler): " + tekst);
      for (const c of deler[2] || "-") pos.rokade |= { K: 1, Q: 2, k: 4, q: 8 }[c] || 0;
      if (deler[3] && deler[3] !== "-") pos.ep = rute(deler[3]);
      hash(pos);
      return pos;
    }

    function fen(pos) {
      let ut = "";
      for (let r = 7; r >= 0; r--) {
        let tomme = 0;
        for (let f = 0; f < 8; f++) {
          const p = pos.b[r * 16 + f];
          if (!p) {
            tomme++;
            continue;
          }
          if (tomme) ut += tomme;
          tomme = 0;
          const c = " pnbrqk"[p & 7];
          ut += p >> 3 ? c : c.toUpperCase();
        }
        if (tomme) ut += tomme;
        if (r) ut += "/";
      }
      const rok = (pos.rokade & 1 ? "K" : "") + (pos.rokade & 2 ? "Q" : "") + (pos.rokade & 4 ? "k" : "") + (pos.rokade & 8 ? "q" : "");
      return `${ut} ${pos.side ? "b" : "w"} ${rok || "-"} ${pos.ep >= 0 ? navn(pos.ep) : "-"} ${pos.halv} ${pos.hel}`;
    }

    const kopi = (pos) => ({ b: Int8Array.from(pos.b), side: pos.side, rokade: pos.rokade, ep: pos.ep, halv: pos.halv, hel: pos.hel, konge: pos.konge.slice(), h1: pos.h1, h2: pos.h2, u: [] });

    // Is square s attacked by the side `av`?
    function angrepet(pos, s, av) {
      const b = pos.b;
      if (av === HVIT) {
        if (!((s - 15) & 0x88) && b[s - 15] === BONDE) return true;
        if (!((s - 17) & 0x88) && b[s - 17] === BONDE) return true;
      } else {
        if (!((s + 15) & 0x88) && b[s + 15] === (BONDE | 8)) return true;
        if (!((s + 17) & 0x88) && b[s + 17] === (BONDE | 8)) return true;
      }
      const o = av << 3;
      const n = SPRINGER | o;
      for (let i = 0; i < 8; i++) {
        const t = s + SPRINGER_STEG[i];
        if (!(t & 0x88) && b[t] === n) return true;
      }
      const k = KONGE | o;
      for (let i = 0; i < 8; i++) {
        const t = s + KONGE_STEG[i];
        if (!(t & 0x88) && b[t] === k) return true;
      }
      const l = LOPER | o, d = DRONNING | o, r = TAARN | o;
      for (let i = 0; i < 4; i++) {
        const steg = SKRA[i];
        for (let t = s + steg; !(t & 0x88); t += steg) {
          const p = b[t];
          if (p) {
            if (p === l || p === d) return true;
            break;
          }
        }
      }
      for (let i = 0; i < 4; i++) {
        const steg = RETT[i];
        for (let t = s + steg; !(t & 0x88); t += steg) {
          const p = b[t];
          if (p) {
            if (p === r || p === d) return true;
            break;
          }
        }
      }
      return false;
    }

    const iSjakk = (pos) => angrepet(pos, pos.konge[pos.side], pos.side ^ 1);

    function rokader(pos, s, ut) {
      const b = pos.b;
      const fiende = pos.side ^ 1;
      if (pos.side === HVIT) {
        if (s !== 4) return;
        if (pos.rokade & 1 && !b[5] && !b[6] && b[7] === TAARN && !angrepet(pos, 4, fiende) && !angrepet(pos, 5, fiende) && !angrepet(pos, 6, fiende)) ut.push(trekk(4, 6, 0, ROKADE));
        if (pos.rokade & 2 && !b[3] && !b[2] && !b[1] && b[0] === TAARN && !angrepet(pos, 4, fiende) && !angrepet(pos, 3, fiende) && !angrepet(pos, 2, fiende)) ut.push(trekk(4, 2, 0, ROKADE));
      } else {
        if (s !== 116) return;
        if (pos.rokade & 4 && !b[117] && !b[118] && b[119] === (TAARN | 8) && !angrepet(pos, 116, fiende) && !angrepet(pos, 117, fiende) && !angrepet(pos, 118, fiende)) ut.push(trekk(116, 118, 0, ROKADE));
        if (pos.rokade & 8 && !b[115] && !b[114] && !b[113] && b[112] === (TAARN | 8) && !angrepet(pos, 116, fiende) && !angrepet(pos, 115, fiende) && !angrepet(pos, 114, fiende)) ut.push(trekk(116, 114, 0, ROKADE));
      }
    }

    // Pseudo-legal moves (the own king may be left in check; lovlige() filters that).
    // bareSlag: only captures and queen promotions (for the engine's quiescence search).
    function pseudo(pos, ut, bareSlag) {
      const b = pos.b;
      const side = pos.side;
      const fram = side === HVIT ? 16 : -16;
      const startRad = side === HVIT ? 1 : 6;
      const sisteRad = side === HVIT ? 7 : 0;
      for (let s = 0; s < 120; s++) {
        if (s & 0x88) {
          s += 7;
          continue;
        }
        const p = b[s];
        if (!p || p >> 3 !== side) continue;
        const t = p & 7;
        if (t === BONDE) {
          const en = s + fram;
          if (en & 0x88) continue; // (only in odd positions: a pawn on its last rank)
          if (!b[en]) {
            if (en >> 4 === sisteRad) {
              ut.push(trekk(s, en, DRONNING, VANLIG));
              if (!bareSlag) ut.push(trekk(s, en, SPRINGER, VANLIG), trekk(s, en, TAARN, VANLIG), trekk(s, en, LOPER, VANLIG));
            } else if (!bareSlag) {
              ut.push(trekk(s, en, 0, VANLIG));
              if (s >> 4 === startRad && !b[en + fram]) ut.push(trekk(s, en + fram, 0, DOBBEL));
            }
          }
          for (let k = -1; k <= 1; k += 2) {
            const m = en + k;
            if (m & 0x88) continue;
            const q = b[m];
            if (q && q >> 3 !== side) {
              if (m >> 4 === sisteRad) {
                ut.push(trekk(s, m, DRONNING, VANLIG));
                if (!bareSlag) ut.push(trekk(s, m, SPRINGER, VANLIG), trekk(s, m, TAARN, VANLIG), trekk(s, m, LOPER, VANLIG));
              } else ut.push(trekk(s, m, 0, VANLIG));
            } else if (m === pos.ep && !q) ut.push(trekk(s, m, 0, EP));
          }
          continue;
        }
        if (t === SPRINGER || t === KONGE) {
          const steg = t === SPRINGER ? SPRINGER_STEG : KONGE_STEG;
          for (let i = 0; i < 8; i++) {
            const m = s + steg[i];
            if (m & 0x88) continue;
            const q = b[m];
            if (q) {
              if (q >> 3 !== side) ut.push(trekk(s, m, 0, VANLIG));
            } else if (!bareSlag) ut.push(trekk(s, m, 0, VANLIG));
          }
          if (t === KONGE && !bareSlag && pos.rokade) rokader(pos, s, ut);
          continue;
        }
        const retninger = t === LOPER ? SKRA : t === TAARN ? RETT : KONGE_STEG;
        for (let i = 0; i < retninger.length; i++) {
          const steg = retninger[i];
          for (let m = s + steg; !(m & 0x88); m += steg) {
            const q = b[m];
            if (q) {
              if (q >> 3 !== side) ut.push(trekk(s, m, 0, VANLIG));
              break;
            }
            if (!bareSlag) ut.push(trekk(s, m, 0, VANLIG));
          }
        }
      }
      return ut;
    }

    // Make a move. Everything needed to take it back goes on pos.u.
    function gjor(pos, m) {
      const b = pos.b;
      const f = m & 127, t = (m >> 7) & 127, pr = (m >> 14) & 7, a = (m >> 17) & 3;
      const side = pos.side;
      const p = b[f];
      const slattSted = a === EP ? t + (side === HVIT ? -16 : 16) : t;
      const slatt = b[slattSted];
      pos.u.push(m, slatt, pos.rokade, pos.ep, pos.halv, pos.h1, pos.h2);
      let h1 = pos.h1 ^ ZR1[pos.rokade] ^ ZS1;
      let h2 = pos.h2 ^ ZR2[pos.rokade] ^ ZS2;
      if (pos.ep >= 0) {
        h1 ^= ZE1[pos.ep & 7];
        h2 ^= ZE2[pos.ep & 7];
      }
      b[f] = 0;
      h1 ^= Z1[p * 128 + f];
      h2 ^= Z2[p * 128 + f];
      if (slatt) {
        b[slattSted] = 0;
        h1 ^= Z1[slatt * 128 + slattSted];
        h2 ^= Z2[slatt * 128 + slattSted];
      }
      const ny = pr ? pr | (side << 3) : p;
      b[t] = ny;
      h1 ^= Z1[ny * 128 + t];
      h2 ^= Z2[ny * 128 + t];
      if (a === ROKADE) {
        const rt = ROK_TAARN[t];
        const r = b[rt[0]];
        b[rt[0]] = 0;
        b[rt[1]] = r;
        h1 ^= Z1[r * 128 + rt[0]] ^ Z1[r * 128 + rt[1]];
        h2 ^= Z2[r * 128 + rt[0]] ^ Z2[r * 128 + rt[1]];
      }
      if ((p & 7) === KONGE) pos.konge[side] = t;
      pos.rokade &= ROK_MASKE[f] & ROK_MASKE[t];
      pos.ep = a === DOBBEL ? (f + t) >> 1 : -1;
      pos.halv = (p & 7) === BONDE || slatt ? 0 : pos.halv + 1;
      if (side === SVART) pos.hel++;
      pos.side = side ^ 1;
      h1 ^= ZR1[pos.rokade];
      h2 ^= ZR2[pos.rokade];
      if (pos.ep >= 0) {
        h1 ^= ZE1[pos.ep & 7];
        h2 ^= ZE2[pos.ep & 7];
      }
      pos.h1 = h1;
      pos.h2 = h2;
    }

    function angre(pos) {
      const u = pos.u;
      const h2 = u.pop(), h1 = u.pop(), halv = u.pop(), ep = u.pop(), rokade = u.pop(), slatt = u.pop(), m = u.pop();
      const b = pos.b;
      const f = m & 127, t = (m >> 7) & 127, pr = (m >> 14) & 7, a = (m >> 17) & 3;
      const side = pos.side ^ 1;
      pos.side = side;
      if (side === SVART) pos.hel--;
      const p = pr ? BONDE | (side << 3) : b[t];
      b[f] = p;
      if (a === EP) {
        b[t] = 0;
        b[t + (side === HVIT ? -16 : 16)] = slatt;
      } else b[t] = slatt;
      if (a === ROKADE) {
        const rt = ROK_TAARN[t];
        b[rt[0]] = b[rt[1]];
        b[rt[1]] = 0;
      }
      if ((p & 7) === KONGE) pos.konge[side] = f;
      pos.rokade = rokade;
      pos.ep = ep;
      pos.halv = halv;
      pos.h1 = h1;
      pos.h2 = h2;
    }

    function lovlige(pos) {
      const ps = pseudo(pos, [], false);
      const side = pos.side;
      const ut = [];
      for (let i = 0; i < ps.length; i++) {
        gjor(pos, ps[i]);
        if (!angrepet(pos, pos.konge[side], side ^ 1)) ut.push(ps[i]);
        angre(pos);
      }
      return ut;
    }

    function perft(pos, dybde) {
      if (dybde === 0) return 1;
      const ps = pseudo(pos, [], false);
      const side = pos.side;
      let n = 0;
      for (let i = 0; i < ps.length; i++) {
        gjor(pos, ps[i]);
        if (!angrepet(pos, pos.konge[side], side ^ 1)) n += dybde === 1 ? 1 : perft(pos, dybde - 1);
        angre(pos);
      }
      return n;
    }

    // No sequence of legal moves can give mate: kings alone, a single minor piece, or bishops
    // that all stand on squares of one colour.
    function forLiteMateriell(pos) {
      let springere = 0;
      const lopere = [];
      for (let s = 0; s < 120; s++) {
        if (s & 0x88) {
          s += 7;
          continue;
        }
        const t = pos.b[s] & 7;
        if (t === BONDE || t === TAARN || t === DRONNING) return false;
        if (t === SPRINGER) springere++;
        if (t === LOPER) lopere.push(((s >> 4) + (s & 7)) & 1);
      }
      if (springere + lopere.length <= 1) return true;
      return springere === 0 && lopere.every((c) => c === lopere[0]);
    }

    // Same position = same pieces on the same squares, same side to move, same castling rights
    // and the same en passant possibility (only counted when an en passant capture is legal).
    function nokkel(pos, lovlig) {
      const ep = pos.ep >= 0 && lovlig.some((m) => art(m) === EP) ? pos.ep : -1;
      let s = pos.side + ":" + pos.rokade + ":" + ep + ":";
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) s += String.fromCharCode(97 + pos.b[r * 16 + f]);
      return s;
    }

    // Standard algebraic notation with the Norwegian piece letters: K D T L S (bonde: none).
    const BOKSTAV = ["", "", "S", "L", "T", "D", "K"];
    function san(pos, m, lovlig) {
      let s;
      const f = fra(m), t = til(m);
      if (art(m) === ROKADE) s = (t & 7) === 6 ? "O-O" : "O-O-O";
      else {
        const p = pos.b[f];
        const slag = !!pos.b[t] || art(m) === EP;
        if ((p & 7) === BONDE) s = (slag ? "abcdefgh"[f & 7] + "x" : "") + navn(t) + (forfremming(m) ? "=" + BOKSTAV[forfremming(m)] : "");
        else {
          const andre = lovlig.filter((x) => x !== m && til(x) === t && pos.b[fra(x)] === p);
          let skille = "";
          if (andre.length) {
            if (!andre.some((x) => (fra(x) & 7) === (f & 7))) skille = "abcdefgh"[f & 7];
            else if (!andre.some((x) => fra(x) >> 4 === f >> 4)) skille = String((f >> 4) + 1);
            else skille = navn(f);
          }
          s = BOKSTAV[p & 7] + skille + (slag ? "x" : "") + navn(t);
        }
      }
      gjor(pos, m);
      const sjakk = iSjakk(pos);
      const matt = sjakk && lovlige(pos).length === 0;
      angre(pos);
      return s + (matt ? "#" : sjakk ? "+" : "");
    }

    const uci = (m) => navn(fra(m)) + navn(til(m)) + (forfremming(m) ? " nbrq"[forfremming(m) - 1] : "");

    // ---------- A game: the position plus everything needed for the draw rules ----------

    function nyttParti(startFen) {
      const pos = lesFen(startFen || START);
      const p = { start: startFen || START, pos, trekk: [], san: [], slatt: [], nokler: [], h1: [pos.h1], h2: [pos.h2], lovlige: lovlige(pos) };
      p.nokler.push(nokkel(pos, p.lovlige));
      return p;
    }

    // Play a legal move (an integer from p.lovlige).
    function spill(p, m) {
      if (!p.lovlige.includes(m)) throw new Error("Ulovlig trekk: " + uci(m));
      p.san.push(san(p.pos, m, p.lovlige));
      gjor(p.pos, m);
      p.slatt.push(p.pos.u[p.pos.u.length - 6]);
      p.trekk.push(m);
      p.h1.push(p.pos.h1);
      p.h2.push(p.pos.h2);
      p.lovlige = lovlige(p.pos);
      p.nokler.push(nokkel(p.pos, p.lovlige));
      return p;
    }

    function tilbake(p) {
      if (!p.trekk.length) return null;
      angre(p.pos);
      const m = p.trekk.pop();
      p.san.pop();
      p.slatt.pop();
      p.nokler.pop();
      p.h1.pop();
      p.h2.pop();
      p.lovlige = lovlige(p.pos);
      return m;
    }

    const fraUci = (p, tekst) => p.lovlige.find((m) => uci(m) === tekst) || 0;

    // Replay a saved game (moves in UCI). Returns null if any move is not legal.
    function lastParti(startFen, liste) {
      let p;
      try {
        p = nyttParti(startFen);
      } catch (e) {
        return null;
      }
      for (const tekst of liste || []) {
        const m = fraUci(p, String(tekst));
        if (!m) return null;
        spill(p, m);
      }
      return p;
    }

    // { slutt, vinner (0 white, 1 black, null draw), grunn, sjakk }
    // grunn: "matt" | "patt" | "materiell" | "gjentakelse" | "femti"
    function status(p) {
      const sjakk = iSjakk(p.pos);
      if (!p.lovlige.length) return sjakk ? { slutt: true, vinner: p.pos.side ^ 1, grunn: "matt", sjakk } : { slutt: true, vinner: null, grunn: "patt", sjakk };
      if (forLiteMateriell(p.pos)) return { slutt: true, vinner: null, grunn: "materiell", sjakk };
      const k = p.nokler[p.nokler.length - 1];
      let like = 0;
      for (const x of p.nokler) if (x === k) like++;
      if (like >= 3) return { slutt: true, vinner: null, grunn: "gjentakelse", sjakk };
      if (p.pos.halv >= 100) return { slutt: true, vinner: null, grunn: "femti", sjakk };
      return { slutt: false, vinner: null, grunn: null, sjakk };
    }

    // Can this side still give mate in any way at all? (Used when the other side's time runs out.)
    function kanSetteMatt(pos, side) {
      let lette = 0;
      let motstander = 0;
      for (let s = 0; s < 120; s++) {
        if (s & 0x88) {
          s += 7;
          continue;
        }
        const p = pos.b[s];
        if (!p || (p & 7) === KONGE) continue;
        if (p >> 3 !== side) {
          motstander++;
          continue;
        }
        const t = p & 7;
        if (t === BONDE || t === TAARN || t === DRONNING) return true;
        lette++;
      }
      if (lette === 0) return false;
      return lette > 1 || motstander > 0;
    }

    return {
      BONDE, SPRINGER, LOPER, TAARN, DRONNING, KONGE, HVIT, SVART, START,
      VANLIG, DOBBEL, EP, ROKADE, BOKSTAV,
      trekk, fra, til, forfremming, art, navn, rute, uci,
      lesFen, fen, kopi, hash, angrepet, iSjakk, pseudo, gjor, angre, lovlige, perft,
      forLiteMateriell, nokkel, san, kanSetteMatt,
      nyttParti, spill, tilbake, fraUci, lastParti, status,
    };
  })();

  // ---------- The engine ----------
  // Negamax alpha-beta with iterative deepening, a transposition table, killer/history move
  // ordering, check extensions and a quiescence search over captures. The search is a generator
  // that yields every few hundred nodes; Motor.tenk() runs it in slices of a few milliseconds
  // (setTimeout between them), so the page stays responsive and the answer comes in time.

  const Motor = (() => {
    const { BONDE, DRONNING, KONGE, EP } = Sjakk;
    const { pseudo, gjor, angre, angrepet, lovlige } = Sjakk;
    const fraR = Sjakk.fra, tilR = Sjakk.til, forfremming = Sjakk.forfremming, art = Sjakk.art;

    const VERDI = [0, 100, 320, 330, 500, 900, 0];
    // Piece-square tables from white's side, rank 8 first (the classic "simplified evaluation").
    const TABELLER = {
      1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
      2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
      3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
      4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
      5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    };
    const KONGE_MIDT = [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20];
    const KONGE_SLUTT = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
    const FASE = [0, 0, 1, 1, 2, 4, 0];

    // Value + table, per piece code and square.
    const PST = new Int16Array(16 * 128);
    const KMIDT = new Int16Array(256);
    const KSLUTT = new Int16Array(256);
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const hvit = (7 - (s >> 4)) * 8 + (s & 7);
      const svart = (s >> 4) * 8 + (s & 7);
      for (let t = 1; t <= 5; t++) {
        PST[t * 128 + s] = VERDI[t] + TABELLER[t][hvit];
        PST[(t | 8) * 128 + s] = VERDI[t] + TABELLER[t][svart];
      }
      KMIDT[s] = KONGE_MIDT[hvit];
      KMIDT[128 + s] = KONGE_MIDT[svart];
      KSLUTT[s] = KONGE_SLUTT[hvit];
      KSLUTT[128 + s] = KONGE_SLUTT[svart];
    }

    // Static evaluation from the side to move's point of view (centipawns).
    function evaluer(pos) {
      const b = pos.b;
      let poeng = 0, fase = 0, mat0 = 0, mat1 = 0, bonder = 0;
      for (let s = 0; s < 120; s++) {
        if (s & 0x88) {
          s += 7;
          continue;
        }
        const p = b[s];
        if (!p) continue;
        const t = p & 7;
        if (t === KONGE) continue;
        if (t === BONDE) bonder++;
        if (p & 8) {
          poeng -= PST[p * 128 + s];
          mat1 += VERDI[t];
        } else {
          poeng += PST[p * 128 + s];
          mat0 += VERDI[t];
        }
        fase += FASE[t];
      }
      // Two bare kings, or a single minor piece each at most: nobody can win.
      if (!bonder && mat0 <= 330 && mat1 <= 330) return 0;
      if (fase > 24) fase = 24;
      const kh = pos.konge[0], ks = pos.konge[1];
      poeng += (((KMIDT[kh] - KMIDT[128 + ks]) * fase + (KSLUTT[kh] - KSLUTT[128 + ks]) * (24 - fase)) / 24) | 0;
      // Far ahead in an endgame: drive the lone king to the edge and bring the own king close.
      const diff = mat0 - mat1;
      if (fase <= 10 && (diff >= 400 || diff <= -400)) {
        const sterk = diff > 0 ? 0 : 1;
        const svak = pos.konge[sterk ^ 1], egen = pos.konge[sterk];
        const sf = svak & 7, sr = svak >> 4;
        const kant = Math.max(3 - sf, sf - 4) + Math.max(3 - sr, sr - 4);
        const avstand = Math.abs(sf - (egen & 7)) + Math.abs(sr - (egen >> 4));
        const bonus = kant * 12 + (14 - avstand) * 5;
        poeng += sterk === 0 ? bonus : -bonus;
      }
      return pos.side === 0 ? poeng : -poeng;
    }

    const MATT = 30000;
    const UENDELIG = 32000;
    const MAKS_PLY = 64;
    const EKSAKT = 1, NEDRE = 2, OVRE = 3;
    const TT_STR = 1 << 18;
    let tt = null;
    const lagTt = () => ({ sjekk: new Int32Array(TT_STR), verdi: new Int16Array(TT_STR), dybde: new Int8Array(TT_STR), flagg: new Int8Array(TT_STR), trekk: new Int32Array(TT_STR) });

    function lagKontekst(valg, h1, h2, side) {
      if (!tt) tt = lagTt();
      return {
        noder: 0,
        sistPause: 0,
        qsok: valg.qsok !== false,
        forakt: valg.forakt || 0,
        rotSide: side,
        sti1: (h1 || []).slice(),
        sti2: (h2 || []).slice(),
        killer1: new Int32Array(MAKS_PLY + 2),
        killer2: new Int32Array(MAKS_PLY + 2),
        historie: new Int32Array(16 * 128),
      };
    }

    const remis = (pos, ctx) => (pos.side === ctx.rotSide ? -ctx.forakt : ctx.forakt);

    function gjentatt(pos, ctx) {
      const s1 = ctx.sti1, s2 = ctx.sti2;
      const n = s1.length - 1;
      const grense = Math.max(0, n - pos.halv);
      for (let i = n - 4; i >= grense; i -= 2) if (s1[i] === pos.h1 && s2[i] === pos.h2) return true;
      return false;
    }

    function ordne(pos, ms, ttTrekk, ply, ctx) {
      const poeng = new Int32Array(ms.length);
      const b = pos.b;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (m === ttTrekk) {
          poeng[i] = 1 << 30;
          continue;
        }
        const offer = art(m) === EP ? BONDE : b[tilR(m)] & 7;
        if (offer) poeng[i] = (1 << 28) + VERDI[offer] * 16 - (b[fraR(m)] & 7);
        else if (forfremming(m) === DRONNING) poeng[i] = 1 << 27;
        else if (m === ctx.killer1[ply]) poeng[i] = 1 << 26;
        else if (m === ctx.killer2[ply]) poeng[i] = 1 << 25;
        else poeng[i] = ctx.historie[b[fraR(m)] * 128 + tilR(m)];
      }
      return poeng;
    }

    // Selection sort, one step: bring the best remaining move to position i.
    function neste(ms, poeng, i) {
      let best = i;
      for (let j = i + 1; j < ms.length; j++) if (poeng[j] > poeng[best]) best = j;
      if (best !== i) {
        const m = ms[i];
        ms[i] = ms[best];
        ms[best] = m;
        const p = poeng[i];
        poeng[i] = poeng[best];
        poeng[best] = p;
      }
      return ms[i];
    }

    function* qsok(pos, alfa, beta, ply, ctx) {
      ctx.noder++;
      // Captures can chain for a while: let the scheduler look at the clock here too.
      if (ctx.noder - ctx.sistPause >= 384) {
        ctx.sistPause = ctx.noder;
        yield;
      }
      const staa = evaluer(pos);
      if (staa >= beta || ply >= MAKS_PLY) return staa;
      if (staa > alfa) alfa = staa;
      const ms = pseudo(pos, [], true);
      const poeng = ordne(pos, ms, 0, ply, ctx);
      const side = pos.side;
      let best = staa;
      for (let i = 0; i < ms.length; i++) {
        const m = neste(ms, poeng, i);
        if (!forfremming(m)) {
          const offer = art(m) === EP ? BONDE : pos.b[tilR(m)] & 7;
          if (staa + VERDI[offer] + 200 < alfa) continue; // can't get close to alpha: skip
        }
        gjor(pos, m);
        if (angrepet(pos, pos.konge[side], side ^ 1)) {
          angre(pos);
          continue;
        }
        const v = -(yield* qsok(pos, -beta, -alfa, ply + 1, ctx));
        angre(pos);
        if (v > best) {
          best = v;
          if (v > alfa) {
            alfa = v;
            if (v >= beta) break;
          }
        }
      }
      return best;
    }

    function* sok(pos, dybde, alfa, beta, ply, ctx) {
      const side = pos.side;
      const sjakk = angrepet(pos, pos.konge[side], side ^ 1);
      if (sjakk && ply < MAKS_PLY - 8) dybde++; // check extension: never stop the search in check
      if (dybde <= 0) return ctx.qsok ? yield* qsok(pos, alfa, beta, ply, ctx) : evaluer(pos);
      ctx.noder++;
      // Let the scheduler look at the clock every few hundred nodes (quiescence nodes count too).
      if (ctx.noder - ctx.sistPause >= 384) {
        ctx.sistPause = ctx.noder;
        yield;
      }
      if (pos.halv >= 100 || gjentatt(pos, ctx)) return remis(pos, ctx);
      if (ply >= MAKS_PLY) return evaluer(pos);

      const idx = pos.h1 & (TT_STR - 1);
      let ttTrekk = 0;
      if (tt.flagg[idx] && tt.sjekk[idx] === pos.h2) {
        ttTrekk = tt.trekk[idx];
        if (tt.dybde[idx] >= dybde) {
          let v = tt.verdi[idx];
          if (v > MATT - 500) v -= ply;
          else if (v < -MATT + 500) v += ply;
          const fl = tt.flagg[idx];
          if (fl === EKSAKT || (fl === NEDRE && v >= beta) || (fl === OVRE && v <= alfa)) return v;
        }
      }

      const ms = pseudo(pos, [], false);
      const poeng = ordne(pos, ms, ttTrekk, ply, ctx);
      const alfa0 = alfa;
      let best = -UENDELIG, bestTrekk = 0, antall = 0;
      for (let i = 0; i < ms.length; i++) {
        const m = neste(ms, poeng, i);
        gjor(pos, m);
        if (angrepet(pos, pos.konge[side], side ^ 1)) {
          angre(pos);
          continue;
        }
        antall++;
        ctx.sti1.push(pos.h1);
        ctx.sti2.push(pos.h2);
        const v = -(yield* sok(pos, dybde - 1, -beta, -alfa, ply + 1, ctx));
        ctx.sti1.pop();
        ctx.sti2.pop();
        angre(pos);
        if (v > best) {
          best = v;
          bestTrekk = m;
          if (v > alfa) {
            alfa = v;
            if (v >= beta) {
              if (!pos.b[tilR(m)] && art(m) !== EP && !forfremming(m)) {
                if (ctx.killer1[ply] !== m) {
                  ctx.killer2[ply] = ctx.killer1[ply];
                  ctx.killer1[ply] = m;
                }
                const h = pos.b[fraR(m)] * 128 + tilR(m);
                ctx.historie[h] += dybde * dybde;
                if (ctx.historie[h] > 1 << 24) for (let k = 0; k < ctx.historie.length; k++) ctx.historie[k] >>= 1;
              }
              break;
            }
          }
        }
      }
      if (!antall) return sjakk ? -MATT + ply : remis(pos, ctx);

      let lagret = best;
      if (lagret > MATT - 500) lagret += ply;
      else if (lagret < -MATT + 500) lagret -= ply;
      tt.sjekk[idx] = pos.h2;
      tt.verdi[idx] = lagret;
      tt.dybde[idx] = dybde;
      tt.flagg[idx] = best <= alfa0 ? OVRE : best >= beta ? NEDRE : EKSAKT;
      tt.trekk[idx] = bestTrekk;
      return best;
    }

    // Root: iterative deepening. `resultat` always holds the best move found so far, so the
    // search can be stopped at any yield. valg: { dybde, qsok, stoy, fullVindu, forakt, tilfeldig }
    function* rot(pos, valg, ctx, resultat) {
      const ms = lovlige(pos);
      resultat.trekk = ms[0] || 0;
      resultat.verdi = 0;
      resultat.dybde = 0;
      if (ms.length <= 1) return resultat;
      const tilfeldig = valg.tilfeldig || Math.random;
      const rekke = ms.map((m) => ({ m, s: 0, stoy: valg.stoy ? Math.round((tilfeldig() * 2 - 1) * valg.stoy) : 0 }));
      for (let d = 1; d <= (valg.dybde || 64); d++) {
        let alfa = -UENDELIG;
        let beste = null;
        for (const r of rekke) {
          gjor(pos, r.m);
          ctx.sti1.push(pos.h1);
          ctx.sti2.push(pos.h2);
          const v = -(yield* sok(pos, d - 1, -UENDELIG, valg.fullVindu ? UENDELIG : -alfa, 1, ctx));
          ctx.sti1.pop();
          ctx.sti2.pop();
          angre(pos);
          r.s = v + r.stoy;
          if (!beste || r.s > beste.s) beste = r;
          if (v > alfa) alfa = v;
          // Safe to use before the iteration ends: the first move is the previous best, and a
          // later move only takes over when it is proven better.
          resultat.trekk = beste.m;
          resultat.verdi = beste.s;
        }
        rekke.sort((a, b) => (a === beste ? -1 : b === beste ? 1 : b.s - a.s));
        resultat.dybde = d;
        if (Math.abs(beste.s) > MATT - 500) break; // a forced mate: no need to look further
      }
      return resultat;
    }

    // Run a generator in slices of `skive` ms (setTimeout between them) until it is done or
    // `tid` ms have passed. Returns a function that stops it. ferdig(svar) is called once.
    function kjor(gen, valg, ferdig) {
      const start = performance.now();
      const skive = valg.skive || 12;
      let stoppet = false;
      let svar;
      const steg = () => {
        if (stoppet) return;
        const na = performance.now();
        const slutt = Math.min(na + skive, start + (valg.tid || 1e9));
        let r;
        do r = gen.next();
        while (!r.done && performance.now() < slutt);
        if (r.done || performance.now() >= start + (valg.tid || 1e9)) {
          stoppet = true;
          svar = r.value;
          ferdig(svar);
          return;
        }
        setTimeout(steg, 0);
      };
      setTimeout(steg, 0);
      return () => {
        stoppet = true;
      };
    }

    // Find a move for the side to move in game p. valg as for rot() plus tid (ms).
    // Returns { stopp } at once; ferdig({ trekk, verdi, dybde, noder }) comes later.
    function tenk(p, valg, ferdig) {
      const pos = Sjakk.kopi(p.pos);
      const ctx = lagKontekst(valg, p.h1, p.h2, pos.side);
      const resultat = { trekk: 0, verdi: 0, dybde: 0 };
      const gen = rot(pos, valg, ctx, resultat);
      return kjor(gen, valg, () => {
        resultat.noder = ctx.noder;
        // Now and then a beginner-level move: any legal move at all.
        if (valg.villTrekk && (valg.tilfeldig || Math.random)() < valg.villTrekk && p.lovlige.length > 1) {
          resultat.trekk = p.lovlige[Math.floor((valg.tilfeldig || Math.random)() * p.lovlige.length)];
        }
        ferdig(resultat);
      });
    }

    // The same search without slices (tests, analysis): runs to the end, to maksNoder or to tid ms.
    function velg(p, valg) {
      const pos = Sjakk.kopi(p.pos);
      const ctx = lagKontekst(valg, p.h1, p.h2, pos.side);
      const resultat = { trekk: 0, verdi: 0, dybde: 0 };
      const gen = rot(pos, valg, ctx, resultat);
      const slutt = performance.now() + (valg.tid || 1e9);
      let r;
      let skiver = 0;
      do {
        r = gen.next();
        skiver++;
      } while (!r.done && (!valg.maksNoder || ctx.noder < valg.maksNoder) && performance.now() < slutt);
      resultat.noder = ctx.noder;
      resultat.skiver = skiver;
      return resultat;
    }

    const nullstill = () => {
      tt = null;
    };

    // The three levels. Lett: one move deep, greedy and a little random (it misses recaptures).
    // Middels: sees replies and captures. Vanskelig: as deep as ~1.5 s allows.
    const NIVA = {
      1: { dybde: 1, qsok: false, stoy: 45, fullVindu: true, villTrekk: 0.12, tid: 600 },
      2: { dybde: 2, qsok: true, stoy: 70, fullVindu: true, villTrekk: 0.05, tid: 900 },
      3: { dybde: 3, qsok: true, stoy: 40, fullVindu: true, tid: 1200 },
      4: { dybde: 64, qsok: true, stoy: 0, forakt: 15, tid: 1500 },
    };
    // Options for a level in this game: the strongest level varies its first moves a little,
    // so no two games start the same way.
    function valgFor(niva, p) {
      const v = Object.assign({}, NIVA[niva] || NIVA[3]);
      if (niva === 4 && p.trekk.length < 8) Object.assign(v, { stoy: 14, fullVindu: true, dybde: 4 });
      return v;
    }

    return { evaluer, tenk, velg, kjor, nullstill, valgFor, NIVA, VERDI, MATT };
  })();

  const R = window.Rusj;
  if (!R) {
    // Loaded without the kit (unit tests in node): only the rules and the engine.
    window.Sjakkhesten = { Sjakk, Motor };
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const { HVIT, SVART, BONDE, DRONNING, TAARN, LOPER, SPRINGER, KONGE } = Sjakk;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const FARGENAVN = [R.t("Hvit"), R.t("Svart")];
  const BRIKKENAVN = ["", R.t("bonde"), R.t("springer"), R.t("løper"), R.t("tårn"), R.t("dronning"), R.t("konge")];
  const BESTEMT = ["", R.t("Denne bonden"), R.t("Denne springeren"), R.t("Denne løperen"), R.t("Dette tårnet"), R.t("Denne dronningen"), R.t("Denne kongen")];
  // The piece letters in the notation (the rules write K D T L S; English shows K Q R B N).
  const BOKSTAV = { K: R.t("K"), D: R.t("D"), T: R.t("T"), L: R.t("L"), S: R.t("S") };
  const visSan = (san) => san.replace(/^[KDTLS]/, (b) => BOKSTAV[b]).replace(/=([DTLS])/, (m, b) => "=" + BOKSTAV[b]);
  // Four steps: each one beats the one below most of the time (measured in self-play).
  const NIVANAVN = { 1: R.t("Nybegynner"), 2: R.t("Lett"), 3: R.t("Middels"), 4: R.t("Vanskelig") };
  const NIVATEKST = {
    1: R.t("Mobilen gjør mange tabber og lar brikker stå i fare. Fint for å lære."),
    2: R.t("Mobilen slår når den kan, men ser ikke langt. Fin første motstander."),
    3: R.t("Ser noen trekk fram og straffer feil. Passe utfordring."),
    4: R.t("Tenker dypt. Klarer du å slå den?"),
  };
  const NIVAER = [1, 2, 3, 4];
  const KLOKKER = [0, 5, 10, 15];
  const MIN_TENK = 550; // ms: the phone's move never comes faster than this (feels natural)
  let H;

  // ---------- Pieces: our own drawings, one <symbol> per piece, used everywhere ----------

  const BRIKKEFARGE = [
    { fyll: "#fff6e6", strek: "#170e2b", detalj: "#170e2b" },
    { fyll: "#33244f", strek: "#0b0617", detalj: "#f6e7cf" },
  ];
  function form(t, c) {
    const f = BRIKKEFARGE[c];
    const k = `fill="${f.fyll}" stroke="${f.strek}" stroke-width="4.5" stroke-linejoin="round"`;
    const d = `fill="none" stroke="${f.detalj}" stroke-width="4" stroke-linecap="round"`;
    const fot = `<rect ${k} x="20" y="79" width="60" height="12" rx="5"/>`;
    switch (t) {
      case BONDE:
        return `<path ${k} d="M38.5 52C38.5 63 32 72 25 80H75C68 72 61.5 63 61.5 52Z"/>${fot}<rect ${k} x="34" y="43.5" width="32" height="8.5" rx="4"/><circle ${k} cx="50" cy="27.5" r="14"/>`;
      case SPRINGER:
        return `<path ${k} d="M30 80C31 70 35 63 41 56C35 58 27 59 21 56C16 53 15 47 19 43L33 26C36 21 40 18 44 17L47 8L53 16C67 19 77 31 77 48C77 62 72 70 72 80Z"/>${fot}<circle fill="${f.detalj}" cx="40" cy="31" r="3.6"/><circle fill="${f.detalj}" cx="23" cy="48" r="2.1"/><path ${d} d="M57 22C66 27 71 37 71 49"/>`;
      case LOPER:
        return `<path ${k} d="M41 68C41 73 36 77 30 80H70C64 77 59 73 59 68Z"/>${fot}<rect ${k} x="36" y="60" width="28" height="8.5" rx="4"/><path ${k} d="M50 18C62 26 69 38 67 49C65.5 57 58.5 61 50 61C41.5 61 34.5 57 33 49C31 38 38 26 50 18Z"/><path ${d} d="M57.5 31L47 43.5"/><circle ${k} cx="50" cy="12" r="6"/>`;
      case TAARN:
        return `<path ${k} d="M32 36H68L66 70H34Z"/><rect ${k} x="28" y="68" width="44" height="11" rx="3"/>${fot}<path ${k} d="M25 16H37V24H44V16H56V24H63V16H75V36H25Z"/>`;
      case DRONNING:
        return `<path ${k} d="M33 74C33 77 30 79 26 80H74C70 79 67 77 67 74Z"/>${fot}<path ${k} d="M21 33L31 57L34 26L44 54L50 21L56 54L66 26L69 57L79 33L71 68H29Z"/><rect ${k} x="29" y="65.5" width="42" height="8.5" rx="4"/><circle ${k} cx="19" cy="29" r="5.2"/><circle ${k} cx="34" cy="20.5" r="5.2"/><circle ${k} cx="50" cy="15" r="5.6"/><circle ${k} cx="66" cy="20.5" r="5.2"/><circle ${k} cx="81" cy="29" r="5.2"/>`;
      default:
        return `<path ${k} d="M35 73C35 76 31 79 26 80H74C69 79 65 76 65 73Z"/>${fot}<path ${k} d="M50 30C40 25 25 28 25 40C25 50 32 58 34 67H66C68 58 75 50 75 40C75 28 60 25 50 30Z"/><path ${d} d="M50 31V60"/><rect ${k} x="31" y="65" width="38" height="8.5" rx="4"/><path ${k} d="M46 4.5H54V12H61.5V20H54V28H46V20H38.5V12H46Z"/>`;
    }
  }
  function leggInnSymboler() {
    if (document.getElementById("sh-symboler")) return;
    const sym = [];
    for (const c of [HVIT, SVART]) for (let t = 1; t <= 6; t++) sym.push(`<symbol id="sh-${c}${t}" viewBox="0 0 100 100">${form(t, c)}</symbol>`);
    document.body.insertAdjacentHTML("beforeend", `<svg id="sh-symboler" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${sym.join("")}</svg>`);
  }
  const brikkeSvg = (p, klasse) => `<svg class="${klasse || "sh-brikke"}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#sh-${p >> 3}${p & 7}"/></svg>`;
  const brikkeNavn = (p) => (p >> 3 ? R.t("svart {brikke}", { brikke: BRIKKENAVN[p & 7] }) : R.t("hvit {brikke}", { brikke: BRIKKENAVN[p & 7] }));

  // ---------- Game state ----------
  // S.spill: { id, modus "mobil" | "to", niva, meg (the human's colour against the phone),
  //   hvit (2 players: index of the player with white), trekk (UCI list), klokke, snu,
  //   snudd (flipped by hand), resultat { vinner, grunn }, ferdig, registrert }

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  let parti = null; // the game as rules object, rebuilt from S.spill.trekk when needed
  let partiFor = "";
  function hentParti(S) {
    const sp = S.spill;
    const n = sp.id + ":" + sp.trekk.length + ":" + (sp.trekk[sp.trekk.length - 1] || "");
    if (parti && partiFor === n) return parti;
    parti = Sjakk.lastParti(Sjakk.START, sp.trekk);
    partiFor = n;
    return parti;
  }
  const merkParti = (S) => {
    const sp = S.spill;
    partiFor = sp.id + ":" + sp.trekk.length + ":" + (sp.trekk[sp.trekk.length - 1] || "");
  };

  // Who sits where: names and avatars of the side with this colour.
  const spillerIndeks = (sp, farge) => (sp.modus === "mobil" ? 0 : farge === HVIT ? sp.hvit : 1 - sp.hvit);
  const erMaskin = (sp, farge) => sp.modus === "mobil" && farge !== sp.meg;
  const navnFor = (sp, farge) => (erMaskin(sp, farge) ? R.t("Mobilen") : sp.modus === "mobil" ? R.t("Du") : R.navn(spillerIndeks(sp, farge)));

  // The colour at the bottom of the board. Two players with «snu»: the side to move.
  let bunnVist = null; // what is on screen now (follows the wish with a delay after a move)
  function onsketBunn(S) {
    const sp = S.spill;
    let b = sp.modus === "mobil" ? sp.meg : sp.snu ? hentParti(S).pos.side : HVIT;
    if (sp.snudd) b ^= 1;
    return b;
  }

  // UI-only state (not saved)
  let valgt = -1; // selected square
  let animer = null; // { fra, til, rokade: [fra, til] } for the next draw
  let snuAnimasjon = false;
  let tenkStopp = null;
  let tenkerPa = "";
  let trekkId = null; // the phone's answer, waiting to be played
  let hint = null; // { fra, til } suggested to the player (against Lett)
  let hintStopp = null;
  let ventendeForfremming = null; // [moves] waiting for the promotion choice
  let ventendeDratt = false;
  let sluttId = null;
  let snuId = null;

  // ---------- Sounds ----------
  const lyd = {
    flytt: () => {
      R.lyd.stoy(0, 0.045, 0.2, 1700);
      R.lyd.tone(250, 0, 0.07, "sine", 0.16, 150);
    },
    slag: () => {
      R.lyd.stoy(0, 0.1, 0.32, 900);
      R.lyd.tone(200, 0, 0.12, "triangle", 0.2, 90);
    },
    sjakk: () => {
      R.lyd.tone(880, 0, 0.09, "square", 0.06);
      R.lyd.tone(1175, 0.09, 0.16, "square", 0.06);
    },
    rokade: () => {
      lyd.flytt();
      setTimeout(lyd.flytt, 110);
    },
    tap: () => {
      R.lyd.tone(392, 0, 0.22, "triangle", 0.13);
      R.lyd.tone(311, 0.2, 0.42, "triangle", 0.12);
    },
  };

  // ---------- Clocks (two players) ----------
  let klokkeFra = null; // performance.now() when the running clock started
  const klokkeKan = (S) => {
    const sp = S.spill;
    return !!(sp && sp.klokke && !sp.ferdig && sp.trekk.length > 0 && S.skjerm === "spill" && !document.hidden);
  };
  function igjenMs(S, farge) {
    const k = S.spill.klokke;
    let ms = k.igjen[farge];
    if (klokkeFra != null && farge === hentParti(S).pos.side) ms -= performance.now() - klokkeFra;
    return Math.max(0, ms);
  }
  function startKlokke(S) {
    if (klokkeFra == null && klokkeKan(S)) klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && S.spill;
    if (klokkeFra != null && sp && sp.klokke) {
      const side = hentParti(S).pos.side;
      sp.klokke.igjen[side] = Math.max(0, sp.klokke.igjen[side] - (performance.now() - klokkeFra));
    }
    klokkeFra = null;
  }
  const visKlokke = (ms) => {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  function tikk(S) {
    const sp = S.spill;
    if (!sp || !sp.klokke || S.skjerm !== "spill") return;
    for (const farge of [HVIT, SVART]) {
      const el = document.getElementById("sh-klokke-" + farge);
      if (!el) continue;
      const ms = igjenMs(S, farge);
      el.textContent = visKlokke(ms);
      el.classList.toggle("lite", ms < 20000 && ms > 0);
    }
    if (klokkeFra != null && !sp.ferdig) {
      const side = hentParti(S).pos.side;
      if (igjenMs(S, side) <= 0) tidenUte(S, side);
    }
  }
  function tidenUte(S, side) {
    stoppKlokke(S);
    const sp = S.spill;
    sp.klokke.igjen[side] = 0;
    const p = hentParti(S);
    avsluttParti(S, { vinner: Sjakk.kanSetteMatt(p.pos, side ^ 1) ? side ^ 1 : null, grunn: "tid", flagg: side });
    R.lyd.alarm();
    R.vibrer([200, 100, 200]);
    R.vis();
    tilSluttOm(1900);
  }
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill) return;
    if (document.hidden) {
      stoppKlokke(S);
      R.lagre();
    } else startKlokke(S);
  });

  // ---------- Playing moves ----------

  const kanFlytte = (S, p) => {
    const sp = S.spill;
    return !!sp && !sp.ferdig && !(sp.modus === "mobil" && p.pos.side !== sp.meg);
  };

  function spillTrekk(S, m, dratt) {
    const sp = S.spill;
    const p = hentParti(S);
    const fra = Sjakk.fra(m), til = Sjakk.til(m);
    const slag = !!p.pos.b[til] || Sjakk.art(m) === Sjakk.EP;
    const rokade = Sjakk.art(m) === Sjakk.ROKADE;
    const forfremmet = Sjakk.forfremming(m);
    const hvem = navnFor(sp, p.pos.side);
    stoppKlokke(S);
    Sjakk.spill(p, m);
    sp.trekk.push(Sjakk.uci(m));
    merkParti(S);
    valgt = -1;
    ventendeForfremming = null;
    stoppHint();
    // A dragged piece is already where it should be; only the rook of a castling slides.
    const tarn = rokade ? ((til & 7) === 6 ? [til + 1, til - 1] : [til - 2, til + 1]) : null;
    animer = dratt ? (tarn ? { fra: tarn[0], til: tarn[1], rokade: null } : null) : { fra, til, rokade: tarn };
    const st = Sjakk.status(p);
    if (st.sjakk) lyd.sjakk();
    else if (forfremmet) R.lyd.riktig();
    else if (slag) lyd.slag();
    else if (rokade) lyd.rokade();
    else lyd.flytt();
    R.vibrer(st.sjakk ? [18, 40, 18] : 10);
    R.si(`${hvem}: ${lesbar(p.san[p.san.length - 1])}${st.sjakk && !st.slutt ? `. ${R.t("Sjakk!")}` : ""}`);
    if (st.slutt) {
      avsluttParti(S, st);
      R.vis();
      tilSluttOm(st.grunn === "matt" ? 2100 : 1700);
      return;
    }
    // Two players with «snu»: turn the board when the move has landed — and only then start the
    // next player's clock (nobody can move while the board turns).
    const snur = sp.modus === "to" && onsketBunn(S) !== bunnVist;
    if (!snur) startKlokke(S);
    R.vis();
    if (st.sjakk) R.toast(R.t("Sjakk!"));
    if (snur) {
      clearTimeout(snuId);
      const fortsatt = R.vakt();
      snuId = setTimeout(() => {
        if (!fortsatt() || !R.S.spill || R.S.spill.ferdig) return;
        bunnVist = onsketBunn(R.S);
        snuAnimasjon = true;
        R.vis();
        snuId = setTimeout(() => fortsatt() && R.S.spill && !R.S.spill.ferdig && (startKlokke(R.S), R.vis()), R.rolig() ? 0 : 560);
      }, R.rolig() ? 150 : 520);
    }
    startTenking(S);
  }

  // Squares as text for screen readers: "Sf3" → "springer f3" (the notation has Norwegian letters)
  function lesbar(san) {
    const matt = san.endsWith("#") ? `, ${R.t("sjakkmatt")}` : "";
    if (san.startsWith("O-O-O")) return R.t("lang rokade") + matt;
    if (san.startsWith("O-O")) return R.t("kort rokade") + matt;
    const navn = { K: BRIKKENAVN[KONGE], D: BRIKKENAVN[DRONNING], T: BRIKKENAVN[TAARN], L: BRIKKENAVN[LOPER], S: BRIKKENAVN[SPRINGER] };
    let t = san.replace(/[+#]/g, "");
    const brikke = navn[t[0]] || BRIKKENAVN[BONDE];
    if (navn[t[0]]) t = t.slice(1);
    const felt = t.match(/[a-h][1-8]/g) || [];
    const mal = felt[felt.length - 1] || "";
    const om = t.includes("=") ? `, ${R.t("blir {brikke}", { brikke: navn[t.slice(-1)] || BRIKKENAVN[DRONNING] })}` : "";
    return `${t.includes("x") ? R.t("{brikke} slår på {felt}", { brikke, felt: mal }) : R.t("{brikke} til {felt}", { brikke, felt: mal })}${om}${matt}`;
  }

  function avsluttParti(S, st) {
    const sp = S.spill;
    stoppTenking();
    stoppKlokke(S);
    sp.resultat = { vinner: st.vinner, grunn: st.grunn, flagg: st.flagg != null ? st.flagg : null };
    sp.ferdig = true;
    valgt = -1;
    if (sp.modus === "mobil") {
      const r = S.rekord[sp.niva] || (S.rekord[sp.niva] = { seier: 0, remis: 0, tap: 0 });
      if (st.vinner == null) r.remis++;
      else if (st.vinner === sp.meg) {
        r.seier++;
        R.merke("klassiker-sjakkhesten");
      } else r.tap++;
    } else {
      const st2 = S.stilling;
      if (st.vinner == null) st2.remis++;
      else st2.seire[spillerIndeks(sp, st.vinner)]++;
    }
    R.statistikk("ferdig", {
      modus: sp.modus,
      niva: sp.modus === "mobil" ? sp.niva : 0,
      resultat: st.vinner == null ? "remis" : sp.modus === "mobil" ? (st.vinner === sp.meg ? "seier" : "tap") : st.vinner === HVIT ? "hvit" : "svart",
      grunn: st.grunn,
      trekk: Math.ceil(sp.trekk.length / 2),
    });
    R.lagre();
  }

  // Undo the score of a finished game (when «Angre» takes back the last move).
  function angreResultat(S) {
    const sp = S.spill;
    const res = sp.resultat;
    if (!res) return;
    if (sp.modus === "mobil") {
      const r = S.rekord[sp.niva];
      if (r) {
        if (res.vinner == null) r.remis = Math.max(0, r.remis - 1);
        else if (res.vinner === sp.meg) r.seier = Math.max(0, r.seier - 1);
        else r.tap = Math.max(0, r.tap - 1);
      }
    } else if (res.vinner == null) S.stilling.remis = Math.max(0, S.stilling.remis - 1);
    else {
      const i = spillerIndeks(sp, res.vinner);
      S.stilling.seire[i] = Math.max(0, S.stilling.seire[i] - 1);
    }
    sp.resultat = null;
    sp.ferdig = false;
  }

  function tilSluttOm(ms) {
    clearTimeout(sluttId);
    const fortsatt = R.vakt();
    sluttId = setTimeout(() => {
      if (fortsatt() && R.S.spill && R.S.spill.ferdig && R.S.skjerm === "spill") R.gaTil("slutt");
    }, R.rolig() ? 700 : ms);
  }

  // ---------- The phone's turn ----------

  function startTenking(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.modus !== "mobil" || S.skjerm !== "spill") return;
    const p = hentParti(S);
    if (p.pos.side === sp.meg) return;
    const nokkel = sp.id + ":" + sp.trekk.length;
    if ((tenkStopp || trekkId) && tenkerPa === nokkel) return; // already thinking about this position
    stoppTenking();
    tenkerPa = nokkel;
    const fortsatt = R.vakt();
    const start = performance.now();
    const gjelder = () => fortsatt() && R.S.spill && R.S.spill.id + ":" + R.S.spill.trekk.length === nokkel && !R.S.spill.ferdig;
    tenkStopp = Motor.tenk(p, Motor.valgFor(sp.niva, p), (svar) => {
      tenkStopp = null;
      if (!gjelder()) return;
      // The answer waits a moment (a move never comes faster than MIN_TENK); stoppTenking clears it.
      trekkId = setTimeout(() => {
        trekkId = null;
        if (!gjelder()) return;
        tenkerPa = "";
        const q = hentParti(R.S);
        const m = q.lovlige.includes(svar.trekk) ? svar.trekk : q.lovlige[0];
        spillTrekk(R.S, m);
      }, Math.max(0, MIN_TENK - (performance.now() - start)));
    });
  }
  function stoppTenking() {
    if (tenkStopp) tenkStopp();
    tenkStopp = null;
    clearTimeout(trekkId);
    trekkId = null;
    tenkerPa = "";
  }

  // How many half-moves «Angre» takes back now. Against the phone: your last move, and its answer
  // if it has answered — but never the phone's opening move when you play black (then it would
  // have to start all over and «Angre» would only make it think again).
  function angreAntall(S) {
    const sp = S.spill;
    const p = hentParti(S);
    const n = p.trekk.length;
    if (sp.modus !== "mobil") return n ? 1 : 0;
    let antall = Math.min(p.pos.side === sp.meg ? 2 : 1, n);
    if (sp.meg === SVART) antall = Math.min(antall, n - 1);
    return Math.max(0, antall);
  }
  const tenker = (S) => !!S.spill && !S.spill.ferdig && S.spill.modus === "mobil" && hentParti(S).pos.side !== S.spill.meg;

  // ---------- Help against Lett: pieces in danger and a hint ----------

  // Own pieces the other side can take for profit: not defended, or attacked by a cheaper piece.
  function iFare(pos, side) {
    const fiende = side ^ 1;
    const forSide = pos.side;
    pos.side = fiende;
    const slag = Sjakk.pseudo(pos, [], true);
    pos.side = forSide;
    const billigst = new Map();
    for (const m of slag) {
      const t = Sjakk.til(m);
      const offer = pos.b[t];
      if (!offer || offer >> 3 !== side) continue;
      const angriper = pos.b[Sjakk.fra(m)] & 7;
      const v = angriper === KONGE ? 10000 : Motor.VERDI[angriper];
      if (!billigst.has(t) || v < billigst.get(t)) billigst.set(t, v);
    }
    const ut = new Set();
    for (const [t, v] of billigst) {
      const offer = pos.b[t] & 7;
      if (offer === KONGE) continue;
      if (!Sjakk.angrepet(pos, t, side) || v < Motor.VERDI[offer]) ut.add(t);
    }
    return ut;
  }
  const hjelpVises = (S, p) => {
    const sp = S.spill;
    return sp.modus === "mobil" && sp.niva <= 2 && !sp.ferdig && p.pos.side === sp.meg;
  };
  function stoppHint() {
    if (hintStopp) hintStopp();
    hintStopp = null;
    hint = null;
  }

  // ---------- Markup ----------

  function brettHtml(S, p, o) {
    const sp = S.spill;
    const bunn = o.bunn;
    const sist = p.trekk.length ? p.trekk[p.trekk.length - 1] : 0;
    const sjakkRute = Sjakk.iSjakk(p.pos) ? p.pos.konge[p.pos.side] : -1;
    const fare = o.interaktiv && hjelpVises(S, p) ? iFare(p.pos, sp.meg) : new Set();
    const mal = new Map();
    if (o.interaktiv && valgt >= 0) for (const m of p.lovlige) if (Sjakk.fra(m) === valgt) mal.set(Sjakk.til(m), m);
    const fokus = valgt >= 0 ? valgt : sist ? Sjakk.til(sist) : bunn === HVIT ? 4 : 116;
    const ruter = [];
    for (let rr = 7; rr >= 0; rr--)
      for (let ff = 0; ff < 8; ff++) {
        const rad = bunn === HVIT ? rr : 7 - rr;
        const fil = bunn === HVIT ? ff : 7 - ff;
        const s = rad * 16 + fil;
        const brikke = p.pos.b[s];
        const lys = (rad + fil) % 2 === 1;
        const k = ["sh-rute", lys ? "lys" : "mork"];
        if (sist && (Sjakk.fra(sist) === s || Sjakk.til(sist) === s)) k.push("sist");
        if (s === valgt && o.interaktiv) k.push("valgt");
        if (mal.has(s)) k.push(brikke || Sjakk.art(mal.get(s)) === Sjakk.EP ? "mal slag" : "mal");
        if (s === sjakkRute) k.push("sjakk");
        if (fare.has(s)) k.push("fare");
        if (o.interaktiv && hint && (hint.fra === s || hint.til === s)) k.push("hint");
        let etikett = Sjakk.navn(s) + (brikke ? ": " + brikkeNavn(brikke) : "");
        if (s === valgt && o.interaktiv) etikett += ", " + R.t("valgt");
        if (mal.has(s)) etikett += ", " + (brikke ? R.t("kan slås") : R.t("mulig trekk"));
        if (fare.has(s)) etikett += ", " + R.t("i fare");
        if (o.interaktiv && hint && hint.fra === s) etikett += ", " + R.t("tips: flytt denne");
        if (o.interaktiv && hint && hint.til === s) etikett += ", " + R.t("tips: flytt hit");
        const koord = (rr === 0 ? `<span class="sh-koord fil" aria-hidden="true">${"abcdefgh"[fil]}</span>` : "") + (ff === 0 ? `<span class="sh-koord rad" aria-hidden="true">${rad + 1}</span>` : "");
        const innhold = koord + (brikke ? brikkeSvg(brikke) : "");
        ruter.push(
          o.interaktiv
            ? `<button class="${k.join(" ")}" data-h="rute" data-v="${Sjakk.navn(s)}" data-stille tabindex="${s === fokus ? 0 : -1}" aria-label="${esc(etikett)}"${s === valgt ? ' aria-pressed="true"' : ""}>${innhold}</button>`
            : `<span class="${k.join(" ")}">${innhold}</span>`,
        );
      }
    const stempel = o.stempel ? `<span class="sh-stempel" aria-hidden="true"><span class="stempel ${o.stempel.klasse}">${esc(o.stempel.tekst)}</span></span>` : "";
    return `<div class="sh-brett${o.liten ? " liten" : ""}${o.snu ? " snur" : ""}"${o.interaktiv ? ` role="group" aria-label="${esc(R.t("Sjakkbrettet"))}"` : ' aria-hidden="true"'}>${ruter.join("")}${stempel}</div>`;
  }

  // Captured pieces (by this side), smallest first, and the material lead.
  function fangstHtml(p, farge) {
    const fanget = p.slatt.filter((x) => x && x >> 3 !== farge).sort((a, b) => (a & 7) - (b & 7));
    let mat = [0, 0];
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const x = p.pos.b[s];
      if (x && (x & 7) !== KONGE) mat[x >> 3] += Motor.VERDI[x & 7];
    }
    const forsprang = Math.round((mat[farge] - mat[farge ^ 1]) / 100);
    if (!fanget.length && forsprang <= 0) return "";
    return `<span class="sh-fangst" aria-hidden="true">${fanget.map((x, i) => `${i && (fanget[i - 1] & 7) !== (x & 7) ? '<i class="sh-mellom"></i>' : ""}${brikkeSvg(x, "sh-fanget")}`).join("")}${forsprang > 0 ? `<b class="sh-forsprang">+${forsprang}</b>` : ""}</span>`;
  }

  // The moves so far in short notation (the edition's piece letters), the newest last.
  function loggHtml(p) {
    if (!p.san.length) return `<div class="sh-logg tom" aria-hidden="true"><span>${esc(R.t("Hvit begynner"))}</span></div>`;
    const rader = [];
    for (let i = 0; i < p.san.length; i += 2) {
      const siste = (n) => (n === p.san.length - 1 ? ' class="siste"' : "");
      rader.push(`<li><span class="nr">${i / 2 + 1}.</span><span${siste(i)}>${esc(visSan(p.san[i]))}</span>${p.san[i + 1] ? `<span${siste(i + 1)}>${esc(visSan(p.san[i + 1]))}</span>` : ""}</li>`);
    }
    return `<div class="sh-logg" aria-hidden="true"><ol>${rader.join("")}</ol></div>`;
  }

  function spillerHtml(S, p, farge, plass) {
    const sp = S.spill;
    const aktiv = !sp.ferdig && p.pos.side === farge;
    const maskin = erMaskin(sp, farge);
    const navn = navnFor(sp, farge);
    const merke = maskin ? `<span class="sh-maskin">${R.figur()}</span>` : R.avatar(spillerIndeks(sp, farge));
    const sjakk = aktiv && Sjakk.iSjakk(p.pos);
    let status;
    if (maskin && aktiv) status = `<span class="sh-tenker">${esc(R.t("Tenker"))}<i>.</i><i>.</i><i>.</i></span>`;
    else if (sjakk) status = `<span class="sh-sjakk">${esc(R.t("Sjakk!"))}</span>`;
    else if (aktiv) status = esc(R.t("Din tur"));
    else status = maskin ? esc(NIVANAVN[sp.niva]) : "";
    const ikon = `<span class="sh-farge${farge ? " svart" : ""}"><i aria-hidden="true"></i>${esc(FARGENAVN[farge])}</span>`;
    const klokke = sp.klokke ? `<span class="sh-klokke${aktiv && klokkeFra != null ? " gar" : ""}" id="sh-klokke-${farge}" role="timer" aria-label="${esc(farge ? R.t("Tid igjen for svart") : R.t("Tid igjen for hvit"))}">${visKlokke(igjenMs(S, farge))}</span>` : "";
    return `<div class="sh-spiller ${plass}${aktiv ? " aktiv" : ""}${sjakk ? " i-sjakk" : ""}">
      ${merke}
      <span class="sh-navn"><b>${esc(navn)}</b><small>${ikon}${status ? `<span class="sh-status">${status}</span>` : ""}</small></span>
      ${fangstHtml(p, farge) || "<span></span>"}
      ${klokke}
    </div>`;
  }

  // ---------- Board size: the whole board and the tools fit on the screen ----------
  function tilpass() {
    const brett = R.$(".skjerm-spill .sh-brett");
    if (!brett) return;
    const ramme = brett.parentElement;
    let b = Math.floor(Math.min(ramme.clientWidth, 760) / 8) * 8;
    brett.style.width = b + "px";
    for (let n = 0; n < 3; n++) {
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0 || b <= 232) break;
      b = Math.max(232, Math.floor((b - over) / 8) * 8);
      brett.style.width = b + "px";
    }
    const logg = R.$(".sh-logg");
    if (logg) {
      logg.scrollLeft = logg.scrollWidth;
      logg.scrollTop = logg.scrollHeight;
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(tilpass);
  });

  // Slide the piece that just moved from its old square (and the rook in castling).
  function spillAnimasjon(rot) {
    const a = animer;
    animer = null;
    if (!a || R.rolig()) return;
    const flytt = (fra, til) => {
      const el = rot.querySelector(`.sh-rute[data-v="${Sjakk.navn(til)}"] .sh-brikke`);
      const fraEl = rot.querySelector(`.sh-rute[data-v="${Sjakk.navn(fra)}"]`);
      const tilEl = rot.querySelector(`.sh-rute[data-v="${Sjakk.navn(til)}"]`);
      if (!el || !fraEl || !tilEl) return;
      const f = fraEl.getBoundingClientRect(), t = tilEl.getBoundingClientRect();
      el.style.willChange = "transform"; // a layer only for the piece that moves
      el.style.transition = "none";
      el.style.transform = `translate(${f.left - t.left}px, ${f.top - t.top}px)`;
      el.style.zIndex = "3";
      void el.offsetWidth;
      el.style.transition = "transform 0.22s cubic-bezier(0.3, 0.7, 0.3, 1)";
      el.style.transform = "";
      setTimeout(() => {
        el.style.zIndex = "";
        el.style.transition = "";
        el.style.willChange = "";
      }, 260);
    };
    flytt(a.fra, a.til);
    if (a.rokade) flytt(a.rokade[0], a.rokade[1]);
  }

  // ---------- Drag and drop (taps work too) ----------
  let dra = null;
  let draSlutt = 0;
  function rutePa(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest(".skjerm-spill .sh-rute[data-v]") : null;
  }
  document.addEventListener("pointerdown", (e) => {
    const S = R.S;
    const ruteEl = e.target.closest && e.target.closest(".skjerm-spill .sh-rute[data-v]");
    if (!ruteEl || !S || S.skjerm !== "spill" || !S.spill || e.button > 0) return;
    const p = hentParti(S);
    if (!kanFlytte(S, p)) return;
    const s = Sjakk.rute(ruteEl.dataset.v);
    const brikke = p.pos.b[s];
    if (!brikke || brikke >> 3 !== p.pos.side) return;
    dra = { s, x: e.clientX, y: e.clientY, id: e.pointerId, aktiv: false, el: null, kilde: ruteEl };
  });
  document.addEventListener("pointermove", (e) => {
    if (!dra || e.pointerId !== dra.id) return;
    const dx = e.clientX - dra.x, dy = e.clientY - dra.y;
    if (!dra.aktiv) {
      if (dx * dx + dy * dy < 64) return;
      dra.aktiv = true;
      if (valgt !== dra.s) {
        valgt = dra.s;
        R.vis();
      }
      const kilde = R.$(`.skjerm-spill .sh-rute[data-v="${Sjakk.navn(dra.s)}"]`);
      const svg = kilde && kilde.querySelector(".sh-brikke");
      if (!svg) {
        dra = null;
        return;
      }
      const b = kilde.getBoundingClientRect();
      const el = svg.cloneNode(true);
      el.classList.add("sh-svever");
      el.style.width = el.style.height = b.width * 1.25 + "px";
      document.body.appendChild(el);
      svg.style.opacity = "0.25";
      dra.el = el;
      dra.str = b.width * 1.25;
    }
    dra.el.style.transform = `translate(${e.clientX - dra.str / 2}px, ${e.clientY - dra.str * 0.75}px)`;
    const over = rutePa(e.clientX, e.clientY);
    R.$$(".skjerm-spill .sh-rute.over").forEach((x) => x !== over && x.classList.remove("over"));
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
    if (over && S && S.spill) {
      const p = hentParti(S);
      const til = Sjakk.rute(over.dataset.v);
      const trekk = p.lovlige.filter((m) => Sjakk.fra(m) === d.s && Sjakk.til(m) === til);
      if (trekk.length && kanFlytte(S, p)) {
        utfor(S, trekk, true);
        return;
      }
    }
    R.vis(); // back on its square, still selected
  }
  document.addEventListener("pointerup", (e) => slippDra(e, false));
  document.addEventListener("pointercancel", (e) => slippDra(e, true));

  // One move (or four, when a pawn promotes: ask which piece first).
  function utfor(S, trekk, draget) {
    if (trekk.length > 1) {
      ventendeForfremming = trekk;
      ventendeDratt = !!draget;
      const farge = hentParti(S).pos.side;
      if (draget) R.vis();
      R.ark(`
        <h2 id="ark-tittel">${esc(R.t("Hva skal bonden bli?"))}</h2>
        <div class="sh-forfrem">${[DRONNING, TAARN, LOPER, SPRINGER]
          .map((t) => `<button class="sh-forfrem-valg" data-h="forfrem" data-v="${t}">${brikkeSvg(t | (farge << 3), "sh-forfrem-brikke")}<span>${esc(BRIKKENAVN[t][0].toUpperCase() + BRIKKENAVN[t].slice(1))}</span></button>`)
          .join("")}</div>
        <button class="lenke" data-h="lukk-ark">${esc(R.t("Avbryt"))}</button>`);
      return;
    }
    spillTrekk(S, trekk[0], draget);
  }

  // ---------- Keyboard on the board: arrows move between squares ----------
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("sh-rute") || !el.dataset.v) return;
    const steg = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!steg) return;
    e.preventDefault();
    const S = R.S;
    const bunn = bunnVist == null ? onsketBunn(S) : bunnVist;
    const retning = bunn === HVIT ? 1 : -1;
    const s = Sjakk.rute(el.dataset.v);
    const fil = (s & 7) + steg[0] * retning;
    const rad = (s >> 4) + steg[1] * retning;
    if (fil < 0 || fil > 7 || rad < 0 || rad > 7) return;
    const ny = R.$(`.sh-rute[data-v="${Sjakk.navn(rad * 16 + fil)}"]`);
    if (ny) {
      el.tabIndex = -1;
      ny.tabIndex = 0;
      ny.focus();
    }
  });

  // ---------- Game setup ----------

  function nyttSpill(S, forrige) {
    const o = S.oppsett;
    const sp = {
      id: R.nyttFro() % 1e9,
      modus: o.modus,
      niva: o.niva,
      meg: o.farge === "svart" ? SVART : o.farge === "hvit" ? HVIT : R.nyttFro() % 2,
      // Two players take turns with white: player 1 first, then the other one each game.
      hvit: forrige && forrige.modus === "to" ? 1 - forrige.hvit : 0,
      trekk: [],
      klokke: o.modus === "to" && o.klokke ? { min: o.klokke, igjen: [o.klokke * 60000, o.klokke * 60000] } : null,
      snu: o.modus === "to" && !!o.snu,
      snudd: false,
      resultat: null,
      ferdig: false,
      registrert: false,
    };
    if (o.modus === "to" && (!forrige || forrige.modus !== "to")) S.stilling = { seire: [0, 0], remis: 0 };
    S.spill = sp;
    parti = null;
    valgt = -1;
    bunnVist = null;
    animer = null;
    stoppTenking();
    stoppHint();
    Motor.nullstill(); // the engine's memory holds draw scores for the side it played last time
    klokkeFra = null;
    R.statistikk("start", { modus: sp.modus, niva: sp.modus === "mobil" ? sp.niva : 0, klokke: sp.klokke ? sp.klokke.min : 0 });
  }

  function resultatTekst(S) {
    const sp = S.spill;
    const r = sp.resultat || {};
    const p = hentParti(S);
    const n = Math.ceil(sp.trekk.length / 2);
    const vinner = r.vinner;
    const taper = vinner == null ? null : vinner ^ 1;
    const navnV = vinner == null ? "" : navnFor(sp, vinner);
    let tittel;
    if (vinner == null) tittel = R.t("Remis!");
    else if (sp.modus === "mobil") tittel = vinner === sp.meg ? R.t("Du vinner!") : R.t("Mobilen vinner!");
    else tittel = R.t("{navn} vinner!", { navn: navnV });
    // One sentence per colour, so every language can say «White's king» its own way.
    const grunner = {
      matt: [R.t("Sjakkmatt"), taper === SVART ? R.t("Kongen til svart står i sjakk og kan ikke komme unna.") : R.t("Kongen til hvit står i sjakk og kan ikke komme unna.")],
      patt: [R.t("Patt"), p.pos.side === SVART ? R.t("Svart kan ikke flytte, men står ikke i sjakk. Da blir det remis.") : R.t("Hvit kan ikke flytte, men står ikke i sjakk. Da blir det remis.")],
      gjentakelse: [R.t("Tre like stillinger"), R.t("Den samme stillingen kom tre ganger. Da blir det remis.")],
      femti: [R.t("50-trekksregelen"), R.t("50 trekk på rad uten slag eller bondetrekk. Da blir det remis.")],
      materiell: [R.t("For få brikker"), R.t("Ingen av dere har nok brikker igjen til å sette matt.")],
      tid: [
        R.t("Tiden er ute"),
        vinner == null
          ? r.flagg === SVART
            ? R.t("Klokka til svart gikk ut, men hvit har for få brikker til å sette matt.")
            : R.t("Klokka til hvit gikk ut, men svart har for få brikker til å sette matt.")
          : taper === SVART
            ? R.t("Klokka til svart gikk ut.")
            : R.t("Klokka til hvit gikk ut."),
      ],
      oppgitt: [R.t("Ga opp"), sp.modus === "mobil" ? R.t("Du ga opp partiet.") : R.t("{navn} ga opp.", { navn: navnFor(sp, taper) })],
      enige: [R.t("Remis"), R.t("Dere ble enige om remis.")],
    };
    let [etikett, forklaring] = grunner[r.grunn] || [R.t("Ferdig"), ""];
    // Warm words after a loss against the phone.
    if (sp.modus === "mobil" && vinner != null && vinner !== sp.meg) forklaring += " " + (sp.niva > 1 ? R.t("Godt kjempa! Prøv igjen – eller velg et lettere nivå.") : R.t("Godt kjempa! Prøv igjen."));
    return { tittel, etikett: `${etikett} · ${R.flertall(n, "trekk", "trekk")}`, forklaring };
  }

  function partietHtml(p) {
    if (!p.san.length) return "";
    const par = [];
    for (let i = 0; i < p.san.length; i += 2) par.push(`<li><span>${esc(visSan(p.san[i]))}</span><span>${esc(visSan(p.san[i + 1] || ""))}</span></li>`);
    return `<details class="sh-partiet"><summary>${esc(R.t("Se alle trekkene"))}</summary><ol>${par.join("")}</ol></details>`;
  }

  function rekordHtml(S, niva) {
    const r = S.rekord[niva];
    if (!r || !(r.seier + r.remis + r.tap)) return "";
    return `<span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span><span><b>${r.remis}</b> ${esc(R.t("remis|remis", { n: r.remis }))}</span><span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span>`;
  }

  const SPRINGER_IKON = `<svg class="sh-knappebrikke" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#sh-12"/></svg>`;

  R.start({
    id: "sjakkhesten",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "mobil", niva: 2, farge: "hvit", klokke: 0, snu: true },
      nivaer4: true,
      spill: null,
      rekord: {},
      stilling: { seire: [0, 0], remis: 0 },
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "mobil", niva: 2, farge: "hvit", klokke: 0, snu: true }, S.oppsett));
      if (!["mobil", "to"].includes(o.modus)) o.modus = "mobil";
      // Saved with three levels (Lett, Middels, Vanskelig): the old Lett is now Nybegynner, and
      // Middels and Vanskelig move one step up. Records follow their level.
      if (!S.nivaer4) {
        const ny = { 1: 1, 2: 3, 3: 4 };
        if (ny[o.niva]) o.niva = ny[o.niva];
        if (S.spill && ny[S.spill.niva]) S.spill.niva = ny[S.spill.niva];
        if (S.rekord && typeof S.rekord === "object") {
          const gml = S.rekord;
          S.rekord = {};
          for (const [n, r] of Object.entries(gml)) if (ny[n]) S.rekord[ny[n]] = r;
        }
        S.nivaer4 = true;
      }
      if (!NIVAER.includes(o.niva)) o.niva = 2;
      if (!["hvit", "svart", "tilfeldig"].includes(o.farge)) o.farge = "hvit";
      if (!KLOKKER.includes(o.klokke)) o.klokke = 0;
      o.snu = !!o.snu;
      S.antall = 2;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      if (!S.stilling || !Array.isArray(S.stilling.seire)) S.stilling = { seire: [0, 0], remis: 0 };
      const sp = S.spill;
      if (sp && (!Array.isArray(sp.trekk) || !["mobil", "to"].includes(sp.modus) || !Sjakk.lastParti(Sjakk.START, sp.trekk))) S.spill = null;
      if (S.spill && S.spill.klokke && !(Array.isArray(S.spill.klokke.igjen) && S.spill.klokke.igjen.length === 2)) S.spill.klokke = null;
      if (!S.spill && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && !S.spill.ferdig) S.skjerm = "spill";
      if (S.spill && S.skjerm === "spill" && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Sjakk for to på samme mobil – eller mot mobilen på fire nivåer. Den som setter kongen matt, vinner."),
      steg: [
        [R.t("Flytt en brikke"), R.t("Trykk på en brikke. Prikkene viser hvor den kan gå. Trykk på ruta du vil til – eller dra brikka dit.")],
        [R.t("Slå brikker"), R.t("Flytt til en rute med en av motstanderens brikker, så er den slått. En ring viser hva du kan slå.")],
        [R.t("Sett kongen matt"), R.t("Står kongen i sjakk uten å kunne komme unna, er det sjakkmatt – og partiet er vunnet.")],
      ],
      tips: [
        R.t("Rokade: Har verken kongen eller tårnet flyttet, kan kongen gå to ruter mot tårnet – og tårnet hopper over kongen."),
        R.t("En passant: Går en bonde to ruter fram og havner ved siden av en av motstanderens bønder, kan den slås som om den bare gikk én rute – men bare i trekket rett etter."),
        R.t("Kommer en bonde helt fram, velger du hva den skal bli – som oftest en dronning."),
        R.t("Remis (uavgjort): patt, samme stilling tre ganger, 50 trekk uten slag eller bondetrekk, eller for få brikker igjen."),
        R.t("Mot mobilen på nybegynner og lett viser røde ringer brikkene dine som kan bli slått, og «Tips» foreslår et trekk."),
        R.t("Trykket feil? «Angre» tar tilbake trekket."),
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
              slagordHtml: `${esc(R.t("Tenk et trekk fram."))}<br><em>${esc(R.t("Sett kongen sjakkmatt!"))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? R.t("Fortsett · trekk {n}", { n: Math.floor(sp.trekk.length / 2) + 1 }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–2", R.t("spillere")],
                ["4", R.t("nivåer")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="sh-rekorder" aria-label="${esc(R.t("Mot mobilen"))}"><p class="etikett">${esc(R.t("Mot mobilen"))}</p><ul>${rek.map(([n, h]) => `<li><b class="sh-niva">${esc(NIVANAVN[n])}</b>${h}</li>`).join("")}</ul></section>` : "")
          );
        },
        inn() {
          leggInnSymboler();
          R.slippVaken();
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const mot = o.modus === "mobil";
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan vil du spille?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "mobil", ikon: "🤖", tittel: R.t("Mot mobilen"), tekst: R.t("Fire nivåer") },
                  { v: "to", ikon: "👥", tittel: R.t("To spillere"), tekst: R.t("På samme mobil") },
                ],
                o.modus,
              )}
            </section>
            ${
              mot
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(NIVATEKST[o.niva])}</p>
                  </section>
                  <section class="seksjon">
                    <h2>${esc(R.t("Du spiller med"))}</h2>
                    ${R.ui.seg("farge", [["hvit", FARGENAVN[HVIT]], ["svart", FARGENAVN[SVART]], ["tilfeldig", R.t("Tilfeldig")]], o.farge, { etikett: R.t("Farge") })}
                    <p class="hjelp">${esc(R.t("Hvit begynner."))}</p>
                  </section>`
                : `${R.ui.spillere({ min: 2, max: 2, tittel: R.t("Spillerne"), hjelp: R.t("Spiller 1 begynner med hvit. Dere bytter farge for hvert parti.") })}
                  <section class="seksjon">
                    <h2>${esc(R.t("Sjakklokke"))}</h2>
                    ${R.ui.seg("klokke", KLOKKER.map((m) => [m, m ? R.t("{n} min", { n: m }) : R.t("Av")]), o.klokke, { etikett: R.t("Sjakklokke") })}
                    <p class="hjelp">${esc(o.klokke ? R.t("Hver av dere har {n} minutter på hele partiet. Klokka starter når hvit har flyttet.", { n: o.klokke }) : R.t("Uten klokke tenker dere så lenge dere vil."))}</p>
                  </section>
                  ${R.ui.bryter("snu", o.snu, R.t("Snu brettet for hver tur"), R.t("Den som skal flytte, har alltid sine brikker nederst."))}`
            }
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: SPRINGER_IKON }))}`;
        },
        inn: () => leggInnSymboler(),
      },

      spill: {
        tittel: (S) => (S.spill.modus === "mobil" ? R.t("Mot mobilen") : R.t("To spillere")),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const p = hentParti(S);
          if (bunnVist == null) bunnVist = onsketBunn(S);
          const bunn = bunnVist;
          const st = Sjakk.status(p);
          const tur = navnFor(sp, p.pos.side);
          const stempel = sp.ferdig ? stempelFor(sp) : null;
          const snu = snuAnimasjon && !R.rolig();
          snuAnimasjon = false;
          const kanAngre = angreAntall(S) > 0;
          const medHint = sp.modus === "mobil" && sp.niva <= 2;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Sjakk: {status}", { status: sp.ferdig ? R.t("partiet er ferdig") : `${sp.modus === "mobil" && !erMaskin(sp, p.pos.side) ? R.t("din tur") : R.t("{navn} sin tur", { navn: tur })}${st.sjakk ? ", " + R.t("sjakk") : ""}` }))}</h1>
            <span class="sh-luft" aria-hidden="true"></span>
            ${spillerHtml(S, p, bunn ^ 1, "topp")}
            <div class="sh-brettramme">${brettHtml(S, p, { bunn, interaktiv: !sp.ferdig, stempel, snu })}</div>
            ${spillerHtml(S, p, bunn, "bunn")}
            ${loggHtml(p)}
            <span class="sh-luft under" aria-hidden="true"></span>
            ${R.ui.dokk(`<div class="sh-verktoy">
              <button class="knapp-2 liten" data-h="angre"${kanAngre && !sp.ferdig ? "" : " disabled"}><span class="ikon" aria-hidden="true">↶</span>${esc(R.t("Angre"))}</button>
              ${
                medHint
                  ? `<button class="knapp-2 liten" data-h="hint"${hjelpVises(S, p) && !hintStopp ? "" : " disabled"}><span class="ikon" aria-hidden="true">💡</span>${esc(R.t("Tips"))}</button>`
                  : `<button class="knapp-2 liten" data-h="snu" aria-pressed="${!!sp.snudd}"><span class="ikon" aria-hidden="true">⇅</span>${esc(R.t("Snu"))}</button>`
              }
              <button class="lenke" data-h="avslutt"${sp.ferdig ? " disabled" : ""}>${esc(R.t("Avslutt"))}</button>
            </div>`)}`;
        },
        etter(S, rot) {
          tilpass();
          spillAnimasjon(rot);
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          leggInnSymboler();
          bunnVist = onsketBunn(S);
          R.holdVaken();
          startKlokke(S);
          startTenking(S);
          const id = setInterval(() => tikk(R.S), 250);
          R.vedForlat(() => clearInterval(id));
          R.vis();
        },
        ut(S) {
          stoppTenking();
          stoppHint();
          stoppKlokke(S);
          clearTimeout(sluttId);
          clearTimeout(snuId);
          valgt = -1;
          dra = null;
          R.$$(".sh-svever").forEach((el) => el.remove());
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const p = hentParti(S);
          const t = resultatTekst(S);
          const r = sp.resultat || {};
          const vant = r.vinner != null && (sp.modus === "to" || r.vinner === sp.meg);
          const figur = sp.modus === "to" && r.vinner != null ? `<span class="sh-vinner">${R.avatar(spillerIndeks(sp, r.vinner), "gigant")}<span class="sh-krone" aria-hidden="true">👑</span></span>` : R.figur();
          let poeng = "";
          if (sp.modus === "to") {
            const rader = [0, 1].map((i) => ({ i, poeng: S.stilling.seire[i] }));
            poeng = `<section class="seksjon sh-stilling" aria-label="${esc(R.t("Stillingen"))}">
                <div class="seksjon-hode"><h2>${esc(R.t("Stillingen"))}</h2><span class="tall">${S.stilling.remis ? esc(R.flertall(S.stilling.remis, "remis", "remis")) : ""}</span></div>
                ${R.ui.poengliste(rader)}
              </section>`;
          } else {
            const rek = rekordHtml(S, sp.niva);
            poeng = rek ? `<p class="sh-rekordlinje"><span class="etikett">${esc(R.t("Mot mobilen · {niva}", { niva: NIVANAVN[sp.niva].toLowerCase() }))}</span>${rek}</p>` : "";
          }
          const kanAngre = sp.modus === "mobil" && ["matt", "patt", "gjentakelse", "femti", "materiell"].includes(r.grunn) && p.trekk.length > (sp.meg === SVART ? 1 : 0);
          return `
            <div class="banner ${vant || r.vinner == null ? "aksent" : ""} sh-banner">
              ${figur}
              <p class="etikett">${esc(t.etikett)}</p>
              <h1 id="skjerm-tittel">${esc(t.tittel)}</h1>
              ${t.forklaring ? `<p class="ingress">${esc(t.forklaring)}</p>` : ""}
            </div>
            <div class="sh-sluttbrett">${brettHtml(S, p, { bunn: sp.modus === "mobil" ? sp.meg : HVIT, interaktiv: false, liten: true })}</div>
            ${poeng}
            ${partietHtml(p)}
            ${R.ui.flereSpill({ antall: sp.modus === "to" ? 2 : 1 })}
            ${R.ui.dokk(
              R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: SPRINGER_IKON }),
              R.ui.lenkerad(kanAngre ? R.ui.lenke(`↶ ${R.t("Angre")}`, "angre") : "", R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
            )}`;
        },
        inn(S) {
          leggInnSymboler();
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          const r = sp.resultat || {};
          if (sp.modus === "to" && !sp.registrert) {
            sp.registrert = true;
            R.kveld.registrer([0, 1].map((i) => ({ i, poeng: r.vinner == null ? 0 : spillerIndeks(sp, r.vinner) === i ? 1 : 0 })));
            R.lagre();
          }
          if (r.vinner != null && (sp.modus === "to" || r.vinner === sp.meg)) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else if (r.vinner == null) R.lyd.pling();
          else lyd.tap();
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
      farge(el, e, S) {
        S.oppsett.farge = el.dataset.v;
        R.vis();
      },
      klokke(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.klokke = KLOKKER.includes(m) ? m : 0;
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
        snuAnimasjon = true;
        R.lyd.snu();
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S, null);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        const forrige = S.spill;
        nyttSpill(S, forrige);
        R.gaTil("spill");
      },
      rute(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || performance.now() - draSlutt < 150) return;
        const p = hentParti(S);
        if (!kanFlytte(S, p)) {
          if (tenker(S)) R.toast(R.t("Vent litt – mobilen tenker"));
          return;
        }
        const s = Sjakk.rute(el.dataset.v);
        const brikke = p.pos.b[s];
        if (valgt >= 0) {
          const trekk = p.lovlige.filter((m) => Sjakk.fra(m) === valgt && Sjakk.til(m) === s);
          if (trekk.length) return utfor(S, trekk, false);
        }
        if (brikke && brikke >> 3 === p.pos.side) {
          valgt = valgt === s ? -1 : s;
          if (valgt >= 0 && !p.lovlige.some((m) => Sjakk.fra(m) === s)) {
            R.toast(Sjakk.iSjakk(p.pos) ? R.t("Kongen står i sjakk – den må reddes først") : R.t("{brikke} kan ikke flytte nå", { brikke: BESTEMT[brikke & 7] }));
            valgt = -1;
          } else R.lyd.klikk();
          R.vis();
          return;
        }
        if (valgt >= 0 || brikke) {
          if (valgt >= 0 && Sjakk.iSjakk(p.pos)) R.toast(R.t("Kongen står i sjakk – den må reddes først"));
          valgt = -1;
          R.vis();
        }
      },
      forfrem(el, e, S) {
        const t = Number(el.dataset.v);
        const trekk = (ventendeForfremming || []).find((m) => Sjakk.forfremming(m) === t);
        const dratt = ventendeDratt;
        ventendeForfremming = null;
        R.lukkArk();
        const p = S.spill && hentParti(S);
        if (trekk && p && p.lovlige.includes(trekk) && kanFlytte(S, p)) spillTrekk(S, trekk, dratt);
      },
      // Against Lett: the phone suggests a good move (it thinks like Middels for a moment).
      hint(el, e, S) {
        const sp = S.spill;
        if (!sp || hintStopp) return;
        const p = hentParti(S);
        if (!hjelpVises(S, p)) return;
        const fortsatt = R.vakt();
        const nokkel = sp.id + ":" + sp.trekk.length;
        hintStopp = Motor.tenk(p, Object.assign({}, Motor.NIVA[3], { stoy: 0, tid: 700 }), (svar) => {
          hintStopp = null;
          if (!fortsatt() || !R.S.spill || R.S.spill.id + ":" + R.S.spill.trekk.length !== nokkel) return;
          const q = hentParti(R.S);
          if (!q.lovlige.includes(svar.trekk)) return R.vis();
          hint = { fra: Sjakk.fra(svar.trekk), til: Sjakk.til(svar.trekk) };
          valgt = -1;
          R.lyd.pling();
          R.vis();
          const tekst = lesbar(Sjakk.san(q.pos, svar.trekk, q.lovlige));
          R.toast(R.t("Tips: {trekk}", { trekk: tekst }));
          R.si(R.t("Tips: {trekk}", { trekk: tekst }));
        });
        R.vis();
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const p = hentParti(S);
        const varFerdig = sp.ferdig;
        if (varFerdig && (sp.modus !== "mobil" || ["tid", "oppgitt", "enige"].includes(sp.resultat && sp.resultat.grunn))) return;
        // Against the phone: take back its answer and your own move, so it is your turn again.
        // Decided before anything is stopped: with nothing to take back, the phone thinks on.
        const n = angreAntall(S);
        if (n <= 0) return;
        stoppTenking();
        stoppHint();
        clearTimeout(sluttId);
        clearTimeout(snuId);
        if (varFerdig) angreResultat(S);
        stoppKlokke(S);
        for (let i = 0; i < n; i++) {
          Sjakk.tilbake(p);
          sp.trekk.pop();
        }
        merkParti(S);
        valgt = -1;
        animer = null;
        bunnVist = onsketBunn(S);
        R.lyd.snu();
        R.toast(n === 2 ? R.t("Angret – din tur igjen") : R.t("Angret"));
        if (varFerdig) {
          R.gaTil("spill");
          return;
        }
        startKlokke(S);
        R.vis();
        startTenking(S);
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        let st = null;
        if (sp.modus === "mobil") {
          // The phone stops thinking while the sheet is open, and thinks on after «Spill videre».
          stoppTenking();
          const ja = await R.bekreft(R.t("Gi opp partiet?"), R.t("Mobilen vinner dette partiet. Du kan alltid starte et nytt."), R.t("Gi opp"), R.t("Spill videre"));
          if (!fortsatt() || S.spill !== sp || sp.ferdig) return;
          if (!ja) return startTenking(S);
          st = { vinner: sp.meg ^ 1, grunn: "oppgitt" };
        } else {
          const v = await R.velgIArk(
            R.t("Avslutte partiet?"),
            [
              { v: "remis", tekst: R.t("Vi blir enige om remis") },
              { v: "hvit", tekst: R.t("{navn} (hvit) gir opp", { navn: navnFor(sp, HVIT) }) },
              { v: "svart", tekst: R.t("{navn} (svart) gir opp", { navn: navnFor(sp, SVART) }) },
            ],
            R.t("Resultatet telles i stillingen."),
          );
          if (!v || !fortsatt()) return;
          st = v === "remis" ? { vinner: null, grunn: "enige" } : { vinner: v === "hvit" ? SVART : HVIT, grunn: "oppgitt" };
        }
        if (!S.spill || S.spill.ferdig) return;
        avsluttParti(S, st);
        R.gaTil("slutt");
      },
    }),
  });

  function stempelFor(sp) {
    const r = sp.resultat || {};
    if (r.grunn === "matt") return { tekst: R.t("Sjakkmatt!"), klasse: "aksent" };
    if (r.grunn === "tid") return { tekst: R.t("Tiden er ute!"), klasse: "" };
    if (r.vinner == null && r.grunn !== "enige") return { tekst: R.t("Remis!"), klasse: "lampe" };
    return null;
  }
})();
