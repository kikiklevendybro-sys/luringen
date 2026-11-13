/* Skilpadda — mahjong solitaire («mahjong-kabal») for one player.
   Tiles lie in layers. Tap two matching tiles that are free (nothing on top, and the left or the
   right side open) and they go. Clear the whole board. Five layouts, from the quick «Hytta» to the
   classic 144-tile turtle; hints from a small solver, undo without limit, and a shuffle when no
   pair is left (it adds 30 s to the time and is shown on the result). «Dagens brett»: the same
   board for everyone on the edition's day.

   ---------- How a deal is made (always solvable) ----------
   Whether a tile is free depends only on which places are still taken, never on the faces. So a
   deal is built «backwards»: from the full layout, take two places that are both free right now,
   note them as a pair, and go on until the board is empty (a run that gets stuck with fewer than
   two free places starts again from the same seed). Then every noted pair gets two matching faces.
   Playing the pairs in the noted order clears the board, so every deal has a solution – the
   player still has to find it (four of each face, and the wrong two can lock the board).
   A shuffle does the same with the places and faces that are left.
   The rules (MJ) are pure functions at the top; test/skilpadda.test.mjs loads this file without
   the kit (node:vm) and checks them. Never change a layout once published: saved games and the
   daily boards refer to its places by number. */
