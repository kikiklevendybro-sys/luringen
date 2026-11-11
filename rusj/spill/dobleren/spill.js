/* Dobleren — 2048.
   Swipe (or use the arrow keys or the arrow buttons) and all tiles slide; two equal tiles that meet
   become one with double the value. Reach 2048 – and keep going if you like. 4 × 4 or 5 × 5.
   One undo per move: the last move can be taken back, but not two in a row. New tiles come from a
   saved seed, so an undo followed by the same move gives the same new tile (no fishing for luck).
   Tiles are DOM elements that slide with CSS transitions: an outer layer moves (translate), an
   inner layer pops (scale), so the animations never fight each other.
   «Dagens lynrunde»: one 3 × 3 sprint a day with the tiles from the date (the same for everyone),
   three tries, the best one counts, no undo. It can be under way beside a free game.
   For a screen reader the board is a hidden table, and every move is said in a sentence. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;

  const STORRELSER = [4, 5];
  const MAL = 2048;
  // «Dagens lynrunde»
  const DAG_STR = 3;
  const DAG_FORSOK = 3;
  const MEDALJER = [
    [32, "bronse", "🥉"],
    [64, "sølv", "🥈"],
    [128, "gull", "🥇"],
  ];
  const UKEDAG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const MANED = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  // Without a prototype, so a value like "__proto__" is simply not a direction.
  const RETNINGER = Object.assign(Object.create(null), {
    venstre: [-1, 0],
    hoyre: [1, 0],
    opp: [0, -1],
    ned: [0, 1],
  });
  const SVEIP = 24; // px before a swipe counts
  const GLID = 110; // ms for a slide (keep in sync with spill.css)

  let H; // actions
  let elementer = new Map(); // tile id → element
  let ventende = []; // elements that merged away and disappear after the slide
  let ventId = null;
  let las = false; // the end animation is playing

  // Own copies of the hash and the random numbers (the same generator as the kit's): «Dagens
  // lynrunde» must give the same tiles on every phone for good, whatever happens to the kit.
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

  // ---------- Two games at once ----------
  // Today's sprint and a free game can both be under way. S.spill is the one on the screen; the
  // other one waits in S.annet (never two of the same kind).

  const erDag = (sp) => !!(sp && sp.dagens);
  const iGang = (sp) => !!(sp && !sp.ferdig && (sp.trekk > 0 || !sp.dagens));
  const finn = (S, dag) => (S.spill && erDag(S.spill) === dag ? S.spill : S.annet && erDag(S.annet) === dag ? S.annet : null);
  // Worth keeping while it waits: a game with moves in it, and the finished sprint (its result can be shown again).
  const verdt = (sp) => !!sp && ((!sp.ferdig && sp.trekk > 0) || (erDag(sp) && sp.ferdig));
  // Puts the sprint (dag = true) or the free game on the screen. False when there is none.
  function hent(S, dag) {
    if (S.spill && erDag(S.spill) === dag) return true;
    if (!S.annet || erDag(S.annet) !== dag) return false;
    const t = S.spill;
    S.spill = S.annet;
    S.annet = verdt(t) ? t : null;
    return true;
  }
  // The record is written when a game ends or is left for a new one – never during play, so a
  // move that is taken back leaves no trace in it.
  function bokfor(S, sp) {
    if (!sp || sp.dagens || !STORRELSER.includes(sp.str)) return;
    const r = S.rekorder[sp.str] || { poeng: 0, flis: 0 };
    const na = { poeng: Math.max(r.poeng || 0, sp.poeng), flis: Math.max(r.flis || 0, storste(sp)) };
    if (na.poeng > 0) S.rekorder[sp.str] = na;
  }
  // Makes room for a new game of one kind; a game of the other kind is kept.
  function ryddFor(S, dag) {
    for (const sp of [S.spill, S.annet]) if (sp && erDag(sp) === dag && !sp.ferdig) bokfor(S, sp);
    const andre = finn(S, !dag);
    S.annet = verdt(andre) ? andre : null;
    S.spill = null;
  }
  // Today's sprint on this phone (under way or finished), if any.
  function dagensSpill(S) {
    const sp = finn(S, true);
    return sp && sp.dagens === R.dag().tekst ? sp : null;
  }
  // Tries started today.
  function forsokBrukt(S) {
    const f = S.daglig.forsok;
    return f && f.dato === R.dag().tekst ? f.n : 0;
  }
  // Days in a row with a finished sprint; the streak lives until a whole day is skipped.
  function rekke(S) {
    const d = S.daglig;
    return d.sistNr >= R.dag().nr - 1 ? d.rekke || 0 : 0;
  }

  // ---------- The game ----------

  // valg: 4 or 5 for a free game, or "dagens" for today's sprint.
  function nyttSpill(S, valg) {
    const dag = valg === "dagens";
    const str = dag ? DAG_STR : STORRELSER.includes(valg) ? valg : 4;
    ryddFor(S, dag);
    const d = dag ? R.dag() : null;
    const sp = {
      str,
      dagens: d ? d.tekst : null,
      dagNr: d ? d.nr : null,
      forsok: d ? forsokBrukt(S) + 1 : 0,
      fliser: [],
      nesteId: 1,
      poeng: 0,
      trekk: 0,
      // Today's sprint: the tiles come from the date, the same for everyone and for every try.
      fro: d ? fnv("dobleren:" + d.tekst) : R.nyttFro(),
      forrige: null,
      vant: false,
      over: false,
      ferdig: false,
      startBeste: dag ? 0 : (S.rekorder[str] && S.rekorder[str].poeng) || 0,
      resultat: null,
    };
    leggTil(sp);
    leggTil(sp);
    S.spill = sp;
    if (!dag) S.oppsett.str = str;
    las = false;
    R.statistikk("start", { str, dagens: dag });
  }

  // Today's sprint: the board (a new try, or the one under way) – or the result. The front page
  // (#dagens) shows the result once a try is finished; the button in the game starts the next try.
  function apneDagens(S, fraForside) {
    const sp = dagensSpill(S);
    const lost = S.daglig.dager[R.dag().tekst];
    // (A try that is dealt but not begun does not hide a finished one from the front page.)
    if (sp && !sp.ferdig && (sp.trekk > 0 || !(fraForside && lost))) {
      hent(S, true);
      return "spill";
    }
    const brukt = forsokBrukt(S);
    if (lost && (fraForside || brukt >= DAG_FORSOK)) return sp && sp.ferdig && hent(S, true) ? "slutt" : "hjem";
    if (brukt >= DAG_FORSOK) return "hjem";
    nyttSpill(S, "dagens");
    return "spill";
  }

  // The front page shows how far today's sprint has come, until the first try is finished (rusj/DAGLIG.md).
  function meldIGang(S) {
    const sp = S.spill;
    if (!sp || !sp.trekk || sp.ferdig || sp.dagens !== R.dag().tekst || S.daglig.dager[sp.dagens] || typeof R.dagligIGang !== "function") return;
    R.dagligIGang({ tekst: `${R.tall(sp.poeng)} poeng` });
  }

  // ---------- Countdown to the next sprint (midnight in Norway) ----------

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
  const nedtellingHtml = () => `<p class="db-nedtelling">Ny lynrunde om <b>${klokkeTekst(sekunderTilNy())}</b></p>`;
  // Ticks every second while a countdown is on the screen; at midnight the screen is drawn again.
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".db-nedtelling b");
      if (!el) return clearInterval(nedtellingId);
      if (R.dag().nr !== dag) {
        clearInterval(nedtellingId);
        return R.vis();
      }
      el.textContent = klokkeTekst(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(nedtellingId));
  }

  // A new 2 (nine times out of ten) or 4 in a random free cell, from the saved seed.
  function leggTil(sp) {
    const ledige = [];
    for (let y = 0; y < sp.str; y++) for (let x = 0; x < sp.str; x++) if (!sp.fliser.some((f) => f.x === x && f.y === y)) ledige.push([x, y]);
    if (!ledige.length) return null;
    const tilf = rng(sp.fro);
    const [x, y] = ledige[Math.floor(tilf() * ledige.length)];
    const v = tilf() < 0.9 ? 2 : 4;
    sp.fro = Math.floor(tilf() * 4294967296) >>> 0;
    const f = { id: sp.nesteId++, v, x, y };
    sp.fliser.push(f);
    return f;
  }

  const kopi = (sp) => ({ fliser: sp.fliser.map((f) => ({ ...f })), nesteId: sp.nesteId, poeng: sp.poeng, trekk: sp.trekk, fro: sp.fro, vant: sp.vant });

  // Slides everything one way. Returns null if nothing moved, else what happened (for the drawing).
  function flytt(sp, retning) {
    const [dx, dy] = RETNINGER[retning];
    const n = sp.str;
    const rute = Array.from({ length: n }, () => new Array(n).fill(null));
    for (const f of sp.fliser) rute[f.y][f.x] = f;
    const for1 = kopi(sp);
    const xs = Array.from({ length: n }, (_, i) => (dx === 1 ? n - 1 - i : i));
    const ys = Array.from({ length: n }, (_, i) => (dy === 1 ? n - 1 - i : i));
    const slatt = new Set(); // ids of tiles made by a merge this move
    const inn = new Map(); // id of a tile that merged away → where it went
    let poeng = 0;
    let flyttet = false;
    for (const y of ys)
      for (const x of xs) {
        const f = rute[y][x];
        if (!f) continue;
        let cx = x;
        let cy = y;
        while (cx + dx >= 0 && cx + dx < n && cy + dy >= 0 && cy + dy < n && !rute[cy + dy][cx + dx]) {
          cx += dx;
          cy += dy;
        }
        const nx = cx + dx;
        const ny = cy + dy;
        const nabo = nx >= 0 && nx < n && ny >= 0 && ny < n ? rute[ny][nx] : null;
        rute[y][x] = null;
        if (nabo && nabo.v === f.v && !slatt.has(nabo.id)) {
          const ny2 = { id: sp.nesteId++, v: f.v * 2, x: nx, y: ny };
          rute[ny][nx] = ny2;
          slatt.add(ny2.id);
          inn.set(f.id, { x: nx, y: ny });
          inn.set(nabo.id, { x: nx, y: ny });
          poeng += ny2.v;
          flyttet = true;
        } else {
          rute[cy][cx] = f;
          if (cx !== x || cy !== y) {
            f.x = cx;
            f.y = cy;
            flyttet = true;
          }
        }
      }
    if (!flyttet) return null;
    sp.forrige = for1;
    sp.fliser = [];
    for (const rad of rute) for (const f of rad) if (f) sp.fliser.push(f);
    sp.poeng += poeng;
    sp.trekk += 1;
    const ny = leggTil(sp);
    return { slatt, inn, poeng, ny: ny ? ny.id : null };
  }

  function kanFlytte(sp) {
    if (sp.fliser.length < sp.str * sp.str) return true;
    const v = (x, y) => (sp.fliser.find((f) => f.x === x && f.y === y) || {}).v;
    for (let y = 0; y < sp.str; y++)
      for (let x = 0; x < sp.str; x++) {
        if (x + 1 < sp.str && v(x, y) === v(x + 1, y)) return true;
        if (y + 1 < sp.str && v(x, y) === v(x, y + 1)) return true;
      }
    return false;
  }
  const storste = (sp) => sp.fliser.reduce((m, f) => Math.max(m, f.v), 0);

  // ---------- Drawing ----------

  const klasse = (v) => "db-v" + (v <= MAL * 2 ? v : "stor");
  const sifre = (v) => String(v).length;

  function flisEl(f, ekstra) {
    const el = document.createElement("div");
    el.className = "db-flis";
    el.dataset.id = String(f.id);
    el.style.setProperty("--x", f.x);
    el.style.setProperty("--y", f.y);
    el.innerHTML = `<span class="db-indre ${klasse(f.v)} s${sifre(f.v)}${ekstra ? " " + ekstra : ""}">${f.v}</span>`;
    el._v = f.v;
    return el;
  }

  function ryddVentende() {
    clearTimeout(ventId);
    for (const el of ventende) el.remove();
    ventende = [];
  }

  // Bring the DOM up to date with sp.fliser. info (from flytt): what to animate.
  function tegn(S, info) {
    const sp = S.spill;
    const lag = R.$(".db-lag");
    if (!sp || !lag) return;
    ryddVentende();
    const ids = new Set();
    for (const f of sp.fliser) {
      ids.add(f.id);
      let el = elementer.get(f.id);
      if (!el) {
        const ekstra = info ? (info.slatt.has(f.id) ? "slatt" : info.ny === f.id ? "ny" : "") : "";
        el = flisEl(f, R.rolig() ? "" : ekstra);
        lag.appendChild(el);
        elementer.set(f.id, el);
      } else {
        el.style.setProperty("--x", f.x);
        el.style.setProperty("--y", f.y);
      }
    }
    for (const [id, el] of Array.from(elementer)) {
      if (ids.has(id)) continue;
      elementer.delete(id);
      const mal = info && info.inn.get(id);
      if (mal && !R.rolig()) {
        el.style.setProperty("--x", mal.x);
        el.style.setProperty("--y", mal.y);
        el.classList.add("borte");
        ventende.push(el);
      } else el.remove();
    }
    if (ventende.length) ventId = setTimeout(ryddVentende, GLID + 30);
    oppdaterHud(S, info);
  }

  // Draw from scratch (new screen, undo, reload).
  function tegnPaNytt(S) {
    ryddVentende();
    const lag = R.$(".db-lag");
    if (!lag) return;
    lag.innerHTML = "";
    elementer = new Map();
    for (const f of S.spill.fliser) {
      const el = flisEl(f, "");
      lag.appendChild(el);
      elementer.set(f.id, el);
    }
    oppdaterHud(S);
  }

  // The best score to beat: the record of the board, or today's best try in the sprint.
  const beste = (S, str) => (S.rekorder[str] && S.rekorder[str].poeng) || 0;
  const malet = (S, sp) => (sp.dagens ? (S.daglig.dager[sp.dagens] || {}).poeng || 0 : beste(S, sp.str));

  // The board as a table for a screen reader (the tiles themselves are only a picture).
  function oppdaterTabell(sp) {
    const kropp = R.$(".db-tabell tbody");
    if (!kropp) return;
    let html = "";
    for (let y = 0; y < sp.str; y++) {
      html += "<tr>";
      for (let x = 0; x < sp.str; x++) {
        const f = sp.fliser.find((t) => t.x === x && t.y === y);
        html += `<td>${f ? f.v : "tom"}</td>`;
      }
      html += "</tr>";
    }
    kropp.innerHTML = html;
  }

  // A move in a sentence: «Venstre. 4 + 4 = 8. Ny 2 i rad 3, kolonne 1. 12 poeng.»
  const RETNINGSNAVN = { venstre: "Venstre", hoyre: "Høyre", opp: "Opp", ned: "Ned" };
  function lesOpp(sp, retning, info) {
    const slatt = Array.from(info.slatt)
      .map((id) => (sp.fliser.find((f) => f.id === id) || {}).v || 0)
      .sort((a, b) => b - a);
    const deler = [RETNINGSNAVN[retning] + "."];
    if (slatt.length > 3) deler.push(`${slatt.length} sammenslåinger, den største ${slatt[0]}.`);
    else for (const v of slatt) deler.push(`${v / 2} + ${v / 2} = ${v}.`);
    const ny = sp.fliser.find((f) => f.id === info.ny);
    if (ny) deler.push(`Ny ${ny.v} i rad ${ny.y + 1}, kolonne ${ny.x + 1}.`);
    deler.push(`${R.tall(sp.poeng)} poeng.`);
    R.si(deler.join(" "));
  }

  function oppdaterHud(S, info) {
    const sp = S.spill;
    oppdaterTabell(sp);
    const p = R.$("#db-poeng");
    if (p) p.textContent = R.tall(sp.poeng);
    const b = R.$("#db-beste");
    if (b) b.textContent = R.tall(Math.max(malet(S, sp), sp.poeng));
    const angre = R.$('[data-h="angre"]');
    if (angre) angre.disabled = !sp.forrige || sp.ferdig;
    if (info && info.poeng && !R.rolig()) {
      const boks = R.$(".db-poengboks");
      if (boks) {
        const pluss = document.createElement("span");
        pluss.className = "db-pluss";
        pluss.textContent = "+" + info.poeng;
        boks.appendChild(pluss);
        setTimeout(() => pluss.remove(), 700);
      }
    }
  }

  // Board size: the biggest square that fits; whole pixels per cell.
  function tilpass(S) {
    const flate = R.$(".db-flate");
    const brett = R.$(".db-brett");
    if (!flate || !brett || !S.spill) return;
    const n = S.spill.str;
    const plass = Math.min(flate.clientWidth - 4, flate.clientHeight - 12, n === 3 ? 420 : 520);
    const gap = n === 5 ? 8 : 10;
    const c = Math.max(40, Math.floor((plass - gap * (n + 1)) / n));
    brett.style.setProperty("--c", c + "px");
    brett.style.setProperty("--gap", gap + "px");
  }

  // ---------- Moves ----------

  function trekk(S, retning) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.over || las || R.arkApent() || !RETNINGER[retning]) return;
    if (R.$(".db-melding:not([hidden])")) return;
    const info = flytt(sp, retning);
    if (!info) {
      // Nothing can move that way: a small nudge so the swipe is not lost silently.
      const brett = R.$(".db-brett");
      if (brett && !R.rolig()) {
        brett.dataset.dytt = retning;
        brett.classList.remove("dytt");
        void brett.offsetWidth;
        brett.classList.add("dytt");
      }
      R.si("Ingenting flyttet seg.");
      return;
    }
    if (sp.dagens) {
      // The sprint has no undo (three tries instead); a try counts from its first move.
      sp.forrige = null;
      if (sp.trekk === 1) {
        S.daglig.forsok = { dato: sp.dagens, n: sp.forsok };
        meldIGang(S);
      }
    }
    tegn(S, info);
    lesOpp(sp, retning, info);
    const nyStor = Array.from(info.slatt).map((id) => sp.fliser.find((f) => f.id === id).v);
    const hoyest = nyStor.length ? Math.max(...nyStor) : 0;
    if (hoyest) {
      R.lyd.tone(330 * Math.log2(hoyest) * 0.25 + 260, 0, 0.09, "triangle", 0.12, 520 + Math.log2(hoyest) * 60);
      R.vibrer(hoyest >= 128 ? 22 : 8);
    } else R.lyd.tone(240, 0, 0.05, "sine", 0.06, 200);
    // 2048 for the first time: a party, then keep going or stop.
    if (!sp.vant && hoyest >= MAL) {
      sp.vant = true;
      R.lagre();
      const fortsatt = R.vakt();
      setTimeout(() => {
        if (!fortsatt()) return;
        visMelding(S, "vant");
        R.lyd.fanfare();
        R.konfetti();
        R.vibrer([40, 60, 40, 60, 160]);
      }, GLID + 120);
      return;
    }
    if (!kanFlytte(sp)) return over(S);
    R.lagre();
  }

  function angre(S) {
    const sp = S.spill;
    if (!sp || !sp.forrige || sp.ferdig || las) return;
    Object.assign(sp, sp.forrige);
    sp.forrige = null;
    sp.over = false;
    tegnPaNytt(S);
    skjulMelding();
    R.lyd.tone(520, 0, 0.1, "triangle", 0.09, 330);
    R.si(`Angret. ${R.tall(sp.poeng)} poeng.`);
    R.lagre();
  }

  function over(S) {
    const sp = S.spill;
    sp.over = true;
    // The result is saved at once: «tilbake» or a reload during the message must never leave a
    // locked board behind. Only the move to the result screen waits.
    ferdigstill(S);
    las = true;
    R.lyd.tone(330, 0.05, 0.22, "triangle", 0.1, 220);
    R.vibrer([60, 40, 60]);
    R.si(`Tomt for trekk. ${R.tall(sp.poeng)} poeng.`);
    const fortsatt = R.vakt();
    setTimeout(() => {
      if (!fortsatt()) return;
      visMelding(S, "over");
    }, GLID + 200);
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 1200 : 2200,
    );
  }

  // The result and the record; the end screen still offers to take the last move back.
  function ferdigstill(S) {
    const sp = S.spill;
    if (sp.ferdig) return;
    sp.ferdig = true;
    if (sp.dagens) {
      // Today's sprint: the best of the day's tries counts, and the first finished try keeps the streak.
      const d = S.daglig;
      const gml = d.dager[sp.dagens] || null;
      const na = { poeng: Math.max(gml ? gml.poeng : 0, sp.poeng), flis: Math.max(gml ? gml.flis : 0, storste(sp)), forsok: Math.max(gml ? gml.forsok : 0, sp.forsok) };
      if (!gml) {
        if (d.sistNr === sp.dagNr - 1) d.rekke += 1;
        else if (d.sistNr !== sp.dagNr) d.rekke = 1;
        d.sistNr = Math.max(d.sistNr || 0, sp.dagNr);
        d.beste = Math.max(d.beste || 0, d.rekke);
      }
      d.dager[sp.dagens] = na;
      // Keep the last 400 days.
      const dager = Object.keys(d.dager).sort();
      for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete d.dager[k];
      sp.resultat = { poeng: sp.poeng, flis: storste(sp), forsok: sp.forsok, gml: gml ? gml.poeng : 0, bedre: !!gml && sp.poeng > gml.poeng, forste: !gml, rekke: d.rekke };
      // Only today's sprint counts for today (one finished after midnight does not).
      if (sp.dagens === R.dag().tekst) R.dagligFerdig({ vunnet: true, rekke: d.rekke, res: `${R.tall(na.poeng)} poeng` });
    } else {
      const gml = sp.startBeste || 0;
      sp.resultat = { poeng: sp.poeng, flis: storste(sp), nyRekord: sp.poeng > gml && gml > 0, forste: !gml, gml };
      // What the record was, so «Angre siste trekk» on the result screen can take this back too.
      sp.forRekord = S.rekorder[sp.str] ? { ...S.rekorder[sp.str] } : null;
      bokfor(S, sp);
    }
    R.statistikk("ferdig", { str: sp.str, dagens: !!sp.dagens, poeng: sp.poeng, flis: storste(sp), trekk: sp.trekk });
    R.lagre();
  }
  function avslutt(S) {
    ferdigstill(S);
    R.gaTil("slutt");
  }

  // Messages sit under the board, over the arrow buttons: the board itself stays sharp, so the
  // player sees the 2048 tile they just made (it pops and glows) or the full board that ended it.
  function visMelding(S, type) {
    const m = R.$(".db-melding");
    if (!m) return;
    if (type === "vant")
      m.innerHTML = `<div class="db-meldingskort vant">
        <h2 id="db-melding-tittel">2048!</h2>
        <p>Du klarte det! Vil du se hvor langt du kommer?</p>
        <div class="knapprad">${R.ui.knapp2("Se resultatet", "ferdig")}${R.ui.knapp("Fortsett", "fortsett-etter")}</div>
      </div>`;
    else
      m.innerHTML = `<div class="db-meldingskort">
        <h2 id="db-melding-tittel">Tomt for trekk!</h2>
        <p>Ingen brikker kan flytte seg.</p>
      </div>`;
    m.hidden = false;
    m.className = "db-melding " + type;
    // Keyboard users land on «Fortsett» (the arrow keys wait while the message is up).
    const knapp = m.querySelector(".knapp");
    if (knapp) knapp.focus({ preventScroll: true });
    if (type === "vant" && !R.rolig())
      for (const [id, el] of elementer) {
        const f = S.spill.fliser.find((x) => x.id === id);
        if (f && f.v >= MAL) el.classList.add("feiret");
      }
  }
  function skjulMelding() {
    const m = R.$(".db-melding");
    if (m) {
      m.hidden = true;
      m.innerHTML = "";
    }
    R.$$(".db-flis.feiret").forEach((el) => el.classList.remove("feiret"));
  }

  // ---------- Swipes and keys ----------

  function bindFlate(S, rot) {
    const flate = R.$(".db-spill", rot);
    if (!flate) return;
    let start = null;
    const ned = (e) => {
      if (e.target.closest("button, a") || (e.pointerType === "mouse" && e.button !== 0)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, brukt: false };
    };
    // The move happens as soon as the finger has travelled far enough – no waiting for the lift.
    const flytt = (e) => {
      if (!start || e.pointerId !== start.id || start.brukt) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SVEIP) return;
      start.brukt = true;
      trekk(R.S, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "hoyre" : "venstre") : dy > 0 ? "ned" : "opp");
    };
    const opp = (e) => {
      if (start && e.pointerId === start.id) start = null;
    };
    const nei = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    flate.addEventListener("pointerdown", ned);
    window.addEventListener("pointermove", flytt);
    window.addEventListener("pointerup", opp);
    window.addEventListener("pointercancel", opp);
    // No scrolling, pull-to-refresh or zoom on the play area (touch-action: none in the CSS too).
    flate.addEventListener("touchmove", nei, { passive: false });
    flate.addEventListener("gesturestart", nei);
    flate.addEventListener("contextmenu", nei);
    R.vedForlat(() => {
      flate.removeEventListener("pointerdown", ned);
      window.removeEventListener("pointermove", flytt);
      window.removeEventListener("pointerup", opp);
      window.removeEventListener("pointercancel", opp);
      flate.removeEventListener("touchmove", nei, { passive: false });
      flate.removeEventListener("gesturestart", nei);
      flate.removeEventListener("contextmenu", nei);
    });
  }

  const TASTER = Object.assign(Object.create(null), {
    ArrowLeft: "venstre",
    ArrowRight: "hoyre",
    ArrowUp: "opp",
    ArrowDown: "ned",
    a: "venstre",
    d: "hoyre",
    w: "opp",
    s: "ned",
  });
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || R.arkApent() || e.altKey) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return angre(S);
    }
    if (e.ctrlKey || e.metaKey) return;
    // The letter keys (W, A, S, D and U) only work with nothing focused or from the board, so
    // they never get in the way of a button, a link or speech control. The arrow keys always work.
    const m = e.target;
    const fritt = m === document.body || m === document.documentElement || !!(m && m.closest && m.closest(".db-flate"));
    if (e.key.length === 1 && !fritt) return;
    const r = TASTER[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (r) {
      e.preventDefault();
      if (!e.repeat || !R.rolig()) trekk(S, r);
    } else if (e.key === "u" || e.key === "U") angre(S);
  });

  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass(R.S);
  });

  const fastSide = (pa) => document.documentElement.classList.toggle("db-fast", !!pa);

  // ---------- Pieces of the screens ----------

  const PIL = {
    venstre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    opp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg>',
    ned: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>',
    hoyre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  };
  const PILNAVN = { venstre: "Til venstre", opp: "Opp", ned: "Ned", hoyre: "Til høyre" };
  const IKON = {
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    ny: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  };

  function miniBrett(sp) {
    const celler = [];
    for (let y = 0; y < sp.str; y++)
      for (let x = 0; x < sp.str; x++) {
        const f = sp.fliser.find((t) => t.x === x && t.y === y);
        celler.push(f ? `<i class="${klasse(f.v)} s${sifre(f.v)}">${f.v}</i>` : "<i></i>");
      }
    return `<div class="db-mini" style="--n:${sp.str}" aria-hidden="true">${celler.join("")}</div>`;
  }

  // A little calendar page with today's date, and the date in words.
  const kalender = (d) => `<span class="db-kal" aria-hidden="true"><small>${esc(MANED[Number(d.tekst.slice(5, 7)) - 1].slice(0, 3))}</small><b>${Number(d.tekst.slice(8, 10))}</b></span>`;
  const ukedag = (nr) => UKEDAG[(((nr + 4) % 7) + 7) % 7]; // day 0 (1 Jan 1970) was a Thursday
  const datoTekst = (tekst) => `${Number(tekst.slice(8, 10))}. ${MANED[Number(tekst.slice(5, 7)) - 1]}`;
  // The medals of the sprint: the 32-, 64- and 128-tile.
  const medalje = (flis) => MEDALJER.filter(([v]) => flis >= v).pop() || null;
  function medaljerHtml(flis) {
    const tatt = MEDALJER.filter(([v]) => flis >= v).length;
    return `<ul class="db-medaljer" aria-label="Medaljer: ${tatt} av 3">${MEDALJER.map(
      ([v, navn]) => `<li class="${navn === "sølv" ? "solv" : navn}${flis >= v ? " tatt" : ""}"><b>${v}</b><span>${navn}${flis >= v ? ' <i aria-hidden="true">✓</i><i class="vh"> tatt</i>' : ""}</span></li>`,
    ).join("")}</ul>`;
  }

  // ---------- Start ----------

  R.start({
    id: "dobleren",
    versjon: 1,
    pagar: (S) => iGang(S.spill) || iGang(S.annet),

    tilstand: () => ({
      oppsett: { str: 4 },
      rekorder: {},
      daglig: { dager: {}, rekke: 0, beste: 0, sistNr: 0, forsok: null },
      spill: null,
      annet: null,
    }),

    lastet(S) {
      if (!S.oppsett || !STORRELSER.includes(S.oppsett.str)) S.oppsett = { str: 4 };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      const d = S.daglig;
      if (!d || typeof d !== "object" || !d.dager || typeof d.dager !== "object") S.daglig = { dager: {}, rekke: 0, beste: 0, sistNr: 0, forsok: null };
      else {
        for (const k of Object.keys(d.dager)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d.dager[k] || !(d.dager[k].poeng >= 0)) delete d.dager[k];
        d.rekke = Math.max(0, Math.floor(Number(d.rekke) || 0));
        d.beste = Math.max(d.rekke, Math.floor(Number(d.beste) || 0));
        d.sistNr = Math.floor(Number(d.sistNr) || 0);
        if (!d.forsok || typeof d.forsok.dato !== "string" || !(d.forsok.n >= 1)) d.forsok = null;
      }
      const idag = R.dag().tekst;
      // A saved game must be a whole board; today's sprint also has its date (one from another day is gone).
      const gyldig = (sp) => {
        if (!sp || typeof sp !== "object") return false;
        const dag = typeof sp.dagens === "string";
        const ok =
          (dag ? sp.str === DAG_STR && sp.dagens === idag && Number.isInteger(sp.dagNr) : STORRELSER.includes(sp.str)) &&
          Array.isArray(sp.fliser) &&
          sp.fliser.every((f) => f && Number.isInteger(f.id) && Number.isInteger(f.x) && Number.isInteger(f.y) && f.x >= 0 && f.y >= 0 && f.x < sp.str && f.y < sp.str && f.v >= 2) &&
          new Set(sp.fliser.map((f) => f.x + "," + f.y)).size === sp.fliser.length;
        if (!ok) return false;
        sp.poeng = Number(sp.poeng) || 0;
        sp.trekk = Math.max(0, Math.floor(Number(sp.trekk) || 0));
        sp.nesteId = Math.max(Number(sp.nesteId) || 0, ...sp.fliser.map((f) => f.id + 1));
        if (dag) {
          sp.forsok = R.klamp(Math.floor(Number(sp.forsok) || 1), 1, DAG_FORSOK);
          sp.forrige = null;
        } else {
          sp.dagens = null;
          sp.dagNr = null;
          sp.forsok = 0;
        }
        if (sp.over && !sp.ferdig) sp.over = !kanFlytte(sp) ? sp.over : false;
        // A game left at "no more moves" goes to the result.
        if (sp.over && !sp.ferdig) sp.ferdig = true;
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
      if (lost) R.dagligFerdig({ vunnet: true, rekke: S.daglig.rekke, res: `${R.tall(lost.poeng)} poeng` });
    },

    // rusj.no/dobleren/#dagens (the front page's «I dag») opens today's sprint.
    vedHash: (S, hash) => (hash === "dagens" ? apneDagens(S, true) : null),

    regler: {
      intro: "Skyv brikkene. To like brikker som møtes, blir til én – med dobbelt så høyt tall. Klarer du å lage 2048?",
      steg: [
        ["Sveip", "Sveip i en retning, så glir alle brikkene så langt de kan. Piltastene og pilknappene virker også."],
        ["Slå sammen", "2 og 2 blir 4, 4 og 4 blir 8 … Hver sammenslåing gir poeng. Etter hvert trekk kommer en ny brikke."],
        ["Ikke gå tom for plass", "Er brettet fullt og ingen brikker kan slås sammen, er spillet over."],
      ],
      tips: [
        "Hold den største brikken i et hjørne, og bygg opp tallene langs kanten.",
        "Bruk helst bare tre retninger – da blir hjørnet ditt liggende i fred.",
        "Gjorde du et dumt trekk? Du kan angre det siste trekket (men ikke to på rad).",
        "5 × 5 gir mer plass og er litt lettere. Rekordene teller hver for seg.",
        "Dagens lynrunde er et lite brett på 3 × 3 med de samme brikkene for alle i hele landet. Du har tre forsøk, og det beste teller. Her kan du ikke angre.",
        "Med tastatur: piltastene (eller W, A, S og D) flytter brikkene, og U angrer.",
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
          const dagAktiv = iGang(dag);
          const lost = S.daglig.dager[d.tekst];
          const brukt = forsokBrukt(S);
          const r = rekke(S);
          const rek = STORRELSER.filter((n) => S.rekorder[n] && S.rekorder[n].poeng).map(
            (n) => `<li><b>${n} × ${n}</b> ${R.tall(S.rekorder[n].poeng)} poeng<small> · største ${S.rekorder[n].flis}</small></li>`,
          );
          const fortsett = friAktiv ? `Fortsett · ${fri.str} × ${fri.str} · ${R.tall(fri.poeng)} poeng` : "";
          const regler = R.ui.lenke("Slik spiller du", "regler");
          let knapper;
          if (!lost) {
            // Today's sprint is the main button until a try is finished; the two boards are one tap away.
            const navn = ukedag(d.nr);
            const under = dagAktiv
              ? `${R.tall(dag.poeng)} poeng · forsøk ${dag.forsok} av ${DAG_FORSOK}`
              : `${navn[0].toUpperCase() + navn.slice(1)} · 3 × 3 · ${r > 0 ? `🔥 ${R.flertall(r, "dag", "dager")} på rad` : "tre forsøk"}`;
            knapper =
              R.ui.knapp("", "dagens", {
                variant: "stor",
                tekstHtml: `${kalender(d)}<span class="db-dagknapp"><b>${dagAktiv ? "Fortsett lynrunden" : "Dagens lynrunde"}</b><small>${esc(under)}</small></span>`,
              }) +
              (friAktiv
                ? R.ui.knapp2(fortsett, "fortsett") + R.ui.lenkerad(R.ui.lenke("Nytt 4 × 4", "nytt", { v: 4 }), R.ui.lenke("Nytt 5 × 5", "nytt", { v: 5 }), regler)
                : `<div class="knapprad">${R.ui.knapp2("Start 4 × 4", "nytt", { v: 4 })}${R.ui.knapp2("Start 5 × 5", "nytt", { v: 5 })}</div>` + regler);
          } else {
            const igjen = DAG_FORSOK - brukt;
            knapper =
              (friAktiv
                ? R.ui.knapp(fortsett, "fortsett") + `<div class="knapprad">${R.ui.knapp2("Nytt 4 × 4", "nytt", { v: 4 })}${R.ui.knapp2("Nytt 5 × 5", "nytt", { v: 5 })}</div>`
                : R.ui.knapp("Start 4 × 4", "nytt", { v: 4 }) + R.ui.knapp2("5 × 5 · mer plass", "nytt", { v: 5 })) +
              `<p class="db-daglinje">✓ Dagens lynrunde: ${R.tall(lost.poeng)} poeng · ${lost.flis}-brikke${r > 1 ? ` · 🔥 ${r} dager på rad` : ""}</p>` +
              (dagAktiv
                ? R.ui.knapp2(`Fortsett lynrunden · forsøk ${dag.forsok} av ${DAG_FORSOK}`, "dagens", { variant: "liten" })
                : igjen > 0
                  ? R.ui.knapp2(`Prøv igjen · ${R.flertall(igjen, "forsøk", "forsøk")} igjen`, "dagens", { variant: "liten" })
                  : "") +
              nedtellingHtml() +
              regler;
          }
          return (
            R.ui.spillhjem({
              slagordHtml: "Sveip, slå sammen og doble.<br><em>Klarer du 2048?</em>",
              knapperHtml: knapper,
              merker: [
                ["3", "brett"],
                ["1", "ny hver dag"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="db-rekorder" aria-label="Dine rekorder"><p class="etikett">Dine rekorder</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
        inn(S) {
          if (S.daglig.dager[R.dag().tekst]) startNedtelling();
        },
      },

      spill: {
        tittel: (S) => (S.spill.dagens ? "Dagens lynrunde" : `${S.spill.str} × ${S.spill.str}`),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = sp.str;
          const dag = !!sp.dagens;
          return `
            <h1 class="vh" id="skjerm-tittel">${dag ? "Dagens lynrunde, 3 ganger 3" : `2048 på ${n} ganger ${n}`}</h1>
            <div class="db-spill">
              <div class="db-hud${dag ? " dag" : ""}">
                <span class="db-stat db-poengboks"><small>Poeng</small><b id="db-poeng">${R.tall(sp.poeng)}</b></span>
                <span class="db-stat"><small>${dag ? "Beste i dag" : "Rekord"}</small><b id="db-beste">${R.tall(Math.max(malet(S, sp), sp.poeng))}</b></span>
                ${
                  dag
                    ? `<span class="db-stat"><small>Forsøk</small><b>${sp.forsok} av ${DAG_FORSOK}</b></span>`
                    : `<button class="db-verk" data-h="angre" aria-label="Angre siste trekk"${sp.forrige ? "" : " disabled"}>${IKON.angre}<span>Angre</span></button>
                <button class="db-verk" data-h="ny" aria-label="Start på nytt">${IKON.ny}<span>Ny</span></button>`
                }
              </div>
              <div class="db-flate">
                <div class="db-brett" style="--n:${n}">
                  <div class="db-ruter" aria-hidden="true">${"<i></i>".repeat(n * n)}</div>
                  <div class="db-lag" aria-hidden="true"></div>
                  <table class="vh db-tabell" aria-label="Brettet"><tbody></tbody></table>
                </div>
              </div>
              <div class="db-melding" hidden role="dialog" aria-labelledby="db-melding-tittel"></div>
              ${R.ui.dokk(`
                <p class="db-tastatur">${dag ? "Piltaster eller WASD flytter · tre forsøk, det beste teller" : "Piltaster eller WASD flytter · U angrer"}</p>
                <p class="db-tips">${dag ? "Tre forsøk – det beste teller" : sp.trekk < 3 ? "Sveip hvor som helst for å flytte brikkene" : "Hold den største brikken i et hjørne"}</p>
                <div class="db-piler" role="group" aria-label="Flytt brikkene">
                  ${["venstre", "opp", "ned", "hoyre"].map((r) => `<button data-h="flytt" data-v="${r}" data-stille aria-label="${PILNAVN[r]}">${PIL[r]}</button>`).join("")}
                </div>`)}
            </div>`;
        },
        etter(S, rot) {
          elementer = new Map();
          tilpass(S);
          tegnPaNytt(S);
          bindFlate(S, rot);
          const flate = R.$(".db-flate", rot);
          if (flate && typeof ResizeObserver === "function") {
            const obs = new ResizeObserver(() => tilpass(S));
            obs.observe(flate);
            R.vedForlat(() => obs.disconnect());
          }
        },
        inn(S) {
          if (!S.spill || S.spill.ferdig) return R.gaTil(S.spill ? "slutt" : "hjem");
          fastSide(true);
          tilpass(S);
          R.holdVaken();
        },
        ut(S) {
          meldIGang(S);
          ryddVentende();
          elementer = new Map();
          las = false;
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        // A solo result: the top bar says what was played ("Kåringen" is for ranked players).
        tittel: (S) => (S.spill && S.spill.dagens ? "Dagens lynrunde" : S.spill ? `${S.spill.str} × ${S.spill.str}` : "2048"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { poeng: sp.poeng, flis: storste(sp) };
          const n = sp.str;
          const alle = '<a class="lenke" href="/">Alle spill</a>';
          if (sp.dagens) {
            const idag = sp.dagens === R.dag().tekst; // the page may stay open past midnight
            const best = S.daglig.dager[sp.dagens] || { poeng: r.poeng, flis: r.flis };
            const igjen = idag ? DAG_FORSOK - forsokBrukt(S) : 0;
            const tittel = r.bedre ? "Ny toppscore!" : r.forste ? "Godt jobba!" : "Godt forsøk!";
            const linje = r.forste
              ? "Dagens lynrunde er tatt! Det beste av tre forsøk teller."
              : r.bedre
                ? `Det slo ditt forrige forsøk på ${R.tall(r.gml)} poeng.`
                : `Ditt beste i dag er ${R.tall(best.poeng)} poeng.`;
            return `
              <div class="banner aksent">
                ${R.figur()}
                <p class="etikett">Dagens lynrunde · ${esc(ukedag(sp.dagNr))} ${esc(datoTekst(sp.dagens))}</p>
                <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              </div>
              <div class="db-resultat">
                <div class="db-tall${r.bedre ? " ny" : ""}"><b>${R.tall(r.poeng)}</b><span>poeng</span>${r.bedre ? '<i class="db-ny">Best i dag!</i>' : ""}</div>
                <div class="db-tall"><b class="db-tallflis ${klasse(r.flis)} s${sifre(r.flis)}">${r.flis}</b><span>største brikke</span></div>
              </div>
              <p class="hjelp">Forsøk ${r.forsok || sp.forsok} av ${DAG_FORSOK}. ${esc(linje)}</p>
              ${medaljerHtml(best.flis)}
              <div class="db-dagboks">
                ${r.rekke ? `<p class="db-rekke"><span aria-hidden="true">🔥</span> ${R.flertall(r.rekke, "dag", "dager")} på rad</p>` : ""}
                ${idag ? nedtellingHtml() : '<p class="db-nedtelling"><b>En ny lynrunde er klar!</b></p>'}
              </div>
              ${miniBrett(sp)}
              ${R.ui.flereSpill({ antall: 1 })}
              ${
                !idag
                  ? R.ui.dokk(R.ui.knapp("Dagens lynrunde", "dagens"), R.ui.lenkerad(alle))
                  : igjen > 0
                    ? R.ui.dokk(R.ui.knapp(`Prøv igjen · ${R.flertall(igjen, "forsøk", "forsøk")} igjen`, "dagens"), R.ui.lenkerad(R.ui.lenke("Del resultatet", "del"), alle))
                    : R.ui.dokk(R.ui.knapp("Del resultatet", "del"), R.ui.lenkerad(R.ui.lenke("Spill 4 × 4", "nytt", { v: 4 }), alle))
              }`;
          }
          const tittel = r.flis >= MAL ? `Du klarte ${R.tall(r.flis)}!` : r.nyRekord ? "Ny rekord!" : "Godt jobba!";
          const linje = r.nyRekord
            ? `Ny personlig rekord på ${n} × ${n}! Forrige: ${R.tall(r.gml)} poeng.`
            : r.forste
              ? `Første runde på ${n} × ${n} – nå har du en rekord å slå!`
              : `Rekorden din på ${n} × ${n}: ${R.tall(beste(S, n))} poeng.`;
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${n} × ${n} · ${R.flertall(sp.trekk, "trekk", "trekk")}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
            </div>
            <div class="db-resultat">
              <div class="db-tall${r.nyRekord ? " ny" : ""}"><b>${R.tall(r.poeng)}</b><span>poeng</span>${r.nyRekord ? '<i class="db-ny">Rekord!</i>' : ""}</div>
              <div class="db-tall"><b class="db-tallflis ${klasse(r.flis)} s${sifre(r.flis)}">${r.flis}</b><span>største brikke</span></div>
            </div>
            <p class="hjelp">${esc(linje)}</p>
            ${miniBrett(sp)}
            ${sp.forrige ? `<div class="db-angrerad">${R.ui.knapp2("Angre siste trekk", "angre-slutt", { variant: "liten" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(
              R.ui.knapp("Spill igjen", "igjen"),
              R.ui.lenkerad(R.ui.lenke(`Bytt til ${n === 4 ? 5 : 4} × ${n === 4 ? 5 : 4}`, "nytt", { v: n === 4 ? 5 : 4 }), alle),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if (sp.dagens && sp.dagens === R.dag().tekst) startNedtelling();
          // The sprint: a party for the first finished try, a better one or a medal tile.
          if (sp.dagens ? r.forste || r.bedre || r.flis >= MEDALJER[0][0] : r.nyRekord || r.flis >= MAL || r.flis >= 1024) {
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
      // «Start 4 × 4», «5 × 5», «Nytt …»: a new game at once on that board (asks first if one is running).
      async nytt(el, e, S) {
        const str = STORRELSER.includes(Number(el.dataset.v)) ? Number(el.dataset.v) : 4;
        const fortsatt = R.vakt();
        // Only a free game under way is lost to a new one: today's sprint has its own place.
        const fri = finn(S, false);
        if (!(await R.bekreftNytt(!!(fri && !fri.ferdig && fri.trekk > 0))) || !fortsatt()) return;
        nyttSpill(S, str);
        R.gaTil("spill");
      },
      fortsett: (el, e, S) => R.gaTil(hent(S, false) && !S.spill.ferdig ? "spill" : "hjem"),
      // Today's sprint: start it, go on with it, try again – or see how it went.
      dagens: (el, e, S) => R.gaTil(apneDagens(S, false)),
      igjen(el, e, S) {
        nyttSpill(S, S.spill && !S.spill.dagens ? S.spill.str : S.oppsett.str);
        R.gaTil("spill");
      },
      // Start over at once; asks first only when there is something to lose.
      async ny(el, e, S) {
        const sp = S.spill;
        if (sp && !sp.ferdig && sp.poeng > 0) {
          const fortsatt = R.vakt();
          if (!(await R.bekreft("Starte på nytt?", "Brettet og poengene du har nå, forsvinner.", "Start på nytt", "Avbryt")) || !fortsatt()) return;
        }
        nyttSpill(S, sp ? sp.str : S.oppsett.str);
        R.lyd.sveip();
        R.gaTil("spill");
      },
      flytt(el, e, S) {
        trekk(S, el.dataset.v);
      },
      angre: (el, e, S) => angre(S),
      // From the end screen: take the last move back and play on.
      "angre-slutt"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.forrige || sp.dagens) return;
        // The finished game wrote the record: the move that is taken back must not stay in it.
        if (sp.forRekord !== undefined) {
          if (sp.forRekord) S.rekorder[sp.str] = sp.forRekord;
          else delete S.rekorder[sp.str];
          delete sp.forRekord;
        }
        sp.ferdig = false;
        sp.over = false;
        sp.resultat = null;
        Object.assign(sp, sp.forrige);
        sp.forrige = null;
        R.gaTil("spill");
      },
      "fortsett-etter"(el, e, S) {
        skjulMelding();
        R.lagre();
        if (!kanFlytte(S.spill)) over(S);
      },
      ferdig(el, e, S) {
        skjulMelding();
        avslutt(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        const best = sp && sp.dagens && S.daglig.dager[sp.dagens];
        if (!best) return;
        const r = sp.resultat || {};
        const m = medalje(best.flis);
        const dato = `${Number(sp.dagens.slice(8, 10))}.${Number(sp.dagens.slice(5, 7))}`;
        const tekst = `🟧 Dobleren ${dato} · ${best.flis}-brikke${m ? " " + m[2] : ""} · ${R.tall(best.poeng)} poeng${r.rekke > 1 ? ` · 🔥 ${r.rekke} dager på rad` : ""}. Klarer du mer på dagens lynrunde?`;
        R.del("Dobleren – dagens lynrunde", tekst, "https://rusj.no/dobleren/");
      },
    }),
  });
})();
