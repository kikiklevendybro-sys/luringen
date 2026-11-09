/* Dobleren — 2048.
   Swipe (or use the arrow keys or the arrow buttons) and all tiles slide; two equal tiles that meet
   become one with double the value. Reach 2048 – and keep going if you like. 4 × 4 or 5 × 5.
   One undo per move: the last move can be taken back, but not two in a row. New tiles come from a
   saved seed, so an undo followed by the same move gives the same new tile (no fishing for luck).
   Tiles are DOM elements that slide with CSS transitions: an outer layer moves (translate), an
   inner layer pops (scale), so the animations never fight each other. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;

  const STORRELSER = [4, 5];
  const NAVN = { 4: "Klassisk", 5: "Romslig" };
  const MAL = 2048;
  const RETNINGER = {
    venstre: [-1, 0],
    hoyre: [1, 0],
    opp: [0, -1],
    ned: [0, 1],
  };
  const SVEIP = 24; // px before a swipe counts
  const GLID = 110; // ms for a slide (keep in sync with spill.css)

  let H; // actions
  let elementer = new Map(); // tile id → element
  let ventende = []; // elements that merged away and disappear after the slide
  let ventId = null;
  let las = false; // the end animation is playing

  // ---------- The game ----------

  function nyttSpill(S, str) {
    str = STORRELSER.includes(str) ? str : 4;
    const sp = {
      str,
      fliser: [],
      nesteId: 1,
      poeng: 0,
      trekk: 0,
      fro: R.nyttFro(),
      forrige: null,
      vant: false,
      over: false,
      ferdig: false,
      startBeste: (S.rekorder[str] && S.rekorder[str].poeng) || 0,
      resultat: null,
    };
    leggTil(sp);
    leggTil(sp);
    S.spill = sp;
    S.oppsett.str = str;
    las = false;
    R.statistikk("start", { str });
  }

  // A new 2 (nine times out of ten) or 4 in a random free cell, from the saved seed.
  function leggTil(sp) {
    const ledige = [];
    for (let y = 0; y < sp.str; y++) for (let x = 0; x < sp.str; x++) if (!sp.fliser.some((f) => f.x === x && f.y === y)) ledige.push([x, y]);
    if (!ledige.length) return null;
    const tilf = R.rng(sp.fro);
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

  const beste = (S, str) => (S.rekorder[str] && S.rekorder[str].poeng) || 0;

  function oppdaterHud(S, info) {
    const sp = S.spill;
    const p = R.$("#db-poeng");
    if (p) p.textContent = R.tall(sp.poeng);
    const b = R.$("#db-beste");
    if (b) b.textContent = R.tall(Math.max(beste(S, sp.str), sp.poeng));
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
    const plass = Math.min(flate.clientWidth - 4, flate.clientHeight - 12, 520);
    const gap = n === 4 ? 10 : 8;
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
      return;
    }
    if (sp.poeng > beste(S, sp.str)) S.rekorder[sp.str] = { poeng: sp.poeng, flis: Math.max(storste(sp), (S.rekorder[sp.str] || {}).flis || 0) };
    tegn(S, info);
    const nyStor = Array.from(info.slatt).map((id) => sp.fliser.find((f) => f.id === id).v);
    const hoyest = nyStor.length ? Math.max(...nyStor) : 0;
    if (hoyest) {
      R.lyd.tone(330 * Math.log2(hoyest) * 0.25 + 260, 0, 0.09, "triangle", 0.12, 520 + Math.log2(hoyest) * 60);
      R.vibrer(hoyest >= 128 ? 22 : 8);
      if (hoyest >= 128) R.si(`${hoyest}!`);
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
    const gml = sp.startBeste || 0;
    sp.resultat = { poeng: sp.poeng, flis: storste(sp), nyRekord: sp.poeng > gml && gml > 0, forste: !gml, gml };
    const r = S.rekorder[sp.str] || { poeng: 0, flis: 0 };
    S.rekorder[sp.str] = { poeng: Math.max(r.poeng, sp.poeng), flis: Math.max(r.flis || 0, storste(sp)) };
    R.statistikk("ferdig", { str: sp.str, poeng: sp.poeng, flis: storste(sp), trekk: sp.trekk });
    R.lagre();
  }
  function avslutt(S) {
    ferdigstill(S);
    R.gaTil("slutt");
  }

  function visMelding(S, type) {
    const m = R.$(".db-melding");
    if (!m) return;
    const sp = S.spill;
    if (type === "vant")
      m.innerHTML = `<div class="db-meldingskort vant">
        <p class="etikett">${R.flertall(sp.trekk, "trekk", "trekk")}</p>
        <h2 id="db-melding-tittel">2048!</h2>
        <p>Du klarte det! Vil du se hvor langt du kommer?</p>
        ${R.ui.knapp("Fortsett", "fortsett-etter", { ikon: "▶" })}
        ${R.ui.lenke("Se resultatet", "ferdig")}
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
  }
  function skjulMelding() {
    const m = R.$(".db-melding");
    if (m) {
      m.hidden = true;
      m.innerHTML = "";
    }
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

  const TASTER = {
    ArrowLeft: "venstre",
    ArrowRight: "hoyre",
    ArrowUp: "opp",
    ArrowDown: "ned",
    a: "venstre",
    d: "hoyre",
    w: "opp",
    s: "ned",
  };
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || R.arkApent() || e.altKey) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return angre(S);
    }
    if (e.ctrlKey || e.metaKey) return;
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

  // ---------- Start ----------

  R.start({
    id: "dobleren",
    versjon: 1,
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      oppsett: { str: 4 },
      rekorder: {},
      spill: null,
    }),

    lastet(S) {
      if (!S.oppsett || !STORRELSER.includes(S.oppsett.str)) S.oppsett = { str: 4 };
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      const sp = S.spill;
      if (sp) {
        const ok =
          STORRELSER.includes(sp.str) &&
          Array.isArray(sp.fliser) &&
          sp.fliser.every((f) => f && Number.isInteger(f.id) && Number.isInteger(f.x) && Number.isInteger(f.y) && f.x >= 0 && f.y >= 0 && f.x < sp.str && f.y < sp.str && f.v >= 2) &&
          new Set(sp.fliser.map((f) => f.x + "," + f.y)).size === sp.fliser.length;
        if (!ok) S.spill = null;
        else {
          sp.poeng = Number(sp.poeng) || 0;
          sp.nesteId = Math.max(Number(sp.nesteId) || 0, ...sp.fliser.map((f) => f.id + 1));
          if (sp.over && !sp.ferdig) sp.over = !kanFlytte(sp) ? sp.over : false;
        }
      }
      // A game left at "no more moves" goes to the result.
      if (S.spill && S.spill.over && !S.spill.ferdig) S.spill.ferdig = true;
      if (S.skjerm === "slutt" && (!S.spill || !S.spill.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && (!S.spill || S.spill.ferdig)) S.skjerm = S.spill ? "slutt" : "hjem";
    },

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
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = !!(sp && !sp.ferdig);
          const rek = STORRELSER.filter((n) => S.rekorder[n] && S.rekorder[n].poeng).map(
            (n) => `<li><b>${n} × ${n}</b> ${R.tall(S.rekorder[n].poeng)} poeng<small> · største ${S.rekorder[n].flis}</small></li>`,
          );
          return (
            R.ui.spillhjem({
              slagordHtml: "Sveip, slå sammen og doble.<br><em>Klarer du 2048?</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: aktiv,
                fortsettTekst: aktiv ? `Fortsett · ${sp.str} × ${sp.str} · ${R.tall(sp.poeng)} poeng` : "",
                startTekst: `Start spill · ${S.oppsett.str} × ${S.oppsett.str}`,
                ekstraHtml: R.ui.lenkerad(R.ui.lenke("Bytt nivå", "bytt"), R.ui.lenke("Slik spiller du", "regler")),
              }),
              merker: [
                ["2", "brett"],
                ["↶", "angre siste trekk"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="db-rekorder" aria-label="Dine rekorder"><p class="etikett">Dine rekorder</p><ul>${rek.join("")}</ul></section>` : "")
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
              "str",
              STORRELSER.map((n) => ({
                v: n,
                tittel: `${n} × ${n}`,
                tekst: `${NAVN[n]}${S.rekorder[n] && S.rekorder[n].poeng ? ` · rekord ${R.tall(S.rekorder[n].poeng)}` : n === 4 ? " · originalen" : " · mer plass"}`,
                ikon: `<span class="db-flisikon" style="--n:${n}" aria-hidden="true">${"<i></i>".repeat(n * n)}</span>`,
              })),
              S.oppsett.str,
            )}
            <p class="hjelp">Sveip for å flytte. Du kan angre det siste trekket.</p>
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`,
      },

      spill: {
        tittel: (S) => `${S.spill.str} × ${S.spill.str}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = sp.str;
          return `
            <h1 class="vh" id="skjerm-tittel">2048 på ${n} ganger ${n}</h1>
            <div class="db-spill">
              <div class="db-hud">
                <span class="db-stat db-poengboks"><small>Poeng</small><b id="db-poeng">${R.tall(sp.poeng)}</b></span>
                <span class="db-stat"><small>Beste</small><b id="db-beste">${R.tall(Math.max(beste(S, n), sp.poeng))}</b></span>
                <button class="db-verk" data-h="angre" aria-label="Angre siste trekk"${sp.forrige ? "" : " disabled"}>${IKON.angre}<span>Angre</span></button>
                <button class="db-verk" data-h="ny" aria-label="Start på nytt">${IKON.ny}<span>Ny</span></button>
              </div>
              <div class="db-flate">
                <div class="db-brett" style="--n:${n}" role="group" aria-label="Brettet">
                  <div class="db-ruter" aria-hidden="true">${"<i></i>".repeat(n * n)}</div>
                  <div class="db-lag" aria-hidden="true"></div>
                  <div class="db-melding" hidden role="dialog" aria-labelledby="db-melding-tittel"></div>
                </div>
              </div>
              ${R.ui.dokk(`
                <p class="db-tastatur">Piltaster eller WASD flytter · U angrer</p>
                <p class="db-tips">${sp.trekk < 3 ? "Sveip hvor som helst for å flytte brikkene" : "Hold den største brikken i et hjørne"}</p>
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
        ut() {
          ryddVentende();
          elementer = new Map();
          las = false;
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
          const r = sp.resultat || { poeng: sp.poeng, flis: storste(sp) };
          const n = sp.str;
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
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(
              R.ui.knapp("Spill igjen", "igjen"),
              R.ui.lenkerad(sp.forrige && r.flis < MAL * 64 ? R.ui.lenke("Angre siste trekk", "angre-slutt") : "", R.ui.lenke("Endre oppsett", "bytt"), '<a class="lenke" href="/">Alle spill</a>'),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if (r.nyRekord || r.flis >= MAL || r.flis >= 1024) {
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
      // «Start spill» / «Nytt spill»: a new game at once, on the last size played.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig))) || !fortsatt()) return;
        nyttSpill(S, S.oppsett.str);
        R.gaTil("spill");
      },
      bytt: () => R.gaTil("oppsett"),
      fortsett: (el, e, S) => R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem"),
      str(el, e, S) {
        S.oppsett.str = STORRELSER.includes(Number(el.dataset.v)) ? Number(el.dataset.v) : 4;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig))) || !fortsatt()) return;
        nyttSpill(S, S.oppsett.str);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S, S.spill ? S.spill.str : S.oppsett.str);
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
        if (!sp || !sp.forrige) return;
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
    }),
  });
})();
