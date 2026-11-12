/* Blokka — a block puzzle on an 8 × 8 board.
   Three pieces are offered at a time. Drag one onto the board (it is lifted above the finger and a
   shadow shows where it lands), or tap a piece and then a cell, or use the keyboard (1–3 picks a
   piece, the arrow keys move it, Enter places it). Pieces never turn. A full row or column is
   cleared; several lines at once is a combo, clears close together make a streak. When none of
   the pieces that are left fits anywhere, the game is over.
   «Dagens blokk»: the same 60 pieces for everyone on an Oslo day, one try, no undo.
   The rules (Blokk) are pure functions at the top; test/blokka.test.mjs loads this file without
   the kit (node:vm) and checks them.

   ---------- The piece generator ----------
   Every piece fits an empty board (the biggest is 3 × 3 or 5 long). A set of three is drawn with
   weights per size group (base weights in VEKT), adjusted by how full the board is (f = filled
   cells / 64):
     1–3 cells × (1 + 3f)   – more small pieces as the board fills up
     4 cells   × 1
     5+ cells  × max(0.15, 1 − 1.6f) – fewer big pieces on a crowded board
   and uniformly inside a group. Free play is fair: if none of the three fits the board as it is,
   the set is drawn again (up to 30 times, from the same seed), and as a last resort the first
   piece is replaced by the biggest piece that fits (a single cell always fits a board that is not
   full). The seed is saved, so an undo followed by the same move deals the same pieces.
   «Dagens blokk» cannot look at the board (then the pieces would differ between players): set k
   of the day comes from the date and k alone, drawn with a fixed f = 0.25. */
