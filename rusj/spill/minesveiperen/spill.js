/* Minesveiperen — Minesweeper.
   Three boards: Lett 9 × 9 with 10 mines, Middels 16 × 16 with 40, Ekspert 16 × 30 with 99 (turned
   on its side so it suits a phone held upright; it scrolls inside its own frame and can be zoomed).
   The mines are laid after the first tap, never on or around it, so the first tap always opens an
   area. Tap opens (or flags in flag mode), a long press flags, a tap on a number whose flags are all
   placed opens the rest around it («chording»). The board is drawn once per game; taps update the
   cells in place. Everything is saved after every move.
   «Uten gjetting» (on by default): the mines are laid again until the built-in solver can clear the
   board from the first tap with logic alone. «Dagens minefelt» is one such board a day, the same for
   the whole country, with a given first cell. Today's minefield and a free board can be under way
   at the same time. */
(function () {
  "use strict";

  // ======================= Engine =======================
  // Pure, and also runs under node (test/minesveiperen.test.mjs): laying the mines, a solver that
  // only uses logic, boards that never need a guess, and «Dagens minefelt».

  const motor = (function () {
    // Own copies of the hash and the random numbers: the daily board must be the same on every
    // phone for good, whatever happens to the kit.
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

    const NABO = new Map(); // "b x h" → the neighbours of every cell
    function naboer(b, h) {
      const nokkel = b + "x" + h;
      let alle = NABO.get(nokkel);
      if (alle) return alle;
      alle = [];
      for (let i = 0; i < b * h; i++) {
        const x = i % b;
        const y = (i / b) | 0;
        const ut = [];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < b && ny >= 0 && ny < h) ut.push(ny * b + nx);
          }
        alle.push(ut);
      }
      NABO.set(nokkel, alle);
      return alle;
    }

    // The mines go anywhere except the first cell and its neighbours.
    function legg(b, h, miner, forste, tilf) {
      const n = b * h;
      const fri = new Set([forste, ...naboer(b, h)[forste]]);
      let kand = [];
      for (let i = 0; i < n; i++) if (!fri.has(i)) kand.push(i);
      if (kand.length < miner) {
        kand = [];
        for (let i = 0; i < n; i++) if (i !== forste) kand.push(i);
      }
      for (let i = kand.length - 1; i > 0; i--) {
        const j = Math.floor(tilf() * (i + 1));
        const t = kand[i];
        kand[i] = kand[j];
        kand[j] = t;
      }
      const mine = new Array(n).fill(0);
      for (let k = 0; k < miner && k < kand.length; k++) mine[kand[k]] = 1;
      return mine;
    }

    // Can the whole board be cleared from `start` with logic alone? The solver knows what a careful
    // player knows:
    //   1. a number with all its mines found: the rest around it is safe; a number with as many
    //      closed cells as missing mines: they are all mines;
    //   2. two numbers where the closed cells of one all lie among the other's: the difference
    //      between the numbers tells about the cells left over;
    //   3. the mine counter: no mines left (or as many as closed cells), also seen from one number.
    // `logg` (for the tests) gets every conclusion as [cell, 1 = safe | 2 = mine].
    function losbar(b, h, mine, start, logg) {
      const n = b * h;
      const N = naboer(b, h);
      if (mine[start]) return false;
      const tall = new Int8Array(n);
      let miner = 0;
      for (let i = 0; i < n; i++) {
        if (mine[i]) miner++;
        const nb = N[i];
        let s = 0;
        for (let k = 0; k < nb.length; k++) s += mine[nb[k]];
        tall[i] = s;
      }
      const st = new Uint8Array(n); // 0 closed, 1 open, 2 known mine
      const trygge = n - miner;
      let apne = 0;
      let flagg = 0;
      const ko = [];
      const apn = (i) => {
        if (st[i]) return;
        if (logg) logg.push([i, 1]);
        st[i] = 1;
        apne++;
        ko.push(i);
        while (ko.length) {
          const c = ko.pop();
          if (tall[c]) continue;
          const nb = N[c];
          for (let k = 0; k < nb.length; k++) {
            const j = nb[k];
            if (!st[j]) {
              st[j] = 1;
              apne++;
              ko.push(j);
            }
          }
        }
      };
      const merk = (i) => {
        if (st[i]) return;
        if (logg) logg.push([i, 2]);
        st[i] = 2;
        flagg++;
      };
      apn(start);
      const ved = new Int32Array(n);
      for (;;) {
        if (apne === trygge) return true;
        let endret = false;
        // 1. One number at a time.
        for (let i = 0; i < n; i++) {
          if (st[i] !== 1 || !tall[i]) continue;
          const nb = N[i];
          let f = 0;
          let u = 0;
          for (let k = 0; k < nb.length; k++) {
            const s = st[nb[k]];
            if (s === 2) f++;
            else if (s === 0) u++;
          }
          if (!u) continue;
          const rest = tall[i] - f;
          if (rest === 0) {
            for (let k = 0; k < nb.length; k++) apn(nb[k]);
            endret = true;
          } else if (rest === u) {
            for (let k = 0; k < nb.length; k++) merk(nb[k]);
            endret = true;
          }
        }
        if (endret) continue;
        // 2. Two numbers together. K: what every number still asks for.
        const K = [];
        ved.fill(-1);
        for (let i = 0; i < n; i++) {
          if (st[i] !== 1 || !tall[i]) continue;
          const nb = N[i];
          let f = 0;
          const u = [];
          for (let k = 0; k < nb.length; k++) {
            const j = nb[k];
            if (st[j] === 2) f++;
            else if (st[j] === 0) u.push(j);
          }
          if (u.length) {
            ved[i] = K.length;
            K.push({ i, u, m: tall[i] - f });
          }
        }
        for (let a = 0; a < K.length; a++) {
          const A = K[a];
          const x = A.i % b;
          const y = (A.i / b) | 0;
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if ((!dx && !dy) || nx < 0 || nx >= b || ny < 0 || ny >= h) continue;
              const bi = ved[ny * b + nx];
              if (bi < 0) continue;
              const B = K[bi];
              if (B.u.length <= A.u.length) continue;
              let inne = true;
              for (let k = 0; k < A.u.length; k++)
                if (B.u.indexOf(A.u[k]) < 0) {
                  inne = false;
                  break;
                }
              if (!inne) continue;
              const m = B.m - A.m;
              const antall = B.u.length - A.u.length;
              if (m !== 0 && m !== antall) continue;
              for (let k = 0; k < B.u.length; k++) {
                const c = B.u[k];
                if (st[c] || A.u.indexOf(c) >= 0) continue;
                if (m === 0) apn(c);
                else merk(c);
                endret = true;
              }
            }
        }
        if (endret) continue;
        // 3. The mine counter.
        const igjen = miner - flagg;
        const lukket = n - apne - flagg;
        if (igjen === 0 || igjen === lukket) {
          for (let i = 0; i < n; i++)
            if (!st[i]) {
              if (igjen === 0) apn(i);
              else merk(i);
              endret = true;
            }
        } else
          for (let a = 0; a < K.length; a++) {
            const A = K[a];
            const ute = lukket - A.u.length;
            const m = igjen - A.m;
            if (ute <= 0 || (m !== 0 && m !== ute)) continue;
            for (let i = 0; i < n; i++) {
              if (st[i] || A.u.indexOf(i) >= 0) continue;
              if (m === 0) apn(i);
              else merk(i);
              endret = true;
            }
            if (endret) break;
          }
        if (!endret) return false;
      }
    }

    // A board that never needs a guess after the first tap: lay the mines again (a new seed each
    // time) until the solver clears it. Gives up after `maks` tries or `msMaks` milliseconds; the
    // board is then an ordinary one (trygg: false). The first try is the board the seed alone gives.
    function lagTrygt(b, h, miner, forste, fro, maks, msMaks) {
      const t0 = Date.now();
      let forsteBrett = null;
      let k = 0;
      while (k < maks) {
        const mine = legg(b, h, miner, forste, rng((fro + Math.imul(k, 0x9e3779b1)) >>> 0));
        k++;
        if (losbar(b, h, mine, forste)) return { mine, trygg: true, forsok: k };
        if (!forsteBrett) forsteBrett = mine;
        if (msMaks && (k & 3) === 0 && Date.now() - t0 > msMaks) break;
      }
      return { mine: forsteBrett, trygg: false, forsok: k };
    }

    // ---------- «Dagens minefelt» ----------
    // Frozen: a change to anything below changes the boards. One board a day for the whole
    // country, with a given first cell and no guessing. It grows through the week: 9 × 9 from
    // Monday to Thursday, 12 × 12 on Friday and Saturday, 16 × 16 on Sunday.
    const DAGLIG_FORMER = { lett: [9, 9, 10], tolv: [12, 12, 24], middels: [16, 16, 40] };
    const DAGLIG_UKE = ["lett", "lett", "lett", "lett", "tolv", "tolv", "middels"]; // 0 = Monday
    const DAGLIG_FORSOK = 500;
    const dagligNiva = (nr) => DAGLIG_UKE[(((nr + 3) % 7) + 7) % 7];
    function lagDaglig(dato, nr) {
      const niva = dagligNiva(nr);
      const [b, h, miner] = DAGLIG_FORMER[niva];
      // The first cell: somewhere in the middle third of the board.
      const t = rng(fnv("minesveiperen:" + dato));
      const kant = Math.floor(b / 3);
      const x = kant + Math.floor(t() * (b - 2 * kant));
      const y = kant + Math.floor(t() * (h - 2 * kant));
      const start = y * b + x;
      let mine = null;
      let trygg = false;
      let forsok = 0;
      while (forsok < DAGLIG_FORSOK && !trygg) {
        forsok++;
        mine = legg(b, h, miner, start, rng(fnv("minesveiperen:" + dato + ":" + forsok)));
        trygg = losbar(b, h, mine, start);
      }
      return { niva, b, h, miner, start, mine, trygg, forsok };
    }

    return { fnv, rng, naboer, legg, losbar, lagTrygt, dagligNiva, lagDaglig, DAGLIG_FORMER };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;

  // Without a prototype, so a saved or typed value like "__proto__" is simply not a level.
  const NIVAER = Object.assign(Object.create(null), {
    lett: { navn: "Lett", b: 9, h: 9, miner: 10 },
    middels: { navn: "Middels", b: 16, h: 16, miner: 40 },
    ekspert: { navn: "Ekspert", b: 16, h: 30, miner: 99 },
    // Only «Dagens minefelt» uses this one (Friday and Saturday).
    tolv: { navn: "12 × 12", b: 12, h: 12, miner: 24 },
  });
  const UKEDAG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const MANED = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
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
  let hjemme = -1; // the cell Tab lands on (the only one with tabindex 0)
  let arkPause = false; // the clock was stopped because a sheet opened

  // ---------- The board ----------

  const antallCeller = (sp) => sp.b * sp.h;
  const naboer = (sp, i) => M.naboer(sp.b, sp.h)[i];
  const tall = (sp, i) => naboer(sp, i).reduce((s, j) => s + (sp.mine[j] ? 1 : 0), 0);
  const flaggRundt = (sp, i) => naboer(sp, i).reduce((s, j) => s + (sp.flagg[j] ? 1 : 0), 0);
  const avstand = (sp, a, b) => Math.max(Math.abs((a % sp.b) - (b % sp.b)), Math.abs(((a / sp.b) | 0) - ((b / sp.b) | 0)));

  // ---------- Two games at once ----------
  // Today's minefield and a free board can both be under way. S.spill is the one on the screen;
  // the other one waits in S.annet (never two of the same kind).

  const erDag = (sp) => !!(sp && sp.dagens);
  const iGang = (sp) => !!(sp && !sp.ferdig && sp.startet);
  const finn = (S, dag) => (S.spill && erDag(S.spill) === dag ? S.spill : S.annet && erDag(S.annet) === dag ? S.annet : null);
  // Worth keeping while it waits: a game under way, and the solved daily (its result can be shown again).
  const verdt = (sp) => iGang(sp) || (erDag(sp) && sp.ferdig && sp.vunnet);
  // Puts the daily (dag = true) or the free board on the screen. False when there is none.
  function hent(S, dag) {
    if (S.spill && erDag(S.spill) === dag) return true;
    if (!S.annet || erDag(S.annet) !== dag) return false;
    const t = S.spill;
    S.spill = S.annet;
    S.annet = verdt(t) ? t : null;
    return true;
  }
  // Makes room for a new game of one kind; a game of the other kind is kept.
  function ryddFor(S, dag) {
    const sp = S.spill;
    if (sp && erDag(sp) !== dag) S.annet = verdt(sp) ? sp : null;
    else if (S.annet && erDag(S.annet) === dag) S.annet = null;
    S.spill = null;
  }
  // Today's minefield on this phone (under way, lost or solved), if any.
  function dagensSpill(S) {
    const sp = finn(S, true);
    return sp && sp.dagens === R.dag().tekst ? sp : null;
  }
  // Days in a row with the daily solved; the streak lives until a whole day is skipped.
  function rekke(S) {
    const d = S.daglig;
    return d.sistNr >= R.dag().nr - 1 ? d.rekke || 0 : 0;
  }

  // valg: a level, or "dagens" for today's minefield (the engine's frozen daily rules).
  function nyttSpill(S, valg) {
    const dag = valg === "dagens";
    let niva = !dag && NIVA_ID.includes(valg) ? valg : "lett";
    let ekstra = { dagens: null, dagNr: null, start: -1, forsok: 0, mine: null, trygg: false, uten: S.oppsett.uten !== false };
    if (dag) {
      const d = R.dag();
      const o = M.lagDaglig(d.tekst, d.nr);
      const f = S.daglig.forsok;
      niva = o.niva;
      // The mines are laid already, and everybody starts on the same cell.
      ekstra = { dagens: d.tekst, dagNr: d.nr, start: o.start, forsok: (f && f.dato === d.tekst ? f.n : 0) + 1, mine: o.mine, trygg: o.trygg, uten: true };
    } else S.oppsett.niva = niva;
    const N = NIVAER[niva];
    const n = N.b * N.h;
    ryddFor(S, dag);
    S.spill = {
      niva,
      b: N.b,
      h: N.h,
      miner: N.miner,
      fro: R.nyttFro(),
      mine: ekstra.mine, // a free board: laid after the first tap
      dagens: ekstra.dagens,
      dagNr: ekstra.dagNr,
      start: ekstra.start,
      forsok: ekstra.forsok,
      uten: ekstra.uten,
      trygg: ekstra.trygg,
      apen: new Array(n).fill(0),
      flagg: new Array(n).fill(0),
      tid: 0,
      startet: false,
      ferdig: false,
      vunnet: false,
      smell: -1,
      resultat: null,
    };
    S.flaggmodus = false;
    klokkeFra = null;
    las = false;
    markor = -1;
    R.statistikk("start", { niva, dagens: dag });
  }

  // Today's minefield: the board (a new try, or the one under way) – or its result when it is
  // solved. Returns the screen to show.
  function apneDagens(S) {
    const sp = dagensSpill(S);
    if (S.daglig.dager[R.dag().tekst]) return sp && sp.ferdig && sp.vunnet && hent(S, true) ? "slutt" : "hjem";
    if (sp && !sp.ferdig) hent(S, true);
    else nyttSpill(S, "dagens");
    return "spill";
  }

  // The front page shows how far today's minefield has come (rusj/DAGLIG.md).
  function meldIGang(S) {
    const sp = S.spill;
    if (!sp || !sp.startet || sp.dagens !== R.dag().tekst || S.daglig.dager[sp.dagens] || typeof R.dagligIGang !== "function") return;
    const andel = Math.floor((apneTrygge(sp) / (antallCeller(sp) - sp.miner)) * 100);
    R.dagligIGang({ tekst: sp.ferdig ? "Prøv igjen" : `${andel} %` });
  }

  // ---------- Countdown to the next minefield (midnight in Norway) ----------

  function sekunderTilNy() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(na))
      .forEach((p) => (deler[p.type] = Number(p.value)));
    let igjen = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const dag = R.dag(new Date(na)).nr;
    // The two nights a year the clocks change, the day is 23 or 25 hours long.
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const klokkeTekst = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const nedtellingHtml = () => `<p class="ms-nedtelling">Nytt minefelt om <b>${klokkeTekst(sekunderTilNy())}</b></p>`;
  // Ticks every second while a countdown is on the screen; at midnight the screen is drawn again.
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".ms-nedtelling b");
      if (!el) return clearInterval(nedtellingId);
      if (R.dag().nr !== dag) {
        clearInterval(nedtellingId);
        return R.vis();
      }
      el.textContent = klokkeTekst(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(nedtellingId));
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
    if (t === "u") return `${sted}: lukket${i === sp.start && !sp.startet ? ", start her" : ""}`;
    if (t === "f") return `${sted}: flagg`;
    if (t === "a0") return `${sted}: tom`;
    if (t[0] === "a") return `${sted}: ${t.slice(1)} ${t === "a1" ? "mine" : "miner"} rundt`;
    if (t === "x") return `${sted}: minen som smalt`;
    if (t === "w") return `${sted}: feil flagg`;
    return `${sted}: mine`;
  }
  const innhold = (t) => (t[0] === "a" && t !== "a0" ? t.slice(1) : "");

  function brettHtml(sp) {
    // Tab lands on one cell (the given first cell, or the middle); the arrow keys move from there.
    hjemme = markor >= 0 ? markor : sp.start >= 0 ? sp.start : ((sp.h / 2) | 0) * sp.b + ((sp.b / 2) | 0);
    let html = "";
    for (let i = 0; i < antallCeller(sp); i++) {
      const t = tilstand(sp, i);
      const start = i === sp.start && !sp.startet ? " start" : "";
      html += `<button class="ms-c ${t}${start}" data-i="${i}" tabindex="${i === hjemme ? 0 : -1}" aria-label="${etikett(sp, i, t)}">${innhold(t)}</button>`;
    }
    return html;
  }

  // «✓ Uten gjetting» shows once the board is known to need no guess.
  function visMerke(S) {
    const el = R.$(".ms-merke");
    if (el) el.hidden = !(S.spill && S.spill.trygg);
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
      if (sp.ferdig && sp.vunnet && !fjes.classList.contains("vant")) {
        const ramme = fjes.querySelector(".figur-ramme");
        if (ramme) ramme.outerHTML = gladFigur();
      }
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
    // The whole of a big board on a phone gives cells too small for a finger (under 24 px): then
    // the board is a map – one big button, and a tap zooms in where it lands.
    const oversikt = sp.niva !== "lett" && c < 24;
    brett.inert = oversikt;
    const lupe = R.$(".ms-lupe");
    if (lupe) lupe.hidden = !oversikt;
    if (rulle.parentElement) rulle.parentElement.classList.toggle("oversikt", oversikt);
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
    const stor = rulle.scrollWidth > rulle.clientWidth + 1 || rulle.scrollHeight > rulle.clientHeight + 1;
    rulle.classList.toggle("stor", stor);
    if (rulle.parentElement) rulle.parentElement.classList.toggle("stor", stor);
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
    const sp = S.spill;
    if (rulle && rulle.parentElement && rulle.parentElement.classList.contains("oversikt")) tips.textContent = "Trykk på brettet for å zoome inn";
    else if (sp && sp.start >= 0 && !sp.startet) tips.textContent = "Start på ruta som lyser";
    else if (S.flaggmodus) tips.textContent = stor ? "Dra for å se resten · trykk for flagg" : "Trykk for å sette flagg";
    else tips.textContent = stor ? "Dra for å se resten · hold inne for flagg" : "Trykk for å åpne · hold inne for flagg";
  }

  // ---------- Moves ----------

  function forsteTrykk(S, i) {
    const sp = S.spill;
    if (sp.startet) return;
    if (!sp.mine) {
      // «Uten gjetting»: lay the mines again until logic alone clears the board from this
      // opening (a few milliseconds; Ekspert needs about 18 tries).
      const r = sp.uten ? M.lagTrygt(sp.b, sp.h, sp.miner, i, sp.fro, 400, 1500) : { mine: M.legg(sp.b, sp.h, sp.miner, i, M.rng(sp.fro)), trygg: false };
      sp.mine = r.mine;
      sp.trygg = r.trygg;
    }
    sp.startet = true;
    if (sp.dagens) S.daglig.forsok = { dato: sp.dagens, n: sp.forsok };
    const start = R.$(".ms-c.start");
    if (start) start.classList.remove("start");
    visMerke(S);
    visTips(S);
    startKlokke(S);
  }

  function apneCelle(S, i) {
    const sp = S.spill;
    // Today's minefield starts on its given cell, wherever the first tap lands.
    if (!sp.startet && sp.start >= 0) i = sp.start;
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
      R.si(`${n} ${n === 1 ? "mine" : "miner"} rundt, ${flaggRundt(sp, i)} flagg satt.`);
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
    // For a screen reader: what the cell showed, or how many cells opened.
    if (apnet.length === 1) R.si(etikett(sp, apnet[0][0], tilstand(sp, apnet[0][0])));
    else if (apnet.length) R.si(`${apnet.length} ruter åpnet.`);
    if (sp.dagens && apnet.some(([k]) => k === sp.start)) meldIGang(S);
    R.lagre();
  }

  function flagg(S, i, langt) {
    const sp = S.spill;
    if (sp.ferdig || las || sp.apen[i]) return;
    // Today's minefield: the given first cell comes before any flag.
    if (!sp.startet && sp.start >= 0) return blink(sp.start);
    sp.flagg[i] = sp.flagg[i] ? 0 : 1;
    const igjen = sp.miner - flaggTotalt(sp);
    R.si(`${sp.flagg[i] ? "Flagg satt" : "Flagg fjernet"} på rad ${((i / sp.b) | 0) + 1}, kolonne ${(i % sp.b) + 1}. ${igjen} ${igjen === 1 ? "mine" : "miner"} igjen.`);
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
    sp.resultat = {
      sek: Math.round(sp.tid / 1000),
      andel: Math.floor((apneTrygge(sp) / trygge) * 100),
      funnet: sp.flagg.reduce((s, f, k) => s + (f && sp.mine[k] ? 1 : 0), 0), // mines flagged correctly
    };
    // The daily keeps its own book: tries, not the level's win count.
    if (sp.dagens) {
      sp.resultat.forsok = sp.forsok;
      meldIGang(S);
    } else {
      S.stat[sp.niva] = S.stat[sp.niva] || { spilt: 0, vunnet: 0 };
      S.stat[sp.niva].spilt += 1;
    }
    R.statistikk("ferdig", { niva: sp.niva, dagens: !!sp.dagens, vunnet: false, sek: sp.resultat.sek });
    R.si("Kabom! Det lå en mine der.");
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
    if (sp.dagens) {
      // Today's minefield: the time and which try it was. The level records are for free boards.
      const d = S.daglig;
      sp.resultat = { sek, forsok: sp.forsok };
      if (!d.dager[sp.dagens]) {
        d.dager[sp.dagens] = { sek, forsok: sp.forsok };
        if (d.sistNr === sp.dagNr - 1) d.rekke += 1;
        else if (d.sistNr !== sp.dagNr) d.rekke = 1;
        d.sistNr = Math.max(d.sistNr || 0, sp.dagNr);
        d.beste = Math.max(d.beste || 0, d.rekke);
        // Keep the last 400 days.
        const dager = Object.keys(d.dager).sort();
        for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete d.dager[k];
        // Only today's board counts for today (one finished after midnight does not).
        if (sp.dagens === R.dag().tekst) R.dagligFerdig({ vunnet: true, rekke: d.rekke, res: visTid(sek * 1000) });
      }
      sp.resultat.rekke = d.rekke;
    } else {
      const gml = S.rekorder[sp.niva] || null;
      sp.resultat = { sek, gml: gml ? gml.tid : null, nyRekord: !!gml && sek < gml.tid, forste: !gml };
      S.rekorder[sp.niva] = { tid: gml ? Math.min(gml.tid, sek) : sek };
      S.stat[sp.niva] = S.stat[sp.niva] || { spilt: 0, vunnet: 0 };
      S.stat[sp.niva].spilt += 1;
      S.stat[sp.niva].vunnet += 1;
    }
    R.statistikk("ferdig", { niva: sp.niva, dagens: !!sp.dagens, vunnet: true, sek });
    R.si(`Brettet er ryddet på ${visTid(sek * 1000)}.`);
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
      settHjemme(t.i);
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
    // The cell that has the focus is the cursor (Tab into the board, or a click).
    const fokusInn = (e) => {
      const el = e.target.closest(".ms-c");
      if (el) settHjemme(Number(el.dataset.i));
    };
    brett.addEventListener("focusin", fokusInn);
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
      brett.removeEventListener("focusin", fokusInn);
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
    settHjemme(i);
    if (sp.apen[i]) akkord(S, i);
    else if (somFlagg || S.flaggmodus) flagg(S, i, false);
    else apneCelle(S, i);
  }

  // The cursor, and the one cell Tab lands on.
  function settHjemme(i) {
    markor = i;
    if (hjemme === i) return;
    if (celler[hjemme]) celler[hjemme].tabIndex = -1;
    hjemme = i;
    if (celler[i]) celler[i].tabIndex = 0;
  }

  const erOversikt = () => {
    const vindu = R.$(".ms-vindu");
    return !!(vindu && vindu.classList.contains("oversikt"));
  };
  // Out of the overview: finger-sized cells with cell i in the middle of the frame.
  function zoomInnVed(S, i) {
    const sp = S.spill;
    S.zoom[sp.niva] = 1;
    tilpass(S);
    const rulle = R.$(".ms-rulle");
    const el = celler[i];
    if (rulle && el) {
      const r = rulle.getBoundingClientRect();
      const c = el.getBoundingClientRect();
      rulle.scrollLeft += c.left + c.width / 2 - (r.left + r.width / 2);
      rulle.scrollTop += c.top + c.height / 2 - (r.top + r.height / 2);
    }
    kanter();
    R.lagre();
  }

  function flyttMarkor(S, i) {
    const sp = S.spill;
    const til = R.klamp(i, 0, antallCeller(sp) - 1);
    if (erOversikt()) zoomInnVed(S, til);
    settHjemme(til);
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
    // The one-letter keys (F, + and −) only work from the board or with nothing focused, so they
    // never get in the way of a button, a link or speech control.
    const m = e.target;
    const fritt = m === document.body || m === document.documentElement || !!(m && m.closest && m.closest(".ms-brett"));
    if (k === "+" || k === "=" || k === "-") {
      if (!fritt) return;
      e.preventDefault();
      return H.zoom({ dataset: { v: k === "-" ? "-1" : "1" } }, e, S);
    }
    if (sp.ferdig) return;
    const PIL = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (PIL[k]) {
      e.preventDefault();
      if (markor < 0) return flyttMarkor(S, hjemme >= 0 ? hjemme : ((sp.h / 2) | 0) * sp.b + ((sp.b / 2) | 0));
      const x = R.klamp((markor % sp.b) + PIL[k][0], 0, sp.b - 1);
      const y = R.klamp(((markor / sp.b) | 0) + PIL[k][1], 0, sp.h - 1);
      flyttMarkor(S, y * sp.b + x);
    } else if ((k === "Enter" || k === " ") && markor >= 0 && (e.target === document.body || e.target === document.documentElement)) {
      // A focused cell or button gets its own click from the browser; with nothing focused the cursor acts.
      e.preventDefault();
      handlingPa(S, markor, false);
    } else if ((k === "f" || k === "F") && markor >= 0 && fritt) {
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
    const rek = sp.dagens ? null : S.rekorder[sp.niva];
    const ekstra = sp.dagens ? (sp.forsok > 1 ? ` · ${sp.forsok}. forsøk` : "") : rek ? ` · rekord ${visTid(rek.tid * 1000)}` : "";
    return `<div class="ms-hud">
      <span class="ms-stat"><small>Miner</small><b><span class="ms-bombe" aria-hidden="true"></span><span id="ms-igjen">${sp.miner - flaggTotalt(sp)}</span></b></span>
      <button class="ms-fjes" data-h="ny" aria-label="${sp.dagens ? "Start brettet på nytt" : "Nytt brett"}">${R.figur()}<i class="ms-omstart" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg></i></button>
      <span class="ms-stat"><small>Tid${ekstra}</small><b id="ms-tid">${visTid(tidMs(sp))}</b></span>
    </div>`;
  }

  function kontrollHtml(S) {
    const sp = S.spill;
    const zoom = sp.niva !== "lett";
    return `<p class="ms-merke"${sp.trygg ? "" : " hidden"}><span aria-hidden="true">✓</span> Uten gjetting</p>
    <div class="ms-kontroll${zoom ? " med-zoom" : ""}">
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

  // A little calendar page with today's date, and the date in words.
  const kalender = (d) => `<span class="ms-kal" aria-hidden="true"><small>${esc(MANED[Number(d.tekst.slice(5, 7)) - 1].slice(0, 3))}</small><b>${Number(d.tekst.slice(8, 10))}</b></span>`;
  const ukedag = (nr) => UKEDAG[(((nr + 4) % 7) + 7) % 7]; // day 0 (1 Jan 1970) was a Thursday
  const datoTekst = (tekst) => `${Number(tekst.slice(8, 10))}. ${MANED[Number(tekst.slice(5, 7)) - 1]}`;

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

  // The mascot after a win: a relieved smile, calm brows, no sweat drop, the flag waving. It is
  // made from the mascot's own drawing; if that drawing changes, the usual face is shown.
  function gladFigur() {
    const svg = window.RusjGjengen.svg("minesveiperen")
      .replace('d="M46 92 Q52 87 58 92 Q64 97 70 92 Q73 89 76 91"', 'd="M43 86 Q60 104 77 86"')
      .replace('d="M28 46 Q38 40 50 38M92 46 Q82 40 70 38"', 'd="M28 43 Q39 35 50 40M92 43 Q81 35 70 40"')
      .replace(/<path d="M98 38 q8 10 0 15 q-8 -5 0 -15z"[^>]*>/, "")
      .replace('<path d="M62 -7 L88 1 L62 10Z"', '<path class="ms-vaie" d="M62 -7 L88 1 L62 10Z"');
    return `<span class="figur-ramme ms-glad">${svg}</span>`;
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
    pagar: (S) => iGang(S.spill) || iGang(S.annet),

    tilstand: () => ({
      oppsett: { niva: "lett", uten: true },
      rekorder: {},
      stat: {},
      zoom: { middels: 1, ekspert: 1, tolv: 0 },
      flaggmodus: false,
      daglig: { dager: {}, rekke: 0, beste: 0, sistNr: 0, forsok: null },
      spill: null,
      annet: null,
    }),

    lastet(S) {
      const o = S.oppsett || {};
      S.oppsett = { niva: NIVA_ID.includes(o.niva) ? o.niva : "lett", uten: o.uten !== false };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      if (!S.stat || typeof S.stat !== "object") S.stat = {};
      if (!S.zoom || typeof S.zoom !== "object") S.zoom = { middels: 1, ekspert: 1, tolv: 0 };
      S.flaggmodus = !!S.flaggmodus;
      const d = S.daglig;
      if (!d || typeof d !== "object" || !d.dager || typeof d.dager !== "object") S.daglig = { dager: {}, rekke: 0, beste: 0, sistNr: 0, forsok: null };
      else {
        for (const k of Object.keys(d.dager)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d.dager[k] || !(d.dager[k].sek > 0)) delete d.dager[k];
        d.rekke = Math.max(0, Math.floor(Number(d.rekke) || 0));
        d.beste = Math.max(d.rekke, Math.floor(Number(d.beste) || 0));
        d.sistNr = Math.floor(Number(d.sistNr) || 0);
        if (!d.forsok || typeof d.forsok.dato !== "string" || !(d.forsok.n >= 1)) d.forsok = null;
      }
      const idag = R.dag().tekst;
      // A saved board must have the shape of its level; today's minefield also its date and first cell.
      const gyldig = (sp) => {
        if (!sp || typeof sp !== "object") return false;
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
        if (!ok) return false;
        sp.tid = Number(sp.tid) || 0;
        if (typeof sp.dagens === "string") {
          // A daily from another day is gone; so is one without its mines or its first cell.
          if (sp.dagens !== idag || !Number.isInteger(sp.dagNr) || !sp.mine || !Number.isInteger(sp.start) || sp.start < 0 || sp.start >= n || sp.mine[sp.start]) return false;
          sp.forsok = Math.max(1, Math.floor(Number(sp.forsok) || 1));
          sp.uten = true;
          sp.trygg = sp.trygg !== false;
        } else {
          if (sp.niva === "tolv") return false;
          sp.dagens = null;
          sp.dagNr = null;
          sp.start = -1;
          sp.forsok = 0;
          sp.uten = sp.uten !== false;
          sp.trygg = !!sp.trygg && !!sp.mine;
          if (!sp.mine) sp.startet = false;
        }
        return true;
      };
      if (!gyldig(S.spill)) S.spill = null;
      if (!gyldig(S.annet) || (S.spill && erDag(S.spill) === erDag(S.annet))) S.annet = null;
      if (!S.spill && S.annet) {
        S.spill = S.annet;
        S.annet = null;
      }
      if (S.skjerm === "slutt" && (!S.spill || !S.spill.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!S.spill || S.spill.ferdig)) S.skjerm = S.spill ? "slutt" : "hjem";
      // The front page reads the daily from the kit's own key: say it again on every load.
      const lost = S.daglig.dager[idag];
      if (lost) R.dagligFerdig({ vunnet: true, rekke: S.daglig.rekke, res: visTid(lost.sek * 1000) });
    },

    // rusj.no/minesveiperen/#dagens (the front page's «I dag») opens today's minefield.
    vedHash: (S, hash) => (hash === "dagens" ? apneDagens(S) : null),

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
        "Med «Uten gjetting» kan hvert brett ryddes med logikk alene. Smeller det, fantes det et trygt trekk.",
        "Dagens minefelt er det samme for alle i hele landet. Det blir større utover uka: 9 × 9 fra mandag, 12 × 12 fredag og lørdag, 16 × 16 på søndag.",
        "Med tastatur: Tab til brettet, piltaster flytter, Enter åpner, F setter flagg, + og − zoomer.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const fri = finn(S, false);
          const friAktiv = iGang(fri);
          const d = R.dag();
          const dag = dagensSpill(S);
          const lost = S.daglig.dager[d.tekst];
          const r = rekke(S);
          const f = S.daglig.forsok && S.daglig.forsok.dato === d.tekst ? S.daglig.forsok.n : 0;
          const rek = NIVA_ID.filter((n) => S.rekorder[n]).map((n) => `<li><b>${esc(NIVAER[n].navn)}</b> ${visTid(S.rekorder[n].tid * 1000)}</li>`);
          const niva = NIVAER[S.oppsett.niva].navn.toLowerCase();
          const friKnapp = (knapp) => (friAktiv ? knapp(`Fortsett · ${NIVAER[fri.niva].navn.toLowerCase()} · ${visTid(fri.tid)}`, "fortsett") : knapp(`Start spill · ${niva}`, "nytt"));
          let knapper;
          if (!lost) {
            // Today's minefield is the main button until it is solved; the free board is one tap away.
            const [b, h] = M.DAGLIG_FORMER[M.dagligNiva(d.nr)];
            const navn = ukedag(d.nr);
            const tittel = iGang(dag) ? `Fortsett dagens · ${visTid(dag.tid)}` : f > 0 ? "Prøv dagens igjen" : "Dagens minefelt";
            const nr = iGang(dag) ? dag.forsok : f + 1; // which try is under way, or comes next
            const under = `${navn[0].toUpperCase() + navn.slice(1)} · ${b} × ${h}${nr > 1 ? ` · ${nr}. forsøk` : r > 0 ? ` · 🔥 ${R.flertall(r, "dag", "dager")} på rad` : " · uten gjetting"}`;
            knapper =
              R.ui.knapp("", "dagens", { variant: "stor", tekstHtml: `${kalender(d)}<span class="ms-dagknapp"><b>${esc(tittel)}</b><small>${esc(under)}</small></span>` }) + friKnapp(R.ui.knapp2);
          } else {
            knapper =
              friKnapp(R.ui.knapp) +
              `<p class="ms-daglinje">✓ Dagens minefelt er ryddet på ${visTid(lost.sek * 1000)}${r > 1 ? ` · 🔥 ${r} dager på rad` : ""}</p>${nedtellingHtml()}`;
          }
          return (
            R.ui.spillhjem({
              undertittel: "Logikk",
              slagordHtml: "Finn de trygge rutene.<br><em>Ikke trå på en mine!</em>",
              // With a free board under way, «Nytt spill» goes by the level choice.
              knapperHtml: knapper + R.ui.lenkerad(R.ui.lenke(friAktiv ? "Nytt spill" : "Bytt nivå", "bytt"), R.ui.lenke("Slik spiller du", "regler")),
              merker: [
                ["3", "nivåer"],
                ["1", "nytt hver dag"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="ms-rekorder" aria-label="Dine beste tider"><p class="etikett">Dine beste tider</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
        inn(S) {
          if (S.daglig.dager[R.dag().tekst]) startNedtelling();
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
            ${R.ui.bryter("uten", S.oppsett.uten, "Uten gjetting", "Brettet kan alltid ryddes med logikk.")}
            <p class="hjelp">Første trykk er alltid trygt.</p>
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`,
      },

      spill: {
        tittel: (S) => (S.spill.dagens ? "Dagens minefelt" : NIVAER[S.spill.niva].navn),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">${sp.dagens ? "Dagens minefelt" : `Minesveiper, ${esc(NIVAER[sp.niva].navn.toLowerCase())}`}</h1>
            <div class="ms-spill">
              ${hudHtml(S)}
              <div class="ms-vindu${S.flaggmodus ? " flaggmodus" : ""}">
                <div class="ms-rulle">
                  <div class="ms-brett" style="--kol:${sp.b}" role="group" aria-label="Brettet, ${sp.b} ganger ${sp.h} ruter">${brettHtml(sp)}</div>
                </div>
                <div class="ms-kanter" aria-hidden="true"><i class="v"></i><i class="h"></i><i class="o"></i><i class="n"></i></div>
                <button class="ms-lupe" data-h="lupe" data-stille hidden aria-label="Zoom inn på brettet"><span>Trykk for å zoome inn</span></button>
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
            // Today's minefield: the given first cell in view.
            const start = celler[S.spill.start];
            if (start) {
              const r = rulle.getBoundingClientRect();
              const c = start.getBoundingClientRect();
              rulle.scrollLeft += c.left + c.width / 2 - (r.left + r.width / 2);
              rulle.scrollTop += c.top + c.height / 2 - (r.top + r.height / 2);
            }
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
          meldIGang(S);
          celler = [];
          tegnet = [];
          markor = -1;
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        // A solo result: the top bar says what was played ("Kåringen" is for ranked players).
        tittel: (S) => (S.spill && S.spill.dagens ? "Dagens minefelt" : S.spill && NIVAER[S.spill.niva] ? `${NIVAER[S.spill.niva].navn} · ${S.spill.b} × ${S.spill.h}` : "Minesveiper"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const N = NIVAER[sp.niva];
          const r = sp.resultat || { sek: Math.round(sp.tid / 1000), andel: 0 };
          const alle = '<a class="lenke" href="/">Alle spill</a>';
          const nyttFritt = R.ui.lenke(`Nytt brett · ${NIVAER[S.oppsett.niva].navn.toLowerCase()}`, "igjen");
          if (sp.dagens) {
            const dagEtikett = `Dagens minefelt · ${ukedag(sp.dagNr)} ${datoTekst(sp.dagens)}`;
            // The page may stay open past midnight: then a new minefield is ready.
            const gammel = sp.dagens !== R.dag().tekst;
            if (sp.vunnet) {
              const forsok = r.forsok || 1;
              return `
                <div class="banner aksent">
                  ${gladFigur()}
                  <p class="etikett">${esc(dagEtikett)}</p>
                  <h1 id="skjerm-tittel">${forsok === 1 ? "Rent bord!" : "Godt jobba!"}</h1>
                </div>
                <div class="ms-resultat">
                  <div class="ms-tall"><b>${visTid(r.sek * 1000)}</b><span>tid</span></div>
                  <div class="ms-tall"><b>${forsok}.</b><span>forsøk</span></div>
                </div>
                <div class="ms-dagboks">
                  ${r.rekke ? `<p class="ms-rekke"><span aria-hidden="true">🔥</span> ${R.flertall(r.rekke, "dag", "dager")} på rad</p>` : ""}
                  ${gammel ? '<p class="ms-nedtelling"><b>Et nytt minefelt er klart!</b></p>' : nedtellingHtml()}
                </div>
                ${miniBrett(sp)}
                ${R.ui.flereSpill({ antall: 1 })}
                ${R.ui.dokk(gammel ? R.ui.knapp("Dagens minefelt", "dagens") : R.ui.knapp("Del resultatet", "del"), R.ui.lenkerad(nyttFritt, alle))}`;
            }
            return `
              <div class="banner">
                ${R.figur("minesveiperen", "ms-sotet")}
                <p class="etikett">${esc(dagEtikett)}</p>
                <h1 id="skjerm-tittel">Kabom!</h1>
              </div>
              <div class="ms-resultat">
                <div class="ms-tall"><b>${r.andel} %</b><span>ryddet</span></div>
                <div class="ms-tall"><b>${r.forsok || 1}.</b><span>forsøk</span></div>
              </div>
              <p class="hjelp">Dagens minefelt kan ryddes helt uten å gjette. Det samme brettet venter – ta det en gang til!</p>
              ${miniBrett(sp)}
              ${R.ui.dokk(R.ui.knapp(gammel ? "Dagens minefelt" : "Prøv igjen", "dagens"), R.ui.lenkerad(nyttFritt, alle))}`;
          }
          const dokk =
            R.ui.flereSpill({ antall: 1 }) +
            R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "bytt"), alle));
          if (sp.vunnet) {
            const linje = r.nyRekord
              ? `Ny personlig rekord på ${N.navn.toLowerCase()}! Forrige: ${visTid(r.gml * 1000)}.`
              : r.gml
                ? `Rekorden din på ${N.navn.toLowerCase()}: ${visTid(Math.min(r.gml, r.sek) * 1000)}.`
                : `Første seier på ${N.navn.toLowerCase()} – nå har du en rekord å slå!`;
            return `
              <div class="banner aksent">
                ${gladFigur()}
                <p class="etikett">${esc(N.navn)} · ${N.b} × ${N.h} · ${N.miner} miner</p>
                <h1 id="skjerm-tittel">${r.nyRekord ? "Ny rekord!" : "Godt jobba!"}</h1>
              </div>
              <div class="ms-resultat">
                <div class="ms-tall${r.nyRekord ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>tid</span>${r.nyRekord ? '<i class="ms-ny">Rekord!</i>' : ""}</div>
                <div class="ms-tall"><b>${visTid((r.gml ? Math.min(r.gml, r.sek) : r.sek) * 1000)}</b><span>rekord</span></div>
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
              <div class="ms-tall"><b>${r.funnet || 0} av ${N.miner}</b><span>miner funnet</span></div>
            </div>
            <p class="hjelp">${sp.trygg ? "Dette brettet kunne ryddes uten å gjette. Se etter tallet som røper minen neste gang!" : r.andel >= 80 ? "Det var nære på! Én mine skilte deg fra seieren." : "Minene gjemmer seg godt. Neste brett kan bli ditt!"}</p>
            ${miniBrett(sp)}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          if (sp.dagens && sp.vunnet && sp.dagens === R.dag().tekst) startNedtelling();
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
      // Only a free board under way is lost to a new one: today's minefield has its own place.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(finn(S, false)))) || !fortsatt()) return;
        nyttSpill(S, S.oppsett.niva);
        R.gaTil("spill");
      },
      bytt: () => R.gaTil("oppsett"),
      fortsett: (el, e, S) => R.gaTil(hent(S, false) && !S.spill.ferdig ? "spill" : "hjem"),
      // Today's minefield: start it, go on with it, or see how it went.
      dagens: (el, e, S) => R.gaTil(apneDagens(S)),
      niva(el, e, S) {
        S.oppsett.niva = NIVA_ID.includes(el.dataset.v) ? el.dataset.v : "lett";
        R.vis();
      },
      uten(el, e, S) {
        S.oppsett.uten = !S.oppsett.uten;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(finn(S, false)))) || !fortsatt()) return;
        nyttSpill(S, S.oppsett.niva);
        R.gaTil("spill");
      },
      // After the daily too: a fresh free board.
      igjen(el, e, S) {
        nyttSpill(S, S.spill && !S.spill.dagens ? S.spill.niva : S.oppsett.niva);
        R.gaTil("spill");
      },
      // The face: a new board at once (asks first when a game is well under way). Today's
      // minefield starts over on the same board, as the next try.
      async ny(el, e, S) {
        const sp = S.spill;
        const iGang = sp && !sp.ferdig && sp.startet && apneTrygge(sp) > 0;
        const dag = !!(sp && sp.dagens);
        if (iGang) {
          const fortsatt = R.vakt();
          const ja = dag
            ? await R.bekreft("Starte på nytt?", `Det samme brettet, fra start. Det blir ${sp.forsok + 1}. forsøk.`, "Start på nytt", "Avbryt")
            : await R.bekreft("Nytt brett?", "Brettet du holder på med, forsvinner.", "Nytt brett", "Avbryt");
          if (!ja || !fortsatt()) return;
        }
        nyttSpill(S, dag ? "dagens" : sp ? sp.niva : S.oppsett.niva);
        R.gaTil("spill");
      },
      // The overview of a big board is one button: zoom in where the tap landed.
      lupe(el, e, S) {
        const sp = S.spill;
        const brett = R.$(".ms-brett");
        if (!sp || !brett) return;
        let i = markor >= 0 ? markor : hjemme;
        if (e && e.detail !== 0 && (e.clientX || e.clientY)) {
          const b = brett.getBoundingClientRect();
          const kol = R.klamp(Math.floor(((e.clientX - b.left) / b.width) * sp.b), 0, sp.b - 1);
          const rad = R.klamp(Math.floor(((e.clientY - b.top) / b.height) * sp.h), 0, sp.h - 1);
          i = rad * sp.b + kol;
        }
        zoomInnVed(S, R.klamp(i, 0, antallCeller(sp) - 1));
        settHjemme(R.klamp(i, 0, antallCeller(sp) - 1));
        if (e && e.detail === 0 && celler[markor]) celler[markor].focus({ preventScroll: true });
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.dagens || !sp.vunnet || !sp.resultat) return;
        const r = sp.resultat;
        const dato = `${Number(sp.dagens.slice(8, 10))}.${Number(sp.dagens.slice(5, 7))}`;
        const tekst = `💣 Minesveiperen ${dato} · ${visTid(r.sek * 1000)} på ${r.forsok > 1 ? `${r.forsok}.` : "første"} forsøk${r.rekke > 1 ? ` · 🔥 ${r.rekke} dager på rad` : ""}. Klarer du dagens minefelt?`;
        R.del("Minesveiperen – dagens minefelt", tekst, "https://rusj.no/minesveiperen/");
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
        // Zoomed out while a cell had the focus: the map is one button, so the focus goes there.
        const lupe = R.$(".ms-lupe");
        if (lupe && !lupe.hidden && document.activeElement && document.activeElement.closest && document.activeElement.closest(".ms-brett")) lupe.focus({ preventScroll: true });
        R.lagre();
      },
    }),
  });

  // For the tests and curious minds: the engine is also reachable from the console.
  window.Minesveiperen = motor;
})();
