/* Skyveren — the sliding puzzle («femtenspillet»): slide the pieces into the empty square until
   they are in order, 3 × 3 to 5 × 5, with numbers or with a picture (one of the rusj gang).
   Every shuffle can be solved: a random order whose parity is checked (and mended by swapping two
   pieces when needed). The engine at the top is pure and also runs under node
   (test/skyveren.test.mjs); it works on any rows × columns so the tests can prove the parity rule
   against every reachable position of small boards. */
(function () {
  "use strict";

  // ======================= Engine =======================

  const motor = (function () {
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
    const STORRELSER = Object.freeze([3, 4, 5]);
    // A board: brett[plass] = the piece on it (1 … R·C − 1), 0 = the empty square.
    const ferdigBrett = (R, C) => Array.from({ length: R * C }, (_, i) => (i === R * C - 1 ? 0 : i + 1));
    const lost = (brett) => brett.every((x, i) => x === (i === brett.length - 1 ? 0 : i + 1));

    // Can this board be put in order? Count the pairs out of order (the empty square left out).
    // Odd width: that count must be even. Even width: count + the empty square's row from the top
    // (0 = top) must have the same parity as the solved board's (R − 1).
    function losbar(R, C, brett) {
      let ut = 0;
      const t = brett.filter((x) => x !== 0);
      for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[i] > t[j]) ut++;
      if (C % 2 === 1) return ut % 2 === 0;
      const rad = Math.floor(brett.indexOf(0) / C);
      return (ut + rad) % 2 === (R - 1) % 2;
    }

    // A shuffle: a random order, mended to be solvable, never already solved, and never with more
    // than a third of the pieces home (it should feel shuffled).
    function stokk(R, C, fro) {
      const tilf = rng(fro);
      const N = R * C;
      for (;;) {
        const b = ferdigBrett(R, C);
        for (let i = N - 1; i > 0; i--) {
          const j = Math.floor(tilf() * (i + 1));
          const x = b[i];
          b[i] = b[j];
          b[j] = x;
        }
        if (!losbar(R, C, b)) {
          // Swapping two pieces (not the empty square) flips the parity.
          const a = b[0] === 0 ? 1 : 0;
          const c = b[a + 1] === 0 ? a + 2 : a + 1;
          const x = b[a];
          b[a] = b[c];
          b[c] = x;
        }
        const hjemme = b.filter((x, i) => x !== 0 && x === i + 1).length;
        if (!lost(b) && hjemme <= Math.floor((N - 1) / 3)) return b;
      }
    }

    // Slide toward the empty square: tapping a piece in the same row or column as the empty square
    // moves it and every piece between. Returns the new board, or null when it can't move.
    function flytt(R, C, brett, plass) {
      const tom = brett.indexOf(0);
      if (plass === tom || plass < 0 || plass >= R * C) return null;
      const pr = Math.floor(plass / C);
      const pc = plass % C;
      const tr = Math.floor(tom / C);
      const tc = tom % C;
      if (pr !== tr && pc !== tc) return null;
      const steg = pr === tr ? Math.sign(pc - tc) : Math.sign(pr - tr) * C;
      const ny = brett.slice();
      for (let i = tom; i !== plass; i += steg) ny[i] = ny[i + steg];
      ny[plass] = 0;
      return ny;
    }
    // The place of the piece that moves into the empty square with an arrow key (the arrow says
    // which way the piece goes): ArrowUp moves the piece below the empty square up.
    function pilPlass(R, C, brett, retning) {
      const tom = brett.indexOf(0);
      const r = Math.floor(tom / C);
      const c = tom % C;
      if (retning === "opp") return r < R - 1 ? tom + C : -1;
      if (retning === "ned") return r > 0 ? tom - C : -1;
      if (retning === "venstre") return c < C - 1 ? tom + 1 : -1;
      if (retning === "hoyre") return c > 0 ? tom - 1 : -1;
      return -1;
    }
    // How many pieces a slide moves (each one counts as a move, as in the classic count).
    const antallFlyttet = (C, brett, plass) => {
      const tom = brett.indexOf(0);
      return Math.floor(tom / C) === Math.floor(plass / C) ? Math.abs((tom % C) - (plass % C)) : Math.abs(Math.floor(tom / C) - Math.floor(plass / C));
    };
    // Manhattan distance of all pieces from home (a rough «how far» for the screen reader).
    function avstand(R, C, brett) {
      let s = 0;
      brett.forEach((x, i) => {
        if (!x) return;
        const h = x - 1;
        s += Math.abs(Math.floor(h / C) - Math.floor(i / C)) + Math.abs((h % C) - (i % C));
      });
      return s;
    }

    return { rng, STORRELSER, ferdigBrett, lost, losbar, stokk, flytt, pilPlass, antallFlyttet, avstand };
  })();

  if (typeof window === "undefined" || !window.Rusj) {
    if (typeof module === "object" && module.exports) module.exports = motor;
    if (typeof window === "object" && window) window.Skyveren = motor;
    return;
  }

  // ======================= Game =======================

  const R = window.Rusj;
  const esc = R.esc;
  const M = motor;
  const G = window.RusjGjengen;
  const STR = M.STORRELSER;
  const NIVA = Object.assign(Object.create(null), {
    3: R.t("Åtte biter – en god start"),
    4: R.t("Femten biter – klassikeren"),
    5: R.t("Tjuefire biter – for de seige"),
  });
  // Pictures: members of the gang (named on the result when their game is on this edition's site).
  const BILDER = ["elefanten", "ordugla", "skjaera", "bonden", "slangen", "fireren", "papegoyen", "nissen", "sjakkhesten", "tallknuseren", "detektiven", "terninga", "pekefingeren", "kortkongen"];
  const andre = () => (Array.isArray(window.RUSJ_ANDRE) ? window.RUSJ_ANDRE : []);
  const bildeNavn = (id) => {
    const g = andre().find((x) => x.id === id);
    return g ? g.navn : null;
  };
  const tilgjengelige = () => BILDER.filter((id) => G && G.finnes(id));
  const storrelse = (n) => `${n} × ${n}`;
  const NAVN = () => (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || R.t("Skyveren");
  const ADRESSE = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/skyveren/" }).href;
  const MODUSNAVN = Object.assign(Object.create(null), { tall: R.t("tall"), bilde: R.t("bilde") });

  let H;
  let klokkeFra = null;
  let las = false;

  // ---------- Clock ----------

  const tidMs = (sp) => sp.tid + (klokkeFra != null ? performance.now() - klokkeFra : 0);
  function startKlokke(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || klokkeFra != null || document.hidden || S.skjerm !== "spill" || !sp.trekk) return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && S.spill;
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
  // S.spill: { n, modus: "tall" | "bilde", bilde (a mascot id), tallPa, brett, start, trekk, tid, ferdig, resultat }

  const iGang = (S) => !!(S.spill && !S.spill.ferdig);
  const nokkel = (sp) => `${sp.modus}-${sp.n}`;

  function nyttSpill(S) {
    const o = S.oppsett;
    const n = STR.includes(o.n) ? o.n : 4;
    const bilder = tilgjengelige();
    const modus = o.modus === "bilde" && bilder.length ? "bilde" : "tall";
    let bilde = null;
    if (modus === "bilde") {
      // A new picture each time (not the last one, when there is a choice).
      const valg = bilder.filter((id) => id !== S.sistBilde);
      bilde = R.velg(valg.length ? valg : bilder);
      S.sistBilde = bilde;
    }
    const brett = M.stokk(n, n, R.nyttFro());
    S.spill = { n, modus, bilde, tallPa: o.tallPa !== false, brett, start: brett.slice(), trekk: 0, tid: 0, ferdig: false, resultat: null };
    klokkeFra = null;
    las = false;
    R.statistikk("start", { n, modus });
  }

  // ---------- The board ----------

  // The picture's inside (the mascot's SVG without its own <svg> wrapper), cut per piece by viewBox.
  function bildeInnhold(id) {
    const svg = G.svg(id);
    const m = /^<svg[^>]*>([\s\S]*)<\/svg>$/.exec(svg.trim());
    return m ? m[1] : "";
  }
  function bitHtml(sp, x, plass) {
    const n = sp.n;
    const hjem = x - 1;
    const hr = Math.floor(hjem / n);
    const hc = hjem % n;
    const r = Math.floor(plass / n);
    const c = plass % n;
    const etikett = R.t("Bit {x}", { x });
    let inne;
    if (sp.modus === "bilde") {
      const w = 132 / n;
      inne = `<svg class="sk-bilde" viewBox="${-6 + hc * w} ${-10 + hr * w} ${w} ${w}" aria-hidden="true" focusable="false">${bildeInnhold(sp.bilde)}</svg>${sp.tallPa ? `<span class="sk-lite">${x}</span>` : ""}`;
    } else inne = `<span class="sk-tall">${x}</span>`;
    return `<button type="button" class="sk-bit${hjem === plass ? " hjemme" : ""}" data-h="flytt" data-v="${x}" data-stille style="--x:${c};--y:${r};--hx:${hc};--hy:${hr}" aria-label="${esc(etikett)}">${inne}</button>`;
  }
  function brettHtml(sp) {
    const biter = sp.brett.map((x, plass) => (x ? bitHtml(sp, x, plass) : "")).join("");
    const bak = sp.modus === "bilde" ? ` style="--n:${sp.n};--bf:${G.farge(sp.bilde)}"` : ` style="--n:${sp.n}"`;
    return `<div class="sk-brett sk-m-${sp.modus}"${bak} role="group" aria-label="${esc(R.t("Brettet, {n} ganger {n}. Piltastene skyver en bit inn i det tomme feltet.", { n: sp.n }))}" tabindex="0">${biter}</div>`;
  }

  // Moves the pieces on the screen to where the board says (CSS does the sliding).
  function oppdater(S) {
    const sp = S.spill;
    const brett = R.$(".sk-brett");
    if (!sp || !brett) return;
    for (const el of R.$$(".sk-bit", brett)) {
      const x = Number(el.dataset.v);
      const plass = sp.brett.indexOf(x);
      el.style.setProperty("--x", plass % sp.n);
      el.style.setProperty("--y", Math.floor(plass / sp.n));
      el.classList.toggle("hjemme", plass === x - 1);
      el.setAttribute("aria-label", R.t("Bit {x}, rad {r}, kolonne {k}", { x, r: Math.floor(plass / sp.n) + 1, k: (plass % sp.n) + 1 }));
    }
    const t = R.$("#sk-trekk");
    if (t) t.textContent = sp.trekk;
    const tips = R.$(".sk-tips");
    if (tips && sp.trekk && tips.textContent) tips.textContent = "";
  }

  // The biggest square board that fits the space it has.
  function tilpass() {
    const f = R.$(".sk-flate");
    const b = R.$(".sk-brett");
    if (!f || !b) return;
    const s = Math.floor(Math.min(f.clientWidth - 6, f.clientHeight - 6, 560));
    b.style.setProperty("--s", Math.max(150, s) + "px");
  }
  window.addEventListener("resize", () => R.S && R.S.skjerm === "spill" && tilpass());

  // ---------- Moves ----------

  function flytt(S, plass, stille) {
    const sp = S.spill;
    if (!sp || sp.ferdig || las) return false;
    const ny = M.flytt(sp.n, sp.n, sp.brett, plass);
    if (!ny) {
      if (!stille) {
        R.lyd.tone(220, 0, 0.08, "triangle", 0.06, 180);
        const el = R.$(`.sk-bit[data-v="${sp.brett[plass]}"]`);
        if (el && !R.rolig()) {
          el.classList.remove("nei");
          void el.offsetWidth;
          el.classList.add("nei");
        }
      }
      return false;
    }
    sp.trekk += M.antallFlyttet(sp.n, sp.brett, plass);
    sp.brett = ny;
    if (klokkeFra == null) startKlokke(S);
    R.lyd.tone(520 + Math.random() * 60, 0, 0.05, "triangle", 0.06, 440);
    R.vibrer(6);
    oppdater(S);
    if (M.lost(sp.brett)) return vinn(S), true;
    R.lagre();
    return true;
  }

  function vinn(S) {
    const sp = S.spill;
    stoppKlokke(S);
    sp.ferdig = true;
    const sek = Math.max(1, Math.round(sp.tid / 1000));
    const k = nokkel(sp);
    const gml = S.rekord[k] || null;
    const res = { sek, trekk: sp.trekk, forste: !gml };
    if (gml) {
      res.nyTrekk = sp.trekk < gml.trekk;
      res.nyTid = sek < gml.tid;
      res.gml = { trekk: gml.trekk, tid: gml.tid };
    }
    S.rekord[k] = { trekk: gml ? Math.min(gml.trekk, sp.trekk) : sp.trekk, tid: gml ? Math.min(gml.tid, sek) : sek, antall: (gml ? gml.antall : 0) + 1 };
    S.sist = { n: sp.n, modus: sp.modus, trekk: sp.trekk, sek };
    sp.resultat = res;
    if (sp.n >= 4) R.merke("klassiker-skyveren");
    R.statistikk("ferdig", { n: sp.n, modus: sp.modus, trekk: sp.trekk, sek });
    R.lagre();
    las = true;
    R.lyd.riktig();
    R.vibrer([30, 50, 30, 50, 120]);
    const brett = R.$(".sk-brett");
    if (brett && !R.rolig()) brett.classList.add("vant");
    const fortsatt = R.vakt();
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 700 : 1500,
    );
  }

  // Keyboard: the arrows push the piece next to the empty square that way.
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    const sp = S && S.spill;
    if (!S || S.skjerm !== "spill" || !sp || sp.ferdig || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    const PIL = { ArrowUp: "opp", ArrowDown: "ned", ArrowLeft: "venstre", ArrowRight: "hoyre" };
    if (!PIL[e.key]) return;
    e.preventDefault();
    const plass = M.pilPlass(sp.n, sp.n, sp.brett, PIL[e.key]);
    if (plass < 0) return R.lyd.tone(220, 0, 0.06, "triangle", 0.05, 180);
    const x = sp.brett[plass];
    if (flytt(S, plass, true) && !sp.ferdig) R.si(R.t("Bit {x} flyttet. {n} trekk.", { x, n: sp.trekk }));
  });

  function tikk() {
    const sp = R.S && R.S.spill;
    const el = R.$("#sk-tid");
    if (sp && el) el.textContent = visTid(tidMs(sp));
  }
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill) return;
    if (document.hidden) {
      stoppKlokke(S);
      R.lagre();
    } else startKlokke(S);
  });

  // ---------- Screens ----------

  function gyldig(sp) {
    if (!sp || typeof sp !== "object" || !STR.includes(sp.n) || !["tall", "bilde"].includes(sp.modus)) return false;
    const N = sp.n * sp.n;
    const ok = (b) => Array.isArray(b) && b.length === N && new Set(b).size === N && b.every((x) => Number.isInteger(x) && x >= 0 && x < N);
    if (!ok(sp.brett) || !ok(sp.start) || !M.losbar(sp.n, sp.n, sp.brett)) return false;
    if (sp.modus === "bilde" && !(G && G.finnes(sp.bilde))) return false;
    sp.trekk = Math.max(0, Math.floor(Number(sp.trekk) || 0));
    sp.tid = Math.max(0, Number(sp.tid) || 0);
    sp.ferdig = M.lost(sp.brett);
    sp.tallPa = sp.tallPa !== false;
    if (sp.ferdig && !sp.resultat) sp.resultat = { sek: Math.max(1, Math.round(sp.tid / 1000)), trekk: sp.trekk };
    return true;
  }

  // The finished picture (or numbers), small: for the peek sheet and the result.
  function fasitHtml(sp, klasse) {
    const n = sp.n;
    if (sp.modus === "bilde") return `<span class="sk-fasit ${klasse || ""}" style="--bf:${G.farge(sp.bilde)}">${G.svg(sp.bilde)}</span>`;
    const ruter = Array.from({ length: n * n }, (_, i) => `<i>${i < n * n - 1 ? i + 1 : ""}</i>`).join("");
    return `<span class="sk-fasit sk-fasit-tall ${klasse || ""}" style="--n:${n}">${ruter}</span>`;
  }

  R.start({
    id: "skyveren",
    versjon: 1,
    pagar: (S) => iGang(S),

    tilstand: () => ({
      oppsett: { n: 4, modus: "tall", tallPa: true },
      rekord: {},
      sist: null,
      sistBilde: null,
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ n: 4, modus: "tall", tallPa: true }, S.oppsett));
      if (!STR.includes(o.n)) o.n = 4;
      if (!["tall", "bilde"].includes(o.modus)) o.modus = "tall";
      o.tallPa = o.tallPa !== false;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      for (const k of Object.keys(S.rekord)) {
        const r = S.rekord[k];
        if (!/^(tall|bilde)-[345]$/.test(k) || !r || !(r.trekk > 0) || !(r.tid > 0)) delete S.rekord[k];
      }
      if (S.sist && !(S.sist.trekk > 0 && STR.includes(S.sist.n))) S.sist = null;
      if (S.spill && !gyldig(S.spill)) S.spill = null;
      const sp = S.spill;
      if (!sp && ["spill", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (sp && sp.ferdig && S.skjerm === "spill") S.skjerm = "slutt";
      if (sp && !sp.ferdig && S.skjerm === "slutt") S.skjerm = "spill";
    },

    regler: {
      intro: R.t("Skyv bitene rundt på brettet til de står i riktig rekkefølge – med det tomme feltet nederst til høyre."),
      steg: [
        [R.t("Skyv"), R.t("Trykk på en bit ved siden av det tomme feltet, så glir den inn. Trykker du på en bit lenger borte i samme rad eller kolonne, skyves hele rekka.")],
        [R.t("Ordne"), R.t("Med tall: 1, 2, 3 … bortover, rad for rad. Med bilde: sett sammen figuren.")],
        [R.t("Ferdig"), R.t("Når alle bitene er på plass, er du ferdig. Færre trekk og kortere tid gir rekord.")],
      ],
      tips: [
        R.t("Løs den øverste raden først, så den neste. De to siste radene løser du kolonne for kolonne."),
        R.t("Ikke vær redd for å skyve bort biter som står riktig – de kommer tilbake."),
        R.t("Hver eneste blanding kan løses. Det er sjekket før du får den."),
        R.t("Trykk på «Se fasit» for å se hvordan det skal bli."),
        R.t("Med tastatur: piltastene skyver biten ved siden av det tomme feltet den veien."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const o = S.oppsett;
          const sp = S.spill;
          const pagar = iGang(S);
          const rek = STR.flatMap((n) => ["tall", "bilde"].map((m) => [n, m])).filter(([n, m]) => S.rekord[`${m}-${n}`]);
          const rekHtml = rek.length
            ? `<section class="sk-rekorder" aria-label="${esc(R.t("Dine rekorder"))}"><p class="etikett">${esc(R.t("Dine rekorder"))}</p><ul>${rek
                .map(([n, m]) => {
                  const r = S.rekord[`${m}-${n}`];
                  return `<li><b>${storrelse(n)} ${esc(MODUSNAVN[m])}</b> ${esc(R.t("{n} trekk", { n: r.trekk }))} · ${visTid(r.tid * 1000)}</li>`;
                })
                .join("")}</ul>${S.sist ? `<p class="sk-sist">${esc(R.t("Sist: {str} på {n} trekk og {tid}", { str: storrelse(S.sist.n), n: S.sist.trekk, tid: visTid(S.sist.sek * 1000) }))}</p>` : ""}</section>`
            : "";
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Én tom rute. Femten biter."))}<br><em>${esc(R.t("Skyv dem på plass."))}</em>`,
              knapperHtml:
                R.ui.startKnapper({
                  pagar,
                  fortsettTekst: pagar ? R.t("Fortsett · {str} · {n} trekk", { str: storrelse(sp.n), n: sp.trekk }) : "",
                  startTekst: o.modus === "bilde" ? R.t("Skyv · {str} · bilde", { str: storrelse(o.n) }) : R.t("Skyv · {str} · tall", { str: storrelse(o.n) }),
                }) + R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "oppsett"), R.ui.lenke(R.t("Slik spiller du"), "regler")),
              merker: [
                ["3–5", R.t("størrelser")],
                ["2", R.t("spillemåter")],
                ["0", R.t("reklame")],
              ],
            }) + rekHtml
          );
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const bilder = tilgjengelige();
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Tall eller bilde?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "tall", ikon: "🔢", tittel: R.t("Tall"), tekst: R.t("1, 2, 3 … i rekkefølge") },
                  { v: "bilde", ikon: "🖼️", tittel: R.t("Bilde"), tekst: R.t("Sett sammen en av gjengen"), av: !bilder.length },
                ],
                o.modus,
              )}
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor stort brett?"))}</h2>
              ${R.ui.fliser(
                "storrelse",
                STR.map((n) => ({ v: n, tittel: storrelse(n), tekst: S.rekord[`${o.modus}-${n}`] ? R.t("Rekord {n} trekk", { n: S.rekord[`${o.modus}-${n}`].trekk }) : NIVA[n] })),
                o.n,
              )}
            </section>
            ${o.modus === "bilde" ? `<section class="seksjon">${R.ui.bryter("tallpa", o.tallPa, R.t("Små tall på bitene"), R.t("Gjør bildet lettere å sette sammen"))}</section>` : ""}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Skyv bitene på plass"))}</h1>
            <div class="sk-spill">
              <div class="sk-hud">
                <span class="sk-stat"><small>${esc(R.t("Størrelse"))}</small><b>${storrelse(sp.n)}</b></span>
                <span class="sk-stat"><small>${esc(R.t("Tid"))}</small><b id="sk-tid">${visTid(tidMs(sp))}</b></span>
                <span class="sk-stat"><small>${esc(R.t("Trekk"))}</small><b id="sk-trekk">${sp.trekk}</b></span>
              </div>
              <div class="sk-flate">${brettHtml(sp)}</div>
              <div class="sk-side">
                <p class="sk-tips" aria-hidden="true">${esc(sp.trekk ? "" : R.t("Trykk på en bit ved siden av det tomme feltet."))}</p>
                ${R.ui.dokk(R.ui.knapp2(R.t("Se fasit"), "fasit", { ikon: "👀" }), R.ui.lenkerad(R.ui.lenke(R.t("Bland på nytt"), "bland")))}
              </div>
            </div>`;
        },
        etter(S, rot) {
          oppdater(S);
          tilpass();
          const f = R.$(".sk-flate", rot);
          if (f && typeof ResizeObserver === "function") {
            const obs = new ResizeObserver(() => tilpass());
            obs.observe(f);
            R.vedForlat(() => obs.disconnect());
          }
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || sp.ferdig) return R.gaTil(sp ? "slutt" : "hjem");
          las = false;
          document.documentElement.classList.add("sk-fast");
          R.holdVaken();
          startKlokke(S);
          const id = setInterval(tikk, 250);
          R.vedForlat(() => clearInterval(id));
        },
        ut(S) {
          stoppKlokke(S);
          document.documentElement.classList.remove("sk-fast");
          R.slippVaken();
        },
      },

      slutt: {
        tittel: () => NAVN(),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { sek: Math.round(sp.tid / 1000), trekk: sp.trekk };
          const str = storrelse(sp.n);
          const alle = `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`;
          const ny = r.nyTrekk || r.nyTid;
          let linje;
          if (r.forste) linje = R.t("Første gang på {str} – nå har du en rekord å slå!", { str });
          else if (r.nyTrekk && r.nyTid) linje = R.t("Ny rekord på både trekk og tid!");
          else if (r.nyTrekk) linje = R.t("Ny rekord: færre trekk enn noen gang. Forrige: {n}.", { n: r.gml.trekk });
          else if (r.nyTid) linje = R.t("Ny rekord: raskere enn noen gang. Forrige: {tid}.", { tid: visTid(r.gml.tid * 1000) });
          else linje = R.t("Rekordene dine på {str}: {n} trekk og {tid}.", { str, n: S.rekord[nokkel(sp)].trekk, tid: visTid(S.rekord[nokkel(sp)].tid * 1000) });
          const bilde = sp.modus === "bilde" && bildeNavn(sp.bilde);
          return `
            ${R.ui.banner({ etikett: `${str} · ${MODUSNAVN[sp.modus]}`, tittel: ny ? R.t("Ny rekord!") : R.t("Godt jobba!"), tekst: bilde ? R.t("Det var {navn}!", { navn: bilde }) : "", stemning: "jubel" })}
            <div class="sk-resultat">
              <div class="sk-tall-boks${r.nyTrekk ? " ny" : ""}"><b>${r.trekk}</b><span>${esc(R.t("trekk"))}</span></div>
              <div class="sk-tall-boks${r.nyTid ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>${esc(R.t("tid"))}</span></div>
            </div>
            <p class="hjelp">${esc(linje)}</p>
            ${fasitHtml(sp, "sk-stor")}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.knapp2(R.t("Del resultatet"), "del"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "oppsett"), alle))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || !sp.ferdig) return R.gaTil(sp ? "spill" : "hjem");
          R.lyd.fanfare();
          R.konfetti();
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && R.visInstallTips(), 2400);
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S))) || !fortsatt()) return;
        nyttSpill(S);
        R.gaTil("spill");
      },
      fortsett: (el, e, S) => R.gaTil(S.spill ? (S.spill.ferdig ? "slutt" : "spill") : "hjem"),
      oppsett: () => R.gaTil("oppsett"),
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "bilde" ? "bilde" : "tall";
        R.vis();
      },
      storrelse(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.n = STR.includes(n) ? n : 4;
        R.vis();
      },
      tallpa(el, e, S) {
        S.oppsett.tallPa = !S.oppsett.tallPa;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang(S))) || !fortsatt()) return;
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      async bland(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft(R.t("Bland på nytt?"), R.t("Bitene blandes, og trekk og tid starter fra null."), R.t("Bland"), R.t("Spill videre"))) || !fortsatt()) return;
        stoppKlokke(S);
        nyttSpill(S);
        R.lyd.sveip();
        R.vis();
      },
      flytt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const plass = sp.brett.indexOf(Number(el.dataset.v));
        const x = Number(el.dataset.v);
        if (flytt(S, plass) && !sp.ferdig && e && e.detail === 0) R.si(R.t("Bit {x} flyttet. {n} trekk.", { x, n: sp.trekk }));
      },
      fasit(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.ark(`<h2>${esc(R.t("Slik skal det bli"))}</h2>${fasitHtml(sp, "sk-stor")}<div class="knapprad">${R.ui.knapp(R.t("Lukk"), "lukk-ark")}</div>`);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const r = sp.resultat;
        const str = storrelse(sp.n);
        const tid = visTid(r.sek * 1000);
        const tekst = `🧩 ${NAVN()} · ${str} · ${R.t("{n} trekk", { n: r.trekk })} · ${tid}. ${R.t("Klarer du det på færre trekk?")}`;
        R.del(R.t("{navn} – skyvepuslespill", { navn: NAVN() }), tekst, ADRESSE, { kort: { tittel: NAVN(), linjer: [R.t("{n} trekk", { n: r.trekk }), `${str} · ${tid}`] } });
      },
    }),
  });

  window.Skyveren = motor;
})();