(function () {
  "use strict";

  // ---------- The rules ----------

  const Blokk = (() => {
    const N = 8;
    // [id, colour 1–7, art (rows split by "/"), name for a screen reader]
    const DEF = [
      ["1", 2, "#", "Prikk"],
      ["2h", 4, "##", "Strek på 2, liggende"],
      ["2v", 4, "#/#", "Strek på 2, stående"],
      ["3h", 4, "###", "Strek på 3, liggende"],
      ["3v", 4, "#/#/#", "Strek på 3, stående"],
      ["4h", 4, "####", "Strek på 4, liggende"],
      ["4v", 4, "#/#/#/#", "Strek på 4, stående"],
      ["5h", 4, "#####", "Strek på 5, liggende"],
      ["5v", 4, "#/#/#/#/#", "Strek på 5, stående"],
      ["h3a", 3, "##/#.", "Lite hjørne, åpent nede til høyre"],
      ["h3b", 3, "##/.#", "Lite hjørne, åpent nede til venstre"],
      ["h3c", 3, "#./##", "Lite hjørne, åpent oppe til høyre"],
      ["h3d", 3, ".#/##", "Lite hjørne, åpent oppe til venstre"],
      ["o4", 2, "##/##", "Kvadrat 2 × 2"],
      ["l4a", 6, "#./#./##", "L på 4, stående, fot nede til høyre"],
      ["l4b", 6, ".#/.#/##", "L på 4, stående, fot nede til venstre"],
      ["l4c", 6, "##/#./#.", "L på 4, stående, arm oppe til høyre"],
      ["l4d", 6, "##/.#/.#", "L på 4, stående, arm oppe til venstre"],
      ["l4e", 6, "###/#..", "L på 4, liggende, arm nede til venstre"],
      ["l4f", 6, "###/..#", "L på 4, liggende, arm nede til høyre"],
      ["l4g", 6, "#../###", "L på 4, liggende, arm oppe til venstre"],
      ["l4h", 6, "..#/###", "L på 4, liggende, arm oppe til høyre"],
      ["t4a", 5, "###/.#.", "T, spissen ned"],
      ["t4b", 5, ".#./###", "T, spissen opp"],
      ["t4c", 5, "#./##/#.", "T, spissen til høyre"],
      ["t4d", 5, ".#/##/.#", "T, spissen til venstre"],
      ["s4a", 7, ".##/##.", "Trapp, liggende, stiger mot høyre"],
      ["s4b", 7, "##./.##", "Trapp, liggende, stiger mot venstre"],
      ["s4c", 7, "#./##/.#", "Trapp, stående, går ned mot høyre"],
      ["s4d", 7, ".#/##/#.", "Trapp, stående, går ned mot venstre"],
      ["h5a", 1, "###/#../#..", "Stort hjørne, åpent nede til høyre"],
      ["h5b", 1, "###/..#/..#", "Stort hjørne, åpent nede til venstre"],
      ["h5c", 1, "#../#../###", "Stort hjørne, åpent oppe til høyre"],
      ["h5d", 1, "..#/..#/###", "Stort hjørne, åpent oppe til venstre"],
      ["r6h", 3, "###/###", "Rektangel 3 × 2, liggende"],
      ["r6v", 3, "##/##/##", "Rektangel 2 × 3, stående"],
      ["o9", 2, "###/###/###", "Kvadrat 3 × 3"],
    ];
    const FORMER = Object.create(null);
    const LISTE = [];
    for (const [id, farge, art, navn] of DEF) {
      const rader = art.split("/");
      const celler = [];
      rader.forEach((r, y) => [...r].forEach((t, x) => t === "#" && celler.push([x, y])));
      const f = { id, farge, navn, celler, b: Math.max(...rader.map((r) => r.length)), h: rader.length, n: celler.length };
      FORMER[id] = f;
      LISTE.push(f);
    }
    // Base weight per size group (shared evenly by the shapes of the group).
    const VEKT = { 1: 3, 2: 8, 3: 16, 4: 34, 5: 20, 6: 9, 9: 6 };
    const GRUPPER = Object.create(null);
    for (const f of LISTE) (GRUPPER[f.n] = GRUPPER[f.n] || []).push(f.id);
    const DAG_F = 0.25;

    const form = (id) => (typeof id === "string" && FORMER[id]) || null;
    const tomt = () => new Array(N * N).fill(0);
    const fylte = (brett) => brett.reduce((n, v) => n + (v ? 1 : 0), 0);

    function passer(brett, f, x, y) {
      if (!f || x < 0 || y < 0 || x + f.b > N || y + f.h > N) return false;
      for (const [cx, cy] of f.celler) if (brett[(y + cy) * N + x + cx]) return false;
      return true;
    }
    function plasser1(brett, f) {
      for (let y = 0; y + f.h <= N; y++) for (let x = 0; x + f.b <= N; x++) if (passer(brett, f, x, y)) return { x, y };
      return null;
    }
    const finnesPlass = (brett, f) => !!plasser1(brett, f);

    // The full rows and columns of a board.
    function fulle(brett) {
      const rader = [];
      const kolonner = [];
      for (let i = 0; i < N; i++) {
        let r = true;
        let k = true;
        for (let j = 0; j < N; j++) {
          if (!brett[i * N + j]) r = false;
          if (!brett[j * N + i]) k = false;
        }
        if (r) rader.push(i);
        if (k) kolonner.push(i);
      }
      return { rader, kolonner };
    }

    // Puts piece f at (x, y). Returns the new board (cleared), the lines and the cleared cells
    // (with their colours, for the burst) – or null if it does not fit.
    function legg(brett, f, x, y) {
      if (!passer(brett, f, x, y)) return null;
      const b = brett.slice();
      for (const [cx, cy] of f.celler) b[(y + cy) * N + x + cx] = f.farge;
      const { rader, kolonner } = fulle(b);
      const ryddet = [];
      const sett = new Set();
      for (const r of rader) for (let j = 0; j < N; j++) sett.add(r * N + j);
      for (const k of kolonner) for (let j = 0; j < N; j++) sett.add(j * N + k);
      for (const i of [...sett].sort((a, c) => a - c)) {
        ryddet.push({ x: i % N, y: Math.floor(i / N), farge: b[i] });
        b[i] = 0;
      }
      return { brett: b, rader, kolonner, linjer: rader.length + kolonner.length, ryddet };
    }

    // Points: 1 per cell placed; lines cleared at once give 10, 30, 60, 100 … (10 × L(L+1)/2),
    // multiplied by the streak (× 1, × 1.5, × 2 …); an empty board after a clear gives 300.
    const linjepoeng = (l) => (10 * l * (l + 1)) / 2;
    function poeng(celler, linjer, rekke, rentBrett) {
      const linje = linjer ? Math.round(linjepoeng(linjer) * (1 + 0.5 * Math.max(0, rekke - 1))) : 0;
      return { celler, linje, rent: linjer && rentBrett ? 300 : 0, sum: celler + linje + (linjer && rentBrett ? 300 : 0) };
    }
    // The streak: a clear within three pieces of the last one adds one; three pieces in a row
    // without a clear end it. Returns the new { rekke, siden }.
    function nyRekke(rekke, siden, linjer) {
      if (linjer) return { rekke: rekke > 0 ? rekke + 1 : 1, siden: 0 };
      const s = siden + 1;
      return { rekke: s >= 3 ? 0 : rekke, siden: s };
    }

    // ---------- Random numbers (the same generator as the kit's, kept here so the daily never changes) ----------
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

    // Group weights for a board that is f full (0–1).
    function vekter(f) {
      const v = {};
      for (const n of Object.keys(VEKT).map(Number)) v[n] = VEKT[n] * (n <= 3 ? 1 + 3 * f : n === 4 ? 1 : Math.max(0.15, 1 - 1.6 * f));
      return v;
    }
    function trekk1(tilf, v) {
      const sum = Object.values(v).reduce((a, b) => a + b, 0);
      let r = tilf() * sum;
      let gruppe = 1;
      for (const n of Object.keys(v)) {
        gruppe = Number(n);
        r -= v[n];
        if (r < 0) break;
      }
      const ids = GRUPPER[gruppe];
      return ids[Math.min(ids.length - 1, Math.floor(tilf() * ids.length))];
    }

    // A fair set of three for this board (free play). Returns { ids, fro } – fro is the next seed.
    function delUt(brett, fro) {
      const tilf = rng(fro);
      const v = vekter(fylte(brett) / (N * N));
      let ids = null;
      for (let forsok = 0; forsok < 30; forsok++) {
        const s = [trekk1(tilf, v), trekk1(tilf, v), trekk1(tilf, v)];
        if (s.some((id) => finnesPlass(brett, FORMER[id]))) {
          ids = s;
          break;
        }
      }
      if (!ids) {
        ids = [trekk1(tilf, v), trekk1(tilf, v), trekk1(tilf, v)];
        const passe = LISTE.filter((f) => finnesPlass(brett, f)).sort((a, b) => b.n - a.n);
        if (passe.length) ids[0] = passe[0].id;
      }
      return { ids, fro: Math.floor(tilf() * 4294967296) >>> 0 };
    }

    // Set k (0, 1, 2 …) of the day's sequence: from the date alone, the same on every phone.
    function dagSett(dato, k) {
      const tilf = rng(fnv(`blokka:${dato}:${k}`));
      const v = vekter(DAG_F);
      return [trekk1(tilf, v), trekk1(tilf, v), trekk1(tilf, v)];
    }

    // Game over: none of the pieces that are left fits anywhere.
    const erOver = (brett, tilbud) => tilbud.every((id) => !id || !finnesPlass(brett, FORMER[id])) && tilbud.some((id) => !!id);

    return { N, FORMER, LISTE, VEKT, form, tomt, fylte, passer, plasser1, finnesPlass, fulle, legg, linjepoeng, poeng, nyRekke, fnv, rng, vekter, delUt, dagSett, erOver };
  })();

  const R = window.Rusj;
  if (!R) {
    window.Blokka = { Blokk };
    return;
  }
  const esc = R.esc;
  const N = Blokk.N;
  const F = Blokk.FORMER;

  const DAG_SETT = 20; // «Dagens blokk»: 20 sets, 60 pieces
  const DAG_BRIKKER = DAG_SETT * 3;
  const UKEDAG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const MANED = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  const KOMBO = ["", "", "Dobbel!", "Trippel!", "Firedobbel!", "Femdobbel!", "Seksdobbel!"];
  const LOFT = 64; // px the dragged piece floats above a finger

  let H; // actions
  let valgt = -1; // the selected piece (tap or keyboard), -1 = none
  let markor = null; // keyboard: top-left cell of the shadow {x, y}
  let dra = null; // a drag under way
  let las = false; // the game-over message is showing
  let sisteDra = 0; // time of the last drop (a click right after it is not a tap)

  const ukedag = (nr) => UKEDAG[(((nr + 4) % 7) + 7) % 7]; // day 0 (1 Jan 1970) was a Thursday
  const datoTekst = (tekst) => `${Number(tekst.slice(8, 10))}. ${MANED[Number(tekst.slice(5, 7)) - 1]}`;
  const kortDato = (tekst) => `${Number(tekst.slice(8, 10))}.${Number(tekst.slice(5, 7))}`;
  const resTekst = (p) => `${R.tall(p)} p`;

  // ---------- The game state ----------

  const aktiv = (S) => (S.modus === "dag" ? S.dag : S.fri);
  const iGang = (sp) => !!(sp && !sp.ferdig && sp.lagt > 0);
  const dagensSpill = (S) => (S.dag && S.dag.dagens === R.dag().tekst ? S.dag : null);
  // Days in a row with a finished daily; the streak lives until a whole day is skipped.
  const dagRekke = (S) => (S.daglig.sistNr >= R.dag().nr - 1 ? S.daglig.rekke || 0 : 0);

  function nyttSpill(S, dag) {
    const d = dag ? R.dag() : null;
    const sp = {
      dagens: d ? d.tekst : null,
      dagNr: d ? d.nr : null,
      brett: Blokk.tomt(),
      sett: 0,
      tilbud: [],
      fro: d ? 0 : R.nyttFro(),
      poeng: 0,
      linjer: 0,
      lagt: 0,
      rekke: 0,
      siden: 0,
      besteRekke: 0,
      besteKombo: 0,
      forrige: null,
      angretSett: -1,
      over: false,
      grunn: null,
      ferdig: false,
      resultat: null,
      startRekord: dag ? 0 : S.rekord || 0,
    };
    delNytt(sp);
    if (dag) S.dag = sp;
    else {
      bokfor(S, S.fri);
      S.fri = sp;
    }
    S.modus = dag ? "dag" : "fri";
    valgt = -1;
    markor = null;
    las = false;
    R.statistikk("start", { dagens: !!dag });
  }

  function delNytt(sp) {
    if (sp.dagens) sp.tilbud = Blokk.dagSett(sp.dagens, sp.sett);
    else {
      const d = Blokk.delUt(sp.brett, sp.fro);
      sp.tilbud = d.ids;
      sp.fro = d.fro;
    }
  }

  // A game left for a new one keeps its score as the record (never written during play, so an undo leaves no trace).
  function bokfor(S, sp) {
    if (!sp || sp.dagens || sp.ferdig) return;
    S.rekord = Math.max(S.rekord || 0, sp.poeng);
  }

  const kopi = (sp) => ({
    brett: sp.brett.slice(),
    sett: sp.sett,
    tilbud: sp.tilbud.slice(),
    fro: sp.fro,
    poeng: sp.poeng,
    linjer: sp.linjer,
    lagt: sp.lagt,
    rekke: sp.rekke,
    siden: sp.siden,
    besteRekke: sp.besteRekke,
    besteKombo: sp.besteKombo,
  });
  const kanAngre = (sp) => !!(sp && !sp.dagens && sp.forrige && sp.angretSett !== sp.forrige.sett);

  // Places piece i at (x, y). Returns what happened (for the drawing) or null.
  function legg(sp, i, x, y) {
    const f = F[sp.tilbud[i]];
    const r = f && Blokk.legg(sp.brett, f, x, y);
    if (!r) return null;
    const for1 = sp.dagens ? null : kopi(sp);
    const rk = Blokk.nyRekke(sp.rekke, sp.siden, r.linjer);
    const tomtNa = r.linjer > 0 && Blokk.fylte(r.brett) === 0;
    const p = Blokk.poeng(f.n, r.linjer, rk.rekke, tomtNa);
    sp.brett = r.brett;
    sp.rekke = rk.rekke;
    sp.siden = rk.siden;
    sp.besteRekke = Math.max(sp.besteRekke, sp.rekke);
    sp.besteKombo = Math.max(sp.besteKombo, r.linjer);
    sp.poeng += p.sum;
    sp.linjer += r.linjer;
    sp.lagt += 1;
    sp.tilbud[i] = null;
    sp.forrige = for1;
    let nyttSett = false;
    if (sp.tilbud.every((id) => !id)) {
      sp.sett += 1;
      if (sp.dagens && sp.sett >= DAG_SETT) {
        sp.tilbud = [];
        sp.over = true;
        sp.grunn = "alle";
      } else {
        delNytt(sp);
        nyttSett = true;
      }
    }
    if (!sp.over && Blokk.erOver(sp.brett, sp.tilbud)) {
      sp.over = true;
      sp.grunn = "plass";
    }
    return { f, x, y, ...r, poeng: p, rekke: sp.rekke, rent: tomtNa, nyttSett };
  }

  // ---------- Countdown to the next daily (midnight in Norway) ----------

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
  const nedtellingHtml = () => `<p class="bk-nedtelling">Ny blokk om <b>${klokkeTekst(sekunderTilNy())}</b></p>`;
  let nedtellingId = null;
  function startNedtelling() {
    clearInterval(nedtellingId);
    const dag = R.dag().nr;
    nedtellingId = setInterval(() => {
      const el = R.$(".bk-nedtelling b");
      if (!el) return clearInterval(nedtellingId);
      if (R.dag().nr !== dag) {
        clearInterval(nedtellingId);
        return R.vis();
      }
      el.textContent = klokkeTekst(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(nedtellingId));
  }

  // The front page shows how far today's daily has come until it is finished (rusj/DAGLIG.md).
  function meldIGang(S) {
    const sp = S.dag;
    if (!sp || !sp.lagt || sp.ferdig || sp.dagens !== R.dag().tekst || S.daglig.dager[sp.dagens]) return;
    R.dagligIGang({ tekst: resTekst(sp.poeng) });
  }

  // ---------- Drawing ----------

  // A piece as small blocks (the tray, the result, the dragged piece).
  const formHtml = (f, klasse = "") =>
    `<span class="bk-form f${f.farge}${klasse ? " " + klasse : ""}" style="--w:${f.b};--h:${f.h}" aria-hidden="true">${f.celler.map(([x, y]) => `<i style="--x:${x};--y:${y}"></i>`).join("")}</span>`;

  // Ranges of filled columns in a row: «1–3, 6».
  function spenn(liste) {
    const ut = [];
    for (let i = 0; i < liste.length; i++) {
      let j = i;
      while (j + 1 < liste.length && liste[j + 1] === liste[j] + 1) j++;
      ut.push(j > i ? `${liste[i]}–${liste[j]}` : `${liste[i]}`);
      i = j;
    }
    return ut.join(", ");
  }
  // The board for a screen reader, one short line per row.
  function radTekst(brett, y) {
    const fylt = [];
    for (let x = 0; x < N; x++) if (brett[y * N + x]) fylt.push(x + 1);
    if (!fylt.length) return `Rad ${y + 1}: tom`;
    if (fylt.length === N) return `Rad ${y + 1}: full`;
    return `Rad ${y + 1}: ${spenn(fylt)}`;
  }
  const brettTekst = (brett) => Array.from({ length: N }, (_, y) => `<li>${radTekst(brett, y)}</li>`).join("");

  function brikkeEtikett(sp, i) {
    const f = F[sp.tilbud[i]];
    if (!f) return "";
    const passerIkke = !Blokk.finnesPlass(sp.brett, f);
    return `Brikke ${i + 1}: ${f.navn}, ${R.flertall(f.n, "rute", "ruter")}${passerIkke ? ", passer ikke" : ""}`;
  }

  function brikkerHtml(sp) {
    return [0, 1, 2]
      .map((i) => {
        const f = F[sp.tilbud[i]];
        if (!f) return `<span class="bk-plass tom" aria-hidden="true"></span>`;
        const ikke = !Blokk.finnesPlass(sp.brett, f);
        return `<button class="bk-plass bk-brikke${ikke ? " ikke" : ""}${valgt === i ? " valgt" : ""}" data-h="velg" data-v="${i}" data-stille aria-pressed="${valgt === i}" aria-label="${esc(brikkeEtikett(sp, i))}">${formHtml(f)}${ikke ? '<small class="bk-ikke">Passer ikke</small>' : ""}<kbd aria-hidden="true">${i + 1}</kbd></button>`;
      })
      .join("");
  }

  function hudHtml(S, sp) {
    const dag = !!sp.dagens;
    const rekke = sp.rekke >= 2 ? `<i class="bk-rekke">Rekke ×${sp.rekke}</i>` : "";
    return `<span class="bk-stat bk-poengboks"><small>Poeng</small><b id="bk-poeng">${R.tall(sp.poeng)}</b>${rekke}</span>
      ${
        dag
          ? `<span class="bk-stat"><small>Brikker</small><b id="bk-igjen">${sp.lagt} av ${DAG_BRIKKER}</b></span>`
          : `<span class="bk-stat"><small>Rekord</small><b id="bk-beste">${R.tall(Math.max(S.rekord || 0, sp.poeng))}</b></span>
      <button class="bk-verk" data-h="angre" data-stille aria-label="Angre siste brikke"${kanAngre(sp) ? "" : " disabled"}>${IKON.angre}<span>Angre</span></button>
      <button class="bk-verk" data-h="ny" aria-label="Start på nytt">${IKON.ny}<span>Ny</span></button>`
      }`;
  }

  function tipsTekst(sp) {
    if (sp.over) return sp.grunn === "alle" ? "Alle brikkene er lagt!" : "Ingen av brikkene får plass.";
    if (valgt >= 0 && sp.tilbud[valgt]) return markor ? "Piltastene flytter · Enter legger · Esc angrer valget" : "Trykk på en rute for å legge brikken";
    return sp.lagt < 2 ? "Dra en brikke til brettet – eller trykk på den og så på en rute" : "Fyll en rad eller kolonne for å rydde den";
  }

  // Bring the board, the tray, the HUD and the text for a screen reader up to date.
  function tegn(S, beholdFokus = true) {
    const sp = aktiv(S);
    const ruter = R.$(".bk-ruter");
    if (!sp || !ruter) return;
    const celler = ruter.children;
    for (let i = 0; i < N * N; i++) {
      const v = sp.brett[i];
      celler[i].className = v ? `fylt f${v}` : "";
    }
    const hud = R.$(".bk-hud");
    if (hud) {
      const fokusH = beholdFokus && document.activeElement && hud.contains(document.activeElement) ? document.activeElement.dataset.h : null;
      hud.innerHTML = hudHtml(S, sp);
      if (fokusH) {
        const el = hud.querySelector(`[data-h="${fokusH}"]`);
        if (el && !el.disabled) el.focus({ preventScroll: true });
      }
    }
    const tekst = R.$("#bk-tekst");
    if (tekst) tekst.innerHTML = brettTekst(sp.brett);
    tegnBrikker(S, beholdFokus);
    const tips = R.$(".bk-tips");
    if (tips) tips.textContent = tipsTekst(sp);
    skygge(S);
  }

  function tegnBrikker(S, beholdFokus = true) {
    const sp = aktiv(S);
    const rad = R.$(".bk-brikker");
    if (!rad) return;
    const fokus = document.activeElement && rad.contains(document.activeElement) ? Number(document.activeElement.dataset.v) : -1;
    rad.innerHTML = brikkerHtml(sp);
    rad.classList.toggle("over", !!sp.over);
    if (beholdFokus && fokus >= 0) {
      const alle = R.$$(".bk-brikke", rad);
      const neste = alle.find((b) => Number(b.dataset.v) === fokus) || alle.find((b) => Number(b.dataset.v) > fokus) || alle[0];
      if (neste) neste.focus({ preventScroll: true });
      else R.$(".bk-brett") && R.$(".bk-brett").focus({ preventScroll: true });
    }
  }

  // The shadow: where the selected or dragged piece would land, and the lines it would clear.
  // mal = { i, x, y } or null; the keyboard cursor is used when there is no drag.
  function skygge(S, mal) {
    const sp = aktiv(S);
    const ruter = R.$(".bk-ruter");
    if (!sp || !ruter) return;
    for (let i = 0; i < N * N; i++) {
      const el = ruter.children[i];
      if (el.classList.contains("skygge") || el.classList.contains("feil") || el.classList.contains("snart")) el.className = sp.brett[i] ? `fylt f${sp.brett[i]}` : "";
    }
    const m = mal !== undefined ? mal : valgt >= 0 && markor ? { i: valgt, x: markor.x, y: markor.y } : null;
    const brett = R.$(".bk-brett");
    if (brett) brett.classList.toggle("velger", valgt >= 0);
    if (!m) return;
    const f = F[sp.tilbud[m.i]];
    if (!f) return;
    const ok = Blokk.passer(sp.brett, f, m.x, m.y);
    for (const [cx, cy] of f.celler) {
      const x = m.x + cx;
      const y = m.y + cy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const el = ruter.children[y * N + x];
      el.classList.add(ok ? "skygge" : "feil");
      if (ok) el.classList.add("f" + f.farge);
    }
    if (ok) {
      const r = Blokk.legg(sp.brett, f, m.x, m.y);
      for (const c of r.ryddet) ruter.children[c.y * N + c.x].classList.add("snart");
    }
  }

  // Board geometry in screen pixels.
  function geometri() {
    const ruter = R.$(".bk-ruter");
    if (!ruter) return null;
    const b = ruter.getBoundingClientRect();
    const c0 = ruter.children[0].getBoundingClientRect();
    const c1 = ruter.children[1].getBoundingClientRect();
    return { x: c0.left, y: c0.top, c: c0.width, steg: c1.left - c0.left, b };
  }

  // Board size: the biggest square that fits; whole pixels per cell.
  function tilpass() {
    const flate = R.$(".bk-flate");
    const brett = R.$(".bk-brett");
    if (!flate || !brett) return;
    const plass = Math.min(flate.clientWidth, flate.clientHeight, 520);
    const gap = 3;
    const pad = 6;
    const c = Math.max(24, Math.floor((plass - pad * 2 - gap * (N - 1)) / N));
    brett.style.setProperty("--c", c + "px");
    brett.style.setProperty("--gap", gap + "px");
    brett.style.setProperty("--pad", pad + "px");
  }

  // ---------- Effects ----------

  function effekter(info) {
    const lag = R.$(".bk-effekter");
    const g = geometri();
    if (!lag || !g) return;
    const rolig = R.rolig();
    const steg = g.steg;
    if (info.linjer && !rolig) {
      const frag = document.createDocumentFragment();
      info.ryddet.forEach((c, n) => {
        const k = document.createElement("i");
        k.className = `bk-knus f${c.farge}`;
        k.style.cssText = `--x:${c.x};--y:${c.y};--d:${(Math.abs(c.x - 3.5) + Math.abs(c.y - 3.5)) * 18}ms`;
        frag.appendChild(k);
        const gnister = info.ryddet.length > 24 ? 1 : 2;
        for (let s = 0; s < gnister; s++) {
          const v = Math.random() * Math.PI * 2;
          const l = steg * (0.8 + Math.random() * 1.6);
          const b = document.createElement("b");
          b.className = `bk-gnist f${c.farge}`;
          b.style.cssText = `--x:${c.x};--y:${c.y};--dx:${Math.round(Math.cos(v) * l)}px;--dy:${Math.round(Math.sin(v) * l - steg * 0.4)}px;--d:${(n % 8) * 12}ms`;
          frag.appendChild(b);
        }
      });
      lag.appendChild(frag);
      setTimeout(() => R.$$(".bk-knus, .bk-gnist", lag).forEach((el) => el.remove()), 900);
    }
    if (!rolig) {
      // The piece lands with a small squash.
      const ruter = R.$(".bk-ruter");
      for (const [cx, cy] of info.f.celler) {
        const el = ruter.children[(info.y + cy) * N + info.x + cx];
        if (el.classList.contains("fylt")) {
          el.classList.remove("landet");
          void el.offsetWidth;
          el.classList.add("landet");
        }
      }
    }
    // The words: «Dobbel!», «Rekke ×3», «Rent brett!» and the points.
    if (info.linjer) {
      const ord = info.rent ? "Rent brett!" : KOMBO[info.linjer] || (info.rekke >= 2 ? `Rekke ×${info.rekke}` : info.linjer === 1 ? "Ryddet!" : "Kjempekombo!");
      const under = info.linjer >= 2 && info.rekke >= 2 ? `Rekke ×${info.rekke} · +${R.tall(info.poeng.sum)}` : `+${R.tall(info.poeng.sum)}`;
      const pop = document.createElement("div");
      pop.className = "bk-pop" + (info.linjer >= 2 || info.rekke >= 3 || info.rent ? " stor" : "");
      pop.innerHTML = `<b>${esc(ord)}</b><small>${esc(under)}</small>`;
      lag.appendChild(pop);
      setTimeout(() => pop.remove(), rolig ? 1100 : 1000);
    }
    const p = R.$(".bk-poengboks");
    if (p && !rolig) {
      const pluss = document.createElement("span");
      pluss.className = "bk-pluss";
      pluss.textContent = "+" + R.tall(info.poeng.sum);
      p.appendChild(pluss);
      setTimeout(() => pluss.remove(), 700);
    }
  }

  function lyder(info) {
    if (!info.linjer) {
      R.lyd.tone(300 + info.f.n * 18, 0, 0.06, "sine", 0.08, 220);
      R.vibrer(6);
      return;
    }
    // A short rising run: more lines and a longer streak climb higher.
    const trinn = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
    const start = Math.min(3, Math.max(0, info.rekke - 1));
    const n = Math.min(4, info.linjer + 1);
    for (let k = 0; k < n; k++) R.lyd.tone(trinn[Math.min(trinn.length - 1, start + k)], k * 0.065, 0.12, "triangle", 0.1);
    if (info.rent || info.linjer >= 3) R.lyd.pling();
    R.vibrer(info.linjer >= 2 ? [14, 40, 22] : 14);
  }

  // A sentence for a screen reader after each piece.
  function lesOpp(sp, info) {
    const deler = [`${info.f.navn} lagt i rad ${info.y + 1}, kolonne ${info.x + 1}.`];
    if (info.linjer) {
      const hva = [];
      if (info.rader.length) hva.push(`rad ${R.ramsOpp(info.rader.map((r) => String(r + 1)))}`);
      if (info.kolonner.length) hva.push(`kolonne ${R.ramsOpp(info.kolonner.map((k) => String(k + 1)))}`);
      const t = hva.join(" og ");
      deler.push(`${KOMBO[info.linjer] ? KOMBO[info.linjer] + " " : ""}${t[0].toUpperCase() + t.slice(1)} ryddet.`);
      if (info.rekke >= 2) deler.push(`Rekke ganger ${info.rekke}.`);
      if (info.rent) deler.push("Rent brett!");
    }
    deler.push(`Pluss ${info.poeng.sum}. ${R.tall(sp.poeng)} poeng.`);
    if (info.nyttSett && !sp.over) deler.push("Tre nye brikker.");
    R.si(deler.join(" "));
  }

  // ---------- Placing ----------

  function plasser(S, i, x, y) {
    const sp = aktiv(S);
    if (!sp || sp.ferdig || sp.over || las || R.arkApent()) return false;
    const info = legg(sp, i, x, y);
    if (!info) {
      nei();
      return false;
    }
    valgt = -1;
    markor = null;
    if (sp.dagens && sp.lagt === 1) R.statistikk("dag-start", {});
    tegn(S, false);
    effekter(info);
    lyder(info);
    lesOpp(sp, info);
    // Focus: the next piece in the tray (keyboard players keep going), or the board.
    const neste = R.$(".bk-brikke");
    if (document.activeElement === document.body || !document.activeElement || !document.contains(document.activeElement)) {
      if (neste) neste.focus({ preventScroll: true });
    }
    if (sp.over) return over(S), true;
    if (sp.dagens) meldIGang(S);
    R.lagre();
    return true;
  }

  function nei() {
    R.lyd.tone(200, 0, 0.12, "sine", 0.09, 150);
    R.vibrer([10, 30, 10]);
    const b = R.$(".bk-brett");
    if (b && !R.rolig()) {
      b.classList.remove("rist");
      void b.offsetWidth;
      b.classList.add("rist");
    }
  }

  // The tapped cell: of all the places where the piece covers that cell and fits, the one where
  // the piece's middle is closest to it (so a tap never needs to hit a corner of the piece).
  function tilgivende(brett, f, cx, cy) {
    let best = null;
    const mx = (f.b - 1) / 2;
    const my = (f.h - 1) / 2;
    for (const [sx, sy] of f.celler) {
      const x = cx - sx;
      const y = cy - sy;
      if (!Blokk.passer(brett, f, x, y)) continue;
      const d = (x + mx - cx) ** 2 + (y + my - cy) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
    return best;
  }
  const midtPa = (f, cx, cy) => ({ x: R.klamp(cx - Math.floor((f.b - 1) / 2), 0, N - f.b), y: R.klamp(cy - Math.floor((f.h - 1) / 2), 0, N - f.h) });

  function over(S) {
    const sp = aktiv(S);
    ferdigstill(S);
    las = true;
    valgt = -1;
    markor = null;
    const alle = sp.grunn === "alle";
    tegn(S, false);
    if (alle) {
      R.lyd.riktig();
      R.si(`Alle ${DAG_BRIKKER} brikkene er lagt. ${R.tall(sp.poeng)} poeng.`);
    } else {
      R.lyd.tone(330, 0.05, 0.22, "triangle", 0.1, 220);
      R.vibrer([50, 40, 50]);
      const ikke = sp.tilbud.map((id, i) => (id ? `brikke ${i + 1}, ${F[id].navn}` : null)).filter(Boolean);
      R.si(`Ingen brikker passer: ${R.ramsOpp(ikke)}. ${R.tall(sp.poeng)} poeng.`);
    }
    const m = R.$(".bk-melding");
    if (m) {
      m.innerHTML = `<div class="bk-meldingskort${alle ? " alle" : ""}"><h2>${alle ? "Alle brikkene er lagt!" : "Ingen brikker passer!"}</h2><p>${alle ? `${DAG_BRIKKER} av ${DAG_BRIKKER} – godt jobba.` : sp.tilbud.filter(Boolean).length === 1 ? "Brikken som er igjen, får ikke plass." : "Brikkene som er igjen, får ikke plass."}</p></div>`;
      m.hidden = false;
    }
    const fortsatt = R.vakt();
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 1800 : 2600,
    );
  }

  // The result and the record; saved at once, so a reload or «tilbake» never leaves a locked board.
  function ferdigstill(S, sp = aktiv(S), lagre = true) {
    if (sp.ferdig) return;
    sp.ferdig = true;
    sp.over = true;
    if (sp.dagens) {
      const d = S.daglig;
      const gml = d.dager[sp.dagens];
      if (!gml) {
        if (d.sistNr === sp.dagNr - 1) d.rekke += 1;
        else if (d.sistNr !== sp.dagNr) d.rekke = 1;
        d.sistNr = Math.max(d.sistNr || 0, sp.dagNr);
        d.beste = Math.max(d.beste || 0, d.rekke);
        d.dager[sp.dagens] = { poeng: sp.poeng, linjer: sp.linjer, lagt: sp.lagt, rekke: sp.besteRekke };
        const dager = Object.keys(d.dager).sort();
        for (const k of dager.slice(0, Math.max(0, dager.length - 400))) delete d.dager[k];
      }
      sp.resultat = { poeng: sp.poeng, rekke: d.rekke };
      if (sp.dagens === R.dag().tekst) R.dagligFerdig({ vunnet: true, rekke: d.rekke, res: resTekst(d.dager[sp.dagens].poeng) });
    } else {
      const gml = sp.startRekord || 0;
      sp.forRekord = S.rekord || 0;
      sp.resultat = { poeng: sp.poeng, nyRekord: sp.poeng > gml && gml > 0, forste: !gml, gml };
      S.rekord = Math.max(S.rekord || 0, sp.poeng);
      S.spilt = (S.spilt || 0) + 1;
    }
    if (!lagre) return;
    R.statistikk("ferdig", { dagens: !!sp.dagens, poeng: sp.poeng, linjer: sp.linjer, lagt: sp.lagt });
    R.lagre();
  }

  function angre(S) {
    const sp = aktiv(S);
    if (!kanAngre(sp) || sp.ferdig || las) return;
    angreRen(sp);
    valgt = -1;
    markor = null;
    tegn(S, false);
    const b = R.$(".bk-verk[data-h='ny']") || R.$(".bk-brikke");
    if (document.activeElement === document.body && b) b.focus({ preventScroll: true });
    R.lyd.tone(520, 0, 0.1, "triangle", 0.09, 330);
    R.si(`Angret. ${R.tall(sp.poeng)} poeng. Du kan angre igjen når du får tre nye brikker.`);
    R.lagre();
  }

  // ---------- Pointer: drag, tap, hover ----------

  function velg(S, i, medTastatur) {
    const sp = aktiv(S);
    if (!sp || sp.over || las || !sp.tilbud[i]) return;
    if (valgt === i && !medTastatur) {
      valgt = -1;
      markor = null;
    } else {
      valgt = i;
      const f = F[sp.tilbud[i]];
      if (medTastatur) {
        const start = Blokk.plasser1(sp.brett, f) || midtPa(f, 3, 3);
        markor = markor ? { x: R.klamp(markor.x, 0, N - f.b), y: R.klamp(markor.y, 0, N - f.h) } : start;
      } else markor = null;
    }
    tegnBrikker(S, false);
    const t = R.$(".bk-tips");
    if (t) t.textContent = tipsTekst(sp);
    skygge(S);
    R.lyd.tone(valgt >= 0 ? 620 : 420, 0, 0.05, "sine", 0.06);
    if (valgt >= 0 && medTastatur) {
      const b = R.$(".bk-brett");
      if (b) b.focus({ preventScroll: true });
      siMarkor(S);
    } else {
      const knapp = R.$(`.bk-brikke[data-v="${i}"]`);
      if (knapp) knapp.focus({ preventScroll: true });
    }
  }

  function siMarkor(S) {
    const sp = aktiv(S);
    const f = valgt >= 0 && F[sp.tilbud[valgt]];
    if (!f || !markor) return;
    const ok = Blokk.passer(sp.brett, f, markor.x, markor.y);
    let linjer = 0;
    if (ok) linjer = Blokk.legg(sp.brett, f, markor.x, markor.y).linjer;
    R.si(`${f.navn}: rad ${markor.y + 1}, kolonne ${markor.x + 1}. ${ok ? (linjer ? `Passer, rydder ${R.flertall(linjer, "linje", "linjer")}.` : "Passer.") : "Passer ikke her."}`);
  }

  function cellePa(g, px, py) {
    const x = Math.floor((px - g.x + (g.steg - g.c) / 2) / g.steg);
    const y = Math.floor((py - g.y + (g.steg - g.c) / 2) / g.steg);
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
  }

  function bindSpill(S, rot) {
    const omr = R.$(".bk-spill", rot);
    const brett = R.$(".bk-brett", rot);
    if (!omr || !brett) return;

    const ned = (e) => {
      const knapp = e.target.closest(".bk-brikke");
      if (!knapp || (e.pointerType === "mouse" && e.button !== 0)) return;
      const sp = aktiv(R.S);
      const i = Number(knapp.dataset.v);
      if (!sp || sp.over || las || !sp.tilbud[i]) return;
      dra = { i, id: e.pointerId, x0: e.clientX, y0: e.clientY, aktiv: false, beroring: e.pointerType !== "mouse", el: null, mal: null };
    };
    const flytt = (e) => {
      if (!dra || e.pointerId !== dra.id) {
        // A mouse over the board with a piece selected: the shadow follows.
        if (!dra && e.pointerType === "mouse" && valgt >= 0 && !markor) hover(e);
        return;
      }
      if (!dra.aktiv) {
        if (Math.hypot(e.clientX - dra.x0, e.clientY - dra.y0) < 8) return;
        startDra();
      }
      flyttDra(e.clientX, e.clientY);
      if (e.cancelable) e.preventDefault();
    };
    const opp = (e) => {
      if (!dra || e.pointerId !== dra.id) return;
      const d = dra;
      dra = null;
      if (!d.aktiv) return; // a tap: the click selects the piece
      sisteDra = Date.now();
      slipp(d);
    };
    const avbryt = (e) => {
      if (!dra || e.pointerId !== dra.id) return;
      const d = dra;
      dra = null;
      if (d.aktiv) {
        d.mal = null;
        slipp(d);
      }
    };

    function startDra() {
      const sp = aktiv(R.S);
      const f = F[sp.tilbud[dra.i]];
      const g = geometri();
      if (!f || !g) return (dra = null);
      dra.aktiv = true;
      dra.f = f;
      dra.g = g;
      valgt = -1;
      markor = null;
      const el = document.createElement("div");
      el.className = "bk-sveve";
      el.setAttribute("aria-hidden", "true");
      el.style.setProperty("--c", g.c + "px");
      el.style.setProperty("--gap", g.steg - g.c + "px");
      el.innerHTML = formHtml(f);
      document.body.appendChild(el);
      dra.el = el;
      dra.b = f.b * g.steg - (g.steg - g.c);
      dra.h = f.h * g.steg - (g.steg - g.c);
      const knapp = R.$(`.bk-brikke[data-v="${dra.i}"]`);
      if (knapp) knapp.classList.add("loftet");
      R.lyd.tone(660, 0, 0.04, "sine", 0.05);
      R.vibrer(5);
    }

    function flyttDra(px, py) {
      if (!dra || !dra.el) return;
      // The piece floats above the finger (a mouse holds it at its middle).
      const left = px - dra.b / 2;
      const top = py - dra.h / 2 - (dra.beroring ? dra.h / 2 + LOFT : 0);
      dra.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      const g = dra.g;
      const gx = Math.round((left - g.x) / g.steg);
      const gy = Math.round((top - g.y) / g.steg);
      const inni = gx > -dra.f.b && gy > -dra.f.h && gx < N && gy < N;
      dra.mal = inni ? { i: dra.i, x: gx, y: gy } : null;
      skygge(R.S, dra.mal);
      dra.el.classList.toggle("ok", !!(dra.mal && Blokk.passer(aktiv(R.S).brett, dra.f, gx, gy)));
    }

    function slipp(d) {
      const S = R.S;
      const sp = aktiv(S);
      const knapp = R.$(`.bk-brikke[data-v="${d.i}"]`);
      const ok = d.mal && sp && Blokk.passer(sp.brett, d.f, d.mal.x, d.mal.y);
      if (d.el) d.el.remove();
      if (knapp) knapp.classList.remove("loftet");
      if (ok) plasser(S, d.i, d.mal.x, d.mal.y);
      else {
        skygge(S, null);
        if (d.mal) nei();
        else R.lyd.tone(380, 0, 0.05, "sine", 0.05, 300);
        if (knapp && !R.rolig()) {
          knapp.classList.remove("tilbake");
          void knapp.offsetWidth;
          knapp.classList.add("tilbake");
        }
      }
    }

    function hover(e) {
      const sp = aktiv(R.S);
      const g = geometri();
      const f = sp && F[sp.tilbud[valgt]];
      if (!g || !f) return;
      const c = cellePa(g, e.clientX, e.clientY);
      if (!c) return skygge(R.S, null);
      const p = tilgivende(sp.brett, f, c.x, c.y) || midtPa(f, c.x, c.y);
      skygge(R.S, { i: valgt, x: p.x, y: p.y });
    }

    // A tap (or click) on the board with a piece selected places it there.
    const klikk = (e) => {
      if (Date.now() - sisteDra < 400) return;
      const S = R.S;
      const sp = aktiv(S);
      if (!sp || valgt < 0 || !sp.tilbud[valgt]) {
        if (sp && !sp.over && valgt < 0 && e.detail > 0) {
          const t = R.$(".bk-tips");
          if (t) {
            t.classList.remove("blink");
            void t.offsetWidth;
            t.classList.add("blink");
          }
        }
        return;
      }
      const g = geometri();
      const f = F[sp.tilbud[valgt]];
      // A keyboard «click» (Enter on the board) has no position: the cursor counts.
      if (e.detail === 0 && markor) return plasser(S, valgt, markor.x, markor.y);
      const c = g && cellePa(g, e.clientX, e.clientY);
      if (!c) return;
      const p = tilgivende(sp.brett, f, c.x, c.y);
      if (p) plasser(S, valgt, p.x, p.y);
      else {
        const m = midtPa(f, c.x, c.y);
        skygge(S, { i: valgt, x: m.x, y: m.y });
        nei();
        R.si("Passer ikke der.");
        const fortsatt = R.vakt();
        setTimeout(() => fortsatt() && skygge(R.S), 600);
      }
    };

    const ingen = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    omr.addEventListener("pointerdown", ned);
    window.addEventListener("pointermove", flytt, { passive: false });
    window.addEventListener("pointerup", opp);
    window.addEventListener("pointercancel", avbryt);
    brett.addEventListener("click", klikk);
    omr.addEventListener("touchmove", ingen, { passive: false });
    omr.addEventListener("contextmenu", ingen);
    R.vedForlat(() => {
      omr.removeEventListener("pointerdown", ned);
      window.removeEventListener("pointermove", flytt, { passive: false });
      window.removeEventListener("pointerup", opp);
      window.removeEventListener("pointercancel", avbryt);
      brett.removeEventListener("click", klikk);
      omr.removeEventListener("touchmove", ingen, { passive: false });
      omr.removeEventListener("contextmenu", ingen);
      if (dra && dra.el) dra.el.remove();
      dra = null;
    });
  }

  // ---------- Keyboard ----------

  const PILER = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || R.arkApent() || e.altKey || e.metaKey) return;
    const sp = aktiv(S);
    if (!sp || sp.ferdig || las) return;
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        angre(S);
      }
      return;
    }
    const m = e.target;
    const paBrett = !!(m && m.closest && m.closest(".bk-brett"));
    const fritt = paBrett || m === document.body || m === document.documentElement || !!(m && m.closest && m.closest(".bk-brikker"));
    if (/^[1-3]$/.test(e.key) && fritt) {
      const i = Number(e.key) - 1;
      if (sp.tilbud[i]) {
        e.preventDefault();
        velg(S, i, true);
      }
      return;
    }
    if (valgt < 0 || !markor) return;
    const f = F[sp.tilbud[valgt]];
    if (!f) return;
    if (PILER[e.key] && (paBrett || fritt)) {
      e.preventDefault();
      const [dx, dy] = PILER[e.key];
      const nx = R.klamp(markor.x + dx, 0, N - f.b);
      const ny = R.klamp(markor.y + dy, 0, N - f.h);
      if (nx === markor.x && ny === markor.y) R.lyd.tone(240, 0, 0.04, "sine", 0.04);
      markor = { x: nx, y: ny };
      skygge(S);
      siMarkor(S);
    } else if ((e.key === "Enter" || e.key === " ") && paBrett) {
      e.preventDefault();
      if (!plasser(S, valgt, markor.x, markor.y)) R.si("Passer ikke her.");
    } else if (e.key === "Escape") {
      e.preventDefault();
      const i = valgt;
      valgt = -1;
      markor = null;
      tegnBrikker(S, false);
      skygge(S);
      const k = R.$(`.bk-brikke[data-v="${i}"]`);
      if (k) k.focus({ preventScroll: true });
      const t = R.$(".bk-tips");
      if (t) t.textContent = tipsTekst(sp);
    }
  });

  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass();
  });

  const fastSide = (pa) => document.documentElement.classList.toggle("bk-fast", !!pa);

  const IKON = {
    angre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    ny: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  };

  // The final board, small, on the result of a free game (never on the shared card).
  const miniBrett = (sp) => `<div class="bk-mini" aria-hidden="true">${sp.brett.map((v) => `<i${v ? ` class="f${v}"` : ""}></i>`).join("")}</div>`;

  // Today's date as a little calendar page (the main button on home).
  const kalender = (d) => `<span class="bk-kal" aria-hidden="true"><small>${esc(MANED[Number(d.tekst.slice(5, 7)) - 1].slice(0, 3))}</small><b>${Number(d.tekst.slice(8, 10))}</b></span>`;

  // ---------- Start ----------

  function gyldigSpill(sp, dag) {
    if (!sp || typeof sp !== "object") return false;
    if (dag ? typeof sp.dagens !== "string" || !Number.isInteger(sp.dagNr) : sp.dagens != null) return false;
    if (!Array.isArray(sp.brett) || sp.brett.length !== N * N || !sp.brett.every((v) => Number.isInteger(v) && v >= 0 && v <= 7)) return false;
    if (!Array.isArray(sp.tilbud) || sp.tilbud.length > 3 || !sp.tilbud.every((id) => id === null || !!Blokk.form(id))) return false;
    for (const k of ["poeng", "linjer", "lagt", "rekke", "siden", "besteRekke", "besteKombo", "sett"]) sp[k] = Math.max(0, Math.floor(Number(sp[k]) || 0));
    sp.fro = Number(sp.fro) >>> 0;
    sp.angretSett = Number.isInteger(sp.angretSett) ? sp.angretSett : -1;
    if (dag || !sp.forrige || typeof sp.forrige !== "object" || !Array.isArray(sp.forrige.brett) || sp.forrige.brett.length !== N * N || !Array.isArray(sp.forrige.tilbud)) sp.forrige = null;
    if (!sp.ferdig && !sp.tilbud.some(Boolean)) {
      if (dag && sp.sett >= DAG_SETT) sp.over = true;
      else delNytt(sp);
    }
    if (!sp.ferdig && !sp.over && Blokk.erOver(sp.brett, sp.tilbud)) sp.over = true;
    sp.ferdig = !!sp.ferdig;
    return true;
  }

  R.start({
    id: "blokka",
    versjon: 1,
    pagar: (S) => iGang(S.fri) || iGang(dagensSpill(S)),

    tilstand: () => ({
      rekord: 0,
      spilt: 0,
      daglig: { dager: {}, rekke: 0, beste: 0, sistNr: 0 },
      fri: null,
      dag: null,
      modus: "fri",
    }),

    lastet(S) {
      S.rekord = Math.max(0, Math.floor(Number(S.rekord) || 0));
      S.spilt = Math.max(0, Math.floor(Number(S.spilt) || 0));
      const d = S.daglig;
      if (!d || typeof d !== "object" || !d.dager || typeof d.dager !== "object") S.daglig = { dager: {}, rekke: 0, beste: 0, sistNr: 0 };
      else {
        for (const k of Object.keys(d.dager)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d.dager[k] || !(d.dager[k].poeng >= 0)) delete d.dager[k];
        d.rekke = Math.max(0, Math.floor(Number(d.rekke) || 0));
        d.beste = Math.max(d.rekke, Math.floor(Number(d.beste) || 0));
        d.sistNr = Math.floor(Number(d.sistNr) || 0);
      }
      if (!gyldigSpill(S.fri, false)) S.fri = null;
      // Only today's daily is kept (yesterday's is in the log already).
      if (!gyldigSpill(S.dag, true) || S.dag.dagens !== R.dag().tekst) S.dag = null;
      // A game left at «no room» (reload during the message) goes to its result.
      for (const sp of [S.fri, S.dag]) if (sp && sp.over && !sp.ferdig) ferdigstill(S, sp, false);
      if (S.modus !== "dag" && S.modus !== "fri") S.modus = "fri";
      const sp = aktiv(S);
      if (S.skjerm === "slutt" && (!sp || !sp.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!sp || sp.ferdig)) S.skjerm = sp ? "slutt" : "hjem";
      valgt = -1;
      markor = null;
      // The front page reads the daily from the kit's own key: say it again on every load.
      const lost = S.daglig.dager[R.dag().tekst];
      if (lost) R.dagligFerdig({ vunnet: true, rekke: S.daglig.rekke, res: resTekst(lost.poeng) });
    },

    // rusj.no/blokka/#dagens (the front page's «I dag») opens today's daily – or its result.
    vedHash(S, hash) {
      if (hash !== "dagens") return null;
      return apneDagens(S);
    },

    regler: {
      intro: "Legg brikkene på brettet. Fyller du en hel rad eller kolonne, forsvinner den – og du får poeng.",
      steg: [
        ["Legg brikkene", "Du får tre brikker om gangen. Dra en brikke til brettet, eller trykk på den og så på en rute. Brikkene kan ikke snus."],
        ["Rydd linjer", "En full rad eller kolonne forsvinner. Flere linjer på én gang gir kombo, og rydder du igjen innen tre brikker, vokser rekka – da ganges poengene opp."],
        ["Ikke gå tom for plass", "Når ingen av brikkene du har igjen får plass, er spillet over."],
      ],
      tips: [
        "Hold midten av brettet ledig – de store brikkene trenger plass.",
        "Tenk på alle tre brikkene før du legger den første.",
        "Brikker som ikke får plass akkurat nå, er merket «Passer ikke».",
        "I fritt spill kan du angre den siste brikken – én gang for hver runde med tre brikker.",
        `Dagens blokk er de samme ${DAG_BRIKKER} brikkene for alle i hele landet. Du har ett forsøk, og du kan ikke angre.`,
        "Med tastatur: 1, 2 og 3 velger brikke, piltastene flytter den, Enter legger den og Esc angrer valget.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = R.dag();
          const dag = dagensSpill(S);
          const lost = S.daglig.dager[d.tekst];
          const fri = S.fri && !S.fri.ferdig && S.fri.lagt > 0 ? S.fri : null;
          const r = dagRekke(S);
          const regler = R.ui.lenke("Slik spiller du", "regler");
          const fortsett = fri ? `Fortsett · ${R.tall(fri.poeng)} poeng` : "";
          let knapper;
          if (!lost) {
            const navn = ukedag(d.nr);
            const under = dag && dag.lagt > 0 ? `${R.tall(dag.poeng)} poeng · ${dag.lagt} av ${DAG_BRIKKER} brikker` : `${navn[0].toUpperCase() + navn.slice(1)} · ${DAG_BRIKKER} brikker · ${r > 0 ? `🔥 ${R.flertall(r, "dag", "dager")} på rad` : "ett forsøk"}`;
            knapper =
              R.ui.knapp("", "dagens", {
                variant: "stor",
                tekstHtml: `${kalender(d)}<span class="bk-dagknapp"><b>${dag && dag.lagt > 0 ? "Fortsett dagens blokk" : "Dagens blokk"}</b><small>${esc(under)}</small></span>`,
              }) +
              (fri ? R.ui.knapp2(fortsett, "fortsett") + R.ui.lenkerad(R.ui.lenke("Nytt spill", "nytt"), regler) : R.ui.knapp2("Spill fritt", "nytt") + regler);
          } else {
            knapper =
              (fri ? R.ui.knapp(fortsett, "fortsett") + R.ui.knapp2("Nytt spill", "nytt") : R.ui.knapp("Spill fritt", "nytt")) +
              `<p class="bk-daglinje">✓ Dagens blokk: ${R.tall(lost.poeng)} poeng${r > 1 ? ` · 🔥 ${r} dager på rad` : ""}</p>` +
              R.ui.lenkerad(R.ui.lenke("Se resultatet", "dagens"), regler) +
              nedtellingHtml();
          }
          return (
            R.ui.spillhjem({
              slagordHtml: "Fyll rader og kolonner.<br><em>Hvor lenge får alt plass?</em>",
              knapperHtml: knapper,
              merker: [
                ["8 × 8", "brett"],
                ["1", "ny hver dag"],
                ["0", "reklame"],
              ],
            }) + (S.rekord ? `<p class="bk-rekordlinje">Rekord i fritt spill: <b>${R.tall(S.rekord)} poeng</b></p>` : "")
          );
        },
        inn(S) {
          if (S.daglig.dager[R.dag().tekst]) startNedtelling();
        },
      },

      spill: {
        tittel: (S) => (S.modus === "dag" ? "Dagens blokk" : "Blokka"),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = aktiv(S);
          const dag = !!sp.dagens;
          return `
            <h1 class="vh" id="skjerm-tittel">${dag ? "Dagens blokk" : "Blokka, fritt spill"}</h1>
            <div class="bk-spill${dag ? " dag" : ""}">
              <div class="bk-hud${dag ? " dag" : ""}">${hudHtml(S, sp)}</div>
              <div class="bk-flate">
                <div class="bk-brett" tabindex="0" role="group" aria-label="Brettet, 8 ganger 8. Velg en brikke med 1, 2 eller 3, flytt med piltastene og legg med Enter." aria-describedby="bk-tekst">
                  <div class="bk-ruter" aria-hidden="true">${"<i></i>".repeat(N * N)}</div>
                  <div class="bk-effekter" aria-hidden="true"></div>
                </div>
              </div>
              <ol class="vh" id="bk-tekst" aria-label="Brettet rad for rad, fylte kolonner"></ol>
              <div class="bk-side">
                <div class="bk-brikker" role="group" aria-label="Brikkene"></div>
                <p class="bk-tips">${esc(tipsTekst(sp))}</p>
                <p class="bk-tastatur" aria-hidden="true">1–3 velger · piltaster flytter · Enter legger</p>
              </div>
              <div class="bk-melding" hidden role="status"></div>
            </div>`;
        },
        etter(S, rot) {
          tilpass();
          tegn(S, false);
          bindSpill(S, rot);
          const flate = R.$(".bk-flate", rot);
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
          markor = null;
          las = false;
          fastSide(true);
          tilpass();
          R.holdVaken();
        },
        ut(S) {
          meldIGang(S);
          valgt = -1;
          markor = null;
          las = false;
          fastSide(false);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.modus === "dag" ? "Dagens blokk" : "Blokka"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const r = sp.resultat || { poeng: sp.poeng };
          const alle = '<a class="lenke" href="/">Alle spill</a>';
          const tall = `<div class="bk-resultat">
              <div class="bk-tall${r.nyRekord ? " ny" : ""}"><b>${R.tall(sp.poeng)}</b><span>poeng</span>${r.nyRekord ? '<i class="bk-ny">Rekord!</i>' : ""}</div>
              <div class="bk-tall"><b>${R.tall(sp.linjer)}</b><span>${sp.linjer === 1 ? "linje" : "linjer"}</span></div>
              <div class="bk-tall"><b>${sp.besteRekke > 1 ? "×" + sp.besteRekke : sp.besteKombo > 1 ? sp.besteKombo : "–"}</b><span>${sp.besteRekke > 1 ? "beste rekke" : sp.besteKombo > 1 ? "linjer på én gang" : "rekke"}</span></div>
            </div>`;
          if (sp.dagens) {
            const idag = sp.dagens === R.dag().tekst;
            const alleLagt = sp.grunn === "alle" || sp.lagt >= DAG_BRIKKER;
            return `
              <div class="banner aksent">
                ${R.figur()}
                <p class="etikett">Dagens blokk · ${esc(ukedag(sp.dagNr))} ${esc(datoTekst(sp.dagens))}</p>
                <h1 id="skjerm-tittel">${alleLagt ? "Alle brikkene lagt!" : "Godt jobba!"}</h1>
              </div>
              ${tall}
              <p class="hjelp">${alleLagt ? `Du fikk plass til alle ${DAG_BRIKKER} brikkene.` : `${sp.lagt} av ${DAG_BRIKKER} brikker fikk plass.`} Alle i hele landet får de samme brikkene i dag.</p>
              <div class="bk-dagboks">
                ${r.rekke ? `<p class="bk-dagrekke"><span aria-hidden="true">🔥</span> ${R.flertall(r.rekke, "dag", "dager")} på rad</p>` : ""}
                ${idag ? nedtellingHtml() : '<p class="bk-nedtelling"><b>En ny blokk er klar!</b></p>'}
              </div>
              ${R.ui.flereSpill({ antall: 1 })}
              ${idag ? R.ui.dokk(R.ui.knapp("Del resultatet", "del"), R.ui.lenkerad(R.ui.lenke("Spill fritt", "fri"), alle)) : R.ui.dokk(R.ui.knapp("Dagens blokk", "dagens"), R.ui.lenkerad(alle))}`;
          }
          const tittel = r.nyRekord ? "Ny rekord!" : "Godt jobba!";
          const linje = r.nyRekord ? `Forrige rekord: ${R.tall(r.gml)} poeng.` : r.forste ? "Første runde – nå har du en rekord å slå!" : `Rekorden din: ${R.tall(S.rekord)} poeng.`;
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">Fritt spill · ${R.flertall(sp.lagt, "brikke", "brikker")}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
            </div>
            ${tall}
            <p class="hjelp">${esc(linje)}</p>
            ${miniBrett(sp)}
            ${kanAngre(sp) ? `<div class="bk-angrerad">${R.ui.knapp2("Angre siste brikke", "angre-slutt", { variant: "liten" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Til Blokka", "tilbake"), alle))}`;
        },
        inn(S) {
          const sp = aktiv(S);
          if (!sp) return;
          const r = sp.resultat || {};
          if (sp.dagens && sp.dagens === R.dag().tekst) startNedtelling();
          if (r.nyRekord || (sp.dagens && (sp.grunn === "alle" || sp.poeng >= 1000)) || (!sp.dagens && r.forste && sp.poeng >= 300)) {
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
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S.fri))) || !fortsatt()) return;
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      // «Spill fritt» from the daily's result: the free game under way, or a new one.
      fri(el, e, S) {
        if (iGang(S.fri)) return H.fortsett(el, e, S);
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      fortsett(el, e, S) {
        S.modus = "fri";
        R.gaTil(S.fri && !S.fri.ferdig ? "spill" : "hjem");
      },
      dagens: (el, e, S) => R.gaTil(apneDagens(S)),
      igjen(el, e, S) {
        nyttSpill(S, false);
        R.gaTil("spill");
      },
      async ny(el, e, S) {
        const sp = aktiv(S);
        if (sp && !sp.ferdig && sp.lagt > 0) {
          const fortsatt = R.vakt();
          if (!(await R.bekreft("Starte på nytt?", "Brettet og poengene du har nå, forsvinner.", "Start på nytt", "Avbryt")) || !fortsatt()) return;
        }
        nyttSpill(S, false);
        R.lyd.sveip();
        R.gaTil("spill");
      },
      velg(el, e, S) {
        if (Date.now() - sisteDra < 400) return;
        velg(S, Number(el.dataset.v), e && e.detail === 0);
      },
      angre: (el, e, S) => angre(S),
      // From the result: take the last piece back and play on (the record forgets it again).
      "angre-slutt"(el, e, S) {
        const sp = S.fri;
        if (!kanAngre(sp)) return;
        S.modus = "fri";
        if (sp.forRekord !== undefined) {
          S.rekord = sp.forRekord;
          delete sp.forRekord;
          S.spilt = Math.max(0, (S.spilt || 0) - 1);
        }
        sp.ferdig = false;
        sp.resultat = null;
        angreRen(sp);
        R.gaTil("spill");
      },
      del(el, e, S) {
        const sp = S.dag;
        const best = sp && sp.dagens && S.daglig.dager[sp.dagens];
        if (!best) return;
        const rekke = (sp.resultat && sp.resultat.rekke) || 0;
        const dato = kortDato(sp.dagens);
        const tekst = `🟦 Blokka ${dato} · ${R.tall(best.poeng)} poeng · ${R.flertall(best.linjer, "linje", "linjer")}${rekke > 1 ? ` · 🔥 ${rekke} dager på rad` : ""}. Klarer du mer på dagens blokk?`;
        const linjer = [`${R.tall(best.poeng)} poeng`, `${R.flertall(best.linjer, "linje", "linjer")} · ${best.lagt} av ${DAG_BRIKKER} brikker`];
        if (best.rekke > 1) linjer.push(`Beste rekke ×${best.rekke}`);
        if (rekke > 1) linjer.push(`🔥 ${rekke} dager på rad`);
        R.del("Blokka – dagens blokk", tekst, "https://rusj.no/blokka/#utfordring", { kort: { tittel: `Dagens blokk ${dato}`, linjer } });
      },
    }),
  });

  function angreRen(sp) {
    const sett = sp.forrige.sett;
    Object.assign(sp, sp.forrige);
    sp.forrige = null;
    sp.angretSett = sett;
    sp.over = false;
    sp.grunn = null;
  }

  // Today's daily: the board (new or under way) – or the result once it is done.
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
})();