(function () {
  "use strict";

  const MJ = (() => {
    // ---------- Random numbers (the kit's generator, kept here so a daily board never changes) ----------
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
    function stokk(liste, tilf) {
      for (let i = liste.length - 1; i > 0; i--) {
        const j = Math.floor(tilf() * (i + 1));
        [liste[i], liste[j]] = [liste[j], liste[i]];
      }
      return liste;
    }

    // ---------- The tiles ----------
    // Three suits 1–9 (r rings, b bamboo, k crowns), four arrows (p1 north, p2 east, p3 south,
    // p4 west), three pictures (d1 sun, d2 moon, d3 mountain): four of each. Four flowers (f) and
    // four seasons (a), one of each: any flower matches any flower, any season any season.
    const SLAG = [];
    for (const s of ["r", "b", "k"]) for (let n = 1; n <= 9; n++) SLAG.push(s + n);
    for (let n = 1; n <= 4; n++) SLAG.push("p" + n);
    for (let n = 1; n <= 3; n++) SLAG.push("d" + n);
    const BLOMSTER = ["f1", "f2", "f3", "f4"];
    const ARSTIDER = ["a1", "a2", "a3", "a4"];
    const ALLE = SLAG.concat(BLOMSTER, ARSTIDER);
    const KJENT = new Set(ALLE);
    const gruppe = (k) => (k[0] === "f" || k[0] === "a" ? k[0] : k);
    const passer = (a, b) => KJENT.has(a) && KJENT.has(b) && gruppe(a) === gruppe(b);

    // `antall` pairs (72 = the whole set of 144 tiles), in random order. A board always gets all
    // four tiles of a face, so which two to take first is a real choice everywhere.
    function parBunke(tilf, antall = 72) {
      const firere = SLAG.map((k) => [k, k, k, k]).concat([stokk(BLOMSTER.slice(), tilf), stokk(ARSTIDER.slice(), tilf)]);
      stokk(firere, tilf);
      const par = [];
      for (const f of firere) {
        if (par.length < antall) par.push([f[0], f[1]]);
        if (par.length < antall) par.push([f[2], f[3]]);
      }
      return stokk(par, tilf);
    }

    // ---------- The layouts ----------
    // A place is [x, y, z] in half tiles: the tile covers x … x+2 and y … y+2 on layer z.
    // felt(): a block of whole tiles, b wide and h high, from column c0 and row r0.
    function felt(l, c0, r0, b, h, z) {
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + b; c++) l.push([2 * c, 2 * r, z]);
    }
    const TEGNING = {
      // 44 tiles, 6 × 4: a quick round – a low cabin with a ridge on the roof
      hytta(l) {
        felt(l, 0, 0, 6, 4, 0);
        felt(l, 0, 1, 6, 2, 1);
        felt(l, 1, 1, 4, 2, 2);
      },
      // 84 tiles, 6 × 8: made for a phone held upright – a wide band with a peak in the middle
      fjellet(l) {
        felt(l, 0, 0, 6, 8, 0);
        felt(l, 0, 2, 6, 4, 1);
        felt(l, 1, 3, 4, 2, 2);
        felt(l, 2, 3, 2, 2, 3);
      },
      // 92 tiles, 10 × 6: a castle with four towers and a keep
      borgen(l) {
        felt(l, 0, 0, 10, 6, 0);
        for (const [c, r] of [[0, 0], [8, 0], [0, 4], [8, 4]]) felt(l, c, r, 2, 2, 1);
        felt(l, 3, 2, 4, 2, 1);
        for (const [x, y] of [[1, 1], [17, 1], [1, 9], [17, 9]]) l.push([x, y, 2]);
        felt(l, 4, 2, 2, 2, 2);
      },
      // 116 tiles, 7 × 9: a tall tower in four floors
      tarnet(l) {
        felt(l, 0, 0, 7, 9, 0);
        felt(l, 0, 2, 7, 5, 1);
        felt(l, 1, 3, 5, 3, 2);
        felt(l, 2, 4, 3, 1, 3);
      },
      // 144 tiles, 15 × 8: the classic turtle – a pyramid of five layers, a head and a tail
      skilpadda(l) {
        felt(l, 1, 0, 12, 1, 0);
        felt(l, 3, 1, 8, 1, 0);
        felt(l, 2, 2, 10, 1, 0);
        felt(l, 1, 3, 12, 2, 0);
        felt(l, 2, 5, 10, 1, 0);
        felt(l, 3, 6, 8, 1, 0);
        felt(l, 1, 7, 12, 1, 0);
        l.push([0, 7, 0], [26, 7, 0], [28, 7, 0]);
        felt(l, 4, 1, 6, 6, 1);
        felt(l, 5, 2, 4, 4, 2);
        felt(l, 6, 3, 2, 2, 3);
        l.push([13, 7, 4]);
      },
    };
    const OPPSETT = ["hytta", "fjellet", "borgen", "tarnet", "skilpadda"];

    // The geometry of a layout: places in reading order (row, column, layer), and for each place
    // the tiles on top of it, under it, and touching it on the left and on the right.
    const GEO = Object.create(null);
    function geo(id) {
      if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(TEGNING, id)) return null;
      if (GEO[id]) return GEO[id];
      const pos = [];
      TEGNING[id](pos);
      return (GEO[id] = lagGeo(pos, id));
    }
    function lagGeo(pos, id) {
      pos = pos.map((p) => p.slice());
      pos.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
      const n = pos.length;
      const over = [];
      const under = [];
      const venstre = [];
      const hoyre = [];
      for (let i = 0; i < n; i++) over.push([]), under.push([]), venstre.push([]), hoyre.push([]);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const dx = pos[j][0] - pos[i][0];
          const dy = pos[j][1] - pos[i][1];
          const dz = pos[j][2] - pos[i][2];
          if (Math.abs(dy) >= 2) continue;
          if (dz > 0 && Math.abs(dx) < 2) {
            over[i].push(j);
            under[j].push(i);
          } else if (dz === 0 && dx === -2) venstre[i].push(j);
          else if (dz === 0 && dx === 2) hoyre[i].push(j);
        }
      let b = 0;
      let h = 0;
      let lag = 0;
      for (const [x, y, z] of pos) {
        b = Math.max(b, x + 2);
        h = Math.max(h, y + 2);
        lag = Math.max(lag, z + 1);
      }
      return { id, n, pos, over, under, venstre, hoyre, b, h, lag };
    }

    // A tile is free when nothing lies on it and one of its sides (left or right) is open.
    function ledig(g, borte, i) {
      if (borte[i]) return false;
      for (const j of g.over[i]) if (!borte[j]) return false;
      let apen = true;
      for (const j of g.venstre[i])
        if (!borte[j]) {
          apen = false;
          break;
        }
      if (apen) return true;
      for (const j of g.hoyre[i]) if (!borte[j]) return false;
      return true;
    }
    function frie(g, borte) {
      const ut = [];
      for (let i = 0; i < g.n; i++) if (ledig(g, borte, i)) ut.push(i);
      return ut;
    }
    // Every pair of free tiles that match.
    function parene(g, borte, ansikt) {
      const f = frie(g, borte);
      const ut = [];
      for (let a = 0; a < f.length; a++) for (let b = a + 1; b < f.length; b++) if (passer(ansikt[f[a]], ansikt[f[b]])) ut.push([f[a], f[b]]);
      return ut;
    }
    const igjen = (borte) => borte.reduce((n, v) => n + (v ? 0 : 1), 0);

    // ---------- Making a deal ----------
    // A free place, drawn with a lean towards the high layers (a stack taken from the top never
    // ends as a lone tower with one free tile).
    function trekk(liste, g, tilf) {
      let sum = 0;
      for (const i of liste) sum += 1 + 2 * g.pos[i][2];
      let r = tilf() * sum;
      for (const i of liste) {
        r -= 1 + 2 * g.pos[i][2];
        if (r < 0) return i;
      }
      return liste[liste.length - 1];
    }
    // One way to empty the places `plasser` two by two, each pair free at its turn – or null.
    function rekkefolge(g, plasser, tilf) {
      const borte = new Uint8Array(g.n).fill(1);
      for (const i of plasser) borte[i] = 0;
      const orden = [];
      let rest = plasser.length;
      while (rest > 0) {
        const f = [];
        for (const i of plasser) if (ledig(g, borte, i)) f.push(i);
        if (f.length < 2) return null;
        const a = trekk(f, g, tilf);
        const b = trekk(
          f.filter((x) => x !== a),
          g,
          tilf,
        );
        orden.push([a, b]);
        borte[a] = 1;
        borte[b] = 1;
        rest -= 2;
      }
      return orden;
    }
    // A new deal of layout `id` from a seed: the faces of every place, and the solution it was built from.
    function delUt(id, fro) {
      const g = geo(id);
      if (!g) return null;
      const tilf = rng(fro >>> 0);
      const alle = Array.from({ length: g.n }, (_, i) => i);
      let orden = null;
      for (let f = 0; f < 500 && !orden; f++) orden = rekkefolge(g, alle, tilf);
      if (!orden) throw new Error("Ingen løsbar deling for " + id);
      const par = parBunke(tilf, g.n / 2);
      const ansikt = new Array(g.n);
      orden.forEach(([a, b], k) => {
        ansikt[a] = par[k][0];
        ansikt[b] = par[k][1];
      });
      return { ansikt, losning: orden };
    }
    // The tiles that are left, laid out again so they can be cleared (same faces, new places).
    // Null when no order of the places that are left can empty them (two tiles on top of each other).
    function stokkOm(g, borte, ansikt, fro) {
      const plasser = [];
      for (let i = 0; i < g.n; i++) if (!borte[i]) plasser.push(i);
      const grupper = new Map();
      for (const i of plasser) {
        const k = gruppe(ansikt[i]);
        if (!grupper.has(k)) grupper.set(k, []);
        grupper.get(k).push(ansikt[i]);
      }
      const par = [];
      for (const l of grupper.values()) {
        if (l.length % 2) return null;
        for (let i = 0; i < l.length; i += 2) par.push([l[i], l[i + 1]]);
      }
      const tilf = rng(fro >>> 0);
      for (let f = 0; f < 300; f++) {
        const orden = rekkefolge(g, plasser, tilf);
        if (!orden) continue;
        stokk(par, tilf);
        const ny = ansikt.slice();
        orden.forEach(([a, b], k) => {
          ny[a] = par[k][0];
          ny[b] = par[k][1];
        });
        return { ansikt: ny, losning: orden };
      }
      return null;
    }

    // ---------- The solver (for hints) ----------
    // Depth first with a memory of dead positions. A group whose remaining tiles are all free is
    // taken at once (that can never hurt); otherwise the pairs that open up the most go first.
    // maks: positions to look at. Returns { vei } (a way to the end), or { vei: null, bevist }
    // where bevist says the search went through everything (no way exists).
    const ZA = new Int32Array(256);
    const ZB = new Int32Array(256);
    {
      const t = rng(0x5eed1e);
      for (let i = 0; i < 256; i++) {
        ZA[i] = (t() * 4294967296) | 0;
        ZB[i] = (t() * 4294967296) | 0;
      }
    }
    function los(g, borte0, ansikt, maks = 20000) {
      const n = g.n;
      const borte = Uint8Array.from(borte0);
      const rest = new Map();
      let ha = 0;
      let hb = 0;
      let mangler = 0;
      for (let i = 0; i < n; i++) {
        if (borte[i]) {
          ha ^= ZA[i];
          hb ^= ZB[i];
          continue;
        }
        mangler++;
        const k = gruppe(ansikt[i]);
        rest.set(k, (rest.get(k) || 0) + 1);
      }
      const dode = new Set();
      const vei = [];
      let noder = 0;
      let grense = 0;
      let brutt = false;
      let stoy = null;
      const verdi = (i) => {
        let v = g.pos[i][2] * 2;
        for (const j of g.under[i]) if (!borte[j]) v += 3;
        for (const j of g.venstre[i]) if (!borte[j]) v += 1;
        for (const j of g.hoyre[i]) if (!borte[j]) v += 1;
        return v;
      };
      function rek() {
        if (mangler === 0) return true;
        if (++noder > grense) {
          brutt = true;
          return false;
        }
        const nokkel = (ha >>> 0) * 2097152 + (hb >>> 11);
        if (dode.has(nokkel)) return false;
        // Dead for sure: the last two of a group, one of them on top of the other.
        const siste = new Map();
        for (let i = 0; i < n; i++)
          if (!borte[i]) {
            const k = gruppe(ansikt[i]);
            if (rest.get(k) !== 2) continue;
            const j = siste.get(k);
            if (j === undefined) siste.set(k, i);
            else if (g.over[i].includes(j) || g.over[j].includes(i)) {
              dode.add(nokkel);
              return false;
            }
          }
        const fri = new Map();
        for (let i = 0; i < n; i++)
          if (ledig(g, borte, i)) {
            const k = gruppe(ansikt[i]);
            if (!fri.has(k)) fri.set(k, []);
            fri.get(k).push(i);
          }
        let valg = [];
        for (const [k, l] of fri) {
          if (l.length < 2) continue;
          if (l.length === rest.get(k)) {
            valg = [[l[0], l[1]]];
            break;
          }
          for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) valg.push([l[a], l[b]]);
        }
        if (valg.length > 1) {
          const v = new Map();
          const av = (i) => (v.has(i) ? v.get(i) : (v.set(i, verdi(i) + (stoy ? stoy() * 6 : 0)), v.get(i)));
          valg.sort((p, q) => av(q[0]) + av(q[1]) - av(p[0]) - av(p[1]));
        }
        for (const [a, b] of valg) {
          const k = gruppe(ansikt[a]);
          borte[a] = 1;
          borte[b] = 1;
          ha ^= ZA[a] ^ ZA[b];
          hb ^= ZB[a] ^ ZB[b];
          mangler -= 2;
          rest.set(k, rest.get(k) - 2);
          vei.push([a, b]);
          if (rek()) return true;
          vei.pop();
          borte[a] = 0;
          borte[b] = 0;
          ha ^= ZA[a] ^ ZA[b];
          hb ^= ZB[a] ^ ZB[b];
          mangler += 2;
          rest.set(k, rest.get(k) + 2);
          if (brutt) return false;
        }
        dode.add(nokkel);
        return false;
      }
      // Short runs that grow, each with a little noise in the order (a search that has wandered into
      // a big dead end starts again elsewhere); what was proven dead stays dead between the runs.
      let brukt = 0;
      for (let forsok = 0; brukt < maks; forsok++) {
        grense = Math.min(maks - brukt, 1500 * 2 ** forsok);
        noder = 0;
        brutt = false;
        stoy = forsok ? rng(0x9e3779b1 + forsok) : null;
        const ok = rek();
        brukt += noder;
        if (ok) return { vei, bevist: false, noder: brukt };
        if (!brutt) return { vei: null, bevist: true, noder: brukt };
      }
      return { vei: null, bevist: false, noder: brukt };
    }

    // The pairs of a known solution that are still on the board – if they can still be played in
    // that order from here (the player may have paired the tiles differently). Null otherwise.
    function folg(g, borte0, ansikt, losning) {
      const borte = Uint8Array.from(borte0);
      const igjenPar = losning.filter(([a, b]) => !borte[a] && !borte[b]);
      if (igjenPar.length * 2 !== igjen(borte)) return null;
      for (const [a, b] of igjenPar) {
        if (!ledig(g, borte, a) || !ledig(g, borte, b) || !passer(ansikt[a], ansikt[b])) return null;
        borte[a] = 1;
        borte[b] = 1;
      }
      return igjenPar;
    }

    // ---------- «Dagens brett» ----------
    // The layout and the seed come from the date alone: the same board on every phone.
    const DAG_OPPSETT = ["fjellet", "borgen"];
    function dagens(dato) {
      return { brett: DAG_OPPSETT[fnv(`skilpadda:${dato}`) % DAG_OPPSETT.length], fro: fnv(`skilpadda:${dato}:deling`) };
    }

    // ---------- A saved game ----------
    // The removed tiles of a game, replayed from its history ([a, b] = a pair taken, { s: faces }
    // = a shuffle, with the faces before it). Null when anything does not add up.
    function spillAv(id, ansikt, hist) {
      const g = geo(id);
      // A whole board: known faces, and every group an even number of times.
      const godt = (a) => {
        if (!Array.isArray(a) || a.length !== (g && g.n) || !a.every((k) => KJENT.has(k))) return false;
        const t = new Map();
        for (const k of a) t.set(gruppe(k), (t.get(gruppe(k)) || 0) + 1);
        return [...t.values()].every((n) => n % 2 === 0);
      };
      if (!g || !godt(ansikt) || !Array.isArray(hist)) return null;
      const borte = new Uint8Array(g.n);
      for (const h of hist) {
        if (Array.isArray(h)) {
          const [a, b] = h;
          if (h.length !== 2 || !Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0 || a >= g.n || b >= g.n) return null;
          if (!ledig(g, borte, a) || !ledig(g, borte, b) || !passer(ansikt[a], ansikt[b])) return null;
          borte[a] = 1;
          borte[b] = 1;
        } else if (!h || typeof h !== "object" || !godt(h.s)) return null;
      }
      return borte;
    }

    return { fnv, rng, SLAG, BLOMSTER, ARSTIDER, ALLE, gruppe, passer, parBunke, OPPSETT, geo, lagGeo, ledig, frie, parene, igjen, rekkefolge, delUt, stokkOm, los, folg, DAG_OPPSETT, dagens, spillAv };
  })();

  // ---------- The faces (own drawings, viewBox 30 × 40) ----------
  // Suits: a big number and a symbol – a ring, a bamboo stick, a crown – so a suit never rests on
  // its colour alone. Arrows point the way of the wind. Flowers have a solid frame, seasons a dashed one.
  const BLEKK = "#170e2b";
  const LYS = "#fff7e6";
  const SORT_FARGE = { r: "#1f66a8", b: "#0f6e54", k: "#b3202a" };
  const r1 = (v) => Math.round(v * 10) / 10;
  function stjerne(cx, cy, r, antall, start) {
    const ut = [];
    for (let k = 0; k < antall; k++) {
      const v = start + (k * 2 * Math.PI) / antall;
      ut.push([r1(cx + Math.cos(v) * r), r1(cy + Math.sin(v) * r), v]);
    }
    return ut;
  }
  function tegnFjes(k) {
    const t = k[0];
    const n = Number(k.slice(1));
    if (t === "r" || t === "b" || t === "k") {
      const c = SORT_FARGE[t];
      const tall = `<text x="15" y="19.6" font-size="18.5" text-anchor="middle" fill="${c}">${n}</text>`;
      if (t === "r") return `${tall}<circle cx="15" cy="29.6" r="5.3" fill="none" stroke="${c}" stroke-width="2.8"/><circle cx="15" cy="29.6" r="1.6" fill="${c}"/>`;
      if (t === "b") return `${tall}<rect x="12.6" y="22.8" width="4.8" height="13.6" rx="2.2" fill="${c}"/><path d="M12.6 27.3h4.8M12.6 31.7h4.8" stroke="${LYS}" stroke-width="1.3"/>`;
      return `${tall}<path d="M8.3 35.6 7.5 25.2l4.3 3.9L15 23l3.2 6.1 4.3-3.9-.8 10.4Z" fill="${c}"/>`;
    }
    if (t === "p")
      return `<g transform="rotate(${(n - 1) * 90} 15 20)"><circle cx="15" cy="20" r="10.6" fill="none" stroke="${BLEKK}" stroke-width="1.8"/><path d="M15 28.4V12.6M9.6 18.2 15 12.4l5.4 5.8" fill="none" stroke="${BLEKK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    if (t === "d") {
      if (n === 1)
        return `<circle cx="15" cy="20" r="5.8" fill="#e8590c"/><path d="${stjerne(15, 20, 8.4, 8, 0)
          .map(([x, y, v]) => `M${x} ${y}L${r1(15 + Math.cos(v) * 12)} ${r1(20 + Math.sin(v) * 12)}`)
          .join("")}" stroke="#e8590c" stroke-width="2.4" stroke-linecap="round"/>`;
      if (n === 2) return `<path d="M20 9.8A10.4 10.4 0 1 0 24 29.2 8.6 8.6 0 1 1 20 9.8Z" transform="matrix(1.18 0 0 1.18 -3.1 -3.6)" fill="#5b3cc4"/>`;
      return `<path d="M3.4 31.4 13 12.2l4.4 8.6 3.4-4.6 6.8 15.2Z" fill="#2b5f86"/><path d="m13 12.2 3.2 6.3-1.9-1-1.3 1.9-1.4-1.8-1.9.9Z" fill="${LYS}"/>`;
    }
    if (t === "f") {
      const [blader, c, rx] = [
        [5, "#d6336c", 2.6],
        [6, "#e8590c", 2.4],
        [4, "#7048e8", 2.9],
        [8, "#1c7ed6", 1.9],
      ][n - 1];
      let s = `<rect x="2" y="2" width="26" height="36" rx="3.6" fill="none" stroke="#e64980" stroke-width="1.3"/><path d="M15 20.5V35" stroke="#2b8a3e" stroke-width="2" stroke-linecap="round"/><path d="M15 30.2c2.8-3.6 6.2-4 7.6-2.8-1.6 2.8-4.4 3.8-7.6 2.8Z" fill="#2b8a3e"/>`;
      for (let b = 0; b < blader; b++) s += `<ellipse cx="15" cy="10.6" rx="${rx}" ry="4.3" transform="rotate(${r1((b * 360) / blader)} 15 15)" fill="${c}"/>`;
      return s + `<circle cx="15" cy="15" r="2.4" fill="#ffd43b" stroke="${BLEKK}" stroke-width=".6"/>`;
    }
    const ramme = `<rect x="2" y="2" width="26" height="36" rx="3.6" fill="none" stroke="#0c8599" stroke-width="1.3" stroke-dasharray="2.6 1.8"/>`;
    if (n === 1)
      return `${ramme}<path d="M15 34V21" stroke="#2b8a3e" stroke-width="2.2" stroke-linecap="round"/><path d="M15 24.6C9.6 25 6 21.6 6 15.6c5.6-.2 9 3.4 9 9Z" fill="#2b8a3e"/><path d="M15 21.6c.2-5.8 3.6-9.4 9.2-9.6.2 6-3.4 9.6-9.2 9.6Z" fill="#40c057"/><path d="M8.4 34.6h13.2" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/>`;
    if (n === 2)
      return `${ramme}<path d="M15 35.4c-6.4-2.6-9.4-9.4-7.6-13.6 1.4-3.2 5.2-3.6 7.6-2 2.4-1.6 6.2-1.2 7.6 2 1.8 4.2-1.2 11-7.6 13.6Z" fill="#e03131"/><g fill="#ffe066"><ellipse cx="11.6" cy="24.4" rx=".8" ry="1.1"/><ellipse cx="18.4" cy="24.4" rx=".8" ry="1.1"/><ellipse cx="15" cy="27.4" rx=".8" ry="1.1"/><ellipse cx="12.4" cy="30" rx=".8" ry="1.1"/><ellipse cx="17.6" cy="30" rx=".8" ry="1.1"/></g><path d="M8.6 20.4 11.4 16l1.8 2.6L15 14.4l1.8 4.2 1.8-2.6 2.8 4.4c-2.2 1.2-4.2.8-6.4-.8-2.2 1.6-4.2 2-6.4.8Z" fill="#2b8a3e"/>`;
    if (n === 3)
      return `${ramme}<path d="M15 35.4v-6" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/><path d="M15 30C7 27.6 5.4 17 15 6.4 24.6 17 23 27.6 15 30Z" fill="#e8590c"/><path d="M15 28.4V11M15 21l-4.2-4M15 21l4.2-4M15 25.4l-4.6-3.4M15 25.4l4.6-3.4" stroke="${LYS}" stroke-width="1.1" stroke-linecap="round" fill="none"/>`;
    // Winter: a snowflake – six arms with a little V near each tip.
    let d = "";
    for (const [x, y, v] of stjerne(15, 20, 10.8, 6, -Math.PI / 2)) {
      d += `M15 20L${x} ${y}`;
      const mx = 15 + Math.cos(v) * 6.6;
      const my = 20 + Math.sin(v) * 6.6;
      for (const s of [-0.85, 0.85]) d += `M${r1(mx)} ${r1(my)}l${r1(Math.cos(v + s) * 3.2)} ${r1(Math.sin(v + s) * 3.2)}`;
    }
    return `${ramme}<path d="${d}" stroke="#1c7ed6" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
  }

  const R = window.Rusj;
  if (!R) {
    window.Skilpadda = { MJ, tegnFjes };
    return;
  }
  const esc = R.esc;

  // ---------- Words ----------
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const STRAFF = 30; // seconds added to the time for each shuffle
  const BRETT_NAVN = { hytta: R.t("Hytta"), fjellet: R.t("Fjellet"), borgen: R.t("Borgen"), tarnet: R.t("Tårnet"), skilpadda: R.t("Skilpadda") };
  const BRETT_OM = {
    hytta: R.t("En kjapp runde"),
    fjellet: R.t("Passer fint på mobilen"),
    borgen: R.t("Bred borg med fire tårn"),
    tarnet: R.t("Høyt og langt"),
    skilpadda: R.t("Den klassiske – best på stor skjerm eller med mobilen på siden"),
  };
  const SLAG_NAVN = {
    p1: R.t("Pil nord"),
    p2: R.t("Pil øst"),
    p3: R.t("Pil sør"),
    p4: R.t("Pil vest"),
    d1: R.t("Sol"),
    d2: R.t("Måne"),
    d3: R.t("Fjell"),
    f1: R.t("Blomst, rosa"),
    f2: R.t("Blomst, oransje"),
    f3: R.t("Blomst, lilla"),
    f4: R.t("Blomst, blå"),
    a1: R.t("Årstid, vår"),
    a2: R.t("Årstid, sommer"),
    a3: R.t("Årstid, høst"),
    a4: R.t("Årstid, vinter"),
  };
  function navnPa(k) {
    const n = Number(k.slice(1));
    if (k[0] === "r") return R.t("Ring {n}", { n });
    if (k[0] === "b") return R.t("Bambus {n}", { n });
    if (k[0] === "k") return R.t("Krone {n}", { n });
    return SLAG_NAVN[k] || k;
  }
  // The game's name and address in this edition.
  const SPILLNAVN = () => (window.RUSJ_SPILL || {}).navn || "Skilpadda"; // sprak-ok: the build gives each edition its own name
  const DEL_URL = `https://rusj.no${R.forside}${(window.RUSJ_SPILL || {}).slug || "skilpadda"}/`;

  const IKON = {
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
    stokk: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 7h3.5c4.5 0 6.5 10 11 10H21M3 17h3.5c2 0 3.4-2 4.6-4.3M21 7h-3.5c-2 0-3.4 2-4.6 4.3"/><path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/></svg>',
    slutt: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    klokke: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>',
    hake: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  // ---------- The game state ----------
  // S.fri: free play, S.dag: today's daily; S.modus says which one is on the table.
  // A game: { brett, fro, dag, dato, ansikt (faces now), hist, tid (ms), startet, ferdig, vunnet,
  //           trekk, hint, stokk, angre, talt, resultat }

  let H; // the actions, so one can call another
  let G = null; // the geometry of the board on the screen
  let borte = null; // the removed tiles of the board on the screen (Uint8Array)
  let valgt = -1; // the selected tile
  let hintPar = null;
  let hintId = null;
  let laast = false; // the board is cleared and the result is on its way: no input
  let klokkeFra = null; // performance.now() when the clock last started
  let inn = null; // tiles that come back (undo): they fade in on the next drawing
  let stokket = false; // the faces were just shuffled: the board shimmers once

  const aktiv = (S) => (S.modus === "dag" ? S.dag : S.fri);
  const erDagens = (sp) => !!(sp && sp.dag != null);
  const iGang = (sp) => !!(sp && !sp.ferdig && sp.startet);
  const dagensSpill = (S) => (S.dag && S.dag.dag === R.dag().nr ? S.dag : null);
  const tomStat = () => ({ spilt: 0, vunnet: 0, rekke: 0, besteRekke: 0, besteTid: 0 });
  const tomDagstat = () => ({ sist: 0, rekke: 0, beste: 0, lost: 0 });
  // Days in a row with today's board cleared; the streak lives until a whole day is skipped.
  const dagRekke = (S) => (S.dstat.sist >= R.dag().nr - 1 ? S.dstat.rekke : 0);
  const tatt = (sp) => sp.hist.reduce((n, h) => n + (Array.isArray(h) ? 2 : 0), 0);

  const tidMs = (sp) => sp.tid + (klokkeFra != null && R.S && sp === aktiv(R.S) ? performance.now() - klokkeFra : 0);
  const sekunder = (sp) => Math.floor(tidMs(sp) / 1000) + sp.stokk * STRAFF;
  function startKlokke(S) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || !sp.startet || klokkeFra != null || document.hidden || S.skjerm !== "spill") return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = aktiv(S);
    if (sp && klokkeFra != null) sp.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }

  // The layout for a first visit: the turtle on a big screen, the castle on a phone on its side,
  // the mountain on a phone held upright.
  function standardBrett() {
    const w = window.innerWidth || 390;
    const h = window.innerHeight || 844;
    if (w >= 700 && h >= 560) return "skilpadda";
    return w > h ? "borgen" : "fjellet";
  }

  function nyttSpill(brett, fro, d) {
    const deling = MJ.delUt(brett, fro);
    return { brett, fro, dag: d ? d.nr : null, dato: d ? d.tekst : null, ansikt: deling.ansikt, hist: [], tid: 0, startet: false, ferdig: false, vunnet: false, trekk: 0, hint: 0, stokk: 0, angre: 0, talt: false, resultat: null };
  }
  // Free play: a new deal of the chosen layout (the game left behind counts as not cleared).
  function nyttFritt(S) {
    if (iGang(S.fri)) registrer(S, false, S.fri);
    S.fri = nyttSpill(S.oppsett.brett, R.nyttFro(), null);
    S.modus = "fri";
    R.statistikk("start", { brett: S.fri.brett, dagens: false });
  }
  // Today's daily: the board (new or under way) – or the result once it is cleared.
  function apneDagens(S) {
    const d = R.dag();
    if (!dagensSpill(S)) {
      const { brett, fro } = MJ.dagens(d.tekst);
      S.dag = nyttSpill(brett, fro, d);
      R.statistikk("start", { brett, dagens: true });
    }
    S.modus = "dag";
    return S.dag.ferdig ? "slutt" : "spill";
  }

  // Count a game (once): a clear, or a started free game that was left for a new one.
  function registrer(S, vant, sp = aktiv(S)) {
    if (!sp || sp.talt || (!vant && (!sp.startet || erDagens(sp)))) return null;
    sp.talt = true;
    const sek = Math.max(1, Math.round(sp.tid / 1000)) + sp.stokk * STRAFF;
    if (erDagens(sp)) {
      const d = S.dstat;
      if (d.sist !== sp.dag) {
        d.rekke = d.sist === sp.dag - 1 ? d.rekke + 1 : 1;
        d.sist = sp.dag;
        d.lost += 1;
        d.beste = Math.max(d.beste, d.rekke);
      }
      sp.resultat = { vunnet: true, sek, hint: sp.hint, stokk: sp.stokk, rekke: d.rekke };
      meldDagens(S);
    } else {
      const s = (S.stat[sp.brett] = Object.assign(tomStat(), S.stat[sp.brett] || {}));
      const res = { vunnet: vant, sek, hint: sp.hint, stokk: sp.stokk, nyTid: false, forste: false, forrige: s.besteTid };
      s.spilt += 1;
      if (vant) {
        s.vunnet += 1;
        s.rekke += 1;
        s.besteRekke = Math.max(s.besteRekke, s.rekke);
        res.nyTid = !!s.besteTid && sek < s.besteTid;
        res.forste = !s.besteTid;
        s.besteTid = s.besteTid ? Math.min(s.besteTid, sek) : sek;
      } else s.rekke = 0;
      res.rekke = s.rekke;
      sp.resultat = res;
    }
    R.statistikk("ferdig", { vunnet: vant, sek, brett: sp.brett, hint: sp.hint, stokk: sp.stokk, dagens: erDagens(sp) });
    return sp.resultat;
  }

  // The front page's «I dag» strip (rusj/DAGLIG.md): cleared today, or how far the daily has come.
  function meldDagens(S) {
    const sp = dagensSpill(S);
    if (!sp) return;
    if (sp.ferdig && sp.vunnet && sp.resultat) R.dagligFerdig({ vunnet: true, rekke: dagRekke(S), res: R.formaterTid(sp.resultat.sek) });
    else if (sp.startet && tatt(sp) > 0) R.dagligIGang({ tekst: R.t("{n} av {alle}", { n: tatt(sp), alle: sp.ansikt.length }) });
  }

  // ---------- Dates and the countdown to the next daily ----------

  const datoLang = (dato) => {
    try {
      return new Intl.DateTimeFormat(R.lokale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(dato + "T12:00:00Z"));
    } catch (e) {
      return dato;
    }
  };
  const datoKort = (dato) => R.t("{dag}.{maned}.", { dag: Number(dato.slice(8)), maned: Number(dato.slice(5, 7)) });
  const manedKort = (dato) => {
    try {
      return new Intl.DateTimeFormat(R.lokale, { month: "short", timeZone: "UTC" }).format(new Date(dato + "T12:00:00Z")).replace(".", "");
    } catch (e) {
      return dato.slice(5, 7);
    }
  };
  const ukedag = (dato) => {
    try {
      const u = new Intl.DateTimeFormat(R.lokale, { weekday: "long", timeZone: "UTC" }).format(new Date(dato + "T12:00:00Z"));
      return u[0].toLocaleUpperCase(R.lokale) + u.slice(1);
    } catch (e) {
      return "";
    }
  };
  function sekunderTilNy() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: R.tidssone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(na))
      .forEach((p) => (deler[p.type] = Number(p.value)));
    let ut = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const dag = R.dag(new Date(na)).nr;
    // The two nights a year the clocks change, the day is 23 or 25 hours long.
    if (R.dag(new Date(na + ut * 1000)).nr === dag) ut += 3600;
    else if (ut > 3600 && R.dag(new Date(na + (ut - 3600) * 1000)).nr !== dag) ut -= 3600;
    return Math.max(1, ut);
  }
  const klokkeTekst = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const nedtellingHtml = () => `<p class="sp-nedtelling">${esc(R.t("Nytt brett om"))} <b>${klokkeTekst(sekunderTilNy())}</b></p>`;
  function startNedtelling() {
    const dag = R.dag().nr;
    const id = setInterval(() => {
      const el = R.$(".sp-nedtelling b");
      if (!el) return clearInterval(id);
      if (R.dag().nr !== dag) {
        clearInterval(id);
        return R.vis();
      }
      el.textContent = klokkeTekst(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(id));
  }

  // ---------- Drawing the board ----------

  const FJES = Object.create(null);
  const fjesSvg = (k) => FJES[k] || (FJES[k] = `<svg viewBox="0 0 30 40" aria-hidden="true" focusable="false">${tegnFjes(k)}</svg>`);
  const etikett = (k, fri) => (fri ? navnPa(k) : R.t("{navn}, låst", { navn: navnPa(k) }));

  function brikkeHtml(sp, i, fri) {
    const [x, y, z] = G.pos[i];
    const k = sp.ansikt[i];
    const kl = `sp-b${fri ? "" : " last"}${i === valgt ? " valgt" : ""}${hintPar && hintPar.includes(i) ? " hint" : ""}${inn && inn.includes(i) ? " inn" : ""}${stokket ? " stokket" : ""}`;
    return `<button class="${kl}" data-h="brikke" data-v="${i}" data-stille style="--x:${x};--y:${y};--z:${z};z-index:${z * 100 + x + y + 1}" aria-pressed="${i === valgt}" aria-label="${esc(etikett(k, fri))}"${fri ? "" : ' aria-disabled="true" tabindex="-1"'}>${fjesSvg(k)}</button>`;
  }
  function brettHtml(sp) {
    let ut = "";
    for (let i = 0; i < G.n; i++) if (!borte[i]) ut += brikkeHtml(sp, i, MJ.ledig(G, borte, i));
    return ut;
  }

  // The size of a tile: as big as the free area allows (whole pixels), the board centred in it.
  const FORHOLD = 1.3; // height / width of a tile
  const LAGSKYV = 0.12; // each layer moves up and left by this part of a tile's width
  function tilpass() {
    const flate = R.$(".sp-flate");
    const brett = R.$(".sp-brett");
    if (!flate || !brett || !G) return;
    const W = flate.clientWidth;
    const Ht = flate.clientHeight;
    const kol = G.b / 2;
    const rad = G.h / 2;
    const ekstra = LAGSKYV * G.lag + 0.02;
    let tw = Math.min(W / (kol + ekstra), Ht / (rad * FORHOLD + ekstra), 78);
    tw = Math.max(12, Math.floor(tw));
    const th = Math.round(tw * FORHOLD);
    const d = Math.max(2, Math.round(tw * LAGSKYV));
    const st = brett.style;
    st.setProperty("--tw", tw + "px");
    st.setProperty("--th", th + "px");
    st.setProperty("--hx", tw / 2 + "px");
    st.setProperty("--hy", th / 2 + "px");
    st.setProperty("--d", d + "px");
    st.setProperty("--mz", String(G.lag - 1));
    st.width = Math.ceil(kol * tw + d * G.lag) + "px";
    st.height = Math.ceil(rad * th + d * G.lag) + "px";
    brett.classList.toggle("liten", tw < 30);
  }

  const hudIgjen = (sp) => {
    const n = sp.ansikt.length - tatt(sp);
    return `<b>${n}</b> ${esc(R.t("brikke|brikker", { n }))}`;
  };
  const hudPar = (p) => `<b>${p}</b> ${esc(R.t("ledig par|ledige par", { n: p }))}`;

  // When no pair is free: shuffle (if the tiles that are left can be cleared at all), undo, or start again.
  function stoppHtml(S, sp) {
    const kan = !!MJ.stokkOm(G, borte, sp.ansikt, 1);
    return `<div class="sp-stoppkort">
        <h2>${esc(R.t("Ingen ledige par"))}</h2>
        <p>${esc(kan ? R.t("Stokk om brikkene som er igjen, eller angre noen trekk.") : R.t("Brikkene som er igjen, kan ikke ryddes uansett hvordan de ligger. Angre noen trekk."))}</p>
        ${kan ? R.ui.knapp(R.t("Stokk om (+{s} s)", { s: STRAFF }), "stokk-na", { variant: "liten", id: "sp-stokk-na" }) : ""}
        ${R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre"), R.ui.lenke(R.t("Start brettet på nytt"), "omstart"))}
      </div>`;
  }

  // Bring classes, labels, the HUD and the «no pairs» card up to date after a move.
  function oppdater(S, frigjort) {
    const sp = aktiv(S);
    const brett = R.$(".sp-brett");
    if (!sp || !brett || !G) return;
    for (const el of brett.querySelectorAll(".sp-b")) {
      const i = Number(el.dataset.v);
      if (borte[i]) continue;
      const fri = MJ.ledig(G, borte, i);
      el.classList.toggle("last", !fri);
      el.classList.toggle("valgt", i === valgt);
      el.classList.toggle("hint", !!(hintPar && hintPar.includes(i)));
      if (fri) {
        el.removeAttribute("aria-disabled");
        el.removeAttribute("tabindex");
      } else {
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("tabindex", "-1");
      }
      el.setAttribute("aria-pressed", String(i === valgt));
      el.setAttribute("aria-label", etikett(sp.ansikt[i], fri));
      if (frigjort && frigjort.has(i) && !R.rolig()) {
        el.classList.remove("ny");
        void el.offsetWidth;
        el.classList.add("ny");
      }
    }
    const par = MJ.parene(G, borte, sp.ansikt).length;
    const igjen = R.$("#sp-igjen");
    if (igjen) igjen.innerHTML = hudIgjen(sp);
    const parEl = R.$("#sp-par");
    if (parEl) {
      parEl.innerHTML = hudPar(par);
      parEl.classList.toggle("null", par === 0);
    }
    const angre = R.$('#skjerm .sp-knapp[data-h="angre"]');
    if (angre) angre.disabled = !sp.hist.length;
    const stopp = R.$(".sp-stopp");
    if (stopp) {
      const vis = par === 0 && tatt(sp) < sp.ansikt.length && !laast;
      if (vis && stopp.hidden) {
        stopp.innerHTML = stoppHtml(S, sp);
        stopp.hidden = false;
        R.lyd.tone(330, 0.05, 0.22, "triangle", 0.08, 240);
        R.si(R.t("Ingen ledige par. Stokk om, angre eller start brettet på nytt."));
      } else if (!vis && !stopp.hidden) {
        stopp.hidden = true;
        stopp.innerHTML = "";
      }
    }
  }

  // ---------- Playing ----------

  function nei(i) {
    R.lyd.tone(200, 0, 0.12, "sine", 0.09, 150);
    R.vibrer([10, 30, 10]);
    const el = R.$(`.sp-b[data-v="${i}"]`);
    if (el && !R.rolig()) {
      el.classList.remove("rist");
      void el.offsetWidth;
      el.classList.add("rist");
    }
  }

  function skjulHint() {
    clearTimeout(hintId);
    hintId = null;
    if (!hintPar) return;
    hintPar = null;
    R.$$(".sp-b.hint").forEach((el) => el.classList.remove("hint"));
  }

  function forsteTrekk(S, sp) {
    if (sp.startet) return;
    sp.startet = true;
    startKlokke(S);
  }

  function trykkBrikke(S, i) {
    const sp = aktiv(S);
    if (laast || !sp || sp.ferdig || !borte || !G || !(i >= 0 && i < G.n) || borte[i]) return;
    forsteTrekk(S, sp);
    skjulHint();
    if (!MJ.ledig(G, borte, i)) {
      nei(i);
      R.si(R.t("{navn} er låst.", { navn: navnPa(sp.ansikt[i]) }));
      return;
    }
    if (valgt === i) {
      valgt = -1;
      R.lyd.tone(420, 0, 0.05, "sine", 0.05);
      oppdater(S);
      return;
    }
    if (valgt >= 0 && !borte[valgt] && MJ.passer(sp.ansikt[valgt], sp.ansikt[i])) return taPar(S, valgt, i);
    const bytt = valgt >= 0;
    valgt = i;
    if (bytt) R.lyd.tone(360, 0, 0.07, "sine", 0.06, 300);
    else R.lyd.tone(640, 0, 0.05, "sine", 0.06);
    R.vibrer(5);
    oppdater(S);
    R.si(bytt ? R.t("Ikke like. {navn} er valgt.", { navn: navnPa(sp.ansikt[i]) }) : R.t("{navn} er valgt.", { navn: navnPa(sp.ansikt[i]) }));
  }

  function taPar(S, a, b) {
    const sp = aktiv(S);
    const for1 = new Set(MJ.frie(G, borte));
    sp.hist.push([a, b]);
    sp.trekk += 1;
    borte[a] = 1;
    borte[b] = 1;
    valgt = -1;
    const frigjort = new Set(MJ.frie(G, borte).filter((i) => !for1.has(i)));
    for (const i of [a, b]) {
      const el = R.$(`.sp-b[data-v="${i}"]`);
      if (!el) continue;
      if (R.rolig()) el.remove();
      else {
        el.classList.add("ut");
        el.setAttribute("aria-hidden", "true");
        setTimeout(() => el.remove(), 320);
      }
    }
    const rest = sp.ansikt.length - tatt(sp);
    // A short two-note clack, a little higher as the board empties.
    const opp = 1 - rest / sp.ansikt.length;
    R.lyd.tone(700 + opp * 300, 0, 0.06, "triangle", 0.09);
    R.lyd.tone(1050 + opp * 450, 0.055, 0.08, "triangle", 0.07);
    R.vibrer(12);
    if (rest === 0) return vinn(S);
    oppdater(S, frigjort);
    const par = MJ.parene(G, borte, sp.ansikt).length;
    R.si(`${R.t("Par: {navn}.", { navn: navnPa(sp.ansikt[a]) })} ${R.t("{brikker} igjen, {par}.", { brikker: R.flertall(rest, "brikke", "brikker"), par: R.flertall(par, "ledig par", "ledige par") })}`);
    if (erDagens(sp)) meldDagens(S);
    R.lagre();
  }

  function vinn(S) {
    const sp = aktiv(S);
    stoppKlokke(S);
    laast = true;
    sp.ferdig = true;
    sp.vunnet = true;
    registrer(S, true, sp);
    R.lagre();
    const stopp = R.$(".sp-stopp");
    if (stopp) stopp.hidden = true;
    R.si(R.t("Brettet er ryddet!"));
    const fortsatt = R.vakt();
    setTimeout(
      () => {
        laast = false;
        if (fortsatt()) R.gaTil("slutt");
      },
      R.rolig() ? 500 : 900,
    );
  }

  // A hint: the first pair of a way to the end, if the solver finds one in time.
  function visHint(S) {
    const sp = aktiv(S);
    if (laast || !sp || sp.ferdig || !G) return;
    skjulHint();
    const par = MJ.parene(G, borte, sp.ansikt);
    if (!par.length) return oppdater(S);
    // The deal's own solution while the player is still on it; else the solver.
    const kjent = sp.hist.some((h) => !Array.isArray(h)) ? null : MJ.folg(G, borte, sp.ansikt, MJ.delUt(sp.brett, sp.fro).losning);
    const r = kjent ? { vei: kjent } : MJ.los(G, borte, sp.ansikt, 12000);
    if (!r.vei && r.bevist) {
      R.toast(R.t("Herfra går ikke brettet opp. Angre noen trekk, eller stokk om."));
      R.lyd.tone(260, 0, 0.18, "sine", 0.08, 200);
      return;
    }
    const p = r.vei ? r.vei[0] : par[0];
    forsteTrekk(S, sp);
    sp.hint += 1;
    hintPar = p;
    valgt = -1;
    oppdater(S);
    R.lyd.tone(880, 0, 0.08, "sine", 0.06);
    R.lyd.tone(1175, 0.09, 0.1, "sine", 0.05);
    R.si(R.t("Hint: {a} og {b}.", { a: navnPa(sp.ansikt[p[0]]), b: navnPa(sp.ansikt[p[1]]) }));
    hintId = setTimeout(skjulHint, 3200);
    R.lagre();
  }

  function angre(S) {
    const sp = aktiv(S);
    if (laast || !sp || sp.ferdig || !sp.hist.length) return;
    skjulHint();
    const h = sp.hist.pop();
    if (Array.isArray(h)) inn = h.slice();
    else {
      sp.ansikt = h.s;
      stokket = true;
    }
    sp.angre += 1;
    valgt = -1;
    R.lyd.tone(600, 0, 0.08, "triangle", 0.07, 420);
    R.vis();
    inn = null;
    stokket = false;
    R.si(Array.isArray(h) ? R.t("Angret. {navn} er tilbake.", { navn: navnPa(sp.ansikt[h[0]]) }) : R.t("Angret. Brikkene ligger som før stokkingen."));
    R.lagre();
  }

  function stokkNa(S) {
    const sp = aktiv(S);
    if (laast || !sp || sp.ferdig || !G) return;
    const r = MJ.stokkOm(G, borte, sp.ansikt, R.nyttFro());
    if (!r) {
      R.toast(R.t("Brikkene som er igjen, kan ikke ryddes uansett hvordan de ligger. Angre noen trekk."));
      return;
    }
    skjulHint();
    forsteTrekk(S, sp);
    sp.hist.push({ s: sp.ansikt });
    sp.ansikt = r.ansikt;
    sp.stokk += 1;
    valgt = -1;
    stokket = true;
    R.lyd.sveip();
    R.vibrer([8, 40, 8]);
    R.vis();
    stokket = false;
    R.si(R.t("Brikkene er stokket om. {s} s er lagt til tida.", { s: STRAFF }));
    R.lagre();
  }

  // The same deal from the start (the clock, the hints and the shuffles keep counting).
  function omstart(S) {
    const sp = aktiv(S);
    if (laast || !sp || sp.ferdig) return;
    skjulHint();
    sp.ansikt = MJ.delUt(sp.brett, sp.fro).ansikt;
    sp.hist = [];
    valgt = -1;
    R.lyd.sveip();
    R.vis();
    R.si(R.t("Brettet er lagt ut på nytt."));
    R.lagre();
  }

  // ---------- Small pictures ----------

  // A layout seen from above, for the tiles on the setup screen.
  function miniatyr(id) {
    const g = MJ.geo(id);
    const s = 0.34;
    const forskyv = (g.lag - 1) * s;
    const farger = ["#cbb58a", "#e2d0a8", "#f1e4c4", "#fbf3df", "#ffffff"];
    const rekke = g.pos.map((p, i) => i).sort((a, b) => g.pos[a][2] - g.pos[b][2] || g.pos[a][0] + g.pos[a][1] - g.pos[b][0] - g.pos[b][1]);
    const rects = rekke
      .map((i) => {
        const [x, y, z] = g.pos[i];
        return `<rect x="${r1(x + forskyv - z * s)}" y="${r1(y * FORHOLD + forskyv - z * s)}" width="1.86" height="${r1(2 * FORHOLD - 0.14)}" rx=".3" fill="${farger[z]}" stroke="${BLEKK}" stroke-width=".22"/>`;
      })
      .join("");
    return `<svg class="sp-mini" viewBox="-.3 -.3 ${r1(g.b + forskyv + 0.6)} ${r1(g.h * FORHOLD + forskyv + 0.6)}" aria-hidden="true" focusable="false">${rects}</svg>`;
  }
  // Today's date as a little calendar page (the daily's button on home).
  const kalender = (dato) => `<span class="sp-kal" aria-hidden="true"><small>${esc(manedKort(dato))}</small><b>${Number(dato.slice(8))}</b></span>`;

  function statLinje(S, brett) {
    const s = S.stat[brett];
    if (!s || !s.spilt) return "";
    return `${BRETT_NAVN[brett]}: ${R.t("ryddet {v} av {n}", { v: R.tall(s.vunnet), n: R.tall(s.spilt) })}${s.besteTid ? ` · ${R.t("beste tid {tid}", { tid: R.formaterTid(s.besteTid) })}` : ""}`;
  }

  // ---------- Keyboard ----------

  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || R.arkApent() || e.altKey) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && String(e.key).toLowerCase() === "z") {
      e.preventDefault();
      angre(S);
    }
  });
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass();
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill") return;
    if (document.hidden) {
      stoppKlokke(S);
      R.lagre();
    } else startKlokke(S);
  });
  const fastSide = (pa) => document.documentElement.classList.toggle("sp-fast", !!pa);

  // ---------- Start ----------

  function les(sp, dag) {
    if (!sp || typeof sp !== "object" || !MJ.geo(sp.brett) || !Array.isArray(sp.hist)) return null;
    if (dag ? !(Number.isInteger(sp.dag) && typeof sp.dato === "string" && /^\d{4}-\d\d-\d\d$/.test(sp.dato)) : sp.dag != null) return null;
    if (!MJ.spillAv(sp.brett, sp.ansikt, sp.hist)) return null;
    sp.fro = Number(sp.fro) >>> 0;
    for (const k of ["tid", "trekk", "hint", "stokk", "angre"]) sp[k] = Math.max(0, Number(sp[k]) || 0);
    for (const k of ["startet", "ferdig", "vunnet", "talt"]) sp[k] = !!sp[k];
    if (sp.ferdig && (!sp.resultat || typeof sp.resultat !== "object")) sp.resultat = { vunnet: sp.vunnet, sek: Math.round(sp.tid / 1000) + sp.stokk * STRAFF, hint: sp.hint, stokk: sp.stokk, rekke: 0 };
    return sp;
  }

  R.start({
    id: "skilpadda",
    versjon: 1,
    pagar: (S) => iGang(S.fri) || iGang(dagensSpill(S)),

    tilstand: () => ({
      oppsett: { brett: null, frie: true },
      stat: {},
      dstat: tomDagstat(),
      fri: null,
      dag: null,
      modus: "fri",
    }),

    lastet(S) {
      S.oppsett = Object.assign({ brett: null, frie: true }, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {});
      if (!MJ.geo(S.oppsett.brett)) S.oppsett.brett = standardBrett();
      S.oppsett.frie = S.oppsett.frie !== false;
      const stat = {};
      for (const id of MJ.OPPSETT)
        if (S.stat && S.stat[id] && typeof S.stat[id] === "object") {
          stat[id] = Object.assign(tomStat(), S.stat[id]);
          for (const k of Object.keys(tomStat())) stat[id][k] = Math.max(0, Math.floor(Number(stat[id][k]) || 0));
        }
      S.stat = stat;
      const d = Object.assign(tomDagstat(), S.dstat && typeof S.dstat === "object" ? S.dstat : {});
      for (const k of Object.keys(tomDagstat())) d[k] = Math.max(0, Math.floor(Number(d[k]) || 0));
      S.dstat = d;
      S.fri = les(S.fri, false);
      S.dag = les(S.dag, true);
      // Only today's daily is kept.
      if (S.dag && S.dag.dag !== R.dag().nr) S.dag = null;
      if (S.modus !== "dag" && S.modus !== "fri") S.modus = "fri";
      const sp = aktiv(S);
      if (S.skjerm === "spill" && !(sp && !sp.ferdig)) S.skjerm = sp ? "slutt" : "hjem";
      if (S.skjerm === "slutt" && !(sp && sp.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "oppsett" && S.modus === "dag") S.modus = "fri";
      valgt = -1;
      hintPar = null;
      laast = false;
      // The front page reads the daily from the kit's own key: say it again on every load.
      meldDagens(S);
    },

    // rusj.no/skilpadda/#dagens (the front page's «I dag»): today's board – or its result.
    vedHash(S, hash) {
      return String(hash).toLowerCase() === "dagens" ? apneDagens(S) : null;
    },

    regler: {
      intro: R.t("Ta bort alle brikkene fra brettet – to og to like."),
      steg: [
        [R.t("Finn to like"), R.t("Trykk på to like brikker, så forsvinner de. Alle blomster passer sammen, og alle årstider passer sammen.")],
        [R.t("Bare ledige brikker"), R.t("En brikke er ledig når ingenting ligger oppå den, og siden til venstre eller til høyre er åpen. Låste brikker er litt mørkere.")],
        [R.t("Rydd hele brettet"), R.t("Når det siste paret er borte, har du vunnet. Står du fast, kan du angre, få et hint eller stokke om brikkene.")],
      ],
      tips: [
        R.t("Ta først brikkene som låser mange andre: høye stabler og endene av lange rader."),
        R.t("Er tre like brikker ledige, tenk deg om: den fjerde kan ligge under en av dem. Er alle fire ledige, er det trygt å ta dem."),
        R.t("«Hint» viser et par som kan føre helt i mål, og «Angre» tar tilbake så mange trekk du vil."),
        R.t("«Stokk om» legger brikkene som er igjen på nytt, slik at brettet kan gå opp – men det gir {s} s ekstra på tida.", { s: STRAFF }),
        R.t("Hvert brett er sjekket på forhånd: det kan alltid ryddes."),
        R.t("Dagens brett er det samme for alle. Et nytt kommer ved midnatt."),
        R.t("Med tastatur: Tab går mellom de ledige brikkene, Enter velger, og Ctrl + Z angrer."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = R.dag();
          const dag = dagensSpill(S);
          const lost = !!(dag && dag.ferdig && dag.vunnet);
          const fri = iGang(S.fri) ? S.fri : null;
          const rekke = dagRekke(S);
          const brett = S.oppsett.brett;
          const friTekst = fri
            ? R.t("Fortsett · {brett}, {n} igjen", { brett: BRETT_NAVN[fri.brett], n: fri.ansikt.length - tatt(fri) })
            : R.t("Nytt brett · {brett}", { brett: BRETT_NAVN[brett] });
          const regler = R.ui.lenke(R.t("Slik spiller du"), "regler");
          let knapper;
          if (!lost) {
            const { brett: dagBrett } = MJ.dagens(d.tekst);
            const under =
              dag && dag.startet
                ? R.t("{n} av {alle} brikker", { n: tatt(dag), alle: dag.ansikt.length })
                : `${ukedag(d.tekst)} · ${BRETT_NAVN[dagBrett]} · ${rekke > 0 ? `🔥 ${R.t("{dager} på rad", { dager: R.flertall(rekke, "dag", "dager") })}` : R.flertall(MJ.geo(dagBrett).n, "brikke", "brikker")}`;
            knapper =
              R.ui.knapp("", "dagens", {
                variant: "stor",
                tekstHtml: `${kalender(d.tekst)}<span class="sp-dagknapp"><b>${esc(dag && dag.startet ? R.t("Fortsett dagens brett") : R.t("Dagens brett"))}</b><small>${esc(under)}</small></span>`,
              }) +
              R.ui.knapp2(friTekst, fri ? "fortsett" : "nytt") +
              R.ui.lenkerad(fri ? R.ui.lenke(R.t("Nytt brett"), "nytt") : "", R.ui.lenke(R.t("Bytt brett"), "endre"), regler);
          } else {
            const r = dag.resultat || { sek: 0 };
            knapper =
              R.ui.knapp(friTekst, fri ? "fortsett" : "nytt") +
              R.ui.lenkerad(fri ? R.ui.lenke(R.t("Nytt brett"), "nytt") : "", R.ui.lenke(R.t("Bytt brett"), "endre"), regler) +
              `<div class="sp-dagboks">
                <p><span class="sp-hake" aria-hidden="true">${IKON.hake}</span><b>${esc(R.t("Dagens brett er ryddet"))}</b> · ${esc(R.formaterTid(r.sek))}${rekke > 1 ? ` · 🔥 ${esc(R.t("{n} dager på rad", { n: R.tall(rekke) }))}` : ""}</p>
                ${nedtellingHtml()}
                ${R.ui.lenke(R.t("Se resultatet"), "dagens")}
              </div>`;
          }
          const linje = statLinje(S, brett);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Finn to like, ledige brikker."))}<br><em>${esc(R.t("Får du ryddet hele brettet?"))}</em>`,
              knapperHtml: knapper,
              merker: [
                [String(MJ.OPPSETT.length), R.t("brett")],
                ["📅", R.t("nytt hver dag")],
                ["0", R.t("reklame")],
              ],
            }) + (linje ? `<p class="sp-hjemstat">${esc(linje)}</p>` : "")
          );
        },
        inn: (S) => {
          if (dagensSpill(S) && dagensSpill(S).ferdig) startNedtelling();
        },
      },

      oppsett: {
        tittel: R.t("Velg brett"),
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvilket brett?"))}</h2>
            ${R.ui.fliser(
              "brett",
              MJ.OPPSETT.map((id) => {
                const s = S.stat[id];
                const best = s && s.besteTid ? ` · ${R.t("beste tid {tid}", { tid: R.formaterTid(s.besteTid) })}` : "";
                return { v: id, tittel: BRETT_NAVN[id], tekst: `${R.flertall(MJ.geo(id).n, "brikke", "brikker")} · ${BRETT_OM[id]}${best}`, ikon: miniatyr(id) };
              }),
              S.oppsett.brett,
            )}
          </section>
          ${R.ui.bryter("frie", S.oppsett.frie, R.t("Vis ledige brikker"), R.t("Låste brikker blir litt mørkere, så du ser hvilke du kan ta."))}
          <p class="hjelp">${esc(R.t("Hvert brett er sjekket på forhånd: det kan alltid ryddes."))}</p>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`,
      },

      spill: {
        tittel: (S) => {
          const sp = aktiv(S);
          return erDagens(sp) ? R.t("Dagens brett") : sp ? BRETT_NAVN[sp.brett] : SPILLNAVN();
        },
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = aktiv(S);
          if (!sp) return `<h1 id="skjerm-tittel">${esc(SPILLNAVN())}</h1>`;
          G = MJ.geo(sp.brett);
          borte = MJ.spillAv(sp.brett, sp.ansikt, sp.hist);
          const par = MJ.parene(G, borte, sp.ansikt).length;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(erDagens(sp) ? R.t("Dagens brett, {dato}", { dato: datoLang(sp.dato) }) : R.t("{brett}, {n} brikker", { brett: BRETT_NAVN[sp.brett], n: G.n }))}</h1>
            <div class="sp-hud">
              <span class="sp-stat" aria-label="${esc(R.t("Tid"))}">${IKON.klokke}<b id="sp-tid">${R.formaterTid(sekunder(sp))}</b></span>
              <span class="sp-stat" id="sp-igjen">${hudIgjen(sp)}</span>
              <span class="sp-stat${par ? "" : " null"}" id="sp-par">${hudPar(par)}</span>
            </div>
            <div class="sp-flate${S.oppsett.frie ? " vis-frie" : ""}">
              <div class="sp-brett${stokket ? " stokket" : ""}" role="group" aria-label="${esc(R.t("Brettet"))}" aria-describedby="sp-hjelp">${brettHtml(sp)}</div>
              <div class="sp-stopp" hidden></div>
            </div>
            <p class="vh" id="sp-hjelp">${esc(R.t("Tab går mellom de ledige brikkene, og Enter velger."))}</p>
            ${R.ui.dokk(`<div class="sp-verktoy">
              <button class="sp-knapp" data-h="angre" data-stille${sp.hist.length ? "" : " disabled"}>${IKON.angre}<span>${esc(R.t("Angre"))}</span></button>
              <button class="sp-knapp" data-h="hint" data-stille>${IKON.hint}<span>${esc(R.t("Hint"))}</span></button>
              <button class="sp-knapp" data-h="stokk" data-stille>${IKON.stokk}<span>${esc(R.t("Stokk om"))}</span></button>
              <button class="sp-knapp" data-h="avslutt">${IKON.slutt}<span>${esc(R.t("Avslutt"))}</span></button>
            </div>`)}`;
        },
        etter(S, rot) {
          tilpass();
          oppdater(S);
          const flate = R.$(".sp-flate", rot);
          if (flate && typeof ResizeObserver === "function") {
            const obs = new ResizeObserver(() => tilpass());
            obs.observe(flate);
            R.vedForlat(() => obs.disconnect());
          }
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp || sp.ferdig) return R.gaTil(sp ? "slutt" : "hjem");
          valgt = -1;
          laast = false;
          fastSide(true);
          startKlokke(S);
          const id = setInterval(() => {
            const el = R.$("#sp-tid");
            const na = aktiv(R.S);
            if (el && na) el.textContent = R.formaterTid(sekunder(na));
          }, 500);
          R.vedForlat(() => clearInterval(id));
          R.holdVaken();
        },
        ut(S) {
          stoppKlokke(S);
          skjulHint();
          valgt = -1;
          laast = false;
          fastSide(false);
          R.slippVaken();
          meldDagens(S);
        },
      },

      slutt: {
        tittel: (S) => (S.modus === "dag" ? R.t("Dagens brett") : R.t("Kåringen")),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const r = sp.resultat || { sek: Math.round(sp.tid / 1000), hint: sp.hint, stokk: sp.stokk };
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const n = sp.ansikt.length;
          const rekord = `<i class="sp-ny">${esc(R.t("Rekord!"))}</i>`;
          const tall = `<div class="sp-resultat">
              <div class="sp-tall${r.nyTid ? " ny" : ""}"><b>${R.formaterTid(r.sek)}</b><span>${esc(R.t("tid"))}</span>${r.nyTid ? rekord : ""}</div>
              <div class="sp-tall"><b>${R.tall(r.hint)}</b><span>${esc(R.t("hint|hint", { n: r.hint }))}</span></div>
              <div class="sp-tall${r.stokk ? " straff" : ""}"><b>${R.tall(r.stokk)}</b><span>${esc(R.t("stokking|stokkinger", { n: r.stokk }))}</span></div>
            </div>
            ${r.stokk ? `<p class="sp-straff">${esc(R.t("Tida er med {s} s ekstra for hver stokking.", { s: STRAFF }))}</p>` : ""}`;
          if (erDagens(sp)) {
            const rekke = (sp.resultat && sp.resultat.rekke) || dagRekke(S);
            const idag = sp.dag === R.dag().nr;
            return `
              <div class="banner aksent">
                ${R.figur(null, "jubel")}
                <p class="etikett">${esc(R.t("Dagens brett"))} · ${esc(datoLang(sp.dato))}</p>
                <h1 id="skjerm-tittel">${esc(R.t("Dagens brett er ryddet!"))}</h1>
                <p class="ingress">${esc(rekke > 1 ? `🔥 ${R.t("{n} dager på rad!", { n: R.tall(rekke) })}` : R.t("Første dag i en ny rekke – kom tilbake i morgen."))}</p>
              </div>
              ${tall}
              <p class="hjelp">${esc(R.t("{brett} · {antall}. Alle får det samme brettet i dag.", { brett: BRETT_NAVN[sp.brett], antall: R.flertall(n, "brikke", "brikker") }))}</p>
              <div class="sp-dagboks">${idag ? nedtellingHtml() : `<p class="sp-nedtelling"><b>${esc(R.t("Et nytt brett er klart!"))}</b></p>`}</div>
              ${R.ui.flereSpill({ antall: 1 })}
              ${R.ui.dokk(idag ? R.ui.knapp(R.t("Del resultatet"), "del") : R.ui.knapp(R.t("Dagens brett"), "dagens"), R.ui.lenkerad(R.ui.lenke(iGang(S.fri) ? R.t("Fortsett fritt spill") : R.t("Spill fritt"), "fri"), alle))}`;
          }
          const s = Object.assign(tomStat(), S.stat[sp.brett] || {});
          const linje = r.nyTid
            ? R.t("Forrige rekord: {tid}.", { tid: R.formaterTid(r.forrige) })
            : r.forste
              ? R.t("Første gang du rydder {brett} – nå har du en tid å slå!", { brett: BRETT_NAVN[sp.brett] })
              : R.t("Beste tid på {brett}: {tid}.", { brett: BRETT_NAVN[sp.brett], tid: R.formaterTid(s.besteTid) });
          return `
            <div class="banner aksent">
              ${R.figur(null, "jubel")}
              <p class="etikett">${esc(BRETT_NAVN[sp.brett])} · ${esc(R.flertall(n, "brikke", "brikker"))}</p>
              <h1 id="skjerm-tittel">${esc(r.nyTid ? R.t("Ny rekord!") : R.t("Brettet er ryddet!"))}</h1>
              <p class="ingress">${esc(linje)}</p>
            </div>
            ${tall}
            <p class="sp-sluttstat">${esc(statLinje(S, sp.brett))}${s.rekke > 1 ? ` · ${esc(R.t("{n} på rad", { n: R.tall(s.rekke) }))}` : ""}</p>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Bytt brett"), "endre"), dagensSpill(S) && dagensSpill(S).ferdig ? "" : R.ui.lenke(R.t("Dagens brett"), "dagens"), alle))}`;
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp || !sp.ferdig) return R.gaTil("hjem");
          if (erDagens(sp) && sp.dag === R.dag().nr) startNedtelling();
          if (sp.vunnet && !sp.feiret) {
            sp.feiret = true;
            R.lyd.fanfare();
            R.konfetti();
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
          }
        },
      },
    },

    handlinger: (H = {
      brikke(el, e, S) {
        trykkBrikke(S, Number(el.dataset.v));
      },
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        nyttFritt(S);
        R.gaTil("spill");
      },
      fortsett(el, e, S) {
        S.modus = "fri";
        R.gaTil(S.fri && !S.fri.ferdig ? "spill" : "hjem");
      },
      // «Spill fritt» from the daily's result: the free game under way, or a new one.
      fri(el, e, S) {
        if (iGang(S.fri)) return H.fortsett(el, e, S);
        nyttFritt(S);
        R.gaTil("spill");
      },
      dagens: (el, e, S) => R.gaTil(apneDagens(S)),
      endre(el, e, S) {
        S.modus = "fri";
        R.gaTil("oppsett");
      },
      brett(el, e, S) {
        if (MJ.geo(el.dataset.v)) S.oppsett.brett = el.dataset.v;
        R.vis();
      },
      frie(el, e, S) {
        S.oppsett.frie = !S.oppsett.frie;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        nyttFritt(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttFritt(S);
        R.gaTil("spill");
      },
      angre: (el, e, S) => angre(S),
      hint: (el, e, S) => visHint(S),
      async stokk(el, e, S) {
        const sp = aktiv(S);
        if (laast || !sp || sp.ferdig || !G) return;
        if (MJ.parene(G, borte, sp.ansikt).length) {
          const fortsatt = R.vakt();
          const ja = await R.bekreft(
            R.t("Stokke om brikkene?"),
            R.t("Brikkene som er igjen, legges på nytt slik at brettet kan gå opp. Det gir {s} s ekstra på tida.", { s: STRAFF }),
            R.t("Stokk om"),
            R.t("Spill videre"),
          );
          if (!ja || !fortsatt() || aktiv(S) !== sp) return;
        }
        stokkNa(S);
      },
      "stokk-na": (el, e, S) => stokkNa(S),
      async omstart(el, e, S) {
        const sp = aktiv(S);
        if (laast || !sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Starte brettet på nytt?"), R.t("Brikkene legges ut slik de lå i starten. Tida går videre."), R.t("Start på nytt"), R.t("Spill videre"));
        if (ja && fortsatt() && aktiv(S) === sp) omstart(S);
      },
      async avslutt(el, e, S) {
        const sp = aktiv(S);
        if (laast || !sp) return;
        const fortsatt = R.vakt();
        const ja = erDagens(sp)
          ? await R.bekreft(R.t("Legge bort dagens brett?"), R.t("Det ligger klart der du slapp – helt til midnatt."), R.t("Avslutt"), R.t("Spill videre"))
          : await R.bekreft(R.t("Legge bort brettet?"), R.t("Det ligger klart der du slapp, så du kan fortsette senere."), R.t("Avslutt"), R.t("Spill videre"));
        if (ja && fortsatt()) R.gaTil("hjem");
      },
      del(el, e, S) {
        const sp = dagensSpill(S);
        if (!sp || !sp.ferdig || !sp.resultat) return;
        const r = sp.resultat;
        const dato = datoKort(sp.dato);
        const tid = R.formaterTid(r.sek);
        const hint = r.hint ? R.flertall(r.hint, "hint", "hint") : R.t("uten hint");
        const stokk = r.stokk ? R.flertall(r.stokk, "stokking", "stokkinger") : R.t("uten stokking");
        const rekke = r.rekke > 1 ? ` · 🔥 ${R.t("{n} dager på rad", { n: r.rekke })}` : "";
        const tekst = `🐢 ${SPILLNAVN()} ${dato} · ${tid} · ${hint} · ${stokk}${rekke}. ${R.t("Klarer du dagens brett raskere?")}`;
        const linjer = [tid, `${BRETT_NAVN[sp.brett]} · ${R.flertall(sp.ansikt.length, "brikke", "brikker")}`, `${hint} · ${stokk}`];
        if (r.rekke > 1) linjer.push(`🔥 ${R.t("{n} dager på rad", { n: r.rekke })}`);
        R.del(R.t("{navn} – dagens brett", { navn: SPILLNAVN() }), tekst, DEL_URL + "#utfordring", { kort: { tittel: R.t("Dagens brett {dato}", { dato }), linjer } });
      },
    }),
  });
})();
