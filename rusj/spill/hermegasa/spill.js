/* Hermegåsa — follow the pattern. The goose shows a row of coloured shapes, each with its own tone;
   copy it, and the row grows by one. Every shape has its own form as well as its colour (circle,
   star, square, triangle, heart, diamond), so the game works without telling colours apart, and
   without reading. A slip is never punished with a sound: the goose shows the right one, and on the
   easier levels there are spare chances (feathers) to see the row again. Alone: beat your record.
   Together (2–4 on one phone): everybody gets a go, the longest row wins.
   The rules at the top are pure functions; test/hermegasa.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit needed) ----------

  const Rusj = window.Rusj && typeof window.Rusj.t === "function" ? window.Rusj : { t: (k) => k };
  // The pads, in their places on the board: colour, shape, tone (Hz). Four on Lett and Middels, six on Vanskelig.
  const BRIKKER = [
    { id: "sirkel", navn: Rusj.t("Rød sirkel"), farge: "#ff5a6e", dyp: "#c22c45", tone: 392 },
    { id: "stjerne", navn: Rusj.t("Gul stjerne"), farge: "#ffd23f", dyp: "#c99a10", tone: 523.25 },
    { id: "firkant", navn: Rusj.t("Blå firkant"), farge: "#4fb2ff", dyp: "#1f74c2", tone: 659.25 },
    { id: "trekant", navn: Rusj.t("Grønn trekant"), farge: "#3ed68a", dyp: "#1f9a5c", tone: 783.99 },
    { id: "hjerte", navn: Rusj.t("Lilla hjerte"), farge: "#b88cff", dyp: "#7c4fd6", tone: 880 },
    { id: "rombe", navn: Rusj.t("Oransje rombe"), farge: "#ff9a3d", dyp: "#c9661a", tone: 1046.5 },
  ];
  // pa/av: how long a pad is lit and the pause after it (ms) in the first round; it gets a little
  // quicker as the row grows, never below min. sjanser: spare chances to see the row again.
  const NIVAER = {
    1: { navn: Rusj.t("Lett"), tekst: Rusj.t("Fire brikker, rolig tempo og to ekstra sjanser"), brikker: 4, pa: 720, av: 260, min: 480, sjanser: 2 },
    2: { navn: Rusj.t("Middels"), tekst: Rusj.t("Fire brikker, litt raskere og én ekstra sjanse"), brikker: 4, pa: 540, av: 200, min: 340, sjanser: 1 },
    3: { navn: Rusj.t("Vanskelig"), tekst: Rusj.t("Seks brikker, raskt tempo og ingen ekstra sjanse"), brikker: 6, pa: 440, av: 160, min: 270, sjanser: 0 },
  };
  const MAKS = 99; // the longest row there is

  const Regler = {
    // The whole row for a game, from a seed: never three of the same in a row (that is no fun to
    // count). rng: a function that gives numbers from 0 to 1.
    rekke(n, rng, lengde = MAKS) {
      const ut = [];
      while (ut.length < lengde) {
        let b = Math.floor(rng() * n);
        const l = ut.length;
        if (l >= 2 && ut[l - 1] === ut[l - 2] && b === ut[l - 1]) b = (b + 1 + Math.floor(rng() * (n - 1))) % n;
        ut.push(b);
      }
      return ut;
    },
    // A tap while copying round `runde` (the row's first `runde` pads), at place `steg`.
    // Returns "riktig" (go on), "runde" (the whole round is copied) or "feil".
    trykk(rekke, runde, steg, brikke) {
      if (brikke !== rekke[steg]) return "feil";
      return steg + 1 >= runde ? "runde" : "riktig";
    },
    // The timing of a round: a little quicker for every pad in the row.
    fart(niva, runde) {
      const n = NIVAER[niva] || NIVAER[1];
      const f = Math.pow(0.96, Math.max(0, runde - 1));
      return { pa: Math.max(n.min, Math.round(n.pa * f)), av: Math.max(Math.round(n.min * 0.36), Math.round(n.av * f)) };
    },
  };

  const R = window.Rusj;
  if (!R) {
    window.Hermegasa = { BRIKKER, NIVAER, Regler, MAKS };
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "hermegasa") + "/";
  const ROS = [R.t("Bra!"), R.t("Supert!"), R.t("Ja!"), R.t("Flott!"), R.t("Godt husket!"), R.t("Knallbra!")];
  const STOR_ROS = [R.t("Wow!"), R.t("For en hukommelse!"), R.t("Gåsebra!")];
  window.Hermegasa = { BRIKKER, NIVAER, Regler, MAKS };

  // Shapes in a 100 × 100 box.
  const FORMER = {
    sirkel: '<circle cx="50" cy="50" r="31"/>',
    stjerne: '<path d="M50 13 L60.6 36.5 L86 39.3 L67 56.5 L72.3 81.7 L50 68.9 L27.7 81.7 L33 56.5 L14 39.3 L39.4 36.5Z"/>',
    firkant: '<rect x="21" y="21" width="58" height="58" rx="9"/>',
    trekant: '<path d="M50 15 L86 80 L14 80Z"/>',
    hjerte: '<path d="M50 84 C46 80 13 60 13 36 C13 23 23 15 34 15 C41 15 47 19 50 26 C53 19 59 15 66 15 C77 15 87 23 87 36 C87 60 54 80 50 84Z"/>',
    rombe: '<path d="M50 11 L86 50 L50 89 L14 50Z"/>',
  };
  const form = (b) => `<svg class="hg-form" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${FORMER[BRIKKER[b].id]}</svg>`;

  const nivaAv = (n) => NIVAER[n] || NIVAER[1];
  const erSammen = (sp) => sp.modus === "sammen";
  const hvem = (sp) => (erSammen(sp) ? R.navn(sp.spiller) : "");

  // ---------- State ----------
  // S.spill: { modus, niva, antall, spiller, frø: [per player], poeng: [per player, null until done],
  //   runde (length of the row now), steg (pads copied in this round), sjanser, fase: "vis" | "din" | "slutt" }
  let rekke = [];
  let rekkeFor = "";
  function rekkeNa(sp) {
    const k = sp.niva + ":" + sp.fro[sp.spiller];
    if (rekkeFor !== k) {
      rekke = Regler.rekke(nivaAv(sp.niva).brikker, R.rng(sp.fro[sp.spiller] >>> 0));
      rekkeFor = k;
    }
    return rekke;
  }

  // For the tests: the pads of the round that is played now.
  window.Hermegasa.rad = () => (R.S && R.S.spill ? rekkeNa(R.S.spill).slice(0, R.S.spill.runde) : []);

  function nyttSpill(S) {
    const o = S.oppsett;
    const antall = o.modus === "sammen" ? R.klamp(S.antall || 2, 2, 4) : 1;
    S.spill = {
      modus: o.modus === "sammen" ? "sammen" : "alene",
      niva: NIVAER[o.niva] ? o.niva : 1,
      antall,
      spiller: 0,
      fro: Array.from({ length: antall }, () => R.nyttFro() >>> 0),
      poeng: Array.from({ length: antall }, () => null),
      ferdig: false,
    };
    startTur(S.spill);
    R.statistikk("start", { modus: S.spill.modus, niva: S.spill.niva, spillere: antall });
  }
  // A player's go begins: one pad to copy.
  function startTur(sp) {
    sp.runde = 1;
    sp.steg = 0;
    sp.sjanser = nivaAv(sp.niva).sjanser;
    sp.fase = "vis";
    sp.slutt = null;
  }

  // ---------- Showing the row ----------

  let visNr = 0; // a newer show (or leaving the screen) stops the one that runs
  let las = true;
  const brikkeEl = (b) => R.$(`.hg-brikke[data-v="${b}"]`);

  function spillTone(b, ms) {
    R.lyd.tone(BRIKKER[b].tone, 0, Math.min(0.6, ms / 1000 + 0.08), "sine", 0.24);
  }
  function lys(b, ms) {
    const el = brikkeEl(b);
    if (!el) return;
    el.classList.add("lyser");
    setTimeout(() => el.classList.remove("lyser"), ms);
  }

  // The goose's mood (jubel, hmm) and what it says in the bubble under it.
  function gas(klasse, tekst) {
    const g = R.$(".hg-gas");
    const midt = R.$(".hg-midt");
    if (!g || !midt) return;
    const boble = midt.querySelector(".hg-boble");
    if (tekst != null) boble.textContent = tekst;
    g.classList.remove("jubel", "hmm");
    void g.offsetWidth;
    const k = (klasse || "").split(" ").filter(Boolean);
    midt.classList.toggle("snakker", k.includes("snakker"));
    g.classList.add(...k.filter((x) => x === "jubel" || x === "hmm"));
  }

  // The goose nods with every pad it shows.
  function nikk() {
    const f = R.$(".hg-gas .figur-ramme");
    if (!f || R.rolig()) return;
    f.classList.remove("nikk");
    void f.offsetWidth;
    f.classList.add("nikk");
  }

  function hud(S) {
    const sp = S.spill;
    const r = R.$("#hg-runde");
    if (r) r.textContent = String(sp.runde);
    const p = R.$(".hg-prikker");
    if (p) p.innerHTML = prikkerHtml(sp);
    const f = R.$(".hg-fjaer");
    if (f) f.outerHTML = fjaerHtml(sp);
  }
  // How far into the round: a dot per pad, as a number when the row is long.
  const prikkerHtml = (sp) =>
    sp.runde > 16
      ? `<b class="hg-tall">${sp.steg} / ${sp.runde}</b>`
      : Array.from({ length: sp.runde }, (_, i) => `<i class="${i < sp.steg ? "pa" : ""}"></i>`).join("");
  const fjaerHtml = (sp) => {
    const n = nivaAv(sp.niva).sjanser;
    if (!n) return '<span class="hg-fjaer" hidden></span>';
    return `<span class="hg-fjaer" role="img" aria-label="${esc(R.t("Ekstra sjanser: {n}", { n: sp.sjanser }))}">${Array.from({ length: n }, (_, i) => `<b class="${i < sp.sjanser ? "" : "brukt"}">🪶</b>`).join("")}</span>`;
  };

  // The goose shows the first `runde` pads of the row; then it is the player's turn.
  async function vis(S, forst) {
    const sp = S.spill;
    if (!sp || sp.ferdig || sp.fase === "slutt") return;
    const mitt = ++visNr;
    const fortsatt = R.vakt();
    const stopp = () => mitt !== visNr || !fortsatt() || S.spill !== sp;
    las = true;
    sp.fase = "vis";
    sp.steg = 0;
    R.lagre();
    R.$(".hg-brett") && R.$(".hg-brett").classList.add("viser");
    hud(S);
    gas("snakker", forst ? R.t("Se på meg!") : R.t("Se godt etter!"));
    R.si(R.t("Gåsa viser {n}. Se godt etter.", { n: sp.runde }));
    await R.vent(forst ? 900 : 650);
    if (stopp()) return;
    const rad = rekkeNa(sp);
    const { pa, av } = Regler.fart(sp.niva, sp.runde);
    for (let i = 0; i < sp.runde; i++) {
      if (stopp()) return;
      lys(rad[i], pa);
      spillTone(rad[i], pa);
      nikk();
      await R.vent(pa + av);
    }
    if (stopp()) return;
    sp.fase = "din";
    R.lagre();
    las = false;
    const brett = R.$(".hg-brett");
    if (brett) brett.classList.remove("viser");
    gas("snakker", R.t("Din tur!"));
    R.si(R.t("Din tur. Trykk på brikkene i samme rekkefølge.") + " " + rad.slice(0, sp.runde).map((b) => BRIKKER[b].navn).join(", ") + ".");
  }

  // ---------- A tap ----------

  function trykk(S, b) {
    const sp = S.spill;
    if (!sp || sp.ferdig || las || sp.fase !== "din") return;
    if (!(b >= 0 && b < nivaAv(sp.niva).brikker)) return;
    const rad = rekkeNa(sp);
    const svar = Regler.trykk(rad, sp.runde, sp.steg, b);
    if (svar === "feil") return feil(S, b);
    lys(b, 260);
    spillTone(b, 260);
    R.vibrer(6);
    sp.steg += 1;
    if (svar === "riktig") {
      R.lagre();
      hud(S);
      return;
    }
    // The whole round is copied: praise, and one more.
    las = true;
    const husket = sp.runde;
    sp.runde = Math.min(MAKS, sp.runde + 1);
    sp.steg = 0;
    sp.fase = "vis";
    R.lagre();
    const fortsatt = R.vakt();
    const brett = R.$(".hg-brett");
    setTimeout(() => {
      if (!fortsatt()) return;
      hud(S);
      const rekord = !erSammen(sp) && husket > (S.rekorder[sp.niva] || 0);
      const milepael = husket % 5 === 0;
      if (milepael || rekord) {
        R.lyd.fanfare();
        R.vibrer([20, 40, 20]);
      } else R.lyd.riktig();
      gas("snakker jubel", rekord && (S.rekorder[sp.niva] || 0) > 0 ? R.t("Ny rekord!") : milepael ? R.velg(STOR_ROS) : R.velg(ROS));
      if (brett && !R.rolig()) {
        brett.classList.remove("bolge");
        void brett.offsetWidth;
        brett.classList.add("bolge");
      }
      R.si(R.t("Riktig! Du husket {n}.", { n: husket }));
      if (husket >= 10 && !erSammen(sp)) R.merke("hermegasa-ti");
      setTimeout(() => fortsatt() && vis(S), 1100);
    }, 280);
  }

  // A slip: never a buzzer. The right pad glows; a spare chance shows the row again.
  function feil(S, b) {
    const sp = S.spill;
    const rad = rekkeNa(sp);
    const riktig = rad[sp.steg];
    las = true;
    const fortsatt = R.vakt();
    const el = brikkeEl(b);
    if (el && !R.rolig()) {
      el.classList.remove("rist");
      void el.offsetWidth;
      el.classList.add("rist");
    }
    R.vibrer(15);
    setTimeout(() => {
      if (!fortsatt()) return;
      lys(riktig, 900);
      spillTone(riktig, 500);
      const r = brikkeEl(riktig);
      if (r) r.classList.add("riktig");
      setTimeout(() => r && r.classList.remove("riktig"), 1300);
    }, 250);
    if (sp.sjanser > 0) {
      sp.sjanser -= 1;
      sp.steg = 0;
      sp.fase = "vis";
      R.lagre();
      hud(S);
      gas("snakker hmm", R.t("Oi! Det var den der."));
      R.si(R.t("Det var {riktig}. Gåsa viser rekka en gang til.", { riktig: BRIKKER[riktig].navn }));
      setTimeout(() => {
        if (!fortsatt()) return;
        hud(S);
        vis(S);
      }, 1900);
      return;
    }
    // The go is over: the rows that were copied all the way count.
    const husket = sp.runde - 1;
    sp.poeng[sp.spiller] = husket;
    sp.fase = "slutt";
    gas("snakker hmm", R.t("Oi! Det var den der."));
    R.si(R.t("Det var {riktig}. Du husket {n}.", { riktig: BRIKKER[riktig].navn, n: husket }));
    R.lagre();
    setTimeout(() => fortsatt() && ferdigTur(S), 1800);
  }

  // A player's go is over: the next player, or the end.
  function ferdigTur(S) {
    const sp = S.spill;
    const neste = sp.poeng.findIndex((p) => p == null);
    if (neste >= 0) {
      sp.spiller = neste;
      startTur(sp);
      R.lagre();
      return R.gaTil("tur");
    }
    sp.ferdig = true;
    if (!erSammen(sp)) {
      const n = sp.poeng[0];
      const gml = S.rekorder[sp.niva] || 0;
      sp.resultat = { n, gml, ny: n > gml && gml > 0, forste: !gml && n > 0 };
      S.rekorder[sp.niva] = Math.max(gml, n);
      S.sist = { niva: sp.niva, n };
    } else {
      R.kveld.registrer(sp.poeng.map((p, i) => ({ i, poeng: p })));
    }
    R.statistikk("ferdig", { modus: sp.modus, niva: sp.niva, spillere: sp.antall, best: Math.max(...sp.poeng) });
    R.lagre();
    R.gaTil("slutt");
  }

  // ---------- Board size ----------

  // Portrait: the score on top, the goose in the middle, the pads as big as the width allows while
  // the goose keeps at least MIDT px. A phone on its side: the pads fill the right column.
  const MIDT = 130;
  function tilpass() {
    const flate = R.$(".hg-flate");
    const brett = R.$(".hg-brett");
    const spill = R.$(".hg-spill");
    if (!flate || !brett || !spill) return;
    const n = Number(brett.dataset.n);
    const w = flate.clientWidth;
    const topp = spill.getBoundingClientRect().top + window.scrollY;
    const side = getComputedStyle(spill).display === "grid";
    const hud = R.$(".hg-hud");
    // The middle needs room for the goose, its bubble and the dots (10 px gaps).
    const midt = Array.from(spill.querySelectorAll(".hg-gas, .hg-boble, .hg-prikker")).reduce((sum, el) => sum + el.offsetHeight + 10, 0);
    // Under the pads: their shadow and the bottom padding.
    const h = window.innerHeight - topp - 26 - (side ? 0 : (hud ? hud.offsetHeight : 0) + Math.max(MIDT, midt) + 24);
    if (!w || h <= 0) return;
    const gap = w < 340 ? 10 : 14;
    // Six pads: 2 × 3 when tall, 3 × 2 when wide.
    const valg = n === 4 ? [[2, 2]] : [[2, 3], [3, 2]];
    let best = null;
    for (const [k, r] of valg) {
      const s = Math.min((w - gap * (k - 1)) / k, (h - gap * (r - 1)) / r, 200);
      if (!best || s > best.s) best = { k, s };
    }
    brett.style.setProperty("--hg-kol", best.k);
    brett.style.setProperty("--hg-str", Math.max(70, Math.floor(best.s)) + "px");
    brett.style.setProperty("--hg-gap", gap + "px");
  }
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass();
  });
  // A hidden page stops the show; it starts again from the beginning when the page is back.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || S.spill.ferdig) return;
    if (document.hidden) {
      visNr++;
      if (S.spill.fase === "vis") las = true;
    } else if (S.spill.fase === "vis") setTimeout(() => R.S.skjerm === "spill" && vis(R.S), 400);
  });

  // Keys 1–6 tap the pads (in the order of the board).
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const n = Number(e.key);
    if (!(n >= 1 && n <= nivaAv(S.spill.niva).brikker)) return;
    e.preventDefault();
    trykk(S, n - 1);
  });

  // ---------- Markup ----------

  function brettHtml(sp) {
    const n = nivaAv(sp.niva).brikker;
    return `<div class="hg-brett viser" data-n="${n}" role="group" aria-label="${esc(R.t("Brikkene"))}">${BRIKKER.slice(0, n)
      .map(
        (b, i) => `<button class="hg-brikke" data-h="trykk" data-v="${i}" data-stille style="--bf:${b.farge}; --bd:${b.dyp}" aria-label="${esc(b.navn)}" aria-keyshortcuts="${i + 1}">${form(i)}</button>`,
      )
      .join("")}</div>`;
  }

  const hvemLinje = (sp) => (erSammen(sp) ? `<span class="hg-hvem">${R.avatar(sp.spiller)}<b>${esc(hvem(sp))}</b></span>` : "");

  function delTekst(S) {
    const sp = S.spill;
    return R.t("Hermegåsa 🪿 Jeg husket {n} på rad på {niva}! Klarer du flere?", { n: sp.poeng[0], niva: nivaAv(sp.niva).navn.toLowerCase() });
  }

  // ---------- Start ----------

  R.start({
    id: "hermegasa",
    versjon: 1,
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "alene", niva: 1 },
      rekorder: {},
      sist: null,
      spill: null,
    }),

    lastet(S) {
      const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      S.oppsett = { modus: o.modus === "sammen" ? "sammen" : "alene", niva: NIVAER[o.niva] ? o.niva : 1 };
      S.antall = R.klamp(Math.floor(Number(S.antall)) || 2, 2, 4);
      const rek = S.rekorder && typeof S.rekorder === "object" ? S.rekorder : {};
      S.rekorder = {};
      for (const n of [1, 2, 3]) if (heltall(rek[n], 1, MAKS)) S.rekorder[n] = rek[n];
      S.sist = S.sist && NIVAER[S.sist.niva] && heltall(S.sist.n, 0, MAKS) ? { niva: S.sist.niva, n: S.sist.n } : null;
      const sp = S.spill;
      if (sp) {
        const ok =
          ["alene", "sammen"].includes(sp.modus) &&
          NIVAER[sp.niva] &&
          heltall(sp.antall, 1, 4) &&
          (sp.modus === "sammen") === sp.antall > 1 &&
          Array.isArray(sp.fro) &&
          sp.fro.length === sp.antall &&
          sp.fro.every((f) => Number.isFinite(f)) &&
          Array.isArray(sp.poeng) &&
          sp.poeng.length === sp.antall &&
          sp.poeng.every((p) => p == null || heltall(p, 0, MAKS)) &&
          heltall(sp.spiller, 0, sp.antall - 1) &&
          heltall(sp.runde, 1, MAKS) &&
          heltall(sp.sjanser, 0, 9);
        if (!ok) S.spill = null;
        else {
          sp.ferdig = !!sp.ferdig && sp.poeng.every((p) => p != null);
          // A reload in the middle of a round: the goose shows the row again from the start.
          if (!sp.ferdig && sp.fase !== "slutt") {
            sp.fase = "vis";
            sp.steg = 0;
          }
          if (!sp.ferdig && sp.fase === "slutt" && sp.poeng[sp.spiller] == null) sp.fase = "vis";
        }
      }
      const s = S.spill;
      if (["spill", "tur", "slutt"].includes(S.skjerm) && !s) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && s && !s.ferdig) S.skjerm = "spill";
      if (S.skjerm === "spill" && s && s.ferdig) S.skjerm = "slutt";
      if (S.skjerm === "spill" && s && s.fase === "slutt") S.skjerm = "spill";
    },

    regler: {
      intro: R.t("Gåsa viser en rekke med figurer – hver med sin farge, form og tone. Gjør det samme som gåsa!"),
      steg: [
        [R.t("Se og lytt"), R.t("Brikkene lyser opp én etter én. Følg med på hvilke figurer det er.")],
        [R.t("Herm etter"), R.t("Trykk på de samme brikkene i samme rekkefølge.")],
        [R.t("Rekka vokser"), R.t("Klarer du det, legger gåsa til én til. Hvor lang rekke klarer du å huske?")],
      ],
      tips: [
        R.t("Hver brikke har sin egen form, så du trenger ikke skille fargene: sirkel, stjerne, firkant, trekant, hjerte og rombe."),
        R.t("Si figurene høyt mens gåsa viser dem: «sirkel, stjerne, sirkel …»"),
        R.t("Bommer du på Lett eller Middels, bruker du en fjær, og gåsa viser rekka en gang til."),
        R.t("Sammen: Alle får hver sin tur med en ny rekke. Den som husker lengst, vinner."),
        R.t("Med tastatur: tallene 1–4 (1–6 på Vanskelig) trykker på brikkene."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = !!(sp && !sp.ferdig);
          const rek = [1, 2, 3].filter((n) => S.rekorder[n]).map((n) => `<li><b>${esc(NIVAER[n].navn)}</b> ${esc(R.t("{n} på rad", { n: S.rekorder[n] }))}</li>`);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Se, lytt – og herm etter gåsa."))}<br><em>${esc(R.t("Hvor lang rekke klarer du?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: aktiv,
              fortsettTekst: aktiv ? (erSammen(sp) ? R.t("Fortsett · {navn} sin tur", { navn: hvem(sp) }) : R.t("Fortsett · runde {n}", { n: sp.runde })) : "",
              startTekst: R.t("Start"),
              ekstraHtml:
                R.ui.lenke(R.t("Slik spiller du"), "regler") +
                (rek.length
                  ? `<section class="hg-rekorder" aria-label="${esc(R.t("Rekorder"))}"><p class="etikett">${esc(R.t("Rekorder"))}</p><ul>${rek.join("")}</ul>${
                      S.sist ? `<p class="hg-sist">${esc(R.t("Sist: {n} på rad på {niva}", { n: S.sist.n, niva: NIVAER[S.sist.niva].navn.toLowerCase() }))}</p>` : ""
                    }</section>`
                  : ""),
            }),
            merker: [
              ["1–4", R.t("spillere")],
              ["3", R.t("nivåer")],
              ["0", R.t("reklame")],
            ],
          });
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              ${R.ui.fliser(
                "modus",
                [
                  { v: "alene", tittel: R.t("Alene"), tekst: R.t("Slå rekorden din"), ikon: "🏆" },
                  { v: "sammen", tittel: R.t("Sammen"), tekst: R.t("2–4 bytter på"), ikon: "👥" },
                ],
                o.modus,
              )}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor vanskelig?"))}</h2></div>
              ${R.ui.seg("niva", [1, 2, 3].map((n) => [n, NIVAER[n].navn]), o.niva, { etikett: R.t("Nivå") })}
              <p class="hjelp">${esc(NIVAER[o.niva].tekst)}</p>
              <div class="hg-forhand" aria-hidden="true">${BRIKKER.slice(0, NIVAER[o.niva].brikker)
                .map((b, i) => `<span style="--bf:${b.farge}; --bd:${b.dyp}">${form(i)}</span>`)
                .join("")}</div>
            </section>
            ${o.modus === "sammen" ? R.ui.spillere({ min: 2, max: 4, tittel: R.t("Hvem spiller?"), hjelp: R.t("Alle får hver sin tur. Den som husker lengst rekke, vinner.") }) : ""}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      // Together: pass the phone to the next player.
      tur: {
        tittel: R.t("Sammen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const forrige = sp.poeng.map((p, i) => [p, i]).filter(([p, i]) => p != null && i !== sp.spiller);
          const sist = forrige.length ? forrige[forrige.length - 1] : null;
          return `
            ${sist ? `<p class="hg-forrige">${esc(R.t("{navn} husket {n}!", { navn: R.navn(sist[1]), n: sist[0] }))}</p>` : ""}
            ${R.ui.giTil({ i: sp.spiller, h: "klar", knapp: R.t("Jeg er klar!"), advarsel: R.t("Se godt på gåsa"), ikon: "👀", prikker: [sp.antall, sp.spiller] })}`;
        },
        inn(S) {
          if (!S.spill || S.spill.ferdig) R.gaTil("hjem");
        },
      },

      spill: {
        tittel: (S) => (S.spill ? nivaAv(S.spill.niva).navn : ""),
        tilbake: "hjem",
        liggende: false,
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Herm etter gåsa"))}</h1>
            <div class="hg-spill">
              <div class="hg-hud">
                ${hvemLinje(sp)}
                <span class="hg-stat"><small>${esc(R.t("Rekke"))}</small><b id="hg-runde">${sp.runde}</b></span>
                ${fjaerHtml(sp)}
              </div>
              <div class="hg-midt">
                <div class="hg-gas" aria-hidden="true">${R.figur()}</div>
                <span class="hg-boble" aria-hidden="true"></span>
                <span class="hg-prikker" aria-hidden="true">${prikkerHtml(sp)}</span>
              </div>
              <div class="hg-flate">${brettHtml(sp)}</div>
            </div>`;
        },
        etter() {
          tilpass();
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return R.gaTil("hjem");
          if (sp.ferdig) return R.gaTil("slutt");
          R.holdVaken();
          las = true;
          const fortsatt = R.vakt();
          if (sp.fase === "slutt") {
            setTimeout(() => fortsatt() && ferdigTur(S), 400);
            return;
          }
          setTimeout(() => fortsatt() && vis(S, sp.runde === 1), 350);
        },
        ut() {
          visNr++;
          las = true;
          R.slippVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.spill && erSammen(S.spill) ? R.t("Kåringen") : S.spill ? nivaAv(S.spill.niva).navn : ""),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          if (erSammen(sp)) {
            const rader = sp.poeng.map((p, i) => ({ i, poeng: p }));
            const best = Math.max(...sp.poeng);
            const vinnere = rader.filter((r) => r.poeng === best);
            return `
              <div class="banner aksent">
                ${vinnere.length === 1 ? `<span class="hg-vinner">${R.avatar(vinnere[0].i, "gigant")}<span class="hg-krone" aria-hidden="true">👑</span></span>` : R.ui.figur(null, { stemning: "jubel" })}
                <p class="etikett">${esc(R.t("Lengst rekke: {n}", { n: best }) + " · " + nivaAv(sp.niva).navn)}</p>
                <h1 id="skjerm-tittel">${esc(R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((r) => R.navn(r.i))), n: vinnere.length }))}</h1>
              </div>
              ${sp.antall >= 3 ? R.ui.pall(rader, { enhet: R.t("på rad") }) : ""}
              ${R.ui.poengliste(rader)}
              ${R.ui.flereSpill({ antall: sp.antall })}
              ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
          }
          const r = sp.resultat || { n: sp.poeng[0], gml: 0 };
          const tittel = r.n >= 10 ? R.t("For en hukommelse!") : r.n >= 5 ? R.t("Godt jobba!") : r.n >= 1 ? R.t("Godt husket!") : R.t("Godt forsøk!");
          const linje = r.ny
            ? R.t("Ny rekord! Forrige: {n}", { n: r.gml })
            : r.forste
              ? R.t("Første gang på dette nivået – nå har du en rekord å slå!")
              : r.gml
                ? R.t("Rekorden din på {niva}: {n}", { niva: nivaAv(sp.niva).navn.toLowerCase(), n: Math.max(r.gml, r.n) })
                : R.t("Prøv igjen – gåsa venter!");
          return `
            ${R.ui.banner({ etikett: nivaAv(sp.niva).navn, tittel, klasse: "aksent", stemning: r.n >= 3 || r.ny ? "jubel" : "" })}
            <div class="hg-resultat${r.ny ? " ny" : ""}"><b>${esc(String(r.n))}</b><span>${esc(R.t("på rad"))}</span>${r.ny ? `<i class="hg-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
            <p class="hjelp hg-linje">${esc(linje)}</p>
            ${r.n > 0 ? R.ui.knapp2(R.t("Del resultatet"), "del") : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          // Celebrate in proportion: a fanfare for a winner, a record or a long row; a warm «pling» else.
          if (erSammen(sp) || r.ny || r.n >= 5) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
        },
      },
    },

    handlinger: {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        if ((await R.bekreftNytt(!!(sp && !sp.ferdig), !!sp && !erSammen(sp))) && fortsatt()) R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return R.gaTil("hjem");
        R.gaTil(erSammen(sp) && sp.runde === 1 && sp.fase === "vis" ? "tur" : "spill");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "sammen" ? "sammen" : "alene";
        R.vis();
      },
      niva(el, e, S) {
        const n = Number(el.dataset.v);
        if (NIVAER[n]) S.oppsett.niva = n;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil(erSammen(S.spill) ? "tur" : "spill");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil(erSammen(S.spill) ? "tur" : "spill");
      },
      klar(el, e, S) {
        if (!S.spill || S.spill.ferdig) return R.gaTil("hjem");
        R.gaTil("spill");
      },
      trykk(el, e, S) {
        trykk(S, Number(el.dataset.v));
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig || erSammen(sp)) return;
        R.del(R.app.navn, delTekst(S), DEL_URL, { kort: { tittel: R.app.navn, linjer: [String(sp.poeng[0]), R.t("på rad på {niva}", { niva: nivaAv(sp.niva).navn.toLowerCase() })] } });
      },
    },
  });
})();
