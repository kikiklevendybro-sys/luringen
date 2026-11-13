/* Nøstet — one thread through every cell: start at 1, pass the numbers in order, end on the last.
   Some puzzles have walls the thread can't cross.
   Every puzzle is made on the phone: a random path through every cell (the «backbite» walk), a few
   walls beside it, every cell numbered – and then numbers taken away, one by one, for as long as
   the thread still has only one way to go. «Dagens nøste» uses today's date as the seed, so
   everyone gets the same one. The engine at the top is pure and also runs under node
   (test/nostet.test.mjs). */
(function () {
  "use strict";

  // ======================= Engine =======================

  const motor = (function () {
    // The kit's generator (mulberry32), so a seed gives the same puzzle in node and on every phone.
    function rng(fro) {
      let a = fro >>> 0;
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function stokk(a, tilf) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(tilf() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a;
    }
    const STORRELSER = [5, 6, 7, 8];

    // The cells next to i (sides only), without crossing a wall. vegger[i * 2] is the wall on the
    // right of cell i, vegger[i * 2 + 1] the wall below it.
    function naboer(n, vegger, i) {
      const r = (i / n) | 0;
      const c = i % n;
      const ut = [];
      if (c < n - 1 && !(vegger && vegger[i * 2])) ut.push(i + 1);
      if (c > 0 && !(vegger && vegger[(i - 1) * 2])) ut.push(i - 1);
      if (r < n - 1 && !(vegger && vegger[i * 2 + 1])) ut.push(i + n);
      if (r > 0 && !(vegger && vegger[(i - n) * 2 + 1])) ut.push(i - n);
      return ut;
    }
    // Is there a wall between neighbours a and b?
    function vegg(n, vegger, a, b) {
      if (b === a + 1) return !!vegger[a * 2];
      if (b === a - 1) return !!vegger[b * 2];
      if (b === a + n) return !!vegger[a * 2 + 1];
      if (b === a - n) return !!vegger[b * 2 + 1];
      return true;
    }
    const sidestilt = (n, a, b) => (Math.abs(a - b) === 1 && ((a / n) | 0) === ((b / n) | 0)) || Math.abs(a - b) === n;

    // ---------- A random path through every cell ----------
    // Starts as a snake and is shaken with «backbite» moves: an end steps to a neighbour on the
    // path, and the loop that makes is opened the other way.
    function tilfeldigSti(n, tilf, steg) {
      const sti = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) sti.push(r * n + (r % 2 ? n - 1 - c : c));
      const N = n * n;
      const plass = new Int16Array(N);
      sti.forEach((i, k) => (plass[i] = k));
      for (let s = 0; s < steg; s++) {
        if (tilf() < 0.5) {
          sti.reverse();
          sti.forEach((i, k) => (plass[i] = k));
        }
        const ende = sti[N - 1];
        const valg = naboer(n, null, ende).filter((x) => x !== sti[N - 2]);
        const x = valg[Math.floor(tilf() * valg.length)];
        const k = plass[x];
        // sti[0..k], then sti[N-1] down to sti[k+1]
        let a = k + 1;
        let b = N - 1;
        while (a < b) {
          const t = sti[a];
          sti[a] = sti[b];
          sti[b] = t;
          plass[sti[a]] = a;
          plass[sti[b]] = b;
          a++;
          b--;
        }
      }
      return sti;
    }

    // ---------- Counting solutions ----------
    // tall[i]: the number in cell i (0 = none). Returns up to `grense` paths (cell lists).
    // Prunes: the cells left must hang together with the head of the thread, and a cell left
    // (other than the last number's) must still have two ways in and out.
    function finn(n, tall, vegger, grense) {
      grense = grense || 2;
      const N = n * n;
      let start = -1;
      let slutt = -1;
      let maks = 0;
      for (let i = 0; i < N; i++) {
        if (tall[i] === 1) start = i;
        if (tall[i] > maks) {
          maks = tall[i];
          slutt = i;
        }
      }
      if (start < 0) return [];
      const nab = Array.from({ length: N }, (_, i) => naboer(n, vegger, i));
      const besokt = new Uint8Array(N);
      const sti = [start];
      besokt[start] = 1;
      const ut = [];
      const merke = new Int32Array(N);
      let runde = 0;
      // Do the cells left hang together with the head, and can each still be passed through?
      function lever(hode) {
        runde++;
        let antall = 0;
        const ko = [hode];
        merke[hode] = runde;
        while (ko.length) {
          const i = ko.pop();
          for (const j of nab[i])
            if (!besokt[j] && merke[j] !== runde) {
              merke[j] = runde;
              antall++;
              ko.push(j);
            }
        }
        if (antall !== N - sti.length) return false;
        for (let i = 0; i < N; i++) {
          if (besokt[i]) continue;
          let veier = 0;
          for (const j of nab[i]) if (!besokt[j] || j === hode) veier++;
          if (veier < (i === slutt ? 1 : 2)) return false;
        }
        return true;
      }
      function steg(hode, neste) {
        if (sti.length === N) {
          if (hode === slutt) ut.push(sti.slice());
          return ut.length >= grense;
        }
        for (const j of nab[hode]) {
          if (besokt[j]) continue;
          const t = tall[j];
          if (t && t !== neste) continue;
          if (j === slutt && sti.length !== N - 1) continue;
          besokt[j] = 1;
          sti.push(j);
          if (lever(j) && steg(j, t ? neste + 1 : neste)) return true;
          sti.pop();
          besokt[j] = 0;
        }
        return false;
      }
      steg(start, 2);
      return ut;
    }
    const tell = (n, tall, vegger, grense) => finn(n, tall, vegger, grense || 2).length;

    // ---------- Making a puzzle ----------
    // N: { n, vegger: [fewest, most], tall: fewest numbers to keep }
    const NIVAER = Object.freeze({
      5: { n: 5, vegger: [0, 2], tall: 6 },
      6: { n: 6, vegger: [0, 3], tall: 7 },
      7: { n: 7, vegger: [1, 4], tall: 8 },
      8: { n: 8, vegger: [2, 5], tall: 9 },
    });

    // Numbers along the path: the cells at the given steps, counted 1, 2, 3 … in path order.
    function nummerer(n, sti, steg) {
      const tall = new Array(n * n).fill(0);
      steg
        .slice()
        .sort((a, b) => a - b)
        .forEach((k, j) => (tall[sti[k]] = j + 1));
      return tall;
    }

    function lagMed(N, fro) {
      const tilf = rng(fro);
      const n = N.n;
      const NN = n * n;
      const sti = tilfeldigSti(n, tilf, 40 * NN);
      // Walls: on sides the path does not use.
      const vegger = new Array(NN * 2).fill(0);
      const plass = new Array(NN);
      sti.forEach((i, k) => (plass[i] = k));
      const frie = [];
      for (let i = 0; i < NN; i++) {
        if (i % n < n - 1 && Math.abs(plass[i] - plass[i + 1]) !== 1) frie.push(i * 2);
        if (i < NN - n && Math.abs(plass[i] - plass[i + n]) !== 1) frie.push(i * 2 + 1);
      }
      const antallVegger = N.vegger[0] + Math.floor(tilf() * (N.vegger[1] - N.vegger[0] + 1));
      for (const v of stokk(frie, tilf).slice(0, antallVegger)) vegger[v] = 1;
      // Every step numbered, then numbers taken away while the path stays the only one. The first
      // and the last always stay.
      let steg = Array.from({ length: NN }, (_, k) => k);
      for (const k of stokk(Array.from({ length: NN - 2 }, (_, j) => j + 1), tilf)) {
        if (steg.length <= N.tall) break;
        const prov = steg.filter((x) => x !== k);
        if (tell(n, nummerer(n, sti, prov), vegger, 2) === 1) steg = prov;
      }
      return { n, tall: nummerer(n, sti, steg), vegger, losning: sti };
    }
    const lag = (n, fro) => lagMed(NIVAER[n] || NIVAER[6], fro);

    // ---------- «Dagens nøste» ----------
    // The daily has its own frozen rules and seed hash, so a day's puzzle never changes
    // (test/nostet.test.mjs pins known days).
    const DAGLIG = Object.freeze({
      5: Object.freeze({ n: 5, vegger: Object.freeze([0, 2]), tall: 6 }),
      6: Object.freeze({ n: 6, vegger: Object.freeze([0, 3]), tall: 7 }),
      7: Object.freeze({ n: 7, vegger: Object.freeze([1, 4]), tall: 8 }),
    });
    // Small on Monday, bigger at the weekend (index 0 = Sunday).
    const DAGLIG_UKE = Object.freeze([7, 5, 6, 6, 6, 7, 7]);
    function fnv(tekst) {
      let h = 0x811c9dc5;
      for (let i = 0; i < tekst.length; i++) {
        h ^= tekst.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    const dagligStorrelse = (nr) => DAGLIG_UKE[(((nr + 4) % 7) + 7) % 7];
    const lagDaglig = (dato, nr) => lagMed(DAGLIG[dagligStorrelse(nr)], fnv("nostet:" + dato));

    // ---------- Moves on a board in play ----------
    // sti: the cells of the thread so far (sti[0] is always the cell with 1). Can the thread go on
    // to cell j? Returns null (yes) or why not: «vegg», «krysser», «rekkefolge» (a number out of
    // turn; neste = the number that is next), «slutt» (the last number before every cell is
    // filled), «ferdig» (the thread already ends on the last number), «avstand» (not next door).
    function nesteTall(tall, sti) {
      let neste = 1;
      for (const i of sti) if (tall[i] === neste) neste++;
      return neste;
    }
    function kanGaa(n, tall, vegger, sti, j) {
      const hode = sti[sti.length - 1];
      const maks = Math.max(...tall);
      if (tall[hode] === maks) return { hvorfor: "ferdig" };
      if (!sidestilt(n, hode, j)) return { hvorfor: "avstand" };
      if (vegg(n, vegger, hode, j)) return { hvorfor: "vegg" };
      if (sti.includes(j)) return { hvorfor: "krysser" };
      const neste = nesteTall(tall, sti);
      if (tall[j] && tall[j] !== neste) return { hvorfor: "rekkefolge", neste };
      if (tall[j] === maks && sti.length !== n * n - 1) return { hvorfor: "slutt", neste: maks };
      return null;
    }
    const ferdig = (n, tall, sti) => sti.length === n * n && tall[sti[sti.length - 1]] === Math.max(...tall);

    // A hint: the thread cut back to where it last agrees with the solution, then led on to the
    // next number (at least two cells). Returns { kutt: cells cut away, sti: the new thread }.
    function hint(n, tall, losning, sti) {
      let k = 0;
      while (k < sti.length && sti[k] === losning[k]) k++;
      const ny = losning.slice(0, Math.max(1, k));
      let s = ny.length;
      let lagt = 0;
      while (s < losning.length) {
        ny.push(losning[s]);
        lagt++;
        if (tall[losning[s]] && lagt >= 2) break;
        s++;
      }
      return { kutt: sti.length - Math.max(1, k), sti: ny };
    }

    return { rng, fnv, naboer, vegg, sidestilt, tilfeldigSti, finn, tell, NIVAER, STORRELSER, nummerer, lagMed, lag, DAGLIG, dagligStorrelse, lagDaglig, nesteTall, kanGaa, ferdig, hint };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    if (typeof window === "object" && window) window.Nostet = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;

  const STR = M.STORRELSER;
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const NIVA = Object.assign(Object.create(null), {
    5: R.t("En rolig start"),
    6: R.t("Litt å tenke på"),
    7: R.t("Passe utfordring"),
    8: R.t("Lang tråd, få tall"),
  });
  const storrelse = (n) => `${n} × ${n}`;
  const HINT = 3;
  const MAKS_ANGRE = 400;
  const FORSTE = 20770; // «nr. 1» is 13 November 2026 (R.dag().nr)
  const NAVN = () => (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || R.t("Nøstet");
  // This edition's address (rusj.no/nostet/, rusj.no/en/woolly/ …)
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/nostet/" }).href;

  let H; // actions
  let klokkeFra = null; // performance.now() when the clock last started
  let las = false; // input locked while the win plays
  let inntil = 0; // performance.now() when the play screen opened (the second half of a double tap is ignored)

  // ---------- Days ----------

  const iDato = (tekst) => new Date(tekst + "T12:00:00Z");
  const datoFmt = (tekst, o) => new Intl.DateTimeFormat(R.lokale, Object.assign({ timeZone: "UTC" }, o)).format(iDato(tekst));
  const ukedag = (tekst) => datoFmt(tekst, { weekday: "long" });
  const datoTekst = (tekst) => datoFmt(tekst, { weekday: "long", day: "numeric", month: "long" });
  const nrFor = (dagNr) => dagNr - FORSTE + 1;
  const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function sekunderTilNy() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: R.tidssone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
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
  const nedtellingHtml = () => `<p class="ns-nedtelling">${esc(R.t("Nytt nøste om {tid}")).replace("{tid}", `<b>${klokkeTekst(sekunderTilNy())}</b>`)}</p>`;
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".ns-nedtelling b");
      if (!el) return clearInterval(nedtellingId);
      if (R.dag().nr !== dag) {
        clearInterval(nedtellingId);
        return R.vis();
      }
      el.textContent = klokkeTekst(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(nedtellingId));
  }

  // ---------- Clock ----------

  const tidMs = (sp) => sp.tid + (klokkeFra != null ? performance.now() - klokkeFra : 0);
  function startKlokke(S) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || sp.pause || klokkeFra != null || document.hidden || S.skjerm !== "spill") return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && aktiv(S);
    if (sp && klokkeFra != null) sp.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }
  function visTid(ms) {
    const s = Math.floor(ms / 1000);
    const t = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    return (t ? t + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s % 60).padStart(2, "0");
  }

  // ---------- The game state ----------
  // Today's puzzle and a free board live side by side (S.dag and S.fri); S.modus says which one
  // is on the screen. Neither is ever lost by opening the other.

  const aktiv = (S) => (S.modus === "dag" ? S.dag : S.fri);
  const iGang = (sp) => !!(sp && !sp.ferdig);
  const dagensSpill = (S) => (S.dag && S.dag.dagens === R.dag().tekst ? S.dag : null);
  const dagRekke = (S) => (S.daglig.sistNr >= R.dag().nr - 1 ? S.daglig.rekke || 0 : 0);

  function nyttSpill(S, dag) {
    const t0 = performance.now();
    const d = dag ? R.dag() : null;
    const n = STR.includes(S.oppsett.n) ? S.oppsett.n : 6;
    const o = dag ? M.lagDaglig(d.tekst, d.nr) : M.lag(n, R.nyttFro());
    const sp = {
      n: o.n,
      tall: o.tall,
      vegger: o.vegger,
      losning: o.losning,
      dagens: d ? d.tekst : null,
      dagNr: d ? d.nr : null,
      sti: [o.tall.indexOf(1)],
      angre: [],
      tid: 0,
      hintIgjen: HINT,
      pause: false,
      ferdig: false,
      resultat: null,
    };
    if (dag) S.dag = sp;
    else S.fri = sp;
    S.modus = dag ? "dag" : "fri";
    klokkeFra = null;
    las = false;
    R.statistikk("start", { n: sp.n, dagens: !!dag, ms: Math.round(performance.now() - t0) });
  }

  // Today's puzzle: the board (new or under way) – or the result once it is solved.
  function apneDagens(S) {
    const sp = dagensSpill(S);
    const lost = S.daglig.dager[R.dag().tekst];
    if (sp && sp.ferdig) {
      S.modus = "dag";
      return "slutt";
    }
    if (lost && !sp) return "hjem";
    if (!sp) nyttSpill(S, true);
    S.modus = "dag";
    return "spill";
  }

  const paabegynt = (sp) => sp.sti.length > 1;

  // The front page shows how far today's puzzle has come (rusj/DAGLIG.md).
  function meldIGang(S) {
    const sp = dagensSpill(S);
    if (!sp || sp.ferdig || S.daglig.dager[sp.dagens] || !paabegynt(sp)) return;
    R.dagligIGang({ tekst: visTid(sp.tid) });
  }

  // ---------- What the board shows ----------

  const radAv = (sp, i) => (i / sp.n) | 0;
  const kolAv = (sp, i) => i % sp.n;
  const maksTall = (sp) => Math.max(...sp.tall);
  const sted = (sp, i) => R.t("Rad {r}, kolonne {k}", { r: radAv(sp, i) + 1, k: kolAv(sp, i) + 1 });

  // The thread as an SVG path through the cell centres (the board's viewBox is n × n).
  const traadD = (sp) => sp.sti.map((i, k) => `${k ? "L" : "M"}${kolAv(sp, i) + 0.5} ${radAv(sp, i) + 0.5}`).join("");
  function veggerD(sp) {
    const n = sp.n;
    let d = "";
    for (let i = 0; i < n * n; i++) {
      const r = radAv(sp, i);
      const c = kolAv(sp, i);
      if (sp.vegger[i * 2]) d += `M${c + 1} ${r}V${r + 1}`;
      if (sp.vegger[i * 2 + 1]) d += `M${c} ${r + 1}H${c + 1}`;
    }
    return d;
  }

  function brettHtml(sp) {
    const n = sp.n;
    const tall = sp.tall
      .map((t, i) => (t ? `<b class="ns-tallknapp" data-t="${t}" style="--x:${kolAv(sp, i)};--y:${radAv(sp, i)};--t:${t}">${t}</b>` : ""))
      .join("");
    return `<div class="ns-ruter" aria-hidden="true">${"<i></i>".repeat(n * n)}</div>
      <svg class="ns-tegning" viewBox="0 0 ${n} ${n}" aria-hidden="true" focusable="false">
        <path class="ns-traad-skygge" d=""/><path class="ns-traad" d=""/><path class="ns-tvinn" d=""/>
        <circle class="ns-hode" r="0.2" cx="0" cy="0"/>
        <path class="ns-vegg" d="${veggerD(sp)}"/>
      </svg>
      <div class="ns-tall" aria-hidden="true">${tall}</div>`;
  }

  // The board as text for a screen reader: one line per row.
  function radTekst(sp, r) {
    const n = sp.n;
    const del = [];
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const med = sp.sti.includes(i);
      let x = sp.tall[i] ? (med ? R.t("{t} i tråden", { t: sp.tall[i] }) : String(sp.tall[i])) : med ? R.t("tråd") : R.t("tom");
      if (i === sp.sti[sp.sti.length - 1]) x = R.t("{hva}, enden", { hva: x });
      del.push(x);
      if (c < n - 1 && sp.vegger[i * 2]) del.push(R.t("vegg"));
    }
    const under = [];
    for (let c = 0; c < n; c++) if (sp.vegger[(r * n + c) * 2 + 1]) under.push(c + 1);
    return `${R.t("Rad {r}: {celler}", { r: r + 1, celler: del.join(", ") })}${under.length ? `. ${R.t("Vegg under kolonne {k}", { k: under.join(", ") })}` : ""}`;
  }

  const IKON = {
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    tom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/></svg>',
    hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M7 5h3v14H7zM14 5h3v14h-3z"/><path class="av" d="M8 4.5v15l12-7.5z"/></svg>',
  };

  function hudHtml(S, sp) {
    return `<div class="ns-hud">
      <span class="ns-stat"><small>${esc(sp.dagens ? R.t("Dagens") : R.t("Størrelse"))}</small><b>${storrelse(sp.n)}</b></span>
      <button type="button" class="ns-klokke" data-h="pause" data-stille aria-label="${esc(sp.pause ? R.t("Fortsett") : R.t("Pause"))}"><span class="ns-pauseikon">${IKON.pause}</span><span class="ns-klokketekst"><small>${esc(R.t("Tid"))}</small><b id="ns-tid">${visTid(tidMs(sp))}</b></span></button>
      <span class="ns-stat"><small>${esc(R.t("Ruter"))}</small><b id="ns-antall">${sp.sti.length}/${sp.n * sp.n}</b></span>
    </div>`;
  }

  function verktoyHtml(sp) {
    return `<div class="ns-verktoy">
      <button type="button" class="ns-verk" data-h="angre" id="ns-angre" data-stille${sp.angre.length ? "" : " disabled"}>${IKON.angre}<span>${esc(R.t("Angre"))}</span></button>
      <button type="button" class="ns-verk" data-h="tom" id="ns-tom" data-stille>${IKON.tom}<span>${esc(R.t("Tøm"))}</span></button>
      <button type="button" class="ns-verk" data-h="hint" id="ns-hint" data-stille${sp.hintIgjen > 0 ? "" : " disabled"} aria-label="${esc(R.t("Hint, {n} igjen", { n: sp.hintIgjen }))}">${IKON.hint}<span>${esc(R.t("Hint"))}</span><i class="ns-merke" aria-hidden="true">${sp.hintIgjen}</i></button>
    </div>`;
  }

  // ---------- Updating the board in place ----------

  let ruter = []; // the cell elements
  function oppdater(S) {
    const sp = aktiv(S);
    const brett = R.$(".ns-brett");
    if (!sp || !brett) return;
    const n = sp.n;
    const med = new Uint8Array(n * n);
    for (const i of sp.sti) med[i] = 1;
    ruter.forEach((el, i) => {
      const k = med[i] ? (sp.hintCeller && sp.hintCeller.includes(i) ? "med hintet" : "med") : ""; // sprak-ok (class names)
      if (el.className !== k) el.className = k;
    });
    const d = traadD(sp);
    for (const p of R.$$(".ns-traad, .ns-traad-skygge, .ns-tvinn", brett)) if (p.getAttribute("d") !== d) p.setAttribute("d", d);
    const hode = R.$(".ns-hode", brett);
    const ende = sp.sti[sp.sti.length - 1];
    if (hode) {
      hode.setAttribute("cx", kolAv(sp, ende) + 0.5);
      hode.setAttribute("cy", radAv(sp, ende) + 0.5);
    }
    const neste = M.nesteTall(sp.tall, sp.sti);
    R.$$(".ns-tallknapp", brett).forEach((b) => {
      const t = Number(b.dataset.t);
      b.classList.toggle("tatt", t < neste);
      b.classList.toggle("neste", t === neste);
    });
    const tekst = R.$("#ns-tekst");
    if (tekst) {
      const linjer = Array.from({ length: n }, (_, r) => radTekst(sp, r));
      const li = tekst.children;
      if (li.length !== n) tekst.innerHTML = linjer.map((l) => `<li>${esc(l)}</li>`).join("");
      else linjer.forEach((l, r) => li[r].textContent !== l && (li[r].textContent = l));
    }
    const antall = R.$("#ns-antall");
    if (antall) antall.textContent = `${sp.sti.length}/${n * n}`;
    const angre = R.$("#ns-angre");
    if (angre) angre.disabled = !sp.angre.length;
    const hint = R.$("#ns-hint");
    if (hint) {
      hint.disabled = sp.hintIgjen <= 0;
      hint.setAttribute("aria-label", R.t("Hint, {n} igjen", { n: sp.hintIgjen }));
      hint.querySelector(".ns-merke").textContent = sp.hintIgjen;
    }
    const spillEl = R.$(".ns-spill");
    if (spillEl) {
      spillEl.classList.toggle("pauset", !!sp.pause);
      spillEl.classList.toggle("tomt", sp.sti.length <= 1);
    }
    const pause = R.$(".ns-pauseboks");
    if (pause) pause.hidden = !sp.pause;
    const klokke = R.$(".ns-klokke");
    if (klokke) klokke.setAttribute("aria-label", sp.pause ? R.t("Fortsett") : R.t("Pause"));
  }

  // Board size: the biggest square that fits, in whole pixels per cell. Landscape: the message line
  // goes to the right column; portrait: right under the board.
  function tilpass() {
    const flate = R.$(".ns-flate");
    const brett = R.$(".ns-brett");
    const sp = R.S && aktiv(R.S);
    if (!flate || !brett || !sp) return;
    const ligg = window.matchMedia("(orientation: landscape) and (max-height: 600px) and (min-width: 560px)").matches;
    const under = R.$(".ns-under");
    const mal = R.$(ligg ? ".ns-plass" : ".ns-midt");
    if (under && mal && under.parentElement !== mal) mal.appendChild(under);
    const plass = Math.min(flate.clientWidth - 4, flate.clientHeight - 4 - (under && !ligg ? under.offsetHeight + 10 : 0));
    const c = Math.max(30, Math.min(72, Math.floor((plass - 12) / sp.n)));
    brett.style.setProperty("--c", c + "px");
  }

  // A short line under the board: hints and why a move can't be made (also read out by the kit).
  let meldingId = null;
  function melding(tekst) {
    const m = R.$(".ns-melding");
    if (!m) return R.toast(tekst);
    m.textContent = tekst;
    m.classList.add("vis");
    clearTimeout(meldingId);
    meldingId = setTimeout(() => {
      m.classList.remove("vis");
      // Emptied once it has faded, so the same message later is news again (and read out again).
      meldingId = setTimeout(() => (m.textContent = ""), 300);
    }, Math.max(3200, tekst.length * 60));
  }

  function rist() {
    const b = R.$(".ns-brett");
    if (!b || R.rolig()) return;
    b.classList.remove("rist");
    void b.offsetWidth;
    b.classList.add("rist");
    setTimeout(() => b.classList.remove("rist"), 400);
  }

  // ---------- Moves ----------

  const kanSpille = (sp) => !!sp && !sp.ferdig && !sp.pause && !las;
  // One undo step: the thread as it was.
  function endre(sp, gammel) {
    sp.angre.push(gammel);
    if (sp.angre.length > MAKS_ANGRE) sp.angre.shift();
  }

  const HVORFOR = {
    vegg: () => R.t("Det er en vegg der."),
    krysser: () => R.t("Tråden kan ikke krysse seg selv."),
    rekkefolge: (h) => R.t("Ta {t} først.", { t: h.neste }),
    slutt: (h) => R.t("Fyll alle rutene før du tar {t}.", { t: h.neste }),
    ferdig: () => R.t("Tråden er ved det siste tallet. Gå tilbake for å fylle resten."),
    avstand: () => R.t("Tråden går bare til ruta rett ved siden av, over eller under."),
  };
  let sistNei = { i: -1, t: 0 };
  function nei(sp, j, h) {
    // The same refusal on the same cell is said only once a second (a drag sits on it).
    const na = performance.now();
    if (sistNei.i === j && na - sistNei.t < 1000) return;
    sistNei = { i: j, t: na };
    melding(HVORFOR[h.hvorfor](h));
    R.lyd.tone(240, 0, 0.14, "triangle", 0.09, 180);
    R.vibrer([10, 30, 10]);
    rist();
  }

  // One step of the thread to cell j: on (if it may), or back (j is the cell before the end).
  // Returns true when the thread changed.
  function steg(sp, j, stille) {
    const L = sp.sti.length;
    if (L >= 2 && j === sp.sti[L - 2]) {
      sp.sti.pop();
      return true;
    }
    const h = M.kanGaa(sp.n, sp.tall, sp.vegger, sp.sti, j);
    if (h) {
      if (!stille) nei(sp, j, h);
      return false;
    }
    sp.sti.push(j);
    if (sp.tall[j]) {
      R.lyd.tone(660 + sp.tall[j] * 40, 0, 0.12, "sine", 0.1);
      R.vibrer(12);
    } else R.lyd.tone(520 + (sp.sti.length % 8) * 30, 0, 0.035, "triangle", 0.05);
    return true;
  }

  // The thread to cell j in a straight line from the end (a tap or a fast finger skips cells).
  function rettFram(sp, j) {
    const n = sp.n;
    const ende = sp.sti[sp.sti.length - 1];
    const dr = radAv(sp, j) - radAv(sp, ende);
    const dc = kolAv(sp, j) - kolAv(sp, ende);
    if ((dr && dc) || (!dr && !dc)) return null;
    const d = dr ? Math.sign(dr) * n : Math.sign(dc);
    const ruteListe = [];
    for (let i = ende + d; ; i += d) {
      ruteListe.push(i);
      if (i === j) break;
    }
    // Every cell on the way must be allowed, in order.
    const prov = sp.sti.slice();
    for (const i of ruteListe) {
      const h = M.kanGaa(n, sp.tall, sp.vegger, prov, i);
      if (h) return { nei: h, i };
      prov.push(i);
    }
    return { sti: prov };
  }

  // After a change: what the screen reader hears, and the win.
  function etterEndring(S, stille) {
    const sp = aktiv(S);
    sp.hintCeller = null;
    oppdater(S);
    if (M.ferdig(sp.n, sp.tall, sp.sti)) return vinn(S);
    if (!stille) {
      const ende = sp.sti[sp.sti.length - 1];
      R.si(`${sp.tall[ende] ? `${R.t("Tall {t}.", { t: sp.tall[ende] })} ` : ""}${sted(sp, ende)}. ${R.t("{n} av {alle} ruter.", { n: sp.sti.length, alle: sp.n * sp.n })}`);
    }
    R.lagre();
  }

  function angre(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp) || !sp.angre.length) return;
    sp.sti = sp.angre.pop();
    R.lyd.tone(500, 0, 0.08, "triangle", 0.08, 420);
    R.si(R.t("Angret. {n} av {alle} ruter.", { n: sp.sti.length, alle: sp.n * sp.n }));
    sp.hintCeller = null;
    oppdater(S);
    R.lagre();
  }

  function tom(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp)) return;
    if (sp.sti.length <= 1) return melding(R.t("Tråden er allerede tom."));
    endre(sp, sp.sti.slice());
    sp.sti = sp.sti.slice(0, 1);
    R.lyd.sveip();
    sp.hintCeller = null;
    oppdater(S);
    melding(R.t("Tråden er nøstet opp igjen. Angre henter den tilbake."));
    R.lagre();
  }

  function brukHint(S) {
    const sp = aktiv(S);
    if (!kanSpille(sp)) return;
    if (sp.hintIgjen <= 0) return melding(R.t("Du har brukt alle hintene"));
    const h = M.hint(sp.n, sp.tall, sp.losning, sp.sti);
    sp.hintIgjen -= 1;
    endre(sp, sp.sti.slice());
    const for_ = sp.sti.length - h.kutt;
    sp.sti = h.sti;
    const t = sp.tall[sp.sti[sp.sti.length - 1]];
    R.lyd.tone(990, 0, 0.12, "sine", 0.12);
    R.lyd.tone(1480, 0.1, 0.22, "sine", 0.1);
    melding(h.kutt > 0 ? R.t("Tråden tok feil vei. Den er ført tilbake og videre til {t}.", { t }) : R.t("Tråden er ført videre til {t}.", { t }));
    oppdater(S);
    if (M.ferdig(sp.n, sp.tall, sp.sti)) return vinn(S);
    sp.hintCeller = sp.sti.slice(for_);
    oppdater(S);
    R.lagre();
  }

  function settPause(S, pa) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig) return;
    if (pa) {
      stoppKlokke(S);
      sp.pause = true;
    } else {
      sp.pause = false;
      startKlokke(S);
    }
    oppdater(S);
    tikk();
    R.lagre();
  }

  // Runs four times a second on the play screen; a sheet over the board stops the clock.
  let arkPause = false;
  function tikk() {
    const S = R.S;
    const sp = S && aktiv(S);
    if (!sp) return;
    if (R.arkApent()) {
      if (klokkeFra != null) {
        stoppKlokke(S);
        arkPause = true;
      }
    } else if (arkPause) {
      arkPause = false;
      startKlokke(S);
    }
    const el = R.$("#ns-tid");
    if (el) el.textContent = visTid(tidMs(sp));
  }

  // ---------- The win ----------

  function vinn(S) {
    const sp = aktiv(S);
    stoppKlokke(S);
    sp.ferdig = true;
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const hint = HINT - sp.hintIgjen;
    const res = { sek, hint };
    if (sp.dagens) {
      const d = S.daglig;
      const forrige = d.dager[sp.dagens];
      res.dagForrige = forrige ? forrige.sek : null;
      if (!forrige) {
        d.dager[sp.dagens] = { sek, hint, n: sp.n };
        if (d.sistNr === sp.dagNr - 1) d.rekke += 1;
        else if (d.sistNr !== sp.dagNr) d.rekke = 1;
        d.sistNr = Math.max(d.sistNr || 0, sp.dagNr);
        d.beste = Math.max(d.beste || 0, d.rekke);
        const dager = Object.keys(d.dager).sort();
        for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete d.dager[k];
        // Only today's puzzle counts on the front page (one started before midnight does not).
        if (sp.dagens === R.dag().tekst) R.dagligFerdig({ vunnet: true, rekke: d.rekke, res: visTid(sek * 1000) });
      }
      res.rekke = d.rekke;
    } else {
      const gml = S.rekorder[sp.n] || null;
      res.gml = gml ? gml.tid : null;
      res.nyRekord = !!gml && sek < gml.tid;
      res.forste = !gml;
      S.rekorder[sp.n] = { tid: gml ? Math.min(gml.tid, sek) : sek, antall: (gml ? gml.antall : 0) + 1 };
    }
    sp.resultat = res;
    R.statistikk("ferdig", { n: sp.n, dagens: !!sp.dagens, sek, hint });
    R.lagre();
    las = true;
    oppdater(S);
    R.lyd.riktig();
    R.vibrer([30, 50, 30, 50, 120]);
    // The thread pulls tight and the numbers pop one by one, then the result.
    const fortsatt = R.vakt();
    const brett = R.$(".ns-brett");
    if (brett && !R.rolig()) brett.classList.add("vant");
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 700 : 1700,
    );
  }

  // ---------- Input on the board ----------
  // Drag from the thread (its end, or any cell of it to cut it there) through the cells; tap a cell
  // next to the end, or straight across or down from it; arrows on the keyboard.

  let dra = null;
  function celleVed(x, y, midt) {
    const ruteEl = R.$(".ns-ruter");
    const sp = R.S && aktiv(R.S);
    if (!ruteEl || !sp) return -1;
    const b = ruteEl.getBoundingClientRect();
    const c = b.width / sp.n;
    const kx = (x - b.left) / c;
    const ky = (y - b.top) / c;
    if (kx < 0 || ky < 0 || kx >= sp.n || ky >= sp.n) return -1;
    // While dragging, a cell counts only near its middle (no slips across a corner).
    if (midt && (Math.abs((kx % 1) - 0.5) > 0.38 || Math.abs((ky % 1) - 0.5) > 0.38)) return -1;
    return Math.floor(ky) * sp.n + Math.floor(kx);
  }

  function bindBrett(S, rot) {
    ruter = R.$$(".ns-ruter i", rot);
    const brett = R.$(".ns-brett", rot);
    if (!brett) return;
    const ned = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const S2 = R.S;
      const sp = aktiv(S2);
      if (!kanSpille(sp) || performance.now() - inntil < 350) return;
      const j = celleVed(e.clientX, e.clientY, false);
      if (j < 0) return;
      e.preventDefault();
      R.lyd.lasOpp();
      const gammel = sp.sti.slice();
      const k = sp.sti.indexOf(j);
      let endret = false;
      if (k >= 0) {
        // On the thread: cut it here and draw on from this cell.
        if (k < sp.sti.length - 1) {
          sp.sti = sp.sti.slice(0, k + 1);
          endret = true;
          R.lyd.tone(420, 0, 0.06, "triangle", 0.07, 340);
        }
      } else if (M.sidestilt(sp.n, sp.sti[sp.sti.length - 1], j)) endret = steg(sp, j);
      else {
        const r = rettFram(sp, j);
        if (r && r.sti) {
          sp.sti = r.sti;
          endret = true;
          R.lyd.tone(560, 0, 0.06, "triangle", 0.07);
        } else if (r && r.nei) nei(sp, r.i, r.nei);
        else nei(sp, j, { hvorfor: "avstand" });
      }
      if (endret) oppdater(S2);
      dra = { id: e.pointerId, gammel, sist: j };
      try {
        brett.setPointerCapture(e.pointerId);
      } catch (x) {
        /* ignore */
      }
      if (endret && M.ferdig(sp.n, sp.tall, sp.sti)) {
        endre(sp, gammel);
        dra = null;
        etterEndring(S2);
      }
    };
    const flytt = (e) => {
      if (!dra || e.pointerId !== dra.id) return;
      const S2 = R.S;
      const sp = aktiv(S2);
      if (!kanSpille(sp)) return;
      const j = celleVed(e.clientX, e.clientY, true);
      if (j < 0 || j === dra.sist) return;
      dra.sist = j;
      const L = sp.sti.length;
      const k = sp.sti.indexOf(j);
      let endret = false;
      if (k >= 0 && k < L - 1) {
        // Back along the thread.
        sp.sti = sp.sti.slice(0, k + 1);
        endret = true;
        R.lyd.tone(420, 0, 0.04, "triangle", 0.05, 360);
      } else if (k < 0) {
        if (M.sidestilt(sp.n, sp.sti[L - 1], j)) endret = steg(sp, j);
        else {
          const r = rettFram(sp, j);
          if (r && r.sti) {
            sp.sti = r.sti;
            endret = true;
          }
        }
      }
      if (endret) {
        oppdater(S2);
        if (M.ferdig(sp.n, sp.tall, sp.sti)) {
          endre(sp, dra.gammel);
          dra = null;
          etterEndring(S2);
        }
      }
    };
    const opp = (e) => {
      if (!dra || e.pointerId !== dra.id) return;
      const d = dra;
      dra = null;
      const S2 = R.S;
      const sp = aktiv(S2);
      if (!sp) return;
      if (d.gammel.join() !== sp.sti.join()) {
        endre(sp, d.gammel);
        etterEndring(S2);
      }
    };
    const fokus = () => {
      const sp = aktiv(R.S);
      if (sp && !sp.ferdig && sp.sti.length <= 1) R.si(R.t("Bruk piltastene for å trekke tråden fra 1."));
    };
    const ingen = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    brett.addEventListener("pointerdown", ned);
    brett.addEventListener("pointermove", flytt);
    brett.addEventListener("pointerup", opp);
    brett.addEventListener("pointercancel", opp);
    brett.addEventListener("focus", fokus);
    brett.addEventListener("contextmenu", ingen);
    R.vedForlat(() => {
      dra = null;
      brett.removeEventListener("pointerdown", ned);
      brett.removeEventListener("pointermove", flytt);
      brett.removeEventListener("pointerup", opp);
      brett.removeEventListener("pointercancel", opp);
      brett.removeEventListener("focus", fokus);
      brett.removeEventListener("contextmenu", ingen);
    });
  }

  // Keyboard: arrows draw the thread on (or back), Backspace takes back one cell, Ctrl/Cmd+Z undo,
  // H hint, P pause.
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    const sp = S && aktiv(S);
    if (!S || S.skjerm !== "spill" || !sp || sp.ferdig || R.arkApent()) return;
    const el = e.target;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    const k = e.key;
    if (e.ctrlKey || e.metaKey) {
      if (k.toLowerCase() === "z") {
        e.preventDefault();
        angre(S);
      }
      return;
    }
    if (e.altKey) return;
    if (sp.pause) {
      if (k === "p" || k === "P") settPause(S, false);
      return;
    }
    if (!kanSpille(sp)) return;
    const n = sp.n;
    const PIL = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
    const lav = k.toLowerCase();
    if (PIL[k]) {
      e.preventDefault();
      const ende = sp.sti[sp.sti.length - 1];
      const j = ende + PIL[k];
      const ute = j < 0 || j >= n * n || ((k === "ArrowLeft" || k === "ArrowRight") && radAv(sp, j) !== radAv(sp, ende));
      if (ute) return nei(sp, -2, { hvorfor: "avstand" });
      const gammel = sp.sti.slice();
      if (steg(sp, j)) {
        endre(sp, gammel);
        etterEndring(S);
      }
    } else if (k === "Backspace" || k === "Delete") {
      e.preventDefault();
      if (sp.sti.length <= 1) return;
      endre(sp, sp.sti.slice());
      sp.sti.pop();
      etterEndring(S);
    } else if (lav === "h") {
      e.preventDefault();
      brukHint(S);
    } else if (lav === "p") settPause(S, true);
  });

  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass();
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !aktiv(S)) return;
    if (document.hidden) {
      stoppKlokke(S);
      meldIGang(S);
      R.lagre();
    } else startKlokke(S);
  });
  window.addEventListener("pagehide", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !aktiv(S)) return;
    stoppKlokke(S);
    R.lagre();
    startKlokke(S);
  });

  // The play screen fills the phone exactly: no page scroll, rubber band or zoom.
  const fastSide = (pa) => document.documentElement.classList.toggle("ns-fast", !!pa);

  // ---------- Small pieces of the screens ----------

  const kalender = (tekst) => `<span class="ns-kal" aria-hidden="true"><small>${esc(datoFmt(tekst, { month: "short" }).replace(".", "").slice(0, 3))}</small><b>${Number(tekst.slice(8, 10))}</b></span>`;
  const storIkon = (n) => `<span class="ns-styrke" aria-hidden="true">${[5, 6, 7, 8].map((k) => `<i class="${k <= n ? "pa" : ""}"></i>`).join("")}</span>`;
  // The finished thread in miniature (the numbers only as dots).
  function miniBrett(sp) {
    const n = sp.n;
    const prikker = sp.tall.map((t, i) => (t ? `<circle cx="${(i % n) + 0.5}" cy="${Math.floor(i / n) + 0.5}" r="0.22"/>` : "")).join("");
    return `<svg class="ns-mini" viewBox="-0.2 -0.2 ${n + 0.4} ${n + 0.4}" aria-hidden="true" focusable="false"><rect x="-0.2" y="-0.2" width="${n + 0.4}" height="${n + 0.4}" rx="0.5"/><path d="${traadD(sp)}"/><g>${prikker}</g></svg>`;
  }

  function gyldigSpill(sp, dag) {
    if (!sp || typeof sp !== "object") return false;
    if (dag ? typeof sp.dagens !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sp.dagens) || !Number.isInteger(sp.dagNr) : sp.dagens != null) return false;
    const n = sp.n;
    if (!STR.includes(n)) return false;
    const N = n * n;
    const celle = (i) => Number.isInteger(i) && i >= 0 && i < N;
    if (!Array.isArray(sp.losning) || sp.losning.length !== N || new Set(sp.losning).size !== N || !sp.losning.every(celle)) return false;
    if (!Array.isArray(sp.tall) || sp.tall.length !== N || !sp.tall.every((t) => Number.isInteger(t) && t >= 0) || sp.tall[sp.losning[0]] !== 1) return false;
    if (!Array.isArray(sp.vegger) || sp.vegger.length !== N * 2 || !sp.vegger.every((x) => x === 0 || x === 1)) return false;
    // A saved thread must be a legal one (else it starts again from 1).
    const lovlig = (sti) => {
      if (!Array.isArray(sti) || !sti.length || sti[0] !== sp.losning[0] || !sti.every(celle)) return false;
      for (let k = 1; k < sti.length; k++) if (M.kanGaa(n, sp.tall, sp.vegger, sti.slice(0, k), sti[k])) return false;
      return true;
    };
    if (!lovlig(sp.sti)) sp.sti = [sp.losning[0]];
    sp.angre = Array.isArray(sp.angre) ? sp.angre.filter(lovlig) : [];
    sp.hintCeller = null;
    sp.hintIgjen = R.klamp(Number(sp.hintIgjen) || 0, 0, HINT);
    sp.tid = Math.max(0, Number(sp.tid) || 0);
    sp.pause = !!sp.pause;
    sp.ferdig = !!sp.ferdig;
    if (sp.ferdig && !sp.resultat) sp.resultat = { sek: Math.round(sp.tid / 1000), hint: HINT - sp.hintIgjen };
    return true;
  }

  // ---------- Start ----------

  R.start({
    id: "nostet",
    versjon: 1,
    pagar: (S) => iGang(S.fri) || iGang(dagensSpill(S)),

    tilstand: () => ({
      oppsett: { n: 6 },
      rekorder: {},
      daglig: { dager: {}, rekke: 0, beste: 0, sistNr: 0 },
      fri: null,
      dag: null,
      modus: "fri",
    }),

    lastet(S) {
      S.oppsett = { n: STR.includes(S.oppsett && S.oppsett.n) ? S.oppsett.n : 6 };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      for (const k of Object.keys(S.rekorder)) if (!STR.includes(Number(k)) || !S.rekorder[k] || !(S.rekorder[k].tid > 0)) delete S.rekorder[k];
      const d = S.daglig;
      if (!d || typeof d !== "object" || !d.dager || typeof d.dager !== "object") S.daglig = { dager: {}, rekke: 0, beste: 0, sistNr: 0 };
      else {
        for (const k of Object.keys(d.dager)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d.dager[k] || !(d.dager[k].sek > 0)) delete d.dager[k];
        d.rekke = Math.max(0, Math.floor(Number(d.rekke) || 0));
        d.beste = Math.max(d.rekke, Math.floor(Number(d.beste) || 0));
        d.sistNr = Math.floor(Number(d.sistNr) || 0);
      }
      if (!gyldigSpill(S.fri, false)) S.fri = null;
      // Only today's puzzle is kept (an older one is in the log already).
      if (!gyldigSpill(S.dag, true) || S.dag.dagens !== R.dag().tekst) S.dag = null;
      if (S.modus !== "dag" && S.modus !== "fri") S.modus = "fri";
      const sp = aktiv(S);
      if (S.skjerm === "slutt" && (!sp || !sp.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!sp || sp.ferdig)) S.skjerm = sp ? "slutt" : "hjem";
      // The front page reads the daily from the kit's own key: say it again on every load.
      const lost = S.daglig.dager[R.dag().tekst];
      if (lost && S.daglig.sistNr === R.dag().nr) R.dagligFerdig({ vunnet: true, rekke: S.daglig.rekke, res: visTid(lost.sek * 1000) });
    },

    // rusj.no/nostet/#dagens (the front page's «I dag») opens today's puzzle – or its result.
    vedHash: (S, hash) => (hash === "dagens" ? apneDagens(S) : null),

    regler: {
      intro: R.t("Trekk én sammenhengende tråd gjennom alle rutene. Start på 1, ta tallene i rekkefølge og slutt på det høyeste."),
      steg: [
        [R.t("Dra tråden"), R.t("Dra fingeren fra 1 til ruta ved siden av, og videre. Du kan også trykke på en rute i samme rad eller kolonne som enden av tråden.")],
        [R.t("Gå tilbake"), R.t("Dra tilbake langs tråden, eller trykk på en rute i tråden for å kutte den der.")],
        [R.t("Hver rute én gang"), R.t("Tråden går sidelengs eller opp og ned, aldri på skrå, aldri gjennom en vegg og aldri over seg selv.")],
      ],
      tips: [
        R.t("Se etter hjørner og trange ganger: der er det ofte bare én vei inn og én vei ut."),
        R.t("Tallene sier rekkefølgen, ikke avstanden. Det kan være mange ruter mellom 2 og 3."),
        R.t("Det siste tallet tar du til slutt, når alle de andre rutene er med."),
        R.t("Står du fast? Hint fører tråden riktig fram til neste tall. Hvert brett har bare én løsning."),
        R.t("Dagens nøste er det samme for alle: lite på mandag, større i helgen."),
        R.t("Med tastatur: piltastene trekker tråden, Backspace tar den ett steg tilbake, H gir hint og P er pause."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = R.dag();
          const dag = dagensSpill(S);
          const lost = S.daglig.dager[d.tekst];
          const fri = iGang(S.fri) ? S.fri : null;
          const r = dagRekke(S);
          const regler = R.ui.lenke(R.t("Slik spiller du"), "regler");
          const friTekst = fri ? R.t("Fortsett · {str} · {tid}", { str: storrelse(fri.n), tid: visTid(fri.tid) }) : R.t("Spill fritt · {str}", { str: storrelse(S.oppsett.n) });
          const friH = fri ? "fortsett" : "nytt";
          const bytt = R.ui.lenke(fri ? R.t("Nytt spill") : R.t("Bytt størrelse"), "bytt");
          let knapper;
          if (!lost) {
            const n = M.dagligStorrelse(d.nr);
            const igang = dag && paabegynt(dag);
            const under = igang ? `${storrelse(dag.n)} · ${visTid(dag.tid)}` : `${stor(ukedag(d.tekst))} · ${storrelse(n)}${r > 0 ? ` · 🔥 ${R.t("{dager} på rad", { dager: R.flertall(r, "dag", "dager") })}` : ""}`;
            knapper =
              R.ui.knapp("", "dagens", {
                variant: "stor",
                tekstHtml: `${kalender(d.tekst)}<span class="ns-dagknapp"><b>${esc(igang ? R.t("Fortsett dagens") : R.t("Dagens nøste"))}</b><small>${esc(under)}</small></span>`,
              }) +
              R.ui.knapp2(friTekst, friH) +
              R.ui.lenkerad(bytt, regler);
          } else {
            knapper =
              R.ui.knapp(friTekst, friH) +
              `<p class="ns-daglinje">✓ ${esc(R.t("Dagens nøste: {tid}", { tid: visTid(lost.sek * 1000) }))}${r > 1 ? ` · 🔥 ${esc(R.t("{n} dager på rad", { n: r }))}` : ""}</p>` +
              R.ui.lenkerad(R.ui.lenke(R.t("Se resultatet"), "dagens"), bytt, regler) +
              nedtellingHtml();
          }
          const rek = STR.filter((n) => S.rekorder[n]).map((n) => `<li><b>${storrelse(n)}</b> ${visTid(S.rekorder[n].tid * 1000)}<small> · ${esc(R.flertall(S.rekorder[n].antall, "brett", "brett"))}</small></li>`);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Én tråd gjennom alle rutene."))}<br><em>${esc(R.t("Og tallene i riktig rekkefølge."))}</em>`,
              knapperHtml: knapper,
              merker: [
                ["5–8", R.t("størrelser")],
                ["1", R.t("ny hver dag")],
                ["0", R.t("reklame")],
              ],
            }) + (rek.length ? `<section class="ns-rekorder" aria-label="${esc(R.t("Dine beste tider"))}"><p class="etikett">${esc(R.t("Dine beste tider"))}</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
        inn(S) {
          if (S.daglig.dager[R.dag().tekst]) startNedtelling();
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor stort brett?"))}</h2></div>
              ${R.ui.fliser(
                "storrelse",
                STR.map((n) => ({
                  v: n,
                  tittel: storrelse(n),
                  tekst: S.rekorder[n] ? R.t("Rekord {tid}", { tid: visTid(S.rekorder[n].tid * 1000) }) : NIVA[n],
                  ikon: storIkon(n),
                })),
                S.oppsett.n,
              )}
              <p class="hjelp">${esc(R.t("Hvert brett er nytt og har bare én løsning – du trenger aldri gjette."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = aktiv(S);
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(sp.dagens ? R.t("Dagens nøste") : R.t("Nøstet, {str}", { str: storrelse(sp.n) }))}</h1>
            <div class="ns-spill${sp.pause ? " pauset" : ""}">
              <div class="ns-topp">${hudHtml(S, sp)}</div>
              <div class="ns-flate">
                <div class="ns-midt">
                  <div class="ns-brett" tabindex="0" role="group" aria-label="${esc(R.t("Brettet, {n} ganger {n} ruter. Piltastene trekker tråden.", { n: sp.n }))}" aria-describedby="ns-tekst" style="--n:${sp.n}">${brettHtml(sp)}</div>
                  <div class="ns-under"><p class="ns-tips" aria-hidden="true">${esc(R.t("Dra fra 1 gjennom alle rutene."))}</p><p class="ns-melding" role="status"></p></div>
                </div>
                <div class="ns-pauseboks"${sp.pause ? "" : " hidden"}>
                  <div class="ns-pausekort">
                    <p class="etikett">${esc(R.t("Pause"))}</p>
                    <p class="ns-pausetekst">${esc(R.t("Brettet venter på deg."))}</p>
                    ${R.ui.knapp(R.t("Fortsett"), "fortsett-spill")}
                  </div>
                </div>
              </div>
              <ol class="vh" id="ns-tekst" aria-label="${esc(R.t("Brettet rad for rad"))}"></ol>
              <div class="ns-plass"></div>
              ${R.ui.dokk(verktoyHtml(sp))}
            </div>`;
        },
        etter(S, rot) {
          bindBrett(S, rot);
          oppdater(S);
          tilpass();
          const flate = R.$(".ns-flate", rot);
          if (flate && typeof ResizeObserver === "function") {
            const obs = new ResizeObserver(() => tilpass());
            obs.observe(flate);
            R.vedForlat(() => obs.disconnect());
          }
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp || sp.ferdig) return R.gaTil(sp ? "slutt" : "hjem");
          las = false;
          inntil = performance.now();
          fastSide(true);
          tilpass();
          R.holdVaken();
          startKlokke(S);
          const id = setInterval(tikk, 250);
          R.vedForlat(() => clearInterval(id));
        },
        ut(S) {
          stoppKlokke(S);
          meldIGang(S);
          arkPause = false;
          las = false;
          ruter = [];
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const r = sp.resultat || { sek: Math.round(sp.tid / 1000), hint: HINT - sp.hintIgjen };
          const str = storrelse(sp.n);
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const tall = `<div class="ns-resultat">
              <div class="ns-tall-boks${r.nyRekord ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>${esc(R.t("tid"))}</span>${r.nyRekord ? `<i class="ns-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="ns-tall-boks"><b>${r.hint}</b><span>${esc(R.t("hint brukt|hint brukt", { n: r.hint }))}</span></div>
            </div>`;
          if (sp.dagens) {
            const idag = sp.dagens === R.dag().tekst;
            const linje = r.dagForrige ? R.t("Du løste dagens nøste på {tid} første gang.", { tid: visTid(r.dagForrige * 1000) }) : r.hint ? R.t("Alle i hele landet får det samme nøstet i dag.") : R.t("Uten hint! Alle i hele landet får det samme nøstet i dag.");
            return `
              ${R.ui.banner({ etikett: `${R.t("{navn} nr. {nr}", { navn: NAVN(), nr: nrFor(sp.dagNr) })} · ${datoTekst(sp.dagens)}`, tittel: R.t("Godt jobba!"), klasse: "aksent" })}
              ${tall}
              <p class="hjelp">${esc(linje)}</p>
              <div class="ns-dagboks">
                ${r.rekke ? `<p class="ns-rekke"><span aria-hidden="true">🔥</span> ${esc(R.t("{dager} på rad", { dager: R.flertall(r.rekke, "dag", "dager") }))}</p>` : ""}
                ${idag ? nedtellingHtml() : `<p class="ns-nedtelling"><b>${esc(R.t("Et nytt nøste er klart!"))}</b></p>`}
              </div>
              ${miniBrett(sp)}
              ${R.ui.flereSpill({ antall: 1 })}
              ${idag ? R.ui.dokk(R.ui.knapp(R.t("Del resultatet"), "del"), R.ui.lenkerad(R.ui.lenke(R.t("Spill fritt"), "fri"), alle)) : R.ui.dokk(R.ui.knapp(R.t("Dagens nøste"), "dagens"), R.ui.lenkerad(alle))}`;
          }
          let linje;
          if (r.nyRekord) linje = R.t("Ny personlig rekord på {str}! Forrige: {tid}.", { str, tid: visTid(r.gml * 1000) });
          else if (r.gml) linje = R.t("Rekorden din på {str}: {tid}.", { str, tid: visTid(Math.min(r.gml, r.sek) * 1000) });
          else linje = R.t("Første brett på {str} – nå har du en rekord å slå!", { str });
          return `
            ${R.ui.banner({ etikett: R.t("{str} · løst", { str }), tittel: r.nyRekord ? R.t("Ny rekord!") : R.t("Godt jobba!"), klasse: "aksent", stemning: r.nyRekord || !r.hint ? "jubel" : "" })}
            ${tall}
            <p class="hjelp">${esc(linje)}</p>
            ${miniBrett(sp)}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "bytt"), alle))}`;
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp) return;
          const r = sp.resultat || {};
          if (sp.dagens && sp.dagens === R.dag().tekst) startNedtelling();
          // Celebrate in proportion: fanfare for a clean solve, a record or the daily; warm otherwise.
          if (r.hint === 0 || r.nyRekord || sp.dagens) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
        },
      },
    },

    handlinger: (H = {
      // «Spill fritt»: a new board at once, at the last size played.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      bytt: () => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        S.modus = "fri";
        R.gaTil(iGang(S.fri) ? "spill" : "hjem");
      },
      fri(el, e, S) {
        if (iGang(S.fri)) return H.fortsett(el, e, S);
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      dagens: (el, e, S) => R.gaTil(apneDagens(S)),
      storrelse(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.n = STR.includes(n) ? n : 6;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      angre: (el, e, S) => angre(S),
      tom: (el, e, S) => tom(S),
      hint: (el, e, S) => brukHint(S),
      pause: (el, e, S) => settPause(S, !aktiv(S).pause),
      "fortsett-spill": (el, e, S) => settPause(S, false),
      del(el, e, S) {
        const sp = S.dag;
        const best = sp && sp.dagens && S.daglig.dager[sp.dagens];
        if (!best) return;
        const rekke = (sp.resultat && sp.resultat.rekke) || 0;
        const tid = visTid(best.sek * 1000);
        const tittel = R.t("{navn} nr. {nr}", { navn: NAVN(), nr: nrFor(sp.dagNr) });
        const hint = best.hint ? R.t("{n} hint", { n: best.hint }) : R.t("uten hint");
        const dager = rekke > 1 ? `🔥 ${R.t("{n} dager på rad", { n: rekke })}` : "";
        const tekst = `🧶 ${tittel} · ${storrelse(best.n || sp.n)} · ${tid} · ${hint}${dager ? ` · ${dager}` : ""}. ${R.t("Klarer du dagens nøste?")}`;
        const linjer = [tid, `${storrelse(best.n || sp.n)} · ${hint}`];
        if (dager) linjer.push(dager);
        R.del(R.t("{navn} – dagens nøste", { navn: NAVN() }), tekst, ADRESSE + "#utfordring", { kort: { tittel, linjer } });
      },
    }),
  });

  // For the tests and curious minds: the engine is also reachable from the console.
  window.Nostet = motor;
})();
